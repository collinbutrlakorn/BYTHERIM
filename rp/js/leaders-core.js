// Stat leaders, for the bold marks on player profiles and team pages in all
// three RPs: a player who leads his conference in a stat has it in bold, one
// who leads the NCAA has it in bold italics.
//
// Pure functions (no DOM, no engine state) so the NCAA RP, the Draft RP and
// the tests all read leaders the same way. The NCAA RP builds the rows for a
// season (see SimEngine.leadersFor); the Draft RP and Recruiting page get the
// marks the NCAA RP worked out, carried on each player or season line.
(function (root) {
  // Who is eligible to lead. A leaderboard needs a playing-time bar or the
  // guy who hit his only shot leads the country in FG%; the base bar matches
  // the Stats tab's "qualified only" view (10 mpg, 150 minutes), eased early
  // in a season so a week-three profile can still show who leads.
  const RULES = {
    mpg: 10,             // minutes a game
    minutes: 150,        // season minutes (capped, see minutesPerGame)
    minutesPerGame: 5,   // ...or this many for every game the busiest player has played
    fg: 5,               // shot attempts a game to lead FG% / efficiency
    two: 3,              // 2PA a game to lead 2P%
    three: 2.5,          // 3PA a game to lead 3P%
    ft: 2.5,             // FTA a game to lead FT%
    eff: 5,              // FGA a game to lead TS%, eFG%, ORtg and the like
    p40Mpg: 15           // per-40 rates need a rotation player's minutes
  };

  // The stats that can be led. Anything not here (games, starts, minutes,
  // turnovers, fouls, shot attempts, usage, shot-mix rates) is never marked:
  // leading it isn't an accomplishment, or it's only volume.
  //   dir 'lo' = lower is better; gate = extra eligibility bar (see gateOk).
  const STATS = {
    ppg: {}, oreb: {}, dreb: {}, rpg: {}, apg: {}, stl: {}, blk: {},
    fgm: {}, twoPm: {}, threePm: {}, ftm: {},
    fgPct: { gate: 'fg' }, twoPPct: { gate: 'two' }, threePPct: { gate: 'three' }, ftPct: { gate: 'ft' },
    bpm: {}, obpm: {}, dbpm: {},
    tsPct: { gate: 'eff' }, eFgPct: { gate: 'eff' }, rTsPct: { gate: 'eff' }, ortg: { gate: 'eff' }, netRtg: { gate: 'eff' },
    orebPct: {}, drebPct: {}, trbPct: {}, astPct: {}, blkPct: {},
    drtg: { dir: 'lo' },
    p40pts: { gate: 'p40' }, p40reb: { gate: 'p40' }, p40oreb: { gate: 'p40' }, p40dreb: { gate: 'p40' },
    p40ast: { gate: 'p40' }, p40stl: { gate: 'p40' }, p40blk: { gate: 'p40' }
  };
  // Archived seasons don't keep per-40 lines, so they're figured from the
  // per-game numbers when missing.
  const P40_FROM = { p40pts: 'ppg', p40reb: 'rpg', p40oreb: 'oreb', p40dreb: 'dreb', p40ast: 'apg', p40stl: 'stl', p40blk: 'blk' };
  const KEYS = Object.keys(STATS);

  const num = v => {
    if (v == null || v === '' || v === '—') return NaN;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', ''));
    return isFinite(n) ? n : NaN;
  };

  // rows: [{ id, conf, stats }]. Returns Map id -> { statKey: 'n' | 'c' }:
  // 'n' leads the NCAA, 'c' leads his conference (and not the NCAA). A tie
  // for the lead is a shared lead.
  function compute(rows) {
    const out = new Map();
    const pool = [];
    let maxGp = 0;
    (rows || []).forEach(r => {
      const st = r && r.stats;
      if (!st) return;
      const gp = num(st.gp), mpg = num(st.mpg);
      if (!(gp > 0) || !(mpg > 0)) return;
      const min = num(st.totMin) >= 0 ? num(st.totMin) : gp * mpg;
      if (gp > maxGp) maxGp = gp;
      pool.push({ id: r.id, conf: r.conf || '', st, gp, mpg, min });
    });
    const minMin = Math.min(RULES.minutes, maxGp * RULES.minutesPerGame);
    const base = pool.filter(r => r.mpg >= RULES.mpg && r.min >= minMin);

    const gateOk = (gate, r) => {
      const st = r.st;
      if (gate === 'fg') return num(st.fga) >= RULES.fg;
      if (gate === 'two') return num(st.twoPa) >= RULES.two;
      if (gate === 'three') return num(st.threePa) >= RULES.three;
      if (gate === 'ft') return num(st.fta) >= RULES.ft;
      if (gate === 'eff') return num(st.fga) >= RULES.eff;
      if (gate === 'p40') return r.mpg >= RULES.p40Mpg;
      return true;
    };
    const valueOf = (r, key) => {
      let v = num(r.st[key]);
      if (isNaN(v) && P40_FROM[key]) {
        const per = num(r.st[P40_FROM[key]]);
        if (per >= 0) v = Math.round(per / r.mpg * 400) / 10;
      }
      // Seasons archived before defensive rebounds were kept: boards less the offensive ones.
      if (isNaN(v) && key === 'dreb') {
        const reb = num(r.st.rpg), oreb = num(r.st.oreb);
        if (reb >= 0 && oreb >= 0) v = Math.round((reb - oreb) * 10) / 10;
      }
      // ...and relative true shooting: TS% against the league's, so the same ordering.
      if (isNaN(v) && key === 'rTsPct') {
        const ts = num(r.st.tsPct);
        if (ts >= 0) v = Math.round((ts - 0.545) * 1000) / 10;
      }
      return v;
    };

    KEYS.forEach(key => {
      const spec = STATS[key];
      const lo = spec.dir === 'lo';
      const better = (a, b) => (lo ? a < b : a > b);
      const cands = [];
      let natBest = null;
      const confBest = new Map();
      base.forEach(r => {
        if (spec.gate && !gateOk(spec.gate, r)) return;
        const v = valueOf(r, key);
        if (isNaN(v)) return;
        cands.push({ r, v });
        if (natBest === null || better(v, natBest)) natBest = v;
        if (r.conf) {
          const c = confBest.get(r.conf);
          if (c === undefined || better(v, c)) confBest.set(r.conf, v);
        }
      });
      // A zero (or negative) lead isn't a lead: nobody "leads" in 0.0 blocks.
      const real = v => v !== null && v > 0;
      cands.forEach(({ r, v }) => {
        let m = '';
        if (real(natBest) && v === natBest) m = 'n';
        else if (r.conf && real(confBest.get(r.conf)) && v === confBest.get(r.conf)) m = 'c';
        if (!m) return;
        let e = out.get(r.id);
        if (!e) { e = {}; out.set(r.id, e); }
        e[key] = m;
      });
    });
    return out;
  }

  // ---------- Showing it ----------
  // 'n' bold italics, 'c' bold; anything else is left alone. The cell's text
  // is already safe HTML. A title tells a hover or a screen reader why.
  function mark(html, m) {
    if (m === 'n') return `<b class="lead-n"><i title="Leads the NCAA">${html}</i></b>`;
    if (m === 'c') return `<b class="lead-c" title="Leads the conference">${html}</b>`;
    return html;
  }
  // AAU and FIBA lines carry a plain list of the stats that led.
  function markList(html, key, list) {
    return list && list.indexOf(key) !== -1 ? `<b class="lead-c" title="Led the field">${html}</b>` : html;
  }

  // The note under a stat table.
  function legend(kind) {
    const body = kind === 'aau' ? '<b>Bold</b> led all AAU circuits'
      : kind === 'fiba' ? '<b>Bold</b> led the FIBA field'
      : kind === 'summer' ? '<b>Bold</b> led all AAU circuits or the FIBA field'
      : '<b>Bold</b> leads the conference &middot; <b><i>Bold italics</i></b> leads the NCAA';
    return `<p class="leader-legend">${body}</p>`;
  }

  const api = { RULES, STATS, KEYS, compute, mark, markList, legend };
  root.LeadersCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
