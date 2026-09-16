window.SimEngine = {
  state: {
    year: 2028,
    week: 0,
    maxWeeks: 15,
    phase: 'Preseason',
    teams: [],
    recruits: [],
    activePlayers: [],
    simCompleted: false,
    statView: 'box', 
    sortCol: 'ppg',
    sortDir: 'desc',
    confFilter: 'ALL',   
    scopeFilter: 'full',
    scheduleConfFilter: 'ALL',
    scheduleTop25Only: false,
    selectedAwardConf: 'ACC',
    // --- Real schedule / postseason state ---
    schedule: [],           // flat list of {id, week, phase, isConf, home, away, played, result}
    nonConfEnd: 0,          // last week number of the non-conference slate
    confEnd: 0,             // last week number of the conference slate
    regularSeasonDone: false,
    confChampsDone: false,
    ncaaDone: false,
    confTournaments: {},    // confName -> bracket result from TournamentCore
    ncaaTournament: null,   // bracket result from TournamentCore
    ncaaFullBracket: null,  // pre-simulated bracket, revealed round by round
    ncaaRoundsRevealed: 0,
    draftDeclarations: [],  // players leaving for the draft, computed when the season ends
    seasonHistory: [],      // league-wide archive: one entry per completed season
    preseasonAwards: null,  // projected honours, computed before week 1
    apPollTop25: [],
    coachesByKey: {},
    rawRosterRows: [],
    allRecruits: [],
    departedNames: new Set(),
    leagueTsPct: 0.545,
    leagueShootingTotals: { pts: 0, fga: 0, fta: 0 },
    coachMatchCount: 0,
    offseasonStage: 'champion',
    offseasonStageIndex: 0,
    combineResults: [],
    draftResults: [],
    declarationSort: 'board',
    historySeasonView: null,
    themeMode: 'system',
    lastTransfers: [],      // portal moves from the most recent offseason
    lastDeclarations: [],   // declarations snapshot for the offseason screen
    lastDeclarationsYear: null,
    returningPlayers: [],   // early entrants who withdrew and came back
    seasonInitialized: false,
    scheduleViewWeek: 1,
    teamPageSelection: '',
    teamPageView: 'current',
    teamStatSortCol: 'ppg',
    teamStatSortDir: 'desc',
    teamStatsConfFilter: 'ALL',
    statsLimit: 25,
    statsPosFilter: 'ALL',
    statsQualifiedOnly: true,
    teamStatsPosFilter: 'ALL',
    teamRosterSortBox: 'mpg',
    teamRosterSortBoxDir: 'desc',
    teamRosterSortAdv: 'mpg',
    teamRosterSortAdvDir: 'desc',
    teamStatsView: 'box',
    recruitsStatusFilter: 'ALL',
    recruitsConfFilter: 'ALL'
  },

  async init() {
    await this.setupHomeScreen();
  },

  // Shows the home screen and enables/disables "Load Existing" depending
  // on whether a save actually exists — the sim no longer auto-loads or
  // auto-generates on page load, so there's always a clean way back to a
  // true fresh start via "New Save".
  async setupHomeScreen() {
    const hasSave = await this.checkForExistingSave();
    const loadBtn = document.getElementById('loadSaveBtn');
    const noSaveMsg = document.getElementById('noSaveMessage');
    if (loadBtn) loadBtn.disabled = !hasSave;
    if (noSaveMsg) noSaveMsg.style.display = hasSave ? 'none' : 'block';
  },

  async checkForExistingSave() {
    try {
      if (typeof db === 'undefined' || !db.leagueState) return false;
      const savedState = await db.leagueState.get(1);
      if (!savedState) return false;
      const teamCount = await db.teams.count();
      return teamCount > 0;
    } catch (err) {
      console.error('Error checking for existing save:', err);
      return false;
    }
  },

  // Wipes any existing save and builds a genuinely new universe from
  // scratch. This is the actual fix for "can't reset to the beginning" —
  // previously there was no way to clear IndexedDB from the UI at all.
  async startNewGame() {
    const hasSave = await this.checkForExistingSave();
    if (hasSave && !confirm("Starting a new save will permanently erase your current save. Continue?")) {
      return;
    }

    try {
      if (typeof db !== 'undefined' && db.leagueState) {
        await db.leagueState.clear();
        await db.teams.clear();
        await db.players.clear();
      }
    } catch (err) {
      console.error('Error clearing old save:', err);
    }

    this.resetStateToDefaults();
    this.enterSimUI();
    await this.fetchData();
  },

  async continueGame() {
    const hasSave = await this.checkForExistingSave();
    if (!hasSave) {
      alert("No existing save found. Start a New Save instead.");
      return;
    }
    this.enterSimUI();
    await this.loadSavedGame();
  },

  enterSimUI() {
    const home = document.getElementById('homeScreen');
    const layout = document.querySelector('.sim-layout');
    if (home) home.style.display = 'none';
    if (layout) layout.style.display = 'block';
  },

  resetStateToDefaults() {
    this.state.year = 2028;
    this.state.week = 0;
    this.state.maxWeeks = 15;
    this.state.phase = 'Preseason';
    this.state.teams = [];
    this.state.recruits = [];
    this.state.activePlayers = [];
    this.state.simCompleted = false;
    this.state.schedule = [];
    this.state.nonConfEnd = 0;
    this.state.confEnd = 0;
    this.state.regularSeasonDone = false;
    this.state.confChampsDone = false;
    this.state.ncaaDone = false;
    this.state.confTournaments = {};
    this.state.ncaaTournament = null;
    this.state.ncaaFullBracket = null;
    this.state.ncaaRoundsRevealed = 0;
    this.state.draftDeclarations = [];
    this.state.seasonHistory = [];
    this.state.seasonInitialized = false;
    this.state.scheduleViewWeek = 1;
  },

  async loadSavedGame() {
    try {
      if (typeof db !== 'undefined' && db.leagueState) {
        const savedState = await db.leagueState.get(1);

        if (savedState) {
          this.logNews("Loading save state from IndexedDB...");
          this.state.year = savedState.currentYear || 2028;
          this.state.week = savedState.currentWeek || 0;
          this.state.phase = savedState.currentPhase || 'Preseason';
          this.state.simCompleted = savedState.simCompleted || false;
          this.state.schedule = savedState.schedule || [];
          this.state.nonConfEnd = savedState.nonConfEnd || 0;
          this.state.confEnd = savedState.confEnd || 0;
          this.state.regularSeasonDone = savedState.regularSeasonDone || false;
          this.state.confChampsDone = savedState.confChampsDone || false;
          this.state.ncaaDone = savedState.ncaaDone || false;
          this.state.confTournaments = savedState.confTournaments || {};
          this.state.ncaaTournament = savedState.ncaaTournament || null;
          this.state.draftDeclarations = savedState.draftDeclarations || [];
          this.state.seasonHistory = savedState.seasonHistory || [];
          this.state.allRecruits = savedState.allRecruits || [];
          this.state.departedNames = new Set(savedState.departedNames || []);
          this.state.seasonInitialized = savedState.seasonInitialized || false;
          this.state.lastTransfers = savedState.lastTransfers || [];
          this.state.lastDeclarations = savedState.lastDeclarations || [];
          this.state.offseasonStageIndex = savedState.offseasonStageIndex || 0;
          this.state.draftResults = savedState.draftResults || [];
          this.state.combineResults = savedState.combineResults || [];
          this.state.lastDeclarationsYear = savedState.lastDeclarationsYear || null;
          this.state.returningPlayers = savedState.returningPlayers || [];
          this.state.scheduleViewWeek = savedState.scheduleViewWeek || 1;

          const savedTeams = await db.teams.toArray();
          const savedPlayers = await db.players.toArray();

          if (savedTeams.length > 0 && savedPlayers.length > 0) {
            this.state.teams = savedTeams;
            this.state.activePlayers = savedPlayers;
            this.syncUI();
            this.logNews(`Loaded Season ${this.state.year} (${this.state.teams.length} teams, ${this.state.activePlayers.length} players).`);
            return;
          }
        }
      }

      this.logNews("No valid save data found. Initializing a fresh universe...");
      await this.fetchData();
    } catch (err) {
      console.error("Error loading save:", err);
      this.logNews("Error loading save. Initializing fresh data...");
      await this.fetchData();
    }
  },

  // Brackets hold live references to team/player objects (handy for
  // rendering during the session), but persisting those directly would
  // duplicate full player records — including game logs — inside every
  // bracket game. The detailed box scores already live on each player's
  // own gameLog (which IS persisted via db.players), so the saved copy
  // of a bracket only needs the school names and final scores it
  // actually renders.
  serializeBracket(bracket) {
    if (!bracket) return null;
    const slimGame = g => ({
      teamA: { school: g.teamA.school },
      teamB: { school: g.teamB.school },
      winner: { school: g.winner.school },
      result: { homeScore: g.result.homeScore, awayScore: g.result.awayScore }
    });
    return {
      champion: { school: bracket.champion.school },
      playIn: bracket.playIn.map(slimGame),
      rounds: bracket.rounds.map(round => round.map(slimGame))
    };
  },

  async saveStateToDB() {
    if (typeof db === 'undefined' || !db.leagueState) return;
    try {
      const slimConfTournaments = {};
      Object.entries(this.state.confTournaments).forEach(([confName, bracket]) => {
        slimConfTournaments[confName] = this.serializeBracket(bracket);
      });

      await db.transaction('rw', db.leagueState, db.teams, db.players, async () => {
        await db.leagueState.put({
          id: 1,
          currentYear: this.state.year,
          currentWeek: this.state.week,
          currentPhase: this.state.phase,
          simCompleted: this.state.simCompleted,
          schedule: this.state.schedule,
          nonConfEnd: this.state.nonConfEnd,
          confEnd: this.state.confEnd,
          regularSeasonDone: this.state.regularSeasonDone,
          confChampsDone: this.state.confChampsDone,
          ncaaDone: this.state.ncaaDone,
          confTournaments: slimConfTournaments,
          ncaaTournament: this.serializeBracket(this.state.ncaaTournament),
          draftDeclarations: this.state.draftDeclarations,
          seasonHistory: this.state.seasonHistory,
          allRecruits: this.state.allRecruits,
          departedNames: Array.from(this.state.departedNames || []),
          seasonInitialized: this.state.seasonInitialized,
          lastTransfers: this.state.lastTransfers,
          lastDeclarations: this.state.lastDeclarations,
          offseasonStageIndex: this.state.offseasonStageIndex,
          draftResults: this.state.draftResults,
          combineResults: this.state.combineResults,
          lastDeclarationsYear: this.state.lastDeclarationsYear,
          returningPlayers: this.state.returningPlayers,
          scheduleViewWeek: this.state.scheduleViewWeek
        });
        await db.teams.clear();
        await db.teams.bulkAdd(this.state.teams);
        await db.players.clear();
        await db.players.bulkAdd(this.state.activePlayers);
      });
    } catch (err) {
      console.error("Failed to save state to IndexedDB:", err);
    }
  },

  // Maps schools whose logo filename doesn't derive from a simple
  // lowercase-and-strip-punctuation of any reasonable display name
  // (e.g. "Georgia Tech" -> gtech.png, not georgiatech.png). Add more
  // entries here (normalized-name -> filename-without-.png) if a
  // specific school's logo still doesn't show after this fix — the key
  // just needs to be the school name run through the same normalization
  // (lowercase, letters/numbers only).
  LOGO_ALIASES: {
    georgiatech: 'gtech',
    gt: 'gtech',
    pittsburgh: 'pitt',
    northcarolina: 'unc',
    uconn: 'connecticut',
    california: 'cal',
    southcarolina: 'scar',
    sandiegostate: 'sdsu',
    washingtonstate: 'wazzou',
    wazzu: 'wazzou',
    olemiss: 'olemiss',
    stjohn: 'stjohns'
  },

  // The exact set of schools with a real logo file in /schoollogos — kept
  // in sync with LOGO_ALIASES above (keys are filenames without ".png").
  // Anything NOT in this set gets an auto-generated initials badge instead
  // of a broken image — see generateFallbackLogo(). The moment a real file
  // is added for a school, it automatically takes priority; nothing else
  // needs to change.
  KNOWN_LOGO_FILES: new Set([
    'alabama', 'arizona', 'arizonastate', 'arkansas', 'auburn', 'baylor', 'boisestate', 'bostoncollege', 'butler',
    'byu', 'cal', 'cincinnati', 'clemson', 'colorado', 'coloradostate', 'connecticut', 'creighton', 'depaul',
    'duke', 'florida', 'floridastate', 'fordham', 'fresnostate', 'georgetown', 'georgia', 'gonzaga', 'gtech',
    'houston', 'illinois', 'indiana', 'iowa', 'iowastate', 'kansas', 'kansasstate', 'kentucky', 'louisville',
    'lsu', 'marquette', 'maryland', 'memphis', 'miami', 'michigan', 'michiganstate', 'minnesota', 'mississippistate',
    'missouri', 'ncstate', 'nebraska', 'northwestern', 'notredame', 'ohiostate', 'oklahoma', 'oklahomastate', 'olemiss',
    'oregon', 'oregonstate', 'pennstate', 'pitt', 'providence', 'purdue', 'rutgers', 'scar', 'sdsu',
    'setonhall', 'smu', 'stanford', 'stjohns', 'syracuse', 'tcu', 'temple', 'tennessee', 'texas',
    'texasam', 'texasstate', 'texastech', 'ucf', 'ucla', 'unc', 'unlv', 'usc', 'utah',
    'utahstate', 'vanderbilt', 'villanova', 'virginia', 'virginiatech', 'wakeforest', 'washington', 'wazzou', 'westvirginia',
    'wisconsin', 'xavier'
  ]),

  _logoCache: {},

  getTeamLogo(schoolName) {
    if (!schoolName || schoolName === 'Free Agent' || schoolName === 'Uncommitted') return '';
    if (this._logoCache[schoolName]) return this._logoCache[schoolName];

    const normalized = String(schoolName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileBase = this.LOGO_ALIASES[normalized] || normalized;

    const result = this.KNOWN_LOGO_FILES.has(fileBase)
      ? `../schoollogos/${fileBase}.png`
      : this.generateFallbackLogo(schoolName);

    this._logoCache[schoolName] = result;
    return result;
  },

  // Builds a small initials-on-a-circle badge as an inline SVG data URI —
  // no network request, no file to manage, and it's original artwork (not
  // a reproduction of any school's actual trademarked logo), so there's no
  // copyright concern in generating one for all 280+ schools without a
  // real file yet.
  generateFallbackLogo(schoolName) {
    const initials = this.getInitialsForBadge(schoolName);
    const color = this.getColorForName(schoolName);
    const fontSize = initials.length >= 4 ? 16 : initials.length === 3 ? 19 : 23;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<circle cx="32" cy="32" r="32" fill="${color}"/>` +
      `<text x="32" y="33" font-family="Arial, sans-serif" font-weight="700" font-size="${fontSize}" ` +
      `fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>` +
      `</svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  },

  getInitialsForBadge(name) {
    const stopWords = new Set(['of', 'the', 'at', 'and']);
    const cleaned = String(name).replace(/[^a-zA-Z0-9\s]/g, ' ');
    const words = cleaned.split(/\s+/).filter(w => w && !stopWords.has(w.toLowerCase()));
    if (words.length === 0) return '?';
    if (words.length === 1) {
      const w = words[0];
      // Already reads like an acronym (BYU, UTEP, UNLV) — keep it whole
      if (w.length <= 5 && w === w.toUpperCase()) return w;
      return w.slice(0, 3).toUpperCase();
    }
    return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  },

  // Deterministic (same school always gets the same color) so it stays
  // visually consistent across sessions and re-renders.
  getColorForName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 50%, 36%)`;
  },

  async fetchData() {
    let realTeamsMap = {};
    let rawRecruits = [];
    let sheetsReachable = true;

    try {
      const recruitsUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv";
      const rostersUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=0&single=true&output=csv";

      // Rosters and recruits are the critical data, so they're fetched on
      // their own. Coaches are loaded afterwards, separately: firing three
      // simultaneous requests at the same published sheet can get one of
      // them throttled, and a throttled coaches request must never be able
      // to take the rosters down with it.
      const [recruitsRes, rostersRes] = await Promise.all([
        this.fetchWithRetry(recruitsUrl), this.fetchWithRetry(rostersUrl)
      ]);

      if (recruitsRes.ok) {
        rawRecruits = this.parseCSV(await recruitsRes.text());
      }
      if (rostersRes.ok) {
        const rawRosters = this.parseCSV(await rostersRes.text());
        // Retained in full: rows for future seasons are how the sheet
        // expresses a predetermined transfer (same player, different team,
        // next year), which the offseason reads below.
        this.state.rawRosterRows = rawRosters;
        let skippedFutureSeasons = 0;
        rawRosters.forEach(rawPlayer => {
          if (!this.rowHasPlayerName(rawPlayer)) return;
          if (!this.rowBelongsToCurrentSeason(rawPlayer)) { skippedFutureSeasons++; return; }

          // Recruit-vs-roster overlap is resolved later, in
          // filterActiveData()/mergeRecruitIntoPlayer, once the full
          // universe (including auto-generated teams) exists — matching
          // here at the raw-row level can't see auto-generated rosters
          // and would miss those overlaps.
          const player = this.normalizePlayerObj(rawPlayer, false);
          if (!player.school || player.school === 'Free Agent') return;
          if (!realTeamsMap[player.school]) {
            realTeamsMap[player.school] = { school: player.school, conference: player.conference || 'NCAA', roster: [] };
          } else if (player.conference && player.conference !== 'NCAA') {
            realTeamsMap[player.school].conference = player.conference;
          }
          realTeamsMap[player.school].roster.push(player);
        });
        if (skippedFutureSeasons > 0) {
          console.log(`Skipped ${skippedFutureSeasons} roster rows belonging to a different season than ${this.state.year}-${(this.state.year + 1).toString().slice(2)}.`);
        }
      }
      if (!recruitsRes.ok && !rostersRes.ok) sheetsReachable = false;
    } catch (err) {
      console.error("Database Fetch Error:", err);
      sheetsReachable = false;
    }

    // Only the current and next recruiting class are relevant. Classes two
    // or more years out (2030+ during the 2028-29 season) are dropped
    // entirely so they can't leak onto rosters or into the player pool.
    // The full pool is retained. Filtering at load time discarded every
    // future class permanently, which is why only 2028 and 2029 ever
    // appeared — once the season rolled over there was nothing left to
    // promote. refreshRecruitPool() re-derives the active classes each year.
    const maxClassYear = this.state.year + 1;
    // Coaches load after the critical sheets, in their own error boundary.
    await this.loadCoaches();

    this.state.recruits = rawRecruits
      .filter(r => this.rowHasPlayerName(r))
      .map(r => this.normalizePlayerObj(r, true))
      ;
    this.state.allRecruits = [...this.state.recruits];
    this.refreshRecruitPool();
    this.buildFullD1Universe(Object.values(realTeamsMap));

    if (this.state.teams.length === 0) {
      this.logNews("Could not build a universe from sheets or the master team list. Check your data sources.");
      return;
    }

    this.initSeasonData();
    this.syncUI();
    await this.saveStateToDB();
    const realCount = Object.keys(realTeamsMap).length;
    const realPlayerCount = Object.values(realTeamsMap).reduce((n, t) => n + t.roster.length, 0);
    console.log(`Sheet load: ${realPlayerCount} roster players across ${realCount} schools, ${this.state.recruits.length} recruits, ${Object.keys(this.state.coachesByKey || {}).length} coaches.`);
    if (realPlayerCount === 0) {
      console.warn('No roster players were loaded from the sheet. Check the roster tab is published and that its season column matches the current season.');
    }
    if (!sheetsReachable) {
      this.logNews(`Could not reach Google Sheets — generated a full ${this.state.teams.length}-team universe from scratch.`);
    } else {
      this.logNews(`Loaded ${this.state.teams.length} teams (${realCount} with real roster data, the rest auto-filled) and ${this.state.activePlayers.length} players for ${this.state.year}.`);
    }
  },

  // Builds the full D1 universe: every school in TeamsMaster gets a team,
  // using real roster data wherever the Google Sheet has it and filling
  // every remaining roster spot (or an entire roster, for schools with no
  // real data yet) with generated players. This is what lets 300+ teams
  // exist and be playable without hand-entering thousands of players.
  buildFullD1Universe(realTeams) {
    if (typeof TeamsMaster === 'undefined' || typeof RosterGen === 'undefined') {
      console.error('TeamsMaster/RosterGen not loaded — check that teams-master.js and roster-gen.js are included before engine.js. Falling back to real sheet data only.');
      this.state.teams = realTeams.map(t => ({
        school: t.school, conference: t.conference, logo: this.getTeamLogo(t.school),
        roster: t.roster,
        simData: { teamOvr: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0, rosterRef: [], winPct: '.000' }
      }));
      this.filterActiveData();
      return;
    }

    const coachLookup = (school) => {
      if (typeof CoachCore === 'undefined') return null;
      const byKey = this.state.coachesByKey || {};
      const entry = byKey[RosterGen.normalizeSchoolKey(school)];
      return entry ? CoachCore.parseCoachStyle(entry.style) : null;
    };
    const { teams, unmatchedRealTeams } = RosterGen.buildFullUniverse(TeamsMaster, realTeams, {
      targetRosterSize: 13,
      coachProfileFor: coachLookup
    });
    if (unmatchedRealTeams.length > 0) {
      console.warn('Schools in your sheet not found in the master D1 list (kept as their own team rather than dropped):', unmatchedRealTeams);
    }

    this.state.teams = teams.map(t => ({
      school: t.school,
      conference: t.conference,
      logo: this.getTeamLogo(t.school),
      roster: t.roster.map(p => ({
        ...p,
        school_logo: this.getTeamLogo(t.school),
        gameLog: p.gameLog || [],
        accolades: p.accolades || [],
        stats: this.getZeroStats(),
        statsFull: this.getZeroStats(),
        statsConf: this.getZeroStats()
      })),
      simData: { teamOvr: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0, rosterRef: [], winPct: '.000' }
    }));

    this.filterActiveData();
    this.attachCoachesToTeams();
  },


  parseCSV(csvData) {
    const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    // Header names are normalised to lowercase alphanumerics so the column
    // lookups below are forgiving. Symbol-only headers ("#", "No.") would
    // normalise to an empty string and be lost, so they're mapped by hand
    // to 'jersey' before normalisation strips them.
    const HEADER_ALIASES = { '#': 'jersey', 'no': 'jersey', 'no.': 'jersey', '№': 'jersey' };
    const headers = lines[0].split(',').map(h => {
      const rawHeader = h.trim().replace(/(^"|"$)/g, '');
      const aliased = HEADER_ALIASES[rawHeader.toLowerCase()];
      if (aliased) return aliased;
      const normalized = rawHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalized || 'col' + Math.random().toString(36).slice(2, 6);
    });
    
    const result = [];
    for (let i = 1; i < lines.length; i++) {
      let rowValues = [];
      let inQuotes = false;
      let currentValue = '';
      for (let char of lines[i]) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { rowValues.push(currentValue.trim()); currentValue = ''; }
        else currentValue += char;
      }
      rowValues.push(currentValue.trim());
      
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = rowValues[index] ? rowValues[index].replace(/(^"|"$)/g, '') : '';
      });
      result.push(obj);
    }
    return result;
  },

  // Recognizes many real-world ways a spreadsheet might express a
  // player's current college class standing, and maps them to the
  // canonical FR/SO/JR/SR/GR codes the rest of the engine expects.
  // Returns null if nothing recognizable is found (caller decides the
  // safe fallback) rather than guessing.
  normalizeClassStanding(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    let s = String(raw).toLowerCase().trim();
    // Strip redshirt markers in all the forms the sheet uses: "RS-SR",
    // "R-FR", "RS SO", "R Jr". Previously only a bare leading "r" was
    // removed, so "RS-SR" became "ssr", matched nothing, and silently
    // defaulted to sophomore.
    s = s.replace(/^r\.?s\.?[\-\s_]*/, '');
    s = s.replace(/^r[\-\s_]+/, '');
    s = s.replace(/^(redshirt|rshirt)[\-\s_]*/, '');
    s = s.replace(/[^a-z0-9]/g, '');
    const map = {
      fr: 'FR', freshman: 'FR', firstyear: 'FR', '1': 'FR', '1st': 'FR',
      so: 'SO', soph: 'SO', sophomore: 'SO', secondyear: 'SO', '2': 'SO', '2nd': 'SO',
      jr: 'JR', junior: 'JR', thirdyear: 'JR', '3': 'JR', '3rd': 'JR',
      sr: 'SR', senior: 'SR', fourthyear: 'SR', '4': 'SR', '4th': 'SR',
      gr: 'GR', grad: 'GR', graduate: 'GR', graduatestudent: 'GR', gs: 'GR',
      fifthyear: 'GR', '5': 'GR', '5th': 'GR', supersenior: 'GR'
    };
    if (map[s]) return map[s];
    // Values like "SOsr" carry a valid code with trailing noise.
    const lead = s.slice(0, 2);
    return map[lead] || null;
  },

  // Pulls a 4-digit year out of things like "Class of 2028", "'28",
  // "2028-29", or a bare "2028" — used for recruiting class year, which
  // is a different concept from college class standing (see above).
  parseClassYear(raw, fallback) {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const match = String(raw).match(/(20\d{2})/);
    if (match) return parseInt(match[1], 10);
    const twoDigit = String(raw).match(/'?(\d{2})\b/);
    if (twoDigit) return 2000 + parseInt(twoDigit[1], 10);
    const n = parseInt(raw, 10);
    return isNaN(n) ? fallback : n;
  },

  // A CSV export usually carries trailing blank rows. Those were being
  // turned into a player literally named "Unknown Player" who, being the
  // only person on their team, had the entire team score reconciled onto
  // them — hence the 70-point scoring averages. Anything without a real
  // name in a name column is skipped outright.
  // The roster sheet carries several seasons of data at once. A row is
  // labelled by the season it belongs to; without filtering, future
  // seasons' rosters all pile into the current year at the same time.
  // Both labelling conventions are accepted (a 2028-29 season row may be
  // tagged either 2028 or 2029) so the sheet doesn't have to change.
  getRowSeasonYear(raw) {
    for (const key of ['season', 'seasonyear', 'year', 'rosteryear']) {
      const v = raw[key];
      if (v === undefined || v === '') continue;
      const m = String(v).match(/(20\d{2})/);
      if (m) return parseInt(m[1], 10);
      const n = parseInt(v, 10);
      if (!isNaN(n) && n > 1900) return n;
    }
    return null;
  },

  rowBelongsToCurrentSeason(raw) {
    const yr = this.getRowSeasonYear(raw);
    if (yr === null) return true;   // no season column — keep everything
    // Accept either labelling convention for the same season (2028-29 may
    // be tagged 2028 or 2029) but nothing from a later season.
    return yr === this.state.year || yr === this.currentSeasonSheetYear();
  },

  rowHasPlayerName(raw) {
    if (!raw || typeof raw !== 'object') return false;
    for (const key of ['name', 'player', 'fullname']) {
      const v = raw[key];
      if (typeof v === 'string' && v.trim().length > 1) return true;
    }
    return false;
  },

  // Builds a playstyle profile for a recruit from whatever their scouting
  // record offers: high-school / AAU box score columns when the sheet has
  // them, plus the curated strengths and weaknesses tags which are always
  // present. Returned multipliers nudge that player's college expectations
  // away from the generic positional baseline, so two 90-rated wings don't
  // simulate identically.
  // Converts a recruiting-service rating into an NCAA overall.
  //
  // The two scales are not the same thing: recruit ratings are tightly
  // bunched at the top (a 97 and a 90 are separated by seven points but by
  // an enormous gap in college readiness), so mapping them across directly
  // made every top-100 recruit an instant star. These bands come from how
  // those tiers actually perform:
  //   97+      national POY / top draft pick candidates      -> 90+
  //   94-96    all-conference, sometimes All-American        -> 83-89
  //   90-93    starters, occasionally all-conference         -> 78-82
  //   85-89    starter to bench rotation                     -> 73-78
  //   <85      rotation depth depending on roster quality    -> 66-73
  //
  // Every tier gets real spread, and a small share of players land well
  // outside their band in both directions — the unheralded recruit who
  // becomes an All-American is a real and recurring outcome, not noise
  // to be smoothed away.
  scaleRecruitRating(recruitRating, rng = Math.random) {
    const rr = parseFloat(recruitRating);
    if (isNaN(rr)) return null;

    // Ratings that already look like NCAA overalls (or are on a stars-style
    // scale) are left alone — only recruiting-service numbers get mapped.
    if (rr <= 5 || rr > 100) return null;

    let lo, hi;
    if (rr >= 97)      { lo = 89; hi = 95; }
    else if (rr >= 94) { lo = 83; hi = 89; }
    else if (rr >= 90) { lo = 78; hi = 83; }
    else if (rr >= 85) { lo = 73; hi = 78; }
    else if (rr >= 80) { lo = 68; hi = 74; }
    else               { lo = 64; hi = 71; }

    // Position within the band tracks position within the tier, so a 96
    // outperforms a 94 on average without being guaranteed to.
    const tierSpan = rr >= 97 ? 3 : (rr >= 94 ? 3 : (rr >= 90 ? 4 : (rr >= 85 ? 5 : 5)));
    const tierFloor = rr >= 97 ? 97 : (rr >= 94 ? 94 : (rr >= 90 ? 90 : (rr >= 85 ? 85 : (rr >= 80 ? 80 : 70))));
    const within = Math.max(0, Math.min(1, (rr - tierFloor) / tierSpan));

    // Centre of the band, nudged by tier position, then noise.
    let value = lo + (hi - lo) * (0.30 + within * 0.55);
    value += (rng() + rng() - 1) * 2.6;

    // Outliers. Roughly one in twenty-five misses their band badly, and one
    // in forty substantially exceeds it — the lightly-recruited player who
    // turns into a lottery pick.
    // Outliers, scaled so a lightly-recruited player can genuinely become
    // an All-American — the Keaton Wagler case. Lower tiers get the bigger
    // upside swing precisely because that's where the real surprises come
    // from; nobody is shocked when a 97 is good.
    const roll = rng();
    // Most breakouts are moderate — a player ranked in the forties who
    // turns into a top-ten prospect, not an unranked player becoming the
    // best in the country. Large jumps still happen, just rarely.
    const riserRoom = rr >= 94 ? 6 : (rr >= 90 ? 10 : (rr >= 85 ? 14 : 19));
    if (roll < 0.030) {
      const magnitude = rng() < 0.75 ? 0.45 : 1.0;   // usually a partial jump
      value += 4 + rng() * riserRoom * magnitude;
    }
    else if (roll < 0.075) value -= 5 + rng() * 7;

    return Math.max(55, Math.min(97, Math.round(value)));
  },

  buildPlaystyleProfile(raw, getVal) {
    const prof = { score: 1, reb: 1, ast: 1, stl: 1, blk: 1, threePar: 1, threePct: 1, ftPct: 1, usage: 1 };
    let found = false;

    // Try the common shapes a HS/AAU stat column might take.
    const statVal = (names) => {
      for (const base of names) {
        for (const pre of ['hs', 'aau', '']) {
          const v = getVal([pre + base], '');
          if (v !== '' && !isNaN(parseFloat(v))) return parseFloat(v);
        }
      }
      return null;
    };

    const ppg = statVal(['ppg', 'points', 'pts']);
    const rpg = statVal(['rpg', 'rebounds', 'reb', 'trb']);
    const apg = statVal(['apg', 'assists', 'ast']);
    const spg = statVal(['spg', 'steals', 'stl']);
    const bpg = statVal(['bpg', 'blocks', 'blk']);
    const tpa = statVal(['3pa', 'threepa', 'threepointattempts']);
    const tpp = statVal(['3ppct', 'threeppct', '3p', 'threepointpct']);
    const ftp = statVal(['ftpct', 'ft', 'freethrowpct']);

    // Ratios against a typical high-major HS line, clamped so one strange
    // number can't distort a whole career.
    const ratio = (v, typical) => v === null ? null : Math.max(0.6, Math.min(1.6, v / typical));
    const apply = (key, v, typical) => {
      const r = ratio(v, typical);
      if (r !== null) { prof[key] = r; found = true; }
    };
    apply('score', ppg, 18);
    apply('reb', rpg, 7);
    apply('ast', apg, 3.5);
    apply('stl', spg, 2);
    apply('blk', bpg, 1.2);
    apply('threePar', tpa, 5);
    if (tpp !== null) { prof.threePct = Math.max(0.75, Math.min(1.3, (tpp > 1 ? tpp / 100 : tpp) / 0.34)); found = true; }
    if (ftp !== null) { prof.ftPct = Math.max(0.8, Math.min(1.2, (ftp > 1 ? ftp / 100 : ftp) / 0.72)); found = true; }

    // Scouting tags are always available even when box scores aren't.
    const tags = (getVal(['strengths'], '') + ' ' + getVal(['scouting'], '') + ' ' + getVal(['attributes'], '')).toLowerCase();
    const weak = getVal(['weaknesses'], '').toLowerCase();
    const has = (txt, ...words) => words.some(w => txt.includes(w));

    if (has(tags, 'shoot', 'shooter', 'stroke', 'range', 'spacing')) { prof.threePar *= 1.25; prof.threePct *= 1.08; found = true; }
    if (has(tags, 'playmak', 'passer', 'passing', 'vision', 'facilitat')) { prof.ast *= 1.35; found = true; }
    if (has(tags, 'rebound', 'glass', 'motor')) { prof.reb *= 1.20; found = true; }
    if (has(tags, 'rim protect', 'shot block', 'block')) { prof.blk *= 1.40; found = true; }
    if (has(tags, 'defend', 'defense', 'lockdown', 'perimeter d')) { prof.stl *= 1.25; found = true; }
    if (has(tags, 'scorer', 'bucket', 'three level', 'shot creat', 'iso')) { prof.score *= 1.15; prof.usage *= 1.12; found = true; }
    if (has(tags, 'athlet', 'explosive', 'finisher', 'rim')) { prof.score *= 1.06; found = true; }

    if (has(weak, 'shoot', 'jumper', 'range')) { prof.threePct *= 0.85; prof.threePar *= 0.8; found = true; }
    if (has(weak, 'playmak', 'passing', 'tunnel')) { prof.ast *= 0.75; found = true; }
    if (has(weak, 'free throw')) { prof.ftPct *= 0.9; found = true; }
    if (has(weak, 'strength', 'frame', 'thin')) { prof.reb *= 0.88; found = true; }

    return found ? prof : null;
  },

  normalizePlayerObj(raw, isRecruit = false) {
    const getVal = (keys, fallback = '') => {
      for (let k of keys) if (raw[k] !== undefined && raw[k] !== '') return raw[k];
      return fallback;
    };
    // Blank OVR means "unrated depth" in the roster sheet, not "average
    // starter". Defaulting those to 75 let them out-rank rated players and
    // absorb rotation minutes.
    const rawRating = getVal(['rating', 'ovr', 'grade', 'stars'], '');
    let rating = (rawRating !== '' && !isNaN(parseFloat(rawRating))) ? parseFloat(rawRating) : 70;
    // Recruiting-service ratings live on a different scale to NCAA
    // overalls and have to be mapped, not copied across.
    if (isRecruit && rawRating !== '') {
      const scaled = this.scaleRecruitRating(rawRating);
      if (scaled !== null) {
        rating = scaled;
        }
    }
    // 'committedschool' is what the recruiting sheet actually uses — without
    // it every recruit read as Uncommitted.
    const school = getVal(['committedschool', 'school', 'team', 'committedto', 'college', 'commit'], 'Free Agent');

    // Deliberately does NOT fall back to 'classyear' here — that column
    // means "recruiting class" (e.g. Class of 2028), a different concept
    // from current college class standing, and conflating the two was
    // causing roster players' standings to come through as raw years.
    const rawClassStanding = getVal(['class', 'yr', 'classstanding', 'year'], '');
    const classStanding = this.normalizeClassStanding(rawClassStanding) || (isRecruit ? 'FR' : 'SO');

    return {
      id: getVal(['id', 'playerid'], `${getVal(['name', 'player'], 'unknown')}_${school}_${Math.random().toString(36).substr(2, 5)}`),
      name: getVal(['name', 'player', 'fullname'], 'Unknown Player'),
      school: school,
      conference: getVal(['conf', 'conference', 'league'], 'NCAA'),
      school_logo: this.getTeamLogo(school),
      pos: getVal(['pos', 'position'], 'G').toUpperCase(),
      class: classStanding,
      ht: getVal(['height', 'ht'], "6'4"),
      wt: getVal(['weight', 'wt'], "190"),
      hometown: getVal(['hometown', 'home', 'from'], 'N/A'),
      hs: getVal(['hs', 'highschool', 'prep', 'prepschool'], ''),
      jersey: String(getVal(['jersey', 'number', 'num', 'jerseynumber', 'uniform'], '')).replace(/[^0-9]/g, ''),
      // Optional authoring columns. None of these are displayed anywhere —
      // they exist purely so the sheet can steer the simulation directly.
      //   Role        focal point / starter / sixth man / bench / depth
      //   Attributes  free text tags, parsed like scouting strengths
      //   Athleticism 0-100, feeds finishing, steals and rebounding
      //   Potential   0-100, affects year-over-year development
      role: String(getVal(['role', 'playerrole', 'usage'], '')).trim().toLowerCase(),
      attributes: String(getVal(['attributes', 'attribute', 'traits', 'tags'], '')).trim(),
      athleticism: parseFloat(getVal(['athleticism', 'ath', 'athlete'], '')) || null,
      potential: parseFloat(getVal(['potential', 'pot', 'ceiling'], '')) || null,
      // National recruit ranking, used by the draft big board's pedigree term.
      rsci: parseFloat(getVal(['rsci', 'rank', 'nationalrank', 'ranking'], '')) || null,
      // Schools this player has suited up for, oldest first. Transfers
      // aren't simulated yet, so this is normally just the current school —
      // but the field exists so a transfer only has to append to it.
      collegeHistory: (() => {
        // Players who transferred before the simulation began carry their
        // prior stop in a "Previous School" column.
        const prev = getVal(['previousschool', 'prevschool', 'formerschool', 'transferfrom'], '');
        return prev && prev !== school ? [prev, school] : [school];
      })(),
      playstyle: this.buildPlaystyleProfile(raw, getVal),
      rating: rating,
      isRecruit: isRecruit,
      recClassYear: this.parseClassYear(getVal(['classyear', 'recclass'], ''), this.state.year),
      gameLog: [],
      accolades: [],
      stats: this.getZeroStats(),       
      statsFull: this.getZeroStats(),   
      statsConf: this.getZeroStats()    
    };
  },
  
  filterActiveData() {
    let players = [];
    this.state.teams.forEach(team => {
      if (team.roster) {
        team.roster.forEach(player => {
          if (player.class !== 'GRADUATED') players.push(player);
        });
      }
    });

    // Recruits who have arrived either enroll fresh or, if the roster
    // sheet already lists them (the two sheets commonly overlap for a
    // player's true freshman season), merge onto that existing entry.
    // The recruiting database is the more detailed, curated source, so
    // it wins on every field EXCEPT jersey number, which only the roster
    // sheet tracks — see mergeRecruitIntoPlayer.
    const stillPending = [];
    this.state.recruits.forEach(rec => {
      const arrived = !rec.recClassYear || rec.recClassYear <= this.state.year;
      if (!arrived) { stillPending.push(rec); return; }
      if (!rec.school || rec.school === 'Uncommitted' || rec.school === 'Free Agent') {
        stillPending.push(rec); return; // arrived but still uncommitted
      }

      const team = this.state.teams.find(t => t.school.toLowerCase() === rec.school.toLowerCase());
      if (!team) { stillPending.push(rec); return; } // committed school not in the universe

      const existing = team.roster.find(p => p.name === rec.name);
      if (existing) {
        this.mergeRecruitIntoPlayer(existing, rec);
        // existing is already in `players` from the roster scan above —
        // don't add it again.
      } else {
        rec.school = team.school;
        rec.school_logo = this.getTeamLogo(team.school);
        // Inherit the team's conference. Recruit records carry a generic
        // 'NCAA' placeholder, which made every enrolled recruit look like a
        // low-major player to the competition-level weighting.
        rec.conference = team.conference;
        rec.class = 'FR';
        rec.enrolled = true;      // now a college player, not a pending recruit
        // A full roster can't take another body.
        if ((team.roster || []).length >= this.ROSTER_LIMIT) { stillPending.push(rec); return; }
        team.roster.push(rec);
        players.push(rec);
      }
      // Enrolled either way — no longer a pending recruit, so it drops out
      // of state.recruits entirely rather than being re-checked (and
      // potentially re-merged, clobbering progressed stats) every season.
    });
    this.state.recruits = stillPending;

    // Every rostered player takes his team's conference, whatever the
    // source sheet said.
    this.state.teams.forEach(t => (t.roster || []).forEach(p => { p.conference = t.conference; }));

    this.state.activePlayers = players;
    this.assignMissingJerseys();
  },

  // Applies a recruit's data onto an existing roster player representing
  // the same person. Runtime/identity state (id, stats, game log, class
  // standing, jersey) is protected; every other field the recruit record
  // supplies overwrites the roster sheet's version, since the recruiting
  // database is the more detailed and authoritative source for a
  // player's scouting profile.
  mergeRecruitIntoPlayer(existingPlayer, recruit) {
    // The roster sheet is the authority on a player's current ability —
    // it reflects where he actually is now, whereas a recruiting rating
    // reflects where he was projected to be. Tyson Pollard can be a 95
    // recruit and an 86 college player, and the 86 is what should drive
    // the simulation. Everything else about his scouting profile (HS/AAU
    // playstyle, measurements, pedigree) still comes from the recruit record.
    const PROTECTED = new Set([
      'id', 'jersey', 'class', 'rating', 'gameLog', 'accolades', 'stats', 'statsFull',
      'statsConf', 'seasonHistory', 'isGenerated', 'isBench', 'isRecruit',
      'expectedStats', 'school_logo'
    ]);
    Object.keys(recruit).forEach(key => {
      if (PROTECTED.has(key)) return;
      const val = recruit[key];
      const meaningful = val !== undefined && val !== null && val !== ''
        && !(Array.isArray(val) && val.length === 0);
      if (meaningful) existingPlayer[key] = val;
    });
    // Recomputed rather than copied, since school may have just changed.
    existingPlayer.school_logo = this.getTeamLogo(existingPlayer.school);
    const tm = this.state.teams.find(t => t.school === existingPlayer.school);
    if (tm) existingPlayer.conference = tm.conference;
  },

  // Recruits join their roster after the universe is built, so they miss
  // the initial jersey pass. This fills any gap without disturbing numbers
  // that are already assigned (or that came from the roster sheet).
  assignMissingJerseys() {
    if (typeof RosterGen === 'undefined' || !RosterGen.pickJersey) return;
    this.state.teams.forEach(team => {
      const missing = (team.roster || []).filter(p => !p.jersey);
      if (missing.length === 0) return;
      const taken = new Set();
      team.roster.forEach(p => {
        const n = parseInt(p.jersey, 10);
        if (!isNaN(n)) taken.add(n);
      });
      missing
        .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
        .forEach(p => { p.jersey = RosterGen.pickJersey(taken); });
    });
  },

  getZeroStats() {
    const z1 = "0.0", z3 = ".000";
    return {
      gp: 0, gs: 0,
      totMin: 0, totPts: 0, totReb: 0, totOreb: 0, totDreb: 0, totAst: 0, totStl: 0,
      totBlk: 0, totTov: 0, totPf: 0, totFgm: 0, totFga: 0, totThreePm: 0,
      totThreePa: 0, totFtm: 0, totFta: 0,
      mpg: z1, ppg: z1, oreb: z1, dreb: z1, rpg: z1, apg: z1, stl: z1, blk: z1, tov: z1, pf: z1,
      fgm: z1, fga: z1, fgPct: z3, twoPm: z1, twoPa: z1, twoPPct: z3,
      threePm: z1, threePa: z1, threePPct: z3, ftm: z1, fta: z1, ftPct: z3,
      bpm: z1, obpm: z1, dbpm: z1, tsPct: z3, rTsPct: z1, eFgPct: z3,
      orebPct: '0.0%', drebPct: '0.0%', trbPct: '0.0%', astPct: '0.0%',
      tovPct: '0.0%', blkPct: '0.0%', usg: '0.0%', ftr: z3, threePar: z3,
      ortg: z1, drtg: z1, netRtg: z1,
      // Per-40-minute rates — pace/playing-time neutral, so a bench player
      // with 12 mpg can be compared directly against a 34 mpg starter.
      p40pts: z1, p40reb: z1, p40oreb: z1, p40dreb: z1, p40ast: z1,
      p40stl: z1, p40blk: z1, p40tov: z1, p40pf: z1, p40fga: z1, p40threePa: z1, p40fta: z1
    };
  },

  // --- Theme ---

  // Three states: 'system' (default, follows the OS), 'light', 'dark'.
  // An explicit choice is written to <html data-theme> and remembered.
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
    this.state.themeMode = mode;
  },

  // Conferences generally treated as "high major" — the power leagues whose
  // teams get at-large bids on resume rather than needing an auto bid.
  // Used by the "High Majors" option on every conference dropdown.
  HIGH_MAJOR_CONFERENCES: new Set(['ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East']),

  isHighMajor(conference) {
    return this.HIGH_MAJOR_CONFERENCES.has(conference);
  },

  getAllConferences() {
    return [...new Set(this.state.teams.map(t => t.conference).filter(Boolean))].sort();
  },

  // Returns true when a team/conference passes a dropdown filter value.
  // Filter values are 'ALL', 'HIGH_MAJOR', or an exact conference name.
  // Position filter. 'G' / 'F' accept either specific slot, so a roster
  // listing a player as just "G" still shows under a guard filter.
  matchesPosFilter(pos, filterValue) {
    if (!filterValue || filterValue === 'ALL') return true;
    const p = String(pos || '').toUpperCase();
    if (filterValue === 'G') return ['PG', 'SG', 'G', 'CG', 'G/F'].includes(p);
    if (filterValue === 'F') return ['SF', 'PF', 'F', 'W', 'F/C', 'G/F'].includes(p);
    if (filterValue === 'C') return p === 'C' || p === 'F/C';
    return p === filterValue;
  },

  setStatsQualified(val) {
    this.state.statsQualifiedOnly = (val === '1' || val === true);
    this.sortAndRenderStatsTable();
  },

  setStatsPosFilter(val) {
    this.state.statsPosFilter = val;
    this.sortAndRenderStatsTable();
  },

  matchesConfFilter(conference, filterValue) {
    if (!filterValue || filterValue === 'ALL') return true;
    if (filterValue === 'HIGH_MAJOR') return this.isHighMajor(conference);
    return conference === filterValue;
  },

  // Fills every conference <select> on the page with the full conference
  // list plus a High Majors option, preserving the current selection.
  // Replaces the old hardcoded 10-conference lists in the HTML.
  populateConferenceDropdowns() {
    const confs = this.getAllConferences();
    if (confs.length === 0) return;

    const fill = (id, includeAll, allLabel) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const prev = sel.value;
      let html = '';
      if (includeAll) html += `<option value="ALL">${allLabel}</option>`;
      html += `<option value="HIGH_MAJOR">High Majors</option>`;
      html += confs.map(c => `<option value="${c}">${c}</option>`).join('');
      sel.innerHTML = html;
      const valid = Array.from(sel.options).some(o => o.value === prev);
      sel.value = valid && prev ? prev : (includeAll ? 'ALL' : (confs[0] || ''));
    };

    fill('confFilter', true, 'All NCAA');
    fill('recruitsConfFilter', true, 'All NCAA');
    fill('teamStatsConfFilter', true, 'All NCAA');
    fill('awardConfFilter', false, '');
  },

  _confLogoCache: {},

  // Conference logo path. Files are expected in /conferencelogos as the
  // conference name lowercased with punctuation stripped ("Pac-12" ->
  // pac12.png, "Big Ten" -> bigten.png). If the file isn't there yet the
  // <img> onerror handler swaps in a generated badge, so a missing folder
  // degrades gracefully instead of showing broken images.
  // Several conference logo files in /conferencelogos use the league's
  // common abbreviation rather than its full name, so a plain
  // lowercase-and-strip of the conference name misses them. Mapped against
  // the actual filenames in the repo.
  CONFERENCE_LOGO_ALIASES: {
    americaeast: 'aec',
    american: 'aac',
    conferenceusa: 'cusa',
    missourivalley: 'mvc',
    mountainwest: 'mw',
    ohiovalley: 'ovc',
    southern: 'socon',
    southland: 'slc',
    sunbelt: 'sbc',
    thesummit: 'summitleague',
    summit: 'summitleague',
    westcoast: 'wcc',
    uac: 'wac'
  },

  getConferenceLogo(conference) {
    if (!conference) return '';
    const normalized = String(conference).toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileBase = this.CONFERENCE_LOGO_ALIASES[normalized] || normalized;
    return `../conferencelogos/${fileBase}.png`;
  },

  getConferenceLogoImg(conference, className = 'conf-logo') {
    const fallback = this.generateFallbackLogo(conference);
    const src = this.getConferenceLogo(conference);
    // Log which file was missing rather than silently substituting a badge —
    // otherwise a typo'd filename looks identical to "no logo uploaded yet".
    return `<img src="${src}" class="${className}" alt="${conference}" ` +
           `onerror="console.warn('Conference logo not found: ${src}');this.onerror=null;this.src='${fallback}';">`;
  },

  // --- In-season AP poll, game score, and draft big board ---

  // In-season AP Top 25. Unlike the preseason poll (pure roster strength),
  // this weighs what has actually happened: winning percentage, quality of
  // schedule faced, and underlying talent as a tiebreaker — which is
  // roughly how real voters behave once there are results to look at.
  computeAPPoll() {
    if (this.state.teams.length === 0) return;
    const sosValues = this.state.teams.map(t => t.sos || 0);
    const sosMin = Math.min(...sosValues), sosMax = Math.max(...sosValues);
    const sosRange = Math.max(0.001, sosMax - sosMin);

    this.state.teams.forEach(t => {
      const gp = t.simData.wins + t.simData.losses;
      const winPct = gp > 0 ? t.simData.wins / gp : 0;
      // Normalised 0-1 schedule difficulty, so beating good teams counts.
      const sosNorm = ((t.sos || 0) - sosMin) / sosRange;
      const talent = (t.simData.teamOvr || 0);

      // Winning is the dominant term; schedule strength rewards teams that
      // earned their record; talent keeps early-season noise sane before
      // many games have been played.
      const resumeWeight = Math.min(1, gp / 12);
      // Brand matters to voters, especially early. Power-conference
      // programs and a handful of prestigious mid-majors carry weight that
      // a low-major with the same record simply doesn't get, and a roster
      // full of blue-chip recruits buys preseason benefit of the doubt.
      const isPower = (typeof DraftCore !== 'undefined') && DraftCore.POWER_SIX.has(t.conference);
      const isStrongMid = (typeof DraftCore !== 'undefined') && DraftCore.STRONG_MID.has(t.conference);
      const PRESTIGE_MIDS = ['Gonzaga', 'Saint Mary\'s', 'Memphis', 'Dayton', 'VCU', 'Wichita State', 'Butler'];
      let prestige = isPower ? 5.5 : (isStrongMid ? 3 : 0);
      if (PRESTIGE_MIDS.includes(t.school)) prestige = Math.max(prestige, 5.5);

      const blueChips = (t.roster || [])
        .filter(p => p.rsci && parseFloat(p.rsci) <= 60).length;
      const recruitingWeight = Math.min(6, blueChips * 1.5);

      // Prestige and recruiting dominate before results exist, then fade
      // as the resume fills in.
      const brandWeight = 1 - resumeWeight * 0.65;

      const rawScore = (winPct * 55 * resumeWeight)
                + (sosNorm * 18 * resumeWeight)
                + (talent * 0.42)
                + (t.simData.wins * 0.35)
                + (prestige + recruitingWeight) * brandWeight;

      // Polls are sticky: voters move teams gradually unless something
      // decisive happens, so each week's score is blended with the last.
      t.apScore = (t.apScore !== undefined && this.state.week > 1)
        ? t.apScore * 0.45 + rawScore * 0.55
        : rawScore;
    });

    const sorted = [...this.state.teams].sort((a, b) => b.apScore - a.apScore);
    sorted.forEach((t, i) => { t.apRank = i < 25 ? i + 1 : null; });
    this.state.apPollTop25 = sorted.slice(0, 25);
  },

  // Hollinger's Game Score — a single-number summary of one box score.
  // Used to surface the week's best individual performances.
  gameScore(g) {
    if (!g) return 0;
    return (g.pts || 0)
      + 0.4 * (g.fgm || 0)
      - 0.7 * (g.fga || 0)
      - 0.4 * ((g.fta || 0) - (g.ftm || 0))
      + 0.7 * (g.oreb || 0)
      + 0.3 * (g.dreb !== undefined ? g.dreb : Math.max(0, (g.reb || 0) - (g.oreb || 0)))
      + (g.stl || 0)
      + 0.7 * (g.ast || 0)
      + 0.7 * (g.blk || 0)
      - 0.4 * (g.pf || 0)
      - (g.tov || 0);
  },

  // Best individual box scores from a given week, ranked by Game Score.
  getTopPerformances(week, limit = 5) {
    const target = week || this.state.week;
    const out = [];
    this.state.activePlayers.forEach(p => {
      (p.gameLog || []).forEach(g => {
        if (g.week !== target || !g.min) return;
        out.push({ player: p, game: g, score: this.gameScore(g) });
      });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  },

  // Live NBA draft big board, recomputed as the season progresses.
  // Weighted by: youth, positional size, on-court production and winning,
  // and incoming recruit pedigree — with pedigree fading as real game
  // evidence accumulates, so a highly-ranked recruit who plays badly slides.
  // Delegates to DraftCore so the in-season board and the standalone
  // Draft RP page rank prospects with identical logic.
  computeDraftBigBoard(limit = 60) {
    if (typeof DraftCore === 'undefined') {
      console.error('DraftCore not loaded — check that draft-core.js is included before engine.js');
      return [];
    }
    const winPctFor = (school) => {
      const team = this.state.teams.find(t => t.school === school);
      if (!team) return 0.5;
      const gp = team.simData.wins + team.simData.losses;
      return gp > 0 ? team.simData.wins / gp : 0.5;
    };
    // Build the full ranking first, pin the generational prospects into
    // their established range, and only then trim to the requested depth —
    // pinning after the slice would silently drop anyone who hadn't made
    // the cut on production alone.
    const full = DraftCore.buildBigBoard(this.state.activePlayers, winPctFor, this.state.activePlayers.length);
    const pinned = DraftCore.applyPinnedProspects(full, this.state.year + 1, this.state.activePlayers, winPctFor);
    return pinned.slice(0, limit);
  },

  // A published Google Sheet occasionally returns a transient error or a
  // throttled response. One quick retry turns most of those into a normal
  // load instead of an empty universe.
  async fetchWithRetry(url, attempts = 2) {
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 400));
    }
    console.warn(`Sheet request failed after ${attempts} attempts (${url.slice(0, 80)}...):`, lastErr && lastErr.message);
    return { ok: false, text: async () => '' };
  },

  async loadCoaches() {
    const coachesUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=1430573464&single=true&output=csv";
    try {
      const res = await this.fetchWithRetry(coachesUrl);
      if (res.ok) this.parseCoaches(this.parseCSV(await res.text()));
      else console.warn('Coaches sheet unavailable — teams will simulate with neutral coaching profiles.');
    } catch (err) {
      console.warn('Coaches sheet failed to load; continuing without coaching profiles.', err);
    }
  },

  // --- Coaches ---

  // The coaches sheet is grouped by conference, with a bare conference name
  // on its own row and blank coach/description cells. Those separator rows
  // are skipped. A handful of schools appear twice because of realignment;
  // the first entry wins.
  parseCoaches(rows) {
    const byKey = {};
    let skipped = 0;
    (rows || []).forEach(r => {
      const school = String(r.school || '').trim();
      const coach = String(r.headcoach || r.coach || '').trim();
      const desc = String(r.coachingstyletacticaldescription || r.coachingstyle || r.description || '').trim();
      if (!school || !coach) { skipped++; return; }
      const key = (typeof RosterGen !== 'undefined')
        ? RosterGen.normalizeSchoolKey(school)
        : school.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (byKey[key]) return;
      byKey[key] = { school, name: coach, style: desc };
    });
    this.state.coachesByKey = byKey;
    console.log(`Loaded ${Object.keys(byKey).length} coaches (${skipped} conference header rows skipped).`);
  },

  // Attaches a coach and parsed tactical profile to every team we can
  // match. Matching runs through the same school alias index the roster
  // data uses, so "Connecticut" and "UConn" resolve to one program.
  attachCoachesToTeams() {
    if (typeof CoachCore === 'undefined') return;
    const byKey = this.state.coachesByKey || {};
    const neutral = () => CoachCore.neutralProfile();

    if (Object.keys(byKey).length === 0 || typeof RosterGen === 'undefined') {
      this.state.teams.forEach(t => {
        if (!t.coachProfile) { t.coach = t.coach || null; t.coachProfile = neutral(); t.coachTags = []; }
      });
      return;
    }

    const aliasIndex = RosterGen.buildSchoolAliasIndex(TeamsMaster);
    const byCanonical = {};
    Object.entries(byKey).forEach(([key, entry]) => {
      const canonical = aliasIndex[key];
      if (canonical && !byCanonical[canonical]) byCanonical[canonical] = entry;
    });

    let matched = 0;
    const unmatched = [];
    this.state.teams.forEach(t => {
      const entry = byCanonical[t.school] || byKey[RosterGen.normalizeSchoolKey(t.school)];
      if (entry) {
        t.coach = { name: entry.name, style: entry.style };
        t.coachProfile = CoachCore.parseCoachStyle(entry.style);
        t.coachTags = CoachCore.styleTags(t.coachProfile);
        matched++;
      } else {
        t.coach = null;
        t.coachProfile = neutral();
        t.coachTags = [];
        unmatched.push(t.school);
      }
    });
    this.state.coachMatchCount = matched;
    this.centerCoachProfiles();
    if (unmatched.length) {
      console.log(`Coaches matched for ${matched}/${this.state.teams.length} teams. No coach on file for: ${unmatched.slice(0, 20).join(', ')}${unmatched.length > 20 ? ` (+${unmatched.length - 20} more)` : ''}`);
    }
  },

  // Re-centres every trait so the LEAGUE average is exactly neutral.
  // Relative differences between coaches are preserved untouched — this
  // only removes collective skew. Without it, a sheet where most
  // descriptions happen to say "up-tempo" would quietly inflate scoring
  // across all 365 teams and undo the statistical calibration.
  centerCoachProfiles() {
    if (typeof CoachCore === 'undefined') return;
    const traits = Object.keys(CoachCore.CLAMPS);
    const teams = this.state.teams.filter(t => t.coachProfile);
    if (teams.length === 0) return;

    traits.forEach(trait => {
      let sum = 0;
      teams.forEach(t => { sum += (t.coachProfile[trait] || 1); });
      const mean = sum / teams.length;
      if (!mean || Math.abs(mean - 1) < 0.001) return;
      teams.forEach(t => {
        t.coachProfile[trait] = (t.coachProfile[trait] || 1) / mean;
      });
    });

    // Tags are derived from the numbers, so refresh them after centring.
    teams.forEach(t => { t.coachTags = CoachCore.styleTags(t.coachProfile); });
    this.rebuildCoachProfileMap();
  },

  // Looked up through a map: this runs once per player on every rebuild of
  // stat expectations, and scanning all 365 teams each time was needless
  // work in the hottest path in the engine.
  getCoachProfile(school) {
    if (this._coachProfileMap && this._coachProfileMap[school]) return this._coachProfileMap[school];
    const t = this.state.teams.find(x => x.school === school);
    if (t && t.coachProfile) return t.coachProfile;
    return (typeof CoachCore !== 'undefined') ? CoachCore.neutralProfile() : null;
  },

  rebuildCoachProfileMap() {
    this._coachProfileMap = {};
    this.state.teams.forEach(t => {
      if (t.coachProfile) this._coachProfileMap[t.school] = t.coachProfile;
    });
  },

  // --- Preseason rankings & strength of schedule ---

  // Preseason poll: driven by roster strength, with a deliberate lean
  // toward established high-major programs the way real preseason polls
  // favour brand-name teams before anyone has played a game.
  computePreseasonRankings() {
    const tierBonus = { 1: 3.0, 2: 1.2, 3: 0.0, 4: -1.0 };
    this.state.teams.forEach(t => {
      const tier = (typeof RosterGen !== 'undefined') ? RosterGen.getConferenceTier(t.conference) : 3;
      const bonus = (tierBonus[tier] || 0) + (this.isHighMajor(t.conference) ? 1.5 : 0);
      t.preseasonScore = (t.simData.teamOvr || 0) + bonus;
    });
    const sorted = [...this.state.teams].sort((a, b) => b.preseasonScore - a.preseasonScore);
    sorted.forEach((t, i) => { t.preseasonRank = i + 1; });
  },

  // Strength of schedule = average team-overall of every opponent on the
  // slate, then ranked across all teams (1 = toughest schedule).
  computeStrengthOfSchedule() {
    const ovrBySchool = {};
    this.state.teams.forEach(t => { ovrBySchool[t.school] = t.simData.teamOvr || 0; });

    const oppTotals = {};
    this.state.teams.forEach(t => { oppTotals[t.school] = { sum: 0, n: 0 }; });

    this.state.schedule.forEach(g => {
      if (oppTotals[g.home] && ovrBySchool[g.away] !== undefined) {
        oppTotals[g.home].sum += ovrBySchool[g.away]; oppTotals[g.home].n++;
      }
      if (oppTotals[g.away] && ovrBySchool[g.home] !== undefined) {
        oppTotals[g.away].sum += ovrBySchool[g.home]; oppTotals[g.away].n++;
      }
    });

    this.state.teams.forEach(t => {
      const rec = oppTotals[t.school];
      t.sos = rec && rec.n > 0 ? rec.sum / rec.n : 0;
    });
    const sorted = [...this.state.teams].sort((a, b) => b.sos - a.sos);
    sorted.forEach((t, i) => { t.sosRank = i + 1; });
  },

  // --- Team aggregate statistics ---

  // Aggregates a team's per-game box score and advanced numbers from its
  // players' game logs plus the real game results (for opponent points).
  computeTeamStats(team) {
    const totals = { min:0, pts:0, oreb:0, dreb:0, reb:0, ast:0, stl:0, blk:0, tov:0, pf:0,
                     fgm:0, fga:0, twoPm:0, twoPa:0, threePm:0, threePa:0, ftm:0, fta:0 };
    (team.roster || []).forEach(p => {
      (p.gameLog || []).forEach(log => {
        for (const k in totals) totals[k] += (log[k] || 0);
      });
    });

    const played = this.state.schedule.filter(g => g.played && g.result && (g.home === team.school || g.away === team.school));
    let oppPts = 0;
    played.forEach(g => {
      const isHome = g.home === team.school;
      oppPts += isHome ? g.result.awayScore : g.result.homeScore;
    });

    const gp = played.length;
    const d = Math.max(1, gp);
    const t1 = v => (v / d).toFixed(1);
    const t3 = (m, a) => a > 0 ? (m / a).toFixed(3).replace(/^0+/, '') : '.000';

    // Possessions estimate (standard box-score formula) drives the tempo-free
    // offensive/defensive ratings below.
    const poss = totals.fga - totals.oreb + totals.tov + 0.44 * totals.fta;
    const possPerGame = poss / d;

    return {
      gp,
      ppg: t1(totals.pts), oppPpg: t1(oppPts), diff: ((totals.pts - oppPts) / d).toFixed(1),
      oreb: t1(totals.oreb), dreb: t1(totals.dreb), rpg: t1(totals.reb), apg: t1(totals.ast),
      stl: t1(totals.stl), blk: t1(totals.blk), tov: t1(totals.tov), pf: t1(totals.pf),
      fgm: t1(totals.fgm), fga: t1(totals.fga), fgPct: t3(totals.fgm, totals.fga),
      threePm: t1(totals.threePm), threePa: t1(totals.threePa), threePPct: t3(totals.threePm, totals.threePa),
      ftm: t1(totals.ftm), fta: t1(totals.fta), ftPct: t3(totals.ftm, totals.fta),
      eFgPct: totals.fga > 0 ? t3(totals.fgm + 0.5 * totals.threePm, totals.fga) : '.000',
      tsPct: (totals.fga + 0.44 * totals.fta) > 0 ? t3(totals.pts, 2 * (totals.fga + 0.44 * totals.fta)) : '.000',
      astToRatio: totals.tov > 0 ? (totals.ast / totals.tov).toFixed(2) : '0.00',
      threePar: t3(totals.threePa, totals.fga),
      ftr: t3(totals.fta, totals.fga),
      pace: possPerGame.toFixed(1),
      ortg: poss > 0 ? ((totals.pts / poss) * 100).toFixed(1) : '0.0',
      drtg: poss > 0 ? ((oppPts / poss) * 100).toFixed(1) : '0.0',
      netRtg: poss > 0 ? (((totals.pts - oppPts) / poss) * 100).toFixed(1) : '0.0'
    };
  },

  // Computes stats for every team once, then attaches a rank for each
  // statistic so a team page can show "14.2 (12th)" style context.
  // Cached per render pass because it touches every player's game log.
  computeAllTeamStats() {
    const rows = this.state.teams.map(t => ({
      school: t.school,
      conference: t.conference,
      wins: t.simData.wins,
      losses: t.simData.losses,
      confWins: t.simData.confWins,
      confLosses: t.simData.confLosses,
      stats: this.computeTeamStats(t)
    }));

    // Stats where a LOWER value is better get ranked ascending.
    const lowerIsBetter = new Set(['oppPpg', 'tov', 'pf', 'drtg']);
    const rankable = ['ppg','oppPpg','diff','oreb','dreb','rpg','apg','stl','blk','tov','pf',
                      'fgm','fga','fgPct','threePm','threePa','threePPct','ftm','fta','ftPct',
                      'eFgPct','tsPct','astToRatio','threePar','ftr','pace','ortg','drtg','netRtg'];

    rankable.forEach(key => {
      const sorted = [...rows].sort((a, b) => {
        const av = parseFloat(a.stats[key]) || 0;
        const bv = parseFloat(b.stats[key]) || 0;
        return lowerIsBetter.has(key) ? av - bv : bv - av;
      });
      sorted.forEach((r, i) => {
        if (!r.ranks) r.ranks = {};
        r.ranks[key] = i + 1;
      });
    });

    return rows;
  },

  ordinal(n) {
    if (!n) return '—';
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },

  initSeasonData() {
    this.state.seasonInitialized = true;
    this.state.leagueShootingTotals = { pts: 0, fga: 0, fta: 0 };
    this.state.activePlayers.forEach(p => {
      p.injuredUntilWeek = null; p.gamesMissed = 0;
      if (p.baseRating !== undefined) { p.rating = p.baseRating; delete p.baseRating; }
    });
    this.state.schedule = [];
    this.state.regularSeasonDone = false;
    this.state.confChampsDone = false;
    this.state.ncaaDone = false;
    this.state.confTournaments = {};
    this.state.ncaaTournament = null;
    this.state.ncaaFullBracket = null;
    this.state.ncaaRoundsRevealed = 0;
    this.state.draftDeclarations = [];
    this.state.scheduleViewWeek = 1;

    this.state.teams.forEach(team => {
      let roster = this.state.activePlayers.filter(p => p.school === team.school);
      roster.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));

      // Rotation weights. The old 0.78-per-rank decay was far too steep: it
      // handed the top handful of players enormous minute shares, which then
      // inflated every counting stat through usageScale. A gentler decay
      // spreads 200 minutes across a believable 9-10 man rotation.
      const top8 = roster.slice(0, 8);
      const teamOvr = top8.reduce((sum, p) => sum + parseFloat(p.rating), 0) / Math.max(1, Math.min(8, top8.length));
      const winPct = Math.min(0.94, Math.max(0.06, 0.50 + (teamOvr - 78) * 0.038));

      team.expectedWinPct = winPct;
      team.simData = { teamOvr, wins: 0, losses: 0, confWins: 0, confLosses: 0, rosterRef: roster, winPct: '.000',
        totals: { min: 0, fga: 0, fta: 0, tov: 0, fgm: 0, oreb: 0, dreb: 0, reb: 0, ast: 0 },
        oppTotals: { min: 0, fga: 0, fta: 0, tov: 0, fgm: 0, oreb: 0, dreb: 0, reb: 0, ast: 0 } };

      this.buildRotation(team);

      roster.forEach(p => {
        p.expectedStats = this.buildBaseStatExpectations(p, p.allocatedMpg || 0, team);
        p.gameLog = [];
        p.statsFull = this.getZeroStats();
        p.statsConf = this.getZeroStats();
        p.stats = p.statsFull;
        p.accolades = [];
      });
    });

    this.generateSeasonSchedule();
    this.computePreseasonAwards();
  },

  // Preseason honours are pure projection: player rating plus a nudge for
  // playing on a strong team, exactly the way real preseason watchlists
  // lean toward contenders. Runs before any game is simulated.
  computePreseasonAwards() {
    const teamOvrBySchool = {};
    this.state.teams.forEach(t => { teamOvrBySchool[t.school] = t.simData.teamOvr || 0; });

    const pool = this.state.activePlayers
      .filter(p => p.expectedStats && parseFloat(p.expectedStats.mpg) > 8)
      .map(p => ({
        p,
        score: parseFloat(p.rating) + ((teamOvrBySchool[p.school] || 70) - 75) * 0.25
      }))
      .sort((a, b) => b.score - a.score);

    this.state.preseasonAwards = {
      poy: pool[0] ? pool[0].p : null,
      froy: (pool.find(x => x.p.class === 'FR') || {}).p || null,
      allAmericans: pool.slice(0, 15).map(x => x.p)
    };

    pool.slice(0, 15).forEach((x, i) => {
      const team = i < 5 ? '1st' : (i < 10 ? '2nd' : '3rd');
      const label = `Preseason All-American (${team} Team)`;
      if (!x.p.accolades.includes(label)) x.p.accolades.push(label);
    });
    if (pool[0] && !pool[0].p.accolades.includes('Preseason POY')) pool[0].p.accolades.push('Preseason POY');
    const fr = pool.find(x => x.p.class === 'FR');
    if (fr && !fr.p.accolades.includes('Preseason Freshman of the Year')) fr.p.accolades.push('Preseason Freshman of the Year');
  },

  generateSeasonSchedule() {
    if (typeof ScheduleCore === 'undefined') {
      console.error('ScheduleCore not loaded — check that schedule-core.js is included before engine.js');
      return;
    }
    const teamRefs = this.state.teams.map(t => ({ school: t.school, conference: t.conference || 'Independent' }));
    const { schedule, nonConfEnd, confEnd } = ScheduleCore.generateFullSchedule(teamRefs, {
      // 13 non-conference games plus a conference slate gets each team to
      // roughly the 32-game regular season a real Division I team plays.
      nonConfGamesPerTeam: 15,
      nonConfStartWeek: 1,
      nonConfWeeks: 10,
      confGamesPerWeek: 2
    });
    this.state.schedule = schedule;
    this.state.nonConfEnd = nonConfEnd;
    this.state.confEnd = confEnd;
    this.state.maxWeeks = confEnd;
    this.state.scheduleViewWeek = 1;

    // Both depend on the finished schedule and on every team's rating,
    // so they run here rather than during roster construction.
    this.computePreseasonRankings();
    this.computeStrengthOfSchedule();
  },

  // Which lineup slots each position label can credibly fill. The roster
  // sheet mixes specific slots (PG/SG/SF/PF/C) with generic ones (G/W/F)
  // and combos (F/C), so eligibility has to be a map rather than an
  // exact match.
  SLOT_ELIGIBILITY: {
    PG: ['PG', 'G', 'CG'],
    SG: ['SG', 'G', 'CG', 'W'],
    SF: ['SF', 'W', 'F', 'G/F'],
    PF: ['PF', 'F', 'F/C'],
    C:  ['C', 'F/C']
  },

  // Builds a real starting five plus a depth chart, rather than simply
  // handing minutes to the five highest-rated players. Two teams with the
  // same talent now distribute it differently depending on positional fit,
  // and a good freshman stuck behind an established player at his own
  // position gets bench minutes instead of automatically starting.
  buildRotation(team) {
    const roster = [...(team.roster || [])].sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
    const assigned = new Set();
    const starters = [];

    // Fill the scarcest slots first — centres and point guards are the
    // hardest to cover, so they get first pick of the roster.
    const startsByRole = (p) => ['focalpoint', 'focal', 'star', 'starter'].includes((p.role || '').replace(/[^a-z]/g, ''));
    ['C', 'PG', 'PF', 'SG', 'SF'].forEach(slot => {
      const eligible = this.SLOT_ELIGIBILITY[slot];
      // A player the sheet marks as a starter gets first refusal on his slot.
      const pick = roster.find(p => !assigned.has(p.id) && startsByRole(p) && eligible.includes((p.pos || '').toUpperCase()))
        || roster.find(p => !assigned.has(p.id) && eligible.includes((p.pos || '').toUpperCase()));
      if (pick) {
        assigned.add(pick.id);
        pick.lineupSlot = slot;
        starters.push(pick);
      }
    });

    // Any slot that couldn't be filled by a natural fit goes to the best
    // player left, playing out of position.
    while (starters.length < 5 && starters.length < roster.length) {
      const pick = roster.find(p => !assigned.has(p.id));
      if (!pick) break;
      assigned.add(pick.id);
      pick.lineupSlot = pick.pos;
      starters.push(pick);
    }

    const bench = roster.filter(p => !assigned.has(p.id));
    team.starters = starters.map(p => p.id);

    // Minute weights: starters cluster in the high 20s to low 30s, the
    // first few bench players get real rotation minutes, and the tail gets
    // scraps. Weighted by rating within each group so the best starter
    // still plays the most.
    const refRating = starters.length
      ? starters.reduce((n, p) => n + parseFloat(p.rating), 0) / starters.length : 75;

    // How much this staff trusts freshmen. A veteran-reliant coach gives a
    // young player a short leash regardless of his recruiting profile, so
    // not every five-star walks into thirty minutes a night.
    // An explicit Role from the sheet overrides the model's own read of a
    // player: a designated focal point starts and carries the offense even
    // if the ratings alone wouldn't put him there.
    const roleWeight = (p) => {
      switch ((p.role || '').replace(/[^a-z]/g, '')) {
        case 'focalpoint': case 'focal': case 'star': return 1.35;
        case 'starter': return 1.15;
        case 'sixthman': case 'sixth': return 0.92;
        case 'rotation': return 0.78;
        case 'bench': case 'depth': case 'reserve': return 0.5;
        default: return 1;
      }
    };
    team._roleWeight = roleWeight;

    const trust = (team.coachProfile && team.coachProfile.freshmanTrust) || 1;
    const youthFactor = (p) => {
      if (p.class !== 'FR') return 1;
      const isBigFr = ['C', 'F/C', 'PF'].includes((p.pos || '').toUpperCase());

      // Pedigree earns a long leash. A blue-chip recruit is on the floor
      // from day one — the previous flat freshman penalty meant even a
      // top-three recruit at a blue-blood came off the bench, which isn't
      // how those rosters work. The penalty is scaled back the higher the
      // recruit ranked, and removed entirely for the very top of a class.
      const rsci = parseFloat(p.rsci) || null;
      const rating = parseFloat(p.rating) || 70;
      let pedigree = 0;
      if (rsci && rsci <= 5) pedigree = 1.0;
      else if (rsci && rsci <= 25) pedigree = 0.8;
      else if (rsci && rsci <= 60) pedigree = 0.55;
      else if (rsci && rsci <= 100) pedigree = 0.35;
      else if (rating >= 88) pedigree = 0.8;
      else if (rating >= 83) pedigree = 0.5;

      const basePenalty = isBigFr ? 0.70 : 0.94;
      // pedigree 1.0 removes the penalty; 0 leaves it fully in place.
      const adjusted = basePenalty + (1 - basePenalty) * pedigree;
      // Coach trust still matters, but can't bench an elite recruit outright.
      const effectiveTrust = trust + (1 - trust) * (1 - pedigree);
      return adjusted * effectiveTrust;
    };

    const weights = [];
    starters.forEach(p => {
      const base = 22 + Math.max(-6, Math.min(9, (parseFloat(p.rating) - refRating) * 0.62));
      weights.push({ p, w: base * youthFactor(p) * roleWeight(p) });
    });
    // How deep this staff goes. Some teams ride a seven-man rotation with
    // everyone at 20+ minutes; others spread nine or ten bodies across the
    // same 200 minutes. Fixing a single curve for all 365 teams made the
    // seven-man rotation impossible, so depth is a team trait — nudged by
    // the coach, since a pressing team needs fresh legs.
    const pressBonus = (team.coachProfile && team.coachProfile.steals > 1.08) ? 1 : 0;
    const rotationDepth = 7 + Math.floor(Math.random() * 3) + pressBonus;   // 7-10 men
    const benchInRotation = Math.max(1, rotationDepth - starters.length);

    bench.forEach((p, i) => {
      // Players inside the rotation stay close to starter minutes; beyond
      // it, minutes fall away sharply.
      const inRotation = i < benchInRotation;
      const depthFactor = inRotation
        ? (1 - i * 0.07)
        : (1 - (benchInRotation - 1) * 0.07) * Math.pow(0.45, i - benchInRotation + 1);
      const quality = 21 + Math.max(-5, Math.min(6, (parseFloat(p.rating) - refRating) * 0.38));
      weights.push({ p, w: Math.max(0, quality * depthFactor * youthFactor(p) * roleWeight(p)) });
    });

    // Normalise to the 200 minutes available in a game, then cap so nobody
    // plays an unrealistic number of minutes.
    let total = weights.reduce((n, x) => n + x.w, 0) || 1;
    weights.forEach(x => { x.mpg = (x.w / total) * 200; });

    let overflow = 0;
    weights.forEach(x => {
      if (x.mpg > 33) { overflow += x.mpg - 33; x.mpg = 33; }
    });
    // Redistribute capped minutes across everyone still under the cap.
    if (overflow > 0) {
      const room = weights.filter(x => x.mpg < 32.5 && x.mpg > 0);
      const roomTotal = room.reduce((n, x) => n + x.mpg, 0) || 1;
      room.forEach(x => { x.mpg = Math.min(33, x.mpg + overflow * (x.mpg / roomTotal)); });
    }

    weights.forEach(x => {
      x.p.allocatedMpg = x.mpg < 2 ? 0 : x.mpg;
      x.p.isBench = !team.starters.includes(x.p.id);
    });

    // Reference values used for relative-usage scoring, cached on the team
    // so every player's expectations can be computed against the strength
    // of the teammates they actually share the floor with.
    const rotation = weights.filter(x => x.p.allocatedMpg > 0).map(x => parseFloat(x.p.rating));
    rotation.sort((a, b) => b - a);
    const topFive = rotation.slice(0, 5);
    team.usageReference = topFive.length
      ? topFive.reduce((a, b) => a + b, 0) / topFive.length
      : refRating;
  },

  buildBaseStatExpectations(player, mpg, team) {
    if (mpg <= 0.5) return this.getZeroStats();

    const r = parseFloat(player.rating);
    const pos = (player.pos || 'SF').toUpperCase();
    // 'W' (wing) sits between SG and SF; 'F/C' is a big.
    const isBig = pos === 'C' || pos === 'F/C' || pos === 'PF'
      || (pos.includes('C') && !pos.includes('G'))
      || (pos.includes('F') && !pos.includes('G') && pos !== 'F/G');

    // Per-position baselines. Lumping everyone into "big vs guard" made
    // every forward rebound like a centre and every guard pass like a point
    // guard, which is what produced the flood of 10+ rpg / sub-2 apg lines.
    const POS = {
      PG: { reb: 3.5, ast: 4.00, stl: 1.34, blk: 0.13 },
      SG: { reb: 4.1, ast: 2.20, stl: 1.17, blk: 0.23 },
      SF: { reb: 5.7, ast: 1.60, stl: 1.08, blk: 0.45 },
      PF: { reb: 6.7, ast: 1.58, stl: 1.02, blk: 1.05 },
      C:  { reb: 8.8, ast: 1.05, stl: 0.72, blk: 1.82 },
      G:  { reb: 3.3, ast: 3.40, stl: 1.25, blk: 0.185 },
      // A combo guard fills either backcourt slot, so his profile sits
      // between a point guard's and a shooting guard's.
      CG: { reb: 3.4, ast: 3.00, stl: 1.26, blk: 0.20 },
      F:  { reb: 6.0, ast: 1.65, stl: 1.00, blk: 0.86 },
      // Wings, and combo bigs, both appear in the roster sheet.
      W:  { reb: 4.9, ast: 2.05, stl: 1.12, blk: 0.355 },
      'F/C': { reb: 7.9, ast: 1.22, stl: 0.78, blk: 1.55 },
      'G/F': { reb: 4.0, ast: 2.60, stl: 1.18, blk: 0.31 }
    };
    const base = POS[pos] || POS[isBig ? 'PF' : 'SF'];

    // Declared up front: the coach's profile is referenced throughout this
    // function, including in the shooting-profile lines further down.
    const coach = this.getCoachProfile(player.school);
    // Declared here because the archetype usage ceiling below reads it.
    const ps = player.playstyle;

    const usageScale = (mpg / 28) * (r / 78);

    // Scoring share is measured against the player's OWN rotation rather
    // than on an absolute scale. On a stacked high-major roster five good
    // players divide the same ~75 points, so each individual line comes
    // down; that same player as the lone option at a smaller school
    // carries a far bigger share. This is what moves most 20-point scorers
    // to smaller schools and stops every top freshman on a loaded team
    // posting huge numbers.
    // Athleticism lifts finishing, steals and rebounding without touching
    // shooting; Role scales how much of the offense runs through a player.
    const ath = player.athleticism !== null && player.athleticism !== undefined
      ? Math.max(-1, Math.min(1, (player.athleticism - 75) / 25)) : 0;
    const roleMult = team && team._roleWeight ? team._roleWeight(player) : 1;

    const usageRef = (team && team.usageReference) ? team.usageReference : 78;
    let usageShare = Math.max(0.42, Math.min(1.70, 1 + (r - usageRef) * 0.037));

    // Usage ceiling by archetype. An off-ball big living on rolls and lobs
    // finishes plays rather than creating them and tops out around 17%
    // usage; a genuine post hub or passing big runs 20-25%. Perimeter
    // creators are unconstrained here. Which one a big is comes from his
    // scouting profile: post/passing indicators raise the ceiling.
    if (['C', 'F/C', 'PF'].includes(pos)) {
      const onBall = (ps && ps.ast ? ps.ast : 1) >= 1.1 || (ps && ps.score ? ps.score : 1) >= 1.15;
      const bigCeiling = onBall ? 1.30 : 0.92;
      usageShare = Math.min(usageShare, bigCeiling);
    }

    // A designated focal point carries more of the offense than his rating
    // alone implies; a declared bench player carries less.
    usageShare = Math.max(0.35, Math.min(1.85, usageShare * roleMult));
    const scoringUsage = (mpg / 28) * usageShare;

    // Scoring keys off talent above a replacement baseline rather than raw
    // rating, so an average starter lands in single digits and only genuine
    // stars push past 18 — instead of nearly everyone clearing 20.
    // A power curve rather than a straight line: talent still separates
    // scorers, but the very top is compressed so 20-point seasons stay in
    // the 25-40 range nationally instead of running to fifty-plus.
    // Linear in talent but with a floor term, which flattens the ratio
    // between a star and an average starter enough to keep 20-point
    // seasons in the 25-40 range nationally. A pure power curve was tried
    // and rejected: rescaling those raw lines to the real team score
    // introduced a rounding bias that wrecked free-throw percentage.
    let ppg = Math.max(0.4, (2.2 + Math.max(4, r - 38) * 0.228) * scoringUsage);

    // Rebounding scales partly with involvement. A big who barely touches
    // the ball shouldn't still post double-digit boards; the flat
    // positional rate was producing ~8 ppg / ~10 rpg seasons.
    const involvement = 0.72 + 0.28 * Math.max(0.5, Math.min(1.6, usageShare));
    const athReb = 1 + ath * 0.10;
    const athStl = 1 + ath * 0.16;
    let rpg = Math.max(0.2, base.reb * usageScale * involvement * athReb);
    let apg = Math.max(0.1, base.ast * usageScale);
    let stl = Math.max(0.1, base.stl * usageScale * athStl);
    let blk = Math.max(0.05, base.blk * usageScale);
    let tov = Math.max(0.2, (apg * 0.4 + 0.50));

    let pf = Math.min(3.4, Math.max(0.5, (mpg / 12.1)));

    // Two-part curve: a gentle slope through the rotation, then a steeper
    // one at the very top. A single linear scale either capped the elite
    // too low or pushed dozens of ordinary starters past 10.
    let bpm = ((r - 74) * 0.50) + Math.max(0, r - 90) * 0.85;
    bpm = Math.min(16, bpm);
    let obpm = bpm * (isBig ? 0.45 : 0.60);
    let dbpm = bpm - obpm;

    let ftPct = Math.min(0.92, Math.max(0.48,
      (isBig ? 0.705 : 0.825) * (player.playstyle ? player.playstyle.ftPct : 1)));
    let fta = Math.max(0.2, (ppg * (isBig ? 0.282 : 0.178)) * (coach ? coach.freeThrows : 1));
    // Three-point rate by position rather than a blunt big/small split.
    // The old single "big" rate had power forwards and centres launching
    // far too many threes; genuine stretch bigs now come from the
    // playstyle multiplier applied just below, not from the baseline.
    const THREE_PAR = {
      PG: 0.465, SG: 0.515, CG: 0.495, SF: 0.465, W: 0.465, 'G/F': 0.465, G: 0.485, F: 0.26,
      PF: 0.22, C: 0.07, 'F/C': 0.12
    };
    let threePar = THREE_PAR[pos] !== undefined ? THREE_PAR[pos] : (isBig ? 0.18 : 0.50);
    if (player.playstyle) {
      threePar = Math.max(0.05, Math.min(0.85, threePar * player.playstyle.threePar));
    }
    if (coach) {
      threePar = Math.max(0.05, Math.min(0.88, threePar * coach.threePar));
    }
    let threePPct = Math.min(0.46, Math.max(0.20,
      (isBig ? 0.315 : 0.358) * (player.playstyle ? player.playstyle.threePct : 1)));
    let twoPPct = Math.min(0.72, Math.max(0.38, (isBig ? 0.568 : 0.478)));
    // Better perimeter players finish markedly better inside the arc —
    // an NBA-caliber guard sits near or above 48% on twos, where a flat
    // rate had every guard shooting like a marginal one.
    if (!isBig) twoPPct += Math.max(0, Math.min(0.055, (r - 76) * 0.0032));
    twoPPct += ath * 0.018;   // athletic finishers convert better inside
    // Shot location drives two-point efficiency. A big whose game is
    // almost entirely rim attempts converts far better than one who takes
    // long twos, so the lower his three-point rate, the higher his finish
    // rate — a true rim-roller lands north of 60% unless he's genuinely bad.
    if (isBig) {
      const rimHeavy = Math.max(0, Math.min(1, (0.22 - threePar) / 0.22));
      twoPPct += rimHeavy * 0.085;
      // Poor finishers stay poor; this rewards ability, not just role.
      if (r < 70) twoPPct -= 0.035;
      twoPPct = Math.min(0.72, twoPPct);
    }

    // Recruits carry a playstyle derived from their HS/AAU profile, so an
    // imported prospect simulates like the player he was scouted as rather
    // than like a generic example of his position.
    if (ps) {
      // Clamped: playstyle, scouting tags and the coach's system each
      // multiply these, and unbounded stacking was a major contributor to
      // 20-rebound and 12-assist seasons.
      const lim = (v, lo, hi) => Math.max(lo, Math.min(hi, v || 1));
      ppg *= lim(ps.score, 0.75, 1.30);
      rpg *= lim(ps.reb, 0.75, 1.25);
      apg *= lim(ps.ast, 0.70, 1.35);
      stl *= lim(ps.stl, 0.75, 1.30);
      blk *= lim(ps.blk, 0.70, 1.40);
    }

    // A genuine focal point creates for others as well as scoring. When a
    // player carries an unusually large share of his team's offense his
    // assists rise with it — but only as far as his playmaking profile and
    // position support, so a high-usage back-to-the-basket big doesn't
    // start racking up assists.
    if (usageShare > 1.10) {
      // How much a player's usage converts into assists. Forwards who
      // actually handle the ball (flagged by an above-average playmaking
      // profile) create like wings rather than like post players.
      const handles = (ps && ps.ast ? ps.ast : 1) >= 1.05;
      const posFactor = ['PG', 'G', 'CG'].includes(pos) ? 1.0
        : ['SG', 'G/F'].includes(pos) ? 0.75
        : ['SF', 'W'].includes(pos) ? (handles ? 0.85 : 0.55)
        : ['PF', 'F'].includes(pos) ? (handles ? 0.70 : 0.32)
        : 0.28;
      const creator = (ps && ps.ast ? ps.ast : 1) * posFactor;
      apg *= 1 + (usageShare - 1.10) * 1.75 * creator;
    }

    // The coach's system shapes what the roster actually produces: a
    // ball-movement offense generates more assists, a pressing team more
    // steals, a glass-crashing team more boards.
    if (coach) {
      rpg *= coach.rebounds;
      apg *= coach.assists;
      stl *= coach.steals;
      blk *= coach.blocks;
      tov *= coach.turnovers;
    }

    let ortg = 95 + (obpm * 3.2);
    let drtg = 105 - (dbpm * 3.2);

    return {
      mpg, ppg, rpg, apg, stl, blk, tov, pf, ftPct, fta,
      threePar, threePPct, twoPPct, bpm, obpm, dbpm, ortg, drtg,
      orebPct: (isBig ? 9.5 : 3.0) + '%', drebPct: (isBig ? 21.0 : 10.5) + '%', trbPct: (isBig ? 15.0 : 6.8) + '%',
    };
  },


  // Public entry point wired to the "Simulate..." button. Dispatches to
  // whichever phase of the season is next, so the HTML/UI never needs to
  // know which specific step is happening.
  // Brief spinner so a click reads as an action rather than an instant
  // state change. The minimum display time keeps it from flickering.
  showSimSpinner(label) {
    const el = document.getElementById('simSpinner');
    if (!el) return;
    const lab = document.getElementById('simSpinnerLabel');
    if (lab && label) lab.innerText = label;
    el.classList.add('active');
    this._spinnerShownAt = Date.now();
  },

  async hideSimSpinner() {
    const el = document.getElementById('simSpinner');
    if (!el) return;
    const elapsed = Date.now() - (this._spinnerShownAt || 0);
    if (elapsed < 650) await new Promise(r => setTimeout(r, 650 - elapsed));
    el.classList.remove('active');
  },

  async simulateWeek() {
    if (this.state.teams.length === 0) {
      alert("No active teams detected. Please refresh or check data sources.");
      return;
    }
    if (this.state.ncaaDone) {
      // The season is finished, so the next step IS the offseason. Making
      // the user find a separate button to continue was an unnecessary
      // dead end.
      await this.runOffseason();
      return;
    }
    if (this.state.week === 0 && !this.state.seasonInitialized) {
      this.initSeasonData();
    }

    if (!this.state.regularSeasonDone) {
      await this.simulateRegularSeasonWeek();
    } else if (!this.state.confChampsDone) {
      await this.simulateConferenceChampionships();
    } else if (!this.state.ncaaDone) {
      await this.simulateNCAATournament();
    }
  },

  // Finds a team object by school name — schedule entries store school
  // names (strings) rather than object references so they stay simple
  // to generate, serialize, and save.
  findTeam(schoolName) {
    return this.state.teams.find(t => t.school === schoolName);
  },

  // Runs every scheduled game for the upcoming week: real head-to-head
  // matchups via GameCore, with both teams' records and every player's
  // game log updated from the same simulated result.
  async simulateRegularSeasonWeek() {
    this.state.week++;
    this.rollInjuries();
    // Revisit depth charts periodically rather than every week, so
    // lineups are responsive without churning constantly.
    if (this.state.week > 3 && this.state.week % 4 === 0) this.reevaluateRotations();
    const gamesThisWeek = this.state.schedule.filter(g => g.week === this.state.week && !g.played);

    gamesThisWeek.forEach(g => {
      const home = this.findTeam(g.home);
      const away = this.findTeam(g.away);
      if (!home || !away) return;
      this.playGame(home, away, g, g.isConf ? 'conf' : 'nonconf');
    });

    this.recalculateAllAverages();
    this.computeAPPoll();
    await this.saveStateToDB();

    if (this.state.week >= this.state.confEnd) {
      this.finalizeRegularSeason();
    } else {
      if (this.state.week === this.state.nonConfEnd) this.state.phase = 'Conference Play';
      this.state.scheduleViewWeek = this.state.week;
      this.syncUI();
      this.logNews(`Week ${this.state.week} simulation complete (${gamesThisWeek.length} games).`);
    }
  },

  // Simulates one real game between two teams via GameCore, updating
  // records and attaching a real game-log entry (with opponent, home/
  // away, and result) to every player who appeared.
  // Returns the roster available for this game plus how much everyone
  // else's minutes need to stretch to cover the absences.
  availableRosterFor(team) {
    const full = team.simData.rosterRef || team.roster || [];
    const week = this.state.week;
    const available = full.filter(p => !(p.injuredUntilWeek && p.injuredUntilWeek >= week));
    const lostMinutes = full
      .filter(p => p.injuredUntilWeek && p.injuredUntilWeek >= week)
      .reduce((n, p) => n + (parseFloat(p.expectedStats && p.expectedStats.mpg) || 0), 0);
    const remaining = available.reduce((n, p) => n + (parseFloat(p.expectedStats && p.expectedStats.mpg) || 0), 0);
    const multiplier = remaining > 0 ? Math.min(1.45, (remaining + lostMinutes) / remaining) : 1;
    return { available, multiplier };
  },

  // Rolls injuries for the upcoming week. Rates are deliberately modest:
  // enough that rotations shift over a season without teams routinely
  // being decimated.
  rollInjuries() {
    const week = this.state.week;
    this.state.activePlayers.forEach(p => {
      if (p.injuredUntilWeek && p.injuredUntilWeek >= week) return;   // already out
      const mpg = parseFloat(p.expectedStats && p.expectedStats.mpg) || 0;
      if (mpg < 5) return;                                            // deep bench, not tracked
      if (Math.random() < 0.008) {
        const weeksOut = 1 + Math.floor(Math.random() * 4);
        p.injuredUntilWeek = week + weeksOut - 1;
        p.gamesMissed = (p.gamesMissed || 0) + weeksOut * 2;
      }
    });
  },

  // Rotations aren't fixed for a whole season. Every few weeks the depth
  // chart is rebuilt using a blend of a player's rating and how he has
  // actually performed, so someone outplaying his billing works his way
  // into the starting five and a struggling starter loses minutes.
  reevaluateRotations() {
    this.state.teams.forEach(team => {
      (team.roster || []).forEach(p => {
        const bpm = parseFloat(p.stats && p.stats.bpm) || 0;
        const gp = (p.stats && p.stats.gp) || 0;
        // Only let real evidence move the needle, and cap the swing so a
        // hot fortnight doesn't turn a walk-on into a starter.
        const evidence = Math.min(1, gp / 8);
        p.formAdjust = Math.max(-6, Math.min(6, bpm * 0.85)) * evidence;
        p.baseRating = p.baseRating !== undefined ? p.baseRating : parseFloat(p.rating);
        p.rating = p.baseRating + p.formAdjust;
      });
      // Form decides MINUTES only. The true rating is restored before
      // expectations are rebuilt, because letting a form-boosted rating
      // also drive usage creates a feedback loop: a hot player earns more
      // usage, scores more, and is boosted again on the next review.
      this.buildRotation(team);
      (team.roster || []).forEach(p => {
        if (p.baseRating !== undefined) p.rating = p.baseRating;
      });
      // Recompute the usage reference from true ratings now that form
      // adjustments have been unwound.
      const rot = (team.roster || [])
        .filter(p => (p.allocatedMpg || 0) > 0)
        .map(p => parseFloat(p.rating))
        .sort((x, y) => y - x)
        .slice(0, 5);
      if (rot.length) team.usageReference = rot.reduce((x, y) => x + y, 0) / rot.length;

      (team.roster || []).forEach(p => {
        p.expectedStats = this.buildBaseStatExpectations(p, p.allocatedMpg || 0, team);
      });
    });
  },

  playGame(home, away, scheduleEntry, gamePhaseLabel) {
    const homeAvail = this.availableRosterFor(home);
    const awayAvail = this.availableRosterFor(away);
    const homeFull = home.simData.rosterRef;
    const awayFull = away.simData.rosterRef;
    home.simData.rosterRef = homeAvail.available;
    away.simData.rosterRef = awayAvail.available;

    const result = GameCore.simulateSingleGame(home, away, {
      homeMinutesMultiplier: homeAvail.multiplier,
      awayMinutesMultiplier: awayAvail.multiplier
    });

    home.simData.rosterRef = homeFull;
    away.simData.rosterRef = awayFull;

    const homeWin = result.homeScore > result.awayScore;

    home.simData.wins += homeWin ? 1 : 0;
    home.simData.losses += homeWin ? 0 : 1;
    away.simData.wins += homeWin ? 0 : 1;
    away.simData.losses += homeWin ? 1 : 0;

    if (scheduleEntry && scheduleEntry.isConf) {
      home.simData.confWins += homeWin ? 1 : 0;
      home.simData.confLosses += homeWin ? 0 : 1;
      away.simData.confWins += homeWin ? 0 : 1;
      away.simData.confLosses += homeWin ? 1 : 0;
    }

    const lt = this.state.leagueShootingTotals || (this.state.leagueShootingTotals = { pts: 0, fga: 0, fta: 0 });

    // Team and opponent totals, accumulated per game. Advanced rate stats
    // (USG%, AST%, rebound percentages) are all shares of team context, so
    // they need these — previously they were hardcoded constants or, in
    // USG%'s case, a formula that divided season totals by per-game
    // minutes and pinned virtually everyone at the 45% ceiling.
    const blank = () => ({ min: 0, fga: 0, fta: 0, tov: 0, fgm: 0, oreb: 0, dreb: 0, reb: 0, ast: 0 });
    const ensure = (t) => {
      if (!t.simData.totals) t.simData.totals = blank();
      if (!t.simData.oppTotals) t.simData.oppTotals = blank();
      return t.simData;
    };
    const sumBoxes = (boxes) => {
      const acc = blank();
      boxes.forEach(({ box }) => {
        acc.min += box.min || 0; acc.fga += box.fga || 0; acc.fta += box.fta || 0;
        acc.tov += box.tov || 0; acc.fgm += box.fgm || 0;
        acc.oreb += box.oreb || 0; acc.dreb += box.dreb || 0;
        acc.reb += box.reb || 0; acc.ast += box.ast || 0;
      });
      return acc;
    };
    const homeSum = sumBoxes(result.homePlayerBoxes);
    const awaySum = sumBoxes(result.awayPlayerBoxes);
    const addInto = (target, src) => { Object.keys(src).forEach(k => { target[k] += src[k]; }); };
    addInto(ensure(home).totals, homeSum);
    addInto(ensure(home).oppTotals, awaySum);
    addInto(ensure(away).totals, awaySum);
    addInto(ensure(away).oppTotals, homeSum);
    const attachLogs = (boxes, teamScore, oppScore, oppSchool, isHome) => {
      boxes.forEach(({ player, box }) => {
        lt.pts += box.pts || 0; lt.fga += box.fga || 0; lt.fta += box.fta || 0;
        player.gameLog.push({
          ...box,
          started: !player.isBench && box.min > 0,
          week: scheduleEntry ? scheduleEntry.week : this.state.week,
          isConf: scheduleEntry ? !!scheduleEntry.isConf : false,
          phase: gamePhaseLabel,
          opponent: oppSchool,
          isHome,
          teamScore, oppScore,
          won: teamScore > oppScore
        });
      });
    };
    attachLogs(result.homePlayerBoxes, result.homeScore, result.awayScore, away.school, true);
    attachLogs(result.awayPlayerBoxes, result.awayScore, result.homeScore, home.school, false);

    if (scheduleEntry) {
      scheduleEntry.played = true;
      scheduleEntry.result = { homeScore: result.homeScore, awayScore: result.awayScore };
    }
    return result;
  },

  recalculateAllAverages() {
    this.updateLeagueShootingBaseline();
    // Index team totals once so every player's rate stats can be computed
    // against the team they actually played for.
    this._teamTotals = {};
    this.state.teams.forEach(t => {
      if (t.simData && t.simData.totals) {
        this._teamTotals[t.school] = { totals: t.simData.totals, opp: t.simData.oppTotals };
      }
    });
    this.state.activePlayers.forEach(p => this.recalculateAverages(p));
  },

  // League-wide true shooting, the zero point for rTS%. Totals accumulate
  // as games are played (see playGame) rather than being recomputed by
  // rescanning every game log, which grew quadratically over a season.
  updateLeagueShootingBaseline() {
    const t = this.state.leagueShootingTotals;
    if (!t) return;
    const denom = 2 * (t.fga + 0.44 * t.fta);
    if (denom > 0) this.state.leagueTsPct = t.pts / denom;
  },

  recalculateAverages(player) {
    if (!player.gameLog || player.gameLog.length === 0) return;
    
    const exp = player.expectedStats || {};

    const calc = (logs) => {
       if (logs.length === 0) return this.getZeroStats();
       let s = { min:0, pts:0, reb:0, oreb:0, dreb:0, ast:0, stl:0, blk:0, tov:0, pf:0, fgm:0, fga:0, twoPm:0, twoPa:0, threePm:0, threePa:0, ftm:0, fta:0 };
       logs.forEach(g => { for(let k in s) s[k] += (g[k] || 0); });
       const gamesStarted = logs.filter(g => g.started).length;
       
       const g = logs.length;
       const t1 = v => (v/g).toFixed(1);
       const t3 = (m,a) => a > 0 ? (m/a).toFixed(3).replace(/^0+/,'') : '.000';
       
       let mpg = s.min/g;
       // Standard box-score rate formulas, all expressed as a share of what
       // the team did while this player was on the floor.
       const tc = (this._teamTotals && this._teamTotals[player.school]) || null;
       const tt = tc ? tc.totals : null;
       const ot = tc ? tc.opp : null;
       const teamPoss = tt ? (tt.fga + 0.44 * tt.fta + tt.tov) : 0;
       // Team minutes divided by five gives "team games' worth of a single
       // lineup slot", the denominator these formulas are built around.
       const teamSlot = tt && tt.min > 0 ? tt.min / 5 : 0;
       const playerMin = s.min;

       let usg = 0;
       if (teamPoss > 0 && playerMin > 0 && teamSlot > 0) {
         usg = 100 * ((s.fga + 0.44 * s.fta + s.tov) * teamSlot) / (playerMin * teamPoss);
       }

       // AST%: share of teammates' made field goals the player assisted
       // while on the floor.
       let astPctNum = 0;
       if (tt && playerMin > 0 && teamSlot > 0) {
         const teammateFgm = ((playerMin / teamSlot) * tt.fgm) - s.fgm;
         if (teammateFgm > 0) astPctNum = 100 * s.ast / teammateFgm;
       }

       // Rebound percentages need the opponent's boards as well as the
       // team's, since a rebound is a contested share of every available miss.
       const rebPct = (own, teamOwn, oppOther) => {
         if (!tt || !ot || playerMin <= 0 || teamSlot <= 0) return 0;
         const available = teamOwn + oppOther;
         if (available <= 0) return 0;
         return 100 * (own * teamSlot) / (playerMin * available);
       };
       const orebPctNum = rebPct(s.oreb, tt ? tt.oreb : 0, ot ? ot.dreb : 0);
       const drebPctNum = rebPct(s.dreb, tt ? tt.dreb : 0, ot ? ot.oreb : 0);
       const trbPctNum  = rebPct(s.reb,  tt ? tt.reb  : 0, ot ? ot.reb  : 0);

       const bpmNum = parseFloat(exp.bpm) || 0;
       const obpmNum = parseFloat(exp.obpm) || 0;
       const dbpmNum = parseFloat(exp.dbpm) || 0;
       const ortgNum = parseFloat(exp.ortg) || 100;
       const drtgNum = parseFloat(exp.drtg) || 100;
       // True shooting from what the player actually did. This previously
       // read exp.tsPct — a field the expectation builder never sets — so
       // it was always 0, pinning rTS% at exactly -53.5 for everyone.
       const tsDenom = 2 * (s.fga + 0.44 * s.fta);
       const tsPctNum = tsDenom > 0 ? (s.pts / tsDenom) : 0;
       const leagueTs = this.state.leagueTsPct || 0.545;
       
       // Per-40 denominators use total minutes, not games, so low-minute
       // players aren't penalised. Guard against a 0-minute denominator.
       const p40 = v => s.min > 0 ? ((v / s.min) * 40).toFixed(1) : '0.0';

       return {
          gp: g, gs: gamesStarted,
          // Season totals as well as averages — leaderboards and player
          // pages both want the raw counting numbers.
          totMin: s.min, totPts: s.pts, totReb: s.reb, totOreb: s.oreb, totDreb: s.dreb,
          totAst: s.ast, totStl: s.stl, totBlk: s.blk, totTov: s.tov, totPf: s.pf,
          totFgm: s.fgm, totFga: s.fga, totThreePm: s.threePm, totThreePa: s.threePa,
          totFtm: s.ftm, totFta: s.fta,
          mpg: t1(s.min), ppg: t1(s.pts), oreb: t1(s.oreb), dreb: t1(s.dreb), rpg: t1(s.reb), apg: t1(s.ast),
          stl: t1(s.stl), blk: t1(s.blk), tov: t1(s.tov), pf: t1(s.pf),
          fgm: t1(s.fgm), fga: t1(s.fga), fgPct: t3(s.fgm, s.fga),
          twoPm: t1(s.twoPm), twoPa: t1(s.twoPa), twoPPct: t3(s.twoPm, s.twoPa),
          threePm: t1(s.threePm), threePa: t1(s.threePa), threePPct: t3(s.threePm, s.threePa),
          ftm: t1(s.ftm), fta: t1(s.fta), ftPct: t3(s.ftm, s.fta),
          bpm: bpmNum.toFixed(1), 
          obpm: obpmNum.toFixed(1), 
          dbpm: dbpmNum.toFixed(1),
          tsPct: (2*(s.fga + 0.44*s.fta)) > 0 ? t3(s.pts, 2*(s.fga + 0.44*s.fta)) : '.000',
          rTsPct: tsDenom > 0 ? ((tsPctNum - leagueTs) * 100).toFixed(1) : '0.0',
          eFgPct: s.fga > 0 ? t3(s.fgm + 0.5*s.threePm, s.fga) : '.000',
          orebPct: orebPctNum.toFixed(1) + '%',
          drebPct: drebPctNum.toFixed(1) + '%',
          trbPct: trbPctNum.toFixed(1) + '%',
          astPct: astPctNum.toFixed(1) + '%',
          tovPct: (s.fga + 0.44*s.fta + s.tov) > 0 ? ((s.tov/(s.fga + 0.44*s.fta + s.tov))*100).toFixed(1) + '%' : '0.0%',
          blkPct: mpg>0 ? ((s.blk/g)/mpg * 40).toFixed(1) + '%' : '0.0%',
          usg: Math.min(42.0, Math.max(2.0, usg)).toFixed(1) + '%',
          ftr: t3(s.fta, s.fga), threePar: t3(s.threePa, s.fga),
          ortg: ortgNum.toFixed(1), 
          drtg: drtgNum.toFixed(1), 
          netRtg: (ortgNum - drtgNum).toFixed(1),
          p40pts: p40(s.pts), p40reb: p40(s.reb), p40oreb: p40(s.oreb), p40dreb: p40(s.dreb),
          p40ast: p40(s.ast), p40stl: p40(s.stl), p40blk: p40(s.blk), p40tov: p40(s.tov),
          p40pf: p40(s.pf), p40fga: p40(s.fga), p40threePa: p40(s.threePa), p40fta: p40(s.fta)
       };
    };

    player.statsFull = calc(player.gameLog);
    player.statsConf = calc(player.gameLog.filter(g => g.isConf));
    player.stats = this.state.scopeFilter === 'conf' ? player.statsConf : player.statsFull;
  },

  finalizeRegularSeason() {
    this.state.phase = 'Regular Season Final';
    
    this.state.teams.forEach(t => {
       t.simData.winPct = (t.simData.wins / Math.max(1, t.simData.wins + t.simData.losses)).toFixed(3).replace(/^0+/, '');
    });

    this.computeAPPoll();

    this.state.activePlayers.forEach(p => {
      const team = this.state.teams.find(t => t.school === p.school);
      const teamWinPct = team ? (team.simData.wins / Math.max(1, team.simData.wins + team.simData.losses)) : 0.5;
      const bpm = parseFloat(p.stats ? p.stats.bpm : 0);
      const ppg = parseFloat(p.stats ? p.stats.ppg : 0);
      const apg = parseFloat(p.stats ? p.stats.apg : 0);
      const rpg = parseFloat(p.stats ? p.stats.rpg : 0);
      const dbpm = parseFloat(p.stats ? p.stats.dbpm : 0);
      const stl = parseFloat(p.stats ? p.stats.stl : 0);
      const blk = parseFloat(p.stats ? p.stats.blk : 0);

      // National awards weigh the level of competition the same way the
      // draft board does: a mid-major has to clearly outproduce a
      // high-major to win a national honour.
      const level = (typeof DraftCore !== 'undefined')
        ? DraftCore.competitionFactor(p.conference) : 1;
      p.awardScore = ((bpm * 2.5) + (ppg * 0.8) + (apg * 0.4) + (rpg * 0.4)) * level + (teamWinPct * 15);
      p.defensiveScore = ((dbpm * 3.5) + (stl * 2.5) + (blk * 2.5)) * level + (teamWinPct * 10);
    });
    
    this.state.regularSeasonDone = true;
    this.syncUI();
    this.logNews("Regular season complete. National and Conference awards calculated. Conference Championships are up next.");
  },

  // Seeds each conference by conference record (matching the standings
  // sort), runs a real single-elimination bracket for every conference
  // with 2+ teams, and grants the champion an automatic NCAA bid.
  // Shared helper: records a finished bracket game onto both teams'
  // records and attaches a real game-log entry for everyone who played.
  attachBracketGameLogs(bracketGame, phaseLabel) {
    const { teamA, teamB, result, winner } = bracketGame;
    if (bracketGame._logged) return;   // rounds can be re-rendered; only count once
    bracketGame._logged = true;

    const aIsWinner = winner === teamA;
    winner.simData.wins++;
    (aIsWinner ? teamB : teamA).simData.losses++;

    const attach = (boxes, team, opp, teamScore, oppScore) => {
      boxes.forEach(({ player, box }) => {
        player.gameLog.push({
          ...box,
          started: !player.isBench && box.min > 0,
          week: this.state.week,
          isConf: false,
          phase: phaseLabel,
          opponent: opp.school,
          isHome: team === teamA,
          teamScore, oppScore,
          won: teamScore > oppScore
        });
      });
    };
    attach(result.homePlayerBoxes, teamA, teamB, result.homeScore, result.awayScore);
    attach(result.awayPlayerBoxes, teamB, teamA, result.awayScore, result.homeScore);
  },

  async simulateConferenceChampionships() {
    const confMap = {};
    this.state.teams.forEach(t => {
      const c = t.conference || 'Independent';
      if (!confMap[c]) confMap[c] = [];
      confMap[c].push(t);
    });

    this.state.confTournaments = {};
    Object.keys(confMap).forEach(confName => {
      const confTeams = confMap[confName];
      if (confTeams.length < 2) return;

      confTeams.sort((a, b) => {
        if (b.simData.confWins !== a.simData.confWins) return b.simData.confWins - a.simData.confWins;
        if (b.simData.wins !== a.simData.wins) return b.simData.wins - a.simData.wins;
        return b.simData.teamOvr - a.simData.teamOvr;
      });

      // Reuse GameCore for every bracket game, logging them like any
      // other real game (marked as conference-tournament games).
      const bracket = TournamentCore.simulateBracket(confTeams, { homeCourtEdge: 0 });
      [...bracket.playIn, ...bracket.rounds.flat()].forEach(g => {
        this.attachBracketGameLogs(g, 'conftourney');
      });

      bracket.champion.wonConfTourney = true;
      this.state.confTournaments[confName] = bracket;
    });

    this.recalculateAllAverages();
    this.state.confChampsDone = true;
    await this.saveStateToDB();
    this.syncUI();
    this.logNews("Conference Championships complete. On to the NCAA Tournament.");
  },

  // Builds the NCAA field: conference tournament champions get automatic
  // bids, the rest of the field is filled by at-large teams ranked by
  // season resume (wins, then team strength) until we hit a target size.
  buildNCAAField() {
    const autoBids = Object.values(this.state.confTournaments).map(b => b.champion);
    const autoBidSchools = new Set(autoBids.map(t => t.school));

    const atLargePool = this.state.teams
      .filter(t => !autoBidSchools.has(t.school))
      .sort((a, b) => {
        if (b.simData.wins !== a.simData.wins) return b.simData.wins - a.simData.wins;
        return b.simData.teamOvr - a.simData.teamOvr;
      });

    const targetSize = Math.max(autoBids.length, Math.min(68, Math.round(this.state.teams.length * 0.19)));
    const atLargeNeeded = Math.max(0, targetSize - autoBids.length);
    const atLarge = atLargePool.slice(0, atLargeNeeded);

    const field = [...autoBids, ...atLarge].sort((a, b) => {
      if (b.simData.wins !== a.simData.wins) return b.simData.wins - a.simData.wins;
      return b.simData.teamOvr - a.simData.teamOvr;
    });
    field.forEach((t, i) => t.ncaaSeed = i + 1);
    return field;
  },

  // The tournament plays out one round per click rather than resolving in
  // a single step, so the bracket can be followed as it unfolds.
  async simulateNCAATournament() {
    if (!this.state.ncaaTournament) {
      const field = this.buildNCAAField();
      const full = TournamentCore.simulateBracket(field, { homeCourtEdge: 0 });
      // Simulate the whole bracket up front for internal consistency, then
      // reveal it a round at a time.
      this.state.ncaaFullBracket = full;
      this.state.ncaaRoundsRevealed = 0;
      this.state.ncaaTournament = { playIn: [], rounds: [], champion: full.champion };
    }

    const full = this.state.ncaaFullBracket;
    const view = this.state.ncaaTournament;

    // First Four is revealed alongside the opening round.
    if (this.state.ncaaRoundsRevealed === 0 && full.playIn.length) {
      view.playIn = full.playIn;
      full.playIn.forEach(g => this.attachBracketGameLogs(g, 'ncaa'));
    }

    const nextRound = full.rounds[this.state.ncaaRoundsRevealed];
    if (nextRound) {
      view.rounds.push(nextRound);
      nextRound.forEach(g => this.attachBracketGameLogs(g, 'ncaa'));
      this.state.ncaaRoundsRevealed++;
    }

    const finished = this.state.ncaaRoundsRevealed >= full.rounds.length;
    this.recalculateAllAverages();

    if (!finished) {
      const names = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
      this.state.phase = `NCAA Tournament — ${names[this.state.ncaaRoundsRevealed] || 'Next Round'}`;
      await this.saveStateToDB();
      this.syncUI();
      this.logNews(`${names[this.state.ncaaRoundsRevealed - 1] || 'Round'} complete.`);
      return;
    }

    const bracket = view;
    bracket.champion.wonNationalTitle = true;

    this.state.ncaaDone = true;
    this.state.simCompleted = true;
    this.state.phase = `National Champion: ${bracket.champion.school}`;
    this.state.draftDeclarations = this.computeDraftDeclarations();
    await this.saveStateToDB();
    this.syncUI();
    this.logNews(`${bracket.champion.school} wins the National Championship!`);
  },

  // Decides who's leaving school for the draft, right as the season ends
  // (so the Postseason tab can show it before Advance Offseason actually
  // removes anyone). Seniors/grad players always exhaust eligibility, but
  // are only listed as real "draft" prospects if good enough to plausibly
  // get drafted — otherwise they're just graduating, not headed pro.
  // Underclassmen can declare early with a chance that scales with rating.
  computeDraftDeclarations() {
    const declarations = [];

    // Board position drives the decision more than anything else: a
    // projected first-rounder goes, a fringe prospect usually returns.
    const board = this.computeDraftBigBoard(200);
    const boardRank = {};
    board.forEach((e, i) => { boardRank[e.player.id] = i + 1; });

    this.state.activePlayers.forEach(p => {
      // Only skip players who have NOT yet enrolled. Everyone in
      // activePlayers is on a roster, but players who arrived via the
      // recruiting sheet keep isRecruit=true, so this previously excluded
      // every single recruit-database player from the draft — permanently.
      if (p.isRecruit && !p.enrolled) return;
      const cls = this.normalizeClassStanding(p.class) || 'SO';
      const rating = parseFloat(p.rating) || 0;
      const rank = boardRank[p.id] || 999;
      const rsci = parseFloat(p.rsci) || null;
      const bpm = parseFloat(p.stats && p.stats.bpm) || 0;

      let declares = false;
      let mandatory = false;

      if (cls === 'SR' || cls === 'GR') {
        // Eligibility is gone either way; only the plausible pros are
        // listed as draft entrants rather than simply graduating.
        mandatory = true;
        declares = rating >= 78 || rank <= 120;
      } else {
        const st = p.stats || {};
        const ppg = parseFloat(st.ppg) || 0;
        const pra = ppg + (parseFloat(st.rpg) || 0) + (parseFloat(st.apg) || 0);
        const isBig = ['C', 'F/C', 'PF'].includes((p.pos || '').toUpperCase());
        const powerSix = ['ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East', 'Pac-12'].includes(p.conference);

        // A projected top-25 pick is gone, full stop.
        if (rank <= 25) declares = true;
        // So is a blue-chip recruit who produced. A top-20 recruit scoring
        // at this level does not return to school, regardless of anything
        // else the model thinks.
        else if (rsci && rsci <= 20 && ppg >= 15) declares = true;
        // Top-10 recruits leave unless the board says they'd go outside
        // the first 25 picks.
        else if (rsci && rsci <= 10 && rank <= 25) declares = true;
        // Production at the highest level of college basketball is itself a
        // declaration signal: an underclassman putting up these numbers in a
        // power conference is a pro prospect regardless of recruiting rank.
        else if (powerSix && (ppg >= 16 || pra >= 20)) declares = true;
        // Bigs can be worth a pick on efficiency and impact in limited
        // minutes — rim protection and finishing translate without volume.
        else if (isBig && (parseFloat(st.bpm) || 0) >= 6.5) declares = true;
        else if (rank <= 30) declares = true;
        // Elite recruits leave unless the season went badly wrong.
        else if (rsci && rsci <= 10) declares = bpm > -1.5;
        // So do players who have simply become good enough.
        else if (rating >= 84) declares = true;
        else if (rank <= 60) declares = Math.random() < 0.55;
        else if (rank <= 100) declares = Math.random() < 0.18;
        else declares = Math.random() < 0.02;
      }

      if (declares) {
        declarations.push({
          id: p.id, name: p.name, school: p.school, pos: p.pos, class: cls,
          rating, mandatory, boardRank: rank,
          conference: p.conference,
          ppg: p.stats ? p.stats.ppg : '0.0',
          rpg: p.stats ? p.stats.rpg : '0.0',
          apg: p.stats ? p.stats.apg : '0.0'
        });
      }
    });

    // Default ordering is by draft board position; the offseason screen
    // can regroup by school.
    declarations.sort((a, b) => a.boardRank - b.boardRank);
    return declarations;
  },

  setDeclarationSort(mode) {
    this.state.declarationSort = mode;
    this.renderOffseasonOverlay();
  },

  // Records the finished season permanently before anything resets for the
  // new year — per player, per team, and league-wide. This is what the
  // season summary and team history pages read from.
  archiveCompletedSeason() {
    const year = this.state.year;

    this.state.activePlayers.forEach(p => {
      if (!p.seasonHistory) p.seasonHistory = [];
      if (p.stats && p.stats.gp > 0 && !p.seasonHistory.some(h => h.year === year)) {
        p.seasonHistory.push({
          year, school: p.school, class: p.class, conference: p.conference,
          stats: { ...p.stats }
        });
      }
    });

    this.state.teams.forEach(team => {
      if (!team.history) team.history = [];
      if (team.history.some(h => h.year === year)) return;
      team.history.push({
        year,
        wins: team.simData.wins,
        losses: team.simData.losses,
        confWins: team.simData.confWins,
        confLosses: team.simData.confLosses,
        apRank: team.apRank || null,
        ncaaSeed: team.ncaaSeed || null,
        wonConfTourney: !!team.wonConfTourney,
        wonNationalTitle: !!team.wonNationalTitle
      });
    });

    const { npoy, dpoy, froy } = this.computeNationalAwards();
    const bracket = this.state.ncaaTournament;
    let champion = null, runnerUp = null, finalFour = [];

    if (bracket && bracket.rounds && bracket.rounds.length > 0) {
      const finalRound = bracket.rounds[bracket.rounds.length - 1];
      if (finalRound && finalRound[0]) {
        champion = finalRound[0].winner.school;
        runnerUp = (finalRound[0].winner === finalRound[0].teamA ? finalRound[0].teamB : finalRound[0].teamA).school;
      }
      const semiRound = bracket.rounds[bracket.rounds.length - 2];
      if (semiRound) finalFour = semiRound.flatMap(g => [g.teamA.school, g.teamB.school]);
      else if (finalRound && finalRound[0]) finalFour = [finalRound[0].teamA.school, finalRound[0].teamB.school];
    }

    const confChamps = {};
    Object.entries(this.state.confTournaments).forEach(([confName, b]) => {
      confChamps[confName] = b.champion.school;
    });

    // Richer archive so a finished season can be browsed the way a
    // reference site presents one: final poll, statistical leaders and the
    // conference-by-conference picture, not just who won the title.
    const finalPoll = [...this.state.teams]
      .filter(t => t.apRank)
      .sort((x, y) => x.apRank - y.apRank)
      .slice(0, 25)
      .map(t => ({ rank: t.apRank, school: t.school, conference: t.conference,
                   wins: t.simData.wins, losses: t.simData.losses }));

    const qualified = this.state.activePlayers.filter(p =>
      (p.stats.gp || 0) >= 12 && parseFloat(p.stats.mpg) >= 15);
    const leaderIn = (key) => {
      const best = [...qualified].sort((x, y) => parseFloat(y.stats[key]) - parseFloat(x.stats[key]))[0];
      return best ? { name: best.name, school: best.school, value: best.stats[key] } : null;
    };

    const confSummary = Object.keys(confChamps).map(conf => {
      const teams = this.state.teams.filter(t => t.conference === conf);
      const regular = [...teams].sort((x, y) => {
        if (y.simData.confWins !== x.simData.confWins) return y.simData.confWins - x.simData.confWins;
        return y.simData.wins - x.simData.wins;
      })[0];
      return {
        conference: conf,
        regularSeasonChamp: regular ? regular.school : null,
        regularRecord: regular ? `${regular.simData.confWins}-${regular.simData.confLosses}` : '',
        tournamentChamp: confChamps[conf],
        bids: teams.filter(t => t.ncaaSeed).length
      };
    }).sort((x, y) => x.conference.localeCompare(y.conference));

    this.state.seasonHistory.push({
      year, champion, runnerUp, finalFour, conferenceChamps: confChamps,
      npoy: npoy ? { name: npoy.name, school: npoy.school } : null,
      dpoy: dpoy ? { name: dpoy.name, school: dpoy.school } : null,
      froy: froy ? { name: froy.name, school: froy.school } : null,
      finalPoll,
      leaders: {
        ppg: leaderIn('ppg'), rpg: leaderIn('rpg'), apg: leaderIn('apg'),
        stl: leaderIn('stl'), blk: leaderIn('blk'), bpm: leaderIn('bpm')
      },
      conferenceSummary: confSummary,
      teamCount: this.state.teams.length
    });
  },

  // --- Offseason: transfer portal ---

  // Decides who enters the portal and where they land. Two real patterns
  // drive it: productive players at low-strength-of-schedule programs get
  // pulled upward, and highly-rated recruits who underperformed or barely
  // played look for a new situation.
  ROSTER_LIMIT: 15,
  ROSTER_TARGET: 13,

  // Replaces departures with incoming freshmen. Without this, rosters only
  // ever shrink — every graduation, draft entry and transfer out is
  // permanent, and after a season or two teams are playing shorthanded.
  // Coaches sign to positional need, filling their thinnest slots first.
  backfillRosters() {
    if (typeof RosterGen === 'undefined') return;
    this.state.teams.forEach(team => {
      const roster = team.roster || [];
      let toSign = this.ROSTER_TARGET - roster.length;
      if (toSign <= 0) return;

      const usedNames = new Set(roster.map(p => p.name));
      const baseline = roster.length
        ? roster.reduce((n, p) => n + parseFloat(p.rating), 0) / roster.length
        : 70;

      for (let i = 0; i < toSign; i++) {
        const needs = this.rosterNeeds(team);
        const slot = needs.neediest[0] || 'SF';
        // Take a concrete position from the slot's eligibility list.
        const pos = (this.SLOT_ELIGIBILITY[slot] || ['SF'])[0];
        const p = RosterGen.generateFillerPlayer(
          team.school, team.conference, pos, baseline, roster.length + i, usedNames);
        // Incoming signings are freshmen, and unranked ones shouldn't
        // out-rate the players already there.
        p.class = 'FR';
        p.rating = Math.min(p.rating, Math.max(58, Math.round(baseline + 2)));
        p.school_logo = this.getTeamLogo(team.school);
        p.stats = this.getZeroStats();
        p.statsFull = this.getZeroStats();
        p.statsConf = this.getZeroStats();
        p.gameLog = [];
        p.accolades = [];
        team.roster.push(p);
      }
      this.assignMissingJerseys();
    });
  },


  // Enforces the scholarship limit after departures and arrivals. Teams
  // don't simply accumulate bodies: a roster tops out at fifteen, and when
  // it's full a coach fills by positional need rather than taking whoever
  // is next on the board.
  enforceRosterLimits() {
    const limit = this.ROSTER_LIMIT;
    this.state.teams.forEach(team => {
      const roster = team.roster || [];
      if (roster.length <= limit) return;

      // Keep the best player at each lineup slot first, so trimming can
      // never leave a team without a centre or a point guard.
      const kept = [];
      const remaining = [...roster].sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
      ['C', 'PG', 'PF', 'SG', 'SF'].forEach(slot => {
        const eligible = this.SLOT_ELIGIBILITY[slot] || [];
        const idx = remaining.findIndex(p => eligible.includes((p.pos || '').toUpperCase()));
        if (idx >= 0) kept.push(remaining.splice(idx, 1)[0]);
      });
      // Then fill the rest of the scholarships with the best available.
      while (kept.length < limit && remaining.length) kept.push(remaining.shift());

      const cutIds = new Set(remaining.map(p => p.id));
      if (cutIds.size > 0) {
        remaining.forEach(p => this.markDeparted(p));
        team.roster = roster.filter(p => !cutIds.has(p.id));
      }
    });
  },

  // How many scholarships a team has free, and which positions it most
  // needs — used so incoming players fill genuine holes.
  rosterNeeds(team) {
    const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    (team.roster || []).forEach(p => {
      const pos = (p.pos || '').toUpperCase();
      Object.keys(this.SLOT_ELIGIBILITY).forEach(slot => {
        if (this.SLOT_ELIGIBILITY[slot].includes(pos)) counts[slot] += 1;
      });
    });
    return {
      openSpots: Math.max(0, this.ROSTER_LIMIT - (team.roster || []).length),
      neediest: Object.keys(counts).sort((a, b) => counts[a] - counts[b])
    };
  },

  // Reads next season's rows from the roster sheet. A player listed at a
  // different school the following year is a transfer the sheet author
  // intended, so it's executed exactly rather than left to chance.
  applyScriptedTransfers() {
    const rows = this.state.rawRosterRows || [];
    if (rows.length === 0) return [];
    const nextSeason = this.currentSeasonSheetYear() + 1;

    const nextByName = {};
    rows.forEach(r => {
      if (!this.rowHasPlayerName(r)) return;
      if (this.getRowSeasonYear(r) !== nextSeason) return;
      const name = String(r.name || r.player || r.fullname || '').trim();
      const team = String(r.team || r.school || '').trim();
      // Keyed by name only as a fallback; the primary key includes the
      // player's CURRENT school so two players sharing a name (there are
      // genuinely two Elijah Williamses) can't be confused for each other.
      if (name && team) {
        const key = name.toLowerCase();
        if (!nextByName[key]) nextByName[key] = [];
        nextByName[key].push(team);
      }
    });

    const moved = [];
    this.state.teams.forEach(team => {
      [...(team.roster || [])].forEach(p => {
        const candidates = nextByName[String(p.name).toLowerCase()];
        if (!candidates || candidates.length === 0) return;
        // With a shared name, only move when the destination is
        // unambiguous; otherwise leave both players where they are rather
        // than risk relocating the wrong one.
        if (candidates.length > 1) {
          const distinct = [...new Set(candidates.map(c => c.toLowerCase()))];
          if (distinct.length > 1) return;
        }
        const dest = candidates[0];
        const destTeam = this.state.teams.find(t =>
          t.school.toLowerCase() === dest.toLowerCase() ||
          (typeof RosterGen !== 'undefined' &&
            RosterGen.normalizeSchoolKey(t.school) === RosterGen.normalizeSchoolKey(dest)));
        if (!destTeam || destTeam.school === team.school) return;

        team.roster = team.roster.filter(x => x.id !== p.id);
        p.school = destTeam.school;
        p.conference = destTeam.conference;
        p.school_logo = this.getTeamLogo(destTeam.school);
        if (!p.collegeHistory) p.collegeHistory = [team.school];
        if (p.collegeHistory[p.collegeHistory.length - 1] !== destTeam.school) {
          p.collegeHistory.push(destTeam.school);
        }
        destTeam.roster.push(p);
        moved.push({
          id: p.id, name: p.name, pos: p.pos, class: p.class,
          rating: parseFloat(p.rating) || 0,
          ppg: p.stats ? p.stats.ppg : '0.0',
          from: team.school, to: destTeam.school, reason: 'Scheduled transfer'
        });
      });
    });
    if (moved.length) console.log(`Applied ${moved.length} scripted transfers from the roster sheet.`);
    return moved;
  },

  computeTransfers(excludeIds) {
    const transfers = [];
    const declaredIds = new Set((this.state.draftDeclarations || []).map(d => d.id));

    // Destination pool, best programs first.
    const destinations = [...this.state.teams].sort((a, b) => (b.simData.teamOvr || 0) - (a.simData.teamOvr || 0));

    this.state.teams.forEach(team => {
      const sosPercentile = team.sosRank ? 1 - (team.sosRank / this.state.teams.length) : 0.5;

      (team.roster || []).forEach(p => {
        if (declaredIds.has(p.id)) return;                 // already leaving for the draft
        if (excludeIds && excludeIds.has(p.id)) return;     // already moved by a scripted transfer
        if (p.class === 'SR' || p.class === 'GR') return;   // out of eligibility anyway

        const st = p.stats || this.getZeroStats();
        const mpg = parseFloat(st.mpg) || 0;
        const bpm = parseFloat(st.bpm) || 0;
        const rating = parseFloat(p.rating) || 70;

        let chance = 0;
        let reason = '';

        // Producing well against a weak schedule — a classic "level up" move.
        if (bpm > 1.5 && mpg > 15 && sosPercentile < 0.55) {
          chance = 0.30 + (0.55 - sosPercentile) * 0.45;
          reason = 'Seeking a higher level';
        }

        // Highly-rated player who isn't playing or isn't producing.
        const highPedigree = (p.rsci && parseFloat(p.rsci) <= 150) || rating >= 82;
        if (highPedigree && (mpg < 18 || bpm < 0)) {
          chance = Math.max(chance, 0.40);
          reason = mpg < 18 ? 'Looking for playing time' : 'Underperformed expectations';
        }

        // Buried on the bench anywhere — the single biggest driver of real
        // portal volume, which now runs to well over a thousand players.
        if (mpg < 10) {
          chance = Math.max(chance, 0.26);
          reason = reason || 'Buried in the rotation';
        }

        if (chance > 0 && Math.random() < chance) {
          // Land somewhere plausibly better, with some randomness so it
          // isn't always the single strongest program.
          const better = destinations.filter(d =>
            d.school !== team.school && (d.simData.teamOvr || 0) > (team.simData.teamOvr || 0));
          let pool = better.length > 0 ? better.slice(0, Math.max(5, Math.floor(better.length * 0.25))) : destinations.slice(0, 10);
          // Only schools with a scholarship open, and preferably ones that
          // actually need this position.
          pool = pool.filter(d => (d.roster || []).length < this.ROSTER_LIMIT);
          const posUp = (p.pos || '').toUpperCase();
          const needy = pool.filter(d => this.rosterNeeds(d).neediest.slice(0, 2)
            .some(slot => (this.SLOT_ELIGIBILITY[slot] || []).includes(posUp)));
          const choices = needy.length > 0 ? needy : pool;
          if (choices.length === 0) return;
          const dest = choices[Math.floor(Math.random() * choices.length)];
          if (dest) transfers.push({ player: p, from: team.school, to: dest.school, reason });
        }
      });
    });

    return transfers;
  },

  applyTransfers(transfers) {
    transfers.forEach(({ player, from, to }) => {
      const fromTeam = this.state.teams.find(t => t.school === from);
      const toTeam = this.state.teams.find(t => t.school === to);
      if (!fromTeam || !toTeam) return;
      // Destination has to have a scholarship free.
      if ((toTeam.roster || []).length >= this.ROSTER_LIMIT) return;
      fromTeam.roster = fromTeam.roster.filter(x => x.id !== player.id);
      player.school = to;
      player.conference = toTeam.conference;
      player.school_logo = this.getTeamLogo(to);
      if (!player.collegeHistory) player.collegeHistory = [from];
      if (player.collegeHistory[player.collegeHistory.length - 1] !== to) player.collegeHistory.push(to);
      toTeam.roster.push(player);
    });
  },

  // Early entrants can withdraw and return to school. Seniors and players
  // out of eligibility are locked in. The withdrawal odds stand in for a
  // combine result until the Draft RP page exists to supply a real one.
  resolveDraftWithdrawals() {
    const board = this.computeDraftBigBoard(200);
    const boardRank = {};
    board.forEach((e, i) => { boardRank[e.player.id] = i + 1; });

    const returning = [];
    this.state.draftDeclarations = (this.state.draftDeclarations || []).filter(d => {
      if (d.mandatory) return true;                 // eligibility exhausted, no choice
      const rank = boardRank[d.id] || 999;
      // Projected first-rounders almost always stay in; fringe prospects
      // usually go back to school.
      // A projected top-25 pick is gone, without exception — this is the
      // single hardest rule on the board, and the withdrawal roll was
      // previously able to send a national player of the year back to
      // school.
      if (rank <= 25) return true;
      // Blue-chip recruits who produced never withdraw.
      const src = this.state.activePlayers.find(x => x.id === d.id);
      const rsci = src ? parseFloat(src.rsci) : NaN;
      const ppg = src && src.stats ? parseFloat(src.stats.ppg) : 0;
      if (!isNaN(rsci) && rsci <= 20 && ppg >= 15) return true;
      const stayChance = rank <= 40 ? 0.92 : rank <= 60 ? 0.62 : 0.22;
      if (Math.random() < stayChance) return true;
      returning.push({ ...d, boardRank: rank });
      return false;
    });

    this.state.returningPlayers = returning;
    return returning;
  },

  // The offseason runs as a sequence of stages rather than one atomic
  // step, mirroring the real calendar: the season is wrapped up, players
  // declare, the pre-draft process plays out, withdrawals come back, the
  // draft happens, the portal opens, and only then are rosters finalised.
  // Each call to runOffseason advances one stage, so the sim button walks
  // through them week by week.
  OFFSEASON_STAGES: [
    { key: 'summary',      label: 'Season Summary' },
    { key: 'declarations', label: 'Draft Declarations' },
    { key: 'predraft',     label: 'Combine & Workouts' },
    { key: 'returners',    label: 'Withdrawals' },
    { key: 'draft',        label: 'NBA Draft' },
    { key: 'portal',       label: 'Transfer Portal' },
    { key: 'rosters',      label: 'Final Rosters' }
  ],

  async runOffseason() {
    if (this.state.phase === 'Preseason') {
      alert("Simulate the regular season first before advancing to the offseason.");
      return;
    }
    if (!this.state.ncaaDone) {
      alert("Finish the current season (through the NCAA Tournament) before advancing.");
      return;
    }

    const idx = this.state.offseasonStageIndex || 0;
    const stage = this.OFFSEASON_STAGES[idx];
    if (!stage) return;

    await this.runOffseasonStage(stage.key);

    this.state.offseasonStageIndex = idx + 1;
    // Anything short of the last stage just advances the calendar; the
    // final stage rolls the season over.
    if (this.state.offseasonStageIndex < this.OFFSEASON_STAGES.length) {
      this.state.phase = `Offseason — ${this.OFFSEASON_STAGES[this.state.offseasonStageIndex].label}`;
      this.openOffseason(this.stageToView(stage.key));
      this.syncUI();
      await this.saveStateToDB();
      return;
    }

    await this.completeOffseason();
  },

  stageToView(key) {
    if (key === 'predraft') return 'predraft';
    if (key === 'draft') return 'draft';
    if (key === 'declarations' || key === 'returners') return 'declarations';
    if (key === 'portal' || key === 'rosters') return 'transfers';
    return 'champion';
  },

  async runOffseasonStage(key) {
    switch (key) {
      case 'summary':
        this.archiveCompletedSeason();
        break;
      case 'declarations':
        // Snapshot the class NOW. This used to happen only at the very end
        // of the offseason, so the declarations screen always displayed the
        // previous year's group and never updated past the first draft.
        this.snapshotDeclarations();
        break;
      case 'predraft':
        this.runPreDraftProcess();
        break;
      case 'returners':
        this.resolveDraftWithdrawals();
        break;
      case 'draft':
        this.state.draftResults = this.computeDraftResults();
        break;
      case 'portal':
        this.state.pendingTransfers = true;
        break;
      case 'rosters':
        break;
    }
  },

  // Combine and workouts: measurements and interviews shift a prospect's
  // stock before the draft, which is what makes withdrawal decisions
  // meaningful rather than purely statistical.
  runPreDraftProcess() {
    const board = this.computeDraftBigBoard(200);
    const results = [];
    board.forEach((entry, i) => {
      const p = entry.player;
      // Movement is bigger further down the board — a consensus top pick
      // has little to prove, a fringe prospect everything.
      const volatility = i < 10 ? 1.5 : i < 30 ? 3.5 : 6;
      const swing = (Math.random() + Math.random() - 1) * volatility;
      p.combineSwing = swing;
      if (Math.abs(swing) >= 2) {
        results.push({
          id: p.id, name: p.name, school: p.school,
          direction: swing > 0 ? 'rose' : 'fell',
          amount: Math.abs(Math.round(swing))
        });
      }
    });
    this.state.combineResults = results.slice(0, 40);
  },

  // Final draft order, taken from the board after the pre-draft process.
  computeDraftResults() {
    const declaredIds = new Set((this.state.draftDeclarations || []).map(d => d.id));
    const board = this.computeDraftBigBoard(400)
      .filter(e => declaredIds.has(e.player.id));
    return board.slice(0, 60).map((e, i) => ({
      pick: i + 1,
      id: e.player.id,
      name: e.player.name,
      school: e.player.school,
      pos: e.player.pos,
      ht: e.player.ht,
      ppg: e.player.stats ? e.player.stats.ppg : '0.0',
      round: i < 30 ? 1 : 2
    }));
  },

  // Captures the declaring class with complete stat lines. Declared
  // players are about to leave every roster, which also removes them from
  // the saved players table, so the full record has to be taken while they
  // still exist. Game logs are excluded to keep the save small.
  snapshotDeclarations() {
    this.state.lastDeclarations = (this.state.draftDeclarations || []).map(d => {
      const full = this.state.activePlayers.find(p => p.id === d.id);
      if (!full) return { ...d };
      return {
        ...d,
        ht: full.ht, wt: full.wt, hometown: full.hometown, hs: full.hs,
        jersey: full.jersey, rsci: full.rsci, conference: full.conference,
        collegeHistory: full.collegeHistory,
        stats: full.stats
      };
    });
    this.state.lastDeclarationsYear = this.state.year;
  },

  async completeOffseason() {
    this.state.offseasonStageIndex = 0;

    // Scripted transfers first: if the roster sheet lists a player at a
    // different school next season, that move is authored, not random.
    const scripted = this.applyScriptedTransfers();

    // Then the random portal, which skips anyone already moved.
    const transfers = this.computeTransfers(new Set(scripted.map(t => t.id)));
    this.state.lastTransfers = scripted.concat(transfers.map(t => ({
      id: t.player.id, name: t.player.name, pos: t.player.pos, class: t.player.class,
      rating: parseFloat(t.player.rating) || 0,
      ppg: t.player.stats ? t.player.stats.ppg : '0.0',
      from: t.from, to: t.to, reason: t.reason
    })));
    this.applyTransfers(transfers);

    const declaredIds = new Set((this.state.draftDeclarations || []).map(d => d.id));
    // Kept for the offseason screen — state.draftDeclarations is cleared
    // below when the new season is set up.
    this.snapshotDeclarations();
    const classProgression = { 'FR': 'SO', 'SO': 'JR', 'JR': 'SR' }; // SR/GR intentionally absent: eligibility is exhausted either way

    this.state.teams.forEach(team => {
      // Repair the class field defensively before deciding anyone's fate —
      // this is what stops an unrecognized/stale value from being treated
      // as an automatic graduation.
      team.roster.forEach(p => {
        p.class = this.normalizeClassStanding(p.class) || 'SO';
      });

      team.roster = team.roster.filter(p => {
        if (declaredIds.has(p.id)) { this.markDeparted(p); return false; }  // off to the draft
        const nextClass = classProgression[p.class];
        if (nextClass) { p.class = nextClass; return true; }
        this.markDeparted(p);                                                // eligibility exhausted
        return false;
      });

      team.roster.forEach(p => {
        p.rating = Math.min(99, parseFloat(p.rating) + Math.floor(Math.random() * 4));
      });

      team.simData = { teamOvr: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0, rosterRef: team.roster, winPct: '.000' };
      team.apRank = null;
      team.ncaaSeed = null;
      team.wonConfTourney = false;
      team.wonNationalTitle = false;
    });

    this.state.year += 1;
    this.state.week = 0;
    this.state.phase = 'Preseason';
    this.state.simCompleted = false;
    this.state.regularSeasonDone = false;
    this.state.confChampsDone = false;
    this.state.ncaaDone = false;
    this.state.schedule = [];
    this.state.confTournaments = {};
    this.state.ncaaTournament = null;
    this.state.ncaaFullBracket = null;
    this.state.ncaaRoundsRevealed = 0;
    this.state.draftDeclarations = [];
    this.state.seasonInitialized = false;

    this.refreshRecruitPool();
    this.filterActiveData();
    this.enforceRosterLimits();
    this.backfillRosters();
    this.filterActiveData();
    this.initSeasonData();
    this.openOffseason('champion');
    this.logNews(`Advanced to ${this.state.year} Offseason. Graduated seniors cleared; incoming recruits added.`);
    
    const sbEl = document.getElementById('statsBody');
    if (sbEl) sbEl.innerHTML = `<tr><td colspan="25" class="empty-table-msg">Simulate games to view leaderboards.</td></tr>`;
    const scEl = document.getElementById('standingsContainer');
    if (scEl) scEl.innerHTML = `<p class="empty-table-msg">Simulate games to view standings.</p>`;
    
    this.syncUI();
    await this.saveStateToDB();
  },

  syncUI() {
    const yrElem = document.getElementById('currentYearDisplay');
    if (yrElem) yrElem.innerText = `${this.state.year}-${(this.state.year + 1).toString().slice(2)}`;

    const phaseElem = document.getElementById('currentPhaseDisplay');
    if (phaseElem) {
      if (this.state.ncaaDone) phaseElem.innerText = this.state.phase;
      else if (this.state.confChampsDone) phaseElem.innerText = 'NCAA Tournament';
      else if (this.state.regularSeasonDone) phaseElem.innerText = 'Conference Championships';
      else if (this.state.week === 0) phaseElem.innerText = 'Preseason';
      else if (this.state.week > this.state.nonConfEnd) phaseElem.innerText = `Conference — Week ${this.state.week}`;
      else phaseElem.innerText = `Non-Conference — Week ${this.state.week}`;
    }

    // Mirror phase/year into the always-visible toolbar.
    const tbPhase = document.getElementById('toolbarPhase');
    const tbYear = document.getElementById('toolbarYear');
    if (tbPhase && phaseElem) tbPhase.innerText = phaseElem.innerText;
    if (tbYear) tbYear.innerText = `${this.state.year}-${(this.state.year + 1).toString().slice(2)}`;

    const btn = document.getElementById('simWeekBtn');
    if (btn) {
      if (this.state.ncaaDone) {
        const idx = this.state.offseasonStageIndex || 0;
        const stage = this.OFFSEASON_STAGES[idx];
        btn.innerText = stage ? `Advance: ${stage.label}` : 'Begin Offseason';
        btn.disabled = false;
      } else if (this.state.confChampsDone) {
        const names = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
        const nextName = names[this.state.ncaaRoundsRevealed || 0] || 'Next Round';
        btn.innerText = this.state.ncaaTournament ? `Simulate ${nextName}` : `Simulate NCAA Tournament`;
        btn.disabled = false;
      } else if (this.state.regularSeasonDone) {
        btn.innerText = `Simulate Conference Championships`;
        btn.disabled = false;
      } else {
        btn.innerText = `Simulate Week ${this.state.week + 1}`;
        btn.disabled = false;
      }
    }

    // Each section renders in isolation. Previously these ran as a plain
    // sequence, so one section throwing meant every section after it never
    // rendered at all — which looked like "stats stopped appearing" rather
    // than like an error. Now a failure is contained, named in the console,
    // and shown in the affected panel instead of silently blanking the app.
    this.renderSections([
      ['conference filters', () => this.populateConferenceDropdowns()],
      ['dashboard',          () => this.updateDashboard()],
      ['player stats',       () => this.sortAndRenderStatsTable(), 'statsBody'],
      ['standings',          () => this.updateStandingsTab(), 'standingsContainer'],
      ['awards',             () => this.updateAwardsTab()],
      ['schedule',           () => this.updateScheduleTab(), 'scheduleContainer'],
      ['bracketology',       () => this.updatePostseasonTab(), 'postseasonContainer'],
      ['team page',          () => this.updateTeamTab(), 'teamPageContainer'],
      ['team stats',         () => this.updateTeamStatsTab()],
      ['recruits',           () => this.updateRecruitsTab(), 'recruitsBody'],
      ['draft board',        () => this.updateDraftBoardTab(), 'draftBoardContainer'],
      ['offseason',          () => this.updateOffseasonTab()],
      ['history',            () => this.updateHistoryTab(), 'historyContainer']
    ]);
  },

  renderSections(sections) {
    sections.forEach(([name, fn, targetId]) => {
      try {
        fn();
      } catch (err) {
        console.error(`Render failed in "${name}" section:`, err);
        if (targetId) {
          const el = document.getElementById(targetId);
          if (el) {
            const isRow = el.tagName === 'TBODY';
            const msg = `Couldn't render ${name}: ${err.message}. See the browser console for details.`;
            el.innerHTML = isRow
              ? `<tr><td colspan="30" class="empty-table-msg">${msg}</td></tr>`
              : `<p class="empty-table-msg">${msg}</p>`;
          }
        }
      }
    });
  },

  setConfFilter(val) {
    this.state.confFilter = val;
    this.sortAndRenderStatsTable();
  },

  setStatScope(val) {
    this.state.scopeFilter = val;
    this.state.activePlayers.forEach(p => {
      p.stats = val === 'conf' ? p.statsConf : p.statsFull;
    });
    this.sortAndRenderStatsTable();
  },

  toggleStatView(view) {
    this.state.statView = view;
    this.sortAndRenderStatsTable();
  },

  handleSort(colId) {
    if (!this.state.simCompleted && this.state.week === 0) return;
    if (this.state.sortCol === colId) {
      this.state.sortDir = this.state.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.state.sortCol = colId;
      this.state.sortDir = 'desc';
    }
    this.sortAndRenderStatsTable();
  },

  sortAndRenderStatsTable() {
    const statsBody = document.getElementById('statsBody');
    const statsHeader = document.getElementById('statsHeader');
    if (!statsBody || !statsHeader || this.state.week === 0) return;
    
    let col = this.state.sortCol;
    let dir = this.state.sortDir === 'desc' ? -1 : 1;
    // Leaderboards need a minimum playing-time bar, otherwise someone who
    // played four minutes and hit his only shot leads the country in
    // field goal percentage. Mirrors the NCAA's own qualifying approach.
    const minMpg = 10;
    const minMinutes = 150;
    let pool = this.state.activePlayers.filter(p =>
      this.matchesConfFilter(p.conference, this.state.confFilter) &&
      this.matchesPosFilter(p.pos, this.state.statsPosFilter) &&
      (!this.state.statsQualifiedOnly ||
        (parseFloat(p.stats.mpg) >= minMpg && (p.stats.totMin || 0) >= minMinutes)));

    pool.sort((a, b) => {
      let valA = a.stats ? a.stats[col] : 0;
      let valB = b.stats ? b.stats[col] : 0;
      if (['name', 'school', 'pos', 'class'].includes(col)) {
        valA = a[col] || ''; valB = b[col] || '';
        return valA.toString().localeCompare(valB.toString()) * dir;
      }
      if (typeof valA === 'string') valA = parseFloat(valA.replace('%','')) || 0;
      if (typeof valB === 'string') valB = parseFloat(valB.replace('%','')) || 0;
      return (valA - valB) * dir;
    });

    const totalHeaders = [
      { id: 'name', label: 'Player' }, { id: 'school', label: 'School' }, { id: 'pos', label: 'Pos' },
      { id: 'gp', label: 'GP' }, { id: 'gs', label: 'GS' }, { id: 'totMin', label: 'MIN' },
      { id: 'totPts', label: 'PTS' }, { id: 'totOreb', label: 'OREB' }, { id: 'totDreb', label: 'DREB' },
      { id: 'totReb', label: 'REB' }, { id: 'totAst', label: 'AST' }, { id: 'totStl', label: 'STL' },
      { id: 'totBlk', label: 'BLK' }, { id: 'totTov', label: 'TOV' }, { id: 'totPf', label: 'PF' },
      { id: 'totFgm', label: 'FGM' }, { id: 'totFga', label: 'FGA' },
      { id: 'totThreePm', label: '3PM' }, { id: 'totThreePa', label: '3PA' },
      { id: 'totFtm', label: 'FTM' }, { id: 'totFta', label: 'FTA' }
    ];

    const boxHeaders = [
      { id: 'name', label: 'Player' }, { id: 'school', label: 'School' }, { id: 'pos', label: 'Pos' },
      { id: 'gp', label: 'GP' }, { id: 'gs', label: 'GS' }, { id: 'mpg', label: 'MPG' },
      { id: 'ppg', label: 'PPG' }, { id: 'oreb', label: 'OREB' }, { id: 'rpg', label: 'RPG' },
      { id: 'apg', label: 'APG' }, { id: 'stl', label: 'SPG' },
      { id: 'blk', label: 'BPG' }, { id: 'tov', label: 'TPG' }, { id: 'pf', label: 'PF' },
      { id: 'fgm', label: 'FGM' }, { id: 'fga', label: 'FGA' }, { id: 'fgPct', label: 'FG%' },
      { id: 'twoPm', label: '2P' }, { id: 'twoPa', label: '2PA' }, { id: 'twoPPct', label: '2P%' },
      { id: 'threePm', label: '3P' }, { id: 'threePa', label: '3PA' }, { id: 'threePPct', label: '3P%' },
      { id: 'ftm', label: 'FT' }, { id: 'fta', label: 'FTA' }, { id: 'ftPct', label: 'FT%' }
    ];

    const advHeaders = [
      { id: 'name', label: 'Player' }, { id: 'school', label: 'School' }, { id: 'mpg', label: 'MPG' },
      { id: 'bpm', label: 'BPM' }, { id: 'obpm', label: 'OBPM' }, { id: 'dbpm', label: 'DBPM' },
      { id: 'tsPct', label: 'TS%' }, { id: 'rTsPct', label: 'rTS%' }, { id: 'eFgPct', label: 'eFG%' },
      { id: 'orebPct', label: 'OREB%' }, { id: 'drebPct', label: 'DREB%' }, { id: 'trbPct', label: 'TRB%' },
      { id: 'astPct', label: 'AST%' }, { id: 'tovPct', label: 'TOV%' }, { id: 'blkPct', label: 'BLK%' },
      { id: 'usg', label: 'USG%' }, { id: 'ftr', label: 'FTr' }, { id: 'threePar', label: '3PAr' },
      { id: 'ortg', label: 'ORtg' }, { id: 'drtg', label: 'DRtg' }, { id: 'netRtg', label: 'Net' }
    ];

    let currentHeaders = this.state.statView === 'box' ? boxHeaders
      : this.state.statView === 'total' ? totalHeaders : advHeaders;
    let theadHtml = `<tr><th class="rank-col-head">#</th>`;
    currentHeaders.forEach(h => {
      let isSort = this.state.sortCol === h.id;
      let arrow = isSort ? (this.state.sortDir === 'desc' ? ' &darr;' : ' &uarr;') : '';
      let cls = isSort ? 'active-sort' : '';
      theadHtml += `<th class="${cls}" onclick="SimEngine.handleSort('${h.id}')">${h.label}${arrow}</th>`;
    });
    theadHtml += `</tr>`;
    statsHeader.innerHTML = theadHtml;

    let tbodyHtml = '';
    if (pool.length === 0) {
      tbodyHtml = `<tr><td colspan="25" class="empty-table-msg">No players found for conference: ${this.state.confFilter}</td></tr>`;
    } else {
      // Show a readable slice rather than every player in the country. The
      // rank column reflects the current sort, so flipping to ascending
      // renumbers from the bottom of the league up.
      const limit = this.state.statsLimit || 25;
      const shown = pool.slice(0, limit);
      shown.forEach((p, idx) => {
        tbodyHtml += `<tr>`;
        tbodyHtml += `<td class="rank-cell">${idx + 1}</td>`;
        const safeName = p.name.replace(/'/g, "\\'");
        const safeId = String(p.id).replace(/'/g, "\\'");
        const safeSchool = p.school.replace(/'/g, "\\'");
        currentHeaders.forEach(h => {
          if (h.id === 'name') tbodyHtml += `<td class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${p.name}</td>`;
          else if (h.id === 'school') tbodyHtml += `<td><div class="team-cell-wrap clickable-school" onclick="SimEngine.goToTeamPage('${safeSchool}')"><img src="${this.getTeamLogo(p.school)}" class="xs-logo"><span>${p.school}</span></div></td>`;
          else if (h.id === 'pos') tbodyHtml += `<td>${p.pos}</td>`;
          else tbodyHtml += `<td>${p.stats ? p.stats[h.id] : '-'}</td>`;
        });
        tbodyHtml += `</tr>`;
      });
    }

    statsBody.innerHTML = tbodyHtml;

    const moreBtn = document.getElementById('statsShowMore');
    if (moreBtn) {
      const limit = this.state.statsLimit || 25;
      if (pool.length <= 25) {
        moreBtn.style.display = 'none';
      } else {
        moreBtn.style.display = 'inline-flex';
        moreBtn.innerText = limit === 25
          ? `Show Top 100`
          : `Show Top 25`;
      }
    }
  },

  toggleStatsLimit() {
    this.state.statsLimit = (this.state.statsLimit || 25) === 25 ? 100 : 25;
    this.sortAndRenderStatsTable();
  },

  // Returns the current Top 25 regardless of phase: the in-season AP poll
  // once games have been played, otherwise the preseason projection.
  getCurrentTop25() {
    if (this.state.week > 0) {
      const ranked = this.state.teams.filter(t => t.apRank).sort((a, b) => a.apRank - b.apRank);
      if (ranked.length) return ranked;
    }
    return [...this.state.teams]
      .filter(t => t.preseasonRank)
      .sort((a, b) => a.preseasonRank - b.preseasonRank)
      .slice(0, 25);
  },

  updateDashboard() {
    const dashTopTeams = document.getElementById('dashTopTeams');
    if (dashTopTeams) {
      const top25 = this.getCurrentTop25().slice(0, 25);
      const isPreseason = this.state.week === 0;
      if (top25.length === 0) {
        dashTopTeams.innerHTML = `<p class="sub-text">Start a save to generate rankings.</p>`;
      } else {
        dashTopTeams.innerHTML = `
          <div class="ap-bubble-grid">
            ${top25.map((t, i) => {
              const safe = t.school.replace(/'/g, "\\'");
              const rec = isPreseason ? '' : `<span class="ap-bubble-record">${t.simData.wins}-${t.simData.losses}</span>`;
              return `<button class="ap-bubble" onclick="SimEngine.goToTeamPage('${safe}')" title="${t.school}">
                <span class="ap-bubble-rank">${i + 1}</span>
                <img src="${this.getTeamLogo(t.school)}" class="ap-bubble-logo" alt="${t.school}">
                <span class="ap-bubble-name">${t.school}</span>
                ${rec}
              </button>`;
            }).join('')}
          </div>`;
      }
    }

    const labelEl = document.getElementById('dashPollLabel');
    if (labelEl) labelEl.innerText = this.state.week === 0 ? 'PRESEASON TOP 25' : 'AP TOP 25';

    if (this.state.week > 0) {
      this.populateDashList('dashPts', 'ppg');
      this.populateDashList('dashReb', 'rpg');
      this.populateDashList('dashAst', 'apg');
      this.populateDashList('dashStl', 'stl');
      this.populateDashList('dashBlk', 'blk');
    }

    this.updateTopPerformances();
    this.updateDashboardBracket();
  },

  // Jumps straight to a team's page under the Team tab.
  goToTeamPage(school) {
    this.closePlayerPage();
    this.state.teamPageSelection = school;
    this.state.teamPageView = 'team';
    this.updateTeamTab();
    this.activateTabSilently('teamTab');
    this.pushNav({ type: 'team', key: school, view: 'team', label: school });
  },

  updateTopPerformances() {
    const el = document.getElementById('dashTopPerformances');
    if (!el) return;
    if (this.state.week === 0) {
      el.innerHTML = `<p class="sub-text">Simulate a week to see standout performances.</p>`;
      return;
    }
    const perfs = this.getTopPerformances(this.state.week, 5);
    if (perfs.length === 0) {
      el.innerHTML = `<p class="sub-text">No games played this week.</p>`;
      return;
    }
    el.innerHTML = perfs.map(({ player, game, score }) => {
      const safe = String(player.id).replace(/'/g, "\\'");
      const safeSchool = String(player.school).replace(/'/g, "\\'");
      return `<div class="perf-row">
        <img src="${this.getTeamLogo(player.school)}" class="sm-logo clickable-school" title="${player.school}" onclick="SimEngine.goToTeamPage('${safeSchool}')">
        <div class="perf-info">
          <span class="perf-name clickable-player" onclick="SimEngine.openPlayerModal('${safe}')">${player.name}</span>
          <span class="perf-meta"><span class="clickable-school" onclick="SimEngine.goToTeamPage('${safeSchool}')">${player.school}</span> ${game.isHome ? 'vs' : '@'} ${game.opponent} · ${game.won ? 'W' : 'L'} ${game.teamScore}-${game.oppScore}</span>
        </div>
        <span class="perf-statline">
          <span class="perf-stat"><b>${game.pts}</b> PTS</span>
          <span class="perf-stat"><b>${game.reb}</b> REB</span>
          <span class="perf-stat"><b>${game.ast}</b> AST</span>
        </span>
        <span class="perf-score" title="Game Score">${score.toFixed(1)}</span>
      </div>`;
    }).join('');
  },

  // Once the postseason starts, the live bracket is the most interesting
  // thing on the dashboard, so it takes over the top of the tab.
  updateDashboardBracket() {
    const el = document.getElementById('dashBracket');
    const wrap = document.getElementById('dashBracketSection');
    if (!el || !wrap) return;

    if (this.state.ncaaDone && this.state.ncaaTournament) {
      wrap.style.display = 'block';
      const bt = document.getElementById('dashBracketTitle'); if (bt) bt.innerText = 'NCAA TOURNAMENT';
      el.innerHTML = this.renderBracketVisual(this.state.ncaaTournament, true);
      return;
    }
    if (this.state.confChampsDone && !this.state.ncaaDone) {
      wrap.style.display = 'block';
      const bt = document.getElementById('dashBracketTitle'); if (bt) bt.innerText = 'SELECTION DAY — NCAA FIELD';
      el.innerHTML = this.renderSelectionField();
      return;
    }
    if (this.state.regularSeasonDone && Object.keys(this.state.confTournaments).length > 0) {
      wrap.style.display = 'block';
      const bt = document.getElementById('dashBracketTitle'); if (bt) bt.innerText = 'CONFERENCE TOURNAMENTS';
      const first = Object.entries(this.state.confTournaments)
        .sort((a, b) => (this.isHighMajor(b[0]) ? 1 : 0) - (this.isHighMajor(a[0]) ? 1 : 0))[0];
      el.innerHTML = first ? this.renderBracketVisual(first[1], false, first[0]) : '';
      return;
    }
    wrap.style.display = 'none';
  },

  // Projected NCAA field, shown on Selection Day between the conference
  // tournaments and the NCAA tournament itself.
  // Builds the NCAA field as a real four-region bracket. Teams are seeded
  // 1-68 overall, then distributed across the East, South, West and
  // Midwest so the top four overall seeds are the 1-seeds in different
  // regions, the next four are the 2-seeds, and so on — the same snake
  // the selection committee uses. The last at-large teams drop into the
  // First Four.
  buildSeededBracket() {
    const field = this.buildNCAAField();
    const REGIONS = ['East', 'South', 'West', 'Midwest'];
    const autoBids = new Set(Object.values(this.state.confTournaments).map(b => b.champion.school));

    // A 68-team field fills 64 bracket slots: 60 teams are placed
    // directly and the last 8 pair off in the First Four for the
    // remaining 4 slots. Those slots are rendered as the matchup itself
    // rather than a single team, which is how a real bracket shows them
    // before the play-in games are decided.
    const SLOTS = 64;
    const playInGames = Math.max(0, Math.min(4, field.length - SLOTS));
    const directCount = SLOTS - playInGames;
    const direct = field.slice(0, directCount);
    const playInPool = field.slice(directCount);

    const playIn = [];
    for (let i = 0; i < playInGames; i++) {
      const a = playInPool[i * 2];
      const b = playInPool[i * 2 + 1];
      if (!a || !b) break;
      playIn.push({
        teamA: a, teamB: b, seed: 16,
        autoA: autoBids.has(a.school), autoB: autoBids.has(b.school)
      });
    }

    // Build the 64 bracket slots: direct entrants first, then one
    // First Four placeholder per region on the 16 line.
    const slots = direct.map(team => ({ type: 'team', team, autoBid: autoBids.has(team.school) }));
    playIn.forEach(g => slots.push({ type: 'playin', game: g }));

    const regions = {};
    REGIONS.forEach(r => { regions[r] = []; });

    // Snake the seed lines across regions so the best teams on each line
    // land in different regions, as the committee does.
    slots.forEach((slot, i) => {
      const seedLine = Math.floor(i / 4);
      const posInLine = i % 4;
      const regionIdx = seedLine % 2 === 0 ? posInLine : (3 - posInLine);
      regions[REGIONS[regionIdx]].push({ ...slot, seed: seedLine + 1 });
    });

    return { regions, REGIONS, playIn, fieldSize: field.length };
  },

  // Seed-order pairings within a region: 1v16, 8v9, 5v12, 4v13, 6v11,
  // 3v14, 7v10, 2v15 — the standard first-round arrangement.
  REGION_PAIR_ORDER: [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]],

  renderSelectionField() {
    const { regions, REGIONS, playIn, fieldSize } = this.buildSeededBracket();

    const teamChip = (entry) => {
      if (!entry) return `<div class="seed-row empty"><span class="seed-num">—</span><span class="seed-name">TBD</span></div>`;
      if (entry.type === 'playin') {
        const g = entry.game;
        return `<div class="seed-row playin-slot" title="First Four winner">
          <span class="seed-num">${entry.seed}</span>
          <span class="seed-name">${g.teamA.school} / ${g.teamB.school}</span>
        </div>`;
      }
      const safe = entry.team.school.replace(/'/g, "\\'");
      return `<div class="seed-row ${entry.autoBid ? 'auto-bid' : ''}" onclick="SimEngine.goToTeamPage('${safe}')" title="${entry.team.school}${entry.autoBid ? ' — automatic bid' : ' — at-large'}">
        <span class="seed-num">${entry.seed}</span>
        <img src="${this.getTeamLogo(entry.team.school)}" class="xs-logo">
        <span class="seed-name">${entry.team.school}</span>
      </div>`;
    };

    const regionPanel = (name) => {
      const bySeed = {};
      (regions[name] || []).forEach(e => {
        if (!bySeed[e.seed]) bySeed[e.seed] = e;
      });
      const games = this.REGION_PAIR_ORDER.map(([a, b]) => `
        <div class="seed-matchup">
          ${teamChip(bySeed[a])}
          ${teamChip(bySeed[b])}
        </div>`).join('');
      return `<div class="bracket-region">
        <h5 class="region-title">${name}</h5>
        ${games}
      </div>`;
    };

    const firstFour = playIn.length ? `
      <div class="first-four">
        <h5 class="region-title">First Four</h5>
        <div class="first-four-games">
          ${playIn.map(g => `
            <div class="seed-matchup">
              <div class="seed-row ${g.autoA ? 'auto-bid' : ''}" onclick="SimEngine.goToTeamPage('${g.teamA.school.replace(/'/g, "\\'")}')">
                <span class="seed-num">${g.seed}</span>
                <img src="${this.getTeamLogo(g.teamA.school)}" class="xs-logo">
                <span class="seed-name">${g.teamA.school}</span>
              </div>
              <div class="seed-row ${g.autoB ? 'auto-bid' : ''}" onclick="SimEngine.goToTeamPage('${g.teamB.school.replace(/'/g, "\\'")}')">
                <span class="seed-num">${g.seed}</span>
                <img src="${this.getTeamLogo(g.teamB.school)}" class="xs-logo">
                <span class="seed-name">${g.teamB.school}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>` : '';

    // Four-corner layout: the two left regions feed one semifinal and the
    // two right regions the other, meeting at the Final Four in the middle.
    return `
      <p class="sub-text mb-1">${fieldSize} teams are in. Gold-marked teams earned automatic bids by winning their conference tournament; the rest are at-large selections.</p>
      <div class="ncaa-bracket-grid">
        ${regionPanel(REGIONS[0])}
        ${regionPanel(REGIONS[1])}
        <div class="final-four-hub">
          <div class="ff-label">Final Four</div>
          <div class="ff-trophy">🏆</div>
          <div class="ff-sub">National Championship</div>
        </div>
        ${regionPanel(REGIONS[2])}
        ${regionPanel(REGIONS[3])}
      </div>
      ${firstFour}`;
  },

  // Draws a real bracket: one column per round, matchups stacked inside,
  // with the winner of each game highlighted.
  renderBracketVisual(bracket, isNcaa, confName) {
    if (!bracket || !bracket.rounds || bracket.rounds.length === 0) return '<p class="sub-text">No bracket yet.</p>';

    const roundNames = isNcaa
      ? ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship']
      : ['Round 1', 'Quarterfinals', 'Semifinals', 'Final'];
    const offset = isNcaa ? 0 : Math.max(0, roundNames.length - bracket.rounds.length);

    const gameEl = (g) => {
      const aWon = g.winner === g.teamA;
      const teamRow = (team, score, won) => `
        <div class="bracket-team ${won ? 'winner' : ''}" onclick="SimEngine.goToTeamPage('${team.school.replace(/'/g, "\\'")}')">
          <img src="${this.getTeamLogo(team.school)}" class="xs-logo">
          <span class="bracket-team-name">${team.school}</span>
          <span class="bracket-team-score">${score}</span>
        </div>`;
      return `<div class="bracket-game-card">
        ${teamRow(g.teamA, g.result.homeScore, aWon)}
        ${teamRow(g.teamB, g.result.awayScore, !aWon)}
      </div>`;
    };

    let html = '';
    if (confName) html += `<h5 class="bracket-conf-title">${this.getConferenceLogoImg(confName, 'conf-logo-sm')} ${confName}</h5>`;
    if (bracket.playIn && bracket.playIn.length) {
      html += `<div class="bracket-round">
        <div class="bracket-round-title">${isNcaa ? 'First Four' : 'Play-In'}</div>
        ${bracket.playIn.map(gameEl).join('')}
      </div>`;
    }
    html += bracket.rounds.map((round, i) => `
      <div class="bracket-round">
        <div class="bracket-round-title">${roundNames[i + offset] || `Round ${i + 1}`}</div>
        ${round.map(gameEl).join('')}
      </div>`).join('');

    return `<div class="bracket-scroll"><div class="bracket-columns">${html}</div></div>
      <div class="bracket-champion">🏆 ${bracket.champion.school}</div>`;
  },

  populateDashList(elementId, statKey) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let sorted = [...this.state.activePlayers].sort((a,b) => parseFloat(b.stats[statKey]) - parseFloat(a.stats[statKey]));
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (sorted[i]) {
        const safeName = sorted[i].name.replace(/'/g, "\\'");
        const safeId = String(sorted[i].id).replace(/'/g, "\\'");
        html += `<div class="leader-row">
          <span class="leader-ident">${i+1}.
            <img src="${this.getTeamLogo(sorted[i].school)}" class="xs-logo clickable-school" title="${sorted[i].school}" onclick="event.stopPropagation();SimEngine.goToTeamPage('${sorted[i].school.replace(/'/g, "\\'")}')">
            <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${sorted[i].name}</span>
          </span>
          <span>${sorted[i].stats[statKey]}</span>
        </div>`;
      }
    }
    el.innerHTML = html;
  },

  updateStandingsTab() {
    const standingsContainer = document.getElementById('standingsContainer');
    if (!standingsContainer) return;
    if (this.state.teams.length === 0) return;

    // Before tip-off there are no results to rank, so show the projected
    // preseason poll (roster strength + program tier) instead of a blank tab.
    if (this.state.week === 0) {
      standingsContainer.innerHTML = this.renderPreseasonPoll() + this.renderConferenceStandings();
      return;
    }

    let apTop25 = this.getCurrentTop25().slice(0, 25);
    let apHtml = `
      <div class="standings-card">
        <div class="flex-between mb-1">
          <h3>AP TOP 25</h3>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr><th>AP Rank</th><th>Team</th><th>Conf</th><th>Overall</th><th>Conf W-L</th><th>Team OVR</th></tr>
            </thead>
            <tbody>`;
    
    apTop25.forEach((t, idx) => {
      let isHidden = idx >= 10 ? 'class="ap-extra-row" style="display:none;"' : '';
      const safeSchool = t.school.replace(/'/g, "\\'");
      apHtml += `
        <tr ${isHidden}>
          <td class="rank-cell">#${idx + 1}</td>
          <td>
            <div class="team-cell-wrap clickable-school" onclick="SimEngine.openTeamModal('${safeSchool}')">
              <img src="${this.getTeamLogo(t.school)}" class="sm-logo">
              <span class="team-name-cell">${t.school}</span>
            </div>
          </td>
          <td class="sub-text">${t.conference || 'NCAA'}</td>
          <td>${t.simData.wins}-${t.simData.losses}</td>
          <td>${t.simData.confWins}-${t.simData.confLosses}</td>
          <td class="sub-text">${t.simData.teamOvr.toFixed(1)}</td>
        </tr>`;
    });

    apHtml += `
            </tbody>
          </table>
        </div>
        ${apTop25.length > 10 ? `<button class="sim-btn sim-btn-secondary w-100 mt-1" onclick="SimEngine.toggleApTop25(this)">See More (Top 25)</button>` : ''}
      </div>`;

    standingsContainer.innerHTML = apHtml + this.renderConferenceStandings();
  },

  // Projected preseason Top 25, used before any games are played.
  renderPreseasonPoll() {
    const ranked = [...this.state.teams]
      .filter(t => t.preseasonRank)
      .sort((a, b) => a.preseasonRank - b.preseasonRank)
      .slice(0, 25);

    if (ranked.length === 0) return '';

    let html = `<div class="standings-card">
      <div class="flex-between mb-1"><h3>PRESEASON AP TOP 25</h3></div>
      <p class="sub-text-sm mb-1">Projected from roster strength and program tier — no games have been played yet.</p>
      <table class="data-table">
        <thead><tr><th>Rank</th><th>Team</th><th>Conf</th><th>Team OVR</th><th>SOS</th></tr></thead>
        <tbody>`;
    ranked.forEach((t, idx) => {
      const hidden = idx >= 10 ? 'class="ap-extra-row" style="display:none;"' : '';
      const safeSchool = t.school.replace(/'/g, "\\'");
      html += `<tr ${hidden}>
        <td class="rank-cell">#${idx + 1}</td>
        <td><div class="team-cell-wrap clickable-school" onclick="SimEngine.setTeamPageSelection('${safeSchool}')">
          <img src="${this.getTeamLogo(t.school)}" class="sm-logo"><span class="team-name-cell">${t.school}</span></div></td>
        <td class="sub-text">${t.conference || 'NCAA'}</td>
        <td class="sub-text">${(t.simData.teamOvr || 0).toFixed(1)}</td>
        <td class="sub-text">${t.sosRank ? this.ordinal(t.sosRank) : '—'}</td>
      </tr>`;
    });
    html += `</tbody></table>
      ${ranked.length > 10 ? `<button class="sim-btn sim-btn-secondary w-100 mt-1" onclick="SimEngine.toggleApTop25(this)">See More (Top 25)</button>` : ''}
      </div>`;
    return html;
  },

  renderConferenceStandings() {
    const displayConfs = this.getAllConferences();

    let confsHtml = `<h3 class="standings-header">CONFERENCE STANDINGS</h3>`;
    confsHtml += `<div class="conf-standings-grid">`;

    displayConfs.forEach(confName => {
      let confTeams = this.state.teams.filter(t => (t.conference || '').toLowerCase() === confName.toLowerCase());
      if (confTeams.length === 0) return;

      confTeams.sort((a,b) => {
        if (b.simData.confWins !== a.simData.confWins) return b.simData.confWins - a.simData.confWins;
        if (b.simData.wins !== a.simData.wins) return b.simData.wins - a.simData.wins;
        return b.simData.teamOvr - a.simData.teamOvr;
      });

      let confSafeId = confName.replace(/[^a-zA-Z0-9]/g, '_');

      confsHtml += `
        <div class="conf-card">
          <h4 class="conf-card-title">${confName}</h4>
          <div class="conf-table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>Rank</th><th>Team</th><th>Conf W-L</th><th>Overall</th></tr>
              </thead>
              <tbody>`;

      confTeams.forEach((t, idx) => {
        const isApRanked = t.apRank !== null && t.apRank <= 25;
        const hiddenClass = idx >= 5 ? `conf-row-${confSafeId}` : '';
        const rankClass = isApRanked ? 'ap-ranked-row' : '';
        const rowClasses = [hiddenClass, rankClass].filter(Boolean).join(' ');
        const rowStyle = idx >= 5 ? 'style="display:none;"' : '';
        const apTag = isApRanked ? ` <span class="ap-rank-tag">(#${t.apRank})</span>` : '';

        confsHtml += `
          <tr class="${rowClasses}" ${rowStyle}>
            <td class="bold-sub-text">${idx+1}</td>
            <td>
              <div class="team-cell-wrap clickable-school" onclick="SimEngine.openTeamModal('${t.school.replace(/'/g, "\\'")}')">
                <img src="${this.getTeamLogo(t.school)}" class="sm-logo">
                <span class="team-name-cell">${t.school}</span>${apTag}
              </div>
            </td>
            <td class="bold-text">${t.simData.confWins}-${t.simData.confLosses}</td>
            <td class="sub-text-sm">${t.simData.wins}-${t.simData.losses}</td>
          </tr>`;
      });

      confsHtml += `
              </tbody>
            </table>
          </div>`;
      if (confTeams.length > 5) {
        confsHtml += `<button class="sim-btn sim-btn-secondary btn-sm mt-1" onclick="SimEngine.toggleConfStandings('${confSafeId}', this)">See More (${confTeams.length - 5} Teams)</button>`;
      }
      confsHtml += `</div>`;
    });

    confsHtml += `</div>`;
    return confsHtml;
  },

  toggleApTop25(btn) {
    const rows = document.querySelectorAll('.ap-extra-row');
    const isExpanded = rows[0] && rows[0].style.display !== 'none';
    rows.forEach(r => r.style.display = isExpanded ? 'none' : 'table-row');
    btn.innerText = isExpanded ? 'See More (Top 25)' : 'See Less';
  },

  toggleConfStandings(confSafeId, btn) {
    const rows = document.querySelectorAll(`.conf-row-${confSafeId}`);
    const isExpanded = rows[0] && rows[0].style.display !== 'none';
    rows.forEach(r => r.style.display = isExpanded ? 'none' : 'table-row');
    btn.innerText = isExpanded ? `See More (${rows.length} Teams)` : 'See Less';
  },

  computeNationalAwards() {
    const players = [...this.state.activePlayers];
    const isPG = p => p.pos === 'PG' || (p.pos === 'G' && parseFloat(p.stats.apg) >= 3.5);
    const isSG = p => p.pos === 'SG' || (p.pos === 'G' && parseFloat(p.stats.apg) < 3.5);
    const isSF = p => p.pos === 'SF' || (p.pos === 'F' && parseFloat(p.stats.rpg) < 6.5);
    const isPF = p => p.pos === 'PF' || (p.pos === 'F' && parseFloat(p.stats.rpg) >= 6.5);
    const isC = p => p.pos === 'C' || (p.pos === 'F/C');

    const npoy = [...players].sort((a, b) => b.awardScore - a.awardScore)[0];
    const dpoy = [...players].sort((a, b) => b.defensiveScore - a.defensiveScore)[0];
    const froy = [...players].filter(p => p.class === 'FR').sort((a, b) => b.awardScore - a.awardScore)[0];
    const cousy = [...players].filter(isPG).sort((a, b) => b.awardScore - a.awardScore)[0] || npoy;
    const west = [...players].filter(isSG).sort((a, b) => b.awardScore - a.awardScore)[0] || npoy;
    const erving = [...players].filter(isSF).sort((a, b) => b.awardScore - a.awardScore)[0] || npoy;
    const malone = [...players].filter(isPF).sort((a, b) => b.awardScore - a.awardScore)[0] || npoy;
    const abdulJabbar = [...players].filter(isC).sort((a, b) => b.awardScore - a.awardScore)[0] || npoy;

    return { npoy, dpoy, froy, cousy, west, erving, malone, abdulJabbar };
  },

  // Projected honours shown from preseason onward, so the Awards tab has
  // something meaningful before any games are played.
  renderPreseasonAwards() {
    const pa = this.state.preseasonAwards;
    if (!pa || !pa.poy) return `<p class="sub-text">Start a season to generate preseason projections.</p>`;

    const card = (title, sub, player) => {
      if (!player) return '';
      const safeName = player.name.replace(/'/g, "\\'");
      const safeId = String(player.id).replace(/'/g, "\\'");
      return `<div class="award-card award-card-horizontal">
        <div class="award-heading">
          <div class="award-title">${title}</div>
          <div class="award-sub">${sub}</div>
        </div>
        <div class="award-winner">
          <img src="${this.getTeamLogo(player.school)}" class="award-logo">
          <div class="award-winner-info">
            <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${player.name}</span>
            <span class="award-winner-school">${player.school} (${player.pos} &bull; ${player.class})</span>
            <span class="award-winner-stats">Rating ${Math.round(parseFloat(player.rating))}</span>
          </div>
        </div>
      </div>`;
    };

    let html = card('Preseason Player of the Year', 'Projected from ratings', pa.poy)
             + card('Preseason Freshman of the Year', 'Top-rated incoming freshman', pa.froy);

    if (pa.allAmericans && pa.allAmericans.length) {
      const teamNames = ['First Team', 'Second Team', 'Third Team'];
      for (let t = 0; t < 3; t++) {
        const group = pa.allAmericans.slice(t * 5, t * 5 + 5);
        if (group.length === 0) continue;
        html += `<div class="award-table-card">
          <h5 class="award-table-title">Preseason All-American — ${teamNames[t]}</h5>
          ${group.map(p => {
            const safeName = p.name.replace(/'/g, "\\'");
        const safeId = String(p.id).replace(/'/g, "\\'");
            return `<div class="leader-row">
              <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${p.name}</span>
              <span class="leader-school">${p.school}</span>
              <span>${Math.round(parseFloat(p.rating))}</span>
            </div>`;
          }).join('')}
        </div>`;
      }
    }
    return html;
  },

  updateAwardsTab() {
    const preseasonEl = document.getElementById('preseasonAwardsGrid');
    if (preseasonEl) preseasonEl.innerHTML = this.renderPreseasonAwards();

    const natEl = document.getElementById('nationalAwardsGrid');
    const aaEl = document.getElementById('allAmericanContainer');
    const confEl = document.getElementById('confAwardsContainer');
    if (!natEl || !aaEl || !confEl) return;

    if (!this.state.regularSeasonDone) {
      natEl.innerHTML = `<p class="sub-text">Complete the season to calculate National Award winners.</p>`;
      aaEl.innerHTML = `<p class="sub-text">Complete the season to view All-American teams.</p>`;
      confEl.innerHTML = `<p class="sub-text">Complete the season to view conference award winners.</p>`;
      return;
    }

    const players = [...this.state.activePlayers];
    const { npoy, dpoy, froy, cousy, west, erving, malone, abdulJabbar } = this.computeNationalAwards();

    if(npoy && !npoy.accolades.includes("National POY")) npoy.accolades.push("National POY");
    if(dpoy && !dpoy.accolades.includes("National DPOY")) dpoy.accolades.push("National DPOY");

    const majorAwards = [
      { title: "National Player of the Year", sub: "Naismith / Wooden Trophy", winner: npoy, major: true },
      { title: "Defensive Player of the Year", sub: "NABC National DPOY", winner: dpoy, major: true },
      { title: "National Freshman of the Year", sub: "Wayman Tisdale Award", winner: froy, major: true },
      { title: "Bob Cousy Award", sub: "Best Point Guard", winner: cousy, major: false },
      { title: "Jerry West Award", sub: "Best Shooting Guard", winner: west, major: false },
      { title: "Julius Erving Award", sub: "Best Small Forward", winner: erving, major: false },
      { title: "Karl Malone Award", sub: "Best Power Forward", winner: malone, major: false },
      { title: "Kareem Abdul-Jabbar Award", sub: "Best Center", winner: abdulJabbar, major: false }
    ];

    let natHtml = '';
    majorAwards.forEach(a => {
      if (!a.winner) return;
      const safeName = a.winner.name.replace(/'/g, "\\'");
      natHtml += `
        <div class="award-card award-card-horizontal ${a.major ? 'major-award' : ''}">
          <div class="award-heading">
            <div class="award-title">${a.title}</div>
            <div class="award-sub">${a.sub}</div>
          </div>
          <div class="award-winner">
            <img src="${this.getTeamLogo(a.winner.school)}" class="award-logo">
            <div class="award-winner-info">
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${String(a.winner.id).replace(/'/g, "\\'")}')">${a.winner.name}</span>
              <span class="award-winner-school">${a.winner.school} (${a.winner.pos} &bull; ${a.winner.class})</span>
              <span class="award-winner-stats">${a.winner.stats.ppg} PPG, ${a.winner.stats.rpg} RPG, ${a.winner.stats.apg} APG</span>
            </div>
          </div>
        </div>
      `;
    });
    natEl.innerHTML = natHtml;

    const sortedAll = [...players].sort((a,b) => b.awardScore - a.awardScore);
    const aa1 = sortedAll.slice(0, 5);
    const aa2 = sortedAll.slice(5, 10);
    const aa3 = sortedAll.slice(10, 15);

    aa1.forEach(p => { if(!p.accolades.includes("1st Team All-American")) p.accolades.push("1st Team All-American"); });

    const renderAaCard = (teamName, teamList) => {
      let rows = '';
      teamList.forEach((p, idx) => {
        const safeName = p.name.replace(/'/g, "\\'");
        const safeId = String(p.id).replace(/'/g, "\\'");
        rows += `
          <tr>
            <td class="highlight-text">${idx + 1}</td>
            <td>
              <div class="team-cell-wrap">
                <img src="${this.getTeamLogo(p.school)}" class="xs-logo">
                <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${p.name}</span>
              </div>
            </td>
            <td>${p.school}</td>
            <td class="sub-text">${p.pos}</td>
            <td class="sub-text">${p.class}</td>
            <td class="bold-text">${p.stats.ppg}</td>
            <td>${p.stats.rpg}</td>
            <td>${p.stats.apg}</td>
            <td>${p.stats.stl}</td>
            <td>${p.stats.blk}</td>
          </tr>`;
      });
      return `
        <div class="aa-team-block">
          <h5 class="award-table-title">${teamName}</h5>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>Cl</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    };

    aaEl.innerHTML =
      renderAaCard("First Team All-American", aa1) +
      renderAaCard("Second Team All-American", aa2) +
      renderAaCard("Third Team All-American", aa3);

    this.renderConferenceAwards(this.state.selectedAwardConf);
  },

  renderConferenceAwards(confName) {
    this.state.selectedAwardConf = confName;
    const titleEl = document.getElementById('confAwardsTitle');
    const confBodyEl = document.getElementById('confAwardsContainer');
    if (!confBodyEl) return;
    if (titleEl) titleEl.innerText = `${confName} Conference Honors`;

    if (!this.state.regularSeasonDone) {
      confBodyEl.innerHTML = `<p class="sub-text">Complete the season to view conference awards.</p>`;
      return;
    }

    const confPlayers = this.state.activePlayers.filter(p => this.matchesConfFilter(p.conference, confName));
    if (confPlayers.length === 0) {
      confBodyEl.innerHTML = `<p class="sub-text">No players found for conference: ${confName}</p>`;
      return;
    }

    const sortedConf = [...confPlayers].sort((a,b) => b.awardScore - a.awardScore);
    const sortedDef = [...confPlayers].sort((a,b) => b.defensiveScore - a.defensiveScore);
    const sortedFresh = [...confPlayers].filter(p => p.class === 'FR').sort((a,b) => b.awardScore - a.awardScore);
    const sorted6m = [...confPlayers].filter(p => p.isBench).sort((a,b) => b.awardScore - a.awardScore);

    const cpoy = sortedConf[0];
    const cdpoy = sortedDef[0];
    const croty = sortedFresh[0] || sortedConf[1];
    const c6moy = sorted6m[0] || sortedConf[4];

    if(cpoy && !cpoy.accolades.includes(`${confName} POY`)) cpoy.accolades.push(`${confName} POY`);
    
    const conf1st = sortedConf.slice(0, 5);
    const conf2nd = sortedConf.slice(5, 10);
    const confFreshTeam = sortedFresh.slice(0, 5);

    const safeN = p => p.name.replace(/'/g, "\\'");
    const safeI = p => String(p.id).replace(/'/g, "\\'");

    let html = `
      <div class="awards-grid">
        <div class="award-card major-award">
          <div class="award-title">Player of the Year</div>
          <div class="award-sub">${confName} POY</div>
          <div class="award-winner">
            <img src="${this.getTeamLogo(cpoy.school)}" class="award-logo">
            <div class="award-winner-info">
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeI(cpoy)}')">${cpoy.name}</span>
              <span class="award-winner-school">${cpoy.school} &bull; ${cpoy.stats.ppg} PPG, ${cpoy.stats.rpg} RPG</span>
            </div>
          </div>
        </div>

        <div class="award-card">
          <div class="award-title">Defensive Player of the Year</div>
          <div class="award-sub">${confName} DPOY</div>
          <div class="award-winner">
            <img src="${this.getTeamLogo(cdpoy.school)}" class="award-logo">
            <div class="award-winner-info">
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeI(cdpoy)}')">${cdpoy.name}</span>
              <span class="award-winner-school">${cdpoy.school} &bull; ${cdpoy.stats.stl} SPG, ${cdpoy.stats.blk} BPG</span>
            </div>
          </div>
        </div>

        <div class="award-card">
          <div class="award-title">Rookie of the Year</div>
          <div class="award-sub">${confName} ROTY / Freshman of Year</div>
          <div class="award-winner">
            <img src="${this.getTeamLogo(croty.school)}" class="award-logo">
            <div class="award-winner-info">
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeI(croty)}')">${croty.name}</span>
              <span class="award-winner-school">${croty.school} &bull; ${croty.stats.ppg} PPG</span>
            </div>
          </div>
        </div>

        <div class="award-card">
          <div class="award-title">Sixth Man of the Year</div>
          <div class="award-sub">${confName} 6MOY</div>
          <div class="award-winner">
            <img src="${this.getTeamLogo(c6moy.school)}" class="award-logo">
            <div class="award-winner-info">
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeI(c6moy)}')">${c6moy.name}</span>
              <span class="award-winner-school">${c6moy.school} &bull; ${c6moy.stats.ppg} PPG</span>
            </div>
          </div>
        </div>
      </div>

      <div class="all-american-container">
        ${this.renderConfTeamTable("1st Team All-" + confName, conf1st)}
        ${this.renderConfTeamTable("2nd Team All-" + confName, conf2nd)}
        ${this.renderConfTeamTable("All-Freshman Team", confFreshTeam)}
      </div>
    `;

    // All-Defensive team, picked on defensive impact rather than scoring.
    const defPool = [...confPlayers]
      .filter(p => parseFloat(p.stats.mpg) >= 12)
      .sort((x, y) => y.defensiveScore - x.defensiveScore)
      .slice(0, 5);

    if (defPool.length) {
      html += `<div class="award-table-card">
        <h5 class="award-table-title">${confName} All-Defensive Team</h5>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>SPG</th><th>BPG</th><th>DBPM</th></tr></thead>
          <tbody>${defPool.map((p, i) => `<tr>
            <td class="highlight-text">${i + 1}</td>
            <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeI(p)}')">${p.name}</span></td>
            <td class="sub-text">${p.school}</td>
            <td class="sub-text">${p.pos}</td>
            <td class="bold-text">${p.stats.stl}</td>
            <td class="bold-text">${p.stats.blk}</td>
            <td>${p.stats.dbpm}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    }

    confBodyEl.innerHTML = html;
  },

  renderConfTeamTable(title, playerList) {
    let rows = '';
    playerList.forEach((p, idx) => {
      const safeName = p.name.replace(/'/g, "\\'");
        const safeId = String(p.id).replace(/'/g, "\\'");
      rows += `
        <tr>
          <td class="bold-sub-text">${idx+1}</td>
          <td>
            <div class="team-cell-wrap">
              <img src="${this.getTeamLogo(p.school)}" class="xs-logo">
              <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${p.name}</span>
            </div>
          </td>
          <td>${p.school}</td>
          <td class="sub-text">${p.pos}</td>
          <td class="bold-text">${p.stats ? p.stats.ppg : '0.0'} PPG</td>
        </tr>`;
    });

    return `
      <div class="award-table-card">
        <h5 class="award-table-title">${title}</h5>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>PPG</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" class="empty-table-msg">No qualifying players</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  openTeamModal(schoolName) {
    let team = this.state.teams.find(t => t.school === schoolName);
    if (!team) return;

    let rank = team.apRank;
    if (!document.getElementById('modalTeamLogo')) return;
    document.getElementById('modalTeamLogo').src = this.getTeamLogo(team.school);
    document.getElementById('modalTeamName').innerText = team.school;
    document.getElementById('modalTeamYear').innerText = `${this.state.year}-${(this.state.year+1).toString().slice(2)}`;
    
    if (this.state.week > 0) {
      if (this.state.regularSeasonDone && rank && rank <= 25) {
        document.getElementById('modalTeamRank').style.display = 'block';
        document.getElementById('modalTeamRank').innerText = `#${rank}`;
      } else {
        document.getElementById('modalTeamRank').style.display = 'none';
      }

      document.getElementById('modalTeamRecord').innerText = `${team.simData.wins}-${team.simData.losses}`;
      document.getElementById('modalConfRecord').innerText = `${team.simData.confWins}-${team.simData.confLosses}`;

      const playedGames = this.state.schedule.filter(g => g.played && g.result && (g.home === team.school || g.away === team.school));
      const gp = playedGames.length || 1;
      let ownPtsTotal = 0, oppPtsTotal = 0;
      playedGames.forEach(g => {
        const isHome = g.home === team.school;
        ownPtsTotal += isHome ? g.result.homeScore : g.result.awayScore;
        oppPtsTotal += isHome ? g.result.awayScore : g.result.homeScore;
      });
      document.getElementById('modalTeamPPG').innerText = (ownPtsTotal / gp).toFixed(1);
      document.getElementById('modalOppPPG').innerText = (oppPtsTotal / gp).toFixed(1);
    } else {
      document.getElementById('modalTeamRank').style.display = 'none';
      document.getElementById('modalTeamRecord').innerText = "0-0";
      document.getElementById('modalConfRecord').innerText = "0-0";
      document.getElementById('modalTeamPPG').innerText = "0.0";
      document.getElementById('modalOppPPG').innerText = "0.0";
    }

    let rPlayers = this.state.activePlayers.filter(p => p.school === schoolName);
    if (this.state.week > 0) {
      rPlayers.sort((a,b) => parseFloat(b.stats.mpg) - parseFloat(a.stats.mpg));
    }
    
    let rHtml = '';
    rPlayers.forEach((p, idx) => {
      let statsStr = this.state.week > 0 ? `<span class="player-modal-substat">${p.stats.ppg} PPG | ${p.stats.mpg} MPG</span>` : '';
      const safeName = p.name.replace(/'/g, "\\'");
        const safeId = String(p.id).replace(/'/g, "\\'");
      rHtml += `
        <tr>
          <td class="jersey-num">${p.jersey ? '#' + p.jersey : '—'}</td>
          <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${p.name}</span> ${statsStr}</td>
          <td>${p.pos}</td>
          <td>${p.class}</td>
          <td>${p.ht}</td>
          <td>${p.wt}</td>
          <td>${p.hometown}</td>
          <td><span class="draft-projection">Active</span></td>
        </tr>
      `;
    });
    
    document.getElementById('modalRosterBody').innerHTML = rHtml;
    document.getElementById('teamModal').classList.add('active');
  },

  closeTeamModal() {
    document.getElementById('teamModal').classList.remove('active');
  },

  // Opens a full-page player profile rather than a floating card. The
  // profile takes over the content area the way the offseason screen does,
  // so there's room to lay stats out across the full width.
  openPlayerModal(playerName) {
    this.openPlayerPage(playerName);
  },

  // Accepts an id or a name. Ids are unique; names are not — two generated
  // players at different schools can share one, and matching by name meant
  // clicking one opened the other's profile.
  openPlayerPage(idOrName) {
    const player = this.findPlayerRef(idOrName);
    if (!player) return;
    this.pushNav({ type: 'player', key: player.id || player.name, label: player.name });
    this.renderPlayerInPlace(player.id || player.name);
  },

  findPlayerRef(idOrName) {
    const pool = this.state.activePlayers.concat(this.state.recruits || []);
    return pool.find(p => p.id === idOrName) || pool.find(p => p.name === idOrName);
  },

  renderPlayerInPlace(idOrName) {
    const player = this.findPlayerRef(idOrName);
    if (!player) return;

    const overlay = document.getElementById('playerPage');
    const body = document.getElementById('playerPageBody');
    if (!overlay || !body) return;

    body.innerHTML = this.renderPlayerPage(player);
    overlay.style.display = 'block';
    document.body.classList.add('player-page-open');
    if (typeof window.scrollTo === 'function') {
      try { window.scrollTo(0, 0); } catch (e) { /* not available in every host */ }
    }
  },

  closePlayerPage() {
    const overlay = document.getElementById('playerPage');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('player-page-open');
  },

  // Shared full-width stat table used for both the current season and each
  // archived season, so a career reads consistently top to bottom.
  playerStatTable(rowsData, mode) {
    const cols = mode === 'adv'
      ? [['bpm','BPM'],['obpm','OBPM'],['dbpm','DBPM'],['tsPct','TS%'],['eFgPct','eFG%'],['rTsPct','rTS%'],
         ['orebPct','OREB%'],['drebPct','DREB%'],['trbPct','TRB%'],['astPct','AST%'],['tovPct','TOV%'],
         ['blkPct','BLK%'],['usg','USG%'],['ftr','FTr'],['threePar','3PAr'],['ortg','ORtg'],['drtg','DRtg'],['netRtg','Net']]
      : mode === 'p40'
      ? [['p40pts','PTS'],['p40oreb','OREB'],['p40dreb','DREB'],['p40reb','REB'],['p40ast','AST'],
         ['p40stl','STL'],['p40blk','BLK'],['p40tov','TOV'],['p40pf','PF'],['p40fga','FGA'],
         ['p40threePa','3PA'],['p40fta','FTA']]
      : [['gp','GP'],['gs','GS'],['mpg','MPG'],['ppg','PPG'],['oreb','OREB'],['dreb','DREB'],['rpg','RPG'],
         ['apg','APG'],['stl','SPG'],['blk','BPG'],['tov','TOV'],['pf','PF'],['fgm','FGM'],['fga','FGA'],
         ['fgPct','FG%'],['threePm','3PM'],['threePa','3PA'],['threePPct','3P%'],['ftm','FTM'],['fta','FTA'],['ftPct','FT%']];

    const head = `<tr><th>Season</th><th>School</th><th>Class</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>`;
    const body = rowsData.map(r => {
      const st = r.stats || {};
      const safeSchool = String(r.school || '').replace(/'/g, "\\'");
      return `<tr>
        <td class="bold-text">${r.year}-${(r.year + 1).toString().slice(2)}</td>
        <td><span class="clickable-school" onclick="SimEngine.goToTeamFromPlayer('${safeSchool}')">${r.school || '—'}</span></td>
        <td class="sub-text">${r.class || '—'}</td>
        ${cols.map(c => `<td>${st[c[0]] !== undefined ? st[c[0]] : '—'}</td>`).join('')}
      </tr>`;
    }).join('');

    return `<div class="table-scroll"><table class="data-table player-career-table">
      <thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  },

  goToTeamFromPlayer(school) {
    this.closePlayerPage();
    this.goToTeamPage(school);
  },

  renderPlayerPage(player) {
    const st = player.stats || this.getZeroStats();
    const posNames = { PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward',
                       PF: 'Power Forward', C: 'Center', G: 'Guard', F: 'Forward', 'F/C': 'Forward/Center' };
    const classNames = { FR: 'Freshman', SO: 'Sophomore', JR: 'Junior', SR: 'Senior', GR: 'Graduate Student' };

    const bioRow = (label, value) =>
      value ? `<div class="bio-row"><span class="bio-label">${label}</span><span class="bio-value">${value}</span></div>` : '';

    const colleges = (player.collegeHistory && player.collegeHistory.length)
      ? player.collegeHistory : (player.school ? [player.school] : []);
    const collegeLinks = colleges
      .map(c => `<span class="clickable-school" onclick="SimEngine.goToTeamFromPlayer('${c.replace(/'/g, "\\'")}')">${c}</span>`)
      .join(', ');

    const accolades = player.accolades || [];
    const preseason = accolades.filter(a => /preseason/i.test(a));
    const postseason = accolades.filter(a => !/preseason/i.test(a));

    // Career table: every archived season plus the one in progress.
    const seasons = [...(player.seasonHistory || [])];
    if (st.gp > 0 && !seasons.some(h => h.year === this.state.year)) {
      seasons.push({ year: this.state.year, school: player.school, class: player.class, stats: st });
    }
    seasons.sort((a, b) => a.year - b.year);

    const careerBlock = seasons.length === 0
      ? `<p class="sub-text">No games played yet this season.</p>`
      : `<h3 class="uppercase-title mt-2">Box Score</h3>${this.playerStatTable(seasons, 'box')}
         <h3 class="uppercase-title mt-2">Advanced</h3>${this.playerStatTable(seasons, 'adv')}
         <h3 class="uppercase-title mt-2">Per 40 Minutes</h3>${this.playerStatTable(seasons, 'p40')}`;

    // Game log — no week column; the opponent identifies the game.
    let glRows = '';
    if (player.gameLog && player.gameLog.length) {
      player.gameLog.forEach(g => {
        const matchup = g.opponent
          ? `${g.isHome ? 'vs' : '@'} ${g.opponent}`
          : (g.isConf ? 'Conf' : 'Non-Conf');
        const result = g.teamScore !== undefined
          ? `<span class="${g.won ? 'win-text' : 'loss-text'}">${g.won ? 'W' : 'L'}</span> ${g.teamScore}-${g.oppScore}`
          : '—';
        glRows += `<tr>
          <td class="sub-text-sm">${matchup}</td>
          <td class="sub-text-sm">${result}</td>
          <td>${g.min}</td><td class="highlight-col">${g.pts}</td>
          <td>${g.oreb !== undefined ? g.oreb : '—'}</td><td>${g.reb}</td><td>${g.ast}</td>
          <td>${g.stl}</td><td>${g.blk}</td><td>${g.tov}</td>
          <td>${g.fgm}-${g.fga}</td><td>${g.threePm}-${g.threePa}</td><td>${g.ftm}-${g.fta}</td>
        </tr>`;
      });
    } else {
      glRows = `<tr><td colspan="13" class="empty-table-msg">No games played yet.</td></tr>`;
    }

    return `
      <div class="player-page-head">
        <img src="${this.getTeamLogo(player.school)}" class="player-page-logo">
        <div class="player-page-ident">
          <h1 class="player-page-name">${player.jersey ? '#' + player.jersey + ' ' : ''}${player.name}</h1>
          <div class="player-bio-block">
            ${bioRow('Position', posNames[player.pos] || player.pos)}
            ${bioRow('Class', classNames[player.class] || player.class)}
            ${bioRow('Height', player.ht)}
            ${bioRow('Weight', player.wt ? player.wt + ' lb' : '')}
            ${bioRow('School', collegeLinks)}
            ${bioRow('Hometown', player.hometown && player.hometown !== 'N/A' ? player.hometown : '')}
            ${bioRow('High School', player.hs)}
            ${bioRow('RSCI Rank', player.rsci
              ? '#' + Math.round(player.rsci) + (player.recClassYear ? ' (' + player.recClassYear + ')' : '')
              : 'Unranked')}
          </div>
        </div>
        <button class="sim-btn sim-btn-secondary" onclick="SimEngine.closePlayerPage()">Close</button>
      </div>

      ${(preseason.length || postseason.length) ? `<div class="player-accolade-block">
        ${preseason.length ? `<div><span class="accolade-tag preseason">Preseason</span> ${preseason.join(' • ')}</div>` : ''}
        ${postseason.length ? `<div><span class="accolade-tag postseason">Honors</span> ${postseason.join(' • ')}</div>` : ''}
      </div>` : ''}

      <div class="team-stats-grid mt-1">
        <div class="stat-box"><span class="stat-label">PPG</span><span class="stat-value">${st.ppg}</span></div>
        <div class="stat-box"><span class="stat-label">RPG</span><span class="stat-value">${st.rpg}</span></div>
        <div class="stat-box"><span class="stat-label">APG</span><span class="stat-value">${st.apg}</span></div>
        <div class="stat-box"><span class="stat-label">FG%</span><span class="stat-value">${st.fgPct}</span></div>
      </div>

      ${careerBlock}

      <h3 class="uppercase-title mt-2">Game Log <span class="sub-text-sm">(${this.state.year}-${(this.state.year + 1).toString().slice(2)})</span></h3>
      <div class="table-scroll"><table class="data-table">
        <thead><tr>
          <th>Opponent</th><th>Result</th><th>MIN</th><th class="highlight-col">PTS</th>
          <th>OREB</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th>
          <th>FGM-A</th><th>3PM-A</th><th>FTM-A</th>
        </tr></thead>
        <tbody>${glRows}</tbody>
      </table></div>`;
  },

  closePlayerModal() {
    document.getElementById('playerModal').classList.remove('active');
  },

  logNews(msg) {
    const feed = document.getElementById('newsFeed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'news-item';
    item.innerText = msg;
    feed.prepend(item);
  },

  // --- Schedule & Postseason rendering ---

  updateScheduleTab() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    if (this.state.week === 0 && this.state.schedule.length === 0) {
      container.innerHTML = `<p class="empty-table-msg">Simulate the season to generate a schedule.</p>`;
      return;
    }

    const maxViewableWeek = Math.max(1, this.state.week || 1);
    if (!this.state.scheduleViewWeek || this.state.scheduleViewWeek > maxViewableWeek) {
      this.state.scheduleViewWeek = maxViewableWeek;
    }
    const viewWeek = this.state.scheduleViewWeek;

    const confList = [...new Set(this.state.teams.map(t => (t.conference || 'NCAA').trim()))].filter(Boolean).sort();

    let filtersHtml = `<div class="filters-container mb-1">`;
    filtersHtml += `<select id="scheduleWeekSelect" class="filter-select" onchange="SimEngine.setScheduleWeek(this.value)">`;
    for (let w = 1; w <= maxViewableWeek; w++) {
      const label = w > this.state.nonConfEnd ? `Conf Wk ${w}` : `Non-Conf Wk ${w}`;
      filtersHtml += `<option value="${w}" ${w === viewWeek ? 'selected' : ''}>${label}</option>`;
    }
    filtersHtml += `</select>`;

    filtersHtml += `<select id="scheduleConfSelect" class="filter-select" onchange="SimEngine.setScheduleConfFilter(this.value)">`;
    filtersHtml += `<option value="ALL" ${this.state.scheduleConfFilter === 'ALL' ? 'selected' : ''}>All Conferences</option>`;
    confList.forEach(c => {
      filtersHtml += `<option value="${c}" ${this.state.scheduleConfFilter === c ? 'selected' : ''}>${c}</option>`;
    });
    filtersHtml += `</select>`;

    filtersHtml += `<select id="scheduleTop25Select" class="filter-select" onchange="SimEngine.setScheduleTop25Only(this.value)">`;
    filtersHtml += `<option value="0" ${!this.state.scheduleTop25Only ? 'selected' : ''}>All Games</option>`;
    filtersHtml += `<option value="1" ${this.state.scheduleTop25Only ? 'selected' : ''}>AP Top 25 Only</option>`;
    filtersHtml += `</select>`;
    filtersHtml += `</div>`;

    let games = this.state.schedule.filter(g => g.week === viewWeek);

    if (this.state.scheduleConfFilter !== 'ALL') {
      games = games.filter(g => {
        const homeTeam = this.findTeam(g.home);
        const awayTeam = this.findTeam(g.away);
        return (homeTeam && homeTeam.conference === this.state.scheduleConfFilter) ||
               (awayTeam && awayTeam.conference === this.state.scheduleConfFilter);
      });
    }

    let top25Unavailable = false;
    if (this.state.scheduleTop25Only) {
      const anyRanked = this.state.teams.some(t => t.apRank !== null && t.apRank !== undefined && t.apRank <= 25);
      if (!anyRanked) {
        top25Unavailable = true;
        games = [];
      } else {
        games = games.filter(g => {
          const homeTeam = this.findTeam(g.home);
          const awayTeam = this.findTeam(g.away);
          const homeRanked = homeTeam && homeTeam.apRank !== null && homeTeam.apRank !== undefined && homeTeam.apRank <= 25;
          const awayRanked = awayTeam && awayTeam.apRank !== null && awayTeam.apRank !== undefined && awayTeam.apRank <= 25;
          return homeRanked || awayRanked;
        });
      }
    }

    let gamesHtml = `<div class="schedule-pill-list">`;
    if (top25Unavailable) {
      gamesHtml += `<p class="empty-table-msg">AP rankings aren't available until the regular season ends.</p>`;
    } else if (games.length === 0) {
      gamesHtml += `<p class="empty-table-msg">No games match these filters this week.</p>`;
    } else {
      games.forEach(g => {
        const homeTeam = this.findTeam(g.home);
        const awayTeam = this.findTeam(g.away);
        const homeSafe = (homeTeam ? homeTeam.school : g.home).replace(/'/g, "\\'");
        const awaySafe = (awayTeam ? awayTeam.school : g.away).replace(/'/g, "\\'");
        const homeRankTag = (homeTeam && homeTeam.apRank && homeTeam.apRank <= 25) ? `<span class="ap-rank-tag">#${homeTeam.apRank}</span> ` : '';
        const awayRankTag = (awayTeam && awayTeam.apRank && awayTeam.apRank <= 25) ? `<span class="ap-rank-tag">#${awayTeam.apRank}</span> ` : '';

        let resultHtml = `<span class="schedule-pill-pending">Not yet played</span>`;
        if (g.played && g.result) {
          const homeWin = g.result.homeScore > g.result.awayScore;
          resultHtml = `<span class="schedule-pill-result">
            <span class="${homeWin ? 'loss' : 'win'}">${g.result.awayScore}</span> - <span class="${homeWin ? 'win' : 'loss'}">${g.result.homeScore}</span>
          </span>`;
        }

        gamesHtml += `
          <div class="schedule-pill">
            <div class="schedule-pill-matchup">
              <img src="${this.getTeamLogo(g.away)}" class="xs-logo">
              ${awayRankTag}<span class="clickable-school" onclick="SimEngine.openTeamModal('${awaySafe}')">${g.away}</span>
              <span class="schedule-pill-at">at</span>
              <img src="${this.getTeamLogo(g.home)}" class="xs-logo">
              ${homeRankTag}<span class="clickable-school" onclick="SimEngine.openTeamModal('${homeSafe}')">${g.home}</span>
            </div>
            ${resultHtml}
          </div>`;
      });
    }
    gamesHtml += `</div>`;

    container.innerHTML = filtersHtml + gamesHtml;
  },

  setScheduleConfFilter(val) {
    this.state.scheduleConfFilter = val;
    this.updateScheduleTab();
  },

  setScheduleTop25Only(val) {
    this.state.scheduleTop25Only = val === '1';
    this.updateScheduleTab();
  },

  setScheduleWeek(weekNum) {
    this.state.scheduleViewWeek = parseInt(weekNum, 10);
    this.updateScheduleTab();
  },

  updatePostseasonTab() {
    const container = document.getElementById('postseasonContainer');
    if (!container) return;

    if (!this.state.regularSeasonDone) {
      container.innerHTML = `<p class="empty-table-msg">Complete the regular season to unlock Conference Championships and the NCAA Tournament.</p>`;
      return;
    }

    let html = '';

    // The national bracket is the headline event, so it sits at the top
    // as soon as it exists.
    if (this.state.ncaaTournament) {
      html += `<h4 class="award-section-title">NCAA Tournament</h4>`;
      html += this.renderBracketVisual(this.state.ncaaTournament, true);
    } else if (this.state.confChampsDone) {
      html += `<h4 class="award-section-title">Selection Day</h4>`;
      html += this.renderSelectionField();
    }

    const entries = Object.entries(this.state.confTournaments);
    if (entries.length === 0) {
      html += `<h4 class="award-section-title mt-2">Conference Championships</h4><p class="sub-text">Not yet simulated.</p>`;
    } else {
      // High majors first, then everyone else alphabetically.
      entries.sort((a, b) => {
        const ha = this.isHighMajor(a[0]) ? 0 : 1;
        const hb = this.isHighMajor(b[0]) ? 0 : 1;
        if (ha !== hb) return ha - hb;
        return a[0].localeCompare(b[0]);
      });
      html += `<h4 class="award-section-title mt-2">Conference Championships</h4>`;
      entries.forEach(([confName, bracket]) => {
        html += `<div class="conf-bracket-block ${this.isHighMajor(confName) ? 'high-major' : ''}">
          ${this.renderBracketVisual(bracket, false, confName)}
        </div>`;
      });
    }

    container.innerHTML = html;
  },

  // --- Navigation history ---
  //
  // A single stack of visited views so one Back control works everywhere,
  // instead of each page needing its own bespoke "back to X" link. Each
  // entry knows how to restore itself.

  navStack: [],

  pushNav(entry) {
    const top = this.navStack[this.navStack.length - 1];
    // Don't stack the same view twice in a row.
    if (top && top.type === entry.type && top.key === entry.key) return;
    this.navStack.push(entry);
    if (this.navStack.length > 40) this.navStack.shift();
    this.updateBackButton();
  },

  updateBackButton() {
    const btn = document.getElementById('navBackBtn');
    if (!btn) return;
    // The top of the stack is where you are now; anything beneath it is
    // somewhere you can go back to.
    const canGoBack = this.navStack.length > 1;
    btn.style.display = canGoBack ? 'inline-flex' : 'none';
    if (canGoBack) {
      const prev = this.navStack[this.navStack.length - 2];
      btn.title = `Back to ${prev.label}`;
      const labelEl = document.getElementById('navBackLabel');
      if (labelEl) labelEl.innerText = prev.label;
    }
  },

  navigateBack() {
    if (this.navStack.length < 2) return;
    this.navStack.pop();                       // leave the current view
    const prev = this.navStack[this.navStack.length - 1];
    this.restoreNav(prev);
    this.updateBackButton();
  },

  restoreNav(entry) {
    if (!entry) return;
    if (entry.type === 'player') {
      this.renderPlayerInPlace(entry.key);
      return;
    }
    this.closePlayerPage();
    if (entry.type === 'team') {
      this.state.teamPageSelection = entry.key;
      this.state.teamPageView = entry.view || 'team';
      this.updateTeamTab();
      this.activateTabSilently('teamTab');
    } else if (entry.type === 'tab') {
      this.activateTabSilently(entry.key);
    }
  },

  // Switches tabs without pushing a new history entry (used when going
  // back, so Back doesn't just bounce between two views forever).
  activateTabSilently(tabId) {
    this._suppressNav = true;
    if (window.UIController && typeof UIController.activateTab === 'function') {
      UIController.activateTab(tabId);
    }
    this._suppressNav = false;
  },

  // --- Team Page ---

  setTeamPageSelection(school) {
    this.state.teamPageSelection = school;
    this.state.teamPageView = school ? 'team' : 'index';
    this.updateTeamTab();
  },

  setTeamPageView(view) {
    this.state.teamPageView = view;
    this.updateTeamTab();
    if (this.state.teamPageSelection) {
      this.pushNav({ type: 'team', key: this.state.teamPageSelection, view,
        label: `${this.state.teamPageSelection}${view === 'gamelog' ? ' game log' : view === 'history' ? ' history' : ''}` });
    }
  },

  backToTeamIndex() {
    this.state.teamPageSelection = '';
    this.state.teamPageView = 'index';
    this.updateTeamTab();
  },

  updateTeamTab() {
    const container = document.getElementById('teamPageContainer');
    if (!container) return;

    if (this.state.teams.length === 0) {
      container.innerHTML = `<p class="empty-table-msg">Start a save to browse teams.</p>`;
      return;
    }

    const team = this.state.teamPageSelection
      ? this.state.teams.find(t => t.school === this.state.teamPageSelection)
      : null;

    if (!team) {
      container.innerHTML = this.renderTeamIndex();
      return;
    }

    if (this.state.teamPageView === 'history') container.innerHTML = this.renderTeamHistoryView(team);
    else if (this.state.teamPageView === 'gamelog') container.innerHTML = this.renderTeamGameLog(team);
    else container.innerHTML = this.renderTeamDetail(team);
  },

  // Landing view: every school grouped under its conference, with the
  // conference logo as the section header. This is the default Team page.
  renderTeamIndex() {
    const byConf = {};
    this.state.teams.forEach(t => {
      const c = t.conference || 'Independent';
      if (!byConf[c]) byConf[c] = [];
      byConf[c].push(t);
    });

    let html = `<p class="sub-text mb-1-5">Select a school to open its team page.</p>`;
    Object.keys(byConf).sort().forEach(conf => {
      const teams = byConf[conf].sort((a, b) => a.school.localeCompare(b.school));
      html += `<div class="conf-section">
        <div class="conf-section-header">
          ${this.getConferenceLogoImg(conf, 'conf-logo')}
          <h4 class="conf-section-title">${conf}</h4>
          <span class="sub-text-sm">${teams.length} teams</span>
        </div>
        <div class="conf-team-grid">`;
      teams.forEach(t => {
        const safe = t.school.replace(/'/g, "\\'");
        html += `<button class="team-index-card" onclick="SimEngine.setTeamPageSelection('${safe}')">
          <img src="${this.getTeamLogo(t.school)}" class="sm-logo">
          <span class="team-index-name">${t.school}</span>
        </button>`;
      });
      html += `</div></div>`;
    });
    return html;
  },

  // Short human summary of how a team's season ended.
  getSeasonResultText(team) {
    if (team.wonNationalTitle) return 'Won the National Championship';
    if (this.state.ncaaDone && team.ncaaSeed) {
      const b = this.state.ncaaTournament;
      if (b) {
        let lastRoundReached = 'Round of 64';
        const names = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship Game'];
        b.rounds.forEach((round, i) => {
          if (round.some(g => g.teamA.school === team.school || g.teamB.school === team.school)) {
            lastRoundReached = names[i] || `Round ${i + 1}`;
          }
        });
        return `Eliminated in the ${lastRoundReached} (#${team.ncaaSeed} seed)`;
      }
    }
    if (this.state.ncaaDone) return 'Did not make the NCAA Tournament';
    if (team.wonConfTourney) return 'Won the conference tournament';
    if (this.state.confChampsDone) return 'Eliminated in the conference tournament';
    if (this.state.regularSeasonDone) return 'Regular season complete — awaiting conference tournaments';
    if (this.state.week > 0) return `In progress — Week ${this.state.week}`;
    return 'Preseason';
  },

  renderTeamDetail(team) {
    const safe = team.school.replace(/'/g, "\\'");
    const allRows = this.computeAllTeamStats();
    const row = allRows.find(r => r.school === team.school) || { stats: this.computeTeamStats(team), ranks: {} };
    const st = row.stats, rk = row.ranks || {};
    const apTag = (this.state.regularSeasonDone && team.apRank && team.apRank <= 25)
      ? `<span class="ap-rank-tag">AP #${team.apRank}</span>` : '';

    const statCell = (label, value, rankKey) => `
      <div class="team-stat-cell">
        <span class="team-stat-label">${label}</span>
        <span class="team-stat-value">${value}</span>
        <span class="team-stat-rank">${rk[rankKey] ? this.ordinal(rk[rankKey]) : '—'}</span>
      </div>`;

    let html = `
      <button class="outline-btn mb-1" onclick="SimEngine.backToTeamIndex()">&larr; All Teams</button>
      <div class="team-header">
        <img src="${this.getTeamLogo(team.school)}" class="team-logo">
        <div class="team-title-block">
          <div class="modal-team-title-wrap">
            <h2 class="modal-team-name">${team.school}</h2>${apTag}
          </div>
          <span class="modal-team-year">
            ${this.getConferenceLogoImg(team.conference, 'conf-logo-sm')} ${team.conference}
            &bull; ${this.state.year}-${(this.state.year + 1).toString().slice(2)}
          </span>
        </div>
      </div>

      ${team.coach ? `<div class="coach-card mb-1-5">
        <div class="coach-head">
          <span class="coach-label">Head Coach</span>
          <span class="coach-name">${team.coach.name}</span>
        </div>
        ${team.coachTags && team.coachTags.length ? `<div class="coach-tags">${team.coachTags.map(t => `<span class="coach-tag">${t}</span>`).join('')}</div>` : ''}
        ${team.coach.style ? `<p class="coach-style">${team.coach.style}</p>` : ''}
      </div>` : ''}

      <div class="team-stats-grid mb-1-5">
        <div class="stat-box"><span class="stat-label">RECORD</span><span class="stat-value">${team.simData.wins}-${team.simData.losses}</span><span class="sub-text-sm">(${team.simData.confWins}-${team.simData.confLosses} conf)</span></div>
        <div class="stat-box"><span class="stat-label">PRESEASON</span><span class="stat-value">${team.preseasonRank ? '#' + team.preseasonRank : '—'}</span><span class="sub-text-sm">roster strength</span></div>
        <div class="stat-box"><span class="stat-label">SOS</span><span class="stat-value">${team.sosRank ? this.ordinal(team.sosRank) : '—'}</span><span class="sub-text-sm">of ${this.state.teams.length}</span></div>
        <div class="stat-box"><span class="stat-label">GAMES</span><span class="stat-value">${st.gp}</span><span class="sub-text-sm">played</span></div>
      </div>

      <div class="season-result-banner mb-1-5">${this.getSeasonResultText(team)}</div>

      <div class="flex-between wrap-gap mb-1">
        <h3 class="uppercase-title">Team Statistics</h3>
        <button class="outline-btn btn-sm" onclick="SimEngine.setTeamPageView('gamelog')">View Game Log &rarr;</button>
      </div>
      <p class="sub-text-sm mb-1">Small number under each stat is this team's national rank.</p>
      <div class="team-stat-cell-grid mb-1-5">
        ${statCell('PPG', st.ppg, 'ppg')}
        ${statCell('OPP PPG', st.oppPpg, 'oppPpg')}
        ${statCell('DIFF', st.diff, 'diff')}
        ${statCell('OREB', st.oreb, 'oreb')}
        ${statCell('DREB', st.dreb, 'dreb')}
        ${statCell('RPG', st.rpg, 'rpg')}
        ${statCell('APG', st.apg, 'apg')}
        ${statCell('SPG', st.stl, 'stl')}
        ${statCell('BPG', st.blk, 'blk')}
        ${statCell('TOV', st.tov, 'tov')}
        ${statCell('PF', st.pf, 'pf')}
        ${statCell('FGM', st.fgm, 'fgm')}
        ${statCell('FGA', st.fga, 'fga')}
        ${statCell('FG%', st.fgPct, 'fgPct')}
        ${statCell('3PM', st.threePm, 'threePm')}
        ${statCell('3PA', st.threePa, 'threePa')}
        ${statCell('3P%', st.threePPct, 'threePPct')}
        ${statCell('FTM', st.ftm, 'ftm')}
        ${statCell('FTA', st.fta, 'fta')}
        ${statCell('FT%', st.ftPct, 'ftPct')}
      </div>

      <h4 class="award-section-title">Advanced</h4>
      <div class="team-stat-cell-grid mb-1-5">
        ${statCell('ORtg', st.ortg, 'ortg')}
        ${statCell('DRtg', st.drtg, 'drtg')}
        ${statCell('Net', st.netRtg, 'netRtg')}
        ${statCell('Pace', st.pace, 'pace')}
        ${statCell('eFG%', st.eFgPct, 'eFgPct')}
        ${statCell('TS%', st.tsPct, 'tsPct')}
        ${statCell('A/TO', st.astToRatio, 'astToRatio')}
        ${statCell('3PAr', st.threePar, 'threePar')}
        ${statCell('FTr', st.ftr, 'ftr')}
      </div>
    `;

    html += this.renderTeamPlayerTable(team, 'box');
    html += this.renderTeamPlayerTable(team, 'adv');
    html += `<button class="outline-btn mt-1" onclick="SimEngine.setTeamPageView('history')">Team History &rarr;</button>`;
    return html;
  },

  // Full player table for a single team — 'box' for box score stats,
  // 'adv' for the advanced metrics, matching the league-wide leaderboards.
  renderTeamPlayerTable(team, mode) {
    const cols = mode === 'box'
      ? [['jersey','#'],['name','Player'],['pos','Pos'],['class','Cl'],['gp','GP'],['gs','GS'],['mpg','MPG'],['ppg','PPG'],
         ['oreb','OREB'],['rpg','RPG'],['apg','APG'],['stl','SPG'],['blk','BPG'],['tov','TOV'],['pf','PF'],
         ['fgm','FGM'],['fga','FGA'],['fgPct','FG%'],['threePm','3PM'],['threePa','3PA'],['threePPct','3P%'],
         ['ftm','FTM'],['fta','FTA'],['ftPct','FT%']]
      : [['jersey','#'],['name','Player'],['pos','Pos'],['mpg','MPG'],['bpm','BPM'],['obpm','OBPM'],['dbpm','DBPM'],
         ['tsPct','TS%'],['eFgPct','eFG%'],['orebPct','OREB%'],['drebPct','DREB%'],['trbPct','TRB%'],
         ['astPct','AST%'],['tovPct','TOV%'],['blkPct','BLK%'],['usg','USG%'],['ftr','FTr'],
         ['threePar','3PAr'],['ortg','ORtg'],['drtg','DRtg'],['netRtg','Net']];

    // Sortable by any column. Sort state is kept per table mode so the box
    // score and advanced views remember their own ordering.
    const sortKey = mode === 'box' ? 'teamRosterSortBox' : 'teamRosterSortAdv';
    const dirKey = sortKey + 'Dir';
    const activeCol = this.state[sortKey] || 'mpg';
    const dir = (this.state[dirKey] || 'desc') === 'asc' ? 1 : -1;

    const valueOf = (p, id) => {
      if (id === 'name' || id === 'pos' || id === 'class') return (p[id] || '').toString();
      if (id === 'jersey') return parseInt(p.jersey, 10);
      const raw = p.stats ? p.stats[id] : 0;
      return parseFloat(raw) || 0;
    };

    const roster = [...(team.roster || [])].sort((a, b) => {
      const av = valueOf(a, activeCol), bv = valueOf(b, activeCol);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      const an = isNaN(av) ? -1 : av, bn = isNaN(bv) ? -1 : bv;
      if (an !== bn) return (an - bn) * dir;
      return parseFloat(b.rating) - parseFloat(a.rating);
    });

    let rows = '';
    roster.forEach(p => {
      const safeName = p.name.replace(/'/g, "\\'");
        const safeId = String(p.id).replace(/'/g, "\\'");
      rows += '<tr>' + cols.map(([id]) => {
        if (id === 'jersey') return `<td class="jersey-num">${p.jersey ? '#' + p.jersey : '—'}</td>`;
        if (id === 'name') return `<td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${p.name}</span></td>`;
        if (id === 'pos' || id === 'class') return `<td class="sub-text">${p[id]}</td>`;
        return `<td>${p.stats ? p.stats[id] : '—'}</td>`;
      }).join('') + '</tr>';
    });

    return `
      <h4 class="award-section-title">${mode === 'box' ? 'Player Box Score Stats' : 'Player Advanced Stats'}</h4>
      <div class="table-scroll mb-1-5"><table class="data-table">
        <thead><tr>${cols.map(([id, label]) => {
          const isActive = id === activeCol;
          const arrow = isActive ? ((this.state[dirKey] || 'desc') === 'desc' ? ' &darr;' : ' &uarr;') : '';
          return `<th class="${isActive ? 'active-sort' : ''}" onclick="SimEngine.sortTeamRoster('${mode}','${id}')">${label}${arrow}</th>`;
        }).join('')}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols.length}" class="empty-table-msg">No games played yet.</td></tr>`}</tbody>
      </table></div>`;
  },

  sortTeamRoster(mode, col) {
    const sortKey = mode === 'box' ? 'teamRosterSortBox' : 'teamRosterSortAdv';
    const dirKey = sortKey + 'Dir';
    if (this.state[sortKey] === col) {
      this.state[dirKey] = (this.state[dirKey] || 'desc') === 'desc' ? 'asc' : 'desc';
    } else {
      this.state[sortKey] = col;
      // Names sort A-Z first; everything else sorts best-first.
      this.state[dirKey] = (col === 'name' || col === 'pos' || col === 'class') ? 'asc' : 'desc';
    }
    this.updateTeamTab();
  },

  renderTeamGameLog(team) {
    const games = this.state.schedule
      .filter(g => g.home === team.school || g.away === team.school)
      .sort((a, b) => a.week - b.week);

    let rows = '';
    games.forEach(g => {
      const isHome = g.home === team.school;
      const opp = isHome ? g.away : g.home;
      let resultCell = `<td class="sub-text-sm">—</td><td class="sub-text-sm">Not yet played</td>`;
      if (g.played && g.result) {
        const own = isHome ? g.result.homeScore : g.result.awayScore;
        const oppScore = isHome ? g.result.awayScore : g.result.homeScore;
        const won = own > oppScore;
        resultCell = `<td class="${won ? 'win-text' : 'loss-text'}">${won ? 'W' : 'L'}</td><td class="bold-text">${own}-${oppScore}</td>`;
      }
      rows += `<tr>
        <td class="bold-sub-text">${g.week}</td>
        <td class="sub-text-sm">${isHome ? 'vs' : '@'}</td>
        <td><div class="team-cell-wrap clickable-school" onclick="SimEngine.setTeamPageSelection('${opp.replace(/'/g, "\\'")}')">
          <img src="${this.getTeamLogo(opp)}" class="xs-logo"><span>${opp}</span></div></td>
        <td class="sub-text-sm">${g.isConf ? 'Conf' : 'Non-Conf'}</td>
        ${resultCell}
      </tr>`;
    });

    return `
      <button class="outline-btn mb-1" onclick="SimEngine.setTeamPageView('team')">&larr; Back to ${team.school}</button>
      <div class="team-header">
        <img src="${this.getTeamLogo(team.school)}" class="team-logo">
        <div class="team-title-block"><h2 class="modal-team-name">${team.school}</h2><span class="modal-team-year">Game Log</span></div>
      </div>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Wk</th><th></th><th>Opponent</th><th>Type</th><th>W/L</th><th>Score</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty-table-msg">No games scheduled yet.</td></tr>`}</tbody>
      </table></div>`;
  },

  renderTeamHistoryView(team) {
    const history = team.history || [];
    const back = `<button class="outline-btn mb-1" onclick="SimEngine.setTeamPageView('team')">&larr; Back to ${team.school}</button>`;
    if (history.length === 0) {
      return back + `<p class="empty-table-msg">${team.school} has no completed seasons on record yet — finish a season and advance the offseason to start building history.</p>`;
    }
    let rows = '';
    [...history].sort((a, b) => b.year - a.year).forEach(h => {
      let result = '—';
      if (h.wonNationalTitle) result = 'National Champions';
      else if (h.wonConfTourney) result = 'Conference Champions';
      else if (h.ncaaSeed) result = `NCAA Tournament (#${h.ncaaSeed} seed)`;
      rows += `<tr>
        <td class="bold-text">${h.year}-${(h.year + 1).toString().slice(2)}</td>
        <td>${h.wins}-${h.losses}</td>
        <td class="sub-text">${h.confWins}-${h.confLosses}</td>
        <td class="sub-text">${h.apRank ? '#' + h.apRank : '—'}</td>
        <td class="sub-text-sm">${result}</td>
      </tr>`;
    });
    return back + `
      <div class="team-header">
        <img src="${this.getTeamLogo(team.school)}" class="team-logo">
        <div class="team-title-block"><h2 class="modal-team-name">${team.school}</h2><span class="modal-team-year">Team History</span></div>
      </div>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Season</th><th>Record</th><th>Conf</th><th>AP Rank</th><th>Result</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  },

  // --- Team Stats ---

  setTeamStatsConfFilter(val) {
    this.state.teamStatsConfFilter = val;
    this.updateTeamStatsTab();
  },

  setTeamStatsView(view) {
    this.state.teamStatsView = view;
    this.updateTeamStatsTab();
  },

  handleTeamStatSort(col) {
    if (this.state.teamStatSortCol === col) {
      this.state.teamStatSortDir = this.state.teamStatSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.state.teamStatSortCol = col;
      this.state.teamStatSortDir = 'desc';
    }
    this.updateTeamStatsTab();
  },

  updateTeamStatsTab() {
    const head = document.getElementById('teamStatsHeader');
    const body = document.getElementById('teamStatsBody');
    if (!body) return;

    if (this.state.teams.length === 0) {
      body.innerHTML = `<tr><td colspan="12" class="empty-table-msg">Start a save to view team stats.</td></tr>`;
      return;
    }

    const cols = this.state.teamStatsView === 'adv'
      ? [['school','Team'],['conference','Conf'],['ortg','ORtg'],['drtg','DRtg'],['netRtg','Net'],
         ['pace','Pace'],['eFgPct','eFG%'],['tsPct','TS%'],['astToRatio','A/TO'],
         ['threePar','3PAr'],['ftr','FTr'],['diff','DIFF']]
      : [['school','Team'],['conference','Conf'],['gp','GP'],['ppg','PPG'],['oppPpg','OPP'],
         ['oreb','OREB'],['dreb','DREB'],['rpg','RPG'],['apg','APG'],['stl','SPG'],['blk','BPG'],
         ['tov','TOV'],['pf','PF'],['fgm','FGM'],['fga','FGA'],['fgPct','FG%'],
         ['threePm','3PM'],['threePa','3PA'],['threePPct','3P%'],['ftm','FTM'],['fta','FTA'],['ftPct','FT%']];

    let rows = this.computeAllTeamStats()
      .filter(r => this.matchesConfFilter(r.conference, this.state.teamStatsConfFilter));

    const col = this.state.teamStatSortCol;
    const dir = this.state.teamStatSortDir === 'asc' ? 1 : -1;
    const valueOf = (r, key) => {
      if (key === 'school' || key === 'conference') return r[key];
      if (key === 'wins' || key === 'losses' || key === 'confWins' || key === 'confLosses') return r[key];
      return parseFloat(r.stats[key]) || 0;
    };
    rows.sort((a, b) => {
      const av = valueOf(a, col), bv = valueOf(b, col);
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });

    if (head) {
      head.innerHTML = '<tr>' + cols.map(([id, label]) => {
        const isSort = this.state.teamStatSortCol === id;
        const arrow = isSort ? (this.state.teamStatSortDir === 'desc' ? ' &darr;' : ' &uarr;') : '';
        return `<th class="${isSort ? 'active-sort' : ''}" onclick="SimEngine.handleTeamStatSort('${id}')">${label}${arrow}</th>`;
      }).join('') + '</tr>';
    }

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="${cols.length}" class="empty-table-msg">No teams match this filter.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map(r => '<tr>' + cols.map(([id]) => {
      if (id === 'school') {
        return `<td><div class="team-cell-wrap clickable-school" onclick="SimEngine.setTeamPageSelection('${r.school.replace(/'/g, "\\'")}')">
          <img src="${this.getTeamLogo(r.school)}" class="xs-logo"><span class="team-name-cell">${r.school}</span></div></td>`;
      }
      if (id === 'conference') return `<td class="sub-text-sm">${r.conference}</td>`;
      return `<td>${r.stats[id]}</td>`;
    }).join('') + '</tr>').join('');
  },

  // --- Incoming Recruits ---

  setRecruitsStatusFilter(val) {
    this.state.recruitsStatusFilter = val;
    this.updateRecruitsTab();
  },

  setRecruitsConfFilter(val) {
    this.state.recruitsConfFilter = val;
    this.updateRecruitsTab();
  },

  // "Incoming" means the class that arrives NEXT season, not the one
  // already on campus. In the 2028 season the 2028 class has already
  // enrolled, so this page shows the 2029 group.
  // The sheet labels a player by the season they first appear in, using the
  // year that season ENDS: the 2028-29 season is 2029. So the class of 2029
  // (who arrive for 2029-30) are labelled 2030.
  currentSeasonSheetYear() {
    return this.state.year + 1;
  },

  // Recruiting classes are named by graduating year: during the 2028-29
  // season the class of 2028 is already enrolled and the class of 2029 is
  // the incoming group.
  // Derives the currently relevant recruiting classes from the full pool.
  // Called at load and again every offseason, so next year's class becomes
  // visible as the calendar advances instead of being lost at import.
  refreshRecruitPool() {
    const all = this.state.allRecruits || [];
    if (all.length === 0) return;
    const maxYear = this.state.year + 1;
    const enrolledNames = new Set();
    this.state.teams.forEach(t => (t.roster || []).forEach(p => enrolledNames.add(p.name)));

    // Anyone who has already used up their college eligibility — declared
    // for the draft or graduated — must never re-enter the recruit pool.
    // Without this, a player removed from his roster at the draft simply
    // stopped looking "enrolled", got recycled as an incoming recruit, and
    // re-enrolled at the same school: which is exactly why pinned top
    // prospects kept showing up in school the following season.
    const departed = this.state.departedNames || new Set();

    this.state.recruits = all.filter(r =>
      (!r.recClassYear || r.recClassYear <= maxYear) &&
      !enrolledNames.has(r.name) &&
      !departed.has(r.name));
  },

  // Permanently retires a player from the college universe.
  markDeparted(player) {
    if (!this.state.departedNames) this.state.departedNames = new Set();
    if (player && player.name) this.state.departedNames.add(player.name);
  },

  getIncomingRecruitClassYear() {
    return this.state.year + 1;
  },

  incomingClassLabel() {
    return this.getIncomingRecruitClassYear();
  },

  updateRecruitsTab() {
    const body = document.getElementById('recruitsBody');
    const label = document.getElementById('recruitsClassLabel');
    if (!body) return;

    const incomingYear = this.getIncomingRecruitClassYear();
    if (label) label.innerText = `Class of ${this.incomingClassLabel()}`;

    if (!this.state.recruits || this.state.recruits.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="empty-table-msg">No recruit data loaded yet.</td></tr>`;
      return;
    }

    let recruits = this.state.recruits.filter(r => String(r.recClassYear) === String(incomingYear));

    if (this.state.recruitsStatusFilter === 'committed') {
      recruits = recruits.filter(r => r.school && r.school !== 'Uncommitted' && r.school !== 'Free Agent');
    } else if (this.state.recruitsStatusFilter === 'uncommitted') {
      recruits = recruits.filter(r => !r.school || r.school === 'Uncommitted' || r.school === 'Free Agent');
    }

    if (this.state.recruitsConfFilter && this.state.recruitsConfFilter !== 'ALL') {
      recruits = recruits.filter(r => {
        const team = this.state.teams.find(t => t.school === r.school);
        return team && this.matchesConfFilter(team.conference, this.state.recruitsConfFilter);
      });
    }

    recruits.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));

    if (recruits.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="empty-table-msg">No ${this.incomingClassLabel()} recruits match these filters.</td></tr>`;
      return;
    }

    body.innerHTML = recruits.map((r, i) => {
      const safeName = r.name.replace(/'/g, "\\'");
      const safeId = String(r.id).replace(/'/g, "\\'");
      const committed = r.school && r.school !== 'Uncommitted' && r.school !== 'Free Agent';
      const team = committed ? this.state.teams.find(t => t.school === r.school) : null;
      return `<tr>
        <td class="bold-sub-text">${i + 1}</td>
        <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${r.name}</span></td>
        <td class="sub-text">${r.pos}</td>
        <td class="bold-text">${Math.round(parseFloat(r.rating))}</td>
        <td class="sub-text-sm">${r.hs || r.hometown || '—'}</td>
        <td>${committed
          ? `<div class="team-cell-wrap"><img src="${this.getTeamLogo(r.school)}" class="xs-logo"><span>${r.school}</span>${team ? ` <span class="sub-text-sm">(${team.conference})</span>` : ''}</div>`
          : '<span class="sub-text-sm">Uncommitted</span>'}</td>
      </tr>`;
    }).join('');
  },

  // --- Draft Board ---

  updateDraftBoardTab() {
    const container = document.getElementById('draftBoardContainer');
    if (!container) return;

    if (this.state.teams.length === 0) {
      container.innerHTML = `<p class="empty-table-msg">Start a save to view the big board.</p>`;
      return;
    }

    const board = this.computeDraftBigBoard(60);
    if (board.length === 0) {
      container.innerHTML = `<p class="empty-table-msg">No prospects to rank yet.</p>`;
      return;
    }

    const declaredIds = new Set((this.state.draftDeclarations || []).map(d => d.id));
    const phaseNote = this.state.week === 0
      ? 'Preseason board — weighted by pedigree, age and physical profile until games are played.'
      : (this.state.ncaaDone
          ? 'Final board. Players who declared are tagged.'
          : `Live board through Week ${this.state.week} — updates every week as production accumulates.`);

    let rows = '';
    board.forEach((entry, i) => {
      const p = entry.player;
      const st = p.stats || this.getZeroStats();
      const safe = String(p.id).replace(/'/g, "\\'");
      const declared = declaredIds.has(p.id);
      rows += `<tr>
        <td class="rank-cell">${i + 1}</td>
        <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safe}')">${p.name}</span>
            ${declared ? '<span class="declared-tag">DECLARED</span>' : ''}</td>
        <td><div class="team-cell-wrap clickable-school" onclick="SimEngine.goToTeamPage('${p.school.replace(/'/g, "\\'")}')">
          <img src="${this.getTeamLogo(p.school)}" class="xs-logo"><span>${p.school}</span></div></td>
        <td class="sub-text">${p.pos}</td>
        <td class="sub-text">${p.class}</td>
        <td class="sub-text">${p.ht || '—'}</td>
        <td class="bold-text">${st.ppg}</td>
        <td>${st.rpg}</td>
        <td>${st.apg}</td>
        <td>${st.bpm}</td>
        <td class="sub-text-sm">${entry.score.toFixed(1)}</td>
      </tr>`;
    });

    container.innerHTML = `
      <p class="sub-text mb-1">${phaseNote}</p>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>Cl</th><th>HT</th>
          <th>PPG</th><th>RPG</th><th>APG</th><th>BPM</th><th>Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  },

  // --- Offseason takeover ---

  // The offseason is its own full-screen experience rather than a tab:
  // it opens over the sim the way the home screen does, walks through
  // champion / declarations / transfers, and is dismissed explicitly.
  openOffseason(stage) {
    this.state.offseasonStage = stage || this.state.offseasonStage || 'champion';
    const overlay = document.getElementById('offseasonOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    document.body.classList.add('offseason-open');
    this.renderOffseasonOverlay();
  },

  closeOffseason() {
    const overlay = document.getElementById('offseasonOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('offseason-open');
  },

  setOffseasonStage(stage) {
    this.state.offseasonStage = stage;
    this.renderOffseasonOverlay();
  },

  renderOffseasonOverlay() {
    const el = document.getElementById('offseasonBody');
    if (!el) return;

    document.querySelectorAll('.offseason-stage-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-stage') === this.state.offseasonStage);
    });

    const yearEl = document.getElementById('offseasonYear');
    if (yearEl) {
      const y = this.state.seasonHistory.length
        ? this.state.seasonHistory[this.state.seasonHistory.length - 1].year
        : this.state.year;
      yearEl.innerText = `${y}-${(y + 1).toString().slice(2)} Offseason`;
    }

    // The action button names whatever comes next, rather than always
    // reading "Continue to Next Season".
    const actionBtn = document.getElementById('offseasonAdvanceBtn');
    if (actionBtn) {
      const idx = this.state.offseasonStageIndex || 0;
      const next = this.OFFSEASON_STAGES[idx];
      actionBtn.innerText = next ? `Continue: ${next.label}` : 'Continue to Next Season';
    }

    const stage = this.state.offseasonStage || 'champion';
    if (stage === 'draft') el.innerHTML = this.renderOffseasonDraft();
    else if (stage === 'predraft') el.innerHTML = this.renderOffseasonCombine();
    else if (stage === 'declarations') el.innerHTML = this.renderOffseasonDeclarations();
    else if (stage === 'transfers') el.innerHTML = this.renderOffseasonTransfers();
    else el.innerHTML = this.renderOffseasonChampion();
  },

  renderOffseasonChampion() {
    let champSchool = null, champYear = this.state.year;
    if (this.state.ncaaTournament && this.state.ncaaTournament.champion) {
      champSchool = this.state.ncaaTournament.champion.school;
    } else if ((this.state.seasonHistory || []).length > 0) {
      const last = this.state.seasonHistory[this.state.seasonHistory.length - 1];
      champSchool = last.champion;
      champYear = last.year;
    }
    if (!champSchool) return `<p class="empty-table-msg">Finish the NCAA Tournament to begin the offseason.</p>`;

    const t = this.state.teams.find(x => x.school === champSchool);
    const hist = t && (t.history || []).find(h => h.year === champYear);
    const record = hist ? `${hist.wins}-${hist.losses}` : (t && t.simData ? `${t.simData.wins}-${t.simData.losses}` : '');
    const histEntry = (this.state.seasonHistory || []).find(h => h.year === champYear);

    let html = `<div class="champion-spotlight">
      <img src="${this.getTeamLogo(champSchool)}" class="champion-logo">
      <div>
        <div class="champion-label">${champYear}-${(champYear + 1).toString().slice(2)} National Champions</div>
        <div class="champion-name">${champSchool}</div>
        <div class="champion-record">${record}${t && t.conference ? ' · ' + t.conference : ''}</div>
      </div>
    </div>`;

    if (histEntry) {
      html += `<div class="offseason-recap">
        ${histEntry.runnerUp ? `<p class="sub-text">Defeated <strong>${histEntry.runnerUp}</strong> in the championship game.</p>` : ''}
        ${histEntry.finalFour && histEntry.finalFour.length ? `<p class="sub-text">Final Four: ${histEntry.finalFour.join(', ')}</p>` : ''}
        ${histEntry.npoy ? `<p class="sub-text">National Player of the Year: <strong>${histEntry.npoy.name}</strong> (${histEntry.npoy.school})</p>` : ''}
        ${histEntry.dpoy ? `<p class="sub-text">Defensive Player of the Year: <strong>${histEntry.dpoy.name}</strong> (${histEntry.dpoy.school})</p>` : ''}
      </div>`;
    }
    return html;
  },

  renderOffseasonDeclarations() {
    // Prefer the snapshot taken during the offseason; fall back to the live
    // list when the offseason screen is opened before advancing.
    let decls = (this.state.lastDeclarations && this.state.lastDeclarations.length)
      ? this.state.lastDeclarations
      : (this.state.draftDeclarations || []);
    const returning = this.state.returningPlayers || [];

    let html = `<p class="sub-text mb-1">Seniors and players out of eligibility enter automatically. Early entrants can withdraw and return to school — combine results from the Draft RP page will drive that decision once it's available.</p>`;

    html += `<div class="filters-container mb-1">
      <select class="filter-select" onchange="SimEngine.setDeclarationSort(this.value)">
        <option value="board" ${this.state.declarationSort === 'board' ? 'selected' : ''}>Sort by Draft Board</option>
        <option value="school" ${this.state.declarationSort === 'school' ? 'selected' : ''}>Group by School</option>
      </select>
    </div>`;

    if (this.state.declarationSort === 'school') {
      decls = [...decls].sort((x, y) =>
        x.school === y.school ? (x.boardRank || 999) - (y.boardRank || 999) : x.school.localeCompare(y.school));
    } else {
      decls = [...decls].sort((x, y) => (x.boardRank || 999) - (y.boardRank || 999));
    }

    if (decls.length === 0) {
      html += `<p class="empty-table-msg">No players have declared yet.</p>`;
    } else {
      html += `<h5 class="award-table-title">Declared (${decls.length})</h5>
        <div class="table-scroll mb-1-5"><table class="data-table">
          <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>Cl</th><th>PPG</th><th>Board</th><th>Status</th></tr></thead><tbody>
          ${decls.map((d, i) => `<tr>
            <td class="bold-sub-text">${i + 1}</td>
            <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(d.id).replace(/'/g, "\\'")}')">${d.name}</span></td>
            <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(d.school)}" class="xs-logo"><span>${d.school}</span></div></td>
            <td class="sub-text">${d.pos}</td>
            <td class="sub-text">${d.class}</td>
            <td class="bold-text">${d.ppg}</td>
            <td class="sub-text-sm">${d.boardRank && d.boardRank <= 200 ? '#' + d.boardRank : '—'}</td>
          <td class="sub-text-sm">${d.mandatory ? 'Auto entry' : 'Early entry'}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    }

    if (returning.length > 0) {
      html += `<h5 class="award-table-title">Withdrew — Returning to School (${returning.length})</h5>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>Player</th><th>School</th><th>Pos</th><th>Big Board</th></tr></thead><tbody>
          ${returning.map(r => `<tr>
            <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(r.id).replace(/'/g, "\\'")}')">${r.name}</span></td>
            <td class="sub-text">${r.school}</td>
            <td class="sub-text">${r.pos}</td>
            <td class="sub-text-sm">${r.boardRank <= 200 ? '#' + r.boardRank : 'Unranked'}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    }
    return html;
  },

  renderOffseasonCombine() {
    const combine = this.state.combineResults || [];
    if (combine.length === 0) {
      return `<p class="empty-table-msg">The combine hasn't been held yet.</p>`;
    }
    const risers = combine.filter(c => c.direction === 'rose');
    const fallers = combine.filter(c => c.direction === 'fell');
    const col = (title, list, cls) => `
      <div class="season-section">
        <h5 class="award-table-title">${title}</h5>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>Player</th><th>School</th><th>Move</th></tr></thead><tbody>
          ${list.slice(0, 12).map(c => `<tr>
            <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(c.id).replace(/'/g, "\\'")}')">${c.name}</span></td>
            <td class="sub-text">${c.school}</td>
            <td class="${cls}">${c.direction === 'rose' ? '▲' : '▼'} ${c.amount}</td>
          </tr>`).join('') || '<tr><td colspan="3" class="empty-table-msg">None</td></tr>'}
        </tbody></table></div>
      </div>`;
    return `<p class="sub-text mb-1">Measurements, scrimmages and interviews. Prospects further down the board move most — a consensus top pick has little to prove.</p>
      <div class="season-split">${col('Helped Themselves', risers, 'win-text')}${col('Hurt Themselves', fallers, 'loss-text')}</div>`;
  },

  renderOffseasonDraft() {
    const picks = this.state.draftResults || [];
    const combine = this.state.combineResults || [];
    let html = '';

    if (combine.length) {
      html += `<h5 class="award-table-title">Combine &amp; Workout Risers and Fallers</h5>
        <div class="table-scroll mb-1-5"><table class="data-table">
          <thead><tr><th>Player</th><th>School</th><th>Movement</th></tr></thead><tbody>
          ${combine.slice(0, 15).map(c => `<tr>
            <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(c.id).replace(/'/g, "\\'")}')">${c.name}</span></td>
            <td class="sub-text">${c.school}</td>
            <td class="${c.direction === 'rose' ? 'win-text' : 'loss-text'}">${c.direction === 'rose' ? '▲' : '▼'} ${c.amount} spots</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    }

    if (picks.length === 0) {
      html += `<p class="empty-table-msg">The draft hasn't been held yet.</p>`;
      return html;
    }

    html += `<h5 class="award-table-title">${this.state.year + 1} NBA Draft</h5>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Pick</th><th>Rd</th><th>Player</th><th>School</th><th>Pos</th><th>HT</th><th>PPG</th></tr></thead><tbody>
        ${picks.map(d => `<tr>
          <td class="rank-cell">${d.pick}</td>
          <td class="sub-text">${d.round}</td>
          <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(d.id).replace(/'/g, "\\'")}')">${d.name}</span></td>
          <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(d.school)}" class="xs-logo"><span>${d.school}</span></div></td>
          <td class="sub-text">${d.pos}</td>
          <td class="sub-text">${d.ht || '—'}</td>
          <td class="bold-text">${d.ppg}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
    return html;
  },

  renderOffseasonTransfers() {
    const transfers = this.state.lastTransfers || [];
    if (transfers.length === 0) {
      return `<p class="empty-table-msg">No transfers yet — the portal opens when you advance the offseason.</p>`;
    }
    return `<p class="sub-text mb-1">${transfers.length} players changed schools. Producing well against a weak schedule pulls players upward; highly-rated players who underperformed or barely played look for a new situation.</p>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Player</th><th>Pos</th><th>Cl</th><th>PPG</th><th>From</th><th></th><th>To</th><th>Reason</th></tr></thead><tbody>
        ${transfers.map(t => `<tr>
          <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(t.id || t.name).replace(/'/g, "\\'")}')">${t.name}</span></td>
          <td class="sub-text">${t.pos}</td>
          <td class="sub-text">${t.class}</td>
          <td class="bold-text">${t.ppg}</td>
          <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(t.from)}" class="xs-logo"><span>${t.from}</span></div></td>
          <td class="transfer-arrow">&rarr;</td>
          <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(t.to)}" class="xs-logo"><span>${t.to}</span></div></td>
          <td class="sub-text-sm">${t.reason}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  },

  // Kept so the sidebar/menu entry still works — it just opens the takeover.
  updateOffseasonTab() {
    const el = document.getElementById('offseasonContainer');
    if (!el) return;
    if (!this.state.ncaaDone && (this.state.seasonHistory || []).length === 0) {
      el.innerHTML = `<p class="empty-table-msg">Finish the NCAA Tournament to begin the offseason.</p>`;
      return;
    }
    el.innerHTML = `<p class="sub-text mb-1">The offseason opens as a full-screen experience.</p>
      <button class="sim-btn" onclick="SimEngine.openOffseason('champion')">Open Offseason</button>`;
  },

  // --- Historical Seasons ---

  setHistorySeason(year) {
    this.state.historySeasonView = year === '' ? null : parseInt(year, 10);
    this.updateHistoryTab();
  },

  updateHistoryTab() {
    const container = document.getElementById('historyContainer');
    if (!container) return;

    const history = this.state.seasonHistory || [];
    if (history.length === 0) {
      container.innerHTML = `<p class="empty-table-msg">Complete a season to begin building history.</p>`;
      return;
    }

    const years = history.map(h => h.year).sort((a, b) => b - a);
    const selected = this.state.historySeasonView && years.includes(this.state.historySeasonView)
      ? this.state.historySeasonView : years[0];

    const picker = `<div class="filters-container mb-1">
      <select class="filter-select" onchange="SimEngine.setHistorySeason(this.value)">
        ${years.map(y => `<option value="${y}" ${y === selected ? 'selected' : ''}>${y}-${(y + 1).toString().slice(2)} Season</option>`).join('')}
      </select>
    </div>`;

    container.innerHTML = picker + this.renderSeasonSummary(selected);
  },

  // A full season page in the style of a reference site: the headline
  // results up top, then the final polls, conference champions and
  // statistical leaders for that year — all clickable through to the
  // teams and players involved.
  // A team's page for a season that has already finished. The live team
  // page always shows the current roster, so clicking a 2028-29 team from
  // the history tab needs its own view built from the archive rather than
  // from today's data.
  showHistoricalTeam(school, year) {
    const team = this.state.teams.find(t => t.school === school);
    const container = document.getElementById('historyContainer');
    if (!container) return;

    const hist = team && (team.history || []).find(h => h.year === year);
    const season = (this.state.seasonHistory || []).find(h => h.year === year);

    // Players who logged a season with this school that year.
    const roster = this.state.activePlayers
      .concat(this.state.recruits || [])
      .map(p => {
        const sh = (p.seasonHistory || []).find(h => h.year === year && h.school === school);
        return sh ? { player: p, line: sh } : null;
      })
      .filter(Boolean)
      .sort((a, b) => parseFloat(b.line.stats.ppg) - parseFloat(a.line.stats.ppg));

    let result = '—';
    if (hist) {
      if (hist.wonNationalTitle) result = 'National Champions';
      else if (hist.wonConfTourney) result = 'Conference Tournament Champions';
      else if (hist.ncaaSeed) result = `NCAA Tournament — #${hist.ncaaSeed} seed`;
      else result = 'Did not reach the NCAA Tournament';
    }

    const cols = [['gp','GP'],['gs','GS'],['mpg','MPG'],['ppg','PPG'],['rpg','RPG'],['apg','APG'],
                  ['stl','SPG'],['blk','BPG'],['fgPct','FG%'],['threePPct','3P%'],['ftPct','FT%'],['bpm','BPM']];

    container.innerHTML = `
      <button class="outline-btn mb-1" onclick="SimEngine.setHistorySeason(${year})">&larr; Back to ${year}-${(year + 1).toString().slice(2)} Season</button>
      <div class="team-header">
        <img src="${this.getTeamLogo(school)}" class="team-logo">
        <div class="team-title-block">
          <h2 class="modal-team-name">${school}</h2>
          <span class="modal-team-year">${year}-${(year + 1).toString().slice(2)} Season</span>
        </div>
      </div>
      <div class="team-stats-grid mb-1-5">
        <div class="stat-box"><span class="stat-label">RECORD</span><span class="stat-value">${hist ? `${hist.wins}-${hist.losses}` : '—'}</span><span class="sub-text-sm">${hist ? `(${hist.confWins}-${hist.confLosses} conf)` : ''}</span></div>
        <div class="stat-box"><span class="stat-label">AP RANK</span><span class="stat-value">${hist && hist.apRank ? '#' + hist.apRank : '—'}</span></div>
        <div class="stat-box"><span class="stat-label">NCAA SEED</span><span class="stat-value">${hist && hist.ncaaSeed ? '#' + hist.ncaaSeed : '—'}</span></div>
        <div class="stat-box"><span class="stat-label">CONFERENCE</span><span class="stat-value">${team ? team.conference : '—'}</span></div>
      </div>
      <div class="season-result-banner mb-1-5">${result}</div>
      ${season && season.champion === school ? `<p class="sub-text mb-1">Won the national championship${season.runnerUp ? ` over ${season.runnerUp}` : ''}.</p>` : ''}

      <h4 class="award-section-title">${year}-${(year + 1).toString().slice(2)} Roster Statistics</h4>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Player</th><th>Cl</th><th>Pos</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
        <tbody>${roster.length ? roster.map(({ player, line }) => `<tr>
          <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(player.id).replace(/'/g, "\\'")}')">${player.name}</span></td>
          <td class="sub-text">${line.class || '—'}</td>
          <td class="sub-text">${player.pos}</td>
          ${cols.map(c => `<td>${line.stats[c[0]] !== undefined ? line.stats[c[0]] : '—'}</td>`).join('')}
        </tr>`).join('') : `<tr><td colspan="${cols.length + 3}" class="empty-table-msg">No archived player statistics for this season.</td></tr>`}</tbody>
      </table></div>`;
  },

  renderSeasonSummary(year) {
    const entry = (this.state.seasonHistory || []).find(h => h.year === year);
    if (!entry) return `<p class="empty-table-msg">No data for that season.</p>`;

    const label = `${year}-${(year + 1).toString().slice(2)}`;
    const teamLink = (school) => school
      ? `<span class="clickable-school" onclick="SimEngine.showHistoricalTeam('${school.replace(/'/g, "\\'")}', ${year})">${school}</span>`
      : '—';

    // Final standings for that season come from each team's archive.
    const standings = this.state.teams
      .map(t => ({ team: t, h: (t.history || []).find(x => x.year === year) }))
      .filter(x => x.h)
      .sort((a, b) => {
        if (b.h.wins !== a.h.wins) return b.h.wins - a.h.wins;
        return a.h.losses - b.h.losses;
      });

    const pollRows = standings.slice(0, 25).map((x, i) => `
      <tr>
        <td class="rank-cell">${i + 1}</td>
        <td><div class="team-cell-wrap clickable-school" onclick="SimEngine.goToTeamPage('${x.team.school.replace(/'/g, "\\'")}')">
          <img src="${this.getTeamLogo(x.team.school)}" class="xs-logo"><span>${x.team.school}</span></div></td>
        <td class="sub-text">${x.team.conference}</td>
        <td class="bold-text">${x.h.wins}-${x.h.losses}</td>
        <td class="sub-text">${x.h.confWins}-${x.h.confLosses}</td>
        <td class="sub-text-sm">${x.h.wonNationalTitle ? 'National Champion' : x.h.wonConfTourney ? 'Conference Champion' : x.h.ncaaSeed ? 'NCAA #' + x.h.ncaaSeed + ' seed' : '—'}</td>
      </tr>`).join('');

    const confRows = Object.entries(entry.conferenceChamps || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([conf, champ]) => `<tr><td>${conf}</td><td>${teamLink(champ)}</td></tr>`).join('');

    const awardRow = (title, a) => a
      ? `<tr><td class="sub-text">${title}</td><td class="bold-text">${a.name}</td><td>${teamLink(a.school)}</td></tr>`
      : '';

    // Statistical leaders for that season, taken from each player's archive.
    const seasonStats = [];
    this.state.activePlayers.forEach(p => {
      const h = (p.seasonHistory || []).find(x => x.year === year);
      if (h && h.stats && h.stats.gp > 0) seasonStats.push({ p, h });
    });
    const leaderTable = (key, title) => {
      if (seasonStats.length === 0) return '';
      const top = [...seasonStats]
        .filter(x => parseFloat(x.h.stats.mpg) >= 10)
        .sort((a, b) => parseFloat(b.h.stats[key]) - parseFloat(a.h.stats[key]))
        .slice(0, 5);
      if (top.length === 0) return '';
      return `<div class="award-table-card">
        <h5 class="award-table-title">${title}</h5>
        ${top.map((x, i) => `<div class="leader-row">
          <span class="leader-ident">${i + 1}.
            <img src="${this.getTeamLogo(x.h.school)}" class="xs-logo">
            <span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(x.p.id).replace(/'/g, "\\'")}')">${x.p.name}</span>
          </span>
          <span>${x.h.stats[key]}</span>
        </div>`).join('')}
      </div>`;
    };

    return `
      <div class="season-headline">
        <div class="season-headline-main">
          <div class="champion-label">${label} National Champion</div>
          <div class="champion-name">${teamLink(entry.champion)}</div>
          ${entry.runnerUp ? `<div class="sub-text">defeated ${teamLink(entry.runnerUp)} in the championship game</div>` : ''}
        </div>
        <img src="${entry.champion ? this.getTeamLogo(entry.champion) : ''}" class="champion-logo">
      </div>

      <h4 class="award-section-title mt-2">Final Four</h4>
      <p class="sub-text">${(entry.finalFour || []).map(teamLink).join(' &nbsp;·&nbsp; ') || 'N/A'}</p>

      <h4 class="award-section-title mt-2">National Awards</h4>
      <div class="table-scroll"><table class="data-table"><tbody>
        ${awardRow('Player of the Year', entry.npoy)}
        ${awardRow('Defensive Player of the Year', entry.dpoy)}
        ${awardRow('Freshman of the Year', entry.froy)}
      </tbody></table></div>

      <h4 class="award-section-title mt-2">Statistical Leaders</h4>
      <div class="all-american-container">
        ${leaderTable('ppg', 'Points Per Game')}
        ${leaderTable('rpg', 'Rebounds Per Game')}
        ${leaderTable('apg', 'Assists Per Game')}
        ${leaderTable('bpm', 'Box Plus/Minus')}
      </div>

      <h4 class="award-section-title mt-2">Final Top 25</h4>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Rank</th><th>Team</th><th>Conf</th><th>Record</th><th>Conf</th><th>Postseason</th></tr></thead>
        <tbody>${pollRows || '<tr><td colspan="6" class="empty-table-msg">No standings archived.</td></tr>'}</tbody>
      </table></div>

      <h4 class="award-section-title mt-2">Conference Champions</h4>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Conference</th><th>Tournament Champion</th></tr></thead>
        <tbody>${confRows || '<tr><td colspan="2" class="empty-table-msg">None recorded.</td></tr>'}</tbody>
      </table></div>`;
  },

  // --- Offseason takeover ---

  // The offseason is its own full-screen experience rather than a tab:
  // it opens over the sim the way the home screen does, walks through
  // champion / declarations / transfers, and is dismissed explicitly.
  openOffseason(stage) {
    this.state.offseasonStage = stage || this.state.offseasonStage || 'champion';
    const overlay = document.getElementById('offseasonOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    document.body.classList.add('offseason-open');
    this.renderOffseasonOverlay();
  },

  closeOffseason() {
    const overlay = document.getElementById('offseasonOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('offseason-open');
  },

  setOffseasonStage(stage) {
    this.state.offseasonStage = stage;
    this.renderOffseasonOverlay();
  },


  renderOffseasonChampion() {
    let champSchool = null, champYear = this.state.year;
    if (this.state.ncaaTournament && this.state.ncaaTournament.champion) {
      champSchool = this.state.ncaaTournament.champion.school;
    } else if ((this.state.seasonHistory || []).length > 0) {
      const last = this.state.seasonHistory[this.state.seasonHistory.length - 1];
      champSchool = last.champion;
      champYear = last.year;
    }
    if (!champSchool) return `<p class="empty-table-msg">Finish the NCAA Tournament to begin the offseason.</p>`;

    const t = this.state.teams.find(x => x.school === champSchool);
    const hist = t && (t.history || []).find(h => h.year === champYear);
    const record = hist ? `${hist.wins}-${hist.losses}` : (t && t.simData ? `${t.simData.wins}-${t.simData.losses}` : '');
    const histEntry = (this.state.seasonHistory || []).find(h => h.year === champYear);

    let html = `<div class="champion-spotlight">
      <img src="${this.getTeamLogo(champSchool)}" class="champion-logo">
      <div>
        <div class="champion-label">${champYear}-${(champYear + 1).toString().slice(2)} National Champions</div>
        <div class="champion-name">${champSchool}</div>
        <div class="champion-record">${record}${t && t.conference ? ' · ' + t.conference : ''}</div>
      </div>
    </div>`;

    if (histEntry) {
      html += `<div class="offseason-recap">
        ${histEntry.runnerUp ? `<p class="sub-text">Defeated <strong>${histEntry.runnerUp}</strong> in the championship game.</p>` : ''}
        ${histEntry.finalFour && histEntry.finalFour.length ? `<p class="sub-text">Final Four: ${histEntry.finalFour.join(', ')}</p>` : ''}
        ${histEntry.npoy ? `<p class="sub-text">National Player of the Year: <strong>${histEntry.npoy.name}</strong> (${histEntry.npoy.school})</p>` : ''}
        ${histEntry.dpoy ? `<p class="sub-text">Defensive Player of the Year: <strong>${histEntry.dpoy.name}</strong> (${histEntry.dpoy.school})</p>` : ''}
      </div>`;
    }
    return html;
  },

  renderOffseasonDeclarations() {
    // Prefer the snapshot taken during the offseason; fall back to the live
    // list when the offseason screen is opened before advancing.
    let decls = (this.state.lastDeclarations && this.state.lastDeclarations.length)
      ? this.state.lastDeclarations
      : (this.state.draftDeclarations || []);
    const returning = this.state.returningPlayers || [];

    let html = `<p class="sub-text mb-1">Seniors and players out of eligibility enter automatically. Early entrants can withdraw and return to school — combine results from the Draft RP page will drive that decision once it's available.</p>`;

    html += `<div class="filters-container mb-1">
      <select class="filter-select" onchange="SimEngine.setDeclarationSort(this.value)">
        <option value="board" ${this.state.declarationSort === 'board' ? 'selected' : ''}>Sort by Draft Board</option>
        <option value="school" ${this.state.declarationSort === 'school' ? 'selected' : ''}>Group by School</option>
      </select>
    </div>`;

    if (this.state.declarationSort === 'school') {
      decls = [...decls].sort((x, y) =>
        x.school === y.school ? (x.boardRank || 999) - (y.boardRank || 999) : x.school.localeCompare(y.school));
    } else {
      decls = [...decls].sort((x, y) => (x.boardRank || 999) - (y.boardRank || 999));
    }

    if (decls.length === 0) {
      html += `<p class="empty-table-msg">No players have declared yet.</p>`;
    } else {
      html += `<h5 class="award-table-title">Declared (${decls.length})</h5>
        <div class="table-scroll mb-1-5"><table class="data-table">
          <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>Cl</th><th>PPG</th><th>Board</th><th>Status</th></tr></thead><tbody>
          ${decls.map((d, i) => `<tr>
            <td class="bold-sub-text">${i + 1}</td>
            <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(d.id).replace(/'/g, "\\'")}')">${d.name}</span></td>
            <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(d.school)}" class="xs-logo"><span>${d.school}</span></div></td>
            <td class="sub-text">${d.pos}</td>
            <td class="sub-text">${d.class}</td>
            <td class="bold-text">${d.ppg}</td>
            <td class="sub-text-sm">${d.boardRank && d.boardRank <= 200 ? '#' + d.boardRank : '—'}</td>
          <td class="sub-text-sm">${d.mandatory ? 'Auto entry' : 'Early entry'}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    }

    if (returning.length > 0) {
      html += `<h5 class="award-table-title">Withdrew — Returning to School (${returning.length})</h5>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>Player</th><th>School</th><th>Pos</th><th>Big Board</th></tr></thead><tbody>
          ${returning.map(r => `<tr>
            <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(r.id).replace(/'/g, "\\'")}')">${r.name}</span></td>
            <td class="sub-text">${r.school}</td>
            <td class="sub-text">${r.pos}</td>
            <td class="sub-text-sm">${r.boardRank <= 200 ? '#' + r.boardRank : 'Unranked'}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    }
    return html;
  },

  renderOffseasonTransfers() {
    const transfers = this.state.lastTransfers || [];
    if (transfers.length === 0) {
      return `<p class="empty-table-msg">No transfers yet — the portal opens when you advance the offseason.</p>`;
    }
    return `<p class="sub-text mb-1">${transfers.length} players changed schools. Producing well against a weak schedule pulls players upward; highly-rated players who underperformed or barely played look for a new situation.</p>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Player</th><th>Pos</th><th>Cl</th><th>PPG</th><th>From</th><th></th><th>To</th><th>Reason</th></tr></thead><tbody>
        ${transfers.map(t => `<tr>
          <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(t.id || t.name).replace(/'/g, "\\'")}')">${t.name}</span></td>
          <td class="sub-text">${t.pos}</td>
          <td class="sub-text">${t.class}</td>
          <td class="bold-text">${t.ppg}</td>
          <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(t.from)}" class="xs-logo"><span>${t.from}</span></div></td>
          <td class="transfer-arrow">&rarr;</td>
          <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(t.to)}" class="xs-logo"><span>${t.to}</span></div></td>
          <td class="sub-text-sm">${t.reason}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  },

  // Kept so the sidebar/menu entry still works — it just opens the takeover.
  updateOffseasonTab() {
    const el = document.getElementById('offseasonContainer');
    if (!el) return;
    if (!this.state.ncaaDone && (this.state.seasonHistory || []).length === 0) {
      el.innerHTML = `<p class="empty-table-msg">Finish the NCAA Tournament to begin the offseason.</p>`;
      return;
    }
    el.innerHTML = `<p class="sub-text mb-1">The offseason opens as a full-screen experience.</p>
      <button class="sim-btn" onclick="SimEngine.openOffseason('champion')">Open Offseason</button>`;
  },

  // --- Historical Seasons ---

};
