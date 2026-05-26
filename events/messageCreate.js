const axios = require("axios");

const {
  movieSearch
} = require("../services/lookup");

const {
  askAI
} = require("../services/ai");

const {
  loadState,
  saveState,
  stopMOTW
} = require("../motwEngine");

module.exports = (client) => {

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  const content = message.content.trim();
  const userId = message.author.id;

  const state = loadState();

  // =========================
  // 🤖 AI CHAT (MENTION BOT)
  // =========================
  if (message.mentions.has(client.user)) {

    const prompt = content.replace(`<@${client.user.id}>`, "");

    const response = await askAI(prompt);

    return message.reply(response);
  }

  // =========================
  // 🎬 LOOKUP FOLLOW-UP (FIXED BUG)
  // =========================
  const pending = client.pendingLookups?.[userId];

  if (pending && pending.channelId === message.channel.id) {

    const num = parseInt(content);

    if (!isNaN(num)) {

      const movie = pending.results[num - 1];

      if (!movie) {
        return message.reply("❌ Invalid selection.");
      }

      delete client.pendingLookups[userId];

      const full = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${movie.imdbID}&plot=full`
      );

      const m = full.data;

      return message.reply(
`🎬 ${m.Title} (${m.Year})
Director: ${m.Director}
Cast: ${m.Actors}

IMDb: https://www.imdb.com/title/${m.imdbID}/`
      );
    }
  }
if (content === "/camelhelp") {
  return message.reply(
`🤖 Camelbot Command Directory

🎬 Movie Commands
/lookup <movie>
/entermotw
/showmotw

🏆 Admin (camelcommands only)
/startmotw
/stopmotw

🔐 Verification
👍 Verified role
🎬 Letterboxd DM flow

🤖 AI
@Camelbot → chat`
  );
}
  // =========================
  // 🏆 START MOTW
  // =========================
  if (content === "/startmotw") {

    if (message.channel.name !== "camel-commands") {
      return message.reply("❌ Use #camelcommands");
    }

    const motw = require("../motwEngine");
    motw.startSubmission(client);

    return message.reply("🎬 MOTW started.");
  }

  // =========================
  // 🛑 STOP MOTW
  // =========================
  if (content === "/stopmotw") {

    if (message.channel.name !== "camelcommands") {
      return message.reply("❌ Use #camelcommands");
    }

    stopMOTW();

    return message.reply("🛑 MOTW stopped.");
  }

  // =========================
  // 📊 SHOW MOTW
  // =========================
  if (content === "/showmotw") {

    let output = `🎬 MOTW STATUS\n\nPhase: ${state.phase}\n\n`;

    const subs = state.submissions;

    if (!subs || Object.keys(subs).length === 0) {
      return message.reply(output + "No submissions yet.");
    }

    for (const userId in subs) {

      const member = await message.guild.members
        .fetch(userId)
        .catch(() => null);

      const name = member ? member.user.username : userId;

      output += `👤 ${name}\n`;

      subs[userId].forEach((movie, i) => {
        output += `${i + 1}. ${movie}\n`;
      });

      output += "\n";
    }

    return message.reply(output);
  }

  // =========================
  // 🔎 LOOKUP COMMAND
  // =========================
  if (content.startsWith("/lookup ")) {

    const query = content.replace("/lookup ", "").trim();

    if (!query) {
      return message.reply("❌ Provide a movie name.");
    }

    const results = await movieSearch(query);

    if (!results.length) {
      return message.reply("❌ No results found.");
    }

    const top = results.slice(0, 6);

    let msg = "🎬 Pick a movie (reply 1–6):\n\n";

    top.forEach((m, i) => {
      msg += `${i + 1}. ${m.Title} (${m.Year})\n`;
    });

    client.pendingLookups = client.pendingLookups || {};
    client.pendingLookups[userId] = {
      results: top,
      channelId: message.channel.id
    };

    return message.reply(msg);
  }

  // =========================
  // 🎬 ENTER MOTW
  // =========================
  if (content === "/entermotw") {

    if (message.channel.name !== "movieoftheweek") {
      return message.reply("❌ Only in #movieoftheweek");
    }

    if (state.phase !== "submission") {
      return message.reply("❌ Submissions are closed.");
    }

    client.sessions.set(userId, {
      type: "motw",
      step: 1,
      results: [],
      selected: []
    });

    return message.reply("🎬 Send your first movie search.");
  }

  // =========================
  // 🧠 MOTW SESSION HANDLER
  // =========================
  const session = client.sessions.get(userId);

  if (session?.type === "motw") {

    // STEP: SEARCH PHASE
    if (session.step === 1 || session.step === 2) {

      const results = await movieSearch(content);

      if (!results.length) {
        return message.reply("❌ No results. Try again.");
      }

      const top = results.slice(0, 6);
      session.results = top;

      let msg = `🎬 Pick Movie ${session.step} (1–6):\n\n`;

      top.forEach((m, i) => {
        msg += `${i + 1}. ${m.Title} (${m.Year})\n`;
      });

      session.step = "pick";

      return message.reply(msg);
    }

    // STEP: PICK PHASE
    if (session.step === "pick") {

      const num = parseInt(content);

      if (isNaN(num) || num < 1 || num > session.results.length) {
        return message.reply("❌ Invalid choice.");
      }

      const movie = session.results[num - 1];

      session.selected.push(movie.Title);

      // SECOND MOVIE DONE
      if (session.selected.length >= 2) {

        state.submissions[userId] = session.selected;
        saveState(state);

        client.sessions.delete(userId);

        return message.reply(
`✅ Submitted:

1. ${session.selected[0]}
2. ${session.selected[1]}`
        );
      }

      session.step = 2;

      return message.reply("🎬 Now search your SECOND movie.");
    }
  }

});
};
