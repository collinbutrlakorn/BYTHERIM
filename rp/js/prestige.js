// Program prestige.
//
// Every school has a HISTORY score (0-100): how good the program has been
// over the long run. The blue bloods sit at the top, then the programs a
// step below them, then the rest of the high majors, the best mid-majors,
// and a default for everyone else by conference. The tiers follow long-run
// results (the kind evanmiya.com's historical team ratings show) rather
// than any one season.
//
// PRESTIGE is what a program is right now: its history, moved by how the
// last few seasons went and by the reputation of the coach in charge. A
// winning coach at a mid-major lifts the program while he's there; a blue
// blood with a losing coach slips, but never far.
//
// Prestige sets the level a program recruits and signs at, which is what
// changes the kind of players a school rosters.
(function (root) {
  const TIERS = [
    [100, ['Duke', 'Kansas', 'Kentucky', 'North Carolina', 'UCLA']],
    [92, ['Indiana', 'Connecticut', 'Louisville', 'Michigan State', 'Villanova']],
    [86, ['Arizona', 'Gonzaga', 'Syracuse', 'Florida', 'Houston', 'Ohio State']],
    [80, ['Purdue', 'Baylor', 'Tennessee', 'Texas', 'Wisconsin', 'Michigan', 'Maryland', 'Memphis', 'Arkansas',
      'Georgetown', 'Illinois', 'Cincinnati', 'Marquette', 'Virginia', 'Alabama', 'Auburn', 'Iowa State', 'Texas Tech',
      'Creighton', 'Oregon', 'Xavier', 'Kansas State', "St. John's", 'Oklahoma State', 'San Diego State']],
    [74, ['Butler', 'Oklahoma', 'Missouri', 'LSU', 'Wake Forest', 'Georgia Tech', 'NC State', 'Notre Dame', 'Providence',
      'Seton Hall', 'West Virginia', 'Iowa', 'Miami', 'Florida State', 'USC', 'Stanford', 'Clemson', 'Pitt',
      'Mississippi State', 'Texas A&M', 'BYU', "Saint Mary's", 'Utah', 'Minnesota', 'Colorado']],
    [68, ['Dayton', 'VCU', 'Wichita State', 'UNLV', 'Temple', 'Utah State', 'Nevada', 'New Mexico', 'Davidson',
      'Saint Louis', 'Florida Atlantic', 'Loyola Chicago', 'Boise State']],
    [60, ['Drake', 'Murray State', 'Belmont', 'Richmond', 'Colorado State', 'New Mexico State', 'UAB', 'Western Kentucky',
      'Tulsa', 'Charlotte', 'Rhode Island', 'George Mason', 'Northern Iowa', 'Missouri State', 'Bradley', 'Fresno State',
      'Oregon State', 'Washington State', 'Santa Clara', 'San Francisco', 'Liberty', 'Vermont', 'UC Irvine', 'Princeton',
      'Akron', 'Kent State', 'Toledo', 'Chattanooga', 'Furman', 'Wofford', 'Winthrop', 'Oral Roberts',
      'South Dakota State', 'Stephen F. Austin', 'Grand Canyon', 'Charleston', 'Hofstra', 'Iona',
      "Saint Peter's", 'Old Dominion', 'Louisiana Tech', 'Marshall', 'James Madison', 'Middle Tennessee', 'Indiana State',
      'Samford', 'McNeese State', 'Colgate', 'Yale', 'Southern Illinois', 'Illinois State']]
  ];
  const HISTORY = {};
  TIERS.forEach(([score, names]) => names.forEach(n => { HISTORY[n] = score; }));

  // Everyone not named, by conference tier (1 = the high majors).
  const CONFERENCE_DEFAULT = { 1: 64, 2: 52, 3: 42, 4: 32 };

  function confTier(conference) {
    if (root.RosterGen && root.RosterGen.getConferenceTier) return root.RosterGen.getConferenceTier(conference);
    return 3;
  }

  function historyScore(school, conference) {
    if (HISTORY[school] != null) return HISTORY[school];
    return CONFERENCE_DEFAULT[confTier(conference)] || 42;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // One season as a single grade (0-100): winning, getting in, and
  // winning once there.
  function seasonGrade(h) {
    const gp = (h.wins || 0) + (h.losses || 0);
    const wp = gp ? h.wins / gp : 0;
    const inField = !!h.ncaaSeed;
    return clamp(wp * 70 + (inField ? 10 : 0) + (h.ncaaWins || 0) * 4 + (h.wonNationalTitle ? 8 : 0), 0, 100);
  }
  // What a program of this history usually grades out at.
  const expectedGrade = hist => 20 + hist * 0.5;

  // How far the last four seasons ran above (or below) the program's
  // normal, most recent first. Null with no seasons on record.
  function recentDelta(team, hist) {
    const h = (team.history || []).slice(-4).reverse();
    if (!h.length) return null;
    const w = [0.4, 0.3, 0.2, 0.1];
    let sum = 0;
    // Weights are not re-normalised: with one season on record it counts
    // for 40%, so a single bad year doesn't sink a program.
    h.forEach((s, i) => { sum += (seasonGrade(s) - expectedGrade(hist)) * w[i]; });
    return sum;
  }

  // Prestige right now. History is the anchor; recent seasons and the
  // coach's reputation move it up to 30 points either way.
  function compute(team) {
    const hist = historyScore(team.school, team.conference);
    const rd = recentDelta(team, hist);
    const rep = team.coach && team.coach.rep != null ? team.coach.rep : hist;
    const shift = clamp((rd == null ? 0 : rd * 0.45) + (rep - hist) * 0.3, -30, 30);
    return { history: hist, prestige: Math.round(clamp(hist + shift, 5, 100)) };
  }

  // The rating level a program signs at, from its prestige. Tuned so the
  // league's average talent matches the old conference-tier ranges.
  const LEVEL_POINTS = [[0, 61.5], [32, 68.5], [42, 72.5], [52, 77], [64, 81.5], [74, 83.5], [86, 85.5], [100, 87.5]];
  function programLevel(prestige) {
    const p = clamp(prestige == null ? 42 : prestige, 0, 100);
    for (let i = 1; i < LEVEL_POINTS.length; i++) {
      const [x1, y1] = LEVEL_POINTS[i - 1], [x2, y2] = LEVEL_POINTS[i];
      if (p <= x2) return y1 + (y2 - y1) * (p - x1) / (x2 - x1);
    }
    return LEVEL_POINTS[LEVEL_POINTS.length - 1][1];
  }

  // "Blue blood" is history, not a hot streak: the five programs at the
  // top of the history table keep the name while they're still elite.
  function label(prestige, history) {
    if (history >= 100 && prestige >= 84) return 'Blue blood';
    if (prestige >= 86) return 'Elite';
    if (prestige >= 74) return 'Power program';
    if (prestige >= 62) return 'High major';
    if (prestige >= 50) return 'Upper mid-major';
    if (prestige >= 38) return 'Mid-major';
    return 'Low major';
  }

  // A season for the coach's reputation: the program's prestige, plus how
  // far the team beat (or missed) what its talent said it would do, plus
  // March. Reputation drifts toward this a season at a time.
  function coachSeasonValue(team, season, expectedWinPct) {
    const gp = (season.wins || 0) + (season.losses || 0);
    const wp = gp ? season.wins / gp : 0.5;
    const expected = expectedWinPct != null ? expectedWinPct : (team.expectedWinPct != null ? team.expectedWinPct : 0.5);
    const pres = team.prestige != null ? team.prestige : historyScore(team.school, team.conference);
    let v = pres + (wp - expected) * 100 + (season.ncaaWins || 0) * 5 + (season.ncaaSeed ? 4 : 0) + (season.wonNationalTitle ? 6 : 0);
    if (pres >= 80 && !season.ncaaSeed) v -= 8;       // big programs are expected to be in the field
    return clamp(v, 5, 100);
  }

  const api = { HISTORY, TIERS, CONFERENCE_DEFAULT, historyScore, seasonGrade, expectedGrade, recentDelta, compute, programLevel, label, coachSeasonValue };
  root.Prestige = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
