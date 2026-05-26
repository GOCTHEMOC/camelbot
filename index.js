require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} = require("discord.js");

const { saveUser, getUser } = require("./database");
const { lookupMovie, getMovie } = require("./commands/lookup");
const { setSearch, getSearch, clearSearch } = require("./searchState");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel]
});

let verifyMessageId = null;

// ---------------- READY ----------------
client.once(Events.ClientReady, async () => {
  console.log(`Camelbot is online as ${client.user.tag}`);

  const verifyChannel = await client.channels.fetch(
    process.env.VERIFY_CHANNEL_ID
  );

  const msg = await verifyChannel.send(
`Hello! Welcome to Gohith's movie server.

React 👍 to verify.
React 🎬 to link Letterboxd.`
  );

  verifyMessageId = msg.id;

  console.log("Verify message sent:", msg.id);
});

// ---------------- REACTIONS ----------------
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (!reaction.message || reaction.message.id !== verifyMessageId) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);

  if (reaction.emoji.name === "👍") {
    const role = guild.roles.cache.find(r => r.name === "verified");
    if (role) await member.roles.add(role);
  }

  if (reaction.emoji.name === "🎬") {
    await user.send("Send your Letterboxd link:");
  }
});

// ---------------- MESSAGE HANDLER ----------------
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  try {

    // ---------------- LOOKUP COMMAND ----------------
    if (message.content.startsWith("/lookup ")) {
      const query = message.content.replace("/lookup ", "");

      const results = await lookupMovie(query);

      if (!results.length) {
        return message.reply("No movies found.");
      }

      setSearch(message.author.id, results);

      let text = "Are you asking for this movie?\n\n";

      results.forEach((m, i) => {
        text += `${i + 1}. ${m.Title} (${m.Year})\n`;
      });

      text += "\nReply with a number (0 to cancel).";

      return message.reply(text);
    }

    // ---------------- NUMBER SELECTION ----------------
    if (/^\d+$/.test(message.content)) {
      const choice = parseInt(message.content);
      const data = getSearch(message.author.id);

      if (!data) return;

      if (choice === 0) {
        clearSearch(message.author.id);
        return message.reply("Search cancelled.");
      }

      const movie = data[choice - 1];
      if (!movie) return message.reply("Invalid number.");

      const full = await getMovie(movie.imdbID);

      clearSearch(message.author.id);

      return message.reply(
`🎬 ${full.Title} (${full.Year})

⭐ IMDb: ${full.imdbRating}
🎭 Genre: ${full.Genre}
🎬 Director: ${full.Director}
📝 Plot: ${full.Plot}

https://www.imdb.com/title/${full.imdbID}/`
      );
    }

    // ---------------- LETTERBOXD DM ----------------
    if (message.channel.type === 1) {
      const content = message.content.trim();

      if (!content.startsWith("http")) {
        return message.reply("Send a valid Letterboxd link.");
      }

      const old = getUser(message.author.id);
      saveUser(message.author.id, content);

      const channel = await client.channels.fetch(
        process.env.LETTERBOXD_CHANNEL_ID
      );

      if (old) {
        await channel.send(`♻️ <@${message.author.id}> updated Letterboxd: ${content}`);
      } else {
        await channel.send(`<@${message.author.id}> linked Letterboxd: ${content}`);
      }

      return message.reply("✅ Saved your Letterboxd profile.");
    }

  } catch (err) {
    console.log("ERROR:", err);
  }
});

client.login(process.env.TOKEN);
