import { describe, it, expect } from 'vitest';
import {
  toScenePoint,
  formatCountdown,
  resultLine,
  loadLastGame,
  saveLastGame,
} from '../pages/spotLogic';

describe('toScenePoint', () => {
  const rect = { left: 20, top: 100, width: 320, height: 240 };
  it.each([
    [20, 100, 0, 0], [340, 340, 400, 300], [180, 220, 200, 150], [100, 160, 100, 75],
    [0, 0, 0, 0], [999, 999, 400, 300], [21, 101, 1.3, 1.3],
  ])('(%i, %i) → (%f, %f)', (cx, cy, x, y) => {
    expect(toScenePoint(cx, cy, rect)).toEqual({ x, y });
  });
});

describe('formatCountdown', () => {
  it.each([[45000, '45.0'], [38449, '38.4'], [9999, '9.9'], [100, '0.1'], [99, '0.0'], [0, '0.0'], [-500, '0.0']])(
    '%i → %s', (ms, text) => { expect(formatCountdown(ms)).toBe(text); });
});

describe('resultLine', () => {
  it.each([
    [5, 7, 41234, 'You found 5 of 7 in 41.2s.'],
    [7, 7, 33000, 'You found all 7 in 33.0s.'],
    [1, 7, 2050, 'You found 1 of 7 in 2.0s.'],
    [0, 7, 0, "You didn't find any this time."],
  ])('%i of %i in %i', (found, total, ms, text) => { expect(resultLine(found, total, ms)).toBe(text); });
});

describe('last game memory', () => {
  const store = (initial = {}) => ({ data: { ...initial },
    getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = String(v); } });
  it('defaults to wordle', () => { expect(loadLastGame(store())).toBe('wordle'); });
  it('remembers a saved game', () => { const s = store(); saveLastGame(s, 'spot'); expect(loadLastGame(s)).toBe('spot'); });
  it('ignores an unknown stored value', () => { expect(loadLastGame(store({ 'last-game': 'chess' }))).toBe('wordle'); });
  it('survives storage that throws', () => {
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(loadLastGame(broken)).toBe('wordle');
    expect(() => saveLastGame(broken, 'spot')).not.toThrow();
  });
});
