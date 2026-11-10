import { useState } from 'react';
import { api } from '../api';
import { CuteCat } from '../components/CuteCat';

export function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await api.login(username, password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-form card" onSubmit={handleSubmit}>
        <CuteCat className="login-mascot" />
        <h1 className="login-title">R&amp;S</h1>
        <p className="login-subtitle">Welcome back. Sign in to our little corner.</p>
        <label className="field">
          <span className="field-label">Username</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p className="login-footnote">A private space for the two of us.</p>
    </div>
  );
}
