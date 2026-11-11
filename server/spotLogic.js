// Rules of a spot-the-difference round, with no database or HTTP in them.
const { SCENE_WIDTH, SCENE_HEIGHT, DIFFERENCE_COUNT } = require('./spotPuzzle');

const TIME_LIMIT_MS = 45000;
const PENALTY_MS = 3000;

// Each wrong tap pulls the deadline earlier.
function deadlineMs(startedAtMs, wrongTaps) {
  return startedAtMs + TIME_LIMIT_MS - PENALTY_MS * wrongTaps;
}

// Real numbers inside the picture. Numeric strings are refused on purpose:
// a malformed request should be an error, not a wrong tap that costs time.
function isValidTap(x, y) {
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= SCENE_WIDTH &&
    y >= 0 &&
    y <= SCENE_HEIGHT
  );
}

function nearestWithin(differences, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const d of differences) {
    const distance = Math.hypot(d.x - x, d.y - y);
    if (distance <= d.r && distance < bestDistance) {
      best = d;
      bestDistance = distance;
    }
  }
  return best;
}

// A tap counts for the nearest difference not yet found. Landing only on one
// already found is a "repeat", which costs nothing.
function judgeTap(differences, foundIndexes, x, y) {
  const found = new Set(foundIndexes);
  const fresh = nearestWithin(
    differences.filter((d) => !found.has(d.index)),
    x,
    y
  );
  if (fresh) return { result: 'hit', index: fresh.index };
  const again = nearestWithin(
    differences.filter((d) => found.has(d.index)),
    x,
    y
  );
  if (again) return { result: 'repeat', index: again.index };
  return { result: 'miss' };
}

// round: { startedAtMs, wrongTaps, findCount }
function isFinished(round, nowMs) {
  return (
    round.findCount >= DIFFERENCE_COUNT || nowMs >= deadlineMs(round.startedAtMs, round.wrongTaps)
  );
}

// timeMs runs from the start to the last difference found.
function playerResult(startedAtMs, findTimesMs) {
  if (findTimesMs.length === 0) return { found: 0, timeMs: 0 };
  return { found: findTimesMs.length, timeMs: Math.max(...findTimesMs) - startedAtMs };
}

// One number per result where lower is better: more found always beats
// fewer, and time only separates equal counts. null means "did not play".
function rankValue(result) {
  if (!result) return Infinity;
  return (DIFFERENCE_COUNT - result.found) * 10_000_000 + result.timeMs;
}

function dayWinner(a, b) {
  const difference = rankValue(a) - rankValue(b);
  if (difference < 0) return 'a';
  if (difference > 0) return 'b';
  return 'tie';
}

module.exports = {
  TIME_LIMIT_MS,
  PENALTY_MS,
  deadlineMs,
  isValidTap,
  judgeTap,
  isFinished,
  playerResult,
  rankValue,
  dayWinner,
};
