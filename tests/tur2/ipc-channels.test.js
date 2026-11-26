'use strict';

// Tur 2 / IPC kanal yapısı — tek kaynağın bütünlüğü (EMİR T-020, T-025, v2.3 T4)
//
// v2.3 (Tur 4) DEĞİŞİKLİĞİ: sayımlar ARTIK SABİT KODLANMAZ. Beklenen kanal kümesi
// docs/console-api-contract.md §7.2 tablosundan okunur. Böylece:
//   - yeni kanal eklenince/test kırılınca "testi gevşet" değil, "sözleşmeyi güncelle"
//     gerekir (sözleşme tek gerçek kaynak),
//   - bir kanal koddan düşerse test yine kırmızı olur (kapı gevşemedi, güçlendi).
//
// Ölçüm: sözleşme satırları ↔ CHANNELS anahtar/değer ↔ main handler ↔ preload aynası.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, ROOT, read } = require('../lib');

const { CHANNELS, WRITE_CHANNELS, PUSH_CHANNELS } = require(path.join(SRC, 'shared', 'ipc-channels.js'));
const mainJs = read(path.join(SRC, 'main', 'main.js'));
const preloadJs = read(path.join(SRC, 'preload', 'preload.js'));
const contract = read(path.join(ROOT, 'docs', 'console-api-contract.md'));

/* Push kanalları tek kaynaktan (PUSH_CHANNELS) türetilir — liste burada tutulmaz. */
const PUSH_KEYS = Object.keys(CHANNELS).filter((k) => PUSH_CHANNELS.includes(CHANNELS[k]));

/** §7.1 domain kümesi — sözleşmeden okunur (sabit liste tutulmaz). */
function contractDomains() {
  const start = contract.indexOf('### 7.1');
  const end = contract.indexOf('### 7.2', start);
  const section = contract.slice(start, end > 0 ? end : contract.length);
  const line = section.split(/\r?\n/).find((l) => l.includes('domain ∈'));
  assert.ok(line, 'sözleşmede §7.1 `domain ∈` satırı yok');
  const flat = section.slice(section.indexOf('domain ∈')).split(/\(|```/)[0];
  /* v3.1: domain hyphen taşıyabilir (mcp-catalog); sözcük sınırı onu bölerdi. */
  const found = flat.split(/[^a-z-]+/).filter(Boolean);
  /* `domain`, `action` gibi başlık sözcüklerini ayıkla. */
  const stop = new Set(['domain', 'action', 'kv', 've', 'yalnız', 'küçük', 'harf']);
  return [...new Set(found.filter((d) => !stop.has(d)))];
}

const DOMAINS = contractDomains();
const CHANNEL_FORMAT = new RegExp(`^kv:(?:${DOMAINS.join('|')}):[a-z][a-zA-Z]*(?:-[a-zA-Z]+)*$`);

const entries = Object.entries(CHANNELS);
const invokeKeys = entries.map(([k]) => k).filter((k) => !PUSH_KEYS.includes(k));
const pushKeys = entries.map(([k]) => k).filter((k) => PUSH_KEYS.includes(k));

/** §7.2 tablosundaki kanal adları (sözleşme = beklenen küme). */
function contractChannels() {
  const start = contract.indexOf('### 7.2 Kanal tablosu');
  assert.ok(start > 0, 'sözleşmede §7.2 kanal tablosu bulunamadı');
  const end = contract.indexOf('### 7.3', start);
  const section = contract.slice(start, end > 0 ? end : contract.length);
  const found = [...section.matchAll(/^\|\s*`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`\s*\|/gm)].map((m) => m[1]);
  return [...new Set(found)];
}

/** §7.2 tablosunda `**push**` işaretli kanallar. */
function contractPushChannels() {
  const start = contract.indexOf('### 7.2 Kanal tablosu');
  const end = contract.indexOf('### 7.3', start);
  const section = contract.slice(start, end > 0 ? end : contract.length);
  return [...section.matchAll(/^\|\s*`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`\s*\|\s*\*\*push\*\*/gm)].map((m) => m[1]);
}

function mainHandledKeys() {
  return [...new Set([...mainJs.matchAll(/ipcMain\.handle\(CHANNELS\.([A-Z_]+)/g)].map((m) => m[1]))];
}

function preloadChEntries() {
  const start = preloadJs.indexOf('const CH = {');
  assert.ok(start >= 0, 'preload.js içinde `const CH = {` bloğu yok — ayna bozuldu');
  const end = preloadJs.indexOf('};', start);
  return [...preloadJs.slice(start, end).matchAll(/([A-Z_]+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
}

test('tur2/ipc-channels 1: CHANNELS kümesi sözleşme §7.2 tablosuyla BİREBİR (v2.3)', () => {
  const expected = contractChannels();
  assert.ok(expected.length >= 20, `sözleşme tablosundan yalnız ${expected.length} kanal okundu — tablo biçimi bozulmuş olabilir`);

  const actual = entries.map(([, v]) => v).sort();
  const missing = expected.filter((c) => !actual.includes(c));
  const extra = actual.filter((c) => !expected.includes(c));

  assert.deepStrictEqual(missing, [],
    `kodda olmayan sözleşme kanalı (uygulanmamış): ${missing.join(', ')}`);
  assert.deepStrictEqual(extra, [],
    `sözleşmede olmayan kanal (önce sözleşmeye eklenmeli — API-58): ${extra.join(', ')}`);
});

test('tur2/ipc-channels 2: kanal adları API-47 biçiminde; anahtar ve değerler tekil', () => {
  const values = entries.map(([, v]) => v);
  assert.strictEqual(new Set(values).size, values.length, 'CHANNELS içinde yinelenen kanal DEĞERİ var');
  const keys = entries.map(([k]) => k);
  assert.strictEqual(new Set(keys).size, keys.length, 'CHANNELS içinde yinelenen anahtar var');

  const bad = values.filter((c) => !CHANNEL_FORMAT.test(c));
  assert.strictEqual(bad.length, 0,
    `API-47 ihlali — biçime uymayan kanallar: ${bad.join(', ')}. ` +
    'Domain §7.1 listesinden; action küçük harf başlar, camelCase serbest.');
});

test('tur2/ipc-channels 3: main.js invoke kanallarının TAMAMINI kaydediyor (fazla yok, eksik yok)', () => {
  const handled = mainHandledKeys();
  const missing = invokeKeys.filter((k) => !handled.includes(k));
  const extra = handled.filter((k) => !invokeKeys.includes(k));
  assert.deepStrictEqual(missing, [], `main.js handler kaydetmeyen invoke kanalları: ${missing.join(', ')} — preload çağrısı asılı kalır`);
  assert.deepStrictEqual(extra, [], `main.js invoke olmayan kanal kaydediyor: ${extra.join(', ')}`);
});

test('tur2/ipc-channels 4: preload CH aynası shared ile anahtar+değer birebir', () => {
  const mirror = preloadChEntries();
  assert.strictEqual(mirror.length, entries.length,
    `preload CH aynası ${mirror.length} girdi; shared ${entries.length} — ayna kayıyor`);

  const mirrorMap = new Map(mirror);
  const diffs = [];
  for (const [key, value] of entries) {
    if (!mirrorMap.has(key)) diffs.push(`preload eksik: ${key} (${value})`);
    else if (mirrorMap.get(key) !== value) diffs.push(`${key}: preload=${mirrorMap.get(key)} shared=${value}`);
  }
  for (const [key] of mirror) {
    if (!Object.prototype.hasOwnProperty.call(CHANNELS, key)) diffs.push(`preload fazla: ${key}`);
  }
  assert.deepStrictEqual(diffs, [], `ayna kayması (API-46 / K3 kapısı): ${diffs.join(' | ')}`);
});

test('tur2/ipc-channels 5: preload call(CH.X) kümesi = invoke anahtar kümesi; her CH.X geçerli', () => {
  const usedKeys = [...new Set([...preloadJs.matchAll(/CH\.([A-Z_]+)/g)].map((m) => m[1]))];
  const invalid = usedKeys.filter((k) => !Object.prototype.hasOwnProperty.call(CHANNELS, k));
  assert.deepStrictEqual(invalid, [], `preload'de CHANNELS'ta olmayan CH.X kullanımı: ${invalid.join(', ')}`);

  const calledKeys = [...new Set([...preloadJs.matchAll(/call\(CH\.([A-Z_]+)/g)].map((m) => m[1]))];
  const missingCall = invokeKeys.filter((k) => !calledKeys.includes(k));
  const extraCall = calledKeys.filter((k) => !invokeKeys.includes(k));
  assert.deepStrictEqual(missingCall, [], `preload'in açmadığı invoke kanalları: ${missingCall.join(', ')} — API-48 beyaz liste eksik`);
  assert.deepStrictEqual(extraCall, [], `preload'in call() ile açtığı ama invoke olmayan kanallar: ${extraCall.join(', ')}`);
});

test('tur2/ipc-channels 6: push kanalları yalnız ipcRenderer.on ile dinlenir; invoke edilmez (API-49)', () => {
  const pushValues = pushKeys.map((k) => CHANNELS[k]);
  assert.deepStrictEqual(pushValues.sort(), contractPushChannels().sort(),
    'push kanalları sözleşme §7.2 (**push**) ile uyuşmuyor');

  for (const key of PUSH_KEYS) {
    assert.doesNotMatch(preloadJs, new RegExp(`call\\(CH\\.${key}\\)`),
      `push kanalı ${key} preload'de call() ile invoke ediliyor — API-49`);
    assert.match(preloadJs, new RegExp(`ipcRenderer\\.on\\(CH\\.${key},`),
      `push kanalı ${key} ipcRenderer.on ile dinlenmiyor`);
  }
  /* EVENT_SUBSCRIBE bir invoke kanalıdır (abonelik başlatır), push değildir. */
  assert.ok(invokeKeys.includes('EVENT_SUBSCRIBE'), 'EVENT_SUBSCRIBE invoke olmalı');
});

test('tur2/ipc-channels 7: WRITE_CHANNELS sözleşme API-51a listesiyle birebir', () => {
  /* Sözleşmedeki API-51a satırından yazma kanallarını çıkar (tek gerçek kaynak). */
  const line = contract.split(/\r?\n/).find((l) => l.includes('| API-51a |'));
  assert.ok(line, 'sözleşmede API-51a satırı yok — yazma kapısı sözleşmesiz kaldı');

  const declared = [...line.matchAll(/`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`/g)].map((m) => m[1])
    .filter((c) => !c.includes('settings:set')); // API-105 muafiyeti cümlede geçer
  const declaredSet = new Set(declared);

  assert.deepStrictEqual(
    WRITE_CHANNELS.slice().sort(),
    [...declaredSet].sort(),
    `WRITE_CHANNELS (${WRITE_CHANNELS.length}) sözleşme API-51a (${declaredSet.size}) ile uyuşmuyor`
  );

  const invokeValues = new Set(invokeKeys.map((k) => CHANNELS[k]));
  const outside = WRITE_CHANNELS.filter((c) => !invokeValues.has(c));
  assert.deepStrictEqual(outside, [], `WRITE_CHANNELS içinde invoke olmayan kanal: ${outside.join(', ')}`);
  assert.strictEqual(new Set(WRITE_CHANNELS).size, WRITE_CHANNELS.length, 'WRITE_CHANNELS içinde yinelenen kanal var');

  const handled = new Set(mainHandledKeys());
  const unhandled = WRITE_CHANNELS
    .map((c) => Object.keys(CHANNELS).find((k) => CHANNELS[k] === c))
    .filter((k) => !handled.has(k));
  assert.deepStrictEqual(unhandled, [], `handler'ı olmayan yazma kanalı: ${unhandled.join(', ')}`);
});

test('tur2/ipc-channels 8: her yazma kanalı main.js içinde confirm.verify ile kapılı (API-51a)', () => {
  /* Her kapılı kanalın handler gövdesinde confirm.verify(payload.confirmToken, CHANNELS.X) olmalı. */
  const open = [];
  for (const value of WRITE_CHANNELS) {
    const key = Object.keys(CHANNELS).find((k) => CHANNELS[k] === value);
    const start = mainJs.indexOf(`ipcMain.handle(CHANNELS.${key}`);
    if (start < 0) { open.push(`${value} (handler yok)`); continue; }
    const next = mainJs.indexOf('ipcMain.handle(', start + 10);
    const body = mainJs.slice(start, next > 0 ? next : mainJs.length);
    if (!new RegExp(`confirm\\.verify\\(payload\\.confirmToken,\\s*CHANNELS\\.${key}`).test(body)) {
      open.push(value);
    }
  }
  assert.deepStrictEqual(open, [], `confirmToken kapısı olmayan yazma kanalı: ${open.join(', ')}`);
});
