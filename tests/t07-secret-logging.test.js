'use strict';

// T7 — ağ katmanı parolayı loglamıyor (emir T-015 zorunlu başlık 7)
// API sözleşmesi API-03: Authorization/password/apiKey/token hiçbir log/audit/yanıta yazılmaz.
//
// v2.1 (EMİR T-025): gerçek ağ modülü src/main/services/http-client.js'tir (API-01);
// src/main/opencode/client.js fetch'siz deprecated sarmalayıcıdır (YM kararı, T-017).
// Sarmalayıcı denetim dışı bırakılmaz — İKİSİ de aynı sıkılıkla denetlenir.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read } = require('./lib');

const TARGETS = [
  { label: 'client.js (deprecated sarmalayıcı, T-017)', src: read(path.join(SRC, 'main', 'opencode', 'client.js')) },
  { label: 'http-client.js (ağ katmanı, API-01)', src: read(path.join(SRC, 'main', 'services', 'http-client.js')) }
];

test('T7a: ağ katmanı hiçbir log çıkışı içermiyor (console/process.stdout/stderr/fs yazma)', () => {
  for (const { label, src } of TARGETS) {
    assert.doesNotMatch(src, /console\.(log|error|warn|info|debug|trace)/, `${label}: console.* çağrısı var — potansiyel sır sızıntısı`);
    assert.doesNotMatch(src, /process\.std(out|err)/, `${label}: process.stdout/stderr kullanımı var`);
    assert.doesNotMatch(src, /fs\.(writeFile|appendFile|createWriteStream)/, `${label}: dosyaya yazma var — sır diske yazılabilir`);
    assert.doesNotMatch(src, /fs\.(appendFileSync|writeFileSync)/, `${label}: senkron dosya yazma var — sır diske yazılabilir`);
  }
});

test('T7b: parola yalnız Authorization başlığına akar; mesajlara/return değerine girmiyor (API-03)', () => {
  for (const { label, src } of TARGETS) {
    const lines = src.split(/\r?\n/);
    const offenders = [];

    lines.forEach((line, i) => {
      // Parola değişkeninin şablon dizisine girdiği her satır ya başlık üretimi ya da tanım satırı olmalı.
      if (/password/i.test(line) && /\$\{/.test(line)) {
        const isHeaderConstruction = /AUTH_USERNAME|Basic|authorization/i.test(line);
        if (!isHeaderConstruction) offenders.push(`${label} satır ${i + 1}: ${line.trim()}`);
      }
    });

    assert.strictEqual(
      offenders.length,
      0,
      `parola değeri başlık dışında şablon dizisine giriyor:\n  - ${offenders.join('\n  - ')}`
    );
  }

  // Hata yolları yalnız durum kodu / hata adı taşır; readPassword'ın kendisi hiçbir yanıta giremez.
  // 'OPENCODE_PASSWORD' ortam değişkeninin ADI kabul edilir; parolanın DEĞERİ asla.
  const client = TARGETS[0].src;
  const errorReturns = [...client.matchAll(/error:\s*([^,\n}]+)/g)].map((m) => m[1]);
  assert.ok(errorReturns.length >= 2, 'client.js hata alanları beklenirdi (no-password, HTTP, ağ)');
  for (const errExpr of errorReturns) {
    const cleaned = errExpr.replace(/OPENCODE_PASSWORD/g, '');
    assert.doesNotMatch(
      cleaned,
      /password/i,
      `hata mesajında parola ifadesi var: ${errExpr} (ortam değişkeni ADI kabul edilir, DEĞERİ değil)`
    );
  }

  // http-client.js: hata zarfları fail(CODES.X, …) ile kurulur — fail() çağrılarının
  // hiçbirinde parola DEĞERİ şablon dizisine giremez (kullanıcıya dönün mesajlarda
  // 'parola' sözcüğü geçebilir; İngilizce 'password' DESENİ aranır).
  const httpClient = TARGETS[1].src;
  assert.ok(/function makeAuthHeader/.test(httpClient), 'http-client.js makeAuthHeader üretimi yok — parola başlığa nasıl akıyor?');
  for (const m of httpClient.matchAll(/fail\(([^;]{0,200})\)/g)) {
    assert.doesNotMatch(
      m[1],
      /\$\{[^}]*password[^}]*\}/i,
      `fail() çağrısında parola değeri şablona giriyor: ${m[0].slice(0, 120)}`
    );
  }
});
