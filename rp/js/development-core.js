// ============================================================
// Player development.
//
// Ratings used to be frozen: a sophomore returned exactly as good as he
// was as a freshman, so returning players were never interesting and the
// Potential column had nothing to do. This module moves a player's rating
// each offseason based on how much room he has left, how young he is, how
// much he actually played, and how well he produced.
//
// No DOM access, no engine state — pure functions, testable in Node.
// ============================================================

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// Growth is front-loaded: most improvement happens between a player's
// first and second seasons and tails off sharply after that.
const CLASS_GROWTH = { FR: 1.00, SO: 0.78, JR: 0.48, SR: 0.22, GR: 0.12 };

// A player's ceiling. An explicit Potential column wins; otherwise it's
// inferred from recruiting pedigree, since a highly-rated recruit is
// assumed to have more room than an unranked one.
function ceilingFor(player) {
  const rating = num(player.rating, 70);
  const explicit = num(player.potential, 0);
  if (explicit > 0) return Math.max(rating, Math.min(99, explicit));

  const rsci = num(player.rsci, 0);
  let headroom;
  if (rsci && rsci <= 10) headroom = 16;
  else if (rsci && rsci <= 30) headroom = 13;
  else if (rsci && rsci <= 100) headroom = 10;
  else if (rating >= 85) headroom = 7;
  else headroom = 8;
  return Math.min(99, rating + headroom);
}

// Returns the rating change for one offseason.
//
//   player   needs rating, class, stats, and optionally potential/rsci
//   opts.rng injectable randomness so tests can be deterministic
function developPlayer(player, opts = {}) {
  const rng = opts.rng || Math.random;
  const rating = num(player.rating, 70);
  const ceiling = ceilingFor(player);
  const st = player.stats || {};

  const gp = num(st.gp, 0);
  const mpg = num(st.mpg, 0);
  const totalMin = gp * mpg;

  // Room left to grow, as a share of the distance to the ceiling. A player
  // already at his ceiling barely moves.
  const room = Math.max(0, ceiling - rating);
  const roomFactor = Math.min(1, room / 12);

  const growth = CLASS_GROWTH[player.class] !== undefined ? CLASS_GROWTH[player.class] : 0.4;

  // Playing time is how development actually happens — a player who sat
  // all year improves far less than one who logged heavy minutes.
  const experience = Math.min(1, totalMin / 550);

  // Production relative to a replacement-level baseline. Outperforming
  // expectations accelerates growth; struggling slows it.
  const bpm = num(st.bpm, 0);
  const performance = Math.max(-1, Math.min(1.4, bpm / 6));

  // Base improvement before noise.
  let delta = roomFactor * growth * (0.55 + experience * 1.05) * (1 + performance * 0.45) * 1.95;

  // Older players who have stopped growing can decline slightly.
  if (player.class === 'SR' || player.class === 'GR') delta -= 0.9;
  // Everyone faces some downward pressure, so improvement is earned rather
  // than automatic — without this essentially nobody ever regressed.
  delta -= 0.55;

  // Genuine variance — breakouts and stagnation both have to be possible.
  const roll = rng();
  if (roll < 0.06) delta += 2.5 + rng() * 4.5;      // leap
  else if (roll < 0.20) delta -= 1.5 + rng() * 3;   // regression
  delta += (rng() + rng() - 1) * 2.1;

  let next = rating + delta;
  // A player can exceed his projected ceiling, but only modestly and rarely.
  next = Math.min(next, ceiling + (roll < 0.05 ? 3 : 0));
  next = Math.max(45, Math.min(99, next));

  return {
    newRating: Math.round(next),
    delta: Math.round(next) - rating,
    ceiling,
    experience,
    performance
  };
}

// Applies development to a whole roster, returning a summary of the
// biggest movers for display.
function developRoster(players, opts = {}) {
  const changes = [];
  players.forEach(p => {
    const before = num(p.rating, 70);
    const res = developPlayer(p, opts);
    p.rating = res.newRating;
    p.baseRating = res.newRating;   // keep the rotation's reference in step
    if (res.delta !== 0) {
      changes.push({
        id: p.id, name: p.name, school: p.school, class: p.class,
        before, after: res.newRating, delta: res.delta
      });
    }
  });
  changes.sort((a, b) => b.delta - a.delta);
  return changes;
}

const DevelopmentCore = { developPlayer, developRoster, ceilingFor, CLASS_GROWTH };

if (typeof module !== 'undefined' && module.exports) module.exports = DevelopmentCore;
else if (typeof window !== 'undefined') window.DevelopmentCore = DevelopmentCore;
