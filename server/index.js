const path = require('path');
const { createDb } = require('./db');
const { seedUsers } = require('./seed');
const { createApp } = require('./app');

if (process.env.NODE_ENV === 'production') {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret === 'dev-secret' || secret === 'change-me-to-a-long-random-string') {
    throw new Error(
      'SESSION_SECRET must be set to a real random value in production (see .env.example)'
    );
  }
}

const db = createDb();
seedUsers(db);

const app = createApp(db, { staticDir: path.join(__dirname, '..', 'client', 'dist') });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
