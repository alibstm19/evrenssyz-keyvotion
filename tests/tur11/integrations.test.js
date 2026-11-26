'use strict';

/*
 * T-120 — Entegrasyon çekirdeği gerçek testleri.
 * Ağ YALNIZ 127.0.0.1 fixture; dış ağ yok. Gerçek fetchImpl kullanılır.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createIntegrationsService } = require(path.join(SRC, 'main', 'services', 'integrations.js'));

const REAL_CATALOG = path.join(SRC, 'main', 'services', 'integration-catalog.json');
const TOKEN = 'SUPERSECRET_TOKEN_12345';

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-int-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fakeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`ENC${s}`, 'utf8'),
    decryptString: (b) => b.toString('utf8').slice(3)
  };
}

function startFixture(t) {
  const seen = { auth: null, urls: [] };
  const server = http.createServer((req, res) => {
    seen.auth = req.headers.authorization || null;
    seen.urls.push(req.url);
    const url = String(req.url || '');
    if (url.startsWith('/health') || url.startsWith('/ping') || url.startsWith('/raw')) {
      if (url.startsWith('/raw')) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('bu-json-degil');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: url.split('?')[0] }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"ok":false}');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      if (t) t.after(() => new Promise((done) => server.close(done)));
      resolve({ base, seen });
    });
  });
}

async function makeService(t, overrides = {}) {
  const { base, seen } = await startFixture(t);
  const root = tempDir('svc', t);
  const catalogPath = path.join(root, 'catalog.json');
  const statePath = path.join(root, '.keyvotion', 'integrations.json');
  const catalog = [{
    id: 'fixture',
    name: 'Fixture',
    category: 'test',
    auth: { kind: 'bearer', header: 'Authorization', prefix: 'Bearer ' },
    hosts: ['127.0.0.1'],
    health: { verb: 'GET', path: `${base}/health`, expect: [200] },
    fields: [{ key: 'token', secret: true, required: true }],
    capabilities: [
      { id: 'ping', verb: 'GET', path: `${base}/ping?limit={limit}`, summary: 'Ping', params: { limit: { type: 'number', default: 10, max: 50 } } },
      { id: 'raw', verb: 'GET', path: `${base}/raw`, summary: 'Ham metin', params: {} },
      { id: 'badHost', verb: 'GET', path: 'https://evil.example.com/x', summary: 'Yasak host', params: {} }
    ],
    docs: 'https://example.invalid/docs'
  }];
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  const events = [];
  const safeStorage = overrides.safeStorage === undefined ? fakeStorage() : overrides.safeStorage;
  const service = createIntegrationsService({
    catalogPath,
    statePath,
    safeStorage,
    fetchImpl: globalThis.fetch,
    allowInsecureLoopback: true,
    onEvent: (packet) => events.push(packet),
    ...overrides.extra
  });
  return { service, catalogPath, statePath, root, events, seen, base };
}

function wantsCode(code) {
  return (err) => err && err.code === code;
}

/* ------------------------------------------------------------- katalog */

test('tur11/integrations 1: gerçek katalog 64 kayıt, şema geçerli', (t) => {
  const catalog = JSON.parse(fs.readFileSync(REAL_CATALOG, 'utf8'));
  assert.equal(catalog.length, 64, `sağlayıcı 64 olmalı (v3.1); ${catalog.length}`);
  const ids = catalog.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'sağlayıcı id tekil değil');
  const caps = catalog.reduce((a, p) => a + p.capabilities.length, 0);
  assert.equal(caps, 195, `yetenek toplamı 195 olmalı (v3.1); ${caps}`);
  for (const p of catalog) {
    for (const key of ['id', 'name', 'category', 'auth', 'hosts', 'health', 'fields', 'capabilities', 'docs']) {
      assert.ok(Object.prototype.hasOwnProperty.call(p, key), `${p.id}: ${key} yok`);
    }
    assert.ok(['bearer', 'header', 'basic', 'apiKey', 'oauth2', 'none'].includes(p.auth.kind), `${p.id}: auth.kind`);
    assert.ok(Array.isArray(p.hosts) && p.hosts.length > 0, `${p.id}: hosts`);
    assert.ok(p.health.verb && p.health.path && Array.isArray(p.health.expect), `${p.id}: health`);
    assert.ok(/^https:\/\//.test(p.docs), `${p.id}: docs URL`);
    assert.ok(p.capabilities.length >= 2, `${p.id}: yetenek < 2`);
    for (const c of p.capabilities) {
      for (const key of ['id', 'verb', 'path', 'summary', 'params']) {
        assert.ok(Object.prototype.hasOwnProperty.call(c, key), `${p.id}/${c.id}: ${key} yok`);
      }
      assert.ok(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(c.verb), `${p.id}/${c.id}: verb`);
      assert.ok(c.params && typeof c.params === 'object' && !Array.isArray(c.params), `${p.id}/${c.id}: params`);
    }
  }
});

test('tur11/integrations 1b: placeholder kuralı params ∪ fields ∪ {token}', () => {
  const catalog = JSON.parse(fs.readFileSync(REAL_CATALOG, 'utf8'));
  const check = (p, where, path) => {
    /* v3.1 kuralı: bir placeholder capability params, sağlayıcı fields
     * anahtarları veya özel `token` adından biriyle karşılanabilir. */
    const allowed = new Set([
      ...(p.fields || []).map((f) => f.key),
      ...p.capabilities.flatMap((c) => Object.keys(c.params || {})),
      'token'
    ]);
    for (const match of String(path).matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
      assert.ok(allowed.has(match[1]), `${p.id}: ${where} içinde tanımsız placeholder {${match[1]}}`);
    }
  };
  for (const p of catalog) {
    check(p, 'health.path', (p.health && p.health.path) || '');
    for (const c of p.capabilities) check(p, `${c.id}.path`, c.path || '');
  }
  assert.equal(catalog.length, 64);
});

/* ------------------------------------------------------------- save/list */

test('tur11/integrations 2: save sonrası dosyada düz metin token YOK', async (t) => {
  const { service, statePath } = await makeService(t);
  const saved = service.save({ providerId: 'fixture', label: 'Ana', token: TOKEN, fields: { site: 'x' } });
  assert.match(saved.id, /^fixture-[0-9a-f]{8}$/);
  const raw = fs.readFileSync(statePath, 'utf8');
  assert.equal(raw.includes(TOKEN), false, 'token düz metin olarak yazıldı');
  assert.match(raw, /"tokenCipher"/);
  assert.match(raw, /"fieldsCipher"/);
  assert.equal(raw.includes('"site": "x"'), false, 'fields açık kaldı');
});

test('tur11/integrations 3: list çıktısında token/tokenCipher alanı YOK', async (t) => {
  const { service } = await makeService(t);
  service.save({ providerId: 'fixture', label: 'Ana', token: TOKEN });
  const data = service.list();
  assert.equal(data.catalog.length, 1);
  assert.equal(data.accounts.length, 1);
  const a = data.accounts[0];
  assert.equal(Object.prototype.hasOwnProperty.call(a, 'token'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(a, 'tokenCipher'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(a, 'fieldsCipher'), false);
  assert.equal(JSON.stringify(data.accounts).includes(TOKEN), false);
  assert.deepEqual(Object.keys(a).sort(), ['id', 'label', 'lastTestAt', 'providerId', 'scopes', 'state']);
});

test('tur11/integrations 4: safeStorage yok → E_FORBIDDEN, dosya yazılmaz', async (t) => {
  const { statePath } = await makeService(t, { safeStorage: null });
  const service = createIntegrationsService({
    catalogPath: path.join(path.dirname(path.dirname(statePath)), 'catalog.json'),
    statePath,
    safeStorage: null,
    allowInsecureLoopback: true
  });
  assert.throws(() => service.save({ providerId: 'fixture', token: TOKEN }), wantsCode('E_FORBIDDEN'));
  assert.equal(fs.existsSync(statePath), false, 'dosya yazıldı');
});

test('tur11/integrations 5: bilinmeyen providerId → E_NOT_FOUND', async (t) => {
  const { service } = await makeService(t);
  assert.throws(() => service.save({ providerId: 'yok', token: TOKEN }), wantsCode('E_NOT_FOUND'));
});

/* ------------------------------------------------------------- test/invoke */

test('tur11/integrations 6: test 200 → connected, latencyMs sayı, detail HTTP kodu', async (t) => {
  const { service } = await makeService(t);
  const { id } = service.save({ providerId: 'fixture', token: TOKEN });
  const res = await service.test({ id });
  assert.equal(res.state, 'connected');
  assert.equal(typeof res.latencyMs, 'number');
  assert.ok(res.latencyMs >= 0);
  assert.equal(res.detail, 200);
  const acct = service.list().accounts[0];
  assert.equal(acct.state, 'connected');
  assert.ok(acct.lastTestAt);
});

test('tur11/integrations 7: invoke bilinmeyen capability → E_BAD_REQUEST', async (t) => {
  const { service } = await makeService(t);
  const { id } = service.save({ providerId: 'fixture', token: TOKEN });
  await assert.rejects(() => service.invoke({ id, capability: 'yok-boyle' }), wantsCode('E_BAD_REQUEST'));
});

test('tur11/integrations 8: beyaz liste dışı host → E_FORBIDDEN', async (t) => {
  const { service } = await makeService(t);
  const { id } = service.save({ providerId: 'fixture', token: TOKEN });
  await assert.rejects(() => service.invoke({ id, capability: 'badHost' }), wantsCode('E_FORBIDDEN'));
});

test('tur11/integrations 9: şema dışı params → E_BAD_REQUEST', async (t) => {
  const { service } = await makeService(t);
  const { id } = service.save({ providerId: 'fixture', token: TOKEN });
  await assert.rejects(() => service.invoke({ id, capability: 'ping', params: { tanimsiz: 1 } }), wantsCode('E_BAD_REQUEST'));
  await assert.rejects(() => service.invoke({ id, capability: 'ping', params: { limit: 'bes' } }), wantsCode('E_BAD_REQUEST'));
  await assert.rejects(() => service.invoke({ id, capability: 'ping', params: { limit: 999 } }), wantsCode('E_BAD_REQUEST'));
});

test('tur11/integrations 10: invoke JSON + ham metin + Bearer başlığı + olaylarda token yok', async (t) => {
  const { service, events, seen } = await makeService(t);
  const { id } = service.save({ providerId: 'fixture', token: TOKEN });
  const res = await service.invoke({ id, capability: 'ping', params: { limit: 7 } });
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(res.data.path, '/ping');
  assert.equal(seen.auth, `Bearer ${TOKEN}`);
  assert.ok(seen.urls.some((u) => u.includes('limit=7')), 'limit yerleştirilmedi');

  const raw = await service.invoke({ id, capability: 'raw' });
  assert.equal(raw.ok, true);
  assert.deepEqual(raw.data, { raw: 'bu-json-degil' });

  assert.ok(events.some((e) => e.type === 'state'), 'state olayı yok');
  assert.ok(events.some((e) => e.type === 'log'), 'log olayı yok');
  assert.equal(JSON.stringify(events).includes(TOKEN), false, 'olayda token var');
});

test('tur11/integrations 11: bozuk durum dosyası → boş liste, patlamaz', async (t) => {
  const { service, statePath } = await makeService(t);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, '{bozuk-json', 'utf8');
  assert.deepEqual(service.list().accounts, []);
});

/* ------------------------------------------------------------- remove/shutdown */

test('tur11/integrations 12: remove hesabı siler', async (t) => {
  const { service } = await makeService(t);
  const { id } = service.save({ providerId: 'fixture', token: TOKEN });
  assert.equal(service.list().accounts.length, 1);
  const res = service.remove({ id });
  assert.deepEqual(res, { id, removed: true });
  assert.equal(service.list().accounts.length, 0);
  assert.throws(() => service.remove({ id }), wantsCode('E_NOT_FOUND'));
});

test('tur11/integrations 13: shutdown bekleyen istek yoksa no-op', async (t) => {
  const { service } = await makeService(t);
  await service.shutdown();
  assert.equal(typeof service.shutdown(), 'object');
});
