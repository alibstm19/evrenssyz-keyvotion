'use strict';

/*
 * T-192 — Kapıların CDP portu işletim sistemi tarafından atanır.
 *
 * Kusur: canlı kapıların hepsi sabit port (9479–9590) kullanıyordu. Sabit port
 * iki şekilde rastgele kırmızı üretir:
 *   1. Portu başka bir süreç tutuyorsa Chromium bağlanamaz.
 *   2. Windows ayrılmış aralıkları (Hyper-V/WinNAT) o portu kapsayabilir.
 * T-191 turunda önyükleme kapısı bu yüzden bir kez KALDI verdi.
 *
 * Bu test kilidi:
 *   1) `tools/verify/lib/cdp.js` var; `listen(0)` ile OS ataması yapıyor.
 *   2) Hiçbir kapıda `--remote-debugging-port=<sabit sayı>` yok.
 *   3) Hiçbir kapıda `process.env.X || 9xxx` sabit yedek portu yok.
 *   4) Electron açan her kapı `PORT`u spawn'dan ÖNCE `await` ile atıyor.
 *   5) `tools/package.js` de sabit port kullanmıyor.
 *   6) Belgede listelenen her canlı kapı dosyası gerçekten var.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('../lib');

const VERIFY = path.join(ROOT, 'tools', 'verify');
const gates = fs.readdirSync(VERIFY).filter((f) => f.endsWith('.js'));
const gateSource = (f) => read(path.join(VERIFY, f));

test('gate ports 1: lib/cdp.js OS atamasıyla boş port verir', () => {
  const lib = read(path.join(VERIFY, 'lib', 'cdp.js'));
  assert.match(lib, /function freePort\(\)/, 'freePort yok');
  assert.match(lib, /port: 0/, 'port 0 ile OS ataması istenmiyor');
  assert.match(lib, /module\.exports = \{ freePort, getJson, resolvePort \}/, 'dışa aktarım eksik');
  assert.match(lib, /function resolvePort\(/, 'resolvePort yok');
});

test('gate ports 2: hiçbir kapıda sabit hata ayıklama portu yok', () => {
  const bad = [];
  for (const f of gates) {
    const src = gateSource(f);
    for (const m of src.matchAll(/--remote-debugging-port=(\$\{[^}]*\}|\d+)/g)) {
      if (/^\d+$/.test(m[1])) bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `sabit port kalmış:\n${bad.join('\n')}`);
});

test('gate ports 3: sabit yedek port (`|| 9xxx`) yok', () => {
  const bad = [];
  for (const f of gates) {
    const src = gateSource(f);
    for (const m of src.matchAll(/process\.env\.[A-Z0-9_]+\s*\|\|\s*\d{4}/g)) {
      bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `sabit yedek port kalmış:\n${bad.join('\n')}`);
});

test('gate ports 4: Electron açan kapı portu await ile alıyor', () => {
  let live = 0;
  const bad = [];
  for (const f of gates) {
    const src = gateSource(f);
    if (!/--remote-debugging-port=/.test(src)) continue;
    live += 1;
    if (/let PORT = 0;/.test(src)) {
      /* Modül düzeyi PORT: spawn'dan önce `PORT = await ...` atanmalı. */
      const spawnAt = src.indexOf('spawn(');
      assert.ok(spawnAt > 0, `${f}: spawn yok`);
      if (!/PORT\s*=\s*await\s+(freePort|resolvePort)\(/.test(src.slice(0, spawnAt))) {
        bad.push(`${f}: PORT await ataması spawn'dan önce değil`);
      }
    } else if (!/await\s+freePort\(\)/.test(src)) {
      /* Portu yardımcıya geçiren kapılar (launch(await freePort(), ...)). */
      bad.push(`${f}: OS portu istenmiyor`);
    }
  }
  assert.ok(live >= 25, `canlı kapı sayısı beklenenden az: ${live}`);
  assert.deepEqual(bad, [], `port ataması eksik:\n${bad.join('\n')}`);
});

test('gate ports 5: paketleyici de sabit port kullanmıyor', () => {
  const pkg = read(path.join(ROOT, 'tools', 'package.js'));
  assert.doesNotMatch(pkg, /const CDP_PORT = Number\(process\.env\.KV_CDP_PORT \|\| \d+\)/,
    'paketleyicide sabit port duruyor');
  assert.match(pkg, /const \{ freePort \} = require\('\.\/verify\/lib\/cdp'\)/, 'paketleyici freePort almıyor');
  assert.match(pkg, /await freePort\(\)/, 'paketleyici OS portu istemiyor');
  assert.match(pkg, /--remote-debugging-port=\$\{port\}/, 'paketleyici portu değişkenden vermiyor');
});

test('gate ports 6: belgede listelenen canlı kapılar diskte var', () => {
  const doc = read(path.join(ROOT, 'docs', 'release.md'));
  const named = [...new Set([...doc.matchAll(/node tools\/verify\/([a-z0-9-]+\.js)/g)].map((m) => m[1]))];
  assert.ok(named.length >= 25, `belgede kapı listesi kısa: ${named.length}`);
  const missing = named.filter((f) => !fs.existsSync(path.join(VERIFY, f)));
  assert.deepEqual(missing, [], `belgede olup diskte olmayan kapı: ${missing.join(', ')}`);
});
