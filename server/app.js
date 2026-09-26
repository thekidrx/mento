const express = require('express');
const session = require('express-session');
const path = require('path');
const { createAuthRouter } = require('./auth');

function createApp(db, options = {}) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: options.sessionSecret || process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
  }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', createAuthRouter(db));

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(options.staticDir, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };
