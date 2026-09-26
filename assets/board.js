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
   Requires site.js (BTR.parseCSV).
   ============================================================ */
(function () {
  'use strict';

  const BOARD = {
    sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjSzV7c31_8uY69vD-UzxT_rqX_mqjOxECd0aFr-gien0cULby0kLa8iV3ISnuskTr7u2AevhwB7ZN/pub?output=csv',
    draftYear: 2027,
    draftDate: '2027-06-24'   // used for age on draft night
  };

  const SCHOOL_NAMES = {
    gtech: 'Georgia Tech', ohiostate: 'Ohio State', unc: 'North Carolina', stjohns: "St. John's",
    usc: 'USC', byu: 'BYU', ucla: 'UCLA', lsu: 'LSU', tcu: 'TCU', smu: 'SMU', vcu: 'VCU', unlv: 'UNLV', ucf: 'UCF'
  };
  const CONFERENCES = new Set(['ACC', 'B10', 'B12', 'BE', 'SEC', 'P12', 'WCC', 'MWC', 'A10', 'AAC', 'BSky', 'MVC', 'CUSA', 'SBC', 'MAC', 'WAC', 'CAA', 'Ivy']);
  const CONF_LABEL = { B10: 'Big Ten', B12: 'Big 12', BE: 'Big East', P12: 'Pac-12', BSky: 'Big Sky', MWC: 'Mountain West', A10: 'A-10' };

  // Stat groups as they're shown on a profile. Keys are the sheet headers;
  // "3P&" is the sheet's spelling of 3P%.
  const STAT_GROUPS = [
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

  function normalize(row) {
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
      const raw = key === '3P%' ? get('3P%', '3P&', '3P') : get(key);
      if (isNumber(raw)) stats[key] = raw;
      else if (CONFERENCES.has(raw)) conference = raw;
    }));

    const name = get('name', 'prospect', 'player');
    const rank = parseInt(get('pick', 'rank', 'ranking', '#'), 10);
    const tierRaw = get('tier');
    const tierNum = parseInt(tierRaw, 10);
    const school = displaySchool(get('school', 'school/team', 'team', 'college'));
    const isPro = /^pro$/i.test(school);

    return {
      id: slug(name),
      name,
      rank: isNaN(rank) ? null : rank,
      tier: isNaN(tierNum) ? (tierRaw || null) : tierNum,
      archetype: get('archetype', 'style'),
      pos: get('position', 'pos').toUpperCase(),
      cls: normClass(get('class', 'year')),
      height: get('height', 'ht'),
      weight: get('weight', 'wt').replace(/\s*lbs?$/i, '') ,
      dob: get('dob', 'date of birth', 'birthdate'),
      age: ageOn(get('dob', 'date of birth', 'birthdate'), BOARD.draftDate),
      school: isPro ? 'Pro' : school,
      isPro,
      conference: CONF_LABEL[conference] || conference,
      image: get('espn image url', 'image', 'headshot', 'photo'),
      scouting: get('scouting report', 'scouting', 'report'),
      stats,
      hasStats: Object.keys(stats).length > 0
    };
  }

  let cache = null;
  async function loadBoard() {
    if (cache) return cache;
    const res = await fetch(BOARD.sheet);
    if (!res.ok) throw new Error('Board sheet returned HTTP ' + res.status);
    const rows = BTR.parseCSV(await res.text()).map(normalize).filter(p => p.name);
    // Ranked prospects in board order; everyone else follows by tier.
    const tierSort = t => (typeof t === 'number' ? t : 99);
    rows.sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      if (a.rank != null) return -1;
      if (b.rank != null) return 1;
      return tierSort(a.tier) - tierSort(b.tier) || a.name.localeCompare(b.name);
    });
    cache = rows;
    return rows;
  }

  // Colour for age on draft night: youngest green, oldest red.
  function ageHue(age) {
    if (age == null) return null;
    const t = Math.max(0, Math.min(1, (age - 18.5) / 4));
    return Math.round(130 * (1 - t));
  }

  window.BOARD = { ...BOARD, STAT_GROUPS, loadBoard, normalize, ageHue, slug };
})();
