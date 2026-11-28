'use strict';

/*
 * T-146 — hazır bağlantı şablonları çekirdeği (IPC YOK).
 *
 * Tek veri kaynağı: connection-presets.json (124 kayıt). Bu modül ağ açmaz;
 * yönlendirme yalnız mevcut servislere (oauth / entegrasyon / kayıt defteri)
 * yapılır. Sır DEĞERİ hiçbir çıktıda, hatada veya güvenlik kaydında görünmez;
 * hata metinleri sabit kodlu mesajlardır.
 */

const fs = require('node:fs');
const path = require('node:path');

const PRESET_FILE = 'connection-presets.json';

const ERROR_CODES = Object.freeze({
  UNKNOWN: 'E_PRESET_UNKNOWN',
  KIND: 'E_PRESET_KIND_MISMATCH',
  MISSING: 'E_PRESET_MISSING_FIELDS'
});

const MESSAGES = Object.freeze({
  E_PRESET_UNKNOWN: 'Bilinmeyen bağlantı şablonu.',
  E_PRESET_KIND_MISMATCH: 'Bağlantı türü uyuşmuyor.',
  E_PRESET_MISSING_FIELDS: 'Zorunlu alanlar eksik.'
});

function makeError(code, detail) {
  const err = new Error(MESSAGES[code] || code);
  err.code = code;
  if (detail !== undefined) err.detail = detail;
  return err;
}

/** Alan görünümü: yalnız ad/ipucu taşır, DEĞER taşımaz. */
const FIELD_KEYS = ['key', 'label', 'placeholder', 'hint', 'secret', 'required', 'howToGet', 'url'];
function publicField(field) {
  const out = {};
  for (const key of FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(field, key)) out[key] = field[key];
  }
  return out;
}

const PRESET_KEYS = [
  'id', 'kind', 'refId', 'name', 'vendor', 'category', 'authMode',
  'logoHint', 'summary', 'scopes', 'docsUrl'
];
function publicPreset(preset) {
  const out = {};
  for (const key of PRESET_KEYS) {
    if (Object.prototype.hasOwnProperty.call(preset, key)) {
      out[key] = key === 'scopes' && Array.isArray(preset[key]) ? preset[key].slice() : preset[key];
    }
  }
  out.fields = (Array.isArray(preset.fields) ? preset.fields : []).map(publicField);
  if (preset.kind === 'integration' && preset.testCapability) out.testCapability = preset.testCapability;
  if (preset.kind === 'mcp' && preset.mcpTemplate) out.mcpTemplate = preset.mcpTemplate;
  return out;
}

function asService(ref) {
  return ref && typeof ref === 'function' ? ref() : ref;
}

/**
 * @param {object} options
 *  - presetsPath?: string            varsayılan <bu dizin>/connection-presets.json
 *  - integrationCatalog?: Array      resolve() için katalog kaydı
 *  - mcpCatalog?: Array              resolve() için katalog kaydı
 *  - integrations?: object|Function  mevcut entegrasyon servisi (veya getter)
 *  - oauth?: object|Function         mevcut onay akışı servisi (veya getter)
 *  - mcpRegistry?: object|Function   mevcut kayıt defteri servisi (veya getter)
 */
function createPresetsService(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const presetsPath = typeof opts.presetsPath === 'string' && opts.presetsPath
    ? opts.presetsPath
    : path.join(__dirname, PRESET_FILE);
  const integrationCatalog = Array.isArray(opts.integrationCatalog) ? opts.integrationCatalog : [];
  const mcpCatalog = Array.isArray(opts.mcpCatalog) ? opts.mcpCatalog : [];

  let cache = null;
  function load() {
    if (!cache) cache = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
    return cache;
  }
  function byId(id) {
    return load().find((preset) => preset && preset.id === id) || null;
  }

  /* --------------------------------------------------------------- list */
  function list() {
    const oauth = asService(opts.oauth);
    return load().map((preset) => {
      const view = publicPreset(preset);
      if (preset.authMode === 'oauth2' && typeof oauth?.configured === 'function') {
        view.oauthReady = oauth.configured(preset.refId);
      }
      return view;
    });
  }

  /* ------------------------------------------------------------- resolve */
  function resolve(presetId) {
    const preset = byId(presetId);
    if (!preset) throw makeError(ERROR_CODES.UNKNOWN);
    const source = preset.kind === 'integration' ? integrationCatalog : mcpCatalog;
    const found = source.find((item) => item && item.id === preset.refId) || null;
    return { preset: publicPreset(preset), ref: found ? { ...found } : null };
  }

  /* --------------------------------------------------------------- apply */
  function apply(input) {
    const body = input && typeof input === 'object' ? input : {};
    const preset = byId(body.presetId);
    if (!preset) throw makeError(ERROR_CODES.UNKNOWN);

    /* İsteğe bağlı `kind` bildirimi şablonun türüyle çelişemez. */
    if (body.kind !== undefined && body.kind !== preset.kind) {
      throw makeError(ERROR_CODES.KIND);
    }

    const supplied = body.values && typeof body.values === 'object' && !Array.isArray(body.values)
      ? body.values
      : {};
    const required = (preset.fields || []).filter((field) => field.required).map((field) => field.key);
    const missing = required.filter((key) => {
      const value = supplied[key];
      return value === undefined || value === null || (typeof value === 'string' && !value.trim());
    });
    /* Yalnız eksik ANAHTARLAR döner; değerler asla görünmez. */
    if (missing.length) throw makeError(ERROR_CODES.MISSING, { fields: missing });

    const base = { ok: true, presetId: preset.id, kind: preset.kind };

    if (preset.kind === 'integration' && preset.authMode === 'oauth2') {
      const oauth = asService(opts.oauth);
      if (!oauth || typeof oauth.begin !== 'function') throw makeError(ERROR_CODES.UNKNOWN);
      const accountId = typeof supplied.accountId === 'string' && supplied.accountId
        ? supplied.accountId
        : `${preset.refId}-${Date.now().toString(36)}`;
      const integrations = asService(opts.integrations);
      const input = { providerId: preset.refId, accountId };
      if (typeof integrations?.linkOAuth === 'function') input.onConnected = integrations.linkOAuth;
      const started = oauth.begin(input);
      return Promise.resolve(started).then((flow) => ({
        ...base,
        next: 'oauth',
        accountId,
        flowId: flow.flowId,
        authUrl: flow.authUrl,
        redirectUri: flow.redirectUri
      }));
    }

    if (preset.kind === 'integration') {
      const integrations = asService(opts.integrations);
      if (!integrations || typeof integrations.save !== 'function') throw makeError(ERROR_CODES.UNKNOWN);
      const provided = {};
      for (const field of preset.fields || []) {
        if (supplied[field.key] !== undefined) provided[field.key] = supplied[field.key];
      }
      const secretKey = provided.token !== undefined ? 'token'
        : (provided.password !== undefined ? 'password' : null);
      const tokenValue = secretKey ? String(provided[secretKey]) : '';
      const extraFields = {};
      for (const key of Object.keys(provided)) if (key !== secretKey) extraFields[key] = provided[key];
      const saved = integrations.save({
        providerId: preset.refId,
        label: preset.name,
        token: tokenValue,
        fields: extraFields
      });
      return Promise.resolve(saved).then((res) => ({
        ...base,
        next: 'saved',
        accountId: res && res.id ? res.id : null
      }));
    }

    /* mcp + install: mevcut katalog kurulum deseni; sır DEĞERİ diske yazılmaz. */
    const registry = asService(opts.mcpRegistry);
    if (!registry || typeof registry.add !== 'function') throw makeError(ERROR_CODES.UNKNOWN);
    const template = mcpCatalog.find((item) => item && item.id === preset.refId);
    if (!template) throw makeError(ERROR_CODES.UNKNOWN);
    const installBody = {
      id: template.id,
      name: template.name,
      transport: template.transport
    };
    if (template.transport === 'stdio') {
      installBody.command = template.command;
      installBody.args = Array.isArray(template.args) ? template.args.slice() : [];
    } else if (template.url) {
      installBody.url = template.url;
    }
    const added = registry.add(installBody);
    return Promise.resolve(added).then((res) => ({
      ...base,
      next: 'installed',
      serverId: res && res.id ? res.id : template.id
    }));
  }

  return { list, resolve, apply };
}

module.exports = { createPresetsService, ERROR_CODES, PRESET_FILE };
