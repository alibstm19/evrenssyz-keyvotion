'use strict';

/*
 * T-193 — Rehberler gerçeği söyler.
 *
 * Kusur (ölçüldü 2026-11-24, düzeltmeden önce):
 *   - `docs/kullanim.md` §8 "git bu makinede PATH'te yok → sürüm kontrolü yok"
 *     diyordu; oysa `git 2.56.0.windows.4` kurulu ve depo commit'li.
 *   - Aynı bölüm "paketlenmiş kurulum dosyası yok" diyordu; oysa `dist/` altında
 *     çalışan `.exe` ve `v3.2.0` ZIP'i var.
 *   - `docs/kurulum.md` başlığı "MVP Tur 1 geliştiriliyor (2026-11-01)" diyordu;
 *     sürüm 3.2.0.
 *   - `docs/kurulum.md` §10.1 "12 kanal çalışmaz" diyor ve elle sayılmış,
 *     kodda karşılığı olmayan bir `offline: true` listesi veriyordu.
 *
 * Bu test kilidi (hepsi statik; CI'da dist/ olmadan da çalışır):
 *   1) Hiçbir rehber "git yok / sürüm kontrolü kapalı" demez.
 *   2) Hiçbir rehber "paketlenmiş kurulum dosyası yok" demez.
 *   3) `docs/kurulum.md` durum satırı `src/package.json` sürümünü yazar.
 *   4) Ölçülmemiş kanal sayısı / uydurma offline listesi geri gelmez.
 *   5) `docs/kullanim.md` ölçülen git sürümünü ve sürümlü ZIP adını yazar.
 *   6) Rehberlerdeki her `docs/*.md` bağlantısı diskte var.
 *   7) `build/` varsa belgedeki "eski sürüm" iddiası onun gerçek sürümüdür.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('../lib');

const GUIDES = ['docs/kurulum.md', 'docs/kullanim.md', 'docs/run-guide.md', 'docs/tur6-rehber.md', 'README.md'];
const guide = (f) => read(path.join(ROOT, f));
const version = JSON.parse(read(path.join(ROOT, 'src', 'package.json'))).version;

test('docs truth 1: rehberler git i yok saymaz', () => {
  const bad = [];
  for (const f of GUIDES) {
    const t = guide(f);
    if (/git`?\s+bu makinede\s+PATH'?te\s+\*{0,2}yok/i.test(t)) bad.push(`${f}: git yok iddiası`);
    if (/Sürüm kontrolü devre dışı/i.test(t)) bad.push(`${f}: sürüm kontrolü kapalı iddiası`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('docs truth 2: rehberler paketi yok saymaz', () => {
  const bad = GUIDES.filter((f) => /Paketlenmiş kurulum dosyası yok|Paketlenmiş \(kurulum dosyalı\) sürüm \*\*yok\*\*/i.test(guide(f)));
  assert.deepEqual(bad, [], `paket yok iddiası: ${bad.join(', ')}`);
});

test('docs truth 3: kurulum durum satırı paket sürümünü yazar', () => {
  const t = guide('docs/kurulum.md');
  const line = t.split(/\r?\n/).find((l) => /^> Durum:/.test(l)) || '';
  assert.ok(line, 'durum satırı yok');
  assert.match(line, new RegExp(`v${version.replace(/\./g, '\\.')}`), `durum satırı v${version} demiyor: ${line}`);
  assert.doesNotMatch(line, /MVP Tur 1/, 'durum satırı hâlâ MVP Tur 1 diyor');
});

test('docs truth 4: ölçülmemiş kanal sayısı ve uydurma offline listesi yok', () => {
  const t = guide('docs/kurulum.md');
  assert.doesNotMatch(t, /\d+ kanal çalışmaz/, 'ölçülmemiş kanal sayısı geri gelmiş');
  assert.doesNotMatch(t, /offline: true/, 'kodda karşılığı olmayan `offline: true` listesi geri gelmiş');
  assert.match(t, /E_SECRET_MISSING/, 'parolasız davranışın ölçülebilir adı yazılmıyor');
});

test('docs truth 5: kullanım rehberi ölçülen git sürümünü ve sabit olmayan özeti yazar', () => {
  const t = guide('docs/kullanim.md');
  assert.match(t, /git \d+\.\d+\.\d+/, 'git sürümü ölçülmüş biçimde yazılmıyor');
  assert.match(t, new RegExp(`Keyvotion-Console-win32-x64-v${version.replace(/\./g, '\\.')}\\.zip`),
    'ZIP adı paket sürümüyle eşleşmiyor');
  assert.match(t, /SHA256SUMS\.txt/, 'özet dosyasına işaret edilmiyor');
  /* Arşiv zaman damgası taşır: sabit hash yazmak belgeyi ilk yeniden üretimde
     yalancı yapar (T-193 dersi). Özet yalnız dosyaya işaret edilir. */
  assert.doesNotMatch(t, /[0-9a-f]{64}/, 'belgeye sabit SHA-256 yazılmış');
});

test('docs truth 6: rehberlerdeki docs bağlantıları diskte var', () => {
  const missing = [];
  for (const f of GUIDES) {
    for (const m of guide(f).matchAll(/\]\((\.\.\/)?(docs\/[A-Za-z0-9._-]+\.md)\)/g)) {
      if (!fs.existsSync(path.join(ROOT, m[2]))) missing.push(`${f} -> ${m[2]}`);
    }
  }
  assert.deepEqual(missing, [], `kırık bağlantı: ${missing.join(', ')}`);
});

test('docs truth 7: build/ varsa belgedeki eski sürüm onun gerçek sürümü', () => {
  const pkgPath = path.join(ROOT, 'build', 'Keyvotion Console', 'resources', 'app', 'package.json');
  if (!fs.existsSync(pkgPath)) return; // dist/build yoksa (CI) atlanır: iddia da yok
  const buildVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  const t = guide('docs/kullanim.md');
  assert.match(t, new RegExp(`eski \\*?\\*?${buildVersion.replace(/\./g, '\\.')}`),
    `belge build/ sürümünü ${buildVersion} olarak yazmıyor`);
  assert.notEqual(buildVersion, version, 'build/ artık güncel görünüyor; belge uyarısı gözden geçirilmeli');
});
