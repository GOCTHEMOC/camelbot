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

// CONFIG (PUT REAL IDS IN .env)
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const LETTERBOXD_CHANNEL_ID = process.env.LETTERBOXD_CHANNEL_ID;
const VERIFIED_ROLE_NAME = "verified";

let verifyMessageId = null;
let welcomeSent = false;

/* ---------------- READY EVENT ---------------- */
client.once("ready", async () => {
  console.log(`Camelbot is online as ${client.user.tag}`);

  if (welcomeSent) return;
  welcomeSent = true;

  const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);

  const msg = await channel.send(
`Hello! Welcome to Gohith's movie server. To verify yourself, please react with a 👍 emoji to this message.

If you have Letterboxd and wish to connect your Letterboxd profile to the server, please react with the 🎬 emoji to this message.`
  );

  verifyMessageId = msg.id;
});

/* ---------------- REACTIONS ---------------- */
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (!reaction.message) return;

  if (reaction.message.id !== verifyMessageId) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);

  // VERIFY ROLE
  if (reaction.emoji.name === "👍") {
    const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
    if (role) await member.roles.add(role);
  }

  // LETTERBOXD DM TRIGGER
  if (reaction.emoji.name === "🎬") {
    await user.send("Send your Letterboxd profile link:");
  }
});

/* ---------------- DM HANDLER ---------------- */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.type !== 1) return; // DM only

  const content = message.content.trim();
  if (!content.startsWith("http")) return;

  const old = getUser(message.author.id);

  saveUser(message.author.id, content);

  const channel = await client.channels.fetch(LETTERBOXD_CHANNEL_ID);

  if (!channel) return console.log("Letterboxd channel missing");

  if (old) {
    await channel.send(`♻️ <@${message.author.id}> updated Letterboxd: ${content}`);
  } else {
    await channel.send(`<@${message.author.id}> linked Letterboxd: ${content}`);
  }

  await message.reply("Saved your Letterboxd profile.");
});

client.login(process.env.TOKEN);
