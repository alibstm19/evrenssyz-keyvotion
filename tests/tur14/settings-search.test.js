'use strict';

/*
 * T-176 — Ayarlarda arama.
 *
 * Ayarlar 8 karta dağılmış durumda; "tema nerede?" sorusunun cevabı kaydırmak
 * değil yazmak olmalı. Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) Arama alanı erişilebilir ad taşır, sayaç ve boş-sonuç mesajı vardır.
 *   2) Süzgeç kartları gizler/açar ve Türkçe harfleri doğru katlar (İ/I).
 *   3) Esc aramayı temizler; bölüm çipine gitmek aramayı sıfırlar.
 *   4) Gerçek uygulama kapısı (`tools/verify/settings-search.js`) 8 bölümü ölçer.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const css = read(path.join(RENDERER, 'styles', 'tur5.css'));

test('settings search 1: alan, sayaç ve boş-sonuç mesajı var', () => {
  assert.match(html, /data-field="settings-search"/, 'arama alanı yok');
  assert.match(html, /data-field="settings-search"[^>]*aria-label="Ayarlarda ara"|aria-label="Ayarlarda ara"[^>]*data-field="settings-search"/, 'alan etiketsiz');
  assert.match(html, /data-field="settings-search-count"[^>]*aria-live="polite"|aria-live="polite"[^>]*data-field="settings-search-count"/, 'sayaç canlı duyurulmuyor');
  assert.match(html, /data-field="settings-search-empty"/, 'boş-sonuç mesajı yok');
  assert.match(css, /\.kv-settings__search/, 'arama stili yok');
});

test('settings search 2: süzgeç kartları gizler, Türkçe harfleri katlar', () => {
  assert.match(app, /function applySettingsFilter\(query\)/, 'süzgeç yok');
  const start = app.indexOf('function applySettingsFilter(query)');
  const block = app.slice(start, app.indexOf('function renderSettings', start));
  assert.match(block, /querySelectorAll\('\[data-settings-section\]'\)/, 'kartlar seçilmiyor');
  assert.match(block, /card\.hidden = !hit/, 'eşleşmeyen kart gizlenmiyor');
  assert.match(block, /bölüm eşleşti/, 'sayaç metni yok');
  assert.match(block, /emptyEl\.hidden = !q \|\| shown > 0/, 'boş-sonuç gösterimi yanlış');
  assert.match(app, /function foldTr\(value\)/, 'Türkçe katlama yok');
  const fold = app.slice(app.indexOf('function foldTr(value)'), app.indexOf('function applySettingsFilter'));
  assert.match(fold, /replace\(\/İ\/g, 'i'\)/, 'İ katlanmıyor');
  assert.match(fold, /replace\(\/I\/g, 'ı'\)/, 'I katlanmıyor');
});

test('settings search 3: Esc temizler, çipe gitmek aramayı sıfırlar', () => {
  assert.match(app, /settingsSearch\.addEventListener\('input'/, 'girdi dinlenmiyor');
  assert.match(app, /settingsSearch\.addEventListener\('keydown'/, 'klavye dinlenmiyor');
  const start = app.indexOf("settingsSearch.addEventListener('keydown'");
  const block = app.slice(start, start + 400);
  assert.match(block, /e\.key === 'Escape'/, 'Esc yakalanmıyor');
  assert.match(block, /applySettingsFilter\(''\)/, 'Esc aramayı temizlemiyor');
  const jump = app.indexOf("const jump = e.target.closest('[data-settings-jump]')");
  const jumpBlock = app.slice(jump, jump + 500);
  assert.match(jumpBlock, /applySettingsFilter\(''\)/, 'çip aramayı sıfırlamıyor');
});

test('settings search 4: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'settings-search.js'), 'utf8');
  assert.match(gate, /settings-search/, 'kapı arama alanını aramıyor');
  assert.match(gate, /before\.sections === 8/, 'kapı 8 bölümü zorlamıyor');
  assert.match(gate, /AYAR ARAMA: GECTI/, 'kapı sonucu yazmıyor');
});
