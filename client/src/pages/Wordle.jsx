import { useEffect, useState } from 'react';
import { api } from '../api';
import { normalizeGuess, isValidShape, buildKeyboardState } from './wordleLogic';

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
];

export function WordlePage({ currentUserId }) {
  const [guesses, setGuesses] = useState([]);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [todayResult, setTodayResult] = useState(null);
  const [score, setScore] = useState({});
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadToday();
    loadScore();
    loadUsers();
  }, []);

  async function loadToday() {
    const data = await api.getWordleToday();
    setGuesses(data.guesses);
    setSolved(data.solved);
    setFailed(data.failed);
    setOpponentFinished(data.opponentFinished);
    setTodayResult(data.todayResult || null);
  }

  async function loadScore() {
    setScore(await api.getWordleScore());
  }

  async function loadUsers() {
    setUsers(await api.getUsers());
  }

  async function submitGuess(rawInput) {
    setError('');
    const guess = normalizeGuess(rawInput);
    if (!isValidShape(guess)) {
      setError('Guess must be 5 letters');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitWordleGuess(guess);
      setInput('');
      await loadToday();
      await loadScore();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKey(key) {
    if (solved || failed) return;
    if (key === 'ENTER') {
      if (submitting) return;
      submitGuess(input);
    } else if (key === 'BACKSPACE') {
      setInput((prev) => prev.slice(0, -1));
    } else if (/^[A-Z]$/.test(key)) {
      setInput((prev) => (prev.length < 5 ? prev + key : prev));
    }
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (key === 'ENTER' || key === 'BACKSPACE' || /^[A-Z]$/.test(key)) {
        e.preventDefault();
        handleKey(key);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const self = users.find((u) => u.id === currentUserId);
  const opponent = users.find((u) => u.id !== currentUserId);
  const keyboardState = buildKeyboardState(guesses);

  const rows = [];
  for (let i = 0; i < 6; i++) {
    if (guesses[i]) {
      rows.push({ letters: guesses[i].guess.split(''), feedback: guesses[i].feedback.split('') });
    } else if (i === guesses.length && !solved && !failed) {
      rows.push({ letters: input.padEnd(5).split(''), feedback: null });
    } else {
      rows.push({ letters: ['', '', '', '', ''], feedback: null });
    }
  }

  return (
    <div className="wordle-page">
      {self && opponent && (
        <div className="wordle-score">
          {self.display_name} {score[self.id] || 0} – {opponent.display_name} {score[opponent.id] || 0}
        </div>
      )}
      <div className="wordle-grid">
        {rows.map((row, i) => (
          <div key={i} className="wordle-row">
            {row.letters.map((letter, j) => (
              <div
                key={j}
                className={`wordle-tile${row.feedback ? ` feedback-${row.feedback[j]}` : ''}`}
              >
                {letter.trim()}
              </div>
            ))}
          </div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {(solved || failed) && !opponentFinished && (
        <p>Waiting on {opponent ? opponent.display_name : 'your partner'} to finish today's puzzle.</p>
      )}
      {todayResult && (
        <p>
          {todayResult.winner === 'tie' && "Today's puzzle was a tie."}
          {todayResult.winner === 'you' && 'You won today!'}
          {todayResult.winner === 'opponent' &&
            `${opponent ? opponent.display_name : 'Your partner'} won today.`}
          {' '}({todayResult.yourGuesses} vs {todayResult.opponentGuesses} guesses). The word was{' '}
          {todayResult.answer}.
        </p>
      )}
      <div className="wordle-keyboard">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="wordle-keyboard-row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKey(key)}
                className={`wordle-key${keyboardState[key] ? ` feedback-${keyboardState[key]}` : ''}`}
              >
                {key === 'BACKSPACE' ? '⌫' : key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
