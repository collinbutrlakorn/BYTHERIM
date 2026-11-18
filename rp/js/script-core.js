// ============================================================
// Scripted players — a short, editable list of players whose seasons are
// written in advance. Pure and DOM-free, shared by the simulation and its
// tests.
//
// Everything about them lives in TABLE below, one row per player. Players
// are matched by NAME, so it works for whoever the roster sheet puts under
// that name, at whatever school and in whatever year.
//
//   starter   always in the starting five (a "Starter" role from the sheet)
//   mpg       the fewest minutes a night he is allowed to average
//   pos       position forced onto him (a guard the sheet lists as a wing)
//   floors    the least he averages over a season. The numbers are
//             MINIMUMS: the sim aims a little above them and, whenever a
//             season drifts under, shifts production to him from his
//             teammates (team totals never change) until he is back.
//               ppg rpg apg stl blk   per game
//               stocks                steals + blocks together
//               bpm                   Box Plus/Minus, floor on the season
//   draft     { year, top }  drafted inside the top N picks of that year
//             { after:'first', top }  the draft after his first season
//   grow      { to:[ft,in], during:'FR' }  a growth spurt over that season
//   triple    a triple-double threat: near-misses get nudged over
// ============================================================
(function (root) {
  'use strict';

  const TABLE = [
    // High impact, and kept off the floor by a deep, randomly re-rolled
    // rotation. Pinned as a starter with real minutes.
    { name: 'James Stewart Jr.', school: 'Kansas', starter: true, mpg: 29 },

    // Historic disruptor: over 4 steals and blocks a game between them.
    { name: 'Kelvin Marion', school: 'Alabama', starter: true, mpg: 27,
      floors: { stocks: 4, stl: 1.6, blk: 1.9 } },

    // Dominant slashing wing who also passes.
    { name: 'Patrick Greene', school: 'Iowa', starter: true, mpg: 29,
      floors: { ppg: 16, apg: 4 }, slasher: true },

    { name: 'Payton Gibson', starter: true, mpg: 27, floors: { ppg: 13 } },

    // Posts a Box Plus/Minus over 10 every year.
    { name: 'Olumide Afolabi', starter: true, mpg: 28,
      floors: { bpm: 10, ppg: 14, rpg: 8, blk: 2 } },

    { name: 'Jakob Meyer', draft: { year: 2032, top: 3 } },
    { name: 'Henry Vernie', draft: { year: 2032, top: 3 } },

    // Grows through his freshman season and ends it at 6'9".
    { name: 'Rodney Hunt', school: 'Florida State', starter: true, mpg: 28,
      floors: { ppg: 12, rpg: 6, stl: 2 }, grow: { to: [6, 9], during: 'FR' } },

    { name: 'Raymond Towns', school: 'Notre Dame', pos: 'PG', starter: true, mpg: 31,
      floors: { ppg: 16, rpg: 7, apg: 7 } },

    // A lottery pick after his first season.
    { name: 'Jared Keefe', school: 'San Diego State', starter: true, mpg: 29,
      floors: { ppg: 14, rpg: 8, blk: 3 }, draft: { after: 'first', top: 14 } },

    { name: 'Dante Fletcher', starter: true, mpg: 33,
      floors: { ppg: 28, bpm: 17, rpg: 6, apg: 3, stl: 1.5 } },

    // Triple-double threat. The points are a floor of his own, so the
    // threat is real: a line of 7 and 7 with no scoring never gets there.
    { name: 'Jared Moreno', school: 'Duke', starter: true, mpg: 30,
      floors: { ppg: 14, rpg: 7, apg: 7 }, triple: true }
  ];

  // The sim aims a little above each minimum so "over 16" really is over.
  const CUSHION = 1.03;
  // Where a floor stat sits in his natural expectations, so the correction
  // below is only a safety net and rarely has to act.
  const NATURAL = 1.07;

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const BY_NAME = new Map();
  TABLE.forEach(e => BY_NAME.set(norm(e.name), e));

  const entryFor = p => (p && p.name ? BY_NAME.get(norm(p.name)) || null : null);
  const isScripted = p => !!entryFor(p);
  const starterPin = p => { const e = entryFor(p); return !!(e && e.starter); };
  const minutesFloor = p => { const e = entryFor(p); return e && e.mpg ? e.mpg : 0; };

  // What the sim aims for, a notch above the stated minimum.
  function targetOf(key, floor) {
    if (key === 'bpm') return floor + 0.5;
    return floor * CUSHION + 0.05;
  }
  function targets(p) {
    const e = entryFor(p);
    if (!e || !e.floors) return null;
    const t = {};
    Object.keys(e.floors).forEach(k => { t[k] = targetOf(k, e.floors[k]); });
    return t;
  }

  // ---------- Identity ----------
  // Done again whenever a season is set up, because the roster sheet can
  // re-send the position or height he was listed at.
  const inchesOf = ht => {
    const m = String(ht || '').match(/(\d)\s*['’′-]\s*(\d{1,2})/);
    return m ? +m[1] * 12 + +m[2] : null;
  };
  const htOf = (inches, like) => `${Math.floor(inches / 12)}'${inches % 12}${/"\s*$/.test(String(like || '')) ? '"' : ''}`;

  function applyIdentity(p) {
    const e = entryFor(p);
    if (!e) return false;
    if (e.pos && p.pos !== e.pos) { p.pos = e.pos; p.pos2 = null; }
    // A player who has already grown stays grown, even if the sheet
    // re-sends the height he arrived at.
    if (e.grow && p.scriptGrowth && p.scriptGrowth.done) {
      const target = e.grow.to[0] * 12 + e.grow.to[1];
      const cur = inchesOf(p.ht);
      if (cur != null && cur < target) p.ht = htOf(target, p.ht);
    }
    return true;
  }

  // ---------- Growth spurt ----------
  // Planned when the season is set up: which weeks he shoots up, an inch
  // at a time, so the height on his page climbs through the year.
  function planGrowth(p, maxWeeks, year) {
    const e = entryFor(p);
    if (!e || !e.grow) return null;
    const had = p.scriptGrowth;
    if (had && (had.year === year || had.done)) return had;   // this season's plan, or he already grew
    if (e.grow.during && p.class !== e.grow.during) return null;
    const target = e.grow.to[0] * 12 + e.grow.to[1];
    const cur = inchesOf(p.ht);
    if (cur == null || cur >= target) return null;
    const need = Math.min(8, target - cur);
    const lo = Math.max(2, Math.round(maxWeeks * 0.15)), hi = Math.max(lo + need, Math.round(maxWeeks * 0.9));
    // Random weeks, but never the same twice for one player and season
    // (so a save reloaded mid-season agrees with itself).
    const weeks = [];
    const PC = typeof PlayerCore !== 'undefined' ? PlayerCore : root.PlayerCore;
    for (let i = 0; weeks.length < need && i < 200; i++) {
      const r = PC ? PC.hash01(p.name + '|' + year, 'spurt' + i) : Math.random();
      const w = lo + Math.floor(r * (hi - lo + 1));
      if (!weeks.includes(w)) weeks.push(w);
    }
    while (weeks.length < need) weeks.push(hi - weeks.length);
    weeks.sort((a, b) => a - b);
    p.scriptGrowth = { year, from: cur, to: target, weeks, done: false };
    return p.scriptGrowth;
  }

  // Applies this week's inch (if any). Returns what happened, for the news.
  function growthForWeek(p, week) {
    const g = p && p.scriptGrowth;
    if (!g || g.done) return null;
    const due = g.weeks.filter(w => w <= week).length;
    const want = Math.min(g.to, g.from + due);
    const cur = inchesOf(p.ht);
    if (cur == null || want <= cur) return null;
    p.ht = htOf(want, p.ht);
    if (want >= g.to) g.done = true;
    return { from: cur, to: want, first: cur === g.from, last: want >= g.to, ht: p.ht };
  }

  // ---------- Expectations ----------
  // Lifts a player's expected line to his floors (with room above them).
  // Idempotent: it only ever raises a number, so running it again after
  // the team's scoring has been scaled is safe.
  function liftExpectations(exp, p) {
    const e = entryFor(p);
    if (!e || !e.floors || !exp) return exp;
    const mpg = parseFloat(exp.mpg) || 0;
    if (mpg <= 0.5) return exp;
    const t = targets(p);
    const num = k => parseFloat(exp[k]) || 0;
    const raise = (k, goal) => {
      const cur = num(k);
      const want = goal * NATURAL;
      if (cur >= want) return 1;
      exp[k] = want;
      return cur > 0 ? want / cur : 1;
    };
    if (t.ppg != null) {
      const f = raise('ppg', t.ppg);
      if (f > 1) {
        exp.fta = num('fta') * Math.pow(f, 0.7);
        // Scoring this much is not done on the usual shooting: the extra
        // points come with better looks and more trips to the line.
        const boost = Math.min(1, (f - 1) / 0.6);
        exp.twoPPct = Math.min(0.72, num('twoPPct') + 0.035 * boost);
        exp.ftPct = Math.min(0.9, num('ftPct') + 0.03 * boost);
        exp.tov = num('tov') * (1 + 0.1 * (f - 1));
      }
    }
    if (t.rpg != null) raise('rpg', t.rpg);
    if (t.apg != null) { const f = raise('apg', t.apg); if (f > 1) exp.tov = num('tov') * (1 + 0.12 * (f - 1)); }
    ['stl', 'blk'].forEach(k => { if (t[k] != null) raise(k, t[k]); });
    if (t.stocks != null) {
      const s = num('stl') + num('blk');
      const want = t.stocks * NATURAL;
      if (s < want) {
        const f = want / Math.max(0.1, s);
        exp.stl = num('stl') * f;
        exp.blk = num('blk') * f;
      }
    }
    // A BPM this high comes from doing everything well.
    if (t.bpm != null) {
      exp.twoPPct = Math.min(0.72, Math.max(num('twoPPct'), 0.56));
      exp.ftPct = Math.min(0.88, Math.max(num('ftPct'), 0.72));
      exp.tov = num('tov') * 0.88;
      if (t.ppg == null) raise('ppg', 14 + Math.max(0, t.bpm - 8) * 0.9);
      raise('rpg', 5.5 + Math.max(0, t.bpm - 8) * 0.35);
      raise('stl', 1.1 + Math.max(0, t.bpm - 8) * 0.07);
      raise('blk', 0.8 + Math.max(0, t.bpm - 8) * 0.1);
    }
    return exp;
  }

  // ---------- Per-game correction ----------
  // After a game's boxes are built, a scripted player who has fallen behind
  // the pace of his floors gets the shortfall moved over from teammates:
  // his teammates' totals shrink by what his grows, so the team's line is
  // exactly what it was. It only acts when he is behind; a season that is
  // on pace is left alone.
  const STAT_KEY = { ppg: 'pts', rpg: 'reb', apg: 'ast', stl: 'stl', blk: 'blk' };
  const TOT_KEY = { pts: 'totPts', reb: 'totReb', ast: 'totAst', stl: 'totStl', blk: 'totBlk' };

  function donors(own, self, key) {
    return own.filter(r => r !== self && r.box && r.box[key] > 0);
  }
  // The teammate with the most of a stat, not counting anyone scripted for
  // that same stat (his own floor would be undone).
  function richest(own, self, key, test) {
    let best = null;
    own.forEach(r => {
      if (r === self || !r.box || !(r.box.min > 0)) return;
      if (test && !test(r.box)) return;
      const sc = entryFor(r.player);
      let v = r.box[key];
      if (sc && sc.floors && (sc.floors[Object.keys(STAT_KEY).find(k => STAT_KEY[k] === key)] != null)) v -= 100;
      if (!best || v > best.v) best = { r, v };
    });
    return best ? best.r : null;
  }

  function movePoints(own, self, pts, rand) {
    let left = pts, moved = 0;
    const me = self.box;
    for (let guard = 0; left > 0 && guard < 60; guard++) {
      const threeOk = left >= 3 && rand() < 0.22;
      const from = richest(own, self, 'pts', b => (threeOk ? b.threePm > 0 : b.twoPm > 0) || b.ftm > 0);
      if (!from) break;
      const b = from.box;
      if (threeOk && b.threePm > 0) {
        b.threePm--; b.threePa--; b.fgm--; b.fga--; b.pts -= 3;
        me.threePm++; me.threePa++; me.fgm++; me.fga++; me.pts += 3;
        left -= 3; moved += 3;
      } else if (left >= 2 && b.twoPm > 0) {
        b.twoPm--; b.twoPa--; b.fgm--; b.fga--; b.pts -= 2;
        me.twoPm++; me.twoPa++; me.fgm++; me.fga++; me.pts += 2;
        // Most baskets come with a miss or two on the way, so his shooting
        // does not leap just because the points were moved to him.
        if (rand() < 0.65) {
          const miss = b.twoPa - b.twoPm;
          if (miss > 0) { b.twoPa--; b.fga--; me.twoPa++; me.fga++; }
        }
        left -= 2; moved += 2;
      } else if (b.ftm > 0) {
        b.ftm--; b.fta--; b.pts--;
        me.ftm++; me.fta++; me.pts++;
        left -= 1; moved += 1;
      } else if (b.twoPm > 0) {
        b.twoPm--; b.twoPa--; b.fgm--; b.fga--; b.pts -= 2;
        me.twoPm++; me.twoPa++; me.fgm++; me.fga++; me.pts += 2;
        left -= 2; moved += 2;
      } else break;
    }
    return moved;
  }

  function moveCount(own, opp, self, key, n, rand) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const from = richest(own, self, key);
      if (from && from.box[key] > 0) {
        from.box[key]--;
        self.box[key]++;
        if (key === 'reb') {
          // Take the same kind of rebound from the donor that he gets.
          const off = rand() < 0.28;
          const dk = off ? (from.box.oreb > 0 ? 'oreb' : 'dreb') : (from.box.dreb > 0 ? 'dreb' : 'oreb');
          from.box[dk]--;
          self.box[dk]++;
        }
        moved++;
      } else if (key === 'stl' || key === 'blk') {
        // Nobody on his team had one to give: it comes out of the other
        // side's night (a steal is their turnover; a block, their miss).
        const o = (opp || []).filter(r => r.box && r.box.min > 0);
        if (key === 'stl' && o.length) { o.sort((a, b) => b.box.tov - a.box.tov)[0].box.tov++; self.box.stl++; moved++; }
        else if (key === 'blk' && o.length) {
          const sh = o.filter(r => r.box.twoPa - r.box.twoPm > 0).sort((a, b) => (b.box.twoPa - b.box.twoPm) - (a.box.twoPa - a.box.twoPm))[0];
          if (sh) { self.box.blk++; moved++; }
        }
      } else break;
    }
    return moved;
  }

  // gamesLeft: games remaining for his team including this one.
  function correctBoxes(own, opp, gamesLeft, rand) {
    rand = rand || Math.random;
    own.forEach(self => {
      const e = entryFor(self.player);
      if (!e || !e.floors || !self.box || !(self.box.min > 0)) return;
      const t = targets(self.player);
      const st = self.player.stats || {};
      const gp = st.gp || 0;
      const left = Math.max(2, gamesLeft || 2);
      const N = gp + left;
      const exp = self.player.expectedStats || {};
      // A game cut short by an injury is asked for proportionally less.
      const expMpg = parseFloat(exp.mpg) || 0;
      const share = expMpg > 0 ? Math.max(0.35, Math.min(1, self.box.min / expMpg)) : 1;
      const totalOf = key => (st[TOT_KEY[key]] || 0);

      Object.keys(STAT_KEY).forEach(k => {
        if (t[k] == null) return;
        const key = STAT_KEY[k];
        const goal = t[k];
        const r = (goal * N - totalOf(key)) / left;
        if (r <= goal * 1.02) return;
        const cap = Math.max((parseFloat(exp[k]) || 0) * 2.4, goal * 1.9);
        const want = Math.min(r, cap) * share;
        const need = Math.round(want - self.box[key]);
        if (need <= 0) return;
        if (key === 'pts') movePoints(own, self, need, rand);
        else moveCount(own, opp, self, key, need, rand);
      });

      if (t.stocks != null) {
        const tot = (st.totStl || 0) + (st.totBlk || 0);
        const r = (t.stocks * N - tot) / left;
        if (r > t.stocks * 1.02) {
          const cap = Math.max(((parseFloat(exp.stl) || 0) + (parseFloat(exp.blk) || 0)) * 2.4, t.stocks * 1.9);
          const want = Math.min(r, cap) * share;
          let need = Math.round(want - (self.box.stl + self.box.blk));
          if (need > 0) {
            // Split the way his game does: by how much of each he usually gets.
            const es = parseFloat(exp.stl) || 1, eb = parseFloat(exp.blk) || 1;
            const nb = Math.round(need * eb / (es + eb)), ns = need - nb;
            if (ns > 0) moveCount(own, opp, self, 'stl', ns, rand);
            if (nb > 0) moveCount(own, opp, self, 'blk', nb, rand);
          }
        }
      }

      // A triple-double threat who is a rebound or an assist short on a
      // big night gets it.
      if (e.triple) {
        const b = self.box;
        const cats = [['pts', 10], ['reb', 10], ['ast', 10]];
        const hit = cats.filter(([k]) => b[k] >= 10).length;
        if (hit === 2) {
          const short = cats.find(([k]) => b[k] < 10);
          if (short) {
            const [k] = short, gap = 10 - b[k];
            if (gap <= 2 && rand() < 0.8) {
              if (k === 'pts') movePoints(own, self, gap, rand); else moveCount(own, opp, self, k, gap, rand);
            }
          }
        }
      }
    });
  }

  // ---------- Box Plus/Minus ----------
  // A season of this scripted player's production already earns a high BPM;
  // this is the guarantee behind it. Returns the adjusted triple, or null.
  function bpmLift(p, bpm, obpm, dbpm, games, year) {
    const e = entryFor(p);
    if (!e || !e.floors || e.floors.bpm == null) return null;
    if (games < 4) return null;
    // Where the floor sits differs from one season to the next (a point
    // or so above the minimum), so the same number does not show up every year.
    const PC = typeof PlayerCore !== 'undefined' ? PlayerCore : root.PlayerCore;
    const extra = PC ? PC.hash01(p.name + '|' + year, 'bpmfloor') * 1.4 : 0;
    const goal = targetOf('bpm', e.floors.bpm) + extra;
    if (bpm >= goal) return null;
    const short = goal - bpm;
    return { bpm: goal, obpm: obpm + short * 0.65, dbpm: dbpm + short * 0.35 };
  }

  // ---------- Draft ----------
  // The slot the table scripts for a player, in the same shape the roster
  // sheet's Draft column parses to. `ctx.year` is the upcoming draft.
  function draftFor(p, ctx) {
    const e = entryFor(p);
    if (!e || !e.draft) return null;
    const d = e.draft;
    const mk = year => (d.top ? { year, range: d.top } : { year, overall: d.pick, round: d.pick <= 30 ? 1 : 2, pick: d.pick <= 30 ? d.pick : d.pick - 30 });
    if (d.year) return mk(d.year);
    if (d.after === 'first') {
      if (p.scriptedDraft && p.scriptedDraft.table) return p.scriptedDraft;
      const played = (p.stats && p.stats.gp > 0) || (p.gameLog && p.gameLog.length > 0);
      if (!played || !ctx || !ctx.year) return null;
      return Object.assign(mk(ctx.year), { table: true });
    }
    return null;
  }

  const ScriptCore = {
    TABLE, CUSHION, NATURAL, entryFor, isScripted, starterPin, minutesFloor, targets, targetOf,
    applyIdentity, planGrowth, growthForWeek, liftExpectations, correctBoxes, movePoints, moveCount,
    bpmLift, draftFor, inchesOf, htOf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ScriptCore;
  else root.ScriptCore = ScriptCore;
})(typeof window !== 'undefined' ? window : globalThis);
