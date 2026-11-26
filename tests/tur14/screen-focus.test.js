'use strict';

/*
 * T-178 — Ekran değişiminde odak ve duyuru.
 *
 * Fare kullanmayan kullanıcı ekran değiştirdiğinde odağın nerede olduğunu ve
 * ne açıldığını bilmeli. Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) Ekran başlığı programatik odak alabilir (`tabindex="-1"`).
 *   2) Görünmez canlı bölge ekran adını duyurur (`aria-live="polite"`).
 *   3) `go()` yalnız gerçekten ekran değiştiğinde odağı taşır (ilk açılışta
 *      ve aynı ekrana gidişte sıçrama yok).
 *   4) Görsel gizleme sınıfı ekran okuyucudan saklamaz (`clip`, 1px).
 *   5) Gerçek uygulama kapısı (`tools/verify/screen-focus.js`) vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const css = read(path.join(RENDERER, 'styles', 'tur14.css'));

test('focus 1: başlık odaklanabilir, canlı bölge var', () => {
  assert.match(html, /data-screen-title[^>]*tabindex="-1"|tabindex="-1"[^>]*data-screen-title/, 'başlık odaklanamıyor');
  assert.match(html, /data-field="screen-live"[^>]*aria-live="polite"|aria-live="polite"[^>]*data-field="screen-live"/, 'canlı bölge yok');
  assert.match(css, /\.kv-sr-only/, 'gizleme sınıfı yok');
  const block = css.slice(css.indexOf('.kv-sr-only'), css.indexOf('}', css.indexOf('.kv-sr-only')));
  assert.match(block, /clip: rect\(0 0 0 0\)/, 'görsel gizleme eksik');
  assert.match(block, /width: 1px/, 'görsel gizleme eksik');
});

test('focus 2: go() değişimde odağı taşır ve duyurur', () => {
  assert.match(app, /function announceScreen\(title\)/, 'duyuru fonksiyonu yok');
  assert.match(app, /`\$\{title\} ekranı açıldı`/, 'duyuru metni yok');
  const start = app.indexOf('function go(screen)');
  const block = app.slice(start, app.indexOf('/* ================= GEZGİN', start));
  assert.match(block, /const changed = store\.screen !== screen/, 'değişim ölçülmüyor');
  assert.match(block, /if \(changed\) \{/, 'değişimde odak taşınmıyor');
  assert.match(block, /t\.focus\(\{ preventScroll: true \}\)/, 'odak başlığa gitmiyor');
  assert.match(block, /announceScreen\(SCREEN_META\[screen\]\.title\)/, 'duyuru çağrılmıyor');
});

test('focus 3: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'screen-focus.js'), 'utf8');
  assert.match(gate, /screen-live/, 'kapı duyuruyu okumuyor');
  assert.match(gate, /ctrlKey: true/, 'kapı klavye kısayolunu ölçmüyor');
  assert.match(gate, /EKRAN ODAGI: GECTI/, 'kapı sonucu yazmıyor');
});
