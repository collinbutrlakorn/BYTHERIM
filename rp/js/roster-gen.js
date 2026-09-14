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
  'Dante','Marcel','Jaylen','Keon','Rasheed','Tobias','Emmanuel','Sekou','Amir','Deshaun',
  'Trey','Jamal','Donovan','Tristan','Bryce','Corey','Damian','Khalil','Rashad','Tyrese',
  'Jaden','Kyrie','Shai','Obi','Bol','Precious','Chet','Paolo','Jabari','Bennedict',
  'Ausar','Amen','Scoot','Brandin','Gradey','Dereck','Kris','Jett','Cason','Keyonte',
  'Anthony','Nick','Adem','Dariq','Bilal','Ousmane','Moussa','Ibrahima','Cheick','Mamadi',
  'Luka','Nikola','Goran','Dario','Vlatko','Andrej','Stefan','Milos','Aleksej','Filip',
  'Santiago','Mateo','Diego','Rafael','Emilio','Joaquin','Tomas','Andres','Bruno','Gabriel',
  'Liam','Declan','Rory','Finn','Callum','Cian','Eoin','Padraig','Seamus','Killian',
  'Hugo','Mathis','Theo','Baptiste','Clement','Antoine','Lucien','Adrien','Killian','Evan',
  'Jonas','Lukas','Maximilian','Niklas','Felix','Moritz','Julius','Leon','Til','Anton',
  'Takumi','Ren','Haruto','Yuto','Kaito','Sota','Riku','Hinata','Yuki','Asahi',
  'Ade','Chidi','Emeka','Kelechi','Obinna','Tunde','Kwame','Kofi','Yaw','Abdoulaye',
  'Jermaine','Rodney','Curtis','Vernon','Otis','Clarence','Eugene','Leroy','Percy','Alvin',
  'Zaire','Zaylen','Kyree','Jaxon','Braxton','Ashton','Camden','Easton','Weston','Beckham',
  'Isaias','Ezra','Silas','Abram','Josiah','Micah','Levi','Asher','Judah','Boaz'
];

const LAST_NAMES = [
  'Johnson','Williams','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas',
  'Jackson','White','Harris','Martin','Thompson','Robinson','Clark','Lewis','Walker','Hall',
  'Young','King','Wright','Scott','Green','Baker','Adams','Nelson','Carter','Mitchell',
  'Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Sanchez',
  'Morris','Rogers','Reed','Cook','Bell','Murphy','Bailey','Rivera','Cooper','Richardson',
  'Cox','Howard','Ward','Torres','Peterson','Gray','Ramirez','James','Watson','Brooks',
  'Kelly','Sanders','Price','Bennett','Wood','Barnes','Ross','Henderson','Coleman','Jenkins',
  'Perry','Powell','Long','Patterson','Hughes','Flores','Washington','Butler','Simmons','Foster',
  'Gonzales','Bryant','Alexander','Russell','Griffin','Diaz','Hayes','Myers','Ford','Hamilton',
  'Graham','Sullivan','Wallace','Woods','Cole','West','Jordan','Owens','Reynolds','Fisher',
  'Ellis','Harrison','Gibson','McDonald','Cruz','Marshall','Ortiz','Gomez','Murray','Freeman',
  'Wells','Webb','Simpson','Stevens','Tucker','Porter','Hunter','Hicks','Crawford','Henry',
  'Boyd','Mason','Morales','Kennedy','Warren','Dixon','Ramos','Reyes','Burns','Gordon',
  'Shaw','Holmes','Rice','Robertson','Hunt','Black','Daniels','Palmer','Mills','Nichols',
  'Grant','Knight','Ferguson','Rose','Stone','Hawkins','Dunn','Perkins','Hudson','Spencer',
  'Okafor','Adebayo','Achiuwa','Bamba','Diallo','Sissoko','Traore','Toure','Keita','Ndiaye',
  'Jokic','Doncic','Vucevic','Bogdanovic','Petrusev','Micic','Simonovic','Topic','Avramovic','Guduric',
  'Antetokounmpo','Papanikolaou','Sloukas','Dorsey','Calathes','Printezis','Mitoglou','Larentzakis','Agravanis','Kalaitzakis',
  'Schroder','Wagner','Bonga','Kleber','Hartenstein','Thiemann','Obst','Voigtmann','Giffey','Lo',
  'Nowell','Timme','Strawther','Holmgren','Braun','Suggs','Kispert','Ayayi','Nembhard','Watson',
  'Castellan','Moriarty','Okonkwo','Vasquez','Beaumont','Lindqvist','Haugen','Novak','Kaminski','Duarte'
];

const HOMETOWNS = [
  'Chicago, IL','Houston, TX','Atlanta, GA','Los Angeles, CA','Brooklyn, NY','Detroit, MI',
  'Memphis, TN','New Orleans, LA','Baltimore, MD','Philadelphia, PA','Cleveland, OH',
  'St. Louis, MO','Charlotte, NC','Columbus, OH','Indianapolis, IN','Milwaukee, WI',
  'Dallas, TX','Miami, FL','Oakland, CA','Kansas City, MO','Newark, NJ','Richmond, VA',
  'Birmingham, AL','Jackson, MS','Louisville, KY','Nashville, TN','Tulsa, OK','Wichita, KS',
  'Raleigh, NC','Norfolk, VA'
];

// Positional height and weight norms. Values are inches / pounds:
// `avg` is the typical player, `lo`/`hi` bound the normal range, and a
// small share of players fall outside it so the odd 6'10" point guard or
// undersized centre still shows up.
const POSITION_BUILD = {
  PG: { avgHt: 74, loHt: 70, hiHt: 76, avgWt: 180, loWt: 160, hiWt: 200 },
  SG: { avgHt: 76, loHt: 72, hiHt: 79, avgWt: 192, loWt: 160, hiWt: 220 },
  SF: { avgHt: 79, loHt: 76, hiHt: 81, avgWt: 210, loWt: 170, hiWt: 250 },
  PF: { avgHt: 80, loHt: 78, hiHt: 83, avgWt: 225, loWt: 190, hiWt: 250 },
  C:  { avgHt: 82, loHt: 80, hiHt: 86, avgWt: 240, loWt: 195, hiWt: 260 },
  // The roster sheet also uses 'W' (wing) and combo-big labels.
  W:  { avgHt: 78, loHt: 75, hiHt: 81, avgWt: 200, loWt: 170, hiWt: 230 },
  'F/C': { avgHt: 81, loHt: 79, hiHt: 85, avgWt: 235, loWt: 195, hiWt: 258 },
  'G/F': { avgHt: 78, loHt: 75, hiHt: 80, avgWt: 205, loWt: 175, hiWt: 235 }
};

// A generated (unranked) freshman shouldn't out-rate a real top-100
// recruit. Ranked prospects from the recruiting database routinely sit in
// the high 80s and 90s, so anonymous filler freshmen are held below this.
const GENERATED_FRESHMAN_CEILING = 79;

const OUTLIER_CHANCE = 0.04;   // how often a player breaks positional norms

// Roughly normal draw via the average of two uniforms, then clamped.
function bellDraw(avg, lo, hi, rng) {
  const spreadLo = avg - lo, spreadHi = hi - avg;
  const t = (rng() + rng()) / 2 - 0.5;           // -0.5..0.5, centre-weighted
  const v = avg + (t < 0 ? t * 2 * spreadLo : t * 2 * spreadHi);
  return Math.max(lo, Math.min(hi, v));
}

function generateBuild(pos, rng = Math.random) {
  const b = POSITION_BUILD[pos] || POSITION_BUILD.SF;
  let inches = bellDraw(b.avgHt, b.loHt, b.hiHt, rng);

  // Rare outliers push a couple of inches past the positional range.
  if (rng() < OUTLIER_CHANCE) inches += (rng() < 0.5 ? -1 : 1) * (1 + rng() * 2.5);
  inches = Math.max(68, Math.min(88, Math.round(inches)));

  // Weight tracks height within the position's range rather than being
  // drawn independently, so a 7-footer isn't randomly 195 lbs.
  const htSpan = Math.max(1, b.hiHt - b.loHt);
  const htPos = Math.max(0, Math.min(1, (inches - b.loHt) / htSpan));
  const wtCentre = b.loWt + (b.hiWt - b.loWt) * (0.3 + htPos * 0.55);
  let weight = Math.round(wtCentre + (rng() - 0.5) * 22);
  weight = Math.max(150, Math.min(300, weight));

  return {
    ht: `${Math.floor(inches / 12)}'${inches % 12}`,
    wt: String(weight),
    heightInches: inches
  };
}

// Jersey numbers, most-wanted first. College players overwhelmingly wear
// 0-5, 10-15, 20-25, 30-35, 40-45 and 50-55 (a legacy of old NCAA rules
// that barred digits above 5 so referees could signal them by hand).
const POPULAR_JERSEYS = [23, 1, 3, 0, 5, 11, 24, 2, 32, 4, 22, 33, 10, 21, 12, 15,
                         20, 25, 34, 30, 13, 14, 31, 35, 44, 42, 40, 41, 43, 45,
                         50, 55, 51, 52, 53, 54];
const RARE_JERSEYS = [6, 7, 8, 9, 16, 17, 18, 19, 26, 27, 28, 29, 36, 37, 38, 39,
                      46, 47, 48, 49, 56, 77, 88, 99];
const RARE_JERSEY_CHANCE = 0.07;

// Assigns a number, preferring popular ones and skipping anything already
// worn on the roster. Callers pass players highest-rated first so the best
// players get first pick of the marquee numbers.
function pickJersey(taken, rng = Math.random) {
  if (rng() < RARE_JERSEY_CHANCE) {
    const rare = RARE_JERSEYS.filter(n => !taken.has(n));
    if (rare.length) {
      const n = rare[Math.floor(rng() * rare.length)];
      taken.add(n);
      return String(n);
    }
  }
  for (const n of POPULAR_JERSEYS) {
    if (!taken.has(n)) { taken.add(n); return String(n); }
  }
  for (const n of RARE_JERSEYS) {
    if (!taken.has(n)) { taken.add(n); return String(n); }
  }
  for (let n = 0; n <= 99; n++) {
    if (!taken.has(n)) { taken.add(n); return String(n); }
  }
  return '';
}

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
  const cls = classYears[Math.floor(rng() * classYears.length)];
  const variance = (rng() - 0.5) * 16; // player rating spread around team baseline
  let rating = teamBaseline + variance - rosterIndex * 0.8;

  // Filler freshmen are the anonymous end of a recruiting class, so they
  // should sit below the genuinely ranked prospects in the real database.
  // A small share are "surprise" freshmen who buck that.
  if (cls === 'FR') {
    const surprise = rng() < 0.04;
    rating -= surprise ? 1 : (4 + rng() * 5);
    if (!surprise) rating = Math.min(rating, GENERATED_FRESHMAN_CEILING);
  }
  rating = Math.max(45, Math.min(94, Math.round(rating)));
  const build = generateBuild(position, rng);
  return {
    id: `${school}_gen_${rosterIndex}_${Math.random().toString(36).slice(2, 7)}`,
    name: generatePlayerName(usedNames, rng),
    school, conference,
    school_logo: '',
    pos: position,
    class: cls,
    ht: build.ht,
    wt: build.wt,
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

function nextNeededPosition(currentRoster, fillIndex, guardLean = 1) {
  const counts = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  currentRoster.forEach(p => {
    const pos = POSITION_ORDER.includes(p.pos) ? p.pos : 'SF';
    counts[pos] = (counts[pos] || 0) + 1;
  });

  // Coaches recruit to their system. A guard-driven staff carries more
  // perimeter bodies; a post-oriented staff carries more size. Targets
  // shift around the baseline of 2 per spot rather than replacing it, so
  // every roster still covers all five positions.
  const tilt = (guardLean - 1) * 2.2;
  const targets = {
    PG: 2 + tilt, SG: 2 + tilt, SF: 2,
    PF: 2 - tilt, C: 2 - tilt
  };

  const ranked = POSITION_ORDER.map(pos => ({ pos, deficit: targets[pos] - (counts[pos] || 0) }));
  ranked.sort((a, b) => b.deficit - a.deficit);
  if (ranked[0].deficit > 0) return ranked[0].pos;
  return POSITION_ORDER[fillIndex % POSITION_ORDER.length];
}

// Core entry point: given the master {name, conference} team list and
// whatever real teams/players already exist (from the Google Sheets),
// returns a complete set of teams where every master-list school has a
// full roster — real players kept exactly as-is, gaps filled generated.
function normalizeSchoolKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Builds a lookup from every known spelling of a school (canonical name
// plus aliases) to its canonical master name, so a roster sheet that says
// "Texas Christian" resolves to the same team as one that says "TCU"
// instead of creating a duplicate program.
function buildSchoolAliasIndex(masterTeamList) {
  const index = {};
  masterTeamList.forEach(entry => {
    index[normalizeSchoolKey(entry.name)] = entry.name;
    (entry.aliases || []).forEach(a => {
      const k = normalizeSchoolKey(a);
      if (!index[k]) index[k] = entry.name;
    });
  });
  return index;
}

function buildFullUniverse(masterTeamList, existingTeams, opts = {}) {
  const targetRosterSize = opts.targetRosterSize || 13;
  const rng = opts.rng || Math.random;

  const aliasIndex = buildSchoolAliasIndex(masterTeamList);

  // Group incoming real teams by their CANONICAL name, merging any that
  // arrived under different spellings of the same school.
  const existingByName = {};
  existingTeams.forEach(t => {
    const canonical = aliasIndex[normalizeSchoolKey(t.school)] || t.school;
    if (!existingByName[canonical]) {
      existingByName[canonical] = { ...t, school: canonical, roster: [...(t.roster || [])] };
    } else {
      existingByName[canonical].roster.push(...(t.roster || []));
    }
  });

  const finalTeams = masterTeamList.map(masterEntry => {
    const existing = existingByName[masterEntry.name];
    const tier = getConferenceTier(masterEntry.conference);
    const [lo, hi] = TIER_RANGES[tier];
    const teamBaseline = lo + rng() * (hi - lo);

    const roster = existing && existing.roster ? [...existing.roster] : [];
    const usedNames = new Set(roster.map(p => p.name));
    const startCount = roster.length;

    // Coach influence on roster construction, supplied by the caller.
    const coachProfile = (opts.coachProfileFor && opts.coachProfileFor(masterEntry.name)) || null;
    const guardLean = coachProfile ? (coachProfile.guardLean || 1) : 1;

    for (let i = startCount; i < targetRosterSize; i++) {
      const pos = nextNeededPosition(roster, i, guardLean);
      roster.push(generateFillerPlayer(masterEntry.name, masterEntry.conference, pos, teamBaseline, i, usedNames, rng));
    }

    // Jersey numbers, assigned per team so nobody duplicates a real
    // player's number. Best players pick first, so the marquee numbers go
    // to the guys most likely to be featured.
    const takenJerseys = new Set();
    roster.forEach(p => {
      const n = parseInt(p.jersey, 10);
      if (!isNaN(n)) takenJerseys.add(n);
    });
    roster
      .filter(p => !p.jersey)
      .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
      .forEach(p => { p.jersey = pickJersey(takenJerseys, rng); });

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
  const unmatched = Object.values(existingByName).filter(t => !masterNames.has(t.school));

  return { teams: [...finalTeams, ...unmatched], unmatchedRealTeams: unmatched.map(t => t.school) };
}

const RosterGen = {
  FIRST_NAMES, LAST_NAMES, HOMETOWNS, CONFERENCE_TIERS, TIER_RANGES,
  getConferenceTier, normalizeSchoolKey, buildSchoolAliasIndex,
  POSITION_BUILD, generateBuild, pickJersey, POPULAR_JERSEYS, RARE_JERSEYS, generatePlayerName, generateFillerPlayer, nextNeededPosition, buildFullUniverse
};

if (typeof module !== 'undefined' && module.exports) module.exports = RosterGen;
else if (typeof window !== 'undefined') window.RosterGen = RosterGen;
