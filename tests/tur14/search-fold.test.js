'use strict';
/* Arama katlamasi: Turkce harf yazamayan kullanici da dogru sonucu bulur. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = path.join(__dirname, '..', '..', 'src', 'renderer', 'app.js');

/* fold/matchesFold renderer modulunde yasar; burada yalniz o blok yuklenir. */
function loadFold() {
  const src = fs.readFileSync(APP, 'utf8');
  const start = src.indexOf('const FOLD_MAP = {');
  const end = src.indexOf('const ERROR_CODE_VIEWS');
  assert.ok(start > 0 && end > start, 'fold blogu app.js icinde bulunamadi');
  const block = `${src.slice(start, end)}\n;({ fold, matchesFold });`;
  const sandbox = {};
  return vm.runInNewContext(block, sandbox);
}

const { fold, matchesFold } = loadFold();

test('search/fold 1: Turkce harfler ASCII karsiligina katlanir', () => {
  assert.equal(fold('Bağlantı'), 'baglanti');
  assert.equal(fold('Yönetim Merkezi'), 'yonetim merkezi');
  assert.equal(fold('Güvenlik'), 'guvenlik');
  assert.equal(fold('Ödeme'), 'odeme');
  assert.equal(fold('Çıkış'), 'cikis');
  assert.equal(fold('Şifre'), 'sifre');
  assert.equal(fold('Işık'), 'isik');
});

test('search/fold 2: buyuk I noktali hale gelmez', () => {
  /* 'İ'.toLowerCase() birlesik nokta uretir; katlama bunu temizler. */
  assert.equal(fold('İZİN'), 'izin');
  assert.equal(fold('İzinler'), 'izinler');
});

test('search/fold 3: ASCII sorgu Turkce metni bulur', () => {
  assert.equal(matchesFold('Bağlantıyı test et', 'baglanti'), true);
  assert.equal(matchesFold('Bağlantıyı test et', 'bağlantı'), true);
  assert.equal(matchesFold('Yönetim Merkezi', 'yonetim'), true);
  assert.equal(matchesFold('Ekip · team', 'ekip'), true);
});

test('search/fold 4: uymayan sorgu eslesmez, bos sorgu hepsini gecirir', () => {
  assert.equal(matchesFold('GitHub', 'slack'), false);
  assert.equal(matchesFold('GitHub', ''), true);
  assert.equal(matchesFold(null, 'git'), false);
  assert.equal(matchesFold(undefined, ''), true);
});

test('search/fold 5: ASCII veri bozulmadan eslesir', () => {
  assert.equal(matchesFold('GitHub', 'git'), true);
  assert.equal(matchesFold('MCP sunucusu', 'mcp'), true);
  assert.equal(fold('github'), 'github');
});
