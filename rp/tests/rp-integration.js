// The three RP pages share one universe. This plays a season from the real
// roster sheet (a copy in tests/fixtures) and checks everything the Draft
// RP and the recruiting page read from it:
//   - the sheet's Draft column ("2029 R:1 P:5") fixes a player's pick
//   - draft night happens in the offseason, with NBA teams and a lottery
//   - drafted players keep their pick in their college record
//   - next-season rows at a new school are recorded as scheduled transfers
//   - the published snapshot (data/universe.json) has what the pages need
const fs = require('fs');
const path = require('path');
const { boot, playSeason, ok } = require('./harness');

const FIX = path.join(__dirname, 'fixtures');
// Set UNIVERSE_OUT to a folder to keep a snapshot from each stage (used
// for render checks of the Draft RP and recruiting pages).
const OUT = process.env.UNIVERSE_OUT || '';
const keep = (name, snap) => { if (OUT) fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(snap)); };

(async () => {
  const roster = fs.readFileSync(path.join(FIX, 'roster.csv'), 'utf8');
  const recruits = fs.readFileSync(path.join(FIX, 'recruits.csv'), 'utf8');
  const { Sim } = boot({ roster, recruits });
  await Sim.init();
  await Sim.startNewGame();
  ok(Sim.state.year === 2028, `universe starts in 2028-29 (${Sim.state.year})`);

  // ---- sheet parsing ----
  const spec = Sim.parseDraftSpec('2029 R:1 P:5');
  ok(spec && spec.year === 2029 && spec.pick === 5 && spec.overall === 5, 'Draft column "2029 R:1 P:5" is read');
  ok(Sim.parseDraftSpec('2030 R:2 P:3').overall === 33, 'second-round picks count from 31');
  ok(Sim.parseDraftSpec('') === null, 'an empty Draft cell means no scripted pick');

  const drew = Sim.state.activePlayers.find(p => p.name === 'DaRon Drew');
  ok(drew && !/^T\s*-/.test(drew.hometown || ''), 'FROM "T - Ohio" is a transfer note, not a hometown');

  // ---- in season: the draft is already live ----
  for (let i = 0; i < 6; i++) await Sim.simulateWeek();
  let snap = Sim.buildUniverseSnapshot();
  keep('live', snap);
  ok(snap.draft.stage === 'live', 'mid-season the draft stage is live');
  ok(snap.draft.year === 2029, 'the 2028-29 season feeds the 2029 draft');
  ok(snap.draft.pool.length >= 60, `in-season board has a full pool (${snap.draft.pool.length})`);
  ok(Array.isArray(snap.draft.league) && snap.draft.league.length === 30, 'NBA season exists all year for the mock');
  ok(snap.draft.pool.some(p => p.name === 'Alberto Rodriguez' && p.scriptedDraft && p.scriptedDraft.overall === 1), 'published prospects carry their scripted pick for the mock');
  ok(snap.draft.pool.every(p => !p.stats || !('totPts' in p.stats)), 'season totals are left out of the published file');
  const league = JSON.stringify(snap.draft.league);
  ok(JSON.stringify(Sim.buildUniverseSnapshot().draft.league) === league, 'the NBA season is stable between publishes');

  // ---- declarations ----
  ok(await playSeason(Sim), 'season completes');
  const declared = Sim.state.draftDeclarations;
  ['Alberto Rodriguez', 'Clark Wilkins'].forEach(n => {
    const d = declared.find(x => x.name === n);
    ok(d && d.scripted, `${n} declares for his scripted draft`);
  });
  snap = Sim.buildUniverseSnapshot();
  keep('declared', snap);
  ok(snap.draft.stage === 'declared', 'after the tournament the stage is declared');
  ok(snap.draft.pool.length === declared.length, 'the published pool is the declared class');

  // ---- offseason through draft night ----
  const draftIdx = Sim.OFFSEASON_STAGES.findIndex(s => s.key === 'draft');
  ok(draftIdx > 0, 'draft night is an offseason stage');
  for (let i = 0; i <= draftIdx; i++) await Sim.simulateWeek();

  const stillIn = Sim.state.draftDeclarations.map(d => d.name);
  ok(stillIn.includes('Alberto Rodriguez') && stillIn.includes('Clark Wilkins'), 'scripted picks never withdraw');

  const res = Sim.state.draftResults || [];
  ok(res.length >= 30, `the draft is held (${res.length} picks)`);
  ok(res.every(r => r.team && r.team.name && r.team.logo), 'every pick has an NBA team');
  ok(new Set(res.map(r => r.id)).size === res.length, 'no player drafted twice');
  ok(res.every((r, i) => r.pick === i + 1), 'picks are numbered in order');
  const p1 = res.find(r => r.pick === 1), p5 = res.find(r => r.pick === 5);
  ok(p1 && p1.name === 'Alberto Rodriguez', `pick 1 is Alberto Rodriguez (${p1 && p1.name})`);
  ok(p5 && p5.name === 'Clark Wilkins', `pick 5 is Clark Wilkins (${p5 && p5.name})`);
  ok(Sim.state.draftLottery && Sim.state.draftLottery.winners.length === 4, 'lottery winners are recorded');
  ok((Sim.state.draftHistory || []).some(d => d.year === 2029 && d.picks.length === res.length), 'the draft is added to draft history');

  snap = Sim.buildUniverseSnapshot();
  keep('complete', snap);
  ok(snap.draft.stage === 'complete', 'after draft night the stage is complete');
  ok(snap.draft.results.length === res.length && snap.draft.results[0].team, 'the snapshot carries the picks and teams');
  const alum = snap.alumni.find(a => a.name === 'Alberto Rodriguez');
  ok(alum && alum.draft && alum.draft.pick === 1 && alum.draft.team && alum.draft.team.logo, 'a drafted recruit keeps his pick and NBA team');
  ok(alum && alum.seasons.length >= 1 && alum.seasons[0].school === 'Louisville', 'his college season line is kept');

  // ---- the rest of the offseason: portal and rollover ----
  for (let i = draftIdx + 1; i < Sim.OFFSEASON_STAGES.length; i++) await Sim.simulateWeek();
  ok(Sim.state.year === 2029, 'the season rolls over to 2029-30');

  const th = Sim.state.transferHistory || [];
  ok(th.length > 0, `transfers are recorded (${th.length})`);
  ok(th.every(t => t.season === '2029-30'), 'transfers are labelled with the season they move into');
  const pope = th.find(t => t.name === 'Lewis Pope');
  ok(pope && pope.scheduled && pope.from === 'Missouri' && pope.to === 'Arkansas', 'the sheet\'s Missouri → Arkansas move is a scheduled transfer');
  ok(th.some(t => !t.scheduled), 'sim portal moves are recorded too');

  const archived = (Sim.state.departedArchive || []).find(p => p.name === 'Alberto Rodriguez');
  ok(archived && archived.draft && archived.draft.pick === 1, 'the departed archive keeps the draft pick');

  snap = Sim.buildUniverseSnapshot();
  ok(snap.draft.stage === 'live' && snap.draft.year === 2030, 'the next draft (2030) goes live');
  ok(['Cameron Grant', 'Erving Montgomery', 'Patrick Greene'].every(n => snap.draft.pool.some(p => p.name === n && p.scriptedDraft && p.scriptedDraft.year === 2030)),
    'every player the sheet has in the 2030 draft is in the live pool');
  ok(snap.draft.history.some(h => h.year === 2029), 'the 2029 draft stays in history');
  ok(snap.transfers.length === th.length, 'the snapshot carries every transfer');
  ok(snap.champions.length >= 1 && snap.champions[0].champion, 'the champion is recorded');
  const kb = Buffer.byteLength(JSON.stringify(snap)) / 1024;
  ok(kb < 4096, `universe.json stays small (${kb.toFixed(0)} KB)`);
  ['version', 'publishedAt', 'season', 'teams', 'draft', 'transfers', 'alumni', 'champions']
    .forEach(k => ok(k in snap, `snapshot has ${k}`));

  keep('next', snap);
  console.log('\nRP integration checks passed.');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
