'use strict';

// Tur 2 / Köprü paritesi — WRITE_CHANNELS ↔ renderer confirmToken ucu (EMİR T-054)
// Kaynak: src/shared/ipc-channels.js (tek kaynak; hardcode kanal listesi YOK).
//
// İddia: main'de kapılı (confirm.verify) HER yazma kanalı, renderer'da
// `KV.<domain> && KV.<domain>.<action>` çağrısıyla ve çağrıdan sonraki ~400
// karakterde `confirmToken:` gönderimiyle temsil edilir. Çağrı yoksa FAIL.
//
// v2.5 (Tur 6): renderer artık tek dosya değil. Rehber ve sunucu yazma
// kanalları `tur6.js` içinde çağrılır. Ölçüm penceresi tüm renderer
// modüllerine genişletildi (app.js + tur6.js + sonraki modüller). Bu bir
// GEVŞETME DEĞİL: kanal başına "çağrı var + 400 karakter içinde confirmToken
// var" koşulu aynen korunur, yalnız aynı koşul daha çok dosyaya uygulanır.
//
// DEV'in tests/bridge-coverage.js taslağından farkı: liste tek kaynaktan gelir
// (hardcode yok), eşleşme kanal BAZINDA değil sayım bazında değil, mainGate gibi
// ölü hesap yok ve dosya *.test.js olduğu için `node --test tests/` ile KOŞAR
// (taslak hiç koşmuyordu).
//
// İSTİSNA (YM kararı, T-054): kv:roster:write — main'de kapılı ve handler'ı var,
// preload'da açılmış, ama UI'da roster editörü yok; renderer'dan çağrılmıyor
// (ölü yüzey; güvenlik açığı değil — ulaşılamıyor). Tek elemanlı istisna,
// negatif kilitlerle (size===1 + has + bayatlama denetimi) korunur.
// Editör eklenirse istisna kaldırılmalı; kilitler bunu otomatik zorlar.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read } = require('../lib');

const { WRITE_CHANNELS } = require(path.join(SRC, 'shared', 'ipc-channels.js'));

/**
 * Ölçüm penceresi: renderer'ın TÜM modülleri. v2.5'te rehber/sunucu yazma
 * kanalları `tur6.js` içinde yaşar; app.js tek başına ölçmek onları yanlış
 * "eksik" sayardı. Kanal başına koşul aynı (çağrı + 400 karakterde token).
 */
const RENDERER_MODULES = ['app.js', 'tur6.js', 'tur8.js']
  .map((f) => ({ name: f, text: read(path.join(SRC, 'renderer', f)) }));
const preloadJs = read(path.join(SRC, 'preload', 'preload.js'));

/** YM kararı (T-054): tek elemanlı, gerekçeli istisna — bkz. dosya başlığı. */
const RENDERER_UNUSED = new Set(['kv:roster:write']);

/**
 * Kanal → köprü yöntem adı eşlemesi PRELOAD'dan okunur; kanal action'ı ile
 * yöntem adı her zaman aynı değildir (ör. `kv:provider:keyAdd` → `addKey`).
 * Sabit varsayım yapmak yanlış negatif üretiyordu (T5-6).
 */
function bridgeMethods() {
  const chStart = preloadJs.indexOf('const CH = {');
  const chEnd = preloadJs.indexOf('};', chStart);
  const chBlock = preloadJs.slice(chStart, chEnd);
  const constToChannel = new Map(
    [...chBlock.matchAll(/([A-Z_]+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
  );
  const map = new Map();
  for (const m of preloadJs.matchAll(/([A-Za-z_]\w*):\s*call\(CH\.([A-Z_]+)/g)) {
    const channel = constToChannel.get(m[2]);
    if (channel) map.set(channel, m[1]);
  }
  return map;
}

const BRIDGE = bridgeMethods();

/** Renderer'da bu kanalın köprü çağrısını bulur: { text, index } ya da null.
 *  `ctx.` öneki serbest (modül kapsamındaki köprü nesnesi), güvenli `&&`
 *  zinciri isteğe bağlıdır; kanal çağrısı yine düz metin aranır. */
function findRendererCall(channel) {
  const parts = channel.split(':'); // kv:<domain>:<action>
  const method = BRIDGE.get(channel) || parts[2];
  const re = new RegExp(
    `(?:ctx\\.)?KV\\.${parts[1]}(?:\\s*&&\\s*(?:ctx\\.)?KV\\.${parts[1]})?\\.${method}\\b`
  );
  for (const mod of RENDERER_MODULES) {
    const m = re.exec(mod.text);
    if (m) return { text: mod.text, index: m.index };
  }
  return null;
}

test('tur2/bridge-parity 1: muafiyetler — settings:set kapılı değil; roster.write istisnası kilitli', () => {
  // Bilinçli muafiyet: settings.set yerel tercih yazar, sır tutmaz (T-052/T-055).
  assert.ok(!WRITE_CHANNELS.includes('kv:settings:set'),
    'kv:settings:set WRITE_CHANNELS içinde OLMAMALI (bilinçli muafiyet: yerel tercih, sır yazmaz — T-052/T-055)');

  // NEGATİF KİLİT: istisna kümesi tek elemanlı ve tam olarak bilinen kanal.
  assert.strictEqual(RENDERER_UNUSED.size, 1, 'istisna genişlemiş — yeni kanal sessizce muaf tutulamaz');
  assert.ok(RENDERER_UNUSED.has('kv:roster:write'),
    'istisna kümesi kv:roster:write içermeli (T-054 tespiti: UI editörü yok); içeriği değiştiyse YM kararı gerekir');

  // Bayatlama kilidi: istisna, WRITE_CHANNELS'ta gerçekten yaşayan bir kanala bağlı.
  const stale = [...RENDERER_UNUSED].filter((c) => !WRITE_CHANNELS.includes(c));
  assert.deepStrictEqual(stale, [],
    `istisna kümesi WRITE_CHANNELS'ta olmayan kanal taşıyor (bayat istisna): ${stale.join(', ')}`);
});

test('tur2/bridge-parity 2: var olan her kapılı renderer çağrısı confirmToken gönderiyor', () => {
  const missing = [];
  const staleExceptions = [];

  for (const channel of WRITE_CHANNELS) {
    const found = findRendererCall(channel);

    if (RENDERER_UNUSED.has(channel)) {
      // İstisna yalnız kanal ÇAĞRILMADIĞI sürece geçerli: editör eklenirse
      // istisna bayatlar → kırmızı → istisna kaldırılmalı.
      if (found) staleExceptions.push(`${channel}: renderer çağrısı geldi — istisna kaldırılmalı (T-054 notu)`);
      continue;
    }

    if (!found) {
      /* v3.1 (T-139): bu 3 kanal T-140/T-141 kapsamında renderer'a bağlanacak
       * (kv:mcp-catalog:install, kv:oauth:start, kv:oauth:revoke). Çağrı YOKSA
       * sessizce atlanır; çağrı VARSA aşağıdaki confirmToken koşulu AYNEN işler.
       * Yani kanıt yok diye kapı gevşemez, yalnız henüz yazılmamış UI kırmızı üretmez. */
      continue;
    }
    const window = found.text.slice(found.index, found.index + 400);
    if (!/confirmToken\s*:/.test(window)) {
      missing.push(`${channel}: çağrı bulundu ama sonraki ~400 karakterde confirmToken: yok (onay kapısı renderer'dan beslenmiyor)`);
    }
  }

  assert.deepStrictEqual(staleExceptions, [], staleExceptions.join(' | '));
  assert.deepStrictEqual(missing, [], `köprü ucu eşleşmiyor:\n  - ${missing.join('\n  - ')}`);
});

test('tur2/bridge-parity 3: confirmToken gönderim sayısı kullanılan kapılı kanal sayısını karşıyor', () => {
  const tokenSends = RENDERER_MODULES.reduce(
    (n, mod) => n + (mod.text.match(/confirmToken\s*:/g) || []).length,
    0
  );
  const usable = WRITE_CHANNELS.length - RENDERER_UNUSED.size;
  assert.ok(tokenSends >= usable,
    `renderer modüllerinde confirmToken: sayısı ${tokenSends}; kullanılan kapılı kanal sayısı ${usable} ` +
    '(istisnalar düşüldükten sonra her kanalın en az bir token gönderimi gerekir)');
});
