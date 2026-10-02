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
   - Past boards (sheet tabs named like "2025 Board"): each prospect's
     season leading into that draft.
   - Pros and G League players: any sheet row whose "Stats Link" is a
     Basketball-Reference international or G League page gets its
     season lines from that page.

   Matching is by name. Nicknames and one-letter spelling differences
   ("Cam"/"Cameron", "Cadeu"/"Cadeau") are matched too, but only when the
   school or birthday agrees, and each one is printed so the sheet can be
   corrected. If a name still doesn't match, add a "Stats Name" column to
   the sheet with the spelling Barttorvik uses.

   A download that fails never erases anything: if Barttorvik or a
   Basketball-Reference page can't be read, the numbers already in
   data/stats.json are kept and the run log says so.

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

// Barttorvik's robots.txt asks for 10 seconds between requests; the job
// only makes a handful a day, spaced out accordingly.
const CRAWL_DELAY_MS = +(process.env.CRAWL_DELAY_MS ?? 10000);
// Basketball-Reference asks for at least 3 seconds (and under 20 requests
// a minute); 4 seconds keeps well inside that.
const BBREF_DELAY_MS = +(process.env.BBREF_DELAY_MS ?? 4000);
const lastHit = {};
async function politely(host, delay) {
  const wait = (lastHit[host] || 0) + delay - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastHit[host] = Date.now();
}
async function get(url) {
  if (url.includes('barttorvik.com')) await politely('torvik', CRAWL_DELAY_MS);
  if (url.includes('basketball-reference.com')) await politely('bbref', BBREF_DELAY_MS);
  const res = await fetch(url, { headers: { 'User-Agent': 'BYTHERIM big board (github.com/collinbutrlakorn/BYTHERIM)' } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  const text = await res.text();
  // A bot check or error page arrives as HTML with a 200 status.
  if (url.includes('barttorvik.com') && /^\s*</.test(text)) {
    throw new Error(`${url} sent a web page instead of the CSV file (the site may be refusing this server)`);
  }
  return text;
}

// ------------------------------------------------------------ Basketball-Reference
// Pros and G League players aren't in Barttorvik. For anyone whose sheet
// row has a "Stats Link" to their Basketball-Reference international or
// G League page, that page is read instead (one request per linked
// player, spaced out per the site's crawl delay).
const BBREF_PAGE = /^https:\/\/www\.basketball-reference\.com\/(international|gleague)\/players\//i;

// All stat tables on a page (some are shipped inside HTML comments),
// as { tableId: [ { data-stat: text } ] } from each table body.
function bbrefTables(html) {
  html = html.replace(/<!--|-->/g, '');
  const tables = {};
  for (const m of html.matchAll(/<table[^>]*\bid="([^"]+)"[\s\S]*?<\/table>/g)) {
    const body = (m[0].split(/<tbody>/)[1] || '').split('</tbody>')[0];
    tables[m[1]] = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(tr => {
      const row = {};
      for (const c of tr[1].matchAll(/<(?:th|td)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/(?:th|td)>/g)) {
        row[c[1]] = c[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
          .replace(/&amp;/g, '&').trim();
      }
      return row;
    }).filter(r => /^\d{4}-\d{2}$/.test(r.season || ''));
  }
  return tables;
}

const TOTAL_KEYS = ['g', 'mp', 'fg', 'fga', 'fg3', 'fg3a', 'fg2', 'fg2a', 'ft', 'fta', 'trb', 'ast', 'stl', 'blk', 'pts'];
function sumTotals(rows) {
  const t = {};
  TOTAL_KEYS.forEach(k => { t[k] = rows.reduce((a, r) => a + (num(r[k]) || 0), 0); });
  return t;
}

// Season totals -> the same stat keys Barttorvik lines use.
function lineFromTotals(t, usg) {
  const per = v => (t.g ? f1(v / t.g) : null);
  const ratio = (a, b) => (b ? a / b : null);
  const s = {
    G: t.g ? String(t.g) : null, MP: per(t.mp),
    PTS: per(t.pts), REB: per(t.trb), AST: per(t.ast), STL: per(t.stl), BLK: per(t.blk),
    'TS%': t.fga + t.fta ? pct(t.pts / (2 * (t.fga + 0.44 * t.fta))) : null,
    'eFG%': t.fga ? pct((t.fg + 0.5 * t.fg3) / t.fga) : null,
    '2P%': t.fg2a ? pct(t.fg2 / t.fg2a) : null,
    '3P%': t.fg3a ? pct(t.fg3 / t.fg3a) : null,
    'FT%': t.fta ? pct(t.ft / t.fta) : null,
    '3Pr': t.fga ? rate(ratio(t.fg3a, t.fga)) : null,
    FTr: t.fga ? rate(ratio(t.fta, t.fga)) : null,
    'USG%': usg != null ? pct100(usg) : null
  };
  Object.keys(s).forEach(k => s[k] == null && delete s[k]);
  return s;
}

const GLEAGUE_TEAMS = { GLI: 'G League Ignite' };
function parseBbref(html, url) {
  const tables = bbrefTables(html);
  const seasons = [];
  if (/\/international\//i.test(url)) {
    // One row per season and competition, as Basketball-Reference lists them.
    // Players with only a domestic league (or only tournaments) have no
    // combined "all" table, just the league / tournament ones.
    const all = tables['player-stats-totals-all-'];
    const rows = all && all.length ? all
      : [...(tables['player-stats-totals-league-'] || []), ...(tables['player-stats-totals-tournament-'] || [])]
          .sort((a, b) => a.season.localeCompare(b.season));
    for (const r of rows) {
      if (!num(r.g)) continue;
      seasons.push({ label: r.season, team: [r.team, r.league && `(${r.league})`].filter(Boolean).join(' '), stats: lineFromTotals(sumTotals([r])) });
    }
  } else {
    // G League: regular season and Showcase Cup are separate tables; add
    // them into one line per season and team.
    const groups = new Map();
    for (const r of [...(tables['nbdl_totals-reg'] || []), ...(tables['nbdl_totals-sc'] || [])]) {
      const key = `${r.season}|${r.team_id}`;
      (groups.get(key) || groups.set(key, []).get(key)).push(r);
    }
    for (const [key, rows] of groups) {
      const [season, team] = key.split('|');
      const adv = (tables['nbdl_advanced-reg'] || []).find(r => r.season === season && r.team_id === team);
      const t = sumTotals(rows);
      if (!t.g) continue;
      seasons.push({ label: season, team: GLEAGUE_TEAMS[team] || `${team} (G League)`, stats: lineFromTotals(t, adv ? num(adv.usg_pct) : null) });
    }
  }
  return seasons.sort((a, b) => a.label.localeCompare(b.label));
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

// Common short forms that aren't just the start of the full name.
const NICKNAMES = {
  nate: 'nathan', nathaniel: 'nathan', matt: 'matthew', mike: 'michael', rob: 'robert', bob: 'robert', bobby: 'robert',
  will: 'william', bill: 'william', billy: 'william', liam: 'william', alex: 'alexander', zach: 'zachary', zack: 'zachary',
  josh: 'joshua', chris: 'christopher', tony: 'anthony', jon: 'jonathan', johnny: 'john', dan: 'daniel', danny: 'daniel',
  dave: 'david', ed: 'edward', eddie: 'edward', tom: 'thomas', tommy: 'thomas', andy: 'andrew', drew: 'andrew',
  jake: 'jacob', joe: 'joseph', joey: 'joseph', nick: 'nicholas', ben: 'benjamin', sam: 'samuel', jim: 'james',
  jimmy: 'james', jamie: 'james', steve: 'steven', stephen: 'steven', greg: 'gregory', jeff: 'jeffrey', ken: 'kenneth',
  kenny: 'kenneth', larry: 'lawrence', manny: 'emmanuel', mo: 'mohamed', mohammed: 'mohamed', muhammad: 'mohamed'
};
const canonFirst = f => NICKNAMES[f] || f;

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
    const nickname = l2 === last && first.length >= 2 && f2.length >= 2 && (f2.startsWith(first) || first.startsWith(f2) || canonFirst(f2) === canonFirst(first));
    const typo = editDistance(k, key) <= 2 && k[0] === key[0];
    return (nickname || typo) && (sameSchool(p, r) || dobClose(p, r)) && dobOk(p, r);
  });
  if (near.length === 1) return { row: near[0], fuzzy: true };
  if (near.length > 1) return { ambiguous: near.length };
  return { row: null };
}

// ------------------------------------------------------------ boards
// The current board is the sheet's first tab. Past boards are any tab
// named with a year and "Board" ("2025 Board"), found through the
// published sheet's HTML page, which lists every tab and its id.
const PUB_BASE = SHEET.replace(/\/pub(html)?\?.*$/, '');
// The sheet's "Torvik 2026"-style tabs: Barttorvik's file copied in by the
// relay in tools/torvik-relay.gs, for when Barttorvik refuses this server.
const relayTabs = new Map(); // year -> CSV url
let relayStatusUrl = null;
async function listBoards() {
  const boards = [{ year: DRAFT_YEAR, url: SHEET, current: true }];
  try {
    const html = await get(`${PUB_BASE}/pubhtml`);
    const re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)",[^}]*?gid: "(-?\d+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const name = m[1].replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1');
      const year = +((name.match(/\b(?:19|20)\d{2}\b/) || [])[0]);
      const tabUrl = `${PUB_BASE}/pub?gid=${m[2]}&single=true&output=csv`;
      if (/^torvik\s+(?:19|20)\d{2}$/i.test(name.trim())) { relayTabs.set(year, tabUrl); continue; }
      if (/^torvik\s+status$/i.test(name.trim())) { relayStatusUrl = tabUrl; continue; }
      if (!year || !/board/i.test(name) || boards.some(b => b.year === year)) continue;
      boards.push({ year, url: `${PUB_BASE}/pub?gid=${m[2]}&single=true&output=csv` });
    }
  } catch (e) { report.push(`Past boards: couldn't read the sheet's tab list (${e.message})`); }
  return boards;
}

async function loadProspects(url) {
  const boardRows = parseCSV(await get(url));
  const header = boardRows.shift().map(h => h.trim().toLowerCase());
  const col = (...names) => names.map(n => header.indexOf(n)).find(i => i >= 0);
  const iName = col('name', 'prospect', 'player'), iDob = col('dob', 'date of birth', 'birthdate');
  const iClass = col('class', 'year'), iSchool = col('school', 'school/team', 'team', 'college');
  const iStatsName = col('stats name', 'torvik name');
  const iLink = col('stats link', 'realgm', 'stats url');
  return boardRows.map(r => ({
    id: slug(r[iName] || ''),
    name: (r[iName] || '').trim(),
    lookup: ((iStatsName != null && r[iStatsName]) || r[iName] || '').trim(),
    link: (iLink != null ? r[iLink] : '').trim(),
    dob: isoDate(iDob != null ? r[iDob] : ''),
    cls: (iClass != null ? r[iClass] : '').trim().toUpperCase(),
    school: (iSchool != null ? r[iSchool] : '').trim(),
    isPro: /^pro$/i.test((iSchool != null ? r[iSchool] : '').trim())
  })).filter(p => p.name);
}

// ------------------------------------------------------------ seasons
const out = { updated: new Date().toISOString(), source: 'barttorvik.com, basketball-reference.com', seasons: {}, pro: {} };
// The file as it stands, so a failed download keeps what's already there.
let previous = null;
try { previous = JSON.parse(readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
const keptSeasons = [];
let torvikRead = false; // whether Barttorvik answered at all this run
let relayRead = false;  // whether the sheet's relay copy was used instead
const linked = new Map(); // Basketball-Reference page -> prospect ids
const report = [];

// Which Barttorvik season each board needs:
//   current board  -> last season (returning players) and this season
//   past board     -> the season that led into that draft
const jobs = new Map(); // year -> [{ prospects, why, skip }]
const addJob = (year, job) => (jobs.get(year) || jobs.set(year, []).get(year)).push(job);
// A past-board tab that's still a copy of the current board (same
// prospects, same order) hasn't been filled in yet; skip it.
const signature = list => list.slice(0, 15).map(p => p.id).join('|');
let currentSignature = null;
for (const b of await listBoards()) {
  let prospects;
  try { prospects = await loadProspects(b.url); }
  catch (e) { report.push(`${b.year} board: could not download (${e.message})`); continue; }
  if (b.current) currentSignature = signature(prospects);
  else if (signature(prospects) === currentSignature) { report.push(`${b.year} board: still a copy of the ${DRAFT_YEAR} board; skipped until it's filled in`); continue; }
  prospects.filter(p => BBREF_PAGE.test(p.link)).forEach(p => {
    const url = p.link.replace(/[?#].*$/, '');
    (linked.get(url) || linked.set(url, new Set()).get(url)).add(p.id);
  });
  if (b.current) {
    // Freshmen and internationals weren't in college last season, so a
    // same-named player from then would be someone else.
    addJob(DRAFT_YEAR - 1, { prospects, why: 'last season', skip: p => p.cls === 'FR' || p.cls === 'INTL', listMisses: true });
    addJob(DRAFT_YEAR, { prospects, why: 'this season', skip: () => false });
  } else {
    addJob(b.year, { prospects, why: `${b.year} board`, skip: p => p.cls === 'INTL', listMisses: true });
  }
}

for (const [year, yearJobs] of [...jobs].sort((a, b) => a[0] - b[0])) {
  const label = seasonLabel(year);
  let rows;
  const keepPrevious = why => {
    const old = previous && previous.seasons && previous.seasons[label];
    if (old && Object.keys(old).length) {
      out.seasons[label] = old;
      keptSeasons.push(label);
      report.push(`${label}: ${why}; kept the ${Object.keys(old).length} stat lines already saved`);
    } else {
      report.push(`${label}: ${why}`);
    }
  };
  try { rows = parseCSV(await get(torvikUrl(year))); torvikRead = true; }
  catch (e) {
    // Barttorvik refused: the copy the sheet's relay made, if there is one.
    if (relayTabs.has(year)) {
      try {
        rows = parseCSV(await get(relayTabs.get(year)));
        if (!rows.length) throw new Error('the tab is empty');
        relayRead = true;
        report.push(`${label}: Barttorvik refused this server (${e.message}); read the sheet's "Torvik ${year}" tab instead`);
      } catch (e2) { keepPrevious(`could not download (${e.message}), nor read the sheet's "Torvik ${year}" tab (${e2.message})`); continue; }
    } else { keepPrevious(`could not download (${e.message})`); continue; }
  }

  // Only rows with real box-score numbers count; before a season starts
  // Barttorvik lists players with the per-game columns still blank.
  rows = rows.filter(r => r.length > C.pts && String(r[C.year]) === String(year) && num(r[C.pts]) != null && num(r[C.gp]) > 0);
  if (!rows.length) { keepPrevious('no games played yet'); continue; }

  const byName = new Map();
  rows.forEach(r => { const k = nameKey(r[C.name]); (byName.get(k) || byName.set(k, []).get(k)).push(r); });

  const season = out.seasons[label] || (out.seasons[label] = {});
  for (const job of yearJobs) {
    const unmatched = [];
    let found = 0;
    for (const p of job.prospects) {
      if (p.isPro || job.skip(p) || season[p.id]) { if (season[p.id]) found++; continue; }
      const m = findPlayer(p, rows, byName);
      if (m.ambiguous) { report.push(`${label}: ${p.name} matched ${m.ambiguous} players that can't be told apart; skipped`); continue; }
      if (!m.row) { if (job.listMisses) unmatched.push(p.name); continue; }
      if (m.fuzzy) report.push(`${label}: matched "${p.lookup}" to Barttorvik's "${m.row[C.name]}" (${m.row[C.team]}) — check the spelling on the sheet`);
      season[p.id] = statLine(m.row);
      found++;
    }
    report.push(`${label} (${job.why}): stats for ${found} prospects`);
    if (unmatched.length) report.push(`${label} (${job.why}): no D-I line found for ${unmatched.join(', ')} (add a "Stats Name" column if the spelling differs)`);
  }
  if (!Object.keys(season).length) delete out.seasons[label];
}

const keepPro = ids => ids.forEach(id => {
  const old = previous && previous.pro && previous.pro[id];
  if (old) out.pro[id] = old;
});
for (const [url, ids] of linked) {
  try {
    const seasons = parseBbref(await get(url), url);
    if (!seasons.length) { report.push(`Basketball-Reference: no stat lines on ${url}`); keepPro(ids); continue; }
    ids.forEach(id => { out.pro[id] = { url, seasons }; });
  } catch (e) { report.push(`Basketball-Reference: could not read ${url} (${e.message}); kept what was saved`); keepPro(ids); }
}
if (linked.size) report.push(`Basketball-Reference: stats for ${Object.keys(out.pro).length} linked players`);

// When the college numbers were last read from Barttorvik (shown on the board).
// Through the relay, it's when the relay last read Barttorvik ("Torvik
// status" tab: year, read at, HTTP status).
let relayAt = null;
if (relayRead && relayStatusUrl) {
  try {
    parseCSV(await get(relayStatusUrl)).forEach(r => { const t = Date.parse(r[1]); if (String(r[2]) === '200' && t && (!relayAt || t > relayAt)) relayAt = t; });
  } catch (e) { /* the date just falls back below */ }
}
out.torvikUpdated = torvikRead ? out.updated
  : relayRead ? (relayAt ? new Date(relayAt).toISOString() : out.updated)
  : ((previous && (previous.torvikUpdated || previous.updated)) || null);
if (relayRead) out.torvikVia = 'sheet relay';

mkdirSync(dirname(OUT), { recursive: true });
// Keep the file byte-identical when nothing changed, so the daily job
// doesn't commit just because the timestamp moved.
if (previous && JSON.stringify([previous.seasons, previous.pro || {}]) === JSON.stringify([out.seasons, out.pro])) {
  console.log('No stat changes.');
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
}
console.log(report.join('\n'));
// Flag it in the Actions log (a yellow warning) when a whole season
// couldn't be refreshed, so a blocked source doesn't go unnoticed.
if (keptSeasons.length && process.env.GITHUB_ACTIONS) {
  console.log(`::warning::Barttorvik could not be read for ${keptSeasons.join(', ')}; the saved numbers were kept.`
    + (torvikRead || relayRead ? '' : ' Barttorvik refuses GitHub\'s servers (HTTP 403). Set up the sheet relay (tools/torvik-relay.gs) or run tools/update-stats from your own computer (see the README).'));
}
