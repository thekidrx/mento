import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { api, setUnauthorizedHandler } from './api';

export function App() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

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
        <button onClick={handleLogout}>Log out</button>
      </header>
      <p>Calendar and notes coming up next.</p>
    </div>
  );
}
