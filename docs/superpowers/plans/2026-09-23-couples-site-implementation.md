# Shared Calendar & Notes Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, two-user website (shared calendar + notes-to-each-other) that runs on a Raspberry Pi and is reachable 24/7 via a custom domain routed through Cloudflare Tunnel.

**Architecture:** A single Node.js/Express backend (SQLite storage) serves a small React (Vite) frontend as static files from the same process. Two hardcoded accounts, session-cookie auth. Packaged as one Docker container plus a `cloudflared` sidecar container, both managed with docker-compose on the Pi.

**Tech Stack:** Node.js + Express, better-sqlite3, bcryptjs, express-session, React + Vite, Vitest + Supertest for tests, Docker + docker-compose, Cloudflare Tunnel.

**Spec:** `docs/superpowers/specs/2026-09-23-couples-site-design.md`

## Global Constraints

- Exactly two user accounts, seeded from environment variables — no signup flow, no third-party OAuth (spec: Auth).
- Data lives in a single SQLite file on a mounted Docker volume — no heavier DB engine (spec: Architecture, Database).
- No public/inbound ports opened on the router — all traffic arrives via outbound Cloudflare Tunnel (spec: Networking).
- v1 excludes photo sharing, to-do lists, countdown widgets — do not add them (spec: Out of scope for v1).
- Both users can see/edit all events; notes can only be deleted by their author (spec: Data model, Key flows).

---

## File Structure

```
R&S Web/
  server/
    package.json
    app.js              # createApp(db, options) factory — testable without a real HTTP listener
    index.js             # real entrypoint: creates db, seeds users, starts listener
    db.js                # createDb(path) — opens SQLite, applies schema.sql
    schema.sql
    seed.js               # seedUsers(db) — inserts the two accounts from env vars
    auth.js               # createAuthRouter(db), requireAuth middleware
    routes/
      events.js           # createEventsRouter(db)
      notes.js             # createNotesRouter(db)
    __tests__/
      auth.test.js
      events.test.js
      notes.test.js
  client/
    package.json
    vite.config.js
    index.html
    src/
      main.jsx
      App.jsx
      api.js
      components/
        monthGrid.js       # pure calendar-grid logic (tested)
        MonthGrid.jsx        # renders the grid
      pages/
        Login.jsx
        Calendar.jsx
        notesLogic.js         # pure canDeleteNote() helper (tested)
        Notes.jsx
      __tests__/
        monthGrid.test.js
        notesLogic.test.js
      index.css
  scripts/
    backup.sh
  Dockerfile
  docker-compose.yml
  .env.example
  .gitignore
  .dockerignore
  docs/
    DEPLOYMENT.md
```

---

### Task 1: Backend scaffold — Express app, SQLite, health check

**Files:**
- Create: `server/package.json`
- Create: `server/db.js`
- Create: `server/schema.sql`
- Create: `server/app.js`
- Test: `server/__tests__/health.test.js`

**Interfaces:**
- Produces: `createDb(dbPath = DB_PATH)` → returns a `better-sqlite3` `Database` instance with schema applied. Exported from `server/db.js` alongside `DB_PATH`.
- Produces: `createApp(db, options = {})` → returns an Express app. `options.staticDir` (optional) enables serving a built frontend. Exported from `server/app.js`.
- Produces: `GET /api/health` → `{ ok: true }`, unauthenticated.

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "rs-web-server",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "better-sqlite3": "^11.3.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "vitest": "^2.1.1",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd server && npm install`

- [ ] **Step 3: Create `server/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Create `server/db.js`**

```js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

function createDb(dbPath = DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

module.exports = { createDb, DB_PATH };
```

- [ ] **Step 5: Write the failing test**

```js
// server/__tests__/health.test.js
const request = require('supertest');
const { createApp } = require('../app');
const { createDb } = require('../db');

describe('health check', () => {
  it('responds ok on GET /api/health', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd server && npx vitest run __tests__/health.test.js`
Expected: FAIL — `../app` module not found.

- [ ] **Step 7: Create `server/app.js`**

```js
const express = require('express');
const session = require('express-session');
const path = require('path');

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

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(options.staticDir, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd server && npx vitest run __tests__/health.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add server/package.json server/schema.sql server/db.js server/app.js server/__tests__/health.test.js
git commit -m "feat: scaffold backend with SQLite and health check"
```

---

### Task 2: Auth — seeded accounts, login/logout/me

**Files:**
- Create: `server/seed.js`
- Create: `server/auth.js`
- Modify: `server/app.js` (mount auth router)
- Test: `server/__tests__/auth.test.js`

**Interfaces:**
- Consumes: `createDb`, `createApp` from Task 1.
- Produces: `seedUsers(db)` from `server/seed.js` — reads `USER1_USERNAME`, `USER1_PASSWORD`, `USER1_DISPLAY_NAME`, `USER2_USERNAME`, `USER2_PASSWORD`, `USER2_DISPLAY_NAME` from `process.env`.
- Produces: `createAuthRouter(db)` and `requireAuth(req, res, next)` from `server/auth.js`.
- Produces routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

- [ ] **Step 1: Create `server/seed.js`**

```js
const bcrypt = require('bcryptjs');

function seedUsers(db) {
  const users = [
    {
      username: process.env.USER1_USERNAME,
      password: process.env.USER1_PASSWORD,
      displayName: process.env.USER1_DISPLAY_NAME || process.env.USER1_USERNAME,
    },
    {
      username: process.env.USER2_USERNAME,
      password: process.env.USER2_PASSWORD,
      displayName: process.env.USER2_DISPLAY_NAME || process.env.USER2_USERNAME,
    },
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  );

  for (const u of users) {
    if (!u.username || !u.password) continue;
    const hash = bcrypt.hashSync(u.password, 10);
    insert.run(u.username, hash, u.displayName);
  }
}

module.exports = { seedUsers };
```

- [ ] **Step 2: Write the failing test**

```js
// server/__tests__/auth.test.js
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

describe('auth', () => {
  it('logs in with correct credentials', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ryan', password: 'testpass' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('ryan');
  });

  it('rejects an incorrect password', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ryan', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown username', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'testpass' });
    expect(res.status).toBe(401);
  });

  it('reports not logged in on /me without a session', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user on /me after login', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'ryan', password: 'testpass' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Ryan');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run __tests__/auth.test.js`
Expected: FAIL — 404s, `../auth` not mounted yet.

- [ ] **Step 4: Create `server/auth.js`**

```js
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
```

- [ ] **Step 5: Modify `server/app.js` to mount the auth router**

Add near the top: `const { createAuthRouter } = require('./auth');`

Add after the health check route:

```js
  app.use('/api/auth', createAuthRouter(db));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run __tests__/auth.test.js`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add server/seed.js server/auth.js server/app.js server/__tests__/auth.test.js
git commit -m "feat: add seeded two-user auth (login/logout/me)"
```

---

### Task 3: Events API

**Files:**
- Create: `server/routes/events.js`
- Modify: `server/app.js` (mount events router behind `requireAuth`)
- Test: `server/__tests__/events.test.js`

**Interfaces:**
- Consumes: `requireAuth` from `server/auth.js` (Task 2), `req.session.userId` set on login.
- Produces: `createEventsRouter(db)` from `server/routes/events.js`, mounted at `/api/events`.
- Routes: `GET /api/events`, `POST /api/events`, `PUT /api/events/:id`, `DELETE /api/events/:id` — all require an authenticated session.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run __tests__/events.test.js`
Expected: FAIL — 404s, no events router mounted.

- [ ] **Step 3: Create `server/routes/events.js`**

```js
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
```

- [ ] **Step 4: Modify `server/app.js` to mount the events router**

Add near the top: `const { createEventsRouter } = require('./routes/events');`

Add after the auth router mount:

```js
  app.use('/api/events', requireAuth, createEventsRouter(db));
```

This requires `requireAuth` to be imported in `app.js`: change the auth import line to
`const { createAuthRouter, requireAuth } = require('./auth');`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run __tests__/events.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add server/routes/events.js server/app.js server/__tests__/events.test.js
git commit -m "feat: add events CRUD API"
```

---

### Task 4: Notes API

**Files:**
- Create: `server/routes/notes.js`
- Modify: `server/app.js` (mount notes router behind `requireAuth`)
- Test: `server/__tests__/notes.test.js`

**Interfaces:**
- Consumes: `requireAuth` from `server/auth.js`, `req.session.userId` (Task 2).
- Produces: `createNotesRouter(db)` from `server/routes/notes.js`, mounted at `/api/notes`.
- Routes: `GET /api/notes` (each note includes `display_name` via join), `POST /api/notes`, `DELETE /api/notes/:id` (403 if not the author).

- [ ] **Step 1: Write the failing test**

```js
// server/__tests__/notes.test.js
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
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ).run('sam', hash, 'Sam');
  return db;
}

async function loginAgent(app, username) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'testpass' });
  return agent;
}

describe('notes API', () => {
  it('creates and lists a note with the author display name', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');

    const createRes = await agent.post('/api/notes').send({ message: 'Miss you' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.display_name).toBe('Ryan');

    const listRes = await agent.get('/api/notes');
    expect(listRes.body).toHaveLength(1);
  });

  it('rejects an empty message', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const res = await agent.post('/api/notes').send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  it('lets a user delete their own note', async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const agent = await loginAgent(app, 'ryan');
    const createRes = await agent.post('/api/notes').send({ message: 'Miss you' });

    const deleteRes = await agent.delete(`/api/notes/${createRes.body.id}`);
    expect(deleteRes.status).toBe(200);
  });

  it("prevents deleting someone else's note", async () => {
    const db = setupTestDb();
    const app = createApp(db);
    const ryanAgent = await loginAgent(app, 'ryan');
    const samAgent = await loginAgent(app, 'sam');

    const createRes = await ryanAgent.post('/api/notes').send({ message: 'Miss you' });
    const deleteRes = await samAgent.delete(`/api/notes/${createRes.body.id}`);
    expect(deleteRes.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run __tests__/notes.test.js`
Expected: FAIL — 404s, no notes router mounted.

- [ ] **Step 3: Create `server/routes/notes.js`**

```js
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
```

- [ ] **Step 4: Modify `server/app.js` to mount the notes router**

Add near the top: `const { createNotesRouter } = require('./routes/notes');`

Add after the events router mount:

```js
  app.use('/api/notes', requireAuth, createNotesRouter(db));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run __tests__/notes.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full backend test suite**

Run: `cd server && npx vitest run`
Expected: All tests across health/auth/events/notes PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes/notes.js server/app.js server/__tests__/notes.test.js
git commit -m "feat: add notes API with author-only delete"
```

---

### Task 5: Server entrypoint (real listener, static frontend serving)

**Files:**
- Create: `server/index.js`
- Create: `.env.example` (repo root)
- Create: `.gitignore` (repo root)

**Interfaces:**
- Consumes: `createDb` (Task 1), `seedUsers` (Task 2), `createApp` (Task 1, mounted routers from Tasks 2-4).
- Produces: a runnable process listening on `process.env.PORT || 3000`, serving the frontend build from `client/dist` once Task 9 produces it.

This file is a wiring script (creates real side effects — opens a real DB file, starts a real listener), so it's verified manually rather than with an automated test.

- [ ] **Step 1: Create `server/index.js`**

```js
const path = require('path');
const { createDb } = require('./db');
const { seedUsers } = require('./seed');
const { createApp } = require('./app');

const db = createDb();
seedUsers(db);

const app = createApp(db, { staticDir: path.join(__dirname, '..', 'client', 'dist') });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

- [ ] **Step 2: Create `.env.example` at the repo root**

```
SESSION_SECRET=change-me-to-a-long-random-string
USER1_USERNAME=ryan
USER1_PASSWORD=change-me
USER1_DISPLAY_NAME=Ryan
USER2_USERNAME=partner
USER2_PASSWORD=change-me
USER2_DISPLAY_NAME=Partner
TUNNEL_TOKEN=get-this-from-cloudflare-dashboard
```

- [ ] **Step 3: Create `.gitignore` at the repo root**

```
node_modules/
data/
.env
client/dist/
backups/
```

- [ ] **Step 4: Manually verify the server starts and seeds accounts**

Run:
```bash
cp .env.example .env
# edit .env with real values, then:
cd server
export $(cat ../.env | xargs)   # or set the vars manually on Windows PowerShell
node index.js
```
In another terminal: `curl http://localhost:3000/api/health`
Expected: `{"ok":true}`. Then `curl -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"username":"ryan","password":"<your USER1_PASSWORD>"}'` returns 200 with the display name. Stop the server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add server/index.js .env.example .gitignore
git commit -m "feat: add server entrypoint and env template"
```

---

### Task 6: Frontend scaffold — Vite React app, api client, login page

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.js`
- Create: `client/index.html`
- Create: `client/src/main.jsx`
- Create: `client/src/api.js`
- Create: `client/src/App.jsx`
- Create: `client/src/pages/Login.jsx`
- Create: `client/src/index.css`

**Interfaces:**
- Consumes: backend routes from Tasks 2-4 (`/api/auth/*`, `/api/events`, `/api/notes`) via `client/src/api.js`.
- Produces: `api` object from `client/src/api.js` with methods: `login(username, password)`, `logout()`, `me()`, `getEvents()`, `createEvent(event)`, `updateEvent(id, event)`, `deleteEvent(id)`, `getNotes()`, `createNote(message)`, `deleteNote(id)`. Later tasks (7, 8) call these methods directly.
- Produces: `setUnauthorizedHandler(fn)` from `client/src/api.js` — registers a callback fired whenever any API call gets a 401, so an expired session anywhere in the app (not just on initial load) sends the user back to the login screen (spec: Error handling, "session expiry → redirect to login page").
- Produces: `<Login onLogin={(user) => void} />` component.

This task is UI wiring with no meaningful pure logic to unit test yet (Tasks 7 and 8 add the testable logic). It's verified manually against the running backend from Task 5.

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "rs-web-client",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "vite": "^5.4.6",
    "@vitejs/plugin-react": "^4.3.1",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd client && npm install`

- [ ] **Step 3: Create `client/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 4: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>R&amp;S</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `client/src/api.js`**

```js
const BASE = '/api';

let unauthorizedHandler = () => {};

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    unauthorizedHandler();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  getEvents: () => request('/events'),
  createEvent: (event) => request('/events', { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id, event) => request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),
  getNotes: () => request('/notes'),
  createNote: (message) => request('/notes', { method: 'POST', body: JSON.stringify({ message }) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 6: Create `client/src/pages/Login.jsx`**

```jsx
import { useState } from 'react';
import { api } from '../api';

export function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await api.login(username, password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <h1>R&amp;S</h1>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Log in</button>
    </form>
  );
}
```

- [ ] **Step 7: Create `client/src/App.jsx`** (calendar/notes pages are stubbed until Tasks 7-8)

```jsx
import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { api, setUnauthorizedHandler } from './api';

export function App() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.me().then(setUser).catch(() => {}).finally(() => setChecked(true));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (!checked) return null;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header>
        <span>Hi, {user.displayName}</span>
        <button onClick={handleLogout}>Log out</button>
      </header>
      <p>Calendar and notes coming up next.</p>
    </div>
  );
}
```

- [ ] **Step 8: Create `client/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Create `client/src/index.css`**

```css
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  background: #fdf6f8;
  color: #2a2a2a;
}

.login-form, .app {
  max-width: 480px;
  margin: 40px auto;
  padding: 24px;
}

.login-form input, .event-form input, .event-form textarea, .notes-page textarea {
  display: block;
  width: 100%;
  margin-bottom: 12px;
  padding: 8px;
  box-sizing: border-box;
}

.error {
  color: #b00020;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

- [ ] **Step 10: Manually verify login flow end-to-end**

With the backend from Task 5 running (`cd server && node index.js`), run `cd client && npm run dev` and open the printed local URL. Confirm the login form appears, submitting valid credentials shows "Hi, `<name>`" with a logout button, and invalid credentials show an inline error.

- [ ] **Step 11: Commit**

```bash
git add client/package.json client/vite.config.js client/index.html client/src
git commit -m "feat: scaffold React frontend with login flow"
```

---

### Task 7: Calendar feature

**Files:**
- Create: `client/src/components/monthGrid.js`
- Create: `client/src/components/MonthGrid.jsx`
- Create: `client/src/pages/Calendar.jsx`
- Modify: `client/src/App.jsx` (add tab navigation, render `CalendarPage`)
- Test: `client/src/__tests__/monthGrid.test.js`

**Interfaces:**
- Consumes: `api.getEvents`, `api.createEvent`, `api.deleteEvent` from `client/src/api.js` (Task 6).
- Produces: `getMonthGridDays(year, month)` and `toDateKey(date)` from `monthGrid.js` — pure functions, no DOM dependency.
- Produces: `<MonthGrid year month events onDayClick />` and `<CalendarPage />` components.

- [ ] **Step 1: Write the failing test**

```js
// client/src/__tests__/monthGrid.test.js
import { describe, it, expect } from 'vitest';
import { getMonthGridDays, toDateKey } from '../components/monthGrid';

describe('getMonthGridDays', () => {
  it('pads the grid to a multiple of 7', () => {
    const days = getMonthGridDays(2026, 9); // October 2026 (0-indexed)
    expect(days.length % 7).toBe(0);
  });

  it('includes every real day of the month exactly once', () => {
    const days = getMonthGridDays(2026, 9);
    const realDays = days.filter(Boolean);
    expect(realDays).toHaveLength(31); // October has 31 days
  });
});

describe('toDateKey', () => {
  it('formats a date as YYYY-MM-DD with zero-padding', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/monthGrid.test.js`
Expected: FAIL — `../components/monthGrid` not found.

- [ ] **Step 3: Create `client/src/components/monthGrid.js`**

```js
export function getMonthGridDays(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    days.push(null);
  }
  return days;
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/monthGrid.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Create `client/src/components/MonthGrid.jsx`**

```jsx
import { getMonthGridDays, toDateKey } from './monthGrid';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthGrid({ year, month, events, onDayClick }) {
  const days = getMonthGridDays(year, month);
  const eventsByDate = {};
  for (const event of events) {
    if (!eventsByDate[event.date]) eventsByDate[event.date] = [];
    eventsByDate[event.date].push(event);
  }

  return (
    <div className="month-grid">
      <div className="month-grid-header">
        {WEEKDAYS.map((day) => (
          <div key={day} className="month-grid-weekday">{day}</div>
        ))}
      </div>
      <div className="month-grid-body">
        {days.map((date, i) => {
          if (!date) return <div key={i} className="month-grid-cell empty" />;
          const key = toDateKey(date);
          const dayEvents = eventsByDate[key] || [];
          return (
            <div key={i} className="month-grid-cell" onClick={() => onDayClick(key)}>
              <div className="month-grid-date">{date.getDate()}</div>
              {dayEvents.map((event) => (
                <div key={event.id} className="month-grid-event">{event.title}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `client/src/pages/Calendar.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { MonthGrid } from '../components/MonthGrid';
import { api } from '../api';

export function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      const data = await api.getEvents();
      setEvents(data);
    } catch (err) {
      setError(err.message);
    }
  }

  function changeMonth(delta) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear -= 1; }
    if (newMonth > 11) { newMonth = 0; newYear += 1; }
    setMonth(newMonth);
    setYear(newYear);
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createEvent({ title, description, date: selectedDate });
      setTitle('');
      setDescription('');
      setSelectedDate(null);
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteEvent(id) {
    await api.deleteEvent(id);
    loadEvents();
  }

  return (
    <div className="calendar-page">
      <div className="calendar-controls">
        <button onClick={() => changeMonth(-1)}>&lt;</button>
        <span>{year}-{String(month + 1).padStart(2, '0')}</span>
        <button onClick={() => changeMonth(1)}>&gt;</button>
      </div>
      <MonthGrid year={year} month={month} events={events} onDayClick={setSelectedDate} />
      {selectedDate && (
        <form className="event-form" onSubmit={handleAddEvent}>
          <h2>Add event on {selectedDate}</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">Add</button>
          <button type="button" onClick={() => setSelectedDate(null)}>Cancel</button>
        </form>
      )}
      <ul className="event-list">
        {events
          .filter((e) => e.date === selectedDate)
          .map((event) => (
            <li key={event.id}>
              {event.title}
              <button onClick={() => handleDeleteEvent(event.id)}>Delete</button>
            </li>
          ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Modify `client/src/App.jsx` to add tab navigation and render the calendar**

Replace the file contents with:

```jsx
import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { CalendarPage } from './pages/Calendar';
import { api, setUnauthorizedHandler } from './api';

export function App() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState('calendar');

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.me().then(setUser).catch(() => {}).finally(() => setChecked(true));
  }, []);

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (!checked) return null;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header>
        <span>Hi, {user.displayName}</span>
        <nav>
          <button onClick={() => setTab('calendar')}>Calendar</button>
          <button onClick={() => setTab('notes')}>Notes</button>
        </nav>
        <button onClick={handleLogout}>Log out</button>
      </header>
      {tab === 'calendar' ? <CalendarPage /> : <p>Notes coming up next.</p>}
    </div>
  );
}
```

- [ ] **Step 8: Manually verify the calendar**

With backend + `npm run dev` running, log in, click a day, add an event with a title, confirm it appears on the grid, then delete it and confirm it disappears. Click the `<`/`>` buttons and confirm the month changes.

- [ ] **Step 9: Commit**

```bash
git add client/src/components client/src/pages/Calendar.jsx client/src/App.jsx client/src/__tests__/monthGrid.test.js
git commit -m "feat: add calendar view with month grid and event CRUD"
```

---

### Task 8: Notes feature

**Files:**
- Create: `client/src/pages/notesLogic.js`
- Create: `client/src/pages/Notes.jsx`
- Modify: `client/src/App.jsx` (render `NotesPage` in the notes tab)
- Test: `client/src/__tests__/notesLogic.test.js`

**Interfaces:**
- Consumes: `api.getNotes`, `api.createNote`, `api.deleteNote` from `client/src/api.js` (Task 6).
- Produces: `canDeleteNote(note, currentUserId)` from `notesLogic.js` — pure function, `note.created_by === currentUserId`.
- Produces: `<NotesPage currentUserId />` component.

- [ ] **Step 1: Write the failing test**

```js
// client/src/__tests__/notesLogic.test.js
import { describe, it, expect } from 'vitest';
import { canDeleteNote } from '../pages/notesLogic';

describe('canDeleteNote', () => {
  it('returns true when the note belongs to the current user', () => {
    expect(canDeleteNote({ created_by: 1 }, 1)).toBe(true);
  });

  it('returns false when the note belongs to someone else', () => {
    expect(canDeleteNote({ created_by: 2 }, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/notesLogic.test.js`
Expected: FAIL — `../pages/notesLogic` not found.

- [ ] **Step 3: Create `client/src/pages/notesLogic.js`**

```js
export function canDeleteNote(note, currentUserId) {
  return note.created_by === currentUserId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/notesLogic.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Create `client/src/pages/Notes.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import { canDeleteNote } from './notesLogic';

export function NotesPage({ currentUserId }) {
  const [notes, setNotes] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    try {
      const data = await api.getNotes();
      setNotes(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createNote(message);
      setMessage('');
      loadNotes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    await api.deleteNote(id);
    loadNotes();
  }

  return (
    <div className="notes-page">
      <form onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Leave a note..."
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">Post</button>
      </form>
      <ul className="notes-list">
        {notes.map((note) => (
          <li key={note.id}>
            <strong>{note.display_name}</strong>: {note.message}
            {canDeleteNote(note, currentUserId) && (
              <button onClick={() => handleDelete(note.id)}>Delete</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Modify `client/src/App.jsx` to render `NotesPage`**

Add the import: `import { NotesPage } from './pages/Notes';`

Change the render line from:
```jsx
      {tab === 'calendar' ? <CalendarPage /> : <p>Notes coming up next.</p>}
```
to:
```jsx
      {tab === 'calendar' ? <CalendarPage /> : <NotesPage currentUserId={user.id} />}
```

- [ ] **Step 7: Manually verify notes end-to-end**

Log in as one account, post a note, confirm it appears with your display name and a delete button. Log out, log in as the other seeded account, confirm the note appears without a delete button, post a second note, confirm both notes are visible to both accounts.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/notesLogic.js client/src/pages/Notes.jsx client/src/App.jsx client/src/__tests__/notesLogic.test.js
git commit -m "feat: add notes feed with author-only delete"
```

---

### Task 9: Docker packaging

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `server/index.js` (Task 5) as the container's `CMD`; expects `client/dist` to exist at `/app/client/dist` relative to the server's `__dirname/..`.
- Produces: a runnable image exposing port 3000, and a `docker-compose.yml` defining the `app` and `cloudflared` services referenced in `docs/DEPLOYMENT.md` (Task 10).

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
data
.env
backups
client/dist
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
# Build the frontend
FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Server runtime
FROM node:20-bookworm-slim AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    environment:
      - PORT=3000
      - SESSION_SECRET=${SESSION_SECRET}
      - USER1_USERNAME=${USER1_USERNAME}
      - USER1_PASSWORD=${USER1_PASSWORD}
      - USER1_DISPLAY_NAME=${USER1_DISPLAY_NAME}
      - USER2_USERNAME=${USER2_USERNAME}
      - USER2_PASSWORD=${USER2_PASSWORD}
      - USER2_DISPLAY_NAME=${USER2_DISPLAY_NAME}
      - DB_PATH=/data/app.db
    volumes:
      - ./data:/data

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
```

- [ ] **Step 4: Build the image locally to verify it compiles**

Run: `docker build -t rs-web .`
Expected: Build completes successfully with no errors (this validates the Dockerfile syntax and dependency installs; it does not require a real `.env` yet).

- [ ] **Step 5: Verify the container serves the app**

Run:
```bash
docker run --rm -p 3000:3000 \
  -e SESSION_SECRET=test -e USER1_USERNAME=ryan -e USER1_PASSWORD=testpass \
  -e USER2_USERNAME=sam -e USER2_PASSWORD=testpass2 \
  rs-web
```
In another terminal: `curl http://localhost:3000/api/health` → expect `{"ok":true}`. Then open `http://localhost:3000` in a browser and confirm the login page loads (this proves the built frontend is being served). Stop the container with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add Docker packaging for app and cloudflared"
```

---

### Task 10: Cloudflare Tunnel + Pi deployment, backups

**Files:**
- Create: `scripts/backup.sh`
- Create: `docs/DEPLOYMENT.md`

**Interfaces:**
- Consumes: `docker-compose.yml` (Task 9) and `.env.example` (Task 5) as the artifacts being deployed.
- Produces: a documented, repeatable deployment procedure and a cron-driven backup script with no required arguments (resolves paths relative to its own location).

- [ ] **Step 1: Create `scripts/backup.sh`**

```bash
#!/bin/sh
set -e

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
BACKUP_DIR="$DATA_DIR/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d)
cp "$DATA_DIR/app.db" "$BACKUP_DIR/app-$TIMESTAMP.db"

find "$BACKUP_DIR" -name 'app-*.db' -mtime +14 -delete
```

- [ ] **Step 2: Make it executable and verify it runs**

Run: `chmod +x scripts/backup.sh`

Manually verify (after Task 9's local Docker run has created `./data/app.db`, or after seeding a local SQLite file at `data/app.db`): run `./scripts/backup.sh` and confirm a file named `data/backups/app-<today's date>.db` is created.

- [ ] **Step 3: Create `docs/DEPLOYMENT.md`**

```markdown
# Deploying to the Raspberry Pi

## Prerequisites

- Raspberry Pi 4 or 5 running Raspberry Pi OS, on your home network.
- A domain name you control, added to a Cloudflare account (free tier is fine).
- Docker and Docker Compose installed on the Pi:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  sudo apt-get install -y docker-compose-plugin
  ```
  Log out and back in for the group change to take effect.

## 1. Get the code onto the Pi

```bash
git clone <your-repo-url> rs-web
cd rs-web
```

## 2. Create the Cloudflare Tunnel

On any machine with `cloudflared` installed (or via the Cloudflare dashboard):

1. Log into Cloudflare: `cloudflared tunnel login`
2. Create the tunnel: `cloudflared tunnel create rs-web`
3. Route your subdomain to it: `cloudflared tunnel route dns rs-web us.yourdomain.com`
4. In the Cloudflare Zero Trust dashboard, under Access > Tunnels, find the
   tunnel and copy its **token** (this is what `cloudflared` running in
   Docker will use to authenticate — no local config file needed).

## 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set:
- `SESSION_SECRET` — a long random string (e.g. `openssl rand -hex 32`)
- `USER1_USERNAME` / `USER1_PASSWORD` / `USER1_DISPLAY_NAME`
- `USER2_USERNAME` / `USER2_PASSWORD` / `USER2_DISPLAY_NAME`
- `TUNNEL_TOKEN` — the token copied in step 2

`.env` is gitignored — it never leaves the Pi.

## 4. Start the app

```bash
docker compose up -d --build
```

Check both containers are running: `docker compose ps`. Check logs if
anything looks wrong: `docker compose logs -f`.

Visit `https://us.yourdomain.com` (your chosen subdomain) from any device
and confirm the login page loads and both seeded accounts can log in.

## 5. Set up daily backups

Add a cron entry to run the backup script daily at 3am:

```bash
crontab -e
```

Add this line (adjust the path to wherever you cloned the repo):

```
0 3 * * * /home/pi/rs-web/scripts/backup.sh
```

This keeps the last 14 daily copies of the SQLite database in
`data/backups/`, pruning older ones automatically.

## 6. Updating after code changes

```bash
cd rs-web
git pull
docker compose up -d --build
```

The SQLite file in `./data` is untouched by rebuilds since it's a mounted
volume, not part of the image.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/backup.sh docs/DEPLOYMENT.md
git commit -m "docs: add Cloudflare Tunnel deployment guide and backup script"
```

---

## Final Verification

- [ ] Run the full backend suite: `cd server && npx vitest run` — all pass.
- [ ] Run the full frontend suite: `cd client && npx vitest run` — all pass.
- [ ] Run through the manual end-to-end check from the spec: log in as both accounts, add/edit/delete an event, post/delete a note, restart the Docker container (`docker compose restart app`) and confirm all data is still present.
- [ ] Confirm session-expiry handling: while logged in, delete the session cookie via browser dev tools (Application > Cookies), then trigger any action that calls the API (e.g. click a calendar day or reload). Confirm the app returns to the login screen rather than showing a broken/blank page.
