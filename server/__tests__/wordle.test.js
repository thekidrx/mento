const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { createDb } = require('../db');
const { computeFeedback } = require('../wordleLogic');

function setupTestDb() {
  const db = createDb(':memory:');
  const hash = bcrypt.hashSync('testpass', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ).run('ryan', hash, 'Ryan');
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ).run('sam', hash, 'Sam');
  return db;
}

async function loginAgent(app, username) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'testpass' });
  return agent;
}

function todaysWord(db) {
  return db.prepare('SELECT word FROM wordle_days ORDER BY id DESC LIMIT 1').get().word;
}

// Guaranteed distinct from the actual secret word, and both are common
// enough to be in the bundled word lists.
function nonAnswerGuess(word) {
  return word === 'ABOUT' ? 'CRANE' : 'ABOUT';
}

describe('wordle API', () => {
  it('rejects unauthenticated requests', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app).get('/api/wordle/today');
    expect(res.status).toBe(401);
  });

  it('creates a fresh day with no guesses on first request', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const res = await agent.get('/api/wordle/today');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      guesses: [],
      solved: false,
      failed: false,
      guessesRemaining: 6,
      opponentFinished: false,
    });
  });

  it('returns feedback matching the actual word for a valid guess', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    await agent.get('/api/wordle/today');
    const word = todaysWord(db);
    const guess = nonAnswerGuess(word);

    const res = await agent.post('/api/wordle/guess').send({ guess });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ guess, feedback: computeFeedback(guess, word) });
  });

  it('treats guesses as case-insensitive', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    await agent.get('/api/wordle/today');
    const word = todaysWord(db);
    const guess = nonAnswerGuess(word);

    const res = await agent.post('/api/wordle/guess').send({ guess: guess.toLowerCase() });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ guess, feedback: computeFeedback(guess, word) });
  });

  it('rejects a guess of the wrong length', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const res = await agent.post('/api/wordle/guess').send({ guess: 'AB' });
    expect(res.status).toBe(400);
  });

  it('rejects a guess that is not a real word', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const res = await agent.post('/api/wordle/guess').send({ guess: 'ZZZZZ' });
    expect(res.status).toBe(400);
  });

  it('rejects repeating the same guess twice in one day', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    await agent.get('/api/wordle/today');
    const guess = nonAnswerGuess(todaysWord(db));

    await agent.post('/api/wordle/guess').send({ guess });
    const res = await agent.post('/api/wordle/guess').send({ guess });
    expect(res.status).toBe(400);
  });

  it('marks the game failed after 6 unsuccessful guesses and blocks a 7th', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    await agent.get('/api/wordle/today');
    const word = todaysWord(db);
    const candidates = ['ABOUT', 'CRANE', 'TRAIN', 'PLANE', 'STONE', 'GRAPE', 'HOUSE'].filter(
      (w) => w !== word
    );

    for (const guess of candidates.slice(0, 6)) {
      const res = await agent.post('/api/wordle/guess').send({ guess });
      expect(res.status).toBe(201);
    }

    const status = await agent.get('/api/wordle/today');
    expect(status.body.failed).toBe(true);
    expect(status.body.solved).toBe(false);
    expect(status.body.guessesRemaining).toBe(0);

    const seventh = await agent.post('/api/wordle/guess').send({ guess: candidates[6] || 'LEMON' });
    expect(seventh.status).toBe(400);
  });

  it("hides the opponent's progress until they finish", async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    await ryanAgent.get('/api/wordle/today');
    const word = todaysWord(db);

    await ryanAgent.post('/api/wordle/guess').send({ guess: word });
    const res = await ryanAgent.get('/api/wordle/today');
    expect(res.body.solved).toBe(true);
    expect(res.body.opponentFinished).toBe(false);
    expect(res.body.todayResult).toBeUndefined();
  });

  it('reveals todayResult with the correct winner once both users finish', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');
    await ryanAgent.get('/api/wordle/today');
    const word = todaysWord(db);
    const wrongGuesses = ['ABOUT', 'CRANE', 'TRAIN', 'PLANE', 'STONE', 'GRAPE', 'HOUSE'].filter(
      (w) => w !== word
    );

    await ryanAgent.post('/api/wordle/guess').send({ guess: word }); // solves in 1
    for (const guess of wrongGuesses.slice(0, 6)) {
      await samAgent.post('/api/wordle/guess').send({ guess }); // fails after 6
    }

    const ryanView = await ryanAgent.get('/api/wordle/today');
    expect(ryanView.body.todayResult).toEqual({
      yourGuesses: 1,
      opponentGuesses: 6,
      winner: 'you',
      answer: word,
    });

    const samView = await samAgent.get('/api/wordle/today');
    expect(samView.body.todayResult).toEqual({
      yourGuesses: 6,
      opponentGuesses: 1,
      winner: 'opponent',
      answer: word,
    });
  });

  it("still hides opponent's guesses but reports opponentFinished once they complete, while caller is still mid-game", async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');
    await ryanAgent.get('/api/wordle/today');
    const word = todaysWord(db);
    const wrongGuesses = ['ABOUT', 'CRANE', 'TRAIN', 'PLANE', 'STONE', 'GRAPE', 'HOUSE'].filter(
      (w) => w !== word
    );

    // Ryan makes one wrong guess and stops (still mid-game).
    await ryanAgent.post('/api/wordle/guess').send({ guess: wrongGuesses[0] });

    // Sam makes 2 wrong guesses, then plays out the rest and fails after 6.
    for (const guess of wrongGuesses.slice(0, 6)) {
      await samAgent.post('/api/wordle/guess').send({ guess });
    }

    const ryanView = await ryanAgent.get('/api/wordle/today');
    expect(ryanView.body.opponentFinished).toBe(true);
    expect(ryanView.body.solved).toBe(false);
    expect(ryanView.body.failed).toBe(false);
    expect(ryanView.body.guesses).toHaveLength(1);
    expect(ryanView.body.guesses[0].guess).toBe(wrongGuesses[0]);
    expect(ryanView.body.todayResult).toBeUndefined();
  });

  it('returns a zero tally when no history exists', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const users = db.prepare('SELECT id FROM users ORDER BY id').all();

    const res = await agent.get('/api/wordle/score');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ [users[0].id]: 0, [users[1].id]: 0 });
  });

  it("excludes today's puzzle from the tally while it's still undecided", async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');
    await ryanAgent.get('/api/wordle/today');
    const word = todaysWord(db);

    // Ryan solves today; Sam hasn't played at all yet -> today is undecided.
    await ryanAgent.post('/api/wordle/guess').send({ guess: word });

    const users = db.prepare('SELECT id FROM users ORDER BY id').all();
    const res = await samAgent.get('/api/wordle/score');
    expect(res.body).toEqual({ [users[0].id]: 0, [users[1].id]: 0 });
  });

  it('scores a past unfinished day as a loss, but a tie awards no point', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const [userA, userB] = db.prepare('SELECT id FROM users ORDER BY id').all();

    // Day 1 (past, decided): user A solves in 3, user B solves in 5 -> A wins.
    const day1 = db
      .prepare('INSERT INTO wordle_days (date, word) VALUES (?, ?)')
      .run('2020-01-01', 'ALPHA');
    const insertGuess = db.prepare(
      'INSERT INTO wordle_guesses (day_id, user_id, guess, feedback) VALUES (?, ?, ?, ?)'
    );
    insertGuess.run(day1.lastInsertRowid, userA.id, 'BRAVO', 'BBBBB');
    insertGuess.run(day1.lastInsertRowid, userA.id, 'CHARL', 'BBBBB');
    insertGuess.run(day1.lastInsertRowid, userA.id, 'ALPHA', 'GGGGG');
    insertGuess.run(day1.lastInsertRowid, userB.id, 'BRAVO', 'BBBBB');
    insertGuess.run(day1.lastInsertRowid, userB.id, 'CHARL', 'BBBBB');
    insertGuess.run(day1.lastInsertRowid, userB.id, 'DELTA', 'BBBBB');
    insertGuess.run(day1.lastInsertRowid, userB.id, 'ECHOS', 'BBBBB');
    insertGuess.run(day1.lastInsertRowid, userB.id, 'ALPHA', 'GGGGG');

    // Day 2 (past): user A fails all 6, user B never plays -> both treated
    // as failed since the day is over -> tie, no point.
    const day2 = db
      .prepare('INSERT INTO wordle_days (date, word) VALUES (?, ?)')
      .run('2020-01-02', 'ALPHA');
    ['WORDA', 'WORDB', 'WORDC', 'WORDD', 'WORDE', 'WORDF'].forEach((guess) => {
      insertGuess.run(day2.lastInsertRowid, userA.id, guess, 'BBBBB');
    });

    const res = await agent.get('/api/wordle/score');
    expect(res.body).toEqual({ [userA.id]: 1, [userB.id]: 0 });
  });
});
