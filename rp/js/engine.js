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
    seasonHistory: [],      // league-wide archive: one entry per completed season
    preseasonAwards: null,  // projected honours, computed before week 1
    seasonInitialized: false,
    scheduleViewWeek: 1,
    teamPageSelection: '',
    teamPageView: 'current',
    teamStatSortCol: 'ppg',
    teamStatSortDir: 'desc',
    teamStatsConfFilter: 'ALL',
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
          this.state.seasonInitialized = savedState.seasonInitialized || false;
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
          seasonInitialized: this.state.seasonInitialized,
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
    'alabama', 'arizona', 'arizonastate', 'arkansas', 'auburn', 'baylor', 'bostoncollege', 'byu', 'cal',
    'cincinnati', 'clemson', 'colorado', 'connecticut', 'creighton', 'depaul', 'duke', 'florida', 'floridastate',
    'fordham', 'georgetown', 'georgia', 'gonzaga', 'gtech', 'houston', 'illinois', 'indiana', 'iowa', 'iowastate',
    'kansas', 'kansasstate', 'kentucky', 'louisville', 'lsu', 'marquette', 'maryland', 'memphis', 'miami',
    'michigan', 'michiganstate', 'mississippistate', 'missouri', 'ncstate', 'nebraska', 'northwestern',
    'notredame', 'ohiostate', 'oklahoma', 'olemiss', 'oregon', 'oregonstate', 'pennstate', 'pitt', 'providence',
    'purdue', 'rutgers', 'scar', 'sdsu', 'smu', 'stanford', 'stjohns', 'syracuse', 'tcu', 'temple', 'tennessee',
    'texas', 'texasam', 'texastech', 'ucf', 'ucla', 'unc', 'unlv', 'usc', 'utah', 'vanderbilt', 'villanova',
    'virginia', 'virginiatech', 'wakeforest', 'washington', 'wazzou', 'westvirginia', 'wisconsin', 'xavier'
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

    this.initSeasonData();
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
      hs: getVal(['hs', 'highschool', 'prep', 'prepschool'], ''),
      // Schools this player has suited up for, oldest first. Transfers
      // aren't simulated yet, so this is normally just the current school —
      // but the field exists so a transfer only has to append to it.
      collegeHistory: [school],
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
      gp: 0, gs: 0,
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
  getConferenceLogo(conference) {
    if (!conference) return '';
    const normalized = String(conference).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `../conferencelogos/${normalized}.png`;
  },

  getConferenceLogoImg(conference, className = 'conf-logo') {
    const fallback = this.generateFallbackLogo(conference);
    return `<img src="${this.getConferenceLogo(conference)}" class="${className}" alt="${conference}" ` +
           `onerror="this.onerror=null;this.src='${fallback}';">`;
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

    // Both depend on the finished schedule and on every team's rating,
    // so they run here rather than during roster construction.
    this.computePreseasonRankings();
    this.computeStrengthOfSchedule();
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
    this.state.activePlayers.forEach(p => this.recalculateAverages(p));
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
       let usg = ((s.fga + 0.44 * s.fta + s.tov) / Math.max(1, mpg)) * (40/Math.max(1, mpg)) * 100;

       const bpmNum = parseFloat(exp.bpm) || 0;
       const obpmNum = parseFloat(exp.obpm) || 0;
       const dbpmNum = parseFloat(exp.dbpm) || 0;
       const ortgNum = parseFloat(exp.ortg) || 100;
       const drtgNum = parseFloat(exp.drtg) || 100;
       const tsPctNum = parseFloat(exp.tsPct) || 0;
       
       // Per-40 denominators use total minutes, not games, so low-minute
       // players aren't penalised. Guard against a 0-minute denominator.
       const p40 = v => s.min > 0 ? ((v / s.min) * 40).toFixed(1) : '0.0';

       return {
          gp: g, gs: gamesStarted,
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

  // Records this season's results permanently before anything gets reset
  // for the new year — per-team (record, seed, how far they went) and
  // league-wide (champion, Final Four, national award winners). This is
  // what powers the Team History and Historical Seasons views.
  archiveCompletedSeason() {
    const year = this.state.year;

    this.state.teams.forEach(team => {
      if (!team.history) team.history = [];
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
      if (semiRound) {
        finalFour = semiRound.flatMap(g => [g.teamA.school, g.teamB.school]);
      } else if (finalRound && finalRound[0]) {
        finalFour = [finalRound[0].teamA.school, finalRound[0].teamB.school];
      }
    }

    const confChamps = {};
    Object.entries(this.state.confTournaments).forEach(([confName, b]) => {
      confChamps[confName] = b.champion.school;
    });

    this.state.seasonHistory.push({
      year, champion, runnerUp, finalFour, conferenceChamps: confChamps,
      npoy: npoy ? { name: npoy.name, school: npoy.school } : null,
      dpoy: dpoy ? { name: dpoy.name, school: dpoy.school } : null,
      froy: froy ? { name: froy.name, school: froy.school } : null
    });
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

    this.archiveCompletedSeason();

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
    this.state.seasonInitialized = false;

    this.filterActiveData();
    this.initSeasonData();
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

    this.populateConferenceDropdowns();
    this.updateDashboard();
    this.sortAndRenderStatsTable();
    this.updateStandingsTab();
    this.updateAwardsTab();
    this.updateScheduleTab();
    this.updatePostseasonTab();
    this.updateTeamTab();
    this.updateTeamStatsTab();
    this.updateRecruitsTab();
    this.updateDraftBoardTab();
    this.updateHistoryTab();
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
    let pool = this.state.activePlayers.filter(p =>
      this.matchesConfFilter(p.conference, this.state.confFilter));

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
    if (!standingsContainer) return;
    if (this.state.teams.length === 0) return;

    // Before tip-off there are no results to rank, so show the projected
    // preseason poll (roster strength + program tier) instead of a blank tab.
    if (this.state.week === 0) {
      standingsContainer.innerHTML = this.renderPreseasonPoll() + this.renderConferenceStandings();
      return;
    }

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
      return `<div class="award-card">
        <div class="award-title">${title}</div>
        <div class="award-sub">${sub}</div>
        <div class="award-winner">
          <img src="${this.getTeamLogo(player.school)}" class="award-logo">
          <div class="award-winner-info">
            <span class="award-winner-name clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${player.name}</span>
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
            return `<div class="leader-row">
              <span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${p.name}</span>
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

    if (!this.state.regularSeasonDone) {
      document.getElementById('nationalAwardsGrid').innerHTML = `<p class="sub-text">Complete the season to calculate National Award winners.</p>`;
      document.getElementById('allAmericanContainer').innerHTML = `<p class="sub-text">Complete the season to view All-American teams.</p>`;
      document.getElementById('confAwardsContainer').innerHTML = `<p class="sub-text">Complete the season to view conference award winners.</p>`;
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

    const confPlayers = this.state.activePlayers.filter(p => this.matchesConfFilter(p.conference, confName));
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
    let player = this.state.activePlayers.find(p => p.name === playerName)
      || (this.state.recruits || []).find(p => p.name === playerName);
    if (!player) return;

    const st = player.stats || this.getZeroStats();

    document.getElementById('modalPlayerLogo').src = this.getTeamLogo(player.school);
    document.getElementById('modalPlayerName').innerText = player.name;

    const bioBits = [player.pos, player.class, player.ht, player.wt, player.hometown];
    if (player.hs) bioBits.push(player.hs);
    document.getElementById('modalPlayerBio').innerText = bioBits.filter(Boolean).join(' | ');

    const colleges = (player.collegeHistory && player.collegeHistory.length)
      ? player.collegeHistory : [player.school];
    const collegesEl = document.getElementById('modalPlayerColleges');
    if (collegesEl) {
      collegesEl.innerHTML = colleges.length > 1
        ? `Colleges: ${colleges.join(' → ')}`
        : `College: ${colleges[0] || '—'}`;
    }

    const accolades = player.accolades || [];
    const preseason = accolades.filter(a => /preseason/i.test(a));
    const postseason = accolades.filter(a => !/preseason/i.test(a));
    const accEl = document.getElementById('modalPlayerAccolades');
    if (accEl) {
      let accHtml = '';
      if (preseason.length) accHtml += `<div><span class="accolade-tag preseason">Preseason</span> ${preseason.join(' • ')}</div>`;
      if (postseason.length) accHtml += `<div><span class="accolade-tag postseason">Honors</span> ${postseason.join(' • ')}</div>`;
      accEl.innerHTML = accHtml || '<span class="sub-text-sm">No awards yet.</span>';
    }

    document.getElementById('modalPlayerPPG').innerText = st.ppg;
    document.getElementById('modalPlayerRPG').innerText = st.rpg;
    document.getElementById('modalPlayerAPG').innerText = st.apg;
    document.getElementById('modalPlayerFG').innerText = st.fgPct;

    const pairRow = (label, value) => `<div class="pstat-cell"><span class="pstat-label">${label}</span><span class="pstat-value">${value}</span></div>`;

    const boxEl = document.getElementById('modalPlayerBoxStats');
    if (boxEl) {
      boxEl.innerHTML =
        pairRow('GP', st.gp) + pairRow('GS', st.gs) + pairRow('MPG', st.mpg) + pairRow('PPG', st.ppg) +
        pairRow('OREB', st.oreb) + pairRow('DREB', st.dreb) + pairRow('RPG', st.rpg) + pairRow('APG', st.apg) +
        pairRow('SPG', st.stl) + pairRow('BPG', st.blk) + pairRow('TOV', st.tov) + pairRow('PF', st.pf) +
        pairRow('FGM', st.fgm) + pairRow('FGA', st.fga) + pairRow('FG%', st.fgPct) +
        pairRow('3PM', st.threePm) + pairRow('3PA', st.threePa) + pairRow('3P%', st.threePPct) +
        pairRow('FTM', st.ftm) + pairRow('FTA', st.fta) + pairRow('FT%', st.ftPct);
    }

    const advEl = document.getElementById('modalPlayerAdvStats');
    if (advEl) {
      advEl.innerHTML =
        pairRow('BPM', st.bpm) + pairRow('OBPM', st.obpm) + pairRow('DBPM', st.dbpm) +
        pairRow('TS%', st.tsPct) + pairRow('eFG%', st.eFgPct) + pairRow('rTS%', st.rTsPct) +
        pairRow('OREB%', st.orebPct) + pairRow('DREB%', st.drebPct) + pairRow('TRB%', st.trbPct) +
        pairRow('AST%', st.astPct) + pairRow('TOV%', st.tovPct) + pairRow('BLK%', st.blkPct) +
        pairRow('USG%', st.usg) + pairRow('FTr', st.ftr) + pairRow('3PAr', st.threePar) +
        pairRow('ORtg', st.ortg) + pairRow('DRtg', st.drtg) + pairRow('Net', st.netRtg);
    }

    const p40El = document.getElementById('modalPlayerPer40Stats');
    if (p40El) {
      p40El.innerHTML =
        pairRow('PTS/40', st.p40pts) + pairRow('OREB/40', st.p40oreb) + pairRow('DREB/40', st.p40dreb) +
        pairRow('REB/40', st.p40reb) + pairRow('AST/40', st.p40ast) + pairRow('STL/40', st.p40stl) +
        pairRow('BLK/40', st.p40blk) + pairRow('TOV/40', st.p40tov) + pairRow('PF/40', st.p40pf) +
        pairRow('FGA/40', st.p40fga) + pairRow('3PA/40', st.p40threePa) + pairRow('FTA/40', st.p40fta);
    }

    let glHtml = '';
    if (!player.gameLog || player.gameLog.length === 0) {
      glHtml = `<tr><td colspan="13" class="empty-table-msg">No games played yet.</td></tr>`;
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
            <td>${g.oreb !== undefined ? g.oreb : '—'}</td>
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

    container.innerHTML = html;
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
      ? [['name','Player'],['pos','Pos'],['class','Cl'],['gp','GP'],['gs','GS'],['mpg','MPG'],['ppg','PPG'],
         ['oreb','OREB'],['rpg','RPG'],['apg','APG'],['stl','SPG'],['blk','BPG'],['tov','TOV'],['pf','PF'],
         ['fgm','FGM'],['fga','FGA'],['fgPct','FG%'],['threePm','3PM'],['threePa','3PA'],['threePPct','3P%'],
         ['ftm','FTM'],['fta','FTA'],['ftPct','FT%']]
      : [['name','Player'],['pos','Pos'],['mpg','MPG'],['bpm','BPM'],['obpm','OBPM'],['dbpm','DBPM'],
         ['tsPct','TS%'],['eFgPct','eFG%'],['orebPct','OREB%'],['drebPct','DREB%'],['trbPct','TRB%'],
         ['astPct','AST%'],['tovPct','TOV%'],['blkPct','BLK%'],['usg','USG%'],['ftr','FTr'],
         ['threePar','3PAr'],['ortg','ORtg'],['drtg','DRtg'],['netRtg','Net']];

    const roster = [...(team.roster || [])].sort((a, b) => {
      const am = parseFloat(a.stats ? a.stats.mpg : 0) || 0;
      const bm = parseFloat(b.stats ? b.stats.mpg : 0) || 0;
      if (bm !== am) return bm - am;
      return parseFloat(b.rating) - parseFloat(a.rating);
    });

    let rows = '';
    roster.forEach(p => {
      const safeName = p.name.replace(/'/g, "\\'");
      rows += '<tr>' + cols.map(([id]) => {
        if (id === 'name') return `<td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${p.name}</span></td>`;
        if (id === 'pos' || id === 'class') return `<td class="sub-text">${p[id]}</td>`;
        return `<td>${p.stats ? p.stats[id] : '—'}</td>`;
      }).join('') + '</tr>';
    });

    return `
      <h4 class="award-section-title">${mode === 'box' ? 'Player Box Score Stats' : 'Player Advanced Stats'}</h4>
      <div class="table-scroll mb-1-5"><table class="data-table">
        <thead><tr>${cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols.length}" class="empty-table-msg">No games played yet.</td></tr>`}</tbody>
      </table></div>`;
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
  getIncomingRecruitClassYear() {
    return this.state.year + 1;
  },

  updateRecruitsTab() {
    const body = document.getElementById('recruitsBody');
    const label = document.getElementById('recruitsClassLabel');
    if (!body) return;

    const incomingYear = this.getIncomingRecruitClassYear();
    if (label) label.innerText = `Class of ${incomingYear}`;

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
      body.innerHTML = `<tr><td colspan="6" class="empty-table-msg">No ${incomingYear} recruits match these filters.</td></tr>`;
      return;
    }

    body.innerHTML = recruits.map((r, i) => {
      const safeName = r.name.replace(/'/g, "\\'");
      const committed = r.school && r.school !== 'Uncommitted' && r.school !== 'Free Agent';
      const team = committed ? this.state.teams.find(t => t.school === r.school) : null;
      return `<tr>
        <td class="bold-sub-text">${i + 1}</td>
        <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${r.name}</span></td>
        <td class="sub-text">${r.pos}</td>
        <td class="bold-text">${Math.round(parseFloat(r.rating))}</td>
        <td class="sub-text-sm">${r.hometown || '—'}</td>
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

    if (!this.state.ncaaDone) {
      container.innerHTML = `<p class="empty-table-msg">Finish the NCAA Tournament to see who's declared for the draft.</p>`;
      return;
    }
    if (!this.state.draftDeclarations || this.state.draftDeclarations.length === 0) {
      container.innerHTML = `<p class="empty-table-msg">No players declared for the draft this year.</p>`;
      return;
    }

    let html = `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>#</th><th>Player</th><th>School</th><th>Pos</th><th>Class</th><th>PPG</th><th>Status</th></tr></thead>
      <tbody>`;
    this.state.draftDeclarations.forEach((d, i) => {
      const safeName = d.name.replace(/'/g, "\\'");
      html += `<tr>
        <td class="bold-sub-text">${i + 1}</td>
        <td><span class="clickable-player" onclick="SimEngine.openPlayerModal('${safeName}')">${d.name}</span></td>
        <td><div class="team-cell-wrap"><img src="${this.getTeamLogo(d.school)}" class="xs-logo">${d.school}</div></td>
        <td class="sub-text">${d.pos}</td>
        <td class="sub-text">${d.class}</td>
        <td class="bold-text">${d.ppg}</td>
        <td class="sub-text-sm">${d.mandatory ? 'Exhausted Eligibility' : 'Early Entry'}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
  },

  // --- Historical Seasons ---

  updateHistoryTab() {
    const container = document.getElementById('historyContainer');
    if (!container) return;

    if (!this.state.seasonHistory || this.state.seasonHistory.length === 0) {
      container.innerHTML = `<p class="empty-table-msg">Complete a season to begin building history.</p>`;
      return;
    }

    let html = '';
    [...this.state.seasonHistory].sort((a, b) => b.year - a.year).forEach(s => {
      const confChampCount = Object.keys(s.conferenceChamps || {}).length;
      html += `<div class="award-card major-award mb-1">
        <div class="award-title">${s.year}-${(s.year + 1).toString().slice(2)} Season</div>
        <div class="award-winner mb-1">
          <img src="${s.champion ? this.getTeamLogo(s.champion) : ''}" class="award-logo">
          <div class="award-winner-info">
            <span class="award-winner-name">${s.champion || 'Unknown'}</span>
            <span class="award-winner-school">National Champions</span>
            ${s.runnerUp ? `<span class="award-winner-stats">def. ${s.runnerUp} in the Championship</span>` : ''}
          </div>
        </div>
        <p class="sub-text-sm mb-1">Final Four: ${(s.finalFour || []).join(', ') || 'N/A'}</p>
        ${s.npoy ? `<p class="sub-text-sm">National POY: <span class="bold-text">${s.npoy.name}</span> (${s.npoy.school})</p>` : ''}
        ${s.dpoy ? `<p class="sub-text-sm">National DPOY: <span class="bold-text">${s.dpoy.name}</span> (${s.dpoy.school})</p>` : ''}
        ${s.froy ? `<p class="sub-text-sm">National FROY: <span class="bold-text">${s.froy.name}</span> (${s.froy.school})</p>` : ''}
        <p class="sub-text-sm mt-1">${confChampCount} conference tournament champions crowned</p>
      </div>`;
    });
    container.innerHTML = html;
  }
};
