require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
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
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ================= SAFE REPLY =================
async function safeSend(channel, content) {
  try {
    return await channel.send(content);
  } catch (err) {
    console.log("Send failed:", err);
  }
}

// ================= PST TIME HELPERS =================
function getPSTNow() {
  const now = new Date();
  const pst = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  return pst;
}

function parsePSTDate(mm, dd, yyyy) {
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

// ================= CLIENT STORAGE =================
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

  const now = getPSTNow();
  const start = new Date(state.startTimestamp);

  const diffDays = Math.floor((now - start) / 86400000);

  try {
    if (diffDays >= 0 && !state.submissionOpened) {
      state.submissionOpened = true;
      await safeSend(channel, `<@&${process.env.MOTW_ROLE_ID}> Submissions OPEN`);
      saveState();
    }

    if (diffDays >= 3 && !state.pollPosted) {
      const all = Object.values(state.submissions).flat().slice(0, 5);
      if (!all.length) return;

      state.voteCounts = {};
      state.userVotes = {};

      await safeSend(channel, "Movie of the Week Voting");

      state.pollPosted = true;
      saveState();
    }

    if (diffDays >= 5 && !state.winnerPosted) {
      const winner = Object.entries(state.voteCounts || {})
        .sort((a, b) => b[1] - a[1])[0];

      await safeSend(channel, `Winner: ${winner?.[0] || "None"}`);

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
client.once(Events.ClientReady, () => {
  console.log(`Camelbot online as ${client.user.tag}`);
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    const uid = message.author.id;

    const COMMAND_CHANNEL = process.env.COMMAND_CHANNEL_ID;
    const MOVIE_CHANNEL = process.env.MOVIE_CHANNEL_ID;

    const content = message.content.trim();
    const cmd = content.split(" ")[0];

    // ================= CHANNEL RESTRICTIONS (ONLY MOTW) =================
    const restricted = ["/startmotw", "/entermotw"];

    if (
      restricted.includes(cmd) &&
      message.channel.id !== COMMAND_CHANNEL &&
      message.channel.id !== MOVIE_CHANNEL
    ) {
      return message.channel.send("Wrong channel.");
    }

    // ================= GLOBAL COMMANDS =================

    if (content === "/ping") {
      return message.channel.send("pong");
    }

    if (content === "/camelhelp") {
      return message.channel.send(
`Camelbot Commands:

/startmotw MM/DD/YYYY - start MOTW
/startmotw 0/00/0000 - stop MOTW

/entermotw movie1, movie2 - submit movies (max 2)

/lookup movie - movie info

/ping - test bot`
      );
    }

    // ================= START MOTW (PST SAFE) =================
    if (content.startsWith("/startmotw")) {
      const arg = content.split(" ")[1];

      if (arg === "0/00/0000") {
        state.active = false;
        saveState();
        return message.channel.send("MOTW stopped.");
      }

      const match = arg?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) {
        state.active = false;
        saveState();
        return message.channel.send("Invalid date.");
      }

      const [_, mm, dd, yyyy] = match;

      const start = parsePSTDate(mm, dd, Number(yyyy));

      const now = getPSTNow();

      const isPast =
        start.getFullYear() < now.getFullYear() ||
        (start.getFullYear() === now.getFullYear() &&
          start.getMonth() < now.getMonth()) ||
        (start.getFullYear() === now.getFullYear() &&
          start.getMonth() === now.getMonth() &&
          start.getDate() < now.getDate());

      if (isPast) {
        state.active = false;
        saveState();
        return message.channel.send("Past date rejected (PST).");
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

      return message.channel.send("MOTW started (PST mode).");
    }

    // ================= LOOKUP (GLOBAL) =================
    if (content.startsWith("/lookup")) {
      const query = content.replace("/lookup", "").trim();
      if (!query) return message.channel.send("Provide movie.");

      const res = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&t=${encodeURIComponent(query)}&plot=full`
      );

      if (!res.data || res.data.Response === "False") {
        return message.channel.send("Not found.");
      }

      return message.channel.send(
`${res.data.Title} (${res.data.Year})
Director: ${res.data.Director}
Cast: ${res.data.Actors}
IMDB: https://www.imdb.com/title/${res.data.imdbID}/
Plot: ${res.data.Plot}`
      );
    }

    // ================= AI CHAT =================
    if (message.mentions.users.has(client.user.id) || message.channel.type === 1) {

      const prompt = content.replace(`<@${client.user.id}>`, "").trim();

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Camelbot." },
          { role: "user", content: prompt }
        ]
      });

      return message.channel.send(res.choices[0].message.content);
    }

  } catch (err) {
    console.log("Handler crash:", err);
  }
});

// ================= LOOP =================
setInterval(() => {
  runMOTWCycle().catch(console.log);
}, 60 * 60 * 1000);

// ================= LOGIN =================
client.login(process.env.TOKEN);
