'use strict';

/*
 * T-187 — Yazma/uzun eylemler tek uçuşludur (çift tıklama tek iş üretir).
 *
 * Görev başlığı gerçek kusuru söylüyordu: aynı düğmeye iki kez basmak iki emir,
 * iki ayar kaydı, iki yeniden tarama üretiyordu. Bu test sözleşmeyi kaynak
 * düzeyinde kilitler:
 *   1) Tek yardımcı (`runGuardedAction`) kilidi ilk tıkta kurar, ikinci tıkı
 *      yok sayar, `finally` ile her durumda açar.
 *   2) `setBusy` `aria-busy` + `data-busy` yazar, düğmeyi kilitler ve **eski
 *      disabled durumunu** geri getirir.
 *   3) Tüm yazma/uzun eylemler kümede: yenileme, kaydet, gönder, durdur, kurulum.
 *   4) Eylem dağıtıcısı ayrı işlevde; tıklama yolu doğrudan `dispatchAction`'a
 *      gitmiyor (koruma atlanamaz).
 *   5) Kilit görsel/mantıksal olarak ölçülür: canlı kapı vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));

const blockOf = (name, size = 1600) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} yok`);
  return app.slice(start, start + size);
};

test('flight 1: koruma ilk tıkta kurulur, ikinci yok sayılır', () => {
  const block = blockOf('runGuardedAction');
  assert.match(block, /SINGLE_FLIGHT_ACTIONS\.has\(action\)/, 'koruma kümesi kullanılmıyor');
  assert.match(block, /getAttribute\('aria-busy'\) === 'true'\) return/, 'ikinci tık yok sayılmıyor');
  assert.match(block, /setBusy\(actionEl, true\)/, 'kilit kurulmuyor');
  assert.match(block, /finally \{\n\s*setBusy\(actionEl, false\);/, 'kilit finally ile açılmıyor');
});

test('flight 2: setBusy eski disabled durumunu korur', () => {
  const block = blockOf('setBusy');
  assert.match(block, /dataset\.wasDisabled = node\.disabled \? '1' : ''/, 'eski durum saklanmıyor');
  assert.match(block, /setAttribute\('aria-busy', 'true'\)/, 'aria-busy yazılmıyor');
  assert.match(block, /node\.dataset\.wasDisabled !== '1'\) node\.disabled = false/, 'kapalı düğme yanlışlıkla açılıyor');
  assert.match(block, /removeAttribute\('aria-busy'\)/, 'aria-busy temizlenmiyor');
});

test('flight 3: yazma ve uzun eylemler kümede', () => {
  const start = app.indexOf('const SINGLE_FLIGHT_ACTIONS = new Set([');
  assert.ok(start > 0, 'küme yok');
  const block = app.slice(start, app.indexOf(']);', start));
  for (const action of [
    'team-refresh', 'board-refresh', 'reports-refresh', 'nav-reload',
    'settings-save', 'command-send', 'command-interrupt',
    'admin-refresh', 'admin-model-install', 'admin-server-start',
    'integration-invoke', 'mcp-call', 'onboard-save',
  ]) {
    assert.ok(block.includes(`'${action}'`), `${action} korumasız`);
  }
  /* Salt okuma/gezinme kilitlenmemeli: kullanıcı ekran değiştirebilmeli. */
  assert.ok(!block.includes("'go-settings'"), 'gezinme kilitlenmiş');
  assert.ok(!block.includes("'open-palette'"), 'palet kilitlenmiş');
});

test('flight 4: tıklama yolu korumadan geçer', () => {
  const clickAt = app.indexOf("document.addEventListener('click', async (e) => {");
  assert.ok(clickAt > 0, 'tıklama dinleyicisi yok');
  const body = app.slice(clickAt, clickAt + 4000);
  assert.match(body, /await runGuardedAction\(action, actionEl, sessionId\)/, 'tıklama korumayı atlıyor');
  assert.doesNotMatch(body, /await dispatchAction\(action, actionEl, sessionId\)/, 'tıklama doğrudan dağıtıcıyı çağırıyor');
  assert.match(app, /async function dispatchAction\(action, actionEl, sessionId\) \{/, 'dağıtıcı ayrı işlev değil');
});

test('flight 5: canlı kapı var', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'single-flight.js'), 'utf8');
  assert.match(gate, /TEK UCUS: GECTI/, 'kapı sonucu yazmıyor');
  assert.match(gate, /b\.click\(\);\s*b\.click\(\)/, 'kapı çift tıklamıyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
});
