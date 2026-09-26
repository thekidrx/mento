const express = require('express');

function createNotesRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const notes = db
      .prepare(
        `SELECT notes.*, users.display_name FROM notes
         JOIN users ON users.id = notes.created_by
         ORDER BY notes.created_at DESC`
      )
      .all();
    res.json(notes);
  });

  router.post('/', (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const result = db
      .prepare('INSERT INTO notes (message, created_by) VALUES (?, ?)')
      .run(message.trim(), req.session.userId);
    const note = db
      .prepare(
        `SELECT notes.*, users.display_name FROM notes
         JOIN users ON users.id = notes.created_by
         WHERE notes.id = ?`
      )
      .get(result.lastInsertRowid);
    res.status(201).json(note);
  });

  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }
    if (existing.created_by !== req.session.userId) {
      return res.status(403).json({ error: 'Cannot delete a note you did not write' });
    }
    db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createNotesRouter };
