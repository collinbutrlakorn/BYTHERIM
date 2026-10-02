// ============================================================
// Accounts: Google sign-in, saves and draft boards per person, and admin
// publishing of the official universe.
//
// Built on Firebase (Authentication + Firestore), loaded from Google's
// CDN only when rp/js/cloud-config.js holds a project config. Without
// one, none of this appears and the site works exactly as before: saves
// stay in the browser and the official universe is data/universe.json.
//
// Firestore layout (rules in /firestore.rules):
//   users/{uid}                     { boards: { key: [ids] }, email, name }
//   users/{uid}/saves/main          { chunks, bytes, gz, updatedAt, summary }
//   users/{uid}/saves/main/chunks/N { d: base64 }
//   official/universe (+ chunks)    the published universe, read by anyone
//   config/admins                   { emails: [...] } — who may publish
//
// A save is ~1-6 MB compressed, over Firestore's 1 MB document limit, so
// blobs are split across chunk documents.
// ============================================================

(function (root) {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const CHUNK = 900000;          // base64 characters per chunk document

  // Gives up after a while: a blocked or unreachable CDN must never leave
  // a page waiting.
  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    const t = setTimeout(() => rej(new Error('Timed out loading ' + src)), 10000);
    s.src = src; s.async = false;
    s.onload = () => { clearTimeout(t); res(); };
    s.onerror = () => { clearTimeout(t); rej(new Error('Could not load ' + src)); };
    document.head.appendChild(s);
  });
  const within = (promise, ms, fallback) => Promise.race([promise, new Promise(r => setTimeout(() => r(fallback), ms))]);

  // ---------- bytes <-> text ----------
  // Chunk document ids: "<generation>-<n>", or plain "<n>" for blobs
  // written before generations existed.
  const chunkId = (meta, i) => (meta && meta.gen ? `${meta.gen}-${i}` : String(i));

  async function gzip(text) {
    if (typeof CompressionStream === 'undefined') return { bytes: new TextEncoder().encode(text), gz: false };
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), gz: true };
  }
  async function gunzip(bytes, gz) {
    if (!gz) return new TextDecoder().decode(bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }
  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(b64), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  const Cloud = {
    enabled: false,
    user: null,
    admin: false,
    fb: null,
    db: null,
    _subs: [],
    ready: null,

    // Starts Firebase if the site has a config. Resolves true when
    // accounts are available.
    init() {
      if (this.ready) return this.ready;
      const config = root.BTR_CLOUD_CONFIG;
      this.ready = (async () => {
        if (!config || !config.apiKey) { this.renderSlot(); return false; }
        try {
          if (!root.firebase) {
            await loadScript(SDK + 'firebase-app-compat.js');
            await loadScript(SDK + 'firebase-auth-compat.js');
            await loadScript(SDK + 'firebase-firestore-compat.js');
          }
          this.fb = root.firebase;
          if (!this.fb.apps || !this.fb.apps.length) this.fb.initializeApp(config);
          this.db = this.fb.firestore();
          this.enabled = true;
          await new Promise(resolve => {
            let first = true;
            this.fb.auth().onAuthStateChanged(async u => {
              this.user = u || null;
              this.admin = u ? await this.checkAdmin() : false;
              if (u) this.db.doc(`users/${u.uid}`).set({ email: u.email || '', name: u.displayName || '' }, { merge: true }).catch(() => {});
              this.renderSlot();
              this._subs.forEach(fn => { try { fn(this.user); } catch (e) { console.error(e); } });
              if (first) { first = false; resolve(); }
            });
          });
          return true;
        } catch (e) {
          console.warn('Accounts unavailable:', e.message || e);
          this.enabled = false;
          this.renderSlot();
          return false;
        }
      })();
      return this.ready;
    },

    onChange(fn) { this._subs.push(fn); if (this.enabled) fn(this.user); },

    async signIn() {
      if (!this.enabled) return;
      const provider = new this.fb.auth.GoogleAuthProvider();
      try { await this.fb.auth().signInWithPopup(provider); }
      catch (e) {
        if (e && /popup/i.test(e.code || '')) await this.fb.auth().signInWithRedirect(provider);
        else console.warn('Sign-in failed:', e);
      }
    },
    async signOut() { if (this.enabled) await this.fb.auth().signOut(); },

    // ---------- admins ----------
    async checkAdmin() {
      try {
        const snap = await this.db.doc('config/admins').get();
        const list = (snap.exists && snap.data().emails) || [];
        return !!(this.user && this.user.email && list.map(x => String(x).toLowerCase()).includes(this.user.email.toLowerCase()));
      } catch (e) { return false; }
    },
    async getAdmins() {
      const snap = await this.db.doc('config/admins').get();
      return (snap.exists && snap.data().emails) || [];
    },
    async setAdmins(emails) {
      if (!this.admin) throw new Error('Only an admin can change the admin list.');
      const clean = [...new Set(emails.map(e => String(e).trim().toLowerCase()).filter(e => /@/.test(e)))];
      if (!clean.includes(this.user.email.toLowerCase())) clean.push(this.user.email.toLowerCase());
      await this.db.doc('config/admins').set({ emails: clean }, { merge: true });
      return clean;
    },

    // ---------- chunked blobs ----------
    async putBlob(path, text, extra = {}) {
      const { bytes, gz } = await gzip(text);
      const b64 = toB64(bytes);
      const n = Math.max(1, Math.ceil(b64.length / CHUNK));
      const metaRef = this.db.doc(path);
      const before = await metaRef.get();
      const old = before.exists ? before.data() : null;
      // A new generation of chunks is written first and the pointer moves
      // to it last, so an upload cut off halfway (a closed tab during an
      // autosave) leaves the previous save whole instead of half-replaced.
      const gen = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      for (let i = 0; i < n; i++) await this.db.doc(`${path}/chunks/${gen}-${i}`).set({ d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
      const meta = { chunks: n, gen, bytes: bytes.length, gz, updatedAt: Date.now(), ...extra };
      await metaRef.set(meta);
      if (old && old.chunks) {
        for (let i = 0; i < old.chunks; i++) await this.db.doc(`${path}/chunks/${chunkId(old, i)}`).delete().catch(() => {});
      }
      return meta;
    },
    async getMeta(path) {
      const snap = await this.db.doc(path).get();
      return snap.exists ? snap.data() : null;
    },
    async getBlob(path) {
      const meta = await this.getMeta(path);
      if (!meta || !meta.chunks) return null;
      let b64 = '';
      for (let i = 0; i < meta.chunks; i++) {
        const c = await this.db.doc(`${path}/chunks/${chunkId(meta, i)}`).get();
        if (!c.exists) throw new Error('A piece of the saved file is missing.');
        b64 += c.data().d;
      }
      return { meta, text: await gunzip(fromB64(b64), meta.gz) };
    },

    // ---------- saves ----------
    savePath() { return this.user ? `users/${this.user.uid}/saves/main` : null; },

    // The whole NCAA RP save: the three tables exactly as the browser
    // holds them, so a restore is the same save.
    async snapshotDb(dbx) {
      return { v: 1, leagueState: await dbx.leagueState.toArray(), teams: await dbx.teams.toArray(), players: await dbx.players.toArray() };
    },
    async restoreDb(dbx, snap) {
      await dbx.transaction('rw', dbx.leagueState, dbx.teams, dbx.players, async () => {
        await dbx.leagueState.clear(); await dbx.teams.clear(); await dbx.players.clear();
        await dbx.leagueState.bulkPut(snap.leagueState || []);
        await dbx.teams.bulkPut(snap.teams || []);
        await dbx.players.bulkPut(snap.players || []);
      });
    },
    async uploadSave(dbx, summary) {
      if (!this.user) throw new Error('Sign in first.');
      const snap = await this.snapshotDb(dbx);
      const meta = await this.putBlob(this.savePath(), JSON.stringify(snap), { summary: summary || '' });
      try { localStorage.setItem('btr-cloud-synced', String(meta.updatedAt)); } catch (e) { /* storage blocked */ }
      return meta;
    },
    async downloadSave(dbx) {
      if (!this.user) throw new Error('Sign in first.');
      const got = await this.getBlob(this.savePath());
      if (!got) return null;
      await this.restoreDb(dbx, JSON.parse(got.text));
      try { localStorage.setItem('btr-cloud-synced', String(got.meta.updatedAt)); } catch (e) { /* storage blocked */ }
      return got.meta;
    },
    lastSynced() { try { return Number(localStorage.getItem('btr-cloud-synced')) || 0; } catch (e) { return 0; } },

    // ---------- per-person data (draft boards) ----------
    async getUserData() {
      if (!this.user) return {};
      const snap = await this.db.doc(`users/${this.user.uid}`).get();
      return snap.exists ? snap.data() : {};
    },
    async setBoard(key, ids) {
      if (!this.user) return;
      await this.db.doc(`users/${this.user.uid}`).set({ boards: { [key]: ids } }, { merge: true });
    },

    // ---------- the site's own content (the home page hero, pinned posts) ----------
    // official/site_<page> holds the text; each hero image is its own
    // document under official/site_<page>/images, kept under Firestore's
    // 1 MB limit when it's uploaded. It sits beside the official universe,
    // which the database rules already let everyone read and only admins
    // write, so no rules change is needed for it.
    async getSite(name = 'home') {
      if (!this.db) return null;
      const snap = await this.db.doc(`official/site_${name}`).get();
      return snap.exists ? snap.data() : null;
    },
    async saveSite(data, name = 'home') {
      if (!this.admin) throw new Error('Only an admin can change the site.');
      const doc = { ...data, updatedAt: Date.now(), by: this.user.email };
      await this.db.doc(`official/site_${name}`).set(doc);
      return doc;
    },
    async getSiteImage(id, name = 'home') {
      if (!this.db || !id) return null;
      const snap = await this.db.doc(`official/site_${name}/images/${id}`).get();
      return snap.exists ? snap.data().d : null;
    },
    async putSiteImage(id, dataUrl, name = 'home') {
      if (!this.admin) throw new Error('Only an admin can change the site.');
      if (dataUrl.length > 1000000) throw new Error('That image is still too large after shrinking it. Try a smaller one.');
      await this.db.doc(`official/site_${name}/images/${id}`).set({ d: dataUrl });
    },
    async deleteSiteImage(id, name = 'home') {
      if (!this.admin || !id) return;
      await this.db.doc(`official/site_${name}/images/${id}`).delete().catch(() => {});
    },

    // ---------- generated recruits ----------
    // official/recruit_gen: { resets: { "2033": 1, ... } }, how many times
    // each class's generated players have been reset (recruit-gen.js).
    // Read by every page that builds the classes; {} when unavailable.
    async recruitGen() {
      await within(this.init(), 2500, false);
      if (!this.enabled || !this.db) return {};
      try {
        const snap = await within(this.db.doc('official/recruit_gen').get(), 4000, null);
        return snap && snap.exists ? (snap.data().resets || {}) : {};
      } catch (e) { return {}; }
    },
    async resetGeneratedClasses(years) {
      if (!this.admin) throw new Error('Only an admin can reset generated players.');
      const ref = this.db.doc('official/recruit_gen');
      const snap = await ref.get();
      const resets = { ...((snap.exists && snap.data().resets) || {}) };
      years.forEach(y => { resets[String(y)] = (Number(resets[String(y)]) || 0) + 1; });
      await ref.set({ resets, updatedAt: Date.now(), by: this.user.email });
      return resets;
    },

    // ---------- the official universe ----------
    async publishUniverse(json) {
      if (!this.admin) throw new Error('Only an admin can publish.');
      return this.putBlob('official/universe', json, { by: this.user.email });
    },
    // The official universe: the one an admin published, else the file.
    async universe(url = '../data/universe.json') {
      // Accounts get a few seconds to start; after that the file is used.
      await within(this.init(), 2500, false);
      if (this.enabled) {
        try {
          const got = await within(this.getBlob('official/universe'), 8000, null);
          if (got) return JSON.parse(got.text);
        } catch (e) { console.warn('Published universe unavailable, using the file:', e.message || e); }
      }
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    },

    // ---------- the header button ----------
    injectStyles() {
      if (document.getElementById('cloudStyles')) return;
      const st = document.createElement('style');
      st.id = 'cloudStyles';
      st.textContent = `
/* The account menu and dialogs follow the page's theme (the header itself
   stays dark in both, so they carry their own colours). */
:root { --acct-surface: #0f1117; --acct-text: #f4f6fb; --acct-muted: #9aa3b2; --acct-border: #2a2f3a; --acct-hover: rgba(255,255,255,.06);
  --acct-accent: #4aa8ff; --acct-accent-text: #04121f; --acct-shadow: 0 12px 32px rgba(0,0,0,.45); --acct-scrim: rgba(4,6,12,.72); }
:root[data-theme="light"] { --acct-surface: #ffffff; --acct-text: #0c0f14; --acct-muted: #555e6c; --acct-border: #dde1e7; --acct-hover: #f1f3f6;
  --acct-accent: #0a6fb8; --acct-accent-text: #ffffff; --acct-shadow: 0 12px 32px rgba(15,23,42,.16); --acct-scrim: rgba(15,23,42,.45); }
.account-slot { display: flex; align-items: center; }
.account-btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 0.85rem; font-weight: 600; padding: 6px 12px;
  border-radius: 999px; border: 1px solid var(--border, #2a2f3a); background: var(--surface, #0f1117); color: var(--text, #f4f6fb); cursor: pointer; }
.account-wrap { position: relative; }
.account-avatar { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border, #2a2f3a); background: var(--acct-accent);
  color: var(--acct-accent-text); font: inherit; font-weight: 700; cursor: pointer; overflow: hidden; padding: 0; display: flex; align-items: center; justify-content: center; }
.account-avatar img { width: 100%; height: 100%; object-fit: cover; }
.account-menu { display: none; position: absolute; right: 0; top: calc(100% + 8px); z-index: 5000; min-width: 230px; max-width: calc(100vw - 24px); padding: 12px;
  background: var(--acct-surface); border: 1px solid var(--acct-border); border-radius: 12px; box-shadow: var(--acct-shadow);
  flex-direction: column; gap: 6px; color: var(--acct-text); }
.account-wrap.open .account-menu { display: flex; }
.account-menu b { color: var(--acct-text); }
.account-menu small { color: var(--acct-muted); word-break: break-all; }
.account-menu button { font: inherit; text-align: left; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--acct-border);
  background: transparent; color: var(--acct-text); cursor: pointer; }
.account-menu button:hover { background: var(--acct-hover); }
.account-admin { width: fit-content; font-size: 0.7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--acct-accent-text);
  background: var(--acct-accent); border-radius: 999px; padding: 2px 8px; }
.cloud-modal { position: fixed; inset: 0; z-index: 6000; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--acct-scrim); }
.cloud-card { width: min(460px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--acct-surface); color: var(--acct-text); border: 1px solid var(--acct-border);
  border-radius: 14px; padding: 22px; display: flex; flex-direction: column; gap: 10px; box-shadow: var(--acct-shadow); }
.cloud-card h2 { margin: 0; font-family: 'Oswald', sans-serif; color: var(--acct-text); }
.cloud-card p { margin: 0; color: var(--acct-muted); }
.cloud-card textarea { font: inherit; padding: 10px; border-radius: 8px; border: 1px solid var(--acct-border); background: transparent; color: inherit; }
.cloud-card .row { display: flex; gap: 8px; flex-wrap: wrap; }
.cloud-card button { font: inherit; font-weight: 700; padding: 8px 16px; border-radius: 999px; cursor: pointer; border: 1px solid var(--acct-border); background: transparent; color: inherit; }
.cloud-card button.primary { background: var(--acct-accent); border-color: var(--acct-accent); color: var(--acct-accent-text); }`;
      document.head.appendChild(st);
    },

    renderSlot() {
      if (typeof document === 'undefined') return;
      const slot = document.getElementById('accountSlot');
      if (!slot) return;
      this.injectStyles();
      if (!this.enabled) { slot.innerHTML = ''; return; }
      const esc = v => String(v || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      if (!this.user) {
        slot.innerHTML = `<button type="button" class="account-btn" onclick="Cloud.signIn()"><svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg><span>Sign in</span></button>`;
        return;
      }
      const u = this.user;
      const initial = esc((u.displayName || u.email || '?').trim()[0].toUpperCase());
      slot.innerHTML = `<div class="account-wrap">
        <button type="button" class="account-avatar" onclick="this.parentNode.classList.toggle('open')" aria-label="Your account">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : initial}</button>
        <div class="account-menu">
          <b>${esc(u.displayName || 'Signed in')}</b><small>${esc(u.email)}</small>
          ${this.admin ? '<span class="account-admin">Admin</span><button type="button" onclick="location.href=\'/admin.html\'">Site admin</button><button type="button" onclick="location.href=\'/rp/admin.html\'">RP admin</button><button type="button" onclick="location.href=\'/recruiting/admin.html\'">Recruiting admin</button><button type="button" onclick="Cloud.openAdmins()">Manage admins</button>' : ''}
          <button type="button" onclick="Cloud.signOut()">Sign out</button>
        </div></div>`;
    },

    // A small dialog for the admin list.
    async openAdmins() {
      if (!this.admin) return;
      const list = await this.getAdmins();
      const el = document.createElement('div');
      el.className = 'cloud-modal';
      el.innerHTML = `<div class="cloud-card"><h2>Admins</h2>
        <p>Admins can publish the official universe that the Draft RP, Recruiting page and RP Hub show everyone. One Google account email per line.</p>
        <textarea rows="6">${list.join('\n')}</textarea>
        <div class="row"><button type="button" class="primary" data-save>Save</button><button type="button" data-close>Close</button></div>
        <p class="admin-msg"></p></div>`;
      el.addEventListener('click', async ev => {
        if (ev.target === el || ev.target.hasAttribute('data-close')) { el.remove(); return; }
        if (ev.target.hasAttribute('data-save')) {
          const msg = el.querySelector('.admin-msg');
          try { const saved = await this.setAdmins(el.querySelector('textarea').value.split(/[\s,]+/)); msg.textContent = `Saved: ${saved.length} admin${saved.length === 1 ? '' : 's'}.`; }
          catch (e) { msg.textContent = e.message || String(e); }
        }
      });
      document.body.appendChild(el);
    }
  };

  root.Cloud = Cloud;
  if (typeof document !== 'undefined') {
    const go = () => Cloud.init();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
