'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/*
 * NOT (sandbox:true): preload yalniz `electron` require edebilir; bu yuzden
 * kanal adlari burada birebir tutulur. Kaynak: src/shared/ipc-channels.js
 * (API-46). Iki dosya AYNI ANDA degistirilmelidir.
 */
const CH = {
  APP_PING: 'kv:app:ping',
  APP_INFO: 'kv:app:info',

  TEAM_LIST: 'kv:team:list',
  TEAM_ADD: 'kv:team:add',
  TEAM_REMOVE: 'kv:team:remove',
  TEAM_SET_LEADER: 'kv:team:setLeader',
  TEAM_PLAN: 'kv:team:plan',
  TEAM_APPLY: 'kv:team:apply',

  COMMAND_SEND: 'kv:command:send',
  COMMAND_INTERRUPT: 'kv:command:interrupt',
  COMMAND_MESSAGES: 'kv:command:messages',

  BOARD_READ: 'kv:board:read',
  BOARD_WRITE: 'kv:board:write',

  MODELS_CATALOG: 'kv:models:catalog',
  MODELS_ASSIGN: 'kv:models:assign',
  MODELS_LIST: 'kv:models:list',
  MODELS_DIR: 'kv:models:dir',
  MODELS_INSTALL: 'kv:models:install',
  MODELS_CANCEL: 'kv:models:cancel',
  MODELS_VERIFY: 'kv:models:verify',
  MODELS_REMOVE: 'kv:models:remove',

  REPORTS_LIST: 'kv:reports:list',

  SETTINGS_GET: 'kv:settings:get',
  SETTINGS_SET: 'kv:settings:set',
  SECRET_SET: 'kv:secret:set',
  SECRET_STATE: 'kv:secret:state',

  ROSTER_READ: 'kv:roster:read',
  ROSTER_WRITE: 'kv:roster:write',

  MEMORY_READ: 'kv:memory:read',
  MEMORY_WRITE: 'kv:memory:write',
  MEMORY_SEARCH: 'kv:memory:search',
  MEMORY_CONTEXT: 'kv:memory:context',

  PROJECT_LIST: 'kv:project:list',
  PROJECT_CREATE: 'kv:project:create',
  PROJECT_SWITCH: 'kv:project:switch',
  PROJECT_ARCHIVE: 'kv:project:archive',

  PROVIDER_LIST: 'kv:provider:list',
  PROVIDER_SAVE: 'kv:provider:save',
  PROVIDER_KEY_ADD: 'kv:provider:keyAdd',
  PROVIDER_KEY_REMOVE: 'kv:provider:keyRemove',
  PROVIDER_TEST: 'kv:provider:test',
  PROVIDER_FAILOVER: 'kv:provider:failover',

  SKILL_LIST: 'kv:skill:list',
  SKILL_SAVE: 'kv:skill:save',
  SKILL_REMOVE: 'kv:skill:remove',

  PERMISSION_GET: 'kv:permission:get',
  PERMISSION_SET: 'kv:permission:set',

  BROWSER_OPEN: 'kv:browser:open',
  BROWSER_NAVIGATE: 'kv:browser:navigate',
  BROWSER_HISTORY: 'kv:browser:history',
  BROWSER_CLOSE: 'kv:browser:close',
  BROWSER_STATE: 'kv:browser:state',
  BROWSER_EXTRACT: 'kv:browser:extract',

  CHAT_LIST: 'kv:chat:list',
  CHAT_GET: 'kv:chat:get',
  CHAT_CREATE: 'kv:chat:create',
  CHAT_SEND: 'kv:chat:send',
  CHAT_RENAME: 'kv:chat:rename',
  CHAT_REMOVE: 'kv:chat:remove',
  CHAT_PREVIEW: 'kv:chat:preview',

  REMOTE_STATE: 'kv:remote:state',
  REMOTE_START: 'kv:remote:start',
  REMOTE_STOP: 'kv:remote:stop',
  REMOTE_ROTATE: 'kv:remote:rotate',

  GUIDE_STATE: 'kv:guide:state',
  GUIDE_UPDATE: 'kv:guide:update',

  SERVER_STATUS: 'kv:server:status',
  SERVER_START: 'kv:server:start',
  SERVER_STOP: 'kv:server:stop',

  BROWSER_SUMMARIZE: 'kv:browser:summarize',

  MEMORY_AUTO: 'kv:memory:auto',
  MEMORY_GRAPH: 'kv:memory:graph',

  VOICE_ASK: 'kv:voice:ask',
  VOICE_SPEAK: 'kv:voice:speak',
  VOICE_TRANSCRIBE: 'kv:voice:transcribe',

  VOTION_ACT: 'kv:votion:act',

  TEAMS_LIST: 'kv:teams:list',
  TEAMS_ACT: 'kv:teams:act',

  PLAN_LIST: 'kv:plan:list',
  PLAN_ACT: 'kv:plan:act',

  FILES_LIST: 'kv:files:list',
  FILES_READ: 'kv:files:read',
  FILES_CONTEXT: 'kv:files:context',

  EVENT_SUBSCRIBE: 'kv:event:subscribe',
  EVENT_PATCH: 'kv:event:patch',
  EVENT_CONNECTION: 'kv:event:connection',
  EVENT_MODEL: 'kv:event:model',

  AUDIT_LIST: 'kv:audit:list',

  /* --- Tur 12 (v3.0 — baglanti katmani, T-119); shared dosyayla 1:1 --- */
  MCP_LIST: 'kv:mcp:list',
  MCP_ADD: 'kv:mcp:add',
  MCP_REMOVE: 'kv:mcp:remove',
  MCP_CONNECT: 'kv:mcp:connect',
  MCP_TOOLS: 'kv:mcp:tools',
  MCP_CALL: 'kv:mcp:call',

  INTEGRATION_LIST: 'kv:integration:list',
  INTEGRATION_SAVE: 'kv:integration:save',
  INTEGRATION_REMOVE: 'kv:integration:remove',
  INTEGRATION_TEST: 'kv:integration:test',
  INTEGRATION_CAPABILITIES: 'kv:integration:capabilities',
  INTEGRATION_INVOKE: 'kv:integration:invoke',

  EVENT_MCP: 'kv:event:mcp',
  EVENT_INTEGRATION: 'kv:event:integration',

  /* --- Tur 13 (v3.1 — OAuth2 + MCP katalog, T-137); shared dosyayla 1:1 --- */
  MCP_CATALOG_LIST: 'kv:mcp-catalog:list',
  MCP_CATALOG_INSTALL: 'kv:mcp-catalog:install',
  OAUTH_START: 'kv:oauth:start',
  OAUTH_STATUS: 'kv:oauth:status',
  OAUTH_REVOKE: 'kv:oauth:revoke',

  /* --- Tur 14 (v3.2 — hazır bağlantılar + Votion erişimi, T-146); shared 1:1 --- */
  PRESET_LIST: 'kv:preset:list',
  PRESET_APPLY: 'kv:preset:apply',
  VOTION_TOOLS: 'kv:votion:tools',
  VOTION_INVOKE: 'kv:votion:invoke'
};

const INVOKE_TIMEOUT_MS = 10000;
/* Uygulama ici tarayici acilirken ag gecidi yavas olabilir; 10 sn yetmez. */
const SLOW_TIMEOUT_MS = 30000;

const INTERNAL_ERROR = Object.freeze({
  ok: false,
  error: {
    code: 'E_INTERNAL',
    message: 'Beklenmeyen hata.',
    status: null,
    retryable: false,
    detail: null
  }
});

const TIMEOUT_ERROR = Object.freeze({
  ok: false,
  error: {
    code: 'E_TIMEOUT',
    message: 'Sunucu yanıt vermedi.',
    status: null,
    retryable: true,
    detail: null
  }
});

function isEnvelope(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.ok !== 'boolean') return false;
  if (value.ok === true) return true;
  return Boolean(value.error) && typeof value.error === 'object'
    && typeof value.error.code === 'string';
}

/**
 * Tek giris noktasi: zaman asimi + zarf dogrulama (API-55 / API-56).
 * @param {string} channel
 * @param {object} [payload]
 * @param {number} [timeoutMs]
 */
async function invoke(channel, payload, timeoutMs = INVOKE_TIMEOUT_MS) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT_ERROR), timeoutMs);
  });

  try {
    const result = await Promise.race([
      ipcRenderer.invoke(channel, payload === undefined ? {} : payload),
      timeout
    ]);
    return isEnvelope(result) ? result : INTERNAL_ERROR;
  } catch {
    return INTERNAL_ERROR;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------------------
 * Onay anahtari (API-41 / API-51) — YM karari T-029
 *
 * Kopru token URETMEZ. Yazma kanallarinin `confirmToken` alanini renderer
 * kendi onay modalindan sonra uretir (crypto.getRandomValues, 48 karakter).
 * Preload yalnizca renderer'in gonderdigi degeri oldugu gibi iletir.
 *
 * Token yoksa main `E_CONFIRM_REQUIRED` doner — bu DOGRU davranistir; koprude
 * token uretmek UI onay kapisini bosa cikarir ve tek kullanim/TTL denetimini
 * anlamsizlastirirdi.
 * ------------------------------------------------------------------------- */

/** Beyaz liste disindaki kanal adlari cagrilamaz (API-50). */
function call(channel, timeoutMs) {
  return (payload) => {
    // Yuku aynen gecir; `confirmToken` varsa korunur, yoksa eklenmez.
    const body = payload && typeof payload === 'object' ? payload : {};
    return invoke(channel, body, timeoutMs);
  };
}

const api = {
  // Geriye uyumluluk (T-011 iskeleti)
  ping: call(CH.APP_PING),
  getInfo: call(CH.APP_INFO),

  app: {
    ping: call(CH.APP_PING),
    info: call(CH.APP_INFO)
  },

  team: {
    list: call(CH.TEAM_LIST),
    add: call(CH.TEAM_ADD),
    remove: call(CH.TEAM_REMOVE),
    setLeader: call(CH.TEAM_SET_LEADER),
    plan: call(CH.TEAM_PLAN, SLOW_TIMEOUT_MS),
    apply: call(CH.TEAM_APPLY, SLOW_TIMEOUT_MS)
  },

  command: {
    send: call(CH.COMMAND_SEND),
    interrupt: call(CH.COMMAND_INTERRUPT),
    messages: call(CH.COMMAND_MESSAGES)
  },

  board: {
    read: call(CH.BOARD_READ),
    write: call(CH.BOARD_WRITE)
  },

  models: {
    catalog: call(CH.MODELS_CATALOG),
    assign: call(CH.MODELS_ASSIGN),
    /* T11-1 — yerel envanter (uzak katalogdan ayri; §7.5).
       `dir` native klasor secicisini acar: kullanici diyalogu 130 sn beklenir. */
    list: call(CH.MODELS_LIST),
    dir: call(CH.MODELS_DIR, 130000),
    install: call(CH.MODELS_INSTALL, SLOW_TIMEOUT_MS),
    cancel: call(CH.MODELS_CANCEL, SLOW_TIMEOUT_MS),
    verify: call(CH.MODELS_VERIFY, SLOW_TIMEOUT_MS),
    remove: call(CH.MODELS_REMOVE, SLOW_TIMEOUT_MS)
  },

  audit: {
    list: call(CH.AUDIT_LIST)
  },

  reports: {
    list: call(CH.REPORTS_LIST)
  },

  settings: {
    get: call(CH.SETTINGS_GET),
    set: call(CH.SETTINGS_SET)
  },

  secret: {
    set: call(CH.SECRET_SET),
    state: call(CH.SECRET_STATE)
  },

  roster: {
    read: call(CH.ROSTER_READ),
    write: call(CH.ROSTER_WRITE)
  },

  /* ---------------------------- Tur 4 ---------------------------- */

  memory: {
    read: call(CH.MEMORY_READ),
    write: call(CH.MEMORY_WRITE),
    search: call(CH.MEMORY_SEARCH),
    context: call(CH.MEMORY_CONTEXT),
    auto: call(CH.MEMORY_AUTO),
    graph: call(CH.MEMORY_GRAPH)
  },

  project: {
    list: call(CH.PROJECT_LIST),
    create: call(CH.PROJECT_CREATE),
    switch: call(CH.PROJECT_SWITCH),
    archive: call(CH.PROJECT_ARCHIVE)
  },

  provider: {
    list: call(CH.PROVIDER_LIST),
    save: call(CH.PROVIDER_SAVE),
    addKey: call(CH.PROVIDER_KEY_ADD),
    removeKey: call(CH.PROVIDER_KEY_REMOVE),
    test: call(CH.PROVIDER_TEST, SLOW_TIMEOUT_MS),
    failover: call(CH.PROVIDER_FAILOVER, SLOW_TIMEOUT_MS)
  },

  skill: {
    list: call(CH.SKILL_LIST),
    save: call(CH.SKILL_SAVE),
    remove: call(CH.SKILL_REMOVE)
  },

  permission: {
    get: call(CH.PERMISSION_GET),
    set: call(CH.PERMISSION_SET)
  },

  browser: {
    open: call(CH.BROWSER_OPEN, SLOW_TIMEOUT_MS),
    navigate: call(CH.BROWSER_NAVIGATE, SLOW_TIMEOUT_MS),
    history: call(CH.BROWSER_HISTORY, SLOW_TIMEOUT_MS),
    extract: call(CH.BROWSER_EXTRACT, SLOW_TIMEOUT_MS),
    summarize: call(CH.BROWSER_SUMMARIZE, SLOW_TIMEOUT_MS),
    close: call(CH.BROWSER_CLOSE),
    state: call(CH.BROWSER_STATE)
  },

  /* ---------------------------- Tur 5 ---------------------------- */

  chat: {
    list: call(CH.CHAT_LIST),
    get: call(CH.CHAT_GET),
    create: call(CH.CHAT_CREATE),
    send: call(CH.CHAT_SEND, 130000),
    rename: call(CH.CHAT_RENAME),
    remove: call(CH.CHAT_REMOVE),
    preview: call(CH.CHAT_PREVIEW)
  },

  remote: {
    state: call(CH.REMOTE_STATE),
    start: call(CH.REMOTE_START, SLOW_TIMEOUT_MS),
    stop: call(CH.REMOTE_STOP, SLOW_TIMEOUT_MS),
    rotate: call(CH.REMOTE_ROTATE)
  },

  /* ---------------------------- Tur 6 ---------------------------- */

  guide: {
    state: call(CH.GUIDE_STATE),
    update: call(CH.GUIDE_UPDATE)
  },

  server: {
    status: call(CH.SERVER_STATUS, SLOW_TIMEOUT_MS),
    start: call(CH.SERVER_START, SLOW_TIMEOUT_MS),
    stop: call(CH.SERVER_STOP, SLOW_TIMEOUT_MS)
  },

  voice: {
    ask: call(CH.VOICE_ASK, 130000),
    speak: call(CH.VOICE_SPEAK, 130000),
    transcribe: call(CH.VOICE_TRANSCRIBE, 130000)
  },

  votion: {
    act: call(CH.VOTION_ACT, SLOW_TIMEOUT_MS),
    /* T-198: onaylı komut 120 sn'ye kadar sürebilir — köprü zaman aşımı üstte. */
    exec: call(CH.VOTION_ACT, 180000),
    grants: call(CH.VOTION_ACT),
    tools: call(CH.VOTION_TOOLS),
    invoke: call(CH.VOTION_INVOKE, SLOW_TIMEOUT_MS)
  },

  teams: {
    list: call(CH.TEAMS_LIST),
    act: call(CH.TEAMS_ACT)
  },

  plan: {
    list: call(CH.PLAN_LIST),
    act: call(CH.PLAN_ACT)
  },

  files: {
    list: call(CH.FILES_LIST),
    read: call(CH.FILES_READ),
    context: call(CH.FILES_CONTEXT)
  },

  /* ---------------------------- Tur 12 ---------------------------- */

  mcp: {
    list: call(CH.MCP_LIST),
    add: call(CH.MCP_ADD),
    remove: call(CH.MCP_REMOVE),
    connect: call(CH.MCP_CONNECT, SLOW_TIMEOUT_MS),
    tools: call(CH.MCP_TOOLS),
    call: call(CH.MCP_CALL, 130000)
  },

  /* Servis T-120'de; main baglantisi T-122'de. Kopru su an hazir. */
  integration: {
    list: call(CH.INTEGRATION_LIST),
    save: call(CH.INTEGRATION_SAVE),
    remove: call(CH.INTEGRATION_REMOVE),
    test: call(CH.INTEGRATION_TEST, 130000),
    capabilities: call(CH.INTEGRATION_CAPABILITIES),
    invoke: call(CH.INTEGRATION_INVOKE, 130000)
  },

  /* ---------------------------- Tur 13 (T-137) ---------------------------- */

  mcpCatalog: {
    list: call(CH.MCP_CATALOG_LIST),
    install: call(CH.MCP_CATALOG_INSTALL)
  },

  /* start, tarayici onayini bekler (120 sn) — uzun zaman asimi. */
  oauth: {
    start: call(CH.OAUTH_START, 130000),
    status: call(CH.OAUTH_STATUS),
    revoke: call(CH.OAUTH_REVOKE)
  },

  /* ---------------------------- Tur 14 (T-146) ---------------------------- */

  preset: {
    list: call(CH.PRESET_LIST),
    apply: call(CH.PRESET_APPLY, 130000)
  },

  /**
   * Push aboneligi: `{domain, payload, at}` (patch) veya `{state, at}` (baglanti).
   * @param {(event: object) => void} callback
   * @returns {() => void} abonelikten cik
   */
  onEvent(callback) {
    if (typeof callback !== 'function') return () => {};

    const onPatch = (_event, data) => callback({ kind: 'patch', ...data });
    const onConnection = (_event, data) => callback({ kind: 'connection', ...data });

    ipcRenderer.on(CH.EVENT_PATCH, onPatch);
    ipcRenderer.on(CH.EVENT_CONNECTION, onConnection);

    return () => {
      ipcRenderer.removeListener(CH.EVENT_PATCH, onPatch);
      ipcRenderer.removeListener(CH.EVENT_CONNECTION, onConnection);
    };
  },

  /**
   * T11-1 — yerel model ilerleme push'u (`kv:event:model`, §7.5).
   * Paket: `{type, jobId, modelID, state, receivedBytes, totalBytes, percent, etaSec, at}`.
   * Kanal yonu tek yonludur (main → renderer); bu yuzden invoke koprusu YOKTUR.
   * @param {(progress: object) => void} callback
   * @returns {() => void} abonelikten cik
   */
  onModelProgress(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(CH.EVENT_MODEL, listener);
    return () => ipcRenderer.removeListener(CH.EVENT_MODEL, listener);
  },

  /**
   * T-119 — MCP olaylari (`kv:event:mcp`): `{type:'state'|'log'|'tools', id, ...}`.
   * @returns {() => void} abonelikten cik
   */
  onMcp(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(CH.EVENT_MCP, listener);
    return () => ipcRenderer.removeListener(CH.EVENT_MCP, listener);
  },

  /**
   * T-119 — Entegrasyon olaylari (`kv:event:integration`).
   * @returns {() => void} abonelikten cik
   */
  onIntegration(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(CH.EVENT_INTEGRATION, listener);
    return () => ipcRenderer.removeListener(CH.EVENT_INTEGRATION, listener);
  },

  /** SSE aboneligini baslatir (idempotent). */
  subscribeEvents: call(CH.EVENT_SUBSCRIBE)
};

contextBridge.exposeInMainWorld('keyvotion', api);
