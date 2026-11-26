'use strict';

// T-093a — Tur 10 / sözleşme sayılarını TÜRETME (İSKELET).
//
// Hiçbir sayı (78/32/17/13) burada sabit yazılmaz. Beklenen değerler
// `docs/console-api-contract.md` ve `docs/console-ui-contract.md` içinden
// okunur; ölçülen değerler kod ve `src/renderer/index.html`'den gelir.
// Desen `tests/tur2/ipc-channels.test.js` ile aynıdır (sözleşme = tek kaynak).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ROOT, SRC, read } = require('../lib');

const { CHANNELS, WRITE_CHANNELS, PUSH_CHANNELS } = require(path.join(SRC, 'shared', 'ipc-channels.js'));

const API = read(path.join(ROOT, 'docs', 'console-api-contract.md'));
const UI = read(path.join(ROOT, 'docs', 'console-ui-contract.md'));
const INDEX_HTML = read(path.join(SRC, 'renderer', 'index.html'));

/* ---------- API sözleşmesi: kanal + yazma kanalı ---------- */

function apiSection(startMarker, endMarker) {
  const start = API.indexOf(startMarker);
  assert.ok(start >= 0, `API sözleşmesinde '${startMarker}' bulunamadı`);
  const end = API.indexOf(endMarker, start);
  return API.slice(start, end > 0 ? end : API.length);
}

/** §7.2 tablosundaki kanal adları (tekilleştirilmiş). */
function contractChannels() {
  const section = apiSection('### 7.2 Kanal tablosu', '### 7.3');
  return [...new Set(
    [...section.matchAll(/^\|\s*`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`\s*\|/gm)].map((m) => m[1])
  )];
}

/** §7.2 tablosunda `**push**` işaretli kanallar. */
function contractPushChannels() {
  const section = apiSection('### 7.2 Kanal tablosu', '### 7.3');
  return [...section.matchAll(/^\|\s*`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`\s*\|\s*\*\*push\*\*/gm)].map((m) => m[1]);
}

/** API-51a satırından yazma kanalı adları (API-105 muafiyeti ayıklanır). */
function contractWriteChannels() {
  const line = API.split(/\r?\n/).find((l) => l.includes('| API-51a |'));
  assert.ok(line, 'API sözleşmesinde API-51a satırı yok');
  return [...new Set(
    [...line.matchAll(/`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`/g)].map((m) => m[1])
      .filter((c) => !c.includes('settings:set'))
  )];
}

/** API-51a cümlesindeki beyan edilen sayı ("kümesi 39'dur"). */
function contractWriteDeclaredCount() {
  const line = API.split(/\r?\n/).find((l) => l.includes('| API-51a |'));
  assert.ok(line, 'API sözleşmesinde API-51a satırı yok');
  /* T-127/T-148: Türkçe ünlü uyumu dört eki de üretir — dır / dir / dur / dür;
   * v3.2'de cümle "44'tür" biçiminde (t ile) yazıldığı için d|t kabul edilir. */
  const m = line.match(/kümesi\s+(\d+)'[dt][ıiuü]r/);
  assert.ok(m, "API-51a satırında \"kümesi N'dir/dır/dur/dür\" beyanı bulunamadı");
  return Number(m[1]);
}

/* ---------- UI sözleşmesi: ekran + stylesheet ---------- */

function contractScreens() {
  const start = UI.indexOf('## 2. Ekran kimlikleri');
  assert.ok(start >= 0, 'UI sözleşmesinde §2 bulunamadı');
  const end = UI.indexOf('## 3.', start);
  const section = UI.slice(start, end > 0 ? end : UI.length);
  return [...new Set(
    [...section.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((m) => m[1])
  )];
}

function contractStylesheets() {
  const row = UI.split(/\r?\n/).find((l) => l.includes('| UI-123 |'));
  assert.ok(row, 'UI sözleşmesinde UI-123 satırı yok');
  const chain = (row.match(/`([a-z0-9-]+\.css(?:\s*→\s*[a-z0-9-]+\.css)+)`/) || [])[1];
  assert.ok(chain, 'UI-123 satırında backtick içinde stylesheet zinciri yok');
  return chain.split('→').map((s) => s.trim());
}

function indexScreens() {
  return [...new Set(
    [...INDEX_HTML.matchAll(/data-screen="([a-z]+)"/g)].map((m) => m[1])
  )];
}

function indexStylesheets() {
  return [...INDEX_HTML.matchAll(/<link\s+rel="stylesheet"\s+href="styles\/([a-z0-9-]+\.css)">/g)].map((m) => m[1]);
}

/* ---------- testler ---------- */

test('tur10/contract 1: §7.2 kanal sayısı CHANNELS ile birebir (sabit sayı yok)', () => {
  const declared = contractChannels();
  assert.ok(declared.length > 0, '§7.2 tablosundan kanal adı çıkarılamadı');
  assert.strictEqual(declared.length, Object.keys(CHANNELS).length,
    `§7.2 ${declared.length} kanal, CHANNELS ${Object.keys(CHANNELS).length}`);
});

test('tur10/contract 2: §7.2 push yönü koddaki push kanallarıyla aynı', () => {
  const declaredPush = contractPushChannels().sort();
  /* Push kümesi tek kaynaktan (PUSH_CHANNELS) türetilir — liste burada tutulmaz. */
  const codePush = PUSH_CHANNELS.slice().sort();
  assert.deepStrictEqual(declaredPush, codePush, '§7.2 push kümesi ile kod push kümesi uyuşmuyor');
});

test('tur10/contract 3: API-51a beyanı ve listesi WRITE_CHANNELS ile birebir', () => {
  const declaredCount = contractWriteDeclaredCount();
  const declaredChannels = contractWriteChannels().sort();
  assert.strictEqual(declaredCount, WRITE_CHANNELS.length,
    `API-51a beyanı ${declaredCount}, WRITE_CHANNELS ${WRITE_CHANNELS.length}`);
  assert.deepStrictEqual(declaredChannels, WRITE_CHANNELS.slice().sort(),
    `API-51a listesi (${declaredChannels.length}) WRITE_CHANNELS (${WRITE_CHANNELS.length}) ile uyuşmuyor`);
});

test('tur10/contract 4: UI §2 ekran kümesi index.html data-screen ile birebir', () => {
  const declared = contractScreens().sort();
  const actual = indexScreens().sort();
  assert.ok(declared.length > 0, 'UI §2 tablosundan ekran kimliği çıkarılamadı');
  assert.strictEqual(declared.length, actual.length,
    `UI §2 ${declared.length} ekran, index.html ${actual.length} data-screen`);
  assert.deepStrictEqual(actual, declared, 'ekran kimlik kümeleri uyuşmuyor');
});

test('tur10/contract 5: UI-123 stylesheet zinciri index.html <link> sırasıyla birebir', () => {
  const declared = contractStylesheets();
  const actual = indexStylesheets();
  assert.ok(declared.length > 0, 'UI-123 zinciri çıkarılamadı');
  assert.strictEqual(declared.length, actual.length,
    `UI-123 ${declared.length} stylesheet, index.html ${actual.length} <link>`);
  assert.deepStrictEqual(actual, declared, 'stylesheet sırası sözleşmeyle uyuşmuyor');
});
