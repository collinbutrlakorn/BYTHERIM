// ============================================================
// NIL: what a player's name, image and likeness is worth, and what each
// program can pay. An open market: no caps, no revenue sharing.
//
// Both are kept as a 0-100 index and shown only as tiers (Elite, High,
// Solid, Modest, Minimal); there are no dollar figures.
//
// A player's value is talent and production, his recruiting pedigree
// (which fades the longer he's in college) and hype: Overtime Elite, a
// social-media brand, gives its players a high floor; the McDonald's,
// Jordan Brand and Hoop Summit games add to it; some players simply have
// a bigger following than their ranking (a seeded personal brand); big
// games move it.
//
// A program's budget is its prestige and conference, its boosters (some
// schools spend well above their standing) and recent winning.
//
// Pure functions; the engine supplies players and teams.
// ============================================================
(function (root) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function hash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const unit = key => (hash(key) % 10000) / 10000;

  const TIERS = [[85, 'Elite'], [68, 'High'], [50, 'Solid'], [32, 'Modest'], [0, 'Minimal']];
  const tierOf = v => (TIERS.find(([t]) => v >= t) || TIERS[TIERS.length - 1])[1];

  const OTE = /overtime elite|\bote\b/i;
  const POWER = new Set(['ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East', 'Pac-12']);
  // Programs known for collectives that spend above their prestige.
  const BOOSTERS = {
    'Texas Tech': 22, SMU: 20, Kentucky: 14, Kansas: 10, Oregon: 16, Texas: 16, Arkansas: 15, Indiana: 14, Louisville: 14,
    BYU: 18, Tennessee: 12, Auburn: 12, 'Ohio State': 10, Michigan: 12, 'Michigan State': 8, Alabama: 12, Florida: 10,
    'North Carolina': 10, Duke: 10, UCLA: 10, USC: 12, Miami: 14, 'Miami (FL)': 14, Baylor: 12, Houston: 10, 'St. John\'s': 16,
    Villanova: 6, Gonzaga: 8, Arizona: 10, Purdue: 6, Illinois: 10, Wisconsin: 6, Iowa: 6, Creighton: 8, Xavier: 8,
    'Texas A&M': 16, LSU: 14, Georgia: 10, 'Ole Miss': 14, 'Mississippi State': 10, Oklahoma: 10, 'Oklahoma State': 8,
    Utah: 10, 'Arizona State': 10, Cincinnati: 8, 'West Virginia': 10, Memphis: 16, 'San Diego State': 8, 'Saint Mary\'s': 4
  };

  // Hype: what makes a player worth more than his ranking says.
  function hype(p) {
    const where = [p.hs, p.aauTeam, p.intlTeam, p.club, p.formerClub].filter(Boolean).join(' | ');
    const acc = []
      .concat(p.accolades || [])
      .map(a => (typeof a === 'string' ? a : (a && (a.name || a.award || a.title)) || ''))
      .join(' | ').toLowerCase();
    const as = p.allStar || {};
    let h = 0;
    const ote = OTE.test(where);
    if (as.mcd || /mcdonald/.test(acc)) h += 10;
    if (as.jbc || /jordan brand/.test(acc)) h += 6;
    if (as.nhs || /hoop summit/.test(acc)) h += 5;
    // A personal brand: most have a modest following, a few a huge one.
    const b = unit(`brand|${p.name}|${p.dob || ''}`);
    h += Math.pow(b, 4) * 30;
    h += clamp((p.bigGameStock || 0) * 3, -6, 10);
    return { hype: h, ote };
  }

  // A player's NIL value, 0-100.
  function playerValue(p, opts = {}) {
    if (!p) return 0;
    const rating = parseFloat(p.rating) || 0;
    const st = p.stats || {};
    const gp = parseFloat(st.gp) || 0;
    const ppg = gp > 0 ? parseFloat(st.ppg) || 0 : 0;
    const talent = clamp((rating - 70) * 2.2, 0, 50);
    const prod = clamp((ppg - 4) * 1.3, 0, 24);
    // Pedigree is loudest as a freshman and fades.
    const yrs = { FR: 0, SO: 1, JR: 2, SR: 3, GR: 4 }[String(p.class || '').toUpperCase()] || 0;
    const rsci = parseFloat(p.rsci) || 0;
    const pedigree = rsci > 0 ? clamp(30 - rsci * 0.22, 0, 30) / (1 + yrs * 0.6) : 0;
    const { hype: h, ote } = hype(p);
    const guard = /^(PG|SG|CG|G)$/i.test(p.pos || '') ? 3 : 0;
    let v = talent * 0.8 + prod + pedigree + h + guard;
    if (ote) v = Math.max(v + 8, 52);                 // Overtime Elite's built-in following
    return Math.round(clamp(v, 0, 100));
  }

  // A program's NIL budget, 0-100.
  function teamBudget(t) {
    if (!t) return 0;
    const pres = t.prestige != null ? t.prestige : 50;
    const booster = BOOSTERS[t.school] != null ? BOOSTERS[t.school] : (unit(`boosters|${t.school}`) - 0.6) * 18;
    const last = (t.history || [])[(t.history || []).length - 1];
    const winning = last ? clamp((last.ncaaWins || 0) * 2 + (last.ncaaSeed ? 2 : 0) + (last.wonNationalTitle ? 4 : 0), 0, 12) : 0;
    const v = pres * 0.62 + (POWER.has(t.conference) ? 14 : 0) + booster + winning;
    return Math.round(clamp(v, 0, 100));
  }

  // How much a player at this value is underpaid where he is (positive:
  // someone else would pay him more than his school can).
  const gap = (value, budget) => value - budget;

  const api = { TIERS, tierOf, hype, playerValue, teamBudget, gap, BOOSTERS, hash };
  root.NilCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
