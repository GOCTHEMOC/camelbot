module.exports = (client) => {
  client.on("guildMemberAdd", async (member) => {
    try {
      await member.send("👋 Go to #verify and react 👍 to get started.");
    } catch {}
  });
};
