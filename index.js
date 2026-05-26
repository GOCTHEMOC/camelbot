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

// ================= SAFE REPLY WRAPPER =================
async function safeReply(message, content) {
  try {
    return await message.reply(content);
  } catch (err) {
    console.log("Reply failed:", err);
  }
}

// ================= TIMEOUT WRAPPER =================
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    )
  ]);
}

// ================= SESSION STORE =================
client.entermotwSessions = client.entermotwSessions || {};

// ================= MOTW ENGINE =================
async function runMOTWCycle() {
  if (!state.active || !state.startTimestamp) return;

  let channel;
  try {
    channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID);
  } catch (err) {
    console.log("Channel fetch failed:", err);
    return;
  }

  const now = Date.now();
  const diffDays = Math.floor((now - state.startTimestamp) / 86400000);

  try {
    if (diffDays >= 0 && !state.submissionOpened) {
      state.submissionOpened = true;
      await channel.send(`<@&${process.env.MOTW_ROLE_ID}> Submissions OPEN. Use /entermotw`);
      saveState();
    }

    if (diffDays >= 3 && !state.pollPosted) {
      const all = Object.values(state.submissions).flat().slice(0, 5);
      if (!all.length) return;

      state.voteCounts = {};
      state.userVotes = state.userVotes || {};

      const rows = all.map((m, i) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_${i}`)
            .setLabel(m.slice(0, 80))
            .setStyle(ButtonStyle.Primary)
        )
      );

      const msg = await channel.send({
        content: "Movie of the Week Voting"
      });

      state.pollMessageId = msg.id;
      state.pollPosted = true;
      saveState();
    }

    if (diffDays >= 5 && !state.winnerPosted) {
      const winner = Object.entries(state.voteCounts || {})
        .sort((a, b) => b[1] - a[1])[0];

      await channel.send(`Winner: ${winner?.[0] || "None"}`);

      state.winnerPosted = true;
      saveState();
    }

    if (diffDays >= 7) {
      state.startTimestamp = Date.now();
      state.submissionOpened = false;
      state.pollPosted = false;
      state.winnerPosted = false;
      state.submissions = {};
      state.voteCounts = {};
      state.userVotes = {};
      saveState();
    }

  } catch (err) {
    console.log("MOTW error:", err);
  }
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    console.log("MSG:", message.content);

    const uid = message.author.id;

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
      return safeReply(message, "Wrong channel.");
    }

    // ================= PING TEST =================
    if (message.content === "/ping") {
      return safeReply(message, "pong");
    }

    // ================= START MOTW =================
    if (message.content.startsWith("/startmotw")) {
      const arg = message.content.split(" ")[1];

      if (arg === "0/00/0000") {
        state.active = false;
        saveState();
        return safeReply(message, "MOTW stopped.");
      }

      const match = arg?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) {
        state.active = false;
        saveState();
        return safeReply(message, "Invalid date.");
      }

      const [_, mm, dd, yyyy] = match;
      const start = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);

      if (start.getTime() < Date.now()) {
        state.active = false;
        saveState();
        return safeReply(message, "Past date rejected.");
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

      return safeReply(message, "MOTW started.");
    }

    // ================= ENTEMOTW =================
    if (message.content.startsWith("/entermotw")) {

      if (message.channel.id !== process.env.MOVIE_CHANNEL_ID) {
        return safeReply(message, "Movie channel only.");
      }

      if (!state.active || !state.submissionOpened) {
        return safeReply(message, "Submissions closed.");
      }

      const input = message.content.replace("/entermotw", "").trim();
      if (!input) return safeReply(message, "Provide movies.");

      const queries = input.split(",").map(x => x.trim()).filter(Boolean);

      if (!state.submissions[uid]) state.submissions[uid] = [];

      if (state.submissions[uid].length >= 2) {
        return safeReply(message, "Max 2 movies.");
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

        return safeReply(
          message,
          `Done. Entered: ${session.collected.join(", ")}`
        );
      }

      const query = session.queue.shift();

      let search;
      try {
        search = await withTimeout(
          axios.get(`https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`)
        );
      } catch {
        return processNextMovie(message);
      }

      const results = (search.data.Search || []).slice(0, 6);

      if (!results.length) return processNextMovie(message);

      session.current = results;
      session.awaiting = true;

      let text = `Select for: ${query}\n`;
      results.forEach((m, i) => {
        text += `${i + 1}. ${m.Title} (${m.Year})\n`;
      });

      text += `\nReply 1-6 or 0`;

      return safeReply(message, text);
    }

    // ================= SELECTION =================
    const session = client.entermotwSessions[uid];

    if (session?.awaiting) {
      const val = message.content.trim();

      if (val === "0") {
        session.awaiting = false;
        return processNextMovie(message);
      }

      const index = parseInt(val) - 1;
      const selected = session.current?.[index];

      if (!selected) return safeReply(message, "Invalid.");

      let full;
      try {
        full = await withTimeout(
          axios.get(`https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${selected.imdbID}&plot=full`)
        );
      } catch {
        return safeReply(message, "Lookup failed.");
      }

      session.collected.push(full.data.Title);
      session.awaiting = false;

      return processNextMovie(message);
    }

    // ================= AI CHAT =================
    if (message.mentions.users.has(client.user.id) || message.channel.type === 1) {

      const prompt = message.content.replace(`<@${client.user.id}>`, "").trim();

      let res;
      try {
        res = await withTimeout(
          openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are Camelbot." },
              { role: "user", content: prompt }
            ]
          })
        );
      } catch {
        return safeReply(message, "AI error.");
      }

      return safeReply(message, res.choices[0].message.content);
    }

  } catch (err) {
    console.log("Handler crash:", err);
  }
});

// ================= LOOP =================
setInterval(() => {
  runMOTWCycle().catch(err => console.log("Loop error:", err));
}, 60 * 60 * 1000);

// ================= LOGIN =================
client.login(process.env.TOKEN);
