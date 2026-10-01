// A recruit's real numbers drive how he plays in college: efficiency and
// shot profile come from his high-school / AAU / FIBA lines, and a game's
// box score keeps each shooter's efficiency instead of flattening it.
const { boot, ok } = require('./harness');
const GameCore = require('../js/game-core.js');

(async () => {
  const { Sim } = boot();
  // Sheet columns as the engine's CSV reader keys them: lower case, no underscores.
  const raw = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_/g, '').toLowerCase(), v]));
  // A rim-running center, as the sheet has him (with a typo in one cell).
  const big = {
    hs_gp: '26', hs_mpg: '24.5', hs_ppg: '13.6', hs_rpg: '8.9', hs_apg: '1.8', hs_fg2: '64%', hs_fg3: '25%', hs_ft: '68%', hs_fga2: '8', hs_fga3: '60.4', hs_fta: '4.1', hs_ast: '10.5%', hs_usg: '17.8%',
    aau_gp: '22', aau_mpg: '26', aau_ppg: '15.8', aau_rpg: '9.2', aau_apg: '2', aau_fg2: '62.3%', aau_fg3: '20%', aau_ft: '66%', aau_fga2: '9.5', aau_fga3: '0.4', aau_fta: '5', aau_ast: '11.2%', aau_usg: '19.2%'
  };
  const real = Sim.recruitProduction(raw(big));
  ok(real && real.fg2 > 0.58 && real.fg2 < 0.63, `two-point percentage translated to college (${real.fg2})`);
  ok(real.p3ar < 0.1, `a 60-a-game three-point volume is a typo, not a shot profile (3PAr ${real.p3ar})`);
  ok(real.ft > 0.64 && real.ft < 0.69, `free throws as he shot them (${real.ft})`);
  ok(real.per36 && real.per36.aau && real.per36.aau.pts > 20, 'per-minute lines by level, for the summer circuit');

  // The same player in the college model, with and without his numbers.
  const team = { school: 'Test', roster: [], usageReference: 80 };
  const player = (ps, extra = {}) => ({ id: 'x' + Math.random(), name: 'Test Big', pos: 'C', rating: 86, class: 'FR', school: 'Test', playstyle: ps, ...extra });
  const base = Sim.playstyleValues(null);
  const without = Sim.buildBaseStatExpectations(player({ ...base, base, archetype: 'rollBig' }), 26, team);
  const withReal = Sim.buildBaseStatExpectations(player({ ...base, base, archetype: 'rollBig', real }), 26, team);
  ok(withReal.twoPPct >= 0.58, `he finishes like himself (2P% ${(withReal.twoPPct * 100).toFixed(1)}, model alone ${(without.twoPPct * 100).toFixed(1)})`);
  ok(withReal.ftPct > 0.6, `and isn't a 45% free-throw shooter because he doesn't shoot threes (FT% ${(withReal.ftPct * 100).toFixed(1)})`);
  ok(withReal.threePar < 0.08, `and stays near the rim (3PAr ${withReal.threePar.toFixed(2)})`);

  // A passing big: his real assist rate carries over.
  const passer = Sim.recruitProduction(raw({ hs_gp: '30', hs_mpg: '30.5', hs_ppg: '19.9', hs_apg: '4.8', hs_fg2: '67%', hs_fga2: '10.7', hs_ast: '22.5%', hs_usg: '26.5%', aau_gp: '22', aau_mpg: '28', aau_ppg: '17', aau_apg: '4.2', aau_fg2: '64.8%', aau_fga2: '9', aau_ast: '21%', aau_usg: '25.5%' }));
  const hub = Sim.buildBaseStatExpectations(player({ ...base, base, archetype: 'postHub', real: passer }, { rating: 88 }), 32, team);
  const plain = Sim.buildBaseStatExpectations(player({ ...base, base, archetype: 'postHub' }, { rating: 88 }), 32, team);
  ok(hub.apg >= 3 && hub.apg > plain.apg * 2, `a playmaking big keeps his assists (${hub.apg.toFixed(1)} apg, ${plain.apg.toFixed(1)} without his numbers)`);

  // Box scores keep each shooter's efficiency.
  const lineup = pcts => pcts.map((p, i) => ({ id: 'p' + i, name: 'P' + i, expectedStats: { mpg: 32, ppg: 14, fta: 3, ftPct: 0.72, threePar: i ? 0.4 : 0.02, threePPct: 0.34, twoPPct: p, rpg: 5, apg: 2, stl: 1, blk: 0.5, tov: 2, pf: 2 } }));
  const H = { school: 'H', roster: lineup([0.66, 0.47, 0.47, 0.47, 0.47]), simData: { teamOvr: 78 }, coachProfile: {} };
  const A = { school: 'A', roster: lineup([0.5, 0.5, 0.5, 0.5, 0.5]), simData: { teamOvr: 78 }, coachProfile: {} };
  const tot = { bigM: 0, bigA: 0, gM: 0, gA: 0 };
  for (let k = 0; k < 400; k++) {
    const g = GameCore.simulateSingleGame(H, A, { homeCourtEdge: 0 });
    g.homePlayerBoxes.forEach(({ player, box }) => {
      if (player.id === 'p0') { tot.bigM += box.twoPm; tot.bigA += box.twoPa; } else { tot.gM += box.twoPm; tot.gA += box.twoPa; }
    });
  }
  const bigP = tot.bigM / tot.bigA, gP = tot.gM / tot.gA;
  ok(bigP - gP > 0.14, `a 66% finisher stays well clear of 47% shooters over a season (${(bigP * 100).toFixed(1)} vs ${(gP * 100).toFixed(1)} on twos)`);

  // A save re-reads the sheet when it opens.
  const S = Sim.state;
  const p = { id: 'r1', name: 'Sheet Big', recClassYear: 2028, pos: 'C', rating: 85, playstyle: { ...base, base } };
  S.teams = [{ school: 'Test', roster: [p] }];
  S.activePlayers = [p];
  p.allocatedMpg = 25;
  const n = await Sim.refreshRecruitProduction(async () => ({ rows: [{ name: 'Sheet Big', classyear: '2028', scouting: 'Rim runner.', ...raw(big) }] }));
  ok(n === 1 && p.playstyle.real && p.playstyle.real.fg2 === real.fg2 && p.expectedStats && p.expectedStats.twoPPct >= 0.58, 'opening a save picks up the sheet\'s numbers');
  ok(p.scout && p.scout.scouting === 'Rim runner.', 'and its scouting report');

  console.log('\nRecruit stats OK.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
