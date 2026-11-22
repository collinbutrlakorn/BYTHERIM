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
    for (const tpl of ['statline', 'awards', 'leaders', 'overlay', 'cover', 'thumb']) {
      body().querySelector(`[data-set="tpl"][data-v="${tpl}"]`).click();
      ok(G.cur.look === look && G.cur.tpl === tpl && body().querySelector((tpl === 'overlay' || tpl === 'cover' || tpl === 'thumb') ? '#gxForm [data-k="player"]' : '#gxForm [data-k="note"]'), `${look} ${tpl} form builds`);
      if (tpl === 'overlay') ok(G.cur.size === '9x16' && /transparent/.test(body().innerHTML) && !body().querySelector('[data-act="all-sizes"]'), `${look} overlay is 9:16 and transparent`);
      if (tpl === 'cover' || tpl === 'thumb') ok(G.cur.size === '3x4' && body().querySelector('.gx-canvas-wrap.gx-3x4') && body().querySelector('[data-set-select="size"]').value === '3x4', `${look} ${tpl} starts at 3:4, the tile shape of both the TikTok and Instagram profile grids`);
    }
  }
  // Thumbnails are 3:4: a 4:5 one has white bars on TikTok and a 9:16 one is cropped on Instagram.
  ok(D.SIZES['3x4'].h * 3 === D.W * 4, 'the 3:4 size is 1080 x 1440');
  const opts = () => [...body().querySelectorAll('[data-set-select="size"] option')].map(o => o.value).join();
  body().querySelector('[data-set="tpl"][data-v="thumb"]').click();
  ok(opts() === '3x4,9x16' && !body().querySelector('[data-act="all-sizes"]'), 'the reel thumbnail is 3:4 or the full 9:16');
  body().querySelector('[data-set="tpl"][data-v="cover"]').click();
  ok(opts() === '3x4,4x5,1x1,9x16' && /All 4 sizes/.test(body().querySelector('[data-act="all-sizes"]').textContent) && /white bars on TikTok/.test(body().innerHTML), 'the cover offers every size, with 3:4 first and a note on why');
  G.cur.size = '4x5';
  body().querySelector('[data-set="tpl"][data-v="thumb"]').click();
  ok(G.cur.size === '3x4', 'a reel thumbnail cannot keep a 4:5 size');
  body().querySelector('[data-set="tpl"][data-v="statline"]').click();
  ok(G.cur.size === '4x5', 'a statline goes back to the size it had');
  body().querySelector('[data-set="tpl"][data-v="cover"]').click();
  G.newGraphic('nba', 'cover');
  ok(G.cur.size === '3x4' && (G.newGraphic('nba', 'thumb'), G.cur.size === '3x4') && (G.newGraphic('nba', 'statline'), G.cur.size === '4x5'), 'new graphics start at 3:4 for thumbnails and 4:5 for the rest');
  for (const [tpl, size, scale, h] of [['thumb', '3x4', 1, 1440], ['thumb', '9x16', 1, 1920], ['thumb', '3x4', 2, 2880], ['cover', '3x4', 1, 1440], ['cover', '4x5', 1, 1350], ['overlay', '3x4', 1, 1920], ['statline', '3x4', 1, 1440]]) {
    G.newGraphic('nba', tpl);
    const c = w.document.createElement('canvas'), g = JSON.parse(JSON.stringify(G.cur));
    g.size = size;
    await D.draw(c, g, { scale });
    ok(c.width === 1080 * scale && c.height === h, `${tpl} ${size} draws ${c.width} x ${c.height}`);
  }
  G.newGraphic('nba', 'statline');
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
