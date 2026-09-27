const BASE = '/api';

let unauthorizedHandler = () => {};

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    unauthorizedHandler();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  getEvents: () => request('/events'),
  createEvent: (event) => request('/events', { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id, event) => request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),
  getNotes: () => request('/notes'),
  createNote: (message) => request('/notes', { method: 'POST', body: JSON.stringify({ message }) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  getUsers: () => request('/users'),
  getWordleToday: () => request('/wordle/today'),
  submitWordleGuess: (guess) =>
    request('/wordle/guess', { method: 'POST', body: JSON.stringify({ guess }) }),
  getWordleScore: () => request('/wordle/score'),
};
