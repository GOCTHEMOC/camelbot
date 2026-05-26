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

client.sessions = {};

// ================= OMDB SEARCH =================
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

  try {
    const channel = await client.channels.fetch(process.env.COMMAND_CHANNEL_ID);
    if (channel) channel.send("Camelbot is up.");
  } catch (err) {
    console.log("Startup error:", err);
  }
});

// ================= MAIN HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    const uid = message.author.id;
    const content = message.content.trim();

    const session = client.sessions[uid];

    // ================= HELP =================
    if (content === "/camelhelp") {
      return message.reply(
`Commands:
/lookup <movie>
/entermotw
/startmotw
/stopmotw`
      );
    }

    // ================= START MOTW =================
    if (content === "/startmotw") {
      state.active = true;
      state.submissionOpened = true;
      state.submissions = {};
      saveState();

      return message.reply("MOTW started. Submissions open.");
    }

    // ================= STOP MOTW =================
    if (content === "/stopmotw") {
      state.active = false;
      state.submissionOpened = false;
      saveState();

      return message.reply("MOTW stopped.");
    }

    // ================= LOOKUP (TOP 6 + PICK SYSTEM) =================
    if (content.startsWith("/lookup")) {

      const query = content.replace("/lookup", "").trim();
      if (!query) return message.reply("Provide a movie name.");

      const results = await searchMovies(query);

      if (!results.length) {
        return message.reply("No results found.");
      }

      client.sessions[uid] = {
        type: "lookup",
        results
      };

      let msg = `Pick a movie (0–6):\n\n0: Cancel\n`;

      results.forEach((m, i) => {
        msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
      });

      return message.reply(msg);
    }

    // ================= ENTER MOTW =================
    if (content === "/entermotw") {

      if (!state.active) {
        return message.reply("No active MOTW.");
      }

      if (!state.submissionOpened) {
        return message.reply("Submissions are closed.");
      }

      client.sessions[uid] = {
        type: "motw",
        step: 1,
        results: null,
        selected: []
      };

      return message.reply("Enter Movie 1 search:");
    }

    // ================= SESSION HANDLER =================
    if (session) {

      // ================= LOOKUP PICK =================
      if (session.type === "lookup") {

        const choice = parseInt(content);

        if (isNaN(choice) || choice < 0 || choice > 6) {
          return message.reply("Pick a number 0–6.");
        }

        if (choice === 0) {
          delete client.sessions[uid];
          return message.reply("Cancelled.");
        }

        const movie = session.results[choice - 1];

        if (!movie) {
          return message.reply("Invalid selection.");
        }

        const details = await getMovieDetails(movie.imdbID);

        delete client.sessions[uid];

        return message.reply(
`${details.Title} (${details.Year})
Director: ${details.Director}
Cast: ${details.Actors}
IMDB: https://www.imdb.com/title/${details.imdbID}/`
        );
      }

      // ================= MOTW FLOW =================
      if (session.type === "motw") {

        // STEP 1 SEARCH
        if (session.step === 1 || session.step === 2) {

          const results = await searchMovies(content);

          if (!results.length) {
            return message.reply("No results found. Try again:");
          }

          session.results = results;

          let msg = `Pick Movie ${session.step} (0–6):\n\n0: Cancel\n`;

          results.forEach((m, i) => {
            msg += `${i + 1}: ${m.Title} (${m.Year})\n`;
          });

          return message.reply(msg);
        }

        // STEP 1/2 PICK
        if (session.step === 1 || session.step === 2) {

          const choice = parseInt(content);

          if (isNaN(choice) || choice < 0 || choice > 6) {
            return message.reply("Pick 0–6.");
          }

          if (choice === 0) {
            delete client.sessions[uid];
            return message.reply("Cancelled.");
          }

          const movie = session.results?.[choice - 1];

          if (!movie) {
            return message.reply("Invalid selection.");
          }

          session.selected.push(movie);
          session.results = null;

          if (session.step === 1) {
            session.step = 2;
            return message.reply("Enter Movie 2 search:");
          }

          session.step = 3;

          return message.reply(
`Confirm:
1. ${session.selected[0].Title}
2. ${session.selected[1].Title}

Reply YES or NO`
          );
        }

        // CONFIRM
        if (session.step === 3) {

          if (content.toLowerCase() === "no") {
            delete client.sessions[uid];
            return message.reply("Cancelled.");
          }

          if (content.toLowerCase() !== "yes") {
            return message.reply("Reply YES or NO.");
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

          return message.reply("Movies submitted successfully.");
        }
      }
    }

    // ================= AI CHAT =================
    if (message.mentions.users.has(client.user.id)) {

      const prompt = content.replace(`<@${client.user.id}>`, "").trim();

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
    console.log("Handler error:", err);
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
