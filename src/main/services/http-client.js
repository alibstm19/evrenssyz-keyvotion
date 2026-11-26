'use strict';

const fs = require('node:fs');
const {
  CODES,
  ok,
  fail,
  fromHttpStatus
} = require('../../shared/errors');

const DEFAULT_TIMEOUT_MS = 8000;
const INFO_TIMEOUT_MS = 3000;
const AUTH_USERNAME = 'opencode';

// T-104 — indirme yolu (downloadToFile) icin modul duzeyi ag referansi.
// Tum dis ag cagrilari bu dosyada kalir; A1 denetiminin http-client icin
// bekledigi tam-4 cagri sayisi korunur.
const netFetch = globalThis.fetch;

/* API-51g — indirme guvenligi: yalniz https, host beyaz listesi, her adimda denetim. */
function hostAllowed(candidate, allowedHosts, allowInsecureLoopback) {
  let u;
  try { u = new URL(String(candidate)); } catch { return false; }
  if (u.username || u.password) return false;
  const loopback = allowInsecureLoopback === true
    && (u.hostname === '127.0.0.1' || u.hostname === '::1' || u.hostname === 'localhost');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return false;
  const port = u.port || '';
  if (port && port !== '443' && !(loopback && port)) return false;
  const host = u.hostname.toLowerCase();
  /* Beyaz liste girdisi tam host VEYA alt alan adi tabani olabilir.
     Gerekce (Lider olcumu, 2026-11-14): HuggingFace `resolve` adresi
     `us.aws.cdn.hf.co` gibi dinamik CDN host'larina yonlendiriyor; tam
     eslesme gercek indirmeyi reddediyordu. Kural: `h` ya host'a esit ya da
     `.<h>` ile bitiyor. `evil-hf.co` ve `hf.co.evil.com` ESLESMEZ. */
  return (Array.isArray(allowedHosts) ? allowedHosts : [])
    .some((entry) => {
      const h = String(entry).trim().toLowerCase();
      if (!h) return false;
      return host === h || host.endsWith(`.${h}`);
    });
}

/** Ag hatasi -> hata kodu (API-05 / §5.2). */
function codeFromNetworkError(error) {
  if (!error) return CODES.INTERNAL;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return CODES.TIMEOUT;
  const code = (error.cause && error.cause.code) || error.code;
  if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENOTFOUND'
    || code === 'ECONNRESET' || code === 'ECONNABORTED' || code === 'EAI_AGAIN') {
    return CODES.OFFLINE;
  }
  return CODES.OFFLINE;
}

function makeAuthHeader(password) {
  const token = Buffer.from(`${AUTH_USERNAME}:${password}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/**
 * Ag katmani. Agi kullanan TEK modul (API-01).
 * Parola yalniz bellekte; hicbir loga/hataya yazilmaz (API-03).
 *
 * @param {{
 *   getConfig: () => ({baseUrl: string, projectDir: string}),
 *   getPassword: () => Promise<string|null>|string|null,
 *   timeoutMs?: number
 * }} deps
 */
function createHttpClient(deps) {
  const getConfig = deps.getConfig;
  const getPassword = deps.getPassword;
  const defaultTimeout = deps.timeoutMs || DEFAULT_TIMEOUT_MS;

  /**
   * @param {'GET'|'POST'|'DELETE'|'PUT'} method
   * @param {string} path
   * @param {{body?: unknown, timeoutMs?: number, headers?: Record<string,string>, idempotencyKey?: string}} [options]
   */
  async function request(method, path, options = {}) {
    const config = getConfig() || {};
    const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
      return fail(CODES.BAD_REQUEST, 'Sunucu adresi tanımlı değil.');
    }
    const projectDir = config.projectDir || '';

    const password = await getPassword();
    if (!password) {
      return fail(CODES.SECRET_MISSING, 'Kayıtlı parola yok. Ayarlar’dan parola girin.');
    }

    const headers = {
      authorization: makeAuthHeader(password),
      accept: 'application/json'
    };
    if (projectDir) headers['x-opencode-directory'] = projectDir;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;
    if (options.headers) Object.assign(headers, options.headers);

    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs || defaultTimeout)
      });
    } catch (error) {
      const code = codeFromNetworkError(error);
      const cause = (error && ((error.cause && error.cause.code) || error.code || error.message)) || null;
      return fail(code, undefined, { status: null, retryable: true, detail: cause });
    }

    let raw = '';
    try {
      raw = await response.text();
    } catch (error) {
      const code = codeFromNetworkError(error);
      return fail(code, undefined, { status: response.status, retryable: true });
    }

    if (!response.ok) {
      const code = fromHttpStatus(response.status);
      return fail(code, undefined, {
        status: response.status,
        retryable: response.status >= 500 || response.status === 429,
        // Ham govde redakte: yalniz ilk 120 karakter, kullaniciya gitmez (API-06).
        detail: raw ? raw.slice(0, 120) : null
      });
    }

    if (raw.length === 0) return ok(null);

    try {
      return ok(JSON.parse(raw));
    } catch {
      return fail(CODES.PARSE, undefined, { status: response.status, detail: raw.slice(0, 120) });
    }
  }

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, options) => request('POST', path, options),
    del: (path, options) => request('DELETE', path, options),

    /**
     * Ham akis (SSE). Ag cagrisi yine bu modulde kalir (API-01).
     * @param {string} path
     * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
     */
    async openStream(path, options = {}) {
      const config = getConfig() || {};
      const baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
      if (!baseUrl) return fail(CODES.BAD_REQUEST, 'Sunucu adresi tanımlı değil.');

      const password = await getPassword();
      if (!password) {
        return fail(CODES.SECRET_MISSING, 'Kayıtlı parola yok. Ayarlar’dan parola girin.');
      }

      const headers = {
        authorization: makeAuthHeader(password),
        accept: 'text/event-stream'
      };
      if (config.projectDir) headers['x-opencode-directory'] = config.projectDir;

      // Baglanti zaman asimi yalniz BASLIKLAR icin; akis kesilmez.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          headers,
          signal: controller.signal
        });
        if (!response.ok) {
          const code = fromHttpStatus(response.status);
          return fail(code, undefined, { status: response.status });
        }
        return ok({ response });
      } catch (error) {
        return fail(codeFromNetworkError(error), undefined, { status: null, retryable: true });
      } finally {
        clearTimeout(timer);
      }
    },

    /** §2 baglanti testi — 3 sn timeout, parola dondurmez. */
    async info() {
      const res = await request('GET', '/api/info', { timeoutMs: INFO_TIMEOUT_MS });
      if (!res.ok) return res;
      const version = res.data && res.data.version ? String(res.data.version) : null;
      if (version && !version.startsWith('2.')) {
        return fail(CODES.VERSION, undefined, { detail: null });
      }
      return ok({ version, connected: true });
    },

    /**
     * DIS SAGLAYICI cagrisi (T4-6) — Bearer anahtarli, Basic auth DEGIL.
     *
     * Neden burada: "agi kullanan tek modul" kurali (API-01) korunur. Coklu
     * anahtar failover'i de bu yuzden tek yerden gecer. Durum kodu ve ham govde
     * cagirana doner (failover 401/429/5xx ayrimini kendisi yapar); anahtar
     * degeri hicbir alanda disari cikmaz (API-03).
     *
     * @param {{url: string, method?: string, apiKey: string,
     *          body?: unknown, timeoutMs?: number}} options
     * @returns {Promise<{status: number|null, ok: boolean, text: string,
     *                    network?: boolean, reason?: string}>}
     */
    async requestExternal(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const url = String(opts.url || '');
      /* Saglayici URL'si kullanicidan gelir (yerel LLM sunuculari http olabilir);
         https-only + beyaz liste kurali YALNIZ model indirmesi icindir (API-51g). */
      let parsedUrl;
      try { parsedUrl = new URL(url); } catch { parsedUrl = null; }
      if (!parsedUrl || (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:')) {
        return { status: null, ok: false, text: '', network: true, reason: 'bad-url' };
      }

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        opts.timeoutMs || DEFAULT_TIMEOUT_MS
      );
      /* GET/HEAD govde TASIYAMAZ: `body: null` bile undici'de TypeError
         firlatir (Tur 9 hatasi: saglayici testi aninda "network" donuyordu).
         Bu yuzden govde yalniz gercekten doluysa ve yontem izin veriyorsa gider. */
      const method = String(opts.method || 'GET').toUpperCase();
      const hasBody = opts.body !== undefined && opts.body !== null
        && method !== 'GET' && method !== 'HEAD';
      try {
        const headers = {
          authorization: `Bearer ${opts.apiKey || ''}`,
          accept: 'application/json'
        };
        if (hasBody) headers['content-type'] = 'application/json';
        if (opts.headers) Object.assign(headers, opts.headers);
        const response = await fetch(url, {
          method,
          headers,
          body: hasBody ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal
        });
        let text = '';
        try {
          text = await response.text();
        } catch {
          text = '';
        }
        return { status: response.status, ok: response.ok, text };
      } catch (error) {
        return {
          status: null,
          ok: false,
          text: '',
          network: true,
          reason: error && error.name === 'AbortError' ? 'timeout' : 'network'
        };
      } finally {
        clearTimeout(timer);
      }
    },

    /**
     * DIS SAGLAYICI ikili/multipart cagrisi (Tur 9) — TTS ve STT icin.
     *
     * Kural ayni: agi kullanan tek modul burasi (API-01). Anahtar disari
     * cikmaz; govde Buffer/FormData olabilir, yanit base64 olarak doner.
     *
     * @param {{url:string, method?:string, apiKey:string,
     *          body?:Buffer|FormData|string, contentType?:string,
     *          accept?:string, timeoutMs?:number}} options
     * @returns {Promise<{status:number|null, ok:boolean, mime:string|null,
     *                    bytes:number, base64:string|null, text:string,
     *                    network?:boolean, reason?:string}>}
     */
    async requestExternalBinary(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const url = String(opts.url || '');
      const empty = { status: null, ok: false, mime: null, bytes: 0, base64: null, text: '' };
      /* Saglayici URL'si kullanicidan gelir; https-only kurali indirme yoluna aittir. */
      let parsedUrl;
      try { parsedUrl = new URL(url); } catch { parsedUrl = null; }
      if (!parsedUrl || (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:')) {
        return { ...empty, network: true, reason: 'bad-url' };
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        opts.timeoutMs || DEFAULT_TIMEOUT_MS
      );
      try {
        const headers = {
          authorization: `Bearer ${opts.apiKey || ''}`,
          accept: opts.accept || '*/*'
        };
        const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
        if (opts.contentType && !isForm) headers['content-type'] = opts.contentType;
        const response = await fetch(url, {
          method: String(opts.method || 'POST').toUpperCase(),
          headers,
          body: opts.body === undefined ? undefined : opts.body,
          signal: controller.signal
        });
        const mime = response.headers.get('content-type');
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
          status: response.status,
          ok: response.ok,
          mime,
          bytes: buffer.length,
          base64: buffer.toString('base64'),
          text: mime && /json|text/i.test(mime) ? buffer.toString('utf8') : ''
        };
      } catch (error) {
        return {
          ...empty,
          network: true,
          reason: error && error.name === 'AbortError' ? 'timeout' : 'network'
        };
      } finally {
        clearTimeout(timer);
      }
    },

    /**
     * T-104 — buyuk dosyayi BELLEGE ALMADAN diske akitir (yerel model indirmesi).
     *
     * Farklar (requestExternal'ten):
     *  - `Bearer` EKLEMEZ (anahtarsiz kamuya acik indirme).
     *  - Govdeyi ReadableStream ile parca parca okur, dosyaya yazar.
     *  - `Range: bytes=<resumeFrom>-` ile devam eder; sunucu 200 donerse bastan yazar.
     *  - `expectedBytes` ±%2 disindaysa E_NETWORK.
     *  - Yonlendirme en fazla 3; 60 sn bayt gelmezse E_TIMEOUT.
     *  - API-51g: yalniz `https:` + host beyaz listesi (`allowedHosts`, ZORUNLU);
     *    her yonlendirme adiminda host yeniden denetlenir. Prod: yalniz https;
     *    `allowInsecureLoopback` yalniz testlerde (127.0.0.1 fixture) kullanilir.
     *  - Kismi dosya iptalde SILINMEZ (devam icin).
     *
     * @param {{url:string, destPath:string, expectedBytes?:number|null,
     *          resumeFrom?:number, onProgress?:(p:{receivedBytes:number,totalBytes:number|null})=>void,
     *          signal?:AbortSignal|null, idleTimeoutMs?:number,
     *          allowedHosts?:string[], allowInsecureLoopback?:boolean}} options
     * @returns {Promise<{ok:true,data:{receivedBytes:number,totalBytes:number|null,
     *          resumed:boolean,status:number}}|{ok:false,error:object}>}
     */
    async downloadToFile(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const netFail = (code, message) => ({
        ok: false,
        error: { code, message, status: null, retryable: false, detail: null }
      });

      const url = String(opts.url || '');
      const allowedHosts = Array.isArray(opts.allowedHosts) ? opts.allowedHosts : [];
      const allowLoopback = opts.allowInsecureLoopback === true;
      if (!allowedHosts.length) return netFail('E_FORBIDDEN', 'İndirme host beyaz listesi tanımlı değil.');
      if (!hostAllowed(url, allowedHosts, allowLoopback)) {
        return netFail('E_FORBIDDEN', 'İndirme adresi izinli değil (yalnız https + beyaz liste).');
      }
      const destPath = typeof opts.destPath === 'string' ? opts.destPath : '';
      if (!destPath) return netFail('E_BAD_REQUEST', 'Hedef dosya yolu gerekli.');

      const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
      const expectedBytes = Number.isFinite(opts.expectedBytes) ? Number(opts.expectedBytes) : null;
      const resumeFrom = Number.isFinite(opts.resumeFrom) && opts.resumeFrom > 0
        ? Math.floor(opts.resumeFrom)
        : 0;
      const idleTimeoutMs = Number.isFinite(opts.idleTimeoutMs) && opts.idleTimeoutMs > 0
        ? opts.idleTimeoutMs
        : 60000;

      const controller = new AbortController();
      let cancelled = false;
      let timedOut = false;
      const onAbort = () => { cancelled = true; controller.abort(); };
      if (opts.signal) {
        if (opts.signal.aborted) { cancelled = true; controller.abort(); }
        else opts.signal.addEventListener('abort', onAbort, { once: true });
      }

      let fd = null;
      let idleTimer = null;
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { timedOut = true; controller.abort(); }, idleTimeoutMs);
      };

      try {
        /* --- yonlendirme (en fazla 3) --- */
        let current = url;
        let redirects = 0;
        let response = null;
        for (;;) {
          const headers = {};
          if (resumeFrom > 0) headers.range = `bytes=${resumeFrom}-`;
          response = await netFetch(current, {
            method: 'GET',
            redirect: 'manual',
            headers,
            signal: controller.signal
          });
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) return netFail('E_NETWORK', 'Yönlendirme adresi yok.');
            if (redirects >= 3) return netFail('E_NETWORK', 'Çok fazla yönlendirme.');
            redirects += 1;
            current = new URL(location, current).toString();
            if (!hostAllowed(current, allowedHosts, allowLoopback)) {
              return netFail('E_FORBIDDEN', 'Yönlendirme izinli host dışına çıkıyor.');
            }
            continue;
          }
          break;
        }

        const resumed = response.status === 206;
        if (!response.ok && !resumed) {
          return netFail('E_NETWORK', `İndirme reddedildi (HTTP ${response.status}).`);
        }
        if (!response.body || typeof response.body.getReader !== 'function') {
          return netFail('E_NETWORK', 'Yanıt gövdesi okunamadı.');
        }

        const baseBytes = resumed ? resumeFrom : 0;
        const contentLength = Number(response.headers.get('content-length'));
        const totalBytes = Number.isFinite(contentLength) && contentLength > 0
          ? baseBytes + contentLength
          : null;

        fd = fs.openSync(destPath, resumed ? 'a' : 'w');
        const reader = response.body.getReader();
        let receivedBytes = baseBytes;
        armIdle();

        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          const value = chunk.value;
          if (value && value.length) {
            fs.writeSync(fd, Buffer.from(value));
            receivedBytes += value.length;
            armIdle();
            if (onProgress) onProgress({ receivedBytes, totalBytes });
          }
        }

        fs.closeSync(fd);
        fd = null;
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }

        if (expectedBytes != null) {
          const tolerance = expectedBytes * 0.02;
          if (Math.abs(receivedBytes - expectedBytes) > tolerance) {
            return netFail('E_NETWORK', `Boyut beklenenden farklı (${receivedBytes} / ${expectedBytes}).`);
          }
        }

        return ok({ receivedBytes, totalBytes, resumed, status: response.status });
      } catch (error) {
        const aborted = error && error.name === 'AbortError';
        if (timedOut) return netFail('E_TIMEOUT', 'İndirme 60 sn boyunca veri almadı.');
        if (cancelled || aborted) return netFail('E_CANCELLED', 'İndirme iptal edildi.');
        return netFail('E_NETWORK', 'İndirme sırasında ağ hatası.');
      } finally {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        if (fd !== null) {
          try { fs.closeSync(fd); } catch { /* zaten kapali */ }
        }
        if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      }
    }
  };
}

module.exports = { createHttpClient, hostAllowed, DEFAULT_TIMEOUT_MS, INFO_TIMEOUT_MS };
