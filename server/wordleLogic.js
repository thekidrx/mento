const fs = require('fs');
const path = require('path');

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

function loadWordListFile(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((w) => w.trim().toUpperCase())
    .filter((w) => w.length === 5);
}

function loadAnswerWords() {
  return loadWordListFile('wordle-answers.txt');
}

function loadValidGuessSet() {
  const answers = loadWordListFile('wordle-answers.txt');
  const guesses = loadWordListFile('wordle-guesses.txt');
  return new Set([...answers, ...guesses]);
}

function pickDailyWord(answerWords, usedWords) {
  const usedSet = new Set(usedWords.map((w) => w.toUpperCase()));
  const available = answerWords.filter((w) => !usedSet.has(w));
  const pool = available.length > 0 ? available : answerWords;
  return pool[Math.floor(Math.random() * pool.length)];
}

function computeGuessCount(guesses, maxGuesses = 6) {
  const solvedIndex = guesses.findIndex((g) => g.feedback === 'GGGGG');
  if (solvedIndex !== -1) return solvedIndex + 1;
  if (guesses.length >= maxGuesses) return Infinity;
  return null;
}

function computeScoreTally(days, userAId, userBId) {
  const tally = { [userAId]: 0, [userBId]: 0 };
  for (const day of days) {
    const a = day.counts[userAId];
    const b = day.counts[userBId];
    if (a < b) tally[userAId] += 1;
    else if (b < a) tally[userBId] += 1;
  }
  return tally;
}

module.exports = {
  computeFeedback,
  loadAnswerWords,
  loadValidGuessSet,
  pickDailyWord,
  computeGuessCount,
  computeScoreTally,
};
