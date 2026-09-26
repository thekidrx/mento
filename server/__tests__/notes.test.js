// server/__tests__/notes.test.js
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

async function loginAgent(app, username) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'testpass' });
  return agent;
}

describe('notes API', () => {
  it('creates and lists a note with the author display name', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');

    const createRes = await agent.post('/api/notes').send({ message: 'Miss you' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.display_name).toBe('Ryan');

    const listRes = await agent.get('/api/notes');
    expect(listRes.body).toHaveLength(1);
  });

  it('rejects an empty message', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const res = await agent.post('/api/notes').send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  it('lets a user delete their own note', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const createRes = await agent.post('/api/notes').send({ message: 'Miss you' });

    const deleteRes = await agent.delete(`/api/notes/${createRes.body.id}`);
    expect(deleteRes.status).toBe(200);
  });

  it("prevents deleting someone else's note", async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');

    const createRes = await ryanAgent.post('/api/notes').send({ message: 'Miss you' });
    const deleteRes = await samAgent.delete(`/api/notes/${createRes.body.id}`);
    expect(deleteRes.status).toBe(403);
  });
});
