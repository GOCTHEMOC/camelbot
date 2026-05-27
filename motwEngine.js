const fs = require("fs");

const STATE_FILE = "./motwState.json";

let running = false;

function loadState() {
  return JSON.parse(fs.readFileSync(STATE_FILE));
}

function saveState(state) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(state, null, 2)
  );
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startSubmission(client) {

  const state = loadState();

  state.phase = "submission";
  state.submissions = {};
  state.poll = [];

  saveState(state);

  const movieChannel = await client.channels.fetch(
    process.env.MOVIE_CHANNEL_ID
  );

  await movieChannel.send(
`🎬 MOVIE OF THE WEEK STARTED

Submissions are OPEN for 4 days.

Use:
/entermotw`
  );
}

async function startPolling(client) {

  const state = loadState();

  state.phase = "polling";

  saveState(state);

  const movieChannel = await client.channels.fetch(
    process.env.MOVIE_CHANNEL_ID
  );

  let movies = [];

  Object.values(state.submissions).forEach(arr => {
    movies.push(...arr);
  });

  movies = [...new Set(movies)];

  state.poll = movies;

  saveState(state);

  let msg =
`🗳️ POLLING HAS BEGUN

Vote by replying with a number.

`;

  movies.forEach((m, i) => {
    msg += `${i + 1}. ${m}\n`;
  });

  await movieChannel.send(msg);
}

async function endPolling(client) {

  const state = loadState();

  const movieChannel = await client.channels.fetch(
    process.env.MOVIE_CHANNEL_ID
  );

  // TEMP WINNER PICK
  const winner =
    state.poll[Math.floor(Math.random() * state.poll.length)];

  await movieChannel.send(
`🏆 MOVIE OF THE WEEK WINNER

🎬 ${winner}`
  );

  state.phase = "rest";

  saveState(state);
}

async function restDay(client) {

  const state = loadState();

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

  saveState(state);
}

async function startLoop(client) {

  if (running) return;

  running = true;

  while (running) {

    // 4 DAYS SUBMISSIONS
    await startSubmission(client);
    await wait(4 * 24 * 60 * 60 * 1000);

    // 2 DAYS POLLING
    await startPolling(client);
    await wait(2 * 24 * 60 * 60 * 1000);

    // WINNER
    await endPolling(client);

    // 1 DAY REST
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
  stopMOTW,
  loadState,
  saveState
};
