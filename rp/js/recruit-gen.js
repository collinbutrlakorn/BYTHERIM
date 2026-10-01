// ============================================================
// Generated recruits.
//
// Every recruiting class is filled out to a top 250. The recruiting sheet
// comes first: its players keep their order, their profiles and their
// commitments. Generated prospects fill in around them, ranked by talent,
// so a strong generated player can land in the top 25 and the back of the
// class is his alone.
//
// Each class has a fixed pool of 250 generated prospects, built from the
// class year alone. Adding a player to the sheet moves generated players
// down (and the last ones off the list); it never renames or replaces
// them. The Recruiting page, the NCAA RP and the Draft RP all build the
// same pool, so everyone sees the same players.
//
// Generated rows look exactly like sheet rows (same columns), so every
// page reads them without knowing the difference. Each carries
// generated = "TRUE" for the admin pages.
// ============================================================
(function (root) {
  const SLOTS = 250, POOL = 250;
  // Changing the generation resets every generated player (new names,
  // new pools); the sheet is untouched.
  const GEN = 'g2';
  // A class can also be reset on its own from the recruiting admin: each
  // reset is counted per class (official/recruit_gen in Firestore), and
  // the count goes into that class's seed.
  let RESETS = {};
  function setResets(map) {
    RESETS = {};
    Object.entries(map || {}).forEach(([y, n]) => { if (/^\d{4}$/.test(y) && Number(n) > 0) RESETS[y] = Math.floor(Number(n)); });
  }
  const getResets = () => ({ ...RESETS });
  const genOf = year => (RESETS[String(year)] ? `${GEN}.${RESETS[String(year)]}` : GEN);

  function hash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngFor(key) {
    let a = hash(key) || 1;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = rng => (rng() + rng() + rng() - 1.5) / 0.5;
  // No generated player is rated above 95: anything higher is the sheet's
  // to hand out.
  const GEN_MAX = 95;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];
  const r1 = v => Math.round(v * 10) / 10;
  const pct = v => `${r1(v).toFixed(1)}%`;

  const US = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM ' +
    'NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' '));

  // Recruiting-scale rating by final rank: where a normal class sits, with
  // its #1 at `top`. How good a class's best player is sets the whole top
  // of the class; the back of the top 250 looks the same every year.
  function curveFor(top) {
    const pts = [[1, top], [5, top - 2.6], [25, 89.5 + (top - 97) * 0.45], [50, 86.5 + (top - 97) * 0.25], [100, 83 + (top - 97) * 0.1], [250, 76.5]];
    return rank => {
      const x = Math.log(Math.max(1, rank));
      for (let i = 1; i < pts.length; i++) {
        const [r0, v0] = pts[i - 1], [r1_, v1] = pts[i];
        if (rank <= r1_) return v0 + (v1 - v0) * (x - Math.log(r0)) / (Math.log(r1_) - Math.log(r0));
      }
      return pts[pts.length - 1][1] - (rank - 250) * 0.03;
    };
  }
  const curve = curveFor(97);

  // A class's #1: what the ranking committee projects the best player in
  // the class to be. Most classes top out at 96 or 97; a 99 comes along
  // once in a long while.
  //   99 generational · 98 can't-miss · 97 All-NBA · 96 All-Star · 95 potential All-Star · 94 strong starter
  function classTop(year) {
    const x = rngFor(`${genOf(year)}|class-top|${year}`)();
    return x < 0.04 ? 99 : x < 0.17 ? 98 : x < 0.45 ? 97 : x < 0.75 ? 96 : x < 0.93 ? 95 : 94;
  }
  const PROJECTIONS = [
    [99, 'Generational talent'], [98, "Can't-miss talent"], [97, 'Projects as an All-NBA player'], [96, 'All-Star projection'],
    [95, 'Potential All-Star'], [94, 'Projects as a strong NBA starter'], [92, 'NBA rotation projection'], [90, 'NBA prospect'],
    [86, 'High-major starter'], [80, 'High-major contributor'], [75, 'Mid-major starter'], [70, 'Low-major contributor']
  ];
  function projectionFor(rating) {
    const r = Math.round(Number(rating));
    if (!r) return '';
    const hit = PROJECTIONS.find(([min]) => r >= min);
    return hit ? hit[1] : '';
  }

  // Stars come from the rating, never from chance: 90+ is a 5-star, 80+ a
  // 4-star, 70+ a 3-star. Below 70 a player is unranked.
  const starsFor = rating => { const r = Math.round(Number(rating)); return r >= 90 ? 5 : r >= 80 ? 4 : r >= 70 ? 3 : 0; };

  // Where he plays his senior year. The best prospects are at national
  // prep schools and academies; public high schools only become common
  // further down the list.
  const ACADEMIES = ['IMG Academy', 'Montverde Academy', 'Oak Hill Academy', 'Sierra Canyon', 'Prolific Prep', 'La Lumiere',
    'Link Academy', 'Brewster Academy', 'Sunrise Christian Academy', 'AZ Compass Prep', 'Wasatch Academy', 'Dream City Christian',
    'Southern California Academy', 'Perkiomen School', 'The Patrick School', 'Paul VI', 'DeMatha Catholic', 'Bishop Gorman',
    'Huntington Prep', 'Combine Academy', 'Hillcrest Prep', 'Putnam Science Academy', 'Notre Dame Prep', 'Wasatch Academy',
    'Legacy Early College', 'Grace Christian', 'Arizona Compass Prep', 'Overtime Elite', 'Word of God Christian', 'Napa Christian',
    'Bella Vista Prep', "St. Benedict's Prep", 'Gonzaga College HS', 'Findlay Prep', 'Brookwood Prep', 'Greensboro Day'];
  function schoolFor(rng, slot, publicHs) {
    const prep = slot <= 5 ? 0.95 : slot <= 25 ? 0.85 : slot <= 100 ? 0.68 : slot <= 175 ? 0.42 : 0.28;
    return rng() < prep ? pick(ACADEMIES, rng) : publicHs;
  }

  // ---------- international prospects ----------
  const COUNTRY = {
    Canada: 'CAN', Nigeria: 'NGR', Australia: 'AUS', Serbia: 'SRB', France: 'FRA', Germany: 'GER', Senegal: 'SEN', Lithuania: 'LTU',
    Spain: 'ESP', Cameroon: 'CMR', Croatia: 'CRO', Mali: 'MLI', 'South Sudan': 'SSD', 'Dominican Republic': 'DOM', 'Puerto Rico': 'PUR',
    Slovenia: 'SLO', Latvia: 'LAT', Italy: 'ITA', Greece: 'GRE', Turkey: 'TUR', Finland: 'FIN', Sweden: 'SWE', England: 'GBR',
    Brazil: 'BRA', Netherlands: 'NED', Belgium: 'BEL', Argentina: 'ARG', Israel: 'ISR', 'DR Congo': 'COD'
  };
  const PROVINCE = /,\s*(ON|QC|BC|AB|MB|NS|SK)$/;
  function countryOf(hometown) {
    if (PROVINCE.test(hometown)) return 'Canada';
    if (/, AUS$/.test(hometown)) return 'Australia';
    const m = hometown.match(/,\s*([^,]+)$/);
    return m ? m[1].trim() : '';
  }
  // Pro clubs and youth programmes an overseas prospect plays for.
  const CLUBS = {
    Serbia: ['Partizan', 'Crvena Zvezda', 'Mega Basket'], Croatia: ['Cibona', 'Split'], Slovenia: ['Cedevita Olimpija', 'Krka'],
    Spain: ['Real Madrid', 'FC Barcelona', 'Joventut Badalona', 'Valencia Basket'], France: ['ASVEL', 'Paris Basketball', 'AS Monaco', 'Cholet Basket'],
    Germany: ['Bayern Munich', 'Alba Berlin', 'ratiopharm Ulm'], Lithuania: ['Zalgiris Kaunas', 'Rytas Vilnius'], Latvia: ['VEF Riga'],
    Turkey: ['Fenerbahce', 'Anadolu Efes'], Greece: ['Olympiacos', 'Panathinaikos'], Italy: ['Olimpia Milano', 'Virtus Bologna'],
    Australia: ['NBL Next Stars'], Finland: ['Helsinki Seagulls'], Sweden: ['Sodertalje Kings'], Israel: ['Maccabi Tel Aviv', 'Hapoel Jerusalem'],
    Argentina: ['San Lorenzo'], Brazil: ['Flamengo', 'Franca'], Belgium: ['Filou Oostende'], Netherlands: ['ZZ Leiden'], England: ['London Lions'],
    Canada: ['Overtime Elite'], Nigeria: ['NBA Academy Africa'], Senegal: ['NBA Academy Africa'], Mali: ['NBA Academy Africa'],
    Cameroon: ['NBA Academy Africa'], 'South Sudan': ['NBA Academy Africa'], 'DR Congo': ['NBA Academy Africa'],
    'Dominican Republic': ['Overtime Elite'], 'Puerto Rico': ['Overtime Elite']
  };
  const YOUTH = { France: 'INSEP', Spain: 'Real Madrid Youth', Serbia: 'Mega Basket Youth', Australia: 'NBA Global Academy', Germany: 'Bayern Munich Youth',
    Lithuania: 'Zalgiris Academy', Turkey: 'Fenerbahce Youth', Italy: 'Stella Azzurra', Greece: 'Panathinaikos Youth', Israel: 'Maccabi Youth' };
  const clubFor = (country, rng) => pick(CLUBS[country] || ['Overtime Elite', 'Real Madrid', 'ASVEL'], rng);
  function internationalWho(rng, taken) {
    for (let tries = 0; tries < 12; tries++) {
      const w = root.RosterGen && root.RosterGen.internationalIdentity ? root.RosterGen.internationalIdentity(rng) : null;
      if (w && !taken.has(w.name.toLowerCase())) { taken.add(w.name.toLowerCase()); return w; }
    }
    return null;
  }

  const POSITIONS = [['PG', 0.17], ['CG', 0.10], ['SG', 0.17], ['SF', 0.22], ['PF', 0.19], ['C', 0.15]];
  function pickPos(rng) {
    let x = rng();
    for (const [p, w] of POSITIONS) { x -= w; if (x <= 0) return p; }
    return 'SF';
  }

  // ---------- the AAU circuits ----------
  // Every prospect plays his spring and summer ball for a program on one of
  // three shoe-company circuits, near home. The summer circuit (see
  // rp/js/summer-core.js) is played between these programs.
  const CIRCUITS = [
    { key: 'EYBL', name: 'Nike EYBL', event: 'Peach Jam' },
    { key: '3SSB', name: 'Adidas 3SSB', event: '3SSB Championship' },
    { key: 'UAA', name: 'Under Armour Association', event: 'UAA Finals' }
  ];
  const REGIONS = {
    NE: 'ME NH VT MA RI CT NY NJ PA', MA: 'DE MD DC VA WV NC', SE: 'SC GA FL AL TN KY MS',
    MW: 'OH MI IN IL WI MN IA MO', SW: 'TX LA AR OK KS NE', W: 'CA NV AZ UT CO NM OR WA ID MT WY AK HI ND SD'
  };
  const regionOf = st => Object.keys(REGIONS).find(k => REGIONS[k].split(' ').includes(String(st || '').toUpperCase())) || 'SE';
  const AAU_PROGRAMS = [
    ['Team Takeover', 'EYBL', 'MA'], ['Expressions Elite', 'EYBL', 'NE'], ['Nightrydas Elite', 'EYBL', 'SE'], ['MoKan Elite', 'EYBL', 'MW'],
    ['Team Thad', 'EYBL', 'SE'], ['Oakland Soldiers', 'EYBL', 'W'], ['Houston Hoops', 'EYBL', 'SW'], ['Indy Heat', 'EYBL', 'MW'],
    ['Garden State Warriors', 'EYBL', 'NE'], ['Philly Pride', 'EYBL', 'NE'], ['Motor City Rise', 'EYBL', 'MW'], ['SoCal Legacy', 'EYBL', 'W'],
    ['Lone Star Legends', 'EYBL', 'SW'], ['Peach State Fire', 'EYBL', 'SE'], ['Keystone Stars', 'EYBL', 'NE'], ['Emerald City Legends', 'EYBL', 'W'],
    ['Team Loaded', '3SSB', 'MA'], ['Florida Rebels', '3SSB', 'SE'], ['Wildcats Select', '3SSB', 'MW'], ['Atlanta Xpress', '3SSB', 'SE'],
    ['Empire State Kings', '3SSB', 'NE'], ['Chi-Town Select', '3SSB', 'MW'], ['Buckeye Express', '3SSB', 'MW'], ['Queen City Stars', '3SSB', 'MA'],
    ['Bayou Elite', '3SSB', 'SW'], ['Gulf Coast Heat', '3SSB', 'SE'], ['Desert Hoopers', '3SSB', 'W'], ['Golden State Rise', '3SSB', 'W'],
    ['Show-Me Select', '3SSB', 'MW'], ['Capital City Kings', '3SSB', 'W'], ['Bluegrass Ballers', '3SSB', 'SE'], ['Sierra Elite', '3SSB', 'W'],
    ['Twin Cities Elite', 'UAA', 'MW'], ['Rocky Mountain Select', 'UAA', 'W'], ['Magnolia Elite', 'UAA', 'SE'], ['Heartland Hoopers', 'UAA', 'SW'],
    ['Sun Coast Rise', 'UAA', 'SE'], ['Valley Legends', 'UAA', 'W'], ['New England Stars', 'UAA', 'NE'], ['Steel City Select', 'UAA', 'NE'],
    ['Carolina Heat', 'UAA', 'SE'], ['Old Dominion Elite', 'UAA', 'MA'], ['Big Apple Ballers', 'UAA', 'NE'], ['Metroplex Hoopers', 'UAA', 'SW'],
    ['Hill Country Elite', 'UAA', 'SW'], ['Pacific Northwest Legends', 'UAA', 'W'], ['Great Lakes Select', 'UAA', 'MW'], ['Palmetto Stars', 'UAA', 'SE']
  ].map(([name, circuit, region]) => ({ name, circuit, region }));
  // Programs the recruiting sheet lists, by circuit, and the other ways a
  // program gets written ("Team Takeover EYBL", "Nightrydas", "WhyNot").
  // aauKey() is what makes two spellings the same program.
  const SHEET_CIRCUITS = {
    EYBL: 'Team Takeover|Drive Nation|Indy Heat|PSA Cardinals|Meanstreets|MoKan Elite|Vegas Elite|Team Final|Expressions Elite|Houston Hoops|Seattle Rotary|NJ Scholars|Oakland Soldiers|Team Melo|Team CP3|Brad Beal Elite|Nightrydas Elite|All Ohio Red|City Rocks|Team Thad|Mac Irvin Fire|Boo Williams|Team Durant|E1T1|Howard Pulley|Georgia Stars|Team Griffin|LivOn|Team WhyNot',
    '3SSB': 'Game Elite|West Coast Elite|AZ Unity|D1 Minnesota|Utah Prospects|Compton Magic|Team Loaded|Florida Rebels|Atlanta Xpress|Nebraska Supreme',
    UAA: 'Upward Stars|Pro Skills|Team United'
  };
  const AAU_ALIASES = {
    'expressions': 'expressions elite', 'nightrydas': 'nightrydas elite', 'mokan basketball': 'mokan elite',
    'cp3': 'team cp3', 'bradley beal elite': 'brad beal elite', 'each 1 teach 1': 'e1t1', 'ae5 basketball': 'ae5',
    'team why': 'team whynot', 'team why not': 'team whynot', 'why not': 'team whynot', 'whynot': 'team whynot',
    'nw rotary': 'seattle rotary', 'team loaded va': 'team loaded', 'livon basketball': 'livon', 'insep academy': 'insep'
  };
  function aauKey(name) {
    const k = String(name || '').toLowerCase().replace(/\s+(eybl|3ssb|uaa|pro16)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    return AAU_ALIASES[k] || k;
  }
  const circuitByKey = {};
  Object.entries(SHEET_CIRCUITS).forEach(([c, names]) => names.split('|').forEach(n => { circuitByKey[aauKey(n)] = c; }));
  // The circuit a program plays on: written after its name, else known, else ''.
  function aauCircuit(name) {
    const m = /\s(EYBL|3SSB|UAA)\s*$/i.exec(String(name || ''));
    if (m) return m[1].toUpperCase();
    const k = aauKey(name);
    const own = AAU_PROGRAMS.find(p => aauKey(p.name) === k);
    return own ? own.circuit : (circuitByKey[k] || '');
  }

  // His program: one near home; the best prospects lean toward the EYBL,
  // and a few travel to play for a program elsewhere. a, b: two draws.
  // counts: players each program already has in the class, so rosters
  // come out even.
  function aauProgramFor(state, slot, a, b, counts = {}) {
    const home = AAU_PROGRAMS.filter(p => p.region === regionOf(state));
    let pool = a < 0.08 ? AAU_PROGRAMS : home;
    const eybl = home.filter(p => p.circuit === 'EYBL');
    if (slot && slot <= 60 && a >= 0.08 && a < 0.4 && eybl.length) pool = eybl;
    const open = pool.slice().sort((x, y) => (counts[x.name] || 0) - (counts[y.name] || 0)).slice(0, 3);
    const name = open[Math.floor(b * open.length) % open.length].name;
    counts[name] = (counts[name] || 0) + 1;
    return name;
  }

  // ---------- scouting text ----------
  const STRENGTHS = {
    PG: ['Playmaking', 'Ball Handling', 'Court Vision', 'Pick-and-Roll', 'Pull-up Shooting', 'Speed', 'Shooter', 'IQ', 'On-ball Defense'],
    CG: ['Shot Creation', 'Bucket Getter', 'Ball Handling', 'Pull-up Shooting', 'Shooter', 'Playmaking', 'Athleticism', 'Physicals'],
    SG: ['Shooter', 'Shot Creation', 'Bucket Getter', 'Athleticism', 'Off-ball Movement', 'Lockdown Defender', 'Transition Scoring'],
    SF: ['Athleticism', 'Versatility', 'Lockdown Defender', 'Shooter', 'Slashing', 'Size', 'Bucket Getter', 'Physicals'],
    PF: ['Rebounder', 'Physicals', 'Face-up Scoring', 'Versatility', 'Rim Protector', 'Motor', 'Pick-and-Pop', 'Size'],
    C: ['Rim Protector', 'Rebounder', 'Size', 'Post Scoring', 'Physicals', 'Motor', 'Soft Touch', 'Screening']
  };
  const WEAKNESSES = {
    PG: ['Size', 'Defense', 'Streaky Shooter', 'Finishing Through Contact', 'Turnovers'],
    CG: ['Decision Making', 'Defense', 'Streaky Shooter', 'Shot Selection', 'Size'],
    SG: ['Playmaking', 'Defense', 'Streaky Shooter', 'Shot Selection', 'Strength'],
    SF: ['Ball Handling', 'Streaky Shooter', 'Consistency', 'Strength', 'Shot Creation'],
    PF: ['Poor Free Throw Shooter', 'Perimeter Defense', 'Ball Handling', 'Shooting Range', 'Lateral Quickness'],
    C: ['Poor Free Throw Shooter', 'Perimeter Defense', 'Mobility', 'Shooting Range', 'Ball Handling']
  };
  const OPENERS = {
    PG: ['Quick, heady point guard', 'Pass-first floor general', 'Crafty lead guard', 'Explosive point guard', 'Poised floor general'],
    CG: ['Dynamic combo guard', 'Scoring combo guard', 'Shifty combo guard', 'Strong-bodied combo guard'],
    SG: ['Smooth shooting guard', 'Athletic two-guard', 'Three-level scorer', 'Long, sweet-shooting guard'],
    SF: ['Long, versatile wing', 'Athletic slashing wing', 'Two-way wing', 'Big wing scorer'],
    PF: ['Physical stretch four', 'High-motor forward', 'Skilled face-up forward', 'Versatile combo forward'],
    C: ['Mobile rim protector', 'Big-bodied center', 'Long, athletic big', 'Skilled post center']
  };
  const MIDDLES = [
    'who plays with a real feel for the game', 'who impacts winning on both ends', 'with a frame that should fill out nicely',
    'who has shown steady improvement on the circuit', 'who competes on every possession', 'with a projectable skill set',
    'who can take over stretches of games', 'who thrives in transition'
  ];
  const CLOSERS = [
    'Needs to add consistency to become a high-major contributor.', 'Has the tools to outplay his ranking.',
    'Could become a multi-year starter.', 'The upside is obvious if the jumper keeps improving.',
    'Brings toughness and winning habits.', 'Still scratching the surface of his potential.'
  ];

  // ---------- statistics ----------
  // A season line built from position and talent: minutes, a box score,
  // shooting splits, and the advanced numbers the Statistics page shows.
  function statLine(rng, pos, rating, level) {
    const gameMin = level === 'fiba' ? 40 : 32;
    const q = clamp((rating - 74) / 24, 0, 1);
    const big = pos === 'C' ? 1 : pos === 'PF' ? 0.7 : pos === 'SF' ? 0.35 : 0;
    const guard = pos === 'PG' ? 1 : pos === 'CG' ? 0.8 : pos === 'SG' ? 0.6 : 0;
    const lvl = level === 'hs' ? 1 : level === 'aau' ? 0.9 : 0.72;
    const n = () => gauss(rng) * 0.35;
    const gp = level === 'hs' ? Math.round(24 + rng() * 9) : level === 'aau' ? Math.round(14 + rng() * 12) : Math.round(5 + rng() * 3);
    const mpg = clamp((level === 'fiba' ? 18 + q * 10 : 24 + q * 7) + n() * 4, 12, gameMin - 2);
    const ppg = Math.max(3, (9 + q * 16) * lvl * (mpg / 28) + n() * 3);
    const rpg = Math.max(1, (3 + big * 5.5 + q * 2.5) * lvl * (mpg / 28) + n() * 1.2);
    const apg = Math.max(0.3, (1.1 + guard * 2.7 + q * 1.1) * lvl * (mpg / 28) + n() * 0.8);
    const spg = Math.max(0.2, (0.7 + guard * 0.7 + q * 0.6) * (mpg / 28) + n() * 0.3);
    const bpg = Math.max(0.1, (0.2 + big * 1.8 + q * 0.6) * (mpg / 28) + n() * 0.3);
    const topg = Math.max(0.5, 1.2 + apg * 0.28 + n() * 0.4);
    const fg2 = clamp(0.47 + big * 0.1 + q * 0.06 + n() * 0.04 - (level === 'fiba' ? 0.03 : 0), 0.38, 0.72);
    const fg3 = clamp(0.32 + (1 - big) * 0.04 + q * 0.04 + n() * 0.04, 0.2, 0.46);
    const ft = clamp(0.7 + (1 - big) * 0.08 + q * 0.03 + n() * 0.05 - big * 0.06, 0.5, 0.92);
    const p3ar = clamp((pos === 'C' ? 0.08 : pos === 'PF' ? 0.26 : pos === 'SF' ? 0.4 : 0.46) + n() * 0.08, 0.02, 0.65);
    const ftr = clamp(0.32 + big * 0.12 + n() * 0.07, 0.15, 0.7);
    const perShot = (1 - p3ar) * fg2 * 2 + p3ar * fg3 * 3 + ftr * ft;
    const fga = ppg / perShot, fga3 = fga * p3ar, fga2 = fga - fga3, fta = fga * ftr;
    const fgm = fga2 * fg2 + fga3 * fg3;
    const fg = fgm / fga, efg = (fgm + 0.5 * fga3 * fg3) / fga, ts = ppg / (2 * (fga + 0.44 * fta));
    const P = 2.0 * gameMin, share = mpg / gameMin, rebCh = 0.46 * P * share;
    const orb = rpg * (0.18 + big * 0.14);
    const usg = clamp(100 * (fga + 0.44 * fta + topg) / (share * P * 1.12), 12, 38);
    const bpm = -1.5 + q * 9 + n() * 2;
    const rim = fga2 * clamp(0.5 + big * 0.3 + n() * 0.1, 0.3, 0.9);
    const mids = fga2 - rim;
    return {
      gp, mpg: r1(mpg), ppg: r1(ppg), rpg: r1(rpg), apg: r1(apg), spg: r1(spg), bpg: r1(bpg), topg: r1(topg),
      fg: pct(fg * 100), fg2: pct(fg2 * 100), fg3: pct(fg3 * 100), ft: pct(ft * 100),
      bpm: r1(bpm), obpm: r1(bpm * 0.6 + n()), dbpm: r1(bpm * 0.4 - n()),
      ts: pct(ts * 100), rts: pct((ts - 0.54) * 100), efg: pct(efg * 100),
      oreb: pct(100 * orb / rebCh), dreb: pct(100 * (rpg - orb) / rebCh), trb: pct(100 * rpg / (2 * rebCh)),
      ast: pct(100 * apg / Math.max(1, share * 0.42 * P - fgm)), tov: pct(100 * topg / (fga + 0.44 * fta + topg)),
      stl: pct(100 * spg / (share * P)), blk: pct(100 * bpg / (share * 0.54 * P)), usg: pct(usg),
      ftr: ftr.toFixed(3), p3ar: p3ar.toFixed(3),
      ortg: r1(100 + q * 18 + n() * 6), drtg: r1(104 - q * 8 + n() * 5),
      fga2: r1(fga2), rimFga: r1(rim), rimPct: pct(clamp(fg2 + 0.1, 0.45, 0.8) * 100),
      shortMidFga: r1(mids * 0.55), shortMidPct: pct(clamp(fg2 - 0.08, 0.3, 0.6) * 100),
      longMidFga: r1(mids * 0.45), longMidPct: pct(clamp(fg2 - 0.12, 0.25, 0.55) * 100),
      rimMidRatio: (rim / Math.max(0.1, mids)).toFixed(2), fga3: r1(fga3), fta: r1(fta)
    };
  }

  // ---------- schools ----------
  let SCHOOLS = null;
  function schools() {
    if (SCHOOLS) return SCHOOLS;
    const master = root.TeamsMaster || [];
    const P = root.Prestige;
    SCHOOLS = master.map(t => ({ name: t.name, prestige: P ? P.historyScore(t.name, t.conference) : 50 }));
    return SCHOOLS;
  }
  // Weighted pick of schools near the prestige a player of this rating
  // draws. Blue bloods pull the best; the rest spread down the ladder.
  // How many high-school signees a program takes in a class. Most rosters
  // now fill as much from the transfer portal as from high school.
  function quotaFor(prestige) {
    return prestige >= 90 ? 5 : prestige >= 74 ? 4 : prestige >= 55 ? 3 : 2;
  }
  function schoolWeights(rating, counts, spread) {
    // Top-100 prospects go almost entirely to high majors; the back of the
    // top 250 spreads into the mid-majors.
    const target = clamp(44 + (rating - 76) * 3.4, 30, 106);
    return schools().map(s => {
      const d = s.prestige - target;
      // Each school signs about as many as it has room for: a class of four
      // or five at the blue bloods, two or three further down. A school at
      // its number takes someone else only rarely.
      const have = counts[s.name] || 0;
      const full = have >= quotaFor(s.prestige) ? 0.02 : 1 / (1 + have * 0.35);
      return { s, w: Math.exp(-(d * d) / (2 * spread * spread)) * (0.6 + s.prestige / 100) * full };
    });
  }
  function drawSchool(rng, weights, taken) {
    const pool = weights.filter(x => !taken.has(x.s.name));
    let total = pool.reduce((n, x) => n + x.w, 0);
    let r = rng() * total;
    for (const x of pool) { r -= x.w; if (r <= 0) return x.s.name; }
    return pool.length ? pool[pool.length - 1].s.name : null;
  }

  // ---------- one generated prospect ----------
  // Identity, build and talent order depend only on the class year and
  // his place in the pool.
  function identity(key, year, taken, intl, gen = genOf(year)) {
    const rng = rngFor(`${gen}|recruit|${key}`);
    let who = intl ? internationalWho(rng, taken) : null;
    for (let tries = 0; !who && tries < 12; tries++) {
      const w = root.RosterGen && root.RosterGen.americanIdentity ? root.RosterGen.americanIdentity(null, rng) : { name: `Prospect ${key}`, hometown: 'Atlanta, GA' };
      // Domestic prospects only: the international pool is the sheet's.
      const st = (w.hometown.match(/,\s*([A-Z]{2})$/) || [])[1] || '';
      if (!US.has(st)) continue;
      if (!taken.has(w.name.toLowerCase())) { who = w; break; }
    }
    who = who || { name: `Prospect ${key}`, hometown: 'Atlanta, GA' };
    taken.add(who.name.toLowerCase());
    const country = intl ? countryOf(who.hometown) : '';
    const pos = pickPos(rng);
    const build = root.RosterGen ? root.RosterGen.generateBuild(pos, rng) : { ht: "6'5", wt: '195', heightInches: 77 };
    const wing = build.heightInches + Math.round(1 + rng() * 4 + (rng() < 0.15 ? 2 : 0));
    const born = new Date(Date.UTC(year - 19, 8, 1) + Math.floor(rng() * 364) * 86400000);
    const st = intl ? (COUNTRY[country] || 'INT') : (who.hometown.match(/,\s*([A-Z]{2})$/) || [])[1] || '';
    // A public or local high school; national academies are handed out by
    // rank (schoolFor) once his place in the class is known.
    let hs = 'Central High';
    for (let i = 0; i < 6; i++) { hs = root.RosterGen ? root.RosterGen.generateHighSchool(rng) : 'Central High'; if (!ACADEMIES.includes(hs)) break; }
    return {
      rng, name: who.name, hometown: who.hometown, state: st, pos, hs, country,
      height: `${Math.floor(build.heightInches / 12)}'${build.heightInches % 12}"`, weight: build.wt,
      wingspan: `${Math.floor(wing / 12)}'${wing % 12}"`,
      dob: `${born.getUTCMonth() + 1}/${born.getUTCDate()}/${born.getUTCFullYear()}`,
      jitter: gauss(rng) * 0.35
    };
  }

  function profileText(rng, pos) {
    const s = STRENGTHS[pos] || STRENGTHS.SF, w = WEAKNESSES[pos] || WEAKNESSES.SF;
    const strengths = [], weaknesses = [];
    while (strengths.length < 3) { const x = pick(s, rng); if (!strengths.includes(x)) strengths.push(x); }
    // A weakness never contradicts a strength ("Shooter" and "Streaky
    // Shooter", "Lockdown Defender" and "Defense").
    const clash = (a, b) => { const k = t => t.toLowerCase().replace(/streaky |poor |perimeter |on-ball |lockdown /g, '').replace(/defender/, 'defense').replace(/free throw shooter/, 'shooter').replace(/physicals/, 'strength').replace(/^size$/, 'size'); return k(a).includes(k(b)) || k(b).includes(k(a)); };
    let guard = 0;
    while (weaknesses.length < 2 && guard++ < 40) { const x = pick(w, rng); if (!weaknesses.includes(x) && !strengths.some(y => clash(x, y))) weaknesses.push(x); }
    const scouting = `${pick(OPENERS[pos] || OPENERS.SF, rng)} ${pick(MIDDLES, rng)}. ${pick(CLOSERS, rng)}`;
    return { strengths: strengths.join(', '), weaknesses: weaknesses.join(', '), scouting };
  }

  // ---------- a class ----------
  // sheetRows: the sheet's domestic rows for this class (row objects in
  // the caller's key style). Returns the generated rows, and writes each
  // sheet row's place in the combined ranking into its rank column.
  function buildClass(year, sheetRows, K, allNames) {
    const get = (r, k) => r[K(k)];
    const set = (r, k, v) => { r[K(k)] = v; };
    const num = v => { const n = parseFloat(String(v == null ? '' : v).replace('%', '')); return isNaN(n) ? null : n; };
    // Some classes are stronger than others. When the sheet has a #1, the
    // class is built down from him; otherwise its #1 is drawn (classTop).
    const sheetOne = sheetRows.find(r => num(get(r, 'rank')) === 1 && num(get(r, 'rating')) != null);
    const T = curveFor(sheetOne ? num(get(sheetOne, 'rating')) : classTop(year));

    // Sheet players first, in the sheet's own order, each placed where his
    // rating belongs (never ahead of a player the sheet ranks above him).
    // Rated under 70: unranked, and no stars.
    sheetRows.forEach(r => {
      const rt = num(get(r, 'rating'));
      if (rt != null) set(r, 'stars', starsFor(rt) ? String(starsFor(rt)) : '');
      if (rt != null && rt < 70) { set(r, 'sheetRank', get(r, 'rank')); set(r, 'rank', ''); r.__unranked = true; }
    });
    const ordered = sheetRows.filter(r => !r.__unranked).sort((a, b) => (num(get(a, 'rank')) || 9e4) - (num(get(b, 'rank')) || 9e4) || (num(get(b, 'rating')) || 0) - (num(get(a, 'rating')) || 0));
    const taken = new Set();
    let prev = 0;
    ordered.forEach(r => {
      const rating = num(get(r, 'rating'));
      let slot;
      if (rating != null) {
        slot = prev + 1;
        while (slot < SLOTS && T(slot) > rating + 0.5) slot++;
        // Generated players can pass sheet players, but only so far: the
        // sheet's #1 stays in the top two, its #20 in the top 27.
        const authored = num(get(r, 'rank'));
        if (authored) slot = Math.max(prev + 1, Math.min(slot, Math.ceil(authored * 1.3) + 1));
        // The sheet's #1 is the class's #1.
        if (authored === 1) slot = 1;
      } else {
        slot = Math.max(prev + 1, num(get(r, 'rank')) || prev + 1);
      }
      taken.add(slot);
      prev = slot;
      set(r, 'sheetRank', get(r, 'rank'));
      set(r, 'rank', String(slot));
      r.__slot = slot;
    });

    // Generated prospects fill the open places, best first.
    const NO = /^(uncommitted|uncommited|undecided|open|tbd|n\/a|none|-)$/i;
    const commitOf = r => { const c = String(get(r, 'committedSchool') || '').trim(); return c && !NO.test(c) ? c : ''; };
    const committedShare = sheetRows.length >= 10 ? sheetRows.filter(commitOf).length / sheetRows.length : 0;
    const commits = committedShare >= 0.5;
    const counts = {};
    sheetRows.forEach(r => { const c = commitOf(r); if (c) counts[c] = (counts[c] || 0) + 1; });
    const out = [];
    const sheetAt = {};
    ordered.forEach(r => { sheetAt[r.__slot] = num(get(r, 'rating')); });
    let j = 0, above = null;
    const aauCounts = {};
    for (let slot = 1; slot <= SLOTS && j < POOL; slot++) {
      if (taken.has(slot)) { if (sheetAt[slot] != null) above = sheetAt[slot]; continue; }
      // About one in forty is from overseas, playing his high-school ball
      // in the States: ranked with everyone else.
      const intl = rngFor(`${genOf(year)}|intl|${year}|${j}`)() < 0.02;
      const id = identity(`${year}|${j}`, year, allNames, intl);
      const rng = id.rng;
      id.hs = schoolFor(rng, slot, id.hs);
      // An international here plays his high-school ball in the States: he
      // is from abroad (hometown, country) but listed where his school is.
      if (id.country) id.state = pick(['FL', 'TX', 'CA', 'GA', 'NC', 'VA', 'MD', 'AZ', 'UT', 'NV', 'KS', 'MO', 'NH', 'CT', 'PA', 'IN', 'NJ'], rng);
      // Never rated above a sheet player ranked ahead of him.
      let rating = Math.round(clamp(T(slot) + id.jitter, 60, GEN_MAX));
      if (above != null) rating = Math.min(rating, Math.round(above));
      const text = profileText(rng, id.pos);
      // Recruitment: offers from schools around his level, a final list,
      // and where he ends up if this class has committed.
      const wts = schoolWeights(rating, counts, rating >= 84 ? 8 : 11);
      const nOffers = Math.round(clamp(4 + (rating - 76) * 0.45 + rng() * 4, 3, 16));
      const offers = new Set();
      while (offers.size < nOffers) { const s = drawSchool(rng, wts, offers); if (!s) break; offers.add(s); }
      let school = '';
      const offerList = [...offers];
      if (commits && offerList.length) {
        const w2 = wts.filter(x => offers.has(x.s.name));
        school = drawSchool(rng, w2, new Set()) || offerList[0];
        counts[school] = (counts[school] || 0) + 1;
      }
      const finalN = Math.min(offerList.length, rating >= 88 ? 3 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3));
      const finalList = offerList.slice(0, finalN);
      if (school && !finalList.includes(school)) finalList[finalList.length - 1] = school;
      const row = {};
      const put = (k, v) => set(row, k, v);
      put('rank', String(slot)); put('classYear', String(year)); put('name', id.name); put('dob', id.dob);
      put('hs', id.hs); put('pos', id.pos); put('height', id.height); put('weight', id.weight); put('wingspan', id.wingspan);
      put('hometown', id.hometown); put('state', id.state); put('stars', String(starsFor(rating))); put('rating', String(rating));
      if (id.country) put('country', id.country);
      put('committedSchool', school); put('status', school ? `Committed to ${school}` : 'Uncommitted');
      put('commitLogo', ''); put('avatar', '');
      put('offers', offerList.join(', '));
      put('finalListTitle', school ? `Final ${finalList.length}` : `Top ${finalList.length}`);
      put('finalList', finalList.join(', '));
      put('accolades', '');
      put('scouting', text.scouting); put('strengths', text.strengths); put('weaknesses', text.weaknesses);
      const aauA = rng(), aauB = rng();
      const levels = [['hs', id.hs], ['aau', aauProgramFor(id.state, slot, aauA, aauB, aauCounts)]];
      if (id.country) levels.push(['fiba', `${id.country} ${rng() < 0.5 ? 'U17' : 'U18'}`]);
      else if (rating >= 91 && rng() < 0.6) levels.push(['fiba', rng() < 0.5 ? 'USA U17' : 'USA U18']);
      levels.forEach(([lvl, team]) => {
        const line = statLine(rng, id.pos, rating, lvl);
        put(`${lvl}_team`, team);
        Object.entries(line).forEach(([k, v]) => put(`${lvl}_${k}`, String(v)));
      });
      put('generated', 'TRUE');
      row.__tab = String(year);
      row.__slot = slot;
      row.__generated = true;
      out.push(row);
      j++;
    }
    return out.concat(overseas(year, K, allNames, T, commits, counts));
  }

  // Overseas prospects on the radar: playing for a club or academy abroad,
  // unranked in the national list. Some commit to a college; the rest stay
  // pro, and are in the draft pool when they're old enough.
  function overseas(year, K, allNames, T, commits, counts) {
    const set = (r, k, v) => { r[K(k)] = v; };
    const cr = rngFor(`${genOf(year)}|overseas|${year}`);
    const n = 8 + Math.floor(cr() * 6);
    const out = [];
    for (let k = 0; k < n; k++) {
      const id = identity(`${year}|intl|${k}`, year, allNames, true);
      const rng = id.rng;
      const eq = 1 + Math.floor(250 * Math.pow(rng(), 0.7));        // the rank his talent would earn
      const rating = Math.round(clamp(T(eq) + id.jitter, 72, GEN_MAX));
      const club = clubFor(id.country, rng);
      const text = profileText(rng, id.pos);
      let school = '', offers = [];
      if (rng() < 0.45) {
        const wts = schoolWeights(rating, counts, 10);
        const n2 = Math.round(clamp(2 + (rating - 76) * 0.25 + rng() * 3, 2, 9));
        const o = new Set();
        while (o.size < n2) { const s = drawSchool(rng, wts, o); if (!s) break; o.add(s); }
        offers = [...o];
        if (commits && offers.length && rng() < 0.75) { school = offers[0]; counts[school] = (counts[school] || 0) + 1; }
      }
      const row = {};
      const put = (kk, v) => set(row, kk, v);
      put('rank', ''); put('classYear', String(year)); put('name', id.name); put('dob', id.dob);
      put('hs', YOUTH[id.country] || club); put('pos', id.pos); put('height', id.height); put('weight', id.weight); put('wingspan', id.wingspan);
      put('hometown', id.hometown); put('state', 'INT'); put('country', id.country);
      put('stars', String(starsFor(rating))); put('rating', String(rating));
      put('committedSchool', school); put('status', school ? `Committed to ${school}` : commits ? `Playing pro: ${club}` : 'Uncommitted');
      put('proClub', school ? '' : club);
      put('commitLogo', ''); put('avatar', ''); put('offers', offers.join(', '));
      put('finalListTitle', offers.length ? `Top ${Math.min(3, offers.length)}` : ''); put('finalList', offers.slice(0, 3).join(', '));
      put('accolades', '');
      put('scouting', text.scouting); put('strengths', text.strengths); put('weaknesses', text.weaknesses);
      [['intl', club], ['fiba', `${id.country} ${rng() < 0.5 ? 'U17' : 'U18'}`]].forEach(([lvl, team]) => {
        const line = statLine(rng, id.pos, rating - 3, lvl === 'intl' ? 'fiba' : 'fiba');
        put(`${lvl}_team`, team);
        Object.entries(line).forEach(([kk, v]) => put(`${lvl}_${kk}`, String(v)));
      });
      put('generated', 'TRUE');
      row.__tab = String(year);
      row.__generated = true;
      row.__overseas = true;
      out.push(row);
    }
    return out;
  }

  // Fills a sheet row that only has a name (a placeholder the sheet hasn't
  // got to yet) with a generated build and bio, keyed by his name. Any
  // column the sheet fills in wins.
  function fillBlanks(r, year, K) {
    const get = k => r[K(k)];
    const set = (k, v) => { if (!String(get(k) || '').trim()) r[K(k)] = v; };
    const blank = k => !String(get(k) || '').trim() || /^n\/a$/i.test(String(get(k)).trim());
    // A player with his basics filled in only gets any missing measurements.
    if (!blank('pos') && !blank('rating')) {
      if (!['height', 'weight', 'wingspan'].some(blank)) return;
      const id = identity(`fill|${year}|${String(get('name')).toLowerCase()}`, year, new Set(), false, GEN);
      const put = (k, v) => { if (blank(k)) r[K(k)] = v; };
      put('height', id.height); put('weight', id.weight); put('wingspan', id.wingspan);
      return;
    }
    const id = identity(`fill|${year}|${String(get('name')).toLowerCase()}`, year, new Set(), false, GEN);
    const rating = Math.round(clamp(curve(r.__slot || 100), 60, GEN_MAX));
    set('pos', id.pos); set('height', id.height); set('weight', id.weight); set('wingspan', id.wingspan);
    set('hometown', id.hometown); set('state', id.state); set('hs', id.hs); set('dob', id.dob);
    set('rating', String(rating)); set('stars', String(starsFor(rating)));
    r.__filled = true;
  }

  // rows: every row the sheet loader read. opts.keys: 'lower' when the
  // caller's parser lower-cases and strips column names (the NCAA RP).
  // opts.classes: class years that have a tab. Returns rows + generated.
  function augment(rows, opts = {}) {
    const lower = opts.keys === 'lower';
    const K = k => (lower ? k.toLowerCase().replace(/[^a-z0-9]/g, '') : k);
    const allNames = new Set(rows.map(r => String(r[K('name')] || '').trim().toLowerCase()).filter(Boolean));
    const byClass = {}, abroad = [];
    rows.forEach(r => {
      if (!/^\d{4}$/.test(String(r.__tab || ''))) return;
      // Overseas players (listed as INT, or not ranked by the sheet) are
      // their own pool; an international ranked in the class is ranked here.
      const st = String(r[K('state')] || '').trim().toUpperCase();
      const ranked = /^\d+$/.test(String(r[K('rank')] || '').trim());
      if (st && !US.has(st) && (st === 'INT' || st === 'INTL' || !ranked)) { abroad.push(r); return; }
      // The class column decides the class; the tab is the fallback.
      const cy = String(r[K('classYear')] || '').trim();
      const y = /^\d{4}$/.test(cy) ? cy : r.__tab;
      (byClass[y] = byClass[y] || []).push(r);
    });
    const years = [...new Set([...(opts.classes || []), ...Object.keys(byClass)].filter(y => /^\d{4}$/.test(String(y))))].sort();
    let out = rows.slice();
    years.forEach(y => {
      const sheet = byClass[y] || [];
      const gen = buildClass(Number(y), sheet, K, allNames);
      sheet.forEach(r => fillBlanks(r, Number(y), K));
      out = out.concat(gen);
    });
    // The sheet's overseas players: stars from their rating, and any
    // missing measurements filled in.
    abroad.forEach(r => {
      const y = Number(String(r[K('classYear')] || r.__tab).trim()) || Number(r.__tab);
      fillBlanks(r, y, K);
      const rt = parseFloat(r[K('rating')]);
      if (!isNaN(rt)) r[K('stars')] = starsFor(rt) ? String(starsFor(rt)) : '';
    });
    return out;
  }

  const api = { SLOTS, POOL, GEN_MAX, CIRCUITS, AAU_PROGRAMS, aauKey, aauCircuit, REGIONS, regionOf, aauProgramFor, setResets, getResets, genOf, quotaFor, curve, curveFor, classTop, starsFor, projectionFor, statLine, buildClass, augment, hash, rngFor, ACADEMIES };
  root.RecruitGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
