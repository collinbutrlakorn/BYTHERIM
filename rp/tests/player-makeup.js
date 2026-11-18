// Player makeup: bodies that fill out, pure three-point specialists and
// volume-shooting freshmen, and consistency (game to game, season to season,
// and what it's worth to a team and a scout).
const fs = require('fs');
const path = require('path');
const JS = path.join(__dirname, '..', 'js');
global.window = global;
eval(fs.readFileSync(path.join(JS, 'teams-master.js'), 'utf8').replace(/^const TeamsMaster/m, 'global.TeamsMaster'));
global.RosterGen = require(path.join(JS, 'roster-gen.js'));
require(path.join(JS, 'prestige.js'));
const PC = global.PlayerCore = require(path.join(JS, 'player-core.js'));
const DC = require(path.join(JS, 'draft-core.js'));
const G = require(path.join(JS, 'recruit-gen.js'));
const GC = require(path.join(JS, 'game-core.js'));
const { boot, playSeason, playOffseason, ok } = require('./harness');
const FIX = path.join(__dirname, 'fixtures');

const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const names = n => Array.from({ length: n }, (_, i) => `Test Player ${i} Smith${i % 97}`);

(async () => {
  // ---- Consistency is a stable trait with a wide spread ----
  {
    const cons = names(3000).map(nm => PC.consistencyOf({ name: nm, class: 'JR', rating: 75 }));
    ok(cons.every((c, i) => c === PC.consistencyOf({ name: names(3000)[i], class: 'JR', rating: 75 })), 'a player is exactly as consistent every time he is looked at');
    ok(Math.abs(mean(cons) - 52) < 4 && sd(cons) > 15 && sd(cons) < 26, `consistency is centred with a wide spread (mean ${mean(cons).toFixed(1)}, sd ${sd(cons).toFixed(1)})`);
    ok(cons.filter(c => c >= 80).length > 3000 * 0.06 && cons.filter(c => c < 20).length > 3000 * 0.04, 'there are plenty of rock-solid players and plenty of boom-or-bust ones');
    const same = { name: 'Same Guy', rating: 75 };
    ok(PC.consistencyOf({ ...same, class: 'SR' }) > PC.consistencyOf({ ...same, class: 'FR' }), 'veterans are steadier than freshmen');
    ok(PC.consistencyOf({ ...same, class: 'JR', rating: 90 }) > PC.consistencyOf({ ...same, class: 'JR', rating: 60 }), 'better players are steadier');
    ok(PC.consistencyOf({ ...same, class: 'JR', traits: { strengths: [], weaknesses: ['Streaky Shooter'] } }) < PC.consistencyOf({ ...same, class: 'JR' }), 'a streaky shooter is less consistent');
    ok(PC.consistencyOf({ ...same, class: 'JR', traits: { strengths: ['IQ'], weaknesses: [] } }) > PC.consistencyOf({ ...same, class: 'JR' }), 'a high-IQ player is steadier');
    ok(PC.consistencyLabel(90) === 'Rock solid' && PC.consistencyLabel(10) === 'Boom-or-bust' && PC.consistencyLabel(50) === 'Average', 'consistency reads as a scouting label');
    ok(PC.consistencyImpact(90) > 0.5 && PC.consistencyImpact(10) < -0.5 && Math.abs(PC.consistencyImpact(50)) < 0.01, 'a consistent player is worth rating points to his team, an erratic one costs them');
  }

  // ---- Game to game: erratic players swing, steady ones do not, and the average is the same ----
  {
    const base = { mpg: '30.0', ppg: '15.0', rpg: '5.0', apg: '3.0', stl: '1.0', blk: '0.3', tov: '2.0', pf: '2.0', fta: '4.0', ftPct: '0.75', threePar: '0.40', threePPct: '0.35', twoPPct: '0.50' };
    const run = cons => {
      const pts = [], reb = [], tpa = [];
      for (let i = 0; i < 4000; i++) { const b = GC.generateRawPlayerBox({ expectedStats: { ...base, cons } }); pts.push(b.pts); reb.push(b.reb); tpa.push(b.threePa); }
      return { pts, reb, tpa };
    };
    const lo = run(8), mid = run(50), hi = run(92);
    const cv = a => sd(a) / mean(a);
    ok(cv(lo.pts) > cv(mid.pts) * 1.12 && cv(mid.pts) > cv(hi.pts) * 1.15 && cv(lo.pts) > cv(hi.pts) * 1.4, `scoring swings with inconsistency (cv ${cv(hi.pts).toFixed(2)} steady, ${cv(mid.pts).toFixed(2)} average, ${cv(lo.pts).toFixed(2)} erratic)`);
    ok(cv(lo.reb) > cv(hi.reb) * 1.2 && cv(lo.tpa) > cv(hi.tpa) * 1.4, 'rebounds and three-point attempts swing with it too');
    ok(cv(mid.pts) > 0.36, `an average player is more erratic than before (cv ${cv(mid.pts).toFixed(2)}; it was ~0.32)`);
    ok(Math.abs(mean(lo.pts) / mean(hi.pts) - 1) < 0.04 && Math.abs(mean(mid.pts) / mean(hi.pts) - 1) < 0.04, `...but the average night is the same (${mean(hi.pts).toFixed(1)} / ${mean(mid.pts).toFixed(1)} / ${mean(lo.pts).toFixed(1)} points)`);
    ok(Math.max(...lo.pts) <= 70 && Math.max(...mid.pts) <= 62, `no 100-point nights (best erratic game ${Math.max(...lo.pts)})`);
    // A player with no consistency on file plays like an average one.
    const none = []; for (let i = 0; i < 4000; i++) none.push(GC.generateRawPlayerBox({ expectedStats: { ...base } }).pts);
    ok(Math.abs(cv(none) - cv(mid.pts)) < 0.05, 'a line without a consistency figure plays like an average player');
  }

  // ---- Season to season ----
  {
    const p = { name: 'Season Form', class: 'JR', rating: 75 };
    const f = PC.seasonForm(p, 2030, 30), g = PC.seasonForm(p, 2030, 30), h = PC.seasonForm(p, 2031, 30);
    ok(JSON.stringify(f) === JSON.stringify(g) && JSON.stringify(f) !== JSON.stringify(h), 'a player-season is the same every time it is rebuilt, and different from the next');
    const spread = cons => sd(names(1500).map(nm => PC.seasonForm({ name: nm }, 2031, cons).p3));
    ok(spread(10) > spread(50) * 1.3 && spread(50) > spread(92) * 1.5, `the erratic shoot very different percentages year to year (sd ${spread(92).toFixed(3)} steady, ${spread(50).toFixed(3)}, ${spread(10).toFixed(3)} erratic)`);
    const usage = cons => sd(names(1500).map(nm => PC.seasonForm({ name: nm }, 2031, cons).use));
    ok(usage(10) > usage(92) * 2, 'and carry very different shares of the offense');
    ok(PC.developmentSwing(5).noise > PC.developmentSwing(95).noise * 2 && PC.developmentSwing(5).jump > PC.developmentSwing(95).jump * 2, 'erratic players develop erratically: bigger swings, more breakouts and stalls');
  }

  // ---- Three-point specialists: rare in the high-majors, common in the low ----
  {
    const rate = (pos, tier, rating = 70) => mean(names(6000).map(nm => PC.shotRoleOf({ name: nm + pos + tier, pos, rating, class: 'JR' }, tier) === 'spot' ? 1 : 0));
    const pw = rate('SG', 'power'), md = rate('SG', 'mid'), lw = rate('SG', 'low');
    ok(lw > md && md > pw && pw < 0.03 && lw > 0.06, `specialists are rare in the high-majors and common in the low (SG: ${(pw * 100).toFixed(1)}% / ${(md * 100).toFixed(1)}% / ${(lw * 100).toFixed(1)}%)`);
    ok(rate('C', 'low') === 0 && rate('PG', 'low') === 0 && rate('CG', 'low') === 0 && rate('SG', 'low') > 0.06 && rate('SF', 'low') > 0.04 && rate('PF', 'low') > 0.025, 'guards who run the offense and centres are not specialists; shooting guards, wings and the odd forward are');
    ok(rate('SG', 'mid', 90) < rate('SG', 'mid', 70) / 2, 'stars are not specialists');
    const r = { name: 'Fixed Role', pos: 'SG', rating: 70, class: 'JR' };
    const first = PC.shotRoleOf(r, 'low');
    ok(PC.shotRoleOf(r, 'power') === first && r.shotRole === first, 'a role sticks to him when he changes schools');
    const fx = PC.shotRoleEffects({ name: 'Spot', class: 'JR' }, 'spot');
    ok(fx.par >= 0.70 && fx.par <= 0.90 && fx.apg <= 0.75 && fx.fta < 0.5, 'a specialist takes 70-90% of his shots from three and does little else');
    const vol = n => mean(names(4000).map(nm => PC.shotRoleOf({ name: nm, pos: 'SG', rating: 75, class: n }, 'mid') === 'volume' ? 1 : 0));
    ok(vol('FR') > 0.08 && vol('SO') === 0 && vol('JR') === 0, `volume shooters are freshmen (${(vol('FR') * 100).toFixed(1)}% of freshman guards)`);
    ok(PC.shotRoleEffects({ name: 'V', class: 'FR' }, 'volume').parAdd > 0.09 && PC.shotRoleEffects({ name: 'V', class: 'FR' }, 'volume').pct < -0.029, 'a volume freshman shoots more threes and makes fewer of them');
    ok(PC.shotRoleEffects({ name: 'V', class: 'JR' }, 'volume') === null, 'and grows out of it');
  }

  // ---- Bodies ----
  {
    const gain = (pos, cls, dob) => { const out = []; for (let i = 0; i < 2500; i++) { const p = { name: `B${i}${pos}`, pos, class: cls, wt: '200', dob }; out.push(PC.growBody(p)); } return out; };
    const g = gain('SG', 'SO', '3/1/2008'), f = gain('PF', 'SO', '3/1/2008'), c = gain('C', 'SO', '3/1/2008');
    ok(mean(f) > mean(g) * 1.5 && mean(c) > mean(g) * 1.5, `forwards and bigs fill out more than guards (a year as a sophomore: SG ${mean(g).toFixed(1)}, PF ${mean(f).toFixed(1)}, C ${mean(c).toFixed(1)} lb)`);
    ok(mean(gain('PF', 'SO', '3/1/2008')) > mean(gain('PF', 'SR', '3/1/2008')) * 1.5, 'the biggest jump is after the first year');
    const young = mean(gain('SF', 'SO', '8/20/2008')), old = mean(gain('SF', 'SO', '9/5/2007'));
    ok(young > old + 1.2, `the youngest in a class keep filling out longer (${young.toFixed(1)} vs ${old.toFixed(1)} lb)`);
    const all = gain('SG', 'JR', '3/1/2008');
    ok(all.filter(x => x >= 0).length / all.length > 0.9 && all.some(x => x < 0), 'players nearly always gain, and once in a while a guard or wing slims down');
    const capped = []; for (let i = 0; i < 300; i++) { const p = { name: `Cap${i}`, pos: 'SG', class: 'SO', wt: '240' }; capped.push(PC.growBody(p)); }
    ok(mean(capped) < 1, 'a player already at the top of his position stops gaining');
    const p = { name: 'Fmt', pos: 'C', class: 'SO', wt: '230 lbs' };
    PC.growBody(p); ok(/lbs$/.test(p.wt) || p.wt === '230 lbs', 'a weight keeps its format ("230 lbs")');
    const p2 = { name: 'NoWt', pos: 'C', class: 'SO' };
    ok(PC.growBody(p2) === 0 && PC.enrollGain(p2) === 0 && p2.wt === undefined, 'a player with no weight is left alone');

    // High-school graduation to the first practice.
    const eg = (pos, dob) => { const out = []; for (let i = 0; i < 2500; i++) out.push(PC.enrollGain({ name: `E${i}${pos}${dob}`, pos, wt: '195', dob })); return out; };
    const youngE = eg('SF', '8/20/2008'), oldE = eg('SF', '9/5/2007');
    ok(youngE.every(x => x >= 0) && oldE.every(x => x >= 0), 'a summer in a college weight room only adds weight');
    ok(mean(youngE) > mean(oldE) + 3 && mean(oldE) > 1, `the youngest add the most (${mean(youngE).toFixed(1)} lb vs ${mean(oldE).toFixed(1)} lb for the oldest)`);
    ok(mean(eg('C', '3/1/2008')) > mean(eg('PG', '3/1/2008')), 'bigs add more than point guards');
    ok(PC.immatureBodyDeficit('8/25/2008', 'x') >= 6 && PC.immatureBodyDeficit('9/3/2007', 'x') <= 1, 'the youngest recruits are listed lighter in high school');

    // Generated classes: within a position, the youngest are the lightest.
    const rows = Array.from({ length: 60 }, (_, i) => ({ __tab: '2030', rank: String(i + 1), classYear: '2030', name: `Sheet Player ${i + 1}`, state: 'TX', rating: String(Math.round(95 - i * 0.2)), stars: '4', committedSchool: 'Duke', pos: 'SF' }));
    const gen = G.augment(rows, { classes: ['2030'] }).filter(r => r.generated === 'TRUE' && r.dob && r.weight && /^\d+$/.test(r.weight));
    const bucket = (pos, f) => gen.filter(r => r.pos === pos && f(PC.youthOf(r)));
    const lightY = mean(['SG', 'SF', 'PF', 'C'].map(pos => mean(bucket(pos, y => y > 0.75).map(r => parseInt(r.weight, 10)) || [0])).filter(Boolean));
    const lightO = mean(['SG', 'SF', 'PF', 'C'].map(pos => mean(bucket(pos, y => y < 0.25).map(r => parseInt(r.weight, 10)) || [0])).filter(Boolean));
    ok(gen.length > 100 && lightO - lightY > 2.5, `generated recruits who are young for the class are lighter (${lightY.toFixed(1)} vs ${lightO.toFixed(1)} lb; ${gen.length} recruits)`);
  }

  // ---- In the NCAA RP ----
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const { Sim, window: w } = boot({ roster, recruits });
  const d = w.document;
  await Sim.init();
  await Sim.startNewGame();
  w.scrollTo = () => {};
  const S = Sim.state;

  // A projected line for the same player under each role.
  const team = S.teams.find(t => (t.roster || []).length >= 10);
  const guy = team.roster.find(p => ['SG', 'SF'].includes(p.pos) && p.class !== 'FR') || team.roster[0];
  const line = (over, mpg = 28) => Sim.buildBaseStatExpectations({ ...guy, name: 'Role Test', shotRole: 'none', ...over }, mpg, team);
  {
    const base = line({}), spot = line({ shotRole: 'spot' }), vol = line({ shotRole: 'volume', class: 'FR' }), frBase = line({ class: 'FR' });
    ok(spot.threePar >= 0.7 && spot.threePar > base.threePar + 0.2, `a specialist's shots are nearly all threes (3PAr ${spot.threePar.toFixed(2)} vs ${base.threePar.toFixed(2)})`);
    ok(spot.apg < base.apg * 0.8 && spot.fta < base.fta * 0.6 && spot.rpg < base.rpg && spot.tov < base.tov, 'and he passes, rebounds, draws fouls and turns it over less');
    ok(spot.threePPct >= base.threePPct, 'and he is not a worse shooter than the rest');
    ok(vol.threePar > frBase.threePar + 0.08 && vol.threePPct < frBase.threePPct - 0.025, `a volume-shooting freshman shoots more threes and makes fewer (${vol.threePar.toFixed(2)} at ${(vol.threePPct * 100).toFixed(1)}% vs ${frBase.threePar.toFixed(2)} at ${(frBase.threePPct * 100).toFixed(1)}%)`);
    const so = line({ shotRole: 'volume', class: 'SO' }), jr = line({ shotRole: 'volume', class: 'JR' }), jrBase = line({ class: 'JR' });
    ok(so.threePar > jrBase.threePar && Math.abs(jr.threePar - jrBase.threePar) < 0.001, 'it fades by his junior year');
    ok(line({ shotRole: 'spot' }).cons !== undefined && line({}).shotRole === 'none', 'a projected line carries his consistency and role');
  }
  // The same player in two seasons.
  {
    const yr = S.year;
    const a = line({ name: 'Season Guy' }), a2 = line({ name: 'Season Guy' });
    ok(JSON.stringify(a) === JSON.stringify(a2), 'rebuilding a projection in the same season gives the same line');
    S.year = yr + 1;
    const b = line({ name: 'Season Guy' });
    S.year = yr;
    ok(a.threePPct !== b.threePPct && a.ppg !== b.ppg, 'and a different line the next season');
    // Erratic players' lines move more from season to season than steady ones.
    const move = which => {
      const picks = names(900).map(nm => nm).filter(nm => which(PC.consistencyOf({ name: nm, class: guy.class, rating: guy.rating, pos: guy.pos })));
      const diffs = picks.slice(0, 150).map(nm => { S.year = yr; const x = line({ name: nm, class: 'JR' }); S.year = yr + 1; const y = line({ name: nm, class: 'JR' }); S.year = yr; return Math.abs(x.ppg - y.ppg) / x.ppg; });
      return mean(diffs);
    };
    const steady = move(c => c >= 75), erratic = move(c => c <= 28);
    ok(erratic > steady * 1.8, `an erratic player's scoring changes far more from one season to the next (${(erratic * 100).toFixed(1)}% vs ${(steady * 100).toFixed(1)}%)`);
  }
  // Development
  {
    const find = f => names(900).filter(nm => f(PC.consistencyOf({ name: nm, class: 'JR', rating: 75 })));
    const trial = nm => { const out = []; for (let i = 0; i < 300; i++) { const p = { name: nm, class: 'JR', rating: 75, pos: 'SG', potential: 85, stats: { mpg: '28', bpm: '3', totMin: 900 }, ratingHistory: [] }; out.push(Sim.developPlayer(p)); } return out; };
    const steady = [].concat(...find(c => c >= 80).slice(0, 8).map(trial)), erratic = [].concat(...find(c => c <= 22).slice(0, 8).map(trial));
    ok(sd(erratic) > sd(steady) * 1.3, `an erratic player's yearly rating change swings more (sd ${sd(erratic).toFixed(2)} vs ${sd(steady).toFixed(2)})`);
    ok(erratic.filter(x => Math.abs(x - mean(erratic)) >= 5).length > steady.filter(x => Math.abs(x - mean(steady)) >= 5).length * 1.5, 'with far more breakouts and stalls');
    ok(Math.abs(mean(erratic) - mean(steady)) < 0.9, `...but they average out the same (${mean(erratic).toFixed(2)} vs ${mean(steady).toFixed(2)})`);
  }
  // What it's worth
  {
    const steadyName = names(500).find(nm => PC.consistencyOf({ name: nm, class: 'JR', rating: 75 }) >= 85), erraticName = names(500).find(nm => PC.consistencyOf({ name: nm, class: 'JR', rating: 75 }) <= 15);
    const te = nm => Sim.traitEffects({ name: nm, class: 'JR', rating: 75 });
    ok(te(steadyName).impact > te(erraticName).impact + 0.9 && te(steadyName).tov < te(erraticName).tov, `a consistent player is worth more to his team (${te(steadyName).impact.toFixed(2)} vs ${te(erraticName).impact.toFixed(2)} rating points) and turns it over less`);

    const prospect = (c, extra = {}) => ({ id: 'x' + c, name: 'Prospect', school: 'Duke', conference: 'ACC', pos: 'SG', class: 'FR', ht: "6'5", wt: '200', rating: 80, rsci: 20, cons: c,
      stats: { gp: 30, mpg: '28.0', ppg: '15.0', rpg: '4.0', apg: '3.0', stl: '1.0', blk: '0.3', tsPct: '0.57', usg: '24%', p40pts: '21', p40reb: '5', p40ast: '4', p40stl: '1.4', p40blk: '0.4', bpm: '5.0', totMin: 840 }, ...extra });
    const sc = c => DC.scoreProspect(prospect(c), 0.6);
    ok(sc(90).score > sc(10).score + 3.5 && sc(90).score > sc(50).score && sc(50).score > sc(10).score, `scouts value a consistent prospect (score ${sc(10).score.toFixed(1)} erratic, ${sc(50).score.toFixed(1)} average, ${sc(90).score.toFixed(1)} steady)`);
    const board = DC.buildBigBoard([prospect(10, { id: 'a', name: 'Erratic' }), prospect(90, { id: 'b', name: 'Steady' })], () => 0.6, 10);
    ok(board[0].player.name === 'Steady', 'and ranks him ahead of an otherwise identical erratic one');
    ok(DC.scoutingTags(board[0]).includes('Highly consistent') && DC.scoutingTags(board[1]).includes('Boom-or-bust'), 'with a scouting note either way');
    const early = DC.scoreProspect(prospect(90, { stats: { gp: 2, mpg: '20.0' } }), 0.5), earlyLow = DC.scoreProspect(prospect(10, { stats: { gp: 2, mpg: '20.0' } }), 0.5);
    ok(sc(90).consistency - sc(10).consistency > early.consistency - earlyLow.consistency, 'and the read firms up as the games pile up');
    ok(DC.scoreProspect({ ...prospect(50), cons: undefined, isPro: true }, 0.5).consistency === 0, 'a pro with no college tape has no consistency read');
  }

  // A season and an offseason
  await playSeason(Sim);
  const rotation = S.activePlayers.filter(p => parseFloat((p.stats || {}).mpg) >= 12 && (p.stats || {}).gp > 5);
  {
    const level = t => PC.tierOf(DC.competitionFactor(t.conference));
    const tierOfPlayer = p => level(S.teams.find(t => t.school === p.school));
    const rateOf = tier => { const r = rotation.filter(p => tierOfPlayer(p) === tier); return { n: r.length, hi: r.filter(p => parseFloat(p.stats.threePar) >= 0.65).length / Math.max(1, r.length) }; };
    const pw = rateOf('power'), md = rateOf('mid'), lw = rateOf('low');
    ok(lw.n > 300 && lw.hi > md.hi && md.hi >= pw.hi && lw.hi > 0.03 && pw.hi < 0.02, `in a played season, extreme three-point rates are mostly small-school (3PAr 65%+: ${(pw.hi * 100).toFixed(1)}% high-major, ${(md.hi * 100).toFixed(1)}% mid, ${(lw.hi * 100).toFixed(1)}% low)`);
    const spots = rotation.filter(p => p.shotRole === 'spot');
    ok(spots.length > 20 && mean(spots.map(p => parseFloat(p.stats.threePar))) > 0.68, `specialists really do shoot almost only threes (${spots.length} rotation players, avg 3PAr ${mean(spots.map(p => parseFloat(p.stats.threePar))).toFixed(2)})`);
    ok(spots.every(p => !['C', 'F/C'].includes(p.pos)) && spots.some(p => p.pos === 'SG') && spots.some(p => p.pos === 'SF') && spots.some(p => p.pos === 'PF'), 'and they are guards, wings and forwards');
    ok(mean(spots.map(p => parseFloat(p.stats.apg))) < 0.7 * mean(rotation.map(p => parseFloat(p.stats.apg))), 'who rarely create for anyone');
    const league = mean(rotation.map(p => parseFloat(p.stats.threePar)));
    ok(league > 0.34 && league < 0.42, `the league's shot mix is where it was (rotation 3PAr ${league.toFixed(3)})`);
    const frs = rotation.filter(p => p.class === 'FR' && p.shotRole === 'volume');
    const mates = rotation.filter(p => p.class === 'FR' && p.shotRole === 'none' && !['C', 'F/C', 'PF'].includes(p.pos));
    const par = a => mean(a.map(p => parseFloat(p.stats.threePar)));
    ok(frs.length > 5 && par(frs) > par(mates) + 0.04, `volume-shooting freshmen are out there (${frs.length}) and shoot more threes than their classmates (3PAr ${par(frs).toFixed(2)} vs ${par(mates).toFixed(2)})`);
    // Consistency shows up in a season's box scores, too.
    const gameSd = p => { const gl = (p.gameLog || []).filter(g => g.min >= 10); return gl.length >= 15 ? sd(gl.map(g => g.pts)) / Math.max(1, mean(gl.map(g => g.pts))) : null; };
    const steady = rotation.filter(p => PC.consistencyOf(p) >= 75).map(gameSd).filter(x => x != null), erratic = rotation.filter(p => PC.consistencyOf(p) <= 28).map(gameSd).filter(x => x != null);
    ok(steady.length > 20 && erratic.length > 20 && mean(erratic) > mean(steady) * 1.25, `played games bear it out (game-to-game scoring cv ${mean(steady).toFixed(2)} steady vs ${mean(erratic).toFixed(2)} erratic)`);
  }

  // Profile and published data
  {
    const star = rotation.slice().sort((a, b) => parseFloat(b.stats.ppg) - parseFloat(a.stats.ppg))[0];
    Sim.openPlayerPage(star.id);
    const prof = d.getElementById('playerPageBody').innerHTML;
    ok(prof.includes('Consistency') && prof.includes(PC.consistencyLabel(PC.consistencyOf(star))), 'a profile shows how consistent he is');
    const spot = rotation.find(p => p.shotRole === 'spot');
    Sim.openPlayerPage(spot.id);
    ok(/Three-point specialist/.test(d.getElementById('playerPageBody').innerHTML), 'and marks a three-point specialist');
    Sim.closePlayerPage();
    const slim = Sim.slimPlayer(star);
    ok(slim.cons === PC.consistencyOf(star) && 'shotRole' in slim, 'the Draft RP gets his consistency and role');
  }

  // Weight over an offseason
  {
    const before = new Map(); S.activePlayers.forEach(p => before.set(p.id, parseFloat(p.wt)));
    await playOffseason(Sim);
    const rows = []; S.teams.forEach(t => (t.roster || []).forEach(p => { if (before.has(p.id) && isFinite(parseFloat(p.wt)) && !p.enrollGained) rows.push({ pos: PC.groupOf(p.pos), cls: p.class, g: parseFloat(p.wt) - before.get(p.id) }); }));
    const avg = (grp, cls) => mean(rows.filter(r => (grp === null || r.pos === grp) && (!cls || r.cls === cls)).map(r => r.g));
    ok(rows.length > 500 && mean(rows.map(r => r.g)) > 1.5 && mean(rows.map(r => r.g)) < 5, `players put weight on as the years go by (average +${mean(rows.map(r => r.g)).toFixed(1)} lb over ${rows.length} players)`);
    ok(avg('forward') > avg('guard') * 1.3 && avg('big') > avg('guard') * 1.3, `forwards and bigs most (guard +${avg('guard').toFixed(1)}, wing +${avg('wing').toFixed(1)}, forward +${avg('forward').toFixed(1)}, big +${avg('big').toFixed(1)})`);
    ok(avg(null, 'SO') > avg(null, 'JR') && avg(null, 'JR') > avg(null, 'SR'), 'with the biggest jump after the first year, tapering after');
    ok(rows.filter(r => r.g < 0).length / rows.length < 0.08, 'and almost nobody loses weight');
    const arrived = []; S.teams.forEach(t => (t.roster || []).forEach(p => { if (p.enrollGained) arrived.push(p); }));
    ok(arrived.length > 20 && arrived.every(p => p.enrollGain >= 0 && isFinite(parseFloat(p.wt))) && mean(arrived.map(p => p.enrollGain)) > 2 && mean(arrived.map(p => p.enrollGain)) < 9,
      `freshmen arrive heavier than they graduated (${arrived.length} new freshmen, average +${mean(arrived.map(p => p.enrollGain)).toFixed(1)} lb)`);
    const p0 = arrived[0], wt0 = p0.wt;
    Sim.filterActiveData();
    ok(p0.wt === wt0 && p0.enrollGained === true, 'and the gain is only taken once');
  }
})().then(() => { console.log('\nplayer makeup: all checks passed'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
