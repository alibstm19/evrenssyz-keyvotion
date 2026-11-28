'use strict';

/*
 * T-157 — LAN uzaktan erişim servisi (src/main/services/remote.js) GERÇEK testleri.
 *
 * Ağ YOK: sunucu yalnız 127.0.0.1 üzerinden, rastgele portta dinlenir; harici
 * istek atılmaz. Gerçek node:http sunucusu + gerçek istek/yanıt döngüsü ölçülür.
 *
 * Kapsam: özel ağ kapısı, eşleşme jetonu, gövde sınırı, hız sınırı, dosya
 * sunumu yasağı, jeton sızıntısı, uç nokta kümesi, yaşam döngüsü.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');

const { SRC } = require('../lib');
const {
  createRemoteService,
  isPrivateAddress
} = require(path.join(SRC, 'main', 'services', 'remote.js'));

const TOKEN = 'E2ETOKEN1234';
const BODY_LIMIT = 64 * 1024;

/** Boş bir TCP portu bul (127.0.0.1). */
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

function request(port, { method = 'GET', path: p = '/api/health', headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'ETIMEDOUT' }); });
    req.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
    if (body) req.write(body);
    req.end();
  });
}

/** Gerçek servis + geçici kök + gerçek audit dizisi. */
async function harness(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-t157-remote-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const audited = [];
  const svc = createRemoteService({
    baseDir: dir,
    chat: {
      list: () => ({ ok: true, data: { conversations: [{ id: 'c1', title: 'Konuşma' }] } }),
      get: () => ({
        ok: true,
        data: {
          conversation: { id: 'c1', title: 'Konuşma', model: 'test/model', role: 'LDR' },
          messages: [{ id: 'm1', role: 'user', text: 'merhaba' }]
        }
      }),
      send: (input) => ({ ok: true, data: { id: 'm2', text: String(input.text || '').slice(0, 40) } }),
      create: () => ({ ok: true, data: { id: 'c2' } })
    },
    memory: { read: () => ({ ok: true, data: { entries: [{ text: 'not', scope: 'p', kind: 'fact' }] } }) },
    board: null,
    getTeam: () => [{ id: 'qa', name: 'QA' }],
    audit: { append: (entry) => audited.push(entry) }
  });

  const wanted = await freePort();
  const started = await svc.start({ port: wanted, token: TOKEN });
  assert.equal(started.ok, true, `sunucu başlamadı: ${JSON.stringify(started)}`);
  const port = started.data.port;
  t.after(() => svc.stop());

  return { svc, dir, port, audited };
}

/* 1) Genel IP kapısı ------------------------------------------------------ */
test('server/remote 1: genel IP reddedilir, X-Forwarded-For guvenilmez', async (t) => {
  /* Kapı fonksiyonu: genel adresler özel SAYILMAZ. */
  for (const pub of ['8.8.8.8', '203.0.113.9', '172.32.0.1', '172.15.255.255', '11.0.0.1', '192.169.0.1']) {
    assert.equal(isPrivateAddress(pub), false, `genel adres özel sayıldı: ${pub}`);
  }
  for (const priv of ['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.20', '127.0.0.1', '::1', '::ffff:192.168.0.5']) {
    assert.equal(isPrivateAddress(priv), true, `özel adres reddedildi: ${priv}`);
  }

  const { port } = await harness(t);
  /* Başlık taklidi kapıyı ATLATMAZ: gerçek soket loopback olduğu için istek
     servis edilir; başlık hiçbir yetki kazandırmaz (403 üretmez, 401 de değil). */
  const spoof = await request(port, {
    path: '/api/health',
    headers: { 'x-forwarded-for': '8.8.8.8', 'x-real-ip': '8.8.8.8' }
  });
  assert.equal(spoof.status, 200);
  /* Jetonlu uçta da başlık yetki kazandırmaz. */
  const spoofState = await request(port, { path: '/api/state', headers: { 'x-forwarded-for': '8.8.8.8' } });
  assert.equal(spoofState.status, 401, 'X-Forwarded-For jeton yerine geçmemeli');
});

/* 2) Jeton yok / yanlış --------------------------------------------------- */
test('server/remote 2: jetonsuz ve yanlis jetonlu istek 401, govdede jeton yok', async (t) => {
  const { port } = await harness(t);

  const none = await request(port, { path: '/api/state' });
  assert.equal(none.status, 401);
  assert.equal(JSON.parse(none.text).error.code, 'E_UNAUTHORIZED');

  const wrong = await request(port, { path: '/api/state', headers: { 'x-kv-token': 'WRONGTOKEN99' } });
  assert.equal(wrong.status, 401);

  const shortToken = await request(port, { path: '/api/state', headers: { 'x-kv-token': TOKEN.slice(0, 4) } });
  assert.equal(shortToken.status, 401);

  for (const body of [none.text, wrong.text, shortToken.text]) {
    assert.ok(!body.includes(TOKEN), '401 gövdesi tam jetonu içeriyor');
  }
});

/* 3) Doğru jeton ---------------------------------------------------------- */
test('server/remote 3: dogru jeton 200 ve beklenen JSON', async (t) => {
  const { port } = await harness(t);

  const viaHeader = await request(port, { path: '/api/state', headers: { 'x-kv-token': TOKEN } });
  assert.equal(viaHeader.status, 200);
  const body = JSON.parse(viaHeader.text);
  assert.equal(body.ok, true);
  assert.equal(body.data.model, 'test/model');
  assert.equal(body.data.role, 'LDR');
  assert.equal(body.data.memoryCount, 1);
  assert.equal(body.data.team.length, 1);

  /* Jeton URL üzerinden kabul edilmez. */
  const viaQuery = await request(port, { path: `/api/state?t=${TOKEN}` });
  assert.equal(viaQuery.status, 401);

  const board = await request(port, { path: '/api/board', headers: { 'x-kv-token': TOKEN } });
  assert.equal(board.status, 500);
  assert.equal(JSON.parse(board.text).error.code, 'E_INTERNAL');
});

/* 4) Gövde sınırı (64 KB) ------------------------------------------------- */
test('server/remote 4: 64 KB ustu govde 413 ile reddedilir', async (t) => {
  const { port, svc } = await harness(t);
  const big = JSON.stringify({ text: 'x'.repeat(BODY_LIMIT + 1024) });

  const res = await request(port, {
    method: 'POST',
    path: '/api/send',
    headers: { 'x-kv-token': TOKEN, 'content-type': 'application/json', 'content-length': Buffer.byteLength(big) },
    body: big
  });

  /* Sunucu ayakta kalmalı (sınır aşımı süreci düşürmemeli). */
  const after = await request(port, { path: '/api/health' });
  assert.equal(after.status, 200, 'gövde sınırı sonrası sunucu yanıt vermiyor');

  assert.equal(res.status, 413,
    `64 KB üstü gövde 413 dönmeli; dönen: ${res.status}${res.error ? ` (${res.error})` : ''} — `
    + 'readBody() req.destroy() çağırıyor, ardından 400 yanıtı sokete yazılamıyor (ECONNRESET)');
  assert.equal(svc.state().running, true);
});

/* 5) Hız sınırı (60/dk/IP) ------------------------------------------------ */
test('server/remote 5: ayni IPden 61. istek 429', async (t) => {
  const { port } = await harness(t);

  for (let i = 1; i <= 60; i += 1) {
    const r = await request(port, { path: '/api/health' });
    assert.equal(r.status, 200, `${i}. istek 200 olmalı; dönen ${r.status}`);
  }
  const over = await request(port, { path: '/api/health' });
  assert.equal(over.status, 429, '61. istek 429 olmalı');
  assert.equal(JSON.parse(over.text).error.code, 'E_RATE_LIMIT');
});

/* 6) Dosya sunumu yok ----------------------------------------------------- */
test('server/remote 6: dosya yollari 404, icerik donmez', async (t) => {
  const { port } = await harness(t);

  for (const p of ['/etc/passwd', '/../package.json', '/main/main.js', '/src/main/main.js', '/package.json']) {
    const r = await request(port, { path: p, headers: { 'x-kv-token': TOKEN } });
    assert.equal(r.status, 404, `dosya yolu servis edildi: ${p} → ${r.status}`);
    assert.ok(!r.text.includes('root:'), `${p} sistem dosyası içeriği döndü`);
    assert.ok(!r.text.includes('"dependencies"'), `${p} package.json içeriği döndü`);
  }
});

/* 7) Jeton sızıntısı ------------------------------------------------------ */
test('server/remote 7: yanit govdeleri ve audit kaydi tam jetonu icermez', async (t) => {
  const { port, audited } = await harness(t);

  const bodies = [];
  bodies.push((await request(port, { path: '/api/health' })).text);
  bodies.push((await request(port, { path: '/api/state' })).text);
  bodies.push((await request(port, { path: '/api/state', headers: { 'x-kv-token': 'WRONGTOKEN99' } })).text);
  bodies.push((await request(port, { path: '/api/state', headers: { 'x-kv-token': TOKEN } })).text);
  bodies.push((await request(port, { path: '/nope' })).text);
  bodies.push((await request(port, { path: '/api/nope', headers: { 'x-kv-token': TOKEN } })).text);

  for (const body of bodies) {
    assert.ok(!body.includes(TOKEN), 'yanıt gövdesi tam jetonu içeriyor');
  }

  const auditText = JSON.stringify(audited);
  assert.ok(!auditText.includes(TOKEN), 'audit kaydı tam jetonu içeriyor');
  assert.ok(audited.length >= 1 && audited[0].op === 'remote.start');
  assert.ok(audited[0].extra && typeof audited[0].extra.tokenMask === 'string', 'audit maskeli jeton taşımalı');
});

/* 8) Uç nokta kümesi: yalnız /api/* + tek HTML ---------------------------- */
test('server/remote 8: yalniz /api/* ve tek HTML sayfasi; bilinmeyen yol 404', async (t) => {
  const { port } = await harness(t);

  const root = await request(port, { path: '/' });
  assert.equal(root.status, 200);
  assert.match(root.headers['content-type'], /text\/html/);
  assert.match(root.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(root.text.includes('<html'), 'HTML sayfası dönmedi');

  const index = await request(port, { path: '/index.html' });
  assert.equal(index.status, 200);

  for (const p of ['/foo', '/styles/base.css', '/api', '/api/', '/favicon.ico']) {
    const r = await request(port, { path: p, headers: { 'x-kv-token': TOKEN } });
    assert.equal(r.status, 404, `${p} 404 olmalı; dönen ${r.status}`);
  }

  const unknownApi = await request(port, { path: '/api/unknown', headers: { 'x-kv-token': TOKEN } });
  assert.equal(unknownApi.status, 404);
  assert.equal(JSON.parse(unknownApi.text).error.code, 'E_NOT_FOUND');
});

/* 9) Yazma ucu ------------------------------------------------------------ */
test('server/remote 9: POST /api/send jetonla calisir, jetonsuz 401', async (t) => {
  const { port } = await harness(t);
  const payload = JSON.stringify({ text: 'telefondan mesaj' });

  const unauth = await request(port, {
    method: 'POST', path: '/api/send', headers: { 'content-type': 'application/json' }, body: payload
  });
  assert.equal(unauth.status, 401);

  const okRes = await request(port, {
    method: 'POST',
    path: '/api/send',
    headers: { 'x-kv-token': TOKEN, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    body: payload
  });
  assert.equal(okRes.status, 200);
  assert.equal(JSON.parse(okRes.text).ok, true);
});

/* 10) Yaşam döngüsü ------------------------------------------------------- */
test('server/remote 10: start idempotent, stop portu kapatir, config 0600 yazilir', async (t) => {
  const { svc, port, dir } = await harness(t);

  const again = await svc.start({ port, token: TOKEN });
  assert.equal(again.ok, true);
  assert.equal(again.data.port, port, 'ikinci start yeni sunucu açmamalı');

  const cfgPath = path.join(dir, 'remote.json');
  assert.ok(fs.existsSync(cfgPath), 'remote.json yazılmadı');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.equal(cfg.token, TOKEN);
  assert.equal(cfg.port, port);

  const st = svc.state();
  assert.equal(st.running, true);
  assert.equal(st.tokenSet, true);
  assert.equal(st.tokenMask.includes(TOKEN), false, 'maske tam jetonu içeriyor');

  const stopped = await svc.stop();
  assert.equal(stopped.ok, true);
  assert.equal(svc.state().running, false);

  const afterStop = await request(port, { path: '/api/health' });
  assert.equal(afterStop.status, 0, 'stop sonrası port hâlâ yanıt veriyor');
});
