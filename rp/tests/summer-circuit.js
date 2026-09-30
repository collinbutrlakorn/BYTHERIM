// The summer circuit: AAU programs and the FIBA youth World Cup, played
// between the transfer portal and the new season.
const fs = require('fs');
const path = require('path');
const { boot, playSeason, ok } = require('./harness');
const FIX = path.join(__dirname, 'fixtures');
global.RosterGen = require('../js/roster-gen.js');
require('../js/recruit-gen.js');
const SC = require('../js/summer-core.js');

(async () => {
  // ---- The pure pieces ----
  ok(SC.fibaEvent(2030).name === 'FIBA U17 World Cup' && SC.fibaEvent(2029).name === 'FIBA U19 World Cup', 'the U17 World Cup in even summers, the U19 in odd ones');
  const players = [];
  for (let i = 0; i < 60; i++) players.push({ id: 'p' + i, name: 'P' + i, aauTeam: i < 3 ? 'Sheet Squad' : '', state: ['GA', 'TX', 'CA', 'NY', 'OH'][i % 5], rank: i + 1, rating: 95 - i * 0.3, sheet: i < 3 });
  const { programs } = SC.assignPrograms(players, 2030);
  const sizes = programs.map(p => p.roster.length);
  ok(Math.min(...sizes) >= 5 && Math.max(...sizes) <= SC.ROSTER_MAX, `rosters come out even (${sizes.join(' ')})`);
  const guest = programs.find(p => p.name === 'Sheet Squad');
  ok(guest && ['p0', 'p1', 'p2'].every(id => guest.roster.includes(id)), 'a sheet player\'s own AAU team plays, with him on it');

  // ---- In the sim ----
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const { Sim, window: w } = boot({ roster, recruits });
  await Sim.init();
  await Sim.startNewGame();
  const S = Sim.state;
  ok(Sim.OFFSEASON_STAGES.map(s => s.key).join() === 'summary,draft,portal,summer,rosters', 'the summer circuit is an offseason step, after the portal');
  await playSeason(Sim);
  const year = S.year;
  let guard = 0;
  while ((S.offseasonStageIndex || 0) < 3 && guard++ < 5) await Sim.simulateWeek();
  ok(S.offseasonStageIndex === 3 && !S.summer, 'after the portal, the summer is next');

  // Rank and grade before the summer, to compare.
  const before = new Map();
  [year + 2, year + 3].forEach(c => Sim.hsClassView(c).forEach(e => before.set(e.r.id, e.rank)));
  const t0 = Date.now();
  await Sim.simulateWeek();
  const ms = Date.now() - t0;
  const sm = S.summer;
  ok(S.offseasonStageIndex === 4 && sm && sm.season === year + 1, `the summer of ${year + 1} is played (${ms} ms)`);
  ok(sm.aau.circuits.length === 3 && sm.aau.circuits.every(c => c.standings.length >= 4 && c.champion && c.final.lines), `three circuits, each with a league and a championship (${sm.aau.circuits.map(c => `${c.event}: ${c.champion}`).join('; ')})`);
  const onAau = new Set(sm.aau.programs.flatMap(p => p.roster));
  const aauClasses = S.allRecruits.filter(r => onAau.has(r.id)).map(r => Number(r.recClassYear));
  ok(onAau.size > 300 && aauClasses.every(c => c === year + 2 || c === year + 3), `the rising seniors and juniors play AAU (${onAau.size} players)`);
  const f = sm.fiba;
  ok(f && f.name === SC.fibaEvent(year + 1).name && f.groups.length === 4 && f.medals.gold && f.medals.silver && f.medals.bronze, `the ${f.name}: ${f.medals.gold} gold, ${f.medals.silver} silver, ${f.medals.bronze} bronze`);
  const usa = f.rosters.find(t => t.name === 'USA');
  ok(usa && usa.players.filter(p => !p.depth).length >= 8, 'Team USA is made of the universe\'s prospects');

  // Players carry their summers.
  const played = S.allRecruits.filter(r => r.summer && r.summer.season === year + 1);
  const withAau = played.filter(r => r.summer.aau).length;
  ok(withAau >= onAau.size * 0.95, `every AAU player has his summer line (${withAau} of ${onAau.size}; ${played.length - withAau} FIBA only)`);
  const ex = played.find(r => r.summer.aau && r.summer.aau.gp >= 12);
  ok(ex && ['ppg', 'rpg', 'apg', 'bpm', 'ts', 'usg', 'fg3', 'rimFga'].every(k => ex.summer.aau[k] != null), 'lines in the recruiting page\'s columns');
  const ppgs = played.filter(r => r.summer.aau && r.summer.aau.gp >= 12).map(r => r.summer.aau.ppg).sort((a, b) => b - a);
  ok(ppgs[0] >= 14 && ppgs[0] <= 40 && ppgs[Math.floor(ppgs.length / 2)] >= 3, `sensible scoring (top ${ppgs[0]}, median ${ppgs[Math.floor(ppgs.length / 2)]} ppg)`);
  ok(played.some(r => (r.summerHonors || []).some(h => /Peach Jam champion/.test(h.text))), 'champions and award winners are honored');
  const mvp = sm.aau.circuits[0].mvp;
  ok(mvp && S.allRecruits.find(r => r.id === mvp.id).summerHonors.some(h => /MVP/.test(h.text)), `${mvp.name} is the ${sm.aau.circuits[0].name} MVP`);

  // Breakouts move up and draw offers; the #1 stays #1.
  const risers = played.filter(r => r.summerBuzz >= 2 && Number(r.rsci) > 10);
  ok(risers.length >= 5, `some players have breakout summers (${risers.length})`);
  const after = new Map();
  [year + 2, year + 3].forEach(c => Sim.hsClassView(c).forEach(e => after.set(e.r.id, e.rank)));
  const up = risers.filter(r => before.get(r.id) && after.get(r.id) < before.get(r.id));
  ok(up.length >= risers.length * 0.6, `breakouts climb the rankings (${up.length} of ${risers.length})`);
  [year + 2, year + 3].forEach(c => {
    const one = S.allRecruits.find(r => Number(r.recClassYear) === c && Number(r.rsci) === 1);
    if (one) ok(after.get(one.id) === 1 || before.get(one.id) !== 1, `the ${c} #1 stays #1 (${one.name})`);
  });
  const pending = (S.pendingWire || []).map(x => x.text);
  ok(pending.some(t => /Breakout summer/.test(t)), 'breakouts go on the recruiting wire');
  const fibaAges = f.rosters.flatMap(t => t.players.filter(p => !p.depth)).map(p => Number((S.allRecruits.find(r => r.id === p.id) || {}).recClassYear));
  ok(fibaAges.every(c => c >= year + 1 && c <= year + 3), `only players of age play at the ${f.short} (classes ${Math.min(...fibaAges)}-${Math.max(...fibaAges)})`);
  const top8 = t => { const v = t.players.map(p => p.depth ? null : S.allRecruits.find(r => r.id === p.id)).filter(Boolean).map(r => w.HSCore.proTalent(r)).sort((a, b) => b - a).slice(0, 8); return v.reduce((n, x) => n + x, 0) / 8; };
  const strongest = f.rosters.slice().sort((a, b) => top8(b) - top8(a))[0];
  ok(strongest.name === 'USA', `Team USA is the favorite (${Object.entries(f.medals).map(([m, n]) => m + ' ' + n).join(', ')})`);

  // The offseason page and the broadcast.
  Sim.openOffseason('summer');
  const d = w.document;
  const page = () => d.getElementById('offseasonBody').textContent;
  ok(/Nike EYBL/.test(page()) && /Watch the final/.test(page()) && /Breakout summers/.test(page()), 'the Summer Circuit page shows the circuits, the finals to watch and the breakouts');
  const live = Sim.summerLiveGame('EYBL');
  ok(live && (live.plays || live.events || live.timeline || Object.keys(live).length > 3), 'a final can be watched');
  Sim.revealSummerFinal('fiba');
  ok(new RegExp(f.medals.gold).test(page()) && /All-Star Five/.test(page()), 'the result can be revealed instead');

  // Recruit card and snapshot.
  const card = Sim.renderRecruitCard(ex);
  ok(/Summer circuit/.test(card) && /PPG/.test(card), 'the recruit card shows his summer');
  const snap = Sim.buildUniverseSnapshot().summer;
  ok(snap && snap.season === year + 1 && snap.circuits.length === 3 && snap.players.length >= 300 && snap.players.some(p => p.aau && p.t), 'the summer is published for the recruiting page');
  ok(JSON.stringify(snap).length < 900000, `and stays a sensible size (${Math.round(JSON.stringify(snap).length / 1024)} KB)`);

  // On into the next season.
  await Sim.simulateWeek();
  ok(S.year === year + 1 && !S.ncaaDone, 'the new season starts after the summer');
  ok(S.summer && S.summer.season === S.year, 'last summer is still there during the season');
  ok((S.hsCalendar.wire || []).some(x => /Breakout summer/.test(x.text)) && !(S.pendingWire || []).length, 'the new season\'s recruiting wire opens with the summer');

  console.log('\nSummer circuit OK.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
