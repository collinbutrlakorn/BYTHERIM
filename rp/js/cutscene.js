// ============================================================
// Cutscenes: short full-screen sequences between the big moments of the
// RP year — tip-off, Selection Sunday, the title game, every step of the
// draft cycle and the offseason.
//
// Shared by the NCAA RP and the Draft RP. Each cutscene is a list of
// scenes (HTML + how long it holds); the last scene waits for a button.
// Always skippable, keyboard friendly, and quicker for anyone who has
// asked their system for reduced motion. Viewers can turn them off.
// ============================================================

(function () {
  const Cutscene = {
    KEY: 'bytherim-cutscenes',
    _timer: null,
    _resolve: null,

    // Tests (and anyone who switched them off) skip the automatic ones.
    enabled() {
      if (typeof window !== 'undefined' && window.__BTR_NO_CUTSCENES) return false;
      try { return localStorage.getItem(this.KEY) !== 'off'; } catch (e) { return true; }
    },
    setEnabled(on) {
      try { localStorage.setItem(this.KEY, on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
      document.querySelectorAll('[data-cutscene-toggle]').forEach(el => this.renderToggle(el));
    },
    renderToggle(el) {
      const on = this.enabled();
      el.setAttribute('aria-pressed', String(on));
      el.textContent = on ? 'Cutscenes: On' : 'Cutscenes: Off';
    },

    esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); },

    // opts: { id, scenes: [{ ms, html }], actions: [{ label, primary, run }], label, onClose }
    // Resolves 'done' or 'skipped' once the cutscene closes.
    play(opts) {
      if (typeof document === 'undefined') return Promise.resolve('skipped');
      this.close(true);
      const scenes = (opts.scenes || []).filter(Boolean);
      if (!scenes.length) return Promise.resolve('done');
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const el = document.createElement('div');
      el.className = 'cs-show' + (opts.theme ? ' cs-' + opts.theme : '');
      el.id = opts.id || 'cutscene';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', opts.label || 'Cutscene');
      el.innerHTML = `<div class="cs-bg"><span class="cs-orb a"></span><span class="cs-orb b"></span></div>
        <button class="cs-skip sel-skip" type="button">Skip &rsaquo;</button>
        <div class="cs-stage" aria-live="polite"></div>
        <div class="cs-nav">
          <button class="cs-nav-btn cs-prev" type="button" aria-label="Previous scene">&lsaquo;</button>
          <div class="cs-dots"></div>
          <button class="cs-nav-btn cs-pause" type="button" aria-label="Pause">&#10074;&#10074;</button>
          <button class="cs-nav-btn cs-next" type="button" aria-label="Next scene">&rsaquo;</button>
        </div>
        <div class="cs-progress"><span></span></div>`;
      document.body.appendChild(el);
      document.body.classList.add('cs-open');

      const stage = el.querySelector('.cs-stage');
      const bar = el.querySelector('.cs-progress span');
      const dots = el.querySelector('.cs-dots');
      dots.innerHTML = scenes.map((_, k) => `<i role="button" tabindex="-1" aria-label="Scene ${k + 1}" data-k="${k}"></i>`).join('');
      let i = 0, paused = false;
      const prevBtn = el.querySelector('.cs-prev'), nextBtn = el.querySelector('.cs-next'), pauseBtn = el.querySelector('.cs-pause');

      const actions = opts.actions && opts.actions.length ? opts.actions : [{ label: 'Continue', primary: true }];
      const finish = (how) => {
        const run = this._pendingAction;
        this._pendingAction = null;
        this.close(false, how);
        if (typeof opts.onClose === 'function') opts.onClose(how);
        if (typeof run === 'function') run();
      };

      const show = () => {
        if (!document.body.contains(el)) return;
        const sc = scenes[i];
        const last = i === scenes.length - 1;
        stage.innerHTML = `<div class="cs-scene ${sc.cls || ''}">${sc.html}</div>` +
          (last ? `<div class="cs-actions">${actions.map((a, k) => `<button type="button" class="cs-btn ${a.primary ? 'primary' : ''}" data-k="${k}">${this.esc(a.label)}</button>`).join('')}</div>` : '');
        // Confetti falls across the whole screen, not inside the scrolling
        // stage (where it would be clipped to the stage's box).
        el.querySelectorAll(':scope > .cs-confetti').forEach(n => n.remove());
        stage.querySelectorAll('.cs-confetti').forEach(n => el.insertBefore(n, stage));
        if (last) {
          stage.querySelectorAll('.cs-btn').forEach(b => b.addEventListener('click', () => {
            this._pendingAction = actions[+b.dataset.k].run || null;
            finish('done');
          }));
          const first = stage.querySelector('.cs-btn.primary') || stage.querySelector('.cs-btn');
          if (first) setTimeout(() => first.focus(), 60);
        }
        bar.style.width = `${Math.round(((i + 1) / scenes.length) * 100)}%`;
        dots.querySelectorAll('i').forEach((d, k) => { d.classList.toggle('on', k <= i); d.classList.toggle('cur', k === i); });
        prevBtn.disabled = i === 0; nextBtn.disabled = last; pauseBtn.hidden = last;
        this.countUp(stage);
        schedule();
      };
      // Scenes hold long enough to read; viewers can pause, go back or jump ahead.
      const schedule = () => {
        clearTimeout(this._timer);
        if (paused || i >= scenes.length - 1) return;
        const sc = scenes[i];
        const ms = reduce ? Math.max(3000, sc.ms || 2600) : Math.max(4200, Math.round((sc.ms || 2600) * 1.7));
        this._timer = setTimeout(() => { i++; show(); }, ms);
      };
      const go = (k) => { i = Math.max(0, Math.min(scenes.length - 1, k)); show(); };
      const setPaused = (v) => {
        paused = v;
        pauseBtn.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
        pauseBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
        el.classList.toggle('cs-paused', paused);
        schedule();
      };
      prevBtn.addEventListener('click', () => go(i - 1));
      nextBtn.addEventListener('click', () => go(i + 1));
      pauseBtn.addEventListener('click', () => setPaused(!paused));
      dots.addEventListener('click', e => { const d = e.target.closest('i[data-k]'); if (d) go(+d.dataset.k); });

      el.querySelector('.cs-skip').addEventListener('click', () => {
        if (i < scenes.length - 1) { i = scenes.length - 1; show(); }
        else finish('skipped');
      });
      this._key = (e) => {
        if (!document.body.contains(el)) return;
        if (e.key === 'Escape') { e.preventDefault(); if (i < scenes.length - 1) { i = scenes.length - 1; show(); } else finish('skipped'); }
        else if (e.key === 'ArrowRight' && i < scenes.length - 1) { e.preventDefault(); go(i + 1); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); go(i - 1); }
        else if (e.key === ' ' && i < scenes.length - 1) { e.preventDefault(); setPaused(!paused); }
      };
      document.addEventListener('keydown', this._key);
      show();
      return new Promise(res => { this._resolve = res; });
    },

    close(silent, how) {
      clearTimeout(this._timer);
      if (this._key) { document.removeEventListener('keydown', this._key); this._key = null; }
      if (typeof document === 'undefined') return;
      document.querySelectorAll('.cs-show').forEach(n => n.remove());
      document.body.classList.remove('cs-open');
      const r = this._resolve;
      this._resolve = null;
      if (r) r(how || 'skipped');
    },

    // Numbers marked data-count="58" roll up from zero.
    countUp(scope) {
      const els = scope.querySelectorAll('[data-count]');
      els.forEach(n => {
        const target = parseFloat(n.getAttribute('data-count'));
        if (isNaN(target)) return;
        const dec = (String(n.getAttribute('data-count')).split('.')[1] || '').length;
        const raf = window.requestAnimationFrame ? f => window.requestAnimationFrame(f) : f => setTimeout(() => f(Date.now()), 16);
        const now = () => (window.performance && performance.now ? performance.now() : Date.now());
        const start = now(), dur = 900;
        const tick = () => {
          const k = Math.min(1, (now() - start) / dur);
          const eased = 1 - Math.pow(1 - k, 3);
          n.textContent = (target * eased).toFixed(dec);
          if (k < 1 && document.body.contains(n)) raf(tick);
        };
        raf(tick);
      });
    },

    // ---- scene building blocks ----

    titleCard(kicker, title, sub, extra) {
      return `<div class="cs-title-card">${kicker ? `<div class="cs-kicker">${kicker}</div>` : ''}
        <h1 class="cs-title">${title}</h1>${sub ? `<div class="cs-sub">${sub}</div>` : ''}${extra || ''}</div>`;
    },
    heading(text, sub) {
      return `<h2 class="cs-h">${text}</h2>${sub ? `<p class="cs-lede">${sub}</p>` : ''}`;
    },
    // Items fade up one after another.
    stagger(items, cls, step = 90, start = 150) {
      return items.map((html, k) => `<div class="cs-item ${cls || ''}" style="--d:${start + k * step}ms">${html}</div>`).join('');
    },
    confetti(n = 60) {
      const colors = ['#ffd166', '#4FAEF5', '#ef476f', '#06d6a0', '#ffffff'];
      let html = '<div class="cs-confetti" aria-hidden="true">';
      for (let k = 0; k < n; k++) {
        const left = Math.round(Math.random() * 100), delay = Math.round(Math.random() * 1400), dur = 2200 + Math.round(Math.random() * 1800);
        const rot = Math.round(Math.random() * 360), c = colors[k % colors.length];
        html += `<i style="left:${left}%;--delay:${delay}ms;--dur:${dur}ms;--rot:${rot}deg;background:${c}"></i>`;
      }
      return html + '</div>';
    }
  };

  if (typeof window !== 'undefined') window.Cutscene = Cutscene;
  if (typeof module !== 'undefined' && module.exports) module.exports = Cutscene;
})();
