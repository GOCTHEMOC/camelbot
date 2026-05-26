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

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(process.env.COMMAND_CHANNEL_ID);

    if (channel) {
      channel.send("Camelbot is up.");
    }
  } catch (err) {
    console.log("Startup message failed:", err);
  }
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

    // ================= CHANNEL RULES =================
    if (cmd === "/startmotw" && message.channel.id !== COMMAND_CHANNEL) {
      return message.channel.send("Use command channel for /startmotw.");
    }

    if (cmd === "/stopmotw" && message.channel.id !== COMMAND_CHANNEL) {
      return message.channel.send("Use command channel for /stopmotw.");
    }

    if (cmd === "/entermotw" && message.channel.id !== MOVIE_CHANNEL) {
      return message.channel.send("Use movie channel for /entermotw.");
    }

    // ================= HELP =================
    if (content === "/camelhelp") {
      return message.channel.send(
`Camelbot Commands:

/startmotw
/stopmotw
/entermotw movie1, movie2
/lookup movie
/ping`
      );
    }

    // ================= PING =================
    if (content === "/ping") {
      return message.channel.send("pong");
    }

    // ================= START MOTW =================
    if (content === "/startmotw") {

      state.active = true;
      state.submissionOpened = true;
      state.pollPosted = false;
      state.winnerPosted = false;

      state.submissions = {};
      state.voteCounts = {};
      state.userVotes = {};

      saveState();

      const movieChannel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID);

      await message.channel.send("MOTW started.");
      if (movieChannel) {
        movieChannel.send("Movie of the Week has started. Submissions are now open.");
      }
    }

    // ================= STOP MOTW =================
    if (content === "/stopmotw") {

      state.active = false;
      state.submissionOpened = false;
      state.pollPosted = false;
      state.winnerPosted = false;

      saveState();

      const movieChannel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID);

      await message.channel.send("MOTW stopped.");
      if (movieChannel) {
        movieChannel.send("Movie of the Week has been stopped.");
      }
    }

    // ================= ENTER MOTW =================
    if (content.startsWith("/entermotw")) {

      if (!state.active) {
        return message.channel.send("No active MOTW.");
      }

      if (!state.submissionOpened) {
        return message.channel.send("Submissions are closed.");
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

      return message.channel.send("Entry received.");
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

// ================= LOGIN =================
client.login(process.env.TOKEN);
