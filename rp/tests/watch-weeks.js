// Watching games in a week: as many as you like before the week simulates;
// watching one plays only the games before it. And the Schedule tab opens on
// the week in progress (or the next one up).
const { boot, ok } = require('./harness');

// An in-memory stand-in for IndexedDB that, like the real one, clones what it stores.
const memoryDb = () => {
  const store = {};
  const table = name => ({
    get: async id => { const o = (store[name] || {})[id]; return o && structuredClone(o); },
    put: async o => { store[name] = store[name] || {}; store[name][o.id || 1] = structuredClone(o); },
    toArray: async () => Object.values(store[name] || {}).map(o => structuredClone(o)),
    clear: async () => { store[name] = {}; },
    bulkAdd: async arr => { store[name] = store[name] || {}; arr.forEach((it, i) => { store[name][it.id || it.school || i] = structuredClone(it); }); },
    count: async () => Object.keys(store[name] || {}).length
  });
  return { leagueState: table('leagueState'), teams: table('teams'), players: table('players'), recruits: table('recruits'), transaction: async (m, ...a) => { await a[a.length - 1](); } };
};

(async () => {
  const { Sim, window: w } = boot();
  w.__BTR_AUTO_DRAFT = true; w.__BTR_AUTO_SUMMER = true; w.__BTR_NO_CUTSCENES = true;
  const d = w.document;
  await Sim.init();
  await Sim.startNewGame();
  // The sandbox has no sheets to load; dismiss the notice that says so.
  Sim._spotQueue = []; d.querySelectorAll('.spotlight').forEach(e => e.remove());
  const entry = r => Sim.state.schedule.find(g => g.week === r.week && g.home === r.home && g.away === r.away);
  const done = r => !!entry(r).played;
  const toasts = () => d.querySelectorAll('.rp-toast').length;

  // Week 1 goes the usual way.
  await Sim.simulateWeek();
  ok(Sim.state.week === 1 && !Sim.state.weekOpen, 'a simulated week is closed');
  ok(Sim.state.scheduleViewWeek === 2 && Sim.scheduleDefaultWeek() === 2, 'the Schedule tab moves on to the week up next');
  ok(/Simulate Week 2/.test(d.getElementById('simWeekBtn').innerText), 'the button says Simulate Week 2');

  // ---- watch one game in the middle of week 2 ----
  const slate = Sim.upcomingSlate();
  ok(slate.length > 100 && slate.every(r => r.week === 2), `week 2's slate is known (${slate.length} games)`);
  ok(slate.every((r, i) => i === 0 || Sim.tipMinutes(slate[i - 1]) <= Sim.tipMinutes(r)), 'it runs in tip order');
  const rank0 = {};
  Sim.state.teams.forEach(t => { rank0[t.school] = t.apRank || 0; });
  const m = Math.floor(slate.length * 0.4);
  d.querySelectorAll('.rp-toast').forEach(t => t.remove());
  await Sim.watchGame(slate[m]);
  ok(Sim.state.week === 2 && Sim.state.weekOpen, 'watching a game opens week 2 without finishing it');
  ok(slate.slice(0, m + 1).every(done), `every game up to and including the one watched is final (${m + 1} games)`);
  ok(slate.slice(m + 1).every(r => !done(r)), `every game after it is still to be played (${slate.length - m - 1} games)`);
  ok(Sim.weekProgress(2).played === m + 1 && Sim.weekProgress(2).total >= slate.length, 'the week knows how far it has got');
  ok(Sim.state.teams.every(t => (t.apRank || 0) === rank0[t.school]) && Sim.pollWeek() === 1, 'the poll waits until the week is over');
  ok(d.getElementById('gameCenter') && w.GameCenter.k === 0, 'the broadcast starts from the tip');
  ok(toasts() === 0, 'nothing is revealed while the game is on');
  ok((w.GameCenter.opts.ticker || []).every(t => done(t.ref)), 'the ticker only shows games that have been played');
  w.GameCenter.seek(w.GameCenter.game.events.length);
  w.GameCenter.close();
  ok(toasts() === 1 && /games final/.test(d.querySelector('.rp-toast').textContent), 'closing it says how much of the week is final');
  ok(/Finish Week 2/.test(d.getElementById('simWeekBtn').innerText), 'the main button now finishes the week');
  ok(Sim.upcomingSlate().length === slate.length - m - 1 && Sim.upcomingSlate().every(r => !done(r)), 'the slate left is the games that haven\'t tipped');
  Sim.updateDashboard();
  ok(/of \d+ games final/.test(d.getElementById('dashWatchSub').textContent) && !d.getElementById('dashWatch').innerHTML.includes(`watchGame({home:'${slate[0].home.replace(/'/g, "\\\\'")}'`), 'Games to Watch counts what\'s final and lists only games still to come');
  ok(!Sim.skipReached('conf') && Sim.canSkipTo('conf'), 'skip-ahead still counts a half-played week as unfinished');
  Sim.openGame(slate[m]);
  ok(w.GameCenter.k === w.GameCenter.game.events.length, 'a game that went final opens as a box score');
  w.GameCenter.close();
  // The team's stats and the standings count the games already played.
  const t0 = Sim.findTeam(slate[0].home);
  ok(t0.simData.wins + t0.simData.losses === Sim.state.schedule.filter(g => g.played && (g.home === t0.school || g.away === t0.school)).length && entry(slate[0]).played, 'records include the games already played');

  // ---- and another, further on ----
  const m2 = m + Math.floor((slate.length - m) * 0.5);
  await Sim.watchGame(slate[m2]);
  ok(slate.slice(0, m2 + 1).every(done) && slate.slice(m2 + 1).every(r => !done(r)), 'a later pick plays everything between the two, and nothing after');
  ok(Sim.state.week === 2 && Sim.state.weekOpen, 'the week is still open');
  w.GameCenter.close();

  // ---- a watch list of two ----
  const rest = Sim.upcomingSlate();
  const a = rest[2], b = rest[10];
  Sim.toggleWatchList(a); Sim.toggleWatchList(b);
  ok(Sim.inWatchList(a) && Sim.inWatchList(b), 'two games are on the watch list');
  await Sim.watchGames(Sim._watchQueue.slice());
  ok(done(a) && done(b) && rest.slice(0, 11).every(done) && rest.slice(11).every(r => !done(r)), 'watching both plays through the later one');
  ok(d.getElementById('gameCenter'), 'the first one opens');
  w.GameCenter.close();
  const up = d.querySelector('.spotlight');
  ok(up && /Up next/.test(up.textContent), `with an up-next card for the second (${up ? up.textContent.slice(0, 60) : 'none; queue ' + JSON.stringify((Sim._spotQueue || []).map(c => c.title))})`);
  w.SimEngine.releaseLiveHold();

  // ---- the Schedule tab ----
  Sim.state.scheduleViewWeek = 1;
  d.querySelector('.app-tabs [data-tab="scheduleTab"]').click();
  ok(Sim.state.scheduleViewWeek === 2, 'opening the Schedule tab goes to the week in progress, not week 1');
  const sched = d.getElementById('scheduleContainer');
  ok(/games final/.test(sched.textContent) && /In progress/.test(d.getElementById('scheduleWeekSelect').textContent), 'it shows the week\'s progress');
  const cards = [...sched.querySelectorAll('.sb-card')];
  ok(cards.some(c => c.classList.contains('final') && /Box score/.test(c.textContent)) && cards.some(c => !c.classList.contains('final') && /Watch live/.test(c.textContent)),
    'played games link to their box score, the rest can still be watched');
  ok(cards.findIndex(c => !c.classList.contains('final')) > cards.filter(c => c.classList.contains('final')).length - 1 &&
    cards.slice(0, cards.filter(c => c.classList.contains('final')).length).every(c => c.classList.contains('final')), 'finished games come first, in tip order');
  Sim.setScheduleWeek(1);
  Sim.updateScheduleTab();
  ok(!/games final\./.test(d.getElementById('scheduleContainer').textContent), 'other weeks don\'t carry the banner');

  // ---- it survives a save ----
  const db = memoryDb();
  w.db = db;
  await Sim.saveStateToDB();
  const saved = await db.leagueState.get(1);
  ok(saved && saved.weekOpen === true && saved.currentWeek === 2, 'the half-played week is saved');

  // ---- finishing it ----
  await Sim.simulateWeek();
  ok(Sim.state.week === 2 && !Sim.state.weekOpen, 'simulating finishes the week');
  ok(Sim.state.schedule.filter(g => g.week === 2).every(g => g.played), 'every game of the week was played');
  ok(Sim.state.lastWeekSummary && Sim.state.lastWeekSummary.week === 2 && Sim.state.lastWeekSummary.games === Sim.state.schedule.filter(g => g.week === 2).length, 'the summary covers the whole week');
  ok(Sim.pollWeek() === 2 && Sim.state.teams.some(t => (t.apRank || 0) !== rank0[t.school]), 'the poll moves now');
  ok(Sim.state.scheduleViewWeek === 3 && /Simulate Week 3/.test(d.getElementById('simWeekBtn').innerText), 'the Schedule tab and the button move on to week 3');
  const logWeeks = Sim.state.activePlayers.flatMap(p => (p.gameLog || []).filter(l => l.week === 2));
  ok(logWeeks.length > 1000, 'the game logs carry the week');
  const gp = Sim.state.teams.every(t => t.simData.wins + t.simData.losses === Sim.state.schedule.filter(g => g.week <= 2 && (g.home === t.school || g.away === t.school)).length);
  ok(gp, 'every team played each of its games exactly once');

  // ---- tournaments: the next round shows up as the last one goes final ----
  const ev = Sim.state.mtes.filter(e => e.size === 8).sort((x, y) => x.week - y.week)[0];
  while (Sim.state.week < ev.week - 1) await Sim.simulateWeek();
  const eventTeams = new Set(ev.field);
  const wk = Sim.upcomingSlate();
  ok(wk.some(r => eventTeams.has(r.home) && eventTeams.has(r.away)), `week ${ev.week} has ${ev.name}'s opening round`);
  const lastGame = wk[wk.length - 1];
  await Sim.watchGame(lastGame);
  ok(Sim.state.weekOpen, 'with a tournament in the week, playing the whole opening slate leaves its next round to come');
  w.GameCenter.close();
  const later = Sim.upcomingSlate();
  ok(later.length > 0 && later.every(r => entry(r).mteRound === 2) && later.some(r => eventTeams.has(r.home) && eventTeams.has(r.away)),
    `the next rounds' games (${later.length}) are what's left, and can be watched`);
  await Sim.watchGame(later[later.length - 1]);
  w.GameCenter.close();
  const third = Sim.upcomingSlate();
  ok(third.length > 0 && Sim.state.weekOpen, 'and the round after that appears once they\'re final');
  await Sim.simulateWeek();
  ok(!Sim.state.weekOpen && ev.done && ev.champion, `finishing the week crowns the ${ev.name} champion (${ev.champion})`);

  // ---- watching the last game of the week finishes it ----
  const mteWeeks = new Set(Sim.state.mtes.map(e => e.week));
  while (mteWeeks.has(Sim.state.week + 1)) await Sim.simulateWeek();
  const s3 = Sim.upcomingSlate();
  const last = s3[s3.length - 1];
  const wk3 = Sim.state.week + 1;
  await Sim.watchGame(last);
  ok(Sim.state.week === wk3 && !Sim.state.weekOpen, 'watching the last game of the week closes it');
  ok(done(last) && Sim.state.schedule.filter(g => g.week === wk3).every(g => g.played), 'everything before it went final');
  w.GameCenter.close();
  ok(toasts() >= 1 && /in the books/.test([...d.querySelectorAll('.rp-toast')].map(t => t.textContent).join(' ')), 'the week\'s wrap-up comes once the broadcast is over');

  // ---- a save from a half-played week reloads half-played ----
  await Sim.simulateWeek();
  const nxt = Sim.upcomingSlate();
  await Sim.watchGame(nxt[3]);
  w.GameCenter.close();
  const open = Sim.weekProgress(Sim.state.week);
  await Sim.saveStateToDB();
  const second = boot();
  second.window.db = db;
  const Sim2 = second.Sim;
  await Sim2.init();
  await Sim2.continueGame();
  ok(Sim2.state.weekOpen && Sim2.state.week === Sim.state.week && Sim2.weekProgress(Sim2.state.week).played === open.played && Sim2.upcomingSlate().length === open.total - open.played,
    'reloading keeps the games already played and the ones still to come');
  ok(/Finish Week/.test(second.window.document.getElementById('simWeekBtn').innerText), 'and the button still says to finish the week');
  await Sim2.simulateWeek();
  ok(!Sim2.state.weekOpen && Sim2.state.schedule.filter(g => g.week === Sim2.state.week).every(g => g.played), 'and the week can be finished after a reload');
  w.db = undefined;

  // ---- the rest of the season still plays ----
  let guard = 0;
  while (!Sim.state.regularSeasonDone && guard++ < 40) await Sim.simulateWeek();
  ok(Sim.state.regularSeasonDone && !Sim.state.weekOpen, 'the regular season finishes');
  ok(Sim.state.teams.every(t => t.simData.wins + t.simData.losses === Sim.state.schedule.filter(g => g.home === t.school || g.away === t.school).length), 'every scheduled game was played');
  ok(Sim.state.scheduleViewWeek === Sim.state.week, 'once the regular season is over the Schedule tab sits on its last week');

  console.log('\nWatching games week by week verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
