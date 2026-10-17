// BYTHERIM Graphics (beta): admin-only graphics maker (graphics.html).
// Pick a category (NBA, Draft or NCAA) and a layout (one player, a
// ranked list, or two columns), fill in the fields, and download a PNG
// to finish in Canva. Each category has its own starting color, frame
// and top logo so posts in it match; all of it can be changed per
// graphic. Saved graphics are one document, graphics/library, which the
// database rules let only admins read or write.
(function (root) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const slug = s => String(s || 'graphic').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'graphic';
  const clone = o => JSON.parse(JSON.stringify(o));
  const D = () => root.GraphicsDraw;

  const LOOKS = [['nba', 'NBA'], ['draft', 'Draft'], ['ncaa', 'NCAA']];
  const TPLS = [['statline', 'Statline'], ['awards', 'Weekly awards'], ['list', 'Top performances'], ['single', 'Award winner'], ['columns', 'Two columns']];
  const OLD_TPL = { leaders: 'list' };
  const SIZE_KEYS = ['4x5', '5x4', '1x1', '9x16'];
  const MOVES = [['', 'No arrow'], ['up', '▲ Up'], ['down', '▼ Down'], ['same', '– Same'], ['new', 'New']];
  const season = () => { const d = new Date(), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; };

  const TITLES = {
    statline: { nba: 'Big Night', draft: 'Prospect Watch', ncaa: 'Big Night' },
    awards: { nba: 'Weekly Awards', draft: 'Weekly Awards', ncaa: 'Weekly Awards' },
    single: { nba: 'Most Valuable Player', draft: 'Prospect of the Week', ncaa: 'Player of the Week' },
    list: { nba: 'Top Performances', draft: 'Big Board Risers', ncaa: 'Top Performances' },
    columns: { nba: 'Standings', draft: 'Big Board', ncaa: 'Power Rankings' }
  };
  const HEADS = { nba: ['West', 'East'], draft: ['1-10', '11-20'], ncaa: ['1-10', '11-20'] };
  const row = () => ({ player: 'Player Name', team: '', value: '', move: '' });

  const AWARDS = {
    nba: ['Player of the Week', 'Rookie of the Week', 'Performance of the Week', 'Defender of the Week', 'Sixth Man of the Week'],
    draft: ['Prospect of the Week', 'Riser of the Week', 'Performance of the Week', 'Defender of the Week', 'Freshman of the Week'],
    ncaa: ['Player of the Week', 'Freshman of the Week', 'Performance of the Week', 'Defender of the Week', 'Upset of the Week']
  };
  function defaults(look, tpl) {
    const title = TITLES[tpl][look];
    if (tpl === 'statline') return {
      kicker: season(), title, player: 'Player Name', team: '', line: 'vs Opponent · W 00-00', photo: '',
      stats: ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG%'].map(label => ({ label, value: '00' })), shooting: 'FG 0-0 · 3P 0-0 · FT 0-0'
    };
    if (tpl === 'awards') return { kicker: 'Week 1', title, photo: '', rows: AWARDS[look].map(award => ({ award, player: 'Player Name', team: '', detail: '00.0 PTS · 00.0 REB · 00.0 AST' })) };
    if (tpl === 'list') return { kicker: season(), title, numbered: true, photo: '', rows: Array.from({ length: 5 }, row) };
    if (tpl === 'columns') return {
      kicker: `BYTHERIM ${season()}`, title, numbered: true, caps: false,
      left: { heading: HEADS[look][0], rows: Array.from({ length: 5 }, row) },
      right: { heading: HEADS[look][1], rows: Array.from({ length: 5 }, row) }
    };
    return { kicker: season(), title, player: 'Player Name', team: '', line: '', runnersLabel: 'Runner Ups', runners: '', photo: '' };
  }
  function lookStyle(look) {
    const L = D().LOOKS[look];
    return { bg: L.bg, bg2: L.bg2, frame: L.frame, pattern: L.pattern, topLogo: L.topLogo };
  }
  function blank(look = 'nba', tpl = 'statline') {
    return { id: null, name: '', look, tpl, size: '4x5', style: lookStyle(look), f: defaults(look, tpl) };
  }
  // Graphics saved by the first version of this page used other templates.
  function upgrade(item) {
    const g = clone(item);
    if (!OLD_TPL[g.tpl]) { g.style = Object.assign(lookStyle(g.look), g.style || {}); return g; }
    const f = g.f || {}, nf = defaults(g.look, OLD_TPL[g.tpl]);
    ['kicker', 'title', 'photo', 'player', 'team'].forEach(k => { if (f[k] != null && k in nf) nf[k] = f[k]; });
    if (g.tpl === 'statline') nf.line = [f.line, (f.stats || []).filter(s => s.value).map(s => `${s.value} ${s.label}`).join(' · ')].filter(Boolean).join(' · ');
    if (f.rows) nf.rows = f.rows.map(r => ({ player: r.player || '', team: r.team || '', value: r.value || '', move: '' }));
    return Object.assign(g, { tpl: OLD_TPL[g.tpl], style: lookStyle(g.look), f: nf });
  }

  function seasonOf(p) { return (p.seasons && p.seasons[0] && p.seasons[0].stats) || p.sheetStats || {}; }
  function seasonLine(p) {
    const s = seasonOf(p);
    return ['PTS', 'REB', 'AST'].filter(k => s[k] != null).map(k => `${s[k]} ${k}`).join(' · ');
  }

  const Graphics = {
    lib: [], cur: null, byTpl: {}, tab: 'create', filter: 'all', board: null, dirty: false, uploaded: null,

    async load() {
      const C = root.Cloud;
      let saved = null;
      try { saved = C && C.getGraphics ? await C.getGraphics() : null; } catch (e) { console.error('Loading graphics:', e); this.msg = explain(e); }
      this.lib = (saved && Array.isArray(saved.items)) ? saved.items.map(upgrade) : [];
      this.newGraphic('nba', 'statline');
    },
    newGraphic(look, tpl) {
      this.cur = blank(look || 'nba', tpl || 'statline');
      this.byTpl = { [this.cur.tpl]: this.cur.f };
      this.uploaded = null;
      this.dirty = false;
    },

    // ---------- rendering
    render() {
      const el = this.el;
      if (!el) return;
      document.querySelectorAll('#gxTabs [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === this.tab));
      const n = document.querySelector('#gxTabs [data-tab="saved"]');
      if (n) n.textContent = `Saved (${this.lib.length})`;
      el.innerHTML = this.tab === 'saved' ? this.savedHTML() : this.createHTML();
      if (this.tab === 'create') { this.ensureBoard(); this.redraw(); }
      this.showMsg();
    },
    createHTML() {
      const g = this.cur;
      const seg = (name, list, val) => `<div class="gx-seg" role="group">${list.map(([v, l]) => `<button type="button" data-set="${name}" data-v="${v}" class="${val === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
      return `<div class="gx-grid">
        <div class="gx-edit">
          <div class="card gx-panel">
            <div class="gx-row">${seg('look', LOOKS, g.look)}</div>
            <div class="gx-row">${seg('tpl', TPLS, g.tpl)}</div>
            <div class="gx-fields2">
              <label class="site-field"><span>Size</span><select data-set-select="size">${SIZE_KEYS.map(k => `<option value="${k}"${g.size === k ? ' selected' : ''}>${esc(D().SIZES[k].label)}</option>`).join('')}</select></label>
              <label class="site-field"><span>Saved as</span><input type="text" data-name value="${esc(g.name)}" placeholder="Name it to save (e.g. MVP race v1)"></label>
            </div>
            <div class="gx-actions">
              <button type="button" class="sim-btn btn-sm" data-act="save">${g.id ? 'Save' : 'Save graphic'}</button>
              ${g.id ? '<button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="copy">Save as copy</button>' : ''}
              <button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="new">New</button>
              ${g.id ? '<button type="button" class="sim-btn sim-btn-secondary btn-sm gx-danger" data-act="delete">Delete</button>' : ''}
            </div>
          </div>
          <div class="card gx-panel" id="gxStyle">${this.styleHTML()}</div>
          <div class="card gx-panel" id="gxForm">${this.formHTML()}</div>
        </div>
        <div class="gx-preview">
          <div class="gx-canvas-wrap gx-${g.size}"><canvas id="gxCanvas" aria-label="Graphic preview"></canvas></div>
          <div class="gx-actions gx-export">
            <button type="button" class="sim-btn" data-act="png">Download PNG</button>
            <button type="button" class="sim-btn sim-btn-secondary" data-act="all-sizes">All sizes</button>
            <label class="gx-check"><input type="checkbox" data-hd ${this.hd ? 'checked' : ''}> 2x (sharper in Canva)</label>
          </div>
          <p class="adm-note">No photo? The right side stays open for a cutout in Canva. In Canva: Uploads, then drag the PNG onto a design the same size.</p>
        </div>
      </div>`;
    },
    styleHTML() {
      const g = this.cur, st = g.style, L = D().LOOKS[g.look];
      const sw = (attr, val, list, none) => `<div class="gx-swatches">${none ? `<button type="button" class="gx-sw gx-sw-none${!val ? ' on' : ''}" ${attr}="" aria-label="None">∅</button>` : ''}${list.map(c => `<button type="button" class="gx-sw${val === c ? ' on' : ''}" ${attr}="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
          <input type="color" ${attr}-pick value="${esc(val || '#000000')}" aria-label="Custom color"></div>`;
      return `<h3 class="gx-h3">Look <small>starts from the ${esc(L.name)} look; changes apply to this graphic</small></h3>
        <div class="gx-fields2">
          <div class="site-field"><span>Background</span>${sw('data-bg', st.bg, L.swatches)}</div>
          ${g.tpl === 'columns' ? `<div class="site-field"><span>Right half (split color)</span>${sw('data-bg2', st.bg2, ['#4a1ee0', '#1d42ba', '#c8122e', '#0d0d10'], true)}</div>` : ''}
          <label class="site-field"><span>Frame</span><select data-style="frame">${[['none', 'No frame'], ['gold', 'Gold (awards)'], ['silver', 'Silver']].map(([v, l]) => `<option value="${v}"${st.frame === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="site-field"><span>Top logo</span><select data-style="topLogo">${[['none', 'None'], ['nba', 'NBA'], ['draft', 'NBA Draft']].map(([v, l]) => `<option value="${v}"${st.topLogo === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label class="gx-check"><input type="checkbox" data-style="pattern" ${st.pattern ? 'checked' : ''}> Court lines in the background</label>`;
    },
    formHTML() {
      const g = this.cur, f = g.f;
      const fld = (k, label, ph = '', extra = '') => `<label class="site-field"><span>${label}</span><input type="text" data-k="${k}" value="${esc(getPath(f, k))}" placeholder="${esc(ph)}" ${extra}></label>`;
      const chk = (k, label) => `<label class="gx-check"><input type="checkbox" data-k="${k}" ${getPath(f, k) ? 'checked' : ''}> ${label}</label>`;
      const players = (g.look === 'draft' || g.look === 'ncaa') && this.board ? 'list="gxProspects"' : '';
      const teamPh = g.look === 'nba' ? 'Lakers, LAL, Boston Celtics…' : 'School (logo loads from the name)';
      const datalist = players ? `<datalist id="gxProspects">${this.board.map(p => `<option value="${esc(p.name)}">${esc([p.rank ? '#' + p.rank : '', p.school].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>` : '';
      const top = `<div class="gx-fields2">
          ${fld('kicker', 'Small line above the title', season())}
          ${fld('title', 'Title', TITLES[g.tpl][g.look])}
        </div>`;
      const photo = `<div class="gx-photo">
          ${fld('photo', 'Background photo (optional)', 'https://… or leave empty for a color background')}
          <label class="sim-btn sim-btn-secondary btn-sm gx-upload">Upload photo<input type="file" accept="image/*" data-upload hidden></label>
        </div>
        ${this.uploaded ? '<p class="adm-note">Using an uploaded photo. Uploads aren\'t saved with the graphic. <button type="button" class="gx-link" data-act="clear-photo">Remove</button></p>' : ''}`;
      if (g.tpl === 'statline') {
        return `${top}
          <div class="gx-fields2">
            ${fld('player', 'Player', 'Player name', players + ' data-pick="single"')}
            ${fld('team', 'Team', teamPh)}
          </div>
          ${fld('line', 'Game line', 'vs Denver · W 121-114')}
          <h3 class="gx-h3">Stats <small>empty boxes are left off; up to 6</small></h3>
          <div class="gx-stats">${(f.stats || []).map((s, i) => `<div class="gx-stat">
              <input type="text" data-k="stats.${i}.value" value="${esc(s.value)}" placeholder="00" aria-label="Number ${i + 1}">
              <input type="text" data-k="stats.${i}.label" value="${esc(s.label)}" placeholder="LABEL" aria-label="Label ${i + 1}">
            </div>`).join('')}</div>
          ${fld('shooting', 'Shooting line', 'FG 15-24 · 3P 4-7 · FT 7-8')}
          ${photo}${datalist}`;
      }
      if (g.tpl === 'awards') {
        const rows = f.rows;
        return `${top}
          <h3 class="gx-h3">Awards <small>${rows.length} of 6</small></h3>
          <ol class="gx-rows">${rows.map((r, i) => `<li>
            <div class="gx-rowf awards">
              <input type="text" data-k="rows.${i}.award" value="${esc(r.award)}" placeholder="Award" aria-label="Award">
              <input type="text" data-k="rows.${i}.player" value="${esc(r.player)}" placeholder="Player" aria-label="Player" ${players} data-pick="row" data-path="rows.${i}">
              <input type="text" data-k="rows.${i}.team" value="${esc(r.team)}" placeholder="Team" aria-label="Team">
              <input type="text" data-k="rows.${i}.detail" value="${esc(r.detail)}" placeholder="Stat line" aria-label="Stat line">
            </div>
            <span class="gx-rowbtns">
              <button type="button" class="lg-x" data-act="up" data-path="rows" data-i="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button>
              <button type="button" class="lg-x" data-act="del-row" data-path="rows" data-i="${i}" aria-label="Remove">×</button>
            </span></li>`).join('')}</ol>
          ${rows.length < 6 ? '<button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="add-row" data-path="rows">Add award</button>' : ''}
          ${photo}${datalist}`;
      }
      if (g.tpl === 'single') {
        return `${top}
          <div class="gx-fields2">
            ${fld('player', 'Player', 'Player name', players + ' data-pick="single"')}
            ${fld('team', 'Team', teamPh)}
          </div>
          ${fld('line', 'Stat line (optional)', '34 PTS · 10 REB · 5 AST')}
          <div class="gx-fields2">
            ${fld('runnersLabel', 'Runners-up heading', 'Runner Ups')}
            <label class="site-field"><span>Runners-up (one per line, optional)</span><textarea rows="2" data-k="runners" placeholder="Darius Acuff&#10;Zuby Ejiofor">${esc(f.runners)}</textarea></label>
          </div>
          ${photo}${datalist}`;
      }
      const rowsHTML = (path, rows, kind) => `<ol class="gx-rows">${rows.map((r, i) => `<li>
          <div class="gx-rowf ${kind}">
            <input type="text" data-k="${path}.${i}.player" value="${esc(r.player)}" placeholder="Name" aria-label="Name" ${players} data-pick="row" data-path="${path}.${i}">
            <input type="text" data-k="${path}.${i}.team" value="${esc(r.team)}" placeholder="Team" aria-label="Team">
            <input type="text" data-k="${path}.${i}.value" value="${esc(r.value)}" placeholder="Stat" aria-label="Stat (optional)" class="gx-num">
            ${kind === 'list'
              ? `<select data-k="${path}.${i}.move" aria-label="Arrow">${MOVES.map(([v, l]) => `<option value="${v}"${r.move === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`
              : `<label class="gx-star" title="Star"><input type="checkbox" data-k="${path}.${i}.mark" ${r.mark ? 'checked' : ''}>★</label>`}
          </div>
          <span class="gx-rowbtns">
            <button type="button" class="lg-x" data-act="up" data-path="${path}" data-i="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button>
            <button type="button" class="lg-x" data-act="del-row" data-path="${path}" data-i="${i}" aria-label="Remove">×</button>
          </span></li>`).join('')}</ol>`;
      if (g.tpl === 'list') {
        return `${top}
          <div class="gx-checks">${chk('numbered', 'Numbered')}</div>
          <h3 class="gx-h3">Rows <small>${f.rows.length} of 12 · #1 first · stat and arrow are optional</small></h3>
          ${rowsHTML('rows', f.rows, 'list')}
          ${f.rows.length < 12 ? '<button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="add-row" data-path="rows">Add row</button>' : ''}
          ${photo}${datalist}`;
      }
      const side = (k, label) => `<div class="gx-side">
          <div class="gx-fields2">${fld(k + '.heading', label + ' heading', label === 'Left' ? 'West' : 'East')}</div>
          ${rowsHTML(k + '.rows', f[k].rows, 'cols')}
          ${f[k].rows.length < 15 ? `<button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="add-row" data-path="${k}.rows">Add row</button>` : ''}
        </div>`;
      return `${top}
        <div class="gx-checks">${chk('numbered', 'Numbered')}${chk('caps', 'Names in capitals')}</div>
        ${side('left', 'Left')}${side('right', 'Right')}${datalist}`;
    },
    savedHTML() {
      const list = this.lib.filter(x => this.filter === 'all' || x.look === this.filter)
        .slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const chips = [['all', 'All'], ...LOOKS].map(([v, l]) => `<button type="button" data-filter="${v}" class="${this.filter === v ? 'on' : ''}">${l}</button>`).join('');
      return `<div class="site-bar gx-bar"><div class="gx-seg">${chips}</div>
          <button type="button" class="sim-btn btn-sm" data-act="new-open">New graphic</button></div>
        ${list.length ? `<div class="gx-lib">${list.map(x => `<button type="button" class="gx-item" data-open="${esc(x.id)}">
            <span class="gx-item-top"><i class="gx-dot" style="background:${esc((x.style && x.style.bg) || '#333')}"></i><span class="gx-chip">${esc((LOOKS.find(l => l[0] === x.look) || ['', x.look])[1])}</span></span>
            <b>${esc(x.name || 'Untitled')}</b>
            <small>${esc((TPLS.find(t => t[0] === x.tpl) || ['', x.tpl])[1])} · ${esc(x.f && x.f.title || '')}</small>
            <small>${x.updatedAt ? 'Saved ' + new Date(x.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</small>
          </button>`).join('')}</div>`
        : `<p class="adm-empty">${this.lib.length ? 'Nothing saved in this category yet.' : 'No saved graphics yet. Make one and press Save graphic.'}</p>`}`;
    },
    refreshForm() {
      const f = document.getElementById('gxForm'); if (f) f.innerHTML = this.formHTML();
      const s = document.getElementById('gxStyle'); if (s) s.innerHTML = this.styleHTML();
    },

    // ---------- preview
    redraw() {
      clearTimeout(this.drawTimer);
      this.drawTimer = setTimeout(() => {
        const c = document.getElementById('gxCanvas');
        if (!c || !D()) return;
        const token = this.drawToken = (this.drawToken || 0) + 1;
        const off = document.createElement('canvas');
        D().draw(off, this.drawable()).then(() => {
          if (token !== this.drawToken || !off.width) return;
          c.width = off.width; c.height = off.height;
          const ctx = c.getContext && c.getContext('2d');
          if (ctx) ctx.drawImage(off, 0, 0);
        }).catch(e => console.warn('Preview:', e));
      }, 90);
    },
    drawable(size) {
      const g = clone(this.cur);
      if (size) g.size = size;
      if (this.uploaded && g.tpl !== 'columns') g.f.photo = this.uploaded;
      return g;
    },
    async exportPNG(sizes) {
      const g = this.cur;
      for (const size of sizes) {
        const c = document.createElement('canvas');
        await D().draw(c, this.drawable(size), { scale: this.hd ? 2 : 1 });
        let blob;
        try { blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('empty')), 'image/png')); }
        catch (e) { this.msg = 'That photo\'s site doesn\'t allow downloading it in an image. Upload the photo instead, or leave it empty and add it in Canva.'; this.showMsg(true); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bytherim-${g.look}-${slug(g.name || g.f.title || g.tpl)}-${size}${this.hd ? '@2x' : ''}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    },

    // ---------- board prospects (Draft and NCAA categories)
    ensureBoard() {
      if (this.board || this.boardLoading || !(this.cur.look === 'draft' || this.cur.look === 'ncaa')) return;
      const B = root.BOARD;
      if (!B || !B.loadBoard) return;
      this.boardLoading = true;
      B.loadBoard().then(rows => {
        this.board = rows;
        if (this.tab === 'create') { const form = document.getElementById('gxForm'); if (form) form.innerHTML = this.formHTML(); }
      }).catch(() => {}).finally(() => { this.boardLoading = false; });
    },
    pick(input) {
      const p = (this.board || []).find(x => x.name.toLowerCase() === input.value.trim().toLowerCase());
      if (!p) return false;
      const f = this.cur.f, team = p.isPro ? 'Pro' : p.school;
      if (input.dataset.pick === 'single') {
        f.player = p.name;
        if (!f.team) f.team = team;
        if (!f.line) f.line = seasonLine(p);
        if (p.image && !this.uploaded && !f.photo) f.photo = p.image;
      } else {
        const r = getPath(f, input.dataset.path);
        r.player = p.name;
        if (!r.team) r.team = team;
        if ('detail' in r && (!r.detail || /^00/.test(r.detail))) r.detail = seasonLine(p) || r.detail;
      }
      return true;
    },

    // ---------- events
    onInput(e) {
      const t = e.target, g = this.cur;
      if (t.matches('[data-hd]')) { this.hd = t.checked; return; }
      if (t.matches('[data-name]')) { g.name = t.value; this.dirty = true; return; }
      if (t.matches('[data-set-select]')) {
        g.size = t.value; this.dirty = true;
        const w = this.el.querySelector('.gx-canvas-wrap'); if (w) w.className = `gx-canvas-wrap gx-${t.value}`;
        this.redraw(); return;
      }
      if (t.matches('[data-style]')) {
        g.style[t.dataset.style] = t.type === 'checkbox' ? t.checked : t.value;
        this.dirty = true; this.redraw(); return;
      }
      if (t.matches('[data-bg-pick], [data-bg2-pick]')) {
        g.style[t.matches('[data-bg-pick]') ? 'bg' : 'bg2'] = t.value;
        this.dirty = true; this.redraw();
        if (e.type === 'change') document.getElementById('gxStyle').innerHTML = this.styleHTML();
        return;
      }
      if (t.matches('[data-upload]') && e.type === 'change') {
        const file = t.files && t.files[0];
        if (!file) return;
        const rd = new FileReader();
        rd.onload = () => { this.uploaded = rd.result; g.f.photo = ''; this.refreshForm(); this.redraw(); };
        rd.readAsDataURL(file);
        return;
      }
      if (!t.dataset.k) return;
      setPath(g.f, t.dataset.k, t.type === 'checkbox' ? t.checked : t.value);
      if (t.dataset.k === 'photo' && t.value) this.uploaded = null;
      this.dirty = true;
      if (t.dataset.pick && e.type === 'change' && this.pick(t)) this.refreshForm();
      this.redraw();
    },
    async onClick(e) {
      const g = this.cur;
      const set = e.target.closest('[data-set]');
      if (set) {
        const v = set.dataset.v;
        if (set.dataset.set === 'look' && g.look !== v) {
          // A new category brings its own look; the words you typed stay,
          // and untouched titles follow the new category.
          const was = g.look; g.look = v; g.style = lookStyle(v);
          Object.entries(this.byTpl).forEach(([tpl, f]) => { if (f.title === TITLES[tpl][was]) f.title = TITLES[tpl][v]; });
        } else if (set.dataset.set === 'tpl' && g.tpl !== v) {
          this.byTpl[g.tpl] = g.f;
          g.tpl = v;
          g.f = this.byTpl[v] || (this.byTpl[v] = defaults(g.look, v));
        } else return;
        this.dirty = true;
        this.render();
        return;
      }
      const sw = e.target.closest('[data-bg], [data-bg2]');
      if (sw && sw.tagName === 'BUTTON') {
        if (sw.hasAttribute('data-bg')) g.style.bg = sw.getAttribute('data-bg'); else g.style.bg2 = sw.getAttribute('data-bg2');
        this.dirty = true;
        document.getElementById('gxStyle').innerHTML = this.styleHTML();
        this.redraw(); return;
      }
      const f = e.target.closest('[data-filter]');
      if (f) { this.filter = f.dataset.filter; this.render(); return; }
      const open = e.target.closest('[data-open]');
      if (open) {
        const item = this.lib.find(x => x.id === open.dataset.open);
        if (item && (!this.dirty || confirm('Open this graphic? Unsaved changes to the current one will be lost.'))) {
          this.cur = upgrade(item); this.byTpl = { [this.cur.tpl]: this.cur.f }; this.uploaded = null; this.dirty = false;
          this.tab = 'create'; this.render();
        }
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const rows = b.dataset.path ? getPath(g.f, b.dataset.path) : null;
      switch (b.dataset.act) {
        case 'save': return this.save(false);
        case 'copy': return this.save(true);
        case 'new': case 'new-open':
          if (this.dirty && b.dataset.act === 'new' && !confirm('Start a new graphic? Unsaved changes will be lost.')) return;
          this.newGraphic(g.look, g.tpl); this.tab = 'create'; this.render(); return;
        case 'delete':
          if (!confirm(`Delete "${g.name || 'this graphic'}" from your saved graphics?`)) return;
          this.lib = this.lib.filter(x => x.id !== g.id);
          await this.persist();
          this.newGraphic(g.look, g.tpl); this.render(); return;
        case 'png': return this.exportPNG([g.size]);
        case 'all-sizes': return this.exportPNG(SIZE_KEYS);
        case 'clear-photo': this.uploaded = null; break;
        case 'add-row': rows.push(g.tpl === 'awards' ? { award: '', player: '', team: '', detail: '' } : { player: '', team: '', value: '', move: '' }); break;
        case 'del-row': rows.splice(+b.dataset.i, 1); break;
        case 'up': { const i = +b.dataset.i; if (i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; break; }
        default: return;
      }
      this.dirty = true;
      document.getElementById('gxForm').innerHTML = this.formHTML();
      this.redraw();
    },

    // ---------- saving
    async save(asCopy) {
      const g = this.cur;
      if (!g.name.trim()) g.name = [LOOKS.find(l => l[0] === g.look)[1], g.f.title || TPLS.find(t => t[0] === g.tpl)[1], new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })].join(' · ');
      const item = clone(g);
      if (/^(data:|blob:)/.test(item.f.photo || '')) item.f.photo = '';
      if (asCopy || !item.id) { item.id = uid(); if (asCopy) item.name = g.name + ' (copy)'; }
      item.updatedAt = Date.now();
      const i = this.lib.findIndex(x => x.id === item.id);
      if (i >= 0) this.lib[i] = item; else this.lib.push(item);
      if (await this.persist()) {
        this.cur = clone(item); this.byTpl = { [item.tpl]: this.cur.f }; this.dirty = false;
        this.msg = `Saved "${item.name}".`; this.render();
      }
    },
    async persist() {
      const C = root.Cloud;
      if (!C || !C.admin || !C.saveGraphics) { this.msg = 'Sign in with an admin account to save.'; this.showMsg(true); return false; }
      try { await C.saveGraphics({ items: this.lib }); return true; }
      catch (e) { console.error('Saving graphics:', e); this.msg = 'Not saved: ' + explain(e); this.showMsg(true); return false; }
    },
    showMsg(err) {
      const el = document.getElementById('gxMsg');
      if (!el) return;
      el.textContent = this.msg || '';
      el.classList.toggle('err', !!err);
      clearTimeout(this.msgTimer);
      if (this.msg && !err) this.msgTimer = setTimeout(() => { this.msg = ''; el.textContent = ''; }, 4000);
    },

    wire(el) {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('input', e => this.onInput(e));
      el.addEventListener('change', e => this.onInput(e));
      el.addEventListener('click', e => this.onClick(e));
      const tabs = document.getElementById('gxTabs');
      if (tabs) tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { this.tab = b.dataset.tab; this.render(); } });
      window.addEventListener('beforeunload', e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    }
  };

  function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o) ?? ''; }
  function setPath(o, p, v) {
    const ks = p.split('.'), last = ks.pop();
    const t = ks.reduce((a, k) => a[k], o);
    t[last] = v;
  }
  function explain(e) {
    const code = (e && e.code) || '';
    if (/permission/i.test(code) || /permission/i.test(e && e.message)) return 'the database rules don\'t allow it yet. Paste the updated firestore.rules into Firebase and publish.';
    if (/unavailable|network/i.test(code)) return 'you seem to be offline.';
    return (e && e.message) || 'something went wrong.';
  }

  // Admin accounts only: the page waits for sign-in, then loads.
  Graphics.start = async function (opts = {}) {
    const sum = document.getElementById('gxSummary');
    const body = document.getElementById('gxBody');
    const tabs = document.getElementById('gxTabs');
    const gate = msg => { if (sum) sum.textContent = msg; if (body) body.innerHTML = `<p class="adm-empty">${esc(msg)}</p>`; if (tabs) tabs.hidden = true; this.el = null; };
    const open = async () => {
      if (!this.cur) await this.load();
      this.el = body;
      this.wire(body);
      if (tabs) tabs.hidden = false;
      if (sum) sum.textContent = 'NBA, Draft and NCAA graphics · download a PNG and finish it in Canva · only admins can see this page';
      this.render();
    };
    if (opts.skipGate) return open();
    const on = root.Cloud ? await root.Cloud.init() : false;
    if (!on) { gate('Accounts aren\'t available right now, so this page can\'t check who you are.'); return; }
    root.Cloud.onChange(() => {
      if (root.Cloud.admin) open();
      else { this.cur = null; gate(root.Cloud.user ? 'This page isn\'t available for this account.' : 'Sign in with an admin account (top right) to view this page.'); }
    });
  };

  Graphics.defaults = defaults;
  Graphics.upgrade = upgrade;
  root.Graphics = Graphics;
  if (typeof document !== 'undefined' && !root.__GRAPHICS_NO_AUTOSTART && document.getElementById('gxBody')) {
    const go = () => Graphics.start();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})(typeof window !== 'undefined' ? window : globalThis);
