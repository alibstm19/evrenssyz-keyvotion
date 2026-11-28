'use strict';

/**
 * T-137 — OAuth2 yetki kodu + PKCE (S256) servisi.
 *
 * Sır main sürecinde kalır: access/refresh token yalnız safeStorage ile
 * şifrelenip <userData>/oauth/<accountId>.bin dosyasına yazılır. Dönen
 * hiçbir nesnede, logda veya hata mesajında token/kod/verifier DEGERİ yoktur.
 *
 * Harici bağımlılık YOK: yalnız Node çekirdek modülleri kullanılır.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { URL, URLSearchParams } = require('node:url');

/** 120 000 ms — sözleşme sabiti (testler bu değeri okur). */
const OAUTH_TIMEOUT_MS = 120000;

/**
 * Sağlayıcı tanımları. İstemci kimliği/parolası KODDA YOKTUR; yalnızca
 * `clientIdKey` / `clientSecretKey` ile safeStorage kaydından aranır.
 */
const PROVIDERS = Object.freeze({
  gmail: Object.freeze({
    id: 'gmail',
    name: 'Gmail',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: Object.freeze(['https://www.googleapis.com/auth/gmail.readonly']),
    clientIdKey: 'OAUTH_GMAIL_CLIENT_ID',
    clientSecretKey: 'OAUTH_GMAIL_CLIENT_SECRET'
  }),
  'google-drive': Object.freeze({
    id: 'google-drive',
    name: 'Google Drive',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: Object.freeze(['https://www.googleapis.com/auth/drive.readonly']),
    clientIdKey: 'OAUTH_GOOGLE_DRIVE_CLIENT_ID',
    clientSecretKey: 'OAUTH_GOOGLE_DRIVE_CLIENT_SECRET'
  }),
  'google-calendar': Object.freeze({
    id: 'google-calendar',
    name: 'Google Calendar',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: Object.freeze(['https://www.googleapis.com/auth/calendar.readonly']),
    clientIdKey: 'OAUTH_GOOGLE_CALENDAR_CLIENT_ID',
    clientSecretKey: 'OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET'
  }),
  github: Object.freeze({
    id: 'github',
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: Object.freeze(['read:user', 'repo']),
    clientIdKey: 'OAUTH_GITHUB_CLIENT_ID',
    clientSecretKey: 'OAUTH_GITHUB_CLIENT_SECRET'
  })
});

const OAUTH_ERRORS = Object.freeze({
  E_NO_SAFE_STORAGE: 'Şifreleme bu sistemde kullanılamıyor.',
  E_OAUTH_TIMEOUT: 'OAuth onayı zaman aşımına uğradı.',
  E_OAUTH_STATE: 'OAuth durum doğrulaması başarısız.',
  E_OAUTH_DENIED: 'OAuth erişimi reddedildi.',
  E_OAUTH_FLOW: 'OAuth akışı geçersiz veya tamamlanmadı.',
  E_OAUTH_PROVIDER: 'OAuth sağlayıcısı bilinmiyor.',
  E_OAUTH_CLIENT_CONFIG: 'OAuth istemci yapılandırması eksik.',
  E_OAUTH_TOKEN: 'OAuth token değişimi başarısız.',
  E_OAUTH_BUSY: 'Bu hesap için zaten bekleyen bir OAuth akışı var.'
});

/** Sabit, değer içermeyen hata. Kod/token/verifier ASLA mesaja girmez. */
function makeError(code) {
  const err = new Error(OAUTH_ERRORS[code] || 'OAuth hatası.');
  err.code = code;
  return err;
}

/** PKCE S256: challenge = base64url(sha256(verifier)). */
function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier), 'utf8').digest('base64url');
}

function requireCipher(safeStorage) {
  if (!safeStorage
    || typeof safeStorage.isEncryptionAvailable !== 'function'
    || safeStorage.isEncryptionAvailable() !== true
    || typeof safeStorage.encryptString !== 'function'
    || typeof safeStorage.decryptString !== 'function') {
    throw makeError('E_NO_SAFE_STORAGE');
  }
}

function validAccountId(accountId) {
  return typeof accountId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(accountId);
}

/** Varsayılan token POST'u — yalnız node:https (ve yerel http testleri). */
function defaultFetchImpl(tokenUrl, params) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(tokenUrl); } catch { reject(makeError('E_OAUTH_TOKEN')); return; }
    const body = new URLSearchParams(params).toString();
    const transport = target.protocol === 'http:' ? http : https;
    const req = transport.request(target, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: 'application/json, application/x-www-form-urlencoded',
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
        if (Buffer.byteLength(raw) > 256 * 1024) req.destroy(makeError('E_OAUTH_TOKEN'));
      });
      res.on('error', () => reject(makeError('E_OAUTH_TOKEN')));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || parsed.error || !parsed.access_token) { reject(makeError('E_OAUTH_TOKEN')); return; }
          resolve(parsed);
        } catch {
          /* GitHub form yanıtı dönebilir: access_token=...&... */
          try {
            const form = new URLSearchParams(raw);
            const accessToken = form.get('access_token');
            if (!accessToken || form.get('error')) { reject(makeError('E_OAUTH_TOKEN')); return; }
            resolve({ access_token: accessToken, refresh_token: form.get('refresh_token') || null,
              expires_in: form.get('expires_in') ? Number(form.get('expires_in')) : null,
              scope: form.get('scope') || '' });
          } catch { reject(makeError('E_OAUTH_TOKEN')); }
        }
      });
    });
    req.on('error', () => reject(makeError('E_OAUTH_TOKEN')));
    req.write(body);
    req.end();
  });
}

/**
 * @param {{safeStorage?:object, userDataDir:string, getCredentials?:function,
 *          fetchImpl?:function, onEvent?:function, timeoutMs?:number,
 *          pkceFactory?:function, stateFactory?:function, flowIdFactory?:function,
 *          serverFactory?:function}} options
 */
function createOAuthService(options = {}) {
  const safeStorage = options.safeStorage || null;
  const userDataDir = String(options.userDataDir || '');
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : OAUTH_TIMEOUT_MS;
  const getCredentials = typeof options.getCredentials === 'function'
    ? options.getCredentials
    : (_id, provider) => ({
      clientId: process.env[provider.clientIdKey] || null,
      clientSecret: process.env[provider.clientSecretKey] || null
    });
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : defaultFetchImpl;
  const serverFactory = typeof options.serverFactory === 'function' ? options.serverFactory : http.createServer;
  const flows = new Map();
  const oauthDir = path.join(userDataDir, 'oauth');

  function accountPath(accountId) {
    return path.join(oauthDir, `${accountId}.bin`);
  }

  function emit(type, extra) {
    onEvent(Object.assign({ type, at: new Date().toISOString() }, extra || {}));
  }

  function readRecord(accountId) {
    try {
      const raw = fs.readFileSync(accountPath(accountId), 'utf8');
      const buf = Buffer.from(String(raw).trim(), 'base64');
      const json = safeStorage.decryptString(buf);
      const rec = JSON.parse(String(json));
      return rec && typeof rec === 'object' ? rec : null;
    } catch {
      return null;
    }
  }

  function writeRecord(accountId, rec) {
    const cipher = safeStorage.encryptString(JSON.stringify(rec));
    if (!cipher || typeof cipher.toString !== 'function') throw makeError('E_NO_SAFE_STORAGE');
    fs.mkdirSync(oauthDir, { recursive: true });
    const target = accountPath(accountId);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, cipher.toString('base64'), 'utf8');
    fs.renameSync(tmp, target);
  }

  function credentialsFor(provider) {
    let creds;
    try { creds = getCredentials(provider.id, provider) || {}; } catch { throw makeError('E_OAUTH_CLIENT_CONFIG'); }
    if (!creds.clientId || !creds.clientSecret) throw makeError('E_OAUTH_CLIENT_CONFIG');
    return creds;
  }

  function safeSummary(rec) {
    return {
      ok: true,
      accountId: rec.accountId,
      providerId: rec.providerId,
      scopes: Array.isArray(rec.scopes) ? rec.scopes.slice() : [],
      expiresAt: rec.expiresAt === undefined ? null : rec.expiresAt
    };
  }

  function closeFlow(flow) {
    if (flow.timer) { clearTimeout(flow.timer); flow.timer = null; }
    if (flow.server) { try { flow.server.close(); } catch { /* zaten kapalı */ } flow.server = null; }
  }

  /** http.createServer ile 127.0.0.1:0 üzerinde tek istek dinleyicisi. */
  async function begin(input = {}) {
    requireCipher(safeStorage);
    const providerId = String(input.providerId || '');
    const accountId = input.accountId;
    const provider = PROVIDERS[providerId];
    if (!provider) throw makeError('E_OAUTH_PROVIDER');
    if (!validAccountId(accountId)) throw makeError('E_OAUTH_FLOW');
    for (const flow of flows.values()) {
      if (flow.accountId === accountId && !flow.settled && !flow.error) throw makeError('E_OAUTH_BUSY');
    }

    const creds = credentialsFor(provider);
    const verifier = options.pkceFactory
      ? String(options.pkceFactory())
      : crypto.randomBytes(32).toString('base64url');
    const state = options.stateFactory
      ? String(options.stateFactory())
      : crypto.randomBytes(32).toString('base64url');
    const flowId = options.flowIdFactory
      ? String(options.flowIdFactory())
      : (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

    const flow = {
      flowId, accountId, providerId, redirectUri: null,
      verifier, state, code: null, settled: false, error: null,
      server: null, timer: null, onConnected: input.onConnected
    };

    const server = serverFactory((req, res) => {
      let parsed;
      try { parsed = new URL(req.url || '/', flow.redirectUri || 'http://127.0.0.1/'); }
      catch { res.writeHead(400); res.end('bad request'); closeFlow(flow); return; }

      if (parsed.pathname !== '/oauth/callback') {
        res.writeHead(404); res.end('not found');
        return;
      }

      if (flow.settled || flow.error) {
        res.writeHead(409); res.end('already handled'); return;
      }
      {
        const got = String(parsed.searchParams.get('state') || '');
        const want = flow.state;
        let match = false;
        try {
          const a = Buffer.from(got);
          const b = Buffer.from(want);
          match = a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch { match = false; }
        if (!match) {
          flow.error = makeError('E_OAUTH_STATE');
        } else if (parsed.searchParams.has('error')) {
          flow.error = makeError('E_OAUTH_DENIED');
        } else {
          flow.code = parsed.searchParams.get('code');
          if (!flow.code) flow.error = makeError('E_OAUTH_FLOW');
          else flow.settled = true;
        }
      }

      const html = '<!doctype html><html lang="tr"><meta charset="utf-8">'
        + '<title>Keyvotion</title><p>'
        + (flow.error ? 'Onay tamamlanmadı. Keyvotion’a dön ve yeniden dene.'
          : 'Onay alındı. Bağlantı durumunu görmek için Keyvotion’a dön.')
        + '</p></html>';
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer'
      });
      res.end(html, () => closeFlow(flow));
      emit('oauth:callback', { flowId, accountId, providerId, ok: !flow.error });
    });
    flow.server = server;

    const redirectUri = new Promise((resolve, reject) => {
      server.once('error', () => { flow.error = makeError('E_OAUTH_FLOW'); reject(makeError('E_OAUTH_FLOW')); });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = address && typeof address === 'object' ? address.port : 0;
        flow.redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
        flows.set(flowId, flow);
        emit('oauth:begin', { flowId, accountId, providerId });
        resolve(flow.redirectUri);
      });
    });

    /* Timeout: sunucuyu kapat, akışı E_OAUTH_TIMEOUT ile işaretle. */
    flow.timer = setTimeout(() => {
      if (!flow.settled && !flow.error) {
        flow.error = makeError('E_OAUTH_TIMEOUT');
        emit('oauth:timeout', { flowId, accountId, providerId });
      }
      closeFlow(flow);
    }, timeoutMs);
    if (typeof flow.timer.unref === 'function') flow.timer.unref();

    return redirectUri.then((redirect) => {
      const auth = new URL(provider.authUrl);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('client_id', creds.clientId);
      auth.searchParams.set('redirect_uri', redirect);
      auth.searchParams.set('scope', provider.scopes.join(' '));
      auth.searchParams.set('state', state);
      auth.searchParams.set('code_challenge', pkceChallenge(verifier));
      auth.searchParams.set('code_challenge_method', 'S256');
      return { flowId, authUrl: auth.toString(), redirectUri: redirect };
    });
  }

  async function complete(input = {}) {
    requireCipher(safeStorage);
    const flowId = String(input.flowId || '');
    const flow = flows.get(flowId);
    if (!flow) throw makeError('E_OAUTH_FLOW');
    if (flow.error) { const err = flow.error; closeFlow(flow); flows.delete(flowId); throw err; }
    const code = typeof input.code === 'string' && input.code ? input.code : flow.code;
    if (!code) throw makeError('E_OAUTH_FLOW');

    const provider = PROVIDERS[flow.providerId];
    const creds = credentialsFor(provider);
    closeFlow(flow);

    let token;
    try {
      token = await fetchImpl(provider.tokenUrl, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: flow.redirectUri,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code_verifier: flow.verifier
      });
    } catch (err) {
      flows.delete(flowId);
      if (err && err.code && OAUTH_ERRORS[err.code]) throw err;
      throw makeError('E_OAUTH_TOKEN');
    }
    if (!token || !token.access_token) { flows.delete(flowId); throw makeError('E_OAUTH_TOKEN'); }

    const expiresIn = Number(token.expires_in);
    const rec = {
      accountId: flow.accountId,
      providerId: flow.providerId,
      scopes: flow.providerId && provider.scopes ? provider.scopes.slice() : [],
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null
    };
    try {
      writeRecord(flow.accountId, rec);
      if (typeof flow.onConnected === 'function') await flow.onConnected(safeSummary(rec));
    } finally {
      flows.delete(flowId);
    }
    emit('oauth:connected', { accountId: flow.accountId, providerId: flow.providerId });
    return safeSummary(rec);
  }

  function accessToken(accountId, providerId) {
    requireCipher(safeStorage);
    if (!validAccountId(accountId)) return '';
    const rec = readRecord(accountId);
    if (!rec || rec.providerId !== providerId || (rec.expiresAt != null && rec.expiresAt <= Date.now())) return '';
    return rec.accessToken || '';
  }

  function configured(providerId) {
    try {
      const provider = PROVIDERS[providerId];
      if (!provider) return false;
      credentialsFor(provider);
      return true;
    } catch { return false; }
  }

  function status(input = {}) {
    requireCipher(safeStorage);
    const accountId = input.accountId;
    if (!validAccountId(accountId)) return { connected: false, expiresAt: null, scopes: [] };
    const rec = readRecord(accountId);
    if (!rec) return { connected: false, expiresAt: null, scopes: [] };
    if (input.providerId && rec.providerId !== input.providerId) {
      return { connected: false, expiresAt: null, scopes: [] };
    }
    return { connected: rec.expiresAt == null || rec.expiresAt > Date.now(), expiresAt: rec.expiresAt === undefined ? null : rec.expiresAt,
      scopes: Array.isArray(rec.scopes) ? rec.scopes.slice() : [] };
  }

  async function refresh(input = {}) {
    requireCipher(safeStorage);
    const accountId = input.accountId;
    if (!validAccountId(accountId)) throw makeError('E_OAUTH_FLOW');
    const rec = readRecord(accountId);
    if (!rec || !rec.refreshToken) throw makeError('E_OAUTH_FLOW');
    const provider = PROVIDERS[rec.providerId];
    if (!provider) throw makeError('E_OAUTH_PROVIDER');
    const creds = credentialsFor(provider);
    let token;
    try {
      token = await fetchImpl(provider.tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: rec.refreshToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret
      });
    } catch (err) {
      if (err && err.code && OAUTH_ERRORS[err.code]) throw err;
      throw makeError('E_OAUTH_TOKEN');
    }
    if (!token || !token.access_token) throw makeError('E_OAUTH_TOKEN');
    const expiresIn = Number(token.expires_in);
    rec.accessToken = token.access_token;
    if (token.refresh_token) rec.refreshToken = token.refresh_token;
    rec.expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;
    writeRecord(accountId, rec);
    emit('oauth:refreshed', { accountId, providerId: rec.providerId });
    return safeSummary(rec);
  }

  function revoke(input = {}) {
    const accountId = input.accountId;
    if (!validAccountId(accountId)) throw makeError('E_OAUTH_FLOW');
    try { fs.rmSync(accountPath(accountId), { force: true }); } catch { /* dosya yok */ }
    try { fs.rmSync(`${accountPath(accountId)}.tmp`, { force: true }); } catch { /* dosya yok */ }
    for (const [id, flow] of [...flows.entries()]) {
      if (flow.accountId === accountId) { closeFlow(flow); flows.delete(id); }
    }
    emit('oauth:revoked', { accountId });
    return { ok: true, accountId, revoked: true };
  }

  function shutdown() {
    for (const [id, flow] of [...flows.entries()]) { closeFlow(flow); flows.delete(id); }
  }

  return { PROVIDERS, OAUTH_TIMEOUT_MS, begin, complete, status, refresh, revoke, shutdown, accessToken, configured };
}

module.exports = { PROVIDERS, OAUTH_TIMEOUT_MS, pkceChallenge, createOAuthService };
