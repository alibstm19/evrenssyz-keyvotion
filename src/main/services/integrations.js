'use strict';

/*
 * T-120 — Entegrasyon çekirdeği (IPC YOK).
 *
 * Sır yalnız main prosesinde tutulur: token/fields safeStorage ile şifrelenip
 * .keyvotion/integrations.json içine base64 olarak yazılır. list/capabilities/
 * test/invoke çıktısında token DEGERİ hiçbir zaman görünmez (API-30 / §7).
 *
 * Ağ yalnız burada, enjekte edilen fetchImpl ile yapılır. Host beyaz listesi
 * katalogdadır; https zorunludur (tek istisna: allowInsecureLoopback + 127.0.0.1).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const VERSION = 1;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function makeError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function emptyState() {
  return { version: VERSION, accounts: [] };
}

/** Dosya yok / bozuk / beklenmeyen biçim → boş durum, asla fırlatmaz. */
function readState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const accounts = Array.isArray(parsed && parsed.accounts)
      ? parsed.accounts.filter((a) => a && typeof a.id === 'string' && typeof a.providerId === 'string')
      : [];
    return { version: VERSION, accounts };
  } catch {
    return emptyState();
  }
}

/** Atomik yazım: .tmp → renameSync (Windows'ta mevcut dosyanın üstüne yazar). */
function writeState(statePath, data) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, statePath);
}

function requireCipher(safeStorage) {
  if (!safeStorage
    || typeof safeStorage.isEncryptionAvailable !== 'function'
    || safeStorage.isEncryptionAvailable() !== true
    || typeof safeStorage.encryptString !== 'function'
    || typeof safeStorage.decryptString !== 'function') {
    throw makeError('E_FORBIDDEN', 'Şifreleme bu sistemde kullanılamıyor; kayıt yapılmaz.');
  }
}

function encrypt(safeStorage, value) {
  const buf = safeStorage.encryptString(value);
  if (!buf || typeof buf.toString !== 'function') throw makeError('E_FORBIDDEN', 'Şifreleme çıktısı geçersiz.');
  return buf.toString('base64');
}

function decrypt(safeStorage, cipher) {
  const buf = Buffer.from(String(cipher || ''), 'base64');
  const out = safeStorage.decryptString(buf);
  return typeof out === 'string' ? out : String(out == null ? '' : out);
}

function fillTemplate(template, values, rawKeys) {
  return String(template == null ? '' : template).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key) || values[key] === undefined || values[key] === null) return match;
    const value = values[key];
    if (rawKeys && rawKeys.has(key)) return String(value);
    return encodeURIComponent(String(value));
  });
}

function fillBody(body, values) {
  if (body === undefined || body === null) return undefined;
  const walk = (node) => {
    if (typeof node === 'string') {
      return node.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
      ));
    }
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(node)) out[key] = walk(value);
      return out;
    }
    return node;
  };
  return walk(body);
}

function validateParams(schema, input) {
  const defs = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const key of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(defs, key)) {
      throw makeError('E_BAD_REQUEST', `Bilinmeyen parametre: ${key}`);
    }
  }
  const out = {};
  for (const [key, spec] of Object.entries(defs)) {
    const rule = spec && typeof spec === 'object' ? spec : { type: 'string' };
    let value = src[key];
    if (value === undefined) {
      if (Object.prototype.hasOwnProperty.call(rule, 'default')) out[key] = rule.default;
      continue;
    }
    const type = rule.type || 'string';
    if (type === 'number' || type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw makeError('E_BAD_REQUEST', `Parametre sayı olmalı: ${key}`);
      }
      if (type === 'integer' && !Number.isInteger(value)) {
        throw makeError('E_BAD_REQUEST', `Parametre tamsayı olmalı: ${key}`);
      }
      if (rule.max !== undefined && value > rule.max) throw makeError('E_BAD_REQUEST', `Parametre üst sınırı aştı: ${key}`);
      if (rule.min !== undefined && value < rule.min) throw makeError('E_BAD_REQUEST', `Parametre alt sınırı aştı: ${key}`);
    } else if (type === 'string') {
      if (typeof value !== 'string') throw makeError('E_BAD_REQUEST', `Parametre metin olmalı: ${key}`);
      if (rule.max !== undefined && value.length > rule.max) throw makeError('E_BAD_REQUEST', `Parametre çok uzun: ${key}`);
    } else if (type === 'boolean') {
      if (typeof value !== 'boolean') throw makeError('E_BAD_REQUEST', `Parametre mantıksal olmalı: ${key}`);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Katalog path'i ya mutlak URL ya da hosts[0] üzerine göreli yoldur.
 * Sonuç her zaman mutlak URL'dir; host/semiz denetimi burada yapılır.
 */
function resolveUrl(provider, rawPath, values, allowInsecureLoopback) {
  const filled = fillTemplate(rawPath, values, new Set(['token']));
  if (/\{[A-Za-z0-9_]+\}/.test(filled)) {
    throw makeError('E_BAD_REQUEST', 'Zorunlu parametre eksik.');
  }

  let url = filled;
  if (!/^https?:\/\//i.test(url)) {
    const host = String((provider.hosts || [])[0] || '');
    const hostLower = host.toLowerCase();
    const isLoopbackHost = [...LOOPBACK].some((h) => hostLower === h || hostLower.startsWith(`${h}:`));
    const scheme = isLoopbackHost && allowInsecureLoopback === true ? 'http' : 'https';
    url = `${scheme}://${host}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  let parsed;
  try { parsed = new URL(url); } catch { throw makeError('E_BAD_REQUEST', 'Geçersiz hedef adres.'); }
  if (parsed.username || parsed.password) throw makeError('E_FORBIDDEN', 'URL kimlik bilgisi taşıyamaz.');

  const hostname = parsed.hostname.toLowerCase();
  const insecureOk = allowInsecureLoopback === true && LOOPBACK.has(hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && insecureOk)) {
    throw makeError('E_FORBIDDEN', 'Yalnız https adreslerine istek yapılabilir.');
  }

  const allowed = (Array.isArray(provider.hosts) ? provider.hosts : [])
    .map((h) => String(h).replace(/:\d+$/, '').toLowerCase())
    .filter(Boolean);
  if (!allowed.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
    throw makeError('E_FORBIDDEN', 'Hedef host izin listesinde değil.');
  }
  return parsed.toString();
}

function authHeaders(auth, token) {
  const headers = { accept: 'application/json' };
  if (!auth || auth.kind === 'none') return headers;
  if (auth.kind === 'bearer') {
    const prefix = auth.prefix === undefined ? 'Bearer ' : String(auth.prefix);
    headers[auth.header || 'Authorization'] = `${prefix}${token}`;
  } else if (auth.kind === 'header') {
    headers[auth.header || 'X-API-Key'] = token;
  } else if (auth.kind === 'basic') {
    const user = auth.user === undefined ? '' : String(auth.user);
    headers[auth.header || 'Authorization'] = `Basic ${Buffer.from(`${user}:${token}`, 'utf8').toString('base64')}`;
  }
  if (auth.headers && typeof auth.headers === 'object' && !Array.isArray(auth.headers)) {
    for (const [key, value] of Object.entries(auth.headers)) headers[key] = String(value);
  }
  return headers;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * @param {{catalogPath:string, statePath:string, safeStorage?:object,
 *          fetchImpl?:Function, allowInsecureLoopback?:boolean, onEvent?:Function}} opts
 */
function createIntegrationsService(opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const catalogPath = options.catalogPath;
  const statePath = options.statePath;
  const safeStorage = options.safeStorage || null;
  const allowInsecureLoopback = options.allowInsecureLoopback === true;
  const netFetch = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;

  const inFlight = new Set();

  function loadCatalog() {
    try {
      const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function findProvider(providerId) {
    return loadCatalog().find((p) => p && p.id === providerId) || null;
  }

  function findAccount(id) {
    return readState(statePath).accounts.find((a) => a.id === id) || null;
  }

  function emit(packet) {
    if (!onEvent) return;
    try { onEvent(packet); } catch { /* dinleyici servisi bozmasın */ }
  }

  function accountView(account, provider) {
    return {
      id: account.id,
      providerId: account.providerId,
      label: account.label,
      state: account.state || 'unknown',
      scopes: provider && Array.isArray(provider.scopes) ? provider.scopes.slice() : [],
      lastTestAt: account.lastTestAt || null
    };
  }

  /* ------------------------------------------------------------- okuma */

  function list() {
    const catalog = loadCatalog();
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const accounts = readState(statePath).accounts.map((a) => accountView(a, byId.get(a.providerId)));
    return { catalog, accounts, catalogPath };
  }

  function capabilities(input) {
    const providerId = input && input.providerId;
    const provider = findProvider(providerId);
    if (!provider) throw makeError('E_NOT_FOUND', 'Sağlayıcı katalogda yok.');
    // Kopya döndür (çağıran kataloğu mutasyona uğratmasın); sır yok.
    return {
      providerId,
      capabilities: (Array.isArray(provider.capabilities) ? provider.capabilities : []).map((c) => ({ ...c }))
    };
  }

  /* ------------------------------------------------------------- yazma */

  function save(input) {
    const req = input && typeof input === 'object' ? input : {};
    const providerId = req.providerId;
    if (!findProvider(providerId)) throw makeError('E_NOT_FOUND', 'Sağlayıcı katalogda yok.');

    // Şifreleme YOKSA hiçbir disk yazımı yapılmaz, düz metin fallback YOK.
    requireCipher(safeStorage);

    const token = typeof req.token === 'string' ? req.token : '';
    const fields = req.fields && typeof req.fields === 'object' && !Array.isArray(req.fields) ? req.fields : {};
    const tokenCipher = encrypt(safeStorage, token);
    const fieldsCipher = encrypt(safeStorage, JSON.stringify(fields));

    const state = readState(statePath);
    const taken = new Set(state.accounts.map((a) => a.id));
    let id;
    do {
      id = `${providerId}-${crypto.randomBytes(4).toString('hex')}`;
    } while (taken.has(id));

    state.accounts.push({
      id,
      providerId,
      label: typeof req.label === 'string' && req.label.trim() ? req.label.trim().slice(0, 80) : String(providerId),
      tokenCipher,
      fieldsCipher,
      createdAt: new Date().toISOString(),
      lastTestAt: null,
      state: 'unknown'
    });
    writeState(statePath, state);
    emit({ type: 'state', id, state: 'unknown' });
    emit({ type: 'log', id, message: `saved ${providerId}` });
    return { id, state: 'unknown' };
  }

  function remove(input) {
    const id = input && input.id;
    const state = readState(statePath);
    const before = state.accounts.length;
    state.accounts = state.accounts.filter((a) => a.id !== id);
    if (state.accounts.length === before) throw makeError('E_NOT_FOUND', 'Hesap bulunamadı.');
    writeState(statePath, state);
    emit({ type: 'state', id, state: 'removed' });
    emit({ type: 'log', id, message: 'removed' });
    return { id, removed: true };
  }

  /* ------------------------------------------------------------- ağ */

  function secretsOf(account) {
    requireCipher(safeStorage);
    let fields = {};
    try { fields = JSON.parse(decrypt(safeStorage, account.fieldsCipher)) || {}; } catch { fields = {}; }
    if (typeof fields !== 'object' || Array.isArray(fields)) fields = {};
    return { token: decrypt(safeStorage, account.tokenCipher), fields };
  }

  function ensureFetch() {
    if (typeof netFetch !== 'function') throw makeError('E_INTERNAL', 'Ağ katmanı hazır değil.');
  }

  function checkSize(response) {
    const declared = Number(response && response.headers && response.headers.get && response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      void response.body?.cancel?.().catch(() => {});
      throw makeError('E_BAD_REQUEST', 'Yanıt 4 MB sınırını aşıyor.');
    }
  }

  async function readBody(response) {
    if (!response.body) {
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') <= MAX_RESPONSE_BYTES) return text;
      throw makeError('E_BAD_REQUEST', 'Yanıt 4 MB sınırını aşıyor.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        throw makeError('E_BAD_REQUEST', 'Yanıt 4 MB sınırını aşıyor.');
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  }

  /** test/invoke ortak isteği: ağ isteği, gerçek fetch. */
  async function perform(provider, { pathTemplate, verb, bodyTemplate, values, extraHeaders }) {
    ensureFetch();
    const url = resolveUrl(provider, pathTemplate, values, allowInsecureLoopback);
    const headers = authHeaders(provider.auth, values.token);
    if (extraHeaders) Object.assign(headers, extraHeaders);
    const bodyValue = fillBody(bodyTemplate, values);
    const method = String(verb || 'GET').toUpperCase();
    const init = { method, headers, redirect: 'error', signal: AbortSignal.timeout(15_000) };
    if (bodyValue !== undefined && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof bodyValue === 'string' ? bodyValue : JSON.stringify(bodyValue);
      if (!headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json';
    }
    const response = await netFetch(url, init);
    return { response };
  }

  async function test(input) {
    const id = input && input.id;
    const account = findAccount(id);
    if (!account) throw makeError('E_NOT_FOUND', 'Hesap bulunamadı.');
    const provider = findProvider(account.providerId);
    if (!provider) throw makeError('E_NOT_FOUND', 'Sağlayıcı katalogda yok.');
    if (!provider.health || typeof provider.health !== 'object') throw makeError('E_BAD_REQUEST', 'Sağlayıcıda health tanımı yok.');

    const { token, fields } = secretsOf(account);
    const values = { ...fields, token };
    const health = provider.health;
    const expect = Array.isArray(health.expect) ? health.expect : [200];

    const task = (async () => {
      const started = performance.now();
      let status = null;
      let state;
      try {
        const { response } = await perform(provider, {
          pathTemplate: health.path,
          verb: health.verb || 'GET',
          bodyTemplate: health.body,
          values,
          extraHeaders: health.headers
        });
        status = response.status;
        checkSize(response);
        await readBody(response);
        state = expect.includes(status) ? 'connected' : (status >= 400 ? 'error' : 'degraded');
      } catch (error) {
        state = 'error';
        if (error && ['E_BAD_REQUEST', 'E_FORBIDDEN', 'E_INTERNAL'].includes(error.code)) throw error;
        status = null;
      }
      const latencyMs = Math.round((performance.now() - started) * 100) / 100;

      // Durumu diske yaz (atomik) — ISO lastTestAt, token YOK.
      const current = readState(statePath);
      const target = current.accounts.find((a) => a.id === id);
      if (target) {
        target.state = state;
        target.lastTestAt = new Date().toISOString();
        writeState(statePath, current);
      }
      emit({ type: 'state', id, state });
      emit({ type: 'log', id, message: `health ${provider.id} → ${state} (HTTP ${status == null ? 'none' : status})` });
      return { id, state, latencyMs, detail: status };
    })();

    inFlight.add(task);
    try { return await task; } finally { inFlight.delete(task); }
  }

  async function invoke(input) {
    const req = input && typeof input === 'object' ? input : {};
    const id = req.id;
    const account = findAccount(id);
    if (!account) throw makeError('E_NOT_FOUND', 'Hesap bulunamadı.');
    const provider = findProvider(account.providerId);
    if (!provider) throw makeError('E_NOT_FOUND', 'Sağlayıcı katalogda yok.');

    const listOfCaps = Array.isArray(provider.capabilities) ? provider.capabilities : [];
    const capability = listOfCaps.find((c) => c && c.id === req.capability);
    if (!capability) throw makeError('E_BAD_REQUEST', 'Yetenek katalogda tanımlı değil.');

    const params = validateParams(capability.params, req.params);
    const { token, fields } = secretsOf(account);
    const values = { ...fields, token, ...params };

    const task = (async () => {
      let result;
      let state = 'error';
      try {
        const { response } = await perform(provider, {
          pathTemplate: capability.path,
          verb: capability.verb || 'GET',
          bodyTemplate: capability.body,
          values
        });
        checkSize(response);
        const text = await readBody(response);
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        result = { ok: response.ok, status: response.status, data };
        state = response.ok ? 'connected' : 'error';
      } catch (error) {
        // Doğrulama/kural hataları (host, şema, boyut) çağırana fırlatılır;
        // yalnız gerçek ağ/ayrıştırma hataları {ok:false} olarak döner.
        if (error && ['E_BAD_REQUEST', 'E_FORBIDDEN', 'E_INTERNAL'].includes(error.code)) {
          emit({ type: 'state', id, state });
          throw error;
        }
        result = { ok: false, status: null, data: { raw: '' } };
        state = 'error';
      }
      emit({ type: 'state', id, state });
      emit({ type: 'log', id, message: `invoke ${provider.id}/${capability.id} → ${state}` });
      return result;
    })();

    inFlight.add(task);
    try { return await task; } finally { inFlight.delete(task); }
  }

  function shutdown() {
    if (!inFlight.size) return Promise.resolve();
    return Promise.allSettled([...inFlight]).then(() => undefined);
  }

  return { list, save, remove, test, capabilities, invoke, shutdown };
}

module.exports = { createIntegrationsService };
