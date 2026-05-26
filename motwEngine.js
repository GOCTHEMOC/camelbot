const fs = require("fs");

const statePath = "./motwState.json";

function loadState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

let state = loadState();

const DAY = 24 * 60 * 60 * 1000;

const SUBMISSION = 4 * DAY;
const POLLING = 2 * DAY;
const REST = 1 * DAY;

function startSubmission(client) {

  state.active = true;
  state.phase = "submission";
  state.phaseEndsAt = Date.now() + SUBMISSION;
  state.weekIndex += 1;
  state.submissions = {};
  state.votes = {};

  saveState(state);

  const guild = client.guilds.cache.first();

  const channel =
    guild.channels.cache.find(c => c.name === "movieoftheweek");

  if (channel) {
    channel.send(`🎬 MOTW Week ${state.weekIndex} submissions are OPEN.`);
  }
}

function startPolling(client) {

  state.phase = "polling";
  state.phaseEndsAt = Date.now() + POLLING;

  saveState(state);

  const guild = client.guilds.cache.first();

  const channel =
    guild.channels.cache.find(c => c.name === "movieoftheweek");

  if (channel) {
    channel.send(`🗳 Voting has started.`);
  }
}

function startRest(client) {

  state.phase = "rest";
  state.phaseEndsAt = Date.now() + REST;

  saveState(state);

  const guild = client.guilds.cache.first();

  const channel =
    guild.channels.cache.find(c => c.name === "movieoftheweek");

  if (channel) {
    channel.send(`😴 Rest day.`);
  }
}

function resetWeek() {

  state.submissions = {};
  state.votes = {};

  saveState(state);
}

function stopMOTW() {

  state.active = false;
  state.phase = "inactive";

  saveState(state);
}

function startLoop(client) {

  setInterval(() => {

    state = loadState();

    if (!state.active) return;

    const now = Date.now();

    if (now < state.phaseEndsAt) return;

    if (state.phase === "submission") {
      startPolling(client);
    }

    else if (state.phase === "polling") {
      startRest(client);
    }

    else if (state.phase === "rest") {
      resetWeek();
      startSubmission(client);
    }

  }, 60000);

}

module.exports = {
  state,
  saveState,
  loadState,
  startSubmission,
  stopMOTW,
  startLoop
};
