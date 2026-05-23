require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { saveUser, getUser } = require("./database");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// store verification message ID
let verifyMessageId = null;

// SEND VERIFY MESSAGE ON START
client.once("ready", async () => {
  console.log(`Camelbot is online as ${client.user.tag}`);

  const channel = client.channels.cache.find(c => c.name === "verify");

  if (!channel) return console.log("No verify channel found");

  const msg = await channel.send(
`Hello! Welcome to Gohith's movie server. To verify yourself, please react with a 👍 emoji to this message.

If you have Letterboxd and wish to connect your Letterboxd profile to the server, please react with the 🎬 emoji to this message.`
  );

  verifyMessageId = msg.id;
});

// REACTION HANDLER
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.message.id !== verifyMessageId) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);

  // 👍 VERIFY ROLE
  if (reaction.emoji.name === "👍") {
    const role = guild.roles.cache.find(r => r.name === "wba verified");
    if (role) member.roles.add(role);
  }

  // 🎬 LETTERBOXD FLOW
  if (reaction.emoji.name === "🎬") {
    try {
      await user.send("Send your Letterboxd profile link:");

    } catch (err) {
      console.log("Cannot DM user");
    }
  }
});

// DM HANDLER (LETTERBOXD INPUT + EDIT)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.type !== 1) return; // DM only

  if (!message.content.startsWith("http")) return;

  const old = getUser(message.author.id);

  saveUser(message.author.id, message.content);

  const channel = client.channels.cache.find(c => c.name === "letterboxd");

  if (old) {
    channel.send(`♻️ <@${message.author.id}> updated Letterboxd: ${message.content}`);
  } else {
    channel.send(`<@${message.author.id}> linked Letterboxd: ${message.content}`);
  }

  message.reply("Saved your Letterboxd profile.");
});

client.login(process.env.TOKEN);
