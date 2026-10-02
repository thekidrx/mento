import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  parseServerTimestamp,
  formatElapsed,
  isCorrectEntry,
  isGridComplete,
  loadSavedCells,
  saveCells,
} from './sudokuLogic';

export function SudokuPage({ currentUserId }) {
  const [puzzle, setPuzzle] = useState(null);
  const [solution, setSolution] = useState(null);
  const [cells, setCells] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [todayResult, setTodayResult] = useState(null);
  const [score, setScore] = useState({});
  const [users, setUsers] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [wrongFlashIndex, setWrongFlashIndex] = useState(null);
  const [, forceTick] = useState(0);
  const wrongFlashTimer = useRef(null);

  useEffect(() => {
    loadToday();
    loadScore();
    loadUsers();
  }, []);

  useEffect(() => {
    if (!startedAt || finishedAt) return undefined;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt, finishedAt]);

  async function loadToday() {
    const data = await api.getSudokuToday();
    setPuzzle(data.puzzle);
    setSolution(data.solution);
    setStartedAt(data.startedAt);
    setFinishedAt(data.finishedAt);
    setOpponentFinished(data.opponentFinished);
    setTodayResult(data.todayResult || null);

    if (data.finishedAt) {
      setCells(data.solution.split(''));
    } else {
      const saved = loadSavedCells(window.localStorage, `sudoku-cells-${currentUserId}-${data.puzzle}`);
      setCells(saved || data.puzzle.split(''));
    }
  }

  async function loadScore() {
    setScore(await api.getSudokuScore());
  }

  async function loadUsers() {
    setUsers(await api.getUsers());
  }

  async function handleDigit(digit) {
    if (selectedIndex === null || finishedAt) return;
    if (puzzle[selectedIndex] !== '0') return;

    if (!isCorrectEntry(solution, selectedIndex, digit)) {
      setWrongFlashIndex(selectedIndex);
      clearTimeout(wrongFlashTimer.current);
      wrongFlashTimer.current = setTimeout(() => setWrongFlashIndex(null), 300);
      return;
    }

    const nextCells = cells.slice();
    nextCells[selectedIndex] = String(digit);
    setCells(nextCells);
    saveCells(window.localStorage, `sudoku-cells-${currentUserId}-${puzzle}`, nextCells);

    if (!startedAt) {
      const result = await api.startSudoku();
      setStartedAt(result.startedAt);
    }

    if (isGridComplete(nextCells)) {
      const result = await api.finishSudoku();
      setFinishedAt(result.finishedAt);
      loadScore();
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (/^[1-9]$/.test(e.key)) {
        handleDigit(e.key);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!puzzle || !cells) return null;

  const self = users.find((u) => u.id === currentUserId);
  const opponent = users.find((u) => u.id !== currentUserId);

  let elapsedSeconds = 0;
  if (startedAt && finishedAt) {
    elapsedSeconds = Math.round(
      (parseServerTimestamp(finishedAt).getTime() - parseServerTimestamp(startedAt).getTime()) / 1000
    );
  } else if (startedAt) {
    elapsedSeconds = Math.round((Date.now() - parseServerTimestamp(startedAt).getTime()) / 1000);
  }

  return (
    <div className="sudoku-page">
      {self && opponent && (
        <div className="sudoku-score">
          {self.display_name} {score[self.id] || 0} – {opponent.display_name} {score[opponent.id] || 0}
        </div>
      )}
      {startedAt && <div className="sudoku-timer">{formatElapsed(elapsedSeconds)}</div>}
      <div className="sudoku-grid">
        {cells.map((value, i) => {
          const col = i % 9;
          const row = Math.floor(i / 9);
          const classes = ['sudoku-cell'];
          if (puzzle[i] !== '0') classes.push('given');
          if (i === selectedIndex) classes.push('selected');
          if (i === wrongFlashIndex) classes.push('wrong-flash');
          if (col === 2 || col === 5) classes.push('border-right-thick');
          if (row === 2 || row === 5) classes.push('border-bottom-thick');
          return (
            <div
              key={i}
              className={classes.join(' ')}
              onClick={() => {
                if (puzzle[i] === '0' && !finishedAt) setSelectedIndex(i);
              }}
            >
              {value !== '0' ? value : ''}
            </div>
          );
        })}
      </div>
      {!finishedAt && (
        <div className="sudoku-numpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" onClick={() => handleDigit(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      {finishedAt && !opponentFinished && (
        <p>Waiting on {opponent ? opponent.display_name : 'your partner'} to finish today's puzzle.</p>
      )}
      {todayResult && (
        <p>
          {todayResult.winner === 'tie' && "Today's puzzle was a tie."}
          {todayResult.winner === 'you' && 'You won today!'}
          {todayResult.winner === 'opponent' &&
            `${opponent ? opponent.display_name : 'Your partner'} won today.`}
          {' '}({formatElapsed(todayResult.yourSeconds)} vs {formatElapsed(todayResult.opponentSeconds)})
        </p>
      )}
    </div>
  );
}
