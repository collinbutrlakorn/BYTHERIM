// Generated recruits: every class filled to a top 250 around the sheet.
const fs = require('fs'), path = require('path');
const JS = path.join(__dirname, '..', 'js');
global.window = global;
eval(fs.readFileSync(path.join(JS, 'teams-master.js'), 'utf8').replace(/^const TeamsMaster/m, 'global.TeamsMaster'));
global.RosterGen = require(path.join(JS, 'roster-gen.js'));
require(path.join(JS, 'prestige.js'));
const G = require(path.join(JS, 'recruit-gen.js'));
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAILED: ' + m); n++; console.log('  ok  ' + m); };

// A class tab with 60 authored players rated down from 95, all committed.
const sheet = (count = 60, extra = []) => Array.from({ length: count }, (_, i) => ({
  __tab: '2030', rank: String(i + 1), classYear: '2030', name: `Sheet Player ${i + 1}`, state: 'TX',
  rating: String(Math.round(95 - i * 0.2)), stars: i < 20 ? '5' : '4', committedSchool: i % 2 ? 'Duke' : 'Kansas', pos: 'SF'
})).concat(extra);
const build = rows => G.augment(rows, { classes: ['2030'] }).filter(r => r.classYear === '2030');

const a0 = build(sheet());
const overseasRows = a0.filter(r => r.generated && r.state === 'INT');
const a = a0.filter(r => r.state !== 'INT');
const gen = a.filter(r => r.generated === 'TRUE');
ok(a.length === 250 && a.every(r => /^\d+$/.test(r.rank)), `the class is filled to a top 250 (${gen.length} generated, ${overseasRows.length} overseas on the radar)`);
const byRank = a.slice().sort((x, y) => x.rank - y.rank);
const sheetOrder = byRank.filter(r => !r.generated).map(r => r.name);
ok(sheetOrder.every((nm, i) => nm === `Sheet Player ${i + 1}`), 'sheet players keep their own order');
ok(gen.some(r => Number(r.rank) <= 60), 'generated players can rank among the sheet players');
ok(new Set(a.map(r => r.rank)).size === a.length, 'no two players share a rank');
ok(new Set(a.map(r => r.name.toLowerCase())).size === a.length, 'no generated player shares a name with anyone');
ok(gen.every(r => r.pos && r.height && r.hometown && r.hs && r.dob && r.scouting && r.offers && r.hs_ppg), 'every generated player has a bio, offers and stats');
ok(gen.every(r => r.committedSchool && r.finalList.includes(r.committedSchool)), 'in a committed class they commit, to a school on their final list');
ok(a0.every(r => Number(r.stars) === (r.rating >= 90 ? 5 : r.rating >= 80 ? 4 : r.rating >= 70 ? 3 : 0)), 'stars come from the rating: 90+ five, 80+ four, 70+ three');
const lowR = build(sheet(60, [{ __tab: '2030', rank: '61', classYear: '2030', name: 'Low Rated', state: 'TX', rating: '68', pos: 'SF' }])).find(r => r.name === 'Low Rated');
ok(lowR.rank === '' && !lowR.stars, 'a player rated under 70 is unranked');
const tops = Array.from({ length: 200 }, (_, i) => G.classTop(2028 + i));
ok(Math.min(...tops) >= 94 && Math.max(...tops) === 99 && tops.filter(t => t === 99).length < 20 && tops.filter(t => t <= 95).length > 20, `some classes are stronger than others (#1 rated ${Math.min(...tops)}-${Math.max(...tops)}, a 99 in ${tops.filter(t => t === 99).length} of 200)`);
ok(G.projectionFor(99) === 'Generational talent' && /All-NBA/.test(G.projectionFor(97)) && /All-Star/.test(G.projectionFor(96)), 'ratings read as projections');
// Prep schools and academies at the top of the class.
let top5 = 0, top5Prep = 0, back = 0, backPrep = 0;
for (let y = 2050; y < 2080; y++) {
  G.augment([], { classes: [String(y)] }).filter(r => r.rank).forEach(r => {
    if (+r.rank <= 5) { top5++; if (G.ACADEMIES.includes(r.hs)) top5Prep++; }
    if (+r.rank > 150) { back++; if (G.ACADEMIES.includes(r.hs)) backPrep++; }
  });
}
ok(top5Prep / top5 >= 0.88 && backPrep / back < 0.45, `top-5 prospects are almost all at prep schools or academies (${Math.round(100 * top5Prep / top5)}%), the back of the class mostly isn't (${Math.round(100 * backPrep / back)}%)`);
// Internationals: a few in American high schools, ranked; others overseas.
ok(overseasRows.length >= 8 && overseasRows.every(r => r.rank === '' && r.country && r.intl_team && r.hs), 'overseas prospects are on the radar, unranked, with their club');
ok(overseasRows.some(r => r.committedSchool) && overseasRows.some(r => !r.committedSchool && r.proClub), 'some overseas prospects commit to college, others stay pro');
let usIntl = 0;
for (let y = 2050; y < 2060; y++) usIntl += G.augment([], { classes: [String(y)] }).filter(r => r.rank && r.country).length;
ok(usIntl > 10 && usIntl < 90, `a few internationals play high school in the States and are ranked (${usIntl} across ten classes)`);
const withCan = build(sheet(60, [{ __tab: '2030', rank: '30', classYear: '2030', name: 'Maple Leaf', state: 'CAN', rating: '90', pos: 'PG' }]));
const ml = withCan.find(r => r.name === 'Maple Leaf');
ok(/^\d+$/.test(ml.rank) && withCan.filter(r => r.rank === ml.rank).length === 1, 'a ranked international on the sheet keeps a place in the ranking');
const top = gen.filter(r => Number(r.rank) <= 25).map(r => r.committedSchool);
const bottom = gen.filter(r => Number(r.rank) > 200).map(r => r.committedSchool);
const avgP = l => l.reduce((s, x) => s + Prestige.historyScore(x, (TeamsMaster.find(t => t.name === x) || {}).conference), 0) / Math.max(1, l.length);
ok(!top.length || avgP(top) > avgP(bottom) + 15, `top prospects land at bigger programs (${avgP(top).toFixed(0)} vs ${avgP(bottom).toFixed(0)})`);

// Schools sign about as many as they have room for.
const per = {};
a0.filter(r => r.generated && r.committedSchool).forEach(r => { per[r.committedSchool] = (per[r.committedSchool] || 0) + 1; });
const sheetPer = {}; sheet().forEach(r => { sheetPer[r.committedSchool] = (sheetPer[r.committedSchool] || 0) + 1; });
const over = Object.entries(per).filter(([s, n]) => n + (sheetPer[s] || 0) > G.quotaFor(Prestige.historyScore(s, (TeamsMaster.find(t => t.name === s) || {}).conference)) + 1 && !sheetPer[s]);
ok(Object.keys(per).length > 60 && over.length <= 3, `commits spread across ${Object.keys(per).length} schools, each taking about its quota (${over.length} over)`);

// The same class twice is the same class.
const b = build(sheet());
ok(JSON.stringify(a0.map(r => [r.name, r.rank, r.committedSchool])) === JSON.stringify(b.map(r => [r.name, r.rank, r.committedSchool])), 'every page builds the same players');

// A new sheet player moves generated players down; nobody is renamed.
const c = build(sheet(60, [{ __tab: '2030', rank: '5', classYear: '2030', name: 'New Star', state: 'CA', rating: '97', committedSchool: 'UCLA', pos: 'PG' }]));
const genA = gen.map(r => r.name), genC = c.filter(r => r.generated && r.state !== 'INT').map(r => r.name);
ok(genC.every((nm, i) => nm === genA[i]) && genC.length === genA.length - 1, 'adding a sheet player drops the last generated one and renames no one');

// A class the sheet hasn't committed stays uncommitted; stubs get filled in.
const stubs = Array.from({ length: 12 }, (_, i) => ({ __tab: '2038', rank: String(i + 1), classYear: '2038', name: `Stub ${i + 1}` }));
const d = G.augment(stubs, { classes: ['2038'] });
ok(d.filter(r => r.generated).every(r => !r.committedSchool && /Uncommitted/.test(r.status)), 'an uncommitted class stays uncommitted, overseas players too');
const st = d.find(r => r.name === 'Stub 1');
ok(st.pos && st.rating && st.height && st.rank === '1', 'a sheet player with only a name gets a build and bio, and keeps his rank');

// The NCAA RP's parser lower-cases the column names.
const low = G.augment([{ __tab: '2030', rank: '1', classyear: '2030', name: 'Low Key', state: 'OH', rating: '93', committedschool: 'Ohio State' }], { keys: 'lower', classes: ['2030'] });
const lg = low.find(r => r.generated);
ok(lg.classyear === '2030' && 'committedschool' in lg && 'hsppg' in lg && !('classYear' in lg), 'rows match the NCAA RP\'s column names');

// Tabs with no generation asked for are left alone.
ok(G.augment(sheet(), { classes: [] }).length > 60, 'class tabs present in the rows are filled even without a tab list');
console.log(`\nGenerated recruits OK (${n} checks).`);
