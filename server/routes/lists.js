const express = require('express');

const MAX_NAME_LENGTH = 60;

// Returns { value } with the trimmed text, or { problem: 'required' | 'too_long' }.
function cleanText(value, max) {
  if (typeof value !== 'string') return { problem: 'required' };
  const trimmed = value.trim();
  if (!trimmed) return { problem: 'required' };
  if (trimmed.length > max) return { problem: 'too_long' };
  return { value: trimmed };
}

function createListsRouter(db) {
  const router = express.Router();

  function findList(id) {
    return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
  }

  // Sends the 400 and returns null when the name is unusable.
  function readName(req, res) {
    const result = cleanText(req.body.name, MAX_NAME_LENGTH);
    if (result.problem === 'required') {
      res.status(400).json({ error: 'List name is required' });
      return null;
    }
    if (result.problem === 'too_long') {
      res.status(400).json({ error: `List name must be ${MAX_NAME_LENGTH} characters or fewer` });
      return null;
    }
    return result.value;
  }

  router.get('/', (req, res) => {
    const lists = db
      .prepare(
        `SELECT lists.*,
                COUNT(list_items.id) AS item_count,
                COUNT(list_items.checked_at) AS checked_count
         FROM lists
         LEFT JOIN list_items ON list_items.list_id = lists.id
         GROUP BY lists.id
         ORDER BY lists.id DESC`
      )
      .all();
    res.json(lists);
  });

  router.post('/', (req, res) => {
    const name = readName(req, res);
    if (name === null) return;
    const result = db
      .prepare('INSERT INTO lists (name, created_by) VALUES (?, ?)')
      .run(name, req.session.userId);
    res.status(201).json(findList(result.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const list = findList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    const name = readName(req, res);
    if (name === null) return undefined;
    db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(name, list.id);
    return res.json(findList(list.id));
  });

  router.delete('/:id', (req, res) => {
    const list = findList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    // Foreign keys are not enforced on this connection, so nothing cascades.
    db.transaction(() => {
      db.prepare('DELETE FROM list_items WHERE list_id = ?').run(list.id);
      db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
    })();
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { createListsRouter };
