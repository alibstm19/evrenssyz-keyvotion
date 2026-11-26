'use strict';

/*
 * T-157 — yerel OpenCode sunucusu yöneticisi (src/main/services/server-manager.js)
 * GERÇEK testleri.
 *
 * Ağ YOK: test kendi net dinleyicisini 127.0.0.1 üzerinde rastgele portta açar,
 * servis yalnız o portu ölçer. Gerçek confirm.js onay deposu ve gerçek
 * http-client yerine enjekte edilen sahte yanıt kullanılır (servis enjeksiyona
 * göre tasarlanmıştır).
 *
 * Kapsam: kapalı/açık port ölçümü, neden + çözüm metni, confirmToken kapısı,
 * parola sızıntısı, başlatma hatası yolu, yabancı sürece dokunmama.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

const { SRC, read } = require('../lib');
const { createServerManager } = require(path.join(SRC, 'main', 'services', 'server-manager.js'));
const { createConfirmStore } = require(path.join(SRC, 'main', 'services', 'confirm.js'));

const PASSWORD = 'TEST_PAROLA_DUZ_METIN_123';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/**
 * Servis + geçici kök. `open` true ise portu dinleyen sahte sunucu açılır.
 * httpClient.info() enjekte edilir (gerçek ağ yok).
 */
async function harness(t, { open = false, password = PASSWORD, info = null, opencodeBin = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-t157-sm-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const port = await freePort();
  let listener = null;
  if (open) {
    listener = net.createServer((socket) => socket.end());
    await new Promise((resolve) => listener.listen(port, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => listener.close(resolve)));
  }

  let stored = password;
  const settings = {
    connection: () => ({ serverURL: `http://127.0.0.1:${port}` }),
    getPassword: () => stored,
    setPassword: (value) => { stored = value; }
  };

  const audited = [];
  const httpClient = {
    info: () => Promise.resolve(info || { ok: true, data: { version: 'test-version' } })
  };

  const mgr = createServerManager({
    baseDir: dir,
    httpClient,
    settings,
    audit: { append: (entry) => audited.push(entry) },
    opencodeBin
  });

  return { mgr, dir, port, audited, settings, storedPassword: () => stored };
}

/* 1) Kapalı port ---------------------------------------------------------- */
test('server/sm 1: port kapaliyken durum kapali ve neden + cozum metni doner', async (t) => {
  const { mgr } = await harness(t, { open: false });

  const res = await mgr.status({ probe: true });
  assert.equal(res.ok, true);
  const d = res.data;
  assert.equal(d.mode, 'stopped');
  assert.equal(d.running, false);
  assert.equal(d.connected, false);
  assert.equal(d.error, 'E_OFFLINE');
  assert.equal(d.canStart, false, 'opencodeBin yokken canStart false olmalı');

  /* Kullanıcı "neden kapalı + nasıl düzeltirim" görmeli. */
  assert.equal(typeof d.hint, 'string',
    'port kapalıyken data.hint yok: yalnız E_OFFLINE kodu dönüyor, kullanıcıya neden/nasıl düzeltilir metni verilmiyor');
  assert.ok(String(d.hint || '').length > 20, 'data.hint çok kısa (neden + çözüm bekleniyor)');
});

/* 2) Açık port ------------------------------------------------------------ */
test('server/sm 2: port acikken durum acik (external) ve /api/info okunur', async (t) => {
  const { mgr } = await harness(t, { open: true });

  const res = await mgr.status({ probe: true });
  assert.equal(res.ok, true);
  const d = res.data;
  assert.equal(d.running, true);
  assert.equal(d.mode, 'external', 'bizim süreç değil → external');
  assert.equal(d.connected, true);
  assert.equal(d.version, 'test-version');
  assert.equal(typeof d.latencyMs, 'number');
  assert.equal(d.error, null);
  assert.equal(d.hasPassword, true);
});

test('server/sm 2b: port acik ama parola yoksa E_SECRET_MISSING + cozum metni', async (t) => {
  const { mgr } = await harness(t, { open: true, password: null });

  const res = await mgr.status({ probe: true });
  const d = res.data;
  assert.equal(d.running, true);
  assert.equal(d.connected, false);
  assert.equal(d.error, 'E_SECRET_MISSING');
  assert.equal(typeof d.hint, 'string');
  assert.ok(d.hint.length > 20, 'parola eksikliğinde çözüm metni yok');
});

/* 3) confirmToken kapısı -------------------------------------------------- */
test('server/sm 3: confirmToken yoksa/gecersizse baslatma reddedilir', async (t) => {
  const { mgr } = await harness(t, { open: false });
  const confirm = createConfirmStore();

  /* main.js SERVER_START handler'ı start()'ten ÖNCE onay doğrular. */
  const mainSrc = read(path.join(SRC, 'main', 'main.js'));
  assert.match(mainSrc, /CHANNELS\.SERVER_START[\s\S]{0,200}confirm\.verify\(payload\.confirmToken, CHANNELS\.SERVER_START\)/,
    'SERVER_START handler onay doğrulaması yapmıyor');
  assert.match(mainSrc, /confirm\.verify\(payload\.confirmToken, CHANNELS\.SERVER_STOP\)/,
    'SERVER_STOP handler onay doğrulaması yapmıyor');

  /* Anahtar yok → E_CONFIRM_REQUIRED, start ÇAĞRILMAZ. */
  const denied = confirm.verify(undefined, 'kv:server:start');
  assert.ok(denied && denied.ok === false);
  assert.equal(denied.error.code, 'E_CONFIRM_REQUIRED');

  /* Biçimi bozuk anahtar da reddedilir. */
  assert.equal(confirm.verify('kisa', 'kv:server:start').error.code, 'E_CONFIRM_REQUIRED');

  /* Geçerli anahtar bir kez geçer, tekrarı reddedilir (replay). */
  const valid = 'A'.repeat(24);
  assert.equal(confirm.verify(valid, 'kv:server:start'), null);
  assert.equal(confirm.verify(valid, 'kv:server:start').error.code, 'E_CONFIRM_REQUIRED');

  /* Kapı geçilse bile opencodeBin yokken servis başlatmaz (yanlış yeşil yok). */
  const started = await mgr.start();
  assert.equal(started.ok, false);
  assert.equal(started.error.code, 'E_NOT_FOUND');
});

/* 4) Parola sızıntısı ----------------------------------------------------- */
test('server/sm 4: parola yanitlarda ve diskte duz metin degil', async (t) => {
  const { mgr, dir, port } = await harness(t, { open: true });

  const outputs = [];
  outputs.push(await mgr.status({ probe: true }));
  outputs.push(await mgr.status());
  outputs.push(await mgr.stop());

  const serialized = JSON.stringify(outputs);
  assert.equal(serialized.includes(PASSWORD), false, 'servis yanıtı parolayı düz metin taşıyor');
  assert.equal(serialized.includes('"password"'), false, 'yanıtta password alanı var (yalnız hasPassword olmalı)');

  /* Servis hiç dosya yazmaz; geçici kök boş kalmalı. */
  assert.deepEqual(fs.readdirSync(dir), [], 'sunucu yöneticisi diske dosya yazdı');

  /* Kasada (DPAPI/settings) tutulan değer servis çıktısına sızmıyor. */
  const st = await mgr.status({ probe: true });
  assert.equal(st.data.hasPassword, true);
  assert.ok(!JSON.stringify(st).includes(PASSWORD));
  assert.equal(st.data.port, port);
});

/* 5) Başlatma hatası yolu ------------------------------------------------ */
test('server/sm 5: opencode yoksa E_NOT_FOUND + nasil duzeltilir ipucu', async (t) => {
  const { mgr } = await harness(t, { open: false, opencodeBin: null });

  const res = await mgr.start();
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_NOT_FOUND');
  assert.match(res.error.message, /opencode/);
  assert.ok(res.error.detail && typeof res.error.detail.hint === 'string');
  assert.ok(res.error.detail.hint.length > 10, 'başlatma hatasında çözüm ipucu yok');
});

/* 6) Yabancı sürece dokunmama -------------------------------------------- */
test('server/sm 6: bizim surec yokken stop yabanci sureci durdurmaz', async (t) => {
  const { mgr } = await harness(t, { open: true });

  const res = await mgr.stop();
  assert.equal(res.ok, true);
  assert.equal(res.data.stopped, false);
  assert.equal(res.data.running, true, 'yabancı süreç durdurulmamalı');
  assert.match(String(res.data.note || ''), /yabancı/i);
});
