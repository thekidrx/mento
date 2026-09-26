const bcrypt = require('bcryptjs');
const express = require('express');

function createAuthRouter(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    req.session.userId = user.id;
    req.session.displayName = user.display_name;
    res.json({ id: user.id, username: user.username, displayName: user.display_name });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    res.json({ id: req.session.userId, displayName: req.session.displayName });
  });

  return router;
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

module.exports = { createAuthRouter, requireAuth };
