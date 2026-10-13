// The league (beta) page: admin-only, hidden from the sitemap, and its
// teams, checklist and jersey previews work from a blank start.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const { ok, RP } = require('./harness');
const ROOT = path.join(RP, '..');

(async () => {
  const raw = fs.readFileSync(path.join(ROOT, 'league.html'), 'utf8');
  ok(/<meta name="robots" content="noindex, nofollow">/.test(raw), 'league page is noindex');
  ok(!/league/.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')), 'league page is not in the sitemap');
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  ok(/match \/league\/\{document=\*\*\} \{\s*allow read, write: if isAdmin\(\);/.test(rules), 'league data is admin-only in the rules');
  ['pdx', 'mwv', '907', 'sea', 'eug', 'tac'].forEach(c => {
    const s = fs.readFileSync(path.join(ROOT, 'assets/league/patches', c + '.svg'), 'utf8');
    ok(s.includes('#00AA01') && s.includes('#00AA02'), `${c} patch template has its color slots`);
  });

  const html = raw.replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/league.html', runScripts: 'outside-only' });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.__LEAGUE_NO_AUTOSTART = true;
  w.confirm = () => true;
  let saved = null;
  w.Cloud = { admin: true, user: { email: 'a@b.c' }, getLeague: async () => null, saveLeague: async d => (saved = d, { ...d, updatedAt: 1 }) };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/league.js'), 'utf8'), ctx, { filename: 'league.js' });
  const L = w.League;
  await L.start({ skipGate: true });
  const body = () => w.document.getElementById('lgBody');
  ok(/Beaverton YMCA/.test(body().innerHTML) && /Up next/.test(body().textContent), 'overview starts from the defaults');
  ok(L.data.checklist.length >= 10, 'checklist starts with launch tasks');

  L.setTab('teams');
  body().querySelector('[data-act="add-team"]').click();
  const name = body().querySelector('[data-team="name"]');
  name.value = 'Albany Elite'; name.dispatchEvent(new w.Event('input', { bubbles: true }));
  const prim = body().querySelector('input[type=text][data-team="primary"]');
  prim.value = 'c8102e'; prim.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(L.data.teams[0].name === 'Albany Elite' && L.data.teams[0].primary === '#C8102E', 'team name and color edit');
  ok(/ALBANY/.test(body().querySelector('#lgJerseys').innerHTML) && /ELITE/.test(body().querySelector('#lgJerseys').innerHTML), 'long names split onto two lines on the jersey');
  body().querySelector('[data-act="add-player"]').click();
  ok(L.data.teams[0].players.length === 1, 'players can be added');
  await L.save();
  ok(saved && saved.teams[0].name === 'Albany Elite', 'saves to the database');

  w.Cloud.admin = false;
  await L.save();
  ok(/admin/.test(w.document.getElementById('lgSave').textContent), 'non-admins cannot save');

  // The draft page's image export: admin-only button, drawing code on demand.
  const draft = fs.readFileSync(path.join(ROOT, 'draft.html'), 'utf8');
  ok(/id="exportBtn" type="button" hidden/.test(draft), 'draft: export button starts hidden');
  ok(/BTR\.whenAdmin\(on => \{ exportBtn\.hidden = !on; \}\)/.test(draft), 'draft: export button only shows for admins');
  ok(!/<script src="assets\/board-export\.js"/.test(draft), 'draft: export code loads only when used');
  const exp = fs.readFileSync(path.join(ROOT, 'assets/board-export.js'), 'utf8');
  ok(/W = 1080, H = 1350/.test(exp) && /\[10, 20, 30, 60\]/.test(exp), 'export: 1080x1350 at top 10/20/30/60');
  ok(/whenAdmin/.test(fs.readFileSync(path.join(ROOT, 'assets/site.js'), 'utf8')), 'site.js exposes whenAdmin');
  ['assets/site.css', 'assets/chrome.css'].forEach(f => ok(/\.beta-tag \{/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), `${f} styles the Beta tag`));
  console.log('league-page: done');
})().catch(e => { console.error(e); process.exit(1); });
