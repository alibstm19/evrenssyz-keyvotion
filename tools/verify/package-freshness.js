'use strict';
/*
 * Paket tazeliği kapısı: dist ZIP'teki src kopyası depodaki src ile aynı mı?
 *
 * `src/` paketten sonra değiştiyse ZIP bayattır ve yeniden üretilmelidir —
 * bu, "indirdim ama eski sürüm çıktı" şikayetini önleyen ölçümdür.
 *
 * Kullanım: node tools/verify/package-freshness.js
 * Çıkış: 0 = güncel, 1 = bayat/eksik dosya, 2 = dist yok (kapı atlanır).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT, SRC, walk } = require('../../tests/lib.js');

const APP = path.join(ROOT, 'dist', 'Keyvotion Console', 'resources', 'app');
if (!fs.existsSync(APP)) {
  console.log(JSON.stringify({ packaged: false, reason: 'dist yok' }));
  process.exit(2);
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
}
const SKIP = new Set(['node_modules', 'dist', 'build', '.cache']);
/* package.js yalnız bu dizinleri paket içine kopyalar ve package.json'ı kasten
   kırpıp yeniden yazar (devDependencies/sırlar pakete girmesin). Lock dosyası
   da bilinçli olarak dışarıda. Karşılaştırma bu sözleşmeye göre yapılır. */
const SHIPPED = new Set(['main', 'preload', 'renderer', 'shared', 'assets']);
const srcFiles = walk(SRC, null).filter((f) => {
  const rel = path.relative(SRC, f);
  if (rel.split(path.sep).some((part) => SKIP.has(part))) return false;
  return SHIPPED.has(rel.split(path.sep)[0]);
});

const rows = [];
for (const file of srcFiles) {
  const rel = path.relative(SRC, file);
  const packed = path.join(APP, rel);
  rows.push({
    rel,
    inPackage: fs.existsSync(packed),
    same: fs.existsSync(packed) && hash(file) === hash(packed)
  });
}
const missing = rows.filter((r) => !r.inPackage);
const differing = rows.filter((r) => r.inPackage && !r.same);

/* Sürüm adlı ZIP varsa o; yoksa en yeni ZIP. Eski sürümün arşivi
   tazelik ölçümünü maskelemesin (T-205'te v3.2.0 kalıntısı v3.3.0'ı gölgeledi). */
const distDir = path.join(ROOT, 'dist');
const version = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')).version;
const zips = fs.readdirSync(distDir).filter((f) => f.endsWith('.zip'));
const zip = zips.find((f) => f.includes(`-v${version}.zip`))
  || zips.map((f) => ({ f, t: fs.statSync(path.join(distDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t).map((x) => x.f)[0];
const zipTime = zip ? fs.statSync(path.join(distDir, zip)).mtime : null;
const newestSrc = srcFiles.reduce((acc, f) => (fs.statSync(f).mtime > acc ? fs.statSync(f).mtime : acc), new Date(0));

console.log(JSON.stringify({
  packagedFiles: walk(APP, null).length,
  compared: rows.length,
  missingFromPackage: missing.map((m) => m.rel),
  differing: differing.map((d) => d.rel),
  zip,
  zipTime: zipTime && zipTime.toISOString(),
  newestSrcTime: newestSrc.toISOString(),
  zipOlderThanSrc: Boolean(zipTime && newestSrc > zipTime)
}, null, 1));

const ok = missing.length === 0 && differing.length === 0 && !(zipTime && newestSrc > zipTime);
console.log(ok ? 'PAKET TAZELIGI: GECTI' : 'PAKET TAZELIGI: ESKI PAKET');
process.exit(ok ? 0 : 1);
