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

// ---------------- CONFIG ----------------
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID;
const LETTERBOXD_CHANNEL_ID = process.env.LETTERBOXD_CHANNEL_ID;
const VERIFIED_ROLE_NAME = "verified";

let verifyMessageId = null;
let welcomeSent = false;

// ---------------- READY ----------------
client.once("ready", async () => {
  console.log(`Camelbot is online as ${client.user.tag}`);

  console.log("ENV VERIFY_CHANNEL_ID =", VERIFY_CHANNEL_ID);
  console.log("ENV LETTERBOXD_CHANNEL_ID =", LETTERBOXD_CHANNEL_ID);

  if (!VERIFY_CHANNEL_ID) {
    console.log("❌ Missing VERIFY_CHANNEL_ID");
    return;
  }

  let channel;
  try {
    channel = await client.channels.fetch(VERIFY_CHANNEL_ID);
  } catch (err) {
    console.log("❌ Failed to fetch verify channel:", err);
    return;
  }

  if (!channel) {
    console.log("❌ Verify channel not found or inaccessible");
    return;
  }

  if (welcomeSent) return;
  welcomeSent = true;

  try {
    const msg = await channel.send(
`Hello! Welcome to Gohith's movie server. To verify yourself, please react with a 👍 emoji to this message.

If you have Letterboxd and wish to connect your Letterboxd profile to the server, please react with the 🎬 emoji to this message.`
    );

    verifyMessageId = msg.id;
    console.log("✅ Verify message sent:", msg.id);
  } catch (err) {
    console.log("❌ Failed to send verify message:", err);
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

    // VERIFY ROLE
    if (reaction.emoji.name === "👍") {
      const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
      if (role) await member.roles.add(role);
    }

    // LETTERBOXD DM
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
    if (message.channel.type !== 1) return; // DM only

    const content = message.content.trim();
    if (!content.startsWith("http")) return;

    if (!LETTERBOXD_CHANNEL_ID) {
      console.log("❌ Missing LETTERBOXD_CHANNEL_ID");
      return;
    }

    let channel;
    try {
      channel = await client.channels.fetch(LETTERBOXD_CHANNEL_ID);
    } catch (err) {
      console.log("❌ Failed to fetch letterboxd channel:", err);
      return;
    }

    const old = getUser(message.author.id);
    saveUser(message.author.id, content);

    if (!channel) return console.log("❌ Letterboxd channel not found");

    if (old) {
      await channel.send(`♻️ <@${message.author.id}> updated Letterboxd: ${content}`);
    } else {
      await channel.send(`<@${message.author.id}> linked Letterboxd: ${content}`);
    }

    await message.reply("Saved your Letterboxd profile.");
  } catch (err) {
    console.log("DM handler error:", err);
  }
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);
