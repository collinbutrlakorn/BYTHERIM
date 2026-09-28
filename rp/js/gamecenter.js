// ============================================================
// Game Center: watch a game live, or go back through one that's done.
//
// Takes a broadcast from LiveCore.build() and plays it out: scorebug and
// clock, play-by-play, a live box score, team stats, win probability and
// scores from around the country as they go final. Shared by every place
// in the NCAA RP that shows a game.
// ============================================================

(function () {
  const SPEEDS = [
    { key: 1, label: '1x', ms: 1 },
    { key: 2, label: '2x', ms: 0.5 },
    { key: 4, label: '4x', ms: 0.22 },
    { key: 10, label: '10x', ms: 0.08 }
  ];
  const PACE = { make: 1100, miss: 650, reb: 420, ft: 520, foul: 520, tov: 750, timeout: 900, tip: 900, start: 900, end: 1500, final: 400, held: 700 };

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fmtClock = c => { const s = Math.max(0, c); const m = Math.floor(s / 60); const sec = s - m * 60; return m > 0 || s >= 60 ? `${m}:${String(Math.floor(sec)).padStart(2, '0')}` : s < 10 ? s.toFixed(1) : `0:${String(Math.floor(sec)).padStart(2, '0')}`; };
  const pct = (m, a) => (a ? (m / a) : 0);
  const pctText = (m, a) => (a ? (m / a).toFixed(3).replace(/^0/, '') : '—');

  const GC = {
    game: null, k: 0, timer: null, playing: false, speed: 1, tab: 'pbp', filter: 'all',
    opts: {}, colors: { home: '#4FAEF5', away: '#d4af37' }, _colorCache: {},

    logo(school) { return window.SimEngine && SimEngine.getTeamLogo ? SimEngine.getTeamLogo(school) : ''; },
    reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; },

    // opts: { mode: 'live' | 'final', ticker: [results], onClose, subtitle }
    open(game, opts = {}) {
      if (!game) return;
      this.close(true);
      this.game = game;
      this.opts = opts;
      this.k = opts.mode === 'final' ? game.events.length : 0;
      this.tab = 'pbp';
      this.filter = 'all';
      this.speed = this.speed || 1;
      this.revealed = new Set();
      const el = document.createElement('div');
      el.id = 'gameCenter';
      el.className = 'gc';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', `${game.meta.away.school} at ${game.meta.home.school}`);
      el.innerHTML = this.shell();
      document.body.appendChild(el);
      document.body.classList.add('gc-open');
      this.el = el;
      this.bind();
      this.pickColors();
      this.renderAll();
      if (opts.mode !== 'final') {
        this.showIntro();
      } else {
        this.showFinal(false);
      }
      this._key = e => this.onKey(e);
      document.addEventListener('keydown', this._key);
    },

    close(silent) {
      clearTimeout(this.timer);
      this.playing = false;
      if (this._key) { document.removeEventListener('keydown', this._key); this._key = null; }
      const el = document.getElementById('gameCenter');
      if (el) el.remove();
      document.body.classList.remove('gc-open');
      const cb = this.opts && this.opts.onClose;
      this.game = null;
      if (!silent && typeof cb === 'function') { this.opts.onClose = null; cb(); }
    },

    // ---------- markup ----------
    shell() {
      const g = this.game, m = g.meta;
      const team = side => {
        const t = m[side];
        const tag = t.seed ? `<span class="gc-seed">${t.seed}</span>` : t.rank ? `<span class="gc-rank">${t.rank}</span>` : '';
        return `<div class="gc-team ${side}" onclick="GameCenter.teamPage('${esc(t.school).replace(/'/g, "\\'")}')">
          <img src="${this.logo(t.school)}" alt="" class="gc-logo">
          <div class="gc-team-text"><b>${tag}${esc(t.school)}</b><small>${esc(t.record || '')}${side === 'home' && !m.neutral ? ' · Home' : ''}</small></div>
        </div>`;
      };
      return `<div class="gc-shell">
        <div class="gc-topbar">
          <button class="nav-back-btn gc-close" type="button" onclick="GameCenter.close()">&larr; Back</button>
          <div class="gc-label">${esc(m.label || '')}</div>
          <div class="gc-controls" role="group" aria-label="Playback">
            <button class="gc-ctl" type="button" data-act="restart" title="Watch from the tip">&#8634;</button>
            <button class="gc-ctl gc-playbtn" type="button" data-act="play" title="Play / pause (space)">&#9654;</button>
            <span class="gc-speeds">${SPEEDS.map(s => `<button class="gc-speed" type="button" data-speed="${s.key}">${s.label}</button>`).join('')}</span>
            <button class="gc-ctl" type="button" data-act="end" title="Skip to the final">&#9197;</button>
          </div>
        </div>
        <div class="gc-bug">
          ${team('away')}
          <div class="gc-score away" id="gcAway">0</div>
          <div class="gc-mid">
            <div class="gc-period" id="gcPeriod">1st</div>
            <div class="gc-clock" id="gcClock">20:00</div>
            <div class="gc-status" id="gcStatus"></div>
          </div>
          <div class="gc-score home" id="gcHome">0</div>
          ${team('home')}
          <div class="gc-wpbar" aria-hidden="true"><span id="gcWpFill"></span></div>
        </div>
        <div class="gc-timeline" id="gcTimeline" title="Jump to any point in the game">
          <div class="gc-timeline-fill" id="gcTimeFill"></div>
          ${g.periods.map((p, i) => i ? `<i style="left:${(g.periods.slice(0, i).reduce((a, x) => a + x.len, 0) / g.total) * 100}%"></i>` : '').join('')}
        </div>
        <div class="gc-lastplay" id="gcLast" aria-live="polite"></div>
        <div class="gc-grid">
          <section class="gc-main">
            <div class="gc-tabs" role="tablist">
              <button type="button" data-tab="pbp" class="active">Play-by-Play</button>
              <button type="button" data-tab="box">Box Score</button>
              <button type="button" data-tab="team">Team Stats</button>
              <label class="gc-filter"><input type="checkbox" id="gcScoring"> Scoring plays</label>
            </div>
            <div class="gc-body" id="gcBody"></div>
          </section>
          <aside class="gc-side">
            <div class="gc-card"><div class="gc-card-head"><h3>Win Probability</h3><span id="gcWpText"></span></div><div id="gcWp"></div></div>
            <div class="gc-card"><div class="gc-card-head"><h3>Game Leaders</h3></div><div id="gcLeaders"></div></div>
            ${this.opts.ticker && this.opts.ticker.length ? `<div class="gc-card"><div class="gc-card-head"><h3>Around the Country</h3></div><div id="gcTicker" class="gc-ticker"></div></div>` : ''}
          </aside>
        </div>
        <div class="gc-overlay" id="gcOverlay" hidden></div>
      </div>`;
    },

    bind() {
      const el = this.el;
      el.querySelectorAll('.gc-ctl').forEach(b => b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'play') this.toggle();
        else if (act === 'restart') this.restart();
        else if (act === 'end') this.seek(this.game.events.length);
      }));
      el.querySelectorAll('.gc-speed').forEach(b => b.addEventListener('click', () => { this.speed = +b.dataset.speed; this.renderControls(); }));
      el.querySelectorAll('.gc-tabs [data-tab]').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderBody(true); }));
      const sc = el.querySelector('#gcScoring');
      if (sc) sc.addEventListener('change', () => { this.filter = sc.checked ? 'scoring' : 'all'; this.renderBody(true); });
      const tl = el.querySelector('#gcTimeline');
      tl.addEventListener('click', e => {
        const r = tl.getBoundingClientRect();
        const t = ((e.clientX - r.left) / r.width) * this.game.total;
        let idx = this.game.events.findIndex(ev => ev.t > t);
        if (idx < 0) idx = this.game.events.length;
        this.seek(Math.max(1, idx));
      });
    },

    onKey(e) {
      if (!this.game) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === ' ' && !/INPUT|BUTTON|SELECT/.test((e.target && e.target.tagName) || '')) { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowRight') { this.seek(Math.min(this.game.events.length, this.k + 10)); }
    },

    // ---------- playback ----------
    toggle() { if (this.playing) this.pause(); else this.play(); },
    play() {
      if (!this.game) return;
      if (this.k >= this.game.events.length) this.k = 0;
      this.hideOverlay();
      this.playing = true;
      this.renderControls();
      this.step();
    },
    pause() { this.playing = false; clearTimeout(this.timer); this.renderControls(); },
    restart() { this.pause(); this.k = 0; this.revealed = new Set(); this.renderAll(); this.play(); },
    step() {
      clearTimeout(this.timer);
      if (!this.playing || !this.game) return;
      if (this.k >= this.game.events.length) { this.playing = false; this.renderControls(); this.showFinal(true); return; }
      const e = this.game.events[this.k];
      this.k++;
      this.advance(e);
      const sp = SPEEDS.find(s => s.key === this.speed) || SPEEDS[0];
      let ms = (PACE[e.type] || 600) * sp.ms;
      if (e.tags.includes('run') || e.tags.includes('lead-change')) ms += 400 * sp.ms;
      if (e.type === 'make' && e.three) ms += 250 * sp.ms;
      // Crunch time slows down.
      if (e.period >= 1 && e.clock < 120 && Math.abs(e.h - e.a) <= 6) ms *= 1.35;
      this.timer = setTimeout(() => this.step(), Math.max(25, ms));
    },
    seek(k) {
      this.k = Math.max(0, Math.min(this.game.events.length, k));
      this.renderAll();
      if (this.k >= this.game.events.length) { this.pause(); this.showFinal(true); }
    },

    // One event: update everything that changed.
    advance(e) {
      this.renderScore(e, true);
      this.renderLast(e);
      if (this.tab === 'pbp') this.prependPlay(e);
      else if (this.tab === 'box' && (e.type !== 'timeout')) this.renderBody(false);
      else if (this.tab === 'team' && ['make', 'miss', 'ft', 'reb', 'tov'].includes(e.type)) this.renderBody(false);
      if (e.type === 'make' || e.type === 'ft' || e.type === 'end' || e.type === 'final') this.renderLeaders();
      this.renderWp();
      this.renderTicker();
    },

    // ---------- rendering ----------
    renderAll() {
      const e = this.game.events[this.k - 1] || null;
      this.renderScore(e, false);
      this.renderLast(e);
      this.renderBody(true);
      this.renderLeaders();
      this.renderWp();
      this.renderTicker();
      this.renderControls();
    },
    renderControls() {
      if (!this.el) return;
      const play = this.el.querySelector(".gc-playbtn");
      if (play) { play.innerHTML = this.playing ? '&#10074;&#10074;' : '&#9654;'; play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play'); }
      this.el.querySelectorAll('.gc-speed').forEach(b => b.classList.toggle('active', +b.dataset.speed === this.speed));
      this.el.querySelectorAll('.gc-tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === this.tab));
    },
    renderScore(e, animate) {
      const g = this.game;
      const h = e ? e.h : 0, a = e ? e.a : 0;
      const hEl = this.el.querySelector('#gcHome'), aEl = this.el.querySelector('#gcAway');
      const bump = (el, v) => {
        if (el.textContent !== String(v)) {
          el.textContent = v;
          if (animate && !this.reduced()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
        }
      };
      bump(hEl, h); bump(aEl, a);
      const done = this.k >= g.events.length;
      hEl.classList.toggle('lead', h > a); aEl.classList.toggle('lead', a > h);
      hEl.classList.toggle('won', done && h > a); aEl.classList.toggle('won', done && a > h);
      const per = e ? g.periods[e.period] : g.periods[0];
      this.el.querySelector('#gcPeriod').textContent = done ? (g.ot ? 'Final/OT' : 'Final') : e && e.type === 'end' && e.period === 0 ? 'Half' : per.short;
      this.el.querySelector('#gcClock').textContent = done ? '' : fmtClock(e ? e.clock : per.len);
      const st = this.el.querySelector('#gcStatus');
      st.innerHTML = done ? '' : this.playing || this.k > 0 ? '<span class="gc-live">Live</span>' : '<span class="gc-pre">Tip-off</span>';
      const tf = this.el.querySelector('#gcTimeFill');
      if (tf) tf.style.width = `${Math.min(100, ((e ? e.t : 0) / g.total) * 100)}%`;
      const wp = e ? e.wp : g.pregameWp;
      const fill = this.el.querySelector('#gcWpFill');
      if (fill) { fill.style.width = `${(1 - wp) * 100}%`; }
    },
    renderLast(e) {
      const box = this.el.querySelector('#gcLast');
      if (!e) { box.innerHTML = `<span class="gc-last-text">${esc(this.game.meta.away.school)} at ${esc(this.game.meta.home.school)} — ${this.pregameLine()}</span>`; box.className = 'gc-lastplay'; return; }
      const big = e.tags.some(t => ['three', 'dunk', 'and1', 'run', 'lead-change', 'buzzer', 'winner', 'milestone', 'overtime'].includes(t)) || e.type === 'end' || e.type === 'final';
      const side = e.side ? `<img src="${this.logo(this.game.meta[e.side].school)}" alt="" class="gc-last-logo">` : '';
      const badge = e.tags.includes('buzzer') ? 'Buzzer-beater' : e.tags.includes('winner') ? 'Go-ahead' : e.tags.includes('run') ? 'Run' : e.tags.includes('lead-change') ? 'Lead change' : e.tags.includes('and1') ? 'And-one' : e.tags.includes('dunk') ? 'Slam' : e.type === 'make' && e.three ? 'Three' : '';
      box.className = `gc-lastplay ${big ? 'big' : ''} ${e.side || ''}`;
      box.innerHTML = `${side}${badge ? `<span class="gc-badge">${badge}</span>` : ''}<span class="gc-last-text">${esc(e.text)}</span>`;
      if (big && !this.reduced()) { box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }
    },
    pregameLine() {
      const m = this.game.meta;
      const s = m.spread;
      if (Math.abs(s) < 0.5) return 'a pick\'em';
      return `${esc(s > 0 ? m.home.school : m.away.school)} favored by ${Math.abs(s).toFixed(1)}`;
    },

    playRow(e) {
      const g = this.game;
      if (e.silent) return '';
      const scoring = e.type === 'make' || (e.type === 'ft' && e.made);
      const logo = e.side ? `<img src="${this.logo(g.meta[e.side].school)}" alt="" class="gc-play-logo">` : '<span class="gc-play-logo"></span>';
      const cls = ['gc-play', scoring ? 'scoring' : '', e.type === 'timeout' || e.type === 'end' || e.type === 'final' || e.type === 'tip' || e.type === 'start' ? 'meta' : '', e.tags.includes('run') || e.tags.includes('buzzer') || e.tags.includes('winner') ? 'hot' : ''].join(' ');
      return `<li class="${cls}" data-i="${e.i}"><span class="gc-play-clock">${e.type === 'end' || e.type === 'final' ? '' : fmtClock(e.clock)}</span>${logo}
        <span class="gc-play-text">${this.linkify(e)}</span><span class="gc-play-score">${scoring ? `${e.a}-${e.h}` : ''}</span></li>`;
    },
    linkify(e) { return esc(e.text); },

    renderBody(full) {
      const body = this.el.querySelector('#gcBody');
      this.el.querySelectorAll('.gc-tabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === this.tab));
      const filt = this.el.querySelector('.gc-filter');
      if (filt) filt.style.visibility = this.tab === 'pbp' ? 'visible' : 'hidden';
      if (this.tab === 'pbp') {
        const g = this.game;
        const shown = g.events.slice(0, this.k).filter(e => this.filter === 'all' || e.type === 'make' || (e.type === 'ft' && e.made) || e.type === 'end' || e.type === 'final');
        // Newest first, grouped by period.
        let html = '', per = -1;
        shown.slice().reverse().forEach(e => {
          if (e.period !== per) { per = e.period; html += `<li class="gc-period-head">${esc(g.periods[per].label)}</li>`; }
          html += this.playRow(e);
        });
        body.innerHTML = `<ol class="gc-plays">${html || '<li class="gc-empty">The game is about to tip off.</li>'}</ol>`;
      } else if (this.tab === 'box') {
        body.innerHTML = this.boxHtml();
      } else {
        body.innerHTML = this.teamStatsHtml();
      }
    },
    prependPlay(e) {
      if (this.filter === 'scoring' && !(e.type === 'make' || (e.type === 'ft' && e.made) || e.type === 'end' || e.type === 'final')) return;
      const list = this.el.querySelector('.gc-plays');
      if (!list) return;
      const empty = list.querySelector('.gc-empty');
      if (empty) empty.remove();
      const head = list.querySelector('.gc-period-head');
      const html = this.playRow(e);
      if (!html) return;
      const tmp = document.createElement('ol');
      tmp.innerHTML = html;
      const row = tmp.firstElementChild;
      if (!head || head.textContent !== this.game.periods[e.period].label) {
        const h = document.createElement('li');
        h.className = 'gc-period-head';
        h.textContent = this.game.periods[e.period].label;
        list.insertBefore(h, list.firstChild);
        list.insertBefore(row, h.nextSibling);
      } else {
        list.insertBefore(row, head.nextSibling);
      }
      row.classList.add('new');
      // Keep the live list light.
      const rows = list.querySelectorAll('.gc-play');
      if (rows.length > 160) rows[rows.length - 1].remove();
    },

    liveBox() { return LiveCore.boxAt(this.game, this.k); },
    boxHtml() {
      const g = this.game;
      const box = this.liveBox();
      const done = this.k >= g.events.length;
      const frac = done ? 1 : Math.min(1, ((g.events[this.k - 1] || { t: 0 }).t) / g.total);
      const side = s => {
        const lines = g.lines[s].slice().sort((x, y) => (y.starter - x.starter) || (y.min - x.min));
        const tot = { pts: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0, oreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
        const rows = lines.map((p, i) => {
          const b = box[s][p.id];
          Object.keys(tot).forEach(k => { tot[k] += b[k]; });
          const min = Math.round(p.min * frac);
          const dnp = !p.min;
          return `<tr class="${i === 5 ? 'gc-bench-start' : ''} ${dnp ? 'gc-dnp' : ''}">
            <td class="gc-box-name"><span class="clickable-player" onclick="GameCenter.player('${esc(p.id).replace(/'/g, "\\'")}')">${esc(p.name)}</span> <small>${esc(p.pos)}${p.starter ? '' : ''}</small></td>
            ${dnp ? '<td colspan="11" class="gc-dnp-cell">Did not play</td>' : `<td>${min}</td><td class="gc-pts">${b.pts}</td><td>${b.reb}</td><td>${b.ast}</td><td>${b.stl}</td><td>${b.blk}</td><td>${b.tov}</td>
            <td>${b.fgm}-${b.fga}</td><td>${b.threePm}-${b.threePa}</td><td>${b.ftm}-${b.fta}</td><td>${b.pf}</td>`}</tr>`;
        }).join('');
        return `<div class="gc-box-team"><div class="gc-box-head"><img src="${this.logo(g.meta[s].school)}" alt="" class="gc-play-logo"><b>${esc(g.meta[s].school)}</b></div>
          <div class="table-scroll"><table class="data-table gc-box">
          <thead><tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3PT</th><th>FT</th><th>PF</th></tr></thead>
          <tbody>${rows}<tr class="gc-total"><td>Team</td><td></td><td class="gc-pts">${tot.pts}</td><td>${tot.reb}</td><td>${tot.ast}</td><td>${tot.stl}</td><td>${tot.blk}</td><td>${tot.tov}</td>
          <td>${tot.fgm}-${tot.fga}<small>${pctText(tot.fgm, tot.fga)}</small></td><td>${tot.threePm}-${tot.threePa}<small>${pctText(tot.threePm, tot.threePa)}</small></td><td>${tot.ftm}-${tot.fta}<small>${pctText(tot.ftm, tot.fta)}</small></td><td>${tot.pf}</td></tr></tbody></table></div></div>`;
      };
      return side('away') + side('home');
    },
    teamTotals() {
      const g = this.game, box = this.liveBox();
      const out = {};
      ['home', 'away'].forEach(s => {
        const t = { pts: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0, oreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, bench: 0 };
        g.lines[s].forEach(p => { const b = box[s][p.id]; Object.keys(b).forEach(k => { t[k] += b[k]; }); if (!p.starter) t.bench += b.pts; });
        out[s] = t;
      });
      // Largest lead so far.
      let lh = 0, la = 0, lc = 0, prev = 0;
      g.events.slice(0, this.k).forEach(e => { const m = e.h - e.a; lh = Math.max(lh, m); la = Math.max(la, -m); if (prev !== 0 && m !== 0 && Math.sign(m) !== Math.sign(prev)) lc++; if (m !== 0) prev = m; });
      out.home.lead = lh; out.away.lead = la; out.leadChanges = lc;
      // Points off turnovers and second chances are hard to attribute
      // cleanly; bench scoring and the rest come straight from the box.
      return out;
    },
    teamStatsHtml() {
      const t = this.teamTotals();
      const row = (label, a, h, fmt = x => x, higherBetter = true) => {
        const av = typeof a === 'number' ? a : 0, hv = typeof h === 'number' ? h : 0;
        const total = av + hv || 1;
        const aw = (av / total) * 100;
        const aBetter = higherBetter ? av > hv : av < hv, hBetter = higherBetter ? hv > av : hv < av;
        return `<div class="gc-stat"><span class="gc-stat-a ${aBetter ? 'best' : ''}">${fmt(a)}</span><span class="gc-stat-label">${label}</span><span class="gc-stat-h ${hBetter ? 'best' : ''}">${fmt(h)}</span>
          <div class="gc-stat-bar"><i class="a" style="width:${aw}%"></i><i class="h" style="width:${100 - aw}%"></i></div></div>`;
      };
      const f = x => (x * 100).toFixed(1) + '%';
      const A = t.away, H = t.home;
      const g = this.game;
      return `<div class="gc-stats">
        <div class="gc-stats-head"><span><img src="${this.logo(g.meta.away.school)}" alt="" class="gc-play-logo">${esc(g.meta.away.school)}</span><span>${esc(g.meta.home.school)}<img src="${this.logo(g.meta.home.school)}" alt="" class="gc-play-logo"></span></div>
        ${row('Field goals', pct(A.fgm, A.fga), pct(H.fgm, H.fga), f)}
        ${row('Three-pointers', pct(A.threePm, A.threePa), pct(H.threePm, H.threePa), f)}
        ${row('Free throws', pct(A.ftm, A.fta), pct(H.ftm, H.fta), f)}
        ${row('Rebounds', A.reb, H.reb)}
        ${row('Offensive rebounds', A.oreb, H.oreb)}
        ${row('Assists', A.ast, H.ast)}
        ${row('Steals', A.stl, H.stl)}
        ${row('Blocks', A.blk, H.blk)}
        ${row('Turnovers', A.tov, H.tov, x => x, false)}
        ${row('Fouls', A.pf, H.pf, x => x, false)}
        ${row('Bench points', A.bench, H.bench)}
        ${row('Largest lead', A.lead, H.lead)}
        <p class="gc-stats-note">${t.leadChanges} lead change${t.leadChanges === 1 ? '' : 's'}</p>
      </div>`;
    },

    renderLeaders() {
      const el = this.el.querySelector('#gcLeaders');
      if (!el) return;
      const g = this.game, box = this.liveBox();
      const best = (s, k) => g.lines[s].map(p => ({ p, v: box[s][p.id][k] })).sort((x, y) => y.v - x.v)[0];
      const row = (label, k) => {
        const a = best('away', k), h = best('home', k);
        const cell = (x, s) => x && x.v > 0 ? `<span class="gc-leader ${s}"><b>${x.v}</b><span>${esc(LiveCore.lastName(x.p.name))}</span></span>` : `<span class="gc-leader ${s}"><b>0</b><span>—</span></span>`;
        return `<div class="gc-leader-row">${cell(a, 'away')}<span class="gc-leader-label">${label}</span>${cell(h, 'home')}</div>`;
      };
      el.innerHTML = row('Points', 'pts') + row('Rebounds', 'reb') + row('Assists', 'ast');
    },

    renderWp() {
      const el = this.el.querySelector('#gcWp');
      if (!el) return;
      const g = this.game;
      const W = 320, H = 120;
      const pts = [[0, g.pregameWp]].concat(g.events.slice(0, this.k).map(e => [e.t, e.wp]));
      const x = t => (t / g.total) * W;
      const y = p => (1 - p) * H;
      const line = pts.map(([t, p], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join('');
      const area = line + ` L${x(pts[pts.length - 1][0]).toFixed(1)},${H / 2} L0,${H / 2} Z`;
      const halves = g.periods.slice(1).map((p, i) => { const tt = g.periods.slice(0, i + 1).reduce((a, q) => a + q.len, 0); return `<line x1="${x(tt)}" x2="${x(tt)}" y1="0" y2="${H}" class="gc-wp-half"/>`; }).join('');
      const cur = pts[pts.length - 1][1];
      el.innerHTML = `<div class="gc-wp-wrap"><svg viewBox="0 0 ${W} ${H}" class="gc-wp-svg" preserveAspectRatio="none" role="img" aria-label="Win probability chart">
        <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="gc-wp-mid"/>${halves}
        <path d="${area}" class="gc-wp-area"/>
        <path d="${line}" class="gc-wp-line"/>
      </svg><span class="gc-wp-tag top"><img src="${this.logo(g.meta.home.school)}" alt="" class="gc-play-logo">${esc(g.meta.home.school)}</span>
      <span class="gc-wp-tag bottom"><img src="${this.logo(g.meta.away.school)}" alt="" class="gc-play-logo">${esc(g.meta.away.school)}</span></div>`;
      const lead = cur >= 0.5 ? 'home' : 'away';
      const p = Math.round((lead === 'home' ? cur : 1 - cur) * 100);
      const txt = this.el.querySelector('#gcWpText');
      if (txt) txt.innerHTML = `<b>${p >= 100 ? '>99' : p}%</b> ${esc(g.meta[lead].school)}`;
    },

    renderTicker() {
      const el = this.el.querySelector('#gcTicker');
      if (!el) return;
      const g = this.game;
      const frac = this.k >= g.events.length ? 1 : ((g.events[this.k - 1] || { t: 0 }).t / g.total);
      const list = this.opts.ticker || [];
      const shown = list.filter(r => r.at <= frac);
      const fresh = shown.filter(r => !this.revealed.has(r.key));
      fresh.forEach(r => this.revealed.add(r.key));
      const rank = (r, s) => (r[s + 'Rank'] ? `<span class="gc-rank">${r[s + 'Rank']}</span>` : '');
      const row = r => {
        const aw = r.awayScore > r.homeScore;
        return `<li class="${fresh.includes(r) ? 'new' : ''}" onclick="GameCenter.openOther('${esc(r.key)}')">
          <span class="gc-tk-final">${r.ot ? 'F/OT' : 'Final'}</span>
          <span class="gc-tk-team ${aw ? 'won' : ''}"><img src="${this.logo(r.away)}" alt="" class="gc-play-logo">${rank(r, 'away')}${esc(r.away)}<b>${r.awayScore}</b></span>
          <span class="gc-tk-team ${aw ? '' : 'won'}"><img src="${this.logo(r.home)}" alt="" class="gc-play-logo">${rank(r, 'home')}${esc(r.home)}<b>${r.homeScore}</b></span></li>`;
      };
      const pending = list.length - shown.length;
      el.innerHTML = `<ul>${shown.slice().reverse().map(row).join('')}</ul>${pending ? `<p class="gc-tk-pending">${pending} game${pending === 1 ? '' : 's'} still going</p>` : ''}`;
    },

    // ---------- overlays ----------
    showIntro() {
      const g = this.game, m = g.meta;
      const ov = this.el.querySelector('#gcOverlay');
      const side = s => `<div class="gc-intro-team"><img src="${this.logo(m[s].school)}" alt="">
        <b>${m[s].seed ? `<span class="gc-seed">${m[s].seed}</span>` : m[s].rank ? `<span class="gc-rank">${m[s].rank}</span>` : ''}${esc(m[s].school)}</b><small>${esc(m[s].record || '')}</small></div>`;
      ov.innerHTML = `<div class="gc-intro">
        <div class="gc-intro-label">${esc(m.label || '')}</div>
        <div class="gc-intro-teams">${side('away')}<span class="gc-intro-at">${m.neutral ? 'vs' : 'at'}</span>${side('home')}</div>
        <div class="gc-intro-line">${this.pregameLine()}</div>
        <div class="gc-intro-actions">
          <button class="sim-btn sim-main" type="button" onclick="GameCenter.play()">&#9654; Tip-off</button>
          <button class="sim-btn sim-btn-secondary" type="button" onclick="GameCenter.seek(GameCenter.game.events.length)">Skip to the final</button>
        </div>
      </div>`;
      ov.hidden = false;
    },
    hideOverlay() { const ov = this.el && this.el.querySelector('#gcOverlay'); if (ov) ov.hidden = true; },
    showFinal(animate) {
      const g = this.game, m = g.meta;
      const ov = this.el.querySelector('#gcOverlay');
      const homeWon = m.homeScore > m.awayScore;
      const w = homeWon ? 'home' : 'away';
      const moments = (g.moments || []).map(i => g.events[i]).filter(Boolean).slice(-5);
      ov.innerHTML = `<div class="gc-final ${animate ? 'in' : ''}">
        <div class="gc-final-kicker">${g.ot ? 'Final / OT' : 'Final'} · ${esc(m.label || '')}</div>
        <div class="gc-final-score">
          <span class="${homeWon ? '' : 'won'}"><img src="${this.logo(m.away.school)}" alt="">${esc(m.away.school)} <b>${m.awayScore}</b></span>
          <span class="${homeWon ? 'won' : ''}"><img src="${this.logo(m.home.school)}" alt="">${esc(m.home.school)} <b>${m.homeScore}</b></span>
        </div>
        <h2 class="gc-final-head">${esc(g.headline)}</h2>
        ${m.note ? `<p class="gc-final-note">${esc(m.note)}</p>` : ''}
        ${g.pog ? `<div class="gc-pog" onclick="GameCenter.player('${esc(g.pog.id).replace(/'/g, "\\'")}')"><img src="${this.logo(m[g.pog.side].school)}" alt=""><div><span>Player of the Game</span><b>${esc(g.pog.name)}</b><small>${esc(g.pog.line)}</small></div></div>` : ''}
        ${moments.length ? `<div class="gc-moments"><span>How it happened</span><ul>${moments.map(e => `<li><b>${g.periods[e.period].short} ${e.type === 'end' ? '0:00' : fmtClock(e.clock)}</b>${esc(e.text)}</li>`).join('')}</ul></div>` : ''}
        <div class="gc-final-actions">
          <button class="sim-btn sim-main" type="button" onclick="GameCenter.showTab('box')">Box score</button>
          <button class="sim-btn sim-btn-secondary" type="button" onclick="GameCenter.restart()">&#8634; Watch from the tip</button>
          <button class="sim-btn sim-btn-secondary" type="button" onclick="GameCenter.close()">Done</button>
        </div>
      </div>`;
      ov.hidden = false;
      if (animate && !this.reduced() && window.Cutscene && Cutscene.confetti && (g.meta.big >= 1 && g.meta.round === 5)) {
        const c = document.createElement('div');
        c.innerHTML = Cutscene.confetti(60);
        ov.appendChild(c.firstElementChild);
      }
    },
    showTab(tab) { this.hideOverlay(); this.tab = tab; this.renderBody(true); },

    // ---------- links out ----------
    player(id) {
      if (!window.SimEngine) return;
      this.pause();
      SimEngine.openPlayerModal(id);
    },
    teamPage(school) {
      if (!window.SimEngine) return;
      this.close();
      SimEngine.goToTeamPage(school);
    },
    openOther(key) {
      const r = (this.opts.ticker || []).find(x => x.key === key);
      if (!r || !window.SimEngine) return;
      const onClose = this.opts.onClose;
      this.opts.onClose = null;
      this.close(true);
      SimEngine.openGame(r.ref, { mode: 'final', onClose });
    },

    // ---------- team colours, read from the logos ----------
    pickColors() {
      const m = this.game.meta;
      ['home', 'away'].forEach(s => {
        const school = m[s].school;
        const apply = c => {
          this.colors[s] = c;
          if (this.el) this.el.style.setProperty(`--gc-${s}`, c);
          this.fixContrast();
        };
        if (m[s].color) { apply(m[s].color); return; }          // a team with set colours (all-star games)
        if (this._colorCache[school]) { apply(this._colorCache[school]); return; }
        this.colorFromLogo(this.logo(school)).then(c => { if (c) { this._colorCache[school] = c; apply(c); } }).catch(() => {});
      });
    },
    // If both teams read as the same colour, the road team wears white.
    fixContrast() {
      const a = this.hexRgb(this.colors.away), h = this.hexRgb(this.colors.home);
      if (!a || !h || !this.el) return;
      const d = Math.abs(a[0] - h[0]) + Math.abs(a[1] - h[1]) + Math.abs(a[2] - h[2]);
      if (d < 90) this.el.style.setProperty('--gc-away', '#e8ecf2');
    },
    rgbHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0; const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
      }
      return [h, s, l];
    },
    hslHex(h, s, l) {
      const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    },
    hexRgb(c) { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
    colorFromLogo(src) {
      return new Promise(resolve => {
        if (!src || typeof Image === 'undefined') return resolve(null);
        const img = new Image();
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = c.height = 32;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 32, 32);
            const d = ctx.getImageData(0, 0, 32, 32).data;
            const buckets = {};
            for (let i = 0; i < d.length; i += 4) {
              const [r, g, b, al] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
              if (al < 200) continue;
              const max = Math.max(r, g, b), min = Math.min(r, g, b);
              const sat = max ? (max - min) / max : 0;
              if (max < 40 || (sat < 0.25 && max > 200)) continue;        // skip black outlines and white fills
              const key = [r >> 5, g >> 5, b >> 5].join(',');
              const w = 1 + sat * 2;
              const bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
              bk.n += w; bk.r += r * w; bk.g += g * w; bk.b += b * w;
            }
            const best = Object.values(buckets).sort((x, y) => y.n - x.n)[0];
            if (!best) return resolve(null);
            const [r, g, b] = [best.r / best.n, best.g / best.n, best.b / best.n];
            // Keep the hue, but settle saturation and lightness so every
            // team's colour reads on a dark page without glaring.
            const [hh, ss, ll] = this.rgbHsl(r, g, b);
            const hex = this.hslHex(hh, Math.min(0.72, ss), Math.max(0.4, Math.min(0.6, ll)));
            resolve(hex);
          } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }
  };

  window.GameCenter = GC;
})();
