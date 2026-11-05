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
function buildNonConfGames(teams, gamesPerTeam, rng = Math.random, taken = {}) {
  const need = {};
  teams.forEach(t => { need[t.school] = Math.max(0, gamesPerTeam - (taken[t.school] || 0)); });
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
function assignFlatGamesToWeeks(games, startWeek, endWeek, maxPerTeamPerWeek = 2, preload = {}) {
  const scheduled = [];
  const weekCount = { ...preload }; // `${week}|${team}` -> count
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


// ------------------------------------------------------------
// Multi-team events (MTEs): early-season tournaments where every team
// plays three games in a weekend (two in the four-team ones) no matter
// how it does: a quarterfinal, then winners play winners and losers play
// losers, then the title game, third place and so on down the bracket.
// ------------------------------------------------------------
const MTE_NAMES = {
  A: ['Maui Invitational', 'Battle 4 Atlantis', 'Players Era Festival'],
  B: ['Empire Classic', 'Baha Mar Hoops Bahamas', 'Charleston Classic', 'ESPN Events Invitational', 'Fort Myers Tip-Off'],
  C: ['Cancun Challenge', 'Paradise Jam', 'Emerald Coast Classic', 'Gulf Coast Showcase', 'Myrtle Beach Invitational', 'Diamond Head Classic'],
  D: ['Cayman Islands Classic', 'Hall of Fame Classic', 'Legends Classic', 'Sunshine Slam', 'Vegas Showcase', 'Greenbrier Tip-Off']
};

// Picks the fields. The best programs go to the marquee events, the next
// tier to the next, and the rest are filled from everyone else; a field
// avoids two teams from one conference where it can.
function buildMtes(teams, opts = {}, rng = Math.random) {
  const weeks = opts.weeks || [3, 4, 4, 5, 5, 6];
  const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const strength = t => (t.prestige != null ? t.prestige : 50) + rng() * 4;
  const ranked = [...teams].sort((a, b) => strength(b) - strength(a));
  const used = new Set();
  const take = list => list.filter(t => !used.has(t.school));
  const plan = [
    { tier: 'A', size: 8, pool: ranked.slice(0, 26), weeks: [4, 5] },
    { tier: 'B', size: 8, pool: ranked.slice(18, 70), weeks: [4, 5, 6] },
    { tier: 'C', size: 8, pool: shuffle(ranked.slice(40, 220)), weeks },
    { tier: 'D', size: 4, pool: shuffle(ranked.slice(30, 300)), weeks: [3, 4, 5, 6, 7] }
  ];
  const events = [];
  const counts = { A: opts.marquee == null ? 3 : opts.marquee, B: opts.upper == null ? 5 : opts.upper, C: opts.middle == null ? 6 : opts.middle, D: opts.small == null ? 6 : opts.small };
  plan.forEach(tp => {
    const n = Math.min(counts[tp.tier], MTE_NAMES[tp.tier].length);
    const names = shuffle(MTE_NAMES[tp.tier]).slice(0, n);
    const fields = names.map(() => []);
    // Deal the pool round-robin so each event of a tier is comparably strong,
    // skipping teams already placed and avoiding repeat conferences.
    let pool = take(tp.pool);
    let k = 0, guard = 0;
    while (fields.some(f => f.length < tp.size) && pool.length && guard++ < 5000) {
      const f = fields[k % n];
      k++;
      if (f.length >= tp.size) continue;
      let pickIdx = pool.findIndex(t => !f.some(x => x.conference === t.conference));
      if (pickIdx < 0) pickIdx = 0;
      const t = pool.splice(pickIdx, 1)[0];
      f.push(t); used.add(t.school);
    }
    fields.forEach((f, i) => {
      if (f.length < tp.size) { f.forEach(t => used.delete(t.school)); return; }
      const week = tp.weeks[Math.floor(rng() * tp.weeks.length)];
      // Bracket order: strongest first, so the top seed meets the eighth.
      const order = [...f].sort((a, b) => strength(b) - strength(a)).map(t => t.school);
      events.push({ id: `mte-${events.length + 1}`, name: names[i], tier: tp.tier, size: tp.size, week, field: order, round: 0, games: [] });
    });
  });
  return events;
}

// The pairings for an event's next round, given what has been played.
// Games are { home, away, round, slot }; results are read from `winnerOf`.
function mteRoundOne(ev) {
  const f = ev.field;
  const pairs = ev.size === 8 ? [[0, 7], [3, 4], [1, 6], [2, 5]] : [[0, 3], [1, 2]];
  return pairs.map(([a, b], i) => ({ home: f[a], away: f[b], round: 1, slot: i }));
}
function mteNextRound(ev, winnerOf, loserOf) {
  const g = (r, i) => ev.games.find(x => x.round === r && x.slot === i);
  if (ev.size === 8) {
    if (ev.round === 1) {
      return [
        { home: winnerOf(g(1, 0)), away: winnerOf(g(1, 1)), round: 2, slot: 0 },
        { home: winnerOf(g(1, 2)), away: winnerOf(g(1, 3)), round: 2, slot: 1 },
        { home: loserOf(g(1, 0)), away: loserOf(g(1, 1)), round: 2, slot: 2 },
        { home: loserOf(g(1, 2)), away: loserOf(g(1, 3)), round: 2, slot: 3 }
      ];
    }
    if (ev.round === 2) {
      return [
        { home: winnerOf(g(2, 0)), away: winnerOf(g(2, 1)), round: 3, slot: 0, label: 'Championship' },
        { home: loserOf(g(2, 0)), away: loserOf(g(2, 1)), round: 3, slot: 1, label: 'Third Place' },
        { home: winnerOf(g(2, 2)), away: winnerOf(g(2, 3)), round: 3, slot: 2, label: 'Fifth Place' },
        { home: loserOf(g(2, 2)), away: loserOf(g(2, 3)), round: 3, slot: 3, label: 'Seventh Place' }
      ];
    }
    return [];
  }
  if (ev.round === 1) {
    return [
      { home: winnerOf(g(1, 0)), away: winnerOf(g(1, 1)), round: 2, slot: 0, label: 'Championship' },
      { home: loserOf(g(1, 0)), away: loserOf(g(1, 1)), round: 2, slot: 1, label: 'Third Place' }
    ];
  }
  return [];
}
const MTE_ROUND_LABELS = { 8: ['Quarterfinal', 'Semifinal', 'Final round'], 4: ['Semifinal', 'Final round'] };
function mteRoundLabel(ev, game) {
  if (game.label) return game.label;
  if (ev.size === 8 && game.round === 2) return game.slot < 2 ? 'Semifinal' : 'Consolation';
  if (ev.size === 8 && game.round === 1) return 'Quarterfinal';
  return 'Semifinal';
}

function generateFullSchedule(teams, opts = {}) {
  const {
    nonConfGamesPerTeam = 12,
    nonConfStartWeek = 1,
    nonConfWeeks = 9,
    confGamesPerWeek = 2,
    mtes = true
  } = opts;

  let gid = 1;
  const schedule = [];

  // --- Non-conference phase ---
  const nonConfEnd = nonConfStartWeek + nonConfWeeks - 1;
  // Early-season tournaments take three games of a field's schedule in the
  // week they're held, so those teams get fewer ordinary non-conference
  // games and none in that week.
  const events = mtes ? buildMtes(teams, typeof mtes === 'object' ? mtes : {}) : [];
  const taken = {}, preload = {};
  events.forEach(ev => {
    const games = ev.size === 8 ? 3 : 2;
    ev.field.forEach(school => { taken[school] = games; preload[`${ev.week}|${school}`] = 3; });
  });
  const ncGames = buildNonConfGames(teams, nonConfGamesPerTeam, Math.random, taken);
  const ncScheduled = assignFlatGamesToWeeks(ncGames, nonConfStartWeek, nonConfEnd, 2, preload);
  ncScheduled.forEach(g => {
    schedule.push({ id: gid++, week: g.week, phase: 'NC', isConf: false, home: g.home, away: g.away, played: false, result: null });
  });
  // Round one of each event is on the schedule from the start; later rounds
  // are set by the results as the week is played.
  events.forEach(ev => {
    ev.round = 1;
    mteRoundOne(ev).forEach(m => {
      const entry = { id: gid++, week: ev.week, phase: 'NC', isConf: false, home: m.home, away: m.away, played: false, result: null,
        neutral: true, mte: ev.id, mteName: ev.name, mteRound: m.round, mteSlot: m.slot, mteLabel: mteRoundLabel(ev, m) };
      schedule.push(entry);
      ev.games.push({ ...m, id: entry.id });
    });
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
    mtes: events,
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
  buildMtes,
  mteRoundOne,
  mteNextRound,
  mteRoundLabel,
  generateFullSchedule
};

if (typeof module !== 'undefined' && module.exports) module.exports = ScheduleCore;
else if (typeof window !== 'undefined') window.ScheduleCore = ScheduleCore;
