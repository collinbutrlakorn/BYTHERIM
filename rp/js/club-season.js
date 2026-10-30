// ============================================================
// Club seasons: international prospects playing their club ball.
//
// The summer circuit (summer-core.js) plays AAU and FIBA game by game.
// This does the same for the rest of the year overseas: every
// international recruit still in high school and every international pro
// plays a season for his club, one game at a time, on the same calendar
// as the college season.
//
// The league his club plays in decides his role. A teenager at Real
// Madrid is the twelfth man in the EuroLeague and gets spot minutes and
// a handful of shots; the same player at Mega in the ABA League, or at
// an academy, plays thirty minutes and the offense runs through him.
// His own game (per-minute rates, shot profile, shooting) comes from
// what he's written to have done, like the summer.
//
// A season is plain data (it lives in the save and is published with the
// universe):
//   { season, recs: { [playerId]: { id, club, lg, years, exp, games: [
//       [oppClub, home 1/0, ourScore, theirScore, hisLine, teamLine, oppLine]
//   ] } } }
// with each line packed like the summer's (SummerCore.LINE). Every game is
// seeded by player, season and game number, so a save always tells the
// same story, however many times it's replayed.
// No DOM: testable in Node.
// ============================================================

(function (root) {
  const SC = () => root.SummerCore || (typeof require === 'function' ? (() => { try { return require('./summer-core.js'); } catch (e) { return null; } })() : null);
  const GC = () => root.GameCore || (typeof require === 'function' ? (() => { try { return require('./game-core.js'); } catch (e) { return null; } })() : null);

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
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const gauss = rng => (rng() + rng() + rng() - 1.5) / 0.5;
  const r1 = v => Math.round(v * 10) / 10;
  const r3 = v => Math.round(v * 1000) / 1000;

  // ---------- leagues ----------
  //
  // level: the rating (college scale) of a regular rotation player there.
  //   A prospect at that level plays the middle of the minutes range.
  // mpg: minutes for a prospect well below / well above the level.
  // usage: how much of the offense a prospect of his standing is handed,
  //   against a high-school or summer role (1.0 = the same).
  // eff: shooting against that defense, against high school (two-point
  //   percentage; threes move by half as much).
  // comp: how much the draft board trusts production there (college power
  //   conferences = 1.0).
  // ppg: what a team scores in a game there.
  const LEAGUES = {
    euroleague: { name: 'EuroLeague', level: 91, mpg: [4, 24], gp: 34, usage: 0.7, eff: -0.045, comp: 1.45, ppg: 81, min: 40 },
    eurocup:    { name: 'EuroCup', level: 87, mpg: [8, 27], gp: 32, usage: 0.78, eff: -0.035, comp: 1.32, ppg: 82, min: 40 },
    nbl:        { name: 'NBL', level: 87, mpg: [8, 27], gp: 29, usage: 0.8, eff: -0.035, comp: 1.30, ppg: 88, min: 40 },
    aba:        { name: 'ABA League', level: 84, mpg: [12, 30], gp: 30, usage: 0.9, eff: -0.025, comp: 1.22, ppg: 80, min: 40 },
    asia:       { name: 'Asian pro', level: 83, mpg: [10, 27], gp: 36, usage: 0.82, eff: -0.025, comp: 1.05, ppg: 82, min: 40 },
    domestic:   { name: 'European domestic', level: 80, mpg: [14, 31], gp: 30, usage: 0.92, eff: -0.02, comp: 0.98, ppg: 80, min: 40 },
    latam:      { name: 'Latin American pro', level: 80, mpg: [14, 31], gp: 34, usage: 0.94, eff: -0.02, comp: 0.95, ppg: 82, min: 40 },
    bal:        { name: 'BAL', level: 78, mpg: [16, 32], gp: 20, usage: 0.96, eff: -0.015, comp: 0.9, ppg: 80, min: 40 },
    ote:        { name: 'Overtime Elite', level: 76, mpg: [18, 29], gp: 30, usage: 1.0, eff: -0.01, comp: 0.85, ppg: 76, min: 32 },
    youth:      { name: 'Junior league', level: 72, mpg: [16, 31], gp: 26, usage: 1.05, eff: 0, comp: 0.75, ppg: 78, min: 40 }
  };

  // Which league a club plays in, by name. The clubs named in hs-season.js
  // and recruit-gen.js, plus the usual others a sheet might list.
  const CLUB_LEAGUE = [
    [/u\s?1[4-9]|u\s?2[01]|junior|youth|academy|academic|insep|\bseed\b|next stars|\bprep\b|stella azzurra|aspire|\bselect\b|\bangt\b|high school|\bmis\b|\bnba academy/i, 'youth'],
    [/overtime elite|\bote\b|city reapers|ygb|cold hearts|blue checks|fear of god|jelly fam/i, 'ote'],
    [/\(bal\)|rivers hoopers|as douanes|stade malien|\bfap\b|cobra sport|petro de luanda|\bapr\b|al ahly|us monastir|kriol star|nairobi city/i, 'bal'],
    [/real madrid|barcelona|fenerbah|anadolu efes|\befes\b|olympiacos|panathinaikos|partizan|crvena zvezda|red star|zalgiris|olimpia milano|armani|virtus bologna|bayern|\basvel\b|villeurbanne|monaco|paris basketball|maccabi tel aviv|baskonia|valencia basket|alba berlin|hapoel tel aviv|dubai basketball/i, 'euroleague'],
    [/perth|melbourne united|sydney kings|brisbane bullets|adelaide|36ers|tasmania|jackjumpers|south east melbourne|phoenix|illawarra|cairns|taipans|new zealand breakers|breakers/i, 'nbl'],
    [/mega( basket| superbet| mis)?|\bfmp\b|\bsplit\b|cibona|cedevita|olimpija|\bkrka\b|buducnost|igokea|borac|zadar|spartak subotica|dubai/i, 'aba'],
    [/joventut|badalona|unicaja|malaga|gran canaria|cholet|metropolitans|boulogne|ratiopharm|\bulm\b|bamberg|hapoel jerusalem|reyer|venezia|rytas|besiktas|galatasaray|\baek\b|\bpaok\b|bursaspor|turk telekom|trento|tenerife|lenovo|bourg|le mans|nanterre|wurzburg|bonn|cluj|ludwigsburg|lietkabelis|\bcsko? moscow|cska|zenit|unics/i, 'eurocup'],
    [/beijing|guangdong|shanghai|zhejiang|liaoning|alvark|chiba|ryukyus|utsunomiya|seoul|ulsan|knights|mobis|anyang|wonju|san miguel|tnt|meralco/i, 'asia'],
    [/obras|quimsa|boca|instituto|franca|flamengo|sao paulo|minas|santurce|ponce|capitanes|guaros|halcones|cangrejeros|leones|piratas|peñarol|penarol|nacional|aguada|regatas/i, 'latam']
  ];
  function leagueOf(club) {
    const c = String(club || '').trim();
    if (!c) return 'youth';
    const hit = CLUB_LEAGUE.find(([re]) => re.test(c));
    return hit ? hit[1] : 'domestic';
  }
  const leagueInfo = key => LEAGUES[key] || LEAGUES.domestic;

  // Who a club plays: a seeded slate of other clubs in its league.
  const OPPONENTS = {
    euroleague: ['Real Madrid', 'FC Barcelona', 'Fenerbahce', 'Anadolu Efes', 'Olympiacos', 'Panathinaikos', 'Partizan', 'Crvena Zvezda', 'Zalgiris Kaunas', 'Olimpia Milano', 'Virtus Bologna', 'Bayern Munich', 'ASVEL', 'AS Monaco', 'Paris Basketball', 'Maccabi Tel Aviv', 'Baskonia', 'Valencia Basket'],
    eurocup: ['Joventut Badalona', 'Unicaja', 'Gran Canaria', 'ratiopharm Ulm', 'Hapoel Jerusalem', 'Reyer Venezia', 'Rytas Vilnius', 'Besiktas', 'Cedevita Olimpija', 'Bourg-en-Bresse', 'Trento', 'Turk Telekom', 'Lietkabelis', 'Bamberg Baskets', 'Cholet Basket', 'Metropolitans 92'],
    nbl: ['Perth Wildcats', 'Melbourne United', 'Sydney Kings', 'Brisbane Bullets', 'Adelaide 36ers', 'Tasmania JackJumpers', 'South East Melbourne Phoenix', 'Illawarra Hawks', 'Cairns Taipans', 'New Zealand Breakers'],
    aba: ['Mega Basket', 'FMP', 'Partizan', 'Crvena Zvezda', 'Cedevita Olimpija', 'Cibona', 'Split', 'Krka', 'Buducnost', 'Igokea', 'Zadar', 'Borac', 'Spartak Subotica', 'Dubai Basketball'],
    asia: ['Beijing Ducks', 'Guangdong Southern Tigers', 'Shanghai Sharks', 'Liaoning Flying Leopards', 'Alvark Tokyo', 'Chiba Jets', 'Ryukyu Golden Kings', 'Seoul SK Knights', 'Ulsan Hyundai Mobis', 'Anyang KGC'],
    domestic: ['Sodertalje Kings', 'Bakken Bears', 'London Lions', 'VEF Riga', 'Manchester Giants', 'Kataja', 'Norrkoping Dolphins', 'Leicester Riders', 'Ventspils', 'Helsinki Seagulls', 'Bnei Herzliya', 'Antwerp Giants'],
    latam: ['Obras Sanitarias', 'Quimsa', 'Boca Juniors', 'Instituto', 'Franca', 'Flamengo', 'Sao Paulo', 'Minas', 'Cangrejeros de Santurce', 'Leones de Ponce', 'Capitanes de Arecibo', 'Penarol'],
    bal: ['Petro de Luanda', 'Al Ahly', 'US Monastir', 'Rivers Hoopers', 'AS Douanes', 'Stade Malien', 'APR', 'FAP', 'Cobra Sport', 'Kriol Star', 'Nairobi City Thunder', 'Al Ittihad'],
    ote: ['City Reapers', 'YNG Dreamerz', 'Cold Hearts', 'Blue Checks', 'Fear of God Athletics', 'Jelly Fam', 'RWE', 'Diamond Doves'],
    youth: ['Real Madrid U18', 'FC Barcelona U18', 'Mega Basket U19', 'Stella Azzurra', 'INSEP', 'Bayern Munich U19', 'Zalgiris U18', 'NBA Academy Africa', 'NBA Academy Latin America', 'Canarias Basketball Academy', 'Joventut U18', 'Partizan U19', 'ASVEL U18', 'Cedevita Junior']
  };
  // How good a club is on its league's scale: the big names a little
  // above, the rest scattered around it.
  function clubStrength(club, lg) {
    const L = leagueInfo(lg), list = OPPONENTS[lg] || [];
    const i = list.findIndex(x => x.toLowerCase() === String(club || '').toLowerCase());
    const top = i >= 0 && i < Math.ceil(list.length / 3);
    return L.level + (top ? 1.8 : 0) + (rngFor(`club|${club}`)() - 0.5) * 3;
  }

  // ---------- the prospect's game ----------
  //
  // His per-minute production and shooting from what he's written to have
  // done (his club line first, then FIBA, AAU and high school; a model of
  // his rating and position if nothing's written), sized to his role.
  const SRC = {
    intl: { usage: 1.0, d2: 0.0, d3: 0.0 },
    fiba: { usage: 1.08, d2: 0.02, d3: 0.02 },
    aau:  { usage: 1.12, d2: 0.025, d3: 0.025 },
    hs:   { usage: 1.2, d2: 0.04, d3: 0.035 },
    model: { usage: 1.1, d2: 0.02, d3: 0.02 }
  };
  const PAR_DEFAULT = { C: 0.06, PF: 0.22, 'F/C': 0.12, SF: 0.38, W: 0.4, F: 0.28, SG: 0.45, CG: 0.42, PG: 0.42, G: 0.44 };
  function sourceLine(p) {
    const w = p.written || {};
    const S = SC();
    const unpackArr = a => (Array.isArray(a) && S ? Object.fromEntries(S.LINE_KEYS.map((k, i) => [k, a[i] == null ? null : a[i]])) : a || null);
    const own = unpackArr(w.intl);
    if (own && own.gp && own.ppg != null && own.mpg) return { ...own, from: 'intl' };
    if (S && S.writtenLine) return S.writtenLine(p, 'fiba');
    return { gp: 20, mpg: 24, ppg: 10, rpg: 4, apg: 2, spg: 1, bpg: 0.5, topg: 2, fg2: 50, fg3: 33, ft: 70, fga2: 6, fga3: 3, fta: 3, from: 'model' };
  }

  // What a player of his talent and position produces per 40 minutes in a
  // featured role against players his own age (the model when nothing is
  // written, and half of the picture when something is).
  function talent40(rt, pos) {
    const big = /^(C|PF|F\/C)$/.test(pos), guard = /^(PG|SG|G|CG)$/.test(pos), pg = /^(PG|G|CG)$/.test(pos);
    return {
      pts: clamp(14.5 + (rt - 78) * 0.65, 10, 30),
      reb: clamp((big ? 10.5 : guard ? 5 : 7.2) + (rt - 80) * 0.08, 3, 15),
      ast: clamp((pg ? 5.6 : guard ? 3.4 : big ? 1.8 : 2.8) + (rt - 80) * 0.07, 0.8, 10),
      stl: 1.4, blk: big ? 2.0 : guard ? 0.35 : 0.75,
      tov: clamp(3.1 + (pg ? 0.6 : 0) - (rt - 80) * 0.02, 1.4, 5),
      fta: clamp(4.5 + (rt - 80) * 0.12 + (big ? 1 : 0), 2, 9),
      fg2: clamp(0.5 + (rt - 80) * 0.003 + (big ? 0.05 : 0), 0.42, 0.64),
      fg3: clamp(0.33 + (rt - 80) * 0.002 - (big ? 0.03 : 0), 0.26, 0.4),
      ft: big ? 0.66 : 0.75,
      par: PAR_DEFAULT[pos] || 0.35
    };
  }

  // p: { id, pos, talent, written, years }; lg: league key.
  // Returns his expected line for a game there (GameCore's expectedStats).
  function prospectExp(p, lg, season) {
    const L = leagueInfo(lg), src = sourceLine(p), from = SRC[src.from] || SRC.model;
    const rng = rngFor(`club|role|${p.id}|${season}`);
    const rt = Number(p.talent) || 75;
    const pos = String(p.pos || 'SF').toUpperCase();
    const big = /^(C|PF|F\/C)$/.test(pos);
    // Where he stands on his club: -1 a long way below its rotation, +1 a
    // long way above. Each season in the league earns a little more trust.
    const years = Number(p.years) || 0;
    const stand = clamp((rt - L.level) / 9 + years * 0.12 + gauss(rng) * 0.12, -1.2, 1.2);
    const G = L.min;
    let mpg = L.mpg[0] + (L.mpg[1] - L.mpg[0]) * (stand + 1) / 2;
    mpg = clamp(mpg * G / 40 + gauss(rng) * 1.2, 3, G * 0.82);

    // His game per 40: what he's written to have done (scoring taken back
    // to a neutral role), blended with what his talent says.
    const m = talent40(rt, pos);
    const wrote = src.from !== 'model' && src.mpg > 0;
    const w40 = v => (v == null ? null : v / src.mpg * 40);
    const mix = (wv, mv) => (wrote && wv != null && isFinite(wv) ? wv * 0.6 + mv * 0.4 : mv);
    const pct = (v, lo, hi) => (v == null || v > 100 || v <= 0 ? null : clamp(v / 100, lo, hi));
    const att2 = src.fga2, att3 = src.fga3 != null && src.fga3 <= 15 ? src.fga3 : null;
    const wPar = att2 != null && att3 != null && att2 + att3 > 0 ? att3 / (att2 + att3) : null;
    const v = {
      pts: mix(w40(src.ppg) / from.usage, m.pts), reb: mix(w40(src.rpg), m.reb), ast: mix(w40(src.apg), m.ast),
      stl: mix(w40(src.spg), m.stl), blk: mix(w40(src.bpg), m.blk), tov: mix(w40(src.topg), m.tov),
      fta: mix(src.fta != null && src.fta <= 20 ? w40(src.fta) / from.usage : null, m.fta),
      fg2: mix(pct(src.fg2, 0.36, 0.8) != null ? pct(src.fg2, 0.36, 0.8) - from.d2 : null, m.fg2),
      fg3: mix(pct(src.fg3, 0.15, 0.5) != null ? pct(src.fg3, 0.15, 0.5) - from.d3 : null, m.fg3),
      ft: mix(pct(src.ft, 0.4, 0.95), m.ft), par: mix(wPar, m.par)
    };
    // His share of the offense: what the league hands a player of his
    // standing.
    const usage = clamp(L.usage * (1 + stand * 0.22), 0.55, 1.4);
    const k = mpg / 40;
    // Better defense: tougher twos, a little tougher from three. A player
    // well above the league still finishes a bit better than one below.
    // (A little is added back: a low-volume shooter's makes are the first
    // to go when the game's score is settled, so he lands below his rate.)
    const twoP = clamp(v.fg2 + L.eff + stand * 0.02 + 0.03, 0.47, 0.72);
    const threeP = clamp(v.fg3 + L.eff * 0.5 + stand * 0.01 + 0.015, 0.29, 0.46);
    // Glass and defense: men are bigger and stronger, so a teenager's
    // rates come down unless he's well above the league.
    const adult = lg === 'youth' ? 1 : clamp(0.86 + stand * 0.08, 0.72, 1);
    const ppg = v.pts * k * usage;
    let rpg = v.reb * k * adult;
    const apg = v.ast * k * clamp(usage, 0.6, 1.2);
    // Boards against points (the same rule as college): a rotation player
    // out-rebounding his own scoring is rare.
    if (mpg >= 12) {
      const cap = ppg * 0.78 + 0.3;
      if (rpg > cap) rpg = cap + (rpg - cap) * 0.2;
    }
    const r = x => r3(Math.max(0, x));
    return {
      mpg: r(mpg), ppg: r(ppg), rpg: r(rpg), apg: r(apg), stl: r(v.stl * k * adult), blk: r(v.blk * k * adult),
      tov: r(Math.max(0.2, v.tov * k * clamp(usage, 0.6, 1.2) * (lg === 'youth' ? 1 : 1.08))), pf: r(mpg / 10.5), fta: r(v.fta * k * usage),
      ftPct: r3(v.ft), threePar: r3(clamp(v.par, 0.01, 0.7)), threePPct: r3(threeP), twoPPct: r3(twoP),
      stand: r3(stand), usage: r3(usage)
    };
  }

  // A club's other eleven: rated around the club, best first, each with
  // a modest line for his minutes. Seeded by club and season, so the same
  // roster plays all year.
  const POS_CYCLE = ['PG', 'SG', 'SF', 'PF', 'C', 'SG', 'SF', 'PF', 'PG', 'C', 'SF', 'PF'];
  const MIN_TEMPLATE = [32, 30, 28, 26, 24, 21, 18, 14, 9, 6, 4, 2];
  function depthRoster(club, lg, season, n) {
    const rng = rngFor(`club|roster|${club}|${season}`);
    const base = clubStrength(club, lg);
    return Array.from({ length: n }, (_, i) => ({
      id: `club|${club}|${i}`, pos: POS_CYCLE[i % POS_CYCLE.length], depth: true,
      rating: r1(base + 3 - i * 0.9 + (rng() - 0.5) * 3)
    }));
  }
  function depthExp(pl, mpg, L) {
    const q = clamp((pl.rating - (L.level - 10)) / 18, 0, 1);
    const big = /^(C|PF)$/.test(pl.pos), guard = /G$/.test(pl.pos);
    return {
      mpg, ppg: mpg * (0.3 + q * 0.14), rpg: mpg * (big ? 0.24 : guard ? 0.1 : 0.16), apg: mpg * (guard ? 0.12 : 0.05),
      stl: mpg * 0.03, blk: mpg * (big ? 0.03 : 0.006), tov: mpg * 0.045, pf: mpg / 10.5, fta: mpg * 0.08,
      ftPct: big ? 0.68 : 0.78, threePar: big ? 0.12 : guard ? 0.5 : 0.4, threePPct: 0.34 + q * 0.03, twoPPct: 0.51 + q * 0.04
    };
  }
  // A team of twelve sized to its league: 200 minutes (or 160), scoring and
  // boards in range. The prospect's own line is left as it is.
  function buildTeam(name, lg, season, prospect) {
    const L = leagueInfo(lg), G = L.min, M = 5 * G, k = G / 40;
    const others = depthRoster(name, lg, season, prospect ? 11 : 12);
    const list = prospect ? others.concat([prospect]) : others;
    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const pm = prospect ? prospect.expectedStats.mpg : 0;
    let mins = list.map((p, i) => (p === prospect ? 0 : MIN_TEMPLATE[i] || 1));
    const tot = mins.reduce((n, m) => n + m, 0) || 1;
    mins = mins.map(m => Math.min(G * 0.85, m * (M - pm) / tot));
    list.forEach((p, i) => { if (p !== prospect) p.expectedStats = depthExp(p, mins[i], L); });
    const rest = list.filter(p => p !== prospect);
    const sum = key => list.reduce((n, p) => n + (parseFloat(p.expectedStats[key]) || 0), 0);
    const want = { ppg: L.ppg * k, rpg: 36 * k, apg: 17 * k };
    Object.keys(want).forEach(key => {
      const mine = prospect ? parseFloat(prospect.expectedStats[key]) || 0 : 0;
      const theirs = sum(key) - mine;
      const f = theirs > 0 ? Math.max(0.3, (want[key] - mine) / theirs) : 1;
      rest.forEach(p => { p.expectedStats[key] *= f; if (key === 'ppg') p.expectedStats.fta *= f; });
    });
    const top = list.slice(0, 8);
    const ovr = top.reduce((n, p) => n + (p.rating || 70), 0) / Math.max(1, top.length);
    return {
      school: name, conference: '', roster: list,
      simData: { teamOvr: ovr, rosterRef: list }, coachProfile: { pace: 1, defense: 1 },
      pts: sum('ppg')
    };
  }

  // Math.random, seeded, for the length of one game: GameCore draws from
  // it, and a seeded game is the same game every time it's played.
  function seeded(key, fn) {
    const real = Math.random;
    Math.random = rngFor(key);
    try { return fn(); } finally { Math.random = real; }
  }

  const LINE = () => (SC() ? SC().LINE : ['id', 'min', 'pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'twoPm', 'twoPa', 'threePm', 'threePa', 'ftm', 'fta', 'started']);
  const pack = l => LINE().map(k => (k === 'started' ? (l.started ? 1 : 0) : k === 'id' ? (l.id || '') : Math.round(Number(l[k]) || 0)));
  const SUMK = ['min', 'pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'twoPm', 'twoPa', 'threePm', 'threePa', 'ftm', 'fta'];
  const sumLine = boxes => { const t = { id: '' }; SUMK.forEach(k => { t[k] = boxes.reduce((n, b) => n + (Number(b.box[k]) || 0), 0); }); return t; };

  // ---------- a season ----------

  // The record for one player's season (no games yet).
  // p: { id, name, pos, talent, written, club, years }
  // A player a long way below his club's league doesn't sit at the end of
  // its bench all year: he plays for the club's second team, in a
  // domestic league, until he's ready.
  const SENIOR_TOP = new Set(['euroleague', 'eurocup', 'nbl', 'aba', 'asia']);
  function placement(club, lg, talent) {
    if (SENIOR_TOP.has(lg) && talent < leagueInfo(lg).level - 9) return { lg: 'domestic', team: `${club} B` };
    return { lg, team: club };
  }

  function startRecord(p, season) {
    const pl = placement(p.club, p.league || leagueOf(p.club), Number(p.talent) || 75);
    const lg = pl.lg;
    const L = leagueInfo(lg);
    const exp = prospectExp(p, lg, season);
    // A few games missed here and there, more for the end of the bench.
    const rng = rngFor(`club|gp|${p.id}|${season}`);
    const gp = Math.max(8, Math.round(L.gp * (0.86 + rng() * 0.14) - (exp.stand < -0.6 ? rng() * 6 : 0)));
    return { id: p.id, club: p.club, team: pl.team, lg, years: Number(p.years) || 0, pos: p.pos || '', talent: Number(p.talent) || 75, exp, gp, games: [] };
  }

  // Plays his games up to `upto` (of his season's gp).
  function playTo(rec, season, upto) {
    const G = GC();
    if (!G || !G.simulateSingleGame) return 0;
    const L = leagueInfo(rec.lg);
    const n = Math.min(rec.gp, Math.max(0, Math.round(upto)));
    let played = 0;
    const team = rec.team || rec.club;
    const opps = (OPPONENTS[rec.lg] || OPPONENTS.domestic).filter(c => c.toLowerCase() !== String(team || '').toLowerCase());
    while (rec.games.length < n) {
      const i = rec.games.length;
      const key = `club|game|${rec.id}|${season}|${i}`;
      const pick = rngFor(key + '|opp');
      const opp = opps[Math.floor(pick() * opps.length)] || 'Opponent';
      const home = i % 2 === 0;
      const me = { id: rec.id, pos: rec.pos, rating: rec.talent, expectedStats: { ...rec.exp } };
      const us = buildTeam(team, rec.lg, season, me), them = buildTeam(opp, rec.lg, season, null);
      const H = home ? us : them, A = home ? them : us;
      const res = seeded(key, () => G.simulateSingleGame(H, A, {
        homeCourtEdge: 2.5, marginScale: 1.1, marginVarianceStd: 11, paceVarianceStd: 7,
        expectedTotal: H.pts + A.pts, gameMinutes: L.min
      }));
      const ours = home ? res.homePlayerBoxes : res.awayPlayerBoxes, theirs = home ? res.awayPlayerBoxes : res.homePlayerBoxes;
      const mine = ours.find(b => b.player === me);
      const box = mine ? { ...mine.box, id: rec.id, started: ours.indexOf(mine) < 5 } : { id: rec.id, min: 0 };
      const os = home ? res.homeScore : res.awayScore, ts = home ? res.awayScore : res.homeScore;
      rec.games.push([opp, home ? 1 : 0, os === ts ? os + 1 : os, ts, pack(box), pack(sumLine(ours)), pack(sumLine(theirs))]);
      played++;
    }
    return played;
  }

  // ---------- his numbers ----------
  function ledgerOf(rec) {
    const S = SC();
    if (!S || !S.Ledger) return null;
    const led = new S.Ledger();
    rec.games.forEach(g => {
      const me = S.unpack(g[4]), team = S.unpack(g[5]), opp = S.unpack(g[6]);
      if (!(me.min > 0)) return;
      // The team line minus his own is "everyone else" (no id, so the
      // ledger counts it in the team's totals but not as a player).
      const rest = {};
      Object.keys(team).forEach(k => { rest[k] = typeof team[k] === 'number' ? team[k] - (Number(me[k]) || 0) : team[k]; });
      rest.id = '';
      led.game([me, rest], [opp], rec.lg);
    });
    return led;
  }
  const gameScore = a => a.pts + 0.4 * a.fgm - 0.7 * a.fga - 0.4 * (a.fta - a.ftm) + 0.7 * a.oreb + 0.3 * a.dreb + a.stl + 0.7 * a.ast + 0.7 * a.blk - 0.4 * a.pf - a.tov;
  const offScore = a => a.pts + 0.4 * a.fgm - 0.7 * a.fga - 0.4 * (a.fta - a.ftm) + 0.7 * a.oreb + 0.7 * a.ast - a.tov;
  // The average player in his games: box plus-minus is measured from there.
  function baseOf(rec) {
    const S = SC();
    let min = 0, gs = 0, o = 0;
    rec.games.forEach(g => [g[5], g[6]].forEach(arr => {
      const t = S.unpack(arr);
      min += t.min; gs += gameScore(t); o += offScore(t);
    }));
    return { gs40: min ? gs / min * 40 : 10, o40: min ? o / min * 40 : 8 };
  }

  // His season in the recruiting page's columns (like a summer line), or
  // null before he's played.
  function lineOf(rec) {
    const S = SC(), led = ledgerOf(rec);
    if (!led) return null;
    const a = led.by.get(rec.id);
    if (!a || !a.gp) return null;
    return S.line(a, rec.pos, baseOf(rec));
  }

  // His season in the NCAA RP's stat columns (what player pages, the stats
  // table and the draft board read).
  function statsOf(rec) {
    const led = ledgerOf(rec);
    const a = led && led.by.get(rec.id);
    if (!a || !a.gp) return null;
    const ln = lineOf(rec);
    const g = a.gp, d1 = v => (v / g).toFixed(1), d3 = (m, n) => (n > 0 ? (m / n).toFixed(3).replace(/^0/, '') : '.000');
    const p40 = v => (a.min > 0 ? (v / a.min * 40).toFixed(1) : '0.0');
    const ts = 2 * (a.fga + 0.44 * a.fta);
    const pctStr = v => `${parseFloat(v) || 0}%`;
    return {
      gp: g, gs: a.gs,
      totMin: a.min, totPts: a.pts, totReb: a.reb, totOreb: a.oreb, totDreb: a.dreb, totAst: a.ast, totStl: a.stl,
      totBlk: a.blk, totTov: a.tov, totPf: a.pf, totFgm: a.fgm, totFga: a.fga, totThreePm: a.threePm,
      totThreePa: a.threePa, totFtm: a.ftm, totFta: a.fta,
      mpg: d1(a.min), ppg: d1(a.pts), oreb: d1(a.oreb), dreb: d1(a.dreb), rpg: d1(a.reb), apg: d1(a.ast),
      stl: d1(a.stl), blk: d1(a.blk), tov: d1(a.tov), pf: d1(a.pf),
      fgm: d1(a.fgm), fga: d1(a.fga), fgPct: d3(a.fgm, a.fga),
      twoPm: d1(a.twoPm), twoPa: d1(a.twoPa), twoPPct: d3(a.twoPm, a.twoPa),
      threePm: d1(a.threePm), threePa: d1(a.threePa), threePPct: d3(a.threePm, a.threePa),
      ftm: d1(a.ftm), fta: d1(a.fta), ftPct: d3(a.ftm, a.fta),
      bpm: String(ln.bpm), obpm: String(ln.obpm), dbpm: String(ln.dbpm),
      tsPct: d3(a.pts, ts), eFgPct: d3(a.fgm + 0.5 * a.threePm, a.fga),
      orebPct: pctStr(ln.oreb), drebPct: pctStr(ln.dreb), trbPct: pctStr(ln.trb), astPct: pctStr(ln.ast),
      tovPct: pctStr(ln.tov), blkPct: pctStr(ln.blk), usg: pctStr(ln.usg),
      ftr: d3(a.fta, a.fga), threePar: d3(a.threePa, a.fga),
      ortg: String(ln.ortg), drtg: String(ln.drtg), netRtg: r1((parseFloat(ln.ortg) || 0) - (parseFloat(ln.drtg) || 0)).toFixed(1),
      p40pts: p40(a.pts), p40reb: p40(a.reb), p40oreb: p40(a.oreb), p40dreb: p40(a.dreb),
      p40ast: p40(a.ast), p40stl: p40(a.stl), p40blk: p40(a.blk), p40tov: p40(a.tov),
      p40pf: p40(a.pf), p40fga: p40(a.fga), p40threePa: p40(a.threePa), p40fta: p40(a.fta)
    };
  }

  // His games as NCAA RP game-log entries (newest last).
  function gameLogOf(rec, season) {
    const S = SC();
    return rec.games.map((g, i) => {
      const b = S.unpack(g[4]);
      return { ...b, reb: b.oreb + b.dreb, opponent: g[0], isHome: !!g[1], teamScore: g[2], oppScore: g[3], won: g[2] > g[3], phase: 'pro', week: i + 1, isConf: false, season };
    });
  }

  const api = { LEAGUES, leagueOf, leagueInfo, OPPONENTS, clubStrength, prospectExp, buildTeam, startRecord, playTo, ledgerOf, lineOf, statsOf, gameLogOf, rngFor };
  root.ClubSeason = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
