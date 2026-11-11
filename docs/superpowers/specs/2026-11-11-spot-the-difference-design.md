# Spot the Difference — Design

## Purpose

Add a third daily game to R&S Web: two nearly identical drawn scenes,
and a race to find what differs between them. It should be hard, short
and directly competitive, so that both people play the same puzzle
under the same clock and one of them wins the day.

Success looks like: each person presses Start once a day, has 45
seconds to find up to 7 differences, and afterwards sees who found
more (or who was faster), with a running all-time score.

## Decisions made with the user

- **Drawn scenes, generated daily.** The site draws the pictures
  itself; no photos or prepared image files.
- **Hard.** Busy scenes and subtle changes.
- **A timer that starts when the game starts.** Pictures are hidden
  until the player presses Start.
- **Time limit: 45 seconds.**
- **Winner: most differences found; if equal, the faster player.**

Suggested by the designer and not yet questioned by the user:
- 7 differences per puzzle.
- Each wrong tap costs 3 seconds.
- One attempt per person per day.
- The three games share one "Games" tab (see Navigation).

## What the user sees

**Before starting**
- Heading "Spot it", subtitle "Find the differences before the clock
  runs out.", the all-time scoreboard (same component as Wordle and
  Sudoku), and a card explaining the rules in three short lines:
  "7 differences. 45 seconds. A wrong tap costs 3 seconds."
- A "Start" button. The pictures are not shown and not sent to the
  browser until it is pressed.

**Playing**
- A countdown showing seconds and tenths ("38.4"), turning to the
  danger colour under 10 seconds, and a progress count ("3 of 7").
- Two pictures labelled A and B: side by side from 761px wide,
  stacked A above B on a phone. Both always fit the screen width.
- Tapping a difference in either picture marks it in both with a ring
  and increases the count.
- Tapping anywhere else flashes a small "−3s" at the tap point and the
  countdown drops by 3 seconds.
- Tapping a difference that is already marked does nothing.
- The round ends when the countdown reaches zero or all 7 are found.

**Finished**
- Both pictures stay visible with every difference ringed: solid for
  the ones found, dashed for the ones missed.
- A line with the player's own result: "You found 5 of 7 in 41.2s."
  or "You found all 7 in 33.0s."
- If the other person has not finished: "Waiting on Sam to play
  today's puzzle." Their result is not shown.
- Once both have finished: the day's verdict ("You won today!", "Sam
  won today.", "Today's puzzle was a tie.") with both results, in the
  same banner style as the other games.

**Reloading or leaving mid-round** does not pause anything. The clock
is kept by the server; returning shows the round in progress with the
time that is actually left, or the finished view if it ran out.

## Navigation

A seventh tab does not fit the phone tab bar. Wordle, Sudoku and Spot
it move under a single **Games** tab, giving five tabs: Calendar,
Notes, Lists, Photos, Games.

- The Games page shows a segmented control with the three games and
  renders the chosen one below it.
- It opens on Wordle the first time, and afterwards on whichever game
  was open last (remembered in the browser's local storage; if storage
  is unavailable it opens on Wordle).
- The three game pages themselves are unchanged apart from being
  rendered inside this page.

## The puzzle

**Coordinate space.** Every scene is 400 units wide and 300 high. All
positions, sizes, taps and hit regions use these units, whatever size
the picture is drawn on screen.

**A scene** is a theme plus a list of objects.
- Three themes, each a background and a set of object types that suit
  it: **Toy shelf** (rows of shelves), **Garden** (rows of beds on
  grass) and **Picnic** (a checked blanket).
- Objects sit one per cell on a grid of 8 columns by 5 rows (cells of
  50 by 60 units). Between 32 and 38 of the 40 cells are filled. Each
  object is shifted a little inside its cell but never crosses the
  cell edge, so objects never overlap.
- An object is described by data only: `{ id, type, x, y, size,
  rotation, colors, count, detail }`. `colors` are picked from the
  site's palette; `count` (petals, stripes, dots, 3 to 6) and `detail`
  (an optional extra part, such as a cup's handle or a flower's
  centre) apply only to types that have them.
- At least 18 object types are drawn, in the soft rounded style of the
  existing mascots.

**Picture B** is picture A with exactly 7 objects changed, one change
each, chosen from:

| Change | Amount |
| --- | --- |
| Colour | one colour replaced by its neighbouring shade in the palette |
| Move | 7 to 9 units in one direction, staying inside the cell |
| Turn | 18 to 25 degrees |
| Size | 20% larger or smaller |
| Detail | the optional extra part removed |
| Count | one more or one fewer petal, stripe or dot |

- Each object type lists which changes are visible on it; a change is
  only ever applied to a type that supports it. For example a ball is
  never turned.
- No more than two of the 7 use the same kind of change.
- The 7 changed objects are in 7 different cells, no two of them in
  neighbouring cells (including diagonals), so their hit regions never
  touch.
- Nothing is added or removed outright, and nothing changes outside
  those 7 objects.

**Hit regions.** Each difference has a circle centred on the object
with a radius of 26 units, which covers the object in both its A and B
forms and is comfortable for a fingertip.

**Generation is deterministic.** `generatePuzzle(seed)` returns
`{ theme, sceneA, sceneB, differences }` and always returns the same
result for the same seed. It runs on the server only.

## Rules and timing

- Time limit 45,000 ms. Penalty 3,000 ms per wrong tap. 7 differences.
- All timing uses the server's clock in milliseconds.
- `deadline = started_at + 45,000 − 3,000 × wrong_taps`.
- A tap is judged by the server: it is a **hit** if it lies within the
  radius of a difference not yet found by that player (the nearest one
  if several), a **repeat** if it lies only within a difference
  already found, and otherwise a **miss**.
- A tap arriving at or after the deadline is not judged; the round is
  over.
- A round is **finished** when all 7 are found or the deadline has
  passed. Nothing has to be sent for a round to finish on time-out:
  the server works it out from the stored times whenever it is asked.
- A player's result is `found` (0 to 7) and `time_ms`: the time from
  start to their last hit, or 0 if they found none.
- **Day winner:** higher `found`; if equal, lower `time_ms`; if both
  are equal (including both finding none), a tie.
- A player's result is shown to the other only when both rounds are
  finished.
- **All-time score:** one point per day won, using the same rules as
  the other games: today counts only once both have finished; on a
  past day, someone who did not play loses to someone who did, and a
  day neither played counts for nobody.

## Data model

Three new tables in `server/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS spot_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  seed INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spot_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES spot_days(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at_ms INTEGER NOT NULL,
  wrong_taps INTEGER NOT NULL DEFAULT 0,
  UNIQUE(day_id, user_id)
);

CREATE TABLE IF NOT EXISTS spot_finds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES spot_results(id),
  difference_index INTEGER NOT NULL,
  found_at_ms INTEGER NOT NULL,
  UNIQUE(result_id, difference_index)
);
```

A day's seed is a random 31-bit integer chosen the first time anyone
asks for that day, so the puzzle cannot be worked out in advance. The
puzzle itself is not stored; it is regenerated from the seed.

## API

New router `server/routes/spot.js`, mounted at `/api/spot` behind
`requireAuth`. "Today" is decided the same way as in the Sudoku
router. The router takes an optional clock (`createSpotRouter(db,
{ now })`, default `Date.now`) so tests can control time.

| Method and path | Body | Result |
| --- | --- | --- |
| `GET /api/spot/today` | | The round state (below) |
| `POST /api/spot/start` | | The round state; starts the round if not started |
| `POST /api/spot/tap` | `{ x, y }` | `{ result, index, state }` |
| `GET /api/spot/score` | | `{ <userId>: wins, <userId>: wins }` |

**Round state**

```
{
  status: 'not_started' | 'playing' | 'finished',
  timeLimitMs: 45000, penaltyMs: 3000, total: 7,
  remainingMs,            // 45000 before start, 0 when finished
  found: [indexes],       // this player's hits, in the order found
  foundDifferences,       // [{ index, x, y, r }] for those hits, so
                          // their rings survive a reload
  wrongTaps,
  theme, sceneA, sceneB,  // only when playing or finished
  differences,            // [{ index, x, y, r }], only when finished
  yourResult,             // { found, timeMs }, only when finished
  opponentFinished,
  todayResult             // only when both finished:
                          // { winner: 'you' | 'opponent' | 'tie',
                          //   opponentFound, opponentTimeMs }
}
```

- While playing, the state does not include `differences`: the browser
  learns where a difference is only by hitting it. `foundDifferences`
  holds only the ones this player has already hit. A hit's response
  gives that one difference's `{ index, x, y, r }` so it can be
  ringed.
- `POST /start` on a round already started or finished changes nothing
  and returns the current state.
- `POST /tap` returns `result: 'hit' | 'repeat' | 'miss'`, with
  `index` and the difference's circle for a hit or repeat. `x` and `y`
  must be finite numbers within 0 to 400 and 0 to 300; otherwise 400
  "A tap position is required", with no penalty.
- `POST /tap` before starting returns 409 "Start the round first".
  After the round is finished it returns 409 "The round is over" with
  the finished state in the body under `state`, so the browser can
  switch views at once.
- A miss increases `wrong_taps`, which moves the deadline earlier; if
  that puts the deadline in the past the round is finished and the
  response's state says so.

## Client

- `client/src/pages/Games.jsx`: `GamesPage` with the segmented control
  and the last-game memory.
- `client/src/pages/Spot.jsx`: `SpotPage`, handling the three views.
- `client/src/components/SpotScene.jsx`: draws one scene as an SVG
  with `viewBox="0 0 400 300"`, the rings for marked differences, and
  reports taps in scene units.
- `client/src/components/spotObjects.jsx`: one small drawing function
  per object type and one background per theme.
- `client/src/pages/spotLogic.js`: pure helpers with unit tests.
  - `toScenePoint(clientX, clientY, rect)` converts a tap to scene
    units from the picture's on-screen rectangle.
  - `formatCountdown(ms)` returns `"38.4"`; never negative.
  - `resultLine(found, total, timeMs)` returns the finished-view
    sentence.
  - `loadLastGame(storage)` and `saveLastGame(storage, id)` for the
    Games tab, tolerant of storage being unavailable.
- `client/src/api.js`: `getSpotToday()`, `startSpot()`,
  `tapSpot(x, y)`, `getSpotScore()`.
- `client/src/App.jsx`: the five-tab navigation.
- `client/src/index.css`: styles for the Games control and the Spot
  page.

**Countdown.** The browser counts down locally from the `remainingMs`
in the last server response and corrects itself on every response.
When its countdown reaches zero it asks the server for the state once
and shows whatever the server says; if the server says the round is
still playing (the two clocks disagree slightly) it keeps counting
from the server's figure.

**Taps.** Each tap is sent to the server and the picture updates from
the answer. A second tap within 250 ms of the previous one is ignored,
so a double tap cannot cost two penalties. While a tap is being
judged, further taps are still accepted and sent.

**Errors.** A failed start or tap shows an inline error and leaves the
round as it was; the clock keeps running on the server regardless, and
the page says so ("Couldn't reach the server. The clock is still
running."). A failed load shows the error instead of the start card.

## Testing

- `server/__tests__/spotPuzzle.test.js`, over a fixed list of at least
  50 seeds:
  - the same seed gives a deeply equal puzzle twice;
  - different seeds give different puzzles;
  - 32 to 38 objects, all inside the scene and inside their cells;
  - exactly 7 differences; exactly 7 objects differ between A and B
    and every other object is identical;
  - each changed object differs in exactly one property group, by the
    amount in the table, and its type supports that change;
  - no kind of change is used more than twice;
  - no two differences are in the same or neighbouring cells;
  - every difference's centre lies inside the scene and no two
    circles overlap.
- `server/__tests__/spot.test.js`, with a controllable clock:
  - not-started state has no scenes; start reveals scenes but not
    `differences`; starting twice does not restart the clock;
  - hit, repeat and miss; the nearest unfound difference wins; a miss
    reduces `remainingMs` by 3,000;
  - bad tap bodies get 400 with no penalty; tap before start gets 409;
  - a tap at the deadline and after it is rejected with the finished
    state; penalties alone can end a round;
  - finding all 7 finishes early; the finished state reveals
    `differences` and `yourResult`;
  - the other player's result stays hidden until both are finished;
  - winner by count, by time on a tie, and a full tie;
  - the all-time score, including today unresolved and past days
    played by one or neither;
  - both players get the same puzzle on the same day and a new seed on
    a new day;
  - every route rejects an unauthenticated request with 401.
- `client/src/__tests__/spotLogic.test.js` for the helpers.
- Manual check in the browser at 375px and 1280px as both accounts:
  the five-tab navigation and Games control; Wordle and Sudoku still
  work inside it; start, hits, misses and the penalty flash; letting
  the clock run out; finding all 7; reloading mid-round; the waiting
  and both-finished views; every object type and all three themes
  drawing correctly (using a temporary seed override in the browser
  session, not a shipped feature); and that each of the six kinds of
  change is visible to the eye but not obvious.

## Deployment

No new dependencies, environment variables or Docker changes. On the
Pi: `git pull`, then `docker compose up -d --build app`.

## Out of scope

- Hints, practice mode, replaying past days, difficulty settings.
- Sound or animation beyond the ring and the penalty flash.
- Making the puzzle impossible to cheat: a determined player could
  compare the two pictures' data in the browser. As with Sudoku, which
  already sends its solution, this is accepted between two people.
- Pausing the clock.
