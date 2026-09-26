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
