const Database = require("better-sqlite3");
const db = new Database("camelbot.db");

// SAFE schema (fixes your previous "no such column: id")
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  letterboxd TEXT
)
`).run();

function saveUser(discordId, letterboxd) {
  db.prepare(`
    INSERT OR REPLACE INTO users (discord_id, letterboxd)
    VALUES (?, ?)
  `).run(discordId, letterboxd);
}

function getUser(discordId) {
  return db.prepare(`
    SELECT * FROM users WHERE discord_id = ?
  `).get(discordId);
}

module.exports = { saveUser, getUser };
