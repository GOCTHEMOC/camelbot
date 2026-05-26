const motw = require("../motwEngine");

if (content === "/startmotw") {
  motw.manualStart(client);
  return message.reply("🎬 MOTW started (submission phase).");
}
