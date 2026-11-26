'use strict';

/**
 * IPC kanal adlari — TEK KAYNAK (docs/console-api-contract.md API-46).
 * Kural: kv:<domain>:<action>
 *
 * NOT: sandbox:true altinda preload yalniz `electron` ve polyfill modulleri
 * require edebilir; bu yuzden src/preload/preload.js kanal adlarini birebir
 * ayni sirada kendi icinde tutar. Iki dosya ayni anda degistirilmelidir.
 */

const CHANNELS = Object.freeze({
  // --- app ---
  APP_PING: 'kv:app:ping',
  APP_INFO: 'kv:app:info',

  // --- team (F1 / F8) ---
  TEAM_LIST: 'kv:team:list',
  TEAM_ADD: 'kv:team:add',
  TEAM_REMOVE: 'kv:team:remove',
  TEAM_SET_LEADER: 'kv:team:setLeader',
  /* Otomatik ekip kurucu (T-205): plan model cagrisidir (yazma yok),
     apply kadroyu diske yazar (confirmToken zorunlu). */
  TEAM_PLAN: 'kv:team:plan',
  TEAM_APPLY: 'kv:team:apply',

  // --- command (F2 / F7) ---
  COMMAND_SEND: 'kv:command:send',
  COMMAND_INTERRUPT: 'kv:command:interrupt',
  COMMAND_MESSAGES: 'kv:command:messages',

  // --- board (F3) ---
  BOARD_READ: 'kv:board:read',
  BOARD_WRITE: 'kv:board:write',

  // --- models (F4) ---
  MODELS_CATALOG: 'kv:models:catalog',
  MODELS_ASSIGN: 'kv:models:assign',

  /* --- yerel model envanteri (T11-1, v2.9) ---
   * `kv:models:catalog` uzak SAGLAYICI katalogudur; buradakiler yerel DOSYA
   * envanteridir (indirme/kurulum). Ikisi ayri seydir, ayni domain'i paylasir. */
  MODELS_LIST: 'kv:models:list',
  MODELS_DIR: 'kv:models:dir',
  MODELS_INSTALL: 'kv:models:install',
  MODELS_CANCEL: 'kv:models:cancel',
  MODELS_VERIFY: 'kv:models:verify',
  MODELS_REMOVE: 'kv:models:remove',

  // --- reports (F5) ---
  REPORTS_LIST: 'kv:reports:list',

  // --- settings / secret (F6) ---
  SETTINGS_GET: 'kv:settings:get',
  SETTINGS_SET: 'kv:settings:set',
  SECRET_SET: 'kv:secret:set',
  SECRET_STATE: 'kv:secret:state',

  // --- roster (F6 / F8) ---
  ROSTER_READ: 'kv:roster:read',
  ROSTER_WRITE: 'kv:roster:write',

  /* ================= TUR 4 ================= */

  // --- hafiza (T4-3) ---
  MEMORY_READ: 'kv:memory:read',
  MEMORY_WRITE: 'kv:memory:write',
  MEMORY_SEARCH: 'kv:memory:search',
  MEMORY_CONTEXT: 'kv:memory:context',

  // --- projeler (T4-2) ---
  PROJECT_LIST: 'kv:project:list',
  PROJECT_CREATE: 'kv:project:create',
  PROJECT_SWITCH: 'kv:project:switch',
  PROJECT_ARCHIVE: 'kv:project:archive',

  // --- saglayicilar + coklu anahtar failover (T4-6) ---
  PROVIDER_LIST: 'kv:provider:list',
  PROVIDER_SAVE: 'kv:provider:save',
  PROVIDER_KEY_ADD: 'kv:provider:keyAdd',
  PROVIDER_KEY_REMOVE: 'kv:provider:keyRemove',
  PROVIDER_TEST: 'kv:provider:test',
  PROVIDER_FAILOVER: 'kv:provider:failover',

  // --- beceriler (T4-4) ---
  SKILL_LIST: 'kv:skill:list',
  SKILL_SAVE: 'kv:skill:save',
  SKILL_REMOVE: 'kv:skill:remove',

  // --- izin matrisi (T4-4) ---
  PERMISSION_GET: 'kv:permission:get',
  PERMISSION_SET: 'kv:permission:set',

  // --- uygulama ici tarayici (T4-5, main proses WebContentsView) ---
  BROWSER_OPEN: 'kv:browser:open',
  BROWSER_NAVIGATE: 'kv:browser:navigate',
  BROWSER_HISTORY: 'kv:browser:history',
  BROWSER_CLOSE: 'kv:browser:close',
  BROWSER_STATE: 'kv:browser:state',
  BROWSER_EXTRACT: 'kv:browser:extract',

  /* ================= TUR 5 ================= */

  // --- dogrudan model sohbeti (T5-2) ---
  CHAT_LIST: 'kv:chat:list',
  CHAT_GET: 'kv:chat:get',
  CHAT_CREATE: 'kv:chat:create',
  CHAT_SEND: 'kv:chat:send',
  CHAT_RENAME: 'kv:chat:rename',
  CHAT_REMOVE: 'kv:chat:remove',
  CHAT_PREVIEW: 'kv:chat:preview',

  // --- telefondan uzaktan kontrol (T5-4) ---
  REMOTE_STATE: 'kv:remote:state',
  REMOTE_START: 'kv:remote:start',
  REMOTE_STOP: 'kv:remote:stop',
  REMOTE_ROTATE: 'kv:remote:rotate',

  /* ================= TUR 6 ================= */

  // --- rehber / ilk kurulum (T6-1) ---
  GUIDE_STATE: 'kv:guide:state',
  GUIDE_UPDATE: 'kv:guide:update',

  // --- yerel OpenCode sunucusu (T6-6) ---
  SERVER_STATUS: 'kv:server:status',
  SERVER_START: 'kv:server:start',
  SERVER_STOP: 'kv:server:stop',

  // --- sayfa ozeti (T6-3) ---
  BROWSER_SUMMARIZE: 'kv:browser:summarize',

  // --- hafiza otomatigi + zihin haritasi (T6-4) ---
  MEMORY_AUTO: 'kv:memory:auto',
  MEMORY_GRAPH: 'kv:memory:graph',

  // --- Votion sesli asistan (T6-8) ---
  VOICE_ASK: 'kv:voice:ask',
  VOICE_SPEAK: 'kv:voice:speak',
  VOICE_TRANSCRIBE: 'kv:voice:transcribe',

  /* ================= TUR 8 ================= */

  // --- Votion masaüstü eylemleri (T8-2): beyaz liste + onay kapısı ---
  VOTION_ACT: 'kv:votion:act',

  // --- çoklu ekip (T8-5): ayrı lider, ayrı bütçe ---
  TEAMS_LIST: 'kv:teams:list',
  TEAMS_ACT: 'kv:teams:act',

  // --- planlar / notlar / zamanlanmış görevler (T8-6) ---
  PLAN_LIST: 'kv:plan:list',
  PLAN_ACT: 'kv:plan:act',

  // --- dosyalar + bağlam (T8-7): salt okuma, proje köküne kilitli ---
  FILES_LIST: 'kv:files:list',
  FILES_READ: 'kv:files:read',
  FILES_CONTEXT: 'kv:files:context',

  // --- events (push + subscribe) ---
  EVENT_SUBSCRIBE: 'kv:event:subscribe',
  EVENT_PATCH: 'kv:event:patch',
  EVENT_CONNECTION: 'kv:event:connection',

  /* --- yerel model ilerlemesi (push, T11-1): %4/sn, alan adlari §7.5 --- */
  EVENT_MODEL: 'kv:event:model',

  /* --- denetim gunlugu (T11-1): yalniz UST VERI, metin/sir yok (API-30) --- */
  AUDIT_LIST: 'kv:audit:list',

  /* ================= TUR 12 (v3.0 — baglanti katmani, T-119) ================= */

  // --- MCP istemcisi (6 invoke) ---
  MCP_LIST: 'kv:mcp:list',
  MCP_ADD: 'kv:mcp:add',
  MCP_REMOVE: 'kv:mcp:remove',
  MCP_CONNECT: 'kv:mcp:connect',
  MCP_TOOLS: 'kv:mcp:tools',
  MCP_CALL: 'kv:mcp:call',

  // --- Entegrasyon kayit defteri (6 invoke; servis T-120, baglama T-122) ---
  INTEGRATION_LIST: 'kv:integration:list',
  INTEGRATION_SAVE: 'kv:integration:save',
  INTEGRATION_REMOVE: 'kv:integration:remove',
  INTEGRATION_TEST: 'kv:integration:test',
  INTEGRATION_CAPABILITIES: 'kv:integration:capabilities',
  INTEGRATION_INVOKE: 'kv:integration:invoke',

  // --- push (main -> renderer, tek yon) ---
  EVENT_MCP: 'kv:event:mcp',
  EVENT_INTEGRATION: 'kv:event:integration',

  /* ================= TUR 13 (v3.1 — OAuth2 + MCP katalog, T-137) ================= */

  // --- MCP sunucu şablon kataloğu (2 invoke; list salt okuma, install yazma) ---
  MCP_CATALOG_LIST: 'kv:mcp-catalog:list',
  MCP_CATALOG_INSTALL: 'kv:mcp-catalog:install',

  // --- OAuth2 hesap bağlantısı (3 invoke; start/revoke yazma, status okuma) ---
  OAUTH_START: 'kv:oauth:start',
  OAUTH_STATUS: 'kv:oauth:status',
  OAUTH_REVOKE: 'kv:oauth:revoke',

  /* ================= TUR 14 (v3.2 — hazır bağlantılar + Votion erişimi, T-146) ================= */

  // --- hazır bağlantı şablonları (list okuma, apply yazma) ---
  PRESET_LIST: 'kv:preset:list',
  PRESET_APPLY: 'kv:preset:apply',

  // --- Votion araç erişimi (tools okuma, invoke yazma) ---
  VOTION_TOOLS: 'kv:votion:tools',
  VOTION_INVOKE: 'kv:votion:invoke'
});

/** Yazma yapan (confirmToken isteyen) kanallar — API-51.
 *  T-052: SECRET_SET kapisi zorunlu hale geldi (canli kanit: rule:missing/reuse)
 *  ve SETTINGS_SET bilincli olarak listede DEGIL (yerel tercih, sir yazmaz;
 *  main.js'te gerekce yorumuyla token ISTENIRSE dogrulanir).
 *
 *  T4: hafiza/proje/saglayici/beceri/izin yazan tum kanallar eklendi.
 *  PROVIDER_TEST / PROVIDER_FAILOVER yalniz AG cagrisi yapar (disk yazmaz) —
 *  kapsam disi; BROWSER_* de veri yazmaz (yalniz gorunum). */
/** Push (main → renderer, tek yönlü) kanalları — API-49.
 *  Bu kanallar invoke EDİLMEZ; yalnız `ipcRenderer.on` ile dinlenir.
 *  T-108: push kümesinin TEK KAYNAĞI burasıdır. Testler
 *  (`tests/tur10/contract-derive.test.js`, `tests/tur2/ipc-channels.test.js`,
 *  `tests/tur2/ipc-parity.test.js`) ve `tools/doctor.js` kendi listelerini
 *  elle yazmaz; bu değerlerden türetir. Kanal DEĞERLERİ `CHANNELS` içinde
 *  yaşamak zorundadır (sözleşme §7.2 **push** satırlarıyla birebir). */
const PUSH_CHANNELS = Object.freeze([
  CHANNELS.EVENT_PATCH,
  CHANNELS.EVENT_CONNECTION,
  CHANNELS.EVENT_MODEL,
  // --- Tur 12 (T-119) ---
  CHANNELS.EVENT_MCP,
  CHANNELS.EVENT_INTEGRATION
]);

const WRITE_CHANNELS = Object.freeze([
  CHANNELS.TEAM_ADD,
  CHANNELS.TEAM_REMOVE,
  CHANNELS.TEAM_SET_LEADER,
  CHANNELS.TEAM_APPLY,
  CHANNELS.COMMAND_SEND,
  CHANNELS.COMMAND_INTERRUPT,
  CHANNELS.BOARD_WRITE,
  CHANNELS.MODELS_ASSIGN,
  CHANNELS.SECRET_SET,
  CHANNELS.ROSTER_WRITE,
  // --- Tur 4 ---
  CHANNELS.MEMORY_WRITE,
  CHANNELS.PROJECT_CREATE,
  CHANNELS.PROJECT_SWITCH,
  CHANNELS.PROJECT_ARCHIVE,
  CHANNELS.PROVIDER_SAVE,
  CHANNELS.PROVIDER_KEY_ADD,
  CHANNELS.PROVIDER_KEY_REMOVE,
  CHANNELS.SKILL_SAVE,
  CHANNELS.SKILL_REMOVE,
  CHANNELS.PERMISSION_SET,
  // --- Tur 5 ---
  CHANNELS.CHAT_CREATE,
  CHANNELS.CHAT_SEND,
  CHANNELS.CHAT_RENAME,
  CHANNELS.CHAT_REMOVE,
  CHANNELS.REMOTE_START,
  CHANNELS.REMOTE_STOP,
  CHANNELS.REMOTE_ROTATE,
  // --- Tur 6 ---
  CHANNELS.GUIDE_UPDATE,
  CHANNELS.SERVER_START,
  CHANNELS.SERVER_STOP,
  // --- Tur 8 ---
  CHANNELS.VOTION_ACT,
  CHANNELS.TEAMS_ACT,
  CHANNELS.PLAN_ACT,
  // --- Tur 11 (T11-1): yerel model kurulumu yazma kapisi (API-51f) ---
  CHANNELS.MODELS_INSTALL,
  CHANNELS.MODELS_CANCEL,
  CHANNELS.MODELS_REMOVE,
  // --- Tur 12 (T-119): MCP + entegrasyon yazma kapisi (API-51j) ---
  CHANNELS.MCP_ADD,
  CHANNELS.MCP_REMOVE,
  CHANNELS.INTEGRATION_SAVE,
  CHANNELS.INTEGRATION_REMOVE,
  // --- Tur 13 (T-137): MCP katalog kurulumu + OAuth başlatma/iptal (API-51) ---
  CHANNELS.MCP_CATALOG_INSTALL,
  CHANNELS.OAUTH_START,
  CHANNELS.OAUTH_REVOKE,
  // --- Tur 14 (T-146): hazır bağlantı uygulama + Votion çağrı (API-51) ---
  CHANNELS.PRESET_APPLY,
  CHANNELS.VOTION_INVOKE
]);

module.exports = { CHANNELS, WRITE_CHANNELS, PUSH_CHANNELS };
