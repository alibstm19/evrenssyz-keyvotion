'use strict';

/*
 * T-168 — Tur bitince beyaz ekran (donma) regresyonu.
 *
 * Kök neden: tur açılırken `<html data-tour="on">` yazılıyordu; tur kökü de
 * `$('[data-tour]')` ile seçiliyordu. Bu seçici <html>'i yakalıyor, "Bitir"
 * çağrısı `root.hidden = true` diyerek BÜTÜN belgeyi gizliyordu → bembeyaz,
 * kilitlenmiş ekran.
 *
 * Bu test o sınıfı kaynak düzeyinde kilitler (tarayıcı gerekmez):
 *   1) Kök yalnız sınıfla seçilir; öznitelik seçicisi kök için kullanılmaz.
 *   2) <html> üzerine turun koyduğu işaret `data-tour` DEĞİLDİR (çakışma yok).
 *   3) `close()` yalnız tur kökünü gizler; documentElement'e dokunmaz.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { RENDERER, read } = require('../lib');

const tour = read(path.join(RENDERER, 'tour.js'));
const html = read(path.join(RENDERER, 'index.html'));

test('tour 1: kök seçici sınıf tabanlı, öznitelik tabanlı değil', () => {
  assert.match(tour, /const ROOT_SEL = '\.kv-tour'/, 'tur kökü sınıfla seçilmeli');
  assert.ok(!/\$\('\[data-tour\]'\)/.test(tour), "tur kökü [data-tour] ile seçilmemeli — <html> ile çakışır");
  /* Kökü bulan tüm çağrılar ROOT_SEL kullanmalı. */
  const rootCalls = tour.split('\n').filter((line) => /const root = /.test(line));
  assert.ok(rootCalls.length >= 3, 'kök aramaları beklenen yerde değil');
  for (const line of rootCalls) {
    assert.match(line, /ROOT_SEL/, `kök araması ROOT_SEL kullanmıyor: ${line.trim()}`);
  }
});

test('tour 2: <html> işareti tur kökü seçicisiyle çakışmaz', () => {
  assert.match(tour, /dataset\.tourActive/, 'açık işareti ayrı bir veri özniteliği olmalı');
  assert.ok(!/dataset\.tour\s*=/.test(tour), '<html> üzerine data-tour yazılmamalı');
  assert.ok(!/removeAttribute\('data-tour'\)/.test(tour), "data-tour kaldırma satırı kalmamalı");
  /* Tur kökü işaretlenmiş sınıfı taşır. */
  assert.match(html, /class="kv-tour"/, 'tur kökü .kv-tour sınıfını taşımalı');
});

test('tour 3: kapatma yalnız tur kökünü gizler', () => {
  const start = tour.indexOf('function close()');
  assert.ok(start > 0, 'close() bulunamadı');
  const block = tour.slice(start, tour.indexOf('function next()', start));
  assert.match(block, /root\.hidden = true/, 'tur kökü gizlenmeli');
  assert.ok(!/documentElement\.hidden/.test(block), 'belge kökü gizlenmemeli');
  assert.ok(!/documentElement\.style/.test(block), 'belge kökü stili değiştirilmemeli');
  assert.ok(!/documentElement\.dataset\.tour\b/.test(block), 'belge kökü data-tour taşımamalı');
});
