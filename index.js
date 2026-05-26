require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} = require("discord.js");

const axios = require("axios");
const fs = require("fs");
const db = require("./database");

// ================= STATE =================
let state;
try {
  state = require("./motwState.json");
} catch {
  state = {
    active: false,
    submissionOpened: false,
    submissions: {},
    startTimestamp: null
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

client.sessions = new Map();

// ================= OMDB =================
async function searchMovies(query) {
  try {
    const res = await axios.get(
      `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`
    );
    return res.data?.Search?.slice(0, 6) || [];
  } catch {
    return [];
  }
}

async function getMovie(id) {
  try {
    const res = await axios.get(
      `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${id}&plot=short`
    );
    return res.data;
  } catch {
    return null;
  }
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.find(c => c.name === "verify");
  if (!channel) return;

  const msg = await channel.send(
    `👋 Welcome!\n\n` +
    `👍 React = Verified role\n` +
    `🎬 React = Submit Letterboxd\n\n` +
    `Then send your link in DMs.`
  );

  await msg.react("👍");
  await msg.react("🎬");

  client.verifyMessageId = msg.id;
});

// ================= COMMANDS =================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const uid = message.author.id;
  const content = message.content.trim();
  const session = client.sessions.get(uid);

  // ================= GLOBAL COMMANDS =================

  if (content === "/startmotw") {
    state.active = true;
    state.submissionOpened = true;
    state.submissions = {};
    state.startTimestamp = Date.now();
    saveState();

    const ch = message.guild?.channels.cache.find(c => c.name === "general");
    if (ch) ch.send("🏆 MOTW has started!");

    return message.reply("MOTW started.");
  }

  if (content === "/stopmotw") {
    state.active = false;
    state.submissionOpened = false;
    saveState();
    return message.reply("MOTW stopped.");
  }

  if (content === "/viewmotw") {
    const subs = state.submissions || {};
    if (!Object.keys(subs).length) return message.reply("No submissions.");

    let out = "🏆 MOTW:\n\n";

    for (const [id, movies] of Object.entries(subs)) {
      out += `<@${id}>:\n`;

      if (movies?.[0]) out += `1. ${movies[0].title}\n`;
      if (movies?.[1]) out += `2. ${movies[1].title}\n`;

      out += "\n";
    }

    return message.reply(out);
  }

  if (content.startsWith("/lookup")) {
    const query = content.replace("/lookup", "").trim();
    if (!query) return message.reply("Provide a movie name.");

    const results = await searchMovies(query);
    if (!results.length) return message.reply("No results.");

    client.sessions.set(uid, {
      type: "lookup",
      results
    });

    let msg = "Pick:\n0 Cancel\n";
    results.forEach((m, i) => {
      msg += `${i + 1}: ${m.Title}\n`;
    });

    return message.reply(msg);
  }

  if (content === "/entermotw") {
    if (!state.active) return message.reply("MOTW not active.");

    client.sessions.set(uid, {
      type: "motw",
      step: 1,
      results: null,
      selected: []
    });

    return message.reply("Enter Movie 1 search:");
  }

  if (!session) return;

  // ================= LOOKUP FLOW =================
  if (session.type === "lookup") {
    const choice = parseInt(content);

    if (choice === 0) {
      client.sessions.delete(uid);
      return message.reply("Cancelled.");
    }

    const movie = session.results?.[choice - 1];
    if (!movie) return message.reply("Invalid.");

    const details = await getMovie(movie.imdbID);
    client.sessions.delete(uid);

    return message.reply(`${details.Title} (${details.Year})`);
  }

  // ================= MOTW FLOW =================
  if (session.type === "motw") {

    const choice = parseInt(content);

    // STEP 1 SEARCH
    if (session.step === 1 && !session.results) {
      const results = await searchMovies(content);
      if (!results.length) return message.reply("No results.");

      session.results = results;

      let msg = "Pick Movie 1:\n0 Cancel\n";
      results.forEach((m, i) => msg += `${i + 1}: ${m.Title}\n`);

      return message.reply(msg);
    }

    // PICK 1
    if (session.step === 1) {
      if (choice === 0) return client.sessions.delete(uid);

      session.selected.push(session.results[choice - 1]);
      session.results = null;
      session.step = 2;

      return message.reply("Enter Movie 2 search:");
    }

    // STEP 2 SEARCH
    if (session.step === 2 && !session.results) {
      const results = await searchMovies(content);
      if (!results.length) return message.reply("No results.");

      session.results = results;

      let msg = "Pick Movie 2:\n0 Cancel\n";
      results.forEach((m, i) => msg += `${i + 1}: ${m.Title}\n`);

      return message.reply(msg);
    }

    // PICK 2 + CONFIRM
    if (session.step === 2) {
      if (choice === 0) return client.sessions.delete(uid);

      session.selected.push(session.results[choice - 1]);

      state.submissions[uid] = session.selected.map(m => ({
        title: m.Title,
        imdb: m.imdbID
      }));

      saveState();
      client.sessions.delete(uid);

      return message.reply("Submitted.");
    }
  }
});

// ================= REACTIONS (VERIFY SYSTEM) =================
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();

    if (reaction.message.id !== client.verifyMessageId) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);

    // 👍 VERIFY ROLE
    if (reaction.emoji.name === "👍") {
      const role = guild.roles.cache.find(r => r.name === "Letterboxd");
      if (role) await member.roles.add(role);

      await user.send("Send your Letterboxd link in DM.");
    }

    // 🎬 PROMPT + DB LINK FLOW
    if (reaction.emoji.name === "🎬") {
      await user.send("Send Letterboxd link:");
    }

  } catch (err) {
    console.log(err);
  }
});

// ================= DM LETTERBOXD SAVE =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild) return;

  const url = message.content.trim();
  const regex = /^https:\/\/letterboxd\.com\/[A-Za-z0-9_-]+\/$/;

  if (!regex.test(url)) {
    return message.reply("Invalid Letterboxd URL.");
  }

  const exists = db.prepare(
    "SELECT * FROM users WHERE letterboxd = ?"
  ).get(url);

  if (exists) {
    return message.reply("Already linked.");
  }

  db.prepare(
    "INSERT INTO users (discord_id, letterboxd) VALUES (?, ?)"
  ).run(message.author.id, url);

  const guild = client.guilds.cache.first();
  const member = await guild.members.fetch(message.author.id);

  const role = guild.roles.cache.find(r => r.name === "Letterboxd");
  if (role) await member.roles.add(role);

  return message.reply("Verified Letterboxd!");
});

client.login(process.env.TOKEN);
