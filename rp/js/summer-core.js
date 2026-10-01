// ============================================================
// The summer circuit: AAU and FIBA.
//
// Between one college season and the next, the high-school classes play
// their summer:
//   - the AAU circuits (Nike EYBL, Adidas 3SSB, Under Armour Association):
//     every program plays four sessions of league games, and the best
//     eight of each circuit meet in its championship (Peach Jam, the 3SSB
//     Championship, the UAA Finals). Rosters are the rising seniors and
//     rising juniors on each program (see RecruitGen.AAU_PROGRAMS).
//   - a FIBA youth World Cup: the U17 in even summers, the U19 in odd
//     ones. Sixteen nations, four groups of four, then an eight-team
//     knockout. The universe's prospects play for their countries; the
//     rest of each roster is national-team depth made up for the event.
//
// The summer is a short season of its own, played a step at a time (see
// plan / playStep below). This module decides who plays where, the
// schedule and the brackets, keeps every game's box score, and turns them
// into standings, leaders and the season lines the recruiting page shows.
// The games themselves are played by the caller (the NCAA RP plays them
// with the same engine as every college game), through `play`.
// Everything but the games is seeded by the summer, so the same universe
// always picks the same rosters and schedule.
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
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const norm = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const RG = () => root.RecruitGen || {};

  const ROSTER_MIN = 8, ROSTER_MAX = 12, PER_PROGRAM = 10;
  const circuits = () => RG().CIRCUITS || [
    { key: 'EYBL', name: 'Nike EYBL', event: 'Peach Jam' },
    { key: '3SSB', name: 'Adidas 3SSB', event: '3SSB Championship' },
    { key: 'UAA', name: 'Under Armour Association', event: 'UAA Finals' }
  ];
  const regionOf = st => (RG().regionOf ? RG().regionOf(st) : 'SE');
  const byRank = (a, b) => (a.rank || 999) - (b.rank || 999) || (b.rating || 0) - (a.rating || 0);

  // ---------- AAU programs ----------
  //
  // players: [{ id, name, aauTeam, state, rank, rating, sheet }]
  // Each player plays for the program he's listed with. A sheet player
  // listed with a program the circuit doesn't have brings it in. Rosters
  // are evened out (8 to 12), moving the lowest-ranked generated players
  // to a thin roster near home; a sheet player is never moved off his team.
  function assignPrograms(players, season) {
    const programs = new Map();
    (RG().AAU_PROGRAMS || []).forEach(p => programs.set(norm(p.name), { name: p.name, circuit: p.circuit, region: p.region, members: [] }));
    const pool = [];
    players.slice().sort(byRank).forEach(pl => {
      const k = norm(pl.aauTeam);
      if (k && programs.has(k)) { programs.get(k).members.push(pl); return; }
      if (k && pl.sheet && !/^(n a|na|none|tbd|unknown)$/.test(k)) {
        const cs = circuits();
        programs.set(k, { name: String(pl.aauTeam).trim(), circuit: cs[hash(k) % cs.length].key, region: regionOf(pl.state), guest: true, members: [pl] });
        return;
      }
      pool.push(pl);
    });
    let list = [...programs.values()];
    const size = p => p.members.length;
    const movable = p => p.members.filter(m => !m.sheet).sort(byRank);

    // As many programs as there are players to fill them: guests (the
    // sheet's own teams) first, then the fullest.
    const n = Math.max(2, Math.floor(players.length / PER_PROGRAM));
    list.sort((a, b) => (!!b.guest - !!a.guest) || size(b) - size(a) || a.name.localeCompare(b.name));
    list.slice(n).forEach(p => { pool.push(...p.members); p.members = []; });
    list = list.slice(0, n);
    // Too many on one roster: the lowest-ranked generated players go.
    list.forEach(p => {
      const extra = size(p) - ROSTER_MAX;
      if (extra > 0) { const out = movable(p).slice(-extra); p.members = p.members.filter(m => !out.includes(m)); pool.push(...out); }
    });
    // The rest join the thinnest roster near home.
    pool.sort(byRank).forEach(pl => {
      const open = list.filter(p => size(p) < ROSTER_MAX);
      if (!open.length) return;
      const home = open.filter(p => p.region === regionOf(pl.state));
      const pick = (home.length ? home : open).sort((a, b) => size(a) - size(b) || a.name.localeCompare(b.name))[0];
      pick.members.push(pl);
      pl.moved = true;
    });
    // Thin rosters borrow from the deepest, the same region first.
    for (let guard = 0; guard < 600; guard++) {
      const thin = list.filter(p => size(p) < ROSTER_MIN).sort((a, b) => size(a) - size(b))[0];
      if (!thin) break;
      const donor = list.filter(p => p !== thin && size(p) > ROSTER_MIN && movable(p).length)
        .sort((a, b) => ((b.region === thin.region) - (a.region === thin.region)) || size(b) - size(a))[0];
      if (!donor) break;
      const m = movable(donor).slice(-1)[0];
      donor.members = donor.members.filter(x => x !== m);
      thin.members.push(m);
      m.moved = true;
    }
    list = list.filter(p => size(p) >= 5);
    // Every circuit needs enough programs for a league.
    circuits().forEach(c => {
      const mine = list.filter(p => p.circuit === c.key);
      if (mine.length && mine.length < 4) {
        const other = circuits().filter(x => x.key !== c.key)
          .sort((a, b) => list.filter(p => p.circuit === a.key).length - list.filter(p => p.circuit === b.key).length)[0];
        mine.forEach(p => { p.circuit = other.key; });
      }
    });
    const teamOf = new Map();
    list.forEach(p => { p.members.sort(byRank); p.members.forEach(m => teamOf.set(m.id, p.name)); });
    return { programs: list.map(p => ({ name: p.name, circuit: p.circuit, region: p.region, guest: !!p.guest, roster: p.members.map(m => m.id), moved: p.members.filter(m => m.moved).map(m => m.id) })), teamOf };
  }

  // ---------- stats ----------
  const SUM = ['min', 'pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'twoPm', 'twoPa', 'threePm', 'threePa', 'ftm', 'fta'];
  const totals = lines => {
    const t = {};
    SUM.forEach(k => { t[k] = lines.reduce((n, l) => n + (Number(l[k]) || 0), 0); });
    t.poss = t.fga + 0.44 * t.fta - t.oreb + t.tov;
    return t;
  };
  function Ledger() { this.by = new Map(); }
  Ledger.prototype.game = function (lines, oppLines, tag) {
    const team = totals(lines), opp = totals(oppLines);
    lines.forEach(l => {
      if (!l.id || !(Number(l.min) > 0)) return;
      let a = this.by.get(l.id);
      if (!a) { a = { gp: 0, gs: 0, tag, name: l.name }; SUM.forEach(k => { a[k] = 0; }); ['tMin', 'tFga', 'tFta', 'tTov', 'tFgm', 'tOreb', 'tDreb', 'oOreb', 'oDreb', 'oPoss', 'o2pa', 'oPts', 'tPoss'].forEach(k => { a[k] = 0; }); this.by.set(l.id, a); }
      a.gp++;
      if (l.started) a.gs++;
      SUM.forEach(k => { a[k] += Number(l[k]) || 0; });
      a.tMin += team.min; a.tFga += team.fga; a.tFta += team.fta; a.tTov += team.tov; a.tFgm += team.fgm;
      a.tOreb += team.oreb; a.tDreb += team.dreb; a.oOreb += opp.oreb; a.oDreb += opp.dreb;
      a.oPoss += opp.poss; a.o2pa += opp.twoPa; a.oPts += opp.pts; a.tPoss += team.poss;
    });
  };

  const r1 = v => Math.round(v * 10) / 10;
  const pct = v => `${r1(clamp(v, 0, 100)).toFixed(1)}%`;
  const d3 = v => clamp(v, 0, 9.999).toFixed(3).replace(/^0/, '');
  const gameScore = a => a.pts + 0.4 * a.fgm - 0.7 * a.fga - 0.4 * (a.fta - a.ftm) + 0.7 * a.oreb + 0.3 * a.dreb + a.stl + 0.7 * a.ast + 0.7 * a.blk - 0.4 * a.pf - a.tov;
  const offScore = a => a.pts + 0.4 * a.fgm - 0.7 * a.fga - 0.4 * (a.fta - a.ftm) + 0.7 * a.oreb + 0.7 * a.ast - a.tov;
  const per40 = (a, v) => (a.min > 0 ? v / a.min * 40 : 0);
  const RIM = { C: 0.74, PF: 0.62, SF: 0.5, SG: 0.4, CG: 0.42, PG: 0.44 };

  // A season line in the recruiting page's columns (the same ones the
  // sheet and the generator use). base: { gs40, o40 } across the event,
  // so box plus-minus is measured against everyone who played in it.
  function line(a, pos, base) {
    const g = Math.max(1, a.gp), m = Math.max(1, a.min);
    const share = m / Math.max(1, a.tMin / 5);
    const fga2 = a.twoPa, fga3 = a.threePa;
    const ts = a.pts / Math.max(1, 2 * (a.fga + 0.44 * a.fta));
    const gs40 = per40(a, gameScore(a)), o40 = per40(a, offScore(a));
    const bpm = clamp((gs40 - base.gs40) * 0.62, -12, 18), obpm = clamp((o40 - base.o40) * 0.62, -12, 16);
    const rimShare = RIM[String(pos || '').toUpperCase()] || 0.5;
    const fg2 = a.twoPm / Math.max(1, fga2);
    const rim = fga2 * rimShare, mids = fga2 - rim;
    const perPos = v => r1(v / g);
    return {
      gp: a.gp, mpg: r1(a.min / g), ppg: perPos(a.pts), rpg: perPos(a.reb), apg: perPos(a.ast), spg: perPos(a.stl), bpg: perPos(a.blk), topg: perPos(a.tov),
      fg: pct(100 * a.fgm / Math.max(1, a.fga)), fg2: pct(100 * fg2), fg3: pct(100 * a.threePm / Math.max(1, fga3)), ft: pct(100 * a.ftm / Math.max(1, a.fta)),
      bpm: r1(bpm), obpm: r1(obpm), dbpm: r1(bpm - obpm),
      ts: pct(100 * ts), rts: pct(100 * (ts - 0.54)), efg: pct(100 * (a.fgm + 0.5 * a.threePm) / Math.max(1, a.fga)),
      oreb: pct(100 * a.oreb / Math.max(1, share * (a.tOreb + a.oDreb))), dreb: pct(100 * a.dreb / Math.max(1, share * (a.tDreb + a.oOreb))),
      trb: pct(100 * a.reb / Math.max(1, share * (a.tOreb + a.tDreb + a.oOreb + a.oDreb))),
      ast: pct(100 * a.ast / Math.max(1, share * a.tFgm - a.fgm)), tov: pct(100 * a.tov / Math.max(1, a.fga + 0.44 * a.fta + a.tov)),
      stl: pct(100 * a.stl / Math.max(1, share * a.oPoss)), blk: pct(100 * a.blk / Math.max(1, share * a.o2pa)),
      usg: pct(100 * (a.fga + 0.44 * a.fta + a.tov) / Math.max(1, share * (a.tFga + 0.44 * a.tFta + a.tTov))),
      ftr: d3(a.fta / Math.max(1, a.fga)), p3ar: d3(fga3 / Math.max(1, a.fga)),
      ortg: r1(100 * a.pts / Math.max(1, a.fga + 0.44 * a.fta + a.tov) * 0.93), drtg: r1(100 * a.oPts / Math.max(1, a.oPoss)),
      fga2: perPos(fga2), rimFga: perPos(rim), rimPct: pct(100 * clamp(fg2 + 0.1, 0.4, 0.82)),
      shortMidFga: perPos(mids * 0.55), shortMidPct: pct(100 * clamp(fg2 - 0.08, 0.25, 0.62)),
      longMidFga: perPos(mids * 0.45), longMidPct: pct(100 * clamp(fg2 - 0.12, 0.2, 0.58)),
      rimMidRatio: (rim / Math.max(0.1, mids)).toFixed(2), fga3: perPos(fga3), fta: perPos(a.fta)
    };
  }
  function baseOf(ledger) {
    let min = 0, gs = 0, o = 0;
    ledger.by.forEach(a => { min += a.min; gs += gameScore(a); o += offScore(a); });
    return { gs40: min ? gs / min * 40 : 10, o40: min ? o / min * 40 : 8 };
  }

  // FIBA youth World Cup: U17 in even summers, U19 in odd ones.
  function fibaEvent(season) {
    const age = season % 2 === 0 ? 17 : 19;
    return { age, name: `FIBA U${age} World Cup`, short: `U${age} World Cup`, team: `U${age}` };
  }
  // The field, strongest first. Depth players are rated by where the
  // nation sits.
  const NATIONS = ['Canada', 'France', 'Spain', 'Serbia', 'Australia', 'Lithuania', 'Germany', 'Slovenia', 'Turkey', 'Italy',
    'Greece', 'Croatia', 'Latvia', 'Argentina', 'Brazil', 'Mali', 'Senegal', 'Nigeria', 'Puerto Rico', 'Dominican Republic',
    'Israel', 'Finland', 'Belgium', 'Cameroon', 'Sweden', 'Netherlands', 'South Sudan', 'DR Congo', 'England'];
  const depthRating = nation => { const i = NATIONS.indexOf(nation); return i < 0 ? 66 : i < 6 ? 73 : i < 14 ? 70 : 67; };
  const POS_CYCLE = ['PG', 'SG', 'SF', 'PF', 'C', 'SG', 'SF', 'PF', 'PG', 'C', 'SF', 'PF'];
  function depthPlayer(nation, season, i, rng) {
    const RGn = root.RosterGen;
    const who = RGn && RGn.identityFrom ? RGn.identityFrom(nation, rng) : { name: `${nation} Player ${i + 1}` };
    const pos = POS_CYCLE[i % POS_CYCLE.length];
    const b = RGn && RGn.generateBuild ? RGn.generateBuild(pos, rng) : { ht: "6'6", wt: '200', heightInches: 78 };
    return { id: `fiba|${season}|${nation}|${i}`, name: who.name, pos, ht: b.ht, wt: b.wt, rating: Math.round(depthRating(nation) + (rng() - 0.5) * 6 - i * 0.35), depth: true, nation };
  }

  // eligible: [{ id, name, nation, rank, rating, pos }] — every prospect
  // young enough, with his country ('USA' for Americans).
  function buildNations(eligible, season) {
    const rng = rngFor(`summer|${season}|fiba`);
    const byNation = {};
    eligible.forEach(p => { (byNation[p.nation] = byNation[p.nation] || []).push(p); });
    // Team USA: the best Americans, less the few who sit it out.
    const us = (byNation.USA || []).slice().sort(byRank).filter(p => !(p.rank && p.rank <= 20 && rngFor(`summer|${season}|decline|${p.name}`)() < 0.2));
    const teams = [{ name: 'USA', players: us.slice(0, 12) }];
    const others = Object.keys(byNation).filter(n => n !== 'USA')
      .sort((a, b) => byNation[b].length - byNation[a].length || NATIONS.indexOf(a) - NATIONS.indexOf(b));
    const field = others.filter(n => NATIONS.includes(n)).slice(0, 15);
    NATIONS.forEach(n => { if (field.length < 15 && !field.includes(n)) field.push(n); });
    field.forEach(n => {
      const own = (byNation[n] || []).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 12);
      const players = own.slice();
      for (let i = 0; players.length < 12; i++) players.push(depthPlayer(n, season, i, rng));
      teams.push({ name: n, players });
    });
    const need = teams[0].players.length;
    for (let i = 0; need + i < 12; i++) teams[0].players.push(depthPlayer('USA', season, i, rng));
    return teams;
  }

  const GAME_MIN = { aau: 32, fiba: 40 };
  const GC = () => root.GameCore;

  // ---------- profiles: a player's summer, from his written lines ----------
  //
  // written: { aau, fiba, hs } as { gp, mpg, ppg, rpg, apg, spg, bpg, topg,
  // fg2, fg3, ft, fga2, fga3, fta } (percentages 0-100). For an event, the
  // line for that event if he has one, else the nearest one.
  const LINE_KEYS = ['gp', 'mpg', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg', 'fg2', 'fg3', 'ft', 'fga2', 'fga3', 'fta'];
  const fromArr = a => (Array.isArray(a) ? Object.fromEntries(LINE_KEYS.map((k, i) => [k, a[i] == null ? null : a[i]])) : a || null);
  const pctOf = v => { const n = parseFloat(String(v == null ? '' : v).replace('%', '')); return isNaN(n) ? null : n; };
  function writtenLine(p, kind) {
    const w = p.written || {};
    const order = kind === 'fiba' ? ['fiba', 'aau', 'hs'] : ['aau', 'hs', 'fiba'];
    for (const t of order) { const l = fromArr(w[t]); if (l && l.gp && l.ppg != null && l.mpg) return { ...l, from: t }; }
    // Nothing written: what a player of his rating and position does.
    const gen = RG().statLine;
    if (gen) {
      const l = gen(rngFor(`summer|line|${p.id}|${kind}`), p.pos || 'SF', p.recRating || 80, kind);
      return { gp: l.gp, mpg: l.mpg, ppg: l.ppg, rpg: l.rpg, apg: l.apg, spg: l.spg, bpg: l.bpg, topg: l.topg, fg2: pctOf(l.fg2), fg3: pctOf(l.fg3), ft: pctOf(l.ft), fga2: l.fga2, fga3: l.fga3, fta: l.fta, from: 'model' };
    }
    return { gp: 20, mpg: 24, ppg: 10, rpg: 4, apg: 2, spg: 1, bpg: 0.5, topg: 2, fg2: 50, fg3: 33, ft: 70, fga2: 6, fga3: 3, fta: 3, from: 'model' };
  }
  const PAR_DEFAULT = { C: 0.06, PF: 0.22, 'F/C': 0.12, SF: 0.38, W: 0.4, F: 0.28, SG: 0.45, CG: 0.42, PG: 0.42, G: 0.44 };
  // Minutes on a deep summer roster, best player first (per 32 or 40).
  const MIN_TEMPLATE = { aau: [25, 23, 21, 19, 17, 15, 13, 10, 7, 5, 3, 2], fiba: [30, 28, 26, 24, 22, 19, 16, 13, 10, 7, 4, 1] };

  // A team's players (sorted best first), each with his expected line for
  // this event: his per-minute rates and shooting, minutes by his place in
  // the rotation, and the team's scoring sized to a believable game.
  function profileTeam(members, kind) {
    const G = GAME_MIN[kind], M = 5 * G;
    const list = members.slice().sort((a, b) => (b.talent || 0) - (a.talent || 0));
    const lines = list.map(p => (p.depth ? null : writtenLine(p, kind)));
    const tmpl = MIN_TEMPLATE[kind];
    // His written minutes tilt the template a little (a starter by trade
    // plays more than a specialist of the same standing).
    const avgM = lines.filter(Boolean).reduce((n, l) => n + l.mpg, 0) / Math.max(1, lines.filter(Boolean).length) || 24;
    let mins = list.map((p, i) => (tmpl[i] || 0) * (lines[i] ? Math.pow(clamp(lines[i].mpg / avgM, 0.6, 1.4), 0.5) : 1));
    const tot = mins.reduce((n, m) => n + m, 0) || 1;
    mins = mins.map(m => Math.min(G * 0.9, m * M / tot));
    const out = list.map((p, i) => {
      const m = mins[i];
      if (p.depth) {
        // National-team depth: a modest line for his standing.
        const q = clamp((p.rating - 62) / 16, 0, 1);
        return { id: p.id, exp: { mpg: m, ppg: m * (0.22 + q * 0.12), rpg: m * 0.16, apg: m * 0.06, stl: m * 0.03, blk: m * 0.02, tov: m * 0.05, pf: m / 11, fta: m * 0.07, ftPct: 0.68, threePar: PAR_DEFAULT[p.pos] || 0.35, threePPct: 0.31 + q * 0.04, twoPPct: 0.46 + q * 0.05 } };
      }
      const l = lines[i], per = v => (v == null ? 0 : v / l.mpg);
      const att2 = l.fga2, att3 = l.fga3 != null && l.fga3 <= 15 ? l.fga3 : null;
      const par = att2 != null && att3 != null && att2 + att3 > 0 ? att3 / (att2 + att3) : (PAR_DEFAULT[p.pos] || 0.35);
      const pct = (v, lo, hi, d) => (v == null || v > 100 || v <= 0 ? d : clamp(v / 100, lo, hi));
      return {
        id: p.id, from: l.from,
        exp: {
          mpg: m, ppg: per(l.ppg) * m, rpg: per(l.rpg) * m, apg: per(l.apg) * m, stl: per(l.spg) * m, blk: per(l.bpg) * m,
          tov: Math.max(0.2, per(l.topg) * m), pf: m / 11, fta: (l.fta != null && l.fta <= 20 ? per(l.fta) : per(l.ppg) * 0.2) * m,
          ftPct: pct(l.ft, 0.4, 0.95, 0.7), threePar: clamp(par, 0.01, 0.7), threePPct: pct(l.fg3, 0.15, 0.5, 0.32), twoPPct: pct(l.fg2, 0.36, 0.8, 0.5)
        }
      };
    });
    // A believable team: scoring and rebounding in range for the game's
    // length, by taking from volume (who shoots, who rebounds) rather than
    // anyone's efficiency.
    const k = G / 40;
    const sum = key => out.reduce((n, o) => n + (o.exp[key] || 0), 0);
    const P = sum('ppg'), R = sum('rpg'), A = sum('apg');
    const SCORE = { aau: [58, 76], fiba: [62, 86] }[kind];
    const fp = P > 0 ? clamp(P, SCORE[0], SCORE[1]) / P : 1;
    const fr = R > 0 ? clamp(R, 33 * k, 44 * k) / R : 1;
    const fa = A > 0 ? Math.min(1, (17 * k) / A) : 1;
    const r3 = v => Math.round(v * 1000) / 1000;
    // A loaded roster sheds scoring mostly from the bottom of the rotation:
    // its stars still get their shots.
    const n = out.length;
    const shed = out.map((o, i) => (fp < 1 ? Math.pow(fp, 0.35 + 1.5 * (n > 1 ? i / (n - 1) : 0)) : fp));
    const P2 = out.reduce((t, o, i) => t + o.exp.ppg * shed[i], 0);
    const fix = P2 > 0 ? (P * fp) / P2 : 1;
    out.forEach((o, i) => {
      const f = shed[i] * fix;
      o.exp.ppg *= f; o.exp.fta *= f; o.exp.rpg *= fr; o.exp.apg *= fa;
      Object.keys(o.exp).forEach(key => { o.exp[key] = r3(o.exp[key]); });
    });
    return out;
  }

  // ---------- the summer as a short season ----------
  //
  // A summer is planned in full up front (who plays where, every league
  // game, the FIBA draw) and then played one step at a time:
  //   AAU Sessions 1-4 (three league games a program each), the circuit
  //   championships (quarterfinals and semifinals, then the finals), and
  //   the FIBA World Cup (group stage; quarterfinals and semifinals; the
  //   medal games).
  // The plan is plain data (it lives in the save and is published with the
  // universe), and every game is kept with its box score:
  //   { id, st: step key, ev: 'EYBL' | '3SSB' | 'UAA' | 'FIBA', rd: round,
  //     h, a, hs, as, b: [homeLines, awayLines] }
  // with each line [id, min, pts, oreb, dreb, ast, stl, blk, tov, pf,
  // twoPm, twoPa, threePm, threePa, ftm, fta, started].
  // Standings, brackets, leaders and season lines are all worked out from
  // the games, so nothing can drift out of step with them.
  const LINE = ['id', 'min', 'pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'twoPm', 'twoPa', 'threePm', 'threePa', 'ftm', 'fta', 'started'];
  const pack = l => LINE.map(k => (k === 'started' ? (l.started ? 1 : 0) : k === 'id' ? l.id : Math.round(Number(l[k]) || 0)));
  function unpack(arr, names) {
    const l = {};
    LINE.forEach((k, i) => { l[k] = arr[i]; });
    l.started = !!l.started;
    l.reb = l.oreb + l.dreb;
    l.fgm = l.twoPm + l.threePm;
    l.fga = l.twoPa + l.threePa;
    l.name = (names && names[l.id]) || '';
    return l;
  }
  const linesOf = (g, names) => [(g.b && g.b[0] || []).map(x => unpack(x, names)), (g.b && g.b[1] || []).map(x => unpack(x, names))];
  const winnerOf = g => (g.hs > g.as ? g.h : g.a);
  const loserOf = g => (g.hs > g.as ? g.a : g.h);
  const strip = g => ({ id: g.id, home: g.h, away: g.a, hs: g.hs, as: g.as, winner: winnerOf(g) });

  // opts: { aauPlayers, fibaEligible, ratingOf(id) }
  function plan(season, opts) {
    const rng = rngFor(`summer|${season}|aau`);
    const { programs } = assignPrograms(opts.aauPlayers || [], season);
    const names = {};
    (opts.aauPlayers || []).forEach(p => { names[p.id] = p.name; });
    const circuitList = circuits().map(c => {
      const progs = programs.filter(p => p.circuit === c.key);
      if (progs.length < 2) return null;
      const met = new Set();
      const pairKey = (a, b) => [a, b].sort().join('|');
      const sessions = [];
      for (let s = 0; s < 4; s++) {
        const games = [];
        for (let gi = 0; gi < 3; gi++) {
          const left = shuffle(progs.map(p => p.name), rng);
          while (left.length >= 2) {
            const a = left.shift();
            let j = left.findIndex(b => !met.has(pairKey(a, b)));
            if (j < 0) j = 0;
            const b = left.splice(j, 1)[0];
            met.add(pairKey(a, b));
            games.push([a, b]);
          }
        }
        sessions.push(games);
      }
      return { key: c.key, name: c.name, event: c.event, programs: progs.map(p => p.name), sessions };
    }).filter(Boolean);

    const ev = fibaEvent(season);
    let fiba = null;
    if ((opts.fibaEligible || []).length) {
      const teams = buildNations(opts.fibaEligible, season).map(t => ({
        name: t.name,
        players: t.players.map(p => (p.depth ? { id: p.id, name: p.name, pos: p.pos, ht: p.ht, wt: p.wt, rating: p.rating, depth: true } : { id: p.id, name: p.name, pos: p.pos }))
      }));
      teams.forEach(t => t.players.forEach(p => { names[p.id] = p.name; }));
      const ratingOf = p => (p.depth ? p.rating : (opts.ratingOf ? opts.ratingOf(p.id) : 70) || 70);
      const strength = t => { const r = t.players.map(ratingOf).sort((a, b) => b - a).slice(0, 8); return r.reduce((n, v) => n + v, 0) / Math.max(1, r.length); };
      const ranked = teams.slice().sort((a, b) => strength(b) - strength(a));
      const drawRng = rngFor(`summer|${season}|fiba|draw`);
      const groups = ['A', 'B', 'C', 'D'].map(name => ({ name, teams: [] }));
      for (let pot = 0; pot < 4; pot++) shuffle(ranked.slice(pot * 4, pot * 4 + 4), drawRng).forEach((t, i) => groups[i].teams.push(t.name));
      fiba = { ...ev, season, teams, groups };
    }
    const steps = [1, 2, 3, 4].map(n => ({ key: `s${n}`, label: `AAU Session ${n}`, short: `Session ${n}` }))
      .concat([
        { key: 'cq', label: 'Championships: quarterfinals & semifinals', short: 'Championship quarters & semis' },
        { key: 'cf', label: 'Championship finals', short: 'Championship finals' }
      ])
      .concat(fiba ? [
        { key: 'fg', label: `${ev.short}: group stage`, short: `${ev.short} groups` },
        { key: 'fk', label: `${ev.short}: quarterfinals & semifinals`, short: `${ev.short} quarters & semis` },
        { key: 'fm', label: `${ev.short}: medal games`, short: `${ev.short} medal games` }
      ] : []);
    // Each player's summer, modeled on his written lines (see profileTeam):
    // what the games are played from, here or on the Recruiting page.
    const info = new Map();
    (opts.aauPlayers || []).concat(opts.fibaEligible || []).forEach(p => { if (!info.has(p.id)) info.set(p.id, p); });
    const prof = {}, tal = {}, pos = {}, cls = {};
    const talentOf = p => (p.depth ? p.rating : p.talent != null ? p.talent : (opts.ratingOf ? opts.ratingOf(p.id) : null) || p.rating || 70);
    const r3 = v => Math.round(v * 1000) / 1000;
    const note = p => { tal[p.id] = r3(talentOf(p)); if (p.pos) pos[p.id] = p.pos; if (p.cls) cls[p.id] = Number(p.cls); };
    programs.forEach(pg => {
      const members = pg.roster.map(id => info.get(id)).filter(Boolean).map(m => ({ ...m, talent: talentOf(m) }));
      members.forEach(note);
      profileTeam(members, 'aau').forEach(o => { prof[o.id] = prof[o.id] || {}; prof[o.id].a = o.exp; });
    });
    if (fiba) {
      fiba.teams.forEach(t => {
        const members = t.players.map(p => (p.depth ? { ...p, talent: p.rating } : info.get(p.id) ? { ...info.get(p.id), talent: talentOf(info.get(p.id)) } : null)).filter(Boolean);
        members.forEach(note);
        profileTeam(members, 'fiba').forEach(o => { prof[o.id] = prof[o.id] || {}; prof[o.id].f = o.exp; });
      });
    }
    const P = { v: 2, rev: 1, season, step: 0, steps, done: false, programs, circuits: circuitList, fiba, names, games: [], seen: {}, prof, tal, pos, cls };
    P.norm = effNorms(P);
    return P;
  }

  // Points per shooting possession across each event's expectations: the
  // norm a game measures each roster's efficiency against (GameCore).
  function effNorms(P) {
    const out = {};
    [['aau', 'a'], ['fiba', 'f']].forEach(([k, key]) => {
      let pts = 0, load = 0;
      Object.values(P.prof || {}).forEach(x => { const e = x[key]; if (e && GC() && GC().expectedLoad) { const l = GC().expectedLoad(e); pts += l.pts; load += l.load; } });
      out[k] = load > 0 ? pts / load : null;
    });
    return out;
  }

  // Plays one game from the plan's profiles with the college engine: the
  // score from the two rosters' expected scoring and their strength (AAU
  // games are 32 minutes), the box scores from the game.
  function simPlay(P) {
    const G = GC();
    if (!G) throw new Error('GameCore is needed to play the summer');
    const team = (t, kind) => {
      const key = kind === 'fiba' ? 'f' : 'a';
      const roster = (t.roster || []).map(x => {
        const id = x && typeof x === 'object' ? x.id : x;
        const e = (P.prof[id] || {})[key];
        return e ? { id, name: (P.names || {})[id] || (x && x.name) || '', pos: (P.pos || {})[id] || (x && x.pos) || '', rating: (P.tal || {})[id] || 70, expectedStats: e } : null;
      }).filter(Boolean);
      const top = roster.slice().sort((a, b) => b.rating - a.rating).slice(0, 8);
      const ovr = top.reduce((n, p) => n + p.rating, 0) / Math.max(1, top.length);
      return { school: t.name, conference: '', roster, simData: { teamOvr: ovr, rosterRef: roster }, coachProfile: { pace: 1, defense: 1 },
        pts: roster.reduce((n, p) => n + (parseFloat(p.expectedStats.ppg) || 0), 0) };
    };
    return (home, away, meta) => {
      const kind = meta.kind === 'fiba' ? 'fiba' : 'aau';
      const H = team(home, kind), A = team(away, kind);
      const res = G.simulateSingleGame(H, A, {
        homeCourtEdge: 0, marginScale: 1.2, marginVarianceStd: 10, paceVarianceStd: 8,
        expectedTotal: H.pts + A.pts, gameMinutes: GAME_MIN[kind], effNorm: P.norm && P.norm[kind]
      });
      const lines = boxes => boxes.map(({ player, box }, i) => ({ ...box, id: player.id, name: player.name, pos: player.pos, started: i < 5 }));
      return { homeScore: res.homeScore, awayScore: res.awayScore, homeLines: lines(res.homePlayerBoxes), awayLines: lines(res.awayPlayerBoxes) };
    };
  }

  function rosterOf(P, name, kind) {
    if (kind === 'fiba') { const t = (P.fiba.teams || []).find(x => x.name === name); return { name, roster: t ? t.players : [] }; }
    const p = P.programs.find(x => x.name === name);
    return { name, roster: p ? p.roster : [] };
  }

  // League (or group) table from the games played so far.
  function table(P, ev, teams, roundTest) {
    const rec = new Map(teams.map(t => [t, { team: t, w: 0, l: 0, pf: 0, pa: 0 }]));
    P.games.filter(g => g.ev === ev && roundTest(g.rd)).forEach(g => {
      const h = rec.get(g.h), a = rec.get(g.a);
      if (!h || !a) return;
      h.pf += g.hs; h.pa += g.as; a.pf += g.as; a.pa += g.hs;
      if (g.hs > g.as) { h.w++; a.l++; } else { a.w++; h.l++; }
    });
    return [...rec.values()].sort((x, y) => (y.w / Math.max(1, y.w + y.l)) - (x.w / Math.max(1, x.w + x.l)) || (y.pf - y.pa) - (x.pf - x.pa) || x.team.localeCompare(y.team));
  }
  const isLeague = rd => /^Session/.test(rd);
  const standingsOf = (P, c) => table(P, c.key, c.programs, isLeague);
  const groupTable = (P, gr) => table(P, 'FIBA', gr.teams, rd => rd === `Group ${gr.name}`);
  const gamesIn = (P, ev, rd) => P.games.filter(g => g.ev === ev && g.rd === rd);

  // Plays the next step. play(home, away, meta) plays one game between two
  // { name, roster } and returns { homeScore, awayScore, homeLines, awayLines }.
  function playStep(P, play) {
    if (P.done) return [];
    if (!play) play = simPlay(P);
    const st = P.steps[P.step];
    const out = [];
    const game = (ev, rd, home, away, kind) => {
      const g = play(rosterOf(P, home, kind), rosterOf(P, away, kind), { kind: kind === 'fiba' ? 'fiba' : 'aau', circuit: ev, round: rd });
      let hs = g.homeScore, as = g.awayScore;
      if (hs === as) hs++;
      const rec = { id: `${ev}|${P.season}|${P.games.length + 1}`, st: st.key, ev, rd, h: home, a: away, hs, as, b: [g.homeLines.filter(l => Number(l.min) > 0).map(pack), g.awayLines.filter(l => Number(l.min) > 0).map(pack)] };
      P.games.push(rec);
      out.push(rec);
      return rec;
    };
    const ko = (ev, rd, pairs, kind) => pairs.map(([a, b]) => game(ev, rd, a, b, kind));
    if (/^s\d$/.test(st.key)) {
      const i = Number(st.key.slice(1)) - 1;
      P.circuits.forEach(c => (c.sessions[i] || []).forEach(([a, b]) => game(c.key, `Session ${i + 1}`, a, b, 'aau')));
    } else if (st.key === 'cq') {
      P.circuits.forEach(c => {
        const t = standingsOf(P, c);
        const size = c.programs.length >= 8 ? 8 : c.programs.length >= 4 ? 4 : 2;
        c.seeds = t.slice(0, size).map(x => x.team);
        let alive = c.seeds.slice();
        if (alive.length >= 8) {
          const q = ko(c.key, 'Quarterfinals', [0, 1, 2, 3].map(k => [alive[k], alive[7 - k]]), 'aau');
          alive = q.map(winnerOf);
        }
        if (alive.length >= 4) {
          // 1/8 winner meets 4/5 winner; 2/7 meets 3/6.
          const s = ko(c.key, 'Semifinals', [[alive[0], alive[3]], [alive[1], alive[2]]], 'aau');
          alive = s.map(winnerOf);
        }
        c.finalists = alive.slice(0, 2);
      });
    } else if (st.key === 'cf') {
      P.circuits.forEach(c => {
        const [a, b] = c.finalists || standingsOf(P, c).slice(0, 2).map(x => x.team);
        const f = game(c.key, 'Final', a, b, 'aau');
        c.champion = winnerOf(f);
        c.runnerUp = loserOf(f);
        c.finalId = f.id;
      });
    } else if (st.key === 'fg') {
      P.fiba.groups.forEach(gr => {
        for (let i = 0; i < gr.teams.length; i++) for (let j = i + 1; j < gr.teams.length; j++) game('FIBA', `Group ${gr.name}`, gr.teams[i], gr.teams[j], 'fiba');
      });
    } else if (st.key === 'fk') {
      const t = P.fiba.groups.map(gr => groupTable(P, gr).map(x => x.team));
      // Crossovers: A1-B2, C1-D2, B1-A2, D1-C2.
      const q = ko('FIBA', 'Quarterfinals', [[t[0][0], t[1][1]], [t[2][0], t[3][1]], [t[1][0], t[0][1]], [t[3][0], t[2][1]]], 'fiba');
      const w = q.map(winnerOf);
      const s = ko('FIBA', 'Semifinals', [[w[0], w[1]], [w[2], w[3]]], 'fiba');
      P.fiba.semis = s.map(g => g.id);
    } else if (st.key === 'fm') {
      const s = P.games.filter(g => (P.fiba.semis || []).includes(g.id));
      const bronze = game('FIBA', 'Bronze medal game', loserOf(s[0]), loserOf(s[1]), 'fiba');
      const fin = game('FIBA', 'Final', winnerOf(s[0]), winnerOf(s[1]), 'fiba');
      P.fiba.medals = { gold: winnerOf(fin), silver: loserOf(fin), bronze: winnerOf(bronze) };
      P.fiba.finalId = fin.id;
    }
    P.step++;
    P.done = P.step >= P.steps.length;
    P.rev = (P.rev || 0) + 1;
    return out;
  }

  // Everything a page needs to show the summer as it stands.
  function view(P) {
    const byId = new Map(P.games.map(g => [g.id, g]));
    const withLines = g => (g ? { home: g.h, away: g.a, hs: g.hs, as: g.as, id: g.id, lines: (() => { const [h, a] = linesOf(g, P.names); return { home: h, away: a }; })() } : null);
    const rounds = (ev, labels) => labels.map(label => ({ label, games: gamesIn(P, ev, label).map(strip) })).filter(r => r.games.length);
    const circuitsV = P.circuits.map(c => ({
      key: c.key, name: c.name, event: c.event, programs: c.programs.length,
      standings: standingsOf(P, c),
      sessions: [1, 2, 3, 4].map(n => gamesIn(P, c.key, `Session ${n}`).map(strip)),
      bracket: rounds(c.key, ['Quarterfinals', 'Semifinals', 'Final']),
      seeds: c.seeds || null,
      champion: c.champion || null, runnerUp: c.runnerUp || null,
      final: c.finalId ? withLines(byId.get(c.finalId)) : null,
      ...(P.awards && P.awards[c.key] ? P.awards[c.key] : {})
    }));
    let fibaV = null;
    if (P.fiba) {
      const f = P.fiba;
      fibaV = {
        name: f.name, short: f.short, team: f.team, age: f.age, season: f.season,
        groups: f.groups.map(gr => ({ name: gr.name, standings: groupTable(P, gr), games: gamesIn(P, 'FIBA', `Group ${gr.name}`).map(strip) })),
        knockout: rounds('FIBA', ['Quarterfinals', 'Semifinals', 'Bronze medal game', 'Final']),
        medals: f.medals || null,
        final: f.finalId ? withLines(byId.get(f.finalId)) : null,
        rosters: f.teams.map(t => ({ name: t.name, players: t.players })),
        ...(P.awards && P.awards.FIBA ? P.awards.FIBA : {})
      };
    }
    return {
      season: P.season, step: P.step, steps: P.steps, done: P.done, next: P.done ? null : P.steps[P.step],
      aau: { circuits: circuitsV, programs: P.programs }, fiba: fibaV,
      breakouts: P.breakouts || [], seen: P.seen || {}
    };
  }

  // Season lines so far: id -> { aau, fiba, team, circuit, nation, aauTotals, fibaTotals }.
  function ledgers(P) {
    const aau = new Ledger(), fiba = new Ledger();
    P.games.forEach(g => {
      const [h, a] = linesOf(g, P.names);
      const L = g.ev === 'FIBA' ? fiba : aau;
      L.game(h, a, g.ev);
      L.game(a, h, g.ev);
    });
    return { aau, fiba };
  }
  function lines(P, posOf) {
    const { aau, fiba } = ledgers(P);
    const out = new Map();
    const entry = id => { if (!out.has(id)) out.set(id, {}); return out.get(id); };
    const teamOf = new Map();
    P.programs.forEach(p => p.roster.forEach(id => teamOf.set(id, p)));
    const aauBase = baseOf(aau), fibaBase = baseOf(fiba);
    aau.by.forEach((a, id) => {
      const e = entry(id);
      e.aau = line(a, posOf(id), aauBase);
      const p = teamOf.get(id);
      e.team = p ? p.name : '';
      e.circuit = p ? p.circuit : a.tag;
    });
    if (P.fiba) {
      const nationOf = new Map();
      P.fiba.teams.forEach(t => t.players.forEach(p => nationOf.set(p.id, t.name)));
      fiba.by.forEach((a, id) => {
        if (/^fiba\|/.test(id)) return;   // national-team depth, not a prospect
        const e = entry(id);
        e.fiba = line(a, posOf(id), fibaBase);
        e.nation = nationOf.get(id) || '';
      });
    }
    return { lines: out, aau, fiba };
  }

  // Once the last step is played: awards, honors and buzz.
  // opts: { ratingOf(id), posOf(id) }. Returns players: Map id -> { aau,
  // fiba, team, circuit, nation, honors, buzz } and records the awards on P.
  function finish(P, opts) {
    const { lines: players, aau, fiba } = lines(P, opts.posOf);
    players.forEach(e => { e.honors = []; });
    const entry = id => { if (!players.has(id)) players.set(id, { honors: [] }); return players.get(id); };
    const teamName = id => { const p = P.programs.find(x => x.roster.includes(id)); return p ? p.name : ''; };
    P.awards = {};
    P.circuits.forEach(c => {
      const ids = new Set(P.programs.filter(p => p.circuit === c.key).flatMap(p => p.roster));
      const top = leaders(aau, ids, 5, 8);
      const scorer = [...aau.by.entries()].filter(([id, a]) => ids.has(id) && a.gp >= 8).sort((x, y) => y[1].pts / y[1].gp - x[1].pts / x[1].gp)[0];
      const fg = P.games.find(g => g.id === c.finalId);
      const fl = fg ? linesOf(fg, P.names)[fg.h === c.champion ? 0 : 1] : [];
      const fmvp = fl.slice().sort((x, y) => (y.pts + y.reb * 0.5 + y.ast * 0.7) - (x.pts + x.reb * 0.5 + x.ast * 0.7))[0];
      const aw = {
        mvp: top[0] ? { id: top[0].id, name: top[0].a.name, team: teamName(top[0].id), line: statline(top[0].a) } : null,
        firstTeam: top.map(t => ({ id: t.id, name: t.a.name, team: teamName(t.id), line: statline(t.a) })),
        scoringLeader: scorer ? { id: scorer[0], name: scorer[1].name, team: teamName(scorer[0]), ppg: r1(scorer[1].pts / scorer[1].gp) } : null,
        eventMvp: fmvp ? { id: fmvp.id, name: fmvp.name, team: c.champion, line: gameLine(fmvp) } : null
      };
      P.awards[c.key] = aw;
      const champs = (P.programs.find(p => p.name === c.champion) || { roster: [] }).roster;
      champs.forEach(id => entry(id).honors.push(`${c.event} champion`));
      if (aw.mvp) entry(aw.mvp.id).honors.push(`${c.name} MVP`);
      aw.firstTeam.forEach(t => entry(t.id).honors.push(`All-${c.key} First Team`));
      if (aw.scoringLeader) entry(aw.scoringLeader.id).honors.push(`${c.key} scoring leader`);
      if (aw.eventMvp) entry(aw.eventMvp.id).honors.push(`${c.event} MVP`);
    });
    if (P.fiba && P.fiba.medals) {
      const f = P.fiba;
      const nationOf = id => (f.teams.find(t => t.players.some(p => p.id === id)) || {}).name;
      const real = id => !/^fiba\|/.test(id);
      const place = { [f.medals.gold]: 3, [f.medals.silver]: 1.5, [f.medals.bronze]: 1 };
      const best = [...fiba.by.entries()].filter(([, a]) => a.gp >= 4)
        .map(([id, a]) => ({ id, a, v: gameScore(a) / a.gp + (place[nationOf(id)] || 0) })).sort((x, y) => y.v - x.v);
      const five = best.slice(0, 5);
      P.awards.FIBA = {
        mvp: best[0] ? { id: best[0].id, name: best[0].a.name, nation: nationOf(best[0].id), line: statline(best[0].a), depth: !real(best[0].id) } : null,
        allStar: five.map(t => ({ id: t.id, name: t.a.name, nation: nationOf(t.id), line: statline(t.a), depth: !real(t.id) }))
      };
      Object.entries(f.medals).forEach(([m, nation]) => {
        const t = f.teams.find(x => x.name === nation);
        (t ? t.players : []).forEach(p => { if (real(p.id)) entry(p.id).honors.push(`${f.name} ${m}`); });
      });
      five.forEach(t => { if (real(t.id)) entry(t.id).honors.push(`${f.name} All-Star Five`); });
      if (P.awards.FIBA.mvp && real(P.awards.FIBA.mvp.id)) entry(P.awards.FIBA.mvp.id).honors.push(`${f.name} MVP`);
    }
    const z = standouts(aau, id => opts.ratingOf(id));
    players.forEach((e, id) => {
      let v = buzzFor(z.get(id) || 0);
      if ((e.honors || []).some(h => /MVP|All-Star Five|First Team/.test(h))) v += 1;
      e.buzz = clamp(v, -2, 3);
    });
    return players;
  }

  // The whole summer at once (tests, and "play the rest").
  function runSummer(season, opts) {
    const P = plan(season, opts);
    while (!P.done) playStep(P, opts.play);
    const players = finish(P, opts);
    const v = view(P);
    return { ...v, plan: P, players };
  }

  // The summer as the Recruiting page shows it: every game (finals not yet
  // watched left hidden), standings, awards, and each player's lines and
  // honors. recruits: the save's recruits (their summer lines and honors,
  // see applyLines and settle); history: past summers' champions.
  function snapshot(P, { recruits, history, hidden } = {}) {
    if (!P) return null;
    const sm = view(P);
    const hide = g => (hidden ? hidden(g) : false);
    // Honors that would give away a final not yet watched.
    const hiddenEvents = sm.aau.circuits.filter(c => c.final && hide({ id: c.final.id, rd: 'Final' })).map(c => c.event)
      .concat(sm.fiba && sm.fiba.final && hide({ id: sm.fiba.final.id, rd: 'Final' }) ? [sm.fiba.name] : []);
    const spoils = t => hiddenEvents.some(e => t.startsWith(e));
    const players = [];
    (recruits || []).forEach(r => {
      if (!r.summer && !(r.summerHonors || []).length) return;
      const x = { n: r.name, c: Number(r.recClassYear), id: r.id };
      if (r.summer && r.summer.season === sm.season) {
        if (r.summer.team) x.t = r.summer.team;
        if (r.summer.circuit) x.ci = r.summer.circuit;
        if (r.summer.nation && r.summer.fiba) x.na = r.summer.nation;
        if (r.summer.aau) x.aau = r.summer.aau;
        if (r.summer.fiba) x.fiba = r.summer.fiba;
        if (r.summer.buzz) x.b = r.summer.buzz;
      }
      const pv = r.summerPrev && r.summerPrev.season !== sm.season ? r.summerPrev : null;
      if (pv) x.prev = { s: pv.season, t: pv.team, ci: pv.circuit, na: pv.nation, aau: pv.aau || undefined, fiba: pv.fiba || undefined };
      if ((r.summerHonors || []).length) x.h = r.summerHonors.filter(h => !(h.season === sm.season && spoils(h.text))).map(h => `${h.season} ${h.text}`);
      if (x.h && !x.h.length) delete x.h;
      players.push(x);
    });
    // A final nobody has watched yet stays a final to watch on the site too.
    const strip = g => (g ? { id: g.id, home: g.home, away: g.away, hs: g.hs, as: g.as } : null);
    const aw = x => (x ? { id: x.id, name: x.name, team: x.team || x.nation || '', line: x.line || (x.ppg ? `${x.ppg} ppg` : '') } : null);
    const out = {
      v: 2, season: sm.season, step: sm.step, done: sm.done, steps: (sm.steps || []).map(s => ({ key: s.key, label: s.label, short: s.short })),
      circuits: sm.aau.circuits.map(c => ({
        key: c.key, name: c.name, event: c.event,
        programs: (sm.aau.programs || []).filter(p => p.circuit === c.key).map(p => ({ name: p.name, region: p.region, roster: p.roster })),
        standings: c.standings.map(t => [t.team, t.w, t.l, t.pf, t.pa]),
        champion: c.champion && !(c.final && hide({ id: c.final.id, rd: 'Final' })) ? c.champion : null,
        runnerUp: c.runnerUp && !(c.final && hide({ id: c.final.id, rd: 'Final' })) ? c.runnerUp : null,
        finalists: c.final ? [c.final.home, c.final.away] : null,
        final: c.final && !hide({ id: c.final.id, rd: 'Final' }) ? strip(c.final) : null,
        mvp: aw(c.mvp), eventMvp: c.final && !hide({ id: c.final.id, rd: 'Final' }) ? aw(c.eventMvp) : null, scoringLeader: aw(c.scoringLeader),
        firstTeam: (c.firstTeam || []).map(aw)
      })),
      fiba: sm.fiba ? {
        name: sm.fiba.name, short: sm.fiba.short, team: sm.fiba.team,
        groups: sm.fiba.groups.map(gr => ({ name: gr.name, standings: gr.standings.map(t => [t.team, t.w, t.l, t.pf, t.pa]) })),
        medals: sm.fiba.final && !hide({ id: sm.fiba.final.id, rd: 'Final' }) ? sm.fiba.medals : null,
        final: sm.fiba.final && !hide({ id: sm.fiba.final.id, rd: 'Final' }) ? strip(sm.fiba.final) : null,
        mvp: aw(sm.fiba.mvp), allStar: (sm.fiba.allStar || []).map(aw),
        rosters: (sm.fiba.rosters || []).map(t => ({ name: t.name, players: t.players.map(p => p.id) }))
      } : null,
      // Every game with its box score (see SummerCore), finals left to be watched hidden.
      games: P.v === 2 ? P.games.map(g => (hide(g) ? { id: g.id, st: g.st, ev: g.ev, rd: g.rd, h: g.h, a: g.a, hidden: 1 } : g)) : [],
      names: P.v === 2 ? P.names : {},
      history: (history || []).filter(h => h.season !== sm.season),
      players
    };
    return out;
  }

  // Each player's lines so far onto his record (a player plays two
  // summers: last summer's is kept when this one begins).
  function applyLines(P, recruits) {
    const byId = new Map((recruits || []).map(r => [r.id, r]));
    const { lines: L } = lines(P, id => (P.pos || {})[id] || (byId.get(id) || {}).pos || '');
    L.forEach((e, id) => {
      const r = byId.get(id);
      if (!r) return;
      if (r.summer && r.summer.season !== P.season && (r.summer.aau || r.summer.fiba)) {
        const o = r.summer;
        r.summerPrev = { season: o.season, team: o.team, circuit: o.circuit, nation: o.nation, aau: o.aau, fiba: o.fiba };
      }
      const prev = r.summer && r.summer.season === P.season ? r.summer : {};
      r.summer = { season: P.season, team: e.team || '', circuit: e.circuit || '', nation: e.nation || '', aau: e.aau || null, fiba: e.fiba || null, honors: prev.honors || [], buzz: prev.buzz || 0, live: !P.done };
    });
  }

  // Once the summer is over: awards, honors and buzz onto the players.
  // Returns the breakout summers, best first.
  function settle(P, recruits) {
    const all = recruits || [];
    const byId = new Map(all.map(r => [r.id, r]));
    const players = finish(P, { ratingOf: id => ((P.tal || {})[id] != null ? P.tal[id] : null), posOf: id => (P.pos || {})[id] || (byId.get(id) || {}).pos || '' });
    const season = P.season, breakouts = [];
    players.forEach((e, id) => {
      const r = byId.get(id);
      if (!r) return;
      r.summer = { season, team: e.team || '', circuit: e.circuit || '', nation: e.nation || '', aau: e.aau || null, fiba: e.fiba || null, honors: e.honors || [], buzz: e.buzz || 0 };
      r.summerBuzz = e.buzz || 0;
      if ((e.honors || []).length) r.summerHonors = (r.summerHonors || []).filter(h => h.season !== season).concat(e.honors.map(h => ({ season, text: h })));
      if (e.buzz >= 2) breakouts.push(r);
    });
    // Anyone who didn't play this summer carries no summer buzz forward.
    all.forEach(r => { if (!players.has(r.id) && r.summerBuzz) r.summerBuzz = 0; });
    breakouts.sort((a, b) => (b.summerBuzz - a.summerBuzz) || (Number(a.rsci) || 999) - (Number(b.rsci) || 999));
    P.breakouts = breakouts.slice(0, 12).map(r => r.id);
    return breakouts;
  }

  // ---------- honors and buzz ----------
  // How a player's summer measured up to his rating: game score per 40
  // against what players of his rating put up, in standard deviations.
  function standouts(ledger, ratingOf, minMin = 60) {
    const rows = [];
    ledger.by.forEach((a, id) => { if (a.min >= minMin && ratingOf(id) != null) rows.push({ id, x: ratingOf(id), y: per40(a, gameScore(a)) }); });
    if (rows.length < 8) return new Map();
    const mx = rows.reduce((n, r) => n + r.x, 0) / rows.length, my = rows.reduce((n, r) => n + r.y, 0) / rows.length;
    const sxx = rows.reduce((n, r) => n + (r.x - mx) ** 2, 0) || 1;
    const b = rows.reduce((n, r) => n + (r.x - mx) * (r.y - my), 0) / sxx;
    const res = rows.map(r => r.y - (my + b * (r.x - mx)));
    const sd = Math.sqrt(res.reduce((n, v) => n + v * v, 0) / res.length) || 1;
    const out = new Map();
    rows.forEach((r, i) => out.set(r.id, res[i] / sd));
    return out;
  }
  const buzzFor = z => (z >= 2 ? 3 : z >= 1.4 ? 2 : z >= 0.9 ? 1 : z <= -2 ? -2 : z <= -1.4 ? -1 : 0);

  // The best of an event by game score per game (min games played).
  function leaders(ledger, ids, n, minGp) {
    return [...ledger.by.entries()].filter(([id, a]) => (!ids || ids.has(id)) && a.gp >= minGp)
      .map(([id, a]) => ({ id, a, v: gameScore(a) / a.gp })).sort((x, y) => y.v - x.v).slice(0, n);
  }
  const statline = a => [`${r1(a.pts / a.gp)} ppg`, a.reb / a.gp >= 5 ? `${r1(a.reb / a.gp)} rpg` : '', a.ast / a.gp >= 3.5 ? `${r1(a.ast / a.gp)} apg` : ''].filter(Boolean).join(', ');
  const gameLine = l => [`${l.pts} pts`, l.reb >= 6 ? `${l.reb} reb` : '', l.ast >= 5 ? `${l.ast} ast` : ''].filter(Boolean).join(', ');


  const api = { hash, rngFor, assignPrograms, fibaEvent, buildNations, plan, playStep, simPlay, view, lines, finish, runSummer, snapshot, applyLines, settle, profileTeam, writtenLine, GAME_MIN, LINE_KEYS, unpack, linesOf, line, Ledger, standouts, buzzFor, NATIONS, ROSTER_MIN, ROSTER_MAX, LINE };
  root.SummerCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
