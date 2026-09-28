// ============================================================
// The roster sheet: one published Google Sheet with a tab per season
// ("2028-29", "2029-30", ...) plus the Coaches tab.
//
// Each season tab lists the players the sheet wants a say over that
// season. Every row is tagged with its season so the engine can tell the
// first season (loaded at the start of a new game) from later ones
// (applied as each offseason ends). A season tab only needs the players
// it changes; anyone left off is carried forward by the simulation.
//
// Tab names: "2028-29" (or "2028-2029") is the 2028-29 season. A bare
// "2028" is read the same way, as the season that starts that year.
// Before any season tabs exist, the first tab ("Data") is the first
// season. Rows are tagged with `season` = the year the season ENDS,
// the convention the rest of the engine uses (2028-29 -> 2029).
// ============================================================

(function (root) {
  const BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_KgPla_wVF3w_s8PGVIreieVKkfOuVuFqt1K25i3gHNa_NpL6MDPST1qnIw12V61COFsSkf2C03Q-';
  const FIRST_TAB = { name: 'Data', gid: '0' };

  const csvUrl = gid => `${BASE}/pub?gid=${gid}&single=true&output=csv`;

  async function get(url, attempts = 2) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url);
        if (res && res.ok) return await res.text();
      } catch (e) { /* retry */ }
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 400));
    }
    return null;
  }

  // "2028-29" / "2028-2029" / "2028–29" / "2028" -> 2028 (the year it starts).
  function seasonStart(name) {
    const m = String(name || '').trim().match(/^(20\d{2})(?:\s*[-–\/]\s*(\d{2}|\d{4}))?$/);
    return m ? parseInt(m[1], 10) : null;
  }

  function parseTabs(html) {
    const parse = root.RecruitSheet && root.RecruitSheet.parseTabs;
    return parse ? parse(html) : [];
  }

  // Which tabs to read: every season tab, or the first tab alone if there
  // are none yet.
  function seasonTabs(tabs) {
    const seasons = tabs.filter(t => seasonStart(t.name) !== null)
      .map(t => ({ ...t, start: seasonStart(t.name) }))
      .sort((a, b) => a.start - b.start);
    if (seasons.length) return seasons;
    const first = tabs.find(t => t.gid === '0') || FIRST_TAB;
    return [{ ...first, start: null }];
  }

  // parse: CSV text -> array of row objects.
  // Resolves { rows, tabs, failed, byTab } — rows from every season tab,
  // each tagged with row.__tab and (for season tabs) row.season.
  async function load(parse) {
    const html = await get(`${BASE}/pubhtml`, 1);
    const tabs = seasonTabs(parseTabs(html));
    const texts = await Promise.all(tabs.map(t => get(csvUrl(t.gid))));
    const rows = [], failed = [];
    tabs.forEach((tab, k) => {
      if (texts[k] == null) { failed.push(tab.name); return; }
      (parse(texts[k]) || []).forEach(row => {
        row.__tab = tab.name;
        // A tab's own season wins over any Year column left in the rows.
        if (tab.start !== null) row.season = String(tab.start + 1);
        rows.push(row);
      });
    });
    return { rows, tabs, failed };
  }

  root.RosterSheet = { BASE, csvUrl, seasonStart, seasonTabs, load };
})(typeof window !== 'undefined' ? window : globalThis);
