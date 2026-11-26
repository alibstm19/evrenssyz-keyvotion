'use strict';

/* T-153 — ilk-kurulum akışı sözleşme testleri.
 * settings.onboarded bayrağının temiz userData'da false, kaydedilince kalıcı
 * olduğunu; renderer'ın karşılama panelini, şifreli alanı ve yardım erişimini
 * kanıtlar. Yeni IPC kanalı açılmadığı da burada denetlenir. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const { createSettings, DEFAULT_CONFIG } = require(path.join(ROOT, 'src', 'main', 'services', 'settings.js'));
const html = read(path.join(RENDERER, 'index.html'));
const appJs = read(path.join(RENDERER, 'app.js'));
const channels = require(path.join(ROOT, 'src', 'shared', 'ipc-channels.js'));

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kv-t153-'));
}

test('onboarding 1: temiz ayarlar onboarded:false döndürür', () => {
  assert.strictEqual(DEFAULT_CONFIG.onboarded, false, 'varsayılan onboarded false olmalı');
  const dir = tempDir();
  try {
    const s = createSettings({ baseDir: dir, safeStorage: null, envPassword: () => undefined });
    const res = s.get();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.data.onboarded, false, 'yeni userData ilk kuruluma açık olmalı');
    assert.strictEqual(typeof res.data.onboarded, 'boolean', 'onboarded boolean olmalı');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('onboarding 2: onboarded:true kalıcıdır, yeniden okununca true gelir', () => {
  const dir = tempDir();
  try {
    const a = createSettings({ baseDir: dir, safeStorage: null, envPassword: () => undefined });
    assert.strictEqual(a.set({ onboarded: true }).data.onboarded, true);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
    assert.strictEqual(cfg.onboarded, true, 'config.json onboarded:true yazılmalı');

    const b = createSettings({ baseDir: dir, safeStorage: null, envPassword: () => undefined });
    assert.strictEqual(b.get().data.onboarded, true, 'yeni servis bayrağı okumalı');
    assert.strictEqual(b.set({ onboarded: false }).data.onboarded, false, 'false da geri yazılabilmeli');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("onboarding 3: boolean olmayan değer false'a normalize edilir", () => {
  assert.strictEqual(Object.isFrozen(DEFAULT_CONFIG), true);
  const dir = tempDir();
  try {
    const s = createSettings({ baseDir: dir, safeStorage: null, envPassword: () => undefined });
    const res = s.set({ onboarded: 'evet' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.data.onboarded, false, 'metin değer kabul edilmemeli');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('onboarding 4: karşılama paneli htmlde var, yeni ekran değil', () => {
  assert.match(html, /data-onboard/, 'karşılama paneli kökü yok');
  assert.match(html, /data-onboard hidden/, 'panel ilk hali gizli olmalı (JS açacak)');
  assert.match(html, /Keyvotion Console'a hoş geldin — 3 adım/, 'başlık birebir olmalı');
  assert.match(html, /data-field="onboard-status"/, 'Türkçe hata alanı yok');
  assert.match(html, /data-field="onboard-title"/, 'panel başlığı alanı yok');
  assert.strictEqual((html.match(/data-screen="onboard|data-screen="welcome|data-screen="first/g) || []).length, 0,
    'yeni ekran eklenmemeli');
});

test('onboarding 5: API anahtarı yalnız şifre alanında ve tek yön keyAdd\'a gider', () => {
  assert.match(appJs, /type: 'password'/, 'API anahtar alanı type=password olmalı');
  assert.match(appJs, /data-field': 'onboard-key'/, 'onboarding anahtar alanı yok');
  assert.match(appJs, /KV\.provider && KV\.provider\.addKey/, 'keyAdd çağrısı yok');
  assert.match(appJs, /KV\.provider && KV\.provider\.test, \{ providerId, path: '\/models' \}/,
    'test yalnız providerId almalı');
  const ensure = appJs.slice(appJs.indexOf('async function onboardEnsureKey'), appJs.indexOf('function onboardInput'));
  assert.match(ensure, /provider\.addKey/, 'anahtar keyAdd dışına çıkmamalı');
  assert.doesNotMatch(ensure, /provider\.test/, 'test ham anahtarı görmemeli');
  assert.match(appJs, /anahtar nereden alınır/i, 'anahtar kılavuzu yok');
});

test('onboarding 6: yardım düğmesi guide bölümüne bağlanır', () => {
  assert.match(html, /data-action="screen-help"/, 'başlıkta ? düğmesi yok');
  assert.match(html, /data-guide-link=/, 'data-guide-link yok');
  assert.match(html, /data-guide-help hidden/, 'guide içi yardım bölümü yok');
  assert.match(appJs, /function screenHelp\(\)/, 'yardım yönlendirmesi yok');
  assert.match(appJs, /dataset\.guideLink = screen/, 'her ekran kendi yardımına bağlanmıyor');
});

test('onboarding 7: yeni IPC kanalı yok, sözleşme 111 sabit', () => {
  const names = Object.keys(channels.CHANNELS || channels.channels || channels);
  assert.strictEqual(names.length, 111, 'kanal sayısı değişmemeli');
  assert.strictEqual(names.some((n) => /onboard|welcome|first.?run/i.test(n)), false,
    'ilk kurulum için yeni kanal açılmamalı');
});
