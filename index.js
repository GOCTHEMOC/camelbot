require("dotenv").config();

const pendingLookups = {};

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
client.pendingLookups = pendingLookups;

require("./events/messageCreate")(client);
require("./events/reactionAdd")(client);
require("./events/guildMemberAdd")(client);

const motw = require("./motwEngine");

client.once("ready", async () => {

  console.log(`Logged in as ${client.user.tag}`);

  motw.startLoop(client);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  // ✅ FIXED: COMMAND CHANNEL BY ID
  const commandChannel = await client.channels.fetch(
    process.env.COMMAND_CHANNEL_ID
  ).catch(() => null);

  if (commandChannel) {
    commandChannel.send("🟢 Camelbot is ONLINE and operational.");
  }

  // VERIFY SYSTEM (UNCHANGED BUT SAFE)
  const verifyChannel = await client.channels.fetch(
    process.env.VERIFY_CHANNEL_ID
  ).catch(() => null);

  if (!verifyChannel) return;

  const existing = await verifyChannel.messages.fetch({ limit: 10 });

  const alreadySent = existing.find(m =>
    m.author.id === client.user.id &&
    m.content.includes("React below")
  );

  if (!alreadySent) {

    const verifyChannel = await client.channels.fetch(process.env.VERIFY_CHANNEL_ID);

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
