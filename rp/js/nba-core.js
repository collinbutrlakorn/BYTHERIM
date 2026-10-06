// ============================================================
// NBA franchises, the draft lottery, and team needs.
//
// Everything the Draft RP needs to turn a prospect ranking into an actual
// mock draft: who picks, in what order, and what each team is looking for.
//
// No DOM access — testable in Node.
// ============================================================

// Logo filenames match the /nbalogos folder exactly, including the few
// that don't follow "City Nickname" (OKC Thunder, Portland Trailblazers).
const NBA_TEAMS = [
  { id: 'ATL', name: 'Atlanta Hawks', logo: 'Atlanta Hawks' },
  { id: 'BOS', name: 'Boston Celtics', logo: 'Boston Celtics' },
  { id: 'BKN', name: 'Brooklyn Nets', logo: 'Brooklyn Nets' },
  { id: 'CHA', name: 'Charlotte Hornets', logo: 'Charlotte Hornets' },
  { id: 'CHI', name: 'Chicago Bulls', logo: 'Chicago Bulls' },
  { id: 'CLE', name: 'Cleveland Cavaliers', logo: 'Cleveland Cavaliers' },
  { id: 'DAL', name: 'Dallas Mavericks', logo: 'Dallas Mavericks' },
  { id: 'DEN', name: 'Denver Nuggets', logo: 'Denver Nuggets' },
  { id: 'DET', name: 'Detroit Pistons', logo: 'Detroit Pistons' },
  { id: 'GSW', name: 'Golden State Warriors', logo: 'Golden State Warriors' },
  { id: 'HOU', name: 'Houston Rockets', logo: 'Houston Rockets' },
  { id: 'IND', name: 'Indiana Pacers', logo: 'Indiana Pacers' },
  { id: 'LAC', name: 'Los Angeles Clippers', logo: 'Los Angeles Clippers' },
  { id: 'LAL', name: 'Los Angeles Lakers', logo: 'Los Angeles Lakers' },
  { id: 'MEM', name: 'Memphis Grizzlies', logo: 'Memphis Grizzlies' },
  { id: 'MIA', name: 'Miami Heat', logo: 'Miami Heat' },
  { id: 'MIL', name: 'Milwaukee Bucks', logo: 'Milwaukee Bucks' },
  { id: 'MIN', name: 'Minnesota Timberwolves', logo: 'Minnesota Timberwolves' },
  { id: 'NOP', name: 'New Orleans Pelicans', logo: 'New Orleans Pelicans' },
  { id: 'NYK', name: 'New York Knicks', logo: 'New York Knicks' },
  { id: 'OKC', name: 'Oklahoma City Thunder', logo: 'OKC Thunder' },
  { id: 'ORL', name: 'Orlando Magic', logo: 'Orlando Magic' },
  { id: 'PHI', name: 'Philadelphia 76ers', logo: 'Philadelphia 76ers' },
  { id: 'PHX', name: 'Phoenix Suns', logo: 'Phoenix Suns' },
  { id: 'POR', name: 'Portland Trail Blazers', logo: 'Portland Trailblazers' },
  { id: 'SAC', name: 'Sacramento Kings', logo: 'Sacramento Kings' },
  { id: 'SAS', name: 'San Antonio Spurs', logo: 'San Antonio Spurs' },
  { id: 'TOR', name: 'Toronto Raptors', logo: 'Toronto Raptors' },
  { id: 'UTA', name: 'Utah Jazz', logo: 'Utah Jazz' },
  { id: 'WAS', name: 'Washington Wizards', logo: 'Washington Wizards' }
];

// Real NBA lottery odds (percent chance of the number-one pick) by
// reverse-standings seed. The bottom three teams share identical odds.
const LOTTERY_ODDS = [14.0, 14.0, 14.0, 12.5, 10.5, 9.0, 7.5, 6.0, 4.5, 3.0, 2.0, 1.5, 1.0, 0.5];

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

function rngPick(rng) { return typeof rng === 'function' ? rng : Math.random; }

// Generates a plausible NBA season: records, plus a positional profile
// per franchise that drives what they need in the draft. Without a real
// NBA sim behind it, this is synthesised once per draft year and stored,
// so the same draft always produces the same lottery and needs.
function generateLeagueState(seed, rng = Math.random) {
  const r = rngPick(rng);
  return NBA_TEAMS.map(t => {
    const wins = Math.round(15 + r() * 52);          // 15-67 win range
    // Positional strength 0-100. A low number is a hole to fill.
    const strength = {};
    POSITIONS.forEach(p => { strength[p] = Math.round(35 + r() * 60); });
    return { ...t, wins, losses: 82 - wins, strength };
  });
}

// The two positions a team most needs, weakest first.
function teamNeeds(team) {
  return POSITIONS
    .slice()
    .sort((a, b) => team.strength[a] - team.strength[b])
    .slice(0, 2);
}

// Runs the lottery. The 14 non-playoff teams are ordered by record
// (worst first); the top four picks are drawn against the real odds and
// everyone else slots in by record.
function runLottery(league, rng = Math.random) {
  const r = rngPick(rng);
  const byRecord = [...league].sort((a, b) => a.wins - b.wins);
  const lotteryTeams = byRecord.slice(0, 14);
  const playoffTeams = byRecord.slice(14);

  // Weighted draw without replacement for the first four selections.
  const pool = lotteryTeams.map((t, i) => ({ team: t, weight: LOTTERY_ODDS[i] || 0.5 }));
  const winners = [];
  for (let pick = 0; pick < 4 && pool.length; pick++) {
    const total = pool.reduce((n, x) => n + x.weight, 0);
    let roll = r() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { idx = i; break; }
    }
    winners.push(pool[idx].team);
    pool.splice(idx, 1);
  }

  // Remaining lottery teams fall in by record behind the four winners.
  const wonIds = new Set(winners.map(t => t.id));
  const rest = lotteryTeams.filter(t => !wonIds.has(t.id));
  const firstRound = winners.concat(rest, playoffTeams);

  // Second round is straight reverse standings.
  return {
    order: firstRound.concat(byRecord),
    lotteryWinners: winners,
    byRecord
  };
}

// How well a prospect fits a team, as a bonus added to his board score.
// Teams reach for need, but not far — a clearly better player still goes
// ahead of a worse one who happens to fit.
function fitBonus(team, prospect) {
  if (!team || !prospect) return 0;
  const needs = teamNeeds(team);
  const pos = (prospect.pos || '').toUpperCase();
  const slotMap = {
    PG: ['PG', 'G', 'CG'], SG: ['SG', 'G', 'CG', 'W'],
    SF: ['SF', 'W', 'F', 'G/F'], PF: ['PF', 'F', 'F/C'], C: ['C', 'F/C']
  };
  if ((slotMap[needs[0]] || []).includes(pos)) return 6;
  if ((slotMap[needs[1]] || []).includes(pos)) return 3;
  return 0;
}

// Produces the mock draft: 60 picks, best-available weighted by fit.
// `fixed` optionally pins board entries to overall picks ({ 3: entry }),
// which is how picks scripted in the roster sheet land exactly.
// opts.lottery  — an already-drawn lottery ({ order, lotteryWinners }), so
//                 draft night uses the order revealed on lottery night
// opts.interest  — { teamId: { playerId: bonus } } from team workouts: a
//                 prospect who crushed a team's workout is higher on
//                 their list than on the consensus board
// What being ready to play now is worth to a team picking after the lottery.
const READY_NOW = { JR: 6, SR: 13, GR: 13 };

function buildMockDraft(board, league, rng = Math.random, fixed = {}, opts = {}) {
  const r = rngPick(rng);
  const lottery = opts.lottery || runLottery(league, r);
  const interest = opts.interest || {};
  // opts.ranged: [{ entry, maxPick }] — a player guaranteed to go somewhere
  // in picks 1..maxPick, with the exact slot left to team need/fit like
  // anyone else. He's added to every shortlist inside his window so a team
  // can take him early, and forced in at maxPick as a last resort if the
  // window closes with him still on the board.
  const ranged = opts.ranged || [];
  const pinned = new Set(Object.values(fixed || {}));
  const available = board.filter(e => !pinned.has(e));
  const drafted = new Set();
  const picks = [];

  lottery.order.slice(0, 60).forEach((team, i) => {
    const pickNum = i + 1;
    const slot = fixed && fixed[pickNum];
    if (slot) {
      picks.push({ pick: pickNum, round: pickNum <= 30 ? 1 : 2, team, player: slot.player, boardRank: board.indexOf(slot) + 1, needs: teamNeeds(team), scripted: true });
      drafted.add(slot);
      const si = available.indexOf(slot); if (si >= 0) available.splice(si, 1);
      return;
    }
    // A ranged lock whose window has closed goes out first — earliest
    // deadline first if more than one lock collides on the same pick.
    const overdue = ranged.filter(rl => !drafted.has(rl.entry) && available.includes(rl.entry) && rl.maxPick <= pickNum)
      .sort((a, b) => a.maxPick - b.maxPick)[0];
    if (overdue) {
      picks.push({ pick: pickNum, round: pickNum <= 30 ? 1 : 2, team, player: overdue.entry.player, boardRank: board.indexOf(overdue.entry) + 1, needs: teamNeeds(team), scripted: true });
      drafted.add(overdue.entry);
      const oi = available.indexOf(overdue.entry); if (oi >= 0) available.splice(oi, 1);
      return;
    }
    if (available.length === 0) return;
    // Teams consider a shortlist rather than only the top name, which is
    // what lets need and a little randomness move players a few spots.
    // Past the lottery, good teams also want someone who can play now, so
    // the shortlist is a little longer and an upperclassman gets credit for
    // being ready (as in real drafts, where the back of the first round
    // and the second round are full of juniors and seniors).
    const late = pickNum > 14;
    const shortlist = available.slice(0, Math.min((opts.interest ? 8 : 6) + (late ? 6 : 0), available.length));
    // Still-open ranged locks are weighed by every team inside their
    // window, even if their raw score wouldn't put them in the natural
    // shortlist.
    ranged.forEach(rl => {
      if (!drafted.has(rl.entry) && available.includes(rl.entry) && !shortlist.includes(rl.entry)) shortlist.push(rl.entry);
    });
    let best = null, bestScore = -Infinity;
    shortlist.forEach(entry => {
      const liked = (interest[team.id] || {})[entry.player.id] || 0;
      const cls = entry.player.isPro ? '' : String(entry.player.class || '').toUpperCase();
      const ready = late ? (READY_NOW[cls] || 0) : 0;
      const score = entry.score + fitBonus(team, entry.player) + liked + ready + (r() - 0.5) * 2.5;
      if (score > bestScore) { bestScore = score; best = entry; }
    });
    const idx = available.indexOf(best);
    available.splice(idx, 1);
    drafted.add(best);
    picks.push({
      pick: pickNum,
      round: pickNum <= 30 ? 1 : 2,
      team,
      player: best.player,
      boardRank: board.indexOf(best) + 1,
      needs: teamNeeds(team)
    });
  });

  return { picks, lottery };
}

const NBACore = { NBA_TEAMS, LOTTERY_ODDS, generateLeagueState, runLottery, teamNeeds, fitBonus, buildMockDraft };

if (typeof module !== 'undefined' && module.exports) module.exports = NBACore;
else if (typeof window !== 'undefined') window.NBACore = NBACore;
