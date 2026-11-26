'use strict';
/*
 * T-205 — telefon sayfası hata akışı (remote-page.html).
 *
 * Kapı `tools/verify/remote-page.js` içinde yaşar; bu test onu hem güncel
 * sayfaya hem de eski (hatalı) akış örneğine uygular. Negatif kontrol
 * kalıcıdır: eski akış KALMALI, güncel akış GEÇMELİ.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { check, LEGACY, PAGE } = require('../../tools/verify/remote-page');

test('remote-page 1: güncel sayfa hata akışı geçer', () => {
  const fails = check(fs.readFileSync(PAGE, 'utf8'));
  assert.deepEqual(fails, [], `kalan: ${fails.join(' | ')}`);
});

test('remote-page 2: negatif kontrol — eski akış kalır', () => {
  const fails = check(LEGACY);
  assert.ok(fails.length >= 5, `eski akış yalnız ${fails.length} kontrolde kaldı`);
});

test('remote-page 3: sunucu hatası ağ hatasından ayrı anlatılır', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  assert.match(page, /if \(e\.status === 500\) return 'Bilgisayardaki uygulamada bir hata oluştu/);
  assert.match(page, /if \(e\.code === 'E_NETWORK'\)/);
});
