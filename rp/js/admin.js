// The RP admin page: everything in this browser's save laid out for
// tuning. Overalls for every player, split by where they came from (the
// roster sheet, the recruiting sheet, or generated), so generated players
// can be scaled against the real ones; every team's prestige and coach;
// and the coaching carousel. Admin accounts only.
(function (root) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const f1 = v => v == null ? '—' : v.toFixed(1);
  const SOURCE_LABEL = { sheet: 'Roster sheet', recruit: 'Recruiting sheet', generated: 'Generated' };

  const AdminPage = {
    data: null,
    tab: 'overview',
    sort: { teams: ['prestige', -1], players: ['rating', -1], coaches: ['prestige', -1] },
    filters: { players: { q: '', source: '', conf: '', cls: '' }, teams: { q: '', conf: '' }, coaches: { q: '', source: '' } },
    openTeam: null,

    // Where a player came from.
    sourceOf(p) {
      if (p.isGenerated) return 'generated';
      if (p.enrolled) return 'recruit';          // came in off the recruiting sheet
      return 'sheet';
    },

    async start(opts = {}) {
      const sum = document.getElementById('admSummary');
      if (!opts.skipGate) {
        const on = root.Cloud ? await root.Cloud.init() : false;
        if (!on) { this.gate('Accounts aren\'t available right now, so the admin page can\'t check who you are.'); return; }
        root.Cloud.onChange(() => {
          if (root.Cloud.admin) this.load();
          else this.gate(root.Cloud.user ? 'This account isn\'t an admin.' : 'Sign in with an admin account (top right) to see this page.');
        });
        return;
      }
      if (sum) sum.textContent = 'Loading the save…';
      await this.load();
    },

    gate(msg) {
      document.getElementById('admSummary').textContent = msg;
      document.getElementById('admTabs').hidden = true;
      document.getElementById('admBody').innerHTML = `<p class="adm-empty">${esc(msg)}</p>`;
    },

    async load() {
      const d = { league: null, teams: [], players: [] };
      try {
        if (typeof db !== 'undefined' && db.leagueState) {
          d.league = await db.leagueState.get(1);
          d.teams = await db.teams.toArray();
          d.players = await db.players.toArray();
        }
      } catch (e) { console.error('Reading the save:', e); }
      if (!d.teams.length) {
        this.gate('No save in this browser yet. Open the NCAA RP once (it builds the universe), then come back.');
        return;
      }
      const bySchool = {};
      d.players.forEach(p => { p._src = this.sourceOf(p); (bySchool[p.school] = bySchool[p.school] || []).push(p); });
      d.teams.forEach(t => {
        t.roster = bySchool[t.school] || [];
        if (t.prestige == null && root.Prestige) t.prestige = root.Prestige.compute(t).prestige;
        const r = src => t.roster.filter(p => p._src === src).map(p => num(p.rating)).filter(v => v != null);
        t._n = { sheet: r('sheet').length + r('recruit').length, gen: r('generated').length };
        t._avg = { sheet: avg(r('sheet').concat(r('recruit'))), gen: avg(r('generated')), all: avg(t.roster.map(p => num(p.rating)).filter(v => v != null)) };
        t._ovr = t.simData && t.simData.teamOvr ? t.simData.teamOvr : null;
      });
      d.bySchool = bySchool;
      this.data = d;
      const L = d.league || {};
      document.getElementById('admSummary').textContent =
        `${L.currentYear ? `${L.currentYear}-${String(L.currentYear + 1).slice(2)} season · ${L.currentPhase || ''} · ` : ''}${d.teams.length} teams · ${d.players.length} players · this browser's save`;
      const tabs = document.getElementById('admTabs');
      tabs.hidden = false;
      tabs.querySelectorAll('button').forEach(b => { b.onclick = () => this.setTab(b.dataset.tab); });
      this.render();
    },

    setTab(tab) {
      this.tab = tab;
      document.querySelectorAll('#admTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      this.render();
    },

    render() {
      const el = document.getElementById('admBody');
      if (!this.data) return;
      const html = { overview: () => this.renderOverview(), teams: () => this.renderTeams(), players: () => this.renderPlayers(), coaches: () => this.renderCoaches() }[this.tab];
      el.innerHTML = html ? html() : '';
    },

    // ---------- Overalls ----------

    renderOverview() {
      const ps = this.data.players.filter(p => num(p.rating) != null);
      const groups = ['sheet', 'recruit', 'generated'].map(s => ({ s, r: ps.filter(p => p._src === s).map(p => num(p.rating)) }));
      const real = ps.filter(p => p._src !== 'generated').map(p => num(p.rating));
      const gen = ps.filter(p => p._src === 'generated').map(p => num(p.rating));
      const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

      const cards = groups.map(g => `<div class="adm-card"><span class="adm-card-label">${SOURCE_LABEL[g.s]}</span>
        <b>${g.r.length}</b><span>players · avg ${f1(avg(g.r))}</span>
        <small>middle half ${pct(g.r, 0.25) ?? '—'}–${pct(g.r, 0.75) ?? '—'} · top ${g.r.length ? Math.max(...g.r) : '—'}</small></div>`).join('');

      // Histogram, five-point bins.
      const bins = [];
      for (let lo = 45; lo <= 95; lo += 5) bins.push(lo);
      const cnt = (a, lo) => a.filter(v => v >= lo && v < lo + 5).length;
      const maxC = Math.max(1, ...bins.map(lo => Math.max(cnt(real, lo), cnt(gen, lo))));
      const hist = `<div class="adm-hist">${bins.map(lo => `<div class="adm-hist-row"><span class="adm-hist-lbl">${lo}–${lo + 4}</span>
        <span class="adm-hist-bars"><i class="real" style="width:${cnt(real, lo) / maxC * 100}%"></i><i class="gen" style="width:${cnt(gen, lo) / maxC * 100}%"></i></span>
        <span class="adm-hist-n">${cnt(real, lo)} / ${cnt(gen, lo)}</span></div>`).join('')}</div>
        <p class="adm-legend"><i class="real"></i> From the sheets <i class="gen"></i> Generated</p>`;

      // By prestige band and by conference: real vs generated.
      const P = root.Prestige;
      const bandOf = t => P ? P.label(t.prestige || 0, t.prestigeHistory) : '—';
      const BANDS = ['Blue blood', 'Elite', 'Power program', 'High major', 'Upper mid-major', 'Mid-major', 'Low major'];
      const bandRows = BANDS.map(b => {
        const teams = this.data.teams.filter(t => bandOf(t) === b);
        if (!teams.length) return '';
        const r = teams.flatMap(t => t.roster.filter(p => p._src !== 'generated').map(p => num(p.rating))).filter(v => v != null);
        const g = teams.flatMap(t => t.roster.filter(p => p._src === 'generated').map(p => num(p.rating))).filter(v => v != null);
        const lv = P ? avg(teams.map(t => P.programLevel(t.prestige))) : null;
        return this.compareRow(b, teams.length, lv, r, g);
      }).join('');
      const confs = [...new Set(this.data.teams.map(t => t.conference))].sort();
      const confRows = confs.map(c => {
        const teams = this.data.teams.filter(t => t.conference === c);
        const r = teams.flatMap(t => t.roster.filter(p => p._src !== 'generated').map(p => num(p.rating))).filter(v => v != null);
        const g = teams.flatMap(t => t.roster.filter(p => p._src === 'generated').map(p => num(p.rating))).filter(v => v != null);
        const lv = P ? avg(teams.map(t => P.programLevel(t.prestige))) : null;
        return this.compareRow(c, teams.length, lv, r, g);
      }).join('');
      const head = `<thead><tr><th></th><th>Teams</th><th title="The rating level a program of this prestige signs at">Level</th><th>Sheet players</th><th>Sheet avg</th><th>Generated</th><th>Generated avg</th><th title="Generated average minus sheet average">Gap</th></tr></thead>`;

      const levels = P ? [100, 92, 86, 80, 74, 64, 52, 42, 32].map(x => `<span><b>${x}</b> → ${P.programLevel(x).toFixed(1)}</span>`).join('') : '';

      return `<div class="adm-cards">${cards}</div>
        <div class="adm-grid2">
          <div class="card"><div class="section-head"><h3 class="section-title">Overall distribution</h3></div>${hist}</div>
          <div class="card"><div class="section-head"><h3 class="section-title">How generated players are set</h3></div>
            <p class="adm-note">A generated player's overall comes from his program's <b>level</b>, which comes from its <b>prestige</b> (history, the last four seasons, and the coach). Generated players on a team with sheet players are held below the best of them. Incoming generated freshmen start about 5 points under the level and grow.</p>
            <p class="adm-note">Prestige → level:</p><div class="adm-levels">${levels}</div>
            <p class="adm-note">When you add a roster to the sheet, compare its players to the <b>Generated avg</b> for that conference below. A large positive <b>Gap</b> means generated players there are rated above the real ones.</p></div>
        </div>
        <div class="card"><div class="section-head"><h3 class="section-title">By prestige</h3></div><div class="table-scroll"><table class="data-table adm-table">${head}<tbody>${bandRows}</tbody></table></div></div>
        <div class="card"><div class="section-head"><h3 class="section-title">By conference</h3></div><div class="table-scroll"><table class="data-table adm-table">${head}<tbody>${confRows}</tbody></table></div></div>`;
    },

    compareRow(label, nTeams, level, r, g) {
      const ra = avg(r), ga = avg(g);
      const gap = ra != null && ga != null ? ga - ra : null;
      const cls = gap == null ? '' : gap > 2 ? 'adm-hi' : gap < -6 ? 'adm-lo' : '';
      return `<tr><td class="bold-text">${esc(label)}</td><td>${nTeams}</td><td>${level == null ? '—' : level.toFixed(1)}</td><td>${r.length}</td><td>${f1(ra)}</td><td>${g.length}</td><td>${f1(ga)}</td><td class="${cls}">${gap == null ? '—' : (gap > 0 ? '+' : '') + gap.toFixed(1)}</td></tr>`;
    },

    // ---------- Tables ----------

    sortRows(kind, rows, cols) {
      const [key, dir] = this.sort[kind];
      const col = cols.find(c => c.key === key) || cols[0];
      return rows.sort((a, b) => {
        const x = col.get(a), y = col.get(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
      });
    },
    setSort(kind, key) {
      const [k, d] = this.sort[kind];
      this.sort[kind] = [key, k === key ? -d : (key === 'name' || key === 'school' || key === 'coach' || key === 'conference' ? 1 : -1)];
      this.render();
    },
    table(kind, cols, rows, rowAttrs) {
      const [k, d] = this.sort[kind];
      return `<div class="table-scroll"><table class="data-table adm-table"><thead><tr>${cols.map(c =>
        `<th class="adm-sort${c.key === k ? ' on' : ''}" onclick="AdminPage.setSort('${kind}','${c.key}')">${c.label}${c.key === k ? (d > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr ${rowAttrs ? rowAttrs(r) : ''}>${cols.map(c => `<td>${c.fmt ? c.fmt(r) : esc(c.get(r) ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    },
    setFilter(kind, key, value) {
      this.filters[kind][key] = value;
      this.render();
      const el = document.querySelector(`[data-filter="${kind}.${key}"]`);
      if (el && el.tagName === 'INPUT') { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    },
    filterBar(kind, parts) {
      const f = this.filters[kind];
      return `<div class="adm-filters">${parts.map(p => p.options
        ? `<select data-filter="${kind}.${p.key}" onchange="AdminPage.setFilter('${kind}','${p.key}',this.value)"><option value="">${esc(p.label)}</option>${p.options.map(o => `<option value="${esc(o[0])}"${f[p.key] === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
        : `<input type="search" data-filter="${kind}.${p.key}" placeholder="${esc(p.label)}" value="${esc(f[p.key])}" oninput="AdminPage.setFilter('${kind}','${p.key}',this.value)">`).join('')}
        ${parts.extra || ''}</div>`;
    },
    confOptions() { return [...new Set(this.data.teams.map(t => t.conference))].sort().map(c => [c, c]); },

    renderTeams() {
      const f = this.filters.teams;
      const q = f.q.trim().toLowerCase();
      let rows = this.data.teams.filter(t => (!f.conf || t.conference === f.conf) && (!q || t.school.toLowerCase().includes(q) || (t.coach && t.coach.name.toLowerCase().includes(q))));
      const cols = [
        { key: 'school', label: 'School', get: t => t.school, fmt: t => `<span class="bold-text">${esc(t.school)}</span>` },
        { key: 'conference', label: 'Conf', get: t => t.conference },
        { key: 'prestige', label: 'Prestige', get: t => t.prestige, fmt: t => `${t.prestige ?? '—'} <small class="sub-text">${root.Prestige ? esc(root.Prestige.label(t.prestige || 0, t.prestigeHistory)) : ''}</small>` },
        { key: 'history', label: 'History', get: t => t.prestigeHistory ?? (root.Prestige ? root.Prestige.historyScore(t.school, t.conference) : null) },
        { key: 'level', label: 'Level', get: t => root.Prestige ? Math.round(root.Prestige.programLevel(t.prestige) * 10) / 10 : null },
        { key: 'coach', label: 'Coach', get: t => t.coach ? t.coach.name : null },
        { key: 'ovr', label: 'Team OVR', get: t => t._ovr, fmt: t => f1(t._ovr) },
        { key: 'avg', label: 'Roster avg', get: t => t._avg.all, fmt: t => f1(t._avg.all) },
        { key: 'nSheet', label: 'Sheet', get: t => t._n.sheet },
        { key: 'sheetAvg', label: 'Sheet avg', get: t => t._avg.sheet, fmt: t => f1(t._avg.sheet) },
        { key: 'nGen', label: 'Gen', get: t => t._n.gen },
        { key: 'genAvg', label: 'Gen avg', get: t => t._avg.gen, fmt: t => f1(t._avg.gen) }
      ];
      rows = this.sortRows('teams', rows, cols);
      const open = this.openTeam && this.data.teams.find(t => t.school === this.openTeam);
      return `${this.filterBar('teams', [{ key: 'q', label: 'School or coach' }, { key: 'conf', label: 'All conferences', options: this.confOptions() }])}
        <p class="adm-note">${rows.length} teams. Click a team for its roster.</p>
        ${open ? this.renderRoster(open) : ''}
        <div class="card">${this.table('teams', cols, rows, t => `class="adm-click${open && open.school === t.school ? ' on' : ''}" data-school="${esc(t.school)}" onclick="AdminPage.toggleTeam(this.dataset.school)"`)}</div>
        <button class="sim-btn sim-btn-secondary btn-sm" onclick="AdminPage.downloadTeams()">Download teams (CSV)</button>`;
    },
    toggleTeam(school) {
      this.openTeam = this.openTeam === school ? null : school;
      this.render();
      if (this.openTeam) { const el = document.querySelector('.adm-roster'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    },
    renderRoster(t) {
      const ps = [...t.roster].sort((a, b) => (num(b.rating) || 0) - (num(a.rating) || 0));
      const c = t.coach || {};
      return `<div class="card adm-roster"><div class="section-head"><h3 class="section-title">${esc(t.school)} roster</h3>
        <button class="outline-btn btn-sm" data-school="${esc(t.school)}" onclick="AdminPage.toggleTeam(this.dataset.school)">Close</button></div>
        <p class="adm-note">Coach ${esc(c.name || '—')}${c.rep != null ? ` · reputation ${Math.round(c.rep)}` : ''} · prestige ${t.prestige ?? '—'} (history ${t.prestigeHistory ?? '—'}) · level ${root.Prestige ? root.Prestige.programLevel(t.prestige).toFixed(1) : '—'}</p>
        <div class="table-scroll"><table class="data-table adm-table"><thead><tr><th>Player</th><th>Pos</th><th>Cl</th><th>OVR</th><th>POT</th><th>Source</th><th>MPG</th><th>PPG</th></tr></thead><tbody>
        ${ps.map(p => `<tr><td class="bold-text">${esc(p.name)}</td><td>${esc(p.pos)}</td><td>${esc(p.class)}</td><td class="bold-text">${esc(p.rating)}</td><td>${esc(p.potential ?? '—')}</td><td><span class="adm-src ${p._src}">${SOURCE_LABEL[p._src]}</span></td><td>${esc(p.stats && p.stats.mpg || '—')}</td><td>${esc(p.stats && p.stats.ppg || '—')}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    },

    filteredPlayers() {
      const f = this.filters.players;
      const q = f.q.trim().toLowerCase();
      const conf = {};
      this.data.teams.forEach(t => { conf[t.school] = t.conference; });
      return this.data.players.filter(p => (!f.source || p._src === f.source) && (!f.conf || conf[p.school] === f.conf)
        && (!f.cls || p.class === f.cls) && (!q || String(p.name).toLowerCase().includes(q) || String(p.school).toLowerCase().includes(q)));
    },
    playerCols() {
      const pres = {};
      this.data.teams.forEach(t => { pres[t.school] = t; });
      return [
        { key: 'name', label: 'Player', get: p => p.name, fmt: p => `<span class="bold-text">${esc(p.name)}</span>` },
        { key: 'school', label: 'School', get: p => p.school },
        { key: 'conference', label: 'Conf', get: p => (pres[p.school] || {}).conference },
        { key: 'pos', label: 'Pos', get: p => p.pos },
        { key: 'class', label: 'Cl', get: p => p.class },
        { key: 'rating', label: 'OVR', get: p => num(p.rating), fmt: p => `<b>${esc(p.rating)}</b>` },
        { key: 'potential', label: 'POT', get: p => num(p.potential) },
        { key: 'source', label: 'Source', get: p => p._src, fmt: p => `<span class="adm-src ${p._src}">${SOURCE_LABEL[p._src]}</span>` },
        { key: 'prestige', label: 'Program', get: p => (pres[p.school] || {}).prestige },
        { key: 'ppg', label: 'PPG', get: p => num(p.stats && p.stats.ppg) }
      ];
    },
    renderPlayers() {
      const cols = this.playerCols();
      const rows = this.sortRows('players', this.filteredPlayers(), cols);
      const shown = rows.slice(0, 500);
      const r = rows.map(p => num(p.rating)).filter(v => v != null);
      return `${this.filterBar('players', [
        { key: 'q', label: 'Player or school' },
        { key: 'source', label: 'All sources', options: Object.entries(SOURCE_LABEL) },
        { key: 'conf', label: 'All conferences', options: this.confOptions() },
        { key: 'cls', label: 'All classes', options: ['FR', 'SO', 'JR', 'SR', 'GR'].map(c => [c, c]) }])}
        <p class="adm-note">${rows.length} players · average OVR ${f1(avg(r))}${rows.length > shown.length ? ` · showing the first ${shown.length} (sort or filter to see others, or download them all)` : ''}</p>
        <div class="card">${this.table('players', cols, shown)}</div>
        <button class="sim-btn sim-btn-secondary btn-sm" onclick="AdminPage.downloadPlayers()">Download these players (CSV)</button>`;
    },

    renderCoaches() {
      const f = this.filters.coaches;
      const q = f.q.trim().toLowerCase();
      const L = this.data.league || {};
      const year = L.currentYear || new Date().getFullYear();
      let rows = this.data.teams.filter(t => t.coach).filter(t => (!f.source || (f.source === 'generated') === !!t.coach.generated)
        && (!q || t.school.toLowerCase().includes(q) || t.coach.name.toLowerCase().includes(q)));
      const cols = [
        { key: 'coach', label: 'Coach', get: t => t.coach.name, fmt: t => `<span class="bold-text">${esc(t.coach.name)}</span>` },
        { key: 'school', label: 'School', get: t => t.school },
        { key: 'prestige', label: 'Prestige', get: t => t.prestige },
        { key: 'rep', label: 'Reputation', get: t => t.coach.rep != null ? Math.round(t.coach.rep) : null },
        { key: 'years', label: 'Year', get: t => t.coach.since != null ? year - t.coach.since + 1 : null },
        { key: 'record', label: 'Record', get: t => (t.coach.careerW || 0) - (t.coach.careerL || 0), fmt: t => t.coach.seasons ? `${t.coach.careerW || 0}-${t.coach.careerL || 0}` : '—' },
        { key: 'hot', label: 'Hot seat', get: t => t.coach.hotSeat || 0, fmt: t => t.coach.hotSeat ? `<span class="adm-hi">${t.coach.hotSeat}</span>` : '—' },
        { key: 'src', label: 'Source', get: t => t.coach.generated ? 'Generated' : 'Coaches sheet' },
        { key: 'style', label: 'Style', get: t => (t.coachTags || []).join(', '), fmt: t => (t.coachTags || []).map(x => `<span class="coach-tag">${esc(x)}</span>`).join(' ') || '<span class="sub-text">Neutral</span>' },
        { key: 'prev', label: 'Came from', get: t => t.coach.prevSchool || null }
      ];
      rows = this.sortRows('coaches', rows, cols);
      const changes = (L.coachChanges || []).slice().reverse().slice(0, 150);
      const sheet = this.data.teams.filter(t => t.coach && !t.coach.generated).length;
      return `${this.filterBar('coaches', [{ key: 'q', label: 'Coach or school' }, { key: 'source', label: 'All coaches', options: [['sheet', 'Coaches sheet'], ['generated', 'Generated']] }])}
        <p class="adm-note">${sheet} coaches from the sheet, ${this.data.teams.length - sheet} generated. Reputation drifts toward how each season went against the roster's talent, plus March. Two poor seasons put a coach on the hot seat; openings go best job first, and winning coaches at smaller programs get the first call.</p>
        <div class="card">${this.table('coaches', cols, rows)}</div>
        <div class="card"><div class="section-head"><h3 class="section-title">Coaching changes</h3></div>
        ${changes.length ? `<ul class="adm-changes">${changes.map(c => `<li><span class="sub-text">${c.year}</span> ${esc(c.text)}</li>`).join('')}</ul>` : '<p class="adm-note">None yet. The carousel runs with the transfer portal each offseason.</p>'}</div>`;
    },

    // ---------- CSV ----------

    download(name, header, rows) {
      const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [header.join(',')].concat(rows.map(r => r.map(cell).join(','))).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    },
    downloadPlayers() {
      const conf = {};
      this.data.teams.forEach(t => { conf[t.school] = t; });
      this.download('rp-players.csv', ['name', 'school', 'conference', 'pos', 'class', 'ovr', 'potential', 'source', 'program_prestige'],
        this.filteredPlayers().map(p => [p.name, p.school, (conf[p.school] || {}).conference, p.pos, p.class, p.rating, p.potential, SOURCE_LABEL[p._src], (conf[p.school] || {}).prestige]));
    },
    downloadTeams() {
      this.download('rp-teams.csv', ['school', 'conference', 'prestige', 'history', 'level', 'coach', 'coach_rep', 'team_ovr', 'sheet_players', 'sheet_avg', 'generated_players', 'generated_avg'],
        this.data.teams.map(t => [t.school, t.conference, t.prestige, t.prestigeHistory, root.Prestige ? root.Prestige.programLevel(t.prestige).toFixed(1) : '', t.coach && t.coach.name, t.coach && t.coach.rep,
          t._ovr && t._ovr.toFixed(1), t._n.sheet, t._avg.sheet && t._avg.sheet.toFixed(1), t._n.gen, t._avg.gen && t._avg.gen.toFixed(1)]));
    }
  };

  root.AdminPage = AdminPage;
  if (typeof document !== 'undefined' && !root.__ADMIN_NO_AUTOSTART) {
    const go = () => AdminPage.start();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
