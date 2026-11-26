'use strict';

/*
 * T-188 — Sohbet, kullanıcıyı okuduğu yerden koparmaz.
 *
 * Kusur: `renderChatThread()` her çizimde `scrollTop = scrollHeight` yapıyordu.
 * Kullanıcı yukarı kaydırıp eski mesajı okurken arama, sekme değişimi ya da
 * yeni mesaj çizimi onu dibe fırlatıyordu. Bu test sözleşmeyi kilitler:
 *   1) Eşik yardımcısı `chatNearBottom` dipten `CHAT_STICK_PX` kadar uzaklığa
 *      kadar "dipte" sayar.
 *   2) `renderChatThread` çizimden ÖNCE konumu ve diptelik durumunu yakalar.
 *   3) Konum korunur: yalnız `chatStick` ya da dipteyken dibe inilir, değilse
 *      `keepTop` geri yazılır.
 *   4) Kullanıcı eylemleri dibe sabitler: `sendChat` ve `openChat`
 *      `stickChatToBottom()` çağırır.
 *   5) Canlı kapı gerçek uygulamada ölçer (uydurma tohum yok).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));

const blockOf = (marker, size = 2000) => {
  const start = app.indexOf(marker);
  assert.ok(start > 0, `${marker} yok`);
  return app.slice(start, start + size);
};

test('scroll 1: eşik yardımcısı dipten 48 px içindeyi dipte sayar', () => {
  assert.match(app, /const CHAT_STICK_PX = 48;/, 'eşik sabiti yok');
  const block = blockOf('function chatNearBottom(');
  assert.match(block, /thread\.scrollHeight - thread\.scrollTop - thread\.clientHeight <= CHAT_STICK_PX/,
    'mesafe eşiği yanlış');
  assert.match(block, /if \(!thread\) return true;/, 'boş thread güvenli değil');
});

test('scroll 2: çizimden önce konum ve diptelik yakalanır', () => {
  const block = blockOf('function renderChatThread()');
  const keepAt = block.indexOf('const keepTop = thread.scrollTop;');
  const stickAt = block.indexOf('const shouldStick = chatStick || wasNearBottom;');
  const clearAt = block.indexOf('thread.replaceChildren();');
  assert.ok(keepAt > 0, 'keepTop yakalanmıyor');
  assert.ok(stickAt > keepAt, 'shouldStick keepTop’tan sonra hesaplanmalı');
  assert.ok(clearAt > stickAt, 'konum replaceChildren’dan önce yakalanmalı');
});

test('scroll 3: yukarıdayken konum korunur, dipteyken dibe inilir', () => {
  const block = blockOf('function renderChatThread()', 4000);
  assert.match(block, /if \(shouldStick\) \{\n\s*thread\.scrollTop = thread\.scrollHeight;\n\s*chatStick = false;/,
    'dibe inme dalı yanlış');
  assert.match(block, /\} else \{\n\s*thread\.scrollTop = keepTop;/, 'koruma dalı yok');
});

test('scroll 4: gönderim ve konuşma açma dibe sabitler', () => {
  const send = blockOf('async function sendChat()', 3000);
  const sendAt = send.indexOf('stickChatToBottom();');
  const renderAt = send.indexOf('renderChatThread();');
  assert.ok(sendAt > 0, 'sendChat dibe sabitlemiyor');
  assert.ok(renderAt > sendAt, 'sendChat çizimden önce sabitlemeli');

  const open = blockOf('async function openChat(', 1200);
  assert.match(open, /stickChatToBottom\(\);/, 'openChat dibe sabitlemiyor');
});

test('scroll 5: canlı kapı gerçek uygulamada ölçer', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'chat-scroll.js'), 'utf8');
  assert.match(gate, /SOHBET KAYDIRMA: GECTI/, 'kapı sonucu yazmıyor');
  assert.match(gate, /remote-debugging-port/, 'kapı gerçek uygulamayı açmıyor');
  assert.match(gate, /data-chat-thread/, 'kapı sohbeti okumuyor');
  assert.match(gate, /data-field="chat-search"|data-field=\\"chat-search\\"/, 'kapı gerçek yeniden çizim yolunu kullanmıyor');
  /* Kapı renderer modül kapsamına sızmamalı: store/global çağrısı yasak. */
  assert.doesNotMatch(gate, /typeof store/, 'kapı modül kapsamındaki store’a dayanıyor');
  assert.doesNotMatch(gate, /typeof stickChatToBottom/, 'kapı modül kapsamındaki yardımcıya dayanıyor');
});
