// ============================================================
// Coaching profiles.
//
// Turns the free-text "Coaching Style & Tactical Description" from the
// coaches sheet into numeric modifiers the simulation can actually use.
// Every trait is a multiplier centred on 1.0, so a team with no coach on
// file simulates exactly as it did before.
//
// No DOM access — testable in Node.
// ============================================================

// Each entry: a trait, the phrases that signal it, and how far one hit
// moves that trait. Multiple hits compound but are clamped at the end, so
// a description that says "fast" three different ways doesn't run away.
const STYLE_RULES = [
  // ---- Tempo ----
  { trait: 'pace', delta: +0.055, words: ['up-tempo', 'uptempo', 'fast-paced', 'fast paced', 'high-velocity', 'ultra-fast',
      'high-octane', 'fast-break', 'fast break', 'quick-strike', 'transition attack', 'primary transition',
      'secondary break', 'open-court', 'open-floor', 'early-clock', 'early transition', 'rapid transition',
      'high tempo', 'high-tempo', 'pace-and-space', 'pace and space', 'run out'] },
  { trait: 'pace', delta: -0.06, words: ['methodical', 'grind-it-out', 'grind it out', 'slow-paced', 'slow, controlled',
      'low-possession', 'deliberate pacing', 'patient', 'controlled pacing', 'grinding', 'tempo control',
      'controlled possessions', 'slow physical pacing'] },

  // ---- Three-point volume / spacing ----
  { trait: 'threePar', delta: +0.10, words: ['3-point volume', '3-point attempts', 'heavy 3-point', 'high 3-point',
      'perimeter shooting', 'five-out', '5-out', 'spread offense', 'spacing', 'floor width', 'wide floor',
      'pace-and-space', 'pace and space', 'stretch', '3-pointers', 'perimeter volume', 'floor spacing',
      'drive-and-kick', 'spread motion', 'spread attack'] },
  { trait: 'threePar', delta: -0.10, words: ['inside-out', 'high-low', 'post-up', 'post feeds', 'post entries',
      'interior game', 'paint touches', 'paint-touch', 'interior scoring', 'interior toughness', 'rim attempts'] },

  // ---- Ball movement / assists ----
  { trait: 'assists', delta: +0.10, words: ['ball movement', 'ball-movement', 'motion offense', 'motion-heavy',
      'passing', 'off-ball screening', 'unselfish', 'ball reversal', 'high-iq passing', 'continuous motion',
      'backdoor', 'multi-pass', 'swing-motion', 'player movement'] },
  { trait: 'assists', delta: -0.09, words: ['isolation', 'iso', 'guard freedom', 'player-centric', 'guard autonomy',
      'perimeter freedom', 'scoring freedom', 'individual player strengths'] },

  // ---- Defensive pressure / forced turnovers ----
  { trait: 'steals', delta: +0.14, words: ['press', 'pressing', 'full-court pressure', 'full court pressure',
      'ball-trap', 'ball traps', 'trap defense', 'turnover-seeking', 'force turnovers', 'forcing turnovers',
      'forcing opponent turnovers', 'deflection', 'deflections', 'havoc', 'mayhem', 'ball pressure',
      'turnover-forcing', 'turnover chaos', 'pressure defense'] },

  // ---- Rim protection / blocks ----
  { trait: 'blocks', delta: +0.13, words: ['rim protection', 'rim protector', 'shot block', 'lane protection',
      'paint protection', 'interior protection', 'rim containment', 'positional length', 'length-based',
      'interior defense', 'physical interior'] },

  // ---- Rebounding ----
  { trait: 'rebounds', delta: +0.09, words: ['rebounding', 'board control', 'glass control', 'offensive glass',
      'rebounding margin', 'glass crashing', 'glass toughness', 'defensive glass', 'boards', 'glass clearing',
      'physical rebounding', 'glass protection'] },

  // ---- Defensive quality (points allowed) ----
  { trait: 'defense', delta: +0.045, words: ['pack-line', 'pack line', 'suffocating', 'defense-first', 'defensive-minded',
      'shell defense', 'defensive shell', 'stifling', 'elite half-court defense', 'lockdown', 'containment',
      'ball containment', 'hard-nosed', 'disciplined defensive', 'tough, physical', 'physically demanding'] },

  // ---- Ball security ----
  { trait: 'turnovers', delta: -0.09, words: ['ball security', 'low-turnover', 'turnover minimization',
      'turnover control', 'disciplined ball', 'ball protection', 'elite ball security', 'ball-security'] },

  // ---- Recruiting tilt: guards vs bigs ----
  { trait: 'guardLean', delta: +0.10, words: ['guard-centric', 'guard-led', 'guard-driven', 'guard-oriented',
      'multi-guard', 'guard playmaking', 'positionless', 'perimeter-oriented', 'athletic guards', 'guard rotation',
      'downhill guard', 'guard penetration', 'dribble penetration', 'dribble drive'] },
  { trait: 'guardLean', delta: -0.10, words: ['post-up', 'high-low', 'interior-dominant', 'post feeds',
      'physical interior', 'interior toughness', 'paint touches', 'big men', 'positional length'] },

  // ---- Free throw generation ----
  { trait: 'freeThrows', delta: +0.08, words: ['downhill', 'attack the rim', 'rim attempts', 'driving lanes',
      'aggressive driving', 'paint pressure', 'drive-and-kick', 'dribble penetration'] }
];

const CLAMPS = {
  pace:       [0.88, 1.14],
  threePar:   [0.72, 1.32],
  assists:    [0.80, 1.22],
  steals:     [0.82, 1.40],
  blocks:     [0.82, 1.30],
  rebounds:   [0.88, 1.20],
  defense:    [0.90, 1.12],
  turnovers:  [0.82, 1.15],
  guardLean:  [0.78, 1.24],
  freeThrows: [0.85, 1.22]
};

function neutralProfile() {
  const p = {};
  Object.keys(CLAMPS).forEach(k => { p[k] = 1; });
  return p;
}

// Builds a profile from the description text. Unrecognised descriptions
// simply return a neutral profile rather than failing.
function parseCoachStyle(description) {
  const profile = neutralProfile();
  if (!description || typeof description !== 'string') return profile;

  const text = description.toLowerCase();
  const matched = [];

  STYLE_RULES.forEach(rule => {
    let hits = 0;
    rule.words.forEach(w => { if (text.includes(w)) hits++; });
    if (hits === 0) return;
    // Diminishing returns: the second and third phrase count for less.
    const effect = rule.delta * (1 + (hits - 1) * 0.45);
    profile[rule.trait] += effect;
    matched.push(rule.trait);
  });

  Object.keys(CLAMPS).forEach(k => {
    const [lo, hi] = CLAMPS[k];
    profile[k] = Math.max(lo, Math.min(hi, profile[k]));
  });

  profile._matched = [...new Set(matched)];
  return profile;
}

// Short labels for the team page, derived from the parsed numbers so they
// can never disagree with how the team actually simulates.
function styleTags(profile) {
  if (!profile) return [];
  const tags = [];
  if (profile.pace >= 1.045) tags.push('Up-Tempo');
  else if (profile.pace <= 0.955) tags.push('Deliberate');
  if (profile.threePar >= 1.10) tags.push('Perimeter-Oriented');
  else if (profile.threePar <= 0.92) tags.push('Inside-Out');
  if (profile.steals >= 1.12) tags.push('Pressure Defense');
  if (profile.defense >= 1.05) tags.push('Defense-First');
  if (profile.rebounds >= 1.08) tags.push('Crashes the Glass');
  if (profile.blocks >= 1.10) tags.push('Rim Protection');
  if (profile.assists >= 1.10) tags.push('Ball Movement');
  else if (profile.assists <= 0.93) tags.push('Isolation-Heavy');
  if (profile.guardLean >= 1.10) tags.push('Guard-Driven');
  else if (profile.guardLean <= 0.92) tags.push('Big-Oriented');
  return tags.slice(0, 4);
}

const CoachCore = { parseCoachStyle, styleTags, neutralProfile, STYLE_RULES, CLAMPS };

if (typeof module !== 'undefined' && module.exports) module.exports = CoachCore;
else if (typeof window !== 'undefined') window.CoachCore = CoachCore;
