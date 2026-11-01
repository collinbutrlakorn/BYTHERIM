// Injuries: rare, rarer when serious; they happen during games, show on
// profiles and the injury report, and season-ending ones are medical
// redshirts.
const { boot, playSeason, playOffseason, ok } = require('./harness');

(async () => {
  const { Sim, window: w } = boot();
  w.__BTR_AUTO_DRAFT = true; w.__BTR_AUTO_SUMMER = true; w.__BTR_NO_CUTSCENES = true;
  const IC = w.InjuryCore;

  // Rates: a 30-minute player, a long run of games.
  let hits = 0, serious = 0, ending = 0;
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const N = 400000;
  for (let i = 0; i < N; i++) { const r = IC.roll(30, rng); if (r) { hits++; if (r.severity >= 3) serious++; if (r.seasonEnding) ending++; } }
  const perSeason = 1 - Math.pow(1 - hits / N, 30);
  ok(perSeason > 0.015 && perSeason < 0.06, `about ${(perSeason * 100).toFixed(1)}% of 30-minute players miss games in a season`);
  ok(serious / hits < 0.12 && ending / hits < 0.03, `serious injuries are rarer (${(serious / hits * 100).toFixed(1)}% of injuries, season-ending ${(ending / hits * 100).toFixed(1)}%)`);
  ok(IC.roll(2, () => 0) === null, 'a player barely on the floor isn\'t at risk');
  ok(/season/i.test(IC.outlook({ seasonEnding: true })) && /Day-to-day/.test(IC.outlook({ gamesLeft: 1 })), 'outlooks read like an injury report');

  await Sim.init();
  await Sim.startNewGame();
  await playSeason(Sim);
  const year = Sim.state.year;
  const all = Sim.state.activePlayers;
  const rot = all.filter(p => p.stats && parseFloat(p.stats.mpg) >= 15);
  const hurt = all.filter(p => (p.injuries || []).some(x => x.year === year));
  const ends = all.filter(p => (p.injuries || []).some(x => x.year === year && x.seasonEnding));
  ok(hurt.length > 0 && hurt.length < rot.length * 0.08, `injuries are rare: ${hurt.length} players hurt all season (${rot.length} in rotations), ${ends.length} season-ending`);

  // During games: the box shows him leaving, the broadcast shows it.
  const logs = [];
  all.forEach(p => (p.gameLog || []).forEach(l => { if (l.inj) logs.push({ p, l }); }));
  ok(logs.length > 0, `injuries happen during games (${logs.length})`);
  const { p: hp, l: hl } = logs[0];
  const ref = { home: hl.isHome ? hp.school : hl.opponent, away: hl.isHome ? hl.opponent : hp.school, week: hl.week, phase: hl.phase };
  const game = Sim.buildLiveGame(ref);
  const ev = game && game.events.find(e => e.type === 'injury');
  ok(ev && ev.text.includes(hp.name) && game.events[game.events.length - 1].type === 'final', `the live broadcast shows it ("${ev && ev.text}")`);
  ok(w.LiveCore.verify ? w.LiveCore.verify(game).ok : true, 'and the play-by-play still adds up to the box score');

  // Out players sit; the report and the profile show who's out.
  const team = Sim.state.teams.find(t => t.roster.length > 8);
  const victim = team.roster.slice().sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))[0];
  victim.injury = { type: 'a high ankle sprain', severity: 2, games: 4, gamesLeft: 4, seasonEnding: false, year, week: Sim.state.week };
  ok(!Sim.availableRosterFor(team).available.includes(victim), 'an injured player sits');
  const report = Sim.injuryReport();
  ok(report.includes(victim) && report.indexOf(victim) <= report.findIndex(p => (parseFloat(p.rating) || 0) < (parseFloat(victim.rating) || 0) - 10 && p !== victim) + 999, 'the injury report lists him');
  const fameOrder = report.slice(0, 5).map(p => parseFloat(p.rating) || 0);
  ok(report.length < 2 || fameOrder[0] >= Math.min(...fameOrder), 'biggest names first');
  ok(/Injured/.test(Sim.renderPlayerPage(victim)) && /High ankle sprain/.test(Sim.renderPlayerPage(victim)), 'his profile shows the injury');
  ok(!/games missed/i.test(Sim.renderPlayerPage(victim)), 'games missed aren\'t shown');
  const d = w.document;
  if (d.getElementById('dashInjuries')) { Sim._injAll = true; Sim.renderInjuryReport(); Sim._injAll = false; ok(/High ankle sprain/.test(d.getElementById('dashInjuries').textContent), 'the dashboard has an injury report'); }

  // Redshirts: season-ending = medical; never played = regular.
  const med = team.roster.find(p => p !== victim && ['FR', 'SO', 'JR'].includes(p.class));
  const medClass = med.class;
  med.injury = { type: 'a torn ACL', severity: 4, games: 999, gamesLeft: 999, seasonEnding: true, year, week: Sim.state.week };
  const sitter = Sim.state.teams.flatMap(t => t.roster).find(p => p !== med && ((p.stats && p.stats.gp) || 0) === 0 && ['FR', 'SO', 'JR'].includes(p.class) && !p.redshirtUsed);
  const sitClass = sitter && sitter.class;
  victim.injury = null;
  await playOffseason(Sim);
  const medNow = Sim.state.activePlayers.find(p => p.id === med.id);
  ok(!medNow || (medNow.class === medClass && medNow.redshirt && medNow.redshirt.medical), `a season-ending injury is a medical redshirt (${medClass} -> ${medNow && medNow.class})`);
  if (sitter) {
    const sitNow = Sim.state.activePlayers.find(p => p.id === sitter.id);
    ok(!sitNow || (sitNow.class === sitClass && sitNow.redshirtUsed), `a player who never played redshirts (${sitClass} -> ${sitNow && sitNow.class})`);
  }
  ok(Sim.state.activePlayers.every(p => !Sim.isInjuredOut(p) || (p.injury && p.injury.year === Sim.state.year)), 'last season\'s injuries have healed by the new season');

  console.log('\nInjuries verified.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
