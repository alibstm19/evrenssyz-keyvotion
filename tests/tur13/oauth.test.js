'use strict';

/* T-137 — OAuth2 + PKCE gerçek testleri. Dış ağ YOK: token endpoint mock,
 * loopback (127.0.0.1) dışında istek yapılmaz. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { SRC } = require('../lib');
const { PROVIDERS, OAUTH_TIMEOUT_MS, pkceChallenge, createOAuthService } =
  require(path.join(SRC, 'main', 'services', 'oauth.js'));

const VERIFIER = 'A'.repeat(43);
const STATE = 'S'.repeat(43);
const ACCESS = 'ACCESS_TOKEN_VALUE_123';
const REFRESH = 'REFRESH_TOKEN_VALUE_456';

function fakeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`ENC::${s}`, 'utf8'),
    decryptString: (b) => String(b.toString('utf8')).slice(5)
  };
}

function make(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-oauth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fetchCalls = [];
  let seq = 0;
  const defaults = {
    safeStorage: fakeStorage(),
    userDataDir: dir,
    getCredentials: () => ({ clientId: 'client-id', clientSecret: 'client-secret' }),
    pkceFactory: () => VERIFIER,
    stateFactory: () => STATE,
    flowIdFactory: () => `flow-${++seq}`,
    fetchImpl: async (url, params) => {
      fetchCalls.push({ url, params });
      return { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 };
    },
    onEvent: () => {}
  };
  return { svc: createOAuthService(Object.assign(defaults, overrides)), dir, fetchCalls };
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

test('tur13/oauth 1: PROVIDERS 4 sağlayıcı, gömülü istemci sırrı yok', () => {
  assert.deepStrictEqual(Object.keys(PROVIDERS).sort(),
    ['github', 'gmail', 'google-calendar', 'google-drive']);
  for (const [key, p] of Object.entries(PROVIDERS)) {
    assert.equal(p.id, key);
    assert.equal(typeof p.name, 'string');
    assert.match(p.authUrl, /^https:\/\//);
    assert.match(p.tokenUrl, /^https:\/\//);
    assert.ok(Array.isArray(p.scopes) && p.scopes.length > 0);
    assert.match(p.clientIdKey, /^[A-Z_]+$/);
    assert.match(p.clientSecretKey, /^[A-Z_]+$/);
    assert.ok(!JSON.stringify(p).includes(ACCESS));
  }
});

test('tur13/oauth 2: PKCE challenge = base64url(sha256(verifier))', () => {
  assert.equal(pkceChallenge(VERIFIER),
    crypto.createHash('sha256').update(VERIFIER, 'utf8').digest('base64url'));
  assert.match(pkceChallenge(VERIFIER), /^[A-Za-z0-9_-]{43}$/);
});

test('tur13/oauth 3: timeout sabiti 120000 ms', () => {
  assert.equal(OAUTH_TIMEOUT_MS, 120000);
});

test('tur13/oauth 4: begin gerçek loopback dinleyici açar ve authUrl PKCE taşır', async (t) => {
  const { svc } = make(t);
  const res = await svc.begin({ providerId: 'github', accountId: 'acct-1' });
  const url = new URL(res.redirectUri);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(Number(url.port) > 0, `port > 0 olmalı: ${url.port}`);
  assert.equal(url.pathname, '/oauth/callback');
  assert.equal(res.flowId, 'flow-1');

  const auth = new URL(res.authUrl);
  assert.equal(auth.searchParams.get('response_type'), 'code');
  assert.equal(auth.searchParams.get('client_id'), 'client-id');
  assert.equal(auth.searchParams.get('redirect_uri'), res.redirectUri);
  assert.equal(auth.searchParams.get('code_challenge'), pkceChallenge(VERIFIER));
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('state'), STATE);

  /* Gerçek istek: yalnız 127.0.0.1. Küçük HTML döner ve sunucu kapanır. */
  const html = await httpGet(`${res.redirectUri}?code=CODE1&state=${STATE}`);
  assert.match(html, /Bağlantı tamam/);
  await new Promise((r) => setTimeout(r, 80));
  await assert.rejects(() => httpGet(res.redirectUri));
});

test('tur13/oauth 5: state uyuşmazlığı E_OAUTH_STATE', async (t) => {
  const { svc } = make(t);
  const res = await svc.begin({ providerId: 'github', accountId: 'acct-2' });
  await httpGet(`${res.redirectUri}?code=CODE1&state=WRONG_STATE_VALUE`);
  await assert.rejects(
    () => svc.complete({ flowId: res.flowId, code: 'CODE1' }),
    (err) => err.code === 'E_OAUTH_STATE'
  );
});

test('tur13/oauth 6: access_denied → E_OAUTH_DENIED', async (t) => {
  const { svc } = make(t);
  const res = await svc.begin({ providerId: 'gmail', accountId: 'acct-3' });
  await httpGet(`${res.redirectUri}?error=access_denied`);
  await assert.rejects(
    () => svc.complete({ flowId: res.flowId, code: 'CODE1' }),
    (err) => err.code === 'E_OAUTH_DENIED'
  );
});

test('tur13/oauth 7: timeout sonrası E_OAUTH_TIMEOUT ve sunucu kapanır', async (t) => {
  const { svc } = make(t, { timeoutMs: 40 });
  const res = await svc.begin({ providerId: 'github', accountId: 'acct-4' });
  await new Promise((r) => setTimeout(r, 120));
  await assert.rejects(
    () => svc.complete({ flowId: res.flowId, code: 'CODE1' }),
    (err) => err.code === 'E_OAUTH_TIMEOUT'
  );
  await assert.rejects(() => httpGet(res.redirectUri));
});

test('tur13/oauth 8: safeStorage yoksa E_NO_SAFE_STORAGE (düz metin yazılmaz)', async (t) => {
  const { svc, dir } = make(t, { safeStorage: null });
  await assert.rejects(
    () => svc.begin({ providerId: 'github', accountId: 'acct-5' }),
    (err) => err.code === 'E_NO_SAFE_STORAGE'
  );
  assert.throws(() => svc.status({ accountId: 'acct-5' }), (err) => err.code === 'E_NO_SAFE_STORAGE');
  assert.equal(fs.existsSync(path.join(dir, 'oauth')), false);
});

test('tur13/oauth 9: complete token değişimi şifreli yazar, dönüşte token yok', async (t) => {
  const { svc, dir, fetchCalls } = make(t);
  const begun = await svc.begin({ providerId: 'github', accountId: 'acct-6' });
  const result = await svc.complete({ flowId: begun.flowId, code: 'CODE1' });

  assert.equal(result.ok, true);
  assert.equal(result.accountId, 'acct-6');
  assert.equal(result.providerId, 'github');
  assert.ok(result.expiresAt > Date.now());
  assert.deepStrictEqual(Object.keys(result).sort(),
    ['accountId', 'expiresAt', 'ok', 'providerId', 'scopes']);
  assert.ok(!JSON.stringify(result).includes(ACCESS));
  assert.ok(!JSON.stringify(result).includes(REFRESH));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].params.grant_type, 'authorization_code');
  assert.equal(fetchCalls[0].params.code_verifier, VERIFIER);
  assert.equal(fetchCalls[0].params.code, 'CODE1');

  const raw = fs.readFileSync(path.join(dir, 'oauth', 'acct-6.bin'), 'utf8');
  assert.ok(!raw.includes(ACCESS), 'diskte düz metin access token');
  assert.ok(!raw.includes(REFRESH), 'diskte düz metin refresh token');
});

test('tur13/oauth 10: status çıktısında token/kod/verifier anahtarı yok', async (t) => {
  const { svc } = make(t);
  const begun = await svc.begin({ providerId: 'gmail', accountId: 'acct-7' });
  await svc.complete({ flowId: begun.flowId, code: 'CODE1' });
  const status = svc.status({ accountId: 'acct-7', providerId: 'gmail' });
  assert.deepStrictEqual(Object.keys(status).sort(), ['connected', 'expiresAt', 'scopes']);
  assert.equal(status.connected, true);
  const json = JSON.stringify(status);
  for (const forbidden of ['token', 'code', 'verifier', 'secret', ACCESS, REFRESH]) {
    assert.ok(!json.toLowerCase().includes(forbidden.toLowerCase()), `status sızdırıyor: ${forbidden}`);
  }
  assert.deepStrictEqual(svc.status({ accountId: 'acct-7', providerId: 'github' }),
    { connected: false, expiresAt: null, scopes: [] });
});

test('tur13/oauth 11: refresh yeni token yazar; revoke dosyayı siler', async (t) => {
  const { svc, dir, fetchCalls } = make(t);
  const begun = await svc.begin({ providerId: 'github', accountId: 'acct-8' });
  await svc.complete({ flowId: begun.flowId, code: 'CODE1' });

  const refreshed = await svc.refresh({ accountId: 'acct-8' });
  assert.equal(fetchCalls[1].params.grant_type, 'refresh_token');
  assert.equal(refreshed.ok, true);
  assert.ok(!JSON.stringify(refreshed).includes(ACCESS));

  const removed = svc.revoke({ accountId: 'acct-8' });
  assert.equal(removed.revoked, true);
  assert.equal(fs.existsSync(path.join(dir, 'oauth', 'acct-8.bin')), false);
  assert.equal(svc.status({ accountId: 'acct-8' }).connected, false);
});
