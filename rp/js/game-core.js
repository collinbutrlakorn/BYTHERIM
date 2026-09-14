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
function generateRawPlayerBox(player, minutesMultiplier = 1) {
  const exp = player.expectedStats || {};
  // minutesMultiplier lets the caller redistribute minutes for a single
  // game — when a rotation player is unavailable, everyone else absorbs
  // his minutes rather than the team simply playing short.
  const gameMin = Math.round((parseFloat(exp.mpg) || 0) * minutesMultiplier * (0.8 + Math.random() * 0.4));
  if (gameMin <= 0) return getZeroBox();

  const variance = () => 0.5 + Math.random() * 1.0;
  const scale = gameMin / Math.max(1, parseFloat(exp.mpg) || 1);

  const ppgExp = parseFloat(exp.ppg) || 0;
  const ftaExp = parseFloat(exp.fta) || 0;
  const ftPct = parseFloat(exp.ftPct) || 0.7;
  const threePar = parseFloat(exp.threePar) || 0.3;
  const threePPct = parseFloat(exp.threePPct) || 0.33;
  const twoPPct = parseFloat(exp.twoPPct) || 0.5;

  // Work backwards from expected points to expected shot volume.
  // Points from the field = total points minus free-throw points. Split
  // that by three-point attempt rate to get expected MAKES, then convert
  // makes to ATTEMPTS by dividing through the shooting percentage.
  // (Dividing by the percentage is the step that matters: without it the
  // expected makes get used directly as attempts, which understates shot
  // volume and inflates field-goal percentage once the team score is
  // reconciled.)
  const fgPoints = Math.max(0, ppgExp - (ftaExp * ftPct));
  const expected3PM = (fgPoints * threePar) / 3;
  const expected2PM = Math.max(0, (fgPoints - expected3PM * 3) / 2);
  let expected3PA = threePPct > 0 ? expected3PM / threePPct : expected3PM * 3;
  let expected2PA = twoPPct > 0 ? expected2PM / twoPPct : expected2PM * 2;
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


// An assist can only happen on a made field goal, and in college roughly
// half of made field goals are assisted. This trims a team's assists back
// to a realistic share of its makes, scaling every player proportionally
// so nobody's line is singled out.
// Caps any one player's share of a team's output in a single game.
// Rebounds and assists are never reconciled to a team total the way points
// are, so multiplier stacking (playstyle x scouting tags x coach system)
// could compound into 20-rebound or 12-assist nights. Real ceilings are
// far tighter: the best rebounders take roughly a quarter of their team's
// boards and the best passers assist on around a third of their team's
// makes over a season.
function capIndividualShare(boxes, key, maxShare) {
  const total = boxes.reduce((n, b) => n + (b[key] || 0), 0);
  if (total <= 0) return boxes;
  const ceiling = total * maxShare;
  let excess = 0;
  boxes.forEach(b => {
    if ((b[key] || 0) > ceiling) { excess += b[key] - ceiling; b[key] = Math.round(ceiling); }
  });
  if (excess <= 0) return boxes;
  // Give the trimmed production to the teammates who were under the cap,
  // so the team total is preserved.
  const room = boxes.filter(b => (b[key] || 0) < ceiling);
  const roomTotal = room.reduce((n, b) => n + (b[key] || 0), 0);
  if (roomTotal <= 0) return boxes;
  let carry = 0;
  room.forEach(b => {
    const add = excess * (b[key] / roomTotal) + carry;
    const whole = Math.floor(add);
    carry = add - whole;
    b[key] = Math.min(Math.round(ceiling), b[key] + whole);
  });
  return boxes;
}

// Keeps offensive and defensive boards consistent with the total after
// the cap has moved rebounds between players.
function resyncRebounds(boxes) {
  boxes.forEach(b => {
    const total = b.reb || 0;
    const o = Math.min(b.oreb || 0, total);
    b.oreb = o;
    b.dreb = total - o;
  });
  return boxes;
}

// Trims any player taking an outsized share of his team's field goal
// attempts, moving both the attempts and the makes they produced to
// teammates so the team's shooting line and point total stay intact.
function capShotVolume(boxes, maxShare) {
  const totalFga = boxes.reduce((n, b) => n + (b.fga || 0), 0);
  if (totalFga <= 0) return boxes;
  const ceiling = totalFga * maxShare;

  boxes.forEach(b => {
    if ((b.fga || 0) <= ceiling) return;
    const factor = ceiling / b.fga;
    const shift = (madeKey, attKey) => {
      const newAtt = Math.round(b[attKey] * factor);
      const newMade = Math.min(newAtt, Math.round(b[madeKey] * factor));
      const dAtt = b[attKey] - newAtt;
      const dMade = b[madeKey] - newMade;
      b[attKey] = newAtt; b[madeKey] = newMade;
      return { dAtt, dMade };
    };
    const two = shift('twoPm', 'twoPa');
    const three = shift('threePm', 'threePa');
    b.fgm = b.twoPm + b.threePm;
    b.fga = b.twoPa + b.threePa;
    b.pts = b.twoPm * 2 + b.threePm * 3 + b.ftm;

    // Hand the removed shots to the teammates with the most room.
    const room = boxes.filter(x => x !== b && (x.fga || 0) < ceiling)
      .sort((x, y) => (x.fga || 0) - (y.fga || 0));
    if (room.length === 0) return;
    let i = 0;
    const give = (attKey, madeKey, dAtt, dMade) => {
      for (let n = 0; n < dAtt; n++) {
        const t = room[i % room.length]; i++;
        t[attKey] += 1;
        if (n < dMade) { t[madeKey] += 1; t.pts += (attKey === 'threePa' ? 3 : 2); }
        t.fgm = t.twoPm + t.threePm;
        t.fga = t.twoPa + t.threePa;
      }
    };
    give('twoPa', 'twoPm', two.dAtt, two.dMade);
    give('threePa', 'threePm', three.dAtt, three.dMade);
  });
  return boxes;
}

function capTeamAssists(boxes, maxShare = 0.62) {
  const totalFgm = boxes.reduce((s, b) => s + b.fgm, 0);
  const totalAst = boxes.reduce((s, b) => s + b.ast, 0);
  const cap = totalFgm * maxShare;
  if (totalAst <= cap || totalAst === 0) return boxes;

  const factor = cap / totalAst;
  let running = 0;
  boxes.forEach(b => {
    const scaled = b.ast * factor;
    const whole = Math.floor(scaled);
    running += scaled - whole;
    b.ast = whole;
    if (running >= 1) { b.ast += 1; running -= 1; }
  });
  return boxes;
}

// Simulates one game between two teams. Returns final scores and a
// per-player box score for everyone who played, reconciled so each
// team's total points exactly equals its final score.
function simulateSingleGame(homeTeam, awayTeam, opts = {}) {
  const { homeCourtEdge = 3.0, marginScale = 0.85, marginVarianceStd = 11, paceBase = 147, paceVarianceStd = 9 } = opts;

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

  // Total points scale with the quality of the teams on the floor. Without
  // this the combined total was the same in a top-10 matchup as in a
  // low-major one, so no offense could ever separate itself — the best
  // teams in the country topped out around 78 a night.
  const avgOvr = (homeOvr + awayOvr) / 2;
  const qualityAdj = (avgOvr - 75) * 0.92;

  // Coaching tempo: both benches influence how many possessions a game
  // gets, so an up-tempo team playing a grind-it-out team lands in between
  // rather than either one dictating outright.
  const hc = homeTeam.coachProfile || {};
  const ac = awayTeam.coachProfile || {};
  const paceMult = ((hc.pace || 1) + (ac.pace || 1)) / 2;

  const totalPoints = Math.max(90, (paceBase + qualityAdj) * paceMult + gaussian() * paceVarianceStd);

  let homeScore = Math.round((totalPoints + actualMargin) / 2);
  let awayScore = Math.round((totalPoints - actualMargin) / 2);

  // A defensive coach suppresses what the opponent scores. Applied as a
  // transfer rather than a flat reduction so the game total stays sane.
  const applyDefense = (defenderProfile, oppScore) => {
    const d = defenderProfile.defense || 1;
    if (d === 1) return oppScore;
    return oppScore * (2 - d);   // defense 1.10 -> opponent scores 90%
  };
  awayScore = Math.round(applyDefense(hc, awayScore));
  homeScore = Math.round(applyDefense(ac, homeScore));
  homeScore = Math.max(35, homeScore);
  awayScore = Math.max(35, awayScore);
  if (homeScore === awayScore) homeScore += 1; // no ties in regulation-only v1 model

  const homeRoster = homeTeam.simData.rosterRef || homeTeam.roster;
  const awayRoster = awayTeam.simData.rosterRef || awayTeam.roster;

  const homeBoost = opts.homeMinutesMultiplier || 1;
  const awayBoost = opts.awayMinutesMultiplier || 1;
  const homeRaw = homeRoster.map(p => ({ player: p, box: generateRawPlayerBox(p, homeBoost) }));
  const awayRaw = awayRoster.map(p => ({ player: p, box: generateRawPlayerBox(p, awayBoost) }));

  const finish = (raw, score) => {
    let boxes = capTeamAssists(reconcileTeamScore(raw, score));
    boxes = capIndividualShare(boxes, 'reb', 0.31);
    boxes = resyncRebounds(boxes);
    boxes = capIndividualShare(boxes, 'ast', 0.72);
    // Shot volume. The real top-five attempt leaders sit between roughly
    // 17 and 20 a night, and even on a lopsided roster one player rarely
    // takes more than about a quarter of his team's shots.
    boxes = capShotVolume(boxes, 0.315);
    return boxes;
  };
  const homeBoxes = finish(homeRaw.map(x => x.box), homeScore);
  const awayBoxes = finish(awayRaw.map(x => x.box), awayScore);

  return {
    homeScore, awayScore,
    homePlayerBoxes: homeRaw.map((x, i) => ({ player: x.player, box: homeBoxes[i] })),
    awayPlayerBoxes: awayRaw.map((x, i) => ({ player: x.player, box: awayBoxes[i] }))
  };
}

const GameCore = { generateRawPlayerBox, reconcileTeamScore, capTeamAssists, capIndividualShare, capShotVolume, simulateSingleGame, getZeroBox };

if (typeof module !== 'undefined' && module.exports) module.exports = GameCore;
else if (typeof window !== 'undefined') window.GameCore = GameCore;
