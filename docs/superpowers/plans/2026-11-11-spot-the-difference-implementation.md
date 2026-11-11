# Spot the Difference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily, timed spot-the-difference game with generated scenes, and group the three games under one Games tab.

**Architecture:** The server generates each day's puzzle from a stored random seed, keeps the clock, and judges every tap. The browser draws the two scenes as SVG from plain data, sends taps in scene units, and counts down locally between server answers. Pure logic (generation, judging, scoring) lives in modules with no Express or React in them.

**Tech Stack:** Node, Express 4, better-sqlite3, React 18, Vite, Vitest, supertest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-spot-the-difference-design.md`

## Global Constraints

- No new npm dependencies, environment variables or Docker changes.
- Scene space is 400 by 300 units. Grid: 8 columns by 5 rows, cells 50 wide by 60 high. Cell `id = row * 8 + col`, 0 to 39.
- 32 to 38 objects per scene. Exactly 7 differences. Hit radius 26 units.
- Time limit 45,000 ms. Penalty 3,000 ms per wrong tap. All times are server milliseconds.
- Exact messages: "A tap position is required" (400), "Start the round first" (409), "The round is over" (409).
- Schema changes use `CREATE TABLE IF NOT EXISTS` only.
- Client styling uses the existing CSS custom properties and shared classes. No horizontal scroll at 375px.
- On this Windows machine the folder name contains `&`, which breaks `npm run` and `npx`. Run tools through node directly:
  - Server tests: from `server/`, `node node_modules/vitest/vitest.mjs run`
  - Client tests: from `client/`, `node node_modules/vitest/vitest.mjs run`
  - Client build: from `client/`, `node node_modules/vite/bin/vite.js build`
- Commit messages follow the repo style (`feat: ...`, `fix(scope): ...`).

## Review Focus

Conditions the spec does not spell out but a player will hit. Each has a test or check in the task named.

1. A tap body with numeric strings (`"120"`), `NaN`, `Infinity`, `null` or out-of-range numbers gets 400 and costs no penalty. (Task 2)
2. Two requests for the same difference arriving together record one find; the second answers `repeat` instead of failing on the unique index. (Task 2)
3. A round started just before midnight keeps going after midnight: taps and state lookups use the player's still-running round, not the new day's. (Task 2)
4. Rotating the phone or resizing the window mid-round does not shift taps: the picture's rectangle is measured on every tap, never cached. (Task 6)
5. If the server cannot be reached when the countdown hits zero, the page does not sit on "0.0" forever: it shows the error and asks again when the tab becomes visible or the player taps. (Task 6)

---

### Task 1: Puzzle generator

**Files:**
- Create: `server/spotPuzzle.js`
- Test: `server/__tests__/spotPuzzle.test.js`

**Interfaces:**
- Produces: `generatePuzzle(seed: number): { theme, sceneA, sceneB, differences }`
  - `theme`: `'shelf' | 'garden' | 'picnic'`
  - `sceneA`, `sceneB`: arrays of objects `{ id, type, x, y, size, rotation, colors, count, detail }` in ascending `id`. `colors` is `[{ family, shade }, { family, shade }]`; `count` is an integer 3 to 6 or `null`; `detail` is `true`, `false` or `null` (`null` when the type has no detail).
  - `differences`: `[{ index, id, kind, x, y, r }]`, `index` 0 to 6, `kind` one of `'color' | 'move' | 'turn' | 'size' | 'detail' | 'count'`, `x`/`y` the object's centre in scene A, `r` 26.
- Produces: constants `SCENE_WIDTH = 400`, `SCENE_HEIGHT = 300`, `COLS = 8`, `ROWS = 5`, `CELL_WIDTH = 50`, `CELL_HEIGHT = 60`, `OBJECT_BOX = 28`, `HIT_RADIUS = 26`, `DIFFERENCE_COUNT = 7`.
- Produces: `PALETTE`: `{ pink, coral, yellow, green, blue, purple }`, each an array of three hex colours, light to deep. The client imports nothing from the server; Task 5 copies these values.
- Produces: `OBJECT_TYPES`: `{ [type]: { theme, changes: string[], hasCount: boolean, hasDetail: boolean } }`.

Object types, 8 per theme. Every type supports `color`, `move` and `size`; the table lists what else it supports.

| Theme | Type | turn | count (what) | detail (what) |
| --- | --- | --- | --- | --- |
| shelf | ball | | stripes | |
| shelf | block | yes | | |
| shelf | teddy | | | bow |
| shelf | robot | | buttons | antenna |
| shelf | book | yes | stripes | |
| shelf | car | | | window |
| shelf | rocket | yes | windows | |
| shelf | drum | | stripes | |
| garden | flower | | petals | centre |
| garden | tulip | yes | | |
| garden | mushroom | | dots | |
| garden | butterfly | yes | | antennae |
| garden | snail | | | eye stalks |
| garden | ladybird | yes | dots | |
| garden | leaf | yes | | |
| garden | carrot | yes | stripes | |
| picnic | cup | | | handle |
| picnic | teapot | | | lid knob |
| picnic | cupcake | | sprinkles | cherry |
| picnic | apple | yes | | leaf |
| picnic | sandwich | yes | | |
| picnic | cheese | yes | holes | |
| picnic | cookie | yes | chips | |
| picnic | bottle | yes | | label |

Palette values (light, mid, deep):
`pink` #f9c6d8 #f08fb4 #d6457f · `coral` #fbd0bd #f59e7a #dd6b42 · `yellow` #fbeab0 #f3cc54 #d99a1c · `green` #cfe8d5 #86c79a #3f8f5f · `blue` #c9e2f5 #82b8e4 #3b7fbf · `purple` #dfd0f2 #b294e0 #7c57bd

Generation rules that the tests below do not fully determine:
- Random numbers come from a seeded `mulberry32(seed)` generator; nothing uses `Math.random`.
- Theme: picked by the generator's first draw.
- Filled cells: draw a count from 32 to 38, then choose that many of the 40 cells.
- Object in a cell: centre = cell centre plus jitter, `jx` in [-2, 2] and `jy` in [-7, 7] (integers). `size` is one of 0.85, 0.9, 0.95, 1. `rotation` is an integer from -8 to 8 for types that support `turn`, else 0. The two colours use two different families, each at a random shade. `count` is 3 to 5 for types with a count. `detail` is `true` for types with a detail.
- Choosing the 7: shuffle the objects, then take them greedily, skipping any object in the same or a neighbouring cell (including diagonals) as one already taken, and skipping an object if every change kind it supports has already been used twice. If fewer than 7 are taken, redraw the whole puzzle with the next generator state; the function always returns exactly 7.
- Applying a change to the B copy:
  - `color`: one of the two colours moves one shade within its family (from shade 1, either way; from 0 or 2, to 1).
  - `move`: 7, 8 or 9 units up, down, left or right, choosing only a direction for which the object's box (`OBJECT_BOX * size` on a side, centred on the object) stays inside its cell.
  - `turn`: rotation changes by 18 to 25 degrees, either direction.
  - `size`: multiplied by 1.2, or by 0.8.
  - `detail`: `true` becomes `false`.
  - `count`: plus or minus 1, staying within 3 to 6.

- [ ] **Step 1: Write failing tests in `server/__tests__/spotPuzzle.test.js`**

```js
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const cellOf = (id) => ({ col: id % 8, row: Math.floor(id / 8) });

it('returns the same puzzle for the same seed', () => {
  expect(generatePuzzle(12345)).toEqual(generatePuzzle(12345));
});
it('returns different puzzles for different seeds', () => {
  expect(generatePuzzle(1)).not.toEqual(generatePuzzle(2));
});
it('uses every theme across the seed list', () => {
  expect(new Set(SEEDS.map((s) => generatePuzzle(s).theme))).toEqual(new Set(['shelf', 'garden', 'picnic']));
});

describe.each(SEEDS)('seed %i', (seed) => {
  const { theme, sceneA, sceneB, differences } = generatePuzzle(seed);
  const byId = (scene) => new Map(scene.map((o) => [o.id, o]));

  it('fills 32 to 38 cells with objects of its theme, each inside its cell', () => {
    expect(sceneA.length).toBeGreaterThanOrEqual(32);
    expect(sceneA.length).toBeLessThanOrEqual(38);
    expect(new Set(sceneA.map((o) => o.id)).size).toBe(sceneA.length);
    for (const scene of [sceneA, sceneB]) {
      for (const o of scene) {
        expect(OBJECT_TYPES[o.type].theme).toBe(theme);
        const { col, row } = cellOf(o.id);
        const half = (OBJECT_BOX * o.size) / 2;
        expect(o.x - half).toBeGreaterThanOrEqual(col * 50);
        expect(o.x + half).toBeLessThanOrEqual(col * 50 + 50);
        expect(o.y - half).toBeGreaterThanOrEqual(row * 60);
        expect(o.y + half).toBeLessThanOrEqual(row * 60 + 60);
      }
    }
  });

  it('changes exactly the 7 listed objects and nothing else', () => {
    expect(differences.map((d) => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const changed = new Set(differences.map((d) => d.id));
    expect(changed.size).toBe(7);
    const b = byId(sceneB);
    expect(sceneB.map((o) => o.id)).toEqual(sceneA.map((o) => o.id));
    for (const a of sceneA) {
      if (changed.has(a.id)) expect(b.get(a.id)).not.toEqual(a);
      else expect(b.get(a.id)).toEqual(a);
    }
  });

  it('applies one supported change of the stated amount to each', () => {
    const a = byId(sceneA); const b = byId(sceneB);
    for (const d of differences) {
      const before = a.get(d.id); const after = b.get(d.id);
      expect(OBJECT_TYPES[before.type].changes).toContain(d.kind);
      const same = (keys) => keys.forEach((k) => expect(after[k]).toEqual(before[k]));
      const others = ['x', 'y', 'size', 'rotation', 'colors', 'count', 'detail', 'type'];
      if (d.kind === 'color') {
        same(others.filter((k) => k !== 'colors'));
        const diffs = [0, 1].filter((i) => after.colors[i].shade !== before.colors[i].shade);
        expect(diffs).toHaveLength(1);
        const i = diffs[0];
        expect(after.colors[i].family).toBe(before.colors[i].family);
        expect(Math.abs(after.colors[i].shade - before.colors[i].shade)).toBe(1);
      } else if (d.kind === 'move') {
        same(others.filter((k) => k !== 'x' && k !== 'y'));
        const dx = Math.abs(after.x - before.x); const dy = Math.abs(after.y - before.y);
        expect(Math.min(dx, dy)).toBe(0);
        expect([7, 8, 9]).toContain(Math.max(dx, dy));
      } else if (d.kind === 'turn') {
        same(others.filter((k) => k !== 'rotation'));
        const delta = Math.abs(after.rotation - before.rotation);
        expect(delta).toBeGreaterThanOrEqual(18);
        expect(delta).toBeLessThanOrEqual(25);
      } else if (d.kind === 'size') {
        same(others.filter((k) => k !== 'size'));
        expect([0.8, 1.2]).toContainEqual(Number((after.size / before.size).toFixed(4)));
      } else if (d.kind === 'detail') {
        same(others.filter((k) => k !== 'detail'));
        expect([before.detail, after.detail]).toEqual([true, false]);
      } else {
        same(others.filter((k) => k !== 'count'));
        expect(Math.abs(after.count - before.count)).toBe(1);
        expect(after.count).toBeGreaterThanOrEqual(3);
        expect(after.count).toBeLessThanOrEqual(6);
      }
    }
  });

  it('uses no kind of change more than twice', () => {
    const uses = {};
    for (const d of differences) uses[d.kind] = (uses[d.kind] || 0) + 1;
    expect(Math.max(...Object.values(uses))).toBeLessThanOrEqual(2);
  });

  it('keeps differences out of neighbouring cells and their circles apart', () => {
    for (let i = 0; i < 7; i += 1) {
      for (let j = i + 1; j < 7; j += 1) {
        const p = cellOf(differences[i].id); const q = cellOf(differences[j].id);
        expect(Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row))).toBeGreaterThan(1);
        const dist = Math.hypot(differences[i].x - differences[j].x, differences[i].y - differences[j].y);
        expect(dist).toBeGreaterThan(52);
      }
    }
  });

  it('centres each hit circle on the object as drawn in A, inside the scene', () => {
    const a = byId(sceneA);
    for (const d of differences) {
      expect(d.r).toBe(26);
      expect([d.x, d.y]).toEqual([a.get(d.id).x, a.get(d.id).y]);
      expect(d.x).toBeGreaterThan(0); expect(d.x).toBeLessThan(400);
      expect(d.y).toBeGreaterThan(0); expect(d.y).toBeLessThan(300);
    }
  });
});

it('gives every type the three universal changes and a consistent table', () => {
  expect(Object.keys(OBJECT_TYPES)).toHaveLength(24);
  for (const t of Object.values(OBJECT_TYPES)) {
    expect(t.changes).toEqual(expect.arrayContaining(['color', 'move', 'size']));
    expect(t.changes.includes('count')).toBe(t.hasCount);
    expect(t.changes.includes('detail')).toBe(t.hasDetail);
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run from `server/`: `node node_modules/vitest/vitest.mjs run __tests__/spotPuzzle.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/spotPuzzle.js`** following the rules above.

- [ ] **Step 4: Run and confirm pass**

Run: `node node_modules/vitest/vitest.mjs run __tests__/spotPuzzle.test.js`
Expected: PASS for all 60 seeds.

- [ ] **Step 5: Commit**

```bash
git add server/spotPuzzle.js server/__tests__/spotPuzzle.test.js
git commit -m "feat: add spot-the-difference puzzle generator"
```

---

### Task 2: Round rules and routes

**Files:**
- Create: `server/spotLogic.js`
- Create: `server/routes/spot.js`
- Modify: `server/schema.sql` (append the three tables from the spec)
- Modify: `server/app.js` (mount `/api/spot` behind `requireAuth`, passing `options.now`)
- Test: `server/__tests__/spotLogic.test.js`, `server/__tests__/spot.test.js`

**Interfaces:**
- Consumes: `generatePuzzle`, `DIFFERENCE_COUNT` from Task 1; `computeScoreTally` from `server/gameScoring.js` (lower number wins a day).
- Produces, from `server/spotLogic.js`:
  - `TIME_LIMIT_MS = 45000`, `PENALTY_MS = 3000`
  - `deadlineMs(startedAtMs, wrongTaps): number`
  - `isValidTap(x, y): boolean`
  - `judgeTap(differences, foundIndexes, x, y): { result: 'hit' | 'repeat' | 'miss', index?: number }`
  - `isFinished(round, nowMs): boolean` where `round = { startedAtMs, wrongTaps, findCount }`
  - `playerResult(startedAtMs, findTimesMs): { found, timeMs }`
  - `dayWinner(a, b): 'a' | 'b' | 'tie'` for two `{ found, timeMs }`
  - `rankValue(result | null): number`, lower is better, `Infinity` for `null`
- Produces: `createSpotRouter(db, { now })` and `createApp(db, { now })`; `now` defaults to `Date.now`.
- Produces: the four routes and the round-state shape from the spec's API section.

- [ ] **Step 1: Write failing unit tests in `server/__tests__/spotLogic.test.js`**

```js
const D = [{ index: 0, x: 100, y: 100, r: 26 }, { index: 1, x: 300, y: 100, r: 26 }];

describe('deadlineMs', () => {
  it.each([[1000, 0, 46000], [1000, 1, 43000], [1000, 15, 1000], [1000, 20, -14000]])(
    'start %i, %i wrong → %i', (s, w, d) => { expect(deadlineMs(s, w)).toBe(d); });
});

describe('isValidTap', () => {
  it.each([[0, 0], [400, 300], [123.4, 56.7]])('accepts %j, %j', (x, y) => { expect(isValidTap(x, y)).toBe(true); });
  it.each([['120', 50], [50, '120'], [NaN, 1], [1, Infinity], [null, 1], [undefined, undefined],
           [-0.1, 10], [400.1, 10], [10, -1], [10, 300.1], [{}, 1]])(
    'rejects %j, %j', (x, y) => { expect(isValidTap(x, y)).toBe(false); });
});

describe('judgeTap', () => {
  it('hits inside the radius and on its edge', () => {
    expect(judgeTap(D, [], 100, 100)).toEqual({ result: 'hit', index: 0 });
    expect(judgeTap(D, [], 126, 100)).toEqual({ result: 'hit', index: 0 });
  });
  it('misses just outside the radius', () => {
    expect(judgeTap(D, [], 126.5, 100)).toEqual({ result: 'miss' });
  });
  it('reports a repeat for a difference already found', () => {
    expect(judgeTap(D, [0], 100, 100)).toEqual({ result: 'repeat', index: 0 });
  });
  it('prefers the nearest unfound difference when circles overlap', () => {
    const close = [{ index: 0, x: 100, y: 100, r: 26 }, { index: 1, x: 130, y: 100, r: 26 }];
    expect(judgeTap(close, [], 120, 100)).toEqual({ result: 'hit', index: 1 });
    expect(judgeTap(close, [1], 120, 100)).toEqual({ result: 'hit', index: 0 });
  });
});

describe('isFinished', () => {
  const round = { startedAtMs: 1000, wrongTaps: 0, findCount: 0 };
  it('is still playing one millisecond before the deadline', () => { expect(isFinished(round, 45999)).toBe(false); });
  it('is finished at the deadline', () => { expect(isFinished(round, 46000)).toBe(true); });
  it('is finished early when all 7 are found', () => { expect(isFinished({ ...round, findCount: 7 }, 2000)).toBe(true); });
  it('is finished early when penalties use up the time', () => {
    expect(isFinished({ ...round, wrongTaps: 15 }, 1000)).toBe(true);
  });
});

describe('playerResult', () => {
  it('counts finds and times the last one from the start', () => {
    expect(playerResult(1000, [4000, 9000, 6000])).toEqual({ found: 3, timeMs: 8000 });
  });
  it('is zero for no finds', () => { expect(playerResult(1000, [])).toEqual({ found: 0, timeMs: 0 }); });
});

describe('dayWinner and rankValue', () => {
  it.each([
    [{ found: 5, timeMs: 40000 }, { found: 4, timeMs: 10000 }, 'a'],
    [{ found: 4, timeMs: 30000 }, { found: 4, timeMs: 29999 }, 'b'],
    [{ found: 4, timeMs: 30000 }, { found: 4, timeMs: 30000 }, 'tie'],
    [{ found: 0, timeMs: 0 }, { found: 0, timeMs: 0 }, 'tie'],
    [{ found: 1, timeMs: 44000 }, { found: 0, timeMs: 0 }, 'a'],
  ])('%j vs %j → %s', (a, b, winner) => {
    expect(dayWinner(a, b)).toBe(winner);
    const sign = Math.sign(rankValue(a) - rankValue(b));
    expect(sign).toBe(winner === 'a' ? -1 : winner === 'b' ? 1 : 0);
  });
  it('ranks someone who did not play last', () => {
    expect(rankValue(null)).toBe(Infinity);
    expect(rankValue({ found: 0, timeMs: 0 })).toBeLessThan(Infinity);
  });
});
```

- [ ] **Step 2: Run and confirm failure**, then **implement `server/spotLogic.js`** and confirm pass.

Run from `server/`: `node node_modules/vitest/vitest.mjs run __tests__/spotLogic.test.js`
Expected: FAIL (module not found), then PASS after implementing. `rankValue` is `(7 - found) * 10_000_000 + timeMs`.

- [ ] **Step 3: Write failing route tests in `server/__tests__/spot.test.js`**

Setup: `setupTestDb` and `loginAgent` as in `server/__tests__/lists.test.js`. A mutable clock: `let nowMs = Date.UTC(2026, 10, 11, 15, 0, 0); app = createApp(db, { now: () => nowMs })`. Helper `puzzle()` reads the day's seed from `spot_days` and returns `generatePuzzle(seed)`; helper `tapOn(agent, index)` taps that difference's centre; helper `missPoint()` returns a point more than 26 units from every difference (search the grid).

```js
it('hides the scenes until the round starts', async () => {
  const res = await ryan.get('/api/spot/today');
  expect(res.body).toMatchObject({ status: 'not_started', timeLimitMs: 45000, penaltyMs: 3000, total: 7,
    remainingMs: 45000, found: [], wrongTaps: 0, opponentFinished: false });
  for (const key of ['sceneA', 'sceneB', 'theme', 'differences', 'yourResult', 'todayResult']) {
    expect(res.body).not.toHaveProperty(key);
  }
});

it('starts the round, reveals the scenes and keeps the answers back', async () => {
  const res = await ryan.post('/api/spot/start');
  expect(res.body.status).toBe('playing');
  expect(res.body.sceneA).toEqual(puzzle().sceneA);
  expect(res.body.sceneB).toEqual(puzzle().sceneB);
  expect(res.body).not.toHaveProperty('differences');
});

it('does not restart the clock when started twice', ...);
// start; nowMs += 10000; start again → remainingMs 35000; GET today → remainingMs 35000

it('records a hit and returns only that difference', async () => {
  await ryan.post('/api/spot/start'); nowMs += 5000;
  const d = puzzle().differences[3];
  const res = await ryan.post('/api/spot/tap').send({ x: d.x + 10, y: d.y - 10 });
  expect(res.body.result).toBe('hit');
  expect(res.body.index).toBe(3);
  expect(res.body.difference).toEqual({ index: 3, x: d.x, y: d.y, r: 26 });
  expect(res.body.state).toMatchObject({ status: 'playing', found: [3], remainingMs: 40000 });
  expect(res.body.state.foundDifferences).toEqual([{ index: 3, x: d.x, y: d.y, r: 26 }]);
  expect(res.body.state).not.toHaveProperty('differences');
});

it('answers repeat for a difference already found, at no cost', ...);   // wrongTaps stays 0
it('charges 3 seconds for a miss', ...);        // result 'miss'; state.wrongTaps 1; remainingMs 45000 - elapsed - 3000

it.each([[{}], [{ x: '120', y: 50 }], [{ x: 10 }], [{ x: null, y: 1 }], [{ x: -1, y: 10 }], [{ x: 10, y: 301 }]])(
  'rejects tap body %j without a penalty', async (body) => {
    await ryan.post('/api/spot/start');
    const res = await ryan.post('/api/spot/tap').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('A tap position is required');
    expect((await ryan.get('/api/spot/today')).body.wrongTaps).toBe(0);
  });

it('refuses a tap before the round starts', ...);          // 409 'Start the round first'
it('accepts a tap one millisecond before the deadline and refuses one at it', ...);
// nowMs = start + 44999 → hit; nowMs = start + 45000 → 409 'The round is over', body.state.status 'finished'
it('ends the round when penalties use up the remaining time', ...);
// nowMs = start + 40000; two misses → second response state.status 'finished', remainingMs 0
it('finishes early when all 7 are found and reveals the answers', ...);
// 7 hits one second apart → state.status 'finished'; differences equal puzzle().differences mapped to {index,x,y,r};
// yourResult { found: 7, timeMs: 7000 }
it('finishes on time-out without any request being sent', ...);
// start; nowMs += 60000; GET today → status 'finished', yourResult { found: 0, timeMs: 0 }, remainingMs 0

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

it('hides the other player until both are finished, then names the winner', ...);
// ryan finds 3 by 9000ms and times out; sam's GET shows opponentFinished true but no todayResult;
// sam finds 3 by 8000ms and times out → sam: winner 'you', opponentFound 3, opponentTimeMs 9000; ryan: winner 'opponent'
it('calls a day with equal count and time a tie', ...);
it('wins on count before time', ...);            // 2 finds slowly beats 1 find quickly

it('gives both players the same puzzle and a new one the next day', ...);
// sam and ryan start → identical sceneA; nowMs += 24h → GET today is 'not_started'; start → spot_days has 2 rows with different dates

it('keeps a round that runs past midnight', async () => {
  nowMs = new Date(2026, 10, 11, 23, 59, 50).getTime();
  await ryan.post('/api/spot/start');
  const d = puzzle().differences[0];
  nowMs = new Date(2026, 10, 12, 0, 0, 10).getTime();
  const res = await ryan.post('/api/spot/tap').send({ x: d.x, y: d.y });
  expect(res.body.result).toBe('hit');
  expect((await ryan.get('/api/spot/today')).body).toMatchObject({ status: 'playing', found: [0] });
  nowMs += 60000;
  expect((await ryan.get('/api/spot/today')).body.status).toBe('not_started');
  expect(db.prepare('SELECT COUNT(*) AS n FROM spot_days').get().n).toBe(2);
});

it('tallies the all-time score', ...);
// day 1: both finish, ryan wins; day 2: only sam plays; day 3: neither starts (row created by a GET);
// day 4 (today): ryan finished, sam not → score { [ryan]: 1, [sam]: 1 }; then sam finishes with more → { [ryan]: 1, [sam]: 2 }
it('returns an empty score when there are not two users', ...);
it.each([['get', '/api/spot/today'], ['post', '/api/spot/start'], ['post', '/api/spot/tap'], ['get', '/api/spot/score']])(
  'rejects unauthenticated %s %s', ...);        // 401
```

- [ ] **Step 4: Run and confirm failure**

Run: `node node_modules/vitest/vitest.mjs run __tests__/spot.test.js`
Expected: FAIL, routes return 404.

- [ ] **Step 5: Implement the schema, router and mount**

- "Today" is the local date from the injected clock: `new Date(now())` formatted `YYYY-MM-DD` as `todayDateString` does in `server/routes/sudoku.js`.
- `getOrCreateDay(date)` inserts `seed = crypto.randomInt(2 ** 31)` with `INSERT OR IGNORE`, then selects.
- **Which round a request is about:** look up the player's most recent `spot_results` row. If it exists and `isFinished` is false for it, that is the active round, whatever its date. Otherwise the round is today's (which may not exist yet). `GET /today`, `POST /start` and `POST /tap` all use this.
- `POST /tap` runs in one `db.transaction`: load the round, check not started (409) and finished (409 with `state`), validate the body (400), `judgeTap`, then for a hit `INSERT OR IGNORE INTO spot_finds` and, if no row was inserted, answer `repeat`; for a miss, increment `wrong_taps`. The response's `state` is built after the write.
- `remainingMs` is `max(0, deadline - now)` while playing, 45000 before starting, 0 when finished.
- `found` is ordered by `found_at_ms`, then `id`. `foundDifferences` lists the same differences in the same order as `{ index, x, y, r }`; it is `[]` before the round starts.
- `differences` in responses carry only `{ index, x, y, r }`.
- `GET /score` follows `server/routes/sudoku.js`: each day contributes `rankValue` for each user; today is skipped unless both rounds are finished; a past day's unplayed round is `null`. A round on a past day that was started always counts as finished.

- [ ] **Step 6: Run the whole server suite**

Run from `server/`: `node node_modules/vitest/vitest.mjs run`
Expected: all files pass.

- [ ] **Step 7: Commit**

```bash
git add server/spotLogic.js server/routes/spot.js server/schema.sql server/app.js server/__tests__/spotLogic.test.js server/__tests__/spot.test.js
git commit -m "feat: add spot-the-difference rounds, timing and scoring"
```

---

### Task 3: Client helpers and API methods

**Files:**
- Create: `client/src/pages/spotLogic.js`
- Modify: `client/src/api.js`
- Test: `client/src/__tests__/spotLogic.test.js`

**Interfaces:**
- Produces: `toScenePoint(clientX, clientY, rect): { x, y }` with `rect = { left, top, width, height }`, clamped to 0–400 and 0–300 and rounded to one decimal.
- Produces: `formatCountdown(ms): string`, `resultLine(found, total, timeMs): string`, `loadLastGame(storage): 'wordle' | 'sudoku' | 'spot'`, `saveLastGame(storage, id): void`.
- Produces, on `api`: `getSpotToday()`, `startSpot()`, `tapSpot(x, y)`, `getSpotScore()`.
- Produces: errors thrown by `request()` gain `err.data` (the parsed JSON body), so the page can read `state` from a 409.

- [ ] **Step 1: Write failing tests in `client/src/__tests__/spotLogic.test.js`**

```js
describe('toScenePoint', () => {
  const rect = { left: 20, top: 100, width: 320, height: 240 };
  it.each([
    [20, 100, 0, 0], [340, 340, 400, 300], [180, 220, 200, 150], [100, 160, 100, 75],
    [0, 0, 0, 0], [999, 999, 400, 300], [21, 101, 1.3, 1.3],
  ])('(%i, %i) → (%f, %f)', (cx, cy, x, y) => {
    expect(toScenePoint(cx, cy, rect)).toEqual({ x, y });
  });
});

describe('formatCountdown', () => {
  it.each([[45000, '45.0'], [38449, '38.4'], [9999, '9.9'], [100, '0.1'], [99, '0.0'], [0, '0.0'], [-500, '0.0']])(
    '%i → %s', (ms, text) => { expect(formatCountdown(ms)).toBe(text); });
});

describe('resultLine', () => {
  it.each([
    [5, 7, 41234, 'You found 5 of 7 in 41.2s.'],
    [7, 7, 33000, 'You found all 7 in 33.0s.'],
    [1, 7, 2050, 'You found 1 of 7 in 2.0s.'],
    [0, 7, 0, "You didn't find any this time."],
  ])('%i of %i in %i', (found, total, ms, text) => { expect(resultLine(found, total, ms)).toBe(text); });
});

describe('last game memory', () => {
  const store = (initial = {}) => ({ data: { ...initial },
    getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); } });
  it('defaults to wordle', () => { expect(loadLastGame(store())).toBe('wordle'); });
  it('remembers a saved game', () => { const s = store(); saveLastGame(s, 'spot'); expect(loadLastGame(s)).toBe('spot'); });
  it('ignores an unknown stored value', () => { expect(loadLastGame(store({ 'last-game': 'chess' }))).toBe('wordle'); });
  it('survives storage that throws', () => {
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(loadLastGame(broken)).toBe('wordle');
    expect(() => saveLastGame(broken, 'spot')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run from `client/`: `node node_modules/vitest/vitest.mjs run src/__tests__/spotLogic.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `spotLogic.js` and the `api.js` additions**

`formatCountdown` floors to tenths (it must never show more time than is left). The storage key is `last-game`.

- [ ] **Step 4: Run the whole client suite**

Run from `client/`: `node node_modules/vitest/vitest.mjs run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/spotLogic.js client/src/api.js client/src/__tests__/spotLogic.test.js
git commit -m "feat: add client helpers and API methods for spot the difference"
```

---

### Task 4: Games tab

**Files:**
- Create: `client/src/pages/Games.jsx` (exports `GamesPage`)
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Icons.jsx` (add `GamesIcon`, `EyeIcon`)
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: `loadLastGame`, `saveLastGame` from Task 3; the existing `WordlePage` and `SudokuPage`.
- Produces: `<GamesPage currentUserId={number} />`, rendering a segmented control (`role="tablist"`, three `role="tab"` buttons labelled Wordle, Sudoku, Spot it) and the chosen game. Until Task 6, choosing Spot it renders a card reading "Coming soon."
- Produces: `App.jsx` `TABS` is exactly Calendar, Notes, Lists, Photos, Games.

- [ ] **Step 1: Build `GamesPage` and switch `App.jsx` to five tabs**

State starts from `loadLastGame(window.localStorage)` inside a `try`; choosing a game saves it. Only the chosen game is mounted, so a hidden game's keyboard listener and timers do not run.

- [ ] **Step 2: Add styles**

`.game-switch` (centred pill group, same visual language as the top-bar `.tabs`), `.game-switch-button`, `.game-switch-button.active`. Then restore the phone tab bar to its five-tab sizes where Task 5 of the photos plan tightened them for six: in the `max-width: 760px` query, `.tab` back to `padding: 6px 4px; font-size: 0.72rem`.

- [ ] **Step 3: Run tests and build**

Run from `client/`: `node node_modules/vitest/vitest.mjs run` then `node node_modules/vite/bin/vite.js build`
Expected: pass; build completes.

- [ ] **Step 4: Check in the browser** at 375px and 1280px

- Five tabs fit the top bar and the bottom bar; no horizontal scroll at 375px, 768px, 1001px and 1280px.
- Games opens on Wordle; Wordle accepts a typed guess; switching to Sudoku shows the grid and digit keys work; typing letters while on Sudoku does not reach Wordle.
- Choose Sudoku, reload, open Games: it opens on Sudoku.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat: group the games under one Games tab"
```

---

### Task 5: Drawing the scenes

**Files:**
- Create: `client/src/components/spotObjects.jsx`
- Create: `client/src/components/SpotScene.jsx`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: the scene object shape and `PALETTE` values from Task 1 (copied into `spotObjects.jsx`, with a comment naming `server/spotPuzzle.js` as the source), `toScenePoint` from Task 3.
- Produces: `<SpotObject object={...} />` drawing one object as an SVG `<g>`, and `<SpotBackground theme={...} />`.
- Produces: `<SpotScene label="A" theme sceneObjects marks onTap disabled />` where `marks` is `[{ index, x, y, r, style: 'found' | 'missed' }]` and `onTap({ x, y, clientX, clientY })` receives scene units plus the raw position.

- [ ] **Step 1: Draw the 24 object types and 3 backgrounds**

- Each type is a function of `{ colors, count, detail }` returning SVG shapes inside a box from -14 to 14 on both axes, built from a few rounded primitives with a 1.2-unit outline in `#5c3a4a`, matching the mascots.
- `SpotObject` wraps it in `<g transform="translate(x y) rotate(rotation) scale(size)">`.
- `count` must be countable at a glance (separate petals, stripes or dots, evenly spaced); `detail` must be a clearly separate part.
- Both colours of every type must be visible, so a one-shade change to either can be seen.
- Backgrounds: `shelf` draws five shelf boards under the rows on a pale wall; `garden` draws grass with five soil strips; `picnic` draws a checked blanket. Backgrounds are identical in A and B and stay pale enough that objects stand out.

- [ ] **Step 2: Build `SpotScene`**

- `<svg viewBox="0 0 400 300">` at 100% width with `aspect-ratio: 4 / 3`, `touch-action: manipulation`, and a visible "A" or "B" label outside the picture.
- Uses `onPointerDown`, measuring `getBoundingClientRect()` on every event and converting with `toScenePoint`. Does nothing when `disabled`.
- Marks: a ring of the mark's radius, 2.5 units thick, in `var(--primary)`; `missed` uses a dashed stroke in `var(--danger)`.
- `role="img"` with `aria-label="Picture A"` / `"Picture B"`.

- [ ] **Step 3: Run tests and build**

Expected: pass; build completes.

- [ ] **Step 4: Check every type and theme by eye**

Write a scratch page outside the repo's tracked files (for example `client/spot-gallery.html` plus a small entry script, both deleted afterwards and never committed) that renders: every type at `count` 3, 4, 5, 6 where it applies, with and without its detail, at each shade of one family, rotated 0 and 22 degrees, and at sizes 0.8, 1 and 1.2; then one full scene per theme from a real `generatePuzzle` result pasted in as JSON, A beside B. Serve it with Vite's dev server. Confirm:
- every type is recognisable and nothing draws outside its 28-unit box at size 1;
- each of the six kinds of change is visible when the two versions are side by side, on every type that supports it;
- neighbouring shades can be told apart on screen for all six families;
- objects do not overlap in any of the three full scenes.
Adjust drawings or palette values until this holds; a palette change must be made in both `server/spotPuzzle.js` and `spotObjects.jsx`.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat: draw spot-the-difference scenes"
```

---

### Task 6: The Spot it page

**Files:**
- Create: `client/src/pages/Spot.jsx` (exports `SpotPage`)
- Modify: `client/src/pages/Games.jsx` (render `SpotPage` in place of the placeholder)
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: `api.getSpotToday/startSpot/tapSpot/getSpotScore`, `err.status`, `err.data`, `formatCountdown`, `resultLine`, `SpotScene`, `Scoreboard`, `ResultBanner`, `useRefreshOnVisible`, `api.getUsers`.
- Produces: `<SpotPage currentUserId={number} />`.

- [ ] **Step 1: Build `SpotPage`**

State: `state` (the server's round state), `error`, `flashes` (penalty markers), `score`, `users`, plus a ticking `nowTick` for the countdown.
- **Loading:** `getSpotToday`, `getSpotScore`, `getUsers` on mount. A failed load shows the error and no start card.
- **Not started:** heading "Spot it", subtitle "Find the differences before the clock runs out.", scoreboard, a card with the three rule lines "7 differences.", "45 seconds.", "A wrong tap costs 3 seconds." and a Start button (ref-guarded against double taps) that calls `startSpot`.
- **Playing:** countdown and "3 of 7" above the two `SpotScene`s (A then B). The countdown is `state.remainingMs - (performance.now() - receivedAt)`, where `receivedAt` is recorded each time a state arrives; it re-renders about every 100 ms from an interval that exists only while playing. Under 10,000 ms it takes the `.spot-clock.low` style.
- **Taps:** ignore a tap less than 250 ms after the previous one. Send `tapSpot(x, y)`. On `miss`, add a flash `{ id, label: 'A' | 'B', x, y }` shown as "−3s" at the tap point in the picture that was tapped, removed after 900 ms. Always replace `state` with the response's `state`, unless a later response has already been applied (compare a per-request counter).
- **A 409 "The round is over"** is not an error: take `err.data.state`.
- **Clock reaches zero locally:** call `getSpotToday` once. If the answer is still `playing`, keep counting from its `remainingMs`. If the call fails, show "Couldn't reach the server. The clock is still running." and try again on the next tap and when the tab becomes visible.
- **Other errors** from start or tap show the same sentence inline and leave the round on screen.
- **Finished:** both scenes `disabled`, with a mark for every entry in `state.differences`: `found` if its index is in `state.found`, else `missed`. Below: `resultLine(...)`, then either "Waiting on <name> to play today's puzzle." or the verdict banner with the opponent's figures ("Sam found 4 of 7 in 39.0s."). The scoreboard reloads when the state becomes finished.
- **Coming back:** `useRefreshOnVisible` reloads the state (and score) so a round that ran out while the phone was locked shows as finished, and a waiting view picks up the other player's result.
- While playing, the rings come from `state.foundDifferences`, so they are back after a reload without anything extra.

- [ ] **Step 2: Add styles**

`.spot-page` (max-width 980px), `.spot-status` (clock and count), `.spot-clock`, `.spot-clock.low` (uses `var(--danger)`), `.spot-pictures` (two columns from 761px, one column below), `.spot-picture`, `.spot-picture-label`, `.spot-flash` (absolutely positioned over its picture, fades upward), `.spot-rules`. On a 375 by 812 phone both pictures, the clock and the count must be visible without scrolling: cap each picture's height so the pair fits (`max-height` from the viewport height, keeping 4:3).

- [ ] **Step 3: Run tests and build**

Run from `client/`: `node node_modules/vitest/vitest.mjs run` then `node node_modules/vite/bin/vite.js build`
Expected: pass; build completes.

- [ ] **Step 4: Check in the browser** at 375px and 1280px, as both accounts

Use a launcher script outside the repo that points the server at a throwaway database. To replay, delete today's `spot_results` and `spot_finds` rows with a scratch node script between runs.
- Start reveals the pictures and the clock counts down in tenths, turning red under 10 seconds.
- A real difference (read from a scratch script that prints `generatePuzzle(seed).differences` for today's seed) rings in both pictures and raises the count; tapping it in picture B works the same as in A.
- A miss shows "−3s" where tapped and the clock drops by 3 seconds; a fast double tap costs only one penalty.
- At 375px both pictures and the clock are visible without scrolling; no horizontal scroll.
- Resize the window mid-round, then tap a known difference: it still hits.
- Reload mid-round: the round resumes with the right time left, the count, and the rings already found.
- Let the clock run out: the finished view appears on its own, with found differences solid and missed ones dashed, and the result line.
- Find all 7 in a fresh round: it ends at once with "You found all 7".
- As the second account: before playing, nothing about the first account's result is shown; after playing, both see the verdict and the scoreboard shows one point.
- Stop the server mid-round and tap: the inline message appears; restart and tap: play continues if time remains. Stop it again and let the local clock reach zero: the message appears and the page recovers when the server is back and the tab is refocused.
- Wordle and Sudoku still work from the Games tab.
- No errors in the browser console apart from the deliberate failures above.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat: add the Spot it game page"
```
