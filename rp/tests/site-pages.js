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

// The NCAA RP and Draft RP share the site's header and footer through
// assets/chrome.css (header/footer only, so the sim's own styles are
// untouched), load the site fonts, and follow the site's theme button.
['ncaa.html', 'draft.html'].forEach(f => {
  const html = read('rp/' + f);
  ok(html.includes('href="../assets/chrome.css"') && html.includes('src="../assets/site.js"'), `rp/${f}: loads the shared header and footer`);
  ok(html.indexOf('../assets/chrome.css') < html.indexOf('css/ncaa-styles.css'), `rp/${f}: shared chrome loads before the RP's own styles`);
  ok(html.includes("BTR.mount('rp', { base: '../' })"), `rp/${f}: header mounted with a ../ base path`);
  ok(!html.includes('../style.css') && !html.includes('class="navbar"') && !html.includes('class="footer"'), `rp/${f}: old header, footer and stylesheet gone`);
  ok(/family=[^"]*Oswald/.test(html), `rp/${f}: loads Oswald, the font its headings use`);
  ok(!html.includes('theme-toggle'), `rp/${f}: no second theme switch; the site header's button owns it`);
});
ok(!/prefers-color-scheme/.test(read('rp/css/ncaa-styles.css')), 'rp styles: dark by default like the site (no follow-the-device rule)');
{
  const chrome = read('assets/chrome.css');
  ok(!/^\s*(html|body|img|a|button|h[1-6]|\*)\s*[,{]/m.test(chrome), 'chrome.css: no page-wide rules that could reach into the sim');
  ok(/\.site-header,\s*\.site-footer\s*\{[^}]*--accent:\s*#c86fb4/.test(chrome), 'chrome.css: site colours set on the header and footer themselves');
}
// Nothing links the old root stylesheet any more, so it can be deleted.
const htmlFiles = ['index', 'podcast', 'draft', 'nba', 'about'].map(p => p + '.html').concat(['rp/index.html', 'rp/ncaa.html', 'rp/draft.html', 'recruiting/index.html']);
ok(htmlFiles.every(f => !/href="(\.\.\/)?style\.css"/.test(read(f)) || f.startsWith('recruiting/')), 'no page loads the old root style.css');

// The RP hub now uses the main site's design, one folder down.
{
  const hub = read('rp/index.html');
  ok(/<meta charset="UTF-8">/i.test(hub) && !/<style[\s>]/i.test(hub), 'rp hub: charset set, no inline styles');
  ok(hub.includes('href="../assets/site.css"') && hub.includes('src="../assets/site.js"'), 'rp hub: loads the shared design from ../assets');
  ok(hub.includes("BTR.mount('rp', { base: '../' })"), 'rp hub: header mounted with a ../ base path');
  ok(!hub.includes('../style.css'), 'rp hub: old stylesheet dropped');
}

// ------------------------------------------------------------ boot helpers
// Last six columns are the optional ones: Prev Rank, Wingspan, Comparison,
// Strengths, Weaknesses, Film.
const BOARD_CSV = [
  'pick,tier,name,DOB,class,height,weight,position,school,archetype,ESPN Image URL,Scouting Report,PTS,REB,AST,STL,BLK,TS%,eFG%,USG%,BPM,OBPM,DBPM,3Pr,FTr,2P%,3P&,FT%,Prev Rank,Wingspan,Comparison,Strengths,Weaknesses,Film',
  '1,2,Test Wing,10/12/2007,FR,"6\'8""",235 lbs,SF,Kansas,Wing-Creator,,"Big wing.",18.4,7.1,3.9,1.2,0.8,58.2%,54.0%,28.5%,8.9,6.1,2.8,0.34,0.41,55.1%,35.6%,77.0%,3,"7\'0""",Paul George,Pull-up shooting; Size on the wing,Handle under pressure,https://youtube.com/watch?v=abc',
  '2,3,Euro Guard,01/02/2008,INTL,"6\'6""",195 lbs,SG,pro,Playmaking Guard,,,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,,,,,,',
  '3,3,Conf Big, 03/04/2007,SO,"7\'0""",240 lbs,C, ohiostate ,Rim-Runner,,,SEC,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,3,,,,,',
  '4,3,Old Guard,02/02/2004,SR,"6\'2""",185 lbs,PG,Oregon,Floor General,,,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,2,,,,,',
  ',,Radar Guy,05/06/2008,FR,"6\'3""",180 lbs,PG,Duke,,,,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,,,,,,'
].join('\n');
// data/stats.json as tools/update-stats.mjs writes it.
const line = (pts, team, gp) => ({ torvikName: 'x', team, conf: 'B10', gp, mpg: '30.1', stats: { PTS: pts, REB: '4.0', AST: '5.5', 'TS%': '57.0%', BPM: '4.4' } });
const STATS = { updated: '2026-09-26T00:00:00Z', source: 'barttorvik.com', seasons: {
  '2025-26': { 'conf-big': line('9.1', 'Ohio St.', 31), 'old-guard': line('15.2', 'Arizona', 33), 'past-star': line('22.1', 'Duke', 35) },
  '2026-27': { 'conf-big': line('12.4', 'Ohio St.', 4) }
}, pro: {
  'euro-guard': { url: 'https://www.basketball-reference.com/international/players/euro-guard-1.html', seasons: [
    { label: '2025-26', team: 'Baskonia (EuroLeague)', stats: { G: '11', MP: '5.9', PTS: '0.6' } },
    { label: '2025-26', team: 'Baskonia (Liga ACB)', stats: { G: '10', MP: '8.3', PTS: '2.9' } },
    { label: '2026-27', team: 'Real Madrid (Liga ACB)', stats: { G: '3', MP: '20.0', PTS: '8.0' } },
    { label: '2027-28', team: 'Real Madrid (Liga ACB)', stats: { G: '1', MP: '20.0', PTS: '9.0' } }
  ] }
} };
// A past board (the sheet's "2026 Board" tab) with actual draft results,
// and the published sheet's tab list. "2025 Board" is still an unedited
// copy of the current board, so the site should leave it off.
const PAST_CSV = [
  'pick,tier,name,DOB,class,height,weight,position,school,archetype,Draft Pick,Draft Team,Draft Year',
  '1,1,Past Star,01/01/2007,FR,"6\'9""",230 lbs,SF,Duke,Wing-Creator,1,Wizards,',
  '2,2,Past Guard,02/02/2006,SO,"6\'4""",190 lbs,PG,BYU,Floor General,31,BOS,',
  '3,2,Past Return,03/03/2007,FR,"6\'10""",240 lbs,C,Kansas,Rim-Runner,Returned,,',
  '4,3,Late Pick,04/04/2005,JR,"6\'6""",210 lbs,SF,Oregon,Wing,5,Spurs,2027',
  '5,?,Maybe Guy,05/05/2004,SR,"6\'3""",185 lbs,SG,Iowa,Shooter,Undrafted,,'
].join('\n');
const PUBHTML = 'var items = [];' + [['2027 Board', '0'], ['2026 Board', '111'], ['2025 Board', '222'], ['TorvikData', '333']]
  .map(([n, g]) => `items.push({name: "${n}", pageUrl: "https:\\/\\/docs.google.com\\/x?gid=${g}", gid: "${g}",initialSheet: ("${g}" == gid)});`).join('');
const RANKINGS_CSV = 'Rank,Conference Rank,Stock,Team,Conference\n1,1,Up,San Antonio Spurs,West\n2,1,Down,Boston Celtics,East\n3,2,,OKC Thunder,West';
const FEED = {
  status: 'ok', feed: { image: 'https://example.com/show.jpg' },
  items: [
    { title: 'Episode One', link: 'https://collindunks.substack.com/p/ep1', pubDate: '2026-09-20 12:00:00', description: '<p>Ep summary</p>', enclosure: { link: 'https://example.com/a.mp3', type: 'audio/mpeg', duration: 3300 }, thumbnail: 'https://example.com/ep1.jpg' },
    { title: 'An Essay', link: 'https://collindunks.substack.com/p/essay', pubDate: '2026-09-10 12:00:00', description: '<p>Essay summary</p>', enclosure: { link: 'https://substackcdn.com/image/fetch/$s_!x!,f_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc.jpeg', type: 'image/jpeg' } }
  ]
};

function boot(page, { feedsDown = false, hash = '', query = '' } = {}) {
  const file = path.join(ROOT, page + '.html');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Could not load (img|iframe|link)|Not implemented/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    url: 'http://localhost/' + page + '.html' + query + hash, runScripts: 'dangerously', resources: new LocalOnly(), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      const res = (body, type) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body), json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body) });
      w.fetch = url => {
        url = String(url);
        if (url.includes('2PACX-1vTjSz') && url.endsWith('/pubhtml')) return res(PUBHTML);
        if (url.includes('2PACX-1vTjSz') && url.includes('gid=111')) return res(PAST_CSV);
        if (url.includes('2PACX-1vTjSz')) return res(BOARD_CSV);   // current board, and the 2025 copy (gid=222)
        if (url.includes('2PACX-1vQMJM')) return res(RANKINGS_CSV);
        if (url.includes('rss2json')) return feedsDown ? Promise.reject(new Error('down')) : res(url.includes('podcast') ? { ...FEED, items: [FEED.items[0]] } : FEED);
        if (url.includes('itunes.apple.com')) return res({ results: [] });
        if (url.includes('data/stats.json')) return res(STATS);
        return Promise.reject(new Error('unexpected fetch ' + url));
      };
      w.HTMLMediaElement.prototype.load = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
    }
  });
  return new Promise(r => dom.window.addEventListener('load', () => setTimeout(() => r({ dom, w: dom.window, d: dom.window.document, errors }), 400)));
}

// Reads a profile's stats table: group headings, column labels, rows.
function table(row) {
  const t = row.querySelector('.st-table');
  if (!t) return { groups: [], cols: [], rows: [] };
  return {
    groups: [...t.querySelectorAll('.st-over th[colspan]')].map(th => th.textContent.trim()).filter(Boolean),
    cols: [...t.querySelectorAll('thead tr:last-child th')].map(th => th.textContent.trim()),
    rows: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(c => c.textContent.trim()))
  };
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
    ok(d.querySelectorAll('#boardTeaser li a').length === 4, 'home: big-board teaser lists only ranked prospects');
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
    ok(w.BOARD.normalize({ name: 'X', 'Stats Link': 'https://basketball.realgm.com/player/X/Summary/1' }).statsLink.includes('realgm'), 'board: Stats Link column read');
    ok(w.BOARD.normalize({ name: 'X', GP: '31', MPG: '28.5', PTS: '9.0' }).sheetStats.G === '31' && w.BOARD.normalize({ name: 'X', MIN: '28.5' }).sheetStats.MP === '28.5', 'board: games and minutes read from G/GP and MP/MPG/MIN columns');
    const euro = rows.find(r => r.name === 'Euro Guard');
    ok(euro.isPro && Object.keys(euro.sheetStats).length === 0, 'board: "-" cells ignored and Pro detected');
    const big = rows.find(r => r.name === 'Conf Big');
    ok(big.school === 'Ohio State', 'board: slug-style school names cleaned up (" ohiostate " -> Ohio State)');
    ok(big.conference === 'SEC' && Object.keys(big.sheetStats).length === 0, 'board: a conference tag in a stat cell is kept as the conference, not a stat');
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
    const t = table(row);
    ok(t.cols.length === 18 && t.rows.length === 1 && t.cols[0] === 'Season' && t.cols[1] === 'Team', 'draft: stats shown as a table row per season (' + t.cols.length + ' columns)');
    ok(t.groups.join() === 'Per game,Shooting,Impact', 'draft: grouped column headings, empty groups left out (no G/MP typed for him)');
    ok(t.rows[0][0] === '2026-27' && t.rows[0][2] === '18.4', 'draft: the row starts with season, team, then the numbers');
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

  // ---------------------------------------------------------- stats + extras
  {
    const { w, d } = await boot('draft');
    const rows = await w.BOARD.loadBoard();
    const by = id => rows.find(r => r.id === id);
    ok(by('old-guard').seasons.length === 1 && by('old-guard').seasons[0].label === '2025-26', 'board: returning player gets last season from stats.json');
    ok(by('conf-big').seasons.map(x => x.label).join() === '2026-27,2025-26', 'board: this season listed ahead of last season');
    ok(by('test-wing').seasons[0].source === 'sheet', 'board: numbers typed in the sheet stand as this season');
    ok(!by('radar-guy').hasStats, 'board: freshmen without numbers have no stats');
    ok(by('test-wing').strengths.length === 2 && by('test-wing').weaknesses.length === 1, 'board: strengths and weaknesses split on ";"');

    ok(d.querySelector('#p-euro-guard .pr-school img').getAttribute('src') === 'schoollogos/pro.png', 'draft: pros use schoollogos/pro.png');

    ok(d.querySelector('#p-test-wing .bd-move.up').textContent.includes('2'), 'draft: movement from Prev Rank (3 -> 1 shows up 2)');
    ok(d.querySelector('#p-old-guard .bd-move.down'), 'draft: drops show a down arrow');
    ok(d.querySelector('#p-euro-guard .bd-move.new'), 'draft: ranked prospects without a Prev Rank are marked New');
    ok(!d.querySelector('#p-conf-big .bd-move'), 'draft: no badge when the rank is unchanged');

    d.querySelector('#p-old-guard .pr-main').click();
    let row = d.getElementById('p-old-guard');
    let t = table(row);
    ok(t.cols.slice(0, 5).join() === 'Season,Team,G,MP,PTS', 'draft: games and minutes per game lead the stat columns');
    ok(t.rows[0].slice(0, 5).join() === '2025-26,Arizona,33,30.1,15.2', 'draft: last season row with team, games, minutes and points');
    ok(row.textContent.includes('2026-27 numbers are added once he'), 'draft: says this season will be added');
    ok(row.querySelector('.pr-source').href.includes('barttorvik.com'), 'draft: Barttorvik credited with a link');

    d.querySelector('#p-conf-big .pr-main').click();
    row = d.getElementById('p-conf-big');
    t = table(row);
    ok(t.rows.length === 2 && t.rows[0][0] === '2025-26' && t.rows[1][0] === '2026-27', 'draft: two seasons are two rows, oldest first');
    ok(t.rows[0][4] === '9.1' && t.rows[1][4] === '12.4', 'draft: each row carries its own season');

    d.querySelector('#p-test-wing .pr-main').click();
    row = d.getElementById('p-test-wing');
    const facts = row.querySelector('.pr-facts').textContent;
    ok(facts.includes('7\'0"') && facts.includes('Paul George') && facts.includes('#3'), 'draft: wingspan, comparison and previous rank in the facts');
    ok(row.querySelectorAll('.pr-list.plus li').length === 2 && row.querySelectorAll('.pr-list.minus li').length === 1, 'draft: strengths and weaknesses listed');
    ok(row.querySelector('a[href="https://youtube.com/watch?v=abc"]').textContent.includes('Watch film'), 'draft: film link shown');

    w.location.hash = '#radar-guy';
    await new Promise(r => setTimeout(r, 50));
    ok(d.getElementById('p-radar-guy').classList.contains('open'), 'draft: following a #prospect link on the page opens it');
    w.close();
  }

  // ---------------------------------------------------------- RP hub
  {
    const { w, d, errors } = await boot('rp/index');
    ok(errors.length === 0, 'rp hub: boots with no script errors' + (errors.length ? ' ' + errors.join(' | ') : ''));
    const hrefs = sel => [...d.querySelectorAll(sel)].map(a => a.getAttribute('href'));
    ok(hrefs('.site-nav a:not(.nav-rp)').every(h => h.startsWith('../')), 'rp hub: header links step up a folder');
    ok(d.querySelector('.brand').getAttribute('href') === '../' && d.querySelector('.brand img').getAttribute('src') === '../logo.png', 'rp hub: logo links home and loads');
    ok(d.querySelector('.nav-rp').classList.contains('active'), 'rp hub: the RP pill is marked current');
    ok(hrefs('.site-footer a').filter(h => !/^https?:/.test(h)).every(h => h.startsWith('../')), 'rp hub: footer links step up a folder');
    const mods = hrefs('.rp-module-link');
    ok(mods.join() === '../recruiting/,./ncaa.html,./draft.html', 'rp hub: modules link recruiting, the sim and Draft RP');
    mods.forEach(h => ok(fs.existsSync(path.join(ROOT, 'rp', h.endsWith('/') ? h + 'index.html' : h)), 'rp hub: target exists for ' + h));
    w.close();
  }

  // ---------------------------------------------------------- X feed
  {
    const { w, d } = await boot('nba');
    const card = d.querySelector('[data-embed="x"]');
    ok(card && card.querySelector('.x-feed-head a').href === 'https://x.com/collinbutr', 'nba: X card has a working Follow link');
    ok(card.querySelector('a.twitter-timeline[href^="https://twitter.com/collinbutr"]'), 'nba: X timeline embed for @collinbutr');
    w.close();
  }

  // ---------------------------------------------------------- Basketball-Reference pros
  {
    const { w, d } = await boot('draft');
    d.querySelector('#p-euro-guard .pr-main').click();
    const row = d.getElementById('p-euro-guard');
    const t = table(row);
    ok(t.rows.map(r => r[0] + ' ' + r[1]).join(' | ') === '2025-26 Baskonia (EuroLeague) | 2025-26 Baskonia (Liga ACB) | 2026-27 Real Madrid (Liga ACB)', 'draft: pro rows from Basketball-Reference, one per competition, oldest first [' + t.rows.map(r => r[0] + ' ' + r[1]).join(' | ') + ']');
    ok(!t.rows.some(r => r[0] === '2027-28'), 'draft: seasons after the draft are left off');
    ok(t.cols.includes('G') && t.cols.includes('MP') && !t.cols.includes('BPM'), 'draft: columns with no data for him are dropped');
    ok(/International stats via\s*Basketball-Reference/.test(row.querySelector('.pr-stats-foot').textContent), 'draft: Basketball-Reference credited');
    ok(!row.textContent.includes('Full stats'), 'draft: no duplicate "Full stats" link to the same page');
    ok(!row.textContent.includes('will appear here'), 'draft: no "stats coming" note once a pro has stats');
    w.close();
  }

  // ---------------------------------------------------------- tiers + past boards
  const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));
  {
    const { w, d } = await boot('draft');
    await tick();
    const heads = [...d.querySelectorAll('.tier-head')].map(h => h.textContent);
    ok(heads[0].includes('Tier 2') && heads[0].includes('All-NBA') && heads[1].includes('All-Star'), 'draft: tier headings carry the tier name');
    d.getElementById('tierInfoBtn').click();
    const panel = d.getElementById('tierInfo');
    ok(!panel.hidden && panel.querySelectorAll('.tier-list li').length === 11, 'draft: Tiers button opens the guide with all 11 tiers');
    ok(panel.textContent.includes('Superstar') && panel.textContent.includes('Possible Entry / Return'), 'draft: guide names each tier, including "?"');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    ok(panel.hidden, 'draft: Escape closes the tier guide');

    const years = [...d.querySelectorAll('#yearChips [data-year]')].map(a => a.dataset.year);
    ok(years.join() === '2027,2026', 'draft: year switcher lists filled-in past boards (' + years.join() + ')');
    ok(!years.includes('2025'), 'draft: a tab that is still a copy of the current board is left off');

    d.querySelector('[data-year="2026"]').click();
    await tick(120);
    ok(w.location.search === '?year=2026', 'draft: switching years updates the address');
    ok(d.getElementById('boardEyebrow').textContent.includes('2026') && d.getElementById('boardEyebrow').textContent.includes('Final board'), 'draft: heading shows the past draft');
    ok(d.getElementById('colSize').textContent === 'Drafted', 'draft: the HT/WT column becomes Drafted on past boards');
    const summary = d.getElementById('boardSummary').textContent.replace(/\s+/g, ' ');
    ok(/2\s*Drafted/.test(summary) && /1\s*First round/.test(summary), 'draft: summary counts who was drafted that year and in the first round [' + summary + ']');
    const cell = id => d.querySelector(`#p-${id} .pr-drafted`);
    ok(cell('past-star').textContent.includes('#1') && cell('past-star').querySelector('img').getAttribute('src') === 'nbalogos/Washington%20Wizards.png', 'draft: pick number with the team logo ("Wizards" resolved)');
    ok(cell('past-guard').querySelector('img').getAttribute('src') === 'nbalogos/Boston%20Celtics.png', 'draft: team abbreviations resolve too ("BOS")');
    ok(cell('late-pick').querySelector('small').textContent === '2027', 'draft: a later draft year is shown');
    d.querySelector('#p-late-pick .pr-main').click();
    ok(d.querySelector('#p-late-pick .fact-pick small').textContent === '2027', 'draft: profile notes a later draft year');
    d.querySelector('#p-past-return .pr-main').click();
    ok(d.querySelector('#p-past-return .pr-facts').textContent.includes('Returned to school'), 'draft: Returned stays in words');
    ok(cell('past-return').textContent.includes('Returned') && cell('maybe-guy').textContent.includes('Undrafted'), 'draft: Returned and Undrafted shown');
    ok(d.querySelector('#p-past-star .pr-mobile-meta').textContent.includes('Drafted #1 WAS'), 'draft: phone rows say where he was drafted');
    ok([...d.querySelectorAll('.tier-head')].some(h => h.textContent.includes('Tier ?') && h.textContent.includes('Possible Entry / Return')), 'draft: "?" tier labelled Possible Entry / Return');

    d.querySelector('#p-past-star .pr-main').click();
    let row = d.getElementById('p-past-star');
    const pick = row.querySelector('.fact-pick');
    ok(pick && /^Pick 1\b/.test(pick.textContent.trim()), 'draft: profile Drafted reads "Pick 1"');
    ok(pick.querySelector('img').getAttribute('src') === 'nbalogos/Washington%20Wizards.png' && pick.querySelector('img').alt === 'Washington Wizards', 'draft: followed by the team logo (named for screen readers)');
    ok(/Tier1 · Superstar/.test(row.querySelector('.pr-facts').textContent.replace(/\s{2,}/g, '')), 'draft: profile tier shows its name');
    ok(table(row).rows.map(r => r[0]).join() === '2025-26' && !row.textContent.includes('added once'), 'draft: past board shows the season before that draft');
    ok(w.location.search + w.location.hash === '?year=2026#past-star', 'draft: profile link keeps the year');
    d.querySelector('#p-past-guard .pr-main').click();
    row = d.getElementById('p-past-guard');
    ok(/^Pick 31\b/.test(row.querySelector('.fact-pick').textContent.trim()) && row.querySelector('.fact-pick img').alt === 'Boston Celtics', 'draft: second-round pick with its team logo');
    ok(!row.textContent.includes('will appear here'), 'draft: no "stats coming" note on past boards');
    w.close();
  }
  {
    const { w, d } = await boot('draft', { query: '?year=2026', hash: '#late-pick' });
    await tick(120);
    ok(d.getElementById('p-late-pick').classList.contains('open'), 'draft: ?year=2026#prospect link opens straight to that profile');
    ok(d.querySelector('[data-year="2026"]').classList.contains('active'), 'draft: that year is highlighted');
    w.close();
  }

  // ---------------------------------------------------------- TikTok + Instagram
  {
    const { w, d } = await boot('index');
    const tt = d.querySelector('[data-embed="tiktok"]');
    ok(tt.querySelector('blockquote.tiktok-embed[cite="https://www.tiktok.com/@bytherim"][data-embed-type="creator"]'), 'home: TikTok profile embed for @bytherim');
    ok(tt.querySelector('.x-feed-head a').href === 'https://www.tiktok.com/@bytherim', 'home: TikTok card has a Follow link');
    const ig = d.querySelector('[data-embed="instagram"]');
    ok(ig.querySelector('a.ig-card').href === 'https://www.instagram.com/bytherimhoops/', 'home: Instagram card links to @bytherimhoops');
    ok(ig.querySelectorAll('a[href*="instagram.com"]').length === 1, 'home: Instagram card has a single link, not a duplicate Follow button');
    const foot = [...d.querySelectorAll('.site-footer a')].map(a => a.href);
    ok(foot.includes('https://www.instagram.com/bytherimhoops/') && foot.includes('https://www.tiktok.com/@bytherim'), 'footer: Instagram and TikTok listed');
    ok(d.querySelectorAll('#boardTeaser li a').length === 4, 'home: teaser still shows the current board');
    w.close();
  }
  {
    const { w, d } = await boot('about');
    const labels = [...d.querySelectorAll('main .social-row .social-btn')].map(a => a.textContent.trim());
    ok(labels.includes('Instagram') && labels.includes('TikTok'), 'about: Follow along includes Instagram and TikTok');
    w.close();
  }

  console.log('\nMain site pages verified.');
})().catch(e => { console.error(e.message); process.exit(1); });
