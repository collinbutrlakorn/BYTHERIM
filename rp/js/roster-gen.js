// ============================================================
// Procedural roster generation — no DOM. Testable in Node.
// Fills out the full 365-team D1 universe: real curated recruits/roster
// players (from the Google Sheets) are always used as-is, and whatever's
// missing — a few bench spots, or an entire roster for a team with no
// real data yet — gets generated so every team is playable.
// ============================================================

const FIRST_NAMES = [
  'Marcus','Jalen','Tyler','Xavier','Isaiah','Malik','Devin','Cameron','Andre','Jordan',
  'Elijah','Trevon','Kobe','Amari','DeShawn','Tremaine','Caleb','Nasir','Zion','Aiden',
  'Chris','Michael','Anthony','Brandon','Justin','Kevin','Ryan','Austin','Josh','Ethan',
  'Darius','Terrence','Malachi','Quentin','Reggie','Julian','Braylon','Dominic','Kaden','Miles',
  'Noah','Gavin','Landon','Carter','Wyatt','Hunter','Colton','Blake','Nathaniel','Omar',
  'Dante','Marcel','Jaylen','Keon','Rasheed','Tobias','Emmanuel','Sekou','Amir','Deshaun'
];

const LAST_NAMES = [
  'Johnson','Williams','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas',
  'Jackson','White','Harris','Martin','Thompson','Robinson','Clark','Lewis','Walker','Hall',
  'Young','King','Wright','Scott','Green','Baker','Adams','Nelson','Carter','Mitchell',
  'Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Sanchez',
  'Morris','Rogers','Reed','Cook','Bell','Murphy','Bailey','Rivera','Cooper','Richardson',
  'Cox','Howard','Ward','Torres','Peterson','Gray','Ramirez','James','Watson','Brooks',
  'Kelly','Sanders','Price','Bennett','Wood','Barnes','Ross','Henderson','Coleman','Jenkins'
];

const HOMETOWNS = [
  'Chicago, IL','Houston, TX','Atlanta, GA','Los Angeles, CA','Brooklyn, NY','Detroit, MI',
  'Memphis, TN','New Orleans, LA','Baltimore, MD','Philadelphia, PA','Cleveland, OH',
  'St. Louis, MO','Charlotte, NC','Columbus, OH','Indianapolis, IN','Milwaukee, WI',
  'Dallas, TX','Miami, FL','Oakland, CA','Kansas City, MO','Newark, NJ','Richmond, VA',
  'Birmingham, AL','Jackson, MS','Louisville, KY','Nashville, TN','Tulsa, OK','Wichita, KS',
  'Raleigh, NC','Norfolk, VA'
];

// Conference "tiers" for average team strength — a light-touch, real-world-
// informed grouping so blue-blood conferences skew stronger on average and
// low-major leagues skew weaker, without pretending to rank every program
// individually. Any conference not listed defaults to tier 3.
const CONFERENCE_TIERS = {
  'ACC': 1, 'Big Ten': 1, 'Big 12': 1, 'SEC': 1, 'Big East': 1,
  'American': 2, 'A-10': 2, 'Mountain West': 2, 'West Coast': 2, 'Missouri Valley': 2, 'Conference USA': 2, 'Pac-12': 2,
  'CAA': 3, 'Sun Belt': 3, 'Ivy League': 3, 'Horizon League': 3, 'MAC': 3, 'Big West': 3,
  'Southern': 3, 'Big Sky': 3, 'Ohio Valley': 3, 'ASUN': 3, 'Patriot League': 3,
  'MAAC': 4, 'NEC': 4, 'Big South': 4, 'Southland': 4, 'SWAC': 4, 'MEAC': 4, 'America East': 4, 'The Summit': 4, 'UAC': 4
};

// [min, max] team-overall-rating range sampled per tier. Individual player
// ratings then vary around the sampled team overall (see buildRosterForTeam).
const TIER_RANGES = {
  1: [76, 92],
  2: [71, 85],
  3: [66, 80],
  4: [62, 76]
};

function getConferenceTier(conference) {
  return CONFERENCE_TIERS[conference] || 3;
}

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

function generatePlayerName(usedNames, rng = Math.random) {
  let name, attempts = 0;
  do {
    name = `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}`;
    attempts++;
  } while (usedNames.has(name) && attempts < 20);
  usedNames.add(name);
  return name;
}

// Generates one filler player for a team, targeting the given position and
// a rating sampled around the team's baseline overall.
function generateFillerPlayer(school, conference, position, teamBaseline, rosterIndex, usedNames, rng = Math.random) {
  const classYears = ['FR', 'SO', 'JR', 'SR'];
  const variance = (rng() - 0.5) * 16; // player rating spread around team baseline
  const rating = Math.max(45, Math.min(94, Math.round(teamBaseline + variance - rosterIndex * 0.8)));
  return {
    id: `${school}_gen_${rosterIndex}_${Math.random().toString(36).slice(2, 7)}`,
    name: generatePlayerName(usedNames, rng),
    school, conference,
    school_logo: '',
    pos: position,
    class: classYears[Math.floor(rng() * classYears.length)],
    ht: "6'4",
    wt: "195",
    hometown: pick(HOMETOWNS, rng),
    rating,
    isRecruit: false,
    isGenerated: true,
    recClassYear: null,
    gameLog: [],
    accolades: [],
  };
}

// Ensures a roster has a viable position spread: at least 2 of each of
// PG/SG/SF/PF/C among the generated fill-ins (existing real players' actual
// positions are left untouched).
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

function nextNeededPosition(currentRoster, fillIndex) {
  const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  currentRoster.forEach(p => {
    const pos = POSITION_ORDER.includes(p.pos) ? p.pos : 'SF';
    counts[pos] = (counts[pos] || 0) + 1;
  });
  // Fill whichever position is furthest below a target of ~2-3 per spot
  const target = POSITION_ORDER.map(pos => ({ pos, deficit: 2 - (counts[pos] || 0) }));
  target.sort((a, b) => b.deficit - a.deficit);
  if (target[0].deficit > 0) return target[0].pos;
  return POSITION_ORDER[fillIndex % POSITION_ORDER.length];
}

// Core entry point: given the master {name, conference} team list and
// whatever real teams/players already exist (from the Google Sheets),
// returns a complete set of teams where every master-list school has a
// full roster — real players kept exactly as-is, gaps filled generated.
function buildFullUniverse(masterTeamList, existingTeams, opts = {}) {
  const targetRosterSize = opts.targetRosterSize || 13;
  const rng = opts.rng || Math.random;

  const existingByName = {};
  existingTeams.forEach(t => { existingByName[t.school] = t; });

  const finalTeams = masterTeamList.map(masterEntry => {
    const existing = existingByName[masterEntry.name];
    const tier = getConferenceTier(masterEntry.conference);
    const [lo, hi] = TIER_RANGES[tier];
    const teamBaseline = lo + rng() * (hi - lo);

    const roster = existing && existing.roster ? [...existing.roster] : [];
    const usedNames = new Set(roster.map(p => p.name));
    const startCount = roster.length;

    for (let i = startCount; i < targetRosterSize; i++) {
      const pos = nextNeededPosition(roster, i);
      roster.push(generateFillerPlayer(masterEntry.name, masterEntry.conference, pos, teamBaseline, i, usedNames, rng));
    }

    return {
      school: masterEntry.name,
      conference: masterEntry.conference,
      roster,
      generatedFillCount: roster.length - startCount,
      hadRealData: startCount > 0
    };
  });

  // Any real team from the sheets that ISN'T in the master list (e.g. a
  // typo, or a fictional school) still gets included as-is rather than
  // silently dropped — better to surface a mismatch than lose real data.
  const masterNames = new Set(masterTeamList.map(t => t.name));
  const unmatched = existingTeams.filter(t => !masterNames.has(t.school));

  return { teams: [...finalTeams, ...unmatched], unmatchedRealTeams: unmatched.map(t => t.school) };
}

const RosterGen = {
  FIRST_NAMES, LAST_NAMES, HOMETOWNS, CONFERENCE_TIERS, TIER_RANGES,
  getConferenceTier, generatePlayerName, generateFillerPlayer, nextNeededPosition, buildFullUniverse
};

if (typeof module !== 'undefined' && module.exports) module.exports = RosterGen;
else if (typeof window !== 'undefined') window.RosterGen = RosterGen;
