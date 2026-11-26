'use strict';

/*
 * Tur 6 / T6-6 — Yerel OpenCode sunucusu yöneticisi.
 *
 * NE ÖLÇÜLÜR (gerçek kod; ağ dışına çıkılmaz, `opencode serve` BAŞLATILMAZ):
 *   1) parseTarget 4 girdi: tam adres, localhost + sonda eğik çizgi, boş, saçma.
 *   2) portOpen kapalı portta false.
 *   3) portOpen gerçekten dinleyen portta true.
 *   4) status() kapalı portta running/connected=false, error=E_OFFLINE;
 *      httpClient.info ÇAĞRILMAZ (port kapalıyken ağ denemesi yok).
 *   5) start() opencodeBin:null iken E_NOT_FOUND döner.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const {
  createServerManager,
  parseTarget,
  portOpen
} = require(path.join(SRC, 'main', 'services', 'server-manager.js'));

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

test('tur6/server 1: parseTarget 4 girdiyi doğru çözer', () => {
  const cases = [
    { input: 'http://127.0.0.1:51764', host: '127.0.0.1', port: 51764, url: 'http://127.0.0.1:51764' },
    { input: 'http://localhost:4096/', host: 'localhost', port: 4096, url: 'http://localhost:4096' },
    { input: '', host: '127.0.0.1', port: 51764, url: 'http://127.0.0.1:51764' },
    { input: 'saçma', host: '127.0.0.1', port: 51764, url: 'http://127.0.0.1:51764' }
  ];

  for (const c of cases) {
    const got = parseTarget(c.input);
    assert.equal(got.host, c.host, `host yanlış: ${JSON.stringify(c.input)}`);
    assert.equal(got.port, c.port, `port yanlış: ${JSON.stringify(c.input)}`);
    assert.equal(got.url, c.url, `url yanlış: ${JSON.stringify(c.input)}`);
  }
});

test('tur6/server 2: kapalı port 1 → portOpen false', async () => {
  const open = await portOpen(1, '127.0.0.1');
  assert.equal(open, false);
});

test('tur6/server 3: dinleyen port → portOpen true, kapanınca false', async (t) => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const port = server.address().port;
  const open = await portOpen(port, '127.0.0.1');
  assert.equal(open, true, 'dinleyen port açık sayılmalı');

  await new Promise((resolve) => server.close(resolve));
  const closed = await portOpen(port, '127.0.0.1');
  assert.equal(closed, false, 'kapanan port kapalı sayılmalı');
});

test('tur6/server 4: status kapalı portta E_OFFLINE der; info çağrılmaz', async (t) => {
  const dir = tempDir('server-status', t);
  const port = await freePort();
  let infoCalls = 0;

  const manager = createServerManager({
    baseDir: dir,
    settings: {
      connection: () => ({ serverURL: `http://127.0.0.1:${port}` }),
      getPassword: () => null
    },
    httpClient: {
      info: async () => {
        infoCalls += 1;
        throw new Error('çağrılmamalı');
      }
    },
    opencodeBin: null
  });

  const res = await manager.status();
  assert.ok(res.ok);
  assert.equal(res.data.running, false);
  assert.equal(res.data.connected, false);
  assert.equal(res.data.error, 'E_OFFLINE');
  assert.equal(infoCalls, 0, 'port kapalıyken httpClient.info çağrılmamalı');
  assert.equal(res.data.canStart, false);
});

test('tur6/server 5: start opencodeBin yoksa E_NOT_FOUND döner', async (t) => {
  const dir = tempDir('server-start', t);
  const port = await freePort();

  const manager = createServerManager({
    baseDir: dir,
    settings: {
      connection: () => ({ serverURL: `http://127.0.0.1:${port}` }),
      getPassword: () => null
    },
    httpClient: { info: async () => { throw new Error('çağrılmamalı'); } },
    opencodeBin: null
  });

  const res = await manager.start();
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_NOT_FOUND');
});
