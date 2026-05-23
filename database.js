const Database = require("better-sqlite3");

const db = new Database("letterboxd.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  letterboxd TEXT
)
`).run();

function saveUser(id, letterboxd) {
  db.prepare(`
    INSERT INTO users (id, letterboxd)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET letterboxd=excluded.letterboxd
  `).run(id, letterboxd);
}

function getUser(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

module.exports = { saveUser, getUser };
