'use strict';

/*
 * T-181 — Durum çubuğundaki sürüm etiketi paket sürümünü söyler.
 *
 * Etiket elle yazılmıştı ve eski bir sürümde kalmıştı; ürün 3.2.0. Bu test sözleşmeyi
 * kilitler:
 *   1) `APP_VERSION_LABEL` tek sabittir ve `src/package.json` sürümüyle aynıdır.
 *   2) HTML'deki ilk değer de aynı sürümü taşır (JS gelmeden yanlış yazmaz).
 *   3) `syncStatus` canlı `appVersion` varsa onu, yoksa sabiti yazar; sabit
 *      sürüm koda gömülü ikinci bir yerde tekrar etmez.
 *   4) Gerçek uygulama kapısı (`tools/verify/version-label.js`) vardır.
 *
 * Sürüm yükseltildiğinde bu test bilerek kırmızıya döner: etiket unutulmaz.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const pkg = JSON.parse(read(path.join(SRC, 'package.json')));

test('version 1: sabit paket sürümüyle aynı', () => {
  assert.match(typeof pkg.version === 'string' ? pkg.version : '', /^\d+\.\d+\.\d+$/, 'paket sürümü okunamadı');
  const m = app.match(/const APP_VERSION_LABEL = 'v(\d+\.\d+\.\d+)';/);
  assert.ok(m, 'APP_VERSION_LABEL sabiti yok');
  assert.strictEqual(m[1], pkg.version, `etiket v${m[1]}, paket ${pkg.version} — sürüm yükseltmesinde etiket unutulmuş`);
});

test('version 2: HTML ilk değeri aynı sürüm', () => {
  const m = html.match(/data-field="status-version">v(\d+\.\d+\.\d+)</);
  assert.ok(m, 'durum çubuğu sürüm alanı yok');
  assert.strictEqual(m[1], pkg.version, `HTML v${m[1]}, paket ${pkg.version}`);
});

test('version 3: syncStatus canlı değeri tercih eder, sabit tek yerde', () => {
  const start = app.indexOf('function syncStatus()');
  const block = app.slice(start, app.indexOf('\n}', start) + 2);
  assert.match(block, /store\.admin && store\.admin\.info && store\.admin\.info\.appVersion/, 'canlı sürüm okunmuyor');
  assert.match(block, /APP_VERSION_LABEL/, 'sabit kullanılmıyor');
  assert.doesNotMatch(block, /'v\d+\.\d+\.\d+'/, 'sürüm koda gömülü');
  const occurrences = (app.match(/v\d+\.\d+\.\d+/g) || []);
  assert.strictEqual(occurrences.length, 1, `app.js içinde ${occurrences.length} sürüm sabiti var (tek olmalı)`);
});

test('version 4: eski yanlış etiket kalmadı', () => {
  assert.doesNotMatch(app, /v0\.2\.0/, 'app.js hâlâ v0.2.0 yazıyor');
  assert.doesNotMatch(html, /v0\.2\.0/, 'index.html hâlâ v0.2.0 yazıyor');
});

test('version 5: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'version-label.js'), 'utf8');
  assert.match(gate, /status-version/, 'kapı etiketi okumuyor');
  assert.match(gate, /package\.json/, 'kapı paket sürümünü okumuyor');
  assert.match(gate, /SURUM ETIKETI: GECTI/, 'kapı sonucu yazmıyor');
});
