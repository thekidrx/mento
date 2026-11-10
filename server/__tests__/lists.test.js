// server/__tests__/lists.test.js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { createDb } = require('../db');

function setupTestDb() {
  const db = createDb(':memory:');
  const hash = bcrypt.hashSync('testpass', 4);
  const insert = db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  );
  insert.run('ryan', hash, 'Ryan');
  insert.run('sam', hash, 'Sam');
  return db;
}

async function loginAgent(app, username) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'testpass' });
  return agent;
}

describe('lists API', () => {
  let db;
  let app;
  let ryan;
  let sam;

  beforeEach(async () => {
    db = setupTestDb();
    app = createApp(db);
    ryan = await loginAgent(app, 'ryan');
    sam = await loginAgent(app, 'sam');
  });

  it('creates a list and returns it with zero counts in the overview', async () => {
    const res = await ryan.post('/api/lists').send({ name: '  Groceries  ' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Groceries');

    const list = await ryan.get('/api/lists');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: 'Groceries', item_count: 0, checked_count: 0 });
  });

  it('lists newest first', async () => {
    await ryan.post('/api/lists').send({ name: 'A' });
    await ryan.post('/api/lists').send({ name: 'B' });
    const res = await ryan.get('/api/lists');
    expect(res.body.map((l) => l.name)).toEqual(['B', 'A']);
  });

  it('lets the other user see and rename a list', async () => {
    const created = await ryan.post('/api/lists').send({ name: 'Groceries' });
    const res = await sam.put(`/api/lists/${created.body.id}`).send({ name: ' Food ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Food');

    const list = await ryan.get('/api/lists');
    expect(list.body[0].name).toBe('Food');
  });

  it('deletes a list', async () => {
    const created = await ryan.post('/api/lists').send({ name: 'Groceries' });
    const res = await sam.delete(`/api/lists/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const list = await ryan.get('/api/lists');
    expect(list.body).toEqual([]);
  });

  it.each([
    [{}, 'List name is required'],
    [{ name: '   ' }, 'List name is required'],
    [{ name: 42 }, 'List name is required'],
    [{ name: null }, 'List name is required'],
  ])('rejects create with body %j', async (body, error) => {
    const res = await ryan.post('/api/lists').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
  });

  it('rejects an empty name on rename', async () => {
    const created = await ryan.post('/api/lists').send({ name: 'Groceries' });
    const res = await ryan.put(`/api/lists/${created.body.id}`).send({ name: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('List name is required');
  });

  it('rejects a name over 60 characters on create and rename', async () => {
    const tooLong = await ryan.post('/api/lists').send({ name: 'a'.repeat(61) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBe('List name must be 60 characters or fewer');

    const ok = await ryan.post('/api/lists').send({ name: 'a'.repeat(60) });
    expect(ok.status).toBe(201);

    const rename = await ryan.put(`/api/lists/${ok.body.id}`).send({ name: 'b'.repeat(61) });
    expect(rename.status).toBe(400);
  });

  it.each(['999', 'abc'])('returns 404 for list id %s', async (id) => {
    const put = await ryan.put(`/api/lists/${id}`).send({ name: 'X' });
    expect(put.status).toBe(404);
    expect(put.body.error).toBe('List not found');

    const del = await ryan.delete(`/api/lists/${id}`);
    expect(del.status).toBe(404);
    expect(del.body.error).toBe('List not found');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/lists');
    expect(res.status).toBe(401);
  });
});
