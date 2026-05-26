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
    submissionOpened: false
  };
}

function saveState() {
  fs.writeFileSync("./motwState.json", JSON.stringify(state, null, 2));
}

// ================= MOTW FSM =================
const MOTW_STATE = {
  SEARCH_1: "SEARCH_1",
  PICK_1: "PICK_1",
  SEARCH_2: "SEARCH_2",
  PICK_2: "PICK_2",
  CONFIRM: "CONFIRM"
};

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.sessions = new Map();

// cleanup stale sessions (10 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of client.sessions.entries()) {
    if (now - s.createdAt > 10 * 60 * 1000) {
      client.sessions.delete(id);
    }
  }
}, 60 * 1000);

// ================= OMDB =================
async function searchMovies(query) {
  try {
    const res = await axios.get(
      `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`
    );

    if (!res.data?.Search) return [];
    return res.data.Search.slice(0, 6);
  } catch {
    return [];
  }
}

async function getMovie(id) {
  try {
    const res = await axios.get(
      `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${id}&plot=short`
    );

    return res.data || null;
  } catch {
    return null;
  }
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  try {
    const ch = await client.channels.fetch(process.env.COMMAND_CHANNEL_ID);
    if (ch) ch.send("Camelbot is up.");
  } catch {}
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    const uid = message.author.id;
    const content = message.content.trim();
    const session = client.sessions.get(uid);

    // =====================================================
    // NO SESSION COMMANDS
    // =====================================================
    if (!session) {

      if (content === "/camelhelp") {
        return message.reply("/lookup, /entermotw, /startmotw, /stopmotw, /viewmotw");
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

      // ================= VIEW MOTW =================
      if (content === "/viewmotw") {

        const subs = state.submissions;

        if (!subs || Object.keys(subs).length === 0) {
          return message.reply("No MOTW submissions yet.");
        }

        let output = "🏆 MOTW Submissions:\n\n";

        for (const [userId, movies] of Object.entries(subs)) {

          output += `<@${userId}>:\n`;

          if (!Array.isArray(movies) || movies.length === 0) {
            output += `No movies submitted\n\n`;
            continue;
          }

          if (movies[0]) {
            output += `1. ${movies[0].title} https://www.imdb.com/title/${movies[0].imdb}/\n`;
          }

          if (movies[1]) {
            output += `2. ${movies[1].title} https://www.imdb.com/title/${movies[1].imdb}/\n`;
          }

          output += "\n";
        }

        return message.reply(output);
      }

      // ================= LOOKUP START =================
      if (content.startsWith("/lookup")) {
        const query = content.replace("/lookup", "").trim();
        if (!query) return message.reply("Provide a movie name.");

        const results = await searchMovies(query);
        if (!results.length) return message.reply("No results.");

        client.sessions.set(uid, {
          type: "lookup",
          results,
          createdAt: Date.now()
        });

        let msg = "Pick 0–6:\n0: Cancel\n";
        results.forEach((m, i) => {
          msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
        });

        return message.reply(msg);
      }

      // ================= ENTER MOTW =================
      if (content === "/entermotw") {

        if (!state.active) return message.reply("No active MOTW.");
        if (!state.submissionOpened) return message.reply("Closed.");

        client.sessions.set(uid, {
          type: "motw",
          state: MOTW_STATE.SEARCH_1,
          selected: [],
          results: null,
          createdAt: Date.now()
        });

        return message.reply("Enter Movie 1 search:");
      }

      return;
    }

    // =====================================================
    // LOOKUP FLOW
    // =====================================================
    if (session.type === "lookup") {

      const choice = parseInt(content);

      if (isNaN(choice) || choice < 0 || choice > session.results.length) {
        return message.reply("Invalid selection.");
      }

      if (choice === 0) {
        client.sessions.delete(uid);
        return message.reply("Cancelled.");
      }

      const movie = session.results[choice - 1];
      const details = await getMovie(movie.imdbID);

      client.sessions.delete(uid);

      if (!details) return message.reply("Failed to fetch movie.");

      return message.reply(
`${details.Title} (${details.Year})
Director: ${details.Director}
Cast: ${details.Actors}
IMDB: https://www.imdb.com/title/${details.imdbID}/`
      );
    }

    // =====================================================
    // MOTW FLOW (FSM)
    // =====================================================
    if (session.type === "motw") {

      const choice = parseInt(content);

      // ---------------- SEARCH 1 ----------------
      if (session.state === MOTW_STATE.SEARCH_1) {

        const results = await searchMovies(content);
        if (!results.length) return message.reply("No results. Try again:");

        session.results = results;
        session.state = MOTW_STATE.PICK_1;

        let msg = "Pick Movie 1:\n0: Cancel\n";
        results.forEach((m, i) => {
          msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
        });

        return message.reply(msg);
      }

      // ---------------- PICK 1 ----------------
      if (session.state === MOTW_STATE.PICK_1) {

        if (isNaN(choice) || choice < 0 || choice > session.results.length) {
          return message.reply("Invalid selection.");
        }

        if (choice === 0) {
          client.sessions.delete(uid);
          return message.reply("Cancelled.");
        }

        session.selected.push(session.results[choice - 1]);
        session.results = null;
        session.state = MOTW_STATE.SEARCH_2;

        return message.reply("Enter Movie 2 search:");
      }

      // ---------------- SEARCH 2 ----------------
      if (session.state === MOTW_STATE.SEARCH_2) {

        const results = await searchMovies(content);
        if (!results.length) return message.reply("No results. Try again:");

        session.results = results;
        session.state = MOTW_STATE.PICK_2;

        let msg = "Pick Movie 2:\n0: Cancel\n";
        results.forEach((m, i) => {
          msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
        });

        return message.reply(msg);
      }

      // ---------------- PICK 2 ----------------
      if (session.state === MOTW_STATE.PICK_2) {

        if (isNaN(choice) || choice < 0 || choice > session.results.length) {
          return message.reply("Invalid selection.");
        }

        if (choice === 0) {
          client.sessions.delete(uid);
          return message.reply("Cancelled.");
        }

        session.selected.push(session.results[choice - 1]);
        session.results = null;
        session.state = MOTW_STATE.CONFIRM;

        return message.reply(
`Confirm:
1. ${session.selected[0].Title}
2. ${session.selected[1].Title}

Reply YES or NO`
        );
      }

      // ---------------- CONFIRM ----------------
      if (session.state === MOTW_STATE.CONFIRM) {

        const lower = content.toLowerCase();

        if (lower === "no") {
          client.sessions.delete(uid);
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
        client.sessions.delete(uid);

        return message.reply("Movies submitted successfully.");
      }
    }

  } catch (err) {
    console.log("Error:", err);
  }
});

client.login(process.env.TOKEN);
