// BYTHERIM Graphics (beta): admin-only graphics maker (graphics.html).
// Pick a look (NBA, Draft or NCAA) and a template (statline, weekly
// awards, top performances), fill in the fields, and download a PNG to
// finish in Canva. Saved graphics are one document, graphics/library,
// which the database rules let only admins read or write.
(function (root) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const slug = s => String(s || 'graphic').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'graphic';
  const clone = o => JSON.parse(JSON.stringify(o));

  const LOOKS = [['nba', 'NBA'], ['draft', 'Draft'], ['ncaa', 'NCAA']];
  const TPLS = [['statline', 'Statline'], ['awards', 'Weekly awards'], ['leaders', 'Top performances'], ['overlay', 'Video overlay'], ['cover', 'Cover'], ['thumb', 'Reel thumbnail']];
  const SIZE_KEYS = ['4x5', '1x1', '9x16'];
  const today = () => root.GraphicsDraw.prettyDate(new Date());
  const CLASS = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', INTL: 'International' };

  const AWARDS = {
    nba: ['Player of the Week', 'Rookie of the Week', 'Performance of the Week', 'Defender of the Week', 'Sixth Man of the Week'],
    draft: ['Prospect of the Week', 'Riser of the Week', 'Performance of the Week', 'Defender of the Week', 'Freshman of the Week'],
    ncaa: ['Player of the Week', 'Freshman of the Week', 'Performance of the Week', 'Defender of the Week', 'Upset of the Week']
  };
  const KICKER = { nba: '', draft: '', ncaa: '' };

  function defaults(look, tpl) {
    const k = KICKER[look] || '';
    if (tpl === 'awards') return {
      kicker: 'Week 1', title: 'Weekly Awards', note: today(),
      rows: AWARDS[look].map(award => ({ award, player: 'Player Name', team: '', detail: '00.0 PTS · 00.0 REB · 00.0 AST' }))
    };
    if (tpl === 'leaders') return {
      kicker: 'This week', title: 'Top Performances', note: today(), valueLabel: 'PTS',
      rows: Array.from({ length: 5 }, () => ({ player: 'Player Name', team: '', value: '00', detail: '00 REB · 00 AST' }))
    };
    if (tpl === 'thumb') return {
      series: 'perf', kicker: '', photo: '', tint: '35',
      player: 'Player Name', result: 'W', score: '00-00', where: 'vs', opp: 'Opponent', line: '', value: '00', label: 'PTS',
      term: 'TS%', explain: 'Why *scoring efficiency* beats points per game', formula: '',
      teamA: 'Team A', scoreA: '00', teamB: 'Team B', scoreB: '00', headline: 'What *happened* in the game', context: '',
      team: '', note: ''
    };
    if (tpl === 'cover') return { title: 'BEAST', sub: '', swipe: true, swipeText: 'Swipe for the stats', player: '', photo: '', tint: '0' };
    if (tpl === 'overlay') return {
      layout: 'stat', pos: 'low', opacity: '', where: 'vs', opp: 'Opponent', result: 'W', score: '00-00',
      player: 'Player Name', team: '', info: '', photo: '',
      stats: ['PTS', 'REB', 'AST', 'MIN'].map(label => ({ label, value: '00' })),
      shooting: 'FG 0-0 • 3P 0-0 • FT 0-0'
    };
    return {
      note: today(), where: 'vs', opp: 'Opponent', result: 'W', score: '00-00',
      player: 'Player Name', team: '', info: '', photo: '',
      stats: ['PTS', 'REB', 'AST', 'MIN'].map(label => ({ label, value: '00' })),
      shooting: 'FG 0-0 • 3P 0-0 • FT 0-0'
    };
  }
  function blank(look = 'nba', tpl = 'statline') {
    return { id: null, name: '', look, tpl, size: '4x5', style: { bg: '', frame: '' }, f: defaults(look, tpl) };
  }
  // Graphics saved while the page tried other layouts open in these three.
  const LATER = { single: 'statline', list: 'leaders', columns: 'leaders' };
  function upgrade(item) {
    const g = clone(item);
    g.style = Object.assign({ bg: '', frame: '' }, g.style && LATER[g.tpl] ? {} : g.style || {});
    if (!LATER[g.tpl]) return g;
    const f = g.f || {}, nf = defaults(g.look, LATER[g.tpl]);
    ['kicker', 'title', 'photo', 'player', 'team', 'line'].forEach(k => { if (f[k] && k in nf) nf[k] = f[k]; });
    const rows = g.tpl === 'columns' ? [...((f.left && f.left.rows) || []), ...((f.right && f.right.rows) || [])] : f.rows;
    if (rows) nf.rows = rows.slice(0, 10).map(r => ({ player: r.player || '', team: r.team || '', value: r.value || '', detail: '' }));
    return Object.assign(g, { tpl: LATER[g.tpl], f: nf });
  }

  // A board prospect's newest season as one short line.
  function seasonOf(p) {
    const s = (p.seasons && p.seasons[0] && p.seasons[0].stats) || p.sheetStats || {};
    return s;
  }
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
      this.cur = blank(look || (this.cur && this.cur.look) || 'nba', tpl || 'statline');
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
      const g = this.cur, D = root.GraphicsDraw;
      const seg = (name, list, val) => `<div class="gx-seg" role="group">${list.map(([v, l]) => `<button type="button" data-set="${name}" data-v="${v}" class="${val === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
      return `<div class="gx-grid">
        <div class="gx-edit">
          <div class="card gx-panel">
            <div class="gx-row">${seg('look', LOOKS, g.look)}</div>
            <div class="gx-row">${seg('tpl', TPLS, g.tpl)}</div>
            <div class="gx-fields2">
              ${(g.tpl === 'overlay' || g.tpl === 'thumb') ? `<div class="site-field"><span>Size</span><div class="gx-fixed">1080 × 1920${g.tpl === 'overlay' ? ', transparent' : ''}</div></div>` : `<label class="site-field"><span>Size</span><select data-set-select="size">${SIZE_KEYS.map(k => `<option value="${k}"${g.size === k ? ' selected' : ''}>${esc(D.SIZES[k].label)}</option>`).join('')}</select></label>`}
              <label class="site-field"><span>Saved as</span><input type="text" data-name value="${esc(g.name)}" placeholder="Name it to save (e.g. NBA awards wk 1)"></label>
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
          <div class="gx-canvas-wrap gx-${g.tpl === 'overlay' || g.tpl === 'thumb' ? '9x16' : g.size}${g.tpl === 'overlay' ? ' gx-clear' : ''}"><canvas id="gxCanvas" aria-label="Graphic preview"></canvas></div>
          <div class="gx-actions gx-export">
            <button type="button" class="sim-btn" data-act="png">Download PNG</button>
            ${g.tpl === 'overlay' || g.tpl === 'thumb' ? '' : '<button type="button" class="sim-btn sim-btn-secondary" data-act="all-sizes">All 3 sizes</button>'}
            <label class="gx-check"><input type="checkbox" data-hd ${this.hd ? 'checked' : ''}> 2x (sharper in Canva)</label>
          </div>
          ${g.tpl === 'overlay' ? `<label class="gx-check"><input type="checkbox" data-guides ${this.guides === false ? '' : 'checked'}> Show the TikTok / Reels safe area (preview only)</label>
          <p class="adm-note">The PNG is transparent. Drop it on top of your clip in CapCut, Premiere or Canva video. Keep it inside the dashed lines so the app's buttons and caption don't cover it.</p>` : ''}
          <p class="adm-note">In Canva: Uploads, then drag the PNG onto a 1080 px design. A background photo sits behind everything; drag the preview to move it. With no photo, the statline panel stays open for a cutout.</p>
        </div>
      </div>`;
    },
    // Background color and frame: the category's look is the starting point.
    styleHTML() {
      const g = this.cur, D = root.GraphicsDraw, def = D.LOOKS[g.look].bg, cur = g.style.bg || def;
      const list = [def, ...D.SWATCHES.filter(c => c !== def)];
      if (g.tpl === 'overlay') return `<div class="site-field"><span>Card color</span><div class="gx-swatches">${list.map(c => `<button type="button" class="gx-sw${cur.toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-bg="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
            <input type="color" data-bg-pick value="${esc(cur)}" aria-label="Custom color"></div></div>
        <h3 class="gx-h3">Headshot <small>optional, shows in the top-left of the card (Stat card layout)</small></h3>
        <div class="gx-photo">
          <label class="site-field"><span>Photo URL</span><input type="text" data-k="photo" value="${esc(getPath(g.f, 'photo'))}" placeholder="https://… (optional)"></label>
          <label class="sim-btn sim-btn-secondary btn-sm gx-upload">Upload photo<input type="file" accept="image/*" data-upload hidden></label>
        </div>
        ${this.uploaded ? '<p class="adm-note">Using an uploaded photo. Uploads aren\'t saved with the graphic. <button type="button" class="gx-link" data-act="clear-photo">Remove</button></p>' : ''}`;
      return `<div class="gx-fields2">
          <div class="site-field"><span>Background</span><div class="gx-swatches">${list.map(c => `<button type="button" class="gx-sw${cur.toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-bg="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
            <input type="color" data-bg-pick value="${esc(cur)}" aria-label="Custom color"></div></div>
          <label class="site-field"><span>Frame</span><select data-style="frame">${[['', 'No frame'], ['gold', 'Gold'], ['silver', 'Silver'], ['white', 'White']].map(([v, l]) => `<option value="${v}"${(g.style.frame || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        ${this.photoHTML()}`;
    },
    // One background photo for every template: full size, behind
    // everything, moved by dragging the preview or with the sliders.
    photoHTML() {
      const f = this.cur.f;
      const fld = (k, label, ph = '') => `<label class="site-field"><span>${label}</span><input type="text" data-k="${k}" value="${esc(getPath(f, k))}" placeholder="${esc(ph)}"></label>`;
      const has = !!(f.photo || this.uploaded);
      const rng = (k, label, min, max, def) => `<label class="site-field gx-range"><span>${label} <b data-out="${k}">${esc(getPath(f, k) === '' ? def : getPath(f, k))}</b></span><input type="range" min="${min}" max="${max}" step="1" data-k="${k}" value="${esc(getPath(f, k) === '' ? def : getPath(f, k))}"></label>`;
      return `<h3 class="gx-h3">Background photo <small>fills the graphic behind everything; drag the preview to move it, scroll on it to zoom</small></h3>
          <div class="gx-photo">
            ${fld('photo', 'Photo URL', 'https://… (optional)')}
            <label class="sim-btn sim-btn-secondary btn-sm gx-upload">Upload photo<input type="file" accept="image/*" data-upload hidden></label>
          </div>
          ${this.uploaded ? '<p class="adm-note">Using an uploaded photo. Uploads aren\'t saved with the graphic. <button type="button" class="gx-link" data-act="clear-photo">Remove</button></p>' : ''}
          ${has ? `<div class="gx-sliders">
            ${rng('zoom', 'Size %', 100, 300, 100)}
            ${rng('tint', 'Darken %', 0, 95, 35)}
            ${rng('shade', 'Edge shadow %', 0, 100, 70)}
            ${rng('photoX', 'Left ↔ right', 0, 100, 50)}
            ${rng('photoY', 'Top ↕ bottom', 0, 100, 30)}
          </div>
          <button type="button" class="gx-link" data-act="reset-photo">Reset size and position</button>` : ''}`;
    },
    formHTML() {
      const g = this.cur, f = g.f;
      const fld = (k, label, ph = '', extra = '') => `<label class="site-field"><span>${label}</span><input type="text" data-k="${k}" value="${esc(getPath(f, k))}" placeholder="${esc(ph)}" ${extra}></label>`;
      const players = (g.look === 'draft' || g.look === 'ncaa') && this.board ? 'list="gxProspects"' : '';
      const teamPh = g.look === 'nba' ? 'Lakers, LAL, Boston Celtics…' : 'School (logo loads from the name)';
      const label = `<label class="gx-check"><input type="checkbox" data-k="noLabel" ${f.noLabel ? 'checked' : ''}> Hide “${esc(root.GraphicsDraw.LOOKS[g.look].name.toUpperCase())}” under the logo</label>`;
      const weekBtn = '<button type="button" class="gx-link" data-act="week-of">Use “Week of …” for the date</button>';
      const sel = (k, label, opts, def) => `<label class="site-field"><span>${label}</span><select data-k="${k}">${opts.map(([v, l]) => `<option value="${v}"${(f[k] || def) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
      const ovTop = `<div class="gx-fields2">${sel('layout', 'Layout', [['stat', 'Stat card'], ['big', 'Big number']], 'stat')}${sel('pos', 'Where it sits', [['low', 'Lower (above the caption)'], ['mid', 'Middle'], ['top', 'Top']], 'low')}</div>
        <label class="site-field gx-range"><span>Card opacity <b data-out="opacity">${esc(f.opacity === '' || f.opacity == null ? 96 : f.opacity)}</b></span><input type="range" min="40" max="100" step="1" data-k="opacity" value="${esc(f.opacity === '' || f.opacity == null ? 96 : f.opacity)}"></label>`;
      const top = g.tpl === 'overlay' ? ovTop : g.tpl === 'statline' ? `${fld('note', 'Date', 'Oct 7th, 2026')}${label}` : `<div class="gx-fields2">
          <div>${fld('note', 'Date', 'Oct 7th, 2026')}${weekBtn}</div>
          ${fld('kicker', 'Small line over the title', 'Week 1')}
        </div>
        ${fld('title', 'Title', 'Weekly Awards')}${label}`;
      const datalist = players ? `<datalist id="gxProspects">${this.board.map(p => `<option value="${esc(p.name)}">${esc([p.rank ? '#' + p.rank : '', p.school].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>` : '';
      if (g.tpl === 'thumb') {
        const ser = f.series || 'perf';
        const tabs = [['perf', 'Standout performance'], ['numbers', 'Learning the numbers'], ['recap', 'Game / series recap'], ['news', 'Player news']];
        const hl = '<p class="adm-note">Put *asterisks* around words to color them.</p>';
        const body = {
          perf: `${fld('kicker', 'Tag', 'Standout performance')}${fld('player', 'Player', 'Player name', players + ' data-pick="statline"')}
            ${fld('line', 'Small line (optional)', 'Career night in a big one')}
            <div class="gx-fields2">${fld('value', 'Big number', '48')}${fld('label', 'Label', 'PTS')}</div>
            <div class="gx-game"><label class="site-field"><span>Where</span><select data-k="where">${[['vs', 'vs'], ['@', '@']].map(([v, l]) => `<option value="${v}"${(f.where || 'vs') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${fld('opp', 'Opponent', 'Duke')}
            <label class="site-field"><span>Result</span><select data-k="result">${[['W', 'W'], ['L', 'L'], ['', 'None']].map(([v, l]) => `<option value="${v}"${(f.result || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${fld('score', 'Score', '92-88')}</div>`,
          numbers: `${fld('kicker', 'Series tag', 'Learning the numbers')}${fld('term', 'Term', 'TS%')}
            ${fld('explain', 'One line explaining it', 'Why *scoring efficiency* beats points per game')}${hl}
            ${fld('formula', 'Formula or example (optional)', 'PTS / (2 × (FGA + 0.44 × FTA))')}
            <p class="adm-note">This one is mostly flat color. A photo is optional and sits behind the lower part.</p>`,
          recap: `${fld('kicker', 'Tag', 'Game recap')}
            <div class="gx-fields2">${fld('teamA', 'Team', 'Kansas', 'data-logo')}${fld('scoreA', 'Score', '78')}</div>
            <div class="gx-fields2">${fld('teamB', 'Team', 'Duke', 'data-logo')}${fld('scoreB', 'Score', '74')}</div>
            ${fld('headline', 'Headline', 'Kansas *survives* a late run')}${hl}
            ${fld('context', 'Small line (optional)', 'Series tied 1-1')}`,
          news: `${fld('kicker', 'Tag', 'Player news')}
            ${fld('headline', 'Headline', '*Declares* for the draft')}${hl}
            <div class="gx-fields2">${fld('player', 'Player', 'Player name', players + ' data-pick="statline"')}${fld('team', 'Team', 'Kentucky')}</div>
            ${fld('note', 'Top-right note (optional)', 'Oct 20')}`
        }[ser];
        return `<div class="gx-seg" role="tablist">${tabs.map(([v, l]) => `<button type="button" class="gx-seg-b${ser === v ? ' on' : ''}" data-series="${v}">${l}</button>`).join('')}</div>
          ${body}<p class="adm-note">Everything important stays inside the middle of the cover so it survives the profile-grid crop.</p>${datalist}`;
      }
      if (g.tpl === 'cover') return `${fld('player', 'Player (fills the photo from the board)', 'Optional', players + ' data-pick="cover"')}
        ${fld('title', 'Big word', 'BEAST')}
        <p class="adm-note">Two or more words split onto two lines on their own. Keep it short so it reads on the grid.</p>
        ${fld('sub', 'Small line over it (optional)', '48 PTS ON 17 SHOTS')}
        <label class="gx-check"><input type="checkbox" data-k="swipe" ${f.swipe !== false ? 'checked' : ''}> Show the swipe line</label>
        ${f.swipe !== false ? fld('swipeText', 'Swipe line', 'Swipe for the stats') : ''}${datalist}`;
      if (g.tpl === 'statline' || g.tpl === 'overlay') {
        return `${top}
          <h3 class="gx-h3">Game</h3>
          <div class="gx-game">
            <label class="site-field"><span>Where</span><select data-k="where">${[['vs', 'vs'], ['@', '@']].map(([v, l]) => `<option value="${v}"${(f.where || 'vs') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${fld('opp', 'Opponent', g.look === 'nba' ? 'ORL (logo loads from the name)' : 'Pittsburgh St.')}
            <label class="site-field"><span>Result</span><select data-k="result">${[['W', 'W'], ['L', 'L'], ['', 'None']].map(([v, l]) => `<option value="${v}"${(f.result || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${fld('score', 'Score', '122-118')}
          </div>
          <h3 class="gx-h3">Player</h3>
          ${fld('player', 'Name', 'Player name', players + ' data-pick="statline"')}
          <div class="gx-fields2">
            ${fld('team', 'Team', teamPh)}
            ${fld('info', 'More (optional)', g.look === 'nba' ? 'Guard' : 'SF • Freshman')}
          </div>
          <h3 class="gx-h3">Stats <small>leave a box empty to drop it; up to ${g.tpl === 'overlay' ? 4 : 5}; the first is in the accent color${g.tpl === 'overlay' ? ' (the Big number layout features the first)' : ''}</small></h3>
          <div class="gx-stats">${(f.stats || []).map((s, i) => `<div class="gx-stat">
              <input type="text" data-k="stats.${i}.value" value="${esc(s.value)}" placeholder="00" aria-label="Value ${i + 1}">
              <input type="text" data-k="stats.${i}.label" value="${esc(s.label)}" placeholder="LABEL" aria-label="Label ${i + 1}">
            </div>`).join('')}
            ${(f.stats || []).length < (g.tpl === 'overlay' ? 4 : 5) ? '<button type="button" class="gx-add" data-act="add-stat" aria-label="Add a stat">+</button>' : ''}</div>
          ${g.tpl === 'overlay' && f.layout === 'big' ? '' : fld('shooting', 'Shooting line', 'FG 4-7 • 3P 2-3 • FT 6-7')}
          ${datalist}`;
      }
      const rows = f.rows || [];
      const max = g.tpl === 'awards' ? 6 : 10;
      return `${top}
        ${g.tpl === 'leaders' ? `<div class="gx-fields2">${fld('valueLabel', 'Number label', 'PTS')}</div>` : ''}
        <h3 class="gx-h3">${g.tpl === 'awards' ? 'Awards' : 'Rows'} <small>${rows.length} of ${max}${g.tpl === 'leaders' ? ' · in order, #1 first' : ''}</small></h3>
        <ol class="gx-rows">${rows.map((r, i) => `<li>
          <div class="gx-rowf ${g.tpl}">
            ${g.tpl === 'awards' ? `<input type="text" data-k="rows.${i}.award" value="${esc(r.award)}" placeholder="Award" aria-label="Award">` : ''}
            <input type="text" data-k="rows.${i}.player" value="${esc(r.player)}" placeholder="Player" aria-label="Player" ${players} data-pick="row" data-i="${i}">
            <input type="text" data-k="rows.${i}.team" value="${esc(r.team)}" placeholder="Team" aria-label="Team">
            ${g.tpl === 'leaders' ? `<input type="text" data-k="rows.${i}.value" value="${esc(r.value)}" placeholder="00" aria-label="Number" class="gx-num">` : ''}
            <input type="text" data-k="rows.${i}.detail" value="${esc(r.detail)}" placeholder="Stat line" aria-label="Detail" class="gx-detail">
          </div>
          <span class="gx-rowbtns">
            <button type="button" class="lg-x" data-act="up" data-i="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button>
            <button type="button" class="lg-x" data-act="del-row" data-i="${i}" aria-label="Remove">×</button>
          </span></li>`).join('')}</ol>
        ${rows.length < max ? '<button type="button" class="sim-btn sim-btn-secondary btn-sm" data-act="add-row">Add row</button>' : ''}
        ${datalist}`;
    },
    savedHTML() {
      const list = this.lib.filter(x => this.filter === 'all' || x.look === this.filter)
        .slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const chips = [['all', 'All'], ...LOOKS].map(([v, l]) => `<button type="button" data-filter="${v}" class="${this.filter === v ? 'on' : ''}">${l}</button>`).join('');
      return `<div class="site-bar gx-bar"><div class="gx-seg">${chips}</div>
          <button type="button" class="sim-btn btn-sm" data-act="new-open">New graphic</button></div>
        ${list.length ? `<div class="gx-lib">${list.map(x => `<button type="button" class="gx-item" data-open="${esc(x.id)}">
            <span class="gx-item-top"><i class="gx-dot" style="background:${esc((x.style && x.style.bg) || root.GraphicsDraw.LOOKS[x.look].bg)}"></i><span class="gx-chip gx-chip-${esc(x.look)}">${esc((LOOKS.find(l => l[0] === x.look) || ['', x.look])[1])}</span></span>
            <b>${esc(x.name || 'Untitled')}</b>
            <small>${esc((TPLS.find(t => t[0] === x.tpl) || ['', x.tpl])[1])} · ${esc(x.f && x.f.title || '')}</small>
            <small>${x.updatedAt ? 'Saved ' + new Date(x.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</small>
          </button>`).join('')}</div>`
        : `<p class="adm-empty">${this.lib.length ? 'Nothing saved in this look yet.' : 'No saved graphics yet. Make one and press Save graphic.'}</p>`}`;
    },

    // ---------- preview
    redraw() {
      clearTimeout(this.drawTimer);
      this.drawTimer = setTimeout(() => {
        const c = document.getElementById('gxCanvas');
        if (!c || !root.GraphicsDraw) return;
        const token = this.drawToken = (this.drawToken || 0) + 1;
        const off = document.createElement('canvas');
        root.GraphicsDraw.draw(off, this.drawable()).then(() => {
          if (token !== this.drawToken || !off.width) return;
          c.width = off.width; c.height = off.height;
          const ctx = c.getContext && c.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(off, 0, 0);
            if (this.cur.tpl === 'overlay' && this.guides !== false) {
              const S = root.GraphicsDraw.SAFE, k = c.width / root.GraphicsDraw.W;
              ctx.save(); ctx.setLineDash([14 * k, 10 * k]); ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
              ctx.strokeRect(S.left * k, S.top * k, (root.GraphicsDraw.W - S.left - S.right) * k, (c.height - (S.top + S.bottom) * k));
              ctx.restore();
            }
          }
        }).catch(e => console.warn('Preview:', e));
      }, 90);
    },
    drawable(size) {
      const g = clone(this.cur);
      if (size) g.size = size;
      if (this.uploaded) g.f.photo = this.uploaded;
      return g;
    },
    async exportPNG(sizes) {
      const g = this.cur;
      for (const size of sizes) {
        const c = document.createElement('canvas');
        await root.GraphicsDraw.draw(c, this.drawable(size), { scale: this.hd ? 2 : 1 });
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

    // ---------- board prospects (Draft and NCAA looks)
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
      const f = this.cur.f, isPh = v => !v || /^(team|0+|00\.0.*|00 .*|player name)$/i.test(String(v).trim());
      if (input.dataset.pick === 'cover') {
        f.player = p.name;
        if (p.image && !this.uploaded) f.photo = p.image;
      } else if (input.dataset.pick === 'statline') {
        f.player = p.name;
        f.team = p.isPro ? 'Pro' : p.school;
        f.info = [p.pos, CLASS[p.cls] || p.cls].filter(Boolean).join(' • ');
        if (p.image && !this.uploaded) f.photo = p.image;
        const s = seasonOf(p);
        if (s.PTS != null && f.stats.every(x => isPh(x.value))) {
          f.stats = ['PTS', 'REB', 'AST', 'MIN'].map(label => { const v = s[label === 'MIN' ? 'MP' : label]; return { label, value: v != null ? String(v) : '' }; });
          const sh = [['TS%', 'TS'], ['3P%', '3P'], ['FT%', 'FT']].filter(([k]) => s[k] != null).map(([k, l]) => `${l} ${s[k]}${/%$/.test(s[k]) ? '' : '%'}`);
          if (sh.length) f.shooting = sh.join(' • ');
          if (p.seasons && p.seasons[0] && p.seasons[0].label) f.line = `${p.seasons[0].label} season · per game`;
        }
      } else {
        const r = f.rows[+input.dataset.i];
        r.player = p.name;
        if (isPh(r.team)) r.team = p.isPro ? 'Pro' : p.school;
        if (isPh(r.detail)) r.detail = seasonLine(p);
      }
      return true;
    },

    // ---------- events
    onInput(e) {
      const t = e.target;
      if (t.matches('[data-hd]')) { this.hd = t.checked; return; }
      if (t.matches('[data-guides]')) { this.guides = t.checked; this.redraw(); return; }
      if (t.matches('[data-style]')) { this.cur.style[t.dataset.style] = t.value; this.dirty = true; this.redraw(); return; }
      if (t.matches('[data-bg-pick]')) {
        this.cur.style.bg = t.value; this.dirty = true; this.redraw();
        if (e.type === 'change') document.getElementById('gxStyle').innerHTML = this.styleHTML();
        return;
      }
      if (t.matches('[data-name]')) { this.cur.name = t.value; this.dirty = true; return; }
      if (t.matches('[data-set-select]')) {
        this.cur.size = t.value; this.dirty = true;
        const w = this.el.querySelector('.gx-canvas-wrap'); if (w) w.className = `gx-canvas-wrap gx-${t.value}`;
        this.redraw(); return;
      }
      if (t.matches('[data-upload]') && e.type === 'change') {
        const file = t.files && t.files[0];
        if (!file) return;
        const rd = new FileReader();
        rd.onload = () => { this.uploaded = rd.result; this.cur.f.photo = ''; document.getElementById('gxStyle').innerHTML = this.styleHTML(); this.redraw(); };
        rd.readAsDataURL(file);
        return;
      }
      if (!t.dataset.k) return;
      setPath(this.cur.f, t.dataset.k, t.type === 'checkbox' ? t.checked : t.value);
      if (t.dataset.k === 'photo' && t.value) this.uploaded = null;
      if (t.type === 'range') { const o = this.el.querySelector(`[data-out="${t.dataset.k}"]`); if (o) o.textContent = t.value; }
      if (t.dataset.k === 'photo' && e.type === 'change') document.getElementById('gxStyle').innerHTML = this.styleHTML();
      this.dirty = true;
      if ((t.dataset.k === 'layout' || t.dataset.k === 'swipe') && e.type === 'change') document.getElementById('gxForm').innerHTML = this.formHTML();
      if (t.dataset.pick && e.type === 'change' && this.pick(t)) { document.getElementById('gxForm').innerHTML = this.formHTML(); document.getElementById('gxStyle').innerHTML = this.styleHTML(); }
      this.redraw();
    },
    async onClick(e) {
      const set = e.target.closest('[data-set]');
      if (set) {
        const g = this.cur, v = set.dataset.v;
        if (set.dataset.set === 'look' && g.look !== v) {
          // A new look keeps everything you typed; only untouched eyebrows,
          // award names and the default stat set follow the new look.
          const was = g.look; g.look = v; g.style.bg = '';
          Object.values(this.byTpl).forEach(f => {
            if (f.kicker && f.kicker.startsWith(KICKER[was])) f.kicker = KICKER[v] + f.kicker.slice(KICKER[was].length);
            (f.rows || []).forEach((r, i) => { if (r.award === AWARDS[was][i]) r.award = AWARDS[v][i]; });
          });
        } else if (set.dataset.set === 'tpl' && g.tpl !== v) {
          this.byTpl[g.tpl] = g.f;
          const was0 = g.tpl;
          g.tpl = v;
          const fresh = !this.byTpl[v];
          g.f = this.byTpl[v] || (this.byTpl[v] = defaults(g.look, v));
          // The background photo comes along to the new template.
          (fresh && v === 'cover' ? ['photo', 'zoom', 'photoX', 'photoY'] : ['photo', 'zoom', 'photoX', 'photoY', 'tint', 'shade']).forEach(k => { g.f[k] = this.byTpl[was0][k] ?? ''; });
          // Statline and Video overlay share a player, so a new one starts from the other's.
          if (fresh && ['statline', 'overlay'].includes(was0) && ['statline', 'overlay'].includes(v)) ['where', 'opp', 'result', 'score', 'player', 'team', 'info', 'stats', 'shooting'].forEach(k => { g.f[k] = clone(this.byTpl[was0][k]); });
          const fixed = t => t === 'overlay' || t === 'thumb';
          if (fixed(v)) { if (!fixed(was0)) this.sizeBefore = g.size; g.size = '9x16'; } else if (fixed(was0)) g.size = this.sizeBefore && this.sizeBefore !== '9x16' ? this.sizeBefore : '4x5';
        } else return;
        this.dirty = true;
        this.render();
        return;
      }
      const sb = e.target.closest('button[data-series]');
      if (sb) { this.cur.f.series = sb.dataset.series; this.dirty = true; this.render(); return; }
      const sw = e.target.closest('button[data-bg]');
      if (sw) {
        this.cur.style.bg = sw.dataset.bg === root.GraphicsDraw.LOOKS[this.cur.look].bg ? '' : sw.dataset.bg;
        this.dirty = true; document.getElementById('gxStyle').innerHTML = this.styleHTML(); this.redraw(); return;
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
      const g = this.cur, rows = g.f.rows;
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
        case 'clear-photo': this.uploaded = null; document.getElementById('gxStyle').innerHTML = this.styleHTML(); this.redraw(); return;
        case 'reset-photo': Object.assign(g.f, { zoom: '', photoX: '', photoY: '', tint: '', shade: '' }); document.getElementById('gxStyle').innerHTML = this.styleHTML(); this.redraw(); return;
        case 'week-of': {
          const d = new Date(), day = (d.getDay() + 6) % 7, a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day), z = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
          const m = x => x.toLocaleDateString('en-US', { month: 'short' });
          g.f.note = `Week of ${m(a)} ${a.getDate()}–${m(z) === m(a) ? '' : m(z) + ' '}${z.getDate()}`;
          break;
        }
        case 'add-stat': g.f.stats.push({ label: '', value: '' }); break;
        case 'add-row': rows.push(g.tpl === 'awards' ? { award: '', player: '', team: '', detail: '' } : { player: '', team: '', value: '', detail: '' }); break;
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

    syncSliders() {
      ['zoom', 'photoX', 'photoY', 'tint', 'shade'].forEach(k => {
        const v = this.cur.f[k];
        if (v === '' || v == null) return;
        const r = this.el.querySelector(`input[type=range][data-k="${k}"]`); if (r) r.value = v;
        const o = this.el.querySelector(`[data-out="${k}"]`); if (o) o.textContent = v;
      });
    },
    wire(el) {
      if (el.dataset.wired) return;
      el.dataset.wired = '1';
      el.addEventListener('input', e => this.onInput(e));
      el.addEventListener('change', e => this.onInput(e));
      el.addEventListener('click', e => this.onClick(e));
      // Drag the preview to move the background photo; scroll to zoom it.
      el.addEventListener('pointerdown', e => {
        if (e.target.id !== 'gxCanvas' || this.cur.tpl === 'overlay' || !(this.cur.f.photo || this.uploaded)) return;
        const f = this.cur.f, num = (v, d) => (v === '' || v == null ? d : +v);
        const start = { x: e.clientX, y: e.clientY, px: num(f.photoX, 50), py: num(f.photoY, 30), w: e.target.clientWidth, h: e.target.clientHeight };
        e.target.setPointerCapture(e.pointerId);
        const move = ev => {
          const k = 1.4;
          f.photoX = String(Math.round(Math.max(0, Math.min(100, start.px - (ev.clientX - start.x) / start.w * 100 * k))));
          f.photoY = String(Math.round(Math.max(0, Math.min(100, start.py - (ev.clientY - start.y) / start.h * 100 * k))));
          this.syncSliders(); this.dirty = true; this.redraw();
        };
        const up = () => { e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); };
        e.target.addEventListener('pointermove', move); e.target.addEventListener('pointerup', up);
      });
      el.addEventListener('wheel', e => {
        if (e.target.id !== 'gxCanvas' || this.cur.tpl === 'overlay' || !(this.cur.f.photo || this.uploaded)) return;
        e.preventDefault();
        const f = this.cur.f, z = f.zoom === '' || f.zoom == null ? 100 : +f.zoom;
        f.zoom = String(Math.max(100, Math.min(300, Math.round(z - Math.sign(e.deltaY) * 5))));
        this.syncSliders(); this.dirty = true; this.redraw();
      }, { passive: false });
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
      if (sum) sum.textContent = 'NBA, Draft and NCAA templates · download a PNG and finish it in Canva · only admins can see this page';
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
