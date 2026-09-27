import { describe, it, expect } from 'vitest';
import { normalizeGuess, isValidShape, buildKeyboardState } from '../pages/wordleLogic';

describe('normalizeGuess', () => {
  it('trims whitespace and uppercases', () => {
    expect(normalizeGuess('  crane ')).toBe('CRANE');
  });
});

describe('isValidShape', () => {
  it('accepts exactly 5 letters', () => {
    expect(isValidShape('CRANE')).toBe(true);
  });

  it('rejects the wrong length or non-letters', () => {
    expect(isValidShape('CRAN')).toBe(false);
    expect(isValidShape('12345')).toBe(false);
  });
});

describe('buildKeyboardState', () => {
  it('tracks the best-known feedback per letter', () => {
    const guesses = [{ guess: 'CRANE', feedback: 'BYGBB' }];
    const state = buildKeyboardState(guesses);
    expect(state).toEqual({ C: 'B', R: 'Y', A: 'G', N: 'B', E: 'B' });
  });

  it('never downgrades a letter from a better-known status', () => {
    const guesses = [
      { guess: 'CRANE', feedback: 'GBBBB' }, // C is green
      { guess: 'CHESS', feedback: 'BBBBB' }, // C is black here, should not override green
    ];
    expect(buildKeyboardState(guesses).C).toBe('G');
  });
});
