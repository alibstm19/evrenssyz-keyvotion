'use strict';

// Tur 8 / Dosyalar + Bağlam servisi (T8-7)
//
// Ölçülen iddialar:
//  1) Kök listelenir; alt klasör ve dosya kayıtları gelir.
//  2) Kök dışı ve `..` kaçışı reddedilir (E_FORBIDDEN).
//  3) Sır dosyaları (.env, keys.bin, *.pem) listelenmez ve okunmaz.
//  4) Büyük dosya reddedilir; ikili dosya metin olarak dönmez.
//  5) context yalnız seçili dosyaları paketler, hafıza bloğunu ekler, sınırı aşmaz.
//  6) Servis SALT OKUMA: dosya değiştiren hiçbir eylem yok.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SRC, read } = require('../lib');

const {
  createFilesService,
  denyReason,
  MAX_CONTEXT_CHARS
} = require(path.join(SRC, 'main', 'services', 'files.js'));

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-files-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'README.md'), '# Proje\nsatır iki\n', 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'const a = 1;\n', 'utf8');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1\n', 'utf8');
  fs.writeFileSync(path.join(root, 'keys.bin'), 'binary', 'utf8');
  fs.writeFileSync(path.join(root, 'cert.pem'), 'x', 'utf8');
  fs.writeFileSync(path.join(root, 'big.txt'), 'a'.repeat(300000), 'utf8');
  const service = createFilesService({ getProjectDir: () => root });
  return { root, service };
}

test('tur8/files 1: kök ve alt klasör listelenir', () => {
  const { root, service } = sandbox();
  const res = service.list({});
  assert.strictEqual(res.ok, true, JSON.stringify(res.error));
  assert.strictEqual(res.data.rel, '.');
  assert.strictEqual(res.data.dir, path.resolve(root));
  const names = res.data.entries.map((e) => e.name);
  assert.ok(names.includes('README.md'));
  assert.ok(names.includes('src'));
  assert.ok(!names.includes('.env'));
  assert.ok(!names.includes('keys.bin'));
  assert.ok(!names.includes('cert.pem'));

  const sub = service.list({ path: 'src' });
  assert.strictEqual(sub.ok, true);
  assert.strictEqual(sub.data.rel, 'src');
  assert.strictEqual(sub.data.parent, path.resolve(root));
  assert.deepStrictEqual(sub.data.entries.map((e) => e.name), ['app.js']);
});

test('tur8/files 2: kök dışı ve .. kaçışı reddedilir', () => {
  const { root, service } = sandbox();
  assert.strictEqual(service.list({ path: '..' }).error.code, 'E_FORBIDDEN');
  assert.strictEqual(service.list({ path: path.join(root, '..', 'x') }).error.code, 'E_FORBIDDEN');
  assert.strictEqual(service.read({ path: path.join('..', 'secret.txt') }).error.code, 'E_FORBIDDEN');
  assert.strictEqual(service.read({ path: path.resolve(root, '..', 'win.ini') }).error.code, 'E_FORBIDDEN');
});

test('tur8/files 3: sır dosyaları okunmaz ve listelenmez', () => {
  const { root, service } = sandbox();
  assert.strictEqual(service.read({ path: '.env' }).error.code, 'E_FORBIDDEN');
  assert.strictEqual(service.read({ path: 'keys.bin' }).error.code, 'E_FORBIDDEN');
  assert.strictEqual(service.read({ path: 'cert.pem' }).error.code, 'E_FORBIDDEN');
  assert.strictEqual(denyReason(path.join(root, '.env.local')), true);
  assert.strictEqual(denyReason(path.join(root, 'secrets.bin')), true);
  assert.strictEqual(denyReason(path.join(root, 'notes.md')), false);
});

test('tur8/files 4: büyük dosya reddedilir; ikili dosya metin dönmez', () => {
  const { root, service } = sandbox();
  assert.strictEqual(service.read({ path: 'big.txt' }).error.code, 'E_BAD_REQUEST');

  fs.writeFileSync(path.join(root, 'image.bin'), Buffer.from([0, 1, 2, 3, 0, 5]));
  const bin = service.read({ path: 'image.bin' });
  assert.strictEqual(bin.ok, true);
  assert.strictEqual(bin.data.binary, true);
  assert.strictEqual(bin.data.text, '');
});

test('tur8/files 5: metin okunur, satır sayısı ve kırpma bilgisi doğru', () => {
  const { service } = sandbox();
  const res = service.read({ path: 'README.md' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.binary, false);
  assert.strictEqual(res.data.rel, 'README.md');
  assert.strictEqual(res.data.text, '# Proje\nsatır iki\n');
  assert.strictEqual(res.data.truncated, false);
  assert.ok(res.data.lines >= 2);
});

test('tur8/files 6: context seçili dosyaları paketler, atlananları bildirir', () => {
  const { service } = sandbox();
  const res = service.context({ paths: ['README.md', 'src/app.js', '.env', 'image.bin'] });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.data.files.map((f) => f.path), ['README.md', 'src/app.js']);
  assert.ok(res.data.block.includes('## Seçili dosyalar'));
  assert.ok(res.data.block.includes('# Proje'));
  assert.ok(res.data.block.includes('const a = 1;'));
  assert.ok(!res.data.block.includes('SECRET=1'));
  const reasons = res.data.skipped.map((s) => `${s.path}:${s.reason}`);
  assert.ok(reasons.some((r) => r.startsWith('.env:')));
});

test('tur8/files 7: context hafıza kayıtlarını ekler ve maxChars sınırını aşmaz', () => {
  const memory = {
    context: () => ({ ok: true, data: { block: '## Paylaşılan ajan hafızası\n\n- tercih', count: 1 } })
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-files-mem-'));
  fs.writeFileSync(path.join(root, 'a.txt'), 'x'.repeat(50000), 'utf8');
  const service = createFilesService({ getProjectDir: () => root, memory });

  const res = service.context({ paths: ['a.txt'], maxChars: 2000 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.memoryCount, 1);
  assert.ok(res.data.block.includes('Paylaşılan ajan hafızası'));
  assert.ok(res.data.chars <= 2000 + 400, `chars=${res.data.chars}`);
  assert.strictEqual(res.data.truncated, true);
  assert.ok(MAX_CONTEXT_CHARS >= 2000);
});

test('tur8/files 8: servis salt okuma — yazma/silme eylemi yok', () => {
  const source = read(path.join(SRC, 'main', 'services', 'files.js'));
  assert.ok(!/writeFileSync|appendFileSync|unlinkSync|rmSync|renameSync|mkdirSync/.test(source),
    'files.js yazma API kullanmamalı');
  const { service } = sandbox();
  assert.deepStrictEqual(Object.keys(service).sort(), ['MAX_CONTEXT_CHARS', 'context', 'list', 'read', 'root']);
});
