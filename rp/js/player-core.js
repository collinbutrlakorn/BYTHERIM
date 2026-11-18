// Player makeup that the other modules share: how a body fills out, who is a
// pure three-point shooter, and how consistent a player is.
//
// Pure functions (no DOM, no engine state), loaded by the NCAA RP, the Draft
// RP and the Recruiting page. Anything that must be the same every time a
// player's numbers are rebuilt (consistency, a shooting role) is drawn from a
// hash of his name, never from Math.random, so it follows him from season to
// season and from page to page without being stored anywhere first.
(function (root) {
  'use strict';

  // ---------- Deterministic draws ----------
  function hash01(key, salt) {
    const str = String(key) + '|' + salt;
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // A bell-ish draw in [-1, 1] (two uniforms), the same every time for a key.
  function tri(key, salt) { return hash01(key, salt + 'a') + hash01(key, salt + 'b') - 1; }
  const keyOf = p => String((p && (p.name || p.id)) || '');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const upper = pos => String(pos || 'SF').toUpperCase();

  // guard / wing / forward / big, for how a body and a game are expected to look.
  function groupOf(pos) {
    const p = upper(pos);
    if (p === 'C' || p === 'F/C') return 'big';
    if (p === 'PF' || p === 'F') return 'forward';
    if (p === 'SF' || p === 'W' || p === 'G/F') return 'wing';
    return 'guard';
  }

  // ---------- Body ----------
  // The heaviest a player at each spot normally gets; gains taper off as he nears it.
  const WT_CAP = { PG: 215, CG: 220, G: 222, SG: 235, W: 245, 'G/F': 248, SF: 255, F: 265, PF: 275, 'F/C': 285, C: 300 };
  // Forwards and bigs play a more physical game and fill out more.
  const GROUP_GAIN = { guard: 0.6, wing: 0.9, forward: 1.3, big: 1.4 };
  // Average pounds added by the time of the NEXT season, by the class he moves into.
  const YEARLY_GAIN = { FR: 1.5, SO: 3.5, JR: 2.2, SR: 1.3, GR: 0.6 };
  // Extra pounds the youngest players keep adding, by the same class.
  const YOUNG_YEARLY = { FR: 1.5, SO: 3.0, JR: 1.5, SR: 0.5, GR: 0 };

  function weightNum(p) {
    const raw = p ? (p.wt != null ? p.wt : p.weight) : null;
    const n = parseFloat(String(raw == null ? '' : raw));
    return isFinite(n) && n > 0 ? n : null;
  }
  // Writes a weight back in whatever form it was in ("212" or "212 lbs").
  function fmtWeight(prev, n) {
    return /lb/i.test(String(prev == null ? '' : prev)) ? `${n} lbs` : String(n);
  }

  // How young a player is for his recruiting class: 0 for the oldest (born in
  // September) to ~1 for the youngest (born in August). A birthdate is the
  // only real evidence; without one it's a stable draw.
  function youthOf(p) {
    const m = String((p && p.dob) || '').match(/^(\d{1,2})\/(\d{1,2})\/\d{4}/) || String((p && p.dob) || '').match(/^\d{4}-(\d{2})-(\d{2})/);
    if (m) {
      const mo = parseInt(m[1], 10), d = parseInt(m[2], 10);
      if (mo >= 1 && mo <= 12) return clamp((((mo - 9 + 12) % 12) + (d - 1) / 31) / 12, 0, 1);
    }
    return hash01(keyOf(p), 'youth');
  }

  // A teenager who is young for his class hasn't filled out yet. Pounds
  // taken off a generated recruit's high-school weight, 0-9.
  function immatureBodyDeficit(dob, key) {
    const y = youthOf({ dob, name: key });
    return Math.max(0, Math.round(Math.pow(y, 1.5) * 8 + (hash01(key, 'frame') - 0.5) * 2));
  }

  // Slows a gain as a player nears the top of his position's range.
  function roomFactor(w, pos) {
    const cap = WT_CAP[upper(pos)] || 250;
    return clamp((cap - w) / 20, 0, 1);
  }

  // From high-school graduation to the first practice: a summer in a college
  // strength program. The youngest gain the most; bigs fill out more than guards.
  // Returns the pounds added and sets p.wt.
  function enrollGain(p) {
    const w = weightNum(p);
    if (!w) return 0;
    const youth = youthOf(p);
    const mean = (2.0 + youth * 7.0) * ({ guard: 0.85, wing: 1.0, forward: 1.15, big: 1.25 }[groupOf(p.pos)]) * roomFactor(w, p.pos);
    const gain = Math.max(0, Math.round(mean + tri(keyOf(p), 'enroll') * 3.5));
    if (gain) p.wt = fmtWeight(p.wt != null ? p.wt : p.weight, w + gain);
    return gain;
  }

  // One more year in a college program. Call it AFTER the class has moved up
  // (a new sophomore is a player who just finished his freshman year).
  // Returns the pounds added (rarely negative: a guard cutting down).
  function growBody(p, rng) {
    const w = weightNum(p);
    if (!w) return 0;
    const r = rng || Math.random;
    const cls = p.class || 'SO';
    let mean = (YEARLY_GAIN[cls] != null ? YEARLY_GAIN[cls] : 1) * GROUP_GAIN[groupOf(p.pos)];
    mean += youthOf(p) * (YOUNG_YEARLY[cls] || 0) * (groupOf(p.pos) === 'guard' ? 0.8 : 1.1);
    mean *= roomFactor(w, p.pos);
    let g = mean + (r() + r() - 1) * 4;
    if (g < 0) g = r() < 0.4 ? Math.round(g / 2) : 0;
    const gain = Math.round(g);
    if (gain) p.wt = fmtWeight(p.wt != null ? p.wt : p.weight, Math.max(150, w + gain));
    return gain;
  }

  // ---------- Shooting role ----------
  // Some players are on the floor to make threes and almost nothing else:
  // off-ball guards and wings (the odd forward) whose shots are nearly all
  // from deep. Far more common where talent is thin. And some freshmen
  // launch threes they haven't learned to hit yet.
  const SPOT_RATE = { PG: 0.012, CG: 0.03, G: 0.04, SG: 0.075, W: 0.065, 'G/F': 0.07, SF: 0.065, F: 0.04, PF: 0.04, 'F/C': 0.008, C: 0 };
  const VOLUME_RATE = { PG: 0.08, CG: 0.12, G: 0.12, SG: 0.16, W: 0.14, 'G/F': 0.14, SF: 0.13, F: 0.08, PF: 0.06, 'F/C': 0.02, C: 0.005 };
  const TIER_MULT = { power: 0.25, mid: 0.8, low: 1.4 };

  function tierOf(factor) { return factor >= 1 ? 'power' : factor >= 0.8 ? 'mid' : 'low'; }

  // 'spot' (a three-point specialist), 'volume' (a freshman who shoots more
  // threes than he makes) or 'none'. Decided once, the first time a player is
  // looked at, and kept on him (p.shotRole) so it isn't re-rolled when he
  // changes schools.
  function shotRoleOf(p, tier) {
    if (!p) return 'none';
    if (p.shotRole === 'spot' || p.shotRole === 'volume' || p.shotRole === 'none') return p.shotRole;
    const pos = upper(p.pos);
    const key = keyOf(p);
    const rating = parseFloat(p.rating) || 72;
    const talent = rating >= 86 ? 0.35 : rating >= 80 ? 0.7 : rating < 68 ? 1.15 : 1;
    const spot = (SPOT_RATE[pos] != null ? SPOT_RATE[pos] : 0.05) * (TIER_MULT[tier] || 1) * talent;
    let role = 'none';
    if (hash01(key, 'role') < spot) role = 'spot';
    else if (p.class === 'FR') {
      const elite = (parseFloat(p.rsci) || 999) <= 15 ? 0.5 : 1;
      if (hash01(key, 'role2') < (VOLUME_RATE[pos] != null ? VOLUME_RATE[pos] : 0.1) * elite) role = 'volume';
    }
    p.shotRole = role;
    return role;
  }

  // What a role does to a projected line. `par` is the target three-point
  // attempt rate (specialists override the usual positional ceiling).
  function shotRoleEffects(p, role) {
    const key = keyOf(p);
    if (role === 'spot') {
      return {
        par: 0.70 + hash01(key, 'par') * 0.20,
        pct: 0.015 + hash01(key, 'spotpct') * 0.02,
        ppg: 0.90, apg: 0.55, rpg: 0.82, tov: 0.80, fta: 0.45, stl: 0.92, blk: 0.6
      };
    }
    if (role === 'volume') {
      const s = p.class === 'FR' ? 1 : p.class === 'SO' ? 0.5 : 0;
      if (!s) return null;
      return { parAdd: (0.10 + hash01(key, 'vpar') * 0.06) * s, pct: -(0.03 + hash01(key, 'vpct') * 0.025) * s };
    }
    return null;
  }

  // ---------- Consistency ----------
  // 0-100. A consistent player gives you the same thing every night and every
  // year; an inconsistent one has big nights and quiet ones, breakout seasons
  // and slumps. It's a trait he has (a hash of his name), moved a little by
  // how long he's been around, how good he is and what scouts say about him.
  const CLASS_CONS = { FR: -6, SO: -2, JR: 2, SR: 5, GR: 6 };
  const baseCache = new Map();
  function baseConsistency(key) {
    let b = baseCache.get(key);
    if (b === undefined) {
      b = clamp(50 + tri(key, 'cons') * 48, 2, 98);
      if (baseCache.size > 20000) baseCache.clear();
      baseCache.set(key, b);
    }
    return b;
  }
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  function consistencyOf(p) {
    if (!p) return 50;
    let c = baseConsistency(keyOf(p));
    c += CLASS_CONS[p.class] || 0;
    c += clamp(((parseFloat(p.rating) || 75) - 75) * 0.25, -6, 6);
    const tr = p.traits || {};
    (tr.weaknesses || []).forEach(l => {
      const k = norm(l);
      if (k === 'streakyshooter') c -= 10;
      else if (k === 'iq') c -= 7;
    });
    (tr.strengths || []).forEach(l => { if (norm(l) === 'iq') c += 7; });
    return Math.round(clamp(c, 1, 99));
  }
  function consistencyLabel(c) {
    return c >= 80 ? 'Rock solid' : c >= 62 ? 'Reliable' : c >= 38 ? 'Average' : c >= 20 ? 'Streaky' : 'Boom-or-bust';
  }
  // A reliable player is simply worth more on the floor (rating points on the
  // team's number) and to a scout (points on the big board, firmer as games
  // pile up: a month of tape says less about consistency than a season).
  function consistencyImpact(c) { return (c - 50) / 50 * 0.9; }
  function consistencyDraft(c, evidence) {
    return (c - 50) * 0.10 * (0.4 + 0.6 * clamp(evidence == null ? 1 : evidence, 0, 1));
  }

  // How wide a player's single games swing. `w` is the half-width of the
  // uniform multiplier on each counting stat (the old fixed value was 0.5);
  // `night` is how much a whole night lifts or sinks all of them together (a
  // big night is big everywhere), and `form` the swing in his shooting
  // percentages that night. The last two are amplitudes of a [-1, 1] draw.
  function gameSpread(cons) {
    const c = clamp(cons == null ? 50 : cons, 0, 100);
    const w = clamp(0.92 - 0.0068 * c, 0.22, 0.95);
    const nightSd = clamp(0.30 - 0.0027 * c, 0.03, 0.30);
    const formSd = clamp(0.10 - 0.00085 * c, 0.015, 0.10);
    return { w, night: nightSd / 0.408, form: formSd / 0.408 };
  }

  // A season's luck and form, the same every time that player-season is
  // rebuilt: shooting percentages drift, as does how much of the offense he
  // carries. Swings are larger for the inconsistent.
  function seasonForm(p, year, cons) {
    const k = keyOf(p) + '|' + year;
    const inc = (100 - clamp(cons == null ? 50 : cons, 0, 100)) / 100;
    return {
      p3: tri(k, 's3') * (0.025 + 0.050 * inc),
      p2: tri(k, 's2') * (0.012 + 0.025 * inc),
      ft: tri(k, 'sf') * (0.015 + 0.030 * inc),
      use: 1 + tri(k, 'su') * (0.05 + 0.20 * inc),
      flow: 1 + tri(k, 'sr') * (0.03 + 0.10 * inc)
    };
  }

  // How much a year's development swings: 0.6 for the steadiest to 1.4 for
  // the most erratic, and the odds of a leap or a stall rise with it.
  function developmentSwing(cons) {
    const inc = (100 - clamp(cons == null ? 50 : cons, 0, 100)) / 100;
    return { noise: 0.6 + 0.8 * inc, jump: 0.5 + inc };
  }

  const api = {
    hash01, tri, groupOf, WT_CAP, weightNum, youthOf, immatureBodyDeficit, enrollGain, growBody,
    SPOT_RATE, VOLUME_RATE, TIER_MULT, tierOf, shotRoleOf, shotRoleEffects,
    consistencyOf, consistencyLabel, consistencyImpact, consistencyDraft, gameSpread, seasonForm, developmentSwing
  };
  root.PlayerCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
