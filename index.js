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

const state = require("./motwState.json");

function saveState() {
  fs.writeFileSync("./motwState.json", JSON.stringify(state, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.sessions = {};

// ================= OMDB =================
async function searchMovies(query) {
  const res = await axios.get(
    `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`
  );

  if (!res.data || res.data.Response === "False") return [];

  return res.data.Search.slice(0, 6);
}

async function getMovieDetails(id) {
  const res = await axios.get(
    `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${id}&plot=short`
  );
  return res.data;
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  const channel = await client.channels.fetch(process.env.COMMAND_CHANNEL_ID);
  if (channel) channel.send("Camelbot is up.");
});

// ================= MESSAGE =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    const uid = message.author.id;
    const content = message.content.trim();

    const COMMAND_CHANNEL = process.env.COMMAND_CHANNEL_ID;
    const MOVIE_CHANNEL = process.env.MOVIE_CHANNEL_ID;

    const session = client.sessions[uid];

    // ================= GLOBAL HELP =================
    if (content === "/camelhelp") {
      return message.channel.send(
`Commands:
/lookup <movie>
/entermotw
/startmotw
/stopmotw`
      );
    }

    // ================= START / STOP =================
    if (content === "/startmotw") {
      state.active = true;
      state.submissionOpened = true;
      state.submissions = {};
      saveState();

      const ch = await client.channels.fetch(MOVIE_CHANNEL);
      if (ch) ch.send("MOTW started. Submissions open.");

      return message.channel.send("MOTW started.");
    }

    if (content === "/stopmotw") {
      state.active = false;
      state.submissionOpened = false;
      saveState();

      const ch = await client.channels.fetch(MOVIE_CHANNEL);
      if (ch) ch.send("MOTW stopped.");

      return message.channel.send("MOTW stopped.");
    }

    // ================= SESSION FLOW =================
    if (session) {

      // ================= PICK FLOW =================
      if (session.type === "pick") {

        const choice = parseInt(content);

        if (isNaN(choice) || choice < 0 || choice > 6) {
          return message.channel.send("Pick a number 0-6.");
        }

        if (choice === 0) {
          delete client.sessions[uid];
          return message.channel.send("Cancelled.");
        }

        const movie = session.results[choice - 1];

        if (!movie) {
          return message.channel.send("Invalid selection.");
        }

        const details = await getMovieDetails(movie.imdbID);

        delete client.sessions[uid];

        return message.channel.send(
`${details.Title} (${details.Year})
Director: ${details.Director}
Cast: ${details.Actors}
IMDB: https://www.imdb.com/title/${details.imdbID}/`
        );
      }

      // ================= MOTW STEP FLOW =================
      if (session.type === "motw") {

        if (session.step === 1 || session.step === 2) {

          const choice = parseInt(content);

          if (isNaN(choice) || choice < 0 || choice > 6) {
            return message.channel.send("Pick 0-6.");
          }

          if (choice === 0) {
            delete client.sessions[uid];
            return message.channel.send("Cancelled.");
          }

          const movie = session.results[choice - 1];

          if (!movie) {
            return message.channel.send("Invalid selection.");
          }

          session.selected.push(movie);

          if (session.step === 1) {
            session.step = 2;
            return message.channel.send("Now select Movie 2 (0-6):");
          }

          session.step = 3;

          return message.channel.send(
`Confirm:
1. ${session.selected[0].Title}
2. ${session.selected[1].Title}

Reply YES or NO`
          );
        }

        if (session.step === 3) {

          if (content.toLowerCase() === "no") {
            delete client.sessions[uid];
            return message.channel.send("Cancelled.");
          }

          if (content.toLowerCase() !== "yes") {
            return message.channel.send("YES or NO only.");
          }

          if (!state.submissions[uid]) state.submissions[uid] = [];

          session.selected.forEach(m => {
            if (state.submissions[uid].length < 2) {
              state.submissions[uid].push({
                title: m.Title,
                imdb: m.imdbID
              });
            }
          });

          saveState();
          delete client.sessions[uid];

          return message.channel.send("Movies submitted.");
        }
      }
    }

    // ================= LOOKUP =================
    if (content.startsWith("/lookup")) {

      const query = content.replace("/lookup", "").trim();
      if (!query) return message.channel.send("Provide a movie name.");

      const results = await searchMovies(query);

      if (!results.length) return message.channel.send("No results.");

      let msg = `Pick a movie (0-6):\n\n0: Cancel\n`;

      results.forEach((m, i) => {
        msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
      });

      client.sessions[uid] = {
        type: "pick",
        results
      };

      return message.channel.send(msg);
    }

    // ================= ENTER MOTW =================
    if (content === "/entermotw") {

      if (!state.active) {
        return message.channel.send("No active MOTW.");
      }

      if (!state.submissionOpened) {
        return message.channel.send("Submissions closed.");
      }

      client.sessions[uid] = {
        type: "motw",
        step: 1,
        results: [],
        selected: []
      };

      return message.channel.send("Enter Movie 1 search:");
    }

    // STEP SEARCH FOR MOTW
    if (session && session.type === "motw" && session.step <= 2 && typeof session.results.length === "number" && session.results.length === 0) {

      const results = await searchMovies(content);

      if (!results.length) {
        return message.channel.send("No results. Try again:");
      }

      session.results = results;

      let msg = `Pick Movie ${session.step} (0-6):\n\n0: Cancel\n`;

      results.forEach((m, i) => {
        msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
      });

      return message.channel.send(msg);
    }

  } catch (err) {
    console.log("Error:", err);
  }
});

client.login(process.env.TOKEN);
