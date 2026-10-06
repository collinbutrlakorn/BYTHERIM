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
  // Deep-bench players don't get a couple of minutes every single night;
  // they sit out some games entirely and play a little more when they do
  // get in. The chance of appearing rises with the role, and the minutes
  // when he plays are scaled up so his season average stays the same.
  const expMin = (parseFloat(exp.mpg) || 0) * minutesMultiplier;
  let appear = 1;
  if (expMin < 7.5) appear = Math.max(0.15, Math.min(1, 0.22 + expMin / 9));
  if (expMin <= 0 || Math.random() >= appear) return getZeroBox();
  const gameMin = Math.max(1, Math.round((expMin / appear) * (0.8 + Math.random() * 0.4)));

  const variance = () => 0.5 + Math.random() * 1.0;
  const scale = gameMin / Math.max(1, expMin);

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
  // threePar is the share of his SHOTS that are threes (that's what a
  // three-point attempt rate is), so attempts are solved from it directly.
  // Reading it as the share of his points from threes gave a poor shooter
  // far more threes than his rate: a 25% shooter's few points from deep
  // take a lot of attempts, which is how rim-running bigs ended up
  // launching one or two threes a night.
  const fgPoints = Math.max(0, ppgExp - (ftaExp * ftPct));
  const ptsPerShot = threePar * 3 * threePPct + (1 - threePar) * 2 * twoPPct;
  const expectedFga = ptsPerShot > 0 ? fgPoints / ptsPerShot : fgPoints / 1.0;
  let expected3PA = expectedFga * threePar;
  let expected2PA = expectedFga * (1 - threePar);
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
  // Offensive rebound share of a player's total boards.
  //
  // Two things drive it. Size and role: bigs live in the paint and crash
  // the glass, guards get back on defense. And shot profile: a big who
  // spends his possessions behind the arc simply isn't standing where
  // offensive rebounds happen, so a high three-point attempt rate pulls
  // his offensive share down toward a wing's. The old flat 0.34 for
  // anything blocking shots gave power forwards absurd OREB rates.
  const isBigish = (parseFloat(exp.blk) || 0) >= 0.8;
  const par = parseFloat(exp.threePar) || 0.4;
  const perimeterPull = Math.max(0, Math.min(1, par / 0.55));   // 0 = rim-bound, 1 = spacing big
  // (0.41 for bigs before guards' rebounding was trimmed; with more of a
  // team's boards now going to its bigs, this keeps team OREB% at D1 levels.)
  const baseShare = isBigish ? 0.37 : 0.26;
  const orebShare = baseShare * (1 - perimeterPull * 0.38) + (Math.random() * 0.08 - 0.04);
  const oreb = Math.min(reb, Math.round(reb * Math.max(0, orebShare)));
  const dreb = reb - oreb;
  const ast = Math.round((parseFloat(exp.apg) || 0) * scale * variance());
  // Steals and blocks are rare, separate events, so each night's count is
  // a Poisson draw around his average. Rounding a scaled average instead
  // meant anyone averaging under about 0.4 (most guards' blocks) could
  // never record one: a full season of zeros.
  const poisson = mean => {
    if (!(mean > 0)) return 0;
    const L = Math.exp(-mean);
    let k = 0, p = Math.random();
    while (p > L && k < 12) { k++; p *= Math.random(); }
    return k;
  };
  const stl = poisson(parseFloat(exp.stl) || 0);
  const blk = poisson(parseFloat(exp.blk) || 0);
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

// A player's expected points and shooting possessions per game, the same
// way his raw box is drawn: the league's points-per-possession norm for
// efficiency-aware possessions (see buildConsistentBoxes) is built from it.
function expectedLoad(exp) {
  exp = exp || {};
  const ppg = parseFloat(exp.ppg) || 0, fta = parseFloat(exp.fta) || 0, ftPct = parseFloat(exp.ftPct) || 0.7;
  const par = parseFloat(exp.threePar) || 0.3, p3 = parseFloat(exp.threePPct) || 0.33, p2 = parseFloat(exp.twoPPct) || 0.5;
  const pps = par * 3 * p3 + (1 - par) * 2 * p2;
  const fga = pps > 0 ? Math.max(0, ppg - fta * ftPct) / pps : 0;
  return { pts: ppg, load: fga + 0.44 * fta + (parseFloat(exp.tov) || 0) };
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

  // Corrections change the result of a shot rather than inventing or
  // deleting free-throw makes. The old version added or removed made free
  // throws without their attempts, which quietly dragged every player's
  // FT% down (and occasionally past 100% the other way).
  if (residual > 0 && boxes.length > 0) {
    // Each extra point goes to a player picked in proportion to how much
    // he's already scoring, so the corrections follow the game's usage.
    const pool = boxes.filter(b => b.min > 0);
    const weight = b => b.pts + 1;
    const pick = () => {
      const total = pool.reduce((n, b) => n + weight(b), 0);
      let r = Math.random() * total;
      for (const b of pool) { r -= weight(b); if (r <= 0) return b; }
      return pool[0] || boxes[0];
    };
    let guard = 0;
    while (residual > 0 && guard++ < 200) {
      const b = pick();
      if (residual >= 2) { b.twoPm++; b.twoPa++; b.fgm++; b.fga++; b.pts += 2; residual -= 2; }         // one more bucket
      else { b.ftm++; b.fta++; b.pts++; residual--; }                                                  // one more trip to the line
    }
  }

  // Taking points away is spread across the scorers the same way, one
  // shot at a time, rather than always docking the top scorer first.
  let tries = 0;
  while (residual < 0 && tries++ < 400) {
    const scorers = boxes.filter(b => b.pts > 0);
    if (!scorers.length) break;
    const total = scorers.reduce((n, b) => n + b.pts, 0);
    let r = Math.random() * total, b = scorers[0];
    for (const x of scorers) { r -= x.pts; if (r <= 0) { b = x; break; } }
    if (residual <= -2 && b.twoPm > 0 && (b.ftm === 0 || Math.random() < 0.6)) { b.twoPm--; b.fgm--; b.pts -= 2; residual += 2; }  // a make rims out
    else if (b.ftm > 0 && b.fta > 0) { b.ftm--; b.fta--; b.pts--; residual++; }                                               // one fewer trip to the line
    else if (residual <= -3 && b.threePm > 0) { b.threePm--; b.fgm--; b.pts -= 3; residual += 3; }
    else if (residual <= -2 && b.twoPm > 0) { b.twoPm--; b.fgm--; b.pts -= 2; residual += 2; }
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
  const room = boxes.filter(b => b.min > 0 && (b[key] || 0) < ceiling);
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
// An offensive rebound is nearly always a put-back attempt, and a player
// takes other shots besides. So a player's field goal attempts should
// never sit below his offensive rebounds — a line like 4 OREB on 2 FGA
// describes something that doesn't happen. Any excess is moved to the
// defensive glass, where the board still counts but implies no shot.
function capOffensiveRebounds(boxes) {
  boxes.forEach(b => {
    const oreb = b.oreb || 0;
    const fga = b.fga || 0;
    if (oreb <= fga) return;
    const excess = oreb - fga;
    b.oreb = fga;
    b.dreb = (b.dreb || 0) + excess;
  });
  return boxes;
}

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
    // Only teammates who actually played can take the extra shots.
    const room = boxes.filter(x => x !== b && x.min > 0 && (x.fga || 0) < ceiling)
      .sort((x, y) => (x.fga || 0) - (y.fga || 0));
    if (room.length === 0) return;
    let i = 0;
    // Threes go to the teammates who shoot them, in proportion to how much;
    // a center who never shoots one isn't handed a guard's leftover threes.
    const shooters = room.filter(x => (x.threePa || 0) > 0).sort((x, y) => (y.threePa || 0) - (x.threePa || 0));
    const give = (attKey, madeKey, dAtt, dMade) => {
      const to = attKey === 'threePa' && shooters.length ? shooters : room;
      for (let n = 0; n < dAtt; n++) {
        const t = to[i % to.length]; i++;
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

// ------------------------------------------------------------
// Possession-consistent box scores.
//
// The raw boxes above decide each player's SHARE of the action: who shoots,
// who rebounds, who handles the ball. The team totals, though, have to
// describe a game that could actually have been played, or a play-by-play
// can't be built from them:
//
//   * both teams get the same number of possessions (a team that scores
//     less misses more; it doesn't shoot less),
//   * every rebound comes off a real miss, split between the shooting
//     team's offensive boards and the other team's defensive boards,
//   * steals come out of the other team's turnovers, blocks out of its
//     missed twos, and every free-throw trip has someone who fouled.
//
// So the team lines are solved from possessions and the final score, then
// handed back to the players in proportion to their raw lines.
// ------------------------------------------------------------

const REB_CREDIT = 0.98;       // share of missed shots credited to a player (the rest are team rebounds)
const POINTS_PER_POSS = 1.045;  // league-average efficiency, sets how many possessions a game has
const LAST_FT_MISS = 0.55;     // share of missed free throws that are the last of a trip

function sumKey(boxes, k) { return boxes.reduce((n, b) => n + (b[k] || 0), 0); }

// Integer shares of `total` in proportion to `weights` (largest remainder).
function shareOut(total, weights) {
  const n = weights.length;
  const out = new Array(n).fill(0);
  if (total <= 0 || n === 0) return out;
  let w = weights.map(x => Math.max(0, x || 0));
  let wsum = w.reduce((a, b) => a + b, 0);
  if (wsum <= 0) { w = w.map(() => 1); wsum = n; }
  const raw = w.map(x => (x / wsum) * total);
  let given = 0;
  raw.forEach((x, i) => { out[i] = Math.floor(x); given += out[i]; });
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; given < total; k = (k + 1) % n) { out[order[k][1]]++; given++; }
  return out;
}

// Hands out `count` makes among the shooters. Each player's touch (his
// shooting tonight, read against what he usually shoots) is moved up or
// down by the same few points until the makes add up, so a team's cold
// night costs everyone about the same percentage points: a 67% finisher
// lands around 62 when his guards drop from 46 to 41. (Scaling every
// player's percentage by the same factor punished efficient bigs most,
// and drawing makes one at a time pulled every shooter toward the team
// average.) The fractions are rounded with a little chance, game to game.
function dealMakes(count, attempts, pct, rnd) {
  const n = attempts.length;
  const made = attempts.map(() => 0);
  const att = attempts.map(a => Math.max(0, a || 0));
  const totalAtt = att.reduce((x, a) => x + a, 0);
  count = Math.min(count, totalAtt);
  if (count <= 0 || !n) return made;
  const p = pct.map(v => Math.max(0.02, Math.min(0.98, v || 0)));
  const sumAt = d => att.reduce((x, a, i) => x + a * Math.max(0, Math.min(1, p[i] + d)), 0);
  let lo = -1, hi = 1;
  for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (sumAt(mid) < count) lo = mid; else hi = mid; }
  const target = att.map((a, i) => a * Math.max(0, Math.min(1, p[i] + hi)));
  let given = 0;
  target.forEach((t, i) => { made[i] = Math.min(att[i], Math.floor(t)); given += made[i]; });
  const order = target.map((t, i) => [t - Math.floor(t) + (rnd() - 0.5) * 0.5, i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; given < count && k < n * 4; k++) {
    const i = order[k % n][1];
    if (made[i] < att[i]) { made[i]++; given++; }
  }
  while (given > count) { const i = made.indexOf(Math.max(...made)); made[i]--; given--; }
  return made;
}

// Moves any amount above each player's `cap` to teammates with room.
function spill(values, caps, weights) {
  let excess = 0;
  values.forEach((v, i) => { if (v > caps[i]) { excess += v - caps[i]; values[i] = caps[i]; } });
  let guard = 0;
  while (excess > 0 && guard++ < 500) {
    const room = values.map((v, i) => (caps[i] - v > 0 ? Math.max(0.01, weights[i] || 0) : 0));
    const total = room.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let r = Math.random() * total, pick = 0;
    for (let i = 0; i < room.length; i++) { r -= room[i]; if (r <= 0) { pick = i; break; } }
    values[pick]++; excess--;
  }
  return values;
}

// Solves one team's line: attempts from possessions, makes from the score.
function solveTeamLine(raw, score, poss, orbRate, rnd) {
  const tov = Math.max(3, Math.min(26, sumKey(raw, 'tov')));
  const fta = sumKey(raw, 'fta');
  let ftm = sumKey(raw, 'ftm');
  const r2a = sumKey(raw, 'twoPa'), r3a = sumKey(raw, 'threePa');
  const p2 = Math.min(0.68, Math.max(0.36, r2a ? sumKey(raw, 'twoPm') / r2a : 0.5));
  const p3 = Math.min(0.48, Math.max(0.2, r3a ? sumKey(raw, 'threePm') / r3a : 0.33));
  const par = Math.min(0.6, Math.max(0.12, (r2a + r3a) ? r3a / (r2a + r3a) : 0.37));
  let oreb = 10, fga = 0, threePa = 0, twoPa = 0, threePm = 0, twoPm = 0;
  for (let iter = 0; iter < 4; iter++) {
    fga = Math.max(34, Math.round(poss + oreb - tov - 0.475 * fta));
    threePa = Math.round(fga * par);
    twoPa = fga - threePa;
    const need = Math.max(0, score - ftm);
    const expected = 2 * twoPa * p2 + 3 * threePa * p3;
    const m = expected > 0 ? need / expected : 1;
    threePm = Math.max(0, Math.min(threePa, Math.round(threePa * Math.min(0.62, p3 * m))));
    // Points from twos must be even: trade a three or a free throw to fix parity.
    if ((need - 3 * threePm) % 2 !== 0) {
      if (threePm > 0 && (threePm < threePa ? rnd() < 0.5 : true)) threePm--;
      else if (threePm < threePa) threePm++;
      else if (ftm > 0) ftm--;
      else if (ftm < fta) ftm++;
    }
    twoPm = (Math.max(0, score - ftm) - 3 * threePm) / 2;
    // Keep makes within attempts, moving points between twos and threes.
    while (twoPm > twoPa && threePm + 2 <= threePa) { threePm += 2; twoPm -= 3; }
    while (twoPm < 0 && threePm >= 2) { threePm -= 2; twoPm += 3; }
    if (twoPm > twoPa) twoPa = twoPm;               // extreme night: a few extra attempts
    if (twoPm < 0) twoPm = 0;
    const misses = (twoPa + threePa) - (twoPm + threePm);
    const chances = misses + LAST_FT_MISS * (fta - ftm);
    oreb = Math.round(orbRate * REB_CREDIT * chances);
  }
  fga = twoPa + threePa;
  const misses = fga - (twoPm + threePm);
  const chances = misses + LAST_FT_MISS * (fta - ftm);
  const credited = Math.min(misses + (fta - ftm), Math.round(REB_CREDIT * chances));
  oreb = Math.min(oreb, credited, misses);
  return { fga, twoPa, threePa, twoPm, threePm, fta, ftm, tov, oreb, oppDreb: credited - oreb, twoMiss: twoPa - twoPm };
}

// Rebuilds a team's player boxes around its solved line.
// touch: [twoPPct, threePPct] per player (his season expectations), the
// prior his shooting tonight is read against.
function dealTeamLine(raw, line, dreb, oppTov, oppTwoMiss, oppFta, rnd, touch) {
  const idx = raw.map((b, i) => i).filter(i => raw[i].min > 0);
  const out = raw.map(b => ({ ...b }));
  if (!idx.length) return out;
  const pick = key => idx.map(i => raw[i][key] || 0);
  const at = (arr, fn) => arr.forEach((v, k) => fn(idx[k], v));

  const w2 = pick('twoPa').map((x, k) => x + raw[idx[k]].min * 0.02);
  const w3 = pick('threePa');
  const twoPa = shareOut(line.twoPa, w2);
  const threePa = shareOut(line.threePa, w3.some(x => x > 0) ? w3 : pick('fga'));
  // Touch: a player's raw shooting this game, pulled toward what he
  // usually shoots. (Pulling everyone toward the league average flattened
  // the difference between a 65% finisher and a 45% shooter every night,
  // which is what kept efficient bigs from ever shooting like themselves.)
  const prior = (i, j, dflt) => { const v = touch && touch[i] ? Number(touch[i][j]) : NaN; return v > 0 && v < 1 ? v : dflt; };
  const t2 = idx.map(i => (raw[i].twoPm + prior(i, 0, 0.5) * 4) / (raw[i].twoPa + 4));
  const t3 = idx.map(i => (raw[i].threePm + prior(i, 1, 0.34) * 4) / (raw[i].threePa + 4));
  const twoPm = dealMakes(line.twoPm, twoPa, t2, rnd);
  const threePm = dealMakes(line.threePm, threePa, t3, rnd);
  // Whatever makes couldn't be placed (every shooter full) go to anyone with room.
  const fix = (made, att, total) => { let left = total - made.reduce((a, b) => a + b, 0); for (let k = 0; left > 0 && k < made.length * 4; k++) { const j = k % made.length; if (made[j] < att[j]) { made[j]++; left--; } } };
  fix(twoPm, twoPa, line.twoPm); fix(threePm, threePa, line.threePm);

  // Free throws: raw lines, with the team parity fix applied to the leader.
  const ftm = pick('ftm'), fta = pick('fta');
  let dFt = line.ftm - ftm.reduce((a, b) => a + b, 0);
  for (let k = 0; dFt !== 0 && k < 200; k++) {
    const j = Math.floor(rnd() * ftm.length);
    if (dFt < 0 && ftm[j] > 0) { ftm[j]--; dFt++; }
    else if (dFt > 0 && ftm[j] < fta[j]) { ftm[j]++; dFt--; }
  }

  const fgaEach = twoPa.map((x, k) => x + threePa[k]);
  const fgmEach = twoPm.map((x, k) => x + threePm[k]);
  const fgmTeam = fgmEach.reduce((a, b) => a + b, 0);
  // Offensive boards can't exceed a player's own shots; defensive boards
  // come off the other team's misses.
  const orebEach = spill(shareOut(line.oreb, pick('oreb').map((x, k) => x + raw[idx[k]].reb * 0.15)), fgaEach.map(x => Math.max(0, x)), pick('reb'));
  const drebEach = shareOut(dreb, pick('dreb').map((x, k) => x + 0.05));
  const astTotal = Math.min(sumKey(raw, 'ast'), Math.floor(fgmTeam * 0.62));
  const astEach = spill(shareOut(astTotal, pick('ast')), fgmEach.map(x => fgmTeam - x), pick('ast'));
  const stlEach = shareOut(Math.min(sumKey(raw, 'stl'), oppTov), pick('stl'));
  const blkEach = shareOut(Math.min(sumKey(raw, 'blk'), Math.max(0, oppTwoMiss)), pick('blk'));
  // Every trip to the line needs a fouler; five fouls is the limit.
  const pfNeed = Math.max(sumKey(raw, 'pf'), Math.ceil(oppFta / 2));
  const pfEach = spill(shareOut(pfNeed, pick('pf').map((x, k) => x + raw[idx[k]].min * 0.05)), idx.map(() => 5), idx.map(i => raw[i].min));

  const dealt = { twoPa, threePa, twoPm, threePm, ftm, oreb: orebEach, dreb: drebEach, ast: astEach, stl: stlEach, blk: blkEach, pf: pfEach };
  Object.keys(dealt).forEach(key => at(dealt[key], (i, v) => { out[i][key] = v; }));
  idx.forEach(i => {
    const b = out[i];
    b.fgm = b.twoPm + b.threePm; b.fga = b.twoPa + b.threePa;
    b.reb = b.oreb + b.dreb;
    b.pts = b.twoPm * 2 + b.threePm * 3 + b.ftm;
  });
  return out;
}

function buildConsistentBoxes(homeRaw, awayRaw, homeScore, awayScore, opts = {}) {
  const rnd = opts.rng || Math.random;
  // Shares first: the old caps keep any one player from swallowing a
  // team's rebounds, assists or shots.
  const prep = raw => {
    let b = raw.map(x => ({ ...x }));
    b = capIndividualShare(b, 'reb', 0.31);
    b = resyncRebounds(b);
    b = capIndividualShare(b, 'ast', 0.72);
    b = capShotVolume(b, 0.315);
    return b;
  };
  const H = prep(homeRaw), A = prep(awayRaw);
  // How efficient each roster is tonight, against the league (opts.effNorm:
  // points per shooting possession across the league's expectations). An
  // efficient team reaches its score on fewer possessions, so its shooters
  // keep their percentages. With a league-average norm, every team was
  // given league-average possessions, and the score then dragged a roster
  // of efficient finishers down by several points apiece.
  // The norm is learned from the games themselves (opts.effAcc, a running
  // total kept by the caller) once there are enough of them, so league
  // possessions stay where they were; opts.effNorm seeds it.
  const acc = opts.effAcc;
  const loadOf = b => sumKey(b, 'fga') + 0.44 * sumKey(b, 'fta') + sumKey(b, 'tov');
  const norm = acc && acc.load > 2000 ? acc.pts / acc.load : opts.effNorm;
  const relEff = b => {
    if (!norm) return 1;
    const pts = sumKey(b, 'pts'), load = loadOf(b);
    return load > 0 ? Math.max(0.86, Math.min(1.16, (pts / load) / norm)) : 1;
  };
  if (acc) [H, A].forEach(b => { acc.pts += sumKey(b, 'pts'); acc.load += loadOf(b); });
  const implied = (score, b) => score / (POINTS_PER_POSS * relEff(b));
  const lenK = (opts.gameMinutes || 40) / 40;
  const poss = Math.max(Math.round(56 * lenK), Math.min(Math.round(84 * lenK), Math.round((implied(homeScore, H) + implied(awayScore, A)) / 2 + (rnd() - 0.5) * 3)));
  const orb = (off, def) => {
    const o = sumKey(off, 'oreb'), d = sumKey(def, 'dreb');
    return Math.min(0.42, Math.max(0.2, o + d > 0 ? o / (o + d) : 0.29));
  };
  const hl = solveTeamLine(H, homeScore, poss, orb(H, A), rnd);
  const al = solveTeamLine(A, awayScore, poss, orb(A, H), rnd);
  const touch = opts.touch || {};
  const homeBoxes = dealTeamLine(H, hl, al.oppDreb, al.tov, al.twoMiss, al.fta, rnd, touch.home);
  const awayBoxes = dealTeamLine(A, al, hl.oppDreb, hl.tov, hl.twoMiss, hl.fta, rnd, touch.away);
  // Put the per-player caps back where the deal pushed past them.
  // Offensive boards that no longer fit a player's shots move to a teammate
  // who shot more, so the team's offensive rebounds stay on its own misses.
  const post = b => {
    b = capShotVolume(b, 0.33).map(x => ({ ...x, fgm: x.twoPm + x.threePm, fga: x.twoPa + x.threePa }));
    const played = b.map((x, i) => i).filter(i => b[i].min > 0);
    const o = played.map(i => b[i].oreb || 0);
    spill(o, played.map(i => b[i].fga), played.map(i => b[i].fga));
    played.forEach((i, k) => { b[i].oreb = o[k]; });
    return b.map(x => ({ ...x, reb: (x.oreb || 0) + (x.dreb || 0), pts: x.twoPm * 2 + x.threePm * 3 + x.ftm }));
  };
  return { homeBoxes: post(homeBoxes), awayBoxes: post(awayBoxes), possessions: poss };
}

// A team plays exactly 200 minutes and nobody plays more than 40.
// Each player's minutes are drawn on their own (his role, a little
// variance, extra when teammates are out), so without this a team's
// total drifted anywhere from the 180s to the 220s and a starter could
// log 50 minutes in a regulation game. Minutes are scaled to fit, capped,
// the overflow handed to the others who played, and rounded so the total
// is exact. Nobody who sat is put in.
function fitMinutes(boxes, total = 200, cap = 40) {
  const idx = boxes.map((b, i) => i).filter(i => (boxes[i].min || 0) > 0);
  if (!idx.length) return boxes;
  let want = idx.map(i => boxes[i].min);
  const room = Math.min(total, cap * idx.length);
  // Short of the total: the extra goes where there's room, so the bench
  // picks up more of it than a starter already near 36.
  let short = room - want.reduce((n, v) => n + v, 0);
  for (let pass = 0; pass < 6 && short > 1e-6; pass++) {
    const w = want.map(v => Math.max(0, v * (36 - v)));
    const tw = w.reduce((n, x) => n + x, 0);
    if (!tw) break;
    want = want.map((v, k) => v + short * w[k] / tw);
    short = 0;
    want = want.map(v => { if (v > cap) { short += v - cap; return cap; } return v; });
  }
  for (let pass = 0; pass < 8; pass++) {
    const capped = want.map(v => v >= cap);
    const fixed = want.reduce((n, v, k) => n + (capped[k] ? cap : 0), 0);
    const free = want.reduce((n, v, k) => n + (capped[k] ? 0 : v), 0);
    if (free <= 0) break;
    const scale = (room - fixed) / free;
    want = want.map((v, k) => (capped[k] ? cap : Math.min(cap, v * scale)));
    if (Math.abs(want.reduce((n, v) => n + v, 0) - room) < 1e-6) break;
  }
  const floor = want.map(v => Math.max(1, Math.floor(v)));
  let left = room - floor.reduce((n, v) => n + v, 0);
  const order = want.map((v, k) => ({ k, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r);
  for (let j = 0; left > 0 && j < order.length * 2; j++) {
    const k = order[j % order.length].k;
    if (floor[k] < cap) { floor[k]++; left--; }
  }
  for (let j = order.length - 1; left < 0 && j >= 0; j--) {
    const k = order[j].k;
    if (floor[k] > 1) { floor[k]--; left++; }
  }
  idx.forEach((i, k) => { boxes[i].min = floor[k]; });
  return boxes;
}

// Simulates one game between two teams. Returns final scores and a
// per-player box score for everyone who played, reconciled so each
// team's total points exactly equals its final score.
function simulateSingleGame(homeTeam, awayTeam, opts = {}) {
  const { homeCourtEdge = 3.0, marginScale = 0.85, marginVarianceStd = 11, paceBase = 146, paceVarianceStd = 9 } = opts;

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

  // A caller that knows what these two rosters score (the summer circuit,
  // where lines come from what each player is written to have done) passes
  // the expected total; otherwise it comes from the teams' quality.
  const gameMinutes = opts.gameMinutes || 40;
  const totalPoints = opts.expectedTotal
    ? Math.max(70 * gameMinutes / 40, opts.expectedTotal + gaussian() * paceVarianceStd)
    : Math.max(90, (paceBase + qualityAdj) * paceMult + gaussian() * paceVarianceStd);

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
  homeScore = Math.max(Math.round(35 * gameMinutes / 40), homeScore);
  awayScore = Math.max(Math.round(35 * gameMinutes / 40), awayScore);
  if (homeScore === awayScore) homeScore += 1; // no ties in regulation-only v1 model

  const homeRoster = homeTeam.simData.rosterRef || homeTeam.roster;
  const awayRoster = awayTeam.simData.rosterRef || awayTeam.roster;

  const homeBoost = opts.homeMinutesMultiplier || 1;
  const awayBoost = opts.awayMinutesMultiplier || 1;
  // A boost is either one number for the whole roster or, per player, a
  // function (so an injury's minutes can go mostly to the bench).
  const boostOf = (b, p) => (typeof b === 'function' ? b(p) : b);
  const homeRaw = homeRoster.map(p => ({ player: p, box: generateRawPlayerBox(p, boostOf(homeBoost, p)) }));
  const awayRaw = awayRoster.map(p => ({ player: p, box: generateRawPlayerBox(p, boostOf(awayBoost, p)) }));

  // Both teams' lines are built together: possessions, rebounds, steals
  // and fouls all depend on what the other team did.
  const touchOf = list => list.map(x => { const e = x.player.expectedStats || {}; return [parseFloat(e.twoPPct), parseFloat(e.threePPct)]; });
  const { homeBoxes, awayBoxes } = buildConsistentBoxes(homeRaw.map(x => x.box), awayRaw.map(x => x.box), homeScore, awayScore, { touch: { home: touchOf(homeRaw), away: touchOf(awayRaw) }, effNorm: opts.effNorm, effAcc: opts.effAcc, gameMinutes });
  [homeBoxes, awayBoxes].forEach(b => fitMinutes(b, 5 * gameMinutes, gameMinutes));

  return {
    homeScore, awayScore,
    homePlayerBoxes: homeRaw.map((x, i) => ({ player: x.player, box: homeBoxes[i] })),
    awayPlayerBoxes: awayRaw.map((x, i) => ({ player: x.player, box: awayBoxes[i] }))
  };
}

const GameCore = { expectedLoad, fitMinutes, generateRawPlayerBox, reconcileTeamScore, capTeamAssists, capIndividualShare, capShotVolume, capOffensiveRebounds, buildConsistentBoxes, simulateSingleGame, getZeroBox };

if (typeof module !== 'undefined' && module.exports) module.exports = GameCore;
else if (typeof window !== 'undefined') window.GameCore = GameCore;
