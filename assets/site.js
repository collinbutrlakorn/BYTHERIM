/* ============================================================
   BYTHERIM — shared site script.

   One source of truth for everything every page repeats: the header,
   the footer, the social links, the theme, and the feed helpers.
   Before this, each page carried its own copy of the header and
   footer, and they had drifted apart — different links, a missing
   About entry, Spotify pointing at Spotify's homepage.

   Usage on every page:
     <head>  <script src="assets/site.js"></script>
     <body>  <script>BTR.mount('home')</script>   ← first thing in body

   To change a nav item or a social link, edit CONFIG below — every
   page updates at once.
   ============================================================ */
(function () {
  'use strict';

  const CONFIG = {
    social: {
      youtube:  { label: 'YouTube',        url: 'https://youtube.com/@bytherim' },
      spotify:  { label: 'Spotify',        url: 'https://open.spotify.com/show/5o5uMpUFLXYs1qktXKPFJg' },
      apple:    { label: 'Apple Podcasts', url: 'https://podcasts.apple.com/us/podcast/bytherim-podcast/id6807326876' },
      x:        { label: 'X',              url: 'https://x.com/collinbutr' },
      substack: { label: 'Substack',       url: 'https://collindunks.substack.com' }
    },
    // Leave empty to hide the "Support" block on the About page. Paste your
    // Ko-fi (or similar) page here and it appears automatically.
    supportUrl: '',
    // Optional: links to specific X posts to pin on the NBA page, newest
    // first, e.g. 'https://x.com/collinbutr/status/1234567890'. When this
    // has posts, they're shown instead of the live timeline. Single posts
    // load far more reliably than X's timeline embed does.
    xPosts: [],
    feeds: {
      substack: 'https://collindunks.substack.com/feed',
      podcast: 'https://api.substack.com/feed/podcast/9314968.rss'
    },
    nav: [
      { id: 'podcast', label: 'Podcast', href: 'podcast.html' },
      { id: 'draft',   label: 'Draft',   href: 'draft.html' },
      { id: 'nba',     label: 'NBA',     href: 'nba.html' },
      { id: 'about',   label: 'About',   href: 'about.html' }
    ]
  };

  // ---------------------------------------------------------------- theme
  // Applied from <head> so the page never paints in the wrong theme. Same
  // mechanism as the RP sites; its own key so they can differ.
  const THEME_KEY = 'bytherim-site-theme';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* storage unavailable */ }

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  // ---------------------------------------------------------------- icons
  const ICONS = {
    youtube: '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z"/>',
    spotify: '<path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.3a.75.75 0 0 1-1 .3c-2.9-1.8-6.5-2.2-10.7-1.2a.75.75 0 1 1-.3-1.5c4.6-1 8.6-.6 11.8 1.4.4.2.5.7.2 1zm1.5-3.3a.94.94 0 0 1-1.3.3c-3.3-2-8.3-2.6-12.1-1.4a.94.94 0 1 1-.6-1.8c4.4-1.3 9.9-.7 13.7 1.6.4.3.6.9.3 1.3zm.1-3.4C15.2 8.4 8.8 8.1 5.1 9.3a1.1 1.1 0 1 1-.7-2.1c4.2-1.3 11.3-1 15.9 1.7a1.1 1.1 0 0 1-1.2 1.8z"/>',
    apple: '<path d="M12 1.5a8.9 8.9 0 0 0-3.1 17.3.7.7 0 0 0 .9-.8l-.2-1.4a.7.7 0 0 0-.4-.5 6.9 6.9 0 1 1 5.6 0 .7.7 0 0 0-.4.5l-.2 1.4a.7.7 0 0 0 .9.8A8.9 8.9 0 0 0 12 1.5zm0 3.6a5.3 5.3 0 0 0-2.4 10.1.3.3 0 0 0 .4-.3v-1a.7.7 0 0 0-.2-.5 3.7 3.7 0 1 1 4.4 0 .7.7 0 0 0-.2.5v1a.3.3 0 0 0 .4.3A5.3 5.3 0 0 0 12 5.1zm0 3.3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 5c-1 0-1.8.5-1.8 1.5l.6 6.2c.1.8.5 1.3 1.2 1.3s1.1-.5 1.2-1.3l.6-6.2c0-1-.8-1.5-1.8-1.5z"/>',
    x: '<path d="M18.2 2.3h3.3l-7.2 8.2 8.5 11.2h-6.7l-5.2-6.8-6 6.8H1.7l7.7-8.8L1.3 2.3h6.8l4.7 6.2zm-1.2 17.5h1.8L7.1 4.1H5.1z"/>',
    substack: '<path d="M22.5 8.2h-21V5.4h21v2.8zM1.5 10.8V24L12 18.1 22.5 24V10.8zM22.5 0h-21v2.8h21V0z"/>',
    theme: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18V4a8 8 0 0 1 0 16z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    arrow: '<path d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3z"/>'
  };
  function icon(name, size = 18) {
    return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  // ---------------------------------------------------------------- utils
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }
  function fmtDate(d, long) {
    const date = d instanceof Date ? d : new Date(String(d).replace(' ', 'T'));
    if (isNaN(date)) return '';
    return date.toLocaleDateString('en-US', long
      ? { month: 'long', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDuration(sec) {
    const s = parseInt(sec, 10);
    if (!s) return '';
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? `${h} hr ${m} min` : `${m} min`;
  }

  // ---------------------------------------------------------------- feeds
  // rss2json's free tier is rate-limited, and the home, podcast and NBA
  // pages all read the same two feeds — so results are cached for ten
  // minutes per browser session instead of refetched on every page.
  const FEED_TTL = 10 * 60 * 1000;
  async function fetchFeed(rssUrl) {
    const key = 'btr-feed:' + rssUrl;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.t < FEED_TTL) return hit.d;
    } catch (e) {}
    try {
      const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.message || 'feed error');
      const out = { feed: data.feed || {}, items: data.items || [] };
      try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: out })); } catch (e) {}
      return out;
    } catch (err) {
      console.warn('Feed unavailable:', rssUrl, err.message);
      return { feed: {}, items: [], failed: true };
    }
  }

  // Every Substack post, typed and with real artwork. Podcast episodes are
  // matched to the podcast feed by link (both feeds share it), which is
  // where their cover art and length live; written posts use their own
  // header image.
  async function loadPosts() {
    const [main, pod] = await Promise.all([fetchFeed(CONFIG.feeds.substack), fetchFeed(CONFIG.feeds.podcast)]);
    const episodes = new Map();
    pod.items.forEach(it => episodes.set(it.link, it));

    const posts = main.items.map(it => {
      const ep = episodes.get(it.link);
      const enc = it.enclosure || {};
      const isPodcast = !!ep || /audio/.test(enc.type || '');
      const img = /image/.test(enc.type || '') ? enc.link : null;
      const inline = ((it.content || it.description || '').match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1];
      const epEnc = ep && ep.enclosure ? ep.enclosure : {};
      return {
        type: isPodcast ? 'podcast' : 'article',
        title: it.title,
        url: it.link,
        date: new Date(String(it.pubDate).replace(' ', 'T')),
        summary: truncate(stripHtml(it.description), 180),
        image: (ep && ep.thumbnail) || img || inline || null,
        audio: epEnc.link || (isPodcast ? enc.link : null),
        duration: epEnc.duration || enc.duration || null
      };
    });

    // Episodes that the main feed didn't include (it caps at 10 items).
    pod.items.forEach(ep => {
      if (posts.some(p => p.url === ep.link)) return;
      posts.push({
        type: 'podcast', title: ep.title, url: ep.link,
        date: new Date(String(ep.pubDate).replace(' ', 'T')),
        summary: truncate(stripHtml(ep.description), 180),
        image: ep.thumbnail || pod.feed.image || null,
        audio: (ep.enclosure || {}).link || null,
        duration: (ep.enclosure || {}).duration || null
      });
    });

    posts.sort((a, b) => b.date - a.date);
    return { posts, failed: main.failed && pod.failed, podcastArt: pod.feed.image || null };
  }

  // Minimal CSV parser for Google Sheets exports: quoted fields, embedded
  // commas, doubled quotes and newlines inside quotes.
  function parseCSV(text) {
    const rows = []; let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(v => v !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(v => v !== '')) rows.push(row);
    if (!rows.length) return [];
    const head = rows.shift().map(h => h.trim());
    return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }

  // School logos. Filenames in /schoollogos are lowercase with no spaces
  // (ohiostate.png); some common names differ from the filename.
  const LOGO_ALIASES = {
    texaschristian: 'tcu', georgiatech: 'gtech', northcarolina: 'unc', ncstate: 'ncstate',
    northcarolinastate: 'ncstate', southerncalifornia: 'usc', mississippi: 'olemiss',
    southcarolina: 'scar', sandiegostate: 'sdsu', washingtonstate: 'wazzou', uconn: 'connecticut',
    pittsburgh: 'pitt', california: 'cal', brighamyoung: 'byu', centralflorida: 'ucf',
    nevadalasvegas: 'unlv', louisianastate: 'lsu', saintjohns: 'stjohns', southernmethodist: 'smu',
    miamifl: 'miami', miamiflorida: 'miami'
  };
  function schoolKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function schoolLogo(name, base = '') {
    const k = schoolKey(name);
    return `${base}schoollogos/${LOGO_ALIASES[k] || k}.png`;
  }
  function initialsBadge(label) {
    const words = String(label || '?').replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !/^(of|the|at|and)$/i.test(w));
    const ini = words.length === 1 ? words[0].slice(0, 3).toUpperCase() : words.slice(0, 3).map(w => w[0]).join('').toUpperCase() || '?';
    let h = 0; for (let i = 0; i < label.length; i++) h = label.charCodeAt(i) + ((h << 5) - h);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="hsl(${Math.abs(h) % 360},32%,30%)"/><text x="32" y="34" font-family="Arial,sans-serif" font-weight="700" font-size="${ini.length >= 3 ? 19 : 23}" fill="#fff" text-anchor="middle" dominant-baseline="middle">${ini}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  // One card format for every Substack post (home and NBA pages).
  // Podcast art is square, so it sits on a blurred copy of itself rather
  // than being cropped into a 16:9 frame.
  // Substack wraps post images in an image-proxy URL that can 404 in
  // browsers; the original S3 image inside it is reliable.
  function cleanImage(u) {
    if (!u) return u;
    const m = String(u).match(/substackcdn\.com\/image\/fetch\/[^/]*\/(https?%3A.*|https?:.*)$/);
    return m ? decodeURIComponent(m[1]) : u;
  }
  const IMG_FALLBACK = `onerror="this.onerror=null;this.closest('.post-media').className='post-media placeholder';this.src='logo.png'"`;

  function postCard(p) {
    p = Object.assign({}, p, { image: cleanImage(p.image) });
    const media = p.image
      ? (p.type === 'podcast'
          ? `<div class="post-media square"><img class="blur" src="${esc(p.image)}" alt="" aria-hidden="true"><img class="art" src="${esc(p.image)}" alt="" loading="lazy" ${IMG_FALLBACK}></div>`
          : `<div class="post-media"><img src="${esc(p.image)}" alt="" loading="lazy" ${IMG_FALLBACK}></div>`)
      : `<div class="post-media placeholder"><img src="logo.png" alt=""></div>`;
    const meta = [fmtDate(p.date), p.type === 'podcast' ? fmtDuration(p.duration) : ''].filter(Boolean);
    return `<a class="post-card" href="${esc(p.url)}" target="_blank" rel="noopener">
      ${media}
      <div class="post-body">
        <span class="tag tag-${p.type}">${p.type === 'podcast' ? 'Podcast' : 'Article'}</span>
        <h3>${esc(p.title)}</h3>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
        <div class="post-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('<span aria-hidden="true">·</span>')}</div>
      </div>
    </a>`;
  }

  // Replaces <span data-icon="name"></span> placeholders with SVGs.
  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon, +el.dataset.size || 16); });
  }

  // ---------------------------------------------------------------- chrome
  function socialButtons(keys, withLabels) {
    return keys.map(k => {
      const s = CONFIG.social[k];
      return `<a class="social-btn social-${k}" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}" title="${s.label}">${icon(k)}${withLabels ? `<span>${s.label}</span>` : ''}</a>`;
    }).join('');
  }

  // Pages one folder down (rp/) pass base '../' to mount(), so every
  // shared link and image still resolves.
  let BASE = '';

  function headerHTML(active) {
    const links = CONFIG.nav.map(n =>
      `<a href="${BASE}${n.href}"${n.id === active ? ' class="active" aria-current="page"' : ''}>${n.label}</a>`).join('');
    return `
<header class="site-header">
  <div class="site-header-inner">
    <a href="${BASE || './'}" class="brand" aria-label="BYTHERIM home"><img src="${BASE}logo.png" alt="BYTHERIM" width="138" height="40"></a>
    <nav class="site-nav" id="siteNav" aria-label="Main">
      ${links}
      <a href="${BASE}rp/" class="nav-rp${active === 'rp' ? ' active" aria-current="page' : ''}">BYTHERIM RP</a>
    </nav>
    <div class="header-tools">
      <button class="icon-btn" type="button" data-action="theme" aria-label="Switch between light and dark" title="Light / dark">${icon('theme')}</button>
      <button class="icon-btn nav-toggle" type="button" data-action="menu" aria-label="Open menu" aria-expanded="false" aria-controls="siteNav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>`;
  }

  function footerHTML() {
    return `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <img src="${BASE}logo.png" alt="BYTHERIM" width="138" height="40">
      <p>Draft analysis, film breakdowns and NBA conversation — plus a full college basketball simulation universe.</p>
      <div class="social-row">${socialButtons(['youtube', 'spotify', 'apple', 'x', 'substack'])}</div>
    </div>
    <div class="footer-col">
      <h4>BYTHERIM</h4>
      <a href="${BASE || './'}">Home</a>
      ${CONFIG.nav.map(n => `<a href="${BASE}${n.href}">${n.label}</a>`).join('')}
    </div>
    <div class="footer-col">
      <h4>RP Universe</h4>
      <a href="${BASE}rp/">RP Hub</a>
      <a href="${BASE}rp/ncaa.html">NCAA Simulation</a>
      <a href="${BASE}recruiting/">Recruiting</a>
      <a href="${BASE}rp/draft.html">Draft RP</a>
    </div>
    <div class="footer-col">
      <h4>Listen &amp; Follow</h4>
      ${['youtube', 'spotify', 'apple', 'x', 'substack'].map(k => `<a href="${CONFIG.social[k].url}" target="_blank" rel="noopener">${CONFIG.social[k].label}</a>`).join('')}
    </div>
  </div>
  <div class="footer-bottom">&copy; ${new Date().getFullYear()} BYTHERIM</div>
</footer>`;
  }

  function setMenu(open) {
    const nav = document.getElementById('siteNav');
    const btn = document.querySelector('[data-action="menu"]');
    if (!nav || !btn) return;
    nav.classList.toggle('open', open);
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  function wireChrome() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'theme') toggleTheme();
      if (btn.dataset.action === 'menu') setMenu(!document.getElementById('siteNav').classList.contains('open'));
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') setMenu(false);
    });
  }

  // ---------------------------------------------------------------- X feed
  // X's official timeline widget. X only serves it reliably to some
  // visitors (it can be rate-limited or blank for people who aren't
  // signed in to X), so the card always carries a working Follow link and
  // swaps in a short note if the timeline hasn't appeared after a while.
  // Usage: <div data-x-feed></div>  (optional data-height="600")
  function xFeed(el) {
    const handle = CONFIG.social.x.url.replace(/\/+$/, '').split('/').pop();
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const height = +el.dataset.height || 560;
    el.classList.add('x-feed');
    el.innerHTML = `
      <div class="x-feed-head">
        <span class="x-feed-icon">${icon('x', 16)}</span>
        <div><b>On X</b><span>@${esc(handle)}</span></div>
        <a class="btn btn-ghost btn-sm" href="${CONFIG.social.x.url}" target="_blank" rel="noopener">Follow</a>
      </div>
      <div class="x-feed-body" style="min-height:${Math.min(height, 240)}px">${
        CONFIG.xPosts.length
          ? CONFIG.xPosts.map(u => `<blockquote class="twitter-tweet" data-theme="${theme}" data-dnt="true" data-conversation="none"><a href="${esc(u.replace('://x.com/', '://twitter.com/'))}"></a></blockquote>`).join('')
          : `<a class="twitter-timeline" data-theme="${theme}" data-height="${height}" data-dnt="true"
               data-chrome="noheader nofooter noborders transparent"
               href="https://twitter.com/${esc(handle)}?ref_src=twsrc%5Etfw">Posts from @${esc(handle)}</a>`
      }</div>`;
    if (CONFIG.xPosts.length) el.querySelector('.x-feed-body').classList.add('x-feed-posts');
    const body = el.querySelector('.x-feed-body');

    const fallback = () => {
      const frames = [...body.querySelectorAll('iframe[id^="twitter-widget"]')];
      if (frames.some(f => f.offsetHeight > 80)) return;
      body.innerHTML = `<p class="x-feed-note">Posts can't be shown here right now. X limits embedded feeds for visitors who aren't signed in.
        <a href="${CONFIG.social.x.url}" target="_blank" rel="noopener">See the latest on X</a>.</p>`;
      body.style.minHeight = '';
    };

    // Load X's script only when the card is about to scroll into view.
    const load = () => {
      if (!document.getElementById('x-widgets')) {
        const sc = document.createElement('script');
        sc.id = 'x-widgets'; sc.async = true; sc.src = 'https://platform.twitter.com/widgets.js';
        sc.onerror = fallback;
        document.head.appendChild(sc);
      } else if (window.twttr && window.twttr.widgets) {
        window.twttr.widgets.load(el);
      }
      setTimeout(fallback, 9000);
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) { io.disconnect(); load(); }
      }, { rootMargin: '400px' });
      io.observe(el);
    } else load();
  }

  // Called as the first thing in <body>: draws the header in place so it
  // paints with the page, then adds the footer once the page is parsed.
  function mount(active, opts) {
    BASE = (opts && opts.base) || '';
    const here = document.currentScript;
    if (here) here.insertAdjacentHTML('beforebegin', headerHTML(active));
    else document.body.insertAdjacentHTML('afterbegin', headerHTML(active));
    const addFooter = () => {
      document.body.insertAdjacentHTML('beforeend', footerHTML());
      document.querySelectorAll('[data-support]').forEach(el => {
        if (CONFIG.supportUrl) el.querySelectorAll('a[data-support-link]').forEach(a => { a.href = CONFIG.supportUrl; });
        else el.remove();
      });
      hydrateIcons();
      document.querySelectorAll('[data-social]').forEach(el => {
        el.innerHTML = socialButtons(el.dataset.social.split(','), el.hasAttribute('data-labels'));
      });
      document.querySelectorAll('[data-x-feed]').forEach(xFeed);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFooter);
    else addFooter();
    wireChrome();
  }

  window.BTR = {
    CONFIG, mount, toggleTheme, icon, esc, stripHtml, truncate, fmtDate, fmtDuration,
    fetchFeed, loadPosts, parseCSV, schoolLogo, schoolKey, initialsBadge, socialButtons, postCard, hydrateIcons, xFeed
  };
})();
