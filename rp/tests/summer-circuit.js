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
  // A new save opens with the summer before its first season played.
  const opening = S.summer;
  ok(opening && opening.season === S.year && opening.done && opening.finished && opening.fiba && /U17/.test(opening.fiba.name), `a new save has the summer of ${S.year} behind it (${opening && opening.fiba && opening.fiba.name})`);
  const openLines = S.allRecruits.filter(r => r.summer && r.summer.season === S.year && r.summer.aau);
  ok(openLines.length > 300 && openLines.every(r => [S.year + 1, S.year + 2].includes(Number(r.recClassYear))), `its AAU lines are on the rising seniors and juniors (${openLines.length})`);
  ok((S.hsCalendar.wire || []).some(w => w.kind === 'summer'), 'and the season\'s recruiting wire opens with it');
  // Lines follow what each player is written to have done at that level.
  const calib = openLines.filter(r => r.written && r.written.aau && r.summer.aau.gp >= 8);
  const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const w2 = avg(calib.map(r => r.written.aau[8])), s2 = avg(calib.map(r => parseFloat(r.summer.aau.fg2)));
  const wa = avg(calib.map(r => r.written.aau[4] / r.written.aau[1])), sa = avg(calib.map(r => r.summer.aau.apg / r.summer.aau.mpg));
  ok(calib.length > 200 && Math.abs(w2 - s2) < 3.5 && Math.abs(wa - sa) / wa < 0.2, `shooting and passing as written (2P% ${w2.toFixed(1)} written, ${s2.toFixed(1)} played; assists per minute ${wa.toFixed(3)} vs ${sa.toFixed(3)})`);
  const ag = opening.games.filter(g => g.ev !== 'FIBA').map(g => g.b[0].reduce((n, l) => n + l[1], 0));
  ok(ag.every(m => m >= 155 && m <= 165), `AAU games are 32 minutes (${Math.min(...ag)}-${Math.max(...ag)} team minutes)`);
  await playSeason(Sim);
  const year = S.year;
  let guard = 0;
  while ((S.offseasonStageIndex || 0) < 3 && guard++ < 5) await Sim.simulateWeek();
  ok(S.offseasonStageIndex === 3 && S.summer && S.summer.season === year, 'after the portal, the summer is next');

  // Rank and grade before the summer, to compare.
  const before = new Map();
  [year + 2, year + 3].forEach(c => Sim.hsClassView(c).forEach(e => before.set(e.r.id, e.rank)));

  // The summer is a short season: each click plays one step.
  await Sim.simulateWeek();
  const P = S.summer;
  ok(P && P.v === 2 && P.season === year + 1 && P.step === 1 && S.offseasonStageIndex === 3, `the first click tips off the summer of ${year + 1} (Session 1 of ${P && P.steps.length} steps)`);
  ok(P.steps.map(x => x.key).join() === 's1,s2,s3,s4,cq,cf,fg,fk,fm', 'four AAU sessions, the championships, then the World Cup');
  const s1 = P.games.filter(g => g.st === 's1');
  const perProgram = {};
  s1.forEach(g => { perProgram[g.h] = (perProgram[g.h] || 0) + 1; perProgram[g.a] = (perProgram[g.a] || 0) + 1; });
  ok(s1.length > 60 && Object.values(perProgram).every(n => n === 3), `Session 1: three games for every program (${s1.length} games)`);
  ok(s1.every(g => g.b[0].length >= 5 && g.b[1].length >= 5 && g.b[0].reduce((n, l) => n + l[2], 0) === g.hs), 'every game is kept with its box score, adding up to the final');
  const early = S.allRecruits.find(r => r.summer && r.summer.live && r.summer.aau);
  ok(early && early.summer.aau.gp <= 3, `lines fill in as the summer goes (${early && early.summer.aau.gp} games so far)`);
  let v = Sim.currentSummer();
  ok(v.aau.circuits.every(c => c.standings.reduce((n, t) => n + t.w + t.l, 0) === 2 * c.sessions[0].length), 'standings count the games played');
  Sim.openOffseason('summer');
  const d = w.document;
  const page = () => d.getElementById('offseasonBody').textContent;
  ok(/Play the summer on the Recruiting page/.test(page()) && /Next: AAU Session 2/.test(page()) && /Session 1/.test(page()) && /The rest of the summer/.test(page()), 'the Summer Circuit page shows the results so far, what\'s next, and where to play it');
  ok(d.querySelector('#offseasonBody a[href="../recruiting/#/summer"]'), 'with a link to the Recruiting page');
  ok(/Play Session 2/.test(d.getElementById('offseasonAdvanceBtn').innerText || d.getElementById('offseasonAdvanceBtn').textContent), 'Continue plays the next step');

  const t0 = Date.now();
  let clicks = 1;
  while (!P.done && clicks < 20) { await Sim.simulateWeek(); clicks++; }
  const ms = Date.now() - t0;
  ok(P.done && clicks === P.steps.length && S.offseasonStageIndex === 3, `the summer takes ${clicks} steps (${ms} ms for the rest)`);
  v = Sim.currentSummer();
  const sm = v;
  ok(sm.aau.circuits.length === 3 && sm.aau.circuits.every(c => c.standings.length >= 4 && c.champion && c.final && c.final.lines && c.bracket.length === 3), `three circuits, each with a league and a championship (${sm.aau.circuits.map(c => `${c.event}: ${c.champion}`).join('; ')})`);
  const onAau = new Set(sm.aau.programs.flatMap(p => p.roster));
  const aauClasses = S.allRecruits.filter(r => onAau.has(r.id)).map(r => Number(r.recClassYear));
  ok(onAau.size > 300 && aauClasses.every(c => c === year + 2 || c === year + 3), `the rising seniors and juniors play AAU (${onAau.size} players)`);
  const f = sm.fiba;
  ok(f && f.name === SC.fibaEvent(year + 1).name && f.groups.length === 4 && f.groups.every(g => g.games.length === 6) && f.knockout.length === 4 && f.medals.gold, `the ${f.name}: ${f.medals.gold} gold, ${f.medals.silver} silver, ${f.medals.bronze} bronze`);
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
  ok(/Nike EYBL/.test(page()) && /Watch/.test(page()) && /Show result/.test(page()) && /Breakout summers/.test(page()) && /summer is over/.test(page()), 'the Summer Circuit page shows the circuits, the finals to watch and the breakouts');
  const champ = sm.aau.circuits[0].champion;
  ok(!new RegExp(`${champ} win the`).test(page()), 'a final\'s result stays hidden until it\'s watched');
  const anyGame = P.games.find(g => g.st === 's3');
  ok(Sim.summerLiveGame(anyGame.id) && Sim.summerLiveGame('EYBL'), 'any game can be watched, finals included');
  let snap = Sim.buildUniverseSnapshot().summer;
  ok(!snap.circuits[0].champion && snap.games.filter(g => g.hidden).length >= 3, 'unwatched finals stay hidden on the recruiting page too');
  Sim.revealSummerFinal('fiba');
  Sim.setSummerTab('FIBA');
  ok(new RegExp(f.medals.gold).test(page()) && /All-Star Five/.test(page()), 'the result can be revealed instead');
  Sim.watchSummerFinal('EYBL');
  Sim.setSummerTab('EYBL');
  ok(new RegExp(`${champ} win the`).test(page()), 'and once it\'s watched, the champion shows');
  Sim.setSummerTab('leaders');
  ok(/AAU points/.test(page()) && /AAU assists/.test(page()), 'leaders across the circuits');
  while (S.offseasonStageIndex === 3) await Sim.simulateWeek();
  ok(S.offseasonStageIndex === 4, 'once the summer is over, Continue moves on to final rosters');

  // A simulated summer resembles each player's written AAU line.
  const pairs = played.filter(r => r.summer.aau && r.summer.aau.gp >= 10 && r.playstyle && r.playstyle.real && r.playstyle.real.per36 && r.playstyle.real.per36.aau)
    .map(r => [r.playstyle.real.per36.aau.pts, r.summer.aau.ppg / Math.max(1, r.summer.aau.mpg) * 36]);
  const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; }); return sxy / Math.sqrt(sxx * syy); };
  const rr = corr(pairs.map(p => p[0]), pairs.map(p => p[1]));
  ok(pairs.length > 200 && rr > 0.55, `simulated AAU scoring follows each player's written line (r = ${rr.toFixed(2)} over ${pairs.length} players)`);

  // Recruit card and snapshot.
  const card = Sim.renderRecruitCard(ex);
  ok(/Summer circuit/.test(card) && /PPG/.test(card), 'the recruit card shows his summer');
  snap = Sim.buildUniverseSnapshot().summer;
  ok(snap && snap.season === year + 1 && snap.circuits.length === 3 && snap.players.length >= 300 && snap.players.some(p => p.aau && p.t), 'the summer is published for the recruiting page');
  ok(snap.games.length === P.games.length && snap.games.filter(g => !g.hidden).every(g => g.b) && Object.keys(snap.names).length > 400, `with every game and box score (${snap.games.length} games)`);
  ok(JSON.stringify(snap).length < 1600000, `and stays a sensible size (${Math.round(JSON.stringify(snap).length / 1024)} KB)`);

  // On into the next season.
  await Sim.simulateWeek();
  ok(S.year === year + 1 && !S.ncaaDone, 'the new season starts after the summer');
  ok(S.summer && S.summer.season === S.year, 'last summer is still there during the season');
  ok((S.hsCalendar.wire || []).some(x => /Breakout summer/.test(x.text)) && !(S.pendingWire || []).length, 'the new season\'s recruiting wire opens with the summer');

  console.log('\nSummer circuit OK.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
