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
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];
  const r1 = v => Math.round(v * 10) / 10;
  const pct = v => `${r1(v).toFixed(1)}%`;

  const US = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM ' +
    'NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' '));

  // Recruiting-scale rating by final rank: where a normal class sits.
  const CURVE = [[1, 97], [5, 94.5], [25, 89.5], [50, 86.5], [100, 83], [250, 76.5]];
  function curve(rank) {
    const x = Math.log(Math.max(1, rank));
    for (let i = 1; i < CURVE.length; i++) {
      const [r0, v0] = CURVE[i - 1], [r1_, v1] = CURVE[i];
      if (rank <= r1_) return v0 + (v1 - v0) * (x - Math.log(r0)) / (Math.log(r1_) - Math.log(r0));
    }
    return CURVE[CURVE.length - 1][1] - (rank - 250) * 0.03;
  }
  const starsFor = rating => rating >= 90.5 ? 5 : rating >= 81.5 ? 4 : 3;

  const POSITIONS = [['PG', 0.17], ['CG', 0.10], ['SG', 0.17], ['SF', 0.22], ['PF', 0.19], ['C', 0.15]];
  function pickPos(rng) {
    let x = rng();
    for (const [p, w] of POSITIONS) { x -= w; if (x <= 0) return p; }
    return 'SF';
  }

  const AAU_A = ['Elite', 'Select', 'Stars', 'Express', 'Heat', 'Hoopers', 'Warriors', 'Legends', 'Fire', 'Ballers', 'Rise', 'Academy'];
  const AAU_TEAM = ['Team Takeover', 'Mokan Elite', 'Expressions', 'Team Thad', 'Nightrydas', 'Wildcats Select', 'Team Loaded', 'Atlanta Xpress', 'Oakland Soldiers', 'Houston Hoops', 'Indy Heat', 'Florida Rebels'];

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
  function schoolWeights(rating, counts, spread) {
    // Top-100 prospects go almost entirely to high majors; the back of the
    // top 250 spreads into the mid-majors.
    const target = clamp(44 + (rating - 76) * 3.4, 30, 106);
    return schools().map(s => {
      const d = s.prestige - target;
      const full = (counts[s.name] || 0) >= 7 ? 0.02 : 1 / (1 + (counts[s.name] || 0) * 0.35);
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
  function identity(key, year, taken) {
    const rng = rngFor(`recruit|${key}`);
    let who = null;
    for (let tries = 0; tries < 12; tries++) {
      const w = root.RosterGen && root.RosterGen.americanIdentity ? root.RosterGen.americanIdentity(null, rng) : { name: `Prospect ${key}`, hometown: 'Atlanta, GA' };
      // Domestic prospects only: the international pool is the sheet's.
      const st = (w.hometown.match(/,\s*([A-Z]{2})$/) || [])[1] || '';
      if (!US.has(st)) continue;
      if (!taken.has(w.name.toLowerCase())) { who = w; break; }
    }
    who = who || { name: `Prospect ${key}`, hometown: 'Atlanta, GA' };
    taken.add(who.name.toLowerCase());
    const pos = pickPos(rng);
    const build = root.RosterGen ? root.RosterGen.generateBuild(pos, rng) : { ht: "6'5", wt: '195', heightInches: 77 };
    const wing = build.heightInches + Math.round(1 + rng() * 4 + (rng() < 0.15 ? 2 : 0));
    const born = new Date(Date.UTC(year - 19, 8, 1) + Math.floor(rng() * 364) * 86400000);
    const st = (who.hometown.match(/,\s*([A-Z]{2})$/) || [])[1] || '';
    const hs = root.RosterGen ? root.RosterGen.generateHighSchool(rng) : 'Prep Academy';
    return {
      rng, name: who.name, hometown: who.hometown, state: st, pos, hs,
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
    const off = (rngFor(`class-strength|${year}`)() - 0.5) * 2;      // some classes are deeper than others
    const T = rank => curve(rank) + off;

    // Sheet players first, in the sheet's own order, each placed where his
    // rating belongs (never ahead of a player the sheet ranks above him).
    const ordered = sheetRows.slice().sort((a, b) => (num(get(a, 'rank')) || 9e4) - (num(get(b, 'rank')) || 9e4) || (num(get(b, 'rating')) || 0) - (num(get(a, 'rating')) || 0));
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
    const committedShare = sheetRows.length >= 10 ? sheetRows.filter(r => String(get(r, 'committedSchool') || '').trim()).length / sheetRows.length : 0;
    const commits = committedShare >= 0.5;
    const counts = {};
    sheetRows.forEach(r => { const c = String(get(r, 'committedSchool') || '').trim(); if (c) counts[c] = (counts[c] || 0) + 1; });
    const out = [];
    const sheetAt = {};
    ordered.forEach(r => { sheetAt[r.__slot] = num(get(r, 'rating')); });
    let j = 0, above = null;
    for (let slot = 1; slot <= SLOTS && j < POOL; slot++) {
      if (taken.has(slot)) { if (sheetAt[slot] != null) above = sheetAt[slot]; continue; }
      const id = identity(`${year}|${j}`, year, allNames);
      const rng = id.rng;
      // Never rated above a sheet player ranked ahead of him.
      let rating = Math.round(clamp(T(slot) + id.jitter, 60, 99));
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
      put('committedSchool', school); put('status', school ? `Committed to ${school}` : 'Uncommitted');
      put('commitLogo', ''); put('avatar', '');
      put('offers', offerList.join(', '));
      put('finalListTitle', school ? `Final ${finalList.length}` : `Top ${finalList.length}`);
      put('finalList', finalList.join(', '));
      put('accolades', '');
      put('scouting', text.scouting); put('strengths', text.strengths); put('weaknesses', text.weaknesses);
      const levels = [['hs', id.hs], ['aau', rng() < 0.5 ? pick(AAU_TEAM, rng) : `${id.hometown.split(',')[0]} ${pick(AAU_A, rng)}`]];
      if (rating >= 91 && rng() < 0.6) levels.push(['fiba', rng() < 0.5 ? 'USA U17' : 'USA U18']);
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
    return out;
  }

  // Fills a sheet row that only has a name (a placeholder the sheet hasn't
  // got to yet) with a generated build and bio, keyed by his name. Any
  // column the sheet fills in wins.
  function fillBlanks(r, year, K) {
    const get = k => r[K(k)];
    const set = (k, v) => { if (!String(get(k) || '').trim()) r[K(k)] = v; };
    if (String(get('pos') || '').trim() && String(get('rating') || '').trim()) return;
    const id = identity(`fill|${year}|${String(get('name')).toLowerCase()}`, year, new Set());
    const rating = Math.round(clamp(curve(r.__slot || 100), 60, 99));
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
    const byClass = {};
    rows.forEach(r => {
      if (!/^\d{4}$/.test(String(r.__tab || ''))) return;
      const st = String(r[K('state')] || '').trim().toUpperCase();
      if (st && !US.has(st)) return;                    // international: their own pool
      (byClass[r.__tab] = byClass[r.__tab] || []).push(r);
    });
    const years = [...new Set([...(opts.classes || []), ...Object.keys(byClass)].filter(y => /^\d{4}$/.test(String(y))))].sort();
    let out = rows.slice();
    years.forEach(y => {
      const sheet = byClass[y] || [];
      const gen = buildClass(Number(y), sheet, K, allNames);
      sheet.forEach(r => fillBlanks(r, Number(y), K));
      out = out.concat(gen);
    });
    return out;
  }

  const api = { SLOTS, POOL, curve, starsFor, statLine, buildClass, augment, hash, rngFor };
  root.RecruitGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
