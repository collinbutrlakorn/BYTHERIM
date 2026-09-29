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
  console.log('\nAdmin page OK.');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
