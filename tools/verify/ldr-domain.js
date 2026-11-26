'use strict';
const CH = require('../../src/shared/ipc-channels.js');
const all = [...Object.values(CH.CHANNELS), ...CH.PUSH_CHANNELS];
const doms = new Set();
for (const c of all) {
  const m = /^kv:([a-z][a-z-]*):/.exec(c);
  if (m) doms.add('kv:' + m[1]);
}
console.log('kodda domain:', doms.size);
console.log([...doms].sort().join('\n'));
const fs = require('fs');
const api = fs.readFileSync(__dirname + '/../../docs/console-api-contract.md', 'utf8');
const missing = [...doms].filter((d) => !api.includes(d));
console.log('sözleşmede geçmeyen domain:', missing.length, missing.join(','));
