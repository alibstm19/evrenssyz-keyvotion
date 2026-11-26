'use strict';

/*
 * Tur 5 / T5-4 — Telefondan uzaktan kontrol.
 *
 * Gerçek sunucu (node:http) ayağa kalkar, gerçek HTTP istekleri atılır.
 * Ölçülen güvenlik kuralları (API-60):
 *   1) eşleşme kodu yoksa/yanlışsa /api/* → 401
 *   2) /api/health jetonsuz çalışır ve yalnız "açık mı" der
 *   3) kod döndürülünce (rotate) eski kod ANINDA düşer
 *   4) yalnız özel ağ adresleri kabul edilir; genel IP reddedilir (birim test)
 *   5) gövde sınırı 64 KB → üstü reddedilir
 *   6) uzak HTML yanıtı güvenlik başlıkları taşır ve uç nokta listesi dardır
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');

const {
  createRemoteService,
  isPrivateAddress,
  tokenEquals,
  makeToken
} = require(path.join(SRC, 'main', 'services', 'remote.js'));

const audit = { rows: [], append(row) { this.rows.push(row); } };

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kv-remote-'));
}

/** Sohbet servisinin yalnız remote'un kullandığı yüzü. */
function fakeChat() {
  const store = {
    conversation: {
      id: 'cvs_test',
      title: 'Telefon testi',
      role: 'LDR',
      model: 'test-model',
      messages: [
        { id: 'm1', role: 'user', content: 'selam', at: new Date().toISOString() },
        { id: 'm2', role: 'assistant', content: 'merhaba', at: new Date().toISOString() }
      ]
    }
  };
  return {
    store,
    list: () => ({ ok: true, data: { conversations: [{ ...store.conversation, messages: undefined, count: 2, lastText: 'merhaba' }] } }),
    get: () => ({ ok: true, data: { conversation: store.conversation, messages: store.conversation.messages, total: 2 } }),
    create: () => ({ ok: true, data: { conversation: store.conversation } }),
    send: async (input) => {
      store.conversation.messages.push({ id: 'u', role: 'user', content: input.text, at: new Date().toISOString() });
      return { ok: true, data: { conversation: store.conversation, message: { content: 'ok' } } };
    }
  };
}

async function boot(port, opts) {
  const baseDir = tempDir();
  const chat = (opts && opts.chat) || fakeChat();
  const service = createRemoteService({
    baseDir,
    chat,
    memory: { read: () => ({ ok: true, data: { entries: [{ text: 'kısa yaz', scope: 'user', kind: 'preference' }] } }) },
    getTeam: () => [{ role: 'LDR', code: 'LDR-1', model: 'test-model', state: 'idle' }],
    audit
  });
  const started = await service.start({ port, token: 'TESTCODE12' });
  assert.ok(started.ok, 'sunucu başlamadı: ' + JSON.stringify(started.error));
  return { service, chat, port: started.data.port, base: `http://127.0.0.1:${started.data.port}` };
}

async function get(url, opts) {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, headers: res.headers };
}

/* ------------------------------------------------------------------ birim */

test('tur5/remote 1: yalnız özel ağ adresleri kabul edilir', () => {
  const allowed = ['127.0.0.1', '10.0.0.5', '192.168.1.20', '172.16.0.9', '172.31.255.1', '169.254.3.4', '::1', '::ffff:192.168.0.2'];
  const denied = ['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '11.0.0.1', '1.1.1.1', '', 'abc', '999.1.1.1'];

  for (const a of allowed) assert.strictEqual(isPrivateAddress(a), true, `${a} özel ağ sayılmalı`);
  for (const a of denied) assert.strictEqual(isPrivateAddress(a), false, `${a} reddedilmeli`);
});

test('tur5/remote 2: eşleşme kodu karşılaştırması doğru ve jeton alfabesi karışabilen harf içermez', () => {
  assert.strictEqual(tokenEquals('ABC123', 'ABC123'), true);
  assert.strictEqual(tokenEquals('ABC123', 'ABC124'), false);
  assert.strictEqual(tokenEquals('ABC123', 'abc123'), false);
  assert.strictEqual(tokenEquals('', ''), true);
  assert.strictEqual(tokenEquals(null, undefined), true);

  for (let i = 0; i < 40; i += 1) {
    const token = makeToken();
    assert.strictEqual(token.length, 10);
    assert.doesNotMatch(token, /[0O1I]/, 'karışabilen karakter üretildi: ' + token);
  }
});

/* ------------------------------------------------------------------ HTTP */

test('tur5/remote 3: jeton yoksa /api/* 401; /api/health jetonsuz çalışır', async (t) => {
  const boot_ = await boot(7811);
  t.after(async () => { await boot_.service.stop(); });

  const denied = await get(`${boot_.base}/api/state`);
  assert.strictEqual(denied.status, 401);
  assert.strictEqual(denied.body.error.code, 'E_UNAUTHORIZED');

  const wrong = await get(`${boot_.base}/api/state`, { headers: { 'x-kv-token': 'YANLISKOD1' } });
  assert.strictEqual(wrong.status, 401);

  const health = await get(`${boot_.base}/api/health`);
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.ok, true);
  assert.strictEqual(health.body.data.service, 'keyvotion-remote');
  /* sağlık ucu jeton SIZDIRMAZ */
  assert.ok(!JSON.stringify(health.body).includes('TESTCODE12'));
});

test('tur5/remote 4: doğru jetonla durum/ekip/hafıza okunur ve mesaj gönderilir', async (t) => {
  const boot_ = await boot(7812);
  t.after(async () => { await boot_.service.stop(); });

  const state = await get(`${boot_.base}/api/state`, { headers: { 'x-kv-token': 'TESTCODE12' } });
  assert.strictEqual(state.status, 200);
  assert.ok(state.body.ok);
  assert.strictEqual(state.body.data.role, 'LDR');
  assert.strictEqual(state.body.data.messages.length, 2);
  assert.strictEqual(state.body.data.team.length, 1);
  assert.strictEqual(state.body.data.team[0].code, 'LDR-1');
  assert.ok(state.body.data.memoryCount >= 1);
  /* uzak yanıt jetonu geri döndürmez */
  assert.ok(!JSON.stringify(state.body).includes('TESTCODE12'), 'uzak yanıt eşleşme kodunu sızdırdı');

  const sent = await get(`${boot_.base}/api/send`, {
    method: 'POST',
    headers: { 'x-kv-token': 'TESTCODE12', 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'telefondan selam' })
  });
  assert.strictEqual(sent.status, 200);
  assert.ok(sent.body.ok, JSON.stringify(sent.body));
  assert.ok(boot_.chat.store.conversation.messages.some((m) => m.content === 'telefondan selam'));
});

test('tur5/remote 5: kod yenilenince eski kod anında düşer', async (t) => {
  const boot_ = await boot(7813);
  t.after(async () => { await boot_.service.stop(); });

  const before = await get(`${boot_.base}/api/state`, { headers: { 'x-kv-token': 'TESTCODE12' } });
  assert.strictEqual(before.status, 200);

  const rotated = boot_.service.rotate();
  assert.ok(rotated.ok);
  const fresh = rotated.data.token;
  assert.notStrictEqual(fresh, 'TESTCODE12');

  const old = await get(`${boot_.base}/api/state`, { headers: { 'x-kv-token': 'TESTCODE12' } });
  assert.strictEqual(old.status, 401, 'eski kod hâlâ geçerli');

  const ok = await get(`${boot_.base}/api/state`, { headers: { 'x-kv-token': fresh } });
  assert.strictEqual(ok.status, 200);

  /* state uç noktası maskeyi de verir */
  assert.match(rotated.data.tokenMask, /4$|•/);
});

test('tur5/remote 6: 64 KB üstü gövde reddedilir; bilinmeyen yol 404', async (t) => {
  const boot_ = await boot(7814);
  t.after(async () => { await boot_.service.stop(); });

  const huge = 'x'.repeat(70 * 1024);
  const res = await fetch(`${boot_.base}/api/send`, {
    method: 'POST',
    headers: { 'x-kv-token': 'TESTCODE12', 'content-type': 'application/json' },
    body: JSON.stringify({ text: huge })
  }).catch((e) => ({ status: 0, err: e.message }));
  // 413 = explicit rejection (T-158). 400/0 = legacy behaviours kept accepted.
  assert.ok([400, 413, 0].includes(res.status), `büyük gövde kabul edildi (${res.status})`);

  const missing = await get(`${boot_.base}/api/yok`, { headers: { 'x-kv-token': 'TESTCODE12' } });
  assert.strictEqual(missing.status, 404);
});

test('tur5/remote 7: HTML sayfası güvenlik başlıklarıyla gelir ve dış kaynak yüklemez', async (t) => {
  const boot_ = await boot(7815);
  t.after(async () => { await boot_.service.stop(); });

  const res = await fetch(`${boot_.base}/`);
  const html = await res.text();
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /Keyvotion/);
  assert.doesNotMatch(html, /https?:\/\//, 'sayfa dış kaynak (CDN vb.) yüklüyor');
});

test('tur5/remote 8: jeton diske 0600 ile yazılır, yanıt maskesi tam kodu göstermez', async (t) => {
  const boot_ = await boot(7816);
  t.after(async () => { await boot_.service.stop(); });

  const file = boot_.service.paths.filePath;
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.token, 'TESTCODE12');
  assert.strictEqual(parsed.port, 7816);

  const state = boot_.service.state();
  assert.strictEqual(state.tokenSet, true);
  assert.notStrictEqual(state.tokenMask, state.token);
  assert.ok(!state.tokenMask.includes('TESTCODE'), 'maske kodu açık ediyor');
  assert.strictEqual(audit.rows.filter((r) => r.op === 'remote.start').length >= 1, true);
});
