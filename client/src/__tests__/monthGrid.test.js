import { describe, it, expect } from 'vitest';
import { getMonthGridDays, toDateKey } from '../components/monthGrid';

describe('getMonthGridDays', () => {
  it('pads the grid to a multiple of 7', () => {
    const days = getMonthGridDays(2026, 9); // October 2026 (0-indexed)
    expect(days.length % 7).toBe(0);
  });

  it('includes every real day of the month exactly once', () => {
    const days = getMonthGridDays(2026, 9);
    const realDays = days.filter(Boolean);
    expect(realDays).toHaveLength(31); // October has 31 days
  });
});

describe('toDateKey', () => {
  it('formats a date as YYYY-MM-DD with zero-padding', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
