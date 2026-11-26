'use strict';

// Tur 2 / IPC parite — K3 kapısının kalıcı testi (EMİR T-020'den devralındı, EMİR T-025)
// Bu dosya work/smoke/compare-channels.js'in 4 denetimini sürekli koşan test olarak yaşatır:
//   1) preload CH aynası == shared CHANNELS (anahtar+değer, iki yön)
//   2) preload onay anahtarı ÜRETMEZ (T-029: WRITE_CHANNELS/mintConfirmToken preload'da aranmaz)
//   3) main.js tam 21 invoke kanalını kaydeder (eksik/fazla yok)
//   4) her WRITE_CHANNELS handler gövdesi confirm.verify çağırır (API-41/51)
// Smoke betiği elle koşulmayı bırakır; `node --test tests/` her turda bu kapıyı indirir.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read } = require('../lib');

const { CHANNELS, WRITE_CHANNELS, PUSH_CHANNELS } = require(path.join(SRC, 'shared', 'ipc-channels.js'));
const preloadJs = read(path.join(SRC, 'preload', 'preload.js'));
const mainJs = read(path.join(SRC, 'main', 'main.js'));

/* Push kanalları tek kaynaktan (PUSH_CHANNELS) — liste burada tutulmaz. */
const PUSH_ONLY = PUSH_CHANNELS;

/** compare-channels.js denetim 1: preload `const CH = { … }` ayna bloğu. */
function preloadChMap() {
  const start = preloadJs.indexOf('const CH = {');
  assert.ok(start >= 0, 'preload.js içinde `const CH = {` bloğu yok — ayna kaldırılmış');
  const end = preloadJs.indexOf('};', start);
  const block = preloadJs.slice(start, end);
  return new Map([...block.matchAll(/([A-Z_]+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
}

/** main.js handler bloğu: kanal sabitinden sonraki kayıttan dosya sonuna kadar. */
function handlerBlock(key) {
  const index = mainJs.indexOf(`ipcMain.handle(CHANNELS.${key}`);
  if (index < 0) return null;
  const next = mainJs.indexOf('ipcMain.handle(', index + 10);
  return mainJs.slice(index, next < 0 ? mainJs.length : next);
}

test('tur2/ipc-parity 1 (smoke #1): preload CH aynası shared CHANNELS ile birebir', () => {
  const mirror = preloadChMap();
  const diffs = [];

  for (const [key, value] of Object.entries(CHANNELS)) {
    if (!mirror.has(key)) diffs.push(`preload eksik: ${key} (${value})`);
    else if (mirror.get(key) !== value) diffs.push(`${key}: preload=${mirror.get(key)} shared=${value}`);
  }
  for (const key of mirror.keys()) {
    if (!Object.prototype.hasOwnProperty.call(CHANNELS, key)) diffs.push(`preload fazla: ${key}`);
  }

  assert.deepStrictEqual(diffs, [],
    `ayna kayması — K3 kapısı (compare-channels eşdeğeri): ${diffs.join(' | ')}`);
  assert.strictEqual(mirror.size, Object.keys(CHANNELS).length,
    `ayna boyutu ${mirror.size} ≠ shared ${Object.keys(CHANNELS).length}`);
});

test('tur2/ipc-parity 2 (smoke #2): preload onay anahtarı ÜRETMEZ (T-029 YM kararı)', () => {
  assert.doesNotMatch(preloadJs, /const WRITE_CHANNELS/,
    "preload'de WRITE_CHANNELS tanımı var — köprü token üretimine dönüş olabilir (T-029 ihlali)");
  assert.doesNotMatch(preloadJs, /mintConfirmToken/,
    "preload'de mintConfirmToken var — onay modalı bypass edilir (T-029 ihlali)");

  // Onay anahtarı renderer'da üretilir (crypto.getRandomValues) — preload yalnız iletir.
  // (confirmToken'ın varsa korunup yoksa eklenmediği preload call() gövdesinde belirgindir.)
  assert.match(preloadJs, /confirmToken|payload/,
    'preload yük geçirme mantığı bulunamadı — confirmToken akışı belgelenmemiş');
});

test('tur2/ipc-parity 3 (smoke #3): main.js invoke kanallarının tamamını kaydeder — eksik/fazla yok', () => {
  const invokeChannels = Object.values(CHANNELS).filter((c) => !PUSH_ONLY.includes(c));
  const handled = [...mainJs.matchAll(/ipcMain\.handle\(CHANNELS\.([A-Z_]+)/g)]
    .map((m) => CHANNELS[m[1]])
    .filter(Boolean);

  const missing = invokeChannels.filter((c) => !handled.includes(c));
  const extra = handled.filter((c) => !invokeChannels.includes(c));
  assert.deepStrictEqual(missing, [], `main.js handler yok: ${missing.join(', ')} — invoke asılı kalır`);
  assert.deepStrictEqual(extra, [], `main.js fazla handler: ${extra.join(', ')} — push kanala handler takılmış olabilir`);

  assert.strictEqual(handled.length, invokeChannels.length,
    `ipcMain.handle sayısı ${handled.length}; invoke kanal sayısı ${invokeChannels.length} (shared/ipc-channels.js)`);
});

test('tur2/ipc-parity 4 (smoke #4): her yazma kanalının handler gövdesi confirm.verify çağırır (API-41/51)', () => {
  const unguarded = [];

  for (const channel of WRITE_CHANNELS) {
    const key = Object.keys(CHANNELS).find((k) => CHANNELS[k] === channel);
    const body = handlerBlock(key);
    if (body === null) {
      unguarded.push(`${channel} (${key}): handler kaydı yok`);
      continue;
    }
    if (!body.includes('confirm.verify')) {
      unguarded.push(`${channel} (${key}): gövdede confirm.verify yok`);
    }
  }

  assert.deepStrictEqual(unguarded, [],
    `yazma koruması eksik kanallar (onaysız yazma riski):\n  - ${unguarded.join('\n  - ')}`);
});
