// ============================================================
// Draft RP
//
// Reads the SAME IndexedDB save the NCAA RP writes ("ByTheRimUniverse"),
// so the draft class is exactly the players who declared in college.
// Two views: a model-generated master board, and a big board the user
// builds themselves after digging through every prospect's full stat
// line.
// ============================================================

const DraftRP = {
  state: {
    loaded: false,
    seasonYear: null,      // the NCAA season year, e.g. 2028 for 2028-29
    draftYear: null,       // the draft that season feeds, e.g. 2029
    prospects: [],         // full prospect pool, each with a score
    masterBoard: [],       // top 30, model order
    customOrder: [],       // array of player ids, user's ordering
    view: 'master',
    poolSearch: '',
    poolPos: 'ALL',
    poolSort: 'score',
    statMode: 'box',
    league: null,          // synthesised NBA season behind the lottery
    mock: null,            // generated mock draft
    mockTeamFilter: 'ALL',
    expanded: null         // prospect id whose detail row is open
  },

  CUSTOM_BOARD_KEY: 'bytherim-draft-board',
  BOARD_SIZE: 30,

  // ---------- Theme (shared behaviour with the NCAA RP page) ----------

  THEME_KEY: 'bytherim-rp-theme',

  initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(this.THEME_KEY); } catch (e) { /* storage blocked */ }
    this.applyTheme(saved || 'system');
  },

  applyTheme(mode) {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    try { localStorage.setItem(this.THEME_KEY, mode); } catch (e) { /* storage blocked */ }
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-theme-mode') === mode);
    });
  },

  // ---------- Loading the shared save ----------

  async init() {
    this.initTheme();
    await this.loadFromSave();
    this.render();
  },

  async loadFromSave() {
    const statusEl = document.getElementById('draftStatus');

    if (typeof db === 'undefined' || !db.leagueState) {
      this.showEmpty('Could not open the save database. Make sure Dexie loaded correctly.');
      return;
    }

    let saved, players, teams;
    try {
      saved = await db.leagueState.get(1);
      players = await db.players.toArray();
      teams = await db.teams.toArray();
    } catch (err) {
      console.error('Draft RP: error reading save', err);
      this.showEmpty('Something went wrong reading your save.');
      return;
    }

    if (!saved || !players || players.length === 0) {
      this.showEmpty('No NCAA RP save found. Start a save in the NCAA RP and simulate a season — declared players will show up here.');
      return;
    }

    // The season these declarations came from. Once the offseason has been
    // advanced, currentYear has already rolled forward, so prefer the
    // recorded declaration season and only fall back to currentYear.
    this.state.seasonYear = (saved.lastDeclarationsYear !== null && saved.lastDeclarationsYear !== undefined)
      ? saved.lastDeclarationsYear
      : saved.currentYear;
    // A 2028-29 season feeds the 2029 draft.
    this.state.draftYear = (this.state.seasonYear || 2028) + 1;

    // The declaration list is snapshotted during the offseason, so prefer
    // that; fall back to the live list when the draft is being viewed
    // before the offseason has been advanced.
    const declarations = (saved.lastDeclarations && saved.lastDeclarations.length)
      ? saved.lastDeclarations
      : (saved.draftDeclarations || []);

    if (declarations.length === 0) {
      this.showEmpty(`No players have declared for the ${this.state.draftYear} draft yet. Finish the NCAA Tournament in the NCAA RP first.`);
      return;
    }

    // Match declarations back to full player records so we get complete
    // stat lines, not just the summary stored on the declaration.
    const byId = {};
    players.forEach(p => { byId[p.id] = p; });

    // Team win percentages come from the archived season so the scoring
    // matches what the college page showed at season's end.
    const winPctFor = this.buildWinPctLookup(teams, this.state.seasonYear);

    // Prefer the live player record when the player is still on a roster
    // (draft viewed mid-season); otherwise use the declaration snapshot,
    // which carries the full stat line captured at declaration time.
    const pool = declarations
      .map(d => {
        const live = byId[d.id];
        if (live && live.stats && live.stats.gp !== undefined) return live;
        return this.declarationToPlayer(d);
      })
      .filter(Boolean);

    this.state.prospects = DraftCore.buildBigBoard(pool, winPctFor, pool.length)
      .map(entry => ({ ...entry, tags: DraftCore.scoutingTags(entry) }));

    this.state.masterBoard = this.state.prospects.slice(0, this.BOARD_SIZE);
    this.buildMock();
    this.loadCustomBoard();
    this.state.loaded = true;

    if (statusEl) {
      statusEl.innerText = `${this.state.prospects.length} declared prospects · ${this.state.draftYear} NBA Draft`;
    }
  },

  // Player records don't carry team results, so build a school -> win%
  // lookup from the saved teams. Each team archives its finished seasons
  // in `history`, which is what we want at draft time; if the draft is
  // being viewed mid-season, fall back to the live record.
  buildWinPctLookup(teams, seasonYear) {
    const map = {};
    (teams || []).forEach(t => {
      const hist = (t.history || []).find(h => h.year === seasonYear);
      let w = null, l = null;
      if (hist) { w = hist.wins; l = hist.losses; }
      else if (t.simData) { w = t.simData.wins; l = t.simData.losses; }
      const gp = (w || 0) + (l || 0);
      map[t.school] = gp > 0 ? w / gp : 0.5;
    });
    return (school) => (map[school] !== undefined ? map[school] : 0.5);
  },

  // A declared player who is no longer in the players table (already
  // graduated out of the active pool) still deserves a board slot, built
  // from what the declaration itself recorded.
  declarationToPlayer(d) {
    if (!d || !d.name) return null;
    return {
      id: d.id, name: d.name, school: d.school, pos: d.pos, class: d.class,
      conference: d.conference || '', rating: d.rating,
      ht: d.ht || '', wt: d.wt || '', hometown: d.hometown || '',
      hs: d.hs || '', jersey: d.jersey || '', rsci: d.rsci || null,
      collegeHistory: d.collegeHistory || (d.school ? [d.school] : []),
      // Full stats when the snapshot captured them; the three-stat summary
      // is only a last resort for saves written before that was recorded.
      stats: d.stats || { ppg: d.ppg, rpg: d.rpg, apg: d.apg },
      _fromDeclaration: true
    };
  },

  showEmpty(message) {
    const el = document.getElementById('draftBody');
    if (el) el.innerHTML = `<div class="draft-empty"><p>${message}</p>
      <a href="./ncaa.html" class="sim-btn">Open the NCAA RP</a></div>`;
    const statusEl = document.getElementById('draftStatus');
    if (statusEl) statusEl.innerText = 'No draft class available';
  },

  // ---------- Mock draft ----------

  // The NBA season behind the lottery is synthesised once per draft year
  // and cached, so reloading the page doesn't reshuffle the lottery or a
  // team's needs underneath you.
  leagueKey() { return `bytherim-nba-league-${this.state.draftYear}`; },
  mockKey() { return `bytherim-nba-mock-${this.state.draftYear}`; },

  buildMock() {
    if (typeof NBACore === 'undefined') return;

    let league = null;
    try {
      const raw = localStorage.getItem(this.leagueKey());
      if (raw) league = JSON.parse(raw);
    } catch (e) { /* storage unavailable */ }

    if (!league) {
      league = NBACore.generateLeagueState(this.state.draftYear);
      try { localStorage.setItem(this.leagueKey(), JSON.stringify(league)); } catch (e) {}
    }
    this.state.league = league;

    // The mock is regenerated from the current board every load — it
    // should reflect the prospects as they stand, not a stale snapshot.
    this.state.mock = NBACore.buildMockDraft(this.state.prospects, league);
  },

  regenerateMock() {
    if (typeof NBACore === 'undefined' || !this.state.league) return;
    this.state.mock = NBACore.buildMockDraft(this.state.prospects, this.state.league);
    this.render();
  },

  // Re-runs the lottery only, keeping the same league season.
  redrawLottery() {
    if (typeof NBACore === 'undefined' || !this.state.league) return;
    this.state.mock = NBACore.buildMockDraft(this.state.prospects, this.state.league);
    this.render();
  },

  setMockTeamFilter(v) { this.state.mockTeamFilter = v; this.render(); },

  nbaLogo(team) { return `../nbalogos/${team.logo}.png`; },

  renderMockView() {
    if (!this.state.mock) {
      return `<div class="draft-empty"><p>The mock draft needs a prospect pool. Simulate a season in the NCAA RP first.</p></div>`;
    }
    const { picks, lottery } = this.state.mock;
    const filter = this.state.mockTeamFilter;

    const lotteryStrip = `
      <div class="lottery-strip">
        <div class="lottery-label">Lottery Results</div>
        ${lottery.lotteryWinners.map((t, i) => `
          <div class="lottery-winner">
            <span class="lottery-pick">${i + 1}</span>
            <img src="${this.nbaLogo(t)}" class="nba-logo-sm" alt="${t.name}">
            <span class="lottery-team">${t.name}</span>
            <span class="lottery-record">${t.wins}-${t.losses}</span>
          </div>`).join('')}
      </div>`;

    const shown = filter === 'ALL' ? picks : picks.filter(p => p.team.id === filter);

    const rows = shown.map(p => {
      const onBoard = this.state.customOrder.includes(p.player.id);
      const reach = p.boardRank - p.pick;
      const reachTag = reach >= 5 ? `<span class="reach-tag steal">+${reach}</span>`
        : reach <= -5 ? `<span class="reach-tag reach">${reach}</span>` : '';
      return `<tr class="prospect-row" onclick="DraftRP.toggleDetail('${this.esc(p.player.id)}')">
        <td class="rank-cell">${p.pick}</td>
        <td>
          <div class="player-cell nba-team-cell">
            <img src="${this.nbaLogo(p.team)}" class="nba-logo-sm" alt="${p.team.name}">
            <div>
              <span class="player-name">${p.team.name}</span>
              <span class="player-archetype">needs ${p.needs.join(' / ')}</span>
            </div>
          </div>
        </td>
        <td>
          <div class="player-cell">
            <span class="player-name">${p.player.name}</span>
            <span class="player-archetype">${p.player.school || ''}</span>
          </div>
        </td>
        <td><span class="pos-badge">${p.player.pos || '-'}</span></td>
        <td class="sub-text">${p.player.class || '-'}</td>
        <td class="sub-text">${p.player.ht || '-'}</td>
        <td class="sub-text">${p.player.stats ? p.player.stats.ppg : '—'}</td>
        <td class="sub-text-sm">#${p.boardRank} ${reachTag}</td>
        <td class="board-controls">
          <button class="mini-btn ${onBoard ? 'on-board' : 'add'}" ${onBoard ? 'disabled' : ''}
            onclick="event.stopPropagation();DraftRP.addToBoard('${this.esc(p.player.id)}')">${onBoard ? '✓' : '+'}</button>
        </td>
      </tr>
      ${this.state.expanded === p.player.id ? `<tr class="detail-row"><td colspan="9">${this.renderProspectDetail(this.findProspect(p.player.id) || { player: p.player, tags: [] })}</td></tr>` : ''}`;
    }).join('');

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${this.state.draftYear} Mock Draft</h2>
          <p class="sub-text">Sixty picks, ordered by lottery and reverse standings. Teams take the best player available, weighted toward positional need.</p>
        </div>
        <div class="board-actions">
          <select class="filter-select" onchange="DraftRP.setMockTeamFilter(this.value)">
            <option value="ALL">All Teams</option>
            ${NBACore.NBA_TEAMS.map(t => `<option value="${t.id}" ${filter === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
          <button class="sim-btn sim-btn-secondary btn-sm" onclick="DraftRP.redrawLottery()">Re-run Lottery</button>
        </div>
      </div>
      ${lotteryStrip}
      <div class="table-wrapper">
        <table class="draft-table data-table">
          <thead><tr>
            <th style="width:60px;">Pick</th><th>Team</th><th>Prospect</th>
            <th>Pos</th><th>Class</th><th>HT</th><th>PPG</th><th>Board</th><th></th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="9" class="empty-table-msg">No picks for this team.</td></tr>'}</tbody>
        </table>
      </div>`;
  },

  // ---------- Custom board persistence ----------

  customBoardKey() {
    return `${this.CUSTOM_BOARD_KEY}-${this.state.draftYear}`;
  },

  loadCustomBoard() {
    try {
      const raw = localStorage.getItem(this.customBoardKey());
      const ids = raw ? JSON.parse(raw) : [];
      // Drop ids that are no longer in the class (e.g. a player withdrew).
      const valid = new Set(this.state.prospects.map(p => p.player.id));
      this.state.customOrder = ids.filter(id => valid.has(id));
    } catch (e) {
      this.state.customOrder = [];
    }
  },

  saveCustomBoard() {
    try {
      localStorage.setItem(this.customBoardKey(), JSON.stringify(this.state.customOrder));
    } catch (e) { /* storage blocked — board just won't persist */ }
  },

  addToBoard(id) {
    if (this.state.customOrder.includes(id)) return;
    this.state.customOrder.push(id);
    this.saveCustomBoard();
    this.render();
  },

  removeFromBoard(id) {
    this.state.customOrder = this.state.customOrder.filter(x => x !== id);
    this.saveCustomBoard();
    this.render();
  },

  moveOnBoard(id, delta) {
    const i = this.state.customOrder.indexOf(id);
    if (i === -1) return;
    const j = i + delta;
    if (j < 0 || j >= this.state.customOrder.length) return;
    const arr = this.state.customOrder;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.saveCustomBoard();
    this.render();
  },

  clearBoard() {
    if (!confirm('Clear your entire big board? This cannot be undone.')) return;
    this.state.customOrder = [];
    this.saveCustomBoard();
    this.render();
  },

  // Seeds the user's board with the model's top 30 as a starting point.
  copyMasterBoard() {
    if (this.state.customOrder.length > 0 &&
        !confirm('Replace your current board with the master board order?')) return;
    this.state.customOrder = this.state.masterBoard.map(e => e.player.id);
    this.saveCustomBoard();
    this.render();
  },

  // ---------- View switching / filters ----------

  setView(view) { this.state.view = view; this.render(); },
  setStatMode(mode) { this.state.statMode = mode; this.render(); },
  setPoolPos(pos) { this.state.poolPos = pos; this.render(); },
  setPoolSort(sort) { this.state.poolSort = sort; this.render(); },
  setPoolSearch(q) { this.state.poolSearch = q; this.renderPoolOnly(); },

  toggleDetail(id) {
    this.state.expanded = this.state.expanded === id ? null : id;
    this.render();
  },

  findProspect(id) {
    return this.state.prospects.find(p => p.player.id === id);
  },

  // ---------- Rendering ----------

  render() {
    if (!this.state.loaded) return;
    document.querySelectorAll('.draft-view-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-view') === this.state.view);
    });
    const el = document.getElementById('draftBody');
    if (!el) return;
    el.innerHTML = this.state.view === 'custom' ? this.renderCustomView()
      : this.state.view === 'mock' ? this.renderMockView()
      : this.renderMasterView();
  },

  renderPoolOnly() {
    const el = document.getElementById('prospectPool');
    if (!el) { this.render(); return; }
    el.innerHTML = this.renderPoolRows();
  },

  statHeaders() {
    return this.state.statMode === 'adv'
      ? [['bpm','BPM'],['obpm','OBPM'],['dbpm','DBPM'],['tsPct','TS%'],['eFgPct','eFG%'],
         ['orebPct','OREB%'],['drebPct','DREB%'],['astPct','AST%'],['tovPct','TOV%'],
         ['blkPct','BLK%'],['usg','USG%'],['ortg','ORtg'],['drtg','DRtg']]
      : [['gp','GP'],['gs','GS'],['mpg','MPG'],['ppg','PPG'],['oreb','OREB'],['rpg','RPG'],
         ['apg','APG'],['stl','SPG'],['blk','BPG'],['tov','TOV'],['fgPct','FG%'],
         ['threePPct','3P%'],['ftPct','FT%']];
  },

  // Full stat block shown when a prospect row is expanded — every box
  // score and advanced number, which is what makes ranking them possible.
  renderProspectDetail(entry) {
    const p = entry.player;
    const st = p.stats || {};
    const table = (cols) => `
      <div class="table-scroll"><table class="data-table profile-stat-table">
        <thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
        <tbody><tr>${cols.map(c => `<td>${st[c[0]] !== undefined ? st[c[0]] : '—'}</td>`).join('')}</tr></tbody>
      </table></div>`;

    const box = [['gp','GP'],['gs','GS'],['mpg','MPG'],['ppg','PPG'],['oreb','OREB'],['dreb','DREB'],
                 ['rpg','RPG'],['apg','APG'],['stl','SPG'],['blk','BPG'],['tov','TOV'],['pf','PF'],
                 ['fgm','FGM'],['fga','FGA'],['fgPct','FG%'],['threePm','3PM'],['threePa','3PA'],
                 ['threePPct','3P%'],['ftm','FTM'],['fta','FTA'],['ftPct','FT%']];
    const adv = [['bpm','BPM'],['obpm','OBPM'],['dbpm','DBPM'],['tsPct','TS%'],['eFgPct','eFG%'],
                 ['rTsPct','rTS%'],['orebPct','OREB%'],['drebPct','DREB%'],['trbPct','TRB%'],
                 ['astPct','AST%'],['tovPct','TOV%'],['blkPct','BLK%'],['usg','USG%'],
                 ['ftr','FTr'],['threePar','3PAr'],['ortg','ORtg'],['drtg','DRtg'],['netRtg','Net']];
    const p40 = [['p40pts','PTS'],['p40oreb','OREB'],['p40dreb','DREB'],['p40reb','REB'],
                 ['p40ast','AST'],['p40stl','STL'],['p40blk','BLK'],['p40tov','TOV'],
                 ['p40pf','PF'],['p40fga','FGA'],['p40threePa','3PA'],['p40fta','FTA']];

    const onBoard = this.state.customOrder.includes(p.id);

    return `<div class="prospect-detail">
      <div class="prospect-detail-head">
        <div>
          <div class="prospect-detail-name">${p.jersey ? '#' + p.jersey + ' ' : ''}${p.name}</div>
          <div class="prospect-detail-bio">${[p.pos, p.class, p.ht, p.wt ? p.wt + ' lbs' : '', p.school].filter(Boolean).join(' · ')}</div>
          ${p.hometown && p.hometown !== 'N/A' ? `<div class="prospect-detail-bio">Hometown: ${p.hometown}${p.hs ? ' · ' + p.hs : ''}</div>` : ''}
        </div>
        <button class="sim-btn btn-sm ${onBoard ? 'sim-btn-secondary' : ''}"
          onclick="DraftRP.${onBoard ? 'removeFromBoard' : 'addToBoard'}('${this.esc(p.id)}')">
          ${onBoard ? 'Remove from My Board' : 'Add to My Board'}
        </button>
      </div>

      ${entry.tags && entry.tags.length ? `<div class="prospect-tags">${entry.tags.map(t => `<span class="prospect-tag">${t}</span>`).join('')}</div>` : ''}

      <h5 class="detail-stat-title">Box Score</h5>${table(box)}
      <h5 class="detail-stat-title">Advanced</h5>${table(adv)}
      <h5 class="detail-stat-title">Per 40 Minutes</h5>${table(p40)}
    </div>`;
  },

  esc(v) { return String(v).replace(/'/g, "\\'"); },

  prospectRow(entry, rank, opts = {}) {
    const p = entry.player;
    const st = p.stats || {};
    const cols = this.statHeaders();
    const isOpen = this.state.expanded === p.id;
    const onBoard = this.state.customOrder.includes(p.id);

    let controls = '';
    if (opts.mode === 'board') {
      controls = `<td class="board-controls">
        <button class="mini-btn" title="Move up" onclick="event.stopPropagation();DraftRP.moveOnBoard('${this.esc(p.id)}',-1)">▲</button>
        <button class="mini-btn" title="Move down" onclick="event.stopPropagation();DraftRP.moveOnBoard('${this.esc(p.id)}',1)">▼</button>
        <button class="mini-btn danger" title="Remove" onclick="event.stopPropagation();DraftRP.removeFromBoard('${this.esc(p.id)}')">✕</button>
      </td>`;
    } else if (opts.mode === 'pool') {
      controls = `<td class="board-controls">
        <button class="mini-btn ${onBoard ? 'on-board' : 'add'}" title="${onBoard ? 'Already on your board' : 'Add to board'}"
          ${onBoard ? 'disabled' : ''}
          onclick="event.stopPropagation();DraftRP.addToBoard('${this.esc(p.id)}')">${onBoard ? '✓' : '+'}</button>
      </td>`;
    }

    const rankCell = opts.showModelRank
      ? `<td class="rank-cell">${rank}<span class="model-rank">model ${entry.modelRank}</span></td>`
      : `<td class="rank-cell">${rank}</td>`;

    return `
      <tr class="prospect-row ${isOpen ? 'open' : ''}" onclick="DraftRP.toggleDetail('${this.esc(p.id)}')">
        ${rankCell}
        <td class="prospect-col">
          <div class="player-cell">
            <span class="player-name">${p.name}</span>
            <span class="player-archetype">${(entry.tags && entry.tags[0]) || p.pos}</span>
          </div>
        </td>
        <td><span class="pos-badge">${p.pos || '-'}</span></td>
        <td class="sub-text">${p.class || '-'}</td>
        <td class="sub-text">${p.ht || '-'}</td>
        <td class="school-col">${p.school || '-'}</td>
        ${cols.map(c => `<td>${st[c[0]] !== undefined ? st[c[0]] : '—'}</td>`).join('')}
        ${controls}
      </tr>
      ${isOpen ? `<tr class="detail-row"><td colspan="${7 + cols.length + (controls ? 1 : 0)}">${this.renderProspectDetail(entry)}</td></tr>` : ''}`;
  },

  tableHead(extraCol) {
    const cols = this.statHeaders();
    return `<tr>
      <th style="width:70px;">Rank</th>
      <th>Prospect</th><th>Pos</th><th>Class</th><th>HT</th><th>School</th>
      ${cols.map(c => `<th>${c[1]}</th>`).join('')}
      ${extraCol ? `<th style="width:96px;"></th>` : ''}
    </tr>`;
  },

  statToggle() {
    return `<div class="stat-toggle">
      <button class="theme-btn ${this.state.statMode === 'box' ? 'active' : ''}" onclick="DraftRP.setStatMode('box')">Box Score</button>
      <button class="theme-btn ${this.state.statMode === 'adv' ? 'active' : ''}" onclick="DraftRP.setStatMode('adv')">Advanced</button>
    </div>`;
  },

  renderMasterView() {
    const rows = this.state.masterBoard
      .map((e, i) => this.prospectRow(e, i + 1, { mode: 'pool' }))
      .join('');

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${this.state.draftYear} Master Big Board</h2>
          <p class="sub-text">Top ${this.BOARD_SIZE} prospects, ranked by the scouting model. Click any prospect for full stats.</p>
        </div>
        ${this.statToggle()}
      </div>
      <div class="table-wrapper">
        <table class="draft-table data-table">
          <thead>${this.tableHead(true)}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  renderCustomView() {
    const boardRows = this.state.customOrder.map((id, i) => {
      const entry = this.findProspect(id);
      if (!entry) return '';
      const modelRank = this.state.prospects.findIndex(p => p.player.id === id) + 1;
      return this.prospectRow({ ...entry, modelRank }, i + 1, { mode: 'board', showModelRank: true });
    }).join('');

    const boardBlock = this.state.customOrder.length === 0
      ? `<div class="draft-empty small"><p>Your board is empty. Add prospects from the pool below, or start from the master board.</p>
         <button class="sim-btn" onclick="DraftRP.copyMasterBoard()">Start From Master Board</button></div>`
      : `<div class="table-wrapper">
          <table class="draft-table data-table">
            <thead>${this.tableHead(true)}</thead>
            <tbody>${boardRows}</tbody>
          </table>
        </div>`;

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">My Big Board</h2>
          <p class="sub-text">${this.state.customOrder.length} ranked · saved automatically to this browser.</p>
        </div>
        <div class="board-actions">
          ${this.statToggle()}
          <button class="sim-btn sim-btn-secondary btn-sm" onclick="DraftRP.copyMasterBoard()">Copy Master</button>
          <button class="sim-btn sim-btn-secondary btn-sm" onclick="DraftRP.clearBoard()">Clear</button>
        </div>
      </div>
      ${boardBlock}

      <div class="draft-section-head mt-2">
        <div>
          <h3 class="draft-section-title">Available Prospects</h3>
          <p class="sub-text">Every declared player. Click a row for full box score, advanced and per-40 stats.</p>
        </div>
        <div class="filter-controls">
          <input class="search-bar" id="poolSearch" placeholder="Search prospects…"
            value="${this.state.poolSearch.replace(/"/g, '&quot;')}"
            oninput="DraftRP.setPoolSearch(this.value)">
          <select class="filter-select" onchange="DraftRP.setPoolPos(this.value)">
            ${['ALL','PG','SG','SF','PF','C'].map(p => `<option value="${p}" ${this.state.poolPos === p ? 'selected' : ''}>${p === 'ALL' ? 'All Positions' : p}</option>`).join('')}
          </select>
          <select class="filter-select" onchange="DraftRP.setPoolSort(this.value)">
            <option value="score" ${this.state.poolSort === 'score' ? 'selected' : ''}>Model Rank</option>
            <option value="ppg" ${this.state.poolSort === 'ppg' ? 'selected' : ''}>Points</option>
            <option value="rpg" ${this.state.poolSort === 'rpg' ? 'selected' : ''}>Rebounds</option>
            <option value="apg" ${this.state.poolSort === 'apg' ? 'selected' : ''}>Assists</option>
            <option value="bpm" ${this.state.poolSort === 'bpm' ? 'selected' : ''}>BPM</option>
            <option value="name" ${this.state.poolSort === 'name' ? 'selected' : ''}>Name</option>
          </select>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="draft-table data-table">
          <thead>${this.tableHead(true)}</thead>
          <tbody id="prospectPool">${this.renderPoolRows()}</tbody>
        </table>
      </div>`;
  },

  renderPoolRows() {
    let pool = [...this.state.prospects];

    if (this.state.poolPos !== 'ALL') {
      pool = pool.filter(e => (e.player.pos || '').toUpperCase() === this.state.poolPos);
    }
    const q = this.state.poolSearch.trim().toLowerCase();
    if (q) {
      pool = pool.filter(e =>
        (e.player.name || '').toLowerCase().includes(q) ||
        (e.player.school || '').toLowerCase().includes(q));
    }

    const sort = this.state.poolSort;
    if (sort === 'name') pool.sort((a, b) => a.player.name.localeCompare(b.player.name));
    else if (sort !== 'score') {
      pool.sort((a, b) => (parseFloat((b.player.stats || {})[sort]) || 0) - (parseFloat((a.player.stats || {})[sort]) || 0));
    }

    if (pool.length === 0) {
      const span = 7 + this.statHeaders().length;
      return `<tr><td colspan="${span}" class="empty-table-msg">No prospects match these filters.</td></tr>`;
    }

    return pool.map((e, i) => {
      const modelRank = this.state.prospects.findIndex(p => p.player.id === e.player.id) + 1;
      return this.prospectRow(e, modelRank, { mode: 'pool' });
    }).join('');
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = DraftRP;
else if (typeof window !== 'undefined') window.DraftRP = DraftRP;
