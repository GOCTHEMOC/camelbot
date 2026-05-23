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

// CONFIG
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const LETTERBOXD_CHANNEL_ID = process.env.LETTERBOXD_CHANNEL_ID;
const VERIFIED_ROLE_NAME = "verified";

let verifyMessageId = null;
let welcomeSent = false;

// ---------------- READY ----------------
client.once("ready", async () => {
  console.log(`Camelbot is online as ${client.user.tag}`);

  console.log("VERIFY_CHANNEL_ID =", VERIFY_CHANNEL_ID);
  console.log("LETTERBOXD_CHANNEL_ID =", LETTERBOXD_CHANNEL_ID);

  if (!VERIFY_CHANNEL_ID) return console.log("Missing VERIFY_CHANNEL_ID");

  try {
    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);

    if (!welcomeSent) {
      welcomeSent = true;

      const msg = await channel.send(
`Hello! Welcome to Gohith's movie server. To verify yourself, please react with a 👍 emoji.

React 🎬 if you want to link your Letterboxd account.`
      );

      verifyMessageId = msg.id;
      console.log("Verify message sent:", msg.id);
    }
  } catch (err) {
    console.log("READY ERROR:", err);
  }
});

// ---------------- REACTIONS ----------------
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (!reaction.message) return;
    if (reaction.message.id !== verifyMessageId) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);

    if (reaction.emoji.name === "👍") {
      const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
      if (role) await member.roles.add(role);
    }

    if (reaction.emoji.name === "🎬") {
      await user.send("Send your Letterboxd profile link:");
    }
  } catch (err) {
    console.log("Reaction error:", err);
  }
});

// ---------------- DM HANDLER ----------------
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (message.channel.type !== 1) return;

    const content = message.content.trim();

    if (!content.startsWith("http")) {
      return message.reply("Send a valid Letterboxd link.");
    }

    let old = null;

    try {
      old = getUser(message.author.id);
    } catch (err) {
      console.log("DB READ ERROR:", err);
    }

    try {
      saveUser(message.author.id, content);
    } catch (err) {
      console.log("DB WRITE ERROR:", err);
    }

    // post to channel (safe)
    if (LETTERBOXD_CHANNEL_ID) {
      try {
        const channel = await client.channels.fetch(LETTERBOXD_CHANNEL_ID);

        if (channel) {
          if (old) {
            await channel.send(`♻️ <@${message.author.id}> updated Letterboxd: ${content}`);
          } else {
            await channel.send(`<@${message.author.id}> linked Letterboxd: ${content}`);
          }
        }
      } catch (err) {
        console.log("Letterboxd post error:", err);
      }
    }

    // ALWAYS reply
    await message.reply("✅ Saved your Letterboxd profile.");
  } catch (err) {
    console.log("DM handler error:", err);
  }
});

client.login(process.env.TOKEN);
