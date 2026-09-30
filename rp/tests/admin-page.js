// The admin page renders every tab from a save.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { ok, RP, JS } = require('./harness');

(async () => {
  const html = fs.readFileSync(path.join(RP, 'admin.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/rp/admin.html', runScripts: 'outside-only' });
  const w = dom.window;
  const ctx = dom.getInternalVMContext();
  const vm = require('vm');
  w.__ADMIN_NO_AUTOSTART = true;
  ['teams-master.js', 'roster-gen.js', 'prestige.js', 'admin.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));

  const teams = [
    { school: 'Duke', conference: 'ACC', prestige: 100, prestigeHistory: 100, coach: { name: 'Coach A', rep: 90, since: 2026, seasons: 2, careerW: 60, careerL: 10 }, coachTags: ['Up-tempo'], simData: { teamOvr: 84.2 } },
    { school: 'Siena', conference: 'MAAC', prestige: 30, prestigeHistory: 32, coach: { name: 'Coach B', rep: 35, generated: true, since: 2028 }, simData: { teamOvr: 70.1 } }
  ];
  const players = [
    { id: 1, name: 'Real One', school: 'Duke', pos: 'PG', class: 'SO', rating: 86, potential: 92, stats: { ppg: '14.2', mpg: '30.1' } },
    { id: 2, name: 'Gen Two', school: 'Duke', pos: 'C', class: 'FR', rating: 80, isGenerated: true },
    { id: 3, name: 'Gen Three', school: 'Siena', pos: 'SF', class: 'JR', rating: 68, isGenerated: true },
    { id: 4, name: 'Recruit Four', school: 'Siena', pos: 'SG', class: 'FR', rating: 72, enrolled: true }
  ];
  const league = { currentYear: 2029, currentPhase: 'Preseason', coachChanges: [{ year: 2028, text: 'Siena names Coach B head coach' }] };
  w.db = { leagueState: { get: async () => league }, teams: { toArray: async () => teams }, players: { toArray: async () => players } };
  vm.runInContext('db = window.db', ctx);

  const A = w.AdminPage;
  await A.start({ skipGate: true });
  const body = () => w.document.getElementById('admBody').textContent;
  ok(/Roster sheet/.test(body()) && /Generated/.test(body()), 'overview shows sources');
  ok(/By conference/.test(body()) && /MAAC/.test(body()), 'overview breaks overalls down by conference');
  A.setTab('teams');
  ok(/Duke/.test(body()) && /Coach A/.test(body()), 'teams tab lists teams and coaches');
  A.toggleTeam('Duke');
  ok(/Real One/.test(body()) && /Gen Two/.test(body()), 'a team opens its roster with every player');
  A.setTab('players');
  ok(/Recruit Four/.test(body()) && /Recruiting sheet/.test(body()), 'players tab lists every player with a source');
  A.setFilter('players', 'source', 'generated');
  ok(!/Real One/.test(body()) && /Gen Three/.test(body()), 'players filter by source');
  A.setTab('coaches');
  ok(/Coach B/.test(body()) && /names Coach B/.test(body()), 'coaches tab lists coaches and changes');

  // ---- Recruiting admin: resetting generated classes ----
  {
    const RDIR = path.join(RP, '..', 'recruiting');
    const rhtml = fs.readFileSync(path.join(RDIR, 'admin.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const d2 = new JSDOM(rhtml, { url: 'http://localhost/recruiting/admin.html', runScripts: 'outside-only' });
    const w2 = d2.window, c2 = d2.getInternalVMContext();
    w2.__ADMIN_NO_AUTOSTART = true;
    w2.confirm = () => true;
    ['teams-master.js', 'roster-gen.js', 'prestige.js', 'recruit-gen.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), c2, { filename: f }));
    vm.runInContext(fs.readFileSync(path.join(RDIR, 'admin.js'), 'utf8'), c2, { filename: 'admin.js' });
    const sheet = [{ __tab: '2030', rank: '1', classYear: '2030', name: 'Sheet Star', state: 'CA', rating: '97', pos: 'PG', committedSchool: 'UCLA' }];
    const classes = ['2030', '2031', '2032', '2033'];
    let resets = {};
    const build = () => { w2.RecruitGen.setResets(resets); return w2.RecruitGen.augment(sheet.map(r => ({ ...r })), { keys: 'camel', classes }); };
    w2.RecruitSheet = { load: async () => ({ rows: build() }) };
    const asked = [];
    w2.Cloud = {
      universe: async () => ({ season: { year: 2029 }, recruitingLive: { openFrom: 2032 } }),
      resetGeneratedClasses: async years => { asked.push(years); years.forEach(y => { resets[y] = (resets[y] || 0) + 1; }); return resets; }
    };
    const R = w2.RecruitAdmin;
    await R.start({ skipGate: true });
    ok(R.openFrom === 2032, 'recruiting admin: classes the published universe is recruiting are locked');
    const names = y => R.rows.filter(r => r.generated && String(r.classYear) === y).map(r => r.name).sort().join('|');
    const before = { 2030: names('2030'), 2033: names('2033') };
    R.set('year', '2030');
    const btn = () => [...w2.document.querySelectorAll('.adm-reset-btns button')];
    ok(btn()[0].disabled && /every open class \(2\)/.test(btn()[1].textContent), 'recruiting admin: a locked class can\'t be reset; the open ones can');
    R.set('year', '2033');
    ok(!btn()[0].disabled, 'recruiting admin: an open class has a reset button');
    await R.reset(['2033']);
    ok(asked.length === 1 && asked[0].join() === '2033', 'recruiting admin: the reset is saved for that class');
    ok(names('2033') !== before[2033] && names('2030') === before[2030], 'recruiting admin: the class gets new generated players; the others keep theirs');
    ok(R.rows.some(r => r.name === 'Sheet Star' && r.rank === '1'), 'recruiting admin: sheet players are untouched');
    ok(/Reset the class of 2033/.test(w2.document.querySelector('.adm-reset-note').textContent), 'recruiting admin: and it says what it did');
    await R.reset(['2030', '2031']);
    ok(asked.length === 1, 'recruiting admin: locked classes are never reset');
  }
  console.log('\nAdmin page OK.');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
