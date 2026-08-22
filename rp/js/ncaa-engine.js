const SimEngine = {
  state: {
    currentYear: 2028,
    phase: 'Preseason', // Preseason, Regular Season, Postseason, Offseason
    players: [],
    history: []
  },

  // 1. Initialization
  init() {
    this.loadState();
    this.updateUI();
    // Later: Fetch logic for your recruit CSVs to populate 'this.state.players'
  },

  // 2. State Management (Local Storage for persistence)
  saveState() {
    localStorage.setItem('bytherim_ncaa_sim', JSON.stringify(this.state));
  },

  loadState() {
    const saved = localStorage.getItem('bytherim_ncaa_sim');
    if (saved) {
      this.state = JSON.parse(saved);
    } else {
      console.log("No save found. Starting fresh in 2028.");
    }
  },

  hardReset() {
    if(confirm("Are you sure? This wipes all simulation history.")) {
      localStorage.removeItem('bytherim_ncaa_sim');
      location.reload();
    }
  },

  // 3. Core Simulation Loop
  simulateSeason() {
    if (this.state.phase !== 'Preseason') {
      alert("Season already simulated! Run Offseason next.");
      return;
    }
    
    console.log(`Simulating the ${this.state.currentYear} season...`);
    // Math logic goes here: calculate PTS, REB, AST, BPM based on player ratings
    
    this.state.phase = 'Postseason';
    this.saveState();
    this.updateUI();
  },

  runOffseason() {
    if (this.state.phase !== 'Postseason') {
      alert("Must complete season first.");
      return;
    }

    console.log("Running Offseason (Draft declarations, Transfers, Recruiting...)");
    // Logic goes here: update player classes (FR -> SO), handle NBA draft entries
    
    this.state.currentYear += 1;
    this.state.phase = 'Preseason';
    this.saveState();
    this.updateUI();
  },

  // 4. Interface Updates
  updateUI() {
    document.getElementById('currentYearDisplay').innerText = this.state.currentYear;
    document.getElementById('currentPhaseDisplay').innerText = `Phase: ${this.state.phase}`;
    // Later: Table rendering logic
  }
};

// Boot up the engine when page loads
document.addEventListener('DOMContentLoaded', () => {
  SimEngine.init();
});
