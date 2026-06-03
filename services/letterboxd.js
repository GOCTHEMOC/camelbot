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

    // ✅ FIX #9: Use guild from message author's current server
    const guild = message.guild;

    if (!guild) {
      console.error("❌ No guild context found");
      return message.reply("❌ Bot configuration error. Please contact admin.");
    }

    const member = await guild.members.fetch(message.author.id).catch(err => {
      console.error("❌ Failed to fetch member:", err);
      return null;
    });

    if (!member) {
      return message.reply("❌ Could not find you in the server.");
    }

    // ✅ FIX #9: Use LETTERBOXD_ROLE_ID from environment instead of searching by name
    const roleId = process.env.LETTERBOXD_ROLE_ID;
    if (!roleId) {
      console.warn("⚠️  LETTERBOXD_ROLE_ID not configured in .env");
    } else {
      const role = guild.roles.cache.get(roleId);
      
      if (role) {
        await member.roles.add(role).catch(err => {
          console.error("❌ Failed to add Letterboxd role:", err);
        });
      } else {
        console.warn("⚠️  Letterboxd role not found in guild with ID:", roleId);
      }
    }

    // ✅ FIX #9: Use LETTERBOXD_CHANNEL_ID from environment instead of searching by name
    const channelId = process.env.LETTERBOXD_CHANNEL_ID;
    if (!channelId) {
      console.warn("⚠️  LETTERBOXD_CHANNEL_ID not configured in .env");
    } else {
      const channel = guild.channels.cache.get(channelId);

      if (channel) {
        await channel.send(
          `🎬 ${member.user.tag} linked Letterboxd:\n${url}`
        ).catch(err => {
          console.error("❌ Failed to send announcement:", err);
        });
      } else {
        console.warn("⚠️  Letterboxd channel not found in guild with ID:", channelId);
      }
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
