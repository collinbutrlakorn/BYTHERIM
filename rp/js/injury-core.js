// ============================================================
// Injuries.
//
// College players are young and the pace is slow, so injuries are rare
// and serious ones rarer still. A rotation player has about a 3% chance
// of an injury that costs him games in a season; most of those are a game
// or two (an ankle, back spasms); a broken bone is unusual and a torn ACL
// or Achilles is a once-or-twice-a-season story across the whole sport.
//
// An injury happens during a game: the player leaves partway through and
// his minutes go to the bench. He misses the games it takes to heal
// (counted in his team's games), or the rest of the season.
//
// Pure functions; the engine supplies players, games and randomness.
// ============================================================
(function (root) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // [name, weight, fewest games, most games, severity]. severity:
  // 1 minor, 2 moderate, 3 significant, 4 season-ending.
  const TYPES = [
    ['a sprained ankle', 30, 1, 2, 1],
    ['back spasms', 9, 1, 2, 1],
    ['a sprained wrist', 6, 1, 3, 1],
    ['a concussion', 8, 2, 4, 2],
    ['a hamstring strain', 10, 2, 5, 2],
    ['a knee sprain', 8, 2, 6, 2],
    ['a groin strain', 5, 2, 5, 2],
    ['a high ankle sprain', 7, 4, 8, 2],
    ['a broken finger', 4, 3, 6, 2],
    ['a broken hand', 2.5, 8, 12, 3],
    ['a stress fracture in his foot', 1.6, 10, 16, 3],
    ['a torn meniscus', 1.6, 8, 14, 3],
    ['a torn ACL', 0.9, 99, 99, 4],
    ['a torn Achilles', 0.35, 99, 99, 4],
    ['a broken foot that needs surgery', 0.35, 99, 99, 4]
  ];
  const TOTAL = TYPES.reduce((n, t) => n + t[1], 0);
  const SEVERITY = ['', 'Minor', 'Moderate', 'Significant', 'Season-ending'];

  // Chance per game of an injury that costs games, for a player logging
  // 30 minutes; scaled by his minutes.
  const PER_GAME = 0.0011;

  function chance(minutes) {
    const m = Number(minutes) || 0;
    if (m < 4) return 0;
    return PER_GAME * clamp(m / 30, 0.2, 1.3);
  }

  // Rolls one player's game. rng: a function returning [0, 1).
  // Returns null, or { type, severity, games, seasonEnding, leftAt }.
  function roll(minutes, rng) {
    if (rng() >= chance(minutes)) return null;
    let x = rng() * TOTAL, t = TYPES[0];
    for (const k of TYPES) { x -= k[1]; if (x <= 0) { t = k; break; } }
    const seasonEnding = t[4] === 4;
    const games = seasonEnding ? 999 : t[2] + Math.floor(rng() * (t[3] - t[2] + 1));
    // When in the game he went down: a fraction of his minutes.
    const leftAt = 0.15 + rng() * 0.7;
    return { type: t[0], severity: t[4], games, seasonEnding, leftAt: +leftAt.toFixed(2) };
  }

  // How long he's out, in words, for the injury report.
  function outlook(inj) {
    if (!inj) return '';
    if (inj.seasonEnding) return 'Out for the season';
    const g = Math.max(0, inj.gamesLeft != null ? inj.gamesLeft : inj.games);
    if (g <= 1) return 'Day-to-day';
    if (g <= 3) return `Out ${g} games`;
    const wk = Math.round(g / 2);
    return wk <= 2 ? 'Out 1-2 weeks' : wk <= 4 ? `Out ${wk - 1}-${wk + 1} weeks` : `Out about ${wk} weeks`;
  }

  const label = type => String(type || '').replace(/^(a|an) /, '').replace(/^./, c => c.toUpperCase());

  const api = { TYPES, SEVERITY, PER_GAME, chance, roll, outlook, label };
  root.InjuryCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
