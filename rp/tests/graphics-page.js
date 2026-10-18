// The Graphics (beta) page: admin-only, hidden from the sitemap, saves to
// an admin-only document, and builds its forms for every look and template.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const { ok, RP } = require('./harness');
const ROOT = path.join(RP, '..');

(async () => {
  const raw = fs.readFileSync(path.join(ROOT, 'graphics.html'), 'utf8');
  ok(/<meta name="robots" content="noindex, nofollow">/.test(raw), 'graphics page is noindex');
  ok(!/graphics/.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')), 'graphics page is not in the sitemap');
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  ok(/match \/graphics\/\{document=\*\*\} \{\s*allow read, write: if isAdmin\(\);/.test(rules), 'saved graphics are admin-only in the rules');
  ok(/id: 'graphics', label: 'Graphics'/.test(fs.readFileSync(path.join(ROOT, 'assets/site.js'), 'utf8')), 'Graphics link is in the admin-only menu');

  const html = raw.replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/graphics.html', runScripts: 'outside-only' });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.__GRAPHICS_NO_AUTOSTART = true;
  w.HTMLCanvasElement.prototype.getContext = () => null; // no canvas in jsdom; drawing is checked in a browser
  w.confirm = () => true;
  let saved = null;
  w.Cloud = { admin: true, user: { email: 'a@b.c' }, getGraphics: async () => null, saveGraphics: async d => (saved = JSON.parse(JSON.stringify(d)), d) };
  ['assets/graphics-draw.js', 'assets/graphics.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  const G = w.Graphics, D = w.GraphicsDraw;
  ok(D.nbaTeam('LAL') === 'Los Angeles Lakers' && D.nbaTeam('Thunder') === 'OKC Thunder' && D.nbaTeam('Trail Blazers') === 'Portland Trailblazers', 'NBA team names and abbreviations find their logos');
  D.NBA_TEAMS.forEach(t => ok(fs.existsSync(path.join(ROOT, 'nbalogos', t + '.png')), `logo file for ${t}`));
  await G.start({ skipGate: true });
  const body = () => w.document.getElementById('gxBody');
  for (const look of ['nba', 'draft', 'ncaa']) {
    body().querySelector(`[data-set="look"][data-v="${look}"]`).click();
    for (const tpl of ['statline', 'awards', 'leaders', 'overlay']) {
      body().querySelector(`[data-set="tpl"][data-v="${tpl}"]`).click();
      ok(G.cur.look === look && G.cur.tpl === tpl && body().querySelector(tpl === 'overlay' ? '#gxForm [data-k="player"]' : '#gxForm [data-k="note"]'), `${look} ${tpl} form builds`);
      if (tpl === 'overlay') ok(G.cur.size === '9x16' && /transparent/.test(body().innerHTML) && !body().querySelector('[data-act="all-sizes"]'), `${look} overlay is 9:16 and transparent`);
    }
  }
  body().querySelector('[data-set="tpl"][data-v="awards"]').click();
  ok(/Player of the Week/.test(body().innerHTML) && !/Prospect of the Week/.test(body().innerHTML), 'NCAA awards use NCAA award names');
  body().querySelector('button[data-bg="#c8122e"]').click();
  ok(G.cur.style.bg === '#c8122e', 'background color can be changed');
  ok(G.upgrade({ id: 'x', look: 'nba', tpl: 'list', f: { title: 'Old', rows: [{ player: 'A', team: 'LAL' }] } }).tpl === 'leaders', 'graphics saved in the in-between layouts still open');
  const player = body().querySelector('[data-k="rows.0.player"]');
  player.value = 'Test Player'; player.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(G.cur.f.rows[0].player === 'Test Player', 'row fields edit');
  body().querySelector('[data-act="add-row"]').click();
  ok(G.cur.f.rows.length === 6, 'rows can be added');
  body().querySelector('[data-act="del-row"][data-i="5"]').click();
  await G.save();
  ok(saved && saved.items.length === 1 && saved.items[0].tpl === 'awards' && saved.items[0].name, 'saves to the database with a name');
  G.cur.f.title = 'Changed'; await G.save(true);
  ok(saved.items.length === 2, 'save as copy adds a second graphic');
  w.Cloud.admin = false;
  ok(await G.persist() === false && /admin/.test(G.msg), 'non-admins cannot save');
})();
