// Awards (national by default, conference awards on top when picked, Most
// Improved and Coach of the Year, a 20-minute floor for winners), the AP
// poll's treatment of mid-majors, and early-season multi-team events.
const { boot, playSeason, playOffseason, ok } = require('./harness');
// Player ids can hold apostrophes (Saint Peter's), escaped in the markup.
const ID = /openPlayerModal\('((?:[^'\\]|\\.)*)'\)/;
const IDS = new RegExp(ID.source, 'g');
const unesc = x => (x || '').replace(/\\(.)/g, '$1');

(async () => {
  const { Sim, window: w } = boot();
  w.__BTR_AUTO_DRAFT = true; w.__BTR_AUTO_SUMMER = true; w.__BTR_NO_CUTSCENES = true;
  const d = w.document;
  await Sim.init();
  await Sim.startNewGame();

  // ---- multi-team events ----
  const events = Sim.state.mtes;
  ok(events.length >= 10, `early-season tournaments are on the schedule (${events.length})`);
  const big = events.filter(e => e.size === 8);
  ok(big.length >= 8 && events.some(e => e.size === 4), 'eight-team events and four-team events');
  const allTeams = events.flatMap(e => e.field);
  ok(new Set(allTeams).size === allTeams.length, 'a team is in at most one tournament');
  ok(events.every(e => e.week >= 3 && e.week <= 7), 'they fall in the first weeks of the season');
  const r1 = Sim.state.schedule.filter(g => g.mte && g.mteRound === 1);
  ok(r1.length === big.length * 4 + events.filter(e => e.size === 4).length * 2 && r1.every(g => g.neutral && g.mteName), 'round one is scheduled up front on a neutral floor');
  const perTeam = {};
  Sim.state.schedule.forEach(g => { if (!g.isConf) { perTeam[g.home] = (perTeam[g.home] || 0) + 1; perTeam[g.away] = (perTeam[g.away] || 0) + 1; } });
  const inEv = new Set(allTeams);
  // Round one is on the schedule now; the later rounds come with the results.
  events.forEach(e => e.field.forEach(sc => { perTeam[sc] = (perTeam[sc] || 0) + (e.size === 8 ? 2 : 1); }));
  const avgNc = list => list.reduce((n, t) => n + (perTeam[t.school] || 0), 0) / list.length;
  const evAvg = avgNc(Sim.state.teams.filter(t => inEv.has(t.school))), otherAvg = avgNc(Sim.state.teams.filter(t => !inEv.has(t.school)));
  ok(Math.abs(evAvg - otherAvg) < 0.5, `a tournament team's other non-conference games make room for it (${evAvg.toFixed(1)} vs ${otherAvg.toFixed(1)} non-conference games)`);

  let week = 0;
  while (!Sim.state.regularSeasonDone && week < 40) { await Sim.simulateWeek(); week++; }
  ok(events.every(e => e.done && e.champion && e.runnerUp), 'every tournament finishes with a champion');
  ok(big.every(e => e.games.length === 12 && e.field.every(s => {
    const opp = e.games.filter(g => g.home === s || g.away === s).map(g => (g.home === s ? g.away : g.home));
    return opp.length === 3 && new Set(opp).size === 3;
  })), 'in an eight-team event every team plays three different opponents');
  ok(events.filter(e => e.size === 4).every(e => e.games.length === 4 && e.field.every(s => e.games.filter(g => g.home === s || g.away === s).length === 2)), 'in a four-team event, two');
  const ev0 = big[0];
  ok(ev0.games.some(g => g.label === 'Championship') && ev0.games.some(g => g.label === 'Third Place') && ev0.games.some(g => g.label === 'Seventh Place'), 'the bracket plays down to seventh place');
  const sample = Sim.state.activePlayers.find(p => p.school === ev0.champion && (p.gameLog || []).some(l => l.event === ev0.name));
  const gl = sample && sample.gameLog.find(l => l.event === ev0.name);
  ok(gl && gl.neutral && gl.eventRound, `game logs carry the event (${gl && gl.event} · ${gl && gl.eventRound})`);
  Sim.state.scheduleViewWeek = ev0.week;
  ok(Sim.renderMtePanel(ev0.week).includes(ev0.name) && Sim.renderMtePanel(ev0.week).includes(ev0.champion), 'the Schedule tab lists the week\'s tournaments and their champions');
  // Logos: a file named for the event, a generated badge until it's added.
  ok(Sim.getMteLogo('Maui Invitational') === '../mtelogos/mauiinvitational.png' && Sim.getMteLogo('Battle 4 Atlantis') === '../mtelogos/battle4atlantis.png', 'an event\'s logo is mtelogos/<its name>.png');
  const img = Sim.getMteLogoImg(ev0.name, ev0.tier);
  ok(img.includes(Sim.getMteLogo(ev0.name)) && /onerror=".*data:image\/svg\+xml;base64,/.test(img), 'with a generated badge when the file isn\'t there');
  ok(Sim.mteBadge('Maui Invitational', 'A') !== Sim.mteBadge('Maui Invitational', 'D'), 'the badge is coloured by how big the event is');
  const readme = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'mtelogos', 'README.md'), 'utf8');
  ok(events.every(e => readme.includes(Sim.mteKey(e.name) + '.png')), 'the mtelogos README lists the file for every event in this season');
  ok(Sim.renderMtePanel(ev0.week).includes('mte-logo'), 'the Schedule tab\'s tournament cards carry the logo');
  Sim.updateScheduleTab();
  ok(/mte-logo xs/.test(d.getElementById('scheduleContainer').innerHTML), 'and so does each tournament game on the scoreboard');
  Sim.updateDashboard();
  const card = d.getElementById('dashEvents');
  ok(card && !card.closest('.dash-events').hidden && card.querySelectorAll('.ev-row').length === events.length, `the dashboard lists every tournament (${card && card.querySelectorAll('.ev-row').length})`);
  ok(card.querySelectorAll('.ev-logo img').length === events.length && /mauiinvitational|mte-logo/.test(card.innerHTML), 'each with its logo');
  ok(/Final/.test(card.textContent) && card.textContent.includes(ev0.champion), 'finished ones name their champion');
  ok(card.querySelectorAll('.ev-extra').length === events.length - 8 && card.querySelector('button'), 'a long list folds after eight, with a button for the rest');
  ok(d.querySelector('.dash-main .dash-poll') && d.querySelector('.dash-main .dash-events'), 'the tournaments sit under the poll, filling the left column');
  Sim.goToEvent(ev0.id);
  ok(d.getElementById('scheduleTab').classList.contains('active') && Sim.state.scheduleViewWeek === Math.min(ev0.week, Sim.scheduleDefaultWeek()), 'a tournament on the dashboard opens the Schedule tab on its week');
  d.querySelector('.app-tabs [data-tab="dashTab"]').click();
  const sched = {};
  Sim.state.schedule.forEach(g => { sched[g.home] = (sched[g.home] || 0) + 1; sched[g.away] = (sched[g.away] || 0) + 1; });
  ok(Sim.state.teams.every(t => t.simData.wins + t.simData.losses === sched[t.school]), 'every scheduled game, including the later tournament rounds, was played');
  const ncOf = list => list.reduce((n, t) => n + Sim.state.schedule.filter(g => !g.isConf && (g.home === t.school || g.away === t.school)).length, 0) / list.length;
  ok(Math.abs(ncOf(Sim.state.teams.filter(t => inEv.has(t.school))) - ncOf(Sim.state.teams.filter(t => !inEv.has(t.school)))) < 0.5, 'tournament teams end with as many non-conference games as everyone else');

  // ---- AP poll ----
  const power = t => w.DraftCore.POWER_SIX.has(t.conference);
  const top = Sim.state.teams.filter(t => t.apRank).sort((a, b) => a.apRank - b.apRank);
  const mids = top.filter(t => !power(t));
  ok(mids.length <= 5, `few mid-majors in the final Top 25 (${mids.length})`);
  ok(mids.every(t => t.simData.losses <= 4), `a ranked mid-major has hardly lost (${mids.map(t => `${t.school} ${t.simData.wins}-${t.simData.losses}`).join(', ') || 'none ranked'})`);
  const flawed = Sim.state.teams.filter(t => !power(t) && t.simData.losses >= 7 && t.apRank);
  ok(flawed.length === 0, 'no mid-major with seven losses is ranked');

  // ---- awards ----
  const aw = Sim.computeNationalAwards();
  const mpg = p => parseFloat(p.stats.mpg);
  ok([aw.npoy, aw.dpoy, aw.froy, aw.cousy, aw.west, aw.erving, aw.malone, aw.abdulJabbar].filter(Boolean).every(p => mpg(p) >= 20), 'every national award winner plays 20+ minutes');
  ok(aw.coyTeam && aw.coyTeam.coach && aw.coyTeam.coach.name, `there's a national Coach of the Year (${aw.coyTeam && aw.coyTeam.coach.name}, ${aw.coyTeam && aw.coyTeam.school})`);
  const wl = t => t.simData.wins / (t.simData.wins + t.simData.losses);
  ok(wl(aw.coyTeam) >= 0.7, 'and his team won');

  const sel = d.getElementById('awardConfFilter');
  ok(sel && sel.options[0].value === 'NATIONAL' && /National/.test(sel.options[0].textContent), 'the awards dropdown starts with National Awards');
  ok(sel.value === 'NATIONAL' && Sim.state.selectedAwardConf === 'NATIONAL', 'and defaults to it');
  Sim.updateAwardsTab();
  ok(d.getElementById('awardsNationalView').style.display !== 'none' && d.getElementById('awardsConfView').style.display === 'none', 'national awards show, conference awards stay out of the way');
  ok(/Coach of the Year/.test(d.getElementById('nationalAwardsGrid').textContent), 'the national page lists Coach of the Year');

  // Most Improved needs a previous season, which a first season doesn't have.
  Sim.state.activePlayers.forEach((p, i) => {
    if (p.class === 'FR') return;
    const f = 0.55 + (i % 7) * 0.06;
    p.seasonHistory = [{ year: Sim.state.year - 1, school: p.school, class: 'FR', stats: { gp: 30, mpg: '14.0', ppg: (parseFloat(p.stats.ppg) * f).toFixed(1), bpm: (parseFloat(p.stats.bpm) - 2).toFixed(1), rpg: p.stats.rpg, apg: p.stats.apg } }];
  });
  const conf = Sim.state.teams.find(t => w.DraftCore.POWER_SIX.has(t.conference)).conference;
  Sim.selectAwards(conf);
  ok(d.getElementById('awardsNationalView').style.display === 'none' && d.getElementById('awardsConfView').style.display !== 'none', 'picking a conference puts its honors at the top of the page');
  const confText = d.getElementById('confAwardsContainer').textContent;
  ok(/Player of the Year/.test(confText) && /Most Improved Player/.test(confText) && /Coach of the Year/.test(confText) && /Defensive Player of the Year/.test(confText), `${conf} lists POY, DPOY, Most Improved and Coach of the Year`);
  ok(d.getElementById('confAwardsTitle').textContent.includes(conf), 'with the conference named');

  // Every conference's winners play.
  const confs = [...new Set(Sim.state.teams.map(t => t.conference))];
  let checked = 0, bad = [];
  for (const c of confs) {
    Sim.selectAwards(c);
    const html = d.getElementById('confAwardsContainer').innerHTML;
    const names = [...html.matchAll(IDS)].map(m => unesc(m[1]));
    const sixth = html.split('Sixth Man of the Year')[1] ? unesc((html.split('Sixth Man of the Year')[1].match(ID) || [])[1]) : null;
    names.forEach(id => {
      const p = Sim.state.activePlayers.find(x => String(x.id) === id);
      if (!p) return;
      checked++;
      const floor = id === sixth ? 12 : 20;
      if (mpg(p) < floor && !(Sim.awardPool(Sim.state.activePlayers.filter(q => Sim.matchesConfFilter(q.conference, c))).length < 10)) bad.push(`${p.name} ${p.stats.mpg}`);
    });
  }
  ok(checked > confs.length * 4 && bad.length === 0, `conference award winners and all-conference teams play 20+ minutes (${checked} names checked${bad.length ? '; under: ' + bad.slice(0, 4).join(', ') : ''})`);
  const sixthWinners = confs.map(c => { Sim.selectAwards(c); const h = d.getElementById('confAwardsContainer').innerHTML.split('Sixth Man of the Year')[1]; return h ? unesc((h.match(ID) || [])[1]) : null; }).filter(Boolean)
    .map(id => { const all = Sim.state.activePlayers.filter(p => String(p.id) === id); return all.find(p => Sim.isSixthMan(p)) || all[0]; }).filter(Boolean);
  ok(sixthWinners.length > 0 && sixthWinners.every(p => Sim.isSixthMan(p) && mpg(p) >= 12), `Sixth Man winners come off the bench (${sixthWinners.length} winners${sixthWinners.filter(p => !(Sim.isSixthMan(p) && mpg(p) >= 12)).map(p => '; ' + p.name + ' gs ' + p.stats.gs + '/' + p.stats.gp + ' ' + p.stats.mpg + 'mpg').join('')})`);

  // Most improved is a real jump on last season.
  const fake = Sim.state.activePlayers.find(p => mpg(p) >= 20 && p.class !== 'FR');
  fake.seasonHistory = [{ year: Sim.state.year - 1, school: fake.school, class: 'FR', stats: { gp: 30, mpg: '12.0', ppg: (parseFloat(fake.stats.ppg) - 6).toFixed(1), bpm: (parseFloat(fake.stats.bpm) - 3).toFixed(1), rpg: fake.stats.rpg, apg: fake.stats.apg } }];
  ok(Sim.improvementOf(fake) > 3, 'Most Improved reads the jump from last season');
  ok(Sim.improvementOf(Sim.state.activePlayers.find(p => !(p.seasonHistory || []).some(h => h.year === Sim.state.year - 1))) === null, 'and a player with no previous season can\'t win it');

  // Back to national on reload.
  Sim.selectAwards('NATIONAL');
  ok(d.getElementById('awardsNationalView').style.display !== 'none', 'choosing National returns to the national honors');

  // Season history records the coach.
  const yr = Sim.state.year;
  while (!Sim.state.ncaaDone) await Sim.simulateWeek();
  await playOffseason(Sim);
  const h = Sim.state.seasonHistory.find(x => x.year === yr);
  ok(h && h.coy && h.coy.name, 'the season record keeps the Coach of the Year');
  ok(/Coach of the Year/.test(Sim.renderSeasonSummary(yr)), 'and the season summary lists him');

  console.log('\nAwards and tournaments verified.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
