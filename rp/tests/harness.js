// Shared test harness. Boots the simulation in a headless DOM with the
// real ncaa.html, so tests exercise the same markup the browser loads.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const RP = path.join(__dirname, '..');
const JS = path.join(RP, 'js');

const SCRIPTS = ['teams-master.js', 'roster-gen.js', 'schedule-core.js', 'game-core.js',
  'tournament-core.js', 'draft-core.js', 'coach-core.js', 'development-core.js',
  'engine.js', 'ui.js'];

// opts.roster / opts.recruits / opts.coaches are CSV strings; omit one to
// simulate that sheet being unavailable.
function boot(opts = {}) {
  const html = fs.readFileSync(path.join(RP, 'ncaa.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
  const w = dom.window;
  const ctx = vm.createContext(w);

  w.confirm = () => true;
  w.alert = () => {};
  const store = {};
  Object.defineProperty(w, 'localStorage', {
    value: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    configurable: true
  });

  w.fetch = (url) => {
    const pick = url.includes('1430573464') ? opts.coaches
      : url.includes('vTWvXoq') ? opts.recruits
      : opts.roster;
    if (pick === undefined) return Promise.resolve({ ok: false, text: () => Promise.resolve('') });
    return Promise.resolve({ ok: true, text: () => Promise.resolve(pick) });
  };

  SCRIPTS.forEach(f => {
    const full = path.join(JS, f);
    if (fs.existsSync(full)) vm.runInContext(fs.readFileSync(full, 'utf8'), ctx, { filename: f });
  });

  return { dom, window: w, Sim: w.SimEngine };
}

// Plays a full regular season plus postseason.
async function playSeason(Sim, guard = 90) {
  let i = 0;
  while (!Sim.state.ncaaDone && i < guard) { await Sim.simulateWeek(); i++; }
  return Sim.state.ncaaDone;
}

// Walks every offseason stage, rolling into the next season.
async function playOffseason(Sim) {
  for (let i = 0; i < Sim.OFFSEASON_STAGES.length; i++) await Sim.simulateWeek();
}

let passed = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  passed++;
  console.log('  ok  ' + msg);
}
function summary() { return passed; }

module.exports = { boot, playSeason, playOffseason, ok, summary, RP, JS };
