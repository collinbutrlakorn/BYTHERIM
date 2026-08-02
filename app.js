// 1. Google Sheet CSV URL (Your published link)
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N/pub?gid=0&single=true&output=csv";

// 2. Global variable to store our player data
let recruits = []; 

// 3. Image Dictionaries (Update paths to match your GitHub repository folder structure)
const COLLEGE_LOGOS = {
  "Duke": "assets/logos/duke.png",
  "Kentucky": "assets/logos/kentucky.png",
  "Kansas": "assets/logos/kansas.png",
  "UConn": "assets/logos/uconn.png",
  "North Carolina": "assets/logos/unc.png",
  "Rutgers": "assets/logos/rutgers.png"
};

const ACCOLADE_ICONS = {
  "McDonald's All-American": "assets/icons/mcdonalds-all-american.png",
  "Nike Hoop Summit": "assets/icons/nike-hoop-summit.png",
  "Jordan Brand Classic": "assets/icons/jordan-brand.png"
};

// 4. Defensive Parsing Helpers
const safeStr = (val, fallback = "") => (val && val.trim() !== "") ? val.trim() : fallback;
const safeNum = (val, fallback = 0) => {
  if (!val) return fallback;
  const parsed = parseFloat(val.toString().replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? fallback : parsed;
};
const safeArray = (val) => val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];

// 5. Stat Tier Builder
const buildStatTier = (row, tier) => ({
  team: safeStr(row[`${tier}_team`], "N/A"),
  gp: safeNum(row[`${tier}_gp`]),
  mpg: safeNum(row[`${tier}_mpg`]),
  ppg: safeNum(row[`${tier}_ppg`]),
  rpg: safeNum(row[`${tier}_rpg`]),
  apg: safeNum(row[`${tier}_apg`]),
  spg: safeNum(row[`${tier}_spg`]),
  bpg: safeNum(row[`${tier}_bpg`]),
  topg: safeNum(row[`${tier}_topg`]),
  fg: safeStr(row[`${tier}_fg`], "0.0%"),
  fg3: safeStr(row[`${tier}_fg3`], "0.0%"),
  ft: safeStr(row[`${tier}_ft`], "0.0%"),
  bpm: safeStr(row[`${tier}_bpm`], "0.0"),
  ts: safeStr(row[`${tier}_ts`], "0.0%"),
  rimPct: safeStr(row[`${tier}_rimpct`], "0.0%")
  // Add any other specific stats you need from the CSV here following the safeStr/safeNum pattern
});

// 6. Fetch and Parse Data
Papa.parse(GOOGLE_SHEET_CSV_URL, {
  download: true,
  header: true,
  skipEmptyLines: 'greedy',
  transformHeader: (header) => header.trim().toLowerCase(),
  complete: function(results) {
    
    recruits = results.data.map((row, index) => ({
      id: index + 1,
      rank: safeNum(row.rank, 999),
      name: safeStr(row.name, "Unknown Player"),
      class: safeStr(row.class, "2026"),
      pos: safeStr(row.pos, "N/A"),
      height: safeStr(row.height, "N/A"),
      weight: safeStr(row.weight, "N/A"),
      state: safeStr(row.state, "N/A"),
      school: safeStr(row.school, "N/A"),
      stars: safeNum(row.stars, 3),
      rating: safeNum(row.rating, 80.0),
      status: safeStr(row.status, "Uncommitted"),
      
      // Images & Text
      avatar: safeStr(row.avatar, "assets/images/default-avatar.png"),
      scouting_report: safeStr(row.scouting_report, "No report available."),
      
      // Arrays for Icons and Lists
      areas_for_growth: safeArray(row.areas_for_growth),
      offers: safeArray(row.offers),
      final_list: safeArray(row.final_list),
      accolades: safeArray(row.accolades),
      
      // Stats Objects
      stats: {
        hs: buildStatTier(row, 'hs'),
        aau: buildStatTier(row, 'aau'),
        fiba: buildStatTier(row, 'fiba'),
        intl: buildStatTier(row, 'intl')
      }
    }));

    console.log("Data successfully loaded:", recruits);
    
    // Call your initial rendering function here once data is ready
    renderAllPlayers(recruits);
  }
});

// 7. Rendering Functions

function renderOfferLogos(offerList) {
  if (offerList.length === 0) return `<p>No offers listed</p>`;
  return offerList.map(school => {
    const logoUrl = COLLEGE_LOGOS[school] || "assets/logos/default-college.png";
    return `<img src="${logoUrl}" alt="${school}" title="${school}" class="school-logo-icon" />`;
  }).join('');
}

function renderAccoladeBadges(accoladeList) {
  return accoladeList.map(badge => {
    const iconUrl = ACCOLADE_ICONS[badge];
    if (!iconUrl) return `<span class="text-badge">${badge}</span>`; 
    return `<img src="${iconUrl}" alt="${badge}" title="${badge}" class="accolade-badge-icon" />`;
  }).join('');
}

function renderAllPlayers(playerData) {
  // Assuming you have a <div id="player-container"></div> in your HTML
  const container = document.getElementById('player-container');
  if (!container) return;

  container.innerHTML = playerData.map(player => `
    <div class="player-card">
      <div class="player-header">
        <img src="${player.avatar}" class="player-avatar" alt="${player.name}" />
        <div>
          <h2>#${player.rank} ${player.name}</h2>
          <p>${player.height} | ${player.weight} | ${player.pos} | ${player.class}</p>
        </div>
      </div>

      <div class="accolades-container">
        ${renderAccoladeBadges(player.accolades)}
      </div>

      <div class="scouting-report">
        <h3>Scouting Report</h3>
        <p>${player.scouting_report}</p>
        
        <h4>Areas for Growth</h4>
        <ul>
          ${player.areas_for_growth.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>

      <div class="offers-section">
        <h3>Offers</h3>
        <div class="logo-grid">
          ${renderOfferLogos(player.offers)}
        </div>
      </div>
    </div>
  `).join('');
}
