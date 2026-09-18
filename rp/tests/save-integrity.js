// Everything written to IndexedDB must survive structured clone.
//
// A function attached to a team object once broke every single save in the
// app — Dexie reports DataCloneError and aborts the whole transaction, so
// the symptom was "saves stopped working" with nothing obviously wrong in
// the simulation. This check catches that class of bug directly, and also
// verifies a full save/load round trip restores the universe intact.
const { boot, ok } = require('./harness');

(async () => {
  const store = {};
  const table = (name) => {
    const key = name + 'Store';
    return {
      get: async id => (store[key] || {})[id],
      // structuredClone is exactly what IndexedDB does under the hood.
      put: async o => { structuredClone(o); store[key] = store[key] || {}; store[key][o.id || 1] = o; },
      toArray: async () => Object.values(store[key] || {}),
      clear: async () => { store[key] = {}; },
      bulkAdd: async arr => {
        structuredClone(arr);
        store[key] = store[key] || {};
        arr.forEach((it, i) => { store[key][it.id || it.school || i] = it; });
      },
      count: async () => Object.keys(store[key] || {}).length
    };
  };
  const db = {
    leagueState: table('leagueState'), teams: table('teams'),
    players: table('players'), recruits: table('recruits'),
    transaction: async (m, ...a) => { await a[a.length - 1](); }
  };

  const first = boot();
  first.window.db = db;
  const Sim = first.Sim;
  await Sim.init();
  await Sim.startNewGame();

  let threw = null;
  try { await Sim.saveStateToDB(); } catch (e) { threw = e; }
  ok(!threw, 'save succeeds on a fresh universe' + (threw ? ` (${threw.name}: ${threw.message.slice(0, 80)})` : ''));

  for (let i = 0; i < 4; i++) await Sim.simulateWeek();
  threw = null;
  try { await Sim.saveStateToDB(); } catch (e) { threw = e; }
  ok(!threw, 'save succeeds mid-season' + (threw ? ` (${threw.name})` : ''));

  // Nothing on a saved record may be a function.
  const scan = (obj, label) => {
    Object.keys(obj || {}).forEach(k => {
      if (typeof obj[k] === 'function') {
        throw new Error(`FAILED: ${label} carries an unserialisable function property "${k}"`);
      }
    });
  };
  (await db.teams.toArray()).slice(0, 5).forEach(t => scan(t, 'saved team'));
  (await db.players.toArray()).slice(0, 5).forEach(p => scan(p, 'saved player'));
  ok(true, 'no saved record carries a function property');

  const savedTeams = await db.teams.count();
  const savedPlayers = await db.players.count();
  ok(savedTeams > 300, `teams persisted (${savedTeams})`);
  ok(savedPlayers > 3000, `players persisted (${savedPlayers})`);

  // Reload into a fresh instance and confirm rosters are rebuilt, since
  // teams are stored without them to keep the save small.
  const second = boot();
  second.window.db = db;
  const Sim2 = second.Sim;
  await Sim2.init();
  await Sim2.continueGame();

  ok(Sim2.state.teams.length === Sim.state.teams.length, 'all teams restored');
  ok(Sim2.state.week === Sim.state.week, `week restored (${Sim2.state.week})`);
  const empty = Sim2.state.teams.filter(t => !t.roster || t.roster.length === 0);
  ok(empty.length === 0, `every roster rebuilt on load (${empty.length} empty)`);
  const t0 = Sim2.state.teams.find(t => t.school === Sim.state.teams[0].school);
  ok(t0 && t0.roster.length === Sim.state.teams[0].roster.length,
    'restored roster size matches what was saved');
  ok(t0.simData && t0.simData.rosterRef === t0.roster, 'simulation roster reference relinked');

  console.log('\nSave integrity verified.');
})().catch(e => { console.error(e.message); process.exit(1); });
