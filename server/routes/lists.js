const express = require('express');

const MAX_NAME_LENGTH = 60;
const MAX_ITEM_LENGTH = 200;

const ITEM_SELECT = `SELECT list_items.*, users.display_name AS checked_by_name
  FROM list_items
  LEFT JOIN users ON users.id = list_items.checked_by`;

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

  // Looked up through its list so an item cannot be reached via another list's path.
  function findItem(listId, itemId) {
    return db
      .prepare(`${ITEM_SELECT} WHERE list_items.id = ? AND list_items.list_id = ?`)
      .get(itemId, listId);
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

  router.get('/:id', (req, res) => {
    const list = findList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    // Unchecked first in the order added, then checked with the most recent on top.
    const items = db
      .prepare(
        `${ITEM_SELECT}
         WHERE list_items.list_id = ?
         ORDER BY (list_items.checked_at IS NOT NULL),
                  CASE WHEN list_items.checked_at IS NULL THEN list_items.id END ASC,
                  list_items.checked_at DESC,
                  list_items.id DESC`
      )
      .all(list.id);
    return res.json({ ...list, items });
  });

  router.post('/:id/items', (req, res) => {
    const list = findList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    const result = cleanText(req.body.text, MAX_ITEM_LENGTH);
    if (result.problem === 'required') {
      return res.status(400).json({ error: 'Item text is required' });
    }
    if (result.problem === 'too_long') {
      return res
        .status(400)
        .json({ error: `Item text must be ${MAX_ITEM_LENGTH} characters or fewer` });
    }
    const inserted = db
      .prepare('INSERT INTO list_items (list_id, text, created_by) VALUES (?, ?, ?)')
      .run(list.id, result.value, req.session.userId);
    return res.status(201).json(findItem(list.id, inserted.lastInsertRowid));
  });

  router.put('/:id/items/:itemId', (req, res) => {
    const list = findList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    const item = findItem(list.id, req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const { checked } = req.body;
    if (typeof checked !== 'boolean') {
      return res.status(400).json({ error: 'checked must be true or false' });
    }
    if (checked) {
      // The IS NULL guard keeps the original checker if it is checked again.
      db.prepare(
        `UPDATE list_items SET checked_by = ?, checked_at = datetime('now')
         WHERE id = ? AND checked_at IS NULL`
      ).run(req.session.userId, item.id);
    } else {
      db.prepare('UPDATE list_items SET checked_by = NULL, checked_at = NULL WHERE id = ?').run(
        item.id
      );
    }
    return res.json(findItem(list.id, item.id));
  });

  router.delete('/:id/items/:itemId', (req, res) => {
    const list = findList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    const item = findItem(list.id, req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    db.prepare('DELETE FROM list_items WHERE id = ?').run(item.id);
    return res.json({ ok: true });
  });

  router.post('/:id/clear-checked', (req, res) => {
    const list = findList(req.params.id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    const result = db
      .prepare('DELETE FROM list_items WHERE list_id = ? AND checked_at IS NOT NULL')
      .run(list.id);
    return res.json({ ok: true, removed: result.changes });
  });

  return router;
}

module.exports = { createListsRouter };
