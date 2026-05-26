const axios = require("axios");
const fs = require("fs");

let state = require("../motwState.json");

function saveState() {
  fs.writeFileSync("./motwState.json", JSON.stringify(state, null, 2));
}

// ================= OMDB =================
async function searchMovies(query) {
  const res = await axios.get(
    `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`
  );
  return res.data?.Search?.slice(0, 6) || [];
}

async function getMovie(id) {
  const res = await axios.get(
    `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&i=${id}&plot=short`
  );
  return res.data;
}

module.exports = (client) => {

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const uid = message.author.id;
    const content = message.content.trim();
    const session = client.sessions.get(uid);

    // ================= MOTW COMMANDS =================
    if (content === "/startmotw") {
      state.active = true;
      state.submissions = {};
      state.startTimestamp = Date.now();
      saveState();
      return message.reply("🏆 MOTW started.");
    }

    if (content === "/stopmotw") {
      state.active = false;
      saveState();
      return message.reply("MOTW stopped.");
    }

    if (content === "/viewmotw") {
      let out = "🏆 MOTW\n\n";

      for (const [id, movies] of Object.entries(state.submissions || {})) {
        out += `<@${id}>:\n`;
        if (movies?.[0]) out += `1. ${movies[0].title}\n`;
        if (movies?.[1]) out += `2. ${movies[1].title}\n`;
        out += "\n";
      }

      return message.reply(out);
    }

    // ================= LOOKUP =================
    if (content.startsWith("/lookup")) {
      const query = content.replace("/lookup", "").trim();
      const results = await searchMovies(query);

      client.sessions.set(uid, {
        type: "lookup",
        results
      });

      let msg = "Pick:\n0 Cancel\n";
      results.forEach((m, i) => msg += `${i + 1}: ${m.Title}\n`);

      return message.reply(msg);
    }

    // ================= ENTER MOTW =================
    if (content === "/entermotw") {
      if (!state.active) return message.reply("No active MOTW.");

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
      const details = await getMovie(movie.imdbID);

      client.sessions.delete(uid);

      return message.reply(`${details.Title} (${details.Year})`);
    }

    // ================= MOTW FLOW =================
    if (session.type === "motw") {

      const choice = parseInt(content);

      if (session.step === 1 && !session.results) {
        const results = await searchMovies(content);
        session.results = results;

        let msg = "Pick Movie 1:\n0 Cancel\n";
        results.forEach((m, i) => msg += `${i + 1}: ${m.Title}\n`);

        return message.reply(msg);
      }

      if (session.step === 1) {
        if (choice === 0) return client.sessions.delete(uid);

        session.selected.push(session.results[choice - 1]);
        session.results = null;
        session.step = 2;

        return message.reply("Enter Movie 2 search:");
      }

      if (session.step === 2 && !session.results) {
        const results = await searchMovies(content);
        session.results = results;

        let msg = "Pick Movie 2:\n0 Cancel\n";
        results.forEach((m, i) => msg += `${i + 1}: ${m.Title}\n`);

        return message.reply(msg);
      }

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

};
