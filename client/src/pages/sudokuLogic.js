export function parseServerTimestamp(ts) {
  return new Date(ts.replace(' ', 'T') + 'Z');
}

export function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function isCorrectEntry(solution, index, digit) {
  return solution[index] === String(digit);
}

export function isGridComplete(cells) {
  return cells.every((c) => c !== '0' && c !== '');
}

export function loadSavedCells(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCells(storage, key, cells) {
  try {
    storage.setItem(key, JSON.stringify(cells));
  } catch {
    // Storage can be unavailable (private browsing, quota) — losing the
    // reload-resilience convenience is acceptable; the game still works.
  }
}
