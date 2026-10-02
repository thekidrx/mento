const { loadPuzzlePool, pickDailyPuzzle, computeElapsedSeconds } = require('../sudokuLogic');

describe('loadPuzzlePool', () => {
  it('loads a non-empty pool of 81-character puzzle/solution pairs', () => {
    const pool = loadPuzzlePool();
    expect(pool.length).toBeGreaterThan(50);
    for (const { puzzle, solution } of pool) {
      expect(puzzle).toMatch(/^[0-9]{81}$/);
      expect(solution).toMatch(/^[1-9]{81}$/);
    }
  });

  it('has at least one blank clue cell in every puzzle', () => {
    const pool = loadPuzzlePool();
    expect(pool.every(({ puzzle }) => puzzle.includes('0'))).toBe(true);
  });
});

describe('pickDailyPuzzle', () => {
  it('excludes already-used puzzles when an unused one remains', () => {
    const pool = [
      { puzzle: 'AAA', solution: 'aaa' },
      { puzzle: 'BBB', solution: 'bbb' },
      { puzzle: 'CCC', solution: 'ccc' },
    ];
    const used = ['AAA', 'BBB'];
    expect(pickDailyPuzzle(pool, used)).toEqual({ puzzle: 'CCC', solution: 'ccc' });
  });

  it('falls back to the full pool once every puzzle has been used', () => {
    const pool = [
      { puzzle: 'AAA', solution: 'aaa' },
      { puzzle: 'BBB', solution: 'bbb' },
    ];
    const used = ['AAA', 'BBB'];
    expect(pool).toContainEqual(pickDailyPuzzle(pool, used));
  });
});

describe('computeElapsedSeconds', () => {
  it('computes a simple same-minute difference', () => {
    expect(computeElapsedSeconds('2026-01-01 00:00:00', '2026-01-01 00:00:10')).toBe(10);
  });

  it('computes a difference that crosses a minute boundary', () => {
    expect(computeElapsedSeconds('2026-01-01 00:00:50', '2026-01-01 00:01:05')).toBe(15);
  });

  it('returns 0 for identical timestamps', () => {
    expect(computeElapsedSeconds('2026-01-01 00:00:00', '2026-01-01 00:00:00')).toBe(0);
  });
});
