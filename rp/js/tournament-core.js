// Reference to GameCore's simulateSingleGame. Deliberately NOT named
// `simulateSingleGame` here: separate <script> tags in the same HTML
// document share one top-level let/const scope, and game-core.js already
// declares a top-level function with that exact name — redeclaring it
// here would throw a SyntaxError as soon as this script loads.
const _GameCore = (typeof module !== 'undefined' && module.exports)
  ? require('./game-core')
  : window.GameCore;

// Standard seed-pairing order for a single-elim bracket of size 2^k
// (1v16, 8v9, 5v12, 4v13, ... style ordering) so top seeds meet as
// late as possible. Returns an array of seed numbers (1-indexed) in
// bracket-slot order.
function standardSeedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    const next = [];
    order.forEach(s => { next.push(s); next.push(n - s); });
    order = next;
  }
  return order;
}

function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Largest power of 2 <= n. This is the real bracket size: play-in games
// trim a field DOWN to a clean power of 2 (68 teams -> 4 play-in games
// -> 64-team bracket), not up.
function prevPowerOf2(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

// Builds and simulates a single-elimination bracket for a list of
// seeded teams (index 0 = best seed). If the field isn't a power of 2,
// the lowest seeds play play-in ("First Four"-style) games first.
// Returns { playIn: [...], rounds: [...], champion }.
function simulateBracket(seededTeams, opts = {}) {
  const teams = [...seededTeams];

  // We want a clean bracket of `bracketSize` slots (a power of 2). If
  // teams.length isn't already one, the lowest-seeded teams play their
  // way in (play-in / "First Four"-style) for the remaining spots.
  const bracketSize = prevPowerOf2(teams.length);
  const numPlayInGames = teams.length - bracketSize;
  const playInTeamsCount = numPlayInGames * 2;
  const playIn = [];
  let advancing = teams.slice(0, teams.length - playInTeamsCount); // top seeds get byes straight into the bracket

  if (playInTeamsCount > 0) {
    const playInPool = teams.slice(teams.length - playInTeamsCount);
    // pair worst-vs-next-worst for play-in games (lowest seeds fight for the last spots)
    for (let i = 0; i < playInPool.length / 2; i++) {
      const a = playInPool[i];
      const b = playInPool[playInPool.length - 1 - i];
      const result = _GameCore.simulateSingleGame(a, b, opts);
      const winner = result.homeScore > result.awayScore ? a : b;
      playIn.push({ teamA: a, teamB: b, result, winner });
      advancing.push(winner);
    }
  }

  // Re-sort `advancing` back into seed order for the main bracket
  advancing.sort((x, y) => seededTeams.indexOf(x) - seededTeams.indexOf(y));

  const seedOrder = standardSeedOrder(advancing.length); // advancing.length === bracketSize here
  let bracketTeams = seedOrder.map(seedNum => advancing[seedNum - 1]);

  const rounds = [];
  let current = bracketTeams;
  while (current.length > 1) {
    const round = [];
    const winners = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i], b = current[i + 1];
      const result = _GameCore.simulateSingleGame(a, b, opts);
      const winner = result.homeScore > result.awayScore ? a : b;
      round.push({ teamA: a, teamB: b, result, winner });
      winners.push(winner);
    }
    rounds.push(round);
    current = winners;
  }

  return { playIn, rounds, champion: current[0] || advancing[0] };
}

const TournamentCore = { standardSeedOrder, nextPowerOf2, simulateBracket };

if (typeof module !== 'undefined' && module.exports) module.exports = TournamentCore;
else if (typeof window !== 'undefined') window.TournamentCore = TournamentCore;
