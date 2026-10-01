// ============================================================
// Transfer Portal + "In the NCAA RP"
//
// The recruiting page follows players past signing day, the way 247 does:
//
//   Transfer Portal tab — every school change in the BYTHERIM universe.
//     Scheduled: moves written into the NCAA RP roster sheet — a
//       "T - School" note in FROM / a Previous School, or the same player
//       listed at a new school in a later Year.
//     Portal: moves the NCAA simulation made, read from the published
//       universe (data/universe.json, from "Publish Universe" in the sim).
//
//   Recruit profiles — an "In the NCAA RP" section with the player's
//   college seasons, transfers and draft pick.
//
// Both sources are optional: with neither, the tab says so and the rest of
// the page is unaffected.
// ============================================================

const ROSTER_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-/pub?gid=0&single=true&output=csv';
const UNIVERSE_URL = '../data/universe.json';
const PORTAL_PAGE = 100;

const Portal = {
  rosterRows: [],      // normalised roster sheet rows
  sheet: [],           // transfers written into the sheet
  universe: null,      // published universe, when there is one
  all: [],             // merged list
  ready: { sheet: false, universe: false },
  filters: { season: null, type: 'ALL', pos: 'ALL', q: '' },
  shown: PORTAL_PAGE
};

const portalKey = s => String(s || '').trim().toLowerCase();
const schoolKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// The roster sheet names a season by the year it ends: 2029 is 2028-29.
const sheetSeasonLabel = y => `${y - 1}-${String(y).slice(2)}`;
const seasonStart = label => parseInt(String(label || '').slice(0, 4), 10) || 0;

function portalEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Header names in the sheet vary in case and spacing; read by any alias.
function sheetCell(row, ...aliases) {
  for (const k of Object.keys(row)) {
    if (aliases.includes(k.trim().toLowerCase())) {
      const v = String(row[k] == null ? '' : row[k]).trim();
      if (v) return v;
    }
  }
  return '';
}

function normaliseRosterRows(rows) {
  return (rows || []).map(r => ({
    name: sheetCell(r, 'name', 'player'),
    team: sheetCell(r, 'team', 'school'),
    year: parseInt(sheetCell(r, 'year', 'season'), 10) || null,
    rating: sheetCell(r, 'ovr', 'rating'),
    cls: sheetCell(r, 'class'),
    pos: sheetCell(r, 'pos', 'position').split(/\s*[\/,]\s*/)[0].toUpperCase(),   // "SF/PF": the first is what's shown
    ht: sheetCell(r, 'ht', 'height'),
    from: sheetCell(r, 'from'),
    prev: sheetCell(r, 'previous school', 'previousschool', 'prev school')
  })).filter(r => r.name.length > 1 && r.team);
}

// Transfers the sheet author wrote in.
function sheetTransfers(rows) {
  const out = [];
  const seen = new Set();
  const add = t => {
    const k = `${portalKey(t.name)}|${schoolKey(t.to)}|${t.season}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  const base = (r, from, to, year) => ({
    name: r.name, pos: r.pos, class: r.cls, rating: parseFloat(r.rating) || null, ppg: null,
    ht: r.ht, from, to, season: sheetSeasonLabel(year), scheduled: true, source: 'sheet'
  });

  // 1) "T - School" in FROM, or a Previous School.
  rows.forEach(r => {
    if (!r.year) return;
    const m = r.from.match(/^T\s*-\s*(.+)$/i);
    const src = m ? m[1].trim() : r.prev;
    if (src && schoolKey(src) !== schoolKey(r.team)) add(base(r, src, r.team, r.year));
  });

  // 2) The same player at a new school in a later Year. A name listed at
  //    two schools in the same Year is two different players, so skip it.
  const byName = {};
  rows.forEach(r => { if (r.year) (byName[portalKey(r.name)] = byName[portalKey(r.name)] || []).push(r); });
  Object.values(byName).forEach(list => {
    const perYear = {};
    list.forEach(r => { (perYear[r.year] = perYear[r.year] || new Set()).add(schoolKey(r.team)); });
    if (Object.values(perYear).some(s => s.size > 1)) return;
    list.sort((a, b) => a.year - b.year);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (schoolKey(a.team) !== schoolKey(b.team)) add(base(b, a.team, b.team, b.year));
    }
  });
  return out;
}

// Sheet moves plus the sim's own, one row per player per move.
function mergeTransfers() {
  const map = new Map();
  Portal.sheet.forEach(t => map.set(`${portalKey(t.name)}|${schoolKey(t.to)}|${t.season}`, t));
  const sim = (Portal.universe && Portal.universe.transfers) || [];
  sim.forEach(t => {
    const k = `${portalKey(t.name)}|${schoolKey(t.to)}|${t.season}`;
    const prev = map.get(k);
    map.set(k, {
      ...(prev || {}), ...t,
      rating: t.rating || (prev && prev.rating) || null,
      ht: (prev && prev.ht) || t.ht || '',
      scheduled: !!(t.scheduled || prev),
      source: 'sim'
    });
  });
  Portal.all = [...map.values()];
}

// The season the universe is in. Without a published universe, the
// roster sheet's earliest Year is the current season.
function currentSeasonStartYear() {
  if (Portal.universe && Portal.universe.season) return Portal.universe.season.year;
  const years = Portal.rosterRows.map(r => r.year).filter(Boolean);
  return years.length ? Math.min(...years) - 1 : new Date().getFullYear();
}

function isUpcoming(t) { return seasonStart(t.season) > currentSeasonStartYear(); }

function portalSeasons() {
  return [...new Set(Portal.all.map(t => t.season))].sort((a, b) => seasonStart(b) - seasonStart(a));
}

// The season the universe is in, like 247's current cycle; failing that,
// the latest season that has any moves. Upcoming seasons stay one click away.
function defaultPortalSeason() {
  const seasons = portalSeasons();
  const now = currentSeasonStartYear();
  return seasons.find(s => seasonStart(s) === now)
    || seasons.find(s => seasonStart(s) < now)
    || seasons[seasons.length - 1] || 'ALL';
}

function loadPortalData() {
  const done = () => {
    mergeTransfers();
    // The default season needs both sources: the universe decides which
    // season is current.
    if (Portal.ready.sheet && Portal.ready.universe && !Portal.filters.season) {
      Portal.filters.season = defaultPortalSeason();
    }
    renderPortal();
    // A profile opened before the data arrived gains its college section.
    if (typeof currentActiveTab !== 'undefined' && currentActiveTab === 'profile' && typeof activeRecruit !== 'undefined' && activeRecruit) {
      renderProfile(activeRecruit);
    }
  };

  if (typeof Papa !== 'undefined') {
    Papa.parse(ROSTER_SHEET_CSV_URL, {
      download: true, header: true, skipEmptyLines: true,
      complete: res => {
        Portal.rosterRows = normaliseRosterRows(res && res.data);
        Portal.sheet = sheetTransfers(Portal.rosterRows);
        Portal.ready.sheet = true;
        done();
      },
      error: () => { Portal.ready.sheet = true; done(); }
    });
  } else {
    Portal.ready.sheet = true;
  }

  loadLocalSummer().then(changed => { if (changed) applyRecruitFlips(); });
  (window.Cloud ? Cloud.universe(UNIVERSE_URL) : fetch(UNIVERSE_URL, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)))
    .then(u => { Portal.universe = u && u.version ? u : null; applyRecruitFlips(); })
    .catch(() => { Portal.universe = null; })
    .finally(() => { Portal.ready.universe = true; done(); });
}

// Commitments the NCAA RP moved (a program out of scholarships): the
// recruit is shown where he actually signed.
function applyRecruitFlips() {
  const flips = (Portal.universe && Portal.universe.recruitFlips) || [];
  const live = Portal.universe && Portal.universe.recruitingLive;
  const summer = summerSnap();
  if (!flips.length && !live && !summer) return;
  if (typeof recruits === 'undefined' || !recruits.length) { Portal.flipsPending = true; return; }
  let moved = 0;
  flips.forEach(f => {
    const r = recruits.find(x => portalKey(x.name) === portalKey(f.name) && String(x.classYear) === String(f.classYear));
    if (!r || r.committedSchool === f.to) return;
    r.flippedFrom = f.from;
    r.committedSchool = f.to;
    r.status = `Committed to ${f.to}`;
    r.commitLogo = '';
    moved++;
  });
  Portal.flipsPending = false;
  moved += applyLiveRecruiting();
  moved += applySummer();
  if (moved && typeof filterRecruits === 'function') {
    if (typeof buildRankIndex === 'function') buildRankIndex();
    filterRecruits();
    if (typeof renderSchoolRankings === 'function') renderSchoolRankings();
    if (typeof currentActiveTab !== 'undefined' && currentActiveTab === 'profile' && typeof activeRecruit !== 'undefined' && activeRecruit) renderProfile(activeRecruit);
  }
  if (typeof currentActiveTab !== 'undefined' && currentActiveTab === 'summer') renderSummer();
}

// The high-school classes as the NCAA RP has them now (recruit-live.js):
// today's ranks and grades, the commitments made so far, and the shrinking
// lists of the players still deciding. Classes the sim hasn't reached yet
// show their generated players uncommitted.
function applyLiveRecruiting() {
  const live = Portal.universe && Portal.universe.recruitingLive;
  if (!live || typeof recruits === 'undefined' || !recruits.length) return 0;
  const byKey = new Map();
  recruits.forEach(r => byKey.set(`${portalKey(r.name)}|${r.classYear}`, r));
  let n = 0;
  (live.players || []).forEach(x => {
    const r = byKey.get(`${portalKey(x.n)}|${x.c}`);
    if (!r) return;
    if (x.rk) r.rank = x.rk;
    if (x.g) { r.rating = x.g; r.stars = x.g >= 90 ? 5 : x.g >= 80 ? 4 : x.g >= 70 ? 3 : 0; }
    if (x.live) {
      if (x.s) {
        r.committedSchool = x.s; r.status = `Committed to ${x.s}`; r.commitLogo = '';
        const list = [x.s].concat(x.o || []);
        r.finalList = { title: `Final ${list.length}`, schools: list };
      } else {
        r.committedSchool = null; r.status = 'Uncommitted'; r.commitLogo = '';
        if (x.l && x.l.length) r.finalList = { title: x.l.length <= 5 ? `Top ${x.l.length}` : `Top ${x.l.length} list`, schools: x.l };
      }
      if (x.d) r.decommittedFrom = x.d;
    }
    if (x.w) r.commitWith = x.w;
    n++;
  });
  if (live.openFrom) {
    recruits.forEach(r => {
      if (r.generated && Number(r.classYear) >= live.openFrom && r.committedSchool) {
        r.committedSchool = null; r.status = 'Uncommitted'; r.commitLogo = ''; n++;
      }
    });
  }
  return n;
}

// ---------- The summer circuit (AAU and FIBA, from the NCAA RP) ----------
//
// Each summer the NCAA RP plays the AAU circuits (Nike EYBL, Adidas 3SSB,
// Under Armour Association) and the FIBA youth World Cup. A player's most
// recent summer becomes his AAU / FIBA line on his profile, and his honors
// join his accolades.
const SUMMER_PCT = ['fg', 'fg2', 'fg3', 'ft', 'ts', 'rts', 'efg', 'oreb', 'dreb', 'trb', 'ast', 'tov', 'stl', 'blk', 'usg', 'rimPct', 'shortMidPct', 'longMidPct'];
function summerTier(line, team) {
  const t = { ...line, team: team || 'N/A' };
  ['bpm', 'obpm', 'dbpm', 'ortg', 'drtg'].forEach(k => { t[k] = String(line[k] != null ? line[k] : '0.0'); });
  t.net = String(Math.round(((parseFloat(line.ortg) || 0) - (parseFloat(line.drtg) || 0)) * 10) / 10);
  SUMMER_PCT.forEach(k => { if (t[k] == null) t[k] = '0.0%'; });
  return t;
}
// "2029 Peach Jam champion" -> "Peach Jam Champion": one accolade per honor.
const summerAccolade = h => String(h).replace(/^\d{4}\s+/, '').replace(/\b(champion|gold|silver|bronze|first team|scoring leader|all-star five)\b/gi, m => m.replace(/\b\w/g, c => c.toUpperCase()));

function applySummer() {
  const sm = summerSnap();
  if (typeof recruits === 'undefined' || !recruits.length) return 0;
  // Back to the sheet's lines first: the summer shown can change (a step
  // played here, the other source picked).
  recruits.forEach(r => {
    if (!r._written) r._written = { aau: r.stats && r.stats.aau, fiba: r.stats && r.stats.fiba, accolades: (r.accolades || []).slice() };
    else { r.stats.aau = r._written.aau; r.stats.fiba = r._written.fiba; r.accolades = r._written.accolades.slice(); }
    r.statsHistory = {}; r.summerGames = []; delete r.summerHonors; delete r.summerBuzz;
  });
  if (!sm) return 0;
  const byKey = new Map();
  recruits.forEach(r => byKey.set(`${portalKey(r.name)}|${r.classYear}`, r));
  const fibaTeam = (sm.fiba && sm.fiba.name.match(/U\d+/)) ? sm.fiba.name.match(/U\d+/)[0] : 'U19';
  const label = (season, live) => `Summer ${season}${live ? ' (so far)' : ''}`;
  const live = sm.v === 2 && !sm.done;
  Portal.summerById = new Map();
  let n = 0;
  (sm.players || []).forEach(x => {
    const r = byKey.get(`${portalKey(x.n)}|${x.c}`);
    if (!r) return;
    if (x.id) Portal.summerById.set(x.id, r);
    r.stats = r.stats || {};
    // The simulated summer replaces his written AAU / FIBA line (the sim
    // is modeled on it); last summer's, if he played one, stays below.
    r.statsHistory = {};
    if (x.aau) r.stats.aau = { ...summerTier(x.aau, x.t ? `${x.t}${x.ci ? ` (${x.ci})` : ''}` : ''), sim: true, label: label(sm.season, live) };
    if (x.fiba) r.stats.fiba = { ...summerTier(x.fiba, x.na ? `${x.na} ${fibaTeam}` : ''), sim: true, label: label(sm.season, live) };
    if (x.prev) {
      ['aau', 'fiba'].forEach(tier => {
        const pl = x.prev[tier];
        if (!pl) return;
        const team = tier === 'aau' ? `${x.prev.t || ''}${x.prev.ci ? ` (${x.prev.ci})` : ''}` : `${x.prev.na || ''}`;
        const row = { label: label(x.prev.s), team, line: summerTier(pl, team) };
        // Nothing this summer at this level: last summer's is his line,
        // not history under it.
        if (!x[tier]) { r.stats[tier] = { ...row.line, sim: true, label: row.label }; return; }
        r.statsHistory[tier] = [row].concat((r.statsHistory[tier] || []).filter(h => h.label !== row.label));
      });
    }
    if (x.h && x.h.length) {
      r.summerHonors = x.h;
      r.accolades = [...new Set((r.accolades || []).concat(x.h.map(summerAccolade)))];
    }
    if (x.b) r.summerBuzz = x.b;
    r.summerGames = [];
    n++;
  });
  // Game logs, from every game's box score.
  if (sm.v === 2) {
    (sm.games || []).forEach(g => {
      if (g.hidden || !g.b) return;
      [0, 1].forEach(side => (g.b[side] || []).forEach(l => {
        const r = Portal.summerById.get(l[0]);
        if (!r) return;
        const us = side === 0 ? g.h : g.a, them = side === 0 ? g.a : g.h;
        const ourPts = side === 0 ? g.hs : g.as, theirPts = side === 0 ? g.as : g.hs;
        r.summerGames.push({ id: g.id, ev: g.ev, rd: g.rd, team: us, opp: them, res: `${ourPts > theirPts ? 'W' : 'L'} ${ourPts}-${theirPts}`, l: summerLine(l) });
      }));
    });
  }
  return n;
}

// ---------- Where the summer comes from, and playing it here ----------
//
// Two sources, like the Draft RP:
//   official  the published universe's summer (everyone sees it)
//   local     the NCAA RP save in this browser, where the summer is played:
//             the NCAA RP plans it at its Summer Circuit step and waits;
//             each step is played here and written back to the save.
async function loadLocalSummer() {
  if (typeof db === 'undefined' || !db.leagueState || typeof SummerCore === 'undefined') return false;
  let s;
  try { s = await db.leagueState.get(1); } catch (e) { return false; }
  if (!s || !s.summer || s.summer.v !== 2) return false;
  Portal.local = { P: s.summer, recruits: s.allRecruits || [], history: s.summerHistory || [], year: s.currentYear };
  // The recruits' lines for this summer, as played so far.
  SummerCore.applyLines(s.summer, Portal.local.recruits);
  if (s.summer.done) SummerCore.settle(s.summer, Portal.local.recruits);
  if (!Portal.summerSource) Portal.summerSource = 'local';
  return true;
}
function summerSource() {
  const official = Portal.universe && Portal.universe.summer;
  if (Portal.local && (Portal.summerSource === 'local' || !official)) return 'local';
  return official ? 'official' : null;
}
function summerSnap() {
  const src = summerSource();
  if (src === 'local') {
    const L = Portal.local;
    if (!L._snap || L._snapRev !== L.P.rev) {
      L._snap = SummerCore.snapshot(L.P, { recruits: L.recruits, history: L.history, hidden: g => /Final$/.test(g.rd || '') && !(L.P.seen && L.P.seen[g.id]) });
      L._snapRev = L.P.rev;
    }
    return L._snap;
  }
  return src === 'official' ? Portal.universe.summer : null;
}
function setSummerSource(k) {
  Portal.summerSource = k;
  applySummer();
  if (typeof filterRecruits === 'function') filterRecruits();
  renderSummer();
}

// Plays the next step (or the rest of the summer) against the save.
async function simSummer(all) {
  const L = Portal.local;
  if (!L || L.P.done || Portal.summerBusy) return;
  Portal.summerBusy = true;
  renderSummer();
  await new Promise(r => setTimeout(r, 30));
  try {
    // The save first, in case the NCAA RP moved on since this page loaded.
    try {
      const s = await db.leagueState.get(1);
      if (s && s.summer && s.summer.v === 2 && s.summer.season === L.P.season && (s.summer.rev || 0) > (L.P.rev || 0)) L.P = s.summer;
    } catch (e) { /* play on what we have */ }
    let guard = 0;
    do {
      const before = L.P.games.length;
      SummerCore.playStep(L.P);
      // Played here, watched here: finals aren't held back as a surprise.
      L.P.games.slice(before).forEach(g => { if (/Final$/.test(g.rd)) L.P.seen[g.id] = true; });
    } while (all && !L.P.done && guard++ < 20);
    SummerCore.applyLines(L.P, L.recruits);
    if (L.P.done) SummerCore.settle(L.P, L.recruits);
    await db.leagueState.update(1, { summer: L.P });
  } catch (e) {
    console.error('Playing the summer:', e);
    Portal.summerError = e.message || String(e);
  } finally { Portal.summerBusy = false; }
  applySummer();
  if (typeof filterRecruits === 'function') filterRecruits();
  renderSummer();
}

// One box-score line [id, min, pts, oreb, dreb, ast, stl, blk, tov, pf,
// twoPm, twoPa, threePm, threePa, ftm, fta, started] as an object.
function summerLine(a) {
  const [id, min, pts, oreb, dreb, ast, stl, blk, tov, pf, twoPm, twoPa, threePm, threePa, ftm, fta, started] = a;
  return { id, min, pts, reb: oreb + dreb, oreb, dreb, ast, stl, blk, tov, pf, fgm: twoPm + threePm, fga: twoPa + threePa, threePm, threePa, ftm, fta, started: !!started };
}

function summerEventName(sm, ev) {
  if (ev === 'FIBA') return sm.fiba ? sm.fiba.name : 'FIBA';
  const c = (sm.circuits || []).find(x => x.key === ev);
  return c ? c.name : ev;
}

function setSummerTab(k) { Portal.summerTab = k; renderSummer(); }

function renderSummer() {
  const el = document.getElementById('summerContainer');
  if (!el) return;
  const sm = summerSnap();
  if (!sm && !Portal.ready.universe) { el.innerHTML = '<p class="portal-empty">Loading the summer circuit…</p>'; return; }
  if (!sm) {
    el.innerHTML = `<p class="portal-empty">No summer yet. The summer circuit (four AAU sessions and the circuit championships, then the FIBA youth World Cup) is played here, against your NCAA RP save, when the sim reaches its Summer Circuit step; a new save starts with one already played. The official universe's summer shows here once it's published.</p>`;
    return;
  }
  if (sm.v !== 2) { renderSummerSummary(el, sm); return; }
  const esc = portalEsc;
  const byId = Portal.summerById || new Map();
  const who = (x, nameOverride) => {
    if (!x) return '';
    const r = x.id ? byId.get(x.id) : null;
    const name = nameOverride || x.name || '';
    return r ? `<a class="summer-player" onclick="openRecruitProfile(recruits.find(q => q.id === '${escAttr(r.id)}'))">${esc(name)}</a>` : esc(name);
  };
  const tabs = (sm.circuits || []).map(c => [c.key, c.name]).concat(sm.fiba ? [['FIBA', sm.fiba.short || 'FIBA']] : []).concat([['leaders', 'Leaders']]);
  const tab = tabs.some(t => t[0] === Portal.summerTab) ? Portal.summerTab : tabs[0][0];
  const steps = (sm.steps || []).map((st, i) => `<li class="${i < sm.step ? 'done' : i === sm.step ? 'current' : ''}">${i < sm.step ? '✓ ' : ''}${esc(st.short || st.label)}</li>`).join('');
  const next = !sm.done && sm.steps[sm.step] ? `Next: ${esc(sm.steps[sm.step].label)}` : 'The summer is over.';

  const games = sm.games || [];
  const gameRow = g => g.hidden
    ? `<li class="summer-game"><span>${esc(g.h)} vs ${esc(g.a)}</span><small>Final to be revealed in the NCAA RP</small></li>`
    : `<li class="summer-game" onclick="openSummerBox('${escAttr(g.id)}')" title="Box score"><span class="${g.hs > g.as ? 'won' : ''}">${esc(g.h)} <b>${g.hs}</b></span><span class="${g.as > g.hs ? 'won' : ''}">${esc(g.a)} <b>${g.as}</b></span><small>Box score</small></li>`;
  const roundsOf = (ev, labels) => labels.map(rd => ({ rd, list: games.filter(g => g.ev === ev && g.rd === rd) })).filter(x => x.list.length);
  const roundsHTML = list => list.map(x => `<div class="summer-round"><h4>${esc(x.rd)}</h4><ul class="summer-games">${x.list.map(gameRow).join('')}</ul></div>`).join('');
  const tableHTML = (rows, cut) => `<div class="table-container"><table class="summer-table"><thead><tr><th></th><th style="text-align:left">Team</th><th>W-L</th><th class="summer-pts">PF</th><th class="summer-pts">PA</th><th>+/-</th></tr></thead><tbody>
    ${rows.map(([t, w, l, pf, pa], i) => `<tr class="${cut && i === cut - 1 ? 'cutline' : ''}"><td>${i + 1}</td><td style="text-align:left">${esc(t)}</td><td>${w}-${l}</td><td class="summer-pts">${pf || 0}</td><td class="summer-pts">${pa || 0}</td><td>${(pf || 0) - (pa || 0) > 0 ? '+' : ''}${(pf || 0) - (pa || 0)}</td></tr>`).join('')}</tbody></table></div>`;

  let body = '';
  const c = (sm.circuits || []).find(x => x.key === tab);
  if (c) {
    const awards = [
      c.champion ? `<dt>Champion</dt><dd>🏆 ${esc(c.champion)} <small>over ${esc(c.runnerUp)}</small></dd>` : (c.finalists ? `<dt>Final</dt><dd>${esc(c.finalists[0])} vs ${esc(c.finalists[1])}</dd>` : ''),
      c.eventMvp ? `<dt>${esc(c.event)} MVP</dt><dd>${who(c.eventMvp)} <small>${esc(c.eventMvp.line)}</small></dd>` : '',
      c.mvp ? `<dt>Circuit MVP</dt><dd>${who(c.mvp)} <small>${esc(c.mvp.team)} · ${esc(c.mvp.line)}</small></dd>` : '',
      c.scoringLeader ? `<dt>Scoring leader</dt><dd>${who(c.scoringLeader)} <small>${esc(c.scoringLeader.line)}</small></dd>` : '',
      (c.firstTeam || []).length ? `<dt>First Team</dt><dd>${c.firstTeam.map(x => who(x)).join(', ')}</dd>` : ''
    ].join('');
    const progs = (c.programs || []).map(p => `<details><summary>${esc(p.name)}</summary><p class="summer-roster">${p.roster.map(id => { const r = byId.get(id); return r ? `<a class="summer-player" onclick="openRecruitProfile(recruits.find(q => q.id === '${escAttr(r.id)}'))">${esc(r.name)}</a> <small>${r.classYear} ${esc(r.pos || '')}</small>` : esc((sm.names || {})[id] || ''); }).join(' · ')}</p></details>`).join('');
    body = `<div class="summer-grid">
        <section class="summer-card"><div class="summer-head"><span class="summer-kicker">${esc(c.name)} · league</span><h3>Standings</h3></div>
          ${tableHTML(c.standings || [], 8)}<p class="summer-note">The top eight go to the ${esc(c.event)}.</p></section>
        <section class="summer-card"><div class="summer-head"><span class="summer-kicker">${esc(c.name)}</span><h3>${esc(c.event)}</h3></div>
          ${awards ? `<dl class="summer-awards">${awards}</dl>` : '<p class="summer-note">The championship follows the four league sessions.</p>'}
          ${roundsHTML(roundsOf(c.key, ['Final', 'Semifinals', 'Quarterfinals']))}</section>
        <section class="summer-card summer-wide"><div class="summer-head"><span class="summer-kicker">${esc(c.name)}</span><h3>Results</h3></div>
          ${roundsHTML(roundsOf(c.key, ['Session 4', 'Session 3', 'Session 2', 'Session 1'])) || '<p class="summer-note">No games yet.</p>'}</section>
        <section class="summer-card summer-wide"><div class="summer-head"><span class="summer-kicker">${esc(c.name)}</span><h3>Programs</h3></div>${progs}</section>
      </div>`;
  } else if (tab === 'FIBA' && sm.fiba) {
    const f = sm.fiba;
    const medals = f.medals ? `<div class="summer-medals"><span>🥇 ${esc(f.medals.gold)}</span><span>🥈 ${esc(f.medals.silver)}</span><span>🥉 ${esc(f.medals.bronze)}</span></div>` : '';
    const usa = (f.rosters || []).find(t => t.name === 'USA');
    body = `<div class="summer-grid">
        <section class="summer-card"><div class="summer-head"><span class="summer-kicker">FIBA</span><h3>${esc(f.name)}</h3></div>
          ${medals}
          <dl class="summer-awards">${f.mvp ? `<dt>MVP</dt><dd>${who(f.mvp)} <small>${esc(f.mvp.team)} · ${esc(f.mvp.line)}</small></dd>` : ''}
          ${(f.allStar || []).length ? `<dt>All-Star Five</dt><dd>${f.allStar.map(x => `${who(x)} <small>${esc(x.team)}</small>`).join(', ')}</dd>` : ''}</dl>
          ${roundsHTML(roundsOf('FIBA', ['Final', 'Bronze medal game', 'Semifinals', 'Quarterfinals'])) || '<p class="summer-note">The knockouts follow the group stage.</p>'}
          ${usa ? `<details><summary>Team USA</summary><p class="summer-roster">${usa.players.map(id => { const r = byId.get(id); return r ? who({ id }, r.name) : ''; }).filter(Boolean).join(' · ')}</p></details>` : ''}</section>
        <section class="summer-card"><div class="summer-head"><span class="summer-kicker">FIBA</span><h3>Groups</h3></div>
          ${(f.groups || []).map(gr => `<h4 class="summer-subhead">Group ${esc(gr.name)}</h4>${tableHTML(gr.standings || [], 2)}${roundsHTML(roundsOf('FIBA', [`Group ${gr.name}`]))}`).join('')}</section>
      </div>`;
  } else {
    const rows = (sm.players || []).map(x => ({ x, r: byId.get(x.id) })).filter(o => o.r);
    const board = (title, list, val) => `<section class="summer-card"><div class="summer-head"><span class="summer-kicker">Leaders</span><h3>${esc(title)}</h3></div>
      <ol class="summer-leaders">${list.slice(0, 15).map(o => `<li>${who({ id: o.x.id }, o.r.name)} <small>${o.r.classYear} · ${esc(o.x.t || o.x.na || '')}</small><b>${val(o)}</b></li>`).join('')}</ol></section>`;
    const aau = rows.filter(o => o.x.aau && o.x.aau.gp >= Math.min(6, Math.max(1, sm.step * 2)));
    const fiba = rows.filter(o => o.x.fiba && o.x.fiba.gp >= 2);
    const by = (list, k, base) => list.slice().sort((a, b) => b.x[base][k] - a.x[base][k]);
    body = `<div class="summer-grid">
        ${board('AAU points', by(aau, 'ppg', 'aau'), o => o.x.aau.ppg)}
        ${board('AAU rebounds', by(aau, 'rpg', 'aau'), o => o.x.aau.rpg)}
        ${board('AAU assists', by(aau, 'apg', 'aau'), o => o.x.aau.apg)}
        ${board('AAU blocks', by(aau, 'bpg', 'aau'), o => o.x.aau.bpg)}
        ${fiba.length ? board(`${sm.fiba ? sm.fiba.short : 'FIBA'} points`, by(fiba, 'ppg', 'fiba'), o => o.x.fiba.ppg) : ''}
        ${fiba.length ? board(`${sm.fiba ? sm.fiba.short : 'FIBA'} rebounds`, by(fiba, 'rpg', 'fiba'), o => o.x.fiba.rpg) : ''}
      </div>`;
  }
  const past = (sm.history || []).slice().reverse();
  const history = past.length ? `<section class="summer-card summer-wide"><div class="summer-head"><span class="summer-kicker">Past summers</span><h3>Champions</h3></div>
      <ul class="summer-history">${past.map(h => `<li><b>${h.season}</b> ${(h.champions || []).map(x => `${esc(x.event)}: ${esc(x.team)}`).join(' · ')}${h.fiba && h.fiba.medals ? ` · ${esc(h.fiba.name)}: ${esc(h.fiba.medals.gold)}` : ''}</li>`).join('')}</ul></section>` : '';
  const src = summerSource(), L = Portal.local;
  const toggle = L && Portal.universe && Portal.universe.summer
    ? `<div class="summer-source" role="group" aria-label="Which summer">${[['local', 'Your save'], ['official', 'Official universe']].map(([k, l]) => `<button type="button" class="${src === k ? 'active' : ''}" onclick="setSummerSource('${k}')">${l}</button>`).join('')}</div>` : '';
  let controls = '';
  if (src === 'local' && L && !L.P.done) {
    const st = L.P.steps[L.P.step];
    controls = `<div class="summer-sim">${Portal.summerBusy ? '<span class="summer-note">Playing…</span>'
      : `<button type="button" class="summer-sim-btn primary" onclick="simSummer(false)">&#9654; Sim ${esc(st ? st.label : 'the next step')}</button>
         <button type="button" class="summer-sim-btn" onclick="simSummer(true)">Sim the rest of the summer</button>`}
      <span class="summer-note">Played against the NCAA RP save in this browser; the NCAA RP moves on to final rosters once the summer is over.${Portal.summerError ? ` <b>${esc(Portal.summerError)}</b>` : ''}</span></div>`;
  } else if (src === 'local' && L && L.P.done) {
    controls = `<p class="summer-note">This summer is over. The next one is played here once the NCAA RP reaches its Summer Circuit step, after the transfer portal.</p>`;
  }
  el.innerHTML = `<div class="portal-summary"><b>Summer ${sm.season}</b><span>${next}</span>${toggle}</div>
    ${controls}
    <ol class="summer-steps">${steps}</ol>
    <div class="summer-tabs">${tabs.map(([k, l]) => `<button type="button" class="${k === tab ? 'active' : ''}" onclick="setSummerTab('${k}')">${esc(l)}</button>`).join('')}</div>
    ${body}${history ? `<div class="summer-grid">${history}</div>` : ''}`;
}

// A box score, in a sheet over the page.
function openSummerBox(id) {
  const sm = summerSnap();
  const g = sm && (sm.games || []).find(x => x.id === id);
  if (!g || g.hidden) return;
  const esc = portalEsc;
  const byId = Portal.summerById || new Map();
  const name = l => { const r = byId.get(l.id); return r ? `<a class="summer-player" onclick="closeSummerBox(); openRecruitProfile(recruits.find(q => q.id === '${escAttr(r.id)}'))">${esc(r.name)}</a>` : esc((sm.names || {})[l.id] || ''); };
  const pct = (m, a) => (a ? `${m}-${a}` : '0-0');
  const side = (team, pts, lines) => {
    // Starters first, marked; then the bench by minutes.
    const ls = lines.map(summerLine).sort((a, b) => (b.started - a.started) || (b.min - a.min));
    const tot = k => ls.reduce((n, l) => n + l[k], 0);
    return `<h4 class="summer-subhead">${esc(team)} <b>${pts}</b></h4>
      <div class="table-container"><table class="summer-box"><thead><tr><th style="text-align:left">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>FG</th><th>3P</th><th>FT</th></tr></thead><tbody>
      ${ls.map((l, i) => `<tr class="${l.started ? 'is-starter' : ''}${i > 0 && !l.started && ls[i - 1].started ? ' bench-start' : ''}"><td style="text-align:left">${l.started ? '<span class="starter-badge" title="Starter" aria-label="Starter">S</span>' : ''}${name(l)}</td><td>${l.min}</td><td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.tov}</td><td>${pct(l.fgm, l.fga)}</td><td>${pct(l.threePm, l.threePa)}</td><td>${pct(l.ftm, l.fta)}</td></tr>`).join('')}
      <tr class="summer-total"><td style="text-align:left">Team</td><td></td><td><b>${tot('pts')}</b></td><td>${tot('reb')}</td><td>${tot('ast')}</td><td>${tot('stl')}</td><td>${tot('blk')}</td><td>${tot('tov')}</td><td>${pct(tot('fgm'), tot('fga'))}</td><td>${pct(tot('threePm'), tot('threePa'))}</td><td>${pct(tot('ftm'), tot('fta'))}</td></tr>
      </tbody></table></div>`;
  };
  closeSummerBox();
  const el = document.createElement('div');
  el.className = 'summer-sheet';
  el.id = 'summerSheet';
  el.innerHTML = `<div class="summer-sheet-card" role="dialog" aria-modal="true">
      <div class="summer-sheet-top"><div><span class="summer-kicker">${esc(summerEventName(sm, g.ev))} · ${esc(g.rd)}</span><h3>${esc(g.h)} ${g.hs}, ${esc(g.a)} ${g.as}</h3></div><button type="button" class="summer-close" onclick="closeSummerBox()" aria-label="Close">×</button></div>
      ${side(g.h, g.hs, g.b[0] || [])}${side(g.a, g.as, g.b[1] || [])}
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) closeSummerBox(); });
  document.body.appendChild(el);
}
function closeSummerBox() { const el = document.getElementById('summerSheet'); if (el) el.remove(); }

// A player's summer games, for his profile.
function summerGameLogHTML(p) {
  const sm = summerSnap();
  const games = p.summerGames || [];
  if (!sm || !games.length) return '';
  const esc = portalEsc;
  return `<div class="profile-section summer-log"><h3 class="section-title-sm">Summer ${sm.season} game log</h3>
    <div class="profile-stats-table-wrapper"><table class="profile-stats-table">
      <tr><th style="text-align:left">Game</th><th style="text-align:left">Opp</th><th>Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3P</th><th>FT</th></tr>
      ${games.map(g => `<tr onclick="openSummerBox('${escAttr(g.id)}')" class="summer-log-row"><td style="text-align:left">${esc(g.ev === 'FIBA' ? (sm.fiba ? sm.fiba.short : 'FIBA') : g.ev)} · ${esc(g.rd)}</td><td style="text-align:left">${esc(g.opp)}</td><td>${esc(g.res)}</td><td>${g.l.min}</td><td>${g.l.pts}</td><td>${g.l.reb}</td><td>${g.l.ast}</td><td>${g.l.stl}</td><td>${g.l.blk}</td><td>${g.l.fgm}-${g.l.fga}</td><td>${g.l.threePm}-${g.l.threePa}</td><td>${g.l.ftm}-${g.l.fta}</td></tr>`).join('')}
    </table></div></div>`;
}

function renderSummerSummary(el, sm) {
  const byKey = new Map((typeof recruits !== 'undefined' ? recruits : []).map(r => [portalKey(r.name), r]));
  const who = name => {
    const bare = String(name || '').replace(/\s*\([^)]*\)\s*$/, '');
    const r = byKey.get(portalKey(bare));
    return r ? `<a class="summer-player" onclick="openPortalPlayer('${escAttr(r.name)}')">${portalEsc(name)}</a>` : portalEsc(name);
  };
  const score = f => f ? `<div class="summer-score"><span class="${f.hs > f.as ? 'won' : ''}">${portalEsc(f.home)} <b>${f.hs}</b></span><span class="${f.as > f.hs ? 'won' : ''}">${portalEsc(f.away)} <b>${f.as}</b></span></div>` : '';
  const circuits = (sm.circuits || []).map(c => `<section class="summer-card">
      <div class="summer-head"><span class="summer-kicker">${portalEsc(c.name)}</span><h3>${portalEsc(c.event)}</h3></div>
      <div class="summer-champ">🏆 <b>${portalEsc(c.champion)}</b> <small>over ${portalEsc(c.runnerUp)}</small></div>
      ${score(c.final)}
      <dl class="summer-awards">
        ${c.eventMvp ? `<dt>${portalEsc(c.event)} MVP</dt><dd>${who(c.eventMvp)}</dd>` : ''}
        ${c.mvp ? `<dt>Circuit MVP</dt><dd>${who(c.mvp)}</dd>` : ''}
        ${(c.firstTeam || []).length ? `<dt>All-${portalEsc(c.key)} First Team</dt><dd>${c.firstTeam.map(who).join(', ')}</dd>` : ''}
      </dl>
      <details><summary>League standings</summary><ol class="summer-standings">${(c.standings || []).map(([t, w, l]) => `<li><span>${portalEsc(t)}</span><small>${w}-${l}</small></li>`).join('')}</ol></details>
    </section>`).join('');
  const f = sm.fiba;
  const fiba = f ? `<section class="summer-card">
      <div class="summer-head"><span class="summer-kicker">FIBA</span><h3>${portalEsc(f.name)}</h3></div>
      <div class="summer-medals"><span>🥇 ${portalEsc(f.medals.gold)}</span><span>🥈 ${portalEsc(f.medals.silver)}</span><span>🥉 ${portalEsc(f.medals.bronze)}</span></div>
      ${score(f.final)}
      <dl class="summer-awards">
        ${f.mvp ? `<dt>MVP</dt><dd>${who(f.mvp)}</dd>` : ''}
        ${(f.allStar || []).length ? `<dt>All-Star Five</dt><dd>${f.allStar.map(who).join(', ')}</dd>` : ''}
      </dl>
    </section>` : '';
  // The circuit's best, by scoring (at least 8 games).
  const top = (sm.players || []).filter(x => x.aau && x.aau.gp >= 8).sort((a, b) => b.aau.ppg - a.aau.ppg).slice(0, 25);
  const leaders = top.length ? `<section class="summer-card summer-wide">
      <div class="summer-head"><span class="summer-kicker">AAU</span><h3>Scoring leaders</h3></div>
      <div class="table-container"><table class="portal-table summer-table"><thead><tr><th style="text-align:left">Player</th><th>Class</th><th style="text-align:left">Program</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>TS%</th></tr></thead><tbody>
      ${top.map(x => `<tr class="portal-row has-profile" onclick="openPortalPlayer('${escAttr(x.n)}')"><td style="text-align:left"><b>${portalEsc(x.n)}</b>${x.b >= 2 ? ' <span class="summer-hot" title="Breakout summer">▲</span>' : ''}</td><td>${x.c}</td><td style="text-align:left">${portalEsc(x.t || '')} <small>${portalEsc(x.ci || '')}</small></td><td>${x.aau.gp}</td><td><b>${x.aau.ppg}</b></td><td>${x.aau.rpg}</td><td>${x.aau.apg}</td><td>${portalEsc(x.aau.ts)}</td></tr>`).join('')}
      </tbody></table></div></section>` : '';
  const past = (sm.history || []).filter(h => h.season !== sm.season).slice().reverse();
  const history = past.length ? `<section class="summer-card summer-wide"><div class="summer-head"><span class="summer-kicker">Past summers</span><h3>Champions</h3></div>
      <ul class="summer-history">${past.map(h => `<li><b>${h.season}</b> ${(h.champions || []).map(c => `${portalEsc(c.event)}: ${portalEsc(c.team)}`).join(' · ')}${h.fiba ? ` · ${portalEsc(h.fiba.name)}: ${portalEsc(h.fiba.medals.gold)}` : ''}</li>`).join('')}</ul></section>` : '';
  el.innerHTML = `<div class="portal-summary"><b>Summer ${sm.season}</b><span>The AAU circuits for the rising seniors and juniors${f ? `, and the ${portalEsc(f.name)}` : ''}, played in the NCAA RP.</span></div>
    <div class="summer-grid">${circuits}${fiba}${leaders}${history}</div>`;
}

// ---------- Transfer Portal tab ----------

function setPortalFilter(key, value) {
  Portal.filters[key] = value;
  Portal.shown = PORTAL_PAGE;
  renderPortal();
}

function showMorePortal() { Portal.shown += PORTAL_PAGE * 3; renderPortal(); }

function portalFiltered() {
  const f = Portal.filters;
  const q = f.q.trim().toLowerCase();
  return Portal.all.filter(t => {
    if (f.season && f.season !== 'ALL' && t.season !== f.season) return false;
    if (f.type === 'SCHEDULED' && !t.scheduled) return false;
    if (f.type === 'PORTAL' && t.scheduled) return false;
    if (f.pos !== 'ALL' && String(t.pos || '').toUpperCase() !== f.pos) return false;
    if (q && !`${t.name} ${t.from} ${t.to}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (seasonStart(b.season) - seasonStart(a.season)) || ((b.rating || 0) - (a.rating || 0)) || a.name.localeCompare(b.name));
}

function recruitByName(name) {
  const k = portalKey(name);
  return (typeof recruits !== 'undefined' ? recruits : []).find(r => portalKey(r.name) === k) || null;
}

function openPortalPlayer(name) {
  const p = recruitByName(name);
  if (p) openRecruitProfile(p);
}

function schoolChip(school, extra = '') {
  return `<span class="portal-school ${extra}">
      <img src="${getSchoolLogoPath(school)}" class="school-logo" loading="lazy" alt="" onerror="schoolLogoFallback(this, '${escAttr(school)}')">
      <span>${portalEsc(school)}</span>
    </span>`;
}

function portalRow(t) {
  const recruit = recruitByName(t.name);
  const avatar = recruit && recruit.pfp && recruit.pfp.trim() ? recruit.pfp : EMPTY_PFP;
  const upcoming = isUpcoming(t);
  const meta = [t.pos, t.class, t.ht].filter(Boolean).join(' · ');
  const badge = t.scheduled
    ? '<span class="portal-badge scheduled" title="Written into the NCAA RP roster sheet">Scheduled</span>'
    : '<span class="portal-badge portal" title="Entered the portal in the NCAA simulation">Portal</span>';
  return `<tr class="portal-row${recruit ? ' has-profile' : ''}" ${recruit ? `onclick="openPortalPlayer('${escAttr(t.name)}')"` : ''}>
    <td class="col-player">
      <div class="player-cell">
        <img src="${avatar}" class="player-avatar-sm" loading="lazy" decoding="async" alt="" onerror="this.src='${EMPTY_PFP}';">
        <div class="player-text">
          <span class="player-name">${portalEsc(t.name)}</span>
          <span class="player-sub">${portalEsc(meta)}${t.ppg != null && t.ppg !== '' ? ` · ${portalEsc(t.ppg)} PPG` : ''}</span>
        </div>
      </div>
    </td>
    <td class="col-grade">${t.rating ? `<span class="rating-pill">${Math.round(t.rating)}</span>` : '<span class="player-sub">—</span>'}</td>
    <td class="col-move">
      <div class="portal-move">${schoolChip(t.from, 'from')}<span class="portal-arrow" aria-label="to">&rarr;</span>${schoolChip(t.to, 'to')}</div>
    </td>
    <td class="col-season"><span class="badge-class">${portalEsc(t.season)}</span></td>
    <td class="col-type">${badge}${upcoming ? '<span class="portal-badge upcoming" title="Takes effect next season">Upcoming</span>' : ''}</td>
  </tr>`;
}

function renderPortal() {
  const panel = document.getElementById('portalBody');
  if (!panel) return;
  const f = Portal.filters;

  const seasonSel = document.getElementById('portalSeason');
  if (seasonSel) {
    const seasons = portalSeasons();
    seasonSel.innerHTML = `<option value="ALL">All Seasons</option>` +
      seasons.map(s => `<option value="${s}" ${s === f.season ? 'selected' : ''}>${s}${seasonStart(s) > currentSeasonStartYear() ? ' (upcoming)' : ''}</option>`).join('');
    if (f.season === 'ALL') seasonSel.value = 'ALL';
  }

  const summary = document.getElementById('portalSummary');
  if (!Portal.ready.sheet || !Portal.ready.universe) {
    panel.innerHTML = `<tr><td colspan="5" class="portal-empty">Loading transfers…</td></tr>`;
    return;
  }
  if (!Portal.all.length) {
    if (summary) summary.innerHTML = '';
    panel.innerHTML = `<tr><td colspan="5" class="portal-empty">No transfers yet. Moves written into the NCAA RP roster sheet and portal moves from the published simulation will appear here.</td></tr>`;
    return;
  }

  const list = portalFiltered();
  const sched = list.filter(t => t.scheduled).length;
  if (summary) {
    const u = Portal.universe;
    summary.innerHTML = `
      <span><b>${list.length}</b> transfer${list.length === 1 ? '' : 's'}</span>
      <span><b>${sched}</b> scheduled</span>
      <span><b>${list.length - sched}</b> portal</span>
      <span class="portal-source">${u ? `Universe: ${portalEsc(u.season.label)} season` : 'Roster sheet only — the simulation hasn\'t been published yet'}</span>`;
  }

  panel.innerHTML = list.length
    ? list.slice(0, Portal.shown).map(portalRow).join('') +
      (list.length > Portal.shown ? `<tr class="portal-more"><td colspan="5"><button class="query-btn" onclick="showMorePortal()">Show more (${list.length - Portal.shown} left)</button></td></tr>` : '')
    : `<tr><td colspan="5" class="portal-empty">No transfers match these filters.</td></tr>`;
}

// ---------- Recruit profile: "In the NCAA RP" ----------

function nbaLogoPath(team) { return `${ASSET_BASE_PATH}nbalogos/${encodeURIComponent(team.logo || team.name)}.png`; }

function rpCareerHTML(p) {
  if (!p || !p.name) return '';
  const k = portalKey(p.name);
  const u = Portal.universe;
  const alum = u && (u.alumni || []).find(a => portalKey(a.name) === k);
  const moves = Portal.all.filter(t => portalKey(t.name) === k)
    .sort((a, b) => seasonStart(a.season) - seasonStart(b.season));
  const rows = Portal.rosterRows.filter(r => portalKey(r.name) === k).sort((a, b) => b.year - a.year);
  const sheetNow = rows.find(r => r.year && r.year - 1 <= currentSeasonStartYear()) || rows[rows.length - 1];
  if (!alum && !moves.length && !sheetNow) return '';

  let status = '';
  if (alum && alum.draft) {
    const d = { ...alum.draft };
    if (typeof d.team === 'string') d.team = { name: d.team, logo: d.team };
    status = `<div class="rp-status drafted">
        ${d.team ? `<img src="${nbaLogoPath(d.team)}" class="rp-status-logo" alt="" onerror="this.remove()">` : ''}
        <div><span class="rp-status-label">${d.year} NBA Draft</span>
        <span class="rp-status-main">Pick ${d.pick}${d.team ? ` · ${portalEsc(d.team.name)}` : ''}</span></div>
        <a class="query-btn" href="../rp/draft.html">Draft RP &rarr;</a>
      </div>`;
  } else if (alum && alum.active && alum.school) {
    status = `<div class="rp-status">
        <img src="${getSchoolLogoPath(alum.school)}" class="rp-status-logo" alt="" onerror="schoolLogoFallback(this, '${escAttr(alum.school)}')">
        <div><span class="rp-status-label">${portalEsc(u.season.label)} · ${portalEsc(alum.class || '')}</span>
        <span class="rp-status-main">${portalEsc(alum.school)}</span></div>
        <a class="query-btn" href="../rp/ncaa.html">NCAA RP &rarr;</a>
      </div>`;
  } else if (alum) {
    status = `<div class="rp-status"><div><span class="rp-status-label">College career</span><span class="rp-status-main">Finished</span></div></div>`;
  } else if (sheetNow) {
    status = `<div class="rp-status">
        <img src="${getSchoolLogoPath(sheetNow.team)}" class="rp-status-logo" alt="" onerror="schoolLogoFallback(this, '${escAttr(sheetNow.team)}')">
        <div><span class="rp-status-label">${sheetNow.year ? sheetSeasonLabel(sheetNow.year) : 'Roster'}${sheetNow.cls ? ' · ' + portalEsc(sheetNow.cls) : ''}</span>
        <span class="rp-status-main">${portalEsc(sheetNow.team)}</span></div>
      </div>`;
  }

  const path = (alum && alum.collegeHistory && alum.collegeHistory.length > 1) ? alum.collegeHistory : null;
  const pathHTML = path ? `<div class="rp-path">${path.map(s => schoolChip(s)).join('<span class="portal-arrow">&rarr;</span>')}</div>` : '';

  const movesHTML = moves.length ? `<div class="recruiting-section-title">Transfers</div>
    <ul class="rp-moves">${moves.map(t => `<li><span class="badge-class">${portalEsc(t.season)}</span>
      <div class="portal-move">${schoolChip(t.from)}<span class="portal-arrow">&rarr;</span>${schoolChip(t.to)}</div>
      ${t.scheduled ? '<span class="portal-badge scheduled">Scheduled</span>' : '<span class="portal-badge portal">Portal</span>'}
      ${isUpcoming(t) ? '<span class="portal-badge upcoming">Upcoming</span>' : ''}</li>`).join('')}</ul>` : '';

  const fmt = v => (v == null || v === '' ? '—' : v);
  const seasons = alum && alum.seasons && alum.seasons.length ? `
    <div class="profile-stats-table-wrapper">
      <table class="profile-stats-table rp-season-table">
        <tr><th>Season</th><th>School</th><th>Cl</th><th>GP</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>FG%</th><th>3P%</th><th>BPM</th></tr>
        ${alum.seasons.map(s => `<tr><td>${portalEsc(s.season)}</td><td class="rp-season-school">${portalEsc(s.school)}</td><td>${portalEsc(s.class || '')}</td>
          <td>${fmt(s.gp)}</td><td>${fmt(s.mpg)}</td><td>${fmt(s.ppg)}</td><td>${fmt(s.rpg)}</td><td>${fmt(s.apg)}</td>
          <td>${fmt(s.spg)}</td><td>${fmt(s.bpg)}</td><td>${fmt(s.fgPct)}</td><td>${fmt(s.threePPct)}</td><td>${fmt(s.bpm)}</td></tr>`).join('')}
      </table>
    </div>` : '';

  return `<div class="stats-box-full rp-career">
      <div class="rp-career-head">
        <h3>In the NCAA RP</h3>
        ${status}
      </div>
      ${pathHTML}
      ${seasons}
      ${movesHTML}
    </div>`;
}

window.addEventListener('load', loadPortalData);
