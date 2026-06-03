const axios = require("axios");
const { askAI } = require("../services/ai");
const { movieSearch } = require("../services/lookup");
const motw = require("../motwEngine");

module.exports = (client) => {

client.on("messageCreate", async (message) => {

  // =========================
  // 0. BASIC GUARD
  // =========================
  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content.trim();
  const userId = message.author.id;

  const session = client.sessions.get(userId);
  const pending = client.pendingLookups?.[userId];

  const isPing = message.mentions.users.has(client.user.id);

  // =========================
  // 1. AI ROUTE (ONLY ON PING)
  // =========================
  if (isPing) {
    try {
      const prompt = content
        .replace(`<@${client.user.id}>`, "")
        .replace(`<@!${client.user.id}>`, "")
        .trim();

      if (!prompt) return message.reply("🤖 Ask me something.");

      const response = await askAI(prompt);

      return message.reply(String(response).slice(0, 1900));

    } catch (err) {
      console.error("AI ERROR:", err);
      return message.reply("❌ AI error occurred.");
    }
  }

  // =========================
  // 2. LOOKUP FOLLOW-UP
  // =========================
  if (pending && pending.channelId === message.channel.id) {

    const num = parseInt(content);

    if (isNaN(num)) {
      return message.reply("❌ Please reply with a number.");
    }

    if (num === 0) {
      delete client.pendingLookups[userId];
      return message.reply("❌ Lookup cancelled.");
    }

    if (!pending.results || num < 1 || num > pending.results.length) {
      delete client.pendingLookups[userId];
      return message.reply("❌ Invalid selection.");
    }

    const movie = pending.results[num - 1];
    delete client.pendingLookups[userId];

    try {
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

    } catch (err) {
      console.error("❌ Failed to fetch movie details:", err);
      return message.reply("❌ Failed to fetch movie details.");
    }
  }

  // =========================
  // 3. COMMANDS
  // =========================
  if (content.startsWith("/")) {

    const isCommandChannel =
      message.channel.id === process.env.COMMAND_CHANNEL_ID;

    // =========================
    // START MOTW (LOCKED)
    // =========================
    if (content === "/startmotw") {

      if (!isCommandChannel) {
        return message.reply("ur not a mod sybau");
      }

      try {
        motw.startMOTW(client);
        return message.reply("🎬 MOTW started.");
      } catch (err) {
        console.error("❌ Failed to start MOTW:", err);
        return message.reply("❌ Failed to start MOTW.");
      }
    }

    // =========================
    // STOP MOTW (LOCKED)
    // =========================
    if (content === "/stopmotw") {

      if (!isCommandChannel) {
        return message.reply("ur not a mod sybau");
      }

      try {
        motw.stopMOTW();
        return message.reply("🛑 MOTW stopped.");
      } catch (err) {
        console.error("❌ Failed to stop MOTW:", err);
        return message.reply("❌ Failed to stop MOTW.");
      }
    }

    // =========================
    // HELP
    // =========================
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

🤖 AI
@Camelbot <message>`
      );
    }

    // =========================
    // LOOKUP
    // =========================
    if (content.startsWith("/lookup ")) {

      const query = content.replace("/lookup ", "").trim();
      if (!query) return message.reply("❌ Provide a movie name.");

      try {
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
      } catch (err) {
        console.error("❌ Lookup error:", err);
        return message.reply("❌ Failed to search for movies.");
      }
    }

    // =========================
    // SHOW MOTW
    // =========================
    if (content === "/showmotw") {

      try {
        const state = motw.ensureState();
        const subs = state.submissions || {};

        let output = "🎬 MOTW SUBMISSIONS\n\n";

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
      } catch (err) {
        console.error("❌ Show MOTW error:", err);
        return message.reply("❌ Failed to show MOTW submissions.");
      }
    }

    // =========================
    // ENTER MOTW
    // =========================
    if (content === "/entermotw") {

      try {
        // ✅ FIX #5: Check if user already has an active session
        if (client.sessions.has(userId)) {
          return message.reply("❌ You already have an active MOTW session. Cancel it first or complete it.");
        }

        const state = motw.ensureState();

        if (state.phase !== "submission") {
          return message.reply("❌ MOTW is currently closed.");
        }

        client.sessions.set(userId, {
          type: "motw",
          step: 1,
          results: [],
          selected: []
        });

        return message.reply("🎬 Send your FIRST movie search.");
      } catch (err) {
        console.error("❌ Enter MOTW error:", err);
        return message.reply("❌ Failed to enter MOTW.");
      }
    }

    return;
  }

  // =========================
  // 4. MOTW FLOW
  // =========================
  if (session?.type === "motw") {

    try {
      const state = motw.ensureState();
      if (state.phase !== "submission") {
        client.sessions.delete(userId);
        return message.reply("❌ MOTW is currently closed.");
      }

      // ✅ FIX #6: Use consistent number types for step
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

        // ✅ FIX #6: Set step to number 3 (PICK state) instead of string "PICK"
        session.step = 3;

        return message.reply(msg);
      }

      // ✅ FIX #6: Check for step === 3 instead of "PICK"
      if (session.step === 3) {

        const num = parseInt(content);

        if (isNaN(num)) {
          return message.reply("❌ Please reply with a number.");
        }

        if (num === 0) {
          client.sessions.delete(userId);
          return message.reply("❌ MOTW entry cancelled.");
        }

        if (num < 1 || num > session.results.length) {
          return message.reply("❌ Invalid choice.");
        }

        const movie = session.results[num - 1];
        session.selected.push(movie.Title);

        if (session.selected.length === 2) {

          const state = motw.ensureState();
          if (!state.submissions) state.submissions = {};
          state.submissions[userId] = session.selected;
          motw.saveState(state);

          client.sessions.delete(userId);

          return message.reply(
`✅ MOTW Submitted

1. ${session.selected[0]}
2. ${session.selected[1]}`
          );
        }

        session.step = 2;

        return message.reply("🎬 Now search your SECOND movie.");
      }
    } catch (err) {
      console.error("❌ MOTW flow error:", err);
      client.sessions.delete(userId);
      return message.reply("❌ An error occurred during MOTW entry.");
    }
  }

});
};
