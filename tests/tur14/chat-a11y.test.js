'use strict';

/*
 * T-191 — Sohbet durumu ve hataları ekran okuyucuya duyurulur.
 *
 * Kusur: durum satırı ("model yanıtlıyor…", "anahtar yok", gecikme) yalnız
 * görseldi; gönderim hatası yalnız sohbet balonunda görünüyordu. Balonda gezen
 * ekran okuyucu kullanıcısı mesajının gitmediğini duymuyordu. Bu test kilidi:
 *   1) Durum satırı `role="status"`, `aria-live="polite"`, atomic.
 *   2) Hata duyurusu ayrı bir `role="alert"` düğümü, `aria-live="assertive"`.
 *   3) Uyarı düğümü görsel olarak gizli (`.kv-sr-only`) — ikinci bir yazı yok.
 *   4) Hata yolunda duyuru metni yazılır; yeni gönderimde temizlenir.
 *   5) Canlı kapı erişilebilirlik ağacında ölçer.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));

const blockOf = (marker, size = 1600) => {
  const start = app.indexOf(marker);
  assert.ok(start > 0, `${marker} yok`);
  return app.slice(start, start + size);
};

test('chat a11y 1: durum satırı kibar canlı bölge', () => {
  assert.match(html, /data-field="chat-status" role="status" aria-live="polite" aria-atomic="true"/,
    'durum satırı canlı bölge değil');
});

test('chat a11y 2: hata için ayrı acil canlı bölge', () => {
  assert.match(html, /data-field="chat-alert" role="alert" aria-live="assertive"/,
    'acil duyuru bölgesi yok');
});

test('chat a11y 3: duyuru düğümü görsel olarak gizli', () => {
  assert.match(html, /<span class="kv-sr-only" data-field="chat-alert"/, 'uyarı düğümü ekran okuyucu sınıfıyla gizlenmemiş');
  const css = fs.readdirSync(path.join(RENDERER, 'styles'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => read(path.join(RENDERER, 'styles', f)))
    .join('\n');
  assert.match(css, /\.kv-sr-only \{[\s\S]{0,300}clip-path: inset\(50%\)/, '.kv-sr-only gerçekten gizlemiyor');
});

test('chat a11y 4: hata duyurulur, yeni gönderimde temizlenir', () => {
  const send = blockOf('async function sendChat()', 3500);
  assert.match(send, /const alertBox = \$\('\[data-field="chat-alert"\]'\);/, 'duyuru düğümü alınmıyor');
  assert.match(send, /if \(alertBox\) alertBox\.textContent = '';/, 'önceki duyuru temizlenmiyor');
  assert.match(send, /alertBox\.textContent = code === 'E_SECRET_MISSING'/, 'anahtar yok hatası duyurulmuyor');
  assert.match(send, /`Mesaj gönderilemedi: \$\{msg\}`/, 'genel hata duyurulmuyor');
});

test('chat a11y 5: canlı kapı erişilebilirlik ağacını ölçer', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'chat-a11y.js'), 'utf8');
  assert.match(gate, /SOHBET DUYURUSU: GECTI/, 'kapı sonucu yazmıyor');
  assert.match(gate, /Accessibility\.getFullAXTree/, 'kapı erişilebilirlik ağacını okumuyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
  assert.doesNotMatch(gate, /typeof store/, 'kapı modül kapsamına dayanıyor');
});
