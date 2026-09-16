// ============================================================
// Shared NBA draft prospect evaluation.
//
// Used by BOTH the in-season big board on the NCAA RP page and the
// standalone Draft RP page. Keeping it in one place means a prospect
// can't be ranked one way in college and a different way at the draft.
// No DOM access here, so it's testable in Node.
// ============================================================

// Age is the single dominant factor in the modern NBA draft, far more so
// than college production. Calibrated against real results (2020-2026):
//
//   2025 lottery: 10 of 14 picks were freshmen. Khaman Maluach went #10
//   averaging 8.6 ppg on 16.1% usage; Carter Bryant went #14 on 6.5 ppg.
//   Meanwhile Johni Broome (18.6 pts, 10.8 reb, 14.3 BPM, senior) fell to
//   #35, Maxime Raynaud (20.2 pts, 10.6 reb) to #42, and Eric Dixon
//   (23.3 ppg) went undrafted entirely.
//
// A young player with modest production outranks an older one with far
// better numbers, because teams are drafting the projection rather than
// the season. The previous spread (FR +10 down to GR -1.5) was nowhere
// near steep enough to reproduce that.
const CLASS_YOUTH = { FR: 24, SO: 13, JR: 1, SR: -11, GR: -16 };
const POS_SIZE_TARGET = { PG: 75, SG: 78, SF: 80, PF: 82, C: 84,
  G: 76, F: 81, W: 79, 'F/C': 83, 'G/F': 79, CG: 76 };

// Accepts 6'7, 6-7, 6’7, or a plain inch count.
function parseHeightInches(ht) {
  if (!ht) return null;
  const m = String(ht).match(/(\d+)\s*['\u2019-]\s*(\d+)?/);
  if (m) return parseInt(m[1], 10) * 12 + parseInt(m[2] || '0', 10);
  const n = parseFloat(ht);
  return isNaN(n) ? null : n;
}

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// Scores a single prospect.
//   player      - a player record (needs stats, class, pos, ht, rating)
//   teamWinPct  - his team's win rate this season (0-1), 0.5 if unknown
// Returns the score plus its components, so the UI can explain a ranking
// rather than just asserting one.
// Strength of the competition a player faced. Scouts discount production
// against weaker opposition: a mid-major has to dominate to earn the same
// grade a high-major earns by being merely very good. Prestigious
// mid-majors sit between the two because they schedule and recruit up.
const POWER_SIX = new Set(['ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East', 'Pac-12']);
const STRONG_MID = new Set(['American', 'A-10', 'Mountain West', 'West Coast', 'Missouri Valley', 'Conference USA']);

function competitionFactor(conference) {
  if (POWER_SIX.has(conference)) return 1.0;
  if (STRONG_MID.has(conference)) return 0.80;
  return 0.62;
}

function scoreProspect(player, teamWinPct = 0.5) {
  const st = player.stats || {};
  const gp = st.gp || 0;

  // How much real evidence exists yet. Early on, pedigree and raw ability
  // carry the board; by March, production dominates.
  //
  // Minutes matter as much as games: per-40 rates are violently unstable
  // for a player who barely plays (one rebound in two minutes projects to
  // 20 per 40), and without this the board was topped by garbage-time
  // players with absurd extrapolated rates while genuine prospects with
  // real minutes were buried.
  const totalMin = num(st.mpg) * gp;
  const minutesReliability = Math.min(1, totalMin / 450);
  const evidence = Math.min(1, gp / 15) * minutesReliability;

  const youth = CLASS_YOUTH[player.class] !== undefined ? CLASS_YOUTH[player.class] : 3;

  const hIn = parseHeightInches(player.ht);
  const target = POS_SIZE_TARGET[player.pos] || 79;
  // Positional size: taller than typical for the position helps, undersized
  // hurts, with diminishing returns either way.
  const sizeEdge = hIn ? Math.max(-6, Math.min(8, (hIn - target) * 1.6)) : 0;

  const production = num(st.p40pts) * 0.55
                   + num(st.p40reb) * 0.45
                   + num(st.p40ast) * 0.70
                   + num(st.p40stl) * 1.1
                   + num(st.p40blk) * 1.0
                   - num(st.p40tov) * 0.9
                   + num(st.bpm) * 1.3;

  // Efficiency separates prospects more than volume does: Maluach shot
  // .736 TS on low usage and went top ten.
  const efficiency = (num(st.tsPct) - 0.53) * 65;
  const winning = (teamWinPct - 0.5) * 8;

  // Recruit pedigree: national (RSCI) ranking when the sheet supplies one,
  // otherwise incoming rating. Heavy before games, light once production
  // exists — a highly-ranked recruit who plays badly does slide.
  const rsci = num(player.rsci, 0) || null;
  const pedigree = rsci
    ? Math.max(0, 30 - Math.log2(rsci + 1) * 5)
    : (num(player.rating, 70) - 70) * 0.9;

  // Pedigree is a tiebreaker, not a verdict. A recruit ranked 20th who
  // produces will pass one ranked 7th who doesn't, so the pedigree term is
  // both smaller and decays harder as real evidence accumulates, while the
  // production term carries more weight.
  // Production is discounted by the level it was produced against, so a
  // high-major doesn't need gaudy numbers to rank highly and a mid-major
  // does. Ability, pedigree and physical tools are level-independent and
  // are not discounted.
  const level = competitionFactor(player.conference);
  const scaledProduction = (production + efficiency + winning) * level;

  // Production counts for less as a player gets older: a freshman's
  // numbers are evidence of upside, a senior's are close to his ceiling.
  const ageDiscount = player.class === 'FR' ? 1.0
    : player.class === 'SO' ? 0.88
    : player.class === 'JR' ? 0.72
    : 0.58;

  // Size is weighted more heavily than before — seven-footers with thin
  // statistical profiles are routinely lottery picks.
  const score = num(player.rating, 70) * 0.62
              + youth
              + sizeEdge * 1.6
              + pedigree * 0.55 * (1 - evidence * 0.85)
              + scaledProduction * evidence * ageDiscount * 1.45;

  return { score, gp, evidence, youth, sizeEdge, production, efficiency, winning, pedigree, level };
}

// Ranks a list of players. `winPctFor` maps a school name to that team's
// win percentage; pass a function so callers can source it however they
// like (live team objects in-season, archived history at draft time).
function buildBigBoard(players, winPctFor, limit = 60) {
  const getWinPct = typeof winPctFor === 'function' ? winPctFor : () => 0.5;
  return players
    .map(p => {
      const parts = scoreProspect(p, getWinPct(p.school));
      return { player: p, ...parts };
    })
    // A prospect needs either a real role this season or genuine ability.
    // Without a minutes floor the board fills up with deep-bench players
    // whose per-40 rates are extrapolation artefacts.
    .filter(x => {
      const st = x.player.stats || {};
      const totalMin = num(st.mpg) * (st.gp || 0);
      const hasRole = totalMin >= 250 || num(st.mpg) >= 14;
      return hasRole || num(x.player.rating, 0) >= 82;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// A short, human-readable read on what drives a prospect's stock. Derived
// from the same components as the score so it can't contradict the number.
function scoutingTags(entry) {
  const tags = [];
  const p = entry.player;
  const st = p.stats || {};
  if (entry.sizeEdge >= 4) tags.push('Elite positional size');
  else if (entry.sizeEdge <= -3) tags.push('Undersized for position');
  if (p.class === 'FR') tags.push('Young for the class');
  if (num(st.tsPct) >= 0.60) tags.push('Highly efficient scorer');
  else if (num(st.tsPct) > 0 && num(st.tsPct) < 0.48) tags.push('Efficiency concerns');
  if (num(st.p40ast) >= 6) tags.push('Advanced playmaker');
  if (num(st.p40blk) >= 2.5) tags.push('Rim protector');
  if (num(st.p40stl) >= 2.5) tags.push('Disruptive defender');
  if (num(st.threePPct) >= 0.38 && num(st.threePa) >= 3) tags.push('Floor spacer');
  if (num(st.p40reb) >= 11) tags.push('Elite rebounder');
  if (entry.pedigree >= 20 && entry.production < 8) tags.push('Pedigree over production');
  return tags.slice(0, 4);
}

// Generational prospects.
//
// Some players in the recruiting universe are simply known quantities —
// their college production may fluctuate, but their draft standing does
// not. Rather than trying to coax the statistical model into reproducing
// that every time, these are pinned directly: the model ranks everyone
// else, then these names are placed into their established range.
//
// Keyed by draft year, since the same name could recur across classes.
const PINNED_PROSPECTS = {
  2029: {
    'Alberto Rodriguez': [1, 3],
    'Tyson Pollard': [1, 5],
    'Olumide Afolabi': [1, 5],
    'Clark Wilkins': [1, 10],
    'Andre Washington': [1, 14],
    'Ray Kemp': [1, 14],
    'Troy Vaughn': [1, 14]
  },
  2030: {
    'Cameron Grant': [1, 1],
    'Erving Montgomery': [2, 4],
    'Patrick Greene': [2, 4],
    'Aaron Henderson': [2, 4],
    'Payton Gibson': [1, 14],
    'Colby Rider': [1, 14],
    'B.J. Gaines': [1, 14],
    'T.J. Gooden': [1, 20]
  },
  2031: {
    'Alex Knight': [1, 3],
    'Leo Newson': [1, 3],
    'Joshua Norton': [1, 3],
    'Christian Lyles': [1, 5],
    'Warren Jones': [1, 14],
    'Nicholas Boyd': [1, 14],
    'Dalen Maloney': [1, 14]
  },
  2032: {
    'Raymond Towns': [1, 5],
    'Rodney Hunt': [1, 5],
    'Desmond Newman': [1, 14]
  },
  2033: {
    'Armando Williams': [1, 3],
    'Myles Halperin': [1, 3],
    'Darius Atkinson': [1, 3]
  },
  2034: { 'Dante Fletcher': [1, 1] },
  2035: { 'Jared Moreno': [1, 1] }
};

// Moves pinned prospects into their established draft range, preserving
// the model's ordering for everyone else. A player pinned to [1,5] lands
// somewhere in the top five; [1,1] means first overall.
function applyPinnedProspects(board, draftYear, allPlayers, winPctFor) {
  const pins = PINNED_PROSPECTS[draftYear];
  if (!pins) return board;

  const pinned = [];
  const rest = [];
  board.forEach(entry => {
    const range = pins[entry.player.name];
    if (range) pinned.push({ entry, range });
    else rest.push(entry);
  });

  // A pinned prospect who missed the board entirely — because he barely
  // played, or the minutes filter excluded him — still has to appear. His
  // standing doesn't depend on this season's box score.
  const present = new Set(pinned.map(x => x.entry.player.name));
  if (allPlayers) {
    const getWinPct = typeof winPctFor === 'function' ? winPctFor : () => 0.5;
    Object.keys(pins).forEach(name => {
      if (present.has(name)) return;
      const p = allPlayers.find(x => x.name === name);
      if (!p) return;
      const parts = scoreProspect(p, getWinPct(p.school));
      pinned.push({ entry: { player: p, ...parts }, range: pins[name] });
    });
  }
  if (pinned.length === 0) return board;

  // Best-pedigree names first so [1,1] beats [1,3] for the top slot.
  pinned.sort((a, b) => (a.range[0] - b.range[0]) || (a.range[1] - b.range[1]));

  const out = rest.slice();
  const taken = new Set();
  pinned.forEach(({ entry, range }) => {
    const [lo, hi] = range;
    let slot = lo - 1;
    // First free slot inside the range; fall back to its floor.
    for (let i = lo - 1; i < hi; i++) {
      if (!taken.has(i)) { slot = i; break; }
    }
    taken.add(slot);
    out.splice(Math.min(slot, out.length), 0, entry);
  });
  return out;
}

const DraftCore = { parseHeightInches, scoreProspect, applyPinnedProspects, PINNED_PROSPECTS, competitionFactor, POWER_SIX, STRONG_MID, buildBigBoard, scoutingTags, CLASS_YOUTH, POS_SIZE_TARGET };

if (typeof module !== 'undefined' && module.exports) module.exports = DraftCore;
else if (typeof window !== 'undefined') window.DraftCore = DraftCore;
