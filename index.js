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

require("./events/messageCreate")(client);
require("./events/reactionAdd")(client);
require("./events/guildMemberAdd")(client);

const motw = require("./motwEngine");

client.once("ready", async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  // MOTW AUTO LOOP START
  motw.startMOTWLoop(client);
});

client.login(process.env.TOKEN);
