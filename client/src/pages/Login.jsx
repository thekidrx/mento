import { useState } from 'react';
import { api } from '../api';
import { CuteCat } from '../components/CuteCat';

export function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await api.login(username, password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <CuteCat className="login-mascot" />
      <h1>R&amp;S</h1>
      <input
        name="username"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
      />
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Log in</button>
    </form>
  );
}
