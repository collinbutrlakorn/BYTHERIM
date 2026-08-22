const SimEngine = {
  state: {
    currentYear: 2028,
    phase: 'Preseason',
    players: [],
    history: []
  },

  // 1. Fetch & Parse Recruit CSV Data
  async loadRecruitDatabase() {
    try {
      // Points directly to your recruiting data source
      const response = await fetch('../recruiting/data.csv');
      const csvText = await response.text();
      this.state.players = this.parseCSV(csvText);
      console.log(`Loaded ${this.state.players.length} recruits into engine.`);
      this.renderTable();
    } catch (err) {
      console.error("Error loading recruit database CSV:", err);
    }
  },

  parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map((line, idx) => {
      const data = line.split(',').map(cell => cell.trim());
      
      // Pull raw ratings with fallback defaults
      return {
        id: `rec_${idx}`,
        name: data[0] || "Unknown Prospect",
        pos: data[1] || "G",
        school: data[2] || "Uncommitted",
        ovr: parseInt(data[3]) || 70,
        pot: parseInt(data[4]) || 75,
        inside: parseInt(data[5]) || 65,
        outside: parseInt(data[6]) || 65,
        playmaking: parseInt(data[7]) || 60,
        defense: parseInt(data[8]) || 60,
        rebounding: parseInt(data[9]) || 55,
        year: 'FR',
        stats: null
      };
    });
  },

  // 2. Math Formula Core (Ratings -> Per Game Box Score)
  calculatePlayerSeason(player) {
    // Minutes scaled by overall rating & archetype hierarchy
    const mpg = Math.min(36, Math.max(12, (player.ovr - 50) * 0.8));
    const minuteFactor = mpg / 40;

    // Usage & Efficiency Formulas
    const usgRate = 0.15 + (player.ovr / 300) + (player.inside + player.outside) / 800;
    const tsPct = 0.45 + (player.outside * 0.0018) + (player.inside * 0.0012);

    // Box Score Calculations
    const ppg = (usgRate * 45 * tsPct * minuteFactor).toFixed(1);
    const rpg = ((player.rebounding / 10) * minuteFactor * (player.pos === 'C' || player.pos === 'PF' ? 1.4 : 0.7)).toFixed(1);
    const apg = ((player.playmaking / 12) * minuteFactor * (player.pos === 'PG' ? 1.6 : 0.8)).toFixed(1);
    const spg = ((player.defense / 55) * minuteFactor).toFixed(1);
    const bpg = ((player.defense / 60) * minuteFactor * (player.pos === 'C' ? 1.8 : 0.3)).toFixed(1);

    // Box Plus-Minus (BPM) composite formula
    const bpm = (((player.ovr - 72) * 0.35) + (ppg * 0.2) + (apg * 0.3) + (rpg * 0.25) - 3.5).toFixed(1);

    return { mpg: mpg.toFixed(1), ppg, rpg, apg, spg, bpg, bpm };
  },

  // 3. Execution Loop
  simulateSeason() {
    if (!this.state.players.length) {
      alert("No players loaded! Loading database first...");
      this.loadRecruitDatabase();
      return;
    }

    this.state.players.forEach(player => {
      player.stats = this.calculatePlayerSeason(player);
    });

    // Sort leaderboard by top BPM performers
    this.state.players.sort((a, b) => parseFloat(b.stats.bpm) - parseFloat(a.stats.bpm));

    this.state.phase = 'Postseason';
    this.renderTable();
  },

  // 4. Dynamic Dashboard Table Render
  renderTable() {
    const tbody = document.getElementById('statsBody');
    if (!tbody) return;

    tbody.innerHTML = this.state.players.slice(0, 50).map(p => {
      const s = p.stats || { ppg: '-', rpg: '-', apg: '-', bpm: '-' };
      return `
        <tr>
          <td style="font-weight:700; color:#fff;">${p.name}</td>
          <td><span style="color:#38bdf8;">${p.year}</span></td>
          <td>${p.school}</td>
          <td>${s.ppg}</td>
          <td>${s.rpg}</td>
          <td>${s.apg}</td>
          <td style="font-weight:800; color:${parseFloat(s.bpm) > 0 ? '#4ade80' : '#f87171'}">${s.bpm}</td>
        </tr>
      `;
    }).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SimEngine.loadRecruitDatabase();
});
