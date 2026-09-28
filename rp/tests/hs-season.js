// The high-school side of a season: recruit rankings that move and land
// on the sheet's final ranking, commitments spread over the season, late
// reclassifications, the McDonald's / Jordan Brand / Hoop Summit games,
// and uncommitted internationals turning pro and entering the draft.
const fs = require('fs');
const path = require('path');
const { boot, playSeason, ok } = require('./harness');

const FIX = path.join(__dirname, 'fixtures');

(async () => {
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const { Sim, window: w } = boot({ roster, recruits });
  const HS = w.HSCore;

  // ---------- the rules, on their own ----------
  const cls = Array.from({ length: 60 }, (_, i) => ({ name: `Player ${i + 1}`, recClassYear: 2029, rsci: i + 1, rating: 90 - i * 0.3, state: 'TX', school: 'Duke' }));
  const final = HS.rankClass(cls, 1);
  ok(cls.every(r => final.get(r) === r.rsci), 'at the end of the season the ranking is exactly the sheet\'s');
  const early = HS.rankClass(cls, 0.5);
  ok(cls.some(r => early.get(r) !== r.rsci), 'at the start of the senior season it is not');
  ok([...early.values()].sort((a, b) => a - b).every((v, i) => v === i + 1), 'mid-season ranks run 1..N with no gaps');
  const moves = cls.map(r => Math.abs(early.get(r) - r.rsci));
  ok(moves.filter(m => m >= 20).length >= 1 && moves.filter(m => m <= 5).length >= cls.length / 2, 'most players move a few spots; a few move a lot');

  ok(cls.some(r => !HS.commitVisible(r, 0.5)) && cls.some(r => HS.commitVisible(r, 0.5)), 'some commitments are public by the senior season, some are not');
  ok(cls.every(r => HS.commitVisible(r, 1)), 'every commitment is public at the end');
  const at = cls.map(HS.commitAt);
  ok(at.some(a => a < 0.5) && at.some(a => a > 0.9), 'commitments spread from the junior year to the spring');

  const kam = { name: 'Kameron Jackson', recClassYear: 2029, rsci: 4, dob: '12/12/2011' };
  ok(HS.reclassFrom(kam) === 2030, 'Kameron Jackson reclassifies from 2030');
  ok(HS.reclassFrom({ name: 'Grant Elliot', recClassYear: 2029, rsci: 10, dob: '6/2/2011' }) === 2030, 'so does Grant Elliot');
  ok(HS.reclassFrom({ name: 'Louie Pierce', recClassYear: 2030, rsci: 22 }) === 2031, 'and Louie Pierce, 2031 to 2030');
  ok(HS.reclassFrom({ name: 'Young Guy', recClassYear: 2031, rsci: 40, dob: '10/2/2013' }) === 2032, 'a ranked player born after August 31 of his year is young for his class');
  ok(HS.reclassFrom({ name: 'Normal Guy', recClassYear: 2031, rsci: 40, dob: '6/2/2013' }) === null, 'one born in the normal window is not');
  ok(HS.reclassFrom({ name: 'Sheet Says', recClassYear: 2031, reclassFrom: 2032 }) === 2032, 'a Reclass column in the sheet is honored');
  ok(HS.currentClass(kam, 2028, 0.2) === 2030 && HS.currentClass(kam, 2028, 1) === 2029, 'he is listed in 2030 until late in the season, then in 2029');

  const intl = Array.from({ length: 14 }, (_, i) => ({ name: `Intl ${i}`, recClassYear: 2029, rsci: null, rating: 85 - i, state: 'INT', school: '' }));
  const noFlags = HS.selectRosters(cls.concat(intl), 2029, []);
  ok(noFlags.mcd.length === 24 && noFlags.mcd.every(r => r.rsci <= 35), 'with nothing in the sheet, 24 McDonald\'s All-Americans come from the top 35');
  ok(noFlags.mcd.filter(r => r.rsci <= 15).length >= 12, '...leaning toward the top of it');
  ok(noFlags.jbc.length === 24 && noFlags.jbc.every(r => r.rsci <= 75), 'the Jordan Brand Classic takes 24 from the top 75');
  ok(noFlags.nhs.usa.length === 12 && noFlags.nhs.usa.every(r => r.rsci <= 30 && !HS.isInternational(r)), 'Hoop Summit: 12 Americans from the top 30');
  ok(noFlags.nhs.world.length === 12 && noFlags.nhs.world.every(HS.isInternational), '...against 12 internationals');
  const flaggedCls = cls.map((r, i) => ({ ...r, allStar: { mcd: i >= 20 && i < 44, jbc: false, nhs: false } }));
  const withFlags = HS.selectRosters(flaggedCls, 2029, []);
  ok(withFlags.mcd.every(r => r.allStar.mcd), 'selections in the sheet\'s accolades column are used as they are');
  const ew = HS.splitEastWest(noFlags.mcd.map((r, i) => ({ ...r, state: ['CA', 'NY', 'TX', 'FL'][i % 4] })));
  ok(ew.East.length === 12 && ew.West.length === 12, 'East and West, 12 a side');

  ok(HS.turnsPro({ state: 'INT', school: '' }) && HS.turnsPro({ state: 'INT', school: 'Real Madrid' }, n => n === 'Duke'), 'an uncommitted international, or one signed with a club, turns pro');
  ok(!HS.turnsPro({ state: 'INT', school: 'Duke' }, n => n === 'Duke') && !HS.turnsPro({ state: 'TX', school: '' }), 'one committed to a college, or an American, does not');
  const line = HS.proLine({ name: 'X', recClassYear: 2029, rating: 85, recRating: 94, pos: 'SF' }, 2028, 0);
  const st0 = HS.proStats(line, 0), st1 = HS.proStats(line, 1);
  ok(st0.gp === 0 && st1.gp >= 30 && parseFloat(st1.ppg) > 2 && parseFloat(st1.ppg) < 16 && parseFloat(st1.mpg) < 30,
    `a teenage pro's line is modest against grown men (${st1.ppg} ppg in ${st1.mpg} mpg)`);

  // ---------- a season ----------
  await Sim.init();
  await Sim.startNewGame();
  const incoming = Sim.getIncomingRecruitClassYear();
  const view0 = Sim.hsClassView(incoming);
  ok(view0.length > 50 && view0.some(e => e.school) && view0.some(e => !e.school && !e.club), 'preseason: some of the class has committed, some has not');
  ok((Sim.state.proPlayers || []).length > 0 && Sim.state.proPlayers.every(p => p.isPro && p.conference === 'Pro' && p.club),
    `uncommitted internationals are playing pro (${Sim.state.proPlayers.map(p => `${p.name}, ${p.club}`).slice(0, 3).join('; ')})`);
  ok(!Sim.state.activePlayers.some(p => p.isPro), 'no pro is on a college roster');

  ok(await playSeason(Sim), 'season played');
  const cal = Sim.state.hsCalendar;
  ok(cal && cal.year === Sim.state.year && (cal.wire || []).length > 10, `the recruiting wire filled up over the season (${(cal.wire || []).length} items)`);
  ok(cal.wire.some(x => x.kind === 'commit'), 'commitments came in during the season');
  ['mcd', 'jbc', 'nhs'].forEach(k => {
    const e = cal.events[k];
    const teams = e ? Object.keys(e.rosters) : [];
    ok(e && e.result && teams.length === 2 && teams.every(t => e.rosters[t].length === 12),
      `${HS.EVENTS[k].name}: two teams of 12, played (${e && e.result ? `${e.result.home.name} ${e.result.home.score}, ${e.result.away.name} ${e.result.away.score}` : 'not played'})`);
    ok(e.result.home.score > 80 && e.result.away.score > 80, `${HS.EVENTS[k].short} is an all-star shootout, not a grind`);
    ok(e.result.mvp && [e.result.home, e.result.away].some(t => t.lines.some(l => l.id === e.result.mvp.id)), `${HS.EVENTS[k].short} has an MVP from the game`);
    const g = Sim.allStarLiveGame(k);
    ok(g && g.events[g.events.length - 1].h === e.result.home.score && g.events[g.events.length - 1].a === e.result.away.score,
      `${HS.EVENTS[k].short} can be watched in Game Center, ending on the real score`);
  });
  const nhs = cal.events.nhs.rosters;
  const byId = new Map(Sim.state.allRecruits.map(r => [r.id, r]));
  ok(nhs.World.every(id => HS.isInternational(byId.get(id))) && nhs.USA.every(id => !HS.isInternational(byId.get(id))), 'Hoop Summit: USA against the World');

  const viewF = Sim.hsClassView(incoming);
  ok(viewF.filter(e => e.rank).every(e => e.rank === Number(e.r.rsci)), 'after the title game the class ranking is exactly the sheet\'s');
  ok(viewF.filter(e => HS.committedTo(e.r) && !e.pro).every(e => e.school === HS.committedTo(e.r)), '...and every commitment is public');

  const board = Sim.computeDraftBigBoard(120);
  ok(board.some(e => e.player.isPro), `pros are on the draft board (${board.filter(e => e.player.isPro).map(e => `#${board.indexOf(e) + 1} ${e.player.name}`).join(', ')})`);
  const snap = Sim.buildUniverseSnapshot();
  ok(snap.draft.pool.some(p => p.isPro && p.draftClass), 'the Draft RP\'s published pool carries the pros');

  const di = Sim.OFFSEASON_STAGES.findIndex(s => s.key === 'draft');
  for (let i = 0; i <= di; i++) await Sim.simulateWeek();
  const draftedPros = (Sim.state.draftResults || []).filter(r => Sim.state.proPlayers.some(p => p.id === r.id));
  for (let i = di + 1; i < Sim.OFFSEASON_STAGES.length; i++) await Sim.simulateWeek();
  ok(!Sim.state.proPlayers.some(p => draftedPros.some(d => d.id === p.id)), `drafted pros leave the pro pool (${draftedPros.map(d => '#' + d.pick + ' ' + d.name).join(', ') || 'none drafted'})`);
  ok(!Sim.state.activePlayers.some(p => p.isPro), 'and no pro ever joins a college roster');
  ok(Sim.state.hsCalendar.year === Sim.state.year && Object.keys(Sim.state.hsCalendar.events).length === 0, 'the new season starts a new high-school calendar');

  console.log('\nHigh-school season verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
