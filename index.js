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

// ================= SAFE SESSION STORE =================
client.entermotwSessions = client.entermotwSessions || {};

// ================= MOTW ENGINE =================
async function runMOTWCycle() {
  if (!state.active || !state.startTimestamp) return;

  let channel;
  try {
    channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID);
  } catch (err) {
    console.log("MOTW channel fetch failed:", err);
    return;
  }

  const now = Date.now();
  const diffDays = Math.floor((now - state.startTimestamp) / (1000 * 60 * 60 * 24));

  try {
    // OPEN SUBMISSIONS
    if (diffDays >= 0 && !state.submissionOpened) {
      state.submissionOpened = true;
      await channel.send(`<@&${process.env.MOTW_ROLE_ID}> Submissions OPEN. Use /entermotw`);
      saveState();
    }

    // POLL PHASE
    if (diffDays >= 3 && !state.pollPosted) {
      const all = Object.values(state.submissions).flat().slice(0, 5);
      if (!all.length) return;

      const rows = [];
      state.voteCounts = {};
      state.userVotes = state.userVotes || {};

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

    // WINNER PHASE
    if (diffDays >= 5 && !state.winnerPosted) {
      const winner = Object.entries(state.voteCounts || {})
        .sort((a, b) => b[1] - a[1])[0];

      await channel.send(`Winner: ${winner?.[0] || "None"}`);
      state.winnerPosted = true;
      saveState();
    }

    // RESET CYCLE
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
    console.log("MOTW cycle error:", err);
  }
}

// ================= STARTUP =================
client.once(Events.ClientReady, async () => {
  try {
    console.log(`Camelbot online as ${client.user.tag}`);
    await runMOTWCycle();
  } catch (err) {
    console.log("Startup error:", err);
  }
});

// ================= VOTING =================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    const all = Object.values(state.submissions).flat().slice(0, 5);
    const index = parseInt(interaction.customId.replace("vote_", ""));
    const movie = all[index];

    if (!movie) {
      return interaction.reply({ content: "Invalid vote.", ephemeral: true });
    }

    state.userVotes = state.userVotes || {};
    state.voteCounts = state.voteCounts || {};

    const previous = state.userVotes[userId];

    if (previous === movie) {
      return interaction.reply({ content: "Already voted.", ephemeral: true });
    }

    if (previous) state.voteCounts[previous]--;

    state.userVotes[userId] = movie;
    state.voteCounts[movie] = (state.voteCounts[movie] || 0) + 1;

    saveState();

    return interaction.reply({ content: "Vote recorded.", ephemeral: true });

  } catch (err) {
    console.log("Interaction error:", err);
  }
});

// ================= ENTEMOTW SESSIONS =================
client.entermotwSessions = client.entermotwSessions || {};

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    const isDM = message.channel.type === 1;
    const isMention = message.mentions.users.has(client.user.id);

    const COMMAND_CHANNEL = process.env.COMMAND_CHANNEL_ID;
    const MOVIE_CHANNEL = process.env.MOVIE_CHANNEL_ID;

    const isCommand =
      message.content.startsWith("/startmotw") ||
      message.content.startsWith("/entermotw");

    if (
      isCommand &&
      message.channel.id !== COMMAND_CHANNEL &&
      message.channel.id !== MOVIE_CHANNEL
    ) {
      return message.reply("Use correct channel.");
    }

    // ================= START MOTW =================
    if (message.content.startsWith("/startmotw")) {
      const arg = message.content.split(" ")[1];

      if (arg === "0/00/0000") {
        state.active = false;
        saveState();
        return message.reply("MOTW stopped.");
      }

      const match = arg?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) {
        state.active = false;
        saveState();
        return message.reply("Invalid date. MOTW stopped.");
      }

      const [_, mm, dd, yyyy] = match;
      const start = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);

      if (start.getTime() < Date.now()) {
        state.active = false;
        saveState();
        return message.reply("Past date. MOTW stopped.");
      }

      state.active = true;
      state.startTimestamp = start.getTime();

      state.submissionOpened = false;
      state.pollPosted = false;
      state.winnerPosted = false;
      state.submissions = {};
      state.voteCounts = {};
      state.userVotes = {};

      saveState();
      await runMOTWCycle();

      return message.reply("MOTW started.");
    }

    // ================= ENTEMOTW =================
    if (message.content.startsWith("/entermotw")) {

      if (message.channel.id !== process.env.MOVIE_CHANNEL_ID) {
        return message.reply("Movie channel only.");
      }

      if (!state.active || !state.submissionOpened) {
        return message.reply("Submissions closed.");
      }

      const input = message.content.replace("/entermotw", "").trim();
      if (!input) return message.reply("Provide movies.");

      const queries = input.split(",").map(x => x.trim()).filter(Boolean);
      const uid = message.author.id;

      if (!state.submissions[uid]) state.submissions[uid] = [];

      if (state.submissions[uid].length >= 2) {
        return message.reply("Max 2 movies.");
      }

      client.entermotwSessions[uid] = {
        queue: queries,
        collected: []
      };

      return processNextMovie(message);
    }

    // ================= MOVIE FLOW =================
    async function processNextMovie(message) {
      const uid = message.author.id;
      const session = client.entermotwSessions[uid];

      if (!session) return;

      if (session.queue.length === 0) {
        state.submissions[uid].push(...session.collected);
        saveState();

        delete client.entermotwSessions[uid];

        return message.reply(
          `Done. Entered: ${session.collected.join(", ")}`
        );
      }

      const query = session.queue.shift();

      const search = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`
      );

      const results = (search.data.Search || []).slice(0, 6);

      if (!results.length) return processNextMovie(message);

      session.current = results;
      session.awaiting = true;

      let text = `Select for: ${query}\n`;
      results.forEach((m, i) => {
        text += `${i + 1}. ${m.Title} (${m.Year})\n`;
      });

      text += `\nReply 1-6 or 0 to skip`;

      return message.reply(text);
    }

    // ================= SELECTION =================
    const uid = message.author.id;
    const session = client.entermotwSessions[uid];

    if (session?.awaiting) {
      const val = message.content.trim();

      if (val === "0") {
        session.awaiting = false;
        return processNextMovie(message);
      }

      const index = parseInt(val) - 1;
      const selected = session.current?.[index];

      if (!selected) return message.reply("Invalid.");

      const full = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${selected.imdbID}&plot=full`
      );

      session.collected.push(full.data.Title);
      session.awaiting = false;

      return processNextMovie(message);
    }

    // ================= AI =================
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
    console.log("Handler crash:", err);
  }
});

// ================= LOOP =================
setInterval(() => {
  runMOTWCycle().catch(err => console.log("Loop crash:", err));
}, 60 * 60 * 1000);

// ================= LOGIN =================
client.login(process.env.TOKEN);
