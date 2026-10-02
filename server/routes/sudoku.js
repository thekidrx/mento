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
