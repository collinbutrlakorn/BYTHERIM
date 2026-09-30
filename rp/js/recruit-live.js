// ============================================================
// Live recruiting.
//
// While a class is in high school (its junior and senior years, see
// HSCore.classProgress), its uncommitted prospects are recruited as the
// NCAA RP's seasons play out:
//
//   - each has a list of schools (his offers), which shrinks as the class
//     moves along: all his offers early in the junior year, a top eight,
//     then a top five, then a final three in the senior year;
//   - interest in each school is its pull (prestige, how it's trending this
//     season and last March, the coach) against the level a player of his
//     rating recruits at, plus roster need, his own taste, and whether his
//     high-school or AAU teammates have already picked it;
//   - when his commitment date arrives (HSCore.commitAt) he picks from his
//     list, weighted toward the schools he likes most;
//   - a program that already has its usual class stops being much of a
//     draw.
//
// The recruiting sheet's own commitments are never touched: only generated
// prospects and sheet players the sheet hasn't committed are recruited.
// Pure functions; the engine supplies the teams and the clock.
// ============================================================
(function (root) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function hash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // His own taste for a school, the same every time: 0.75 to 1.3.
  const affinity = (name, school) => 0.75 + (hash(`${name}|${school}`) % 1000) / 1000 * 0.55;

  // The prestige a player of this recruiting rating is recruited at.
  const targetLevel = rating => clamp(44 + ((Number(rating) || 76) - 76) * 3.4, 25, 108);

  // How many schools are still on his list at this point of the cycle.
  function listSize(cp) {
    if (cp < 0.25) return 12;
    if (cp < 0.42) return 8;
    if (cp < 0.55) return 5;
    return 3;
  }

  const POS_GROUP = { PG: 'G', CG: 'G', SG: 'G', G: 'G', SF: 'W', GF: 'W', 'G/F': 'W', W: 'W', PF: 'B', 'F/C': 'B', C: 'B', F: 'W' };
  const groupOf = pos => POS_GROUP[String(pos || '').toUpperCase()] || 'W';
  const keyOf = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // What a program has going for it right now, per school: its pull and
  // how many players it will have at each position group next season.
  // ctx.teams: [{ school, prestige, history, simData, expectedWinPct, coach, roster }]
  function schoolContext(teams) {
    const out = {};
    teams.forEach(t => {
      const sd = t.simData || {};
      const gp = (sd.wins || 0) + (sd.losses || 0);
      // This season, against what the roster said it would do.
      const now = gp >= 5 ? clamp(((sd.wins || 0) / gp - (t.expectedWinPct != null ? t.expectedWinPct : 0.5)) * 40, -8, 10) : 0;
      // Last March.
      const last = (t.history || [])[(t.history || []).length - 1];
      const march = last ? (last.ncaaWins || 0) * 2.5 + (last.ncaaSeed ? 2 : 0) + (last.wonNationalTitle ? 4 : 0) : 0;
      const pres = t.prestige != null ? t.prestige : 50;
      const coach = t.coach && t.coach.rep != null ? clamp((t.coach.rep - pres) * 0.25, -6, 8) : 0;
      const staying = { G: 0, W: 0, B: 0 };
      (t.roster || []).forEach(p => { if (!/^(SR|GR)$/i.test(String(p.class || ''))) staying[groupOf(p.pos)]++; });
      out[t.school] = { pull: pres + now + march + coach, trend: now + march + coach, prestige: pres, staying };
    });
    return out;
  }

  // Interest in one school. friends: teammates already committed there.
  function interest(r, school, sc, opts = {}) {
    const s = sc[school];
    if (!s) return 0.02;                                  // not a program in the universe
    const T = targetLevel(r.rating);
    const d = s.pull - T;
    let v = Math.exp(-(d * d) / (2 * 14 * 14)) * clamp(1 + 0.012 * d, 0.6, 1.4);
    const need = s.staying[groupOf(r.pos)];
    v *= clamp(1 + (3.5 - need) * 0.08, 0.8, 1.3);
    v *= affinity(r.name, school);
    if (opts.friends) v *= 1 + Math.min(2, opts.friends) * 0.6;
    if (opts.full) v *= 0.2;
    return v;
  }

  // Picks from the list, weighted toward the schools he likes most.
  function choose(scored, rng = Math.random) {
    const w = scored.map(x => Math.pow(Math.max(0.0001, x.v), 2));
    let t = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < scored.length; i++) { t -= w[i]; if (t <= 0) return scored[i].school; }
    return scored.length ? scored[scored.length - 1].school : null;
  }

  // Teammates: who played high school or AAU ball together, within a
  // class of each other. Returns a function: (recruit, school) -> his
  // teammates already committed there.
  function teammateIndex(recruits, committedTo) {
    const by = new Map();
    const add = (k, r) => { if (!k) return; if (!by.has(k)) by.set(k, []); by.get(k).push(r); };
    recruits.forEach(r => { add(`hs|${keyOf(r.hs)}`, r); add(`aau|${keyOf(r.aauTeam)}`, r); });
    return (r, school) => {
      const out = [];
      [`hs|${keyOf(r.hs)}`, `aau|${keyOf(r.aauTeam)}`].forEach(k => {
        if (k.endsWith('|')) return;
        (by.get(k) || []).forEach(o => {
          if (o === r || out.includes(o) || Math.abs(Number(o.recClassYear) - Number(r.recClassYear)) > 1) return;
          if (committedTo(o) === school) out.push(o);
        });
      });
      return out;
    };
  }

  const api = { affinity, targetLevel, listSize, groupOf, schoolContext, interest, choose, teammateIndex, hash };
  root.RecruitLive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
