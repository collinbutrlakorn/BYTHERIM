// Accounts (cloud.js), against an in-memory stand-in for Firebase: sign
// in, the admin list, saves split across documents and put back together,
// draft boards per person, and publishing the official universe.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ok } = require('./harness');

// ---------- a small fake of the Firebase compat API ----------
function fakeFirebase() {
  const store = new Map();
  const merge = (a, b) => {
    const out = { ...(a || {}) };
    Object.keys(b).forEach(k => {
      out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k] && typeof out[k] === 'object' ? merge(out[k], b[k]) : b[k];
    });
    return out;
  };
  const writes = [];
  let user = null, listener = null;
  const fb = {
    apps: [],
    store, writes,
    initializeApp(cfg) { this.apps.push(cfg); },
    auth: Object.assign(() => ({
      onAuthStateChanged(cb) { listener = cb; setTimeout(() => cb(user), 0); },
      async signInWithPopup() { user = fb._nextUser; await listener(user); },
      async signOut() { user = null; await listener(null); }
    }), { GoogleAuthProvider: function () {} }),
    firestore: () => ({
      doc: p => ({
        async get() { const d = store.get(p); return { exists: !!d, data: () => d }; },
        async set(data, opts) {
          if (JSON.stringify(data).length > 1048576) throw new Error(`document too large: ${p}`);
          writes.push(p);
          store.set(p, opts && opts.merge ? merge(store.get(p), data) : data);
        },
        async delete() { store.delete(p); }
      })
    })
  };
  return fb;
}

(async () => {
  const fb = fakeFirebase();
  const ctx = { console, setTimeout, clearTimeout, Blob, Response, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, btoa, atob, Uint8Array,
    firebase: fb, BTR_CLOUD_CONFIG: { apiKey: 'test', projectId: 'bytherim-test' },
    fetch: async url => ({ ok: true, json: async () => ({ from: 'file', url }) }) };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud.js'), 'utf8'), ctx);
  const Cloud = ctx.Cloud;

  ok(await Cloud.init() === true && Cloud.enabled, 'with a config, accounts switch on');
  ok(Cloud.user === null, 'nobody is signed in to start');

  fb._nextUser = { uid: 'u1', email: 'Owner@Example.com', displayName: 'Owner' };
  await Cloud.signIn();
  ok(Cloud.user && Cloud.user.uid === 'u1', 'signing in with Google sets the user');
  ok(Cloud.admin === false, 'not an admin until the admin list says so');
  let threw = false;
  try { await Cloud.publishUniverse('{}'); } catch (e) { threw = true; }
  ok(threw, 'a non-admin cannot publish');

  fb.store.set('config/admins', { emails: ['owner@example.com'] });
  await Cloud.signOut(); await Cloud.signIn();
  ok(Cloud.admin === true, 'an email on the admin list is an admin (case doesn\'t matter)');
  const list = await Cloud.setAdmins(['friend@example.com', ' FRIEND@example.com ', 'not-an-email']);
  ok(list.includes('friend@example.com') && list.includes('owner@example.com') && list.length === 2, 'admins can add others; an admin can\'t remove himself by accident');

  // A save bigger than one document, split and put back together.
  let big = '';
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed.toString(36); };
  for (let i = 0; i < 90000; i++) big += `{"id":"p${i}","s":"${rand()}${rand()}${rand()}${rand()}"},`;
  big = `[${big.slice(0, -1)}]`;
  const meta = await Cloud.putBlob('users/u1/saves/main', big, { summary: 'test' });
  ok(meta.chunks >= 2, `a ${(big.length / 1e6).toFixed(1)} MB save is split across ${meta.chunks} documents, each under Firestore's 1 MB limit`);
  const back = await Cloud.getBlob('users/u1/saves/main');
  ok(back && back.text === big, 'and comes back exactly');
  await Cloud.putBlob('users/u1/saves/main', 'small', {});
  const pieces = [...fb.store.keys()].filter(k => k.startsWith('users/u1/saves/main/chunks/'));
  ok(pieces.length === 1 && !pieces.some(k => k.includes(meta.gen)), 'a new save clears the old pieces');
  ok((await Cloud.getBlob('users/u1/saves/main')).text === 'small', 'and reads back');

  // An upload cut off before it finishes leaves the last save whole.
  const prevMeta = fb.store.get('users/u1/saves/main');
  fb.store.set('users/u1/saves/main/chunks/zzz-0', { d: 'garbage' });   // a half-written new generation
  ok((await Cloud.getBlob('users/u1/saves/main')).text === 'small' && fb.store.get('users/u1/saves/main') === prevMeta, 'an interrupted upload never corrupts the saved copy');
  // Saves written before generations existed still load.
  const legacy = await Cloud.putBlob('users/u1/saves/legacy', 'old save', {});
  const lm = { ...fb.store.get('users/u1/saves/legacy') }; delete lm.gen;
  fb.store.set('users/u1/saves/legacy', lm);
  fb.store.set('users/u1/saves/legacy/chunks/0', fb.store.get(`users/u1/saves/legacy/chunks/${legacy.gen}-0`));
  ok((await Cloud.getBlob('users/u1/saves/legacy')).text === 'old save', 'saves from before read back too');

  // The whole browser save, round-tripped.
  const table = rows => ({ rows: rows.slice(), async toArray() { return this.rows.slice(); }, async clear() { this.rows = []; }, async bulkPut(r) { this.rows.push(...r); } });
  const dbx = { leagueState: table([{ id: 1, currentYear: 2029 }]), teams: table([{ school: 'Duke' }]), players: table([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]),
    async transaction(mode, a, b, c, fn) { return fn(); } };
  await Cloud.uploadSave(dbx, '2029-30 · Week 3');
  dbx.players.rows = []; dbx.leagueState.rows = [{ id: 1, currentYear: 2040 }];
  const got = await Cloud.downloadSave(dbx);
  ok(got.summary === '2029-30 · Week 3' && dbx.players.rows.length === 2 && dbx.leagueState.rows[0].currentYear === 2029, 'a save uploaded from one browser restores exactly in another');

  // Draft boards: one per board key, merged, never clobbering the others.
  await Cloud.setBoard('draft-board-2029', ['x', 'y']);
  await Cloud.setBoard('draft-board-2030', ['z']);
  const data = await Cloud.getUserData();
  ok(data.boards['draft-board-2029'].join() === 'x,y' && data.boards['draft-board-2030'].join() === 'z', 'draft boards are kept per draft year in the account');

  // The official universe: the published one when there is one.
  const fileU = await Cloud.universe('../data/universe.json');
  ok(fileU && fileU.from === 'file', 'before anyone publishes, pages read data/universe.json');
  await Cloud.publishUniverse(JSON.stringify({ version: 1, season: { label: '2029-30' } }));
  const pubU = await Cloud.universe('../data/universe.json');
  ok(pubU && pubU.season && pubU.season.label === '2029-30', 'after an admin publishes, every page reads the published universe');

  // Without a config, nothing changes.
  const ctx2 = { console, setTimeout, BTR_CLOUD_CONFIG: null, fetch: ctx.fetch };
  ctx2.globalThis = ctx2;
  vm.createContext(ctx2);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud.js'), 'utf8'), ctx2);
  ok(await ctx2.Cloud.init() === false && !ctx2.Cloud.enabled, 'without a config, accounts stay off');
  const u2 = await ctx2.Cloud.universe('../data/universe.json');
  ok(u2 && u2.from === 'file', '...and pages read the universe file as before');

  console.log('\nAccounts verified.');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
