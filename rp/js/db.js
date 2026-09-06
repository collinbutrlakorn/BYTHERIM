// Initialize IndexedDB database for persistent saves
const db = new Dexie("ByTheRimUniverse");

// Version 2 schema setup
db.version(2).stores({
    leagueState: 'id, currentYear, currentPhase, currentWeek, simCompleted',
    teams: 'school, conference, apRank',
    players: 'id, name, school, class, pos, rating, isRecruit',
    recruits: 'id, name, pos, rating, school'
});

// Function to populate Dexie with initial data from your JSON file
async function loadInitialData() {
    try {
        // Check if players are already loaded into Dexie to avoid duplicate imports
        const count = await db.players.count();
        if (count === 0) {
            const response = await fetch('./data/players.json');
            const data = await response.json();
            
            // Bulk insert player objects into the Dexie 'players' table
            await db.players.bulkAdd(data);
            console.log("Initial player data successfully loaded into IndexedDB!");
        } else {
            console.log("Database already populated, skipping initial JSON load.");
        }
    } catch (error) {
        console.error("Error loading JSON into IndexedDB:", error);
    }
}

// Automatically check and load initial data when db.js runs
loadInitialData();
