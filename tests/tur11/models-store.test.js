'use strict';

/*
 * Tur 11 — yerel model deposu çekirdeği (T-104).
 *
 * NE ÖLÇÜLÜR (gerçek kod, gerçek HTTP YALNIZ 127.0.0.1):
 *   1) Katalog yok/bozuk → list() boş + catalogError, patlamaz.
 *   2) install doğrulama sırası: E_NOT_FOUND → E_CONFIRM_REQUIRED → E_FORBIDDEN → E_DISK_FULL.
 *   3) Başarılı indirme: .part → hash → atomik rename, state ready, ilerleme artan.
 *   4) Hash uyuşmazlığı: failed + .part KORUNUR.
 *   5) İptal: paused + .part var; yeniden install resumeFrom > 0 geçer.
 *   6) verify doğru/bozuk dosyada true/false.
 *   7) remove: dosya gider, freedBytes > 0; targetDir dışı yol reddedilir.
 *   8) Kuyruk: tek eşzamanlı indirme; ikincisi queued.
 *
 * Gerçek dış ağ yok; indirici ürün kodu `http-client.downloadToFile`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createModelsStore } = require(path.join(SRC, 'main', 'services', 'models-store.js'));
const { createHttpClient } = require(path.join(SRC, 'main', 'services', 'http-client.js'));

const MB = 1024 * 1024;
const CHUNK = 128 * 1024;
const CHUNK_DELAY_MS = 20;

const GOOD = Buffer.alloc(2 * MB, 0x41);
const GOOD2 = Buffer.alloc(2 * MB, 0x42);
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 2 MB gövde, Range destekli, yavaş akan yerel sunucu. */
function startFixtureServer(t) {
  const server = http.createServer((req, res) => {
    const body = req.url.includes('good2') || req.url.includes('bad') ? GOOD2 : GOOD;
    const range = /^bytes=(\d+)-$/.exec(String(req.headers.range || ''));
    const start = range ? Number(range[1]) : 0;
    if (range && start >= body.length) {
      res.writeHead(416, { 'content-range': `bytes */${body.length}` });
      res.end();
      return;
    }
    const slice = body.subarray(start);
    res.writeHead(range ? 206 : 200, {
      'content-type': 'application/octet-stream',
      'content-length': String(slice.length),
      ...(range ? { 'content-range': `bytes ${start}-${body.length - 1}/${body.length}` } : {})
    });
    let offset = 0;
    const timer = setInterval(() => {
      if (offset >= slice.length) {
        clearInterval(timer);
        res.end();
        return;
      }
      res.write(slice.subarray(offset, offset + CHUNK));
      offset += CHUNK;
    }, CHUNK_DELAY_MS);
    req.on('close', () => clearInterval(timer));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      if (t) t.after(() => new Promise((done) => server.close(done)));
      resolve(base);
    });
  });
}

function makeStores(t, base) {
  const root = tempDir('mstore', t);
  const targetDir = path.join(root, 'models');
  const catalogPath = path.join(root, 'catalog.json');
  const realHttp = createHttpClient({ getConfig: () => ({}), getPassword: () => null });
  const downloads = [];
  const download = (input) => {
    downloads.push(input);
    return realHttp.downloadToFile({ ...input, allowedHosts: ['127.0.0.1'], allowInsecureLoopback: true });
  };

  const catalog = [
    { id: 'm-good', name: 'İyi Model', sizeBytes: GOOD.length, sha256: sha(GOOD), url: `${base}/good.bin`, license: 'MIT', runtime: null },
    { id: 'm-good2', name: 'İkinci Model', sizeBytes: GOOD2.length, sha256: sha(GOOD2), url: `${base}/good2.bin`, license: 'MIT', runtime: null },
    { id: 'm-bad', name: 'Bozuk Hash', sizeBytes: GOOD2.length, sha256: sha(GOOD), url: `${base}/bad.bin`, license: 'MIT', runtime: null },
    { id: 'm-huge', name: 'Dev Model', sizeBytes: 1e15, sha256: sha(GOOD), url: `${base}/good.bin`, license: 'MIT', runtime: null }
  ];
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

  const store = createModelsStore({ baseDir: root, catalogPath, download });
  return { root, targetDir, catalogPath, store, downloads, download };
}

function makeEmptyStore(t) {
  const root = tempDir('mstore-empty', t);
  const realHttp = createHttpClient({ getConfig: () => ({}), getPassword: () => null });
  return createModelsStore({
    baseDir: root,
    catalogPath: path.join(root, 'yok.json'),
    download: (input) => realHttp.downloadToFile({ ...input, allowedHosts: ['127.0.0.1'], allowInsecureLoopback: true })
  });
}

async function waitFor(fn, timeoutMs = 10000) {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor zaman aşımı');
    await new Promise((r) => setTimeout(r, 25));
  }
}

function jobOf(store, jobId) {
  return store.list().jobs.find((job) => job.id === jobId) || null;
}

/* ------------------------------------------------------------- katalog */

test('tur11/models-store 1: katalog yok → boş liste + catalogError, patlamaz', (t) => {
  const store = makeEmptyStore(t);
  const data = store.list();
  assert.deepEqual(data.models, []);
  assert.equal(data.catalogError, 'E_NOT_FOUND');
  assert.equal(data.runtime.kind, 'none');
  assert.ok(Array.isArray(data.roots) && data.roots.length >= 1);
});

test('tur11/models-store 2: bilinmeyen modelID → E_NOT_FOUND', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const res = store.install({ modelID: 'yok-boyle', targetDir, confirmed: true });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_NOT_FOUND');
});

test('tur11/models-store 3: sistem klasörü → E_FORBIDDEN', async (t) => {
  const base = await startFixtureServer(t);
  const { store } = makeStores(t, base);
  const res = store.install({
    modelID: 'm-good',
    targetDir: path.join('C:\\Windows', 'kv-t104-models'),
    confirmed: true
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_FORBIDDEN');
});

test('tur11/models-store 4: onay yok → E_CONFIRM_REQUIRED', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const res = store.install({ modelID: 'm-good', targetDir });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_CONFIRM_REQUIRED');
});

test('tur11/models-store 5: boş alan yetersiz → E_DISK_FULL', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const res = store.install({ modelID: 'm-huge', targetDir, confirmed: true });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_DISK_FULL');
});

/* ------------------------------------------------------------- indirme */

test('tur11/models-store 6: başarılı indirme → ready, .part yok, ilerleme artan', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const packets = [];
  const off = store.onProgress((packet) => packets.push(packet));
  t.after(off);

  const started = store.install({ modelID: 'm-good', targetDir, confirmed: true });
  assert.equal(started.ok, true);
  assert.equal(started.data.state, 'queued');

  const job = await waitFor(() => {
    const found = jobOf(store, started.data.jobId);
    return found && (found.state === 'ready' || found.state === 'failed') ? found : null;
  });
  assert.equal(job.state, 'ready');
  assert.equal(job.error, null);

  const finalPath = path.join(targetDir, 'm-good');
  const partPath = `${finalPath}.part`;
  assert.ok(fs.existsSync(finalPath), 'nihai dosya yok');
  assert.equal(fs.existsSync(partPath), false, '.part kaldı');
  assert.equal(fs.statSync(finalPath).size, GOOD.length);

  const downloading = packets.filter((p) => p.state === 'downloading' && p.receivedBytes > 0);
  assert.ok(downloading.length >= 2, `ilerleme paketi az: ${downloading.length}`);
  assert.ok(downloading[downloading.length - 1].percent >= downloading[0].percent, 'percent azaldı');
  assert.ok(packets.every((p) => p.type === 'model.progress'));
  assert.equal(typeof packets[0].etaSec, 'object', 'etaSec erken örnekte null olmalı');
});

test('tur11/models-store 7: hash uyuşmazlığı → failed, .part KORUNUR', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const started = store.install({ modelID: 'm-bad', targetDir, confirmed: true });
  const job = await waitFor(() => {
    const found = jobOf(store, started.data.jobId);
    return found && (found.state === 'ready' || found.state === 'failed') ? found : null;
  });
  assert.equal(job.state, 'failed');
  assert.equal(job.error, 'E_HASH_MISMATCH');
  assert.equal(fs.existsSync(path.join(targetDir, 'm-bad')), false);
  assert.ok(fs.existsSync(path.join(targetDir, 'm-bad.part')), '.part korunmadı');
});

test('tur11/models-store 8: cancel → paused, .part var, receivedBytes > 0', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const started = store.install({ modelID: 'm-good2', targetDir, confirmed: true });

  await waitFor(() => {
    const job = jobOf(store, started.data.jobId);
    return job && job.receivedBytes > 0 ? job : null;
  });

  const cancelled = store.cancel({ jobId: started.data.jobId, confirmed: true });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.data.state, 'cancelled');
  assert.ok(cancelled.data.receivedBytes > 0);

  const job = await waitFor(() => {
    const found = jobOf(store, started.data.jobId);
    return found && found.state === 'paused' ? found : null;
  });
  assert.equal(job.state, 'paused');
  const partPath = path.join(targetDir, 'm-good2.part');
  assert.ok(fs.existsSync(partPath), '.part silindi');
  assert.ok(fs.statSync(partPath).size > 0, '.part boş');
});

test('tur11/models-store 9: iptal sonrası yeniden install resumeFrom > 0 geçer', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir, downloads } = makeStores(t, base);
  const first = store.install({ modelID: 'm-good2', targetDir, confirmed: true });
  await waitFor(() => {
    const job = jobOf(store, first.data.jobId);
    return job && job.receivedBytes > 0 ? job : null;
  });
  store.cancel({ jobId: first.data.jobId, confirmed: true });
  await waitFor(() => {
    const job = jobOf(store, first.data.jobId);
    return job && job.state === 'paused' ? job : null;
  });

  const second = store.install({ modelID: 'm-good2', targetDir, confirmed: true });
  assert.equal(second.ok, true);
  const job = await waitFor(() => {
    const found = jobOf(store, second.data.jobId);
    return found && (found.state === 'ready' || found.state === 'failed') ? found : null;
  });
  assert.equal(job.state, 'ready');

  const resumes = downloads.map((input) => input.resumeFrom || 0);
  assert.ok(resumes.some((value) => value > 0), `resumeFrom hiç > 0 olmadı: ${JSON.stringify(resumes)}`);
  assert.equal(fs.existsSync(path.join(targetDir, 'm-good2')), true);
});

/* ------------------------------------------------------------- verify */

test('tur11/models-store 10: verify doğru dosyada true, bozuk dosyada false', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const started = store.install({ modelID: 'm-good', targetDir, confirmed: true });
  await waitFor(() => {
    const job = jobOf(store, started.data.jobId);
    return job && job.state === 'ready' ? job : null;
  });

  const good = await store.verify({ modelID: 'm-good' });
  assert.equal(good.ok, true);
  assert.equal(good.data.verified, true);
  assert.equal(good.data.sha256, sha(GOOD));
  assert.ok(good.data.sizeBytes > 0);
  assert.ok(Number.isFinite(good.data.elapsedMs));

  fs.writeFileSync(path.join(targetDir, 'm-good'), Buffer.from('bozuk-icerik'), 'utf8');
  const bad = await store.verify({ modelID: 'm-good' });
  assert.equal(bad.ok, true);
  assert.equal(bad.data.verified, false);
  assert.notEqual(bad.data.sha256, sha(GOOD));
});

/* ------------------------------------------------------------- remove */

test('tur11/models-store 11: remove → dosya gider, freedBytes > 0; ikinci kez E_NOT_FOUND', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);
  const started = store.install({ modelID: 'm-good', targetDir, confirmed: true });
  await waitFor(() => {
    const job = jobOf(store, started.data.jobId);
    return job && job.state === 'ready' ? job : null;
  });

  const removed = store.remove({ modelID: 'm-good', confirmed: true });
  assert.equal(removed.ok, true);
  assert.equal(removed.data.removed, true);
  assert.ok(removed.data.freedBytes > 0);
  assert.equal(fs.existsSync(path.join(targetDir, 'm-good')), false);

  const again = store.remove({ modelID: 'm-good', confirmed: true });
  assert.equal(again.ok, false);
  assert.equal(again.error.code, 'E_NOT_FOUND');
});

test('tur11/models-store 12: remove targetDir dışı kayıt → E_FORBIDDEN (path traversal)', async (t) => {
  const base = await startFixtureServer(t);
  const { root, targetDir } = makeStores(t, base);
  const realHttp = createHttpClient({ getConfig: () => ({}), getPassword: () => null });
  const store = createModelsStore({
    baseDir: root,
    catalogPath: path.join(root, 'catalog.json'),
    download: (input) => realHttp.downloadToFile({ ...input, allowedHosts: ['127.0.0.1'], allowInsecureLoopback: true })
  });

  const started = store.install({ modelID: 'm-good', targetDir, confirmed: true });
  await waitFor(() => {
    const job = jobOf(store, started.data.jobId);
    return job && job.state === 'ready' ? job : null;
  });

  /* Dışarıda bir dosya + durum kaydını dışarı yönlendir (kurcalanmış disk). */
  const outside = path.join(root, 'disarida.bin');
  fs.writeFileSync(outside, 'x', 'utf8');
  const statePath = path.join(root, 'models-state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.models['m-good'].finalPath = outside;
  fs.writeFileSync(statePath, JSON.stringify(state), 'utf8');

  const tampered = createModelsStore({
    baseDir: root,
    catalogPath: path.join(root, 'catalog.json'),
    download: (input) => realHttp.downloadToFile({ ...input, allowedHosts: ['127.0.0.1'], allowInsecureLoopback: true })
  });
  const res = tampered.remove({ modelID: 'm-good', confirmed: true });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_FORBIDDEN');
  assert.ok(fs.existsSync(outside), 'dış dosya silindi');
});

/* ------------------------------------------------------------- kuyruk */

test('tur11/models-store 13: iki eşzamanlı install → ikincisi queued, sırayla biter', async (t) => {
  const base = await startFixtureServer(t);
  const { store, targetDir } = makeStores(t, base);

  const first = store.install({ modelID: 'm-good', targetDir, confirmed: true });
  const second = store.install({ modelID: 'm-good2', targetDir, confirmed: true });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);

  const secondJob = jobOf(store, second.data.jobId);
  assert.equal(secondJob.state, 'queued');

  const firstDone = await waitFor(() => {
    const job = jobOf(store, first.data.jobId);
    return job && job.state === 'ready' ? job : null;
  });
  assert.equal(firstDone.state, 'ready');

  const secondDone = await waitFor(() => {
    const job = jobOf(store, second.data.jobId);
    return job && job.state === 'ready' ? job : null;
  });
  assert.equal(secondDone.state, 'ready');
  assert.ok(fs.existsSync(path.join(targetDir, 'm-good')));
  assert.ok(fs.existsSync(path.join(targetDir, 'm-good2')));
});

test('tur11/models-store 14: göreli targetDir → E_FORBIDDEN', async (t) => {
  const base = await startFixtureServer(t);
  const { store } = makeStores(t, base);
  const res = store.install({ modelID: 'm-good', targetDir: 'goreli/klasor', confirmed: true });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_FORBIDDEN');
});
