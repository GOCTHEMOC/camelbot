const Database = require("better-sqlite3");

const db = new Database("camelbot.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  letterboxd TEXT
)
`).run();

module.exports = db;
