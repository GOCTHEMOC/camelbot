require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} = require("discord.js");

const axios = require("axios");
const fs = require("fs");

const { saveUser, getUser } = require("./database");

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

  const now = new Date();
  const start = new Date(state.startTimestamp);

  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const cycleDay = diffDays % 7;

  try {

    // DAY 0 - SUBMISSIONS OPEN
    if (cycleDay === 0 && !state.submissionOpened) {
      state.submissions = {};
      state.pollPosted = false;
      state.winnerPosted = false;
      state.submissionOpened = true;

      await channel.send(
        `<@&${process.env.MOTW_ROLE_ID}> 🎬 Submissions OPEN (/entermotw)`
      );

      saveState();
    }

    // DAY 3 - POLL
    if (cycleDay === 3 && !state.pollPosted) {
      const all = Object.values(state.submissions).flat();

      if (!all.length) return;

      const poll = await channel.send(
`📊 MOVIE POLL:\n\n` +
all.map((m, i) => `${i + 1}️⃣ ${m}`).join("\n")
      );

      state.pollMessageId = poll.id;
      state.pollPosted = true;

      saveState();
    }

    // DAY 4 - WINNER
    if (cycleDay === 4 && state.pollPosted && !state.winnerPosted) {
      const poll = await channel.messages.fetch(state.pollMessageId);

      let top = null;
      let max = 0;

      for (const r of poll.reactions.cache.values()) {
        if (r.count > max) {
          max = r.count;
          top = r.emoji.name;
        }
      }

      await channel.send(`🏆 Winner: ${top}`);

      state.winnerPosted = true;
      saveState();
    }

    // RESET
    if (cycleDay === 6) {
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
let verifyMessageId = null;

client.once(Events.ClientReady, async () => {
  console.log(`Camelbot online as ${client.user.tag}`);

  const channel = await client.channels.fetch(process.env.VERIFY_CHANNEL_ID);

  const msg = await channel.send(
`Hello! Welcome to Gohith's movie server.

React 👍 to verify.
React 🎬 to link Letterboxd.`
  );

  verifyMessageId = msg.id;

  // 🔥 RUN IMMEDIATELY ON START
  await runMOTWCycle();
});

// ================= REACTIONS =================
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.message.id !== verifyMessageId) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);

  if (reaction.emoji.name === "👍") {
    const role = guild.roles.cache.find(r => r.name === "verified");
    if (role) await member.roles.add(role);
  }

  if (reaction.emoji.name === "🎬") {
    user.send("Send your Letterboxd link:");
  }
});

// ================= MESSAGE HANDLER =================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 🔒 COMMAND LOCK
  const allowedChannel = process.env.COMMAND_CHANNEL_ID;

  if (
    message.guild &&
    message.content.startsWith("/") &&
    message.channel.id !== allowedChannel
  ) return;

  if (!message.guild) return;

  try {

    // ================= LETTERBOXD DM =================
    if (message.channel.type === 1) {
      const link = message.content.trim();

      const old = getUser(message.author.id);
      saveUser(message.author.id, link);

      const channel = await client.channels.fetch(process.env.LETTERBOXD_CHANNEL_ID);

      if (old?.letterboxd) {
        await channel.send(`♻️ <@${message.author.id}> updated: ${link}`);
      } else {
        await channel.send(`<@${message.author.id}> linked: ${link}`);
      }

      return message.reply("Saved Letterboxd.");
    }

    // ================= START MOTW =================
    if (message.content.startsWith("/startmotw")) {
      const arg = message.content.split(" ")[1];

      if (arg === "0/00/0000") {
        state.active = false;
        saveState();
        return message.reply("❌ MOTW stopped.");
      }

      const match = arg.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

      if (!match) {
        return message.reply("❌ Use MM/DD/YYYY");
      }

      const [_, mm, dd, yyyy] = match;

      const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);

      if (isNaN(date.getTime())) {
        return message.reply("❌ Invalid date.");
      }

      state.active = true;
      state.startTimestamp = date.getTime();

      saveState();

      await runMOTWCycle();

      return message.reply(`🎬 MOTW started: ${arg}`);
    }

    // ================= ENTER MOTW =================
    if (message.content.startsWith("/entermotw")) {
      if (!state.active) return message.reply("MOTW not active.");

      const input = message.content.replace("/entermotw", "").trim();
      const movies = input.split(",").map(m => m.trim());

      if (movies.length > 2) return message.reply("Max 2 movies.");

      const uid = message.author.id;

      if (!state.submissions[uid]) state.submissions[uid] = [];

      if (state.submissions[uid].length + movies.length > 2) {
        return message.reply("Max 2 per user.");
      }

      state.submissions[uid].push(...movies);
      saveState();

      return message.reply("Movies submitted.");
    }

    // ================= LOOKUP =================
    if (message.content.startsWith("/lookup ")) {
      const q = message.content.replace("/lookup ", "");

      const res = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${q}`
      );

      const movies = (res.data.Search || []).slice(0, 6);

      if (!movies.length) return message.reply("No results.");

      let text = "Are you looking for:\n\n";
      movies.forEach((m, i) => {
        text += `${i + 1}. ${m.Title} (${m.Year})\n`;
      });

      text += "\nReply 1–6 or 0.";

      message.reply(text);

      client.temp = client.temp || {};
      client.temp[message.author.id] = movies;
    }

    // ================= SELECT =================
    const temp = client.temp?.[message.author.id];

    if (temp && /^\d+$/.test(message.content)) {
      const i = parseInt(message.content);

      if (i === 0) {
        delete client.temp[message.author.id];
        return message.reply("Cancelled.");
      }

      const movie = temp[i - 1];
      if (!movie) return;

      const full = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${movie.imdbID}&plot=full`
      );

      delete client.temp[message.author.id];

      return message.reply(
`🎬 ${full.data.Title} (${full.data.Year})

⭐ ${full.data.imdbRating}
🎭 ${full.data.Genre}
🎬 ${full.data.Director}

📝 ${full.data.Plot}`
      );
    }

  } catch (err) {
    console.log("Handler error:", err);
  }
});

// ================= LOOP =================
setInterval(() => {
  runMOTWCycle();
}, 60 * 60 * 1000);

// ================= LOGIN =================
client.login(process.env.TOKEN);
