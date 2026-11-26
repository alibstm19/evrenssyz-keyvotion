'use strict';

// API sözleşmesinin otomatik denetlenebilir kuralları (console-api-contract.md §12: A1–A5, I4)
// API-25/56 dönüş zarfı, API-46/47 kanal kaynağı t04'te; A6–A10 canlı/elle test ister.
//
// v2.1 (EMİR T-025 / sözleşme v2.2): gerçek ağ katmanı src/main/services/http-client.js'tir;
// src/main/opencode/client.js fetch'siz deprecated sarmalayıcıdır (YM kararı, T-017) ve
// artık A1/A4 denetimine dahil edilmez. Handler blokları kanal SABİTİNDEN (CHANNELS.APP_*)
// çözülür — literal kanal adı main.js'te geçmez (API-46). Kod tablosu src/shared/errors.js'te
// §5.2'nin 19 koduyla denetlenir. API-94 davranışı (E_DUPLICATE_ROLE) roster.assertUniqueCode
// birim testiyle ölçülür (YM T-040 şartnamesi: saf, yerel, ağ gerekmez).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ROOT, SRC, walk, isJs, read, grepLines, passwordMentionsUnsanctioned } = require('./lib');

const mainJs = read(path.join(SRC, 'main', 'main.js'));
const preloadJs = read(path.join(SRC, 'preload', 'preload.js'));
const httpClientJs = read(path.join(SRC, 'main', 'services', 'http-client.js'));
const clientJs = read(path.join(SRC, 'main', 'opencode', 'client.js'));

// v2.1: handler gövdesini kanal sabitinden ayır (main.js'te kanal adı literal GEÇMEZ;
// eski test 'kv:app:ping' string'i aradığı için handler'ı bulamıyordu).
function handlerBlock(key) {
  const start = mainJs.indexOf(`ipcMain.handle(CHANNELS.${key}`);
  if (start < 0) return '';
  const next = mainJs.indexOf('ipcMain.handle(', start + 10);
  return mainJs.slice(start, next < 0 ? mainJs.length : next);
}

/* ================= API-01 — A1 (v3.0, T-126 → T-131) =================
 *
 * ESKİ KURAL (kaldırıldı, T-126): "src içinde `fetch(` yalnız http-client.js'te,
 * tam 4 çağrı". O kural SÖZDİZİMİNE bakıyordu; `const doFetch = globalThis.fetch`
 * takma adını kaçırdığı için v3.0'ın iki yeni ağ modülünü (integrations.js,
 * mcp-client.js) görmeden YEŞİL kalıyordu (yanlış yeşil).
 *
 * v3.0 (T-130) API-01'i DÖRT parçaya ayırır; bu test her parçayı AYRI küme olarak
 * TAM EŞİTLİKLE denetler (gevşetme yok):
 *   (a) renderer ağa çıkamaz, CSP `connect-src 'none'`
 *   (b) OUTBOUND — dışarı istek atan modüller: sözleşmedeki tablo kümesi (3)
 *   (c) INBOUND — gelen bağlantı kabul edenler: yalnız uzaktan kontrol sunucusu (1)
 *   (d) SERVED — tarayıcıya gönderilen istemci sayfası (1)
 *
 * Ölçüt DAVRANIŞ ve DOSYA KÜMESİdir, metin hilesi değil: bir modül `node:http`
 * yüklediği için outbound sayılmaz, `createServer`+`listen` varsa inbound sayılır.
 * Beyaz listeler testte sabit tutulmaz; sözleşmeden türetilir
 * (tur10/contract-derive.test.js deseni: sözleşme tek kaynak).
 */
const API_CONTRACT = read(path.join(ROOT, 'docs', 'console-api-contract.md'));
const API_01_LINE = API_CONTRACT.split(/\r?\n/).find((l) => /\|\s*API-01\s*\|/.test(l)) || '';
const INDEX_HTML = read(path.join(SRC, 'renderer', 'index.html'));

/* (b) OUTBOUND işaretleri — dışarı çağrı: doğrudan, TAKMA AD, ham node client, XHR. */
const OUTBOUND_MARKERS = [
  { name: 'fetch(', re: /\bfetch\s*\(/ },
  { name: 'globalThis.fetch', re: /\bglobalThis\.fetch\b/ },
  { name: 'window.fetch', re: /\bwindow\.fetch\b/ },
  { name: 'http(s).request(', re: /\bhttps?\.request\s*\(/ },
  { name: 'net.connect(', re: /\bnet\.connect\s*\(/ },
  { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { name: 'require(node:http)', re: /\brequire\(['"]node:https?['"]\)/ }
];

/* (c) INBOUND işaretleri — gelen bağlantı kabulü (sunucu). */
const INBOUND_MARKERS = [
  { name: 'http.createServer', re: /\bhttp\.createServer\b/ },
  { name: 'https.createServer', re: /\bhttps\.createServer\b/ },
  { name: 'listen(', re: /\.listen\s*\(/ }
];

/** Eşleşen işaret adları (saf fonksiyon — negatif kilitte de çağrılır). */
function markerNames(text, markers) {
  return markers.filter((m) => m.re.test(text)).map((m) => m.name);
}

const outboundMarks = (text) => markerNames(text, OUTBOUND_MARKERS);
const inboundMarks = (text) => markerNames(text, INBOUND_MARKERS);

/**
 * Tek dosyanın ağ sınıfı — YÖNLER AYRI ölçülür.
 * v3.1: `integrations.js` hem outbound (REST/OAuth token) hem inbound (OAuth
 * callback) olabilir; bu yüzden inbound işareti outbound'u ARTIK gizlemez.
 */
function classifyNetwork(text) {
  const out = outboundMarks(text);
  const inb = inboundMarks(text);
  /* `require('node:http')` TEK BAŞINA çıkış kanıtı değildir: inbound sunucu da
   * aynı modülü yükler. Güçlü işaret (fetch/request/connect/get) varsa dosya
   * gerçekten çıkış yapar; yalnız import varsa ve dosya inbound ise outbound sayılmaz. */
  const strong = out.filter((n) => !/^require\(node:https?\)$/.test(n));
  const outbound = strong.length > 0 || (out.length > 0 && inb.length === 0);
  return {
    outbound,
    inbound: inb.length > 0,
    outboundMarks: out,
    inboundMarks: inb
  };
}

/**
 * Sözleşmeden türetilen YÖNLÜ kümeler: API-01'in "ağ modülleri, yön ve politikalar"
 * TABLOSU. Her satır `| \`src/main/services/x\` | **outbound|inbound|served** | …`
 * biçimindedir → yön sözleşmede yazılıdır, testte sabit liste TUTULMAZ.
 */
function contractNetworkRows() {
  const start = API_CONTRACT.indexOf(API_01_LINE);
  assert.ok(start >= 0, 'API sözleşmesinde API-01 satırı yok');
  const rest = API_CONTRACT.slice(start);
  const end = rest.search(/\n\|\s*API-02\s*\|/);
  const block = end > 0 ? rest.slice(0, end) : rest;
  const sets = { outbound: [], inbound: [], served: [] };
  for (const m of block.matchAll(/^\|\s*`src\/main\/services\/([a-z0-9.-]+)`\s*\|\s*([^|]*)\|/gm)) {
    const rel = path.join('main', 'services', m[1]);
    const dir = m[2].toLowerCase();
    if (/\binbound\b/.test(dir)) sets.inbound.push(rel);
    else if (/\boutbound\b/.test(dir)) sets.outbound.push(rel);
    else if (/\bserved\b/.test(dir)) sets.served.push(rel);
  }
  for (const key of Object.keys(sets)) sets[key] = [...new Set(sets[key])].sort();
  return sets;
}

test('API A1 (API-01): outbound / inbound / served kümeleri sözleşmeyle tam eşit', () => {
  /* ---------- sözleşme bağı (sabit liste testte tutulmaz) ---------- */
  assert.ok(API_01_LINE, 'API sözleşmesinde API-01 satırı yok');

  const contractSets = contractNetworkRows();
  const expectedOutbound = contractSets.outbound;
  const expectedInbound = contractSets.inbound;
  const expectedServed = contractSets.served;
  assert.strictEqual(expectedOutbound.length, 3,
    `API-01 tablosu tam 3 outbound modül demeli; sözleşmeden ${expectedOutbound.length} çıktı`);
  assert.strictEqual(expectedInbound.length, 2,
    `API-01 tablosu tam 2 inbound modül demeli (remote.js + integrations.js); sözleşmeden ${expectedInbound.length} çıktı`);
  assert.strictEqual(expectedServed.length, 1,
    `API-01 tablosu tam 1 served sayfa demeli; sözleşmeden ${expectedServed.length} çıktı`);

  /* (5) Sözleşme dört parçayı ADIYLA yazmalı: outbound / inbound / remote.js / served sayfa. */
  for (const word of ['outbound', 'inbound', 'remote.js', 'integrations.js', 'remote-page.html']) {
    assert.ok(API_01_LINE.includes(word),
      `API-01 satırı "${word}" ayrımını adıyla yazmıyor (T-130 sözleşme metni eksik)`);
  }

  /* ---------- ölçüm: tüm src .js/.html (node_modules lib.walk içinde atlanır) ---------- */
  const scanned = walk(SRC, (f) => /\.(js|html)$/.test(f));
  const outbound = [];
  const inbound = [];
  const served = [];
  const details = [];
  for (const file of scanned) {
    const rel = path.relative(SRC, file);
    const text = read(file);
    const cls = classifyNetwork(text);
    if (!cls.outbound && !cls.inbound) continue;
    details.push(`${rel} [out:${cls.outboundMarks.join('|') || '-'} in:${cls.inboundMarks.join('|') || '-'}]`);
    /* (d) SERVED: main/services altındaki .html, tarayıcıya gönderilen istemci kodudur;
     * kendi `fetch(` çağrıları main prosesin outbound ağı DEĞİLDİR (API-01(e)). */
    const isServed = rel.endsWith('.html') && rel.startsWith(`main${path.sep}services${path.sep}`);
    if (isServed) served.push(rel);
    else {
      if (cls.inbound) inbound.push(rel);
      if (cls.outbound) outbound.push(rel);
    }
  }
  outbound.sort();
  inbound.sort();
  served.sort();
  const diag = `\n  işaretler: ${details.join(' | ')}`;

  /* (b) OUTBOUND — TAM EŞİTLİK: fazlalık da eksik de kırmızıdır. */
  assert.deepStrictEqual(
    outbound, expectedOutbound,
    'API-01(b) ihlali — outbound dosya kümesi sözleşmedeki modül kümesine eşit değil.' +
      `\n  ölçülen: ${outbound.join(', ') || '(yok)'}\n  beklenen: ${expectedOutbound.join(', ')}${diag}`
  );

  /* (c) INBOUND — TAM EŞİTLİK (sözleşme tablosundan türetilen küme). */
  assert.deepStrictEqual(
    inbound, expectedInbound,
    'API-01(c) ihlali — inbound dosya kümesi sözleşmedeki modül kümesine eşit değil.' +
      `\n  ölçülen: ${inbound.join(', ') || '(yok)'}\n  beklenen: ${expectedInbound.join(', ')}${diag}`
  );
  for (const inboundRel of inbound) {
    assert.ok(API_01_LINE.includes(inboundRel.replace(/\\/g, '/').replace('main/', 'src/main/')),
      `API-01 satırı inbound modülü (${inboundRel}) adıyla yazmıyor`);
    assert.ok(!expectedOutbound.includes(inboundRel),
      `${inboundRel} hem inbound hem outbound olamaz (kümeler ayrık)`);
  }

  /* (d) SERVED — TAM EŞİTLİK + served sayfayı inbound modül servis ediyor. */
  assert.deepStrictEqual(
    served, expectedServed,
    'API-01(d) ihlali — served sayfa kümesi sözleşmedeki kümeye eşit değil.' +
      `\n  ölçülen: ${served.join(', ') || '(yok)'}\n  beklenen: ${expectedServed.join(', ')}${diag}`
  );
  assert.ok(served[0].endsWith('remote-page.html'),
    `served kümesi remote-page.html olmalı; bulunan: ${served[0]}`);
  assert.ok(API_01_LINE.includes('remote-page.html'),
    'API-01 satırı served sayfayı (remote-page.html) adıyla yazmıyor');
  assert.ok(read(path.join(SRC, path.join('main', 'services', 'remote.js'))).includes(path.basename(served[0], '.html')),
    `remote.js served sayfayı (${path.basename(served[0])}) sunmuyor — inbound↔served bağı koptu`);

  /* (a) Renderer ağa çıkamaz — istisnasız, sıfır tolerans. */
  const rendererHits = outbound.concat(inbound).filter((rel) => rel.startsWith(`renderer${path.sep}`));
  assert.deepStrictEqual(rendererHits, [],
    `Renderer'da ağ işareti var (API-01(a)): ${rendererHits.join(', ')}${diag}`);

  /* (a) CSP kapısı. */
  const csp = (INDEX_HTML.match(/<meta[^>]+Content-Security-Policy[^>]*>/i) || [''])[0];
  assert.ok(csp, 'index.html içinde Content-Security-Policy meta etiketi yok');
  assert.match(csp, /connect-src\s+'none'/, "index.html CSP'sinde connect-src 'none' yok (API-02)");

  /* (6) Negatif kilit — dosya yazmadan: kümeler sessizce büyüyemez, renderer sızmaz,
   * dedektör takma adı yakalar (yanlış yeşil geri gelemez). */
  assert.strictEqual(expectedOutbound.length, 3, 'Negatif kilit: outbound kümesi 3 elemanlı olmalı');
  assert.strictEqual(outbound.length, 3, 'Negatif kilit: ölçülen outbound kümesi 3 elemanlı olmalı');
  assert.strictEqual(inbound.length, 2, 'Negatif kilit: inbound kümesi 2 elemanlı olmalı (remote.js + integrations.js)');
  assert.strictEqual(served.length, 1, 'Negatif kilit: served kümesi 1 elemanlı olmalı');

  const appJs = path.join('renderer', 'app.js');
  for (const [label, set] of [['outbound', outbound], ['inbound', inbound], ['served', served],
    ['beklenen', expectedOutbound]]) {
    assert.ok(!set.includes(appJs), `Negatif kilit: renderer/app.js ${label} kümesinde olmamalı`);
  }
  assert.deepStrictEqual(
    outboundMarks('const doFetch = globalThis.fetch;\nconst r = await doFetch(url);'),
    ['globalThis.fetch'],
    'Negatif kilit: dedektör takma adlı fetch çağrısını yakalamıyor (A1 yeniden yanlış yeşil olur)'
  );
  /* Beyaz liste dışı bir dosya `fetch(` taşırsa A1 KIRILIR: sınıflandırıcı onu outbound
   * sayar, küme 4 elemana çıkar ve tam-eşitlik assert'i düşer. Dosya yazmadan kanıt: */
  assert.strictEqual(classifyNetwork('const r = await fetch(url);').outbound, true,
    'Negatif kilit: beyaz liste dışı fetch( outbound sayılmıyor — A1 kör kalırdı');
  assert.strictEqual(inboundMarks('const r = await fetch(url);').length, 0,
    'Negatif kilit: düz fetch( yanlışlıkla inbound sayılıyor');
  assert.notStrictEqual(
    [...outbound, path.join('main', 'services', 'rogue.js')].length, 3,
    'Negatif kilit: dördüncü outbound dosyası küme boyutunu değiştirmiyor'
  );
  assert.deepStrictEqual(
    inboundMarks('const s = http.createServer(h); s.listen(0, "127.0.0.1");'),
    ['http.createServer', 'listen('],
    'Negatif kilit: dedektör inbound sunucu açılışını yakalamıyor'
  );
  assert.doesNotMatch(clientJs, /fetch\(|globalThis\.fetch|window\.fetch/,
    'client.js (deprecated sarmalayıcı, T-017) ağ çağrısı yapmamalı');
});

test('API A2: renderer + preload içinde parola DEĞERİ / Authorization / apiKey yok', () => {
  // v2.1: onaylı biçimler lib.passwordMentionsUnsanctioned içinde (API-52 yük anahtarı,
  // 'no-password' durum adı, .includes('PASSWORD') kod eşleşmesi); DEĞER yasak kalır.
  const hits = [];
  for (const dir of [path.join(SRC, 'renderer'), path.join(SRC, 'preload')]) {
    for (const f of walk(dir, (x) => /\.(js|html)$/.test(x))) {
      for (const line of grepLines(read(f), /Authorization|apiKey|password/i, path.relative(SRC, f))) {
        if (passwordMentionsUnsanctioned(line)) hits.push(line);
      }
    }
  }
  assert.strictEqual(hits.length, 0, `A2 ihlali:\n  - ${hits.join('\n  - ')}`);
});

test('API A4: x-opencode-directory başlığı http-client.js içinde (API-04)', () => {
  // v2.1: başlık ağ katmanının her iki yolunda da (request + openStream) gönderilir.
  const count = (httpClientJs.match(/x-opencode-directory/g) || []).length;
  assert.ok(
    count >= 2,
    `http-client.js x-opencode-directory göndermiyor veya yalnız tek yolda (beklenen ≥2: request + openStream); bulunan: ${count} (API-04/A20)`
  );
});

test('API-11: kv:app:info yanıtı parola taşımaz; sır beyaz liste dışı alan döndürmez', () => {
  // v2.1: handler CHANNELS.APP_INFO sabitiyle bulunur (literal kanal adı yoktur).
  const infoBlock = handlerBlock('APP_INFO');
  assert.ok(infoBlock.length > 20, 'kv:app:info handler bulunamadı (ipcMain.handle(CHANNELS.APP_INFO kaydı yok)');
  const body = infoBlock.slice(0, 1400);
  assert.doesNotMatch(body, /password|apiKey|authorization/i, 'info yanıtı sır desenli alan döndürüyor (API-11/21)');
  assert.doesNotMatch(body, /\.\.\.result/, 'info yanıtı ham sonucu yayıyor (spread) — beyaz liste yok (API-21)');
});

test('API-25/56: kv:app:ping yanıtı tek zarf — wrap() + ok({ pong:true, at })', () => {
  // v2.1: main.js'te zarf `ok(...)` üretimiyle kurulur (runtime'da {ok:true,data:{…}});
  // eski test literal `ok: true` aradığı için yanlış failing idi. Statik kanıt:
  // handler wrap() ile sarılı (zarf garantisi) + data alanları pong/at.
  const pingBlock = handlerBlock('APP_PING');
  assert.ok(pingBlock.length > 20, 'kv:app:ping handler bulunamadı (ipcMain.handle(CHANNELS.APP_PING kaydı yok)');
  assert.match(pingBlock, /CHANNELS\.APP_PING,\s*wrap\(/, 'ping handler wrap() ile zarfa sarılmıyor (API-25: { ok, data | error })');
  assert.match(pingBlock, /ok\(\{\s*pong:\s*true/, 'ping data alanında pong:true yok (§7.2 kanal tablosu)');
  assert.match(pingBlock, /at:\s*new Date\(\)\.toISOString\(\)/, 'ping data alanında at yok (§7.2)');
});

test('API-25/56: kv:app:info yanıtı zarf + §7.2 alanları (appVersion, schemaVersion, server)', () => {
  // v2.1: handler CHANNELS.APP_INFO sabitinden çözülür; zarf wrap() + ok()/fail()
  // üretimiyle garantilenir, data alanları beyaz listeli sözlükten gelir.
  const infoBlock = handlerBlock('APP_INFO');
  assert.ok(infoBlock.length > 20, 'kv:app:info handler bulunamadı (ipcMain.handle(CHANNELS.APP_INFO kaydı yok)');
  assert.match(infoBlock, /CHANNELS\.APP_INFO,\s*wrap\(/, 'info handler wrap() ile zarfa sarılmıyor (API-25)');
  assert.match(infoBlock, /return ok\(\{|return info;|fail\(/, 'info yanıtı zarf üretmiyor — API-25: { ok, data | error }');
  assert.match(infoBlock, /appVersion/, 'info data alanında appVersion yok (§7.2 kv:app:info tablosu)');
  assert.match(infoBlock, /schemaVersion/, 'info data alanında schemaVersion yok (§7.2)');
  assert.match(infoBlock, /server:\s*\{/, 'info data alanında server alt nesnesi yok (§7.2)');
});

test('API I4/56: preload yanıtları zarf şemasına göre doğruluyor (E_INTERNAL üretir)', () => {
  assert.match(
    preloadJs,
    /E_INTERNAL/,
    'preload şema dışı yanıtta E_INTERNAL üretmiyor — API-56/I4: ham nesne renderer’a geçmemeli'
  );
  assert.match(preloadJs, /E_TIMEOUT/, 'preload invoke zaman aşımı üretmiyor — API-55: 10 sn → E_TIMEOUT');
});

test('API A5: hata kodu tablosu (src/shared/errors.js, §5.2’nin 19 kodu) mevcut', () => {
  // v2.1: kod tablosu src/shared/errors.js'tedir (eski test src/main/errors.js arıyordu —
  // T-015 dönemi yol). §5.2 v2.2 tablosunun tamamı (19 kod, E_DUPLICATE_ROLE dahil)
  // aranır; kapsamı daraltmak yasaktır. E_UNKNOWN_CHANNEL (API-50) ek fazlalık olarak
  // kabul edilir; E_PARTIAL/E_PASSWORD/E_SCAN_LIMIT Tur 3 kapsamı olduğundan ARANMAZ
  // (YM kararı, EMİR T-025).
  const errorsPath = path.join(SRC, 'shared', 'errors.js');
  const errors = require(errorsPath);
  assert.ok(errors && errors.CODES, 'src/shared/errors.js yüklenemiyor veya CODES tanımlı değil (A5)');

  const expected = ['E_OK', 'E_BAD_REQUEST', 'E_UNAUTHORIZED', 'E_FORBIDDEN', 'E_NOT_FOUND', 'E_BUSY',
    'E_CONFLICT', 'E_DUPLICATE_ROLE', 'E_TIMEOUT', 'E_RATE_LIMIT', 'E_SERVER', 'E_OFFLINE', 'E_PARSE',
    'E_VERSION', 'E_SECRET_MISSING', 'E_SECRET_CORRUPT', 'E_CONFIRM_REQUIRED', 'E_LOCKED_OUT', 'E_INTERNAL'];
  const values = Object.values(errors.CODES);
  const missing = expected.filter((code) => !values.includes(code));
  assert.strictEqual(
    missing.length,
    0,
    `§5.2 kodları errors.js CODES içinde eksik: ${missing.join(', ')}. ` +
      '(Sahibi: DEV — E_DUPLICATE_ROLE, API-94/C-6 kapsamı.)'
  );
});

test('API A5b (API-94, EMİR T-040): roster.assertUniqueCode — E_DUPLICATE_ROLE, harf duyarsız, yerel', () => {
  // v2.1 (YM şartnamesi): saf/yerel fonksiyon — kadro dosyasından okur, ağ gerekmez,
  // parola gerekmez. ('DEV') → E_DUPLICATE_ROLE; ('dev') → aynı; ('ZZ9') → ok.
  // Fonksiyon yoksa test kırmızı kalır (yeşile boyama yasak).
  const rosterModule = require(path.join(SRC, 'main', 'services', 'roster.js'));
  const service = rosterModule.createRoster({ getProjectDir: () => ROOT });
  const fn = typeof rosterModule.assertUniqueCode === 'function'
    ? rosterModule.assertUniqueCode
    : (typeof service.assertUniqueCode === 'function' ? service.assertUniqueCode.bind(service) : null);
  assert.ok(typeof fn === 'function', 'roster.assertUniqueCode yok — EMİR T-040 (API-94) uygulanmamış');

  const dupUpper = fn('DEV'); // gerçek kadroda DEV rolü var
  assert.ok(dupUpper && dupUpper.ok === false, "assertUniqueCode('DEV') ok:false dönmeli (kadroda var)");
  assert.strictEqual(dupUpper.error && dupUpper.error.code, 'E_DUPLICATE_ROLE',
    "assertUniqueCode('DEV') E_DUPLICATE_ROLE dönmeli (API-94)");

  const dupLower = fn('dev'); // harf duyarsız
  assert.ok(dupLower && dupLower.ok === false, "assertUniqueCode('dev') ok:false dönmeli — harf duyarsız (T-040)");
  assert.strictEqual(dupLower.error && dupLower.error.code, 'E_DUPLICATE_ROLE',
    "assertUniqueCode('dev') E_DUPLICATE_ROLE dönmeli — harf duyarsız (T-040)");

  const fresh = fn('ZZ9'); // kadroda yok
  assert.ok(fresh && fresh.ok === true, "assertUniqueCode('ZZ9') ok:true dönmeli (kadroda yok — ret beklenmez)");
});
