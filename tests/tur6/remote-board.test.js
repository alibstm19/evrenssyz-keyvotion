'use strict';

/*
 * Tur 6 — Uzaktan pano ucu (/api/board).
 *
 * NE ÖLÇÜLÜR (gerçek kod, gerçek HTTP, yalnız 127.0.0.1):
 *   1) Jeton yoksa /api/board → 401 E_UNAUTHORIZED.
 *   2) Yanlış jeton → 401.
 *   3) Doğru jeton (x-kv-token) → 200, phase/nextID/rows board.read()'ten.
 *   4) /api/health jetonsuz 200.
 *   Test sonunda sunucu stop() ile kapanır.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createRemoteService } = require(path.join(SRC, 'main', 'services', 'remote.js'));

const TOKEN = 'T6BOARD12';

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

function fakeChat() {
  return {
    list: () => ({ ok: true, data: { conversations: [] } }),
    get: () => ({ ok: false, error: { code: 'E_NOT_FOUND' } }),
    create: () => ({ ok: true, data: { conversation: { id: 'cvs_test' } } }),
    send: async () => ({ ok: true, data: { message: { content: 'ok' } } })
  };
}

async function boot(t) {
  const baseDir = tempDir('remote-board', t);
  const port = await freePort();
  const service = createRemoteService({
    baseDir,
    chat: fakeChat(),
    memory: { read: () => ({ ok: true, data: { entries: [], total: 0 } }) },
    board: {
      read: () => ({ ok: true, data: { phase: 'x', nextID: 'T-1', rows: [] } })
    },
    audit: { append() {} },
    getTeam: () => []
  });

  const started = await service.start({ port, token: TOKEN });
  assert.ok(started.ok, 'uzak sunucu başlamadı: ' + JSON.stringify(started.error));
  t.after(async () => { await service.stop(); });

  return { service, base: `http://127.0.0.1:${started.data.port}` };
}

async function get(url, headers) {
  const res = await fetch(url, { headers: headers || {} });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

test('tur6/remote-board 1: jetonsuz /api/board → 401', async (t) => {
  const { base } = await boot(t);
  const res = await get(`${base}/api/board`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'E_UNAUTHORIZED');
});

test('tur6/remote-board 2: yanlış jeton → 401', async (t) => {
  const { base } = await boot(t);
  const res = await get(`${base}/api/board`, { 'x-kv-token': 'YANLISKOD1' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'E_UNAUTHORIZED');
});

test('tur6/remote-board 3: doğru jeton → 200 ve board verisi', async (t) => {
  const { base } = await boot(t);
  const res = await get(`${base}/api/board`, { 'x-kv-token': TOKEN });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.phase, 'x');
  assert.equal(res.body.data.nextID, 'T-1');
  assert.ok(Array.isArray(res.body.data.rows));
  assert.equal(res.body.data.rows.length, 0);
});

test('tur6/remote-board 4: /api/health jetonsuz 200', async (t) => {
  const { base } = await boot(t);
  const res = await get(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.service, 'keyvotion-remote');
});
