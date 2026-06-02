module.exports = (client) => {

  client.on("guildMemberAdd", async (member) => {

    try {

      await member.send(
`Welcome to the server.

Go to #verify and react there.`
      );

    } catch (err) {
      console.error("❌ Failed to send welcome DM to", member.user.tag, ":", err.message);
    }

  });

};
