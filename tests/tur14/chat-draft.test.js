'use strict';

/*
 * T-177 — Sohbet taslağı.
 *
 * Kullanıcı yarım mesajını ekran değiştirince ya da pencere kapanınca
 * kaybetmemeli. Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) Taslak konuşma başına, sınırlı sayıda ve 8000 karakterle saklanır.
 *   2) Yazarken gecikmeli kaydedilir; not ("Taslak kaydedildi") görünür.
 *   3) Ekran dönüşünde ve yenilemede geri yüklenir; yazarken alan ezilmez.
 *   4) Gönderilemeyen metin kutuda kalır ve taslağı korunur.
 *   5) Gerçek uygulama kapısı (`tools/verify/chat-draft.js`) vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));

test('draft 1: konuşma başına, sınırlı, 8000 karakter', () => {
  assert.match(app, /const CHAT_DRAFTS_KEY = 'kv\.chatDrafts\.v1'/, 'depo anahtarı yok');
  assert.match(app, /function chatDraftKey\(\)/, 'konuşma anahtarı yok');
  assert.match(app, /store\.chat\.id \|\| '__none'/, 'konuşmasız anahtar yok');
  const start = app.indexOf('function saveChatDraft(text)');
  const block = app.slice(start, app.indexOf('function restoreChatDraft', start));
  assert.match(block, /slice\(0, 8000\)/, 'uzunluk sınırı yok');
  assert.match(block, /keys\.length - 20/, 'konuşma sayısı sınırlanmıyor');
  assert.match(block, /localStorage\.setItem/, 'kalıcı yazım yok');
  assert.match(block, /localStorage\.removeItem\(CHAT_DRAFTS_KEY\)/, 'boş taslak temizlenmiyor');
});

test('draft 2: not görünür, yazarken gecikmeli kaydedilir', () => {
  assert.match(html, /data-field="chat-draft-note"[^>]*hidden|hidden[^>]*data-field="chat-draft-note"/, 'not öğesi yok');
  assert.match(html, /Taslak kaydedildi/, 'not metni yok');
  assert.match(app, /setTimeout\(\(\) => saveChatDraft\(chatTa\.value\), 300\)/, 'gecikmeli kayıt yok');
});

test('draft 3: dönüşte ve yenilemede geri yüklenir, yazarken ezilmez', () => {
  assert.match(app, /function restoreChatDraft\(\)/, 'geri yükleme yok');
  const start = app.indexOf('function restoreChatDraft()');
  const block = app.slice(start, start + 1200);
  assert.match(block, /document\.activeElement === ta/, 'yazarken alan eziliyor');
  assert.match(block, /!store\.chat\.id/, 'konuşmasız durum ele alınmıyor');
  assert.match(block, /b\.at \|\| 0/, 'en yeni taslak seçilmiyor');
  const render = app.slice(app.indexOf('function renderChatThread()'), app.indexOf('async function refreshChats'));
  assert.match(render, /restoreChatDraft\(\)/, 'sohbet çiziminde taslak geri gelmiyor');
});

test('draft 4: gönderilemeyen metin kutuda kalır, taslak korunur', () => {
  const start = app.indexOf('async function sendChat()');
  const block = app.slice(start, app.indexOf('async function chatRename', start));
  assert.match(block, /saveChatDraft\(''\)/, 'gönderimden sonra taslak temizlenmiyor');
  assert.match(block, /saveChatDraft\(ta \? ta\.value : ''\)/, 'hata yolunda taslak geri konmuyor');
});

test('draft 5: uçtan uca kapı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'chat-draft.js'), 'utf8');
  assert.match(gate, /kv\.chatDrafts\.v1/, 'kapı depoyu okumuyor');
  assert.match(gate, /Page\.reload/, 'kapı yenilemeyi ölçmüyor');
  assert.match(gate, /SOHBET TASLAGI: GECTI/, 'kapı sonucu yazmıyor');
});
