'use strict';

/*
 * T-119 — MCP kayıt defteri (IPC YOK).
 *
 * Config: {version:1, servers:[{id,name,transport,command,args,url,envKeys,createdAt}]}
 * Sır YOK: env yalnız ad listesi tutulur; değerler connect anında process.env'den
 * beyaz listeyle okunur. Disk yazımı atomiktir (.tmp + renameSync).
 */

const fs = require('node:fs');
const path = require('node:path');

const { createMcpClient } = require('./mcp-client');

const VERSION = 1;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const ENV_ALLOWLIST = new Set([
  'PATH', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'
]);
const ADD_KEYS = new Set([
  'id', 'name', 'transport', 'command', 'args', 'url', 'envRecord', 'envKeys'
]);
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function makeError(code, message, detail) {
  const err = new Error(message || code);
  err.code = code;
  if (detail !== undefined) err.detail = detail;
  return err;
}

function emptyConfig() {
  return { version: VERSION, servers: [] };
}

/** Dosya yok / bozuk / beklenmeyen biçim → boş config, asla fırlatmaz. */
function readConfig(configPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.servers)) return emptyConfig();
    const servers = parsed.servers.filter((s) => s && typeof s.id === 'string');
    return { version: VERSION, servers };
  } catch {
    return emptyConfig();
  }
}

/** Atomik yazım: .tmp → renameSync (Windows'ta mevcut dosyanın üstüne yazar). */
function writeConfig(configPath, data) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = `${configPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, configPath);
}

function safeEmit(onEvent, packet) {
  if (typeof onEvent !== 'function') return;
  try { onEvent(packet); } catch { /* abone hatası kaydı bozmaz */ }
}

function normalizeTools(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((t) => t && typeof t.name === 'string').map((t) => ({
    name: t.name,
    description: typeof t.description === 'string' ? t.description : '',
    inputSchema: t.inputSchema && typeof t.inputSchema === 'object'
      ? t.inputSchema
      : { type: 'object' }
  }));
}

/**
 * @param {{configPath:string, onEvent?:Function, allowInsecureLoopback?:boolean}} options
 */
function createMcpRegistry(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const configPath = typeof opts.configPath === 'string' && opts.configPath
    ? opts.configPath
    : path.join(process.cwd(), '.keyvotion', 'mcp.json');
  const onEvent = opts.onEvent;
  const allowInsecureLoopback = opts.allowInsecureLoopback === true;
  /* configPath = <proje>/.keyvotion/mcp.json → proje kökü iki üst dizin. */
  const projectRoot = path.dirname(path.dirname(configPath));

  const clients = new Map();
  const states = new Map();
  const toolsCache = new Map();
  const errors = new Map();

  function emit(packet) {
    safeEmit(onEvent, packet);
  }

  function setState(id, state) {
    states.set(id, state);
    emit({ type: 'state', id, state });
  }

  function stateOf(id) {
    return states.get(id) || 'stopped';
  }

  function findServer(id) {
    return readConfig(configPath).servers.find((s) => s.id === id) || null;
  }

  function validateUrl(raw) {
    if (typeof raw !== 'string' || !raw) throw makeError('E_BAD_REQUEST', 'http transport için url gerekli.');
    let parsed;
    try { parsed = new URL(raw); } catch {
      throw makeError('E_BAD_REQUEST', 'MCP url geçersiz.');
    }
    if (parsed.protocol === 'https:') return;
    const loopback = LOOPBACK.has(parsed.hostname);
    if (parsed.protocol === 'http:' && allowInsecureLoopback && loopback) return;
    throw makeError('E_FORBIDDEN', 'MCP sunucusu https zorunludur (yalnız 127.0.0.1 istisnası).');
  }

  /** Yalnız beyaz listedeki adlar; değerler asla diske yazılmaz. */
  function collectEnvKeys(input) {
    const keys = new Set();
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      for (const key of Object.keys(input)) {
        if (!ENV_ALLOWLIST.has(key)) {
          throw makeError('E_FORBIDDEN', `Env anahtarı beyaz listede değil: ${key}`);
        }
        if (typeof input[key] !== 'string') {
          throw makeError('E_BAD_REQUEST', 'Env değeri string olmalı.');
        }
        keys.add(key);
      }
    }
    if (Array.isArray(input)) {
      for (const key of input) {
        if (typeof key !== 'string' || !ENV_ALLOWLIST.has(key)) {
          throw makeError('E_FORBIDDEN', 'Env anahtarı beyaz listede değil.');
        }
        keys.add(key);
      }
    }
    return [...keys];
  }

  function buildEnv(envKeys) {
    const env = {};
    for (const key of envKeys || []) {
      if (ENV_ALLOWLIST.has(key) && process.env[key] !== undefined) env[key] = process.env[key];
    }
    return env;
  }

  /* ------------------------------------------------------------ public */

  function list() {
    const cfg = readConfig(configPath);
    const servers = cfg.servers.map((s) => {
      const client = clients.get(s.id);
      const observed = client ? client.state() : 'stopped';
      const previous = stateOf(s.id);
      if (observed !== previous) {
        if (observed === 'error') {
          const last = client && client.lastError ? client.lastError() : null;
          errors.set(s.id, last && last.message ? last.message : 'MCP süreci hatası.');
        }
        setState(s.id, observed);
      }
      return {
        id: s.id,
        name: typeof s.name === 'string' ? s.name : s.id,
        transport: s.transport === 'http' ? 'http' : 'stdio',
        state: stateOf(s.id),
        toolCount: (toolsCache.get(s.id) || []).length,
        lastError: errors.get(s.id) || null,
        pid: client ? client.pid() : null
      };
    });
    return { servers, configPath, version: VERSION };
  }

  function add(input) {
    const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    for (const key of Object.keys(body)) {
      if (!ADD_KEYS.has(key)) {
        throw makeError('E_BAD_REQUEST', 'Şema dışı alan gönderildi.');
      }
    }

    const id = body.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      throw makeError('E_BAD_REQUEST', 'MCP id biçimi geçersiz.');
    }
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 64) {
      throw makeError('E_BAD_REQUEST', 'MCP adı gerekli (en fazla 64 karakter).');
    }
    const transport = body.transport;
    if (transport !== 'stdio' && transport !== 'http') {
      throw makeError('E_BAD_REQUEST', 'transport yalnız stdio veya http olabilir.');
    }

    const cfg = readConfig(configPath);
    if (cfg.servers.some((s) => s.id === id)) {
      throw makeError('E_CONFLICT', 'Bu MCP id zaten kayıtlı.');
    }

    const server = {
      id,
      name: body.name,
      transport,
      command: null,
      args: [],
      url: null,
      envKeys: [],
      createdAt: new Date().toISOString()
    };

    if (transport === 'stdio') {
      if (typeof body.command !== 'string' || !body.command.trim()) {
        throw makeError('E_BAD_REQUEST', 'stdio transport için command zorunludur.');
      }
      if (body.args !== undefined) {
        if (!Array.isArray(body.args) || body.args.length > 32
          || !body.args.every((a) => typeof a === 'string')) {
          throw makeError('E_BAD_REQUEST', 'args en fazla 32 string öğe olabilir.');
        }
        server.args = body.args.slice();
      }
      server.command = body.command;
      if (body.envRecord !== undefined) server.envKeys = collectEnvKeys(body.envRecord);
      if (body.envKeys !== undefined) {
        server.envKeys = [...new Set([...server.envKeys, ...collectEnvKeys(body.envKeys)])];
      }
    } else {
      validateUrl(body.url);
      server.url = body.url;
    }

    cfg.servers.push(server);
    writeConfig(configPath, cfg);
    states.set(id, 'stopped');
    emit({ type: 'state', id, state: 'stopped' });
    return { id, state: 'stopped' };
  }

  async function remove(id) {
    if (typeof id !== 'string' || !id) throw makeError('E_BAD_REQUEST', 'MCP id gerekli.');
    const cfg = readConfig(configPath);
    if (!cfg.servers.some((s) => s.id === id)) throw makeError('E_NOT_FOUND', 'MCP sunucusu bulunamadı.');

    const client = clients.get(id);
    if (client) {
      try { await client.stop(); } catch { /* yoksay */ }
      clients.delete(id);
    }
    toolsCache.delete(id);
    errors.delete(id);
    states.delete(id);

    cfg.servers = cfg.servers.filter((s) => s.id !== id);
    writeConfig(configPath, cfg);
    emit({ type: 'state', id, state: 'stopped' });
    return { id, removed: true };
  }

  async function connect(id) {
    const server = findServer(id);
    if (!server) throw makeError('E_NOT_FOUND', 'MCP sunucusu bulunamadı.');

    const existing = clients.get(id);
    if (existing && existing.state() === 'ready') {
      return { id, state: 'ready', tools: toolsCache.get(id) || [] };
    }
    if (existing) {
      try { await existing.stop(); } catch { /* yoksay */ }
      clients.delete(id);
    }

    setState(id, 'starting');
    const client = createMcpClient({
      transport: server.transport,
      command: server.command || undefined,
      args: Array.isArray(server.args) ? server.args : [],
      url: server.url || undefined,
      env: buildEnv(server.envKeys),
      cwd: projectRoot
    });
    clients.set(id, client);
    client.onLog((line) => emit({ type: 'log', id, line }));

    try {
      await client.start();
      const tools = normalizeTools(await client.listTools());
      toolsCache.set(id, tools);
      errors.delete(id);
      setState(id, 'ready');
      emit({ type: 'tools', id, tools });
      return { id, state: 'ready', tools };
    } catch (err) {
      errors.set(id, err && err.message ? err.message : 'MCP bağlantısı kurulamadı.');
      setState(id, 'error');
      emit({ type: 'log', id, line: `[error] ${errors.get(id)}` });
      throw err;
    }
  }

  async function tools(id) {
    const cached = toolsCache.get(id);
    const client = clients.get(id);
    if (cached && client && client.state() === 'ready') return { id, tools: cached };
    await connect(id);
    return { id, tools: toolsCache.get(id) || [] };
  }

  async function call(id, tool, args) {
    const client = clients.get(id);
    if (!client || client.state() !== 'ready') await connect(id);
    const active = clients.get(id);
    const result = await active.callTool(tool, args);
    return { id, tool, result };
  }

  async function disconnect(id) {
    if (typeof id !== 'string' || !id) throw makeError('E_BAD_REQUEST', 'MCP id gerekli.');
    if (!findServer(id)) throw makeError('E_NOT_FOUND', 'MCP sunucusu bulunamadı.');
    const client = clients.get(id);
    if (client) {
      try { await client.stop(); } catch { /* yoksay */ }
      clients.delete(id);
    }
    toolsCache.delete(id);
    errors.delete(id);
    setState(id, 'stopped');
    return { id, state: 'stopped' };
  }

  async function shutdown() {
    const active = [...clients.entries()];
    clients.clear();
    await Promise.all(active.map(async ([id, client]) => {
      try { await client.stop(); } catch { /* yoksay */ }
      states.set(id, 'stopped');
    }));
  }

  return { list, add, remove, connect, disconnect, tools, call, shutdown };
}

module.exports = { createMcpRegistry, ENV_ALLOWLIST };
