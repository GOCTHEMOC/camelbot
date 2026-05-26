const db = require("../database");

function isValidLetterboxd(url) {
  return /^https:\/\/letterboxd\.com\/[A-Za-z0-9_-]+\/$/.test(url);
}

async function handleLetterboxdDM(client, message) {

  const url = message.content.trim();

  if (!isValidLetterboxd(url)) {
    return message.reply(
      "❌ Invalid format.\nUse:\nhttps://letterboxd.com/username/"
    );
  }

  const exists = db.prepare(
    "SELECT * FROM users WHERE letterboxd = ?"
  ).get(url);

  if (exists) {
    return message.reply("❌ This Letterboxd is already linked.");
  }

  db.prepare(`
    INSERT OR REPLACE INTO users
    (discord_id, letterboxd)
    VALUES (?, ?)
  `).run(message.author.id, url);

  const guild = client.guilds.cache.first();

  const member =
    await guild.members.fetch(message.author.id);

  const role =
    guild.roles.cache.find(r => r.name === "Letterboxd");

  if (role) {
    await member.roles.add(role);
  }

  const channel =
    guild.channels.cache.find(c => c.name === "letterboxd");

  if (channel) {
    channel.send(
      `🎬 ${member.user.tag} linked Letterboxd:\n${url}`
    );
  }

  return message.reply("✅ Thanks! Letterboxd linked.");
}

module.exports = {
  handleLetterboxdDM
};
