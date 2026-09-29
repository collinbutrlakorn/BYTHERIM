// Initialize IndexedDB database for persistent saves.
// Dexie comes from a CDN. If it's blocked or down, `db` is an empty object
// rather than an exception: every caller checks `db.leagueState` before
// using it, and the Draft RP can still show the published universe.
const db = typeof Dexie !== 'undefined' ? new Dexie("ByTheRimUniverse") : {};

// Version 2 schema setup
if (db.version) db.version(2).stores({
    leagueState: 'id, currentYear, currentPhase, currentWeek, simCompleted',
    teams: 'school, conference, apRank',
    players: 'id, name, school, class, pos, rating, isRecruit',
    recruits: 'id, name, pos, rating, school'
});
