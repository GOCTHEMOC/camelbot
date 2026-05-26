const Database = require("better-sqlite3");
const db = new Database("camelbot.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  letterboxd TEXT
)
`).run();

function saveUser(id, link) {
  db.prepare(`
    INSERT OR REPLACE INTO users (discord_id, letterboxd)
    VALUES (?, ?)
  `).run(id, link);
}

function getUser(id) {
  return db.prepare(`
    SELECT * FROM users WHERE discord_id = ?
  `).get(id);
}

module.exports = { saveUser, getUser };
