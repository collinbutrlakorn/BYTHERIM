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

            // Only bulk-insert if this is actually a non-empty array of player
            // records. data/players.json currently ships as a single schema
            // template object (not an array) — bulkAdd would throw on that,
            // so skip cleanly instead of logging a scary error every load.
            if (Array.isArray(data) && data.length > 0) {
                await db.players.bulkAdd(data);
                console.log("Initial player data successfully loaded into IndexedDB!");
            } else {
                console.log("data/players.json has no real player records yet — skipping local seed (this is fine, your Google Sheets data is the real source).");
            }
        } else {
            console.log("Database already populated, skipping initial JSON load.");
        }
    } catch (error) {
        console.error("Error loading JSON into IndexedDB:", error);
    }
}

// Automatically check and load initial data when db.js runs
loadInitialData();
