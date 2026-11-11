const express = require('express');
const session = require('express-session');
const path = require('path');
const SqliteStore = require('better-sqlite3-session-store')(session);
const { createAuthRouter, requireAuth } = require('./auth');
const { createEventsRouter } = require('./routes/events');
const { createNotesRouter } = require('./routes/notes');
const { createListsRouter } = require('./routes/lists');
const { createPhotosRouter, photosBodyError } = require('./routes/photos');
const { createWordleRouter } = require('./routes/wordle');
const { createUsersRouter } = require('./routes/users');
const { createSudokuRouter } = require('./routes/sudoku');
const { createSpotRouter } = require('./routes/spot');

function createApp(db, options = {}) {
  const app = express();
  app.use(session({
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 900000 },
    }),
    secret: options.sessionSecret || process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
  }));

  // Photo uploads need a much larger body than anything else. They get their
  // own parser, placed after the login check so a logged-out client cannot
  // make the server read megabytes, and before the default parser below
  // (which skips a body that has already been parsed).
  if (options.photosDir) {
    app.use(
      '/api/photos',
      requireAuth,
      express.json({ limit: '8mb' }),
      createPhotosRouter(db, options.photosDir),
      photosBodyError
    );
  }

  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/events', requireAuth, createEventsRouter(db));
  app.use('/api/notes', requireAuth, createNotesRouter(db));
  app.use('/api/lists', requireAuth, createListsRouter(db));
  app.use('/api/wordle', requireAuth, createWordleRouter(db));
  app.use('/api/users', requireAuth, createUsersRouter(db));
  app.use('/api/sudoku', requireAuth, createSudokuRouter(db));
  app.use('/api/spot', requireAuth, createSpotRouter(db, { now: options.now }));

  // Unknown /api routes must answer with JSON, never the SPA's index.html.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(options.staticDir, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}

module.exports = { createApp };
