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
    pos: sheetCell(r, 'pos', 'position'),
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
  if (!flips.length && !live) return;
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
  if (moved && typeof filterRecruits === 'function') {
    if (typeof buildRankIndex === 'function') buildRankIndex();
    filterRecruits();
    if (typeof renderSchoolRankings === 'function') renderSchoolRankings();
    if (typeof currentActiveTab !== 'undefined' && currentActiveTab === 'profile' && typeof activeRecruit !== 'undefined' && activeRecruit) renderProfile(activeRecruit);
  }
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
