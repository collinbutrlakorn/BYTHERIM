// Loading screen, account autosave, and one simulation at a time.
const { boot, ok } = require('./harness');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { Sim, window: w } = boot();
  const uploads = [];
  let accountMeta = null;
  w.Cloud = {
    enabled: true, user: { uid: 'u1', email: 'me@example.com' },
    savePath: () => 'users/u1/saves/main',
    lastSynced: () => 0,
    getMeta: async () => accountMeta,
    uploadSave: async (dbx, summary) => { uploads.push(summary); },
    onChange() {}
  };
  w.db = {};   // stands in for the browser save; the upload is faked above
  await Sim.init();

  // New save: a loading screen covers the build, then gets out of the way.
  let sawLoader = false;
  const origBuild = Sim.buildFullD1Universe.bind(Sim);
  Sim.buildFullD1Universe = function (...a) {
    const el = w.document.getElementById('rpLoader');
    sawLoader = !!(el && el.classList.contains('active') && /Division I program/i.test(el.textContent));
    return origBuild(...a);
  };
  await Sim.startNewGame();
  ok(sawLoader, 'a loading screen shows while the universe is built');
  ok(!w.document.getElementById('rpLoader').classList.contains('active'), 'and is gone once the players are in');
  ok(Sim.state.activePlayers.length > 3000, `players are loaded before the intro (${Sim.state.activePlayers.length})`);

  // Autosave: soon after the first change, then throttled.
  await wait(1800);
  ok(uploads.length === 1, `the new save goes up to the account on its own (${uploads.length})`);
  await Sim.simulateWeek();
  await Sim.simulateWeek();
  await wait(1800);
  ok(uploads.length === 1, 'weeks in quick succession don\'t upload every time');
  Sim.AUTOSAVE_EVERY_MS = 100;
  await Sim.simulateWeek();
  await wait(1800);
  ok(uploads.length === 2, 'after a few minutes the latest week goes up');

  // Skipping: nothing uploads mid-skip; the milestone at the end does.
  Sim.AUTOSAVE_EVERY_MS = 10 * 60 * 1000;
  const before = uploads.length;
  const skipping = Sim.skipTo('confT');
  ok(Sim.isSimBusy() && !Sim.canSkipTo('ncaa'), 'nothing else can start while a skip runs');
  await skipping;
  ok(uploads.length === before, 'no uploads in the middle of a skip');
  await wait(1800);
  ok(uploads.length === before + 1, 'reaching the conference tournaments saves right away');

  // A newer save from another device is never overwritten.
  accountMeta = { updatedAt: Date.now() + 1e6 };
  Sim._autosaveCleared = false;
  const n = uploads.length;
  await Sim.simulateWeek();
  await wait(1800);
  ok(uploads.length === n && Sim._autosaveBlocked, 'autosave pauses when the account has a newer save from elsewhere');

  // Off means off.
  accountMeta = null;
  Sim._autosaveCleared = true;
  Sim.setAutosave(false);
  await Sim.simulateWeek();
  await wait(1800);
  ok(uploads.length === n, 'turning autosave off stops it');
  Sim.setAutosave(true);
  await wait(1800);
  ok(uploads.length === n + 1, 'turning it back on saves what was waiting');

  console.log('\nLoading screen and autosave verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
