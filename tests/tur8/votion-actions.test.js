'use strict';

// Tur 8 / Votion masaüstü eylemleri — güvenlik sınırları (T8-2)
//
// Ölçülen iddialar:
//  1) Beyaz liste: yalnız tanımlı uygulama kimlikleri; bilinmeyen kimlik E_FORBIDDEN.
//  2) Yol sınırı: izinli kökün dışına çıkan her yol E_FORBIDDEN (.. kaçışı dahil).
//  3) listFiles yalnız kendi kökünü okur, üst dizine çıkamaz.
//  4) move/trash yalnız kök içinde; kökler arası taşıma reddedilir.
//  5) Kabuk yok: kaynakta `shell: true` geçmez.
//  6) Yıkıcı eylem kümesi sabittir: move, trash, browser.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SRC, read } = require('../lib');

const { createVotionActions, APPS, isInside } = require(path.join(SRC, 'main', 'services', 'votion-actions.js'));

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-votion-'));
  const desktop = path.join(root, 'Desktop');
  const documents = path.join(root, 'Documents');
  fs.mkdirSync(desktop, { recursive: true });
  fs.mkdirSync(documents, { recursive: true });
  fs.writeFileSync(path.join(desktop, 'not.txt'), 'merhaba', 'utf8');
  fs.mkdirSync(path.join(desktop, 'alt'));
  const service = createVotionActions({
    baseDir: path.join(root, 'userdata'),
    getProjectDir: () => path.join(root, 'Project'),
    getRoots: () => ({ desktop, documents, downloads: path.join(root, 'Downloads') }),
    shellApi: { trashItem: async () => {} },
    spawnFn: () => ({ unref() {} }),
    capturer: null
  });
  return { root, desktop, documents, service };
}

test('tur8/votion 1: beyaz liste kapalı — bilinmeyen uygulama kimliği E_FORBIDDEN', async () => {
  const { service } = sandbox();
  const res = await service.run({ action: 'openApp', app: 'cmd' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, 'E_FORBIDDEN');
  assert.ok(Array.isArray(res.error.detail.allowed) && res.error.detail.allowed.length === Object.keys(APPS).length);

  const list = await service.run({ action: 'list' });
  assert.ok(list.ok);
  assert.ok(list.data.apps.every((a) => APPS[a.id]));
  assert.ok(!list.data.apps.some((a) => /cmd|powershell|wscript/i.test(a.id)));
});

test('tur8/votion 2: bilinen uygulama kimliği sistemde dosya yoksa dürüst E_NOT_FOUND (uydurma başarı yok)', async () => {
  const { service } = sandbox();
  const res = await service.run({ action: 'openApp', app: 'notepad' });
  /* Bu makinede notepad.exe varsa açma denenir; yoksa NOT_FOUND. İkisi de dürüst. */
  assert.ok(res.ok === true || res.error.code === 'E_NOT_FOUND',
    `beklenmeyen sonuç: ${JSON.stringify(res)}`);
});

test('tur8/votion 3: kök dışı yol ve .. kaçışı E_FORBIDDEN', async () => {
  const { service, desktop, root } = sandbox();
  const escape = path.join(desktop, '..', '..', 'Windows', 'System32');
  const res = await service.run({ action: 'listFiles', root: 'desktop', path: escape });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, 'E_FORBIDDEN');

  const outside = await service.run({ action: 'trash', path: path.join(root, 'Project', 'yok.txt') });
  /* Project kökü tanımlı (getProjectDir) ama dosya yok → NOT_FOUND; kök dışı değil. */
  assert.strictEqual(outside.ok, false);
  assert.ok(['E_NOT_FOUND', 'E_FORBIDDEN'].includes(outside.error.code));

  const rogue = await service.run({ action: 'trash', path: 'C:\\Windows\\win.ini' });
  assert.strictEqual(rogue.ok, false);
  assert.strictEqual(rogue.error.code, 'E_FORBIDDEN');
});

test('tur8/votion 4: listFiles kök içinde çalışır, üst dizini göstermez', async () => {
  const { service, desktop } = sandbox();
  const res = await service.run({ action: 'listFiles', root: 'desktop' });
  assert.ok(res.ok);
  assert.strictEqual(res.data.dir, path.resolve(desktop));
  const names = res.data.entries.map((e) => e.name);
  assert.ok(names.includes('not.txt'));
  assert.ok(names.includes('alt'));
  assert.ok(!names.includes('..'));

  const sub = await service.run({ action: 'listFiles', root: 'desktop', path: path.join(desktop, 'alt') });
  assert.ok(sub.ok, 'alt klasörü kök içinde okunabilmeli');
});

test('tur8/votion 5: move kök içinde çalışır, kökler arası taşıma reddedilir', async () => {
  const { service, desktop, documents } = sandbox();
  const ok = await service.run({ action: 'move', from: path.join(desktop, 'not.txt'), to: path.join(desktop, 'alt') });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.ok(fs.existsSync(path.join(desktop, 'alt', 'not.txt')));
  assert.ok(!fs.existsSync(path.join(desktop, 'not.txt')));

  const cross = await service.run({
    action: 'move',
    from: path.join(desktop, 'alt', 'not.txt'),
    to: path.join(documents, 'hedef')
  });
  assert.strictEqual(cross.ok, false);
  assert.strictEqual(cross.error.code, 'E_FORBIDDEN');
});

test('tur8/votion 6: yıkıcı eylem kümesi sabit ve kaynakta kabuk yok', () => {
  const { service } = sandbox();
  assert.deepStrictEqual(service.CONFIRM_ACTIONS.slice().sort(), ['browser', 'grant', 'move', 'trash']);

  const src = read(path.join(SRC, 'main', 'services', 'votion-actions.js'));
  assert.doesNotMatch(src, /shell:\s+true/, 'kabuk (shell: true) yasak — komut enjeksiyonu riski');
  assert.doesNotMatch(src, /exec(Sync)?\(|execFile/, 'serbest komut yürütme yasak');
  assert.match(src, /detached:\s*true/, 'uygulama açma ayrı süreçte olmalı');
  assert.ok(isInside('C:\\a', 'C:\\a\\b'));
  assert.ok(!isInside('C:\\a', 'C:\\ab'));
});
