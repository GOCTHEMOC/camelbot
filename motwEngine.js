const fs = require("fs");

const STATE_FILE = "./motwState.json";

// -------------------------
// LOAD STATE
// -------------------------
function loadState() {
  return JSON.parse(fs.readFileSync(STATE_FILE));
}

// -------------------------
// SAVE STATE
// -------------------------
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// -------------------------
// INITIALIZE SAFE STATE
// -------------------------
function ensureState() {
  const state = loadState();

  if (typeof state.running !== "boolean") state.running = false;
  if (!state.phase) state.phase = "submission";
  if (!state.submissions) state.submissions = {};
  if (!state.poll) state.poll = [];
  if (!state.nextPhaseAt) state.nextPhaseAt = 0;

  saveState(state);
  return state;
}

// -------------------------
// PHASE ACTIONS
// -------------------------
async function startSubmission(client) {
  const state = loadState();

  state.phase = "submission";
  state.submissions = {};
  state.poll = [];
  state.nextPhaseAt = Date.now() + 4 * 24 * 60 * 60 * 1000;

  saveState(state);

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (channel) {
    channel.send(`🎬 MOTW: SUBMISSIONS OPEN (4 DAYS)\nUse /entermotw`);
  }
}

async function startPolling(client) {
  const state = loadState();

  const movies = [];
  Object.values(state.submissions).forEach(arr => movies.push(...arr));

  state.poll = [...new Set(movies)];
  state.phase = "polling";
  state.nextPhaseAt = Date.now() + 2 * 24 * 60 * 60 * 1000;

  saveState(state);

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (channel) {
    let msg = "🗳️ POLLING STARTED\n\n";
    state.poll.forEach((m, i) => {
      msg += `${i + 1}. ${m}\n`;
    });
    channel.send(msg);
  }
}

async function endPolling(client) {
  const state = loadState();

  const winner =
    state.poll.length > 0
      ? state.poll[Math.floor(Math.random() * state.poll.length)]
      : "No submissions";

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (channel) {
    channel.send(`🏆 WINNER\n\n🎬 ${winner}`);
  }

  state.phase = "rest";
  state.nextPhaseAt = Date.now() + 24 * 60 * 60 * 1000;

  saveState(state);
}

async function restDay(client) {
  const state = loadState();

  state.phase = "submission";
  state.submissions = {};
  state.poll = [];
  state.nextPhaseAt = Date.now() + 4 * 24 * 60 * 60 * 1000;

  saveState(state);

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (channel) {
    channel.send("🛌 REST DAY COMPLETE — cycle restarting soon");
  }
}

// -------------------------
// SCHEDULER (NON-BLOCKING)
// -------------------------
function startScheduler(client) {
  ensureState();

  setInterval(async () => {
    const state = loadState();

    if (!state.running) return;
    if (Date.now() < state.nextPhaseAt) return;

    if (state.phase === "submission") {
      await startPolling(client);
    } else if (state.phase === "polling") {
      await endPolling(client);
    } else if (state.phase === "rest") {
      await restDay(client);
    }
  }, 10 * 1000);
}

// -------------------------
// TOGGLES
// -------------------------
function startMOTW(client) {
  const state = loadState();
  state.running = true;
  saveState(state);

  startSubmission(client);
}

function stopMOTW() {
  const state = loadState();
  state.running = false;
  saveState(state);
}

module.exports = {
  startScheduler,
  startMOTW,
  stopMOTW,
  loadState,
  saveState
};
