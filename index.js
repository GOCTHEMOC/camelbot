console.log("OPENAI KEY:", process.env.OPENAI_API_KEY);
require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const db = require('./database');
const { chatAI } = require('./ai');

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

let verifyMessageId = null;

/* ================= READY ================= */

client.once('ready', async () => {
  console.log(`Camelbot is online as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  await guild.channels.fetch();

  const channel = guild.channels.cache.find(c => c.name === 'verify');
  if (!channel) return console.log("Verify channel not found");

  const messages = await channel.messages.fetch({ limit: 10 });

  const existing = messages.find(m =>
    m.author.id === client.user.id &&
    m.content.includes("Verification System")
  );

  let msg;

  if (existing) {
    msg = existing;
  } else {
    msg = await channel.send(
      `👋 **Verification System**\n\n` +
      `👍 = Verified Role\n` +
      `🎬 = Letterboxd Setup`
    );

    await msg.react('👍');
    await msg.react('🎬');

    await msg.pin();
  }

  verifyMessageId = msg.id;
});

/* ================= JOIN DM ================= */

client.on('guildMemberAdd', async (member) => {
  try {
    await member.send(
      `👋 Welcome!\nGo to #verify to get started.`
    );
  } catch (err) {
    console.log("Could not DM:", member.user.tag);
  }
});

/* ================= REACTIONS ================= */

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    if (reaction.message.id !== verifyMessageId) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);

    const emoji = reaction.emoji.name;

    /* 👍 VERIFIED ROLE */
    if (emoji === '👍') {
      const role = guild.roles.cache.find(r => r.name === 'Verified');

      if (role) {
        await member.roles.add(role);
        await user.send("✅ You are now Verified.");
      }
    }

    /* 🎬 LETTERBOXD FLOW */
    if (emoji === '🎬') {
      await user.send(
        `📩 Send your Letterboxd profile:\nhttps://letterboxd.com/username/`
      );
    }

  } catch (err) {
    console.error("Reaction error:", err);
  }
});

/* ================= DM LETTERBOXD ================= */

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    const content = message.content.trim();

    const regex = /^https:\/\/letterboxd\.com\/[A-Za-z0-9_-]+\/$/;

    if (!regex.test(content)) {
      return message.reply("❌ Invalid format.");
    }

    const username = content.split('letterboxd.com/')[1].replace('/', '');

    const guild = client.guilds.cache.first();
    if (!guild) return;

    try {
      const member = await guild.members.fetch(message.author.id);

      db.get(
        'SELECT * FROM users WHERE discord_id = ?',
        [message.author.id],
        (err, row) => {
          if (row) {
            return message.reply("❌ Already linked.");
          }

          db.run(
            'INSERT INTO users (discord_id, letterboxd_url) VALUES (?, ?)',
            [message.author.id, content]
          );

          const role = guild.roles.cache.find(r => r.name === 'Letterboxd');
          if (role) member.roles.add(role);

          message.reply(`✅ Saved: ${username}`);
        }
      );

    } catch (err) {
      console.error(err);
    }
  }
});

/* ================= AI CHAT ================= */

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (!message.mentions.has(client.user)) return;

  const prompt = message.content.replace(/<@!?\\d+>/, '').trim();

  if (!prompt) return message.reply("Ask me something.");

  const response = await chatAI(prompt);

  message.reply(response);
});

client.login(process.env.TOKEN);
