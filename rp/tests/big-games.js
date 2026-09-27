// Watching games live, tournament honors, and big games moving draft stock.
const { boot, ok } = require('./harness');

(async () => {
  const { Sim, window: w } = boot();
  await Sim.init();
  await Sim.startNewGame();
  const d = w.document;

  // ---- watch a regular-season game live ----
  await Sim.simulateWeek();
  const slate = Sim.upcomingSlate();
  ok(slate.length > 50, `next week's slate is known before it's played (${slate.length} games)`);
  const pickRef = slate[0];
  const weekBefore = Sim.state.week;
  d.querySelectorAll('.rp-toast').forEach(t => t.remove());
  await Sim.watchGame(pickRef);
  ok(Sim.state.week === weekBefore + 1, 'watching a game plays the rest of the week around it');
  ok(d.getElementById('gameCenter'), 'the Game Center opens');
  ok(w.GameCenter.game && w.GameCenter.k === 0, 'the game starts from the tip, not the final');
  ok(d.querySelectorAll('.rp-toast').length === 0, 'the week\'s results stay hidden while the game is on');
  ok((w.GameCenter.opts.ticker || []).length > 0, 'scores from around the country go final during the broadcast');
  w.GameCenter.seek(w.GameCenter.game.events.length);
  ok(d.querySelector('.gc-final'), 'the final shows the recap and the player of the game');
  w.GameCenter.close();
  ok(!d.getElementById('gameCenter') && d.querySelectorAll('.rp-toast').length === 1, 'closing the broadcast shows what was held back');
  Sim.openGame(pickRef);
  ok(d.getElementById('gameCenter') && w.GameCenter.k === w.GameCenter.game.events.length, 'a finished game opens at the final, box score ready');
  w.GameCenter.close();

  // ---- the rest of the season ----
  let guard = 0;
  while (!Sim.state.confChampsDone && guard++ < 40) await Sim.simulateWeek();
  const h = Sim.state.postseasonHonors;
  const confs = Object.entries(Sim.state.confTournaments);
  ok(h && confs.every(([c, b]) => h.conf[c] && h.conf[c].school === b.champion.school), `every conference tournament has an MOP from its champion (${confs.length})`);
  const [c0] = confs[0];
  const mop0 = Sim.state.activePlayers.find(p => p.id === h.conf[c0].id);
  ok(mop0 && mop0.accolades.includes(`${c0} Tournament MOP`), 'the MOP is added to his accolades');
  ok(/Most Outstanding Player/.test(Sim.renderConfBracket(Sim.state.confTournaments[c0], c0)), 'conference brackets name the MOP');

  // Watch the national championship live.
  while (!Sim.state.ncaaTournament || Sim.state.ncaaTournament.rounds.length < 5) await Sim.simulateWeek();
  const next = Sim.upcomingNcaaGames();
  ok(next.length === 1 && /National Championship/.test(next[0].label), 'the title game can be picked before it\'s played');
  await Sim.watchGame(next[0]);
  ok(Sim.state.ncaaDone, 'watching the title game finishes the tournament');
  ok(d.getElementById('offseasonOverlay').style.display !== 'block', 'the champion isn\'t revealed while the title game is on');
  ok(/Most Outstanding Player/.test(w.GameCenter.game.meta.note || ''), 'the title game recap names the Final Four MOP');
  w.GameCenter.close();
  ok(d.getElementById('offseasonOverlay').style.display === 'block', 'the offseason opens once the broadcast is closed');

  const ff = Sim.state.postseasonHonors.finalFour;
  const ffTeams = new Set(Sim.state.ncaaTournament.rounds[4].flatMap(g => [g.teamA.school, g.teamB.school]));
  ok(ff && ff.mop && ffTeams.has(ff.mop.school), `Final Four MOP: ${ff.mop.name} (${ff.mop.school})`);
  ok(ff.team.length === 5 && new Set(ff.team.map(x => x.id)).size === 5 && ff.team.some(x => x.id === ff.mop.id), 'an All-Final Four team of five, including the MOP');
  ok(Object.keys(Sim.state.postseasonHonors.regions).length === 4, 'each region has an MOP');
  Sim.updateAwardsTab();
  ok(/Final Four Most Outstanding Player/.test(d.getElementById('postseasonHonors').textContent), 'the Awards tab lists the postseason honors');

  // ---- big games and draft stock ----
  const withBig = Sim.state.activePlayers.filter(p => (p.bigGames || []).length);
  ok(withBig.length > 100, `big games are tracked (${withBig.length} players)`);
  const march = withBig.filter(p => p.bigGames.some(g => /Final Four|Elite Eight|Sweet 16|Championship/.test(g.label)));
  ok(march.length > 5, `deep tournament runs leave their mark (${march.length} players with a late-round game on file)`);
  const ups = withBig.filter(p => p.bigGameStock > 0.5).length, downs = withBig.filter(p => p.bigGameStock < -0.5).length;
  ok(ups > 10 && downs > 10, `stock goes both ways (${ups} up, ${downs} down)`);
  const board = Sim.computeDraftBigBoard(60);
  ok(board.every(e => typeof e.bigGames === 'number'), 'the big board counts big games');
  const star = board.find(e => e.bigGames > 0.4) || board[0];
  const without = w.DraftCore.scoreProspect({ ...star.player, bigGameStock: 0 }, 0.5).score;
  const withIt = w.DraftCore.scoreProspect(star.player, 0.5).score;
  ok(Math.abs((withIt - without) - star.player.bigGameStock) < 0.01, `a prospect's big games move his board score (${star.player.name}: ${star.player.bigGameStock >= 0 ? '+' : ''}${star.player.bigGameStock})`);
  const snap = Sim.slimPlayer(star.player);
  ok(Array.isArray(snap.bigGames) && typeof snap.bigGameStock === 'number', 'the published universe carries each prospect\'s big games');

  console.log('\nBig games, honors and live watching verified.');
  process.exit(0);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
