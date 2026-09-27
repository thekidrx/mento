# R&S Web — Daily Wordle

## Purpose

A shared daily Wordle-style game between the two accounts on this site,
tracking a running "who's winning" tally. Adds a new **Wordle** tab
alongside the existing Calendar and Notes tabs.

## Game rules

- Classic Wordle: a 5-letter word, up to 6 guesses, green/yellow/gray
  per-letter feedback (green = correct letter & position, yellow =
  correct letter wrong position, gray = letter not in the word).
- **One word per calendar day** (server's local date), the same word
  for both accounts — this is a head-to-head puzzle, not two
  independent games.
- Each account's guesses and result are **hidden from the other**
  until both have finished that day's puzzle (solved, or used all 6
  guesses without solving).
- **Scoring**: once both have finished, whoever solved in fewer
  guesses gets a point in the running tally. A tie (same guess count,
  including both failing) awards no point to either side. Not playing
  at all before the day rolls over counts the same as failing all 6
  guesses.
- No history/archive of past puzzles — only today's puzzle and the
  cumulative score (e.g. "Ryan 12 – Sam 9") are shown.

## Architecture

Fully server-authoritative: the server selects the day's word, stores
it, validates every guess, and computes feedback. The client never
receives the answer or the opponent's guesses before it's supposed to
— this is what makes the score trustworthy between two people on their
honor system otherwise.

```
[Client: type a guess]
        |
        v
POST /api/wordle/guess  ---->  server looks up today's word,
                                validates the guess is a real word,
                                computes GYBBB-style feedback,
                                stores the guess, returns feedback
        |
        v
[Client: render colored tiles from feedback response]
```

Reuses the existing session auth (`requireAuth`) — no new auth
concepts.

## Data model

New tables in `server/schema.sql`:

```sql
CREATE TABLE wordle_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,        -- 'YYYY-MM-DD', server's local date
  word TEXT NOT NULL
);

CREATE TABLE wordle_guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES wordle_days(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  guess TEXT NOT NULL,
  feedback TEXT NOT NULL,           -- 5 chars, one of G/Y/B per letter
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(day_id, user_id, guess)
);
```

- **Today's word** is created lazily: the first API request of a new
  calendar date picks a random not-yet-used word from the bundled
  answer list and inserts a `wordle_days` row for that date. Every
  subsequent request that day reuses the same row, so the word is
  guaranteed identical for both accounts and stable across server
  restarts.
- A user's progress for a day is derived from their rows in
  `wordle_guesses` for that `day_id`: solved = a guess with feedback
  `GGGGG` exists; failed = 6 guesses exist with no solve; otherwise
  in-progress.
- No separate scores table — the tally is computed on read by walking
  past `wordle_days` rows and comparing each user's guess count for
  that day. Today's row is only included in the tally once both users
  have finished (this is what enforces "hidden until both finish" for
  the score itself, not just the guesses).

## API

- **`GET /api/wordle/today`** — returns the current user's own state
  for today: `{ guesses: [{ guess, feedback }], solved, failed,
  guessesRemaining, opponentFinished }`. `opponentFinished` is a
  boolean only — it never leaks the opponent's guesses or count. Once
  *both* users have finished, the response also includes `todayResult:
  { yourGuesses, opponentGuesses, winner }` (`winner` is `'you'`,
  `'opponent'`, or `'tie'`).
- **`POST /api/wordle/guess`** — body `{ guess }`. 400 if: the caller
  has already solved or failed today, the guess isn't exactly 5
  letters or isn't in the valid-guess word list, or it exactly repeats
  an earlier guess from the same user today. On success, stores the
  guess and returns `{ guess, feedback }` for just that guess.
- **`GET /api/wordle/score`** — returns `{ "<userId>": winCount, ... }`
  for both seeded users, computed as described above.

All three routes are mounted behind `requireAuth`, same as
`/api/events` and `/api/notes`.

## Feedback algorithm

A pure function `computeFeedback(guess, answer) -> 'GYBBB'`-style
5-character string, in `server/wordleLogic.js`. Must handle duplicate
letters correctly using the standard two-pass approach (mark exact
matches first, then assign yellows from remaining letter counts) —
e.g. guessing `SPEED` against answer `ERASE` must not double-count the
two `E`s.

## Word lists

Two static files bundled in `server/data/` (no network calls at
runtime, consistent with this app's fully offline architecture):

- `wordle-answers.txt` — a few thousand common 5-letter words; the
  pool `wordle_days.word` is chosen from.
- `wordle-guesses.txt` — a broader list of valid 5-letter words
  (including less common ones); anything in this list is an acceptable
  guess even if it could never be the answer.

Sourced from a well-established, freely-republished open-source Wordle
word list (the same lists countless open-source Wordle clones already
ship).

## Frontend

- New **Wordle** tab in `App.jsx`'s nav, rendering `client/src/pages/
  Wordle.jsx`.
- Classic 6×5 letter grid, colored per submitted guess's feedback, plus
  an on-screen keyboard that recolors as letters are learned. Accepts
  both on-screen and physical keyboard input.
- Score banner above the grid: "Ryan 12 – Sam 9", from `GET /api/
  wordle/score`.
- If the current user has finished but `opponentFinished` is false:
  show "Waiting on `<partner display name>` to finish today's puzzle"
  instead of a result.
- Once `todayResult` is present: show both guess counts and who won
  today.
- `client/src/pages/wordleLogic.js` holds small pure helpers (e.g.
  client-side 5-letter/shape validation for instant feedback before
  hitting the server, keyboard-state derivation from past guesses),
  unit-tested the same way as `notesLogic.js`. The server remains the
  sole source of truth regardless of any client-side checks.

## Error handling

- Invalid guess (wrong length, not a real word, already tried) → 400
  with a message; frontend shows an inline error, not a crash.
- Guessing after the game is already over for that user (solved or 6
  guesses used) → 400; frontend disables input once `solved` or
  `failed` is true.
- Day rollover mid-game: if a user hasn't finished when the date
  changes, their partial attempt simply stays as-is and scores as a
  loss if the partner solved it (see Scoring) — no separate forfeit
  bookkeeping. A new `wordle_days` row is created for the new date on
  the next request, independent of yesterday's unfinished state.

## Testing

- `computeFeedback`: thorough unit tests, especially duplicate-letter
  cases.
- Score aggregation (win/tie/loss rules across constructed day
  scenarios): unit tests.
- API routes (`/api/wordle/today`, `/guess`, `/score`): Supertest
  coverage for the same shape of cases as `events.test.js`/
  `notes.test.js` — auth required, invalid guesses rejected, hidden
  state before both finish, correct reveal after both finish.
- Frontend: `wordleLogic.js` pure helpers unit-tested; manual
  end-to-end check (both accounts play a day, confirm hidden-until-both
  behavior and correct score update) before calling it done.

## Out of scope for v1

- History/archive of past days' words and results.
- Streaks (current/best consecutive days solved).
- Any word list larger or different from the bundled offline lists
  (no dictionary API calls).
- Hard mode / other Wordle variants.
