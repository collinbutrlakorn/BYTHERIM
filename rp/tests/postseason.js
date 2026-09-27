// The road to the title: live bracketology during the season, seeded
// conference tournaments, Selection Sunday, and an NCAA Tournament that is
// played from exactly the bracket that was announced.
const { boot, ok } = require('./harness');

(async () => {
  const { Sim, window: w } = boot();
  await Sim.init();
  await Sim.startNewGame();
  const d = w.document;

  // ---- in season: bracketology is live ----
  for (let i = 0; i < 6; i++) await Sim.simulateWeek();
  const proj = Sim.buildSelection(true);
  ok(proj.projected && proj.fieldSize === 68, `projected field of ${proj.fieldSize}`);
  ok(Sim.REGIONS.every(r => proj.regions[r].length === 16), 'four regions of sixteen seed lines');
  ok(proj.firstFour.length === 4 && proj.firstFour.filter(g => g.kind === 'at-large').length === 2, 'First Four: two at-large games and two for automatic qualifiers');
  ok(proj.lastFourIn.length === 4 && proj.firstFourOut.length === 4, 'the bubble is listed');
  const ones = Sim.REGIONS.map(r => proj.regions[r].find(e => e.seed === 1).school);
  ok(new Set(ones).size === 4, 'four different No. 1 seeds, one per region');
  Sim.updatePostseasonTab();
  const tab = d.getElementById('postseasonContainer');
  ok(/Projected through Week 6/.test(tab.textContent), 'Bracketology is live during the season');
  ok(tab.querySelectorAll('.nb-bracket .nb-game').length >= 63, `projected bracket drawn (${tab.querySelectorAll('.nb-bracket .nb-game').length} games)`);
  ok(tab.querySelectorAll('.bl-row').length === 16, 'seed list has sixteen lines');

  // ---- conference tournaments: seeded ----
  let guard = 0;
  while (!Sim.state.regularSeasonDone && guard++ < 60) await Sim.simulateWeek();
  await Sim.simulateWeek();   // conference championships
  ok(Sim.state.confChampsDone, 'conference tournaments played');
  const confs = Object.values(Sim.state.confTournaments);
  ok(confs.every(b => b.seeds && Object.keys(b.seeds).length >= 2), 'every conference bracket has seeds');
  const [confName, confBracket] = Object.entries(Sim.state.confTournaments).find(([, b]) => b.playIn && b.playIn.length);
  const confHtml = Sim.renderConfBracket(confBracket, confName);
  ok(/nb-bye/.test(confHtml) && /class="nb-seed">1</.test(confHtml), `${confName}: bracket shows seeds and byes`);

  // ---- Selection Sunday ----
  const sel = Sim.state.ncaaSelection;
  ok(sel && !sel.projected && sel.fieldSize === 68, 'the real field is selected when the conference tournaments end');
  const champs = new Set(confs.map(b => b.champion.school));
  ok(Object.values(sel.autoBids).every(s => champs.has(s)), 'automatic bids go to conference tournament champions');
  Sim.playSelectionShow();
  ok(d.getElementById('selectionShow') && d.querySelector('.sel-skip'), 'Selection Sunday show opens with a Skip button');
  Sim.finishSelectionShow();
  ok(!d.getElementById('selectionShow'), 'Skip closes the show');

  // ---- the tournament follows the announced bracket ----
  await Sim.simulateWeek();
  const t = Sim.state.ncaaTournament;
  ok(t.playIn.length === 4 && t.rounds[0].length === 32, 'First Four and 32 first-round games');
  const seeds = Sim.selectionSeeds(sel);
  ok(t.rounds[0].every(g => seeds[g.teamA.school] && seeds[g.teamB.school] && seeds[g.teamA.school].seed + seeds[g.teamB.school].seed === 17),
    'every first-round game is a 1v16, 2v15 … 8v9 pairing from the announced bracket');
  ok(t.rounds[0].every(g => seeds[g.teamA.school].region === seeds[g.teamB.school].region), 'first-round games stay within a region');
  guard = 0;
  while (!Sim.state.ncaaDone && guard++ < 10) await Sim.simulateWeek();
  ok(Sim.state.ncaaDone && t.rounds.map(r => r.length).join() === '32,16,8,4,2,1', 'six rounds: 32, 16, 8, 4, 2, 1 games');
  ok(t.champion && t.champion.school === t.rounds[5][0].winner.school, `champion crowned (${t.champion.school})`);
  const e8 = t.rounds[3].map(g => seeds[g.teamA.school].region);
  ok(e8.join() === Sim.REGIONS.join(), 'each Elite Eight game decides one region');
  ok(Sim.state.teams.filter(x => x.ncaaSeed).every(x => x.ncaaSeed >= 1 && x.ncaaSeed <= 16), 'teams carry their 1-16 seed');
  const html = Sim.renderNcaaBracket(sel, t, { hideFirstFour: true });
  ok((html.match(/class="nb-team win/g) || []).length === 63, 'the finished bracket marks all 63 winners');
  ok(Sim.renderNcaaBracket(sel, t).includes('First Four'), 'the First Four is shown under the bracket');

  // ---- the offseason takes over ----
  ok(d.getElementById('offseasonOverlay').style.display === 'block', 'the offseason screen opens when the title game ends');
  ok(!d.querySelector('.tab-btn[data-tab="offseasonTab"]'), 'the Archive no longer has an Offseason tab');

  // ---- Back button: returns to wherever you came from ----
  Sim.navStack = [];
  w.UIController.activateTab('teamStatsTab');
  Sim.goToTeamPage(t.champion.school);
  ok(d.getElementById('navBackLabel').textContent === 'Team Stats', `back button offers "Team Stats" after opening a team from it (${d.getElementById('navBackLabel').textContent})`);
  Sim.navigateBack();
  ok(d.getElementById('teamStatsTab').classList.contains('active'), 'Back returns to Team Stats');
  Sim.navStack = [];
  Sim.backToTeamIndex();
  Sim.setTeamPageSelection(t.champion.school);
  ok(d.getElementById('navBackLabel').textContent === 'All Teams', 'from a team picked on the All Teams page, Back says "All Teams"');
  Sim.navStack = [];
  w.UIController.activateTab('scheduleTab');
  ok(d.getElementById('navBackLabel').textContent === 'Dashboard' && d.getElementById('navBackBtn').style.display !== 'none', 'the very first tab change can already go back to the Dashboard');
  const statsLink = (() => { w.UIController.activateTab('teamStatsTab'); return d.querySelector('#teamStatsBody .clickable-school') || d.querySelector('#teamStatsTab .clickable-school'); })();
  ok(statsLink && /goToTeamPage/.test(statsLink.getAttribute('onclick')), 'team names in Team Stats open the team page');

  console.log('\nPostseason verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
