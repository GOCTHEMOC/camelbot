module.exports = async (client) => {
  const guild = client.guilds.cache.find(g =>
    g.channels.cache.some(c => c.name === "verify")
  );

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

  client.verifyMessageId = msg.id;
  client.verifyGuildId = guild.id;
};
