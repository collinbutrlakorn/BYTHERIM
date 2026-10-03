// ============================================================
// Box Plus/Minus, the Barttorvik way.
//
// Every BPM in the RP (college seasons, conference splits, the summer
// circuit) comes from here, so the numbers read like the ones on
// barttorvik.com rather than Basketball-Reference's NBA BPM 2.0. The two
// share a shape (box-score rates per 100 possessions, a position term,
// then a team adjustment) but differ where it matters for college:
//
//   1. The box-score weights are college ones. They were fitted to
//      Barttorvik's own published BPM, OBPM and DBPM for every Division I
//      player in 2024-25 and 2025-26 (about 6,600 player seasons), with
//      each team's players compared against one another so the team
//      adjustment below doesn't leak into the weights. Compared with the
//      NBA version, an assist from a big man and a block from anyone
//      count for more, and missed shots cost less.
//
//   2. The team adjustment uses the team's adjusted efficiency margin
//      (points per 100 possessions, corrected for opponents and for home
//      court), not its raw net rating. Barttorvik's numbers satisfy
//          sum over players of (share of minutes x BPM) = 1.2 x AdjEM
//      almost exactly, so a player on a strong team in a hard league is
//      rated higher than the same box score on a weak team in a soft one.
//      OBPM does the same against adjusted offensive efficiency, and DBPM
//      is what's left (BPM - OBPM).
//
//   3. For the college season the AdjEM spread is set to Division I's
//      (a standard deviation of about 12.7 points per 100), because
//      simulated games are a little closer than real ones. That keeps the
//      gap between a high-major rotation player and a low-major one where
//      Barttorvik has it.
//
// Positions come from the roster (PG = 1 ... C = 5), the way Barttorvik's
// role labels (Pure PG, Wing F, PF/C, C) set it.
// ============================================================
(function (root) {
  // [point guard, centre]; a player in between is interpolated.
  const COEF = {
    bpm: {
      pts: [0.425, 0.547], tpm: [0.684, 0.405], ast: [0.388, 1.201], tov: [-0.841, -0.853],
      orb: [0.754, 0.414], drb: [0.235, 0.047], stl: [1.261, 1.333], blk: [1.282, 1.140],
      pf: [-0.366, -0.137], fga: [-0.350, -0.513], fta: [-0.004, -0.218], guard: -0.411
    },
    obpm: {
      pts: [0.374, 0.501], tpm: [0.716, 0.542], ast: [0.423, 0.710], tov: [-0.787, -0.877],
      orb: [0.628, 0.458], drb: [-0.050, -0.057], stl: [0.368, 0.404], blk: [0.064, -0.012],
      pf: [-0.209, -0.086], fga: [-0.222, -0.359], fta: [0.046, -0.143], guard: -0.482
    }
  };
  const KEYS = ['pts', 'tpm', 'ast', 'tov', 'orb', 'drb', 'stl', 'blk', 'pf', 'fga', 'fta'];
  const POS = { PG: 1.25, G: 2, CG: 2, SG: 2.5, 'G/F': 3, W: 3, SF: 3.5, F: 3.75, PF: 4.25, 'F/C': 4.5, C: 5 };
  const TEAM_FACTOR = 1.2;      // sum(min share x BPM) = 1.2 x AdjEM
  const HOME_COURT = 3.0;       // points per 100 possessions
  const D1_SPREAD = 12.7;       // SD of Division I AdjEM (Barttorvik, 2024-25)
  const LIMIT = 40;             // a two-minute cameo can't read +90

  const n = v => (Number(v) || 0);
  const posNum = p => POS[String(p || '').toUpperCase()] || 3;
  const possOf = s => n(s.fga) - n(s.oreb) + n(s.tov) + 0.44 * n(s.fta);

  // Raw (pre-team-adjustment) value from per-100 rates.
  function raw(kind, r, pos) {
    const c = COEF[kind], f = (pos - 1) / 4;
    let v = 0;
    KEYS.forEach(k => { v += (c[k][0] + (c[k][1] - c[k][0]) * f) * r[k]; });
    return v + c.guard * Math.max(0, (3 - pos) / 2);
  }

  // Opponent- and venue-adjusted offensive and defensive efficiency for
  // every team, KenPom/Barttorvik style: each game's points per 100 is
  // credited against the opponent's adjusted numbers, iterated until it
  // settles. games: [{ team, opp, pf, pa, loc }] (loc 1 home, -1 away,
  // 0 neutral), one entry per team per game.
  function teamRatings(games, paceOf) {
    const T = new Map();
    games.forEach(g => {
      if (!paceOf.has(g.team) || !paceOf.has(g.opp)) return;
      const poss = (paceOf.get(g.team) + paceOf.get(g.opp)) / 2;
      if (!(poss > 0)) return;
      if (!T.has(g.team)) T.set(g.team, { games: [] });
      T.get(g.team).games.push({ opp: g.opp, o: 100 * n(g.pf) / poss, d: 100 * n(g.pa) / poss, loc: n(g.loc) });
    });
    let sum = 0, cnt = 0;
    T.forEach(t => t.games.forEach(g => { sum += g.o; cnt++; }));
    const lg = cnt ? sum / cnt : 100;
    T.forEach(t => { t.adjO = lg; t.adjD = lg; });
    for (let it = 0; it < 30; it++) {
      const next = new Map();
      T.forEach((t, name) => {
        let o = 0, d = 0, k = 0;
        t.games.forEach(g => {
          const op = T.get(g.opp);
          if (!op) return;
          const h = g.loc * HOME_COURT / 2;
          o += g.o - h - (op.adjD - lg);
          d += g.d + h - (op.adjO - lg);
          k++;
        });
        next.set(name, k ? [o / k, d / k] : [lg, lg]);
      });
      next.forEach((v, name) => { const t = T.get(name); t.adjO = v[0]; t.adjD = v[1]; });
    }
    return { teams: T, lg };
  }

  // players: [{ key, team, pos, s }] where s holds season totals (min,
  //   pts, fga, fta, threePm, ast, tov, oreb, dreb, reb, stl, blk, pf).
  //   Every player who saw the floor for a team should be included: the
  //   team adjustment is shared out across them.
  // games: as teamRatings.
  // opts.spread: target SD of AdjEM (D1_SPREAD for a college season), or
  //   omit to keep the margins as played.
  // opts.ratings: a previous result ({ teams, lg, scale }) whose team
  //   ratings to use instead of rating teams from these games.
  // Returns { players: Map key -> { bpm, obpm, dbpm }, teams: Map }.
  function season(players, games, opts = {}) {
    const byTeam = new Map();
    players.forEach(p => {
      if (!p || !p.s || !(n(p.s.min) > 0) || !p.team) return;
      if (!byTeam.has(p.team)) byTeam.set(p.team, []);
      byTeam.get(p.team).push(p);
    });
    // Team totals from its own players; pace = possessions per game.
    const gamesOf = new Map();
    games.forEach(g => gamesOf.set(g.team, (gamesOf.get(g.team) || 0) + 1));
    const tot = new Map(), paceOf = new Map();
    let lgPts = 0, lgTsa = 0;
    byTeam.forEach((ps, team) => {
      const S = { min: 0, pts: 0, fga: 0, fta: 0, oreb: 0, tov: 0 };
      ps.forEach(p => Object.keys(S).forEach(k => { S[k] += n(p.s[k]); }));
      S.poss = possOf(S);
      tot.set(team, S);
      const g = gamesOf.get(team) || 0;
      if (g > 0 && S.poss > 0) paceOf.set(team, S.poss / g);
      lgPts += S.pts; lgTsa += S.fga + 0.44 * S.fta;
    });
    const lgPps = lgTsa > 0 ? lgPts / lgTsa : 1.1;

    // A split (conference games only) is still judged against the
    // season's team ratings, as Barttorvik's splits are.
    const R = opts.ratings ? { teams: opts.ratings.teams, lg: opts.ratings.lg } : teamRatings(games, paceOf);
    let scale = opts.ratings ? opts.ratings.scale || 1 : 1;
    if (!opts.ratings && opts.spread && R.teams.size >= 20) {
      let sq = 0;
      R.teams.forEach(t => { sq += (t.adjO - t.adjD) ** 2; });
      const sd = Math.sqrt(sq / R.teams.size);
      if (sd > 0.5) scale = opts.spread / sd;
    }

    const out = new Map();
    byTeam.forEach((ps, team) => {
      const S = tot.get(team);
      if (!(S.min > 0) || !(S.poss > 0)) return;
      const rows = ps.map(p => {
        const s = p.s, share = n(s.min) / (S.min / 5);
        const onPoss = Math.max(1, share * S.poss);
        const per = v => 100 * n(v) / onPoss;
        const tsa = n(s.fga) + 0.44 * n(s.fta);
        // Points above what a league-average shooter makes on the same tries.
        const adjPts = tsa > 0 ? (n(s.pts) / tsa - lgPps + 1) * tsa : 0;
        const r = {
          pts: per(adjPts), tpm: per(s.threePm), ast: per(s.ast), tov: per(s.tov), orb: per(s.oreb),
          drb: per(s.dreb != null ? s.dreb : n(s.reb) - n(s.oreb)), stl: per(s.stl), blk: per(s.blk),
          pf: per(s.pf), fga: per(s.fga), fta: per(s.fta)
        };
        const pos = posNum(p.pos);
        return { p, share, b: raw('bpm', r, pos), o: raw('obpm', r, pos) };
      });
      const t = R.teams.get(team);
      const em = t ? (t.adjO - t.adjD) * scale : 0;
      const oe = t ? (t.adjO - R.lg) * scale : 0;
      const sb = rows.reduce((a, x) => a + x.share * x.b, 0);
      const so = rows.reduce((a, x) => a + x.share * x.o, 0);
      const cb = (TEAM_FACTOR * em - sb) / 5, co = (TEAM_FACTOR * oe - so) / 5;
      const lim = v => Math.max(-LIMIT, Math.min(LIMIT, v));
      rows.forEach(x => {
        const bpm = lim(x.b + cb), obpm = lim(x.o + co);
        out.set(x.p.key, { bpm, obpm, dbpm: bpm - obpm });
      });
    });
    return { players: out, teams: R.teams, lg: R.lg, scale };
  }

  // Rough expectation for a player of a given rating and position, for
  // judging whether he outplayed his rating. Fitted to simulated seasons.
  const POS_BASE = { PG: 0, G: 0.15, CG: 0.15, SG: 0.3, 'G/F': 1.0, W: 1.4, SF: 1.8, F: 1.8, PF: 1.85, 'F/C': 2.5, C: 3.2 };
  function expected(rating, pos) {
    const r = n(rating);
    return -0.66 + 0.42 * (r - 74) + (POS_BASE[String(pos || '').toUpperCase()] || 1);
  }

  // How far a position's typical BPM sits from the all-positions norm.
  const positionLean = pos => (POS_BASE[String(pos || '').toUpperCase()] || 1.3) - 1.3;

  const api = { season, teamRatings, expected, positionLean, COEF, POS, TEAM_FACTOR, D1_SPREAD };
  root.TorvikBPM = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
