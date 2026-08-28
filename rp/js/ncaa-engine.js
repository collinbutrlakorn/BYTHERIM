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
      
      if(!recruitsRes.ok || !rostersRes.ok) {
        throw new Error("Could not load Google Sheets CSVs");
      }
      
      const recruitsText = await recruitsRes.text();
      const rostersText = await rostersRes.text();
      
      const recruitsData = this.parseCSV(recruitsText);
      const rostersData = this.parseCSV(rostersText);
      
      // Group flat roster CSV into team arrays
      const teamsMap = {};
      rostersData.forEach(player => {
        // Fallback for capitalization variants in CSV headers
        const school = player.school || player.School;
        if(!school) return;
        
        if(!teamsMap[school]) {
          teamsMap[school] = {
            school: school,
            logo: player.logo || player.school_logo || '', 
            roster: []
          };
        }
        
        // Nest high school stats for simulation formulas
        player.hs_stats = {
          ppg: parseFloat(player.ppg || player.hs_ppg || player.PPG || 0),
          rpg: parseFloat(player.rpg || player.hs_rpg || player.RPG || 0),
          apg: parseFloat(player.apg || player.hs_apg || player.APG || 0),
          bpm: parseFloat(player.bpm || player.hs_bpm || player.BPM || 0)
        };
        
        teamsMap[school].roster.push(player);
      });
      
      this.state.teams = Object.values(teamsMap);
      this.state.recruits = recruitsData;
      
      this.filterActiveData();
      
      document.getElementById('currentYearDisplay').innerText = `${this.state.year}-${(this.state.year+1).toString().slice(2)}`;
      this.logNews(`Loaded ${this.state.teams.length} teams and ${this.state.activePlayers.length} active players for the ${this.state.year} season.`);
      
    } catch(err) {
      console.error("Database Fetch Error:", err);
      this.logNews(`Database Error: ${err.message}. Check your published Google Sheets links.`);
    }
  },

  // Helper function to handle commas inside text fields gracefully
  parseCSV(csvData) {
    const lines = csvData.split(/\r?\n/);
    const result = [];
    if(lines.length === 0) return result;

    const headers = lines[0].split(',').map(h => h.trim().replace(/(^"|"$)/g, ''));
    
    for(let i = 1; i < lines.length; i++) {
      if(!lines[i].trim()) continue;
      
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
  
  filterActiveData() {
    let players = [];
    
    this.state.teams.forEach(team => {
      if(team.roster) {
        team.roster.forEach(player => {
          let p = { ...player, school: team.school, school_logo: team.logo, isRecruit: false };
          players.push(p);
        });
      }
    });

    this.state.recruits.forEach(rec => {
      // Fallback for CSV casing variations
      let committedTo = rec.committedTo || rec['Committed To'] || rec.school;
      let classYear = rec.classYear || rec['Class Year'] || rec.class;

      if(committedTo && parseInt(classYear) <= this.state.year) {
        let team = this.state.teams.find(t => t.school === committedTo);
        let schoolLogo = team ? team.logo : '';
        let p = { ...rec, school: committedTo, school_logo: schoolLogo, isRecruit: true, class: 'FR' };
        players.push(p);
      }
    });
    
    this.state.activePlayers = players;
  },

  simulateSeason() {
    if(this.state.phase !== 'Preseason') {
      alert("Season already simulated! Advance offseason to start a new year.");
      return;
    }
    
    this.state.phase = 'Regular Season Final';
    document.getElementById('currentPhaseDisplay').innerText = 'Regular Season Final';
    
    this.state.activePlayers.forEach(p => {
      p.stats = this.calculatePlayerSeason(p);
    });
    
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
    
    this.logNews("Regular season simulation complete. Stats and standings generated based on player formulas.");
  },

  calculatePlayerSeason(player) {
    const hs = player.hs_stats || {};
    let rating = parseFloat(player.rating || player.Rating) || 75;
    
    let pClass = player.class || player.classYear || player['Class Year'] || 'FR';
    let isUpper = ['JR', 'SR', 'GR', 'Jr', 'Sr'].includes(pClass.toString().toUpperCase());
    let isElite = rating >= 88;
    
    let prioMultiplier = 1.0;
    if (isUpper) prioMultiplier += 0.25;
    if (isElite) prioMultiplier += 0.20;
    
    let baseMpg = Math.min(36, Math.max(12, ((rating - 70) * 1.5) * prioMultiplier));
    const rng = () => 0.85 + (Math.random() * 0.30); 
    
    let mpg = baseMpg * rng();
    if (mpg > 38) mpg = 38 + Math.random();
    if (mpg < 10) mpg = 10 + Math.random() * 5;

    const scale = mpg / 28; 

    let ppg = (hs.ppg || (Math.random() * 10 + 5)) * scale * 0.85 * rng();
    let rpg = (hs.rpg || (Math.random() * 5 + 2)) * scale * 0.9 * rng();
    let apg = (hs.apg || (Math.random() * 4 + 1)) * scale * 0.9 * rng();
    
    const posStr = (player.pos || player.Pos || '').toUpperCase();
    const isBig = posStr.includes('C') || (posStr.includes('F') && !posStr.includes('G'));
    
    let stl = (0.3 + (Math.random() * 1.2) * (isBig ? 0.7 : 1.2) * (mpg/20));
    let blk = (0.2 + (Math.random() * 1.5) * (isBig ? 1.8 : 0.3) * (mpg/20));
    let tov = (0.8 + (apg * 0.35) + (Math.random() * 1.5) * (mpg/20));
    let pf = (1.5 + (Math.random() * 1.5) + (isBig ? 0.8 : 0) * (mpg/20));

    let bpm = (((hs.bpm || 0) * 0.5) + ((rating - 80) * 0.3)) * rng();

    let ftRate = rng() * (isBig ? 0.45 : 0.28);
    let ftm = ppg * ftRate;
    let ftPct = (isBig ? 0.65 : 0.80) * rng();
    if (ftPct > 0.94) ftPct = 0.92;
    let fta = ftPct > 0 ? ftm / ftPct : 0;
    
    let ptsFromFg = ppg - ftm;
    let threePRate = isBig ? (rng() * 0.15) : (0.35 + rng() * 0.3);
    if (threePRate > 0.8) threePRate = 0.8;
    
    let threePm = (ptsFromFg * threePRate) / 3;
    let threePPct = isBig ? (0.28 * rng()) : (0.35 * rng());
    if (threePPct < 0.15) threePPct = 0; 
    let threePa = threePPct > 0 ? threePm / threePPct : 0;
    
    let twoPm = (ptsFromFg - (threePm * 3)) / 2;
    let twoPPct = isBig ? (0.58 * rng()) : (0.48 * rng());
    let twoPa = twoPPct > 0 ? twoPm / twoPPct : 0;
    
    let fgm = twoPm + threePm;
    let fga = twoPa + threePa;
    let fgPct = fga > 0 ? fgm / fga : 0;

    let tsPct = (2 * (fga + 0.44 * fta)) > 0 ? ppg / (2 * (fga + 0.44 * fta)) : 0;
    let rTsPct = (tsPct * 100) - 54.0;
    let eFgPct = fga > 0 ? (fgm + 0.5 * threePm) / fga : 0;
    
    let obpmRatio = isBig ? 0.4 : 0.65;
    let obpm = bpm * obpmRatio + (Math.random() * 2 - 1);
    let dbpm = bpm - obpm;
    
    let usg = ((fga + 0.44 * fta + tov) / mpg) * 45; 
    
    let orebPct = isBig ? 8 + Math.random()*6 : 2 + Math.random()*3;
    let drebPct = isBig ? 18 + Math.random()*10 : 8 + Math.random()*5;
    let trbPct = (orebPct + drebPct) / 2;
    
    let astPct = (apg / mpg) * 65;
    let totalPos = fga + 0.44*fta + tov;
    let tovPct = totalPos > 0 ? (tov / totalPos) * 100 : 0;
    let blkPct = (blk / mpg) * 45;
    
    let ftr = fga > 0 ? fta / fga : 0;
    let threePar = fga > 0 ? threePa / fga : 0;
    
    let ortg = 100 + (obpm * 3.5) + (Math.random() * 5);
    let drtg = 100 - (dbpm * 3.5) + (Math.random() * 5);
    let netRtg = ortg - drtg;

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
      orebPct: t1(orebPct)+'%', drebPct: t1(drebPct)+'%', trbPct: t1(trbPct)+'%',
      astPct: t1(astPct)+'%', tovPct: t1(tovPct)+'%', blkPct: t1(blkPct)+'%',
      usg: t1(usg)+'%', ftr: t3(ftr), threePar: t3(threePar),
      ortg: t1(ortg), drtg: t1(drtg), netRtg: t1(netRtg)
    };
  },

  calculateTeamSeason(team) {
    let roster = this.state.activePlayers.filter(p => p.school === team.school);
    let totalBpm = 0;
    let top3Bpm = [];
    
    roster.forEach(p => {
      let bpm = parseFloat(p.stats.bpm) || 0;
      totalBpm += bpm;
      top3Bpm.push(bpm);
    });
    
    top3Bpm.sort((a,b) => b-a);
    let starPower = top3Bpm.slice(0,3).reduce((a,b)=>a+b, 0);
    
    let ratingOvr = 75 + (totalBpm * 1.2) + (starPower * 1.5) + (Math.random() * 5);
    let winPct = Math.min(0.95, Math.max(0.1, (ratingOvr - 65) / 40));
    
    let gamesPlayed = 31;
    let wins = Math.round(gamesPlayed * winPct);
    let losses = gamesPlayed - wins;
    
    return {
      teamOvr: ratingOvr,
      wins: wins,
      losses: losses,
      winPct: (wins/gamesPlayed).toFixed(3).replace(/^0+/, ''),
      rosterRef: roster
    };
  },

  toggleStatView(view) {
    this.state.statView = view;
    this.sortAndRenderStatsTable();
  },

  handleSort(colId) {
    if(!this.state.simCompleted) return;
    if(this.state.sortCol === colId) {
      this.state.sortDir = this.state.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.state.sortCol = colId;
      this.state.sortDir = 'desc';
    }
    this.sortAndRenderStatsTable();
  },

  sortAndRenderStatsTable() {
    if(!this.state.simCompleted) return;
    
    let col = this.state.sortCol;
    let dir = this.state.sortDir === 'desc' ? -1 : 1;

    this.state.activePlayers.sort((a, b) => {
      let valA = a.stats ? a.stats[col] : 0;
      let valB = b.stats ? b.stats[col] : 0;

      if(['name', 'school', 'pos', 'class'].includes(col)) {
        valA = a[col] || a.name || a.Name || '';
        valB = b[col] || b.name || b.Name || '';
        return valA.toString().localeCompare(valB.toString()) * dir;
      }

      if(typeof valA === 'string') valA = parseFloat(valA.replace('%','')) || 0;
      if(typeof valB === 'string') valB = parseFloat(valB.replace('%','')) || 0;

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
        let nameField = p.name || p.Name;
        let posField = p.pos || p.Pos;
        if(h.id === 'name') tbodyHtml += `<td style="font-weight:700; color:#fff;">${nameField}</td>`;
        else if(h.id === 'school') tbodyHtml += `<td>${p.school}</td>`;
        else if(h.id === 'pos') tbodyHtml += `<td>${posField || '-'}</td>`;
        else tbodyHtml += `<td>${p.stats[h.id] || '-'}</td>`;
      });
      tbodyHtml += `</tr>`;
    });
    
    document.getElementById('statsBody').innerHTML = tbodyHtml;
  },

  updateDashboard() {
    let topTeamsHtml = '';
    for(let i=0; i<10; i++){
      if(this.state.teams[i]) {
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
    
    this.populateDashList('dashPts', 'ppg', 'PPG');
    this.populateDashList('dashReb', 'rpg', 'RPG');
    this.populateDashList('dashAst', 'apg', 'APG');
    this.populateDashList('dashStl', 'stl', 'SPG');
    this.populateDashList('dashBlk', 'blk', 'BPG');
  },

  populateDashList(elementId, statKey, label) {
    let sorted = [...this.state.activePlayers].sort((a,b) => parseFloat(b.stats[statKey]) - parseFloat(a.stats[statKey]));
    let html = '';
    for(let i=0; i<5; i++){
      if(sorted[i]) {
        let nameField = sorted[i].name || sorted[i].Name;
        html += `<div class="leader-row">
          <span>${i+1}. ${nameField} <span style="font-size:0.75rem;">(${sorted[i].school})</span></span>
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
    for(let i=0; i<15; i++) {
      if(candidates[i]) {
        let p = candidates[i];
        let nameField = p.name || p.Name;
        html += `<tr>
          <td style="font-weight:800; color:var(--brand-color);">#${i+1}</td>
          <td style="font-weight:700; color:#fff;">${nameField}</td>
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
    if(!team) return;

    let rank = this.state.teams.findIndex(t => t.school === schoolName) + 1;
    
    document.getElementById('modalTeamLogo').src = team.logo || '';
    document.getElementById('modalTeamName').innerText = team.school;
    document.getElementById('modalTeamYear').innerText = `${this.state.year}-${(this.state.year+1).toString().slice(2)}`;
    
    if(this.state.simCompleted) {
      document.getElementById('modalTeamRank').style.display = 'block';
      document.getElementById('modalTeamRank').innerText = `#${rank}`;
      document.getElementById('modalTeamRecord').innerText = `${team.simData.wins}-${team.simData.losses}`;
      
      let teamPpg = team.simData.rosterRef.reduce((sum, p) => sum + parseFloat(p.stats.ppg), 0);
      document.getElementById('modalTeamPPG').innerText = teamPpg.toFixed(1);
      document.getElementById('modalOppPPG').innerText = (teamPpg - (Math.random()*8 - 2)).toFixed(1);
    } else {
      document.getElementById('modalTeamRank').style.display = 'none';
      document.getElementById('modalTeamRecord').innerText = "0-0";
      document.getElementById('modalTeamPPG').innerText = "0.0";
      document.getElementById('modalOppPPG').innerText = "0.0";
    }

    let rPlayers = this.state.activePlayers.filter(p => p.school === schoolName);
    if(this.state.simCompleted) {
      rPlayers.sort((a,b) => parseFloat(b.stats.mpg) - parseFloat(a.stats.mpg));
    }
    
    let rHtml = '';
    rPlayers.forEach((p, idx) => {
      let statsStr = this.state.simCompleted ? `<span style="display:block; font-size:0.8rem; color:var(--brand-color); margin-top:4px;">${p.stats.ppg} PPG | ${p.stats.mpg} MPG</span>` : '';
      let cls = p.class || p.classYear || p['Class Year'] || 'FR';
      let nameField = p.name || p.Name;
      let posField = p.pos || p.Pos;
      
      rHtml += `
        <tr>
          <td style="color:#7d8296;">${idx+1}</td>
          <td><span style="font-weight:700; color:#fff;">${nameField}</span> ${statsStr}</td>
          <td>${posField || '-'}</td>
          <td>${cls}</td>
          <td>${p.ht || p.Ht || '-'}</td>
          <td>${p.wt || p.Wt || '-'}</td>
          <td>${p.home || p.hometown || p.Hometown || '-'}</td>
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
    if(this.state.phase === 'Preseason') {
      alert("Simulate the regular season first before advancing to the offseason.");
      return;
    }
    this.state.year += 1;
    this.state.phase = 'Preseason';
    this.state.simCompleted = false;
    
    document.getElementById('currentYearDisplay').innerText = `${this.state.year}-${(this.state.year+1).toString().slice(2)}`;
    document.getElementById('currentPhaseDisplay').innerText = 'Preseason';
    
    this.filterActiveData();
    this.logNews(`Advanced to ${this.state.year} offseason. Freshmen processed. Regular season stats reset.`);
    
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
