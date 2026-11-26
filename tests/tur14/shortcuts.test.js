'use strict';

/*
 * T-179 — Klavye kısayolları tek kaynaktan.
 *
 * Kısayol sayfası gerçek dinleyiciden kopmuştu: Ctrl+1'i "Ekip" diye yazıyor,
 * Ctrl+1…Ctrl+6 diyordu ama dokuz ekran kısayolu var. Bu test sözleşmeyi
 * kaynak düzeyinde kilitler:
 *   1) Ekran kısayolları tek bir `SCREEN_SHORTCUTS` tablosunda tanımlıdır.
 *   2) Klavye dinleyicisi bu tabloyu kullanır (ikinci bir harita yok).
 *   3) Kısayol sayfası satırlarını bu tablodan üretir; her satır ekranın
 *      gerçek başlığını (SCREEN_META) taşır.
 *   4) Komut paletindeki ekran kısayolları da bu tablodan türetilir.
 *   5) Gerçek uygulama kapısı (`tools/verify/shortcuts.js`) vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));

test('shortcuts 1: tek kaynak dokuz ekranı kapsar', () => {
  assert.match(app, /const SCREEN_SHORTCUTS = Object\.freeze\(\{/, 'tek kaynak tablo yok');
  const start = app.indexOf('const SCREEN_SHORTCUTS = Object.freeze({');
  const block = app.slice(start, app.indexOf('});', start));
  const pairs = [...block.matchAll(/(\d):\s*'([a-z]+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepStrictEqual(pairs, [
    ['1', 'chat'], ['2', 'team'], ['3', 'command'], ['4', 'board'], ['5', 'memory'],
    ['6', 'projects'], ['7', 'models'], ['8', 'providers'], ['9', 'browser'],
  ], 'kısayol tablosu beklenenden farklı');
  assert.match(app, /function shortcutLabel\(screen\)/, 'etiket üreticisi yok');
});

test('shortcuts 2: dinleyici tabloyu kullanır, ikinci harita yok', () => {
  const start = app.indexOf('/* klavye kısayolları */');
  const block = app.slice(start, app.indexOf('function bindEvents', start) > start ? app.indexOf('function bindEvents', start) : start + 6000);
  assert.match(block, /SCREEN_SHORTCUTS\[e\.key\]/, 'dinleyici tabloyu kullanmıyor');
  assert.doesNotMatch(block, /1: 'chat'/, 'dinleyicide ikinci harita var');
  assert.match(block, /go\(SCREEN_SHORTCUTS\[e\.key\]\)/, 'kısayol ekran açmıyor');
});

test('shortcuts 3: sayfa satırları tablodan üretilir', () => {
  const start = app.indexOf('function openShortcuts()');
  const block = app.slice(start, app.indexOf('function confirmSend', start));
  assert.match(block, /Object\.entries\(SCREEN_SHORTCUTS\)/, 'sayfa tablodan üretilmiyor');
  assert.match(block, /SCREEN_META\[screen\]\.title/, 'satır ekran başlığını kullanmıyor');
  assert.match(block, /`Ctrl\+\$\{num\}`/, 'tuş etiketi üretilmiyor');
  assert.doesNotMatch(block, /Ctrl\+1 … Ctrl\+6/, 'eski yanlış satır duruyor');
  assert.match(block, /data-field': 'shortcut-list'/, 'sayfa listesi işaretlenmemiş');
});

test('shortcuts 4: palet etiketleri tablodan türetilir', () => {
  const start = app.indexOf('const PALETTE_ITEMS');
  const block = app.slice(start, start + 1600);
  assert.doesNotMatch(block, /key: 'Ctrl [1-9]'/, 'palette elle yazılmış kısayol var');
  for (const screen of ['chat', 'team', 'command', 'board', 'memory', 'projects', 'models', 'providers', 'browser']) {
    assert.match(block, new RegExp(`key: shortcutLabel\\('${screen}'\\)`), `palet ${screen} etiketsiz`);
  }
});

test('shortcuts 5: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'shortcuts.js'), 'utf8');
  assert.match(gate, /shortcut-list/, 'kapı sayfayı okumuyor');
  assert.match(gate, /ctrlKey: true/, 'kapı gerçek kısayolu ölçmüyor');
  assert.match(gate, /KISAYOLLAR: GECTI/, 'kapı sonucu yazmıyor');
});
