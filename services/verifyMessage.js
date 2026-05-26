module.exports = async (client) => {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find(c => c.name === "verify");
  if (!channel) return;

  const msg = await channel.send(
    "👋 Welcome!\n\n" +
    "👍 = Verified role\n" +
    "🎬 = Letterboxd DM setup"
  );

  await msg.react("👍");
  await msg.react("🎬");

  client.verifyMessageId = msg.id;
};
