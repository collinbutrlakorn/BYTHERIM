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
      instagram:{ label: 'Instagram',      url: 'https://www.instagram.com/bytherimhoops/' },
      tiktok:   { label: 'TikTok',         url: 'https://www.tiktok.com/@bytherim' },
      substack: { label: 'Substack',       url: 'https://collindunks.substack.com' }
    },
    // Leave empty to hide the "Support" block on the About page. Paste your
    // Ko-fi (or similar) page here and it appears automatically.
    supportUrl: '',
    // Visitor counts (free, no cookies, no banner needed). Sign up at
    // goatcounter.com, choose a site code such as "bytherim", and put that
    // code here. Your dashboard is then https://<code>.goatcounter.com.
    // Leave empty to turn counting off.
    goatcounter: '',
    // Optional: links to specific X posts to pin on the NBA page, newest
    // first, e.g. 'https://x.com/collinbutr/status/1234567890'. When this
    // has posts, they're shown instead of the live timeline. Single posts
    // load far more reliably than X's timeline embed does.
    xPosts: [],
    // Optional: links to specific Instagram posts or reels to show on the
    // home page, e.g. 'https://www.instagram.com/p/ABC123/'. Instagram
    // doesn't allow embedding a whole profile, so without posts listed the
    // home page shows a profile card that links to Instagram instead.
    instagramPosts: [],
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
    instagram: '<path fill-rule="evenodd" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.25-3.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z"/>',
    tiktok: '<path d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
    info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 6h2v7h-2zm0-3.5h2v2h-2z"/>',
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
  const IMG_FALLBACK = `onerror="this.onerror=null;this.closest('.post-media').className='post-media placeholder';this.src='assets/logo-header.png'"`;

  function postCard(p) {
    p = Object.assign({}, p, { image: cleanImage(p.image) });
    const media = p.image
      ? (p.type === 'podcast'
          ? `<div class="post-media square"><img class="blur" src="${esc(p.image)}" alt="" aria-hidden="true" loading="lazy"><img class="art" src="${esc(p.image)}" alt="" loading="lazy" ${IMG_FALLBACK}></div>`
          : `<div class="post-media"><img src="${esc(p.image)}" alt="" loading="lazy" ${IMG_FALLBACK}></div>`)
      : `<div class="post-media placeholder"><img src="assets/logo-header.png" alt=""></div>`;
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
    <a href="${BASE || './'}" class="brand" aria-label="BYTHERIM home"><img src="${BASE}assets/logo-header.png" alt="BYTHERIM" width="138" height="42"></a>
    <nav class="site-nav" id="siteNav" aria-label="Main">
      ${links}
      <a href="${BASE}rp/" class="nav-rp${active === 'rp' ? ' active" aria-current="page' : ''}">BYTHERIM RP</a>
    </nav>
    <div class="header-tools">
      <div id="accountSlot" class="account-slot"></div>
      <button class="icon-btn" type="button" data-action="theme" aria-label="Switch between light and dark" title="Light / dark">${icon('theme')}</button>
      <button class="icon-btn nav-toggle" type="button" data-action="menu" aria-label="Open menu" aria-expanded="false" aria-controls="siteNav">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>`;
  }

  // Shown under every RP page: the RP universe's people are invented.
  const RP_FICTION = 'BYTHERIM RP players and recruits are fictional. Any resemblance to real people is coincidental.';

  function footerHTML() {
    return `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <img src="${BASE}assets/logo-header.png" alt="BYTHERIM" width="138" height="42">
      <p>Draft analysis, film breakdowns and NBA conversation — plus a full college basketball simulation universe.</p>
      <div class="social-row">${socialButtons(['youtube', 'spotify', 'apple', 'x', 'instagram', 'tiktok', 'substack'])}</div>
    </div>
    <div class="footer-col">
      <h4>BYTHERIM</h4>
      <a href="${BASE || './'}">Home</a>
      ${CONFIG.nav.map(n => `<a href="${BASE}${n.href}">${n.label}</a>`).join('')}
    </div>
    <div class="footer-col">
      <h4>RP Universe</h4>
      <a href="${BASE}rp/">RP Hub</a>
      <a href="${BASE}rp/guide.html">How the RP works</a>
      <a href="${BASE}rp/ncaa.html">NCAA Simulation</a>
      <a href="${BASE}recruiting/">Recruiting</a>
      <a href="${BASE}rp/draft.html">Draft RP</a>
    </div>
    <div class="footer-col">
      <h4>Listen &amp; Follow</h4>
      ${['youtube', 'spotify', 'apple', 'x', 'instagram', 'tiktok', 'substack'].map(k => `<a href="${CONFIG.social[k].url}" target="_blank" rel="noopener">${CONFIG.social[k].label}</a>`).join('')}
    </div>
  </div>
  <div class="footer-bottom">&copy; ${new Date().getFullYear()} BYTHERIM · Created by <a href="${BASE}about.html">Collin Butrlakorn</a>${/\/(rp|recruiting)\//.test(location.pathname) ? `<span class="footer-fiction">${RP_FICTION}</span>` : ''}</div>
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

  // ---------------------------------------------------------------- social embeds
  // One card per network, drawn from <div data-embed="x|tiktok|instagram">
  // (optional data-height). Every card carries a working Follow link, loads
  // the network's script only when it's about to scroll into view, and
  // swaps in a short note if the embed hasn't appeared after a while —
  // X and Instagram in particular don't always serve embeds to visitors
  // who aren't signed in.
  const handleOf = key => decodeURIComponent(CONFIG.social[key].url.replace(/\/+$/, '').split('/').pop()).replace(/^@/, '');

  function embedHead(key, title, follow = true) {
    const s = CONFIG.social[key];
    return `
      <div class="x-feed-head">
        <span class="x-feed-icon">${icon(key, 16)}</span>
        <div><b>${title}</b><span>@${esc(handleOf(key))}</span></div>
        ${follow ? `<a class="btn btn-ghost btn-sm" href="${s.url}" target="_blank" rel="noopener">Follow</a>` : ''}
      </div>`;
  }

  function whenVisible(el, fn) {
    if (!('IntersectionObserver' in window)) return fn();
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { rootMargin: '400px' });
    io.observe(el);
  }

  function loadScript(id, src, onerror) {
    if (document.getElementById(id)) return false;
    const sc = document.createElement('script');
    sc.id = id; sc.async = true; sc.src = src; sc.onerror = onerror;
    document.head.appendChild(sc);
    return true;
  }

  // Shown when a network doesn't render its embed in time.
  function embedFallback(body, key, what) {
    return () => {
      if ([...body.querySelectorAll('iframe')].some(f => f.offsetHeight > 80)) return;
      body.innerHTML = `<p class="x-feed-note">${what} can't be shown here right now.
        <a href="${CONFIG.social[key].url}" target="_blank" rel="noopener">See the latest on ${CONFIG.social[key].label}</a>.</p>`;
      body.style.minHeight = '';
    };
  }

  const EMBEDS = {
    // X's timeline widget, or pinned posts from CONFIG.xPosts.
    x(el, theme, height) {
      const handle = handleOf('x');
      const posts = CONFIG.xPosts || [];
      el.innerHTML = embedHead('x', 'On X') + `
        <div class="x-feed-body${posts.length ? ' x-feed-posts' : ''}" style="min-height:${Math.min(height, 240)}px">${
          posts.length
            ? posts.map(u => `<blockquote class="twitter-tweet" data-theme="${theme}" data-dnt="true" data-conversation="none"><a href="${esc(u.replace('://x.com/', '://twitter.com/'))}"></a></blockquote>`).join('')
            : `<a class="twitter-timeline" data-theme="${theme}" data-height="${height}" data-dnt="true"
                 data-chrome="noheader nofooter noborders transparent"
                 href="https://twitter.com/${esc(handle)}?ref_src=twsrc%5Etfw">Posts from @${esc(handle)}</a>`
        }</div>`;
      const body = el.querySelector('.x-feed-body');
      const fallback = embedFallback(body, 'x', 'Posts');
      whenVisible(el, () => {
        if (!loadScript('x-widgets', 'https://platform.twitter.com/widgets.js', fallback) && window.twttr && window.twttr.widgets) window.twttr.widgets.load(el);
        setTimeout(fallback, 9000);
      });
    },

    // TikTok's official creator (profile) embed: header plus recent videos.
    tiktok(el) {
      const handle = handleOf('tiktok');
      el.innerHTML = embedHead('tiktok', 'On TikTok') + `
        <div class="x-feed-body tt-body" style="min-height:240px">
          <blockquote class="tiktok-embed" cite="https://www.tiktok.com/@${esc(handle)}" data-unique-id="${esc(handle)}" data-embed-type="creator" style="max-width:780px;min-width:288px;margin:0">
            <section><a target="_blank" rel="noopener" href="https://www.tiktok.com/@${esc(handle)}">@${esc(handle)}</a></section>
          </blockquote>
        </div>`;
      const body = el.querySelector('.x-feed-body');
      const fallback = embedFallback(body, 'tiktok', 'Videos');
      whenVisible(el, () => {
        if (!loadScript('tiktok-embed', 'https://www.tiktok.com/embed.js', fallback) && window.tiktokEmbed && window.tiktokEmbed.lib) window.tiktokEmbed.lib.render(body.querySelectorAll('.tiktok-embed'));
        setTimeout(fallback, 10000);
      });
    },

    // Instagram has no profile embed, only single posts. With posts listed
    // in CONFIG.instagramPosts they're embedded; otherwise a profile card.
    instagram(el) {
      const handle = handleOf('instagram');
      const posts = CONFIG.instagramPosts || [];
      if (!posts.length) {
        el.innerHTML = embedHead('instagram', 'On Instagram', false) + `
          <a class="ig-card" href="${CONFIG.social.instagram.url}" target="_blank" rel="noopener">
            <span class="ig-mark">${icon('instagram', 30)}</span>
            <span><b>@${esc(handle)}</b><span>Follow BYTHERIM on Instagram.</span></span>
            <span class="ig-cta">Open Instagram ${icon('arrow', 14)}</span>
          </a>`;
        return;
      }
      el.innerHTML = embedHead('instagram', 'On Instagram') + `
        <div class="x-feed-body x-feed-posts ig-posts" style="min-height:240px">${posts.map(u =>
          `<blockquote class="instagram-media" data-instgrm-permalink="${esc(u)}" data-instgrm-version="14"><a href="${esc(u)}" target="_blank" rel="noopener">View this post on Instagram</a></blockquote>`).join('')}
        </div>`;
      const body = el.querySelector('.x-feed-body');
      const fallback = embedFallback(body, 'instagram', 'Posts');
      whenVisible(el, () => {
        if (!loadScript('ig-embed', 'https://www.instagram.com/embed.js', fallback) && window.instgrm) window.instgrm.Embeds.process();
        setTimeout(fallback, 10000);
      });
    }
  };

  function socialEmbed(el) {
    const key = el.dataset.embed || 'x';
    if (!EMBEDS[key] || !CONFIG.social[key]) return;
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    el.classList.add('x-feed', 'embed-' + key);
    EMBEDS[key](el, theme, +el.dataset.height || 560);
  }
  // Kept for pages that still use <div data-x-feed>.
  const xFeed = el => { el.dataset.embed = 'x'; socialEmbed(el); };

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
      document.querySelectorAll('[data-embed]').forEach(socialEmbed);
      document.querySelectorAll('[data-yt]').forEach(videoFacade);
      loadAccounts();   // after parsing, so a page's own account scripts have run
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFooter);
    else addFooter();
    wireChrome();
    countVisit();
  }

  // Google sign-in lives in the header on every page. The RP pages load
  // the account scripts themselves; everywhere else they're added here.
  function loadAccounts() {
    if (window.Cloud || document.querySelector('script[src$="rp/js/cloud.js"], script[src$="js/cloud.js"]')) return;
    const add = src => new Promise(res => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = res;
      document.head.appendChild(s);
    });
    const dir = (BASE === '/' ? '/' : BASE) + 'rp/js/';
    add(dir + 'cloud-config.js').then(() => add(dir + 'cloud.js'));
  }

  // Swaps a YouTube placeholder for the real player on the first press.
  function videoFacade(btn) {
    btn.addEventListener('click', () => {
      const src = btn.dataset.yt + (btn.dataset.yt.includes('?') ? '&' : '?') + 'autoplay=1';
      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = 'BYTHERIM on YouTube';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      btn.replaceWith(frame);
    }, { once: true });
  }

  // GoatCounter page views, only on the live site (never from a copy
  // opened on your own computer).
  function countVisit() {
    const code = String(CONFIG.goatcounter || '').trim();
    if (!code || location.protocol !== 'https:' || /^(localhost|127\.)/.test(location.hostname)) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${encodeURIComponent(code)}.goatcounter.com/count`;
    document.head.appendChild(s);
  }

  window.BTR = {
    CONFIG, mount, toggleTheme, icon, esc, stripHtml, truncate, fmtDate, fmtDuration,
    fetchFeed, loadPosts, parseCSV, schoolLogo, schoolKey, initialsBadge, socialButtons, postCard, hydrateIcons, xFeed, socialEmbed
  };
})();
