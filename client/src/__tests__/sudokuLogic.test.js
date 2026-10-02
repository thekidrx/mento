import { describe, it, expect } from 'vitest';
import {
  parseServerTimestamp,
  formatElapsed,
  isCorrectEntry,
  isGridComplete,
  loadSavedCells,
  saveCells,
} from '../pages/sudokuLogic';

describe('parseServerTimestamp', () => {
  it('parses a SQLite datetime string as UTC', () => {
    const date = parseServerTimestamp('2026-01-01 00:00:00');
    expect(date.getTime()).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
  });
});

describe('formatElapsed', () => {
  it('formats seconds under a minute', () => {
    expect(formatElapsed(5)).toBe('0:05');
  });

  it('formats minutes and seconds with zero-padding', () => {
    expect(formatElapsed(252)).toBe('4:12');
  });
});

describe('isCorrectEntry', () => {
  it('returns true when the digit matches the solution at that index', () => {
    expect(isCorrectEntry('123456789' + '0'.repeat(72), 0, 1)).toBe(true);
  });

  it('returns false when the digit does not match', () => {
    expect(isCorrectEntry('123456789' + '0'.repeat(72), 0, 9)).toBe(false);
  });
});

describe('isGridComplete', () => {
  it('returns false when any cell is blank', () => {
    const cells = new Array(81).fill('5');
    cells[40] = '0';
    expect(isGridComplete(cells)).toBe(false);
  });

  it('returns true when every cell has a digit', () => {
    const cells = new Array(81).fill('5');
    expect(isGridComplete(cells)).toBe(true);
  });
});

function fakeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
  };
}

describe('loadSavedCells / saveCells', () => {
  it('returns null when nothing has been saved for that key', () => {
    expect(loadSavedCells(fakeStorage(), 'sudoku-cells-xyz')).toBeNull();
  });

  it('round-trips a saved cells array', () => {
    const storage = fakeStorage();
    const cells = new Array(81).fill('0');
    cells[5] = '7';
    saveCells(storage, 'sudoku-cells-xyz', cells);
    expect(loadSavedCells(storage, 'sudoku-cells-xyz')).toEqual(cells);
  });

  it('returns null instead of throwing when storage access fails', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSavedCells(storage, 'k')).toBeNull();
  });

  it('does not throw when storage access fails while saving', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveCells(storage, 'k', ['1'])).not.toThrow();
  });
});
