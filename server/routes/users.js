const express = require('express');

function createUsersRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const users = db.prepare('SELECT id, display_name FROM users ORDER BY id').all();
    res.json(users);
  });

  return router;
}

module.exports = { createUsersRouter };
