require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} = require("discord.js");

const axios = require("axios");
const fs = require("fs");

// ================= STATE =================
let state;
try {
  state = require("./motwState.json");
} catch {
  state = {
    active: false,
    startTimestamp: null,
    submissions: {},
    pollMessageId: null,
    pollPosted: false,
    winnerPosted: false,
    submissionOpened: false
  };
}

function saveState() {
  fs.writeFileSync("./motwState.json", JSON.stringify(state, null, 2));
}

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel]
});

// in-memory sessions
client.sessions = {};

// ================= OMDB =================
async function searchMovies(query) {
  try {
    const res = await axios.get(
      `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`
    );

    if (!res.data?.Search) return [];

    return res.data.Search.slice(0, 6);
  } catch (err) {
    console.log("OMDB search error:", err.message);
    return [];
  }
}

async function getMovie(id) {
  try {
    const res = await axios.get(
      `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${id}&plot=short`
    );

    return res.data;
  } catch (err) {
    console.log("OMDB fetch error:", err.message);
    return null;
  }
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  try {
    const ch = await client.channels.fetch(process.env.COMMAND_CHANNEL_ID);
    if (ch) ch.send("Camelbot is up.");
  } catch (err) {
    console.log("Failed to send startup message:", err.message);
  }
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    const uid = message.author.id;
    const content = message.content.trim();
    const session = client.sessions[uid];

    // =========================================================
    // SESSION FLOW HANDLER (LOOKUP + MOTW)
    // =========================================================
    if (session) {

      // ================= LOOKUP =================
      if (session.type === "lookup") {
        const choice = parseInt(content);

        if (isNaN(choice) || choice < 0 || choice > 6) {
          return message.reply("Pick a number 0–6.");
        }

        if (choice === 0) {
          delete client.sessions[uid];
          return message.reply("Cancelled.");
        }

        const movie = session.results?.[choice - 1];
        if (!movie) return message.reply("Invalid selection.");

        const details = await getMovie(movie.imdbID);
        delete client.sessions[uid];

        if (!details) return message.reply("Failed to fetch movie details.");

        return message.reply(
`${details.Title} (${details.Year})
Director: ${details.Director}
Cast: ${details.Actors}
IMDB: https://www.imdb.com/title/${details.imdbID}/`
        );
      }

      // ================= MOTW STATE MACHINE =================
      if (session.type === "motw") {

        const choice = parseInt(content);

        // ---------------- STEP 1 & 2: PICK MOVIES ----------------
        if (session.step === 1 || session.step === 2) {

          if (isNaN(choice) || choice < 0 || choice > 6) {
            return message.reply("Pick a number 0–6.");
          }

          if (choice === 0) {
            delete client.sessions[uid];
            return message.reply("Cancelled.");
          }

          const movie = session.results?.[choice - 1];
          if (!movie) return message.reply("Invalid selection.");

          session.selected.push(movie);

          // STEP 1 → STEP 2
          if (session.step === 1) {
            session.step = 2;
            session.results = null;
            return message.reply("Now enter Movie 2 search:");
          }

          // STEP 2 → CONFIRM
          session.step = 3;

          return message.reply(
`Confirm:
1. ${session.selected[0]?.Title}
2. ${session.selected[1]?.Title}

Reply YES or NO`
          );
        }

        // ---------------- STEP 3: CONFIRMATION ----------------
        if (session.step === 3) {

          const lower = content.toLowerCase();

          if (lower === "no") {
            delete client.sessions[uid];
            return message.reply("Cancelled.");
          }

          if (lower !== "yes") {
            return message.reply("Reply YES or NO.");
          }

          state.submissions ??= {};
          if (!state.submissions[uid]) state.submissions[uid] = [];

          for (const m of session.selected) {
            if (state.submissions[uid].length < 2) {
              state.submissions[uid].push({
                title: m.Title,
                imdb: m.imdbID
              });
            }
          }

          saveState();
          delete client.sessions[uid];

          return message.reply("Movies submitted successfully.");
        }
      }
    }

    // =========================================================
    // COMMANDS
    // =========================================================

    if (content === "/camelhelp") {
      return message.reply("/lookup, /entermotw, /startmotw, /stopmotw");
    }

    if (content === "/startmotw") {
      state.active = true;
      state.submissionOpened = true;
      state.submissions = {};
      state.startTimestamp = Date.now();
      saveState();

      return message.reply("MOTW started.");
    }

    if (content === "/stopmotw") {
      state.active = false;
      state.submissionOpened = false;
      saveState();

      return message.reply("MOTW stopped.");
    }

    // =========================================================
    // LOOKUP COMMAND
    // =========================================================
    if (content.startsWith("/lookup")) {
      const query = content.replace("/lookup", "").trim();
      if (!query) return message.reply("Provide a movie name.");

      const results = await searchMovies(query);
      if (!results.length) return message.reply("No results.");

      client.sessions[uid] = {
        type: "lookup",
        results
      };

      let msg = "Pick 0–6:\n0: Cancel\n";
      results.forEach((m, i) => {
        msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
      });

      return message.reply(msg);
    }

    // =========================================================
    // ENTER MOTW
    // =========================================================
    if (content === "/entermotw") {

      if (!state.active) return message.reply("No active MOTW.");
      if (!state.submissionOpened) return message.reply("Closed.");

      client.sessions[uid] = {
        type: "motw",
        step: 1,
        results: null,
        selected: []
      };

      return message.reply("Enter Movie 1 search:");
    }

    // =========================================================
    // MOTW SEARCH HANDLER
    // =========================================================
    if (
      session?.type === "motw" &&
      (session.step === 1 || session.step === 2) &&
      !session.results
    ) {
      const results = await searchMovies(content);

      if (!results.length) {
        return message.reply("No results. Try again:");
      }

      session.results = results;

      let msg = `Pick Movie ${session.step} (0–6):\n0: Cancel\n`;

      results.forEach((m, i) => {
        msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
      });

      return message.reply(msg);
    }

  } catch (err) {
    console.log("Error:", err);
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
