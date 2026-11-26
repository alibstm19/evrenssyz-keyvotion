'use strict';

/*
 * T-168 — "Düşünüyor" göstergesi ve canlı süre sayacı.
 *
 * Kullanıcı isteği: "düşünme sembolleri zaman falan koy." Üç yerde model
 * yanıtı beklenir (sohbet, lider masası, sağ panel). Üçü de aynı sözleşmeyi
 * taşımalı:
 *   1) Dönen glif (hareket azaltma tercihinde durur).
 *   2) Canlı süre sayacı — `<span data-think-clock>` ve başlangıç damgası.
 *   3) Sayaç iş bitince kendiliğinden durur (düğüm kalkınca interval temizlenir).
 *   4) Üç giriş noktası da başlangıç damgasını yazar.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const tur6 = read(path.join(RENDERER, 'tur6.js'));
const tur8 = read(path.join(RENDERER, 'tur8.js'));
const css = read(path.join(RENDERER, 'styles', 'tur14.css'));

test('think 1: sohbet balonunda glif, etiket ve canlı süre var', () => {
  assert.match(app, /function thinkClockEnsure/, 'sayaç fonksiyonu yok');
  assert.match(app, /data-think-clock/, 'sayaç düğümü yok');
  assert.match(app, /data-think-start/, 'başlangıç damgası yok');
  assert.match(app, /thinkRow\('düşünüyor…'\)/, 'sohbet balonuna düşünme satırı eklenmiyor');
  assert.match(app, /store\.chat\.startedAt = Date\.now\(\)/, 'sohbet başlangıcı yazılmıyor');
  assert.match(app, /store\.chat\.startedAt = 0/, 'sohbet bitince damga sıfırlanmıyor');
});

test('think 2: lider masası ve sağ panel aynı sözleşmeyi kullanıyor', () => {
  for (const [name, text, stamp] of [
    ['lider masası', tur6, /t6\.desk\.startedAt = Date\.now\(\)/],
    ['sağ panel', tur8, /t8\.conv\.startedAt = Date\.now\(\)/]
  ]) {
    assert.match(text, /data-think-clock/, `${name}: sayaç düğümü yok`);
    assert.match(text, /data-think-start/, `${name}: başlangıç damgası yok`);
    assert.match(text, /kv-think__glyph/, `${name}: dönen glif yok`);
    assert.match(text, stamp, `${name}: başlangıç yazılmıyor`);
  }
  /* Sağ panel gönderimi bitince damga temizlenmeli. */
  assert.match(tur8, /t8\.conv\.startedAt = 0/, 'sağ panel bitince damga sıfırlanmıyor');
});

test('think 3: sayaç saniye/dakika biçiminde ve iş bitince duruyor', () => {
  assert.match(app, /\$\{secs\} sn/, 'saniye biçimi yok');
  assert.match(app, /Math\.floor\(secs \/ 60\)/, 'dakika biçimi yok');
  assert.match(app, /querySelectorAll\('\[data-think-clock\]'\)/, 'sayaç düğümleri toplanmıyor');
  assert.match(app, /clearInterval\(thinkClock\)/, 'sayaç kendini durdurmuyor');
  assert.match(app, /thinkClock = null/, 'sayaç durumu sıfırlanmıyor');
});

test('think 4: glif animasyonu var, hareket azaltmada durur', () => {
  assert.match(css, /\.kv-think__glyph[\s\S]*?animation: kv-think-spin/, 'glif animasyonu yok');
  assert.match(css, /@keyframes kv-think-spin/, 'keyframes yok');
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.kv-think__glyph \{ animation: none; \}/,
    'hareket azaltma tercihi yok sayılıyor');
  assert.match(css, /font-variant-numeric: tabular-nums/, 'süre rakamları hizalı değil (zıplama)');
});
