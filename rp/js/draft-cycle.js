// ============================================================
// The pre-draft cycle: declarations -> combine -> lottery -> workouts
// -> withdrawal deadline -> draft night.
//
// Shared by the Draft RP (which runs it against the save in this browser)
// and the NCAA RP (which runs it headless in tests, and reads the result).
// Pure logic: no DOM, no storage. Callers pass a context and apply the
// patch that comes back.
//
// Everything here is derived from what the universe already knows about
// a player — his measurements, the sheet's Attributes / Athleticism
// columns, the recruiting database's scouting text, his playstyle and his
// college numbers — plus controlled randomness, so a combine is never a
// coin flip but never a formality either.
// ============================================================

(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const DC = root.DraftCore || (typeof require === 'function' ? require('./draft-core.js') : null);
  const NB = root.NBACore || (typeof require === 'function' ? require('./nba-core.js') : null);

  // Stage order. `cycle.stage` is the last step that has happened.
  const STAGES = [
    { key: 'declared', label: 'Declarations', verb: 'Declarations are in' },
    { key: 'combine',  label: 'Combine',      verb: 'Run the Draft Combine' },
    { key: 'lottery',  label: 'Lottery',      verb: 'Hold the Draft Lottery' },
    { key: 'workouts', label: 'Workouts',     verb: 'Start Team Workouts' },
    { key: 'deadline', label: 'Deadline',     verb: 'Withdrawal Deadline' },
    { key: 'complete', label: 'Draft Night',  verb: 'Start Draft Night' }
  ];
  const ORDER = STAGES.map(s => s.key);

  function stageIndex(key) { const i = ORDER.indexOf(key); return i < 0 ? 0 : i; }
  function nextStage(key) { return STAGES[stageIndex(key) + 1] || null; }

  // ---------- small helpers ----------

  // FNV-1a -> [0, 1). Stable per string, so a player's personality and
  // body don't change between loads or seasons.
  function hash01(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  function seeded(seedText) {
    let a = Math.floor(hash01(seedText) * 4294967296) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Roughly normal, mean 0, sd 1.
  function gauss(rng) { return (rng() + rng() + rng() + rng() - 2) * 1.73; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, d = 0) { const n = parseFloat(v); return isNaN(n) ? d : n; }
  function r2(v, step) { return Math.round(v / step) * step; }

  function inches(ht) {
    if (DC && DC.parseHeightInches) return DC.parseHeightInches(ht);
    const m = String(ht || '').match(/(\d+)\s*['’-]\s*(\d+(?:\.\d+)?)?/);
    return m ? parseInt(m[1], 10) * 12 + parseFloat(m[2] || '0') : null;
  }
  // 80.25 -> 6' 8.25"
  function fmtIn(v) {
    if (v == null || isNaN(v)) return '—';
    const ft = Math.floor(v / 12);
    let rest = Math.round((v - ft * 12) * 4) / 4;
    const txt = rest % 1 === 0 ? String(rest) : rest.toFixed(2).replace(/0$/, '');
    return `${ft}' ${txt}"`;
  }

  function group(pos) {
    const p = String(pos || '').toUpperCase();
    if (['PG', 'SG', 'G', 'CG'].includes(p)) return 'guard';
    if (['PF', 'C', 'F/C'].includes(p)) return 'big';
    return 'wing';
  }
  const GROUP_LABEL = { guard: 'guards', wing: 'wings', big: 'bigs' };

  // Everything written about a player, lower-cased: the roster sheet's
  // Attributes column plus the recruiting database's report.
  function scoutText(p) {
    const s = p.scout || {};
    return [p.attributes, s.scouting, s.strengths, s.weaknesses].filter(Boolean).join(' | ').toLowerCase();
  }
  function weakText(p) { return String((p.scout || {}).weaknesses || '').toLowerCase(); }
  function has(text, ...words) { return words.some(w => text.includes(w)); }

  // ---------- the athlete ----------

  // Five traits on a 0-100 scale. The sheet's Athleticism column is the
  // strongest signal when it's there; otherwise playstyle, production and
  // scouting language build the picture.
  function athleteProfile(p) {
    const g = group(p.pos);
    const text = scoutText(p);
    const weak = weakText(p);
    const st = p.stats || {};
    const arche = (p.playstyle && p.playstyle.archetype) || '';
    const noise = k => (hash01(`${p.id}|${k}`) - 0.5) * 16;

    const base = p.athleticism ? clamp(num(p.athleticism), 30, 99)
      : 56 + ({ slasher: 11, rollBig: 8, defender: 8, primaryScorer: 4, playmaker: 2, connector: 0, shooter: -4, postHub: -7 }[arche] || 0)
           + (num(p.rating, 72) - 75) * 0.35;

    const prof = {
      explosive: base, speed: base, agility: base, strength: base, motor: 55
    };
    // Size shapes the profile: guards are quicker, bigs stronger.
    if (g === 'guard') { prof.speed += 7; prof.agility += 7; prof.strength -= 9; }
    if (g === 'big') { prof.speed -= 7; prof.agility -= 9; prof.strength += 10; prof.explosive -= 2; }

    // What the numbers say he does.
    if (num(st.blkPct) >= 7) prof.explosive += 5;
    if (num(st.stlPct) >= 2.8) { prof.agility += 4; prof.speed += 2; }
    if (num(st.orebPct) >= 10) { prof.motor += 8; prof.explosive += 3; }
    if (num(st.ftr) >= 0.45) prof.strength += 3;

    // What the scouts wrote.
    if (has(text, 'athletic', 'explosive', 'bouncy', 'springy', 'vertical', 'above the rim', 'lob', 'high flyer', 'leaper')) prof.explosive += 9;
    if (has(text, 'quick', 'fast', 'speed', 'burst', 'first step', 'end to end', 'transition')) prof.speed += 8;
    if (has(text, 'lateral', 'mobility', 'mobile', 'point of attack', 'agile', 'switch')) prof.agility += 7;
    if (has(text, 'strong', 'physical', 'powerful', 'strength', 'bruising', 'wide frame')) prof.strength += 10;
    if (has(text, 'motor', 'relentless', 'energy', 'hustle', 'tough', 'competitor')) prof.motor += 12;
    if (has(weak, 'slow', 'athletic', 'explosive', 'burst', 'below the rim', 'stiff', 'lateral')) { prof.explosive -= 9; prof.speed -= 7; prof.agility -= 5; }
    if (has(text, 'thin', 'skinny', 'frail', 'wiry', 'slight') || has(weak, 'strength', 'frame', 'weight')) prof.strength -= 10;
    if (has(weak, 'motor', 'effort', 'conditioning')) prof.motor -= 12;

    Object.keys(prof).forEach(k => { prof[k] = clamp(Math.round(prof[k] + noise(k)), 20, 99); });
    return prof;
  }

  // A stable read on how a prospect carries himself. It matters in
  // interviews and in how he handles an intense workout.
  const PERSONALITIES = {
    competitor: { label: 'Competitor', blurb: 'Raises his level when the gym gets physical.' },
    confident:  { label: 'Confident',  blurb: 'Comfortable in any room; rarely rattled.' },
    brash:      { label: 'Brash',      blurb: 'Supremely sure of himself — it plays on the court, less so in the interview room.' },
    reserved:   { label: 'Reserved',   blurb: 'Quiet and still finding his voice; a hostile gym can get to him.' },
    steady:     { label: 'Steady',     blurb: 'Even-keeled. You get the same player every day.' },
    coachable:  { label: 'Coachable',  blurb: 'Takes instruction and applies it on the next rep. Front offices love it.' }
  };
  function personality(p) {
    const text = scoutText(p);
    const w = { competitor: 1, confident: 1, brash: 0.6, reserved: 0.8, steady: 1, coachable: 1 };
    if (has(text, 'competitor', 'tough', 'motor', 'dog', 'relentless')) w.competitor += 2;
    if (has(text, 'leader', 'vocal', 'swagger', 'alpha', 'go-to', 'bucket')) { w.confident += 1.5; w.brash += 1; }
    if (has(text, 'raw', 'quiet', 'soft', 'passive', 'project')) w.reserved += 2;
    if (has(text, 'iq', 'smart', 'mature', 'high character', 'glue')) { w.coachable += 1.5; w.steady += 1; }
    const cls = String(p.class || '').toUpperCase();
    if (cls === 'SR' || cls === 'GR') { w.steady += 1; w.coachable += 0.5; w.reserved -= 0.4; }
    if (cls === 'FR') { w.reserved += 0.4; w.brash += 0.3; }
    if (num(p.rsci, 999) <= 15) { w.confident += 0.8; w.brash += 0.6; }
    if (num(p.stats && p.stats.usg) >= 28) { w.brash += 0.5; w.confident += 0.5; }
    const total = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0);
    let roll = hash01(`${p.id}|${p.name}|personality`) * total;
    for (const k of Object.keys(w)) { roll -= Math.max(0, w[k]); if (roll <= 0) return k; }
    return 'steady';
  }

  // ---------- the combine ----------

  const APE_NORM = { guard: 3.2, wing: 3.8, big: 4.3 };

  function measure(p, rng) {
    const g = group(p.pos);
    const text = scoutText(p);
    const listed = inches(p.ht) || (g === 'big' ? 82 : g === 'guard' ? 75 : 79);
    // Listings run generous; the combine measures barefoot.
    const barefoot = r2(listed - 0.6 - rng() * 1.1, 0.25);
    let wingspan = inches(p.wingspan);
    if (!wingspan) {
      let ape = APE_NORM[g] + gauss(rng) * 1.9;
      if (has(text, 'length', 'long arms', 'wingspan', 'long', 'reach')) ape += 1.6;
      if (has(text, 'rim protect', 'shot block')) ape += 0.8;
      if (has(text, 'short arms', 'undersized') || has(weakText(p), 'length', 'wingspan')) ape -= 1.8;
      wingspan = barefoot + clamp(ape, -2, 9.5);
    }
    wingspan = r2(wingspan, 0.25);
    const ape = wingspan - barefoot;
    const reach = r2(clamp(barefoot * 1.33 + (ape - APE_NORM[g]) * 0.45 + gauss(rng) * 0.6, 88, 121), 0.5);
    const listedWt = num(p.wt, g === 'big' ? 235 : g === 'guard' ? 185 : 210);
    const weight = Math.round(listedWt + gauss(rng) * 4);
    const bmi = weight / (barefoot * barefoot) * 703;
    const bodyFat = +clamp(6.2 + (bmi - 24.5) * 0.55 + gauss(rng) * 1.3, 3.6, 14.5).toFixed(1);
    const handLength = +r2(clamp(7.9 + (barefoot - 72) * 0.07 + gauss(rng) * 0.3, 7.5, 10.25), 0.25).toFixed(2);
    const handWidth = +r2(clamp(handLength * 1.08 + gauss(rng) * 0.4, 7.75, 11.5), 0.25).toFixed(2);
    return { listed, barefoot, shoes: barefoot + 1.25, wingspan, ape: +ape.toFixed(2), reach, weight, bodyFat, handLength, handWidth };
  }

  function testAthlete(p, prof, m, rng) {
    const ht = m.barefoot;
    const lane = +clamp(11.45 - (prof.agility - 50) * 0.02 + (ht - 78) * 0.035 + gauss(rng) * 0.22, 10.2, 12.9).toFixed(2);
    const shuttle = +clamp(3.06 - (prof.agility - 50) * 0.0065 + (ht - 78) * 0.008 + gauss(rng) * 0.07, 2.62, 3.55).toFixed(2);
    const sprint = +clamp(3.28 - (prof.speed - 50) * 0.0055 + (ht - 78) * 0.006 + gauss(rng) * 0.045, 2.98, 3.62).toFixed(2);
    const standVert = +r2(clamp(28.5 + (prof.explosive - 50) * 0.17 - (ht - 78) * 0.22 + gauss(rng) * 1.6, 20, 38.5), 0.5).toFixed(1);
    const maxVert = +r2(clamp(standVert + 5.5 + (prof.explosive - 50) * 0.06 + (100 - Math.abs(prof.speed)) * 0 + gauss(rng) * 1.3, standVert + 2, 46), 0.5).toFixed(1);
    const bench = Math.max(0, Math.round(5 + (prof.strength - 50) * 0.22 + (m.weight - 205) * 0.05 + gauss(rng) * 2.2));
    return { lane, shuttle, sprint, standVert, maxVert, bench };
  }

  // Shooting drills track the player's real touch: his college 3P% and
  // FT%, then the day's variance.
  function shoot(p, rng) {
    const st = p.stats || {};
    const g = group(p.pos);
    const three = num(st.threePPct, g === 'big' ? 0.29 : 0.33);
    const ft = num(st.ftPct, g === 'big' ? 0.64 : 0.74);
    const vol = num(st.threePa, g === 'big' ? 0.8 : 3);
    const skill = clamp(0.30 + (three - 0.33) * 1.9 + (ft - 0.72) * 0.55 + Math.min(vol, 7) * 0.012 + (p.playstyle ? (num(p.playstyle.threePct, 1) - 1) * 0.3 : 0), 0.12, 0.72);
    const day = gauss(rng) * 0.06;
    const make = (n, pr) => { let k = 0; for (let i = 0; i < n; i++) if (rng() < clamp(pr + day, 0.05, 0.9)) k++; return k; };
    return { spotUp: make(25, skill + 0.08), offDribble: make(15, skill - 0.05), star: make(25, skill + 0.02), skill };
  }

  // Percentile of each result within the player's position group (time
  // drills: lower is better).
  const LOWER_BETTER = { lane: true, shuttle: true, sprint: true };
  function percentiles(rows, key, getter) {
    const byGroup = {};
    rows.forEach(r => { const v = getter(r); if (v == null) return; (byGroup[r.group] = byGroup[r.group] || []).push(v); });
    rows.forEach(r => {
      const v = getter(r);
      if (v == null) return;
      const arr = byGroup[r.group];
      let below = 0, ties = 0;
      arr.forEach(x => { if (x === v) ties++; else if (LOWER_BETTER[key] ? x > v : x < v) below++; });
      r.pct[key] = Math.round(((below + (ties - 1) / 2) / Math.max(1, arr.length - 1)) * 100);
    });
  }

  function letter(score, scale) {
    const s = scale || [[90, 'A+'], [80, 'A'], [72, 'A-'], [64, 'B+'], [56, 'B'], [48, 'B-'], [40, 'C+'], [32, 'C'], [24, 'C-']];
    for (const [cut, l] of s) if (score >= cut) return l;
    return 'D';
  }

  // How much a result can move a prospect: a consensus top pick has
  // little to prove, a fringe prospect everything.
  function volatility(rank) { return rank <= 10 ? 0.45 : rank <= 30 ? 1.0 : rank <= 60 ? 1.35 : 1.6; }

  function runCombine(ctx) {
    const rng = ctx.rng || Math.random;
    const board = ctx.board();                // declared, ranked
    const invited = board.slice(0, ctx.invites || 78);
    // Anyone the sheet has going in this draft is always invited.
    board.forEach(e => { if (!invited.includes(e) && ctx.scriptedFor(e.player)) invited.push(e); });

    const rows = invited.map((e, i) => {
      const p = e.player;
      const prof = athleteProfile(p);
      const m = measure(p, rng);
      // A handful of projected top picks only measure and interview.
      const skips = i < 6 && rng() < (i < 3 ? 0.6 : 0.35);
      const tests = skips ? null : testAthlete(p, prof, m, rng);
      const shots = skips && rng() < 0.7 ? null : shoot(p, rng);
      return { entry: e, p, rank: i + 1, group: group(p.pos), prof, m, tests, shots, pct: {} };
    });

    ['lane', 'shuttle', 'sprint', 'standVert', 'maxVert', 'bench'].forEach(k => percentiles(rows, k, r => r.tests ? r.tests[k] : null));
    percentiles(rows, 'ape', r => r.m.ape);
    percentiles(rows, 'reach', r => r.m.reach);
    percentiles(rows, 'shooting', r => r.shots ? r.shots.spotUp + r.shots.offDribble + r.shots.star : null);

    const results = rows.map(r => {
      const p = r.p;
      const athletic = r.tests ? (r.pct.maxVert + r.pct.standVert + r.pct.lane + r.pct.shuttle + r.pct.sprint) / 5 : null;
      const length = (r.pct.ape + r.pct.reach) / 2;
      const shooting = r.shots ? r.pct.shooting : null;
      const parts = [[athletic, 0.45], [length, 0.25], [shooting, 0.30]].filter(x => x[0] != null);
      const w = parts.reduce((a, x) => a + x[1], 0);
      const composite = parts.reduce((a, x) => a + x[0] * x[1], 0) / w;
      const pers = personality(p);
      // Interviews: the room reads personality.
      const iv = pers === 'coachable' ? 1.0 : pers === 'steady' ? 0.5 : pers === 'confident' ? 0.4
        : pers === 'brash' ? (rng() < 0.45 ? -1.6 : 0.3) : pers === 'reserved' ? -0.2 : 0.3;
      const listedGap = r.m.listed - r.m.shoes;
      const vol = volatility(r.rank);
      let stock = ((composite - 50) / 50) * 2.6 * vol + iv * 0.8;
      if (listedGap >= 1.5) stock -= 0.6 * vol;          // measured well short of his listing
      stock = +stock.toFixed(2);

      const notes = [];
      notes.push(`${fmtIn(r.m.barefoot)} barefoot, ${fmtIn(r.m.wingspan)} wingspan (${r.m.ape >= 0 ? '+' : ''}${r.m.ape.toFixed(2).replace(/\.?0+$/, '')}), ${fmtIn(r.m.reach)} standing reach.`);
      if (!r.tests) notes.push('Measured and interviewed only — skipped athletic testing.');
      else {
        if (r.pct.maxVert >= 90) notes.push(`${r.tests.maxVert}" max vertical — near the top of the ${GROUP_LABEL[r.group]}.`);
        if (r.pct.sprint >= 90) notes.push(`${r.tests.sprint}s three-quarter sprint, among the fastest ${GROUP_LABEL[r.group]} tested.`);
        if (r.pct.lane >= 90) notes.push(`${r.tests.lane}s lane agility — elite change of direction.`);
        if (athletic != null && athletic < 22) notes.push('Athletic testing lagged well behind his position group.');
      }
      if (r.pct.ape >= 90) notes.push('Length stood out: one of the best wingspan-to-height ratios in his group.');
      if (listedGap >= 1.5) notes.push(`Measured about ${listedGap.toFixed(1)}" shorter in shoes than his listed ${fmtIn(r.m.listed)}.`);
      if (r.shots && r.pct.shooting >= 85) notes.push(`Lit up the shooting drills (${r.shots.spotUp}/25 spot-up).`);
      else if (r.shots && r.pct.shooting <= 15) notes.push('Shooting drills were a struggle.');
      if (iv <= -1) notes.push('Some teams came away from interviews unconvinced.');
      else if (iv >= 1) notes.push('Interviewed as well as anyone in the class.');

      return {
        id: p.id, name: p.name, school: p.school, pos: p.pos, group: r.group, rank: r.rank,
        meas: r.m, tests: r.tests, shooting: r.shots ? { spotUp: r.shots.spotUp, offDribble: r.shots.offDribble, star: r.shots.star } : null,
        pct: r.pct, athletic: athletic == null ? null : Math.round(athletic), composite: Math.round(composite),
        grade: letter(composite), personality: pers, interview: iv, profile: r.prof, stock, notes
      };
    });
    return results;
  }

  // ---------- workouts ----------

  // Every NBA front office runs workouts its own way. Fixed per franchise
  // so a style becomes part of that team's identity in the universe.
  const ORG_STYLES = {
    grueling:    { label: 'Grueling',        intensity: 0.95, blurb: 'Conditioning tests and back-to-back live sessions.' },
    competitive: { label: 'Competitive',     intensity: 0.80, blurb: 'Prospects go head to head, 1-on-1 and 3-on-3.' },
    skill:       { label: 'Skill work',      intensity: 0.55, blurb: 'Shooting, ball-handling and drill work.' },
    analytics:   { label: 'Testing-heavy',   intensity: 0.50, blurb: 'Tracking data, shot charts and more measuring.' },
    character:   { label: 'Character-first', intensity: 0.40, blurb: 'Long interviews, psych evaluations, film sessions.' }
  };
  const STYLE_KEYS = Object.keys(ORG_STYLES);
  function orgStyle(teamId) { return STYLE_KEYS[Math.floor(hash01(`org|${teamId}`) * STYLE_KEYS.length)]; }

  const FIT = {
    competitor: { grueling: 8, competitive: 7, skill: 0, analytics: 0, character: 2, sd: 9 },
    confident:  { grueling: 3, competitive: 3, skill: 3, analytics: 3, character: 2, sd: 8 },
    brash:      { grueling: 0, competitive: 5, skill: 2, analytics: -1, character: -9, sd: 13 },
    reserved:   { grueling: -7, competitive: -6, skill: 3, analytics: 3, character: 0, sd: 9 },
    steady:     { grueling: 2, competitive: 1, skill: 1, analytics: 1, character: 1, sd: 5.5 },
    coachable:  { grueling: 2, competitive: 0, skill: 4, analytics: 2, character: 7, sd: 7 }
  };
  const WORKOUT_GRADES = [[80, 'A+'], [72, 'A'], [64, 'B+'], [56, 'B'], [48, 'C+'], [40, 'C']];
  const GRADE_INTEREST = { 'A+': 5, 'A': 3.5, 'B+': 2, 'B': 1, 'C+': 0, 'C': -1.2, 'D': -3 };
  const GRADE_VALUE = { 'A+': 1.6, 'A': 1.1, 'B+': 0.6, 'B': 0.2, 'C+': -0.2, 'C': -0.7, 'D': -1.3 };

  function workoutNote(style, grade, pers, p, team, rng, shots) {
    const good = grade === 'A+' || grade === 'A' || grade === 'B+';
    const bad = grade === 'C' || grade === 'D';
    const nick = team.name.split(' ').slice(-1)[0];
    // Personality colours a report before the drill does.
    if (pers === 'brash') {
      if (style === 'character' && !good) return pick(rng, [`Told the front office he's the best player in the class. Not everyone in the room agreed.`, `Questioned why the ${nick} needed a second interview. It did not land well.`]);
      if (style === 'grueling' && bad) return `Balked at the conditioning test and made sure everyone knew it.`;
      if (style === 'analytics' && !good) return `Argued with the staff about his own tracking numbers.`;
      if (good && rng() < 0.5) return pick(rng, [`Talked the whole session — and backed every word of it up.`, `Called his shots in the 1-on-1s and delivered.`]);
      if (bad && rng() < 0.5) return `Chirped all afternoon, then had one of his worse days.`;
    }
    if (pers === 'coachable' && good && rng() < 0.45) return pick(rng, [`Picked up every correction the ${nick} staff threw at him.`, `Staff loved how quickly he adjusted between drills.`]);
    if (pers === 'competitor' && (style === 'grueling' || style === 'competitive') && good && rng() < 0.45) return `Asked for another rep after the session ended. The ${nick} took notice.`;
    if (pers === 'reserved' && style === 'character') return good ? `Quiet, but the front office liked every answer.` : `Kept his answers short; the room found him hard to read.`;
    // Now and then the day itself goes sideways — or goes well enough to
    // earn a second look.
    const r = rng();
    if (bad && r < 0.12) return pick(rng, [`Flew in on a red-eye and looked it.`, `Tweaked an ankle early and sat out the live portion.`]);
    if (grade === 'A+' && r < 0.2) return `Invited back for a second workout.`;
    if (style === 'grueling') {
      if (good) return pick(rng, [`Survived the ${nick}' punishing conditioning test and was still making shots at the end.`, `Outworked the group in a brutal session — staff noticed.`, `Finished first in every conditioning drill.`]);
      if (bad) return pers === 'reserved' ? `Looked intimidated by the pace and never settled in.` : pick(rng, [`Ran out of gas in the conditioning portion.`, `Needed a breather midway through the session.`]);
      return pick(rng, [`Held his own through a demanding session.`, `Got through the conditioning test; nothing more, nothing less.`]);
    }
    if (style === 'competitive') {
      if (good) return pick(rng, [`Won his 1-on-1 matchups against other first-round prospects.`, `Controlled the 3-on-3 portion from start to finish.`, `Guarded up a position in the live work and won the matchup.`]);
      if (bad) return pers === 'reserved' ? `Shrank in the live 3-on-3s against more physical prospects.` : pick(rng, [`Got the worse of his 1-on-1 matchups.`, `Struggled to get to his spots against length.`]);
      return `Traded buckets in the live portion; nothing decisive either way.`;
    }
    if (style === 'skill') {
      const made = shots ? Math.max(8, Math.min(24, shots.spotUp + Math.round((rng() - 0.5) * 6))) : 12 + Math.round(rng() * 8);
      if (good) return pick(rng, [`Shot it beautifully — ${made}/25 from NBA range in the shooting session.`, `Handle and footwork looked NBA-ready in the drill work.`]);
      if (bad) return pick(rng, [`Uneven shooting day; the jumper came and went.`, `Ball-handling drills exposed a loose handle.`]);
      return `Solid drill work, ${made}/25 from deep.`;
    }
    if (style === 'analytics') {
      if (good) return pick(rng, [`Testing and shot data matched the tape. Staff left encouraged.`, `Re-measured a touch longer than his combine numbers.`]);
      if (bad) return `Tracking numbers raised questions about how his game translates.`;
      return `Numbers landed about where the ${nick} expected.`;
    }
    // character
    if (good) return pick(rng, [`Impressed in a long sit-down with the front office.`, `Film session went well — he broke down his own tape like a pro.`, `Aced the psych evaluation and the interview.`]);
    if (bad) return pick(rng, [`The interview reportedly left decision-makers lukewarm.`, `Showed up late to the team dinner. It came up again the next day.`]);
    return `Good conversations with the front office; workout was routine.`;
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  // Teams bring in prospects projected near their picks. `order` is the
  // 60-pick order (team objects) — after the lottery, the real one.
  function runWorkouts(ctx, order, combineById) {
    const rng = ctx.rng || Math.random;
    const board = ctx.board().slice(0, 70);
    const interest = {};
    const out = [];
    board.forEach((e, i) => {
      const p = e.player;
      const rank = i + 1;
      const cm = combineById[p.id];
      const pers = cm ? cm.personality : personality(p);
      const prof = cm ? cm.profile : athleteProfile(p);
      const lo = Math.max(0, rank - (rank <= 5 ? 5 : 7));
      const hi = Math.min(order.length, rank + (rank <= 5 ? 3 : 9));
      const nearby = [];
      order.slice(lo, hi).forEach(t => { if (!nearby.some(x => x.id === t.id)) nearby.push(t); });
      const count = rank <= 3 ? 2 + Math.floor(rng() * 2) : rank <= 30 ? 4 + Math.floor(rng() * 3) : 5 + Math.floor(rng() * 4);
      const teams = nearby.sort(() => rng() - 0.5).slice(0, count);
      const visits = [];
      teams.forEach(team => {
        const style = orgStyle(team.id);
        // Projected top picks can pick and choose.
        const teamPick = order.findIndex(t => t.id === team.id) + 1;
        if (rank <= 4 && teamPick > rank + 2 && rng() < 0.55) {
          visits.push({ teamId: team.id, team: team.name, logo: team.logo, style, grade: null, declined: true, note: `Declined to work out for the ${team.name}.` });
          (interest[team.id] = interest[team.id] || {})[p.id] = -1;
          return;
        }
        const fit = FIT[pers] || FIT.steady;
        let perf = 52 + (num(p.rating, 74) - 76) * 1.1 + (prof.motor - 55) * 0.12 + ((prof.explosive + prof.agility) / 2 - 55) * 0.18
          + fit[style] * ORG_STYLES[style].intensity + gauss(rng) * fit.sd;
        let intimidated = false;
        if ((pers === 'reserved' || String(p.class).toUpperCase() === 'FR') && ORG_STYLES[style].intensity >= 0.8 && rng() < (pers === 'reserved' ? 0.35 : 0.12)) {
          perf -= 11; intimidated = true;
        }
        const grade = letter(perf, WORKOUT_GRADES);
        const note = intimidated ? `Looked intimidated early and never found his footing.` : workoutNote(style, grade, pers, p, team, rng, cm && cm.shooting);
        visits.push({ teamId: team.id, team: team.name, logo: team.logo, style, grade, note, pick: teamPick });
        (interest[team.id] = interest[team.id] || {})[p.id] = GRADE_INTEREST[grade];
      });
      const graded = visits.filter(v => v.grade);
      const avg = graded.length ? graded.reduce((a, v) => a + GRADE_VALUE[v.grade], 0) / graded.length : 0;
      const stock = +(avg * 0.9 * volatility(rank)).toFixed(2);
      out.push({ id: p.id, name: p.name, school: p.school, pos: p.pos, rank, personality: pers, visits, stock,
        avgGrade: graded.length ? letter(56 + avg * 16, WORKOUT_GRADES) : null });
    });
    return { results: out, interest };
  }

  // ---------- withdrawal deadline ----------

  function resolveDeadline(ctx) {
    const rng = ctx.rng || Math.random;
    const rankOf = ctx.fullBoardRank();          // id -> rank on the whole-universe board
    const staying = [], returning = [];
    ctx.declarations.forEach(d => {
      const p = ctx.byId[d.id];
      const rank = rankOf[d.id] || 999;
      const keep = () => staying.push({ ...d, boardRank: rank });
      if (d.mandatory || d.scripted) return keep();
      if (rank <= 25) return keep();
      const rsci = p ? num(p.rsci, NaN) : NaN;
      const ppg = p && p.stats ? num(p.stats.ppg) : 0;
      if (!isNaN(rsci) && rsci <= 20 && ppg >= 15) return keep();
      const pd = p && p.predraft && p.predraft.year === ctx.draftYear ? p.predraft : null;
      const feedback = pd ? num(pd.stock) : 0;
      const stayChance = clamp((rank <= 40 ? 0.9 : rank <= 60 ? 0.6 : 0.22) + feedback * 0.07, 0.05, 0.98);
      if (rng() < stayChance) return keep();
      returning.push({ ...d, boardRank: rank, feedback: pd ? pd.workoutGrade || pd.grade || null : null });
    });
    return { staying, returning };
  }

  // ---------- the lottery and draft night ----------

  function runLottery(ctx) {
    const lot = NB.runLottery(ctx.league, ctx.rng || Math.random);
    return {
      order: lot.order.map(t => t.id),
      winners: lot.lotteryWinners.map(t => ({ id: t.id, name: t.name, logo: t.logo, wins: t.wins, losses: t.losses })),
      // The 14 lottery teams, worst record first, with where each landed.
      field: lot.byRecord.slice(0, 14).map((t, i) => ({
        id: t.id, name: t.name, logo: t.logo, wins: t.wins, losses: t.losses, seed: i + 1,
        odds: NB.LOTTERY_ODDS[i], pick: lot.order.findIndex(x => x.id === t.id) + 1
      }))
    };
  }

  function orderTeams(ctx, ids) {
    const byId = {};
    ctx.league.forEach(t => { byId[t.id] = t; });
    return ids.map(id => byId[id]).filter(Boolean);
  }

  function runDraft(ctx, lottery, interest) {
    const rng = ctx.rng || Math.random;
    const declaredIds = new Set(ctx.declarations.map(d => d.id));
    let board = ctx.fullBoard(400).filter(e => declaredIds.has(e.player.id));
    // A player the sheet scripts into this draft is drafted however his
    // season went, so he's on the board even if he fell outside the top 400.
    const onBoard = new Set(board.map(e => e.player.id));
    const missing = ctx.declarations.filter(d => {
      if (onBoard.has(d.id)) return false;
      const spec = ctx.scriptedFor(ctx.byId[d.id]);
      return spec && spec.year === ctx.draftYear;
    });
    if (missing.length) {
      const want = new Set(missing.map(d => d.id));
      board = board.concat(ctx.fullBoard(100000).filter(e => want.has(e.player.id)));
    }
    const fixed = {};
    const ranged = [];
    board.forEach(e => {
      const spec = ctx.scriptedFor(e.player);
      if (!spec || spec.year !== ctx.draftYear) return;
      if (spec.overall) { if (!fixed[spec.overall]) fixed[spec.overall] = e; }
      else if (spec.range) { ranged.push({ entry: e, maxPick: spec.range }); }
    });
    const order = orderTeams(ctx, lottery.order);
    const draft = NB.buildMockDraft(board, ctx.league, rng, fixed, {
      lottery: { order, lotteryWinners: orderTeams(ctx, lottery.winners.map(w => w.id)) },
      interest,
      ranged
    });
    const picks = draft.picks.map(pk => {
      const p = pk.player;
      const spec = ctx.scriptedFor(p);
      const st = p.stats || {};
      const landedScripted = !!spec && spec.year === ctx.draftYear &&
        ((spec.overall && spec.overall === pk.pick) || (spec.range && pk.pick <= spec.range));
      return {
        pick: pk.pick, round: pk.round, year: ctx.draftYear,
        id: p.id, name: p.name, school: p.school, pos: p.pos, ht: p.ht,
        class: p.class, ppg: st.ppg || '0.0', rpg: st.rpg || '0.0', apg: st.apg || '0.0',
        team: pk.team ? { id: pk.team.id, name: pk.team.name, logo: pk.team.logo } : null,
        boardRank: pk.boardRank,
        scripted: landedScripted,
        workedOut: !!(interest && pk.team && interest[pk.team.id] && interest[pk.team.id][p.id] > 0)
      };
    });
    // The final board, kept with the draft so past boards can be looked up.
    const drafted = {};
    picks.forEach(pk => { drafted[pk.id] = pk; });
    const finalBoard = board.slice(0, 60).map((e, i) => {
      const p = e.player, st = p.stats || {};
      const pd = p.predraft && p.predraft.year === ctx.draftYear ? p.predraft : null;
      const tags = DC && DC.scoutingTags ? DC.scoutingTags(e) : [];
      return {
        rank: i + 1, id: p.id, name: p.name, school: p.school, pos: p.pos, class: p.class, ht: p.ht,
        ppg: st.ppg, rpg: st.rpg, apg: st.apg, bpm: st.bpm, tsPct: st.tsPct,
        score: +e.score.toFixed(1), tags,
        combineGrade: pd ? pd.grade || null : null, workoutGrade: pd ? pd.workoutGrade || null : null,
        pick: drafted[p.id] ? drafted[p.id].pick : null,
        team: drafted[p.id] ? drafted[p.id].team : null
      };
    });
    return { picks, finalBoard };
  }

  // ---------- one step at a time ----------

  // ctx:
  //   draftYear, league, declarations, byId, rng
  //   board()            -> declared prospects, ranked (with pre-draft stock)
  //   fullBoard(limit)   -> everyone in the universe, ranked
  //   fullBoardRank()    -> { id: rank }
  //   scriptedFor(p)     -> the sheet's scripted pick or null
  //   cycle              -> the current cycle record
  //
  // Returns { cycle, players: {id: predraftPatch}, draft: {...} } for the
  // caller to apply.
  function advance(ctx) {
    const cycle = { ...(ctx.cycle || { year: ctx.draftYear, stage: 'declared', rev: 0 }) };
    const nxt = nextStage(cycle.stage);
    if (!nxt) return null;
    const out = { players: {}, state: {} };
    const pd = id => {
      const p = ctx.byId[id];
      const cur = p && p.predraft && p.predraft.year === ctx.draftYear ? p.predraft : { year: ctx.draftYear };
      return (out.players[id] = out.players[id] || { ...cur });
    };

    if (nxt.key === 'combine') {
      const results = runCombine(ctx);
      results.forEach(r => {
        Object.assign(pd(r.id), {
          invited: true, meas: r.meas, tests: r.tests, shooting: r.shooting, pct: r.pct, athletic: r.athletic,
          composite: r.composite, grade: r.grade, personality: r.personality, interview: r.interview,
          profile: r.profile, combineStock: r.stock, notes: r.notes, stock: r.stock, combineRank: r.rank
        });
      });
      cycle.combine = {
        invited: results.length,
        tested: results.filter(r => r.tests).length
      };
      // The legacy risers / fallers list the sim's offseason screen reads.
      out.state.combineResults = results.filter(r => Math.abs(r.stock) >= 1)
        .sort((a, b) => Math.abs(b.stock) - Math.abs(a.stock)).slice(0, 40)
        .map(r => ({ id: r.id, name: r.name, school: r.school, direction: r.stock > 0 ? 'rose' : 'fell', amount: Math.max(1, Math.round(Math.abs(r.stock) * 1.6)) }));
    } else if (nxt.key === 'lottery') {
      cycle.lottery = runLottery(ctx);
    } else if (nxt.key === 'workouts') {
      const combineById = {};
      Object.values(ctx.byId).forEach(p => {
        if (p.predraft && p.predraft.year === ctx.draftYear && p.predraft.invited) combineById[p.id] = p.predraft;
      });
      const order = cycle.lottery ? orderTeams(ctx, cycle.lottery.order) : [...ctx.league].sort((a, b) => a.wins - b.wins).concat([...ctx.league].sort((a, b) => a.wins - b.wins));
      const { results, interest } = runWorkouts(ctx, order, combineById);
      results.forEach(r => {
        const x = pd(r.id);
        x.workouts = r.visits;
        x.workoutStock = r.stock;
        x.workoutGrade = r.avgGrade;
        if (!x.personality) x.personality = r.personality;
        x.stock = +((x.combineStock || 0) + r.stock).toFixed(2);
      });
      cycle.interest = interest;
      cycle.workouts = { prospects: results.length, visits: results.reduce((a, r) => a + r.visits.length, 0) };
    } else if (nxt.key === 'deadline') {
      const { staying, returning } = resolveDeadline(ctx);
      out.state.draftDeclarations = staying;
      out.state.returningPlayers = returning;
      cycle.deadline = { returning: returning.length, staying: staying.length };
    } else if (nxt.key === 'complete') {
      const { picks, finalBoard } = runDraft(ctx, cycle.lottery || runLottery(ctx), cycle.interest || {});
      const lottery = { year: ctx.draftYear, winners: (cycle.lottery || { winners: [] }).winners };
      out.state.draftResults = picks;
      out.state.draftLottery = lottery;
      out.draftEntry = { year: ctx.draftYear, picks, lottery, board: finalBoard };
      picks.forEach(pk => {
        out.draftFor = out.draftFor || {};
        out.draftFor[pk.id] = { year: ctx.draftYear, pick: pk.pick, round: pk.round, team: pk.team, teamId: pk.team ? pk.team.id : null };
      });
    }
    cycle.stage = nxt.key;
    cycle.rev = (cycle.rev || 0) + 1;
    cycle.updatedAt = Date.now();
    out.cycle = cycle;
    return out;
  }

  const DraftCycle = {
    STAGES, ORDER, stageIndex, nextStage, advance,
    athleteProfile, personality, measure, testAthlete, shoot, runCombine, runWorkouts, resolveDeadline, runLottery, runDraft,
    PERSONALITIES, ORG_STYLES, orgStyle, group, fmtIn, hash01, seeded, letter
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DraftCycle;
  else root.DraftCycle = DraftCycle;
})();
