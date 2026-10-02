# Daily Sudoku Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily, head-to-head Sudoku game between the two seeded accounts, with a running win tally, as a new "Sudoku" tab — mirroring the existing Wordle feature's structure.

**Architecture:** Server-authoritative for the one thing that needs to be fair — start/finish timestamps per user per day — but the puzzle itself (and its solution) is handed to the client up front, since unlike Wordle's secret word, a Sudoku puzzle is never hidden from the player solving it. Cell-by-cell validation happens entirely client-side for instant feedback. Reuses the existing SQLite database, session auth, and (after Task 1) a scoring algorithm shared with Wordle.

**Tech Stack:** Node.js + Express + better-sqlite3 (existing backend), React (existing frontend), Vitest + Supertest (existing test setup). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-sudoku-game-design.md`

## Global Constraints

- One Sudoku puzzle per calendar day (server's local date), identical for both accounts.
- Wrong cell entries are rejected client-side immediately — nothing incorrect is ever allowed to land on the board, so "solved" simply means "every cell is filled."
- Scoring is by completion time: faster finish wins the day; a tie (equal elapsed seconds, or both failing to finish) awards no point; not finishing before the day rolls over counts as a loss; an undecided "today" is excluded from the tally entirely until both have finished.
- Each account's progress and elapsed time are hidden from the other until both have finished that day's puzzle.
- No history/archive of past puzzles.
- Mounted behind the existing `requireAuth` middleware — no new auth concepts.
- The timer is real wall-clock time between first entry and completion; no pause/resume is required or expected.

## Review Focus

- SQLite's `datetime('now')` strings have no timezone marker; parsing the same string inconsistently on the server vs. the client (e.g. one side treating it as UTC, the other as local time) would silently produce wrong or even negative elapsed times — both sides must normalize the same way.
- The opponent's raw `started_at`/`finished_at` must never appear in `/api/sudoku/today`'s response for the other player — only the derived `opponentFinished` boolean and, once both are done, the `todayResult` summary.
- `/api/sudoku/score` must treat an undecided *today* (exclude entirely) differently from an unfinished *past* day (score as a loss) — the same easy-to-conflate distinction Wordle already has to get right.
- A page reload mid-solve must not silently discard the player's in-progress entries while the server-side timer keeps running against them — losing all progress to an accidental refresh would be a real, unfair trap, not a cosmetic issue.
- `/start` and `/finish` must enforce ordering (can't finish before starting, can't start or finish twice) exactly as specified, not just on the happy path.

---

### Task 1: Extract shared score-tally logic

**Files:**
- Create: `server/gameScoring.js`
- Create: `server/__tests__/gameScoring.test.js`
- Modify: `server/wordleLogic.js`
- Modify: `server/__tests__/wordleLogic.test.js`

**Interfaces:**
- Produces: `computeScoreTally(days: { counts: Record<number, number> }[], userAId: number, userBId: number) -> Record<number, number>` from `server/gameScoring.js` — identical behavior to the function Wordle already has (lower value per day wins a point; equal values, including `Infinity === Infinity`, award nothing). This is the exact same algorithm Sudoku will use, comparing elapsed seconds instead of guess counts.
- `server/wordleLogic.js` keeps exporting `computeScoreTally` (now re-exported from `gameScoring.js`) so `server/routes/wordle.js` needs no changes at all.

This is a pure refactor — no behavior change for Wordle. It exists so Sudoku (Task 3) doesn't duplicate this algorithm.

- [ ] **Step 1: Create `server/gameScoring.js`**

```js
function computeScoreTally(days, userAId, userBId) {
  const tally = { [userAId]: 0, [userBId]: 0 };
  for (const day of days) {
    const a = day.counts[userAId];
    const b = day.counts[userBId];
    if (a < b) tally[userAId] += 1;
    else if (b < a) tally[userBId] += 1;
  }
  return tally;
}

module.exports = { computeScoreTally };
```

- [ ] **Step 2: Create `server/__tests__/gameScoring.test.js`**

```js
const { computeScoreTally } = require('../gameScoring');

describe('computeScoreTally', () => {
  it('awards a point to whoever had the lower value each day, and nothing on a tie', () => {
    const days = [
      { counts: { 1: 2, 2: 4 } },   // user 1 wins
      { counts: { 1: 5, 2: 5 } },   // tie, no point
      { counts: { 1: Infinity, 2: 3 } }, // user 2 wins (user 1 didn't finish)
      { counts: { 1: Infinity, 2: Infinity } }, // both failed, tie, no point
    ];
    expect(computeScoreTally(days, 1, 2)).toEqual({ 1: 1, 2: 1 });
  });
});
```

- [ ] **Step 3: Run the new test to verify it passes**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/gameScoring.test.js`
Expected: PASS (1 test)

- [ ] **Step 4: Modify `server/wordleLogic.js` to import instead of define `computeScoreTally`**

Change the top of the file from:
```js
const fs = require('fs');
const path = require('path');
```
to:
```js
const fs = require('fs');
const path = require('path');
const { computeScoreTally } = require('./gameScoring');
```

Delete the `computeScoreTally` function definition entirely (it currently sits between `computeGuessCount` and `module.exports`):
```js
function computeScoreTally(days, userAId, userBId) {
  const tally = { [userAId]: 0, [userBId]: 0 };
  for (const day of days) {
    const a = day.counts[userAId];
    const b = day.counts[userBId];
    if (a < b) tally[userAId] += 1;
    else if (b < a) tally[userBId] += 1;
  }
  return tally;
}

```
(Delete just that function and the blank line after it. Leave `module.exports` exactly as it is — it still lists `computeScoreTally`, which now refers to the imported one.)

- [ ] **Step 5: Modify `server/__tests__/wordleLogic.test.js` to remove the now-duplicate test**

Change the top of the file from:
```js
const { computeFeedback } = require('../wordleLogic');
const {
  loadAnswerWords,
  loadValidGuessSet,
  pickDailyWord,
  computeGuessCount,
  computeScoreTally,
} = require('../wordleLogic');
```
to:
```js
const { computeFeedback } = require('../wordleLogic');
const {
  loadAnswerWords,
  loadValidGuessSet,
  pickDailyWord,
  computeGuessCount,
} = require('../wordleLogic');
```

Delete the entire `describe('computeScoreTally', ...)` block at the end of the file (it's now covered by `gameScoring.test.js`):
```js
describe('computeScoreTally', () => {
  it('awards a point to whoever had fewer guesses each day, and nothing on a tie', () => {
    const days = [
      { counts: { 1: 2, 2: 4 } },   // user 1 wins
      { counts: { 1: 5, 2: 5 } },   // tie, no point
      { counts: { 1: Infinity, 2: 3 } }, // user 2 wins (user 1 failed)
      { counts: { 1: Infinity, 2: Infinity } }, // both failed, tie, no point
    ];
    expect(computeScoreTally(days, 1, 2)).toEqual({ 1: 1, 2: 1 });
  });
});
```

- [ ] **Step 6: Run the full backend suite to confirm nothing broke**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run`
Expected: All existing tests still PASS (same total count as before, minus the one moved test, plus the one new `gameScoring.test.js` test — net unchanged).

- [ ] **Step 7: Commit**

```bash
git add server/gameScoring.js server/__tests__/gameScoring.test.js server/wordleLogic.js server/__tests__/wordleLogic.test.js
git commit -m "refactor: extract computeScoreTally into a shared gameScoring module"
```

---

### Task 2: Sudoku puzzle dataset and pure logic

**Files:**
- Create: `server/data/sudoku-puzzles.csv`
- Create: `server/sudokuLogic.js`
- Create: `server/__tests__/sudokuLogic.test.js`

**Interfaces:**
- Produces (all from `server/sudokuLogic.js`):
  - `loadPuzzlePool() -> { puzzle: string, solution: string }[]` — both strings are exactly 81 characters of digits 0-9 (`puzzle` uses `'0'` for blank cells).
  - `pickDailyPuzzle(pool: {puzzle, solution}[], usedPuzzles: string[]) -> {puzzle, solution}` — picks randomly from `pool` excluding any entry whose `puzzle` string is in `usedPuzzles`; falls back to the full `pool` once every entry has been used.
  - `computeElapsedSeconds(startedAt: string, finishedAt: string) -> number` — both inputs are SQLite `datetime('now')`-format strings (`'YYYY-MM-DD HH:MM:SS'`, UTC, no timezone marker); returns the whole-second difference, treating both strings as UTC.

- [ ] **Step 1: Fetch the puzzle dataset**

This is a well-known, freely-republished public Sudoku puzzle+solution dataset (already verified reachable and in the right format before writing this plan).

Run:
```bash
mkdir -p server/data
curl -s -o server/data/sudoku-puzzles.csv https://raw.githubusercontent.com/geekypandey/sudoku-solver/master/sudoku_small.csv
wc -l server/data/sudoku-puzzles.csv
head -c 200 server/data/sudoku-puzzles.csv
```
Expected: a non-trivial number of lines (at least several hundred), and the content looks like comma-separated pairs of long digit strings (there may or may not be a text header line first — that's fine, the parser in Step 4 only keeps lines matching the exact 81-digit,81-digit shape).

- [ ] **Step 2: Write the failing tests**

```js
// server/__tests__/sudokuLogic.test.js
const { loadPuzzlePool, pickDailyPuzzle, computeElapsedSeconds } = require('../sudokuLogic');

describe('loadPuzzlePool', () => {
  it('loads a non-empty pool of 81-character puzzle/solution pairs', () => {
    const pool = loadPuzzlePool();
    expect(pool.length).toBeGreaterThan(50);
    for (const { puzzle, solution } of pool) {
      expect(puzzle).toMatch(/^[0-9]{81}$/);
      expect(solution).toMatch(/^[1-9]{81}$/);
    }
  });

  it('has at least one blank clue cell in every puzzle', () => {
    const pool = loadPuzzlePool();
    expect(pool.every(({ puzzle }) => puzzle.includes('0'))).toBe(true);
  });
});

describe('pickDailyPuzzle', () => {
  it('excludes already-used puzzles when an unused one remains', () => {
    const pool = [
      { puzzle: 'AAA', solution: 'aaa' },
      { puzzle: 'BBB', solution: 'bbb' },
      { puzzle: 'CCC', solution: 'ccc' },
    ];
    const used = ['AAA', 'BBB'];
    expect(pickDailyPuzzle(pool, used)).toEqual({ puzzle: 'CCC', solution: 'ccc' });
  });

  it('falls back to the full pool once every puzzle has been used', () => {
    const pool = [
      { puzzle: 'AAA', solution: 'aaa' },
      { puzzle: 'BBB', solution: 'bbb' },
    ];
    const used = ['AAA', 'BBB'];
    expect(pool).toContainEqual(pickDailyPuzzle(pool, used));
  });
});

describe('computeElapsedSeconds', () => {
  it('computes a simple same-minute difference', () => {
    expect(computeElapsedSeconds('2026-01-01 00:00:00', '2026-01-01 00:00:10')).toBe(10);
  });

  it('computes a difference that crosses a minute boundary', () => {
    expect(computeElapsedSeconds('2026-01-01 00:00:50', '2026-01-01 00:01:05')).toBe(15);
  });

  it('returns 0 for identical timestamps', () => {
    expect(computeElapsedSeconds('2026-01-01 00:00:00', '2026-01-01 00:00:00')).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/sudokuLogic.test.js`
Expected: FAIL — `../sudokuLogic` module not found.

- [ ] **Step 4: Create `server/sudokuLogic.js`**

```js
const fs = require('fs');
const path = require('path');

function loadPuzzlePool() {
  const filePath = path.join(__dirname, 'data', 'sudoku-puzzles.csv');
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const pairs = [];
  for (const line of lines) {
    const match = line.trim().match(/^([0-9]{81}),([0-9]{81})$/);
    if (match) {
      pairs.push({ puzzle: match[1], solution: match[2] });
    }
  }
  return pairs;
}

function pickDailyPuzzle(pool, usedPuzzles) {
  const usedSet = new Set(usedPuzzles);
  const available = pool.filter((p) => !usedSet.has(p.puzzle));
  const chosenFrom = available.length > 0 ? available : pool;
  return chosenFrom[Math.floor(Math.random() * chosenFrom.length)];
}

function computeElapsedSeconds(startedAt, finishedAt) {
  const start = new Date(startedAt.replace(' ', 'T') + 'Z');
  const end = new Date(finishedAt.replace(' ', 'T') + 'Z');
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

module.exports = { loadPuzzlePool, pickDailyPuzzle, computeElapsedSeconds };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/sudokuLogic.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add server/data/sudoku-puzzles.csv server/sudokuLogic.js server/__tests__/sudokuLogic.test.js
git commit -m "feat: add Sudoku puzzle dataset, daily puzzle selection, and elapsed-time helper"
```

---

### Task 3: Sudoku API routes

**Files:**
- Modify: `server/schema.sql` (add `sudoku_days`, `sudoku_results` tables)
- Create: `server/routes/sudoku.js`
- Modify: `server/app.js` (mount the Sudoku router)
- Test: `server/__tests__/sudoku.test.js`

**Interfaces:**
- Consumes: `requireAuth` (from `server/auth.js`), `computeScoreTally` (from `server/gameScoring.js`, Task 1), `loadPuzzlePool`, `pickDailyPuzzle`, `computeElapsedSeconds` (from `server/sudokuLogic.js`, Task 2).
- Produces: `createSudokuRouter(db)` from `server/routes/sudoku.js`, mounted at `/api/sudoku` behind `requireAuth`.
- Routes:
  - `GET /api/sudoku/today` → `{ puzzle, solution, startedAt, finishedAt, opponentFinished, todayResult? }`. `startedAt`/`finishedAt` are the CALLER's own timestamps (or `null`). `todayResult: { yourSeconds, opponentSeconds, winner }` is present only once both users have finished.
  - `POST /api/sudoku/start` → `{ startedAt }`. Sets `started_at` to now if not already set; `200` no-op if already started; `400` if already finished.
  - `POST /api/sudoku/finish` → `{ startedAt, finishedAt }`. `400` if not started yet, or already finished.
  - `GET /api/sudoku/score` → `{ "<userId>": winCount, ... }` for both seeded users.

- [ ] **Step 1: Add the new tables to `server/schema.sql`**

Append to the end of the file:

```sql

CREATE TABLE IF NOT EXISTS sudoku_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  puzzle TEXT NOT NULL,
  solution TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sudoku_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES sudoku_days(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT,
  finished_at TEXT,
  UNIQUE(day_id, user_id)
);
```

- [ ] **Step 2: Write the failing tests**

```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/sudoku.test.js`
Expected: FAIL — 404s, no Sudoku router mounted yet.

- [ ] **Step 4: Create `server/routes/sudoku.js`**

```js
const express = require('express');
const { computeScoreTally } = require('../gameScoring');
const { loadPuzzlePool, pickDailyPuzzle, computeElapsedSeconds } = require('../sudokuLogic');

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getOrCreateDay(db, date) {
  const existing = db.prepare('SELECT * FROM sudoku_days WHERE date = ?').get(date);
  if (existing) return existing;
  const usedPuzzles = db.prepare('SELECT puzzle FROM sudoku_days').all().map((r) => r.puzzle);
  const { puzzle, solution } = pickDailyPuzzle(loadPuzzlePool(), usedPuzzles);
  const result = db
    .prepare('INSERT INTO sudoku_days (date, puzzle, solution) VALUES (?, ?, ?)')
    .run(date, puzzle, solution);
  return { id: result.lastInsertRowid, date, puzzle, solution };
}

function getResult(db, dayId, userId) {
  return db
    .prepare('SELECT * FROM sudoku_results WHERE day_id = ? AND user_id = ?')
    .get(dayId, userId);
}

function otherUserId(db, userId) {
  const row = db.prepare('SELECT id FROM users WHERE id != ?').get(userId);
  return row ? row.id : null;
}

function createSudokuRouter(db) {
  const router = express.Router();

  router.get('/today', (req, res) => {
    const day = getOrCreateDay(db, todayDateString());
    const mine = getResult(db, day.id, req.session.userId);

    const opponentId = otherUserId(db, req.session.userId);
    const opponentResult = opponentId ? getResult(db, day.id, opponentId) : null;
    const opponentFinished = !!(opponentResult && opponentResult.finished_at);

    const response = {
      puzzle: day.puzzle,
      solution: day.solution,
      startedAt: mine ? mine.started_at : null,
      finishedAt: mine ? mine.finished_at : null,
      opponentFinished,
    };

    if (mine && mine.finished_at && opponentFinished) {
      const yourSeconds = computeElapsedSeconds(mine.started_at, mine.finished_at);
      const opponentSeconds = computeElapsedSeconds(
        opponentResult.started_at,
        opponentResult.finished_at
      );
      response.todayResult = {
        yourSeconds,
        opponentSeconds,
        winner: yourSeconds < opponentSeconds ? 'you' : yourSeconds > opponentSeconds ? 'opponent' : 'tie',
      };
    }

    res.json(response);
  });

  router.post('/start', (req, res) => {
    const day = getOrCreateDay(db, todayDateString());
    const existing = getResult(db, day.id, req.session.userId);

    if (existing && existing.finished_at) {
      return res.status(400).json({ error: "Today's game is already finished" });
    }
    if (existing && existing.started_at) {
      return res.json({ startedAt: existing.started_at });
    }

    if (existing) {
      db.prepare("UPDATE sudoku_results SET started_at = datetime('now') WHERE id = ?").run(
        existing.id
      );
    } else {
      db.prepare(
        "INSERT INTO sudoku_results (day_id, user_id, started_at) VALUES (?, ?, datetime('now'))"
      ).run(day.id, req.session.userId);
    }

    const updated = getResult(db, day.id, req.session.userId);
    res.json({ startedAt: updated.started_at });
  });

  router.post('/finish', (req, res) => {
    const day = getOrCreateDay(db, todayDateString());
    const existing = getResult(db, day.id, req.session.userId);

    if (!existing || !existing.started_at) {
      return res.status(400).json({ error: "You haven't started today's puzzle yet" });
    }
    if (existing.finished_at) {
      return res.status(400).json({ error: "Today's game is already finished" });
    }

    db.prepare("UPDATE sudoku_results SET finished_at = datetime('now') WHERE id = ?").run(
      existing.id
    );
    const updated = getResult(db, day.id, req.session.userId);
    res.json({ startedAt: updated.started_at, finishedAt: updated.finished_at });
  });

  router.get('/score', (req, res) => {
    const users = db.prepare('SELECT id FROM users ORDER BY id').all();
    if (users.length < 2) {
      return res.json({});
    }
    const [userA, userB] = users;
    const today = todayDateString();
    const days = db.prepare('SELECT * FROM sudoku_days ORDER BY date ASC').all();

    const resolvedDays = [];
    for (const day of days) {
      const resultA = getResult(db, day.id, userA.id);
      const resultB = getResult(db, day.id, userB.id);
      const secondsA =
        resultA && resultA.finished_at
          ? computeElapsedSeconds(resultA.started_at, resultA.finished_at)
          : null;
      const secondsB =
        resultB && resultB.finished_at
          ? computeElapsedSeconds(resultB.started_at, resultB.finished_at)
          : null;

      if (day.date === today) {
        if (secondsA === null || secondsB === null) continue;
        resolvedDays.push({ counts: { [userA.id]: secondsA, [userB.id]: secondsB } });
      } else {
        resolvedDays.push({
          counts: {
            [userA.id]: secondsA === null ? Infinity : secondsA,
            [userB.id]: secondsB === null ? Infinity : secondsB,
          },
        });
      }
    }

    res.json(computeScoreTally(resolvedDays, userA.id, userB.id));
  });

  return router;
}

module.exports = { createSudokuRouter };
```

- [ ] **Step 5: Modify `server/app.js` to mount the Sudoku router**

Change the import block from:
```js
const { createWordleRouter } = require('./routes/wordle');
const { createUsersRouter } = require('./routes/users');
```
to:
```js
const { createWordleRouter } = require('./routes/wordle');
const { createUsersRouter } = require('./routes/users');
const { createSudokuRouter } = require('./routes/sudoku');
```

Change the mount block from:
```js
  app.use('/api/wordle', requireAuth, createWordleRouter(db));
  app.use('/api/users', requireAuth, createUsersRouter(db));
```
to:
```js
  app.use('/api/wordle', requireAuth, createWordleRouter(db));
  app.use('/api/users', requireAuth, createUsersRouter(db));
  app.use('/api/sudoku', requireAuth, createSudokuRouter(db));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/sudoku.test.js`
Expected: PASS (10 tests)

- [ ] **Step 7: Run the full backend suite**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run`
Expected: All tests across every file PASS.

- [ ] **Step 8: Commit**

```bash
git add server/schema.sql server/routes/sudoku.js server/app.js server/__tests__/sudoku.test.js
git commit -m "feat: add Sudoku API routes with hidden-until-both-finish timing"
```

---

### Task 4: Client-side Sudoku logic and API methods

**Files:**
- Create: `client/src/pages/sudokuLogic.js`
- Modify: `client/src/api.js` (add Sudoku methods)
- Test: `client/src/__tests__/sudokuLogic.test.js`

**Interfaces:**
- Produces:
  - `parseServerTimestamp(ts: string) -> Date` — parses a SQLite `'YYYY-MM-DD HH:MM:SS'` string as UTC, matching exactly how the server's `computeElapsedSeconds` (Task 2) interprets the same format. This consistency is what Review Focus item 1 depends on.
  - `formatElapsed(totalSeconds: number) -> string` — formats as `M:SS` (e.g. `252` → `"4:12"`).
  - `isCorrectEntry(solution: string, index: number, digit: number|string) -> boolean` — true iff `solution[index]` equals the digit.
  - `isGridComplete(cells: string[]) -> boolean` — true iff no entry is `'0'` or `''`.
  - `loadSavedCells(storage, key) -> string[] | null` and `saveCells(storage, key, cells)` — `storage` is any object with `getItem`/`setItem` (the component passes `window.localStorage`; tests pass a plain in-memory fake, since this project adds no new test-environment dependencies like jsdom). Used to survive a page reload mid-solve without losing progress.
- `api.getSudokuToday()`, `api.startSudoku()`, `api.finishSudoku()`, `api.getSudokuScore()` — added to the existing `api` object in `client/src/api.js`.

- [ ] **Step 1: Write the failing test**

```js
// client/src/__tests__/sudokuLogic.test.js
import { describe, it, expect } from 'vitest';
import {
  parseServerTimestamp,
  formatElapsed,
  isCorrectEntry,
  isGridComplete,
  loadSavedCells,
  saveCells,
} from '../pages/sudokuLogic';

describe('parseServerTimestamp', () => {
  it('parses a SQLite datetime string as UTC', () => {
    const date = parseServerTimestamp('2026-01-01 00:00:00');
    expect(date.getTime()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
  });
});

describe('formatElapsed', () => {
  it('formats seconds under a minute', () => {
    expect(formatElapsed(5)).toBe('0:05');
  });

  it('formats minutes and seconds with zero-padding', () => {
    expect(formatElapsed(252)).toBe('4:12');
  });
});

describe('isCorrectEntry', () => {
  it('returns true when the digit matches the solution at that index', () => {
    expect(isCorrectEntry('123456789' + '0'.repeat(72), 0, 1)).toBe(true);
  });

  it('returns false when the digit does not match', () => {
    expect(isCorrectEntry('123456789' + '0'.repeat(72), 0, 9)).toBe(false);
  });
});

describe('isGridComplete', () => {
  it('returns false when any cell is blank', () => {
    const cells = new Array(81).fill('5');
    cells[40] = '0';
    expect(isGridComplete(cells)).toBe(false);
  });

  it('returns true when every cell has a digit', () => {
    const cells = new Array(81).fill('5');
    expect(isGridComplete(cells)).toBe(true);
  });
});

function fakeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
  };
}

describe('loadSavedCells / saveCells', () => {
  it('returns null when nothing has been saved for that key', () => {
    expect(loadSavedCells(fakeStorage(), 'sudoku-cells-xyz')).toBeNull();
  });

  it('round-trips a saved cells array', () => {
    const storage = fakeStorage();
    const cells = new Array(81).fill('0');
    cells[5] = '7';
    saveCells(storage, 'sudoku-cells-xyz', cells);
    expect(loadSavedCells(storage, 'sudoku-cells-xyz')).toEqual(cells);
  });

  it('returns null instead of throwing when storage access fails', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSavedCells(storage, 'k')).toBeNull();
  });

  it('does not throw when storage access fails while saving', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveCells(storage, 'k', ['1'])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && node ./node_modules/vitest/vitest.mjs run src/__tests__/sudokuLogic.test.js`
Expected: FAIL — `../pages/sudokuLogic` not found.

- [ ] **Step 3: Create `client/src/pages/sudokuLogic.js`**

```js
export function parseServerTimestamp(ts) {
  return new Date(ts.replace(' ', 'T') + 'Z');
}

export function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function isCorrectEntry(solution, index, digit) {
  return solution[index] === String(digit);
}

export function isGridComplete(cells) {
  return cells.every((c) => c !== '0' && c !== '');
}

export function loadSavedCells(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCells(storage, key, cells) {
  try {
    storage.setItem(key, JSON.stringify(cells));
  } catch {
    // Storage can be unavailable (private browsing, quota) — losing the
    // reload-resilience convenience is acceptable; the game still works.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && node ./node_modules/vitest/vitest.mjs run src/__tests__/sudokuLogic.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Add the new methods to `client/src/api.js`**

Add to the exported `api` object (alongside the existing `getWordleToday`/`submitWordleGuess`/`getWordleScore` entries):

```js
  getSudokuToday: () => request('/sudoku/today'),
  startSudoku: () => request('/sudoku/start', { method: 'POST' }),
  finishSudoku: () => request('/sudoku/finish', { method: 'POST' }),
  getSudokuScore: () => request('/sudoku/score'),
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/sudokuLogic.js client/src/api.js client/src/__tests__/sudokuLogic.test.js
git commit -m "feat: add client-side Sudoku logic and API methods"
```

---

### Task 5: Sudoku page, tab wiring, and styling

**Files:**
- Create: `client/src/pages/Sudoku.jsx`
- Modify: `client/src/App.jsx` (add the Sudoku tab)
- Modify: `client/src/index.css` (add grid/numpad styles)

**Interfaces:**
- Consumes: `api.getSudokuToday`, `api.startSudoku`, `api.finishSudoku`, `api.getSudokuScore`, `api.getUsers` (Task 4 and the existing `/api/users`); `parseServerTimestamp`, `formatElapsed`, `isCorrectEntry`, `isGridComplete`, `loadSavedCells`, `saveCells` (Task 4).
- Produces: `<SudokuPage currentUserId />` component, rendered in a new "Sudoku" tab.

This task is UI wiring with its logic already unit-tested in Task 4; verified manually against the running backend, same as the Wordle page was.

A reasonable person who gets interrupted mid-puzzle and reloads the page should not lose their in-progress entries just because nothing was persisted — Review Focus item 4. This task persists the in-progress grid to `localStorage`, keyed by the day's puzzle string, so a reload restores it. This is local-only convenience (never sent to or trusted by the server) and doesn't change anything about scoring or fairness.

- [ ] **Step 1: Create `client/src/pages/Sudoku.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  parseServerTimestamp,
  formatElapsed,
  isCorrectEntry,
  isGridComplete,
  loadSavedCells,
  saveCells,
} from './sudokuLogic';

export function SudokuPage({ currentUserId }) {
  const [puzzle, setPuzzle] = useState(null);
  const [solution, setSolution] = useState(null);
  const [cells, setCells] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [todayResult, setTodayResult] = useState(null);
  const [score, setScore] = useState({});
  const [users, setUsers] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [wrongFlashIndex, setWrongFlashIndex] = useState(null);
  const [, forceTick] = useState(0);
  const wrongFlashTimer = useRef(null);

  useEffect(() => {
    loadToday();
    loadScore();
    loadUsers();
  }, []);

  useEffect(() => {
    if (!startedAt || finishedAt) return undefined;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt, finishedAt]);

  async function loadToday() {
    const data = await api.getSudokuToday();
    setPuzzle(data.puzzle);
    setSolution(data.solution);
    setStartedAt(data.startedAt);
    setFinishedAt(data.finishedAt);
    setOpponentFinished(data.opponentFinished);
    setTodayResult(data.todayResult || null);

    if (data.finishedAt) {
      setCells(data.solution.split(''));
    } else {
      const saved = loadSavedCells(window.localStorage, `sudoku-cells-${data.puzzle}`);
      setCells(saved || data.puzzle.split(''));
    }
  }

  async function loadScore() {
    setScore(await api.getSudokuScore());
  }

  async function loadUsers() {
    setUsers(await api.getUsers());
  }

  async function handleDigit(digit) {
    if (selectedIndex === null || finishedAt) return;
    if (puzzle[selectedIndex] !== '0') return;

    if (!isCorrectEntry(solution, selectedIndex, digit)) {
      setWrongFlashIndex(selectedIndex);
      clearTimeout(wrongFlashTimer.current);
      wrongFlashTimer.current = setTimeout(() => setWrongFlashIndex(null), 300);
      return;
    }

    const nextCells = cells.slice();
    nextCells[selectedIndex] = String(digit);
    setCells(nextCells);
    saveCells(window.localStorage, `sudoku-cells-${puzzle}`, nextCells);

    if (!startedAt) {
      const result = await api.startSudoku();
      setStartedAt(result.startedAt);
    }

    if (isGridComplete(nextCells)) {
      const result = await api.finishSudoku();
      setFinishedAt(result.finishedAt);
      loadScore();
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (/^[1-9]$/.test(e.key)) {
        handleDigit(e.key);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!puzzle || !cells) return null;

  const self = users.find((u) => u.id === currentUserId);
  const opponent = users.find((u) => u.id !== currentUserId);

  let elapsedSeconds = 0;
  if (startedAt && finishedAt) {
    elapsedSeconds = Math.round(
      (parseServerTimestamp(finishedAt).getTime() - parseServerTimestamp(startedAt).getTime()) / 1000
    );
  } else if (startedAt) {
    elapsedSeconds = Math.round((Date.now() - parseServerTimestamp(startedAt).getTime()) / 1000);
  }

  return (
    <div className="sudoku-page">
      {self && opponent && (
        <div className="sudoku-score">
          {self.display_name} {score[self.id] || 0} – {opponent.display_name} {score[opponent.id] || 0}
        </div>
      )}
      {startedAt && <div className="sudoku-timer">{formatElapsed(elapsedSeconds)}</div>}
      <div className="sudoku-grid">
        {cells.map((value, i) => {
          const col = i % 9;
          const row = Math.floor(i / 9);
          const classes = ['sudoku-cell'];
          if (puzzle[i] !== '0') classes.push('given');
          if (i === selectedIndex) classes.push('selected');
          if (i === wrongFlashIndex) classes.push('wrong-flash');
          if (col === 2 || col === 5) classes.push('border-right-thick');
          if (row === 2 || row === 5) classes.push('border-bottom-thick');
          return (
            <div
              key={i}
              className={classes.join(' ')}
              onClick={() => {
                if (puzzle[i] === '0' && !finishedAt) setSelectedIndex(i);
              }}
            >
              {value !== '0' ? value : ''}
            </div>
          );
        })}
      </div>
      {!finishedAt && (
        <div className="sudoku-numpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" onClick={() => handleDigit(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      {finishedAt && !opponentFinished && (
        <p>Waiting on {opponent ? opponent.display_name : 'your partner'} to finish today's puzzle.</p>
      )}
      {todayResult && (
        <p>
          {todayResult.winner === 'tie' && "Today's puzzle was a tie."}
          {todayResult.winner === 'you' && 'You won today!'}
          {todayResult.winner === 'opponent' &&
            `${opponent ? opponent.display_name : 'Your partner'} won today.`}
          {' '}({formatElapsed(todayResult.yourSeconds)} vs {formatElapsed(todayResult.opponentSeconds)})
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modify `client/src/App.jsx` to add the Sudoku tab**

Change the import block from:
```js
import { WordlePage } from './pages/Wordle';
import { ForestSpirit } from './components/ForestSpirit';
```
to:
```js
import { WordlePage } from './pages/Wordle';
import { SudokuPage } from './pages/Sudoku';
import { ForestSpirit } from './components/ForestSpirit';
```

Change the nav buttons from:
```jsx
        <nav>
          <button onClick={() => setTab('calendar')}>Calendar</button>
          <button onClick={() => setTab('notes')}>Notes</button>
          <button onClick={() => setTab('wordle')}>Wordle</button>
        </nav>
```
to:
```jsx
        <nav>
          <button onClick={() => setTab('calendar')}>Calendar</button>
          <button onClick={() => setTab('notes')}>Notes</button>
          <button onClick={() => setTab('wordle')}>Wordle</button>
          <button onClick={() => setTab('sudoku')}>Sudoku</button>
        </nav>
```

Change the tab render block from:
```jsx
      {tab === 'calendar' && <CalendarPage />}
      {tab === 'notes' && <NotesPage currentUserId={user.id} />}
      {tab === 'wordle' && <WordlePage currentUserId={user.id} />}
```
to:
```jsx
      {tab === 'calendar' && <CalendarPage />}
      {tab === 'notes' && <NotesPage currentUserId={user.id} />}
      {tab === 'wordle' && <WordlePage currentUserId={user.id} />}
      {tab === 'sudoku' && <SudokuPage currentUserId={user.id} />}
```

- [ ] **Step 3: Add Sudoku styles to `client/src/index.css`**

Append:

```css
.sudoku-score {
  font-weight: bold;
  margin-bottom: 8px;
}

.sudoku-timer {
  font-weight: 600;
  color: #6b5560;
  margin-bottom: 12px;
}

.sudoku-grid {
  display: grid;
  grid-template-columns: repeat(9, 36px);
  grid-template-rows: repeat(9, 36px);
  background: #4a3540;
  gap: 1px;
  padding: 2px;
  border-radius: 12px;
  margin-bottom: 16px;
  width: fit-content;
}

.sudoku-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fffafc;
  color: #4a3540;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.sudoku-cell.given {
  background: #f6e8ee;
  color: #6b5560;
  cursor: default;
}

.sudoku-cell.selected {
  outline: 3px solid #f4b8d0;
  outline-offset: -3px;
}

.sudoku-cell.wrong-flash {
  background: #f6c6c6;
}

.sudoku-cell.border-right-thick {
  border-right: 2px solid #4a3540;
}

.sudoku-cell.border-bottom-thick {
  border-bottom: 2px solid #4a3540;
}

.sudoku-numpad {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.sudoku-numpad button {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
}
```

- [ ] **Step 4: Verify (adjusted for this environment — no browser automation guaranteed to be available)**

1. Run `cd client && node ./node_modules/vitest/vitest.mjs run` (no path filter) — confirm all existing client tests still pass.
2. Run a production build to catch JSX errors: from `client/`, run `node ./node_modules/vite/bin/vite.js build` (do NOT use `npm run build` or `npx` — both broken in this environment due to the `&` in the repo path). Confirm it completes and produces `client/dist/`.
3. If a browser automation tool is available in this environment, do a real end-to-end check: start the backend (`cd server && DB_PATH=/tmp/sudoku-verify.db PORT=3000 SESSION_SECRET=test USER1_USERNAME=ryan USER1_PASSWORD=testpass1 USER1_DISPLAY_NAME=Ryan USER2_USERNAME=sam USER2_PASSWORD=testpass2 USER2_DISPLAY_NAME=Sam node index.js`) and the frontend (`cd client && node ./node_modules/vite/bin/vite.js`), log in as Ryan, open the Sudoku tab, click a blank cell, enter a few digits (both a correct one from the puzzle's actual solution and a deliberately wrong one, confirmed via reading `server/data/sudoku-puzzles.csv`'s chosen row or by inspecting the day's row directly in the temp SQLite file), and confirm: wrong entries are rejected with a visual flash and never land, the timer starts after the first correct entry, reloading the page mid-solve restores your entered digits from `localStorage`, and finishing is followed by "Waiting on Sam" until Sam (logged in via a second session) also finishes, at which point both sides show the correct winner and times. Clean up the temp DB and stop both servers afterward.
4. If no browser automation tool is available, skip step 3 and say so in the report — this is an accepted, expected limitation of this environment, not a gap in the work.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Sudoku.jsx client/src/App.jsx client/src/index.css
git commit -m "feat: add Sudoku page, tab, and styling"
```

---

## Final Verification

- [ ] Run the full backend suite: `cd server && node ./node_modules/vitest/vitest.mjs run` — all pass.
- [ ] Run the full frontend suite: `cd client && node ./node_modules/vitest/vitest.mjs run` — all pass.
- [ ] Manual end-to-end check from Task 5, Step 4, covering both accounts, the hidden-until-both-finish reveal, and the localStorage reload-resilience behavior.
- [ ] Confirm `GET /api/sudoku/score` reflects the updated tally correctly after the manual run above.
- [ ] Confirm the existing Wordle feature still works end-to-end after Task 1's refactor (its own test suite passing is the primary signal; a quick manual play-through is a reasonable extra check).
