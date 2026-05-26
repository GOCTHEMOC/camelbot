const db = require("../database");

function isValidLetterboxd(url) {
  return /^https:\/\/letterboxd\.com\/[A-Za-z0-9_-]+\/$/.test(url);
}

async function handleLetterboxdDM(client, message) {
  const url = message.content.trim();

  if (!isValidLetterboxd(url)) {
    return message.reply("❌ Invalid format.\nUse: https://letterboxd.com/username/");
  }

  // duplicate check
  const exists = db.prepare(
    "SELECT * FROM users WHERE letterboxd = ?"
  ).get(url);

  if (exists) {
    return message.reply("❌ This Letterboxd is already linked.");
  }

  // save
  db.prepare(
    "INSERT INTO users (discord_id, letterboxd) VALUES (?, ?)"
  ).run(message.author.id, url);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const member = await guild.members.fetch(message.author.id);

  // role
  const role = guild.roles.cache.find(r => r.name === "Letterboxd");
  if (role) await member.roles.add(role);

  // DM success
  await message.reply("✅ Letterboxd linked successfully!");

  // 🔥 LOG CHANNEL (your requested feature)
  const log = guild.channels.cache.find(c => c.name === "letterboxd");

  if (log) {
    log.send(`🎬 ${member.user.tag} linked Letterboxd: ${url}`);
  }
}

module.exports = {
  handleLetterboxdDM
};
