'use strict';

/*
 * T-164 — paket sözleşmesi ve tazelik kapısı.
 *
 * `tools/package.js` pakete hangi dizinleri koyar, `package.json`'ı neden
 * yeniden yazar, ve `tools/verify/package-freshness.js` bu sözleşmeye göre
 * karşılaştırma yapıyor mu? dist/ depoda olmadığı için kapı burada
 * çalıştırılmaz; sözleşme kaynak düzeyinde kilitlenir.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SRC, read } = require('../lib');

const pkgTool = read(path.join(ROOT, 'tools', 'package.js'));
const freshTool = read(path.join(ROOT, 'tools', 'verify', 'package-freshness.js'));

test('package-contract 1: paket yalnız ürün dizinlerini taşır', () => {
  const copyLine = pkgTool.match(/const appFolders = \[([^\]]+)\];/);
  assert.ok(copyLine, 'kopyalama dizin listesi bulunamadı');
  const names = [...copyLine[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['main', 'preload', 'renderer', 'shared', 'assets'],
    'paketlenen dizinler değişmiş: tazelik kapısı güncellenmeli');

  assert.match(pkgTool, /assertPublicFiles\(SRC,/);
  assert.match(pkgTool, /'Kur.cmd', 'install.ps1'/);
  assert.match(pkgTool, /Temiz-Deneme\.cmd/);
  assert.match(pkgTool, /--clean-profile/);

  /* node_modules / tests / tools / docs pakete girmemeli (boyut + sır yüzeyi). */
  for (const excluded of ['node_modules', 'tests', 'tools', 'work']) {
    assert.ok(!names.includes(excluded), `${excluded} pakete girmemeli`);
  }
});

test('package-contract 2: package.json kırpılarak yazılır, devDependencies sızmaz', () => {
  assert.match(pkgTool, /const appPkg = \{/, 'kırpılmış paket tanımı yok');
  const block = pkgTool.slice(pkgTool.indexOf('const appPkg'), pkgTool.indexOf('fs.writeFileSync(path.join(appDir, \'package.json\')'));
  assert.match(block, /main: 'main\/main\.js'/);
  assert.match(block, /version: VERSION/);
  assert.ok(!block.includes('devDependencies'), 'devDependencies pakete yazılmamalı');
  assert.ok(!block.includes('dependencies'), 'dependencies pakete yazılmamalı (tek bağımlılık Electron runtime)');
});

test('package-contract 3: tazelik kapısı aynı sözleşmeyi kullanır', () => {
  assert.match(freshTool, /const SHIPPED = new Set\(\['main', 'preload', 'renderer', 'shared', 'assets'\]\)/,
    'kapı paketlenen dizin listesini bilmeli');
  assert.match(freshTool, /sha256|createHash/, 'karşılaştırma içerik özetiyle yapılmalı');
  assert.match(freshTool, /zipOlderThanSrc/, 'ZIP tarihi de karşılaştırılmalı');
  assert.match(freshTool, /process\.exit\(2\)/, 'dist yokken kapı atlanmalı (exit 2)');
  assert.match(freshTool, /resources.*app/, 'paket içi uygulama dizini okunmalı');
});

test('package-contract 4: kapı dist varken gerçekten koşuyor', (t) => {
  const appDir = path.join(ROOT, 'dist', 'Keyvotion Console', 'resources', 'app');
  if (!fs.existsSync(appDir)) {
    t.skip('dist yok — kapı yalnız paket üretildikten sonra koşar');
    return;
  }
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'verify', 'package-freshness.js')], {
    cwd: ROOT, encoding: 'utf8'
  });
  assert.match(out, /PAKET TAZELIGI: GECTI/);
  const report = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  assert.deepStrictEqual(report.missingFromPackage, [], 'pakette eksik dosya var');
  assert.deepStrictEqual(report.differing, [], 'paketteki dosya kaynakla aynı değil');
});
