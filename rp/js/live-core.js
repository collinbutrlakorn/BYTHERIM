// ============================================================
// Live games: a full play-by-play for any game this season.
//
// The simulation decides every game's final score and box score. This
// module works backwards from them to a play-by-play that could have
// produced exactly that box: every make, miss, rebound, assist, steal,
// block, turnover, foul and free throw in the box appears once, on a game
// clock, in an order that tells a believable story (runs, comebacks,
// fouling at the end of close games, the occasional overtime).
//
// It is deterministic: the same game always produces the same broadcast,
// so a game can be watched live after the week is simulated and replayed
// later without storing anything extra. Pure logic — no DOM.
// ============================================================

(function () {
  const HALF = 1200, OT_LEN = 300;
  const BIGS = ['C', 'PF', 'F/C', 'F'];

  // ---------- randomness ----------
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rngFrom(seed) {
    let a = (typeof seed === 'number' ? seed : hash(String(seed))) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const shuffle = (arr, rng) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const pickW = (items, w, rng) => {
    let total = 0; const ws = items.map((x, i) => { const v = Math.max(0, w(x, i)); total += v; return v; });
    if (total <= 0) return items[Math.floor(rng() * items.length)];
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  const pickOne = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const gauss = rng => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  function phi(x) {
    // Standard normal CDF (Abramowitz-Stegun).
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  const n = v => Math.max(0, Math.round(Number(v) || 0));
  function cleanLine(l) {
    const twoPm = l.twoPm != null ? n(l.twoPm) : Math.max(0, n(l.fgm) - n(l.threePm));
    const twoPa = l.twoPa != null ? n(l.twoPa) : Math.max(0, n(l.fga) - n(l.threePa));
    const oreb = n(l.oreb);
    const reb = Math.max(n(l.reb), oreb);
    return {
      id: String(l.id), name: l.name || 'Player', pos: l.pos || 'G', jersey: l.jersey || '', starter: !!l.started || !!l.starter,
      min: n(l.min), twoPm, twoPa: Math.max(twoPa, twoPm), threePm: n(l.threePm), threePa: Math.max(n(l.threePa), n(l.threePm)),
      ftm: n(l.ftm), fta: Math.max(n(l.fta), n(l.ftm)), oreb, dreb: l.dreb != null ? n(l.dreb) : reb - oreb,
      ast: n(l.ast), stl: n(l.stl), blk: n(l.blk), tov: n(l.tov), pf: n(l.pf)
    };
  }
  const poss = name => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
  const lastName = name => { const p = String(name).trim().split(/\s+/); if (p.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p[p.length - 1])) return p[p.length - 2]; return p[p.length - 1]; };

  // ---------- building one side's items ----------
  // An "item" is one thing that happens on a team's offensive trip: a shot
  // (with its rebound, assist, block, and-one), a trip to the line, a
  // turnover, a foul on the floor, or a held ball.
  function buildItems(off, def, rng, key) {
    const byId = {}; off.lines.forEach(p => { byId[p.id] = p; });
    const shots = [];
    off.lines.forEach(p => {
      for (let i = 0; i < p.twoPm; i++) shots.push({ kind: 'shot', side: off.side, shooter: p.id, three: false, made: true });
      for (let i = 0; i < p.twoPa - p.twoPm; i++) shots.push({ kind: 'shot', side: off.side, shooter: p.id, three: false, made: false });
      for (let i = 0; i < p.threePm; i++) shots.push({ kind: 'shot', side: off.side, shooter: p.id, three: true, made: true });
      for (let i = 0; i < p.threePa - p.threePm; i++) shots.push({ kind: 'shot', side: off.side, shooter: p.id, three: true, made: false });
    });
    shuffle(shots, rng);

    // Free throws, as trips: and-ones on made shots, the odd three-shot
    // trip, otherwise two shots. Each player keeps exactly his FTA and FTM.
    const trips = [];
    off.lines.forEach(p => {
      if (!p.fta) return;
      let left = p.fta;
      const madeShots = shots.filter(s => s.shooter === p.id && s.made);
      const plan = [];
      if (left % 2 === 1) {
        if (madeShots.length) { plan.push('and1'); left--; }
        else if (left >= 3) { plan.push(3); left -= 3; }
        else { plan.push('tech'); left--; }
      }
      // Now and then a second and-one pair in place of a two-shot trip.
      while (left >= 2 && madeShots.length > plan.filter(x => x === 'and1').length + 2 && rng() < 0.12) { plan.push('and1', 'and1'); left -= 2; }
      while (left >= 2) { plan.push(2); left -= 2; }
      const outcomes = shuffle(Array.from({ length: p.fta }, (_, i) => i < p.ftm), rng);
      let k = 0;
      const free = madeShots.slice();
      shuffle(free, rng);
      plan.forEach(t => {
        const size = t === 'and1' || t === 'tech' ? 1 : t;
        const res = outcomes.slice(k, k + size); k += size;
        const trip = { kind: 'trip', side: off.side, shooter: p.id, results: res, size, and1: t === 'and1', tech: t === 'tech', three: t === 3 };
        if (trip.and1) {
          const twos = free.filter(s => !s.three && !s.and1);
          const host = twos.length && rng() < 0.9 ? twos[0] : free.find(s => !s.and1);
          if (host) { host.and1 = trip; free.splice(free.indexOf(host), 1); } else trip.and1 = false;
        }
        trips.push(trip);
      });
    });

    // Turnovers, with the other team's steals.
    const tovs = [];
    off.lines.forEach(p => { for (let i = 0; i < p.tov; i++) tovs.push({ kind: 'tov', side: off.side, player: p.id }); });
    shuffle(tovs, rng);
    const stealers = []; def.lines.forEach(p => { for (let i = 0; i < p.stl; i++) stealers.push(p.id); });
    shuffle(stealers, rng);
    stealers.forEach((id, i) => { if (tovs[i]) tovs[i].steal = id; });

    // The other team's blocks, on missed twos first.
    const missed2 = shots.filter(s => !s.made && !s.three), missed3 = shots.filter(s => !s.made && s.three);
    const blockers = []; def.lines.forEach(p => { for (let i = 0; i < p.blk; i++) blockers.push(p.id); });
    shuffle(blockers, rng);
    blockers.forEach(id => { const t = missed2.find(s => !s.block) || missed3.find(s => !s.block); if (t) t.block = id; });

    // Assists on made shots, never by the shooter.
    const passers = []; off.lines.forEach(p => { for (let i = 0; i < p.ast; i++) passers.push(p.id); });
    passers.sort((a, b) => byId[b].ast - byId[a].ast || (rng() - 0.5));
    passers.forEach(id => {
      const open = shots.filter(s => s.made && !s.assist && s.shooter !== id);
      if (!open.length) return;
      const s = pickW(open, x => (x.three ? 1.7 : 1) * (x.and1 ? 0.6 : 1), rng);
      s.assist = id;
    });

    // Fouls by the defense: one per trip to the line, the rest on the floor.
    const foulers = []; def.lines.forEach(p => { for (let i = 0; i < p.pf; i++) foulers.push(p.id); });
    shuffle(foulers, rng);
    const fouls = [];
    trips.forEach(t => { if (!t.tech) t.fouler = foulers.pop() || null; });
    foulers.forEach(id => fouls.push({ kind: 'foul', side: off.side, fouler: id }));

    return { shots, trips, tovs, fouls };
  }

  // Every miss that ends with a rebound: missed shots, and the last free
  // throw of a trip when it misses.
  const lastMissed = t => t.results.length && !t.results[t.results.length - 1];

  function assignRebounds(off, def, items, rng) {
    const chances = () => items.shots.filter(s => !s.made).concat(items.trips.filter(t => !t.tech && lastMissed(t)));
    const offBoards = []; off.lines.forEach(p => { for (let i = 0; i < p.oreb; i++) offBoards.push(p.id); });
    const defBoards = []; def.lines.forEach(p => { for (let i = 0; i < p.dreb; i++) defBoards.push(p.id); });
    const need = offBoards.length + defBoards.length;
    // Not enough misses for the credited boards: move one of a shooter's
    // missed free throws to the end of a trip (his FTM and FTA don't change).
    for (let guard = 0; chances().length < need && guard < 300; guard++) {
      const slots = [];
      items.trips.forEach(t => { if (!t.tech) t.results.forEach((r, i) => slots.push({ t, i, last: i === t.results.length - 1, r })); });
      const lastMade = slots.filter(x => x.last && x.r);
      let done = false;
      for (const lm of shuffle(lastMade, rng)) {
        const early = slots.find(x => !x.last && !x.r && x.t.shooter === lm.t.shooter);
        if (early) { early.t.results[early.i] = true; lm.t.results[lm.i] = false; done = true; break; }
      }
      if (!done) break;
    }
    const list = chances();
    shuffle(offBoards, rng); shuffle(defBoards, rng);
    let team = Math.max(0, list.length - need);
    const take = (arr, prefer) => {
      const i = prefer != null ? arr.indexOf(prefer) : -1;
      return i >= 0 ? arr.splice(i, 1)[0] : arr.pop();
    };
    const give = (c, ftFactor) => {
      const wOff = offBoards.length * ftFactor, wDef = defBoards.length, wTeam = team * (ftFactor < 1 ? 1.3 : 1);
      const total = wOff + wDef + wTeam;
      if (total <= 0) { c.reb = { team: true }; return; }
      let r = rng() * total;
      if ((r -= wOff) < 0) {
        // Putbacks: a big often grabs his own miss.
        const own = c.kind === 'shot' && !c.three && rng() < 0.3 ? c.shooter : null;
        c.reb = { off: true, player: take(offBoards, own) }; return;
      }
      if ((r -= wDef) < 0) { c.reb = { off: false, player: take(defBoards) }; return; }
      team--; c.reb = { team: true };
    };
    // Free throws are rarely rebounded by the shooting team.
    shuffle(list.filter(c => c.kind === 'trip'), rng).forEach(c => give(c, 0.35));
    shuffle(list.filter(c => c.kind === 'shot'), rng).forEach(c => give(c, 1));
    // Older box scores (from before rebounds were tied to misses) can claim
    // more boards than there were misses; verify() reports what's left.
    return { dropped: offBoards.length + defBoards.length };
  }

  // Does this item end the team's possession?
  function ends(it) {
    if (it.kind === 'foul') return false;
    if (it.kind === 'tov' || it.kind === 'held') return true;
    if (it.kind === 'shot') {
      if (it.made) return !(it.and1 && lastMissed(it.and1) && it.and1.reb && (it.and1.reb.off || it.and1.reb.teamOff));
      return !(it.reb && (it.reb.off || it.reb.teamOff));
    }
    if (it.kind === 'trip') {
      if (it.tech) return false;
      if (!lastMissed(it)) return true;
      return !(it.reb && (it.reb.off || it.reb.teamOff));
    }
    return true;
  }
  const itemPoints = it => {
    if (it.kind === 'shot') return (it.made ? (it.three ? 3 : 2) : 0) + (it.and1 ? it.and1.results.filter(Boolean).length : 0);
    if (it.kind === 'trip') return it.results.filter(Boolean).length;
    return 0;
  };
  // Standalone trips exclude and-ones (those ride on their shot).
  const topItems = items => items.shots.concat(items.trips.filter(t => !t.and1), items.tovs, items.fouls, items.held || []);

  // ---------- possessions ----------
  function balance(sides, rng) {
    const count = s => topItems(s.items).filter(ends).length;
    const teamRebs = s => topItems(s.items).concat(s.items.shots.map(x => x.and1).filter(Boolean))
      .filter(it => it.reb && it.reb.team && !it.reb.teamOff);
    let [H, A] = sides;
    for (let guard = 0; guard < 60; guard++) {
      const d = count(H) - count(A);
      if (Math.abs(d) <= 1) break;
      const big = d > 0 ? H : A, small = d > 0 ? A : H;
      const tr = teamRebs(big);
      if (tr.length) { tr[0].reb.teamOff = true; continue; }       // ball goes out off the defense
      (small.items.held = small.items.held || []).push({ kind: 'held', side: small.side });  // held ball, arrow to the other team
    }
  }

  function buildPossessions(side, rng) {
    const all = topItems(side.items);
    const enders = all.filter(ends), conts = all.filter(it => !ends(it));
    const poss = enders.map(e => ({ side: side.side, items: [e] }));
    if (!poss.length) poss.push({ side: side.side, items: [{ kind: 'held', side: side.side }] });
    conts.forEach(c => {
      // Put-backs: an offensive rebound often leads straight to the
      // rebounder's own shot.
      const rebounder = c.reb && c.reb.player;
      let host = null;
      if (rebounder && rng() < 0.6) {
        const mine = poss.filter(p => p.items.length === 1 && p.items[0].kind === 'shot' && p.items[0].shooter === rebounder && !p.items[0].three);
        if (mine.length) host = pickOne(mine, rng);
      }
      if (!host) host = pickOne(poss, rng);
      host.items.splice(Math.floor(rng() * host.items.length), 0, c);   // before the ender
      if (host.items[host.items.length - 1] === c) { host.items.pop(); host.items.unshift(c); }
    });
    poss.forEach(p => {
      p.pts = p.items.reduce((a, it) => a + itemPoints(it), 0);
      const last = p.items[p.items.length - 1];
      p.actor = last.shooter || last.player || null;
      p.hasTrip = p.items.some(it => it.kind === 'trip' || (it.kind === 'shot' && it.and1));
      p.hasThree = p.items.some(it => it.kind === 'shot' && it.three);
      p.steal = last.kind === 'tov' && !!last.steal;
    });
    return shuffle(poss, rng);
  }

  // ---------- ordering: the story of the game ----------
  function order(sides, meta, rng) {
    const [H, A] = sides;
    const M = meta.homeScore - meta.awayScore;
    const nH = H.poss.length, nA = A.poss.length;
    const firstBall = rng() < 0.5 ? 'home' : 'away';
    const other = s => (s === 'home' ? 'away' : 'home');

    // Overtime: some close games were tied after forty minutes.
    let otSets = null;
    if (Math.abs(M) <= 3 && rng() < 0.28 && nH > 12 && nA > 12) otSets = pickOvertime(H.poss, A.poss, M, rng);

    const periods = [];
    const regH = otSets ? H.poss.filter(p => !otSets.h.includes(p)) : H.poss.slice();
    const regA = otSets ? A.poss.filter(p => !otSets.a.includes(p)) : A.poss.slice();
    const R = regH.length + regA.length;
    const dReg = regH.length - regA.length;   // home minus away, within one
    // Pick first-half length so each half alternates cleanly.
    let h1 = Math.round(R / 2 + (rng() - 0.5) * 4);
    const firstIsHome = firstBall === 'home';
    const fits = h => {
      const h2 = R - h;
      const home = firstIsHome ? Math.ceil(h / 2) + Math.floor(h2 / 2) : Math.floor(h / 2) + Math.ceil(h2 / 2);
      return home === regH.length;
    };
    for (let k = 0; k < 6 && !fits(h1); k++) h1 += k % 2 ? -k : k;
    if (!fits(h1)) { h1 = Math.floor(R / 2); if (!fits(h1)) h1++; }
    periods.push({ label: '1st Half', short: '1st', len: HALF, first: firstBall, slots: h1 });
    periods.push({ label: '2nd Half', short: '2nd', len: HALF, first: other(firstBall), slots: R - h1 });
    if (otSets) {
      const L = otSets.h.length + otSets.a.length;
      periods.push({ label: 'Overtime', short: 'OT', len: OT_LEN, first: otSets.first, slots: L });
    }
    void dReg;

    // Sequence the regulation possessions against a target scoreline:
    // a random walk from 0-0 to the final margin (or a tie, if the game
    // goes to overtime), so leads grow, shrink and change hands the way
    // real ones do.
    const seq = [];
    const place = (poolH, poolA, perList, endMargin, startMargin) => {
      const total = perList.reduce((a, p) => a + p.slots, 0);
      const walk = [0];
      const sd = Math.min(2.1, 0.9 + Math.abs(endMargin - startMargin) * 0.012) * (0.8 + rng() * 0.6);
      for (let k = 1; k <= total; k++) walk.push(walk[k - 1] + gauss(rng) * sd);
      const target = k => startMargin + (endMargin - startMargin) * (k / total) + walk[k] - walk[total] * (k / total);
      let margin = startMargin, k = 0, tot = 0;
      const pools = { home: poolH.slice(), away: poolA.slice() };
      // Scoring comes at an even pace across the period(s), give or take.
      const allPts = poolH.concat(poolA).reduce((a2, p) => a2 + p.pts, 0);
      const totAim = kk => allPts * (kk / total);
      perList.forEach((per, pi) => {
        let side = per.first;
        for (let s = 0; s < per.slots; s++, k++) {
          const pool = pools[side];
          if (!pool.length) { side = other(side); continue; }
          const tFrac = s / Math.max(1, per.slots);
          const lateClose = (pi === perList.length - 1) && per.slots - s <= 8 && Math.abs(margin) <= 9;
          const byPts = {};
          pool.forEach(p => { (byPts[p.pts] = byPts[p.pts] || []).push(p); });
          const values = Object.keys(byPts).map(Number);
          const sign = side === 'home' ? 1 : -1;
          const aim = target(k + 1);
          const v = pickW(values, val => Math.exp(-Math.abs(margin + sign * val - aim) / 2.2) * Math.exp(-Math.abs(tot + val - totAim(k + 1)) / 5) * Math.sqrt(byPts[val].length), rng);
          const leading = sign * margin > 0;
          const chosen = pickW(byPts[v], p => {
            let w = activity(p.actorLine, tFrac, pi);
            if (lateClose && leading && p.hasTrip) w *= 4;        // trailing team fouls
            if (lateClose && !leading && p.hasThree) w *= 2.5;    // trailing team hunts threes
            return w;
          }, rng);
          pool.splice(pool.indexOf(chosen), 1);
          margin += sign * chosen.pts;
          tot += chosen.pts;
          seq.push({ period: pi, poss: chosen });
          side = other(side);
        }
      });
      // Anything left over (a period whose alternation ran short) goes at the end.
      ['home', 'away'].forEach(sd2 => pools[sd2].forEach(p => seq.push({ period: perList.length - 1, poss: p })));
      return margin;
    };
    const regPeriods = periods.slice(0, 2);
    const regEnd = otSets ? 0 : M;
    place(regH, regA, regPeriods, regEnd, 0);
    if (otSets) {
      const before = seq.length;
      place(otSets.h, otSets.a, [periods[2]], M, 0);
      for (let i = before; i < seq.length; i++) seq[i].period = 2;
    }
    return { periods, seq, firstBall };
  }

  // Chooses overtime possessions so regulation ends tied.
  function pickOvertime(hPoss, aPoss, M, rng) {
    const k = 8 + Math.floor(rng() * 3);
    const first = rng() < 0.5 ? 'home' : 'away';
    const kh = first === 'home' ? k : k - (rng() < 0.5 ? 0 : 1), ka = first === 'away' ? k : k - (rng() < 0.5 ? 0 : 1);
    const h = shuffle(hPoss.slice(), rng).slice(0, kh), a = shuffle(aPoss.slice(), rng).slice(0, ka);
    const restH = hPoss.filter(p => !h.includes(p)), restA = aPoss.filter(p => !a.includes(p));
    const diff = () => h.reduce((s, p) => s + p.pts, 0) - a.reduce((s, p) => s + p.pts, 0);
    for (let i = 0; i < 2000 && diff() !== M; i++) {
      const home = rng() < 0.5;
      const set = home ? h : a, rest = home ? restH : restA;
      if (!set.length || !rest.length) continue;
      const x = Math.floor(rng() * set.length), y = Math.floor(rng() * rest.length);
      const before = Math.abs(diff() - M);
      [set[x], rest[y]] = [rest[y], set[x]];
      if (Math.abs(diff() - M) > before && rng() < 0.85) [set[x], rest[y]] = [rest[y], set[x]];
    }
    if (diff() !== M) return null;
    // Regulation still has to alternate cleanly.
    if (Math.abs((hPoss.length - h.length) - (aPoss.length - a.length)) > 1) return null;
    const pts = h.concat(a).reduce((s, p) => s + p.pts, 0);
    if (pts < 8 || pts > 34) return null;
    // Alternation inside overtime has to fit the counts.
    const hc = first === 'home' ? Math.ceil((h.length + a.length) / 2) : Math.floor((h.length + a.length) / 2);
    if (hc !== h.length) return null;
    return { h, a, first };
  }

  // Starters open and close each half; the bench plays the middle.
  function activity(line, tFrac, period) {
    if (!line) return 1;
    const edge = tFrac < 0.3 ? 1 : tFrac > 0.78 ? 1 : 0.25;
    const base = line.starter ? 0.5 + 0.5 * edge : 0.5 + 0.5 * (1 - edge);
    return base * (0.4 + Math.min(1, (line.min || 20) / 32));
  }

  // ---------- words ----------
  const T2_BIG = ['finishes at the rim', 'throws down a dunk', 'scores on a hook shot', 'hits a turnaround jumper', 'lays it in', 'scores through contact inside', 'drops in a short jumper'];
  const T2_WING = ['hits a pull-up jumper', 'knocks down a mid-range jumper', 'scores on a driving layup', 'floats one in', 'finishes a reverse layup', 'hits a step-back jumper', 'gets to the rim for two'];
  const M2_BIG = ['misses a hook shot', 'can\'t finish inside', 'misses a short jumper', 'misses a layup'];
  const M2_WING = ['misses a pull-up jumper', 'misses a floater', 'can\'t get the layup to fall', 'misses a mid-range jumper', 'misses a driving layup'];
  const T3 = ['buries a three from the corner', 'drills a three from the wing', 'knocks down a three', 'hits a step-back three', 'splashes a deep three', 'nails a three from the top of the key'];
  const M3 = ['misses a three', 'misses from deep', 'can\'t connect from three', 'misses a three from the corner', 'rims out a three'];
  const TOV = ['throws it away', 'is called for traveling', 'loses the ball out of bounds', 'turns it over', 'commits a shot-clock violation', 'is whistled for a three-second violation'];

  // ---------- events ----------
  function narrate(meta, sides, ord, rng) {
    const byId = {};
    sides.forEach(s => s.lines.forEach(p => { byId[p.id] = { ...p, side: s.side }; }));
    const nm = id => (byId[id] ? byId[id].name : 'Team');
    const ln = id => (byId[id] ? lastName(byId[id].name) : 'Team');
    const teamName = side => (side === 'home' ? meta.home.school : meta.away.school);
    const isBig = id => byId[id] && BIGS.includes(byId[id].pos);

    const events = [];
    let h = 0, a = 0;
    const pts = { home: {}, away: {} }, reb = {}, ast = {};
    let run = { side: null, pts: 0 };
    let lead = 0, leadChanges = 0, ties = 0, maxLead = { home: 0, away: 0 };
    const timeouts = { home: 4, away: 4 };
    let lastTimeout = { home: -999, away: -999 };
    const media = [960, 720, 480, 240];

    const periodStartT = [];
    let tAcc = 0;
    ord.periods.forEach(p => { periodStartT.push(tAcc); tAcc += p.len; });
    const totalT = tAcc;

    const push = (ev) => { ev.i = events.length; ev.h = h; ev.a = a; events.push(ev); return ev; };
    const scoreText = () => `${meta.away.school} ${a}, ${meta.home.school} ${h}`;
    const milestone = (id, side) => {
      const p = pts[side][id] || 0;
      const r = reb[id] || 0, as = ast[id] || 0;
      const notes = [];
      [20, 30, 40].forEach(m => { if (p >= m && !(byId[id]['m' + m])) { byId[id]['m' + m] = true; notes.push(`${m} points for ${ln(id)}`); } });
      if (!byId[id].dd && [p, r, as].filter(x => x >= 10).length >= 2) { byId[id].dd = true; notes.push(`double-double for ${ln(id)}`); }
      return notes;
    };
    const score = (side, add, ev) => {
      if (!add) return;
      const before = h - a;
      if (side === 'home') h += add; else a += add;
      const after = h - a;
      if (run.side === side) run.pts += add; else run = { side, pts: add, from: before };
      if (before !== 0 && Math.sign(after) !== Math.sign(before) && after !== 0) { leadChanges++; ev.tags.push('lead-change'); }
      if (after === 0) { ties++; ev.tags.push('tie'); }
      if (after > maxLead.home) maxLead.home = after;
      if (-after > maxLead.away) maxLead.away = -after;
      ev.h = h; ev.a = a;
    };

    let slot = 0;
    ord.periods.forEach((per, pi) => {
      const slots = ord.seq.filter(x => x.period === pi);
      // Clock: each possession takes a share of the period, faster in
      // transition and at the end of close games.
      const dur = slots.map((x, k) => {
        const p = x.poss;
        let d = 12 + rng() * 13 + (p.items.length - 1) * 5;
        const prev = slots[k - 1];
        if (prev && prev.poss.steal) d = 5 + rng() * 5;
        if (p.hasTrip && k > slots.length - 8 && pi >= 1) d = 4 + rng() * 7;
        return d;
      });
      // Most periods end with a few seconds going unused; now and then the
      // last shot goes up at the horn.
      const tail = rng() < 0.18 ? 0 : 2 + rng() * 16;
      const scale = (per.len - tail) / dur.reduce((s, d) => s + d, 0);
      let clock = per.len;
      const start = periodStartT[pi];
      if (pi === 0) push({ t: 0, period: 0, clock: per.len, side: per.first, type: 'tip', text: `${teamName(per.first)} wins the opening tip`, tags: [] });
      else push({ t: start, period: pi, clock: per.len, side: per.first, type: 'start', text: pi === 2 ? `Overtime is underway — ${teamName(per.first)} wins the tip` : `Second half underway, ${teamName(per.first)} ball`, tags: [] });
      let mediaIdx = 0;

      slots.forEach((x, k) => {
        const p = x.poss;
        const side = p.side, opp = side === 'home' ? 'away' : 'home';
        const d = dur[k] * scale;
        const c0 = clock;
        clock = Math.max(0, clock - d);
        if (k === slots.length - 1) clock = tail;
        const steps = p.items.length;
        p.items.forEach((it, j) => {
          const c = Math.max(0, c0 - (c0 - clock) * (j + 1) / steps);
          const t = start + (per.len - c);
          const base = { t, period: pi, clock: c, side, tags: [] };
          if (it.kind === 'shot') {
            const val = it.three ? 3 : 2;
            const words = it.made ? (it.three ? T3 : isBig(it.shooter) ? T2_BIG : T2_WING) : (it.three ? M3 : isBig(it.shooter) ? M2_BIG : M2_WING);
            let verb = pickOne(words, rng);
            const prevEv = events[events.length - 1];
            if (it.made && !it.three && prevEv && prevEv.type === 'reb' && prevEv.player === it.shooter) verb = pickOne(['puts back his own miss', 'tips it in', 'scores the putback'], rng);
            if (it.made && !it.three && prevEv && prevEv.type === 'tov' && prevEv.steal && rng() < 0.7) verb = pickOne(['finishes in transition', 'goes the other way for the layup', 'throws down the breakaway dunk'], rng);
            let text = `${nm(it.shooter)} ${verb}`;
            if (it.made && it.assist) text += `${rng() < 0.5 ? ' — assisted by ' : ', feed from '}${nm(it.assist)}`;
            if (!it.made && it.block) text = `${nm(it.block)} blocks ${poss(ln(it.shooter))} ${it.three ? 'three' : 'shot'}`;
            const ev = push({ ...base, type: it.made ? 'make' : 'miss', player: it.shooter, assist: it.assist || null, block: it.block || null, three: it.three, pts: it.made ? val : 0, text, tags: it.three ? ['three'] : [] });
            if (it.made) {
              score(side, val, ev);
              pts[side][it.shooter] = (pts[side][it.shooter] || 0) + val;
              if (it.assist) ast[it.assist] = (ast[it.assist] || 0) + 1;
              if (/dunk/.test(verb)) ev.tags.push('dunk');
            }
            if (it.and1) {
              const f = it.and1;
              ev.text += ` — and the foul${f.fouler ? ' on ' + ln(f.fouler) : ''}!`;
              ev.tags.push('and1');
              if (f.fouler) push({ ...base, type: 'foul', player: f.fouler, shooting: true, text: `Shooting foul on ${nm(f.fouler)}`, tags: [], silent: true });
              const made = f.results[0];
              const fe = push({ ...base, type: 'ft', player: it.shooter, made, pts: made ? 1 : 0, text: `${nm(it.shooter)} ${made ? 'completes the three-point play' : 'misses the and-one free throw'}`, tags: [] });
              if (made) { score(side, 1, fe); pts[side][it.shooter] = (pts[side][it.shooter] || 0) + 1; }
              else rebound(f, base, side, opp);
            }
            if (!it.made) rebound(it, base, side, opp);
            const notes = it.made || it.and1 ? milestone(it.shooter, side) : [];
            if (it.made && notes.length) { ev.text += ` (${notes.join(', ')})`; ev.tags.push('milestone'); }
          } else if (it.kind === 'trip') {
            if (it.tech) push({ ...base, side: opp, type: 'foul', player: null, tech: true, text: `Technical foul on the ${teamName(opp)} bench`, tags: [] });
            else if (it.fouler) push({ ...base, side: opp, type: 'foul', player: it.fouler, shooting: true, text: `${it.three ? 'Foul on a three-point attempt' : 'Shooting foul'} — ${nm(it.fouler)}`, tags: [] });
            else push({ ...base, side: opp, type: 'foul', player: null, text: `Foul on ${teamName(opp)}`, tags: [] });
            it.results.forEach((made, r) => {
              const fe = push({ ...base, type: 'ft', player: it.shooter, made, pts: made ? 1 : 0, text: `${nm(it.shooter)} ${made ? 'makes' : 'misses'} free throw ${r + 1} of ${it.results.length}`, tags: [] });
              if (made) { score(side, 1, fe); pts[side][it.shooter] = (pts[side][it.shooter] || 0) + 1; }
            });
            const notes = milestone(it.shooter, side);
            if (notes.length) events[events.length - 1].text += ` (${notes.join(', ')})`;
            if (lastMissed(it)) rebound(it, base, side, opp);
          } else if (it.kind === 'tov') {
            const text = it.steal
              ? pickOne([`${nm(it.steal)} steals it from ${ln(it.player)}`, `${nm(it.steal)} picks off ${poss(ln(it.player))} pass`, `${nm(it.steal)} strips ${ln(it.player)}`, `${nm(it.steal)} jumps the passing lane — turnover on ${ln(it.player)}`], rng)
              : `${nm(it.player)} ${pickOne(TOV, rng)}`;
            push({ ...base, type: 'tov', player: it.player, steal: it.steal || null, text, tags: it.steal ? ['steal'] : [] });
          } else if (it.kind === 'foul') {
            push({ ...base, side: opp, type: 'foul', player: it.fouler, text: `Foul on ${nm(it.fouler)}`, tags: [] });
          } else if (it.kind === 'held') {
            push({ ...base, type: 'held', text: `Held ball — the possession arrow goes to ${teamName(opp)}`, tags: [] });
          }
        });

        // Momentum: runs, and the timeouts they force.
        const last = events[events.length - 1];
        if (run.pts >= 8 && run.side) {
          const lastRun = events.slice().reverse().find(e => e.runNote);
          if (!lastRun || lastRun.runPts < run.pts - 3 || lastRun.runSide !== run.side) {
            last.runNote = true; last.runPts = run.pts; last.runSide = run.side;
            last.tags.push('run');
            last.text += ` — ${teamName(run.side)} on a ${run.pts}-0 run`;
          }
          const vict = run.side === 'home' ? 'away' : 'home';
          if (timeouts[vict] > 0 && last.t - lastTimeout[vict] > 240 && clock > 30) {
            timeouts[vict]--; lastTimeout[vict] = last.t;
            push({ t: last.t, period: pi, clock, side: vict, type: 'timeout', text: `Timeout ${teamName(vict)}`, tags: [] });
          }
        }
        // Media timeouts at the first stoppage under 16, 12, 8 and 4.
        if (pi < 2 && mediaIdx < media.length && clock <= media[mediaIdx] && ['make', 'tov', 'foul', 'ft', 'held'].includes(last.type)) {
          push({ t: last.t, period: pi, clock, side: null, type: 'timeout', media: true, text: `Media timeout — ${scoreText()}`, tags: [] });
          while (mediaIdx < media.length && clock <= media[mediaIdx]) mediaIdx++;
        }
        slot++;
      });

      // Buzzer-beaters: a make with a second or less at the end of a period.
      const lastMake = events.slice().reverse().find(e => e.period === pi && e.type === 'make');
      if (lastMake && lastMake.clock <= 1.5) lastMake.tags.push('buzzer');
      const endT = periodStartT[pi] + per.len;
      const tied = h === a;
      if (pi === ord.periods.length - 1) {
        push({ t: endT, period: pi, clock: 0, side: null, type: 'final', text: `Final${pi === 2 ? '/OT' : ''}: ${h > a ? meta.home.school : meta.away.school} ${Math.max(h, a)}, ${h > a ? meta.away.school : meta.home.school} ${Math.min(h, a)}`, tags: [] });
      } else if (pi === 0) {
        push({ t: endT, period: pi, clock: 0, side: null, type: 'end', text: `Halftime — ${scoreText()}`, tags: [] });
      } else {
        push({ t: endT, period: pi, clock: 0, side: null, type: 'end', text: tied ? `End of regulation, tied at ${h} — we're going to overtime!` : `End of regulation — ${scoreText()}`, tags: tied ? ['overtime'] : [] });
      }
    });

    function rebound(it, base, side, opp) {
      const r = it.reb;
      if (!r) return;
      if (r.team) {
        const keeps = r.teamOff;
        push({ ...base, t: base.t, side: keeps ? side : opp, type: 'reb', player: null, off: !!keeps, team: true, text: keeps ? `Out of bounds off the defense — ${teamName(side)} keeps it` : `Team rebound ${teamName(opp)}`, tags: [] });
        return;
      }
      if (r.player) reb[r.player] = (reb[r.player] || 0) + 1;
      const ev = push({ ...base, side: r.off ? side : opp, type: 'reb', player: r.player, off: !!r.off, text: `${r.off ? 'Offensive' : 'Defensive'} rebound — ${nm(r.player)}`, tags: [] });
      const notes = milestone(r.player, r.off ? side : opp);
      if (notes.length) ev.text += ` (${notes.join(', ')})`;
    }

    return { events, totalT, leadChanges, ties, maxLead };
  }

  // ---------- win probability and the story after ----------
  function winProb(margin, t, total, spread, ot) {
    const reg = 2 * HALF;
    const remain = ot ? Math.max(0, total - t) : Math.max(0, reg - t);
    const r = Math.max(0, remain / reg);
    if (r <= 0.0005) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
    const mu = margin + spread * r;
    return Math.min(0.999, Math.max(0.001, phi(mu / (11 * Math.sqrt(r)))));
  }

  function gameScore(b) {
    return b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.oreb + 0.3 * (b.reb - b.oreb) + b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov;
  }

  // Replays events into box scores (the live box during playback).
  function boxAt(game, upto) {
    const box = { home: {}, away: {} };
    const blank = () => ({ pts: 0, fgm: 0, fga: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0, oreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 });
    const sideOf = {};
    game.lines.home.forEach(p => { box.home[p.id] = blank(); sideOf[p.id] = 'home'; });
    game.lines.away.forEach(p => { box.away[p.id] = blank(); sideOf[p.id] = 'away'; });
    const get = id => (sideOf[id] ? box[sideOf[id]][id] : null);
    const stop = upto == null ? game.events.length : upto;
    for (let i = 0; i < stop; i++) {
      const e = game.events[i];
      const b = get(e.player);
      if (e.type === 'make' || e.type === 'miss') {
        if (b) { b.fga++; if (e.three) b.threePa++; if (e.type === 'make') { b.fgm++; b.pts += e.three ? 3 : 2; if (e.three) b.threePm++; } }
        if (e.assist && get(e.assist)) get(e.assist).ast++;
        if (e.block && get(e.block)) get(e.block).blk++;
      } else if (e.type === 'ft') { if (b) { b.fta++; if (e.made) { b.ftm++; b.pts++; } } }
      else if (e.type === 'reb') { if (b) { b.reb++; if (e.off) b.oreb++; } }
      else if (e.type === 'tov') { if (b) b.tov++; if (e.steal && get(e.steal)) get(e.steal).stl++; }
      else if (e.type === 'foul') { if (b) b.pf++; }
    }
    return box;
  }

  function verify(game) {
    const box = boxAt(game);
    const diffs = [];
    ['home', 'away'].forEach(side => game.lines[side].forEach(p => {
      const b = box[side][p.id];
      const want = { pts: p.twoPm * 2 + p.threePm * 3 + p.ftm, fgm: p.twoPm + p.threePm, fga: p.twoPa + p.threePa, threePm: p.threePm, threePa: p.threePa, ftm: p.ftm, fta: p.fta, oreb: p.oreb, reb: p.oreb + p.dreb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf };
      Object.keys(want).forEach(k => { if (b[k] !== want[k]) diffs.push(`${p.name} ${k} ${b[k]} vs ${want[k]}`); });
    }));
    const last = game.events[game.events.length - 1];
    if (last.h !== game.meta.homeScore || last.a !== game.meta.awayScore) diffs.push(`score ${last.h}-${last.a} vs ${game.meta.homeScore}-${game.meta.awayScore}`);
    return { ok: diffs.length === 0, diffs };
  }

  // ---------- the whole broadcast ----------
  // meta: { key, home: {school, rank?, record?}, away: {...}, neutral, label,
  //         spread (expected home margin), homeScore, awayScore }
  // lines: { home: [box lines], away: [box lines] }
  function build(meta, lines) {
    const rng = rngFrom(hash(String(meta.key || 'game')));
    const H = { side: 'home', lines: (lines.home || []).map(cleanLine) };
    const A = { side: 'away', lines: (lines.away || []).map(cleanLine) };
    const byId = {};
    H.lines.concat(A.lines).forEach(p => { byId[p.id] = p; });
    H.items = buildItems(H, A, rng); A.items = buildItems(A, H, rng);
    const dropH = assignRebounds(H, A, H.items, rng).dropped, dropA = assignRebounds(A, H, A.items, rng).dropped;
    balance([H, A], rng);
    H.poss = buildPossessions(H, rng); A.poss = buildPossessions(A, rng);
    [H, A].forEach(s => s.poss.forEach(p => { p.actorLine = byId[p.actor]; }));
    const ord = order([H, A], meta, rng);
    const told = narrate(meta, [H, A], ord, rng);
    const game = {
      meta, lines: { home: H.lines, away: A.lines },
      events: told.events, periods: ord.periods.map(p => ({ label: p.label, short: p.short, len: p.len })),
      ot: ord.periods.length > 2, total: told.totalT,
      leadChanges: told.leadChanges, ties: told.ties, maxLead: told.maxLead, droppedRebounds: dropH + dropA
    };
    const spread = Number(meta.spread) || 0;
    game.events.forEach(e => { e.wp = winProb(e.h - e.a, e.t, game.total, spread, game.ot && e.period === 2); });
    game.pregameWp = winProb(0, 0, game.total, spread, false);
    const half = game.events.find(e => e.type === 'end' && e.period === 0);
    game.halftime = half ? { home: half.h, away: half.a } : null;
    finishStory(game);
    return game;
  }

  function finishStory(game) {
    const { meta } = game;
    const box = boxAt(game);
    const homeWon = meta.homeScore > meta.awayScore;
    const winSide = homeWon ? 'home' : 'away', loseSide = homeWon ? 'away' : 'home';
    const winName = meta[winSide].school, loseName = meta[loseSide].school;
    const rated = side => game.lines[side].map(p => ({ side, p, b: box[side][p.id], gs: gameScore({ ...box[side][p.id] }) }));
    const all = rated('home').concat(rated('away')).sort((x, y) => y.gs - x.gs);
    const pog = all.find(x => x.side === winSide) || all[0];
    const statline = b => {
      const parts = [`${b.pts} pts`];
      if (b.reb >= 5) parts.push(`${b.reb} reb`);
      if (b.ast >= 4) parts.push(`${b.ast} ast`);
      if (b.stl >= 3) parts.push(`${b.stl} stl`);
      if (b.blk >= 3) parts.push(`${b.blk} blk`);
      return parts.join(', ');
    };
    game.pog = pog ? { side: pog.side, id: pog.p.id, name: pog.p.name, pos: pog.p.pos, line: statline(pog.b), box: pog.b } : null;
    game.leaders = {};
    ['home', 'away'].forEach(side => {
      const list = rated(side);
      const top = k => list.slice().sort((x, y) => y.b[k] - x.b[k])[0];
      game.leaders[side] = { pts: top('pts'), reb: top('reb'), ast: top('ast') };
    });

    // Where the game turned.
    const ev = game.events;
    let trailedBy = 0;
    ev.forEach(e => { const m = homeWon ? e.h - e.a : e.a - e.h; if (-m > trailedBy) trailedBy = -m; });
    const margin = Math.abs(meta.homeScore - meta.awayScore);
    const decisive = (() => {
      // The last time the eventual winner took the lead for good.
      for (let i = ev.length - 1; i >= 0; i--) {
        const m = homeWon ? ev[i].h - ev[i].a : ev[i].a - ev[i].h;
        if (m <= 0) return ev[i + 1] || null;
      }
      return null;
    })();
    if (decisive && decisive.type === 'make' || decisive && decisive.type === 'ft') {
      const late = decisive.period >= 1 && decisive.clock <= 40;
      if (late) decisive.tags.push('winner');
      if (late && decisive.clock <= 1.5 && decisive.type === 'make') decisive.tags.push('buzzer');
    }
    const winnerShot = decisive && decisive.tags.includes('winner') ? decisive : null;
    const who = game.pog ? `${poss(lastName(game.pog.name))} ${game.pog.box.pts}` : '';
    let verb;
    if (winnerShot && winnerShot.tags.includes('buzzer')) verb = `${poss(lastName(winnerShot.player ? game.lines[winSide].find(p => p.id === winnerShot.player).name : winName))} buzzer-beater lifts ${winName} past ${loseName}`;
    else if (game.ot) verb = `${winName} outlasts ${loseName} in overtime`;
    else if (trailedBy >= 12) verb = `${winName} rallies from ${trailedBy} down to beat ${loseName}`;
    else if (margin >= 25) verb = `${winName} routs ${loseName}`;
    else if (margin >= 12) verb = `${winName} pulls away from ${loseName}`;
    else if (margin <= 3) verb = `${winName} holds off ${loseName}`;
    else verb = `${winName} beats ${loseName}`;
    game.headline = `${verb} ${Math.max(meta.homeScore, meta.awayScore)}-${Math.min(meta.homeScore, meta.awayScore)}${who && !/buzzer/.test(verb) ? ` behind ${who} points` : ''}`;
    game.trailedBy = trailedBy;

    // Key moments for the recap.
    const moments = ev.filter(e => e.tags.some(t => ['run', 'winner', 'buzzer', 'overtime'].includes(t)) ||
      (e.tags.includes('lead-change') && e.period >= 1 && e.clock <= 300) || (e.tags.includes('milestone') && /30|40/.test(e.text)));
    game.moments = moments.slice(-8).map(e => e.i);
  }

  // Overtime is a property of the broadcast; this lets schedules label it.
  function wentToOvertime(meta, lines) {
    try { return build(meta, lines).ot; } catch (e) { return false; }
  }

  const LiveCore = { build, boxAt, verify, winProb, gameScore, hash, rngFrom, lastName, wentToOvertime };
  if (typeof window !== 'undefined') window.LiveCore = LiveCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = LiveCore;
})();
