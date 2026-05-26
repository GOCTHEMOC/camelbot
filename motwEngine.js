const fs = require("fs");

let state = require("./motwState.json");

function saveState() {
  fs.writeFileSync("./motwState.json", JSON.stringify(state, null, 2));
}

// ================= CONFIG =================
const SUBMISSION_DURATION = 4 * 24 * 60 * 60 * 1000; // 4 days
const VOTING_DURATION = 3 * 24 * 60 * 60 * 1000;      // 3 days

// ================= START WEEK =================
function startSubmission(client) {
  state.phase = "submission";
  state.active = true;
  state.weekIndex += 1;
  state.submissions = {};
  state.votes = {};
  state.phaseEndsAt = Date.now() + SUBMISSION_DURATION;

  saveState();

  const channel = client.channels.cache.find(c => c.name === "movie");
  if (channel) channel.send(`🎬 MOTW Week ${state.weekIndex} has started! Submissions are open.`);
}

// ================= START VOTING =================
function startVoting(client) {
  state.phase = "voting";
  state.phaseEndsAt = Date.now() + VOTING_DURATION;

  saveState();

  const channel = client.channels.cache.find(c => c.name === "movie");
  if (channel) channel.send(`🗳 Voting is now open for MOTW Week ${state.weekIndex}!`);
}

// ================= END WEEK =================
function resetWeek(client) {
  const channel = client.channels.cache.find(c => c.name === "movie");

  if (channel) {
    channel.send(`🏆 MOTW Week ${state.weekIndex} has ended!`);
  }

  state.phase = "inactive";
  state.active = false;
  state.phaseEndsAt = null;

  saveState();
}

// ================= LOOP ENGINE =================
function startMOTWLoop(client) {
  setInterval(() => {
    if (!state.active) return;

    const now = Date.now();

    // submission → voting
    if (state.phase === "submission" && now > state.phaseEndsAt) {
      startVoting(client);
    }

    // voting → reset
    else if (state.phase === "voting" && now > state.phaseEndsAt) {
      resetWeek(client);
    }

  }, 60 * 1000); // check every minute
}

// ================= MANUAL START =================
function manualStart(client) {
  startSubmission(client);
}

module.exports = {
  startMOTWLoop,
  manualStart,
  state
};
