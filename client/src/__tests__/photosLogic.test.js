import { describe, it, expect } from 'vitest';
import { groupByMonth, scaledSize, defaultTakenOn, isUsableDate } from '../pages/photosLogic';

describe('groupByMonth', () => {
  it('groups consecutive photos by month and keeps their order', () => {
    const groups = groupByMonth([
      { id: 5, taken_on: '2026-11-14' },
      { id: 4, taken_on: '2026-11-01' },
      { id: 3, taken_on: '2026-10-31' },
      { id: 1, taken_on: '2025-12-25' },
    ]);
    expect(groups.map((g) => [g.key, g.label, g.photos.map((p) => p.id)])).toEqual([
      ['2026-11', 'November 2026', [5, 4]],
      ['2026-10', 'October 2026', [3]],
      ['2025-12', 'December 2025', [1]],
    ]);
  });

  it('returns an empty array for no photos', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('scaledSize', () => {
  it.each([
    [4000, 3000, 2000, 2000, 1500],
    [3000, 4000, 2000, 1500, 2000],
    [1200, 800, 2000, 1200, 800],
    [2000, 2000, 2000, 2000, 2000],
    [4032, 3024, 480, 480, 360],
    [10000, 100, 2000, 2000, 20],
    [5000, 1, 2000, 2000, 1],
  ])('%i×%i within %i → %i×%i', (w, h, max, ow, oh) => {
    expect(scaledSize(w, h, max)).toEqual({ width: ow, height: oh });
  });
});

describe('defaultTakenOn', () => {
  const now = new Date(2026, 10, 10, 15, 0, 0); // local time

  it('uses the file date in local time', () => {
    expect(defaultTakenOn(new Date(2026, 9, 31, 23, 30).getTime(), now)).toBe('2026-10-31');
  });

  it('caps a future file date at today', () => {
    expect(defaultTakenOn(new Date(2027, 0, 1).getTime(), now)).toBe('2026-11-10');
  });

  it.each([[NaN], [undefined], [0]])('falls back to today for %j', (ms) => {
    expect(defaultTakenOn(ms, now)).toBe('2026-11-10');
  });
});

describe('isUsableDate', () => {
  const now = new Date(2026, 10, 10, 15, 0, 0);

  it.each(['2026-11-10', '2020-02-29'])('accepts %s', (d) => {
    expect(isUsableDate(d, now)).toBe(true);
  });

  it.each(['2026-11-11', '2026-02-30', '', 'abc', '2026-1-1'])('rejects %j', (d) => {
    expect(isUsableDate(d, now)).toBe(false);
  });
});
