'use strict';

/*
 * Tur 5 / T5-2 — Doğrudan model sohbeti.
 *
 * NE ÖLÇÜLÜR (hepsi gerçek kod, gerçek disk, gerçek HTTP):
 *   1) Çoklu anahtar failover: 1. anahtar 429 → 2. anahtara geçer, istek BİR kez
 *      tekrar edilir, yanıt maskesi 2. anahtarındır.
 *   2) Kullanıcı mesajı ağ çağrısından ÖNCE diske yazılır: tüm anahtarlar
 *      tükenirse bile mesaj kaybolmaz ve conversationId döner.
 *   3) Sistem istemi paylaşılan hafızayı, etkin becerileri ve rolün izin
 *      satırını taşır (dosyaya giden gerçek gövde yakalanır).
 *   4) Sohbet dosyası yeniden okunabilir (kalıcılık) ve silme gerçekten siler.
 *
 * Sahte safeStorage kullanılır (DPAPI yalnız Electron içinde var); geri kalan
 * her şey ürün kodudur: providers + chat + http-client.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { SRC } = require('../lib');

const { createHttpClient } = require(path.join(SRC, 'main', 'services', 'http-client.js'));
const { createProvidersService } = require(path.join(SRC, 'main', 'services', 'providers.js'));
const { createChatService } = require(path.join(SRC, 'main', 'services', 'chat.js'));

/* ---------------------------------------------------------------- yardımcı */

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  return dir;
}

/** DPAPI yerine bellekte şifreleme — yalnız test kolaylığı. */
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (buf) => String(buf).replace(/^enc:/, '')
};

const audit = { rows: [], append(row) { this.rows.push(row); } };

/**
 * Sahte OpenAI uyumlu uç. `plan` anahtar → davranış eşlemesi:
 *   429 → kota, 500 → sunucu hatası, 'ok' → normal yanıt
 */
function startFakeProvider(plan) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const auth = String(req.headers.authorization || '');
      const key = auth.replace(/^Bearer\s+/i, '');
      const mode = plan[key] || 'ok';
      seen.push({ key, mode, path: req.url, body });

      if (mode === 429) {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'rate limit' } }));
        return;
      }
      if (mode === 500) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'boom' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-test',
        choices: [{ message: { role: 'assistant', content: `yanıt:${key.slice(-4)}` } }],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
      }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, seen, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

function makeStack(port, extra) {
  const baseDir = tempDir('chat');
  const settings = { connection: () => ({ serverURL: 'http://127.0.0.1:1', projectDir: baseDir }) };
  const httpClient = createHttpClient({ getConfig: settings.connection, getPassword: () => null });
  const providers = createProvidersService({ baseDir, safeStorage: fakeSafeStorage, http: httpClient, audit });

  const saved = providers.save({ provider: { name: 'Test Evren', baseURL: `http://127.0.0.1:${port}/v1`, models: ['test-model'] } });
  assert.ok(saved.ok, 'sağlayıcı kaydedilemedi: ' + JSON.stringify(saved.error));
  const providerId = saved.data.provider.id;

  providers.addKey({ providerId, key: 'sk-birinci-anahtar-1111', label: 'birinci' });
  providers.addKey({ providerId, key: 'sk-ikinci-anahtar-2222', label: 'ikinci' });

  const memory = {
    context: () => ({ ok: true, data: { block: '## Paylaşılan ajan hafızası\n\n### Kullanıcı tercihleri (öncelikli — bunlara uy)\n\n- Kısa yaz.', count: 1, entries: [] } })
  };
  const skills = {
    list: () => ({ ok: true, data: { skills: [{ id: 's1', name: 'kanıt', enabled: true, instructions: 'Çalıştırmadığın şeyi bitmiş sayma.' }] } })
  };
  const permissions = {
    get: () => ({ ok: true, data: { matrix: { LDR: { 'command:send': true, 'board:write': false } } } })
  };

  const chat = createChatService({
    baseDir,
    providers,
    memory,
    skills,
    permissions,
    audit,
    getProjectName: () => 'Keyvotion'
  });

  return { baseDir, providers, chat, providerId, ...extra };
}

/* ------------------------------------------------------------------ testler */

test('tur5/chat 1: 429 alan anahtardan sonrakine geçer; yanıt 2. anahtarın maskesiyle döner', async (t) => {
  const fake = await startFakeProvider({ 'sk-birinci-anahtar-1111': 429 });
  t.after(async () => { await fake.close(); });

  const stack = makeStack(fake.port);
  const created = stack.chat.create({ role: 'LDR' });
  assert.ok(created.ok, JSON.stringify(created.error));
  const id = created.data.conversation.id;

  const res = await stack.chat.send({ conversationId: id, text: 'Merhaba ekip' });
  assert.ok(res.ok, 'gönderi başarısız: ' + JSON.stringify(res.error));

  assert.strictEqual(res.data.attempts.length, 2, 'birinci anahtar 429 verdi, ikinci denenmeli');
  assert.strictEqual(res.data.attempts[0].status, 429);
  assert.strictEqual(res.data.attempts[0].outcome, 'switch');
  assert.strictEqual(res.data.attempts[1].outcome, 'success');
  assert.match(res.data.message.content, /2222/, 'yanıt ikinci anahtardan gelmeli');

  /* API-03: hiçbir yerde anahtar DEĞERİ yok, yalnız maske. */
  const flat = JSON.stringify(res);
  assert.ok(!flat.includes('sk-birinci-anahtar-1111'), 'anahtar değeri yanıtta sızdı');
  assert.ok(!flat.includes('sk-ikinci-anahtar-2222'), 'anahtar değeri yanıtta sızdı');
  assert.match(res.data.mask, /…/);

  /* ikinci anahtar da sağlıklı işaretlendi, birinci soğumaya alındı */
  const list = stack.providers.list();
  const prov = list.data.providers.find((p) => p.id === stack.providerId);
  assert.ok(prov, 'sağlayıcı listede yok');
  const keys = prov.keys;
  assert.strictEqual(keys[0].health.state, 'cooldown', '429 alan anahtar cooldown olmalı');
  assert.strictEqual(keys[1].health.state, 'ok');
});

test('tur5/chat 2: sistem istemi hafıza + beceri + izin taşır ve kullanıcı mesajı kalıcıdır', async (t) => {
  const fake = await startFakeProvider({});
  t.after(async () => { await fake.close(); });

  const stack = makeStack(fake.port);
  const created = stack.chat.create({ role: 'LDR', model: 'test-model' });
  const id = created.data.conversation.id;

  const res = await stack.chat.send({ conversationId: id, text: 'Planı özetle' });
  assert.ok(res.ok, JSON.stringify(res.error));

  const requestBody = JSON.parse(fake.seen[fake.seen.length - 1].body);
  const system = requestBody.messages.find((m) => m.role === 'system');
  assert.ok(system, 'sistem mesajı yok');
  assert.match(system.content, /Kullanıcı tercihleri/, 'hafıza bloğu sistem istemine girmedi');
  assert.match(system.content, /Etkin beceriler/, 'etkin beceriler girmedi');
  assert.match(system.content, /kanıt: Çalıştırmadığın/, 'beceri metni girmedi');
  assert.match(system.content, /Bu rolün izinleri/, 'izin satırı girmedi');
  assert.match(system.content, /Aktif proje: Keyvotion/);
  assert.strictEqual(requestBody.model, 'test-model');
  assert.strictEqual(requestBody.stream, false);

  /* kullanıcı mesajı gövdede ve diskte */
  assert.ok(requestBody.messages.some((m) => m.role === 'user' && m.content === 'Planı özetle'));

  const onDisk = JSON.parse(fs.readFileSync(path.join(stack.baseDir, 'conversations.json'), 'utf8'));
  const conv = onDisk.conversations.find((c) => c.id === id);
  assert.ok(conv, 'konuşma diske yazılmadı');
  assert.strictEqual(conv.messages[0].role, 'user');
  assert.strictEqual(conv.messages[0].content, 'Planı özetle');
  assert.strictEqual(conv.messages[1].role, 'assistant');
  assert.strictEqual(conv.messages[1].meta.usage.total, 18);

  /* yeniden okuma */
  const readBack = stack.chat.get({ id });
  assert.ok(readBack.ok);
  assert.strictEqual(readBack.data.messages.length, 2);
});

test('tur5/chat 3: tüm anahtarlar tükenirse E_RATE_LIMIT + konuşma kimliği; mesaj korunur', async (t) => {
  const fake = await startFakeProvider({
    'sk-birinci-anahtar-1111': 429,
    'sk-ikinci-anahtar-2222': 500
  });
  t.after(async () => { await fake.close(); });

  const stack = makeStack(fake.port);
  const created = stack.chat.create({ role: 'DEV' });
  const id = created.data.conversation.id;

  const res = await stack.chat.send({ conversationId: id, text: 'Bu başarısız olacak' });
  assert.strictEqual(res.ok, false, 'iki anahtar da hata verdi, başarı dönmemeli');
  assert.strictEqual(res.error.code, 'E_RATE_LIMIT');
  assert.strictEqual(res.error.detail.conversationId, id);
  assert.strictEqual(res.error.detail.userMessage.content, 'Bu başarısız olacak');
  assert.strictEqual(res.error.detail.attempts.length, 2);

  const readBack = stack.chat.get({ id });
  assert.ok(readBack.ok);
  assert.strictEqual(readBack.data.messages.length, 1, 'başarısız gönderimde kullanıcı mesajı korunmalı');
  assert.strictEqual(readBack.data.messages[0].content, 'Bu başarısız olacak');
});

test('tur5/chat 4: anahtar yoksa E_SECRET_MISSING; mesaj boşsa E_BAD_REQUEST', async () => {
  const baseDir = tempDir('chat-nokey');
  const httpClient = createHttpClient({
    getConfig: () => ({ serverURL: 'http://127.0.0.1:1', projectDir: baseDir }),
    getPassword: () => null
  });
  const providers = createProvidersService({ baseDir, safeStorage: fakeSafeStorage, http: httpClient, audit });
  /* Uzak (loopback olmayan) saglayici anahtarsiz cagrilamaz; istek atilmadan
     E_SECRET_MISSING doner. Yerel/loopback icin bu kural T-161'de kalkti. */
  const saved = providers.save({ provider: { name: 'Anahtarsız', baseURL: 'https://api.example.com/v1', models: ['m'] } });
  const chat = createChatService({ baseDir, providers, audit });

  const created = chat.create({ role: 'LDR', providerId: saved.data.provider.id });
  assert.ok(created.ok);
  const res = await chat.send({ conversationId: created.data.conversation.id, text: 'selam' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, 'E_SECRET_MISSING');

  const empty = await chat.send({ conversationId: created.data.conversation.id, text: '   ' });
  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.error.code, 'E_BAD_REQUEST');
});

test('tur5/chat 5: yeniden adlandırma ve silme gerçekten diske yansır', async () => {
  const baseDir = tempDir('chat-crud');
  const httpClient = createHttpClient({
    getConfig: () => ({ serverURL: 'http://127.0.0.1:1', projectDir: baseDir }),
    getPassword: () => null
  });
  const providers = createProvidersService({ baseDir, safeStorage: fakeSafeStorage, http: httpClient, audit });
  providers.save({ provider: { name: 'P', baseURL: 'http://127.0.0.1:1/v1', models: ['m'] } });
  const chat = createChatService({ baseDir, providers, audit });

  const created = chat.create({ role: 'YM', title: 'Eski başlık' });
  const id = created.data.conversation.id;

  const renamed = chat.rename({ id, title: 'Yeni başlık' });
  assert.ok(renamed.ok);
  assert.strictEqual(chat.get({ id }).data.conversation.title, 'Yeni başlık');

  const removed = chat.remove({ id });
  assert.ok(removed.ok);
  assert.strictEqual(chat.get({ id }).error.code, 'E_NOT_FOUND');
  const onDisk = JSON.parse(fs.readFileSync(path.join(baseDir, 'conversations.json'), 'utf8'));
  assert.strictEqual(onDisk.conversations.find((c) => c.id === id), undefined);
});
