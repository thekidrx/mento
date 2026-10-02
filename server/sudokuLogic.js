const fs = require('fs');
const path = require('path');

function loadPuzzlePool() {
  const filePath = path.join(__dirname, 'data', 'sudoku-puzzles.csv');
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const pairs = [];
  for (const line of lines) {
    const match = line.trim().match(/^([0-9]{81}),([0-9]{81})$/);
    if (match) {
      pairs.push({ puzzle: match[1], solution: match[2] });
    }
  }
  return pairs;
}

function pickDailyPuzzle(pool, usedPuzzles) {
  const usedSet = new Set(usedPuzzles);
  const available = pool.filter((p) => !usedSet.has(p.puzzle));
  const chosenFrom = available.length > 0 ? available : pool;
  return chosenFrom[Math.floor(Math.random() * chosenFrom.length)];
}

function computeElapsedSeconds(startedAt, finishedAt) {
  const start = new Date(startedAt.replace(' ', 'T') + 'Z');
  const end = new Date(finishedAt.replace(' ', 'T') + 'Z');
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

module.exports = { loadPuzzlePool, pickDailyPuzzle, computeElapsedSeconds };
