// Runs every check. From the rp/ directory:   node tests/run-all.js
const { execFileSync } = require('child_process');
const path = require('path');

const TESTS = ['no-duplicate-members.js', 'league-stats.js', 'season-cycle.js', 'draft-and-save.js', 'save-integrity.js', 'recruiting-page.js', 'recruiting-branding.js'];
let failed = 0;

TESTS.forEach(t => {
  console.log('\n=== ' + t + ' ===');
  try {
    execFileSync(process.execPath, [path.join(__dirname, t)], { stdio: 'inherit' });
  } catch (e) {
    failed++;
    console.error('*** ' + t + ' FAILED ***');
  }
});

console.log('\n' + (failed ? `${failed} of ${TESTS.length} suites failed.` : `All ${TESTS.length} suites passed.`));
process.exit(failed ? 1 : 0);
