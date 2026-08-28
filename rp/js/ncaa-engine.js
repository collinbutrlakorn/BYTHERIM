window.SimEngine = {
  state: {
    year: 2028,
    phase: 'Preseason',
    teams: [],
    recruits: [],
    activePlayers: [],
    simCompleted: false,
    statView: 'box', 
    sortCol: 'ppg',
    sortDir: 'desc',
    confFilter: 'ALL',   
    scopeFilter: 'full'  
  },
  
  init() {
    this.fetchData();
  },

  async fetchData() {
    try {
      const recruitsUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv";
      const rostersUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=0&single=true&output=csv";

      const [recruitsRes, rostersRes] = await Promise.all([
        fetch(recruitsUrl),
        fetch(rostersUrl)
      ]);
      
      if (!recruitsRes.ok || !rostersRes.ok) {
        throw new Error("Could not load Google Sheets CSVs");
      }
      
      const recruitsText = await recruitsRes.text();
      const rostersText = await rostersRes.text();
      
      const rawRecruits = this.parseCSV(recruitsText);
      const rawRosters = this.parseCSV(rostersText);
      
      this.state.recruits = rawRecruits.map(r => this.normalizePlayerObj(r, true));
      
      const teamsMap = {};
      rawRosters.forEach(rawPlayer => {
        const player = this.normalizePlayerObj(rawPlayer, false);
        if (!player.school) return;

        if (!teamsMap[player.school]) {
          teamsMap[player.school] = {
            school: player.school,
            conference: player.conference || 'NCAA',
            logo: player.school_logo || '', 
            roster: []
          };
        } else if (player.conference && player.conference !== 'NCAA') {
          teamsMap[player.school].conference = player.conference;
        }
        teamsMap[player.school].roster.push(player);
      });
      
      this.state.teams = Object.values(teamsMap);
      this.filterActiveData();
      
      document.getElementById('currentYearDisplay').innerText = `${this.state.year}-${(this.state.year + 1).toString().slice(2)}`;
      this.logNews(`Loaded ${this.state.teams.length} teams and ${this.state.activePlayers.length} players for ${this.state.year}.`);
      
    } catch(err) {
      console.error("Database Fetch Error:", err);
      this.logNews(`Database Error: ${err.message}. Check public Google Sheets links.`);
    }
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
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          rowValues.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
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

  normalizePlayerObj(raw, isRecruit = false) {
    const getVal = (keys, fallback = '') => {
      for (let k of keys) {
        if (raw[k] !== undefined && raw[k] !== '') return raw[k];
      }
      return fallback;
    };

    const rating = parseFloat(getVal(['rating', 'ovr', 'grade', 'stars'], 75)) || 75;
    
    return {
      name: getVal(['name', 'player', 'fullname'], 'Unknown Player'),
      school: getVal(['school', 'team', 'committedto', 'college'], 'Free Agent'),
      conference: getVal(['conf', 'conference', 'league'], 'NCAA'),
      school_logo: getVal(['logo', 'schoollogo', 'teamlogo'], ''),
      pos: getVal(['pos', 'position'], 'G').toUpperCase(),
      class: getVal(['class', 'classyear', 'yr'], isRecruit ? 'FR' : 'SO').toUpperCase(),
      ht: getVal(['ht', 'height'], "6'4"),
      wt: getVal(['wt', 'weight'], "190"),
      hometown: getVal(['from', 'hometown', 'home'], 'N/A'),
      rating: rating,
      isRecruit: isRecruit,
      recClassYear: parseInt(getVal(['classyear', 'recclass'], this.state.year)),
      hs_stats: {
        ppg: parseFloat(getVal(['ppg', 'hsppg'], 12.0)),
        rpg: parseFloat(getVal(['rpg', 'hsrpg'], 4.0)),
        apg: parseFloat(getVal(['apg', 'hsapg'], 2.5)),
        bpm: parseFloat(getVal(['bpm', 'hsbpm'], 0.0))
      },
      stats: null,       
      statsFull: null,   
      statsConf: null    
    };
  },
  
  filterActiveData() {
    let players = [];
    
    this.state.teams.forEach(team => {
      if (team.roster) {
        team.roster.forEach(player => {
          if (player.class !== 'GRADUATED') {
            players.push(player);
          }
        });
      }
    });

    this.state.recruits.forEach(rec => {
      if (rec.recClassYear <= this.state.year && rec.school && rec.school !== 'Uncommitted') {
        const team = this.state.teams.find(t => t.school.toLowerCase() === rec.school.toLowerCase());
        if (team && !team.roster.some(p => p.name === rec.name)) {
          rec.school = team.school;
          rec.school_logo = team.logo;
          rec.class = 'FR';
          team.roster.push(rec);
          players.push(rec);
        }
      }
    });
    
    this.state.activePlayers = players;
  },

  simulateSeason() {
    if (this.state.phase !== 'Preseason') {
      alert("Season already simulated! Advance offseason to start a new year.");
      return;
    }
    
    this.state.phase = 'Regular Season Final';
    document.getElementById('currentPhaseDisplay').innerText = 'Regular Season Final';
    
    this.state.teams.forEach(team => {
      team.simData = this.calculateTeamSeason(team);
    });
    
    // Sort overall by win count & team OVR
    this.state.teams.sort((a,b) => {
      if (b.simData.wins !== a.simData.wins) return b.simData.wins - a.simData.wins;
      return b.simData.teamOvr - a.simData.teamOvr;
    });

    // Assign AP Top 25 ranks
    this.state.teams.forEach((t, i) => {
      t.apRank = (i < 25) ? (i + 1) : null;
    });
    
    this.state.simCompleted = true;
    this.state.sortCol = 'ppg';
    this.state.sortDir = 'desc';

    this.updateDashboard();
    this.sortAndRenderStatsTable();
    this.updateStandingsTab();
    this.updateAwardsTab();
    
    this.logNews("Regular season complete. Standings & conference records generated.");
  },

  calculateTeamSeason(team) {
    let roster = this.state.activePlayers.filter(p => p.school === team.school);
    if (roster.length === 0) return { teamOvr: 70, wins: 0, losses: 31, confWins: 0, confLosses: 18, winPct: '.000', rosterRef: [] };

    roster.sort((a, b) => b.rating - a.rating);

    const rawWeights = roster.map((p, idx) => Math.max(0.1, (p.rating - 55) * Math.pow(0.78, idx)));
    const totalWeight = rawWeights.reduce((a, b) => a + b, 0) || 1;

    roster.forEach((p, idx) => {
      let allocatedMpg = (rawWeights[idx] / totalWeight) * 200;
      if (idx > 9) allocatedMpg = 0; 
      p.stats = this.calculatePlayerSeason(p, Math.min(35.5, allocatedMpg));
    });

    const top8 = roster.slice(0, 8);
    const teamOvr = top8.reduce((sum, p) => sum + p.rating, 0) / Math.min(8, top8.length);
    
    const winPct = Math.min(0.94, Math.max(0.06, 0.50 + (teamOvr - 78) * 0.038 + (Math.random() * 0.1 - 0.05)));
    const gamesPlayed = 31;
    const wins = Math.round(gamesPlayed * winPct);
    const losses = gamesPlayed - wins;

    // Simulate 18 Conference Games
    const confGames = 18;
    const confWinPct = Math.min(0.94, Math.max(0.06, winPct + (Math.random() * 0.12 - 0.06)));
    const confWins = Math.round(confGames * confWinPct);
    const confLosses = confGames - confWins;
    
    return {
      teamOvr: teamOvr,
      wins: wins,
      losses: losses,
      confWins: confWins,
      confLosses: confLosses,
      winPct: (wins / gamesPlayed).toFixed(3).replace(/^0+/, ''),
      rosterRef: roster
    };
  },

  calculatePlayerSeason(player, mpg) {
    const fullStats = this.buildStatSet(player, mpg, 1.0);
    const confStats = this.buildStatSet(player, mpg, 0.96);

    player.statsFull = fullStats;
    player.statsConf = confStats;

    return this.state.scopeFilter === 'conf' ? confStats : fullStats;
  },

  buildStatSet(player, mpg, scaleFactor = 1.0) {
    if (mpg <= 0.5) {
      const z1 = "0.0", z3 = ".000";
      return {
        mpg: z1, ppg: z1, rpg: z1, apg: z1, stl: z1, blk: z1, tov: z1, pf: z1,
        fgm: z1, fga: z1, fgPct: z3, twoPm: z1, twoPa: z1, twoPPct: z3,
        threePm: z1, threePa: z1, threePPct: z3, ftm: z1, fta: z1, ftPct: z3,
        bpm: z1, obpm: z1, dbpm: z1, tsPct: z3, rTsPct: z1, eFgPct: z3,
        orebPct: '0.0%', drebPct: '0.0%', trbPct: '0.0%', astPct: '0.0%',
        tovPct: '0.0%', blkPct: '0.0%', usg: '0.0%', ftr: z3, threePar: z3,
        ortg: '0.0', drtg: '0.0', netRtg: '0.0'
      };
    }

    const rng = () => 0.88 + (Math.random() * 0.24);
    const r = player.rating;
    const pos = player.pos;
    const isBig = pos.includes('C') || (pos.includes('F') && !pos.includes('G'));
    
    const usageScale = (mpg / 28) * (r / 78) * scaleFactor;
    let ppg = Math.max(0.5, (r * 0.18) * usageScale * rng());
    let rpg = Math.max(0.2, (isBig ? 6.5 : 2.5) * usageScale * rng());
    let apg = Math.max(0.1, (!isBig ? 4.0 : 1.2) * usageScale * rng());
    let stl = Math.max(0.1, (!isBig ? 1.2 : 0.5) * usageScale * rng());
    let blk = Math.max(0.1, (isBig ? 1.6 : 0.3) * usageScale * rng());
    let tov = Math.max(0.2, (apg * 0.4 + 0.8) * rng());
    let pf = Math.min(3.8, Math.max(0.8, (mpg / 8) * rng()));

    let bpm = ((r - 76) * 0.45) * rng() * scaleFactor;
    let obpm = bpm * (isBig ? 0.45 : 0.60);
    let dbpm = bpm - obpm;

    let ftPct = Math.min(0.92, Math.max(0.48, (isBig ? 0.64 : 0.78) * rng()));
    let fta = Math.max(0.2, (ppg * (isBig ? 0.35 : 0.22)));
    let ftm = fta * ftPct;

    let ptsFromFg = Math.max(0, ppg - ftm);
    let threePar = isBig ? 0.12 * rng() : 0.38 * rng();
    let threePPct = Math.min(0.46, Math.max(0.20, (isBig ? 0.30 : 0.36) * rng()));
    let threePm = Math.max(0, (ptsFromFg * threePar) / 3);
    let threePa = threePPct > 0 ? threePm / threePPct : 0;

    let twoPm = Math.max(0, (ptsFromFg - (threePm * 3)) / 2);
    let twoPPct = Math.min(0.68, Math.max(0.38, (isBig ? 0.56 : 0.46) * rng()));
    let twoPa = twoPPct > 0 ? twoPm / twoPPct : 0;

    let fgm = twoPm + threePm;
    let fga = twoPa + threePa;
    let fgPct = fga > 0 ? fgm / fga : 0;

    let tsPct = (2 * (fga + 0.44 * fta)) > 0 ? ppg / (2 * (fga + 0.44 * fta)) : 0;
    let rTsPct = (tsPct * 100) - 53.5;
    let eFgPct = fga > 0 ? (fgm + 0.5 * threePm) / fga : 0;
    
    let usg = ((fga + 0.44 * fta + tov) / mpg) * 40;
    let ftr = fga > 0 ? fta / fga : 0;

    let ortg = 95 + (obpm * 3.2);
    let drtg = 105 - (dbpm * 3.2);

    const t1 = (val) => (isNaN(val) || !isFinite(val)) ? "0.0" : Number(val).toFixed(1);
    const t3 = (val) => (isNaN(val) || !isFinite(val)) ? ".000" : Number(val).toFixed(3).replace(/^0+/, '');

    return {
      mpg: t1(mpg), ppg: t1(ppg), rpg: t1(rpg), apg: t1(apg),
      stl: t1(stl), blk: t1(blk), tov: t1(tov), pf: t1(pf),
      fgm: t1(fgm), fga: t1(fga), fgPct: t3(fgPct),
      twoPm: t1(twoPm), twoPa: t1(twoPa), twoPPct: t3(twoPPct),
      threePm: t1(threePm), threePa: t1(threePa), threePPct: t3(threePPct),
      ftm: t1(ftm), fta: t1(fta), ftPct: t3(ftPct),
      bpm: t1(bpm), obpm: t1(obpm), dbpm: t1(dbpm),
      tsPct: t3(tsPct), rTsPct: t1(rTsPct), eFgPct: t3(eFgPct),
      orebPct: t1(isBig ? 9.5 : 3.0) + '%', drebPct: t1(isBig ? 21.0 : 10.5) + '%', trbPct: t1(isBig ? 15.0 : 6.8) + '%',
      astPct: t1((apg / mpg) * 60) + '%', tovPct: t1((tov / (fga + 0.44 * fta + tov)) * 100) + '%', blkPct: t1((blk / mpg) * 40) + '%',
      usg: t1(usg) + '%', ftr: t3(ftr), threePar: t3(threePar),
      ortg: t1(ortg), drtg: t1(drtg), netRtg: t1(ortg - drtg)
    };
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
    if (!this.state.simCompleted) return;
    if (this.state.sortCol === colId) {
      this.state.sortDir = this.state.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.state.sortCol = colId;
      this.state.sortDir = 'desc';
    }
    this.sortAndRenderStatsTable();
  },

  sortAndRenderStatsTable() {
    if (!this.state.simCompleted) return;
    
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
        valA = a[col] || '';
        valB = b[col] || '';
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
    document.getElementById('statsHeader').innerHTML = theadHtml;

    let tbodyHtml = '';
    if (pool.length === 0) {
      tbodyHtml = `<tr><td colspan="25" style="text-align: center; color: #7d8296;">No players found for conference: ${this.state.confFilter}</td></tr>`;
    } else {
      pool.forEach((p) => {
        tbodyHtml += `<tr>`;
        currentHeaders.forEach(h => {
          if (h.id === 'name') tbodyHtml += `<td style="font-weight:700; color:#fff;">${p.name}</td>`;
          else if (h.id === 'school') tbodyHtml += `<td>${p.school}</td>`;
          else if (h.id === 'pos') tbodyHtml += `<td>${p.pos}</td>`;
          else tbodyHtml += `<td>${p.stats ? p.stats[h.id] : '-'}</td>`;
        });
        tbodyHtml += `</tr>`;
      });
    }
    
    document.getElementById('statsBody').innerHTML = tbodyHtml;
  },

  updateDashboard() {
    let topTeamsHtml = '';
    for (let i = 0; i < 10; i++) {
      if (this.state.teams[i]) {
        topTeamsHtml += `
          <div class="team-badge clickable-school" onclick="SimEngine.openTeamModal('${this.state.teams[i].school}')">
            <span class="team-rank">#${i+1}</span>
            <img src="${this.state.teams[i].logo || ''}" style="width:20px; height:20px; object-fit:contain;">
            ${this.state.teams[i].school}
          </div>
        `;
      }
    }
    document.getElementById('dashTopTeams').innerHTML = topTeamsHtml;
    
    this.populateDashList('dashPts', 'ppg');
    this.populateDashList('dashReb', 'rpg');
    this.populateDashList('dashAst', 'apg');
    this.populateDashList('dashStl', 'stl');
    this.populateDashList('dashBlk', 'blk');
  },

  populateDashList(elementId, statKey) {
    let sorted = [...this.state.activePlayers].sort((a,b) => parseFloat(b.stats[statKey]) - parseFloat(a.stats[statKey]));
    let html = '';
    for (let i = 0; i < 5; i++) {
      if (sorted[i]) {
        html += `<div class="leader-row">
          <span>${i+1}. ${sorted[i].name} <span style="font-size:0.75rem;">(${sorted[i].school})</span></span>
          <span>${sorted[i].stats[statKey]}</span>
        </div>`;
      }
    }
    document.getElementById(elementId).innerHTML = html;
  },

  updateStandingsTab() {
    if (!this.state.simCompleted) {
      document.getElementById('standingsContainer').innerHTML = `<p style="text-align: center; color: #7d8296;">Simulate season to view standings.</p>`;
      return;
    }

    // 1. Render AP Top 25 Card (Top 10 visible by default)
    let apTop25 = this.state.teams.slice(0, 25);
    let apHtml = `
      <div style="background: #111118; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0; color: #fff; font-size: 1.4rem;">AP TOP 25</h3>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>AP Rank</th><th>Team</th><th>Conf</th><th>Overall</th><th>Conf W-L</th><th>Team OVR</th></tr>
            </thead>
            <tbody>`;
    
    apTop25.forEach((t, idx) => {
      let isHidden = idx >= 10 ? 'class="ap-extra-row" style="display:none;"' : '';
      apHtml += `
        <tr ${isHidden}>
          <td style="font-weight:800; color:var(--brand-color);">#${t.apRank}</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;" class="clickable-school" onclick="SimEngine.openTeamModal('${t.school}')">
              <img src="${t.logo || ''}" style="width:20px; height:20px; object-fit:contain;">
              <span style="font-weight:700; color:#fff;">${t.school}</span>
            </div>
          </td>
          <td style="color:#7d8296;">${t.conference || 'NCAA'}</td>
          <td>${t.simData.wins}-${t.simData.losses}</td>
          <td>${t.simData.confWins}-${t.simData.confLosses}</td>
          <td style="color:#7d8296;">${t.simData.teamOvr.toFixed(1)}</td>
        </tr>`;
    });

    apHtml += `
            </tbody>
          </table>
        </div>
        ${apTop25.length > 10 ? `<button class="sim-btn sim-btn-secondary" style="margin-top: 1rem; width: 100%;" onclick="SimEngine.toggleApTop25(this)">See More (Top 25)</button>` : ''}
      </div>`;

    // 2. Render Conference Standings Grid
    const confList = ['ACC', 'AAC', 'A10', 'Big 12', 'Big Ten', 'Big East', 'SEC', 'Pac-12', 'WCC', 'Mountain West'];
    
    // Check for any extra conferences in the spreadsheet
    let allConfsInState = [...new Set(this.state.teams.map(t => (t.conference || 'NCAA').trim()))].filter(Boolean);
    let displayConfs = [...confList];
    allConfsInState.forEach(c => {
      if (!displayConfs.some(existing => existing.toLowerCase() === c.toLowerCase()) && c !== 'NCAA') {
        displayConfs.push(c);
      }
    });

    let confsHtml = `<h3 style="color:#fff; margin: 2rem 0 1rem 0; font-size:1.4rem;">CONFERENCE STANDINGS</h3>`;
    confsHtml += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem;">`;

    displayConfs.forEach(confName => {
      let confTeams = this.state.teams.filter(t => (t.conference || '').toLowerCase() === confName.toLowerCase());
      if (confTeams.length === 0) return;

      // Sort teams within conference by confWins desc, then overall wins desc
      confTeams.sort((a,b) => {
        if (b.simData.confWins !== a.simData.confWins) return b.simData.confWins - a.simData.confWins;
        if (b.simData.wins !== a.simData.wins) return b.simData.wins - a.simData.wins;
        return b.simData.teamOvr - a.simData.teamOvr;
      });

      let confSafeId = confName.replace(/[^a-zA-Z0-9]/g, '_');

      confsHtml += `
        <div style="background: #111118; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1.25rem;">
          <h4 style="margin:0 0 1rem 0; color:var(--brand-color); font-size:1.1rem; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:0.5rem; text-transform:uppercase;">${confName}</h4>
          <div class="table-scroll">
            <table>
              <thead>
                <tr><th>Rank</th><th>Team</th><th>Conf W-L</th><th>Overall</th></tr>
              </thead>
              <tbody>`;

      confTeams.forEach((t, idx) => {
        let isHidden = idx >= 5 ? `class="conf-row-${confSafeId}" style="display:none;"` : '';
        let isApRanked = t.apRank !== null && t.apRank <= 25;
        let rowStyle = isApRanked ? 'style="background: rgba(255, 102, 0, 0.14); border-left: 3px solid var(--brand-color);"' : '';
        let apTag = isApRanked ? ` <span style="color:var(--brand-color); font-size:0.85rem; font-weight:800;">(#${t.apRank})</span>` : '';

        confsHtml += `
          <tr ${isHidden} ${rowStyle}>
            <td style="font-weight:700; color:#a1a5b8;">${idx+1}</td>
            <td>
              <div style="display:flex; align-items:center; gap:6px;" class="clickable-school" onclick="SimEngine.openTeamModal('${t.school}')">
                <img src="${t.logo || ''}" style="width:18px; height:18px; object-fit:contain;">
                <span style="font-weight:700; color:#fff;">${t.school}</span>${apTag}
              </div>
            </td>
            <td style="font-weight:800; color:#fff;">${t.simData.confWins}-${t.simData.confLosses}</td>
            <td style="color:#7d8296; font-size:0.9rem;">${t.simData.wins}-${t.simData.losses}</td>
          </tr>`;
      });

      confsHtml += `
              </tbody>
            </table>
          </div>`;
      
      if (confTeams.length > 5) {
        confsHtml += `<button class="sim-btn sim-btn-secondary" style="margin-top:0.75rem; padding:6px 10px; font-size:0.85rem;" onclick="SimEngine.toggleConfStandings('${confSafeId}', this)">See More (${confTeams.length - 5} Teams)</button>`;
      }

      confsHtml += `</div>`;
    });

    confsHtml += `</div>`;

    document.getElementById('standingsContainer').innerHTML = apHtml + confsHtml;
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
    let candidates = [...this.state.activePlayers].sort((a,b) => parseFloat(b.stats.bpm) - parseFloat(a.stats.bpm));
    let html = '';
    for (let i = 0; i < 15; i++) {
      if (candidates[i]) {
        let p = candidates[i];
        html += `<tr>
          <td style="font-weight:800; color:var(--brand-color);">#${i+1}</td>
          <td style="font-weight:700; color:#fff;">${p.name}</td>
          <td>${p.school}</td>
          <td style="color:#a1a5b8;">${p.stats.ppg} PTS, ${p.stats.rpg} REB, ${p.stats.apg} AST</td>
          <td style="font-weight:700;">${p.stats.bpm}</td>
        </tr>`;
      }
    }
    document.getElementById('awardsBody').innerHTML = html;
  },

  openTeamModal(schoolName) {
    let team = this.state.teams.find(t => t.school === schoolName);
    if (!team) return;

    let rank = team.apRank;
    
    document.getElementById('modalTeamLogo').src = team.logo || '';
    document.getElementById('modalTeamName').innerText = team.school;
    document.getElementById('modalTeamYear').innerText = `${this.state.year}-${(this.state.year+1).toString().slice(2)}`;
    
    if (this.state.simCompleted) {
      if (rank && rank <= 25) {
        document.getElementById('modalTeamRank').style.display = 'block';
        document.getElementById('modalTeamRank').innerText = `#${rank}`;
      } else {
        document.getElementById('modalTeamRank').style.display = 'none';
      }

      document.getElementById('modalTeamRecord').innerText = `${team.simData.wins}-${team.simData.losses}`;
      document.getElementById('modalConfRecord').innerText = `${team.simData.confWins}-${team.simData.confLosses}`;
      
      let teamPpg = team.simData.rosterRef.reduce((sum, p) => sum + parseFloat(p.stats.ppg), 0);
      document.getElementById('modalTeamPPG').innerText = teamPpg.toFixed(1);
      document.getElementById('modalOppPPG').innerText = (teamPpg + (team.simData.losses - team.simData.wins) * 0.4).toFixed(1);
    } else {
      document.getElementById('modalTeamRank').style.display = 'none';
      document.getElementById('modalTeamRecord').innerText = "0-0";
      document.getElementById('modalConfRecord').innerText = "0-0";
      document.getElementById('modalTeamPPG').innerText = "0.0";
      document.getElementById('modalOppPPG').innerText = "0.0";
    }

    let rPlayers = this.state.activePlayers.filter(p => p.school === schoolName);
    if (this.state.simCompleted) {
      rPlayers.sort((a,b) => parseFloat(b.stats.mpg) - parseFloat(a.stats.mpg));
    }
    
    let rHtml = '';
    rPlayers.forEach((p, idx) => {
      let statsStr = this.state.simCompleted ? `<span style="display:block; font-size:0.8rem; color:var(--brand-color); margin-top:4px;">${p.stats.ppg} PPG | ${p.stats.mpg} MPG</span>` : '';
      
      rHtml += `
        <tr>
          <td style="color:#7d8296;">${idx+1}</td>
          <td><span style="font-weight:700; color:#fff;">${p.name}</span> ${statsStr}</td>
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

  runOffseason() {
    if (this.state.phase === 'Preseason') {
      alert("Simulate the regular season first before advancing to the offseason.");
      return;
    }

    const classProgression = { 'FR': 'SO', 'SO': 'JR', 'JR': 'SR', 'SR': 'GRADUATED', 'GR': 'GRADUATED' };
    
    this.state.teams.forEach(team => {
      team.roster.forEach(p => {
        p.class = classProgression[p.class] || 'GRADUATED';
        p.rating = Math.min(99, p.rating + Math.floor(Math.random() * 4)); 
      });
      team.roster = team.roster.filter(p => p.class !== 'GRADUATED');
    });

    this.state.year += 1;
    this.state.phase = 'Preseason';
    this.state.simCompleted = false;
    
    document.getElementById('currentYearDisplay').innerText = `${this.state.year}-${(this.state.year+1).toString().slice(2)}`;
    document.getElementById('currentPhaseDisplay').innerText = 'Preseason';
    
    this.filterActiveData();
    this.logNews(`Advanced to ${this.state.year} Offseason. Graduated seniors cleared; incoming recruits added.`);
    
    document.getElementById('statsBody').innerHTML = `<tr><td colspan="25" style="text-align: center; color: #7d8296;">Simulate season to view leaderboards.</td></tr>`;
    document.getElementById('standingsContainer').innerHTML = `<p style="text-align: center; color: #7d8296;">Simulate season to view standings.</p>`;
    document.getElementById('awardsBody').innerHTML = `<tr><td colspan="5" style="text-align: center; color: #7d8296;">Complete a season to generate candidates.</td></tr>`;
  },

  logNews(msg) {
    const feed = document.getElementById('newsFeed');
    const item = document.createElement('div');
    item.style.cssText = `padding: 10px 14px; background: #111118; border-left: 3px solid var(--brand-color); font-size: 0.95rem; margin-bottom: 0.5rem; animation: fadeIn 0.5s;`;
    item.innerText = msg;
    feed.prepend(item);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SimEngine.init();
});
