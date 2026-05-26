const db = require("../database");

module.exports = (client) => {

  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      // 🔴 FIX: must match BOTH channel + message
      if (!client.verifyMessageId) return;
      if (reaction.message.id !== client.verifyMessageId) return;

      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);

      // ================= 👍 VERIFY ROLE =================
      if (reaction.emoji.name === "👍") {
        const role = guild.roles.cache.find(r => r.name === "Letterboxd");
        if (role) await member.roles.add(role);

        try {
          await user.send("📩 Now send your Letterboxd link:");
        } catch {}
      }

      // ================= 🎬 PROMPT =================
      if (reaction.emoji.name === "🎬") {
        try {
          await user.send("Send your Letterboxd profile link:");
        } catch {}
      }

    } catch (err) {
      console.log("Reaction error:", err);
    }
  });

  // ================= DM HANDLER (FIXED + COMPLETE) =================
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.guild) return;

    const url = message.content.trim();

    const regex = /^https:\/\/letterboxd\.com\/[A-Za-z0-9_-]+\/$/;
    if (!regex.test(url)) {
      return message.reply("❌ Invalid format. Use https://letterboxd.com/username/");
    }

    const exists = db.prepare(
      "SELECT * FROM users WHERE letterboxd = ?"
    ).get(url);

    if (exists) {
      return message.reply("❌ This account is already linked.");
    }

    db.prepare(
      "INSERT INTO users (discord_id, letterboxd) VALUES (?, ?)"
    ).run(message.author.id, url);

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const member = await guild.members.fetch(message.author.id);

    const role = guild.roles.cache.find(r => r.name === "Letterboxd");
    if (role) await member.roles.add(role);

    return message.reply("✅ Letterboxd verified successfully!");
  });

};
