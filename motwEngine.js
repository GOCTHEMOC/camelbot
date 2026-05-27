const fs = require("fs");

const STATE_FILE = "./motwState.json";

let running = false;

// =========================
// SINGLE SOURCE OF TRUTH
// =========================
let state = JSON.parse(fs.readFileSync(STATE_FILE));

// =========================
// SAVE ONLY WHEN MODIFIED
// =========================
function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2)
  );
}

// =========================
// PUBLIC STATE ACCESS
// =========================
function loadState() {
  return state;
}

// =========================
// UTIL
// =========================
function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// =========================
// SUBMISSION PHASE (4 DAYS)
// =========================
async function startSubmission(client) {

  state.phase = "submission";
  state.submissions = {};
  state.poll = [];

  saveState();

  const movieChannel = await client.channels.fetch(
    process.env.MOVIE_CHANNEL_ID
  );

  if (movieChannel) {
    await movieChannel.send(
`🎬 MOVIE OF THE WEEK STARTED

Submissions are OPEN for 4 days.

Use:
/entermotw`
    );
  }
}

// =========================
// POLLING PHASE (2 DAYS)
// =========================
async function startPolling(client) {

  state.phase = "polling";

  let movies = [];

  Object.values(state.submissions).forEach(arr => {
    movies.push(...arr);
  });

  state.poll = [...new Set(movies)];

  saveState();

  const movieChannel = await client.channels.fetch(
    process.env.MOVIE_CHANNEL_ID
  );

  if (movieChannel) {

    let msg = `🗳️ POLLING HAS BEGUN\n\nVote by replying with a number.\n\n`;

    state.poll.forEach((m, i) => {
      msg += `${i + 1}. ${m}\n`;
    });

    await movieChannel.send(msg);
  }
}

// =========================
// WINNER PHASE
// =========================
async function endPolling(client) {

  const movieChannel = await client.channels.fetch(
    process.env.MOVIE_CHANNEL_ID
  );

  const pool = state.poll;

  const winner =
    pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : "No submissions";

  await movieChannel.send(
`🏆 MOVIE OF THE WEEK WINNER

🎬 ${winner}`
  );

  state.phase = "rest";
  saveState();
}

// =========================
// REST DAY (1 DAY)
// =========================
async function restDay(client) {

  const movieChannel = await client.channels.fetch(
    process.env.MOVIE_CHANNEL_ID
  );

  await movieChannel.send(
`🛌 REST DAY

Next MOTW cycle starts tomorrow.`
  );

  state.submissions = {};
  state.poll = [];
  state.phase = "submission";

  saveState();
}

// =========================
// MAIN LOOP
// =========================
async function startLoop(client) {

  if (running) return;
  running = true;

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
  loadState,
  saveState
};
