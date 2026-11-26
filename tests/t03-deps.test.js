'use strict';

// T3 — package.json'da electron DIŞINDA bağımlılık yok (emir T-015 zorunlu başlık 3)
// K1 §2.4: dependencies boş; devDependencies yalnız electron (sabitlenmiş 45.2.1).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read, readIfExists } = require('./lib');

const pkgPath = path.join(SRC, 'package.json');
const lockPath = path.join(SRC, 'package-lock.json');

test('T3: src/package.json — dependencies yok, devDependencies yalnız electron@45.2.1', () => {
  const pkg = JSON.parse(read(pkgPath));

  const deps = Object.keys(pkg.dependencies || {});
  assert.deepStrictEqual(deps, [], `dependencies dolu olmamalıydı: ${deps.join(', ')}`);

  const devDeps = Object.keys(pkg.devDependencies || {});
  assert.deepStrictEqual(devDeps, ['electron'], `devDependencies yalnız electron olmalı: ${devDeps.join(', ')}`);
  assert.strictEqual(pkg.devDependencies.electron, '45.2.1', 'electron sürümü K1 §2.4 gereği sabitlenmiş olmalı');
});

test('T3b: package-lock.json — kök kayıtta electron dışında doğrudan bağımlılık yok', () => {
  const lockRaw = readIfExists(lockPath);
  assert.ok(lockRaw, 'package-lock.json bulunamadı (OPS T-013 teslimi)');

  const lock = JSON.parse(lockRaw);
  const rootEntry = lock.packages && lock.packages[''];
  assert.ok(rootEntry, "lock dosyasında kök packages[''] kaydı yok");

  const rootDeps = Object.keys(rootEntry.dependencies || {});
  const rootDevDeps = Object.keys(rootEntry.devDependencies || {});
  assert.deepStrictEqual(rootDeps, [], `lock kök dependencies dolu: ${rootDeps.join(', ')}`);
  assert.deepStrictEqual(rootDevDeps, ['electron'], `lock kök devDependencies yalnız electron olmalı: ${rootDevDeps.join(', ')}`);
});
