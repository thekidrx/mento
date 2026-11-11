const crypto = require('crypto');
const express = require('express');
const { computeScoreTally } = require('../gameScoring');
const { generatePuzzle, DIFFERENCE_COUNT } = require('../spotPuzzle');
const {
  TIME_LIMIT_MS,
  PENALTY_MS,
  deadlineMs,
  isValidTap,
  judgeTap,
  isFinished,
  playerResult,
  rankValue,
  dayWinner,
} = require('../spotLogic');

function dateString(ms) {
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function circle(difference) {
  return { index: difference.index, x: difference.x, y: difference.y, r: difference.r };
}

// `now` can be replaced so tests control the clock.
function createSpotRouter(db, { now = Date.now } = {}) {
  const router = express.Router();

  function getOrCreateDay(date) {
    // The seed is random so tomorrow's puzzle cannot be worked out today.
    db.prepare('INSERT OR IGNORE INTO spot_days (date, seed) VALUES (?, ?)').run(
      date,
      crypto.randomInt(2 ** 31)
    );
    return db.prepare('SELECT * FROM spot_days WHERE date = ?').get(date);
  }

  function getResult(dayId, userId) {
    return db
      .prepare('SELECT * FROM spot_results WHERE day_id = ? AND user_id = ?')
      .get(dayId, userId);
  }

  function getFinds(resultId) {
    return db
      .prepare('SELECT * FROM spot_finds WHERE result_id = ? ORDER BY found_at_ms, id')
      .all(resultId);
  }

  function roundOf(result, finds) {
    return {
      startedAtMs: result.started_at_ms,
      wrongTaps: result.wrong_taps,
      findCount: finds.length,
    };
  }

  function resultOf(result, finds) {
    return playerResult(
      result.started_at_ms,
      finds.map((f) => f.found_at_ms)
    );
  }

  // The day and round a request is about. A round still in progress wins
  // over the calendar, so one started just before midnight carries on.
  function currentRound(userId, nowMs) {
    const latest = db
      .prepare('SELECT * FROM spot_results WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(userId);
    if (latest && !isFinished(roundOf(latest, getFinds(latest.id)), nowMs)) {
      const day = db.prepare('SELECT * FROM spot_days WHERE id = ?').get(latest.day_id);
      return { day, result: latest };
    }
    const day = getOrCreateDay(dateString(nowMs));
    return { day, result: getResult(day.id, userId) || null };
  }

  function opponentOf(userId) {
    const row = db.prepare('SELECT id FROM users WHERE id != ?').get(userId);
    return row ? row.id : null;
  }

  function buildState(userId, { day, result }, nowMs) {
    const state = {
      status: 'not_started',
      timeLimitMs: TIME_LIMIT_MS,
      penaltyMs: PENALTY_MS,
      total: DIFFERENCE_COUNT,
      remainingMs: TIME_LIMIT_MS,
      found: [],
      foundDifferences: [],
      wrongTaps: 0,
      opponentFinished: false,
    };

    const opponentId = opponentOf(userId);
    const theirs = opponentId ? getResult(day.id, opponentId) : null;
    const theirFinds = theirs ? getFinds(theirs.id) : [];
    state.opponentFinished = !!theirs && isFinished(roundOf(theirs, theirFinds), nowMs);

    if (!result) return state;

    const finds = getFinds(result.id);
    const finished = isFinished(roundOf(result, finds), nowMs);
    const puzzle = generatePuzzle(day.seed);

    state.status = finished ? 'finished' : 'playing';
    state.remainingMs = finished
      ? 0
      : Math.max(0, deadlineMs(result.started_at_ms, result.wrong_taps) - nowMs);
    state.found = finds.map((f) => f.difference_index);
    // Only the ones this player has hit: the rest stay secret while playing.
    state.foundDifferences = state.found.map((index) => circle(puzzle.differences[index]));
    state.wrongTaps = result.wrong_taps;
    state.theme = puzzle.theme;
    state.sceneA = puzzle.sceneA;
    state.sceneB = puzzle.sceneB;

    if (finished) {
      const mine = resultOf(result, finds);
      state.differences = puzzle.differences.map(circle);
      state.yourResult = mine;
      if (state.opponentFinished) {
        const other = resultOf(theirs, theirFinds);
        const winner = dayWinner(mine, other);
        state.todayResult = {
          winner: winner === 'a' ? 'you' : winner === 'b' ? 'opponent' : 'tie',
          opponentFound: other.found,
          opponentTimeMs: other.timeMs,
        };
      }
    }
    return state;
  }

  router.get('/today', (req, res) => {
    const nowMs = now();
    res.json(buildState(req.session.userId, currentRound(req.session.userId, nowMs), nowMs));
  });

  router.post('/start', (req, res) => {
    const nowMs = now();
    const userId = req.session.userId;
    const round = currentRound(userId, nowMs);
    if (!round.result) {
      // OR IGNORE: a second Start arriving together must not restart the clock.
      db.prepare(
        'INSERT OR IGNORE INTO spot_results (day_id, user_id, started_at_ms) VALUES (?, ?, ?)'
      ).run(round.day.id, userId, nowMs);
      round.result = getResult(round.day.id, userId);
    }
    res.json(buildState(userId, round, nowMs));
  });

  const handleTap = db.transaction((userId, body, nowMs) => {
    const round = currentRound(userId, nowMs);
    if (!round.result) {
      return { status: 409, body: { error: 'Start the round first' } };
    }
    const finds = getFinds(round.result.id);
    if (isFinished(roundOf(round.result, finds), nowMs)) {
      return {
        status: 409,
        body: { error: 'The round is over', state: buildState(userId, round, nowMs) },
      };
    }
    const { x, y } = body || {};
    if (!isValidTap(x, y)) {
      return { status: 400, body: { error: 'A tap position is required' } };
    }

    const { differences } = generatePuzzle(round.day.seed);
    const judged = judgeTap(
      differences,
      finds.map((f) => f.difference_index),
      x,
      y
    );
    const response = { result: judged.result };

    if (judged.result === 'hit') {
      const inserted = db
        .prepare(
          'INSERT OR IGNORE INTO spot_finds (result_id, difference_index, found_at_ms) VALUES (?, ?, ?)'
        )
        .run(round.result.id, judged.index, nowMs);
      // Already recorded by a request that arrived alongside this one.
      if (inserted.changes === 0) response.result = 'repeat';
    } else if (judged.result === 'miss') {
      db.prepare('UPDATE spot_results SET wrong_taps = wrong_taps + 1 WHERE id = ?').run(
        round.result.id
      );
    }
    if (judged.index !== undefined) {
      response.index = judged.index;
      response.difference = circle(differences[judged.index]);
    }

    round.result = getResult(round.day.id, userId);
    response.state = buildState(userId, round, nowMs);
    return { status: 200, body: response };
  });

  router.post('/tap', (req, res) => {
    const outcome = handleTap(req.session.userId, req.body, now());
    res.status(outcome.status).json(outcome.body);
  });

  router.get('/score', (req, res) => {
    const users = db.prepare('SELECT id FROM users ORDER BY id').all();
    if (users.length < 2) {
      return res.json({});
    }
    const [userA, userB] = users;
    const nowMs = now();
    const today = dateString(nowMs);
    const days = db.prepare('SELECT * FROM spot_days ORDER BY date ASC').all();

    // A finished round's result, or null for no round or one still going.
    function finishedResult(dayId, userId, isToday) {
      const result = getResult(dayId, userId);
      if (!result) return null;
      const finds = getFinds(result.id);
      if (isToday && !isFinished(roundOf(result, finds), nowMs)) return null;
      return resultOf(result, finds);
    }

    const resolvedDays = [];
    for (const day of days) {
      const isToday = day.date === today;
      const a = finishedResult(day.id, userA.id, isToday);
      const b = finishedResult(day.id, userB.id, isToday);
      // Today only counts once both are done; on a past day, not playing loses.
      if (isToday && (!a || !b)) continue;
      resolvedDays.push({ counts: { [userA.id]: rankValue(a), [userB.id]: rankValue(b) } });
    }
    return res.json(computeScoreTally(resolvedDays, userA.id, userB.id));
  });

  return router;
}

module.exports = { createSpotRouter };
