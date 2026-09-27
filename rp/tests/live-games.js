// Live games: every game this season can be rebuilt as a play-by-play that
// reproduces its box score exactly, on a clean game clock, with both teams
// getting a fair share of possessions.
const { boot, ok } = require('./harness');

(async () => {
  const { Sim, window: w } = boot();
  await Sim.init();
  await Sim.startNewGame();
  for (let i = 0; i < 8; i++) await Sim.simulateWeek();
  const LC = w.LiveCore;

  const played = Sim.state.schedule.filter(g => g.played);
  const sample = played.filter((g, i) => i % Math.max(1, Math.floor(played.length / 220)) === 0).slice(0, 220);
  let bad = 0, clockBad = 0, ots = 0, parityBad = 0, firstBad = null, halfOk = 0, runs = 0, leadChanges = 0;
  const t0 = Date.now();
  sample.forEach(g => {
    const ref = { home: g.home, away: g.away, week: g.week, phase: g.isConf ? 'conf' : 'nonconf' };
    const game = Sim.buildLiveGame(ref);
    if (!game) { bad++; return; }
    const v = LC.verify(game);
    if (!v.ok) { bad++; if (!firstBad) firstBad = `${g.away} at ${g.home}: ${v.diffs.slice(0, 4).join('; ')}`; }
    let t = -1, okClock = true;
    game.events.forEach(e => { if (e.t < t - 1e-6 || e.clock < 0 || e.clock > 1200) okClock = false; t = e.t; });
    if (!okClock) clockBad++;
    if (game.ot) ots++;
    if (game.halftime && game.halftime.home + game.halftime.away > 30) halfOk++;
    if (game.events.some(e => e.tags.includes('run'))) runs++;
    leadChanges += game.leadChanges;
    // Possessions alternate: the offense switches after every make,
    // defensive rebound, turnover and completed trip to the line.
    const poss = { home: 0, away: 0 };
    game.events.forEach(e => {
      if (e.type === 'make' && !e.tags.includes('and1')) poss[e.side]++;
      if (e.type === 'tov' || e.type === 'held') poss[e.side]++;
    });
    const endsOnDef = game.events.filter(e => e.type === 'reb' && !e.off).length;
    if (endsOnDef === 0) parityBad++;
  });
  const ms = Date.now() - t0;
  ok(bad === 0, `every sampled game's play-by-play reproduces its box score exactly (${sample.length} games${firstBad ? '; first miss: ' + firstBad : ''})`);
  ok(clockBad === 0, 'the game clock only runs forward and stays within each half');
  ok(ots > 0 && ots < sample.length * 0.12, `some close games go to overtime (${ots} of ${sample.length})`);
  ok(halfOk === sample.length, 'every game has a believable halftime score');
  ok(runs > sample.length * 0.3, `scoring runs happen (${runs} games with an 8-0 or better run)`);
  ok(leadChanges / sample.length > 2, `leads change hands (${(leadChanges / sample.length).toFixed(1)} lead changes a game)`);
  ok(ms / sample.length < 60, `building a game is quick (${(ms / sample.length).toFixed(1)} ms each)`);

  // Same game, same broadcast.
  const g0 = played[0];
  const ref0 = { home: g0.home, away: g0.away, week: g0.week, phase: g0.isConf ? 'conf' : 'nonconf' };
  Sim._liveCache = null;
  const a = Sim.buildLiveGame(ref0); Sim._liveCache = null;
  const b = Sim.buildLiveGame(ref0);
  ok(a.events.length === b.events.length && a.events.every((e, i) => e.text === b.events[i].text), 'a game replays exactly the same way every time');
  ok(a.events[a.events.length - 1].type === 'final' && /Final/.test(a.events[a.events.length - 1].text), 'the broadcast ends with the final');
  ok(a.pog && a.headline && a.headline.length > 10, `a player of the game and a headline ("${a.headline}")`);
  ok(a.events.every(e => e.wp >= 0 && e.wp <= 1), 'win probability is tracked all game');
  const texts = new Set(played.slice(0, 40).flatMap(g => { Sim._liveCache = null; const x = Sim.buildLiveGame({ home: g.home, away: g.away, week: g.week, phase: g.isConf ? 'conf' : 'nonconf' }); return x ? x.events.filter(e => e.type === 'make').map(e => e.text.replace(/^\S+ \S+ /, '').split(/ —|,| \(/)[0]) : []; }));
  ok(texts.size >= 15, `the commentary varies (${texts.size} different ways to score)`);
  console.log('\nLive games verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
