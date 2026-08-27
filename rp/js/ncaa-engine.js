// ==========================================
// 1. CONFIGURATION & MAPPING
// ==========================================
const RECRUIT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv';
const ROSTER_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=0&single=true&output=csv';

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
  hs_bpm: "hs_bpm",
  hs_usg: "hs_usg",
  hs_ts: "hs_ts"
};

// ==========================================
// 2. CORE SIMULATION ENGINE
// ==========================================
const SimEngine = {
  state: {
    currentYear: 2028,
    phase: 'Preseason',
    players: [],
    rosters: [],
    teamData: {}
  },

  init() {
    this.logStory("Engine initializing. Connecting to BYTHERIM databases...");
    this.loadRecruitDatabase();
    this.loadRosterDatabase();
  },

  async loadRecruitDatabase() {
    try {
      const response = await fetch(RECRUIT_CSV_URL);
      const csvText = await response.text();
      this.state.players = this.parseCSVData(csvText);
      this.logStory(`Successfully loaded ${this.state.players.length} prospects from the database.`);
      this.renderTable();
      this.updateUI();
    } catch (err) {
      console.error("Error fetching recruit CSV:", err);
      this.logStory("ERROR: Could not load recruiting database.");
    }
  },

  async loadRosterDatabase() {
    try {
      const response = await fetch(ROSTER_CSV_URL);
      const csvText = await response.text();
      this.state.rosters = this.parseRosterCSV(csvText);
      this.logStory("Live Team Rosters synched.");
    } catch (err) {
      console.error("Error fetching rosters:", err);
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
    const dataRows = rows.slice(1);

    const getCol = (key) => {
      const index = headers.findIndex(h => h === COLUMN_MAP[key]);
      return index !== -1 ? index : null;
    };

    const col = {
      name: getCol('name'), pos: getCol('pos'), school: getCol('school'),
      rating: getCol('rating'), classYear: getCol('classYear'),
      mpg: getCol('hs_mpg'), ppg: getCol('hs_ppg'), rpg: getCol('hs_rpg'), 
      apg: getCol('hs_apg'), bpm: getCol('hs_bpm')
    };

    return dataRows.map((row, idx) => {
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
        classYear: col.classYear !== null && row[col.classYear] ? row[col.classYear] : 'FR',
        rating: safeNum(col.rating, 80),
        hs_stats: {
          mpg: safeNum(col.mpg, 24), ppg: safeNum(col.ppg, 12), rpg: safeNum(col.rpg, 4),
          apg: safeNum(col.apg, 2), bpm: safeNum(col.bpm, 0)
        },
        stats: null 
      };
    }).filter(p => p.name !== `Player ${p.id.split('_')[1]}`); 
  },

  parseRosterCSV(text) {
    const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim().replace(/(^"|"$)/g, '')));
    return rows.slice(1).map(row => ({
      team: row[0], year: row[1], number: row[2], name: row[3],
      class: row[4], pos: row[5], ht: row[6], wt: row[7],
      from: row[8], draft: row[9]
    })).filter(p => p.name); 
  },

  calculatePlayerSeason(player) {
    const hs = player.hs_stats;
    let projMpg = Math.min(36, Math.max(6, (player.rating - 76) * 1.3));
    const baseHsMpg = hs.mpg > 5 ? hs.mpg : 28; 
    
    const compPenalty = 0.82; 
    const scaleFactor = (projMpg / baseHsMpg) * compPenalty;

    let ppg = (hs.ppg * scaleFactor).toFixed(1);
    let rpg = (hs.rpg * scaleFactor * 0.9).toFixed(1);
    let apg = (hs.apg * scaleFactor * 0.95).toFixed(1);
    let projBpm = ((hs.bpm * 0.55) + ((player.rating - 85) * 0.25)).toFixed(1);

    return { mpg: projMpg.toFixed(1), ppg, rpg, apg, bpm: projBpm };
  },

  simulateSeason() {
    if (this.state.phase !== 'Preseason') {
      alert("Season has already been simulated! Run the offseason loop to advance.");
      return;
    }
    if (this.state.players.length === 0) {
      alert("Database still loading, please wait.");
      return;
    }

    this.logStory(`Simulating ${this.state.currentYear} Regular Season & Tournaments...`);
    
    this.state.players.forEach(player => {
      player.stats = this.calculatePlayerSeason(player);
    });
    this.state.players.sort((a, b) => parseFloat(b.stats.bpm) - parseFloat(a.stats.bpm));

    this.generateTeamStats();

    this.state.phase = 'Postseason';
    this.logStory("Season Complete. Production translated from High School metrics.");
    
    this.renderTable();
    this.updateUI();
  },

  generateTeamStats() {
    const uniqueTeams = [...new Set(this.state.rosters.map(p => p.team))];
    
    uniqueTeams.forEach(team => {
      const wins = Math.floor(Math.random() * 20) + 10;
      const losses = 32 - wins;
      const confWins = Math.floor(Math.random() * 12) + 4;
      const confLosses = 18 - confWins;
      
      const isTop25 = wins > 24;
      const apRank = isTop25 ? Math.floor(Math.random() * 25) + 1 : null;
      
      this.state.teamData[team] = {
        record: `${wins}-${losses}`,
        confRecord: `${confWins}-${confLosses}`,
        rank: apRank,
        teamPpg: (70 + Math.random() * 15).toFixed(1),
        oppPpg: (60 + Math.random() * 15).toFixed(1)
      };
    });
  },

  openTeamModal(teamName) {
    if (!teamName || teamName === 'Uncommitted') return;
    
    const teamStats = this.state.teamData[teamName] || { 
      record: '0-0', confRecord: '0-0', rank: null, teamPpg: '0.0', oppPpg: '0.0' 
    };

    const logoFormatted = teamName.toLowerCase().replace(/\s+/g, '');
    document.getElementById('modalTeamLogo').src = `../schoollogos/${logoFormatted}.png`;
    document.getElementById('modalTeamName').innerText = teamName;
    document.getElementById('modalTeamYear').innerText = `${this.state.currentYear} Roster`;
    
    const rankBadge = document.getElementById('modalTeamRank');
    if (teamStats.rank) {
      rankBadge.innerText = `#${teamStats.rank}`;
      rankBadge.style.display = 'inline-block';
    } else {
      rankBadge.style.display = 'none';
    }

    document.getElementById('modalTeamRecord').innerText = teamStats.record;
    document.getElementById('modalConfRecord').innerText = teamStats.confRecord;
    document.getElementById('modalTeamPPG').innerText = teamStats.teamPpg;
    document.getElementById('modalOppPPG').innerText = teamStats.oppPpg;

    const teamRoster = this.state.rosters.filter(p => p.team === teamName);
    const tbody = document.getElementById('modalRosterBody');
    
    tbody.innerHTML = teamRoster.map(p => {
      const hasDraftData = p.draft && p.draft.trim() !== '' && p.draft !== '-';
      const draftDisplay = hasDraftData 
        ? `<span class="draft-projection" data-player="${p.name}">${p.draft}</span>` 
        : `<span style="color:#4b5063;">-</span>`;

      return `
        <tr>
          <td style="color:#7d8296;">${p.number}</td>
          <td style="font-weight:700; color:#fff;">${p.name}</td>
          <td style="color:#a1a5b8;">${p.pos}</td>
          <td>${p.class}</td>
          <td>${p.ht}</td>
          <td>${p.wt}</td>
          <td style="color:#a1a5b8; font-size:0.9rem;">${p.from}</td>
          <td>${draftDisplay}</td>
        </tr>
      `;
    }).join('');

    document.getElementById('teamModal').classList.add('active');
  },

  closeTeamModal() {
    document.getElementById('teamModal').classList.remove('active');
  },

  runOffseason() {
    if (this.state.phase !== 'Postseason') {
      alert("You must simulate the season before advancing to the offseason.");
      return;
    }
    this.state.currentYear += 1;
    this.state.phase = 'Preseason';
    this.state.players.forEach(p => p.stats = null);
    this.logStory(`Offseason complete. Advanced calendar to ${this.state.currentYear}.`);
    this.renderTable();
    this.updateUI();
  },

  logStory(msg) {
    const feed = document.getElementById('newsFeed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'news-item';
    item.innerText = msg;
    feed.prepend(item); 
  },

  updateUI() {
    const yearDisplay = document.getElementById('currentYearDisplay');
    const phaseDisplay = document.getElementById('currentPhaseDisplay');
    if (yearDisplay) yearDisplay.innerText = this.state.currentYear;
    if (phaseDisplay) phaseDisplay.innerText = this.state.phase;
  },

  renderTable() {
    const tbody = document.getElementById('statsBody');
    if (!tbody) return;

    if (this.state.phase === 'Preseason') {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #7d8296; padding: 2rem;">Preseason Roster Locked. Click "Simulate Full Season" to generate NCAA stat translations.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.state.players.slice(0, 100).map((p, index) => {
      const s = p.stats;
      const bpmColor = parseFloat(s.bpm) > 4.0 ? '#4ade80' : parseFloat(s.bpm) > 0 ? '#38bdf8' : '#f87171';
      
      return `
        <tr>
          <td style="color:#7d8296;">#${index + 1}</td>
          <td style="font-weight:700; color:#fff;">${p.name}</td>
          <td style="color:#a1a5b8;">${p.pos}</td>
          <td><span style="color:#38bdf8; font-size: 0.85rem;">${p.classYear || 'FR'}</span></td>
          <td><span class="clickable-school" onclick="SimEngine.openTeamModal('${p.school}')">${p.school}</span></td>
          <td>${s.mpg}</td>
          <td style="font-weight:600;">${s.ppg}</td>
          <td style="font-weight:600;">${s.rpg}</td>
          <td style="font-weight:600;">${s.apg}</td>
          <td style="font-weight:800; color:${bpmColor}">${s.bpm}</td>
        </tr>
      `;
    }).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SimEngine.init();
});
