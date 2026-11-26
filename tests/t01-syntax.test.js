'use strict';

// T1 — `node --check` tüm .js dosyaları geçer (emir T-015 zorunlu başlık 1)

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { SRC, walk, isJs } = require('./lib');

test('T1: node --check — src/ altındaki tüm .js dosyaları sözdizimi denetiminden geçer', () => {
  const files = walk(SRC, isJs);
  assert.ok(
    files.length >= 4,
    `en az 4 kaynak dosya beklenirdi (main, client, preload, app); bulunan: ${files.length}`
  );

  const failed = [];
  for (const file of files) {
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (res.status !== 0) {
      const firstLine = (res.stderr || '').split(/\r?\n/).find((l) => l.trim().length > 0) || '(boş stderr)';
      failed.push(`${file}\n    ${firstLine}`);
    }
  }

  assert.strictEqual(
    failed.length,
    0,
    `sözdizimi hatası (${failed.length} dosya):\n  - ${failed.join('\n  - ')}`
  );
});
