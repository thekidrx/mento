export function normalizeGuess(input) {
  return input.trim().toUpperCase();
}

export function isValidShape(guess) {
  return /^[A-Z]{5}$/.test(guess);
}

const PRIORITY = { G: 3, Y: 2, B: 1 };

export function buildKeyboardState(guesses) {
  const state = {};
  for (const { guess, feedback } of guesses) {
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      const mark = feedback[i];
      if (!state[letter] || PRIORITY[mark] > PRIORITY[state[letter]]) {
        state[letter] = mark;
      }
    }
  }
  return state;
}
