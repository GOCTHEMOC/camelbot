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

// ================= OMDB TOP 6 =================
async function getTop6Movies(query) {
  const searchRes = await axios.get(
    `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`
  );

  if (!searchRes.data || searchRes.data.Response === "False") {
    return [];
  }

  return searchRes.data.Search.slice(0, 6);
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(process.env.COMMAND_CHANNEL_ID);

    if (channel) {
      const timestamp = new Date().toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      await channel.send(`Camelbot is up.\nStartup time (PST): ${timestamp}`);
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

    // ================= LOOKUP (TOP 6) =================
    if (content.startsWith("/lookup")) {

      const query = content.replace("/lookup", "").trim();
      if (!query) return message.channel.send("Provide a movie name.");

      const results = await getTop6Movies(query);

      if (!results.length) {
        return message.channel.send("No results found.");
      }

      let output = `Top 6 results for "${query}":\n\n`;

      for (const m of results) {

        const details = await axios.get(
          `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${m.imdbID}&plot=short`
        );

        const d = details.data;

        output +=
`${d.Title} (${d.Year})
Director: ${d.Director || "N/A"}
Cast: ${d.Actors || "N/A"}
IMDB: https://www.imdb.com/title/${d.imdbID}/

`;
      }

      return message.channel.send(output);
    }

    // ================= ENTER MOTW (WIZARD) =================
    const session = client.entermotwSessions[uid];

    if (session) {

      // STEP 1
      if (session.step === 1) {

        const results = await getTop6Movies(content);

        if (!results.length) {
          return message.channel.send("No matches found. Try again:");
        }

        const movie = results[0];

        session.movies.push({
          title: movie.Title,
          imdb: movie.imdbID
        });

        session.step = 2;

        return message.channel.send(
`Movie 1 selected:
${movie.Title} (${movie.Year})

Now enter Movie 2:`
        );
      }

      // STEP 2
      if (session.step === 2) {

        const results = await getTop6Movies(content);

        if (!results.length) {
          return message.channel.send("No matches found. Try again:");
        }

        const movie = results[0];

        session.movies.push({
          title: movie.Title,
          imdb: movie.imdbID
        });

        session.step = 3;

        return message.channel.send(
`Movie 2 selected:
${movie.Title} (${movie.Year})

Reply "yes" to submit or "no" to cancel.`
        );
      }

      // CONFIRM
      if (session.step === 3) {

        if (content.toLowerCase() === "no") {
          delete client.entermotwSessions[uid];
          return message.channel.send("Cancelled.");
        }

        if (content.toLowerCase() !== "yes") {
          return message.channel.send('Reply "yes" or "no".');
        }

        if (!state.submissions[uid]) state.submissions[uid] = [];

        session.movies.forEach(m => {
          if (state.submissions[uid].length < 2) {
            state.submissions[uid].push(m);
          }
        });

        saveState();

        delete client.entermotwSessions[uid];

        return message.channel.send("Movies submitted successfully.");
      }
    }

    // START WIZARD
    if (content === "/entermotw") {

      if (!state.active) {
        return message.channel.send("No active MOTW.");
      }

      if (!state.submissionOpened) {
        return message.channel.send("Submissions are closed.");
      }

      client.entermotwSessions[uid] = {
        step: 1,
        movies: []
      };

      return message.channel.send("Enter Movie 1:");
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
