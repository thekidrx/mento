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
