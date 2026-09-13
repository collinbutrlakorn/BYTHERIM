// ============================================================
// Shared NBA draft prospect evaluation.
//
// Used by BOTH the in-season big board on the NCAA RP page and the
// standalone Draft RP page. Keeping it in one place means a prospect
// can't be ranked one way in college and a different way at the draft.
// No DOM access here, so it's testable in Node.
// ============================================================

const CLASS_YOUTH = { FR: 10, SO: 6, JR: 2.5, SR: 0, GR: -1.5 };
const POS_SIZE_TARGET = { PG: 75, SG: 78, SF: 80, PF: 82, C: 84,
  G: 76, F: 81, W: 79, 'F/C': 83, 'G/F': 79 };

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
function scoreProspect(player, teamWinPct = 0.5) {
  const st = player.stats || {};
  const gp = st.gp || 0;

  // How much real evidence exists yet. Early on, pedigree and raw ability
  // carry the board; by March, production dominates.
  const evidence = Math.min(1, gp / 15);

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

  const efficiency = (num(st.tsPct) - 0.53) * 40;
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
  const score = num(player.rating, 70) * 0.62
              + youth
              + sizeEdge
              + pedigree * 0.55 * (1 - evidence * 0.85)
              + (production + efficiency + winning) * evidence * 1.75;

  return { score, gp, evidence, youth, sizeEdge, production, efficiency, winning, pedigree };
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
    .filter(x => num(x.player.rating, 0) >= 70 || x.gp > 0)
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

const DraftCore = { parseHeightInches, scoreProspect, buildBigBoard, scoutingTags, CLASS_YOUTH, POS_SIZE_TARGET };

if (typeof module !== 'undefined' && module.exports) module.exports = DraftCore;
else if (typeof window !== 'undefined') window.DraftCore = DraftCore;
