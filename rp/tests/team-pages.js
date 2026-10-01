// Team pages: search boxes on the Teams index, Team Stats and Player Stats;
// a past season's team page (roster, stats, national ranks) reached from
// Team History and from a player's season row; and overseas prospects at
// academies, who aren't pros until they sign with a club.
const fs = require('fs');
const path = require('path');
const { boot, playSeason, playOffseason, ok } = require('./harness');
const FIX = path.join(__dirname, 'fixtures');

(async () => {
  // ---- In the sim ----
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const { Sim, window: w } = boot({ roster, recruits });
  const d = w.document;
  await Sim.init();
  await Sim.startNewGame();
  const S = Sim.state;
  const HS = w.HSCore;
  // ---- Academies are high school ----
  ok(HS.isAcademy('NBA Academy Africa') && HS.isAcademy('INSEP') && HS.isAcademy('OrangeAcademy') && HS.isAcademy('Real Madrid Youth')
    && HS.isAcademy('NBA Global Academy') && !HS.isAcademy('Real Madrid') && !HS.isAcademy('Perth Wildcats') && !HS.isAcademy('ASVEL'),
    'academies and youth teams are told apart from pro clubs');
  const lagos = { name: 'Test Okafor', state: 'INT', hometown: 'Lagos, Nigeria', school: '', intlTeam: 'NBA Academy Africa' };
  ok(!HS.isAcademy(HS.clubFor(lagos)), `an NBA Academy Africa player signs with a club, not the academy (${HS.clubFor(lagos)})`);
  const clubs = new Set();
  for (let i = 0; i < 200; i++) clubs.add(HS.clubFor({ name: `Test African ${i}`, state: 'INT', hometown: 'Dakar, Senegal', school: '', intlTeam: 'SEED Academy' }));
  ok([...clubs].some(c => /\(BAL\)/.test(c)) && [...clubs].filter(c => !/\(BAL\)/.test(c)).length >= 4, `African prospects mostly go to Europe, now and then the BAL (${[...clubs].join(', ')})`);
  const aus = HS.clubFor({ name: 'Test Aussie', state: 'INT', hometown: 'Perth, Australia', school: '', intlTeam: 'NBA Global Academy' });
  ok(/Wildcats|United|Kings|Bullets|36ers|JackJumpers|Phoenix|Hawks|Taipans|Breakers/.test(aus), `Australians go to the NBL (${aus})`);
  ok(HS.clubFor({ name: 'Test Pro', state: 'INT', hometown: 'Paris, France', school: 'Pro', intlTeam: '' }) !== 'Pro', '"Pro" on the sheet isn\'t a club name');
  ok(HS.clubFor({ name: 'Jakob', state: 'INT', hometown: 'Hamburg, Germany', school: 'Alba Berlin', intlTeam: '' }, n => n === 'Duke') === 'Alba Berlin', 'a club he signed with on the sheet is kept');
  const rows = w.RecruitGen.augment([], { keys: 'lower', classes: ['2033', '2034', '2035'] });
  const overseas = rows.filter(r => r.__overseas);
  ok(overseas.length > 20 && overseas.every(r => !r.proclub || !HS.isAcademy(r.proclub)), `generated overseas prospects never turn pro with an academy (${overseas.length})`);
  ok(overseas.some(r => /academy|insep|youth|azzurra/i.test(r.intlteam || '')), 'and many play for an academy or youth team before then');

  const intlLive = S.allRecruits.filter(r => r.genRecruit && HS.isInternational(r) && !(Number(r.rsci) > 0) && Sim.isLiveRecruit(r));
  ok(intlLive.length > 10, `generated overseas prospects can be recruited to college (${intlLive.length} in play)`);

  // ---- Two positions ("PF/C") ----
  ok(Sim.splitPos('PF/C').join() === 'PF,C' && Sim.splitPos('sf / pf').join() === 'SF,PF' && Sim.splitPos('PG').join() === 'PG,', 'a position cell can list a second position');
  {
    const mk = (id, pos, pos2, rating) => ({ id, name: id, pos, pos2, rating, class: 'JR', stats: { gp: 10 } });
    // Four very good forwards and centers can't all start at their listed
    // spots with one guard... unless one can play somewhere else.
    const team = { school: 'Test U', roster: [mk('pg', 'PG', null, 88), mk('sg', 'SG', null, 80), mk('f1', 'PF', null, 90), mk('f2', 'PF', null, 89), mk('c1', 'C', null, 89), mk('w1', 'SF', 'SG', 87), mk('b1', 'SG', null, 70), mk('b2', 'SF', null, 70)] };
    Sim.buildRotation(team);
    const st = new Set(team.starters);
    ok(['pg', 'f1', 'f2', 'c1', 'w1'].every(x => st.has(x)), `the best five start (${[...st].join(', ')})`);
    const w1 = team.roster.find(p => p.id === 'w1');
    ok(w1.playsAs === 'SG' && w1.pos === 'SF', 'an SF/SG covers the second guard spot, still listed as an SF');
    const two = { school: 'Test U', roster: [mk('pg', 'PG', null, 88), mk('sg', 'SG', null, 86), mk('f1', 'SF', null, 87), mk('f2', 'PF', 'C', 89), mk('f3', 'PF', null, 85), mk('c1', 'C', null, 70), mk('b1', 'SG', null, 70)] };
    Sim.buildRotation(two);
    const big = two.roster.find(p => p.id === 'f2');
    ok(two.starters.includes('f2') && !two.starters.includes('c1') && !big.playsAs, 'a PF/C plays his first position when the lineup doesn\'t need the second');
    const ok3 = { school: 'Test U', roster: [mk('pg', 'PG', null, 88), mk('g2', 'PG', null, 87), mk('g3', 'SG', null, 87), mk('g4', 'SG', 'SF', 86), mk('f1', 'PF', null, 84), mk('c1', 'C', null, 70)] };
    Sim.buildRotation(ok3);
    ok(ok3.starters.includes('g4') && ok3.roster.find(p => p.id === 'g4').playsAs === 'SF', 'a fourth guard who can play SF starts as the wing');
  }

  // Teams index search.
  Sim.backToTeamIndex();
  Sim.filterTeamIndex('duke');
  const visible = [...d.querySelectorAll('#teamPageContainer .team-tile')].filter(b => b.style.display !== 'none');
  ok(visible.length >= 1 && visible.every(b => /duke/.test(b.getAttribute('data-name'))), `the Teams search narrows the schools (${visible.length} shown)`);
  Sim.filterTeamIndex('big ten');
  const bigTen = [...d.querySelectorAll('#teamPageContainer .team-tile')].filter(b => b.style.display !== 'none');
  ok(bigTen.length >= 10, `searching a conference shows its teams (${bigTen.length})`);
  Sim.filterTeamIndex('zzzz');
  ok(d.getElementById('teamIndexEmpty').style.display === '', 'and says when nothing matches');
  Sim.filterTeamIndex('');

  await playSeason(Sim);
  const year = S.year;

  // Box scores mark the starters.
  {
    const t = S.teams.find(x => (x.roster || []).some(p => (p.gameLog || []).length));
    const pl = t.roster.find(p => (p.gameLog || []).length);
    const g = Sim.gameRefFromLog(t.school, pl.gameLog[0]);
    Sim.openGame(g);
    d.querySelector('#gameCenter .gc-tabs [data-tab="box"]').click();
    const marked = d.querySelectorAll('#gameCenter .gc-starter').length;
    ok(marked === 10, `box scores mark five starters a side (${marked})`);
    const first = [...d.querySelectorAll('#gameCenter .gc-box')][0];
    const flags = [...first.querySelectorAll('tbody tr:not(.gc-total)')].map(r => !!r.querySelector('.gc-starter'));
    ok(flags.slice(0, 5).every(Boolean) && !flags.slice(5).some(Boolean), 'starters listed first, then the bench');
    w.GameCenter.close();
  }

  // Player stats search finds anyone, qualified or not, with his place on the board.
  ok(d.getElementById('statsSearch') && d.getElementById('teamStatsSearch'), 'Player Stats and Team Stats have search boxes');
  const deep = S.activePlayers.filter(p => p.stats && p.stats.gp > 0).sort((a, b) => parseFloat(a.stats.ppg) - parseFloat(b.stats.ppg))[0];
  Sim.setStatsSearch(deep.name);
  const rowsP = [...d.querySelectorAll('#statsBody tr')];
  ok(rowsP.length >= 1 && rowsP.some(r => r.textContent.includes(deep.name)), `player search finds ${deep.name}, deep on the bench`);
  Sim.setStatsSearch('');
  ok(d.querySelectorAll('#statsBody tr').length === (S.statsLimit || 25), 'clearing it brings the leaderboard back');
  Sim.setTeamStatsSearch('Kansas');
  const tRows = [...d.querySelectorAll('#teamStatsBody tr')];
  ok(tRows.length >= 2 && tRows.every(r => /kansas/i.test(r.textContent)), `team stats search (${tRows.length} rows)`);
  Sim.setTeamStatsSearch('');

  // The finished season, kept whole.
  const duke = Sim.findTeam('Duke');
  const before = (duke.roster || []).filter(p => p.stats && p.stats.gp > 0).map(p => ({ id: p.id, name: p.name, ppg: p.stats.ppg }));
  const dukeRow = Sim.computeAllTeamStats().find(r => r.school === 'Duke');
  await playOffseason(Sim);
  ok(S.year === year + 1, 'into the next season');
  ok(S.rosterArchive && S.rosterArchive[year] && Object.keys(S.rosterArchive[year].teams).length === S.teams.length, 'every team\'s season is archived');
  const data = Sim.teamSeasonData('Duke', year);
  ok(data.archived && before.every(b => data.players.some(p => p.id === b.id && String(p.stats.ppg) === String(b.ppg))), `the ${year} Duke roster keeps every player's line (${before.length}), including those who left`);
  ok(data.stats && data.stats.ppg === dukeRow.stats.ppg && data.ranks.ppg === dukeRow.ranks.ppg, 'and the team\'s stats with their national ranks');

  // Team History → that season's page.
  Sim.goToTeamPage('Duke');
  ok(/Team History/.test(d.getElementById('teamPageContainer').textContent) && d.querySelector('#teamPageContainer .team-finder'), 'the team page has Team History and a team finder');
  Sim.setTeamPageView('history');
  const histRow = d.querySelector('#teamPageContainer tbody tr.game-row');
  ok(histRow && /goToTeamSeason/.test(histRow.getAttribute('onclick')), 'each season in Team History opens');
  w.eval(histRow.getAttribute('onclick'));
  const page = d.getElementById('teamPageContainer').textContent;
  ok(S.teamPageView === 'season' && S.teamPageSeason === year, 'to that season');
  ok(page.includes(`${year}-${String(year + 1).slice(2)}`) && page.includes('Team Statistics') && page.includes('Player Box Score Stats') && page.includes('Player Advanced Stats'),
    'laid out like a current team page');
  ok(before.slice(0, 3).every(b => page.includes(b.name)), 'with its players');
  ok(d.querySelector('#teamPageContainer select[aria-label="Season"]'), 'and a season picker');
  Sim.sortTeamRoster('box', 'ppg');
  ok(S.teamPageView === 'season' && d.getElementById('teamPageContainer').textContent.includes('Player Box Score Stats'), 'sorting keeps the past season up');
  Sim.navigateBack();
  ok(S.teamPageView === 'history', 'Back returns to Team History');

  // From a player's profile: the school in a season row is that season's team.
  const vet = S.activePlayers.find(p => (p.seasonHistory || []).some(h => h.year === year && h.school === p.school));
  Sim.openPlayerPage(vet.id);
  const link = [...d.querySelectorAll('#playerPageBody .clickable-school')].find(e => /goToTeamSeasonFromPlayer/.test(e.getAttribute('onclick') || '') && e.getAttribute('onclick').includes(String(year)));
  ok(link, `${vet.name}'s ${year} season row links to that team`);
  w.eval(link.getAttribute('onclick'));
  ok(S.teamPageSelection === vet.school && S.teamPageView === 'season' && S.teamPageSeason === year && d.getElementById('playerPage').style.display !== 'block',
    `and opens the ${year} ${vet.school} team`);
  Sim.goToTeamSeason(vet.school, S.year);
  ok(S.teamPageView === 'team', 'the current season is the current team page');

  console.log('\nTeam pages OK.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
