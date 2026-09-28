// ============================================================
// Draft RP
//
// The NBA draft of the BYTHERIM college universe. It follows the NCAA RP
// through the whole year, and every offseason it is where the draft
// actually happens:
//
//   live       season in progress: a projected board and mock draft
//   declared   the NCAA Tournament is over and the class has declared
//   combine    measurements, athletic testing, shooting and interviews
//   lottery    the order for the top 14 picks is drawn
//   workouts   prospects visit the teams picking near them
//   deadline   early entrants stay in or return to school
//   complete   draft night has been held
//
// With a save in this browser, each step is run from here (see
// draft-cycle.js) and written back to the save; the NCAA RP waits at its
// "NBA Draft" step until draft night is over.
//
// Two sources:
//   official  data/universe.json, published from the owner's save, so
//             every visitor sees the same draft (read-only)
//   local     the NCAA RP save in this browser ("ByTheRimUniverse")
// ============================================================

const DraftRP = {
  state: {
    loaded: false,
    source: null,          // 'official' | 'local'
    sources: { official: null, local: null },
    stage: 'live',
    seasonYear: null,
    seasonLabel: '',
    draftYear: null,
    prospects: [],         // declared (or in-season) pool, each with a score
    masterBoard: [],       // top 30, model order
    customOrder: [],
    hiddenBoardIds: [],
    view: 'master',
    poolSearch: '',
    poolPos: 'ALL',
    poolSort: 'score',
    statMode: 'box',
    league: null,
    mock: null,
    mockSeed: 0,
    mockTeamFilter: 'ALL',
    results: [],
    lottery: null,
    cycle: null,           // the save's draft cycle record
    returning: [],         // withdrew at the deadline
    history: [],
    historyYear: null,
    expanded: null,
    combineGroup: 'ALL',
    combineSort: 'rank',
    combineDir: 1,
    workoutTeam: 'ALL',
    busy: false
  },

  UNIVERSE_URL: '../data/universe.json',
  SOURCE_KEY: 'bytherim-draft-source',
  CUSTOM_BOARD_KEY: 'bytherim-draft-board',
  BOARD_SIZE: 30,
  LIVE_POOL: 150,

  // Where the draft is, in order. `cycle.stage` names the last step done.
  TRACK: [
    { key: 'live',     label: 'Season' },
    { key: 'declared', label: 'Declarations' },
    { key: 'combine',  label: 'Combine' },
    { key: 'lottery',  label: 'Lottery' },
    { key: 'workouts', label: 'Workouts' },
    { key: 'deadline', label: 'Deadline' },
    { key: 'complete', label: 'Draft Night' }
  ],

  // ---------- Theme (shared behaviour with the NCAA RP page) ----------

  THEME_KEY: 'bytherim-rp-theme',

  initTheme() {
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
    document.querySelectorAll('[data-cutscene-toggle]').forEach(el => { if (window.Cutscene) Cutscene.renderToggle(el); });
    const [official, local] = await Promise.all([this.loadOfficial(), this.loadLocal()]);
    this.state.sources = { official, local };

    let pref = null;
    try { pref = localStorage.getItem(this.SOURCE_KEY); } catch (e) { /* storage blocked */ }
    // A save whose draft is under way always opens on the save: that's
    // where there's something to do.
    const localBusy = local && ['declared', 'combine', 'lottery', 'workouts', 'deadline'].includes(local.stage);
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    // A link from a player page in the NCAA RP opens that save's board.
    const linkedPlayer = q && q.get('player');
    const pick = localBusy || (linkedPlayer && local) ? 'local'
      : (pref && this.state.sources[pref]) ? pref : official ? 'official' : local ? 'local' : null;
    if (!pick) {
      this.showEmpty('The draft follows the NCAA RP. Once a season is underway — in the official universe or a save of your own — the projected board and mock draft show up here.');
      return;
    }
    if (q && q.get('view')) this.state.view = q.get('view');
    this.useSource(pick, false);
    if (linkedPlayer) this.openLinkedPlayer(linkedPlayer);
  },

  // ?player=<id>: open the board with that prospect's profile expanded.
  openLinkedPlayer(id) {
    const onBoard = (this.state.masterBoard || []).some(e => e.player.id === id);
    const drafted = (this.state.results || []).some(r => r.id === id);
    // A player from an earlier draft opens in that year's results.
    const past = !onBoard && !drafted ? (this.state.history || []).find(h => (h.picks || []).some(p => p.id === id)) : null;
    if (!onBoard && !drafted && !past) return;
    if (past) this.state.historyYear = past.year;
    this.state.view = onBoard ? 'master' : 'mock';
    this.state.expanded = id;
    this.render();
    setTimeout(() => {
      const row = document.querySelector('.detail-row');
      if (row && row.scrollIntoView) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  },

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
    const stage = this.TRACK.some(t => t.key === d.stage) ? d.stage : 'live';
    return {
      source: 'official',
      seasonYear: u.season.year,
      seasonLabel: u.season.label || this.seasonLabelFor(u.season.year),
      phase: u.season.phase || '',
      week: u.season.week || 0,
      draftYear: d.year || u.season.year + 1,
      stage,
      pool: d.pool || [],
      winPct: s => (winPct[s] !== undefined ? winPct[s] : 0.5),
      results: d.results || [],
      lottery: d.lottery || null,
      league: d.league || null,
      cycle: d.cycle || null,
      returning: d.returning || [],
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
    // International pros live in the league record, not the players table.
    const pros = (saved.proPlayers || []).map(p => ({ ...p }));
    players = players.concat(pros);

    const year = saved.currentYear || 2028;
    const draftYear = year + 1;           // a 2028-29 season feeds the 2029 draft
    const history = (saved.draftHistory || []).slice();
    if (!history.length && (saved.draftResults || []).length && saved.lastDeclarationsYear != null) {
      history.push({ year: saved.lastDeclarationsYear + 1, picks: saved.draftResults, lottery: saved.draftLottery || null });
    }
    const thisDraft = history.find(h => h.year === draftYear);
    const declared = saved.draftDeclarations || [];
    const cycle = saved.draftCycle && saved.draftCycle.year === draftYear ? saved.draftCycle : null;
    let stage;
    if (!saved.ncaaDone) stage = 'live';
    else if (cycle) stage = cycle.stage;
    else stage = thisDraft ? 'complete' : declared.length ? 'declared' : 'live';
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
      const source = stage === 'complete' && snapshot.length ? snapshot : declared;
      pool = source.map(d => {
        const live = byId[d.id];
        if (live && live.stats && live.stats.gp !== undefined) return live;
        return this.declarationToPlayer(snapById[d.id] || d);
      }).filter(Boolean);
    }

    let league = (saved.nbaLeagues || {})[draftYear] || null;
    let leagueGenerated = false;
    if (!league && typeof NBACore !== 'undefined' && stage !== 'live') {
      league = NBACore.generateLeagueState(draftYear);
      leagueGenerated = true;
    }
    return {
      source: 'local',
      seasonYear: year,
      seasonLabel: this.seasonLabelFor(year),
      phase: saved.currentPhase || '',
      week: saved.currentWeek || 0,
      draftYear, stage, pool, winPct,
      results: thisDraft ? thisDraft.picks || [] : [],
      lottery: thisDraft ? thisDraft.lottery || null : (cycle && cycle.lottery ? { year: draftYear, winners: cycle.lottery.winners } : null),
      league, leagueGenerated,
      cycle,
      returning: cycle && stageAtLeast(cycle.stage, 'deadline') ? (saved.returningPlayers || []) : [],
      history,
      updated: null,
      // Kept for running the cycle from here.
      saved, players, byId, declared, proIds: new Set(pros.map(p => p.id))
    };
  },

  seasonLabelFor(year) { return `${year}-${String(year + 1).slice(2)}`; },

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
    s.cycle = c.cycle || null;
    s.returning = c.returning || [];
    s.history = (c.history || []).slice().sort((a, b) => b.year - a.year);
    s.historyYear = c.draftYear;
    s.expanded = null;
    s.mockTeamFilter = 'ALL';
    s.mockSeed = 0;

    const limit = c.stage === 'live' ? this.LIVE_POOL : c.pool.length;
    const opts = { draftYear: c.draftYear };
    s.prospects = typeof DraftCore === 'undefined' ? []
      : DraftCore.buildBigBoard(c.pool, c.winPct, limit, opts).map(entry => ({ ...entry, tags: DraftCore.scoutingTags(entry) }));
    if (typeof DraftCore !== 'undefined') {
      const inPool = new Set(s.prospects.map(e => e.player.id));
      c.pool.forEach(p => {
        if (inPool.has(p.id)) return;
        const sd = p.scriptedDraft;
        const hasPd = p.predraft && p.predraft.year === c.draftYear;
        if (!(sd && sd.year === c.draftYear) && !hasPd) return;
        const entry = { player: p, ...DraftCore.scoreProspect(p, c.winPct(p.school), opts) };
        s.prospects.push({ ...entry, tags: DraftCore.scoutingTags(entry) });
      });
      s.prospects.sort((a, b) => b.score - a.score);
    }
    s.masterBoard = s.prospects.slice(0, this.BOARD_SIZE);
    s.league = c.league || this.cachedLeague(c.draftYear);
    this.buildMock();
    this.loadCustomBoard();
    if (!this.viewAvailable(s.view)) s.view = 'master';
    s.loaded = true;

    if (remember) { try { localStorage.setItem(this.SOURCE_KEY, key); } catch (e) { /* storage blocked */ } }
    this.renderChrome();
    this.render();
  },

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

  declarationToPlayer(d) {
    if (!d || !d.name) return null;
    return {
      id: d.id, name: d.name, school: d.school, pos: d.pos, class: d.class,
      conference: d.conference || '', rating: d.rating,
      ht: d.ht || '', wt: d.wt || '', hometown: d.hometown || '',
      hs: d.hs || '', jersey: d.jersey || '', rsci: d.rsci || null,
      collegeHistory: d.collegeHistory || (d.school ? [d.school] : []),
      stats: d.stats || { ppg: d.ppg, rpg: d.rpg, apg: d.apg },
      predraft: d.predraft || null,
      bigGameStock: d.bigGameStock || 0, bigGames: d.bigGames || [],
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

  // ---------- Running the cycle (a save in this browser) ----------

  canRun() {
    const s = this.state;
    return s.source === 'local' && !!this.nextStep() && typeof DraftCycle !== 'undefined' && typeof db !== 'undefined' && !!db.leagueState;
  },

  nextStep() {
    const s = this.state;
    if (s.stage === 'live' || s.stage === 'complete') return null;
    return DraftCycleNext(s.stage);
  },

  localContext() {
    const c = this.state.sources.local;
    const draftYear = c.draftYear;
    const board = limit => DraftCore.buildBigBoard(c.players, c.winPct, limit, { draftYear });
    return {
      draftYear, byId: c.byId, league: c.league,
      declarations: c.declared,
      cycle: c.cycle || { year: draftYear, stage: 'declared', rev: 1 },
      scriptedFor: p => (p && p.scriptedDraft) || null,
      fullBoard: limit => board(limit),
      fullBoardRank: () => { const r = {}; board(400).forEach((e, i) => { r[e.player.id] = i + 1; }); return r; },
      board: () => {
        const ids = new Set(c.declared.map(d => d.id));
        return board(600).filter(e => ids.has(e.player.id));
      }
    };
  },

  async runNextStep() {
    if (!this.canRun() || this.state.busy) return;
    this.state.busy = true;
    this.renderCycleBar();
    const c = this.state.sources.local;
    const before = this.state.stage;
    let res;
    try {
      res = DraftCycle.advance(this.localContext());
      if (!res) return;
      await this.persistStep(res, c);
    } catch (err) {
      console.error('Draft RP: step failed', err);
      alert('That step could not be saved to your NCAA RP save. Nothing was changed.');
      this.state.busy = false;
      this.renderCycleBar();
      return;
    }
    // Reload from the save so every view reads exactly what was written.
    const fresh = await this.loadLocal();
    this.state.sources.local = fresh;
    this.state.busy = false;
    const views = { combine: 'combine', lottery: 'mock', workouts: 'workouts', deadline: 'master', complete: 'mock' };
    this.state.view = views[res.cycle.stage] || this.state.view;
    this.useSource('local', false);
    this.playStepScene(res.cycle.stage, before);
    const top = document.querySelector('.draft-container');
    if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async persistStep(res, c) {
    const changed = new Map();
    const proIds = c.proIds || new Set();
    Object.entries(res.players || {}).forEach(([id, pd]) => {
      const p = c.byId[id];
      if (p) { p.predraft = pd; changed.set(id, p); }
    });
    Object.entries(res.draftFor || {}).forEach(([id, d]) => {
      const p = c.byId[id];
      if (p) { p.draft = d; changed.set(id, p); }
    });
    const patch = { draftCycle: res.cycle, ...(res.state || {}) };
    // A pro's combine and draft go back into the league record's pro list;
    // only college players belong in the players table.
    const changedPros = [...changed.keys()].filter(id => proIds.has(id));
    if (changedPros.length) {
      patch.proPlayers = (c.saved.proPlayers || []).map(p => (changed.has(p.id) ? changed.get(p.id) : p));
      changedPros.forEach(id => changed.delete(id));
    }
    if (res.draftEntry) {
      patch.draftHistory = (c.saved.draftHistory || []).filter(d => d.year !== res.draftEntry.year).concat([res.draftEntry]);
    }
    if (c.leagueGenerated) patch.nbaLeagues = { ...(c.saved.nbaLeagues || {}), [c.draftYear]: c.league };
    await db.transaction('rw', db.leagueState, db.players, async () => {
      await db.leagueState.update(1, patch);
      if (changed.size) await db.players.bulkPut([...changed.values()]);
    });
  },

  // ---------- Header: source switch, status line, stage track, next step ----------

  renderChrome() {
    const s = this.state;
    const c = s.sources[s.source];
    const statusEl = document.getElementById('draftStatus');
    if (statusEl) {
      const who = s.source === 'official' ? 'Official universe' : 'Your save';
      const when = s.source === 'official' && c.updated ? ` · updated ${this.shortDate(c.updated)}` : '';
      const n = c.pool.length;
      const what = {
        live: `${s.seasonLabel} season${c.week ? ' · Week ' + c.week : ''} · projected ${s.draftYear} class`,
        declared: `${n} declared · ${s.draftYear} NBA Draft`,
        combine: `${s.draftYear} Draft Combine complete · ${n} declared`,
        lottery: `${s.draftYear} lottery drawn · ${n} declared`,
        workouts: `${s.draftYear} team workouts under way`,
        deadline: `${n} in the ${s.draftYear} draft after the deadline`,
        complete: `${s.draftYear} NBA Draft complete · ${s.results.length} picks`
      }[s.stage];
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
      const at = this.TRACK.findIndex(t => t.key === s.stage);
      const next = this.nextStep();
      const sub = {
        live: s.stage === 'live' ? `${s.seasonLabel}${c.week ? ' · Wk ' + c.week : ''}` : s.seasonLabel,
        declared: at >= 1 ? `${(c.cycle && c.cycle.deadline ? c.cycle.deadline.staying + c.cycle.deadline.returning : c.pool.length)} declared` : 'After the tournament',
        combine: c.cycle && c.cycle.combine ? `${c.cycle.combine.invited} invited` : 'Measure & test',
        lottery: s.lottery && s.lottery.winners && s.lottery.winners[0] && at >= 3 ? `${this.shortTeam(s.lottery.winners[0].name)} pick first` : 'Top 14 drawn',
        workouts: c.cycle && c.cycle.workouts ? `${c.cycle.workouts.visits} visits` : 'Team visits',
        deadline: c.cycle && c.cycle.deadline ? `${c.cycle.deadline.returning} withdrew` : 'Stay or return',
        complete: s.stage === 'complete' ? `${s.results.length} picks` : '60 picks'
      };
      stageEl.innerHTML = this.TRACK.map((st, i) => `
        <li class="${i < at ? 'done' : i === at ? 'current' : next && next.key === st.key ? 'next' : ''}">
          <span class="stage-dot">${i < at ? '✓' : i + 1}</span>
          <span><b>${st.label}</b><small>${sub[st.key]}</small></span>
        </li>`).join('');
    }

    const nav = document.querySelector('.draft-view-nav');
    if (nav) {
      nav.style.display = '';
      nav.innerHTML = this.views().map(v => `<button class="draft-view-btn ${s.view === v.key ? 'active' : ''}" data-view="${v.key}" onclick="DraftRP.setView('${v.key}')">${v.label}</button>`).join('');
    }
    this.renderCycleBar();
  },

  views() {
    const s = this.state;
    const v = [{ key: 'master', label: 'Big Board' }, { key: 'custom', label: 'My Big Board' }];
    if (this.hasCombine()) v.push({ key: 'combine', label: 'Combine' });
    if (this.hasWorkouts()) v.push({ key: 'workouts', label: 'Workouts' });
    v.push({ key: 'mock', label: s.stage === 'complete' ? 'Draft Results' : 'Mock Draft' });
    return v;
  },
  viewAvailable(key) { return this.views().some(v => v.key === key); },
  hasCombine() { return this.state.prospects.some(e => this.pd(e.player) && this.pd(e.player).invited); },
  hasWorkouts() { return this.state.prospects.some(e => this.pd(e.player) && this.pd(e.player).workouts); },
  pd(p) { return p && p.predraft && p.predraft.year === this.state.draftYear ? p.predraft : null; },

  // The call to action for whatever comes next in the cycle.
  renderCycleBar() {
    const el = document.getElementById('draftCycleBar');
    if (!el) return;
    const s = this.state;
    const c = s.sources[s.source] || {};
    const next = this.nextStep();
    const invites = Math.min(78, c.pool ? c.pool.length : 0);
    const onClock = s.lottery && s.lottery.winners && s.lottery.winners[0] ? s.lottery.winners[0].name : null;
    const copy = {
      combine: ['The Draft Combine', `The top ${invites} declared prospects measure, test, shoot and interview in front of all 30 teams.`],
      lottery: ['The Draft Lottery', 'Fourteen teams, four draws. Find out who picks first.'],
      workouts: ['Team Workouts', 'Prospects visit the teams picking near them — and every front office runs its workouts differently.'],
      deadline: ['The Withdrawal Deadline', 'Early entrants weigh what they heard at the combine and in workouts: stay in the draft, or go back to school.'],
      complete: ['Draft Night', `Sixty picks.${onClock ? ` The ${onClock} are on the clock.` : ''}`]
    };
    if (s.source === 'local' && next && copy[next.key]) {
      const [title, text] = copy[next.key];
      el.innerHTML = `<div class="cycle-bar rp-rise">
        <div class="cycle-bar-text"><span class="cycle-kicker">Next up</span><b>${title}</b><span>${text}</span></div>
        <button class="sim-btn cycle-go" ${s.busy ? 'disabled' : ''} onclick="DraftRP.runNextStep()">${s.busy ? 'Working…' : next.verb}</button>
      </div>`;
    } else if (s.source === 'local' && s.stage === 'complete') {
      el.innerHTML = `<div class="cycle-bar done rp-rise">
        <div class="cycle-bar-text"><span class="cycle-kicker">Draft night is over</span><b>Back to college basketball</b><span>The NCAA RP picks up the offseason at the transfer portal.</span></div>
        <a class="sim-btn cycle-go" href="./ncaa.html">Back to the NCAA RP &rarr;</a>
      </div>`;
    } else if (s.source === 'official' && next) {
      el.innerHTML = `<div class="cycle-bar muted"><div class="cycle-bar-text"><span class="cycle-kicker">Coming up</span><b>${copy[next.key] ? copy[next.key][0] : next.label}</b><span>The official universe moves on when BYTHERIM publishes the next step.</span></div></div>`;
    } else el.innerHTML = '';
  },

  shortDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  },
  shortTeam(name) { return String(name || '').split(' ').slice(-1)[0]; },

  // ---------- Mock draft ----------

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

  // Once the lottery has been drawn, the mock uses the real order; once
  // workouts are done, teams lean toward the prospects who impressed them.
  drawnLottery() {
    const s = this.state;
    const lc = s.cycle && s.cycle.lottery;
    if (!lc || !s.league) return null;
    const byId = {};
    s.league.forEach(t => { byId[t.id] = t; });
    return { order: lc.order.map(id => byId[id]).filter(Boolean), lotteryWinners: lc.winners.map(w => byId[w.id]).filter(Boolean) };
  },

  buildMock() {
    const s = this.state;
    s.mock = null;
    if (typeof NBACore === 'undefined' || !s.league || !s.prospects.length) return;
    const c = s.sources[s.source] || {};
    const seed = `${s.source}|${s.draftYear}|${c.updated || ''}|${s.mockSeed}`;
    const fixed = {};
    const ranged = [];
    s.prospects.forEach(e => {
      const sd = e.player.scriptedDraft;
      if (!sd || sd.year !== s.draftYear) return;
      if (sd.overall) { if (!fixed[sd.overall]) fixed[sd.overall] = e; }
      else if (sd.range) { ranged.push({ entry: e, maxPick: sd.range }); }
    });
    const lottery = s.mockSeed === 0 ? this.drawnLottery() : null;
    s.mock = NBACore.buildMockDraft(s.prospects, s.league, this.seededRng(seed), fixed,
      { lottery: lottery || undefined, interest: s.cycle && s.cycle.interest ? s.cycle.interest : undefined, ranged });
  },

  regenerateMock() { this.buildMock(); this.render(); },

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
      <div class="lottery-strip rp-stagger">
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

  draftYears() {
    const years = new Set([this.state.draftYear]);
    this.state.history.forEach(h => years.add(h.year));
    return [...years].sort((a, b) => b - a);
  },

  yearSelect(label = 'Draft') {
    const years = this.draftYears();
    if (years.length < 2) return '';
    return `<select class="filter-select" aria-label="Draft year" onchange="DraftRP.setHistoryYear(this.value)">
      ${years.map(y => `<option value="${y}" ${y === this.state.historyYear ? 'selected' : ''}>${y} ${label}</option>`).join('')}
    </select>`;
  },

  teamFilter(teams) {
    const filter = this.state.mockTeamFilter;
    return `<select class="filter-select" aria-label="Team" onchange="DraftRP.setMockTeamFilter(this.value)">
      <option value="ALL">All Teams</option>
      ${teams.map(t => `<option value="${t.id}" ${filter === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
    </select>`;
  },

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
    const drawn = !!(s.cycle && s.cycle.lottery);

    const rows = shown.map(p => {
      const onBoard = s.customOrder.includes(p.player.id);
      const reach = p.boardRank - p.pick;
      const reachTag = reach >= 5 ? `<span class="reach-tag steal">+${reach}</span>`
        : reach <= -5 ? `<span class="reach-tag reach">${reach}</span>` : '';
      const liked = s.cycle && s.cycle.interest && (s.cycle.interest[p.team.id] || {})[p.player.id] > 0;
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
            <span class="player-name">${p.player.name}${liked ? ' <span class="liked-tag" title="Impressed this team in a workout">Worked out</span>' : ''}</span>
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
      ? `A preseason projection for the ${s.seasonLabel} season, ranked on talent and recruiting pedigree until games are played. The real draft is held here once the season ends.`
      : s.stage === 'live'
      ? `A projection from the ${s.seasonLabel} season so far, drawn from every NCAA player — not just those who will declare. It moves as games are played.`
      : drawn
      ? `The order drawn on lottery night${s.cycle.interest ? ', with teams leaning toward the prospects who impressed them in workouts' : ''}. Teams take the best player available, weighted toward need.`
      : `The declared class, ordered by a projected lottery and reverse standings. Teams take the best player available, weighted toward positional need.`;

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${s.draftYear} Mock Draft</h2>
          <p class="sub-text">${blurb}</p>
        </div>
        <div class="board-actions">
          ${this.yearSelect()}
          ${this.teamFilter(NBACore.NBA_TEAMS)}
          ${drawn ? '' : `<button class="sim-btn sim-btn-secondary btn-sm" onclick="DraftRP.redrawLottery()">Re-run Lottery</button>`}
        </div>
      </div>
      ${this.lotteryStrip(lottery.lotteryWinners)}
      <div class="table-wrapper">
        <table class="draft-table data-table">
          <thead><tr>
            <th style="width:60px;">Pick</th><th>Team</th><th>Prospect</th>
            <th>Pos</th><th>Class</th><th>HT</th><th>PPG</th><th>Board</th><th></th>
          </tr></thead>
          <tbody class="rp-stagger">${rows || '<tr><td colspan="9" class="empty-table-msg">No picks for this team.</td></tr>'}</tbody>
        </table>
      </div>`;
  },

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
      const detail = entry || this.detailFromRecord(d);
      return `<tr class="prospect-row" onclick="DraftRP.toggleDetail('${this.esc(d.id)}')">
        <td class="rank-cell">${d.pick}</td>
        <td>${d.team ? `<div class="player-cell nba-team-cell">
            <img src="${this.nbaLogo(d.team)}" class="nba-logo-sm" alt="" onerror="this.remove()">
            <span class="player-name">${d.team.name}</span></div>` : '<span class="sub-text">—</span>'}</td>
        <td><div class="player-cell"><span class="player-name">${d.name}${d.workedOut ? ' <span class="liked-tag" title="Impressed this team in a workout">Worked out</span>' : ''}</span><span class="player-archetype">${d.school || ''}</span></div></td>
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
          <p class="sub-text">${picks.length} picks, made on draft night. Drafted players carry their pick into their college record.${isCurrent ? ` <button class="text-btn" onclick="DraftRP.replayDraftNight()">Replay draft night</button>` : ''}</p>
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
          <tbody class="rp-stagger">${rows || '<tr><td colspan="8" class="empty-table-msg">No picks to show.</td></tr>'}</tbody>
        </table>
      </div>`;
  },

  // ---------- Custom board persistence ----------

  customBoardKey() {
    const src = this.state.source === 'official' ? 'official-' : '';
    return `${this.CUSTOM_BOARD_KEY}-${src}${this.state.draftYear}`;
  },

  loadCustomBoard() {
    try {
      const raw = localStorage.getItem(this.customBoardKey());
      const ids = raw ? JSON.parse(raw) : [];
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

  copyMasterBoard() {
    if (this.state.customOrder.length > 0 &&
        !confirm('Replace your current board with the master board order?')) return;
    this.state.customOrder = this.state.masterBoard.map(e => e.player.id);
    this.saveCustomBoard();
    this.render();
  },

  // ---------- View switching / filters ----------

  setView(view) { this.state.view = view; this.state.expanded = null; this.renderChrome(); this.render(); },
  setStatMode(mode) { this.state.statMode = mode; this.render(); },
  setPoolPos(pos) { this.state.poolPos = pos; this.render(); },
  setPoolSort(sort) { this.state.poolSort = sort; this.render(); },
  setPoolSearch(q) { this.state.poolSearch = q; this.renderPoolOnly(); },
  setCombineGroup(g) { this.state.combineGroup = g; this.render(); },
  setCombineSort(k) {
    const s = this.state;
    if (s.combineSort === k) s.combineDir *= -1;
    else { s.combineSort = k; s.combineDir = ['lane', 'shuttle', 'sprint', 'rank', 'bodyFat'].includes(k) ? 1 : -1; }
    this.render();
  },
  setWorkoutTeam(t) { this.state.workoutTeam = t; this.render(); },

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
    const v = this.state.view;
    // Rows ease in when the view itself changes, not when a prospect is
    // opened or closed within it.
    const viewKey = [v, this.state.source, this.state.historyYear, this.state.mockTeamFilter, this.state.statMode].join('|');
    el.classList.toggle('rows-in', viewKey !== this._lastViewKey);
    this._lastViewKey = viewKey;
    el.innerHTML = v === 'custom' ? this.renderCustomView()
      : v === 'mock' ? this.renderMockView()
      : v === 'combine' ? this.renderCombineView()
      : v === 'workouts' ? this.renderWorkoutsView()
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

  // ---------- Pre-draft detail ----------

  fmtIn(v) { return typeof DraftCycle !== 'undefined' ? DraftCycle.fmtIn(v) : v; },
  gradeClass(g) { return !g ? '' : /^A/.test(g) ? 'g-a' : /^B/.test(g) ? 'g-b' : /^C/.test(g) ? 'g-c' : 'g-d'; },
  personalityChip(key) {
    const P = typeof DraftCycle !== 'undefined' ? DraftCycle.PERSONALITIES[key] : null;
    return P ? `<span class="pers-chip pers-${key}" title="${P.blurb}">${P.label}</span>` : '';
  },
  pctBar(label, value, pct, unit = '') {
    if (value == null) return '';
    const cls = pct >= 85 ? 'hot' : pct <= 15 ? 'cold' : '';
    return `<div class="pct-row ${cls}"><span class="pct-label">${label}</span><span class="pct-value">${value}${unit}</span>
      <span class="pct-track"><i style="width:${Math.max(3, pct)}%"></i></span><span class="pct-num">${pct}<small>th</small></span></div>`;
  },

  // Games against ranked teams and in the postseason, and what they did to
  // his stock.
  renderBigGames(p) {
    const list = (p && p.bigGames) || [];
    if (!list.length) return '';
    const total = Number(p.bigGameStock) || 0;
    return `<div class="big-games">
      <div class="predraft-head"><h5 class="detail-stat-title">Big-game résumé</h5>
        <span class="big-games-net ${total >= 0 ? 'up' : 'down'}">${total >= 0 ? '▲' : '▼'} ${Math.abs(total).toFixed(1)} on the board</span></div>
      <ul class="big-games-list">${list.slice().reverse().map(g => `<li class="${g.delta >= 0 ? 'up' : 'down'}">
        <span class="bg-arrow">${g.delta >= 0 ? '▲' : '▼'}</span><b>${g.label}</b><span>${g.line}${g.won ? ' · W' : ' · L'}</span></li>`).join('')}</ul>
    </div>`;
  },

  renderPredraft(p) {
    const big = this.renderBigGames(p);
    const pd = this.pd(p);
    if (!pd) return big;
    const m = pd.meas, t = pd.tests, pc = pd.pct || {};
    const S = typeof DraftCycle !== 'undefined' ? DraftCycle.ORG_STYLES : {};
    let html = `<div class="predraft">`;
    if (pd.invited && m) {
      html += `<div class="predraft-head"><h5 class="detail-stat-title">${this.state.draftYear} Draft Combine</h5>
          <span class="grade-badge ${this.gradeClass(pd.grade)}" title="Combine grade">${pd.grade}</span>${this.personalityChip(pd.personality)}</div>
        <div class="meas-chips">
          <span><b>${this.fmtIn(m.barefoot)}</b>Height (barefoot)</span>
          <span><b>${this.fmtIn(m.shoes)}</b>In shoes</span>
          <span><b>${this.fmtIn(m.wingspan)}</b>Wingspan (${m.ape >= 0 ? '+' : ''}${m.ape})</span>
          <span><b>${this.fmtIn(m.reach)}</b>Standing reach</span>
          <span><b>${m.weight}</b>Weight (lb)</span>
          <span><b>${m.bodyFat}%</b>Body fat</span>
          <span><b>${m.handLength}" × ${m.handWidth}"</b>Hands (L × W)</span>
        </div>
        <div class="predraft-cols">
          <div>${t ? [
            this.pctBar('Max vertical', t.maxVert, pc.maxVert, '"'),
            this.pctBar('Standing vertical', t.standVert, pc.standVert, '"'),
            this.pctBar('Lane agility', t.lane, pc.lane, 's'),
            this.pctBar('Shuttle', t.shuttle, pc.shuttle, 's'),
            this.pctBar('3/4 sprint', t.sprint, pc.sprint, 's'),
            this.pctBar('Bench (185 lb)', t.bench, pc.bench, ' reps')
          ].join('') : '<p class="sub-text">Skipped athletic testing.</p>'}
          ${pd.shooting ? `<p class="sub-text-sm mt-1">Shooting drills: spot-up ${pd.shooting.spotUp}/25 · off the dribble ${pd.shooting.offDribble}/15 · 3-point star ${pd.shooting.star}/25</p>` : ''}
          <p class="sub-text-sm">Percentiles are within his position group.</p></div>
          <ul class="predraft-notes">${(pd.notes || []).map(n => `<li>${n}</li>`).join('')}</ul>
        </div>`;
    }
    if (pd.workouts && pd.workouts.length) {
      html += `<h5 class="detail-stat-title">Team workouts${pd.workoutGrade ? ` <span class="grade-badge ${this.gradeClass(pd.workoutGrade)}">${pd.workoutGrade} avg</span>` : ''}</h5>
        <div class="visit-list">${pd.workouts.map(v => this.visitRow(v, S)).join('')}</div>`;
    }
    return big + html + `</div>`;
  },

  visitRow(v, S) {
    const style = S[v.style] || { label: v.style };
    return `<div class="visit-row ${v.declined ? 'declined' : ''}">
      <img src="${this.nbaLogo({ logo: v.logo, name: v.team })}" class="nba-logo-sm" alt="" onerror="this.remove()">
      <div class="visit-main"><b>${v.team}</b><span class="style-chip" title="${style.blurb || ''}">${style.label}</span><p>${v.note}</p></div>
      ${v.grade ? `<span class="grade-badge ${this.gradeClass(v.grade)}">${v.grade}</span>` : '<span class="grade-badge g-none">—</span>'}
    </div>`;
  },

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

    return `<div class="prospect-detail rp-rise">
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
      ${this.renderPredraft(p)}
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
    const pd = this.pd(p);

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

    const move = pd && pd.stock ? Math.round(pd.stock * 1.6) : 0;
    const moveTag = move >= 1 ? `<span class="stock-tag up" title="Pre-draft process">▲${move}</span>` : move <= -1 ? `<span class="stock-tag down" title="Pre-draft process">▼${-move}</span>` : '';
    const rankCell = opts.showModelRank
      ? `<td class="rank-cell">${rank}<span class="model-rank">model ${entry.modelRank}</span></td>`
      : `<td class="rank-cell">${rank}${moveTag}</td>`;

    return `
      <tr class="prospect-row ${isOpen ? 'open' : ''}" onclick="DraftRP.toggleDetail('${this.esc(p.id)}')">
        ${rankCell}
        <td class="prospect-col">
          <div class="player-cell">
            <span class="player-name">${p.name}${pd && pd.grade ? ` <span class="grade-badge sm ${this.gradeClass(pd.grade)}" title="Combine grade">${pd.grade}</span>` : ''}</span>
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

  // Withdrawals lead the board once the deadline has passed.
  returningBlock() {
    const r = this.state.returning || [];
    if (!r.length) return '';
    return `<details class="returning-card rp-rise" open>
      <summary><b>Withdrew — returning to school</b><span>${r.length} early entrants went back to college at the deadline</span></summary>
      <div class="returning-list">${r.slice().sort((a, b) => (a.boardRank || 999) - (b.boardRank || 999)).map(x => `
        <span class="returning-item"><b>${x.name}</b> ${x.school}${x.boardRank && x.boardRank < 400 ? ` · #${x.boardRank}` : ''}${x.feedback ? ` · ${x.feedback}` : ''}</span>`).join('')}</div>
    </details>`;
  },

  renderMasterView() {
    const s = this.state;
    if (s.historyYear !== s.draftYear) return this.renderPastBoard();
    const rows = s.masterBoard.map((e, i) => this.prospectRow(e, i + 1, { mode: 'pool' })).join('');
    const c = s.sources[s.source] || {};
    const title = s.stage === 'live' ? 'Big Board' : s.stage === 'complete' ? 'Final Big Board' : 'Big Board';
    const blurb = s.stage === 'live' && !c.week
      ? `Preseason top ${this.BOARD_SIZE} for the ${s.seasonLabel} season, ranked on talent and recruiting pedigree until games are played.`
      : s.stage === 'live'
      ? `Top ${this.BOARD_SIZE} NBA prospects in the ${s.seasonLabel} season so far, ranked by the scouting model. It updates as games are played.`
      : stageAtLeast(s.stage, 'combine')
      ? `Top ${this.BOARD_SIZE} declared prospects. The combine${stageAtLeast(s.stage, 'workouts') ? ' and team workouts have' : ' has'} moved players — arrows show how far.`
      : `Top ${this.BOARD_SIZE} declared prospects, ranked by the scouting model.`;

    return `
      ${this.returningBlock()}
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${s.draftYear} ${title}</h2>
          <p class="sub-text">${blurb} Click any prospect for full stats${this.hasCombine() ? ' and pre-draft results' : ''}.</p>
        </div>
        <div class="board-actions">${this.yearSelect('Board')}${this.statToggle()}</div>
      </div>
      <div class="table-wrapper">
        <table class="draft-table data-table">
          <thead>${this.tableHead(true)}</thead>
          <tbody class="rp-stagger">${rows}</tbody>
        </table>
      </div>`;
  },

  // Past big boards: the final board kept with each draft. Drafts held
  // before boards were archived show the drafted players in board order.
  // A drafted (or boarded) player from a past draft, from what was kept
  // with it: the full stat line when there is one.
  detailFromRecord(d) {
    return {
      player: { id: d.id, name: d.name, school: d.school, pos: d.pos, class: d.class, ht: d.ht, wt: d.wt, hometown: d.hometown, hs: d.hs, jersey: d.jersey,
        stats: d.stats || { ppg: d.ppg, rpg: d.rpg, apg: d.apg } },
      tags: d.tags || []
    };
  },

  renderPastBoard() {
    const s = this.state;
    const h = s.history.find(x => x.year === s.historyYear) || {};
    const board = h.board && h.board.length ? h.board
      : (h.picks || []).filter(p => p.boardRank).slice().sort((a, b) => a.boardRank - b.boardRank)
          .map(p => ({ rank: p.boardRank, name: p.name, school: p.school, pos: p.pos, class: p.class, ht: p.ht, ppg: p.ppg, rpg: p.rpg, apg: p.apg, pick: p.pick, team: p.team }));
    const rows = board.map(b => `<tr class="prospect-row" onclick="DraftRP.toggleDetail('${this.esc(b.id || b.name)}')">
        <td class="rank-cell">${b.rank}</td>
        <td><div class="player-cell"><span class="player-name">${b.name}${b.combineGrade ? ` <span class="grade-badge sm ${this.gradeClass(b.combineGrade)}">${b.combineGrade}</span>` : ''}</span>
          <span class="player-archetype">${(b.tags && b.tags[0]) || b.school || ''}</span></div></td>
        <td><span class="pos-badge">${b.pos || '-'}</span></td>
        <td class="sub-text">${b.class || '-'}</td>
        <td class="sub-text">${b.ht || '-'}</td>
        <td class="school-col">${b.school || '-'}</td>
        <td>${b.ppg != null ? b.ppg : '—'}</td><td>${b.rpg != null ? b.rpg : '—'}</td><td>${b.apg != null ? b.apg : '—'}</td>
        <td>${b.pick ? `<div class="player-cell nba-team-cell">${b.team ? `<img src="${this.nbaLogo(b.team)}" class="nba-logo-sm" alt="" onerror="this.remove()">` : ''}<span class="player-name">#${b.pick}</span></div>` : '<span class="sub-text">Undrafted</span>'}</td>
      </tr>
      ${s.expanded === (b.id || b.name) ? `<tr class="detail-row"><td colspan="10">${this.renderProspectDetail(this.detailFromRecord(b), { readOnly: true })}</td></tr>` : ''}`).join('');
    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${s.historyYear} Final Big Board</h2>
          <p class="sub-text">${h.board && h.board.length ? 'The board as it stood on draft night, and where each player went.' : 'This draft was held before full boards were kept, so this shows the drafted players in the order the board had them.'}</p>
        </div>
        <div class="board-actions">${this.yearSelect('Board')}</div>
      </div>
      <div class="table-wrapper">
        <table class="draft-table data-table">
          <thead><tr><th style="width:70px;">Rank</th><th>Prospect</th><th>Pos</th><th>Class</th><th>HT</th><th>School</th><th>PPG</th><th>RPG</th><th>APG</th><th>Drafted</th></tr></thead>
          <tbody class="rp-stagger">${rows || '<tr><td colspan="10" class="empty-table-msg">No board recorded for this draft.</td></tr>'}</tbody>
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
    // Players already on My Big Board leave the pool so it stays short.
    const onBoard = new Set(this.state.customOrder);
    let pool = this.state.prospects.filter(e => !onBoard.has(e.player.id));

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
      return `<tr><td colspan="${span}" class="empty-table-msg">${onBoard.size && !q && this.state.poolPos === 'ALL' ? 'Every prospect is on your board.' : 'No prospects match these filters.'}</td></tr>`;
    }

    return pool.map(e => {
      const modelRank = this.state.prospects.findIndex(p => p.player.id === e.player.id) + 1;
      return this.prospectRow(e, modelRank, { mode: 'pool' });
    }).join('');
  },

  // ---------- Combine ----------

  combineRows() {
    return this.state.prospects
      .filter(e => this.pd(e.player) && this.pd(e.player).invited)
      .map(e => ({ e, p: e.player, pd: this.pd(e.player) }));
  },

  renderCombineView() {
    const s = this.state;
    const all = this.combineRows();
    if (!all.length) return `<div class="draft-empty"><p>The combine hasn't been held yet.</p></div>`;
    let rows = s.combineGroup === 'ALL' ? all : all.filter(r => DraftCycle.group(r.p.pos) === s.combineGroup);
    const val = (r, k) => {
      const m = r.pd.meas || {}, t = r.pd.tests || {};
      switch (k) {
        case 'rank': return r.pd.combineRank || 999;
        case 'grade': return r.pd.composite;
        case 'barefoot': case 'wingspan': case 'ape': case 'reach': case 'weight': case 'bodyFat': case 'handLength': return m[k];
        case 'spotUp': return r.pd.shooting ? r.pd.shooting.spotUp : null;
        default: return t[k] != null ? t[k] : null;
      }
    };
    rows = rows.slice().sort((a, b) => {
      const x = val(a, s.combineSort), y = val(b, s.combineSort);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x - y) * s.combineDir;
    });

    // Headline tiles: the best of the combine.
    const best = (k, lower, fmt) => {
      const withV = all.filter(r => val(r, k) != null);
      if (!withV.length) return null;
      const r = withV.reduce((a, b) => (lower ? val(b, k) < val(a, k) : val(b, k) > val(a, k)) ? b : a);
      return { r, v: fmt(val(r, k)) };
    };
    const tiles = [
      ['Longest wingspan', best('wingspan', false, v => this.fmtIn(v))],
      ['Max vertical', best('maxVert', false, v => v + '"')],
      ['Fastest sprint', best('sprint', true, v => v + 's')],
      ['Lane agility', best('lane', true, v => v + 's')],
      ['Spot-up shooting', best('spotUp', false, v => v + '/25')]
    ].filter(t => t[1]);

    const H = (k, label, title) => `<th class="sortable ${s.combineSort === k ? 'sorted' : ''}" onclick="DraftRP.setCombineSort('${k}')" ${title ? `title="${title}"` : ''}>${label}${s.combineSort === k ? (s.combineDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const cell = (r, k, text) => {
      const pc = r.pd.pct || {};
      const pk = { wingspan: 'ape', ape: 'ape', reach: 'reach', spotUp: 'shooting' }[k] || k;
      const v = pc[pk];
      const cls = v == null ? '' : v >= 85 ? 'hot' : v <= 15 ? 'cold' : '';
      return `<td class="${cls}">${text}</td>`;
    };
    const body = rows.map(r => {
      const m = r.pd.meas, t = r.pd.tests || {};
      const open = s.expanded === r.p.id;
      return `<tr class="prospect-row ${open ? 'open' : ''}" onclick="DraftRP.toggleDetail('${this.esc(r.p.id)}')">
        <td class="rank-cell">${r.pd.combineRank || '—'}</td>
        <td><div class="player-cell"><span class="player-name">${r.p.name}</span><span class="player-archetype">${r.p.school || ''}</span></div></td>
        <td><span class="pos-badge">${r.p.pos}</span></td>
        <td><span class="grade-badge ${this.gradeClass(r.pd.grade)}">${r.pd.grade}</span></td>
        <td>${this.fmtIn(m.barefoot)}</td>
        ${cell(r, 'wingspan', this.fmtIn(m.wingspan))}
        ${cell(r, 'ape', (m.ape >= 0 ? '+' : '') + m.ape)}
        ${cell(r, 'reach', this.fmtIn(m.reach))}
        <td>${m.weight}</td><td>${m.bodyFat}%</td><td>${m.handLength}"</td>
        ${cell(r, 'maxVert', t.maxVert != null ? t.maxVert + '"' : '—')}
        ${cell(r, 'standVert', t.standVert != null ? t.standVert + '"' : '—')}
        ${cell(r, 'lane', t.lane != null ? t.lane : '—')}
        ${cell(r, 'shuttle', t.shuttle != null ? t.shuttle : '—')}
        ${cell(r, 'sprint', t.sprint != null ? t.sprint : '—')}
        ${cell(r, 'bench', t.bench != null ? t.bench : '—')}
        ${cell(r, 'spotUp', r.pd.shooting ? r.pd.shooting.spotUp + '/25' : '—')}
      </tr>
      ${open ? `<tr class="detail-row"><td colspan="18">${this.renderProspectDetail(r.e)}</td></tr>` : ''}`;
    }).join('');

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${s.draftYear} Draft Combine</h2>
          <p class="sub-text">${all.length} invited · ${all.filter(r => r.pd.tests).length} tested. Measurements are barefoot unless noted; highlighted numbers are top-15% (green) or bottom-15% (red) for the player's position group. Click a prospect for his full combine and workouts.</p>
        </div>
        <div class="board-actions">
          <select class="filter-select" aria-label="Position group" onchange="DraftRP.setCombineGroup(this.value)">
            ${[['ALL', 'All positions'], ['guard', 'Guards'], ['wing', 'Wings'], ['big', 'Bigs']].map(([k, l]) => `<option value="${k}" ${s.combineGroup === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="combine-tiles rp-stagger">${tiles.map(([label, b]) => `
        <button class="combine-tile" onclick="DraftRP.toggleDetail('${this.esc(b.r.p.id)}')"><span>${label}</span><b>${b.v}</b><small>${b.r.p.name} · ${b.r.p.pos}</small></button>`).join('')}</div>
      <div class="table-wrapper">
        <table class="draft-table data-table combine-table">
          <thead><tr>
            ${H('rank', 'Rk', 'Board rank entering the combine')}<th>Prospect</th><th>Pos</th>${H('grade', 'Grade')}
            ${H('barefoot', 'Height')}${H('wingspan', 'Wingspan')}${H('ape', '+/-', 'Wingspan minus height')}${H('reach', 'Reach')}
            ${H('weight', 'Wt')}${H('bodyFat', 'BF%')}${H('handLength', 'Hand')}
            ${H('maxVert', 'Max Vert')}${H('standVert', 'Stand Vert')}${H('lane', 'Lane')}${H('shuttle', 'Shuttle')}${H('sprint', 'Sprint')}${H('bench', 'Bench')}${H('spotUp', 'Spot-up')}
          </tr></thead>
          <tbody class="rp-stagger">${body || '<tr><td colspan="18" class="empty-table-msg">No prospects in this group.</td></tr>'}</tbody>
        </table>
      </div>`;
  },

  // ---------- Workouts ----------

  renderWorkoutsView() {
    const s = this.state;
    const S = DraftCycle.ORG_STYLES;
    const withW = s.prospects.filter(e => this.pd(e.player) && this.pd(e.player).workouts)
      .map(e => ({ e, p: e.player, pd: this.pd(e.player) }));
    if (!withW.length) return `<div class="draft-empty"><p>Team workouts haven't started yet.</p></div>`;
    const teams = NBACore.NBA_TEAMS;
    const teamSel = `<select class="filter-select" aria-label="Team" onchange="DraftRP.setWorkoutTeam(this.value)">
      <option value="ALL">Every prospect</option>
      ${teams.map(t => `<option value="${t.id}" ${s.workoutTeam === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
    </select>`;

    let body;
    if (s.workoutTeam !== 'ALL') {
      const team = teams.find(t => t.id === s.workoutTeam);
      const style = S[DraftCycle.orgStyle(team.id)];
      const visits = [];
      withW.forEach(r => r.pd.workouts.forEach(v => { if (v.teamId === team.id) visits.push({ r, v }); }));
      const order = s.cycle && s.cycle.lottery ? s.cycle.lottery.order : [];
      const picks = order.map((id, i) => id === team.id ? i + 1 : null).filter(Boolean);
      body = `<div class="team-workout-head rp-rise">
          <img src="${this.nbaLogo(team)}" class="nba-logo-lg" alt="" onerror="this.remove()">
          <div><b>${team.name}</b><span class="style-chip">${style.label}</span><p>${style.blurb}</p>
          ${picks.length ? `<p class="sub-text-sm">Picks: ${picks.map(p => '#' + p).join(', ')}</p>` : ''}</div>
        </div>
        <div class="visit-list rp-stagger">${visits.sort((a, b) => (a.r.pd.combineRank || 99) - (b.r.pd.combineRank || 99)).map(({ r, v }) => `
          <div class="visit-row ${v.declined ? 'declined' : ''}" onclick="DraftRP.setWorkoutTeam('ALL');DraftRP.toggleDetail('${this.esc(r.p.id)}')">
            <span class="rank-cell">${this.boardRank(r.p.id)}</span>
            <div class="visit-main"><b>${r.p.name}</b><span class="sub-text-sm"> ${r.p.pos} · ${r.p.school}</span>${this.personalityChip(r.pd.personality)}<p>${v.note}</p></div>
            ${v.grade ? `<span class="grade-badge ${this.gradeClass(v.grade)}">${v.grade}</span>` : '<span class="grade-badge g-none">—</span>'}
          </div>`).join('') || '<p class="sub-text">No prospects visited this team.</p>'}</div>`;
    } else {
      body = `<div class="workout-grid rp-stagger">${withW.sort((a, b) => this.boardRank(a.p.id) - this.boardRank(b.p.id)).slice(0, 60).map(r => `
        <article class="workout-card">
          <header onclick="DraftRP.setView('master');DraftRP.toggleDetail('${this.esc(r.p.id)}')">
            <span class="rank-cell">${this.boardRank(r.p.id)}</span>
            <div><b>${r.p.name}</b><span class="sub-text-sm">${r.p.pos} · ${r.p.school}</span></div>
            ${this.personalityChip(r.pd.personality)}
            ${r.pd.workoutGrade ? `<span class="grade-badge ${this.gradeClass(r.pd.workoutGrade)}" title="Average workout grade">${r.pd.workoutGrade}</span>` : ''}
          </header>
          <div class="visit-list">${r.pd.workouts.map(v => this.visitRow(v, S)).join('')}</div>
        </article>`).join('')}</div>`;
    }

    return `
      <div class="draft-section-head">
        <div>
          <h2 class="draft-section-title">${s.draftYear} Team Workouts</h2>
          <p class="sub-text">Every front office works prospects out its own way — some grind them through conditioning, some go straight to live 1-on-1s, some care most about the interview. How a prospect's personality fits the room shows up in his grades, and teams draft the players who impressed them.</p>
        </div>
        <div class="board-actions">${teamSel}</div>
      </div>
      ${body}`;
  },

  boardRank(id) {
    const i = this.state.prospects.findIndex(e => e.player.id === id);
    return i < 0 ? '—' : i + 1;
  },

  // ---------- Cutscenes for each step ----------

  scenePlayer(p, extra) {
    return `<div class="cs-row"><span class="cs-name">${p.name}</span><span class="cs-meta">${p.pos || ''} · ${p.school || ''}${extra ? ' · ' + extra : ''}</span></div>`;
  },

  playStepScene(stage) {
    if (typeof Cutscene === 'undefined' || !Cutscene.enabled()) {
      if (stage === 'complete') return;
      return;
    }
    const C = Cutscene;
    const s = this.state;
    const yr = s.draftYear;
    const logoNba = t => `<img src="${this.nbaLogo(t)}" class="cs-logo" alt="" onerror="this.remove()">`;
    const rows = this.combineRows();

    if (stage === 'combine') {
      const tile = (label, r, v) => r ? `<div class="cs-card"><div class="cs-card-kicker">${label}</div><div class="cs-card-big">${v}</div><div class="cs-card-name">${r.p.name}</div><div class="cs-card-meta">${r.p.pos} · ${r.p.school}</div></div>` : '';
      const top = (k, lower) => rows.filter(r => r.pd.tests && r.pd.tests[k] != null).sort((a, b) => lower ? a.pd.tests[k] - b.pd.tests[k] : b.pd.tests[k] - a.pd.tests[k])[0];
      const wing = rows.slice().sort((a, b) => b.pd.meas.ape - a.pd.meas.ape)[0];
      const risers = rows.slice().sort((a, b) => b.pd.stock - a.pd.stock).slice(0, 4);
      const fallers = rows.slice().sort((a, b) => a.pd.stock - b.pd.stock).slice(0, 4);
      const vert = top('maxVert'), sprint = top('sprint', true), lane = top('lane', true);
      C.play({ id: 'combineShow', theme: 'draft', label: 'Draft Combine', scenes: [
        { ms: 2600, html: C.titleCard(`${yr} NBA Draft`, 'The<br>Combine', `${rows.length} prospects. Measured, tested, interviewed.`) },
        { ms: 4200, html: C.heading('Standouts') + `<div class="cs-cards">${[
            tile('Wingspan', wing, `${this.fmtIn(wing.pd.meas.wingspan)}`),
            vert ? tile('Max vertical', vert, `${vert.pd.tests.maxVert}"`) : '',
            sprint ? tile('3/4 sprint', sprint, `${sprint.pd.tests.sprint}s`) : '',
            lane ? tile('Lane agility', lane, `${lane.pd.tests.lane}s`) : ''
          ].filter(Boolean).map((h, i) => `<div class="cs-item" style="--d:${200 + i * 350}ms">${h}</div>`).join('')}</div>` },
        { ms: 4200, html: C.heading('Stock watch') + `<div class="cs-bubble"><div><h3>Helped themselves</h3>${risers.map((r, i) => `<div class="cs-row good cs-item" style="--d:${i * 160}ms"><span class="cs-name">${r.p.name}</span><span class="cs-meta">${r.pd.grade}</span></div>`).join('')}</div>
            <div><h3>Hurt themselves</h3>${fallers.map((r, i) => `<div class="cs-row bad cs-item" style="--d:${(i + 4) * 160}ms"><span class="cs-name">${r.p.name}</span><span class="cs-meta">${r.pd.grade}</span></div>`).join('')}</div></div>` },
        { ms: 0, html: C.titleCard('', '<span class="small">Combine results are in</span>') }
      ], actions: [{ label: 'See the full combine', primary: true }] });
    } else if (stage === 'lottery') {
      const lc = s.cycle && s.cycle.lottery;
      if (!lc) return;
      const field = lc.field.slice().sort((a, b) => b.pick - a.pick);
      const late = field.filter(f => f.pick > 4);
      const top4 = field.filter(f => f.pick <= 4);
      const card = (f) => `<div class="cs-pick"><div class="cs-pick-no">No. ${f.pick}</div><div class="cs-pick-team">${logoNba(f)}${f.name}</div>
        <div class="cs-pick-meta">${f.wins}-${f.losses} · ${f.odds}% odds for No. 1${f.pick < f.seed ? ` · jumped from ${this.ordinal(f.seed)}` : f.pick > f.seed ? ` · fell from ${this.ordinal(f.seed)}` : ''}</div></div>`;
      const first = top4.find(f => f.pick === 1);
      C.play({ id: 'lotteryShow', theme: 'draft', label: 'Draft Lottery', scenes: [
        { ms: 2400, html: C.titleCard(`${yr} NBA Draft`, 'Draft<br>Lottery', 'Fourteen teams. Four draws.') },
        { ms: 3800, html: C.heading('Picks 14 through 5') + `<div class="cs-list">${late.map((f, i) => `<div class="cs-row cs-item" style="--d:${i * 220}ms"><span class="cs-rank">${f.pick}</span>${logoNba(f)}<span class="cs-name">${f.name}</span><span class="cs-meta">${f.wins}-${f.losses}</span></div>`).join('')}</div>` },
        ...top4.filter(f => f.pick > 1).map(f => ({ ms: 2600, html: card(f) })),
        { ms: 0, html: (first && first.pick < first.seed ? C.confetti(50) : '') + `<div class="cs-kicker">The No. 1 pick goes to…</div>` + card(first) }
      ], actions: [{ label: 'See the order', primary: true }] });
    } else if (stage === 'workouts') {
      const visits = [];
      s.prospects.forEach(e => { const pd = this.pd(e.player); (pd && pd.workouts || []).forEach(v => visits.push({ p: e.player, v })); });
      // One line per prospect, so the highlights cover five different players.
      const onePer = list => { const seen = new Set(); return list.filter(x => !seen.has(x.p.id) && seen.add(x.p.id)); };
      const good = onePer(visits.filter(x => x.v.grade === 'A+')).slice(0, 5);
      const bad = onePer(visits.filter(x => x.v.grade === 'C' || x.v.grade === 'D' || /intimidated|best player in the class/.test(x.v.note))).slice(0, 5);
      const row = (x, cls, i) => `<div class="cs-row ${cls} cs-item" style="--d:${i * 180}ms">${logoNba({ logo: x.v.logo, name: x.v.team })}<span class="cs-name">${x.p.name}</span><span class="cs-meta">${x.v.note.length > 96 ? x.v.note.slice(0, 94) + '…' : x.v.note}</span></div>`;
      C.play({ id: 'workoutsShow', theme: 'draft', label: 'Team Workouts', scenes: [
        { ms: 2400, html: C.titleCard(`${yr} NBA Draft`, 'Team<br>Workouts', `${s.cycle && s.cycle.workouts ? s.cycle.workouts.visits : visits.length} visits across the league.`) },
        good.length ? { ms: 4200, html: C.heading('Turning heads') + `<div class="cs-list">${good.map((x, i) => row(x, 'good', i)).join('')}</div>` } : null,
        bad.length ? { ms: 4200, html: C.heading('Tough days') + `<div class="cs-list">${bad.map((x, i) => row(x, 'bad', i)).join('')}</div>` } : null,
        { ms: 0, html: C.titleCard('', '<span class="small">The workout circuit is done</span>') }
      ], actions: [{ label: 'See every workout', primary: true }] });
    } else if (stage === 'deadline') {
      const back = (s.returning || []).slice().sort((a, b) => (a.boardRank || 999) - (b.boardRank || 999));
      C.play({ id: 'deadlineShow', theme: 'draft', label: 'Withdrawal Deadline', scenes: [
        { ms: 2400, html: C.titleCard(`${yr} NBA Draft`, 'Decision<br>Day', 'The withdrawal deadline has passed.') },
        { ms: 4400, html: C.heading(`<span data-count="${back.length}">0</span> back to school`, 'The most notable early entrants returning to college.') +
          `<div class="cs-list">${back.slice(0, 8).map((r, i) => `<div class="cs-row cs-item" style="--d:${i * 150}ms"><span class="cs-name">${r.name}</span><span class="cs-meta">${r.school}${r.boardRank < 400 ? ' · #' + r.boardRank : ''}</span></div>`).join('')}</div>` },
        { ms: 3200, html: `<div class="cs-stats"><div class="cs-stat"><b data-count="${s.prospects.length}">0</b><span>still in the draft</span></div><div class="cs-stat"><b>60</b><span>picks</span></div></div>` },
        { ms: 0, html: C.titleCard('', '<span class="small">The class is set</span>') }
      ], actions: [{ label: 'See the board', primary: true }] });
    } else if (stage === 'complete') {
      this.replayDraftNight(true);
    }
  },

  ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); },

  // Draft night: the first round one pick at a time, the second round in a sweep.
  replayDraftNight(auto) {
    if (typeof Cutscene === 'undefined') return;
    if (auto && !Cutscene.enabled()) return;
    const C = Cutscene;
    const s = this.state;
    const picks = s.results || [];
    if (!picks.length) return;
    const logo = t => t ? `<img src="${this.nbaLogo(t)}" alt="" onerror="this.remove()">` : '';
    const r1 = picks.filter(p => p.round === 1), r2 = picks.filter(p => p.round === 2);
    const scenes = [{ ms: 2600, html: C.titleCard('Live', `${s.draftYear}<br>NBA Draft`, 'Sixty picks. Here we go.') }];
    r1.forEach(p => scenes.push({ ms: p.pick <= 5 ? 3400 : 2400, html: `<div class="cs-pick">
        <div class="cs-pick-no">${p.pick}</div>
        <div class="cs-pick-team">${logo(p.team)}${p.team ? p.team.name : ''}</div>
        <div class="cs-pick-select">select</div>
        <div class="cs-pick-name">${p.name}</div>
        <div class="cs-pick-meta">${[p.pos, p.class, p.school].filter(Boolean).join(' · ')}${p.ppg ? ` · ${p.ppg} ppg` : ''}${p.boardRank ? ` · No. ${p.boardRank} on the board` : ''}</div>
      </div>` }));
    if (r2.length) scenes.push({ ms: 5200, html: C.heading('Round Two') + `<div class="cs-list two">${r2.map((p, i) => `<div class="cs-row cs-item" style="--d:${i * 60}ms"><span class="cs-rank">${p.pick}</span>${p.team ? `<img src="${this.nbaLogo(p.team)}" class="cs-logo" alt="" onerror="this.remove()">` : ''}<span class="cs-name">${p.name}</span><span class="cs-meta">${p.school || ''}</span></div>`).join('')}</div>` });
    scenes.push({ ms: 0, html: C.confetti(40) + C.titleCard('', '<span class="small">The draft is complete</span>', `${picks[0].name} went first overall.`) });
    const inOffseason = s.source === 'local';
    C.play({ id: 'draftNightShow', theme: 'draft', label: 'Draft Night', scenes,
      actions: inOffseason && auto
        ? [{ label: 'See every pick', run: () => {} }, { label: 'Back to the NCAA RP', primary: true, run: () => { location.href = './ncaa.html'; } }]
        : [{ label: 'See every pick', primary: true }] });
  }
};

// Stage helpers (kept outside the object so tests can reach them).
function stageAtLeast(stage, key) {
  const order = DraftRP.TRACK.map(t => t.key);
  return order.indexOf(stage) >= order.indexOf(key);
}
function DraftCycleNext(stage) {
  if (typeof DraftCycle === 'undefined') return null;
  if (stage === 'live' || stage === 'complete') return null;
  return DraftCycle.nextStage(stage);
}

if (typeof module !== 'undefined' && module.exports) module.exports = DraftRP;
else if (typeof window !== 'undefined') window.DraftRP = DraftRP;
