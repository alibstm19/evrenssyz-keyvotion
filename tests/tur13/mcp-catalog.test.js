'use strict';

/* T-137 — MCP sunucu şablon kataloğu gerçek testleri (ağ YOK, veri doğrulama). */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SRC } = require('../lib');

const CATALOG_PATH = path.join(SRC, 'main', 'services', 'mcp-catalog.json');
const catalog = require(CATALOG_PATH);

const CATEGORIES = new Set([
  'files', 'code', 'data', 'web', 'cloud',
  'communication', 'productivity', 'ai', 'observability', 'commerce'
]);
const KEYS = new Set([
  'id', 'name', 'vendor', 'category', 'transport',
  'command', 'url', 'args', 'envKeys', 'toolsHint', 'docs'
]);

test('tur13/mcp-catalog 1: 60 kayıt, tekil kebab-case id', () => {
  assert.equal(catalog.length, 60);
  const ids = catalog.map((x) => x.id);
  assert.equal(new Set(ids).size, 60);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `id: ${id}`);
});

test('tur13/mcp-catalog 2: alan şeması birebir (ek/eksik alan yok)', () => {
  for (const item of catalog) {
    for (const key of Object.keys(item)) assert.ok(KEYS.has(key), `${item.id}: fazla alan ${key}`);
    assert.equal(typeof item.name, 'string');
    assert.ok(item.name.trim().length > 0, `${item.id}: name boş`);
    assert.equal(typeof item.vendor, 'string');
    assert.ok(item.vendor.trim().length > 0, `${item.id}: vendor boş`);
    assert.equal(typeof item.toolsHint, 'string');
    assert.ok(item.toolsHint.trim().length > 0, `${item.id}: toolsHint boş`);
    assert.equal(typeof item.docs, 'string');
    assert.match(item.docs, /^https:\/\//, `${item.id}: docs https değil`);
  }
});

test('tur13/mcp-catalog 3: transport kuralları (stdio→command+args, http→https url)', () => {
  const transports = new Set(catalog.map((x) => x.transport));
  assert.deepStrictEqual([...transports].sort(), ['http', 'stdio']);
  for (const item of catalog) {
    if (item.transport === 'stdio') {
      assert.equal(typeof item.command, 'string');
      assert.ok(item.command.trim().length > 0, `${item.id}: command boş`);
      assert.ok(Array.isArray(item.args), `${item.id}: args dizi değil`);
      assert.ok(item.args.every((a) => typeof a === 'string'), `${item.id}: args string değil`);
      assert.equal(item.url, undefined, `${item.id}: stdio url taşıyor`);
    } else {
      assert.equal(typeof item.url, 'string');
      const url = new URL(item.url);
      assert.ok(url.protocol === 'https:' || /^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname),
        `${item.id}: http ve loopback değil`);
      assert.equal(item.command, undefined, `${item.id}: http command taşıyor`);
      assert.equal(item.args, undefined, `${item.id}: http args taşıyor`);
    }
  }
});

test('tur13/mcp-catalog 4: kategori kümesi ve envKeys yalnız isim', () => {
  for (const item of catalog) {
    assert.ok(CATEGORIES.has(item.category), `${item.id}: kategori ${item.category}`);
    if (item.envKeys === undefined) continue;
    assert.ok(Array.isArray(item.envKeys), `${item.id}: envKeys dizi değil`);
    for (const key of item.envKeys) {
      assert.match(key, /^[A-Z][A-Z0-9_]*$/, `${item.id}: envKey biçimi ${key}`);
      assert.ok(!/[=]/.test(key), `${item.id}: envKey değer içeriyor`);
    }
  }
});

test('tur13/mcp-catalog 5: sır/token/anahtar değeri yok', () => {
  const raw = JSON.stringify(catalog);
  const secrets = [/(sk-[A-Za-z0-9]{16,})/, /(ghp_[A-Za-z0-9]{16,})/, /(AIza[A-Za-z0-9_-]{20,})/,
    /(password\s*[:=])/, /("token"\s*:\s*")/];
  for (const re of secrets) assert.ok(!re.test(raw), `sır deseni: ${re}`);
});
