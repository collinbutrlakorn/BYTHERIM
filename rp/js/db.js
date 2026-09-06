// Initialize IndexedDB database for persistent saves
const db = new Dexie("ByTheRimUniverse");

// Version bumped to 2 to clear out any old/corrupted schema states from previous tests.
db.version(2).stores({
    leagueState: 'id, currentYear, currentPhase, currentWeek, simCompleted',
    teams: 'school, conference, apRank',
    players: 'id, name, school, class, pos, rating, isRecruit',
    recruits: 'id, name, pos, rating, school'
    fetch('./data/players.json')
  .then(response => response.json())
  .then(data => {
    console.log("Data loaded successfully:", data);
    // Initialize or feed data to engine.js / db.js
  })
  .catch(error => console.error("Error loading JSON:", error));

});
