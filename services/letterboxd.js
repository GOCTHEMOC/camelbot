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

  try {
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

    if (!guild) {
      console.error("❌ No guild found in cache");
      return message.reply("❌ Bot configuration error. Please contact admin.");
    }

    const member =
      await guild.members.fetch(message.author.id).catch(err => {
        console.error("❌ Failed to fetch member:", err);
        return null;
      });

    if (!member) {
      return message.reply("❌ Could not find you in the server.");
    }

    const role =
      guild.roles.cache.find(r => r.name === "Letterboxd");

    if (role) {
      await member.roles.add(role).catch(err => {
        console.error("❌ Failed to add Letterboxd role:", err);
      });
    } else {
      console.warn("⚠️  Letterboxd role not found in guild");
    }

    const channel =
      guild.channels.cache.find(c => c.name === "letterboxd");

    if (channel) {
      await channel.send(
        `🎬 ${member.user.tag} linked Letterboxd:\n${url}`
      ).catch(err => {
        console.error("❌ Failed to send announcement:", err);
      });
    } else {
      console.warn("⚠️  Letterboxd channel not found in guild");
    }

    return message.reply("✅ Thanks! Letterboxd linked.");
  } catch (err) {
    console.error("❌ Letterboxd handling error:", err);
    return message.reply("❌ An error occurred. Please try again.");
  }
}

module.exports = {
  handleLetterboxdDM
};
