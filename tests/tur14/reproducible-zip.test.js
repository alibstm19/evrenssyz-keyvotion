'use strict';

/*
 * T-195 — Paket arşivi yeniden üretilebilir (aynı kaynak → aynı SHA-256).
 *
 * Kusur (ölçüldü, düzeltmeden önce): `Compress-Archive` her dosyanın disk
 * zaman damgasını arşive yazıyordu; aynı `src/` ağacından üretilen üç paket
 * **üç ayrı** özet verdi — `122045c2…`, `c528cdea…`, `0851af61…` — boyut ise
 * hep 158.566.252 bayttı. Bu yüzden "paket tazeliği" ve "yayın özeti" kanıtı
 * yeniden üretilemiyordu: aynı commit için iki farklı SHA yayınlanabilirdi.
 *
 * Bu test kilidi:
 *   1) Yazıcı bağımlılıksızdır (yalnız node:fs / node:path / node:zlib / node:stream).
 *   2) Zaman damgası sabittir; `Date.now()` / `new Date()` ile damga yazılmaz.
 *   3) Girişler yol adına göre sıralanır.
 *   4) Aynı içerik, farklı disk mtime'ı → **aynı** SHA-256 (işlevsel kanıt).
 *   5) Arşiv okunabilir: `verifyArchive` girişleri ve sıralamayı doğrular.
 *   6) `package.js` Compress-Archive kullanmaz; deterministik yazıcıyı çağırır.
 *   7) Diskteki ZIP varsa `SHA256SUMS.txt` gerçekten onun özetidir.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT, read } = require('../lib');

const LIB = path.join(ROOT, 'tools', 'lib', 'deterministic-zip.js');
const { zipDirectory, verifyArchive } = require(LIB);
const src = read(LIB);

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-zip-'));
  const dir = path.join(base, 'app');
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'b.txt'), 'ikinci\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'birinci satır\n'.repeat(300));
  fs.writeFileSync(path.join(dir, 'sub', 'deep.bin'), Buffer.from([0, 1, 2, 3, 250, 251]));
  fs.writeFileSync(path.join(dir, 'empty.txt'), '');
  return { base, dir };
}

test('reproducible zip 1: yazıcı yeni bağımlılık getirmez', () => {
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(requires, ['node:fs', 'node:path', 'node:stream/promises', 'node:zlib'],
    `beklenmeyen require: ${requires.join(', ')}`);
});

test('reproducible zip 2: zaman damgası sabit', () => {
  assert.match(src, /const DOS_TIME = 0;/, 'DOS saati sabit değil');
  assert.match(src, /const DOS_DATE = 0x0021;/, 'DOS tarihi (1980-01-01) sabit değil');
  assert.doesNotMatch(src, /Date\.now\(\)|new Date\(/, 'arşive gerçek zaman damgası yazılıyor');
  assert.match(src, /buf\.writeUInt16LE\(DOS_TIME, 10\)/, 'yerel başlık sabit saati kullanmıyor');
  assert.match(src, /buf\.writeUInt16LE\(DOS_DATE, 12\)/, 'yerel başlık sabit tarihi kullanmıyor');
});

test('reproducible zip 3: girişler yol adına göre sıralanır', () => {
  assert.match(src, /\.sort\(\(a, b\) => \(a\.name < b\.name \? -1 : a\.name > b\.name \? 1 : 0\)\)/,
    'dizin okuma sırası sabitlenmemiş');
});

test('reproducible zip 4: farklı mtime aynı SHA-256 verir', async () => {
  const { base, dir } = fixture();
  const one = path.join(base, 'one.zip');
  const two = path.join(base, 'two.zip');
  try {
    const r1 = await zipDirectory(dir, one, { tmpDir: base });
    const later = new Date(Date.now() + 86400 * 1000);
    for (const f of ['a.txt', 'b.txt', 'empty.txt', 'sub/deep.bin']) {
      fs.utimesSync(path.join(dir, f), later, later);
    }
    const r2 = await zipDirectory(dir, two, { tmpDir: base });
    assert.equal(sha(one), sha(two), 'mtime değişince özet değişti — arşiv yeniden üretilemez');
    assert.equal(r1.entries, r2.entries, 'giriş sayısı değişti');
    assert.equal(r1.bytes, r2.bytes, 'arşiv boyutu değişti');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('reproducible zip 5: arşiv okunur ve girişler sıralı', async () => {
  const { base, dir } = fixture();
  const file = path.join(base, 'check.zip');
  try {
    await zipDirectory(dir, file, { tmpDir: base });
    const check = await verifyArchive(file);
    assert.equal(check.entries.length, 4, 'giriş sayısı yanlış');
    assert.deepEqual(check.entries.map((e) => e.name), ['a.txt', 'b.txt', 'empty.txt', 'sub/deep.bin'],
      'girişler sıralı değil veya yol ayırıcı yanlış');
    assert.equal(check.sorted, true, 'merkezi dizin sıralı değil');
    const empty = check.entries.find((e) => e.name === 'empty.txt');
    assert.equal(empty.crc, 0, 'boş dosya CRC 0 değil');
    assert.equal(empty.uncompressed, 0, 'boş dosya boyutu 0 değil');
    const deep = check.entries.find((e) => e.name === 'sub/deep.bin');
    assert.equal(deep.uncompressed, 6, 'ikili dosya boyutu yanlış');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('reproducible zip 6: paketleyici Compress-Archive kullanmaz', () => {
  const pkg = read(path.join(ROOT, 'tools', 'package.js'));
  assert.doesNotMatch(pkg, /Compress-Archive/, 'hâlâ Compress-Archive kullanılıyor');
  assert.match(pkg, /require\('\.\/lib\/deterministic-zip'\)/, 'deterministik yazıcı bağlanmamış');
  assert.match(pkg, /await zipDirectory\(OUT, target/, 'yazıcı arşivi üretmiyor');
  assert.match(pkg, /await verifyArchive\(target\)/, 'arşiv kendini doğrulamıyor');
  assert.match(pkg, /entries read, \$\{result\.entries\} written/, 'giriş sayısı denetlenmiyor');
});

test('reproducible zip 7: diskteki ZIP özeti SHA256SUMS ile aynı', () => {
  const distDir = path.join(ROOT, 'dist');
  const sumsPath = path.join(distDir, 'SHA256SUMS.txt');
  if (!fs.existsSync(sumsPath)) return; // CI: paket üretilmemiş
  const version = JSON.parse(read(path.join(ROOT, 'src', 'package.json'))).version;
  const zipPath = path.join(distDir, `Keyvotion-Console-win32-x64-v${version}.zip`);
  if (!fs.existsSync(zipPath)) return;
  const sums = fs.readFileSync(sumsPath, 'utf8').trim();
  const [hash, name] = sums.split(/\s+/);
  assert.equal(name, path.basename(zipPath), 'SHA256SUMS başka dosyayı işaret ediyor');
  assert.equal(hash, sha(zipPath), 'SHA256SUMS diskteki arşivin özeti değil');
});
