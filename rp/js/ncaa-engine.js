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
    sortDir: 'desc'
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
            logo: player.school_logo || '', 
            roster: []
          };
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

    // Normalize keys: Lowercase and strip all non-alphanumeric characters
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
      stats: null
    };
  },
  
  filterActiveData() {
    let players = [];
    
    // Process active campus rosters
    this.state.teams.forEach(team => {
      if (team.roster) {
        team.roster.forEach(player => {
          if (player.class !== 'GRADUATED') {
            players.push(player);
          }
        });
      }
    });

    // Process incoming recruiting class
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
    
    // Simulate Team and normalize 200 team-minutes per game
    this.state.teams.forEach(team => {
      team.simData = this.calculateTeamSeason(team);
    });
    
    this.state.teams.sort((a,b) => b.simData.teamOvr - a.simData.teamOvr);
    
    this.state.simCompleted = true;
    this.state.sortCol = 'ppg';
    this.state.sortDir = 'desc';

    this.updateDashboard();
    this.sortAndRenderStatsTable();
    this.updateStandingsTab();
    this.updateAwardsTab();
    
    this.logNews("Regular season complete. Normalized minutes and realistic box scores calculated.");
  },

  calculateTeamSeason(team) {
    let roster = this.state.activePlayers.filter(p => p.school === team.school);
    if (roster.length === 0) return { teamOvr: 70, wins: 0, losses: 31, winPct: '.000', rosterRef: [] };

    // Sort team depth chart by overall rating
    roster.sort((a, b) => b.rating - a.rating);

    // Distribute 200 team rotation minutes (5 players * 40 mins)
    const rawWeights = roster.map((p, idx) => Math.max(0.1, (p.rating - 55) * Math.pow(0.78, idx)));
    const totalWeight = rawWeights.reduce((a, b) => a + b, 0) || 1;

    roster.forEach((p, idx) => {
      let allocatedMpg = (rawWeights[idx] / totalWeight) * 200;
      if (idx > 9) allocatedMpg = 0; // Bench limit cutoff
      p.stats = this.calculatePlayerSeason(p, Math.min(35.5, allocatedMpg));
    });

    const top8 = roster.slice(0, 8);
    const teamOvr = top8.reduce((sum, p) => sum + p.rating, 0) / Math.min(8, top8.length);
    
    const winPct = Math.min(0.94, Math.max(0.06, 0.50 + (teamOvr - 78) * 0.038 + (Math.random() * 0.1 - 0.05)));
    const gamesPlayed = 31;
    const wins = Math.round(gamesPlayed * winPct);
    const losses = gamesPlayed - wins;
    
    return {
      teamOvr: teamOvr,
      wins: wins,
      losses: losses,
      winPct: (wins / gamesPlayed).toFixed(3).replace(/^0+/, ''),
      rosterRef: roster
    };
  },

  calculatePlayerSeason(player, mpg) {
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
    
    // Basic per-game counting stats based on usage minutes
    const usageScale = (mpg / 28) * (r / 78);
    let ppg = Math.max(0.5, (r * 0.18) * usageScale * rng());
    let rpg = Math.max(0.2, (isBig ? 6.5 : 2.5) * usageScale * rng());
    let apg = Math.max(0.1, (!isBig ? 4.0 : 1.2) * usageScale * rng());
    let stl = Math.max(0.1, (!isBig ? 1.2 : 0.5) * usageScale * rng());
    let blk = Math.max(0.1, (isBig ? 1.6 : 0.3) * usageScale * rng());
    let tov = Math.max(0.2, (apg * 0.4 + 0.8) * rng());
    let pf = Math.min(3.8, Math.max(0.8, (mpg / 8) * rng()));

    // Advanced Ratings
    let bpm = ((r - 76) * 0.45) * rng();
    let obpm = bpm * (isBig ? 0.45 : 0.60);
    let dbpm = bpm - obpm;

    // Shooting Split Calculations
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

    this.state.activePlayers.sort((a, b) => {
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
    this.state.activePlayers.forEach((p) => {
      tbodyHtml += `<tr>`;
      currentHeaders.forEach(h => {
        if (h.id === 'name') tbodyHtml += `<td style="font-weight:700; color:#fff;">${p.name}</td>`;
        else if (h.id === 'school') tbodyHtml += `<td>${p.school}</td>`;
        else if (h.id === 'pos') tbodyHtml += `<td>${p.pos}</td>`;
        else tbodyHtml += `<td>${p.stats ? p.stats[h.id] : '-'}</td>`;
      });
      tbodyHtml += `</tr>`;
    });
    
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
    let html = '';
    this.state.teams.forEach((t, index) => {
      html += `<tr>
        <td style="font-weight:800; color:var(--brand-color);">#${index+1}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;" class="clickable-school" onclick="SimEngine.openTeamModal('${t.school}')">
            <img src="${t.logo}" style="width:24px; height:24px; object-fit:contain;">
            <span style="font-weight:700; color:#fff;">${t.school}</span>
          </div>
        </td>
        <td>${t.simData.wins}</td>
        <td>${t.simData.losses}</td>
        <td>${t.simData.winPct}</td>
        <td style="color:#7d8296;">${t.simData.teamOvr.toFixed(1)}</td>
      </tr>`;
    });
    document.getElementById('standingsBody').innerHTML = html;
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

    let rank = this.state.teams.findIndex(t => t.school === schoolName) + 1;
    
    document.getElementById('modalTeamLogo').src = team.logo || '';
    document.getElementById('modalTeamName').innerText = team.school;
    document.getElementById('modalTeamYear').innerText = `${this.state.year}-${(this.state.year+1).toString().slice(2)}`;
    
    if (this.state.simCompleted) {
      document.getElementById('modalTeamRank').style.display = 'block';
      document.getElementById('modalTeamRank').innerText = `#${rank}`;
      document.getElementById('modalTeamRecord').innerText = `${team.simData.wins}-${team.simData.losses}`;
      
      // Calculate realistic total team PPG based on player minutes distribution
      let teamPpg = team.simData.rosterRef.reduce((sum, p) => sum + parseFloat(p.stats.ppg), 0);
      document.getElementById('modalTeamPPG').innerText = teamPpg.toFixed(1);
      document.getElementById('modalOppPPG').innerText = (teamPpg + (team.simData.losses - team.simData.wins) * 0.4).toFixed(1);
    } else {
      document.getElementById('modalTeamRank').style.display = 'none';
      document.getElementById('modalTeamRecord').innerText = "0-0";
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

    // Process player aging and graduations
    const classProgression = { 'FR': 'SO', 'SO': 'JR', 'JR': 'SR', 'SR': 'GRADUATED', 'GR': 'GRADUATED' };
    
    this.state.teams.forEach(team => {
      team.roster.forEach(p => {
        p.class = classProgression[p.class] || 'GRADUATED';
        p.rating = Math.min(99, p.rating + Math.floor(Math.random() * 4)); // Offseason player rating progression
      });
      // Filter out graduated seniors
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
    document.getElementById('standingsBody').innerHTML = `<tr><td colspan="6" style="text-align: center; color: #7d8296;">Simulate season to view standings.</td></tr>`;
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
// 1. Add new state properties inside window.SimEngine.state:
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
  confFilter: 'ALL',   // Default: All NCAA
  scopeFilter: 'full'   // Default: Full Season
},

// 2. Normalize conference parameter in normalizePlayerObj(raw, isRecruit):
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
    stats: null,       // Active split based on filter
    statsFull: null,   // Full Season Stats
    statsConf: null    // Conference Only Stats
  };
},

// 3. Update calculatePlayerSeason to construct both Full and Conference Splits:
calculatePlayerSeason(player, mpg) {
  // Generate base numbers...
  const fullStats = this.buildStatSet(player, mpg, 1.0);
  
  // Conference play features higher defensive scouting & lower variance (0.95x - 0.98x modifier)
  const confStats = this.buildStatSet(player, mpg, 0.96);

  player.statsFull = fullStats;
  player.statsConf = confStats;

  // Active stat view reference
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

// 4. Add filter setters & update sortAndRenderStatsTable:
setConfFilter(val) {
  this.state.confFilter = val;
  this.sortAndRenderStatsTable();
},

setStatScope(val) {
  this.state.scopeFilter = val;
  // Point player stats reference to full vs conf dataset
  this.state.activePlayers.forEach(p => {
    p.stats = val === 'conf' ? p.statsConf : p.statsFull;
  });
  this.sortAndRenderStatsTable();
},

sortAndRenderStatsTable() {
  if (!this.state.simCompleted) return;
  
  let col = this.state.sortCol;
  let dir = this.state.sortDir === 'desc' ? -1 : 1;

  // Filter pool by conference
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

  // Table header construction...
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

  // Table body construction...
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
}
