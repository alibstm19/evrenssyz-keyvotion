'use strict';

// T4 — IPC kanal adları sözleşmeye uygun (emir T-015 zorunlu başlık 4)
// API sözleşmesi §7: API-46 (tek kaynak shared/ipc-channels.js), API-47 (kv:<domain>:<action>),
// I1/I2/I3 denetimleri.
//
// v2.1 (EMİR T-025 / sözleşme v2.2, S-2): API-47'nin yeni ad kuralı — domain yalnız
// küçük harf ve §7.1'in 10 alanından; action küçük harf başlar, camelCase SERBESTTİR
// (kv:team:setLeader, kv:reports:list, kv:roster:read/write geçerlidir).
// YM kararı: preload sandbox:true altında shared modülü require edemediği için kanal
// adlarını BİLİNÇLİ LİTERAL AYNA (CH) taşır — bu ihlal değil; T4c aynanın shared ile
// değer+anahtar eşitliğini ölçer. main.js handler'ları CHANNELS.X sabitiyle kayıtlı
// olduğu için T4b kayıtları da sabitten okur (eski literal tarama 0 handler buluyordu).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, ROOT, walk, isJs, read, readIfExists } = require('./lib');

// v2.4: §7.1 domain kümesi SÖZLEŞMEDEN okunur (sabit liste tutulmaz).
const contractText = read(path.join(ROOT, 'docs', 'console-api-contract.md'));
function contractDomains() {
  const start = contractText.indexOf('### 7.1');
  const end = contractText.indexOf('### 7.2', start);
  const section = contractText.slice(start, end > 0 ? end : contractText.length);
  const flat = section.slice(section.indexOf('domain ∈')).split(/\(|```/)[0];
  /* v3.1: domain artık hyphen taşıyabilir (mcp-catalog). Sözcük sınırı yerine
   * yalnız küçük harf + hyphen dizileri ayrıştırılır; aksi halde "mcp-catalog"
   * iki parçaya bölünüp domain kümesinden düşerdi. */
  const found = flat.split(/[^a-z-]+/).filter(Boolean);
  const stop = new Set(['domain', 'action', 'kv', 've', 'yalnız', 'küçük', 'harf']);
  return [...new Set(found.filter((d) => !stop.has(d)))];
}
const DOMAINS = contractDomains();
// v2.1 (S-2): action küçük harf başlar, camelCase serbest.
const CHANNEL_FORMAT = new RegExp(`^kv:(?:${DOMAINS.join('|')}):[a-z][a-zA-Z]*(?:-[a-zA-Z]+)*$`);

const CHANNEL_LITERAL = /(['"])(kv:[^'"\n]+)\1/g;

function extractChannels(text) {
  const found = [];
  let m;
  CHANNEL_LITERAL.lastIndex = 0;
  while ((m = CHANNEL_LITERAL.exec(text)) !== null) found.push(m[2]);
  return found;
}

const mainSrc = read(path.join(SRC, 'main', 'main.js'));
const preloadSrc = read(path.join(SRC, 'preload', 'preload.js'));
const channelsShared = readIfExists(path.join(SRC, 'shared', 'ipc-channels.js'));

// v2.1: shared tablosu doğrudan require edilir (test kökten çalışır; modül saf JS).
const { CHANNELS } = require(path.join(SRC, 'shared', 'ipc-channels.js'));
const sharedValues = Object.values(CHANNELS);

// Preload CH aynası (work/smoke/compare-channels.js mantığı).
function preloadChMap() {
  const blockStart = preloadSrc.indexOf('const CH = {');
  const blockEnd = preloadSrc.indexOf('};', blockStart);
  const block = preloadSrc.slice(blockStart, blockEnd);
  return new Map([...block.matchAll(/([A-Z_]+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
}

// v2.1: main kayıtları sabit adından — ipcMain.handle(CHANNELS.X
function mainHandledKeys() {
  return [...mainSrc.matchAll(/ipcMain\.handle\(CHANNELS\.([A-Z_]+)/g)].map((m) => m[1]).filter(Boolean);
}

// Kanal yazan tüm kaynak dosyalar (tek kaynak ve bilinçli ayna hariç).
const srcFiles = walk(SRC, isJs).filter((f) => {
  const rel = path.relative(SRC, f);
  return rel !== path.join('shared', 'ipc-channels.js') && rel !== path.join('preload', 'preload.js');
});

test('T4a: tüm kanal adları API-47 biçiminde — kv:<domain>:<action> (camelCase serbest, S-2)', () => {
  const channels = [...sharedValues, ...preloadChMap().values()];
  assert.ok(channels.length >= 2, `en az 2 kanal beklenirdi; bulunan: ${channels.join(', ') || '(yok)'}`);

  const bad = channels.filter((c) => !CHANNEL_FORMAT.test(c));
  assert.strictEqual(
    bad.length,
    0,
    `API-47 (v2.2) ihlali — kv:<domain>:<action> biçimine uymayan kanallar: ${bad.join(', ')}. ` +
      'Domain kümesi §7.1’in 10 alanı; action küçük harf başlar, camelCase serbesttir.'
  );
});

test('T4b: preload invoke kanalları, main tarafından handle edilen kanalların alt kümesi', () => {
  // v2.1: main.js kanalları CHANNELS.X sabitiyle kaydeder; literal tarama yerine
  // kayıt sabitleri okunur (eski test 0 handler buluyordu — ölçüm hatası).
  const handledKeys = mainHandledKeys();
  assert.ok(handledKeys.length >= 1, `main.js en az bir ipcMain.handle(CHANNELS.X kaydı taşımalı; bulunan: ${handledKeys.length}`);
  const handledValues = handledKeys.map((k) => CHANNELS[k]).filter(Boolean);
  assert.deepStrictEqual(handledValues.length, handledKeys.length, 'main.js bilinmeyen CHANNELS sabiti kaydediyor');

  // preload'da invoke edilen kanallar: call(CH.X) kapamaları.
  const invokedKeys = [...new Set([...preloadSrc.matchAll(/call\(CH\.([A-Z_]+)/g)].map((m) => m[1]))];
  assert.ok(invokedKeys.length >= 1, 'preload en az bir kanal invoke etmeli');

  const missing = invokedKeys.filter((k) => !handledKeys.includes(k));
  assert.strictEqual(
    missing.length,
    0,
    `preload’in invoke ettiği ama main’in handle etmediği sabitler: ${missing.join(', ')} — çağrı asılı kalır`
  );
});

test('T4c: API-46/I1 — literal kanal yalnız tek kaynakta; preload aynası shared ile eşit (YM kararı)', () => {
  assert.ok(channelsShared, 'src/shared/ipc-channels.js yok — kanal sabitleri tek kaynağa alınmalı (API-46)');

  // 1) Tek kaynak + bilinçli ayna dışında literal kanal adı taşıyan dosya yok.
  const offenders = [];
  for (const file of srcFiles) {
    if (extractChannels(read(file)).length > 0) {
      offenders.push(path.relative(SRC, file));
    }
  }
  assert.strictEqual(
    offenders.length,
    0,
    `shared/ipc-channels.js ve preload.js (bilinçli ayna) dışında kanal adı stringi taşıyan dosyalar: ${offenders.join(', ')} (API-46)`
  );

  // 2) Ayna eşitliği: preload CH == shared CHANNELS (anahtar VE değer; K3 kapısı).
  const chMap = preloadChMap();
  const diffs = [];
  for (const [key, value] of Object.entries(CHANNELS)) {
    if (!chMap.has(key)) diffs.push(`preload eksik: ${key} (${value})`);
    else if (chMap.get(key) !== value) diffs.push(`${key}: preload=${chMap.get(key)} shared=${value}`);
  }
  for (const key of chMap.keys()) {
    if (!Object.prototype.hasOwnProperty.call(CHANNELS, key)) diffs.push(`preload fazla: ${key}`);
  }
  assert.deepStrictEqual(
    diffs,
    [],
    `preload CH aynası src/shared/ipc-channels.js ile kayıyor (K3/compare-channels): ${diffs.join(' | ')}`
  );
});
