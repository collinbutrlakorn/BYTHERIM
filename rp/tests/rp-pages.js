// The Draft RP and the recruiting page read the published universe
// (tests/fixtures/universe.json: a 2029-30 preseason snapshot with the 2029
// draft in history) and the NCAA RP roster sheet (tests/fixtures/roster.csv).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const Papa = require('papaparse');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures');
const UNIVERSE = JSON.parse(fs.readFileSync(path.join(FIX, 'universe.json'), 'utf8'));
const ROSTER = Papa.parse(fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8'), { header: true, skipEmptyLines: true }).data;
const RECRUITS = Papa.parse(fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8'), { header: true, skipEmptyLines: true }).data;

function ok(c, m) { if (!c) throw new Error('FAILED: ' + m); console.log('OK: ' + m); }
const tick = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));

class LocalOnly extends ResourceLoader {
  fetch(url) {
    if (!url.startsWith('http://localhost/') || !/\.js$/.test(url)) return null;
    // Accounts stay off here (tests/cloud.js covers them): Firebase itself
    // can't load in this environment.
    if (/cloud-config\.js$/.test(url)) return Promise.resolve(Buffer.from('window.BTR_CLOUD_CONFIG = null;'));
    return Promise.resolve(fs.readFileSync(path.join(ROOT, decodeURIComponent(new URL(url).pathname))));
  }
}

// ---------------------------------------------------------------- Draft RP
function bootDraft(universe) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Could not load|Not implemented|Dexie is not defined/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'rp/draft.html'), 'utf8'), {
    url: 'http://localhost/rp/draft.html', runScripts: 'dangerously', resources: new LocalOnly(), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = url => String(url).includes('data/universe.json')
        ? (universe ? Promise.resolve({ ok: true, json: () => Promise.resolve(clone(universe)) }) : Promise.resolve({ ok: false, status: 404 }))
        : Promise.reject(new Error('unexpected fetch ' + url));
      w.scrollTo = () => {};
    }
  });
  // Resolves once the page has left its loading state.
  return new Promise(r => dom.window.addEventListener('load', async () => {
    const d = dom.window.document;
    for (let i = 0; i < 60 && /Loading/.test(d.getElementById('draftStatus').textContent); i++) await tick(50);
    r({ w: dom.window, d, errors });
  }));
}

// ---------------------------------------------------------------- Recruiting
// The recruiting page with an NCAA RP save in this browser: db is an
// in-memory stand-in for the save's IndexedDB, and the summer scripts load
// as they do on the page.
function bootRecruitingWithSave(universe, save) {
  const html = fs.readFileSync(path.join(ROOT, 'recruiting/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/recruiting/', runScripts: 'outside-only' });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Papa = { parse: (url, opts) => opts.complete({ data: url.includes('vS_KgPla') ? ROSTER : RECRUITS }) };
  w.fetch = url => String(url).includes('data/universe.json') && universe
    ? Promise.resolve({ ok: true, json: () => Promise.resolve(clone(universe)) })
    : Promise.resolve({ ok: false, status: 404 });
  const store = { 1: clone(save) };
  const writes = [];
  ['teams-master.js', 'roster-gen.js', 'recruit-gen.js', 'game-core.js', 'torvik-bpm.js', 'summer-core.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'rp/js', f), 'utf8'), ctx, { filename: f }));
  w.db = { leagueState: { get: async id => clone(store[id]), update: async (id, patch) => { writes.push(Object.keys(patch)); Object.assign(store[id], clone(patch)); return 1; } } };
  ['app.js', 'portal.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'recruiting', f), 'utf8'), ctx, { filename: f }));
  w.onload();
  vm.runInContext('loadPortalData()', ctx);
  return tick(80).then(() => ({ w, d: w.document, ev: expr => vm.runInContext(expr, ctx), store, writes }));
}

function bootRecruiting(universe) {
  const html = fs.readFileSync(path.join(ROOT, 'recruiting/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/recruiting/', runScripts: 'outside-only' });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Papa = { parse: (url, opts) => opts.complete({ data: url.includes('vS_KgPla') ? ROSTER : RECRUITS }) };
  w.fetch = url => String(url).includes('data/universe.json') && universe
    ? Promise.resolve({ ok: true, json: () => Promise.resolve(clone(universe)) })
    : Promise.resolve({ ok: false, status: 404 });
  ['app.js', 'portal.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'recruiting', f), 'utf8'), ctx, { filename: f }));
  w.onload();
  vm.runInContext('loadPortalData()', ctx);
  return tick(50).then(() => ({ w, d: w.document, ev: expr => vm.runInContext(expr, ctx) }));
}

// ---- wiring ----
{
  const ncaa = fs.readFileSync(path.join(ROOT, 'rp/ncaa.html'), 'utf8');
  ok(ncaa.indexOf('js/nba-core.js') > 0 && ncaa.indexOf('js/nba-core.js') < ncaa.indexOf('js/engine.js'), 'ncaa rp: NBA teams load before the engine (draft night needs them)');
  ok(/onclick="SimEngine\.publishUniverse\(\)"/.test(ncaa) && ncaa.includes('id="publishNote"'), 'ncaa rp: menu has Publish Universe');
  ok(ncaa.includes('href="./draft.html"'), 'ncaa rp: the in-season board links to the Draft RP');
  const rec = fs.readFileSync(path.join(ROOT, 'recruiting/index.html'), 'utf8');
  ok(rec.indexOf('src="portal.js"') > rec.indexOf('src="app.js"'), 'recruiting: portal.js loads after app.js');
}

(async () => {
  // ---- Draft RP: in-season (the 2030 draft is live) ----
  {
    const { w, d, errors } = await bootDraft(UNIVERSE);
    if (errors.length) console.log('   errors:', errors);
    ok(/Official universe · 2029-30 season · projected 2030 class/.test(d.getElementById('draftStatus').textContent), 'draft rp: status names the official universe and projected class');
    const stages = [...d.querySelectorAll('#draftStages li')];
    ok(stages.length === 7 && stages[0].classList.contains('current'), 'draft rp: stage track (season → combine → lottery → workouts → deadline → draft night) shows the season as current');
    ok(d.getElementById('draftCycleBar').textContent.trim() === '', 'draft rp: nothing to run from the official universe mid-season');
    ok(d.querySelector('.draft-view-btn[data-view="mock"]').textContent === 'Mock Draft', 'draft rp: third tab is the mock draft before draft night');
    ok(d.querySelectorAll('#draftBody tr.prospect-row').length === 30, 'draft rp: big board shows the top 30');
    ok(/Preseason top 30/.test(d.getElementById('draftBody').textContent), 'draft rp: preseason board explains it is ranked on talent until games are played');
    ok(d.getElementById('draftSource').innerHTML.trim() === '', 'draft rp: no source switch without a local save');

    w.DraftRP.setView('mock');
    const picks = [...d.querySelectorAll('#draftBody tr.prospect-row')].map(r => r.textContent.replace(/\s+/g, ' '));
    ok(picks.length === Math.min(60, w.DraftRP.state.prospects.length), `draft rp: every prospect in the (trimmed) pool is picked (${picks.length})`);
    ok(/Cameron Grant/.test(picks[0]) && /Erving Montgomery/.test(picks[1]) && /Patrick Greene/.test(picks[2]),
      'draft rp: picks scripted in the roster sheet hold their slot in the mock');
    const firstTeam = w.DraftRP.state.mock.picks[0].team.id;
    w.DraftRP.buildMock();
    ok(w.DraftRP.state.mock.picks[0].team.id === firstTeam, 'draft rp: the mock is the same on every load of the same publish');
    ok(d.querySelector('.lottery-strip') && d.querySelectorAll('.lottery-winner').length === 4, 'draft rp: lottery strip shows the top four');

    const years = [...d.querySelectorAll('#draftBody select[aria-label="Draft year"] option')].map(o => o.value);
    ok(years.join() === '2030,2029', 'draft rp: past drafts are selectable');
    w.DraftRP.setHistoryYear(2029);
    const past = [...d.querySelectorAll('#draftBody tr.prospect-row')];
    ok(past.length === 60 && /Alberto Rodriguez/.test(past[0].textContent), 'draft rp: the 2029 draft shows its actual picks');
    ok(past[0].querySelector('img.nba-logo-sm') && /Miami Heat/.test(past[0].textContent), 'draft rp: each pick shows its NBA team and logo');
    ok(/2029 NBA Draft/.test(d.querySelector('.draft-section-title').textContent), 'draft rp: results heading names the draft');
    w.DraftRP.setView('master');
    const pastBoard = [...d.querySelectorAll('#draftBody tbody tr')];
    ok(/2029 Final Big Board/.test(d.querySelector('.draft-section-title').textContent) && pastBoard.length >= 30,
      `draft rp: past big boards are kept by year (${pastBoard.length} rows)`);
    w.DraftRP.setHistoryYear(2030);
    ok(/2030 Big Board/.test(d.querySelector('.draft-section-title').textContent), 'draft rp: back to this year\'s board');
    ok(errors.length === 0, 'draft rp: no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    w.close();
  }

  // ---- Draft RP: draft night done ----
  {
    const u = clone(UNIVERSE);
    const h = u.draft.history.find(x => x.year === 2029);
    Object.assign(u.draft, { year: 2029, stage: 'complete', results: h.picks, lottery: h.lottery });
    u.season = { ...u.season, year: 2028, label: '2028-29', week: 0 };
    const { w, d } = await bootDraft(u);
    ok(/2029 NBA Draft complete · 60 picks/.test(d.getElementById('draftStatus').textContent), 'draft rp: complete stage status');
    ok(d.querySelectorAll('#draftStages li.done').length === 6 && d.querySelectorAll('#draftStages li')[6].classList.contains('current'), 'draft rp: draft night is the current stage');
    w.DraftRP.setView('master');
    ok(/2029 Final Big Board/.test(d.getElementById('draftBody').textContent), 'draft rp: the board after draft night is the final board');
    ok(d.querySelector('.draft-view-btn[data-view="mock"]').textContent === 'Draft Results', 'draft rp: the tab becomes Draft Results');
    w.DraftRP.setView('mock');
    ok(d.querySelectorAll('#draftBody tr.prospect-row').length === 60, 'draft rp: results list every pick');
    w.close();
  }

  // ---- Draft RP: nothing to show ----
  {
    const { w, d } = await bootDraft(null);
    ok(/NCAA RP/.test(d.getElementById('draftBody').textContent) && d.querySelector('#draftBody a[href="./ncaa.html"]'), 'draft rp: without a universe or save it points to the NCAA RP');
    w.close();
  }

  // ---- Recruiting: sheet only ----
  {
    const { d, ev } = await bootRecruiting(null);
    const navs = [...d.querySelectorAll('.nav-btn')].map(b => b.textContent.trim());
    ok(navs.join() === 'Class Rankings,School Rankings,Statistics,Transfer Portal,Summer Circuit', 'recruiting: Transfer Portal and Summer Circuit tabs in the nav');
    ev("switchTab('summer')");
    ok(/No summer yet/.test(d.getElementById('summerContainer').textContent), 'recruiting: without a published summer the tab says so');
    ok(ev("Portal.sheet.some(t => t.name === 'DaRon Drew' && t.from === 'Ohio' && t.to === 'Illinois' && t.season === '2028-29')"), 'recruiting: a "T - Ohio" note is a scheduled transfer into 2028-29');
    ok(ev("Portal.sheet.some(t => t.name === 'Lewis Pope' && t.from === 'Missouri' && t.to === 'Arkansas' && t.season === '2029-30')"), 'recruiting: a player listed at a new school next Year is a scheduled transfer');
    ok(ev("!Portal.sheet.some(t => t.name === 'Elijah Williams')"), 'recruiting: two players sharing a name in one Year are not treated as a transfer');
    ok(ev("Portal.sheet.every(t => t.scheduled)"), 'recruiting: sheet moves are marked Scheduled');
    ev("switchTab('portal')");
    ok(d.getElementById('portal-tab').classList.contains('active') && d.querySelectorAll('.nav-btn')[3].classList.contains('active'), 'recruiting: portal tab opens');
    ok(d.querySelectorAll('#portalBody tr.portal-row').length > 0, 'recruiting: portal lists transfers from the roster sheet alone');
    ok(/Roster sheet only/.test(d.getElementById('portalSummary').textContent), 'recruiting: summary says the simulation has not been published');
  }

  // ---- Recruiting: with the published universe ----
  {
    const { d, ev } = await bootRecruiting(UNIVERSE);
    ev("switchTab('portal')");
    ok(ev('Portal.filters.season') === '2029-30', 'recruiting: portal opens on the universe\'s current season');
    const sim = UNIVERSE.transfers.filter(t => !t.scheduled).length;
    ok(ev("Portal.all.filter(t => !t.scheduled).length") === sim, 'recruiting: every simulated portal move is listed');
    ok(ev("(() => { const t = Portal.all.find(t => t.name === 'Lewis Pope' && t.to === 'Arkansas'); return t && t.scheduled && t.ppg != null; })()"),
      'recruiting: a sheet move the sim carried out appears once, as Scheduled, with his stats');
    ev("setPortalFilter('type', 'PORTAL')");
    const rows = [...d.querySelectorAll('#portalBody tr.portal-row')];
    ok(rows.length > 0 && rows.every(r => r.querySelector('.portal-badge.portal')), 'recruiting: the Portal filter shows only simulated moves');
    ok(rows[0].querySelectorAll('.portal-school img.school-logo').length === 2, 'recruiting: each move shows both school logos');
    ev("setPortalFilter('type', 'ALL'); setPortalFilter('season', 'ALL'); setPortalFilter('q', 'Pope')");
    ok(d.querySelectorAll('#portalBody tr.portal-row').length >= 1 && /Missouri/.test(d.getElementById('portalBody').textContent), 'recruiting: search finds a player');
    ev("setPortalFilter('q', '')");
    ok(ev("Portal.all.some(t => isUpcoming(t))") && d.querySelector('#portalBody .portal-badge.upcoming'), 'recruiting: moves for next season are flagged Upcoming');

    const career = ev("rpCareerHTML(recruits.find(r => r.name === 'Alberto Rodriguez'))");
    ok(/In the NCAA RP/.test(career) && /Pick 1/.test(career) && /Miami Heat/.test(career), 'recruiting: profile shows his draft pick and NBA team');
    ok(/Louisville/.test(career) && /2028-29/.test(career), 'recruiting: profile shows his college season');
    ev("openRecruitProfile(recruits.find(r => r.name === 'Alberto Rodriguez'))");
    ok(d.querySelector('#profileContainer .rp-career'), 'recruiting: the section is part of the profile page');
    const pope = ev("rpCareerHTML(recruits.find(r => r.name === 'Lewis Pope') || { name: 'Lewis Pope' })");
    ok(/Transfers/.test(pope) && /Arkansas/.test(pope), 'recruiting: a transfer shows on the player\'s college record');
  }

  // ---- Recruiting: live recruiting from the published universe ----
  {
    const names = RECRUITS.filter(r => String(r.classYear) === '2029').slice(40, 43).map(r => r.name);
    const u = clone(UNIVERSE);
    u.recruitingLive = { season: 2029, classes: [2030, 2029], openFrom: 2032, players: [
      { n: names[0], c: 2029, rk: 12, g: 91, st: 5, s: 'Gonzaga', o: ['Duke', 'Arizona'], w: names[1], live: 1 },
      { n: names[1], c: 2029, rk: 30, g: 86, st: 4, s: '', l: ['Gonzaga', 'Baylor', 'Iowa', 'Purdue', 'Xavier'], d: 'Kansas', live: 1 }
    ] };
    const { d, ev } = await bootRecruiting(u);
    const r0 = ev(`(() => { const r = recruits.find(r => r.name === ${JSON.stringify(names[0])}); return { s: r.committedSchool, fl: r.finalList, rank: r.rank, stars: r.stars, w: r.commitWith }; })()`);
    ok(r0.s === 'Gonzaga' && r0.rank === 12 && r0.stars === 5 && r0.w === names[1], 'recruiting: a live commitment, rank and grade come from the sim');
    ok(r0.fl.title === 'Final 3' && r0.fl.schools.join() === 'Gonzaga,Duke,Arizona', 'recruiting: with the schools he picked it over');
    const r1 = ev(`(() => { const r = recruits.find(r => r.name === ${JSON.stringify(names[1])}); return { s: r.committedSchool, fl: r.finalList, dec: r.decommittedFrom }; })()`);
    ok(!r1.s && r1.fl.title === 'Top 5' && r1.fl.schools.length === 5 && r1.dec === 'Kansas', 'recruiting: an undecided prospect shows his list as it stands, and a reopened one where he left');
    ev(`openRecruitProfile(recruits.find(r => r.name === ${JSON.stringify(names[0])}))`);
    ok(/Joining teammate/.test(d.getElementById('profileContainer').textContent), 'recruiting: the profile notes a teammate he joined');
    ev(`openRecruitProfile(recruits.find(r => r.name === ${JSON.stringify(names[1])}))`);
    ok(/coaching change at Kansas/.test(d.getElementById('profileContainer').textContent), 'recruiting: and a recruitment reopened by a coaching change');
  }

  // ---- Recruiting: the summer circuit from the published universe ----
  {
    const names = RECRUITS.filter(r => String(r.classYear) === '2029').slice(10, 12).map(r => r.name);
    const line = (ppg) => ({ gp: 14, mpg: 26.1, ppg, rpg: 6.2, apg: 3.1, spg: 1.2, bpg: 0.6, topg: 2.1, fg: '48.0%', fg2: '53.0%', fg3: '36.0%', ft: '75.0%', bpm: 6.1, obpm: 4, dbpm: 2.1, ts: '58.0%', rts: '4.0%', efg: '53.0%', oreb: '5.0%', dreb: '15.0%', trb: '10.0%', ast: '18.0%', tov: '12.0%', stl: '2.0%', blk: '1.5%', usg: '26.0%', ftr: '.350', p3ar: '.380', ortg: 118.2, drtg: 99.5, fga2: 8, rimFga: 4, rimPct: '63.0%', shortMidFga: 2.2, shortMidPct: '45.0%', longMidFga: 1.8, longMidPct: '41.0%', rimMidRatio: '1.00', fga3: 5, fta: 5 });
    const u = clone(UNIVERSE);
    u.summer = { season: 2029,
      circuits: [{ key: 'EYBL', name: 'Nike EYBL', event: 'Peach Jam', champion: 'Team Takeover', runnerUp: 'Expressions', final: { home: 'Team Takeover', away: 'Expressions', hs: 71, as: 66 }, mvp: names[0], eventMvp: names[0], standings: [['Team Takeover', 11, 1], ['Expressions', 9, 3]], firstTeam: names }],
      fiba: { name: 'FIBA U19 World Cup', medals: { gold: 'USA', silver: 'France', bronze: 'Canada' }, final: { home: 'USA', away: 'France', hs: 88, as: 72 }, mvp: `${names[1]} (USA)`, allStar: [`${names[1]} (USA)`] },
      history: [{ season: 2028, champions: [{ event: 'Peach Jam', team: 'Nightrydas' }], fiba: { name: 'FIBA U17 World Cup', medals: { gold: 'USA' } } }],
      players: [
        { n: names[0], c: 2029, t: 'Team Takeover', ci: 'EYBL', aau: line(24.6), b: 3, h: ['2029 Peach Jam champion', '2029 Peach Jam MVP', '2029 Nike EYBL MVP'] },
        { n: names[1], c: 2029, t: 'Expressions', ci: 'EYBL', na: 'USA', aau: line(18.2), fiba: line(15.1), h: ['2029 FIBA U19 World Cup gold'] }
      ] };
    const { d, ev } = await bootRecruiting(u);
    const r0 = ev(`(() => { const r = recruits.find(r => r.name === ${JSON.stringify(names[0])}); return { ppg: r.stats.aau.ppg, team: r.stats.aau.team, net: r.stats.aau.net, acc: r.accolades }; })()`);
    ok(r0.ppg === 24.6 && /Team Takeover/.test(r0.team) && r0.net === '18.7', 'recruiting: a player\'s summer is his AAU line');
    ok(r0.acc.includes('Peach Jam Champion') && r0.acc.includes('Nike EYBL MVP'), 'recruiting: and his honors are accolades');
    const r1 = ev(`(() => { const r = recruits.find(r => r.name === ${JSON.stringify(names[1])}); return { fiba: r.stats.fiba.ppg, team: r.stats.fiba.team }; })()`);
    ok(r1.fiba === 15.1 && r1.team === 'USA U19', 'recruiting: FIBA lines too');
    ev("switchTab('summer')");
    const txt = d.getElementById('summerContainer').textContent;
    ok(/Peach Jam/.test(txt) && /Team Takeover/.test(txt) && /FIBA U19 World Cup/.test(txt) && /Scoring leaders/.test(txt) && /2028/.test(txt), 'recruiting: the Summer Circuit tab shows champions, medals, leaders and past summers');
    ok(d.querySelectorAll('.nav-btn')[4].classList.contains('active') && ev('location.hash') === '#/summer', 'recruiting: the tab has its own address');
    ev(`openRecruitProfile(recruits.find(r => r.name === ${JSON.stringify(names[0])}))`);
    ok(/Peach Jam Champion/.test(d.getElementById('profileContainer').textContent), 'recruiting: the profile lists his summer honors');
  }

  // ---- Recruiting: the summer as a season, game by game ----
  {
    const two = RECRUITS.filter(r => String(r.classYear) === '2029').slice(20, 24);
    const ids = two.map((r, i) => 'p' + i);
    const line = (ppg) => ({ gp: 12, mpg: 28.0, ppg, rpg: 7.0, apg: 2.5, spg: 1.0, bpg: 1.5, topg: 2.0, fg: '61.0%', fg2: '64.0%', fg3: '30.0%', ft: '70.0%', bpm: 5.1, obpm: 3, dbpm: 2.1, ts: '62.0%', rts: '8.0%', efg: '61.0%', oreb: '9.0%', dreb: '18.0%', trb: '13.0%', ast: '12.0%', tov: '11.0%', stl: '1.8%', blk: '4.0%', usg: '22.0%', ftr: '.400', p3ar: '.100', ortg: 120.1, drtg: 98.2, fga2: 9, rimFga: 6, rimPct: '70.0%', shortMidFga: 1.8, shortMidPct: '45.0%', longMidFga: 1.2, longMidPct: '40.0%', rimMidRatio: '2.00', fga3: 1, fta: 4 });
    // [id, min, pts, oreb, dreb, ast, stl, blk, tov, pf, twoPm, twoPa, threePm, threePa, ftm, fta, started]
    const box = (a, b) => [[[ids[a], 30, 20, 3, 6, 2, 1, 2, 2, 2, 8, 12, 0, 1, 4, 5, 1]], [[ids[b], 28, 14, 1, 5, 3, 1, 0, 3, 3, 5, 10, 1, 4, 1, 2, 1]]];
    const u = clone(UNIVERSE);
    u.summer = {
      v: 2, season: 2029, step: 5, done: false,
      steps: ['Session 1', 'Session 2', 'Session 3', 'Session 4', 'Championship quarters & semis', 'Championship finals'].map((x, i) => ({ key: 's' + i, label: x, short: x })),
      circuits: [{ key: 'EYBL', name: 'Nike EYBL', event: 'Peach Jam', standings: [['Team Takeover', 2, 0, 150, 130], ['Expressions', 0, 2, 130, 150]],
        programs: [{ name: 'Team Takeover', roster: [ids[0], ids[2]] }, { name: 'Expressions', roster: [ids[1], ids[3]] }],
        champion: null, finalists: ['Team Takeover', 'Expressions'], mvp: { id: ids[0], name: two[0].name, team: 'Team Takeover', line: '20 ppg' }, firstTeam: [] }],
      fiba: null,
      games: [
        { id: 'EYBL|2029|1', st: 's1', ev: 'EYBL', rd: 'Session 1', h: 'Team Takeover', a: 'Expressions', hs: 75, as: 64, b: box(0, 1) },
        { id: 'EYBL|2029|2', st: 's2', ev: 'EYBL', rd: 'Session 2', h: 'Expressions', a: 'Team Takeover', hs: 66, as: 75, b: box(1, 0) },
        { id: 'EYBL|2029|3', st: 'cf', ev: 'EYBL', rd: 'Final', h: 'Team Takeover', a: 'Expressions', hidden: 1 }
      ],
      names: { [ids[0]]: two[0].name, [ids[1]]: two[1].name },
      history: [],
      players: [
        { id: ids[0], n: two[0].name, c: 2029, t: 'Team Takeover', ci: 'EYBL', aau: line(20), prev: { s: 2028, t: 'Team Takeover', ci: 'EYBL', aau: line(15.5) } },
        { id: ids[1], n: two[1].name, c: 2029, t: 'Expressions', ci: 'EYBL', aau: line(14) }
      ]
    };
    const { d, ev } = await bootRecruiting(u);
    ev("switchTab('summer')");
    const txt = () => d.getElementById('summerContainer').textContent;
    ok(/Next: Championship finals/.test(txt()) && /Session 4/.test(txt()) && d.querySelectorAll('.summer-steps li.done').length === 5, 'recruiting: the summer shows where it stands');
    ok(/Team Takeover/.test(txt()) && /2-0/.test(txt()) && d.querySelectorAll('.summer-game').length >= 3, 'recruiting: standings and every result');
    ok(/Final to be revealed/.test(txt()) && !/🏆/.test(txt()), 'recruiting: a final not yet watched in the NCAA RP stays hidden');
    ev("openSummerBox('EYBL|2029|1')");
    const sheet = d.getElementById('summerSheet');
    ok(sheet && new RegExp(two[0].name).test(sheet.textContent) && /8-13/.test(sheet.textContent), 'recruiting: any game opens its box score');
    ok(sheet.querySelectorAll('.summer-box .starter-badge').length === 2 && sheet.querySelector('.summer-box tr.is-starter'), 'recruiting: box scores mark the starters');
    ev('closeSummerBox()');
    ev("setSummerTab('leaders')");
    ok(/AAU points/.test(txt()) && new RegExp(two[0].name).test(txt()), 'recruiting: summer leaders');
    ev(`openRecruitProfile(recruits.find(r => r.name === ${JSON.stringify(two[0].name)}))`);
    const prof = d.getElementById('profileContainer').textContent;
    ok(/Summer 2029 \(so far\)/.test(prof) && /Summer 2028/.test(prof), 'recruiting: his simulated summers are his AAU line, last summer kept below');
    ok(!/Before the sim/.test(prof), 'recruiting: the simulated line replaces the sheet\'s written one');
    ok(/game log/.test(prof) && /Expressions/.test(prof), 'recruiting: the profile has his summer game log');
  }

  // ---- Recruiting: the summer played on the page, against the save ----
  {
    global.RosterGen = require('../js/roster-gen.js');
    require('../js/recruit-gen.js');
    global.GameCore = require('../js/game-core.js');
    const SC = require('../js/summer-core.js');
    const num = v => { const n = parseFloat(String(v == null ? '' : v).replace('%', '')); return isNaN(n) ? null : n; };
    const people = RECRUITS.map((r, i) => ({ id: 'rec' + i, name: r.name, rank: num(r.rank), rating: num(r.rating), recRating: num(r.rating), talent: 70 + (num(r.rating) - 80) * 1.15, pos: r.pos, cls: Number(r.classYear), state: r.state, aauTeam: '', sheet: true, written: null }));
    // The summer of 2027: the classes of 2028 and 2029 on the circuit.
    const P = SC.plan(2027, { aauPlayers: people, fibaEligible: people.map(p => ({ ...p, nation: 'USA' })) });
    const recs = people.map(p => ({ id: p.id, name: p.name, recClassYear: p.cls, pos: p.pos, rsci: p.rank }));
    const { d, ev, store, writes } = await bootRecruitingWithSave(null, { id: 1, currentYear: 2026, summer: P, allRecruits: recs, summerHistory: [] });
    ev("switchTab('summer')");
    const box = () => d.getElementById('summerContainer');
    ok(/Sim AAU Session 1/.test(box().textContent) && /Sim the rest of the summer/.test(box().textContent), 'recruiting: with a save at its summer, the Summer Circuit tab plays it');
    await ev('simSummer(false)');
    ok(store[1].summer.step === 1 && store[1].summer.games.length > 10 && store[1].summer.rev > P.rev, `recruiting: Sim plays a step and writes it to the save (${store[1].summer.games.length} games)`);
    ok(writes.every(k => k.join() === 'summer'), 'recruiting: only the summer is written, never the rest of the save');
    const name = ev("recruits.find(r => r.stats && r.stats.aau && r.stats.aau.sim && r.stats.aau.gp >= 2).name");
    ok(!!name, `recruiting: players' AAU lines are the simulated ones (${name})`);
    ok(/Sim AAU Session 2/.test(box().textContent) && /Session 1/.test(box().textContent), 'recruiting: and the tab moves on to the next step');
    await ev('simSummer(true)');
    ok(store[1].summer.done && store[1].summer.step === store[1].summer.steps.length, 'recruiting: Sim the rest plays out the summer');
    ok(/This summer is over/.test(box().textContent) && /🏆/.test(box().textContent), 'recruiting: champions show once it\'s over (finals played here aren\'t held back)');
    ok(ev("recruits.some(r => (r.accolades || []).some(a => /Champion|MVP/.test(a)))"), 'recruiting: honors join the accolades');
  }

  // ---- RP hub: card status lines follow the universe ----
  {
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'rp/index.html'), 'utf8'), {
      url: 'http://localhost/rp/index.html', runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true,
      beforeParse(w) {
        w.fetch = url => String(url).includes('data/universe.json')
          ? Promise.resolve({ ok: true, json: () => Promise.resolve(clone(UNIVERSE)) })
          : Promise.reject(new Error('offline'));
      }
    });
    await new Promise(r => dom.window.addEventListener('load', r));
    await tick(100);
    const st = k => dom.window.document.querySelector(`[data-uni="${k}"]`).textContent;
    ok(st('ncaa') === '2029-30 · Preseason', `rp hub: NCAA card shows the season (${st('ncaa')})`);
    ok(st('draft') === '2030 mock draft live', `rp hub: Draft card shows the draft stage (${st('draft')})`);
    ok(/transfers · 2029-30/.test(st('recruiting')), `rp hub: Recruiting card counts this season's transfers (${st('recruiting')})`);
    dom.window.close();
  }

  console.log('\nRP pages verified.');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
