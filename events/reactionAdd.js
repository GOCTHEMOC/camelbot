const db = require("../database");

module.exports = (client) => {

  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      // MUST MATCH verify message
      if (!client.verifyMessageId) return;
      if (reaction.message.id !== client.verifyMessageId) return;

      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);

      // ================= 👍 VERIFY ROLE =================
      if (reaction.emoji.name === "👍") {
        const role = guild.roles.cache.find(r => r.name === "Letterboxd");
        if (role) await member.roles.add(role);

        try {
          await user.send("📩 Send your Letterboxd link:");
        } catch {}
      }

      // ================= 🎬 PROMPT =================
      if (reaction.emoji.name === "🎬") {
        try {
          await user.send("Send your Letterboxd profile URL:");
        } catch {}
      }

    } catch (err) {
      console.log("Reaction error:", err);
    }
  });

  // ================= DM HANDLER =================
 const { handleLetterboxdDM } = require("../services/letterboxd");

module.exports = (client) => {

  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      if (!client.verifyMessageId) return;
      if (reaction.message.id !== client.verifyMessageId) return;

      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);

      // 👍 ROLE + DM
      if (reaction.emoji.name === "👍") {
        const role = guild.roles.cache.find(r => r.name === "Letterboxd");
        if (role) await member.roles.add(role);

        try {
          await user.send("📩 Send your Letterboxd link:");
        } catch {}
      }

      // 🎬 DM PROMPT
      if (reaction.emoji.name === "🎬") {
        try {
          await user.send("Send your Letterboxd profile URL:");
        } catch {}
      }

    } catch (err) {
      console.log(err);
    }
  });

  // ================= DM FLOW =================
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.guild) return;

    await handleLetterboxdDM(client, message);
  });

};
