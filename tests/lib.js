'use strict';

// T-015 QA test yardımcıları — ürün kodu değil (K1 §5.1: tests/** sahibi QA).
// Tüm yollar kökene göre çözülür; `node --test tests/` kökten çalıştırılır.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const RENDERER = path.join(SRC, 'renderer');
const ELECTRON_EXE = path.join(SRC, 'node_modules', 'electron', 'dist', 'electron.exe');

// src/ altında yürür; node_modules her zaman atlanır.
function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.package-lock.json') continue;
      walk(full, predicate, out);
    } else if (!predicate || predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

const isJs = (f) => f.endsWith('.js');
const isRendererCode = (f) => /\.(js|html)$/.test(f);

function read(f) {
  return fs.readFileSync(f, 'utf8');
}

function readIfExists(f) {
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
}

// Basit satır bazlı grep; kanıt üretir (dosya:satır: metin).
function grepLines(text, pattern, fileLabel) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) hits.push(`${fileLabel}:${i + 1}: ${lines[i].trim()}`);
  }
  return hits;
}

// UI sözleşmesi §4.5 / C7 istisnası: ayarlar ekranındaki parola ALAN ADI ve özniteliği
// (type="password", data-field="…password…") serbesttir — yasak olan parolanın DEĞERİDİR.
// Satırdaki "password" geçişlerinin tamamı bu onaylı biçimlerse satır temizdir.
//
// v2.1 (EMİR T-025, YM onayı) — yeni istisnalar (hepsi AD/kimlik taşır, DEĞER akışı değildir):
//  a) 'no-password' bağlantı durumu anahtarı (app.js CONNECTION_VIEWS; §5.3 uzantısı, YM kararı)
//  b) .includes('SECRET'|'PASSWORD') — hata KODU adı eşleştirmesi (app.js ERROR_CODE_VIEWS)
//  c) password: <değişken> — kv:secret:set yük anahtarı (API-52); parolanın DEĞER biçimleri
//     (password: 'x', şablon dizisi, Authorization, apiKey) hâlâ YAŞAKTIR. Değişken
//     deseninde $ ile başlayan ad YOK sayılır: `password: ${p}` şablonu yakalanmaya
//     devam etsin (YM negatif test şartı, EMİR T-025).
//  d) nopassword — app.js CONNECTION_ALIASES anahtarı (durum adı → görünüm eşlemesi);
//     tırnaksız anahtardır, DEĞER değildir (YM kararı, Kategori 1).
function passwordMentionsUnsanctioned(line) {
  // apiKey / Authorization için istisna YOKTUR — geçen her satır değer akışı riskidir.
  if (/apiKey|authorization/i.test(line)) return true;
  const stripped = line
    .replace(/type=["']password["']/gi, '')
    .replace(/type:\s*["']password["']/gi, '')
    .replace(/data-field=["'][a-z-]*password["']/gi, '')
    .replace(/["']no-password["']/gi, '')
    .replace(/\bnopassword\b/gi, '')
    .replace(/\.includes\(["'](SECRET|PASSWORD)["']\)/gi, '')
    .replace(/\bpassword:\s*[A-Za-z_]\w*/g, '');
  return /password/i.test(stripped);
}

module.exports = {
  ROOT,
  SRC,
  RENDERER,
  ELECTRON_EXE,
  walk,
  isJs,
  isRendererCode,
  read,
  readIfExists,
  grepLines,
  passwordMentionsUnsanctioned
};
