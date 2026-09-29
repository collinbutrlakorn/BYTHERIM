// Site content edited on the admin page: the home page hero slides and
// pinned X / Instagram posts, stored in the database, drawn on the home
// page, cached for the next visit; and the admin tab's publish step.
const fs = require('fs'), path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');
const ROOT = path.join(__dirname, '..', '..');
function ok(c, m) { if (!c) throw new Error('FAILED: ' + m); console.log('  ok  ' + m); }
const wait = ms => new Promise(r => setTimeout(r, ms));
class LocalOnly extends ResourceLoader {
  fetch(url) {
    if (!url.startsWith('http://localhost/') || !/\.js$/.test(url)) return null;
    return Promise.resolve(fs.readFileSync(path.join(ROOT, decodeURIComponent(new URL(url).pathname))));
  }
}
const IMG = 'data:image/jpeg;base64,/9j/AAAA';

function fakeCloud(store, opts = {}) {
  return {
    enabled: true, admin: !!opts.admin, user: opts.admin ? { uid: 'a', email: 'admin@example.com' } : null, reads: 0, writes: [],
    init: async () => true, onChange(fn) { fn(this.user); }, renderSlot() {},
    async getSite() { return store.site ? JSON.parse(JSON.stringify(store.site)) : null; },
    async getSiteImage(id) { this.reads++; return store.images[id] || null; },
    async saveSite(d) { if (!this.admin) throw new Error('no'); store.site = { ...JSON.parse(JSON.stringify(d)), updatedAt: Date.now(), by: 'admin@example.com' }; this.writes.push('site'); return JSON.parse(JSON.stringify(store.site)); },
    async putSiteImage(id, d) { store.images[id] = d; this.writes.push('img+' + id); },
    async deleteSiteImage(id) { delete store.images[id]; this.writes.push('img-' + id); }
  };
}

async function home(store, storage) {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    url: 'http://localhost/index.html', runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true,
    beforeParse(w) {
      w.Cloud = fakeCloud(store);
      w.fetch = () => Promise.reject(new Error('offline'));
      if (storage) Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
    }
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  await wait(400);
  return dom.window;
}

(async () => {
  const store = { site: null, images: {} };

  // Nothing published: the original hero, no pinned X card.
  let w = await home(store);
  let heroes = [...w.document.querySelectorAll('[data-hero-slides] .hero')];
  ok(heroes.length === 1 && heroes[0].classList.contains('is-active') && /Unbiased hoops/i.test(heroes[0].textContent), 'with nothing published the home page keeps its original hero');
  ok(w.document.querySelector('[data-embed=x]').hidden, 'no pinned X card without X posts');

  // Published: two slides (one hidden), X and Instagram posts.
  store.site = {
    updatedAt: 1, showDefault: true,
    slides: [
      { id: 's1', img: 'i1', title: 'Big Board 2.0', eyebrow: 'New', caption: 'Top 100, re-ranked.', link: 'draft.html', linkLabel: 'See the board', focus: 'right' },
      { id: 's2', img: 'i2', title: 'Hidden one', hidden: true },
      { id: 's3', img: 'i3', title: '<script>alert(1)</script>', caption: 'On YouTube', link: 'https://youtube.com/@bytherim', linkLabel: 'Watch' },
      { id: 's4', img: 'i4', title: 'Bad link', link: 'javascript:alert(1)' }
    ],
    xPosts: ['https://x.com/collinbutr/status/123'],
    instagramPosts: ['https://www.instagram.com/p/ABC/']
  };
  store.images = { i1: IMG + '1', i2: IMG + '2', i3: IMG + '3', i4: IMG + '4' };
  w = await home(store);
  const d = w.document;
  heroes = [...d.querySelectorAll('[data-hero-slides] .hero:not([hidden])')];
  ok(heroes.length === 4, `published slides show ahead of the original, hidden ones left out (${heroes.length})`);
  ok(heroes[0].classList.contains('is-active') && /Big Board 2\.0/.test(heroes[0].textContent), 'the newest slide shows first');
  ok(heroes[0].style.backgroundImage.includes(IMG + '1') && /right/.test(heroes[0].style.backgroundPosition), 'with its banner and focus');
  const a0 = heroes[0].querySelector('a.btn');
  ok(a0 && a0.getAttribute('href') === 'draft.html' && a0.textContent === 'See the board' && !a0.target, 'its button goes to the chosen page');
  const a1 = heroes[1].querySelector('a.btn');
  ok(a1 && a1.target === '_blank' && a1.rel === 'noopener', 'links to other sites open in a new tab');
  ok(!heroes[1].querySelector('script') && heroes[1].textContent.includes('<script>'), 'slide text is shown as text, never run');
  ok(!heroes[2].querySelector('a.btn'), 'a javascript: link is dropped');
  ok(d.querySelectorAll('.hero-dots button').length === 4, 'one dot per slide');
  d.querySelectorAll('.hero-dots button')[1].click();
  await wait(200);
  ok(heroes[1].classList.contains('is-active') && !heroes[0].classList.contains('is-active'), 'a dot switches slides');
  ok(heroes[1].style.backgroundImage.includes(IMG + '3'), 'later banners load when they come up');
  ok(!d.querySelector('[data-embed=x]').hidden && w.BTR.CONFIG.xPosts[0] === 'https://x.com/collinbutr/status/123', 'pinned X posts show on the home page');
  ok(d.querySelector('[data-embed=instagram] .instagram-media'), 'pinned Instagram posts embed');

  // Second visit: drawn from this browser's copy, no image downloads.
  const saved = {};
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); saved[k] = w.localStorage.getItem(k); }
  w = await home(store, saved);
  ok(w.Cloud.reads === 0, 'a repeat visit reuses the banners it already has');
  ok(/Big Board 2\.0/.test(w.document.querySelector('.hero.is-active').textContent), 'and shows the slides straight away');

  // Original hero switched off.
  store.site = { ...store.site, updatedAt: 2, showDefault: false };
  w = await home(store, saved);
  ok(w.document.querySelector('.hero[data-default]').hidden, 'the original hero can be switched off');

  // ---------------------------------------------------------------- the site admin page
  // Its own page, apart from the RP admin.
  const siteAdm = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  const rpAdm = fs.readFileSync(path.join(ROOT, 'rp/admin.html'), 'utf8');
  ok(/assets\/site-admin\.js/.test(siteAdm) && /noindex/.test(siteAdm), 'the site admin is its own page (not indexed)');
  ok(!/site-admin|data-tab="home"/.test(rpAdm), 'the RP admin page has only RP things');
  ok(/\/admin\.html/.test(fs.readFileSync(path.join(ROOT, 'rp/js/cloud.js'), 'utf8')) && /Disallow: \/admin\.html/.test(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8')), 'the account menu links both admin pages; search engines skip them');

  const adm = new JSDOM('<p id="admSummary"></p><div id="admBody"></div>', { url: 'http://localhost/admin.html', runScripts: 'outside-only' });
  const aw = adm.window;
  const astore = { site: JSON.parse(JSON.stringify(store.site)), images: { ...store.images } };
  aw.Cloud = fakeCloud(astore, { admin: true });
  aw.confirm = () => true;
  const vm = require('vm');
  aw.__ADMIN_NO_AUTOSTART = true;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/site-admin.js'), 'utf8'), adm.getInternalVMContext());
  const S = aw.SiteAdmin;
  await S.start({ skipGate: true });
  await wait(100);
  ok(/Big Board 2\.0/.test(aw.document.body.textContent) && /Up to date/.test(aw.document.body.textContent), 'the site admin lists the published slides');
  // Add a slide (the image as if picked and shrunk), remove one, pin a post.
  S.edit('new');
  S.form.img = 'new1'; S.images.new1 = IMG + 'new';
  S.form.title = 'Episode 40'; S.form.caption = 'Out now.';
  S.keep();
  ok(S.draft.slides[0].title === 'Episode 40' && S.draft.slides[0].linkLabel === 'Listen now', 'a new slide goes to the top, with the page\'s button text');
  S.edit('new'); S.form.title = 'No image'; S.keep();
  ok(S.editing === 'new' && S.draft.slides.length === 5, 'a slide needs a banner before it\'s added');
  S.cancel();
  S.remove(S.draft.slides.findIndex(s => s.id === 's4'));
  S.setPosts('xPosts', 'https://x.com/collinbutr/status/999?s=20\nhttps://x.com/collinbutr/status/123');
  ok(S.draft.xPosts[0] === 'https://x.com/collinbutr/status/999', 'post links are cleaned of tracking bits');
  ok(/Unpublished changes/.test((S.render(aw.document.getElementById('admBody')), aw.document.body.textContent)), 'changes wait for Publish');
  await S.publish();
  ok(astore.site.slides[0].title === 'Episode 40' && astore.images.new1 === IMG + 'new', 'Publish uploads the new banner and the slides');
  ok(!astore.images.i4 && astore.site.xPosts.length === 2, 'the deleted slide\'s banner is removed, the posts saved');
  const w1 = aw.Cloud.writes;
  ok(w1.indexOf('img+new1') < w1.indexOf('site') && w1.indexOf('site') < w1.indexOf('img-i4'), 'in an order that never leaves the page pointing at a missing image');
  S.setPosts('instagramPosts', 'https://example.com/not-a-post');
  await S.publish();
  ok(/Fix this link/.test(S.status) && !astore.site.instagramPosts.includes('https://example.com/not-a-post'), 'a link that isn\'t a post isn\'t published');
  aw.Cloud.admin = false;
  S.setPosts('instagramPosts', '');
  S.draft.showDefault = true;
  const stamp = astore.site.updatedAt;
  await S.publish();
  ok(/admin/.test(S.status) && astore.site.updatedAt === stamp, 'only an admin can publish');

  console.log('\nSite content verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
