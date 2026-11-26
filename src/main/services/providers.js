'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CODES, ok, fail, fromHttpStatus } = require('../../shared/errors');

/*
 * Saglayici entegrasyonu + COKLU API ANAHTARI ve OTOMATIK FAILOVER (T4-6).
 *
 * Sorun: tek anahtar limitlenince uygulama kilitleniyordu. Cozum: anahtar
 * oncelik listesi; 429 / kota / 401 / 403 / 5xx / ag hatasinda SIRADAKI
 * saglikli anahtara gec ve istegi BIR KEZ tekrar et.
 *
 * Sirlar: <userData>/keys.bin — safeStorage (DPAPI) ile sifreli JSON.
 * providers.json SIR TUTMAZ; yalniz maskeli kimlik yazar. Hata mesajinda
 * anahtar degeri ASLA gorunmez (API-03).
 *
 * Saglik durumu bellekte: {state:'ok'|'cooldown', until:epochMs}
 */

const PROVIDERS_FILE = 'providers.json';
const KEYS_FILE = 'keys.bin';
const RETRY_WINDOW_MS = 60 * 1000;

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Anahtari maskeler: `sk-proj-...9f2a` -> `sk-…9f2a` */
function maskKey(key) {
  const v = String(key || '');
  if (v.length <= 6) return '…' + v.slice(-2);
  return `${v.slice(0, 3)}…${v.slice(-4)}`;
}

function normalizeBaseURL(value) {
  const v = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(v)) return null;
  return v;
}

/**
 * Yerel (loopback) saglayici mi? Ollama gibi sunucular API anahtari istemez.
 * Yalniz 127.0.0.0/8, ::1 ve `localhost` kabul edilir; disari anahtarsiz
 * istek cikmaz.
 */
function isLoopbackBaseURL(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { return false; }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** opencode.json'dan varsayilan saglayici tohumu (varsa). */
function seedFromOpenCode() {
  try {
    const file = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const providers = parsed.providers || {};
    const out = [];
    for (const [id, p] of Object.entries(providers)) {
      const baseURL = normalizeBaseURL((p && p.settings && p.settings.baseURL) || (p && p.baseURL));
      if (!baseURL) continue;
      out.push({
        id: makeId('prv'),
        sourceKey: id,
        name: (p && p.name) || id,
        baseURL,
        models: Object.keys((p && p.models) || {}),
        enabled: true,
        keys: []
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {{baseDir: string, safeStorage: object, audit?: object, http?: object}} options
 *
 * NOT (API-01): ag cagrisi YAPMAZ. Anahtarli dis istek `http.requestExternal`
 * uzerinden gider; boylece "agi kullanan tek modul http-client.js" kurali
 * korunur ve burada yalniz anahtar secimi/failover mantigi kalir.
 */
function createProvidersService(options) {
  const baseDir = options.baseDir;
  const safeStorage = options.safeStorage;
  const audit = options.audit || { append() {} };
  const http = options.http || null;

  const providersPath = path.join(baseDir, PROVIDERS_FILE);
  const keysPath = path.join(baseDir, KEYS_FILE);

  /** keyId -> plaintext (yalniz bellekte, diskte sifreli) */
  let keyCache = null;
  /** keyId -> {state, until, reason, at} */
  const health = new Map();
  let storeCache = null;

  /* ------------------------------------------------------------- depolama */

  function loadProviders() {
    if (storeCache) return storeCache;
    try {
      const parsed = JSON.parse(fs.readFileSync(providersPath, 'utf8'));
      if (parsed && Array.isArray(parsed.providers)) {
        storeCache = { providers: parsed.providers.filter((p) => p && typeof p.id === 'string') };
        return storeCache;
      }
    } catch {
      // yok / bozuk
    }
    storeCache = { providers: seedFromOpenCode() };
    try {
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(providersPath, `${JSON.stringify(storeCache, null, 2)}\n`, 'utf8');
    } catch { /* salt okunur devam */ }
    return storeCache;
  }

  function saveProviders(data) {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(providersPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    storeCache = data;
  }

  function readKeys() {
    if (keyCache) return keyCache;
    keyCache = {};
    try {
      if (fs.existsSync(keysPath) && safeStorage && safeStorage.isEncryptionAvailable()) {
        const plain = safeStorage.decryptString(fs.readFileSync(keysPath));
        const parsed = JSON.parse(plain);
        if (parsed && typeof parsed === 'object') keyCache = parsed;
      }
    } catch {
      keyCache = {};
    }
    return keyCache;
  }

  function writeKeys(map) {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
      return fail(CODES.INTERNAL, 'Anahtar şifreleme bu sistemde kullanılamıyor (DPAPI yok).');
    }
    try {
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(keysPath, safeStorage.encryptString(JSON.stringify(map)));
    } catch {
      return fail(CODES.INTERNAL, 'Anahtar kaydedilemedi.');
    }
    keyCache = map;
    return null;
  }

  function findProvider(id) {
    return loadProviders().providers.find((p) => p.id === id) || null;
  }

  function healthOf(keyId) {
    const h = health.get(keyId);
    if (!h) return { state: 'ok', until: null, reason: null };
    if (h.state === 'cooldown' && h.until && Date.now() >= h.until) {
      health.set(keyId, { state: 'ok', until: null, reason: null, at: Date.now() });
      return { state: 'ok', until: null, reason: null };
    }
    return { state: h.state, until: h.until || null, reason: h.reason || null };
  }

  function coolDown(keyId, reason, ms) {
    health.set(keyId, { state: 'cooldown', until: Date.now() + ms, reason, at: Date.now() });
  }

  /** Public gorunum — anahtar degeri YOK, yalniz maske. */
  function publicProvider(p) {
    return {
      id: p.id,
      name: p.name,
      baseURL: p.baseURL,
      models: Array.isArray(p.models) ? p.models.slice() : [],
      enabled: p.enabled !== false,
      keys: (p.keys || []).map((k) => ({
        id: k.id,
        label: k.label || 'Anahtar',
        order: k.order,
        mask: k.mask,
        health: healthOf(k.id)
      }))
    };
  }

  function list() {
    const data = loadProviders();
    return ok({
      providers: data.providers.map(publicProvider),
      path: providersPath,
      secretsPath: keysPath,
      secretsEncrypted: Boolean(safeStorage && safeStorage.isEncryptionAvailable())
    });
  }

  /* ---------------------------------------------------------- saglayici CRUD */

  function save(input) {
    const p = input && typeof input === 'object' ? input.provider || input : null;
    if (!p || typeof p !== 'object') return fail(CODES.BAD_REQUEST, 'Sağlayıcı bilgisi gerekli.');

    const baseURL = normalizeBaseURL(p.baseURL);
    if (!baseURL) return fail(CODES.BAD_REQUEST, 'Geçerli bir http(s) adres girin.');
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : 'Sağlayıcı';

    const data = loadProviders();
    let target = p.id ? data.providers.find((x) => x.id === p.id) : null;

    if (target) {
      target.name = name;
      target.baseURL = baseURL;
      if (Array.isArray(p.models)) {
        target.models = p.models.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim()).slice(0, 200);
      }
      if (p.enabled !== undefined) target.enabled = Boolean(p.enabled);
    } else {
      target = {
        id: makeId('prv'),
        name,
        baseURL,
        models: Array.isArray(p.models) ? p.models.filter((m) => typeof m === 'string').slice(0, 200) : [],
        enabled: p.enabled === undefined ? true : Boolean(p.enabled),
        keys: []
      };
      data.providers.push(target);
    }

    try {
      saveProviders(data);
    } catch {
      return fail(CODES.INTERNAL, 'Sağlayıcı kaydedilemedi.');
    }
    return ok({ provider: publicProvider(target), ...list().data });
  }

  function addKey(input) {
    const p = input && typeof input === 'object' ? input : {};
    const provider = findProvider(p.providerId);
    if (!provider) return fail(CODES.NOT_FOUND, 'Sağlayıcı bulunamadı.');
    const key = typeof p.key === 'string' ? p.key.trim() : '';
    if (key.length < 8) return fail(CODES.BAD_REQUEST, 'API anahtarı çok kısa.');
    if (key.length > 4096) return fail(CODES.BAD_REQUEST, 'API anahtarı çok uzun.');

    const id = makeId('key');
    const entry = {
      id,
      label: typeof p.label === 'string' && p.label.trim() ? p.label.trim().slice(0, 40) : `Anahtar ${(provider.keys || []).length + 1}`,
      order: (provider.keys || []).length,
      mask: maskKey(key)
    };

    provider.keys = Array.isArray(provider.keys) ? provider.keys : [];
    provider.keys.push(entry);

    const keys = readKeys();
    keys[id] = key;
    const err = writeKeys(keys);
    if (err) {
      provider.keys.pop();
      return err;
    }

    try {
      saveProviders(loadProviders());
    } catch {
      return fail(CODES.INTERNAL, 'Sağlayıcı kaydedilemedi.');
    }
    return ok({ key: { ...entry, health: healthOf(id) }, ...list().data });
  }

  function removeKey(input) {
    const p = input && typeof input === 'object' ? input : {};
    const provider = findProvider(p.providerId);
    if (!provider) return fail(CODES.NOT_FOUND, 'Sağlayıcı bulunamadı.');
    const before = (provider.keys || []).length;
    provider.keys = (provider.keys || []).filter((k) => k.id !== p.keyId);
    if (provider.keys.length === before) return fail(CODES.NOT_FOUND, 'Anahtar bulunamadı.');
    provider.keys.forEach((k, i) => { k.order = i; });

    const keys = readKeys();
    delete keys[p.keyId];
    const err = writeKeys(keys);
    if (err) return err;

    try {
      saveProviders(loadProviders());
    } catch {
      return fail(CODES.INTERNAL, 'Sağlayıcı kaydedilemedi.');
    }
    health.delete(p.keyId);
    return ok(list().data);
  }

  /* ------------------------------------------------------------- failover */

  function orderedKeys(provider) {
    const keys = (provider.keys || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const healthy = keys.filter((k) => healthOf(k.id).state === 'ok');
    const cooling = keys.filter((k) => healthOf(k.id).state !== 'ok');
    /* Saglikli anahtarlar once; hepsi sogumadaysa yine sirayla denenir
       (yoksa kullanici hic istek atamaz). */
    return { keys: healthy.length ? healthy : keys, skipped: cooling.length && !healthy.length ? 0 : cooling.length, cooling };
  }

  async function attempt(provider, key, { method = 'GET', pathName = '/models', body = null, timeoutMs = null } = {}) {
    const url = `${provider.baseURL}${pathName.startsWith('/') ? pathName : `/${pathName}`}`;
    /* API-01: dis istek http-client uzerinden. Servis fetch cagirmaz. */
    if (!http || typeof http.requestExternal !== 'function') {
      return { status: null, ok: false, text: '', network: true, reason: 'no-http' };
    }
    /* timeoutMs sohbet icin uzundur (model yaniti yavas olabilir); verilmezse
       http-client kendi varsayilanini kullanir. */
    const opts = { url, method, apiKey: key, body };
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) opts.timeoutMs = timeoutMs;
    return http.requestExternal(opts);
  }

  /** Hangi durumlarda sıradaki anahtara geçilir? */
  function shouldSwitch(result) {
    if (result.network) return true;
    if (result.status === 429) return true;
    if (result.status === 401 || result.status === 403) return true;
    if (result.status >= 500) return true;
    return false;
  }

  /**
   * Failover zinciri — TEK ust seviye cagri.
   * @returns {ok|fail} basarida {keyId, mask, attempts[]} doner
   */
  async function runChain(provider, request) {
    const keys = readKeys();
    const { keys: order } = orderedKeys(provider);

    /*
     * Anahtar listesi kurulur. Yerel (loopback) saglayici anahtar istemez:
     * Ollama gibi sunucular icin tek bir "yerel" kimlik kullanilir ve
     * Authorization basligi bos gider. Disari (loopback olmayan) adrese
     * anahtarsiz istek CIKMAZ.
     */
    const credentials = order.map((k) => ({ keyId: k.id, mask: k.mask, secret: keys[k.id], local: false }));
    if (!credentials.length) {
      if (!isLoopbackBaseURL(provider.baseURL)) {
        return fail(CODES.SECRET_MISSING, 'Bu sağlayıcı için kayıtlı API anahtarı yok.', {
          detail: { providerId: provider.id, tried: [] }
        });
      }
      credentials.push({ keyId: 'local', mask: 'yerel', secret: '', local: true });
    }

    const attempts = [];
    for (const k of credentials) {
      if (!k.local && !k.secret) {
        attempts.push({ keyId: k.keyId, mask: k.mask, status: null, reason: 'secret-missing', outcome: 'skip' });
        continue;
      }
      const started = Date.now();
      const result = await attempt(provider, k.secret, request);
      const latency = Date.now() - started;

      attempts.push({
        keyId: k.keyId,
        mask: k.mask,
        status: result.status,
        reason: result.network ? result.reason : (result.ok ? 'ok' : `http-${result.status}`),
        outcome: result.ok ? 'success' : (shouldSwitch(result) ? 'switch' : 'stop'),
        latency
      });

      audit.append({
        op: 'provider.failover',
        code: result.ok ? CODES.OK : (result.status ? fromHttpStatus(result.status) : CODES.OFFLINE),
        target: `${provider.id}/${k.mask}`,
        extra: { attempt: attempts.length, status: result.status, latency }
      });

      if (result.ok) {
        if (!k.local) health.set(k.keyId, { state: 'ok', until: null, reason: null, at: Date.now() });
        /* rawBody: sohbet yaniti 4000 karakteri asabilir — kirpma yalniz
           test/failover ciktisi icin. Anahtar degeri yine disari cikmaz. */
        const body = result.text
          ? (request && request.rawBody ? result.text : result.text.slice(0, 4000))
          : null;
        return ok({
          providerId: provider.id,
          providerName: provider.name,
          keyId: k.keyId,
          mask: k.mask,
          local: k.local,
          attempts,
          latencies: attempts.map((a) => a.latency),
          body
        });
      }

      if (!shouldSwitch(result)) {
        return fail(result.status ? fromHttpStatus(result.status) : CODES.SERVER, 'Sağlayıcı isteği reddetti.', {
          status: result.status,
          detail: { providerId: provider.id, attempts, body: result.text ? result.text.slice(0, 200) : null }
        });
      }

      if (!k.local) coolDown(k.keyId, result.network ? (result.reason || 'network') : `http-${result.status}`, RETRY_WINDOW_MS);
    }

    return fail(CODES.RATE_LIMIT, 'Tüm API anahtarları tükendi.', {
      detail: {
        providerId: provider.id,
        tried: attempts.map((a) => ({ mask: a.mask, status: a.status, reason: a.reason, keyId: a.keyId })),
        attempts
      }
    });
  }

  async function failover(input) {
    const p = input && typeof input === 'object' ? input : {};
    const provider = findProvider(p.providerId) || loadProviders().providers[0];
    if (!provider) return fail(CODES.NOT_FOUND, 'Sağlayıcı yok — önce ekleyin.');
    const pathName = typeof p.path === 'string' && p.path.trim() ? p.path.trim() : '/models';
    return runChain(provider, { method: 'GET', pathName });
  }

  /** Test = failover zincirinin aynisi; anahtar basina sonuc doner. */
  async function test(input) {
    return failover(input);
  }

  /* --------------------------------------------------------- chat gecidi */
  /**
   * Sohbet motorunun kullandigi tek giris. Anahtar secimi/failover burada;
   * ag cagrisi http-client'ta (API-01). Disari anahtar degeri cikmaz.
   *
   * @param {string|null} providerId — null ise ilk ETKIN saglayici
   * @param {{method?: string, pathName: string, body?: object,
   *          rawBody?: boolean, timeoutMs?: number}} request
   */
  async function runRequest(providerId, request) {
    const data = loadProviders();
    let provider = null;
    if (providerId) {
      provider = data.providers.find((p) => p.id === providerId) || null;
    } else {
      provider = data.providers.find((p) => p.enabled) || data.providers[0] || null;
    }
    if (!provider) {
      return fail(CODES.NOT_FOUND, 'Kayıtlı sağlayıcı yok. Sağlayıcılar ekranından ekleyin.', {
        detail: { code: 'no-provider' }
      });
    }
    if (provider.enabled === false) {
      return fail(CODES.NOT_FOUND, 'Bu sağlayıcı kapalı.', { detail: { code: 'provider-disabled' } });
    }
    return runChain(provider, request);
  }

  /** Anahtari olan ilk etkin saglayici (sohbet icin varsayilan). */
  function defaultProvider() {
    const data = loadProviders();
    return data.providers.find((p) => p.enabled && (p.keys || []).length)
      || data.providers.find((p) => p.enabled)
      || data.providers[0]
      || null;
  }

  /* ==================== Tur 9: gercek ses + hazir sohbet ==================== */

  /** Sohbet icin tercih sirasi (katalogda yoksa atlanir). */
  const CHAT_PREFERENCE = Object.freeze([
    'deepseek-v4.1-flash', 'mimo-v2.6-pro', 'qwen3.8-flash-next',
    'glm-5.3', 'gemma-4-31b', 'auto'
  ]);
  const TTS_DEFAULT = 'voxcpm2';
  const ASR_DEFAULT = 'qwen3-asr-1.7b';

  /**
   * Saglayicinin model listesinden sohbet modeli secer.
   * Uydurma yok: listede olmayan model donmez; hicbiri yoksa null.
   * @param {object|null} provider
   * @param {string|null} [hint]
   */
  function pickModel(provider, hint) {
    const models = (provider && Array.isArray(provider.models)) ? provider.models : [];
    if (!models.length) return null;
    if (hint && models.includes(hint)) return hint;
    for (const m of CHAT_PREFERENCE) {
      if (models.includes(m)) return m;
    }
    return null;
  }

  function pickAudioModel(provider, preferred) {
    const models = (provider && Array.isArray(provider.models)) ? provider.models : [];
    if (models.includes(preferred)) return preferred;
    return models.find((m) => /asr|tts|vox|whisper|speech/i.test(m)) || null;
  }

  /**
   * Sohbet: model secimi + failover + JSON ayristirma tek yerde.
   * @param {{providerId?:string|null, model?:string|null, messages:Array,
   *          temperature?:number, maxTokens?:number, timeoutMs?:number}} input
   * @returns {Promise<{ok:true,data:{text:string,model:string,mask:string,
   *          usage:object|null,attempts:Array}}|{ok:false,error:object}>}
   */
  async function chat(input) {
    const p = input && typeof input === 'object' ? input : {};
    const provider = (p.providerId && findProvider(p.providerId)) || defaultProvider();
    if (!provider) {
      return fail(CODES.NOT_FOUND, 'Kayıtlı sağlayıcı yok. Sağlayıcılar ekranından ekleyin.');
    }
    if (provider.enabled === false) {
      return fail(CODES.NOT_FOUND, 'Bu sağlayıcı kapalı.');
    }
    const model = pickModel(provider, p.model);
    if (!model) {
      return fail(CODES.NOT_FOUND, 'Bu sağlayıcıda sohbet modeli bulunamadı.', {
        detail: { models: provider.models || [] }
      });
    }
    const messages = Array.isArray(p.messages) ? p.messages.filter((m) => m && m.role && typeof m.content === 'string') : [];
    if (!messages.length) return fail(CODES.BAD_REQUEST, 'Mesaj listesi boş.');
    const body = {
      model,
      messages: messages.slice(-24),
      temperature: Number.isFinite(p.temperature) ? p.temperature : 0.4,
      stream: false
    };
    if (Number.isInteger(p.maxTokens) && p.maxTokens > 0) body.max_tokens = p.maxTokens;
    const res = await runRequest(provider.id, {
      method: 'POST',
      pathName: '/chat/completions',
      body,
      rawBody: true,
      timeoutMs: p.timeoutMs || 90000
    });
    if (!res.ok) return res;
    let parsed = null;
    try { parsed = res.data.body ? JSON.parse(res.data.body) : null; } catch { parsed = null; }
    const choice = parsed && Array.isArray(parsed.choices) ? parsed.choices[0] : null;
    const msg = choice && (choice.message || choice.delta);
    const text = msg && typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!text) {
      return fail(CODES.SERVER, 'Model boş yanıt döndü.', { detail: { model, providerId: provider.id } });
    }
    return ok({
      text,
      model,
      providerId: provider.id,
      mask: res.data.mask,
      usage: (parsed && parsed.usage) || null,
      attempts: res.data.attempts
    });
  }

  /**
   * Ikili (ses) istekleri icin anahtar zinciri. Ag cagrisi http-client'ta.
   * @param {object} provider
   * @param {(key:string) => object} buildOptions
   */
  async function runBinaryChain(provider, buildOptions) {
    const keys = readKeys();
    const { keys: order } = orderedKeys(provider);
    if (!order.length) {
      return fail(CODES.SECRET_MISSING, 'Bu sağlayıcı için kayıtlı API anahtarı yok.', {
        detail: { providerId: provider.id, tried: [] }
      });
    }
    if (!http || typeof http.requestExternalBinary !== 'function') {
      return fail(CODES.INTERNAL, 'Ses ağ katmanı hazır değil.');
    }
    const attempts = [];
    for (const k of order) {
      const secret = keys[k.id];
      if (!secret) {
        attempts.push({ keyId: k.id, mask: k.mask, reason: 'secret-missing', outcome: 'skip' });
        continue;
      }
      const started = Date.now();
      const result = await http.requestExternalBinary({ ...buildOptions(secret), apiKey: secret });
      const latency = Date.now() - started;
      const badStatus = !result.ok
        && (result.network || result.status === 401 || result.status === 403
          || result.status === 429 || result.status >= 500);
      attempts.push({
        keyId: k.id,
        mask: k.mask,
        status: result.status,
        reason: result.network ? result.reason : (result.ok ? 'ok' : `http-${result.status}`),
        outcome: result.ok ? 'success' : (badStatus ? 'switch' : 'stop'),
        latency
      });
      if (result.ok) {
        health.set(k.id, { state: 'ok', until: null, reason: null, at: Date.now() });
        return ok({
          base64: result.base64,
          mime: result.mime,
          bytes: result.bytes,
          text: result.text,
          mask: k.mask,
          attempts
        });
      }
      if (!badStatus) {
        return fail(result.status ? fromHttpStatus(result.status) : CODES.SERVER, 'Sağlayıcı ses isteğini reddetti.', {
          status: result.status,
          detail: { providerId: provider.id, attempts, body: result.text ? result.text.slice(0, 200) : null }
        });
      }
      coolDown(k.id, result.network ? (result.reason || 'network') : `http-${result.status}`, RETRY_WINDOW_MS);
    }
    return fail(CODES.RATE_LIMIT, 'Tüm API anahtarları tükendi.', {
      detail: { providerId: provider.id, attempts }
    });
  }

  /**
   * Metni sese cevirir (TTS). Yanit base64 mp3 olarak doner.
   * @param {{text:string, providerId?:string|null, model?:string, voice?:string}} input
   */
  async function tts(input) {
    const p = input && typeof input === 'object' ? input : {};
    const text = typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) return fail(CODES.BAD_REQUEST, 'Seslendirilecek metin boş.');
    if (text.length > 2000) return fail(CODES.BAD_REQUEST, 'Metin çok uzun (en fazla 2000 karakter).');
    const provider = (p.providerId && findProvider(p.providerId)) || defaultProvider();
    if (!provider) return fail(CODES.NOT_FOUND, 'Kayıtlı sağlayıcı yok.');
    const model = p.model && (provider.models || []).includes(p.model)
      ? p.model
      : pickAudioModel(provider, TTS_DEFAULT);
    if (!model) {
      return fail(CODES.NOT_FOUND, 'Bu sağlayıcıda seslendirme modeli yok.', {
        detail: { models: provider.models || [] }
      });
    }
    const base = String(provider.baseURL || '').replace(/\/+$/, '');
    const body = { model, input: text, response_format: 'mp3' };
    if (p.voice) body.voice = String(p.voice);
    const res = await runBinaryChain(provider, () => ({
      url: `${base}/audio/speech`,
      method: 'POST',
      body: JSON.stringify(body),
      contentType: 'application/json',
      accept: 'audio/mpeg'
    }));
    if (!res.ok) return res;
    if (!res.data.bytes) return fail(CODES.SERVER, 'Ses verisi boş döndü.');
    return ok({ ...res.data, model, providerId: provider.id });
  }

  /**
   * Ses dosyasini yaziya cevirir (STT, cok dilli ASR).
   * @param {{base64:string, mime?:string, providerId?:string|null,
   *          model?:string, language?:string}} input
   */
  async function transcribe(input) {
    const p = input && typeof input === 'object' ? input : {};
    const base64 = typeof p.base64 === 'string' ? p.base64 : '';
    if (!base64) return fail(CODES.BAD_REQUEST, 'Ses verisi boş.');
    if (base64.length > 24 * 1024 * 1024) return fail(CODES.BAD_REQUEST, 'Ses verisi çok büyük.');
    const provider = (p.providerId && findProvider(p.providerId)) || defaultProvider();
    if (!provider) return fail(CODES.NOT_FOUND, 'Kayıtlı sağlayıcı yok.');
    const model = p.model && (provider.models || []).includes(p.model)
      ? p.model
      : pickAudioModel(provider, ASR_DEFAULT);
    if (!model) {
      return fail(CODES.NOT_FOUND, 'Bu sağlayıcıda konuşma tanıma modeli yok.', {
        detail: { models: provider.models || [] }
      });
    }
    const mime = typeof p.mime === 'string' && p.mime ? p.mime : 'audio/wav';
    const ext = /webm/.test(mime) ? 'webm' : /mp4|m4a/.test(mime) ? 'm4a' : /mpeg|mp3/.test(mime) ? 'mp3' : 'wav';
    const base = String(provider.baseURL || '').replace(/\/+$/, '');
    const res = await runBinaryChain(provider, () => {
      const form = new FormData();
      form.append('file', new Blob([Buffer.from(base64, 'base64')], { type: mime }), `audio.${ext}`);
      form.append('model', model);
      if (p.language) form.append('language', String(p.language));
      return { url: `${base}/audio/transcriptions`, method: 'POST', body: form, accept: 'application/json' };
    });
    if (!res.ok) return res;
    let parsed = null;
    try { parsed = res.data.text ? JSON.parse(res.data.text) : null; } catch { parsed = null; }
    const text = parsed && typeof parsed.text === 'string' ? parsed.text.trim() : '';
    return ok({
      text,
      model,
      providerId: provider.id,
      mask: res.data.mask,
      attempts: res.data.attempts,
      empty: !text
    });
  }

  /** Ses yetenekleri: hangi model var, hangi anahtar var (sir yok). */
  function audioCapabilities() {
    const provider = defaultProvider();
    return {
      providerId: provider ? provider.id : null,
      hasKey: Boolean(provider && (provider.keys || []).length),
      ttsModel: provider ? pickAudioModel(provider, TTS_DEFAULT) : null,
      asrModel: provider ? pickAudioModel(provider, ASR_DEFAULT) : null,
      chatModel: provider ? pickModel(provider) : null
    };
  }

  return {
    list,
    save,
    addKey,
    removeKey,
    test,
    failover,
    runChain,
    runRequest,
    defaultProvider,
    chat,
    tts,
    transcribe,
    audioCapabilities,
    pickModel,
    paths: { providersPath, keysPath },
    maskKey
  };
}

module.exports = { createProvidersService, maskKey, seedFromOpenCode, normalizeBaseURL, isLoopbackBaseURL };
