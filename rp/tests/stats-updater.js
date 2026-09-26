// Covers tools/update-stats.mjs, which pulls college stats from Barttorvik
// for the big board (last season, this season, and past boards). Runs it against a fake sheet and a
// fake Barttorvik file (no network) and checks who gets matched: exact
// names, nicknames and misspellings backed up by school or birthday, a
// "Stats Name" override, and that freshmen, pros and look-alikes at other
// schools are left alone.
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
function ok(c, m) { if (!c) throw new Error('FAILED: ' + m); console.log('OK: ' + m); }

const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'btr-stats-'));

// ---------------------------------------------------------------- fixtures
const SHEET = [
  'pick,tier,name,DOB,class,height,weight,position,school,archetype,Stats Name',
  '1,2,Fresh Man,1/1/2008,FR,"6\'8""",220,SF,Kansas,Wing,',          // same name played last year elsewhere: must be skipped
  '2,3,Exact Match,3/13/2006,JR,"6\'11""",250,C,Duke,Big,',
  '3,3,Cam Ward,10/30/2006,SO,"6\'8""",210,SF,Michigan State,Wing,',  // nickname: Barttorvik has "Cameron Ward"
  '4,3,Elliot Cadeu,9/4/2004,SR,"6\'1""",180,PG,Michigan,Guard,',     // misspelled: Barttorvik has "Cadeau"
  '5,4,Transfer Guy,5/20/2005,JR,"6\'9""",220,C,Louisville,Big,',     // transferred: played at Kansas
  '6,4,Euro Pro,1/1/2007,INTL,"6\'6""",195,SG,Pro,Guard,',
  '7,4,Sheet Nick,2/2/2005,SR,"6\'4""",190,SG,Iowa,Guard,Robert Formal',
  '8,5,Near Miss,4/4/2006,SO,"6\'5""",200,SG,Oregon,Guard,',          // a "Near Mist" exists, but at another school with another birthday
  '9,5,Nathan Longname,6/3/2003,SR,"6\'11""",240,C,Oregon,Big,'      // nickname that isn't a prefix: Barttorvik has "Nate"
].join('\n');

// A past board ("2025 Board" tab) and a tab that's still a copy of the
// current board ("2024 Board"), as listed on the published sheet's page.
const PAST_2025 = [
  'pick,tier,name,DOB,class,height,weight,position,school,archetype',
  '1,1,Past Frosh,1/1/2006,FR,"6\'8""",220,SF,Duke,Wing',             // freshmen count on past boards
  '2,2,Past Intl,2/2/2006,INTL,"6\'6""",200,SG,Pro,Guard'
].join('\n');
const PUBHTML = [['2027 Board', '0'], ['2025 Board', '5'], ['2024 Board', '6'], ['TorvikData', '7']]
  .map(([n, g]) => `items.push({name: "${n}", pageUrl: "x", gid: "${g}",initialSheet: false});`).join('');

// Barttorvik's player file has no header; build rows by column position.
const C = { name: 0, team: 1, conf: 2, gp: 3, usg: 6, efg: 7, ts: 8, fta: 14, ftPct: 15, twoA: 17, twoPct: 18,
  threeA: 20, threePct: 21, cls: 25, year: 31, pid: 32, bpm: 50, obpm: 51, dbpm: 52, mpg: 54,
  reb: 59, ast: 60, stl: 61, blk: 62, pts: 63, role: 64, birthday: 66 };
let pid = 1000;
function row(name, team, birthday, pts, year = 2026) {
  const r = new Array(67).fill('');
  Object.assign(r, {
    [C.name]: name, [C.team]: team, [C.conf]: 'B12', [C.gp]: '30', [C.usg]: '22.5', [C.efg]: '55.0', [C.ts]: '58.1',
    [C.fta]: '90', [C.ftPct]: '0.75', [C.twoA]: '200', [C.twoPct]: '0.52', [C.threeA]: '100', [C.threePct]: '0.36',
    [C.cls]: 'Jr', [C.year]: String(year), [C.pid]: String(pid++), [C.bpm]: '5.2', [C.obpm]: '3.1', [C.dbpm]: '2.1',
    [C.mpg]: '28.4', [C.reb]: '5.5', [C.ast]: '2.2', [C.stl]: '1.1', [C.blk]: '0.4', [C.pts]: String(pts),
    [C.role]: 'Wing G', [C.birthday]: birthday
  });
  return r.map(v => (/[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
}
const TORVIK_2026 = [
  row('Fresh Man', 'Wichita St.', '2001-10-15', 9.9),         // an older player with the freshman's name
  row('Exact Match', 'Duke', '2006-02-13', 10.1),
  row('Cameron Ward', 'Michigan St.', '2006-10-15', 12.3),
  row('Elliot Cadeau', 'Michigan', '2004-10-15', 11.0),
  row('Transfer Guy', 'Kansas', '2005-05-20', 13.3),
  row('Robert Formal', 'Iowa', '2005-02-02', 8.8),
  row('Near Mist', 'Maine', '2001-10-15', 7.7),
  row('Nate Longname', 'Oregon', '2003-06-03', 11.1)
].join('\n');
// Before the season starts, Barttorvik lists players with blank box scores.
const TORVIK_2027 = row('Exact Match', 'Duke', '2006-02-13', '', 2027);

const TORVIK_2025 = [
  row('Past Frosh', 'Duke', '2006-01-01', 14.0, 2025),
  row('Past Intl', 'Gonzaga', '2006-02-02', 5.0, 2025)             // same name in college: must not attach to the pro
].join('\n');
const TORVIK_2024 = row('Exact Match', 'Duke', '2006-02-13', 3.3, 2024);

// fetch() stand-in, loaded into the updater's process with --import.
const preload = path.join(tmp, 'fake-fetch.mjs');
fs.writeFileSync(preload, `
const data = ${JSON.stringify({ sheet: SHEET, past: PAST_2025, pubhtml: PUBHTML, y2024: TORVIK_2024, y2025: TORVIK_2025, y2026: TORVIK_2026, y2027: TORVIK_2027 })};
globalThis.fetch = async url => {
  url = String(url);
  const body = url.endsWith('/pubhtml') ? data.pubhtml
    : url.includes('gid=5') ? data.past
    : url.includes('docs.google.com') ? data.sheet          // current board, and the 2024 copy (gid=6)
    : url.includes('year=2024') ? data.y2024
    : url.includes('year=2025') ? data.y2025
    : url.includes('year=2026') ? data.y2026
    : url.includes('year=2027') ? data.y2027 : null;
  return { ok: body != null, status: body != null ? 200 : 404, text: async () => body };
};`);

const out = path.join(tmp, 'stats.json');
const log = execFileSync(process.execPath, ['--import', 'file://' + preload, path.join(ROOT, 'tools', 'update-stats.mjs')],
  { env: { ...process.env, STATS_OUT: out }, encoding: 'utf8' });
const stats = JSON.parse(fs.readFileSync(out, 'utf8'));
const last = stats.seasons['2025-26'] || {};

// ---------------------------------------------------------------- checks
ok(fs.readFileSync(path.join(ROOT, 'data', 'stats.json'), 'utf8').includes('"2025-26"'), 'real data/stats.json left untouched by the test');
ok(last['exact-match'] && last['exact-match'].stats.PTS === '10.1', 'exact name matched with its points per game');
ok(last['exact-match'].team === 'Duke' && last['exact-match'].gp === 30 && last['exact-match'].mpg === '28.4', 'team, games and minutes carried over');
const s = last['exact-match'].stats;
ok(s['3P%'] === '36.0%' && s['TS%'] === '58.1%' && s['3Pr'] === '0.33' && s.FTr === '0.30', 'shooting splits and rates converted to the sheet\'s format');
ok(last['cam-ward'] && last['cam-ward'].torvikName === 'Cameron Ward', 'nickname matched when the school agrees (Cam -> Cameron Ward)');
ok(last['elliot-cadeu'] && last['elliot-cadeu'].torvikName === 'Elliot Cadeau', 'one-letter misspelling matched when the school agrees');
ok(/check the spelling on the sheet/.test(log), 'fuzzy matches are reported so the sheet can be corrected');
ok(last['transfer-guy'] && last['transfer-guy'].team === 'Kansas', 'transfer matched to last season\'s team');
ok(last['sheet-nick'] && last['sheet-nick'].torvikName === 'Robert Formal', '"Stats Name" column overrides the lookup name');
ok(!last['fresh-man'], 'freshmen skipped even when an older player shares the name');
ok(!last['euro-pro'], 'pros skipped');
ok(!last['near-miss'], 'a near-miss name at a different school with a different birthday is not matched');
ok(/no D-I line found for Near Miss/.test(log), 'unmatched returning players are listed');
ok(last['nathan-longname'] && last['nathan-longname'].torvikName === 'Nate Longname', 'common nicknames matched when the school agrees (Nathan -> Nate)');
const y25 = stats.seasons['2024-25'] || {};
ok(y25['past-frosh'] && y25['past-frosh'].stats.PTS === '14.0', 'past board: prospects get the season leading into that draft, freshmen included');
ok(!y25['past-intl'], 'past board: internationals skipped');
ok(!stats.seasons['2023-24'] && /2024 board: still a copy of the 2027 board/.test(log), 'past board: a tab that is still a copy of the current board is skipped');
ok(!stats.seasons['2026-27'] && /2026-27: no games played yet/.test(log), 'this season stays empty until games are played');

// Re-running with nothing changed keeps the file identical (no daily commit churn).
const before = fs.readFileSync(out, 'utf8');
execFileSync(process.execPath, ['--import', 'file://' + preload, path.join(ROOT, 'tools', 'update-stats.mjs')],
  { env: { ...process.env, STATS_OUT: out }, encoding: 'utf8' });
ok(fs.readFileSync(out, 'utf8') === before, 'unchanged stats leave the file byte-identical');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nStats updater verified.');
