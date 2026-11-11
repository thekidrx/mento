const SCENE_WIDTH = 400;
const SCENE_HEIGHT = 300;
const GAMES = ['wordle', 'sudoku', 'spot'];
const LAST_GAME_KEY = 'last-game';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Turns a tap's position on screen into scene units, using the picture's
// rectangle as it is right now (it changes when the phone is rotated).
export function toScenePoint(clientX, clientY, rect) {
  const x = ((clientX - rect.left) / rect.width) * SCENE_WIDTH;
  const y = ((clientY - rect.top) / rect.height) * SCENE_HEIGHT;
  return {
    x: Math.round(clamp(x, 0, SCENE_WIDTH) * 10) / 10,
    y: Math.round(clamp(y, 0, SCENE_HEIGHT) * 10) / 10,
  };
}

// Rounded down, so the clock never shows more time than is really left.
function tenths(ms) {
  return (Math.floor(Math.max(0, ms) / 100) / 10).toFixed(1);
}

export function formatCountdown(ms) {
  return tenths(ms);
}

export function resultLine(found, total, timeMs) {
  if (found === 0) return "You didn't find any this time.";
  const amount = found === total ? `all ${total}` : `${found} of ${total}`;
  return `You found ${amount} in ${tenths(timeMs)}s.`;
}

// Which game the Games tab should open on. Storage can be missing or
// blocked (private browsing), in which case it is simply Wordle.
export function loadLastGame(storage) {
  try {
    const saved = storage.getItem(LAST_GAME_KEY);
    return GAMES.includes(saved) ? saved : 'wordle';
  } catch {
    return 'wordle';
  }
}

export function saveLastGame(storage, id) {
  try {
    storage.setItem(LAST_GAME_KEY, id);
  } catch {
    // Remembering the last game is a convenience; losing it is fine.
  }
}
