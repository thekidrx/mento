// server/__tests__/spotLogic.test.js
const {
  deadlineMs,
  isValidTap,
  judgeTap,
  isFinished,
  playerResult,
  dayWinner,
  rankValue,
} = require('../spotLogic');

const D = [{ index: 0, x: 100, y: 100, r: 26 }, { index: 1, x: 300, y: 100, r: 26 }];

describe('deadlineMs', () => {
  it.each([[1000, 0, 46000], [1000, 1, 43000], [1000, 15, 1000], [1000, 20, -14000]])(
    'start %i, %i wrong → %i', (s, w, d) => { expect(deadlineMs(s, w)).toBe(d); });
});

describe('isValidTap', () => {
  it.each([[0, 0], [400, 300], [123.4, 56.7]])('accepts %j, %j', (x, y) => { expect(isValidTap(x, y)).toBe(true); });
  it.each([['120', 50], [50, '120'], [NaN, 1], [1, Infinity], [null, 1], [undefined, undefined],
           [-0.1, 10], [400.1, 10], [10, -1], [10, 300.1], [{}, 1]])(
    'rejects %j, %j', (x, y) => { expect(isValidTap(x, y)).toBe(false); });
});

describe('judgeTap', () => {
  it('hits inside the radius and on its edge', () => {
    expect(judgeTap(D, [], 100, 100)).toEqual({ result: 'hit', index: 0 });
    expect(judgeTap(D, [], 126, 100)).toEqual({ result: 'hit', index: 0 });
  });
  it('misses just outside the radius', () => {
    expect(judgeTap(D, [], 126.5, 100)).toEqual({ result: 'miss' });
  });
  it('reports a repeat for a difference already found', () => {
    expect(judgeTap(D, [0], 100, 100)).toEqual({ result: 'repeat', index: 0 });
  });
  it('prefers the nearest unfound difference when circles overlap', () => {
    const close = [{ index: 0, x: 100, y: 100, r: 26 }, { index: 1, x: 130, y: 100, r: 26 }];
    expect(judgeTap(close, [], 120, 100)).toEqual({ result: 'hit', index: 1 });
    expect(judgeTap(close, [1], 120, 100)).toEqual({ result: 'hit', index: 0 });
  });
});

describe('isFinished', () => {
  const round = { startedAtMs: 1000, wrongTaps: 0, findCount: 0 };
  it('is still playing one millisecond before the deadline', () => { expect(isFinished(round, 45999)).toBe(false); });
  it('is finished at the deadline', () => { expect(isFinished(round, 46000)).toBe(true); });
  it('is finished early when all 7 are found', () => { expect(isFinished({ ...round, findCount: 7 }, 2000)).toBe(true); });
  it('is finished early when penalties use up the time', () => {
    expect(isFinished({ ...round, wrongTaps: 15 }, 1000)).toBe(true);
  });
});

describe('playerResult', () => {
  it('counts finds and times the last one from the start', () => {
    expect(playerResult(1000, [4000, 9000, 6000])).toEqual({ found: 3, timeMs: 8000 });
  });
  it('is zero for no finds', () => { expect(playerResult(1000, [])).toEqual({ found: 0, timeMs: 0 }); });
});

describe('dayWinner and rankValue', () => {
  it.each([
    [{ found: 5, timeMs: 40000 }, { found: 4, timeMs: 10000 }, 'a'],
    [{ found: 4, timeMs: 30000 }, { found: 4, timeMs: 29999 }, 'b'],
    [{ found: 4, timeMs: 30000 }, { found: 4, timeMs: 30000 }, 'tie'],
    [{ found: 0, timeMs: 0 }, { found: 0, timeMs: 0 }, 'tie'],
    [{ found: 1, timeMs: 44000 }, { found: 0, timeMs: 0 }, 'a'],
  ])('%j vs %j → %s', (a, b, winner) => {
    expect(dayWinner(a, b)).toBe(winner);
    const sign = Math.sign(rankValue(a) - rankValue(b));
    expect(sign).toBe(winner === 'a' ? -1 : winner === 'b' ? 1 : 0);
  });
  it('ranks someone who did not play last', () => {
    expect(rankValue(null)).toBe(Infinity);
    expect(rankValue({ found: 0, timeMs: 0 })).toBeLessThan(Infinity);
  });
});
