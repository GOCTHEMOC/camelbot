const axios = require("axios");
const { askAI } = require("../services/ai");
const { movieSearch } = require("../services/lookup");
const { state, saveState } = require("../motwEngine");

module.exports = (client) => {

client.on("messageCreate", async (message) => {

  // =========================
  // 0. BASIC GUARD
  // =========================
  if (message.author.bot) return;

  const content = message.content.trim();
  const userId = message.author.id;

  const session = client.sessions.get(userId);
  const pending = client.pendingLookups?.[userId];

  const isPing = message.mentions.users.has(client.user.id);

  // =========================
  // 1. AI ROUTE (HARD STOP)
  // =========================
  if (isPing) {

    const prompt = content
      .replace(`<@${client.user.id}>`, "")
      .replace(`<@!${client.user.id}>`, "")
      .trim();

    const response = await askAI(prompt);

    return message.reply(response);
  }

  // =========================
  // 2. LOOKUP FOLLOW-UP
  // =========================
  if (pending && pending.channelId === message.channel.id) {

    if (!pending.results) return;

    const num = parseInt(content);

    if (isNaN(num)) {
      return message.reply("❌ Please reply with a number.");
    }

    if (num === 0) {
      delete client.pendingLookups[userId];
      return message.reply("❌ Lookup cancelled.");
    }

    if (num < 1 || num > pending.results.length) {
      delete client.pendingLookups[userId];
      return message.reply("❌ Invalid selection. Lookup cancelled.");
    }

    const movie = pending.results[num - 1];

    delete client.pendingLookups[userId];

    let full;

    try {
      full = await axios.get(
        `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${movie.imdbID}&plot=full`
      );
    } catch {
      return message.reply("❌ Failed to fetch movie details.");
    }

    const m = full.data;

    return message.reply(
`🎬 ${m.Title} (${m.Year})
Director: ${m.Director}
Cast: ${m.Actors}

IMDb: https://www.imdb.com/title/${m.imdbID}/`
    );
  }

  // =========================
  // 3. COMMANDS
  // =========================
  if (content.startsWith("/")) {

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

    if (content.startsWith("/lookup ")) {

      const query = content.replace("/lookup ", "").trim();

      if (!query) return message.reply("❌ Provide a movie name.");

      const results = await movieSearch(query);

      if (!results.length) return message.reply("❌ No results.");

      const top = results.slice(0, 6);

      let msg =
`🎬 Pick a movie (0–6)
0: Cancel

`;

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
  // 4. MOTW FLOW
  // =========================
  if (session?.type === "motw") {

    if (session.step === 1 || session.step === 2) {

      const results = await movieSearch(content);

      if (!results.length) {
        return message.reply("❌ No results.");
      }

      session.results = results.slice(0, 6);

      let msg =
`🎬 Pick Movie ${session.step} (0–6)
0: Cancel

`;

      session.results.forEach((m, i) => {
        msg += `${i + 1}. ${m.Title} (${m.Year})\n`;
      });

      session.step = "PICK";

      return message.reply(msg);
    }

    if (session.step === "PICK") {

      const num = parseInt(content);

      if (isNaN(num)) {
        return message.reply("❌ Please reply with a number.");
      }

      if (num === 0) {
        client.sessions.delete(userId);
        return message.reply("❌ Cancelled.");
      }

      if (num < 1 || num > session.results.length) {
        client.sessions.delete(userId);
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
