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

const { saveUser, getUser } = require("./database");

// ================= OPENAI =================
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

// ================= MOTW ENGINE =================
async function runMOTWCycle() {
  if (!state.active || !state.startTimestamp) return;

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID);

  const now = Date.now();
  const diffDays = Math.floor((now - state.startTimestamp) / (1000 * 60 * 60 * 24));

  try {

    if (diffDays >= 0 && !state.submissionOpened) {
      state.submissionOpened = true;

      await channel.send(
        `<@&${process.env.MOTW_ROLE_ID}> Submissions OPEN. Use /entermotw`
      );

      saveState();
    }

    if (diffDays >= 3 && !state.pollPosted) {
      const all = Object.values(state.submissions).flat();
      if (!all.length) return;

      const poll = await channel.send(
        `MOVIE POLL:\n\n` +
        all.map((m, i) => `${i + 1}. ${m}`).join("\n")
      );

      state.pollMessageId = poll.id;
      state.pollPosted = true;

      saveState();
    }

    if (diffDays >= 5 && !state.winnerPosted) {
      const poll = await channel.messages.fetch(state.pollMessageId);

      let top = null;
      let max = 0;

      for (const r of poll.reactions.cache.values()) {
        if (r.count > max) {
          max = r.count;
          top = r.emoji.name;
        }
      }

      await channel.send(`Winner: ${top}`);

      state.winnerPosted = true;
      saveState();
    }

    if (diffDays >= 7) {
      state.startTimestamp = Date.now();
      state.submissionOpened = false;
      state.pollPosted = false;
      state.winnerPosted = false;
      state.submissions = {};
      state.pollMessageId = null;

      saveState();
    }

  } catch (err) {
    console.log("MOTW error:", err);
  }
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);
  await runMOTWCycle();
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === 1;
  const isMention = message.mentions.users.has(client.user.id);

  try {

    // ================= CHANNEL LOCK =================
    const motwChannel = process.env.MOVIE_CHANNEL_ID;
    const isMOTWCommand =
      message.content.startsWith("/startmotw") ||
      message.content.startsWith("/entermotw");

    if (isMOTWCommand && message.channel.id !== motwChannel) {
      return message.reply("MOTW commands can only be used in the MOTW channel.");
    }

    // ================= HELP =================
    if (message.content.startsWith("/camelhelp")) {
      return message.reply(
`Commands:

/startmotw MM/DD/YYYY
/entermotw movie1, movie2
/lookup movie
/camelhelp

DM or mention bot for AI chat`
      );
    }

    // ================= LOOKUP =================
    if (message.content.startsWith("/lookup ")) {
      const q = message.content.replace("/lookup ", "").trim();

      const res = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${q}`
      );

      const movies = (res.data.Search || []).slice(0, 6);

      if (!movies.length) return message.reply("No results.");

      let text = "Results:\n\n";
      movies.forEach((m, i) => {
        text += `${i + 1}. ${m.Title} (${m.Year})\n`;
      });

      client.temp = client.temp || {};
      client.temp[message.author.id] = movies;

      return message.reply(text);
    }

    // ================= LOOKUP SELECT =================
    if (client.temp?.[message.author.id] && /^\d+$/.test(message.content)) {
      const i = parseInt(message.content);

      if (i === 0) {
        delete client.temp[message.author.id];
        return message.reply("Cancelled.");
      }

      const movie = client.temp[message.author.id][i - 1];
      if (!movie) return;

      const full = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${movie.imdbID}&plot=full`
      );

      const d = full.data;

      delete client.temp[message.author.id];

      return message.reply(
`Title: ${d.Title}
Year: ${d.Year}
Rated: ${d.Rated}
Runtime: ${d.Runtime}

Director: ${d.Director}
Cast: ${d.Actors}

IMDb Rating: ${d.imdbRating}

Plot: ${d.Plot}

IMDb: https://www.imdb.com/title/${d.imdbID}/`
      );
    }

    // ================= START MOTW =================
    if (message.content.startsWith("/startmotw")) {
      const arg = message.content.split(" ")[1];

      if (arg === "0/00/0000") {
        state.active = false;
        saveState();
        return message.reply("Stopped.");
      }

      const match = arg.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) return message.reply("Use MM/DD/YYYY");

      const [_, mm, dd, yyyy] = match;
      const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);

      state.active = true;
      state.startTimestamp = date.getTime();

      saveState();

      await runMOTWCycle();

      return message.reply("MOTW started.");
    }

    // ================= ENTER MOTW =================
    if (message.content.startsWith("/entermotw")) {
      const input = message.content.replace("/entermotw", "").trim();
      const movies = input.split(",").map(m => m.trim());

      const uid = message.author.id;

      if (!state.submissions[uid]) state.submissions[uid] = [];

      if (state.submissions[uid].length + movies.length > 2) {
        return message.reply("Max 2 movies allowed.");
      }

      state.submissions[uid].push(...movies);

      saveState();
      return message.reply("Saved.");
    }

    // ================= AI CHAT =================
    if (isDM || isMention) {
      const prompt = isMention
        ? message.content.replace(`<@${client.user.id}>`, "").trim()
        : message.content;

      if (!prompt) return;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are Camelbot, a helpful assistant in a movie Discord server."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });

      return message.reply(response.choices[0].message.content);
    }

  } catch (err) {
    console.log(err);
  }
});

// ================= LOOP =================
setInterval(() => {
  runMOTWCycle();
}, 60 * 60 * 1000);

// ================= LOGIN =================
client.login(process.env.TOKEN);
