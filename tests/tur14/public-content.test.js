'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertPublicFiles } = require('../../tools/verify/public-content');

test('publication check rejects profile files and reports no matched credential value', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-public-content-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sample = 'gh' + 'p_' + 'a'.repeat(36);
  fs.writeFileSync(path.join(root, 'notes.txt'), sample);
  fs.writeFileSync(path.join(root, 'conversations.json'), '[]');
  fs.writeFileSync(path.join(root, 'about.txt'), 'Clean fixture');
  assert.doesNotThrow(() => assertPublicFiles(root, ['about.txt']));
  assert.throws(() => assertPublicFiles(root, ['notes.txt', 'conversations.json']), (error) =>
    error.message.includes('notes.txt') && error.message.includes('conversations.json') && !error.message.includes(sample));
});
