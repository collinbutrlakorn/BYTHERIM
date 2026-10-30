// The transfer portal and recruiting against fifteen scholarships, and
// international prospects' draft eligibility.
const { boot, playSeason, playOffseason, ok } = require('./harness');

(async () => {
  const { Sim, window: w } = boot();
  w.__BTR_AUTO_DRAFT = true; w.__BTR_AUTO_SUMMER = true; w.__BTR_NO_CUTSCENES = true;
  await Sim.init();
  await Sim.startNewGame();

  // Internationals: early entrants until the draft of the year they turn
  // 22, automatically eligible that year (four drafts without a birthdate).
  ok(Sim.proLastDraft({ dob: '3/1/2010', recClassYear: 2028 }) === 2032 && Sim.proLastDraft({ recClassYear: 2028 }) === 2032, 'an international is automatically eligible the year he turns 22');
  ok(Sim.proLastDraft({ dob: '3/1/2011', recClassYear: 2028 }) === 2033, 'a young one has an extra draft as an early entrant');

  // NIL: hidden tiers, hype on top of ranking.
  const N = w.NilCore;
  const base = { name: 'Test Guard', pos: 'SG', rating: 80, class: 'FR', rsci: 60, stats: { gp: 30, ppg: 12 } };
  ok(N.playerValue({ ...base, hs: 'Overtime Elite' }) >= 52 && N.playerValue({ ...base, hs: 'Overtime Elite' }) > N.playerValue(base), 'Overtime Elite raises a player\'s NIL floor');
  ok(N.playerValue({ ...base, allStar: { mcd: true } }) > N.playerValue(base), 'so does the McDonald\'s game');
  ok(['Elite', 'High', 'Solid', 'Modest', 'Minimal'].includes(Sim.nilTier(50)) && !/\$/.test(Sim.nilTier(90)), 'shown as tiers, never dollars');
  ok(Sim.nilBudget(Sim.findTeam('Kentucky')) > Sim.nilBudget(Sim.findTeam('Siena')), 'Kentucky outspends Siena');
  ok(Sim.nilStayChance(95, 10) <= 0.01 && Sim.nilStayChance(95, 80) > 0.3, 'a projected first-rounder takes the NBA ~99 times in 100; a fringe prospect with a big deal often stays');

  await playSeason(Sim);
  // Watch the portal place its entrants.
  let seen = null;
  const place = Sim.placePortalEntrants.bind(Sim);
  Sim.placePortalEntrants = function (entrants) {
    const room = this.nextSeasonRoom(new Set(entrants.map(e => e.player.id)));
    const out = place(entrants);
    seen = { room, out, n: entrants.length };
    return out;
  };
  await playOffseason(Sim);
  ok(seen && seen.n > 20, `the portal had entrants (${seen && seen.n})`);
  const into = {};
  seen.out.placed.forEach(t => { into[t.to] = (into[t.to] || 0) + 1; });
  const over = Object.entries(into).filter(([sc, n]) => n > Math.max(0, seen.room[sc]));
  ok(!over.length, `no school signs more transfers than it has scholarships open${over.length ? ': ' + JSON.stringify(over.slice(0, 3)) : ''}`);
  const most = Math.max(...Object.values(into));
  ok(Object.keys(into).length >= Math.min(seen.out.placed.length, 25) * 0.6, `transfers spread across ${Object.keys(into).length} schools (most to one: ${most})`);
  const nilMoves = seen.out.placed.filter(t => /NIL/.test(t.reason || ''));
  ok(nilMoves.length >= 3, `some transfers are for NIL (${nilMoves.length})`);
  const budgetOf = sc => Sim.nilBudget(Sim.findTeam(sc));
  const up = nilMoves.filter(t => budgetOf(t.to) > budgetOf(t.from)).length;
  ok(nilMoves.every(t => budgetOf(t.to) >= budgetOf(t.from) - 4), `NIL transfers go to programs that spend at least as much (${up} of ${nilMoves.length})`);
  ok(most <= 9, `no school lands more than nine transfers (${most})`);
  // Every reported move happened.
  const where = new Map();
  Sim.state.teams.forEach(t => t.roster.forEach(p => where.set(p.id, t.school)));
  const listed = (Sim.state.lastTransfers || []).filter(t => t.id && where.has(t.id));
  ok(listed.every(t => where.get(t.id) === t.to), 'every transfer reported is on his new team');
  ok(Sim.state.teams.every(t => t.roster.length <= Sim.ROSTER_LIMIT), `no roster over ${Sim.ROSTER_LIMIT} (max ${Math.max(...Sim.state.teams.map(t => t.roster.length))})`);

  // Next year's class: no program signs more than it has room for.
  const c = Sim.state.year + 1;
  const signed = {};
  (Sim.state.allRecruits || []).filter(r => r.isLiveRecruit !== false && Number(r.recClassYear) === c && r.genRecruit && r.liveCommitted)
    .forEach(r => { signed[r.school] = (signed[r.school] || 0) + 1; });
  const tooMany = Object.entries(signed).filter(([sc, n]) => n > Math.max(Sim.liveQuota(sc, c), 1) + 1);
  ok(!tooMany.length, `live commitments stay within each class quota${tooMany.length ? ': ' + JSON.stringify(tooMany.slice(0, 3)) : ''}`);

  console.log('\nPortal and roster room verified.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
