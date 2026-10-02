/* ============================================================
   BYTHERIM — first-time walkthroughs.

   A short guided tour for each RP page: a spotlight on one part of the
   page and a card explaining it, step by step. It opens on its own the
   first time someone uses a page (when they aren't signed in), never
   again once finished or skipped, and can be replayed from the page's
   "Take the tour" link or by adding ?tour=1 to the address.

     Tour.define('ncaa-home', [{ el: '#newSaveBtn', title, text }, …]);
     Tour.auto('ncaa-home');       // first visit only
     Tour.start('ncaa-home');      // any time
   ============================================================ */
(function (root) {
  'use strict';
  const tours = {};
  const KEY = id => `btr-tour-${id}`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return '1'; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const track = e => { try { if (root.BTR && root.BTR.track) root.BTR.track(e); } catch (x) { /* never in the way */ } };
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function styles() {
    if (document.getElementById('tourStyles')) return;
    const st = document.createElement('style');
    st.id = 'tourStyles';
    st.textContent = `
:root { --tour-surface: #10131a; --tour-text: #f4f6fb; --tour-muted: #a3acbb; --tour-border: #2a2f3a; --tour-accent: #c86fb4; --tour-accent-text: #12060f; --tour-scrim: rgba(3,5,10,.68); }
:root[data-theme="light"] { --tour-surface: #ffffff; --tour-text: #0c0f14; --tour-muted: #555e6c; --tour-border: #dde1e7; --tour-accent: #964282; --tour-accent-text: #ffffff; --tour-scrim: rgba(15,23,42,.5); }
.tour-root { position: fixed; inset: 0; z-index: 9000; pointer-events: none; }
.tour-block { position: fixed; inset: 0; pointer-events: auto; }
.tour-spot { position: fixed; border-radius: 14px; box-shadow: 0 0 0 9999px var(--tour-scrim); outline: 2px solid var(--tour-accent); outline-offset: 2px;
  transition: top .28s ease, left .28s ease, width .28s ease, height .28s ease; pointer-events: none; }
.tour-spot.none { width: 0 !important; height: 0 !important; outline: 0; left: 50% !important; top: 40% !important; }
.tour-card { position: fixed; width: min(360px, calc(100vw - 24px)); background: var(--tour-surface); color: var(--tour-text); border: 1px solid var(--tour-border);
  border-radius: 14px; padding: 18px 18px 14px; box-shadow: 0 18px 50px rgba(0,0,0,.4); pointer-events: auto; font-family: 'Asap Condensed', system-ui, sans-serif;
  transition: top .28s ease, left .28s ease; }
.tour-card h2 { margin: 0 0 6px; font-family: 'Oswald', sans-serif; font-size: 1.25rem; letter-spacing: .02em; text-transform: uppercase; color: var(--tour-text); }
.tour-card p { margin: 0; color: var(--tour-muted); font-size: 1rem; line-height: 1.5; }
.tour-card p b { color: var(--tour-text); }
.tour-step { display: block; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--tour-accent); margin-bottom: 4px; }
.tour-actions { display: flex; align-items: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.tour-actions .tour-gap { flex: 1; }
.tour-btn { font: inherit; font-weight: 700; font-size: .95rem; padding: 8px 16px; border-radius: 999px; cursor: pointer; border: 1px solid var(--tour-border); background: transparent; color: var(--tour-text); }
.tour-btn.primary { background: var(--tour-accent); border-color: var(--tour-accent); color: var(--tour-accent-text); }
.tour-btn.link { border: 0; padding: 8px 4px; color: var(--tour-muted); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
.tour-btn:focus-visible { outline: 2px solid var(--tour-accent); outline-offset: 2px; }
.tour-dots { display: flex; gap: 5px; }
.tour-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--tour-border); }
.tour-dots i.on { background: var(--tour-accent); }
@media (max-width: 640px) {
  .tour-card { left: 12px !important; right: 12px; width: auto; top: auto !important; bottom: calc(12px + env(safe-area-inset-bottom)); }
}
@media (prefers-reduced-motion: reduce) { .tour-spot, .tour-card { transition: none; } }`;
    document.head.appendChild(st);
  }

  const Tour = {
    active: null,
    define(id, steps, opts = {}) { tours[id] = { steps, opts }; },
    seen(id) { return !!store.get(KEY(id)); },
    reset(id) { try { localStorage.removeItem(KEY(id)); } catch (e) {} },

    // Opens the tour the first time someone uses the page, unless they're
    // signed in (a returning player); ?tour=1 opens it any time.
    async auto(id, opts = {}) {
      if (!tours[id] || this.active) return false;
      const forced = /[?&]tour=1\b/.test(location.search);
      if (!forced && this.seen(id)) return false;
      if (!forced && root.Cloud && root.Cloud.ready) {
        try { await Promise.race([root.Cloud.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* no accounts */ }
        if (root.Cloud.user) return false;
      }
      if (opts.when && !opts.when()) return false;
      setTimeout(() => this.start(id), opts.delay == null ? 600 : opts.delay);
      return true;
    },

    start(id, at = 0) {
      const t = tours[id];
      if (!t || typeof document === 'undefined') return;
      this.close(true);
      styles();
      const steps = t.steps.filter(s => !s.when || s.when());
      const el = document.createElement('div');
      el.className = 'tour-root';
      el.innerHTML = '<div class="tour-block"></div><div class="tour-spot none"></div><div class="tour-card" role="dialog" aria-modal="true" aria-live="polite"></div>';
      document.body.appendChild(el);
      this.active = { id, steps, i: at, el, opts: t.opts, prevFocus: document.activeElement };
      this._onKey = e => {
        if (!this.active) return;
        if (e.key === 'Escape') { e.preventDefault(); this.finish(false); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.back(); }
      };
      this._onMove = () => this.place();
      document.addEventListener('keydown', this._onKey);
      root.addEventListener('resize', this._onMove);
      root.addEventListener('scroll', this._onMove, true);
      el.querySelector('.tour-block').addEventListener('click', () => {});
      this.show();
    },

    target() {
      const a = this.active, s = a && a.steps[a.i];
      if (!s || !s.el) return null;
      const node = typeof s.el === 'function' ? s.el() : document.querySelector(s.el);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return r.width || r.height ? node : null;
    },

    show() {
      const a = this.active;
      if (!a) return;
      const s = a.steps[a.i];
      if (s.before) { try { s.before(); } catch (e) { /* the step still shows */ } }
      const card = a.el.querySelector('.tour-card');
      const last = a.i === a.steps.length - 1;
      card.setAttribute('aria-label', s.title);
      card.innerHTML = `<span class="tour-step">${esc(a.opts.label || 'Quick tour')} · ${a.i + 1} of ${a.steps.length}</span>
        <h2>${esc(s.title)}</h2><p>${s.html || esc(s.text)}</p>
        <div class="tour-actions">
          <div class="tour-dots" aria-hidden="true">${a.steps.map((_, i) => `<i class="${i === a.i ? 'on' : ''}"></i>`).join('')}</div>
          <span class="tour-gap"></span>
          ${last ? '' : '<button type="button" class="tour-btn link" data-t="skip">Skip tour</button>'}
          ${a.i ? '<button type="button" class="tour-btn" data-t="back">Back</button>' : ''}
          ${last && a.opts.guide ? `<a class="tour-btn" href="${esc(a.opts.guide)}" data-t="guide">Full guide</a>` : ''}
          <button type="button" class="tour-btn primary" data-t="next">${last ? (a.opts.doneLabel || 'Got it') : 'Next'}</button>
        </div>`;
      card.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', ev => {
        const t = b.getAttribute('data-t');
        if (t === 'next') this.next();
        else if (t === 'back') this.back();
        else if (t === 'skip') this.finish(false);
        else if (t === 'guide') { track('guide_open'); this.finish(true, true); }
      }));
      const node = this.target();
      if (node && node.scrollIntoView) {
        const r = node.getBoundingClientRect();
        const vh = root.innerHeight || 800;
        if (r.top < 70 || r.bottom > vh - (vh < 700 ? 260 : 40)) node.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      }
      this.place();
      setTimeout(() => this.place(), 350);
      const primary = card.querySelector('[data-t="next"]');
      if (primary) primary.focus({ preventScroll: true });
    },

    // The spotlight on the step's part of the page, the card beside it.
    place() {
      const a = this.active;
      if (!a) return;
      const spot = a.el.querySelector('.tour-spot'), card = a.el.querySelector('.tour-card');
      const node = this.target();
      const vw = root.innerWidth || 1024, vh = root.innerHeight || 800;
      if (!node) {
        spot.classList.add('none');
        card.style.left = `${Math.max(12, (vw - card.offsetWidth) / 2)}px`;
        card.style.top = `${Math.max(12, (vh - card.offsetHeight) / 2)}px`;
        return;
      }
      spot.classList.remove('none');
      const r = node.getBoundingClientRect(), pad = 6;
      spot.style.left = `${r.left - pad}px`; spot.style.top = `${r.top - pad}px`;
      spot.style.width = `${r.width + pad * 2}px`; spot.style.height = `${r.height + pad * 2}px`;
      const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14;
      let top = r.bottom + gap;
      if (top + ch > vh - 12) top = r.top - ch - gap;
      if (top < 12) top = Math.min(vh - ch - 12, Math.max(12, r.bottom + gap));
      const left = Math.min(vw - cw - 12, Math.max(12, r.left + r.width / 2 - cw / 2));
      card.style.left = `${left}px`; card.style.top = `${top}px`;
    },

    next() { const a = this.active; if (!a) return; if (a.i >= a.steps.length - 1) { this.finish(true); return; } a.i++; this.show(); },
    back() { const a = this.active; if (!a || !a.i) return; a.i--; this.show(); },

    finish(done, keepFocus) {
      const a = this.active;
      if (!a) return;
      store.set(KEY(a.id), done ? 'done' : 'skipped');
      track(done ? 'tutorial_done' : 'tutorial_skipped');
      const after = a.opts.onFinish;
      this.close(keepFocus);
      if (after) { try { after(done); } catch (e) { /* nothing to undo */ } }
    },

    close(keepFocus) {
      const a = this.active;
      if (!a) return;
      a.el.remove();
      document.removeEventListener('keydown', this._onKey);
      root.removeEventListener('resize', this._onMove);
      root.removeEventListener('scroll', this._onMove, true);
      this.active = null;
      if (!keepFocus && a.prevFocus && a.prevFocus.focus) { try { a.prevFocus.focus({ preventScroll: true }); } catch (e) {} }
    }
  };

  root.Tour = Tour;
  if (typeof module !== 'undefined' && module.exports) module.exports = Tour;
})(typeof window !== 'undefined' ? window : globalThis);
