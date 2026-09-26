// server/__tests__/events.test.js
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

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'ryan', password: 'testpass' });
  return agent;
}

describe('events API', () => {
  it('rejects unauthenticated requests', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });

  it('creates and lists an event', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app);

    const createRes = await agent.post('/api/events').send({ title: 'Dinner', date: '2026-10-01' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.title).toBe('Dinner');

    const listRes = await agent.get('/api/events');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
  });

  it('rejects creating an event with no title or date', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app);
    const res = await agent.post('/api/events').send({ title: 'No date' });
    expect(res.status).toBe(400);
  });

  it('updates an event', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app);
    const createRes = await agent.post('/api/events').send({ title: 'Dinner', date: '2026-10-01' });

    const updateRes = await agent.put(`/api/events/${createRes.body.id}`).send({ title: 'Brunch' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Brunch');
  });

  it('returns 404 when updating a nonexistent event', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app);
    const res = await agent.put('/api/events/999').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  it('deletes an event', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app);
    const createRes = await agent.post('/api/events').send({ title: 'Dinner', date: '2026-10-01' });

    const deleteRes = await agent.delete(`/api/events/${createRes.body.id}`);
    expect(deleteRes.status).toBe(200);

    const listRes = await agent.get('/api/events');
    expect(listRes.body).toHaveLength(0);
  });
});
