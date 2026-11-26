'use strict';

// Tur 2 / Renderer sözleşmesi — izolasyon ve köprü yapısı (EMİR T-020'den devralındı, EMİR T-025)
// Kaynak: docs/console-ui-contract.md (C1/C7) + docs/console-api-contract.md (API-48/§7.4 I3).
//
// İddialar:
//  - CSP meta'sı bağlayıcı direktiflerle kurulmuş (connect-src 'none' en kritik olanı:
//    renderer doğrudan ağa çıkamaz; tüm trafik main üzerinden).
//  - Satır içi stil YOK (style="" boş dahi olsa dolu olanlar ihlal; UI-44 stil yalnız css dosyalarında).
//  - renderer'da fetch(/require(/ipcRenderer YOK (I3 + sandbox).
//  - 6 ekran + gezinme kümesi birebir; tek görünür ekran `hidden` özniteliğiyle yönetilir.
//  - Köprü: preload `window.keyvotion` açar; renderer yalnız o nesneye dokunur.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {
  ROOT, RENDERER, SRC, walk, isRendererCode, read, grepLines, passwordMentionsUnsanctioned
} = require('../lib');

const html = read(path.join(RENDERER, 'index.html'));
const appJs = read(path.join(RENDERER, 'app.js'));
const preloadJs = read(path.join(SRC, 'preload', 'preload.js'));
const rendererFiles = walk(RENDERER, isRendererCode);

// v2.4: ekran kimlikleri sözleşme §2'den okunur (12 ekran; sabit liste tutulmaz).
const uiContract = read(path.join(ROOT, 'docs', 'console-ui-contract.md'));
function contractScreens() {
  const start = uiContract.indexOf('## 2. Ekran kimlikleri');
  assert.ok(start >= 0, 'UI sözleşmesinde §2 bulunamadı');
  const end = uiContract.indexOf('## 3.', start);
  const section = uiContract.slice(start, end > 0 ? end : uiContract.length);
  return [...new Set([...section.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((m) => m[1]))];
}
const SCREENS = contractScreens();

/** CSP meta etiketini `directives` sözlüğüne çözümler. */
function parseCsp() {
  const meta = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i);
  assert.ok(meta, 'index.html içinde Content-Security-Policy meta etiketi yok (C1)');
  // Öznitelik değeri çift tırnakla sınırlıdır; içinde tek tırnaklı 'self'/'none' yaşar —
  // bu yüzden sınırlayıcıya kadar ([^"]*) alınır, tırnak içi durdurma yapılmaz.
  const content = meta[0].match(/content="([^"]*)"/i) || meta[0].match(/content='([^']*)'/i);
  assert.ok(content, 'CSP meta etiketinde content özniteliği yok');
  const directives = {};
  for (const part of content[1].split(';')) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) directives[name] = rest.join(' ');
  }
  return directives;
}

test('tur2/renderer 1: CSP direktifleri bağlayıcı kümeyle birebir (C1)', () => {
  const csp = parseCsp();
  const expected = {
    'default-src': "'self'",
    'script-src': "'self'",
    'style-src': "'self'",
    'img-src': "'self' data:",
    // v2.8: Votion TTS sesi base64/data: ile oynatilir (Tur 9).
    'media-src': "'self' blob: data:",
    'connect-src': "'none'",
    'object-src': "'none'",
    'base-uri': "'none'",
    'frame-src': "'none'",
    'child-src': "'none'",
    'form-action': "'none'",
    'frame-ancestors': "'none'"
  };
  const problems = [];
  for (const [name, value] of Object.entries(expected)) {
    if (csp[name] === undefined) problems.push(`eksik direktif: ${name}`);
    else if (csp[name] !== value) problems.push(`${name}: beklenen "${value}", bulunan "${csp[name]}"`);
  }
  const extra = Object.keys(csp).filter((k) => !Object.prototype.hasOwnProperty.call(expected, k));
  if (extra.length) problems.push(`beklenmedik ek direktif: ${extra.join(', ')}`);
  assert.deepStrictEqual(problems, [], `CSP direktifleri sapıyor (C1):\n  - ${problems.join('\n  - ')}`);
});

test('tur2/renderer 2: index.html içinde dolu satır içi stil yok (style="…")', () => {
  const offenders = [...html.matchAll(/style=["']([^"']+)["']/g)]
    .filter((m) => m[1].trim().length > 0)
    .map((m) => `style="${m[1]}"`);
  assert.deepStrictEqual(offenders, [],
    `satır içi stil kullanımı (UI-44: stil yalnız teslim edilen css dosyalarında):\n  - ${offenders.join('\n  - ')}`);
});

test('tur2/renderer 3: renderer dosyalarında fetch( / require( / ipcRenderer → 0 (I3, sandbox)', () => {
  const hits = [];
  for (const file of rendererFiles) {
    hits.push(...grepLines(read(file), /fetch\(|require\(|ipcRenderer/, path.relative(RENDERER, file)));
  }
  assert.deepStrictEqual(hits, [],
    `renderer'da yasak çağrı — ağ/Node erişimi yalnız main+preload'de:\n  - ${hits.join('\n  - ')}`);
});

test('tur2/renderer 4: 6 ekran + gezinme kümesi birebir; tek görünür ekran hidden ile', () => {
  const screens = [...html.matchAll(/data-screen=["']([^"']+)["']/g)].map((m) => m[1]);
  const navItems = [...html.matchAll(/data-nav-item=["']([^"']+)["']/g)].map((m) => m[1]);

  assert.deepStrictEqual([...new Set(screens)].sort(), [...SCREENS].sort(),
    `ekran kümesi sapıyor (§2, 6 ekran): ${[...new Set(screens)].join(', ')}`);
  assert.deepStrictEqual([...new Set(navItems)].sort(), [...SCREENS].sort(),
    `gezinme kümesi ekran kümesiyle örtüşmüyor (UI-03): ${[...new Set(navItems)].join(', ')}`);

  // Tek görünür ekran: app.js her data-screen bölümünün hidden özniteliğini seçime göre yazar.
  assert.match(appJs, /\$\$\(\s*'\[data-screen\]'\s*\)|querySelectorAll\(\s*'\[data-screen\]'\s*\)/,
    'app.js [data-screen] bölümlerini toplamıyor — ekran değiştirme mekanizması yok');
  assert.match(appJs, /\.hidden\s*=\s*\w*\.?dataset\.screen\s*!==?\s*\w+/,
    'app.js hidden özniteliğini seçili ekranla karşılaştırmıyor — birden çok ekran görünür kalabilir');
});

test('tur2/renderer 5: köprü — preload window.keyvotion açar; renderer ham ipcRenderer görmez (API-48)', () => {
  assert.match(preloadJs, /contextBridge\.exposeInMainWorld\(\s*['"]keyvotion['"]/,
    'preload window.keyvotion köprüsünü açmıyor (API-48)');
  assert.match(appJs, /window\.keyvotion/,
    'renderer window.keyvotion köprüsünü kullanmıyor — API-48 beyaz liste dışı yol olabilir');
  assert.doesNotMatch(appJs, /ipcRenderer/,
    'renderer doğrudan ipcRenderer referansı taşıyor (API-48/I3 ihlali)');
});

test('tur2/renderer 6: renderer içinde parola DEĞERİ / apiKey / Authorization yok (C7, değer düzeyi)', () => {
  // Onaylı biçimler lib.passwordMentionsUnsanctioned içinde (EMİR T-025 YM kararları);
  // DEĞER biçimleri (literal/şablon/apiKey/Authorization) yakalanmaya devam eder.
  const hits = [];
  for (const file of rendererFiles) {
    for (const line of grepLines(read(file), /apiKey|password|authorization/i, path.relative(RENDERER, file))) {
      if (passwordMentionsUnsanctioned(line)) hits.push(line);
    }
  }
  assert.deepStrictEqual(hits, [],
    `C7 ihlali — onaylı biçim dışında sır deseni:\n  - ${hits.join('\n  - ')}`);
});
