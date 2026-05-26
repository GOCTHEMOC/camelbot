require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

client.sessions = new Map();

// load event handlers
require("./events/messageCreate")(client);
require("./events/reactionAdd")(client);
require("./events/guildMemberAdd")(client);

client.once("ready", async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  const setupVerify = require("./services/verifyMessage");
  await setupVerify(client);
});

client.login(process.env.TOKEN);
