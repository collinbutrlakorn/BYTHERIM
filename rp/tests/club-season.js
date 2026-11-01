// Club seasons: international prospects play their club ball game by game,
// and the league decides the role.
const path = require('path');
const J = path.join(__dirname, '..', 'js');
globalThis.GameCore = require(path.join(J, 'game-core.js'));
globalThis.RecruitGen = require(path.join(J, 'recruit-gen.js'));
globalThis.SummerCore = require(path.join(J, 'summer-core.js'));
globalThis.TorvikBPM = require(path.join(J, 'torvik-bpm.js'));
const CS = require(path.join(J, 'club-season.js'));
const fs = require('fs');
const { boot, ok } = require('./harness');

(async () => {
  // Leagues from club names.
  ok(CS.leagueOf('Real Madrid') === 'euroleague' && CS.leagueOf('Mega Basket') === 'aba' && CS.leagueOf('Perth Wildcats') === 'nbl', 'clubs map to their leagues');
  ok(CS.leagueOf('Real Madrid U18') === 'youth' && CS.leagueOf('NBA Academy Africa') === 'youth' && CS.leagueOf('Overtime Elite') === 'ote', 'junior sides and academies are junior leagues');

  // The same player, three leagues: the EuroLeague hands a teenager the
  // fewest minutes and shots, a junior league the most.
  const season = (club, pos = 'SG', talent = 88) => {
    const rec = CS.startRecord({ id: `t|${club}|${pos}|${talent}`, pos, talent, club, years: 0 }, 2029);
    CS.playTo(rec, 2029, rec.gp);
    return { rec, st: CS.statsOf(rec) };
  };
  const el = season('Real Madrid'), aba = season('Mega Basket'), jr = season('Real Madrid U18');
  const f = (x, k) => parseFloat(x.st[k]);
  ok(f(el, 'mpg') < f(aba, 'mpg') && f(aba, 'mpg') < f(jr, 'mpg'), `minutes by league: EuroLeague ${el.st.mpg}, ABA ${aba.st.mpg}, junior ${jr.st.mpg}`);
  ok(f(el, 'usg') < f(aba, 'usg') && f(aba, 'usg') < f(jr, 'usg'), `usage by league: EuroLeague ${el.st.usg}, ABA ${aba.st.usg}, junior ${jr.st.usg}`);
  ok(f(el, 'ppg') < f(jr, 'ppg'), 'and so does the scoring');
  ok(el.st.gp === el.rec.games.filter(g => g[4][1] > 0).length, 'games played come from the games');

  // A long way below a EuroLeague club: its second team, not its bench.
  const low = season('Real Madrid', 'PG', 70);
  ok(low.rec.lg === 'domestic' && /B$/.test(low.rec.team), `a 70 at Real Madrid plays for ${low.rec.team} (${low.rec.lg})`);

  // A top prospect gets real minutes even in the EuroLeague or NBL.
  const star = (club, rec) => { const r = CS.startRecord({ id: `star|${club}|${rec}`, pos: 'SG', talent: 81, club, years: 0, recRating: rec }, 2031); CS.playTo(r, 2031, r.gp); return CS.statsOf(r); };
  ok(parseFloat(star('FC Barcelona', 92).mpg) >= 20 && parseFloat(star('Perth Wildcats', 92).mpg) >= 20, `a lottery-level prospect plays 20+ minutes in the EuroLeague (${star('FC Barcelona', 92).mpg}) and NBL (${star('Perth Wildcats', 92).mpg})`);
  ok(parseFloat(star('FC Barcelona', 92).mpg) > parseFloat(star('FC Barcelona', 82).mpg), 'more than an ordinary prospect');

  // The draft board: centres are measured against centres.
  const DC = require(path.join(J, 'draft-core.js'));
  const line = { gp: 30, mpg: 22, ppg: 7, p40pts: 13, p40reb: 13, p40ast: 1.5, p40stl: 1, p40blk: 3, p40tov: 2, bpm: 6, tsPct: 0.68, usg: '11%' };
  const big = (rsci, pos = 'C') => DC.scoreProspect({ name: 'B', pos, class: 'FR', rating: 82, ht: pos === 'C' ? "6'11" : "6'7", rsci, conference: 'ACC', stats: line }).score;
  ok(big(5) - big(null) >= 6, `a low-usage centre goes high only as a top recruit (${big(5).toFixed(1)} vs ${big(null).toFixed(1)})`);
  ok(big(null, 'SF') > big(null, 'C'), 'and the same line counts for more from a wing');

  // Seeded: the same season every time.
  const again = season('Mega Basket');
  ok(JSON.stringify(again.rec.games) === JSON.stringify(aba.rec.games), 'a club season replays the same');

  // Played as the season goes, not set on day one.
  const half = CS.startRecord({ id: 'half', pos: 'SF', talent: 84, club: 'Joventut Badalona' }, 2029);
  CS.playTo(half, 2029, half.gp * 0.5);
  const mid = CS.statsOf(half);
  CS.playTo(half, 2029, half.gp);
  ok(mid.gp < CS.statsOf(half).gp && half.games.length === half.gp, 'games are added as the season moves');

  // Bigs: boards stay under points in real minutes.
  let bigs = 0, over = 0;
  ['Mega Basket', 'Real Madrid U18', 'Overtime Elite', 'Sodertalje Kings', 'Joventut Badalona', 'Perth Wildcats'].forEach(c => [80, 84, 88, 92].forEach(t => {
    const x = season(c, 'C', t);
    if (parseFloat(x.st.mpg) < 15) return;
    bigs++;
    if (parseFloat(x.st.rpg) > parseFloat(x.st.ppg)) over++;
  }));
  ok(bigs >= 10 && over <= Math.max(1, bigs * 0.1), `club centres out-rebounding their scoring: ${over} of ${bigs}`);

  // In the NCAA RP: pros and high-school internationals play as the weeks go.
  const FIX = path.join(__dirname, 'fixtures');
  const { Sim, window: w } = boot({ roster: fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8'), recruits: fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8') });
  // Before any save is loaded (the RP hub, the Draft RP) as well. The
  // pages load the country flags, so the test does too.
  w.Flags = require(path.join(__dirname, '..', '..', 'assets', 'flags.js'));
  ok(/schoollogos\/georgia\.png$/.test(Sim.getTeamLogo('Georgia')), 'Georgia is the Bulldogs before a save loads, not the flag');
  Sim._logoCache = {};
  await Sim.init();
  await Sim.startNewGame();
  for (let i = 0; i < 4; i++) await Sim.simulateWeek();
  const cs = Sim.state.clubSeason;
  ok(cs && cs.season === Sim.state.year && Object.keys(cs.recs).length > 0, `club seasons running (${cs ? Object.keys(cs.recs).length : 0} players)`);
  const pros = Sim.state.proPlayers || [];
  const pro = pros.find(p => p.stats && p.stats.gp > 0);
  ok(!pros.length || (pro && pro.gameLog.length >= pro.stats.gp && pro.proLeague), 'a pro has a game log and a league');
  if (pro) {
    const before = pro.stats.gp;
    await Sim.simulateWeek();
    ok(pro.stats.gp >= before && pro.gameLog.length > 0, 'and his season moves with the weeks');
  }
  const snap = Sim.clubSnapshot();
  ok(snap && snap.players.length > 0 && snap.players.every(x => x.n && x.t && x.lg), 'the universe carries every club line');

  // Pro clubs get a logo file name, or the generic pro icon.
  const PL = require(path.join(__dirname, '..', '..', 'assets', 'pro-logos.js'));
  ok(PL.path('Real Madrid U18', '../') === '../proteamlogos/realmadrid.png' && PL.path('', '../') === '../schoollogos/pro.png', 'pro logos are named after the senior club');
  ok(/pro(teamlogos\/realmadrid|\.png)/.test(Sim.getTeamLogo('Real Madrid')) && !/^data:/.test(Sim.getTeamLogo('Perth Wildcats')), 'a pro club gets a pro logo, not an initials badge');

  // A school beats a country of the same name.
  ok(/schoollogos\/georgia\.png$/.test(Sim.getTeamLogo('Georgia')), 'Georgia is the Bulldogs, not the flag');

  console.log('\nClub seasons verified.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
