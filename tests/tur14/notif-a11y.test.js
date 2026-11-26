'use strict';

/*
 * T-185 — Bildirim merkezi ve toast'lar erişilebilir.
 *
 * Panel düğmesi açık/kapalı durumunu duyurmuyor, odak yönetmiyordu; toast'lar
 * sessizce kayboluyordu. Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) Düğme `aria-expanded`, `aria-controls`, `aria-label` taşır; panel `region`.
 *   2) Tek yardımcı (`setNotificationsOpen`) paneli ve düğmeyi birlikte günceller,
 *      açılışta odağı içeri verir; `closeNotifications` odağı düğmeye döndürür.
 *   3) Esc paneli kapatır (belge dinleyicisinde bağlı).
 *   4) Toast `role=status|alert` alır, kapat düğmesi `Bildirimi kapat` adını taşır.
 *   5) Kapat düğmesi görünür ve gerçek uygulamada ölçen canlı kapı vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const css = read(path.join(RENDERER, 'styles', 'components.css'));

const blockOf = (name, size = 1000) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} yok`);
  return app.slice(start, start + size);
};

test('notif 1: düğme ve panel erişilebilirlik sözleşmesi', () => {
  const button = html.slice(html.indexOf('data-action="toggle-notifications"') - 200, html.indexOf('data-action="toggle-notifications"') + 200);
  assert.match(button, /aria-expanded="false"/, 'aria-expanded yok');
  assert.match(button, /aria-controls="kv-notifications"/, 'aria-controls yok');
  assert.match(button, /aria-label="Bildirimler"/, 'aria-label yok');
  const panel = html.slice(html.indexOf('id="kv-notifications"') - 120, html.indexOf('id="kv-notifications"') + 160);
  assert.match(panel, /role="region"/, 'panel region değil');
  assert.match(panel, /aria-label="Bildirimler"/, 'panel adı yok');
});

test('notif 2: tek yardımcı panel + düğme + odak', () => {
  const open = blockOf('setNotificationsOpen');
  assert.match(open, /panel\.hidden = !open/, 'panel gizlenmiyor');
  assert.match(open, /setAttribute\('aria-expanded', String\(open\)\)/, 'düğme durumu yazılmıyor');
  assert.match(open, /first\.focus\(\)/, 'açılışta odak içeri girmiyor');
  const close = blockOf('closeNotifications');
  assert.match(close, /setNotificationsOpen\(false\)/, 'kapanış yardımcıyı kullanmıyor');
  assert.match(close, /toggle\.focus\(\)/, 'odak düğmeye dönmüyor');
  assert.match(app, /if \(p\.hidden\) setNotificationsOpen\(true\);\n\s*else closeNotifications\(\{ refocus: true \}\);/, 'eylem yeni yardımcıya bağlı değil');
});

test('notif 3: Esc paneli kapatır', () => {
  const at = app.indexOf("if (e.key === 'Escape') { closePalette();");
  assert.ok(at > 0, 'belge Esc dalı yok');
  const line = app.slice(at, app.indexOf('\n', at));
  assert.match(line, /closeNotifications\(\{ refocus: true \}\)/, 'Esc bildirim panelini kapatmıyor');
});

test('notif 4: toast kendini duyurur ve kapanabilir', () => {
  const toast = blockOf('toast', 1200);
  assert.match(toast, /role: urgent \? 'alert' : 'status'/, 'toast rolü yok');
  assert.match(toast, /'data-toast': ''/, 'toast kapı kancası taşımıyor');
  assert.match(toast, /'aria-label': 'Bildirimi kapat'/, 'kapat düğmesi adı yok');
  assert.match(toast, /onclick: \(\) => node\.remove\(\)/, 'kapat düğmesi çalışmıyor');
  const count = blockOf('renderNotifications', 1400);
  assert.match(count, /aria-label', n \? `Bildirimler \(\$\{n\}\)` : 'Bildirimler'/, 'düğme adı sayıyı taşımıyor');
});

test('notif 5: görsel + canlı kapı', () => {
  assert.match(css, /\.kv-toast__close \{/, 'kapat düğmesi stili yok');
  assert.match(css, /\.kv-toast__text \{/, 'metin alanı stili yok');
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'notif-a11y.js'), 'utf8');
  assert.match(gate, /BILDIRIM ERISILEBILIRLIGI: GECTI/, 'kapı sonucu yazmıyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
  assert.match(gate, /aria-expanded/, 'kapı panel durumunu ölçmüyor');
});
