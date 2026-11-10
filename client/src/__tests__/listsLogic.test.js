import { describe, it, expect } from 'vitest';
import { progressLabel, splitItems } from '../pages/listsLogic';

describe('progressLabel', () => {
  it.each([
    [0, 0, 'Nothing here yet'],
    [8, 3, '3 of 8 done'],
    [1, 0, '0 of 1 done'],
    [4, 4, 'All done'],
  ])('items %i, checked %i → %s', (items, checked, label) => {
    expect(progressLabel(items, checked)).toBe(label);
  });
});

describe('splitItems', () => {
  it('separates open and done items and keeps the given order', () => {
    const items = [
      { id: 2, checked_at: null },
      { id: 5, checked_at: null },
      { id: 4, checked_at: '2026-11-09 10:00:00' },
      { id: 1, checked_at: '2026-11-08 10:00:00' },
    ];
    const { open, done } = splitItems(items);
    expect(open.map((i) => i.id)).toEqual([2, 5]);
    expect(done.map((i) => i.id)).toEqual([4, 1]);
  });

  it('returns empty arrays for an empty list', () => {
    expect(splitItems([])).toEqual({ open: [], done: [] });
  });
});
