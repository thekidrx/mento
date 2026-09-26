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
