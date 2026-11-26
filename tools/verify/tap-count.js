'use strict';
// Test totals from the TAP reporter (# tests / # pass / # fail lines).
const cp = require('node:child_process');
const files = process.argv.slice(2);
const args = ['--test', '--test-reporter=tap', ...(files.length ? files : ['tests/'])];
const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = r.stdout || '';
const num = (label) => {
  const m = out.match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
  return m ? Number(m[1]) : 0;
};
if (!out.trim()) {
  console.error(r.stderr || 'no test output');
}
console.log(JSON.stringify({
  tests: num('tests'),
  pass: num('pass'),
  fail: num('fail'),
  skipped: num('skipped'),
  todo: num('todo'),
}));
process.exit(r.status === 0 ? 0 : 1);
