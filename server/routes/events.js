const express = require('express');

function createEventsRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const events = db.prepare('SELECT * FROM events ORDER BY date ASC').all();
    res.json(events);
  });

  router.post('/', (req, res) => {
    const { title, description, date } = req.body;
    if (!title || !date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }
    const result = db
      .prepare('INSERT INTO events (title, description, date, created_by) VALUES (?, ?, ?, ?)')
      .run(title, description || '', date, req.session.userId);
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(event);
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const { title, description, date } = req.body;
    // `undefined`/`null` means "keep the existing value"; an explicitly supplied
    // blank title is invalid, same as on POST.
    if (title !== undefined && title !== null && !String(title).trim()) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }
    if (date !== undefined && date !== null && !String(date).trim()) {
      return res.status(400).json({ error: 'Date cannot be empty' });
    }
    db.prepare('UPDATE events SET title = ?, description = ?, date = ? WHERE id = ?').run(
      title ?? existing.title,
      description ?? existing.description,
      date ?? existing.date,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createEventsRouter };
