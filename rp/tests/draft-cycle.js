// The pre-draft cycle the Draft RP runs: combine, lottery, workouts, the
// withdrawal deadline and draft night. Plays a season, then walks the
// cycle one step at a time and checks each step's output is believable
// and actually matters to where players are drafted.
const { boot, playSeason, ok } = require('./harness');

(async () => {
  const { Sim, window: w } = boot();
  await Sim.init();
  await Sim.startNewGame();
  ok(await playSeason(Sim), 'season played');

  // ---- shot tracking ----
  {
    const played = Sim.state.activePlayers.filter(p => p.statsFull && p.statsFull.gp >= 10);
    const logs = played.flatMap(p => p.gameLog.filter(g => g.min > 0));
    ok(logs.length > 1000 && logs.every(g => g.rimA != null && g.rimM <= g.rimA && g.rimA <= g.twoPa && g.twoPm - g.rimM <= g.twoPa - g.rimA && g.dunkA <= g.rimA && g.dunkM <= g.dunkA),
      'every game records his rim attempts, dunks and other twos, adding back up to the box score');
    const tot = k => played.reduce((n, p) => n + (p.statsFull[k] || 0), 0);
    const fg = k => played.reduce((n, p) => { const [m, a] = String(p.statsFull[k]).split('-').map(Number); return [n[0] + m, n[1] + a]; }, [0, 0]);
    const fga = tot('totFga'), rim = fg('rimFg'), mid = fg('midFg'), dunk = fg('dunkFg');
    ok(rim[1] / fga > 0.27 && rim[1] / fga < 0.42 && rim[0] / rim[1] > 0.54 && rim[0] / rim[1] < 0.67, `about a third of all shots come at the rim, made about 60% of the time (${(rim[1] / fga * 100).toFixed(0)}% at ${(rim[0] / rim[1] * 100).toFixed(1)}%)`);
    ok(mid[0] / mid[1] > 0.32 && mid[0] / mid[1] < 0.43, `non-rim twos go in far less often (${(mid[0] / mid[1] * 100).toFixed(1)}%)`);
    ok(dunk[1] / fga > 0.025 && dunk[1] / fga < 0.09, `dunks are a small share of shots (${(dunk[1] / fga * 100).toFixed(1)}%)`);
    const grp = g => played.filter(p => w.DraftCycle.group(p.pos) === g);
    const dunkRate = list => list.reduce((n, p) => n + Number(p.statsFull.dunkFg.split('-')[1]), 0) / list.reduce((n, p) => n + p.statsFull.totFga, 0);
    ok(dunkRate(grp('big')) > dunkRate(grp('guard')) * 4, `bigs dunk far more than guards (${(dunkRate(grp('big')) * 100).toFixed(1)}% vs ${(dunkRate(grp('guard')) * 100).toFixed(1)}% of shots)`);
    ok(played.every(p => p.born || p.dob), 'every player has a birthday');
  }
  const DC = w.DraftCycle;
  ok(DC && DC.STAGES.length === 6, 'six steps: declarations, combine, lottery, workouts, deadline, draft night');
  ok(Sim.state.draftCycle && Sim.state.draftCycle.stage === 'declared' && Sim.state.draftCycle.year === Sim.state.year + 1,
    'the cycle opens at declarations when the title game ends');
  await Sim.simulateWeek();                     // season wrap-up
  ok(!Sim.isDraftComplete(), 'the draft has not happened yet');

  const step = () => Sim.applyDraftStep(DC.advance(Sim.draftContext()));
  const declaredCount = Sim.state.draftDeclarations.length;
  const underclass = Sim.state.draftDeclarations.filter(d => !d.isPro && !['SR', 'GR'].includes(Sim.normalizeClassStanding(d.class) || d.class)).length;
  ok(underclass >= 80 && underclass <= 190, `about 130 college underclassmen enter the draft (${underclass})`);

  // ---- combine ----
  step();
  ok(Sim.state.draftCycle.stage === 'combine', 'combine held');
  const invited = Sim.state.activePlayers.filter(p => p.predraft && p.predraft.invited);
  ok(invited.length >= 40 && invited.length <= Math.max(90, declaredCount), `combine invites (${invited.length} of ${declaredCount} declared)`);
  const m = invited.map(p => p.predraft.meas);
  ok(m.every(x => x.wingspan - x.barefoot >= -2 && x.wingspan - x.barefoot <= 9.5), 'wingspans are believable (-2" to +9.5")');
  ok(m.every(x => x.reach >= 88 && x.reach <= 121), 'standing reach between 7\'4" and 10\'1"');
  ok(m.every(x => x.shoes - x.barefoot === 1.25 && x.bodyFat >= 3.6 && x.bodyFat <= 14.5), 'shoes add 1.25"; body fat in range');
  const tested = invited.filter(p => p.predraft.tests);
  ok(tested.length >= invited.length - 6, 'nearly everyone tests; only a few projected top picks sit out');
  ok(tested.every(p => { const t = p.predraft.tests; return t.maxVert > t.standVert && t.maxVert <= 46 && t.lane >= 10.2 && t.lane <= 12.9 && t.sprint >= 2.98 && t.sprint <= 3.62; }),
    'athletic testing lands in real combine ranges');
  const guards = tested.filter(p => DC.group(p.pos) === 'guard'), bigs = tested.filter(p => DC.group(p.pos) === 'big');
  const avg = (a, f) => a.reduce((s, p) => s + f(p), 0) / Math.max(1, a.length);
  ok(avg(guards, p => p.predraft.tests.lane) < avg(bigs, p => p.predraft.tests.lane), 'guards are quicker through the lane agility drill than bigs');
  // Everyone invited is measured, so compare the whole invited class.
  const mGuards = invited.filter(p => DC.group(p.pos) === 'guard'), mBigs = invited.filter(p => DC.group(p.pos) === 'big');
  const reachGap = avg(mBigs, p => p.predraft.meas.reach) - avg(mGuards, p => p.predraft.meas.reach);
  ok(reachGap > 6, `bigs have far more reach (${reachGap.toFixed(1)}" on average)`);
  ok(tested.every(p => Object.values(p.predraft.pct).every(v => v >= 0 && v <= 100)), 'percentiles are 0-100 within position group');
  ok(invited.every(p => DC.PERSONALITIES[p.predraft.personality]), 'every prospect has a personality');
  ok(invited.every(p => /^[ABCD][+-]?$/.test(p.predraft.grade)), 'every prospect gets a combine grade');
  ok(invited.every(p => p.predraft.notes.length >= 1 && /barefoot/.test(p.predraft.notes[0])), 'each prospect has combine notes');
  ok(new Set(invited.map(p => p.predraft.personality)).size >= 4, 'personalities vary across the class');

  // Standouts: lesser-known prospects who test, measure or shoot their way up.
  const standouts = invited.filter(p => p.predraft.standout >= 3);
  ok(standouts.length >= 3 && standouts.every(p => p.predraft.notes.some(n => /Combine standout/.test(n))), `combine standouts every year (${standouts.length})`);
  ok(invited.filter(p => p.predraft.combineRank <= 10).every(p => (p.predraft.standout || 0) < 3), 'the projected top ten have little to prove at the combine');
  // A prospect's stock actually moves the board.
  const riser = invited.slice().sort((a, b) => b.predraft.stock - a.predraft.stock)[0];
  const withStock = w.DraftCore.scoreProspect(riser, 0.5, { draftYear: Sim.upcomingDraftYear() }).score;
  const without = w.DraftCore.scoreProspect(riser, 0.5, { draftYear: 1999 }).score;
  ok(withStock > without, `combine stock counts on the board for this draft only (${riser.name} +${(withStock - without).toFixed(1)})`);

  // ---- lottery ----
  step();
  const lot = Sim.state.draftCycle.lottery;
  ok(Sim.state.draftCycle.stage === 'lottery' && lot.order.length === 60 && lot.winners.length === 4, 'lottery drawn: four winners, a 60-pick order');
  ok(lot.field.length === 14 && lot.field.every(f => f.pick >= 1 && f.pick <= 14), 'the 14 lottery teams all pick in the top 14');

  // ---- workouts ----
  step();
  const wo = Sim.state.activePlayers.filter(p => p.predraft && p.predraft.workouts);
  ok(Sim.state.draftCycle.stage === 'workouts' && wo.length >= 40, `team workouts held (${wo.length} prospects)`);
  const visits = wo.flatMap(p => p.predraft.workouts);
  ok(visits.every(v => v.teamId && DC.ORG_STYLES[v.style]), 'every workout has an NBA team and that team\'s workout style');
  const grades = new Set(visits.filter(v => v.grade).map(v => v.grade));
  ok(grades.size >= 4, `workouts vary (${[...grades].join(', ')})`);
  ok(visits.every(v => v.note && v.note.length > 10), 'each workout has a note');
  ok(Object.keys(Sim.state.draftCycle.interest).length >= 20, 'teams come out of workouts with favourites');
  const styleByTeam = {};
  visits.forEach(v => { styleByTeam[v.teamId] = styleByTeam[v.teamId] || new Set(); styleByTeam[v.teamId].add(v.style); });
  ok(Object.values(styleByTeam).every(s => s.size === 1), 'each franchise runs its workouts one way');

  // ---- deadline ----
  step();
  ok(Sim.state.draftCycle.stage === 'deadline', 'withdrawal deadline passed');
  const back = Sim.state.returningPlayers;
  ok(back.every(r => !r.mandatory && !r.scripted), 'nobody out of eligibility or scripted withdraws');
  ok(Sim.state.draftDeclarations.length + back.length === declaredCount, `everyone either stays in or withdraws (${back.length} withdrew)`);

  // ---- draft night ----
  step();
  ok(Sim.state.draftCycle.stage === 'complete' && Sim.isDraftComplete(), 'draft night held');
  const picks = Sim.state.draftResults;
  ok(picks.length === 60 && new Set(picks.map(p => p.id)).size === 60, '60 picks, no one twice');
  const olderFirst = picks.filter(p => p.pick <= 30 && ['JR', 'SR', 'GR'].includes(p.class));
  ok(olderFirst.length >= 2, `upperclassmen go in the first round too (${olderFirst.map(p => `#${p.pick} ${p.class}`).join(', ')})`);
  ok(picks.filter(p => p.pick <= 5).every(p => ['FR', 'SO', 'Pro'].includes(p.class)) || picks.filter(p => p.pick <= 5 && ['JR', 'SR', 'GR'].includes(p.class)).length <= 1, 'the very top of the draft stays young');
  ok(picks.every((p, i) => p.team && p.team.id === lot.order[i]), 'picks follow the order drawn on lottery night');
  // A mid-major goes in the first round only with exceptional numbers (or
  // a combine that made scouts look again).
  {
    const byId = Sim.draftContext().byId;
    const midFirst = picks.filter(p => p.pick <= 30).map(p => byId[p.id]).filter(p => p && !p.isPro && p.conference && !w.DraftCore.POWER_SIX.has(p.conference));
    const explained = p => { const e = w.DraftCore.scoreProspect(p, 0.5, { draftYear: Sim.upcomingDraftYear() }); return e.midMajorPenalty < 2 || (p.predraft && p.predraft.standout >= 3) || Sim.scriptedDraftFor(p); };
    ok(midFirst.length <= 5 && midFirst.every(explained), `mid-major first-rounders had exceptional numbers or a standout combine (${midFirst.map(p => `${p.name}, ${p.conference}`).join('; ') || 'none'})`);
  }
  ok(picks.every(p => !back.some(r => r.id === p.id)), 'no withdrawn player is drafted');
  ok(picks.filter(p => p.workedOut).length >= 10, `teams draft players who impressed them in workouts (${picks.filter(p => p.workedOut).length})`);
  const hist = Sim.state.draftHistory.find(d => d.year === Sim.upcomingDraftYear());
  ok(hist && hist.board && hist.board.length === 60 && hist.board[0].rank === 1, 'the final big board is kept with the draft');
  ok(hist.board.filter(b => b.pick).length >= 45, 'the kept board marks where its players went');
  // Draft-night files for the 2K draft class tool (RP admin).
  ok(hist.profiles && picks.every(p => hist.profiles[p.id] && hist.profiles[p.id].stats), 'every pick\'s full profile is kept with the draft');
  const measured = picks.filter(p => (hist.profiles[p.id].predraft || {}).meas);
  ok(picks.filter(p => p.pick <= 30).every(p => (hist.profiles[p.id].predraft || {}).meas) && measured.length >= 40,
    `with his combine measurements (every first-rounder; ${measured.length} of 60 picks were invited)`);
  {
    const TwoK = require('../js/twok-core.js');
    const cls = TwoK.buildClass(picks.map(p => ({ file: hist.profiles[p.id], pick: p.pick, round: p.round, team: p.team.name })), hist.year);
    const mean = (a, b) => cls.slice(a, b).reduce((s, x) => s + x.ovr, 0) / (b - a);
    ok(cls.length === 60 && cls.slice(0, 3).every(x => x.ovr >= 76) && mean(0, 10) > mean(10, 30) && mean(10, 30) > mean(30, 60),
      `the class converts to 2K rookies on the draft-slot curve (top 10 avg ${mean(0, 10).toFixed(1)}, 11-30 ${mean(10, 30).toFixed(1)}, 31-60 ${mean(30, 60).toFixed(1)})`);
  }

  // The offseason moves on.
  await Sim.simulateWeek();
  ok(Sim.state.offseasonStageIndex === 3 && (Sim.state.lastTransfers || []).length > 0, `with draft night done, one step opens the transfer portal (${(Sim.state.lastTransfers || []).length} moves)`);
  console.log('\nDraft cycle verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
