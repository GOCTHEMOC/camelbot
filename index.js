require("dotenv").config();

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

require("./events/messageCreate")(client);
require("./events/reactionAdd")(client);
require("./events/guildMemberAdd")(client);

const motw = require("./motwEngine");

client.once("ready", async () => {

  console.log(`Logged in as ${client.user.tag}`);

  motw.startLoop(client);

  const guild = client.guilds.cache.first();

  if (!guild) return;

  const verifyChannel =
    guild.channels.cache.find(c => c.name === "verify");

  if (!verifyChannel) return;

  const existing = await verifyChannel.messages.fetch({ limit: 10 });

  const alreadySent = existing.find(m =>
    m.author.id === client.user.id &&
    m.content.includes("React below")
  );

  if (!alreadySent) {

    const msg = await verifyChannel.send(
`✅ React below:

👍 = Verified
🎬 = Link Letterboxd`
    );

    await msg.react("👍");
    await msg.react("🎬");

    client.verifyMessageId = msg.id;
  } else {
    client.verifyMessageId = alreadySent.id;
  }

});

client.login(process.env.TOKEN);
