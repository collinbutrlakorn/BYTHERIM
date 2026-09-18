// Plays multiple full seasons end to end. Catches anything that only
// breaks on the second or third year: roster drain, rating drift,
// players re-enrolling after leaving, offseason stages stalling.
const { boot, playSeason, playOffseason, ok } = require('./harness');

(async () => {
  const { Sim } = boot();
  await Sim.init();
  await Sim.startNewGame();

  const startYear = Sim.state.year;
  for (let yr = 0; yr < 3; yr++) {
    ok(await playSeason(Sim), `season ${Sim.state.year} completed`);
    const declared = Sim.state.draftDeclarations.map(d => d.id);
    await playOffseason(Sim);

    ok(Sim.state.year === startYear + yr + 1, `year advanced to ${Sim.state.year}`);

    const onRoster = new Set();
    Sim.state.teams.forEach(t => t.roster.forEach(p => onRoster.add(p.id)));
    const returned = new Set((Sim.state.returningPlayers || []).map(r => r.id));
    const leaked = declared.filter(id => onRoster.has(id) && !returned.has(id));
    ok(leaked.length === 0, `no declared player stayed enrolled (${leaked.length} leaks)`);

    const sizes = Sim.state.teams.map(t => t.roster.length);
    ok(Math.max(...sizes) <= 15, `no roster exceeds 15 (max ${Math.max(...sizes)})`);
    ok(Math.min(...sizes) >= 9, `no roster collapsed (min ${Math.min(...sizes)})`);
  }

  const ratings = Sim.state.activePlayers.map(p => parseFloat(p.rating));
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  ok(mean > 64 && mean < 76, `league rating has not drifted (mean ${mean.toFixed(1)})`);
  console.log('\nThree-season cycle stable.');
})().catch(e => { console.error(e.message); process.exit(1); });
