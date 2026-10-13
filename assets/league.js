// BYTHERIM League (beta): admin-only planning page (league.html).
// Season details, teams with a live jersey preview, and a launch
// checklist. Everything is one document, league/main, which the database
// rules let only admins read or write. Changes save on their own a
// moment after you stop typing.
(function (root) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const HEX = /^#[0-9a-f]{6}$/i;

  const CONFS = [['PDX', 'Portland'], ['MWV', 'Willamette Valley'], ['907', 'Alaska'], ['SEA', 'Seattle'], ['EUG', 'Eugene'], ['TAC', 'Tacoma']];
  const STATUSES = [['planning', 'Planning'], ['registration', 'Registration open'], ['season', 'In season'], ['offseason', 'Offseason']];
  const GROUPS = ['Venue', 'Teams', 'Money', 'Gear', 'Game day', 'Legal'];

  const DEFAULT_CHECKLIST = [
    ['Venue', 'Confirm gym rental at the Beaverton YMCA (days, times, cost)'],
    ['Venue', 'Lock the season dates and a backup date for makeups'],
    ['Teams', 'Write the league rules (roster size, game length, fouls, forfeits)'],
    ['Teams', 'Set up team sign-up (form or DMs) and a registration deadline'],
    ['Money', 'Set the team fee and what it covers (gym, refs, jerseys, trophy)'],
    ['Money', 'Pick how teams pay (Venmo, Cash App, etc.)'],
    ['Money', 'Reach out to local sponsors'],
    ['Gear', 'Pick the jersey vendor and the order cutoff date'],
    ['Gear', 'Order the conference patches'],
    ['Gear', 'Order the trophy'],
    ['Game day', 'Book refs and a scorekeeper'],
    ['Game day', 'Build the schedule'],
    ['Legal', 'Player waiver (liability and photo release)'],
    ['Legal', 'Check event insurance with the YMCA']
  ];

  function blank() {
    return {
      season: { name: 'Season 1', status: 'planning', venue: 'Beaverton YMCA', city: 'Beaverton, OR', conf: 'PDX', start: '', regClose: '', targetTeams: 8, fee: 0, rosterMin: 5, rosterMax: 8, notes: '' },
      teams: [],
      checklist: DEFAULT_CHECKLIST.map(([group, text]) => ({ id: uid(), group, text, done: false, due: '' }))
    };
  }
  function normalize(d) {
    const b = blank();
    d = d || {};
    return {
      season: Object.assign({}, b.season, d.season || {}),
      teams: Array.isArray(d.teams) ? d.teams : [],
      checklist: Array.isArray(d.checklist) ? d.checklist : b.checklist
    };
  }

  // ---------------------------------------------------------------- jersey preview
  // The conference patches are SVG templates with three stand-in colors:
  // #00AA01 patch background, #00AA02 artwork, #00AA03 accent.
  const patchSrc = {};
  function loadPatch(code) {
    if (patchSrc[code] !== undefined) return Promise.resolve(patchSrc[code]);
    patchSrc[code] = null;
    if (typeof fetch === 'undefined') return Promise.resolve(null);
    return fetch(`assets/league/patches/${code.toLowerCase()}.svg`).then(r => r.ok ? r.text() : null).then(t => {
      patchSrc[code] = t ? t.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') : null;
      return patchSrc[code];
    }).catch(() => null);
  }
  function patchSVG(code, bg, fg, acc, size, x, y) {
    const inner = patchSrc[code];
    if (!inner) return `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${bg}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="'Exo 2',sans-serif" font-style="italic" font-weight="800" font-size="${size / 3.4}" fill="${fg}">${esc(code)}</text>`;
    const s = inner.split('#00AA01').join(bg).split('#00AA02').join(fg).split('#00AA03').join(acc);
    return `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 400 400">${s}</svg>`;
  }
  const BODY = 'M78 6 L112 6 Q150 66 188 6 L222 6 Q222 70 258 110 L258 372 L42 372 L42 110 Q78 70 78 6 Z';
  function nameLines(name) {
    const n = String(name || 'TEAM NAME').toUpperCase().trim();
    if (n.length > 9 && n.includes(' ')) {
      const words = n.split(/\s+/);
      let best = [n, ''], diff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        if (Math.abs(a.length - b.length) < diff) { diff = Math.abs(a.length - b.length); best = [a, b]; }
      }
      return best;
    }
    return [n];
  }
  function jerseySVG(team, home, width = 220) {
    const p = HEX.test(team.primary) ? team.primary : '#181F40';
    const s = HEX.test(team.secondary) ? team.secondary : '#FFFFFF';
    const bg = home ? p : s, fg = home ? s : p;
    const lines = nameLines(team.name);
    const longest = Math.max(...lines.map(l => l.length));
    const fs = Math.min(lines.length > 1 ? 32 : 38, 250 / Math.max(longest, 1));
    const fit = longest * fs * 0.72 > 170 ? ' textLength="170" lengthAdjust="spacingAndGlyphs"' : '';
    const top = lines.length > 1 ? 128 : 136;
    const text = lines.map((l, i) => `<text x="150" y="${top + i * fs * 1.08}" text-anchor="middle"${fit} font-family="'Exo 2',sans-serif" font-style="italic" font-weight="800" font-size="${fs.toFixed(1)}" letter-spacing="1.5" fill="${fg}">${esc(l)}</text>`).join('');
    const num = String(team.previewNumber || '23').slice(0, 2);
    return `<svg class="lg-jersey" viewBox="0 0 300 380" width="${width}" height="${Math.round(width * 380 / 300)}" role="img" aria-label="${esc(team.name || 'Team')} ${home ? 'home' : 'away'} jersey">
      <path d="${BODY}" fill="${bg}" stroke="rgba(127,127,127,.45)" stroke-width="1.5"/>
      <path d="M42 110 Q78 70 78 6 M222 6 Q222 70 258 110 M112 6 Q150 66 188 6" fill="none" stroke="${fg}" stroke-width="7"/>
      <path d="M42 128 L58 128 L62 372 L42 372Z M258 128 L242 128 L238 372 L258 372Z" fill="${fg}"/>
      <rect x="42" y="352" width="216" height="8" fill="${fg}"/>
      ${text}
      <text x="150" y="${lines.length > 1 ? 318 : 312}" text-anchor="middle" font-family="'Exo 2',sans-serif" font-style="italic" font-weight="800" font-size="118" fill="${fg}">${esc(num)}</text>
      ${patchSVG(team.conf || 'PDX', fg, bg, bg, 40, 210, 80)}
    </svg>`;
  }

  // ---------------------------------------------------------------- page
  const League = {
    data: null, tab: 'overview', editing: null, el: null, saving: null, timer: null, lastSaved: 0, saveError: '',

    async load() {
      let d = null;
      try { d = root.Cloud && root.Cloud.getLeague ? await root.Cloud.getLeague() : null; }
      catch (e) { this.saveError = explain(e); }
      this.data = normalize(d);
      if (d && d.updatedAt) this.lastSaved = d.updatedAt;
      await Promise.all(CONFS.map(([c]) => loadPatch(c)));
    },

    setTab(t) {
      this.tab = t;
      document.querySelectorAll('#lgTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
      this.render();
    },

    render() {
      if (!this.el) return;
      const tabs = document.getElementById('lgTabs');
      if (tabs) tabs.hidden = false;
      this.el.innerHTML = this.tab === 'teams' ? this.teamsHTML() : this.tab === 'checklist' ? this.checklistHTML() : this.overviewHTML();
      this.showSave();
    },

    // ---------- overview
    stats() {
      const d = this.data, s = d.season;
      const players = d.teams.reduce((n, t) => n + (t.players || []).length, 0);
      const paid = d.teams.filter(t => t.paid).length;
      const done = d.checklist.filter(c => c.done).length;
      return { teams: d.teams.length, target: +s.targetTeams || 0, players, paid, fees: paid * (+s.fee || 0), owed: (d.teams.length - paid) * (+s.fee || 0), done, items: d.checklist.length };
    },
    cardsHTML() {
      const st = this.stats();
      const money = n => '$' + Number(n || 0).toLocaleString('en-US');
      return `<div class="adm-cards" id="lgCards">
        <div class="adm-card"><span class="adm-card-label">Teams</span><b>${st.teams}${st.target ? ` / ${st.target}` : ''}</b><small>${st.target ? `${Math.max(st.target - st.teams, 0)} to go` : 'No target set'}</small></div>
        <div class="adm-card"><span class="adm-card-label">Players</span><b>${st.players}</b><small>across all rosters</small></div>
        <div class="adm-card"><span class="adm-card-label">Fees collected</span><b>${money(st.fees)}</b><small>${st.paid} of ${st.teams} teams paid${st.owed ? ` · ${money(st.owed)} still owed` : ''}</small></div>
        <div class="adm-card"><span class="adm-card-label">Checklist</span><b>${st.done} / ${st.items}</b><small>${st.items ? Math.round(st.done / st.items * 100) : 0}% done</small></div>
      </div>`;
    },
    overviewHTML() {
      const s = this.data.season;
      const f = (key, label, type = 'text', extra = '') => `<label class="site-field"><span>${label}</span><input type="${type}" data-season="${key}" value="${esc(s[key])}" ${extra}></label>`;
      const next = this.data.checklist.filter(c => !c.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 5);
      return `${this.cardsHTML()}
      <div class="lg-grid">
        <div class="card lg-panel">
          <h2>Season</h2>
          <div class="lg-fields">
            ${f('name', 'Season name')}
            <label class="site-field"><span>Status</span><select data-season="status">${STATUSES.map(([v, l]) => `<option value="${v}"${s.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${f('venue', 'Gym')}
            ${f('city', 'City')}
            <label class="site-field"><span>Conference</span><select data-season="conf">${CONFS.map(([c, n]) => `<option value="${c}"${s.conf === c ? ' selected' : ''}>${c} · ${n}</option>`).join('')}</select></label>
            ${f('start', 'First games', 'date')}
            ${f('regClose', 'Registration closes', 'date')}
            ${f('targetTeams', 'Target teams', 'number', 'min="0" max="64"')}
            ${f('fee', 'Team fee ($)', 'number', 'min="0" step="5"')}
            ${f('rosterMin', 'Roster min', 'number', 'min="1" max="20"')}
            ${f('rosterMax', 'Roster max', 'number', 'min="1" max="20"')}
          </div>
          <label class="site-field lg-wide"><span>Notes</span><textarea rows="4" data-season="notes" placeholder="Anything to remember: gym contacts, sponsor leads, rules ideas…">${esc(s.notes)}</textarea></label>
        </div>
        <div class="card lg-panel">
          <h2>Up next</h2>
          ${next.length ? `<ul class="lg-next">${next.map(c => `<li><span class="lg-chip">${esc(c.group)}</span>${esc(c.text)}${c.due ? `<small>${esc(fmtDay(c.due))}</small>` : ''}</li>`).join('')}</ul>` : '<p class="adm-note">Everything on the checklist is done.</p>'}
          <button type="button" class="sim-btn sim-btn-secondary btn-sm" data-go="checklist">Open the checklist</button>
          <h2 class="lg-h2-gap">Conferences</h2>
          <div class="lg-confs">${CONFS.map(([c, n]) => `<div class="lg-conf${s.conf === c ? ' on' : ''}"><svg viewBox="0 0 400 400" width="56" height="56">${(patchSrc[c] || '').split('#00AA01').join('#181F40').split('#00AA02').join('#FFFFFF').split('#00AA03').join('#E3BB4F')}</svg><b>${c}</b><small>${s.conf === c ? 'Launch' : 'Later'}</small></div>`).join('')}</div>
        </div>
      </div>`;
    },

    // ---------- teams
    teamsHTML() {
      const d = this.data;
      const t = this.editing && d.teams.find(x => x.id === this.editing);
      if (t) return this.teamEditorHTML(t);
      const min = +d.season.rosterMin || 0, max = +d.season.rosterMax || 99;
      return `<div class="site-bar lg-bar"><p class="adm-note">${d.teams.length ? `${d.teams.length} team${d.teams.length === 1 ? '' : 's'}. Click one to edit its roster and colors.` : 'No teams yet. Add the first one.'}</p>
        <button type="button" class="sim-btn btn-sm" data-act="add-team">Add team</button></div>
        <div class="lg-teams">${d.teams.map(t => {
          const n = (t.players || []).length;
          const warn = n < min || n > max;
          return `<button type="button" class="lg-team" data-edit="${esc(t.id)}">
            ${jerseySVG(t, true, 120)}
            <span class="lg-team-text"><b>${esc(t.name || 'Unnamed team')}</b>
              <span class="lg-swatches"><i style="background:${esc(t.primary)}"></i><i style="background:${esc(t.secondary)}"></i><small>${esc(t.conf || 'PDX')}</small></span>
              <small>${esc(t.captain || 'No captain yet')}</small>
              <span class="lg-badges"><span class="lg-chip${warn ? ' warn' : ''}">${n} player${n === 1 ? '' : 's'}</span><span class="lg-chip ${t.paid ? 'ok' : 'warn'}">${t.paid ? 'Paid' : 'Not paid'}</span></span>
            </span></button>`;
        }).join('')}</div>`;
    },
    teamEditorHTML(t) {
      const s = this.data.season;
      const f = (key, label, type = 'text', extra = '') => `<label class="site-field"><span>${label}</span><input type="${type}" data-team="${key}" value="${esc(t[key])}" ${extra}></label>`;
      const color = (key, label) => `<label class="site-field"><span>${label}</span><span class="lg-color"><input type="color" data-team="${key}" value="${HEX.test(t[key]) ? esc(t[key]) : '#000000'}" aria-label="${label} picker"><input type="text" data-team="${key}" value="${esc(t[key])}" maxlength="7" spellcheck="false"></span></label>`;
      const players = t.players || [];
      const n = players.length, min = +s.rosterMin || 0, max = +s.rosterMax || 99;
      return `<div class="site-bar lg-bar"><button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="back">← All teams</button>
        <button type="button" class="sim-btn sim-btn-secondary btn-sm lg-danger" data-act="delete-team">Delete team</button></div>
      <div class="lg-editor">
        <div class="card lg-panel">
          <div class="lg-fields">
            ${f('name', 'Team name', 'text', 'maxlength="24"')}
            <label class="site-field"><span>Conference</span><select data-team="conf">${CONFS.map(([c, nm]) => `<option value="${c}"${(t.conf || 'PDX') === c ? ' selected' : ''}>${c} · ${nm}</option>`).join('')}</select></label>
            ${color('primary', 'Primary color')}
            ${color('secondary', 'Secondary color')}
            ${f('captain', 'Captain')}
            ${f('contact', 'Captain phone or email')}
          </div>
          <label class="lg-check"><input type="checkbox" data-team="paid"${t.paid ? ' checked' : ''}> Team fee paid${+s.fee ? ` ($${esc(s.fee)})` : ''}</label>
          <h2 class="lg-h2-gap">Roster <small class="${n < min || n > max ? 'lg-warn-text' : ''}">${n} of ${min}–${max}</small></h2>
          <table class="lg-roster"><thead><tr><th>#</th><th>Player</th><th>Size</th><th></th></tr></thead><tbody>
            ${players.map((p, i) => `<tr>
              <td><input type="text" inputmode="numeric" maxlength="2" data-player="${i}" data-k="number" value="${esc(p.number)}" aria-label="Number"></td>
              <td><input type="text" data-player="${i}" data-k="name" value="${esc(p.name)}" aria-label="Name"></td>
              <td><select data-player="${i}" data-k="size" aria-label="Jersey size">${['', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map(z => `<option${p.size === z ? ' selected' : ''}>${z}</option>`).join('')}</select></td>
              <td><button type="button" class="lg-x" data-act="remove-player" data-i="${i}" aria-label="Remove ${esc(p.name || 'player')}">×</button></td></tr>`).join('')}
          </tbody></table>
          <button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="add-player"${n >= 20 ? ' disabled' : ''}>Add player</button>
          <label class="site-field lg-wide"><span>Notes</span><textarea rows="3" data-team="notes">${esc(t.notes)}</textarea></label>
        </div>
        <div class="card lg-panel lg-preview">
          <h2>Jerseys</h2>
          <div class="lg-jerseys" id="lgJerseys">${this.jerseysHTML(t)}</div>
          <label class="site-field lg-num"><span>Preview number</span><input type="text" maxlength="2" data-team="previewNumber" value="${esc(t.previewNumber || '23')}"></label>
          <p class="adm-note">Home uses the primary color, away flips it. The ${esc(t.conf || 'PDX')} patch takes the team's colors.</p>
        </div>
      </div>`;
    },
    jerseysHTML(t) {
      return `<figure>${jerseySVG(t, true)}<figcaption>Home</figcaption></figure><figure>${jerseySVG(t, false)}<figcaption>Away</figcaption></figure>`;
    },

    // ---------- checklist
    checklistHTML() {
      const items = this.data.checklist;
      const st = this.stats();
      return `<div class="site-bar lg-bar"><p class="adm-note">${st.done} of ${st.items} done.</p></div>
      <div class="lg-progress"><i style="width:${st.items ? st.done / st.items * 100 : 0}%"></i></div>
      ${GROUPS.concat([...new Set(items.map(i => i.group))].filter(g => !GROUPS.includes(g))).map(g => {
        const list = items.filter(i => i.group === g);
        if (!list.length) return '';
        return `<div class="card lg-panel lg-group"><h2>${esc(g)}</h2><ul class="lg-checklist">${list.map(i => `<li class="${i.done ? 'done' : ''}">
          <input type="checkbox" data-item="${esc(i.id)}" data-k="done"${i.done ? ' checked' : ''} aria-label="Done">
          <input type="text" class="lg-item-text" data-item="${esc(i.id)}" data-k="text" value="${esc(i.text)}" aria-label="Task">
          <input type="date" data-item="${esc(i.id)}" data-k="due" value="${esc(i.due)}" aria-label="Due date">
          <button type="button" class="lg-x" data-act="remove-item" data-id="${esc(i.id)}" aria-label="Remove">×</button></li>`).join('')}</ul></div>`;
      }).join('')}
      <form class="card lg-panel lg-add" data-form="add-item">
        <select name="group" aria-label="Group">${GROUPS.map(g => `<option>${g}</option>`).join('')}</select>
        <input type="text" name="text" placeholder="Add a task" aria-label="New task" required>
        <button type="submit" class="sim-btn btn-sm">Add</button>
      </form>`;
    },

    // ---------- editing
    team() { return this.data.teams.find(x => x.id === this.editing); },
    onInput(e) {
      const el = e.target, d = this.data;
      const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
      if (el.dataset.season) {
        d.season[el.dataset.season] = val;
        const cards = document.getElementById('lgCards');
        if (cards) cards.outerHTML = this.cardsHTML();
        if (e.type === 'change' && el.dataset.season === 'conf') this.render();
      } else if (el.dataset.team) {
        const t = this.team(); if (!t) return;
        const k = el.dataset.team;
        if ((k === 'primary' || k === 'secondary') && el.type === 'text') {
          let v = val.trim(); if (v && v[0] !== '#') v = '#' + v;
          if (!HEX.test(v)) { if (e.type === 'change') el.value = t[k]; return; }
          t[k] = v.toUpperCase();
          const pick = el.parentNode.querySelector('input[type=color]'); if (pick) pick.value = v;
        } else if (k === 'primary' || k === 'secondary') {
          t[k] = val.toUpperCase();
          const txt = el.parentNode.querySelector('input[type=text]'); if (txt) txt.value = t[k];
        } else t[k] = val;
        const box = document.getElementById('lgJerseys');
        if (box) box.innerHTML = this.jerseysHTML(t);
        if (k === 'paid' || k === 'conf') this.render();
      } else if (el.dataset.player != null) {
        const t = this.team(); if (!t) return;
        const p = t.players[+el.dataset.player]; if (!p) return;
        p[el.dataset.k] = el.dataset.k === 'number' ? String(val).replace(/\D/g, '').slice(0, 2) : val;
      } else if (el.dataset.item) {
        const it = d.checklist.find(i => i.id === el.dataset.item); if (!it) return;
        it[el.dataset.k] = val;
        if (el.dataset.k === 'done') this.render();
      } else return;
      this.queueSave();
    },
    onClick(e) {
      const go = e.target.closest('[data-go]');
      if (go) return this.setTab(go.dataset.go);
      const ed = e.target.closest('[data-edit]');
      if (ed) { this.editing = ed.dataset.edit; return this.render(); }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const d = this.data, t = this.team();
      switch (b.dataset.act) {
        case 'add-team': {
          const nt = { id: uid(), name: '', conf: d.season.conf || 'PDX', primary: '#181F40', secondary: '#FFFFFF', captain: '', contact: '', paid: false, notes: '', previewNumber: '23', players: [] };
          d.teams.push(nt); this.editing = nt.id; this.render();
          const first = this.el.querySelector('[data-team="name"]'); if (first) first.focus();
          break;
        }
        case 'back': this.editing = null; this.render(); return;
        case 'delete-team':
          if (!t) return;
          if (typeof confirm === 'function' && !confirm(`Delete ${t.name || 'this team'} and its roster?`)) return;
          d.teams = d.teams.filter(x => x !== t); this.editing = null; this.render(); break;
        case 'add-player':
          if (!t) return;
          t.players = t.players || [];
          t.players.push({ name: '', number: '', size: '' }); this.render();
          { const ins = this.el.querySelectorAll('[data-k="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
          break;
        case 'remove-player':
          if (!t) return;
          t.players.splice(+b.dataset.i, 1); this.render(); break;
        case 'remove-item':
          d.checklist = d.checklist.filter(i => i.id !== b.dataset.id); this.render(); break;
        default: return;
      }
      this.queueSave();
    },
    onSubmit(e) {
      const form = e.target.closest('[data-form="add-item"]');
      if (!form) return;
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text) return;
      this.data.checklist.push({ id: uid(), group: form.elements.group.value, text, done: false, due: '' });
      this.render();
      this.queueSave();
    },

    // ---------- saving
    queueSave() {
      clearTimeout(this.timer);
      this.dirty = true;
      this.showSave();
      this.timer = setTimeout(() => this.save(), 800);
    },
    async save() {
      const C = root.Cloud;
      if (!C || !C.admin || !C.saveLeague) { this.saveError = 'Sign in with an admin account to save.'; this.showSave(); return; }
      const snap = JSON.parse(JSON.stringify(this.data));
      this.dirty = false;
      try {
        const saved = await C.saveLeague(snap);
        this.lastSaved = saved.updatedAt;
        this.saveError = '';
      } catch (e) {
        console.error('Saving the league:', e);
        this.dirty = true;
        this.saveError = explain(e);
      }
      this.showSave();
    },
    showSave() {
      const el = document.getElementById('lgSave');
      if (!el) return;
      el.classList.toggle('err', !!this.saveError);
      el.textContent = this.saveError ? `Not saved: ${this.saveError}`
        : this.dirty ? 'Saving…'
        : this.lastSaved ? `Saved ${new Date(this.lastSaved).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
    },

    wire(el) {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('input', e => this.onInput(e));
      el.addEventListener('change', e => this.onInput(e));
      el.addEventListener('click', e => this.onClick(e));
      el.addEventListener('submit', e => this.onSubmit(e));
      const tabs = document.getElementById('lgTabs');
      if (tabs) tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { this.editing = null; this.setTab(b.dataset.tab); } });
      if (typeof window !== 'undefined') window.addEventListener('beforeunload', e => { if (this.dirty) { this.save(); e.preventDefault(); e.returnValue = ''; } });
    }
  };

  function fmtDay(s) {
    const d = new Date(s + 'T12:00:00');
    return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function explain(e) {
    const code = (e && e.code) || '';
    if (/permission/i.test(code) || /permission/i.test(e && e.message)) return 'the database rules don\'t allow it yet. Paste the updated firestore.rules into Firebase and publish.';
    if (/unavailable|network/i.test(code)) return 'you seem to be offline. It will try again on your next change.';
    return (e && e.message) || 'something went wrong.';
  }

  // Admin accounts only: the page waits for sign-in, then loads.
  League.start = async function (opts = {}) {
    const sum = document.getElementById('lgSummary');
    const body = document.getElementById('lgBody');
    const tabs = document.getElementById('lgTabs');
    const gate = msg => { if (sum) sum.textContent = msg; if (body) body.innerHTML = `<p class="adm-empty">${esc(msg)}</p>`; if (tabs) tabs.hidden = true; this.el = null; };
    const open = async () => {
      if (!this.data) await this.load();
      this.el = body;
      this.wire(body);
      const s = this.data.season;
      if (sum) sum.textContent = `${s.name || 'Season'} · ${(STATUSES.find(x => x[0] === s.status) || STATUSES[0])[1]} · only admins can see this page`;
      this.render();
    };
    if (opts.skipGate) return open();
    const on = root.Cloud ? await root.Cloud.init() : false;
    if (!on) { gate('Accounts aren\'t available right now, so this page can\'t check who you are.'); return; }
    root.Cloud.onChange(() => {
      if (root.Cloud.admin) open();
      else { this.data = null; gate(root.Cloud.user ? 'This page isn\'t available for this account.' : 'Sign in with an admin account (top right) to view this page.'); }
    });
  };

  League.jerseySVG = jerseySVG;
  League.blank = blank;
  root.League = League;
  if (typeof document !== 'undefined' && !root.__LEAGUE_NO_AUTOSTART && document.getElementById('lgBody')) {
    const go = () => League.start();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
