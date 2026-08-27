// ==========================================
// 1. CONFIGURATION & MAPPING
// ==========================================
const RECRUIT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv';
const ROSTER_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=0&single=true&output=csv';

const COLUMN_MAP = {
  name: "name", pos: "pos", school: "committedSchool", rating: "rating",
  classYear: "classYear", hs_mpg: "hs_mpg", hs_ppg: "hs_ppg", hs_rpg: "hs_rpg",
  hs_apg: "hs_apg", hs_bpm: "hs_bpm", hs_usg: "hs_usg", hs_ts: "hs_ts"
};

// ==========================================
// 2. CORE SIMULATION ENGINE
// ==========================================
const SimEngine = {
  state: {
    currentYear: 2028,
    phase: 'Preseason',
    allRecruits: [], 
    allRosters: [],  
    activePlayers: [], // Master list combining rosters & recruits
    teamData: {}
  },

  init() {
    this.logStory("Engine initializing. Connecting to BYTHERIM databases...");
    // Load databases sequentially to ensure both are ready before merging
    this.loadRosterDatabase().then(() => {
      this.loadRecruitDatabase();
    });
  },

  async loadRecruitDatabase() {
    try {
      const response = await fetch(RECRUIT_CSV_URL);
      const csvText = await response.text();
      this.state.allRecruits = this.parseCSVData(csvText);
      this.filterActiveData();
      this.logStory(`Successfully loaded ${this.state.allRecruits.length} total prospects. Filtered for ${this.state.currentYear}.`);
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
      this.state.allRosters = this.parseRosterCSV(csvText);
      this.logStory("Live Team Rosters synched and filtered by year.");
    } catch (err) {
      console.error("Error fetching rosters:", err);
    }
  },

  filterActiveData() {
    const recruitTargetYear = this.state.currentYear.toString();
    const rosterTargetYear = (this.state.currentYear + 1).toString();

    const activeRecruits = this.state.allRecruits.filter(p => p.classYear === recruitTargetYear);
    const activeRosters = this.state.allRosters.filter(p => p.year === rosterTargetYear);

    // MERGE LOGIC
    const playerMap = new Map();

    // 1. Map all roster players
    activeRosters.forEach(rosterPlayer => {
      const key = rosterPlayer.name.toLowerCase();
      playerMap.set(key, {
        id: `roster_${key}`,
        name: rosterPlayer.name,
        pos: rosterPlayer.pos,
        school: rosterPlayer.team,
        classYear: rosterPlayer.class,
        rosterInfo: rosterPlayer, 
        // Baseline generation for roster players missing recruit histories
        rating: 75 + Math.floor(Math.random() * 10), 
        hs_stats: { 
          mpg: 24, ppg: 8 + Math.random() * 6, rpg: 3 + Math.random() * 4, 
          apg: 1 + Math.random() * 3, bpm: -1 + Math.random() * 5 
        },
        stats: null
      });
    });

    // 2. Map and merge recruits
    activeRecruits.forEach(recruit => {
      const key = recruit.name.toLowerCase();
      if (playerMap.has(key)) {
        // Merge true recruit data into the existing roster frame
        const p = playerMap.get(key);
        p.rating = recruit.rating;
        p.hs_stats = recruit.hs_stats;
        p.pos = p.pos || recruit.pos; 
      } else {
        // Recruit isn't on roster sheet, still gets added as active
        playerMap.set(key, {
          id: recruit.id,
          name: recruit.name,
          pos: recruit.pos,
          school: recruit.school,
          classYear: recruit.classYear,
          rating: recruit.rating,
          hs_stats: recruit.hs_stats,
          rosterInfo: null, 
          stats: null
        });
      }
    });

    this.state.activePlayers = Array.from(playerMap.values());
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
        classYear: col.classYear !== null && row[col.classYear] ? row[col.classYear] : '2028',
        rating: safeNum(col.rating, 80),
        hs_stats: {
          mpg: safeNum(col.mpg, 24), ppg: safeNum(col.ppg, 12), rpg: safeNum(col.rpg, 4),
          apg: safeNum(col.apg, 2), bpm: safeNum(col.bpm, 0)
        }
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
    
    const rng = () => 0.85 + (Math.random() * 0.30);
    const compPenalty = 0.82; 
    const scaleFactor = (projMpg / baseHsMpg) * compPenalty;

    let ppg = (hs.ppg * scaleFactor * rng()).toFixed(1);
    let rpg = (hs.rpg * scaleFactor * 0.9 * rng()).toFixed(1);
    let apg = (hs.apg * scaleFactor * 0.95 * rng()).toFixed(1);
    let projBpm = (((hs.bpm * 0.55) + ((player.rating - 85) * 0.25)) * rng()).toFixed(1);

    // Generate peripheral stats
    const isBig = player.pos && (player.pos.includes('C') || player.pos.includes('F'));
    let stl = (0.5 + (Math.random() * 1.2) * (isBig ? 0.6 : 1.2)).toFixed(1);
    let blk = (0.2 + (Math.random() * 1.5) * (isBig ? 1.5 : 0.3)).toFixed(1);
    let tov = (1.0 + (parseFloat(apg) * 0.3) + (Math.random() * 1.5)).toFixed(1);
    let pf = (1.5 + (Math.random() * 1.5) + (isBig ? 0.5 : 0)).toFixed(1);

    return { mpg: projMpg.toFixed(1), ppg, rpg, apg, stl, blk, tov, pf, bpm: projBpm };
  },

  simulateSeason() {
    if (this.state.phase !== 'Preseason') {
      alert("Season has already been simulated! Run the offseason loop to advance.");
      return;
    }
    if (this.state.activePlayers.length === 0) {
      alert("Database still loading, please wait.");
      return;
    }

    this.logStory(`Simulating ${this.state.currentYear}-${(this.state.currentYear + 1).toString().slice(-2)} Regular Season...`);
    
    this.state.activePlayers.forEach(player => {
      player.stats = this.calculatePlayerSeason(player);
    });
    
    this.state.activePlayers.sort((a, b) => parseFloat(b.stats.bpm) - parseFloat(a.stats.bpm));

    this.generateTeamStats();
    this.populateDashboard();

    this.state.phase = 'Postseason';
    this.logStory("Season Complete. Production calculated for Recruits and Roster personnel.");
    
    this.renderTable();
    this.updateUI();
  },

  generateTeamStats() {
    const uniqueTeams = [...new Set(this.state.activePlayers.map(p => p.school).filter(s => s && s !== 'Uncommitted'))];
    
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

  populateDashboard() {
    const getLeaders = (stat) => [...this.state.activePlayers].sort((a, b) => parseFloat(b.stats[stat]) - parseFloat(a.stats[stat])).slice(0, 5);
    const buildList = (players, stat) => players.map((p, i) => `
      <div class="leader-row">
        <span>${i+1}. ${p.name}</span>
        <span>${p.stats[stat]}</span>
      </div>
    `).join('');

    document.getElementById('dashPts').innerHTML = buildList(getLeaders('ppg'), 'ppg');
    document.getElementById('dashReb').innerHTML = buildList(getLeaders('rpg'), 'rpg');
    document.getElementById('dashAst').innerHTML = buildList(getLeaders('apg'), 'apg');
    document.getElementById('dashStl').innerHTML = buildList(getLeaders('stl'), 'stl');
    document.getElementById('dashBlk').innerHTML = buildList(getLeaders('blk'), 'blk');
  },

  openTeamModal(teamName) {
    if (!teamName || teamName === 'Uncommitted') return;
    
    const teamStats = this.state.teamData[teamName] || { 
      record: '0-0', confRecord: '0-0', rank: null, teamPpg: '0.0', oppPpg: '0.0' 
    };

    const logoFormatted = teamName.toLowerCase().replace(/\s+/g, '');
    document.getElementById('modalTeamLogo').src = `../schoollogos/${logoFormatted}.png`;
    document.getElementById('modalTeamName').innerText = teamName;
    document.getElementById('modalTeamYear').innerText = `${this.state.currentYear + 1} Roster`;
    
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

    const teamRoster = this.state.activePlayers.filter(p => p.school === teamName);
    const tbody = document.getElementById('modalRosterBody');
    
    tbody.innerHTML = teamRoster.map(p => {
      // Pull specific roster visuals if they exist, default if they are just a pure recruit
      const r = p.rosterInfo || { number: '-', ht: '-', wt: '-', from: 'Recruit', draft: '-' };
      const hasDraftData = r.draft && r.draft.trim() !== '' && r.draft !== '-';
      const draftDisplay = hasDraftData 
        ? `<span class="draft-projection" data-player="${p.name}">${r.draft}</span>` 
        : `<span style="color:#4b5063;">-</span>`;

      return `
        <tr>
          <td style="color:#7d8296;">${r.number || '-'}</td>
          <td style="font-weight:700; color:#fff;">${p.name}</td>
          <td style="color:#a1a5b8;">${p.pos || '-'}</td>
          <td>${p.classYear || r.class || '-'}</td>
          <td>${r.ht || '-'}</td>
          <td>${r.wt || '-'}</td>
          <td style="color:#a1a5b8; font-size:0.9rem;">${r.from || 'Recruit'}</td>
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
    
    this.filterActiveData();
    this.state.activePlayers.forEach(p => p.stats = null);
    
    this.logStory(`Offseason complete. Advanced calendar to ${this.state.currentYear}-${(this.state.currentYear + 1).toString().slice(-2)}.`);
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
    if (yearDisplay) {
        const nextYearStr = (this.state.currentYear + 1).toString().slice(-2);
        yearDisplay.innerText = `${this.state.currentYear}-${nextYearStr}`;
    }
    if (phaseDisplay) phaseDisplay.innerText = this.state.phase;
  },

  renderTable() {
    const tbody = document.getElementById('statsBody');
    if (!tbody) return;

    if (this.state.phase === 'Preseason') {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: #7d8296; padding: 2rem;">Preseason Roster Locked. Click "Simulate Full Season" to generate NCAA stat translations.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.state.activePlayers.slice(0, 100).map((p, index) => {
      const s = p.stats;
      const bpmColor = parseFloat(s.bpm) > 4.0 ? '#4ade80' : parseFloat(s.bpm) > 0 ? 'var(--brand-color)' : '#f87171';
      
      return `
        <tr>
          <td style="color:#7d8296;">#${index + 1}</td>
          <td style="font-weight:700; color:#fff;">${p.name}</td>
          <td style="color:#a1a5b8;">${p.pos || '-'}</td>
          <td><span style="color:var(--brand-color); font-size: 0.85rem;">${p.classYear || '-'}</span></td>
          <td><span class="clickable-school" onclick="SimEngine.openTeamModal('${p.school}')">${p.school}</span></td>
          <td>${s.mpg}</td>
          <td style="font-weight:600;">${s.ppg}</td>
          <td style="font-weight:600;">${s.rpg}</td>
          <td style="font-weight:600;">${s.apg}</td>
          <td style="font-weight:600;">${s.stl}</td>
          <td style="font-weight:600;">${s.blk}</td>
          <td style="font-weight:600;">${s.tov}</td>
          <td style="font-weight:600;">${s.pf}</td>
          <td style="font-weight:800; color:${bpmColor}">${s.bpm}</td>
        </tr>
      `;
    }).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SimEngine.init();
});
