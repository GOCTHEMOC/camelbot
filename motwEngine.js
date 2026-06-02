const fs = require("fs");

const STATE_FILE = "./motwState.json";

// -------------------------
// LOAD STATE (WITH ERROR HANDLING)
// -------------------------
function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.warn(`⚠️  ${STATE_FILE} not found, creating with defaults...`);
      const defaultState = {
        running: false,
        phase: "submission",
        submissions: {},
        poll: [],
        nextPhaseAt: 0
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
      return defaultState;
    }
    return JSON.parse(fs.readFileSync(STATE_FILE));
  } catch (err) {
    console.error(`❌ Error reading ${STATE_FILE}:`, err);
    const defaultState = {
      running: false,
      phase: "submission",
      submissions: {},
      poll: [],
      nextPhaseAt: 0
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
    return defaultState;
  }
}

// -------------------------
// SAVE STATE
// -------------------------
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`❌ Error writing to ${STATE_FILE}:`, err);
  }
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
  const state = ensureState();

  state.phase = "submission";
  state.submissions = {};
  state.poll = [];
  state.nextPhaseAt = Date.now() + 4 * 24 * 60 * 60 * 1000;

  saveState(state);

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.error("❌ MOVIE_CHANNEL_ID not found or invalid");
    return;
  }

  await channel.send(`🎬 MOTW: SUBMISSIONS OPEN (4 DAYS)\nUse /entermotw`).catch(err => {
    console.error("❌ Failed to send submission announcement:", err);
  });
}

async function startPolling(client) {
  const state = ensureState();

  const movies = [];
  Object.values(state.submissions).forEach(arr => movies.push(...arr));

  state.poll = [...new Set(movies)];
  state.phase = "polling";
  state.nextPhaseAt = Date.now() + 2 * 24 * 60 * 60 * 1000;

  saveState(state);

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.error("❌ MOVIE_CHANNEL_ID not found or invalid");
    return;
  }

  let msg = "🗳️ POLLING STARTED\n\n";
  state.poll.forEach((m, i) => {
    msg += `${i + 1}. ${m}\n`;
  });

  await channel.send(msg).catch(err => {
    console.error("❌ Failed to send polling announcement:", err);
  });
}

async function endPolling(client) {
  const state = ensureState();

  const winner =
    state.poll.length > 0
      ? state.poll[Math.floor(Math.random() * state.poll.length)]
      : "No submissions";

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.error("❌ MOVIE_CHANNEL_ID not found or invalid");
    return;
  }

  await channel.send(`🏆 WINNER\n\n🎬 ${winner}`).catch(err => {
    console.error("❌ Failed to send winner announcement:", err);
  });

  state.phase = "rest";
  state.nextPhaseAt = Date.now() + 24 * 60 * 60 * 1000;

  saveState(state);
}

async function restDay(client) {
  const state = ensureState();

  state.phase = "submission";
  state.submissions = {};
  state.poll = [];
  state.nextPhaseAt = Date.now() + 4 * 24 * 60 * 60 * 1000;

  saveState(state);

  const channel = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.error("❌ MOVIE_CHANNEL_ID not found or invalid");
    return;
  }

  await channel.send("🛌 REST DAY COMPLETE — cycle restarting soon").catch(err => {
    console.error("❌ Failed to send rest day announcement:", err);
  });
}

// -------------------------
// SCHEDULER (NON-BLOCKING)
// -------------------------
function startScheduler(client) {
  ensureState();

  setInterval(async () => {
    const state = ensureState();

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
  const state = ensureState();
  state.running = true;
  saveState(state);

  startSubmission(client);
}

function stopMOTW() {
  const state = ensureState();
  state.running = false;
  saveState(state);
}

module.exports = {
  startScheduler,
  startMOTW,
  stopMOTW,
  loadState,
  saveState,
  ensureState
};
