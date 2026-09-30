// Live recruiting: generated prospects (and sheet players left
// uncommitted) are recruited as the NCAA RP's seasons play out, while the
// sheet's own commitments and its #1 recruit stay put.
const fs = require('fs');
const path = require('path');
const { boot, ok } = require('./harness');
const FIX = path.join(__dirname, 'fixtures');
const RL = require('../js/recruit-live.js');

(async () => {
  // ---- The pure pieces ----
  ok(RL.listSize(0.1) === 12 && RL.listSize(0.3) === 8 && RL.listSize(0.5) === 5 && RL.listSize(0.8) === 3, 'lists go 12, 8, 5, then a final 3');
  const sc = RL.schoolContext([
    { school: 'Blue', prestige: 92, history: [], simData: { wins: 20, losses: 8 }, expectedWinPct: 0.7, roster: [] },
    { school: 'Mid', prestige: 60, history: [{ ncaaWins: 3, ncaaSeed: 6 }], simData: { wins: 24, losses: 3 }, expectedWinPct: 0.5, coach: { rep: 80 }, roster: [] },
    { school: 'Flat', prestige: 60, history: [], simData: { wins: 12, losses: 15 }, expectedWinPct: 0.5, roster: [] }
  ]);
  ok(sc.Mid.pull > sc.Flat.pull + 15, `a trending mid-major with a good coach pulls above its prestige (${sc.Mid.pull.toFixed(1)} vs ${sc.Flat.pull.toFixed(1)})`);
  const five = { name: 'Test Five', rating: 96, pos: 'PG' };
  const three = { name: 'Test Three', rating: 74, pos: 'PG' };
  ok(RL.interest(five, 'Blue', sc) > RL.interest(five, 'Flat', sc) * 3, 'five-stars lean toward the blue bloods');
  ok(RL.interest(three, 'Flat', sc) > RL.interest(three, 'Blue', sc), 'three-stars land at their level');
  ok(RL.interest(three, 'Mid', sc, { friends: 1 }) > RL.interest(three, 'Mid', sc) * 1.5, 'a teammate already there is a real draw');
  ok(RL.interest(three, 'Mid', sc, { full: true }) < RL.interest(three, 'Mid', sc) * 0.3, 'a full class is not');
  const a = { name: 'A', hs: 'Oak Hill Academy', aauTeam: 'Team X', recClassYear: 2028 };
  const b = { name: 'B', hs: 'Elsewhere', aauTeam: 'Team X', recClassYear: 2028 };
  const c = { name: 'C', hs: 'Oak Hill Academy', aauTeam: '', recClassYear: 2031 };
  const idx = RL.teammateIndex([a, b, c], r => (r === b || r === c ? 'Mid' : null));
  ok(idx(a, 'Mid').map(r => r.name).join() === 'B', 'AAU teammates count; players classes apart don\'t');

  // ---- In the sim ----
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const sheetCommits = new Map();
  recruits.split('\n').slice(1).forEach(line => {
    const m = line.match(/^(\d+),(\d{4}),([^,]+),[^,]*,([^,]+),/);
    if (!m) return;
    const school = line.split(',').slice(-4)[0];
    if (school && !/uncommit/i.test(school)) sheetCommits.set(`${m[3]}|${m[2]}|${m[4]}`, school);
  });
  const { Sim, window: w } = boot({ roster, recruits });
  await Sim.init();
  await Sim.startNewGame();
  const S = Sim.state;
  const year = S.year;

  const key = r => `${r.name}|${r.recClassYear}|${r.hs}`;
  const sheetMoved = S.allRecruits.filter(r => !r.genRecruit && r.sheetCommitted && sheetCommits.has(key(r)) && r.school !== sheetCommits.get(key(r)));
  ok(sheetMoved.length === 0, `sheet commitments are never moved (${sheetMoved.map(r => r.name).join(', ')})`);
  const live = S.allRecruits.filter(r => Sim.isLiveRecruit(r));
  ok(live.length > 500 && live.every(r => r.liveInit), `generated prospects are recruited live (${live.length})`);
  ok(live.every(r => !r.sheetCommitted), 'and none of them were committed on the sheet');
  const later = live.filter(r => Number(r.recClassYear) > year + 2);
  ok(later.length > 100 && later.every(r => !r.liveCommitted && r.school === 'Uncommitted'), `classes the sim hasn't reached are wide open (${later.length})`);

  // Each class starts at #1 with the sheet's #1, generated around him.
  const ones = new Map();
  S.allRecruits.forEach(r => { if (Number(r.rsci) === 1) ones.set(Number(r.recClassYear), r); });
  const sheetOnes = [...ones.values()].filter(r => sheetCommits.size && !r.genRecruit);
  ok(sheetOnes.length >= 1 && [...ones.values()].filter(r => Number(r.recClassYear) === 2028).every(r => r.name === 'Tyson Pollard'), `the sheet's #1 recruit stays #1 (${[...ones.values()].map(r => `${r.recClassYear} ${r.name}`).join('; ')})`);

  // Play the season: lists shrink, commitments land.
  const nextYear = live.filter(r => Number(r.recClassYear) === year + 2);
  const sizes0 = nextYear.map(r => (r.liveList || []).length);
  const avg = xs => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const committed0 = nextYear.filter(r => r.liveCommitted).length;
  await Sim.skipTo('ncaa');
  const open = nextYear.filter(r => !r.liveCommitted);
  const committed1 = nextYear.filter(r => r.liveCommitted).length;
  ok(avg(open.map(r => r.liveList.length)) < avg(sizes0), `lists shrink as the season goes (${avg(sizes0).toFixed(1)} → ${avg(open.map(r => r.liveList.length)).toFixed(1)} schools)`);
  ok(committed1 > committed0, `and commitments land along the way (${committed0} → ${committed1} in the ${year + 2} class)`);
  const commits = live.filter(r => r.liveCommitted);
  ok(commits.every(r => r.school && (r.liveOver || []).every(o => o !== r.school)), 'each commit is picked over the others on his list');

  // Teammates.
  const withMates = commits.filter(r => r.liveWith);
  const bad = withMates.filter(r => !S.allRecruits.some(x => x !== r && x.name === r.liveWith && HSCoreCommitted(x) === r.school));
  ok(!bad.length, `players joining teammates really are joining them (${withMates.length}${bad.length ? '; not: ' + bad.map(r => `${r.name} → ${r.school} with ${r.liveWith}`).join(', ') : ''})`);

  // Prestige matters: the top of a class goes to better programs than the bottom.
  const P = s => (S.teams.find(t => t.school === s) || {}).prestige || 0;
  const top = commits.filter(r => Number(r.rsci) > 0 && Number(r.rsci) <= 25).map(r => P(r.school));
  const low = commits.filter(r => Number(r.rsci) > 150).map(r => P(r.school));
  ok(top.length > 5 && low.length > 5 && avg(top) > avg(low) + 10, `top-25 prospects land at stronger programs (${avg(top).toFixed(0)} vs ${avg(low).toFixed(0)} prestige)`);

  // A coaching change shakes commitments loose.
  const target = commits.find(r => Number(r.recClassYear) === year + 2);
  const M = w.eval('Math');            // the sim's own Math, inside its window
  const rnd = M.random;
  M.random = () => 0;
  const reopened = Sim.reopenAfterCoachChanges(new Set([target.school]));
  M.random = rnd;
  ok(reopened.includes(target) && target.liveDecommitFrom && target.school === 'Uncommitted', `${target.name} reopens after his school's coaching change`);

  // Published for the recruiting page.
  const snap = Sim.buildUniverseSnapshot().recruitingLive;
  ok(snap && snap.classes.join() === `${year + 1},${year + 2}` && snap.openFrom === year + 3, 'the live classes are published with the universe');
  const t = snap.players.find(x => x.n === target.name);
  ok(t && t.live && !t.s && t.d === target.liveDecommitFrom && t.l.length, 'with lists, commitments and decommitments');
  ok(snap.players.some(x => x.live && x.s && x.o), 'including who a commit picked his school over');

  console.log('\nLive recruiting OK.');
  process.exit(0);

  function HSCoreCommitted(r) { const s = r.school || r.committedSchool; return s && s !== 'Uncommitted' ? s : ''; }
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
