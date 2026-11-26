'use strict';

/*
 * T-189 — "En alta in" düğmesi.
 *
 * T-188 ile yeniden çizim okuma konumunu koruyor; ama dipten uzaktaki
 * kullanıcının sona dönmesi için tek yol elle kaydırmaktı. Bu test sözleşmeyi
 * kilitler:
 *   1) Düğme gerçek HTML'de: `<button>`, `aria-label`, `hidden` başlangıçta.
 *   2) Yerleşimi bozmaz: kapsayıcı `relative`, düğme `absolute`, `[hidden]`
 *      gerçekten gizler.
 *   3) `updateChatJump()` yalnız kaydırılabilir içerikte ve dipten uzaktayken
 *      gösterir.
 *   4) Tıklama dibe iner, düğmeyi gizler ve klavye odağını mesaj kutusuna
 *      bırakır (gizlenen düğmede odak kalmaz).
 *   5) Kaydırma olayı düğmeyi anında günceller; canlı kapı vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const css = read(path.join(RENDERER, 'styles', 'tur5.css'));

const blockOf = (marker, size = 1400) => {
  const start = app.indexOf(marker);
  assert.ok(start > 0, `${marker} yok`);
  return app.slice(start, start + size);
};

test('jump 1: düğme gerçek HTML düğmesi ve etiketli', () => {
  assert.match(html, /<button class="kv-chat-jump" type="button" data-action="chat-jump-bottom"/,
    'düğme HTML’de yok');
  assert.match(html, /aria-label="En alta in"/, 'erişilebilir ad yok');
  assert.match(html, /\shidden>/, 'başlangıçta gizli değil');
});

test('jump 2: yerleşimi bozmaz (absolute + hidden)', () => {
  assert.match(css, /\.kv-chat-main \{[\s\S]{0,200}position: relative;/, 'kapsayıcı relative değil');
  assert.match(css, /\.kv-chat-jump \{[\s\S]{0,400}position: absolute;/, 'düğme akışa giriyor');
  assert.match(css, /\.kv-chat-jump\[hidden\] \{ display: none; \}/, '[hidden] gizlemiyor');
  const themes = fs.readdirSync(path.join(RENDERER, 'styles'))
    .filter((f) => /^theme.*\.css$/.test(f))
    .map((f) => read(path.join(RENDERER, 'styles', f)))
    .join('\n');
  assert.match(themes, /--kv-bg-elev-2:/, 'düğmenin kullandığı zemin token’ı temalarda yok');
  assert.match(themes, /--kv-accent:/, 'vurgu token’ı temalarda yok');
});

test('jump 3: yalnız kaydırılabilir ve dipten uzaktayken görünür', () => {
  const block = blockOf('function updateChatJump()');
  assert.match(block, /thread\.scrollHeight - thread\.clientHeight > CHAT_STICK_PX/,
    'kaydırılabilirlik ölçülmüyor');
  assert.match(block, /const far = scrollable && !chatNearBottom\(thread\);/,
    'görünürlük koşulu yanlış');
  assert.match(block, /btn\.hidden = !far;/, 'düğme durumu yazılmıyor');
});

test('jump 4: tıklama dibe iner ve odağı mesaj kutusuna bırakır', () => {
  const block = blockOf("case 'chat-jump-bottom': {");
  assert.match(block, /th\.scrollTop = th\.scrollHeight;/, 'dibe inmiyor');
  assert.match(block, /updateChatJump\(\);/, 'düğme durumu güncellenmiyor');
  assert.match(block, /const hadFocus = document\.activeElement === actionEl;/, 'odak yakalanmıyor');
  assert.match(block, /const box = \$\('\[data-field="chat-text"\]'\);/, 'odak mesaj kutusuna taşınmıyor');
});

test('jump 5: kaydırma olayı bağlı ve canlı kapı var', () => {
  assert.match(app, /chatThreadEl\.addEventListener\('scroll', \(\) => \{ updateChatJump\(\); \}, \{ passive: true \}\)/,
    'kaydırma dinleyicisi yok');
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'chat-jump.js'), 'utf8');
  assert.match(gate, /EN ALTA IN: GECTI/, 'kapı sonucu yazmıyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
  assert.match(gate, /data-action="chat-jump-bottom"/, 'kapı düğmeyi ölçmüyor');
  assert.doesNotMatch(gate, /typeof store/, 'kapı modül kapsamına dayanıyor');
});
