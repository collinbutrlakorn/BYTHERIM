// Scripted players: a short list of players whose seasons are written in
// advance (js/script-core.js). Checks the pieces on their own, then plays
// two seasons and a draft with the whole list in the league and holds each
// of them to what was written.
const fs = require('fs');
const path = require('path');
const JS = path.join(__dirname, '..', 'js');
global.window = global;
global.PlayerCore = require(path.join(JS, 'player-core.js'));
const SC = require(path.join(JS, 'script-core.js'));
const { boot, playSeason, playOffseason, ok } = require('./harness');
const FIX = path.join(__dirname, 'fixtures');

const num = v => parseFloat(v) || 0;
const box = (o = {}) => ({ min: 30, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  fgm: 0, fga: 0, twoPm: 0, twoPa: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0, ...o });
const sum = (rows, k) => rows.reduce((n, r) => n + r.box[k], 0);

(async () => {
  // ---- The table ----
  {
    const names = ['James Stewart Jr.', 'Kelvin Marion', 'Patrick Greene', 'Payton Gibson', 'Olumide Afolabi', 'Jakob Meyer',
      'Henry Vernie', 'Rodney Hunt', 'Raymond Towns', 'Jared Keefe', 'Dante Fletcher', 'Jared Moreno'];
    ok(names.every(n => SC.entryFor({ name: n })), 'all twelve players are in the table');
    ok(SC.entryFor({ name: 'james stewart jr' }) && SC.entryFor({ name: 'KELVIN  MARION' }), 'matched by name however it is written');
    ok(!SC.entryFor({ name: 'Mitchell Stewart' }) && !SC.entryFor({ name: 'Dante Gibson' }), 'and nobody with a similar name');
    const f = n => SC.entryFor({ name: n }).floors;
    ok(f('Kelvin Marion').stocks === 4 && f('Patrick Greene').ppg === 16 && f('Patrick Greene').apg === 4 && f('Payton Gibson').ppg === 13, 'the written minimums are the ones asked for (1)');
    ok(f('Olumide Afolabi').bpm === 10 && f('Dante Fletcher').ppg === 28 && f('Dante Fletcher').bpm === 17, 'the written minimums are the ones asked for (2)');
    ok(f('Rodney Hunt').ppg === 12 && f('Rodney Hunt').rpg === 6 && f('Rodney Hunt').stl === 2, 'the written minimums are the ones asked for (3)');
    ok(f('Raymond Towns').ppg === 16 && f('Raymond Towns').rpg === 7 && f('Raymond Towns').apg === 7 && SC.entryFor({ name: 'Raymond Towns' }).pos === 'PG', 'the written minimums are the ones asked for (4)');
    ok(f('Jared Keefe').ppg === 14 && f('Jared Keefe').rpg === 8 && f('Jared Keefe').blk === 3, 'the written minimums are the ones asked for (5)');
    ok(f('Jared Moreno').rpg === 7 && f('Jared Moreno').apg === 7 && SC.entryFor({ name: 'Jared Moreno' }).triple, 'the written minimums are the ones asked for (6)');
    ok(['Jakob Meyer', 'Henry Vernie'].every(n => { const d = SC.draftFor({ name: n }, { year: 2030 }); return d && d.year === 2032 && d.range === 3; }), 'Meyer and Vernie are scripted into the top three of 2032');
    const k = { name: 'Jared Keefe', stats: { gp: 0 } };
    ok(SC.draftFor(k, { year: 2031 }) === null, 'Keefe is not scripted before he has played');
    k.stats.gp = 20;
    const d = SC.draftFor(k, { year: 2031 });
    ok(d && d.year === 2031 && d.range === 14, 'after his first games he is a lottery pick that year');
    k.scriptedDraft = d;
    ok(SC.draftFor(k, { year: 2040 }) === d, 'and it stays the same year after year');
    ok(SC.targets({ name: 'Dante Fletcher' }).ppg > 28 && SC.targets({ name: 'Dante Fletcher' }).bpm > 17 && SC.targets({ name: 'Nobody' }) === null, 'the sim aims above each minimum');
  }

  // ---- Expectations ----
  {
    const weak = () => ({ mpg: 30, ppg: 9, rpg: 3, apg: 1.2, stl: 0.6, blk: 0.2, tov: 1.8, pf: 2.2, fta: 2.5, ftPct: 0.7, twoPPct: 0.48, threePPct: 0.33, threePar: 0.35 });
    const a = SC.liftExpectations(weak(), { name: 'Raymond Towns' });
    ok(a.ppg >= 16.5 && a.rpg >= 7.2 && a.apg >= 7.2, `a weak projection is lifted to the minimums (${a.ppg.toFixed(1)}/${a.rpg.toFixed(1)}/${a.apg.toFixed(1)})`);
    ok(a.fta > 2.5 && a.twoPPct > 0.48 && a.tov > 1.8, 'with more free throws, better shots and a few more turnovers');
    const b = SC.liftExpectations(JSON.parse(JSON.stringify(a)), { name: 'Raymond Towns' });
    ok(JSON.stringify(b) === JSON.stringify(a), 'lifting again changes nothing');
    const m = SC.liftExpectations(weak(), { name: 'Kelvin Marion' });
    ok(m.stl + m.blk >= 4.2 && m.stl >= 1.6 && m.blk >= 1.9, `steals plus blocks reach the minimum (${(m.stl + m.blk).toFixed(2)})`);
    const c = weak();
    ok(JSON.stringify(SC.liftExpectations(c, { name: 'Some Other Guy' })) === JSON.stringify(weak()), 'anyone else is untouched');
    const z = { ...weak(), mpg: 0 };
    ok(SC.liftExpectations(z, { name: 'Raymond Towns' }).ppg === 9, 'and so is a scripted player with no minutes');
    const strong = { ...weak(), ppg: 25, rpg: 9, apg: 8 };
    const s2 = SC.liftExpectations({ ...strong }, { name: 'Raymond Towns' });
    ok(s2.ppg === 25 && s2.rpg === 9 && s2.apg === 8, 'a line already above its minimums stays where it is');
  }

  // ---- Per-game correction ----
  {
    const mk = (name, stats) => ({ player: { name, stats, expectedStats: { mpg: 30, ppg: 16, rpg: 7, apg: 7 } }, box: box() });
    const team = () => [
      { ...mk('Raymond Towns', { gp: 10, totPts: 100, totReb: 40, totAst: 30 }), box: box({ pts: 8, reb: 3, ast: 2, fgm: 4, fga: 9, twoPm: 4, twoPa: 9 }) },
      { player: { name: 'A', stats: {}, expectedStats: {} }, box: box({ pts: 20, reb: 9, ast: 5, stl: 2, fgm: 8, fga: 15, twoPm: 7, twoPa: 12, threePm: 1, threePa: 3, ftm: 3, fta: 4 }) },
      { player: { name: 'B', stats: {}, expectedStats: {} }, box: box({ pts: 14, reb: 6, ast: 4, stl: 1, fgm: 5, fga: 11, twoPm: 4, twoPa: 8, threePm: 1, threePa: 3, ftm: 3, fta: 4 }) },
      { player: { name: 'C', stats: {}, expectedStats: {} }, box: box({ pts: 10, reb: 5, ast: 6, fgm: 4, fga: 9, twoPm: 4, twoPa: 7, threePa: 2, ftm: 2, fta: 2 }) }
    ];
    const own = team(), before = ['pts', 'reb', 'ast', 'fgm', 'fga'].map(k => sum(own, k));
    SC.correctBoxes(own, [], 22, () => 0.5);
    const after = ['pts', 'reb', 'ast', 'fgm', 'fga'].map(k => sum(own, k));
    ok(JSON.stringify(before) === JSON.stringify(after), 'moving production to him leaves the team line exactly as it was');
    const t = own[0].box;
    ok(t.pts > 8 && t.reb > 3 && t.ast > 2, `a player far behind pace gets the difference (${t.pts}/${t.reb}/${t.ast})`);
    ok(own.slice(1).every(r => r.box.pts >= 0 && r.box.reb >= 0 && r.box.ast >= 0 && r.box.fgm >= 0), 'and no teammate ends up with less than nothing');
    ok(own.every(r => r.box.pts === r.box.twoPm * 2 + r.box.threePm * 3 + r.box.ftm && r.box.fgm === r.box.twoPm + r.box.threePm && r.box.fga === r.box.twoPa + r.box.threePa),
      'every box still adds up (points, makes, attempts)');
    // On pace: left alone.
    const fine = team();
    fine[0].player.stats = { gp: 10, totPts: 180, totReb: 80, totAst: 80 };
    const snap = JSON.stringify(fine.map(r => r.box));
    SC.correctBoxes(fine, [], 22, () => 0.5);
    ok(JSON.stringify(fine.map(r => r.box)) === snap, 'a player on pace is left alone');
    // A steal nobody else had comes out of the other side's night.
    const marion = [{ player: { name: 'Kelvin Marion', stats: { gp: 12, totStl: 8, totBlk: 10 }, expectedStats: { mpg: 28, stl: 1.8, blk: 2.2 } }, box: box() },
      { player: { name: 'X', stats: {}, expectedStats: {} }, box: box() }];
    const opp = [{ player: { name: 'Y' }, box: box({ tov: 2, twoPa: 8, twoPm: 3 }) }];
    SC.correctBoxes(marion, opp, 20, () => 0.5);
    ok(marion[0].box.stl + marion[0].box.blk >= 3, `a steals-and-blocks floor is paid even with nobody to take from (${marion[0].box.stl}+${marion[0].box.blk})`);
    // Games he barely played are asked for less.
    const hurt = team();
    hurt[0].box.min = 8;
    SC.correctBoxes(hurt, [], 22, () => 0.5);
    ok(hurt[0].box.pts < 16, 'a game cut short by injury is asked for less');
    // Triple-double near miss
    const td = [{ player: { name: 'Jared Moreno', stats: { gp: 20, totPts: 400, totReb: 160, totAst: 160 }, expectedStats: { mpg: 30 } }, box: box({ pts: 15, reb: 10, ast: 9 }) },
      { player: { name: 'Z', stats: {}, expectedStats: {} }, box: box({ ast: 6, reb: 5 }) }];
    SC.correctBoxes(td, [], 12, () => 0.1);
    ok(td[0].box.ast >= 10, 'a triple-double threat one assist short gets it');
  }

  // ---- BPM floor ----
  {
    const lift = SC.bpmLift({ name: 'Dante Fletcher' }, 12.1, 8, 4.1, 20, 2030);
    ok(lift && lift.bpm >= 17.5 && lift.bpm <= 19 && Math.abs(lift.obpm + lift.dbpm - lift.bpm) < 1e-9, 'a season under his BPM minimum is raised past it, offense and defense together');
    const years = [2029, 2030, 2031, 2032, 2033].map(y => SC.bpmLift({ name: 'Dante Fletcher' }, 12, 8, 4, 20, y).bpm.toFixed(1));
    ok(new Set(years).size >= 4, `and not to the same number every year (${years.join(', ')})`);
    ok(SC.bpmLift({ name: 'Dante Fletcher' }, 21, 12, 7, 20, 2030) === null, 'one above it is left alone');
    ok(SC.bpmLift({ name: 'Dante Fletcher' }, 5, 3, 2, 2, 2030) === null && SC.bpmLift({ name: 'Payton Gibson' }, -3, -2, -1, 30, 2030) === null, 'and it needs a few games, and a BPM minimum to begin with');
  }

  // ---- Identity and growth ----
  {
    const p = { name: 'Raymond Towns', pos: 'C', pos2: 'PF' };
    SC.applyIdentity(p);
    ok(p.pos === 'PG' && p.pos2 === null, 'Raymond Towns plays point guard whatever the sheet says');
    const h = { name: 'Rodney Hunt', class: 'FR', ht: "6'5" };
    const plan = SC.planGrowth(h, 15, 2029);
    ok(plan && plan.weeks.length === 4 && plan.weeks.every(w => w >= 2 && w <= 14) && plan.weeks.every((w, i, a) => !i || w >= a[i - 1]), `a freshman at 6'5 gets four growth weeks through the season (${plan && plan.weeks.join(',')})`);
    const seen = [];
    for (let w = 1; w <= 15; w++) { const r = SC.growthForWeek(h, w); if (r) seen.push(r.ht); }
    ok(h.ht === "6'9" && seen.join() === "6'6,6'7,6'8,6'9", `his height climbs an inch at a time to 6'9 (${seen.join(' ')})`);
    ok(SC.growthForWeek(h, 16) === null && h.scriptGrowth.done, 'and stops there');
    const back = { name: 'Rodney Hunt', class: 'SO', ht: "6'6", scriptGrowth: { done: true, year: 2029 } };
    SC.applyIdentity(back);
    ok(back.ht === "6'9", 'if the sheet sends the old height back, he is still 6\'9');
    ok(SC.planGrowth({ name: 'Rodney Hunt', class: 'SO', ht: "6'6" }, 15, 2030) === null, 'it only happens in his freshman year');
    ok(SC.planGrowth({ name: 'Rodney Hunt', class: 'FR', ht: "6'10" }, 15, 2029) === null, 'and not at all if he is already that tall');
    const again = SC.planGrowth(h2(), 15, 2029);
    function h2() { return { name: 'Rodney Hunt', class: 'FR', ht: "6'8" }; }
    ok(again && again.weeks.length === 1, 'a freshman at 6\'8 grows just the one inch');
  }

  // ---- A league with all of them ----
  let roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const rename = (from, to) => { const n = roster.split(`,${from},`).length - 1; if (!n) throw new Error('fixture has no ' + from); roster = roster.split(`,${from},`).join(`,${to},`); };
  // The fixture lacks seven of them, so existing players take their names.
  rename('Dante Gibson', 'Rodney Hunt');
  roster = roster.replace(/(Rodney Hunt,)(\d+)(,FR,)PF(,)6'7(,)228/, "$1$2$3W$46'5$5190");
  rename('Ty-Shon Keefe', 'Jared Keefe');
  rename('Ryan Fletcher', 'Dante Fletcher');
  const rows = roster.split('\n');
  const used = new Set(['Georgia', 'Syracuse', 'North Carolina', 'Kansas', 'Connecticut', 'Alabama', 'Iowa', 'LSU']);
  const pick = (cls, pos) => {
    for (let i = 1; i < rows.length; i++) {
      const c = rows[i].split(',');
      if (c[2] === '2029' && c[6] === cls && pos.includes(c[7]) && !used.has(c[0]) && parseFloat(c[5]) >= 78 && c[4] && !c[4].includes('"')) {
        const nxt = rows.some((r, j) => j !== i && r.includes(`,${c[4]},`) && r.split(',')[2] === '2030');
        if (nxt) { used.add(c[0]); return c[4]; }
      }
    }
    throw new Error('no ' + cls + ' ' + pos);
  };
  rename(pick('JR', ['C', 'PF', 'F']), 'Raymond Towns');
  rename(pick('JR', ['W', 'SF', 'SG']), 'Jared Moreno');
  rename(pick('SO', ['W', 'SF', 'SG', 'PF']), 'Jakob Meyer');
  rename(pick('SO', ['G', 'PG', 'CG', 'SG', 'W']), 'Henry Vernie');

  const { Sim, window: w } = boot({ roster, recruits });
  await Sim.init();
  await Sim.startNewGame();
  w.scrollTo = () => {};
  const S = Sim.state;
  const find = n => S.activePlayers.find(p => p.name === n);
  const year0 = S.year;
  // Their 2032 draft is out of reach of a two-season test, so for the
  // draft the same rule is pointed at this year's: the mechanism is the same.
  const T = w.ScriptCore.TABLE;
  T.find(e => e.name === 'Jakob Meyer').draft.year = year0 + 1;
  T.find(e => e.name === 'Henry Vernie').draft.year = year0 + 1;

  const mustPlay = ['James Stewart Jr.', 'Rodney Hunt', 'Raymond Towns', 'Jared Moreno', 'Jared Keefe', 'Dante Fletcher', 'Olumide Afolabi'];
  ok(mustPlay.every(n => find(n)), `the league has them (${mustPlay.map(n => (find(n) || {}).name ? 'y' : 'n').join('')})`);
  ok(find('Raymond Towns').pos === 'PG', 'Towns is listed at point guard before a game is played');
  const hunt0 = find('Rodney Hunt').ht;
  const news = [];
  const logNews = Sim.logNews.bind(Sim);
  Sim.logNews = m => { news.push(m); logNews(m); };
  ok(S.regularSeasonDone === false, 'season is open');

  ok(await playSeason(Sim), `${year0} played`);
  const line = (n) => { const p = find(n); const s = p.stats; return `${n}: ${s.gp}gp ${s.mpg}mpg ${s.ppg}/${s.rpg}/${s.apg} stl ${s.stl} blk ${s.blk} bpm ${s.bpm}`; };
  const check = (n, test, label, minGames = 12) => {
    const p = find(n);
    if (!p) { console.log('  --  ' + n + ' is gone'); return; }
    if ((p.stats.gp || 0) < minGames) { console.log('  --  ' + n + ' played only ' + p.stats.gp + ' games (injured); skipped'); return; }
    ok(test(p.stats, p), `${label} (${line(n)})`);
  };

  // James Stewart Jr.
  {
    const p = find('James Stewart Jr.');
    ok(p.stats.gp >= 12 && num(p.stats.mpg) >= 26, `Stewart Jr. plays real minutes (${p.stats.mpg} mpg over ${p.stats.gp} games)`);
    ok((p.stats.gs || p.stats.started || 0) >= 0.8 * p.stats.gp || (p.gameLog || []).filter(g => g.started).length >= 0.8 * p.stats.gp, 'and starts');
  }
  check('Olumide Afolabi', s => num(s.ppg) >= 14 && num(s.rpg) >= 8 && num(s.blk) >= 2 && num(s.bpm) >= 10, 'Afolabi: BPM over 10 with the numbers behind it');
  check('Rodney Hunt', s => num(s.ppg) >= 12 && num(s.rpg) >= 6 && num(s.stl) >= 2 && num(s.mpg) >= 24, 'Hunt: starter averaging 12/6/2');
  check('Raymond Towns', (s, p) => p.pos === 'PG' && num(s.ppg) >= 16 && num(s.rpg) >= 7 && num(s.apg) >= 7, 'Towns: a point guard at 16/7/7');
  check('Jared Moreno', s => num(s.ppg) >= 14 && num(s.rpg) >= 7 && num(s.apg) >= 7, 'Moreno: 7 and 7 with real scoring');
  check('Jared Keefe', s => num(s.ppg) >= 14 && num(s.rpg) >= 8 && num(s.blk) >= 3, 'Keefe: 14/8 and 3 blocks');
  check('Dante Fletcher', s => num(s.ppg) >= 28 && num(s.bpm) >= 17, 'Fletcher: 28 a game and a BPM over 17');
  {
    const h = find('Rodney Hunt');
    ok(h.ht === "6'9" && h.scriptGrowth && h.scriptGrowth.done, `Hunt finishes his freshman year at 6'9 (was ${hunt0}, now ${h.ht})`);
    const grow = news.filter(t => /Rodney Hunt/.test(t));
    ok(grow.length === 2 && /growth spurt/.test(grow[0]) && /finished growing/.test(grow[1]), `and the news noticed, when it started and when it ended (${grow.join(' | ')})`);
  }
  // The team lines are still the team's own: nobody invented points.
  {
    const tm = S.teams.find(t => t.school === find('Dante Fletcher').school);
    const t = tm.simData.totals;
    const players = (tm.roster || []).reduce((n, p) => n + (p.statsFull ? p.statsFull.totPts : 0), 0);
    ok(players > 0 && players < 6000, 'team scoring stays believable with a 28-a-game scorer on it (' + players + ')');
  }

  // Rolling over: the draft after his first season.
  const DCy = w.DraftCycle;
  await Sim.simulateWeek();
  const declared = new Set(S.draftDeclarations.map(d => d.name));
  ok(declared.has('Jared Keefe') && declared.has('Jakob Meyer') && declared.has('Henry Vernie'), 'Keefe, Meyer and Vernie all declare');
  const step = () => Sim.applyDraftStep(DCy.advance(Sim.draftContext()));
  for (let i = 0; i < 8 && !Sim.isDraftComplete(); i++) step();
  ok(Sim.isDraftComplete(), 'the draft is held');
  const picks = S.draftResults;
  const slot = n => (picks.find(p => p.name === n) || {}).pick;
  ok(slot('Jakob Meyer') && slot('Henry Vernie') && slot('Jakob Meyer') <= 3 && slot('Henry Vernie') <= 3 && slot('Jakob Meyer') !== slot('Henry Vernie'),
    `Meyer (#${slot('Jakob Meyer')}) and Vernie (#${slot('Henry Vernie')}) both go in the top three`);
  ok(slot('Jared Keefe') && slot('Jared Keefe') <= 14, `Keefe is a lottery pick (#${slot('Jared Keefe')})`);

  // A second season: the ones who arrived with it, and the ones who stayed.
  await playOffseason(Sim);
  ok(await playSeason(Sim), `${year0 + 1} played`);
  ok(!find('Jared Keefe'), 'Keefe has left for the NBA');
  check('Kelvin Marion', s => num(s.stl) + num(s.blk) > 4 && num(s.mpg) >= 24, 'Marion: over 4 steals and blocks a game');
  check('Patrick Greene', s => num(s.ppg) >= 16 && num(s.apg) >= 4, 'Greene: 16 and 4');
  check('Payton Gibson', (s, p) => num(s.ppg) >= 13 && num(s.mpg) >= 24, 'Gibson: 13 a game as a starter');
  check('James Stewart Jr.', s => num(s.mpg) >= 26, 'Stewart Jr. is still playing real minutes');
  check('Olumide Afolabi', s => num(s.ppg) >= 14 && num(s.bpm) >= 10, 'Afolabi is still over 10 BPM the next year');
  check('Dante Fletcher', s => num(s.ppg) >= 28 && num(s.bpm) >= 17, 'Fletcher is still at 28 and 17');
  check('Raymond Towns', (s, p) => p.pos === 'PG' && num(s.ppg) >= 16 && num(s.apg) >= 7, 'Towns is still the point guard');
  check('Rodney Hunt', (s, p) => p.ht === "6'9" && num(s.ppg) >= 12 && num(s.rpg) >= 6 && num(s.stl) >= 2, 'Hunt stays 6\'9 and keeps his numbers');
  check('Jared Moreno', s => num(s.rpg) >= 7 && num(s.apg) >= 7, 'Moreno still has his 7 and 7');

  console.log('\nScripted players verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
