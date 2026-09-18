// Covers the Draft RP mock draft and guards against save-size regressions.
// The save previously stored every player twice (once in `players`, again
// inside each team's roster), which pushed a five-season file near 100 MB.
const path = require('path');
const { boot, playSeason, playOffseason, ok } = require('./harness');
const NBACore = require(path.join(__dirname, '..', 'js', 'nba-core.js'));

const mb = o => Buffer.byteLength(JSON.stringify(o)) / 1048576;

(async () => {
  // ---- lottery odds ----
  const league = NBACore.generateLeagueState(2029);
  ok(league.length === 30, '30 NBA franchises');
  ok(league.every(t => t.wins + t.losses === 82), 'every record totals 82 games');

  const byRecord = [...league].sort((a, b) => a.wins - b.wins);
  const counts = {};
  for (let i = 0; i < 3000; i++) {
    const l = NBACore.runLottery(league);
    counts[l.order[0].id] = (counts[l.order[0].id] || 0) + 1;
  }
  const worst3 = byRecord.slice(0, 3).reduce((s, t) => s + (counts[t.id] || 0), 0) / 30;
  ok(worst3 > 32 && worst3 < 52, `bottom three win the top pick ${worst3.toFixed(1)}% of the time (real ~42%)`);

  const nonLottery = new Set(byRecord.slice(14).map(t => t.id));
  let jumped = 0;
  for (let i = 0; i < 300; i++) {
    const l = NBACore.runLottery(league);
    if (l.order.slice(0, 4).some(t => nonLottery.has(t.id))) jumped++;
  }
  ok(jumped === 0, 'playoff teams never jump into the top four');

  // ---- mock draft shape ----
  const { Sim } = boot();
  await Sim.init();
  await Sim.startNewGame();
  await playSeason(Sim);

  const board = Sim.computeDraftBigBoard(200);
  const mock = NBACore.buildMockDraft(board, league);
  ok(mock.picks.length === 60, `sixty picks (${mock.picks.length})`);
  ok(new Set(mock.picks.map(p => p.player.id)).size === 60, 'no prospect drafted twice');

  const early = mock.picks.slice(0, 10).reduce((s, p) => s + p.boardRank, 0) / 10;
  const late = mock.picks.slice(50).reduce((s, p) => s + p.boardRank, 0) / 10;
  ok(early < late, `better prospects go earlier (${early.toFixed(1)} vs ${late.toFixed(1)})`);

  // ---- save size across seasons ----
  await playOffseason(Sim);
  await playSeason(Sim);
  await playOffseason(Sim);

  const slimTeams = Sim.state.teams.map(t => {
    const { roster, ...rest } = t;
    if (rest.simData) { const { rosterRef, ...sim } = rest.simData; rest.simData = sim; }
    return rest;
  });
  const teamsMb = mb(slimTeams);
  const playersMb = mb(Sim.state.activePlayers);

  ok(teamsMb < 3, `teams table stays small without duplicated rosters (${teamsMb.toFixed(2)} MB)`);
  ok(playersMb < 60, `players table is bounded (${playersMb.toFixed(2)} MB)`);
  ok((Sim.state.departedArchive || []).length <= Sim.DEPARTED_ARCHIVE_CAP * 1.3,
    `departed archive is capped (${(Sim.state.departedArchive || []).length})`);

  console.log('\nDraft and save-size checks passed.');
})().catch(e => { console.error(e.message); process.exit(1); });
