'use strict';

const { app, BrowserWindow, ipcMain, safeStorage, desktopCapturer, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { CHANNELS, WRITE_CHANNELS } = require('../shared/ipc-channels');
const { CODES, ok, fail } = require('../shared/errors');
const { MODEL_HOST_ALLOWLIST } = require('../shared/model-hosts');

const { createHttpClient } = require('./services/http-client');
const { createSettings } = require('./services/settings');
const { createRoster } = require('./services/roster');
const { createSessionsService } = require('./services/sessions');
const { createMessagesService, parseReport } = require('./services/messages');
const { createModelsService } = require('./services/models');
const { createModelsStore } = require('./services/models-store');
const { createReportsService } = require('./services/reports');
const { createBoardService } = require('./services/board');
const { createEventsService, EVENT_TYPES, pickEventRef } = require('./services/events');
const { createAuditLog } = require('./services/audit');
const { createConfirmStore } = require('./services/confirm');
const { normalizePayload } = require('./services/payload');
/* --- Tur 4 --- */
const { createMemoryService } = require('./services/memory');
const { createProjectsService } = require('./services/projects');
const { createProvidersService } = require('./services/providers');
const { createSkillsService } = require('./services/skills');
const { createPermissionsService } = require('./services/permissions');
const { createBrowserService } = require('./services/browser');
const { createChatService } = require('./services/chat');
const { createRemoteService } = require('./services/remote');
const { createTeamBuilder } = require('./services/team-builder');
/* --- Tur 6 --- */
const { createGuideService } = require('./services/guide');
const { createServerManager } = require('./services/server-manager');
const { createSummarizeService } = require('./services/summarize');
const { createVoiceService } = require('./services/voice');
const { createVotionActions } = require('./services/votion-actions');
const { createVotionGrants } = require('./services/votion-grants');
const { createVotionExec } = require('./services/votion-exec');
const { createTeamsService } = require('./services/teams');
const { createPlannerService } = require('./services/planner');
const { createFilesService } = require('./services/files');
/* --- Tur 12 (T-119): MCP kayit defteri (ornek tembel olusturulur) --- */
const { createMcpRegistry } = require('./services/mcp-registry');
const { createOAuthService } = require('./services/oauth');
const MCP_CATALOG = require('./services/mcp-catalog.json');
/* --- Tur 12 (T-120): entegrasyon kayit defteri (ornek tembel olusturulur) --- */
const { createIntegrationsService } = require('./services/integrations');
const INTEGRATION_CATALOG = require('./services/integration-catalog.json');
/* --- Tur 14 (T-146): hazır bağlantılar + Votion erişimi --- */
const { createPresetsService } = require('./services/presets');
const { createVotionTools } = require('./services/votion-tools');

const SCHEMA_VERSION = 1;
const APP_VERSION = require('../package.json').version;
const CONSOLE_PAGE = path.join(__dirname, '..', 'renderer', 'index.html');
const CONSOLE_URL = pathToFileURL(CONSOLE_PAGE).href;

/** @type {BrowserWindow|null} */
let mainWindow = null;
let eventsService = null;
let activeRuntime = null;
let stopBoardWatch = null;
let resyncTimer = null;
let plannerTimer = null;

/* ---------------------------------------------------------------- yardimci */

function wrap(handler) {
  return async (event, payload) => {
    try {
      const contents = mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents;
      const frame = event.senderFrame;
      if (!contents || event.sender !== contents || !frame ||
          frame !== contents.mainFrame || frame.url !== CONSOLE_URL) {
        return fail(CODES.FORBIDDEN, 'Bu işlem yalnızca konsol penceresinden yapılabilir.');
      }
      const result = await handler(normalizePayload(payload), event);
      return result && typeof result.ok === 'boolean'
        ? result
        : fail(CODES.INTERNAL, 'Beklenmeyen hata.');
    } catch {
      return fail(CODES.INTERNAL, 'Beklenmeyen hata.');
    }
  };
}

function push(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(channel, payload);
  } catch {
    // Pencere kapanirken yarisa girme.
  }
}

/* ------------------------------------------- yerel model envanteri (T11-1) */

/**
 * `kv:models:list` yuku §7.5'te `{}`tir: sema disi alan `E_BAD_REQUEST` (API-54).
 * @param {object} payload
 * @param {string[]} allowed
 */
function hasOnlyKeys(payload, allowed) {
  return Object.keys(payload || {}).every((key) => allowed.includes(key));
}

/**
 * Servis hatalarini tek zarf cevirir. E_MCP CODES icinde olmadigi icin
 * fail() onun yerine E_INTERNAL uretir; bu yuzden ayri ele alinir (§7.6.3).
 */
function mcpErrorResult(err) {
  const code = err && typeof err.code === 'string' ? err.code : CODES.INTERNAL;
  if (code === 'E_MCP') {
    const detail = err.detail && typeof err.detail === 'object' ? err.detail : {};
    return {
      ok: false,
      error: {
        code: 'E_MCP',
        message: typeof detail.message === 'string' && detail.message
          ? detail.message
          : 'MCP aracı hata döndürdü.',
        status: null,
        retryable: false,
        detail: { code: detail.code === undefined ? null : detail.code }
      }
    };
  }
  return fail(code, err && err.message ? err.message : undefined, {
    detail: err && err.detail !== undefined ? err.detail : null
  });
}

/** OAuth özel kodları CODES içinde değil; fail() E_INTERNAL'a çevirmesin. */
const OAUTH_CODES = new Set([
  'E_NO_SAFE_STORAGE', 'E_OAUTH_TIMEOUT', 'E_OAUTH_STATE', 'E_OAUTH_DENIED',
  'E_OAUTH_FLOW', 'E_OAUTH_PROVIDER', 'E_OAUTH_CLIENT_CONFIG',
  'E_OAUTH_TOKEN', 'E_OAUTH_BUSY'
]);
function oauthErrorResult(err) {
  const code = err && typeof err.code === 'string' ? err.code : CODES.INTERNAL;
  if (OAUTH_CODES.has(code)) {
    return {
      ok: false,
      error: {
        code,
        message: typeof err.message === 'string' && err.message ? err.message : code,
        status: null,
        retryable: false,
        detail: null
      }
    };
  }
  return fail(code, err && err.message ? err.message : undefined);
}
const oauthRun = async (fn) => {
  try { return ok(await fn()); } catch (err) { return oauthErrorResult(err); }
};

/* Özel şablon kodları CODES içinde değil; fail() E_INTERNAL'a çevirmesin (API-30). */
const PRESET_CODES = new Set([
  'E_PRESET_UNKNOWN', 'E_PRESET_KIND_MISMATCH', 'E_PRESET_MISSING_FIELDS'
]);
function presetErrorEnvelope(code, err) {
  return {
    ok: false,
    error: {
      code,
      message: err && err.message ? err.message : code,
      status: null,
      retryable: false,
      detail: err && err.detail !== undefined ? err.detail : null
    }
  };
}
const presetRun = async (fn) => {
  try { return ok(await fn()); } catch (err) {
    const code = err && typeof err.code === 'string' ? err.code : CODES.INTERNAL;
    if (PRESET_CODES.has(code)) return presetErrorEnvelope(code, err);
    return oauthErrorResult(err);
  }
};
const votionRun = async (fn) => {
  try { return ok(await fn()); } catch (err) {
    const code = err && typeof err.code === 'string' ? err.code : CODES.INTERNAL;
    if (code === 'E_MCP') return mcpErrorResult(err);
    if (PRESET_CODES.has(code)) return presetErrorEnvelope(code, err);
    return oauthErrorResult(err);
  }
};

/**
 * ModelsStore.list() ciktisini sozlesme (§7.5) alan adlarina cevirir.
 * Store `id`/`jobs[].id` kullanir; sozlesme `modelID`/`jobId` bekler.
 * @param {object} data
 */
function modelInventory(data) {
  const jobs = (data.jobs || []).map((job) => ({
    jobId: job.id,
    modelID: job.modelID,
    state: job.state,
    receivedBytes: job.receivedBytes || 0,
    totalBytes: job.totalBytes || 0,
    percent: job.percent || 0,
    etaSec: job.etaSec === undefined ? null : job.etaSec,
    targetDir: job.targetDir || null,
    startedAt: job.startedAt || null,
    error: job.error || null
  }));

  const models = (data.models || []).map((model) => ({
    modelID: model.id,
    name: model.name,
    state: model.state,
    sizeBytes: model.sizeBytes || 0,
    sha256: model.sha256 || null,
    /* `verified` yalniz gercek hash eslesmesiyle true olur; store bunu
       `ready` durumunda kalicilastirir (E_HASH_MISMATCH failed yazar). */
    verified: model.state === 'ready',
    targetDir: model.targetDir || null,
    license: model.license || null,
    runtime: model.runtime && model.runtime.kind ? model.runtime.kind : 'none'
  }));

  const roots = (data.roots || []).map((root) => ({
    path: root.path,
    exists: Boolean(root.path && fs.existsSync(root.path)),
    writable: Boolean(root.writable)
  }));

  return {
    runtime: data.runtime || { kind: 'none', state: 'absent' },
    roots,
    disk: data.disk || { root: null, freeBytes: null, totalBytes: null },
    jobs,
    models
  };
}

/**
 * `kv:audit:list` — yalniz UST VERI alanlari doner (API-30).
 * Emir/rapor metni, URL, tam dosya yolu ve sir degerleri dosyada yoktur;
 * yine de alanlar beyaz listeyle suzulur (savunma derinligi).
 * @param {string} file `logs/audit.jsonl`
 * @param {{limit?:number, op?:string, since?:string}} query
 */
function readAuditEntries(file, query) {
  const asked = Number.isFinite(query.limit) ? Math.floor(query.limit) : 200;
  const limit = Math.min(500, Math.max(1, asked));
  const op = typeof query.op === 'string' && query.op ? query.op : null;
  const since = typeof query.since === 'string' && query.since ? query.since : null;
  const sinceMs = since ? Date.parse(since) : NaN;

  let lines = [];
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (raw) lines = raw.split(/\r?\n/);
  } catch {
    /* Dosya yok / okunamadi: bos dizi (patlama yok). */
    return { entries: [], total: 0, truncated: false };
  }

  const all = [];
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    if (op && entry.op !== op) continue;
    if (Number.isFinite(sinceMs)) {
      const at = Date.parse(entry.at || '');
      if (!Number.isFinite(at) || at < sinceMs) continue;
    }
    const clean = {};
    for (const field of ['at', 'op', 'code', 'target', 'status', 'idempotencyKey']) {
      if (entry[field] !== undefined) clean[field] = entry[field];
    }
    all.push(clean);
  }

  const sliced = all.slice(-limit);
  return { entries: sliced, total: all.length, truncated: all.length > sliced.length };
}

/**
 * `opencode` calistirilabilir dosyasini bulur (T6-6).
 *
 * Neden: sunucu "cevrim disi" gorunuyordu; konsolun sunucuyu KENDI
 * baslatabilmesi icin ikilinin yolunu bilmesi gerekir. PATH'e guvenmek
 * yerine bilinen kurulum yerleri sirayla denenir — ag yok, kayit defteri yok.
 *
 * @returns {string|null}
 */
function resolveOpencodeBin() {
  const candidates = [];
  if (process.env.KEYVOTION_OPENCODE_BIN) candidates.push(process.env.KEYVOTION_OPENCODE_BIN);

  const local = process.env.LOCALAPPDATA;
  if (local) {
    candidates.push(path.join(local, 'Programs', '@openchamberelectron', 'resources', 'opencode-cli', 'opencode.exe'));
    candidates.push(path.join(local, 'Programs', 'opencode', 'opencode.exe'));
  }
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'opencode', 'opencode.exe'));

  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    candidates.push(path.join(dir, 'opencode.exe'));
    candidates.push(path.join(dir, 'opencode.cmd'));
  }

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Erisilemeyen aday atlanir.
    }
  }
  return null;
}
/* ------------------------------------------------------------------ runtime */
function createRuntime() {
  const baseDir = app.getPath('userData');
  const logDir = path.join(baseDir, 'logs');

  const settings = createSettings({ baseDir, safeStorage });
  const audit = createAuditLog({ logDir });

  const getProjectDir = () => settings.connection().projectDir;
  /* Ilk acilis: varsayilan proje dizini henuz yok. Burada olusturulur ki
     pano/hafiza/projeler ekranlari bos bir kurulumda da yazabilsin. */
  try {
    fs.mkdirSync(getProjectDir(), { recursive: true });
  } catch {
    /* Salt-okunur ortam: uygulama acilir, yazma denemeleri kendi hatasini verir. */
  }
  const backupRoot = () => path.join(getProjectDir(), 'work', 'backup');

  const roster = createRoster({
    getProjectDir,
    getBackupRoot: backupRoot
  });

  const http = createHttpClient({
    getConfig: () => settings.connection(),
    getPassword: () => settings.getPassword()
  });

  const sessions = createSessionsService({ http, roster, getProjectDir });
  const messages = createMessagesService({ http });
  const models = createModelsService({ http, getProjectDir });

  /* Yerel model deposu (T11-1) — TEK ornek. Durum dosyasi ve kuyruk burada
     yasar; indirme http-client'in akisli yolundan gecer (bellege almaz). */
  const modelsStore = createModelsStore({
    baseDir: path.join(baseDir, 'models'),
    /* Denetimli, surumlenen katalog (ARC onayi). Kullanici URL yazamaz. */
    catalogPath: path.join(__dirname, '..', '..', 'work', 'models.catalog.json'),
    allowedHosts: MODEL_HOST_ALLOWLIST,
    download: (input) => http.downloadToFile(input)
  });

  /* Ilerleme push'u (§7.5): tek yon, main → renderer. Pencere yoksa push()
     sessizce yutar; dinleyici kaydi tek seferliktir. */
  modelsStore.onProgress((packet) => push(CHANNELS.EVENT_MODEL, packet));
  const board = createBoardService({
    getProjectDir,
    getBackupRoot: backupRoot
  });
  const confirm = createConfirmStore();
  const reports = createReportsService({ sessions, messages, getProjectDir });

  /* ------------------------------- Tur 4 ------------------------------- */
  const memory = createMemoryService({ getProjectDir });
  const projects = createProjectsService({ baseDir, settings, getProjectDir });
  const providers = createProvidersService({ baseDir, safeStorage, audit, http });
  const skills = createSkillsService({ getProjectDir });
  const permissions = createPermissionsService({ getProjectDir });

  /* ------------------------------- Tur 5 ------------------------------- */
  const chat = createChatService({
    baseDir,
    providers,
    memory,
    skills,
    permissions,
    audit,
    getProjectName: () => path.basename(getProjectDir() || '')
  });

  /* ------------------------------- Tur 6 ------------------------------- */
  const guide = createGuideService({ baseDir });

  const serverManager = createServerManager({
    baseDir,
    httpClient: http,
    settings,
    audit,
    projectDir: getProjectDir(),
    opencodeBin: resolveOpencodeBin()
  });

  /* Tarayici penceresi whenReady'de kurulur; ozet servisi gec baglanir. */
  let browserRef = null;

  const summarize = createSummarizeService({
    providers,
    browser: {
      state: () => (browserRef ? browserRef.state() : ok({ open: false })),
      extract: (p) => (browserRef ? browserRef.extract(p) : fail(CODES.INTERNAL, 'Tarayıcı hazır değil.'))
    }
  });

  const voice = createVoiceService({
    board, sessions, reports, memory, summarize, providers, serverManager,
    getRemote: () => runtime.remote,
    /* Masaustu eylemleri icin beyaz liste servisi (Tur 9): gec baglanir. */
    getVotionActions: () => runtime.votionActions
  });

  /* ------------------------------- Tur 8 ------------------------------- */
  const teams = createTeamsService({
    baseDir,
    getModels: () => models.pool()
  });

  const planner = createPlannerService({ baseDir });

  /* T-205: duz dille proje tanimi -> kadro onerisi (yazma yok) ve uygulama. */
  const teamBuilder = createTeamBuilder({
    providers,
    models,
    roster,
    getProjectName: () => path.basename(getProjectDir() || '')
  });

  const files = createFilesService({ getProjectDir, memory, getLocalAccess: () => settings.get().data.localAccess });

  /* T-198: Votion oturum yetkileri — süreç ömrü boyunca, diskte kalıcı değil. */
  const votionGrants = createVotionGrants();
  /* Kayıt dosyası (votion/actions.jsonl) servis sahibidir; main süreç diske yazmaz
     (7.2.8b kapısı). Denetim günlüğü de servis içinde yazılır. */
  const votionExec = createVotionExec({
    baseDir,
    getProjectDir,
    grants: votionGrants,
    audit
  });

  const votionActions = createVotionActions({
    baseDir,
    getProjectDir,
    grants: votionGrants,
    exec: votionExec,
    grantsApi: votionGrants,
    getRoots: () => ({
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads')
    }),
    audit,
    shellApi: shell,
    capturer: desktopCapturer,
    browser: () => runtime.browser
  });

  const runtime = {
    baseDir, logDir, settings, audit, roster, http,
    sessions, messages, models, modelsStore, board, confirm, reports,
    memory, projects, providers, skills, permissions, chat,
    guide, serverManager, summarize, voice, votionActions,
    teams, planner, files, teamBuilder,
    /** Ekip ozeti (telefon/uzak gorunum icin) — resync gunceller. */
    teamCache: [],
    /** Tarayici pencere olustuktan sonra eklenir (whenReady). */
    browser: null,
    remote: null,
    attachBrowser(b) { browserRef = b; runtime.browser = b; },
    getProjectDir, backupRoot
  };

  const remote = createRemoteService({
    baseDir,
    chat,
    memory,
    board,
    audit,
    getTeam: () => runtime.teamCache || []
  });
  runtime.remote = remote;

  return runtime;
}

/* -------------------------------------------------------------- uzlastirma */

function scheduleResync(runtime, delayMs) {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(async () => {
    resyncTimer = null;
    const res = await runtime.sessions.list();
    if (res.ok) {
      const all = [...(res.data.sessions || []), ...(res.data.unassigned || [])];
      runtime.teamCache = all.map((s) => ({
        role: s.role || null,
        code: s.code || null,
        model: s.model || null,
        state: s.state || null,
        sessionId: s.sessionId || null
      }));
      push(CHANNELS.EVENT_PATCH, {
        type: 'console.resync',
        domain: 'team',
        at: new Date().toISOString(),
        data: { reason: 'resync' },
        payload: res.data
      });
    }
    push(CHANNELS.EVENT_CONNECTION, {
      type: 'connection.state',
      state: res.ok ? 'connected' : 'offline',
      at: new Date().toISOString(),
      data: { reason: res.ok ? 'ok' : (res.error && res.error.code) || 'E_OFFLINE' }
    });
  }, delayMs);
}

/* -------------------------------------------------------------------- main  */

function createWindow(runtime) {
  /* Uygulama ikonu (T-056): pencere + gorev cubugu ikonu. Ikon yoksa uygulama
     yine acilir (paket eksikligi baslatmayi engellemez). */
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Keyvotion Console',
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      /* Savunma derinliği (YM): <webview> etiketi ve Node entegrasyonu Electron'da
         varsayılan olarak kapalı; yine de AÇIKÇA yazılır ki bir alt sürüm ya da
         yanlış bir varsayılan değişikliği sessizce açık bırakmasın. */
      webviewTag: false,
      preload: path.join(__dirname, '..', 'preload', 'preload.js')
    }
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  /* Mikrofon izni yalnız bu pencere için (Tur 9 — Votion sesi).
     Diğer izinler (bildirim, konum, kamera, …) sessizce reddedilir. */
  try {
    win.webContents.session.setPermissionRequestHandler((contents, permission, callback) => {
      callback(contents === win.webContents && permission === 'media');
    });
    win.webContents.session.setPermissionCheckHandler((contents, permission) => {
      return contents === win.webContents && permission === 'media';
    });
  } catch { /* eski Electron: varsayılan davranış */ }

  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' &&
          !target.username && !target.password && win.webContents.getURL() === CONSOLE_URL) {
        void shell.openExternal(target.href).catch(() => {});
      }
    } catch { /* Geçersiz adres açılmaz. */ }
    return { action: 'deny' };
  });

  win.loadFile(CONSOLE_PAGE);

  /*
   * Kurtarma (T-170): çöken/boş kalan bir arayüz kullanıcıyı kilitli bırakmaz.
   * Renderer süreci düşerse pencereyi bir kez yeniden yükler; ikinci çökmede
   * yeniden yükleme döngüsü kurmamak için durur. Neden log'a yazılır (sır yok).
   */
  let reloadsAfterCrash = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    const reason = (details && details.reason) || 'unknown';
    try {
      runtime.audit.append({
        op: 'renderer-crash',
        code: 'system.recovery',
        target: null,
        status: 500,
        extra: { reason }
      });
    } catch { /* denetim yazılamasa da kurtarma denenir */ }
    if (reloadsAfterCrash >= 1) return;
    reloadsAfterCrash += 1;
    try { win.reload(); } catch { /* pencere kapanmışsa yoksay */ }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    try {
      runtime.audit.append({
        op: 'renderer-load-failed',
        code: 'system.recovery',
        target: String(validatedURL || '').slice(0, 200),
        status: 500,
        extra: { errorCode, errorDescription }
      });
    } catch { /* yoksay */ }
  });

  return win;
}

function registerChannels(runtime) {
  const { settings, audit, confirm, roster, sessions, messages, models, modelsStore, board } = runtime;

  /* --- app --- */
  ipcMain.handle(CHANNELS.APP_PING, wrap(() => ok({ pong: true, at: new Date().toISOString() })));

  ipcMain.handle(CHANNELS.APP_INFO, wrap(async () => {
    const info = await runtime.http.info();
    if (!info.ok) {
      return info.error.code === CODES.SECRET_MISSING
        ? fail(CODES.SECRET_MISSING, 'Kayıtlı parola yok. Ayarlar’dan parola girin.')
        : info;
    }
    return ok({
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      server: { version: info.data.version, connected: true },
      secretState: settings.secretState(),
      /* API-51i: ek alan, kirici degil — Yonetim Merkezi canli sayim gosterir. */
      contract: {
        apiVersion: '2.9',
        channels: Object.keys(CHANNELS).length,
        writeChannels: WRITE_CHANNELS.length
      }
    });
  }));

  /* --- team --- */
  ipcMain.handle(CHANNELS.TEAM_LIST, wrap(async () => {
    const res = await sessions.list();
    if (res.ok) {
      const all = [...(res.data.sessions || []), ...(res.data.unassigned || [])];
      runtime.teamCache = all.map((s) => ({
        role: s.role || null,
        code: s.code || null,
        model: s.model || null,
        state: s.state || null,
        sessionId: s.sessionId || null
      }));
    }
    return res;
  }));

  ipcMain.handle(CHANNELS.TEAM_ADD, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.TEAM_ADD);
    if (denied) return denied;

    // API-94 / C-6: rol kodu tekilligi. AG ISTEGINDEN ONCE, yerelde bakilir.
    // Kadro okunamiyorsa assertUniqueCode fail-open doner (cakisma kanitlanamaz).
    const requestedCode = payload.code || payload.roleCode || null;
    const unique = roster.assertUniqueCode(requestedCode);
    if (!unique.ok) {
      audit.append({
        op: CHANNELS.TEAM_ADD,
        code: unique.error.code,
        target: null,
        status: null,
        idempotencyKey: payload.idempotencyKey || null,
        extra: {
          roleCode: requestedCode || null,
          rule: 'duplicate-role',
          httpSent: false
        }
      });
      return unique;
    }

    const res = await sessions.create(payload);
    audit.append({
      op: CHANNELS.TEAM_ADD,
      code: res.ok ? CODES.OK : res.error.code,
      target: res.ok ? res.data.id : null,
      status: res.ok ? 201 : null,
      idempotencyKey: payload.idempotencyKey || null,
      extra: {
        roleCode: payload.code || payload.roleCode || null,
        rosterWritten: res.ok ? Boolean(res.data.rosterWritten) : null
      }
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.TEAM_REMOVE, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.TEAM_REMOVE);
    if (denied) return denied;

    const res = await sessions.archive(payload.sessionID);
    if (!res.ok) {
      audit.append({
        op: CHANNELS.TEAM_REMOVE,
        code: res.error.code,
        target: payload.sessionID || null
      });
      return res;
    }

    // Kadro satirini da dusur (yedekli). Basarisiz olursa arsiv yine gecerli.
    const code = payload.code
      || ((await sessions.get(payload.sessionID)).data || {}).role
      || null;
    const rosterRes = code ? roster.remove(code) : null;

    audit.append({
      op: CHANNELS.TEAM_REMOVE,
      code: CODES.OK,
      target: payload.sessionID || null,
      extra: {
        archived: true,
        rosterRemoved: Boolean(rosterRes && rosterRes.ok),
        roleCode: code
      }
    });
    return ok({
      sessionID: payload.sessionID,
      archivedAt: new Date().toISOString(),
      archived: true,
      roleCode: code,
      rosterRemoved: Boolean(rosterRes && rosterRes.ok),
      backupPath: rosterRes && rosterRes.ok ? rosterRes.data.backup : null
    });
  }));

  ipcMain.handle(CHANNELS.TEAM_SET_LEADER, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.TEAM_SET_LEADER);
    if (denied) return denied;

    const res = await sessions.setLeader(payload.sessionID);
    audit.append({
      op: CHANNELS.TEAM_SET_LEADER,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.sessionID || null
    });
    return res;
  }));

  /* --- otomatik ekip kurucu (T-205) --- */
  ipcMain.handle(CHANNELS.TEAM_PLAN, wrap(async (payload) => {
    /* Plan yalniz model cagrisi yapar; diske yazmaz, bu yuzden kapi disinda. */
    return runtime.teamBuilder.plan(payload || {});
  }));

  ipcMain.handle(CHANNELS.TEAM_APPLY, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.TEAM_APPLY);
    if (denied) return denied;

    const res = await runtime.teamBuilder.apply(payload || {});
    audit.append({
      op: CHANNELS.TEAM_APPLY,
      code: res.ok ? CODES.OK : res.error.code,
      target: null,
      extra: {
        codes: res.ok && Array.isArray(res.data.codes) ? res.data.codes : null
      }
    });
    return res;
  }));

  /* --- command --- */
  ipcMain.handle(CHANNELS.COMMAND_SEND, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.COMMAND_SEND);
    if (denied) return denied;

    const sessionID = payload.sessionID;
    const text = typeof payload.text === 'string' ? payload.text : '';

    if (!sessionID) return fail(CODES.BAD_REQUEST, 'Seans kimliği gerekli.');
    if (text.trim().length === 0) return fail(CODES.BAD_REQUEST, 'Mesaj boş olamaz.');
    if (text.length > 8000) return fail(CODES.BAD_REQUEST, 'Mesaj 8000 karakteri aşıyor.');

    const body = { text };
    if (payload.delivery === 'queue') body.delivery = 'queue';

    const res = await runtime.http.post(
      `/api/session/${encodeURIComponent(sessionID)}/prompt`,
      { body, idempotencyKey: payload.idempotencyKey }
    );

    // Audit: metin YAZILMAZ, yalniz uzunluk ve hedef (API-30).
    audit.append({
      op: CHANNELS.COMMAND_SEND,
      code: res.ok ? CODES.OK : res.error.code,
      target: sessionID,
      status: res.ok ? 200 : (res.error.status || null),
      idempotencyKey: payload.idempotencyKey || null,
      extra: { chars: text.length, delivery: body.delivery || 'direct' }
    });

    if (!res.ok) return res;
    return ok({
      sentAt: new Date().toISOString(),
      idempotencyKey: payload.idempotencyKey || null,
      chars: text.length
    });
  }));

  ipcMain.handle(CHANNELS.COMMAND_INTERRUPT, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.COMMAND_INTERRUPT);
    if (denied) return denied;

    if (!payload.sessionID) return fail(CODES.BAD_REQUEST, 'Seans kimliği gerekli.');

    const res = await runtime.http.post(
      `/api/session/${encodeURIComponent(payload.sessionID)}/interrupt`,
      { body: {} }
    );
    audit.append({
      op: CHANNELS.COMMAND_INTERRUPT,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.sessionID
    });
    if (!res.ok) return res;
    return ok({ stoppedAt: new Date().toISOString() });
  }));

  ipcMain.handle(CHANNELS.COMMAND_MESSAGES, wrap((payload) => (
    messages.list(payload.sessionID, payload.limit)
  )));

  /* --- board --- */
  ipcMain.handle(CHANNELS.BOARD_READ, wrap(() => board.read()));

  ipcMain.handle(CHANNELS.BOARD_WRITE, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.BOARD_WRITE);
    if (denied) return denied;

    const res = board.write(payload.row);
    audit.append({
      op: CHANNELS.BOARD_WRITE,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.row && payload.row.id ? payload.row.id : null,
      extra: { created: res.ok ? res.data.created : null }
    });
    if (res.ok) scheduleResync(runtime, 0);
    return res;
  }));

  /* --- models --- */
  ipcMain.handle(CHANNELS.MODELS_CATALOG, wrap(() => models.catalog()));

  ipcMain.handle(CHANNELS.MODELS_ASSIGN, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MODELS_ASSIGN);
    if (denied) return denied;

    const res = await models.assign(payload.sessionID, payload.model);
    audit.append({
      op: CHANNELS.MODELS_ASSIGN,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.sessionID || null,
      extra: { model: res.ok ? res.data.model : null }
    });
    return res;
  }));

  /* --- yerel model envanteri (T11-1, §7.5) --- */

  ipcMain.handle(CHANNELS.MODELS_LIST, wrap((payload) => {
    if (!hasOnlyKeys(payload, [])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    return ok(modelInventory(modelsStore.list()));
  }));

  ipcMain.handle(CHANNELS.MODELS_DIR, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['purpose'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    /* Tek native diyalog noktasi: baska yerde showOpenDialog YOK.
       Iptal HATA DEGILDIR: `{path:null}` doner. Kalici ayar yazilmaz. */
    const picked = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : undefined, {
      title: 'Yerel model klasörü seç',
      properties: ['openDirectory', 'createDirectory']
    });
    const selected = !picked.canceled && Array.isArray(picked.filePaths)
      ? picked.filePaths[0] || null
      : null;
    return ok({ path: selected });
  }));

  ipcMain.handle(CHANNELS.MODELS_INSTALL, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['modelID', 'targetDir', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MODELS_INSTALL);
    if (denied) return denied;

    /* Store `options.confirmed === true` bekler; token kapisi yukarida gecti. */
    const res = modelsStore.install({
      modelID: payload.modelID,
      targetDir: payload.targetDir,
      confirmed: true
    });
    audit.append({
      op: 'model.install',
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.modelID === 'string' ? payload.modelID : null
      /* API-30: URL, tam dosya yolu ve sha256 YAZILMAZ. */
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.MODELS_CANCEL, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['jobId', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MODELS_CANCEL);
    if (denied) return denied;

    const res = modelsStore.cancel({ jobId: payload.jobId, confirmed: true });
    const job = modelsStore.list().jobs.find((item) => item.id === payload.jobId) || null;
    audit.append({
      op: 'model.cancel',
      code: res.ok ? CODES.OK : res.error.code,
      target: job ? job.modelID : null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.MODELS_VERIFY, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['modelID'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const res = await modelsStore.verify({ modelID: payload.modelID });
    let out = res;
    if (res.ok) {
      /* §7.5: katalogda sha256 yoksa `sha256:null` doner (uydurma hash yok). */
      const entry = modelsStore.list().models.find((item) => item.id === payload.modelID) || null;
      out = entry && !entry.sha256
        ? ok({
          verified: false,
          sha256: null,
          sizeBytes: res.data.sizeBytes,
          elapsedMs: res.data.elapsedMs
        })
        : res;
    }
    audit.append({
      op: 'model.verify',
      code: out.ok ? CODES.OK : out.error.code,
      target: typeof payload.modelID === 'string' ? payload.modelID : null
    });
    return out;
  }));

  ipcMain.handle(CHANNELS.MODELS_REMOVE, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['modelID', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MODELS_REMOVE);
    if (denied) return denied;

    const res = modelsStore.remove({ modelID: payload.modelID, confirmed: true });
    audit.append({
      op: 'model.remove',
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.modelID === 'string' ? payload.modelID : null
    });
    return res;
  }));

  /* --- denetim gunlugu (T11-1): yalniz ust veri (API-30) --- */
  ipcMain.handle(CHANNELS.AUDIT_LIST, wrap((payload) => {
    if (!hasOnlyKeys(payload, ['limit', 'op', 'since'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    return ok(readAuditEntries(audit.file, payload));
  }));

  /* --- reports --- */
  ipcMain.handle(CHANNELS.REPORTS_LIST, wrap((payload) => runtime.reports.list(payload)));

  /* --- settings --- */
  ipcMain.handle(CHANNELS.SETTINGS_GET, wrap(() => settings.get()));

  ipcMain.handle(CHANNELS.SETTINGS_SET, wrap((payload) => {
    /*
     * Ayarlar yalniz YEREL config.json'a yazar (aga cikmaz, silmez, sir tutmaz).
     * Renderer "Kaydet" dugmesiyle acik kullanici niyeti gonderir; bu yuzden
     * confirmToken ZORUNLU DEGIL. Token verilirse yine tek kullanim olarak
     * dogrulanir (API-41 gevsetilmedi, kapsam disi tutuldu).
     */
    if (payload.confirmToken !== undefined) {
      const denied = confirm.verify(payload.confirmToken, CHANNELS.SETTINGS_SET);
      if (denied) return denied;
    }

    const res = settings.set(payload);
    audit.append({
      op: CHANNELS.SETTINGS_SET,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.serverURL ? 'serverURL' : (payload.projectDir ? 'projectDir' : 'ui'),
      extra: {
        keys: Object.keys(payload).filter((k) => k !== 'confirmToken').sort()
      }
    });
    return res;
  }));

  /* --- secret (deger asla geri donmez) --- */
  ipcMain.handle(CHANNELS.SECRET_SET, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.SECRET_SET);
    if (denied) return denied;

    const res = settings.setPassword(payload.password);
    audit.append({
      op: CHANNELS.SECRET_SET,
      code: res.ok ? CODES.OK : res.error.code,
      target: 'secrets.bin'
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.SECRET_STATE, wrap(() => ok({ secretState: settings.secretState() })));

  /* --- roster --- */
  ipcMain.handle(CHANNELS.ROSTER_READ, wrap(() => roster.read()));

  ipcMain.handle(CHANNELS.ROSTER_WRITE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.ROSTER_WRITE);
    if (denied) return denied;

    const res = roster.write(payload.entries);
    audit.append({
      op: CHANNELS.ROSTER_WRITE,
      code: res.ok ? CODES.OK : res.error.code,
      target: 'roster.md'
    });
    return res;
  }));

  /* ============================ Tur 4 ============================ */

  /* --- hafiza: okuma serbest, yazma onayli (T4-3) --- */
  ipcMain.handle(CHANNELS.MEMORY_READ, wrap((payload) => {
    const res = runtime.memory.read(payload);
    if (res.ok) res.data.flow = runtime.memory.flow().data;
    return res;
  }));

  ipcMain.handle(CHANNELS.MEMORY_SEARCH, wrap((payload) => runtime.memory.search(payload)));
  ipcMain.handle(CHANNELS.MEMORY_CONTEXT, wrap((payload) => runtime.memory.context(payload)));

  ipcMain.handle(CHANNELS.MEMORY_WRITE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MEMORY_WRITE);
    if (denied) return denied;

    const res = runtime.memory.write(payload);
    audit.append({
      op: CHANNELS.MEMORY_WRITE,
      code: res.ok ? CODES.OK : res.error.code,
      target: res.ok ? res.data.entry.id : null,
      extra: {
        scope: payload.scope || 'team',
        kind: payload.kind || 'fact',
        chars: typeof payload.text === 'string' ? payload.text.length : 0
      }
    });
    return res;
  }));

  /* --- projeler (T4-2): silme yok, arsivleme var --- */
  ipcMain.handle(CHANNELS.PROJECT_LIST, wrap(() => runtime.projects.list()));

  ipcMain.handle(CHANNELS.PROJECT_CREATE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PROJECT_CREATE);
    if (denied) return denied;

    const res = runtime.projects.create(payload);
    audit.append({
      op: CHANNELS.PROJECT_CREATE,
      code: res.ok ? CODES.OK : res.error.code,
      target: res.ok ? res.data.project.id : null,
      extra: { dir: res.ok ? res.data.project.dir : null }
    });
    if (res.ok) scheduleResync(runtime, 0);
    return res;
  }));

  ipcMain.handle(CHANNELS.PROJECT_SWITCH, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PROJECT_SWITCH);
    if (denied) return denied;

    const res = runtime.projects.switch(payload);
    audit.append({
      op: CHANNELS.PROJECT_SWITCH,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.id || null,
      extra: { dir: res.ok ? res.data.project.dir : null }
    });
    /* Proje degisti: pano/kadro/hafiza yeni dizinden okunmali. */
    if (res.ok) scheduleResync(runtime, 0);
    return res;
  }));

  ipcMain.handle(CHANNELS.PROJECT_ARCHIVE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PROJECT_ARCHIVE);
    if (denied) return denied;

    const res = runtime.projects.archive(payload);
    audit.append({
      op: CHANNELS.PROJECT_ARCHIVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.id || null
    });
    return res;
  }));

  /* --- saglayicilar + coklu anahtar failover (T4-6) --- */
  ipcMain.handle(CHANNELS.PROVIDER_LIST, wrap(() => runtime.providers.list()));

  ipcMain.handle(CHANNELS.PROVIDER_SAVE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PROVIDER_SAVE);
    if (denied) return denied;

    const res = runtime.providers.save(payload);
    audit.append({
      op: CHANNELS.PROVIDER_SAVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: res.ok ? res.data.provider.id : null,
      extra: { name: res.ok ? res.data.provider.name : null }
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.PROVIDER_KEY_ADD, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PROVIDER_KEY_ADD);
    if (denied) return denied;

    const res = runtime.providers.addKey(payload);
    audit.append({
      op: CHANNELS.PROVIDER_KEY_ADD,
      code: res.ok ? CODES.OK : res.error.code,
      target: res.ok ? `${payload.providerId}/${res.data.key.mask}` : payload.providerId || null
      /* Anahtar degeri audit'e YAZILMAZ; yalniz maske. */
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.PROVIDER_KEY_REMOVE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PROVIDER_KEY_REMOVE);
    if (denied) return denied;

    const res = runtime.providers.removeKey(payload);
    audit.append({
      op: CHANNELS.PROVIDER_KEY_REMOVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.keyId || null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.PROVIDER_TEST, wrap((payload) => runtime.providers.test(payload)));
  ipcMain.handle(CHANNELS.PROVIDER_FAILOVER, wrap((payload) => runtime.providers.failover(payload)));

  /* --- beceriler (T4-4) --- */
  ipcMain.handle(CHANNELS.SKILL_LIST, wrap(() => runtime.skills.list()));

  ipcMain.handle(CHANNELS.SKILL_SAVE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.SKILL_SAVE);
    if (denied) return denied;

    const res = runtime.skills.save(payload);
    audit.append({
      op: CHANNELS.SKILL_SAVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: res.ok ? res.data.skill.id : null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.SKILL_REMOVE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.SKILL_REMOVE);
    if (denied) return denied;

    const res = runtime.skills.remove(payload);
    audit.append({
      op: CHANNELS.SKILL_REMOVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.id || null
    });
    return res;
  }));

  /* --- izin matrisi (T4-4) --- */
  ipcMain.handle(CHANNELS.PERMISSION_GET, wrap(() => runtime.permissions.get()));

  ipcMain.handle(CHANNELS.PERMISSION_SET, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PERMISSION_SET);
    if (denied) return denied;

    const res = runtime.permissions.set(payload);
    audit.append({
      op: CHANNELS.PERMISSION_SET,
      code: res.ok ? CODES.OK : res.error.code,
      target: payload.role || 'matrix',
      extra: { capability: payload.capability || null }
    });
    return res;
  }));

  /* --- uygulama ici tarayici (T4-5): veri yazmaz, ag gecidi main'de --- */
  ipcMain.handle(CHANNELS.BROWSER_OPEN, wrap((payload) => (
    runtime.browser ? runtime.browser.open(payload) : fail(CODES.INTERNAL, 'Tarayıcı hazır değil.')
  )));

  ipcMain.handle(CHANNELS.BROWSER_NAVIGATE, wrap((payload) => (
    runtime.browser ? runtime.browser.navigate(payload) : fail(CODES.INTERNAL, 'Tarayıcı hazır değil.')
  )));

  ipcMain.handle(CHANNELS.BROWSER_HISTORY, wrap((payload) => (
    runtime.browser ? runtime.browser.navigate(payload) : fail(CODES.INTERNAL, 'Tarayıcı hazır değil.')
  )));

  ipcMain.handle(CHANNELS.BROWSER_CLOSE, wrap(() => (
    runtime.browser ? runtime.browser.close() : ok({ open: false })
  )));

  ipcMain.handle(CHANNELS.BROWSER_STATE, wrap(() => (
    runtime.browser ? runtime.browser.state() : ok({ open: false })
  )));

  /* --- ajanin sayfayi okumasi (T5-1): veri yazmaz, ag yapmaz --- */
  ipcMain.handle(CHANNELS.BROWSER_EXTRACT, wrap((payload) => (
    runtime.browser ? runtime.browser.extract(payload) : fail(CODES.INTERNAL, 'Tarayıcı hazır değil.')
  )));

  /* --- dogrudan model sohbeti (T5-2) --- */
  ipcMain.handle(CHANNELS.CHAT_LIST, wrap(() => runtime.chat.list()));

  ipcMain.handle(CHANNELS.CHAT_GET, wrap((payload) => runtime.chat.get(payload)));

  ipcMain.handle(CHANNELS.CHAT_PREVIEW, wrap((payload) => runtime.chat.preview(payload)));

  ipcMain.handle(CHANNELS.CHAT_CREATE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.CHAT_CREATE);
    if (denied) return denied;
    const res = runtime.chat.create(payload);
    return res;
  }));

  ipcMain.handle(CHANNELS.CHAT_SEND, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.CHAT_SEND);
    if (denied) return denied;
    const res = await runtime.chat.send(payload);
    /* Telefon istemcisi acik olsun: konusma degisti. */
    push(CHANNELS.EVENT_PATCH, {
      type: 'chat.sent',
      domain: 'chat',
      at: new Date().toISOString(),
      data: { sessionID: null },
      payload: res.ok ? { conversationId: res.data.conversation.id } : null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.CHAT_RENAME, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.CHAT_RENAME);
    if (denied) return denied;
    return runtime.chat.rename(payload);
  }));

  ipcMain.handle(CHANNELS.CHAT_REMOVE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.CHAT_REMOVE);
    if (denied) return denied;
    return runtime.chat.remove(payload);
  }));

  /* --- telefondan uzaktan kontrol (T5-4) --- */
  ipcMain.handle(CHANNELS.REMOTE_STATE, wrap(() => {
    runtime.remote.ensureToken();
    return ok(runtime.remote.state());
  }));

  ipcMain.handle(CHANNELS.REMOTE_START, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.REMOTE_START);
    if (denied) return denied;
    return runtime.remote.start(payload);
  }));

  ipcMain.handle(CHANNELS.REMOTE_STOP, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.REMOTE_STOP);
    if (denied) return denied;
    return runtime.remote.stop();
  }));

  ipcMain.handle(CHANNELS.REMOTE_ROTATE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.REMOTE_ROTATE);
    if (denied) return denied;
    return runtime.remote.rotate();
  }));

  /* ============================ Tur 6 ============================ */

  /* --- rehber / ilk kurulum (T6-1): durum okur, ilerleme yazar --- */
  ipcMain.handle(CHANNELS.GUIDE_STATE, wrap(() => runtime.guide.state()));

  ipcMain.handle(CHANNELS.GUIDE_UPDATE, wrap((payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.GUIDE_UPDATE);
    if (denied) return denied;
    const res = runtime.guide.update(payload);
    audit.append({
      op: CHANNELS.GUIDE_UPDATE,
      code: res.ok ? CODES.OK : res.error.code,
      target: 'guide.json',
      extra: { step: res.ok ? res.data.step : null, onboarded: res.ok ? res.data.onboarded : null }
    });
    return res;
  }));

  /* --- yerel sunucu (T6-6): durum OLCULUR, baslat/durdur onay ister --- */
  ipcMain.handle(CHANNELS.SERVER_STATUS, wrap(() => runtime.serverManager.status({ probe: true })));

  ipcMain.handle(CHANNELS.SERVER_START, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.SERVER_START);
    if (denied) return denied;
    const res = await runtime.serverManager.start();
    push(CHANNELS.EVENT_PATCH, {
      type: 'server.changed',
      domain: 'server',
      at: new Date().toISOString(),
      data: { sessionID: null },
      payload: res.ok ? res.data : null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.SERVER_STOP, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.SERVER_STOP);
    if (denied) return denied;
    const res = await runtime.serverManager.stop();
    push(CHANNELS.EVENT_PATCH, {
      type: 'server.changed',
      domain: 'server',
      at: new Date().toISOString(),
      data: { sessionID: null },
      payload: res.ok ? res.data : null
    });
    return res;
  }));

  /* --- sayfa ozeti (T6-3): tarayicidan metin okur, ag cagrisi yapmaz --- */
  ipcMain.handle(CHANNELS.BROWSER_SUMMARIZE, wrap((payload) => runtime.summarize.summarize(payload)));

  /* --- hafiza: otomatik cikarim + zihin haritasi (T6-4) --- */
  ipcMain.handle(CHANNELS.MEMORY_AUTO, wrap((payload) => {
    const res = runtime.memory.auto(payload);
    if (res.ok && res.data.count > 0) {
      push(CHANNELS.EVENT_PATCH, {
        type: 'memory.auto',
        domain: 'memory',
        at: new Date().toISOString(),
        data: { sessionID: null },
        payload: { count: res.data.count, total: res.data.total }
      });
    }
    return res;
  }));

  ipcMain.handle(CHANNELS.MEMORY_GRAPH, wrap((payload) => runtime.memory.graph(payload)));

  /* --- Votion (T6-8): soruyu anlar, yerel veriden yanitlar --- */
  ipcMain.handle(CHANNELS.VOICE_ASK, wrap((payload) => runtime.voice.ask(payload)));

  /* --- Votion sesi (Tur 9): TTS/STT saglayici uzerinden, ag yalniz main'de --- */
  ipcMain.handle(CHANNELS.VOICE_SPEAK, wrap(async (payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    return runtime.providers.tts({ text: p.text, voice: p.voice, providerId: p.providerId, model: p.model });
  }));

  ipcMain.handle(CHANNELS.VOICE_TRANSCRIBE, wrap(async (payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    return runtime.providers.transcribe({
      base64: p.base64, mime: p.mime, language: p.language, providerId: p.providerId, model: p.model
    });
  }));

  /* --- Votion masaüstü eylemleri (T8-2): beyaz liste + yıkıcı eylemde onay --- */
  ipcMain.handle(CHANNELS.VOTION_ACT, wrap(async (payload) => {
    const wanted = String(payload.action || '');
    if (runtime.votionActions.CONFIRM_ACTIONS.includes(wanted)) {
      const denied = confirm.verify(payload.confirmToken, CHANNELS.VOTION_ACT);
      if (denied) return denied;
    }
    return runtime.votionActions.run(payload);
  }));

  /* --- Çoklu ekip (T8-5): ayrı lider, ayrı bütçe --- */
  ipcMain.handle(CHANNELS.TEAMS_LIST, wrap(() => runtime.teams.list()));

  ipcMain.handle(CHANNELS.TEAMS_ACT, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.TEAMS_ACT);
    if (denied) return denied;
    const res = runtime.teams.run(payload);
    if (res.ok) {
      push(CHANNELS.EVENT_PATCH, {
        type: 'team.updated',
        domain: 'teams',
        at: new Date().toISOString(),
        data: { sessionID: null },
        payload: { activeId: res.data.activeId || null }
      });
    }
    return res;
  }));

  /* --- Planlar / notlar / zamanlanmış görevler (T8-6) --- */
  ipcMain.handle(CHANNELS.PLAN_LIST, wrap((payload) => runtime.planner.list(payload)));

  ipcMain.handle(CHANNELS.PLAN_ACT, wrap(async (payload) => {
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PLAN_ACT);
    if (denied) return denied;
    const res = runtime.planner.run(payload);
    if (res.ok) {
      push(CHANNELS.EVENT_PATCH, {
        type: 'plan.updated',
        domain: 'plan',
        at: new Date().toISOString(),
        data: { sessionID: null },
        payload: { action: String(payload.action || '') }
      });
    }
    return res;
  }));

  /* --- Dosyalar + bağlam (T8-7): salt okuma, proje köküne kilitli --- */
  ipcMain.handle(CHANNELS.FILES_LIST, wrap((payload) => runtime.files.list(payload)));
  ipcMain.handle(CHANNELS.FILES_READ, wrap((payload) => runtime.files.read(payload)));
  ipcMain.handle(CHANNELS.FILES_CONTEXT, wrap((payload) => runtime.files.context(payload)));

  /* --- Tur 12 (T-119): MCP baglanti katmani (6 invoke) --- */

  /* Ornek tembel: ilgili kanal ilk cagrilana kadar ne surec ne dosya acilir. */
  const getMcpRegistry = () => {
    if (!runtime.mcpRegistry) {
      const projectDir = typeof runtime.getProjectDir === 'function'
        ? (runtime.getProjectDir() || app.getPath('userData'))
        : app.getPath('userData');
      runtime.mcpRegistry = createMcpRegistry({
        configPath: path.join(projectDir, '.keyvotion', 'mcp.json'),
        onEvent: (packet) => push(CHANNELS.EVENT_MCP, packet)
      });
    }
    return runtime.mcpRegistry;
  };

  const mcpRun = async (fn) => {
    try {
      return ok(await fn());
    } catch (err) {
      return mcpErrorResult(err);
    }
  };

  ipcMain.handle(CHANNELS.MCP_LIST, wrap((payload) => {
    if (!hasOnlyKeys(payload, [])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return mcpRun(() => getMcpRegistry().list());
  }));

  ipcMain.handle(CHANNELS.MCP_ADD, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, [
      'id', 'name', 'transport', 'command', 'args', 'url', 'envRecord', 'envKeys', 'confirmToken'
    ])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MCP_ADD);
    if (denied) return denied;

    const body = { ...payload };
    delete body.confirmToken;
    const res = await mcpRun(() => getMcpRegistry().add(body));
    audit.append({
      op: CHANNELS.MCP_ADD,
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.id === 'string' ? payload.id : null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.MCP_REMOVE, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['id', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MCP_REMOVE);
    if (denied) return denied;

    const res = await mcpRun(() => getMcpRegistry().remove(payload.id));
    audit.append({
      op: CHANNELS.MCP_REMOVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.id === 'string' ? payload.id : null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.MCP_CONNECT, wrap((payload) => {
    if (!hasOnlyKeys(payload, ['id'])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return mcpRun(() => getMcpRegistry().connect(payload.id));
  }));

  ipcMain.handle(CHANNELS.MCP_TOOLS, wrap((payload) => {
    if (!hasOnlyKeys(payload, ['id'])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return mcpRun(() => getMcpRegistry().tools(payload.id));
  }));

  ipcMain.handle(CHANNELS.MCP_CALL, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['id', 'tool', 'args'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    /* API-30: yalniz id/tool denetim; arguman ve URL audit'e YAZILMAZ. */
    const res = await mcpRun(() => getMcpRegistry().call(payload.id, payload.tool, payload.args));
    audit.append({
      op: 'mcp.call',
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.id === 'string' ? payload.id : null,
      extra: { tool: typeof payload.tool === 'string' ? payload.tool : null }
    });
    return res;
  }));

  /* --- Tur 12 (T-120): entegrasyon kayit defteri (6 invoke, gercek servis) ---
   * Ornek tembel: ilgili kanal ilk cagrilana kadar ne surec ne dosya acilir. */
  const getIntegrations = () => {
    if (!runtime.integrations) {
      const projectDir = typeof runtime.getProjectDir === 'function'
        ? (runtime.getProjectDir() || app.getPath('userData'))
        : app.getPath('userData');
      runtime.integrations = createIntegrationsService({
        catalogPath: path.join(__dirname, 'services', 'integration-catalog.json'),
        statePath: path.join(projectDir, '.keyvotion', 'integrations.json'),
        safeStorage,
        allowInsecureLoopback: false,
        onEvent: (packet) => push(CHANNELS.EVENT_INTEGRATION, packet)
      });
    }
    return runtime.integrations;
  };

  /* Servis `err.code` firlatir; tek zarf icinde kod korunur (API-30: sir YOK). */
  const integrationRun = async (fn) => {
    try {
      return ok(await fn());
    } catch (err) {
      const code = err && typeof err.code === 'string' ? err.code : CODES.INTERNAL;
      return fail(code, err && err.message ? err.message : undefined, {
        detail: err && err.detail !== undefined ? err.detail : null
      });
    }
  };

  ipcMain.handle(CHANNELS.INTEGRATION_LIST, wrap((payload) => {
    if (!hasOnlyKeys(payload, [])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return integrationRun(() => getIntegrations().list());
  }));
  ipcMain.handle(CHANNELS.INTEGRATION_SAVE, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, [
      'providerId', 'label', 'token', 'fields', 'confirmToken'
    ])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    const denied = confirm.verify(payload.confirmToken, CHANNELS.INTEGRATION_SAVE);
    if (denied) return denied;

    const body = { ...payload };
    delete body.confirmToken;
    const res = await integrationRun(() => getIntegrations().save(body));
    audit.append({
      op: CHANNELS.INTEGRATION_SAVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.providerId === 'string' ? payload.providerId : null
    });
    return res;
  }));
  ipcMain.handle(CHANNELS.INTEGRATION_REMOVE, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['id', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.INTEGRATION_REMOVE);
    if (denied) return denied;

    const res = await integrationRun(() => getIntegrations().remove({ id: payload.id }));
    audit.append({
      op: CHANNELS.INTEGRATION_REMOVE,
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.id === 'string' ? payload.id : null
    });
    return res;
  }));
  ipcMain.handle(CHANNELS.INTEGRATION_TEST, wrap((payload) => {
    if (!hasOnlyKeys(payload, ['id'])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return integrationRun(() => getIntegrations().test(payload));
  }));
  ipcMain.handle(CHANNELS.INTEGRATION_CAPABILITIES, wrap((payload) => {
    if (!hasOnlyKeys(payload, ['providerId'])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return integrationRun(() => getIntegrations().capabilities(payload));
  }));
  ipcMain.handle(CHANNELS.INTEGRATION_INVOKE, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['id', 'capability', 'params'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    /* API-30: yalniz id/capability denetim; arguman/URL/token audit'e YAZILMAZ. */
    const res = await integrationRun(() => getIntegrations().invoke(payload));
    audit.append({
      op: 'integration.invoke',
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.id === 'string' ? payload.id : null,
      extra: { capability: typeof payload.capability === 'string' ? payload.capability : null }
    });
    return res;
  }));

  /* --- Tur 13 (v3.1 — T-137): MCP şablon kataloğu + OAuth2 --- */

  const getOAuth = () => {
    if (!runtime.oauth) {
      runtime.oauth = createOAuthService({
        safeStorage,
        userDataDir: app.getPath('userData'),
        onEvent: (packet) => {
          push(CHANNELS.EVENT_INTEGRATION, packet);
          if (packet.type === 'oauth:callback' && packet.ok) {
            void runtime.oauth.complete({ flowId: packet.flowId }).catch((error) => {
              push(CHANNELS.EVENT_INTEGRATION, {
                type: 'oauth:failed', accountId: packet.accountId,
                providerId: packet.providerId, code: error.code || 'E_OAUTH_TOKEN'
              });
            });
          }
        }
      });
    }
    return runtime.oauth;
  };

  /* Şablonlar statiktir ve sır içermez; yine de yalnız bilinen alanlar döndürülür. */
  const MCP_TEMPLATE_FIELDS = [
    'id', 'name', 'vendor', 'category', 'transport', 'command',
    'url', 'args', 'envKeys', 'toolsHint', 'docs'
  ];
  const publicTemplate = (tpl) => {
    const out = {};
    for (const key of MCP_TEMPLATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(tpl, key)) out[key] = tpl[key];
    }
    return out;
  };

  ipcMain.handle(CHANNELS.MCP_CATALOG_LIST, wrap((payload) => {
    if (!hasOnlyKeys(payload, [])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return ok(MCP_CATALOG.map(publicTemplate));
  }));

  ipcMain.handle(CHANNELS.MCP_CATALOG_INSTALL, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['id', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.MCP_CATALOG_INSTALL);
    if (denied) return denied;

    const tpl = MCP_CATALOG.find((item) => item.id === payload.id);
    if (!tpl) return fail(CODES.NOT_FOUND, 'MCP şablonu bulunamadı.');
    /* add() yalnız ADD_KEYS kabul eder; envKeys (isim listesi) kuruluma aktarılmaz. */
    const body = { id: tpl.id, name: tpl.name, transport: tpl.transport };
    if (tpl.transport === 'stdio') {
      body.command = tpl.command;
      body.args = (tpl.args || []).slice();
    } else {
      body.url = tpl.url;
    }
    const res = await mcpRun(() => getMcpRegistry().add(body));
    audit.append({
      op: CHANNELS.MCP_CATALOG_INSTALL,
      code: res.ok ? CODES.OK : res.error.code,
      target: tpl.id
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.OAUTH_START, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['providerId', 'accountId', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.OAUTH_START);
    if (denied) return denied;

    const res = await oauthRun(() => getOAuth().begin({
      providerId: payload.providerId, accountId: payload.accountId
    }));
    if (res.ok) {
      audit.append({
        op: CHANNELS.OAUTH_START,
        code: CODES.OK,
        target: typeof payload.accountId === 'string' ? payload.accountId : null
      });
    }
    return res;
  }));

  ipcMain.handle(CHANNELS.OAUTH_STATUS, wrap((payload) => {
    if (!hasOnlyKeys(payload, ['accountId', 'providerId'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    /* servis yalnız {connected, expiresAt, scopes} döndürür — token/kod YOK. */
    return oauthRun(() => getOAuth().status(payload));
  }));

  ipcMain.handle(CHANNELS.OAUTH_REVOKE, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['accountId', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.OAUTH_REVOKE);
    if (denied) return denied;

    const res = await oauthRun(() => getOAuth().revoke({ accountId: payload.accountId }));
    audit.append({
      op: CHANNELS.OAUTH_REVOKE,
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.accountId === 'string' ? payload.accountId : null
    });
    return res;
  }));

  /* --- Tur 14 (T-146): hazır bağlantı şablonları + Votion araç erişimi --- */

  const getPresets = () => {
    if (!runtime.presets) {
      runtime.presets = createPresetsService({
        integrationCatalog: INTEGRATION_CATALOG,
        mcpCatalog: MCP_CATALOG,
        integrations: getIntegrations,
        oauth: getOAuth,
        mcpRegistry: getMcpRegistry
      });
    }
    return runtime.presets;
  };

  const getVotionTools = () => {
    if (!runtime.votionTools) {
      runtime.votionTools = createVotionTools({
        integrationCatalog: INTEGRATION_CATALOG,
        mcpCatalog: MCP_CATALOG,
        presets: getPresets(),
        integrations: getIntegrations,
        mcpRegistry: getMcpRegistry,
        /* Yalnız üst veri yazar; parametre/sır ASLA audit'e girmez (API-30). */
        audit: (entry) => audit.append({
          op: entry.op,
          code: entry.code,
          target: entry.capabilityId,
          extra: { capabilityId: entry.capabilityId, status: entry.status }
        })
      });
    }
    return runtime.votionTools;
  };

  ipcMain.handle(CHANNELS.PRESET_LIST, wrap((payload) => {
    if (!hasOnlyKeys(payload, [])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return presetRun(() => getPresets().list());
  }));

  ipcMain.handle(CHANNELS.PRESET_APPLY, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['presetId', 'values', 'kind', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.PRESET_APPLY);
    if (denied) return denied;

    const res = await presetRun(() => getPresets().apply({
      presetId: payload.presetId,
      values: payload.values,
      kind: payload.kind
    }));
    audit.append({
      op: CHANNELS.PRESET_APPLY,
      code: res.ok ? CODES.OK : res.error.code,
      target: typeof payload.presetId === 'string' ? payload.presetId : null
    });
    return res;
  }));

  ipcMain.handle(CHANNELS.VOTION_TOOLS, wrap((payload) => {
    if (!hasOnlyKeys(payload, [])) return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    return ok(getVotionTools().manifest());
  }));

  ipcMain.handle(CHANNELS.VOTION_INVOKE, wrap(async (payload) => {
    if (!hasOnlyKeys(payload, ['capabilityId', 'params', 'role', 'confirmToken'])) {
      return fail(CODES.BAD_REQUEST, 'Şema dışı alan gönderildi.');
    }
    const denied = confirm.verify(payload.confirmToken, CHANNELS.VOTION_INVOKE);
    if (denied) return denied;

    /* audit kaydı servis içinde 'votion:invoke' op'uyla yazılır (params YOK). */
    return votionRun(() => getVotionTools().invoke(payload));
  }));

  /* --- events --- */
  ipcMain.handle(CHANNELS.EVENT_SUBSCRIBE, wrap(async () => {    startEvents(runtime);
    return ok({ subscribed: true, types: EVENT_TYPES.slice() });
  }));}

function startEvents(runtime) {
  if (eventsService && eventsService.isRunning()) return;

  eventsService = createEventsService({
    http: runtime.http,
    onConnection: (state) => {
      push(CHANNELS.EVENT_CONNECTION, {
        type: 'connection.state',
        state,
        at: new Date().toISOString(),
        data: { sessionID: null }
      });
    },
    onEvent: (event) => {
      // Push zarfi: {type, data:{sessionID}} — renderer bunu okur (API-74).
      push(CHANNELS.EVENT_PATCH, {
        domain: 'event',
        type: event.type,
        seq: event.seq,
        at: event.at,
        data: pickEventRef(event.payload)
      });
      if (/^session\./.test(event.type) || event.type === 'unknown') {
        scheduleResync(runtime, 2000);
      }
    },
    onResync: async () => {
      const res = await runtime.sessions.list();
      if (res.ok) {
        push(CHANNELS.EVENT_PATCH, {
          type: 'team.sync',
          domain: 'team',
          at: new Date().toISOString(),
          data: { sessionID: null, reason: 'resync' },
          payload: res.data
        });
      }
    }
  });

  eventsService.start();
}

function startBoardWatch(runtime) {
  if (stopBoardWatch) stopBoardWatch();
  stopBoardWatch = runtime.board.watch((result) => {
    push(CHANNELS.EVENT_PATCH, {
      type: 'board.changed',
      domain: 'board',
      at: new Date().toISOString(),
      data: { sessionID: null },
      payload: result.ok ? result.data : null,
      error: result.ok ? null : result.error
    });
  });
}

/* -------------------------------------------------------------- zamanlayici */

/**
 * Planlayıcıyı her 30 sn yoklar. Tetiklenen her zamanlama için bir görev
 * açılır; renderer `plan.fired` yamasını alır. `unref` ile uygulama kapanışını
 * engellemez.
 */
/* T-205: açılışta otomatik bağlantı. Kullanıcı "sunucuya bağlanılamıyor"
   görmesin: yerel OpenCode sunucusu kapalıysa bir kez başlatılır; telefon
   uzaktan erişimi yalnız daha önce eşleşmiş bir jeton varsa otomatik açılır
   (ilk kurulumda LAN'a kapı açmamak için). Hatalar sessizdir; renderer durumu
   ve ipucunu gösterir. */
async function autoConnect(runtime) {
  try {
    const st = await runtime.serverManager.status({ probe: true });
    if (!(st.ok && st.data && st.data.connected)) {
      await runtime.serverManager.start();
    }
  } catch { /* sunucu yoksa renderer ipucu gösterir */ }
  try {
    const r = runtime.remote ? runtime.remote.state() : null;
    if (r && r.hasSavedToken && !r.running) await runtime.remote.start({});
  } catch { /* uzaktan erişim isteğe bağlı */ }
}

/**
 * T-206: bağlantı gözcüsü.
 *
 * ÖLÇÜLEN KUSUR: `autoConnect` tek atımlıktı ve sonucu renderer'a
 * BİLDİRMİYORDU. Sunucu açılışı 8 sn'ye kadar sürebildiği için renderer'ın
 * açılış yoklaması bitiyor, kullanıcı kalıcı olarak "Çevrimdışı" (kırmızı)
 * görüyordu; sunucu arkada açılsa bile gösterge güncellenmiyordu. Ayrıca
 * sunucu sonradan ölürse hiçbir şey yeniden bağlanmıyordu.
 *
 * ÇÖZÜM: durum değiştiğinde `server.changed` yayınlanır (renderer göstergesi
 * gerçek duruma çekilir) ve bağlantı yoksa artan aralıkla yeniden başlatma
 * denenir. Denemeler sınırlıdır; opencode bulunamıyorsa sonsuz döngü olmaz.
 */
let serverWatchTimer = null;
let serverWatchSignature = '';

function publishServerState(runtime, data) {
  if (!data) return;
  const sig = `${data.connected ? 'up' : 'down'}|${data.error || ''}|${data.mode || ''}|${data.version || ''}`;
  if (sig === serverWatchSignature) return;
  serverWatchSignature = sig;
  push(CHANNELS.EVENT_PATCH, {
    type: 'server.changed',
    domain: 'server',
    at: new Date().toISOString(),
    data: { sessionID: null },
    payload: data
  });
}

function watchServer(runtime) {
  if (serverWatchTimer) return;
  const DELAYS = [1500, 4000, 8000, 15000, 30000];
  let step = 0;
  const tick = async () => {
    try {
      const st = await runtime.serverManager.status({ probe: true });
      const data = st && st.ok ? st.data : null;
      if (data && data.connected) {
        step = 0;
        publishServerState(runtime, data);
        return;
      }
      publishServerState(runtime, data);
      if (step >= DELAYS.length) return; /* pes et: kullanıcı elle başlatabilir */
      const res = await runtime.serverManager.start();
      const after = res && res.ok && res.data ? res.data : data;
      publishServerState(runtime, after);
      if (!(after && after.connected)) step += 1;
    } catch { /* sessiz: renderer ipucu gösterir */ }
  };
  const loop = () => {
    tick();
    serverWatchTimer = setTimeout(loop, DELAYS[Math.min(step, DELAYS.length - 1)]);
    if (serverWatchTimer && typeof serverWatchTimer.unref === 'function') serverWatchTimer.unref();
  };
  loop();
}

function startPlanner(runtime) {
  if (plannerTimer) return;
  const run = () => {
    const res = runtime.planner.tick(new Date());
    if (!res.ok) return;
    if (res.data && res.data.fired && res.data.fired.length) {
      push(CHANNELS.EVENT_PATCH, {
        type: 'plan.fired',
        domain: 'plan',
        at: new Date().toISOString(),
        data: { sessionID: null },
        payload: { tasks: res.data.fired }
      });
    }
  };
  run();
  plannerTimer = setInterval(run, 30000);
  if (typeof plannerTimer.unref === 'function') plannerTimer.unref();
}

/* ---------------------------------------------------------------- app yasam */

app.whenReady().then(() => {
  const runtime = createRuntime();
  activeRuntime = runtime;

  /* Tarayici main prosesde yasar; renderer yalniz dikdortgen bildirir. */
  mainWindow = createWindow(runtime);
  runtime.attachBrowser(createBrowserService({
    getWindow: () => mainWindow,
    onState: (state) => push(CHANNELS.EVENT_PATCH, {
      type: 'browser.state',
      domain: 'browser',
      at: new Date().toISOString(),
      data: { sessionID: null },
      payload: state
    })
  }));
  mainWindow.on('closed', () => {
    if (runtime.browser) runtime.browser.dispose();
  });

  registerChannels(runtime);

  startBoardWatch(runtime);
  startEvents(runtime);
  startPlanner(runtime);
  scheduleResync(runtime, 500);
  /* T-205: pencere açılırken bağlantıyı arka planda kur; açılışı bekletme. */
  autoConnect(runtime);
  /* T-206: bağlantı düşerse/gecikirse kendini onar ve göstergesi güncellensin. */
  watchServer(runtime);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (eventsService) eventsService.stop();
  if (stopBoardWatch) stopBoardWatch();
  if (resyncTimer) clearTimeout(resyncTimer);
  if (plannerTimer) { clearInterval(plannerTimer); plannerTimer = null; }
  /* T-206: sunucu gözcüsü de dursun (kapanışı geciktirmesin). */
  if (serverWatchTimer) { clearTimeout(serverWatchTimer); serverWatchTimer = null; }
  if (process.platform !== 'darwin') app.quit();
});

/* Uzak erisim sunucusu uygulamayla birlikte kapanir (port sizmasin). */
app.on('before-quit', () => {
  if (activeRuntime && activeRuntime.remote) {
    try { activeRuntime.remote.stop(); } catch { /* yoksay */ }
  }
  /* T-119: MCP alt süreçleri birakma (tüm stop() promise'leri beklenir). */
  if (activeRuntime && activeRuntime.mcpRegistry) {
    try {
      Promise.resolve(activeRuntime.mcpRegistry.shutdown()).catch(() => { /* yoksay */ });
    } catch { /* yoksay */ }
  }
  /* T-120: entegrasyon servisi bekleyen isteklerini kapatir. */
  if (activeRuntime && activeRuntime.integrations) {
    try {
      Promise.resolve(activeRuntime.integrations.shutdown()).catch(() => { /* yoksay */ });
    } catch { /* yoksay */ }
  }
});
