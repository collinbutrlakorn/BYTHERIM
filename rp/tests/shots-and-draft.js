// Shot zones (rim, dunks, non-rim twos), birthdays, and the draft model's
// combine sizes, combine standouts and the bar for mid-major first-rounders.
// Unit-level and fast: no season is played here (draft-cycle.js checks the
// same things across a played season).
const path = require('path');
const JS = path.join(__dirname, '..', 'js');
global.window = global;
const PC = global.PlayerCore = require(path.join(JS, 'player-core.js'));
const DC = global.DraftCore = require(path.join(JS, 'draft-core.js'));
const CY = require(path.join(JS, 'draft-cycle.js'));
const { ok } = require('./harness');

const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
let seed = 7;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// ---- Shot zones ----
{
  const guard = { name: 'Zone Guard', pos: 'PG', ht: '6-2', playstyle: { archetype: 'shooter' } };
  const big = { name: 'Zone Big', pos: 'C', ht: '7-0', athleticism: 85, playstyle: { archetype: 'rollBig' } };
  let sane = true;
  const sum = { guard: { rimA: 0, dunkA: 0, a: 0 }, big: { rimA: 0, dunkA: 0, a: 0 } };
  for (let i = 0; i < 4000; i++) {
    const a = Math.floor(rng() * 14), m = Math.floor(rng() * (a + 1));
    [['guard', guard], ['big', big]].forEach(([k, p]) => {
      const z = PC.splitTwos(p, m, a, rng);
      const midA = a - z.rimA, midM = m - z.rimM;
      if (z.rimM > z.rimA || midM < 0 || midM > midA || z.dunkA > z.rimA || z.dunkM > z.dunkA || z.dunkM > z.rimM || z.dunkA - z.dunkM > z.rimA - z.rimM) sane = false;
      sum[k].rimA += z.rimA; sum[k].dunkA += z.dunkA; sum[k].a += a;
    });
  }
  ok(sane, 'a game\'s rim and non-rim twos always add back up to its box score, with dunks a part of the rim shots');
  const rimShare = k => sum[k].rimA / sum[k].a, dunkShare = k => sum[k].dunkA / Math.max(1, sum[k].rimA);
  ok(rimShare('big') > rimShare('guard') + 0.2, `a rim-running big takes far more of his twos at the rim than a shooting guard (${(rimShare('big') * 100).toFixed(0)}% vs ${(rimShare('guard') * 100).toFixed(0)}%)`);
  ok(dunkShare('big') > 0.3 && dunkShare('guard') < 0.08, `and dunks far more of them (${(dunkShare('big') * 100).toFixed(0)}% vs ${(dunkShare('guard') * 100).toFixed(0)}%)`);
  ok(JSON.stringify(PC.shotProfile(big)) === JSON.stringify(PC.shotProfile({ ...big })), 'a player\'s shot tendencies are his own, the same every time');
  ok(JSON.stringify(PC.splitTwos(big, 0, 0, rng)) === JSON.stringify({ rimM: 0, rimA: 0, dunkM: 0, dunkA: 0 }), 'no twos, no rim shots');
}

// ---- Birthdays ----
{
  const real = PC.birthdayOf({ name: 'A', dob: '11/7/2006' }, 2026);
  ok(real && !real.invented && real.y === 2006 && real.mo === 11 && real.d === 7 && PC.birthdayLabel(real) === 'Nov 7, 2006', 'a birthday from the sheet is read as written');
  ok(PC.birthdayOf({ name: 'B', dob: '2007-03-04' }, 2026).mo === 3, 'in either date format');
  const fr = Array.from({ length: 400 }, (_, i) => PC.birthdayOf({ name: `Fresh ${i}`, class: 'FR' }, 2026));
  const inWindow = b => { const t = b.y * 12 + b.mo; return t >= 2006 * 12 + 9 && t <= 2008 * 12 + 8; };
  ok(fr.every(b => b.invented && inWindow(b)), 'a freshman without one is born in the right window for his class (Sept 2006 to Aug 2008 for the fall of 2026)');
  ok(fr.filter(b => b.y * 12 + b.mo >= 2007 * 12 + 9).length > 300, 'mostly in his class\'s own year, the odd one older');
  const sr = PC.birthdayOf({ name: 'Senior X', class: 'SR' }, 2026);
  ok(sr.y >= 2003 && sr.y <= 2005, `a senior is three years older (${PC.birthdayLabel(sr)})`);
  const p = { name: 'Kept Birthday', class: 'FR' };
  const b1 = PC.birthdayOf(p, 2026);
  p.born = PC.dobText(b1); p.class = 'SO';
  const b2 = PC.birthdayOf(p, 2027);
  ok(b2.y === b1.y && b2.mo === b1.mo && b2.d === b1.d, 'a made-up birthday is kept, so it doesn\'t move as he moves up a class');
  ok(Math.abs(PC.ageOn({ y: 2006, mo: 11, d: 7 }, '2027-06-25') - 20.6) < 0.05, 'age on draft night to a tenth');
}

// ---- The draft model ----
const line = (o = {}) => ({ gp: 30, mpg: '31.0', p40pts: '24', p40reb: '8', p40ast: '3.5', p40stl: '1.5', p40blk: '1', p40tov: '2.5', bpm: '7.0', tsPct: '.580', usg: '24.0%', ...o });
{
  const base = { id: 'mm', name: 'Mid Major', pos: 'SF', class: 'JR', ht: '6-7', rating: 78, stats: line() };
  const big6 = DC.scoreProspect({ ...base, conference: 'Big Ten' });
  const mid = DC.scoreProspect({ ...base, conference: 'Horizon' });
  const strong = DC.scoreProspect({ ...base, conference: 'West Coast' });
  ok(big6.midMajorPenalty === 0 && mid.midMajorPenalty > strong.midMajorPenalty && strong.midMajorPenalty > 0,
    `good numbers at a mid-major cost him (${mid.midMajorPenalty} in the Horizon, ${strong.midMajorPenalty} in the WCC, none in the Big Ten)`);
  const star = { ...base, conference: 'Horizon', stats: line({ p40pts: '33', p40reb: '10', p40ast: '5', p40stl: '2.2', p40blk: '1.6', bpm: '13.5', tsPct: '.640' }) };
  ok(DC.scoreProspect(star).midMajorPenalty === 0, 'exceptional numbers clear the bar entirely');
  ok(DC.scoreProspect({ ...base, conference: 'Horizon', rsci: 10 }).midMajorPenalty < mid.midMajorPenalty, 'a top-15 recruit keeps part of his billing');
  ok(DC.scoreProspect({ ...base, conference: 'Pro', isPro: true }).midMajorPenalty === 0, 'international pros are judged as before');

  // Combine height replaces the listing for this draft only.
  const listed = { ...base, conference: 'Big Ten', ht: '6-7' };
  const grew = { ...listed, predraft: { year: 2030, meas: { shoes: 81.5, barefoot: 80.25 } } };
  ok(DC.scoreProspect(grew, 0.5, { draftYear: 2030 }).sizeEdge > DC.scoreProspect(listed, 0.5, { draftYear: 2030 }).sizeEdge,
    'measuring taller at the combine than his listing helps his size grade');
  ok(DC.scoreProspect(grew, 0.5, { draftYear: 2031 }).sizeEdge === DC.scoreProspect(listed, 0.5, { draftYear: 2031 }).sizeEdge, 'but only for that draft');
}

// ---- Combine standouts ----
{
  // A declared class: the same player at every spot on the board, so only
  // the combine itself separates them.
  const conf = i => (i % 3 === 0 ? 'Horizon' : 'SEC');
  const players = Array.from({ length: 78 }, (_, i) => ({
    id: `c${i}`, name: `Combine Prospect ${i}`, pos: ['PG', 'SG', 'SF', 'PF', 'C'][i % 5], class: 'SO', ht: ['6-3', '6-5', '6-7', '6-9', '6-11'][i % 5],
    wt: 205, rating: 76, conference: conf(i), rsci: i < 20 ? 10 + i : null, stats: line()
  }));
  const board = players.map(p => ({ player: p }));
  const ctx = { rng, board: () => board, scriptedFor: () => null, draftYear: 2030 };
  const res = [];
  for (let k = 0; k < 6; k++) res.push(...CY.runCombine(ctx));
  const standouts = res.filter(r => r.standout >= 3);
  ok(standouts.length >= 20, `combine standouts happen every year (${(standouts.length / 6).toFixed(1)} a class)`);
  ok(standouts.every(r => r.notes.some(n => /Combine standout/.test(n))), 'and their combine notes say why');
  const late = res.filter(r => r.rank > 45), top = res.filter(r => r.rank <= 10);
  const maxOf = a => Math.max(...a.map(r => r.stock));
  ok(maxOf(late) >= 8, `a lesser-known prospect can jump a long way (best stock outside the top 45: +${maxOf(late).toFixed(1)})`);
  ok(maxOf(top) < maxOf(late) / 2, `a projected top-ten pick moves far less (+${maxOf(top).toFixed(1)} at most)`);
  const midLate = late.filter(r => conf(+r.id.slice(1)) === 'Horizon' && r.standout > 0), powLate = late.filter(r => conf(+r.id.slice(1)) === 'SEC' && r.standout > 0);
  ok(mean(midLate.map(r => r.standout)) > mean(powLate.map(r => r.standout)), 'and a mid-major standout gets noticed most of all');
}

console.log('\nshots and draft: all checks passed');
