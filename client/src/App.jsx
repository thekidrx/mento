import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { CalendarPage } from './pages/Calendar';
import { NotesPage } from './pages/Notes';
import { WordlePage } from './pages/Wordle';
import { api, setUnauthorizedHandler } from './api';

export function App() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState('calendar');

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.me().then(setUser).catch(() => {}).finally(() => setChecked(true));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (!checked) return null;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header>
        <span>Hi, {user.displayName}</span>
        <nav>
          <button onClick={() => setTab('calendar')}>Calendar</button>
          <button onClick={() => setTab('notes')}>Notes</button>
          <button onClick={() => setTab('wordle')}>Wordle</button>
        </nav>
        <button onClick={handleLogout}>Log out</button>
      </header>
      {tab === 'calendar' && <CalendarPage />}
      {tab === 'notes' && <NotesPage currentUserId={user.id} />}
      {tab === 'wordle' && <WordlePage currentUserId={user.id} />}
    </div>
  );
}
