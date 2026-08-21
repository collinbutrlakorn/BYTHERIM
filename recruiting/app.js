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

window.onload = () => {
  if (GOOGLE_SHEET_CSV_URL === 'YOUR_PUBLISHED_CSV_URL_HERE' || !GOOGLE_SHEET_CSV_URL) {
    alert("Please set your published Google Sheets CSV URL inside the <script> tags at 'GOOGLE_SHEET_CSV_URL'.");
    return;
  }
  
  Papa.parse(GOOGLE_SHEET_CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      try {
        const parseArray = (str) => typeof str === 'string' && str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
        
        const buildStatTier = (row, tier) => ({
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

        recruits = results.data.map(row => ({
          id: String(row.id || Math.random().toString(36).substr(2, 9)),
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
          finalList: row.finalListSchools ? {
            title: String(row.finalListTitle || "Final List"),
            schools: parseArray(row.finalListSchools)
          } : null,
          offers: parseArray(row.offers),
          scouting: String(row.scouting || "No description available."),
          strengths: parseArray(row.strengths),
          weaknesses: parseArray(row.weaknesses),
          stats: { hs: buildStatTier(row, 'hs'), aau: buildStatTier(row, 'aau'), fiba: buildStatTier(row, 'fiba'), intl: buildStatTier(row, 'intl') }
        }));

        if (recruits.length > 0) {
          activeRecruit = recruits[0];
          renderProfile(activeRecruit);
        }
        filterRecruits();
        renderSchoolRankings();
        renderQueryRulesUI();
        renderStatsDashboard();
      } catch (error) {
        console.error("Website UI Rendering Error:", error);
      }
    }
  });
};

function getSchoolLogoPath(schoolName) {
  if (!schoolName) return '';
  const clean = String(schoolName).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ASSET_BASE_PATH + `schoollogos/${clean}.png`;
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
  } else if (tabName === 'about') {
    document.getElementById('about-tab').classList.add('active');
    if (document.querySelectorAll('.nav-btn')[3]) document.querySelectorAll('.nav-btn')[3].classList.add('active');
  } else if (tabName === 'profile') {
    document.getElementById('profile-tab').classList.add('active');
  } else if (tabName === 'schoolDetail') {
    document.getElementById('schoolDetail-tab').classList.add('active');
  } else if (tabName === 'accoladeDetail') {
    document.getElementById('accoladeDetail-tab').classList.add('active');
  }
  
  const backBtn = document.getElementById('globalBackBtn');
  if (backBtn) {
    backBtn.style.display = tabHistory.length > 0 ? 'inline-flex' : 'none';
  }
}

function goBack() {
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
  if (isQueryEngaged) { badge.innerText = 'ENGAGED'; badge.style.background = 'rgba(39, 174, 96, 0.2)'; badge.style.color = '#2ecc71'; badge.style.border = '1px solid #2ecc71'; toggleBtn.innerText = 'Disengage Query Search'; toggleBtn.classList.add('engaged'); }
  else { badge.innerText = 'OFF'; badge.style.background = 'rgba(255, 255, 255, 0.05)'; badge.style.color = 'var(--text-muted)'; badge.style.border = '1px solid var(--border-color)'; toggleBtn.innerText = 'Engage Query Search'; toggleBtn.classList.remove('engaged'); }
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
    validPairs.forEach((pair) => { let countLess = validPairs.filter(x => x.val < pair.val).length; let countEqual = validPairs.filter(x => x.val === pair.val).length; let pct = N > 1 ? ((countLess + 0.5 * countEqual) / N) * 100 : 50; map[key][pair.id] = pct; });
  });
  return map;
}

function getPercentileStyle(pct, key) {
  if (pct === undefined || pct === null) return '';
  
  const negativeStats = ['topg', 'tov', 'drtg'];
  let effectivePct = pct;
  
  if (negativeStats.includes(key)) {
    effectivePct = 100 - pct;
  }

  if (effectivePct >= 60) { 
    let intensity = (effectivePct - 60) / 40; 
    let alpha = 0.12 + intensity * 0.38; 
    return `background-color: rgba(39, 174, 96, ${alpha.toFixed(2)}); color: #a3e635; font-weight: 700;`; 
  } else if (effectivePct <= 40) { 
    let intensity = (40 - effectivePct) / 40; 
    let alpha = 0.12 + intensity * 0.38; 
    return `background-color: rgba(231, 76, 60, ${alpha.toFixed(2)}); color: #f87171; font-weight: 700;`; 
  }
  return `background-color: rgba(255, 255, 255, 0.05); color: #ffffff;`;
}

function filterRecruits() {
  const query = String(document.getElementById('searchInput').value).toLowerCase();
  const classYr = document.getElementById('classFilter').value;
  const state = document.getElementById('stateFilter').value;
  const pos = document.getElementById('posFilter').value;
  const star = document.getElementById('starFilter').value;

  let filtered = recruits.filter(r => {
    const matchesSearch = String(r.name || "").toLowerCase().includes(query) || String(r.hs || "").toLowerCase().includes(query);
    const matchesClass = (classYr === 'OVERALL') ? true : (r.classYear === classYr);
    const matchesState = state === 'ALL' || r.state === state;
    const matchesPos = pos === 'ALL' || r.pos === pos;
    const matchesStar = star === 'ALL' || r.stars.toString() === star;
    return matchesSearch && matchesClass && matchesState && matchesPos && matchesStar;
  });

  if (classYr === 'OVERALL') filtered.sort((a, b) => b.rating - a.rating);
  else filtered.sort((a, b) => { const rankA = a.rank === "N/A" ? 9999 : a.rank; const rankB = b.rank === "N/A" ? 9999 : b.rank; return rankA - rankB; });
  renderRankingsTable(filtered, classYr === 'OVERALL');
}

function renderRankingsTable(data, isOverall = false) {
  const tbody = document.getElementById('recruitsTableBody'); tbody.innerHTML = '';
  if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="10" style="color: var(--text-muted); padding: 2rem;">No players match the current filter selection.</td></tr>`; return; }

  data.forEach((p, index) => {
    const row = document.createElement('tr');
    row.onclick = () => { activeRecruit = p; renderProfile(p); switchTab('profile'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const displayRank = isOverall ? `${index + 1}` : `${p.rank}`;
    const starDisplay = p.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (p.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`);
    const stateDisplay = p.state === 'INT' ? `<span class="badge-intl">INTL</span>` : `<span>${p.state}</span>`;
    const pfpImg = p.pfp && p.pfp.trim() !== "" ? p.pfp : EMPTY_PFP;
    let statusHTML = p.commitLogo ? `<div class="status-cell"><img src="${p.commitLogo}" class="school-logo" onerror="this.style.display='none';"><span style="font-weight: 700;">${p.status}</span></div>` : `<span>${p.status}</span>`;

    row.innerHTML = `
      <td><span class="rank-num">${displayRank}</span></td>
      <td><div class="player-cell"><img src="${pfpImg}" class="player-avatar-sm" onerror="this.src='${EMPTY_PFP}';"><div><span class="player-name">${p.name}</span><span class="player-sub">${p.hometown}</span></div></div></td>
      <td><span class="badge-class">'${p.classYear.slice(-2)}</span></td>
      <td><span class="badge-pos">${p.pos}</span></td>
      <td><span>${p.height} / ${p.weight}</span></td>
      <td>${stateDisplay}</td>
      <td><span>${p.hs}</span></td>
      <td>${starDisplay}</td>
      <td><span class="rating-pill">${p.rating}</span></td>
      <td style="text-align: left;">${statusHTML}</td>
    `;
    tbody.appendChild(row);
  });
}

function getSchoolRankingsData(yearFilter = 'ALL') {
  const schoolMap = {};
  let filteredRecruits = yearFilter !== 'ALL' ? recruits.filter(r => r.classYear === yearFilter) : recruits;

  filteredRecruits.forEach(r => {
    if (r.status && r.status.includes("Committed to ")) {
      const schoolName = r.status.replace("Committed to ", "").trim();
      if (!schoolMap[schoolName]) schoolMap[schoolName] = { name: schoolName, logo: r.commitLogo || getSchoolLogoPath(schoolName), recruits: [] };
      schoolMap[schoolName].recruits.push(r);
    }
  });

  const schoolList = Object.values(schoolMap).map(s => {
    s.recruits.sort((a, b) => b.rating - a.rating);
    let currentScore = 0; let weight = 1.0;
    s.recruits.forEach((r) => { let impact = (r.rating / 100) * weight; currentScore = currentScore + ((100 - currentScore) * impact); weight *= 0.8; });
    return { ...s, recruitCount: s.recruits.length, overallGrade: parseFloat(currentScore.toFixed(2)) };
  });

  schoolList.sort((a, b) => b.overallGrade - a.overallGrade || b.recruitCount - a.recruitCount);
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
    const row = document.createElement('tr'); row.onclick = () => selectSchool(s.name, yearFilter);
    const commitsListHTML = s.recruits.map(r => `<div class="commit-tag" onclick="event.stopPropagation(); activeRecruit = recruits.find(p => p.id === '${r.id}'); renderProfile(activeRecruit); switchTab('profile');" style="cursor: pointer;"><span style="font-weight: 700;">${r.name}</span> <span style="color: var(--text-muted);">('${r.classYear.slice(-2)} ${r.pos})</span> <span>Grade: ${r.rating}</span></div>`).join('');
    row.innerHTML = `
      <td><span class="rank-num">${idx + 1}</span></td>
      <td style="text-align: left;"><div class="status-cell"><img src="${s.logo}" class="school-logo-lg" onerror="this.style.display='none';"><strong style="font-size: 0.95rem;">${s.name}</strong></div></td>
      <td><span class="badge-class">${s.recruitCount} ${s.recruitCount === 1 ? 'Commit' : 'Commits'}</span></td>
      <td><div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 4px;">${commitsListHTML}</div></td>
      <td><span class="rating-pill" style="font-size: 0.95rem; padding: 6px 14px;">${s.overallGrade} / 100</span></td>
    `;
    tbody.appendChild(row);
  });
}

function selectSchool(schoolName, defaultYear = '2028') { activeSelectedSchool = schoolName; renderSchoolDetail(schoolName, defaultYear); switchTab('schoolDetail'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function renderSchoolDetail(schoolName, selectedYear = '2028') {
  const container = document.getElementById('schoolDetailContainer');
  const allTimeSchoolList = getSchoolRankingsData('ALL');
  const schoolIndex = allTimeSchoolList.findIndex(s => s.name === schoolName);
  const schoolData = allTimeSchoolList[schoolIndex];
  const safeSchoolName = String(schoolName).replace(/'/g, "\\'"); 

  if (!schoolData) { container.innerHTML = `<div style="color: var(--text-muted); padding: 2rem;">School details not found.</div>`; return; }

  const filteredCommits = schoolData.recruits.filter(r => selectedYear === 'ALL' || r.classYear === selectedYear);
  let displayAvgGrade = schoolData.overallGrade;
  if (selectedYear !== 'ALL' && filteredCommits.length > 0) {
    let currentScore = 0; let weight = 1.0;
    const sortedFiltered = [...filteredCommits].sort((a, b) => b.rating - a.rating);
    sortedFiltered.forEach((r) => { let impact = (r.rating / 100) * weight; currentScore = currentScore + ((100 - currentScore) * impact); weight *= 0.8; });
    displayAvgGrade = currentScore.toFixed(2);
  } else if (selectedYear !== 'ALL') { displayAvgGrade = "0.00"; }

  const commitsGridHTML = filteredCommits.length === 0 ? `<div style="color: var(--text-muted); padding: 2rem; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); width: 100%;">No committed recruits found for Class of ${selectedYear}.</div>` : 
    filteredCommits.map(r => `<div class="commit-player-card" onclick="activeRecruit = recruits.find(p => p.id === '${r.id}'); renderProfile(activeRecruit); switchTab('profile');"><img src="${r.pfp && r.pfp.trim() !== '' ? r.pfp : EMPTY_PFP}" class="player-avatar-sm" style="width: 50px; height: 50px;" onerror="this.src='${EMPTY_PFP}';"><div style="flex: 1;"><div style="font-weight: 700; font-size: 0.95rem;">${r.name}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">'${r.classYear.slice(-2)} | ${r.pos} | ${r.height} / ${r.weight}</div><div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;"><div>${r.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (r.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`)}</div><span class="rating-pill" style="font-size: 0.75rem; padding: 2px 6px;">${r.rating}</span></div></div></div>`).join('');

  container.innerHTML = `
    <div class="school-detail-header">
      <div class="school-detail-brand">
        <img src="${schoolData.logo || getSchoolLogoPath(schoolName)}" class="school-detail-logo" onerror="this.style.display='none';">
        <div><h1 style="font-size: 1.8rem;">${schoolName.toUpperCase()}</h1><div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px;">RECRUITING CLASS DASHBOARD</div></div>
      </div>
      <div class="school-detail-stats">
        <div class="school-stat-card"><div class="school-stat-val">${displayAvgGrade}</div><div class="school-stat-lbl">${selectedYear === 'ALL' ? 'Overall Grade' : 'Class Grade'}</div></div>
        <div class="school-stat-card"><div class="school-stat-val">${filteredCommits.length}</div><div class="school-stat-lbl">Commits (${selectedYear})</div></div>
      </div>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 10px;">
      <h2 style="font-size: 1.1rem;">Committed Recruits</h2>
      <div style="display: flex; align-items: center; gap: 10px;">
        <label for="schoolClassFilter" style="font-size: 0.8rem; color: var(--text-muted);">Filter Class:</label>
        <select id="schoolClassFilter" class="select-input" onchange="renderSchoolDetail('${safeSchoolName}', this.value)">
          <option value="ALL" ${selectedYear === 'ALL' ? 'selected' : ''}>All Classes</option>
          <option value="2028" ${selectedYear === '2028' ? 'selected' : ''}>Class of 2028</option>
          <option value="2029" ${selectedYear === '2029' ? 'selected' : ''}>Class of 2029</option>
          <option value="2030" ${selectedYear === '2030' ? 'selected' : ''}>Class of 2030</option>
          <option value="2031" ${selectedYear === '2031' ? 'selected' : ''}>Class of 2031</option>
          <option value="2032" ${selectedYear === '2032' ? 'selected' : ''}>Class of 2032</option>
          <option value="2033" ${selectedYear === '2033' ? 'selected' : ''}>Class of 2033</option>
          <option value="2034" ${selectedYear === '2034' ? 'selected' : ''}>Class of 2034</option>
          <option value="2035" ${selectedYear === '2035' ? 'selected' : ''}>Class of 2035</option>
          <option value="2036" ${selectedYear === '2036' ? 'selected' : ''}>Class of 2036</option>
          <option value="2037" ${selectedYear === '2037' ? 'selected' : ''}>Class of 2037</option>
          <option value="2038" ${selectedYear === '2038' ? 'selected' : ''}>Class of 2038</option>
          <option value="2039" ${selectedYear === '2039' ? 'selected' : ''}>Class of 2039</option>
          <option value="2040" ${selectedYear === '2040' ? 'selected' : ''}>Class of 2040</option>
        </select>
      </div>
    </div>
    <div class="school-commits-grid">${commitsGridHTML}</div>
  `;
}

function openAccoladeRoster(accoladeName, selectedYear = '2028') { renderAccoladeDetail(accoladeName, selectedYear); switchTab('accoladeDetail'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

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

      const renderCard = (r) => `<div class="commit-player-card" onclick="activeRecruit = recruits.find(p => p.id === '${r.id}'); renderProfile(activeRecruit); switchTab('profile');"><img src="${r.pfp && r.pfp.trim() !== '' ? r.pfp : EMPTY_PFP}" class="player-avatar-sm" style="width: 52px; height: 52px;" onerror="this.src='${EMPTY_PFP}';"><div style="flex: 1;"><div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${r.name}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Class of '${r.classYear.slice(-2)} | ${r.pos} | ${r.height}</div><div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${r.hs} (${r.state})</div><div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; justify-content: space-between;"><div>${r.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (r.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`)}</div><span class="rating-pill" style="font-size: 0.75rem; padding: 2px 6px;">${r.rating} OVR</span></div></div></div>`;

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
    const renderCard = (r) => `<div class="commit-player-card" onclick="activeRecruit = recruits.find(p => p.id === '${r.id}'); renderProfile(activeRecruit); switchTab('profile');"><img src="${r.pfp && r.pfp.trim() !== '' ? r.pfp : EMPTY_PFP}" class="player-avatar-sm" style="width: 52px; height: 52px;" onerror="this.src='${EMPTY_PFP}';"><div style="flex: 1;"><div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${r.name}</div><div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Class of '${r.classYear.slice(-2)} | ${r.pos} | ${r.height}</div><div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${r.hs} (${r.state})</div><div style="display: flex; gap: 8px; align-items: center; margin-top: 6px; justify-content: space-between;"><div>${r.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (r.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`)}</div><span class="rating-pill" style="font-size: 0.75rem; padding: 2px 6px;">${r.rating} OVR</span></div></div></div>`;
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
    let html = `<td><div class="player-cell"><img src="${p.pfp && p.pfp.trim() !== '' ? p.pfp : EMPTY_PFP}" class="player-avatar-sm" onerror="this.src='${EMPTY_PFP}';"><span class="player-name">${p.name}</span></div></td><td><span class="badge-pos">${p.pos}</span></td><td><span class="badge-class">'${p.classYear.slice(-2)}</span></td>`;
    keys.forEach(k => { let rawVal = getComputedStat(st, k); let pct = pctMap[k] ? pctMap[k][p.id] : null; let style = getPercentileStyle(pct, k); html += `<td style="${style}">${rawVal}</td>`; });
    row.innerHTML = html + `</tr>`; tbody.appendChild(row);
  });
}

function renderProfile(p) {
  if(!p) return;
  const container = document.getElementById('profileContainer');
  const starDisplay = p.stars === 5 ? `<span class="stars-5">★★★★★</span>` : (p.stars === 4 ? `<span class="stars-4">★★★★☆</span>` : `<span class="stars-3">★★★☆☆</span>`);
  
  // Calculate Dynamic Ranks within same Class Year
  const classRecruits = recruits.filter(r => r.classYear === p.classYear);
  classRecruits.sort((a, b) => {
    const rA = (a.rank && !isNaN(parseInt(a.rank))) ? parseInt(a.rank) : (1000 - a.rating);
    const rB = (b.rank && !isNaN(parseInt(b.rank))) ? parseInt(b.rank) : (1000 - b.rating);
    return rA - rB;
  });

  // Overall Class Rank
  const classRankIdx = classRecruits.findIndex(r => r.id === p.id);
  const classRank = classRankIdx !== -1 ? `#${classRankIdx + 1}` : (p.rank !== "N/A" ? `#${p.rank}` : 'N/A');

  // Position Rank in Class
  const posRecruits = classRecruits.filter(r => r.pos === p.pos);
  const posRankIdx = posRecruits.findIndex(r => r.id === p.id);
  const posRank = posRankIdx !== -1 ? `#${posRankIdx + 1}` : 'N/A';

  // State Rank in Class
  let stateRank = 'N/A';
  if (p.state && p.state !== 'ALL' && p.state !== 'INT') {
    const stateRecruits = classRecruits.filter(r => r.state === p.state);
    const stateRankIdx = stateRecruits.findIndex(r => r.id === p.id);
    if (stateRankIdx !== -1) stateRank = `#${stateRankIdx + 1} (${p.state})`;
  } else if (p.state === 'INT') {
    const intlRecruits = classRecruits.filter(r => r.state === 'INT');
    const intlRankIdx = intlRecruits.findIndex(r => r.id === p.id);
    if (intlRankIdx !== -1) stateRank = `#${intlRankIdx + 1} (INTL)`;
  }

  const statusHTML = p.commitLogo ? `
    <div class="commit-standout-box">
      <div class="commit-label">Committed To</div>
      <div class="commit-main-info"><img src="${p.commitLogo}" class="commit-standout-logo" onerror="this.style.display='none';"><span class="commit-school-name">${p.committedSchool}</span></div>
    </div>` : `
    <div class="uncommitted-box">
      <div class="commit-label" style="margin-bottom: 4px;">Status</div>
      <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">Uncommitted</div>
    </div>`;

  const finalListHTML = p.finalList ? p.finalList.schools.map(s => `<div class="final-school-card ${s === p.committedSchool ? 'is-commit' : ''}">${s}</div>`).join('') : '';
  const offersHTML = p.offers ? p.offers.map(o => `<div class="offer-pill">${o}</div>`).join('') : '';
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
      <div class="profile-stats-table-wrapper">
        <table class="profile-stats-table">
          <tr><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3FG%</th><th>FT%</th></tr>
          <tr><td>${st.gp}</td><td>${st.mpg}</td><td>${st.ppg}</td><td>${st.rpg}</td><td>${st.apg}</td><td>${st.spg}</td><td>${st.bpg}</td><td>${st.topg}</td><td>${st.fg}</td><td>${st.fg3}</td><td>${st.ft}</td></tr>
        </table>
      </div>`;
  }).join('');

  if (!statsTablesHTML) statsTablesHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 1rem;">No statistics available.</div>';

  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-header-left">
        <img src="${p.pfp && p.pfp.trim() !== '' ? p.pfp : EMPTY_PFP}" class="player-avatar-lg" onerror="this.src='${EMPTY_PFP}';">
        <div class="profile-title-area">
          <div class="profile-name-row">
            <h1>${p.name}</h1>
            <div>${starDisplay}</div>
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
        <div><div class="recruiting-section-title" style="color: #a3e635;">Strengths</div><ul style="padding-left: 1rem; color: var(--text-muted); margin-top: 8px;">${p.strengths.map(s => `<li>${s}</li>`).join('')}</ul></div>
        <div><div class="recruiting-section-title" style="color: #f87171;">Areas for Growth</div><ul style="padding-left: 1rem; color: var(--text-muted); margin-top: 8px;">${p.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul></div>
      </div>
    </div>

    <div class="stats-box-full">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
        <h3 style="margin: 0;">Statistical Profile</h3><button class="query-btn" onclick="switchTab('stats'); setStatLevel('hs', null);">View Advanced Data &rarr;</button>
      </div>
      ${statsTablesHTML}
    </div>
  `;
}

function submitFeedback(event) {
  event.preventDefault();
  const feedbackText = document.getElementById('feedbackInput').value.trim();
  if (!feedbackText) return;

  console.log("Feedback submitted:", feedbackText);

  document.getElementById('feedbackInput').value = '';
  const successMsg = document.getElementById('feedbackSuccess');
  successMsg.style.display = 'block';
  setTimeout(() => {
    successMsg.style.display = 'none';
  }, 4000);
}
