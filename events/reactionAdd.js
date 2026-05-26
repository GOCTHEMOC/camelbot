module.exports = (client) => {

client.on("messageReactionAdd", async (reaction, user) => {

  if (user.bot) return;

  // ✅ FIX PARTIALS
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const message = reaction.message;

  // ✅ ONLY VERIFY MESSAGE
  if (message.id !== client.verifyMessageId) return;

  const guild = message.guild;

  if (!guild) return;

  const member = await guild.members.fetch(user.id)
    .catch(() => null);

  if (!member) return;

  // =========================
  // 👍 VERIFIED ROLE
  // =========================
  if (reaction.emoji.name === "👍") {

    const verifiedRole = guild.roles.cache.get(
      process.env.VERIFIED_ROLE_ID
    );

    if (!verifiedRole) return;

    await member.roles.add(verifiedRole)
      .catch(console.error);

    return;
  }

  // =========================
  // 🎬 LETTERBOXD FLOW
  // =========================
  if (reaction.emoji.name === "🎬") {

    try {

      await user.send(
`🎬 Send your Letterboxd profile link.

Format:
https://letterboxd.com/username/`
      );

    } catch (err) {
      console.error(err);
    }
  }

});
};
