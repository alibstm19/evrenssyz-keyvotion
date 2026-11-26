'use strict';

// UI sözleşmesinin otomatik denetlenebilir kuralları (console-ui-contract.md §11: C1–C7)
// Elle denetlenenler (C8–C10 klavye/tema/reduced-motion) bu dosyada yok — raporda ayrı işaretlenir.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { RENDERER, walk, isRendererCode, read, grepLines, passwordMentionsUnsanctioned } = require('./lib');

const html = read(path.join(RENDERER, 'index.html'));
const appJs = read(path.join(RENDERER, 'app.js'));
const rendererFiles = walk(RENDERER, isRendererCode);

const { ROOT } = require('./lib');
const uiContract = read(path.join(ROOT, 'docs', 'console-ui-contract.md'));

/** §2 ekran kimlikleri — sözleşme tablosundan okunur (sabit liste tutulmaz). */
function contractScreens() {
  const start = uiContract.indexOf('## 2. Ekran kimlikleri');
  assert.ok(start > 0, 'UI sözleşmesinde §2 bulunamadı');
  const end = uiContract.indexOf('## 3.', start);
  const section = uiContract.slice(start, end > 0 ? end : uiContract.length);
  const ids = [...section.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((m) => m[1]);
  return [...new Set(ids)];
}

/**
 * §10 stylesheet dosya adları — sözleşme tablosundan okunur.
 * UI-123 sırası bağlayıcıdır; sıra `src/renderer/index.html`'den ölçülür.
 */
function contractStylesheets() {
  const start = uiContract.indexOf('## 10. DSN ↔ DEV dosya sınırı');
  assert.ok(start > 0, 'UI sözleşmesinde §10 bulunamadı');
  const end = uiContract.indexOf('## 11.', start);
  const section = uiContract.slice(start, end > 0 ? end : uiContract.length);
  const names = [...section.matchAll(/`src\/renderer\/styles\/([a-z0-9-]+\.css)`/g)].map((m) => m[1]);
  return [...new Set(names)];
}

const SCREENS = contractScreens(); // v2.4: 12 ekran (sözleşme §2 tek kaynak)
const SESSION_STATES = ['idle', 'busy', 'error', 'offline']; // §5.1 — C3 denetim kümesi
const CONNECTION_TEXTS = { // §5.3 rozet metinleri
  connecting: 'Bağlanıyor…',
  connected: 'Bağlı',
  offline: 'Çevrimdışı',
  unauthorized: 'Parola geçersiz'
};

test('UI C1: renderer html/js içinde innerHTML / fetch( / require( → 0 eşleşme', () => {
  const hits = [];
  for (const file of rendererFiles) {
    hits.push(...grepLines(read(file), /innerHTML|fetch\(|require\(/, path.relative(RENDERER, file)));
  }
  assert.strictEqual(hits.length, 0, `C1 ihlali (UI-04/05, API-48/I3):\n  - ${hits.join('\n  - ')}`);
});

test('UI C2: renderer dosyalarında ham renk (#hex, rgb()) yok — styles/ hariç (UI-46)', () => {
  const hits = [];
  for (const file of rendererFiles.filter((f) => !f.includes(`${path.sep}styles${path.sep}`))) {
    hits.push(...grepLines(read(file), /#[0-9a-fA-F]{3,8}\b|rgb\(/, path.relative(RENDERER, file)));
  }
  assert.strictEqual(hits.length, 0, `C2 ihlali (UI-46 — renkler yalnız tokens.css'te):\n  - ${hits.join('\n  - ')}`);
});

test('UI C3 (mekanik): data-state değerleri yalnız §5.1 kümesinden — idle|busy|error|offline', () => {
  // Sözleşmenin kendi denetim komutu (§11/C3): data-state="(?!idle|busy|error|offline)" → 0.
  const literals = [...html.matchAll(/data-state=["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(literals.length >= 1, 'data-state literal yok');
  const bad = literals.filter((v) => !SESSION_STATES.includes(v));
  assert.strictEqual(
    bad.length,
    0,
    `§5.1 kümesi dışında data-state değeri: ${bad.join(', ')}. ` +
      'NOT: UI-15+C3 (§5.1 kümesi) ile §5.3 tablosu (connecting|connected|offline|unauthorized) sözleşmenin ' +
      'kendisinde çelişiyor; uygulama ikisini karışık kullanıyor. ARC tek kümeye karar vermeli.'
  );

  // Çalışma zamanı değerleri de (app.js tabloları) §5.1 kümesinde kalmalı.
  const runtimeStates = [...appJs.matchAll(/state:\s*'([^']+)'/g)].map((m) => m[1]);
  const badRuntime = runtimeStates.filter((v) => !SESSION_STATES.includes(v));
  assert.strictEqual(
    badRuntime.length,
    0,
    `app.js tablosunda §5.1 kümesi dışı durum: ${badRuntime.join(', ')} (C3)`
  );
});

test('UI-15/§5.3: bağlantı rozetinin metinleri §5.3 tablosundan geliyor', () => {
  // §5.3: connecting→"Bağlanıyor…", connected→"Bağlı", offline→"Çevrimdışı…", unauthorized→"Parola geçersiz"
  const block = appJs.slice(appJs.indexOf('CONNECTION_VIEWS'), appJs.indexOf('ERROR_CODE_VIEWS'));
  assert.ok(block.length > 20, 'app.js CONNECTION_VIEWS tablosu bulunamadı');

  const deviations = [];
  if (!block.includes(CONNECTION_TEXTS.connecting)) deviations.push('connecting metni "Bağlanıyor…" değil');
  if (!block.includes(CONNECTION_TEXTS.connected)) deviations.push('connected metni "Bağlı" değil');
  if (!block.includes(CONNECTION_TEXTS.offline)) deviations.push('çevrimdışı metni "Çevrimdışı…" değil (§5.3: Çevrimdışı · son veri HH:mm)');
  if (!block.includes(CONNECTION_TEXTS.unauthorized)) deviations.push('yetkisiz metni "Parola geçersiz" değil');

  assert.strictEqual(
    deviations.length,
    0,
    `UI-15 ihlali — rozet metinleri §5.3 tablosundan gelmiyor:\n  - ${deviations.join('\n  - ')}\n` +
      '  (Kök neden olası: §5.3 ↔ UI-15/C3 çelişkisi; ARC kararı beklenir.)'
  );
});

test('UI C4: data-screen değerleri yalnız 6 sözleşme kimliği (UI §2, UI-07)', () => {
  // v2.1: ekran kümesi 6'ya genişledi — reports (Rapor Merkezi) v2.1 sözleşmesinde
  // tanımlı; YM kararıyla denetim kümesine alındı (EMİR T-025).
  const screens = [...html.matchAll(/data-screen=["']([^"']+)["']/g)].map((m) => m[1]);
  const extra = screens.filter((s) => !SCREENS.includes(s));
  const missing = SCREENS.filter((s) => !screens.includes(s));
  assert.strictEqual(
    extra.length + missing.length,
    0,
    `ekran kimlikleri sözleşme §2'den sapıyor. Fazla: ${extra.join(', ') || '-'} · Eksik: ${missing.join(', ') || '-'}.\n` +
      '  UI-07: yeni ekran/bileşen ARC onayı ister.'
  );
});

test('UI C6: renderer dosyalarında style="" özniteliği yok (UI-06)', () => {
  const hits = [];
  for (const file of rendererFiles) {
    hits.push(...grepLines(read(file), /\sstyle=["']/, path.relative(RENDERER, file)));
  }
  assert.strictEqual(hits.length, 0, `C6 ihlali (UI-06):\n  - ${hits.join('\n  - ')}`);
});

test('UI C7a: renderer içinde parola DEĞERİ / apiKey / Authorization yok (yalnız onaylı alan biçimi)', () => {
  // v2.1: lib.passwordMentionsUnsanctioned genişletildi — 'no-password' durum anahtarı,
  // .includes('PASSWORD') kod eşleşmesi ve password: <değişken> yük anahtarı (API-52)
  // onaylı sayılır; DEĞER biçimleri (literal/şablon/apiKey/Authorization) yasak kalır.
  const hits = [];
  for (const file of rendererFiles) {
    for (const line of grepLines(read(file), /apiKey|password|authorization/i, path.relative(RENDERER, file))) {
      if (passwordMentionsUnsanctioned(line)) hits.push(line);
    }
  }
  assert.strictEqual(hits.length, 0, `C7 ihlali — onaylı biçim dışında sır deseni:\n  - ${hits.join('\n  - ')}`);
});

test('UI C7b: parola alanının adı sözleşmedeki gibi tam olarak "password" (UI §4.5)', () => {
  // §4.5 kancası: [data-field="password"]. Farklı ad (ör. server-password) sözleşme sapmasıdır.
  const fieldNames = [...html.matchAll(/data-field=["']([^"']*password[^"']*)["']/gi)].map((m) => m[1]);
  assert.ok(fieldNames.length >= 1, 'ayarlar ekranında parola alanı bulunamadı (UI §4.5 gereği olmalı)');
  const wrong = fieldNames.filter((n) => n !== 'password');
  assert.strictEqual(
    wrong.length,
    0,
    `parola alan adı sözleşmeden sapıyor: ${wrong.join(', ')} — UI §4.5 kancası data-field="password"`
  );
});

test('UI-03/47: lang="tr", data-theme kök üzerinde', () => {
  assert.match(html, /<html[^>]+lang=["']tr["']/, 'html lang="tr" yok (UI-03)');
  assert.match(html, /<html[^>]+data-theme=["'](dark|light)["']/, 'html data-theme yok (UI-47)');
  assert.match(html, /<title>Keyvotion Console<\/title>/, 'başlık beklenenden farklı');
});

test('UI-09: aynı anda tek data-screen görünür; diğerleri hidden', () => {
  // v2.1: 6 ekran bölümü beklenir (reports dahil).
  const sections = [...html.matchAll(/<section[^>]*data-screen=["']([^"']+)["'][^>]*>/g)];
  assert.ok(sections.length >= 6, `en az 6 ekran bölümü beklenirdi; ${sections.length}`);
  const withoutHidden = sections.filter((m) => !/hidden/i.test(m[0]));
  assert.strictEqual(withoutHidden.length, 1, `yalnız 1 görünür ekran olmalı, ${withoutHidden.length} tane hidden'sız`);
});

test('UI-14: aria-current="page" yalnız tek gezinme düğmesinde', () => {
  const marked = [...html.matchAll(/aria-current=["']page["']/g)];
  assert.strictEqual(marked.length, 1, `tek aktif gezinme düğmesi olmalı, ${marked.length} tane işaretli`);
});

test('UI-03 (tanımlayıcılar): gezinme düğmeleri sözleşme ekran kimlikleriyle birebir', () => {
  // v2.1: 6 ekran kümesi (reports dahil, YM kararı) ile gezinme örtüşmesi denetlenir.
  const navItems = [...html.matchAll(/data-nav-item=["']([^"']+)["']/g)].map((m) => m[1]);
  const extra = navItems.filter((n) => !SCREENS.includes(n));
  const missing = SCREENS.filter((s) => !navItems.includes(s));
  assert.strictEqual(
    extra.length + missing.length,
    0,
    `gezinme ↔ ekran kimlikleri örtüşmüyor. Fazla: ${extra.join(', ') || '-'} · Eksik: ${missing.join(', ') || '-'}`
  );

  const dataValues = [...html.matchAll(/data-[a-z-]+=["']([^"']*)["']/g)].map((m) => m[1]);
  const nonAscii = dataValues.filter((v) => v.length > 0 && !/^[a-z0-9.:\-]+$/i.test(v));
  assert.strictEqual(nonAscii.length, 0, `data-* değerinde ASCII olmayan karakter: ${nonAscii.join(', ')}`);
});

test('UI-16/58: son eşitleme biçimi ve boş durum metinleri sözleşmeden', () => {
  assert.match(appJs, /son eşitleme /, 'app.js son eşitleme biçimi yok (UI-16)');
  assert.match(html, /Pano/, 'pano boş durum metni yok (UI-58 ailesi)');
});

test('UI-17: toast kökü aria-live="polite" taşıyor; modal kökü mevcut', () => {
  assert.match(html, /data-toast-root[^>]*aria-live=["']polite["']|aria-live=["']polite["'][^>]*data-toast-root/, 'data-toast-root aria-live="polite" değil');
  assert.match(html, /data-modal-root/, 'data-modal-root yok');
});
