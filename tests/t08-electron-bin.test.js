'use strict';

// T8 — electron binary mevcut ve --version → 45.2.1 (emir T-015 zorunlu başlık 8)
// K1 §2.4: sürüm package.json'da sabitlenir; OPS T-013 kurulumunun kanıtı.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { ELECTRON_EXE } = require('./lib');

test('T8: src/node_modules/electron/dist/electron.exe mevcut ve sürüm 45.2.1', () => {
  assert.ok(fs.existsSync(ELECTRON_EXE), `electron binary bulunamadı: ${ELECTRON_EXE} (OPS T-013)`);

  const res = spawnSync(ELECTRON_EXE, ['--version'], { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(res.status, 0, `electron --version başarısız: ${res.stderr || '(stderr boş)'}`);

  const out = `${res.stdout || ''}${res.stderr || ''}`;
  assert.match(
    out,
    /v?45\.2\.1/,
    `sürüm 45.2.1 beklenirdi, çıktı: ${out.trim() || '(boş)'} — package.json ile binary sürümü ayrışıyor`
  );
});
