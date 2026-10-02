// server/__tests__/sudoku.test.js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { createDb } = require('../db');

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

describe('sudoku API', () => {
  it('rejects unauthenticated requests', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app).get('/api/sudoku/today');
    expect(res.status).toBe(401);
  });

  it('creates a fresh day with a real puzzle/solution on first request', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const res = await agent.get('/api/sudoku/today');
    expect(res.status).toBe(200);
    expect(res.body.puzzle).toMatch(/^[0-9]{81}$/);
    expect(res.body.solution).toMatch(/^[1-9]{81}$/);
    expect(res.body.startedAt).toBeNull();
    expect(res.body.finishedAt).toBeNull();
    expect(res.body.opponentFinished).toBe(false);
    expect(res.body.todayResult).toBeUndefined();
  });

  it('rejects finishing before starting', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const res = await agent.post('/api/sudoku/finish');
    expect(res.status).toBe(400);
  });

  it('records a start and reflects it in /today, and is idempotent', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');

    const first = await agent.post('/api/sudoku/start');
    expect(first.status).toBe(200);
    expect(first.body.startedAt).not.toBeNull();

    const second = await agent.post('/api/sudoku/start');
    expect(second.status).toBe(200);
    expect(second.body.startedAt).toBe(first.body.startedAt);

    const today = await agent.get('/api/sudoku/today');
    expect(today.body.startedAt).toBe(first.body.startedAt);
    expect(today.body.finishedAt).toBeNull();
  });

  it('records a finish and rejects a second finish or a start after finishing', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    await agent.post('/api/sudoku/start');

    const finish = await agent.post('/api/sudoku/finish');
    expect(finish.status).toBe(200);
    expect(finish.body.finishedAt).not.toBeNull();

    const secondFinish = await agent.post('/api/sudoku/finish');
    expect(secondFinish.status).toBe(400);

    const startAfterFinish = await agent.post('/api/sudoku/start');
    expect(startAfterFinish.status).toBe(400);
  });

  it("hides the opponent's progress until they finish, even partial progress", async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');

    // Sam has started but not finished — this must stay invisible to Ryan.
    await samAgent.post('/api/sudoku/start');

    await ryanAgent.post('/api/sudoku/start');
    const res = await ryanAgent.post('/api/sudoku/finish');
    expect(res.status).toBe(200);

    const today = await ryanAgent.get('/api/sudoku/today');
    expect(today.body).toEqual({
      puzzle: today.body.puzzle,
      solution: today.body.solution,
      startedAt: today.body.startedAt,
      finishedAt: today.body.finishedAt,
      opponentFinished: false,
    });
  });

  it('reveals todayResult with the correct winner once both users finish', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');

    await ryanAgent.post('/api/sudoku/start');
    await ryanAgent.post('/api/sudoku/finish');
    await samAgent.post('/api/sudoku/start');
    await samAgent.post('/api/sudoku/finish');

    const ryanView = await ryanAgent.get('/api/sudoku/today');
    expect(ryanView.body.todayResult).toBeDefined();
    expect(['you', 'opponent', 'tie']).toContain(ryanView.body.todayResult.winner);
    expect(typeof ryanView.body.todayResult.yourSeconds).toBe('number');
    expect(typeof ryanView.body.todayResult.opponentSeconds).toBe('number');

    const samView = await samAgent.get('/api/sudoku/today');
    expect(samView.body.todayResult.winner).toBe(
      ryanView.body.todayResult.winner === 'you'
        ? 'opponent'
        : ryanView.body.todayResult.winner === 'opponent'
        ? 'you'
        : 'tie'
    );
  });

  it('returns a zero tally when no history exists', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const users = db.prepare('SELECT id FROM users ORDER BY id').all();

    const res = await agent.get('/api/sudoku/score');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ [users[0].id]: 0, [users[1].id]: 0 });
  });

  it("excludes today's puzzle from the tally while it's still undecided", async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');
    await ryanAgent.post('/api/sudoku/start');
    await ryanAgent.post('/api/sudoku/finish'); // ryan done, sam hasn't even started

    const users = db.prepare('SELECT id FROM users ORDER BY id').all();
    const res = await samAgent.get('/api/sudoku/score');
    expect(res.body).toEqual({ [users[0].id]: 0, [users[1].id]: 0 });
  });

  it('scores a past unfinished day as a loss, but a tie awards no point', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const [userA, userB] = db.prepare('SELECT id FROM users ORDER BY id').all();

    // Day 1 (past, decided): user A finishes in 100s, user B in 200s -> A wins.
    const day1 = db
      .prepare('INSERT INTO sudoku_days (date, puzzle, solution) VALUES (?, ?, ?)')
      .run('2020-01-01', '0'.repeat(81), '1'.repeat(81));
    const insertResult = db.prepare(
      'INSERT INTO sudoku_results (day_id, user_id, started_at, finished_at) VALUES (?, ?, ?, ?)'
    );
    insertResult.run(day1.lastInsertRowid, userA.id, '2020-01-01 00:00:00', '2020-01-01 00:01:40');
    insertResult.run(day1.lastInsertRowid, userB.id, '2020-01-01 00:00:00', '2020-01-01 00:03:20');

    // Day 2 (past): user A started but never finished, user B never even started
    // -> both treated as failed since the day is over -> tie, no point.
    const day2 = db
      .prepare('INSERT INTO sudoku_days (date, puzzle, solution) VALUES (?, ?, ?)')
      .run('2020-01-02', '0'.repeat(81), '1'.repeat(81));
    db.prepare(
      'INSERT INTO sudoku_results (day_id, user_id, started_at, finished_at) VALUES (?, ?, ?, NULL)'
    ).run(day2.lastInsertRowid, userA.id, '2020-01-02 00:00:00');

    const res = await agent.get('/api/sudoku/score');
    expect(res.body).toEqual({ [userA.id]: 1, [userB.id]: 0 });
  });
});
