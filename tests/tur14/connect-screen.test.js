'use strict';

/*
 * T-148 — `connect` ekranı (v3.2, Tur 14) sözleşme testleri.
 *
 * Kaynak: docs/console-ui-contract.md §15.9 (UI-151…UI-158) + §15.7 kancaları.
 * Sayı sabit yazılmaz: blok sayısı 5 sözleşmede yazılıdır (b1..b5, C20 deseni);
 * ekran ve stylesheet kümeleri §2 / UI-123'ten türetilir.
 *
 * NOT: Bu dosya T-147 (DEV `connect` ekranı) bitmeden KIRMIZI kalır — beklenen
 * davranış; test önce yazıldı, ürün kodu gelince yeşile döner (görev T-148).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const html = read(path.join(RENDERER, 'index.html'));
const appJs = read(path.join(RENDERER, 'app.js'));
/* C21: kanca/bölüm işaretleri renderer'da (html + js) en az bir kez geçerli;
 * kart ızgarası veriden üretildiği için JS şablonu da ölçüm kümesidir. */
const rendererSource = `${html}\n${appJs}`;
const uiContract = read(path.join(ROOT, 'docs', 'console-ui-contract.md'));

/** UI §2 ekran kimlikleri (sözleşme = tek kaynak). */
function contractScreens() {
  const start = uiContract.indexOf('## 2. Ekran kimlikleri');
  assert.ok(start >= 0, 'UI sözleşmesinde §2 bulunamadı');
  const end = uiContract.indexOf('## 3.', start);
  const section = uiContract.slice(start, end > 0 ? end : uiContract.length);
  return [...new Set([...section.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((m) => m[1]))];
}

/** UI-123 stylesheet zinciri. */
function contractStylesheets() {
  const row = uiContract.split(/\r?\n/).find((l) => l.includes('| UI-123 |'));
  assert.ok(row, 'UI sözleşmesinde UI-123 satırı yok');
  const chain = (row.match(/`([a-z0-9-]+\.css(?:\s*→\s*[a-z0-9-]+\.css)+)`/) || [])[1];
  assert.ok(chain, 'UI-123 satırında stylesheet zinciri yok');
  return chain.split('→').map((s) => s.trim());
}

function indexStylesheets() {
  return [...html.matchAll(/<link\s+rel="stylesheet"\s+href="styles\/([a-z0-9-]+\.css)">/g)].map((m) => m[1]);
}

/** §15.7 tablosundaki `connect` kancaları (görev emrinde sayılan 15 kanca). */
const PRESET_HOOKS = [
  'preset-search', 'preset-kind', 'preset-category', 'preset-grid', 'preset-item',
  'preset-count', 'preset-detail', 'preset-howto', 'preset-form', 'preset-field',
  'preset-field-hint', 'preset-connect', 'preset-test', 'preset-result', 'preset-empty'
];

/** Sayfadaki data-* anahtarlarının tam kümesi (önek eşleşmesi yanlış yeşil üretmesin). */
function dataKeys(source) {
  return new Set([...source.matchAll(/\bdata-([a-z0-9-]+)\s*[="\s>]/g)].map((m) => m[1]));
}

test('tur14/connect 1: ekran UI §2 kümesinde ve index.html ekran kümesi sözleşmeyle birebir', () => {
  const screens = [...new Set([...html.matchAll(/data-screen="([a-z]+)"/g)].map((m) => m[1]))];
  const contract = contractScreens();
  assert.ok(contract.includes('connect'), 'UI §2 ekran tablosunda `connect` yok (v3.2/T-143)');
  assert.deepStrictEqual(screens.slice().sort(), contract.slice().sort(),
    `ekran kümesi UI §2 ile uyuşmuyor. Fazla: ${screens.filter((s) => !contract.includes(s)).join(', ') || '-'}`
    + ` · Eksik: ${contract.filter((s) => !screens.includes(s)).join(', ') || '-'}`);
});

test('tur14/connect 2: data-preset-block b1..b5 tam 5 blok, her biri bir kez', () => {
  const blocks = [...html.matchAll(/data-preset-block="([a-z0-9]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(blocks, ['b1', 'b3', 'b4', 'b5', 'b2'],
    `blok sırası/kümesi b1..b5 olmalı; bulunan: ${blocks.join(', ') || '(yok)'}`);
});

test('tur14/connect 3: §15.7 kancalarının tamamı var (eksik 0)', () => {
  const keys = dataKeys(rendererSource);
  const missing = PRESET_HOOKS.filter((h) => !keys.has(h));
  assert.deepStrictEqual(missing, [],
    `connect ekranında eksik kanca: ${missing.map((m) => `data-${m}`).join(', ')}`);
});

test('tur14/connect 4: sayaç ve sonuç aria-live="polite"', () => {
  const tagOf = (hook) => (rendererSource.match(new RegExp(`<[^>]*data-${hook}\\b[^>]*>`)) || [''])[0];
  for (const hook of ['preset-count', 'preset-result']) {
    const tag = tagOf(hook);
    assert.ok(tag, `data-${hook} düğümü yok`);
    assert.match(tag, /aria-live="polite"/, `data-${hook} aria-live="polite" değil (UI-157/§15.9 B5)`);
  }
});

test('tur14/connect 5: data-preset-ready 5 durumu tur14.css içinde seçili (UI-154)', () => {
  const cssPath = path.join(RENDERER, 'styles', 'tur14.css');
  assert.ok(fs.existsSync(cssPath), 'src/renderer/styles/tur14.css yok (UI-123 son katman)');
  const css = read(cssPath);
  const states = ['ready', 'needs-fields', 'installed', 'connected', 'error'];
  const missing = states.filter((s) => !new RegExp(`\\[data-preset-ready=["']?${s}["']?\\]`).test(css));
  assert.deepStrictEqual(missing, [], `tur14.css bu data-preset-ready değerlerini seçmiyor: ${missing.join(', ')}`);
});

test('tur14/connect 6: tur14.css UI-123 zincirinde ve diskte var; son katmanlar tasarım paketleri (T-199/T-201)', () => {
  const expected = contractStylesheets();
  const actual = indexStylesheets();
  assert.deepStrictEqual(actual, expected,
    `stylesheet zinciri UI-123 ile birebir olmalı.\n  beklenen: ${expected.join(' → ')}\n  bulunan: ${actual.join(' → ')}`);
  /* T-199/T-201: connect katmanı tur14.css hâlâ son ÖZELLİK katmanıdır;
     ondan sonra iki alternatif tasarım paketi yüklenir (volt → prototip). */
  assert.ok(expected.includes('tur14.css'), 'UI-123 zincirinde tur14.css yok');
  assert.strictEqual(expected[expected.length - 1], 'prototip.css', 'UI-123 son katmanı prototip.css olmalı (T-201)');
  assert.strictEqual(expected[expected.length - 2], 'volt.css', 'volt.css prototip.css\'ten hemen önce olmalı');
  assert.strictEqual(expected[expected.length - 3], 'tur14.css', 'tur14.css tasarım paketlerinden hemen önce olmalı');
  assert.strictEqual(actual[actual.length - 1], 'prototip.css', `son <link> prototip.css olmalı; bulunan: ${actual[actual.length - 1]}`);
});

test('tur14/connect 7: connect bölümünde inline style / innerHTML yok', () => {
  const start = html.indexOf('data-screen="connect"');
  assert.ok(start > -1, 'index.html içinde data-screen="connect" yok');
  const section = html.slice(start, html.indexOf('data-screen=', start + 10) > -1
    ? html.indexOf('data-screen=', start + 10) : html.length);
  assert.strictEqual((section.match(/\sstyle="/g) || []).length, 0, 'connect bölümünde inline style var (UI-06)');
  assert.strictEqual((section.match(/innerHTML/g) || []).length, 0, 'connect bölümünde innerHTML var (UI-04)');
});
