'use strict';

/*
 * T-194 — Yayın hazırlığı tek kapıda.
 *
 * Kusur: yayın kanıtı dağınıktı (12 adım, elle sırayla); onay geldiğinde
 * "provası yapılmış tek hamle" yoktu. `tools/verify/publish-readiness.js`
 * mevcut kapıları emredilen sırayla koşar, her adımı tek satırda ölçer ve tek
 * satır karar verir.
 *
 * Bu test kilidi:
 *   1) Dosya var ve Node sözdizimi geçerli.
 *   2) Adım sırası emirdeki sırayla birebir aynı.
 *   3) Kısa devre yok: her adım `results` a yazılır, döngü `break` etmez.
 *   4) Son satır tek başına `YAYIN HAZIR: EVET/HAYIR`; EVET yalnız 0 KALDI ile.
 *   5) En üstte onay sonrası komut listesi var (owner, push, etiket, checksum).
 *   6) Yeni bağımlılık yok: yalnız node:fs/path/child_process.
 *   7) Canlı kapılar `--static` ile atlanır (CI), atlananlar listelenir.
 *   8) CI paket iş akışında readiness adımı var.
 *   9) Bu komut push/etiket/release ÇALIŞTIRMAZ (yalnız yorum satırı).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('../lib');

const FILE = path.join(ROOT, 'tools', 'verify', 'publish-readiness.js');
const src = read(FILE);

const ORDER = [
  'package',
  'freshness',
  'tap-count',
  'doctor',
  'k3',
  'html-check',
  'ldr-smoke',
  'packaged-smoke',
  'packaged-onboard-persist',
  'boot-budget',
  'secret-scan',
  'set-repo-owner',
];

test('publish readiness 1: komut var ve derleniyor', () => {
  assert.ok(fs.existsSync(FILE), 'tools/verify/publish-readiness.js yok');
  assert.match(src, /^'use strict';/, 'strict mod yok');
  assert.match(src, /YAYIN HAZIR: \$\{/, 'karar satırı yazılmıyor');
});

test('publish readiness 2: adım sırası emirle birebir aynı', () => {
  const ids = [...src.matchAll(/^\s{4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, ORDER, `sıra yanlış: ${ids.join(' > ')}`);
});

test('publish readiness 3: kısa devre yok, her adım koşar', () => {
  const loop = src.slice(src.indexOf('for (let i = 0; i < selected.length'));
  assert.ok(loop.length > 0, 'adım döngüsü yok');
  assert.doesNotMatch(loop, /\bbreak\b/, "döngüde break var (kısa devre)");
  assert.match(loop, /results\.push\(\{ step, ok: r\.ok, measure, ms: r\.ms \}\)/, 'sonuç kaydı yazılmıyor');
  assert.match(src, /const failed = results\.filter\(\(r\) => !r\.ok\);/, 'toplam KALDI hesabı yok');
});

test('publish readiness 4: karar tek satır ve KALDI sayısına bağlı', () => {
  assert.match(src, /YAYIN HAZIR: \$\{failed\.length === 0 \? 'EVET' : 'HAYIR'\}/, 'karar satırı sayıya bağlı değil');
  assert.match(src, /process\.exitCode = failed\.length === 0 \? 0 : 1;/, 'çıkış kodu karara bağlı değil');
  const tail = src.slice(src.lastIndexOf("console.log(`YAYIN HAZIR"));
  assert.ok(tail.indexOf("console.log(`adım:") === -1, 'karar satırından sonra çıktı var');
});

test('publish readiness 5: onay sonrası komut listesi en üstte', () => {
  const body = src.slice(src.indexOf('function printPublishCommands'));
  assert.match(body, /set-repo-owner\.js <owner> keyvotion/, 'owner doldurma komutu yok');
  assert.match(body, /git push -u origin master/, 'push komutu yok');
  assert.match(body, /git tag -a v\$\{VERSION\}/, 'etiket komutu yok');
  assert.match(body, /gh release create/, 'release komutu yok');
  assert.match(body, /certutil -hashfile/, 'checksum doğrulama yok');
  assert.match(src, /printPublishCommands\(\);\n  if \(STATIC_ONLY\)/, 'komut listesi adımlardan önce basılmıyor');
});

test('publish readiness 6: yeni bağımlılık yok', () => {
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(requires.sort(), ['node:child_process', 'node:fs', 'node:path'], `beklenmeyen require: ${requires}`);
});

test('publish readiness 7: CI kipi canlı kapıları atlar ve söyler', () => {
  assert.match(src, /const STATIC_ONLY = args\.has\('--static'\);/, '--static yok');
  assert.match(src, /const selected = STEPS\.filter\(\(s\) => !STATIC_ONLY \|\| !s\.live\);/, 'canlı kapı filtresi yok');
  assert.match(src, /CI kipi: canlı Electron kapıları atlandı/, 'atlananlar duyurulmuyor');
  const live = [...src.matchAll(/^\s{4}live: true,$/gm)].length;
  assert.ok(live >= 5, `canlı kapı işareti az: ${live}`);
});

test('publish readiness 8: CI paket iş akışında adım var', () => {
  const wf = read(path.join(ROOT, '.github', 'workflows', 'build.yml'));
  assert.match(wf, /Publish readiness/, 'iş akışında readiness adımı yok');
  assert.match(wf, /node tools\/verify\/publish-readiness\.js --static/, 'adım --static ile koşmuyor');
  assert.match(wf, /node tools\/package\.js --zip/, 'önce paket üretilmiyor');
});

test('publish readiness 9: komut hiçbir şey yayınlamaz', () => {
  assert.doesNotMatch(src, /execFileSync\(|execSync\(/, 'kabuk komutu çalıştırıyor');
  const ownerStep = src.slice(src.indexOf("id: 'set-repo-owner'"), src.indexOf("id: 'set-repo-owner'") + 400);
  assert.match(ownerStep, /'--dry-run'/, 'owner adımı kuru koşu değil');
  /* Push/etiket/release yalnız yorum bloğunda geçer; kodda komut olarak yok. */
  const codeLines = src.split(/\r?\n/)
    .filter((l) => !/^\s*(#|\*|\/\/)/.test(l))
    .filter((l) => !/^\s*['"`]#/.test(l));
  const code = codeLines.join('\n');
  assert.doesNotMatch(code, /git push/, 'kod push çalıştırıyor');
  assert.doesNotMatch(code, /git tag/, 'kod etiket atıyor');
  assert.doesNotMatch(code, /gh release/, 'kod release açıyor');
});
