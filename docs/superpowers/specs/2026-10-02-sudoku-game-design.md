# R&S Web — Daily Sudoku

## Purpose

A second shared daily game between the two accounts on this site, alongside
the existing daily Wordle — a head-to-head Sudoku race with a running
"who's winning" tally. Adds a new **Sudoku** tab alongside Calendar, Notes,
and Wordle.

## Game rules

- One 9x9 Sudoku puzzle per calendar day (server's local date), the same
  puzzle for both accounts.
- Classic Sudoku rules: fill every cell 1-9 so each row, column, and 3x3
  box contains each digit exactly once. The puzzle's given clues are fixed;
  only blank cells are editable.
- **Wrong entries are rejected immediately** — a cell will not accept a
  digit that violates row/column/box uniqueness against the known
  solution. Because of this, every digit that ever lands on the board is
  correct, so "solved" simply means "every cell is filled."
- **Scoring is by completion time**: whoever fills the grid faster wins
  that day. A tie (identical elapsed time, or more realistically both
  failing to finish) awards no point to either side. Not finishing before
  the day rolls over counts as a loss, same as an unfinished Wordle.
- The timer runs from your first cell entry to your last — real wall-clock
  time, no pause/resume. Walking away mid-solve counts against you; this
  is an accepted limitation, not a defect.
- Each account's progress and elapsed time are **hidden from the other**
  until both have finished that day's puzzle.
- No history/archive of past puzzles — only today's puzzle and the
  cumulative score are shown, matching Wordle.

## Architecture

Unlike Wordle, Sudoku's puzzle is not a secret you're trying to guess —
you can see the entire board from the start. There is nothing to leak by
also giving the client the solution, so cell-level validation happens
**entirely client-side** for instant feedback (no network round-trip per
digit, which matters across 81 cells). The server's authoritative role is
narrower than Wordle's: it only needs to pick the shared daily puzzle and
record each player's start/finish timestamps, since *when* you started and
finished is what the hidden-until-both-finish reveal and the score tally
depend on.

```
[Client loads today's puzzle + solution once]
        |
        v
[Typing a digit: validated locally against the solution,
 rejected instantly if wrong — no server round-trip]
        |
        v (first cell filled)              (grid fully filled)
POST /api/sudoku/start            POST /api/sudoku/finish
        |                                   |
        v                                   v
   server stamps                     server stamps
   started_at                        finished_at
```

Reuses the existing session auth (`requireAuth`) — no new auth concepts.

## Data model

New tables in `server/schema.sql`:

```sql
CREATE TABLE sudoku_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,        -- 'YYYY-MM-DD', server's local date
  puzzle TEXT NOT NULL,             -- 81 chars, '0' for a blank clue cell
  solution TEXT NOT NULL            -- 81 chars, the fully solved grid
);

CREATE TABLE sudoku_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES sudoku_days(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT,                  -- set once, on first cell filled
  finished_at TEXT,                 -- set once, when the grid is complete
  UNIQUE(day_id, user_id)
);
```

- **Today's puzzle** is created lazily, the same way Wordle's daily word
  is: the first request of a new calendar date picks a random not-yet-used
  puzzle from a bundled dataset of puzzle+solution pairs and inserts a
  `sudoku_days` row for that date. Every subsequent request that day reuses
  the same row.
- A user's elapsed time for a day is `finished_at - started_at` once both
  are set; `null`/`null` means not started, `started_at` set with
  `finished_at` null means in progress.
- No separate scores table — the tally is computed on read the same way
  as Wordle's, walking past `sudoku_days` rows and comparing elapsed time
  per user per day, with today only counted once both have finished.

## API

- **`GET /api/sudoku/today`** — returns `{ puzzle, solution, startedAt,
  finishedAt, opponentFinished }` for the current user. `opponentFinished`
  is a boolean only. Once *both* users have finished, the response also
  includes `todayResult: { yourSeconds, opponentSeconds, winner }`
  (`winner` is `'you'`, `'opponent'`, or `'tie'`).
- **`POST /api/sudoku/start`** — no body. Sets `started_at` to now if not
  already set for today; a no-op (200) if already started. 400 if the
  user has already finished today.
- **`POST /api/sudoku/finish`** — no body. Sets `finished_at` to now. 400
  if the user hasn't started yet, or has already finished.
- **`GET /api/sudoku/score`** — returns `{ "<userId>": winCount, ... }`
  for both seeded users, computed as described above.

All four routes are mounted behind `requireAuth`, same as `/api/wordle`
and `/api/events`.

## Puzzle dataset

A static bundled dataset of puzzle+solution pairs in `server/data/`,
sourced from a well-established public Sudoku puzzle collection (same
"bundle real data, no runtime generation" approach as Wordle's word
lists) — picked for a moderate difficulty band (solvable in a reasonable
sitting, not expert-level). The exact source and file format will be
pinned down during implementation planning, the same way Wordle's exact
word-list URLs were verified before being written into that plan.

## Frontend

- New **Sudoku** tab in `App.jsx`'s nav, rendering `client/src/pages/
  Sudoku.jsx`.
- A 9x9 grid: given clues rendered bold/locked, blank cells editable by
  click-then-type (and a simple on-screen number pad for convenience).
  An incorrect entry is rejected on the spot — the cell briefly flashes
  rather than accepting the digit. A small elapsed-time display runs once
  the player has made their first entry.
- Score banner above the grid, same shape as Wordle's: "Ryan 3 – Sam 2",
  from `GET /api/sudoku/score`.
- On the player's first cell entry, fire `POST /api/sudoku/start`. Once
  every cell is filled (necessarily correct, since wrong entries are never
  accepted), fire `POST /api/sudoku/finish`.
- If the player has finished but `opponentFinished` is false: "Waiting on
  `<partner display name>` to finish today's puzzle," identical in spirit
  to Wordle's waiting state.
- Once `todayResult` is present: show both elapsed times and the winner,
  e.g. "You won today! 4:12 vs 6:50."
- `client/src/pages/sudokuLogic.js` holds small pure helpers (grid-fill
  checks, local move validation against the known solution, elapsed-time
  formatting), unit-tested the same way as `wordleLogic.js`.

## Error handling

- A digit that would violate the solution → rejected client-side, no
  request sent; the UI shows a brief visual rejection (not a hard error
  message).
- `POST /api/sudoku/finish` called before `/start`, or either endpoint
  called twice → 400 with a message; frontend treats this defensively
  (shouldn't happen in normal play) rather than crashing.
- Day rollover mid-solve: same as Wordle — an unfinished attempt simply
  stays as-is and scores as a loss if the partner finished; a new
  `sudoku_days` row is created for the new date on the next request,
  independent of yesterday's unfinished state.

## Testing

- `sudokuLogic.js` (server): the score-tally logic (shared shape with
  Wordle's win/tie/loss rules, applied to elapsed seconds instead of
  guess counts) gets unit tests covering a normal win, a tie, and a
  past-unfinished-day-as-loss case.
- API routes: Supertest coverage mirroring `wordle.test.js` — auth
  required; can't finish before starting; can't start or finish twice;
  opponent's time/progress never leaks before they finish; zero-history
  and undecided-today both correctly excluded from `/score`.
- Frontend: `sudokuLogic.js`'s pure helpers (local validation, elapsed-time
  formatting) unit-tested; the page itself verified manually against the
  running app, the same way Wordle's page was.

## Out of scope for v1

- Difficulty selection — one fixed moderate difficulty for everyone.
- Hints, pencil-marks/notes mode.
- Pause/resume — the timer is real wall-clock time with no stopping it.
- History/archive of past puzzles, same as Wordle.
