// The 2K draft class tool (js/twok-core.js): rookie overalls by draft
// slot, attributes balanced to strengths and weaknesses, tendencies and
// body from the numbers, and a class that reads the way 2K grades rookies.
const T = require('../js/twok-core.js');
const { ok } = require('./harness');

// ---- the rookie curve ----
ok(T.curveFor(1) === 79 && T.curveFor(3) === 77, 'top three picks start at 79-77');
ok(T.curveFor(4) <= 76 && T.curveFor(10) >= 72 && T.curveFor(10) <= 73, 'the rest of the top ten sits 76-72');
ok(T.curveFor(11) <= 75 && T.curveFor(30) === 70, 'the rest of the first round 75-70');
ok(T.curveFor(60) < T.curveFor(31) && T.curveFor(60) >= 64, 'and down through the second round');

// ---- a synthetic class ----
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
function prospect(i) {
  const pos = POS[i % 5], g = T.group(pos);
  const r = (m, sd) => +(m + (rnd() - 0.5) * 2 * sd).toFixed(1);
  const ppg = r(15, 5), mpg = r(30, 4);
  return {
    id: 'p' + i, name: 'Prospect ' + i, pos, class: ['FR', 'SO', 'JR', 'SR'][i % 4], school: 'Duke', rating: Math.round(94 - i * 0.25 + (rnd() - 0.5) * 6),
    ht: g === 'guard' ? `6'${3 + (i % 3)}` : g === 'wing' ? `6'${6 + (i % 3)}` : `6'${10 + (i % 2)}`, wt: g === 'big' ? 240 : g === 'wing' ? 210 : 190,
    stats: {
      gp: 32, mpg, ppg, rpg: g === 'big' ? r(9, 2) : g === 'wing' ? r(5.5, 1.5) : r(3.5, 1), apg: g === 'guard' ? r(4.5, 1.5) : r(1.8, 0.8),
      stl: r(1.2, 0.4), blk: g === 'big' ? r(1.8, 0.8) : r(0.4, 0.3), pf: r(2.4, 0.6), threePa: g === 'big' ? r(0.8, 0.8) : r(4.5, 1.5),
      threePPct: g === 'big' ? '.280' : String(r(0.35, 0.05)), fta: r(4, 1.5), ftPct: String(r(0.73, 0.07)), twoPPct: String(g === 'big' ? r(0.6, 0.04) : r(0.51, 0.04)),
      tsPct: String(r(0.57, 0.03)), usg: r(23, 4) + '%', astPct: (g === 'guard' ? r(25, 6) : r(12, 4)) + '%', tovPct: r(14, 3) + '%',
      orebPct: (g === 'big' ? r(10, 2.5) : r(4, 1.5)) + '%', drebPct: (g === 'big' ? r(20, 3) : r(12, 3)) + '%', ftr: String(r(0.35, 0.1)),
      threePar: String(g === 'big' ? 0.05 : r(0.4, 0.1)), bpm: String(r(5, 2.5)), dbpm: String(r(2, 1.5)), obpm: String(r(3, 1.5))
    }
  };
}
const files = Array.from({ length: 70 }, (_, i) => prospect(i));
const cls = T.buildClass(files.map((f, i) => ({ file: f, pick: i < 60 ? i + 1 : null, round: i < 30 ? 1 : i < 60 ? 2 : null, team: 'Team ' + i })), 2030);
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const o = (from, to) => cls.slice(from, to).map(p => p.ovr);
ok(o(0, 3).every(v => v >= 76 && v <= 81), `top three picks rate 76-81 (${o(0, 3).join(', ')})`);
ok(o(3, 10).every(v => v >= 70 && v <= 78), `the rest of the top ten 70-78 (${o(3, 10).join(', ')})`);
ok(o(10, 30).every(v => v >= 67 && v <= 77), `the rest of the first round 67-77 (${Math.min(...o(10, 30))}-${Math.max(...o(10, 30))})`);
ok(avg(o(0, 10)) > avg(o(10, 30)) && avg(o(10, 30)) > avg(o(30, 60)) && avg(o(30, 60)) > avg(o(60, 70)), 'overall falls with draft slot');

const allAttrs = cls.flatMap(p => Object.values(p.attributes));
ok(allAttrs.every(v => Number.isInteger(v) && v >= 25 && v <= 96), 'every attribute is a whole number on 2K\'s scale');
ok(cls.every(p => Object.values(p.tendencies).every(v => v == null || (v >= 0 && v <= 100))), 'tendencies run 0-100');
// What a position relies on averages out near the overall.
const coreMean = p => { const g = T.group(p.body.pos); const core = T.ATTRS.filter(a => a[2][{ guard: 0, wing: 1, big: 2 }[g]] === 1).map(a => p.attributes[a[0]]); return avg(core); };
ok(cls.every(p => Math.abs(coreMean(p) - (p.ovr - 2)) <= 4), 'the attributes his position relies on average out near his overall');
const bigs = cls.filter(p => T.group(p.body.pos) === 'big'), guards = cls.filter(p => T.group(p.body.pos) === 'guard');
ok(avg(bigs.map(p => p.attributes['Block'])) > avg(guards.map(p => p.attributes['Block'])) + 12, 'bigs block shots, guards don\'t');
ok(avg(guards.map(p => p.attributes['Ball Handle'])) > avg(bigs.map(p => p.attributes['Ball Handle'])) + 12, 'guards handle, bigs don\'t');
ok(avg(guards.map(p => p.attributes['Speed'])) > avg(bigs.map(p => p.attributes['Speed'])) + 10, 'guards are quicker');
ok(cls.every(p => p.pot >= p.ovr + 2), 'potential sits above the overall');

// Strengths show: the same prospect as a shooter, then as a slasher who can't shoot.
const base = files[12];
const shooter = { ...base, archetype: 'shooter', traits: { strengths: ['Elite catch-and-shoot range'], weaknesses: [] }, written: { aau: [20, 28, 18, 4, 2, 1, 0.3, 1.5, 50, 43, 88, 6, 7, 4] } };
const slasher = { ...base, archetype: 'slasher', traits: { strengths: ['Explosive finisher at the rim'], weaknesses: ['Jump shot', 'Perimeter shooting'] }, written: { aau: [20, 28, 18, 4, 2, 1, 0.3, 1.5, 60, 24, 60, 12, 1.5, 7] } };
const a = T.build({ file: shooter, pick: 13 }, 2030, null), b = T.build({ file: slasher, pick: 13 }, 2030, null);
ok(a.ovr === b.ovr, 'the overall comes from his slot, not his style');
ok(a.attributes['Three-Point Shot'] >= b.attributes['Three-Point Shot'] + 8, `a shooter shoots (${a.attributes['Three-Point Shot']} vs ${b.attributes['Three-Point Shot']})`);
ok(b.attributes['Driving Dunk'] > a.attributes['Driving Dunk'] && b.tendencies['Drive'] > a.tendencies['Drive'] + 10, 'a slasher attacks the rim');
ok(a.tendencies['Shot Three'] > b.tendencies['Shot Three'], 'and their shot diets follow');

// The combine: measured body and testing.
const tested = { ...base, predraft: { meas: { barefoot: 78.25, shoes: 79.5, wingspan: 84.5, weight: 214, handLength: 9, handWidth: 9.75 }, tests: { maxVert: 41, sprint: 3.1 }, pct: { maxVert: 95, standVert: 90, sprint: 92, lane: 80, shuttle: 75, bench: 40, ape: 90, reach: 80, shooting: 60 } } };
const c = T.build({ file: tested, pick: 13 }, 2030, null), d = T.build({ file: base, pick: 13 }, 2030, null);
ok(c.body.height === 78 && c.body.wingspan === 85 && c.body.weight === 214, 'height, wingspan and weight come from the combine');
ok(c.attributes['Vertical'] > d.attributes['Vertical'] + 5 && c.attributes['Speed'] > d.attributes['Speed'], 'a big vertical and a fast sprint show up in his athleticism');
ok(/combine/.test(c.lore) && /Taken 13th overall/.test(c.lore), 'lore covers his combine and his draft slot');

// The spreadsheet.
const { header, rows } = T.csvRows(cls);
ok(rows.length === 70 && rows.every(r => r.length === header.length), 'one CSV row per prospect, every column filled in order');
ok(header.includes('Three-Point Shot') && header.includes('Tendency: Drive') && header.includes('Wingspan (in)'), 'with attributes, tendencies and body');
console.log('\n2K draft classes verified.');
