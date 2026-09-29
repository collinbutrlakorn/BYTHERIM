// Program prestige, the coaching carousel and skipping ahead.
const { boot, playOffseason, ok } = require('./harness');

(async () => {
  const { Sim, window: w } = boot();
  await Sim.init();
  await Sim.startNewGame();
  const P = w.Prestige;
  const team = n => Sim.findTeam(n);
  const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

  // History tiers.
  ok(P.historyScore('Duke', 'ACC') === 100 && P.historyScore('Kansas', 'Big 12') === 100, 'blue bloods at the top');
  ok(P.historyScore('Villanova', 'Big East') < 100 && P.historyScore('Villanova', 'Big East') > P.historyScore('Nebraska', 'Big Ten'), 'next tier below blue bloods, above an ordinary high major');
  ok(P.historyScore('Nebraska', 'Big Ten') > P.historyScore('Siena', 'MAAC'), 'high majors above low majors');
  ok(P.programLevel(100) > P.programLevel(64) && P.programLevel(64) > P.programLevel(32), 'program level rises with prestige');

  // Every team has a coach and a prestige.
  ok(Sim.state.teams.every(t => t.coach && t.coach.name && t.coach.rep != null), 'every team has a coach with a reputation');
  ok(Sim.state.teams.every(t => typeof t.prestige === 'number'), 'every team has a prestige');
  ok(team('Kentucky').prestige > team('Rutgers').prestige, 'Kentucky out-ranks Rutgers in prestige');

  // A coach who wins lifts the program.
  const mid = { school: 'Test U', conference: 'MAAC', history: [], coach: { rep: 30 } };
  const base = P.compute(mid).prestige;
  mid.coach.rep = 75;
  mid.history = [{ wins: 29, losses: 4, ncaaSeed: 6, ncaaWins: 2 }, { wins: 27, losses: 6, ncaaSeed: 9, ncaaWins: 1 }];
  ok(P.compute(mid).prestige > base + 15, `a winning coach and winning seasons lift a low major (${base} -> ${P.compute(mid).prestige})`);

  // Skip ahead.
  ok(Sim.canSkipTo('conf') && Sim.canSkipTo('off'), 'skip targets available in the preseason');
  await Sim.skipTo('conf');
  ok(!Sim.state.regularSeasonDone && Sim.state.week === Sim.state.nonConfEnd, `skipped to conference play (week ${Sim.state.week})`);
  ok(!Sim.canSkipTo('conf'), 'conference play is no longer a skip target');
  await Sim.skipTo('confT');
  ok(Sim.state.regularSeasonDone && !Sim.state.confChampsDone, 'skipped to conference tournaments');
  await Sim.skipTo('ncaa');
  ok(Sim.state.confChampsDone && !(Sim.state.ncaaTournament && Sim.state.ncaaTournament.rounds.length), 'skipped to the NCAA Tournament (Selection Sunday)');
  await Sim.skipTo('off');
  ok(Sim.state.ncaaDone, 'skipped to the offseason');
  ok(!Sim._skipping && !w.__BTR_NO_CUTSCENES !== true, 'skip mode cleared');

  // The carousel runs with the portal.
  const coachesBefore = {};
  Sim.state.teams.forEach(t => { coachesBefore[t.school] = t.coach.name; });
  await playOffseason(Sim);
  const changes = Sim.state.lastCoachChanges || [];
  const hires = changes.filter(c => c.kind === 'hired');
  const changed = Sim.state.teams.filter(t => t.coach.name !== coachesBefore[t.school]);
  ok(Sim.state.teams.every(t => t.coach && t.coach.name), 'every job filled after the carousel');
  ok(hires.length === changed.length, `every coaching change recorded (${hires.length} hires)`);
  ok(hires.length > 5 && hires.length < 120, `a believable number of coaching changes (${hires.length})`);
  const names = Sim.state.teams.map(t => t.coach.name);
  ok(new Set(names).size === names.length, 'no coach holds two jobs');
  const followed = (Sim.state.lastTransfers || []).filter(t => /^Followed /.test(t.reason));
  followed.forEach(f => ok(team(f.to).roster.some(p => p.id === f.id), `${f.name} followed his coach to ${f.to}`));
  const ids = new Set();
  let dup = 0;
  Sim.state.teams.forEach(t => t.roster.forEach(p => { if (ids.has(p.id)) dup++; ids.add(p.id); }));
  ok(dup === 0, 'no player on two rosters');

  // Prestige shapes who a program signs.
  const newFr = t => t.roster.filter(p => p.class === 'FR' && !p.rsci).map(p => parseFloat(p.rating));
  const high = Sim.state.teams.filter(t => t.prestige >= 80).flatMap(newFr);
  const low = Sim.state.teams.filter(t => t.prestige < 40).flatMap(newFr);
  ok(avg(high) > avg(low) + 5, `high-prestige programs sign better freshmen (${avg(high).toFixed(1)} vs ${avg(low).toFixed(1)})`);
  console.log('\nPrestige, carousel and skip ahead OK.');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
