// server/__tests__/spot.test.js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { createDb } = require('../db');
const { generatePuzzle } = require('../spotPuzzle');

const DAY_MS = 24 * 60 * 60 * 1000;

function setupTestDb() {
  const db = createDb(':memory:');
  const hash = bcrypt.hashSync('testpass', 4);
  const insert = db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  );
  insert.run('ryan', hash, 'Ryan');
  insert.run('sam', hash, 'Sam');
  return db;
}

async function loginAgent(app, username) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'testpass' });
  return agent;
}

let db;
let app;
let ryan;
let sam;
let nowMs;

// The puzzle for the most recently created day.
function puzzle() {
  const day = db.prepare('SELECT seed FROM spot_days ORDER BY id DESC LIMIT 1').get();
  return generatePuzzle(day.seed);
}

function circle(d) {
  return { index: d.index, x: d.x, y: d.y, r: d.r };
}

function tapOn(agent, index) {
  const d = puzzle().differences[index];
  return agent.post('/api/spot/tap').send({ x: d.x, y: d.y });
}

// A point well outside every difference's circle.
function missPoint() {
  const { differences } = puzzle();
  for (let x = 5; x < 400; x += 10) {
    for (let y = 5; y < 300; y += 10) {
      if (differences.every((d) => Math.hypot(d.x - x, d.y - y) > d.r + 2)) return { x, y };
    }
  }
  throw new Error('no free point');
}

// Plays a whole round: `hits` differences one second apart, then time runs out.
async function playRound(agent, hits, secondsPerHit = 1) {
  await agent.post('/api/spot/start');
  const startedAt = nowMs;
  for (let i = 0; i < hits; i += 1) {
    nowMs += secondsPerHit * 1000;
    await tapOn(agent, i);
  }
  nowMs = startedAt + 60000;
}

beforeEach(async () => {
  db = setupTestDb();
  nowMs = new Date(2026, 10, 11, 15, 0, 0).getTime();
  app = createApp(db, { now: () => nowMs });
  ryan = await loginAgent(app, 'ryan');
  sam = await loginAgent(app, 'sam');
});

describe('spot the difference rounds', () => {
  it('hides the scenes until the round starts', async () => {
    const res = await ryan.get('/api/spot/today');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'not_started',
      timeLimitMs: 45000,
      penaltyMs: 3000,
      total: 7,
      remainingMs: 45000,
      found: [],
      foundDifferences: [],
      wrongTaps: 0,
      opponentFinished: false,
    });
    for (const key of ['sceneA', 'sceneB', 'theme', 'differences', 'yourResult', 'todayResult']) {
      expect(res.body).not.toHaveProperty(key);
    }
  });

  it('starts the round, reveals the scenes and keeps the answers back', async () => {
    const res = await ryan.post('/api/spot/start');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('playing');
    expect(res.body.remainingMs).toBe(45000);
    expect(res.body.theme).toBe(puzzle().theme);
    expect(res.body.sceneA).toEqual(puzzle().sceneA);
    expect(res.body.sceneB).toEqual(puzzle().sceneB);
    expect(res.body).not.toHaveProperty('differences');
  });

  it('does not restart the clock when started twice', async () => {
    await ryan.post('/api/spot/start');
    nowMs += 10000;
    const again = await ryan.post('/api/spot/start');
    expect(again.body.remainingMs).toBe(35000);
    expect((await ryan.get('/api/spot/today')).body.remainingMs).toBe(35000);
  });

  it('records a hit and returns only that difference', async () => {
    await ryan.post('/api/spot/start');
    nowMs += 5000;
    const d = puzzle().differences[3];
    const res = await ryan.post('/api/spot/tap').send({ x: d.x + 10, y: d.y - 10 });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('hit');
    expect(res.body.index).toBe(3);
    expect(res.body.difference).toEqual({ index: 3, x: d.x, y: d.y, r: 26 });
    expect(res.body.state).toMatchObject({ status: 'playing', found: [3], remainingMs: 40000 });
    expect(res.body.state.foundDifferences).toEqual([{ index: 3, x: d.x, y: d.y, r: 26 }]);
    expect(res.body.state).not.toHaveProperty('differences');
  });

  it('lists finds in the order they were made', async () => {
    await ryan.post('/api/spot/start');
    for (const index of [4, 1, 6]) {
      nowMs += 1000;
      await tapOn(ryan, index);
    }
    const state = (await ryan.get('/api/spot/today')).body;
    expect(state.found).toEqual([4, 1, 6]);
    expect(state.foundDifferences.map((d) => d.index)).toEqual([4, 1, 6]);
  });

  it('answers repeat for a difference already found, at no cost', async () => {
    await ryan.post('/api/spot/start');
    await tapOn(ryan, 2);
    nowMs += 1000;
    const res = await tapOn(ryan, 2);
    expect(res.body.result).toBe('repeat');
    expect(res.body.index).toBe(2);
    expect(res.body.state).toMatchObject({ found: [2], wrongTaps: 0, remainingMs: 44000 });
  });

  it('charges 3 seconds for a miss', async () => {
    await ryan.post('/api/spot/start');
    nowMs += 2000;
    const res = await ryan.post('/api/spot/tap').send(missPoint());
    expect(res.body.result).toBe('miss');
    expect(res.body).not.toHaveProperty('difference');
    expect(res.body.state).toMatchObject({
      status: 'playing',
      found: [],
      wrongTaps: 1,
      remainingMs: 40000,
    });
  });

  it.each([
    [{}],
    [{ x: '120', y: 50 }],
    [{ x: 10 }],
    [{ x: null, y: 1 }],
    [{ x: -1, y: 10 }],
    [{ x: 10, y: 301 }],
  ])('rejects tap body %j without a penalty', async (body) => {
    await ryan.post('/api/spot/start');
    const res = await ryan.post('/api/spot/tap').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('A tap position is required');
    expect((await ryan.get('/api/spot/today')).body.wrongTaps).toBe(0);
  });

  it('refuses a tap before the round starts', async () => {
    await ryan.get('/api/spot/today');
    const res = await ryan.post('/api/spot/tap').send({ x: 10, y: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Start the round first');
  });

  it('accepts a tap one millisecond before the deadline and refuses one at it', async () => {
    await ryan.post('/api/spot/start');
    const startedAt = nowMs;
    nowMs = startedAt + 44999;
    expect((await tapOn(ryan, 0)).body.result).toBe('hit');

    nowMs = startedAt + 45000;
    const late = await tapOn(ryan, 1);
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('The round is over');
    expect(late.body.state).toMatchObject({ status: 'finished', found: [0], remainingMs: 0 });
  });

  it('ends the round when penalties use up the remaining time', async () => {
    await ryan.post('/api/spot/start');
    nowMs += 40000;
    const first = await ryan.post('/api/spot/tap').send(missPoint());
    expect(first.body.state).toMatchObject({ status: 'playing', remainingMs: 2000 });
    const second = await ryan.post('/api/spot/tap').send(missPoint());
    expect(second.status).toBe(200);
    expect(second.body.result).toBe('miss');
    expect(second.body.state).toMatchObject({ status: 'finished', remainingMs: 0, wrongTaps: 2 });
  });

  it('finishes early when all 7 are found and reveals the answers', async () => {
    await ryan.post('/api/spot/start');
    let last;
    for (let i = 0; i < 7; i += 1) {
      nowMs += 1000;
      last = await tapOn(ryan, i);
    }
    expect(last.body.state.status).toBe('finished');
    expect(last.body.state.remainingMs).toBe(0);
    expect(last.body.state.differences).toEqual(puzzle().differences.map(circle));
    expect(last.body.state.yourResult).toEqual({ found: 7, timeMs: 7000 });

    const after = await tapOn(ryan, 0);
    expect(after.status).toBe(409);
  });

  it('finishes on time-out without any request being sent', async () => {
    await ryan.post('/api/spot/start');
    nowMs += 60000;
    const res = await ryan.get('/api/spot/today');
    expect(res.body).toMatchObject({
      status: 'finished',
      remainingMs: 0,
      yourResult: { found: 0, timeMs: 0 },
    });
    expect(res.body.differences).toHaveLength(7);
    expect(res.body.sceneA).toEqual(puzzle().sceneA);
  });

  it('keeps the first find when the same difference is recorded twice', async () => {
    await ryan.post('/api/spot/start');
    const d = puzzle().differences[0];
    const [a, b] = await Promise.all([
      ryan.post('/api/spot/tap').send({ x: d.x, y: d.y }),
      ryan.post('/api/spot/tap').send({ x: d.x, y: d.y }),
    ]);
    expect([a.body.result, b.body.result].sort()).toEqual(['hit', 'repeat']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM spot_finds').get().n).toBe(1);
  });
});

describe('spot the difference results', () => {
  it('hides the other player until both are finished, then names the winner', async () => {
    await playRound(ryan, 3, 3); // 3 found, last at 9000 ms

    const before = (await sam.get('/api/spot/today')).body;
    expect(before.status).toBe('not_started');
    expect(before.opponentFinished).toBe(true);
    expect(before).not.toHaveProperty('todayResult');

    const waiting = (await ryan.get('/api/spot/today')).body;
    expect(waiting.status).toBe('finished');
    expect(waiting.opponentFinished).toBe(false);
    expect(waiting).not.toHaveProperty('todayResult');

    await sam.post('/api/spot/start');
    const samStart = nowMs;
    for (const [index, at] of [[0, 2000], [1, 5000], [2, 8000]]) {
      nowMs = samStart + at;
      await tapOn(sam, index);
    }
    const midRound = (await sam.get('/api/spot/today')).body;
    expect(midRound.status).toBe('playing');
    expect(midRound).not.toHaveProperty('todayResult');
    nowMs = samStart + 60000;

    const samView = (await sam.get('/api/spot/today')).body;
    expect(samView.yourResult).toEqual({ found: 3, timeMs: 8000 });
    expect(samView.todayResult).toEqual({
      winner: 'you',
      opponentFound: 3,
      opponentTimeMs: 9000,
    });
    const ryanView = (await ryan.get('/api/spot/today')).body;
    expect(ryanView.todayResult).toEqual({
      winner: 'opponent',
      opponentFound: 3,
      opponentTimeMs: 8000,
    });
  });

  it('calls a day with equal count and time a tie', async () => {
    await playRound(ryan, 2, 4);
    await playRound(sam, 2, 4);
    expect((await ryan.get('/api/spot/today')).body.todayResult.winner).toBe('tie');
    expect((await sam.get('/api/spot/today')).body.todayResult.winner).toBe('tie');
  });

  it('calls a day where neither found anything a tie', async () => {
    await playRound(ryan, 0);
    await playRound(sam, 0);
    expect((await ryan.get('/api/spot/today')).body.todayResult).toEqual({
      winner: 'tie',
      opponentFound: 0,
      opponentTimeMs: 0,
    });
  });

  it('wins on count before time', async () => {
    await playRound(ryan, 2, 20); // slow, but two
    await playRound(sam, 1, 1); // fast, but one
    expect((await ryan.get('/api/spot/today')).body.todayResult.winner).toBe('you');
    expect((await sam.get('/api/spot/today')).body.todayResult.winner).toBe('opponent');
  });

  it('gives both players the same puzzle and a new one the next day', async () => {
    const mine = (await ryan.post('/api/spot/start')).body;
    const theirs = (await sam.post('/api/spot/start')).body;
    expect(theirs.sceneA).toEqual(mine.sceneA);
    expect(theirs.sceneB).toEqual(mine.sceneB);
    expect(db.prepare('SELECT COUNT(*) AS n FROM spot_days').get().n).toBe(1);

    nowMs += DAY_MS;
    expect((await ryan.get('/api/spot/today')).body.status).toBe('not_started');
    await ryan.post('/api/spot/start');
    const days = db.prepare('SELECT date FROM spot_days ORDER BY id').all();
    expect(days.map((d) => d.date)).toEqual(['2026-11-11', '2026-11-12']);
  });

  it('keeps a round that runs past midnight', async () => {
    nowMs = new Date(2026, 10, 11, 23, 59, 50).getTime();
    await ryan.post('/api/spot/start');
    const d = puzzle().differences[0];

    nowMs = new Date(2026, 10, 12, 0, 0, 10).getTime();
    const res = await ryan.post('/api/spot/tap').send({ x: d.x, y: d.y });
    expect(res.body.result).toBe('hit');
    expect((await ryan.get('/api/spot/today')).body).toMatchObject({
      status: 'playing',
      found: [0],
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM spot_days').get().n).toBe(1);

    nowMs += 60000;
    expect((await ryan.get('/api/spot/today')).body.status).toBe('not_started');
    expect(db.prepare('SELECT COUNT(*) AS n FROM spot_days').get().n).toBe(2);
  });

  it('tallies the all-time score', async () => {
    const ryanId = db.prepare("SELECT id FROM users WHERE username = 'ryan'").get().id;
    const samId = db.prepare("SELECT id FROM users WHERE username = 'sam'").get().id;
    const score = async () => (await ryan.get('/api/spot/score')).body;
    const dayStart = nowMs;

    // Day 1: both play, Ryan finds more.
    await playRound(ryan, 1);
    await playRound(sam, 0);
    expect(await score()).toEqual({ [ryanId]: 1, [samId]: 0 });

    // Day 2: only Sam plays.
    nowMs = dayStart + DAY_MS;
    await playRound(sam, 0);
    // Day 3: someone looks, nobody plays.
    nowMs = dayStart + 2 * DAY_MS;
    await ryan.get('/api/spot/today');
    // Day 4: Ryan has finished, Sam has not yet.
    nowMs = dayStart + 3 * DAY_MS;
    await playRound(ryan, 1);
    expect(await score()).toEqual({ [ryanId]: 1, [samId]: 1 });

    await playRound(sam, 2);
    expect(await score()).toEqual({ [ryanId]: 1, [samId]: 2 });
  });

  it('returns an empty score when there are not two users', async () => {
    db.prepare("DELETE FROM users WHERE username = 'sam'").run();
    expect((await ryan.get('/api/spot/score')).body).toEqual({});
  });

  it.each([
    ['get', '/api/spot/today'],
    ['post', '/api/spot/start'],
    ['post', '/api/spot/tap'],
    ['get', '/api/spot/score'],
  ])('rejects unauthenticated %s %s', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });
});
