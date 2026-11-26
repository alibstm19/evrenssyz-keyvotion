'use strict';

// T2 — renderer'da sır sızıntısı yok (emir T-015 zorunlu başlık 2)
// K1 §7.2/6–7 + UI sözleşmesi C1/C7 + API sözleşmesi A2 ile aynı zemin.
//
// Not: Ayarlar ekranı sözleşme gereği bir parola GİRİŞ ALANI taşır (UI §4.5:
// type="password", data-field="password"). "Sır sızıntısı" yasak olan DEĞERDİR;
// alan adı/özniteliği C7 istisnasıdır. fetch( / require( / apiKey / authorization
// için istisna YOKTUR.
// v2.1 (EMİR T-025): lib.passwordMentionsUnsanctioned genişletildi — 'no-password'
// durum anahtarı, .includes('PASSWORD') kod eşleşmesi ve password: <değişken> yük
// anahtarı (API-52) onaylı sayılır; DEĞER biçimleri hâlâ yasaktır.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { RENDERER, walk, isRendererCode, read, grepLines, passwordMentionsUnsanctioned } = require('./lib');

const ABSOLUTE = /fetch\(|require\(|apiKey|authorization/i;

test('T2: renderer dosyalarında fetch( / require( / apiKey / Authorization → 0; password yalnız onaylı alan biçiminde', () => {
  const files = walk(RENDERER, isRendererCode);
  assert.ok(files.length >= 2, `renderer'da en az index.html ve app.js beklenirdi; bulunan: ${files.length}`);

  const hits = [];
  for (const file of files) {
    const rel = path.relative(RENDERER, file);
    for (const line of grepLines(read(file), /fetch\(|require\(|apiKey|authorization|password/i, `renderer/${rel}`)) {
      if (ABSOLUTE.test(line)) {
        hits.push(`[SIZINTI] ${line}`);
      } else if (passwordMentionsUnsanctioned(line)) {
        hits.push(`[SIZINTI] ${line}`);
      }
      // yalnız onaylı öznitelik biçimindeki password geçişleri istisnadır (C7)
    }
  }

  assert.strictEqual(
    hits.length,
    0,
    `renderer'da yasak desen eşleşmesi (${hits.length}):\n  - ${hits.join('\n  - ')}`
  );
});

// v2.1 (EMİR T-025, YM kabul şartı): onaylı istisnaların DAR olduğunu kanıtlayan negatif
// ölçüm. lib.passwordMentionsUnsanctioned genişletilirse (yeşile boyama) bu test düşer:
// DEĞER biçimleri — literal, şablon dizisi, apiKey, Authorization — hâlâ YAKALANMALIDIR.
test('T2b (negatif): onaylı istisnalar dar — parola DEĞER biçimleri hâlâ yakalanıyor', () => {
  const mustCatch = [
    "password: 'gizli'",                       // literal değer
    'password: "gizli"',                       // literal değer (çift tırnak)
    'apiKey: x',                               // apiKey — istisnasız yasak
    "Authorization: 'Basic abc123'",           // Authorization — istisnasız yasak
    'authorization: makeHeader(p)',            // Authorization üretimi bile yakalanır
    'const s = `password: ${p}`;',             // şablon dizisine giren değer
    'if (line.includes(password)) leak(line);' // parola DEĞİŞKENİ kendisi
  ];
  for (const line of mustCatch) {
    assert.ok(
      passwordMentionsUnsanctioned(line),
      `yakalanması gereken sır deseni kaçtı (istisna genişlemiş — yeşile boyama şüphesi): ${line}`
    );
  }

  const mustPass = [
    'type="password" id="kv-pass"',                              // UI §4.5 giriş alanı özniteliği
    'data-field="password"',                                     // UI §4.5 kanca adı
    'const r = await call(KV.secret.set, { password: secret });', // API-52 yük anahtarı + değişken
    "else if (code.includes('PASSWORD')) setConnection('no-password');", // hata KODU adı eşleşmesi
    "nopassword: 'no-password',",                                // CONNECTION_ALIASES anahtarı
    "'no-password': { text: 'Parola gerekli' },"                 // bağlantı durumu anahtarı
  ];
  for (const line of mustPass) {
    assert.ok(
      !passwordMentionsUnsanctioned(line),
      `onaylı biçim yanlış yakalandı: ${line}`
    );
  }
});
