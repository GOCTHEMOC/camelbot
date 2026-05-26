require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const axios = require("axios");
const fs = require("fs");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ================= STATE =================
const state = require("./motwState.json");

function saveState() {
  fs.writeFileSync("./motwState.json", JSON.stringify(state, null, 2));
}

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ================= MOTW ENGINE =================
async function runMOTWCycle() {
  if (!state.active || !state.startTimestamp) return;

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID);

  const now = Date.now();
  const diffDays = Math.floor((now - state.startTimestamp) / (1000 * 60 * 60 * 24));

  try {

    // OPEN SUBMISSIONS
    if (diffDays >= 0 && !state.submissionOpened) {
      state.submissionOpened = true;

      await channel.send(
        `<@&${process.env.MOTW_ROLE_ID}> Submissions OPEN. Use /entermotw`
      );

      saveState();
    }

    // POLL
    if (diffDays >= 3 && !state.pollPosted) {

      const all = Object.values(state.submissions).flat().slice(0, 5);
      if (!all.length) return;

      const rows = [];
      state.voteCounts = {};

      all.forEach((movie, index) => {
        state.voteCounts[movie] = 0;

        rows.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`vote_${index}`)
              .setLabel(movie.slice(0, 80))
              .setStyle(ButtonStyle.Primary)
          )
        );
      });

      const msg = await channel.send({
        content: "Movie of the Week Voting",
        components: rows
      });

      state.pollMessageId = msg.id;
      state.pollPosted = true;

      saveState();
    }

    // WINNER
    if (diffDays >= 5 && !state.winnerPosted) {

      const winner = Object.entries(state.voteCounts || {})
        .sort((a, b) => b[1] - a[1])[0];

      await channel.send(`Winner: ${winner?.[0] || "None"}`);

      state.winnerPosted = true;
      saveState();
    }

    // RESET
    if (diffDays >= 7) {
      state.startTimestamp = Date.now();
      state.submissionOpened = false;
      state.pollPosted = false;
      state.winnerPosted = false;
      state.submissions = {};
      state.voteCounts = {};
      state.userVotes = {};
      state.pollMessageId = null;

      saveState();
    }

  } catch (err) {
    console.log(err);
  }
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);
  await runMOTWCycle();
});

// ================= INTERACTIONS =================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  const all = Object.values(state.submissions).flat().slice(0, 5);
  const index = parseInt(interaction.customId.replace("vote_", ""));
  const movie = all[index];

  if (!movie) {
    return interaction.reply({ content: "Invalid vote.", ephemeral: true });
  }

  if (!state.userVotes) state.userVotes = {};
  if (!state.voteCounts) state.voteCounts = {};

  const previous = state.userVotes[userId];

  if (previous === movie) {
    return interaction.reply({ content: "Already voted.", ephemeral: true });
  }

  if (previous) state.voteCounts[previous]--;

  state.userVotes[userId] = movie;
  state.voteCounts[movie] = (state.voteCounts[movie] || 0) + 1;

  saveState();

  return interaction.reply({ content: "Vote recorded.", ephemeral: true });
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === 1;
  const isMention = message.mentions.users.has(client.user.id);

  try {

    const COMMAND_CHANNEL = process.env.COMMAND_CHANNEL_ID;
    const MOVIE_CHANNEL = process.env.MOVIE_CHANNEL_ID;

    const isMOTWCommand =
      message.content.startsWith("/startmotw") ||
      message.content.startsWith("/entermotw");

    // ================= FIXED CHANNEL LOGIC =================

    if (isMOTWCommand && message.channel.id !== COMMAND_CHANNEL) {
      return message.reply("Use MOTW commands in the command channel only.");
    }

    // ================= START MOTW =================
    if (message.content.startsWith("/startmotw")) {
      const arg = message.content.split(" ")[1];

      if (arg === "0/00/0000") {
        state.active = false;
        saveState();
        return message.reply("Stopped.");
      }

      const match = arg.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) return message.reply("Use MM/DD/YYYY");

      const [_, mm, dd, yyyy] = match;

      state.active = true;
      state.startTimestamp = new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();

      saveState();
      await runMOTWCycle();

      return message.reply("MOTW started.");
    }

    // ================= ENTER MOTW =================
    if (message.content.startsWith("/entermotw")) {

      const input = message.content.replace("/entermotw", "").trim();
      const movies = input.split(",").map(m => m.trim());

      const uid = message.author.id;

      if (!state.submissions[uid]) state.submissions[uid] = [];

      if (state.submissions[uid].length + movies.length > 2) {
        return message.reply("Max 2 movies.");
      }

      state.submissions[uid].push(...movies);
      saveState();

      return message.reply("Saved.");
    }

    // ================= AI CHAT =================
    if (isDM || isMention) {
      const prompt = isMention
        ? message.content.replace(`<@${client.user.id}>`, "").trim()
        : message.content;

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Camelbot." },
          { role: "user", content: prompt }
        ]
      });

      return message.reply(res.choices[0].message.content);
    }

  } catch (err) {
    console.log(err);
  }
});

// ================= LOOP =================
setInterval(() => runMOTWCycle(), 60 * 60 * 1000);

// ================= LOGIN =================
client.login(process.env.TOKEN);
