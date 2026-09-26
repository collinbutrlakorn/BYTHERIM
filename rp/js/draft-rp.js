// ============================================================
// Draft RP
//
// The NBA draft of the BYTHERIM college universe. It follows the NCAA RP
// through the whole year instead of waiting for the season to end:
//
//   live      — season in progress: a projected board and mock draft
//               built from every NCAA player, updated as games are played
//   declared  — the NCAA Tournament is over and the class has declared
//   complete  — draft night has been held in the NCAA RP offseason; the
//               actual picks, teams and lottery are shown
//
// Two sources:
//   official  — data/universe.json, published from the owner's save, so
//               every visitor sees the same draft
//   local     — the NCAA RP save in this browser ("ByTheRimUniverse")
// ============================================================

const DraftRP = {
  state: {
    loaded: false,
    source: null,          // 'official' | 'local'
    sources: { official: null, local: null },
    stage: 'live',         // 'live' | 'declared' | 'complete'
    seasonYear: null,      // the NCAA season year, e.g. 2028 for 2028-29
    seasonLabel: '',
    draftYear: null,       // the draft that season feeds, e.g. 2029
    prospects: [],         // full prospect pool, each with a score
    masterBoard: [],       // top 30, model order
    customOrder: [],       // array of player ids, user's ordering
    hiddenBoardIds: [],    // saved ids not in the current pool (kept, not shown)
    view: 'master',
    poolSearch: '',
    poolPos: 'ALL',
    poolSort: 'score',
    statMode: 'box',
    league: null,          // NBA season behind the lottery
    mock: null,            // generated mock draft
    mockSeed: 0,
    mockTeamFilter: 'ALL',
    results: [],           // actual picks once the draft is held
    lottery: null,
    history: [],           // earlier drafts in this universe
    historyYear: null,     // which draft the Draft view shows
    expanded: null         // prospect id whose detail row is open
  },

  UNIVERSE_URL: '../data/universe.json',
  SOURCE_KEY: 'bytherim-draft-source',
  CUSTOM_BOARD_KEY: 'bytherim-draft-board',
  BOARD_SIZE: 30,
  LIVE_POOL: 150,

  // ---------- Theme (shared behaviour with the NCAA RP page) ----------

  THEME_KEY: 'bytherim-rp-theme',

  initTheme() {
    // On the site, the shared header's theme button owns light/dark
    // (assets/site.js); this only runs if the page is opened without it.
    if (window.BTR) return;
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

  // ---------- Loading ----------

  async init() {
    this.initTheme();
    const [official, local] = await Promise.all([this.loadOfficial(), this.loadLocal()]);
    this.state.sources = { official, local };

    let pref = null;
    try { pref = localStorage.getItem(this.SOURCE_KEY); } catch (e) { /* storage blocked */ }
    const pick = (pref && this.state.sources[pref]) ? pref : official ? 'official' : local ? 'local' : null;
    if (!pick) {
      this.showEmpty('The draft follows the NCAA RP. Once a season is underway — in the official universe or a save of your own — the projected board and mock draft show up here.');
      return;
    }
    this.useSource(pick, false);
  },

  // The published universe everyone sees.
  async loadOfficial() {
    if (typeof fetch === 'undefined') return null;
    try {
      const res = await fetch(this.UNIVERSE_URL, { cache: 'no-cache' });
      if (!res.ok) return null;
      const u = await res.json();
      return u && u.draft && u.season ? this.contextFromUniverse(u) : null;
    } catch (e) {
      return null;
    }
  },

  contextFromUniverse(u) {
    const winPct = {};
    (u.teams || []).forEach(t => {
      const gp = (t.wins || 0) + (t.losses || 0);
      winPct[t.school] = gp > 0 ? t.wins / gp : 0.5;
    });
    const d = u.draft;
    return {
      source: 'official',
      seasonYear: u.season.year,
      seasonLabel: u.season.label || this.seasonLabelFor(u.season.year),
      phase: u.season.phase || '',
      week: u.season.week || 0,
      draftYear: d.year || u.season.year + 1,
      stage: ['live', 'declared', 'complete'].includes(d.stage) ? d.stage : 'live',
      pool: d.pool || [],
      winPct: s => (winPct[s] !== undefined ? winPct[s] : 0.5),
      results: d.results || [],
      lottery: d.lottery || null,
      league: d.league || null,
      history: d.history || [],
      updated: u.publishedAt || null
    };
  },

  // The NCAA RP save in this browser.
  async loadLocal() {
    if (typeof db === 'undefined' || !db.leagueState) return null;
    let saved, players, teams;
    try {
      saved = await db.leagueState.get(1);
      players = await db.players.toArray();
      teams = await db.teams.toArray();
    } catch (err) {
      console.error('Draft RP: error reading save', err);
      return null;
    }
    if (!saved || !players || players.length === 0) return null;

    const year = saved.currentYear || 2028;
    const draftYear = year + 1;           // a 2028-29 season feeds the 2029 draft
    const history = (saved.draftHistory || []).slice();
    // Saves from before draft history was recorded still have last year's results.
    if (!history.length && (saved.draftResults || []).length && saved.lastDeclarationsYear != null) {
      history.push({ year: saved.lastDeclarationsYear + 1, picks: saved.draftResults, lottery: saved.draftLottery || null });
    }
    const thisDraft = history.find(h => h.year === draftYear);
    const declared = saved.draftDeclarations || [];
    const stage = thisDraft ? 'complete' : declared.length ? 'declared' : 'live';
    const winPct = this.buildWinPctLookup(teams, year);

    const byId = {};
    players.forEach(p => { byId[p.id] = p; });
    const snapshot = (saved.lastDeclarationsYear === year ? saved.lastDeclarations : null) || [];
    const snapById = {};
    snapshot.forEach(d => { snapById[d.id] = d; });

    let pool;
    if (stage === 'live') {
      pool = players;
    } else {
      // Prefer the live record while the player is still on a roster;
      // otherwise the declaration snapshot, which captured the full line.
      const source = stage === 'declared' ? declared : (snapshot.length ? snapshot : declared);
      pool = source.map(d => {
        const live = byId[d.id];
        if (live && live.stats && live.stats.gp !== undefined) return live;
        return this.declarationToPlayer(snapById[d.id] || d);
      }).filter(Boolean);
    }

    let league = (saved.nbaLeagues || {})[draftYear] || null;
    return {
      source: 'local',
      seasonYear: year,
      seasonLabel: this.seasonLabelFor(year),
      phase: saved.currentPhase || '',
      week: saved.currentWeek || 0,
      draftYear, stage, pool, winPct,
      results: thisDraft ? thisDraft.picks || [] : [],
      lottery: thisDraft ? thisDraft.lottery || null : null,
      league,
      history,
      updated: null
    };
  },

  seasonLabelFor(year) { return `${year}-${String(year + 1).slice(2)}`; },

  // Switches between the official universe and this browser's save.
  useSource(key, remember = true) {
    const c = this.state.sources[key];
    if (!c) return;
    const s = this.state;
    s.source = key;
    s.stage = c.stage;
    s.seasonYear = c.seasonYear;
    s.seasonLabel = c.seasonLabel;
    s.draftYear = c.draftYear;
    s.results = c.results;
    s.lottery = c.lottery;
    s.history = (c.history || []).slice().sort((a, b) => b.year - a.year);
    s.historyYear = c.draftYear;
    s.expanded = null;
    s.mockTeamFilter = 'ALL';
    s.mockSeed = 0;

    const limit = c.stage === 'live' ? this.LIVE_POOL : c.pool.length;
    s.prospects = typeof DraftCore === 'undefined' ? []
      : DraftCore.buildBigBoard(c.pool, c.winPct, limit).map(entry => ({ ...entry, tags: DraftCore.scoutingTags(entry) }));
    // A player the sheet has going in this draft stays in the pool even
    // before he's played enough minutes for the model to rank him.
    if (typeof DraftCore !== 'undefined') {
      const inPool = new Set(s.prospects.map(e => e.player.id));
      c.pool.forEach(p => {
        const sd = p.scriptedDraft;
        if (!sd || sd.year !== c.draftYear || inPool.has(p.id)) return;
        const entry = { player: p, ...DraftCore.scoreProspect(p, c.winPct(p.school)) };
        s.prospects.push({ ...entry, tags: DraftCore.scoutingTags(entry) });
      });
    }
    s.masterBoard = s.prospects.slice(0, this.BOARD_SIZE);
    s.league = c.league || this.cachedLeague(c.draftYear);
    this.buildMock();
    this.loadCustomBoard();
    s.loaded = true;

    if (remember) { try { localStorage.setItem(this.SOURCE_KEY, key); } catch (e) { /* storage blocked */ } }
    this.renderChrome();
    this.render();
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
    if (statusEl) statusEl.textContent = 'No draft class yet';
    const nav = document.querySelector('.draft-view-nav');
    if (nav) nav.style.display = 'none';
  },

  // ---------- Header: source switch, status line, stage track ----------

  renderChrome() {
    const s = this.state;
    const c = s.sources[s.source];
    const statusEl = document.getElementById('draftStatus');
    if (statusEl) {
      const who = s.source === 'official' ? 'Official universe' : 'Your save';
      const when = s.source === 'official' && c.updated ? ` · updated ${this.shortDate(c.updated)}` : '';
      const what = s.stage === 'live'
        ? `${s.seasonLabel} season${c.week ? ' · Week ' + c.week : ''} · projected ${s.draftYear} class`
        : s.stage === 'declared'
          ? `${c.pool.length} declared · ${s.draftYear} NBA Draft`
          : `${s.draftYear} NBA Draft complete · ${s.results.length} picks`;
      statusEl.textContent = `${who} · ${what}${when}`;
    }

    const srcEl = document.getElementById('draftSource');
    if (srcEl) {
      const both = s.sources.official && s.sources.local;
      srcEl.innerHTML = both ? `<div class="stat-toggle" role="group" aria-label="Universe">
          <button class="theme-btn ${s.source === 'official' ? 'active' : ''}" onclick="DraftRP.useSource('official')">Official</button>
          <button class="theme-btn ${s.source === 'local' ? 'active' : ''}" onclick="DraftRP.useSource('local')">My Save</button>
        </div>` : '';
    }

    const stageEl = document.getElementById('draftStages');
    if (stageEl) {
      const order = ['live', 'declared', 'complete'];
      const at = order.indexOf(s.stage);
      const steps = [
        ['Season', s.stage === 'live' ? `${s.seasonLabel}${c.week ? ' · Week ' + c.week : ''} — the board moves with every game` : `${s.seasonLabel} season`],
        ['Declarations', s.stage === 'live' ? 'After the NCAA Tournament' : s.stage === 'declared' ? `${c.pool.length} players declared` : 'Class declared'],
        ['Draft Night', s.stage === 'complete' ? `${s.results.length} picks made` : 'Held in the NCAA RP offseason']
      ];
      stageEl.innerHTML = steps.map((st, i) => `
        <li class="${i < at ? 'done' : i === at ? 'current' : ''}">
          <span class="stage-dot">${i < at ? '✓' : i + 1}</span>
          <span><b>${st[0]}</b><small>${st[1]}</small></span>
        </li>`).join('');
    }

    const draftBtn = document.querySelector('.draft-view-btn[data-view="mock"]');
    if (draftBtn) draftBtn.textContent = s.stage === 'complete' ? 'Draft Results' : 'Mock Draft';
    const nav = document.querySelector('.draft-view-nav');
    if (nav) nav.style.display = '';
  },

  shortDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  },

  // ---------- Mock draft ----------

  // Without a league from the universe, one is synthesised per draft year
  // and cached so reloading doesn't reshuffle the lottery underneath you.
  cachedLeague(draftYear) {
    if (typeof NBACore === 'undefined') return null;
    const key = `bytherim-nba-league-${draftYear}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage unavailable */ }
    const league = NBACore.generateLeagueState(draftYear);
    try { localStorage.setItem(key, JSON.stringify(league)); } catch (e) { /* storage blocked */ }
    return league;
  },

  // Seeded so every visitor sees the same mock for the same publish;
  // "Re-run Lottery" just moves to the next seed.
  seededRng(seedText) {
    let h = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i++) {
      h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  buildMock() {
    const s = this.state;
    s.mock = null;
    if (typeof NBACore === 'undefined' || !s.league || !s.prospects.length) return;
    const c = s.sources[s.source] || {};
    const seed = `${s.source}|${s.draftYear}|${c.updated || ''}|${s.mockSeed}`;
    // Picks scripted in the roster sheet's Draft column are held for their
    // player, exactly as they will be on draft night.
    const fixed = {};
    s.prospects.forEach(e => {
      const sd = e.player.scriptedDraft;
      if (sd && sd.year === s.draftYear && sd.overall && !fixed[sd.overall]) fixed[sd.overall] = e;
    });
    s.mock = NBACore.buildMockDraft(s.prospects, s.league, this.seededRng(seed), fixed);
  },

  regenerateMock() { this.buildMock(); this.render(); },

  // Re-runs the lottery only, keeping the same league season.
  redrawLottery() {
    this.state.mockSeed++;
    this.buildMock();
    this.render();
  },

  setMockTeamFilter(v) { this.state.mockTeamFilter = v; this.render(); },
  setHistoryYear(v) { this.state.historyYear = Number(v); this.state.expanded = null; this.render(); },

  ppg(player) {
    const st = player.stats || {};
    return st.ppg != null && (st.gp === undefined || st.gp > 0) ? st.ppg : '—';
  },

  nbaLogo(team) { return `../nbalogos/${encodeURIComponent(team.logo || team.name)}.png`; },

  lotteryStrip(winners) {
    if (!winners || !winners.length) return '';
    return `
      <div class="lottery-strip">
        <div class="lottery-label">Lottery Results</div>
        ${winners.slice(0, 4).map((t, i) => `
          <div class="lottery-winner">
            <span class="lottery-pick">${i + 1}</span>
            <img src="${this.nbaLogo(t)}" class="nba-logo-sm" alt="" onerror="this.remove()">
            <span class="lottery-team">${t.name}</span>
            ${t.wins != null ? `<span class="lottery-record">${t.wins}-${t.losses}</span>` : ''}
          </div>`).join('')}
      </div>`;
  },

  // Every draft year this universe has: the current one plus past drafts.
  draftYears() {
    const years = new Set([this.state.draftYear]);
    this.state.history.forEach(h => years.add(h.year));
    return [...years].sort((a, b) => b - a);
  },

  yearSelect() {
    const years = this.draftYears();
    if (years.length < 2) return '';
    return `<select class="filter-select" aria-label="Draft year" onchange="DraftRP.setHistoryYear(this.value)">
      ${years.map(y => `<option value="${y}" ${y === this.state.historyYear ? 'selected' : ''}>${y} Draft</option>`).join('')}
    </select>`;
  },

  teamFilter(teams) {
    const filter = this.state.mockTeamFilter;
    return `<select class="filter-select" aria-label="Team" onchange="DraftRP.setMockTeamFilter(this.value)">
      <option value="ALL">All Teams</option>
      ${teams.map(t => `<option value="${t.id}" ${filter === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
    </select>`;
  },

  // The "Draft" tab: a projection until draft night, then the real thing.
  renderMockView() {
    const s = this.state;
    const current = s.historyYear === s.draftYear;
    if (!current || s.stage === 'complete') return this.renderResultsView();

    if (!s.mock) {
      return `<div class="draft-empty"><p>The mock draft needs a prospect pool. It fills in once games have been played in the NCAA RP.</p></div>`;
    }
    const { picks, lottery } = s.mock;
    const filter = s.mockTeamFilter;
    const shown = filter === 'ALL' ? picks : picks.filter(p => p.team.id === filter);

    const rows = shown.map(p => {
      const onBoard = s.customOrder.includes(p.player.id);
      const reach = p.boardRank - p.pick;
      const reachTag = reach >= 5 ? `<span class="reach-tag steal">+${reach}</span>`
        : reach <= -5 ? `<span class="reach-tag reach">${reach}</span>` : '';
      return `<tr class="prospect-row" onclick="DraftRP.toggleDetail('${this.esc(p.player.id)}')">
        <td class="rank-cell">${p.pick}</td>
        <td>
          <div class="player-cell nba-team-cell">
            <img src="${this.nbaLogo(p.team)}" class="nba-logo-sm" alt="" onerror="this.remove()">
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
        <td class="sub-text">${this.ppg(p.player)}</td>
        <td class="sub-text-sm">#${p.boardRank} ${reachTag}</td>
        <td class="board-controls">
          <button class="mini-btn ${onBoard ? 'on-board' : 'add'}" ${onBoard ? 'disabled' : ''}
            onclick="event.stopPropagation();DraftRP.addToBoard('${this.esc(p.player.id)}')">${onBoard ? '✓' : '+'}</button>
        </td>
      </tr>
      ${s.expanded === p.player.id ? `<tr class="detail-row"><td colspan="9">${this.renderProspectDetail(this.findProspect(p.player.id) || { player: p.player, tags: [] })}</td></tr>` : ''}`;
    }).join('');

    const c = s.sources[s.source] || {};
    const blurb = s.stage === 'live' && !c.week
      ? `A preseason projection for the ${s.seasonLabel} season, ranked on talent and recruiting pedigree until games are played. The real draft is held in the NCAA RP offseason.`
      : s.stage === 'live'
      ? `A projection from the ${s.seasonLabel} season so far, drawn from every NCAA player — not just those who will declare. It moves as games are played; the real draft is held in the NCAA RP offseason.`
      : `The declared class, ordered by lottery and reverse standings. Teams take the best player available, weighted toward positional need. Draft night happens in the NCAA RP offseason.`;

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${s.draftYear} Mock Draft</h2>
          <p class="sub-text">${blurb}</p>
        </div>
        <div class="board-actions">
          ${this.yearSelect()}
          ${this.teamFilter(NBACore.NBA_TEAMS)}
          <button class="sim-btn sim-btn-secondary btn-sm" onclick="DraftRP.redrawLottery()">Re-run Lottery</button>
        </div>
      </div>
      ${this.lotteryStrip(lottery.lotteryWinners)}
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

  // Actual picks from draft night — the current draft or an earlier one.
  renderResultsView() {
    const s = this.state;
    const year = s.historyYear;
    const isCurrent = year === s.draftYear && s.stage === 'complete';
    const past = s.history.find(h => h.year === year) || {};
    const picks = isCurrent ? s.results : (past.picks || []);
    const lottery = isCurrent ? s.lottery : past.lottery;
    const filter = s.mockTeamFilter;

    const teams = [];
    const seen = new Set();
    picks.forEach(p => { if (p.team && !seen.has(p.team.id)) { seen.add(p.team.id); teams.push(p.team); } });
    teams.sort((a, b) => a.name.localeCompare(b.name));
    const shown = filter === 'ALL' ? picks : picks.filter(p => p.team && p.team.id === filter);

    const rows = shown.map(d => {
      const entry = isCurrent ? this.findProspect(d.id) : null;
      const detail = entry || { player: { id: d.id, name: d.name, school: d.school, pos: d.pos, class: d.class, ht: d.ht, stats: { ppg: d.ppg, rpg: d.rpg, apg: d.apg } }, tags: [] };
      return `<tr class="prospect-row" onclick="DraftRP.toggleDetail('${this.esc(d.id)}')">
        <td class="rank-cell">${d.pick}</td>
        <td>${d.team ? `<div class="player-cell nba-team-cell">
            <img src="${this.nbaLogo(d.team)}" class="nba-logo-sm" alt="" onerror="this.remove()">
            <span class="player-name">${d.team.name}</span></div>` : '<span class="sub-text">—</span>'}</td>
        <td><div class="player-cell"><span class="player-name">${d.name}</span><span class="player-archetype">${d.school || ''}</span></div></td>
        <td><span class="pos-badge">${d.pos || '-'}</span></td>
        <td class="sub-text">${d.class || '-'}</td>
        <td class="sub-text">${d.ht || '-'}</td>
        <td class="sub-text">${d.ppg != null ? d.ppg : '—'}</td>
        <td class="sub-text-sm">${d.boardRank ? '#' + d.boardRank : '—'}</td>
      </tr>
      ${s.expanded === d.id ? `<tr class="detail-row"><td colspan="8">${this.renderProspectDetail(detail, { readOnly: !isCurrent })}</td></tr>` : ''}`;
    }).join('');

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${year} NBA Draft</h2>
          <p class="sub-text">${picks.length} picks, made on draft night in the NCAA RP offseason. Drafted players carry their pick into their college record.</p>
        </div>
        <div class="board-actions">
          ${this.yearSelect()}
          ${teams.length ? this.teamFilter(teams) : ''}
        </div>
      </div>
      ${this.lotteryStrip(lottery && lottery.winners)}
      <div class="table-wrapper">
        <table class="draft-table data-table">
          <thead><tr>
            <th style="width:60px;">Pick</th><th>Team</th><th>Player</th>
            <th>Pos</th><th>Class</th><th>HT</th><th>PPG</th><th>Board</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="8" class="empty-table-msg">No picks to show.</td></tr>'}</tbody>
        </table>
      </div>`;
  },

  // ---------- Custom board persistence ----------

  customBoardKey() {
    // Boards made against the official universe don't mix with your save's.
    const src = this.state.source === 'official' ? 'official-' : '';
    return `${this.CUSTOM_BOARD_KEY}-${src}${this.state.draftYear}`;
  },

  loadCustomBoard() {
    try {
      const raw = localStorage.getItem(this.customBoardKey());
      const ids = raw ? JSON.parse(raw) : [];
      // Hide ids that aren't in the pool right now (a player withdrew, or
      // slipped out of the in-season top 150) without deleting them, so
      // they come back if the player does.
      const valid = new Set(this.state.prospects.map(p => p.player.id));
      this.state.customOrder = ids.filter(id => valid.has(id));
      this.state.hiddenBoardIds = ids.filter(id => !valid.has(id));
    } catch (e) {
      this.state.customOrder = [];
      this.state.hiddenBoardIds = [];
    }
  },

  saveCustomBoard() {
    try {
      const hidden = (this.state.hiddenBoardIds || []).filter(id => !this.state.customOrder.includes(id));
      localStorage.setItem(this.customBoardKey(), JSON.stringify(this.state.customOrder.concat(hidden)));
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
    this.state.hiddenBoardIds = [];
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
  renderProspectDetail(entry, opts = {}) {
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
        ${opts.readOnly ? '' : `<button class="sim-btn btn-sm ${onBoard ? 'sim-btn-secondary' : ''}"
          onclick="DraftRP.${onBoard ? 'removeFromBoard' : 'addToBoard'}('${this.esc(p.id)}')">
          ${onBoard ? 'Remove from My Board' : 'Add to My Board'}
        </button>`}
      </div>

      ${entry.tags && entry.tags.length ? `<div class="prospect-tags">${entry.tags.map(t => `<span class="prospect-tag">${t}</span>`).join('')}</div>` : ''}

      <h5 class="detail-stat-title">Box Score</h5>${table(box)}
      ${st.bpm !== undefined ? `<h5 class="detail-stat-title">Advanced</h5>${table(adv)}` : ''}
      ${st.p40pts !== undefined ? `<h5 class="detail-stat-title">Per 40 Minutes</h5>${table(p40)}` : ''}
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
        ${cols.map(c => `<td>${st[c[0]] !== undefined && (st.gp !== 0 || c[0] === 'gp') ? st[c[0]] : '—'}</td>`).join('')}
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
          <h2 class="draft-section-title">${this.state.draftYear} ${this.state.stage === 'live' ? 'Big Board' : this.state.stage === 'declared' ? 'Master Big Board' : 'Final Big Board'}</h2>
          <p class="sub-text">${this.state.stage === 'live' && !(this.state.sources[this.state.source] || {}).week
            ? `Preseason top ${this.BOARD_SIZE} for the ${this.state.seasonLabel} season, ranked on talent and recruiting pedigree until games are played.`
            : this.state.stage === 'live'
            ? `Top ${this.BOARD_SIZE} NBA prospects in the ${this.state.seasonLabel} season so far, ranked by the scouting model. It updates as games are played.`
            : `Top ${this.BOARD_SIZE} declared prospects, ranked by the scouting model.`} Click any prospect for full stats.</p>
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
          <p class="sub-text">${this.state.stage === 'live' ? `The top ${this.state.prospects.length} prospects in college basketball right now.` : 'Every declared player.'} Click a row for full box score, advanced and per-40 stats.</p>
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
