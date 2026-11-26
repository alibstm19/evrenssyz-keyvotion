'use strict';

/*
 * T-173 — Konuşmayı Markdown olarak kopyala.
 *
 * Kullanıcı bir yanıtı rapora, PR açıklamasına ya da başka bir araca
 * yapıştırmak ister. Elle seçmek yerine tek tık:
 *   1) Sohbet başlığında "Markdown kopyala" düğmesi vardır.
 *   2) Markdown üretimi başlık (`# `), rol başlıkları (`**Sen**`) ve hata
 *      balonlarını alıntı (`> `) olarak taşır.
 *   3) Pano yazımı başarısız olursa gizli alan + execCommand yedeği devreye
 *      girer (izinsiz ortamda da kopyalama çalışır) ve alan temizlenir.
 *   4) Gerçek uygulama kapısı (`tools/verify/chat-copy.js`) vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const css = read(path.join(RENDERER, 'styles', 'tur14.css'));

test('copy 1: düğme ve eylem bağlı', () => {
  assert.match(html, /data-action="chat-copy-md"/, 'düğme yok');
  assert.match(html, /title="Konuşmayı Markdown olarak kopyala"/, 'düğme açıklaması yok');
  assert.match(app, /case 'chat-copy-md': chatCopyMarkdown\(\);/, 'eylem bağlı değil');
});

test('copy 2: Markdown başlık, rol ve hata alıntısı taşır', () => {
  assert.match(app, /function chatMarkdown\(/, 'Markdown üreticisi yok');
  const start = app.indexOf('function chatMarkdown()');
  const block = app.slice(start, app.indexOf('async function chatCopyMarkdown', start));
  assert.match(block, /\[\`# \$\{title\}\`/, 'başlık satırı yok');
  assert.match(block, /'\*\*Sen\*\*'/, 'kullanıcı rol başlığı yok');
  assert.match(block, /`> \$\{l\}`/, 'hata alıntısı yok');
  assert.match(block, /CHAT_ROLE_LABEL/, 'ajan rol başlığı yok');
});

test('copy 3: pano yedeği var ve alan temizleniyor', () => {
  assert.match(app, /function copyViaTextarea/, 'yedek yol yok');
  assert.match(app, /document\.execCommand\('copy'\)/, 'execCommand yedeği yok');
  assert.match(app, /ta\.remove\(\)/, 'geçici alan kaldırılmıyor');
  assert.match(css, /\.kv-copy-sink/, 'geçici alan stili yok');
  /* Boş konuşmada sessiz kalmaz. */
  assert.match(app, /Bu konuşmada mesaj yok\./, 'boş konuşma uyarısı yok');
});

test('copy 4: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'chat-copy.js'), 'utf8');
  assert.match(gate, /chat-copy-md/, 'kapı düğmeyi aramıyor');
  assert.match(gate, /kv-copy-sink/, 'kapı yedek yolu ölçmüyor');
  assert.match(gate, /SOHBET MARKDOWN: GECTI/, 'kapı sonucu yazmıyor');
});
