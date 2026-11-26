'use strict';

/*
 * T-172 — Sohbet hatasında "Tekrar dene".
 *
 * Kullanıcı yanıt alamadığında mesajı elle kopyalayıp yeniden yazmamalı.
 * Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) Hata balonu yeniden gönderilecek metni saklar (`retryText`).
 *   2) Balonda "Tekrar dene" (data-action) ve "Kopyala" düğmeleri çizilir.
 *   3) "Tekrar dene" eski hata balonunu kaldırıp gönderimi yeniden çalıştırır
 *      (balon çoğalmaz).
 *   4) Gerçek uygulama kapısı (`tools/verify/chat-retry.js`) vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const css = read(path.join(RENDERER, 'styles', 'tur5.css'));

test('retry 1: hata balonu metni saklar', () => {
  assert.match(app, /kind: 'error',\s*\n\s*retryText: text,/, 'retryText yazılmıyor');
});

test('retry 2: balonda tekrar dene ve kopyala var', () => {
  assert.match(app, /'data-action': 'chat-retry'/, 'tekrar dene düğmesi yok');
  assert.match(app, /'data-index': String\(store\.chat\.messages\.indexOf\(m\)\)/, 'balon indeksi yok');
  assert.match(app, /text: 'Tekrar dene'/, 'düğme metni yok');
  assert.match(app, /text: 'Kopyala'/, 'kopyala düğmesi yok');
  assert.match(css, /\.kv-bubble__actions/, 'eylem satırı stili yok');
});

test('retry 3: tekrar dene eski balonu kaldırır, yeniden gönderir', () => {
  const start = app.indexOf("case 'chat-retry'");
  assert.ok(start > 0, 'chat-retry eylemi yok');
  const block = app.slice(start, app.indexOf("case 'chat-new'", start));
  assert.match(block, /store\.chat\.messages\.splice\(idx, 1\)/, 'eski hata balonu kaldırılmıyor');
  assert.match(block, /ta\.value = msg\.retryText/, 'metin geri yüklenmiyor');
  assert.match(block, /sendChat\(\)/, 'gönderim yeniden çalıştırılmıyor');
});

test('retry 4: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'chat-retry.js'), 'utf8');
  assert.match(gate, /Tekrar dene/, 'kapı tekrar dene düğmesini aramıyor');
  assert.match(gate, /second\.errors === 1/, 'kapı balon çoğalmasını ölçmüyor');
});
