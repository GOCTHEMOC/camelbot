require("dotenv").config();

process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

const {
  Client,
  GatewayIntentBits,
  Partials
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction
  ]
});

client.sessions = new Map();
client.pendingLookups = {};

// events
require("./events/messageCreate")(client);
require("./events/reactionAdd")(client);
require("./events/guildMemberAdd")(client);

// motw engine (ONLY ONCE)
const motw = require("./motwEngine");

client.once("ready", async () => {

  console.log(`Logged in as ${client.user.tag}`);

  // =========================
  // MOTW SCHEDULER START
  // =========================
  motw.startScheduler(client);

  // =========================
  // COMMAND CHANNEL ONLINE MSG
  // =========================
  const commandChannel = await client.channels.fetch(
    process.env.COMMAND_CHANNEL_ID
  ).catch(() => null);

  if (commandChannel) {
    commandChannel.send("🟢 Camelbot is ONLINE and operational.");
  }

  // =========================
  // VERIFY MESSAGE SYSTEM
  // =========================
  const verifyChannel = await client.channels.fetch(
    process.env.VERIFY_CHANNEL_ID
  ).catch(() => null);

  if (!verifyChannel) return;

  const messages = await verifyChannel.messages.fetch({ limit: 20 });

  const existing = messages.find(m =>
    m.author.id === client.user.id &&
    m.content.includes("verify yourself")
  );

  if (!existing) {

    const msg = await verifyChannel.send(
`Hello! Welcome to Gohith's movie server. To verify yourself, please react with a 👍 emoji.

React 🎬 if you want to link your Letterboxd account.`
    );

    await msg.react("👍");
    await msg.react("🎬");

    client.verifyMessageId = msg.id;

  } else {
    client.verifyMessageId = existing.id;
  }
});

client.login(process.env.TOKEN);
