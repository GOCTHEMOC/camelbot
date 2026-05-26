const { handleLetterboxdDM } =
require("../services/letterboxd");

module.exports = (client) => {

  client.on("messageReactionAdd",
  async (reaction, user) => {

    if (user.bot) return;

    try {

      if (reaction.partial) await reaction.fetch();

      if (reaction.message.partial)
        await reaction.message.fetch();

      if (
        reaction.message.id !==
        client.verifyMessageId
      ) return;

      const guild = reaction.message.guild;

      const member =
        await guild.members.fetch(user.id);

      if (reaction.emoji.name === "👍") {

        const role =
          guild.roles.cache.find(
            r => r.name === "Verified"
          );

        if (role) {
          await member.roles.add(role);
        }
      }

      if (reaction.emoji.name === "🎬") {

        await user.send(
`Send your Letterboxd link:

https://letterboxd.com/username/`
        );
      }

    } catch (err) {
      console.log(err);
    }

  });

  client.on("messageCreate",
  async (message) => {

    if (message.author.bot) return;

    if (message.guild) return;

    await handleLetterboxdDM(client, message);

  });

};
