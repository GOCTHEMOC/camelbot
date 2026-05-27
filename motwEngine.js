const fs = require("fs");

const STATE_FILE = "./motwState.json";

let running = false;
let loopStarted = false;

// =========================
// SAFE STATE ACCESS (NO CACHE BUGS)
// =========================
function getState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE));
  } catch {
    return {
      phase: "submission",
      submissions: {},
      poll: []
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// =========================
// PHASES
// =========================
async function startSubmission(client) {
  const state = getState();

  state.phase = "submission";
  state.submissions = {};
  state.poll = [];

  saveState(state);

  const ch = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (ch) {
    ch.send(`🎬 MOVIE OF THE WEEK STARTED\n\nSubmissions OPEN for 4 days.\nUse /entermotw`);
  }
}

async function startPolling(client) {
  const state = getState();

  state.phase = "polling";

  let movies = [];
  Object.values(state.submissions).forEach(arr => movies.push(...arr));

  state.poll = [...new Set(movies)];

  saveState(state);

  const ch = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (ch) {
    let msg = `🗳️ POLLING STARTED\n\n`;

    state.poll.forEach((m, i) => {
      msg += `${i + 1}. ${m}\n`;
    });

    ch.send(msg);
  }
}

async function endPolling(client) {
  const state = getState();

  const winner =
    state.poll.length > 0
      ? state.poll[Math.floor(Math.random() * state.poll.length)]
      : "No submissions";

  const ch = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (ch) {
    ch.send(`🏆 WINNER\n\n🎬 ${winner}`);
  }

  state.phase = "rest";
  saveState(state);
}

async function restDay(client) {
  const state = getState();

  const ch = await client.channels.fetch(process.env.MOVIE_CHANNEL_ID).catch(() => null);

  if (ch) {
    ch.send(`🛌 REST DAY\n\nNext cycle starts tomorrow.`);
  }

  state.submissions = {};
  state.poll = [];
  state.phase = "submission";

  saveState(state);
}

// =========================
// LOOP (FIXED SAFE SINGLETON)
// =========================
async function startLoop(client) {
  if (running || loopStarted) return;

  running = true;
  loopStarted = true;

  while (running) {
    await startSubmission(client);
    await wait(4 * 24 * 60 * 60 * 1000);

    await startPolling(client);
    await wait(2 * 24 * 60 * 60 * 1000);

    await endPolling(client);
    await wait(1 * 24 * 60 * 60 * 1000);

    await restDay(client);
  }
}

function stopMOTW() {
  running = false;
}

module.exports = {
  startLoop,
  startSubmission,
  startPolling,
  endPolling,
  restDay,
  stopMOTW,
  getState,
  saveState
};
