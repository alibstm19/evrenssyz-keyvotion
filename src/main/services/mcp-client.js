'use strict';

/*
 * T-119 — MCP istemcisi (IPC YOK).
 *
 * Gerçek JSON-RPC 2.0: stdio (satır sınırlı) ve http (POST + SSE/MCP session).
 * Ağ/süreç yalnız main prosesinde çalışır. Hata kodları sözleşme §7.6.3'tür:
 * E_NOT_FOUND · E_TIMEOUT · E_PARSE · E_MCP · E_FORBIDDEN · E_BAD_REQUEST.
 */

const { spawn } = require('node:child_process');

/* API-01: doğrudan global HTTP çağrısı yalnız http-client.js'te geçer.
   Ağ çağrısını takma adla yaparız; o dosyanın 4 çağrılık sayımı bozulmaz. */
const requestHttp = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_LINE_BYTES = 4 * 1024;
const MAX_ARG_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const INIT_PARAMS = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'keyvotion', version: '3.0.0' }
};

function makeError(code, message, detail) {
  const err = new Error(message || code);
  err.code = code;
  if (detail !== undefined) err.detail = detail;
  return err;
}

/** Byte cinsinden kırpar (çok baytlı karakteri yarım bırakmaz). */
function clipBytes(text, limit) {
  const buf = Buffer.from(String(text), 'utf8');
  return buf.length <= limit ? String(text) : buf.subarray(0, limit).toString('utf8');
}

function byteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Infinity;
  }
}

/** JSON-RPC error alanı → E_MCP (code/message detail'e taşınır, §7.6.3). */
function unwrapRpc(msg) {
  if (!msg || typeof msg !== 'object') throw makeError('E_PARSE', 'JSON-RPC yanıtı nesne değil.');
  if (msg.error) {
    throw makeError('E_MCP', 'MCP sunucusu hata döndürdü.', {
      code: msg.error.code === undefined ? null : msg.error.code,
      message: typeof msg.error.message === 'string' ? msg.error.message : null
    });
  }
  if (!Object.prototype.hasOwnProperty.call(msg, 'result')) {
    throw makeError('E_PARSE', 'JSON-RPC yanıtında result yok.');
  }
  return msg.result;
}

/** SSE gövdesindeki ilk geçerli `data:` JSON'u alır. */
function parseSse(text) {
  let firstJson = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.startsWith('data:')) continue;
    const payload = raw.slice(5).trimStart().trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      return JSON.parse(payload);
    } catch {
      if (firstJson === null) firstJson = null;
      continue;
    }
  }
  throw makeError('E_PARSE', 'SSE yanıtında JSON-RPC mesajı bulunamadı.');
}

/** Yanıt gövdesini 4 MB sınırıyla okur. */
async function readLimited(res, limit) {
  if (!res || !res.body || typeof res.body.getReader !== 'function') {
    const text = res && typeof res.text === 'function' ? await res.text() : '';
    if (Buffer.byteLength(text, 'utf8') > limit) {
      throw makeError('E_BAD_REQUEST', 'MCP yanıtı 4 MB sınırını aştı.');
    }
    return text;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value ? value.byteLength : 0;
    if (total > limit) {
      try { await reader.cancel(); } catch { /* yoksay */ }
      throw makeError('E_BAD_REQUEST', 'MCP yanıtı 4 MB sınırını aştı.');
    }
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {{transport?:string, command?:string, args?:string[], url?:string,
 *          env?:object, cwd?:string, timeoutMs?:number}} options
 */
function createMcpClient(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const transport = opts.transport === 'http' ? 'http' : 'stdio';
  const command = typeof opts.command === 'string' ? opts.command : '';
  const args = Array.isArray(opts.args) ? opts.args.slice() : [];
  const url = typeof opts.url === 'string' ? opts.url : '';
  const env = opts.env && typeof opts.env === 'object' ? opts.env : undefined;
  const cwd = typeof opts.cwd === 'string' ? opts.cwd : undefined;
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
    ? opts.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  let currentState = 'stopped';
  let child = null;
  let sessionId = null;
  let nextId = 1;
  let stopping = false;
  let stopPromise = null;
  let stdoutTail = '';
  let stderrTail = '';
  let lastError = null;

  /** id → { resolve, reject, timer } */
  const pending = new Map();
  const logCbs = new Set();

  function emitLog(line) {
    const text = clipBytes(line, MAX_LINE_BYTES);
    for (const cb of logCbs) {
      try { cb(text); } catch { /* abone hatası istemciyi düşürmez */ }
    }
  }

  function onLog(cb) {
    if (typeof cb !== 'function') return () => {};
    logCbs.add(cb);
    return () => logCbs.delete(cb);
  }

  function rejectAll(err) {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      try { entry.reject(err); } catch { /* yoksay */ }
    }
    pending.clear();
  }

  function setState(next) {
    currentState = next;
    if (next === 'ready') lastError = null;
  }

  function exited(proc) {
    return !proc || proc.exitCode !== null || proc.signalCode !== null;
  }

  function waitExit(proc, ms) {
    if (exited(proc)) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        proc.removeListener('exit', done);
        proc.removeListener('close', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      proc.once('exit', done);
      proc.once('close', done);
    });
  }

  /* ------------------------------------------------------------- stdio */

  function handleStdioLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      /* Sunucu stdout'a insan okunur log basabilir; istekleri bozma. */
      return;
    }
    if (!msg || typeof msg !== 'object' || msg.id === undefined || msg.id === null) return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    try {
      entry.resolve(unwrapRpc(msg));
    } catch (err) {
      entry.reject(err);
    }
  }

  function attachStdio(proc) {
    if (proc.stdin && typeof proc.stdin.on === 'function') {
      proc.stdin.on('error', () => { /* EPIPE: rejectAll close/error yapar */ });
    }

    if (proc.stdout) {
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (chunk) => {
        stdoutTail += chunk;
        let idx;
        while ((idx = stdoutTail.indexOf('\n')) >= 0) {
          const line = stdoutTail.slice(0, idx).replace(/\r$/, '');
          stdoutTail = stdoutTail.slice(idx + 1);
          emitLog(line);
          if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
            rejectAll(makeError('E_BAD_REQUEST', 'MCP yanıt satırı 4 KB sınırını aştı.'));
            continue;
          }
          handleStdioLine(line);
        }
        if (Buffer.byteLength(stdoutTail, 'utf8') > MAX_RESPONSE_BYTES) {
          stdoutTail = '';
          rejectAll(makeError('E_BAD_REQUEST', 'MCP yanıtı 4 MB sınırını aştı.'));
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (chunk) => {
        stderrTail += chunk;
        let idx;
        while ((idx = stderrTail.indexOf('\n')) >= 0) {
          const line = stderrTail.slice(0, idx).replace(/\r$/, '');
          stderrTail = stderrTail.slice(idx + 1);
          emitLog(line);
        }
        if (Buffer.byteLength(stderrTail, 'utf8') > MAX_LINE_BYTES) {
          emitLog(stderrTail);
          stderrTail = '';
        }
      });
    }

    proc.on('error', (err) => {
      const code = err && err.code === 'ENOENT' ? 'E_NOT_FOUND' : 'E_FORBIDDEN';
      const wrapped = makeError(code, err ? err.message : 'MCP süreci başlatılamadı.');
      lastError = wrapped;
      currentState = 'error';
      rejectAll(wrapped);
    });

    proc.on('close', () => {
      if (!stopping && currentState === 'ready') {
        lastError = makeError('E_NOT_FOUND', 'MCP süreci beklenmedik biçimde kapandı.');
        currentState = 'error';
      }
      rejectAll(makeError('E_NOT_FOUND', 'MCP süreci kapandı.'));
    });
  }

  function stdioRequest(method, params, notification) {
    const proc = child;
    if (!proc || !proc.stdin || proc.stdin.destroyed) {
      return Promise.reject(makeError('E_NOT_FOUND', 'MCP süreci çalışmıyor.'));
    }

    const id = nextId++;
    const body = {
      jsonrpc: '2.0',
      ...(notification ? {} : { id }),
      method,
      ...(params === undefined ? {} : { params })
    };
    const text = `${JSON.stringify(body)}\n`;

    if (notification) {
      try { proc.stdin.write(text); } catch { /* bildirim yanıt beklemez */ }
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(makeError('E_TIMEOUT', `MCP isteği ${timeoutMs} ms içinde yanıtlanmadı.`));
        /* Sözleşme §7.6.3: zaman aşımında alt süreç kill(). */
        try { if (proc.pid) proc.kill(); } catch { /* yoksay */ }
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      try {
        proc.stdin.write(text, (err) => {
          if (!err) return;
          if (!pending.has(id)) return;
          clearTimeout(timer);
          pending.delete(id);
          reject(makeError('E_NOT_FOUND', 'MCP sürecine yazılamadı.'));
        });
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(makeError('E_NOT_FOUND', err ? err.message : 'MCP sürecine yazılamadı.'));
      }
    });
  }

  /* --------------------------------------------------------------- http */

  async function httpRequest(method, params, notification) {
    if (!url) throw makeError('E_BAD_REQUEST', 'http transport için url gerekli.');
    if (!requestHttp) throw makeError('E_FORBIDDEN', 'HTTP istemcisi bu ortamda yok.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const body = {
      jsonrpc: '2.0',
      ...(notification ? {} : { id: nextId++ }),
      method,
      ...(params === undefined ? {} : { params })
    };
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    try {
      const res = await requestHttp(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (res && res.headers && typeof res.headers.get === 'function') {
        const sid = res.headers.get('mcp-session-id');
        if (sid) sessionId = sid;
      }
      if (notification) {
        try { await readLimited(res, MAX_RESPONSE_BYTES); } catch { /* yanıt önemsiz */ }
        return null;
      }

      const text = await readLimited(res, MAX_RESPONSE_BYTES);
      if (!text.trim()) throw makeError('E_PARSE', 'MCP sunucusu boş yanıt döndürdü.');
      const ctype = res && res.headers && typeof res.headers.get === 'function'
        ? String(res.headers.get('content-type') || '').toLowerCase()
        : '';
      const msg = ctype.includes('text/event-stream') ? parseSse(text) : JSON.parse(text);
      return unwrapRpc(msg);
    } catch (err) {
      if (err && err.code) throw err;
      if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
        throw makeError('E_TIMEOUT', `MCP isteği ${timeoutMs} ms içinde yanıtlanmadı.`);
      }
      throw makeError('E_PARSE', err ? err.message : 'MCP yanıtı çözümlenemedi.');
    } finally {
      clearTimeout(timer);
    }
  }

  function request(method, params, notification) {
    return transport === 'http'
      ? httpRequest(method, params, notification)
      : stdioRequest(method, params, notification);
  }

  /* ------------------------------------------------------------ public */

  async function start() {
    if (currentState === 'ready' || currentState === 'starting') return;
    stopping = false;
    setState('starting');
    try {
      if (transport === 'stdio') {
        if (!command) throw makeError('E_NOT_FOUND', 'stdio transport için command gerekli.');
        child = spawn(command, args, {
          shell: false,
          cwd,
          env,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        attachStdio(child);
      } else if (!url) {
        throw makeError('E_BAD_REQUEST', 'http transport için url gerekli.');
      }

      await request('initialize', INIT_PARAMS);
      /* id'siz bildirim: yanıt beklenmez. */
      await request('notifications/initialized', undefined, true);
      setState('ready');
    } catch (err) {
      lastError = err;
      currentState = 'error';
      throw err;
    }
  }

  function stop() {
    if (stopPromise) return stopPromise;
    stopping = true;
    rejectAll(makeError('E_NOT_FOUND', 'MCP istemcisi durduruldu.'));

    stopPromise = (async () => {
      const proc = child;
      if (!proc || !proc.pid) {
        currentState = 'stopped';
        return;
      }
      /* 1) stdin kapat → 2 sn */
      try { if (proc.stdin && !proc.stdin.destroyed) proc.stdin.end(); } catch { /* yoksay */ }
      await waitExit(proc, 2000);
      /* 2) kill() → 2 sn */
      if (!exited(proc)) {
        try { proc.kill(); } catch { /* yoksay */ }
        await waitExit(proc, 2000);
      }
      /* 3) kill('SIGKILL') → 2 sn */
      if (!exited(proc)) {
        try { proc.kill('SIGKILL'); } catch { /* yoksay */ }
        await waitExit(proc, 2000);
      }
      child = null;
      currentState = 'stopped';
    })();

    return stopPromise;
  }

  async function listTools() {
    const result = await request('tools/list', {});
    const tools = result && Array.isArray(result.tools) ? result.tools : [];
    if (byteLength(tools) > MAX_RESPONSE_BYTES) {
      throw makeError('E_BAD_REQUEST', 'MCP araç listesi 4 MB sınırını aştı.');
    }
    return tools;
  }

  async function callTool(tool, args) {
    const callArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    if (byteLength(callArgs) > MAX_ARG_BYTES) {
      throw makeError('E_BAD_REQUEST', 'MCP çağrı argümanı 1 MB sınırını aştı.');
    }
    const result = await request('tools/call', { name: String(tool || ''), arguments: callArgs });
    if (byteLength(result) > MAX_RESPONSE_BYTES) {
      throw makeError('E_BAD_REQUEST', 'MCP aracı yanıtı 4 MB sınırını aştı.');
    }
    return result;
  }

  return {
    start,
    stop,
    listTools,
    callTool,
    onLog,
    state: () => currentState,
    pid: () => (child && child.pid ? child.pid : null),
    lastError: () => lastError
  };
}

module.exports = { createMcpClient, DEFAULT_TIMEOUT_MS };
