'use strict';

// Tur 2 / Sır saklama — disk ve kod değişmezleri (EMİR T-020'den devralındı, EMİR T-025)
// Kaynak: API-03/21/52, UI §4.6, settings.js (safeStorage/DPAPI) gerçekliği.
//
// SALT OKUNUR: bu test userData'ya ve .team/**e ASLA yazmaz; yalnız okur.
// Geçerli durumlar: parola kaydedilmemişse secrets.bin OLMAYABİLİR (secretState 'missing');
// kayıtlıysa safeStorage (DPAPI) şifreli olmalı — düz metin görüntüsü ihlaldir.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, read } = require('../lib');

const settingsJs = read(path.join(SRC, 'main', 'services', 'settings.js'));
const httpClientJs = read(path.join(SRC, 'main', 'services', 'http-client.js'));

const USER_DATA = path.join(process.env.APPDATA || '', 'keyvotion-console');

test('tur2/secrecy 1: config.json — anahtarlar beyaz listede, sır deseni yok (§4.6)', () => {
  const cfgPath = path.join(USER_DATA, 'config.json');
  assert.ok(fs.existsSync(cfgPath),
    `config.json yok: ${cfgPath} — SettingsService hiç çalışmamış olabilir (7.2.8 ile aynı zemin)`);

  const raw = read(cfgPath);
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    assert.fail(`config.json ayrıştırılamıyor (bozuk yazım): ${raw.slice(0, 160)}`);
  }

  const allowed = ['serverURL', 'projectDir', 'theme', 'density', 'language', 'schemaVersion', 'onboarded'];
  const badKeys = Object.keys(cfg).filter((k) => !allowed.includes(k));
  assert.deepStrictEqual(badKeys, [],
    `config.json içinde izin dışı anahtar: ${badKeys.join(', ')} (§4.6: sır config'e yazılmaz)`);

  assert.doesNotMatch(raw, /password|apiKey|authorization|secret/i,
    'config.json ham metninde sır deseni var (§4.6 ihlali — parola burada yaşamaz)');
});

test('tur2/secrecy 2: logs/audit.jsonl — her satır JSON, op+code üst verisi var, sır yok (API-30)', () => {
  const auditPath = path.join(USER_DATA, 'logs', 'audit.jsonl');
  assert.ok(fs.existsSync(auditPath), `logs/audit.jsonl yok: ${auditPath}`);

  const lines = read(auditPath).split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length >= 1, 'audit.jsonl boş');

  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      assert.fail(`audit.jsonl bozuk satır (JSON değil): ${line.slice(0, 160)}`);
    }
    assert.ok(rec && typeof rec === 'object', `audit satırı nesne değil: ${line.slice(0, 160)}`);
    assert.ok(typeof rec.op === 'string' && rec.op.length > 0,
      `audit satırında op üst verisi yok (API-30): ${line.slice(0, 160)}`);
    assert.ok(typeof rec.code === 'string' && rec.code.length > 0,
      `audit satırında code üst verisi yok (API-30): ${line.slice(0, 160)}`);
    assert.doesNotMatch(line, /password|apiKey|authorization/i,
      `audit satırında sır deseni var (API-03/30): ${line.slice(0, 160)}`);
  }
});

test('tur2/secrecy 3: secrets.bin — ya yok (geçerli) ya da düz metin değil (DPAPI beklenir)', () => {
  const binPath = path.join(USER_DATA, 'secrets.bin');
  if (!fs.existsSync(binPath)) {
    // Parola kaydedilmemiş — geçerli durum; test burada biter (kanıt: yokluk).
    return;
  }

  const raw = fs.readFileSync(binPath, 'utf8');
  assert.doesNotMatch(raw, /"password"|password\s*:/i,
    'secrets.bin düz metin görünüyor — safeStorage (DPAPI) şifrelemesi atlanmış olabilir');
  assert.doesNotMatch(raw, /apiKey|authorization/i, 'secrets.bin içinde apiKey/Authorization deseni var');
});

test('tur2/secrecy 4: settings.js — parola yalnız safeStorage şifreli yola yazılır (API-52)', () => {
  // Parolanın encryptString DİŞİNDA hiçbir writeFileSync argümanında görünmemesi.
  assert.match(settingsJs, /safeStorage\.encryptString\(password\)/,
    'settings.js parolayı safeStorage.encryptString ile şifrelemiyor');
  for (const m of settingsJs.matchAll(/writeFileSync\(([^;]{0,200})\)/g)) {
    assert.doesNotMatch(m[1], /password/i,
      `writeFileSync çağrısında parola ifadesi geçiyor (şifresiz yazma riski): ${m[0].slice(0, 140)}`);
  }

  // secretState yalnız durum sözcüğü döndürür — DEĞER döndürmez (API-52/21).
  const stateMatch = settingsJs.match(/function secretState\(\)[\s\S]{0,700}/);
  assert.ok(stateMatch, 'settings.js secretState bulunamadı');
  const stateBody = stateMatch[0];
  for (const word of ["'stored'", "'missing'", "'corrupt'"]) {
    assert.ok(stateBody.includes(word), `secretState ${word} durumunu döndürmüyor`);
  }

  // config şablonunda sır alanı yok (§4.6).
  const defaults = settingsJs.match(/const DEFAULT_CONFIG\s*=\s*Object\.freeze\(\{[\s\S]*?\}\)/);
  assert.ok(defaults, 'settings.js DEFAULT_CONFIG bulunamadı');
  assert.doesNotMatch(defaults[0], /password|apiKey|secret/i,
    'DEFAULT_CONFIG sır alanı taşıyor (§4.6: ayar şablonu sır barındırmaz)');
});

test('tur2/secrecy 5: http-client.js — ağ katmanı sır değeri loglamaz/diske yazmaz (API-03)', () => {
  assert.doesNotMatch(httpClientJs, /console\.(log|error|warn|info|debug|trace)/,
    'http-client.js console.* çağırıyor — sır kütüğüne sızabilir');
  assert.doesNotMatch(httpClientJs, /process\.std(out|err)/,
    'http-client.js process.stdout/stderr kullanıyor');
  assert.doesNotMatch(httpClientJs, /fs\.(writeFile|appendFile|createWriteStream)/,
    'http-client.js dosyaya yazıyor — sır diske yazılabilir');

  // Parola yalnız Authorization başlığı üretiminde şablona girer (makeAuthHeader).
  assert.match(httpClientJs, /function makeAuthHeader/,
    'http-client.js makeAuthHeader üretimi yok — parolanın başlığa akışı belgelenmemiş');
  for (const line of httpClientJs.split(/\r?\n/)) {
    if (/password/i.test(line) && /\$\{/.test(line)) {
      assert.match(line, /authorization|basic|auth/i,
        `parola değeri başlık dışında şablon dizisine giriyor: ${line.trim()}`);
    }
  }
});
