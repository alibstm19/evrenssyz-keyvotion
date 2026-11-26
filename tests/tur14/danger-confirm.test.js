'use strict';

/*
 * T-186 — Yıkıcı eylemler tek onay kapısından geçer.
 *
 * Bazı silme/arşivleme yolları tek tıkla çalışıyordu. Bu test sözleşmeyi kaynak
 * düzeyinde kilitler:
 *   1) Tek yardımcı (`confirmDanger`) onay diyaloğu kurar, `data-danger-confirm`
 *      / `data-danger-cancel` kancaları taşır.
 *   2) **Odak güvenli seçenektedir:** "Vazgeç" düğmesi önce gelir (modal ilk
 *      düğmeye odaklanır), yani Enter yanlışlıkla silmez.
 *   3) Dört yol da yardımcıya bağlıdır: proje arşivi, anahtar kaldırma, beceri
 *      silme, komut geçmişi temizleme; hiçbiri doğrudan yazmıyor.
 *   4) Onay düğmesi diyaloğu önce kapatır, sonra yazar; `onCancel` iptalde
 *      yeniden açmayı destekler (geçmiş listesi geri gelir).
 *   5) Gerçek uygulamada ölçen canlı kapı vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));

const blockOf = (name, size = 1400) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} yok`);
  return app.slice(start, start + size);
};

test('danger 1: tek yardımcı ve kancalar', () => {
  const block = blockOf('confirmDanger');
  assert.match(block, /'data-danger-confirm': ''/, 'onay kancası yok');
  assert.match(block, /'data-danger-cancel': ''/, 'iptal kancası yok');
  assert.match(block, /class: 'kv-button kv-button--danger'/, 'yıkıcı düğme vurgulanmıyor');
  assert.match(block, /await run\(\)/, 'onay yazmayı çalıştırmıyor');
});

test('danger 2: odak güvenli seçenekte (Vazgeç önce)', () => {
  const block = blockOf('confirmDanger');
  const cancelAt = block.indexOf("'data-danger-cancel'");
  const confirmAt = block.indexOf("'data-danger-confirm'");
  assert.ok(cancelAt > 0 && confirmAt > 0, 'kancalar eksik');
  assert.ok(cancelAt < confirmAt, 'Vazgeç önce gelmeli: modal ilk düğmeye odaklanır');
  assert.match(block, /text: 'Vazgeç'/, 'iptal düğmesi metni yok');
});

test('danger 3: dört yol da onay kapısına bağlı', () => {
  const head = (name) => {
    const block = blockOf(name);
    const at = block.indexOf('confirmDanger({');
    assert.ok(at > 0, `${name} onay sormuyor`);
    return block.slice(0, at);
  };

  const archiveHead = head('archiveProject');
  assert.doesNotMatch(archiveHead, /await call\(KV/, 'arşiv onaydan önce yazıyor');
  assert.match(blockOf('archiveProject'), /confirmToken: makeConfirmToken\(\)/, 'arşiv yazması onay jetonu taşımıyor');

  assert.doesNotMatch(head('removeKey'), /await call\(KV/, 'anahtar onaydan önce siliniyor');
  assert.doesNotMatch(head('removeSkill'), /await call\(KV/, 'beceri onaydan önce siliniyor');

  const history = app.slice(app.indexOf("text: 'Temizle'") - 200, app.indexOf("text: 'Temizle'") + 700);
  assert.match(history, /confirmDanger\(\{/, 'geçmiş temizleme onay sormuyor');
  assert.doesNotMatch(history, /onclick: \(\) => \{ try \{ localStorage\.removeItem/, 'geçmiş tek tıkla siliniyor');
  assert.match(history, /onCancel: \(\) => openHistory\(\)/, 'iptalde geçmiş listesi geri gelmiyor');
});

test('danger 4: onay sırası — kapat, sonra yaz', () => {
  const block = blockOf('confirmDanger');
  const closeAt = block.indexOf('closeModal();\n          await run();');
  assert.ok(closeAt > 0, 'onay diyaloğu yazmadan önce kapanmıyor');
  assert.match(block, /if \(typeof onCancel === 'function'\) onCancel\(\)/, 'iptal geri çağrısı yok');
});

test('danger 5: canlı kapı var', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'danger-confirm.js'), 'utf8');
  assert.match(gate, /TEHLIKELI EYLEM ONAYI: GECTI/, 'kapı sonucu yazmıyor');
  assert.match(gate, /data-danger-cancel/, 'kapı iptal düğmesini ölçmüyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
});
