// Verifies the simulation still produces realistic Division I team
// averages. These ranges come from real NCAA D1 seasons — if an edit
// pushes a number outside its band, the simulation has drifted.
const { boot, ok } = require('./harness');

const TARGETS = [
  ['ppg', 71.0, 74.5], ['rpg', 33.5, 36.5], ['apg', 12.0, 14.8],
  ['stl', 5.8, 7.0], ['blk', 2.8, 3.8], ['tov', 11.0, 13.0],
  ['pf', 16.0, 18.0], ['fga', 55.5, 60.0], ['threePa', 21.0, 24.5]
];

(async () => {
  const { Sim } = boot();
  await Sim.init();
  await Sim.startNewGame();
  let i = 0;
  while (!Sim.state.regularSeasonDone && i < 60) { await Sim.simulateWeek(); i++; }

  const rows = Sim.computeAllTeamStats();
  const avg = k => rows.reduce((s, r) => s + parseFloat(r.stats[k]), 0) / rows.length;

  TARGETS.forEach(([k, lo, hi]) => {
    const v = avg(k);
    ok(v >= lo && v <= hi, `${k} = ${v.toFixed(2)} (expected ${lo}-${hi})`);
  });

  const scorers = Sim.state.activePlayers.filter(p => parseFloat(p.stats.ppg) >= 20).length;
  ok(scorers >= 10 && scorers <= 55, `players averaging 20+ ppg: ${scorers} (expected 10-55)`);
  console.log('\nLeague statistics within realistic ranges.');
})().catch(e => { console.error(e.message); process.exit(1); });
