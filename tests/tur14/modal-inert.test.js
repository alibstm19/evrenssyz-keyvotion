'use strict';

/*
 * T-184 — Modal açıkken arka plan erişilemezdir.
 *
 * Tab tuzağı yalnız klavyeyi kapsıyordu; ekran okuyucu sanal imleci ve fare
 * arkadaki düğmelere ulaşabiliyordu. Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) Tek yardımcı (`setAppInert`) `.kv-app` çocuklarını `inert` yapar, modal /
 *      bildirim / çökme katmanlarını dışarıda bırakır ve kapatınca temizler.
 *   2) `modal()` inert'i diyaloğu kurmadan ÖNCE uygular.
 *   3) `closeModal()` inert'i odak geri verilmeden ÖNCE kaldırır (odak inert
 *      alt ağaca düşmesin).
 *   4) Diyalog erişilebilirlik sözleşmesi (role/aria-modal/Tab tuzağı) korunur.
 *   5) Gerçek uygulamada ölçen canlı kapı vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));

const blockOf = (name, size = 900) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} yok`);
  return app.slice(start, start + size);
};

test('inert 1: yardımcı yalnız kabuk katmanlarını kilitler', () => {
  const block = blockOf('setAppInert');
  assert.match(block, /\[\.\.\.app\.children\]/, 'kabuk çocukları gezilmiyor');
  assert.match(block, /setAttribute\('inert', ''\)/, 'inert uygulanmıyor');
  assert.match(block, /removeAttribute\('inert'\)/, 'inert kaldırılmıyor');
  assert.match(app, /const MODAL_LAYERS = '\[data-modal-root\],\[data-onboard\],\[data-toast-root\],\[data-crash-root\]'/, 'muaf katman listesi eksik');
  assert.match(block, /node\.matches\(MODAL_LAYERS\)/, 'muaf katman filtresi yok');
});

test('inert 2: modal inert uygular, kapanış sırayı korur', () => {
  const open = blockOf('modal');
  const inertAt = open.indexOf('setAppInert(true)');
  const buildAt = open.indexOf('root.replaceChildren()');
  assert.ok(inertAt > 0, 'modal inert uygulamıyor');
  assert.ok(buildAt > inertAt, 'inert diyalog kurulmadan önce uygulanmalı');

  const close = blockOf('closeModal');
  const releaseAt = close.indexOf('setAppInert(false)');
  const focusAt = close.indexOf('back.focus()');
  assert.ok(releaseAt > 0, 'closeModal inert kaldırmıyor');
  assert.ok(focusAt > releaseAt, 'önce inert kalkmalı, sonra odak dönmeli');
});

test('inert 3: diyalog erişilebilirlik sözleşmesi korunur', () => {
  const open = blockOf('modal', 2200);
  assert.match(open, /role: 'dialog'/, 'role=dialog yok');
  assert.match(open, /'aria-modal': 'true'/, 'aria-modal yok');
  assert.match(open, /'aria-labelledby': titleId/, 'başlık bağı yok');
  assert.match(open, /if \(e\.key !== 'Tab'\) return/, 'Tab tuzağı yok');
  assert.match(open, /if \(first\) first\.focus\(\)/, 'açılış odağı yok');
});

test('inert 4: muaf katmanlar gerçekten kabuk içinde', () => {
  const html = read(path.join(RENDERER, 'index.html'));
  const appAt = html.indexOf('class="kv-app"');
  assert.ok(appAt > 0, 'kv-app yok');
  for (const marker of ['data-modal-root', 'data-toast-root', 'data-crash-root']) {
    assert.ok(html.indexOf(marker) > appAt, `${marker} kv-app dışında`);
  }
});

test('inert 5: canlı kapı var ve gerçek uygulamayı ölçer', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'modal-inert.js'), 'utf8');
  assert.match(gate, /inert/, 'kapı inert ölçmüyor');
  assert.match(gate, /MODAL INERT: GECTI/, 'kapı sonuç yazmıyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
});
