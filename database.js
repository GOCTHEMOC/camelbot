const Database = require("better-sqlite3");

// creates DB file (Railway-safe)
const db = new Database("letterboxd.db");

// create table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    letterboxd TEXT
  )
`).run();

// save or update user
function saveUser(discordId, letterboxd) {
  const stmt = db.prepare(`
    INSERT INTO users (id, letterboxd)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET letterboxd=excluded.letterboxd
  `);

  stmt.run(discordId, letterboxd);
}

// get user
function getUser(discordId) {
  return db.prepare(`
    SELECT * FROM users WHERE id = ?
  `).get(discordId);
}

module.exports = {
  saveUser,
  getUser
};
