// Covers the main BYTHERIM site (home, podcast, draft, NBA, about):
// every page shares one stylesheet and one header/footer from
// assets/site.js, declares its charset, carries no leftover inline style
// blocks or placeholder social links, and boots cleanly in a browser-like
// DOM, including with the feeds down. Also checks how assets/board.js
// cleans the big-board sheet, and that the draft page renders tiers,
// profiles, stats and deep links from it.
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
// Only local scripts load; embeds and remote images are skipped.
// Pages are served from http://localhost/ (so localStorage exists) and
// scripts are read straight from the repo.
class LocalOnly extends ResourceLoader {
  fetch(url) {
    if (!url.startsWith('http://localhost/') || !/\.js$/.test(url)) return null;
    const f = path.join(ROOT, decodeURIComponent(new URL(url).pathname));
    return Promise.resolve(fs.readFileSync(f));
  }
}
function ok(c, m) { if (!c) throw new Error('FAILED: ' + m); console.log('OK: ' + m); }

const ROOT = path.join(__dirname, '..', '..');
const PAGES = ['index', 'podcast', 'draft', 'nba', 'about'];
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const siteJs = read('assets/site.js');

// ------------------------------------------------------------ static checks
PAGES.forEach(p => {
  const html = read(p + '.html');
  ok(/<meta charset="UTF-8">/i.test(html), `${p}: declares UTF-8 (no mojibake dashes)`);
  ok(html.includes('name="viewport"'), `${p}: has a viewport meta`);
  ok(html.includes('href="assets/site.css"') && html.includes('src="assets/site.js"'), `${p}: loads the shared stylesheet and script`);
  ok(!/<style[\s>]/i.test(html), `${p}: no inline <style> block overriding the shared design`);
  ok(!html.includes('href="style.css"'), `${p}: no longer loads the old root style.css`);
  const body = html.slice(html.indexOf('<body>') + 6).trimStart();
  ok(body.startsWith('<script>BTR.mount('), `${p}: header is mounted first thing in <body>`);
  ok(!html.includes('â€'), `${p}: no mojibake in the source`);
});

// Placeholder / generic links that used to sit in the footers and buttons.
const allSource = PAGES.map(p => read(p + '.html')).join('\n') + siteJs;
[
  ['UC_YOUR_YOUTUBE_CHANNEL_ID', 'placeholder YouTube channel id'],
  ['href="https://youtube.com"', 'bare youtube.com link'],
  ['href="https://x.com"', 'bare x.com link'],
  ['href="https://substack.com"', 'bare substack.com link'],
  ['https://open.spotify.com"', 'bare Spotify homepage link'],
  ['ko-fi.com"', 'generic Ko-fi homepage link']
].forEach(([needle, label]) => ok(!allSource.includes(needle), 'removed: ' + label));
ok(siteJs.includes('open.spotify.com/show/'), 'Spotify points at the show');
ok(siteJs.includes('podcasts.apple.com/us/podcast/'), 'Apple Podcasts points at the show');

// RP pages still rely on the root stylesheet, so it must stay.
ok(fs.existsSync(path.join(ROOT, 'style.css')), 'root style.css kept for the RP pages');
['index.html', 'ncaa.html', 'draft.html'].forEach(f => {
  if (fs.existsSync(path.join(ROOT, 'rp', f))) ok(read('rp/' + f).includes('../style.css'), `rp/${f} still finds its stylesheet`);
});

// ------------------------------------------------------------ boot helpers
const BOARD_CSV = [
  'pick,tier,name,DOB,class,height,weight,position,school,archetype,ESPN Image URL,Scouting Report,PTS,REB,AST,STL,BLK,TS%,eFG%,USG%,BPM,OBPM,DBPM,3Pr,FTr,2P%,3P&,FT%',
  '1,2,Test Wing,10/12/2007,FR,"6\'8""",235 lbs,SF,Kansas,Wing-Creator,,"Big wing.",18.4,7.1,3.9,1.2,0.8,58.2%,54.0%,28.5%,8.9,6.1,2.8,0.34,0.41,55.1%,35.6%,77.0%',
  '2,3,Euro Guard,01/02/2008,INTL,"6\'6""",195 lbs,SG,pro,Playmaking Guard,,,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-',
  '3,3,Conf Big, 03/04/2007,SO,"7\'0""",240 lbs,C, ohiostate ,Rim-Runner,,,SEC,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-',
  ',,Radar Guy,05/06/2008,FR,"6\'3""",180 lbs,PG,Duke,,,,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-'
].join('\n');
const RANKINGS_CSV = 'Rank,Conference Rank,Stock,Team,Conference\n1,1,Up,San Antonio Spurs,West\n2,1,Down,Boston Celtics,East\n3,2,,OKC Thunder,West';
const FEED = {
  status: 'ok', feed: { image: 'https://example.com/show.jpg' },
  items: [
    { title: 'Episode One', link: 'https://collindunks.substack.com/p/ep1', pubDate: '2026-09-20 12:00:00', description: '<p>Ep summary</p>', enclosure: { link: 'https://example.com/a.mp3', type: 'audio/mpeg', duration: 3300 }, thumbnail: 'https://example.com/ep1.jpg' },
    { title: 'An Essay', link: 'https://collindunks.substack.com/p/essay', pubDate: '2026-09-10 12:00:00', description: '<p>Essay summary</p>', enclosure: { link: 'https://substackcdn.com/image/fetch/$s_!x!,f_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc.jpeg', type: 'image/jpeg' } }
  ]
};

function boot(page, { feedsDown = false, hash = '' } = {}) {
  const file = path.join(ROOT, page + '.html');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Could not load (img|iframe|link)|Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    url: 'http://localhost/' + page + '.html' + hash, runScripts: 'dangerously', resources: new LocalOnly(), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      const res = (body, type) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body), json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body) });
      w.fetch = url => {
        url = String(url);
        if (url.includes('2PACX-1vTjSz')) return res(BOARD_CSV);
        if (url.includes('2PACX-1vQMJM')) return res(RANKINGS_CSV);
        if (url.includes('rss2json')) return feedsDown ? Promise.reject(new Error('down')) : res(url.includes('podcast') ? { ...FEED, items: [FEED.items[0]] } : FEED);
        if (url.includes('itunes.apple.com')) return res({ results: [] });
        return Promise.reject(new Error('unexpected fetch ' + url));
      };
      w.HTMLMediaElement.prototype.load = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
    }
  });
  return new Promise(r => dom.window.addEventListener('load', () => setTimeout(() => r({ dom, w: dom.window, d: dom.window.document, errors }), 400)));
}

(async () => {
  // ---------------------------------------------------------- every page
  for (const p of PAGES) {
    const { w, d, errors } = await boot(p);
    ok(errors.length === 0, `${p}: boots with no script errors` + (errors.length ? ' ' + errors.join(' | ') : ''));
    ok(d.querySelectorAll('.site-header').length === 1 && d.querySelectorAll('.site-footer').length === 1, `${p}: exactly one shared header and footer`);
    const navText = [...d.querySelectorAll('.site-nav a')].map(a => a.textContent.trim());
    ['Podcast', 'Draft', 'NBA', 'About'].forEach(t => ok(navText.some(x => x.includes(t)), `${p}: nav has ${t}`));
    if (p !== 'index') ok(d.querySelector(`.site-nav a[href="${p}.html"].active, .site-nav a[href="${p}.html"][aria-current]`), `${p}: its own nav item is marked current`);
    ok(!d.querySelector('[data-icon]'), `${p}: icon placeholders hydrated`);
    ok(!d.querySelector('[data-support]'), `${p}: support block hidden while no support link is set`);
    const hrefs = [...d.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
    ok(!hrefs.some(h => h === '#' || h === ''), `${p}: no dead "#" links`);
    w.close();
  }

  // ---------------------------------------------------------- theme + menu
  {
    const { w, d } = await boot('about');
    const html = d.documentElement;
    const before = html.dataset.theme || 'dark';
    d.querySelector('[data-action="theme"]').click();
    ok((html.dataset.theme || 'dark') !== before, 'theme button flips the theme');
    ok(w.localStorage.getItem('bytherim-site-theme') === html.dataset.theme, 'theme choice is remembered');
    const btn = d.querySelector('[data-action="menu"]');
    btn.click();
    ok(btn.getAttribute('aria-expanded') === 'true', 'hamburger opens the menu');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    ok(btn.getAttribute('aria-expanded') === 'false', 'Escape closes the menu');
    w.close();
  }

  // ---------------------------------------------------------- feeds
  {
    const { w, d } = await boot('index');
    ok(d.querySelectorAll('#latest .post-card').length === 2, 'home: latest posts rendered from the feed');
    const essayImg = d.querySelector('#latest .post-card:nth-child(2) img');
    ok(essayImg && essayImg.getAttribute('src').startsWith('https://substack-post-media.s3.amazonaws.com/'), 'home: Substack proxy image unwrapped to the original');
    ok(d.querySelectorAll('#boardTeaser li a').length === 3, 'home: big-board teaser lists only ranked prospects');
    ok(d.querySelector('#boardTeaser a').getAttribute('href') === 'draft.html#test-wing', 'home: teaser deep-links into the board');
    w.close();
  }
  {
    const { w, d } = await boot('index', { feedsDown: true });
    ok(d.querySelector('#latest .empty-state'), 'home: says so when the feed is down, with a Substack link');
    w.close();
  }
  {
    const { w, d } = await boot('podcast');
    ok(d.querySelector('.featured-ep h2').textContent.includes('Episode One'), 'podcast: latest episode featured');
    ok(d.querySelector('.featured-ep audio'), 'podcast: featured episode is playable in-page');
    ok(!d.body.textContent.includes('An Essay'), 'podcast: articles kept off the podcast page');
    w.close();
  }
  {
    const { w, d } = await boot('nba');
    ok(d.querySelectorAll('#feed .post-card').length === 2, 'nba: feed shows articles and episodes');
    d.querySelector('#typeChips [data-type="article"]').click();
    ok(d.querySelectorAll('#feed .post-card').length === 1, 'nba: Articles chip filters the feed');
    ok(d.querySelectorAll('#rankings .pr-item').length === 3, 'nba: power rankings rendered');
    ok(d.querySelector('#rankings .pr-move.up') && d.querySelector('#rankings .pr-move.down'), 'nba: movement arrows from the Stock column');
    d.querySelector('#confChips [data-conf="West"]').click();
    const west = [...d.querySelectorAll('#rankings .pr-team')].map(e => e.textContent);
    ok(west.length === 2 && west[0] === 'San Antonio Spurs', 'nba: West tab lists West teams by conference rank');
    w.close();
  }

  // ---------------------------------------------------------- board.js
  {
    const { w, d } = await boot('draft');
    const B = w.BOARD;
    const rows = await B.loadBoard();
    const wing = rows.find(r => r.name === 'Test Wing');
    ok(wing.id === 'test-wing', 'board: prospects get URL-safe ids');
    ok(wing.stats['3P%'] === '35.6%', 'board: the sheet\'s "3P&" header is read as 3P%');
    ok(wing.hasStats && Object.keys(wing.stats).length === 16, 'board: all 16 stats captured');
    const euro = rows.find(r => r.name === 'Euro Guard');
    ok(euro.isPro && !euro.hasStats, 'board: "-" cells ignored and Pro detected');
    const big = rows.find(r => r.name === 'Conf Big');
    ok(big.school === 'Ohio State', 'board: slug-style school names cleaned up (" ohiostate " -> Ohio State)');
    ok(big.conference === 'SEC' && !big.hasStats, 'board: a conference tag in a stat cell is kept as the conference, not a stat');
    ok(rows[rows.length - 1].rank == null, 'board: unranked prospects sort after the ranked ones');

    // ------------------------------------------------------ draft page
    ok(d.querySelectorAll('article.pr').length >= 3, 'draft: ranked rows rendered');
    ok(d.querySelectorAll('.tier-head').length === 2, 'draft: one heading per tier');
    ok(!d.getElementById('radarWrap').hidden && d.getElementById('radar').hidden, 'draft: On the Radar starts collapsed');
    ok(d.getElementById('radarToggle').textContent.includes('Show 1 more'), 'draft: toggle says how many are hidden');
    d.getElementById('radarToggle').click();
    ok(d.getElementById('radar').textContent.includes('Radar Guy'), 'draft: toggle reveals the unranked prospects');
    ok(d.getElementById('p-test-wing'), 'draft: each row is addressable by its id');
    d.getElementById('p-test-wing').querySelector('.pr-main').click();
    const row = d.getElementById('p-test-wing');
    ok(row.classList.contains('open') && w.location.hash === '#test-wing', 'draft: opening a row updates the shareable link');
    const stats = row.querySelectorAll('.stat');
    ok(stats.length === 16, 'draft: opening a profile shows its stats grid');
    ok(row.querySelectorAll('.pr-statlabel').length === 3, 'draft: stats grouped under three labels');
    const search = d.getElementById('boardSearch');
    search.value = 'euro'; search.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250)); // search is debounced
    const visible = [...d.querySelectorAll('.pr')].filter(e => !e.hidden && e.style.display !== 'none' && !e.closest('[hidden]'));
    ok(visible.length === 1 && visible[0].textContent.includes('Euro Guard'), 'draft: search narrows the board');
    w.close();
  }
  {
    const { w, d } = await boot('draft', { hash: '#conf-big' });
    const row = d.getElementById('p-conf-big');
    ok(row && (row.classList.contains('open') || row.querySelector('[aria-expanded="true"]')), 'draft: #slug deep link opens that profile');
    ok(row.textContent.includes('Full scouting report coming soon'), 'draft: prospects without a report say so plainly');
    w.close();
  }

  console.log('\nMain site pages verified.');
})().catch(e => { console.error(e.message); process.exit(1); });
