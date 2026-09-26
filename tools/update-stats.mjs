#!/usr/bin/env node
/* ============================================================
   BYTHERIM — college stats for the big board.

   Pulls every Division I player's season line from Barttorvik
   (barttorvik.com, the free T-Rank player file), keeps only the players
   on the big board, and writes data/stats.json for the site to read.

   - Last season: every prospect who played D-I college ball last year.
     Freshmen on the board are skipped, since a same-named college player
     from last season would be someone else.
   - This season: filled in automatically once games have been played.

   Matching is by name. Nicknames and one-letter spelling differences
   ("Cam"/"Cameron", "Cadeu"/"Cadeau") are matched too, but only when the
   school or birthday agrees, and each one is printed so the sheet can be
   corrected. If a name still doesn't match, add a "Stats Name" column to
   the sheet with the spelling Barttorvik uses.

   Runs daily from .github/workflows/update-stats.yml. To run by hand
   (Node 18 or newer):   node tools/update-stats.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.STATS_OUT || join(ROOT, 'data', 'stats.json'); // tests write elsewhere

// The sheet URL and draft year live in assets/board.js; read them from
// there so they only need changing in one place.
const boardJs = readFileSync(join(ROOT, 'assets', 'board.js'), 'utf8');
const SHEET = (boardJs.match(/sheet:\s*'([^']+)'/) || [])[1];
const DRAFT_YEAR = +((boardJs.match(/draftYear:\s*(\d{4})/) || [])[1]);
if (!SHEET || !DRAFT_YEAR) throw new Error('Could not read the sheet URL / draft year from assets/board.js');

// Barttorvik names seasons by the year they end: 2026 = 2025-26.
const seasonLabel = y => `${y - 1}-${String(y).slice(2)}`;
const SEASONS = [DRAFT_YEAR - 1, DRAFT_YEAR]; // last season, this season
const torvikUrl = y => `https://barttorvik.com/getadvstats.php?year=${y}&csv=1`;

// Column positions in Barttorvik's player file (it has no header row).
const C = {
  name: 0, team: 1, conf: 2, gp: 3, usg: 6, efg: 7, ts: 8, ftm: 13, fta: 14, ftPct: 15,
  twoM: 16, twoA: 17, twoPct: 18, threeM: 19, threeA: 20, threePct: 21, cls: 25, height: 26,
  year: 31, pid: 32, bpm: 50, obpm: 51, dbpm: 52, mpg: 54, reb: 59, ast: 60, stl: 61, blk: 62,
  pts: 63, role: 64, birthday: 66
};

// ------------------------------------------------------------ helpers
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// Same id the site uses (board.js slug), so stats attach to the right row.
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// "Jason Crowe Jr." and "Jason Crowe" should match; so should "D.J." / "DJ".
const nameKey = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[.'’`-]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/[^a-z ]/g, ' ')
  .replace(/\s+/g, ' ').trim();

// Sheet birthdays are m/d/yyyy; Barttorvik's are yyyy-mm-dd.
function isoDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? s : null;
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const f1 = n => (n == null ? null : n.toFixed(1));
const pct = n => (n == null ? null : `${(n * 100).toFixed(1)}%`);    // 0.358 -> "35.8%"
const pct100 = n => (n == null ? null : `${n.toFixed(1)}%`);         // 58.2 -> "58.2%"
const rate = n => (n == null ? null : n.toFixed(2));

// One Barttorvik row -> the stat keys the site shows (same keys as the sheet).
function statLine(r) {
  const fga = (num(r[C.twoA]) || 0) + (num(r[C.threeA]) || 0);
  const fta = num(r[C.fta]);
  const s = {
    PTS: f1(num(r[C.pts])), REB: f1(num(r[C.reb])), AST: f1(num(r[C.ast])),
    STL: f1(num(r[C.stl])), BLK: f1(num(r[C.blk])),
    'TS%': pct100(num(r[C.ts])), 'eFG%': pct100(num(r[C.efg])),
    '2P%': num(r[C.twoA]) ? pct(num(r[C.twoPct])) : null,
    '3P%': num(r[C.threeA]) ? pct(num(r[C.threePct])) : null,
    'FT%': fta ? pct(num(r[C.ftPct])) : null,
    '3Pr': fga ? rate(num(r[C.threeA]) / fga) : null,
    FTr: fga && fta != null ? rate(fta / fga) : null,
    'USG%': pct100(num(r[C.usg])),
    BPM: f1(num(r[C.bpm])), OBPM: f1(num(r[C.obpm])), DBPM: f1(num(r[C.dbpm]))
  };
  Object.keys(s).forEach(k => s[k] == null && delete s[k]);
  return {
    torvikName: r[C.name], team: r[C.team], conf: r[C.conf], gp: num(r[C.gp]), mpg: f1(num(r[C.mpg])),
    cls: r[C.cls], role: r[C.role] || null, torvikId: r[C.pid], stats: s
  };
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BYTHERIM big board (github.com/collinbutrlakorn/BYTHERIM)' } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.text();
}

// ------------------------------------------------------------ matching
// Barttorvik's birthdays are often approximate (many are a placeholder
// Oct 15), so a birthday only rules a player out when it's more than a
// year from the sheet's, and otherwise just breaks ties.
const DAY = 864e5;
const dobGap = (p, r) => {
  const a = p.dob, b = isoDate(r[C.birthday]);
  return a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / DAY : null;
};
const dobOk = (p, r) => { const g = dobGap(p, r); return g == null || g <= 400; };
const dobClose = (p, r) => { const g = dobGap(p, r); return g != null && g <= 45; };

// "Michigan St." vs "Michigan State", "Miami FL" vs "Miami".
const schoolKey = s => String(s || '').toLowerCase().replace(/\bst\.?(?=\s|$)/g, 'state').replace(/[^a-z]/g, '');
const sameSchool = (p, r) => {
  const a = schoolKey(p.school), b = schoolKey(r[C.team]);
  return !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a));
};

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function pick(p, cands) {
  cands = cands.filter(r => dobOk(p, r));
  if (cands.length <= 1) return { row: cands[0] || null };
  const narrowed = cands.filter(r => sameSchool(p, r) || dobClose(p, r));
  if (narrowed.length === 1) return { row: narrowed[0] };
  return { ambiguous: cands.length };
}

function findPlayer(p, rows, byName) {
  const key = nameKey(p.lookup);
  // 1. Exact name.
  const exact = byName.get(key);
  if (exact && exact.length) { const m = pick(p, exact); if (m.row || m.ambiguous) return m; }

  // 2. Nickname or small spelling difference ("Cam"/"Cameron",
  //    "Cadeu"/"Cadeau"). Only accepted when the school or the birthday
  //    backs it up, since a near-miss name alone could be someone else.
  const [first, ...restParts] = key.split(' ');
  const last = restParts.join(' ');
  const near = rows.filter(r => {
    const k = nameKey(r[C.name]);
    const [f2, ...r2] = k.split(' ');
    const l2 = r2.join(' ');
    const nickname = l2 === last && first.length >= 2 && f2.length >= 2 && (f2.startsWith(first) || first.startsWith(f2));
    const typo = editDistance(k, key) <= 2 && k[0] === key[0];
    return (nickname || typo) && (sameSchool(p, r) || dobClose(p, r)) && dobOk(p, r);
  });
  if (near.length === 1) return { row: near[0], fuzzy: true };
  if (near.length > 1) return { ambiguous: near.length };
  return { row: null };
}

// ------------------------------------------------------------ board
const boardRows = parseCSV(await get(SHEET));
const header = boardRows.shift().map(h => h.trim().toLowerCase());
const col = (...names) => names.map(n => header.indexOf(n)).find(i => i >= 0);
const iName = col('name', 'prospect', 'player'), iDob = col('dob', 'date of birth', 'birthdate');
const iClass = col('class', 'year'), iSchool = col('school', 'school/team', 'team', 'college');
const iStatsName = col('stats name', 'torvik name');

const prospects = boardRows.map(r => ({
  id: slug(r[iName] || ''),
  name: (r[iName] || '').trim(),
  lookup: ((iStatsName != null && r[iStatsName]) || r[iName] || '').trim(),
  dob: isoDate(iDob != null ? r[iDob] : ''),
  cls: (iClass != null ? r[iClass] : '').trim().toUpperCase(),
  school: (iSchool != null ? r[iSchool] : '').trim(),
  isPro: /^pro$/i.test((iSchool != null ? r[iSchool] : '').trim())
})).filter(p => p.name);

// ------------------------------------------------------------ seasons
const out = { updated: new Date().toISOString(), source: 'barttorvik.com', seasons: {} };
const report = [];

for (const year of SEASONS) {
  const label = seasonLabel(year);
  let rows;
  try { rows = parseCSV(await get(torvikUrl(year))); }
  catch (e) { report.push(`${label}: could not download (${e.message})`); continue; }

  // Only rows with real box-score numbers count; before a season starts
  // Barttorvik lists players with the per-game columns still blank.
  rows = rows.filter(r => r.length > C.pts && String(r[C.year]) === String(year) && num(r[C.pts]) != null && num(r[C.gp]) > 0);
  if (!rows.length) { report.push(`${label}: no games played yet`); continue; }

  const byName = new Map();
  rows.forEach(r => { const k = nameKey(r[C.name]); (byName.get(k) || byName.set(k, []).get(k)).push(r); });

  const isLastSeason = year === DRAFT_YEAR - 1;
  const season = {};
  const unmatched = [];
  for (const p of prospects) {
    if (p.isPro) continue;                                     // pros aren't in the D-I file
    if (isLastSeason && (p.cls === 'FR' || p.cls === 'INTL')) continue; // weren't in college last year
    const m = findPlayer(p, rows, byName);
    if (m.ambiguous) { report.push(`${label}: ${p.name} matched ${m.ambiguous} players that can't be told apart; skipped`); continue; }
    if (!m.row) { if (isLastSeason) unmatched.push(p.name); continue; }
    if (m.fuzzy) report.push(`${label}: matched "${p.lookup}" to Barttorvik's "${m.row[C.name]}" (${m.row[C.team]}) — check the spelling on the sheet`);
    season[p.id] = statLine(m.row);
  }
  out.seasons[label] = season;
  report.push(`${label}: stats for ${Object.keys(season).length} prospects`);
  if (unmatched.length) report.push(`${label}: no D-I line found for ${unmatched.join(', ')} (add a "Stats Name" column if the spelling differs)`);
}

mkdirSync(dirname(OUT), { recursive: true });
// Keep the file byte-identical when nothing changed, so the daily job
// doesn't commit just because the timestamp moved.
let previous = null;
try { previous = JSON.parse(readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
if (previous && JSON.stringify(previous.seasons) === JSON.stringify(out.seasons)) out.updated = previous.updated;
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(report.join('\n'));
