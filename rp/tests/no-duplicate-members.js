// Guards against the single most damaging bug class in this codebase:
// a duplicated method inside an object literal. JavaScript silently keeps
// the LAST definition, so a stale copy further down the file overrides
// working code with no error. This has happened three separate times here
// (the historical seasons page, the offseason overlay, and the offseason
// stage block), and each time the symptom was "this screen is blank"
// rather than anything pointing at the real cause.
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'js');
const FILES = ['engine.js', 'ui.js', 'draft-rp.js', 'draft-core.js', 'coach-core.js', 'roster-gen.js', 'game-core.js'];

// Top-level members of an object literal sit at exactly two spaces.
// Control-flow keywords are excluded: files built from plain functions
// indent `if (` and `for (` the same way, and matching those produced
// noise rather than real findings.
const MEMBER = /^ {2}([A-Za-z_$][\w$]*)\s*(?:\(|:)/;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return',
  'function', 'const', 'let', 'var', 'else', 'do', 'try', 'case', 'default', 'throw', 'new']);

let failures = 0;
FILES.forEach(name => {
  const full = path.join(JS_DIR, name);
  if (!fs.existsSync(full)) return;
  const seen = {};
  fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    const m = line.match(MEMBER);
    if (m && !KEYWORDS.has(m[1])) (seen[m[1]] = seen[m[1]] || []).push(i + 1);
  });
  const dupes = Object.entries(seen).filter(([, v]) => v.length > 1);
  if (dupes.length) {
    failures += dupes.length;
    console.error(`FAIL ${name}: ${dupes.length} duplicated member(s)`);
    dupes.forEach(([k, v]) => console.error(`       ${k} defined at lines ${v.join(', ')} — the last one silently wins`));
  } else {
    console.log(`ok   ${name}: ${Object.keys(seen).length} members, no duplicates`);
  }
});

if (failures) {
  console.error('\nDuplicate members found. Remove the stale copy.');
  process.exit(1);
}
console.log('\nNo duplicate members.');
