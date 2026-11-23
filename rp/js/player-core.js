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
    if (g < 0) g = 0;
    // Now and then a guard or wing who has been around a while cuts down
    // to get quicker.
    const lean = (groupOf(p.pos) === 'guard' || groupOf(p.pos) === 'wing') && (cls === 'JR' || cls === 'SR' || cls === 'GR');
    if (lean && r() < 0.05) g = -(1 + r() * 3);
    const gain = Math.round(g);
    if (gain) p.wt = fmtWeight(p.wt != null ? p.wt : p.weight, Math.max(150, w + gain));
    return gain;
  }

  // ---------- Shooting role ----------
  // Some players are on the floor to make threes and almost nothing else:
  // off-ball guards and wings (the odd forward) whose shots are nearly all
  // from deep. Far more common where talent is thin. And some freshmen
  // launch threes they haven't learned to hit yet.
  const SPOT_RATE = { PG: 0, CG: 0, G: 0, SG: 0.075, W: 0.065, 'G/F': 0.07, SF: 0.065, F: 0.04, PF: 0.04, 'F/C': 0.008, C: 0 };
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
        ppg: 0.90, apg: 0.70, rpg: 0.85, tov: 0.90, fta: 0.45, stl: 0.94, blk: 0.7
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

  // ---------- Shot zones ----------
  // Where a player's two-point shots come from: at the rim (dunks are a
  // part of those) or away from it (floaters, post hooks, pull-ups). A box
  // score only knows twos and threes, so each game's twos are split by the
  // player's own tendencies, which stay with him (a hash of his name, like
  // his consistency).
  //
  // What a player makes at the rim barely moves from one player to the next
  // at a position: a guard is around 60% there and 70% is rare for anyone
  // but a big. What separates a good two-point shooter is mostly WHERE he
  // takes them, so his expected 2P% (expectedStats.twoPPct) sets his share
  // of twos at the rim, and only nudges his percentages.
  //   rim    share of his two-point attempts taken at the rim
  //   dunk   share of his rim attempts that are dunks
  //   rimPct / midPct  what he makes from each spot, before the night's luck
  const GROUP_2P = { guard: 0.475, wing: 0.53, forward: 0.55, big: 0.595 };
  const RIM_PCT = { guard: 0.615, wing: 0.64, forward: 0.675, big: 0.705 };
  const RIM_CAP = { guard: 0.635, wing: 0.65, forward: 0.72, big: 0.79 };
  const MID_PCT = 0.39;
  const DUNK_BASE = { guard: 0.05, wing: 0.13, forward: 0.22, big: 0.33 };
  const ARCH_RIM = { slasher: 0.11, rollBig: 0.12, postHub: -0.10, shooter: -0.07, primaryScorer: -0.03, playmaker: -0.02, defender: 0.03, connector: 0 };
  const ARCH_DUNK = { slasher: 0.05, rollBig: 0.12, postHub: -0.07, shooter: -0.03, defender: 0.02 };
  function heightIn(ht) {
    const s = String(ht == null ? '' : ht);
    const m = s.match(/(\d)\s*['’\-]\s*(\d{1,2}(?:\.\d+)?)?/);
    if (m) return parseInt(m[1], 10) * 12 + parseFloat(m[2] || '0');
    const n = parseFloat(s);
    return isFinite(n) && n > 60 && n < 96 ? n : null;
  }
  function shotProfile(p) {
    const g = groupOf(p && p.pos);
    const k = keyOf(p);
    const arch = (p && p.playstyle && p.playstyle.archetype) || '';
    const athN = parseFloat(p && p.athleticism);
    const ath = isFinite(athN) ? clamp((athN - 75) / 25, -1, 1) : 0;
    const h = heightIn(p && p.ht);
    const tall = h ? clamp((h - ({ guard: 75, wing: 78.5, forward: 80.5, big: 82.5 }[g])) / 3, -1.5, 1.5) : 0;
    const e2 = parseFloat(p && p.expectedStats && p.expectedStats.twoPPct);
    const P = isFinite(e2) && e2 > 0.2 && e2 < 0.9 ? e2 : GROUP_2P[g];
    const dev = P - GROUP_2P[g];
    const rimPct = clamp(RIM_PCT[g] + dev * 0.1 + ath * 0.012 + tri(k, 'zp') * 0.012, 0.48, RIM_CAP[g]);
    let midPct = clamp(MID_PCT + dev * 0.3 + tri(k, 'zm') * 0.025, 0.27, 0.48);
    // The share of twos at the rim that makes his 2P% add up, leaned by how
    // he plays; then the non-rim percentage settles what's left.
    const rim = clamp((P - midPct) / Math.max(0.05, rimPct - midPct) + (ARCH_RIM[arch] || 0) * 0.5 + tri(k, 'zr') * 0.05, 0.15, 0.95);
    midPct = clamp((P - rim * rimPct) / Math.max(0.05, 1 - rim), 0.27, 0.46);
    const dunk = clamp(DUNK_BASE[g] + (ARCH_DUNK[arch] || 0) + ath * 0.09 + tall * 0.04 + (rim - 0.55) * 0.15 + tri(k, 'zd') * 0.05, 0, 0.7);
    return { rim, dunk, rimPct, midPct };
  }
  // Splits one game's made and attempted twos into rim (with dunks) and
  // non-rim twos. Totals always add back up to the box score. Each make
  // and each miss is placed by how likely a shot from each spot was to go
  // in, so a player's rim and non-rim percentages come out where his
  // profile puts them, not pulled toward his overall 2P%.
  const DUNK_PCT = 0.92;
  function splitTwos(p, twoPm, twoPa, rng) {
    const r = rng || Math.random;
    const m = Math.max(0, Math.round(twoPm || 0)), a = Math.max(m, Math.round(twoPa || 0));
    const out = { rimM: 0, rimA: 0, dunkM: 0, dunkA: 0 };
    if (!a) return out;
    const pr = shotProfile(p);
    const made = pr.rim * pr.rimPct, missed = pr.rim * (1 - pr.rimPct);
    const qMade = made / (made + (1 - pr.rim) * pr.midPct);
    const qMiss = missed / (missed + (1 - pr.rim) * (1 - pr.midPct));
    // Of rim makes and rim misses, the dunks.
    const dMade = clamp(pr.dunk * DUNK_PCT / pr.rimPct, 0, 1);
    const dMiss = clamp(pr.dunk * (1 - DUNK_PCT) / (1 - pr.rimPct), 0, 1);
    for (let i = 0; i < m; i++) if (r() < qMade) { out.rimM++; if (r() < dMade) out.dunkM++; }
    let rimMiss = 0, dunkMiss = 0;
    for (let i = 0; i < a - m; i++) if (r() < qMiss) { rimMiss++; if (r() < dMiss) dunkMiss++; }
    out.rimA = out.rimM + rimMiss;
    out.dunkA = out.dunkM + dunkMiss;
    return out;
  }

  // ---------- Birthdays ----------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // A college class's age in a season's fall: a freshman is 18 (born from
  // September 19 years before through the next August).
  const CLASS_AGE = { FR: 0, SO: 1, JR: 2, SR: 3, GR: 4 };
  function parseDob(dob) {
    const s = String(dob == null ? '' : dob).trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return { y: +m[3], mo: +m[1], d: +m[2] };
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
    return null;
  }
  // His birthday: the sheet's when there is one; otherwise one that fits his
  // class in `seasonYear` (the fall the season starts), on the same day of
  // the year his body's growth already assumes (youthOf), with the odd
  // player a year older (a reclass or a gap year). `p.born` keeps an
  // invented one once it has been made, so it never moves.
  function birthdayOf(p, seasonYear) {
    const real = parseDob(p && p.dob);
    if (real && real.mo >= 1 && real.mo <= 12) return { ...real, invented: false };
    const kept = parseDob(p && p.born);
    if (kept) return { ...kept, invented: true };
    if (!seasonYear) return null;
    const cls = String((p && (p.draftClass || p.class)) || 'SO').toUpperCase();
    const off = CLASS_AGE[cls] != null ? CLASS_AGE[cls] : 1;
    const y = youthOf(p);
    const months = Math.min(11.97, y * 12);
    const mo = ((8 + Math.floor(months)) % 12) + 1;     // 0 -> September
    const d = 1 + Math.min(27, Math.floor((months % 1) * 28));
    const older = hash01(keyOf(p), 'older') < 0.12 ? 1 : 0;
    const year = seasonYear - 19 - off - older + (mo <= 8 ? 1 : 0);
    return { y: year, mo, d, invented: true };
  }
  function dobText(b) { return b ? `${b.mo}/${b.d}/${b.y}` : ''; }
  function birthdayLabel(b) { return b ? `${MONTHS[b.mo - 1]} ${b.d}, ${b.y}` : ''; }
  // Age on a date (a Date, or 'YYYY-MM-DD'), to a tenth of a year like a
  // draft guide prints it.
  function ageOn(b, when) {
    if (!b) return null;
    const t = when instanceof Date ? when : new Date(`${when}T12:00:00Z`);
    const born = Date.UTC(b.y, b.mo - 1, b.d, 12);
    return Math.floor(((t.getTime() - born) / (365.2425 * 86400000)) * 10) / 10;
  }

  const api = {
    shotProfile, splitTwos, parseDob, birthdayOf, dobText, birthdayLabel, ageOn,
    hash01, tri, groupOf, WT_CAP, weightNum, youthOf, immatureBodyDeficit, enrollGain, growBody,
    SPOT_RATE, VOLUME_RATE, TIER_MULT, tierOf, shotRoleOf, shotRoleEffects,
    consistencyOf, consistencyLabel, consistencyImpact, consistencyDraft, gameSpread, seasonForm, developmentSwing
  };
  root.PlayerCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
