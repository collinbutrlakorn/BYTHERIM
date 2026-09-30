// Recruiting quotas in the NCAA RP: generated recruits in the sim, and
// next year's commitments measured against the room each program has.
const fs = require('fs');
const path = require('path');
const { boot, ok } = require('./harness');
const FIX = path.join(__dirname, 'fixtures');

(async () => {
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const { Sim } = boot({ roster, recruits });
  await Sim.init();
  await Sim.startNewGame();
  const S = Sim.state;

  const gen = S.allRecruits.filter(r => r.genRecruit);
  ok(gen.length > 500, `generated recruits reach the NCAA RP (${gen.length})`);
  ok(gen.every(r => r.rating > 0 && r.recClassYear), 'with ratings and classes');
  const overseas = gen.filter(r => String(r.state).toUpperCase() === 'INT');
  ok(overseas.length > 10, `overseas prospects come too (${overseas.length})`);

  // Crowd one program with next year's generated commits.
  const next = S.year + 1;
  const team = S.teams.find(t => t.school === 'Kansas');
  const room = Sim.projectedRoom(team);
  const pool = S.recruits.filter(r => r.genRecruit && Number(r.recClassYear) === next && r.school && r.school !== 'Uncommitted' && r.school !== 'Free Agent');
  ok(pool.length > 40, `next year's class has generated commits waiting (${pool.length})`);
  const crowd = pool.slice(0, room + 6);
  crowd.forEach(r => { r.school = 'Kansas'; r.committedSchool = 'Kansas'; });
  const sheetKansas = S.recruits.filter(r => !r.genRecruit && Number(r.recClassYear) === next && r.school === 'Kansas');
  const allFlips = Sim.rebalanceRecruitCommits(next);
  const flips = allFlips.filter(f => f.from === 'Kansas');
  const nowKansas = S.recruits.filter(r => Number(r.recClassYear) === next && r.school === 'Kansas');
  ok(flips.length >= 6 && flips.every(f => f.to !== 'Kansas'), `an over-committed program loses its extra commits (${flips.length} flipped; ${allFlips.length} across the country)`);
  ok(nowKansas.length <= Math.max(room, sheetKansas.length), `and ends up at its room (${nowKansas.length} of ${room})`);
  ok(sheetKansas.every(r => r.school === 'Kansas'), 'sheet commitments are never moved');
  const kept = nowKansas.filter(r => r.genRecruit).map(r => parseFloat(r.recRating));
  const gone = crowd.filter(r => r.school !== 'Kansas').map(r => parseFloat(r.recRating));
  ok(!kept.length || !gone.length || Math.min(...kept) >= Math.max(...gone) - 0.001, 'the best commits are the ones kept');
  const P = t => (S.teams.find(x => x.school === t) || {}).prestige;
  ok(flips.every(f => Math.abs(P(f.to) - P('Kansas')) <= 15), 'they land at programs of similar standing');
  ok((S.recruitFlips || []).length >= flips.length && Sim.buildUniverseSnapshot().recruitFlips.length >= flips.length, 'flips are kept and published for the recruiting page');
  console.log('\nRecruiting quotas OK.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
