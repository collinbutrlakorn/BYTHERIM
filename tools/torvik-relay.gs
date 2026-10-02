/**
 * BYTHERIM — Barttorvik relay for the big board sheet.
 *
 * Barttorvik refuses GitHub's servers, so the daily stats job can't read
 * it directly. This script runs inside the big board Google Sheet, on
 * Google's servers: once a day it copies Barttorvik's free player file
 * into tabs named "Torvik 2027", "Torvik 2026", … and logs each read in a
 * "Torvik status" tab. The daily job reads those tabs whenever Barttorvik
 * turns it away (tools/update-stats.mjs).
 *
 * Setup (once):
 *   1. Open the big board sheet → Extensions → Apps Script.
 *   2. Replace what's there with this file, and Save.
 *   3. Pick "setUp" in the function menu at the top and press Run. Allow
 *      it when Google asks (it needs to read barttorvik.com and edit this
 *      sheet). It reads Barttorvik now and then every morning.
 *   4. The sheet must be published to the web as the entire document
 *      (File → Share → Publish to web), as it already is for the site, so
 *      the new tabs are published too.
 *
 * If the "Torvik status" tab shows 403 for every season, Barttorvik is
 * refusing Google's servers as well; use the one-click updaters in tools/
 * from your own computer instead.
 *
 * Barttorvik's robots.txt asks for 10 seconds between requests; this
 * makes at most five reads a day, spaced 10 seconds apart.
 */

var SEASONS_BACK = 4;          // past seasons kept (for past boards), besides this one
var DELAY_MS = 10000;          // between requests, per Barttorvik's robots.txt

// The season Barttorvik is on, named by the year it ends (2026-27 = 2027).
function currentSeason_() {
  var d = new Date();
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();   // from October
}

function refreshTorvik() {
  var ss = SpreadsheetApp.getActive();
  var now = currentSeason_();
  var log = [];
  var first = true;
  for (var year = now; year >= now - SEASONS_BACK; year--) {
    var name = 'Torvik ' + year;
    var sheet = ss.getSheetByName(name);
    // Finished seasons don't change: read them once. This season and last
    // are read every day.
    if (sheet && sheet.getLastRow() > 0 && year < now - 1) { log.push([year, '', 'kept']); continue; }
    if (!first) Utilities.sleep(DELAY_MS);
    first = false;
    var url = 'https://barttorvik.com/getadvstats.php?year=' + year + '&csv=1';
    var res, code, text;
    try {
      res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'BYTHERIM big board relay (github.com/collinbutrlakorn/BYTHERIM)' } });
      code = res.getResponseCode();
      text = res.getContentText();
    } catch (e) { log.push([year, new Date().toISOString(), 'error: ' + e.message]); continue; }
    if (code !== 200 || /^\s*</.test(text)) { log.push([year, new Date().toISOString(), code === 200 ? 'web page, not the file' : code]); continue; }
    var rows = Utilities.parseCsv(text);
    if (!rows.length) { log.push([year, new Date().toISOString(), 'empty']); continue; }
    var width = rows.reduce(function (w, r) { return Math.max(w, r.length); }, 0);
    rows = rows.map(function (r) { while (r.length < width) r.push(''); return r; });
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.clearContents();
    if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
    if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
    var range = sheet.getRange(1, 1, rows.length, width);
    range.setNumberFormat('@');        // keep everything as Barttorvik wrote it (birthdays, decimals)
    range.setValues(rows);
    log.push([year, new Date().toISOString(), 200]);
  }
  var status = ss.getSheetByName('Torvik status') || ss.insertSheet('Torvik status');
  status.clearContents();
  status.getRange(1, 1, log.length, 3).setNumberFormat('@').setValues(log.map(function (r) { return [String(r[0]), String(r[1]), String(r[2])]; }));
}

// Run once: reads Barttorvik now, and every morning from here on.
function setUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshTorvik') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshTorvik').timeBased().everyDays(1).atHour(6).create();
  refreshTorvik();
}
