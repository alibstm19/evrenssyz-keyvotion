'use strict';

/*
 * Tur 11 — indirme güvenliği (T-110, API-51g).
 *
 * NE ÖLÇÜLÜR (gerçek kod http-client.downloadToFile, gerçek HTTP yalnız 127.0.0.1):
 *   1) `http:` protokolü reddedilir (E_FORBIDDEN — E_NETWORK ile karışmaz).
 *   2) Beyaz liste içi loopback http, açık izinle kabul edilir (fixture 200).
 *   3) Beyaz liste dışı host ve alt alan adı hilesi ağa çıkmadan reddedilir.
 *   4) Boş/eksik allowedHosts → E_FORBIDDEN (güvenli varsayılan, sessiz geçiş yok).
 *   5) userinfo ve port hilesi reddedilir.
 *   6) Yönlendirme beyaz liste dışı host'a kaçarsa reddedilir (sayaçla kanıt).
 *
 * Gerçek dış ağ yok: node:http + 127.0.0.1:0 fixture.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createHttpClient, hostAllowed } = require(path.join(SRC, 'main', 'services', 'http-client.js'));
const { MODEL_HOST_ALLOWLIST } = require(path.join(SRC, 'shared', 'model-hosts.js'));

const client = createHttpClient({ getConfig: () => ({}), getPassword: () => null });

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** İstek sayan yerel fixture sunucusu (127.0.0.1:0). */
function startServer(t, handler) {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    handler(req, res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      if (t) t.after(() => new Promise((done) => server.close(done)));
      resolve({ base, count: () => requests });
    });
  });
}

test('tur11/download-security 1: http: protokolü → E_FORBIDDEN', async (t) => {
  const dir = tempDir('dlsec', t);
  const dest = path.join(dir, 'out.bin');

  /* Beyaz listede olmasına rağmen http: reddedilmeli (protokol kuralı). */
  const external = await client.downloadToFile({
    url: 'http://example.com/model.bin',
    destPath: dest,
    allowedHosts: ['example.com']
  });
  assert.equal(external.ok, false);
  assert.equal(external.error.code, 'E_FORBIDDEN');

  /* Loopback http, açık izin (allowInsecureLoopback) olmadan reddedilmeli. */
  const loopback = await client.downloadToFile({
    url: 'http://127.0.0.1:9/model.bin',
    destPath: dest,
    allowedHosts: ['127.0.0.1']
  });
  assert.equal(loopback.ok, false);
  assert.equal(loopback.error.code, 'E_FORBIDDEN');
});

test('tur11/download-security 2: beyaz liste içi loopback http kabul edilir', async (t) => {
  const body = Buffer.alloc(16 * 1024, 0x43);
  const { base } = await startServer(t, (req, res) => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(body.length)
    });
    res.end(body);
  });
  const dir = tempDir('dlsec', t);
  const dest = path.join(dir, 'model.bin');

  const res = await client.downloadToFile({
    url: `${base}/model.bin`,
    destPath: dest,
    allowedHosts: ['127.0.0.1'],
    allowInsecureLoopback: true
  });
  assert.equal(res.ok, true);
  assert.equal(res.data.receivedBytes, body.length);
  assert.equal(fs.statSync(dest).size, body.length);
});

test('tur11/download-security 3: beyaz liste dışı host → E_FORBIDDEN (ağa çıkılmadan)', async (t) => {
  const dir = tempDir('dlsec', t);
  const dest = path.join(dir, 'out.bin');

  /* Host denetimi fetch'ten ÖNCE yapılır: E_FORBIDDEN yalnız oradan gelir. */
  const cases = [
    'https://evil.example/model.bin',
    'https://127.0.0.1.evil.com/model.bin',
    'https://evil.127.0.0.1/model.bin'
  ];
  for (const url of cases) {
    const res = await client.downloadToFile({
      url,
      destPath: dest,
      allowedHosts: ['127.0.0.1', 'huggingface.co']
    });
    assert.equal(res.ok, false, url);
    assert.equal(res.error.code, 'E_FORBIDDEN', url);
  }
});

test('tur11/download-security 4: boş/eksik allowedHosts → E_FORBIDDEN', async (t) => {
  const dir = tempDir('dlsec', t);
  const dest = path.join(dir, 'out.bin');

  const missing = await client.downloadToFile({
    url: 'https://huggingface.co/model.bin',
    destPath: dest
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'E_FORBIDDEN');

  const empty = await client.downloadToFile({
    url: 'https://huggingface.co/model.bin',
    destPath: dest,
    allowedHosts: []
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.error.code, 'E_FORBIDDEN');
});

test('tur11/download-security 5: userinfo ve port hilesi → E_FORBIDDEN', async (t) => {
  const dir = tempDir('dlsec', t);
  const dest = path.join(dir, 'out.bin');

  /* https://a@127.0.0.1/ — host listede ama userinfo var. */
  const userinfo = await client.downloadToFile({
    url: 'https://a@127.0.0.1/model.bin',
    destPath: dest,
    allowedHosts: ['127.0.0.1']
  });
  assert.equal(userinfo.ok, false);
  assert.equal(userinfo.error.code, 'E_FORBIDDEN');

  /* https://huggingface.co:8443/ — beyaz listede ama standart dışı port. */
  const port = await client.downloadToFile({
    url: 'https://huggingface.co:8443/model.bin',
    destPath: dest,
    allowedHosts: ['huggingface.co']
  });
  assert.equal(port.ok, false);
  assert.equal(port.error.code, 'E_FORBIDDEN');
});

test('tur11/download-security 6: yönlendirme beyaz liste dışına çıkıyor → E_FORBIDDEN', async (t) => {
  const { base, count } = await startServer(t, (req, res) => {
    res.writeHead(302, { location: 'https://evil.example/model.bin' });
    res.end();
  });
  const dir = tempDir('dlsec', t);
  const dest = path.join(dir, 'out.bin');

  const res = await client.downloadToFile({
    url: `${base}/start`,
    destPath: dest,
    allowedHosts: ['127.0.0.1'],
    allowInsecureLoopback: true
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_FORBIDDEN');
  /* İlk istek fixture'a gider (1); yönlendirilen adrese istek ATILMAZ:
     E_FORBIDDEN yalnız fetch öncesi host denetiminden gelir ve dosya yazılmaz. */
  assert.equal(count(), 1, 'yönlendirme hedefine istek atılmış olmalı');
  assert.equal(fs.existsSync(dest), false, 'hedef dosya yazılmamalı');
});

/* --- Lider eki (2026-11-14): gerçek HuggingFace CDN zinciri ---
 * Ölçüm: `HEAD https://huggingface.co/.../resolve/main/x.gguf` → 200 ve son
 * host `us.aws.cdn.hf.co`. Tam eşleşme kuralı bu zinciri reddediyordu, yani
 * T-112 taslağındaki 4 kayıt gerçekte kurulamazdı. Kural: tam eşleşme VEYA
 * `.`+girdi ile biten alt alan adı. */

test('tur11/download-security 7: alt alan adı tabanı kabul, benzer host reddedilir', () => {
  /* Gerçek zincir: giriş host'u + CDN alt alan adı. */
  assert.equal(hostAllowed('https://huggingface.co/a/b', MODEL_HOST_ALLOWLIST, false), true);
  assert.equal(hostAllowed('https://us.aws.cdn.hf.co/a/b', MODEL_HOST_ALLOWLIST, false), true);
  assert.equal(hostAllowed('https://cdn-lfs.huggingface.co/x', MODEL_HOST_ALLOWLIST, false), true);

  /* Hile denemeleri: sonek benzeri ama farklı kayıtlı alan adları. */
  assert.equal(hostAllowed('https://evil-hf.co/x', MODEL_HOST_ALLOWLIST, false), false);
  assert.equal(hostAllowed('https://hf.co.evil.com/x', MODEL_HOST_ALLOWLIST, false), false);
  assert.equal(hostAllowed('https://huggingface.co.evil.com/x', MODEL_HOST_ALLOWLIST, false), false);
  assert.equal(hostAllowed('https://evil.com/huggingface.co', MODEL_HOST_ALLOWLIST, false), false);

  /* Yol/parça host'u değiştirmez, userinfo ve port yine reddedilir. */
  assert.equal(hostAllowed('https://hf.co@evil.com/x', MODEL_HOST_ALLOWLIST, false), false);
  assert.equal(hostAllowed('https://us.aws.cdn.hf.co:8443/x', MODEL_HOST_ALLOWLIST, false), false);
});

test('tur11/download-security 8: http: ve boş liste hostAllowed içinde de reddedilir', () => {
  assert.equal(hostAllowed('http://huggingface.co/x', MODEL_HOST_ALLOWLIST, false), false);
  assert.equal(hostAllowed('https://huggingface.co/x', [], false), false);
  assert.equal(hostAllowed('https://huggingface.co/x', MODEL_HOST_ALLOWLIST, true), true);
});
