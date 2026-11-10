import { describe, it, expect } from 'vitest';
import { progressLabel, splitItems, missingKind } from '../pages/listsLogic';

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

describe('missingKind', () => {
  function apiError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
  }

  it('recognises a list that no longer exists', () => {
    expect(missingKind(apiError(404, 'List not found'))).toBe('list');
  });

  it('recognises an item that no longer exists', () => {
    expect(missingKind(apiError(404, 'Item not found'))).toBe('item');
  });

  it.each([
    [400, 'Item text is required'],
    [500, 'Something went wrong'],
    [404, 'Not found'],
    [undefined, 'Failed to fetch'],
    [400, 'List not found'],
  ])('returns null for status %s "%s"', (status, message) => {
    expect(missingKind(apiError(status, message))).toBeNull();
  });
});
