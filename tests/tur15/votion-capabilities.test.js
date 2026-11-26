'use strict';

/*
 * T-198 — Votion yetkileri: oturum onayı + sınırlı komut + yedekli dosya yazma.
 *
 * Kullanıcı isteği: Votion "PC'de test yapan, uygulama açan, kod değiştiren" bir
 * asistan olmalı — izin dahilinde. Seçilen model: OTURUM ONAYI (bir kez onayla,
 * uygulama kapanınca biter).
 *
 * Bu test kilidi:
 *   1) Yetki yokken komut ve dosya yazma REDDEDİLİR (`needsGrant`).
 *   2) Onaydan sonra çalışır; kaldırınca yeniden reddedilir.
 *   3) Kabuk yok: yalnız beyaz liste; serbest komut E_FORBIDDEN.
 *   4) Proje dışı cwd/dosya yolu reddedilir.
 *   5) Dosya yazma YEDEK bırakır; .env ve .git/node_modules korumalı.
 *   6) find/replace çok eşleşmede `all` ister.
 *   7) Yetki diskte kalıcı değildir: yeni defter = kapalı.
 *   8) Kanal sözleşmesi büyümez (VOTION_ACT yeniden kullanılır).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ROOT, SRC, read } = require('../lib');
const { CODES } = require(path.join(SRC, 'shared', 'errors.js'));

const SERVICES = path.join(SRC, 'main', 'services');
const { createVotionGrants } = require(path.join(SERVICES, 'votion-grants.js'));
const { createVotionExec } = require(path.join(SERVICES, 'votion-exec.js'));
const { createVotionActions } = require(path.join(SERVICES, 'votion-actions.js'));

const CHANNELS = require(path.join(SRC, 'shared', 'ipc-channels.js'));

/** Sahte süreç: verilen çıktı ve çıkış kodu ile biter. */
function fakeSpawn(script) {
  const calls = [];
  const fn = (file, args, options) => {
    calls.push({ file, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => { child.killed = true; };
    setImmediate(() => {
      const plan = typeof script === 'function' ? script({ file, args, options }) : script;
      if (plan && plan.stdout) child.stdout.emit('data', plan.stdout);
      if (plan && plan.stderr) child.stderr.emit('data', plan.stderr);
      child.emit('close', plan && Number.isInteger(plan.code) ? plan.code : 0);
    });
    return child;
  };
  fn.calls = calls;
  return fn;
}

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-votion-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'bir\niki\niki\n', 'utf8');
  return dir;
}

function harness(t, script) {
  const dir = project(t);
  const baseDir = path.join(dir, '.state');
  const grants = createVotionGrants();
  const spawnFn = fakeSpawn(script || { stdout: 'ok\n', code: 0 });
  const events = [];
  const exec = createVotionExec({
    baseDir,
    getProjectDir: () => dir,
    grants,
    spawnFn,
    record: (e) => events.push(e)
  });
  const actions = createVotionActions({
    baseDir,
    getProjectDir: () => dir,
    grants,
    exec,
    grantsApi: grants,
    getRoots: () => ({}),
    shellApi: {},
    audit: null
  });
  return { dir, baseDir, grants, exec, actions, spawnFn, events };
}

test('votion yetki 1: onay yokken komut ve yazma reddedilir', async (t) => {
  const h = harness(t);
  const cmd = await h.actions.run({ action: 'command', command: 'npm', args: ['test'] });
  assert.equal(cmd.ok, false);
  assert.equal(cmd.error.code, CODES.FORBIDDEN);
  assert.equal(cmd.error.detail.needsGrant, 'run.commands');
  assert.equal(h.spawnFn.calls.length, 0, 'onaysız komut başlatıldı');

  const wr = await h.actions.run({ action: 'writeFile', path: 'a.txt', content: 'x' });
  assert.equal(wr.ok, false);
  assert.equal(wr.error.detail.needsGrant, 'write.files');
  assert.equal(fs.readFileSync(path.join(h.dir, 'a.txt'), 'utf8'), 'bir\niki\niki\n', 'onaysız dosya değişti');
});

test('votion yetki 2: onay açar, kaldırma kapatır', async (t) => {
  const h = harness(t);
  const granted = await h.actions.run({ action: 'grant', capability: 'run.commands' });
  assert.equal(granted.ok, true);
  assert.equal(granted.data.capabilities.find((c) => c.id === 'run.commands').granted, true);

  const cmd = await h.actions.run({ action: 'command', command: 'npm', args: ['test'] });
  assert.equal(cmd.ok, true);
  assert.equal(cmd.data.exitCode, 0);
  assert.equal(h.spawnFn.calls.length, 1);

  await h.actions.run({ action: 'revokeGrant', capability: 'run.commands' });
  const again = await h.actions.run({ action: 'command', command: 'npm', args: ['test'] });
  assert.equal(again.ok, false);
  assert.equal(h.spawnFn.calls.length, 1, 'kaldırılan yetki hâlâ çalışıyor');
});

test('votion yetki 3: kabuk yok, beyaz liste zorunlu', async (t) => {
  const h = harness(t);
  await h.actions.run({ action: 'grant', capability: 'run.commands' });
  for (const bad of ['powershell', 'cmd', 'bash', 'rm', '']) {
    const res = await h.actions.run({ action: 'command', command: bad, args: ['-c', 'echo x'] });
    assert.equal(res.ok, false, `${bad} kabul edildi`);
  }
  assert.equal(h.spawnFn.calls.length, 0);

  const good = await h.actions.run({ action: 'command', command: 'node', args: ['--version'] });
  assert.equal(good.ok, true);
  const call = h.spawnFn.calls[0];
  assert.equal(call.options.shell, false, 'shell:true kullanılmış');
  assert.equal(call.file, 'node.exe');
  assert.deepEqual(call.args, ['--version']);
});

test('votion yetki 4: proje dışı çalışma dizini reddedilir', async (t) => {
  const h = harness(t);
  await h.actions.run({ action: 'grant', capability: 'run.commands' });
  const res = await h.actions.run({ action: 'command', command: 'node', cwd: path.join(h.dir, '..') });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.FORBIDDEN);
  assert.equal(h.spawnFn.calls.length, 0);
});

test('votion yetki 5: çıkış kodu hata değil sonuçtur; çıktı döner', async (t) => {
  const h = harness(t, { stdout: '1 test kaldı\n', stderr: 'hata satırı\n', code: 1 });
  await h.actions.run({ action: 'grant', capability: 'run.commands' });
  const res = await h.actions.run({ action: 'command', command: 'npm', args: ['test'] });
  assert.equal(res.ok, true, 'kırmızı test paketi hata sayıldı');
  assert.equal(res.data.exitCode, 1);
  assert.match(res.data.stdout, /1 test kaldı/);
  assert.match(res.data.stderr, /hata satırı/);
  assert.ok(res.data.ms >= 0);
});

test('votion yetki 6: yazma yedek bırakır ve içeriği değiştirir', async (t) => {
  const h = harness(t);
  await h.actions.run({ action: 'grant', capability: 'write.files' });
  const res = await h.actions.run({ action: 'writeFile', path: 'sub/yeni.txt', content: 'merhaba\n' });
  assert.equal(res.ok, true);
  assert.equal(fs.readFileSync(path.join(h.dir, 'sub', 'yeni.txt'), 'utf8'), 'merhaba\n');
  assert.equal(res.data.created, true);

  const edit = await h.actions.run({ action: 'writeFile', path: 'a.txt', find: 'iki', replace: 'uc', all: true });
  assert.equal(edit.ok, true);
  assert.equal(fs.readFileSync(path.join(h.dir, 'a.txt'), 'utf8'), 'bir\nuc\nuc\n');
  assert.ok(edit.data.backup, 'yedek yolu yok');
  assert.equal(fs.readFileSync(edit.data.backup, 'utf8'), 'bir\niki\niki\n', 'yedek eski içeriği taşımıyor');
});

test('votion yetki 7: sır ve bağımlılık dosyaları korumalı', async (t) => {
  const h = harness(t);
  await h.actions.run({ action: 'grant', capability: 'write.files' });
  fs.mkdirSync(path.join(h.dir, 'node_modules'), { recursive: true });
  for (const rel of ['.env', '.env.local', 'node_modules/x.js', '.git/config', 'secrets.bin']) {
    const res = await h.actions.run({ action: 'writeFile', path: rel, content: 'x' });
    assert.equal(res.ok, false, `${rel} yazılabildi`);
  }
  const outside = await h.actions.run({ action: 'writeFile', path: '..\\kacis.txt', content: 'x' });
  assert.equal(outside.ok, false, 'proje dışına yazıldı');
});

test('votion yetki 8: çok eşleşmede all ister', async (t) => {
  const h = harness(t);
  await h.actions.run({ action: 'grant', capability: 'write.files' });
  const res = await h.actions.run({ action: 'writeFile', path: 'a.txt', find: 'iki', replace: 'uc' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.CONFLICT);
  assert.equal(fs.readFileSync(path.join(h.dir, 'a.txt'), 'utf8'), 'bir\niki\niki\n');
});

test('votion yetki 9: yetki kalıcı değil — yeni oturum kapalı başlar', () => {
  const first = createVotionGrants();
  first.grant('run.commands');
  assert.equal(first.has('run.commands'), true);
  const second = createVotionGrants();
  assert.equal(second.has('run.commands'), false, 'yetki diskte kalmış / yeni oturuma taşınmış');
  assert.ok(!fs.existsSync(path.join(ROOT, '.team', 'votion-grants.json')), 'yetki diske yazılmış');
});

test('votion yetki 10: kanal sözleşmesi büyümedi', () => {
  const invoke = Object.entries(CHANNELS.CHANNELS).filter(([, v]) => !String(v).includes(':event:'));
  assert.ok(CHANNELS.CHANNELS.VOTION_ACT, 'VOTION_ACT yok');
  assert.ok(!/VOTION_GRANT|VOTION_COMMAND|VOTION_WRITE/.test(JSON.stringify(CHANNELS.CHANNELS)),
    'yeni kanal eklenmiş — sözleşme sayısı büyür');
  assert.ok(invoke.length > 0);
  const preload = read(path.join(SRC, 'preload', 'preload.js'));
  assert.match(preload, /exec: call\(CH\.VOTION_ACT, 180000\)/, 'komut için uzun köprü zaman aşımı yok');
  assert.match(preload, /grants: call\(CH\.VOTION_ACT\)/, 'yetki sorgusu köprüde yok');
});

test('votion yetki 11: list() yetkileri ve komut listesini raporlar', async (t) => {
  const h = harness(t);
  const res = await h.actions.run({ action: 'list' });
  assert.equal(res.ok, true);
  assert.ok(Array.isArray(res.data.grants.capabilities));
  assert.equal(res.data.grants.capabilities.length, 2);
  assert.deepEqual(res.data.commands.map((c) => c.id).sort(), ['git', 'node', 'npm', 'npx', 'py', 'python']);
  assert.match(JSON.stringify(h.actions.CONFIRM_ACTIONS), /grant/, 'onay yetkisi CONFIRM_ACTIONS içinde değil');
});
