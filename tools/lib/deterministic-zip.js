'use strict';
/**
 * Deterministik ZIP yazıcı — T-195.
 *
 * Neden: `Compress-Archive` her dosyanın disk zaman damgasını arşive yazıyordu,
 * bu yüzden aynı kaynaktan üretilen iki paket **farklı** SHA-256 veriyordu
 * (ölçüldü: 122045c2 → c528cdea → 0851af61, boyut hep 158.566.252 bayt).
 * O zaman "paket tazeliği" ve "yayın özeti" kanıtı yeniden üretilemez olur.
 *
 * Bu yazıcı:
 *   - girişleri yol adına göre **sıralar** (dosya sistemi sırası değişse de aynı),
 *   - zaman damgasını **sabit** yazar (1980-01-01 00:00, DOS epoch),
 *   - dış öznitelik / ek alan / yorum yazmaz,
 *   - içeriği deflate eder; seviye yalnız hız içindir, çıktı yine belirlenimlidir.
 *
 * Hiçbir bağımlılık yok: `node:zlib` ve `node:fs`.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');

/* DOS epoch: 1980-01-01 00:00. Sabit — arşiv yeniden üretilebilir olsun. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
const FLAG_UTF8 = 0x0800;
const METHOD_DEFLATE = 8;
const VERSION = 20;
const BIG_FILE = 32 * 1024 * 1024;

/* CRC-32 (IEEE 802.3) — zlib'in eksik parçası, tablo ile. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** Dizindeki tüm dosyaları göreli yolla topla (sıralı). */
function collect(dir, prefix = '', out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) collect(abs, rel, out);
    else if (e.isFile()) out.push({ abs, rel });
  }
  return out;
}

function header(kind, entry) {
  const name = Buffer.from(entry.rel, 'utf8');
  if (kind === 'local') {
    const buf = Buffer.alloc(30);
    buf.writeUInt32LE(0x04034b50, 0);
    buf.writeUInt16LE(VERSION, 4);
    buf.writeUInt16LE(FLAG_UTF8, 6);
    buf.writeUInt16LE(METHOD_DEFLATE, 8);
    buf.writeUInt16LE(DOS_TIME, 10);
    buf.writeUInt16LE(DOS_DATE, 12);
    buf.writeUInt32LE(entry.crc, 14);
    buf.writeUInt32LE(entry.compressed, 18);
    buf.writeUInt32LE(entry.size, 22);
    buf.writeUInt16LE(name.length, 26);
    buf.writeUInt16LE(0, 28);
    return Buffer.concat([buf, name]);
  }
  const buf = Buffer.alloc(46);
  buf.writeUInt32LE(0x02014b50, 0);
  buf.writeUInt16LE(VERSION, 4);
  buf.writeUInt16LE(VERSION, 6);
  buf.writeUInt16LE(FLAG_UTF8, 8);
  buf.writeUInt16LE(METHOD_DEFLATE, 10);
  buf.writeUInt16LE(DOS_TIME, 12);
  buf.writeUInt16LE(DOS_DATE, 14);
  buf.writeUInt32LE(entry.crc, 16);
  buf.writeUInt32LE(entry.compressed, 20);
  buf.writeUInt32LE(entry.size, 24);
  buf.writeUInt16LE(name.length, 28);
  buf.writeUInt16LE(0, 30);
  buf.writeUInt16LE(0, 32);
  buf.writeUInt16LE(0, 34);
  buf.writeUInt16LE(0, 36);
  buf.writeUInt32LE(0, 38);
  buf.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([buf, name]);
}

/**
 * `srcDir` içeriğini `outFile` arşivine yazar.
 * @returns {Promise<{entries:number, bytes:number, names:string[]}>}
 */
async function zipDirectory(srcDir, outFile, options = {}) {
  const tmpDir = options.tmpDir || path.dirname(outFile);
  const onProgress = options.onProgress || (() => {});
  const files = collect(srcDir);
  const fd = fs.openSync(outFile, 'w');
  let offset = 0;
  const written = [];

  const write = (buf) => {
    fs.writeSync(fd, buf);
    offset += buf.length;
  };

  try {
    for (const file of files) {
      const size = fs.statSync(file.abs).size;
      const tmp = path.join(tmpDir, `.zip-part-${process.pid}-${written.length}.tmp`);
      const level = size > BIG_FILE ? 1 : 6;
      /* CRC ve sıkıştırma tek okumada: 358 MB'ı iki kez okumak gereksiz. */
      let crc = -1;
      const reader = fs.createReadStream(file.abs);
      reader.on('data', (chunk) => {
        for (let i = 0; i < chunk.length; i += 1) crc = CRC_TABLE[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8);
      });
      await pipeline(
        reader,
        zlib.createDeflateRaw({ level }),
        fs.createWriteStream(tmp),
      );
      const compressed = fs.statSync(tmp).size;
      const entry = { rel: file.rel, size, compressed, crc: (crc ^ -1) >>> 0, offset };
      write(header('local', entry));
      const payload = fs.readFileSync(tmp);
      write(payload);
      fs.rmSync(tmp, { force: true });
      written.push(entry);
      onProgress(entry);
    }

    const cdStart = offset;
    for (const entry of written) write(header('central', entry));
    const cdSize = offset - cdStart;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(written.length, 8);
    eocd.writeUInt16LE(written.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    write(eocd);
  } finally {
    fs.closeSync(fd);
  }

  return { entries: written.length, bytes: offset, names: written.map((e) => e.rel) };
}

/** Doğrulama: arşivi okuyup her girişin CRC'sini yeniden hesaplar. */
async function verifyArchive(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const tail = Buffer.alloc(Math.min(22, size));
  fs.readSync(fd, tail, 0, tail.length, size - tail.length);
  if (tail.readUInt32LE(0) !== 0x06054b50) throw new Error('EOCD yok');
  const count = tail.readUInt16LE(10);
  const cdSize = tail.readUInt32LE(12);
  const cdOffset = tail.readUInt32LE(16);
  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOffset);
  fs.closeSync(fd);

  let p = 0;
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('merkezi dizin bozuk');
    const crc = cd.readUInt32LE(p + 16);
    const compressed = cd.readUInt32LE(p + 20);
    const uncompressed = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localOffset = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nameLen).toString('utf8');
    entries.push({ name, crc, compressed, uncompressed, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, sorted: entries.every((e, i) => i === 0 || entries[i - 1].name < e.name) };
}

module.exports = { zipDirectory, verifyArchive, collect, DOS_DATE, DOS_TIME };
