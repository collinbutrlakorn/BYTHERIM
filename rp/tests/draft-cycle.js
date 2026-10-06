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
  ok(picks.every(p => !back.some(r => r.id === p.id)), 'no withdrawn player is drafted');
  ok(picks.filter(p => p.workedOut).length >= 10, `teams draft players who impressed them in workouts (${picks.filter(p => p.workedOut).length})`);
  const hist = Sim.state.draftHistory.find(d => d.year === Sim.upcomingDraftYear());
  ok(hist && hist.board && hist.board.length === 60 && hist.board[0].rank === 1, 'the final big board is kept with the draft');
  ok(hist.board.filter(b => b.pick).length >= 45, 'the kept board marks where its players went');

  // The offseason moves on.
  await Sim.simulateWeek();
  ok(Sim.state.offseasonStageIndex === 3 && (Sim.state.lastTransfers || []).length > 0, `with draft night done, one step opens the transfer portal (${(Sim.state.lastTransfers || []).length} moves)`);
  console.log('\nDraft cycle verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
