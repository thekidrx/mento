const { computeScoreTally } = require('../gameScoring');

describe('computeScoreTally', () => {
  it('awards a point to whoever had the lower value each day, and nothing on a tie', () => {
    const days = [
      { counts: { 1: 2, 2: 4 } },   // user 1 wins
      { counts: { 1: 5, 2: 5 } },   // tie, no point
      { counts: { 1: Infinity, 2: 3 } }, // user 2 wins (user 1 didn't finish)
      { counts: { 1: Infinity, 2: Infinity } }, // both failed, tie, no point
    ];
    expect(computeScoreTally(days, 1, 2)).toEqual({ 1: 1, 2: 1 });
  });
});
