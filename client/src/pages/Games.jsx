import { useState } from 'react';
import { WordlePage } from './Wordle';
import { SudokuPage } from './Sudoku';
import { SpotPage } from './Spot';
import { loadLastGame, saveLastGame } from './spotLogic';

const GAMES = [
  { id: 'wordle', label: 'Wordle' },
  { id: 'sudoku', label: 'Sudoku' },
  { id: 'spot', label: 'Spot it' },
];

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function GamesPage({ currentUserId }) {
  const [game, setGame] = useState(() => loadLastGame(browserStorage()));

  function choose(id) {
    setGame(id);
    saveLastGame(browserStorage(), id);
  }

  return (
    <div className="games-page">
      <div className="game-switch" role="tablist" aria-label="Games">
        {GAMES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={game === id}
            className={`game-switch-button${game === id ? ' active' : ''}`}
            onClick={() => choose(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Only the chosen game is mounted, so a hidden game's keyboard
          listener and timers are not running. */}
      {game === 'wordle' && <WordlePage currentUserId={currentUserId} />}
      {game === 'sudoku' && <SudokuPage currentUserId={currentUserId} />}
      {game === 'spot' && <SpotPage currentUserId={currentUserId} />}
    </div>
  );
}
