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

client.entermotwSessions = {};

// ================= SAFE SEND =================
async function safeSend(channel, content) {
  try {
    return await channel.send(content);
  } catch (err) {
    console.log("Send failed:", err);
  }
}

// ================= TIME =================
function getPSTTimestamp() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

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
  const diffDays = Math.floor((now - state.startTimestamp) / 86400000);

  try {
    if (diffDays >= 0 && !state.submissionOpened) {
      state.submissionOpened = true;
      await safeSend(channel, `<@&${process.env.MOTW_ROLE_ID}> Submissions OPEN`);
      saveState();
    }

    if (diffDays >= 3 && !state.pollPosted) {
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
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    const content = message.content.trim();
    const uid = message.author.id;

    const COMMAND_CHANNEL = process.env.COMMAND_CHANNEL_ID;
    const MOVIE_CHANNEL = process.env.MOVIE_CHANNEL_ID;

    const cmd = content.split(" ")[0];

    // ================= STRICT CHANNEL RULES =================
    if (cmd === "/startmotw" && message.channel.id !== COMMAND_CHANNEL) {
      return message.channel.send("Use command channel for /startmotw.");
    }

    if (cmd === "/entermotw" && message.channel.id !== MOVIE_CHANNEL) {
      return message.channel.send("Use movie channel for /entermotw.");
    }

    // ================= GLOBAL COMMANDS =================

    if (content === "/ping") {
      return message.channel.send("pong");
    }

    if (content === "/camelhelp") {
      return message.channel.send(
`Camelbot Commands:

/startmotw MM/DD/YYYY
/entermotw movie1, movie2
/lookup movie
/ping`
      );
    }

    // ================= START MOTW (WITH BROADCASTS) =================
    if (content.startsWith("/startmotw")) {
      const arg = content.split(" ")[1];

      const movieChannel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID);

      // ================= CANCEL =================
      if (arg === "0/00/0000") {
        state.active = false;
        saveState();

        await message.channel.send("MOTW stopped.");

        if (movieChannel) {
          movieChannel.send("Movie of the Week has been cancelled.");
        }

        return;
      }

      // ================= VALIDATE =================
      const match = arg?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) {
        return message.channel.send("Invalid date format.");
      }

      const start = new Date(arg);

      state.active = true;
      state.startTimestamp = start.getTime();

      state.submissionOpened = false;
      state.pollPosted = false;
      state.winnerPosted = false;
      state.submissions = {};
      state.voteCounts = {};
      state.userVotes = {};

      saveState();

      await message.channel.send("MOTW started.");

      if (movieChannel) {
        movieChannel.send(`Movie of the Week has started!\nStart date: ${arg}`);
      }
    }

    // ================= ENTER MOTW =================
    if (content.startsWith("/entermotw")) {

      console.log("ENTERMOTW HIT");

      if (!state.active || !state.submissionOpened) {
        return message.channel.send("Submissions closed.");
      }

      const input = content.replace("/entermotw", "").trim();
      if (!input) return message.channel.send("Provide movies.");

      const movies = input.split(",").map(x => x.trim()).filter(Boolean);

      if (!state.submissions[uid]) state.submissions[uid] = [];

      if (state.submissions[uid].length >= 2) {
        return message.channel.send("Max 2 movies.");
      }

      client.entermotwSessions[uid] = {
        queue: movies,
        collected: []
      };

      return message.channel.send("Processing entry...");
    }

    // ================= LOOKUP =================
    if (content.startsWith("/lookup")) {
      const query = content.replace("/lookup", "").trim();

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
IMDB: https://www.imdb.com/title/${res.data.imdbID}/`
      );
    }

    // ================= AI =================
    if (message.mentions.users.has(client.user.id)) {
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
