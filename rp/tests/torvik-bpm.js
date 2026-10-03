// BPM the Barttorvik way (js/torvik-bpm.js): the team identity, opponent
// adjustment, position lean, and a simulated season whose spread matches
// Barttorvik's Division I numbers.
const T = require('../js/torvik-bpm.js');
const { boot, ok } = require('./harness');

// ---- unit checks ----
const line = (min, o = {}) => ({ min, pts: 0, fga: 0, fta: 0, threePm: 0, ast: 0, tov: 0, oreb: 0, dreb: 0, stl: 0, blk: 0, pf: 0, ...o });
const team = (name, k) => [0, 1, 2, 3, 4].map(i => ({
  key: `${name}${i}`, team: name, pos: ['PG', 'SG', 'SF', 'PF', 'C'][i],
  s: line(1200, { pts: 500 * k + i * 20, fga: 400, fta: 120, threePm: 40, ast: 80 + (i === 0 ? 100 : 0), tov: 60, oreb: 20 + i * 15, dreb: 80 + i * 30, stl: 30, blk: 5 + i * 12, pf: 60 })
}));
const players = [...team('A', 1.1), ...team('B', 1.0), ...team('C', 0.9)];
const games = [];
const g = (a, b, pa, pb) => { games.push({ team: a, opp: b, pf: pa, pa: pb, loc: 0 }, { team: b, opp: a, pf: pb, pa: pa, loc: 0 }); };
for (let i = 0; i < 10; i++) { g('A', 'B', 75, 68); g('B', 'C', 72, 66); g('A', 'C', 80, 64); }
const res = T.season(players, games);
['A', 'B', 'C'].forEach(name => {
  const t = res.teams.get(name);
  const sum = players.filter(p => p.team === name).reduce((n, p) => n + res.players.get(p.key).bpm, 0);   // each plays a fifth of minutes x5 => share 1
  ok(Math.abs(sum - T.TEAM_FACTOR * (t.adjO - t.adjD)) < 0.01, `team ${name}: minutes-weighted BPM sums to 1.2 x AdjEM (${sum.toFixed(2)} vs ${(1.2 * (t.adjO - t.adjD)).toFixed(2)})`);
});
ok(res.teams.get('A').adjO - res.teams.get('A').adjD > res.teams.get('C').adjO - res.teams.get('C').adjD, 'the team that wins by more has the higher AdjEM');
const one = res.players.get('A0');
ok(Math.abs(one.dbpm - (one.bpm - one.obpm)) < 1e-9, 'DBPM is BPM minus OBPM');
// Opponent adjustment: the same margin against a stronger schedule rates higher.
const g2 = [];
const add = (a, b, pa, pb) => { g2.push({ team: a, opp: b, pf: pa, pa: pb, loc: 0 }, { team: b, opp: a, pf: pb, pa: pa, loc: 0 }); };
for (let i = 0; i < 8; i++) { add('Strong', 'Weak', 80, 60); add('X', 'Strong', 70, 70); add('Y', 'Weak', 70, 70); }
const r2 = T.teamRatings(g2, new Map([['Strong', 68], ['Weak', 68], ['X', 68], ['Y', 68]]));
const em = n => r2.teams.get(n).adjO - r2.teams.get(n).adjD;
ok(em('X') > em('Y') + 5, `a .500 team against a strong schedule out-rates one against a weak schedule (${em('X').toFixed(1)} vs ${em('Y').toFixed(1)})`);
ok(T.expected(85, 'C') > T.expected(85, 'PG'), 'expected BPM leans toward big men, as Barttorvik\'s does');

// ---- a simulated season ----
(async () => {
  const { Sim } = boot();
  await Sim.init();
  await Sim.startNewGame();
  let i = 0;
  while (!Sim.state.regularSeasonDone && i < 60) { await Sim.simulateWeek(); i++; }
  const rot = Sim.state.activePlayers.filter(p => p.statsFull && p.statsFull.gp >= 15 && parseFloat(p.statsFull.mpg) >= 15);
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))]; };
  const b = rot.map(p => parseFloat(p.statsFull.bpm));
  // Barttorvik, D1 players with 15+ games at 15+ minutes (2024-25, 2025-26):
  // 10th percentile about -4.5, median about 0, 90th about +5.3, top 1% +10.
  ok(q(b, 0.1) > -6.5 && q(b, 0.1) < -3, `10th percentile BPM ${q(b, 0.1).toFixed(1)} (Barttorvik about -4.5)`);
  ok(Math.abs(q(b, 0.5)) < 1.5, `median BPM ${q(b, 0.5).toFixed(1)} (Barttorvik about 0)`);
  ok(q(b, 0.9) > 3.8 && q(b, 0.9) < 7, `90th percentile BPM ${q(b, 0.9).toFixed(1)} (Barttorvik about +5.3)`);
  ok(q(b, 0.99) > 7 && q(b, 0.99) < 14, `top 1% BPM ${q(b, 0.99).toFixed(1)} (Barttorvik about +10)`);
  const med = pos => q(rot.filter(p => pos.includes(p.pos)).map(p => parseFloat(p.statsFull.bpm)), 0.5);
  ok(med(['C']) > med(['PG', 'SG']) + 1, `centres rate above guards (median ${med(['C']).toFixed(1)} vs ${med(['PG', 'SG']).toFixed(1)})`);
  const dmed = pos => q(rot.filter(p => pos.includes(p.pos)).map(p => parseFloat(p.statsFull.dbpm)), 0.5);
  ok(dmed(['C']) > dmed(['PG', 'SG']) + 1.5, `and most of that is defense (DBPM ${dmed(['C']).toFixed(1)} vs ${dmed(['PG', 'SG']).toFixed(1)})`);
  // Same box score is worth more in a strong league.
  const HM = new Set(['ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East']);
  const hm = q(rot.filter(p => HM.has(p.conference)).map(p => parseFloat(p.statsFull.bpm)), 0.5);
  const lo = q(rot.filter(p => !HM.has(p.conference)).map(p => parseFloat(p.statsFull.bpm)), 0.5);
  ok(hm > lo + 1.5, `high-major rotation players rate higher (median ${hm.toFixed(1)} vs ${lo.toFixed(1)}; Barttorvik +4.1 vs -1.0)`);
  const conf = rot.filter(p => p.statsConf && p.statsConf.gp >= 10);
  ok(conf.length > 500 && conf.some(p => p.statsConf.bpm !== p.statsFull.bpm), 'conference-only splits get their own BPM');
  const top = Sim.state.teams.slice().sort((a, c) => c.simData.adjEM - a.simData.adjEM)[0];
  ok(top.simData.adjEM > 18 && top.simData.adjEM < 45, `the best team's AdjEM is on Division I's scale (${top.school} ${top.simData.adjEM})`);
  console.log('\nBPM matches Barttorvik.');
})().catch(e => { console.error(e.message); process.exit(1); });
