'use strict';

/**
 * Telefondan uzaktan kontrol (T5-4).
 *
 * NEDEN: Kullanici bilgisayarin basinda olmadiginda (yolda, telefonda) ekibi
 * izleyip modele mesaj yazabilsin. Konsol LAN uzerinde kucuk bir HTTP sunucusu
 * acar; telefon ayni Wi-Fi'daysa tarayicidan baglanir.
 *
 * GUVENLIK
 *  - Yalnizca OZEL ag adreslerinden gelen istekler kabul edilir (10/8, 172.16/12,
 *    192.168/16, 127/8, ::1). Genel IP reddedilir.
 *  - Eslesme jetonu (pairing token) zorunlu; sabit zamanli karsilastirma.
 *  - Govde siniri 64 KB, istek hizi IP basina 60/dk.
 *  - Dosya sunumu YOK; yalniz /api/* uc noktalari + tek HTML sayfasi.
 *  - Jeton diske 0600 ile yazilir; yanitlarda/loglarda tam jeton gorunmez.
 *
 * Bagimlilik yok: node:http.
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readLeaderCycles } = require('./reports');

const FILE = 'remote.json';
const DEFAULT_PORT = 7788;
const PORT_TRIES = 10;
const BODY_LIMIT = 64 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;
const TOKEN_LEN = 10;
const TOKEN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // karisabilen 0/O/1/I yok

function makeToken() {
  const bytes = crypto.randomBytes(TOKEN_LEN);
  let out = '';
  for (let i = 0; i < TOKEN_LEN; i += 1) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

/** Sabit zamanli karsilastirma (uzunluk sizintisi da kapatilir). */
function tokenEquals(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) {
    /* Yine de karsilastir ki sure farki olusmasin. */
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/** Ozel ag mi? (IPv4 + IPv4-mapped + IPv6 loopback) */
function isPrivateAddress(raw) {
  let addr = String(raw || '').replace(/^::ffff:/i, '');
  if (addr === '::1' || addr === 'localhost') return true;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) return false;
  const parts = addr.split('.').map(Number);
  if (parts.some((n) => n < 0 || n > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 169 && parts[1] === 254) return true; // link-local
  return false;
}

function lanAddresses() {
  const out = [];
  let nets;
  try { nets = os.networkInterfaces(); }
  catch { return []; }
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function maskToken(token) {
  const t = String(token || '');
  if (t.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(6, t.length - 4))}${t.slice(-4)}`;
}

/* ------------------------------------------------------------------ HTML */

function pageHtml() {
  /* Tek dosya, dis kaynak yok. Telefon icin tasarlandi.
     Ayri .html dosyasinda durur: main proses AG cagrisi yapmaz (API-01);
     sayfadaki fetch telefonun tarayicisinda calisir (API-60). */
  return fs.readFileSync(path.join(__dirname, 'remote-page.html'), 'utf8');
}

/* --------------------------------------------------------------- servis */

/**
 * @param {{baseDir: string, chat: object, memory?: object,
 *          getTeam?: (() => object[]), audit?: object}} options
 */
function createRemoteService(options) {
  const baseDir = options.baseDir;
  const chat = options.chat;
  const memory = options.memory || null;
  const board = options.board || null;
  const getTeam = options.getTeam || (() => []);
  const audit = options.audit || { append() {} };

  const filePath = path.join(baseDir, FILE);

  let server = null;
  let token = '';
  let port = null;
  let startedAt = null;
  let lastError = null;
  const rate = new Map();
  const clients = new Set();
  let requests = 0;

  function loadConfig() {
    try {
      if (!fs.existsSync(filePath)) return { token: '', port: DEFAULT_PORT };
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        token: typeof parsed.token === 'string' ? parsed.token : '',
        port: Number.isInteger(parsed.port) ? parsed.port : DEFAULT_PORT
      };
    } catch {
      return { token: '', port: DEFAULT_PORT };
    }
  }

  function saveConfig() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ token, port, updatedAt: new Date().toISOString() }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
  }

  /* --------------------------------------------------------------- HTTP */

  function json(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let tooLarge = false;
      const chunks = [];

      /* Soketi hemen YIKMA: yanit yazilamadan ECONNRESET olur. Bunun yerine
         istegi akitalim (resume) ve 413 yaniti tamamlandiktan sonra kapatalim. */
      const rejectTooLarge = () => {
        if (tooLarge) return;
        tooLarge = true;
        const error = new Error('body-too-large');
        error.code = 'E_BODY_TOO_LARGE';
        reject(error);
        try { req.resume(); } catch { /* zaten kapali */ }
      };

      req.on('aborted', () => { /* sessizce yut: 413 zaten yazildi */ });
      req.on('error', () => {
        if (!tooLarge) reject(new Error('bad-body'));
      });

      /* Content-Length yalanlayabilir ama buyukse govdeyi HIc okumadan reddet. */
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > BODY_LIMIT) {
        rejectTooLarge();
        return;
      }

      req.on('data', (chunk) => {
        if (tooLarge) return;
        size += chunk.length;
        if (size > BODY_LIMIT) {
          rejectTooLarge();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (tooLarge) return;
        if (!chunks.length) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('bad-json'));
        }
      });
    });
  }

  function allow(ip) {
    const now = Date.now();
    const rec = rate.get(ip);
    if (!rec || now > rec.resetAt) {
      rate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return true;
    }
    rec.count += 1;
    return rec.count <= RATE_MAX;
  }

  function authOf(req) {
    const header = req.headers['x-kv-token'];
    return typeof header === 'string' && tokenEquals(header, token);
  }

  function snapshot(conversationId) {
    /* Sohbet: aktif konusmanin son hali. */
    const listRes = chat.list();
    const conversations = (listRes.ok && listRes.data.conversations) || [];
    const first = conversations.find((item) => item.id === conversationId) || conversations[0] || null;
    let messages = [];
    let model = '';
    let role = 'LDR';
    if (first) {
      const got = chat.get({ id: first.id });
      if (got.ok) {
        messages = got.data.messages || [];
        model = got.data.conversation.model || '';
        role = got.data.conversation.role || 'LDR';
      }
    }

    let memRows = [];
    if (memory) {
      const m = memory.read({ limit: 20 });
      if (m.ok) memRows = (m.data.entries || []).map((e) => ({ text: e.text, scope: e.scope, kind: e.kind }));
    }

    return {
      conversation: first ? { id: first.id, title: first.title, role, model, messages } : null,
      messages,
      model,
      role,
      memoryCount: memRows.length,
      memory: memRows,
      team: getTeam() || [],
      conversations
    };
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const ip = (req.socket && req.socket.remoteAddress) || '';

    if (!isPrivateAddress(ip)) {
      json(res, 403, { ok: false, error: { code: 'E_FORBIDDEN', message: 'Yalnız yerel ağ.' } });
      return;
    }
    if (!allow(ip)) {
      json(res, 429, { ok: false, error: { code: 'E_RATE_LIMIT', message: 'Çok fazla istek.' } });
      return;
    }

    requests += 1;

    /* Saglik ucu jetonsuz (yalniz "acik mi" bilgisi). */
    if (url.pathname === '/api/health') {
      json(res, 200, { ok: true, data: { service: 'keyvotion-remote', at: new Date().toISOString() } });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
      });
      res.end(pageHtml());
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      json(res, 404, { ok: false, error: { code: 'E_NOT_FOUND', message: 'Yol yok.' } });
      return;
    }

    if (!token || !authOf(req)) {
      json(res, 401, { ok: false, error: { code: 'E_UNAUTHORIZED', message: 'Eşleşme kodu geçersiz.' } });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      json(res, 200, { ok: true, data: snapshot(url.searchParams.get('conversation')) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/board') {
      if (!board) {
        json(res, 500, { ok: false, error: { code: 'E_INTERNAL', message: 'Pano servisi yuklenemedi.' } });
        return;
      }
      const resBoard = board.read();
      if (!resBoard.ok) {
        json(res, resBoard.error.status || 500, resBoard);
        return;
      }
      // Dönüt: { phase, nextID, rows, leaderCycles }
      // T-092: son lider döngüleri (en yeni 3). Hata/eksik dosya panoyu kırmaz.
      let leaderCycles = [];
      try {
        const lc = readLeaderCycles(baseDir);
        leaderCycles = Array.isArray(lc && lc.cycles) ? lc.cycles.slice(0, 3) : [];
      } catch {
        leaderCycles = [];
      }
      json(res, 200, {
        ok: true,
        data: {
          phase: resBoard.data.phase || 'unknown',
          nextID: resBoard.data.nextID || null,
          rows: resBoard.data.rows || [],
          leaderCycles
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/send') {
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        if (error && error.code === 'E_BODY_TOO_LARGE') {
          /* Yanit GONDERILDİKTEN SONRA kapat: erken destroy ECONNRESET yapar. */
          res.setHeader('connection', 'close');
          json(res, 413, {
            ok: false,
            error: {
              code: 'E_BODY_TOO_LARGE',
              message: 'İstek gövdesi 64 KB sınırını aştı.',
              limit: BODY_LIMIT
            }
          });
          res.once('finish', () => {
            try { req.socket.end(); } catch { /* zaten kapali */ }
          });
          return;
        }
        json(res, 400, { ok: false, error: { code: 'E_BAD_REQUEST', message: 'Gövde okunamadı.' } });
        return;
      }
      const result = await chat.send({
        text: body.text,
        conversationId: body.conversationId || null
      });
      if (!result.ok) {
        json(res, 200, {
          ok: false,
          error: {
            code: result.error.code,
            message: result.error.message,
            detail: { attempts: (result.error.detail && result.error.detail.attempts) || [] }
          }
        });
        return;
      }
      json(res, 200, { ok: true, data: result.data });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/new') {
      const created = chat.create({});
      json(res, created.ok ? 200 : 400, created);
      return;
    }

    json(res, 404, { ok: false, error: { code: 'E_NOT_FOUND', message: 'Uç nokta yok.' } });
  }

  /* ---------------------------------------------------------------- yasam */

  function state() {
    const cfg = loadConfig();
    const addresses = lanAddresses();
    const urlList = port ? addresses.map((a) => `http://${a}:${port}`) : [];
    return {
      running: Boolean(server),
      port,
      addresses,
      urls: urlList,
      pairUrl: port && addresses.length ? `http://${addresses[0]}:${port}/#${token}` : null,
      token,
      tokenMask: maskToken(token),
      tokenSet: Boolean(token),
      startedAt,
      lastError,
      clients: clients.size,
      requests,
      configPath: filePath,
      hasSavedToken: Boolean(cfg.token)
    };
  }

  function listenOn(portToTry, attempt) {
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => {
        handle(req, res).catch((error) => {
          try {
            json(res, 500, { ok: false, error: { code: 'E_INTERNAL', message: 'Sunucu hatası.' } });
          } catch { /* yanit kapanmis */ }
          lastError = String((error && error.message) || 'unknown');
        });
      });

      s.on('connection', (socket) => {
        clients.add(socket);
        socket.on('close', () => clients.delete(socket));
      });
      s.on('error', (error) => {
        if (error && error.code === 'EADDRINUSE' && attempt < PORT_TRIES) {
          resolve(listenOn(portToTry + 1, attempt + 1));
          return;
        }
        reject(error);
      });
      s.listen(portToTry, '0.0.0.0', () => resolve({ server: s, port: portToTry }));
    });
  }

  async function start(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (server) return { ok: true, data: state() };

    const cfg = loadConfig();
    token = (typeof p.token === 'string' && p.token.trim().length >= 6)
      ? p.token.trim().toUpperCase().slice(0, 32)
      : (cfg.token || makeToken());

    const wanted = Number.isInteger(p.port) && p.port > 1024 && p.port < 65536 ? p.port : (cfg.port || DEFAULT_PORT);
    try {
      const out = await listenOn(wanted, 0);
      server = out.server;
      port = out.port;
      startedAt = new Date().toISOString();
      lastError = null;
      saveConfig();
      audit.append({
        op: 'remote.start',
        code: 'E_OK',
        target: `${port}`,
        extra: { tokenMask: maskToken(token), clients: 0 }
      });
      return { ok: true, data: state() };
    } catch (error) {
      lastError = String((error && error.message) || 'listen');
      server = null;
      port = null;
      return {
        ok: false,
        error: {
          code: 'E_INTERNAL',
          message: 'Uzak erişim başlatılamadı (port kullanımda olabilir).',
          status: null,
          retryable: false,
          detail: { reason: lastError }
        }
      };
    }
  }

  function stop() {
    return new Promise((resolve) => {
      if (!server) { resolve({ ok: true, data: state() }); return; }
      for (const s of clients) {
        try { s.destroy(); } catch { /* yoksay */ }
      }
      clients.clear();
      const s = server;
      server = null;
      port = null;
      s.close(() => {
        audit.append({ op: 'remote.stop', code: 'E_OK', target: 'remote', extra: null });
        resolve({ ok: true, data: state() });
      });
      /* Kapanmayan yuva kalirsa 1 sn sonra zorla. */
      setTimeout(() => resolve({ ok: true, data: state() }), 1000);
    });
  }

  /** Yeni jeton uret → telefonda eslesme yenilenir. */
  function rotate() {
    token = makeToken();
    saveConfig();
    return { ok: true, data: state() };
  }

  /** Jeton yoksa uret (ekran acilinca gostermek icin). */
  function ensureToken() {
    if (token) return token;
    const cfg = loadConfig();
    token = cfg.token || makeToken();
    saveConfig();
    return token;
  }

  return {
    start, stop, state, rotate, ensureToken,
    paths: { filePath },
    /* testler icin */
    _internals: { isPrivateAddress, tokenEquals, makeToken, normalizeToken: (t) => String(t || '').trim().toUpperCase() }
  };
}

module.exports = {
  createRemoteService,
  isPrivateAddress,
  tokenEquals,
  makeToken,
  lanAddresses,
  maskToken
};
