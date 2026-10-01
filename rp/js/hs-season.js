// ============================================================
// The high-school and international side of a season.
//
// The recruiting sheet holds where every recruit ENDS UP: his final
// ranking, his commitment, his class, his all-star selections. This
// module plays that out over the season rather than showing it all on
// day one:
//   - rankings drift in from a seeded starting point and land exactly on
//     the sheet's final ranking by the end of his senior season
//   - commitments are spread from his junior year to the spring
//   - a few young-for-class players reclassify late in the season
//   - McDonald's All-American, Jordan Brand Classic and Nike Hoop Summit
//     rosters (from the sheet, filled out when short)
//   - uncommitted internationals turn pro: a club and a pro stat line
//
// Everything is seeded by the player's name, so a save always tells the
// same story. No DOM, no engine state: testable in Node.
// ============================================================

(function (root) {
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
  const gauss = rng => (rng() + rng() + rng() - 1.5) / 0.5;   // about -3..3
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const keyOf = r => `${String(r.name || '').trim().toLowerCase()}|${r.recClassYear || ''}`;

  const US_STATES = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM ' +
    'NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' '));

  // Not from the United States: the sheet's state column holds a country
  // or province code ("INT", "ON", "SN") for these players.
  function isInternational(r) {
    const st = String(r.state || '').trim().toUpperCase();
    if (st) return !US_STATES.has(st);
    const m = String(r.hometown || '').match(/,\s*([A-Z]{2})$/);
    return m ? !US_STATES.has(m[1]) : false;
  }

  const committedTo = r => {
    const s = String(r.school || '').trim();
    return s && !/^(uncommitted|free agent|n\/a|none|-)$/i.test(s) ? s : '';
  };

  // ---------- where a class stands ----------
  //
  // A class's story runs over two seasons: its junior year (while it's
  // "next year's class") and its senior year (while it's the incoming
  // class). 0 is the start of the junior year, 0.5 the start of the
  // senior year, 1 the end of it.
  function classProgress(classYear, seasonYear, p) {
    const c = Number(classYear);
    if (c <= seasonYear) return 1;
    if (c === seasonYear + 1) return 0.5 + p / 2;
    if (c === seasonYear + 2) return p / 2;
    return 0;
  }

  // ---------- rankings ----------
  //
  // Where each player starts, relative to where he finishes. Most move a
  // few spots; a handful are genuine risers who start far down the list
  // (or unranked), and a few slide.
  function rankOffset(r) {
    const rng = rngFor(keyOf(r) + '|rank');
    const fin = Number(r.rsci) || 150;
    const roll = rng();
    if (roll < 0.08) return 45 + rng() * 80;          // big riser
    if (roll < 0.12) return -(8 + rng() * 14);        // slider
    return gauss(rng) * (3 + fin * 0.10);
  }

  // Ranks the class as it stands at `cp` (class progress). Only ranked
  // players are ordered; the order becomes the sheet's own at cp = 1.
  function rankClass(members, cp) {
    const ranked = members.filter(r => Number(r.rsci) > 0);
    const w = clamp(1 - cp, 0, 1);
    // A breakout summer (engine: runSummerCircuit) moves a player up while
    // the class is still moving, a quiet one down; never past the #1.
    const summer = r => { const b = Number(r.summerBuzz) || 0; return b ? -b * (1.5 + (Number(r.rsci) || 150) * 0.06) * w * 2 : 0; };
    const scored = ranked.map(r => {
      const sh = summer(r);
      let s = Number(r.rsci) + rankOffset(r) * w * 2 + sh;
      if (sh < 0 && Number(r.rsci) > 1) s = Math.max(s, 1.5);
      return { r, s };
    });
    scored.sort((a, b) => a.s - b.s || Number(a.r.rsci) - Number(b.r.rsci));
    // Numbered by position while the class is still moving (a player who
    // hasn't reclassified in yet leaves no hole); once it's final, the
    // numbers are the sheet's own, gaps and ties included.
    const labels = ranked.map(r => Number(r.rsci)).sort((a, b) => a - b);
    const out = new Map();
    scored.forEach((x, i) => out.set(x.r, cp >= 1 ? labels[i] : i + 1));
    return out;
  }

  // ---------- stars ----------
  //
  // How many 5-stars (and 4-stars) the class has right now. The sheet's
  // own counts are where it finishes; earlier in the cycle the services
  // are stingier, so the 5-star count starts lower (never under 15, or the
  // class's real count if that's smaller) and fills in. The 4-and-5-star
  // total stays the sheet's, so a player dropping from 5 lands on 4.
  function starQuota(members, cp, classYear) {
    const ranked = members.filter(r => Number(r.rsci) > 0);
    const five = ranked.filter(r => Number(r.stars) >= 5).length;
    const fourPlus = ranked.filter(r => Number(r.stars) >= 4).length;
    if (cp >= 1) return { five, fourPlus };
    const rng = rngFor(`${classYear}|stars`);
    const floor = Math.min(15, five);
    const start = floor + Math.round((five - floor) * rng() * 0.5);
    const t = clamp(cp, 0, 1);
    const wobble = Math.round((rngFor(`${classYear}|stars|${Math.round(cp * 40)}`)() - 0.5) * 2);
    const now = clamp(Math.round(start + (five - start) * t * t) + wobble, floor, five);
    return { five: now, fourPlus };
  }

  // Stars by where a player ranks today, filling the quota from the top.
  function starsByRank(members, ranks, cp, classYear) {
    const q = starQuota(members, cp, classYear);
    const out = new Map();
    const order = members.filter(r => ranks.get(r)).sort((a, b) => ranks.get(a) - ranks.get(b));
    order.forEach((r, i) => {
      if (cp >= 1) { out.set(r, Number(r.stars) || (i < q.five ? 5 : i < q.fourPlus ? 4 : 3)); return; }
      out.set(r, i < q.five ? 5 : i < q.fourPlus ? 4 : 3);
    });
    return out;
  }

  // ---------- commitments ----------
  //
  // When his commitment becomes public, on the class-progress scale: a
  // quarter commit during their junior year, most in the fall of their
  // senior year, the rest through the winter and a few in the spring.
  function commitAt(r) {
    const rng = rngFor(keyOf(r) + '|commit');
    const roll = rng();
    if (roll < 0.40) return 0.12 + rng() * 0.38;
    if (roll < 0.70) return 0.50 + rng() * 0.08;
    if (roll < 0.92) return 0.58 + rng() * 0.36;
    return 0.94 + rng() * 0.06;
  }
  const commitVisible = (r, cp) => cp >= 1 || cp >= commitAt(r);

  // ---------- reclassification ----------
  //
  // A few players reclassify into an older class late in its senior
  // season. The sheet lists them in the class they END in. Named here
  // when known; otherwise it's a Reclass column in the sheet, or a
  // ranked player too young for his class (born after August 31 of the
  // year he'd usually have been born in).
  const RECLASS_NAMED = { 'kameron jackson': 2030, 'grant elliot': 2030, 'louie pierce': 2031 };

  function parseDob(v) {
    const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  function reclassFrom(r) {
    const c = Number(r.recClassYear);
    if (!c) return null;
    // A McDonald's All-American is set in his class: the roster is made of
    // seniors, so he was never a reclass.
    if (r.allStar && r.allStar.mcd) return null;
    const own = Number(r.reclassFrom);
    if (own && own > c) return own;
    const named = RECLASS_NAMED[String(r.name || '').trim().toLowerCase()];
    if (named && named > c) return named;
    if (Number(r.rsci) > 0) {
      const dob = parseDob(r.dob);
      if (dob && dob > new Date(Date.UTC(c - 18, 7, 31))) return c + 1;
    }
    return null;
  }
  // Late in the class's senior season: class progress 0.88 - 0.95.
  const reclassAt = r => 0.88 + rngFor(keyOf(r) + '|reclass')() * 0.07;

  // The class a player is listed in right now.
  function currentClass(r, seasonYear, p) {
    const from = reclassFrom(r);
    const fin = Number(r.recClassYear);
    if (!from) return fin;
    return classProgress(fin, seasonYear, p) >= reclassAt(r) ? fin : from;
  }

  // ---------- all-star games ----------
  //
  // Announced and played on the incoming class's senior-season calendar
  // (p = progress through the current season, 0-1).
  // Each team's badge (schoollogos/) and colour; each event's logo sits at
  // the site root.
  const TEAM_STYLE = {
    West: { logo: 'allstar-mcd-west', color: '#2563eb' }, East: { logo: 'allstar-mcd-east', color: '#d42a37' },
    'Team Air': { logo: 'allstar-jbc-air', color: '#141414' }, 'Team Flight': { logo: 'allstar-jbc-flight', color: '#d42a37' },
    USA: { logo: 'allstar-nhs-usa', color: '#e8ecf2' }, World: { logo: 'allstar-nhs-world', color: '#141414' }
  };
  const EVENT_LOGO = { mcd: 'mcdaag.png', jbc: 'jbc.png', nhs: 'nikehoopsummit.png' };
  const EVENTS = {
    mcd: { name: "McDonald's All-American Game", short: "McDonald's AA", size: 24, pool: 35, announce: 0.45, play: 0.9, teams: ['East', 'West'] },
    jbc: { name: 'Jordan Brand Classic', short: 'Jordan Brand', size: 24, pool: 75, announce: 0.6, play: 1, teams: ['Team Air', 'Team Flight'] },
    nhs: { name: 'Nike Hoop Summit', short: 'Hoop Summit', size: 24, pool: 30, announce: 0.7, play: 1, teams: ['USA', 'World'] }
  };
  const flagged = (r, k) => !!(r.allStar && r.allStar[k]);

  // Picks from a ranked pool, leaning toward the top of it.
  function weightedFill(pool, n, rng) {
    const left = pool.slice(), out = [];
    while (out.length < n && left.length) {
      const idx = Math.min(left.length - 1, Math.floor(left.length * Math.pow(rng(), 3)));
      out.push(left.splice(idx, 1)[0]);
    }
    return out;
  }
  const byRank = (a, b) => (Number(a.rsci) || 999) - (Number(b.rsci) || 999) || (Number(b.rating) || 0) - (Number(a.rating) || 0);

  // members: the class (final class year). nextIntl: internationals from
  // the class after, eligible for the Hoop Summit's World team.
  function selectRosters(members, classYear, nextIntl = []) {
    const us = members.filter(r => !isInternational(r) && Number(r.rsci) > 0).sort(byRank);
    const pick = (key, pool, cap) => {
      const ev = EVENTS[key];
      const chosen = pool.filter(r => flagged(r, key)).sort(byRank).slice(0, cap);
      const rest = pool.filter(r => !chosen.includes(r) && (Number(r.rsci) || 999) <= ev.pool);
      return chosen.concat(weightedFill(rest, cap - chosen.length, rngFor(`${classYear}|${key}`)));
    };
    // McDonald's: American high-schoolers (Canadians at US schools count)
    // from the top 35. The Jordan Brand Classic takes a wider net.
    const hsPool = members.filter(r => Number(r.rsci) > 0).sort(byRank);
    const mcd = pick('mcd', hsPool, 24);
    const jbc = pick('jbc', hsPool, 24);
    const usa = pick('nhs', us, 12);
    // World: the class's internationals flagged in the sheet first, then
    // the best of the rest, including top-100 recruits from outside the
    // US and the following class's internationals.
    const intl = members.filter(isInternational);
    const worldFlagged = intl.filter(r => flagged(r, 'nhs')).sort(byRank);
    const worldRest = intl.filter(r => !worldFlagged.includes(r))
      .concat(nextIntl.filter(isInternational))
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    const world = worldFlagged.concat(worldRest).slice(0, 12);
    return { mcd, jbc, nhs: { usa, world } };
  }

  // East and West by where a player is from, 12 a side.
  const LON = { WA: -120, OR: -121, CA: -119, NV: -117, ID: -114, MT: -110, WY: -107, UT: -111, AZ: -111, CO: -105,
    NM: -106, AK: -150, HI: -157, ND: -100, SD: -100, NE: -99, KS: -98, OK: -97, TX: -98, MN: -94, IA: -93,
    MO: -92, AR: -92, LA: -92, WI: -89, IL: -89, MS: -90, TN: -86, KY: -85, AL: -87, IN: -86, MI: -85,
    OH: -83, GA: -83, FL: -82, SC: -81, NC: -79, WV: -80, VA: -78, PA: -77, MD: -77, DC: -77, DE: -75,
    NJ: -74, NY: -75, CT: -73, RI: -71, MA: -72, VT: -73, NH: -71, ME: -69 };
  function splitEastWest(players) {
    const lon = r => LON[String(r.state || '').toUpperCase()] || -80;
    const sorted = players.slice().sort((a, b) => lon(a) - lon(b));
    const half = Math.ceil(sorted.length / 2);
    return { West: sorted.slice(0, half), East: sorted.slice(half) };
  }
  // Snake draft by rank for the Jordan Brand Classic's two teams.
  function splitSnake(players, names) {
    const sorted = players.slice().sort(byRank);
    const a = [], b = [];
    sorted.forEach((r, i) => ((i % 4 === 0 || i % 4 === 3) ? a : b).push(r));
    return { [names[0]]: a, [names[1]]: b };
  }

  // ---------- international pros ----------

  const CLUBS = [
    [/serbia|belgrade|novi sad/i, ['Partizan', 'Crvena Zvezda', 'Mega Basket', 'FMP']],
    [/croatia|zagreb|split/i, ['Cibona', 'Cedevita Olimpija', 'Split']],
    [/slovenia|ljubljana/i, ['Cedevita Olimpija', 'Krka']],
    [/spain|madrid|barcelona|valencia|alicante|malaga|bilbao/i, ['Real Madrid', 'FC Barcelona', 'Joventut Badalona', 'Valencia Basket', 'Unicaja', 'Gran Canaria']],
    [/france|paris|lyon|marseille|lille/i, ['ASVEL', 'Paris Basketball', 'AS Monaco', 'Cholet Basket', 'Metropolitans 92']],
    [/germany|munich|berlin|hamburg|ulm/i, ['Bayern Munich', 'Alba Berlin', 'ratiopharm Ulm', 'Bamberg Baskets']],
    [/lithuania|vilnius|kaunas/i, ['Zalgiris Kaunas', 'Rytas Vilnius']],
    [/latvia|riga/i, ['VEF Riga']],
    [/turk|istanbul|ankara|izmir|fenerbah/i, ['Fenerbahce', 'Anadolu Efes', 'Besiktas', 'Galatasaray']],
    [/greece|athens|thessaloniki/i, ['Olympiacos', 'Panathinaikos', 'AEK Athens', 'PAOK']],
    [/italy|rome|milan|bologna/i, ['Olimpia Milano', 'Virtus Bologna', 'Reyer Venezia']],
    [/australia|melbourne|sydney|perth|brisbane|adelaide|canberra|tasmania|hobart|cairns|victoria|, (AU|AUS|ACT|VIC|NSW|QLD|WA|SA)$/i, ['Perth Wildcats', 'Melbourne United', 'Sydney Kings', 'Brisbane Bullets', 'Adelaide 36ers', 'Tasmania JackJumpers', 'South East Melbourne Phoenix', 'Illawarra Hawks', 'Cairns Taipans']],
    [/new zealand|auckland/i, ['New Zealand Breakers']],
    [/china|beijing|shanghai|guangdong/i, ['Beijing Ducks', 'Guangdong Southern Tigers', 'Shanghai Sharks']],
    [/japan|tokyo|osaka/i, ['Alvark Tokyo', 'Chiba Jets']],
    [/korea|seoul/i, ['Seoul SK Knights', 'Ulsan Hyundai Mobis']],
    [/argentina|buenos aires|mendoza|cordoba/i, ['Obras Sanitarias', 'Quimsa', 'Boca Juniors']],
    [/brazil|sao paulo|rio de janeiro|franca/i, ['Franca', 'Flamengo', 'Sao Paulo']],
    [/sweden|stockholm|gothenburg|finland|helsinki|denmark|norway/i, ['Sodertalje Kings', 'Bakken Bears']],
    [/uk|england|london|manchester/i, ['London Lions']],
    // Africa's best prospects mostly go to Europe; some play in the BAL.
    [/nigeria|lagos/i, ['ASVEL', 'Real Madrid', 'FC Barcelona', 'Gran Canaria', 'Paris Basketball', 'Cholet Basket', 'Joventut Badalona', 'Rivers Hoopers (BAL)']],
    [/senegal|dakar|thies/i, ['ASVEL', 'Cholet Basket', 'AS Monaco', 'Real Madrid', 'Paris Basketball', 'Gran Canaria', 'Bayern Munich', 'AS Douanes (BAL)']],
    [/mali|bamako/i, ['ASVEL', 'Cholet Basket', 'Joventut Badalona', 'Real Madrid', 'Paris Basketball', 'Valencia Basket', 'Stade Malien (BAL)']],
    [/cameroon|yaound|douala/i, ['ASVEL', 'Real Madrid', 'Paris Basketball', 'Cholet Basket', 'Gran Canaria', 'Joventut Badalona', 'FAP (BAL)']],
    [/sudan|juba/i, ['Real Madrid', 'FC Barcelona', 'ASVEL', 'Paris Basketball', 'Joventut Badalona', 'Cobra Sport (BAL)']],
    [/congo|kinshasa|ghana|accra|rwanda|kigali|angola|luanda|ivory|abidjan|kenya|nairobi|egypt|cairo|tunisia/i, ['ASVEL', 'Real Madrid', 'FC Barcelona', 'Paris Basketball', 'Cholet Basket', 'Joventut Badalona', 'Petro de Luanda (BAL)', 'APR (BAL)']],
    [/puerto rico|mayag|san juan/i, ['Cangrejeros de Santurce', 'Leones de Ponce']],
    [/russia|moscow|st\.? petersburg|kazan/i, ['CSKA Moscow', 'Zenit St. Petersburg', 'UNICS Kazan']],
    [/ukraine|kyiv|kharkiv|poland|warsaw|czech|prague|hungary|budapest|romania|bulgaria/i, ['Partizan', 'Crvena Zvezda', 'Alba Berlin', 'Zalgiris Kaunas']],
    [/ireland|dublin|scotland/i, ['London Lions', 'Manchester Giants']],
    [/israel|tel aviv|jerusalem/i, ['Maccabi Tel Aviv', 'Hapoel Jerusalem']],
    [/philippines|manila|taiwan|taipei/i, ['Seoul SK Knights', 'Alvark Tokyo', 'Beijing Ducks']],
    [/canada|, (ON|QC|BC|AB)$/i, ['Overtime Elite']]
  ];
  const D1_LIKE = /university|college|state|^[A-Z]{2,5}$/i;

  // Where an uncommitted international plays: the sheet's committed club
  // when it names one that isn't a college, else his last club, else a
  // club from his country.
  // Academies are high school: the NBA Academies, INSEP, SEED, a club's
  // youth or junior team, a prep school. A player there isn't a pro yet.
  const ACADEMY = /academy|academic|insep|\bseed\b|\byouth\b|\bjuniors?\b|\bjr\.?$|\bu1[4-9]\b|\bu2[01]\b|\bprep\b|high school|\bhs\b|\bnext stars\b|\bmis\b|stella azzurra|aspire|\bselect\b|hoop summit|^n\/a$|^none$|^-$/i;
  const isAcademy = name => ACADEMY.test(String(name || '').trim());
  const NOT_A_CLUB = /^(pro|playing pro|professional|overseas|international|tbd|undecided)$/i;
  // His pro club: one he's signed with, the senior team he's played for,
  // or one in his part of the world.
  function clubFor(r, isD1) {
    const ok = n => n && !NOT_A_CLUB.test(n) && !isAcademy(n);
    const c = committedTo(r);
    if (ok(c) && !(isD1 ? isD1(c) : D1_LIKE.test(c))) return c;
    const signed = String(r.proClub || '').trim();
    if (ok(signed)) return signed;
    const last = String(r.intlTeam || '').trim();
    if (ok(last)) return last;
    // Where he's from: hometown, else the country the sheet lists (some
    // overseas rows put the country where the school goes).
    const where = `${r.hometown || ''} ${r.state || ''} ${r.country || ''} ${r.hs || ''}`;
    const hit = CLUBS.find(([re]) => re.test(where));
    const list = hit ? hit[1] : ['Overtime Elite', 'Real Madrid', 'ASVEL', 'Partizan'];
    return list[Math.floor(rngFor(keyOf(r) + '|club')() * list.length)];
  }

  // Turns pro: an international who never commits to a college (or who
  // commits to a club).
  // How likely an overseas prospect is to stay pro rather than come to
  // college: Europeans most, then Australians and Latin Americans, then
  // Africans and Canadians, who mostly come over.
  function proLean(r) {
    const where = `${r.country || ''} ${r.hometown || ''}`;
    if (/canada|, (ON|QC|BC|AB|MB|NS|SK)$/i.test(where)) return 0.15;
    if (/nigeria|senegal|mali|cameroon|sudan|congo|ghana|rwanda|angola|ivory|kenya|egypt|tunisia|africa/i.test(where)) return 0.35;
    if (/australia|new zealand|, (AUS|ACT|VIC|NSW|QLD)$/i.test(where)) return 0.45;
    if (/argentina|brazil|puerto rico|dominican|china|japan|korea|philippines/i.test(where)) return 0.4;
    return 0.6;
  }
  const staysPro = r => rngFor(keyOf(r) + '|stays-pro')() < proLean(r);
  function turnsPro(r, isD1) {
    if (!isInternational(r)) return false;
    const c = committedTo(r);
    return !c || (isD1 ? !isD1(c) : !D1_LIKE.test(c));
  }

  // One season's line for a teenager in a pro league. Minutes are hard to
  // come by against grown men, so the counting stats are modest; the
  // per-40 rates and efficiency are what scouts read. `years` is seasons
  // since his class graduated (0 = his first pro season).
  // A pro's level on the college rating scale, from his recruiting-service
  // rating (the college mapping of that rating is noisy and conservative
  // for players who never play a college game).
  function proTalent(r) {
    const rec = Number(r.recRating);
    const scaled = Number(r.rating) || 72;
    return rec ? Math.max(scaled, 70 + (rec - 80) * 1.15) : scaled;
  }
  // The national ranking an international of that rating would hold, so
  // the draft board weighs his pedigree like a ranked recruit's.
  function proPedigreeRank(r) {
    const rec = Number(r.recRating);
    if (!rec) return null;
    return Math.max(1, Math.round(Math.pow(Math.max(0, 99 - rec), 1.7) + 1));
  }

  // Some international pros break out: a season (about one in eight) where
  // he takes a real step, most of which he keeps. The rating-scale boost
  // for a season, counting the breakouts before it.
  function proBreakout(r, season) {
    const from = Number(r.recClassYear) || season;
    let boost = 0;
    for (let y = from; y <= season; y++) {
      const b = rngFor(`${keyOf(r)}|breakout|${y}`);
      if (b() < 0.13) boost += (y === season ? 1 : 0.65) * (3.5 + b() * 4);
    }
    return Math.round(boost * 10) / 10;
  }

  function proLine(r, season, years) {
    const rng = rngFor(`${keyOf(r)}|pro|${season}`);
    const rt = proTalent(r) + proBreakout(r, season);
    const pos = String(r.pos || '').toUpperCase();
    const big = /C|PF|F\/C/.test(pos) && !/G/.test(pos), guard = /G/.test(pos) && !/F/.test(pos);
    const mpg = clamp(8 + (rt - 76) * 0.9 + years * 3 + gauss(rng) * 2.2, 5, 30);
    const p40 = {
      pts: clamp(13 + (rt - 76) * 0.6 + years * 1.2 + gauss(rng) * 1.8, 7, 30),
      reb: clamp((big ? 10.5 : guard ? 5 : 7.2) + (rt - 80) * 0.08 + gauss(rng) * 0.8, 2.5, 16),
      ast: clamp((guard ? 5.5 : big ? 1.8 : 3) + (rt - 80) * 0.07 + gauss(rng) * 0.7, 0.8, 10),
      stl: clamp(1.4 + gauss(rng) * 0.25, 0.4, 3),
      blk: clamp((big ? 1.9 : 0.6) + gauss(rng) * 0.3, 0.1, 4.5),
      tov: clamp(3.2 - (rt - 80) * 0.03 + gauss(rng) * 0.35, 1.2, 5.5)
    };
    const ts = clamp(0.53 + (rt - 80) * 0.0028 + gauss(rng) * 0.02, 0.44, 0.66);
    const threePar = clamp((big ? 0.18 : guard ? 0.48 : 0.4) + gauss(rng) * 0.05, 0.02, 0.7);
    const threePct = clamp(0.30 + (rt - 80) * 0.003 + gauss(rng) * 0.025 - (big ? 0.03 : 0), 0.2, 0.44);
    const ftPct = clamp(0.70 + (rt - 80) * 0.004 + gauss(rng) * 0.04 - (big ? 0.06 : 0), 0.48, 0.92);
    const bpm = (rt - 82) * 0.55 + years * 0.7 + gauss(rng) * 1.2;
    return { mpg, p40, ts, threePar, threePct, ftPct, bpm, games: 30 + Math.floor(rng() * 9) };
  }

  // The stat object the engine and the draft board read, `progress` of
  // the way through his season.
  function proStats(line, progress) {
    const gp = Math.round(line.games * clamp(progress, 0, 1));
    const f = line.mpg / 40, d1 = v => v.toFixed(1), d3 = v => v.toFixed(3).replace(/^0/, '');
    const pts = line.p40.pts * f;
    const fga = pts / (2 * line.ts) * 0.88, fta = pts * 0.25;
    return {
      gp, gs: Math.round(gp * clamp((line.mpg - 10) / 15, 0, 1)),
      mpg: d1(line.mpg), ppg: d1(pts), rpg: d1(line.p40.reb * f), apg: d1(line.p40.ast * f),
      stl: d1(line.p40.stl * f), blk: d1(line.p40.blk * f), tov: d1(line.p40.tov * f),
      fga: d1(fga), fta: d1(fta), fgPct: d3(clamp(line.ts * 0.86, 0.35, 0.62)),
      threePa: d1(fga * line.threePar), threePPct: d3(line.threePct), ftPct: d3(line.ftPct),
      tsPct: d3(line.ts), bpm: d1(line.bpm), obpm: d1(line.bpm * 0.6), dbpm: d1(line.bpm * 0.4),
      p40pts: d1(line.p40.pts), p40reb: d1(line.p40.reb), p40ast: d1(line.p40.ast),
      p40stl: d1(line.p40.stl), p40blk: d1(line.p40.blk), p40tov: d1(line.p40.tov),
      threePar: d3(line.threePar)
    };
  }

  root.HSCore = {
    hash, rngFor, isInternational, committedTo, classProgress, rankOffset, rankClass, starQuota, starsByRank,
    commitAt, commitVisible, RECLASS_NAMED, parseDob, reclassFrom, reclassAt, currentClass,
    EVENTS, TEAM_STYLE, EVENT_LOGO, selectRosters, splitEastWest, splitSnake, clubFor, isAcademy, proLean, staysPro, turnsPro, proTalent, proBreakout, proPedigreeRank, proLine, proStats, US_STATES
  };
})(typeof window !== 'undefined' ? window : globalThis);
