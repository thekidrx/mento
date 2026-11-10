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

describe('list items API', () => {
  let db;
  let app;
  let ryan;
  let sam;
  let listId;

  async function addItem(text, agent = ryan, list = listId) {
    const res = await agent.post(`/api/lists/${list}/items`).send({ text });
    return res.body;
  }

  async function getItems() {
    const res = await ryan.get(`/api/lists/${listId}`);
    return res.body.items;
  }

  beforeEach(async () => {
    db = setupTestDb();
    app = createApp(db);
    ryan = await loginAgent(app, 'ryan');
    sam = await loginAgent(app, 'sam');
    const created = await ryan.post('/api/lists').send({ name: 'Groceries' });
    listId = created.body.id;
  });

  it('adds items and returns them oldest first', async () => {
    const res = await ryan.post(`/api/lists/${listId}/items`).send({ text: ' Milk ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      text: 'Milk',
      list_id: listId,
      checked_by: null,
      checked_at: null,
      checked_by_name: null,
    });
    await addItem('Eggs');

    const list = await ryan.get(`/api/lists/${listId}`);
    expect(list.status).toBe(200);
    expect(list.body.name).toBe('Groceries');
    expect(list.body.items.map((i) => i.text)).toEqual(['Milk', 'Eggs']);
  });

  it('records who checked an item and shows it to the other user', async () => {
    const milk = await addItem('Milk');
    const res = await sam.put(`/api/lists/${listId}/items/${milk.id}`).send({ checked: true });
    expect(res.status).toBe(200);
    expect(res.body.checked_by_name).toBe('Sam');

    const items = await getItems();
    expect(items[0].checked_by_name).toBe('Sam');
    expect(items[0].checked_at).toBeTruthy();
  });

  it('keeps the original checker when an item is checked twice', async () => {
    const milk = await addItem('Milk');
    await sam.put(`/api/lists/${listId}/items/${milk.id}`).send({ checked: true });
    const res = await ryan.put(`/api/lists/${listId}/items/${milk.id}`).send({ checked: true });
    expect(res.body.checked_by_name).toBe('Sam');
  });

  it('unchecks an item and clears both fields', async () => {
    const milk = await addItem('Milk');
    await sam.put(`/api/lists/${listId}/items/${milk.id}`).send({ checked: true });
    const res = await ryan.put(`/api/lists/${listId}/items/${milk.id}`).send({ checked: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ checked_by: null, checked_at: null, checked_by_name: null });
  });

  it('orders unchecked items first, then checked by most recent', async () => {
    const a = await addItem('A');
    await addItem('B');
    const c = await addItem('C');
    await ryan.put(`/api/lists/${listId}/items/${a.id}`).send({ checked: true });
    await ryan.put(`/api/lists/${listId}/items/${c.id}`).send({ checked: true });
    // Pin the timestamps so the order does not depend on how fast the test ran.
    const setCheckedAt = db.prepare('UPDATE list_items SET checked_at = ? WHERE id = ?');
    setCheckedAt.run('2026-11-09 10:00:00', a.id);
    setCheckedAt.run('2026-11-09 11:00:00', c.id);

    const items = await getItems();
    expect(items.map((i) => i.text)).toEqual(['B', 'C', 'A']);
  });

  it('updates overview counts', async () => {
    const a = await addItem('A');
    await addItem('B');
    await addItem('C');
    await ryan.put(`/api/lists/${listId}/items/${a.id}`).send({ checked: true });

    const res = await ryan.get('/api/lists');
    expect(res.body[0]).toMatchObject({ item_count: 3, checked_count: 1 });
  });

  it('deletes one item', async () => {
    const a = await addItem('A');
    await addItem('B');
    const res = await sam.delete(`/api/lists/${listId}/items/${a.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await getItems()).map((i) => i.text)).toEqual(['B']);
  });

  it('clears checked items only', async () => {
    const a = await addItem('A');
    await addItem('B');
    const c = await addItem('C');
    await ryan.put(`/api/lists/${listId}/items/${a.id}`).send({ checked: true });
    await ryan.put(`/api/lists/${listId}/items/${c.id}`).send({ checked: true });

    const res = await ryan.post(`/api/lists/${listId}/clear-checked`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, removed: 2 });
    expect((await getItems()).map((i) => i.text)).toEqual(['B']);
  });

  it('clears nothing when nothing is checked', async () => {
    await addItem('A');
    const res = await ryan.post(`/api/lists/${listId}/clear-checked`);
    expect(res.body).toEqual({ ok: true, removed: 0 });
    expect((await getItems()).map((i) => i.text)).toEqual(['A']);
  });

  it('only clears checked items from the list in the path', async () => {
    const other = await ryan.post('/api/lists').send({ name: 'Other' });
    const item = await addItem('Keep me', ryan, other.body.id);
    await ryan.put(`/api/lists/${other.body.id}/items/${item.id}`).send({ checked: true });

    await ryan.post(`/api/lists/${listId}/clear-checked`);
    const res = await ryan.get(`/api/lists/${other.body.id}`);
    expect(res.body.items).toHaveLength(1);
  });

  it('removes items when their list is deleted', async () => {
    await addItem('A');
    await addItem('B');
    expect(db.prepare('SELECT COUNT(*) AS n FROM list_items').get().n).toBe(2);
    await ryan.delete(`/api/lists/${listId}`);
    expect(db.prepare('SELECT COUNT(*) AS n FROM list_items').get().n).toBe(0);
  });

  it.each([[{}], [{ text: '  ' }], [{ text: 7 }], [{ text: null }]])(
    'rejects item body %j',
    async (body) => {
      const res = await ryan.post(`/api/lists/${listId}/items`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Item text is required');
    }
  );

  it('rejects item text over 200 characters', async () => {
    const tooLong = await ryan.post(`/api/lists/${listId}/items`).send({ text: 'a'.repeat(201) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBe('Item text must be 200 characters or fewer');

    const ok = await ryan.post(`/api/lists/${listId}/items`).send({ text: 'a'.repeat(200) });
    expect(ok.status).toBe(201);
  });

  it.each([[{}], [{ checked: 'yes' }], [{ checked: 1 }]])(
    'rejects check body %j',
    async (body) => {
      const milk = await addItem('Milk');
      const res = await ryan.put(`/api/lists/${listId}/items/${milk.id}`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('checked must be true or false');
    }
  );

  it('returns 404 for an item addressed through the wrong list', async () => {
    const milk = await addItem('Milk');
    const other = await ryan.post('/api/lists').send({ name: 'Other' });
    const base = `/api/lists/${other.body.id}/items/${milk.id}`;

    const put = await ryan.put(base).send({ checked: true });
    expect(put.status).toBe(404);
    expect(put.body.error).toBe('Item not found');

    const del = await ryan.delete(base);
    expect(del.status).toBe(404);
    expect(del.body.error).toBe('Item not found');

    const items = await getItems();
    expect(items).toHaveLength(1);
    expect(items[0].checked_at).toBeNull();
  });

  it.each(['999', 'abc'])('returns 404 for unknown id %s', async (id) => {
    const getList = await ryan.get(`/api/lists/${id}`);
    expect(getList.status).toBe(404);
    expect(getList.body.error).toBe('List not found');

    const addToMissing = await ryan.post(`/api/lists/${id}/items`).send({ text: 'X' });
    expect(addToMissing.status).toBe(404);
    expect(addToMissing.body.error).toBe('List not found');

    const clearMissing = await ryan.post(`/api/lists/${id}/clear-checked`);
    expect(clearMissing.status).toBe(404);
    expect(clearMissing.body.error).toBe('List not found');

    const put = await ryan.put(`/api/lists/${listId}/items/${id}`).send({ checked: true });
    expect(put.status).toBe(404);
    expect(put.body.error).toBe('Item not found');

    const del = await ryan.delete(`/api/lists/${listId}/items/${id}`);
    expect(del.status).toBe(404);
    expect(del.body.error).toBe('Item not found');
  });

  it('rejects unauthenticated item requests', async () => {
    const res = await request(app).post(`/api/lists/${listId}/items`).send({ text: 'X' });
    expect(res.status).toBe(401);
  });
});
