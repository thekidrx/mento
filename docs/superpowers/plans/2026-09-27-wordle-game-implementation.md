# Daily Wordle Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily, head-to-head Wordle game between the two seeded accounts, with a running win tally, as a new "Wordle" tab on the existing site.

**Architecture:** Fully server-authoritative — the server picks the day's word, validates every guess, and computes feedback; the client only ever sees its own guesses/feedback, plus a boolean for whether the opponent has finished, until both are done. Reuses the app's existing SQLite database and session auth.

**Tech Stack:** Node.js + Express + better-sqlite3 (existing backend), React (existing frontend), Vitest + Supertest (existing test setup). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-wordle-game-design.md`

## Global Constraints

- Classic Wordle rules: 5-letter word, 6 guesses max, green/yellow/gray per-letter feedback.
- One word per calendar day (server's local date), identical for both accounts.
- A user's guesses and result are hidden from the other until both have finished that day (solved or used all 6 guesses).
- Scoring: fewer guesses wins the day; a tie (equal guess count, including both failing) awards no point; not playing before the day rolls over counts as failing all 6 guesses.
- No history/archive of past puzzles — only today's puzzle and the cumulative score are shown.
- Word lists are bundled static files — no network calls at runtime.
- Mounted behind the existing `requireAuth` middleware — no new auth concepts.

## Review Focus

- Duplicate letters in a guess (more copies than the answer has) must not over-mark as yellow — the second extra letter must be gray, not yellow.
- Guesses must be case-insensitive (`crane` and `CRANE` must behave identically).
- The opponent's guesses, feedback, and guess count must never appear in `/api/wordle/today` before the opponent has finished — not even indirectly.
- `GET /api/wordle/score` must return a zero-filled tally (not an error) when no `wordle_days` rows exist yet.
- A past day where a user never finished must be scored as a loss for them, while an *unfinished today* must be excluded from the tally entirely — these are different rules and easy to conflate.

---

### Task 1: Wordle feedback algorithm

**Files:**
- Create: `server/wordleLogic.js`
- Test: `server/__tests__/wordleLogic.test.js`

**Interfaces:**
- Produces: `computeFeedback(guess: string, answer: string) -> string` — both inputs are 5-character uppercase strings; returns a 5-character string of `G`/`Y`/`B` per letter. Exported from `server/wordleLogic.js`.

- [ ] **Step 1: Write the failing tests**

```js
// server/__tests__/wordleLogic.test.js
const { computeFeedback } = require('../wordleLogic');

describe('computeFeedback', () => {
  it('marks every letter green on an exact match', () => {
    expect(computeFeedback('CRANE', 'CRANE')).toBe('GGGGG');
  });

  it('handles a guess and answer that share letters at different positions and counts', () => {
    // answer ERASE has two E's; guess SPEED has two E's and a D not in the answer.
    expect(computeFeedback('SPEED', 'ERASE')).toBe('YBYYB');
  });

  it('only marks a repeated guess letter yellow once when the answer has fewer copies', () => {
    // answer MODEL has one L; guess ALLOT has two L's, so only the first should be yellow.
    expect(computeFeedback('ALLOT', 'MODEL')).toBe('BYBYB');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/wordleLogic.test.js`
Expected: FAIL — `../wordleLogic` module not found.

- [ ] **Step 3: Create `server/wordleLogic.js`**

```js
function computeFeedback(guess, answer) {
  const result = new Array(5).fill('B');
  const guessLetters = guess.split('');
  const answerLetters = answer.split('');
  const remaining = {};

  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === answerLetters[i]) {
      result[i] = 'G';
    } else {
      remaining[answerLetters[i]] = (remaining[answerLetters[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === 'G') continue;
    const letter = guessLetters[i];
    if (remaining[letter] > 0) {
      result[i] = 'Y';
      remaining[letter] -= 1;
    }
  }

  return result.join('');
}

module.exports = { computeFeedback };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/wordleLogic.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/wordleLogic.js server/__tests__/wordleLogic.test.js
git commit -m "feat: add Wordle feedback algorithm"
```

---

### Task 2: Word lists, word selection, and scoring helpers

**Files:**
- Create: `server/data/wordle-answers.txt`
- Create: `server/data/wordle-guesses.txt`
- Modify: `server/wordleLogic.js` (add loading, selection, and scoring functions)
- Test: `server/__tests__/wordleLogic.test.js` (add test cases)

**Interfaces:**
- Consumes: nothing new.
- Produces (all from `server/wordleLogic.js`, alongside `computeFeedback`):
  - `loadAnswerWords() -> string[]` — uppercase 5-letter words, the pool the daily answer is drawn from.
  - `loadValidGuessSet() -> Set<string>` — uppercase 5-letter words, the union of the answers list and the broader guesses list; anything a player may submit.
  - `pickDailyWord(answerWords: string[], usedWords: string[]) -> string` — picks randomly from `answerWords` excluding anything in `usedWords` (case-insensitive); if every word has been used, falls back to picking from the full `answerWords`.
  - `computeGuessCount(guesses: { feedback: string }[], maxGuesses = 6) -> number | null` — 1-based index of the first `GGGGG` feedback if solved; `Infinity` if `guesses.length >= maxGuesses` with no solve; `null` if still in progress.
  - `computeScoreTally(days: { counts: Record<number, number> }[], userAId: number, userBId: number) -> Record<number, number>` — for each day, whichever of the two ids has the lower `counts` value gets +1; equal values (including both `Infinity`) add nothing to either.

- [ ] **Step 1: Fetch the word list data files**

These are two well-established, freely-republished open-source Wordle word lists (already used by countless open-source Wordle clones): one of common answer words, one of additional valid-but-less-common guesses.

Run:
```bash
mkdir -p server/data
curl -s -o server/data/wordle-answers.txt https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt
curl -s -o server/data/wordle-guesses.txt https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw/wordle-allowed-guesses.txt
wc -l server/data/wordle-answers.txt server/data/wordle-guesses.txt
```
Expected: both files non-empty (roughly 1,000 and 8,500 lines respectively), one lowercase 5-letter word per line.

- [ ] **Step 2: Write the failing tests**

Append to `server/__tests__/wordleLogic.test.js`. Note: `computeFeedback` is
already imported at the top of this file from Task 1 — do not re-import it,
or Node will throw `SyntaxError: Identifier 'computeFeedback' has already
been declared`. Only import the new functions:

```js
const {
  loadAnswerWords,
  loadValidGuessSet,
  pickDailyWord,
  computeGuessCount,
  computeScoreTally,
} = require('../wordleLogic');

describe('loadAnswerWords', () => {
  it('loads a non-empty list of uppercase 5-letter words including a known common word', () => {
    const words = loadAnswerWords();
    expect(words.length).toBeGreaterThan(100);
    expect(words).toContain('ABOUT');
    expect(words.every((w) => /^[A-Z]{5}$/.test(w))).toBe(true);
  });
});

describe('loadValidGuessSet', () => {
  it('includes both answer words and the broader guess list', () => {
    const set = loadValidGuessSet();
    expect(set.has('ABOUT')).toBe(true);
    expect(set.has('AAHED')).toBe(true);
    expect(set.has('ZZZZZ')).toBe(false);
  });
});

describe('pickDailyWord', () => {
  it('excludes already-used words when an unused one remains', () => {
    const answers = ['ALPHA', 'BRAVO', 'CHARL'];
    const used = ['ALPHA', 'BRAVO'];
    expect(pickDailyWord(answers, used)).toBe('CHARL');
  });

  it('falls back to the full list once every word has been used', () => {
    const answers = ['ALPHA', 'BRAVO'];
    const used = ['ALPHA', 'BRAVO'];
    expect(answers).toContain(pickDailyWord(answers, used));
  });
});

describe('computeGuessCount', () => {
  it('returns null while still in progress', () => {
    expect(computeGuessCount([{ feedback: 'BBBBB' }, { feedback: 'YBBBB' }])).toBeNull();
  });

  it('returns the 1-based guess number on a solve', () => {
    expect(
      computeGuessCount([{ feedback: 'BBBBB' }, { feedback: 'GGGGG' }, { feedback: 'GGGGG' }])
    ).toBe(2);
  });

  it('returns Infinity after 6 guesses with no solve', () => {
    const guesses = new Array(6).fill({ feedback: 'BBBBB' });
    expect(computeGuessCount(guesses)).toBe(Infinity);
  });
});

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

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/wordleLogic.test.js`
Expected: FAIL — the new exports don't exist yet.

- [ ] **Step 4: Add the new functions to `server/wordleLogic.js`**

```js
const fs = require('fs');
const path = require('path');

function loadWordListFile(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((w) => w.trim().toUpperCase())
    .filter((w) => w.length === 5);
}

function loadAnswerWords() {
  return loadWordListFile('wordle-answers.txt');
}

function loadValidGuessSet() {
  const answers = loadWordListFile('wordle-answers.txt');
  const guesses = loadWordListFile('wordle-guesses.txt');
  return new Set([...answers, ...guesses]);
}

function pickDailyWord(answerWords, usedWords) {
  const usedSet = new Set(usedWords.map((w) => w.toUpperCase()));
  const available = answerWords.filter((w) => !usedSet.has(w));
  const pool = available.length > 0 ? available : answerWords;
  return pool[Math.floor(Math.random() * pool.length)];
}

function computeGuessCount(guesses, maxGuesses = 6) {
  const solvedIndex = guesses.findIndex((g) => g.feedback === 'GGGGG');
  if (solvedIndex !== -1) return solvedIndex + 1;
  if (guesses.length >= maxGuesses) return Infinity;
  return null;
}

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

module.exports = {
  computeFeedback,
  loadAnswerWords,
  loadValidGuessSet,
  pickDailyWord,
  computeGuessCount,
  computeScoreTally,
};
```

(Keep the existing `computeFeedback` function above these — this adds to the file, it doesn't replace it.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/wordleLogic.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 6: Commit**

```bash
git add server/data/wordle-answers.txt server/data/wordle-guesses.txt server/wordleLogic.js server/__tests__/wordleLogic.test.js
git commit -m "feat: add Wordle word lists, daily word selection, and scoring helpers"
```

---

### Task 3: Wordle API routes

**Files:**
- Modify: `server/schema.sql` (add `wordle_days`, `wordle_guesses` tables)
- Create: `server/routes/wordle.js`
- Modify: `server/app.js` (mount the Wordle router)
- Test: `server/__tests__/wordle.test.js`

**Interfaces:**
- Consumes: `requireAuth` (from `server/auth.js`), `computeFeedback`, `computeGuessCount`, `computeScoreTally`, `pickDailyWord`, `loadAnswerWords`, `loadValidGuessSet` (all from `server/wordleLogic.js`, Tasks 1–2).
- Produces: `createWordleRouter(db)` from `server/routes/wordle.js`, mounted at `/api/wordle` behind `requireAuth`.
- Routes:
  - `GET /api/wordle/today` → `{ guesses: {guess, feedback}[], solved: bool, failed: bool, guessesRemaining: number, opponentFinished: bool, todayResult?: { yourGuesses, opponentGuesses, winner: 'you'|'opponent'|'tie' } }`. `todayResult` is present only once both users have finished.
  - `POST /api/wordle/guess` with body `{ guess }` → `201 { guess, feedback }`, or `400` if the game is already over for that user, the guess isn't a valid 5-letter word, or it repeats an earlier guess from the same user today.
  - `GET /api/wordle/score` → `{ "<userId>": winCount, ... }` for both seeded users.

- [ ] **Step 1: Add the new tables to `server/schema.sql`**

Append to the end of the file:

```sql

CREATE TABLE IF NOT EXISTS wordle_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  word TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wordle_guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES wordle_days(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  guess TEXT NOT NULL,
  feedback TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(day_id, user_id, guess)
);
```

- [ ] **Step 2: Write the failing tests**

```js
// server/__tests__/wordle.test.js
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
    expect(ryanView.body.todayResult).toEqual({ yourGuesses: 1, opponentGuesses: 6, winner: 'you' });

    const samView = await samAgent.get('/api/wordle/today');
    expect(samView.body.todayResult).toEqual({ yourGuesses: 6, opponentGuesses: 1, winner: 'opponent' });
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/wordle.test.js`
Expected: FAIL — 404s, no Wordle router mounted yet.

- [ ] **Step 4: Create `server/routes/wordle.js`**

```js
const express = require('express');
const {
  computeFeedback,
  computeGuessCount,
  computeScoreTally,
  pickDailyWord,
  loadAnswerWords,
  loadValidGuessSet,
} = require('../wordleLogic');

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getOrCreateDay(db, date) {
  const existing = db.prepare('SELECT * FROM wordle_days WHERE date = ?').get(date);
  if (existing) return existing;
  const usedWords = db.prepare('SELECT word FROM wordle_days').all().map((r) => r.word);
  const word = pickDailyWord(loadAnswerWords(), usedWords);
  const result = db.prepare('INSERT INTO wordle_days (date, word) VALUES (?, ?)').run(date, word);
  return { id: result.lastInsertRowid, date, word };
}

function getGuesses(db, dayId, userId) {
  return db
    .prepare(
      'SELECT guess, feedback FROM wordle_guesses WHERE day_id = ? AND user_id = ? ORDER BY id ASC'
    )
    .all(dayId, userId);
}

function otherUserId(db, userId) {
  const row = db.prepare('SELECT id FROM users WHERE id != ?').get(userId);
  return row ? row.id : null;
}

function createWordleRouter(db) {
  const router = express.Router();
  const validGuessSet = loadValidGuessSet();

  router.get('/today', (req, res) => {
    const day = getOrCreateDay(db, todayDateString());
    const guesses = getGuesses(db, day.id, req.session.userId);
    const yourCount = computeGuessCount(guesses);

    const opponentId = otherUserId(db, req.session.userId);
    const opponentGuesses = opponentId ? getGuesses(db, day.id, opponentId) : [];
    const opponentCount = computeGuessCount(opponentGuesses);
    const opponentFinished = opponentCount !== null;

    const response = {
      guesses,
      solved: yourCount !== null && yourCount !== Infinity,
      failed: yourCount === Infinity,
      guessesRemaining: 6 - guesses.length,
      opponentFinished,
    };

    if (yourCount !== null && opponentFinished) {
      response.todayResult = {
        yourGuesses: guesses.length,
        opponentGuesses: opponentGuesses.length,
        winner: yourCount < opponentCount ? 'you' : yourCount > opponentCount ? 'opponent' : 'tie',
      };
    }

    res.json(response);
  });

  router.post('/guess', (req, res) => {
    const day = getOrCreateDay(db, todayDateString());
    const guesses = getGuesses(db, day.id, req.session.userId);

    if (computeGuessCount(guesses) !== null) {
      return res.status(400).json({ error: "Today's game is already over" });
    }

    const guess = String(req.body.guess || '').trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(guess)) {
      return res.status(400).json({ error: 'Guess must be a 5-letter word' });
    }
    if (!validGuessSet.has(guess)) {
      return res.status(400).json({ error: 'Not a valid word' });
    }
    if (guesses.some((g) => g.guess === guess)) {
      return res.status(400).json({ error: 'You already tried that word today' });
    }

    const feedback = computeFeedback(guess, day.word);
    db.prepare(
      'INSERT INTO wordle_guesses (day_id, user_id, guess, feedback) VALUES (?, ?, ?, ?)'
    ).run(day.id, req.session.userId, guess, feedback);

    res.status(201).json({ guess, feedback });
  });

  router.get('/score', (req, res) => {
    const users = db.prepare('SELECT id FROM users ORDER BY id').all();
    if (users.length < 2) {
      return res.json({});
    }
    const [userA, userB] = users;
    const today = todayDateString();
    const days = db.prepare('SELECT * FROM wordle_days ORDER BY date ASC').all();

    const resolvedDays = [];
    for (const day of days) {
      const countA = computeGuessCount(getGuesses(db, day.id, userA.id));
      const countB = computeGuessCount(getGuesses(db, day.id, userB.id));
      if (day.date === today) {
        if (countA === null || countB === null) continue;
        resolvedDays.push({ counts: { [userA.id]: countA, [userB.id]: countB } });
      } else {
        resolvedDays.push({
          counts: {
            [userA.id]: countA === null ? Infinity : countA,
            [userB.id]: countB === null ? Infinity : countB,
          },
        });
      }
    }

    res.json(computeScoreTally(resolvedDays, userA.id, userB.id));
  });

  return router;
}

module.exports = { createWordleRouter };
```

- [ ] **Step 5: Modify `server/app.js` to mount the Wordle router**

Change the import line:
```js
const { createNotesRouter } = require('./routes/notes');
```
to:
```js
const { createNotesRouter } = require('./routes/notes');
const { createWordleRouter } = require('./routes/wordle');
```

Add a new mount line directly after the notes router mount (before the `/api` 404 handler):
```js
  app.use('/api/notes', requireAuth, createNotesRouter(db));
  app.use('/api/wordle', requireAuth, createWordleRouter(db));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/wordle.test.js`
Expected: PASS (12 tests)

- [ ] **Step 7: Run the full backend suite**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run`
Expected: All tests across health/auth/events/notes/wordleLogic/wordle PASS.

- [ ] **Step 8: Commit**

```bash
git add server/schema.sql server/routes/wordle.js server/app.js server/__tests__/wordle.test.js
git commit -m "feat: add Wordle API routes with hidden-until-both-finish scoring"
```

---

### Task 4: Users list endpoint

**Files:**
- Create: `server/routes/users.js`
- Modify: `server/app.js` (mount the users router)
- Test: `server/__tests__/users.test.js`

**Interfaces:**
- Consumes: `requireAuth` (from `server/auth.js`).
- Produces: `createUsersRouter(db)` from `server/routes/users.js`, mounted at `/api/users` behind `requireAuth`. `GET /api/users` → `[{ id, display_name }, ...]` for both seeded users, ordered by id. Needed by the frontend to label the score tally and identify "your partner" by name.

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/users.test.js
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

describe('users API', () => {
  it('rejects unauthenticated requests', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lists both seeded users with their display names', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'ryan', password: 'testpass' });

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((u) => u.display_name).sort()).toEqual(['Ryan', 'Sam']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/users.test.js`
Expected: FAIL — 404, no users router mounted.

- [ ] **Step 3: Create `server/routes/users.js`**

```js
const express = require('express');

function createUsersRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const users = db.prepare('SELECT id, display_name FROM users ORDER BY id').all();
    res.json(users);
  });

  return router;
}

module.exports = { createUsersRouter };
```

- [ ] **Step 4: Modify `server/app.js` to mount the users router**

Change the import line:
```js
const { createWordleRouter } = require('./routes/wordle');
```
to:
```js
const { createWordleRouter } = require('./routes/wordle');
const { createUsersRouter } = require('./routes/users');
```

Add a new mount line after the Wordle router mount:
```js
  app.use('/api/wordle', requireAuth, createWordleRouter(db));
  app.use('/api/users', requireAuth, createUsersRouter(db));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && node ./node_modules/vitest/vitest.mjs run __tests__/users.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add server/routes/users.js server/app.js server/__tests__/users.test.js
git commit -m "feat: add users list endpoint"
```

---

### Task 5: Client-side Wordle logic and API methods

**Files:**
- Create: `client/src/pages/wordleLogic.js`
- Modify: `client/src/api.js` (add Wordle/users methods)
- Test: `client/src/__tests__/wordleLogic.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `normalizeGuess(input: string) -> string` — trims and uppercases.
  - `isValidShape(guess: string) -> boolean` — true iff exactly 5 letters A-Z.
  - `buildKeyboardState(guesses: { guess: string, feedback: string }[]) -> Record<string, 'G'|'Y'|'B'>` — per-letter best-known status across all guesses (G beats Y beats B; a later worse result never downgrades an already-known better one).
  - `api.getUsers()`, `api.getWordleToday()`, `api.submitWordleGuess(guess)`, `api.getWordleScore()` — added to the existing `api` object in `client/src/api.js`, following the same `request()` helper pattern as the existing methods.

- [ ] **Step 1: Write the failing test**

```js
// client/src/__tests__/wordleLogic.test.js
import { describe, it, expect } from 'vitest';
import { normalizeGuess, isValidShape, buildKeyboardState } from '../pages/wordleLogic';

describe('normalizeGuess', () => {
  it('trims whitespace and uppercases', () => {
    expect(normalizeGuess('  crane ')).toBe('CRANE');
  });
});

describe('isValidShape', () => {
  it('accepts exactly 5 letters', () => {
    expect(isValidShape('CRANE')).toBe(true);
  });

  it('rejects the wrong length or non-letters', () => {
    expect(isValidShape('CRAN')).toBe(false);
    expect(isValidShape('12345')).toBe(false);
  });
});

describe('buildKeyboardState', () => {
  it('tracks the best-known feedback per letter', () => {
    const guesses = [{ guess: 'CRANE', feedback: 'BYGBB' }];
    const state = buildKeyboardState(guesses);
    expect(state).toEqual({ C: 'B', R: 'Y', A: 'G', N: 'B', E: 'B' });
  });

  it('never downgrades a letter from a better-known status', () => {
    const guesses = [
      { guess: 'CRANE', feedback: 'GBBBB' }, // C is green
      { guess: 'CHESS', feedback: 'BBBBB' }, // C is black here, should not override green
    ];
    expect(buildKeyboardState(guesses).C).toBe('G');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && node ./node_modules/vitest/vitest.mjs run src/__tests__/wordleLogic.test.js`
Expected: FAIL — `../pages/wordleLogic` not found.

- [ ] **Step 3: Create `client/src/pages/wordleLogic.js`**

```js
export function normalizeGuess(input) {
  return input.trim().toUpperCase();
}

export function isValidShape(guess) {
  return /^[A-Z]{5}$/.test(guess);
}

const PRIORITY = { G: 3, Y: 2, B: 1 };

export function buildKeyboardState(guesses) {
  const state = {};
  for (const { guess, feedback } of guesses) {
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      const mark = feedback[i];
      if (!state[letter] || PRIORITY[mark] > PRIORITY[state[letter]]) {
        state[letter] = mark;
      }
    }
  }
  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && node ./node_modules/vitest/vitest.mjs run src/__tests__/wordleLogic.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the new methods to `client/src/api.js`**

Add to the exported `api` object (alongside the existing `getNotes`/`createNote`/`deleteNote` entries):

```js
  getUsers: () => request('/users'),
  getWordleToday: () => request('/wordle/today'),
  submitWordleGuess: (guess) =>
    request('/wordle/guess', { method: 'POST', body: JSON.stringify({ guess }) }),
  getWordleScore: () => request('/wordle/score'),
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/wordleLogic.js client/src/api.js client/src/__tests__/wordleLogic.test.js
git commit -m "feat: add client-side Wordle logic and API methods"
```

---

### Task 6: Wordle page, tab wiring, and styling

**Files:**
- Create: `client/src/pages/Wordle.jsx`
- Modify: `client/src/App.jsx` (add the Wordle tab)
- Modify: `client/src/index.css` (add grid/keyboard styles)

**Interfaces:**
- Consumes: `api.getWordleToday`, `api.submitWordleGuess`, `api.getWordleScore`, `api.getUsers` (Task 5); `normalizeGuess`, `isValidShape`, `buildKeyboardState` (Task 5).
- Produces: `<WordlePage currentUserId />` component, rendered in a new "Wordle" tab.

This task is UI wiring with its logic already unit-tested in Task 5; it's verified manually against the running backend.

- [ ] **Step 1: Create `client/src/pages/Wordle.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import { normalizeGuess, isValidShape, buildKeyboardState } from './wordleLogic';

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

export function WordlePage({ currentUserId }) {
  const [guesses, setGuesses] = useState([]);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [todayResult, setTodayResult] = useState(null);
  const [score, setScore] = useState({});
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadToday();
    loadScore();
    loadUsers();
  }, []);

  async function loadToday() {
    const data = await api.getWordleToday();
    setGuesses(data.guesses);
    setSolved(data.solved);
    setFailed(data.failed);
    setOpponentFinished(data.opponentFinished);
    setTodayResult(data.todayResult || null);
  }

  async function loadScore() {
    setScore(await api.getWordleScore());
  }

  async function loadUsers() {
    setUsers(await api.getUsers());
  }

  async function submitGuess(rawInput) {
    setError('');
    const guess = normalizeGuess(rawInput);
    if (!isValidShape(guess)) {
      setError('Guess must be 5 letters');
      return;
    }
    try {
      await api.submitWordleGuess(guess);
      setInput('');
      await loadToday();
      await loadScore();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleKey(key) {
    if (solved || failed) return;
    if (key === 'ENTER') {
      submitGuess(input);
    } else if (key === 'BACKSPACE') {
      setInput((prev) => prev.slice(0, -1));
    } else if (/^[A-Z]$/.test(key)) {
      setInput((prev) => (prev.length < 5 ? prev + key : prev));
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      const key = e.key.toUpperCase();
      if (key === 'ENTER' || key === 'BACKSPACE' || /^[A-Z]$/.test(key)) {
        handleKey(key);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const self = users.find((u) => u.id === currentUserId);
  const opponent = users.find((u) => u.id !== currentUserId);
  const keyboardState = buildKeyboardState(guesses);

  const rows = [];
  for (let i = 0; i < 6; i++) {
    if (guesses[i]) {
      rows.push({ letters: guesses[i].guess.split(''), feedback: guesses[i].feedback.split('') });
    } else if (i === guesses.length && !solved && !failed) {
      rows.push({ letters: input.padEnd(5).split(''), feedback: null });
    } else {
      rows.push({ letters: ['', '', '', '', ''], feedback: null });
    }
  }

  return (
    <div className="wordle-page">
      {self && opponent && (
        <div className="wordle-score">
          {self.display_name} {score[self.id] || 0} – {opponent.display_name} {score[opponent.id] || 0}
        </div>
      )}
      <div className="wordle-grid">
        {rows.map((row, i) => (
          <div key={i} className="wordle-row">
            {row.letters.map((letter, j) => (
              <div
                key={j}
                className={`wordle-tile${row.feedback ? ` feedback-${row.feedback[j]}` : ''}`}
              >
                {letter.trim()}
              </div>
            ))}
          </div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {(solved || failed) && !opponentFinished && (
        <p>Waiting on {opponent ? opponent.display_name : 'your partner'} to finish today's puzzle.</p>
      )}
      {todayResult && (
        <p>
          {todayResult.winner === 'tie' && "Today's puzzle was a tie."}
          {todayResult.winner === 'you' && 'You won today!'}
          {todayResult.winner === 'opponent' &&
            `${opponent ? opponent.display_name : 'Your partner'} won today.`}
          {' '}({todayResult.yourGuesses} vs {todayResult.opponentGuesses} guesses)
        </p>
      )}
      <div className="wordle-keyboard">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="wordle-keyboard-row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKey(key)}
                className={`wordle-key${keyboardState[key] ? ` feedback-${keyboardState[key]}` : ''}`}
              >
                {key === 'BACKSPACE' ? '⌫' : key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Modify `client/src/App.jsx` to add the Wordle tab**

Add the import:
```js
import { NotesPage } from './pages/Notes';
```
becomes:
```js
import { NotesPage } from './pages/Notes';
import { WordlePage } from './pages/Wordle';
```

Change the nav buttons from:
```jsx
        <nav>
          <button onClick={() => setTab('calendar')}>Calendar</button>
          <button onClick={() => setTab('notes')}>Notes</button>
        </nav>
```
to:
```jsx
        <nav>
          <button onClick={() => setTab('calendar')}>Calendar</button>
          <button onClick={() => setTab('notes')}>Notes</button>
          <button onClick={() => setTab('wordle')}>Wordle</button>
        </nav>
```

Change the tab render line from:
```jsx
      {tab === 'calendar' ? <CalendarPage /> : <NotesPage currentUserId={user.id} />}
```
to:
```jsx
      {tab === 'calendar' && <CalendarPage />}
      {tab === 'notes' && <NotesPage currentUserId={user.id} />}
      {tab === 'wordle' && <WordlePage currentUserId={user.id} />}
```

- [ ] **Step 3: Add Wordle styles to `client/src/index.css`**

Append:

```css
.wordle-score {
  font-weight: bold;
  margin-bottom: 12px;
}

.wordle-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.wordle-row {
  display: flex;
  gap: 6px;
}

.wordle-tile {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #d3d6da;
  font-weight: bold;
  text-transform: uppercase;
  font-size: 1.5rem;
}

.wordle-tile.feedback-G {
  background: #6aaa64;
  color: white;
  border-color: #6aaa64;
}

.wordle-tile.feedback-Y {
  background: #c9b458;
  color: white;
  border-color: #c9b458;
}

.wordle-tile.feedback-B {
  background: #787c7e;
  color: white;
  border-color: #787c7e;
}

.wordle-keyboard {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wordle-keyboard-row {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.wordle-key {
  padding: 10px 8px;
  border: none;
  border-radius: 4px;
  background: #d3d6da;
  cursor: pointer;
  font-weight: bold;
}

.wordle-key.feedback-G {
  background: #6aaa64;
  color: white;
}

.wordle-key.feedback-Y {
  background: #c9b458;
  color: white;
}

.wordle-key.feedback-B {
  background: #787c7e;
  color: white;
}
```

- [ ] **Step 4: Manually verify the game end-to-end**

With the backend (`cd server && node index.js`) and `cd client && npm run dev` running:
1. Log in as account 1, go to the Wordle tab, confirm an empty 6×5 grid and keyboard appear.
2. Type a 5-letter guess and press Enter (or click "ENTER"); confirm the row colors in and the keyboard updates.
3. Confirm the score line shows both display names with counts.
4. Solve or fail the puzzle as account 1; confirm "Waiting on `<partner>`..." appears and no opponent info is shown.
5. Log out, log in as account 2, play to completion.
6. Log back in as account 1 (or reload); confirm `todayResult` now shows, with the correct winner and guess counts, and the score line has updated.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Wordle.jsx client/src/App.jsx client/src/index.css
git commit -m "feat: add Wordle page, tab, and styling"
```

---

## Final Verification

- [ ] Run the full backend suite: `cd server && node ./node_modules/vitest/vitest.mjs run` — all pass.
- [ ] Run the full frontend suite: `cd client && node ./node_modules/vitest/vitest.mjs run` — all pass.
- [ ] Manual end-to-end check from Task 6, Step 4, covering both accounts and the hidden-until-both-finish reveal.
- [ ] Confirm `GET /api/wordle/score` reflects the updated tally correctly after the manual run above.
