// ============================================================
// The recruiting database: one published Google Sheet with a tab per
// recruiting class (2028, 2029, ...) plus an "Others" tab for players
// rostered before the 2028 class.
//
// Shared by the NCAA RP and the Recruiting page. The tab list is read
// from the published sheet itself, so adding a new class tab needs no
// code change: publish the whole document and the new tab is picked up.
// If the tab list can't be read, the tabs known when this was written
// are used instead.
// ============================================================

(function (root) {
  const BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWvXoqFJkVFqt36wbBBfgFYUvPKhWCZIztoLIB9sjpc55AiFTdFpJZHMztVgJHyFyy0mtO_MYGD76N';

  const KNOWN_TABS = [
    ['2028', '0'], ['2029', '1295835952'], ['2030', '2044749751'], ['2031', '1125619172'],
    ['2032', '1772086833'], ['2033', '606758995'], ['2034', '1016432871'], ['2035', '2015163443'],
    ['2036', '1185505743'], ['2037', '1119772074'], ['2038', '1949407055'], ['2039', '1387628107'],
    ['2040', '1319673277'], ['2041', '1840881860'], ['Others', '1094147470']
  ].map(([name, gid]) => ({ name, gid }));

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

  // The published page lists every tab as {name: "2029", pageUrl: "...gid=..."}.
  function parseTabs(html) {
    const tabs = [], seen = new Set();
    const re = /name:\s*"([^"]+)"[^}]{0,400}?gid[^0-9]{1,8}(\d+)/g;
    let m;
    while ((m = re.exec(html || ''))) {
      if (seen.has(m[2])) continue;
      seen.add(m[2]);
      tabs.push({ name: m[1], gid: m[2] });
    }
    return tabs;
  }

  async function tabs() {
    const html = await get(`${BASE}/pubhtml`, 1);
    const found = parseTabs(html);
    return found.length ? found : KNOWN_TABS;
  }

  // parse: CSV text -> array of row objects.
  // opts.yearKey / opts.nameKey: the row keys that parser produces for
  // the classYear and name columns.
  // Resolves { rows, tabs, failed } — rows from every tab, each tagged
  // with row.__tab. A class tab fills in a missing classYear from its
  // name. A player on both a class tab and "Others" keeps the class row.
  async function load(parse, opts = {}) {
    const yearKey = opts.yearKey || 'classYear', nameKey = opts.nameKey || 'name';
    // Which classes an admin has reset (opts.resets, else the site's
    // setting), read alongside the tabs.
    const resetsP = opts.resets ? Promise.resolve(opts.resets)
      : root.Cloud && root.Cloud.recruitGen ? root.Cloud.recruitGen().catch(() => ({})) : Promise.resolve({});
    const list = await tabs();
    const texts = new Array(list.length);
    // A few at a time: firing every tab at once can get requests throttled.
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const k = next++;
        texts[k] = await get(csvUrl(list[k].gid));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);

    const byKey = new Map();
    const failed = [];
    list.forEach((tab, k) => {
      if (texts[k] == null) { failed.push(tab.name); return; }
      const isClass = /^\d{4}$/.test(tab.name);
      (parse(texts[k]) || []).forEach(row => {
        const name = String(row[nameKey] || '').trim();
        if (!name) return;
        if (isClass && !String(row[yearKey] || '').trim()) row[yearKey] = tab.name;
        row.__tab = tab.name;
        const key = name.toLowerCase() + '|' + String(row[yearKey] || '').trim();
        const had = byKey.get(key);
        if (had && (had.__tab !== 'Others' || !isClass)) return;
        byKey.set(key, row);
      });
    });
    let rows = [...byKey.values()];
    // Every class filled out to a top 250 with generated prospects (see
    // recruit-gen.js), unless the caller asks for the sheet alone.
    if (root.RecruitGen && opts.generate !== false) {
      const keys = opts.keys || (yearKey === yearKey.toLowerCase() ? 'lower' : 'camel');
      const classes = list.filter((t, k) => /^\d{4}$/.test(t.name) && texts[k] != null).map(t => t.name);
      if (root.RecruitGen.setResets) root.RecruitGen.setResets(await resetsP);
      rows = root.RecruitGen.augment(rows, { keys, classes });
    }
    return { rows, tabs: list, failed };
  }

  root.RecruitSheet = { BASE, KNOWN_TABS, csvUrl, parseTabs, tabs, load };
})(typeof window !== 'undefined' ? window : globalThis);
