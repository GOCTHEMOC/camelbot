const {
  startSubmission,
  stopMOTW,
  loadState,
  saveState
} = require("../motwEngine");

const { movieSearch } =
require("../services/lookup");

const { askAI } =
require("../services/ai");

module.exports = (client) => {

client.on("messageCreate",
async (message) => {

if (message.author.bot) return;

const content = message.content.trim();

const state = loadState();

if (message.mentions.has(client.user)) {

  const prompt =
    content.replace(`<@${client.user.id}>`, "");

  const response = await askAI(prompt);

  return message.reply(response);
}

if (content === "/startmotw") {

  if (message.channel.name !== "camelcommands") {
    return;
  }

  startSubmission(client);

  return message.reply("🎬 MOTW started.");
}

if (content === "/stopmotw") {

  if (message.channel.name !== "camelcommands") {
    return;
  }

  stopMOTW();

  return message.reply("🛑 MOTW stopped.");
}

if (content === "/showmotw") {

  let output =
`🎬 MOTW

Phase: ${state.phase}

`;

  const submissions = state.submissions;

  if (Object.keys(submissions).length === 0) {
    output += "No submissions.";
  }

  for (const userId in submissions) {

    const member =
      await message.guild.members
      .fetch(userId)
      .catch(() => null);

    const username =
      member ? member.user.username : userId;

    output += `\n👤 ${username}\n`;

    submissions[userId]
    .forEach((movie, i) => {
      output += `${i + 1}. ${movie}\n`;
    });

  }

  return message.channel.send(output);
}

if (content.startsWith("/lookup ")) {

  const query =
    content.replace("/lookup ", "");

  const results =
    await movieSearch(query);

  if (results.length === 0) {
    return message.reply("No results.");
  }

  let output = "🎬 Results:\n\n";

  results.slice(0, 6).forEach((m, i) => {
    output += `${i + 1}. ${m.Title} (${m.Year})\n`;
  });

  return message.channel.send(output);
}

if (content === "/entermotw") {

  if (message.channel.name !== "movieoftheweek") {
    return message.reply(
      "❌ Only in #movieoftheweek"
    );
  }

  if (state.phase !== "submission") {
    return message.reply(
      "❌ Submissions are closed."
    );
  }

  client.sessions.set(message.author.id, {
    type: "motw",
    step: 1,
    movies: []
  });

  return message.reply(
    "🎬 Send your first movie search."
  );
}

const session =
  client.sessions.get(message.author.id);

if (session?.type === "motw") {

  if (session.step === 1 ||
      session.step === 2) {

    const results =
      await movieSearch(content);

    if (results.length === 0) {
      return message.reply("No results.");
    }

    session.results = results.slice(0, 6);

    let output = "Pick a movie:\n\n";

    session.results.forEach((m, i) => {
      output +=
`${i + 1}. ${m.Title} (${m.Year})\n`;
    });

    session.step = "pick";

    return message.reply(output);
  }

  if (session.step === "pick") {

    const num = parseInt(content);

    if (
      isNaN(num) ||
      num < 1 ||
      num > session.results.length
    ) {
      return message.reply("Invalid choice.");
    }

    const movie =
      session.results[num - 1].Title;

    session.movies.push(movie);

    if (session.movies.length >= 2) {

      state.submissions[message.author.id] =
        session.movies;

      saveState(state);

      client.sessions.delete(message.author.id);

      return message.reply(
`✅ Submitted:

1. ${session.movies[0]}
2. ${session.movies[1]}`
      );
    }

    session.step = 2;

    return message.reply(
      "🎬 Send your second movie search."
    );
  }

}

});
};
