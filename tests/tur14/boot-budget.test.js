'use strict';

/*
 * T-190 — Önyükleme bütçesi ve ölçüm çözünürlüğü.
 *
 * Kusur: `tools/package.js --verify` CDP'yi 500 ms'de bir yokluyordu. Ölçüm
 * 500 ms'lik kovaya yuvarlanıyordu, bu yüzden 490–518 ms ile 1102 ms arasındaki
 * fark "iki kat yavaşlama" gibi okunuyordu. 25 ms çözünürlükte gerçek önyükleme
 * 161–324 ms. Bu test sözleşmeyi kilitler:
 *   1) Paket doğrulaması artık 100 ms'de bir yoklar, 500 ms yoklaması kalmadı.
 *   2) Paket doğrulamasında önyükleme bütçesi var ve aşımı hata üretir.
 *   3) Kalıcı kapı `boot-budget` var: ısınmış ortanca/en kötü + soğuk sınırı.
 *   4) Eşikler ölçümle uyumlu: ortanca 800 ms, en kötü 2000 ms, soğuk 3000 ms.
 *   5) Kapı kova etkisini belgeliyor (25 ms yoklama, 500 ms tuzağı yazılı).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('../lib');

const pkg = read(path.join(ROOT, 'tools', 'package.js'));
const gatePath = path.join(ROOT, 'tools', 'verify', 'boot-budget.js');
const gate = fs.readFileSync(gatePath, 'utf8');

test('boot 1: paket doğrulaması 100 ms yoklar, 500 ms tuzağı kalktı', () => {
  assert.match(pkg, /const POLL_MS = 100;/, 'yoklama aralığı 100 ms değil');
  assert.match(pkg, /await new Promise\(\(r\) => setTimeout\(r, POLL_MS\)\)/, 'POLL_MS kullanılmıyor');
  assert.doesNotMatch(pkg, /setTimeout\(r, 500\)/, 'eski 500 ms yoklaması hâlâ var');
});

test('boot 2: paket doğrulaması bütçeyi aşınca hata verir', () => {
  assert.match(pkg, /const BOOT_BUDGET_MS = 3000;/, 'bütçe sabiti yok');
  assert.match(pkg, /if \(elapsedMs > BOOT_BUDGET_MS\) \{/, 'bütçe denetlenmiyor');
  assert.match(pkg, /throw new Error\(`boot budget exceeded/, 'aşım hata üretmiyor');
  assert.match(pkg, /budgetMs: BOOT_BUDGET_MS/, 'bütçe raporda görünmüyor');
});

test('boot 3: kalıcı kapı 25 ms yoklar ve koşuları raporlar', () => {
  assert.match(gate, /const POLL_MS = 25;/, 'kapı 25 ms yoklamıyor');
  assert.match(gate, /WARM_RUNS \+ 1/, 'soğuk + ısınmış koşu ayrımı yok');
  assert.match(gate, /ONYUKLEME BUTCESI: GECTI/, 'kapı sonucu yazmıyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
});

test('boot 4: eşikler ölçümle uyumlu', () => {
  assert.match(gate, /const WARM_MEDIAN_MS = 800;/, 'ısınmış ortanca eşiği yok');
  assert.match(gate, /const WARM_MAX_MS = 2000;/, 'ısınmış en kötü eşiği yok');
  assert.match(gate, /const COLD_MAX_MS = 3000;/, 'soğuk eşiği yok');
  assert.match(gate, /median\(warm\) <= WARM_MEDIAN_MS/, 'ortanca denetlenmiyor');
  assert.match(gate, /Math\.max\(\.\.\.warm\) <= WARM_MAX_MS/, 'en kötü koşu denetlenmiyor');
  assert.match(gate, /cold <= COLD_MAX_MS/, 'soğuk koşu denetlenmiyor');
});

test('boot 5: kova tuzağı yazılı ve paket hedefi doğru seçilir', () => {
  assert.match(gate, /500 ms'lik kovalara yuvarlanıyordu/, 'kova tuzağı belgelenmemiş');
  assert.match(gate, /fs\.existsSync\(EXE\) \? 'exe' : 'src'/, 'paket exe tercih edilmiyor');
  assert.match(gate, /dist', 'Keyvotion Console', 'Keyvotion Console\.exe'/, 'exe yolu yanlış');
});
