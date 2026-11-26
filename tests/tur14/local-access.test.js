'use strict';

/*
 * T-167 — Yerel erişim izni.
 *
 * Ürün hedefi: "PC içinde bir izin sorusu; o izinden sonra yerel olarak çoğu
 * şeye erişebilsin." Bu test o sözleşmeyi kilitler:
 *   1) İzin varsayılan KAPALI; onay olmadan makinenin dışına çıkılamaz.
 *   2) İzin açıkken proje kökü DIŞINDAKİ mutlak yol listelenir/okunur.
 *   3) İzin açık olsa bile sır dosyası okunmaz.
 *   4) İzin kapatılınca dışarı erişim yeniden reddedilir (geri alınabilir).
 *   5) Listeleme sürücüleri ve ev klasörünü bildirir (gezinme için).
 *   6) Ekran bu izni soran ve gösteren denetimleri içerir.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const { createFilesService } = require(path.join(SRC, 'main', 'services', 'files.js'));
const { createSettings, DEFAULT_CONFIG } = require(path.join(SRC, 'main', 'services', 'settings.js'));

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `kv-local-${label}-`));
}

/** İzni testten yönetilebilen dosya servisi. */
function makeFiles(projectDir, { access = false } = {}) {
  const state = { access };
  const service = createFilesService({
    getProjectDir: () => projectDir,
    getLocalAccess: () => state.access
  });
  return { service, state };
}

test('local 1: izin varsayılan kapalı ve config sır içermez', () => {
  assert.strictEqual(DEFAULT_CONFIG.localAccess, false, 'izin varsayılan kapalı olmalı');
  assert.strictEqual(DEFAULT_CONFIG.localAccessAsked, false);

  const base = tempDir('cfg');
  try {
    const s = createSettings({ baseDir: base, safeStorage: null, envPassword: () => undefined });
    const cfg = s.get();
    assert.ok(cfg.ok);
    assert.strictEqual(cfg.data.localAccess, false);
    assert.strictEqual(cfg.data.localAccessAsked, false);

    const wrote = s.set({ localAccess: true, localAccessAsked: true });
    assert.ok(wrote.ok, JSON.stringify(wrote.error));
    assert.strictEqual(s.get().data.localAccess, true);
    assert.strictEqual(s.get().data.localAccessAsked, true);

    const raw = read(path.join(base, 'config.json'));
    assert.ok(!/password|token|secret/i.test(raw), 'config.json ayar dışı sır taşımamalı');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('local 2: izin kapalıyken proje kökü dışı reddedilir', () => {
  const project = tempDir('proj-off');
  const outside = tempDir('outside-off');
  try {
    fs.writeFileSync(path.join(outside, 'gizli.txt'), 'merhaba', 'utf8');
    const { service } = makeFiles(project, { access: false });

    const listed = service.list({ path: outside });
    assert.strictEqual(listed.ok, false, 'kök dışı listelenmemeli');
    assert.strictEqual(listed.error.code, 'E_FORBIDDEN');

    const readRes = service.read({ path: path.join(outside, 'gizli.txt') });
    assert.strictEqual(readRes.ok, false);
    assert.strictEqual(readRes.error.code, 'E_FORBIDDEN');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('local 3: izin açıkken kök dışı mutlak yol okunur ve listelenir', () => {
  const project = tempDir('proj-on');
  const outside = tempDir('outside-on');
  try {
    fs.writeFileSync(path.join(outside, 'not.txt'), 'yerel erişim', 'utf8');
    const { service } = makeFiles(project, { access: true });

    const listed = service.list({ path: outside });
    assert.ok(listed.ok, JSON.stringify(listed.error));
    assert.strictEqual(listed.data.localAccess, true);
    assert.ok(listed.data.entries.some((e) => e.name === 'not.txt'), 'dış dosya listede yok');
    assert.strictEqual(listed.data.parent, path.dirname(outside), 'üst klasöre çıkılabilmeli');
    if (process.platform === 'win32') {
      assert.ok(Array.isArray(listed.data.drives) && listed.data.drives.length > 0, 'sürücüler bildirilmeli');
    }
    assert.ok(listed.data.home, 'ev klasörü bildirilmeli');

    const readRes = service.read({ path: path.join(outside, 'not.txt') });
    assert.ok(readRes.ok, JSON.stringify(readRes.error));
    assert.strictEqual(readRes.data.text, 'yerel erişim');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('local 4: izin açıkken bile sır dosyası okunmaz', () => {
  const project = tempDir('proj-secret');
  const outside = tempDir('outside-secret');
  try {
    for (const name of ['.env', 'secrets.bin', 'keys.bin', 'id_rsa', 'server.pem']) {
      fs.writeFileSync(path.join(outside, name), 'SIR-OLMAMALI', 'utf8');
    }
    const { service } = makeFiles(project, { access: true });
    for (const name of ['.env', 'secrets.bin', 'keys.bin', 'id_rsa', 'server.pem']) {
      const res = service.read({ path: path.join(outside, name) });
      assert.strictEqual(res.ok, false, `${name} okunmamalı`);
      assert.strictEqual(res.error.code, 'E_FORBIDDEN', `${name} için E_FORBIDDEN bekleniyordu`);
    }
    const listed = service.list({ path: outside });
    assert.ok(listed.ok);
    const names = listed.data.entries.map((e) => e.name);
    assert.ok(!names.includes('.env'), '.env listede görünmemeli');
    assert.ok(!names.includes('server.pem'), '*.pem listede görünmemeli');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('local 5: izin kapatılınca dışarı erişim yeniden reddedilir', () => {
  const project = tempDir('proj-revoke');
  const outside = tempDir('outside-revoke');
  try {
    fs.writeFileSync(path.join(outside, 'x.txt'), 'x', 'utf8');
    const { service, state } = makeFiles(project, { access: true });
    assert.ok(service.list({ path: outside }).ok);

    state.access = false;
    const after = service.list({ path: outside });
    assert.strictEqual(after.ok, false, 'izin kapatılınca erişim sürmemeli');
    assert.strictEqual(after.error.code, 'E_FORBIDDEN');
    /* Proje kökü hâlâ çalışır: izin kapatmak ürünü bozmaz. */
    assert.ok(service.list({ path: '' }).ok, 'proje kökü izinsiz de çalışmalı');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('local 6: arayüz izni sorar, durumu gösterir ve geri alır', () => {
  const html = read(path.join(RENDERER, 'index.html'));
  for (const needle of ['data-settings-section="local"', 'data-action="local-ask"', 'data-action="local-revoke"', 'data-field="local-access"', 'data-field="local-state"']) {
    assert.ok(html.includes(needle), `ayar ekranında eksik: ${needle}`);
  }
  const app = read(path.join(RENDERER, 'app.js'));
  assert.match(app, /function openLocalAccessAsk/, 'izin sorusu diyaloğu yok');
  assert.match(app, /local-grant/, 'izin ver eylemi yok');
  assert.match(app, /function renderLocalAccess/, 'izin durumu çizilmiyor');
  /* İzin kapalıyken Dosyalar ekranı yalnız proje kökünü gezmeli (metin sözleşmesi). */
  const filesJs = read(path.join(SRC, 'main', 'services', 'files.js'));
  assert.match(filesJs, /getLocalAccess/, 'dosya servisi izni sormuyor');
  assert.match(filesJs, /drives\(\)/, 'sürücü listesi yok');
});

test('local 7: gezinme kısayolları yalnız izin açıkken çizilir', () => {
  const tur8 = read(path.join(RENDERER, 'tur8.js'));
  assert.match(tur8, /data\.localAccess/, 'Dosyalar ekranı izni dikkate almıyor');
  assert.match(tur8, /data\.drives/, 'sürücü kısayolları çizilmiyor');
  assert.match(tur8, /tur8FilesLocalAccessChanged/, 'izin değişince ekran tazelenmiyor');
});
