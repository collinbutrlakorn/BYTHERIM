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
// This module decides who plays where, the schedule and the brackets,
// and turns box scores into the season lines the recruiting page shows.
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

  // ---------- brackets ----------
  function knockout(seeds, play, meta) {
    const rounds = [];
    let alive = seeds.slice();
    const names = alive.length >= 8 ? ['Quarterfinals', 'Semifinals', 'Final'] : alive.length >= 4 ? ['Semifinals', 'Final'] : ['Final'];
    let last = null;
    names.forEach((label, ri) => {
      const games = [];
      const next = [];
      for (let i = 0; i < alive.length / 2; i++) {
        const a = alive[i], b = alive[alive.length - 1 - i];
        const g = play(a, b, { ...meta, round: label });
        games.push(g);
        next.push(g.winner === a.name ? a : b);
      }
      // Pairing the ends each round keeps the bracket's shape: the 1/8
      // winner meets the 4/5 winner in the semis.
      alive = next;
      rounds.push({ label, games });
      last = games[games.length - 1];
    });
    return { rounds, final: last };
  }

  // ---------- one summer ----------
  //
  // aauPlayers: see assignPrograms. play(home, away, meta) plays one game
  // between two { name, roster: [ids | filler players] } and returns
  // { home, away, homeScore, awayScore, homeLines, awayLines }, each line
  // a box score with the player's id.
  function runAau(aauPlayers, season, play) {
    const rng = rngFor(`summer|${season}|aau`);
    const { programs, teamOf } = assignPrograms(aauPlayers, season);
    const ledger = new Ledger();
    const playOne = (a, b, meta) => {
      const g = play(a, b, meta);
      ledger.game(g.homeLines, g.awayLines, meta.circuit);
      ledger.game(g.awayLines, g.homeLines, meta.circuit);
      const winner = g.homeScore > g.awayScore ? a.name : b.name;
      return { home: a.name, away: b.name, hs: g.homeScore, as: g.awayScore, winner, lines: meta.keep ? { home: g.homeLines, away: g.awayLines } : undefined };
    };
    const out = circuits().map(c => {
      const progs = programs.filter(p => p.circuit === c.key);
      if (progs.length < 2) return null;
      const rec = new Map(progs.map(p => [p.name, { team: p.name, w: 0, l: 0, pf: 0, pa: 0 }]));
      const met = new Set();
      const pairKey = (a, b) => [a.name, b.name].sort().join('|');
      // Four sessions of three games.
      for (let s = 0; s < 4; s++) {
        for (let gi = 0; gi < 3; gi++) {
          let left = shuffle(progs, rng);
          while (left.length >= 2) {
            const a = left.shift();
            let j = left.findIndex(b => !met.has(pairKey(a, b)));
            if (j < 0) j = 0;
            const b = left.splice(j, 1)[0];
            met.add(pairKey(a, b));
            const g = playOne(a, b, { kind: 'aau', circuit: c.key, session: s + 1 });
            const ra = rec.get(a.name), rb = rec.get(b.name);
            ra.pf += g.hs; ra.pa += g.as; rb.pf += g.as; rb.pa += g.hs;
            if (g.winner === a.name) { ra.w++; rb.l++; } else { rb.w++; ra.l++; }
          }
        }
      }
      const standings = [...rec.values()].sort((x, y) => (y.w / Math.max(1, y.w + y.l)) - (x.w / Math.max(1, x.w + x.l)) || (y.pf - y.pa) - (x.pf - x.pa) || x.team.localeCompare(y.team));
      const field = standings.slice(0, progs.length >= 8 ? 8 : progs.length >= 4 ? 4 : 2).map(s => progs.find(p => p.name === s.team));
      const bracket = knockout(field, (a, b, meta) => playOne(a, b, { ...meta, kind: 'aau-final', circuit: c.key, keep: meta.round === 'Final' }), {});
      const fin = bracket.final;
      return {
        key: c.key, name: c.name, event: c.event, standings,
        bracket: bracket.rounds.map(r => ({ label: r.label, games: r.games.map(g => ({ home: g.home, away: g.away, hs: g.hs, as: g.as, winner: g.winner })) })),
        champion: fin.winner, runnerUp: fin.winner === fin.home ? fin.away : fin.home,
        final: { home: fin.home, away: fin.away, hs: fin.hs, as: fin.as, lines: fin.lines }
      };
    }).filter(Boolean);
    return { circuits: out, programs, teamOf, ledger };
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

  function runFiba(eligible, season, play, ratingOf) {
    const ev = fibaEvent(season);
    const rng = rngFor(`summer|${season}|fiba|draw`);
    const teams = buildNations(eligible, season).map(t => ({ ...t, roster: t.players }));
    const strength = t => { const r = t.players.map(p => ratingOf(p)).sort((a, b) => b - a).slice(0, 8); return r.reduce((n, v) => n + v, 0) / Math.max(1, r.length); };
    const ranked = teams.slice().sort((a, b) => strength(b) - strength(a));
    const groups = ['A', 'B', 'C', 'D'].map(name => ({ name, teams: [] }));
    for (let pot = 0; pot < 4; pot++) {
      shuffle(ranked.slice(pot * 4, pot * 4 + 4), rng).forEach((t, i) => groups[i].teams.push(t));
    }
    const ledger = new Ledger();
    const playOne = (a, b, meta) => {
      const g = play(a, b, meta);
      ledger.game(g.homeLines, g.awayLines, 'fiba');
      ledger.game(g.awayLines, g.homeLines, 'fiba');
      const winner = g.homeScore > g.awayScore ? a.name : b.name;
      return { home: a.name, away: b.name, hs: g.homeScore, as: g.awayScore, winner, lines: meta.keep ? { home: g.homeLines, away: g.awayLines } : undefined };
    };
    const table = groups.map(gr => {
      const rec = new Map(gr.teams.map(t => [t.name, { team: t.name, w: 0, l: 0, pf: 0, pa: 0 }]));
      const games = [];
      for (let i = 0; i < gr.teams.length; i++) for (let j = i + 1; j < gr.teams.length; j++) {
        const a = gr.teams[i], b = gr.teams[j];
        const g = playOne(a, b, { kind: 'fiba', round: `Group ${gr.name}` });
        games.push({ home: g.home, away: g.away, hs: g.hs, as: g.as, winner: g.winner });
        const ra = rec.get(a.name), rb = rec.get(b.name);
        ra.pf += g.hs; ra.pa += g.as; rb.pf += g.as; rb.pa += g.hs;
        if (g.winner === a.name) { ra.w++; rb.l++; } else { rb.w++; ra.l++; }
      }
      const standings = [...rec.values()].sort((x, y) => y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa));
      return { name: gr.name, standings, games };
    });
    const T = n => teams.find(t => t.name === n);
    const at = (g, i) => T(table[g].standings[i].team);
    // Crossovers: A1-B2, C1-D2, B1-A2, D1-C2.
    const qf = [[at(0, 0), at(1, 1)], [at(2, 0), at(3, 1)], [at(1, 0), at(0, 1)], [at(3, 0), at(2, 1)]];
    const K = (a, b, round, keep) => playOne(a, b, { kind: 'fiba', round, keep });
    const q = qf.map(([a, b]) => K(a, b, 'Quarterfinals'));
    const sw = q.map(g => T(g.winner));
    const s1 = K(sw[0], sw[1], 'Semifinals'), s2 = K(sw[2], sw[3], 'Semifinals');
    const loser = g => (g.winner === g.home ? g.away : g.home);
    const bronze = K(T(loser(s1)), T(loser(s2)), 'Bronze medal game');
    const final = K(T(s1.winner), T(s2.winner), 'Final', true);
    const strip = g => ({ home: g.home, away: g.away, hs: g.hs, as: g.as, winner: g.winner });
    const medals = { gold: final.winner, silver: loser(final), bronze: bronze.winner };
    return {
      ...ev, season, groups: table,
      knockout: [{ label: 'Quarterfinals', games: q.map(strip) }, { label: 'Semifinals', games: [s1, s2].map(strip) }, { label: 'Bronze medal game', games: [strip(bronze)] }, { label: 'Final', games: [strip(final)] }],
      medals, final: { home: final.home, away: final.away, hs: final.hs, as: final.as, lines: final.lines },
      rosters: teams.map(t => ({ name: t.name, players: t.players.map(p => (p.depth ? { id: p.id, name: p.name, pos: p.pos, depth: true } : { id: p.id, name: p.name, pos: p.pos })) })),
      ledger
    };
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

  // opts: { aauPlayers, fibaEligible, play, ratingOf(id|player), posOf(id) }
  function runSummer(season, opts) {
    const ratingOf = x => (typeof x === 'object' && x ? (x.depth ? x.rating : opts.ratingOf(x.id)) : opts.ratingOf(x));
    const aau = runAau(opts.aauPlayers || [], season, opts.play);
    const fiba = (opts.fibaEligible || []).length ? runFiba(opts.fibaEligible, season, opts.play, ratingOf) : null;
    const players = new Map();                 // id -> { aau, fiba, team, honors: [] }
    const entry = id => { if (!players.has(id)) players.set(id, { honors: [] }); return players.get(id); };

    const aauBase = baseOf(aau.ledger);
    aau.ledger.by.forEach((a, id) => {
      const e = entry(id);
      e.aau = line(a, opts.posOf(id), aauBase);
      e.team = aau.teamOf.get(id) || '';
      e.circuit = a.tag;
    });
    const awards = {};
    aau.circuits.forEach(c => {
      const prog = aau.programs.filter(p => p.circuit === c.key);
      const ids = new Set(prog.flatMap(p => p.roster));
      const top = leaders(aau.ledger, ids, 5, 8);
      const scorer = [...aau.ledger.by.entries()].filter(([id, a]) => ids.has(id) && a.gp >= 8).sort((x, y) => y[1].pts / y[1].gp - x[1].pts / x[1].gp)[0];
      const champs = new Set((prog.find(p => p.name === c.champion) || { roster: [] }).roster);
      const fl = c.final.lines ? (c.final.home === c.champion ? c.final.lines.home : c.final.lines.away) : [];
      const fmvp = fl.slice().sort((x, y) => (y.pts + y.reb * 0.5 + y.ast * 0.7) - (x.pts + x.reb * 0.5 + x.ast * 0.7))[0];
      c.mvp = top[0] ? { id: top[0].id, name: top[0].a.name, team: aau.teamOf.get(top[0].id), line: statline(top[0].a) } : null;
      c.firstTeam = top.map(t => ({ id: t.id, name: t.a.name, team: aau.teamOf.get(t.id), line: statline(t.a) }));
      c.scoringLeader = scorer ? { id: scorer[0], name: scorer[1].name, team: aau.teamOf.get(scorer[0]), ppg: r1(scorer[1].pts / scorer[1].gp) } : null;
      c.eventMvp = fmvp ? { id: fmvp.id, name: fmvp.name, team: c.champion, line: gameLine(fmvp) } : null;
      champs.forEach(id => entry(id).honors.push(`${c.event} champion`));
      if (c.mvp) entry(c.mvp.id).honors.push(`${c.name} MVP`);
      c.firstTeam.forEach(t => entry(t.id).honors.push(`All-${c.key} First Team`));
      if (c.scoringLeader) entry(c.scoringLeader.id).honors.push(`${c.key} scoring leader`);
      if (c.eventMvp) entry(c.eventMvp.id).honors.push(`${c.event} MVP`);
      awards[c.key] = c.mvp;
    });

    if (fiba) {
      const base = baseOf(fiba.ledger);
      const real = new Set((opts.fibaEligible || []).map(p => p.id));
      fiba.ledger.by.forEach((a, id) => {
        if (!real.has(id)) return;
        const e = entry(id);
        e.fiba = line(a, opts.posOf(id), base);
        e.nation = (fiba.rosters.find(t => t.players.some(p => p.id === id)) || {}).name;
      });
      const place = { [fiba.medals.gold]: 3, [fiba.medals.silver]: 1.5, [fiba.medals.bronze]: 1 };
      const nationOf = id => (fiba.rosters.find(t => t.players.some(p => p.id === id)) || {}).name;
      const best = [...fiba.ledger.by.entries()].filter(([, a]) => a.gp >= 4)
        .map(([id, a]) => ({ id, a, v: gameScore(a) / a.gp + (place[nationOf(id)] || 0) })).sort((x, y) => y.v - x.v);
      const five = best.slice(0, 5);
      fiba.mvp = best[0] ? { id: best[0].id, name: best[0].a.name, nation: nationOf(best[0].id), line: statline(best[0].a), depth: !real.has(best[0].id) } : null;
      fiba.allStar = five.map(t => ({ id: t.id, name: t.a.name, nation: nationOf(t.id), line: statline(t.a), depth: !real.has(t.id) }));
      const medal = { gold: 'gold', silver: 'silver', bronze: 'bronze' };
      Object.entries(fiba.medals).forEach(([m, nation]) => {
        const t = fiba.rosters.find(x => x.name === nation);
        (t ? t.players : []).forEach(p => { if (real.has(p.id)) entry(p.id).honors.push(`${fiba.name} ${medal[m]}`); });
      });
      five.forEach(t => { if (real.has(t.id)) entry(t.id).honors.push(`${fiba.name} All-Star Five`); });
      if (fiba.mvp && real.has(fiba.mvp.id)) entry(fiba.mvp.id).honors.push(`${fiba.name} MVP`);
    }

    // Buzz: how the summer changed the way he's seen.
    const zAau = standouts(aau.ledger, id => opts.ratingOf(id));
    players.forEach((e, id) => {
      let v = buzzFor(zAau.get(id) || 0);
      if (e.honors.some(h => /MVP|All-Star Five|First Team/.test(h))) v += 1;
      e.buzz = clamp(v, -2, 3);
    });

    const strip = ({ ledger, teamOf, ...rest }) => rest;
    return { season, aau: { circuits: aau.circuits, programs: aau.programs }, fiba: fiba ? strip(fiba) : null, players };
  }

  const api = { hash, rngFor, assignPrograms, fibaEvent, buildNations, runAau, runFiba, runSummer, line, Ledger, standouts, buzzFor, NATIONS, ROSTER_MIN, ROSTER_MAX };
  root.SummerCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
