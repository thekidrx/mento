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
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ).run('sam', hash, 'Sam');
  return db;
}

describe('users API', () => {
  it('rejects unauthenticated requests', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lists both seeded users with their display names', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'ryan', password: 'testpass' });

    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((u) => u.display_name).sort()).toEqual(['Ryan', 'Sam']);
  });
});
