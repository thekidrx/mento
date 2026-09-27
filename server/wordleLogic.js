function computeFeedback(guess, answer) {
  const result = new Array(5).fill('B');
  const guessLetters = guess.split('');
  const answerLetters = answer.split('');
  const remaining = {};

  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === answerLetters[i]) {
      result[i] = 'G';
    } else {
      remaining[answerLetters[i]] = (remaining[answerLetters[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === 'G') continue;
    const letter = guessLetters[i];
    if (remaining[letter] > 0) {
      result[i] = 'Y';
      remaining[letter] -= 1;
    }
  }

  return result.join('');
}

module.exports = { computeFeedback };
