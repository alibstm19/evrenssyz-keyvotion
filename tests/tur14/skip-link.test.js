'use strict';

/*
 * T-180 — "İçeriğe atla" bağlantısı.
 *
 * Menü 23 ekran düğmesi taşır. Klavye kullanıcısı içeriğe geçmek için her
 * seferinde hepsini sekmeyle geçmemeli. Bu test sözleşmeyi kilitler:
 *   1) Atlama bağlantısı gövdenin ilk odağıdır ve hedefi `#kv-main`.
 *   2) Hedef `main` programatik odak alabilir (`tabindex="-1"`).
 *   3) Tıklama/Enter içeriğe odak taşır (varsayılan çapa zıplaması yok).
 *   4) Bağlantı yalnız odaklanınca görünür (gizliyken ekranı kapatmaz).
 *   5) Gerçek uygulama kapısı (`tools/verify/skip-link.js`) vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const css = read(path.join(RENDERER, 'styles', 'tur14.css'));

test('skip 1: bağlantı ilk odak, hedef main', () => {
  const bodyAt = html.indexOf('<body>');
  const linkAt = html.indexOf('data-field="skip-link"');
  const appAt = html.indexOf('<div class="kv-app"');
  assert.ok(bodyAt >= 0 && linkAt > bodyAt, 'bağlantı gövdede değil');
  assert.ok(linkAt < appAt, 'bağlantı ilk odak değil (uygulama kabından sonra)');
  assert.match(html, /<a class="kv-skip" href="#kv-main" data-field="skip-link">İçeriğe atla<\/a>/, 'bağlantı metni/hedefi yanlış');
  assert.match(html, /<main class="kv-main" data-main id="kv-main" tabindex="-1">/, 'main odaklanamıyor');
});

test('skip 2: içeriğe odak taşınır', () => {
  const start = app.indexOf("const skipEl = e.target.closest('[data-field=\"skip-link\"]')");
  assert.ok(start > 0, 'atlama tıklaması dinlenmiyor');
  const block = app.slice(start, start + 320);
  assert.match(block, /e\.preventDefault\(\)/, 'varsayılan çapa zıplaması engellenmiyor');
  assert.match(block, /main\.focus\(\)/, 'içerik odaklanmıyor');
  assert.match(block, /\$\('\[data-main\]'\)/, 'hedef main seçilmiyor');
});

test('skip 3: yalnız odaklanınca görünür', () => {
  assert.match(css, /\.kv-skip \{/, 'atlama stili yok');
  const block = css.slice(css.indexOf('.kv-skip {'), css.indexOf('.kv-skip:focus'));
  assert.match(block, /position: fixed/, 'bağlantı akıştan çıkarılmamış');
  assert.match(block, /top: -60px/, 'bağlantı başlangıçta gizli değil');
  assert.match(css, /\.kv-skip:focus,\n\.kv-skip:focus-visible \{\n  top: var\(--kv-space-3\)/, 'odakta görünmüyor');
});

test('skip 4: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'skip-link.js'), 'utf8');
  assert.match(gate, /skip-link/, 'kapı bağlantıyı aramıyor');
  assert.match(gate, /kv-main/, 'kapı hedefi ölçmüyor');
  assert.match(gate, /ICERIGE ATLA: GECTI/, 'kapı sonucu yazmıyor');
});
