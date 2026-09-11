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
    draftDeclarations: [],  // players leaving for the draft, computed when the season ends
    scheduleViewWeek: 1
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
    if (layout) layout.style.display = 'grid';
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
    this.state.draftDeclarations = [];
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

  getTeamLogo(schoolName) {
    if (!schoolName || schoolName === 'Free Agent' || schoolName === 'Uncommitted') return '';
    const normalized = String(schoolName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileBase = this.LOGO_ALIASES[normalized] || normalized;
    return `../schoollogos/${fileBase}.png`;
  },

  async fetchData() {
    let realTeamsMap = {};
    let rawRecruits = [];
    let sheetsReachable = true;

    try {
      const recruitsUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv";
      const rostersUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=0&single=true&output=csv";

      const [recruitsRes, rostersRes] = await Promise.all([ fetch(recruitsUrl), fetch(rostersUrl) ]);

      if (recruitsRes.ok) {
        rawRecruits = this.parseCSV(await recruitsRes.text());
      }
      if (rostersRes.ok) {
        const rawRosters = this.parseCSV(await rostersRes.text());
        rawRosters.forEach(rawPlayer => {
          const player = this.normalizePlayerObj(rawPlayer, false);
          if (!player.school) return;
          if (!realTeamsMap[player.school]) {
            realTeamsMap[player.school] = { school: player.school, conference: player.conference || 'NCAA', roster: [] };
          } else if (player.conference && player.conference !== 'NCAA') {
            realTeamsMap[player.school].conference = player.conference;
          }
          realTeamsMap[player.school].roster.push(player);
        });
      }
      if (!recruitsRes.ok && !rostersRes.ok) sheetsReachable = false;
    } catch (err) {
      console.error("Database Fetch Error:", err);
      sheetsReachable = false;
    }

    this.state.recruits = rawRecruits.map(r => this.normalizePlayerObj(r, true));
    this.buildFullD1Universe(Object.values(realTeamsMap));

    if (this.state.teams.length === 0) {
      this.logNews("Could not build a universe from sheets or the master team list. Check your data sources.");
      return;
    }

    this.syncUI();
    await this.saveStateToDB();
    const realCount = Object.keys(realTeamsMap).length;
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

    const { teams, unmatchedRealTeams } = RosterGen.buildFullUniverse(TeamsMaster, realTeams, { targetRosterSize: 13 });
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
  },


  parseCSV(csvData) {
    const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/(^"|"$)/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    
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
    s = s.replace(/^r[\-\s]?/, ''); // strip a leading "redshirt" marker like "R-FR" / "R Jr"
    s = s.replace(/[^a-z0-9]/g, '');
    const map = {
      fr: 'FR', freshman: 'FR', firstyear: 'FR', '1': 'FR', '1st': 'FR',
      so: 'SO', soph: 'SO', sophomore: 'SO', secondyear: 'SO', '2': 'SO', '2nd': 'SO',
      jr: 'JR', junior: 'JR', thirdyear: 'JR', '3': 'JR', '3rd': 'JR',
      sr: 'SR', senior: 'SR', fourthyear: 'SR', '4': 'SR', '4th': 'SR',
      gr: 'GR', grad: 'GR', graduate: 'GR', graduatestudent: 'GR', gs: 'GR',
      fifthyear: 'GR', '5': 'GR', '5th': 'GR', supersenior: 'GR'
    };
    return map[s] || null;
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

  normalizePlayerObj(raw, isRecruit = false) {
    const getVal = (keys, fallback = '') => {
      for (let k of keys) if (raw[k] !== undefined && raw[k] !== '') return raw[k];
      return fallback;
    };
    const rating = parseFloat(getVal(['rating', 'ovr', 'grade', 'stars'], 75)) || 75;
    const school = getVal(['school', 'team', 'committedto', 'college'], 'Free Agent');

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
      ht: getVal(['ht', 'height'], "6'4"),
      wt: getVal(['wt', 'weight'], "190"),
      hometown: getVal(['from', 'hometown', 'home'], 'N/A'),
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

    this.state.recruits.forEach(rec => {
      if (rec.recClassYear <= this.state.year && rec.school && rec.school !== 'Uncommitted') {
        const team = this.state.teams.find(t => t.school.toLowerCase() === rec.school.toLowerCase());
        if (team && !team.roster.some(p => p.name === rec.name)) {
          rec.school = team.school; rec.school_logo = this.getTeamLogo(team.school); rec.class = 'FR';
          team.roster.push(rec); players.push(rec);
        }
      }
    });
    this.state.activePlayers = players;
  },

  getZeroStats() {
    const z1 = "0.0", z3 = ".000";
    return {
      mpg: z1, ppg: z1, rpg: z1, apg: z1, stl: z1, blk: z1, tov: z1, pf: z1,
      fgm: z1, fga: z1, fgPct: z3, twoPm: z1, twoPa: z1, twoPPct: z3,
      threePm: z1, threePa: z1, threePPct: z3, ftm: z1, fta: z1, ftPct: z3,
      bpm: z1, obpm: z1, dbpm: z1, tsPct: z3, rTsPct: z1, eFgPct: z3,
      orebPct: '0.0%', drebPct: '0.0%', trbPct: '0.0%', astPct: '0.0%',
      tovPct: '0.0%', blkPct: '0.0%', usg: '0.0%', ftr: z3, threePar: z3,
      ortg: z1, drtg: z1, netRtg: z1
    };
  },

  initSeasonData() {
    this.state.schedule = [];
    this.state.regularSeasonDone = false;
    this.state.confChampsDone = false;
    this.state.ncaaDone = false;
    this.state.confTournaments = {};
    this.state.ncaaTournament = null;
    this.state.draftDeclarations = [];
    this.state.scheduleViewWeek = 1;

    this.state.teams.forEach(team => {
      let roster = this.state.activePlayers.filter(p => p.school === team.school);
      roster.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));

      const rawWeights = roster.map((p, idx) => Math.max(0.1, (parseFloat(p.rating) - 55) * Math.pow(0.78, idx)));
      const totalWeight = rawWeights.reduce((a, b) => a + b, 0) || 1;

      const top8 = roster.slice(0, 8);
      const teamOvr = top8.reduce((sum, p) => sum + parseFloat(p.rating), 0) / Math.max(1, Math.min(8, top8.length));
      const winPct = Math.min(0.94, Math.max(0.06, 0.50 + (teamOvr - 78) * 0.038));
      
      team.expectedWinPct = winPct;
      team.simData = { teamOvr, wins: 0, losses: 0, confWins: 0, confLosses: 0, rosterRef: roster, winPct: '.000' };

      roster.forEach((p, idx) => {
        let allocatedMpg = (rawWeights[idx] / totalWeight) * 200;
        if (idx > 9) allocatedMpg = 0; 
        p.isBench = idx >= 5;
        p.expectedStats = this.buildBaseStatExpectations(p, Math.min(35.5, allocatedMpg));
        p.gameLog = [];
        p.statsFull = this.getZeroStats();
        p.statsConf = this.getZeroStats();
        p.stats = p.statsFull;
        p.accolades = [];
      });
    });

    this.generateSeasonSchedule();
  },

  generateSeasonSchedule() {
    if (typeof ScheduleCore === 'undefined') {
      console.error('ScheduleCore not loaded — check that schedule-core.js is included before engine.js');
      return;
    }
    const teamRefs = this.state.teams.map(t => ({ school: t.school, conference: t.conference || 'Independent' }));
    const { schedule, nonConfEnd, confEnd } = ScheduleCore.generateFullSchedule(teamRefs, {
      nonConfGamesPerTeam: 12,
      nonConfStartWeek: 1,
      nonConfWeeks: 9,
      confGamesPerWeek: 2
    });
    this.state.schedule = schedule;
    this.state.nonConfEnd = nonConfEnd;
    this.state.confEnd = confEnd;
    this.state.maxWeeks = confEnd;
    this.state.scheduleViewWeek = 1;
  },

  buildBaseStatExpectations(player, mpg) {
    if (mpg <= 0.5) return this.getZeroStats();
    
    const r = parseFloat(player.rating); const pos = player.pos;
    const isBig = pos.includes('C') || (pos.includes('F') && !pos.includes('G'));
    
    const usageScale = (mpg / 28) * (r / 78);
    let ppg = Math.max(0.5, (r * 0.18) * usageScale);
    let rpg = Math.max(0.2, (isBig ? 6.5 : 2.5) * usageScale);
    let apg = Math.max(0.1, (!isBig ? 4.0 : 1.2) * usageScale);
    let stl = Math.max(0.1, (!isBig ? 1.2 : 0.5) * usageScale);
    let blk = Math.max(0.1, (isBig ? 1.6 : 0.3) * usageScale);
    let tov = Math.max(0.2, (apg * 0.4 + 0.8));
    let pf = Math.min(3.8, Math.max(0.8, (mpg / 8)));

    let bpm = ((r - 76) * 0.45);
    let obpm = bpm * (isBig ? 0.45 : 0.60);
    let dbpm = bpm - obpm;

    let ftPct = Math.min(0.92, Math.max(0.48, (isBig ? 0.64 : 0.78)));
    let fta = Math.max(0.2, (ppg * (isBig ? 0.35 : 0.22)));
    let threePar = isBig ? 0.12 : 0.38;
    let threePPct = Math.min(0.46, Math.max(0.20, (isBig ? 0.30 : 0.36)));
    let twoPPct = Math.min(0.68, Math.max(0.38, (isBig ? 0.56 : 0.46)));
    
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
  async simulateWeek() {
    if (this.state.teams.length === 0) {
      alert("No active teams detected. Please refresh or check data sources.");
      return;
    }
    if (this.state.ncaaDone) {
      alert("Season already complete! Advance offseason to start a new year.");
      return;
    }
    if (this.state.week === 0) {
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
    const gamesThisWeek = this.state.schedule.filter(g => g.week === this.state.week && !g.played);

    gamesThisWeek.forEach(g => {
      const home = this.findTeam(g.home);
      const away = this.findTeam(g.away);
      if (!home || !away) return;
      this.playGame(home, away, g, g.isConf ? 'conf' : 'nonconf');
    });

    this.recalculateAllAverages();
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
  playGame(home, away, scheduleEntry, gamePhaseLabel) {
    const result = GameCore.simulateSingleGame(home, away);
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

    const attachLogs = (boxes, teamScore, oppScore, oppSchool, isHome) => {
      boxes.forEach(({ player, box }) => {
        player.gameLog.push({
          ...box,
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
    this.state.activePlayers.forEach(p => this.recalculateAverages(p));
  },

  recalculateAverages(player) {
    if (!player.gameLog || player.gameLog.length === 0) return;
    
    const exp = player.expectedStats || {};

    const calc = (logs) => {
       if (logs.length === 0) return this.getZeroStats();
       let s = { min:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, pf:0, fgm:0, fga:0, twoPm:0, twoPa:0, threePm:0, threePa:0, ftm:0, fta:0 };
       logs.forEach(g => { for(let k in s) s[k] += g[k]; });
       
       const g = logs.length;
       const t1 = v => (v/g).toFixed(1);
       const t3 = (m,a) => a > 0 ? (m/a).toFixed(3).replace(/^0+/,'') : '.000';
       
       let mpg = s.min/g;
       let usg = ((s.fga + 0.44 * s.fta + s.tov) / Math.max(1, mpg)) * (40/Math.max(1, mpg)) * 100;

       const bpmNum = parseFloat(exp.bpm) || 0;
       const obpmNum = parseFloat(exp.obpm) || 0;
       const dbpmNum = parseFloat(exp.dbpm) || 0;
       const ortgNum = parseFloat(exp.ortg) || 100;
       const drtgNum = parseFloat(exp.drtg) || 100;
       const tsPctNum = parseFloat(exp.tsPct) || 0;
       
       return {
          mpg: t1(s.min), ppg: t1(s.pts), rpg: t1(s.reb), apg: t1(s.ast),
          stl: t1(s.stl), blk: t1(s.blk), tov: t1(s.tov), pf: t1(s.pf),
          fgm: t1(s.fgm), fga: t1(s.fga), fgPct: t3(s.fgm, s.fga),
          twoPm: t1(s.twoPm), twoPa: t1(s.twoPa), twoPPct: t3(s.twoPm, s.twoPa),
          threePm: t1(s.threePm), threePa: t1(s.threePa), threePPct: t3(s.threePm, s.threePa),
          ftm: t1(s.ftm), fta: t1(s.fta), ftPct: t3(s.ftm, s.fta),
          bpm: bpmNum.toFixed(1), 
          obpm: obpmNum.toFixed(1), 
          dbpm: dbpmNum.toFixed(1),
          tsPct: (2*(s.fga + 0.44*s.fta)) > 0 ? t3(s.pts, 2*(s.fga + 0.44*s.fta)) : '.000',
          rTsPct: (tsPctNum * 100 - 53.5).toFixed(1), 
          eFgPct: s.fga > 0 ? t3(s.fgm + 0.5*s.threePm, s.fga) : '.000',
          orebPct: exp.orebPct || '0.0%', drebPct: exp.drebPct || '0.0%', trbPct: exp.trbPct || '0.0%',
          astPct: mpg>0 ? ((s.ast/g)/mpg * 60).toFixed(1) + '%' : '0.0%',
          tovPct: (s.fga + 0.44*s.fta + s.tov) > 0 ? ((s.tov/(s.fga + 0.44*s.fta + s.tov))*100).toFixed(1) + '%' : '0.0%',
          blkPct: mpg>0 ? ((s.blk/g)/mpg * 40).toFixed(1) + '%' : '0.0%',
          usg: Math.min(45.0, Math.max(5.0, usg)).toFixed(1) + '%', 
          ftr: t3(s.fta, s.fga), threePar: t3(s.threePa, s.fga),
          ortg: ortgNum.toFixed(1), 
          drtg: drtgNum.toFixed(1), 
          netRtg: (ortgNum - drtgNum).toFixed(1)
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

    this.state.teams.sort((a,b) => {
      if (b.simData.wins !== a.simData.wins) return b.simData.wins - a.simData.wins;
      return b.simData.teamOvr - a.simData.teamOvr;
    });

    this.state.teams.forEach((t, i) => t.apRank = (i < 25) ? (i + 1) : null);

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

      p.awardScore = (bpm * 2.5) + (ppg * 0.8) + (apg * 0.4) + (rpg * 0.4) + (teamWinPct * 15);
      p.defensiveScore = (dbpm * 3.5) + (stl * 2.5) + (blk * 2.5) + (teamWinPct * 10);
    });
    
    this.state.regularSeasonDone = true;
    this.syncUI();
    this.logNews("Regular season complete. National and Conference awards calculated. Conference Championships are up next.");
  },

  // Seeds each conference by conference record (matching the standings
  // sort), runs a real single-elimination bracket for every conference
  // with 2+ teams, and grants the champion an automatic NCAA bid.
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

  async simulateNCAATournament() {
    const field = this.buildNCAAField();
    const bracket = TournamentCore.simulateBracket(field, { homeCourtEdge: 0 });
    [...bracket.playIn, ...bracket.rounds.flat()].forEach(g => {
      this.attachBracketGameLogs(g, 'ncaa');
    });

    bracket.champion.wonNationalTitle = true;
    this.state.ncaaTournament = bracket;

    this.recalculateAllAverages();
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
    this.state.activePlayers.forEach(p => {
      if (p.isRecruit) return;
      const cls = this.normalizeClassStanding(p.class) || 'SO';
      const rating = parseFloat(p.rating) || 0;
      let declares = false;
      let mandatory = false;

      if (cls === 'SR' || cls === 'GR') {
        mandatory = true;
        declares = rating >= 78;
      } else if (cls === 'JR') {
        const chance = rating >= 90 ? 0.70 : rating >= 85 ? 0.40 : rating >= 80 ? 0.15 : 0.02;
        declares = Math.random() < chance;
      } else if (cls === 'SO' || cls === 'FR') {
        const chance = rating >= 93 ? 0.35 : rating >= 88 ? 0.12 : 0.01;
        declares = Math.random() < chance;
      }

      if (declares) {
        declarations.push({
          id: p.id, name: p.name, school: p.school, pos: p.pos, class: cls,
          rating, mandatory,
          ppg: p.stats ? p.stats.ppg : '0.0',
          rpg: p.stats ? p.stats.rpg : '0.0',
          apg: p.stats ? p.stats.apg : '0.0'
        });
      }
    });
    declarations.sort((a, b) => b.rating - a.rating);
    return declarations;
  },

  // Shared helper: attaches real game-log entries (with opponent, score,
  // and result) for one already-simulated bracket game, and updates the
  // records of both participating teams.
  attachBracketGameLogs(bracketGame, phaseLabel) {
    const { teamA, teamB, result, winner } = bracketGame;
    const aIsWinner = winner === teamA;
    winner.simData.wins++;
    (aIsWinner ? teamB : teamA).simData.losses++;

    const attach = (boxes, team, opp, teamScore, oppScore) => {
      boxes.forEach(({ player, box }) => {
        player.gameLog.push({
          ...box,
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

  async runOffseason() {
    if (this.state.phase === 'Preseason') {
      alert("Simulate the regular season first before advancing to the offseason.");
      return;
    }
    if (!this.state.ncaaDone) {
      alert("Finish the current season (through the NCAA Tournament) before advancing.");
      return;
    }

    const declaredIds = new Set((this.state.draftDeclarations || []).map(d => d.id));
    const classProgression = { 'FR': 'SO', 'SO': 'JR', 'JR': 'SR' }; // SR/GR intentionally absent: eligibility is exhausted either way

    this.state.teams.forEach(team => {
      // Repair the class field defensively before deciding anyone's fate —
      // this is what stops an unrecognized/stale value from being treated
      // as an automatic graduation.
      team.roster.forEach(p => {
        p.class = this.normalizeClassStanding(p.class) || 'SO';
      });

      team.roster = team.roster.filter(p => {
        if (declaredIds.has(p.id)) return false; // left early or exhausted eligibility for the draft
        const nextClass = classProgression[p.class];
        if (nextClass) { p.class = nextClass; return true; }
        return false; // SR/GR (or still-unrecognized) — final year is over
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
    this.state.draftDeclarations = [];
    
    this.filterActiveData();
    this.logNews(`Advanced to ${this.state.year} Offseason. Graduated seniors cleared; incoming recruits added.`);
    
    document.getElementById('statsBody').innerHTML = `<tr><td colspan="25" class="empty-table-msg">Simulate games to view leaderboards.</td></tr>`;
    document.getElementById('standingsContainer').innerHTML = `<p class="empty-table-msg">Simulate games to view standings.</p>`;
    
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

    const btn = document.getElementById('simWeekBtn');
    if (btn) {
      if (this.state.ncaaDone) {
        btn.innerText = `Season Complete`;
        btn.disabled = true;
      } else if (this.state.confChampsDone) {
        btn.innerText = `Simulate NCAA Tournament`;
        btn.disabled = false;
      } else if (this.state.regularSeasonDone) {
        btn.innerText = `Simulate Conference Championships`;
        btn.disabled = false;
      } else {
        btn.innerText = `Simulate Week ${this.state.week + 1}`;
        btn.disabled = false;
      }
    }

    this.updateDashboard();
    this.sortAndRenderStatsTable();
    this.updateStandingsTab();
    this.updateAwardsTab();
    this.updateScheduleTab();
    this.updatePostseasonTab();
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
    let pool = this.state.activePlayers.filter(p => {
      if (this.state.confFilter === 'ALL') return true;
      return (p.conference || '').toUpperCase() === this.state.confFilter.toUpperCase();
    });

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

    const boxHeaders = [
      { id: 'name', label: 'Player' }, { id: 'school', label: 'School' }, { id: 'pos', label: 'Pos' }, { id: 'mpg', label: 'MPG' },
      { id: 'ppg', label: 'PPG' }, { id: 'rpg', label: 'RPG' }, { id: 'apg', label: 'APG' }, { id: 'stl', label: 'SPG' },
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

    let currentHeaders = this.state.statView === 'box' ? boxHeaders : advHeaders;
    let theadHtml = `<tr>`;
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
      pool.forEach((p) => {
        tbodyHtml += `<tr>`;
        const safeName = p.name.replace(/'/g, "\\'");
        const safeSchool = p.school.replace(/'/g, "\\'");
        currentHeaders.forEach(h => {
          if (h.id === 'name') tbodyHtml += `<td class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${p.name}</td>`;
          else if (h.id === 'school') tbodyHtml += `<td class="clickable-school" onclick="SimEngine.openTeamModal('${safeSchool}')">${p.school}</td>`;
          else if (h.id === 'pos') tbodyHtml += `<td>${p.pos}</td>`;
          else tbodyHtml += `<td>${p.stats ? p.stats[h.id] : '-'}</td>`;
        });
        tbodyHtml += `</tr>`;
      });
    }
    
    statsBody.innerHTML = tbodyHtml;
  },

  updateDashboard() {
    const dashTopTeams = document.getElementById('dashTopTeams');
    if (!dashTopTeams) return;

    let topTeamsHtml = '';
    for (let i = 0; i < 10; i++) {
      if (this.state.teams[i] && this.state.week > 0) {
        const safeSchool = this.state.teams[i].school.replace(/'/g, "\\'");
        topTeamsHtml += `
          <div class="team-badge clickable-school" onclick="SimEngine.openTeamModal('${safeSchool}')">
            <span class="team-rank">#${i+1}</span>
            <img src="${this.getTeamLogo(this.state.teams[i].school)}" class="sm-logo">
            ${this.state.teams[i].school}
          </div>
        `;
      }
    }
    dashTopTeams.innerHTML = topTeamsHtml || `<p class="sub-text">Simulate games to generate rankings.</p>`;
    
    if(this.state.week > 0) {
      this.populateDashList('dashPts', 'ppg');
      this.populateDashList('dashReb', 'rpg');
      this.populateDashList('dashAst', 'apg');
      this.populateDashList('dashStl', 'stl');
      this.populateDashList('dashBlk', 'blk');
    }
  },

  populateDashList(elementId, statKey) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let sorted = [...this.state.activePlayers].sort((a,b) => parseFloat(b.stats[statKey]) - parseFloat(a.stats[statKey]));
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (sorted[i]) {
        const safeName = sorted[i].name.replace(/'/g, "\\'");
        html += `<div class="leader-row">
          <span>${i+1}. <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${sorted[i].name}</span> <span class="leader-school">(${sorted[i].school})</span></span>
          <span>${sorted[i].stats[statKey]}</span>
        </div>`;
      }
    }
    el.innerHTML = html;
  },

  updateStandingsTab() {
    const standingsContainer = document.getElementById('standingsContainer');
    if (!standingsContainer || this.state.week === 0) return;

    let apTop25 = this.state.teams.slice(0, 25);
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

    const confList = ['ACC', 'AAC', 'A10', 'Big 12', 'Big Ten', 'Big East', 'SEC', 'Pac-12', 'WCC', 'Mountain West'];
    let allConfsInState = [...new Set(this.state.teams.map(t => (t.conference || 'NCAA').trim()))].filter(Boolean);
    let displayConfs = [...confList];
    allConfsInState.forEach(c => {
      if (!displayConfs.some(existing => existing.toLowerCase() === c.toLowerCase()) && c !== 'NCAA') {
        displayConfs.push(c);
      }
    });

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
          <div class="table-scroll">
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
    standingsContainer.innerHTML = apHtml + confsHtml;
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

  updateAwardsTab() {
    if (!this.state.regularSeasonDone) {
      document.getElementById('nationalAwardsGrid').innerHTML = `<p class="sub-text">Complete the season to calculate National Award winners.</p>`;
      document.getElementById('allAmericanContainer').innerHTML = `<p class="sub-text">Complete the season to view All-American teams.</p>`;
      document.getElementById('confAwardsContainer').innerHTML = `<p class="sub-text">Complete the season to view conference award winners.</p>`;
      return;
    }

    const players = [...this.state.activePlayers];
    const isPG = p => p.pos === 'PG' || (p.pos === 'G' && parseFloat(p.stats.apg) >= 3.5);
    const isSG = p => p.pos === 'SG' || (p.pos === 'G' && parseFloat(p.stats.apg) < 3.5);
    const isSF = p => p.pos === 'SF' || (p.pos === 'F' && parseFloat(p.stats.rpg) < 6.5);
    const isPF = p => p.pos === 'PF' || (p.pos === 'F' && parseFloat(p.stats.rpg) >= 6.5);
    const isC = p => p.pos === 'C' || (p.pos === 'F/C');

    const npoy = [...players].sort((a,b) => b.awardScore - a.awardScore)[0];
    const dpoy = [...players].sort((a,b) => b.defensiveScore - a.defensiveScore)[0];
    const froy = [...players].filter(p => p.class === 'FR').sort((a,b) => b.awardScore - a.awardScore)[0];
    
    const cousy = [...players].filter(isPG).sort((a,b) => b.awardScore - a.awardScore)[0] || npoy;
    const west = [...players].filter(isSG).sort((a,b) => b.awardScore - a.awardScore)[0] || npoy;
    const erving = [...players].filter(isSF).sort((a,b) => b.awardScore - a.awardScore)[0] || npoy;
    const malone = [...players].filter(isPF).sort((a,b) => b.awardScore - a.awardScore)[0] || npoy;
    const abdulJabbar = [...players].filter(isC).sort((a,b) => b.awardScore - a.awardScore)[0] || npoy;

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
        <div class="award-card ${a.major ? 'major-award' : ''}">
          <div class="award-title">${a.title}</div>
          <div class="award-sub">${a.sub}</div>
          <div class="award-winner">
            <img src="${this.getTeamLogo(a.winner.school)}" class="award-logo">
            <div class="award-winner-info">
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${a.winner.name}</span>
              <span class="award-winner-school">${a.winner.school} (${a.winner.pos} &bull; ${a.winner.class})</span>
              <span class="award-winner-stats">${a.winner.stats.ppg} PPG, ${a.winner.stats.rpg} RPG, ${a.winner.stats.apg} APG</span>
            </div>
          </div>
        </div>
      `;
    });
    document.getElementById('nationalAwardsGrid').innerHTML = natHtml;

    const sortedAll = [...players].sort((a,b) => b.awardScore - a.awardScore);
    const aa1 = sortedAll.slice(0, 5);
    const aa2 = sortedAll.slice(5, 10);
    const aa3 = sortedAll.slice(10, 15);

    aa1.forEach(p => { if(!p.accolades.includes("1st Team All-American")) p.accolades.push("1st Team All-American"); });

    const renderAaCard = (teamName, teamList) => {
      let rows = '';
      teamList.forEach((p, idx) => {
        const safeName = p.name.replace(/'/g, "\\'");
        rows += `
          <tr>
            <td class="highlight-text">${idx+1}</td>
            <td>
              <div class="team-cell-wrap">
                <img src="${this.getTeamLogo(p.school)}" class="xs-logo">
                <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${p.name}</span>
              </div>
            </td>
            <td>${p.school}</td>
            <td class="sub-text">${p.pos}</td>
            <td class="bold-text">${p.stats.ppg} PPG</td>
          </tr>`;
      });
      return `
        <div class="award-table-card">
          <h5 class="award-table-title">${teamName}</h5>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>PPG</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    };

    document.getElementById('allAmericanContainer').innerHTML = 
      renderAaCard("1st Team All-American", aa1) +
      renderAaCard("2nd Team All-American", aa2) +
      renderAaCard("3rd Team All-American", aa3);

    this.renderConferenceAwards(this.state.selectedAwardConf);
  },

  renderConferenceAwards(confName) {
    this.state.selectedAwardConf = confName;
    document.getElementById('confAwardsTitle').innerText = `${confName} Conference Honors`;
    
    if (!this.state.regularSeasonDone) {
      document.getElementById('confAwardsContainer').innerHTML = `<p class="sub-text">Complete the season to view conference awards.</p>`;
      return;
    }

    const confPlayers = this.state.activePlayers.filter(p => (p.conference || '').toLowerCase() === confName.toLowerCase());
    if (confPlayers.length === 0) {
      document.getElementById('confAwardsContainer').innerHTML = `<p class="sub-text">No players found for conference: ${confName}</p>`;
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

    let html = `
      <div class="awards-grid">
        <div class="award-card major-award">
          <div class="award-title">Player of the Year</div>
          <div class="award-sub">${confName} POY</div>
          <div class="award-winner">
            <img src="${this.getTeamLogo(cpoy.school)}" class="award-logo">
            <div class="award-winner-info">
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeN(cpoy)}')">${cpoy.name}</span>
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
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeN(cdpoy)}')">${cdpoy.name}</span>
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
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeN(croty)}')">${croty.name}</span>
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
              <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeN(c6moy)}')">${c6moy.name}</span>
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

    document.getElementById('confAwardsContainer').innerHTML = html;
  },

  renderConfTeamTable(title, playerList) {
    let rows = '';
    playerList.forEach((p, idx) => {
      const safeName = p.name.replace(/'/g, "\\'");
      rows += `
        <tr>
          <td class="bold-sub-text">${idx+1}</td>
          <td>
            <div class="team-cell-wrap">
              <img src="${this.getTeamLogo(p.school)}" class="xs-logo">
              <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${p.name}</span>
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
      rHtml += `
        <tr>
          <td class="sub-text">${idx+1}</td>
          <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${p.name}</span> ${statsStr}</td>
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

  openPlayerModal(playerName) {
    let player = this.state.activePlayers.find(p => p.name === playerName);
    if (!player) return;

    document.getElementById('modalPlayerLogo').src = this.getTeamLogo(player.school);
    document.getElementById('modalPlayerName').innerText = player.name;
    document.getElementById('modalPlayerBio').innerText = `${player.school} | ${player.pos} | ${player.class} | ${player.ht} | ${player.wt} | ${player.hometown}`;
    
    let accoladesText = (player.accolades && player.accolades.length > 0) ? player.accolades.join(' • ') : '';
    document.getElementById('modalPlayerAccolades').innerText = accoladesText;

    document.getElementById('modalPlayerPPG').innerText = player.stats.ppg;
    document.getElementById('modalPlayerRPG').innerText = player.stats.rpg;
    document.getElementById('modalPlayerAPG').innerText = player.stats.apg;
    document.getElementById('modalPlayerFG').innerText = player.stats.fgPct;

    let glHtml = '';
    if (!player.gameLog || player.gameLog.length === 0) {
      glHtml = `<tr><td colspan="12" class="empty-table-msg">No games played yet.</td></tr>`;
    } else {
      player.gameLog.forEach(g => {
        let matchup = g.opponent
          ? `${g.isHome ? 'vs' : '@'} ${g.opponent}${g.teamScore !== undefined ? ` (${g.won ? 'W' : 'L'} ${g.teamScore}-${g.oppScore})` : ''}`
          : (g.isConf ? 'Conf' : 'Non-Conf');
        glHtml += `
          <tr>
            <td class="bold-text">Wk ${g.week}</td>
            <td class="sub-text-sm">${matchup}</td>
            <td>${g.min}</td>
            <td class="highlight-col">${g.pts}</td>
            <td>${g.reb}</td>
            <td>${g.ast}</td>
            <td>${g.stl}</td>
            <td>${g.blk}</td>
            <td>${g.tov}</td>
            <td>${g.fgm}-${g.fga}</td>
            <td>${g.threePm}-${g.threePa}</td>
            <td>${g.ftm}-${g.fta}</td>
          </tr>
        `;
      });
    }

    document.getElementById('modalPlayerGameLog').innerHTML = glHtml;
    document.getElementById('playerModal').classList.add('active');
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

    const renderBracketGame = g => {
      const homeWin = g.result.homeScore > g.result.awayScore;
      return `<div class="bracket-game">
        <div class="bracket-game-teams">
          <img src="${this.getTeamLogo(g.teamB.school)}" class="xs-logo"> ${g.teamB.school}
          <span class="schedule-pill-at">at</span>
          <img src="${this.getTeamLogo(g.teamA.school)}" class="xs-logo"> ${g.teamA.school}
        </div>
        <span class="bracket-game-score">${g.result.awayScore}-${g.result.homeScore}</span>
        <span class="bracket-game-advances">${g.winner.school} advances</span>
      </div>`;
    };

    let html = '';

    html += `<h4 class="award-section-title">Conference Championships</h4>`;
    if (Object.keys(this.state.confTournaments).length === 0) {
      html += `<p class="sub-text">Not yet simulated.</p>`;
    } else {
      html += `<div class="all-american-container">`;
      Object.entries(this.state.confTournaments).forEach(([confName, bracket]) => {
        html += `<div class="award-table-card"><h5 class="award-table-title">${confName} — Champion: ${bracket.champion.school}</h5>`;
        if (bracket.playIn.length > 0) {
          html += `<p class="sub-text-sm">Play-in:</p>`;
          bracket.playIn.forEach(g => html += renderBracketGame(g));
        }
        bracket.rounds.forEach((round, i) => {
          html += `<p class="sub-text-sm">Round ${i + 1}:</p>`;
          round.forEach(g => html += renderBracketGame(g));
        });
        html += `</div>`;
      });
      html += `</div>`;
    }

    html += `<h4 class="award-section-title mt-2">NCAA Tournament</h4>`;
    if (!this.state.ncaaTournament) {
      html += `<p class="sub-text">Not yet simulated.</p>`;
    } else {
      const bracket = this.state.ncaaTournament;
      html += `<div class="award-card major-award"><div class="award-title">National Champion</div><div class="award-sub">${bracket.champion.school}</div></div>`;
      if (bracket.playIn.length > 0) {
        html += `<p class="sub-text-sm mt-1">First Four:</p>`;
        bracket.playIn.forEach(g => html += renderBracketGame(g));
      }
      const roundNames = ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship'];
      bracket.rounds.forEach((round, i) => {
        html += `<p class="sub-text-sm mt-1">${roundNames[i] || `Round ${i + 1}`}:</p>`;
        round.forEach(g => html += renderBracketGame(g));
      });
    }

    html += `<h4 class="award-section-title mt-2">Draft Declarations</h4>`;
    if (!this.state.ncaaDone) {
      html += `<p class="sub-text">Finish the NCAA Tournament to see who's leaving for the draft.</p>`;
    } else if (!this.state.draftDeclarations || this.state.draftDeclarations.length === 0) {
      html += `<p class="sub-text">No players declared for the draft this year.</p>`;
    } else {
      html += `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Player</th><th>School</th><th>Pos</th><th>Class</th><th>PPG</th><th>Status</th></tr></thead>
        <tbody>`;
      this.state.draftDeclarations.forEach(d => {
        const safeName = d.name.replace(/'/g, "\\'");
        html += `<tr>
          <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${d.name}</span></td>
          <td>${d.school}</td>
          <td class="sub-text">${d.pos}</td>
          <td class="sub-text">${d.class}</td>
          <td class="bold-text">${d.ppg}</td>
          <td class="sub-text-sm">${d.mandatory ? 'Exhausted Eligibility' : 'Early Entry'}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    container.innerHTML = html;
  }
};
