// ==========================================
// 1. CONFIGURATION & MAPPING
// ==========================================
const RECRUIT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv';

const COLUMN_MAP = {
  name: "name",
  pos: "pos",
  school: "committedSchool",
  rating: "rating",
  classYear: "classYear",
  hs_mpg: "hs_mpg",
  hs_ppg: "hs_ppg",
  hs_rpg: "hs_rpg",
  hs_apg: "hs_apg",
  hs_spg: "hs_spg", 
  hs_bpg: "hs_bpg", 
  hs_bpm: "hs_bpm",
  hs_usg: "hs_usg",
  hs_ts: "hs_ts"
};

// ==========================================
// 2. CORE SIMULATION ENGINE
// ==========================================
const SimEngine = {
  state: {
    currentYear: 2028, // Update this to match the current "active" season in your RP
    phase: 'Preseason',
    allPlayers: [],
    activeNcaaPlayers: [],
    teams: []
  },

  init() {
    this.logStory("Engine initializing. Fetching database...");
    this.loadRecruitDatabase();
  },

  async loadRecruitDatabase() {
    try {
      const response = await fetch(RECRUIT_CSV_URL);
      const csvText = await response.text();
      
      this.state.allPlayers = this.parseCSVData(csvText);
      this.logStory(`Loaded database. Waiting for season simulation...`);
    } catch (err) {
      console.error("Error fetching recruit CSV:", err);
      this.logStory("ERROR: Could not load recruiting database.");
    }
  },

  parseCSVData(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { currentRow.push(currentCell.trim()); currentCell = ''; }
      else if (char === '\n' && !inQuotes) { currentRow.push(currentCell.trim()); rows.push(currentRow); currentRow = []; currentCell = ''; }
      else if (char !== '\r') currentCell += char;
    }
    if (currentRow.length > 0) { currentRow.push(currentCell.trim()); rows.push(currentRow); }

    const headers = rows[0];
    const getCol = (key) => {
      const targetHeader = COLUMN_MAP[key];
      const index = headers.findIndex(h => h === targetHeader);
      return index !== -1 ? index : null;
    };

    const col = {
      name: getCol('name'), pos: getCol('pos'), school: getCol('school'),
      rating: getCol('rating'), classYear: getCol('classYear'),
      mpg: getCol('hs_mpg'), ppg: getCol('hs_ppg'), rpg: getCol('hs_rpg'), 
      apg: getCol('hs_apg'), spg: getCol('hs_spg'), bpg: getCol('hs_bpg'), bpm: getCol('hs_bpm')
    };

    return rows.slice(1).map((row, idx) => {
      const safeNum = (index, fallback = 0) => {
        if (index === null || !row[index]) return fallback;
        const val = parseFloat(row[index]);
        return isNaN(val) ? fallback : val;
      };

      return {
        id: `rec_${idx}`,
        name: col.name !== null && row[col.name] ? row[col.name] : `Player ${idx}`,
        pos: col.pos !== null && row[col.pos] ? row[col.pos] : 'G',
        school: col.school !== null && row[col.school] ? row[col.school] : 'Uncommitted',
        classYear: col.classYear !== null && row[col.classYear] ? row[col.classYear] : '0',
        rating: safeNum(col.rating, 80),
        hs_stats: {
          mpg: safeNum(col.mpg, 24),
          ppg: safeNum(col.ppg, 12),
          rpg: safeNum(col.rpg, 4),
          apg: safeNum(col.apg, 2),
          spg: safeNum(col.spg, 1),
          bpg: safeNum(col.bpg, 0.5),
          bpm: safeNum(col.bpm, 0)
        },
        stats: null
      };
    }).filter(p => p.name !== `Player ${p.id.split('_')[1]}`); 
  },

  // --- FILTERING & MATH ENGINE ---
  filterActivePlayers() {
    // A player is active if their graduation year is the current year or up to 3 years prior (FR, SO, JR, SR)
    // AND they are committed to a school.
    this.state.activeNcaaPlayers = this.state.allPlayers.filter(p => {
      const gradYear = parseInt(p.classYear);
      const isCommitted = p.school.toLowerCase() !== 'uncommitted' && p.school !== '';
      return isCommitted && (gradYear <= this.state.currentYear && gradYear >= this.state.currentYear - 3);
    });
  },

  calculatePlayerSeason(player) {
    const hs = player.hs_stats;
    let projMpg = Math.min(36, Math.max(8, (player.rating - 76) * 1.4));
    const baseHsMpg = hs.mpg > 5 ? hs.mpg : 28; 
    const scaleFactor = (projMpg / baseHsMpg) * 0.82; // 0.82 standard NCAA competition penalty

    return { 
      mpg: projMpg.toFixed(1), 
      ppg: (hs.ppg * scaleFactor).toFixed(1), 
      rpg: (hs.rpg * scaleFactor * 0.9).toFixed(1), 
      apg: (hs.apg * scaleFactor * 0.95).toFixed(1),
      spg: (hs.spg * scaleFactor * 0.85).toFixed(1),
      bpg: (hs.bpg * scaleFactor * 0.85).toFixed(1),
      bpm: ((hs.bpm * 0.55) + ((player.rating - 85) * 0.25)).toFixed(1) 
    };
  },

  generateTeams() {
    const teamMap = {};
    
    // Group active players by school
    this.state.activeNcaaPlayers.forEach(p => {
      if (!teamMap[p.school]) teamMap[p.school] = { name: p.school, players: [], teamOvr: 0, wins: 0, losses: 0 };
      teamMap[p.school].players.push(p);
    });

    // Calculate Team Overall & Records
    this.state.teams = Object.values(teamMap).map(team => {
      // Team strength based on top 5 BPMs + depth
      team.players.sort((a, b) => parseFloat(b.stats.bpm) - parseFloat(a.stats.bpm));
      const top5Sum = team.players.slice(0, 5).reduce((sum, p) => sum + parseFloat(p.stats.bpm), 0);
      
      // Abstract Team Rating formula (0 to 100 scale ideally)
      team.teamOvr = (75 + (top5Sum * 1.2)).toFixed(1);

      // Generate realistic 34-game schedule record based on Team Ovr
      const winPct = Math.max(0.15, Math.min(0.95, (team.teamOvr - 70) / 30));
      team.wins = Math.round(34 * winPct);
      team.losses = 34 - team.wins;
      
      return team;
    });

    // Sort teams by Wins/Team Ovr to create AP Poll
    this.state.teams.sort((a, b) => b.teamOvr - a.teamOvr);
  },

  // --- GAME LOOP ---
  simulateSeason() {
    if (this.state.phase !== 'Preseason') {
      alert("Season already simulated! Advance offseason.");
      return;
    }

    this.filterActivePlayers();
    
    if(this.state.activeNcaaPlayers.length === 0) {
      alert("No active collegiate players found. Check 'classYear' and 'committedSchool' data in your sheet.");
      return;
    }

    this.logStory(`Simulating ${this.state.currentYear} Season for ${this.state.activeNcaaPlayers.length} active players...`);
    
    this.state.activeNcaaPlayers.forEach(player => {
      player.stats = this.calculatePlayerSeason(player);
    });

    this.generateTeams();

    this.state.phase = 'Postseason';
    this.updateUI();
    this.renderAllTabs();
  },

  runOffseason() {
    if (this.state.phase !== 'Postseason') return;
    this.state.currentYear += 1;
    this.state.phase = 'Preseason';
    this.state.activeNcaaPlayers.forEach(p => p.stats = null);
    this.logStory(`Advanced to ${this.state.currentYear} season.`);
    this.updateUI();
    document.getElementById('dashTopTeams').innerHTML = '<p style="color:#7d8296;">Simulate season to generate rankings.</p>';
    ['dashPts','dashReb','dashAst','dashStl','dashBlk'].forEach(id => document.getElementById(id).innerHTML = '');
  },

  // --- RENDER FUNCTIONS ---
  updateUI() {
    document.getElementById('currentYearDisplay').innerText = this.state.currentYear;
    document.getElementById('currentPhaseDisplay').innerText = this.state.phase;
  },

  renderAllTabs() {
    this.renderDashboard();
    this.renderStatLeaders();
    this.renderTeamRankings();
    this.renderAwards();
  },

  renderDashboard() {
    // Top 10 Teams
    const teamsHtml = this.state.teams.slice(0, 10).map((t, i) => `
      <div class="team-badge">
        <span class="team-rank">#${i + 1}</span> ${t.name} <span style="color:#a1a5b8; font-weight:400; font-size:0.85rem;">(${t.wins}-${t.losses})</span>
      </div>
    `).join('');
    document.getElementById('dashTopTeams').innerHTML = teamsHtml;

    // Top 5 Stat Helpers
    const renderTop5 = (statKey, elemId) => {
      const sorted = [...this.state.activeNcaaPlayers].sort((a, b) => parseFloat(b.stats[statKey]) - parseFloat(a.stats[statKey])).slice(0, 5);
      const html = sorted.map((p, i) => `
        <div class="leader-row">
          <span>${i+1}. ${p.name.split(' ').pop()}</span> 
          <span>${p.stats[statKey]}</span>
        </div>
      `).join('');
      document.getElementById(elemId).innerHTML = html;
    };

    renderTop5('ppg', 'dashPts');
    renderTop5('rpg', 'dashReb');
    renderTop5('apg', 'dashAst');
    renderTop5('spg', 'dashStl');
    renderTop5('bpg', 'dashBlk');
  },

  renderStatLeaders() {
    const tbody = document.getElementById('statsBody');
    const sorted = [...this.state.activeNcaaPlayers].sort((a, b) => parseFloat(b.stats.ppg) - parseFloat(a.stats.ppg));
    
    tbody.innerHTML = sorted.slice(0, 100).map((p, i) => {
      const s = p.stats;
      const getYearText = (gradYear) => {
        const diff = gradYear - this.state.currentYear;
        if(diff === 0) return 'SR'; if(diff === 1) return 'JR'; if(diff === 2) return 'SO'; return 'FR';
      };
      return `
        <tr>
          <td style="color:#7d8296;">#${i + 1}</td>
          <td style="font-weight:700; color:#fff;">${p.name}</td>
          <td><span style="color:#38bdf8; font-size: 0.85rem;">${getYearText(parseInt(p.classYear))}</span></td>
          <td style="color:#a1a5b8;">${p.school}</td>
          <td>${s.mpg}</td>
          <td style="font-weight:600; color:#fff;">${s.ppg}</td>
          <td style="font-weight:600;">${s.rpg}</td>
          <td style="font-weight:600;">${s.apg}</td>
          <td>${s.spg}</td>
          <td>${s.bpg}</td>
          <td style="color:#4ade80;">${s.bpm}</td>
        </tr>
      `;
    }).join('');
  },

  renderTeamRankings() {
    const tbody = document.getElementById('standingsBody');
    tbody.innerHTML = this.state.teams.map((t, i) => {
      const isRanked = i < 25;
      return `
        <tr>
          <td style="font-weight:800; color:${isRanked ? '#38bdf8' : '#7d8296'};">${isRanked ? '#' + (i+1) : '--'}</td>
          <td style="font-weight:700; color:#fff;">${t.name}</td>
          <td style="color:#4ade80;">${t.wins}</td>
          <td style="color:#f87171;">${t.losses}</td>
          <td>${(t.wins / (t.wins + t.losses)).toFixed(3).replace('0.', '.')}</td>
          <td style="color:#a1a5b8;">${t.teamOvr}</td>
        </tr>
      `;
    }).join('');
  },

  renderAwards() {
    const tbody = document.getElementById('awardsBody');
    const sorted = [...this.state.activeNcaaPlayers].sort((a, b) => parseFloat(b.stats.bpm) - parseFloat(a.stats.bpm));
    
    tbody.innerHTML = sorted.slice(0, 10).map((p, i) => `
      <tr>
        <td style="color:#38bdf8; font-weight:800;">#${i + 1}</td>
        <td style="font-weight:700; color:#fff;">${p.name}</td>
        <td style="color:#a1a5b8;">${p.school}</td>
        <td>${p.stats.ppg} PTS, ${p.stats.rpg} REB, ${p.stats.apg} AST</td>
        <td style="font-weight:800; color:#4ade80;">+${p.stats.bpm}</td>
      </tr>
    `).join('');
  },

  logStory(msg) {
    const feed = document.getElementById('newsFeed');
    if (!feed) return;
    const item = document.createElement('div');
    item.style.cssText = 'padding: 10px 14px; background: #111118; border-left: 3px solid #38bdf8; font-size: 0.95rem;';
    item.innerText = msg;
    feed.prepend(item); 
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SimEngine.init();
});
