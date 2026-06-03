module.exports = (client) => {

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content.toLowerCase();

  // ===========================
  // WOMEN RESPECT FILTER
  // ===========================
  const disrespectfulPhrases = [
    "i hate women",
    "we hate women",
    "i dont like women",
    "we dont like women",
    "i don't like women",
    "we don't like women",
    "women...",
    "ofc its a women",
    "ofc it is a women",
    "of course it is a women"
  ];

  for (const phrase of disrespectfulPhrases) {
    if (content.includes(phrase)) {
      try {
        await message.reply("HEY, we respect women around here 👎:freshman_fanatic: 👎:freshman_fanatic: 👎:freshman_fanatic: 👎:freshman_fanatic:");
      } catch (err) {
        console.error("❌ Failed to send women respect message:", err);
      }
      return;
    }
  }

});
};
