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
    ok(navs.join() === 'Class Rankings,School Rankings,Statistics,Transfer Portal', 'recruiting: Transfer Portal tab in the nav');
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
