'use strict';

/*
 * T-165 — kurulum taşınabilirliği.
 *
 * Ürün geliştiricinin makinesinde çalışırken başka bir bilgisayarda ilk açılışta
 * kırılabilir: varsayılan proje dizini sabit bir kullanıcı yoluysa pano, hafıza
 * ve proje yazımları var olmayan dizine gider (ENOENT). Bu test o sınıfı kilitler:
 *   1) Varsayılan yol ev dizininden türetilir, sabit makine yolu değildir.
 *   2) Temiz ayarlarda proje dizini ev dizini altındadır.
 *   3) projectDir ayarlanınca dizin oluşturulur; oluşturulamayan yol reddedilir.
 *   4) Boot, proje dizinini oluşturmayı dener (kaynak düzeyi sözleşme).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, SRC, read } = require('../lib');

const settingsModule = require(path.join(SRC, 'main', 'services', 'settings.js'));
const { createSettings, DEFAULT_CONFIG, DEFAULT_PROJECT_DIR } = settingsModule;
const mainJs = read(path.join(SRC, 'main', 'main.js'));

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
}

test('portable 1: varsayilan proje dizini sabit makine yolu degil', () => {
  assert.strictEqual(DEFAULT_PROJECT_DIR, path.join(os.homedir(), 'Keyvotion'),
    'varsayilan yol ev dizininden turetilmeli');
  assert.strictEqual(DEFAULT_CONFIG.projectDir, DEFAULT_PROJECT_DIR);

  /* Kaynakta gömülü mutlak kullanici yolu olmamali: baska makinede var olmaz. */
  const src = read(path.join(SRC, 'main', 'services', 'settings.js'));
  assert.ok(!/[A-Za-z]:\\\\Users\\\\/.test(src), 'settings.js icinde sabit Windows kullanici yolu var');
  assert.ok(!/'\/Users\/[a-z]/i.test(src), 'settings.js icinde sabit macOS kullanici yolu var');
  assert.match(src, /os\.homedir\(\)/, 'varsayilan yol os.homedir() ile turetilmeli');
});

test('portable 2: temiz ayarlarda proje dizini ev dizini altinda', () => {
  const dir = tempDir('portable');
  try {
    const s = createSettings({ baseDir: dir, safeStorage: null, envPassword: () => undefined });
    const cfg = s.get();
    assert.ok(cfg.ok, JSON.stringify(cfg.error));
    const projectDir = cfg.data.projectDir;
    assert.strictEqual(projectDir, DEFAULT_PROJECT_DIR);
    assert.strictEqual(path.dirname(projectDir), os.homedir(), 'proje dizini ev dizininin cocugu olmali');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('portable 3: projectDir ayarlaninca dizin olusturulur, olusturulamayan yol reddedilir', () => {
  const dir = tempDir('portable-set');
  try {
    const s = createSettings({ baseDir: dir, safeStorage: null, envPassword: () => undefined });

    const target = path.join(dir, 'yeni', 'proje', 'dizini');
    const res = s.set({ projectDir: target });
    assert.ok(res.ok, `ayar reddedildi: ${JSON.stringify(res.error)}`);
    assert.ok(fs.existsSync(target), 'proje dizini olusturulmadi');
    assert.ok(fs.statSync(target).isDirectory(), 'proje dizini klasor degil');

    /* Yazilamayan yol: Windows'ta '?' dosya adinda gecersizdir. */
    if (process.platform === 'win32') {
      const rejected = s.set({ projectDir: path.join(dir, 'gecersiz?dizin') });
      assert.strictEqual(rejected.ok, false, 'gecersiz yol kabul edildi');
      assert.strictEqual(rejected.error.code, 'E_BAD_REQUEST');
      assert.match(rejected.error.message, /oluşturulamadı/);
      assert.strictEqual(s.get().data.projectDir, target, 'reddedilen ayar eski degeri bozmamali');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('portable 4: acilista proje dizini olusturulur (sessizce yutulur)', () => {
  assert.match(mainJs, /fs\.mkdirSync\(getProjectDir\(\), \{ recursive: true \}\)/,
    'createRuntime proje dizinini olusturmuyor');
  const block = mainJs.slice(mainJs.indexOf('const getProjectDir'));
  const tryIdx = block.indexOf('fs.mkdirSync(getProjectDir()');
  assert.ok(tryIdx > 0 && tryIdx < 400, 'mkdir getProjectDir tanimindan hemen sonra gelmeli');
  assert.match(block.slice(tryIdx, tryIdx + 260), /catch \{/, 'olusturma hatasi uygulamayi dusurmemeli');
});
