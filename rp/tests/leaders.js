// Stat leaders: a stat a player leads his conference in is bold, one he leads
// the NCAA in is bold italics, on player profiles and team pages in the NCAA
// RP, the Draft RP prospect profile and the Recruiting profile; AAU and FIBA
// leaders are bold on a prospect's circuit lines. Also: a team clicked on the
// Standings tab opens its team page, not the card.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const Papa = require('papaparse');
const { boot, playSeason, playOffseason, ok } = require('./harness');
const FIX = path.join(__dirname, 'fixtures');
const ROOT = path.join(__dirname, '..', '..');

global.RosterGen = require('../js/roster-gen.js');
require('../js/recruit-gen.js');
const LC = require('../js/leaders-core.js');
const SC = require('../js/summer-core.js');

const tick = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  // ---- The rules, on made-up rows ----
  {
    const st = (o = {}) => ({ gp: 30, mpg: '30.0', totMin: 900, ppg: '10.0', rpg: '5.0', fga: '8.0', fgPct: '.450', threePa: '4.0', threePPct: '.350', fta: '4.0', ftPct: '.750', blk: '0.0', tov: '9.0', drtg: '100.0', bpm: '1.0', ...o });
    const rows = [
      { id: 'a', conf: 'X', stats: st({ ppg: '22.0', rpg: '4.0' }) },                      // leads the NCAA in points
      { id: 'b', conf: 'X', stats: st({ ppg: '15.0', rpg: '9.0' }) },                      // leads X in rebounds... but not the NCAA
      { id: 'c', conf: 'Y', stats: st({ ppg: '18.0', rpg: '12.0' }) },                     // leads Y in points, the NCAA in rebounds
      { id: 'd', conf: 'Y', stats: st({ ppg: '30.0', mpg: '4.0', totMin: 40, fgPct: '1.000' }) },   // few minutes: never a leader
      { id: 'e', conf: 'Y', stats: st({ fta: '1.0', ftPct: '1.000' }) },                   // 1 FTA a game: not the FT% leader
      { id: 'f', conf: 'Y', stats: st({ ppg: '18.0', drtg: '88.0' }) },                    // ties c for Y's points; the lowest DRtg leads
      { id: 'g', conf: 'X', stats: st({ drtg: '95.0', blk: '0.0' }) },
      { id: 'h', conf: 'X', stats: st({ ftPct: '.900' }) }
    ];
    const m = LC.compute(rows);
    ok(m.get('a').ppg === 'n' && m.get('c').rpg === 'n', 'the NCAA leader in a stat is marked n');
    ok(m.get('b').rpg === 'c' && !m.get('b').ppg, 'a conference leader who isn\'t the NCAA leader is marked c');
    ok(m.get('c').ppg === 'c' && m.get('f').ppg === 'c', 'a tie for the lead is a shared lead');
    ok(!m.has('d'), 'a player with a handful of minutes leads nothing, whatever his percentages');
    ok(!(m.get('e') && m.get('e').ftPct) && m.get('h').ftPct === 'n', 'a free-throw percentage needs free-throw attempts');
    ok(m.get('f').drtg === 'n' && m.get('g').drtg === 'c', 'for defensive rating, lower leads');
    ok(!rows.some(r => (m.get(r.id) || {}).blk), 'nobody leads in zero blocks');
    ok(!rows.some(r => ['tov', 'gp', 'mpg', 'fga', 'pf', 'usg', 'tovPct'].some(k => (m.get(r.id) || {})[k])), 'turnovers, games, minutes, attempts and usage are never marked');
    ok(LC.mark('1.0', 'n') === '<b class="lead-n"><i title="Leads the NCAA">1.0</i></b>' && /^<b class="lead-c"[^>]*>1\.0<\/b>$/.test(LC.mark('1.0', 'c')) && LC.mark('1.0', '') === '1.0', 'bold italics for the NCAA, bold for the conference');
    ok(/Bold<\/b> leads the conference/.test(LC.legend()) && /Bold italics<\/i><\/b> leads the NCAA/.test(LC.legend()), 'the note says what bold and bold italics mean');
    // Early in the season (few games played) the bar scales down.
    const early = LC.compute([{ id: 'z', conf: 'X', stats: { gp: 3, mpg: '28.0', totMin: 84, ppg: '20.0' } }, { id: 'y', conf: 'X', stats: { gp: 3, mpg: '25.0', totMin: 75, ppg: '9.0' } }]);
    ok(early.get('z') && early.get('z').ppg === 'n', 'a week-three leader can already be marked');
  }

  // ---- In the NCAA RP ----
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const { Sim, window: w } = boot({ roster, recruits });
  const d = w.document;
  await Sim.init();
  await Sim.startNewGame();
  w.scrollTo = () => {};
  const S = Sim.state;
  ok(typeof w.LeadersCore === 'object' && /leaders-core\.js/.test(fs.readFileSync(path.join(ROOT, 'rp/ncaa.html'), 'utf8')), 'the NCAA RP loads the leaders module');

  // ---- AAU and FIBA leaders, on the opening summer ----
  {
    const lines = tier => S.allRecruits.filter(r => r.summer && r.summer[tier]).map(r => ({ r, l: r.summer[tier] }));
    const checkTier = (tier, minGp) => {
      const all = lines(tier);
      const led = all.filter(x => (x.l.lead || []).length);
      ok(led.length > 0, `${tier}: some players led something (${led.length})`);
      // Who qualifies: a few games, real minutes, and for a shooting percentage real attempts.
      const gates = { fg: l => l.fga2 + l.fga3 >= 5, fg3: l => l.fga3 >= 2.5, ft: l => l.fta >= 2.5 };
      const elig = k => all.filter(x => x.l.gp >= minGp && x.l.mpg >= 10 && (!gates[k] || gates[k](x.l)));
      let bad = 0;
      led.forEach(x => (x.l.lead || []).forEach(k => {
        const v = parseFloat(x.l[k]);
        if (!(x.l.gp >= minGp) || !elig(k).some(o => o === x) || elig(k).some(o => parseFloat(o.l[k]) > v + 1e-9)) bad++;
      }));
      ok(bad === 0, `${tier}: every marked stat is the best on the board among those who qualify`);
      ok(led.every(x => (x.l.lead || []).every(k => ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'fg', 'fg3', 'ft', 'bpm'].includes(k))), `${tier}: only real accomplishments are marked`);
      return led;
    };
    const aauLed = checkTier('aau', 3);
    const fibaLed = checkTier('fiba', 2);
    const ppgLeaders = lines('aau').filter(x => (x.l.lead || []).includes('ppg'));
    ok(ppgLeaders.length >= 1 && ppgLeaders.length <= 3, `AAU: one scoring leader across all the circuits (${ppgLeaders.length})`);
    const lead = aauLed[0].r;
    ok(/<b class="lead-c"/.test(Sim.summerCardHTML(lead)) && /led all AAU circuits/.test(Sim.summerCardHTML(lead)), 'the recruit card in the NCAA RP shows AAU leaders in bold, with a note');
    ok(lines('aau').every(x => !x.r.summer.aau.lead || Array.isArray(x.r.summer.aau.lead)), 'a leader list is a plain list of fields (it saves with the recruit)');
  }

  // ---- A season: team pages and profiles ----
  await playSeason(Sim);
  const year = S.year;
  const marks = Sim.leadersFor(year);
  ok(marks.size > 100, `leaders are worked out for the whole field (${marks.size} players lead something)`);
  const poolRows = S.activePlayers.map(p => ({ id: p.id, conf: p.conference, stats: p.stats }));
  ok([...LC.compute(poolRows).entries()].every(([id, m]) => JSON.stringify(m) === JSON.stringify(marks.get(id))) && LC.compute(poolRows).size === marks.size, 'the engine reads the same leaders as the module does');

  // Every mark is earned: the best in his conference or the NCAA among qualifiers.
  {
    const byId = new Map(S.activePlayers.map(p => [p.id, p]));
    let bad = 0, nat = 0, conf = 0;
    marks.forEach((m, id) => Object.keys(m).forEach(k => {
      const p = byId.get(id), v = parseFloat(String(p.stats[k]).replace('%', ''));
      const lo = LC.STATS[k].dir === 'lo';
      const peers = [...marks.entries()].filter(([oid, om]) => om[k] && byId.get(oid));
      const beats = (a, b) => (lo ? a < b : a > b);
      if (m[k] === 'n') {
        nat++;
        if (peers.some(([oid, om]) => beats(parseFloat(String(byId.get(oid).stats[k]).replace('%', '')), v))) bad++;
      } else {
        conf++;
        if (peers.some(([oid]) => byId.get(oid).conference === p.conference && beats(parseFloat(String(byId.get(oid).stats[k]).replace('%', '')), v))) bad++;
      }
    }));
    ok(bad === 0 && nat > 20 && conf > 100, `marks are earned: ${nat} national and ${conf} conference leads, none beaten by another leader`);
    // And the national leader in points is the one the Stats tab would show on top (qualified).
    const q = S.activePlayers.filter(p => parseFloat(p.stats.mpg) >= 10 && (p.stats.totMin || 0) >= 150);
    const top = q.slice().sort((a, b) => parseFloat(b.stats.ppg) - parseFloat(a.stats.ppg))[0];
    ok(marks.get(top.id) && marks.get(top.id).ppg === 'n', `the top scorer on the Stats tab (${top.name}, ${top.stats.ppg}) leads the NCAA in points`);
  }

  // A national leader's team page: his stat in bold italics, the note under the tables.
  const topPts = [...marks.entries()].find(([, m]) => m.ppg === 'n')[0];
  const star = S.activePlayers.find(p => p.id === topPts);
  Sim.goToTeamPage(star.school);
  let page = d.getElementById('teamPageContainer').innerHTML;
  ok(page.includes('<b class="lead-n"><i title="Leads the NCAA">' + star.stats.ppg + '</i></b>'), `${star.name}'s ${star.stats.ppg} points on ${star.school}'s page is bold italics`);
  ok(/class="leader-legend"/.test(page) && /leads the conference/.test(page) && /leads the NCAA/.test(page), 'with the note under the stats');
  // A conference leader who doesn't lead the NCAA: bold only.
  const confOnly = [...marks.entries()].find(([id, m]) => Object.values(m).includes('c') && !Object.values(m).includes('n') && S.activePlayers.find(p => p.id === id));
  const cp = S.activePlayers.find(p => p.id === confOnly[0]);
  Sim.goToTeamPage(cp.school);
  page = d.getElementById('teamPageContainer').innerHTML;
  ok(/<b class="lead-c" title="Leads the conference">/.test(page), `${cp.name} (${Object.keys(confOnly[1]).join(', ')}) is bold on ${cp.school}'s page`);
  // The advanced table marks its own columns.
  const advLead = [...marks.entries()].find(([, m]) => m.bpm === 'n');
  ok(!!advLead, 'someone leads the NCAA in BPM');
  const bpmStar = S.activePlayers.find(p => p.id === advLead[0]);
  Sim.goToTeamPage(bpmStar.school);
  ok(d.getElementById('teamPageContainer').innerHTML.includes('<b class="lead-n"><i title="Leads the NCAA">' + bpmStar.stats.bpm + '</i></b>'), 'advanced stats are marked too');
  // Sorting keeps the marks.
  Sim.sortTeamRoster('box', 'ppg');
  ok(/class="lead-n"/.test(d.getElementById('teamPageContainer').innerHTML), 'sorting a roster keeps the marks');

  // A player's profile: each season's line, current and past.
  Sim.openPlayerPage(star.id);
  const prof = d.getElementById('playerPageBody').innerHTML;
  ok(prof.includes('<b class="lead-n"><i title="Leads the NCAA">' + star.stats.ppg + '</i></b>') && /leader-legend/.test(prof), 'a profile shows his leads in bold italics with the note');
  const plain = S.activePlayers.find(p => !marks.has(p.id) && parseFloat(p.stats.gp) > 5);
  Sim.openPlayerPage(plain.id);
  ok(!/class="lead-[nc]"/.test(d.getElementById('playerPageBody').innerHTML) && /leader-legend/.test(d.getElementById('playerPageBody').innerHTML), 'a player who leads nothing has nothing in bold (the note is still there)');
  Sim.closePlayerPage();

  // ---- The Standings tab opens team pages ----
  Sim.updateStandingsTab();
  const st = d.getElementById('standingsContainer');
  const clicks = [...st.querySelectorAll('.clickable-school')].map(e => e.getAttribute('onclick') || '');
  ok(clicks.length > 30 && clicks.every(c => /goToTeamPage\(/.test(c) && !/openTeamModal/.test(c)), `every team name on Standings opens its team page (${clicks.length})`);
  const row = st.querySelector('.clickable-school');
  const school = (row.getAttribute('onclick').match(/goToTeamPage\('((?:[^'\\]|\\.)*)'\)/) || [])[1].replace(/\\'/g, "'");
  w.eval(row.getAttribute('onclick'));
  ok(S.teamPageSelection === school && S.teamPageView === 'team', `clicking ${school} goes to its team page`);
  const modal = d.getElementById('teamModal');
  ok(!modal || modal.style.display === 'none' || modal.style.display === '' && !modal.classList.contains('active') && !modal.classList.contains('open'), 'and the team card does not pop up');
  ok(d.getElementById('teamTab') && d.getElementById('teamTab').classList.contains('active'), 'on the Team tab');

  // ---- A past season reads the same leaders from the archive ----
  const liveMarks = clone([...marks.entries()]);
  await playOffseason(Sim);
  ok(S.year > year, 'the season rolled over');
  ok(S.rosterArchive && S.rosterArchive[year], 'the old season is archived');
  const past = Sim.leadersFor(year);
  const strip = m => Object.keys(m || {}).filter(k => !/^p40/.test(k)).sort().map(k => k + ':' + m[k]).join();
  let diff = 0, cmp = 0;
  liveMarks.forEach(([id, m]) => { cmp++; if (strip(m) !== strip(past.get(id))) diff++; });
  ok(cmp > 100 && diff === 0, `an archived season gives the same leaders the live season had (${cmp} players compared)`);
  // A veteran's profile shows last season's marks on its row.
  const vet = S.activePlayers.find(p => (p.seasonHistory || []).some(h => h.year === year) && liveMarks.find(([id, m]) => id === p.id && m.ppg));
  if (vet) {
    Sim.openPlayerPage(vet.id);
    ok(/class="lead-[nc]"/.test(d.getElementById('playerPageBody').innerHTML), `${vet.name}'s profile marks his ${year} lead`);
    Sim.closePlayerPage();
  }
  // Team History → that season: the roster tables mark that year's leaders.
  const lead2 = liveMarks.find(([id, m]) => m.ppg === 'n' && Sim.teamSeasonData(S.activePlayers.find(p => p.id === id)?.school || '', year).players.some(p => p.id === id));
  if (lead2) {
    const p2 = Sim.teamSeasonData(S.activePlayers.find(p => p.id === lead2[0]).school, year).players.find(p => p.id === lead2[0]);
    Sim.goToTeamSeason(S.activePlayers.find(p => p.id === lead2[0]).school, year);
    ok(d.getElementById('teamPageContainer').innerHTML.includes('<b class="lead-n"><i title="Leads the NCAA">' + p2.stats.ppg + '</i></b>'), `a past season's team page marks ${year}'s leaders`);
  }

  // ---- What the Draft RP and the Recruiting page are given ----
  {
    const slim = Sim.slimPlayer(S.activePlayers.find(p => p.stats && p.stats.gp > 0));
    ok('leads' in slim, 'the published player carries his leads');
    const star2 = Sim.slimPlayer(star);
    ok(star2.leads === null || typeof star2.leads === 'object', 'and it is plain data');
    const line = Sim.seasonLine(S.year, 'Duke', 'FR', { gp: 30, ppg: '20.0', stl: '2.0' }, 'nobody');
    ok(!('leads' in line), 'a season line with no leads carries none');
    const lined = Sim.seasonLine(year, star.school, 'JR', star.stats, star.id);
    ok(lined.leads === undefined || typeof lined.leads === 'object', 'season lines carry leads by their own field names');
    const seasonWithLead = [...marks.keys()].map(id => S.activePlayers.find(p => p.id === id)).filter(Boolean).map(p => Sim.seasonLine(year, p.school, p.class, p.stats, p.id)).find(l => l.leads && l.leads.ppg);
    // (the current season is now S.year; the archived one answers by its own year)
    ok(seasonWithLead && seasonWithLead.leads.ppg && /^[nc]$/.test(seasonWithLead.leads.ppg), 'a season line says which of its stats led, and where');
  }

  // ---- The Draft RP ----
  {
    const UNIVERSE = JSON.parse(fs.readFileSync(path.join(FIX, 'universe.json'), 'utf8'));
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { if (!/Could not load|Not implemented|Dexie is not defined/.test(e.message)) errors.push(e.message); });
    class LocalOnly extends ResourceLoader {
      fetch(url) {
        if (!url.startsWith('http://localhost/') || !/\.js$/.test(url)) return null;
        if (/cloud-config\.js$/.test(url)) return Promise.resolve(Buffer.from('window.BTR_CLOUD_CONFIG = null;'));
        return Promise.resolve(fs.readFileSync(path.join(ROOT, decodeURIComponent(new URL(url).pathname))));
      }
    }
    const u = clone(UNIVERSE);
    const withStats = u.draft.pool.findIndex(p => p.stats && p.stats.ppg !== undefined);
    const pl = u.draft.pool[withStats];
    pl.stats = { ...pl.stats, gp: 30, mpg: '31.2', ppg: '21.5', apg: '4.4', bpm: '8.8' };
    pl.leads = { ppg: 'n', apg: 'c', bpm: 'c' };
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'rp/draft.html'), 'utf8'), {
      url: 'http://localhost/rp/draft.html', runScripts: 'dangerously', resources: new LocalOnly(), virtualConsole: vc, pretendToBeVisual: true,
      beforeParse(win) {
        win.fetch = url => String(url).includes('data/universe.json') ? Promise.resolve({ ok: true, json: () => Promise.resolve(clone(u)) }) : Promise.reject(new Error('unexpected fetch ' + url));
        win.scrollTo = () => {};
      }
    });
    await new Promise(r => dom.window.addEventListener('load', async () => {
      const dd = dom.window.document;
      for (let i = 0; i < 60 && /Loading/.test(dd.getElementById('draftStatus').textContent); i++) await tick(50);
      r();
    }));
    const DW = dom.window;
    ok(typeof DW.LeadersCore === 'object', 'the Draft RP loads the leaders module');
    const html = DW.DraftRP.renderProspectDetail({ player: DW.DraftRP.state.prospects.find(p => p.player.id === pl.id).player, tags: [] }, { readOnly: true });
    ok(html.includes('<b class="lead-n"><i title="Leads the NCAA">21.5</i></b>'), 'draft rp: the national scoring leader\'s points are bold italics on his profile');
    ok(/<b class="lead-c" title="Leads the conference">4\.4<\/b>/.test(html) && /<b class="lead-c" title="Leads the conference">8\.8<\/b>/.test(html), 'draft rp: conference leads (assists, BPM) are bold');
    ok(/class="leader-legend"/.test(html) && /leads the conference/.test(html) && /leads the NCAA/.test(html), 'draft rp: with the note under the stats');
    const other = DW.DraftRP.state.prospects.find(p => p.player.id !== pl.id).player;
    ok(!/class="lead-[nc]"/.test(DW.DraftRP.renderProspectDetail({ player: other, tags: [] }, { readOnly: true })), 'draft rp: a prospect who leads nothing has nothing in bold');
    ok(!errors.length, 'draft rp: no page errors' + (errors.length ? ' ' + errors[0] : ''));
  }

  // ---- The Recruiting page ----
  {
    const ROSTER = Papa.parse(fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8'), { header: true, skipEmptyLines: true }).data;
    const RECRUITS = Papa.parse(fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8'), { header: true, skipEmptyLines: true }).data;
    const UNIVERSE = JSON.parse(fs.readFileSync(path.join(FIX, 'universe.json'), 'utf8'));
    const u = clone(UNIVERSE);
    const alum = u.alumni.find(a => a.seasons && a.seasons.length);
    alum.seasons[0].leads = { ppg: 'n', rpg: 'c' };
    const html = fs.readFileSync(path.join(ROOT, 'recruiting/index.html'), 'utf8');
    ok(/leaders-core\.js/.test(html), 'the Recruiting page loads the leaders module');
    const dom = new JSDOM(html, { url: 'http://localhost/recruiting/', runScripts: 'outside-only' });
    const rw = dom.window, ctx = dom.getInternalVMContext();
    rw.alert = () => {};
    rw.scrollTo = () => {};
    rw.Papa = { parse: (url, opts) => opts.complete({ data: url.includes('vS_KgPla') ? ROSTER : RECRUITS }) };
    rw.fetch = url => String(url).includes('data/universe.json') ? Promise.resolve({ ok: true, json: () => Promise.resolve(clone(u)) }) : Promise.resolve({ ok: false, status: 404 });
    ['leaders-core.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'rp/js', f), 'utf8'), ctx, { filename: f }));
    ['app.js', 'portal.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'recruiting', f), 'utf8'), ctx, { filename: f }));
    rw.onload();
    vm.runInContext('loadPortalData()', ctx);
    await tick(60);
    const ev = expr => vm.runInContext(expr, ctx);
    const career = ev(`rpCareerHTML(recruits.find(r => r.name === ${JSON.stringify(alum.name)}) || { name: ${JSON.stringify(alum.name)} })`);
    const s0 = alum.seasons[0];
    ok(career.includes(`<b class="lead-n"><i title="Leads the NCAA">${s0.ppg}</i></b>`), 'recruiting: a college season he led the NCAA in points shows it in bold italics');
    ok(new RegExp(`<b class="lead-c" title="Leads the conference">${String(s0.rpg).replace('.', '\\.')}</b>`).test(career) && /leads the conference/.test(career), 'recruiting: a conference lead is bold, with the note');
    // AAU and FIBA lines on his profile.
    const name = ev('recruits.find(r => r.stats).name');
    ev(`(() => { const r = recruits.find(r => r.name === ${JSON.stringify(name)});
      const line = (lead) => ({ gp: 8, mpg: '27.0', ppg: '19.5', rpg: '8.1', apg: '2.2', spg: '1.1', bpg: '0.9', topg: '2.0', fg: '51.0%', fg3: '38.0%', ft: '80.0%', team: 'Test Squad', sim: true, label: 'Summer 2029', lead });
      r.stats.aau = line(['ppg', 'fg3']); r.stats.fiba = Object.assign(line(['rpg']), { team: 'USA' });
      openRecruitProfile(r); })()`);
    const prof = rw.document.getElementById('profileContainer').innerHTML;
    const aauBlock = prof.slice(prof.indexOf('AAU / Circuit'), prof.indexOf('FIBA / National'));
    const fibaBlock = prof.slice(prof.indexOf('FIBA / National'));
    ok(/<b class="lead-c"[^>]*>19\.5<\/b>/.test(aauBlock) && /<b class="lead-c"[^>]*>38\.0%<\/b>/.test(aauBlock) && !/<b class="lead-c"[^>]*>8\.1<\/b>/.test(aauBlock), 'recruiting: his AAU line has only the stats he led in bold');
    ok(/<b class="lead-c"[^>]*>8\.1<\/b>/.test(fibaBlock) && !/<b class="lead-c"[^>]*>19\.5<\/b>/.test(fibaBlock.slice(0, fibaBlock.indexOf('Intl') > 0 ? fibaBlock.indexOf('Intl') : undefined)), 'recruiting: his FIBA line has its own leaders in bold');
    ok(/led all AAU circuits/.test(aauBlock) && /led the FIBA field/.test(fibaBlock), 'recruiting: each table has its note');
    const hsAt = prof.indexOf('High School');
    ok(hsAt < 0 || !/leader-legend/.test(prof.slice(hsAt, prof.indexOf('AAU / Circuit'))), 'recruiting: and a high school table has none');
  }

  console.log('\nAll stat-leader checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
