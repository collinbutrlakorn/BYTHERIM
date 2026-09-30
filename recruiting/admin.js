// Recruiting admin: each class as the site builds it, the recruiting
// sheet's players and the generated ones side by side. Any generated
// player can be copied as a row for the recruiting sheet, which makes him
// a sheet player: permanent, and yours to edit.
(function (root) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace('%', '')); return isNaN(n) ? null : n; };

  const RecruitAdmin = {
    rows: [], headers: {}, year: null, source: '', q: '', sort: ['rank', 1],
    openFrom: null, resetNote: '',

    async start(opts = {}) {
      const sum = document.getElementById('admSummary');
      const gate = msg => { sum.textContent = msg; document.getElementById('admBody').innerHTML = `<p class="adm-empty">${esc(msg)}</p>`; };
      if (!opts.skipGate) {
        const on = root.Cloud ? await root.Cloud.init() : false;
        if (!on) { gate('Accounts aren\'t available right now, so this page can\'t check who you are.'); return; }
        let loaded = false;
        root.Cloud.onChange(() => {
          if (root.Cloud.admin) { if (!loaded) { loaded = true; this.load(); } }
          else gate(root.Cloud.user ? 'This account isn\'t an admin.' : 'Sign in with an admin account (top right) to see this page.');
        });
        return;
      }
      await this.load(opts.rows);
    },

    async load(rows) {
      const sum = document.getElementById('admSummary');
      sum.textContent = 'Reading the recruiting sheet…';
      if (!rows) {
        // The same load the Recruiting page does, so this is exactly what
        // visitors see. The sheet's own column order is kept for copying.
        const headers = {};
        const res = await root.RecruitSheet.load(text => {
          const out = root.Papa.parse(text, { header: true, skipEmptyLines: true });
          const tab = String((out.data[0] || {}).classYear || '');
          if (out.meta && out.meta.fields) headers[tab || 'any'] = out.meta.fields;
          return out.data;
        }, { yearKey: 'classYear', nameKey: 'name' });
        rows = res.rows;
        this.headers = headers;
        // Classes the published universe is already recruiting (or has in
        // college) keep their generated players; later ones can be reset.
        try {
          const u = root.Cloud && root.Cloud.universe ? await root.Cloud.universe() : null;
          const live = u && u.recruitingLive;
          this.openFrom = live && live.openFrom ? live.openFrom : u && u.season && u.season.year ? u.season.year + 3 : null;
        } catch (e) { this.openFrom = null; }
      }
      this.rows = rows.filter(r => /^\d{4}$/.test(String(r.__tab || '')));
      const years = [...new Set(this.rows.map(r => String(r.classYear)))].sort();
      this.year = this.year || years.find(y => this.rows.some(r => String(r.classYear) === y && r.generated)) || years[0];
      const gen = this.rows.filter(r => r.generated).length;
      sum.textContent = `${this.rows.length - gen} from the sheet, ${gen} generated, across ${years.length} classes. Generated players are only marked here, never on the public pages.`;
      this.render();
    },

    kind(r) { return r.generated ? 'Generated' : r.__filled ? 'Sheet (filled in)' : 'Sheet'; },

    list() {
      const q = this.q.trim().toLowerCase();
      const [k, d] = this.sort;
      const val = r => k === 'rank' || k === 'rating' ? num(r[k]) : String(k === 'kind' ? this.kind(r) : r[k] || '').toLowerCase();
      return this.rows.filter(r => String(r.classYear) === this.year
        && (!this.source || (this.source === 'gen') === !!r.generated)
        && (!q || `${r.name} ${r.committedSchool} ${r.hs} ${r.hometown}`.toLowerCase().includes(q)))
        .sort((a, b) => { const x = val(a), y = val(b); return (x == null) - (y == null) || (x < y ? -1 : x > y ? 1 : 0) * d; });
    },

    render() {
      const el = document.getElementById('admBody');
      const years = [...new Set(this.rows.map(r => String(r.classYear)))].sort();
      const cls = this.rows.filter(r => String(r.classYear) === this.year);
      const inTop = n => cls.filter(r => r.generated && num(r.rank) <= n).length;
      const list = this.list();
      const th = (key, label) => `<th class="adm-sort${this.sort[0] === key ? ' on' : ''}" onclick="RecruitAdmin.setSort('${key}')">${label}${this.sort[0] === key ? (this.sort[1] > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      el.innerHTML = `
        <div class="adm-filters">
          <select onchange="RecruitAdmin.set('year', this.value)">${years.map(y => `<option value="${y}"${y === this.year ? ' selected' : ''}>Class of ${y}</option>`).join('')}</select>
          <select onchange="RecruitAdmin.set('source', this.value)">
            <option value="">Sheet and generated</option><option value="gen"${this.source === 'gen' ? ' selected' : ''}>Generated only</option><option value="sheet"${this.source === 'sheet' ? ' selected' : ''}>Sheet only</option></select>
          <input type="search" placeholder="Name, school, hometown" value="${esc(this.q)}" oninput="RecruitAdmin.set('q', this.value, true)">
        </div>
        <div class="adm-cards">
          <div class="adm-card"><span class="adm-card-label">Class of ${esc(this.year)}</span><b>${cls.length}</b><span>prospects</span></div>
          <div class="adm-card"><span class="adm-card-label">From the sheet</span><b>${cls.filter(r => !r.generated).length}</b><span>${cls.filter(r => r.__filled).length} filled in from a name only</span></div>
          <div class="adm-card"><span class="adm-card-label">Generated</span><b>${cls.filter(r => r.generated).length}</b><span>${inTop(25)} in the top 25 · ${inTop(100)} in the top 100</span></div>
        </div>
        ${this.resetPanel()}
        <p class="adm-note">Ranks are where each player lands once the class is filled out; "Sheet rank" is the sheet's own. To keep a generated player for good, copy his row and paste it into the class's tab (at the first empty row). He becomes a sheet player you can edit, and the generated player in that spot is replaced by the next one in the pool.</p>
        <div class="card"><div class="table-scroll"><table class="data-table adm-table">
          <thead><tr>${th('rank', 'Rank')}<th>Sheet rank</th>${th('name', 'Player')}${th('pos', 'Pos')}${th('rating', 'Rating')}<th>Stars</th>${th('committedSchool', 'School')}${th('kind', 'Source')}<th></th></tr></thead>
          <tbody>${list.map(r => `<tr>
            <td class="bold-text">${num(r.rank) != null && String(r.rank).length < 6 ? esc(r.rank) : '—'}</td><td>${r.sheetRank && String(r.sheetRank).length < 6 ? esc(r.sheetRank) : '—'}</td>
            <td><span class="bold-text">${esc(r.name)}</span><br><small class="sub-text">${esc(r.hs || '')}${r.hometown ? ' · ' + esc(r.hometown) : ''}</small></td>
            <td>${esc(r.pos)}</td><td>${esc(r.rating)}</td><td>${'★'.repeat(num(r.stars) || 0)}</td>
            <td>${esc(r.committedSchool || '—')}</td>
            <td><span class="adm-src ${r.generated ? 'generated' : 'sheet'}">${this.kind(r)}</span></td>
            <td>${r.generated ? `<button class="outline-btn btn-sm" data-name="${esc(r.name)}" onclick="RecruitAdmin.copyRow(this)">Copy row</button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div></div>
        <button class="sim-btn sim-btn-secondary btn-sm" onclick="RecruitAdmin.downloadClass()">Download the class's generated players</button>`;
    },

    // Resetting: new generated players for a class (or every class not yet
    // being recruited). The sheet's players never change.
    canReset(y) { return !this.openFrom || Number(y) >= this.openFrom; },
    resetPanel() {
      const years = [...new Set(this.rows.map(r => String(r.classYear)))].sort();
      const open = years.filter(y => this.canReset(y));
      const here = this.canReset(this.year);
      const why = this.openFrom ? `The published universe is recruiting the classes before ${this.openFrom} (or has them in college), so theirs are fixed.` : 'No universe has been published, so every class can be reset.';
      return `<div class="card adm-reset">
          <div><b>Reset generated players</b><p class="sub-text-sm">Gives a class brand-new generated players: new names, ratings, bios and stats. Sheet players stay exactly as they are, and a player you've copied into the sheet is kept. The NCAA RP picks up the new players the next time a save is opened. ${why}</p>
          ${this.resetNote ? `<p class="adm-reset-note">${esc(this.resetNote)}</p>` : ''}</div>
          <div class="adm-reset-btns">
            <button class="outline-btn btn-sm" ${here ? '' : 'disabled title="This class is already being recruited in the published universe"'} onclick="RecruitAdmin.reset([RecruitAdmin.year])">Reset the class of ${esc(this.year)}</button>
            <button class="outline-btn btn-sm danger" ${open.length ? '' : 'disabled'} onclick="RecruitAdmin.reset(${esc(JSON.stringify(open))})">Reset every open class${open.length ? ` (${open.length})` : ''}</button>
          </div>
        </div>`;
    },
    async reset(years) {
      years = (years || []).map(String).filter(y => this.canReset(y));
      if (!years.length || !root.Cloud || !root.Cloud.resetGeneratedClasses) return;
      const label = years.length === 1 ? `the class of ${years[0]}` : `${years.length} classes (${years[0]}-${years[years.length - 1]})`;
      if (typeof confirm === 'function' && !confirm(`Reset the generated players in ${label}? Everyone sees the new players right away, and there's no undo.`)) return;
      try {
        await root.Cloud.resetGeneratedClasses(years);
        this.resetNote = `Reset ${label}.`;
        await this.load();
      } catch (e) {
        this.resetNote = `Couldn't reset: ${e.message || e}`;
        this.render();
      }
    },

    set(key, v, keepFocus) {
      this[key] = v;
      this.render();
      if (keepFocus) { const i = document.querySelector('.adm-filters input'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }
    },
    setSort(key) { const [k, d] = this.sort; this.sort = [key, k === key ? -d : 1]; this.render(); },

    // The sheet's column order for this class (from its tab), then any
    // columns the generator adds that the tab doesn't have.
    columns() {
      const cols = this.headers[this.year] || this.headers.any || Object.keys(this.rows.find(r => !r.generated) || {});
      const extra = Object.keys(this.rows.find(r => r.generated) || {}).filter(k => !k.startsWith('__') && !cols.includes(k) && k !== 'generated' && k !== 'sheetRank');
      return cols.filter(c => c && !/^Column \d+$/.test(c)).concat(extra);
    },
    rowTsv(r) {
      const clean = v => String(v == null ? '' : v).replace(/[\t\n]/g, ' ');
      return this.columns().map(c => clean(r[c])).join('\t');
    },
    async copyRow(btn) {
      const r = this.rows.find(x => x.generated && x.name === btn.dataset.name && String(x.classYear) === this.year);
      if (!r) return;
      const text = this.rowTsv(r);
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
      catch (e) { prompt('Copy this row:', text); }
      setTimeout(() => { btn.textContent = 'Copy row'; }, 1600);
    },
    downloadClass() {
      const cols = this.columns();
      const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const rows = this.rows.filter(r => r.generated && String(r.classYear) === this.year).sort((a, b) => num(a.rank) - num(b.rank));
      const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => cell(r[c])).join(','))).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `generated-recruits-${this.year}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    }
  };

  root.RecruitAdmin = RecruitAdmin;
  if (typeof document !== 'undefined' && !root.__ADMIN_NO_AUTOSTART && document.getElementById('admBody')) {
    const go = () => RecruitAdmin.start();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
