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
    ncaaSelection: null,    // the seeded field (Selection Sunday), plain school names
    postseasonHonors: null, // conference tournament MOPs, regional MOPs, Final Four MOP
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
    draftCycle: null,       // where the Draft RP's cycle stands (see draft-cycle.js)
    lastDevelopment: [],
    departedArchive: [],
    rosterArchive: {},
    recordsScope: null,
    recordsMode: 'season',
    draftResults: [],
    declarationSort: 'board',
    historySeasonView: null,
    themeMode: 'system',
    lastTransfers: [],      // portal moves from the most recent offseason
    transferHistory: [],    // every transfer, all seasons (feeds the recruiting page's portal)
    draftHistory: [],       // every NBA draft held in this universe, newest last
    draftLottery: null,     // lottery winners for the most recent draft
    nbaLeagues: {},         // synthesised NBA season per draft year (drives the lottery)
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
    if (typeof Cloud !== 'undefined') Cloud.onChange(u => {
      this._autosaveCleared = false; this._autosaveBlocked = false;
      this.renderCloudMenu();
      if (u && this.state.teams.length) this.offerCloudSave();
    });
    await this.setupHomeScreen();
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
    this.showLoader('Building your universe', 'Pulling rosters and recruiting classes…');
    this.enterSimUI();
    try {
      await this.fetchData();
    } finally {
      await this.hideLoader();
    }
    this.playSeasonIntro();
  },

  // ---------- Loading screen ----------
  // Shown while a new universe is built (or a save is read), so nobody
  // lands on an empty dashboard wondering where the players are.
  showLoader(title, step) {
    if (typeof document === 'undefined' || !document.body) return;
    let el = document.getElementById('rpLoader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rpLoader';
      el.className = 'rp-loader';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = `<div class="rp-loader-card">
        <img src="ncaarplogo.png" alt="" class="rp-loader-logo">
        <h2 class="rp-loader-title"></h2>
        <div class="rp-loader-bar"><span></span></div>
        <p class="rp-loader-step"></p>
      </div>`;
      document.body.appendChild(el);
    }
    el.querySelector('.rp-loader-title').textContent = title;
    el.classList.remove('done');
    el.classList.add('active');
    this._loaderShownAt = Date.now();
    this.setLoaderStep(step || '', 0.06);
  },
  setLoaderStep(text, frac) {
    const el = typeof document !== 'undefined' && document.getElementById('rpLoader');
    if (!el) return;
    if (text != null) el.querySelector('.rp-loader-step').textContent = text;
    if (frac != null) el.querySelector('.rp-loader-bar span').style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  },
  // Sets the step and lets the browser paint it before the next block of
  // synchronous work starts.
  async loaderStep(text, frac) {
    if (typeof document === 'undefined' || !document.getElementById('rpLoader')) return;
    this.setLoaderStep(text, frac);
    await new Promise(r => setTimeout(r, 30));
  },
  async hideLoader() {
    const el = typeof document !== 'undefined' && document.getElementById('rpLoader');
    if (!el || !el.classList.contains('active')) return;
    this.setLoaderStep(null, 1);
    const shown = Date.now() - (this._loaderShownAt || 0);
    if (shown < 700) await new Promise(r => setTimeout(r, 700 - shown));
    el.classList.add('done');
    await new Promise(r => setTimeout(r, 280));
    el.classList.remove('active', 'done');
  },

  async continueGame() {
    const hasSave = await this.checkForExistingSave();
    if (!hasSave) {
      alert("No existing save found. Start a New Save instead.");
      return;
    }
    this.showLoader('Loading your save', 'Reading teams and players…');
    this.enterSimUI();
    try {
      await this.loadSavedGame();
    } finally {
      await this.hideLoader();
    }
    // Mid-offseason (for instance, back from draft night in the Draft RP):
    // pick up right where the offseason left off.
    if (this.state.ncaaDone) this.openOffseason();
  },

  enterSimUI() {
    const home = document.getElementById('homeScreen');
    const layout = document.querySelector('.sim-layout');
    if (home) home.style.display = 'none';
    if (layout) layout.style.display = 'block';
  },

  resetStateToDefaults() {
    this.state.hsCalendar = null;
    this.state.summer = null;
    this.state.summerHistory = [];
    this.state.departedKeys = null;
    this.state.rosterArchive = {};
    this.state.pendingWire = [];
    this.state.proPlayers = [];
    this.state.recruitsClassView = 'incoming';
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
    this.state.ncaaSelection = null;
    this.state.postseasonHonors = null;
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
          this.state.ncaaSelection = savedState.ncaaSelection || null;
          this.state.postseasonHonors = savedState.postseasonHonors || null;
          this.state.draftDeclarations = savedState.draftDeclarations || [];
          this.state.seasonHistory = savedState.seasonHistory || [];
          this.state.allRecruits = (savedState.allRecruits || []).map(r => {
            if (!r.stats) { r.stats = this.getZeroStats(); r.statsFull = this.getZeroStats(); r.statsConf = this.getZeroStats(); }
            return r;
          });
          this.state.departedNames = new Set(savedState.departedNames || []);
          this.state.departedKeys = savedState.departedKeys || null;
          this.state.departedArchive = savedState.departedArchive || [];
          this.state.rosterArchive = savedState.rosterArchive || {};
          this.state.seasonInitialized = savedState.seasonInitialized || false;
          this.state.lastTransfers = savedState.lastTransfers || [];
          this.state.lastDeclarations = savedState.lastDeclarations || [];
          this.state.offseasonStageIndex = savedState.offseasonStageIndex || 0;
          // Saves from before the draft moved to the Draft RP had seven
          // offseason steps; map them onto today's five. (Saves with four
          // steps, from before the summer circuit, line up as they are: a
          // save waiting on "Final Rosters" plays the summer first.)
          if (savedState.ncaaDone && savedState.offseasonSteps !== 4 && savedState.offseasonSteps !== 5) {
            const old = this.state.offseasonStageIndex;
            this.state.offseasonStageIndex = old === 0 ? 0 : old <= 4 ? 1 : old === 5 ? 2 : 3;
          }
          this.state.summer = savedState.summer || null;
          this.state.summerHistory = savedState.summerHistory || [];
          this.state.pendingWire = savedState.pendingWire || [];
          this.state.portalYear = savedState.portalYear || null;
          this.state.carouselYear = savedState.carouselYear || null;
          this.state.recruitFlips = savedState.recruitFlips || [];
          this.state.coachChanges = savedState.coachChanges || [];
          this.state.lastCoachChanges = savedState.lastCoachChanges || [];
          this.state.formerCoaches = savedState.formerCoaches || [];
          this.state.lastWeekSummary = savedState.lastWeekSummary || null;
          this.state.draftResults = savedState.draftResults || [];
          this.state.draftLottery = savedState.draftLottery || null;
          this.state.draftHistory = savedState.draftHistory || [];
          this.state.nbaLeagues = savedState.nbaLeagues || {};
          this.state.transferHistory = savedState.transferHistory || [];
          this.state.combineResults = savedState.combineResults || [];
          this.state.draftCycle = savedState.draftCycle || null;
          this.state.lastDeclarationsYear = savedState.lastDeclarationsYear || null;
          this.state.returningPlayers = savedState.returningPlayers || [];
          this.state.scheduleViewWeek = savedState.scheduleViewWeek || 1;
          this.state.hsCalendar = savedState.hsCalendar || null;
          this.state.proPlayers = savedState.proPlayers || [];
          // The generated classes this save was built with (see
          // applyGeneratedResets for classes an admin has reset since).
          this.state.genResets = savedState.genResets || {};
          if (typeof RecruitGen !== 'undefined' && RecruitGen.setResets) RecruitGen.setResets(this.state.genResets);

          const savedTeams = await db.teams.toArray();
          const savedPlayers = await db.players.toArray();

          if (savedTeams.length > 0 && savedPlayers.length > 0) {
            // Rebuild each roster by grouping the saved players back onto
            // their schools, which is how the roster arrays are restored
            // without ever having been written twice.
            const bySchool = {};
            savedPlayers.forEach(p => {
              (bySchool[p.school] = bySchool[p.school] || []).push(p);
            });
            savedTeams.forEach(t => {
              t.roster = bySchool[t.school] || [];
              if (!t.simData) t.simData = {};
              t.simData.rosterRef = t.roster;
            });

            this.state.teams = savedTeams;
            this.state.activePlayers = savedPlayers;
            this.refreshPrestige();
            // Pending recruits aren't saved on their own; rebuild them from
            // the saved class list or the Recruits tab comes back empty.
            this.refreshRecruitPool();
            if (!(this.state.proPlayers || []).length) this.refreshProPool();
            this.updateProSeasons();
            this.advanceHsCalendar();
            this.syncUI();
            this.logNews(`Loaded Season ${this.state.year} (${this.state.teams.length} teams, ${this.state.activePlayers.length} players).`);
            setTimeout(() => this.checkGeneratedResets().catch(e => console.warn('Checking generated classes:', e))
              .then(() => this.refreshRecruitProduction()).then(n => { if (n) { console.log(`Recruiting database re-read for ${n} players.`); return this.saveStateToDB(); } })
              .catch(e => console.warn('Re-reading the recruiting database:', e)), 0);
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
      champion: bracket.champion ? { school: bracket.champion.school } : null,
      playIn: (bracket.playIn || []).map(slimGame),
      rounds: (bracket.rounds || []).map(round => round.map(slimGame)),
      seeds: bracket.seeds || null
    };
  },

  async saveStateToDB() {
    // Skipping ahead saves once, at the end, not after every week.
    if (this._skipping) { this._skipDirty = true; return; }
    this.scheduleCloudSync();
    if (typeof db === 'undefined' || !db.leagueState) return;
    // During the offseason the Draft RP may have written to this save.
    if (this.state.ncaaDone) { await this.syncDraftFromDB(); await this.syncSummerFromDB(); }
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
          ncaaSelection: this.state.ncaaSelection || null,
          postseasonHonors: this.state.postseasonHonors || null,
          draftDeclarations: this.state.draftDeclarations,
          seasonHistory: this.state.seasonHistory,
          // Recruits who haven't played carry three all-zero stat blocks;
          // those are left out of the save (about 10 MB with every class
          // filled to 250) and rebuilt on load.
          allRecruits: (this.state.allRecruits || []).map(r => {
            if ((r.stats && r.stats.gp) || (r.statsFull && r.statsFull.gp)) return r;
            const { stats, statsFull, statsConf, ...slim } = r;
            return slim;
          }),
          departedNames: Array.from(this.state.departedNames || []),
          departedKeys: Array.from(this.departedKeys()),
          departedArchive: this.state.departedArchive,
          rosterArchive: this.state.rosterArchive || {},
          seasonInitialized: this.state.seasonInitialized,
          lastTransfers: this.state.lastTransfers,
          lastDeclarations: this.state.lastDeclarations,
          offseasonStageIndex: this.state.offseasonStageIndex,
          offseasonSteps: 5,
          summer: this.state.summer || null,
          summerHistory: this.state.summerHistory || [],
          pendingWire: this.state.pendingWire || [],
          portalYear: this.state.portalYear || null,
          carouselYear: this.state.carouselYear || null,
          recruitFlips: this.state.recruitFlips || [],
          coachChanges: this.state.coachChanges || [],
          lastCoachChanges: this.state.lastCoachChanges || [],
          formerCoaches: this.state.formerCoaches || [],
          lastWeekSummary: this.state.lastWeekSummary || null,
          draftResults: this.state.draftResults,
          draftLottery: this.state.draftLottery,
          draftHistory: this.state.draftHistory,
          nbaLeagues: this.state.nbaLeagues,
          transferHistory: this.state.transferHistory,
          combineResults: this.state.combineResults,
          draftCycle: this.state.draftCycle || null,
          lastDeclarationsYear: this.state.lastDeclarationsYear,
          returningPlayers: this.state.returningPlayers,
          scheduleViewWeek: this.state.scheduleViewWeek,
          hsCalendar: this.state.hsCalendar || null,
          proPlayers: this.state.proPlayers || [],
          genResets: this.state.genResets || {}
        });
        await db.teams.clear();
        // Teams are stored WITHOUT their rosters: team.roster holds the same
        // player objects as activePlayers, so persisting both doubled the
        // save (rosters alone accounted for ~46 MB of a ~72 MB save after a
        // single season). Rosters are rebuilt from players on load.
        // Any non-serialisable property reaching IndexedDB throws
        // DataCloneError and aborts the whole save, so they're stripped here
        // rather than relying on nothing ever attaching one.
        const serialisable = (obj) => {
          const out = {};
          Object.keys(obj).forEach(k => {
            const v = obj[k];
            if (typeof v === 'function') return;
            if (k.startsWith('_')) return;   // internal caches
            out[k] = v;
          });
          return out;
        };

        const slimTeams = this.state.teams.map(raw => {
          const t = serialisable(raw);
          const { roster, ...rest } = t;
          if (rest.simData) {
            const { rosterRef, ...sim } = rest.simData;
            rest.simData = sim;
          }
          return rest;
        });
        await db.teams.bulkAdd(slimTeams);
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
    'abilenechristian', 'airforce', 'akron', 'alabama', 'alabamaam', 'alabamastate', 'albany', 'alcornstate',
    'american', 'appalachianstate', 'arizona', 'arizonastate', 'arkansas', 'arkansaspinebluff', 'arkansasstate',
    'army', 'auburn', 'austinpeaystate', 'ballstate', 'baylor', 'bellarmine', 'belmont', 'bethunecookman',
    'binghamton', 'boisestate', 'boston', 'bostoncollege', 'bowlinggreen', 'bradley', 'brown', 'bryant', 'bucknell',
    'buffalo', 'butler', 'byu', 'cal', 'californiabaptist', 'calpoly', 'calstatefullerton', 'calstatenorthridge',
    'campbell', 'canisius', 'centralarkansas', 'centralconnecticut', 'centralmichigan', 'charleston',
    'charlestonsouthern', 'charlotte', 'chattanooga', 'chicagostate', 'cincinnati', 'citadel', 'clemson',
    'clevelandstate', 'coastalcarolina', 'colgate', 'colorado', 'coloradostate', 'columbia', 'connecticut',
    'coppinstate', 'cornell', 'creighton', 'csubakersfield', 'dartmouth', 'davidson', 'dayton', 'delaware',
    'delawarestate', 'denver', 'depaul', 'detroitmercy', 'drake', 'drexel', 'duke', 'duquesne', 'eastcarolina',
    'easternillinois', 'easternkentucky', 'easternmichigan', 'easternwashington', 'easttexasam', 'elon', 'etsu',
    'evansville', 'fairfield', 'fairleighdickinson', 'fiu', 'florida', 'floridaam', 'floridaatlantic',
    'floridagulfcoast', 'floridastate', 'fordham', 'fresnostate', 'furman', 'gardnerwebb', 'georgemason',
    'georgetown', 'georgewashington', 'georgia', 'georgiasouthern', 'georgiastate', 'gonzaga', 'gramblingstate',
    'grandcanyon', 'greenbay', 'gtech', 'hampton', 'harvard', 'hawaii', 'highpoint', 'hofstra', 'holycross',
    'houston', 'houstonchristian', 'howard', 'idaho', 'idahostate', 'illinois', 'illinoischicago', 'illinoisstate',
    'incarnateword', 'indiana', 'indianastate', 'iona', 'iowa', 'iowastate', 'iuindy', 'jacksonstate', 'jacksonville',
    'jacksonvillestate', 'jamesmadison', 'kansas', 'kansascity', 'kansasstate', 'kennesawstate', 'kentstate',
    'kentucky', 'lafayette', 'lamar', 'lasalle', 'lehigh', 'lemoyne', 'liberty', 'lindenwood', 'lipscomb',
    'littlerock', 'longbeachstate', 'longisland', 'longwood', 'louisiana', 'louisianamonroe', 'louisianatech',
    'louisville', 'loyolachicago', 'loyolamaryland', 'loyolamarymount', 'lsu', 'lsuneworleans', 'maine', 'manhattan',
    'marist', 'marquette', 'marshall', 'maryland', 'mcneesestate', 'memphis', 'mercer', 'mercyhurst', 'merrimack',
    'miami', 'miamioh', 'michigan', 'michiganstate', 'middletennessee', 'milwaukee', 'minnesota', 'mississippistate',
    'mississippivalleystate', 'missouri', 'missouristate', 'monmouth', 'montana', 'montanastate', 'moreheadstate',
    'morganstate', 'mountstmarys', 'murraystate', 'navy', 'nccu', 'ncstate', 'nebraska', 'nebraskaomaha', 'nevada',
    'newhampshire', 'newhaven', 'newmexico', 'newmexicostate', 'niagara', 'nichollsstate', 'njit', 'norfolkstate',
    'northalabama', 'northcarolinaat', 'northdakota', 'northdakotastate', 'northeastern', 'northernarizona',
    'northerncolorado', 'northernillinois', 'northerniowa', 'northernkentucky', 'northflorida', 'northtexas',
    'northwestern', 'northwesternstate', 'notredame', 'oakland', 'ohio', 'ohiostate', 'oklahoma', 'oklahomastate',
    'olddominion', 'olemiss', 'oralroberts', 'oregon', 'oregonstate', 'pacific', 'pennstate', 'pennsylvania',
    'pepperdine', 'pitt', 'portland', 'portlandstate', 'prairieviewam', 'presbyterian', 'princeton', 'providence',
    'purdue', 'purduefortwayne', 'queensofcharlotte', 'quinnipiac', 'radford', 'rhodeisland', 'rice', 'richmond',
    'rider', 'robertmorris', 'rutgers', 'sacramentostate', 'sacredheart', 'saintjosephs', 'saintlouis', 'saintmarys',
    'saintpeters', 'samford', 'samhoustonstate', 'sandiego', 'sanfrancisco', 'sanjosestate', 'santaclara', 'scar',
    'scstate', 'sdsu', 'seattle', 'setonhall', 'siena', 'siuedwardsville', 'smu', 'southalabama', 'southdakota',
    'southdakotastate', 'southeasternlouisiana', 'southeastmissouri', 'southern', 'southernillinois',
    'southernindiana', 'southernmiss', 'southernutah', 'southflorida', 'stanford', 'stbonaventure', 'stephenfaustin',
    'stetson', 'stjohns', 'stonehill', 'stonybrook', 'stthomas', 'syracuse', 'tarletonstate', 'tcu', 'temple',
    'tennessee', 'tennesseestate', 'tennesseetech', 'texas', 'texasam', 'texasamcorpuschristi', 'texassouthern',
    'texasstate', 'texastech', 'toledo', 'towson', 'troy', 'tulane', 'tulsa', 'uab', 'ucdavis', 'ucf', 'ucirvine',
    'ucla', 'ucriverside', 'ucsandiego', 'ucsantabarbara', 'umass', 'umasslowell', 'umbc', 'umes', 'unc',
    'uncasheville', 'uncg', 'uncw', 'unlv', 'usc', 'uscupstate', 'utah', 'utahstate', 'utahtech', 'utahvalley',
    'utarlington', 'utep', 'utmartin', 'utrgv', 'utsa', 'valparaiso', 'vanderbilt', 'vcu', 'vermont', 'villanova',
    'virginia', 'virginiatech', 'vmi', 'wagner', 'wakeforest', 'washington', 'wazzou', 'weberstate',
    'westerncarolina', 'westernillinois', 'westernkentucky', 'westernmichigan', 'westflorida', 'westgeorgia',
    'westvirginia', 'wichitastate', 'williammary', 'winthrop', 'wisconsin', 'wofford', 'wrightstate', 'wyoming',
    'xavier', 'yale', 'youngstownstate'
  ]),

  _logoCache: {},

  getTeamLogo(schoolName) {
    if (!schoolName || schoolName === 'Free Agent' || schoolName === 'Uncommitted') return '';
    // The all-star teams (East/West, Team Air/Team Flight, USA/World).
    const star = typeof HSCore !== 'undefined' && HSCore.TEAM_STYLE[schoolName];
    if (star && !this.findTeam(schoolName)) return `../schoollogos/${star.logo}.png`;
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
  // no network request, no file to manage. Every Division I school in
  // TeamsMaster has a file now, so this only covers a name the sheet uses
  // that doesn't resolve to one.
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
      const rostersUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=0&single=true&output=csv";

      // Rosters and recruits are the critical data, so they're fetched on
      // their own. Coaches are loaded afterwards, separately: firing three
      // simultaneous requests at the same published sheet can get one of
      // them throttled, and a throttled coaches request must never be able
      // to take the rosters down with it.
      // The recruiting database has a tab per class plus "Others";
      // RecruitSheet reads every tab (see recruit-sheet.js).
      // The roster sheet has a tab per season; RosterSheet reads them all
      // (see roster-sheet.js). Without it, the single roster tab is read.
      const loadRosters = typeof RosterSheet !== 'undefined'
        ? RosterSheet.load(t => this.parseCSV(t)).then(r => {
            if (r.failed.length) console.warn('Roster tabs that failed to load:', r.failed.join(', '));
            return r.rows.length ? { ok: true, rows: r.rows } : { ok: false };
          })
        : this.fetchWithRetry(rostersUrl).then(async res => (res.ok ? { ok: true, rows: this.parseCSV(await res.text()) } : { ok: false }));
      await this.loaderStep('Pulling rosters and recruiting classes from the database…', 0.12);
      const [recruitLoad, rostersRes] = await Promise.all([
        RecruitSheet.load(t => this.parseCSV(t), { yearKey: 'classyear', nameKey: 'name' }),
        loadRosters
      ]);
      const recruitsOk = recruitLoad.rows.length > 0;
      rawRecruits = recruitLoad.rows;
      this.state.genResets = typeof RecruitGen !== 'undefined' && RecruitGen.getResets ? RecruitGen.getResets() : {};
      if (recruitLoad.failed.length) console.warn('Recruiting tabs that failed to load:', recruitLoad.failed.join(', '));
      if (rostersRes.ok) {
        const rawRosters = rostersRes.rows;
        // Retained in full: rows for future seasons are how the sheet
        // expresses a predetermined transfer (same player, different team,
        // next year), which the offseason reads below.
        this.state.rawRosterRows = rawRosters;
        let skippedFutureSeasons = 0;
        const laterSeason = this.laterSeasonRows(rawRosters);
        rawRosters.forEach(rawPlayer => {
          if (!this.rowHasPlayerName(rawPlayer)) return;
          if (!this.rowBelongsToCurrentSeason(rawPlayer) || laterSeason.has(rawPlayer)) { skippedFutureSeasons++; return; }

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
      if (!recruitsOk && !rostersRes.ok) sheetsReachable = false;
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
    await this.loaderStep('Loading head coaches…', 0.45);
    await this.loadCoaches();
    await this.loaderStep('Signing recruiting classes…', 0.55);

    this.state.recruits = rawRecruits
      .filter(r => this.rowHasPlayerName(r))
      .map(r => {
        const o = this.normalizePlayerObj(r, true);
        // "Others" tab: background for players already on rosters, never
        // incoming recruits of their own.
        if (r.__tab === 'Others') o.fromOthers = true;
        return o;
      });
    this.state.allRecruits = [...this.state.recruits];
    this.refreshRecruitPool();
    await this.loaderStep('Building every Division I program…', 0.62);
    this.buildFullD1Universe(Object.values(realTeamsMap));

    if (this.state.teams.length === 0) {
      this.logNews("Could not build a universe from sheets or the master team list. Check your data sources.");
      return;
    }

    await this.loaderStep('Setting the schedule and the preseason poll…', 0.74);
    this.initSeasonData();
    this.refreshProPool();
    this.updateProSeasons();
    this.advanceHsCalendar();
    // The summer before the first season: every class starts with one.
    await this.loaderStep('Playing the summer circuit…', 0.8);
    try { this.playOpeningSummer(); } catch (e) { console.warn('The opening summer:', e); }
    await this.loaderStep('Filling in the dashboard…', 0.86);
    this.syncUI();
    await this.loaderStep('Saving your universe…', 0.93);
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
      coachProfileFor: coachLookup,
      programLevelFor: (typeof Prestige !== 'undefined')
        ? (name, conf) => Prestige.programLevel(Prestige.historyScore(name, conf))
        : null
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
    this.refreshPrestige();
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

  // A sheet with no season column is meant to hold one season. If a player
  // still appears more than once (a later season's row left in), only his
  // earliest class year is this season; the others are set aside so he
  // isn't loaded twice.
  laterSeasonRows(rows) {
    const later = new Set();
    if (rows.some(r => this.getRowSeasonYear(r) !== null)) return later;
    const ORDER = { FR: 1, SO: 2, JR: 3, SR: 4, GR: 5 };
    const byName = {};
    rows.forEach(r => {
      if (!this.rowHasPlayerName(r)) return;
      const key = String(r.name || r.player || r.fullname).trim().toLowerCase();
      (byName[key] = byName[key] || []).push(r);
    });
    Object.values(byName).forEach(list => {
      if (list.length < 2) return;
      const rank = r => ORDER[this.normalizeClassStanding(r.class || r.yr || r.classstanding)] || 3;
      const keep = list.reduce((a, b) => (rank(b) < rank(a) ? b : a));
      list.forEach(r => { if (r !== keep) later.add(r); });
    });
    return later;
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

  // Offensive archetypes, and what each does to a player's college role.
  //
  // High-school production does not carry over. A dominant prep big goes
  // from 18/12/4 against children to a defined role against adults, and
  // the size of that drop depends almost entirely on WHAT he is rather
  // than how good he was. A designated scorer is recruited to score and
  // keeps his usage; a roll big only ever sees pick-and-roll finishes and
  // put-backs, so his usage collapses even if his rebounding stays elite.
  //
  //   usage   multiplier on scoring share
  //   par     multiplier on three-point attempt rate
  //   oreb    multiplier on offensive rebounding
  //   ast     multiplier on assists
  ARCHETYPES: {
    primaryScorer: { usage: 0.96, par: 0.98, oreb: 0.90, ast: 1.00, ftr: 1.10 },
    postHub:       { usage: 1.10, par: 0.55, oreb: 1.05, ast: 1.30, ftr: 1.18 },
    slasher:       { usage: 0.92, par: 0.72, oreb: 1.00, ast: 0.95, ftr: 1.22 },
    playmaker:     { usage: 0.86, par: 0.88, oreb: 0.75, ast: 1.35, ftr: 1.00 },
    shooter:       { usage: 0.72, par: 1.40, oreb: 0.60, ast: 0.80, ftr: 0.58 },
    // A roll big finishes far more possessions than his usage suggests:
    // every lob, dump-off and put-back is a shot, and he gets fouled on
    // most of them. Suppressing his volume too hard pushed those attempts
    // out to the guards.
    rollBig:       { usage: 1.02, par: 0.14, oreb: 1.22, ast: 0.60, ftr: 1.12 },
    defender:      { usage: 0.72, par: 0.85, oreb: 1.00, ast: 0.85, ftr: 1.00 },
    connector:     { usage: 0.78, par: 0.95, oreb: 0.90, ast: 1.10, ftr: 1.00 }
  },

  // The roster sheet's Strength 1-3 and Weakness 1-2 columns: a fixed
  // dropdown vocabulary, so each pick has one known effect instead of being
  // fuzzy-matched. Cells are matched ignoring case, spaces and punctuation.
  //   play    tendency multipliers (see buildPlaystyleProfile)
  //   stat    adjustments to his projected line (buildBaseStatExpectations):
  //           tov, pf and fta multiply; twoP is added to 2P%; dbpm is added
  //   impact  rating points added to his part of the team rating, which is
  //           what decides games. It's how a trait that barely shows in a
  //           box score (IQ, physicality, defense) still wins or loses them.
  STRENGTH_TRAITS: {
    shooter:          { label: 'Shooter', play: { threePar: 1.18, threePct: 1.10 } },
    playmaker:        { label: 'Playmaker', play: { ast: 1.18 } },
    rebounder:        { label: 'Rebounder', play: { reb: 1.14 } },
    rimprotector:     { label: 'Rim Protector', play: { blk: 1.20 }, stat: { dbpm: 0.8 }, impact: 0.6 },
    lockdowndefender: { label: 'Lockdown Defender', play: { stl: 1.16 }, stat: { dbpm: 1.0 }, impact: 0.8 },
    bucketgetter:     { label: 'Bucket Getter', play: { score: 1.15 } },
    iq:               { label: 'IQ', stat: { tov: 0.72, pf: 0.82, twoP: 0.010 }, impact: 1.0 },
    physicals:        { label: 'Physicals', play: { reb: 1.06 }, stat: { fta: 1.12, twoP: 0.012, dbpm: 0.5 }, impact: 0.6 }
  },
  WEAKNESS_TRAITS: {
    streakyshooter:       { label: 'Streaky Shooter', play: { threePct: 0.86, threePar: 0.90 } },
    poorfreethrowshooter: { label: 'Poor Free Throw Shooter', play: { ftPct: 0.82 } },
    defense:              { label: 'Defense', play: { stl: 0.85, blk: 0.90 }, stat: { dbpm: -1.5 }, impact: -1.2 },
    shotblocking:         { label: 'Shot Blocking', play: { blk: 0.68 } },
    rebounding:           { label: 'Rebounding', play: { reb: 0.84 } },
    iq:                   { label: 'IQ', play: { ast: 0.88, threePct: 0.96 }, stat: { tov: 1.30, pf: 1.12, twoP: -0.015 }, impact: -1.0 }
  },
  // Other spellings people reach for. "Tunnel Vision" was the old name for
  // the IQ weakness.
  TRAIT_ALIASES: {
    tunnelvision: 'iq', basketballiq: 'iq', highiq: 'iq', lowiq: 'iq',
    physical: 'physicals', physicality: 'physicals', strength: 'physicals',
    poorfreethrow: 'poorfreethrowshooter', freethrows: 'poorfreethrowshooter', freethrowshooting: 'poorfreethrowshooter',
    poordefense: 'defense', baddefense: 'defense', defender: 'defense',
    rimprotection: 'rimprotector', shotblocker: 'shotblocking', rebounder: 'rebounder'
  },
  // Clamp bounds for each tendency multiplier — shared by the free-text
  // scouting-tag nudges, the dropdown traits and the stat projection.
  PLAYSTYLE_BOUNDS: {
    threePar: [0.35, 1.75], threePct: [0.80, 1.22], ast: [0.78, 1.28],
    reb: [0.80, 1.14], blk: [0.65, 1.25], stl: [0.78, 1.22],
    score: [0.82, 1.20], ftPct: [0.80, 1.15]
  },

  // Athleticism and Potential are letter grades, graded the way an NBA
  // scout would grade a prospect: B is a typical draftable player.
  GRADE_STEPS: ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'],
  // Rating points a player can still grow by, per Potential grade.
  POTENTIAL_HEADROOM: [0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 15, 18],

  // "A+", "b-", "C" -> the grade as written in GRADE_STEPS, or null.
  parseGrade(v) {
    const m = String(v || '').trim().toUpperCase().match(/^([A-DF])\s*([+-])?$/);
    if (!m) return null;
    const g = m[1] + (m[2] || '');
    if (this.GRADE_STEPS.includes(g)) return g;
    return m[1] === 'F' ? 'F' : null;
  },

  // Athleticism: a C+ is a typical D1 athlete (75, no effect) and each step
  // is about four points, from F (50) to A+ (99). Potential: his rating
  // ceiling is his current rating plus the grade's headroom. A plain number
  // in either column still works the way it always did.
  readGrades(getVal, rating) {
    const athRaw = getVal(['athleticism', 'ath', 'athlete'], '');
    const potRaw = getVal(['potential', 'pot', 'ceiling'], '');
    const athGrade = this.parseGrade(athRaw), potGrade = this.parseGrade(potRaw);
    // A plain number only counts if it's on the 0-100 scale; anything else
    // (a draft pick typed into the wrong column, say) is ignored.
    const plain = v => { const n = Number(String(v).trim()); return n > 0 && n <= 100 ? n : null; };
    const athleticism = athGrade
      ? Math.round(50 + this.GRADE_STEPS.indexOf(athGrade) * 49 / 12)
      : plain(athRaw);
    const potential = potGrade
      ? Math.min(99, Math.round((parseFloat(rating) || 70) + this.POTENTIAL_HEADROOM[this.GRADE_STEPS.indexOf(potGrade)]))
      : plain(potRaw);
    return { athleticism, potential, athleticismGrade: athGrade, potentialGrade: potGrade };
  },

  traitKey(v) {
    const k = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
    return this.TRAIT_ALIASES[k] || k;
  },

  // Reads the Strength 1-3 / Weakness 1-2 cells. Anything that isn't in the
  // vocabulary is handed back as free text so it can still be read like a
  // scouting note rather than thrown away.
  readTraits(getVal) {
    const out = { strengths: [], weaknesses: [], extraStrengthText: '', extraWeakText: '' };
    const take = (keys, map, list, extraKey) => {
      keys.forEach(k => {
        const raw = String(getVal([k], '') || '').trim();
        if (!raw) return;
        const t = map[this.traitKey(raw)];
        if (t) { if (!list.includes(t.label)) list.push(t.label); }
        else out[extraKey] += ' ' + raw;
      });
    };
    take(['strength1', 'strength2', 'strength3', 'strength'], this.STRENGTH_TRAITS, out.strengths, 'extraStrengthText');
    take(['weakness1', 'weakness2', 'weakness'], this.WEAKNESS_TRAITS, out.weaknesses, 'extraWeakText');
    return out;
  },

  PLAYSTYLE_KEYS: ['score', 'reb', 'ast', 'stl', 'blk', 'threePar', 'threePct', 'ftPct'],

  playstyleValues(prof) {
    const out = {};
    this.PLAYSTYLE_KEYS.forEach(k => { out[k] = prof && prof[k] !== undefined ? prof[k] : 1; });
    return out;
  },

  applyTraitMultipliers(prof, traits) {
    const apply = t => Object.keys((t && t.play) || {}).forEach(k => {
      const [lo, hi] = this.PLAYSTYLE_BOUNDS[k];
      prof[k] = Math.max(lo, Math.min(hi, prof[k] * t.play[k]));
    });
    ((traits && traits.strengths) || []).forEach(l => apply(this.STRENGTH_TRAITS[this.traitKey(l)]));
    ((traits && traits.weaknesses) || []).forEach(l => apply(this.WEAKNESS_TRAITS[this.traitKey(l)]));
  },

  // Rebuilds a player's playstyle from its trait-free base plus the traits
  // he has now. A new object, so a profile shared with the recruiting
  // database's record is never changed underneath it.
  applyTraitsToPlaystyle(player) {
    if (!player) return;
    const old = player.playstyle;
    if (!old && !player.traits) return;
    const base = (old && old.base) || this.playstyleValues(old);
    const prof = { ...(old || { usage: 1 }), ...base, base: { ...base } };
    this.applyTraitMultipliers(prof, player.traits);
    if (!prof.archetype) {
      const text = ((player.traits && player.traits.strengths) || []).join(' ').toLowerCase();
      prof.archetype = this.classifyArchetype(text, player.pos);
    }
    player.playstyle = prof;
  },

  // Everything a player's traits do outside the playstyle multipliers.
  traitEffects(player) {
    const e = { tov: 1, pf: 1, fta: 1, twoP: 0, dbpm: 0, impact: 0 };
    const tr = player && player.traits;
    if (!tr) return e;
    const add = (t) => {
      if (!t) return;
      const s = t.stat || {};
      ['tov', 'pf', 'fta'].forEach(k => { if (s[k]) e[k] *= s[k]; });
      e.twoP += s.twoP || 0;
      e.dbpm += s.dbpm || 0;
      e.impact += t.impact || 0;
    };
    (tr.strengths || []).forEach(l => add(this.STRENGTH_TRAITS[this.traitKey(l)]));
    (tr.weaknesses || []).forEach(l => add(this.WEAKNESS_TRAITS[this.traitKey(l)]));
    return e;
  },

  classifyArchetype(text, pos) {
    const t = (text || '').toLowerCase();
    const p = String(pos || '').toUpperCase();
    const has = (...words) => words.some(w => t.includes(w));
    const isBig = ['C', 'PF', 'F/C'].includes(p);

    // Order matters: the most defining trait wins.
    if (has('lob threat', 'rim runner', 'roll man', 'vertical spacer', 'play finisher', 'screen and roll', 'pick-and-roll finisher')) return 'rollBig';
    if (isBig && has('post-up', 'post up', 'back to the basket', 'post hub', 'passing big', 'high-post')) return 'postHub';
    if (has('three level scorer', 'three-level scorer', 'bucket getter', 'shot creator', 'shot creation', 'primary scorer', 'go-to scorer', 'iso scorer', 'scoring guard')) return 'primaryScorer';
    if (has('floor general', 'pure point', 'primary playmaker', 'elite passer', 'court vision', 'pass first', 'facilitator')) return 'playmaker';
    if (has('spot-up', 'spot up', 'catch and shoot', 'catch-and-shoot', 'movement shooter', 'sharpshooter', 'knockdown shooter', 'floor spacer', 'specialist')) return 'shooter';
    if (has('downhill', 'slasher', 'attacks the rim', 'rim pressure', 'driving', 'explosive finisher')) return 'slasher';
    if (has('lockdown', 'point of attack', 'defensive specialist', 'elite rim protection', 'rim protector', 'stopper')) return 'defender';
    if (has('glue guy', 'connector', 'role player', 'does the little things')) return 'connector';

    // Nothing decisive: infer a sensible default from position.
    if (isBig) return 'rollBig';
    if (p === 'PG') return 'playmaker';
    return 'connector';
  },

  // Reads a recruit's actual pre-college statistics.
  //
  // The recruiting sheet carries four full stat tiers — hs_, aau_, fiba_
  // and intl_ — each with box score, advanced and shot-location columns.
  // AAU is preferred over high school: it's played against real recruits
  // rather than whoever happened to attend the same school, so it's much
  // closer to what a player looks like in college. High school is the
  // fallback, then international competition.
  //
  // Column names here mirror the recruiting page's own schema exactly
  // (hs_ppg, aau_usg, hs_rimFga and so on), so the whole tier is read
  // rather than the handful of names that happened to overlap.
  // His written lines by level (high school, AAU, FIBA), kept compact in
  // the save: what his summers are modeled on (SummerCore.LINE_KEYS order).
  // Impossible cells (a percentage over 100, sixty threes a game) are left
  // out rather than believed.
  readWrittenTiers(raw) {
    const KEYS = ['gp', 'mpg', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg', 'fg2', 'fg3', 'ft', 'fga2', 'fga3', 'fta'];
    const MAX = { mpg: 48, ppg: 60, rpg: 30, apg: 20, spg: 10, bpg: 10, topg: 12, fg2: 100, fg3: 100, ft: 100, fga2: 30, fga3: 15, fta: 20 };
    const out = {};
    ['hs', 'aau', 'fiba'].forEach(t => {
      const n = k => {
        const v = raw[t + k.toLowerCase()];
        if (v === undefined || v === null || v === '') return null;
        const x = parseFloat(String(v).replace('%', ''));
        return isNaN(x) || x < 0 || (MAX[k] != null && x > MAX[k]) ? null : Math.round(x * 10) / 10;
      };
      const gp = n('gp'), ppg = n('ppg'), mpg = n('mpg');
      if (!gp || ppg == null || !mpg) return;
      out[t] = KEYS.map(n);
    });
    return Object.keys(out).length ? out : null;
  },

  readRecruitTier(raw) {
    const TIERS = ['aau', 'hs', 'fiba', 'intl'];
    const num = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = parseFloat(String(v).replace('%', ''));
      return isNaN(n) ? null : n;
    };

    for (const tier of TIERS) {
      const get = (col) => raw[tier + col];
      const ppg = num(get('ppg'));
      // A tier counts as present only if it has real production in it.
      if (ppg === null || num(get('gp')) === 0) continue;

      return {
        tier,
        gp: num(get('gp')), mpg: num(get('mpg')),
        ppg, rpg: num(get('rpg')), apg: num(get('apg')),
        spg: num(get('spg')), bpg: num(get('bpg')), topg: num(get('topg')),
        usg: num(get('usg')), bpm: num(get('bpm')),
        ts: num(get('ts')), efg: num(get('efg')),
        orebPct: num(get('oreb')), drebPct: num(get('dreb')), trbPct: num(get('trb')),
        astPct: num(get('ast')), blkPct: num(get('blk')), stlPct: num(get('stl')),
        ftr: num(get('ftr')), p3ar: num(get('p3ar')),
        fga3: num(get('fga3')), fga2: num(get('fga2')), fta: num(get('fta')),
        rimFga: num(get('rimfga')), longMidFga: num(get('longmidfga')),
        fg3: num(get('fg3')), ft: num(get('ft'))
      };
    }
    return null;
  },

  // What a recruit actually produced, translated to the college game: every
  // tier he has a line in (high school, AAU, FIBA, international), weighted
  // by how much he played and by how close the level is to college. These
  // anchor his efficiency and shot profile in the simulation (see
  // buildBaseStatExpectations), so a big who shoots 65% on twos at every
  // level of high-school ball keeps finishing like one in college.
  // Numbers that can't be right (a 60-a-game three-point volume, a
  // percentage over 100) are skipped rather than trusted.
  recruitProduction(raw) {
    const num = v => {
      if (v === undefined || v === null || v === '') return null;
      const n = parseFloat(String(v).replace('%', ''));
      return isNaN(n) ? null : n;
    };
    const pctOk = v => v !== null && v >= 0 && v <= 100;
    // How far each level is from college, and how much it counts.
    const LEVEL = {
      hs:   { w: 1.0, d2: 0.040, d3: 0.035 },
      aau:  { w: 1.3, d2: 0.025, d3: 0.025 },
      fiba: { w: 1.2, d2: 0.020, d3: 0.020 },
      intl: { w: 1.4, d2: 0.010, d3: 0.010 }
    };
    const acc = {}, per36 = {};
    const add = (k, v, w) => { if (v === null || !(w > 0)) return; acc[k] = acc[k] || [0, 0]; acc[k][0] += v * w; acc[k][1] += w; };
    let gpTotal = 0;
    Object.keys(LEVEL).forEach(t => {
      const g = c => num(raw[t + c]);
      const gp = g('gp'), ppg = g('ppg');
      if (!(gp > 0) || ppg === null) return;
      const L = LEVEL[t];
      const w = gp * Math.max(10, g('mpg') || 25) * L.w;
      gpTotal += gp;
      let fga2 = g('fga2'), fga3 = g('fga3');
      if (fga3 !== null && (fga3 > 25 || (fga2 !== null && fga3 > fga2 * 4 + 6))) fga3 = null;   // a typo, not a volume
      if (fga2 !== null && fga2 > 35) fga2 = null;
      const fg2 = g('fg2'), fg3 = g('fg3'), ft = g('ft'), fta = g('fta');
      if (pctOk(fg2) && fg2 > 20) add('fg2', fg2 / 100 - L.d2, w * Math.max(1, fga2 || 6));
      if (pctOk(fg3) && fga3 !== null && fga3 > 0) add('fg3', fg3 / 100 - L.d3, w * fga3);
      if (pctOk(ft) && ft > 20) add('ft', ft / 100, w * Math.max(0.5, fta || 3));
      let par = g('p3ar');
      if (par !== null && par > 1) par = par / 100;
      if (par === null && fga3 !== null && fga2 !== null && fga2 + fga3 > 0) par = fga3 / (fga2 + fga3);
      if (par !== null && par >= 0 && par <= 1) add('p3ar', par, w);
      const ast = g('ast'), trb = g('trb'), usg = g('usg');
      if (pctOk(ast)) add('astPct', ast, w);
      if (pctOk(trb)) add('trbPct', trb, w);
      if (pctOk(usg) && usg > 3) add('usg', usg, w);
      if (fga3 !== null) add('fga3', fga3, w);
      if (fta !== null && fta < 25) add('fta', fta, w);
      // Per 36 minutes at this level, for the summer circuit to lean on.
      const mpg = g('mpg') > 4 ? g('mpg') : 28;
      const per = v => (v !== null && v >= 0 && v < 60 ? Math.round(v * 36 / mpg * 10) / 10 : null);
      const line = { pts: per(ppg), reb: per(g('rpg')), ast: per(g('apg')), stl: per(g('spg')), blk: per(g('bpg')), fta: per(fta) };
      if (line.pts !== null && line.pts < 55) {
        Object.keys(line).forEach(k => { if (line[k] === null) line[k] = k === 'pts' ? 0 : null; });
        per36[t] = line;
      }
    });
    const out = {};
    Object.keys(acc).forEach(k => { out[k] = Math.round(acc[k][0] / acc[k][1] * 1000) / 1000; });
    if (!Object.keys(out).length) return null;
    out.gp = gpTotal;
    if (Object.keys(per36).length) out.per36 = per36;
    return out;
  },

  // Classifies a recruit from what he actually did, falling back to the
  // scouting text only when the numbers aren't there. Shot location is the
  // single most telling signal: a big whose attempts are nearly all at the
  // rim is a roll man, one who posts real usage and assist rates is a hub.
  archetypeFromStats(t, pos) {
    if (!t) return null;
    const p = String(pos || '').toUpperCase();
    const isBig = ['C', 'PF', 'F/C'].includes(p);
    const isGuard = ['PG', 'SG', 'G', 'CG'].includes(p);

    const par = t.p3ar !== null ? t.p3ar : (t.fga3 !== null && t.fga2 !== null && (t.fga3 + t.fga2) > 0
      ? t.fga3 / (t.fga3 + t.fga2) : null);
    const rimShare = (t.rimFga !== null && t.fga2) ? t.rimFga / Math.max(1, t.fga2) : null;
    const usg = t.usg;

    if (isBig) {
      const rimHeavy = (rimShare !== null && rimShare >= 0.62) || (par !== null && par <= 0.12);
      if (usg !== null && usg >= 24 && (t.astPct === null || t.astPct >= 10)) return 'postHub';
      if (rimHeavy && (usg === null || usg < 22)) return 'rollBig';
      if (par !== null && par >= 0.35) return 'shooter';
      return usg !== null && usg >= 22 ? 'postHub' : 'rollBig';
    }

    if (usg !== null && usg >= 28) return 'primaryScorer';
    if (t.astPct !== null && t.astPct >= 24 && isGuard) return 'playmaker';
    if (par !== null && par >= 0.55 && (usg === null || usg < 22)) return 'shooter';
    if (rimShare !== null && rimShare >= 0.55) return 'slasher';
    if (t.stlPct !== null && t.stlPct >= 3.2 && (usg === null || usg < 20)) return 'defender';
    if (usg !== null && usg >= 23) return 'primaryScorer';
    return 'connector';
  },

  buildPlaystyleProfile(raw, getVal) {
    const prof = { score: 1, reb: 1, ast: 1, stl: 1, blk: 1, threePar: 1, threePct: 1, ftPct: 1, usage: 1 };
    let found = false;

    const pos = getVal(['pos', 'position'], '');
    const tier = this.readRecruitTier(raw);

    if (tier) {
      found = true;
      prof.sourceTier = tier.tier;
      prof.priorUsage = tier.usg;
      prof.real = this.recruitProduction(raw);

      // Rates are compared against typical high-major prospect levels and
      // clamped tightly — these describe a player's tendencies, they don't
      // scale his college production up. Amplifying here is what used to
      // send imported recruits past anything a generated player could do.
      const ratio = (v, typical, lo, hi) =>
        v === null ? 1 : Math.max(lo, Math.min(hi, v / typical));

      prof.reb = ratio(tier.trbPct, 11, 0.85, 1.14);
      prof.ast = ratio(tier.astPct, 16, 0.78, 1.28);
      prof.stl = ratio(tier.stlPct, 2.6, 0.82, 1.22);
      prof.blk = ratio(tier.blkPct, 3.0, 0.80, 1.25);
      prof.score = ratio(tier.usg, 24, 0.82, 1.20);

      const par = tier.p3ar !== null ? tier.p3ar
        : (tier.fga3 !== null && tier.fga2 !== null && (tier.fga3 + tier.fga2) > 0
            ? tier.fga3 / (tier.fga3 + tier.fga2) : null);
      prof.threePar = par === null ? 1 : Math.max(0.35, Math.min(1.75, par / 0.35));
      prof.threePct = ratio(tier.fg3, 34, 0.80, 1.22);
      prof.ftPct = ratio(tier.ft, 72, 0.85, 1.15);
    }

    // The Strength / Weakness dropdowns. A cell that isn't one of the
    // listed traits is read below as a scouting note instead.
    const traits = this.readTraits(getVal);

    // Scouting text still contributes, but only where the numbers are
    // silent — it's a description of a player, not a measurement of him.
    const tags = (getVal(['strengths'], '') + ' ' + getVal(['scouting'], '') + ' ' + getVal(['attributes'], '') + ' ' + traits.extraStrengthText).toLowerCase();
    const weak = (getVal(['weaknesses'], '') + ' ' + traits.extraWeakText).toLowerCase();
    const has = (txt, ...words) => words.some(w => txt.includes(w));

    if (tags.trim() || weak.trim()) {
      found = true;
      const nudge = (key, mult, lo, hi) => { prof[key] = Math.max(lo, Math.min(hi, prof[key] * mult)); };
      if (has(tags, 'shoot', 'shooter', 'stroke', 'range', 'spacing')) { nudge('threePar', 1.12, 0.35, 1.75); nudge('threePct', 1.05, 0.80, 1.22); }
      if (has(tags, 'playmak', 'passer', 'passing', 'vision', 'facilitat')) nudge('ast', 1.12, 0.78, 1.28);
      if (has(tags, 'rebound', 'glass', 'motor')) nudge('reb', 1.08, 0.85, 1.14);
      if (has(tags, 'rim protect', 'shot block', 'block')) nudge('blk', 1.12, 0.80, 1.25);
      if (has(tags, 'defend', 'defense', 'lockdown', 'perimeter d')) nudge('stl', 1.10, 0.82, 1.22);
      if (has(tags, 'scorer', 'bucket', 'three level', 'shot creat', 'iso')) nudge('score', 1.08, 0.82, 1.20);
      if (has(weak, 'shoot', 'jumper', 'range')) { nudge('threePct', 0.90, 0.80, 1.22); nudge('threePar', 0.88, 0.35, 1.75); }
      if (has(weak, 'playmak', 'passing', 'tunnel')) nudge('ast', 0.88, 0.78, 1.28);
      if (has(weak, 'free throw')) nudge('ftPct', 0.92, 0.85, 1.15);
    }

    // Dropdown picks are exact, so they apply on top of any free text. The
    // profile before them is kept as `base`, so a later season's tab (or a
    // merge with the recruiting database) can re-apply a player's current
    // traits without stacking them on top of old ones.
    prof.base = this.playstyleValues(prof);
    if (traits.strengths.length || traits.weaknesses.length) {
      found = true;
      this.applyTraitMultipliers(prof, traits);
    }

    // Statistics decide the archetype where they exist; text is the
    // fallback for recruits without a stat line. The strength picks count
    // as text here: "Bucket Getter", "Rim Protector" and "Lockdown
    // Defender" read straight through as archetype hints.
    const archetypeText = `${tags} ${traits.strengths.join(' ').toLowerCase()}`;
    prof.archetype = this.archetypeFromStats(tier, pos) || this.classifyArchetype(archetypeText, pos);

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
      // Measurements and the scouting report from the recruiting database
      // feed the draft combine (see draft-cycle.js).
      wingspan: getVal(['wingspan', 'wing'], '') || null,
      scout: (() => {
        const cut = v => String(v || '').trim().slice(0, 240);
        const sc = { scouting: cut(getVal(['scouting', 'scoutingreport', 'report'], '')), strengths: cut(getVal(['strengths'], '')), weaknesses: cut(getVal(['weaknesses'], '')) };
        return sc.scouting || sc.strengths || sc.weaknesses ? sc : null;
      })(),
      // A clean Hometown column is read as-is. Older sheets instead put a
      // hometown OR a transfer note ("T - Ohio") in one FROM column, so
      // that fallback still filters the note out rather than showing it
      // as a hometown.
      hometown: (() => {
        const h = String(getVal(['hometown', 'home', 'from'], 'N/A'));
        return /^T\s*-/i.test(h) ? 'N/A' : h;
      })(),
      // Scripted draft slot from the sheet's Draft column, e.g. "2030 R:1 P:3".
      scriptedDraft: this.parseDraftSpec(getVal(['draft', 'draftpick', 'scripteddraft'], '')),
      hs: getVal(['hs', 'highschool', 'prep', 'prepschool'], ''),
      jersey: String(getVal(['jersey', 'number', 'num', 'jerseynumber', 'uniform'], '')).replace(/[^0-9]/g, ''),
      // Optional authoring columns. None of these are displayed anywhere —
      // they exist purely so the sheet can steer the simulation directly.
      //   Role           focal point / starter / sixth man / rotation / bench
      //   Strength 1-3   dropdown picks from STRENGTH_TRAITS above
      //   Weakness 1-2   dropdown picks from WEAKNESS_TRAITS above
      //   Attributes     legacy free-text tags, parsed like scouting strengths
      //   Athleticism    letter grade (or legacy 0-100): finishing, steals,
      //                  rebounding and combine testing
      //   Potential      letter grade (or legacy rating ceiling): how far he
      //                  can develop, and how NBA teams value his upside
      role: String(getVal(['role', 'playerrole', 'usage'], '')).trim().toLowerCase(),
      attributes: String(getVal(['attributes', 'attribute', 'traits', 'tags'], '')).trim(),
      traits: (() => {
        const t = this.readTraits(getVal);
        return t.strengths.length || t.weaknesses.length ? { strengths: t.strengths, weaknesses: t.weaknesses } : null;
      })(),
      ...this.readGrades(getVal, rating),
      // National recruit ranking, used by the draft big board's pedigree term.
      rsci: parseFloat(getVal(['rsci', 'rank', 'nationalrank', 'ranking'], '')) || null,
      stars: parseFloat(getVal(['stars', 'star'], '')) || null,
      avatar: String(getVal(['avatar', 'pfp', 'photo', 'headshot'], '') || '').trim(),
      state: String(getVal(['state'], '') || '').trim(),
      // Recruiting-sheet background the high-school season plays out (see
      // hs-season.js): birthdate, last club, an explicit reclassification,
      // and all-star selections from the accolades column.
      dob: String(getVal(['dob', 'birthdate', 'dateofbirth', 'born'], '') || '').trim(),
      // The recruiting service's own rating, before it's mapped to the
      // college scale (international pros are valued from it).
      recRating: isRecruit ? (parseFloat(rawRating) || null) : null,
      intlTeam: String(getVal(['intlteam'], '') || '').trim(),
      proClub: String(getVal(['proclub'], '') || '').trim(),
      reclassFrom: parseInt(getVal(['reclass', 'reclassfrom', 'originalclass'], ''), 10) || null,
      allStar: (() => {
        const a = String(getVal(['accolades'], '') || '').toLowerCase();
        return a ? { mcd: /mcdonald/.test(a), jbc: /jordan brand/.test(a), nhs: /hoop summit/.test(a) } : null;
      })(),
      // Schools this player has suited up for, oldest first. Transfers
      // aren't simulated yet, so this is normally just the current school —
      // but the field exists so a transfer only has to append to it.
      collegeHistory: (() => {
        // Players who transferred before the simulation began carry their
        // prior stop in a "Transferred From" column (or the legacy
        // "Previous School").
        const prev = getVal(['transferredfrom', 'previousschool', 'prevschool', 'formerschool', 'transferfrom'], '');
        return prev && prev !== school ? [prev, school] : [school];
      })(),
      playstyle: this.buildPlaystyleProfile(raw, getVal),
      rating: rating,
      isRecruit: isRecruit,
      // Generated to fill out the class (see recruit-gen.js).
      genRecruit: isRecruit && /^true$/i.test(String(getVal(['generated'], ''))),
      // Live recruiting (recruit-live.js): his offers, his AAU team, and
      // whether the recruiting sheet itself committed him (those never move).
      offers: isRecruit ? String(getVal(['offers'], '') || '').split(',').map(x => x.trim()).filter(Boolean) : undefined,
      aauTeam: isRecruit ? String(getVal(['aauteam'], '') || '').trim() : undefined,
      written: isRecruit ? this.readWrittenTiers(raw) : undefined,
      country: isRecruit ? String(getVal(['country', 'nation'], '') || '').trim() : undefined,
      sheetCommitted: isRecruit && !/^true$/i.test(String(getVal(['generated'], ''))) && !!school && !/^(uncommitted|uncommited|undecided|free agent|n\/a|none|tbd|-)$/i.test(String(school).trim()),
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
    const othersRows = (this.state.allRecruits || []).filter(r => r.fromOthers);
    this.state.recruits.filter(r => !r.fromOthers).concat(othersRows).forEach(rec => {
      // "Others" rows only add background to a player the roster sheet
      // already has, wherever he plays now. They never create a player.
      if (rec.fromOthers) {
        const nm = String(rec.name || '').trim().toLowerCase();
        for (const t of this.state.teams) {
          const hit = (t.roster || []).find(p => String(p.name || '').trim().toLowerCase() === nm);
          if (hit) { this.mergeRecruitIntoPlayer(hit, rec); break; }
        }
        return;
      }
      const arrived = !rec.recClassYear || rec.recClassYear <= this.state.year;
      if (!arrived) { stillPending.push(rec); return; }
      if (!rec.school || rec.school === 'Uncommitted' || rec.school === 'Free Agent') {
        stillPending.push(rec); return; // arrived but still uncommitted
      }

      const team = this.state.teams.find(t => t.school.toLowerCase() === rec.school.toLowerCase());
      if (!team) { stillPending.push(rec); return; } // committed school not in the universe

      let existing = team.roster.find(p => p.name === rec.name);
      // A generated recruit who happens to share a name with a generated
      // filler player is a different person: the filler takes a new name.
      if (existing && rec.genRecruit && existing.isGenerated && typeof RosterGen !== 'undefined') {
        const used = new Set(team.roster.map(p => p.name));
        existing.name = RosterGen.generatePlayerName(used);
        existing = null;
      }
      if (existing) {
        this.mergeRecruitIntoPlayer(existing, rec);
        rec.enrolled = true;
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
        // A full roster can't take another body. A generated recruit whose
        // school has no scholarship left (the portal filled it) flips to a
        // program of about the same standing that still has room.
        let dest = team;
        if ((team.roster || []).length >= this.ROSTER_LIMIT) {
          dest = rec.genRecruit ? this.flipDestination(rec, team) : null;
          if (!dest) { stillPending.push(rec); return; }
          this.state.recruitFlips = (this.state.recruitFlips || []).concat({ year: this.state.year, classYear: Number(rec.recClassYear) || this.state.year, name: rec.name, from: team.school, to: dest.school, reason: 'roster full' }).slice(-400);
          this.logNews(`${rec.name} flips from ${team.school} to ${dest.school} after ${team.school}'s roster filled up`);
          rec.school = dest.school;
          rec.school_logo = this.getTeamLogo(dest.school);
          rec.conference = dest.conference;
          rec.committedSchool = dest.school;
        }
        dest.roster.push(rec);
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

  // ---------- Live recruiting (see recruit-live.js) ----------
  // Who is recruited as the seasons play: every high-school prospect the
  // recruiting sheet hasn't committed (generated players, and sheet players
  // left uncommitted). Overseas prospects who aren't ranked in a class
  // follow their own path (college or a club) and aren't recruited here.
  isLiveRecruit(r) {
    if (!r || r.fromOthers || !r.recClassYear || Number(r.recClassYear) <= this.state.year) return false;
    if (r.sheetCommitted === true) return false;
    if (r.sheetCommitted === undefined && !r.genRecruit && HSCore.committedTo(r)) return false;   // saves from before
    // Overseas prospects off the national list: the generated ones are
    // recruited like anyone else (some stay pro; see staysPro), the
    // sheet's keep the path the sheet gives them.
    if (HSCore.isInternational(r) && !(Number(r.rsci) > 0)) return !!r.genRecruit;
    return true;
  },
  liveQuota(school) {
    const t = this.findTeam(school);
    const pres = t && t.prestige != null ? t.prestige : 50;
    return typeof RecruitGen !== 'undefined' && RecruitGen.quotaFor ? RecruitGen.quotaFor(pres) : 4;
  },
  // Offers for a prospect who has none on file: programs around his level.
  liveOffersFor(r, sc) {
    const T = RecruitLive.targetLevel(r.rating ? (r.recRating || r.rating) : 80);
    return Object.keys(sc).sort((a, b) => Math.abs(sc[a].pull - T) - Math.abs(sc[b].pull - T) || RecruitLive.affinity(r.name, b) - RecruitLive.affinity(r.name, a))
      .slice(0, 16).filter(x => RecruitLive.affinity(r.name, x) > 0.95).slice(0, 8);
  },
  // One pass: lists shrink to where the class is in its cycle, and anyone
  // whose commitment date has come picks a school. Returns the new commits.
  runLiveRecruiting() {
    if (typeof RecruitLive === 'undefined' || !this.hsReady() || !this.state.teams.length) return [];
    const s = this.state, year = s.year, p = this.seasonProgress();
    const all = (s.allRecruits || []).filter(r => !r.fromOthers && r.recClassYear);
    const live = all.filter(r => this.isLiveRecruit(r));
    if (!live.length) return [];
    // The sheet's (or the generator's) commitment is where he was headed
    // before the sim began; from here on, it's earned. Everyone is opened
    // up before anyone is scored, so nobody follows a teammate to a school
    // that teammate was only headed to.
    live.forEach(r => {
      if (r.liveInit) return;
      r.liveInit = true;
      r.destiny = HSCore.committedTo(r) || '';
      r.school = 'Uncommitted';
      r.committedSchool = '';
    });
    const sc = RecruitLive.schoolContext(s.teams);
    // A breakout summer lifts the level he's recruited at; a poor one lowers it.
    const rec = r => ({ ...r, rating: (Number(r.recRating || r.rating) || 76) + (r.summerBuzz || 0) * 1.5 });
    const count = {};
    all.forEach(r => { const c = HSCore.committedTo(r); if (c) count[`${r.recClassYear}|${c}`] = (count[`${r.recClassYear}|${c}`] || 0) + 1; });
    const mates = RecruitLive.teammateIndex(all.filter(r => Number(r.recClassYear) >= year), r => HSCore.committedTo(r));
    const made = [];
    live.forEach(r => {
      const c = Number(r.recClassYear);
      if (!r.liveList) {
        const offers = (r.offers || []).filter(x => sc[x]);
        r.liveList = [...new Set((offers.length >= 3 ? offers : offers.concat(this.liveOffersFor(r, sc))))].slice(0, 12);
      }
      if (HSCore.committedTo(r)) return;
      // An overseas prospect set on turning pro takes no visits.
      if (HSCore.isInternational(r) && !(Number(r.rsci) > 0) && HSCore.staysPro && HSCore.staysPro(r)) { r.liveList = []; r.liveProBound = true; return; }
      const cp = HSCore.classProgress(c, year, p);
      if (cp <= 0 || !r.liveList.length) return;
      const scored = r.liveList.map(school => ({
        school,
        mates: mates(r, school),
        v: RecruitLive.interest(rec(r), school, sc, { friends: mates(r, school).length, full: (count[`${c}|${school}`] || 0) >= this.liveQuota(school) })
      })).sort((a, b) => b.v - a.v);
      const size = RecruitLive.listSize(cp);
      const keep = scored.slice(0, size);
      r.liveList = keep.map(x => x.school);
      if (cp >= 1 || cp >= HSCore.commitAt(r)) {
        const pick = RecruitLive.choose(keep);
        if (!pick) return;
        const x = keep.find(y => y.school === pick);
        r.school = pick;
        r.committedSchool = pick;
        r.liveOver = keep.map(y => y.school).filter(y => y !== pick).slice(0, 2);
        r.liveWith = x && x.mates.length ? x.mates[0].name : null;
        r.liveCommitted = { year, week: s.week };
        count[`${c}|${pick}`] = (count[`${c}|${pick}`] || 0) + 1;
        made.push(r);
      }
    });
    return made;
  },
  // For the recruiting page: the two classes in high school now, as the
  // Recruits tab shows them, plus where the lists of the undecided stand.
  // Classes after those haven't been recruited yet: generated players
  // there are uncommitted (openFrom).
  liveRecruitingSnapshot() {
    if (!this.hsReady() || !this.state.teams.length) return null;
    const year = this.state.year;
    const out = { season: year, classes: [year + 1, year + 2], openFrom: year + 3, players: [] };
    out.classes.forEach(c => {
      this.hsClassView(c).forEach(e => {
        const r = e.r, live = this.isLiveRecruit(r);
        const x = { n: r.name, c, rk: e.rank || null, g: e.grade || null, st: e.stars || 0, s: e.school || '' };
        if (live && !e.school && (r.liveList || []).length) x.l = r.liveList;
        if (live && e.school && (r.liveOver || []).length) x.o = r.liveOver;
        if (r.liveWith) x.w = r.liveWith;
        if (r.liveDecommitFrom) x.d = r.liveDecommitFrom;
        if (live) x.live = 1;
        out.players.push(x);
      });
    });
    return out;
  },

  // A coach leaving shakes his commitments loose: some of the prospects he
  // landed reopen their recruitment (and some of those pick again at once).
  reopenAfterCoachChanges(schools) {
    if (!schools || !schools.size) return [];
    const year = this.state.year;
    const out = [];
    (this.state.allRecruits || []).forEach(r => {
      if (!r.liveCommitted || !this.isLiveRecruit(r)) return;
      const c = Number(r.recClassYear), school = HSCore.committedTo(r);
      if (!schools.has(school) || c > year + 2) return;
      if (Math.random() > (c === year + 1 ? 0.25 : 0.35)) return;
      r.liveDecommitFrom = school;
      r.liveList = [...new Set((r.liveOver || []).concat(school))].slice(0, 4);
      r.school = 'Uncommitted';
      r.committedSchool = '';
      r.liveCommitted = null;
      out.push(r);
      this.logNews(`${r.name} reopens his recruitment after ${school}'s coaching change`);
      this.queueWire({ kind: 'decommit', id: r.id, rank: Number(r.rsci) || null, text: `${r.name} (${c}) reopens his recruitment after ${school}'s coaching change` });
    });
    return out;
  },

  // ---------- The summer circuit (see summer-core.js) ----------
  // Between the transfer portal and the new season, the high-school
  // classes play their summer: the AAU circuits (the rising seniors and
  // juniors, on their programs) and the FIBA youth World Cup. Every game is
  // played with the college engine. What a player does there shows up on
  // his profile (a season line, honors), and a breakout summer moves him
  // up the rankings and brings new offers; a poor one costs him a little.

  // The summer after a season: the calendar year the season ends in.
  summerSeason() { return this.state.year + 1; },

  // His country, for FIBA: the sheet's Country, else where he's from.
  nationOf(r) {
    if (r.country) return String(r.country).trim();
    const US = HSCore.US_STATES;
    const CAN = new Set(['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE']);
    const tail = String(r.hometown || '').split(',').pop().trim();
    if (tail && US.has(tail.toUpperCase())) return 'USA';
    if (tail && CAN.has(tail.toUpperCase())) return 'Canada';
    if (/^(usa|united states|us)$/i.test(tail)) return 'USA';
    if (tail && tail.length > 2) return tail;
    return US.has(String(r.state || '').toUpperCase()) ? 'USA' : '';
  },

  // Young enough for this summer's FIBA event: by birth year where the
  // sheet has one, else by class.
  fibaEligible(r, season, age) {
    // By class first: the U19 is for this spring's graduates and the two
    // classes behind them, the U17 for the three classes still in high
    // school. A birth date, where there is one, has the last word on age.
    const c = Number(r.recClassYear);
    const inClass = age >= 19 ? c >= season && c <= season + 2 : c >= season + 1 && c <= season + 3;
    if (!inClass) return false;
    const m = String(r.dob || '').match(/(\d{4})\s*$/) || String(r.dob || '').match(/^(\d{4})-/);
    return m ? Number(m[1]) >= season - age : true;
  },

  // The summer as it stands, in the shape the pages read (see
  // SummerCore.view). A summer saved before the summer became a season of
  // its own is already in that shape.
  currentSummer() {
    const P = this.state.summer;
    if (!P) return null;
    if (P.v !== 2 || typeof SummerCore === 'undefined') return P.v === 2 ? null : P;
    return SummerCore.view(P);
  },

  summerPeople() {
    const s = this.state;
    const all = (s.allRecruits || []).filter(r => !r.fromOthers && r.recClassYear && !this.isDepartedRecruit(r));
    return { all, byId: new Map(all.map(r => [r.id, r])) };
  },

  // Plans a summer: AAU programs and schedule, the FIBA field and draw,
  // and each player's profile for it (from what he's written to have done
  // at that level; see SummerCore.profileTeam). The summer after a season
  // by default; at the start of a save, the summer before its first one.
  startSummer(season = this.summerSeason()) {
    if (typeof SummerCore === 'undefined' || !this.hsReady() || typeof GameCore === 'undefined') return null;
    const s = this.state;
    if (s.summer && s.summer.season === season) return s.summer;
    const { all } = this.summerPeople();
    const overseas = r => String(r.state || '').toUpperCase() === 'INT';
    const info = r => ({ id: r.id, name: r.name, rank: Number(r.rsci) || null, rating: Number(r.recRating) || 0, recRating: Number(r.recRating) || 0,
      talent: HSCore.proTalent(r), pos: r.pos || '', cls: Number(r.recClassYear) || null, written: r.written || null });
    // The rising seniors and juniors play AAU.
    const aauPlayers = all.filter(r => [season + 1, season + 2].includes(Number(r.recClassYear)) && !overseas(r))
      .map(r => ({ ...info(r), aauTeam: r.aauTeam || '', state: r.state, sheet: !r.genRecruit }));
    const ev = SummerCore.fibaEvent(season);
    const fibaEligible = all.filter(r => Number(r.recClassYear) >= season && this.fibaEligible(r, season, ev.age))
      .map(r => ({ ...info(r), nation: this.nationOf(r) }))
      .filter(p => p.nation);
    s.summer = SummerCore.plan(season, { aauPlayers, fibaEligible });
    return s.summer;
  },

  summerPlay() { return SummerCore.simPlay(this.state.summer); },

  // Plays the summer's next step (a session, a round of the championships,
  // a stage of the World Cup) here. Normally that happens on the
  // Recruiting page, against this save; this is the fallback, and what a
  // new save does with the summer before its first season.
  playSummerStep() {
    const P = this.startSummer();
    if (!P || P.v !== 2 || P.done) return P;
    SummerCore.playStep(P, this.summerPlay());
    this.applySummerLines(P);
    if (P.done) this.finishSummer(P);
    return P;
  },

  // The whole summer (what's left of it) at once.
  runSummerCircuit() {
    const P = this.startSummer();
    if (!P || P.v !== 2) return P;
    let guard = 0;
    while (!P.done && guard++ < 20) this.playSummerStep();
    if (P.done) this.finishSummer(P);
    return P;
  },

  // The summer before a save's first season, played as the save is made,
  // so every class starts with a summer behind it.
  playOpeningSummer() {
    const year = this.state.year;
    const P = this.startSummer(year);
    if (!P || P.v !== 2) return null;
    let guard = 0;
    while (!P.done && guard++ < 20) { SummerCore.playStep(P, this.summerPlay()); }
    // Nobody was there to watch these finals.
    P.games.forEach(g => { if (/Final$/.test(g.rd)) P.seen[g.id] = true; });
    this.applySummerLines(P);
    this.finishSummer(P);
    return P;
  },

  posOfId(id) { const r = this.summerPeople().byId.get(id); return r ? r.pos : ''; },

  applySummerLines(P) { SummerCore.applyLines(P, this.summerPeople().all); },

  // The summer as the Recruiting page left it: a newer copy of this
  // summer in the save (it's played there) replaces the one in memory.
  async syncSummerFromDB() {
    if (typeof db === 'undefined' || !db.leagueState) return false;
    const mine = this.state.summer;
    if (!mine || mine.v !== 2) return false;
    let saved;
    try { saved = await db.leagueState.get(1); } catch (e) { return false; }
    const theirs = saved && saved.summer;
    if (!theirs || theirs.v !== 2 || theirs.season !== mine.season || (theirs.rev || 0) <= (mine.rev || 0)) return false;
    if (mine.finished) theirs.finished = true;
    this.state.summer = theirs;
    this.applySummerLines(theirs);
    if (theirs.done) this.finishSummer(theirs);
    return true;
  },

  // Once the summer is over (here or on the Recruiting page): awards,
  // honors and buzz, then what they set off (offers, the wire). Once.
  finishSummer(P) {
    if (!P || P.finished) return;
    const s = this.state, season = P.season;
    const breakouts = SummerCore.settle(P, this.summerPeople().all);
    P.finished = true;
    const v = SummerCore.view(P);
    s.summerHistory = (s.summerHistory || []).filter(h => h.season !== season).concat([{
      season,
      champions: v.aau.circuits.map(c => ({ event: c.event, circuit: c.key, team: c.champion, mvp: c.mvp && c.mvp.name })),
      fiba: v.fiba ? { name: v.fiba.name, medals: v.fiba.medals, mvp: v.fiba.mvp && v.fiba.mvp.name } : null
    }]).slice(-20);

    const offers = this.applySummerOffers(breakouts);
    // The opening summer goes straight onto this season's wire; any other
    // opens next season's.
    const cal = s.hsCalendar && s.hsCalendar.year === s.year && season === s.year ? s.hsCalendar : null;
    const wire = item => {
      if (cal) cal.wire = [{ when: `Summer ${season}`, ...item, year: s.year }].concat(cal.wire || []).slice(0, 60);
      else this.queueWire({ when: `Summer ${season}`, ...item });
    };
    // The news doesn't give away the finals: they're there to be watched.
    const finals = v.aau.circuits.map(c => c.event).concat(v.fiba ? [`the ${v.fiba.short}`] : []);
    this.logNews(`The summer circuit is in the books: the ${finals.slice(0, -1).join(', ')} and ${finals.slice(-1)[0]} finals are ready to watch`);
    const spoiler = /champion|Peach Jam|Finals|Championship|World Cup/;
    v.aau.circuits.forEach(c => wire({ kind: 'summer', text: `${c.champion} win the ${c.event}` }));
    if (v.fiba && v.fiba.medals) wire({ kind: 'summer', text: `${v.fiba.medals.gold} win the ${v.fiba.name}` });
    breakouts.slice(0, 5).forEach(r => {
      const o = offers.get(r);
      const hon = r.summer.honors.filter(h => !spoiler.test(h)).slice(0, 2);
      const text = `Breakout summer: ${r.name} (${r.recClassYear}) — ${hon.join(', ') || (r.summer.aau ? `${r.summer.aau.ppg} ppg on the ${r.summer.circuit}` : 'a standout summer')}${o && o.length ? `; new offers from ${o.join(' and ')}` : ''}`;
      this.logNews(text);
      wire({ kind: 'summer', id: r.id, rank: Number(r.rsci) || null, text });
    });
  },

  // A game's box score lines, ready for the broadcast or a box score.
  summerGameLines(g) {
    const P = this.state.summer;
    if (!P || P.v !== 2) return null;
    const { byId } = this.summerPeople();
    const fiba = P.fiba ? new Map(P.fiba.teams.flatMap(t => t.players).map(p => [p.id, p])) : new Map();
    const [h, a] = SummerCore.linesOf(g, P.names);
    const dress = l => { const r = byId.get(l.id) || fiba.get(l.id) || {}; return { ...l, pos: r.pos || '', jersey: r.jersey || '' }; };
    return { home: h.map(dress), away: a.map(dress) };
  },

  // Programs above where he was being recruited take notice of a breakout
  // summer: up to two new offers, and they go straight onto his list.
  applySummerOffers(players) {
    const out = new Map();
    if (typeof RecruitLive === 'undefined' || !this.state.teams.length) return out;
    const sc = RecruitLive.schoolContext(this.state.teams);
    players.forEach(r => {
      if (!this.isLiveRecruit(r) || HSCore.committedTo(r)) return;
      const bump = (r.summerBuzz || 0) * 2.5;
      const T = RecruitLive.targetLevel((Number(r.recRating) || 80) + bump);
      const have = new Set((r.liveList || []).concat(r.offers || []));
      const fresh = Object.keys(sc).filter(x => !have.has(x) && sc[x].pull >= T - 6)
        .sort((a, b) => Math.abs(sc[a].pull - T) - Math.abs(sc[b].pull - T) || RecruitLive.affinity(r.name, b) - RecruitLive.affinity(r.name, a))
        .slice(0, 6).filter(x => RecruitLive.affinity(r.name, x) > 0.85).slice(0, 2);
      if (!fresh.length) return;
      r.offers = (r.offers || []).concat(fresh);
      r.liveList = fresh.concat(r.liveList || []).slice(0, 12);
      out.set(r, fresh);
    });
    return out;
  },

  // Offseason stories for the recruiting wire, shown when the new season's
  // calendar opens.
  queueWire(item) {
    const s = this.state;
    s.pendingWire = (s.pendingWire || []).concat([{ when: 'Offseason', ...item, year: s.year + 1 }]).slice(-40);
  },

  // A player's summer on his card: where he played, the line, the honors.
  summerCardHTML(r) {
    const sm = r.summer, hon = (r.summerHonors || []).slice().sort((a, b) => b.season - a.season);
    if (!sm && !hon.length) return '';
    const ln = (label, x) => x ? `<tr><td>${this.esc(label)}</td><td>${x.gp}</td><td>${x.ppg}</td><td>${x.rpg}</td><td>${x.apg}</td><td>${x.fg}</td><td>${x.fg3}</td><td>${x.bpm > 0 ? '+' : ''}${x.bpm}</td></tr>` : '';
    const cur = this.currentSummer();
    const fe = sm && sm.fiba && cur && cur.season === sm.season && cur.fiba ? cur.fiba.short : 'FIBA';
    return `<div class="card rc-block"><h3 class="section-title">Summer circuit</h3>
      ${sm ? `<p class="sub-text-sm">${sm.season}${sm.live ? ' (in progress)' : ''}${sm.team ? ` · ${this.esc(sm.team)} (${this.esc(sm.circuit)})` : ''}${sm.nation && sm.fiba ? ` · ${this.esc(sm.nation)} at the ${this.esc(fe)}` : ''}${sm.buzz >= 2 ? ' · <b class="summer-up">Breakout summer</b>' : sm.buzz <= -1 ? ' · <span class="summer-down">Quiet summer</span>' : ''}</p>
      ${sm.aau || sm.fiba ? `<div class="table-scroll"><table class="data-table compact"><thead><tr><th></th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>FG%</th><th>3P%</th><th>BPM</th></tr></thead><tbody>${ln(sm.circuit || 'AAU', sm.aau)}${ln(fe, sm.fiba)}</tbody></table></div>` : ''}` : ''}
      ${hon.length ? `<ul class="summer-honors">${hon.map(h => `<li><span class="hs-when">${h.season}</span>${this.esc(h.text)}</li>`).join('')}</ul>` : ''}
    </div>`;
  },

  // ---- The offseason's Summer Circuit page: a short season ----
  // A finals result stays hidden until it's watched or revealed.
  summerHidden(g) { const P = this.state.summer; return /Final$/.test(g.rd || g.round || '') && !(P && P.seen && P.seen[g.id]); },
  summerButtonLabel() {
    const P = this.state.summer;
    if (!P || P.season !== this.summerSeason()) return 'Tip off the summer circuit';
    if (P.v === 2 && !P.done) return typeof window !== 'undefined' && window.__BTR_AUTO_SUMMER ? `Play ${P.steps[P.step].short}` : 'Play the summer on the Recruiting page';
    return 'On to final rosters';
  },
  setSummerTab(k) { this._summerTab = k; this.renderOffseasonOverlay(); },

  async playSummer(all) {
    if (this.isSimBusy()) return;
    this._simBusy = true;
    try {
      if (all) this.runSummerCircuit(); else this.playSummerStep();
      await this.saveStateToDB();
    } finally { this._simBusy = false; }
    this.renderOffseasonOverlay();
  },

  renderOffseasonSummer() {
    const P = this.state.summer;
    const season = this.summerSeason();
    if (!P || (P.season !== season && P.season !== this.state.year)) {
      return `<p class="empty-table-msg">The summer circuit tips off after the transfer portal: four AAU sessions and the championships for the rising seniors and juniors, then the ${typeof SummerCore !== 'undefined' ? SummerCore.fibaEvent(season).name : 'FIBA youth World Cup'}.</p>`;
    }
    const sm = this.currentSummer();
    if (P.v !== 2) return `<p class="sub-text">The summer of ${P.season} was played in one go: ${(sm.aau.circuits || []).map(c => `${this.esc(c.event)}: ${this.esc(c.champion)}`).join(' · ')}.</p>`;
    const esc = v => this.esc(v);
    const pid = id => String(id).replace(/'/g, "\\'");
    const who = x => (x ? (x.depth || /^fiba\|/.test(x.id) ? esc(x.name) : `<a class="text-link" onclick="SimEngine.openPlayerModal('${pid(x.id)}')">${esc(x.name)}</a>`) : '');
    const { byId } = this.summerPeople();

    // Where the summer is.
    const steps = sm.steps.map((st, i) => `<li class="${i < sm.step ? 'done' : i === sm.step ? 'current' : ''}"><span class="stage-dot">${i < sm.step ? '✓' : i + 1}</span><span>${esc(st.short)}</span></li>`).join('');
    const controls = sm.done
      ? `<span class="sub-text-sm">The summer is over. Every line is on the players' profiles.</span>`
      : `<a class="hs-btn primary" href="../recruiting/#/summer">Play the summer on the Recruiting page</a>
         <span class="sub-text-sm">Next: ${esc(sm.next.label)}. Or play it here:</span>
         <button type="button" class="hs-btn" onclick="SimEngine.playSummer(false)">&#9654; ${esc(sm.next.short)}</button>
         <button type="button" class="hs-btn" onclick="SimEngine.playSummer(true)">The rest of the summer</button>`;

    const tabs = sm.aau.circuits.map(c => [c.key, c.name]).concat(sm.fiba ? [['FIBA', sm.fiba.short]] : []).concat([['leaders', 'Leaders']]);
    const tab = tabs.some(t => t[0] === this._summerTab) ? this._summerTab : tabs[0][0];
    const tabBar = `<div class="seg summer-tabs">${tabs.map(([k, l]) => `<button type="button" class="${k === tab ? 'on' : ''}" onclick="SimEngine.setSummerTab('${k}')">${esc(l)}</button>`).join('')}</div>`;

    const gameRow = (g, rd) => {
      if (this.summerHidden({ id: g.id, rd })) {
        return `<li class="summer-game hidden-result"><span>${esc(g.home)} vs ${esc(g.away)}</span><span class="hs-actions"><button type="button" class="hs-btn primary" onclick="SimEngine.watchSummerGame('${pid(g.id)}')">&#9654; Watch</button><button type="button" class="hs-btn" onclick="SimEngine.revealSummerGame('${pid(g.id)}')">Show result</button></span></li>`;
      }
      return `<li class="summer-game"><span class="${g.winner === g.home ? 'won' : ''}">${esc(g.home)} <b>${g.hs}</b></span><span class="${g.winner === g.away ? 'won' : ''}">${esc(g.away)} <b>${g.as}</b></span><button type="button" class="hs-link" onclick="SimEngine.watchSummerGame('${pid(g.id)}')" title="Watch">&#9654;</button></li>`;
    };
    const table = (rows, cut) => `<table class="data-table compact summer-table"><thead><tr><th></th><th>Team</th><th>W-L</th><th>+/-</th></tr></thead><tbody>
      ${rows.map((t, i) => `<tr class="${cut && i === cut - 1 ? 'cutline' : ''}"><td>${i + 1}</td><td>${esc(t.team)}</td><td>${t.w}-${t.l}</td><td>${t.pf - t.pa > 0 ? '+' : ''}${t.pf - t.pa}</td></tr>`).join('')}</tbody></table>`;
    const rounds = list => list.map(r => `<div class="summer-round"><h4>${esc(r.label)}</h4><ul class="summer-games">${r.games.map(g => gameRow(g, r.label)).join('')}</ul></div>`).join('');

    let body = '';
    const c = sm.aau.circuits.find(x => x.key === tab);
    if (c) {
      const finalSeen = c.final && !this.summerHidden({ id: c.final.id, rd: 'Final' });
      const played = c.sessions.map((g, i) => ({ label: `Session ${i + 1}`, games: g })).filter(r => r.games.length).reverse();
      const awards = sm.done ? `<div class="summer-awards-row">
          ${finalSeen ? `<span>🏆 <b>${esc(c.champion)}</b> win the ${esc(c.event)}${c.eventMvp ? `; MVP ${who(c.eventMvp)} (${esc(c.eventMvp.line)})` : ''}</span>` : ''}
          ${c.mvp ? `<span>Circuit MVP: ${who(c.mvp)} (${esc(c.mvp.team)}, ${esc(c.mvp.line)})</span>` : ''}
          ${c.scoringLeader ? `<span>Scoring leader: ${who(c.scoringLeader)} (${c.scoringLeader.ppg} ppg)</span>` : ''}
          ${(c.firstTeam || []).length ? `<span>All-${esc(c.key)} First Team: ${c.firstTeam.map(who).join(', ')}</span>` : ''}
        </div>` : '';
      body = `<div class="summer-split">
          <div class="card summer-card"><div class="section-head"><h3 class="section-title">${esc(c.name)}</h3><span class="sub-text-sm">${c.programs} programs · top 8 to the ${esc(c.event)}</span></div>${table(c.standings, 8)}</div>
          <div class="card summer-card"><div class="section-head"><h3 class="section-title">${c.bracket.length ? esc(c.event) : 'Results'}</h3></div>
            ${awards}${rounds(c.bracket.slice().reverse())}${rounds(played)}
            ${!played.length ? '<p class="sub-text-sm">Session 1 tips off with the first step.</p>' : ''}</div>
        </div>`;
    } else if (tab === 'FIBA' && sm.fiba) {
      const f = sm.fiba;
      const finalSeen = f.final && !this.summerHidden({ id: f.final.id, rd: 'Final' });
      const medal = (m, n) => `<span class="summer-medal ${m}">${m === 'gold' ? '🥇' : m === 'silver' ? '🥈' : '🥉'} ${esc(n)}</span>`;
      const usa = (f.rosters || []).find(t => t.name === 'USA');
      body = `<div class="summer-split">
          <div class="card summer-card"><div class="section-head"><h3 class="section-title">${esc(f.name)}</h3><span class="sub-text-sm">16 nations</span></div>
            <div class="summer-groups">${f.groups.map(gr => `<div><b>Group ${gr.name}</b>${table(gr.standings, 2)}</div>`).join('')}</div>
            ${usa ? `<details><summary>Team USA</summary><p class="sub-text-sm">${usa.players.filter(p => !p.depth).map(who).join(', ')}</p></details>` : ''}</div>
          <div class="card summer-card"><div class="section-head"><h3 class="section-title">Games</h3></div>
            ${f.medals && finalSeen ? `<p class="summer-medals">${medal('gold', f.medals.gold)}${medal('silver', f.medals.silver)}${medal('bronze', f.medals.bronze)}</p>` : ''}
            ${sm.done && f.mvp ? `<div class="summer-awards-row"><span>MVP: ${who(f.mvp)} (${esc(f.mvp.nation)}, ${esc(f.mvp.line)})</span><span>All-Star Five: ${(f.allStar || []).map(x => `${who(x)} (${esc(x.nation)})`).join(', ')}</span></div>` : ''}
            ${rounds(f.knockout.slice().reverse())}${rounds(f.groups.map(gr => ({ label: `Group ${gr.name}`, games: gr.games })).filter(r => r.games.length))}
            ${!f.groups.some(gr => gr.games.length) ? '<p class="sub-text-sm">The World Cup tips off after the AAU championships.</p>' : ''}</div>
        </div>`;
    } else {
      const { lines } = SummerCore.lines(P, id => (byId.get(id) || {}).pos);
      const rows = [...lines.entries()].map(([id, e]) => ({ id, e, r: byId.get(id) })).filter(x => x.r);
      const board = (title, list, val, fmt) => `<div class="card summer-card"><h3 class="section-title">${esc(title)}</h3><ol class="summer-leaders">${list.slice(0, 10).map(x => `<li>${who({ id: x.id, name: x.r.name })} <small>${x.r.recClassYear} · ${esc((x.e.team || x.e.nation || ''))}</small><b>${fmt(val(x))}</b></li>`).join('')}</ol></div>`;
      const aau = rows.filter(x => x.e.aau && x.e.aau.gp >= Math.min(3, sm.step * 3));
      const fiba = rows.filter(x => x.e.fiba && x.e.fiba.gp >= 2);
      body = `<div class="summer-grid">
          ${board('AAU points', aau.slice().sort((a, b) => b.e.aau.ppg - a.e.aau.ppg), x => x.e.aau.ppg, v => v)}
          ${board('AAU rebounds', aau.slice().sort((a, b) => b.e.aau.rpg - a.e.aau.rpg), x => x.e.aau.rpg, v => v)}
          ${board('AAU assists', aau.slice().sort((a, b) => b.e.aau.apg - a.e.aau.apg), x => x.e.aau.apg, v => v)}
          ${fiba.length ? board(`${sm.fiba.short} points`, fiba.slice().sort((a, b) => b.e.fiba.ppg - a.e.fiba.ppg), x => x.e.fiba.ppg, v => v) : ''}
        </div>`;
    }
    const breakouts = (sm.breakouts || []).map(id => byId.get(id)).filter(Boolean);
    const bo = breakouts.length ? `<div class="card summer-card"><div class="section-head"><h3 class="section-title">Breakout summers</h3><span class="sub-text-sm">Rising up the boards</span></div>
      <ul class="summer-breakouts">${breakouts.map(r => `<li onclick="SimEngine.openPlayerModal('${pid(r.id)}')"><b>${esc(r.name)}</b> <small>${r.recClassYear} · #${r.rsci || 'NR'} · ${esc(r.pos || '')}</small><span>${esc(r.summer.honors.filter(h => !/champion|Peach Jam|Finals|Championship|World Cup/.test(h)).slice(0, 2).join(' · ') || `${r.summer.aau ? r.summer.aau.ppg + ' ppg on the ' + r.summer.circuit : ''}`)}</span></li>`).join('')}</ul></div>` : '';
    return `<div class="card summer-head">
        <div><b>Summer ${sm.season}</b><span class="sub-text-sm"> · the rising seniors and juniors on the AAU circuits${sm.fiba ? `, then the ${esc(sm.fiba.name)}` : ''}</span></div>
        <ol class="summer-steps">${steps}</ol>
        <div class="hs-actions">${controls}</div>
      </div>
      ${tabBar}${body}${bo}`;
  },

  summerGameById(id) { const P = this.state.summer; return P && P.v === 2 ? P.games.find(g => g.id === id) : null; },
  watchSummerGame(id) {
    const P = this.state.summer;
    const game = this.summerLiveGame(id);
    if (!P) return;
    P.seen = P.seen || {};
    P.seen[id] = true;
    if (!game || typeof GameCenter === 'undefined') { this.renderOffseasonOverlay(); return; }
    GameCenter.open(game, { mode: 'live', onClose: () => this.renderOffseasonOverlay() });
  },
  revealSummerGame(id) {
    const P = this.state.summer;
    if (!P) return;
    P.seen = P.seen || {};
    P.seen[id] = true;
    this.renderOffseasonOverlay();
  },
  // The finals by event key ('EYBL', 'fiba', ...), for the old buttons and tests.
  summerFinalId(key) {
    const sm = this.currentSummer();
    if (!sm) return null;
    if (key === 'fiba' || key === 'FIBA') return sm.fiba && sm.fiba.final ? sm.fiba.final.id : null;
    const c = sm.aau.circuits.find(x => x.key === key);
    return c && c.final ? c.final.id : null;
  },
  watchSummerFinal(key) { const id = this.summerFinalId(key); if (id) this.watchSummerGame(id); },
  revealSummerFinal(key) { const id = this.summerFinalId(key); if (id) this.revealSummerGame(id); },
  summerLiveGame(idOrKey) {
    const P = this.state.summer;
    if (!P || P.v !== 2 || typeof LiveCore === 'undefined') return null;
    const g = this.summerGameById(idOrKey) || this.summerGameById(this.summerFinalId(idOrKey));
    if (!g) return null;
    const lines = this.summerGameLines(g);
    const sm = this.currentSummer();
    const c = sm.aau.circuits.find(x => x.key === g.ev);
    const label = g.ev === 'FIBA' ? `${sm.fiba.name} · ${g.rd}` : `${c ? c.event : g.ev} · ${g.rd}`.replace(/^(.*) · (Session \d)$/, (m, e, s) => `${c ? c.name : g.ev} · ${s}`);
    const record = g.ev === 'FIBA' ? sm.fiba.team : (c ? c.name : g.ev);
    return LiveCore.build({
      key: `summer|${P.season}|${g.id}`, label, neutral: true, big: /Final$/.test(g.rd),
      home: { school: g.h, record }, away: { school: g.a, record },
      spread: 0, homeScore: g.hs, awayScore: g.as, note: ''
    }, { home: lines.home, away: lines.away });
  },

  // For the recruiting page: the whole summer, game by game, and every
  // player's lines and honors.
  summerSnapshot() {
    const P = this.state.summer;
    if (!P || P.v !== 2 || typeof SummerCore === 'undefined') return null;
    return SummerCore.snapshot(P, { recruits: this.state.allRecruits || [], history: this.state.summerHistory || [], hidden: g => this.summerHidden(g) });
  },

  // ---------- Re-reading the recruiting database ----------
  // A save keeps the players it was built with, so edits to the recruiting
  // sheet (a stat line fixed, a scouting report written) and improvements
  // to how those stats are read wouldn't otherwise reach it. When a save
  // opens, each player's real pre-college production (recruitProduction)
  // and scouting report are re-read from the sheet, and expectations are
  // rebuilt from them.
  async refreshRecruitProduction(loader) {
    if (typeof RecruitSheet === 'undefined' && !loader) return 0;
    const s = this.state;
    if (!s.teams.length) return 0;
    const load = loader || (o => RecruitSheet.load(t => this.parseCSV(t), o));
    let res;
    try { res = await load({ yearKey: 'classyear', nameKey: 'name', resets: s.genResets || {} }); } catch (e) { return 0; }
    const rows = (res && res.rows) || [];
    if (!rows.length) return 0;
    const key = (n, c) => `${String(n || '').trim().toLowerCase()}|${c || ''}`;
    const byKey = new Map(), byName = new Map();
    rows.forEach(raw => {
      const name = raw.name || raw.Name;
      const k = key(name, raw.classyear || raw.__tab);
      byKey.set(k, raw);
      const nk = String(name || '').trim().toLowerCase();
      byName.set(nk, byName.has(nk) ? null : raw);   // null: the name isn't unique
    });
    const rosters = [];
    s.teams.forEach(t => (t.roster || []).forEach(p => rosters.push(p)));
    const people = [...new Set(rosters.concat(s.activePlayers || [], s.allRecruits || []))];
    let n = 0;
    people.forEach(p => {
      const raw = byKey.get(key(p.name, p.recClassYear)) || (p.recClassYear ? null : byName.get(String(p.name || '').trim().toLowerCase()));
      if (!raw) return;
      const real = this.recruitProduction(raw);
      if (real) {
        const ps = p.playstyle || { ...this.playstyleValues(null), base: this.playstyleValues(null) };
        p.playstyle = { ...ps, real };
        n++;
      }
      const fresh = this.normalizePlayerObj(raw, true);
      // Classes still in high school take the current national rankings
      // (where generated players fall among the sheet's), and a generated
      // prospect his current rating.
      if (Number(p.recClassYear) > s.year && !p.enrolled && fresh.rsci) {
        p.rsci = fresh.rsci;
        if (p.genRecruit && fresh.recRating) { p.recRating = fresh.recRating; p.rating = fresh.rating; p.stars = fresh.stars; }
      }
      if (fresh.scout && (fresh.scout.scouting || fresh.scout.strengths || fresh.scout.weaknesses)) p.scout = fresh.scout;
      if (fresh.written) p.written = fresh.written;
    });
    s.teams.forEach(team => (team.roster || []).forEach(p => {
      if (p.allocatedMpg !== undefined) p.expectedStats = this.buildBaseStatExpectations(p, p.allocatedMpg || 0, team);
    }));
    if (s.seasonInitialized) this.updateEfficiencyNorm();
    return n;
  },

  // ---------- Resetting generated classes ----------
  // An admin can reset a class's generated players from the recruiting
  // admin (Cloud.resetGeneratedClasses). A save picks that up for classes
  // nobody has started recruiting yet (three or more years out): their
  // generated players are replaced with the new ones. Classes already
  // being recruited, or in college, keep the players they have.
  async checkGeneratedResets() {
    if (typeof Cloud === 'undefined' || !Cloud.recruitGen || !this.state.teams.length) return [];
    return this.applyGeneratedResets(await Cloud.recruitGen());
  },
  resettableFrom() { return this.state.year + 3; },
  async applyGeneratedResets(want, loader) {
    if (typeof RecruitGen === 'undefined' || !RecruitGen.setResets) return [];
    const s = this.state, have = s.genResets || {};
    const n = (m, y) => Number((m || {})[y]) || 0;
    const years = [...new Set(Object.keys(want || {}).concat(Object.keys(have)))]
      .filter(y => /^\d{4}$/.test(y) && Number(y) >= this.resettableFrom() && n(want, y) !== n(have, y)).sort();
    if (!years.length) return [];
    const merged = { ...have };
    years.forEach(y => { merged[y] = n(want, y); });
    const load = loader || (o => RecruitSheet.load(t => this.parseCSV(t), o));
    let res;
    try { res = await load({ yearKey: 'classyear', nameKey: 'name', resets: merged }); }
    finally { RecruitGen.setResets(s.genResets || {}); }
    const pick = new Set(years);
    const fresh = ((res && res.rows) || [])
      .filter(r => /^true$/i.test(String(r.generated || '')) && pick.has(String(r.classyear || r.__tab)))
      .map(r => this.normalizePlayerObj(r, true));
    if (!fresh.length) return [];
    const stale = r => r.genRecruit && pick.has(String(r.recClassYear));
    s.allRecruits = (s.allRecruits || []).filter(r => !stale(r)).concat(fresh);
    s.genResets = merged;
    RecruitGen.setResets(merged);
    this.refreshRecruitPool();
    this.runLiveRecruiting();
    const label = years.length > 2 ? `${years[0]}-${years[years.length - 1]}` : years.join(' and ');
    this.logNews(`Generated players reset for the class${years.length > 1 ? 'es' : ''} of ${label}`);
    this.toast(`New generated players for the class${years.length > 1 ? 'es' : ''} of ${label}`, 'An admin reset them. Classes already being recruited keep theirs.');
    this.syncUI();
    await this.saveStateToDB();
    return years.map(Number);
  },

  // ---------- Recruiting quotas ----------
  // Each offseason, every program's commitments for next year's class are
  // measured against the room it will actually have: scholarships held by
  // players who aren't seniors, less what the portal already brought in.
  // A program with more commits than room loses its lowest-rated generated
  // commits to programs of similar standing that still need players.
  // Sheet commitments are never moved.
  projectedRoom(team) {
    const staying = (team.roster || []).filter(p => !['SR', 'GR'].includes(this.normalizeClassStanding(p.class))).length;
    return Math.max(1, this.ROSTER_TARGET - staying + 1);   // +1: a spot usually opens in the portal
  },
  rebalanceRecruitCommits(classYear) {
    const pending = (this.state.recruits || []).filter(r => r.genRecruit && !r.fromOthers && Number(r.recClassYear) === Number(classYear)
      && r.school && r.school !== 'Uncommitted' && r.school !== 'Free Agent');
    if (!pending.length) return [];
    const all = (this.state.recruits || []).filter(r => Number(r.recClassYear) === Number(classYear) && r.school && r.school !== 'Uncommitted' && r.school !== 'Free Agent');
    const commits = {};
    all.forEach(r => { commits[r.school] = (commits[r.school] || 0) + 1; });
    const room = {};
    this.state.teams.forEach(t => { room[t.school] = this.projectedRoom(t); });
    const flips = [];
    this.state.teams.forEach(team => {
      let over = (commits[team.school] || 0) - room[team.school];
      if (over <= 0) return;
      const movable = pending.filter(r => r.school === team.school).sort((a, b) => (parseFloat(a.recRating) || 0) - (parseFloat(b.recRating) || 0));
      for (const rec of movable) {
        if (over <= 0) break;
        const base = team.prestige != null ? team.prestige : 50;
        const open = this.state.teams.filter(t => t !== team && (commits[t.school] || 0) < room[t.school]
          && Math.abs((t.prestige != null ? t.prestige : 50) - base) <= 15);
        if (!open.length) break;
        const w = open.map(t => ({ t, w: Math.exp(((t.prestige || 50) - base) / 12) * (room[t.school] - (commits[t.school] || 0)) }));
        let x = Math.random() * w.reduce((n, y) => n + y.w, 0), dest = w[w.length - 1].t;
        for (const y of w) { x -= y.w; if (x <= 0) { dest = y.t; break; } }
        commits[team.school]--; commits[dest.school] = (commits[dest.school] || 0) + 1; over--;
        flips.push({ year: this.state.year, classYear: Number(classYear), name: rec.name, from: team.school, to: dest.school, reason: 'roster full' });
        rec.school = dest.school;
        rec.committedSchool = dest.school;
      }
    });
    if (flips.length) {
      this.state.recruitFlips = (this.state.recruitFlips || []).concat(flips).slice(-400);
      flips.slice(0, 6).forEach(f => this.logNews(`${f.name} (class of ${f.classYear}) flips from ${f.from} to ${f.to}: ${f.from} is out of scholarships`));
    }
    return flips;
  },

  // Where a recruit goes when the school he signed with has no room: a
  // program within about fifteen points of prestige with at least two
  // open scholarships, the better programs more likely.
  flipDestination(rec, team) {
    const base = team.prestige != null ? team.prestige : 50;
    const open = this.state.teams.filter(t => t !== team && (t.roster || []).length <= this.ROSTER_LIMIT - 2
      && Math.abs((t.prestige != null ? t.prestige : 50) - base) <= 15);
    if (!open.length) return null;
    const w = open.map(t => ({ t, w: Math.exp(((t.prestige || 50) - base) / 12) * (this.ROSTER_LIMIT - t.roster.length) }));
    let r = Math.random() * w.reduce((n, x) => n + x.w, 0);
    for (const x of w) { r -= x.w; if (r <= 0) return x.t; }
    return w[w.length - 1].t;
  },

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
      'expectedStats', 'school_logo', 'fromOthers'
    ]);
    // An "Others" row describes a player's past; where he plays now is the
    // roster sheet's call.
    if (recruit.fromOthers) ['school', 'conference', 'recClassYear'].forEach(k => PROTECTED.add(k));
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
    // The recruit's playstyle (from his HS/AAU numbers) replaced the roster
    // sheet's, so the roster sheet's Strength/Weakness picks go back on.
    if (existingPlayer.traits) this.applyTraitsToPlaystyle(existingPlayer);
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
      if (t.prestige != null) prestige = Math.max(0, Math.min(7, (t.prestige - 30) / 10));

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
    // Last week's rank (the preseason poll before week 1), for the arrows.
    this.state.teams.forEach(t => { t.prevApRank = this.state.week > 1 ? (t.apRank || null) : (t.preseasonRank && t.preseasonRank <= 25 ? t.preseasonRank : null); });
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
    // Prospects are ranked purely on the model now. Named players were
    // previously pinned into fixed draft ranges because the board couldn't
    // see their pre-college production; now that the recruiting sheet's
    // full stat tiers are read, the model gets there on its own.
    return DraftCore.buildBigBoard(this.draftPool(), winPctFor, limit, { draftYear: this.upcomingDraftYear() });
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

  // --- Program prestige & the coaching carousel ---

  // Every team gets a coach (a generated one where the coaches sheet has
  // nobody), a reputation for that coach, and a prestige score. Safe to
  // run any time; only missing pieces are filled in.
  refreshPrestige() {
    if (typeof Prestige === 'undefined') return;
    const used = new Set(this.state.teams.map(t => t.coach && t.coach.name).filter(Boolean));
    this.state.teams.forEach(t => {
      const hist = Prestige.historyScore(t.school, t.conference);
      if (!t.coach) {
        // Filling a job at the start of a save: an established coach, not
        // a first-year hire.
        t.coach = this.generateCoach(t, used);
        delete t.coach.rep; delete t.coach.since;
      }
      const c = t.coach;
      if (c.rep == null) c.rep = hist;   // a coach starts at the level of the job he holds
      // Coaches on the sheet have been in their jobs a while; a few start
      // the save already under pressure.
      if (c.since == null) c.since = this.state.year - Math.floor(Math.random() * 9);
      if (c.hotSeat == null) c.hotSeat = Math.random() < 0.15 ? 1 : 0;
      if (!c.id) c.id = `coach-${RosterGen.normalizeSchoolKey(c.name)}-${RosterGen.normalizeSchoolKey(t.school)}`;
      const r = Prestige.compute(t);
      t.prestigeHistory = r.history;
      t.prestige = r.prestige;
    });
  },

  coachMetaLine(team) {
    const c = team.coach;
    if (!c) return '';
    const yrs = Math.max(1, this.state.year - (c.since || this.state.year) + 1);
    const bits = [`Year ${yrs}`];
    if (c.careerW != null || c.careerL != null) bits.push(`${c.careerW || 0}-${c.careerL || 0} career`);
    if (c.rep != null) bits.push(`Reputation ${Math.round(c.rep)}`);
    if (c.prevSchool) bits.push(`from ${this.esc(c.prevSchool)}`);
    if (c.hotSeat >= 1) bits.push('Hot seat');
    return bits.join(' · ');
  },

  // A new head coach nobody's heard of: a name, a neutral playbook and a
  // reputation a little under what the job usually commands.
  generateCoach(team, used) {
    let name = 'Staff';
    if (typeof RosterGen !== 'undefined') {
      for (let i = 0; i < 8; i++) {
        name = RosterGen.generateIdentity(null, used || new Set()).name;
        if (!used || !used.has(name)) break;
      }
      if (used) used.add(name);
    }
    const hist = (typeof Prestige !== 'undefined') ? Prestige.historyScore(team.school, team.conference) : 42;
    return {
      name, style: '', generated: true, since: this.state.year,
      rep: Math.round(Math.max(20, Math.min(80, hist * 0.7 + 8 + Math.random() * 10))),
      id: `coach-gen-${Math.random().toString(36).slice(2, 9)}`
    };
  },

  // How many games each team won in the NCAA Tournament this season.
  ncaaWinsBySchool() {
    const wins = {};
    const b = this.state.ncaaTournament;
    const count = g => { if (g && g.winner && g.winner.school) wins[g.winner.school] = (wins[g.winner.school] || 0) + 1; };
    if (b && b.rounds) b.rounds.forEach(r => (r || []).forEach(count));
    return wins;
  },

  // End of season, before the portal: coaches are judged, some are let go
  // or retire, the best jobs go to coaches who've won somewhere smaller,
  // and a few players follow their coach. Returns those players' moves.
  runCoachingCarousel() {
    if (typeof Prestige === 'undefined' || !this.state.teams.length) return [];
    if (this.state.carouselYear === this.state.year) return [];
    this.state.carouselYear = this.state.year;
    this.refreshPrestige();
    const year = this.state.year;
    const ncaaWins = this.ncaaWinsBySchool();

    // 1. The season goes on every coach's record. A team is judged against
    // what its talent predicted, re-centred on the league so the average
    // team is exactly "as expected".
    // (A straight line fitted across the league, win% on predicted win%,
    // so the best rosters aren't held to a bar nobody reaches.)
    const wpOf = t => { const gp = t.simData.wins + t.simData.losses; return gp ? t.simData.wins / gp : 0.5; };
    const xs = this.state.teams.map(t => t.expectedWinPct != null ? t.expectedWinPct : 0.5), ys = this.state.teams.map(wpOf);
    const mx = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length), my = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
    let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); });
    const slope = sxx > 0 ? sxy / sxx : 0, icpt = my - slope * mx;
    this.state.teams.forEach(t => {
      const c = t.coach;
      const h = (t.history || []).find(x => x.year === year) || {
        wins: t.simData.wins, losses: t.simData.losses, ncaaSeed: t.ncaaSeed || null, wonNationalTitle: !!t.wonNationalTitle
      };
      const season = { ...h, ncaaWins: ncaaWins[t.school] || 0 };
      const exp = Math.max(0.05, Math.min(0.95, icpt + slope * (t.expectedWinPct != null ? t.expectedWinPct : 0.5)));
      const value = Prestige.coachSeasonValue(t, season, exp);
      c.rep = Math.round((c.rep * 0.72 + value * 0.28) * 10) / 10;
      c.seasons = (c.seasons || 0) + 1;
      c.careerW = (c.careerW || 0) + (season.wins || 0);
      c.careerL = (c.careerL || 0) + (season.losses || 0);
      c.log = (c.log || []).concat({ year, school: t.school, w: season.wins || 0, l: season.losses || 0, seed: season.ncaaSeed || null, ncaaWins: season.ncaaWins }).slice(-30);
      const gp = (season.wins || 0) + (season.losses || 0);
      const wp = gp ? season.wins / gp : 0.5;
      const under = wp < exp - 0.06 || (t.prestige >= 80 && !season.ncaaSeed && wp < 0.6);
      c.badYear = wp < exp - 0.12 || wp < 0.3;
      c.hotSeat = under ? (c.hotSeat || 0) + 1 : Math.max(0, (c.hotSeat || 0) - 1);
    });

    // 2. Firings and retirements.
    const changes = [];
    const openings = [];
    this.state.teams.forEach(t => {
      const c = t.coach;
      const tenure = year - (c.since || year) + 1;
      let fireOdds = 0;
      if (c.hotSeat >= 2 && tenure >= 3) fireOdds = 0.55 + (t.prestige >= 74 ? 0.2 : 0) + (c.hotSeat - 2) * 0.2;
      else if (c.badYear && tenure >= 3) fireOdds = 0.2 + (t.prestige >= 74 ? 0.15 : 0);
      const retireOdds = 0.025 + (tenure >= 12 ? 0.04 : 0) + (tenure >= 20 ? 0.06 : 0);
      if (Math.random() < fireOdds) {
        changes.push({ year, kind: 'fired', school: t.school, coach: c.name, text: `${t.school} fires ${c.name} after ${tenure} season${tenure === 1 ? '' : 's'}` });
        openings.push(t);
      } else if (Math.random() < retireOdds) {
        changes.push({ year, kind: 'retired', school: t.school, coach: c.name, text: `${c.name} retires from ${t.school}` });
        openings.push(t);
      }
    });
    openings.forEach(t => {
      const gone = t.coach;
      t.coach = null;
      t.coachProfile = (typeof CoachCore !== 'undefined') ? CoachCore.neutralProfile() : t.coachProfile;
      t.coachTags = [];
      this.state.formerCoaches = (this.state.formerCoaches || []).concat({ ...gone, lastSchool: t.school, leftYear: year }).slice(-300);
    });

    // 3. Openings fill best job first. A coach who's been winning at a
    // smaller program is the first call; when he takes it, his old job
    // opens up in turn.
    const followers = [];
    const moved = new Set();
    const used = new Set(this.state.teams.map(t => t.coach && t.coach.name).filter(Boolean));
    const queue = [...openings];
    let guard = 0;
    while (queue.length && guard++ < 400) {
      queue.sort((a, b) => (b.prestige || 0) - (a.prestige || 0));
      const job = queue.shift();
      const candidates = this.state.teams.filter(t => t.coach && !moved.has(t.coach.id) && t.school !== job.school
        && (t.prestige || 0) <= (job.prestige || 0) - 6
        && t.coach.rep >= Math.max(55, (job.prestige || 0) - 12)
        && (t.coach.hotSeat || 0) === 0
        && (year - (t.coach.since || year)) >= 1)
        .sort((a, b) => b.coach.rep - a.coach.rep);
      let hired = null;
      for (const from of candidates.slice(0, 4)) {
        if (Math.random() < 0.7) { hired = from; break; }
      }
      if (hired) {
        const c = hired.coach;
        moved.add(c.id);
        job.coach = { ...c, since: year + 1, hotSeat: 0, prevSchool: hired.school };
        job.coachProfile = hired.coachProfile;
        job.coachTags = hired.coachTags;
        hired.coach = null;
        hired.coachProfile = (typeof CoachCore !== 'undefined') ? CoachCore.neutralProfile() : hired.coachProfile;
        hired.coachTags = [];
        changes.push({ year, kind: 'hired', school: job.school, from: hired.school, coach: c.name, text: `${job.school} hires ${c.name} away from ${hired.school}` });
        followers.push(...this.coachFollowers(hired, job, c));
        queue.push(hired);
      } else {
        job.coach = this.generateCoach(job, used);
        job.coach.since = year + 1;
        changes.push({ year, kind: 'hired', school: job.school, from: null, coach: job.coach.name, text: `${job.school} names ${job.coach.name} head coach` });
      }
    }
    this.rebuildCoachProfileMap();
    this.refreshPrestige();

    this.state.lastCoachChanges = changes;
    // Prospects committed to a program whose coach just left may reopen,
    // and the ones whose time has come pick again right away.
    const shaken = new Set(changes.filter(c => c.kind === 'hired').map(c => c.school).concat(changes.filter(c => c.kind === 'hired' && c.from).map(c => c.from)));
    if (this.reopenAfterCoachChanges(shaken).length) {
      this.runLiveRecruiting().forEach(r => {
        this.logNews(`${r.name} recommits to ${HSCore.committedTo(r)} after reopening`);
        this.queueWire({ kind: 'commit', id: r.id, school: HSCore.committedTo(r), rank: Number(r.rsci) || null, text: `${r.name} recommits to ${HSCore.committedTo(r)} after reopening` });
      });
    }
    this.state.coachChanges = (this.state.coachChanges || []).concat(changes).slice(-600);
    changes.filter(c => c.kind !== 'hired' || c.from).slice(0, 12).forEach(c => this.logNews(c.text));
    return followers;
  },

  // When a coach moves, a couple of the players he'd been counting on can
  // follow him. Seniors don't, nor anyone the next season's tab already
  // places, nor anyone leaving for the draft.
  coachFollowers(fromTeam, toTeam, coach) {
    const declared = new Set((this.state.draftDeclarations || []).map(d => d.id));
    const pool = (fromTeam.roster || []).filter(p => !declared.has(p.id) && !this.listedNextSeason(p)
      && !['SR', 'GR'].includes(this.normalizeClassStanding(p.class)))
      .sort((a, b) => (parseFloat(b.stats && b.stats.mpg) || 0) - (parseFloat(a.stats && a.stats.mpg) || 0));
    const out = [];
    for (const p of pool.slice(0, 8)) {
      if (out.length >= 2) break;
      if ((toTeam.roster || []).length + out.length >= this.ROSTER_LIMIT) break;
      if (Math.random() < 0.18) {
        out.push({ player: p, from: fromTeam.school, to: toTeam.school, reason: `Followed ${coach.name}` });
      }
    }
    return out;
  },

  // --- Preseason rankings & strength of schedule ---

  // Preseason poll: driven by roster strength, with a deliberate lean
  // toward established high-major programs the way real preseason polls
  // favour brand-name teams before anyone has played a game.
  computePreseasonRankings() {
    const tierBonus = { 1: 3.0, 2: 1.2, 3: 0.0, 4: -1.0 };
    this.state.teams.forEach(t => {
      const tier = (typeof RosterGen !== 'undefined') ? RosterGen.getConferenceTier(t.conference) : 3;
      // Prestige, when known, stands in for the conference tier.
      const bonus = t.prestige != null
        ? (t.prestige - 50) * 0.07 + (this.isHighMajor(t.conference) ? 1.0 : 0)
        : (tierBonus[tier] || 0) + (this.isHighMajor(t.conference) ? 1.5 : 0);
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
      twoPm: t1(totals.fgm - totals.threePm), twoPa: t1(totals.fga - totals.threePa), twoPPct: t3(totals.fgm - totals.threePm, totals.fga - totals.threePa),
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
                      'fgm','fga','fgPct','twoPm','twoPa','twoPPct','threePm','threePa','threePPct','ftm','fta','ftPct',
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
      p.injuredUntilWeek = null; p.gamesMissed = 0; p.startedEarly = false; p.lostSpot = false;
      // Clear the in-season form marker only. Do NOT restore rating from
      // it: reevaluateRotations already unwinds form at the end of every
      // pass, so by this point p.rating is the true, newly-developed
      // value. Overwriting it here silently erased every player's
      // offseason growth, which is why ratings never moved year to year.
      if (p.baseRating !== undefined) delete p.baseRating;
    });
    this.state.schedule = [];
    this.state.regularSeasonDone = false;
    this.state.confChampsDone = false;
    this.state.ncaaDone = false;
    this.state.confTournaments = {};
    this.state.ncaaTournament = null;
    this.state.ncaaFullBracket = null;
    this.state.ncaaSelection = null;
    this.state.postseasonHonors = null;
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
      // Traits like IQ and defense are worth a little more (or less) than
      // the rating says, and that's what decides games.
      const teamOvr = top8.reduce((sum, p) => sum + parseFloat(p.rating) + this.traitEffects(p).impact, 0) / Math.max(1, Math.min(8, top8.length));
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
        p.bigGameStock = 0;
        p.bigGames = [];
      });
    });

    this.state.effAcc = { pts: 0, load: 0 };
    this.updateEfficiencyNorm();
    this.generateSeasonSchedule();
    this.computePreseasonAwards();
  },

  // Each team's players are projected, together, to score about what the
  // team does: the score of a game comes from the team's strength, so a
  // roster projected for 90 points a night that scores 76 had to lose those
  // points somewhere, and it lost them from everyone's shooting. Sizing the
  // projections to the team takes the difference out of volume (who shoots
  // how often) and leaves each player's efficiency his own.
  normalizeTeamScoring() {
    const teams = this.state.teams.filter(t => t.simData && t.simData.teamOvr);
    if (!teams.length) return;
    const L = teams.reduce((n, t) => n + t.simData.teamOvr, 0) / teams.length;
    teams.forEach(t => {
      const ovr = t.simData.teamOvr;
      const pace = ((this.getCoachProfile(t.school) || {}).pace || 1);
      const S = (146 + ((ovr + L) / 2 - 75) * 0.92) * ((pace + 1) / 2) / 2 + (ovr - L) * 0.85 / 2;
      const ros = (t.roster || []).filter(p => p.expectedStats && parseFloat(p.expectedStats.mpg) > 0);
      // Projections are always rebuilt from scratch before this runs, so
      // the scale is applied once per build.
      const R = ros.reduce((n, p) => n + (parseFloat(p.expectedStats.ppg) || 0), 0);
      if (!(R > 0) || !(S > 0)) return;
      const f = Math.max(0.72, Math.min(1.3, S / R));
      ros.forEach(p => {
        const e = p.expectedStats;
        if (e._scaled) return;
        e.ppg = (parseFloat(e.ppg) || 0) * f;
        e.fta = (parseFloat(e.fta) || 0) * f;
        e._scaled = f;
      });
    });
  },

  // The league's points per shooting possession, from every rotation
  // player's expectations: the norm GameCore measures each roster against
  // when it decides how many possessions a game takes.
  updateEfficiencyNorm() {
    if (typeof GameCore === 'undefined' || !GameCore.expectedLoad) return;
    this.normalizeTeamScoring();
    let pts = 0, load = 0;
    this.state.teams.forEach(t => (t.roster || []).forEach(p => {
      const e = GameCore.expectedLoad(p.expectedStats);
      pts += e.pts; load += e.load;
    }));
    this.state.effNorm = load > 0 ? pts / load : null;
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
  // Role multiplier from the sheet's optional Role column. A plain
  // function on the engine, never attached to saved state.
  roleWeightFor(player) {
    switch (((player && player.role) || '').replace(/[^a-z]/g, '')) {
      case 'focalpoint': case 'focal': case 'star': return 1.35;
      case 'starter': return 1.15;
      case 'sixthman': case 'sixth': return 0.92;
      case 'rotation': return 0.78;
      case 'bench': case 'depth': case 'reserve': return 0.5;
      default: return 1;
    }
  },

  // How strongly a player claims a starting spot: his rating (with form,
  // see reevaluateRotations) plus, for a top recruit in his first season,
  // the leash coaches give a five-star early on. It fades over his first
  // dozen games; if he isn't producing, form takes his spot from there.
  startScore(p) {
    let v = parseFloat(p.rating) || 70;
    if (p.class === 'FR') {
      const rsci = parseFloat(p.rsci) || null;
      const leash = rsci && rsci <= 5 ? 3.5 : rsci && rsci <= 25 ? 2.5 : rsci && rsci <= 60 ? 1.2 : 0;
      const gp = (p.stats && p.stats.gp) || 0;
      v += leash * Math.max(0, 1 - gp / 12);
    }
    return v;
  },

  buildRotation(team) {
    const roster = [...(team.roster || [])].sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
    const assigned = new Set();
    const starters = [];

    // Fill the scarcest slots first — centres and point guards are the
    // hardest to cover, so they get first pick of the roster.
    // Designated starters are an instruction from the sheet, not a
    // preference. They are seated in the lineup before anyone else is
    // considered, and any who can't be slotted by position are still
    // treated as starters rather than dropping to the bench — a marked
    // starter previously ended up at 0 minutes when another marked player
    // occupied his slot.
    const startsByRole = (p) => ['focalpoint', 'focal', 'star', 'starter'].includes((p.role || '').replace(/[^a-z]/g, ''));
    const designated = roster.filter(startsByRole);

    // The best five play, the way coaches actually start their most
    // talented players: two point guards can start together, so can two
    // power forwards. The only shape a lineup has to keep is two or three
    // guards and at least one big (a fourth guard or a fourth big costs
    // it). A top recruit gets a leash early in the season (see startScore),
    // and form decides it from there.
    const groupOf = p => {
      const pos = (p.pos || '').toUpperCase();
      if (['PG', 'CG', 'SG', 'G'].includes(pos)) return 'G';
      if (['PF', 'C', 'F/C'].includes(pos)) return 'B';
      return 'W';
    };
    const score = p => this.startScore(p);
    const pool = roster.filter(p => !startsByRole(p)).sort((a, b) => score(b) - score(a)).slice(0, 10);
    const forced = designated.slice(0, 5);
    const need = 5 - forced.length;
    let best = null;
    const shapeCost = five => {
      const g = five.filter(p => groupOf(p) === 'G').length, bg = five.filter(p => groupOf(p) === 'B').length;
      let c = 0;
      if (g === 1) c += 4; else if (g === 0) c += 12;
      if (g > 3) c += 5 * (g - 3);
      if (bg === 0) c += 8;
      if (bg > 3) c += 5 * (bg - 3);
      return c;
    };
    const pick = (start, chosen) => {
      if (chosen.length === need || start >= pool.length) {
        if (chosen.length !== Math.min(need, pool.length)) return;
        const five = forced.concat(chosen);
        const v = five.reduce((n, p) => n + score(p), 0) - shapeCost(five);
        if (!best || v > best.v) best = { v, five };
        return;
      }
      for (let i = start; i < pool.length; i++) { chosen.push(pool[i]); pick(i + 1, chosen); chosen.pop(); }
    };
    pick(0, []);
    (best ? best.five : forced).forEach(p => { assigned.add(p.id); starters.push(p); });
    // Spots on the floor, for the record: guards to PG/SG, bigs to C/PF,
    // wings fill what's left.
    const open = ['PG', 'SG', 'SF', 'PF', 'C'];
    const take = (p, prefs) => { const s = prefs.find(x => open.includes(x)); if (s) { open.splice(open.indexOf(s), 1); p.lineupSlot = s; } };
    starters.slice().sort((a, b) => ({ G: 0, B: 1, W: 2 }[groupOf(a)] - { G: 0, B: 1, W: 2 }[groupOf(b)])).forEach(p => {
      const g = groupOf(p), pos = (p.pos || '').toUpperCase();
      take(p, g === 'G' ? (pos === 'PG' || pos === 'CG' ? ['PG', 'SG', 'SF'] : ['SG', 'PG', 'SF']) : g === 'B' ? (pos === 'C' ? ['C', 'PF', 'SF'] : ['PF', 'C', 'SF']) : ['SF', 'SG', 'PF']);
      if (!p.lineupSlot || !['PG', 'SG', 'SF', 'PF', 'C'].includes(p.lineupSlot)) p.lineupSlot = pos;
    });

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
    const roleWeight = (p) => this.roleWeightFor(p);
    // Deliberately NOT stored on the team: IndexedDB serialises with
    // structured clone, which throws on functions and silently killed
    // every save. The role multiplier is derived on demand instead.


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

    // Role sets hard minute bands. Without these a designated starter could
    // be out-earned by a higher-rated unmarked teammate, which defeats the
    // point of designating him.
    const starterIds = new Set(team.starters);
    const bands = { focalpoint: [28, 35], focal: [28, 35], star: [28, 35],
                    starter: [24, 32], sixthman: [16, 23], sixth: [16, 23],
                    rotation: [8, 17], bench: [2, 10], depth: [2, 10], reserve: [2, 10] };

    // Cast players are allocated first, inside their band and ordered by
    // rating within it. Whatever minutes remain are then shared out among
    // everyone else — re-normalising the whole roster afterwards would
    // simply squash the bands back down and undo the instruction.
    const cast = [], free = [];
    weights.forEach(x => {
      const key = (x.p.role || '').replace(/[^a-z]/g, '');
      if (bands[key]) { x.band = bands[key]; cast.push(x); }
      else free.push(x);
    });

    let spent = 0;
    if (cast.length) {
      const castRef = cast.reduce((n, x) => n + parseFloat(x.p.rating), 0) / cast.length;
      cast.forEach(x => {
        const [lo, hi] = x.band;
        // Position within the band tracks rating relative to the other
        // cast players, so two starters aren't identical.
        const t = Math.max(0, Math.min(1, 0.5 + (parseFloat(x.p.rating) - castRef) * 0.06));
        x.mpg = lo + (hi - lo) * t;
        spent += x.mpg;
      });
    }

    // Only relevant when the sheet has cast some players: an unmarked
    // starter shouldn't be squeezed out by banded teammates. With no roles
    // set, the normal rating-based weighting already handles it, and
    // boosting here simply over-concentrated minutes into the starting five.
    if (cast.length) {
      free.forEach(x => { if (starterIds.has(x.p.id)) x.w *= 1.6; });
    }

    const remaining = Math.max(0, 200 - spent);
    const freeTotal = free.reduce((n, x) => n + x.w, 0) || 1;
    free.forEach(x => { x.mpg = (x.w / freeTotal) * remaining; });

    // If the cast alone over-subscribes the game, scale only the cast back.
    if (spent > 200 && cast.length) {
      const scale = 200 / spent;
      cast.forEach(x => { x.mpg *= scale; });
      free.forEach(x => { x.mpg = 0; });
    }

    // Nobody averages more than his ceiling: the top of his band if the
    // sheet gave him a role, 34 otherwise. Players without a role used to
    // split whatever the banded ones left with no ceiling at all, which put
    // unmarked starters at 37-40 a night. The excess goes to teammates with
    // room, unmarked ones first.
    const ceilingOf = x => (x.band ? x.band[1] : 34);
    for (let pass = 0; pass < 8; pass++) {
      let extra = 0;
      weights.forEach(x => { const c = ceilingOf(x); if (x.mpg > c) { extra += x.mpg - c; x.mpg = c; } });
      if (extra < 0.01) break;
      const open = w => w.filter(x => x.mpg > 0 && x.mpg < ceilingOf(x) - 0.01);
      const pool = open(free).length ? open(free) : open(weights);
      const tot = pool.reduce((n, x) => n + x.mpg, 0);
      if (!tot) break;
      pool.forEach(x => { x.mpg += extra * (x.mpg / tot); });
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

  // A stable number in [-1, 1] per player (roughly bell-shaped), so a
  // player's free-throw stroke is the same every time his expectations are
  // rebuilt instead of being re-rolled each week.
  shootingTouch(player) {
    const key = String(player.id || player.name || '');
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const a = ((h >>> 0) % 10007) / 10007;
    const b = ((Math.imul(h, 2654435761) >>> 0) % 10009) / 10009;
    return a + b - 1;
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
      PF: { reb: 6.7, ast: 1.58, stl: 1.02, blk: 1.02 },
      C:  { reb: 8.8, ast: 1.05, stl: 0.72, blk: 1.72 },
      G:  { reb: 3.3, ast: 3.40, stl: 1.25, blk: 0.185 },
      // A combo guard fills either backcourt slot, so his profile sits
      // between a point guard's and a shooting guard's.
      CG: { reb: 3.4, ast: 3.00, stl: 1.26, blk: 0.20 },
      F:  { reb: 6.0, ast: 1.65, stl: 1.00, blk: 0.84 },
      // Wings, and combo bigs, both appear in the roster sheet.
      W:  { reb: 4.9, ast: 2.05, stl: 1.12, blk: 0.355 },
      'F/C': { reb: 7.9, ast: 1.22, stl: 0.78, blk: 1.48 },
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
    const roleMult = this.roleWeightFor(player);

    const usageRef = (team && team.usageReference) ? team.usageReference : 78;
    let usageShare = Math.max(0.42, Math.min(1.68, 1 + (r - usageRef) * 0.033));

    // Usage ceiling by archetype. An off-ball big living on rolls and lobs
    // finishes plays rather than creating them and tops out around 17%
    // usage; a genuine post hub or passing big runs 20-25%. Perimeter
    // creators are unconstrained here. Which one a big is comes from his
    // scouting profile: post/passing indicators raise the ceiling.
    if (['C', 'F/C', 'PF'].includes(pos)) {
      const onBall = (ps && ps.ast ? ps.ast : 1) >= 1.1 || (ps && ps.score ? ps.score : 1) >= 1.15
        || !!(ps && ps.real && ps.real.astPct >= 14);
      const bigCeiling = onBall ? 1.30 : 0.92;
      usageShare = Math.min(usageShare, bigCeiling);
    }

    // Archetype governs how much of a player's high-school role survives
    // the jump. Off-ball bigs and specialists lose most of their usage;
    // designated scorers keep theirs.
    const arch = (ps && ps.archetype && this.ARCHETYPES[ps.archetype]) || null;
    if (arch) usageShare *= arch.usage;

    // Freshmen are squeezed hardest of all — they're sharing the floor
    // with grown men and slotting into an existing pecking order. Only
    // genuine top-of-the-class recruits are handed the offense.
    if (player.class === 'FR') {
      const elite = (parseFloat(player.rsci) || 999) <= 10;
      usageShare *= elite ? 1.00 : 0.91;
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
    // Genuine stars get a little extra: go-to scorers take the late-clock
    // and late-game shots, which is what separates a 20-point season.
    ppg += Math.max(0, r - 80) * 0.34 * Math.max(1, scoringUsage);
    // A soft ceiling: a focal-point star on a high-usage profile could be
    // projected past 50, which no shot cap downstream fully undoes (his
    // teammates' lines were built around it).
    if (ppg > 24) ppg = 24 + (ppg - 24) * 0.35;

    // Interior finishers get a volume floor proportional to their minutes.
    // Lobs, dump-offs and put-backs happen regardless of how small a
    // player's role is, so a big who is on the floor at all is taking
    // shots — a bench centre was otherwise ending up at barely one attempt
    // a night while still pulling down rebounds. Scouted roll men and post
    // hubs get the higher floor; any other interior player gets a smaller
    // one purely on position.
    const scoutedInterior = arch && (ps.archetype === 'rollBig' || ps.archetype === 'postHub');
    const positionalInterior = !arch && ['C', 'F/C', 'PF'].includes(pos);
    if (scoutedInterior) ppg = Math.max(ppg, mpg * 0.30);
    else if (positionalInterior) ppg = Math.max(ppg, mpg * 0.22);

    // Rebounding scales partly with involvement. A big who barely touches
    // the ball shouldn't still post double-digit boards; the flat
    // positional rate was producing ~8 ppg / ~10 rpg seasons.
    const involvement = 0.72 + 0.28 * Math.max(0.5, Math.min(1.6, usageShare));
    // A roll big still crashes the glass hard even though he barely
    // touches the ball — that's the whole point of the role.
    const athReb = (1 + ath * 0.10) * (arch ? arch.oreb : 1);
    const athStl = 1 + ath * 0.16;
    let rpg = Math.max(0.2, base.reb * usageScale * involvement * athReb);

    // Rebounds relative to scoring. A player averaging more boards than
    // points is close to nonexistent in real basketball, yet low-usage
    // centres were routinely doing it. Anything beyond a modest cushion
    // over his scoring average is pulled back, so a big has to actually
    // shoot to post huge rebounding numbers.
    const rebCeiling = ppg * 0.62 + 3.0;
    if (rpg > rebCeiling) rpg = rebCeiling + (rpg - rebCeiling) * 0.30;
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

    let fta = Math.max(0.2, (ppg * (isBig ? 0.282 : 0.178))
      * (coach ? coach.freeThrows : 1)
      * (arch ? arch.ftr : 1));
    // Three-point rate by position rather than a blunt big/small split.
    // The old single "big" rate had power forwards and centres launching
    // far too many threes; genuine stretch bigs now come from the
    // playstyle multiplier applied just below, not from the baseline.
    const THREE_PAR = {
      PG: 0.455, SG: 0.500, CG: 0.475, SF: 0.475, W: 0.470, 'G/F': 0.465, G: 0.465, F: 0.28,
      PF: 0.22, C: 0.07, 'F/C': 0.12
    };
    let threePar = THREE_PAR[pos] !== undefined ? THREE_PAR[pos] : (isBig ? 0.18 : 0.50);
    if (player.playstyle) {
      threePar = Math.max(0.05, Math.min(0.85, threePar * player.playstyle.threePar));
    }
    if (arch) {
      threePar = Math.max(0.03, Math.min(0.90, threePar * arch.par));
    }
    if (coach) {
      threePar = Math.max(0.05, Math.min(0.88, threePar * coach.threePar));
    }
    // However a player is profiled, some shot mixes don't happen: a point
    // or combo guard who has to run the offense never takes 60% of his
    // shots from three, and a centre stays near the rim.
    const PAR_CEILING = { PG: 0.54, CG: 0.54, G: 0.55, SG: 0.6, W: 0.6, 'G/F': 0.6, SF: 0.6, F: 0.52, PF: 0.5, 'F/C': 0.4, C: 0.36 };
    threePar = Math.min(threePar, PAR_CEILING[pos] !== undefined ? PAR_CEILING[pos] : 0.6);
    // Small forwards and wings shoot like perimeter players, even though
    // they count as "big" for rebounding above.
    const interiorShooter = ['PF', 'C', 'F/C'].includes(pos) || (isBig && !['SF', 'F', 'W', 'G/F'].includes(pos));
    let threePPct = Math.min(0.46, Math.max(0.20,
      (interiorShooter ? 0.315 : 0.358) * (player.playstyle ? player.playstyle.threePct : 1)));

    // Free throws follow position and shooting touch. Guards who can shoot
    // live above 80%, wings a little lower, power forwards around 70% and
    // centres in the mid-60s, with real outliers either way. The old model
    // split everyone into "big" (70.5%) or not (82.5%), counted small
    // forwards as bigs, and ignored how well a player shoots otherwise.
    const FT_BASE = { PG: 0.765, SG: 0.765, CG: 0.765, G: 0.765, 'G/F': 0.740, W: 0.730, SF: 0.715,
      F: 0.700, PF: 0.690, 'F/C': 0.655, C: 0.630 };
    let ftPct = FT_BASE[pos] !== undefined ? FT_BASE[pos] : (isBig ? 0.68 : 0.77);
    const ps3 = player.playstyle ? (player.playstyle.threePct || 1) : 1;
    const psFt = player.playstyle ? (player.playstyle.ftPct || 1) : 1;
    ftPct += (ps3 - 1) * 0.30 + (psFt - 1) * 0.35;          // scouted touch
    // Good shooters make free throws, but a big who never shoots threes
    // isn't judged by a three-point percentage he hardly uses.
    ftPct += (threePPct - 0.34) * 1.20 * Math.min(1, threePar / 0.25);
    if (threePar >= 0.45) ftPct += 0.02;                     // volume shooters
    ftPct += this.shootingTouch(player) * 0.045;             // each player's own stroke
    // A real volume shooter who hits from deep is almost never a poor
    // free-throw shooter: floor him around 80%.
    if ((threePar >= 0.46 && threePPct >= 0.355) || threePPct >= 0.375) ftPct = Math.max(ftPct, 0.805 + (threePPct - 0.35) * 1.0 + Math.max(0, this.shootingTouch(player)) * 0.035);
    ftPct = Math.min(0.93, Math.max(0.45, ftPct));
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

    // What he actually did before college (recruitProduction) anchors his
    // efficiency and shot profile: two-point and free-throw percentage,
    // how often he shoots threes and how well. The model's own numbers
    // still count for a share, so a rating jump or a trait still shows.
    const real = ps && ps.real;
    if (real) {
      const mix = (a, b, w) => a * (1 - w) + b * w;
      if (real.p3ar != null) threePar = Math.min(mix(threePar, real.p3ar, 0.7), PAR_CEILING[pos] !== undefined ? PAR_CEILING[pos] : 0.6);
      if (real.fg3 != null && real.fga3 != null) threePPct = Math.min(0.46, Math.max(0.20, mix(threePPct, real.fg3, Math.min(0.65, real.fga3 / 5))));
      if (real.fg2 != null) twoPPct = Math.min(0.72, Math.max(0.38, mix(twoPPct, real.fg2 + (r - 80) * 0.002, 0.65)));
      if (real.ft != null) ftPct = Math.min(0.93, Math.max(0.40, mix(ftPct, real.ft, 0.75)));
    }

    // Recruits carry a playstyle derived from their HS/AAU profile, so an
    // imported prospect simulates like the player he was scouted as rather
    // than like a generic example of his position.
    if (ps) {
      // Clamped: playstyle, scouting tags and the coach's system each
      // multiply these, and unbounded stacking was a major contributor to
      // 20-rebound and 12-assist seasons.
      // These multipliers stack on top of positional baselines that are
      // already calibrated to league norms, so wide clamps let an imported
      // recruit blow straight past what any generated player can reach —
      // an elite centre was landing at 13.9 rpg and 3.1 bpg before a game
      // was even simulated. Tight bands keep playstyle as flavour rather
      // than amplification, which is why imported classes used to look
      // unrealistic while later, generated-heavy years read fine.
      const lim = (v, lo, hi) => Math.max(lo, Math.min(hi, v || 1));
      // Same bounds the playstyle itself is built within, so a scouted
      // weakness (a big who can't block shots) isn't clamped back to normal.
      const B = this.PLAYSTYLE_BOUNDS;
      ppg *= lim(ps.score, ...B.score);
      rpg *= lim(ps.reb, ...B.reb);
      // Passing: his real assist rate against what's normal for his
      // position, so a big who runs the offense through the high post
      // keeps doing it. Strength/weakness picks still move it from there.
      const POS_AST = { PG: 26, CG: 21, G: 22, SG: 15, 'G/F': 14, W: 13, SF: 12, F: 10, PF: 9, 'F/C': 8, C: 7 };
      if (real && real.astPct != null && POS_AST[pos]) {
        const traitAst = ps.base && ps.base.ast ? (ps.ast || 1) / ps.base.ast : 1;
        apg *= Math.max(0.55, Math.min(3.0, Math.pow(real.astPct / POS_AST[pos], 0.85))) * Math.max(0.8, Math.min(1.25, traitAst));
      } else apg *= lim(ps.ast, ...B.ast);
      stl *= lim(ps.stl, ...B.stl);
      blk *= lim(ps.blk, ...B.blk);
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
      const creator = (ps && ps.ast ? ps.ast : 1) * posFactor * (arch ? arch.ast : 1);
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

    // Strength / Weakness picks that act on the rest of his line: IQ means
    // fewer turnovers and fouls and better shots, physicality earns free
    // throws and finishes through contact, and defense moves his DBPM.
    const tr = this.traitEffects(player);
    tov = Math.max(0.2, tov * tr.tov);
    pf = Math.min(3.8, Math.max(0.4, pf * tr.pf));
    fta = Math.max(0.2, fta * tr.fta);
    twoPPct = Math.min(0.72, Math.max(0.38, twoPPct + tr.twoP));
    dbpm += tr.dbpm;
    bpm += tr.dbpm;

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
    const btn = document.getElementById('simWeekBtn');
    if (btn) btn.classList.add('busy');
    this._spinnerShownAt = Date.now();
  },

  async hideSimSpinner() {
    const el = document.getElementById('simSpinner');
    if (!el) return;
    const elapsed = Date.now() - (this._spinnerShownAt || 0);
    if (elapsed < 650) await new Promise(r => setTimeout(r, 650 - elapsed));
    el.classList.remove('active');
    const btn = document.getElementById('simWeekBtn');
    if (btn) btn.classList.remove('busy');
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
    // The high-school season and the international pros move with it.
    this.advanceHsCalendar();
    this.updateProSeasons();
    await this.saveHsState();
  },

  // The high-school calendar and the pros change after the main save has
  // already run, so they're written on their own.
  async saveHsState() {
    if (this._skipping) { this._skipDirty = true; return; }
    try {
      if (typeof db !== 'undefined' && db.leagueState && db.leagueState.update) {
        await db.leagueState.update(1, { hsCalendar: this.state.hsCalendar || null, proPlayers: this.state.proPlayers || [] });
      }
    } catch (e) { console.warn('Saving the high-school calendar:', e); }
  },

  phaseLabelShort() {
    const s = this.state;
    if (s.ncaaDone) return 'April';
    if (s.confChampsDone) {
      const n = s.ncaaTournament ? s.ncaaTournament.rounds.length : 0;
      return n ? this.NCAA_ROUND_NAMES[n - 1] : 'Selection Sunday';
    }
    if (s.regularSeasonDone) return 'Conf. tournaments';
    return s.week ? `Week ${s.week}` : 'Preseason';
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
    if (this.state.week > 2 && this.state.week % 3 === 0) this.reevaluateRotations();
    const gamesThisWeek = this.state.schedule.filter(g => g.week === this.state.week && !g.played);
    const rankBefore = {};
    this.state.teams.forEach(t => { const r = this.state.week > 1 ? t.apRank : (t.preseasonRank && t.preseasonRank <= 25 ? t.preseasonRank : null); if (r) rankBefore[t.school] = r; });

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
      this.state.lastWeekSummary = this.summarizeWeek(gamesThisWeek, rankBefore);
      this.syncUI();
      this.logNews(`Week ${this.state.week} simulation complete (${gamesThisWeek.length} games).`);
      const ws = this.state.lastWeekSummary;
      this.toast(`Week ${this.state.week} is in the books`, ws.headline ? `${ws.upsets} ranked team${ws.upsets === 1 ? '' : 's'} lost · ${ws.headline}` : `${ws.games} games played`);
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
    // An injured player's minutes go out by headroom, not in proportion:
    // the bench and the sixth man pick up most of them, and a star already
    // playing 34 barely moves. A flat multiplier had stars logging 38-40
    // every time a teammate sat.
    const mpgOf = p => parseFloat(p.expectedStats && p.expectedStats.mpg) || 0;
    const room = p => { const m = mpgOf(p); return m > 0 ? m * Math.max(0, 36 - m) : 0; };
    const roomTotal = available.reduce((n, p) => n + room(p), 0);
    if (!lostMinutes || !roomTotal) return { available, multiplier: 1 };
    const boost = new Map();
    available.forEach(p => {
      const m = mpgOf(p);
      if (m > 0) boost.set(p.id, Math.min(1.8, 1 + (lostMinutes * room(p) / roomTotal) / m));
    });
    return { available, multiplier: p => boost.get(p.id) || 1 };
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
        // Form moves unmarked players substantially — a bench player
        // outplaying a starter should work his way up. Players the sheet
        // has explicitly cast keep their role regardless of form.
        const cast = (p.role || '').replace(/[^a-z]/g, '');
        const swing = cast ? 3 : 9;
        p.formAdjust = Math.max(-swing, Math.min(swing, bpm * 1.25)) * evidence;
        // A top recruit's leash: an early slump barely counts; past a dozen
        // games it counts in full.
        if (p.class === 'FR' && (parseFloat(p.rsci) || 999) <= 60 && p.formAdjust < 0) p.formAdjust *= Math.min(1, gp / 12);
        p.baseRating = p.baseRating !== undefined ? p.baseRating : parseFloat(p.rating);
        p.rating = p.baseRating + p.formAdjust;
      });
      // Form decides MINUTES only. The true rating is restored before
      // expectations are rebuilt, because letting a form-boosted rating
      // also drive usage creates a feedback loop: a hot player earns more
      // usage, scores more, and is boosted again on the next review.
      this.buildRotation(team);
      // A freshman who started early and has since lost the job.
      const starting = new Set(team.starters || []);
      (team.roster || []).forEach(p => {
        const gp = (p.stats && p.stats.gp) || 0;
        if (p.class !== 'FR') return;
        if (starting.has(p.id) && gp <= 6) p.startedEarly = true;
        p.lostSpot = !!p.startedEarly && gp >= 12 && !starting.has(p.id);
      });
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
    this.updateEfficiencyNorm();
  },

  playGame(home, away, scheduleEntry, gamePhaseLabel) {
    const homeAvail = this.availableRosterFor(home);
    const awayAvail = this.availableRosterFor(away);
    const homeFull = home.simData.rosterRef;
    const awayFull = away.simData.rosterRef;
    home.simData.rosterRef = homeAvail.available;
    away.simData.rosterRef = awayAvail.available;

    if (this.state.effNorm == null) this.updateEfficiencyNorm();
    const result = GameCore.simulateSingleGame(home, away, {
      homeMinutesMultiplier: homeAvail.multiplier,
      awayMinutesMultiplier: awayAvail.multiplier,
      effNorm: this.state.effNorm || undefined,
      effAcc: this.state.effAcc || (this.state.effAcc = { pts: 0, load: 0 })
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
        // Games against ranked teams are where scouts pay closest attention.
        const opp = oppSchool === away.school ? away : home;
        const own = oppSchool === away.school ? home : away;
        const oppRank = this.rankForBigGame(opp), ownRank = this.rankForBigGame(own);
        if (oppRank) this.noteBigGame(player, box, {
          weight: (oppRank <= 10 ? 0.65 : 0.45) + (ownRank ? 0.1 : 0), tough: oppRank <= 10 ? 0.92 : 0.95,
          label: `${isHome ? 'vs' : 'at'} No. ${oppRank} ${oppSchool}`, won: teamScore > oppScore
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

    const calc = (allLogs) => {
       // A game only counts as played if he got on the floor. Did-not-play
       // games stay in the log (they show as DNP) but not in GP or averages.
       const logs = allLogs.filter(g => (g.min || 0) > 0);
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

    const ctx = this._bracketCtx || {};
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
        // Postseason games move draft stock most of all.
        if (phaseLabel === 'ncaa') {
          const r = ctx.round == null ? 0 : ctx.round;
          const name = r < 0 ? 'First Four' : this.NCAA_ROUND_NAMES[r] || 'NCAA Tournament';
          this.noteBigGame(player, box, { weight: r < 0 ? 0.6 : this.BIG_ROUND_WEIGHT[r] || 1, tough: r >= 2 ? 0.92 : 0.95, label: `${name} vs ${opp.school}`, won: teamScore > oppScore });
        } else if (phaseLabel === 'conftourney') {
          this.noteBigGame(player, box, { weight: ctx.final ? 0.9 : 0.55, tough: 0.96, label: `${ctx.conf || team.conference} Tournament ${ctx.final ? 'final' : 'game'} vs ${opp.school}`, won: teamScore > oppScore });
        }
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
      this._bracketCtx = { conf: confName, final: false };
      (bracket.playIn || []).forEach(g => this.attachBracketGameLogs(g, 'conftourney'));
      bracket.rounds.forEach((round, ri) => {
        this._bracketCtx = { conf: confName, final: ri === bracket.rounds.length - 1 };
        round.forEach(g => this.attachBracketGameLogs(g, 'conftourney'));
      });
      this._bracketCtx = null;

      bracket.champion.wonConfTourney = true;
      // Seeds by standings, kept with the bracket for drawing it.
      bracket.seeds = {};
      confTeams.forEach((t, i) => { bracket.seeds[t.school] = i + 1; });
      this.state.confTournaments[confName] = bracket;
    });

    this.recalculateAllAverages();
    this.awardConferenceTournamentMops();
    this.state.confChampsDone = true;
    // Selection Sunday: the real field, seeded and placed in regions.
    this.state.ncaaSelection = this.buildSelection(false);
    await this.saveStateToDB();
    this.syncUI();
    this.logNews("Conference Championships complete. The NCAA field is set.");
    if (typeof Cutscene !== 'undefined' && Cutscene.enabled()) this.playSelectionShow();
  },



  // ---------- Scripted draft picks & the NBA side of the draft ----------

  // The roster sheet's Draft column scripts a real-world outcome:
  //   "2033 P1"   -- exact overall pick 1
  //   "2033 T10"  -- somewhere in the top 10; the simulated board and
  //                  team fit decide the exact slot within that range
  // The legacy "2030 R:1 P:3" (round + pick-in-round) is still read.
  parseDraftSpec(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    const year = (s.match(/(20\d{2})/) || [])[1];
    if (!year) return null;
    const yr = parseInt(year, 10);

    // Legacy: an explicit round marker means "round N, pick M within it".
    const roundM = s.match(/\bR(?:d|ound)?\s*[:#.]?\s*(\d)\b/i);
    if (roundM) {
      const pickM = s.match(/\bP(?:ick)?\s*[:#.]?\s*(\d{1,2})\b/i);
      if (!pickM) return null;
      const r = parseInt(roundM[1], 10), p = parseInt(pickM[1], 10);
      if (p < 1 || p > 30 || r < 1 || r > 2) return null;
      return { year: yr, round: r, pick: p, overall: (r - 1) * 30 + p };
    }

    // "T10" / "Top 10": guaranteed inside the top N picks, exact slot left
    // to the simulated draft.
    const topM = s.match(/\bT(?:op)?\s*[:#.]?\s*(\d{1,2})\b/i);
    if (topM) {
      const range = parseInt(topM[1], 10);
      if (range < 1 || range > 60) return null;
      return { year: yr, range };
    }

    // "P1" / "Pick 1": exact overall pick.
    const pickM = s.match(/\bP(?:ick)?\s*[:#.]?\s*(\d{1,2})\b/i);
    if (pickM) {
      const pick = parseInt(pickM[1], 10);
      if (pick < 1 || pick > 60) return null;
      return { year: yr, overall: pick, round: pick <= 30 ? 1 : 2, pick: pick <= 30 ? pick : pick - 30 };
    }
    return null;
  },

  // A player's scripted slot: from his own record, or (for saves made
  // before the column was read) from the roster sheet rows by name.
  scriptedDraftFor(player) {
    if (!player) return null;
    if (player.scriptedDraft) return player.scriptedDraft;
    const rows = this.state.rawRosterRows || [];
    if (!rows.length) return null;
    if (!this._draftSpecByName) {
      this._draftSpecByName = {};
      rows.forEach(r => {
        const spec = this.parseDraftSpec(r.draft || r.draftpick || r.scripteddraft);
        const name = String(r.name || r.player || r.fullname || '').trim().toLowerCase();
        if (spec && name) this._draftSpecByName[name] = spec;
      });
    }
    return this._draftSpecByName[String(player.name || '').trim().toLowerCase()] || null;
  },

  // The NBA season behind each draft's lottery, generated once per draft
  // year and saved, so the Draft RP's projections and the real draft use
  // the same standings.
  getNbaLeague(draftYear) {
    if (typeof NBACore === 'undefined') return null;
    if (!this.state.nbaLeagues) this.state.nbaLeagues = {};
    if (!this.state.nbaLeagues[draftYear]) {
      this.state.nbaLeagues[draftYear] = NBACore.generateLeagueState(draftYear);
    }
    return this.state.nbaLeagues[draftYear];
  },

  upcomingDraftYear() { return this.state.year + 1; },

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

      // The roster sheet's Draft column overrides the model: a player
      // scripted for this draft always declares, and one scripted for a
      // later draft stays in school until then (unless he's out of
      // eligibility anyway).
      const scripted = this.scriptedDraftFor(p);
      const draftYear = this.upcomingDraftYear();
      if (scripted && scripted.year === draftYear) declares = true;
      else if (scripted && scripted.year > draftYear && !mandatory) declares = false;
      // On next season's tab: the sheet already has him back.
      else if (this.listedNextSeason(p)) declares = false;
      // Too young for this draft (the sheet's scripted pick still stands).
      if (declares && !(scripted && scripted.year === draftYear) && typeof DraftCore !== 'undefined' && !DraftCore.ageEligible(p, draftYear)) declares = false;

      if (declares) {
        declarations.push({
          id: p.id, name: p.name, school: p.school, pos: p.pos, class: cls,
          rating, mandatory, boardRank: rank,
          scripted: !!(scripted && scripted.year === draftYear),
          conference: p.conference,
          ppg: p.stats ? p.stats.ppg : '0.0',
          rpg: p.stats ? p.stats.rpg : '0.0',
          apg: p.stats ? p.stats.apg : '0.0'
        });
      }
    });

    // International pros: a projected first-rounder enters, so does anyone
    // in his last year before he'd be automatically eligible anyway, and a
    // borderline one sometimes tests the waters.
    (this.state.proPlayers || []).forEach(p => {
      const rank = boardRank[p.id] || 999;
      const last = (p.proYears || 0) >= 3;
      const scripted = this.scriptedDraftFor(p);
      const draftYear = this.upcomingDraftYear();
      let declares = rank <= 30 || last || (rank <= 60 && Math.random() < 0.55);
      if (scripted && scripted.year === draftYear) declares = true;
      else if (scripted && scripted.year > draftYear && !last) declares = false;
      if (!declares) return;
      declarations.push({
        id: p.id, name: p.name, school: p.school, pos: p.pos, class: 'Pro',
        rating: parseFloat(p.rating) || 0, mandatory: last, boardRank: rank,
        scripted: !!(scripted && scripted.year === draftYear), conference: 'Pro', isPro: true,
        ppg: p.stats ? p.stats.ppg : '0.0', rpg: p.stats ? p.stats.rpg : '0.0', apg: p.stats ? p.stats.apg : '0.0'
      });
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

  // Each team's season as it ended: coach, team stats with their national
  // ranks, and every player's line, so a past season's team page reads like
  // a current one even after its players are gone. Player lines are stored
  // as arrays against one key list to keep saves small.
  ROSTER_KEYS: ['gp','gs','mpg','ppg','oreb','rpg','apg','stl','blk','tov','pf','fgm','fga','fgPct','twoPm','twoPa','twoPPct',
    'threePm','threePa','threePPct','ftm','fta','ftPct','bpm','obpm','dbpm','tsPct','eFgPct','orebPct','drebPct','trbPct',
    'astPct','tovPct','blkPct','usg','ftr','threePar','ortg','drtg','netRtg'],
  archiveRosters(year) {
    const s = this.state;
    if (!s.rosterArchive || typeof s.rosterArchive !== 'object') s.rosterArchive = {};
    if (s.rosterArchive[year]) return;
    const keys = this.ROSTER_KEYS;
    const rows = new Map(this.computeAllTeamStats().map(r => [r.school, r]));
    const teams = {};
    s.teams.forEach(t => {
      const r = rows.get(t.school);
      teams[t.school] = {
        conf: t.conference || '', coach: t.coach ? t.coach.name : '', prestige: t.prestige != null ? t.prestige : null,
        preseason: t.preseasonRank || null, sos: t.sosRank || null,
        stats: r ? r.stats : null, ranks: r ? r.ranks : null,
        players: (t.roster || []).map(p => [p.id, p.name, p.pos || '', p.class || '', p.jersey || '',
          ...keys.map(k => (p.stats && p.stats[k] !== undefined ? p.stats[k] : null))])
      };
    });
    s.rosterArchive[year] = { keys, teams };
  },

  // A team's season: from the roster archive, or, for seasons played
  // before the archive existed, pieced together from each player's own
  // season lines.
  teamSeasonData(school, year) {
    const s = this.state;
    const team = this.findTeam(school);
    const hist = team && (team.history || []).find(h => h.year === year) || null;
    const a = s.rosterArchive && s.rosterArchive[year];
    const t = a && a.teams && a.teams[school];
    if (t) {
      const players = t.players.map(row => {
        const [id, name, pos, cls, jersey, ...vals] = row;
        const stats = {};
        a.keys.forEach((k, i) => { stats[k] = vals[i] == null ? '—' : vals[i]; });
        return { id, name, pos, class: cls, jersey, stats };
      });
      return { school, year, hist, conf: t.conf, coach: t.coach, prestige: t.prestige, preseason: t.preseason, sos: t.sos,
        stats: t.stats, ranks: t.ranks || {}, players, archived: true };
    }
    const pool = s.activePlayers.concat(s.recruits || [], s.proPlayers || [], s.departedArchive || []);
    const seen = new Set();
    const players = [];
    pool.forEach(p => {
      if (seen.has(p.id)) return;
      const h = (p.seasonHistory || []).find(x => x.year === year && x.school === school);
      if (!h) return;
      seen.add(p.id);
      players.push({ id: p.id, name: p.name, pos: p.pos, class: h.class || '', jersey: '', stats: h.stats || {} });
    });
    const conf = (players.length && (pool.find(p => p.id === players[0].id) || {}).seasonHistory || []).find(x => x.year === year && x.school === school);
    return { school, year, hist, conf: (conf && conf.conference) || (team && team.conference) || '', coach: '', stats: null, ranks: {}, players, archived: false };
  },

  // Seasons a team has on record, newest first, the current one included.
  teamSeasons(school) {
    const team = this.findTeam(school);
    const years = new Set((team && team.history || []).map(h => h.year));
    Object.keys(this.state.rosterArchive || {}).forEach(y => { if (this.state.rosterArchive[y].teams[school]) years.add(Number(y)); });
    years.add(this.state.year);
    return [...years].sort((x, y) => y - x);
  },

  // Records the finished season permanently before anything resets for the
  // new year — per player, per team, and league-wide. This is what the
  // season summary and team history pages read from.
  archiveCompletedSeason() {
    const year = this.state.year;

    // Pros too, so a drafted pro's profile has his season overseas.
    this.draftPool().forEach(p => {
      if (!p.seasonHistory) p.seasonHistory = [];
      if (p.stats && p.stats.gp > 0 && !p.seasonHistory.some(h => h.year === year)) {
        p.seasonHistory.push({
          year, school: p.school, class: p.class, conference: p.conference,
          stats: { ...p.stats }
        });
      }
    });

    const ncaaWins = this.ncaaWinsBySchool();
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
        wonNationalTitle: !!team.wonNationalTitle,
        ncaaWins: ncaaWins[team.school] || 0
      });
    });

    this.archiveRosters(year);

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
      honors: this.state.postseasonHonors && this.state.postseasonHonors.year === year ? this.state.postseasonHonors : null,
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

      // Recruit to the PROGRAM's level, not to whatever is left on the
      // roster right now. Using the current roster average meant a team
      // that just lost its best players signed a weaker class, which made
      // it weaker again the next year — a feedback loop that deflated
      // league-wide talent by more than ten rating points over four
      // seasons. Blue-bloods reload; they don't spiral.
      // The program's level comes from its prestige: history, recent
      // seasons and the coach. Without it, the conference tier's range.
      const tier = RosterGen.getConferenceTier(team.conference);
      const range = RosterGen.TIER_RANGES[tier] || [62, 78];   // [min, max]
      const programLevel = (typeof Prestige !== 'undefined' && team.prestige != null)
        ? Prestige.programLevel(team.prestige)
        : (range[0] + range[1]) / 2;
      const rosterAvg = roster.length
        ? roster.reduce((n, p) => n + parseFloat(p.rating), 0) / roster.length
        : programLevel;
      // Mostly the program's standing, nudged by how the roster is doing.
      const baseline = programLevel * 0.75 + rosterAvg * 0.25;

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
        // Set the incoming rating explicitly rather than inheriting the
        // filler generator's unranked-freshman penalty, which exists to
        // stop generated players out-rating real recruits at universe
        // creation and is far too harsh for an actual signing class.
        //
        // Freshmen should arrive a few points below their program's level
        // and close that gap through development. A career adds roughly
        // four points, so entering ~3 under keeps the league's talent
        // level flat instead of bleeding downward every season.
        const spread = (Math.random() + Math.random() - 1) * 6;
        p.rating = Math.max(50, Math.min(92, Math.round(baseline - 5.5 + spread)));
        p.potential = Math.min(99, Math.round(p.rating + 5 + Math.random() * 8));
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
      // Players the season's tab lists are never the ones cut.
      const remaining = [...roster].sort((a, b) =>
        (b.onSeasonSheet ? 1 : 0) - (a.onSeasonSheet ? 1 : 0) || parseFloat(b.rating) - parseFloat(a.rating));
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
  // The rows on one season's tab, by lowercase name. seasonTag is the
  // sheet's label for the season, the year it ends (2028-29 -> 2029).
  seasonSheetRows(seasonTag) {
    const out = {};
    (this.state.rawRosterRows || []).forEach(r => {
      if (!this.rowHasPlayerName(r) || this.getRowSeasonYear(r) !== seasonTag) return;
      const key = String(r.name || r.player || r.fullname).trim().toLowerCase();
      (out[key] = out[key] || []).push(r);
    });
    return out;
  },

  // His row on NEXT season's tab, if the sheet lists him there. A listed
  // player is coming back — to the same school, or to the one the tab puts
  // him at — so he doesn't declare early, enter the portal or graduate.
  // With two players sharing a name, only a row naming his school counts.
  listedNextSeason(p) {
    if (!p) return null;
    const tag = this.currentSeasonSheetYear() + 1;
    const src = this.state.rawRosterRows;
    if (!this._nextSheet || this._nextSheet.tag !== tag || this._nextSheet.src !== src) {
      this._nextSheet = { tag, src, rows: this.seasonSheetRows(tag) };
    }
    const rows = this._nextSheet.rows[String(p.name || '').trim().toLowerCase()];
    if (!rows || !rows.length) return null;
    if (rows.length === 1) return rows[0];
    const school = String(p.school || '').toLowerCase();
    return rows.find(r => [r.team, r.school, r.transferredfrom, r.previousschool]
      .some(v => String(v || '').trim().toLowerCase() === school)) || null;
  },

  findTeamByName(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return this.state.teams.find(t => t.school.toLowerCase() === n) ||
      (typeof RosterGen !== 'undefined' && RosterGen.normalizeSchoolKey
        ? this.state.teams.find(t => RosterGen.normalizeSchoolKey(t.school) === RosterGen.normalizeSchoolKey(name))
        : null) || null;
  },

  // Applies the tab for the season that's starting. Listed players already
  // in the universe take whatever the row fills in (role, traits, grades,
  // OVR, class, draft pick); blank cells leave the simulation's value.
  // Names not in the universe (JUCO and non-D1 transfers, walk-ons) join
  // the team the row puts them on.
  applySeasonSheet() {
    const byName = this.seasonSheetRows(this.currentSeasonSheetYear());
    this.state.teams.forEach(t => (t.roster || []).forEach(p => { delete p.onSeasonSheet; }));
    const departed = this.state.departedNames || new Set();
    let updated = 0, added = 0;
    // Each player answers to one row. Without this, two different players
    // who share a name (two freshman Elijah Williamses) would both resolve
    // to whichever one the first row created.
    const claimed = new Set();
    Object.keys(byName).forEach(key => byName[key].forEach(row => {
      const team = this.findTeamByName(row.team || row.school);
      if (!team) return;
      const matches = [];
      this.state.teams.forEach(t => (t.roster || []).forEach(p => {
        if (!claimed.has(p) && String(p.name || '').trim().toLowerCase() === key) matches.push({ t, p });
      }));
      const hit = matches.find(m => m.t === team) || (matches.length === 1 && byName[key].length === 1 ? matches[0] : null);
      if (!hit) {
        // Drafted or graduated already: someone of that name who left this
        // program (a namesake elsewhere is a different player).
        const nm = String(row.name || '').trim().toLowerCase();
        if ((this.state.departedArchive || []).some(d => String(d.name || '').trim().toLowerCase() === nm &&
          (d.school === team.school || (d.collegeHistory || []).includes(team.school)))) return;
        const fresh = this.normalizePlayerObj(row, false);
        fresh.school = team.school;
        fresh.conference = team.conference;
        fresh.school_logo = this.getTeamLogo(team.school);
        fresh.onSeasonSheet = true;
        team.roster.push(fresh);
        claimed.add(fresh);
        added++;
        return;
      }
      const p = hit.p;
      if (hit.t !== team) {
        hit.t.roster = hit.t.roster.filter(x => x.id !== p.id);
        if (!p.collegeHistory) p.collegeHistory = [hit.t.school];
        if (p.collegeHistory[p.collegeHistory.length - 1] !== team.school) p.collegeHistory.push(team.school);
        p.school = team.school;
        p.conference = team.conference;
        p.school_logo = this.getTeamLogo(team.school);
        team.roster.push(p);
      }
      this.applySheetRow(p, row, team);
      p.onSeasonSheet = true;
      claimed.add(p);
      updated++;
    }));
    if (updated || added) console.log(`Season sheet: ${updated} listed players updated, ${added} added.`);
    return { updated, added };
  },

  // One row's filled-in cells onto an existing player.
  applySheetRow(p, row, team) {
    const getVal = (keys, fallback = '') => {
      for (const k of keys) if (row[k] !== undefined && String(row[k]).trim() !== '') return row[k];
      return fallback;
    };
    const filled = keys => getVal(keys, null) !== null;
    if (filled(['rating', 'ovr'])) {
      const r = parseFloat(getVal(['rating', 'ovr']));
      if (!isNaN(r)) p.rating = r;
    }
    const cls = this.normalizeClassStanding(getVal(['class', 'yr', 'classstanding'], ''));
    if (cls) p.class = cls;
    if (filled(['pos', 'position'])) p.pos = String(getVal(['pos', 'position'])).toUpperCase();
    if (filled(['ht', 'height'])) p.ht = getVal(['ht', 'height']);
    if (filled(['wt', 'weight'])) p.wt = getVal(['wt', 'weight']);
    if (filled(['role', 'playerrole'])) p.role = String(getVal(['role', 'playerrole'])).trim().toLowerCase();
    const jersey = String(getVal(['jersey', 'number', 'num', 'jerseynumber'], '')).replace(/[^0-9]/g, '');
    if (jersey && !(team.roster || []).some(x => x !== p && String(x.jersey) === jersey)) p.jersey = jersey;
    const g = this.readGrades(getVal, p.rating);
    if (g.athleticism) { p.athleticism = g.athleticism; p.athleticismGrade = g.athleticismGrade; }
    if (g.potential) { p.potential = g.potential; p.potentialGrade = g.potentialGrade; }
    const t = this.readTraits(getVal);
    if (t.strengths.length || t.weaknesses.length) {
      p.traits = { strengths: t.strengths, weaknesses: t.weaknesses };
      this.applyTraitsToPlaystyle(p);
    }
    const draft = this.parseDraftSpec(getVal(['draft', 'draftpick', 'scripteddraft'], ''));
    if (draft) p.scriptedDraft = draft;
  },

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
    // A program's pull is its talent plus its name: players move up to
    // better teams, and toward the programs with prestige.
    const pull = t => (t.simData.teamOvr || 0) + ((t.prestige != null ? t.prestige : 50) - 50) * 0.1;
    const destinations = [...this.state.teams].sort((a, b) => pull(b) - pull(a));

    this.state.teams.forEach(team => {
      const sosPercentile = team.sosRank ? 1 - (team.sosRank / this.state.teams.length) : 0.5;

      (team.roster || []).forEach(p => {
        if (declaredIds.has(p.id)) return;                 // already leaving for the draft
        if (excludeIds && excludeIds.has(p.id)) return;     // already moved by a scripted transfer
        if (this.listedNextSeason(p)) return;               // next season's tab says where he plays
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

        // A blue-chip freshman who started early, struggled and lost the
        // job: plenty of them are gone after the season.
        if (p.lostSpot && (parseFloat(p.rsci) || 999) <= 60) {
          chance = Math.max(chance, 0.45);
          reason = 'Lost his starting spot';
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
            d.school !== team.school && pull(d) > pull(team));
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
  // The offseason, in five steps. The whole NBA draft cycle — combine,
  // lottery, workouts, the withdrawal deadline and draft night — happens
  // in the Draft RP, and the NCAA RP waits at the "NBA Draft" step until
  // draft night is over. Only then do the portal, the high-school summer
  // circuit (AAU and FIBA) and the roster moves run.
  OFFSEASON_STAGES: [
    { key: 'summary', label: 'Season Wrap-Up' },
    { key: 'draft',   label: 'NBA Draft' },
    { key: 'portal',  label: 'Transfer Portal' },
    { key: 'summer',  label: 'Summer Circuit' },
    { key: 'rosters', label: 'Final Rosters' }
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

    // Draft night belongs to the Draft RP. Pick up anything it has done,
    // and wait here until the draft has been held.
    if (stage.key === 'draft') {
      await this.syncDraftFromDB();
      if (!this.isDraftComplete()) {
        if (typeof window !== 'undefined' && window.__BTR_AUTO_DRAFT) this.runDraftCycleHere();
        else {
          this.openOffseason('draft');
          this.syncUI();
          return;
        }
      }
    }

    // The summer is a short season of its own: each Continue plays its
    // next step (a session, a round, a stage of the World Cup), and only
    // once it's over does the offseason move on to Final Rosters.
    // The summer is played on the Recruiting page, against this save (the
    // way the draft is played in the Draft RP): the NCAA RP waits here
    // until it's over. It can be played here instead, a step at a time,
    // from the Summer Circuit page.
    if (stage.key === 'summer') {
      const first = !this.state.summer || this.state.summer.season !== this.summerSeason();
      const P = this.startSummer();
      if (P && P.v === 2 && !P.done) await this.syncSummerFromDB();
      const Q = this.state.summer;
      if (Q && Q.v === 2 && !Q.done) {
        const here = typeof window !== 'undefined' && window.__BTR_AUTO_SUMMER;
        if (here) this.playSummerStep();
        this.state.phase = `Offseason — Summer Circuit`;
        this.openOffseason('summer');
        this.syncUI();
        await this.saveStateToDB();
        if (first) this.playOffseasonScene('summer');
        else if (!here && typeof location !== 'undefined' && !this._noNavigate) location.href = '../recruiting/#/summer';
        return;
      }
    }

    await this.runOffseasonStage(stage.key);
    let ran = stage.key;
    this.state.offseasonStageIndex = idx + 1;

    // Coming back from draft night, one click opens the portal: the draft
    // has already been seen in full in the Draft RP.
    const after = this.OFFSEASON_STAGES[this.state.offseasonStageIndex];
    if (stage.key === 'draft' && after && after.key === 'portal') {
      await this.runOffseasonStage('portal');
      ran = 'portal';
      this.state.offseasonStageIndex += 1;
    }

    if (this.state.offseasonStageIndex < this.OFFSEASON_STAGES.length) {
      this.state.phase = `Offseason — ${this.OFFSEASON_STAGES[this.state.offseasonStageIndex].label}`;
      const view = this.stageToView(ran);
      this.openOffseason(view);
      this.syncUI();
      await this.saveStateToDB();
      if (ran !== 'summer') this.playOffseasonScene(ran);   // the summer's scene plays when it tips off
      return;
    }

    await this.completeOffseason();
  },

  stageToView(key) {
    if (key === 'summary' || key === 'draft') return 'draft';
    if (key === 'portal' || key === 'rosters') return 'transfers';
    if (key === 'summer') return 'summer';
    return 'champion';
  },

  // ---------- Skip ahead ----------
  // Simulates week after week (and round after round) until the season
  // reaches the chosen point. Cutscenes, spotlights and toasts stay quiet
  // on the way; everything still lands in the news and the records.
  SKIP_TARGETS: [
    { key: 'conf', label: 'Conference play' },
    { key: 'confT', label: 'Conference tournaments' },
    { key: 'ncaa', label: 'NCAA Tournament' },
    { key: 'off', label: 'Offseason' }
  ],
  skipReached(target) {
    const s = this.state;
    if (target === 'conf') return s.regularSeasonDone || (s.nonConfEnd > 0 && (s.week || 0) >= s.nonConfEnd);
    if (target === 'confT') return !!s.regularSeasonDone;
    if (target === 'ncaa') return !!s.confChampsDone;
    if (target === 'off') return !!s.ncaaDone;
    return true;
  },
  // From the season track: a quick confirm, since a click there is easy
  // to make by accident and a skip can't be undone.
  confirmSkip(target) {
    const t = this.SKIP_TARGETS.find(x => x.key === target);
    if (!t || !this.canSkipTo(target)) return;
    if (typeof confirm === 'function' && !confirm(`Skip ahead to ${t.label.toLowerCase()}? Every game until then will be simulated.`)) return;
    this.skipTo(target);
  },
  isSimBusy() { return !!(this._simBusy || this._skipping || this._watching); },
  // Whether the season hasn't reached this point yet (what the menus show).
  skipAvailable(target) {
    return !!this.state.teams.length && !this.skipReached(target);
  },
  // ...and whether a skip can start right now.
  canSkipTo(target) {
    return this.skipAvailable(target) && !this.isSimBusy();
  },
  async skipTo(target) {
    const t = this.SKIP_TARGETS.find(x => x.key === target);
    if (!t || !this.canSkipTo(target)) return;
    const hadFlag = typeof window !== 'undefined' ? window.__BTR_NO_CUTSCENES : false;
    this._skipping = true;
    if (typeof window !== 'undefined') window.__BTR_NO_CUTSCENES = true;
    this.showSimSpinner(`Skipping to ${t.label.toLowerCase()}…`);
    await new Promise(r => setTimeout(r, 30));
    let guard = 0;
    try {
      while (!this.skipReached(target) && guard++ < 80) {
        await this.simulateWeek();
        const el = document.getElementById('simSpinnerLabel');
        if (el) el.textContent = `Skipping to ${t.label.toLowerCase()}… ${this.phaseLabelShort()}`;
        await new Promise(r => setTimeout(r, 0));
      }
    } catch (e) {
      console.error('Skipping ahead:', e);
    } finally {
      this._skipping = false;
      if (typeof window !== 'undefined') window.__BTR_NO_CUTSCENES = hadFlag;
      this._spotQueue = [];
      if (this._skipDirty) {
        this._skipDirty = false;
        const el = document.getElementById('simSpinnerLabel');
        if (el) el.textContent = 'Saving…';
        await this.saveStateToDB();
        await this.saveHsState();
      }
      await this.hideSimSpinner();
    }
    this.syncUI();
    this.toast(`Skipped to ${t.label.toLowerCase()}`, `${this.seasonLabelFor(this.state.year)} · ${this.phaseLabelShort()}`);
    if (target === 'off' && this.state.ncaaDone) this.openOffseason();
  },
  closeAppMenu() {
    const menu = document.getElementById('appMenu');
    const btn = document.getElementById('appMenuBtn');
    if (menu) menu.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  },
  renderSkipMenu() {
    if (typeof document === 'undefined') return;
    const items = this.SKIP_TARGETS.map(t => {
      const ok = this.skipAvailable(t.key);
      return `<button role="menuitem" ${ok ? '' : 'disabled'} onclick="SimEngine.closeAppMenu(); SimEngine.closeSkipPop(); SimEngine.skipTo('${t.key}')">${t.label}</button>`;
    }).join('');
    const menu = document.getElementById('skipMenu');
    if (menu) menu.innerHTML = items;
    const pop = document.getElementById('skipPop');
    if (pop) pop.innerHTML = `<span class="skip-pop-label">Skip ahead to</span>${items}`;
    const wrap = document.getElementById('skipWrap');
    if (wrap) wrap.style.display = this.SKIP_TARGETS.some(t => this.skipAvailable(t.key)) ? '' : 'none';
  },
  toggleSkipPop(ev) {
    if (ev) ev.stopPropagation();
    const pop = document.getElementById('skipPop');
    const btn = document.getElementById('skipBtn');
    if (!pop) return;
    const open = !pop.classList.contains('open');
    this.renderSkipMenu();
    pop.classList.toggle('open', open);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open && !this._skipPopWired) {
      this._skipPopWired = true;
      document.addEventListener('click', e => { if (!e.target.closest || !e.target.closest('.skip-wrap')) this.closeSkipPop(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeSkipPop(); });
    }
  },
  closeSkipPop() {
    const pop = document.getElementById('skipPop');
    const btn = document.getElementById('skipBtn');
    if (pop) pop.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  },
  // Season-track steps ahead of where the season is are skip targets too.
  trackSkipTarget(stepKey) {
    const map = { conf: 'conf', confT: 'confT', ncaa: 'ncaa', off: 'off' };
    const t = map[stepKey];
    return t && this.skipAvailable(t) ? t : null;
  },

  // The header's main button: simulate, or once the season is over,
  // open the offseason (whose own Continue button moves it along).
  async simButtonAction() {
    if (this.state.ncaaDone) { this.openOffseason(); return; }
    await this.simulateWeek();
  },

  async runOffseasonStage(key) {
    switch (key) {
      case 'summary':
        this.archiveCompletedSeason();
        this.snapshotDeclarations();
        this.ensureDraftCycle();
        break;
      case 'draft':
        // Draft night already happened in the Draft RP; keep the final
        // declared class (after withdrawals) for the record.
        this.snapshotDeclarations();
        break;
      case 'portal':
        this.runTransferPortal();
        break;
      case 'summer':
        this.runSummerCircuit();
        break;
      case 'rosters':
        break;
    }
  },

  // ---------- The draft cycle (run by the Draft RP) ----------

  // Created when the class declares, at the end of the NCAA Tournament.
  ensureDraftCycle() {
    const year = this.upcomingDraftYear();
    if (!this.state.draftCycle || this.state.draftCycle.year !== year) {
      this.state.draftCycle = { year, stage: 'declared', rev: 1, updatedAt: Date.now() };
    }
    return this.state.draftCycle;
  },

  isDraftComplete() {
    const year = this.upcomingDraftYear();
    const c = this.state.draftCycle;
    if (c && c.year === year && c.stage === 'complete') return true;
    // Saves from before the draft moved to the Draft RP.
    return !c && (this.state.draftHistory || []).some(d => d.year === year);
  },

  // The Draft RP writes to the same save. Before the NCAA RP writes (or
  // when it regains focus), anything newer there is brought in so neither
  // page overwrites the other's work.
  async syncDraftFromDB() {
    if (typeof db === 'undefined' || !db.leagueState) return false;
    let saved;
    try { saved = await db.leagueState.get(1); } catch (e) { return false; }
    if (!saved || !saved.draftCycle || saved.currentYear !== this.state.year) return false;
    // Only this season's cycle, and only when the save is ahead of us.
    if (saved.draftCycle.year !== this.upcomingDraftYear()) return false;
    const mine = this.state.draftCycle;
    if (mine && mine.year === saved.draftCycle.year && (saved.draftCycle.rev || 0) <= (mine.rev || 0)) return false;

    ['draftCycle', 'draftDeclarations', 'returningPlayers', 'combineResults', 'draftResults',
     'draftLottery', 'draftHistory', 'nbaLeagues', 'lastDeclarations', 'lastDeclarationsYear'].forEach(k => {
      if (saved[k] !== undefined) this.state[k] = saved[k];
    });
    try {
      const fromDb = await db.players.toArray();
      const byId = {};
      fromDb.concat(saved.proPlayers || []).forEach(p => { byId[p.id] = p; });
      this.draftPool().forEach(p => {
        const d = byId[p.id];
        if (!d) return;
        if (d.predraft) p.predraft = d.predraft;
        if (d.draft) p.draft = d.draft;
      });
    } catch (e) { /* players unreadable — the league record still synced */ }
    return true;
  },

  // ---------- International pros (see hs-season.js) ----------
  //
  // An international recruit who never commits to a college plays
  // professionally. He's draft-eligible from his class year, for four
  // drafts, and teams can take him in any of them.
  refreshProPool() {
    if (!this.hsReady()) return;
    const draftYear = this.upcomingDraftYear();
    const departed = this.state.departedNames || new Set();
    const isD1 = n => this.isD1School(n);
    const have = new Map((this.state.proPlayers || []).map(p => [p.id, p]));
    const out = [];
    (this.state.allRecruits || []).forEach(r => {
      if (r.fromOthers || !r.recClassYear || this.isDepartedRecruit(r)) return;
      // Like a one-and-done freshman: a pro from the class of 2028 is first
      // in the 2029 draft, and he has four drafts to be taken in, provided
      // he's old enough.
      const c = Number(r.recClassYear);
      if (c + 1 > draftYear || c + 4 < draftYear || !HSCore.turnsPro(r, isD1)) return;
      if (typeof DraftCore !== 'undefined' && !DraftCore.ageEligible(r, draftYear)) return;
      const p = have.get(r.id) || { ...r, isRecruit: false, gameLog: [], accolades: [], seasonHistory: [] };
      p.isPro = true;
      p.club = p.club || HSCore.clubFor(r, isD1);
      p.school = p.club;
      p.conference = 'Pro';
      p.school_logo = '../schoollogos/pro.png';
      p.collegeHistory = [p.club];
      p.proYears = draftYear - (c + 1);
      p.breakout = HSCore.proBreakout ? HSCore.proBreakout(r, this.state.year) : 0;
      p.rating = Math.round(HSCore.proTalent(r) + p.breakout);
      p.rsci = HSCore.proPedigreeRank(r) || p.rsci || null;
      p.class = 'Pro';
      // How the draft board ages him: a first-year pro is as young as a
      // college freshman.
      p.draftClass = ['FR', 'SO', 'JR', 'SR'][Math.min(3, p.proYears)];
      out.push(p);
    });
    this.state.proPlayers = out;
  },

  // Each pro's season so far: a seeded pro-league line, played out over
  // the same calendar as the college season.
  updateProSeasons() {
    if (!this.hsReady()) return;
    const p = this.seasonProgress();
    (this.state.proPlayers || []).forEach(pl => {
      pl.stats = { ...this.getZeroStats(), ...HSCore.proStats(HSCore.proLine(pl, this.state.year, pl.proYears || 0), p) };
    });
  },

  // Everyone the draft can see: college players and eligible pros.
  draftPool() {
    return this.state.activePlayers.concat(this.state.proPlayers || []);
  },

  // The context the shared DraftCycle logic runs against.
  draftContext(rng) {
    const draftYear = this.upcomingDraftYear();
    const byId = {};
    this.draftPool().forEach(p => { byId[p.id] = p; });
    const winPct = school => {
      const t = this.state.teams.find(x => x.school === school);
      const h = t && (t.history || []).find(x => x.year === this.state.year);
      const w = h ? h.wins : t && t.simData ? t.simData.wins : 0;
      const l = h ? h.losses : t && t.simData ? t.simData.losses : 0;
      return w + l > 0 ? w / (w + l) : 0.5;
    };
    const board = limit => DraftCore.buildBigBoard(this.draftPool(), winPct, limit, { draftYear });
    return {
      draftYear, byId, rng: rng || Math.random,
      league: this.getNbaLeague(draftYear),
      declarations: this.state.draftDeclarations || [],
      cycle: this.ensureDraftCycle(),
      scriptedFor: p => this.scriptedDraftFor(p),
      fullBoard: limit => board(limit),
      fullBoardRank: () => { const r = {}; board(400).forEach((e, i) => { r[e.player.id] = i + 1; }); return r; },
      board: () => {
        const ids = new Set((this.state.draftDeclarations || []).map(d => d.id));
        return board(600).filter(e => ids.has(e.player.id));
      }
    };
  },

  // Applies one DraftCycle step's result to the in-memory state.
  applyDraftStep(res) {
    if (!res) return;
    const byId = {};
    this.draftPool().forEach(p => { byId[p.id] = p; });
    Object.entries(res.players || {}).forEach(([id, pd]) => { if (byId[id]) byId[id].predraft = pd; });
    Object.entries(res.draftFor || {}).forEach(([id, d]) => { if (byId[id]) byId[id].draft = d; });
    Object.assign(this.state, res.state || {});
    if (res.draftEntry) {
      this.state.draftHistory = (this.state.draftHistory || []).filter(d => d.year !== res.draftEntry.year).concat([res.draftEntry]);
    }
    this.state.draftCycle = res.cycle;
  },

  // Runs the whole cycle without the Draft RP — used by the automated
  // checks, which have no second page to hand off to.
  runDraftCycleHere() {
    let guard = 0;
    while (!this.isDraftComplete() && guard++ < 10) {
      if (typeof DraftCycle === 'undefined') break;
      this.applyDraftStep(DraftCycle.advance(this.draftContext()));
    }
  },

  // Legacy entry points some tools still call.
  resolveDraftWithdrawals() {
    const res = DraftCycle.resolveDeadline(this.draftContext());
    this.state.draftDeclarations = res.staying;
    this.state.returningPlayers = res.returning;
    return res.returning;
  },
  computeDraftResults() {
    this.runDraftCycleHere();
    return this.state.draftResults || [];
  },

  // Captures the declaring class with complete stat lines. Declared
  // players are about to leave every roster, which also removes them from
  // the saved players table, so the full record has to be taken while they
  // still exist. Game logs are excluded to keep the save small.
  snapshotDeclarations() {
    this.state.lastDeclarations = (this.state.draftDeclarations || []).map(d => {
      const full = this.draftPool().find(p => p.id === d.id);
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

  // Progresses every returning player's rating. Newly-signed freshmen are
  // skipped — they haven't played a college season yet.
  runPlayerDevelopment() {
    if (typeof DevelopmentCore === 'undefined') return;
    const returning = this.state.activePlayers.filter(p => (p.stats && p.stats.gp) > 0);
    const changes = DevelopmentCore.developRoster(returning);
    this.state.lastDevelopment = changes.slice(0, 25).concat(changes.slice(-15));
    if (changes.length) {
      const up = changes.filter(c => c.delta > 0).length;
      console.log(`Development: ${changes.length} players changed rating (${up} improved).`);
    }
  },

  // The transfer portal: scripted moves from the roster sheet first, then
  // the simulated portal. Runs as its own offseason step (after draft
  // night, so no declared player can transfer).
  runTransferPortal() {
    if (this.state.portalYear === this.state.year) return;
    this.state.portalYear = this.state.year;

    // Scripted transfers first: if the roster sheet lists a player at a
    // different school next season, that move is authored, not random.
    const scripted = this.applyScriptedTransfers();

    // The coaching carousel: jobs change hands, and a few players follow
    // the coach who recruited them.
    const followers = this.runCoachingCarousel().filter(f => !scripted.some(t => t.id === f.player.id));
    this.applyTransfers(followers);

    // Then the random portal, which skips anyone already moved.
    const transfers = followers.concat(this.computeTransfers(new Set(scripted.map(t => t.id).concat(followers.map(f => f.player.id)))));
    this.state.lastTransfers = scripted.concat(transfers.map(t => ({
      id: t.player.id, name: t.player.name, pos: t.player.pos, class: t.player.class,
      rating: parseFloat(t.player.rating) || 0,
      ppg: t.player.stats ? t.player.stats.ppg : '0.0',
      from: t.from, to: t.to, reason: t.reason
    })));
    this.applyTransfers(transfers.slice(followers.length));   // followers already moved

    // Every move is kept (the recruiting page's Transfer Portal reads the
    // full history), labelled with the season the player transfers into.
    const intoSeason = `${this.state.year + 1}-${String(this.state.year + 2).slice(2)}`;
    this.state.transferHistory = (this.state.transferHistory || []).concat(
      this.state.lastTransfers.map(t => ({ ...t, season: intoSeason, scheduled: t.reason === 'Scheduled transfer' })));
    if (this.state.transferHistory.length > 4000) this.state.transferHistory = this.state.transferHistory.slice(-4000);
  },

  async completeOffseason() {
    this.state.offseasonStageIndex = 0;
    this.runTransferPortal();

    const declaredIds = new Set((this.state.draftDeclarations || []).map(d => d.id));
    // Drafted pros are gone to the NBA; the rest keep playing overseas.
    const draftedYear = this.upcomingDraftYear();
    (this.state.proPlayers || []).forEach(p => { if (p.draft && p.draft.year === draftedYear) { this.archiveDeparted(p, 'draft'); this.markDeparted(p); } });
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
        if (declaredIds.has(p.id)) { this.archiveDeparted(p, p.draft ? 'draft' : 'undrafted'); this.markDeparted(p); return false; }
        const nextClass = classProgression[p.class];
        // Listed on next season's tab: back for another year, even as a
        // senior (a fifth year or a redshirt), in the class the tab gives.
        const listed = this.listedNextSeason(p);
        if (listed) {
          p.class = this.normalizeClassStanding(listed.class || listed.yr) || nextClass || 'GR';
          return true;
        }
        if (nextClass) { p.class = nextClass; return true; }
        this.archiveDeparted(p);                                             // eligibility exhausted
        this.markDeparted(p);
        return false;
      });

      team.roster.forEach(p => this.developPlayer(p));

      team.simData = { teamOvr: 0, wins: 0, losses: 0, confWins: 0, confLosses: 0, rosterRef: team.roster, winPct: '.000' };
      team.apRank = null;
      team.ncaaSeed = null;
      team.wonConfTourney = false;
      team.wonNationalTitle = false;
    });

    this.state.year += 1;
    this.getNbaLeague(this.upcomingDraftYear());
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
    this.state.ncaaSelection = null;
    this.state.postseasonHonors = null;
    this.state.ncaaRoundsRevealed = 0;
    this.state.draftDeclarations = [];
    this.state.seasonInitialized = false;

    this.refreshRecruitPool();
    this.filterActiveData();
    this.enforceRosterLimits();
    this.refreshPrestige();
    this.backfillRosters();
    this.filterActiveData();

    // Returning players develop before the new season is set up, so the
    // rotation and stat expectations are built from their new ratings.
    this.runPlayerDevelopment();

    // The new season's tab goes on last, so what it sets (roles, traits,
    // OVR) is what the season starts with. Players it adds can push a
    // roster past the limit; generated players are the ones cut.
    const sheet = this.applySeasonSheet();
    if (sheet.updated || sheet.added) {
      this.enforceRosterLimits();
      this.filterActiveData();
    }

    // Next year's class, measured against the room each program will have.
    this.rebalanceRecruitCommits(this.state.year + 1);

    this.initSeasonData();
    this.refreshProPool();
    this.updateProSeasons();
    this.advanceHsCalendar();
    this.closeOffseason();
    this.logNews(`Advanced to ${this.state.year} Offseason. Graduated seniors cleared; incoming recruits added.`);
    
    const sbEl = document.getElementById('statsBody');
    if (sbEl) sbEl.innerHTML = `<tr><td colspan="25" class="empty-table-msg">Simulate games to view leaderboards.</td></tr>`;
    const scEl = document.getElementById('standingsContainer');
    if (scEl) scEl.innerHTML = `<p class="empty-table-msg">Simulate games to view standings.</p>`;
    
    this.syncUI();
    await this.saveStateToDB();
    if (window.UIController && UIController.activateTab) this.activateTabSilently('dashTab');
    this.playSeasonIntro({ fromOffseason: true });
  },

  syncUI() {
    if (this._skipping) return;           // drawn once when the skip ends
    const yrElem = document.getElementById('currentYearDisplay');
    if (yrElem) yrElem.innerText = `${this.state.year}-${(this.state.year + 1).toString().slice(2)}`;

    const phaseElem = document.getElementById('currentPhaseDisplay');
    if (phaseElem) phaseElem.innerText = this.phaseText();
    this.renderSeasonTrack();
    this.renderSkipMenu();

    // Mirror phase/year into the always-visible toolbar.
    const tbPhase = document.getElementById('toolbarPhase');
    const tbYear = document.getElementById('toolbarYear');
    if (tbPhase && phaseElem) tbPhase.innerText = phaseElem.innerText;
    if (tbYear) tbYear.innerText = `${this.state.year}-${(this.state.year + 1).toString().slice(2)}`;

    const btn = document.getElementById('simWeekBtn');
    if (btn) {
      if (this.state.ncaaDone) {
        btn.innerText = 'Open the Offseason';
        btn.disabled = false;
      } else if (this.state.confChampsDone) {
        const played = this.state.ncaaTournament ? this.state.ncaaTournament.rounds.length : 0;
        btn.innerText = `Simulate ${played === 0 ? 'First Four & First Round' : (this.NCAA_ROUND_NAMES[played] || 'Next Round')}`;
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
      ['history',            () => this.updateHistoryTab(), 'historyContainer'],
      ['records',            () => this.updateRecordsTab(), 'recordsContainer']
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
    const qualifies = p => !this.state.statsQualifiedOnly ||
        (parseFloat(p.stats.mpg) >= minMpg && (p.stats.totMin || 0) >= minMinutes);
    // A search looks through every player (qualified or not) by name,
    // school, position or hometown; each keeps his place on the board.
    const query = String(this._statsQuery || '').trim().toLowerCase();
    const hits = p => !query || [p.name, p.school, p.pos, p.hometown, p.conference].some(v => String(v || '').toLowerCase().includes(query));
    let pool = this.state.activePlayers.filter(p =>
      this.matchesConfFilter(p.conference, this.state.confFilter) &&
      this.matchesPosFilter(p.pos, this.state.statsPosFilter) &&
      (query ? hits(p) : qualifies(p)));

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
    // Board position of each player under the current sort and filters.
    const boardRank = new Map();
    if (query) {
      pool.filter(qualifies).forEach((p, i) => boardRank.set(p, i + 1));
      // Rank against the whole board, not just the matches.
      const board = this.state.activePlayers.filter(p => this.matchesConfFilter(p.conference, this.state.confFilter) &&
        this.matchesPosFilter(p.pos, this.state.statsPosFilter) && qualifies(p));
      const cmp = (a, b) => {
        let valA = a.stats ? a.stats[col] : 0, valB = b.stats ? b.stats[col] : 0;
        if (['name', 'school', 'pos', 'class'].includes(col)) return String(a[col] || '').localeCompare(String(b[col] || '')) * dir;
        if (typeof valA === 'string') valA = parseFloat(valA.replace('%', '')) || 0;
        if (typeof valB === 'string') valB = parseFloat(valB.replace('%', '')) || 0;
        return (valA - valB) * dir;
      };
      board.sort(cmp).forEach((p, i) => boardRank.set(p, i + 1));
    }
    if (pool.length === 0) {
      tbodyHtml = `<tr><td colspan="25" class="empty-table-msg">${query ? `No player matches “${this.esc(this._statsQuery.trim())}”.` : `No players found for conference: ${this.state.confFilter}`}</td></tr>`;
    } else {
      // Show a readable slice rather than every player in the country. The
      // rank column reflects the current sort, so flipping to ascending
      // renumbers from the bottom of the league up.
      const limit = query ? 200 : (this.state.statsLimit || 25);
      const shown = pool.slice(0, limit);
      shown.forEach((p, idx) => {
        tbodyHtml += `<tr>`;
        tbodyHtml += `<td class="rank-cell">${query ? (boardRank.get(p) || '–') : idx + 1}</td>`;
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
      if (query || pool.length <= 25) {
        moreBtn.style.display = 'none';
      } else {
        moreBtn.style.display = 'inline-flex';
        moreBtn.innerText = limit === 25
          ? `Show Top 100`
          : `Show Top 25`;
      }
    }
  },

  setStatsSearch(q) {
    this._statsQuery = String(q || '');
    this.sortAndRenderStatsTable();
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


  // Jumps straight to a team's page under the Team tab.
  goToTeamPage(school) {
    if (!this.findTeam(school)) return;   // an all-star team, say: no team page
    this.closePlayerPage();
    this._countedTeam = null;
    this.state.teamPageSelection = school;
    this.state.teamPageView = 'team';
    this.updateTeamTab();
    this.activateTabSilently('teamTab');
    this.pushNav({ type: 'team', key: school, view: 'team', label: school });
  },

  // A team as it was in a past season (the current season is its team page).
  goToTeamSeason(school, year) {
    year = Number(year);
    if (!this.findTeam(school)) return;
    if (!year || year === this.state.year) { this.goToTeamPage(school); return; }
    this.closePlayerPage();
    this.state.teamPageSelection = school;
    this.state.teamPageView = 'season';
    this.state.teamPageSeason = year;
    this.updateTeamTab();
    this.activateTabSilently('teamTab');
    this.pushNav({ type: 'team', key: school, view: 'season', year, label: `${school} ${year}-${String(year + 1).slice(2)}` });
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') { try { window.scrollTo(0, 0); } catch (e) { /* not in every host */ } }
  },

  // From a player's season row: that season's team.
  goToTeamSeasonFromPlayer(school, year) {
    if (!this.findTeam(school)) return;
    this.goToTeamSeason(school, year);
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
          <span class="perf-meta"><span class="clickable-school" onclick="SimEngine.goToTeamPage('${safeSchool}')">${player.school}</span> ${game.isHome ? 'vs' : '@'} ${game.opponent} · <span class="game-link-inline" onclick="${(() => { const r = this.gameRefFromLog(player.school, game); return this.openGameJs(r.home, r.away, r.week, r.phase); })()}" title="Box score and play-by-play">${game.won ? 'W' : 'L'} ${game.teamScore}-${game.oppScore}</span></span>
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
        <td><div class="team-cell-wrap clickable-school" onclick="SimEngine.goToTeamPage('${safeSchool}')">
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
                <tr><th>#</th><th>Team</th><th>Conf</th><th>Overall</th></tr>
              </thead>
              <tbody>`;

      confTeams.forEach((t, idx) => {
        const isApRanked = t.apRank !== null && t.apRank <= 25;
        const hiddenClass = idx >= 5 ? `conf-row-${confSafeId}` : '';
        const rankClass = isApRanked ? 'ap-ranked-row' : '';
        const rowClasses = [hiddenClass, rankClass].filter(Boolean).join(' ');
        const rowStyle = idx >= 5 ? 'style="display:none;"' : '';
        const apTag = isApRanked ? `<span class="ap-rank-tag">No. ${t.apRank}</span>` : '';

        confsHtml += `
          <tr class="${rowClasses}" ${rowStyle}>
            <td class="bold-sub-text">${idx+1}</td>
            <td>
              <div class="team-cell-wrap clickable-school" onclick="SimEngine.openTeamModal('${t.school.replace(/'/g, "\\'")}')">
                <img src="${this.getTeamLogo(t.school)}" class="sm-logo" alt="">
                <span class="conf-team-name"><span class="team-name-cell" title="${this.esc(t.school)}">${this.esc(t.school)}</span>${apTag}</span>
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

  // Tournament honors: the Final Four's Most Outstanding Player, the
  // All-Final Four team, each region's MOP and every conference
  // tournament's MOP.
  renderPostseasonHonors() {
    const el = document.getElementById('postseasonHonors');
    if (!el) return;
    const h = this.state.postseasonHonors;
    if (!h || h.year !== this.state.year || (!h.finalFour && !Object.keys(h.conf || {}).length)) { el.innerHTML = ''; return; }
    const who = e => `<span class="clickable-player" onclick="SimEngine.openPlayerModal('${this.jsArg(e.id)}')">${this.esc(e.name)}</span>`;
    const card = (title, e, sub) => `<div class="award-card award-card-horizontal honor-card">
        <div class="award-heading"><h4 class="award-title">${title}</h4>${sub ? `<p class="award-sub">${sub}</p>` : ''}</div>
        <div class="award-winner"><img src="${this.getTeamLogo(e.school)}" class="award-logo" alt="">
          <div class="award-winner-info"><span class="award-winner-name">${who(e)}</span>
          <span class="award-winner-school">${this.esc(e.school)} (${e.pos}${e.class ? ' &bull; ' + e.class : ''})</span>
          <span class="award-winner-stats">${this.esc(e.line)}</span></div></div></div>`;
    let html = `<h3 class="award-section-title">Postseason Honors</h3>`;
    if (h.finalFour) {
      html += `<div class="awards-grid honors-grid">${card('Final Four Most Outstanding Player', h.finalFour.mop, `${h.year + 1} Final Four`)}
        <div class="award-card honor-card"><div class="award-heading"><h4 class="award-title">All-Final Four Team</h4></div>
          <ul class="honor-list">${h.finalFour.team.map(e => `<li><img src="${this.getTeamLogo(e.school)}" class="xs-logo" alt="">${who(e)}<small>${this.esc(e.school)}</small><span>${e.pts} pts</span></li>`).join('')}</ul></div>
        ${Object.values(h.regions || {}).map(e => card(`${e.region} Region MOP`, e, '')).join('')}</div>`;
    }
    const confs = Object.entries(h.conf || {}).sort((a, b) => (this.isHighMajor(a[0]) ? 0 : 1) - (this.isHighMajor(b[0]) ? 0 : 1) || a[0].localeCompare(b[0]));
    if (confs.length) {
      html += `<h4 class="award-section-title">Conference Tournament MOPs</h4>
        <div class="mop-grid">${confs.map(([c, e]) => `<div class="mop-card" onclick="SimEngine.openPlayerModal('${this.jsArg(e.id)}')">
          <div class="mop-conf">${this.getConferenceLogoImg(c, 'conf-logo-sm')}<span>${this.esc(c)}</span></div>
          <div class="mop-body"><img src="${this.getTeamLogo(e.school)}" class="mop-logo" alt="">
            <div class="mop-info"><b>${this.esc(e.name)}</b><small>${e.pos} &middot; ${this.esc(e.school)}</small><span>${this.esc(e.line)}</span></div></div>
        </div>`).join('')}</div>`;
    }
    el.innerHTML = html;
  },

  updateAwardsTab() {
    this.renderPostseasonHonors();
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

      <div class="all-american-container conf-teams-2x2">
        ${this.renderConfTeamTable("1st Team All-" + confName, conf1st)}
        ${this.renderConfTeamTable("2nd Team All-" + confName, conf2nd)}
        ${this.renderConfTeamTable("All-Freshman Team", confFreshTeam)}
        <!--ALLDEF-->
      </div>
    `;

    // All-Defensive team, picked on defensive impact rather than scoring.
    const defPool = [...confPlayers]
      .filter(p => parseFloat(p.stats.mpg) >= 12)
      .sort((x, y) => y.defensiveScore - x.defensiveScore)
      .slice(0, 5);

    if (defPool.length) {
      html = html.replace('<!--ALLDEF-->', `<div class="award-table-card">
        <h5 class="award-table-title">${confName} All-Defensive Team</h5>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>SPG</th><th>BPG</th><th>DBPM</th></tr></thead>
          <tbody>${defPool.map((p, i) => `<tr>
            <td class="bold-sub-text">${i + 1}</td>
            <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(p.school)}" class="xs-logo"><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeI(p)}')">${p.name}</span></div></td>
            <td>${p.school}</td>
            <td class="sub-text">${p.pos}</td>
            <td class="bold-text">${p.stats.stl}</td>
            <td class="bold-text">${p.stats.blk}</td>
            <td>${p.stats.dbpm}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`);
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
    const pool = this.state.activePlayers.concat(this.state.recruits || [], this.state.proPlayers || [], this.state.departedArchive || [], this.state.allRecruits || []);
    return pool.find(p => p.id === idOrName) || pool.find(p => p.name === idOrName);
  },

  renderPlayerInPlace(idOrName) {
    const player = this.findPlayerRef(idOrName);
    if (!player) return;

    const overlay = document.getElementById('playerPage');
    const body = document.getElementById('playerPageBody');
    if (!overlay || !body) return;

    body.innerHTML = this.isUpcomingRecruit(player) ? this.renderRecruitCard(player) : this.renderPlayerPage(player);
    overlay.style.display = 'block';
    if (typeof Cutscene !== 'undefined' && !this.reducedMotion()) Cutscene.countUp(body);
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
         ['fgPct','FG%'],['twoPm','2P'],['twoPa','2PA'],['twoPPct','2P%'],['threePm','3PM'],['threePa','3PA'],['threePPct','3P%'],['ftm','FTM'],['fta','FTA'],['ftPct','FT%']];

    const head = `<tr><th>Season</th><th>School</th><th>Class</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>`;
    const body = rowsData.map(r => {
      const st = r.stats || {};
      const safeSchool = String(r.school || '').replace(/'/g, "\\'");
      return `<tr>
        <td class="bold-text">${r.year}-${(r.year + 1).toString().slice(2)}</td>
        <td><span class="clickable-school" onclick="SimEngine.goToTeamSeasonFromPlayer('${safeSchool}', ${Number(r.year) || 0})" title="${this.esc(r.school || '')} in ${r.year}-${(r.year + 1).toString().slice(2)}">${r.school || '—'}</span></td>
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
    if (!player.departed && st.gp > 0 && !seasons.some(h => h.year === this.state.year)) {
      seasons.push({ year: this.state.year, school: player.school, class: player.class, stats: st });
    }
    seasons.sort((a, b) => a.year - b.year);

    const careerBlock = seasons.length === 0
      ? `<p class="sub-text">No games played yet this season.</p>`
      : `<h3 class="uppercase-title">Box Score</h3>${this.playerStatTable(seasons, 'box')}
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
        const ref = player.school ? this.gameRefFromLog(player.school, g) : null;
        const open = ref ? ` class="game-row" onclick="${this.openGameJs(ref.home, ref.away, ref.week, ref.phase)}" title="Box score and play-by-play"` : '';
        if (!(g.min > 0)) {
          glRows += `<tr class="dnp-row"><td class="sub-text-sm">${matchup}</td><td class="sub-text-sm">${result}</td>
            <td colspan="11" class="sub-text-sm">Did not play</td></tr>`;
          return;
        }
        glRows += `<tr${open}>
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

    // Where he stands with NBA teams, linking into the Draft RP.
    let draftCard = '';
    if (player.draft) {
      const tm = player.draft.team ? (player.draft.team.name || player.draft.team) : '';
      draftCard = `<a class="pp-draft card" href="./draft.html?player=${encodeURIComponent(player.id)}">
        <span class="draft-gate-kicker">${player.draft.year} NBA Draft</span>
        <b>Pick ${player.draft.pick}${tm ? ' · ' + this.esc(tm) : ''}</b>
        <span class="pp-draft-go">Draft RP &nearr;</span></a>`;
    } else if (this.state.teams.length && this.state.activePlayers.includes(player)) {
      const rank = this.boardRankOf(player.id);
      if (rank) draftCard = `<a class="pp-draft card" href="./draft.html?player=${encodeURIComponent(player.id)}">
        <span class="draft-gate-kicker">${this.upcomingDraftYear()} big board</span>
        <b>No. ${rank} prospect</b>
        <span class="pp-draft-go">Scouting report on the Draft RP &nearr;</span></a>`;
    }
    const chip = (label, value) => value ? `<span class="pp-chip"><small>${label}</small>${value}</span>` : '';
    const tile = (label, value) => st.gp ? `<div class="pp-tile"><span>${label}</span><b data-count="${String(value).startsWith('.') ? '' : value}">${value}</b></div>`
      : `<div class="pp-tile"><span>${label}</span><b class="pp-tile-empty">&ndash;</b></div>`;

    return `
      <div class="pp-top"><button class="nav-back-btn" onclick="SimEngine.closePlayerPage()">&larr; Back</button></div>
      <div class="pp-hero">
        <img src="${this.getTeamLogo(player.school)}" class="team-hero-mark" alt="" aria-hidden="true">
        <img src="${this.getTeamLogo(player.school)}" class="player-page-logo" alt="">
        <div class="player-page-ident">
          <div class="pp-kicker">${posNames[player.pos] || player.pos} &middot; ${classNames[player.class] || player.class || ''} &middot; ${collegeLinks}</div>
          <h1 class="player-page-name">${player.jersey ? '<span class="pp-num">#' + player.jersey + '</span> ' : ''}${player.name}</h1>
          <div class="pp-chips">
            ${chip('Height', player.ht)}
            ${chip('Weight', player.wt ? player.wt + ' lb' : '')}
            ${chip('Hometown', player.hometown && player.hometown !== 'N/A' ? player.hometown : '')}
            ${chip('High school', player.hs)}
            ${chip('RSCI', player.rsci ? '#' + Math.round(player.rsci) + (player.recClassYear ? ' (' + player.recClassYear + ')' : '') : 'Unranked')}
          </div>
        </div>
        <button class="outline-btn btn-sm pp-team-btn" onclick="SimEngine.goToTeamFromPlayer('${this.jsArg(player.school || '')}')">Team page</button>
      </div>

      ${(preseason.length || postseason.length) ? `<div class="player-accolade-block">
        ${preseason.length ? `<div><span class="accolade-tag preseason">Preseason</span> ${preseason.join(' • ')}</div>` : ''}
        ${postseason.length ? `<div><span class="accolade-tag postseason">Honors</span> ${postseason.join(' • ')}</div>` : ''}
      </div>` : ''}

      ${player.departed ? `<div class="card pp-left"><b>${player.leftFor === 'draft' && player.draft ? `Left for the ${player.draft.year} NBA Draft` : player.leftFor === 'undrafted' ? 'Declared for the draft and went undrafted' : 'Graduated'}</b>
        <span>after the ${this.seasonLabelFor(player.leftAfter)} season${player.isPro && player.club ? ` · played professionally for ${this.esc(player.club)}` : ''}. The numbers are from his final season.</span></div>` : ''}

      <div class="pp-row">
        <div class="pp-tiles">
          ${tile('PPG', st.ppg)}${tile('RPG', st.rpg)}${tile('APG', st.apg)}${tile('FG%', st.fgPct)}${tile('3P%', st.threePPct || '—')}
        </div>
        ${draftCard}
      </div>

      ${(player.bigGames || []).length ? `<div class="card pp-section pp-big">
        <div class="section-head"><div><h3 class="uppercase-title">Big games</h3><p class="section-sub">Ranked opponents and the postseason — what scouts watched most closely</p></div>
          <span class="big-games-net ${(player.bigGameStock || 0) >= 0 ? 'up' : 'down'}">${(player.bigGameStock || 0) >= 0 ? '&#9650;' : '&#9660;'} ${Math.abs(player.bigGameStock || 0).toFixed(1)} draft stock</span></div>
        <ul class="big-games-list">${player.bigGames.slice().reverse().map(g => `<li class="${g.delta >= 0 ? 'up' : 'down'}"><span class="bg-arrow">${g.delta >= 0 ? '&#9650;' : '&#9660;'}</span><b>${this.esc(g.label)}</b><span>${this.esc(g.line)}${g.won ? ' · W' : ' · L'}</span></li>`).join('')}</ul>
      </div>` : ''}

      <div class="card pp-section">${careerBlock}</div>

      <div class="card pp-section">
        <h3 class="uppercase-title">Game Log <span class="sub-text-sm">(${this.state.year}-${(this.state.year + 1).toString().slice(2)})</span></h3>
        <div class="table-scroll"><table class="data-table">
          <thead><tr>
            <th>Opponent</th><th>Result</th><th>MIN</th><th class="highlight-col">PTS</th>
            <th>OREB</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th>
            <th>FGM-A</th><th>3PM-A</th><th>FTM-A</th>
          </tr></thead>
          <tbody>${glRows}</tbody>
        </table></div>
      </div>`;
  },

  // A player's place on the current big board (top 60), cached per week.
  boardRankOf(id) {
    const s = this.state;
    const key = `${s.year}|${s.week}|${s.phase}`;
    if (!this._boardRanks || this._boardRanks.key !== key) {
      const ranks = {};
      try { this.computeDraftBigBoard(60).forEach((e, i) => { ranks[e.player.id] = i + 1; }); } catch (e) { /* board unavailable */ }
      this._boardRanks = { key, ranks };
    }
    return this._boardRanks.ranks[id] || null;
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

    // Next week's slate is visible too, so its games can be watched live.
    const upcoming = !this.state.regularSeasonDone && this.state.teams.length ? (this.state.week || 0) + 1 : null;
    const maxViewableWeek = Math.max(1, upcoming && upcoming <= (this.state.confEnd || 99) ? upcoming : (this.state.week || 1));
    if (!this.state.scheduleViewWeek || this.state.scheduleViewWeek > maxViewableWeek) {
      this.state.scheduleViewWeek = maxViewableWeek;
    }
    const viewWeek = this.state.scheduleViewWeek;

    const confList = [...new Set(this.state.teams.map(t => (t.conference || 'NCAA').trim()))].filter(Boolean).sort();

    let filtersHtml = `<div class="filters-container mb-1">`;
    filtersHtml += `<select id="scheduleWeekSelect" class="filter-select" onchange="SimEngine.setScheduleWeek(this.value)">`;
    for (let w = 1; w <= maxViewableWeek; w++) {
      const label = (w > this.state.nonConfEnd ? `Conf Wk ${w}` : `Non-Conf Wk ${w}`) + (w === upcoming ? ' · Up next' : '');
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
        const hr = this.pollRankOf(homeTeam), ar = this.pollRankOf(awayTeam);
        const homeRankTag = hr ? `<span class="ap-rank-tag">#${hr}</span> ` : '';
        const awayRankTag = ar ? `<span class="ap-rank-tag">#${ar}</span> ` : '';
        const phase = g.isConf ? 'conf' : 'nonconf';

        const played = g.played && g.result;
        const homeWin = played && g.result.homeScore > g.result.awayScore;
        const side = (school, safe, rankTag, score, won) => `<div class="sb-row ${played ? (won ? 'win' : 'loss') : ''}">
            <img src="${this.getTeamLogo(school)}" class="sb-logo" alt="">
            <span class="sb-name">${rankTag}<span class="clickable-school" onclick="SimEngine.openTeamModal('${safe}')">${school}</span></span>
            ${played ? `<b class="sb-score">${score}</b>` : ''}
          </div>`;
        let foot = `<span class="sb-status">${g.isConf ? 'Conference' : 'Non-conference'}</span>`;
        if (played) {
          foot = `<span class="sb-status">Final</span><button type="button" class="sb-link game-link" onclick="${this.openGameJs(g.home, g.away, g.week, phase)}" title="Box score and play-by-play">Box score &rsaquo;</button>`;
        } else if (g.week === upcoming) {
          const ref = { home: g.home, away: g.away, week: g.week, phase };
          foot = `<span class="sb-status">${this.tipLabel(ref)}</span><span class="sb-watch">${this.watchListBtn(g.home, g.away, g.week, phase)}<button type="button" class="watch-btn" onclick="${this.watchGameJs(g.home, g.away, g.week, phase)}">&#9654; Watch live</button></span>`;
        } else {
          foot = `<span class="sb-status">${g.isConf ? 'Conference' : 'Non-conference'} · ${this.tipLabel({ home: g.home, away: g.away, week: g.week, phase })}</span>`;
        }
        gamesHtml += `
          <div class="schedule-pill sb-card${played ? ' final' : ''}">
            ${side(g.away, awaySafe, awayRankTag, played ? g.result.awayScore : '', played && !homeWin)}
            ${side(g.home, homeSafe, homeRankTag, played ? g.result.homeScore : '', homeWin)}
            <div class="sb-foot">${foot}</div>
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


  // ============================================================
  // NCAA selection, bracketology and the tournament bracket
  //
  // One selection routine serves the whole year. During the season it
  // runs on projected automatic bids (each conference's current leader)
  // to produce live bracketology; after the conference tournaments it
  // runs on the real champions and becomes the actual bracket, which is
  // what the NCAA Tournament is played from — so the bracket you see on
  // Selection Sunday is exactly the bracket that gets played.
  // ============================================================

  REGIONS: ['East', 'South', 'West', 'Midwest'],

  // Seed-order pairings within a region: 1v16, 8v9, 5v12, 4v13, 6v11,
  // 3v14, 7v10, 2v15 — the standard first-round arrangement.
  REGION_PAIR_ORDER: [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]],

  NCAA_ROUND_NAMES: ['First Round', 'Second Round', 'Sweet 16', 'Elite Eight', 'Final Four', 'National Championship'],

  // A team's résumé for selection and seeding: how much it has won, how
  // strong it is, and the quality of the league it won in.
  resumeScore(t) {
    const sd = t.simData || {};
    const w = sd.wins || 0, l = sd.losses || 0;
    const gp = w + l;
    const winPct = gp ? w / gp : 0.5;
    const league = this.isHighMajor(t.conference) ? 4 : 0;
    const sos = t.sosRank ? (180 - Math.min(360, t.sosRank)) / 60 : 0;
    return (w - l) * 0.9 + winPct * 10 + ((sd.teamOvr || 70) - 72) * 0.9 + league + sos;
  },

  // Conference tournament champions once they're decided; until then,
  // each conference's current leader stands in as its projected bid.
  autoBidTeams(projected) {
    if (!projected && Object.keys(this.state.confTournaments || {}).length) {
      return Object.values(this.state.confTournaments)
        .map(b => this.state.teams.find(t => t.school === (b.champion && b.champion.school)))
        .filter(Boolean);
    }
    const byConf = {};
    this.state.teams.forEach(t => { (byConf[t.conference || 'Independent'] = byConf[t.conference || 'Independent'] || []).push(t); });
    return Object.values(byConf).filter(list => list.length >= 2).map(list => [...list].sort((a, b) =>
      (b.simData.confWins - b.simData.confLosses) - (a.simData.confWins - a.simData.confLosses)
      || b.simData.wins - a.simData.wins
      || this.resumeScore(b) - this.resumeScore(a))[0]);
  },

  // Picks and seeds the field. Returns plain data (school names), so it
  // can be saved with the league and redrawn at any time.
  buildSelection(projected = false) {
    const autoTeams = this.autoBidTeams(projected);
    const auto = new Set(autoTeams.map(t => t.school));
    const byResume = (a, b) => this.resumeScore(b) - this.resumeScore(a);
    const pool = this.state.teams.filter(t => !auto.has(t.school)).sort(byResume);
    const target = Math.max(autoTeams.length, Math.min(68, Math.round(this.state.teams.length * 0.19)));
    const atLargeCount = Math.max(0, target - autoTeams.length);
    const atLarge = pool.slice(0, atLargeCount);
    const field = [...autoTeams, ...atLarge].sort(byResume);
    const rank = {};
    field.forEach((t, i) => { rank[t.school] = i; });

    // First Four: the last four at-large teams play for two spots, and the
    // four lowest-rated automatic qualifiers play for two more.
    const playInGames = Math.max(0, Math.min(4, field.length - 64));
    const atLargeGames = Math.ceil(playInGames / 2), autoGames = playInGames - atLargeGames;
    const lastIn = atLargeGames ? atLarge.slice(-atLargeGames * 2) : [];
    const lowAuto = autoGames ? autoTeams.slice().sort(byResume).slice(-autoGames * 2) : [];
    const inPlayIn = new Set();
    const firstFour = [];
    const pairUp = (list, kind) => {
      for (let i = 0; i + 1 < list.length && firstFour.length < playInGames; i += 2) {
        const a = list[i], b = list[i + 1];
        inPlayIn.add(a.school); inPlayIn.add(b.school);
        firstFour.push({ id: `ff${firstFour.length + 1}`, kind, teams: [a.school, b.school],
          rank: Math.min(rank[a.school], rank[b.school]) });
      }
    };
    pairUp(lastIn.slice().sort(byResume), 'at-large');
    pairUp(lowAuto, 'automatic');

    // 64 bracket lines: direct entrants plus one line per First Four game,
    // in résumé order, dealt onto seed lines four at a time and snaked
    // across the regions the way the committee does it.
    const lines = field.filter(t => !inPlayIn.has(t.school))
      .map(t => ({ school: t.school, auto: auto.has(t.school), rank: rank[t.school] }))
      .concat(firstFour.map(g => ({ playin: g.id, teams: g.teams, rank: g.rank + 0.5 })))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 64);
    const regions = {};
    this.REGIONS.forEach(r => { regions[r] = []; });
    lines.forEach((line, i) => {
      const seedLine = Math.floor(i / 4);
      const pos = i % 4;
      const regionIdx = seedLine % 2 === 0 ? pos : 3 - pos;
      const region = this.REGIONS[regionIdx];
      const entry = { ...line, seed: seedLine + 1, region };
      delete entry.rank;
      regions[region].push(entry);
      if (entry.playin) firstFour.find(g => g.id === entry.playin).seed = entry.seed;
      if (entry.playin) firstFour.find(g => g.id === entry.playin).region = region;
    });

    const autoBids = {};
    autoTeams.forEach(t => { autoBids[t.conference || 'Independent'] = t.school; });
    const bids = {};
    field.forEach(t => { const c = t.conference || 'Independent'; bids[c] = (bids[c] || 0) + 1; });

    return {
      projected, year: this.state.year, week: this.state.week,
      regions, order: [...this.REGIONS],
      firstFour: firstFour.map(({ rank: _r, ...g }) => g),
      autoBids, bids,
      fieldSize: field.length,
      seedList: field.map(t => t.school),
      lastFourIn: atLarge.slice(-4).map(t => t.school),
      firstFourOut: pool.slice(atLargeCount, atLargeCount + 4).map(t => t.school),
      nextFourOut: pool.slice(atLargeCount + 4, atLargeCount + 8).map(t => t.school)
    };
  },

  // Seeds (1-16) and regions by school for a selection, for drawing.
  selectionSeeds(sel) {
    const map = {};
    if (!sel) return map;
    Object.values(sel.regions).forEach(list => list.forEach(e => {
      if (e.school) map[e.school] = { seed: e.seed, region: e.region, auto: e.auto };
      else (e.teams || []).forEach(s => { map[s] = { seed: e.seed, region: e.region, playin: true }; });
    }));
    return map;
  },

  // Kept for code that asks for the field as team objects.
  buildNCAAField() {
    const sel = this.state.ncaaSelection || this.buildSelection(false);
    return sel.seedList.map(s => this.state.teams.find(t => t.school === s)).filter(Boolean);
  },

  // ---------- Playing the tournament ----------

  // One round per click: First Four with the opening round, then each
  // round is drawn from the previous round's winners.
  async simulateNCAATournament() {
    if (!this.state.ncaaSelection || this.state.ncaaSelection.projected) {
      this.state.ncaaSelection = this.buildSelection(false);
    }
    const sel = this.state.ncaaSelection;
    const bySchool = s => this.state.teams.find(t => t.school === (s && s.school ? s.school : s));
    const play = (a, b) => {
      const result = GameCore.simulateSingleGame(a, b, { homeCourtEdge: 0 });
      const game = { teamA: a, teamB: b, result, winner: result.homeScore > result.awayScore ? a : b };
      this.attachBracketGameLogs(game, 'ncaa');
      return game;
    };
    const pairs = teams => {
      const round = [];
      for (let i = 0; i + 1 < teams.length; i += 2) round.push(play(teams[i], teams[i + 1]));
      return round;
    };

    if (!this.state.ncaaTournament) {
      const seeds = this.selectionSeeds(sel);
      this.state.teams.forEach(t => { t.ncaaSeed = seeds[t.school] ? seeds[t.school].seed : null; });
      const view = { playIn: [], rounds: [], champion: null };
      const ffWinner = {};
      this._bracketCtx = { round: -1 };
      sel.firstFour.forEach(g => {
        const game = play(bySchool(g.teams[0]), bySchool(g.teams[1]));
        game.seed = g.seed; game.region = g.region;
        view.playIn.push(game);
        ffWinner[g.id] = game.winner;
      });
      const entrants = [];
      sel.order.forEach(region => {
        const bySeed = {};
        sel.regions[region].forEach(e => { bySeed[e.seed] = e; });
        this.REGION_PAIR_ORDER.forEach(pair => pair.forEach(seed => {
          const e = bySeed[seed];
          entrants.push(e ? (e.playin ? ffWinner[e.playin] : bySchool(e.school)) : null);
        }));
      });
      this._bracketCtx = { round: 0 };
      view.rounds.push(pairs(entrants.filter(Boolean)));
      this._bracketCtx = null;
      this.state.ncaaTournament = view;
    } else if (!this.state.ncaaTournament.champion) {
      const view = this.state.ncaaTournament;
      const last = view.rounds[view.rounds.length - 1];
      this._bracketCtx = { round: view.rounds.length };
      view.rounds.push(pairs(last.map(g => bySchool(g.winner))));
      this._bracketCtx = null;
    }

    const view = this.state.ncaaTournament;
    const lastRound = view.rounds[view.rounds.length - 1];
    const finished = lastRound.length === 1 && view.rounds.length > 1;
    this.recalculateAllAverages();

    if (!finished) {
      const next = this.NCAA_ROUND_NAMES[view.rounds.length] || 'Next Round';
      this.state.phase = `NCAA Tournament — ${next}`;
      await this.saveStateToDB();
      this.syncUI();
      this.logNews(`${this.NCAA_ROUND_NAMES[view.rounds.length - 1] || 'Round'} complete.`);
      return;
    }

    view.champion = bySchool(lastRound[0].winner);
    view.champion.wonNationalTitle = true;
    this.awardNcaaHonors();

    this.state.ncaaDone = true;
    this.state.simCompleted = true;
    this.state.phase = `National Champion: ${view.champion.school}`;
    this.state.draftDeclarations = this.computeDraftDeclarations();
    this.state.draftCycle = null;
    this.ensureDraftCycle();
    await this.saveStateToDB();
    this.syncUI();
    this.logNews(`${view.champion.school} wins the National Championship!`);
    // The season's over: the offseason screen takes over straight away,
    // starting with the champion, and the season-wrap scene plays over it.
    const reveal = () => { this.openOffseason('champion'); this.playSeasonWrap(); };
    if (!this.holdForLive(reveal)) reveal();
  },

  // ---------- Drawing brackets ----------

  esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); },
  jsArg(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); },

  // One line of a bracket: seed, team, score. `state` is 'win', 'loss'
  // or '' for a game not played yet; a missing team draws an empty line.
  // Broadcast-style short names ("S. Florida", "Tenn. St.") for the tight
  // NCAA bracket columns. The full name stays in the tooltip, and wider
  // layouts (conference brackets, the First Four strip) show it in full.
  SHORT_SCHOOL: {
    'Texas A&M-Corpus Christi': 'A&M-CC', 'Mississippi Valley State': 'MVSU', 'Fairleigh Dickinson': 'FDU',
    'Queens of Charlotte': 'Queens', 'Stephen F. Austin': 'SFA', 'Florida Gulf Coast': 'FGCU', 'Florida Atlantic': 'FAU',
    'George Washington': 'G. Washington', 'Loyola Marymount': 'LMU', 'Purdue Fort Wayne': 'Purdue FW',
    'North Carolina A&T': 'NC A&T', 'Arkansas-Pine Bluff': 'UAPB', 'Southeast Missouri': 'SE Missouri',
    'Southeastern Louisiana': 'SE Louisiana', 'Charleston Southern': 'Charleston So.', 'Cal State Northridge': 'CSUN',
    'Cal State Fullerton': 'CS Fullerton', 'Central Connecticut': 'C. Conn. St.', 'Illinois Chicago': 'UIC',
    'SIU Edwardsville': 'SIUE', 'UC Santa Barbara': 'UCSB', 'Middle Tennessee': 'Middle Tenn.', 'Houston Christian': 'Houston Chr.',
    'Abilene Christian': 'Abilene Chr.', 'Mount St. Mary\'s': 'Mt. St. Mary\'s', 'Prairie View A&M': 'Prairie View',
    'Bethune-Cookman': 'B-Cookman', 'Sam Houston State': 'Sam Houston', 'Austin Peay State': 'Austin Peay',
    'Nebraska Omaha': 'Omaha', 'Incarnate Word': 'Incarnate Wd.', 'LSU New Orleans': 'New Orleans', 'Loyola Maryland': 'Loyola MD',
    'Loyola Chicago': 'Loyola Chi.', 'Connecticut': 'UConn', 'Jacksonville State': 'Jax State', 'Northwestern State': 'NW State',
    'Georgia Southern': 'Ga. Southern', 'Louisiana-Monroe': 'UL Monroe', 'Appalachian State': 'App State', 'New Mexico State': 'NM State',
    'Youngstown State': 'Youngstown', 'Pennsylvania': 'Penn', 'Mississippi State': 'Miss. State', 'Washington State': 'Wash. State', 'Virginia Commonwealth': 'VCU', 'Brigham Young': 'BYU'
  },
  shortSchool(name) {
    if (!name) return '';
    if (this.SHORT_SCHOOL[name]) return this.SHORT_SCHOOL[name];
    if (name.length <= 11) return name;
    let n = name.replace(/ State$/, ' St.').replace(/^Saint /, 'St. ')
      .replace(/^North(ern)? /, 'N. ').replace(/^South(ern)? /, 'S. ').replace(/^East(ern)? /, 'E. ')
      .replace(/^West(ern)? /, 'W. ').replace(/^Central /, 'C. ');
    if (n.length > 12) n = n.replace(/^California /, 'Cal ').replace(/^Mississippi /, 'Miss. ').replace(/^Tennessee /, 'Tenn. ')
      .replace(/^Louisiana /, 'La. ').replace(/^Washington /, 'Wash. ').replace(/^Oklahoma /, 'Okla. ').replace(/Carolina$/, 'Car.');
    return n;
  },
  bracketName(school) {
    const full = this.esc(school), short = this.shortSchool(school);
    return short === school ? full : `<span class="nb-full">${full}</span><span class="nb-short">${this.esc(short)}</span>`;
  },

  bracketTeamRow(school, seed, score, state, opts = {}) {
    if (!school) return `<div class="nb-team empty"><span class="nb-seed">${seed || ''}</span><span class="nb-name">&nbsp;</span></div>`;
    const click = opts.noLink ? '' : ` onclick="SimEngine.goToTeamPage('${this.jsArg(school)}')"`;
    return `<div class="nb-team ${state || ''}${opts.auto ? ' auto' : ''}"${click} title="${this.esc(school)}">
      <span class="nb-seed">${seed || ''}</span>
      ${opts.logo === false ? '' : `<img src="${this.getTeamLogo(school)}" class="nb-logo" alt="" loading="lazy">`}
      <span class="nb-name">${opts.label ? this.esc(opts.label) : this.bracketName(school)}</span>
      ${score != null ? (opts.gameJs ? `<span class="nb-score game-link" onclick="event.stopPropagation();${opts.gameJs}" title="Box score and play-by-play">${score}</span>` : `<span class="nb-score">${score}</span>`) : ''}
    </div>`;
  },

  bracketGameBox(slotA, slotB, game, seeds, extraClass = '') {
    const name = x => (x && x.school) ? x.school : (typeof x === 'string' ? x : null);
    const a = game ? game.teamA.school : name(slotA);
    const b = game ? game.teamB.school : name(slotB);
    const aWon = game ? game.winner.school === a : null;
    const seedOf = s => (s && seeds[s] ? seeds[s].seed : '');
    // Played games open in the Game Center; the next round's games can be
    // watched live straight from the bracket.
    const phase = this._bracketPhase;
    const gameJs = game && phase && a && b ? this.openGameJs(a, b, this.state.week, phase) : null;
    const watchable = !game && phase === 'ncaa' && a && b && this._watchKeys && this._watchKeys.has([a, b].sort().join('|'));
    const row = (school, slot, score, won) => {
      if (!game && slot && slot.label) return this.bracketTeamRow(school || slot.label, slot.seed, null, '', { label: slot.label, noLink: !school, logo: !!school });
      return this.bracketTeamRow(school, school ? seedOf(school) : (slot && slot.seed), score, game ? (won ? 'win' : 'loss') : '', { auto: school && seeds[school] && seeds[school].auto, gameJs });
    };
    return `<div class="nb-game ${extraClass}${watchable ? ' watchable' : ''}">
      ${row(a, slotA, game ? game.result.homeScore : null, aWon)}
      ${row(b, slotB, game ? game.result.awayScore : null, game ? !aWon : null)}
      ${watchable ? `<button type="button" class="nb-watch" onclick="event.stopPropagation();${this.watchGameJs(a, b, this.state.week, 'ncaa')}" title="Watch live" aria-label="Watch ${this.esc(a)} vs ${this.esc(b)} live">&#9654;</button>` : ''}
    </div>`;
  },

  // The NCAA bracket drawn the way it's printed: two regions down each
  // side feeding inward, the Final Four and title game in the middle.
  // Works for a projection (no games yet), Selection Sunday, and every
  // round of the tournament as it's played.
  renderNcaaBracket(sel, view, opts = {}) {
    if (!sel) return '<p class="sub-text">No bracket yet.</p>';
    if (!sel.projected && !opts.projected) {
      this._bracketPhase = 'ncaa';
      this._watchKeys = new Set(this.upcomingNcaaGames().map(r => [r.home, r.away].sort().join('|')));
      try { return this.renderNcaaBracketInner(sel, view, opts); } finally { this._bracketPhase = null; this._watchKeys = null; }
    }
    return this.renderNcaaBracketInner(sel, view, opts);
  },

  renderNcaaBracketInner(sel, view, opts = {}) {
    const seeds = this.selectionSeeds(sel);
    const rounds = (view && view.rounds) || [];
    const ffGames = {};
    ((view && view.playIn) || []).forEach((g, i) => { if (sel.firstFour[i]) ffGames[sel.firstFour[i].id] = g; });

    // Opening-round slots per region, in bracket order.
    const slotFor = e => {
      if (!e) return null;
      if (e.playin) {
        const g = ffGames[e.playin];
        if (g) return { school: g.winner.school, seed: e.seed };
        const ff = sel.firstFour.find(x => x.id === e.playin);
        return { seed: e.seed, label: ff ? `${ff.teams[0]} / ${ff.teams[1]}` : 'First Four' };
      }
      return { school: e.school, seed: e.seed };
    };
    const r64Slots = [];
    sel.order.forEach(region => {
      const bySeed = {};
      sel.regions[region].forEach(e => { bySeed[e.seed] = e; });
      this.REGION_PAIR_ORDER.forEach(([a, b]) => { r64Slots.push(slotFor(bySeed[a]), slotFor(bySeed[b])); });
    });

    // Game g of round r: the played game if there is one, otherwise the
    // two teams who will meet there (known once the feeder games are done).
    const gameAt = (r, i) => (rounds[r] && rounds[r][i]) || null;
    const slotsAt = (r, i) => {
      if (r === 0) return [r64Slots[i * 2], r64Slots[i * 2 + 1]];
      const f1 = gameAt(r - 1, i * 2), f2 = gameAt(r - 1, i * 2 + 1);
      return [f1 ? { school: f1.winner.school } : null, f2 ? { school: f2.winner.school } : null];
    };
    const box = (r, i, cls = '') => {
      const [sa, sb] = slotsAt(r, i);
      return this.bracketGameBox(sa, sb, gameAt(r, i), seeds, cls);
    };

    // A side: the four regional rounds for two stacked regions, then that
    // side's Final Four game.
    const side = (regionIdxs, dir) => {
      const ffIdx = dir === 'left' ? 0 : 1;
      const ffGame = (() => { const [sa, sb] = slotsAt(4, ffIdx); return this.bracketGameBox(sa, sb, gameAt(4, ffIdx), seeds, 'nb-ff'); })();
      const cols = [0, 1, 2, 3].map(r => {
        const perRegion = 8 >> r;                   // games per region in this round
        if (r === 3) {
          // Elite Eight: one game per region, paired across the two regions.
          return `<div class="nb-col"><div class="nb-pair">${regionIdxs.map(ri => box(3, ri)).join('')}</div></div>`;
        }
        const blocks = regionIdxs.map(ri => {
          const games = [];
          for (let g = 0; g < perRegion; g++) games.push(box(r, ri * perRegion + g));
          const pairsHtml = [];
          for (let p = 0; p < games.length; p += 2) pairsHtml.push(`<div class="nb-pair">${games[p]}${games[p + 1]}</div>`);
          const label = r === 0 ? `<div class="nb-region-label">${sel.order[ri]}</div>` : '';
          return `<div class="nb-region">${label}${pairsHtml.join('')}</div>`;
        }).join('');
        return `<div class="nb-col">${blocks}</div>`;
      });
      cols.push(`<div class="nb-col nb-col-ff"><div class="nb-col-label">Final Four</div><div class="nb-single">${ffGame}</div></div>`);
      return `<div class="nb-side nb-${dir}">${cols.join('')}</div>`;
    };

    const [ca, cb] = slotsAt(5, 0);
    const title = gameAt(5, 0);
    const champ = view && view.champion ? view.champion.school : (title ? title.winner.school : null);
    const center = `<div class="nb-center">
      <div class="nb-final">
        <div class="nb-final-label">National Championship</div>
        ${this.bracketGameBox(ca, cb, title, seeds, 'nb-title')}
        <div class="nb-champion">
          <div class="nb-champion-label">Champion</div>
          <div class="nb-champion-box">${champ ? `<img src="${this.getTeamLogo(champ)}" class="nb-champ-logo" alt=""><span>${this.esc(champ)}</span>` : ''}</div>
          ${(() => { const h = this.state.postseasonHonors; const m = champ && h && h.finalFour && h.finalFour.mop; return m ? `<div class="nb-mop"><span>Most Outstanding Player</span><b class="clickable-player" onclick="SimEngine.openPlayerModal('${this.jsArg(m.id)}')">${this.esc(m.name)}</b><small>${this.esc(m.school)}</small></div>` : ''; })()}
        </div>
      </div>
    </div>`;

    const firstFour = sel.firstFour.length ? `<div class="nb-first-four">
      <div class="nb-ff-title">First Four</div>
      <div class="nb-ff-games">${sel.firstFour.map((g, i) => {
        const played = view && view.playIn && view.playIn[i];
        return `<div class="nb-ff-item"><span class="nb-ff-meta">${g.region || ''} · ${g.seed || ''} seed</span>
          ${this.bracketGameBox({ school: g.teams[0], seed: g.seed }, { school: g.teams[1], seed: g.seed }, played, seeds)}</div>`;
      }).join('')}</div>
    </div>` : '';

    return `<div class="nb-scroll nb-wide"><div class="nb-bracket nb-ncaa">
        ${side([0, 1], 'left')}
        ${center}
        ${side([2, 3], 'right')}
      </div></div>
      ${opts.hideFirstFour ? '' : firstFour}`;
  },

  // Conference tournament as a real bracket: seeds, byes for the top
  // seeds, and lines joining each game to the next.
  renderConfBracket(bracket, confName) {
    this._bracketPhase = 'conftourney';
    try { return this.renderConfBracketInner(bracket, confName); } finally { this._bracketPhase = null; }
  },

  renderConfBracketInner(bracket, confName) {
    if (!bracket || !bracket.rounds || !bracket.rounds.length) return '<p class="sub-text">No bracket yet.</p>';
    const seeds = {};
    const seedMap = bracket.seeds || {};
    Object.keys(seedMap).forEach(s => { seeds[s] = { seed: seedMap[s] }; });
    const names = ['First Round', 'Quarterfinals', 'Semifinals', 'Championship'];
    const cols = [];
    const first = bracket.rounds[0] || [];
    // Play-in games feed the opening round; teams with a bye skip them.
    if (bracket.playIn && bracket.playIn.length) {
      const slots = [];
      first.forEach(g => [g.teamA, g.teamB].forEach(t => {
        const pi = bracket.playIn.find(p => p.winner.school === t.school);
        slots.push(pi ? this.bracketGameBox(null, null, pi, seeds)
          : `<div class="nb-game nb-bye">${this.bracketTeamRow(t.school, seeds[t.school] && seeds[t.school].seed, null, '', {})}<div class="nb-team nb-bye-line"><span class="nb-seed"></span><span class="nb-name">Bye</span></div></div>`);
      }));
      const pairsHtml = [];
      for (let i = 0; i < slots.length; i += 2) pairsHtml.push(`<div class="nb-pair">${slots[i]}${slots[i + 1] || ''}</div>`);
      cols.push({ title: 'Opening Round', html: pairsHtml.join('') });
    }
    bracket.rounds.forEach((round, r) => {
      const games = round.map(g => this.bracketGameBox(null, null, g, seeds));
      let html;
      if (games.length === 1) html = `<div class="nb-single">${games[0]}</div>`;
      else {
        const pairsHtml = [];
        for (let i = 0; i < games.length; i += 2) pairsHtml.push(`<div class="nb-pair">${games[i]}${games[i + 1] || ''}</div>`);
        html = pairsHtml.join('');
      }
      const fromEnd = bracket.rounds.length - 1 - r;
      cols.push({ title: fromEnd < 3 ? names[3 - fromEnd] : `Round ${r + 1}`, html });
    });
    const champ = bracket.champion && bracket.champion.school;
    return `<div class="conf-bracket">
      ${confName ? `<h5 class="bracket-conf-title">${this.getConferenceLogoImg(confName, 'conf-logo-sm')} ${this.esc(confName)} Tournament</h5>` : ''}
      <div class="nb-scroll"><div class="nb-bracket nb-conf">
        <div class="nb-side nb-left">${cols.map(c => `<div class="nb-col"><div class="nb-col-title">${c.title}</div><div class="nb-col-body">${c.html}</div></div>`).join('')}</div>
        ${champ ? `<div class="nb-conf-champ"><div class="nb-champion-label">Champion</div><div class="nb-champion-box"><img src="${this.getTeamLogo(champ)}" class="nb-champ-logo" alt=""><span>${this.esc(champ)}</span></div>${(() => { const h = this.state.postseasonHonors; const m = h && h.conf && h.conf[confName]; return m ? `<div class="nb-mop"><span>Most Outstanding Player</span><b class="clickable-player" onclick="SimEngine.openPlayerModal('${this.jsArg(m.id)}')">${this.esc(m.name)}</b><small>${this.esc(m.line)}</small></div>` : ''; })()}</div>` : ''}
      </div></div>
    </div>`;
  },

  // Kept as the single entry point older code calls.
  renderBracketVisual(bracket, isNcaa, confName) {
    if (isNcaa) return this.renderNcaaBracket(this.state.ncaaSelection, bracket);
    return this.renderConfBracket(bracket, confName);
  },

  // ---------- Bracketology ----------

  renderSeedList(sel) {
    const seeds = this.selectionSeeds(sel);
    const lines = {};
    Object.values(sel.regions).forEach(list => list.forEach(e => { (lines[e.seed] = lines[e.seed] || []).push(e); }));
    const chip = e => {
      if (e.playin) {
        const g = sel.firstFour.find(x => x.id === e.playin);
        return `<span class="bl-team bl-playin" title="First Four">${g.teams.map(s => this.esc(s)).join(' / ')}</span>`;
      }
      return `<span class="bl-team${e.auto ? ' bl-auto' : ''}" onclick="SimEngine.goToTeamPage('${this.jsArg(e.school)}')" title="${this.esc(e.school)} — ${e.region}${e.auto ? ', automatic bid' : ''}">
        <img src="${this.getTeamLogo(e.school)}" class="xs-logo" alt="" loading="lazy">${this.esc(e.school)}</span>`;
    };
    const rows = Object.keys(lines).map(Number).sort((a, b) => a - b).map(seed => `
      <div class="bl-row"><span class="bl-seed">${seed}</span><div class="bl-teams">${lines[seed].map(chip).join('')}</div></div>`).join('');
    const bubble = (title, list, cls) => `<div class="bl-bubble ${cls}"><h5>${title}</h5>${list.length ? list.map(s => `<span class="bl-team" onclick="SimEngine.goToTeamPage('${this.jsArg(s)}')"><img src="${this.getTeamLogo(s)}" class="xs-logo" alt="" loading="lazy">${this.esc(s)}</span>`).join('') : '<span class="sub-text">—</span>'}</div>`;
    void seeds;
    return `<div class="bl-grid">
      <div class="bl-lines">${rows}</div>
      <div class="bl-side">
        ${bubble('Last Four In', sel.lastFourIn, 'in')}
        ${bubble('First Four Out', sel.firstFourOut, 'out')}
        ${bubble('Next Four Out', sel.nextFourOut, 'out')}
      </div>
    </div>`;
  },

  // Each conference's (projected) automatic bid and how many teams it
  // has in the field — the standings picture that decides the bracket.
  renderConferencePicture(sel) {
    const rows = Object.keys(sel.autoBids).sort((a, b) => (sel.bids[b] || 0) - (sel.bids[a] || 0) || a.localeCompare(b)).map(conf => {
      const s = sel.autoBids[conf];
      const t = this.state.teams.find(x => x.school === s);
      return `<tr>
        <td><span class="conf-cell">${this.getConferenceLogoImg(conf, 'conf-logo-sm')} ${this.esc(conf)}</span></td>
        <td><div class="team-cell-wrap clickable-school" onclick="SimEngine.goToTeamPage('${this.jsArg(s)}')"><img src="${this.getTeamLogo(s)}" class="xs-logo" alt=""><span>${this.esc(s)}</span></div></td>
        <td class="sub-text">${t ? `${t.simData.wins}-${t.simData.losses} (${t.simData.confWins}-${t.simData.confLosses})` : ''}</td>
        <td class="bold-text">${sel.bids[conf] || 1}</td>
      </tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>Conference</th><th>${sel.projected ? 'Projected auto bid' : 'Automatic bid'}</th><th>Record (Conf)</th><th>Bids</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  },

  updatePostseasonTab() {
    const container = document.getElementById('postseasonContainer');
    if (!container) return;
    if (!this.state.teams.length) {
      container.innerHTML = `<p class="empty-table-msg">Start a save to see bracketology.</p>`;
      return;
    }

    let html = '';
    const actual = this.state.confChampsDone && this.state.ncaaSelection && !this.state.ncaaSelection.projected;
    html += this.renderWatchStrip();

    if (this.state.ncaaTournament) {
      html += `<div class="flex-between wrap-gap mb-1"><h4 class="award-section-title">NCAA Tournament</h4>
        <button class="sim-btn sim-btn-secondary btn-sm" onclick="SimEngine.playSelectionShow()">Replay Selection Sunday</button></div>`;
      html += this.renderNcaaBracket(this.state.ncaaSelection, this.state.ncaaTournament);
    } else if (actual) {
      const sel = this.state.ncaaSelection;
      html += `<div class="flex-between wrap-gap mb-1"><div><h4 class="award-section-title">Selection Sunday</h4>
        <p class="sub-text">The field of ${sel.fieldSize} is set. Gold marks an automatic bid.</p></div>
        <button class="sim-btn btn-sm" onclick="SimEngine.playSelectionShow()">Watch the Selection Show</button></div>`;
      html += this.renderNcaaBracket(sel, null);
      html += `<h4 class="award-section-title mt-2">Seed List</h4>${this.renderSeedList(sel)}`;
    } else {
      // Live bracketology: re-run after every week of games.
      const sel = this.buildSelection(true);
      const when = this.state.week === 0 ? 'Preseason projection' : this.state.regularSeasonDone
        ? 'Final projection before the conference tournaments' : `Projected through Week ${this.state.week}`;
      html += `<div class="bracketology-head">
        <div><p class="sub-text">${when}. Updates after every week. Conference leaders hold the projected automatic bids; everyone else is ranked on record, strength and schedule.</p></div>
      </div>`;
      html += `<h4 class="award-section-title mt-1">Projected Seed List</h4>${this.renderSeedList(sel)}`;
      html += `<h4 class="award-section-title mt-2">Projected Bracket</h4>${this.renderNcaaBracket(sel, null, { hideFirstFour: false })}`;
      html += `<h4 class="award-section-title mt-2">Conference Picture</h4>${this.renderConferencePicture(sel)}`;
    }

    const entries = Object.entries(this.state.confTournaments || {});
    if (entries.length) {
      entries.sort((a, b) => {
        const ha = this.isHighMajor(a[0]) ? 0 : 1;
        const hb = this.isHighMajor(b[0]) ? 0 : 1;
        return ha - hb || a[0].localeCompare(b[0]);
      });
      html += `<h4 class="award-section-title mt-2">Conference Tournaments</h4>`;
      entries.forEach(([confName, bracket]) => {
        html += `<div class="conf-bracket-block ${this.isHighMajor(confName) ? 'high-major' : ''}">${this.renderConfBracket(bracket, confName)}</div>`;
      });
    } else if (actual || this.state.regularSeasonDone) {
      html += `<h4 class="award-section-title mt-2">Conference Tournaments</h4><p class="sub-text">Not yet played.</p>`;
    }

    container.innerHTML = html;
  },

  // Dashboard: whichever bracket is the story right now.
  updateDashboardBracket() {
    const el = document.getElementById('dashBracket');
    const wrap = document.getElementById('dashBracketSection');
    if (!el || !wrap) return;
    const title = t => { const bt = document.getElementById('dashBracketTitle'); if (bt) bt.innerText = t; };

    if (this.state.ncaaTournament) {
      wrap.style.display = 'block';
      title(this.state.ncaaDone ? 'NCAA TOURNAMENT' : 'NCAA TOURNAMENT — LIVE');
      el.innerHTML = this.renderNcaaBracket(this.state.ncaaSelection, this.state.ncaaTournament, { hideFirstFour: true });
      return;
    }
    if (this.state.confChampsDone && this.state.ncaaSelection) {
      wrap.style.display = 'block';
      title('SELECTION SUNDAY — THE FIELD OF 68');
      el.innerHTML = this.renderNcaaBracket(this.state.ncaaSelection, null, { hideFirstFour: true });
      return;
    }
    if (this.state.regularSeasonDone && Object.keys(this.state.confTournaments).length > 0) {
      wrap.style.display = 'block';
      title('CONFERENCE TOURNAMENTS');
      const first = Object.entries(this.state.confTournaments)
        .sort((a, b) => (this.isHighMajor(b[0]) ? 1 : 0) - (this.isHighMajor(a[0]) ? 1 : 0))[0];
      el.innerHTML = first ? this.renderConfBracket(first[1], first[0]) : '';
      return;
    }
    wrap.style.display = 'none';
  },

  // ---------- Selection Sunday show ----------

  // A short animated reveal of the field: the automatic bids, the four
  // No. 1 seeds, each region, and the bubble. Skip jumps straight to the
  // bracket.
  playSelectionShow() {
    if (typeof document === 'undefined' || !this.state.ncaaSelection || typeof Cutscene === 'undefined') return;
    const sel = this.state.ncaaSelection;
    const C = Cutscene;
    const logo = s => `<img src="${this.getTeamLogo(s)}" alt="" class="cs-logo">`;
    const yearLabel = `${this.state.year}-${String(this.state.year + 1).slice(2)}`;
    const autos = Object.entries(sel.autoBids);
    const ones = sel.order.map(r => sel.regions[r].find(e => e.seed === 1)).filter(Boolean);
    const scenes = [
      { ms: 2600, html: C.titleCard(`${yearLabel} NCAA Tournament`, 'Selection<br>Sunday', `The field of ${sel.fieldSize} is revealed`) },
      { ms: 3400, html: C.heading('Automatic bids', `${autos.length} conference champions punch their tickets.`) +
          `<div class="sel-autos">${autos.map(([c, s], i) => `<div class="sel-auto cs-item" style="--d:${i * 45}ms">${logo(s)}<span>${this.esc(s)}</span><small>${this.esc(c)}</small></div>`).join('')}</div>` },
      { ms: 3600, html: C.heading('The No. 1 seeds') +
          `<div class="cs-cards">${ones.map((e, i) => `<div class="cs-card cs-item" style="--d:${200 + i * 520}ms"><div class="cs-card-kicker">${e.region}</div>
            ${e.school ? `<img src="${this.getTeamLogo(e.school)}" alt="" class="cs-logo">` : ''}<div class="cs-card-name">${this.esc(e.school || '')}</div></div>`).join('')}</div>` },
      ...sel.order.map(region => ({ ms: 3900, html: C.heading(`${region} Region`) +
          `<div class="sel-region">${[...sel.regions[region]].sort((a, b) => a.seed - b.seed).map((e, i) => {
            const name = e.school || (sel.firstFour.find(g => g.id === e.playin) || { teams: ['', ''] }).teams.join(' / ');
            return `<div class="cs-row cs-item" style="--d:${i * 110}ms"><span class="cs-rank">${e.seed}</span>${e.school ? logo(e.school) : '<span class="sel-ff">FF</span>'}<span class="cs-name">${this.esc(name)}</span></div>`;
          }).join('')}</div>` })),
      { ms: 3400, html: C.heading('On the bubble') +
          `<div class="cs-bubble"><div><h3>Last four in</h3>${sel.lastFourIn.map((s, i) => `<div class="cs-row good cs-item" style="--d:${i * 160}ms">${logo(s)}<span class="cs-name">${this.esc(s)}</span></div>`).join('')}</div>
          <div><h3>First four out</h3>${sel.firstFourOut.map((s, i) => `<div class="cs-row bad cs-item" style="--d:${(i + 4) * 160}ms">${logo(s)}<span class="cs-name">${this.esc(s)}</span></div>`).join('')}</div></div>` },
      { ms: 0, html: C.titleCard('', '<span class="small">The bracket is set</span>') }
    ];
    C.play({ id: 'selectionShow', label: 'Selection Sunday', scenes,
      actions: [{ label: 'View the bracket', primary: true, run: () => this.finishSelectionShow() }],
      onClose: how => { if (how === 'skipped') this.finishSelectionShow(); } });
  },

  closeSelectionShow() {
    if (typeof Cutscene !== 'undefined') Cutscene.close(true);
  },

  // Skip or finish: close the show and land on the bracket.
  finishSelectionShow() {
    this.closeSelectionShow();
    if (window.UIController && typeof UIController.activateTab === 'function') UIController.activateTab('postseasonTab');
    this.updatePostseasonTab();
  },

  // ---------- Big games, draft stock and tournament honors ----------

  // How much a game in each NCAA round counts (First Round .. title game).
  BIG_ROUND_WEIGHT: [1.0, 1.2, 1.5, 1.8, 2.2, 2.6],

  gameScoreOf(b) {
    return (b.pts || 0) + 0.4 * (b.fgm || 0) - 0.7 * (b.fga || 0) - 0.4 * ((b.fta || 0) - (b.ftm || 0)) + 0.7 * (b.oreb || 0)
      + 0.3 * ((b.reb || 0) - (b.oreb || 0)) + (b.stl || 0) + 0.7 * (b.ast || 0) + 0.7 * (b.blk || 0) - 0.4 * (b.pf || 0) - (b.tov || 0);
  },
  statLine(b) {
    const parts = [`${b.pts} pts`];
    if (b.reb >= 5) parts.push(`${b.reb} reb`);
    if (b.ast >= 4) parts.push(`${b.ast} ast`);
    if (b.stl >= 3) parts.push(`${b.stl} stl`);
    if (b.blk >= 3) parts.push(`${b.blk} blk`);
    parts.push(`${b.fgm}-${b.fga} FG`);
    return parts.join(', ');
  },

  // A team's national ranking at the time of a game.
  rankForBigGame(t) {
    if (!t) return null;
    if (t.apRank) return t.apRank;
    return this.state.week <= 1 && t.preseasonRank && t.preseasonRank <= 25 ? t.preseasonRank : null;
  },

  // Scouts judge a player against his own standard: a big night against a
  // ranked team, or in March, raises his stock; a no-show lowers it.
  noteBigGame(player, box, ctx) {
    if (!player || !box || !(box.min >= 10)) return;
    const logs = (player.gameLog || []).filter(l => l.min > 0);
    const prior = logs.slice(0, -1);
    if ((player.expectedStats && parseFloat(player.expectedStats.mpg) < 14) && prior.length < 5) return;
    const sum = prior.reduce((a, l) => a + this.gameScoreOf(l), 0);
    const avg = (sum + 7 * 3) / (prior.length + 3);
    const gs = this.gameScoreOf(box);
    // Everyone produces a little less against good teams; scouts know it.
    const expected = avg * (ctx.tough || 0.94);
    const z = Math.max(-1.6, Math.min(1.6, (gs - expected) / 7));
    const delta = +(ctx.weight * z * 0.4).toFixed(2);
    player.bigGameStock = +Math.max(-3.5, Math.min(3.5, (player.bigGameStock || 0) + delta)).toFixed(2);
    if (Math.abs(delta) >= 0.22) {
      player.bigGames = (player.bigGames || []).concat([{ label: ctx.label, line: this.statLine(box), delta, gs: +gs.toFixed(1), won: !!ctx.won, year: this.state.year }]).slice(-10);
    }
  },

  // Tournament totals for one player from his game logs.
  tourneyTotals(player, filter) {
    const logs = (player.gameLog || []).filter(l => l.week === this.state.week && filter(l));
    const t = { games: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, gs: 0 };
    logs.forEach(l => { if (!(l.min > 0)) return; t.games++; ['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga'].forEach(k => { t[k] += l[k] || 0; }); t.gs += this.gameScoreOf(l); });
    return t;
  },
  honorEntry(player, school, t) {
    const per = k => (t.games ? (t[k] / t.games).toFixed(1) : '0.0');
    return { id: player.id, name: player.name, pos: player.pos, class: player.class, school, games: t.games,
      pts: t.pts, reb: t.reb, ast: t.ast, line: `${per('pts')} ppg, ${per('reb')} rpg, ${per('ast')} apg in ${t.games} game${t.games === 1 ? '' : 's'}` };
  },
  giveAccolade(player, text) {
    if (!player) return;
    player.accolades = player.accolades || [];
    if (!player.accolades.includes(text)) player.accolades.push(text);
  },
  ensureHonors() {
    if (!this.state.postseasonHonors || this.state.postseasonHonors.year !== this.state.year) {
      this.state.postseasonHonors = { year: this.state.year, conf: {}, regions: {}, finalFour: null };
    }
    return this.state.postseasonHonors;
  },

  // Each conference tournament's Most Outstanding Player comes from the
  // champion, as it nearly always does.
  awardConferenceTournamentMops() {
    const h = this.ensureHonors();
    Object.entries(this.state.confTournaments || {}).forEach(([conf, b]) => {
      if (!b || !b.champion) return;
      const team = this.findTeam(b.champion.school) || b.champion;
      let best = null;
      (team.roster || []).forEach(p => {
        const t = this.tourneyTotals(p, l => l.phase === 'conftourney');
        if (!t.games) return;
        const score = t.gs + t.pts * 0.15;
        if (!best || score > best.score) best = { p, t, score };
      });
      if (!best) return;
      h.conf[conf] = this.honorEntry(best.p, team.school, best.t);
      b.mop = h.conf[conf];
      this.giveAccolade(best.p, `${conf} Tournament MOP`);
    });
  },

  // Regional MOPs, the Final Four's Most Outstanding Player and the
  // All-Final Four team.
  awardNcaaHonors() {
    const s = this.state, t = s.ncaaTournament;
    if (!t || !t.champion) return;
    const h = this.ensureHonors();
    const ff = new Set((t.rounds[4] || []).flatMap(g => [g.teamA.school, g.teamB.school]));
    const title = (t.rounds[5] || [])[0];
    const champ = t.champion.school;
    const runner = title ? (title.winner.school === title.teamA.school ? title.teamB.school : title.teamA.school) : null;
    const seeds = s.ncaaSelection ? this.selectionSeeds(s.ncaaSelection) : {};
    // Regions: the region champion's best player in its four (or five) games.
    ff.forEach(school => {
      const team = this.findTeam(school);
      if (!team) return;
      let best = null;
      (team.roster || []).forEach(p => {
        const tt = this.tourneyTotals(p, l => l.phase === 'ncaa' && !ff.has(l.opponent));
        if (!tt.games) return;
        if (!best || tt.gs > best.tt.gs) best = { p, tt };
      });
      const region = (seeds[school] || {}).region || 'Region';
      if (best) {
        h.regions[region] = { ...this.honorEntry(best.p, school, best.tt), region };
        this.giveAccolade(best.p, `NCAA ${region} Region MOP`);
      }
    });
    // The Final Four: semifinal and title-game performances.
    const pool = [];
    ff.forEach(school => {
      const team = this.findTeam(school);
      if (!team) return;
      (team.roster || []).forEach(p => {
        const tt = this.tourneyTotals(p, l => l.phase === 'ncaa' && ff.has(l.opponent));
        if (!tt.games) return;
        const bonus = school === champ ? 1.15 : school === runner ? 1.0 : 0.85;
        pool.push({ p, school, tt, score: (tt.gs + tt.pts * 0.1) * bonus });
      });
    });
    pool.sort((a, b) => b.score - a.score);
    if (!pool.length) return;
    const mop = pool[0];
    h.finalFour = {
      mop: this.honorEntry(mop.p, mop.school, mop.tt),
      team: pool.slice(0, 5).map(x => this.honorEntry(x.p, x.school, x.tt))
    };
    this.giveAccolade(mop.p, 'Final Four Most Outstanding Player');
    pool.slice(0, 5).forEach(x => this.giveAccolade(x.p, 'NCAA All-Final Four Team'));
  },

  // ---------- Live games: finding and rebuilding a game ----------
  //
  // Every player's game log holds his line for each game, with the week,
  // the phase and the opponent. That identifies a game uniquely within a
  // season, so any game this season can be rebuilt from the logs of the two
  // rosters — nothing extra is stored.

  gameKey(ref) { return `${this.state.year}|${ref.phase}|${ref.week}|${ref.home}|${ref.away}`; },

  gameLinesFor(school, opp, week, phase) {
    const team = this.findTeam(school);
    if (!team) return [];
    const out = [];
    (team.roster || []).forEach(p => {
      const log = (p.gameLog || []).find(l => l.week === week && l.opponent === opp && (!phase || l.phase === phase));
      if (log) out.push({ ...log, id: p.id, name: p.name, pos: p.pos, jersey: p.jersey });
    });
    return out;
  },

  // A team's record going into (and coming out of) a given game.
  recordAround(school, ref) {
    const team = this.findTeam(school);
    if (!team) return { before: '', after: '' };
    const logs = (team.roster || []).map(p => p.gameLog || []).sort((a, b) => b.length - a.length)[0] || [];
    let w = 0, l = 0;
    for (const g of logs) {
      if (g.week === ref.week && g.phase === ref.phase && g.opponent === (school === ref.home ? ref.away : ref.home)) {
        return { before: `${w}-${l}`, after: g.won ? `${w + 1}-${l}` : `${w}-${l + 1}` };
      }
      if (g.won) w++; else l++;
    }
    return { before: `${w}-${l}`, after: `${w}-${l}` };
  },

  gameRefFromLog(school, log) {
    return log.isHome ? { home: school, away: log.opponent, week: log.week, phase: log.phase }
      : { home: log.opponent, away: school, week: log.week, phase: log.phase };
  },

  // Where a game sits in the season: the label a broadcast would open with.
  describeGame(ref) {
    const s = this.state;
    const home = this.findTeam(ref.home);
    if (ref.phase === 'ncaa') {
      const t = s.ncaaTournament;
      const has = g => g && [g.teamA.school, g.teamB.school].includes(ref.home) && [g.teamA.school, g.teamB.school].includes(ref.away);
      if (t) {
        if ((t.playIn || []).some(has)) return { label: 'NCAA Tournament · First Four', round: -1, neutral: true, big: 1 };
        for (let r = 0; r < (t.rounds || []).length; r++) {
          if (t.rounds[r].some(has)) {
            const seeds = s.ncaaSelection ? this.selectionSeeds(s.ncaaSelection) : {};
            const region = r < 4 && seeds[ref.home] ? ` · ${seeds[ref.home].region} Region` : '';
            return { label: `NCAA Tournament · ${this.NCAA_ROUND_NAMES[r]}${region}`, round: r, neutral: true, big: 1 };
          }
        }
      }
      return { label: 'NCAA Tournament', round: 0, neutral: true, big: 1 };
    }
    if (ref.phase === 'conftourney') {
      const conf = home ? home.conference : '';
      const b = s.confTournaments && s.confTournaments[conf];
      let label = `${conf} Tournament`;
      if (b) {
        const has = g => g && [g.teamA.school, g.teamB.school].includes(ref.home) && [g.teamA.school, g.teamB.school].includes(ref.away);
        const rounds = b.rounds || [];
        const r = rounds.findIndex(rd => rd.some(has));
        const fromEnd = rounds.length - 1 - r;
        if ((b.playIn || []).some(has)) label += ' · Opening Round';
        else if (r >= 0) label += ` · ${fromEnd === 0 ? 'Championship' : fromEnd === 1 ? 'Semifinal' : fromEnd === 2 ? 'Quarterfinal' : 'Round ' + (r + 1)}`;
        return { label, round: r, neutral: true, big: 0.7, conference: conf, final: fromEnd === 0 };
      }
      return { label, neutral: true, big: 0.7, conference: conf };
    }
    const g = (s.schedule || []).find(x => x.week === ref.week && x.home === ref.home && x.away === ref.away);
    const conf = g ? g.isConf : ref.phase === 'conf';
    return { label: `Week ${ref.week}${conf && home ? ' · ' + home.conference : ' · Non-conference'}`, neutral: false, big: 0 };
  },

  buildLiveGame(ref) {
    if (typeof LiveCore === 'undefined') return null;
    const key = this.gameKey(ref);
    if (this._liveCache && this._liveCache.key === key) return this._liveCache.game;
    const hl = this.gameLinesFor(ref.home, ref.away, ref.week, ref.phase);
    const al = this.gameLinesFor(ref.away, ref.home, ref.week, ref.phase);
    if (!hl.length || !al.length) return null;
    const H = this.findTeam(ref.home), A = this.findTeam(ref.away);
    const d = this.describeGame(ref);
    const ovr = t => (t && t.simData && t.simData.teamOvr) || 75;
    const seeds = this.state.ncaaSelection && ref.phase === 'ncaa' ? this.selectionSeeds(this.state.ncaaSelection) : {};
    const side = (t, school) => {
      const rec = this.recordAround(school, ref);
      return { school, conference: t ? t.conference : '', rank: this.pollRankOf(t), seed: seeds[school] ? seeds[school].seed : null, record: rec.before, recordAfter: rec.after };
    };
    const meta = {
      key, ref, label: d.label, neutral: d.neutral, round: d.round, big: d.big,
      home: side(H, ref.home), away: side(A, ref.away),
      spread: +((ovr(H) - ovr(A)) * 0.85 + (d.neutral ? 0 : 3)).toFixed(1),
      homeScore: hl[0].teamScore, awayScore: hl[0].oppScore
    };
    const h = this.state.postseasonHonors;
    if (h && ref.phase === 'ncaa' && d.round === 5 && h.finalFour) meta.note = `${h.finalFour.mop.name} of ${h.finalFour.mop.school} is the Final Four's Most Outstanding Player.`;
    if (h && ref.phase === 'conftourney' && d.final && h.conf && h.conf[d.conference]) meta.note = `${h.conf[d.conference].name} is the ${d.conference} Tournament's Most Outstanding Player.`;
    const game = LiveCore.build(meta, { home: hl, away: al });
    this._liveCache = { key, game };
    return game;
  },

  // ---------- Live games: watching ----------
  //
  // Watching a game plays the whole slate (the week, or the tournament
  // round) and then opens the chosen game from the tip. Anything that
  // would give the result away — the week's toast, the champion's
  // cutscene, the offseason screen — waits until the broadcast is closed.

  holdForLive(fn) {
    if (this._liveHold) { this._liveHold.push(fn); return true; }
    return false;
  },
  releaseLiveHold() {
    const q = this._liveHold || [];
    this._liveHold = null;
    q.forEach(fn => { try { fn(); } catch (e) { console.error('After the broadcast:', e); } });
  },

  // The games that will be played the next time the season moves forward.
  upcomingSlate() {
    const s = this.state;
    if (!s.teams.length || s.ncaaDone) return [];
    if (!s.regularSeasonDone) {
      const w = (s.week || 0) + 1;
      return (s.schedule || []).filter(g => g.week === w && !g.played)
        .map(g => ({ home: g.home, away: g.away, week: w, phase: g.isConf ? 'conf' : 'nonconf' }));
    }
    if (!s.confChampsDone) return [];      // conference brackets are drawn as they're played
    return this.upcomingNcaaGames();
  },

  upcomingNcaaGames() {
    const s = this.state;
    const sel = s.ncaaSelection;
    const w = s.week;
    const out = [];
    const t = s.ncaaTournament;
    if (!t) {
      if (!sel || sel.projected) return [];
      sel.firstFour.forEach(g => out.push({ home: g.teams[0], away: g.teams[1], week: w, phase: 'ncaa', label: `First Four · ${g.region}` }));
      sel.order.forEach(region => {
        const bySeed = {};
        sel.regions[region].forEach(e => { bySeed[e.seed] = e; });
        this.REGION_PAIR_ORDER.forEach(([x, y]) => {
          const a = bySeed[x], b = bySeed[y];
          if (a && b && a.school && b.school) out.push({ home: a.school, away: b.school, week: w, phase: 'ncaa', label: `First Round · ${region}` });
        });
      });
      return out;
    }
    if (t.champion) return [];
    const last = t.rounds[t.rounds.length - 1] || [];
    const name = this.NCAA_ROUND_NAMES[t.rounds.length] || 'Next Round';
    for (let i = 0; i + 1 < last.length; i += 2) {
      out.push({ home: last[i].winner.school, away: last[i + 1].winner.school, week: w, phase: 'ncaa', label: name });
    }
    return out;
  },

  // Finds how a game was recorded (who was "home") once it's been played.
  resolveGameRef(ref) {
    const pick = (a, b) => {
      const team = this.findTeam(a);
      if (!team) return null;
      for (const p of team.roster || []) {
        const log = (p.gameLog || []).find(l => l.week === ref.week && l.opponent === b && (!ref.phase || l.phase === ref.phase));
        if (log) return this.gameRefFromLog(a, log);
      }
      return null;
    };
    return pick(ref.home, ref.away) || pick(ref.away, ref.home);
  },

  isGamePlayed(ref) { return !!this.resolveGameRef(ref); },

  // Other results from the same slate, revealed during the broadcast.
  slateTicker(watched, slate, watching = []) {
    const res = [];
    const myTip = this.tipMinutes(watched);
    const rng = typeof LiveCore !== 'undefined' ? LiveCore.rngFrom(this.gameKey(watched) + '|ticker') : Math.random;
    const rankOf = sc => { const t = this.findTeam(sc); return t ? this.pollRankOf(t) : null; };
    // Only games that would have finished by some point in this broadcast,
    // and never one still on the watch list.
    const ranked = slate.filter(r => !this.sameGame(r, watched) && !watching.some(w => this.sameGame(w, r)) && this.tipMinutes(r) - myTip <= 20);
    const scored = ranked.map(r => ({ r, w: (rankOf(r.home) ? 30 - rankOf(r.home) : 0) + (rankOf(r.away) ? 30 - rankOf(r.away) : 0) }))
      .filter(x => watched.phase === 'ncaa' || x.w > 0).sort((a, b) => b.w - a.w).slice(0, 12);
    scored.forEach(({ r }) => {
      const ref = this.resolveGameRef(r);
      if (!ref) return;
      const lines = this.gameLinesFor(ref.home, ref.away, ref.week, ref.phase);
      if (!lines.length) return;
      const seeds = ref.phase === 'ncaa' && this.state.ncaaSelection ? this.selectionSeeds(this.state.ncaaSelection) : {};
      res.push({
        key: this.gameKey(ref), ref, home: ref.home, away: ref.away,
        homeScore: lines[0].teamScore, awayScore: lines[0].oppScore,
        homeRank: ref.phase === 'ncaa' ? (seeds[ref.home] || {}).seed : rankOf(ref.home),
        awayRank: ref.phase === 'ncaa' ? (seeds[ref.away] || {}).seed : rankOf(ref.away),
        // A game that tipped earlier ends earlier in this one: a two-hour
        // window, so one that started an hour before is final at halftime.
        at: Math.max(0.02, Math.min(1.05, 1 + (this.tipMinutes(r) - myTip) / 120 + (rng() - 0.5) * 0.1))
      });
    });
    return res;
  },

  // ---------- Tip times ----------
  //
  // Hours behind Eastern for each school: a conference default, then the
  // schools that sit in a different zone from the rest of their league.
  TZ_CONF: { 'A-10': 0, ACC: 0, ASUN: 0, 'America East': 0, American: 1, 'Big 12': 1, 'Big East': 0, 'Big Sky': 2, 'Big South': 0,
    'Big Ten': 0, 'Big West': 3, CAA: 0, 'Conference USA': 1, 'Horizon League': 0, 'Ivy League': 0, MAAC: 0, MAC: 0, MEAC: 0,
    'Missouri Valley': 1, 'Mountain West': 2, NEC: 0, 'Ohio Valley': 1, 'Pac-12': 3, 'Patriot League': 0, SEC: 1, SWAC: 1,
    Southern: 0, Southland: 1, 'Sun Belt': 0, 'The Summit': 1, UAC: 1, 'West Coast': 3 },
  TZ_SCHOOL: { 'Loyola Chicago': 1, 'Saint Louis': 1, Cal: 3, Stanford: 3, SMU: 1, Lipscomb: 1, 'West Florida': 1,
    Charlotte: 0, 'East Carolina': 0, 'Florida Atlantic': 0, 'South Florida': 0, Temple: 0,
    Arizona: 2, 'Arizona State': 2, BYU: 2, Colorado: 2, Utah: 2, UCF: 0, Cincinnati: 0, 'West Virginia': 0,
    Creighton: 1, DePaul: 1, Marquette: 1, 'Eastern Washington': 3, Idaho: 3, 'Portland State': 3,
    Illinois: 1, Iowa: 1, Minnesota: 1, Nebraska: 1, Northwestern: 1, Wisconsin: 1, UCLA: 3, USC: 3, Oregon: 3, Washington: 3,
    'Utah Valley': 2, Delaware: 0, FIU: 0, 'Kennesaw State': 0, Liberty: 0, 'New Mexico State': 2,
    Milwaukee: 1, 'Green Bay': 1, 'Northern Illinois': 1, 'Indiana State': 0,
    Hawaii: 5, Nevada: 3, 'San Jose State': 3, 'UC Davis': 3, UNLV: 3, 'Grand Canyon': 2, UTEP: 2, 'Chicago State': 1,
    'Morehead State': 0, 'Boise State': 2, 'Colorado State': 2, 'Utah State': 2, 'Texas State': 1, Samford: 1,
    'Arkansas State': 1, Louisiana: 1, 'Louisiana-Monroe': 1, 'Louisiana Tech': 1, 'South Alabama': 1, 'Southern Miss': 1, Troy: 1,
    'Eastern Kentucky': 0, 'West Georgia': 0, Denver: 2 },
  tzOf(school) {
    if (this.TZ_SCHOOL[school] !== undefined) return this.TZ_SCHOOL[school];
    const t = this.findTeam(school);
    return t && this.TZ_CONF[t.conference] !== undefined ? this.TZ_CONF[t.conference] : 0;
  },
  // Minutes after midnight Eastern. Most games tip in the evening where
  // they're played, so the East goes first and the West Coast last; some
  // are weekend afternoon games. Tournament games run in sessions.
  tipMinutes(ref) {
    const key = `${ref.home}|${ref.away}|${ref.week}|${ref.phase}|${this.state.year}`;
    const rng = typeof HSCore !== 'undefined' ? HSCore.rngFor(key + '|tip') : Math.random;
    if (ref.phase === 'ncaa' || ref.phase === 'conftourney') {
      const sessions = [12 * 60 + 15, 14 * 60 + 45, 16 * 60 + 30, 19 * 60 + 10, 21 * 60 + 40];
      return sessions[Math.floor(rng() * sessions.length)];
    }
    const roll = rng();
    const local = roll < 0.2 ? [12, 14, 16][Math.floor(rng() * 3)] * 60 : 19 * 60 + [0, 0, 30, -30][Math.floor(rng() * 4)];
    return local + this.tzOf(ref.home) * 60;
  },
  tipLabel(ref) {
    const m = this.tipMinutes(ref) % (24 * 60);
    const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
    return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'} ET`;
  },
  sameGame(a, b) {
    return a && b && a.week === b.week && (a.phase || '') === (b.phase || '') &&
      ((a.home === b.home && a.away === b.away) || (a.home === b.away && a.away === b.home));
  },

  // ---------- Watching more than one game ----------
  inWatchList(ref) { return (this._watchQueue || []).some(r => this.sameGame(r, ref)); },
  toggleWatchList(ref) {
    const q = this._watchQueue || (this._watchQueue = []);
    const i = q.findIndex(r => this.sameGame(r, ref));
    if (i >= 0) q.splice(i, 1); else q.push(ref);
    this.renderWatchBar();
    if (document.getElementById('scheduleContainer')) this.updateScheduleTab && this.updateScheduleTab();
    this.renderDashWatch && this.renderDashWatch();
  },
  watchListJs(home, away, week, phase) { return `SimEngine.toggleWatchList({home:'${this.jsArg(home)}',away:'${this.jsArg(away)}',week:${week},phase:'${phase}'})`; },
  watchListBtn(home, away, week, phase) {
    const on = this.inWatchList({ home, away, week, phase });
    return `<button type="button" class="watch-add${on ? ' on' : ''}" onclick="event.stopPropagation();${this.watchListJs(home, away, week, phase)}" title="${on ? 'Remove from' : 'Add to'} your watch list" aria-label="${on ? 'Remove from' : 'Add to'} watch list">${on ? '✓' : '＋'}</button>`;
  },
  renderWatchBar() {
    if (typeof document === 'undefined' || !document.body) return;
    let bar = document.getElementById('watchBar');
    const q = (this._watchQueue || []).filter(r => this.upcomingSlate().some(x => this.sameGame(x, r)));
    this._watchQueue = q;
    if (!q.length) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'watchBar'; bar.className = 'watch-bar'; document.body.appendChild(bar); }
    const sorted = q.slice().sort((a, b) => this.tipMinutes(a) - this.tipMinutes(b));
    bar.innerHTML = `<div class="wb-games">${sorted.map(r => `<span class="wb-game"><small>${this.tipLabel(r)}</small><img src="${this.getTeamLogo(r.away)}" class="xs-logo" alt="">${this.esc(this.shortSchool ? this.shortSchool(r.away) : r.away)} <i>at</i> <img src="${this.getTeamLogo(r.home)}" class="xs-logo" alt="">${this.esc(this.shortSchool ? this.shortSchool(r.home) : r.home)}</span>`).join('')}</div>
      <div class="wb-actions"><button type="button" class="spot-secondary" onclick="SimEngine._watchQueue=[];SimEngine.renderWatchBar();SimEngine.updateScheduleTab&&SimEngine.updateScheduleTab();">Clear</button>
      <button type="button" class="spot-primary" onclick="SimEngine.watchGames(SimEngine._watchQueue.slice())">&#9654; Watch ${q.length} game${q.length === 1 ? '' : 's'}</button></div>`;
  },

  // Plays the slate once, then opens each chosen game from the tip in
  // tip-time order, with an "up next" card between them.
  async watchGames(refs) {
    if (typeof GameCenter === 'undefined' || this.isSimBusy() || !refs || !refs.length) return;
    const slate = this.upcomingSlate();
    const live = refs.filter(r => slate.some(x => this.sameGame(x, r)));
    if (!live.length) {
      if (this.isGamePlayed(refs[0])) return this.openGame(refs[0]);
      this.toast('Not on the next slate', 'Only games in the next week or round can be watched live.');
      return;
    }
    this._watchQueue = [];
    this.renderWatchBar();
    this._watching = true;
    this._liveHold = [];
    this.showSimSpinner(live.length > 1 ? `Heading to ${live.length} arenas…` : 'Heading to the arena…');
    await new Promise(r => setTimeout(r, 30));
    try {
      await this.simulateWeek();
    } catch (e) {
      console.error('Watching games:', e);
    } finally {
      await this.hideSimSpinner();
      this._watching = false;
    }
    const order = live.map(r => this.resolveGameRef(r)).filter(Boolean).sort((a, b) => this.tipMinutes(a) - this.tipMinutes(b));
    if (!order.length) { this.releaseLiveHold(); return; }
    this.closePlayerPage();
    const play = i => {
      const r = order[i];
      const game = this.buildLiveGame(r);
      const after = () => {
        if (i + 1 < order.length) {
          const n = order[i + 1];
          this.spotlight({ kicker: `Up next · ${this.tipLabel(n)}`, title: `${n.away} at ${n.home}`, logo: this.getTeamLogo(n.home),
            sub: `Game ${i + 2} of ${order.length} on your watch list.`,
            actions: [{ label: '▶ Watch', primary: true, fn: () => play(i + 1) }, { label: 'Skip the rest', fn: () => this.releaseLiveHold() }] }, { force: true });
        } else this.releaseLiveHold();
      };
      if (!game) { after(); return; }
      GameCenter.open(game, { mode: 'live', ticker: this.slateTicker(r, slate, order), onClose: after });
    };
    play(0);
  },

  // Watching one game also takes along anything already on the watch list.
  async watchGame(ref) {
    if (this.isGamePlayed(ref)) return this.openGame(ref);
    const queued = (this._watchQueue || []).filter(r => !this.sameGame(r, ref));
    return this.watchGames([ref].concat(queued));
  },

  openGame(ref, opts = {}) {
    if (typeof GameCenter === 'undefined') return;
    this.closePlayerPage();
    const resolved = this.resolveGameRef(ref);
    const game = resolved && this.buildLiveGame(resolved);
    if (!game) { this.toast('Box score unavailable', 'Box scores are kept for the current season.'); return; }
    GameCenter.open(game, { mode: opts.mode || 'final', onClose: opts.onClose || null });
  },

  // The next round's games as chips, each one watchable live.
  renderWatchStrip() {
    const next = this.state.confChampsDone && !this.state.ncaaDone ? this.upcomingNcaaGames() : [];
    if (!next.length) return '';
    const seeds = this.state.ncaaSelection ? this.selectionSeeds(this.state.ncaaSelection) : {};
    const sd = sc => (seeds[sc] ? seeds[sc].seed : '');
    const chip = g => `<button type="button" class="watch-chip" onclick="${this.watchGameJs(g.home, g.away, g.week, 'ncaa')}">
        <span class="wc-team"><img src="${this.getTeamLogo(g.home)}" alt="" class="xs-logo"><small>${sd(g.home)}</small>${this.esc(this.shortSchool(g.home))}</span>
        <span class="wc-vs">vs</span>
        <span class="wc-team"><img src="${this.getTeamLogo(g.away)}" alt="" class="xs-logo"><small>${sd(g.away)}</small>${this.esc(this.shortSchool(g.away))}</span>
        <span class="wc-play">&#9654;</span></button>`;
    const round = next[0].label.split(' · ')[0];
    return `<div class="watch-strip card">
      <div class="section-head"><div><h3 class="section-title">Watch live: ${this.esc(round === 'First Four' ? 'First Four & First Round' : round)}</h3>
      <p class="section-sub">Pick a game and it plays out from the tip; the rest of the round goes final around it.</p></div></div>
      <div class="watch-chips">${next.map(chip).join('')}</div>
    </div>`;
  },

  // Shorthand used by rendered markup.
  watchGameJs(home, away, week, phase) { return `SimEngine.watchGame({home:'${this.jsArg(home)}',away:'${this.jsArg(away)}',week:${week},phase:'${phase}'})`; },
  openGameJs(home, away, week, phase) { return `SimEngine.openGame({home:'${this.jsArg(home)}',away:'${this.jsArg(away)}',week:${week},phase:'${phase}'})`; },

  // --- Navigation history ---
  //
  // A single stack of visited views so one Back control works everywhere,
  // instead of each page needing its own bespoke "back to X" link. Each
  // entry knows how to restore itself.

  navStack: [],

  pushNav(entry) {
    // The dashboard is where every session starts, so it's always the
    // bottom of the stack: the very first click can already go back.
    if (this.navStack.length === 0 && !(entry.type === 'tab' && entry.key === 'dashTab')) {
      this.navStack.push({ type: 'tab', key: 'dashTab', label: 'Dashboard', scroll: 0 });
    }
    const top = this.navStack[this.navStack.length - 1];
    // Don't stack the same view twice in a row.
    if (top && top.type === entry.type && top.key === entry.key && top.view === entry.view) return;
    // Remember where you were on the page you're leaving, so Back returns
    // you to the same spot rather than the top.
    if (top && typeof window !== 'undefined') top.scroll = window.scrollY || 0;
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
      if (labelEl) labelEl.textContent = prev.label;
    }
  },

  navigateBack() {
    if (this.navStack.length < 2) return;
    this.navStack.pop();                       // leave the current view
    const prev = this.navStack[this.navStack.length - 1];
    this.restoreNav(prev);
    this.updateBackButton();
    const y = prev.scroll || 0;
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try { setTimeout(() => window.scrollTo(0, y), 0); } catch (e) { /* not available in every host */ }
    }
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
      this.state.teamPageView = entry.key ? (entry.view || 'team') : 'index';
      if (entry.view === 'season') this.state.teamPageSeason = entry.year;
      this.updateTeamTab();
      this.activateTabSilently('teamTab');
    } else if (entry.type === 'history') {
      this.state.historySeasonView = entry.year || null;
      this.activateTabSilently('historyTab');
      if (entry.team) this.showHistoricalTeam(entry.team, entry.year, true);
      else this.updateHistoryTab();
    } else if (entry.type === 'offseason') {
      this.openOffseason(entry.key, true);
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
    this._countedTeam = null;
    this.state.teamPageSelection = school;
    this.state.teamPageView = school ? 'team' : 'index';
    this.updateTeamTab();
    this.pushNav(school ? { type: 'team', key: school, view: 'team', label: school }
      : { type: 'team', key: '', view: 'index', label: 'All Teams' });
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
    this.pushNav({ type: 'team', key: '', view: 'index', label: 'All Teams' });
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
      if (this._teamIndexQuery) this.filterTeamIndex(this._teamIndexQuery);
      return;
    }

    if (this.state.teamPageView === 'season' && this.state.teamPageSeason != null && this.state.teamPageSeason !== this.state.year) {
      container.innerHTML = this.renderTeamSeason(team, this.state.teamPageSeason);
      container.classList.remove('fresh');
      return;
    }
    if (this.state.teamPageView === 'history') container.innerHTML = this.renderTeamHistoryView(team);
    else if (this.state.teamPageView === 'gamelog') container.innerHTML = this.renderTeamGameLog(team);
    else {
      container.innerHTML = this.renderTeamDetail(team);
      // The page animates in (and numbers roll up) when a team is opened,
      // not every time it refreshes or re-sorts.
      const fresh = this._countedTeam !== team.school;
      container.classList.toggle('fresh', fresh);
      if (fresh && typeof Cutscene !== 'undefined' && !this.reducedMotion()) Cutscene.countUp(container);
      this._countedTeam = team.school;
    }
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

    const q = this._teamIndexQuery || '';
    let html = `<div class="section-head page-head"><div><h2 class="section-title">Teams</h2><p class="section-sub">All ${this.state.teams.length} Division I programs by conference. Pick a school for its roster, stats and schedule.</p></div>
      <div class="filters-container"><input type="search" id="teamIndexSearch" class="filter-select search-input" placeholder="Search teams or conferences" aria-label="Search teams or conferences"
        value="${this.esc(q)}" oninput="SimEngine.filterTeamIndex(this.value)" onkeydown="if(event.key==='Enter')SimEngine.openFirstTeamMatch()"></div></div>
      <p class="empty-table-msg" id="teamIndexEmpty" style="display:none">No team matches that search.</p>`;
    Object.keys(byConf).sort().forEach(conf => {
      const teams = byConf[conf].sort((a, b) => a.school.localeCompare(b.school));
      html += `<div class="conf-section" data-conf="${this.esc(conf.toLowerCase())}">
        <div class="conf-section-header">
          ${this.getConferenceLogoImg(conf, 'conf-logo')}
          <h4 class="conf-section-title">${conf}</h4>
          <span class="sub-text-sm">${teams.length} teams</span>
        </div>
        <div class="conf-team-grid">`;
      teams.forEach(t => {
        const safe = t.school.replace(/'/g, "\\'");
        const sd = t.simData || {};
        const rec = (sd.wins || sd.losses) ? `${sd.wins || 0}-${sd.losses || 0}` : '';
        const rank = t.apRank ? `<span class="team-tile-rank">${t.apRank}</span>` : '';
        html += `<button class="team-index-card team-tile" data-name="${this.esc(t.school.toLowerCase())}" onclick="SimEngine.setTeamPageSelection('${safe}')" title="${this.esc(t.school)}">
          ${rank}<img src="${this.getTeamLogo(t.school)}" class="team-tile-logo" alt="">
          <span class="team-index-name">${t.school}</span>
          ${rec ? `<span class="team-tile-rec">${rec}</span>` : ''}
        </button>`;
      });
      html += `</div></div>`;
    });
    return html;
  },

  // Narrows the team index as you type: a school's name, or a conference
  // (which keeps all of its teams).
  filterTeamIndex(q) {
    this._teamIndexQuery = String(q || '');
    const s = this._teamIndexQuery.trim().toLowerCase();
    const root = document.getElementById('teamPageContainer');
    if (!root) return;
    let shown = 0;
    root.querySelectorAll('.conf-section').forEach(sec => {
      const confHit = s && (sec.getAttribute('data-conf') || '').includes(s);
      let n = 0;
      sec.querySelectorAll('.team-tile').forEach(b => {
        const hit = !s || confHit || (b.getAttribute('data-name') || '').includes(s);
        b.style.display = hit ? '' : 'none';
        if (hit) n++;
      });
      sec.style.display = n ? '' : 'none';
      shown += n;
    });
    const empty = document.getElementById('teamIndexEmpty');
    if (empty) empty.style.display = shown ? 'none' : '';
  },
  openFirstTeamMatch() {
    const t = this.matchTeam(this._teamIndexQuery);
    if (t) this.setTeamPageSelection(t.school);
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

  // The team statistics grids (box score and advanced), each number with
  // its national rank underneath.
  teamStatGrids(st, rk = {}) {
    const statCell = (label, value, rankKey) => `
      <div class="team-stat-cell">
        <span class="team-stat-label">${label}</span>
        <span class="team-stat-value"${/^-?\d/.test(String(value)) ? ` data-count="${value}"` : ''}>${value}</span>
        <span class="team-stat-rank">${rk[rankKey] ? this.ordinal(rk[rankKey]) : '—'}</span>
      </div>`;
    return `      <div class="flex-between wrap-gap mb-1">
        <h3 class="uppercase-title">Team Statistics</h3>
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
  },

  renderTeamDetail(team) {
    const safe = team.school.replace(/'/g, "\\'");
    const allRows = this.computeAllTeamStats();
    const row = allRows.find(r => r.school === team.school) || { stats: this.computeTeamStats(team), ranks: {} };
    const st = row.stats, rk = row.ranks || {};
    const apTag = (this.state.regularSeasonDone && team.apRank && team.apRank <= 25)
      ? `<span class="ap-rank-tag">AP #${team.apRank}</span>` : '';

    const pollRank = this.pollRankOf(team);
    let html = `
      <div class="team-header team-hero">
        <img src="${this.getTeamLogo(team.school)}" class="team-hero-mark" alt="" aria-hidden="true">
        <img src="${this.getTeamLogo(team.school)}" class="team-logo" alt="">
        <div class="team-title-block">
          <span class="modal-team-year">
            ${this.getConferenceLogoImg(team.conference, 'conf-logo-sm')} ${team.conference}
            &bull; ${this.state.year}-${(this.state.year + 1).toString().slice(2)}
          </span>
          <div class="modal-team-title-wrap">
            <h2 class="modal-team-name">${team.school}</h2>${apTag || (pollRank ? `<span class="ap-rank-tag">No. ${pollRank}</span>` : '')}
          </div>
          <span class="team-hero-meta">${team.simData.wins}-${team.simData.losses} &middot; ${team.simData.confWins}-${team.simData.confLosses} conference</span>
        </div>
        <div class="team-hero-actions">
          <button class="outline-btn btn-sm" onclick="SimEngine.setTeamPageView('gamelog')">Game log</button>
          <button class="outline-btn btn-sm" onclick="SimEngine.setTeamPageView('history')">Team History</button>
          <button class="outline-btn btn-sm" onclick="SimEngine.backToTeamIndex()">All teams</button>
          ${this.teamFinderHtml()}
        </div>
      </div>

      ${team.coach ? `<div class="coach-card mb-1-5">
        <div class="coach-head">
          <span class="coach-label">Head Coach</span>
          <span class="coach-name">${this.esc(team.coach.name)}</span>
          <span class="coach-meta">${this.coachMetaLine(team)}</span>
        </div>
        ${team.coachTags && team.coachTags.length ? `<div class="coach-tags">${team.coachTags.map(t => `<span class="coach-tag">${t}</span>`).join('')}</div>` : ''}
        ${team.coach.style ? `<p class="coach-style">${team.coach.style}</p>` : ''}
      </div>` : ''}

      <div class="team-stats-grid mb-1-5${team.prestige != null ? ' five' : ''}">
        <div class="stat-box"><span class="stat-label">RECORD</span><span class="stat-value">${team.simData.wins}-${team.simData.losses}</span><span class="sub-text-sm">(${team.simData.confWins}-${team.simData.confLosses} conf)</span></div>
        ${team.prestige != null ? `<div class="stat-box"><span class="stat-label">PRESTIGE</span><span class="stat-value">${team.prestige}</span><span class="sub-text-sm">${Prestige.label(team.prestige, team.prestigeHistory)}${team.prestigeHistory != null && Math.abs(team.prestige - team.prestigeHistory) >= 3 ? ` (${team.prestige > team.prestigeHistory ? '▲' : '▼'} from ${team.prestigeHistory})` : ''}</span></div>` : ''}
        <div class="stat-box"><span class="stat-label">PRESEASON</span><span class="stat-value">${team.preseasonRank ? '#' + team.preseasonRank : '—'}</span><span class="sub-text-sm">roster strength</span></div>
        <div class="stat-box"><span class="stat-label">SOS</span><span class="stat-value">${team.sosRank ? this.ordinal(team.sosRank) : '—'}</span><span class="sub-text-sm">of ${this.state.teams.length}</span></div>
        <div class="stat-box"><span class="stat-label">GAMES</span><span class="stat-value">${st.gp}</span><span class="sub-text-sm">played</span></div>
      </div>

      <div class="season-result-banner mb-1-5">${this.getSeasonResultText(team)}</div>

      ${st.gp ? this.teamStatGrids(st, rk) : `<div class="card empty-card"><h3 class="uppercase-title">Team Statistics</h3><p class="sub-text">Team and national-rank numbers fill in after the first week of games.</p></div>`}
    `;

    html += this.renderTeamPlayerTable(team, 'box');
    html += this.renderTeamPlayerTable(team, 'adv');

    return html;
  },

  // A past season's team, laid out like a current team page: the season's
  // record and result, coach, team stats with national ranks, and the
  // roster's box score and advanced lines.
  renderTeamSeason(team, year) {
    const d = this.teamSeasonData(team.school, year);
    const h = d.hist || {};
    const label = `${year}-${(year + 1).toString().slice(2)}`;
    const seasons = this.teamSeasons(team.school);
    const sel = `<select class="filter-select" aria-label="Season" onchange="SimEngine.goToTeamSeason('${this.jsArg(team.school)}', this.value)">
      ${seasons.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}-${(y + 1).toString().slice(2)}${y === this.state.year ? ' (now)' : ''}</option>`).join('')}</select>`;
    let result = 'Season record';
    if (h.wonNationalTitle) result = 'Won the National Championship';
    else if (h.ncaaSeed) result = `NCAA Tournament &middot; No. ${h.ncaaSeed} seed${h.ncaaWins ? ` &middot; ${h.ncaaWins} win${h.ncaaWins === 1 ? '' : 's'}` : ''}${h.wonConfTourney ? ' &middot; conference tournament champions' : ''}`;
    else if (h.wonConfTourney) result = 'Conference tournament champions';
    else if (h.wins != null) result = 'Missed the NCAA Tournament';
    const conf = d.conf || team.conference;
    const pseudo = { school: team.school, past: true, roster: d.players };
    const st = d.stats;
    return `
      <div class="team-header team-hero">
        <img src="${this.getTeamLogo(team.school)}" class="team-hero-mark" alt="" aria-hidden="true">
        <img src="${this.getTeamLogo(team.school)}" class="team-logo" alt="">
        <div class="team-title-block">
          <span class="modal-team-year">${this.getConferenceLogoImg(conf, 'conf-logo-sm')} ${this.esc(conf)} &bull; ${label}</span>
          <div class="modal-team-title-wrap">
            <h2 class="modal-team-name">${team.school}</h2>${h.apRank ? `<span class="ap-rank-tag">AP #${h.apRank}</span>` : ''}
          </div>
          <span class="team-hero-meta">${h.wins != null ? `${h.wins}-${h.losses} &middot; ${h.confWins}-${h.confLosses} conference` : 'Record not on file'}</span>
        </div>
        <div class="team-hero-actions">
          ${sel}
          <button class="outline-btn btn-sm" onclick="SimEngine.goToTeamPage('${this.jsArg(team.school)}')">${this.state.year}-${(this.state.year + 1).toString().slice(2)} team</button>
          <button class="outline-btn btn-sm" onclick="SimEngine.setTeamPageView('history')">Team History</button>
        </div>
      </div>
      ${d.coach ? `<div class="coach-card mb-1-5"><div class="coach-head"><span class="coach-label">Head Coach</span><span class="coach-name">${this.esc(d.coach)}</span></div></div>` : ''}
      <div class="team-stats-grid mb-1-5">
        <div class="stat-box"><span class="stat-label">RECORD</span><span class="stat-value">${h.wins != null ? `${h.wins}-${h.losses}` : '—'}</span><span class="sub-text-sm">${h.wins != null ? `(${h.confWins}-${h.confLosses} conf)` : ''}</span></div>
        <div class="stat-box"><span class="stat-label">AP RANK</span><span class="stat-value">${h.apRank ? '#' + h.apRank : '—'}</span><span class="sub-text-sm">final poll</span></div>
        <div class="stat-box"><span class="stat-label">PRESEASON</span><span class="stat-value">${d.preseason ? '#' + d.preseason : '—'}</span><span class="sub-text-sm">roster strength</span></div>
        <div class="stat-box"><span class="stat-label">SOS</span><span class="stat-value">${d.sos ? this.ordinal(d.sos) : '—'}</span><span class="sub-text-sm">of ${this.state.teams.length}</span></div>
      </div>
      <div class="season-result-banner mb-1-5">${result}</div>
      ${st && st.gp ? this.teamStatGrids(st, d.ranks) : `<div class="card empty-card"><h3 class="uppercase-title">Team Statistics</h3><p class="sub-text">Team totals weren't kept for this season (it was played before team seasons were saved). The players' own lines are below.</p></div>`}
      ${this.renderTeamPlayerTable(pseudo, 'box')}
      ${this.renderTeamPlayerTable(pseudo, 'adv')}`;
  },

  // A search box for jumping straight to another team's page.
  teamFinderHtml() {
    const names = this.state.teams.map(t => t.school).sort((a, b) => a.localeCompare(b));
    if (!document.getElementById('teamFinderList')) {
      const dl = document.createElement('datalist');
      dl.id = 'teamFinderList';
      document.body.appendChild(dl);
    }
    const dl = document.getElementById('teamFinderList');
    if (dl.childElementCount !== names.length) dl.innerHTML = names.map(n => `<option value="${this.esc(n)}">`).join('');
    return `<input type="search" class="filter-select team-finder" list="teamFinderList" placeholder="Find a team" aria-label="Find a team"
      onchange="SimEngine.findTeamFromSearch(this.value)" onkeydown="if(event.key==='Enter')SimEngine.findTeamFromSearch(this.value)">`;
  },
  findTeamFromSearch(q) {
    const t = this.matchTeam(q);
    if (t) this.setTeamPageSelection(t.school);
  },
  // The team a search means: an exact name, else the one starting with it,
  // else the first containing it.
  matchTeam(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return null;
    const teams = this.state.teams;
    return teams.find(t => t.school.toLowerCase() === s) || teams.find(t => t.school.toLowerCase().startsWith(s))
      || teams.find(t => t.school.toLowerCase().includes(s)) || null;
  },

  // Full player table for a single team — 'box' for box score stats,
  // 'adv' for the advanced metrics, matching the league-wide leaderboards.
  renderTeamPlayerTable(team, mode) {
    const cols = mode === 'box'
      ? [['jersey','#'],['name','Player'],['pos','Pos'],['class','Cl'],['gp','GP'],['gs','GS'],['mpg','MPG'],['ppg','PPG'],
         ['oreb','OREB'],['rpg','RPG'],['apg','APG'],['stl','SPG'],['blk','BPG'],['tov','TOV'],['pf','PF'],
         ['fgm','FGM'],['fga','FGA'],['fgPct','FG%'],['twoPm','2P'],['twoPa','2PA'],['twoPPct','2P%'],
         ['threePm','3PM'],['threePa','3PA'],['threePPct','3P%'],
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
        if (id === 'name') return team.past && !this.findPlayerRef(p.id)
          ? `<td>${this.esc(p.name)}</td>`
          : `<td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeId}')">${p.name}</span></td>`;
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
        <tbody>${rows || `<tr><td colspan="${cols.length}" class="empty-table-msg">${team.past ? 'No player lines were kept for this season.' : 'No games played yet.'}</td></tr>`}</tbody>
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
    // Played games come from the team's own logs (so conference and NCAA
    // tournament games are included); the rest of the schedule follows.
    const logs = (team.roster || []).map(p => p.gameLog || []).sort((x, y) => y.length - x.length)[0] || [];
    const upcoming = !this.state.regularSeasonDone ? (this.state.week || 0) + 1 : null;
    const typeOf = ph => ph === 'ncaa' ? 'NCAA' : ph === 'conftourney' ? 'Conf. Tourney' : ph === 'conf' ? 'Conf' : 'Non-Conf';
    let rows = '';
    logs.forEach(l => {
      const ref = this.gameRefFromLog(team.school, l);
      const d = l.phase === 'ncaa' || l.phase === 'conftourney' ? this.describeGame(ref).label.replace(/^NCAA Tournament · /, '').replace(/ · .*Region$/, '') : `Week ${l.week}`;
      rows += `<tr class="game-row" onclick="${this.openGameJs(ref.home, ref.away, ref.week, ref.phase)}" title="Box score and play-by-play">
        <td class="bold-sub-text">${this.esc(d)}</td>
        <td class="sub-text-sm">${l.phase === 'ncaa' || l.phase === 'conftourney' || l.isHome ? 'vs' : '@'}</td>
        <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(l.opponent)}" class="xs-logo"><span>${this.esc(l.opponent)}</span></div></td>
        <td class="sub-text-sm">${typeOf(l.phase)}</td>
        <td class="${l.won ? 'win-text' : 'loss-text'}">${l.won ? 'W' : 'L'}</td>
        <td class="bold-text">${l.teamScore}-${l.oppScore} <span class="game-link-label">Box score</span></td>
      </tr>`;
    });
    this.state.schedule
      .filter(g => !g.played && (g.home === team.school || g.away === team.school))
      .sort((x, y) => x.week - y.week)
      .forEach(g => {
        const isHome = g.home === team.school;
        const opp = isHome ? g.away : g.home;
        rows += `<tr>
          <td class="bold-sub-text">Week ${g.week}</td>
          <td class="sub-text-sm">${isHome ? 'vs' : '@'}</td>
          <td><div class="team-cell-wrap clickable-school" onclick="SimEngine.setTeamPageSelection('${this.jsArg(opp)}')"><img src="${this.getTeamLogo(opp)}" class="xs-logo"><span>${this.esc(opp)}</span></div></td>
          <td class="sub-text-sm">${g.isConf ? 'Conf' : 'Non-Conf'}</td>
          <td class="sub-text-sm">—</td>
          <td>${g.week === upcoming ? `<button type="button" class="watch-btn sm" onclick="${this.watchGameJs(g.home, g.away, g.week, g.isConf ? 'conf' : 'nonconf')}">&#9654; Watch live</button>` : '<span class="sub-text-sm">Not yet played</span>'}</td>
        </tr>`;
      });

    return `
      <button class="outline-btn mb-1" onclick="SimEngine.setTeamPageView('team')">&larr; Back to ${team.school}</button>
      <div class="team-header">
        <img src="${this.getTeamLogo(team.school)}" class="team-logo">
        <div class="team-title-block"><h2 class="modal-team-name">${team.school}</h2><span class="modal-team-year">Game Log</span></div>
      </div>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Game</th><th></th><th>Opponent</th><th>Type</th><th>W/L</th><th>Score</th></tr></thead>
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
      rows += `<tr class="game-row" onclick="SimEngine.goToTeamSeason('${this.jsArg(team.school)}', ${h.year})" title="The ${h.year}-${(h.year + 1).toString().slice(2)} team: roster and stats">
        <td class="bold-text"><span class="clickable-school">${h.year}-${(h.year + 1).toString().slice(2)}</span></td>
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
      <p class="sub-text-sm mb-1">Pick a season for that team's roster and stats.</p>
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

  setTeamStatsSearch(q) {
    this._teamStatsQuery = String(q || '');
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
         ['twoPm','2P'],['twoPa','2PA'],['twoPPct','2P%'],
         ['threePm','3PM'],['threePa','3PA'],['threePPct','3P%'],['ftm','FTM'],['fta','FTA'],['ftPct','FT%']];

    const tq = String(this._teamStatsQuery || '').trim().toLowerCase();
    let rows = this.computeAllTeamStats()
      .filter(r => this.matchesConfFilter(r.conference, this.state.teamStatsConfFilter))
      .filter(r => !tq || r.school.toLowerCase().includes(tq) || String(r.conference || '').toLowerCase().includes(tq));

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
      body.innerHTML = `<tr><td colspan="${cols.length}" class="empty-table-msg">${tq ? 'No team matches that search.' : 'No teams match this filter.'}</td></tr>`;
      return;
    }

    body.innerHTML = rows.map(r => '<tr>' + cols.map(([id]) => {
      if (id === 'school') {
        return `<td><div class="team-cell-wrap clickable-school" onclick="SimEngine.goToTeamPage('${r.school.replace(/'/g, "\\'")}')">
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
    // Enrolled: on a roster as this same recruit (by id, or by name and
    // class once merged onto a roster-sheet entry).
    const enrolledIds = new Set(), enrolledKeys = new Set();
    this.state.teams.forEach(t => (t.roster || []).forEach(p => { enrolledIds.add(p.id); if (p.recClassYear) enrolledKeys.add(this.personKey(p)); }));

    // Anyone who has already used up their college eligibility — declared
    // for the draft or graduated — must never re-enter the recruit pool.
    // Without this, a player removed from his roster at the draft simply
    // stopped looking "enrolled", got recycled as an incoming recruit, and
    // re-enrolled at the same school: which is exactly why pinned top
    // prospects kept showing up in school the following season.
    this.state.recruits = all.filter(r => !r.fromOthers &&
      (!r.recClassYear || r.recClassYear <= maxYear) &&
      !r.enrolled && !enrolledIds.has(r.id) && !enrolledKeys.has(this.personKey(r)) &&
      !this.isDepartedRecruit(r));
  },

  // --- Player development ---
  //
  // Offseason growth used to be a flat random 0-3 for every player, which
  // meant a senior who never left the bench improved at the same rate as a
  // blue-chip freshman who played 32 minutes a night — and ratings simply
  // inflated across the board every year. Development now depends on the
  // four things that actually drive it: how young a player is, how much
  // headroom he has, whether he actually played, and whether he
  // outperformed what his rating implied.

  // Growth curve by the class a player is LEAVING. The freshman-to-
  // sophomore jump is far and away the largest; by the senior year most
  // players are close to what they'll be.
  CLASS_GROWTH: { FR: 4.4, SO: 3.0, JR: 1.7, SR: 0.7, GR: 0.3 },

  // When the roster sheet doesn't supply a Potential value, infer one.
  // Recruiting pedigree is the best available proxy for ceiling: a
  // top-ten recruit is expected to become a far better player than an
  // unranked one at the same current rating.
  derivePotential(player) {
    const rating = parseFloat(player.rating) || 70;
    const rsci = parseFloat(player.rsci) || null;
    let ceiling;
    if (rsci) {
      if (rsci <= 10) ceiling = rating + 13;
      else if (rsci <= 30) ceiling = rating + 10;
      else if (rsci <= 75) ceiling = rating + 8;
      else if (rsci <= 150) ceiling = rating + 6;
      else ceiling = rating + 5;
    } else {
      ceiling = rating + 5;
    }
    // Younger players have more of their development still ahead of them.
    const classBonus = { FR: 4, SO: 2, JR: 0.5, SR: 0, GR: 0 }[player.class] || 0;
    return Math.min(99, Math.round(ceiling + classBonus));
  },

  developPlayer(player) {
    const before = parseFloat(player.rating) || 70;
    const cls = player.class || 'SO';
    const st = player.stats || {};

    const potential = (player.potential && player.potential > before)
      ? player.potential
      : this.derivePotential(player);

    // How much room is left between where he is and his ceiling. A player
    // already at his ceiling stops improving and can slip slightly.
    const headroom = potential - before;
    // Headroom shapes growth but shouldn't dominate it, or high-rated
    // starters would develop more slowly than deep-bench players.
    const headroomFactor = Math.max(0.25, Math.min(1.30, 0.45 + headroom / 16));

    // Development needs reps. A player who barely got on the floor
    // improves far less than one who played real minutes — but the curve
    // flattens, so 34 minutes isn't meaningfully better than 26.
    // Weighted so playing time genuinely drives development: a player who
    // sat all year improves far less than one who started, even though the
    // starter has less headroom left to close.
    const mpg = parseFloat(st.mpg) || 0;
    const reps = 0.18 + 0.82 * Math.min(1, mpg / 22);

    // Did he outplay his rating? BPM is compared against what that rating
    // would have predicted, so exceeding expectations accelerates growth
    // and badly underperforming slows it.
    const actualBpm = parseFloat(st.bpm) || 0;
    const impliedBpm = ((before - 74) * 0.50) + Math.max(0, before - 90) * 0.85;
    const overperformance = Math.max(-4, Math.min(5, actualBpm - impliedBpm));

    const base = (this.CLASS_GROWTH[cls] || 1.5) * reps * headroomFactor;
    const merit = overperformance * 0.42;

    // Noise, plus rare genuine breakouts and stagnations.
    let noise = (Math.random() + Math.random() - 1) * 2.2;
    const roll = Math.random();
    if (roll < 0.035) noise += 3 + Math.random() * 4;        // leap
    else if (roll < 0.075) noise -= 3 + Math.random() * 3.5; // stalled

    let growth = base + merit + noise;

    // A player can't blow straight past his ceiling in one offseason, and
    // nobody falls off a cliff.
    growth = Math.max(-5, Math.min(headroom > 0 ? headroom + 2 : 1.5, growth));

    const after = Math.max(45, Math.min(99, Math.round(before + growth)));
    player.rating = after;
    player.potential = potential;

    // Keep a trail so a profile can show how a player has grown.
    if (!player.ratingHistory) player.ratingHistory = [];
    player.ratingHistory.push({ year: this.state.year, from: before, to: after });
    if (player.ratingHistory.length > 8) player.ratingHistory.shift();

    return after - before;
  },

  // ---------- Publishing the official universe ----------
  //
  // The NCAA RP runs in the owner's browser; the recruiting page and the
  // Draft RP are read by everyone. "Publish universe" writes a compact
  // snapshot (data/universe.json in the repo) that those pages read, so
  // every visitor sees the same portal, draft and college careers.
  UNIVERSE_VERSION: 1,

  seasonLabelFor(year) { return `${year}-${String(year + 1).slice(2)}`; },

  // Player record without game logs, split stat tables or sim internals.
  slimPlayer(p) {
    if (!p) return null;
    return {
      id: p.id, name: p.name, school: p.school, conference: p.conference, pos: p.pos,
      class: this.normalizeClassStanding(p.class) || p.class, ht: p.ht, wt: p.wt,
      hometown: p.hometown, hs: p.hs, jersey: p.jersey, rsci: p.rsci || null,
      rating: p.rating, collegeHistory: p.collegeHistory || [p.school],
      stats: this.slimStats(p.stats), draft: p.draft || null,
      predraft: p.predraft && p.predraft.year === this.upcomingDraftYear() ? p.predraft : null,
      bigGameStock: p.bigGameStock || 0, bigGames: (p.bigGames || []).slice(-6),
      // So the Draft RP's board weighs upside the same way this one does.
      potentialGrade: p.potentialGrade || null,
      traits: p.traits || null,
      isPro: !!p.isPro, draftClass: p.draftClass || null, dob: p.dob || null,
      // The sheet's Draft column, so the Draft RP's mock agrees with draft night.
      scriptedDraft: this.scriptedDraftFor(p) || null
    };
  },

  // Season totals (totPts, totMin…) are only used to build the averages,
  // so they're left out of the published file.
  slimStats(st) {
    if (!st) return null;
    const out = {};
    Object.keys(st).forEach(k => { if (!/^tot[A-Z]/.test(k) && typeof st[k] !== 'object') out[k] = st[k]; });
    return out;
  },

  seasonLine(year, school, cls, st) {
    st = st || {};
    return {
      year, season: this.seasonLabelFor(year), school, class: cls,
      gp: st.gp || 0, mpg: st.mpg, ppg: st.ppg, rpg: st.rpg, apg: st.apg,
      spg: st.stl, bpg: st.blk, fgPct: st.fgPct, threePPct: st.threePPct, bpm: st.bpm
    };
  },

  buildUniverseSnapshot() {
    const year = this.state.year;
    const draftYear = this.upcomingDraftYear();
    const players = this.draftPool();
    const byId = {};
    players.forEach(p => { byId[p.id] = p; });

    // Where the upcoming draft stands.
    const thisDraft = (this.state.draftHistory || []).find(d => d.year === draftYear);
    const declared = this.state.draftDeclarations || [];
    const cycle = this.state.draftCycle && this.state.draftCycle.year === draftYear ? this.state.draftCycle : null;
    const stage = !this.state.ncaaDone ? 'live' : cycle ? cycle.stage : thisDraft ? 'complete' : declared.length ? 'declared' : 'live';
    const snapshotById = {};
    (this.state.lastDeclarations || []).forEach(d => { snapshotById[d.id] = d; });
    let pool;
    if (stage === 'live') {
      const board = this.computeDraftBigBoard(150).map(e => e.player);
      // Players the sheet has going in this draft are always included, so
      // the Draft RP's mock can hold their pick before they've played.
      const onBoard = new Set(board.map(p => p.id));
      players.forEach(p => {
        const sd = this.scriptedDraftFor(p);
        if (sd && sd.year === draftYear && !onBoard.has(p.id)) board.push(p);
      });
      pool = board.map(p => this.slimPlayer(p));
    } else {
      const source = stage === 'complete' && (this.state.lastDeclarations || []).length ? this.state.lastDeclarations : declared;
      pool = source.map(d => this.slimPlayer(byId[d.id] || snapshotById[d.id] || d)).filter(Boolean);
    }

    // College careers for everyone in the recruiting database, so the
    // recruiting page can follow a recruit into the sim and the draft.
    const recruitNames = new Set((this.state.allRecruits || []).map(r => String(r.name || '').trim().toLowerCase()).filter(Boolean));
    const alumni = [];
    const addAlum = (p, active) => {
      if (!p || !recruitNames.has(String(p.name || '').trim().toLowerCase())) return;
      const seasons = (p.seasonHistory || []).map(h => this.seasonLine(h.year, h.school, h.class, h.stats));
      if (active && p.stats && p.stats.gp > 0 && !seasons.some(s => s.year === year)) {
        seasons.push(this.seasonLine(year, p.school, this.normalizeClassStanding(p.class) || p.class, p.stats));
      }
      alumni.push({
        name: p.name, pos: p.pos, school: active ? p.school : null,
        class: active ? (this.normalizeClassStanding(p.class) || p.class) : null,
        active, collegeHistory: p.collegeHistory || (p.school ? [p.school] : []),
        seasons, draft: p.draft || null
      });
    };
    players.forEach(p => addAlum(p, true));
    const activeIds = new Set(players.map(p => p.id));
    (this.state.departedArchive || []).forEach(p => { if (!activeIds.has(p.id)) addAlum(p, false); });

    return {
      version: this.UNIVERSE_VERSION,
      publishedAt: new Date().toISOString(),
      season: {
        year, label: this.seasonLabelFor(year), phase: this.state.phase, week: this.state.week,
        ncaaDone: !!this.state.ncaaDone
      },
      teams: (this.state.teams || []).map(t => ({
        school: t.school, conference: t.conference,
        wins: t.simData ? t.simData.wins : 0, losses: t.simData ? t.simData.losses : 0,
        confWins: t.simData ? t.simData.confWins : 0, confLosses: t.simData ? t.simData.confLosses : 0,
        apRank: t.apRank || null
      })),
      draft: {
        year: draftYear, stage, pool,
        results: thisDraft ? thisDraft.picks : [],
        lottery: thisDraft ? thisDraft.lottery : null,
        league: this.getNbaLeague(draftYear),
        // Where the pre-draft process stands, for the Draft RP's combine,
        // lottery and workout views.
        cycle: cycle ? { year: cycle.year, stage: cycle.stage, lottery: cycle.lottery || null, interest: cycle.interest || null,
          combine: cycle.combine || null, workouts: cycle.workouts || null, deadline: cycle.deadline || null } : null,
        returning: cycle && ['deadline', 'complete'].includes(cycle.stage) ? (this.state.returningPlayers || []) : [],
        history: (this.state.draftHistory || []).map(d => ({ year: d.year, picks: d.picks, lottery: d.lottery, board: d.board || null }))
      },
      transfers: (this.state.transferHistory || []).map(t => ({
        name: t.name, pos: t.pos, class: t.class, rating: t.rating, ppg: t.ppg,
        from: t.from, to: t.to, season: t.season, scheduled: !!t.scheduled, reason: t.reason
      })),
      alumni,
      // Recruits whose commitment the sim moved (a program ran out of
      // scholarships), so the recruiting page shows where they really went.
      recruitFlips: (this.state.recruitFlips || []).map(f => ({ name: f.name, classYear: f.classYear, from: f.from, to: f.to, year: f.year })),
      // The high-school classes as the sim has them today: ranks, grades,
      // commitments and the lists still being decided (see recruit-live.js).
      recruitingLive: this.liveRecruitingSnapshot(),
      summer: this.summerSnapshot(),
      champions: (this.state.seasonHistory || []).map(h => ({
        year: h.year, season: this.seasonLabelFor(h.year),
        champion: h.champion && (h.champion.school || h.champion), runnerUp: h.runnerUp && (h.runnerUp.school || h.runnerUp),
        npoy: h.npoy || null
      }))
    };
  },

  async publishUniverse() {
    const snapshot = this.buildUniverseSnapshot();
    const json = JSON.stringify(snapshot);
    await this.saveStateToDB();   // keeps the NBA league generated for the snapshot
    // With accounts on, an admin publishes straight to the site.
    if (typeof Cloud !== 'undefined' && Cloud.enabled && Cloud.admin) {
      const note = document.getElementById('publishNote');
      if (note) { note.style.display = ''; note.textContent = 'Publishing…'; }
      try {
        await Cloud.publishUniverse(json);
        if (note) note.innerHTML = `Published (${snapshot.season.label}). The Draft RP, Recruiting page and RP Hub now show this save to everyone.`;
      } catch (e) {
        if (note) note.textContent = `Couldn't publish: ${e.message || e}`;
      }
      return snapshot;
    }
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'universe.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { console.error('Publish failed', e); }
    const note = document.getElementById('publishNote');
    if (note) {
      note.style.display = '';
      note.innerHTML = `<b>universe.json</b> downloaded (${(json.length / 1024).toFixed(0)} KB, ${snapshot.season.label}). Upload it to the repo's <b>data</b> folder to update the recruiting page and Draft RP for everyone.`;
    }
    return snapshot;
  },

  // ---------- Accounts (see cloud.js) ----------

  cloudSummary() { return `${this.seasonLabelFor(this.state.year)} · ${this.phaseLabelShort()}`; },

  // Shows the account part of the menu, and decides who sees Publish:
  // with accounts on, only admins.
  renderCloudMenu() {
    if (typeof Cloud === 'undefined' || typeof document === 'undefined') return;
    const group = document.getElementById('cloudGroup'), pub = document.getElementById('publishGroup');
    const note = document.getElementById('cloudNote'), how = document.getElementById('publishHow');
    if (!Cloud.enabled) { if (group) group.style.display = 'none'; if (pub) pub.style.display = ''; return; }
    if (group) group.style.display = '';
    if (pub) pub.style.display = Cloud.admin ? '' : 'none';
    if (how && Cloud.admin) how.textContent = 'Makes this save the official BYTHERIM universe: the Draft RP, Recruiting page and RP Hub show its players, rankings, draft and transfers to every visitor. Other people\'s NCAA RP saves aren\'t touched.';
    ['cloudSaveBtn', 'cloudLoadBtn'].forEach(id => { const b = document.getElementById(id); if (b) b.style.display = Cloud.user ? '' : 'none'; });
    const auto = this.autosaveOn();
    const last = this._lastAutosave ? new Date(this._lastAutosave).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
    if (note && Cloud.user && auto && this._autosaveBlocked) {
      note.innerHTML = `Signed in as <b>${this.esc(Cloud.user.email)}</b>. Your account has a newer save from another device, so autosave is paused. Load it, or use Save to my account to replace it with this one.`;
    } else if (note) note.innerHTML = Cloud.user
      ? `Signed in as <b>${this.esc(Cloud.user.email)}</b>. ${auto ? `Autosave is on${last ? `: last saved to your account at ${last}` : ''}.` : 'Autosave is off; use Save to my account.'}`
      : 'Sign in with Google (top right) to keep your save and draft boards in your account.';
    const tog = document.getElementById('autosaveToggle');
    if (tog) { tog.style.display = Cloud.user ? '' : 'none'; tog.textContent = `Autosave: ${auto ? 'On' : 'Off'}`; }
  },

  async cloudSave(quiet) {
    if (typeof Cloud === 'undefined' || !Cloud.user || typeof db === 'undefined' || !db.leagueState) return;
    const note = document.getElementById('cloudNote');
    try {
      if (!quiet && note) note.textContent = 'Saving to your account…';
      await this.saveStateToDB();
      await Cloud.uploadSave(db, this.cloudSummary());
      this._lastAutosave = Date.now();
      this._cloudDirty = false;
      this._autosaveCleared = true;
      this._autosaveBlocked = false;
      this._autosaveMark = this.autosaveMilestone();
      if (note) note.innerHTML = `Saved to your account (${this.esc(this.cloudSummary())}).`;
    } catch (e) {
      if (note) note.textContent = `Couldn't save to your account: ${e.message || e}`;
    }
  },

  async cloudLoad() {
    if (typeof Cloud === 'undefined' || !Cloud.user) return;
    const meta = await Cloud.getMeta(Cloud.savePath());
    if (!meta) { this.toast('No save on your account yet', 'Use "Save to my account" first.'); return; }
    if (!confirm(`Load the save on your account (${meta.summary || 'saved ' + new Date(meta.updatedAt).toLocaleString()})? It replaces the save in this browser.`)) return;
    this.showSimSpinner('Loading your save…');
    try { await Cloud.downloadSave(db); location.reload(); }
    catch (e) { await this.hideSimSpinner(); alert(`Couldn't load it: ${e.message || e}`); }
  },

  // After signing in: if the account holds a newer save than this browser
  // last synced, offer it.
  async offerCloudSave() {
    if (typeof Cloud === 'undefined' || !Cloud.user) return;
    try {
      const meta = await Cloud.getMeta(Cloud.savePath());
      if (!meta || meta.updatedAt <= Cloud.lastSynced()) return;
      this.spotlight({ kicker: 'Your account', title: 'Pick up where you left off?', sub: `Your account has a save from ${new Date(meta.updatedAt).toLocaleString()}${meta.summary ? ` (${meta.summary})` : ''}.`,
        actions: [{ label: 'Load it', primary: true, fn: async () => { this.showSimSpinner('Loading your save…'); await Cloud.downloadSave(db); location.reload(); } },
          { label: 'Keep this browser\'s save', fn: () => { this._autosaveCleared = true; this._autosaveBlocked = false; this.renderCloudMenu(); this.scheduleCloudSync(true); } }] }, { force: true });
    } catch (e) { /* offline or no access: nothing to offer */ }
  },

  // ---------- Account autosave ----------
  // Signed in, the save goes up to the account on its own: right away at
  // the big moments (the end of the regular season, Selection Sunday, the
  // title game, a new season), otherwise at most every few minutes while
  // you play, and when you leave the page. Never in the middle of a sim.
  AUTOSAVE_EVERY_MS: 3 * 60 * 1000,
  autosaveOn() {
    try { return localStorage.getItem('btr-autosave') !== 'off'; } catch (e) { return true; }
  },
  setAutosave(on) {
    try { localStorage.setItem('btr-autosave', on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    this.renderCloudMenu();
    if (on) this.scheduleCloudSync(true);
  },
  autosaveMilestone() {
    const s = this.state;
    return `${s.year}|${s.regularSeasonDone ? 1 : 0}${s.confChampsDone ? 1 : 0}${s.ncaaDone ? 1 : 0}|${s.offseasonStageIndex || 0}`;
  },
  scheduleCloudSync(soon) {
    if (typeof Cloud === 'undefined' || !Cloud.user || !this.autosaveOn() || !this.state.teams.length) return;
    this._cloudDirty = true;
    this.wireAutosaveOnLeave();
    const since = Date.now() - (this._lastAutosave || 0);
    const milestone = this._autosaveMark !== this.autosaveMilestone();
    const wait = soon || milestone ? 1500 : Math.max(1500, this.AUTOSAVE_EVERY_MS - since);
    if (this._cloudTimer && this._cloudDue && this._cloudDue <= Date.now() + wait) return;   // one's already coming sooner
    clearTimeout(this._cloudTimer);
    this._cloudDue = Date.now() + wait;
    this._cloudTimer = setTimeout(() => this.runAutosave(), wait);
  },
  async runAutosave() {
    this._cloudTimer = null;
    this._cloudDue = 0;
    if (!this._cloudDirty || typeof Cloud === 'undefined' || !Cloud.user || !this.autosaveOn() || typeof db === 'undefined') return;
    // Wait out a simulation or an upload already under way.
    if (this.isSimBusy() || this._autosaving) { this._cloudDue = Date.now() + 4000; this._cloudTimer = setTimeout(() => this.runAutosave(), 4000); return; }
    const note = document.getElementById('cloudNote');
    this._autosaving = true;
    try {
      // Never overwrite a newer save made on another device: until this
      // browser has loaded it (or you choose Save to my account), autosave
      // holds off.
      if (!this._autosaveCleared) {
        const meta = await Cloud.getMeta(Cloud.savePath());
        if (meta && meta.updatedAt > Cloud.lastSynced()) {
          this._autosaveBlocked = true;
          this.renderCloudMenu();
          return;
        }
        this._autosaveCleared = true;
        this._autosaveBlocked = false;
      }
      this._cloudDirty = false;
      const mark = this.autosaveMilestone();
      await Cloud.uploadSave(db, this.cloudSummary());
      this._lastAutosave = Date.now();
      this._autosaveMark = mark;
      this.state.lastAutosave = { at: this._lastAutosave, summary: this.cloudSummary() };
      this.renderCloudMenu();
    } catch (e) {
      this._cloudDirty = true;
      console.warn('Autosave to your account:', e.message || e);
      if (note) note.textContent = `Autosave couldn't reach your account (${e.message || e}). It will try again.`;
      this._cloudDue = Date.now() + 60000;
      this._cloudTimer = setTimeout(() => this.runAutosave(), 60000);
    } finally {
      this._autosaving = false;
    }
  },
  // Leaving the page (closing the tab, switching apps on a phone) sends
  // anything not yet saved. Uploads are all-or-nothing, so one cut off by
  // the page closing leaves the previous account save intact.
  wireAutosaveOnLeave() {
    if (this._autosaveWired || typeof document === 'undefined') return;
    this._autosaveWired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this._cloudDirty) this.runAutosave();
    });
  },

  // Permanently retires a player from the college universe.
  // Departed players are kept in a slim archive so the record books don't
  // lose every great career the moment its owner leaves for the draft.
  // Only their season lines are retained — no game logs.
  DEPARTED_ARCHIVE_CAP: 3000,

  archiveDeparted(player, reason) {
    if (!this.state.departedArchive) this.state.departedArchive = [];
    if (!player || (!(player.seasonHistory || []).length && !player.draft)) return;
    if (this.state.departedArchive.some(p => p.id === player.id)) return;

    // Career scoring total, used both as a record-book value and as the
    // yardstick for which careers are worth keeping.
    const career = (player.seasonHistory || []).reduce((n, h) => {
      const st = h.stats || {};
      return n + (parseFloat(st.ppg) || 0) * (st.gp || 0);
    }, 0);

    // Enough to show his profile after he's gone: bio, where he played,
    // every season's full line, and his last season as his current one.
    const hist = player.seasonHistory || [];
    const last = hist.length ? hist[hist.length - 1] : null;
    this.state.departedArchive.push({
      id: player.id, name: player.name, pos: player.pos,
      careerPts: Math.round(career),
      collegeHistory: player.collegeHistory,
      draft: player.draft || null,
      seasonHistory: hist,
      departed: true, leftAfter: this.state.year, leftFor: reason || (player.draft ? 'draft' : 'graduated'),
      school: player.school, conference: player.conference, class: player.class, jersey: player.jersey,
      ht: player.ht, wt: player.wt, hometown: player.hometown, hs: player.hs, rsci: player.rsci || null,
      recClassYear: player.recClassYear || null, isPro: !!player.isPro, club: player.club || null,
      accolades: player.accolades || [], bigGames: player.bigGames || [], bigGameStock: player.bigGameStock || 0,
      stats: last ? last.stats : null
    });

    // Every departing player would otherwise be kept forever. Only the
    // careers that could plausibly appear in a record book are retained.
    if (this.state.departedArchive.length > this.DEPARTED_ARCHIVE_CAP * 1.3) {
      // Drafted players are always kept.
      this.state.departedArchive.sort((a, b) => (b.draft ? 1 : 0) - (a.draft ? 1 : 0) || (b.careerPts || 0) - (a.careerPts || 0));
      this.state.departedArchive.length = this.DEPARTED_ARCHIVE_CAP;
    }
  },

  markDeparted(player) {
    if (!this.state.departedNames) this.state.departedNames = new Set();
    if (player && player.name) this.state.departedNames.add(player.name);
    if (player && player.name) this.departedKeys().add(this.personKey(player));
  },

  // Who a player is, for matching recruits to college players: his name
  // and recruiting class. A name alone isn't enough (a generated junior at
  // UTRGV and a five-star in the class of 2030 can share one), and when it
  // was, the recruit was treated as already enrolled or already gone: he
  // never arrived from the recruiting database, and the roster sheet's
  // bare row played in his place.
  personKey(p) { return `${String(p.name || '').trim().toLowerCase()}|${p.recClassYear || ''}`; },
  departedKeys() {
    const s = this.state;
    if (!(s.departedKeys instanceof Set)) {
      // Saves from before kept names only: rebuild from the archive.
      s.departedKeys = new Set((s.departedKeys && s.departedKeys.length ? s.departedKeys : (s.departedArchive || []).map(p => this.personKey(p))));
    }
    return s.departedKeys;
  },
  isDepartedRecruit(r) { return !!r && this.departedKeys().has(this.personKey(r)); },

  getIncomingRecruitClassYear() {
    return this.state.year + 1;
  },

  incomingClassLabel() {
    return this.getIncomingRecruitClassYear();
  },

  // ---------- The high-school season (see hs-season.js) ----------

  hsReady() { return typeof HSCore !== 'undefined'; },
  isD1School(name) { return !!this.findTeamByName(name); },

  // Everyone the recruiting sheet has in a class as it stands at season
  // progress p (a reclassifying player is in his old class until he moves).
  hsClassMembers(classYear, p = this.seasonProgress()) {
    return (this.state.allRecruits || []).filter(r => !r.fromOthers && r.recClassYear && !this.isDepartedRecruit(r) &&
      HSCore.currentClass(r, this.state.year, p) === Number(classYear));
  },

  // A class as the Recruits tab shows it: today's ranking, movement since
  // the season began, and only the commitments made so far.
  hsClassView(classYear) {
    const year = this.state.year, p = this.seasonProgress();
    const cp = HSCore.classProgress(classYear, year, p);
    const members = this.hsClassMembers(classYear, p);
    const ranks = HSCore.rankClass(members, cp);
    // The final class (reclassifiers included) sets the star counts; today's
    // members get them in today's order.
    const finalMembers = (this.state.allRecruits || []).filter(r => !r.fromOthers && Number(r.recClassYear) === Number(classYear));
    // Stars follow the rating: 90+ five, 80+ four, 70+ three. While the
    // class is still moving, a player's rating moves with his ranking
    // (the class curve between where he is now and where he finishes).
    const q = HSCore.starQuota(finalMembers, cp, classYear);
    const starOf = new Map(), gradeOf = new Map();
    const RG = typeof RecruitGen !== 'undefined' ? RecruitGen : null;
    const curve = RG ? RG.curveFor(RG.classTop(Number(classYear))) : null;
    let prevGrade = 99;
    members.filter(r => ranks.get(r)).sort((a, b) => ranks.get(a) - ranks.get(b)).forEach((r, i) => {
      const fin = parseFloat(r.recRating);
      if (RG && !isNaN(fin)) {
        let now = cp >= 1 || !curve ? fin : Math.max(60, Math.min(99, Math.round(fin + curve(ranks.get(r)) - curve(Number(r.rsci) || ranks.get(r)))));
        // Mid-year, nobody is graded above a player ranked ahead of him.
        if (cp < 1) { now = Math.min(now, prevGrade); prevGrade = now; }
        if (r.genRecruit) now = Math.min(now, RG.GEN_MAX || 95);
        gradeOf.set(r, now);
        starOf.set(r, RG.starsFor(now));
        return;
      }
      starOf.set(r, cp >= 1 && Number(r.stars) ? Number(r.stars) : i < q.five ? 5 : i < q.fourPlus ? 4 : 3);
    });
    const start = HSCore.rankClass(this.hsClassMembers(classYear, 0), HSCore.classProgress(classYear, year, 0));
    const isD1 = n => this.isD1School(n);
    return members.map(r => {
      const rank = ranks.get(r) || null, was = start.get(r) || null;
      const pro = HSCore.turnsPro(r, isD1);
      const decided = HSCore.commitVisible(r, cp) || !!r.liveCommitted;
      const stars = starOf.has(r) ? starOf.get(r) : (Number(r.stars) || 0);
      const from = HSCore.reclassFrom(r);
      return {
        r, rank, delta: rank && was ? was - rank : 0, arrived: !!(rank && !was),
        school: !pro && decided ? HSCore.committedTo(r) : '', pro, club: pro && decided ? HSCore.clubFor(r, isD1) : '',
        stars, grade: gradeOf.get(r) || null, intl: HSCore.isInternational(r),
        reclassed: from && Number(r.recClassYear) === Number(classYear) ? from : null
      };
    }).sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || (Number(b.r.rating) || 0) - (Number(a.r.rating) || 0));
  },

  // A recruit who hasn't played a college (or pro) game yet: he gets a
  // recruit card, not a college profile full of empty stats.
  isUpcomingRecruit(p) {
    if (!p || p.departed || p.isPro || !this.hsReady()) return false;
    if (this.state.activePlayers.includes(p) || (this.state.proPlayers || []).includes(p)) return false;
    return (this.state.allRecruits || []).includes(p) || (this.state.recruits || []).includes(p);
  },

  // The recruit as the Recruits tab has him today: rank and stars as they
  // stand, movement since the preseason, the commitment if it's public,
  // and any all-star selections announced so far.
  renderRecruitCard(r) {
    const s = this.state;
    const cls = HSCore.currentClass(r, s.year, this.seasonProgress());
    const e = this.hsClassView(cls).find(x => x.r === r) || { rank: null, stars: Number(r.stars) || 0, delta: 0 };
    const star = n => `<span class="rec-stars s${n}">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
    const cal = s.hsCalendar && s.hsCalendar.year === s.year ? s.hsCalendar : null;
    const picked = cal ? Object.keys(cal.events).filter(k => Object.values(cal.events[k].rosters || {}).some(ids => ids.includes(r.id)))
      .map(k => { const t = Object.keys(cal.events[k].rosters).find(n => cal.events[k].rosters[n].includes(r.id)); return `${HSCore.EVENTS[k].name} · ${t}`; }) : [];
    const commit = e.school ? `<div class="rc-commit"><img src="${this.getTeamLogo(e.school)}" class="sm-logo" alt=""><div><small>Committed to</small><b>${this.esc(e.school)}</b></div></div>`
      : e.club ? `<div class="rc-commit"><img src="../schoollogos/pro.png" class="sm-logo" alt=""><div><small>Turning pro</small><b>${this.esc(e.club)}</b></div></div>`
      : `<div class="rc-commit open"><div><small>Status</small><b>Uncommitted</b></div></div>`;
    const move = e.arrived ? '<span class="rec-move new">NEW</span>' : e.delta >= 1 ? `<span class="rec-move up">▲${e.delta} since the preseason</span>` : e.delta <= -1 ? `<span class="rec-move down">▼${-e.delta} since the preseason</span>` : '';
    const sc = r.scout || {};
    const fact = (k, v) => v ? `<div class="rc-fact"><small>${k}</small><b>${this.esc(v)}</b></div>` : '';
    const from = HSCore.reclassFrom(r);
    const reclassNote = from ? (cls === Number(r.recClassYear) ? `Reclassified from the class of ${from}.` : '') : '';
    return `<div class="recruit-card">
      <div class="pp-top"><button class="nav-back-btn" onclick="SimEngine.closePlayerPage()">&larr; Back</button></div>
      <div class="rc-head card">
        <div class="rc-rank"><small>${cls} rank</small><b>${e.rank ? '#' + e.rank : (e.intl ? 'INTL' : 'NR')}</b>${move}</div>
        <div class="rc-id">
          <span class="rc-kicker">Class of ${cls} · ${this.esc(r.pos || '')}</span>
          <h2>${this.esc(r.name)}</h2>
          <div>${e.stars ? star(e.stars) : ''}</div>
          ${reclassNote ? `<span class="rec-tag">${reclassNote}</span>` : ''}
          ${r.liveDecommitFrom ? `<span class="rec-tag">Reopened his recruitment after ${this.esc(r.liveDecommitFrom)}'s coaching change</span>` : ''}
          ${e.school && r.liveWith ? `<span class="rec-tag">Joining teammate ${this.esc(r.liveWith)}</span>` : ''}
        </div>
        ${commit}
      </div>
      <div class="rc-facts card">${fact('Height', r.ht)}${fact('Weight', r.wt ? r.wt + ' lb' : '')}${fact('Wingspan', r.wingspan)}${fact('Hometown', r.hometown && r.hometown !== 'N/A' ? r.hometown : '')}${fact('High school', r.hs)}</div>
      ${this.summerCardHTML(r)}
      ${picked.length ? `<div class="card rc-block"><h3 class="section-title">All-star games</h3><ul>${picked.map(x => `<li>${this.esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${sc.strengths || sc.weaknesses || sc.scouting ? `<div class="card rc-block"><h3 class="section-title">Scouting report</h3>
        ${sc.scouting ? `<p>${this.esc(sc.scouting)}</p>` : ''}
        ${sc.strengths ? `<p><b>Strengths:</b> ${this.esc(sc.strengths)}</p>` : ''}${sc.weaknesses ? `<p><b>Weaknesses:</b> ${this.esc(sc.weaknesses)}</p>` : ''}</div>` : ''}
      <p class="sub-text rc-foot">Rankings and commitments are where things stand in the ${this.seasonLabelFor(s.year)} season. The full profile is on the <a class="text-link" href="../recruiting/">Recruiting</a> page.</p>
    </div>`;
  },

  // A center-screen card for the big moments of the high-school calendar.
  // Several in a row queue up; nothing shows over a live broadcast.
  spotlight(card, opts = {}) {
    if (typeof document === 'undefined' || !document.body) return;
    if (this._skipping) return;
    if (window.__BTR_NO_CUTSCENES && !opts.force) return;
    if (!opts.force && this.holdForLive(() => this.spotlight(card))) return;
    this._spotQueue = this._spotQueue || [];
    this._spotQueue.push(card);
    if (this._spotQueue.length === 1) this.showNextSpotlight();
  },
  showNextSpotlight() {
    const card = (this._spotQueue || [])[0];
    if (!card) return;
    const el = document.createElement('div');
    el.className = 'spotlight';
    el.innerHTML = `<div class="spotlight-card" role="dialog" aria-modal="true">
      ${card.logo ? `<img src="${card.logo}" alt="" class="spotlight-logo">` : ''}
      <span class="spotlight-kicker">${this.esc(card.kicker || '')}</span>
      <h2>${this.esc(card.title)}</h2>
      ${card.sub ? `<p>${this.esc(card.sub)}</p>` : ''}
      <div class="spotlight-actions">${(card.actions || []).map((a, i) => `<button type="button" class="${a.primary ? 'spot-primary' : 'spot-secondary'}" data-i="${i}">${this.esc(a.label)}</button>`).join('')}</div>
    </div>`;
    const close = () => { el.remove(); this._spotQueue.shift(); this.showNextSpotlight(); };
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-i]');
      if (b) { const a = card.actions[+b.dataset.i]; close(); if (a && a.fn) a.fn(); return; }
      if (ev.target === el) close();
    });
    document.body.appendChild(el);
  },
  hsSpotlight(key, kind) {
    const ev = HSCore.EVENTS[key];
    const logo = `../${HSCore.EVENT_LOGO[key]}`;
    const toTab = () => { this._hsOpen = key; this.state.recruitsClassView = 'incoming'; if (window.UIController && UIController.activateTab) UIController.activateTab('recruitsTab'); this.updateRecruitsTab(); };
    if (kind === 'roster') {
      this.spotlight({ logo, kicker: 'Rosters announced', title: `The ${ev.name} rosters are out`, sub: 'See who made it, then watch the game when it tips off.',
        actions: [{ label: 'See the rosters', primary: true, fn: toTab }, { label: 'Later' }] });
    } else {
      this.spotlight({ logo, kicker: ev.play >= 1 ? 'After the title game' : 'Final Four week', title: `Watch the ${ev.name}`, sub: 'The best of the incoming class, from the opening tip.',
        actions: [{ label: 'Watch', primary: true, fn: () => this.watchAllStarGame(key) }, { label: 'Later', fn: () => { if (document.getElementById('hsEvents')) this.updateRecruitsTab(); } }] });
    }
  },

  // Moves the high-school calendar up to where the season is: commitments
  // and reclassifications as they happen, all-star rosters when they're
  // announced, and the games themselves.
  advanceHsCalendar() {
    if (!this.hsReady() || !this.state.teams.length) return;
    const s = this.state, year = s.year, p = this.seasonProgress();
    // A new season's wire opens with what happened over the offseason
    // (the summer circuit, recruitments reopened by coaching changes).
    if (!s.hsCalendar || s.hsCalendar.year !== year) {
      s.hsCalendar = { year, lastP: p, events: {}, wire: (s.pendingWire || []).slice().reverse().slice(0, 30) };
      s.pendingWire = [];
    }
    const cal = s.hsCalendar;
    const prev = cal.lastP;
    const incoming = year + 1;
    const isD1 = n => this.isD1School(n);
    const wire = [];
    const when = this.phaseLabelShort ? this.phaseLabelShort() : `Week ${s.week}`;
    // Recruiting moves with the calendar: lists shrink, commitments land.
    this.runLiveRecruiting();
    if (p > prev) {
      // Rank as it stands today, per class, for the headlines.
      const nowRank = new Map();
      [incoming, incoming + 1].forEach(c => {
        HSCore.rankClass(this.hsClassMembers(c, p), HSCore.classProgress(c, year, p)).forEach((rk, r) => nowRank.set(r, rk));
      });
      (s.allRecruits || []).forEach(r => {
        if (r.fromOthers || !r.recClassYear) return;
        const c = Number(r.recClassYear);
        if (c !== incoming && c !== incoming + 1) return;
        const a = HSCore.classProgress(c, year, prev), b = HSCore.classProgress(c, year, p);
        const at = HSCore.commitAt(r);
        const rk = nowRank.get(r) || null;
        const top = rk && rk <= 60;
        if (at > a && at <= b && (top || HSCore.isInternational(r))) {
          if (HSCore.turnsPro(r, isD1)) wire.push({ kind: 'pro', id: r.id, rank: rk, text: `${r.name} signs with ${HSCore.clubFor(r, isD1)} and turns pro` });
          else if (HSCore.committedTo(r)) wire.push({ kind: 'commit', id: r.id, rank: rk, school: HSCore.committedTo(r), text: `${rk ? '#' + rk + ' ' : ''}${r.name} commits to ${HSCore.committedTo(r)}${r.liveOver && r.liveOver.length ? ` over ${r.liveOver.join(' and ')}` : ''}${r.liveWith ? `, joining teammate ${r.liveWith}` : ''}` });
        }
        const from = HSCore.reclassFrom(r);
        if (from && c === incoming) {
          const ra = HSCore.reclassAt(r);
          if (ra > a && ra <= b) wire.push({ kind: 'reclass', id: r.id, rank: r.rsci, text: `${r.name} reclassifies from ${from} into the class of ${c}` });
        }
      });
    }
    // All-star rosters and games, in calendar order.
    Object.keys(HSCore.EVENTS).forEach(key => {
      const ev = HSCore.EVENTS[key];
      let e = cal.events[key];
      if (!e && p >= ev.announce) {
        const rosters = this.hsRosters(incoming, key);
        if (!rosters) return;
        e = cal.events[key] = { key, classYear: incoming, rosters, result: null, seen: false };
        wire.push({ kind: 'roster', key, text: `${ev.name} rosters announced` });
        this.hsSpotlight(key, 'roster');
      }
      if (e && !e.result && p >= ev.play && typeof GameCore !== 'undefined') {
        e.result = this.playAllStarGame(key, e.rosters);
        if (e.result) { wire.push({ kind: 'game', key, text: `The ${ev.name} is final` }); this.hsSpotlight(key, 'game'); }
      }
    });
    cal.lastP = Math.max(prev, p);
    if (!wire.length) return;
    wire.forEach(w => { w.when = when; w.year = year; });
    cal.wire = wire.slice().reverse().concat(cal.wire || []).slice(0, 60);
    wire.forEach(w => this.logNews(w.text));
    // One toast at most: the biggest story.
    const order = ['game', 'roster', 'reclass', 'commit', 'pro'];
    const lead = wire.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.rank || 999) - (b.rank || 999))[0];
    if (lead && lead.kind !== 'game' && lead.kind !== 'roster' && (lead.kind === 'reclass' || (lead.rank && lead.rank <= 15))) {
      const more = wire.length - 1;
      const sub = lead.kind === 'game' ? 'Watch it from the Recruits tab.' : more ? `Plus ${more} more on the recruiting wire.` : 'On the Recruits tab.';
      if (!this.holdForLive(() => this.toast(lead.text, sub))) this.toast(lead.text, sub);
    }
  },

  // An event's teams: { teamName: [recruit ids] }.
  hsRosters(classYear, key) {
    const all = (this.state.allRecruits || []).filter(r => !r.fromOthers);
    const members = all.filter(r => Number(r.recClassYear) === Number(classYear));
    if (members.length < 12) return null;
    const nextIntl = all.filter(r => Number(r.recClassYear) === Number(classYear) + 1 && HSCore.isInternational(r));
    const sel = HSCore.selectRosters(members, classYear, nextIntl);
    const ids = list => list.map(r => r.id);
    if (key === 'mcd') { const t = HSCore.splitEastWest(sel.mcd); return { East: ids(t.East), West: ids(t.West) }; }
    if (key === 'jbc') { const [a, b] = HSCore.EVENTS.jbc.teams; const t = HSCore.splitSnake(sel.jbc, [a, b]); return { [a]: ids(t[a]), [b]: ids(t[b]) }; }
    return { USA: ids(sel.nhs.usa), World: ids(sel.nhs.world) };
  },

  // Plays an all-star game with the same engine as every college game,
  // opened up: more possessions, less defense.
  playAllStarGame(key, rosters) {
    const byId = new Map((this.state.allRecruits || []).map(r => [r.id, r]));
    const names = Object.keys(rosters);
    const MINS = [25, 23, 22, 21, 19, 18, 16, 15, 13, 12, 9, 7];
    const build = name => {
      const players = (rosters[name] || []).map(id => byId.get(id)).filter(Boolean)
        .map(r => ({ ...r, school: name, class: 'FR', role: '', committed: HSCore.committedTo(r), rating: HSCore.proTalent(r) }))
        .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
      const total = MINS.slice(0, players.length).reduce((n, m) => n + m, 0) || 1;
      const team = { school: name, conference: '', roster: players, usageReference: 84 };
      players.forEach((pl, i) => { pl.expectedStats = this.buildBaseStatExpectations(pl, (MINS[i] || 6) * 200 / total, team); });
      const top = players.slice(0, 8);
      team.simData = { teamOvr: top.reduce((n, pl) => n + (parseFloat(pl.rating) || 75), 0) / Math.max(1, top.length), rosterRef: players };
      team.coachProfile = { pace: 1.1, defense: 0.95 };
      return team;
    };
    const H = build(names[0]), A = build(names[1]);
    if (H.roster.length < 5 || A.roster.length < 5) return null;
    const res = GameCore.simulateSingleGame(H, A, { homeCourtEdge: 0, paceBase: 176, marginVarianceStd: 12 });
    const lines = boxes => boxes.map(({ player, box }, i) => ({
      ...box, id: player.id, name: player.name, pos: player.pos, jersey: player.jersey || '', committed: player.committed || '', started: i < 5
    }));
    const home = { name: names[0], score: res.homeScore, lines: lines(res.homePlayerBoxes) };
    const away = { name: names[1], score: res.awayScore, lines: lines(res.awayPlayerBoxes) };
    const win = home.score > away.score ? home : away;
    const gs = b => b.pts + 0.4 * (b.twoPm + b.threePm) - 0.7 * (b.twoPa + b.threePa) + 0.7 * (b.oreb || 0) + 0.3 * (b.dreb || 0) + b.stl + 0.7 * b.ast + 0.7 * b.blk - b.tov;
    // Voters don't just read the box score: a little noise, so the best
    // player in the class doesn't sweep every MVP.
    // Picked from the winners' top three, weighted, and a player who
    // already won one this spring has to clearly outplay the field again.
    const mvpRng = HSCore.rngFor(`${key}|${names.join('|')}|${home.score}-${away.score}`);
    const won = new Set(Object.values((this.state.hsCalendar && this.state.hsCalendar.events) || {})
      .map(e => e.result && e.result.mvp && e.result.mvp.id).filter(Boolean));
    const top3 = win.lines.map(l => ({ l, v: gs(l) - (won.has(l.id) ? 7 : 0) })).sort((a, b) => b.v - a.v).slice(0, 3);
    const roll = mvpRng();
    const mvp = (top3[roll < 0.6 ? 0 : roll < 0.87 ? 1 : 2] || top3[0] || {}).l;
    const statline = b => [`${b.pts} pts`, b.reb >= 5 ? `${b.reb} reb` : '', b.ast >= 4 ? `${b.ast} ast` : ''].filter(Boolean).join(', ');
    return { home, away, mvp: mvp ? { id: mvp.id, name: mvp.name, team: win.name, line: statline(mvp) } : null };
  },

  watchAllStarGame(key) {
    const e = this.state.hsCalendar && this.state.hsCalendar.events[key];
    if (typeof GameCenter === 'undefined') return;
    const game = this.allStarLiveGame(key);
    if (!game) return;
    e.seen = true;
    this.closePlayerPage();
    GameCenter.open(game, { mode: 'live', onClose: () => this.updateRecruitsTab() });
  },

  // The Game Center broadcast of a played all-star game.
  allStarLiveGame(key) {
    const e = this.state.hsCalendar && this.state.hsCalendar.events[key];
    if (!e || !e.result || typeof LiveCore === 'undefined') return null;
    const ev = HSCore.EVENTS[key], res = e.result;
    const meta = {
      key: `hs|${e.classYear}|${key}`, label: ev.name, neutral: true, big: true,
      home: { school: res.home.name, record: `Class of ${e.classYear}`, color: (HSCore.TEAM_STYLE[res.home.name] || {}).color },
      away: { school: res.away.name, record: `Class of ${e.classYear}`, color: (HSCore.TEAM_STYLE[res.away.name] || {}).color },
      spread: 0, homeScore: res.home.score, awayScore: res.away.score,
      note: res.mvp ? `${res.mvp.name} is the game's MVP.` : ''
    };
    return LiveCore.build(meta, { home: res.home.lines, away: res.away.lines });
  },

  revealAllStarGame(key) {
    const e = this.state.hsCalendar && this.state.hsCalendar.events[key];
    if (e) { e.seen = true; this.updateRecruitsTab(); }
  },

  toggleHsRoster(key) {
    this._hsOpen = this._hsOpen === key ? null : key;
    this.updateRecruitsTab();
  },

  // The all-star events and the recruiting wire, above the class table.
  renderHsEvents(classYear) {
    const el = document.getElementById('hsEvents');
    if (!el) return;
    const s = this.state, cal = s.hsCalendar && s.hsCalendar.year === s.year ? s.hsCalendar : null;
    // Last summer's champions, above both classes.
    const smv = s.summer && (s.summer.season === s.year || s.summer.season === s.year + 1) ? this.currentSummer() : null;
    const sm = smv && smv.done !== false ? smv : null;
    const strip = sm ? `<div class="card summer-strip"><b>Summer ${sm.season}</b>${sm.aau.circuits.map(c => `<span>${this.esc(c.event)}: <b>${this.esc(c.champion)}</b></span>`).join('')}${sm.fiba && sm.fiba.medals ? `<span>${this.esc(sm.fiba.short)}: <b>${this.esc(sm.fiba.medals.gold)}</b></span>` : ''}</div>` : '';
    if (!this.hsReady() || !cal || classYear !== s.year + 1) { el.innerHTML = strip; return; }
    const byId = new Map((s.allRecruits || []).map(r => [r.id, r]));
    const card = key => {
      const ev = HSCore.EVENTS[key], e = cal.events[key];
      const head = `<div class="hs-ev-head"><img src="../${HSCore.EVENT_LOGO[key]}" alt="" class="hs-ev-logo"><span class="hs-ev-name">${this.esc(ev.name)}</span></div>`;
      if (!e) return `<div class="hs-event pending">${head}<small>Rosters not announced yet</small></div>`;
      const res = e.result;
      const names = Object.keys(e.rosters);
      let body;
      if (res && e.seen) {
        const w = res.home.score > res.away.score;
        body = `<div class="hs-score"><span class="${w ? 'won' : ''}">${this.esc(res.home.name)} <b>${res.home.score}</b></span><span class="${w ? '' : 'won'}">${this.esc(res.away.name)} <b>${res.away.score}</b></span></div>
          ${res.mvp ? `<small class="hs-mvp">MVP: <a class="text-link" onclick="SimEngine.openPlayerModal('${String(res.mvp.id).replace(/'/g, "\\'")}')">${this.esc(res.mvp.name)}</a> · ${this.esc(res.mvp.line)}</small>` : ''}
          <button type="button" class="hs-btn" onclick="SimEngine.watchAllStarGame('${key}')">&#9654; Watch replay</button>`;
      } else if (res) {
        body = `<small>Final</small><div class="hs-actions"><button type="button" class="hs-btn primary" onclick="SimEngine.watchAllStarGame('${key}')">&#9654; Watch</button>
          <button type="button" class="hs-btn" onclick="SimEngine.revealAllStarGame('${key}')">Show result</button></div>`;
      } else {
        body = `<small>${names.map(n => this.esc(n)).join(' vs ')} · ${ev.play >= 1 ? 'after the title game' : 'Final Four week'}</small>`;
      }
      const open = this._hsOpen === key;
      const roster = open ? `<div class="hs-rosters">${names.map(n => `<div><b><img src="${this.getTeamLogo(n)}" alt="" class="xs-logo">${this.esc(n)}</b><ol>${(e.rosters[n] || []).map(id => byId.get(id)).filter(Boolean)
        .map(r => { const c = HSCore.committedTo(r); return `<li onclick="SimEngine.openPlayerModal('${String(r.id).replace(/'/g, "\\'")}')"><span class="hs-rk">${this.esc(r.pos || '')}</span>${this.esc(r.name)}${c && HSCore.commitVisible(r, 1) && this.isD1School(c) ? `<img src="${this.getTeamLogo(c)}" class="xs-logo" alt="">` : ''}</li>`; }).join('')}</ol></div>`).join('')}</div>` : '';
      return `<div class="hs-event${res ? ' final' : ''}">${head}${body}
        <button type="button" class="hs-link" onclick="SimEngine.toggleHsRoster('${key}')">${open ? 'Hide rosters' : 'Rosters'}</button>${roster}</div>`;
    };
    const wire = (cal.wire || []).slice(0, 8).map(w => `<li class="wire-${w.kind}"><span class="hs-when">${this.esc(w.when || '')}</span>${w.school ? `<img src="${this.getTeamLogo(w.school)}" class="xs-logo" alt="">` : ''}${w.id ? `<a onclick="SimEngine.openPlayerModal('${String(w.id).replace(/'/g, "\\'")}')">${this.esc(w.text)}</a>` : this.esc(w.text)}</li>`).join('');
    el.innerHTML = `${strip}<div class="hs-grid">${Object.keys(HSCore.EVENTS).map(card).join('')}</div>
      ${wire ? `<div class="card hs-wire"><h3 class="section-title">Recruiting wire</h3><ul>${wire}</ul></div>` : ''}`;
  },

  setRecruitsClassView(v) { this.state.recruitsClassView = v; this.updateRecruitsTab(); },

  updateRecruitsTab() {
    const body = document.getElementById('recruitsBody');
    const label = document.getElementById('recruitsClassLabel');
    if (!body) return;
    if (!this.hsReady()) return;

    const incoming = this.getIncomingRecruitClassYear();
    const view = this.state.recruitsClassView === 'next' ? incoming + 1 : incoming;
    if (label) label.innerText = `Class of ${view}`;
    const seg = document.getElementById('recruitsClassSeg');
    if (seg) seg.innerHTML = [['incoming', incoming, 'Incoming'], ['next', incoming + 1, 'Next year']].map(([k, y, t]) =>
      `<button type="button" class="${view === y ? 'on' : ''}" onclick="SimEngine.setRecruitsClassView('${k}')">${t} <small>${y}</small></button>`).join('');
    const sub = document.getElementById('recruitsSub');
    if (sub) sub.innerHTML = view === incoming
      ? `Next season's freshmen. Rankings move and commitments come in through the season; everything is final after the title game. Full profiles on the <a class="text-link" href="../recruiting/">Recruiting</a> page.`
      : `The class after next, a year out. Most of them are still uncommitted.`;
    this.renderHsEvents(view);

    if (!(this.state.allRecruits || []).length) {
      body.innerHTML = `<tr><td colspan="7" class="empty-table-msg">No recruit data loaded yet.</td></tr>`;
      return;
    }
    let list = this.hsClassView(view);
    if (this.state.recruitsStatusFilter === 'committed') list = list.filter(e => e.school);
    else if (this.state.recruitsStatusFilter === 'uncommitted') list = list.filter(e => !e.school && !e.club);
    if (this.state.recruitsConfFilter && this.state.recruitsConfFilter !== 'ALL') {
      list = list.filter(e => {
        const team = e.school && this.findTeamByName(e.school);
        return team && this.matchesConfFilter(team.conference, this.state.recruitsConfFilter);
      });
    }
    if (list.length === 0) {
      body.innerHTML = `<tr><td colspan="7" class="empty-table-msg">No ${view} recruits match these filters.</td></tr>`;
      return;
    }

    const stars = n => { const k = Math.max(0, Math.min(5, Math.round(parseFloat(n) || 0))); return k ? `<span class="rec-stars s${k}">${'★'.repeat(k)}<i>${'★'.repeat(5 - k)}</i></span>` : '<span class="sub-text-sm">—</span>'; };
    const move = e => e.arrived ? '<span class="rec-move new">NEW</span>'
      : e.delta >= 3 ? `<span class="rec-move up">▲${e.delta}</span>` : e.delta <= -3 ? `<span class="rec-move down">▼${-e.delta}</span>` : '';
    body.innerHTML = list.map(e => {
      const r = e.r;
      const safeId = String(r.id).replace(/'/g, "\\'");
      const home = r.hometown && r.hometown !== 'N/A' ? r.hometown : '';
      const tag = e.reclassed ? `<span class="rec-tag">Reclassified from ${e.reclassed}</span>` : '';
      const commit = e.school
        ? `<div class="rec-commit">${this.isD1School(e.school) ? `<img src="${this.getTeamLogo(e.school)}" class="xs-logo" alt="">` : ''}<b>${this.esc(e.school)}</b></div>`
        : e.club ? `<span class="rec-pro">Pro · ${this.esc(e.club)}</span>` : '<span class="rec-open">Uncommitted</span>';
      return `<tr class="rec-row" onclick="SimEngine.openPlayerModal('${safeId}')">
        <td class="rec-rank">${e.rank || (e.intl ? '<small>INTL</small>' : '—')}${move(e)}</td>
        <td><div class="rec-player"><div><b>${this.esc(r.name)}</b><small>${this.esc(home)}</small>${tag}</div></div></td>
        <td><span class="rec-pos">${this.esc(r.pos || '')}</span></td>
        <td class="rec-htwt">${this.esc(r.ht || '')}${r.wt ? ` / ${this.esc(r.wt)}` : ''}</td>
        <td class="rec-hs">${this.esc(r.hs || '—')}</td>
        <td>${stars(e.stars)}</td>
        <td>${commit}</td>
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





  // What the season-end screens show: built once from the finished season
  // (awards, All-Americans, Final Four, final poll) and kept for the rest
  // of the offseason, even as players leave for the draft.
  wrapUpData() {
    const s = this.state;
    const t = s.ncaaTournament;
    if (!s.ncaaDone || !t || !t.champion) return null;
    if (this._wrapUp && this._wrapUp.year === s.year && this._wrapUp.champ === t.champion.school) return this._wrapUp;
    const line = p => p ? { id: p.id, name: p.name, school: p.school, pos: p.pos, class: p.class,
      ppg: p.stats.ppg, rpg: p.stats.rpg, apg: p.stats.apg } : null;
    let aw = {};
    try { aw = this.computeNationalAwards(); } catch (e) { aw = {}; }
    const final = t.rounds[t.rounds.length - 1] && t.rounds[t.rounds.length - 1][0];
    const champ = t.champion.school;
    const runner = final ? (final.winner.school === final.teamA.school ? final.teamB.school : final.teamA.school) : null;
    const score = final && final.result ? `${Math.max(final.result.homeScore, final.result.awayScore)}-${Math.min(final.result.homeScore, final.result.awayScore)}` : '';
    const seeds = s.ncaaSelection ? this.selectionSeeds(s.ncaaSelection) : {};
    const semis = t.rounds[4] || [];
    const finalFour = semis.flatMap(g => [g.teamA.school, g.teamB.school]).map(sc => ({
      school: sc, seed: (seeds[sc] || {}).seed || null, region: (seeds[sc] || {}).region || '',
      result: sc === champ ? 'Champion' : sc === runner ? 'Runner-up' : 'Final Four'
    }));
    const allAmericans = [...s.activePlayers].sort((a, b) => b.awardScore - a.awardScore).slice(0, 5).map(line);
    const poll = [...s.teams].filter(x => x.apRank).sort((x, y) => x.apRank - y.apRank).slice(0, 10)
      .map(x => ({ rank: x.apRank, school: x.school, wins: x.simData.wins, losses: x.simData.losses }));
    const team = this.findTeam(champ);
    this._wrapUp = {
      year: s.year, champ, runner, score,
      record: team ? `${team.simData.wins}-${team.simData.losses}` : '',
      conference: team ? team.conference : '', seed: (seeds[champ] || {}).seed || null,
      finalFour, poll, allAmericans,
      awards: [['Final Four MOP', (() => { const h = s.postseasonHonors; const m = h && h.finalFour && h.finalFour.mop; return m ? s.activePlayers.find(p => p.id === m.id) : null; })()],
        ['Player of the Year', aw.npoy], ['Defensive Player of the Year', aw.dpoy], ['Freshman of the Year', aw.froy]]
        .filter(x => x[1]).map(([label, p]) => ({ label, p: line(p) })),
      positions: [['Bob Cousy Award · PG', aw.cousy], ['Jerry West Award · SG', aw.west], ['Julius Erving Award · SF', aw.erving],
        ['Karl Malone Award · PF', aw.malone], ['Kareem Abdul-Jabbar Award · C', aw.abdulJabbar]]
        .filter(x => x[1]).map(([label, p]) => ({ label, p: line(p) })),
      secondTeam: [...s.activePlayers].sort((a, b) => b.awardScore - a.awardScore).slice(5, 10).map(line),
      honors: s.postseasonHonors || null
    };
    return this._wrapUp;
  },

  renderOffseasonChampion() {
    const s = this.state;
    const w = this.wrapUpData();
    if (!w) {
      // Outside a live offseason, fall back to the last archived season.
      const last = (s.seasonHistory || []).slice(-1)[0];
      if (!last || !last.champion) return `<p class="empty-table-msg">Finish the NCAA Tournament to begin the offseason.</p>`;
      return `<div class="card wrap-champ"><img src="${this.getTeamLogo(last.champion)}" class="wrap-champ-logo" alt="">
        <div><div class="wrap-kicker">${last.year}-${String(last.year + 1).slice(2)} National Champions</div>
        <div class="wrap-champ-name">${this.esc(last.champion)}</div>
        ${last.runnerUp ? `<div class="wrap-champ-meta">Beat ${this.esc(last.runnerUp)} in the title game</div>` : ''}</div></div>`;
    }
    const label = `${w.year}-${String(w.year + 1).slice(2)}`;
    const player = (p, extra = '') => p ? `<li class="wrap-player" onclick="SimEngine.openPlayerModal('${this.jsArg(p.id)}')">
        <img src="${this.getTeamLogo(p.school)}" class="xs-logo" alt="">
        <span class="dw-name"><b>${this.esc(p.name)}</b><small>${extra ? extra + ' · ' : ''}${p.pos} · ${p.class} · ${this.esc(p.school)}</small></span>
        <span class="wrap-line">${p.ppg}<small>ppg</small> ${p.rpg}<small>rpg</small> ${p.apg}<small>apg</small></span></li>` : '';
    const declared = (s.draftDeclarations || []).length;
    const idx = s.offseasonStageIndex || 0;
    return `<div class="wrap-grid">
      <div class="card wrap-champ">
        <img src="${this.getTeamLogo(w.champ)}" class="wrap-champ-logo" alt="">
        <div class="wrap-champ-text">
          <div class="wrap-kicker">${label} National Champions</div>
          <div class="wrap-champ-name clickable-school" onclick="SimEngine.closeOffseason();SimEngine.goToTeamPage('${this.jsArg(w.champ)}')">${this.esc(w.champ)}</div>
          <div class="wrap-champ-meta">${w.record}${w.conference ? ' · ' + this.esc(w.conference) : ''}${w.seed ? ` · ${w.seed} seed` : ''}</div>
          ${w.runner ? `<div class="wrap-title-game"><span>Title game</span><b>${w.score}</b> over ${this.esc(w.runner)}</div>` : ''}
        </div>
      </div>
      <div class="card wrap-next">
        <div class="draft-gate-kicker">Up next · ${this.upcomingDraftYear()} NBA Draft</div>
        <b class="wrap-next-count" data-count="${declared}">${declared}</b>
        <p>players have declared. The combine, lottery, workouts and draft night happen in the Draft RP.</p>
        ${idx === 0 ? `<button class="sim-btn" onclick="SimEngine.advanceFromOffseason()">Continue to the draft</button>` : `<a class="sim-btn" href="./draft.html">Open the Draft RP &rarr;</a>`}
      </div>
      <div class="card wrap-ff">
        <div class="section-head"><h3 class="section-title">The Final Four</h3></div>
        <div class="wrap-ff-grid">${w.finalFour.map((t, i) => `<div class="wrap-ff-team ${t.result === 'Champion' ? 'champ' : ''}" style="--d:${i * 80}ms" onclick="SimEngine.closeOffseason();SimEngine.goToTeamPage('${this.jsArg(t.school)}')">
          <img src="${this.getTeamLogo(t.school)}" alt=""><b>${this.esc(t.school)}</b><small>${t.seed ? t.seed + ' seed · ' : ''}${t.region}</small><span>${t.result}</span></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="section-head"><h3 class="section-title">National awards</h3></div>
        <ul class="draft-watch wrap-list">${w.awards.map(a => player(a.p, a.label)).join('')}</ul>
      </div>
      <div class="card">
        <div class="section-head"><h3 class="section-title">First-team All-Americans</h3></div>
        <ul class="draft-watch wrap-list">${w.allAmericans.map(p => player(p)).join('')}</ul>
      </div>
      ${w.positions && w.positions.length ? `<div class="card">
        <div class="section-head"><h3 class="section-title">Best at each position</h3></div>
        <ul class="draft-watch wrap-list">${w.positions.map(a => player(a.p, a.label)).join('')}</ul>
      </div>` : ''}
      ${w.secondTeam && w.secondTeam.length ? `<div class="card">
        <div class="section-head"><h3 class="section-title">Second-team All-Americans</h3></div>
        <ul class="draft-watch wrap-list">${w.secondTeam.map(p => player(p)).join('')}</ul>
      </div>` : ''}
      ${(() => {
        const h = w.honors; if (!h) return '';
        const ent = (e, label) => e ? `<li class="wrap-player" onclick="SimEngine.openPlayerModal('${this.jsArg(e.id)}')">
          <img src="${this.getTeamLogo(e.school)}" class="xs-logo" alt="">
          <span class="dw-name"><b>${this.esc(e.name)}</b><small>${label ? this.esc(label) + ' · ' : ''}${this.esc(e.school)}</small></span>
          <span class="wrap-line">${this.esc(e.line || '')}</span></li>` : '';
        const regions = Object.values(h.regions || {});
        const ff = (h.finalFour && h.finalFour.team) || [];
        if (!regions.length && !ff.length) return '';
        return `<div class="card">
          <div class="section-head"><h3 class="section-title">Tournament honors</h3></div>
          <ul class="draft-watch wrap-list">${ff.map(e => ent(e, 'All-Final Four')).join('')}${regions.map(e => ent(e, `${e.region} Region MOP`)).join('')}</ul>
        </div>`;
      })()}
      <div class="card">
        <div class="section-head"><h3 class="section-title">Final Top 10</h3></div>
        <ol class="wrap-poll">${w.poll.map(t => `<li onclick="SimEngine.closeOffseason();SimEngine.goToTeamPage('${this.jsArg(t.school)}')"><span class="poll-rank">${t.rank}</span><img src="${this.getTeamLogo(t.school)}" class="poll-logo" alt=""><span class="poll-team">${this.esc(t.school)}</span><span class="poll-rec">${t.wins}-${t.losses}</span></li>`).join('')}</ol>
      </div>
    </div>`;
  },

  renderOffseasonTransfers() {
    const transfers = this.state.lastTransfers || [];
    if (transfers.length === 0) {
      return `<p class="empty-table-msg">No transfers yet — the portal opens when you advance the offseason.</p>`;
    }
    const changes = (this.state.lastCoachChanges || []).filter(c => c.kind === 'hired');
    const carousel = changes.length ? `<div class="card mb-1-5"><div class="section-head"><h3 class="section-title">Coaching carousel</h3><span class="sub-text-sm">${changes.length} new head coach${changes.length === 1 ? '' : 'es'}</span></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>School</th><th>New coach</th><th>Coming from</th></tr></thead><tbody>
      ${changes.sort((a, b) => ((this.findTeam(b.school) || {}).prestige || 0) - ((this.findTeam(a.school) || {}).prestige || 0)).map(c => `<tr>
        <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(c.school)}" class="xs-logo" alt=""><span>${this.esc(c.school)}</span></div></td>
        <td class="bold-text">${this.esc(c.coach)}</td>
        <td>${c.from ? `<div class="team-cell-wrap"><img src="${this.getTeamLogo(c.from)}" class="xs-logo" alt=""><span>${this.esc(c.from)}</span></div>` : '<span class="sub-text-sm">First head job</span>'}</td>
      </tr>`).join('')}</tbody></table></div></div>` : '';
    return `${carousel}<p class="sub-text mb-1">${transfers.length} players changed schools. Producing well against a weak schedule pulls players upward; highly-rated players who underperformed or barely played look for a new situation.</p>
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

  // ============================================================
  // App shell: title screen, season track, dashboard, offseason,
  // cutscenes and toasts.
  // ============================================================

  // The title screen puts an existing save first.
  async setupHomeScreen() {
    const hasSave = await this.checkForExistingSave();
    const home = document.getElementById('homeScreen');
    const loadBtn = document.getElementById('loadSaveBtn');
    const newBtn = document.getElementById('newSaveBtn');
    const noSaveMsg = document.getElementById('noSaveMessage');
    const meta = document.getElementById('homeSaveMeta');
    if (home) home.classList.toggle('has-save', hasSave);
    if (loadBtn) loadBtn.disabled = !hasSave;
    if (newBtn) newBtn.textContent = hasSave ? 'Start a new save' : 'Start a New Save';
    if (noSaveMsg) noSaveMsg.style.display = hasSave ? 'none' : 'block';
    if (meta && hasSave) {
      try {
        const s = await db.leagueState.get(1);
        const label = `${s.currentYear}-${String((s.currentYear || 2028) + 1).slice(2)}`;
        const where = s.ncaaDone ? (s.currentPhase || 'Offseason') : s.confChampsDone ? 'NCAA Tournament'
          : s.regularSeasonDone ? 'Conference tournaments' : s.currentWeek ? `Week ${s.currentWeek}` : 'Preseason';
        const seasons = (s.seasonHistory || []).length;
        meta.textContent = `${label} · ${where}${seasons ? ` · ${seasons} season${seasons === 1 ? '' : 's'} played` : ''}`;
      } catch (e) { meta.textContent = 'Saved in this browser'; }
    }
  },

  // ---------- Season track ----------

  SEASON_STEPS: [
    { key: 'pre', label: 'Preseason' },
    { key: 'nonconf', label: 'Non-Conference' },
    { key: 'conf', label: 'Conference Play' },
    { key: 'confT', label: 'Conf. Tournaments' },
    { key: 'ncaa', label: 'NCAA Tournament' },
    { key: 'off', label: 'Offseason' }
  ],

  seasonStepKey() {
    const s = this.state;
    if (s.ncaaDone) return 'off';
    if (s.confChampsDone) return 'ncaa';
    if (s.regularSeasonDone) return 'confT';
    if (s.week === 0) return 'pre';
    return s.week > s.nonConfEnd ? 'conf' : 'nonconf';
  },

  phaseText() {
    const s = this.state;
    const k = this.seasonStepKey();
    if (k === 'off') return s.phase && /Offseason/.test(s.phase) ? s.phase.replace('Offseason — ', 'Offseason · ') : 'Offseason';
    if (k === 'ncaa') {
      const played = s.ncaaTournament ? s.ncaaTournament.rounds.length : 0;
      return played === 0 ? 'Selection Sunday' : `NCAA Tournament · ${this.NCAA_ROUND_NAMES[played - 1] || ''} done`;
    }
    if (k === 'confT') return 'Conference tournaments';
    if (k === 'pre') return 'Preseason';
    const total = s.confEnd || 15;
    return `${k === 'conf' ? 'Conference play' : 'Non-conference'} · Week ${s.week} of ${total}`;
  },

  seasonProgress() {
    const s = this.state;
    const total = (s.confEnd || 15) + 1 + 6;   // weeks, conference tournaments, six NCAA rounds
    if (s.ncaaDone) return 1;
    let done = s.week || 0;
    if (s.regularSeasonDone) done = s.confEnd || done;
    if (s.confChampsDone) done += 1 + (s.ncaaTournament ? s.ncaaTournament.rounds.length : 0);
    return Math.max(0, Math.min(1, done / total));
  },

  renderSeasonTrack() {
    const el = document.getElementById('seasonTrack');
    const s = this.state;
    const at = this.SEASON_STEPS.findIndex(x => x.key === this.seasonStepKey());
    if (el) {
      const sub = {
        pre: s.week === 0 && !s.ncaaDone ? `${s.teams.length} teams` : 'Rosters set',
        nonconf: s.nonConfEnd ? `Weeks 1–${s.nonConfEnd}` : 'Early season',
        conf: s.confEnd ? `Weeks ${s.nonConfEnd + 1}–${s.confEnd}` : 'League play',
        confT: s.confChampsDone ? `${Object.keys(s.confTournaments || {}).length} champions` : 'Automatic bids',
        ncaa: s.ncaaDone && s.ncaaTournament && s.ncaaTournament.champion ? `${s.ncaaTournament.champion.school} won it` : 'Field of 68',
        off: s.ncaaDone ? (this.OFFSEASON_STAGES[s.offseasonStageIndex || 0] || { label: 'Rosters' }).label : 'Draft & portal'
      };
      el.innerHTML = this.SEASON_STEPS.map((st, i) => `
        <li class="${i < at ? 'done' : i === at ? 'current' : ''}${i > at && this.trackSkipTarget(st.key) ? ' skippable' : ''}" ${st.key === 'off' && s.ncaaDone ? 'onclick="SimEngine.openOffseason()" role="button" tabindex="0"' : (i > at && this.trackSkipTarget(st.key) ? `onclick="SimEngine.confirmSkip('${this.trackSkipTarget(st.key)}')" role="button" tabindex="0" title="Skip ahead to ${st.label}"` : '')}>
          <span class="stage-dot">${i < at ? '✓' : i + 1}</span>
          <span><b>${st.label}</b><small>${sub[st.key]}</small></span>
        </li>`).join('');
    }
    const bar = document.getElementById('seasonProgress');
    if (bar) bar.style.width = `${Math.round(this.seasonProgress() * 100)}%`;
  },

  // ---------- Toasts ----------

  toast(title, sub, ms = 4200) {
    if (typeof document === 'undefined') return;
    if (this._skipping) return;
    if (this.holdForLive(() => this.toast(title, sub, ms))) return;
    let wrap = document.querySelector('.rp-toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'rp-toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'rp-toast';
    t.setAttribute('role', 'status');
    t.innerHTML = `<div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    wrap.appendChild(t);
    while (wrap.children.length > 2) wrap.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  },

  // What happened this week, in a sentence: ranked teams that lost.
  summarizeWeek(games, rankBefore) {
    const upsets = [];
    games.forEach(g => {
      if (!g.played || !g.result) return;
      const homeWon = g.result.homeScore > g.result.awayScore;
      const winner = homeWon ? g.home : g.away, loser = homeWon ? g.away : g.home;
      const lr = rankBefore[loser], wr = rankBefore[winner];
      if (lr && (!wr || wr > lr)) upsets.push({ winner, loser, lr, wr, score: `${Math.max(g.result.homeScore, g.result.awayScore)}-${Math.min(g.result.homeScore, g.result.awayScore)}` });
    });
    upsets.sort((a, b) => a.lr - b.lr);
    const top = upsets[0];
    return {
      week: this.state.week, games: games.length, upsets: upsets.length,
      headline: top ? `${top.wr ? 'No. ' + top.wr + ' ' : ''}${top.winner} beat No. ${top.lr} ${top.loser}, ${top.score}` : null
    };
  },

  // ---------- Dashboard ----------

  updateDashboard() {
    const s = this.state;
    const banner = document.getElementById('dashOffseasonBanner');
    if (banner) {
      banner.style.display = s.ncaaDone ? 'flex' : 'none';
      const st = this.OFFSEASON_STAGES[s.offseasonStageIndex || 0];
      const lbl = document.getElementById('dashOffseasonStage');
      if (lbl) lbl.textContent = st ? `Next up: ${st.label}` : '';
    }
    const dashTopTeams = document.getElementById('dashTopTeams');
    if (dashTopTeams) {
      const top25 = this.getCurrentTop25().slice(0, 25);
      const isPreseason = s.week === 0;
      if (top25.length === 0) {
        dashTopTeams.innerHTML = `<p class="sub-text">Start a save to generate rankings.</p>`;
      } else {
        const row = (t, i) => {
          const rank = i + 1;
          const prev = t.prevApRank;
          const move = isPreseason ? '' : !prev ? '<span class="poll-move new">NEW</span>'
            : prev > rank ? `<span class="poll-move up">▲${prev - rank}</span>` : prev < rank ? `<span class="poll-move down">▼${rank - prev}</span>` : '<span class="poll-move same">—</span>';
          const rec = isPreseason ? (t.conference || '') : `${t.simData.wins}-${t.simData.losses}`;
          return `<li class="poll-row" onclick="SimEngine.goToTeamPage('${this.jsArg(t.school)}')" style="--d:${i * 22}ms">
            <span class="poll-rank">${rank}</span>
            <img src="${this.getTeamLogo(t.school)}" class="poll-logo" alt="">
            <span class="poll-team">${this.esc(t.school)}</span>
            <span class="poll-rec">${rec}</span>${move}
          </li>`;
        };
        dashTopTeams.innerHTML = `<ol class="poll-list">${top25.map(row).join('')}</ol>`;
      }
    }
    const labelEl = document.getElementById('dashPollLabel');
    if (labelEl) labelEl.innerText = s.week === 0 ? 'Preseason Top 25' : 'AP Top 25';
    const pollSub = document.getElementById('dashPollSub');
    if (pollSub) pollSub.textContent = s.week === 0 ? 'Projected from rosters and recruiting' : (s.lastWeekSummary && s.lastWeekSummary.upsets
      ? `After week ${s.week} · ${s.lastWeekSummary.upsets} ranked team${s.lastWeekSummary.upsets === 1 ? '' : 's'} lost` : `After week ${s.week}`);

    if (s.week > 0) {
      this.populateDashList('dashPts', 'ppg');
      this.populateDashList('dashReb', 'rpg');
      this.populateDashList('dashAst', 'apg');
      this.populateDashList('dashStl', 'stl');
      this.populateDashList('dashBlk', 'blk');
    } else {
      ['dashPts', 'dashReb', 'dashAst', 'dashStl', 'dashBlk'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<p class="sub-text-sm">After week 1.</p>';
      });
    }
    const perfSub = document.getElementById('dashPerfSub');
    if (perfSub) perfSub.textContent = s.week ? `Week ${s.week}, by game score` : 'By game score, once games are played';

    this.renderDashWatch();
    this.renderDashDraft();
    this.updateTopPerformances();
    this.updateDashboardBracket();
  },

  // The week ahead: the best ranked matchups, or in March, who's left.
  renderDashWatch() {
    const el = document.getElementById('dashWatch');
    if (!el) return;
    const s = this.state;
    const title = document.getElementById('dashWatchTitle');
    const sub = document.getElementById('dashWatchSub');
    const team = (school) => `<span class="watch-team" onclick="event.stopPropagation();SimEngine.goToTeamPage('${this.jsArg(school)}')">
      <img src="${this.getTeamLogo(school)}" alt="" class="xs-logo">${this.rankTag(school)}${this.esc(school)}</span>`;

    if (!s.regularSeasonDone && s.teams.length) {
      const next = s.week + 1;
      const games = (s.schedule || []).filter(g => g.week === next && !g.played)
        .map(g => {
          const a = this.findTeam(g.home), b = this.findTeam(g.away);
          const ra = this.pollRankOf(a) || 40, rb = this.pollRankOf(b) || 40;
          return { g, weight: Math.min(ra, rb) + Math.max(ra, rb) * 0.6, ranked: ra < 40 || rb < 40 };
        })
        .filter(x => x.ranked).sort((a, b) => a.weight - b.weight).slice(0, 5);
      if (title) title.textContent = 'Games to Watch';
      if (sub) sub.textContent = `Week ${next}`;
      el.innerHTML = games.length ? `<ul class="watch-list">${games.map(({ g }) => `<li>${team(g.away)}<span class="watch-at">at</span>${team(g.home)}${g.isConf ? '<span class="watch-tag">Conf</span>' : ''}<span class="watch-tip">${this.tipLabel({ home: g.home, away: g.away, week: g.week, phase: g.isConf ? 'conf' : 'nonconf' })}</span>${this.watchListBtn(g.home, g.away, g.week, g.isConf ? 'conf' : 'nonconf')}<button type="button" class="watch-btn sm" onclick="${this.watchGameJs(g.home, g.away, g.week, g.isConf ? 'conf' : 'nonconf')}" aria-label="Watch ${this.esc(g.away)} at ${this.esc(g.home)} live">&#9654; Watch</button></li>`).join('')}</ul>`
        : '<p class="sub-text-sm">No ranked teams play next week.</p>';
      return;
    }
    // Tournament time: the next round's games, any of them watchable.
    const nextUp = s.confChampsDone && !s.ncaaDone ? this.upcomingNcaaGames() : [];
    if (nextUp.length) {
      const seeds = s.ncaaSelection ? this.selectionSeeds(s.ncaaSelection) : {};
      const sd = sc => (seeds[sc] || {}).seed || 17;
      const games = nextUp.slice().sort((x, y) => (sd(x.home) + sd(x.away)) - (sd(y.home) + sd(y.away))).slice(0, 8);
      const seedTag = sc => (seeds[sc] ? `<span class="rank-tag">${seeds[sc].seed}</span>` : '');
      const tm = sc => `<span class="watch-team" onclick="event.stopPropagation();SimEngine.goToTeamPage('${this.jsArg(sc)}')"><img src="${this.getTeamLogo(sc)}" alt="" class="xs-logo">${seedTag(sc)}${this.esc(sc)}</span>`;
      if (title) title.textContent = nextUp[0].label.split(' · ')[0];
      if (sub) sub.textContent = `${nextUp.length} game${nextUp.length === 1 ? '' : 's'} · watch any of them live`;
      el.innerHTML = `<ul class="watch-list">${games.map(g => `<li>${tm(g.home)}<span class="watch-at">vs</span>${tm(g.away)}<span class="watch-tip">${this.tipLabel({ home: g.home, away: g.away, week: g.week, phase: 'ncaa' })}</span>${this.watchListBtn(g.home, g.away, g.week, 'ncaa')}<button type="button" class="watch-btn sm" onclick="${this.watchGameJs(g.home, g.away, g.week, 'ncaa')}">&#9654; Watch</button></li>`).join('')}</ul>`;
      return;
    }
    if (s.confChampsDone && !s.ncaaDone && s.ncaaTournament) {
      const t = s.ncaaTournament;
      const last = t.rounds.length ? t.rounds[t.rounds.length - 1] : null;
      const alive = last ? last.map(g => g.winner.school) : [];
      const seeds = s.ncaaSelection ? this.selectionSeeds(s.ncaaSelection) : {};
      const list = alive.sort((a, b) => ((seeds[a] || {}).seed || 99) - ((seeds[b] || {}).seed || 99)).slice(0, 8);
      if (title) title.textContent = 'Still Dancing';
      if (sub) sub.textContent = alive.length ? `${alive.length} teams left` : 'The field is set';
      el.innerHTML = list.length ? `<ul class="watch-list alive">${list.map(sc => `<li>${team(sc)}<span class="watch-tag">${(seeds[sc] || {}).seed ? (seeds[sc].seed + ' seed') : ''}</span></li>`).join('')}</ul>`
        : '<p class="sub-text-sm">Selection Sunday has set the field. The First Four tips off next.</p>';
      return;
    }
    if (title) title.textContent = s.ncaaDone ? 'Champions' : 'Conference Tournaments';
    if (sub) sub.textContent = s.ncaaDone ? `${s.year}-${String(s.year + 1).slice(2)}` : 'Automatic bids on the line';
    if (s.ncaaDone && s.ncaaTournament && s.ncaaTournament.champion) {
      const c = s.ncaaTournament.champion.school;
      el.innerHTML = `<div class="watch-champ" onclick="SimEngine.goToTeamPage('${this.jsArg(c)}')"><img src="${this.getTeamLogo(c)}" alt=""><div><b>${this.esc(c)}</b><span>National Champions</span></div></div>`;
    } else {
      const leaders = (this.autoBidTeams(true) || []).sort((a, b) => this.resumeScore(b) - this.resumeScore(a)).slice(0, 6);
      el.innerHTML = leaders.length ? `<ul class="watch-list">${leaders.map(t => `<li>${team(t.school)}<span class="watch-tag">${this.esc(t.conference)} No. 1 seed</span></li>`).join('')}</ul>` : '';
    }
  },

  reducedMotion() {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  // A team's place in the current poll: the AP Top 25 once games are
  // played, the preseason Top 25 before that.
  pollRankOf(t) {
    if (!t) return null;
    if (this.state.week > 0) return t.apRank || null;
    return t.preseasonRank && t.preseasonRank <= 25 ? t.preseasonRank : null;
  },
  rankTag(school) {
    const r = this.pollRankOf(this.findTeam(school));
    return r ? `<span class="rank-tag">${r}</span>` : '';
  },

  // The Draft RP's big board, previewed.
  renderDashDraft() {
    const el = document.getElementById('dashDraft');
    if (!el) return;
    const s = this.state;
    const sub = document.getElementById('dashDraftSub');
    const cyc = s.draftCycle && s.draftCycle.year === this.upcomingDraftYear() ? s.draftCycle : null;
    if (sub) sub.textContent = s.ncaaDone && cyc && cyc.stage !== 'complete' ? `${this.upcomingDraftYear()} draft cycle: ${(DraftCycle.nextStage(cyc.stage) || {}).label || 'draft night'} next`
      : `Top of the ${this.upcomingDraftYear()} big board`;
    const board = s.teams.length ? this.computeDraftBigBoard(5) : [];
    el.innerHTML = board.length ? `<ol class="draft-watch">${board.map((e, i) => {
      const p = e.player, st = p.stats || {};
      return `<li onclick="SimEngine.openPlayerModal('${this.jsArg(p.id)}')">
        <span class="dw-rank">${i + 1}</span>
        <img src="${this.getTeamLogo(p.school)}" alt="" class="xs-logo">
        <span class="dw-name"><b>${this.esc(p.name)}</b><small>${p.pos} · ${p.class} · ${this.esc(p.school)}</small></span>
        <span class="dw-stat">${s.week > 0 && st.gp ? `${st.ppg}<small>ppg</small>` : ''}</span>
      </li>`;
    }).join('')}</ol>` : '<p class="sub-text-sm">The board fills in once the season starts.</p>';
  },

  // ---------- Offseason ----------

  // The offseason is its own full-screen experience: a track of four
  // steps with one Continue button, and the draft step hands off to the
  // Draft RP.
  openOffseason(stage) {
    this.state.offseasonStage = stage || this.defaultOffseasonView();
    const overlay = document.getElementById('offseasonOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    document.body.classList.add('offseason-open');
    this.renderOffseasonOverlay();
    this.watchForDraft(true);
  },

  closeOffseason() {
    const overlay = document.getElementById('offseasonOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('offseason-open');
    this.watchForDraft(false);
  },

  setOffseasonStage(stage) {
    this.state.offseasonStage = stage;
    this.renderOffseasonOverlay();
  },

  defaultOffseasonView() {
    const idx = this.state.offseasonStageIndex || 0;
    const P = this.state.summer;
    if (idx === 3 && P && P.season === this.summerSeason()) return 'summer';
    return ['champion', 'draft', 'transfers', 'transfers', 'summer'][idx] || 'champion';
  },

  OFFSEASON_VIEWS: [
    { key: 'champion', label: 'Season Wrap-Up', stage: 0 },
    { key: 'draft', label: 'NBA Draft', stage: 1 },
    { key: 'transfers', label: 'Transfer Portal', stage: 2 },
    { key: 'summer', label: 'Summer Circuit', stage: 3 },
    { key: 'rosters', label: 'Final Rosters', stage: 4 }
  ],

  renderOffseasonOverlay() {
    const el = document.getElementById('offseasonBody');
    if (!el) return;
    const s = this.state;
    const idx = s.offseasonStageIndex || 0;
    const view = s.offseasonStage || 'champion';

    const yearEl = document.getElementById('offseasonYear');
    if (yearEl) {
      const y = s.ncaaDone ? s.year : ((s.seasonHistory || []).slice(-1)[0] || { year: s.year }).year;
      const n = this.OFFSEASON_STAGES.length;
      yearEl.innerText = `${y}-${(y + 1).toString().slice(2)} · ${idx < n ? 'Step ' + Math.min(idx + 1, n) + ' of ' + n : 'Complete'}`;
    }

    const track = document.getElementById('offseasonTrack');
    if (track) {
      const done = k => k < idx;
      const sum = this.currentSummer();
      const subs = [
        s.ncaaTournament && s.ncaaTournament.champion ? `${s.ncaaTournament.champion.school} champions` : 'Champions & awards',
        this.isDraftComplete() ? `${(s.draftResults || []).length} picks made` : 'In the Draft RP',
        (s.lastTransfers || []).length && idx >= 3 ? `${s.lastTransfers.length} moves` : 'Players on the move',
        sum && sum.season === this.summerSeason() ? (sum.done === false ? `${sum.steps[sum.step] ? sum.steps[sum.step].short + ' next' : ''}` : `${sum.aau.programs.length} programs${sum.fiba ? ' · ' + sum.fiba.short : ''}`) : 'AAU & FIBA',
        'New season'
      ];
      track.innerHTML = this.OFFSEASON_VIEWS.map((v, i) => `
        <li class="${done(i) ? 'done' : i === idx ? 'current' : ''} ${view === v.key ? 'viewing' : ''}"
            ${done(i) || i === idx ? `onclick="SimEngine.setOffseasonStage('${v.key === 'rosters' ? 'transfers' : v.key}')" role="button" tabindex="0"` : ''}>
          <span class="stage-dot">${done(i) ? '✓' : i + 1}</span>
          <span><b>${v.label}</b><small>${subs[i]}</small></span>
        </li>`).join('');
    }

    // The action button names whatever comes next.
    const actionBtn = document.getElementById('offseasonAdvanceBtn');
    if (actionBtn) {
      const next = this.OFFSEASON_STAGES[idx];
      const waiting = next && next.key === 'draft' && !this.isDraftComplete() && idx === 1;
      actionBtn.disabled = !!waiting;
      actionBtn.classList.toggle('waiting', !!waiting);
      actionBtn.innerText = waiting ? 'Waiting on draft night' : !next ? 'Start the new season'
        : idx === 0 ? 'Continue to the NBA Draft'
        : next.key === 'draft' ? 'Continue to the Transfer Portal'
        : next.key === 'portal' ? 'Open the Transfer Portal'
        : next.key === 'summer' ? this.summerButtonLabel()
        : 'Set rosters & start next season';
    }

    const body = view === 'draft' ? this.renderOffseasonDraft()
      : view === 'transfers' ? this.renderOffseasonTransfers()
      : view === 'summer' ? this.renderOffseasonSummer()
      : this.renderOffseasonChampion();
    el.innerHTML = `<div class="rp-rise">${body}</div>`;
  },

  // The overlay's Continue button.
  async advanceFromOffseason() {
    const btn = document.getElementById('offseasonAdvanceBtn');
    if ((btn && btn.disabled) || this.isSimBusy()) return;
    if (btn) btn.disabled = true;
    this._simBusy = true;
    try { await this.runOffseason(); }
    finally { this._simBusy = false; if (btn) btn.disabled = false; this.renderOffseasonOverlay(); }
  },

  renderOffseasonDraft() {
    const s = this.state;
    const year = this.upcomingDraftYear();
    const cyc = s.draftCycle && s.draftCycle.year === year ? s.draftCycle : null;
    const complete = this.isDraftComplete();
    const idx = s.offseasonStageIndex || 0;

    if (!complete) {
      const at = cyc ? DraftCycle.stageIndex(cyc.stage) : 0;
      const steps = DraftCycle.STAGES.map((st, i) => `<li class="${i <= at ? 'done' : i === at + 1 ? 'next' : ''}"><span class="stage-dot">${i <= at ? '✓' : i + 1}</span><b>${st.label}</b></li>`).join('');
      const declared = (s.draftDeclarations || []).slice().sort((a, b) => (a.boardRank || 999) - (b.boardRank || 999)).slice(0, 10);
      return `<div class="draft-gate">
        <div class="draft-gate-main card">
          <div class="draft-gate-kicker">${year} NBA Draft</div>
          <h2>The draft happens in the Draft RP</h2>
          <p>Declarations are in. The combine, the lottery, team workouts, the withdrawal deadline and draft night all play out in the Draft RP — with measurements, athletic testing and workout reports for every prospect.</p>
          <ol class="gate-steps">${steps}</ol>
          <a class="sim-btn sim-main" href="./draft.html">Open the Draft RP &rarr;</a>
          <p class="sub-text-sm">${idx === 0 ? 'You can go now, or finish the season wrap-up first.' : 'The NCAA RP carries on to the transfer portal once draft night is over. Come back here after the last pick.'}</p>
        </div>
        <div class="card">
          <div class="section-head"><div><h3 class="section-title">Top declared prospects</h3><p class="section-sub">${(s.draftDeclarations || []).length} players in the ${year} class</p></div></div>
          <ol class="draft-watch">${declared.map((d, i) => `<li onclick="SimEngine.openPlayerModal('${this.jsArg(d.id)}')">
            <span class="dw-rank">${i + 1}</span><img src="${this.getTeamLogo(d.school)}" class="xs-logo" alt="">
            <span class="dw-name"><b>${this.esc(d.name)}</b><small>${d.pos} · ${d.class} · ${this.esc(d.school)}</small></span>
            <span class="dw-stat">${d.ppg}<small>ppg</small></span></li>`).join('')}</ol>
        </div>
      </div>`;
    }

    const picks = s.draftResults && s.draftResults.length ? s.draftResults : ((s.draftHistory || []).find(d => d.year === year) || {}).picks || [];
    const nbaLogo = t => `../nbalogos/${encodeURIComponent(t.logo)}.png`;
    const bySchool = {};
    picks.forEach(p => { bySchool[p.school] = (bySchool[p.school] || 0) + 1; });
    const topSchools = Object.entries(bySchool).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const first = picks[0];
    const back = s.returningPlayers || [];
    return `<div class="draft-recap">
      ${first ? `<div class="card draft-first">
        <div class="draft-gate-kicker">No. 1 pick · ${year} NBA Draft</div>
        <div class="draft-first-row">${first.team ? `<img src="${nbaLogo(first.team)}" alt="" onerror="this.remove()">` : ''}
          <div><b class="clickable-player" onclick="SimEngine.openPlayerModal('${this.jsArg(first.id)}')">${this.esc(first.name)}</b><span>${first.pos} · ${this.esc(first.school)}${first.team ? ' → ' + first.team.name : ''}</span></div></div>
        <a class="text-link" href="./draft.html?view=mock">Every pick, the combine and workouts on the Draft RP &rarr;</a>
      </div>` : ''}
      <div class="draft-recap-grid">
        <div class="card"><div class="section-head"><h3 class="section-title">First round</h3></div>
          <div class="table-scroll"><table class="data-table compact">
            <thead><tr><th>Pick</th><th>Team</th><th>Player</th><th>School</th></tr></thead><tbody>
            ${picks.filter(p => p.round === 1).map(d => `<tr>
              <td class="rank-cell">${d.pick}</td>
              <td>${d.team ? `<div class="team-cell-wrap"><img src="${nbaLogo(d.team)}" class="xs-logo" alt="" onerror="this.remove()"><span>${d.team.name}</span></div>` : '—'}</td>
              <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${this.jsArg(d.id)}')">${this.esc(d.name)}</span></td>
              <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(d.school)}" class="xs-logo" alt=""><span>${this.esc(d.school)}</span></div></td>
            </tr>`).join('')}</tbody></table></div></div>
        <div class="draft-recap-side">
          <div class="card"><div class="section-head"><h3 class="section-title">Most picks</h3></div>
            <ul class="count-list">${topSchools.map(([sc, n]) => `<li onclick="SimEngine.goToTeamPage('${this.jsArg(sc)}');SimEngine.closeOffseason()"><img src="${this.getTeamLogo(sc)}" class="xs-logo" alt=""><span>${this.esc(sc)}</span><b>${n}</b></li>`).join('')}</ul></div>
          <div class="card"><div class="section-head"><h3 class="section-title">Back to school</h3><p class="section-sub">${back.length} withdrew at the deadline</p></div>
            <ul class="count-list">${back.slice().sort((a, b) => (a.boardRank || 999) - (b.boardRank || 999)).slice(0, 8).map(r => `<li onclick="SimEngine.openPlayerModal('${this.jsArg(r.id)}')"><img src="${this.getTeamLogo(r.school)}" class="xs-logo" alt=""><span>${this.esc(r.name)}</span><small>${this.esc(r.school)}</small></li>`).join('') || '<li><span class="sub-text-sm">Nobody withdrew.</span></li>'}</ul></div>
        </div>
      </div>
    </div>`;
  },

  // While the draft step is waiting, returning to this tab picks up
  // whatever happened in the Draft RP.
  watchForDraft(on) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (!this._draftWatcher) {
      this._draftWatcher = async () => {
        if (document.visibilityState === 'hidden' || !this.state.ncaaDone) return;
        const was = this.isDraftComplete();
        // The Draft RP or the Recruiting page (the summer) may have moved on.
        const changed = (await this.syncDraftFromDB()) | (await this.syncSummerFromDB());
        if (!changed) return;
        this.renderOffseasonOverlay();
        this.syncUI();
        if (!was && this.isDraftComplete()) this.toast('Draft night is over', 'Continue to the transfer portal whenever you are ready.');
      };
    }
    document.removeEventListener('visibilitychange', this._draftWatcher);
    window.removeEventListener('focus', this._draftWatcher);
    if (on) {
      document.addEventListener('visibilitychange', this._draftWatcher);
      window.addEventListener('focus', this._draftWatcher);
    }
  },

  // ---------- Cutscenes ----------

  playSeasonIntro(opts = {}) {
    if (typeof Cutscene === 'undefined' || !Cutscene.enabled() || !this.state.teams.length) return;
    const C = Cutscene;
    const s = this.state;
    const label = `${s.year}-${String(s.year + 1).slice(2)}`;
    const top = this.getCurrentTop25().slice(0, 5);
    const pa = s.preseasonAwards || {};
    const stars = (pa.allAmericans || []).slice(0, 5);
    const fresh = s.activePlayers.filter(p => p.class === 'FR').sort((a, b) => (parseFloat(a.rsci) || 999) - (parseFloat(b.rsci) || 999) || b.rating - a.rating).slice(0, 5);
    const logo = sc => `<img src="${this.getTeamLogo(sc)}" alt="" class="cs-logo">`;
    const scenes = [];
    if (opts.fromOffseason) {
      const moves = (s.lastTransfers || []).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
      scenes.push({ ms: 2600, html: C.titleCard('Offseason complete', 'Rosters<br>Are Set', `Seniors graduated. Freshmen arrived. ${moves.length ? (s.lastTransfers || []).length + ' players transferred.' : ''}`) });
      if (moves.length) scenes.push({ ms: 4000, html: C.heading('Biggest moves') + `<div class="cs-list">${moves.map((t, i) => `<div class="cs-row cs-item" style="--d:${i * 170}ms">${logo(t.from)}<span class="cs-arrow">&rarr;</span>${logo(t.to)}<span class="cs-name">${this.esc(t.name)}</span><span class="cs-meta">${t.pos} · ${this.esc(t.from)} to ${this.esc(t.to)}</span></div>`).join('')}</div>` });
    }
    scenes.push({ ms: 2800, html: C.titleCard('BYTHERIM NCAA RP', `${label}<br>Season`, `${s.teams.length} teams. One champion.`) });
    if (top.length) scenes.push({ ms: 4200, html: C.heading('Preseason Top 5') + `<div class="cs-cards">${top.map((t, i) => `<div class="cs-card cs-item" style="--d:${200 + i * 300}ms"><div class="cs-card-kicker">No. ${i + 1}</div><img src="${this.getTeamLogo(t.school)}" alt="" class="cs-logo"><div class="cs-card-name">${this.esc(t.school)}</div><div class="cs-card-meta">${this.esc(t.conference)}</div></div>`).join('')}</div>` });
    if (stars.length) scenes.push({ ms: 4000, html: C.heading('Players to watch', pa.poy ? `${this.esc(pa.poy.name)} opens the year as the favorite for Player of the Year.` : '') +
      `<div class="cs-list">${stars.map((p, i) => `<div class="cs-row cs-item" style="--d:${i * 150}ms">${logo(p.school)}<span class="cs-name">${this.esc(p.name)}</span><span class="cs-meta">${p.pos} · ${p.class} · ${this.esc(p.school)}</span></div>`).join('')}</div>` });
    if (fresh.length) scenes.push({ ms: 3800, html: C.heading('Freshmen to watch') +
      `<div class="cs-list">${fresh.map((p, i) => `<div class="cs-row cs-item" style="--d:${i * 150}ms">${logo(p.school)}<span class="cs-name">${this.esc(p.name)}</span><span class="cs-meta">${p.pos} · ${this.esc(p.school)}${p.rsci ? ' · No. ' + p.rsci + ' recruit' : ''}</span></div>`).join('')}</div>` });
    scenes.push({ ms: 0, html: C.titleCard('', '<span class="small">Tip-off</span>', 'Simulate a week at a time, or follow every team from the dashboard.') });
    C.play({ id: 'seasonIntro', label: `${label} season`, scenes, actions: [{ label: "Let's play", primary: true }] });
  },

  playSeasonWrap() {
    if (typeof Cutscene === 'undefined' || !Cutscene.enabled()) return;
    const s = this.state;
    const t = s.ncaaTournament;
    if (!t || !t.champion) return;
    const C = Cutscene;
    const champ = t.champion.school;
    const team = this.findTeam(champ);
    const final = t.rounds[t.rounds.length - 1] && t.rounds[t.rounds.length - 1][0];
    const runner = final ? (final.winner.school === final.teamA.school ? final.teamB.school : final.teamA.school) : null;
    const score = final && final.result ? `${Math.max(final.result.homeScore, final.result.awayScore)}-${Math.min(final.result.homeScore, final.result.awayScore)}` : '';
    const ff = t.rounds[4] ? t.rounds[4].flatMap(g => [g.teamA.school, g.teamB.school]) : [];
    const seeds = s.ncaaSelection ? this.selectionSeeds(s.ncaaSelection) : {};
    let npoy = null;
    try { npoy = this.computeNationalAwards().npoy; } catch (e) { npoy = null; }
    const label = `${s.year}-${String(s.year + 1).slice(2)}`;
    const scenes = [
      { ms: 4200, html: C.confetti(70) + `<img src="${this.getTeamLogo(champ)}" alt="" class="cs-logo big">` + C.titleCard(`${label} National Champions`, this.esc(champ), team ? `${team.simData.wins}-${team.simData.losses}${(seeds[champ] || {}).seed ? ` · ${seeds[champ].seed} seed` : ''}` : '') },
      runner ? { ms: 3200, html: C.heading('The title game') + `<div class="cs-stats"><div class="cs-stat"><b>${score}</b><span>${this.esc(champ)} over ${this.esc(runner)}</span></div></div>` } : null,
      ff.length ? { ms: 3600, html: C.heading('The Final Four') + `<div class="cs-cards">${ff.map((sc, i) => `<div class="cs-card cs-item" style="--d:${150 + i * 220}ms"><img src="${this.getTeamLogo(sc)}" alt="" class="cs-logo"><div class="cs-card-name">${this.esc(sc)}</div><div class="cs-card-meta">${(seeds[sc] || {}).seed ? seeds[sc].seed + ' seed' : ''}</div></div>`).join('')}</div>` } : null,
      (s.postseasonHonors && s.postseasonHonors.finalFour) ? (() => { const m = s.postseasonHonors.finalFour.mop; return { ms: 3400, html: C.heading('Most Outstanding Player') + `<div class="cs-card" style="max-width:380px;margin:0 auto"><img src="${this.getTeamLogo(m.school)}" alt="" class="cs-logo"><div class="cs-card-name">${this.esc(m.name)}</div><div class="cs-card-meta">${this.esc(m.school)} · ${this.esc(m.line)}</div></div>` }; })() : null,
      npoy ? { ms: 3600, html: C.heading('Player of the Year') + `<div class="cs-card" style="max-width:360px;margin:0 auto"><img src="${this.getTeamLogo(npoy.school)}" alt="" class="cs-logo"><div class="cs-card-name">${this.esc(npoy.name)}</div><div class="cs-card-meta">${this.esc(npoy.school)} · ${npoy.stats.ppg} ppg · ${npoy.stats.rpg} rpg · ${npoy.stats.apg} apg</div></div>` } : null,
      { ms: 0, html: C.titleCard('', '<span class="small">The offseason begins</span>', `${(s.draftDeclarations || []).length} players have declared for the ${this.upcomingDraftYear()} NBA Draft.`) }
    ];
    C.play({ id: 'seasonWrap', theme: 'gold', label: 'National Champions', scenes, actions: [{ label: 'Enter the offseason', primary: true }] });
  },

  // A short scene for each offseason step as it happens.
  playOffseasonScene(key) {
    if (typeof Cutscene === 'undefined' || !Cutscene.enabled()) return;
    const C = Cutscene;
    const s = this.state;
    const logo = sc => `<img src="${this.getTeamLogo(sc)}" alt="" class="cs-logo">`;
    const yr = this.upcomingDraftYear();
    if (key === 'summary') {
      const d = (s.draftDeclarations || []).slice().sort((a, b) => (a.boardRank || 999) - (b.boardRank || 999));
      C.play({ id: 'declarationsShow', theme: 'draft', label: 'Draft declarations', scenes: [
        { ms: 2600, html: C.titleCard(`${yr} NBA Draft`, 'Declared', `<span data-count="${d.length}">0</span> players are entering the draft.`) },
        { ms: 4200, html: C.heading('The headliners') + `<div class="cs-list">${d.slice(0, 6).map((x, i) => `<div class="cs-row cs-item" style="--d:${i * 160}ms"><span class="cs-rank">${i + 1}</span>${logo(x.school)}<span class="cs-name">${this.esc(x.name)}</span><span class="cs-meta">${x.pos} · ${x.class} · ${this.esc(x.school)}</span></div>`).join('')}</div>` },
        { ms: 0, html: C.titleCard('', '<span class="small">On to the Draft RP</span>', 'The combine, lottery, workouts and draft night happen there. The NCAA RP waits for the last pick.') }
      ], actions: [{ label: 'Open the Draft RP', primary: true, run: () => { location.href = './draft.html'; } }, { label: 'Stay here' }] });
    } else if (key === 'draft') {
      const picks = s.draftResults || [];
      if (!picks.length) return;
      const nba = t => t ? `<img src="../nbalogos/${encodeURIComponent(t.logo)}.png" alt="" class="cs-logo" onerror="this.remove()">` : '';
      C.play({ id: 'draftRecapShow', theme: 'draft', label: 'Draft recap', scenes: [
        { ms: 3200, html: `<div class="cs-kicker">${yr} NBA Draft · No. 1 pick</div><div class="cs-pick"><div class="cs-pick-name">${this.esc(picks[0].name)}</div><div class="cs-pick-team">${nba(picks[0].team)}${picks[0].team ? picks[0].team.name : ''}</div><div class="cs-pick-meta">${this.esc(picks[0].school)}</div></div>` },
        { ms: 0, html: C.titleCard('', '<span class="small">Next: the transfer portal</span>') }
      ], actions: [{ label: 'Continue', primary: true }] });
    } else if (key === 'portal') {
      const moves = (s.lastTransfers || []).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
      C.play({ id: 'portalShow', label: 'Transfer portal', scenes: [
        { ms: 2600, html: C.titleCard('Offseason', 'The Portal<br>Is Open', `<span data-count="${moves.length}">0</span> players are on the move.`) },
        moves.length ? { ms: 4600, html: C.heading('Biggest names') + `<div class="cs-list">${moves.slice(0, 6).map((t, i) => `<div class="cs-row cs-item" style="--d:${i * 170}ms">${logo(t.from)}<span class="cs-arrow">&rarr;</span>${logo(t.to)}<span class="cs-name">${this.esc(t.name)}</span><span class="cs-meta">${t.pos} · ${t.ppg} ppg · ${this.esc(t.reason || '')}</span></div>`).join('')}</div>` } : null,
        { ms: 0, html: C.titleCard('', '<span class="small">Every move is in</span>') }
      ], actions: [{ label: 'See every transfer', primary: true }] });
    } else if (key === 'summer') {
      const sm = this.currentSummer();
      if (!sm || !sm.aau) return;
      const circs = sm.aau.circuits;
      C.play({ id: 'summerShow', label: 'Summer circuit', scenes: [
        { ms: 2600, html: C.titleCard(`Summer ${sm.season}`, 'The Summer<br>Circuit', `${sm.aau.programs.length} AAU programs${sm.fiba ? ` and the ${this.esc(sm.fiba.name)}` : ''}.`) },
        { ms: 4200, html: C.heading('On the schedule') + `<div class="cs-list">${circs.map((c, i) => `<div class="cs-row cs-item" style="--d:${i * 170}ms"><span class="cs-name">${this.esc(c.name)}</span><span class="cs-meta">${c.programs} programs · four sessions, then the ${this.esc(c.event)}</span></div>`).join('')}${sm.fiba ? `<div class="cs-row cs-item" style="--d:${circs.length * 170}ms"><span class="cs-name">${this.esc(sm.fiba.name)}</span><span class="cs-meta">16 nations · groups, then the knockouts</span></div>` : ''}</div>` },
        { ms: 0, html: C.titleCard('', '<span class="small">Session 1 is in the books</span>') }
      ], actions: [{ label: 'See the summer', primary: true }] });
    }
  },

  // --- Record books ---
  //
  // Every completed season is already archived per player and per team, so
  // the record books are derived on demand rather than maintained
  // separately — nothing can drift out of sync with the season archive.

  // Career totals for everyone with at least one archived season, plus the
  // players currently active.
  buildCareerIndex() {
    const careers = {};
    const consider = this.state.activePlayers.concat(this.state.departedArchive || []);
    consider.forEach(p => {
      const seasons = p.seasonHistory || [];
      if (seasons.length === 0) return;
      const c = careers[p.id] || (careers[p.id] = {
        id: p.id, name: p.name, schools: [], seasons: 0,
        pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, gp: 0
      });
      seasons.forEach(h => {
        const st = h.stats || {};
        const gp = st.gp || 0;
        c.seasons += 1;
        c.gp += gp;
        c.pts += (parseFloat(st.ppg) || 0) * gp;
        c.reb += (parseFloat(st.rpg) || 0) * gp;
        c.ast += (parseFloat(st.apg) || 0) * gp;
        c.stl += (parseFloat(st.stl) || 0) * gp;
        c.blk += (parseFloat(st.blk) || 0) * gp;
        if (!c.schools.includes(h.school)) c.schools.push(h.school);
      });
    });
    return Object.values(careers);
  },

  // Best individual SEASONS on record, optionally limited to one school.
  bestSeasons(statKey, limit = 10, school = null) {
    const out = [];
    this.state.activePlayers.concat(this.state.departedArchive || []).forEach(p => {
      (p.seasonHistory || []).forEach(h => {
        if (school && h.school !== school) return;
        if ((h.stats.gp || 0) < 12) return;
        out.push({
          name: p.name, id: p.id, school: h.school, year: h.year,
          value: parseFloat(h.stats[statKey]) || 0
        });
      });
    });
    return out.sort((a, b) => b.value - a.value).slice(0, limit);
  },

  careerLeaders(field, limit = 10, school = null) {
    let careers = this.buildCareerIndex();
    if (school) careers = careers.filter(c => c.schools.includes(school));
    return careers
      .map(c => ({ ...c, value: c[field] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  },

  setRecordsScope(school) {
    this.state.recordsScope = school === 'ALL' ? null : school;
    this.updateRecordsTab();
  },

  setRecordsMode(mode) {
    this.state.recordsMode = mode;
    this.updateRecordsTab();
  },

  updateRecordsTab() {
    const el = document.getElementById('recordsContainer');
    if (!el) return;

    const anyHistory = this.state.activePlayers.some(p => (p.seasonHistory || []).length > 0);
    if (!anyHistory) {
      el.innerHTML = `<p class="empty-table-msg">Record books build as seasons are completed. Finish a season and advance the offseason to begin.</p>`;
      return;
    }

    const scope = this.state.recordsScope || null;
    const mode = this.state.recordsMode || 'season';
    const schools = [...new Set(this.state.teams.map(t => t.school))].sort();

    const picker = `<div class="filters-container mb-1">
      <select class="filter-select" onchange="SimEngine.setRecordsScope(this.value)">
        <option value="ALL">All of Division I</option>
        ${schools.map(sc => `<option value="${sc}" ${sc === scope ? 'selected' : ''}>${sc}</option>`).join('')}
      </select>
      <select class="filter-select" onchange="SimEngine.setRecordsMode(this.value)">
        <option value="season" ${mode === 'season' ? 'selected' : ''}>Single-Season Records</option>
        <option value="career" ${mode === 'career' ? 'selected' : ''}>Career Records</option>
      </select>
    </div>`;

    const playerLink = (r) =>
      `<span class="clickable-player" onclick="SimEngine.openPlayerModal('${String(r.id).replace(/'/g, "\\'")}')">${r.name}</span>`;
    const teamLink = (sc) =>
      `<span class="clickable-school" onclick="SimEngine.goToTeamPage('${String(sc).replace(/'/g, "\\'")}')">${sc}</span>`;

    const cats = mode === 'season'
      ? [['ppg', 'Points Per Game'], ['rpg', 'Rebounds Per Game'], ['apg', 'Assists Per Game'],
         ['stl', 'Steals Per Game'], ['blk', 'Blocks Per Game'], ['bpm', 'Box Plus/Minus']]
      : [['pts', 'Career Points'], ['reb', 'Career Rebounds'], ['ast', 'Career Assists'],
         ['stl', 'Career Steals'], ['blk', 'Career Blocks'], ['gp', 'Games Played']];

    const cards = cats.map(([key, label]) => {
      const rows = mode === 'season'
        ? this.bestSeasons(key, 10, scope)
        : this.careerLeaders(key, 10, scope);
      const body = rows.map((r, i) => `<tr>
        <td class="rank-cell">${i + 1}</td>
        <td>${playerLink(r)}</td>
        <td class="sub-text">${mode === 'season' ? teamLink(r.school) : (r.schools || []).map(teamLink).join(', ')}</td>
        <td class="sub-text-sm">${mode === 'season' ? `${r.year}-${(r.year + 1).toString().slice(2)}` : r.seasons + ' yr'}</td>
        <td class="bold-text">${mode === 'season' ? r.value.toFixed(1) : Math.round(r.value).toLocaleString()}</td>
      </tr>`).join('');
      return `<div class="record-card">
        <h5 class="award-table-title">${label}</h5>
        <div class="table-scroll"><table class="data-table">
          <thead><tr><th>#</th><th>Player</th><th>School</th><th>${mode === 'season' ? 'Season' : 'Span'}</th><th>${mode === 'season' ? 'Avg' : 'Total'}</th></tr></thead>
          <tbody>${body || `<tr><td colspan="5" class="empty-table-msg">No qualifying seasons yet.</td></tr>`}</tbody>
        </table></div>
      </div>`;
    }).join('');

    el.innerHTML = picker +
      `<p class="sub-text mb-1">${scope ? scope + ' program records' : 'Division I records'} — ${mode === 'season' ? 'best individual seasons' : 'career totals'}. Minimum 12 games for a qualifying season.</p>
       <div class="records-grid">${cards}</div>`;
  },

  // --- Historical Seasons ---

  setHistorySeason(year) {
    this.state.historySeasonView = year === '' ? null : parseInt(year, 10);
    this.updateHistoryTab();
    const y = this.state.historySeasonView;
    if (y) this.pushNav({ type: 'history', key: 'season-' + y, year: y, label: `${y}-${String(y + 1).slice(2)} season` });
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
  showHistoricalTeam(school, year, fromBack = false) {
    // A past team opens as its own team page (roster, stats, ranks).
    if (!fromBack && this.findTeam(school)) { this.goToTeamSeason(school, year); return; }
    if (!fromBack) this.pushNav({ type: 'history', key: `team-${school}-${year}`, year, team: school, label: `${school} ${year}-${String(year + 1).slice(2)}` });
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
      .map(([conf, champ]) => { const m = entry.honors && entry.honors.conf && entry.honors.conf[conf]; return `<tr><td>${conf}</td><td>${teamLink(champ)}</td><td class="sub-text-sm">${m ? this.esc(m.name) : '—'}</td></tr>`; }).join('');

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
        ${awardRow('Final Four Most Outstanding Player', entry.honors && entry.honors.finalFour ? entry.honors.finalFour.mop : null)}
        ${awardRow('Player of the Year', entry.npoy)}
        ${awardRow('Defensive Player of the Year', entry.dpoy)}
        ${awardRow('Freshman of the Year', entry.froy)}
        ${entry.honors ? Object.values(entry.honors.regions || {}).map(e => awardRow(`${e.region} Region MOP`, e)).join('') : ''}
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
        <thead><tr><th>Conference</th><th>Tournament Champion</th><th>Tournament MOP</th></tr></thead>
        <tbody>${confRows || '<tr><td colspan="3" class="empty-table-msg">None recorded.</td></tr>'}</tbody>
      </table></div>`;
  },


  // --- Historical Seasons ---

};
