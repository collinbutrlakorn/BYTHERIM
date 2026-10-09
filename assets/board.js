/* ============================================================
   BYTHERIM — big board data.

   Loads the draft board sheet and cleans it once, so the draft page and
   the home page's top-10 preview read identical data. Cleaning handles
   what's actually in the sheet today:
     - school names with trailing spaces or lowercase slugs ("gtech")
     - a "3P&" header that should be "3P%"
     - stat cells holding "-" or a conference tag ("ACC") before the
       season starts — treated as no stat, and the tag kept as the
       player's conference
   College stats come from data/stats.json, which tools/update-stats.mjs
   refreshes daily from Barttorvik. Numbers typed into the sheet's stat
   columns take priority (use them for pros).

   Boards: the current board is the sheet's first tab. Past boards are
   found automatically: any tab named with a year and "Board" (for
   example "2025 Board") shows up on the draft page's year switcher —
   unless it's still an unedited copy of the current board.

   Stat columns: G (games) and MP (minutes per game) sit alongside PTS,
   REB and the rest; typed numbers show for anyone Barttorvik doesn't
   cover (pros and internationals).

   Optional sheet columns (add any of them; nothing changes if absent):
     Prev Rank   last edition's rank, shown as movement on the board
     Wingspan    shown with the measurements
     Comparison  player comp, shown on the profile
     Strengths / Weaknesses   separate items with ";" or new lines
     Film        YouTube links play right on the profile (a normal link,
                 a youtu.be share link, an embed link or the whole
                 <iframe> snippet all work; put several on separate lines
                 or between "|"). Any other site shows as a "Watch film"
                 button.
     Stats Name  the player's name as Barttorvik spells it, if different
     Stats Link  a Basketball-Reference international or G League page
                 (e.g. basketball-reference.com/international/players/...)
                 fills in that player's stats automatically; any other
                 page is shown as a "Full stats" link under the table
   Past boards also read:
     Draft Pick  the actual pick number, or "Undrafted" / "Returned"
     Draft Team  the team that drafted him ("Spurs", "SAS", "San Antonio Spurs")
     Draft Year  only needed if he was drafted in a later year than the board
   Requires site.js (BTR.parseCSV).
   ============================================================ */
(function () {
  'use strict';

  const BOARD = {
    sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjSzV7c31_8uY69vD-UzxT_rqX_mqjOxECd0aFr-gien0cULby0kLa8iV3ISnuskTr7u2AevhwB7ZN/pub?output=csv',
    draftYear: 2027,
    draftDate: '2027-06-24',  // used for age on draft night
    stats: 'data/stats.json'  // written by tools/update-stats.mjs
  };
  // Seasons are named by the year they end: 2027 -> "2026-27".
  const seasonLabel = y => `${y - 1}-${String(y).slice(2)}`;
  const CURRENT_SEASON = seasonLabel(BOARD.draftYear);
  const LAST_SEASON = seasonLabel(BOARD.draftYear - 1);
  const PUB_BASE = BOARD.sheet.replace(/\/pub(html)?\?.*$/, '');

  // Tier names, as BYTHERIM defines them.
  const TIERS = {
    1: 'Superstar', 2: 'All-NBA', 3: 'All-Star', 4: 'Sub All-Star / Strong Starter', 5: 'Solid Starter',
    6: 'T7 Rotation Player', 7: 'Backend Rotation', 8: 'Upside Swing', 9: '2-Way', 10: 'E10',
    '?': 'Possible Entry / Return'
  };

  const SCHOOL_NAMES = {
    gtech: 'Georgia Tech', ohiostate: 'Ohio State', unc: 'North Carolina', stjohns: "St. John's",
    usc: 'USC', byu: 'BYU', ucla: 'UCLA', lsu: 'LSU', tcu: 'TCU', smu: 'SMU', vcu: 'VCU', unlv: 'UNLV', ucf: 'UCF'
  };
  const CONFERENCES = new Set(['ACC', 'B10', 'B12', 'BE', 'SEC', 'P12', 'WCC', 'MWC', 'A10', 'AAC', 'BSky', 'MVC', 'CUSA', 'SBC', 'MAC', 'WAC', 'CAA', 'Ivy']);
  const CONF_LABEL = { B10: 'Big Ten', B12: 'Big 12', BE: 'Big East', P12: 'Pac-12', BSky: 'Big Sky', MWC: 'Mountain West', A10: 'A-10' };

  // NBA teams: display name, abbreviation, the file in nbalogos/, and
  // other ways the sheet might spell them.
  const NBA_TEAMS = [
    ['Atlanta Hawks', 'ATL', 'Atlanta Hawks', 'hawks atlanta'],
    ['Boston Celtics', 'BOS', 'Boston Celtics', 'celtics boston'],
    ['Brooklyn Nets', 'BKN', 'Brooklyn Nets', 'nets brooklyn bkn brk'],
    ['Charlotte Hornets', 'CHA', 'Charlotte Hornets', 'hornets charlotte cha cho'],
    ['Chicago Bulls', 'CHI', 'Chicago Bulls', 'bulls chicago'],
    ['Cleveland Cavaliers', 'CLE', 'Cleveland Cavaliers', 'cavaliers cavs cleveland'],
    ['Dallas Mavericks', 'DAL', 'Dallas Mavericks', 'mavericks mavs dallas'],
    ['Denver Nuggets', 'DEN', 'Denver Nuggets', 'nuggets denver'],
    ['Detroit Pistons', 'DET', 'Detroit Pistons', 'pistons detroit'],
    ['Golden State Warriors', 'GSW', 'Golden State Warriors', 'warriors goldenstate gs gsw'],
    ['Houston Rockets', 'HOU', 'Houston Rockets', 'rockets houston'],
    ['Indiana Pacers', 'IND', 'Indiana Pacers', 'pacers indiana'],
    ['Los Angeles Clippers', 'LAC', 'Los Angeles Clippers', 'clippers laclippers lac'],
    ['Los Angeles Lakers', 'LAL', 'Los Angeles Lakers', 'lakers lalakers lal'],
    ['Memphis Grizzlies', 'MEM', 'Memphis Grizzlies', 'grizzlies grizz memphis'],
    ['Miami Heat', 'MIA', 'Miami Heat', 'heat miami'],
    ['Milwaukee Bucks', 'MIL', 'Milwaukee Bucks', 'bucks milwaukee'],
    ['Minnesota Timberwolves', 'MIN', 'Minnesota Timberwolves', 'timberwolves wolves minnesota'],
    ['New Orleans Pelicans', 'NOP', 'New Orleans Pelicans', 'pelicans neworleans nop no'],
    ['New York Knicks', 'NYK', 'New York Knicks', 'knicks newyork nyk ny'],
    ['Oklahoma City Thunder', 'OKC', 'OKC Thunder', 'thunder okc oklahomacity'],
    ['Orlando Magic', 'ORL', 'Orlando Magic', 'magic orlando'],
    ['Philadelphia 76ers', 'PHI', 'Philadelphia 76ers', '76ers sixers philadelphia philly'],
    ['Phoenix Suns', 'PHX', 'Phoenix Suns', 'suns phoenix phx pho'],
    ['Portland Trail Blazers', 'POR', 'Portland Trailblazers', 'trailblazers blazers portland'],
    ['Sacramento Kings', 'SAC', 'Sacramento Kings', 'kings sacramento'],
    ['San Antonio Spurs', 'SAS', 'San Antonio Spurs', 'spurs sanantonio sas sa'],
    ['Toronto Raptors', 'TOR', 'Toronto Raptors', 'raptors toronto'],
    ['Utah Jazz', 'UTA', 'Utah Jazz', 'jazz utah uta utah'],
    ['Washington Wizards', 'WAS', 'Washington Wizards', 'wizards washington was wsh']
  ].map(([name, abbr, logo, alts]) => ({ name, abbr, logo, keys: [name, abbr, logo, ...alts.split(' ')].map(k => k.toLowerCase().replace(/[^a-z0-9]/g, '')) }));

  function nbaTeam(raw) {
    const k = clean(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!k) return null;
    return NBA_TEAMS.find(t => t.keys.includes(k)) || { name: clean(raw), abbr: clean(raw), logo: null };
  }

  // Stat groups as they're shown on a profile. Keys are the sheet headers;
  // "3P&" is the sheet's spelling of 3P%.
  const STAT_GROUPS = [
    { title: 'Playing time', stats: [['G', 'G'], ['MP', 'MP']] },
    { title: 'Per game', stats: [['PTS', 'PTS'], ['REB', 'REB'], ['AST', 'AST'], ['STL', 'STL'], ['BLK', 'BLK']] },
    { title: 'Shooting', stats: [['TS%', 'TS%'], ['eFG%', 'eFG%'], ['2P%', '2P%'], ['3P%', '3P%'], ['FT%', 'FT%'], ['3Pr', '3PAr'], ['FTr', 'FTr']] },
    { title: 'Impact', stats: [['USG%', 'USG%'], ['BPM', 'BPM'], ['OBPM', 'OBPM'], ['DBPM', 'DBPM']] }
  ];

  const clean = v => String(v == null ? '' : v).trim();
  const isNumber = v => /^-?\d+(\.\d+)?%?$/.test(clean(v));

  function displaySchool(raw) {
    const s = clean(raw);
    if (!s) return '';
    const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SCHOOL_NAMES[key] && (s === s.toLowerCase() || s.length <= 5)) return SCHOOL_NAMES[key];
    if (s === s.toLowerCase()) return s.replace(/\b\w/g, c => c.toUpperCase());
    return s;
  }

  function normClass(v) {
    const s = clean(v).toLowerCase();
    if (/intl|international|^int$/.test(s)) return 'INTL';
    if (/5th|fifth|super|grad/.test(s)) return 'SR';
    if (/^fr|fresh/.test(s)) return 'FR';
    if (/^so|soph/.test(s)) return 'SO';
    if (/^jr|junior/.test(s)) return 'JR';
    if (/^sr|senior/.test(s)) return 'SR';
    return clean(v).toUpperCase();
  }

  function ageOn(dob, onDate) {
    const d = new Date(clean(dob));
    if (!clean(dob) || isNaN(d)) return null;
    return (new Date(onDate) - d) / (365.25 * 24 * 3600 * 1000);
  }

  function slug(name) {
    return clean(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const list = v => clean(v).split(/\s*(?:;|\n)\s*/).map(x => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

  // Where a prospect on a past board actually went.
  function draftResult(pickRaw, teamRaw, yearRaw, boardYear) {
    const pickText = clean(pickRaw), teamText = clean(teamRaw);
    if (!pickText && !teamText) return null;
    const year = parseInt(yearRaw, 10) || boardYear;
    const team = nbaTeam(teamText);
    const n = parseInt(pickText.replace(/^#/, ''), 10);
    if (!isNaN(n) && /^#?\d+$/.test(pickText)) return { pick: n, round: n <= 30 ? 1 : 2, team, year };
    let status = pickText;
    if (/undraft|udfa|^ud$/i.test(pickText)) status = 'Undrafted';
    else if (/return|stay|withdr|back to school/i.test(pickText)) status = 'Returned to school';
    return { pick: null, status: status || 'Drafted', team, year };
  }

  function normalize(row, boardYear = BOARD.draftYear) {
    const get = (...keys) => {
      for (const k of keys) {
        const hit = Object.keys(row).find(h => h.trim().toLowerCase() === k.toLowerCase());
        if (hit && clean(row[hit]) !== '') return clean(row[hit]);
      }
      return '';
    };

    // Stats: only real numbers count. A column full of one conference
    // tag is how the sheet currently marks "no stats yet" — keep the tag.
    const stats = {};
    let conference = '';
    STAT_GROUPS.forEach(g => g.stats.forEach(([key]) => {
      const raw = key === '3P%' ? get('3P%', '3P&', '3P')
        : key === 'G' ? get('G', 'GP', 'Games')
        : key === 'MP' ? get('MP', 'MPG', 'MIN', 'Minutes')
        : get(key);
      if (isNumber(raw)) stats[key] = raw;
      else if (CONFERENCES.has(raw)) conference = raw;
    }));

    const name = get('name', 'prospect', 'player');
    const rank = parseInt(get('pick', 'rank', 'ranking', '#'), 10);
    const tierRaw = get('tier');
    const tierNum = parseInt(tierRaw, 10);
    const school = displaySchool(get('school', 'school/team', 'team', 'college'));
    const isPro = /^pro$/i.test(school);
    const draftDate = boardYear === BOARD.draftYear ? BOARD.draftDate : `${boardYear}-06-25`;

    return {
      id: slug(name),
      name,
      boardYear,
      rank: isNaN(rank) ? null : rank,
      tier: isNaN(tierNum) ? (tierRaw || null) : tierNum,
      archetype: get('archetype', 'style'),
      pos: get('position', 'pos').toUpperCase(),
      cls: normClass(get('class', 'year')),
      height: get('height', 'ht'),
      weight: get('weight', 'wt').replace(/\s*lbs?$/i, '') ,
      dob: get('dob', 'date of birth', 'birthdate'),
      age: ageOn(get('dob', 'date of birth', 'birthdate'), draftDate),
      school: isPro ? 'Pro' : school,
      isPro,
      conference: CONF_LABEL[conference] || conference,
      image: get('espn image url', 'image', 'headshot', 'photo'),
      scouting: get('scouting report', 'scouting', 'report'),
      prevRank: (n => (isNaN(n) ? null : n))(parseInt(get('prev rank', 'previous rank', 'last rank', 'prev'), 10)),
      wingspan: get('wingspan', 'wing'),
      comp: get('comparison', 'comp', 'player comp'),
      strengths: list(get('strengths', 'strength')),
      weaknesses: list(get('weaknesses', 'weakness')),
      films: filmList(get('film', 'highlights', 'video')),
      get film() { return this.films.length ? this.films[0].url : ''; },
      statsLink: /^https?:\/\//i.test(get('stats link', 'realgm', 'stats url')) ? get('stats link', 'realgm', 'stats url') : '',
      draft: draftResult(get('draft pick', 'actual pick', 'nba pick', 'drafted'), get('draft team', 'nba team', 'drafted by'), get('draft year'), boardYear),
      sheetStats: stats,
      seasons: []   // filled in by loadBoard()
    };
  }

  // The Film cell: every web address in it, in order. YouTube ones get the
  // video id (and start time) so the profile can play them in place.
  function filmList(raw) {
    const seen = new Set();
    return (String(raw || '').match(/https?:\/\/[^\s"'<>|;]+/gi) || [])
      .map(u => u.replace(/[),.]+$/, ''))
      .filter(u => !seen.has(u) && seen.add(u))
      .map(u => {
        const m = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*?&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i);
        if (!m) return { url: u, yt: '' };
        const t = (u.match(/[?&#](?:t|start)=([\dhms]+)/i) || [])[1] || '';
        const start = /^\d+$/.test(t) ? +t
          : (t.match(/(\d+)h/) || [0, 0])[1] * 3600 + (t.match(/(\d+)m/) || [0, 0])[1] * 60 + +(t.match(/(\d+)s/) || [0, 0])[1];
        // An embed or nocookie address isn't a page anyone can open; link
        // to the normal watch page instead.
        const url = 'https://www.youtube.com/watch?v=' + m[1] + (start ? '&t=' + start + 's' : '');
        return { url, yt: m[1], start };
      });
  }

  // Newest season first. On the current board the sheet's own numbers
  // stand in for this season (that's how pro stats get in) and Barttorvik
  // covers college, this season and last. A past board shows the season
  // that led into that draft; an early look at a later one shows this
  // season and last, like the featured board.
  function attachSeasons(p, college, boardYear = BOARD.draftYear) {
    const seasons = [];
    const auto = label => {
      const line = (college && college.seasons && college.seasons[label] || {})[p.id];
      if (!line) return null;
      const extra = {};
      if (line.gp != null) extra.G = String(line.gp);
      if (line.mpg != null) extra.MP = String(line.mpg);
      return { ...line, stats: { ...extra, ...line.stats } };
    };
    // An early look at a later draft shows the same seasons as the featured
    // board: those players haven't played the season before their draft yet.
    const current = boardYear >= BOARD.draftYear;
    const label = current ? CURRENT_SEASON : seasonLabel(boardYear);
    if (Object.keys(p.sheetStats).length) {
      seasons.push({ label, team: p.isPro ? 'Pro' : p.school, stats: p.sheetStats, source: 'sheet' });
    } else if (auto(label)) {
      seasons.push({ label, source: 'barttorvik', ...auto(label) });
    }
    if (current && auto(LAST_SEASON)) seasons.push({ label: LAST_SEASON, source: 'barttorvik', ...auto(LAST_SEASON) });
    // Pros and G League players linked to a Basketball-Reference page: every
    // season up to this board's draft, one row per competition. A season
    // typed into the sheet wins over the page's line for that season.
    const pro = college && college.pro && college.pro[p.id];
    if (pro) {
      const typed = new Set(seasons.filter(s => s.source === 'sheet').map(s => s.label));
      pro.seasons.forEach((s, i) => {
        if (s.label <= label && !typed.has(s.label)) seasons.push({ ...s, source: 'bbref', url: pro.url, order: i });
      });
    }
    // Newest first; rows from the same season keep the page's order once
    // the table flips them back to oldest first.
    seasons.sort((a, b) => b.label.localeCompare(a.label) || (b.order || 0) - (a.order || 0));
    p.seasons = seasons;
    p.stats = seasons.length ? seasons[0].stats : {};
    p.hasStats = seasons.length > 0;
  }

  // ------------------------------------------------------------ boards
  // The published sheet's HTML page lists every tab with its id, which is
  // how tabs like "2025 Board" are found without any setup.
  let boardsPromise = null;
  function listBoards() {
    if (boardsPromise) return boardsPromise;
    boardsPromise = (async () => {
      const boards = [{ year: BOARD.draftYear, name: `${BOARD.draftYear} Board`, url: BOARD.sheet, current: true }];
      try {
        const res = await fetch(`${PUB_BASE}/pubhtml`);
        if (res.ok) boards.push(...parseTabs(await res.text()).filter(t => t.year !== BOARD.draftYear));
      } catch (e) { /* only the current board, then */ }
      const seen = new Set();
      return boards.filter(b => !seen.has(b.year) && seen.add(b.year)).sort((a, b) => b.year - a.year);
    })();
    return boardsPromise;
  }

  function parseTabs(html) {
    const tabs = [];
    const re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)",[^}]*?gid: "(-?\d+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const name = m[1].replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1');
      const year = (name.match(/\b(?:19|20)\d{2}\b/) || [])[0];
      if (!year || !/board/i.test(name)) continue;
      tabs.push({ year: +year, name, url: `${PUB_BASE}/pub?gid=${m[2]}&single=true&output=csv` });
    }
    return tabs;
  }

  let statsPromise = null;
  const loadStats = () => statsPromise || (statsPromise =
    // Stats are a bonus: if the file is missing the board still loads.
    fetch(BOARD.stats).then(r => (r.ok ? r.json() : null)).catch(() => null));

  const cache = {};
  function loadBoard(year = BOARD.draftYear) {
    if (cache[year]) return cache[year];
    cache[year] = (async () => {
      let url = BOARD.sheet;
      if (year !== BOARD.draftYear) {
        const b = (await listBoards()).find(x => x.year === year);
        if (!b) throw new Error(`No ${year} board in the sheet`);
        url = b.url;
      }
      const [res, college] = await Promise.all([fetch(url), loadStats()]);
      if (college && window.BOARD) window.BOARD.statsAsOf = college.torvikUpdated || college.updated || null;
      if (!res.ok) throw new Error('Board sheet returned HTTP ' + res.status);
      const rows = BTR.parseCSV(await res.text()).map(r => normalize(r, year)).filter(p => p.name);
      rows.forEach(p => attachSeasons(p, college, year));
      // Ranked prospects in board order; everyone else follows by tier.
      const tierSort = t => (typeof t === 'number' ? t : 99);
      rows.sort((a, b) => {
        if (a.rank != null && b.rank != null) return a.rank - b.rank;
        if (a.rank != null) return -1;
        if (b.rank != null) return 1;
        return tierSort(a.tier) - tierSort(b.tier) || a.name.localeCompare(b.name);
      });
      return rows;
    })();
    cache[year].catch(() => { delete cache[year]; });
    return cache[year];
  }

  // Past-board tabs that are still a copy of the current board (same
  // prospects in the same order) haven't been filled in yet, so they're
  // left off the year switcher until they are.
  const signature = rows => rows.slice(0, 15).map(p => p.id).join('|');
  let filledPromise = null;
  function listFilledBoards() {
    if (filledPromise) return filledPromise;
    filledPromise = (async () => {
      const boards = await listBoards();
      const current = signature(await loadBoard());
      const checked = await Promise.all(boards.map(b => b.current ? b
        : loadBoard(b.year).then(rows => (rows.length && signature(rows) !== current ? b : null)).catch(() => null)));
      return checked.filter(Boolean);
    })();
    filledPromise.catch(() => { filledPromise = null; });
    return filledPromise;
  }

  // Colour for age on draft night: youngest green, oldest red.
  function ageHue(age) {
    if (age == null) return null;
    const t = Math.max(0, Math.min(1, (age - 18.5) / 4));
    return Math.round(130 * (1 - t));
  }

  const tierName = t => TIERS[t] || '';

  window.BOARD = {
    ...BOARD, STAT_GROUPS, TIERS, CURRENT_SEASON, LAST_SEASON,
    loadBoard, listBoards, listFilledBoards, parseTabs, normalize, attachSeasons, ageHue, slug, seasonLabel, tierName, nbaTeam
  };
})();
