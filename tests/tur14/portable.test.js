'use strict';

/*
 * T-174 — Taşınabilirlik: depoda sabit makine yolu kalmamalı.
 *
 * Ürün GitHub'da paylaşılacak; `C:\Users\<bir geliştirici>\...` gibi sabit bir
 * yol başka bilgisayarda var olmayan bir dizine işaret eder ve ilk yazımda
 * ENOENT verir (T-166'da tam bu sınıf yaşandı). Bu test kaynakta kilitler:
 *   1) `src/` altında sabit kullanıcı yolu yok.
 *   2) opencode uyumluluk katmanı varsayılanı ev dizininden türetir.
 *   3) Ajan ekle diyaloğu sabit yol yerine ayardaki dizini kullanır.
 *   4) Kullanıcı dokümanları taşınabilir ifade kullanır.
 *   5) Ayarların varsayılanı ev dizini + `Keyvotion`.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, SRC, RENDERER, walk, read } = require('../lib');

const HARDCODED = /[A-Za-z]:\\\\?Users\\\\?[A-Za-z0-9._-]+/;

test('portable 1: src altında sabit kullanıcı yolu yok', () => {
  const hits = [];
  for (const file of walk(SRC, (f) => /\.(js|html|css|json)$/.test(f))) {
    const text = read(file);
    const m = text.match(/[A-Za-z]:\\+Users\\+[A-Za-z0-9._-]+/);
    if (m) hits.push(`${path.relative(ROOT, file)} → ${m[0]}`);
  }
  assert.deepStrictEqual(hits, [], 'sabit makine yolu var');
});

test('portable 2: opencode varsayılanı ev dizininden türetilir', () => {
  const client = read(path.join(SRC, 'main', 'opencode', 'client.js'));
  assert.match(client, /os\.homedir\(\)/, 'ev dizini kullanılmıyor');
  assert.match(client, /path\.join\(os\.homedir\(\), 'Keyvotion'\)/, 'varsayılan dizin türetilmiyor');
  const mod = require(path.join(SRC, 'main', 'opencode', 'client.js'));
  assert.strictEqual(mod.PROJECT_DIRECTORY, path.join(os.homedir(), 'Keyvotion'));
});

test('portable 3: ajan ekle diyaloğu ayardaki dizini kullanır', () => {
  const app = read(path.join(RENDERER, 'app.js'));
  assert.match(app, /store\.projectDir \|\| store\.projects\.activeDir/, 'ayar dizini kullanılmıyor');
  assert.match(app, /projectDir: '',/, 'store alanı tanımlı değil');
  assert.match(app, /if \(typeof d\.projectDir === 'string'\) store\.projectDir = d\.projectDir/, 'ayardan okunmuyor');
});

test('portable 4: kullanıcı dokümanları taşınabilir ifade kullanır', () => {
  for (const rel of ['docs/kullanim.md', 'docs/kurulum.md', 'docs/run-guide.md']) {
    const text = read(path.join(ROOT, rel));
    assert.ok(!/alibs/i.test(text), `${rel}: sabit kullanıcı yolu var`);
    assert.ok(/USERPROFILE|Keyvotion/.test(text), `${rel}: kurulum yolu tarif edilmiyor`);
  }
});

test('portable 5: ayarların varsayılanı ev dizini', () => {
  const settings = require(path.join(SRC, 'main', 'services', 'settings.js'));
  assert.strictEqual(settings.DEFAULT_CONFIG.projectDir, path.join(os.homedir(), 'Keyvotion'));
  assert.ok(fs.existsSync(path.join(SRC, 'main', 'services', 'settings.js')));
});
