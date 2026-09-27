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

  ['threePPct', 'ftPct', 'fgPct'].forEach(k => console.log(`  (info) ${k} = ${avg(k).toFixed(3)}`));
  TARGETS.forEach(([k, lo, hi]) => {
    const v = avg(k);
    if (process.env.SHOW_ALL) { console.log(`  (val) ${k} = ${v.toFixed(2)}`); return; }
    ok(v >= lo && v <= hi, `${k} = ${v.toFixed(2)} (expected ${lo}-${hi})`);
  });

  const scorers = Sim.state.activePlayers.filter(p => parseFloat(p.stats.ppg) >= 20).length;
  ok(scorers >= 15 && scorers <= 55, `players averaging 20+ ppg: ${scorers} (expected 15-55)`);

  // Free throws by position: guards and wings who shoot make ~80%,
  // power forwards sit around 70%, centres in the mid-60s and below.
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const ftBy = pos => med(Sim.state.activePlayers
    .filter(p => p.stats && p.stats.totFta >= 30 && pos.includes(p.pos))
    .map(p => p.stats.totFtm / p.stats.totFta));
  const g = ftBy(['PG', 'SG', 'G', 'CG']), pf = ftBy(['PF']), c = ftBy(['C']);
  ok(g >= 0.77 && g <= 0.85, `guards' median FT% ${g.toFixed(3)} (expected .77-.85)`);
  ok(pf >= 0.63 && pf <= 0.73, `power forwards' median FT% ${pf.toFixed(3)} (expected .63-.73)`);
  ok(c >= 0.56 && c <= 0.67, `centres' median FT% ${c.toFixed(3)} (expected .56-.67)`);
  const shooters = Sim.state.activePlayers.filter(p => p.stats && p.stats.totThreePa >= 100 && p.stats.totThreePm / p.stats.totThreePa >= 0.36 && p.stats.totFta >= 30);
  const sh = med(shooters.map(p => p.stats.totFtm / p.stats.totFta));
  ok(sh >= 0.78, `volume three-point shooters' median FT% ${sh.toFixed(3)} (expected .78+)`);

  // Games played only counts games a player actually got on the floor.
  const ghosts = Sim.state.activePlayers.filter(p => p.stats && p.stats.gp > 0 && !(p.stats.totMin > 0)).length;
  ok(ghosts === 0, `no player has games played without minutes (${ghosts})`);
  const benchEveryNight = Sim.state.activePlayers.filter(p => p.stats && p.stats.gp >= 25 && parseFloat(p.stats.mpg) < 3).length;
  ok(benchEveryNight === 0, `deep-bench players sit out some games (${benchEveryNight} played 25+ games at under 3 minutes)`);
  console.log('\nLeague statistics within realistic ranges.');
})().catch(e => { console.error(e.message); process.exit(1); });
