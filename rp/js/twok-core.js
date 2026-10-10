// ============================================================
// 2K draft classes: turns a BYTHERIM draft class into NBA 2K MyNBA
// builds, for the RP admin page (admin only).
//
// 2K can't import a class from a file, so this is the sheet the class is
// typed in from: for every prospect a rookie overall, potential, every
// attribute, the main tendencies and his body, plus a few lines of lore.
//
//   Overall      set by draft slot, the way 2K grades rookies: the top
//                three picks around 79-77, the rest of the top ten 76-72,
//                the rest of the first round 75-70, then down through the
//                second round. A prospect the sim rates well above (or
//                below) his slot moves a couple of points, so a steal
//                still reads as one.
//   Attributes   each one starts from where a rookie of that overall and
//                position sits, then moves with what he's good and bad at:
//                his college numbers, his high school / AAU / FIBA lines,
//                the combine (shooting drills, length) and the scouting
//                report. Then the whole set is re-centred so the ones that
//                matter for his position average out to his overall:
//                strengths stand out, weaknesses show, the curve holds.
//   Athleticism  speed, agility, strength and vertical from the combine
//                (sprint, lane agility and shuttle, bench, verticals), or
//                his athletic profile when he skipped testing.
//   Tendencies   how he plays rather than how well: shot diet, drives,
//                post-ups, passing, gambling for steals, fouling.
//
// 2K works out the overall from the attributes itself, so once a build is
// typed in, a point or two of tuning may be needed to land on the target.
// ============================================================
(function (root) {
  const num = (v, d = null) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const has = (text, ...words) => words.some(w => text.includes(w));

  function group(pos) {
    const p = String(pos || '').toUpperCase();
    if (['PG', 'SG', 'G', 'CG'].includes(p)) return 'guard';
    if (['PF', 'C', 'F/C'].includes(p)) return 'big';
    return 'wing';
  }
  const GI = { guard: 0, wing: 1, big: 2 };

  function inches(ht) {
    if (typeof ht === 'number') return ht;
    const m = String(ht || '').match(/(\d+)\s*['’-]\s*(\d+(?:\.\d+)?)?/);
    return m ? parseInt(m[1], 10) * 12 + parseFloat(m[2] || '0') : null;
  }
  function fmtHt(v) {
    if (v == null) return '';
    const r = Math.round(v);
    return `${Math.floor(r / 12)}'${r % 12}"`;
  }

  // ---------- the rookie overall curve ----------

  // [pick, overall] anchors; between them the curve runs straight.
  const CURVE = [[1, 79], [2, 78], [3, 77], [4, 76], [7, 74.5], [10, 73], [14, 72.5], [20, 71.5], [30, 70],
    [31, 69.5], [45, 67], [60, 65], [61, 64], [80, 61], [120, 58]];
  function curveFor(pick) {
    const k = Math.max(1, pick || 61);
    for (let i = 1; i < CURVE.length; i++) {
      const [p1, o1] = CURVE[i - 1], [p2, o2] = CURVE[i];
      if (k <= p2) return o1 + (o2 - o1) * (k - p1) / Math.max(1, p2 - p1);
    }
    return CURVE[CURVE.length - 1][1];
  }

  // ---------- reading a prospect ----------

  // Typical draft prospect, per 40 minutes, by position group
  // [guard, wing, big]: [mean, sd].
  const NORM = {
    pts40: [[20, 5], [19, 5], [18, 5]],
    ast40: [[5.4, 2], [3, 1.4], [2, 1.1]],
    orb: [[3, 1.6], [5.2, 2], [10, 3]],
    drb: [[11, 3], [14, 3.5], [20, 4]],
    stl40: [[2, 0.6], [1.8, 0.6], [1.4, 0.55]],
    blk40: [[0.5, 0.4], [1.1, 0.7], [2.7, 1.2]],
    tovPct: [[15, 4], [14, 4], [14, 4.5]],
    astPct: [[24, 8], [14, 5], [10, 5]],
    usg: [[23, 4], [22, 4], [21, 4]],
    tpa40: [[6.5, 2.6], [5.5, 2.6], [1.6, 1.8]],
    twoPct: [[0.51, 0.055], [0.53, 0.055], [0.585, 0.06]],
    ftr: [[0.33, 0.12], [0.35, 0.12], [0.42, 0.14]],
    ts: [[0.56, 0.045], [0.57, 0.045], [0.6, 0.05]],
    pf40: [[2.8, 0.9], [3, 0.9], [3.8, 1]],
    dbpm: [[1.5, 1.6], [2, 1.6], [3, 1.8]],
    bpm: [[5, 3], [5, 3], [6, 3]]
  };
  const z = (key, g, v) => {
    if (v == null) return null;
    const [m, sd] = NORM[key][GI[g]];
    return clamp((v - m) / sd, -2.6, 2.6);
  };
  // Shooting percentages shrink toward average until there are enough tries.
  const shrunkPct = (pct, att, prior, k) => (pct == null || !att ? null : (pct * att + prior * k) / (att + k));

  // A college season line -> rates.
  function collegeRates(st) {
    if (!st) return null;
    const gp = num(st.gp, 0), mpg = num(st.mpg, 0);
    if (!(gp > 0 && mpg > 0)) return null;
    const per40 = v => (num(v) == null ? null : num(v) / mpg * 40);
    const pct = v => { const n = num(v); return n == null ? null : n > 1 ? n / 100 : n; };
    return {
      minutes: gp * mpg, gp, mpg,
      pts40: per40(st.ppg), ast40: per40(st.apg), stl40: per40(st.stl), blk40: per40(st.blk), pf40: per40(st.pf),
      tpa40: per40(st.threePa), tpa: num(st.threePa, 0) * gp, fta: num(st.fta, 0) * gp,
      tpPct: pct(st.threePPct), ftPct: pct(st.ftPct), twoPct: pct(st.twoPPct), ts: pct(st.tsPct),
      orb: num(st.orebPct), drb: num(st.drebPct), astPct: num(st.astPct), tovPct: num(st.tovPct), usg: num(st.usg),
      ftr: pct(st.ftr), tpar: pct(st.threePar), bpm: num(st.bpm), dbpm: num(st.dbpm), obpm: num(st.obpm)
    };
  }

  // High school, AAU and FIBA lines (SummerCore order), blended.
  const WRITTEN_KEYS = ['gp', 'mpg', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg', 'fg2', 'fg3', 'ft', 'fga2', 'fga3', 'fta'];
  const LEVEL_WEIGHT = { aau: 1, fiba: 0.9, hs: 0.55 };
  function writtenRates(written) {
    if (!written) return null;
    let w = 0;
    const acc = {};
    const add = (k, v, wt) => { if (v == null || isNaN(v)) return; acc[k] = acc[k] || [0, 0]; acc[k][0] += v * wt; acc[k][1] += wt; };
    Object.entries(written).forEach(([lvl, arr]) => {
      if (!Array.isArray(arr)) return;
      const o = {};
      WRITTEN_KEYS.forEach((k, i) => { o[k] = arr[i] == null ? null : Number(arr[i]); });
      if (!(o.gp > 0 && o.mpg > 0)) return;
      const wt = (LEVEL_WEIGHT[lvl] || 0.5) * Math.min(1, o.gp / 15);
      const per40 = v => (v == null ? null : v / o.mpg * 40);
      // Volume runs higher against younger players; percentages are taken as written.
      add('pts40', per40(o.ppg) && per40(o.ppg) * 0.82, wt);
      add('ast40', per40(o.apg) && per40(o.apg) * 0.85, wt);
      add('stl40', per40(o.spg) && per40(o.spg) * 0.8, wt);
      add('blk40', per40(o.bpg) && per40(o.bpg) * 0.8, wt);
      add('tpa40', per40(o.fga3), wt);
      if (o.fg3 != null && o.fga3 > 0.5) add('tpPct', o.fg3 / 100, wt * Math.min(1, o.fga3 / 3));
      if (o.ft != null && o.fta > 0.5) add('ftPct', o.ft / 100, wt * Math.min(1, o.fta / 3));
      if (o.fg2 != null && o.fga2 > 1) add('twoPct', o.fg2 / 100 - 0.03, wt);
      const fga = (o.fga2 || 0) + (o.fga3 || 0);
      if (fga > 0) { add('ftr', (o.fta || 0) / fga, wt); add('tpar', (o.fga3 || 0) / fga, wt); }
      if (o.topg != null && o.apg != null) add('atr', (o.apg + 0.2) / (o.topg + 0.4), wt);
      w += wt;
    });
    if (!w) return null;
    const out = { weight: w };
    Object.keys(acc).forEach(k => { out[k] = acc[k][0] / acc[k][1]; });
    return out;
  }

  // Everything written about him, lower-cased.
  function scoutText(f) {
    const s = f.scout || {};
    const t = f.traits || {};
    return {
      all: [f.attributes, s.scouting, s.strengths, ...(t.strengths || [])].filter(Boolean).join(' | ').toLowerCase(),
      weak: [s.weaknesses, ...(t.weaknesses || [])].filter(Boolean).join(' | ').toLowerCase()
    };
  }

  // The skills, as z-scores against typical draft prospects at his
  // position (0 = typical, +1 = clearly good, +2 = elite, -1 = a weakness).
  function readSkills(f) {
    const g = group(f.pos);
    const cur = collegeRates(f.stats);
    // A short final season leans on the one before it.
    let col = cur;
    if ((!cur || cur.minutes < 300) && (f.seasons || []).length) {
      const prev = collegeRates((f.seasons[f.seasons.length - 1] || {}).stats);
      if (prev && (!cur || prev.minutes > cur.minutes)) col = prev;
    }
    const pre = writtenRates(f.written);
    // How much the college numbers count against the pre-college ones.
    const wc = col ? Math.min(1, col.minutes / 700) : 0;
    const wp = pre ? (wc >= 1 ? 0.3 : 0.6) * Math.min(1, pre.weight) : 0;
    const blend = (key, cv, pv) => {
      const a = cv == null ? null : z(key, g, cv), b = pv == null ? null : z(key, g, pv);
      if (a == null && b == null) return 0;
      if (a == null) return b * Math.min(1, wp + 0.25);
      if (b == null) return a * Math.max(0.35, wc);
      return (a * wc + b * wp) / Math.max(0.0001, wc + wp) * Math.min(1, wc + wp + 0.2);
    };
    const c = col || {}, p = pre || {};

    // Shooting with the attempts behind it.
    const tp = shrunkPct(c.tpPct, c.tpa, 0.33, 70);
    const ft = shrunkPct(c.ftPct, c.fta, 0.70, 50);
    const tpZ = (v, prior) => (v == null ? null : clamp((v - prior) / 0.045, -2.6, 2.6));
    const ftZ = v => (v == null ? null : clamp((v - 0.72) / 0.075, -2.6, 2.6));
    const mix = (a, wa, b, wb) => (a == null && b == null ? 0 : a == null ? b * 0.8 : b == null ? a : (a * wa + b * wb) / (wa + wb));
    let three = mix(tpZ(tp, 0.34), wc + 0.2, tpZ(p.tpPct, 0.34), wp);
    let freeT = mix(ftZ(ft), wc + 0.2, ftZ(p.ftPct), wp);
    const vol3 = blend('tpa40', c.tpa40, p.tpa40);

    // Combine: percentile within his position group -> z.
    const pd = f.predraft || {};
    const pct = pd.pct || {};
    const pz = k => (pct[k] == null ? null : clamp((pct[k] - 50) / 30, -1.7, 1.7));
    const prof = pd.profile || null;
    const athGrade = num(f.athleticism);
    const base = athGrade != null ? (athGrade - 75) / 10 : 0;
    const pfz = k => (prof && prof[k] != null ? clamp((prof[k] - 58) / 14, -2.4, 2.4) : base);
    const avgz = (...vals) => { const v = vals.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const ath = {
      speed: avgz(pz('sprint'), pfz('speed')) ?? 0,
      agility: avgz(pz('lane'), pz('shuttle'), pfz('agility')) ?? 0,
      strength: avgz(pz('bench'), pfz('strength')) ?? 0,
      vertical: avgz(pz('maxVert'), pz('standVert'), pfz('explosive')) ?? 0,
      motor: pfz('motor') === base && !prof ? 0 : pfz('motor'),
      length: avgz(pz('ape'), pz('reach')) ?? 0
    };
    const drills = pz('shooting');
    if (drills != null) { three = three * 0.8 + drills * 0.35; freeT = freeT * 0.9 + drills * 0.15; }

    // His real shooting, as percentages: college attempts, then his high
    // school / AAU / FIBA lines counted as so many attempts, then a prior
    // that a small sample can't outweigh. 2K's shooting ratings are read
    // straight off these (see attributes).
    const pw = pre ? Math.min(1, pre.weight) : 0;
    const est = (cp, ca, pp, pa, prior, k) => {
      const a = cp != null ? (ca || 0) : 0, b = pp != null ? pa : 0;
      return ((cp || 0) * a + (pp || 0) * b + prior * k) / (a + b + k);
    };
    let tpEst = est(c.tpPct, c.tpa, p.tpPct, 90 * pw, 0.33, 45);
    let ftEst = est(c.ftPct, c.fta, p.ftPct, 70 * pw, 0.70, 30);
    const tpa40Est = c.tpa40 != null && (c.minutes || 0) >= 300 ? c.tpa40
      : c.tpa40 != null && p.tpa40 != null ? (c.tpa40 * wc + p.tpa40 * (1 - wc)) : (c.tpa40 ?? p.tpa40 ?? { guard: 6, wing: 5, big: 1.2 }[g]);
    if (drills != null) { tpEst += drills * 0.008; ftEst += drills * 0.005; }

    const S = {
      pts: blend('pts40', c.pts40, p.pts40),
      ast: blend('ast40', c.ast40, p.ast40),
      astPct: c.astPct != null ? z('astPct', g, c.astPct) * Math.max(0.35, wc) : blend('ast40', null, p.ast40),
      tov: c.tovPct != null ? -z('tovPct', g, c.tovPct) * Math.max(0.35, wc) : (p.atr != null ? clamp((p.atr - 1.4) / 0.6, -2, 2) * 0.6 : 0),
      usg: c.usg != null ? z('usg', g, c.usg) * Math.max(0.4, wc) : blend('pts40', null, p.pts40),
      orb: c.orb != null ? z('orb', g, c.orb) * Math.max(0.35, wc) : 0,
      drb: c.drb != null ? z('drb', g, c.drb) * Math.max(0.35, wc) : 0,
      stl: blend('stl40', c.stl40, p.stl40),
      blk: blend('blk40', c.blk40, p.blk40),
      two: blend('twoPct', c.twoPct, p.twoPct),
      ftr: blend('ftr', c.ftr, p.ftr),
      ts: c.ts != null ? z('ts', g, c.ts) * Math.max(0.35, wc) : 0,
      pf: c.pf40 != null ? z('pf40', g, c.pf40) * Math.max(0.35, wc) : 0,
      dbpm: c.dbpm != null ? z('dbpm', g, c.dbpm) * Math.max(0.35, wc) : 0,
      bpm: c.bpm != null ? z('bpm', g, c.bpm) * Math.max(0.35, wc) : 0,
      three, ft: freeT, vol3, tpEst, ftEst, tpa40Est,
      tpar: c.tpar != null ? c.tpar : p.tpar != null ? p.tpar : null,
      ftrRaw: c.ftr != null ? c.ftr : p.ftr != null ? p.ftr : null,
      ...ath
    };

    // The scouting report and his playstyle nudge the numbers.
    const T = scoutText(f);
    if (has(T.all, 'shooter', 'shooting', 'jumper', 'range', 'catch and shoot', 'catch-and-shoot', 'sniper', 'stroke')) S.tpEst += 0.012;
    if (has(T.weak, 'shooting', 'jumper', 'jump shot', 'range', 'perimeter shot')) S.tpEst -= 0.015;
    const nudge = (k, v) => { S[k] = clamp((S[k] || 0) + v, -2.8, 2.8); };
    const said = (k, v, ...w) => { if (has(T.all, ...w)) nudge(k, v); };
    const doubt = (k, v, ...w) => { if (has(T.weak, ...w)) nudge(k, -v); };
    said('three', 0.5, 'shooter', 'shooting', 'jumper', 'range', 'catch and shoot', 'catch-and-shoot', 'sniper', 'stroke');
    doubt('three', 0.6, 'shooting', 'jumper', 'shot', 'range', 'perimeter');
    said('handle', 0.6, 'handle', 'ball handl', 'dribble', 'shake', 'creator', 'shot creat');
    doubt('handle', 0.6, 'handle', 'ball handl', 'dribble', 'turnover');
    said('ast', 0.5, 'playmak', 'passer', 'passing', 'vision', 'court sense', 'feel');
    doubt('ast', 0.4, 'decision', 'passing', 'turnover');
    said('finish', 0.6, 'finish', 'finisher', 'rim', 'paint', 'touch around', 'attack', 'downhill', 'slash');
    doubt('finish', 0.5, 'finishing', 'finish');
    said('post', 0.7, 'post', 'back to the basket', 'footwork', 'low block');
    said('perD', 0.6, 'defender', 'defense', 'defensive', 'point of attack', 'on-ball', 'lockdown', 'switch');
    doubt('perD', 0.6, 'defense', 'defensive', 'defender', 'lateral');
    said('rimP', 0.6, 'rim protect', 'shot block', 'shot-block', 'anchor', 'deterr');
    said('reb', 0.5, 'rebound', 'glass', 'boards');
    doubt('reb', 0.5, 'rebound');
    said('iq', 0.5, ' iq', 'smart', 'cerebral', 'feel for the game', 'high iq', 'instinct');
    doubt('iq', 0.4, ' iq', 'decision', 'feel');
    said('vertical', 0.4, 'athletic', 'explosive', 'bouncy', 'above the rim', 'leaper');
    // Strength swings hard: the report's word on physicality decides it.
    said('strength', 0.8, 'strong', 'physical', 'powerful', 'wide frame', 'bruising', 'plays through contact');
    doubt('strength', 0.9, 'strength', 'physicality', 'frame', 'thin', 'frail', 'skinny', 'weak', 'contact', 'pushed around');
    if (has(T.all, 'thin', 'skinny', 'frail', 'slight', 'wiry')) nudge('strength', -0.6);
    said('dunk', 0.6, 'dunk', 'lob', 'above the rim', 'explosive', 'high flyer', 'posterize', 'vertical');
    doubt('dunk', 0.5, 'below the rim', 'explosive', 'athleticism', 'vertical');
    said('motor', 0.5, 'motor', 'relentless', 'energy', 'hustle', 'tough');
    doubt('motor', 0.5, 'motor', 'effort', 'conditioning');

    const ARCH = {
      shooter: { three: 0.4, vol3: 0.3 }, slasher: { finish: 0.4, ftr: 0.3 }, playmaker: { ast: 0.35, handle: 0.4 },
      postHub: { post: 0.7 }, rollBig: { finish: 0.35, vertical: 0.2 }, defender: { perD: 0.4, iq: 0.2 },
      primaryScorer: { handle: 0.3, pts: 0.2 }, connector: { iq: 0.35, ast: 0.2 }
    }[f.archetype] || {};
    Object.entries(ARCH).forEach(([k, v]) => nudge(k, v));
    ['handle', 'finish', 'post', 'perD', 'rimP', 'reb', 'iq', 'dunk'].forEach(k => { if (S[k] == null) S[k] = 0; });
    if (f.archetype === 'rollBig') S.dunk += 0.4;
    if (f.archetype === 'slasher') S.dunk += 0.2;
    // Finishing and dunking as single reads (+0.8 and up = good at it).
    S.fin = clamp(0.45 * S.two + 0.25 * S.ftr + 0.45 * S.finish + 0.1 * S.ts, -2.6, 2.6);
    S.dunker = clamp(0.65 * S.vertical + 0.2 * S.ftr + 0.15 * S.finish + 0.6 * S.dunk, -2.6, 2.6);
    return { S, g, sample: { college: wc, pre: wp, combine: !!(pd.tests || pd.pct), measured: !!pd.meas } };
  }

  // ---------- attributes ----------

  // [name, group, relevance at guard / wing / big] — 1 matters for his
  // position, 0.5 somewhat, 0 hardly.
  const ATTRS = [
    ['Close Shot', 'Inside Scoring', [1, 1, 1]],
    ['Driving Layup', 'Inside Scoring', [1, 1, 0.5]],
    ['Driving Dunk', 'Inside Scoring', [0.5, 1, 0.5]],
    ['Standing Dunk', 'Inside Scoring', [0, 0.5, 1]],
    ['Post Control', 'Inside Scoring', [0, 0.5, 1]],
    ['Post Hook', 'Inside Scoring', [0, 0, 1]],
    ['Post Fade', 'Inside Scoring', [0, 0.5, 0.5]],
    ['Draw Foul', 'Inside Scoring', [0.5, 0.5, 0.5]],
    ['Hands', 'Inside Scoring', [0.5, 0.5, 0.5]],
    ['Mid-Range Shot', 'Outside Scoring', [1, 1, 0.5]],
    ['Three-Point Shot', 'Outside Scoring', [1, 1, 0]],
    ['Free Throw', 'Outside Scoring', [1, 1, 0.5]],
    ['Shot IQ', 'Outside Scoring', [1, 1, 1]],
    ['Offensive Consistency', 'Outside Scoring', [1, 1, 1]],
    ['Pass Accuracy', 'Playmaking', [1, 0.5, 0]],
    ['Ball Handle', 'Playmaking', [1, 0.5, 0]],
    ['Speed with Ball', 'Playmaking', [1, 0.5, 0]],
    ['Pass IQ', 'Playmaking', [1, 0.5, 0.5]],
    ['Pass Vision', 'Playmaking', [1, 0.5, 0]],
    ['Interior Defense', 'Defense', [0, 0.5, 1]],
    ['Perimeter Defense', 'Defense', [1, 1, 0]],
    ['Steal', 'Defense', [1, 0.5, 0]],
    ['Block', 'Defense', [0, 0.5, 1]],
    ['Help Defense IQ', 'Defense', [0.5, 1, 1]],
    ['Pass Perception', 'Defense', [1, 1, 0.5]],
    ['Defensive Consistency', 'Defense', [1, 1, 1]],
    ['Offensive Rebound', 'Rebounding', [0, 0.5, 1]],
    ['Defensive Rebound', 'Rebounding', [0.5, 0.5, 1]]
  ];
  // Read on 2K's own scale from his numbers rather than re-centred.
  const ANCHORED = ['Three-Point Shot', 'Free Throw', 'Mid-Range Shot', 'Driving Layup', 'Close Shot', 'Driving Dunk', 'Standing Dunk'];
  const ATHLETIC = ['Speed', 'Agility', 'Strength', 'Vertical', 'Stamina', 'Hustle', 'Overall Durability'];
  const GROUPS = ['Outside Scoring', 'Inside Scoring', 'Playmaking', 'Defense', 'Rebounding', 'Athleticism'];

  // Each attribute's skill score from the reads above.
  function skillFor(name, S, g, htZ) {
    const big = g === 'big';
    switch (name) {
      case 'Close Shot': return 0.5 * S.two + 0.25 * S.finish + 0.2 * S.ts + (big ? 0.2 : 0);
      case 'Driving Layup': return 0.4 * S.two + 0.3 * S.ftr + 0.3 * S.finish + 0.2 * S.agility;
      case 'Driving Dunk': return 0.45 * S.vertical + 0.25 * S.speed + 0.25 * S.ftr + 0.2 * S.finish;
      case 'Standing Dunk': return 0.4 * htZ + 0.35 * S.vertical + 0.25 * S.strength + 0.2 * S.orb;
      case 'Post Control': return 0.55 * S.post + 0.25 * S.strength + 0.2 * S.usg + 0.15 * S.two;
      case 'Post Hook': return 0.55 * S.post + 0.3 * S.two + 0.15 * S.ft;
      case 'Post Fade': return 0.45 * S.post + 0.35 * S.ft + 0.2 * S.three;
      case 'Draw Foul': return 0.75 * S.ftr + 0.2 * S.strength + 0.1 * S.usg;
      case 'Hands': return 0.5 * S.tov + 0.3 * S.iq + 0.2 * S.orb;
      case 'Mid-Range Shot': return 0.45 * S.ft + 0.4 * S.three + 0.15 * S.two;
      case 'Three-Point Shot': return 0.85 * S.three + 0.15 * S.vol3;
      case 'Free Throw': return S.ft;
      case 'Shot IQ': return 0.6 * S.ts + 0.25 * S.iq + 0.15 * S.tov;
      case 'Offensive Consistency': return 0.35 * S.ts + 0.35 * S.bpm + 0.3 * S.pts;
      case 'Pass Accuracy': return 0.5 * S.astPct + 0.35 * S.tov + 0.15 * S.iq;
      case 'Ball Handle': return 0.35 * S.handle + 0.25 * S.usg + 0.2 * S.astPct + 0.2 * S.tov + 0.15 * S.agility;
      case 'Speed with Ball': return 0.45 * S.speed + 0.4 * S.handle + 0.15 * S.agility;
      case 'Pass IQ': return 0.4 * S.astPct + 0.35 * S.tov + 0.25 * S.iq;
      case 'Pass Vision': return 0.6 * S.astPct + 0.25 * S.ast + 0.15 * S.iq;
      case 'Interior Defense': return 0.35 * S.blk + 0.25 * S.strength + 0.25 * S.dbpm + 0.2 * htZ + 0.2 * S.rimP;
      case 'Perimeter Defense': return 0.3 * S.agility + 0.25 * S.stl + 0.25 * S.dbpm + 0.2 * S.length + 0.3 * S.perD;
      case 'Steal': return 0.75 * S.stl + 0.2 * S.length + 0.1 * S.agility;
      case 'Block': return 0.65 * S.blk + 0.2 * S.length + 0.2 * S.vertical + 0.15 * S.rimP;
      case 'Help Defense IQ': return 0.45 * S.dbpm + 0.2 * S.blk + 0.2 * S.stl + 0.2 * S.iq;
      case 'Pass Perception': return 0.6 * S.stl + 0.2 * S.dbpm + 0.2 * S.iq;
      case 'Defensive Consistency': return 0.55 * S.dbpm + 0.3 * S.motor + 0.15 * S.perD;
      case 'Offensive Rebound': return 0.75 * S.orb + 0.2 * S.motor + 0.15 * S.reb;
      case 'Defensive Rebound': return 0.75 * S.drb + 0.15 * S.reb + 0.1 * S.strength;
      default: return 0;
    }
  }

  const BASE = { 1: -3, 0.5: -11, 0: -24 };     // where a rookie of overall X sits, by relevance
  function attributes(f, ovr, read) {
    const { S, g } = read;
    const meas = (f.predraft && f.predraft.meas) || {};
    const ht = meas.barefoot || inches(f.ht);
    const HT_MEAN = { guard: 75.5, wing: 78.5, big: 81.5 }[g];
    const htZ = ht ? clamp((ht - HT_MEAN) / 1.8, -2.5, 2.5) : 0;
    const cap = Math.min(94, ovr + 15);
    const raw = {};
    const zs = {};
    ATTRS.forEach(([name, , rel]) => {
      const r = rel[GI[g]];
      const s = clamp(skillFor(name, S, g, htZ), -2.6, 2.6);
      zs[name] = { z: s, r };
      const spread = r === 1 ? 8 : r === 0.5 ? 7.5 : (s > 0 ? 11 : 5);
      raw[name] = { v: ovr + BASE[r] + spread * s, r };
    });
    // Re-centre: what matters for his position averages out near his overall.
    // Shooting, finishing and dunking are read on 2K's own scale below, so
    // they don't move with the rest.
    const core = Object.entries(raw).filter(([k, x]) => x.r === 1 && !ANCHORED.includes(k)).map(([, x]) => x);
    const mean = core.reduce((a, x) => a + x.v, 0) / core.length;
    const shift = clamp(ovr - 2 - mean, -7, 7);
    const out = {};
    Object.entries(raw).forEach(([k, x]) => { out[k] = Math.round(clamp(x.v + shift, 25, cap)); });

    // Shooting on 2K's scale: a 35% three-point shooter on normal volume
    // is about a 74, 40% on volume about an 84, a poor shooter under 70.
    // Little volume means little proof: a big who rarely shoots one is
    // read mostly off his free throws and stays under 70.
    const lift = (ovr - 72) * 0.25;
    const vol = clamp((S.tpa40Est - 5) * 0.6, -3, 2.5);
    let three = 74 + (S.tpEst - 0.35) * 200 + vol + lift;
    const ftRating = 70 + (S.ftEst - 0.70) * 120 + lift * 0.5;
    if (S.tpa40Est < 2) three = Math.min(70, three * 0.5 + (45 + (S.ftEst - 0.65) * 90) * 0.5);
    out['Three-Point Shot'] = Math.round(clamp(three, 30, 92));
    out['Free Throw'] = Math.round(clamp(ftRating, 30, 92));
    out['Mid-Range Shot'] = Math.round(clamp(S.tpa40Est < 2 ? 0.3 * three + 0.7 * ftRating - 3 + 2 * S.two : 0.5 * three + 0.5 * ftRating + 2 * S.two, 35, 90));

    // Finishing: a good finisher is over 82 at the rim, on layups or
    // close shots (bigs finish with close shots, everyone else on the move).
    const finAdj = { guard: [2, -2], wing: [2, 0], big: [-6, 6] }[g];
    let layup = 70 + 7 * S.fin + finAdj[0] + lift;
    let close = 70 + 7 * S.fin + finAdj[1] + lift;
    if (S.fin >= 0.8) {
      const floor = 82 + (S.fin - 0.8) * 5;
      if (g === 'big') { close = Math.max(close, floor); layup = Math.max(layup, floor - 6); }
      else { layup = Math.max(layup, floor); close = Math.max(close, floor - 4); }
    }
    out['Driving Layup'] = Math.round(clamp(layup, 35, 95));
    out['Close Shot'] = Math.round(clamp(close, 35, 95));

    // Dunking: a good dunker is always over 82.
    let ddunk = 62 + 12 * S.dunker + { guard: -4, wing: 0, big: -2 }[g] + lift;
    let sdunk = g === 'big' ? 62 + 10 * S.dunker + 6 * htZ + 4 * S.strength + lift
      : g === 'wing' ? 48 + 9 * S.dunker + 4 * htZ : 32 + 8 * S.dunker;
    if (S.dunker >= 0.8) {
      const floor = 82 + (S.dunker - 0.8) * 5;
      ddunk = Math.max(ddunk, floor);
      if (g === 'big') sdunk = Math.max(sdunk, floor);
    }
    out['Driving Dunk'] = Math.round(clamp(ddunk, 25, 95));
    out['Standing Dunk'] = Math.round(clamp(sdunk, 25, 95));

    // Athleticism: the combine, with position behind it. Speed and agility
    // sit near the middle of 2K's scale for a typical rookie at his
    // position; only real burst gets a guard into the 80s.
    const A = { guard: [8, 9, -6, 3], wing: [3, 5, 0, 4], big: [-8, -8, 8, -3] }[g];
    out['Speed'] = Math.round(clamp(59 + A[0] + 9 * S.speed + lift, 30, 92));
    out['Agility'] = Math.round(clamp(60 + A[1] + 9 * S.agility + lift, 30, 92));
    // Strength swings widely: a player who struggles with physicality is
    // under 45, a genuinely strong one over 70.
    let str = 55 + A[2] + 15 * S.strength + (g === 'big' ? 2 * htZ : 0);
    if (S.strength <= -0.8) str = Math.min(str, 44 + (S.strength + 0.8) * 5);
    if (S.strength >= 0.8) str = Math.max(str, 71 + (S.strength - 0.8) * 5);
    out['Strength'] = Math.round(clamp(str, 25, 92));
    out['Vertical'] = Math.round(clamp(62 + A[3] + 11 * S.vertical + lift * 1.6, 30, 95));
    const mpg = num(f.stats && f.stats.mpg, 24);
    out['Stamina'] = Math.round(clamp(76 + 4 * S.motor + (mpg - 28) * 0.4, 60, 95));
    out['Hustle'] = Math.round(clamp(62 + 9 * S.motor + 3 * S.orb + 2 * S.dbpm, 35, 95));
    out['Overall Durability'] = 85;
    return { attrs: out, zs };
  }

  // ---------- tendencies ----------

  function tendencies(f, read, attrs) {
    const { S, g } = read;
    const t = v => Math.round(clamp(v, 0, 100));
    const tpar = S.tpar != null ? S.tpar : { guard: 0.42, wing: 0.38, big: 0.12 }[g];
    const ftr = S.ftrRaw != null ? S.ftrRaw : 0.33;
    const big = g === 'big', guard = g === 'guard';
    const shooter = f.archetype === 'shooter';
    return {
      'Shot': t(50 + 13 * S.usg + 4 * S.pts),
      'Shot Three': t(tpar * 150 + 6 * S.three),
      'Spot-Up Three (vs. off the dribble)': t(55 + (shooter ? 18 : 0) - 10 * S.usg + 8 * S.three),
      'Shot Mid-Range': t(30 + (1 - tpar - Math.min(0.5, ftr) * 0.6) * 45 + 6 * (attrs['Mid-Range Shot'] - 70) / 8),
      'Shot Close': t((1 - tpar) * 55 + (big ? 20 : 0) + 5 * S.two),
      'Drive': t((big ? 15 : 35) + ftr * 60 + 8 * S.speed + 6 * S.handle + (f.archetype === 'slasher' ? 15 : 0) - (shooter ? 10 : 0)),
      'Driving Layup': t(60 + 6 * S.finish - 5 * S.vertical),
      'Driving Dunk': t(25 + 14 * S.vertical + (big ? 10 : 0) + 6 * S.strength),
      'Standing Dunk': t(big ? 55 + 10 * S.vertical + 6 * S.strength : 15 + 6 * S.vertical),
      'Post Up': t((big ? 30 : g === 'wing' ? 12 : 5) + 22 * Math.max(0, S.post) + (f.archetype === 'postHub' ? 25 : 0)),
      'Roll vs. Pop (big men)': big ? t(70 - tpar * 160 + 8 * S.vertical) : null,
      'Pass (dish to the open man)': t(40 + 14 * S.astPct + (guard ? 10 : 0)),
      'Flashy Pass': t(20 + 12 * S.astPct + 6 * S.usg - 6 * S.tov),
      'Steal (on-ball reach)': t(40 + 14 * S.stl),
      'Pass Interception': t(40 + 13 * S.stl + 4 * S.iq),
      'Block Shot': t(35 + 16 * S.blk + (big ? 15 : 0)),
      'Foul': t(45 + 14 * S.pf),
      'Contest Shot': t(60 + 7 * S.dbpm + 5 * S.motor),
      'Crash the Offensive Glass': t(30 + 18 * S.orb + (big ? 15 : 0)),
      'Run in Transition': t(45 + 10 * S.speed + 5 * S.motor - (big ? 8 : 0))
    };
  }

  // ---------- body, position, labels ----------

  const SECOND = { PG: 'SG', SG: 'PG', SF: 'SG', PF: 'C', C: 'PF', G: 'SG', W: 'SF', F: 'PF', 'G/F': 'SF', 'F/C': 'C' };
  function body(f, draftYear) {
    const meas = (f.predraft && f.predraft.meas) || {};
    const listed = inches(f.ht);
    const g = group(f.pos);
    const ht = meas.barefoot || (listed ? listed - 0.75 : null);
    const span = meas.wingspan || inches(f.wingspan) || (ht ? ht + { guard: 3.2, wing: 3.8, big: 4.3 }[g] : null);
    let age = null, ageEstimated = false;
    if (f.dob && draftYear) {
      const d = new Date(f.dob), night = new Date(`${draftYear}-06-25T00:00:00Z`);
      if (!isNaN(d)) age = +((night - d) / (365.25 * 864e5)).toFixed(1);
    }
    // No birthday on file: a high school class graduates at about 18.3,
    // and each college class is a year on from that.
    if (age == null && draftYear) {
      const hs = num(f.recClassYear);
      if (hs && draftYear - hs >= 0 && draftYear - hs <= 6) age = +(18.3 + (draftYear - hs)).toFixed(1);
      else {
        const byClass = { FR: 19.3, SO: 20.3, JR: 21.3, SR: 22.3, GR: 23.1 }[String(f.class || '').toUpperCase()];
        if (byClass) age = byClass;
        else if (f.isPro) age = 19.8 + Math.min(3, num(f.proYears, 1)) * 0.6;
      }
      ageEstimated = age != null;
    }
    return {
      height: ht ? Math.round(ht) : null, heightLabel: ht ? fmtHt(ht) : '',
      barefoot: meas.barefoot || null, shoes: meas.shoes || null,
      weight: Math.round(meas.weight || num(f.wt, { guard: 190, wing: 210, big: 235 }[g])),
      wingspan: span ? Math.round(span) : null, wingspanLabel: span ? fmtHt(span) : '',
      age, ageEstimated, pos: String(f.pos || '').toUpperCase(), pos2: String(f.pos2 || SECOND[String(f.pos || '').toUpperCase()] || '').toUpperCase(),
      hand: meas.handLength ? `${meas.handLength}" long, ${meas.handWidth}" wide` : ''
    };
  }

  function catScore(a, names) { return names.reduce((s, n) => s + a[n], 0) / names.length; }
  // The build is named for what stands out against a typical rookie at
  // his position, not for the attributes every player there has high.
  // A skill his position rarely leans on (a big's jumper, a guard's post
  // game) only counts when it's clearly a strength.
  const ELIGIBLE = {
    guard: { shooting: 0, finishing: 0, playmaking: 0, perimeterD: 0 },
    wing: { shooting: 0, finishing: 0, playmaking: 0.6, perimeterD: 0, inside: 0.8, post: 1 },
    big: { inside: 0, post: 0, finishing: 0, shooting: 0.9, playmaking: 0.9, perimeterD: 1 }
  };
  function buildLabel(zs, g) {
    const a = {};
    Object.entries(zs).forEach(([n, x]) => { a[n] = x.z; });
    const all = {
      shooting: catScore(a, ['Three-Point Shot', 'Mid-Range Shot']),
      finishing: catScore(a, ['Driving Layup', 'Driving Dunk', 'Close Shot']),
      playmaking: catScore(a, ['Ball Handle', 'Pass Accuracy', 'Pass Vision']),
      perimeterD: catScore(a, ['Perimeter Defense', 'Steal']),
      inside: catScore(a, ['Interior Defense', 'Block', 'Defensive Rebound']),
      post: catScore(a, ['Post Control', 'Post Hook'])
    };
    const el = ELIGIBLE[g];
    const c = {};
    Object.entries(all).forEach(([k, v]) => { if (el[k] != null && v >= el[k]) c[k] = v; });
    const top = Object.entries(c).sort((x, y) => y[1] - x[1]).map(x => x[0]);
    if (!top.length) return { guard: 'Combo Guard', wing: 'Two-Way Wing', big: 'Rim-Running Big' }[g];
    if (top.length === 1 || c[top[1]] < 0.15) return { shooting: g === 'big' ? 'Stretch Big' : 'Sharpshooter', finishing: g === 'big' ? 'Rim Runner' : 'Slasher', playmaking: 'Playmaker', perimeterD: 'Perimeter Lockdown', inside: 'Rim Protector', post: 'Post Scorer' }[top[0]];
    const pair = top.slice(0, 2).sort().join('+');
    const L = {
      'playmaking+shooting': g === 'big' ? 'Point Forward Shooter' : 'Shot-Creating Playmaker',
      'perimeterD+shooting': '3-and-D ' + (g === 'guard' ? 'Guard' : 'Wing'),
      'finishing+playmaking': 'Slashing Playmaker',
      'finishing+shooting': 'Three-Level Scorer',
      'finishing+perimeterD': 'Two-Way Slasher',
      'perimeterD+playmaking': 'Defensive Point of Attack',
      'inside+shooting': 'Stretch Big',
      'finishing+inside': g === 'big' ? 'Paint Beast' : 'Athletic Finisher',
      'inside+perimeterD': 'Versatile Defender',
      'inside+post': 'Post Anchor',
      'finishing+post': 'Post Scorer',
      'inside+playmaking': 'Playmaking Big',
      'post+shooting': 'Stretch Post Scorer'
    };
    return L[pair] || ({ shooting: 'Sharpshooter', finishing: 'Slasher', playmaking: 'Playmaker', perimeterD: 'Perimeter Lockdown', inside: 'Rim Protector', post: 'Post Scorer' }[top[0]]);
  }

  // ---------- potential ----------

  const HEADROOM = { 'F': 0, 'D-': 1, 'D': 2, 'D+': 3, 'C-': 4, 'C': 5, 'C+': 6, 'B-': 7, 'B': 9, 'B+': 11, 'A-': 13, 'A': 15, 'A+': 18 };
  function potentialFor(f, ovr, age) {
    let head = f.potential && f.rating ? num(f.potential) - num(f.rating) : null;
    if (head == null && f.potentialGrade && HEADROOM[f.potentialGrade] != null) head = HEADROOM[f.potentialGrade];
    if (head == null) head = 7;
    const youth = age != null ? (20.5 - age) * 1.4 : 0;
    return Math.round(clamp(ovr + 5 + head * 0.55 + youth, ovr + 2, 96));
  }

  // ---------- lore ----------

  function lore(f, entry, b) {
    const st = f.stats || {};
    const parts = [];
    const cls = { FR: 'freshman', SO: 'sophomore', JR: 'junior', SR: 'senior', GR: 'graduate' }[String(f.class || '').toUpperCase()] || '';
    if (f.isPro) parts.push(`${f.name} comes over from ${f.club || 'the pro game overseas'}${f.proYears ? ` after ${f.proYears} pro season${f.proYears > 1 ? 's' : ''}` : ''}.`);
    else parts.push(`${f.name} leaves ${f.school}${cls ? ` as a ${cls}` : ''}${f.rsci ? `, a former No. ${f.rsci} recruit` : ''}.`);
    if (num(st.gp, 0) > 0) {
      const ts = num(st.tsPct);
      parts.push(`Final season: ${st.ppg} points, ${st.rpg} rebounds and ${st.apg} assists a game${ts ? ` on ${(ts > 1 ? ts : ts * 100).toFixed(1)}% true shooting` : ''}${num(st.bpm) != null ? `, ${num(st.bpm) >= 0 ? '+' : ''}${num(st.bpm).toFixed(1)} BPM` : ''}.`);
    }
    const pct = (f.predraft && f.predraft.pct) || {};
    const t = (f.predraft && f.predraft.tests) || {};
    const combine = [];
    if (b.barefoot) combine.push(`${fmtIn(b.barefoot)} barefoot with a ${fmtIn((f.predraft.meas || {}).wingspan)} wingspan`);
    if (pct.maxVert >= 85 && t.maxVert) combine.push(`a ${t.maxVert}" max vertical`);
    if (pct.sprint >= 85 && t.sprint) combine.push(`a ${t.sprint}s sprint`);
    if (pct.shooting >= 85) combine.push('one of the best shooting sessions of the week');
    if (combine.length) parts.push(`At the combine: ${combine.join(', ')}.`);
    if (entry.pick) parts.push(`Taken ${ordinal(entry.pick)} overall${entry.team ? ` by ${entry.team}` : ''}.`);
    else parts.push('Went undrafted.');
    return parts.join(' ');
  }
  function fmtIn(v) {
    if (v == null) return '';
    const ft = Math.floor(v / 12);
    const rest = Math.round((v - ft * 12) * 4) / 4;
    return `${ft}' ${rest % 1 === 0 ? rest : rest.toFixed(2).replace(/0$/, '')}"`;
  }
  const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  // A full player record (or a departed-player archive entry) in the same
  // shape as the file saved on draft night, for drafts held before files
  // were kept.
  function fromPlayer(p) {
    if (!p) return null;
    return {
      ...p,
      archetype: p.archetype || (p.playstyle && p.playstyle.archetype) || null,
      seasons: p.seasons || (p.seasonHistory || []).slice(-4).map(h => ({ year: h.year, school: h.school, class: h.class, stats: h.stats })),
      predraft: p.predraft || null
    };
  }

  // ---------- one prospect, one class ----------

  // entry: { file, pick, round, team } — pick null for the undrafted.
  // expected: the sim rating a prospect at this slot usually has.
  function build(entry, draftYear, expected) {
    const f = entry.file;
    const read = readSkills(f);
    const b = body(f, draftYear);
    const slot = entry.pick || entry.slot || 61;
    // Outliers: a prospect rated well above his slot plays above it.
    const raw = expected != null && num(f.rating) != null ? num(f.rating) - expected : 0;
    // Only a real gap counts: ratings bunch up near the top of a class.
    const gap = Math.sign(raw) * Math.max(0, Math.abs(raw) - 3);
    const youth = b.age != null ? clamp((20 - b.age) * 0.5, -1, 1) : 0;
    const ovr = Math.round(clamp(curveFor(slot) + clamp(gap * 0.3, -2.5, 2.5) + youth * 0.5, 55, 83));
    const { attrs, zs } = attributes(f, ovr, read);
    const tend = tendencies(f, read, attrs);
    // Strengths and weaknesses among what his position actually uses.
    const ranked = Object.entries(zs).filter(([, x]) => x.r > 0).map(([n, x]) => [n, x.z]).sort((x, y) => y[1] - x[1]);
    return {
      id: f.id, name: f.name, school: f.isPro ? (f.club || 'International') : f.school, class: f.class, isPro: !!f.isPro,
      pick: entry.pick || null, round: entry.round || null, team: entry.team || '',
      ovr, pot: potentialFor(f, ovr, b.age), simRating: num(f.rating),
      label: buildLabel(zs, read.g),
      // Which attributes stand out, for colouring: skill z-scores for what
      // his position uses, the athletic reads for athleticism.
      marks: (() => {
        const m = {};
        Object.entries(zs).forEach(([n, x]) => { if (x.r > 0 && !ANCHORED.includes(n) && Math.abs(x.z) >= 0.8) m[n] = x.z > 0 ? 1 : -1; });
        // Shooting, finishing and dunks: by 2K's own marks.
        ANCHORED.forEach(n => { const rel = (ATTRS.find(a => a[0] === n) || [, , [1, 1, 1]])[2][GI[read.g]]; if (rel > 0 && attrs[n] >= 82) m[n] = 1; else if (rel > 0 && attrs[n] < 62) m[n] = -1; });
        const S = read.S;
        [['Speed', S.speed], ['Agility', S.agility], ['Strength', S.strength], ['Vertical', S.vertical], ['Hustle', S.motor]]
          .forEach(([n, v]) => { if (Math.abs(v) >= 0.8) m[n] = v > 0 ? 1 : -1; });
        if (attrs['Strength'] < 45) m['Strength'] = -1; else if (attrs['Strength'] > 70) m['Strength'] = 1;
        return m;
      })(), body: b, attributes: attrs, tendencies: tend,
      strengths: ranked.slice(0, 3).filter(x => x[1] > 0.3).map(x => x[0]),
      weaknesses: ranked.slice(-3).reverse().filter(x => x[1] < -0.3).map(x => x[0]),
      lore: lore(f, entry, b),
      sample: read.sample
    };
  }

  // entries in draft order (picks first, then the undrafted).
  function buildClass(entries, draftYear) {
    const ratings = entries.map(e => num(e.file && e.file.rating)).filter(v => v != null).sort((a, b) => b - a);
    return entries.filter(e => e && e.file).map((e, i) => {
      const slot = e.pick || (i + 1);
      const expected = ratings.length ? ratings[Math.min(ratings.length - 1, slot - 1)] : null;
      return build({ ...e, slot }, draftYear, expected);
    });
  }

  // One row per player for a spreadsheet.
  function csvRows(players) {
    const tendKeys = players.length ? Object.keys(players[0].tendencies) : [];
    const attrKeys = ATTRS.map(a => a[0]).concat(ATHLETIC);
    const header = ['Pick', 'Round', 'Team', 'Name', 'Pos', 'Pos 2', 'Age', 'Height', 'Height (in)', 'Weight', 'Wingspan (in)', 'OVR', 'POT', 'Build',
      'School', 'Class', ...attrKeys, ...tendKeys.map(k => `Tendency: ${k}`), 'Strengths', 'Weaknesses', 'Lore'];
    const rows = players.map(p => [p.pick || 'UDFA', p.round || '', p.team, p.name, p.body.pos, p.body.pos2, p.body.age ?? '', p.body.heightLabel, p.body.height ?? '',
      p.body.weight, p.body.wingspan ?? '', p.ovr, p.pot, p.label, p.school, p.class || '',
      ...attrKeys.map(k => p.attributes[k]), ...tendKeys.map(k => p.tendencies[k] ?? ''), p.strengths.join('; '), p.weaknesses.join('; '), p.lore]);
    return { header, rows };
  }

  const api = { build, buildClass, csvRows, curveFor, readSkills, fromPlayer, ATTRS, ATHLETIC, ANCHORED, GROUPS, group };
  root.TwoK = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
