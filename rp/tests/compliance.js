// Privacy, consent and accessibility: what a visitor's browser is asked to
// load and when, what the legal pages say, and the basics that keyboard and
// screen-reader users depend on.
//
//  - X, Instagram and TikTok embeds run those companies' scripts (cookies,
//    tracking), so they stay off until the visitor presses "Load".
//  - The first sign-in on a device says what signing in stores.
//  - The site sets no cookies of its own and carries no analytics script.
//  - Text colors clear WCAG AA contrast on every surface, in both themes.
//  - Images have alt text (empty for decorative ones); pages have a skip link.
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function ok(c, m) { if (!c) throw new Error('FAILED: ' + m); console.log('OK: ' + m); }

class LocalOnly extends ResourceLoader {
  fetch(url) {
    if (!url.startsWith('http://localhost/') || !/\.js$/.test(url)) return null;
    return Promise.resolve(fs.readFileSync(path.join(ROOT, decodeURIComponent(new URL(url).pathname))));
  }
}
function boot(page, store = {}) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(read(page + '.html'), {
    url: 'http://localhost/' + page + '.html', runScripts: 'dangerously', resources: new LocalOnly(), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = () => Promise.reject(new Error('offline'));
      w.HTMLMediaElement.prototype.load = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
      Object.entries(store).forEach(([k, v]) => w.localStorage.setItem(k, v));
    }
  });
  return new Promise(r => dom.window.addEventListener('load', () => setTimeout(() => r({ w: dom.window, d: dom.window.document }), 300)));
}

// ---------- contrast ----------
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function tokens(css, selector) {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  const out = {};
  (m ? m[1] : '').replace(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g, (_, k, v) => { out[k] = v; });
  return out;
}

(async () => {
  // ---- contrast: both themes, every surface text can sit on ----
  const site = read('assets/site.css'), chrome = read('assets/chrome.css');
  const dark = tokens(site, ':root'), light = { ...dark, ...tokens(site, ':root[data-theme="light"]') };
  [['dark', dark], ['light', light]].forEach(([name, t]) => {
    const worst = (fg) => Math.min(...['bg', 'surface', 'surface-2', 'hover'].map(s => ratio(t[fg], t[s])));
    ['text', 'muted', 'faint', 'accent'].forEach(fg => ok(worst(fg) >= 4.5, `${name} theme: --${fg} text is at least 4.5:1 on every surface (${worst(fg).toFixed(2)})`));
  });
  const chromeDark = tokens(chrome, '.site-header,\n.site-footer');
  ok(ratio(chromeDark.faint, '#0d0f14') >= 4.5 && ratio(chromeDark.faint, chromeDark.hover) >= 4.5, 'the shared header/footer on the RP pages: --faint clears 4.5:1 too');
  ok(!/\.footer-legal\s*\{[^}]*opacity/.test(site + chrome), 'the footer disclaimer isn\'t dimmed below the contrast minimum');

  // ---- images: every one has alt text (empty means decorative) ----
  const walk = (dir, out = []) => {
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(e => {
      if (e.name === 'node_modules' || e.name === 'tests' || e.name.startsWith('.')) return;
      const p = dir ? dir + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!/^(20\d\d|schoollogos|nbalogos|proteamlogos|conferencelogos|mtelogos|flags|tools|data|ncaa)$/.test(e.name)) walk(p, out); }
      else if (/\.(html|js)$/.test(e.name)) out.push(p);
    });
    return out;
  };
  const bare = [];
  walk('').forEach(f => (read(f).match(/<img (?=src=|class=|id=)[^>]*>/g) || []).forEach(t => { if (!/\balt=/.test(t)) bare.push(f + ': ' + t.slice(0, 70)); }));
  ok(bare.length === 0, `every <img> in the pages and scripts has alt text${bare.length ? ' (missing: ' + bare.slice(0, 3).join(' | ') + ')' : ''}`);

  // ---- no cookies of our own, no analytics scripts ----
  const code = walk('').filter(f => !/^rp\/tests/.test(f) && !/^tools\//.test(f)).map(read).join('\n');
  ok(!/document\.cookie/.test(code), 'the site never writes a cookie of its own');
  ok(!/googletagmanager|google-analytics|gtag\(|fbq\(|connect\.facebook\.net|hotjar|clarity\.ms|mixpanel|segment\.com|plausible\.io/.test(code), 'no advertising or analytics scripts are loaded');

  // ---- legal pages ----
  const pv = read('privacy.html'), tm = read('terms.html'), ac = read('accessibility.html');
  ok(/id="cookies"/.test(pv) && /doesn't set cookies of its own/.test(pv) && /local storage/.test(pv), 'the privacy policy has a cookies and local storage section');
  ok(/id="feedback"/.test(pv) && /Rate the sim/.test(pv), 'the privacy policy covers the rating form');
  ok(/load only after you press/.test(pv) && /BTR\.resetEmbedChoices/.test(pv), 'it explains click-to-load embeds and lets people undo the choice');
  ok(/Google Fonts[^<]*IP address/.test(pv), 'it says Google Fonts sees a visitor\'s IP address');
  ok(!/your name and email address, linked to an account ID/.test(pv), 'it no longer says the database stores a name and email');
  ok(/run by Collin Butrlakorn/.test(pv) && /run by Collin Butrlakorn/.test(tm), 'both pages say who runs the site');
  ok(/Free to use/.test(tm) && /nothing to refund/.test(tm), 'the terms say the site is free (so there is no refund policy to write)');
  ok(/Images and credits/.test(tm) && /flag-icons/.test(tm) && /computer-generated/.test(tm), 'the terms credit the flags and say RP portraits are not real people');
  ok(/Corrections and takedowns/.test(tm), 'the terms give players and rights holders a way to ask for a correction');
  ok(/WCAG/.test(ac) && /data-contact/.test(ac) && /Known limits/.test(ac), 'there is an accessibility statement with a way to report problems');
  ok(/accessibility\.html/.test(read('sitemap.xml')) && /accessibility\.html/.test(read('assets/site.js')), 'the accessibility page is in the sitemap and every footer');

  // ---- social embeds wait to be asked for ----
  let { w, d } = await boot('nba');
  ok(d.querySelector('a.skip-link[href="#main"]') && d.getElementById('main'), 'nba: a "Skip to main content" link points at the main landmark');
  ok(/accessibility\.html/.test(d.querySelector('.site-footer').innerHTML), 'nba: the footer links the accessibility statement');
  let card = d.querySelector('[data-embed="x"]');
  let gate = card.querySelector('.embed-gate');
  ok(gate && card.querySelector('.x-feed-body').hidden, 'nba: the X posts sit behind a notice instead of loading');
  ok(!d.getElementById('x-widgets'), 'nba: X\'s script is not requested until the visitor asks');
  ok(/can set cookies/.test(gate.textContent) && gate.querySelector('a[href="https://x.com/bytherimhoops"]'), 'nba: the notice says why, and offers the X profile instead');
  gate.querySelector('[data-load]').click();
  ok(d.getElementById('x-widgets') && !card.querySelector('.embed-gate') && !card.querySelector('.x-feed-body').hidden, 'nba: pressing Load brings in the posts');
  ok(w.localStorage.getItem('btr-embeds-x') === null, 'nba: loading once doesn\'t remember anything');
  w.close();

  ({ w, d } = await boot('nba'));
  d.querySelector('[data-embed="x"] [data-remember]').checked = true;
  d.querySelector('[data-embed="x"] [data-load]').click();
  ok(w.localStorage.getItem('btr-embeds-x') === '1', 'nba: "Remember my choice" is kept on the device');
  const kept = { 'btr-embeds-x': '1' };
  w.BTR.resetEmbedChoices();
  ok(w.localStorage.getItem('btr-embeds-x') === null, 'the privacy page\'s button forgets the choices');
  w.close();

  ({ w, d } = await boot('nba', kept));
  ok(!d.querySelector('[data-embed="x"] .embed-gate') && d.getElementById('x-widgets'), 'nba: someone who chose to remember it gets the posts without a prompt');
  w.close();

  ({ w, d } = await boot('index'));
  ok(d.querySelector('[data-embed="tiktok"] .embed-gate') && !d.getElementById('tiktok-embed'), 'home: TikTok waits to be asked for as well');
  ok(!d.getElementById('ig-embed') && !d.getElementById('x-widgets'), 'home: nothing from Instagram or X has been requested');
  ok(d.querySelector('.video-facade') && !d.querySelector('iframe[src*="youtube"]'), 'home: YouTube is still a play button until pressed');
  const fac = d.querySelector('.video-facade');
  ok(fac.getAttribute('aria-label').toLowerCase().includes(fac.querySelector('.facade-label').textContent.trim().toLowerCase()), 'home: the play button\'s accessible name contains its visible text');
  ok(d.querySelectorAll('main').length === 1 && d.getElementById('main').querySelector('.hero, .hero-rotator'), 'home: the hero is inside the main landmark');
  w.close();

  // ---- the first sign-in explains itself ----
  ({ w, d } = await boot('about'));
  let popups = 0;
  const fb = {
    apps: [], initializeApp() {},
    auth: Object.assign(() => ({ onAuthStateChanged(cb) { setTimeout(() => cb(null), 0); }, async signInWithPopup() { popups++; }, async signOut() {} }), { GoogleAuthProvider: function () {} }),
    firestore: Object.assign(() => ({ settings() {}, doc: () => ({ async get() { return { exists: false, data: () => null }; }, async set() {} }) }), { FieldValue: { increment: n => n, delete: () => 0 } })
  };
  w.firebase = fb; w.BTR_CLOUD_CONFIG = { apiKey: 'x', projectId: 'p' };
  w.eval(read('rp/js/cloud.js'));
  await w.Cloud.init();
  const btn = d.querySelector('.account-btn');
  ok(btn && /signInPrompt/.test(btn.getAttribute('onclick')), 'the header Sign in button goes through the notice');
  btn.focus(); btn.click();
  let dlg = d.querySelector('.cloud-modal [role="dialog"]');
  ok(dlg && /stores your account ID/.test(dlg.textContent) && dlg.querySelector('a[href="/privacy.html"]') && dlg.querySelector('a[href="/terms.html"]'), 'the first time, it says what is stored and links the Privacy Policy and Terms');
  ok(popups === 0 && d.activeElement.hasAttribute('data-go'), 'Google hasn\'t opened yet, and focus is on the Continue button');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  ok(!d.querySelector('.cloud-modal') && popups === 0 && d.activeElement === btn, 'Escape closes it without signing in and returns focus to the button');
  w.Cloud.signInPrompt();
  d.querySelector('.cloud-modal [data-close]').click();
  ok(!d.querySelector('.cloud-modal') && popups === 0, '"Not now" closes it too');
  w.Cloud.signInPrompt();
  d.querySelector('.cloud-modal [data-go]').click();
  await new Promise(r => setTimeout(r, 10));
  ok(popups === 1 && w.localStorage.getItem('btr-signin-ok') === '1' && !d.querySelector('.cloud-modal'), '"Continue with Google" opens Google and remembers that the notice was shown');
  w.Cloud.signInPrompt();
  await new Promise(r => setTimeout(r, 10));
  ok(popups === 2 && !d.querySelector('.cloud-modal'), 'after that, Sign in goes straight to Google');
  w.close();

  // ---- the rating dialog ----
  ({ w, d } = await boot('about'));
  w.eval(read('assets/rate.js'));
  const opener = d.createElement('button'); d.body.appendChild(opener); opener.focus();
  w.BTRRate.open();
  const panel = d.querySelector('.rate-panel');
  ok(panel.querySelector('a[href="/privacy.html#feedback"]') && /anonymous/.test(panel.textContent) && /personal details/.test(panel.textContent), 'the rating form says it is anonymous, to leave out personal details, and links the privacy policy');
  ok(panel.querySelector('textarea').getAttribute('aria-label'), 'its note box has a label');
  const stars = [...panel.querySelectorAll('.rate-stars button')];
  stars[0].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ok(stars[0].getAttribute('aria-checked') === 'true' && d.activeElement === stars[0], 'the right arrow picks one star and keeps focus on it');
  stars[0].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ok(stars[1].getAttribute('aria-checked') === 'true' && d.activeElement === stars[1], 'and moves along the row from there');
  stars[1].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  ok(stars[0].getAttribute('aria-checked') === 'true', 'the left arrow goes back');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  ok(!d.querySelector('.rate-scrim') && d.activeElement === opener, 'Escape closes the rating form and returns focus to where it was opened');
  w.close();

  console.log('\nPrivacy, consent and accessibility verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
