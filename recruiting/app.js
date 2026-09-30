// PUBLISHED GOOGLE SHEETS COMMA-SEPARATED VALUES (.CSV) URL:
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv';

// Define the path back to the main repository where images are stored.
// '../' goes up one directory level. Change to '../../' if you moved the database two levels deep.
const ASSET_BASE_PATH = '../';
const EMPTY_PFP = ASSET_BASE_PATH + 'emptypfpicon.png';

const formatImagePath = (imgStr) => {
  if (!imgStr || imgStr.trim() === "") return "";
  const clean = imgStr.trim();
  if (clean.startsWith('http')) return encodeURI(clean);
  return ASSET_BASE_PATH + encodeURI(clean);
};

// Simple full-page status message, used while the sheet loads and when it
// fails. Without this the page just sat empty on any error.
function showLoadState(message, isError) {
  let el = document.getElementById('loadState');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadState';
    el.className = 'load-state';
    document.body.appendChild(el);
  }
  el.className = 'load-state' + (isError ? ' load-error' : '');
  el.innerHTML = isError
    ? `<div class="load-inner"><h2>Recruiting data unavailable</h2><p>${message}</p></div>`
    : `<div class="load-inner"><div class="load-spinner"></div><p>${message}</p></div>`;
  el.style.display = 'flex';
}

function clearLoadState() {
  const el = document.getElementById('loadState');
  if (el) el.style.display = 'none';
}


const ACCOLADE_MAP = {
  "McDonald's All-American": "mcdaag.png",
  "Nike Hoop Summit": "nikehoopsummit.png",
  "Jordan Brand Classic": "jbc.png"
};

const STAT_LABELS = {
  basic: { ppg: "PPG", rpg: "RPG", apg: "APG", spg: "SPG", bpg: "BPG", topg: "TPG", gp: "GP", mpg: "MPG", fg: "FG%", fg2: "2FG%", fg3: "3FG%", ft: "FT%" },
  advanced: { bpm: "BPM", obpm: "OBPM", dbpm: "DBPM", ts: "TS%", rts: "rTS%", efg: "eFG%", oreb: "OREB%", dreb: "DREB%", trb: "TRB%", ast: "AST%", tov: "TOV%", stl: "STL%", blk: "BLK%", usg: "USG%", ftr: "FTr", p3ar: "3PAr", ortg: "ORtg", drtg: "DRtg", net: "Net" },
  shooting: { fga2: "2FGA", fg2: "2FG%", rimFga: "Rim FGA", rimPct: "Rim %", shortMidFga: "Short Mid FGA", shortMidPct: "Short Mid %", longMidFga: "Long Mid FGA", longMidPct: "Long Mid %", rimMidRatio: "Rim/Mid", fga3: "3FGA", fg3: "3FG%", p3ar: "3PAr", fta: "FTA", ft: "FT%", ftr: "FTr" }
};

const SCALABLE_STATS = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg', 'fga2', 'rimFga', 'shortMidFga', 'longMidFga', 'fga3', 'fta'];

let tabHistory = [];
let currentActiveTab = 'rankings';

let currentStatLevel = 'hs';    
let currentStatView = 'basic';  
let currentStatMode = 'per_game';
let activeSelectedSchool = null;
let selectedStatsPositions = ['PG', 'CG', 'SG', 'SF', 'PF', 'C'];
let queryRules = [];
let isQueryEngaged = false;
let statsSortKey = 'ppg';
let statsSortDir = 'desc';
let recruits = [];
let activeRecruit = null;
let activeAccolade = null;

// ============================================================
// Shared ranking index.
//
// National, position and state ranks are computed once per load and read
// everywhere (rankings rows, the school pop-up, player profiles) so the
// three can never disagree. International players are ranked in their own
// pool: they don't take national or state ranks from domestic prospects,
// which is also why they're left out of a class's national list unless
// the International region is selected.
// ============================================================
let rankIndex = {};

function isInternational(p) {
  const st = String(p && p.state || '').toUpperCase();
  return st === 'INT' || st === 'INTL';
}

// Author's sheet rank first; unranked players fall in behind by rating.
function sheetOrder(a, b) {
  const ra = typeof a.rank === 'number' ? a.rank : Infinity;
  const rb = typeof b.rank === 'number' ? b.rank : Infinity;
  if (ra !== rb) return ra - rb;
  return (b.rating || 0) - (a.rating || 0);
}

function buildRankIndex() {
  rankIndex = {};
  const byClass = {};
  recruits.forEach(r => { (byClass[r.classYear] = byClass[r.classYear] || []).push(r); });

  Object.values(byClass).forEach(list => {
    const domestic = list.filter(r => !isInternational(r)).sort(sheetOrder);
    const intl = list.filter(isInternational).sort(sheetOrder);

    const posCount = {}, stateCount = {};
    domestic.forEach((r, i) => {
      posCount[r.pos] = (posCount[r.pos] || 0) + 1;
      const hasState = r.state && r.state !== 'ALL';
      if (hasState) stateCount[r.state] = (stateCount[r.state] || 0) + 1;
      rankIndex[r.id] = {
        intl: false,
        national: i + 1,
        pos: posCount[r.pos],
        state: hasState ? stateCount[r.state] : null,
        stateLabel: hasState ? r.state : null
      };
    });

    const intlPos = {};
    intl.forEach((r, i) => {
      intlPos[r.pos] = (intlPos[r.pos] || 0) + 1;
      rankIndex[r.id] = { intl: true, national: null, intlRank: i + 1, pos: intlPos[r.pos], state: i + 1, stateLabel: 'INTL' };
    });
  });
}

function commitSchoolOf(p) {
  if (p.committedSchool && String(p.committedSchool).trim()) return String(p.committedSchool).trim();
  const st = String(p.status || '');
  const m = st.match(/(?:committed|signed)\s+(?:to|with)\s+(.+)/i);
  return m ? m[1].trim() : null;
}

function starsHTML(stars) {
  if (stars === 5) return '<span class="stars stars-5" title="5-star">★★★★★</span>';
  if (stars === 4) return '<span class="stars stars-4" title="4-star">★★★★☆</span>';
  if (stars === 3) return '<span class="stars stars-3" title="3-star">★★★☆☆</span>';
  return '<span class="stars stars-3" title="unrated">☆☆☆☆☆</span>';
}

function escAttr(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, "\\'"); }

function openRecruitProfile(p) {
  activeRecruit = p;
  renderProfile(p);
  switchTab('profile');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// One row format used by the class rankings AND the school pop-up.
//
// On desktop it's a normal table row. On a phone the stylesheet turns it
// into a stacked card: rank block on the left, then name / school
// (hometown) / position and size stacked, then stars over the grade, then
// just the committed school's logo — the way 247 lays out its mobile list.
// The mobile-only lines carry the information whose columns get hidden.
function buildRecruitRow(p, opts = {}) {
  const ri = rankIndex[p.id] || {};
  const tr = document.createElement('tr');
  tr.className = 'recruit-row';
  tr.addEventListener('click', () => (opts.onOpen ? opts.onOpen(p) : openRecruitProfile(p)));

  const mainRank = opts.displayRank != null ? opts.displayRank
    : (ri.intl ? ri.intlRank : (ri.national != null ? ri.national : '—'));

  const subs = [];
  if (ri.pos != null) subs.push(`<span class="rank-sub" title="Position rank">${p.pos} ${ri.pos}</span>`);
  if (ri.intl) subs.push(`<span class="rank-sub rank-intl" title="International rank">INTL ${ri.intlRank}</span>`);
  else if (ri.state != null) subs.push(`<span class="rank-sub" title="State rank">${ri.stateLabel} ${ri.state}</span>`);

  const pfpImg = p.pfp && p.pfp.trim() !== '' ? p.pfp : EMPTY_PFP;
  const hsLine = p.hs && p.hs !== 'N/A'
    ? `${p.hs}${p.hometown && p.hometown !== 'N/A' ? ` (${p.hometown})` : ''}`
    : (p.hometown || '');
  const metaBits = [];
  if (opts.showClass) metaBits.push(`'${String(p.classYear).slice(-2)}`);
  metaBits.push(p.pos);
  metaBits.push(`${p.height} / ${p.weight}`);

  const stateDisplay = isInternational(p) ? '<span class="badge-intl">INTL</span>' : `<span>${p.state && p.state !== 'ALL' ? p.state : '—'}</span>`;

  const school = commitSchoolOf(p);
  let commitHTML;
  if (school) {
    const logo = (p.commitLogo && p.commitLogo.trim()) ? p.commitLogo : getSchoolLogoPath(school);
    commitHTML = `<div class="commit-cell" title="Committed to ${escAttr(school)}">
        <img src="${logo}" class="school-logo" loading="lazy" alt="${escAttr(school)}" onerror="schoolLogoFallback(this, '${escAttr(school)}')">
        <span class="commit-name desktop-only">${school}</span>
      </div>`;
  } else {
    commitHTML = `<span class="commit-none"><span class="desktop-only">${p.status || 'Uncommitted'}</span><span class="mobile-only">—</span></span>`;
  }

  tr.innerHTML = `
    <td class="col-rank"><div class="rank-stack"><span class="rank-num">${mainRank}</span>${subs.join('')}</div></td>
    <td class="col-player">
      <div class="player-cell">
        <img src="${pfpImg}" class="player-avatar-sm" loading="lazy" decoding="async" alt="" onerror="this.src='${EMPTY_PFP}';">
        <div class="player-text">
          <span class="player-name">${p.name}</span>
          <span class="player-sub desktop-only">${p.hometown}</span>
          <span class="player-sub mobile-only">${hsLine}</span>
          <span class="player-sub player-meta mobile-only">${metaBits.join(' · ')}</span>
        </div>
      </div>
    </td>
    <td class="col-class"><span class="badge-class">'${String(p.classYear).slice(-2)}</span></td>
    <td class="col-pos"><span class="badge-pos">${p.pos}</span></td>
    <td class="col-htwt"><span>${p.height} / ${p.weight}</span></td>
    <td class="col-state">${stateDisplay}</td>
    <td class="col-hs"><span>${p.hs}</span></td>
    <td class="col-grade"><div class="grade-stack">${starsHTML(p.stars)}<span class="rating-pill">${p.rating}</span></div></td>
    <td class="col-commit">${commitHTML}</td>`;
  return tr;
}

// Column headers matching buildRecruitRow, shared by every recruit table.
function recruitTableHead() {
  return `<tr>
    <th class="col-rank">Rank</th>
    <th class="col-player" style="text-align: left;">Player</th>
    <th class="col-class">Class</th>
    <th class="col-pos">Pos</th>
    <th class="col-htwt">HT / WT</th>
    <th class="col-state">State</th>
    <th class="col-hs">High School / Club</th>
    <th class="col-grade">Rating</th>
    <th class="col-commit" style="text-align: left;">Commit</th>
  </tr>`;
}

window.onload = () => {
  if (GOOGLE_SHEET_CSV_URL === 'YOUR_PUBLISHED_CSV_URL_HERE' || !GOOGLE_SHEET_CSV_URL) {
    alert("Please set your published Google Sheets CSV URL inside the <script> tags at 'GOOGLE_SHEET_CSV_URL'.");
    return;
  }
  
  showLoadState('Loading recruiting database…');

  const handlers = {
    // A failed or unpublished sheet used to leave the page silently blank,
    // which is indistinguishable from "there are no recruits".
    error: function(err) {
      showLoadState('Could not load the recruiting database. Check that the ' +
        'Google Sheet is still published to the web, then reload.', true);
      console.error('Recruiting sheet request failed:', err);
    },
    complete: function(results) {
      try {
        if (!results || !results.data || results.data.length === 0) {
          showLoadState('The recruiting sheet loaded but contained no rows. ' +
            'Check that the published tab is the recruit list.', true);
          return;
        }
        const parseArray = (str) => typeof str === 'string' && str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
        
        // Impossible numbers (a percentage over 100, a count that's really a
        // percentage) are typos in the sheet: they show as blank rather than
        // as a 1150% free-throw rate. The first few are listed in the console.
        const pctOk = v => { const n = parseFloat(String(v).replace('%', '')); return !(n > 100 || n < 0); };
        const guardTier = t => {
          const bad = [];
          ['fg', 'fg2', 'fg3', 'ft', 'ts', 'efg', 'rimPct', 'shortMidPct', 'longMidPct', 'usg', 'tov', 'ast', 'stl', 'blk', 'oreb', 'dreb', 'trb'].forEach(k => {
            if (t[k] && !pctOk(t[k])) { bad.push(k); t[k] = 'N/A'; }
          });
          const limits = { ppg: 80, rpg: 40, apg: 30, spg: 15, bpg: 15, topg: 15, mpg: 48 };
          Object.entries(limits).forEach(([k, max]) => { if (t[k] > max || t[k] < 0) { bad.push(k); t[k] = 0; } });
          return bad;
        };
        const sheetIssues = [];
        const buildStatTierRaw = (row, tier) => ({
          team: String(row[`${tier}_team`] || "N/A"),
          gp: parseInt(row[`${tier}_gp`]) || 0,
          mpg: parseFloat(row[`${tier}_mpg`]) || 0,
          ppg: parseFloat(row[`${tier}_ppg`]) || 0,
          rpg: parseFloat(row[`${tier}_rpg`]) || 0,
          apg: parseFloat(row[`${tier}_apg`]) || 0,
          spg: parseFloat(row[`${tier}_spg`]) || 0,
          bpg: parseFloat(row[`${tier}_bpg`]) || 0,
          topg: parseFloat(row[`${tier}_topg`]) || 0,
          fg: String(row[`${tier}_fg`] || "0.0%"), fg2: String(row[`${tier}_fg2`] || "0.0%"), fg3: String(row[`${tier}_fg3`] || "0.0%"), ft: String(row[`${tier}_ft`] || "0.0%"),
          bpm: String(row[`${tier}_bpm`] || "0.0"), obpm: String(row[`${tier}_obpm`] || "0.0"), dbpm: String(row[`${tier}_dbpm`] || "0.0"),
          ts: String(row[`${tier}_ts`] || "0.0%"), rts: String(row[`${tier}_rts`] || "0.0%"), efg: String(row[`${tier}_efg`] || "0.0%"),
          oreb: String(row[`${tier}_oreb`] || "0.0%"), dreb: String(row[`${tier}_dreb`] || "0.0%"), trb: String(row[`${tier}_trb`] || "0.0%"),
          ast: String(row[`${tier}_ast`] || "0.0%"), tov: String(row[`${tier}_tov`] || "0.0%"), stl: String(row[`${tier}_stl`] || "0.0%"),
          blk: String(row[`${tier}_blk`] || "0.0%"), usg: String(row[`${tier}_usg`] || "0.0%"), ftr: String(row[`${tier}_ftr`] || ".000"),
          p3ar: String(row[`${tier}_p3ar`] || ".000"), ortg: String(row[`${tier}_ortg`] || "0.0"), drtg: String(row[`${tier}_drtg`] || "0.0"), net: String(row[`${tier}_net`] || "0.0"),
          fga2: parseFloat(row[`${tier}_fga2`]) || 0, rimFga: parseFloat(row[`${tier}_rimFga`]) || 0, rimPct: String(row[`${tier}_rimPct`] || "0.0%"),
          shortMidFga: parseFloat(row[`${tier}_shortMidFga`]) || 0, shortMidPct: String(row[`${tier}_shortMidPct`] || "0.0%"),
          longMidFga: parseFloat(row[`${tier}_longMidFga`]) || 0, longMidPct: String(row[`${tier}_longMidPct`] || "0.0%"),
          rimMidRatio: String(row[`${tier}_rimMidRatio`] || "0.00"), fga3: parseFloat(row[`${tier}_fga3`]) || 0, fta: parseFloat(row[`${tier}_fta`]) || 0
        });
        const buildStatTier = (row, tier) => {
          const t = buildStatTierRaw(row, tier);
          const bad = t.gp ? guardTier(t) : [];
          // A turnover count that reads like a percentage means the row slid
          // one column over in the sheet from there on.
          if (t.gp && /%/.test(String(row[`${tier}_topg`] || ''))) { t.misaligned = true; bad.push('row shifted from TOV on'); }
          if (bad.length) sheetIssues.push(`${row.classYear} ${row.name} (${tier}): ${bad.join(', ')}`);
          return t;
        };

        // The schools in a player's final list: the "finalList" column
        // (older tabs called it "finalListSchools"). If that header is ever
        // mistyped, the column right after "finalListTitle" is used, which
        // is where the list always sits.
        const finalListOf = row => {
          let schools = row.finalList || row.finalListSchools;
          if (!schools) {
            const keys = Object.keys(row);
            const i = keys.indexOf('finalListTitle');
            const next = i >= 0 ? keys[i + 1] : null;
            if (next && next !== 'accolades' && next !== 'offers') schools = row[next];
          }
          const list = parseArray(schools);
          return list.length ? { title: String(row.finalListTitle || "Final List"), schools: list } : null;
        };

        recruits = results.data.map(row => ({
          id: String(row.id || ''),
          rank: (row.rank && !isNaN(parseInt(row.rank))) ? parseInt(row.rank) : "N/A",
          classYear: String(row.classYear || "2028"),
          name: String(row.name || "Unknown Player"),
          dob: String(row.dob || "N/A"),
          pfp: formatImagePath(row.avatar),
          pos: String(row.pos || "G"),
          height: String(row.height || "6'0\""),
          weight: String(row.weight || "160 lbs"),
          wingspan: String(row.wingspan || "N/A"),
          hs: String(row.hs || "N/A"),
          state: String(row.state || "ALL"),
          hometown: String(row.hometown || "N/A"),
          stars: (row.stars !== undefined && row.stars !== "" && !isNaN(parseInt(row.stars))) ? parseInt(row.stars) : 3,
          rating: (row.rating !== undefined && row.rating !== "" && !isNaN(parseInt(row.rating))) ? parseInt(row.rating) : 70,
          status: String(row.status || "Uncommitted"),
          committedSchool: row.committedSchool ? String(row.committedSchool) : null,
          commitLogo: formatImagePath(row.commitLogo),
          accolades: parseArray(row.accolades),
          finalList: finalListOf(row),
          offers: parseArray(row.offers),
          scouting: String(row.scouting || "No description available."),
          strengths: parseArray(row.strengths),
          weaknesses: parseArray(row.weaknesses),
          stats: { hs: buildStatTier(row, 'hs'), aau: buildStatTier(row, 'aau'), fiba: buildStatTier(row, 'fiba'), intl: buildStatTier(row, 'intl') }
        }));

        assignStableIds(recruits);
        if (sheetIssues.length) console.warn(`Recruiting sheet: ${sheetIssues.length} stat lines with impossible values (shown blank):\n` + sheetIssues.slice(0, 40).join('\n'));
        buildRankIndex();

        if (recruits.length > 0) {
          activeRecruit = recruits[0];
          renderProfile(activeRecruit);
        }
        filterRecruits();
        renderSchoolRankings();
        renderQueryRulesUI();
        renderStatsDashboard();
        clearLoadState();
        if (location.hash && location.hash !== '#/') applyRoute();
      } catch (error) {
        console.error("Website UI Rendering Error:", error);
        showLoadState('Something went wrong building the recruiting page: ' +
          error.message + '. See the browser console for details.', true);
      }
    }
  };

  // Every tab of the recruiting database (a tab per class plus "Others"),
  // read by the shared loader. Without it, fall back to the first tab.
  if (window.RecruitSheet) {
    RecruitSheet.load(text => Papa.parse(text, { header: true, skipEmptyLines: true }).data, { yearKey: 'classYear', nameKey: 'name' })
      .then(res => {
        if (res.failed.length) console.warn('Recruiting tabs that failed to load:', res.failed.join(', '));
        if (!res.rows.length && res.failed.length === res.tabs.length) handlers.error(new Error('every tab failed'));
        else handlers.complete({ data: res.rows });
      })
      .catch(handlers.error);
  } else {
    Papa.parse(GOOGLE_SHEET_CSV_URL, { download: true, header: true, skipEmptyLines: true, ...handlers });
  }
};


// ============================================================
// Stable ids and links.
//
// Every recruit gets an id from his class and name ("2029-cameron-grant"),
// with his high school added when two players in a class share a name. It
// stays the same from visit to visit, so a profile, a school's class or a
// tab can be linked to and shared, and the browser's Back button works.
// ============================================================
const slugify = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function assignStableIds(list) {
  const count = {};
  list.forEach(r => { const k = `${r.classYear}-${slugify(r.name)}`; count[k] = (count[k] || 0) + 1; });
  const used = new Set();
  list.forEach(r => {
    let id = `${r.classYear}-${slugify(r.name)}`;
    if (count[id] > 1) id += `-${slugify(r.hs) || 'x'}`;
    let n = 2, base = id;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    r.id = id;
  });
}

const TAB_ROUTES = { rankings: '', schoolRankings: 'schools', stats: 'stats', portal: 'portal' };
let routing = false;          // true while the page is following the address, so it doesn't write it back

function currentRoute() {
  if (currentActiveTab === 'profile' && activeRecruit) return `#/player/${activeRecruit.id}`;
  if (currentActiveTab === 'accoladeDetail' && activeAccolade) return `#/event/${slugify(activeAccolade)}`;
  const t = TAB_ROUTES[currentActiveTab];
  return t ? `#/${t}` : (currentActiveTab === 'rankings' ? '#/' : '');
}
function pushRoute(hash) {
  if (routing || !hash || typeof history === 'undefined' || !history.pushState) return;
  if (location.hash === hash || (hash === '#/' && !location.hash)) return;
  history.pushState({ btr: true }, '', hash);
}

// Reads the address and shows what it names. Used on load and when the
// browser goes back or forward.
function applyRoute() {
  const h = decodeURIComponent(location.hash || '').replace(/^#\/?/, '');
  const [kind, rest] = [h.split('/')[0], h.split('/').slice(1).join('/')];
  routing = true;
  try {
    if (kind !== 'school') closeSchoolModal(true);
    if (kind === 'player') {
      const p = recruits.find(r => r.id === rest);
      if (p) { activeRecruit = p; renderProfile(p); switchTab('profile', true); window.scrollTo(0, 0); }
      else switchTab('rankings', true);
    } else if (kind === 'school') {
      const [name, year] = rest.split('/');
      const school = getSchoolRankingsData('ALL').find(x => slugify(x.name) === name);
      if (school) openSchoolModal(school.name, year || document.getElementById('schoolRankingsYearFilter')?.value || 'ALL', true);
    } else if (kind === 'event') {
      const acc = Object.keys(ACCOLADE_MAP).concat([...new Set(recruits.flatMap(r => r.accolades || []))]).find(a => slugify(a) === rest);
      if (acc) { renderAccoladeDetail(acc, activeRecruit ? activeRecruit.classYear : '2028'); activeAccolade = acc; switchTab('accoladeDetail', true); }
    } else {
      const tab = Object.keys(TAB_ROUTES).find(k => TAB_ROUTES[k] === kind) || 'rankings';
      switchTab(tab, true);
    }
  } finally { routing = false; }
  updateBackButton();
}
window.addEventListener('popstate', () => { if (recruits.length) applyRoute(); });

// ============================================================
// Class score.
//
// Like the big recruiting services: every commit adds points for his
// rating, the best commit counts most and each one after counts a little
// less, so a deep class of good players can beat a thin class with one
// star, but only just. Players turning pro aren't a school.
// ============================================================
const NOT_A_SCHOOL = /^(pro|professional|overseas|g league|nba g league|overtime elite|ote|undecided|n\/a|none)$/i;

function classScore(list) {
  const sorted = [...list].sort((a, b) => b.rating - a.rating);
  return sorted.reduce((sum, r, i) => sum + Math.max(0, r.rating - 60) * 2.5 * Math.exp(-(i * i) / (2 * 9 * 9)), 0);
}

// ============================================================
// Profile helpers.
// ============================================================
// The next and previous player in the same class ranking.
function classNeighbours(p) {
  const ri = rankIndex[p.id] || {};
  const pool = recruits.filter(r => r.classYear === p.classYear && isInternational(r) === isInternational(p))
    .sort((a, b) => { const x = rankIndex[a.id] || {}, y = rankIndex[b.id] || {}; return (x.national || x.intlRank || 9e4) - (y.national || y.intlRank || 9e4); });
  const i = pool.findIndex(r => r.id === p.id);
  return { prev: i > 0 ? pool[i - 1] : null, next: i >= 0 && i < pool.length - 1 ? pool[i + 1] : null, at: i + 1, of: pool.length, intl: !!ri.intl };
}

// Colours the profile header with the committed school's colour once its
// logo has loaded.
function tintProfileFromLogo(img) {
  tintFromLogo(img);
  const card = img.closest('.profile-header');
  const c = LOGO_COLOR[img.src];
  if (card && c) card.style.setProperty('--school-color', c);
}

// Filenames in /schoollogos don't always match a school's common name —
// "Texas Christian" is tcu.png, "Georgia Tech" is gtech.png. These mirror
// the alias table the NCAA RP uses so both pages resolve logos the same way.
const SCHOOL_LOGO_ALIASES = {
  texaschristian: 'tcu', georgiatech: 'gtech', northcarolina: 'unc',
  northcarolinastate: 'ncstate', ncstate: 'ncstate', southerncalifornia: 'usc',
  mississippi: 'olemiss', olemiss: 'olemiss', southcarolina: 'scar',
  sandiegostate: 'sdsu', washingtonstate: 'wazzou', connecticut: 'connecticut',
  uconn: 'connecticut', pittsburgh: 'pitt', california: 'cal',
  brighamyoung: 'byu', centralflorida: 'ucf', nevadalasvegas: 'unlv',
  louisianastate: 'lsu', saintjohns: 'stjohns', stjohns: 'stjohns',
  southernmethodist: 'smu', virginiatech: 'virginiatech', bostoncollege: 'bostoncollege',
  miamifl: 'miami', miamiflorida: 'miami'
};

// Schools with no logo file get a generated initials badge rather than a
// broken image.
function generateSchoolBadge(schoolName) {
  const words = String(schoolName).replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w && !['of', 'the', 'at', 'and'].includes(w.toLowerCase()));
  let initials = '?';
  if (words.length === 1) initials = words[0].slice(0, 3).toUpperCase();
  else if (words.length > 1) initials = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
  let hash = 0;
  for (let i = 0; i < schoolName.length; i++) hash = schoolName.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="32" fill="hsl(${hue},50%,36%)"/>` +
    `<text x="32" y="33" font-family="Arial,sans-serif" font-weight="700" font-size="${initials.length >= 3 ? 19 : 23}" ` +
    `fill="#fff" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function getSchoolLogoPath(schoolName) {
  if (!schoolName) return '';
  const clean = String(schoolName).toLowerCase().replace(/[^a-z0-9]/g, '');
  const file = SCHOOL_LOGO_ALIASES[clean] || clean;
  return ASSET_BASE_PATH + `schoollogos/${file}.png`;
}

// A school's colour, read from its logo: the most common strong colour in
// the image, skipping near-white, near-black and see-through pixels. Set on
// the logo's card as --school-color. Cached per logo.
const LOGO_COLOR = {};
function tintFromLogo(img) {
  const card = img.closest('.final-school-card, .offer-pill, .profile-commit-chip');
  if (!card) return;
  const key = img.src;
  const apply = c => { if (c) card.style.setProperty('--school-color', c); };
  if (key in LOGO_COLOR) { apply(LOGO_COLOR[key]); return; }
  let color = null;
  try {
    const n = 32, cv = document.createElement('canvas');
    cv.width = n; cv.height = n;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    const bins = {};
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (a < 200) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max > 235 && min > 215) continue;         // white
      if (max < 28) continue;                        // black
      if (max - min < 24 && max > 60 && max < 200) continue;   // grey
      const k = `${r >> 4},${g >> 4},${b >> 4}`;
      const e = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0 });
      e.n++; e.r += r; e.g += g; e.b += b;
    }
    const top = Object.values(bins).sort((a, b) => b.n - a.n)[0];
    if (top && top.n >= 6) color = `rgb(${Math.round(top.r / top.n)}, ${Math.round(top.g / top.n)}, ${Math.round(top.b / top.n)})`;
  } catch (e) { /* a generated badge or a blocked canvas: no colour */ }
  LOGO_COLOR[key] = color;
  apply(color);
}

// Used in <img onerror> so a missing file falls back to a badge.
function schoolLogoFallback(img, schoolName) {
  img.onerror = null;
  img.src = generateSchoolBadge(schoolName || '?');
}

function parseStatValue(val) {
  if (val === undefined || val === null || val === "N/A") return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    let cleaned = val.replace(/[%+]/g, '').trim();
    let parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function getComputedStat(st, key) {
  if (!st) return "N/A";
  let val = st[key];
  if (val === undefined || val === null) {
    if (key === 'rimMidRatio') {
      let mid = (st.shortMidFga || 0) + (st.longMidFga || 0);
      return mid > 0 ? (st.rimFga / mid).toFixed(2) : "0.00";
    }
    return "N/A";
  }

  if (SCALABLE_STATS.includes(key) && currentStatMode !== 'per_game') {
    let num = parseStatValue(val);
    let mpg = parseFloat(st.mpg) || 0;
    if (num !== null && mpg > 0) {
      let factor = 1;
      if (currentStatMode === 'per_40') factor = 40 / mpg;
      else if (currentStatMode === 'per_75') factor = 37.5 / mpg;
      else if (currentStatMode === 'per_100') factor = 50 / mpg;
      return (num * factor).toFixed(1);
    }
  }

  return val;
}

function switchTab(tabName, isBack = false) {
  if (!isBack && currentActiveTab !== tabName) {
    tabHistory.push(currentActiveTab);
  }
  currentActiveTab = tabName;

  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  if (tabName === 'rankings') {
    document.getElementById('rankings-tab').classList.add('active');
    if (document.querySelectorAll('.nav-btn')[0]) document.querySelectorAll('.nav-btn')[0].classList.add('active');
  } else if (tabName === 'schoolRankings') {
    document.getElementById('schoolRankings-tab').classList.add('active');
    if (document.querySelectorAll('.nav-btn')[1]) document.querySelectorAll('.nav-btn')[1].classList.add('active');
  } else if (tabName === 'stats') {
    document.getElementById('stats-tab').classList.add('active');
    if (document.querySelectorAll('.nav-btn')[2]) document.querySelectorAll('.nav-btn')[2].classList.add('active');
  } else if (tabName === 'portal') {
    document.getElementById('portal-tab').classList.add('active');
    if (document.querySelectorAll('.nav-btn')[3]) document.querySelectorAll('.nav-btn')[3].classList.add('active');
    if (typeof renderPortal === 'function') renderPortal();
  } else if (tabName === 'profile') {
    document.getElementById('profile-tab').classList.add('active');
  } else if (tabName === 'accoladeDetail') {
    document.getElementById('accoladeDetail-tab').classList.add('active');
  }
  
  pushRoute(currentRoute());
  updateBackButton();
}

function updateBackButton() {
  const backBtn = document.getElementById('globalBackBtn');
  if (backBtn) backBtn.style.display = currentActiveTab !== 'rankings' || tabHistory.length > 0 ? 'inline-flex' : 'none';
}

function goBack() {
  // When the page itself put entries in the browser history, Back follows it.
  if (history.state && history.state.btr) { history.back(); return; }
  if (tabHistory.length === 0 && currentActiveTab !== 'rankings') { switchTab('rankings'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (tabHistory.length > 0) {
    const prevTab = tabHistory.pop();
    switchTab(prevTab, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function filterAndGoToRankings(classYr, pos = 'ALL', state = 'ALL') {
  const cFilter = document.getElementById('classFilter');
  const pFilter = document.getElementById('posFilter');
  const sFilter = document.getElementById('stateFilter');
  const sInput = document.getElementById('searchInput');
  const starFilter = document.getElementById('starFilter');

  if (cFilter) cFilter.value = classYr || '2028';
  if (pFilter) pFilter.value = pos || 'ALL';
  if (sFilter) sFilter.value = state || 'ALL';
  if (sInput) sInput.value = '';
  if (starFilter) starFilter.value = 'ALL';

  filterRecruits();
  switchTab('rankings');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setStatLevel(level, element) { currentStatLevel = level; document.querySelectorAll('#levelTabs .sub-nav-btn').forEach(btn => btn.classList.remove('active')); if (element) element.classList.add('active'); renderStatsDashboard(); }
function setStatMode(mode, element) { currentStatMode = mode; document.querySelectorAll('#modeTabs .sub-nav-btn').forEach(btn => btn.classList.remove('active')); if (element) element.classList.add('active'); renderStatsDashboard(); }
function setStatView(view, element) { 
  currentStatView = view; 
  document.querySelectorAll('#viewTabs .sub-nav-btn').forEach(btn => btn.classList.remove('active')); 
  if (element) element.classList.add('active'); 
  if (view === 'basic') statsSortKey = 'ppg'; else if (view === 'advanced') statsSortKey = 'bpm'; else if (view === 'shooting') statsSortKey = 'fg2'; 
  statsSortDir = 'desc'; 
  renderQueryRulesUI(); renderStatsDashboard(); 
}

function togglePosFilter(pos, btn) {
  if (selectedStatsPositions.includes(pos)) { selectedStatsPositions = selectedStatsPositions.filter(p => p !== pos); btn.classList.remove('active'); }
  else { selectedStatsPositions.push(pos); btn.classList.add('active'); }
  renderStatsDashboard();
}

function toggleAllPositions() {
  const allPos = ['PG', 'CG', 'SG', 'SF', 'PF', 'C'];
  const pills = document.querySelectorAll('.pos-pill-group .pos-pill');
  
  if (selectedStatsPositions.length === allPos.length) {
    selectedStatsPositions = [];
    pills.forEach(btn => btn.classList.remove('active'));
  } else {
    selectedStatsPositions = [...allPos];
    pills.forEach(btn => btn.classList.add('active'));
  }
  renderStatsDashboard();
}

function toggleQueryEngage() { isQueryEngaged = !isQueryEngaged; renderQueryRulesUI(); renderStatsDashboard(); }
function addQueryRule() { const availableStats = Object.keys(STAT_LABELS[currentStatView]); queryRules.push({ id: Date.now().toString() + Math.random().toString(36).substr(2, 4), statKey: availableStats[0] || 'ppg', op: '>=', value: '' }); isQueryEngaged = true; renderQueryRulesUI(); renderStatsDashboard(); }
function removeQueryRule(id) { queryRules = queryRules.filter(r => r.id !== id); if (queryRules.length === 0) isQueryEngaged = false; renderQueryRulesUI(); renderStatsDashboard(); }
function clearQueryRules() { queryRules = []; isQueryEngaged = false; renderQueryRulesUI(); renderStatsDashboard(); }
function updateQueryRule(id, field, val) { const rule = queryRules.find(r => r.id === id); if (rule) { rule[field] = val; renderStatsDashboard(); } }

function renderQueryRulesUI() {
  const container = document.getElementById('queryRulesContainer'); const badge = document.getElementById('queryEngagedBadge'); const toggleBtn = document.getElementById('toggleQueryBtn');
  if (isQueryEngaged) { badge.innerText = 'ENGAGED'; badge.style.background = 'rgba(39, 174, 96, 0.2)'; badge.style.color = 'var(--win)'; badge.style.border = '1px solid var(--win)'; toggleBtn.innerText = 'Disengage Query Search'; toggleBtn.classList.add('engaged'); }
  else { badge.innerText = 'OFF'; badge.style.background = 'var(--heat-neutral-bg)'; badge.style.color = 'var(--text-muted)'; badge.style.border = '1px solid var(--border-color)'; toggleBtn.innerText = 'Engage Query Search'; toggleBtn.classList.remove('engaged'); }
  if (queryRules.length === 0) { container.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; padding: 4px 0;">No active stat query rules. Click "+ Add Stat Rule" to query player statistics.</div>`; return; }
  const availableStats = STAT_LABELS[currentStatView];
  container.innerHTML = queryRules.map((rule) => {
    if (!availableStats[rule.statKey]) rule.statKey = Object.keys(availableStats)[0];
    const statOptionsHTML = Object.entries(availableStats).map(([k, label]) => `<option value="${k}" ${rule.statKey === k ? 'selected' : ''}>${label}</option>`).join('');
    return `
      <div class="query-rule-row">
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold;">Stat:</span>
        <select class="select-input" style="padding: 6px 10px; font-size: 0.75rem;" onchange="updateQueryRule('${rule.id}', 'statKey', this.value)">${statOptionsHTML}</select>
        <select class="select-input" style="padding: 6px 10px; font-size: 0.75rem; width: 70px;" onchange="updateQueryRule('${rule.id}', 'op', this.value)"><option value=">=" ${rule.op === '>=' ? 'selected' : ''}>&ge;</option><option value="<=" ${rule.op === '<=' ? 'selected' : ''}>&le;</option></select>
        <input type="number" step="any" class="search-input" style="width: 110px; padding: 6px 10px; font-size: 0.75rem;" placeholder="Value" value="${rule.value}" oninput="updateQueryRule('${rule.id}', 'value', this.value)">
        <button class="query-btn query-btn-danger" style="padding: 4px 8px;" onclick="removeQueryRule('${rule.id}')">&times;</button>
      </div>
    `;
  }).join('');
}

function matchesQueryRules(p, level) {
  if (!isQueryEngaged || queryRules.length === 0) return true;
  const st = p.stats[level]; if (!st) return false;
  for (let rule of queryRules) {
    if (!rule.statKey || rule.value === "" || rule.value === null) continue;
    let pVal = parseStatValue(getComputedStat(st, rule.statKey)); let targetVal = parseFloat(rule.value);
    if (pVal === null || isNaN(targetVal)) continue;
    if (rule.op === '>=' && pVal < targetVal) return false;
    if (rule.op === '<=' && pVal > targetVal) return false;
  }
  return true;
}

function calculatePercentileMap(players, level, keys) {
  let map = {};
  keys.forEach(key => {
    let validPairs = [];
    players.forEach(p => { let st = p.stats[level]; if (st) { let num = parseStatValue(getComputedStat(st, key)); if (num !== null) validPairs.push({ id: p.id, val: num }); } });
    if (validPairs.length === 0) return;
    const N = validPairs.length; map[key] = {};
    // Sort once and walk the runs, rather than rescanning every other
    // player for each player. The old approach was quadratic per stat and
    // ran on every filter change, so the dashboard got slower with every
    // class added.
    const sorted = validPairs.slice().sort((a, b) => a.val - b.val);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].val === sorted[i].val) j++;
      const countLess = i;
      const countEqual = j - i;
      const pct = N > 1 ? ((countLess + 0.5 * countEqual) / N) * 100 : 50;
      for (let k = i; k < j; k++) map[key][sorted[k].id] = pct;
      i = j;
    }
  });
  return map;
}

function getPercentileStyle(pct, key) {
  if (pct === undefined || pct === null) return '';

  const negativeStats = ['topg', 'tov', 'drtg'];
  let effectivePct = pct;
  if (negativeStats.includes(key)) effectivePct = 100 - pct;

  // Background tint is unchanged; the TEXT colour comes from theme
  // variables. The old fixed lime/salmon text was built for a black
  // background and washed out on white, and neutral cells used pure white
  // text, which disappeared entirely in light mode.
  if (effectivePct >= 60) {
    const intensity = (effectivePct - 60) / 40;
    const alpha = 0.12 + intensity * 0.38;
    return `background-color: rgba(39, 174, 96, ${alpha.toFixed(2)}); color: var(--heat-good-text); font-weight: 700;`;
  } else if (effectivePct <= 40) {
    const intensity = (40 - effectivePct) / 40;
    const alpha = 0.12 + intensity * 0.38;
    return `background-color: rgba(231, 76, 60, ${alpha.toFixed(2)}); color: var(--heat-bad-text); font-weight: 700;`;
  }
  return `background-color: var(--heat-neutral-bg); color: var(--text-main);`;
}

function filterRecruits() {
  const query = String(document.getElementById('searchInput').value).toLowerCase().trim();
  const classYr = document.getElementById('classFilter').value;
  const state = document.getElementById('stateFilter').value;
  const pos = document.getElementById('posFilter').value;
  const star = document.getElementById('starFilter').value;
  const commit = (document.getElementById('commitFilter') || {}).value || 'ALL';
  const overall = classYr === 'OVERALL';
  renderClassSummary(overall ? null : classYr);

  // International prospects have their own pool. They stay out of a
  // class's national list unless the International region is chosen, or
  // the all-classes view is on — and a search always finds them, so a
  // player can never be hidden from someone looking for him by name.
  const includeIntl = overall || state === 'INT' || query !== '';

  let filtered = recruits.filter(r => {
    if (!includeIntl && isInternational(r)) return false;
    const matchesSearch = !query || String(r.name || "").toLowerCase().includes(query) || String(r.hs || "").toLowerCase().includes(query);
    const matchesClass = overall ? true : (r.classYear === classYr);
    const matchesState = state === 'ALL' || r.state === state;
    const matchesPos = pos === 'ALL' || r.pos === pos;
    const matchesStar = star === 'ALL' || r.stars.toString() === star;
    const committed = !!commitSchoolOf(r);
    const matchesCommit = commit === 'ALL' || (commit === 'COMMITTED' ? committed : !committed);
    return matchesSearch && matchesClass && matchesState && matchesPos && matchesStar && matchesCommit;
  });

  if (overall) {
    filtered.sort((a, b) => b.rating - a.rating);
  } else {
    const key = r => { const ri = rankIndex[r.id] || {}; return ri.intl ? 100000 + ri.intlRank : (ri.national || 99999); };
    filtered.sort((a, b) => key(a) - key(b));
  }
  renderRankingsTable(filtered, overall);
}

// A strip over the class list: how big the class is, how many five-stars,
// how many have committed, and the school with the top class so far.
function renderClassSummary(classYr) {
  const el = document.getElementById('classSummary');
  if (!el) return;
  if (!classYr) { el.innerHTML = ''; el.hidden = true; return; }
  const list = recruits.filter(r => r.classYear === classYr && !isInternational(r));
  if (!list.length) { el.innerHTML = ''; el.hidden = true; return; }
  const five = list.filter(r => r.stars === 5).length, four = list.filter(r => r.stars === 4).length;
  const committed = list.filter(r => commitSchoolOf(r)).length;
  const top = getSchoolRankingsData(classYr)[0];
  const intl = recruits.filter(r => r.classYear === classYr && isInternational(r)).length;
  el.hidden = false;
  el.innerHTML = `
    <div class="cs-item"><b>${list.length}</b><span>ranked${intl ? ` <em>+ ${intl} international</em>` : ''}</span></div>
    <div class="cs-item"><b class="stars-5">${five}</b><span>five-stars</span></div>
    <div class="cs-item"><b class="stars-4">${four}</b><span>four-stars</span></div>
    <div class="cs-item cs-bar"><b>${Math.round(committed / list.length * 100)}%</b><span>committed</span><i style="width:${committed / list.length * 100}%"></i></div>
    ${top ? `<button class="cs-item cs-top" onclick="openSchoolModal('${escAttr(top.name)}', '${classYr}')">
      <img src="${top.logo}" alt="" onerror="schoolLogoFallback(this, '${escAttr(top.name)}')"><span><small>Top class</small><b>${top.name}</b></span></button>` : ''}`;
}

function renderRankingsTable(data, isOverall = false) {
  const table = document.getElementById('rankingsTable');
  // The Class column only means anything when several classes are mixed.
  if (table) table.classList.toggle('show-class', isOverall);

  const tbody = document.getElementById('recruitsTableBody'); tbody.innerHTML = '';
  if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No players match the current filter selection.</td></tr>`; return; }

  const frag = document.createDocumentFragment();
  data.forEach((p, index) => {
    frag.appendChild(buildRecruitRow(p, {
      displayRank: isOverall ? index + 1 : null,
      showClass: isOverall
    }));
  });
  tbody.appendChild(frag);
}

function getSchoolRankingsData(yearFilter = 'ALL') {
  const schoolMap = {};
  let filteredRecruits = yearFilter !== 'ALL' ? recruits.filter(r => r.classYear === yearFilter) : recruits;

  filteredRecruits.forEach(r => {
    const schoolName = commitSchoolOf(r);
    if (schoolName && !NOT_A_SCHOOL.test(schoolName)) {
      if (!schoolMap[schoolName]) schoolMap[schoolName] = { name: schoolName, logo: (r.commitLogo && r.commitLogo.trim()) ? r.commitLogo : getSchoolLogoPath(schoolName), recruits: [] };
      schoolMap[schoolName].recruits.push(r);
    }
  });

  const schoolList = Object.values(schoolMap).map(s => {
    s.recruits.sort((a, b) => b.rating - a.rating);
    let currentScore = 0; let weight = 1.0;
    s.recruits.forEach((r) => { let impact = (r.rating / 100) * weight; currentScore = currentScore + ((100 - currentScore) * impact); weight *= 0.8; });
    const starCounts = { 5: 0, 4: 0, 3: 0 };
    s.recruits.forEach(r => { if (starCounts[r.stars] !== undefined) starCounts[r.stars] += 1; });
    const avg = s.recruits.reduce((n, r) => n + (r.rating || 0), 0) / s.recruits.length;
    return { ...s, recruitCount: s.recruits.length, starCounts, overallGrade: parseFloat(currentScore.toFixed(2)), score: Math.round(classScore(s.recruits) * 10) / 10, avgRating: Math.round(avg * 10) / 10 };
  });

  schoolList.sort((a, b) => b.score - a.score || b.recruitCount - a.recruitCount);
  return schoolList;
}

function renderSchoolRankings() {
  const yearFilter = document.getElementById('schoolRankingsYearFilter')?.value || '2028';
  const searchTxt = (document.getElementById('schoolSearchInput')?.value || '').toLowerCase();
  let schoolList = getSchoolRankingsData(yearFilter);
  
  if (searchTxt) {
    schoolList = schoolList.filter(s => s.name.toLowerCase().includes(searchTxt));
  }

  const tbody = document.getElementById('schoolRankingsTableBody'); tbody.innerHTML = '';
  if (schoolList.length === 0) { tbody.innerHTML = `<tr><td colspan="5" style="color: var(--text-muted); padding: 2rem;">No school commitments registered for this selection.</td></tr>`; return; }

  schoolList.forEach((s, idx) => {
    const row = document.createElement('tr');
    row.className = 'school-row';
    row.onclick = () => openSchoolModal(s.name, yearFilter);
    row.innerHTML = `
      <td class="col-srank"><span class="rank-num">${idx + 1}</span></td>
      <td class="col-school">
        <div class="status-cell">
          <img src="${s.logo}" class="school-logo-lg" alt="" onerror="schoolLogoFallback(this, '${escAttr(s.name)}')">
          <div class="player-text">
            <span class="player-name">${s.name}</span>
            <span class="player-sub mobile-only">${s.recruitCount} ${s.recruitCount === 1 ? 'commit' : 'commits'}</span>
          </div>
        </div>
      </td>
      <td class="col-commits">${s.recruitCount}</td>
      <td class="col-breakdown">${starBreakdownHTML(s.starCounts)}</td>
      <td class="col-sgrade"><span class="rating-pill grade-pill">${s.score.toFixed(1)}</span><span class="grade-avg desktop-only">avg ${s.avgRating.toFixed(1)}</span></td>
    `;
    tbody.appendChild(row);
  });
}

function starBreakdownHTML(c) {
  c = c || {};
  return `<div class="star-breakdown">
    <span class="sb sb-5" title="5-star commits"><span class="sb-star">5★</span><b>${c[5] || 0}</b></span>
    <span class="sb sb-4" title="4-star commits"><span class="sb-star">4★</span><b>${c[4] || 0}</b></span>
    <span class="sb sb-3" title="3-star commits"><span class="sb-star">3★</span><b>${c[3] || 0}</b></span>
  </div>`;
}

// ============================================================
// School pop-up.
//
// Clicking a school opens its class in a modal — team ranking, class
// grade and star breakdown up top, then its commits listed in exactly the
// same rows as the class rankings page.
// ============================================================
function availableClassYears() {
  return [...new Set(recruits.map(r => String(r.classYear)))].filter(Boolean).sort();
}

function openSchoolModal(schoolName, year, fromRoute) {
  let modal = document.getElementById('schoolModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'schoolModal';
    modal.className = 'school-modal-backdrop';
    modal.addEventListener('click', e => { if (e.target === modal) closeSchoolModal(); });
    document.body.appendChild(modal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSchoolModal(); });
  }
  activeSelectedSchool = schoolName;
  renderSchoolModal(schoolName, year || 'ALL');
  modal.classList.add('open');
  document.body.classList.add('modal-open');
  if (!fromRoute) pushRoute(`#/school/${slugify(schoolName)}${year && year !== 'ALL' ? '/' + year : ''}`);
}

function closeSchoolModal(fromRoute) {
  const modal = document.getElementById('schoolModal');
  if (!modal || !modal.classList.contains('open')) return;
  modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  // Closing it by hand takes the address back to where it was.
  if (!fromRoute && /^#\/school\//.test(location.hash)) {
    if (history.state && history.state.btr) history.back();
    else history.replaceState(null, '', currentRoute() || '#/');
  }
}

function renderSchoolModal(schoolName, year) {
  const modal = document.getElementById('schoolModal');
  if (!modal) return;

  const list = getSchoolRankingsData(year);
  const idx = list.findIndex(s => s.name === schoolName);
  const data = idx >= 0 ? list[idx] : null;
  const logo = data ? data.logo : getSchoolLogoPath(schoolName);
  const commits = data ? data.recruits.slice().sort((a, b) => {
    const ka = (rankIndex[a.id] || {}).national || 99999, kb = (rankIndex[b.id] || {}).national || 99999;
    return ka - kb || b.rating - a.rating;
  }) : [];
  const yearLabel = year === 'ALL' ? 'All Classes' : `Class of ${year}`;
  const showClass = year === 'ALL';

  const years = availableClassYears();
  const options = [`<option value="ALL" ${year === 'ALL' ? 'selected' : ''}>All Classes</option>`]
    .concat(years.map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>Class of ${y}</option>`)).join('');

  modal.innerHTML = `
    <div class="school-modal" role="dialog" aria-modal="true" aria-label="${escAttr(schoolName)} recruiting class">
      <button class="school-modal-close" onclick="closeSchoolModal()" aria-label="Close">&times;</button>
      <div class="school-modal-head">
        <img src="${logo}" class="school-modal-logo" alt="" onerror="schoolLogoFallback(this, '${escAttr(schoolName)}')">
        <div class="school-modal-title">
          <h2>${schoolName}</h2>
          <div class="school-modal-sub">${yearLabel} Recruiting</div>
        </div>
        <select class="select-input school-modal-year" onchange="renderSchoolModal('${escAttr(schoolName)}', this.value)">${options}</select>
      </div>

      <div class="school-modal-stats">
        <div class="school-stat-card">
          <div class="school-stat-val">${data ? '#' + (idx + 1) : '—'}</div>
          <div class="school-stat-lbl">Team Ranking${data ? ` <span class="of-n">of ${list.length}</span>` : ''}</div>
        </div>
        <div class="school-stat-card">
          <div class="school-stat-val">${data ? data.score.toFixed(1) : '—'}</div>
          <div class="school-stat-lbl">Class Score${data ? ` <span class="of-n">avg ${data.avgRating.toFixed(1)}</span>` : ''}</div>
        </div>
        <div class="school-stat-card">
          <div class="school-stat-val">${commits.length}</div>
          <div class="school-stat-lbl">Commits</div>
        </div>
        <div class="school-stat-card school-stat-stars">
          ${starBreakdownHTML(data ? data.starCounts : null)}
          <div class="school-stat-lbl">Star Breakdown</div>
        </div>
      </div>

      ${commits.length === 0
        ? `<div class="table-empty">No commitments for ${schoolName} in the ${yearLabel.toLowerCase()}.</div>`
        : `<div class="table-container"><table class="recruit-table${showClass ? ' show-class' : ''}">
             <thead>${recruitTableHead()}</thead><tbody></tbody>
           </table></div>`}
    </div>`;

  const tbody = modal.querySelector('tbody');
  if (tbody) {
    commits.forEach(p => tbody.appendChild(buildRecruitRow(p, {
      showClass,
      onOpen: (rec) => { closeSchoolModal(true); history.replaceState({ btr: true }, '', `#/player/${rec.id}`); openRecruitProfile(rec); }
    })));
  }
}

function selectSchool(schoolName, defaultYear = 'ALL') { openSchoolModal(schoolName, defaultYear); }

function openAccoladeRoster(accoladeName, selectedYear = '2028') { activeAccolade = accoladeName; renderAccoladeDetail(accoladeName, selectedYear); switchTab('accoladeDetail'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function renderAccoladeDetail(accoladeName, selectedYear = '2028') {
  const container = document.getElementById('accoladeDetailContainer');
  const logoPath = ACCOLADE_MAP[accoladeName] ? ASSET_BASE_PATH + ACCOLADE_MAP[accoladeName] : '';
  const selectedPlayers = recruits.filter(r => (r.accolades && r.accolades.includes(accoladeName)) && (selectedYear === 'ALL' || r.classYear === selectedYear));
  
  const safeAccoladeName = String(accoladeName).replace(/'/g, "\\'");
  let rosterHTML = '';

  if (selectedPlayers.length === 0) {
    rosterHTML = `<div style="color: var(--text-muted); padding: 2.5rem; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); text-align: center; font-size: 0.9rem;">No players selected for ${accoladeName} ${selectedYear !== 'ALL' ? `in Class of ${selectedYear}` : ''}.</div>`;
  } else if (accoladeName === "McDonald's All-American" || accoladeName === "Jordan Brand Classic") {
    const team1Name = accoladeName === "McDonald's All-American" ? "East" : "Team Air";
    const team2Name = accoladeName === "McDonald's All-American" ? "West" : "Team Flight";
    
    const classes = [...new Set(selectedPlayers.map(p => p.classYear))].sort();
    
    rosterHTML = classes.map(cls => {
      let classPlayers = selectedPlayers.filter(p => p.classYear === cls);
      
      classPlayers.sort((a, b) => {
        const hash = (str) => [...str].reduce((s, c) => Math.imul(31, s) + c.charCodeAt(0) | 0, 0);
        return hash(a.id) - hash(b.id);
      });

      const team1 = classPlayers.filter((_, i) => i % 2 === 0);
      const team2 = classPlayers.filter((_, i) => i % 2 !== 0);

      const renderCard = (r) => `<div class="commit-player-card" onclick="activeRecruit = recruits.find(p => p.id === '${r.id}'); renderProfile(activeRecruit); switchTab('profile');"><img src="${r.pfp && r.pfp.trim() !== '' ? r.pfp : EMPTY_PFP}" class="player-avatar-sm" loading="lazy" decoding="async" style="width: 52px; height: 52px;" onerror="this.src='${EMPTY_PFP}';"><div style="flex: 1;"><div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${r.name}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Class of '${r.classYear.slice(-2)} | ${r.pos} | ${r.height}</div><div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${r.hs} (${r.state})</div><div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; justify-content: space-between;"><div>${r.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (r.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`)}</div><span class="rating-pill" style="font-size: 0.75rem; padding: 2px 6px;">${r.rating} OVR</span></div></div></div>`;

      return `
        <div style="margin-top: 1.5rem; margin-bottom: 0.5rem;"><h3 style="font-size: 1.2rem; color: var(--accent-main); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Class of ${cls}</h3></div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;">
          <div>
            <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 1px;">${team1Name}</h4>
            <div class="school-commits-grid" style="grid-template-columns: 1fr; margin-top: 0;">
              ${team1.map(renderCard).join('')}
            </div>
          </div>
          <div>
            <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 1px;">${team2Name}</h4>
            <div class="school-commits-grid" style="grid-template-columns: 1fr; margin-top: 0;">
              ${team2.map(renderCard).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    const renderCard = (r) => `<div class="commit-player-card" onclick="activeRecruit = recruits.find(p => p.id === '${r.id}'); renderProfile(activeRecruit); switchTab('profile');"><img src="${r.pfp && r.pfp.trim() !== '' ? r.pfp : EMPTY_PFP}" class="player-avatar-sm" loading="lazy" decoding="async" style="width: 52px; height: 52px;" onerror="this.src='${EMPTY_PFP}';"><div style="flex: 1;"><div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${r.name}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Class of '${r.classYear.slice(-2)} | ${r.pos} | ${r.height}</div><div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${r.hs} (${r.state})</div><div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; justify-content: space-between;"><div>${r.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (r.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`)}</div><span class="rating-pill" style="font-size: 0.75rem; padding: 2px 6px;">${r.rating} OVR</span></div></div></div>`;
    rosterHTML = `<div class="school-commits-grid">${selectedPlayers.map(renderCard).join('')}</div>`;
  }

  container.innerHTML = `
    <div class="school-detail-header">
      <div class="school-detail-brand">
        ${logoPath ? `<img src="${logoPath}" class="school-detail-logo" style="width: 64px; height: 64px;" onerror="this.style.display='none';">` : ''}
        <div><h1 style="font-size: 1.8rem; text-transform: uppercase;">${accoladeName}</h1><div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px;">ALL-STAR ROSTER SELECTIONS</div></div>
      </div>
      <div class="school-detail-stats"><div class="school-stat-card"><div class="school-stat-val">${selectedPlayers.length}</div><div class="school-stat-lbl">Selections</div></div></div>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 10px;">
      <h2 style="font-size: 1.1rem;">Roster</h2>
      <div style="display: flex; align-items: center; gap: 10px;">
        <label for="accoladeClassFilter" style="font-size: 0.8rem; color: var(--text-muted);">Filter Class:</label>
        <select id="accoladeClassFilter" class="select-input" onchange="renderAccoladeDetail('${safeAccoladeName}', this.value)">
          <option value="ALL" ${selectedYear === 'ALL' ? 'selected' : ''}>All Classes</option>
          <option value="2028" ${selectedYear === '2028' ? 'selected' : ''}>Class of 2028</option><option value="2029" ${selectedYear === '2029' ? 'selected' : ''}>Class of 2029</option><option value="2030" ${selectedYear === '2030' ? 'selected' : ''}>Class of 2030</option><option value="2031" ${selectedYear === '2031' ? 'selected' : ''}>Class of 2031</option><option value="2032" ${selectedYear === '2032' ? 'selected' : ''}>Class of 2032</option><option value="2033" ${selectedYear === '2033' ? 'selected' : ''}>Class of 2033</option><option value="2034" ${selectedYear === '2034' ? 'selected' : ''}>Class of 2034</option><option value="2035" ${selectedYear === '2035' ? 'selected' : ''}>Class of 2035</option><option value="2036" ${selectedYear === '2036' ? 'selected' : ''}>Class of 2036</option><option value="2037" ${selectedYear === '2037' ? 'selected' : ''}>Class of 2037</option><option value="2038" ${selectedYear === '2038' ? 'selected' : ''}>Class of 2038</option><option value="2039" ${selectedYear === '2039' ? 'selected' : ''}>Class of 2039</option><option value="2040" ${selectedYear === '2040' ? 'selected' : ''}>Class of 2040</option>
        </select>
      </div>
    </div>
    ${rosterHTML}
  `;
}

function sortStats(key) { if (statsSortKey === key) statsSortDir = statsSortDir === 'desc' ? 'asc' : 'desc'; else { statsSortKey = key; statsSortDir = 'desc'; } renderStatsDashboard(); }

function renderStatsDashboard() {
  const tbody = document.getElementById('statsTableBody'); 
  const thead = document.getElementById('statsTableHeader'); 
  const cls = document.getElementById('statsClassFilter')?.value || '2028';
  const searchTxt = (document.getElementById('statsSearchInput')?.value || '').toLowerCase();

  let filtered = recruits.filter(r => { 
    const matchesSearch = String(r.name || "").toLowerCase().includes(searchTxt) || String(r.hs || "").toLowerCase().includes(searchTxt);
    const matchesClass = cls === 'ALL' || r.classYear === cls; 
    const matchesPos = selectedStatsPositions.includes(r.pos); 
    const hasStats = r.stats && r.stats[currentStatLevel] && r.stats[currentStatLevel].gp > 0; 
    return matchesSearch && matchesClass && matchesPos && hasStats && matchesQueryRules(r, currentStatLevel); 
  });
  
  filtered.sort((a, b) => { let valA = parseStatValue(getComputedStat(a.stats[currentStatLevel], statsSortKey)); let valB = parseStatValue(getComputedStat(b.stats[currentStatLevel], statsSortKey)); if (valA === null) valA = -9999; if (valB === null) valB = -9999; return statsSortDir === 'desc' ? valB - valA : valA - valB; });
  const keys = Object.keys(STAT_LABELS[currentStatView]);
  const pctMap = calculatePercentileMap(filtered, currentStatLevel, keys);

  let headersHTML = `<tr><th style="text-align: left;">Player</th><th>POS</th><th>Class</th>`;
  keys.forEach(k => { let label = STAT_LABELS[currentStatView][k]; let arrow = statsSortKey === k ? (statsSortDir === 'desc' ? ' ▼' : ' ▲') : ''; headersHTML += `<th class="sortable" onclick="sortStats('${k}')">${label}${arrow}</th>`; });
  headersHTML += `</tr>`; thead.innerHTML = headersHTML; tbody.innerHTML = '';
  if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="${keys.length + 3}" style="color: var(--text-muted); padding: 2rem;">No players match the current filters or query rules.</td></tr>`; return; }

  filtered.forEach(p => {
    let st = p.stats[currentStatLevel]; const row = document.createElement('tr');
    row.onclick = () => { activeRecruit = p; renderProfile(p); switchTab('profile'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    let html = `<td><div class="player-cell"><img src="${p.pfp && p.pfp.trim() !== '' ? p.pfp : EMPTY_PFP}" class="player-avatar-sm" loading="lazy" decoding="async" onerror="this.src='${EMPTY_PFP}';"><span class="player-name">${p.name}</span></div></td><td><span class="badge-pos">${p.pos}</span></td><td><span class="badge-class">'${p.classYear.slice(-2)}</span></td>`;
    keys.forEach(k => { let rawVal = getComputedStat(st, k); let pct = pctMap[k] ? pctMap[k][p.id] : null; let style = getPercentileStyle(pct, k); html += `<td style="${style}">${rawVal}</td>`; });
    row.innerHTML = html + `</tr>`; tbody.appendChild(row);
  });
}

function copyProfileLink(btn) {
  const url = location.href.split('#')[0] + (activeRecruit ? `#/player/${activeRecruit.id}` : '');
  const done = () => { if (btn) { const t = btn.textContent; btn.textContent = 'Link copied'; setTimeout(() => { btn.textContent = t; }, 1600); } };
  if (navigator.share && /Mobi/i.test(navigator.userAgent)) { navigator.share({ title: activeRecruit ? activeRecruit.name : 'BYTHERIM Recruiting', url }).catch(() => {}); return; }
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url));
  else prompt('Copy this link:', url);
}

function renderProfile(p) {
  if(!p) return;
  const container = document.getElementById('profileContainer');
  const starDisplay = p.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (p.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`);
  
  // Ranks come from the shared index so the profile always agrees with the
  // rankings rows. International players have no national or state rank —
  // they're ranked among internationals instead.
  const ri = rankIndex[p.id] || {};
  const classRank = ri.intl ? '—' : (ri.national != null ? `#${ri.national}` : 'N/A');
  const posRank = ri.pos != null ? `#${ri.pos}${ri.intl ? ' (INTL)' : ''}` : 'N/A';
  const stateRank = ri.intl ? `#${ri.intlRank} (INTL)` : (ri.state != null ? `#${ri.state} (${ri.stateLabel})` : 'N/A');

  const statusHTML = p.commitLogo ? `
    <div class="commit-standout-box">
      <div class="commit-label">Committed To</div>
      <div class="commit-main-info"><img src="${p.commitLogo}" class="commit-standout-logo" onerror="this.style.display='none';"><span class="commit-school-name">${p.committedSchool}</span></div>
    </div>` : `
    <div class="uncommitted-box">
      <div class="commit-label" style="margin-bottom: 4px;">Status</div>
      <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">Uncommitted</div>
    </div>`;

  const schoolImg = (s, cls) => `<img src="${getSchoolLogoPath(s)}" class="${cls}" alt="" loading="lazy" onload="tintFromLogo(this)" onerror="schoolLogoFallback(this, '${escAttr(s)}')">`;
  const finalListHTML = p.finalList ? p.finalList.schools.map(s => `<div class="final-school-card ${s === p.committedSchool ? 'is-commit' : ''}">${schoolImg(s, 'final-school-logo')}<span>${s}</span></div>`).join('') : '';
  const offersHTML = p.offers ? p.offers.map(o => `<div class="offer-pill">${schoolImg(o, 'offer-logo')}<span>${o}</span></div>`).join('') : '';
  const accoladesHTML = p.accolades && p.accolades.length > 0 ? p.accolades.map(acc => {
    const logo = ACCOLADE_MAP[acc] ? ASSET_BASE_PATH + ACCOLADE_MAP[acc] : '';
    return `<div class="accolade-pill" onclick="openAccoladeRoster('${String(acc).replace(/'/g, "\\'")}')">${logo ? `<img src="${logo}" class="accolade-logo">` : ''}<span>${acc}</span></div>`;
  }).join('') : '<div style="color: var(--text-muted); font-size: 0.8rem;">No major accolades yet.</div>';

  const statsLevels = [ { key: 'hs', label: 'High School' }, { key: 'aau', label: 'AAU / Circuit' }, { key: 'fiba', label: 'FIBA / National' }, { key: 'intl', label: 'Intl / Pro' } ];
  let statsTablesHTML = statsLevels.map(lvl => {
    let st = p.stats[lvl.key];
    if (!st || st.gp === 0) return '';
    return `
      <h4 style="font-size: 0.85rem; margin-top: 1.2rem; margin-bottom: 0.5rem; color: var(--text-main);">${lvl.label} <span style="color: var(--text-muted); font-weight: 400;">(${st.team})</span></h4>
      ${st.misaligned ? '<div class="stat-warn">Some of these numbers look shifted by a column in the database, so they may be in the wrong places.</div>' : ''}
      <div class="profile-stats-table-wrapper">
        <table class="profile-stats-table">
          <tr><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3FG%</th><th>FT%</th></tr>
          <tr><td>${st.gp}</td><td>${st.mpg}</td><td>${st.ppg}</td><td>${st.rpg}</td><td>${st.apg}</td><td>${st.spg}</td><td>${st.bpg}</td><td>${st.topg}</td><td>${st.fg}</td><td>${st.fg3}</td><td>${st.ft}</td></tr>
        </table>
      </div>`;
  }).join('');

  if (!statsTablesHTML) statsTablesHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 1rem;">No statistics available.</div>';

  const commitName = commitSchoolOf(p);
  const commitChip = commitName && !NOT_A_SCHOOL.test(commitName) ? `<button class="profile-commit-chip" onclick="openSchoolModal('${escAttr(commitName)}', '${p.classYear}')" title="${escAttr(commitName)}'s ${p.classYear} class">
      <img src="${getSchoolLogoPath(commitName)}" alt="" onload="tintProfileFromLogo(this)" onerror="schoolLogoFallback(this, '${escAttr(commitName)}')"><span>${commitName}</span></button>`
    : `<span class="profile-commit-chip open">${commitName && NOT_A_SCHOOL.test(commitName) ? 'Turning pro' : 'Uncommitted'}</span>`;
  const nb = classNeighbours(p);
  const navBtn = (r, dir) => r ? `<button class="profile-nav-btn" onclick="openRecruitProfile(recruits.find(x => x.id === '${r.id}'))" title="${escAttr(r.name)}">${dir < 0 ? '&larr;' : ''} <span>${dir < 0 ? 'Prev' : 'Next'}</span> ${dir > 0 ? '&rarr;' : ''}</button>` : '<span></span>';
  const profileNav = `<div class="profile-nav">
      ${navBtn(nb.prev, -1)}
      <span class="profile-nav-pos">${nb.intl ? 'International' : 'No.'} ${nb.at} of ${nb.of} · Class of ${p.classYear}</span>
      <span class="profile-nav-right">${navBtn(nb.next, 1)}<button class="profile-nav-btn" onclick="copyProfileLink(this)" title="Copy a link to this profile">Share</button></span>
    </div>`;

  container.innerHTML = `
    ${profileNav}
    <div class="profile-header">
      <div class="profile-header-left">
        <img src="${p.pfp && p.pfp.trim() !== '' ? p.pfp : EMPTY_PFP}" class="player-avatar-lg" onerror="this.src='${EMPTY_PFP}';">
        <div class="profile-title-area">
          <div class="profile-name-row">
            <h1>${p.name}</h1>
            <div>${starDisplay}</div>
            ${commitChip}
          </div>
          
          <div class="bio-sub-info">
            <span>${p.hs}</span>
            <span class="bio-dot">•</span>
            <span>${p.hometown}</span>
          </div>

          <div class="bio-badges-grid">
            <div class="bio-badge">
              <span class="bio-badge-label">Class</span>
              <span class="bio-badge-val">${p.classYear}</span>
            </div>
            <div class="bio-badge">
              <span class="bio-badge-label">Position</span>
              <span class="bio-badge-val">${p.pos}</span>
            </div>
            <div class="bio-badge">
              <span class="bio-badge-label">Rating</span>
              <span class="bio-badge-val">${p.rating} OVR</span>
            </div>
            <div class="bio-badge highlight clickable" onclick="filterAndGoToRankings('${p.classYear}', 'ALL', 'ALL')" title="View National Rankings for ${p.classYear}">
              <span class="bio-badge-label">Natl Rank</span>
              <span class="bio-badge-val">${classRank}</span>
            </div>
            <div class="bio-badge highlight clickable" onclick="filterAndGoToRankings('${p.classYear}', '${p.pos}', 'ALL')" title="View ${p.pos} Rankings for ${p.classYear}">
              <span class="bio-badge-label">Pos Rank</span>
              <span class="bio-badge-val">${posRank} ${p.pos}</span>
            </div>
            <div class="bio-badge highlight clickable" onclick="filterAndGoToRankings('${p.classYear}', 'ALL', '${p.state}')" title="View ${p.state} Rankings for ${p.classYear}">
              <span class="bio-badge-label">State Rank</span>
              <span class="bio-badge-val">${stateRank}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="profile-top-row">
      <div class="spec-box">
        <div style="font-weight: 700; margin-bottom: 1rem; color: var(--text-main); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;">Measurables</div>
        <div class="spec-item"><span class="spec-label">Height</span><span class="spec-value">${p.height}</span></div>
        <div class="spec-item"><span class="spec-label">Weight</span><span class="spec-value">${p.weight}</span></div>
        <div class="spec-item"><span class="spec-label">Wingspan</span><span class="spec-value">${p.wingspan || 'N/A'}</span></div>
        <div class="spec-item"><span class="spec-label">DOB</span><span class="spec-value">${p.dob}</span></div>
      </div>
      <div class="recruiting-box">
        ${statusHTML}
        <div class="recruiting-section-title">${p.finalList ? p.finalList.title : 'Interests'}</div>
        <div class="final-list-grid">${finalListHTML}</div>
        <div class="recruiting-section-title">All Offers</div>
        <div class="offers-flex">${offersHTML}</div>
      </div>
      <div class="recruiting-box">
        <div style="font-weight: 700; margin-bottom: 1rem; color: var(--text-main); text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.5px;">Accolades & Events</div>
        <div class="accolades-list">${accoladesHTML}</div>
      </div>
    </div>

    <div class="scouting-report-full">
      <h3>Scouting Report</h3><p>${p.scouting}</p>
      <div class="scouting-columns">
        <div><div class="recruiting-section-title" style="color: var(--heat-good-text);">Strengths</div><ul style="padding-left: 1rem; color: var(--text-muted); margin-top: 8px;">${p.strengths.map(s => `<li>${s}</li>`).join('')}</ul></div>
        <div><div class="recruiting-section-title" style="color: var(--heat-bad-text);">Areas for Growth</div><ul style="padding-left: 1rem; color: var(--text-muted); margin-top: 8px;">${p.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul></div>
      </div>
    </div>

    ${typeof rpCareerHTML === 'function' ? rpCareerHTML(p) : ''}

    <div class="stats-box-full">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
        <h3 style="margin: 0;">Statistical Profile</h3><button class="query-btn" onclick="switchTab('stats'); setStatLevel('hs', null);">View Advanced Data &rarr;</button>
      </div>
      ${statsTablesHTML}
    </div>
  `;
}
