// ============================================================
// Pure scheduling logic — no DOM, no globals. Testable in Node.
// This will be transplanted into rp/js/engine.js once verified.
// ============================================================

function groupByConference(teams) {
  const map = {};
  teams.forEach(t => {
    const c = t.conference || 'Independent';
    if (!map[c]) map[c] = [];
    map[c].push(t.school);
  });
  return map;
}

// Standard "circle method" round robin. Returns an array of rounds;
// each round is an array of [home, away] pairs. Every team plays
// exactly once per round (or sits a bye if the conference is odd-sized).
function roundRobinRounds(teamNames) {
  let teams = [...teamNames];
  const hasBye = teams.length % 2 !== 0;
  if (hasBye) teams.push(null);

  const n = teams.length;
  const rounds = [];
  const fixed = teams[0];
  let rotating = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const roundTeams = [fixed, ...rotating];
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const a = roundTeams[i];
      const b = roundTeams[n - 1 - i];
      if (a && b) {
        // Alternate home/away across rounds so it's not always the same team at home
        if (r % 2 === 0) round.push([a, b]);
        else round.push([b, a]);
      }
    }
    rounds.push(round);
    rotating.unshift(rotating.pop());
  }
  return rounds;
}

// Builds a conference's full round list. Small conferences (<=10 teams)
// get a home-and-home double round robin; larger ones get a single
// round robin (a simplification of real partial-double-robin scheduling).
function buildConferenceRounds(confTeams) {
  if (confTeams.length < 2) return [];
  const single = roundRobinRounds(confTeams);
  if (confTeams.length <= 10) {
    // Second leg: same pairings, home/away flipped
    const second = single.map(round => round.map(([h, a]) => [a, h]));
    return [...single, ...second];
  }
  return single;
}

// Random cross-conference non-conference schedule.
// Greedy random pairing; teams that run out of eligible opponents
// simply end up with slightly fewer non-conference games, which is fine.
function buildNonConfGames(teams, gamesPerTeam, rng = Math.random) {
  const need = {};
  teams.forEach(t => { need[t.school] = gamesPerTeam; });
  const games = [];
  const playedPairs = new Set();

  const pairKey = (a, b) => [a, b].sort().join('|');

  let remaining = teams.filter(t => need[t.school] > 0);
  let attempts = 0;
  const maxAttempts = teams.length * gamesPerTeam * 20;

  while (remaining.length > 1 && attempts < maxAttempts) {
    attempts++;
    const i = Math.floor(rng() * remaining.length);
    const teamA = remaining[i];

    const candidates = remaining.filter(t =>
      t.school !== teamA.school &&
      t.conference !== teamA.conference &&
      !playedPairs.has(pairKey(t.school, teamA.school))
    );

    if (candidates.length === 0) {
      // This team can't be scheduled further right now; drop it from this pass
      remaining = remaining.filter(t => t.school !== teamA.school);
      continue;
    }

    const teamB = candidates[Math.floor(rng() * candidates.length)];
    const homeFirst = rng() < 0.5;
    games.push(homeFirst ? [teamA.school, teamB.school] : [teamB.school, teamA.school]);
    playedPairs.add(pairKey(teamA.school, teamB.school));

    need[teamA.school]--;
    need[teamB.school]--;
    remaining = teams.filter(t => need[t.school] > 0);
  }

  return games;
}

// Distributes a flat list of [home, away] games across a week range,
// capping how many games any one team plays in a given week.
function assignFlatGamesToWeeks(games, startWeek, endWeek, maxPerTeamPerWeek = 2) {
  const scheduled = [];
  const weekCount = {}; // `${week}|${team}` -> count
  const weeks = [];
  for (let w = startWeek; w <= endWeek; w++) weeks.push(w);

  // Process in random order so the *set* of games assigned early isn't biased,
  // but for each game pick the best-fit week (lowest current load) rather
  // than the first random week that happens to work. This avoids painting
  // a team into a corner where every remaining week is already at cap.
  const order = [...games].sort(() => Math.random() - 0.5);

  order.forEach(([home, away]) => {
    let bestWeek = null;
    let bestLoad = Infinity;
    let bestUnderCap = false;

    weeks.forEach(w => {
      const hCount = weekCount[`${w}|${home}`] || 0;
      const aCount = weekCount[`${w}|${away}`] || 0;
      const load = Math.max(hCount, aCount);
      const underCap = hCount < maxPerTeamPerWeek && aCount < maxPerTeamPerWeek;

      // Prefer any under-cap week over any over-cap week; within that,
      // prefer the lowest load (ties broken by first found).
      if (underCap && !bestUnderCap) {
        bestWeek = w; bestLoad = load; bestUnderCap = true;
      } else if (underCap === bestUnderCap && load < bestLoad) {
        bestWeek = w; bestLoad = load;
      }
    });

    const hKey = `${bestWeek}|${home}`;
    const aKey = `${bestWeek}|${away}`;
    weekCount[hKey] = (weekCount[hKey] || 0) + 1;
    weekCount[aKey] = (weekCount[aKey] || 0) + 1;
    scheduled.push({ week: bestWeek, home, away });
  });

  return scheduled;
}

// Conference rounds already guarantee 1 game/team/round, so pack
// `gamesPerWeek` rounds into each calendar week.
function assignRoundsToWeeks(rounds, startWeek, gamesPerWeek = 2) {
  const scheduled = [];
  let week = startWeek;
  for (let i = 0; i < rounds.length; i += gamesPerWeek) {
    const chunk = rounds.slice(i, i + gamesPerWeek);
    chunk.forEach(round => {
      round.forEach(([home, away]) => {
        scheduled.push({ week, home, away });
      });
    });
    week++;
  }
  return { scheduled, lastWeek: week - 1 };
}

function generateFullSchedule(teams, opts = {}) {
  const {
    nonConfGamesPerTeam = 12,
    nonConfStartWeek = 1,
    nonConfWeeks = 9,
    confGamesPerWeek = 2
  } = opts;

  let gid = 1;
  const schedule = [];

  // --- Non-conference phase ---
  const nonConfEnd = nonConfStartWeek + nonConfWeeks - 1;
  const ncGames = buildNonConfGames(teams, nonConfGamesPerTeam);
  const ncScheduled = assignFlatGamesToWeeks(ncGames, nonConfStartWeek, nonConfEnd, 2);
  ncScheduled.forEach(g => {
    schedule.push({ id: gid++, week: g.week, phase: 'NC', isConf: false, home: g.home, away: g.away, played: false, result: null });
  });

  // --- Conference phase ---
  const confMap = groupByConference(teams);
  const confStartWeek = nonConfEnd + 1;
  let latestConfWeek = confStartWeek;

  Object.keys(confMap).forEach(confName => {
    const confTeams = confMap[confName];
    if (confTeams.length < 2) return;
    const rounds = buildConferenceRounds(confTeams);
    const { scheduled, lastWeek } = assignRoundsToWeeks(rounds, confStartWeek, confGamesPerWeek);
    scheduled.forEach(g => {
      schedule.push({ id: gid++, week: g.week, phase: 'CONF', isConf: true, home: g.home, away: g.away, played: false, result: null });
    });
    if (lastWeek > latestConfWeek) latestConfWeek = lastWeek;
  });

  return {
    schedule,
    nonConfEnd,
    confEnd: latestConfWeek
  };
}

const ScheduleCore = {
  groupByConference,
  roundRobinRounds,
  buildConferenceRounds,
  buildNonConfGames,
  assignFlatGamesToWeeks,
  assignRoundsToWeeks,
  generateFullSchedule
};

if (typeof module !== 'undefined' && module.exports) module.exports = ScheduleCore;
else if (typeof window !== 'undefined') window.ScheduleCore = ScheduleCore;
