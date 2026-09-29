// The site admin page (admin.html): the home page's hero slides and the X
// and Instagram posts pinned on the site, edited here and stored in the
// database (official/site_home) instead of in the repo. Nothing changes on the live
// site until Publish. The RP has its own admin page (rp/admin.html).
(function (root) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Where a slide's button can go. Paths are relative to the home page.
  const PAGES = [
    ['podcast.html', 'Podcast'],
    ['draft.html', 'Big Board (Draft)'],
    ['nba.html', 'NBA'],
    ['about.html', 'About'],
    ['rp/', 'BYTHERIM RP hub'],
    ['rp/ncaa.html', 'NCAA RP'],
    ['rp/draft.html', 'Draft RP'],
    ['recruiting/', 'Recruiting'],
    ['https://youtube.com/@bytherim', 'YouTube channel'],
    ['https://collindunks.substack.com', 'Substack']
  ];
  const DEFAULT_LABEL = { 'podcast.html': 'Listen now', 'draft.html': 'See the board', 'rp/': 'Enter the RP', 'rp/ncaa.html': 'Open the NCAA RP', 'rp/draft.html': 'Open the Draft RP', 'recruiting/': 'See the rankings' };
  const X_RE = /^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/;
  const IG_RE = /^https:\/\/www\.instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/$/;
  // Pasted links come in many shapes (the share button, the app, a phone
  // browser). They're all turned into the one form each embed expects.
  function cleanPost(raw) {
    let u = String(raw || '').trim().replace(/^<|>$/g, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    let url;
    try { url = new URL(u); } catch (e) { return raw.trim(); }
    const host = url.hostname.toLowerCase().replace(/^(www|mobile|m)\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    if (['x.com', 'twitter.com', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com'].includes(host)) {
      const i = parts.findIndex(p => p === 'status' || p === 'statuses');
      if (i >= 0 && /^\d+$/.test(parts[i + 1] || '')) return `https://x.com/${i > 0 && parts[i - 1] !== 'web' ? parts[i - 1] : 'i'}/status/${parts[i + 1]}`;
    }
    if (host === 'instagram.com' || host === 'instagr.am') {
      const i = parts.findIndex(p => ['p', 'reel', 'reels', 'tv'].includes(p));
      if (i >= 0 && parts[i + 1]) return `https://www.instagram.com/${parts[i] === 'reels' ? 'reel' : parts[i]}/${parts[i + 1]}/`;
    }
    return raw.trim();
  }
  // Firebase's errors, in words that say what to do.
  function explain(e) {
    const m = String((e && (e.code || e.message)) || e || '');
    if (/permission|insufficient/i.test(m)) return 'the database refused it (your account may not be on the admin list, or the database rules are out of date).';
    if (/unavailable|network|offline|failed to fetch/i.test(m)) return 'couldn\'t reach the database. Check your connection and try again.';
    if (/quota|resource-exhausted/i.test(m)) return 'the database is over its daily limit. Try again tomorrow.';
    return (e && e.message) || m;
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // The site's root folder, for previews and the original hero's image.
  const siteRoot = () => new URL('./', location.href).href;

  const SiteAdmin = {
    site: null,          // what's published
    draft: null,         // what's being edited
    images: {},          // id -> data URL, for slides added or loaded here
    editing: null,       // slide id in the form, or 'new'
    form: null,
    status: '',
    loading: false,

    async ensureLoaded() {
      if (this.draft || this.loading) return;
      this.loading = true;
      try {
        this.site = (root.Cloud && root.Cloud.getSite) ? await root.Cloud.getSite('home') : null;
      } catch (e) {
        this.status = `Couldn't read the site content: ${explain(e)}`;
      }
      this.loading = false;
      this.draft = JSON.parse(JSON.stringify(this.site || { slides: [], showDefault: true, xPosts: [], instagramPosts: [] }));
      this.draft.slides = this.draft.slides || [];
      if (this.draft.showDefault === undefined) this.draft.showDefault = true;
      this.draft.slides.forEach(s => this.fetchImage(s.img));
      this.rerender();
    },
    async fetchImage(id) {
      if (!id || this.images[id] || !root.Cloud) return;
      try { const d = await root.Cloud.getSiteImage(id); if (d) { this.images[id] = d; this.rerender(); } } catch (e) { /* shown without a thumbnail */ }
    },
    dirty() { return JSON.stringify(this.draft) !== JSON.stringify(this.site || { slides: [], showDefault: true, xPosts: [], instagramPosts: [] }); },

    el: null,
    render(el) {
      this.el = el;
      if (!this.draft) { el.innerHTML = '<p class="adm-empty">Loading the home page content…</p>'; this.ensureLoaded(); return; }
      el.innerHTML = this.html();
      this.afterRender();
    },
    rerender() { if (this.el) this.render(this.el); },

    html() {
      const d = this.draft;
      const pub = this.site && this.site.updatedAt ? `Last published ${new Date(this.site.updatedAt).toLocaleString()}${this.site.by ? ` by ${esc(this.site.by)}` : ''}.` : 'Nothing published yet: the home page shows its original hero.';
      return `
      <div class="site-bar card">
        <div><b>${this.dirty() ? 'Unpublished changes' : 'Up to date'}</b><span class="adm-note">${pub}</span>${this.status ? `<span class="site-status">${esc(this.status)}</span>` : ''}</div>
        <div class="site-bar-actions">
          <button class="outline-btn btn-sm" onclick="SiteAdmin.discard()" ${this.dirty() ? '' : 'disabled'}>Discard changes</button>
          <button class="sim-btn btn-sm" onclick="SiteAdmin.publish()" ${this.dirty() ? '' : 'disabled'}>Publish to the site</button>
        </div>
      </div>

      <div class="card">
        <div class="section-head"><h3 class="section-title">Home page hero</h3>
          <button class="sim-btn btn-sm" onclick="SiteAdmin.edit('new')">Add a slide</button></div>
        <p class="adm-note">Slides fade from one to the next every 7 seconds, top of the list first. New slides go to the top. Up to 8 show.</p>
        ${this.editing ? this.formHTML() : ''}
        <ul class="site-slides">
          ${d.slides.map((s, i) => `<li class="${s.hidden ? 'off' : ''}">
            <span class="site-thumb" style="${this.images[s.img] ? `background-image:url('${this.images[s.img]}');` : ''}"></span>
            <span class="site-slide-text"><b>${esc(s.title || '(no headline)')}</b><small>${esc(s.eyebrow || '')}${s.eyebrow && s.link ? ' · ' : ''}${s.link ? `→ ${esc(this.linkName(s.link))}` : ''}${s.hidden ? ' · hidden' : ''}</small></span>
            <span class="site-slide-actions">
              <button class="outline-btn btn-sm" onclick="SiteAdmin.move(${i},-1)" ${i ? '' : 'disabled'} aria-label="Move up">↑</button>
              <button class="outline-btn btn-sm" onclick="SiteAdmin.move(${i},1)" ${i < d.slides.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>
              <button class="outline-btn btn-sm" onclick="SiteAdmin.toggle(${i})">${s.hidden ? 'Show' : 'Hide'}</button>
              <button class="outline-btn btn-sm" onclick="SiteAdmin.edit('${esc(s.id)}')">Edit</button>
              <button class="outline-btn btn-sm danger" onclick="SiteAdmin.remove(${i})">Delete</button>
            </span></li>`).join('')}
          <li class="site-default ${d.showDefault ? '' : 'off'}">
            <span class="site-thumb" style="background-image:url('${siteRoot()}assets/hero-home-banner.jpg')"></span>
            <span class="site-slide-text"><b>Unbiased hoops analysis</b><small>The original hero${d.showDefault ? ', shown after the slides' : ', hidden while there are slides'}</small></span>
            <span class="site-slide-actions"><button class="outline-btn btn-sm" onclick="SiteAdmin.toggleDefault()">${d.showDefault ? 'Hide' : 'Show'}</button></span>
          </li>
        </ul>
      </div>

      <div class="card">
        <div class="section-head"><h3 class="section-title">Pinned posts</h3></div>
        <p class="adm-note">When a feed won't embed, paste the links to specific posts here, newest first, one per line. X posts show on the home page and the NBA page; Instagram posts and reels on the home page.</p>
        <div class="site-posts">
          ${this.postsField('xPosts', 'X posts', 'https://x.com/collinbutr/status/…', X_RE)}
          ${this.postsField('instagramPosts', 'Instagram posts or reels', 'https://www.instagram.com/p/…', IG_RE)}
        </div>
        <button class="outline-btn btn-sm" onclick="SiteAdmin.previewPosts()">Preview posts</button>
        <div id="sitePostsPreview"></div>
      </div>`;
    },

    postsField(key, label, ph, re) {
      const list = this.draft[key] || [];
      const bad = list.filter(u => !re.test(u));
      return `<label class="site-field"><span>${label}</span>
        <textarea rows="4" placeholder="${esc(ph)}" oninput="SiteAdmin.setPosts('${key}', this.value)">${esc(list.join('\n'))}</textarea>
        <small data-posts-hint="${key}" class="${bad.length ? 'adm-hi' : ''}">${this.postsHint(key)}</small></label>`;
    },
    postsHint(key) {
      const list = this.draft[key] || [];
      const bad = list.filter(u => !(key === 'xPosts' ? X_RE : IG_RE).test(u));
      return bad.length ? `Doesn't look like a post link: ${esc(bad[0])}` : `${list.length} post${list.length === 1 ? '' : 's'}`;
    },
    setPosts(key, text) {
      this.draft[key] = text.split(/[\s,]+/).map(cleanPost).filter(Boolean);
      // Updated in place: redrawing here would swallow a click on Publish
      // made straight after typing.
      const hint = document.querySelector(`[data-posts-hint="${key}"]`);
      if (hint) { hint.innerHTML = this.postsHint(key); hint.classList.toggle('adm-hi', /Doesn't/.test(hint.textContent)); }
      const bar = document.querySelector('.site-bar b');
      if (bar) bar.textContent = this.dirty() ? 'Unpublished changes' : 'Up to date';
      document.querySelectorAll('.site-bar-actions button').forEach(b => { b.disabled = !this.dirty(); });
    },

    linkName(link) {
      const p = PAGES.find(x => x[0] === link);
      return p ? p[1] : link;
    },

    // ---------- the slide form ----------
    edit(id) {
      const s = id === 'new' ? null : this.draft.slides.find(x => x.id === id);
      this.editing = id;
      this.form = s ? { ...s } : { id: newId(), eyebrow: 'New', title: '', caption: '', link: 'podcast.html', linkLabel: '', focus: 'center', img: null };
      this.form.custom = this.form.link && !PAGES.some(p => p[0] === this.form.link);
      this.rerender();
      const f = document.querySelector('.site-form');
      if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    formHTML() {
      const f = this.form;
      const img = f.img && this.images[f.img];
      return `<div class="site-form">
        <div class="site-form-grid">
          <div class="site-form-fields">
            <label class="site-field"><span>Banner image</span>
              <input type="file" accept="image/*" onchange="SiteAdmin.pickImage(this.files[0])">
              <small>${img ? 'Uploaded. Pick another to replace it.' : 'JPG or PNG, wide (about 1920×800 works best). It\'s shrunk to fit before it\'s saved.'}</small></label>
            <label class="site-field"><span>Focus</span>
              <select onchange="SiteAdmin.set('focus', this.value)">${[['center', 'Center'], ['right', 'Right (text covers the left)'], ['left', 'Left']].map(o => `<option value="${o[0]}"${f.focus === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></label>
            <label class="site-field"><span>Small label</span><input type="text" maxlength="40" value="${esc(f.eyebrow)}" placeholder="New episode" oninput="SiteAdmin.set('eyebrow', this.value)"></label>
            <label class="site-field"><span>Headline</span><input type="text" maxlength="70" value="${esc(f.title)}" placeholder="The 2027 Big Board is live" oninput="SiteAdmin.set('title', this.value)"></label>
            <label class="site-field"><span>Caption</span><textarea rows="3" maxlength="240" placeholder="One or two sentences." oninput="SiteAdmin.set('caption', this.value)">${esc(f.caption)}</textarea></label>
            <label class="site-field"><span>Button goes to</span>
              <select onchange="SiteAdmin.setLink(this.value)">
                ${PAGES.map(p => `<option value="${esc(p[0])}"${!f.custom && f.link === p[0] ? ' selected' : ''}>${esc(p[1])}</option>`).join('')}
                <option value="__custom"${f.custom ? ' selected' : ''}>Another link…</option>
                <option value=""${!f.custom && !f.link ? ' selected' : ''}>No button</option>
              </select></label>
            ${f.custom ? `<label class="site-field"><span>Link</span><input type="url" value="${esc(f.link)}" placeholder="https://…" oninput="SiteAdmin.set('link', this.value)"></label>` : ''}
            ${f.link ? `<label class="site-field"><span>Button text</span><input type="text" maxlength="30" value="${esc(f.linkLabel)}" placeholder="${esc(DEFAULT_LABEL[f.link] || 'Take a look')}" oninput="SiteAdmin.set('linkLabel', this.value)"></label>` : ''}
          </div>
          <div class="site-preview">
            <span class="adm-card-label">Preview · desktop</span>
            <iframe class="site-frame-desk" title="Desktop preview"></iframe>
            <span class="adm-card-label">Phone</span>
            <iframe class="site-frame-phone" title="Phone preview"></iframe>
          </div>
        </div>
        <div class="site-form-actions">
          <button class="outline-btn btn-sm" onclick="SiteAdmin.cancel()">Cancel</button>
          <button class="sim-btn btn-sm" onclick="SiteAdmin.keep()">${this.editing === 'new' ? 'Add to the slides' : 'Keep changes'}</button>
          <span class="site-form-msg"></span>
        </div>
      </div>`;
    },
    set(k, v) { this.form[k] = v; this.preview(); },
    setLink(v) {
      if (v === '__custom') { this.form.custom = true; this.form.link = ''; }
      else { this.form.custom = false; this.form.link = v; }
      this.rerenderForm();
    },
    rerenderForm() { this.rerender(); },

    // Shrinks the picked image to a JPEG small enough for one database
    // document, keeping as much quality as fits.
    async pickImage(file) {
      if (!file) return;
      const msg = document.querySelector('.site-form-msg');
      if (msg) msg.textContent = 'Preparing the image…';
      try {
        const url = await this.shrink(file);
        const id = newId();
        this.images[id] = url;
        this.form.img = id;
        this.form.newImg = true;
        this.rerenderForm();
      } catch (e) {
        if (msg) msg.textContent = e.message || String(e);
      }
    },
    async shrink(file, limit = 700000) {
      const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Couldn\'t read that file.')); r.readAsDataURL(file); });
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file isn\'t an image this browser can read.')); i.src = src; });
      let w = Math.min(1920, img.naturalWidth || img.width);
      for (let pass = 0; pass < 6; pass++) {
        const h = Math.round(w * (img.naturalHeight || img.height) / (img.naturalWidth || img.width));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#06070a'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of [0.85, 0.78, 0.7, 0.62]) {
          const out = c.toDataURL('image/jpeg', q);
          if (out.length <= limit) return out;
        }
        w = Math.round(w * 0.8);
      }
      throw new Error('That image is too large to use, even after shrinking it.');
    },

    slideForPreview() {
      const f = this.form;
      return { ...f, linkLabel: f.linkLabel || DEFAULT_LABEL[f.link] || 'Take a look' };
    },
    frameDoc(body) {
      const base = siteRoot();
      return `<!DOCTYPE html><html><head><base href="${base}"><meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css2?family=Asap+Condensed:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="assets/site.css"><style>body{margin:0;overflow:hidden}</style></head><body>${body}</body></html>`;
    },
    preview() {
      const f = this.form;
      if (!f || !root.BTR || !root.BTR.slideHTML) return;
      const slide = root.BTR.slideHTML(this.slideForPreview(), f.img ? this.images[f.img] : null)
        .replace('class="hero hero-slide"', 'class="hero hero-slide is-active"');
      const doc = this.frameDoc(`<div class="hero-rotator">${slide}</div>`);
      document.querySelectorAll('.site-frame-desk, .site-frame-phone').forEach(fr => { fr.srcdoc = doc; });
    },
    afterRender() { if (this.editing) this.preview(); },

    keep() {
      const f = this.form;
      const msg = document.querySelector('.site-form-msg');
      if (!f.img) { if (msg) msg.textContent = 'Add a banner image first.'; return; }
      if (!f.title && !f.caption) { if (msg) msg.textContent = 'Give it a headline or a caption.'; return; }
      if (f.custom && f.link && !/^https?:\/\//i.test(f.link)) { if (msg) msg.textContent = 'Links to other sites start with https://'; return; }
      const slide = { id: f.id, img: f.img, focus: f.focus || 'center', eyebrow: f.eyebrow.trim(), title: f.title.trim(), caption: f.caption.trim(), link: (f.link || '').trim(), linkLabel: (f.linkLabel || '').trim() || DEFAULT_LABEL[f.link] || 'Take a look', added: f.added || Date.now() };
      if (f.hidden) slide.hidden = true;
      const i = this.draft.slides.findIndex(s => s.id === f.id);
      if (i >= 0) this.draft.slides[i] = slide; else this.draft.slides.unshift(slide);
      this.editing = null; this.form = null;
      this.rerender();
    },
    cancel() { this.editing = null; this.form = null; this.rerender(); },
    move(i, d) { const a = this.draft.slides; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; this.rerender(); },
    toggle(i) { const s = this.draft.slides[i]; if (s.hidden) delete s.hidden; else s.hidden = true; this.rerender(); },
    toggleDefault() { this.draft.showDefault = !this.draft.showDefault; this.rerender(); },
    remove(i) {
      const s = this.draft.slides[i];
      if (typeof confirm === 'function' && !confirm(`Delete "${s.title || 'this slide'}"? It comes off the home page when you publish.`)) return;
      this.draft.slides.splice(i, 1);
      this.rerender();
    },
    discard() {
      this.draft = JSON.parse(JSON.stringify(this.site || { slides: [], showDefault: true, xPosts: [], instagramPosts: [] }));
      this.editing = null; this.form = null; this.status = '';
      this.rerender();
    },

    // New images go up first, then the page content, then images no
    // slide uses any more are removed, so the live page never points at
    // an image that isn't there.
    async publish() {
      const C = root.Cloud;
      if (!C || !C.admin) { this.status = 'Sign in with an admin account to publish.'; this.rerender(); return; }
      const bad = [...(this.draft.xPosts || []).filter(u => !X_RE.test(u)), ...(this.draft.instagramPosts || []).filter(u => !IG_RE.test(u))];
      if (bad.length) { this.status = `Fix this link first: ${bad[0]}`; this.rerender(); return; }
      this.status = 'Publishing…'; this.rerender();
      try {
        const before = new Set(((this.site || {}).slides || []).map(s => s.img).filter(Boolean));
        const now = new Set(this.draft.slides.map(s => s.img).filter(Boolean));
        for (const id of now) if (!before.has(id)) await C.putSiteImage(id, this.images[id]);
        const saved = await C.saveSite({ slides: this.draft.slides, showDefault: this.draft.showDefault !== false, xPosts: this.draft.xPosts || [], instagramPosts: this.draft.instagramPosts || [] });
        for (const id of before) if (!now.has(id)) await C.deleteSiteImage(id);
        this.site = saved;
        this.draft = JSON.parse(JSON.stringify(saved));
        this.status = 'Published. The home page shows it on the next visit.';
      } catch (e) {
        console.error('Publishing the site:', e);
        this.status = `Couldn't publish: ${explain(e)}`;
      }
      this.rerender();
    },

    previewPosts() {
      const box = document.getElementById('sitePostsPreview');
      if (!box) return;
      const lists = { xPosts: this.draft.xPosts || [], instagramPosts: this.draft.instagramPosts || [] };
      const base = siteRoot();
      const doc = `<!DOCTYPE html><html><head><base href="${base}"><meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="assets/site.css"><script src="assets/site.js"><\/script>
        <script>BTR.CONFIG.xPosts = ${JSON.stringify(lists.xPosts).replace(/</g, '\\u003c')}; BTR.CONFIG.instagramPosts = ${JSON.stringify(lists.instagramPosts).replace(/</g, '\\u003c')};<\/script>
        <style>body{margin:0;padding:12px;background:var(--bg,#06070a)} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}</style></head>
        <body><div class="grid">${lists.xPosts.length ? '<div class="card side-card" data-embed="x"></div>' : ''}${lists.instagramPosts.length ? '<div class="card side-card" data-embed="instagram"></div>' : ''}</div>
        <script>document.querySelectorAll('[data-embed]').forEach(BTR.socialEmbed)<\/script></body></html>`;
      box.innerHTML = lists.xPosts.length || lists.instagramPosts.length
        ? '<iframe class="site-frame-posts" title="Pinned posts preview"></iframe>'
        : '<p class="adm-note">No posts listed.</p>';
      const fr = box.querySelector('iframe');
      if (fr) fr.srcdoc = doc;
    }
  };

  // Admin accounts only: the page waits for sign-in, then loads.
  SiteAdmin.start = async function (opts = {}) {
    const sum = document.getElementById('admSummary');
    const body = document.getElementById('admBody');
    const gate = msg => { if (sum) sum.textContent = msg; if (body) body.innerHTML = `<p class="adm-empty">${esc(msg)}</p>`; this.el = null; };
    if (opts.skipGate) { if (sum) sum.textContent = 'Home page hero and pinned posts.'; this.render(body); return; }
    const on = root.Cloud ? await root.Cloud.init() : false;
    if (!on) { gate('Accounts aren\'t available right now, so this page can\'t check who you are.'); return; }
    root.Cloud.onChange(() => {
      if (root.Cloud.admin) { if (sum) sum.textContent = `Home page hero and pinned posts · signed in as ${root.Cloud.user.email}`; this.render(body); }
      else gate(root.Cloud.user ? 'This account isn\'t an admin.' : 'Sign in with an admin account (top right) to edit the site.');
    });
  };

  root.SiteAdmin = SiteAdmin;
  if (typeof document !== 'undefined' && !root.__ADMIN_NO_AUTOSTART && document.getElementById('admBody')) {
    const go = () => SiteAdmin.start();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
