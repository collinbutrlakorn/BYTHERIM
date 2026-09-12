// ============================================================
// Pure single-game simulation — no DOM. Testable in Node.
// Reuses the existing (already-decent) per-player stat generation
// approach from the current engine, but ties it to a real final
// score for a real opponent instead of generating in a vacuum.
// ============================================================

function getZeroBox() {
  return { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fgm: 0, fga: 0, twoPm: 0, twoPa: 0, threePm: 0, threePa: 0, ftm: 0, fta: 0 };
}

// Same shape as the existing engine's generateSingleGameBox — a player's
// raw performance for one game, before we reconcile it to the real score.
function generateRawPlayerBox(player) {
  const exp = player.expectedStats || {};
  const gameMin = Math.round((parseFloat(exp.mpg) || 0) * (0.8 + Math.random() * 0.4));
  if (gameMin <= 0) return getZeroBox();

  const variance = () => 0.5 + Math.random() * 1.0;
  const scale = gameMin / Math.max(1, parseFloat(exp.mpg) || 1);

  const ppgExp = parseFloat(exp.ppg) || 0;
  const ftaExp = parseFloat(exp.fta) || 0;
  const ftPct = parseFloat(exp.ftPct) || 0.7;
  const threePar = parseFloat(exp.threePar) || 0.3;
  const threePPct = parseFloat(exp.threePPct) || 0.33;
  const twoPPct = parseFloat(exp.twoPPct) || 0.5;

  let expected3PA = ftaExp > 0 ? (ppgExp - (ftaExp * ftPct)) * threePar / 3 : ppgExp * 0.15;
  let expected2PA = ftaExp > 0 ? ((ppgExp - (ftaExp * ftPct)) - (expected3PA * 3)) / 2 : ppgExp * 0.3;
  if (expected2PA < 0) expected2PA = 1;
  if (expected3PA < 0) expected3PA = 1;

  const threePa = Math.round(expected3PA * scale * variance());
  let threePm = 0;
  for (let i = 0; i < threePa; i++) if (Math.random() < threePPct) threePm++;

  const twoPa = Math.round(expected2PA * scale * variance());
  let twoPm = 0;
  for (let i = 0; i < twoPa; i++) if (Math.random() < twoPPct) twoPm++;

  const fta = Math.round(ftaExp * scale * variance());
  let ftm = 0;
  for (let i = 0; i < fta; i++) if (Math.random() < ftPct) ftm++;

  const reb = Math.round((parseFloat(exp.rpg) || 0) * scale * variance());
  // Split total rebounds into offensive/defensive. Bigs crash the offensive
  // glass more than guards, so the offensive share scales with the player's
  // expected block rate as a rough proxy for size/role.
  const isBigish = (parseFloat(exp.blk) || 0) >= 0.8;
  const orebShare = (isBigish ? 0.34 : 0.20) + (Math.random() * 0.10 - 0.05);
  const oreb = Math.min(reb, Math.round(reb * Math.max(0, orebShare)));
  const dreb = reb - oreb;
  const ast = Math.round((parseFloat(exp.apg) || 0) * scale * variance());
  const stl = Math.round((parseFloat(exp.stl) || 0) * (0.3 + Math.random() * 1.4));
  const blk = Math.round((parseFloat(exp.blk) || 0) * (0.3 + Math.random() * 1.4));
  const tov = Math.round((parseFloat(exp.tov) || 0) * scale * variance());
  const pf = Math.min(5, Math.round((parseFloat(exp.pf) || 0) * scale * variance()));

  return {
    min: gameMin,
    pts: (threePm * 3) + (twoPm * 2) + ftm,
    reb, oreb, dreb, ast, stl, blk, tov, pf,
    fgm: twoPm + threePm, fga: twoPa + threePa,
    twoPm, twoPa, threePm, threePa, ftm, fta
  };
}

// Rescales a team's raw player boxes so total points hit `targetScore`
// exactly, while keeping shooting splits roughly intact (scaling makes
// and attempts together) and giving the residual rounding correction
// to whichever player scored the most (least visible distortion).
function reconcileTeamScore(rawBoxes, targetScore) {
  const rawTotal = rawBoxes.reduce((s, b) => s + b.pts, 0);
  if (rawTotal <= 0) {
    // Nobody scored in the raw sim (extreme edge case) — dump it all
    // on whichever player has the highest expected usage (first starter).
    const boxes = rawBoxes.map(b => ({ ...b }));
    if (boxes.length > 0) {
      boxes[0].pts = targetScore;
      boxes[0].fgm = Math.round(targetScore / 2);
      boxes[0].fga = Math.max(boxes[0].fgm, Math.round(boxes[0].fgm / 0.45));
      boxes[0].twoPm = boxes[0].fgm; boxes[0].twoPa = boxes[0].fga;
    }
    return boxes;
  }

  const scale = targetScore / rawTotal;
  const boxes = rawBoxes.map(b => {
    if (b.pts === 0) return { ...b };
    const s = scale;
    const twoPm = Math.round(b.twoPm * s);
    const twoPa = Math.max(twoPm, Math.round(b.twoPa * s));
    const threePm = Math.round(b.threePm * s);
    const threePa = Math.max(threePm, Math.round(b.threePa * s));
    const ftm = Math.round(b.ftm * s);
    const fta = Math.max(ftm, Math.round(b.fta * s));
    return {
      ...b,
      twoPm, twoPa, threePm, threePa, ftm, fta,
      fgm: twoPm + threePm, fga: twoPa + threePa,
      pts: (twoPm * 2) + (threePm * 3) + ftm
    };
  });

  // Rounding residual: nudge makes/attempts so the team total matches
  // exactly. Adding points always goes to the top scorer (least visible).
  // Removing points tries every player, highest-scoring first, since the
  // top scorer alone may run out of makes to take away.
  let total = boxes.reduce((s, b) => s + b.pts, 0);
  let residual = targetScore - total;

  if (residual > 0 && boxes.length > 0) {
    const topIdx = boxes.reduce((best, b, i) => b.pts > boxes[best].pts ? i : best, 0);
    const b = boxes[topIdx];
    b.ftm += residual; b.fta = Math.max(b.fta, b.ftm); b.pts += residual;
    residual = 0;
  }

  while (residual < 0) {
    const order = boxes.map((b, i) => i).sort((i, j) => boxes[j].pts - boxes[i].pts);
    let movedAny = false;
    for (const i of order) {
      if (residual === 0) break;
      const b = boxes[i];
      if (b.ftm > 0) { b.ftm--; b.pts--; residual++; movedAny = true; }
      else if (residual <= -2 && b.twoPm > 0) { b.twoPm--; b.fgm--; b.pts -= 2; residual += 2; movedAny = true; }
      else if (residual <= -3 && b.threePm > 0) { b.threePm--; b.fgm--; b.pts -= 3; residual += 3; movedAny = true; }
    }
    if (!movedAny) break; // truly nothing left to remove anywhere — give up gracefully
  }

  return boxes;
}

// Simulates one game between two teams. Returns final scores and a
// per-player box score for everyone who played, reconciled so each
// team's total points exactly equals its final score.
function simulateSingleGame(homeTeam, awayTeam, opts = {}) {
  const { homeCourtEdge = 3.0, marginScale = 0.85, marginVarianceStd = 11, paceBase = 144, paceVarianceStd = 9 } = opts;

  const homeOvr = homeTeam.simData.teamOvr;
  const awayOvr = awayTeam.simData.teamOvr;

  const gaussian = () => {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const expectedMargin = (homeOvr - awayOvr) * marginScale + homeCourtEdge;
  const actualMargin = expectedMargin + gaussian() * marginVarianceStd;
  const totalPoints = Math.max(90, paceBase + gaussian() * paceVarianceStd);

  let homeScore = Math.round((totalPoints + actualMargin) / 2);
  let awayScore = Math.round((totalPoints - actualMargin) / 2);
  homeScore = Math.max(35, homeScore);
  awayScore = Math.max(35, awayScore);
  if (homeScore === awayScore) homeScore += 1; // no ties in regulation-only v1 model

  const homeRoster = homeTeam.simData.rosterRef || homeTeam.roster;
  const awayRoster = awayTeam.simData.rosterRef || awayTeam.roster;

  const homeRaw = homeRoster.map(p => ({ player: p, box: generateRawPlayerBox(p) }));
  const awayRaw = awayRoster.map(p => ({ player: p, box: generateRawPlayerBox(p) }));

  const homeBoxes = reconcileTeamScore(homeRaw.map(x => x.box), homeScore);
  const awayBoxes = reconcileTeamScore(awayRaw.map(x => x.box), awayScore);

  return {
    homeScore, awayScore,
    homePlayerBoxes: homeRaw.map((x, i) => ({ player: x.player, box: homeBoxes[i] })),
    awayPlayerBoxes: awayRaw.map((x, i) => ({ player: x.player, box: awayBoxes[i] }))
  };
}

const GameCore = { generateRawPlayerBox, reconcileTeamScore, simulateSingleGame, getZeroBox };

if (typeof module !== 'undefined' && module.exports) module.exports = GameCore;
else if (typeof window !== 'undefined') window.GameCore = GameCore;
