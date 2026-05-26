const fs = require("fs");

module.exports = async (client) => {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find(c => c.name === "verify");
  if (!channel) return;

  const msg = await channel.send(
    "👋 Welcome!\n\n" +
    "👍 = Verified role\n" +
    "🎬 = Link Letterboxd account"
  );

  await msg.react("👍");
  await msg.react("🎬");

  // 🔥 FIX: persist per-guild message ID
  client.verifyMessageId = msg.id;
  client.verifyChannelId = channel.id;
};
