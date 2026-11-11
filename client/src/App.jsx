import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { CalendarPage } from './pages/Calendar';
import { NotesPage } from './pages/Notes';
import { ListsPage } from './pages/Lists';
import { PhotosPage } from './pages/Photos';
import { GamesPage } from './pages/Games';
import { ForestSpirit } from './components/ForestSpirit';
import {
  CalendarIcon,
  NotesIcon,
  ListIcon,
  PhotoIcon,
  GamesIcon,
  LogoutIcon,
} from './components/Icons';
import { api, setUnauthorizedHandler } from './api';

const TABS = [
  { id: 'calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'notes', label: 'Notes', Icon: NotesIcon },
  { id: 'lists', label: 'Lists', Icon: ListIcon },
  { id: 'photos', label: 'Photos', Icon: PhotoIcon },
  { id: 'games', label: 'Games', Icon: GamesIcon },
];

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
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <ForestSpirit className="brand-mascot" />
            <span className="brand-name">R&amp;S</span>
          </div>
          <nav className="tabs" aria-label="Main">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`tab${tab === id ? ' active' : ''}`}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="topbar-user">
            <span className="user-chip">
              <span className="avatar" aria-hidden="true">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="user-name">Hi, {user.displayName}</span>
            </span>
            <button type="button" className="btn btn-ghost btn-icon-text" onClick={handleLogout}>
              <LogoutIcon size={18} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        {tab === 'calendar' && <CalendarPage />}
        {tab === 'notes' && <NotesPage currentUserId={user.id} />}
        {tab === 'lists' && <ListsPage />}
        {tab === 'photos' && <PhotosPage currentUserId={user.id} />}
        {tab === 'games' && <GamesPage currentUserId={user.id} />}
      </main>
    </div>
  );
}
