// server/__tests__/auth.test.js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { createDb } = require('../db');

function setupTestDb() {
  const db = createDb(':memory:');
  const hash = bcrypt.hashSync('testpass', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ).run('ryan', hash, 'Ryan');
  return db;
}

describe('auth', () => {
  it('logs in with correct credentials', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ryan', password: 'testpass' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('ryan');
  });

  it('rejects an incorrect password', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ryan', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown username', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'testpass' });
    expect(res.status).toBe(401);
  });

  it('reports not logged in on /me without a session', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user on /me after login', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'ryan', password: 'testpass' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Ryan');
  });

  it('invalidates the session on logout', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'ryan', password: 'testpass' });
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
