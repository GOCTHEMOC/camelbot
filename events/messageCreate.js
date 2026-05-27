const axios = require("axios");
const { askAI } = require("../services/ai");
const { movieSearch } = require("../services/lookup");
const { loadState, saveState } = require("../motwEngine");

module.exports = (client) => {

client.on("messageCreate", async (message) => {

  // =========================
  // 1. BASIC SAFETY GUARD
  // =========================
  if (message.author.bot) return;

  const content = message.content.trim();
  const userId = message.author.id;

  const state = loadState();

  const session = client.sessions.get(userId);
  const pending = client.pendingLookups?.[userId];

  // =========================
  // 2. AI MENTION HANDLER (ONLY WHEN PINGED)
  // =========================
  if (message.mentions.has(client.user)) {

    const prompt = content
      .replace(`<@${client.user.id}>`, "")
      .trim();

    const response = await askAI(prompt);

    return message.reply(response);
  }

  // =========================
  // 3. LOOKUP FOLLOW-UP INPUT
  // =========================
  if (pending && pending.channelId === message.channel.id) {

    const num = parseInt(content);

    if (!isNaN(num)) {

      const movie = pending.results[num - 1];

      if (!movie) return message.reply("❌ Invalid selection.");

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

  // =========================
  // 4. COMMAND HANDLER (ALL /COMMANDS)
  // =========================
  if (content.startsWith("/")) {

    // HELP
    if (content === "/camelhelp") {
      return message.reply(
`🤖 Camelbot Commands

🎬 Movies
/lookup <movie>
/entermotw
/showmotw

🏆 Admin
/startmotw
/stopmotw

🤖 AI: @Camelbot`
      );
    }

    // LOOKUP
    if (content.startsWith("/lookup ")) {

      const query = content.replace("/lookup ", "").trim();

      if (!query) return message.reply("❌ Provide a movie name.");

      const results = await movieSearch(query);

      if (!results.length) return message.reply("❌ No results.");

      const top = results.slice(0, 6);

      let msg = "🎬 Pick a movie (1–6):\n\n";

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

    // SHOW MOTW
    if (content === "/showmotw") {

      let output = "🎬 MOTW SUBMISSIONS\n\n";

      const subs = state.submissions || {};

      if (Object.keys(subs).length === 0) {
        return message.reply(output + "No submissions yet.");
      }

      for (const id in subs) {
        output += `👤 ${id}\n`;
        subs[id].forEach((m, i) => {
          output += `${i + 1}. ${m}\n`;
        });
        output += "\n";
      }

      return message.reply(output);
    }

    // ENTER MOTW
    if (content === "/entermotw") {

      if (state.phase !== "submission") {
        return message.reply("❌ Submissions closed.");
      }

      client.sessions.set(userId, {
        type: "motw",
        step: 1,
        results: [],
        selected: []
      });

      return message.reply("🎬 Send your first movie search.");
    }

    return;
  }

  // =========================
  // 5. MOTW SESSION HANDLER
  // =========================
  if (session?.type === "motw") {

    // SEARCH STEP
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

    // PICK STEP
    if (session.step === "pick") {

      const num = parseInt(content);

      if (isNaN(num) || num < 1 || num > session.results.length) {
        return message.reply("❌ Invalid choice.");
      }

      const movie = session.results[num - 1];

      session.selected.push(movie.Title);

      if (session.selected.length === 2) {

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
