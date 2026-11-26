'use strict';

// Tur 2 / SSE olay adları sözleşmesi — API-74/93 (EMİR T-020'den devralındı, EMİR T-025)
// Kaynak: docs/console-api-contract.md §8.7 — "Tur 2'de abone olunacak alt küme".
//
// İddialar:
//  - EVENT_TYPES, §8.7 alt kümesiyle SIRA DAHİL birebir (37 ad; API-93: kod tek kaynak,
//    sözleşme listesiyle eşleşmeli; fazlası da eksisi de ihlal).
//  - v1 adları (session.updated, message.updated, session.error, message.removed) kod
//    yollarında HİÇ geçmez — yalnız LEGACY_EVENT_TYPES bildirimi + yorumlarda yaşar.
//  - BACKOFF_MS merdiveni API-36: 1,2,4,8,16,30 sn.
//  - pickEventRef yalnız {sessionID} çıkarır (API-21: ham gövde renderer'a geçmez).
//  - isKnownType bilinen/yalın adları doğru ayırır.
//
// Not (sözleşme gerilimi, raporlanır): API-93 kaynağı `src/shared/events.js` adını verir;
// gerçek modül `src/main/services/events.js`'tir (EMİR T-025 ölçümü).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ROOT, SRC, read } = require('../lib');

const eventsModule = require(path.join(SRC, 'main', 'services', 'events.js'));
const eventsJs = read(path.join(SRC, 'main', 'services', 'events.js'));
const mainJs = read(path.join(SRC, 'main', 'main.js'));
const appJs = read(path.join(SRC, 'renderer', 'app.js'));
const preloadJs = read(path.join(SRC, 'preload', 'preload.js'));
const contract = read(path.join(ROOT, 'docs', 'console-api-contract.md'));

/** §8.7 "Tur 2'de abone olunacak alt küme" ```text bloğundan ad listesini çözümler. */
function contractEventNames() {
  const marker = contract.indexOf('### 8.7');
  assert.ok(marker >= 0, 'console-api-contract.md içinde §8.7 bulunamadı — test sözleşmeye yeniden bağlanmalı');
  const fenceStart = contract.indexOf('```text', marker);
  const fenceEnd = contract.indexOf('```', fenceStart + 7);
  assert.ok(fenceStart >= 0 && fenceEnd > fenceStart, '§8.7 alt küme bloğu (```text …```) bulunamadı — sözleşme biçimi değişti');

  const block = contract.slice(fenceStart + 7, fenceEnd);
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('`'))
    .flatMap((line) => line.split(/\s+/));
}

/** Yorumları ve LEGACY_EVENT_TYPES bildirim bloğunu soyup yalnız yürütülebilir metin bırakır. */
function executableText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')                                   // blok yorumlar
    .replace(/^\s*\/\/.*$/gm, '')                                        // satır yorumları
    .replace(/const LEGACY_EVENT_TYPES[\s\S]*?\]\);/g, '');              // v1 bildirim bloğu
}

test('tur2/events 1: EVENT_TYPES §8.7 alt kümesiyle sıra dahil birebir (API-93)', () => {
  const expected = contractEventNames();
  assert.ok(expected.length >= 30, `§8.7 alt kümesi anlamsız kısa: ${expected.length} ad`);

  assert.deepStrictEqual([...eventsModule.EVENT_TYPES], expected,
    `EVENT_TYPES §8.7 listesiyle birebir olmalı (fazlası da eksisi de ihlal, API-93).\n` +
    `  sözleşme: ${expected.length} ad · kod: ${eventsModule.EVENT_TYPES.length} ad`);
});

test('tur2/events 2: v1 olay adları kod yollarında geçmiyor (API-74)', () => {
  const legacy = ['session.updated', 'message.updated', 'session.error', 'message.removed'];
  const sources = [
    { label: 'services/events.js', text: executableText(eventsJs) },
    { label: 'main/main.js', text: executableText(mainJs) },
    { label: 'renderer/app.js', text: executableText(appJs) },
    { label: 'preload/preload.js', text: executableText(preloadJs) }
  ];

  const offenders = [];
  for (const { label, text } of sources) {
    for (const name of legacy) {
      if (text.includes(name)) offenders.push(`${label}: ${name}`);
    }
  }
  assert.deepStrictEqual(offenders, [],
    `v1 olay adı yürütülebilir kodda geçiyor (API-74 — bu sunucuda yok, ölü yol):\n  - ${offenders.join('\n  - ')}`);
});

test('tur2/events 3: LEGACY_EVENT_TYPES yalnız 4 v1 adını taşır; bildirim+export ile sınırlı', () => {
  assert.deepStrictEqual([...eventsModule.LEGACY_EVENT_TYPES],
    ['session.updated', 'message.updated', 'session.error', 'message.removed'],
    'LEGACY_EVENT_TYPES yalnız 4 bilinen v1 adını listelemeli');

  const occurrences = (eventsJs.match(/LEGACY_EVENT_TYPES/g) || []).length;
  assert.strictEqual(occurrences, 2,
    `LEGACY_EVENT_TYPES tanımlayıcısı ${occurrences} kez geçiyor; beklenen 2 (bildirim + export) — ` +
    'başka yerde kullanılıyorsa denetim amaçlı sızıntı olabilir');
});

test('tur2/events 4: BACKOFF_MS merdiveni API-36 — 1,2,4,8,16,30 sn', () => {
  assert.deepStrictEqual([...eventsModule.BACKOFF_MS], [1000, 2000, 4000, 8000, 16000, 30000],
    `BACKOFF_MS merdiveni sözleşmeden sapıyor: ${eventsModule.BACKOFF_MS.join(', ')} (API-36)`);
});

test('tur2/events 5: pickEventRef — yalnız {sessionID} çıkarır; bilinen tüm gövde biçimleri', () => {
  const { pickEventRef } = eventsModule;

  // Canlı sunucuda doğrulanmış gövde biçimleri (§8.7 notları).
  const cases = [
    [{ sessionID: 'ses_1' }, 'ses_1'],
    [{ sessionId: 'ses_2' }, 'ses_2'],                                    // büyük/küçük varyant
    [{ session: { id: 'ses_3' } }, 'ses_3'],                              // iç içe seans
    [{ session: { sessionID: 'ses_3b' } }, 'ses_3b'],
    [{ properties: { sessionID: 'ses_4' } }, 'ses_4'],                    // properties zarfı
    [{ properties: { sessionId: 'ses_4b' } }, 'ses_4b']
  ];
  for (const [input, expectedID] of cases) {
    const ref = pickEventRef(input);
    assert.deepStrictEqual(ref, { sessionID: expectedID },
      `pickEventRef(${JSON.stringify(input)}) → ${JSON.stringify(ref)}; beklenen {sessionID:'${expectedID}'}`);
  }

  // Boş/bolek girdiler: null — asla exception, asla uydurma kimlik.
  for (const input of [null, undefined, 'text', 42, {}, { session: {} }, { properties: {} }]) {
    const ref = pickEventRef(input);
    assert.deepStrictEqual(ref, { sessionID: null },
      `pickEventRef(${JSON.stringify(input)}) boş girdide {sessionID:null} dönmeli; bulunan: ${JSON.stringify(ref)}`);
  }

  // API-21: dönüş DEĞERİ yalnız sessionID anahtarı taşır — ham gövde sızması yok.
  const ref = pickEventRef({ sessionID: 'ses_x', title: 'DEV · Yazılımcı', tokens: { input: 5 } });
  assert.deepStrictEqual(Object.keys(ref), ['sessionID'],
    `pickEventRef dönüşü fazladan alan taşıyor: ${Object.keys(ref).join(', ')} (API-21: ham gövde geçmez)`);
});

test('tur2/events 6: isKnownType — §8.7 adları bilinir, v1 ve uydurma adlar bilinmez', () => {
  const { isKnownType } = eventsModule;

  assert.strictEqual(isKnownType('server.connected'), true, 'server.connected bilinmeli');
  assert.strictEqual(isKnownType('session.created'), true, 'session.created bilinmeli');
  assert.strictEqual(isKnownType('filesystem.changed'), true, 'filesystem.changed bilinmeli');

  assert.strictEqual(isKnownType('session.updated'), false, 'v1 adı session.updated bilinMEMELİ (API-74)');
  assert.strictEqual(isKnownType('message.updated'), false, 'v1 adı message.updated bilinMEMELİ');
  assert.strictEqual(isKnownType('session.error'), false, 'v1 adı session.error bilinMEMELİ');
  assert.strictEqual(isKnownType(''), false, 'boş ad bilinmemeli');
  assert.strictEqual(isKnownType('totally.made-up'), false, 'uydurma ad bilinmemeli');
});
