'use strict';

/*
 * T-146 — Votion'un bağlantı yeteneklerine tam erişimi (IPC YOK).
 *
 * Bu modül ağ açmaz: çağrılar mevcut entegrasyon/kayıt defteri servislerine
 * yönlendirilir. Manifesto ve bağlam bloğu boyut sınırlıdır; sır DEĞERİ,
 * parametre veya belirteç hiçbir çıktıda ya da güvenlik kaydında görünmez.
 */

const MAX_BYTES = 24000;

/* Yönetsel sayılan sağlayıcılar: öğretmen/öğrenci rolü bunları çağıramaz. */
const ADMIN_ONLY_PROVIDERS = Object.freeze([
  'stripe', 'paypal', 'square', 'gumroad', 'lemon-squeezy'
]);

const ERROR_CODES = Object.freeze({
  UNKNOWN: 'E_PRESET_UNKNOWN',
  FORBIDDEN: 'E_FORBIDDEN'
});

const MESSAGES = Object.freeze({
  E_PRESET_UNKNOWN: 'Bilinmeyen yetenek.',
  E_FORBIDDEN: 'Bu bağlantı için yeterli yetki yok.'
});

function makeError(code, detail) {
  const err = new Error(MESSAGES[code] || code);
  err.code = code;
  if (detail !== undefined) err.detail = detail;
  return err;
}

const bytes = (text) => Buffer.byteLength(String(text), 'utf8');
const cut = (text, len) => String(text === undefined || text === null ? '' : text).slice(0, len);

function byteTruncate(text, max) {
  let out = String(text);
  while (bytes(out) > max && out.length) out = out.slice(0, -1);
  return out;
}

function asService(ref) {
  return ref && typeof ref === 'function' ? ref() : ref;
}

/**
 * @param {object} options
 *  - integrationCatalog?: Array
 *  - mcpCatalog?: Array
 *  - presets?: object|Array   list()'i olan servis veya doğrudan dizi
 *  - integrations?: object|Function
 *  - mcpRegistry?: object|Function
 *  - audit?: (entry)=>void    yalnız üst veri alır
 */
function createVotionTools(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const integrationCatalog = Array.isArray(opts.integrationCatalog) ? opts.integrationCatalog : [];
  const mcpCatalog = Array.isArray(opts.mcpCatalog) ? opts.mcpCatalog : [];
  const audit = typeof opts.audit === 'function' ? opts.audit : () => {};

  /* Şablonlardan gelen authMode eşlemesi (yalnız meta veri). */
  const authModeByRef = new Map();
  const presetSource = opts.presets && typeof opts.presets.list === 'function'
    ? opts.presets.list()
    : (Array.isArray(opts.presets) ? opts.presets : []);
  for (const preset of presetSource) {
    if (preset && preset.kind === 'integration') authModeByRef.set(preset.refId, preset.authMode);
  }
  const presetCounts = (() => {
    const total = presetSource.length;
    const needsFields = presetSource.filter((p) =>
      p && Array.isArray(p.fields) && p.fields.some((f) => f && f.required)).length;
    return { total, ready: total - needsFields, needsFields };
  })();

  function authModeOf(provider) {
    if (authModeByRef.has(provider.id)) return authModeByRef.get(provider.id);
    const kind = provider.auth && provider.auth.kind;
    if (kind === 'none') return 'none';
    if (kind === 'basic') return 'basic';
    return 'token';
  }

  function savedAccounts() {
    try {
      const svc = asService(opts.integrations);
      const res = svc && typeof svc.list === 'function' ? svc.list() : null;
      const rows = res && Array.isArray(res.accounts) ? res.accounts : (Array.isArray(res) ? res : []);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function installedIds() {
    try {
      const svc = asService(opts.mcpRegistry);
      const res = svc && typeof svc.list === 'function' ? svc.list() : null;
      const rows = res && Array.isArray(res.servers) ? res.servers : (Array.isArray(res) ? res : []);
      return new Set((Array.isArray(rows) ? rows : []).map((row) => row && row.id));
    } catch {
      return new Set();
    }
  }

  /* ------------------------------------------------------------ manifest */
  /* Seviye 0 tam; 1 özet 60/parametre ad; 2 özet yok; 3 parametre yok;
     4 kategori alanı da çıkarılır. İlk sığan seviye seçilir. */
  function buildManifest(level) {
    const summaryLen = level === 0 ? Infinity : (level === 1 ? 60 : 0);
    const hintLen = level === 0 ? Infinity : (level === 1 ? 60 : 0);
    const fullParams = level === 0;
    const nameParams = level === 1 || level === 2;
    const keepCategory = level <= 3;

    const readyProviders = new Set(savedAccounts().map((a) => a && a.providerId));
    const installed = installedIds();

    const integrations = integrationCatalog.map((provider) => {
      const row = { id: provider.id, name: provider.name };
      if (keepCategory) row.category = provider.category;
      row.authMode = authModeOf(provider);
      row.ready = readyProviders.has(provider.id);
      row.capabilities = (Array.isArray(provider.capabilities) ? provider.capabilities : []).map((cap) => {
        const view = { id: cap.id };
        view.summary = summaryLen === Infinity ? cut(cap.summary) : cut(cap.summary, summaryLen);
        view.verb = cap.verb || null;
        if (fullParams) {
          view.params = Object.entries(cap.params || {}).map(([name, def]) => ({
            name, required: Boolean(def && def.required)
          }));
        } else if (nameParams) {
          view.params = Object.keys(cap.params || {});
        } else {
          view.params = [];
        }
        return view;
      });
      return row;
    });

    const mcp = mcpCatalog.map((template) => {
      const row = { id: template.id, name: template.name };
      if (keepCategory) row.category = template.category;
      row.transport = template.transport;
      row.installed = installed.has(template.id);
      row.toolsHint = hintLen === Infinity ? cut(template.toolsHint) : cut(template.toolsHint, hintLen);
      return row;
    });

    return {
      integrations,
      mcp,
      presets: { ...presetCounts },
      limits: { maxBytes: MAX_BYTES, truncated: level > 0 }
    };
  }

  function manifest() {
    let level = 0;
    let result = buildManifest(level);
    while (bytes(JSON.stringify(result)) > MAX_BYTES && level < 4) {
      level += 1;
      result = buildManifest(level);
    }
    /* Seviye 4 yalnız kimlik/ad/tür/t durum taşır; sınırın altında kalır. */
    return result;
  }

  /* --------------------------------------------------------- contextBlock */
  function contextBlock() {
    const accounts = savedAccounts();
    const readyNames = [...new Set(accounts.map((a) => a && a.providerId).filter(Boolean))];
    const installed = [...installedIds()].filter(Boolean);
    const lines = [];
    lines.push('Şu bağlantıların var, şu yetenekleri çağırabilirsin:');
    lines.push('');
    lines.push(`Kurulu entegrasyonlar: ${readyNames.length ? readyNames.join(', ') : 'henüz yok'}`);
    lines.push(`Kurulu MCP sunucuları: ${installed.length ? installed.join(', ') : 'henüz yok'}`);
    lines.push('');
    lines.push('Çağırabileceğin yetenekler (capabilityId — kısa açıklama):');
    for (const provider of integrationCatalog) {
      for (const cap of (Array.isArray(provider.capabilities) ? provider.capabilities : [])) {
        lines.push(`- integration:${provider.id}:${cap.id} — ${cut(cap.summary, 70)}`);
      }
    }
    for (const template of mcpCatalog) {
      lines.push(`- mcp:${template.id} — ${cut(template.toolsHint, 70)}`);
    }
    let text = lines.join('\n');
    if (bytes(text) > MAX_BYTES) {
      text = lines.map((line) => line.startsWith('- ') ? line.split(' — ')[0] : line).join('\n');
    }
    return byteTruncate(text, MAX_BYTES);
  }

  /* --------------------------------------------------------------- invoke */
  async function invoke(input) {
    const body = input && typeof input === 'object' ? input : {};
    const capabilityId = typeof body.capabilityId === 'string' ? body.capabilityId : '';
    const params = body.params && typeof body.params === 'object' && !Array.isArray(body.params)
      ? { ...body.params }
      : {};
    const role = typeof body.role === 'string' ? body.role
      : (typeof params.role === 'string' ? params.role : 'admin');
    delete params.role;

    let status = 'ok';
    let code = 'E_OK';
    try {
      const parts = capabilityId.split(':');

      if (parts[0] === 'integration') {
        const providerId = parts[1] || '';
        const capId = parts[2] || '';
        const provider = integrationCatalog.find((item) => item && item.id === providerId);
        const cap = provider && (Array.isArray(provider.capabilities) ? provider.capabilities : [])
          .find((item) => item && item.id === capId);
        if (!provider || !cap) throw makeError(ERROR_CODES.UNKNOWN);
        if (ADMIN_ONLY_PROVIDERS.includes(providerId)
          && (role === 'teacher' || role === 'student')) throw makeError(ERROR_CODES.FORBIDDEN);

        const account = savedAccounts().find((a) => a && a.providerId === providerId);
        if (!account) throw makeError(ERROR_CODES.UNKNOWN);
        const svc = asService(opts.integrations);
        if (!svc || typeof svc.invoke !== 'function') throw makeError(ERROR_CODES.UNKNOWN);
        return await svc.invoke({ id: account.id, capability: capId, params });
      }

      if (parts[0] === 'mcp') {
        const serverId = parts[1] || '';
        const tool = parts.slice(2).join(':');
        if (!serverId || !tool || !installedIds().has(serverId)) throw makeError(ERROR_CODES.UNKNOWN);
        const svc = asService(opts.mcpRegistry);
        if (!svc || typeof svc.call !== 'function') throw makeError(ERROR_CODES.UNKNOWN);
        return await svc.call(serverId, tool, params);
      }

      throw makeError(ERROR_CODES.UNKNOWN);
    } catch (err) {
      status = 'error';
      code = err && typeof err.code === 'string' ? err.code : 'E_INTERNAL';
      throw err;
    } finally {
      /* Yalnız üst veri: op / capabilityId / durum / kod. params ASLA yazılmaz. */
      try { audit({ op: 'votion:invoke', capabilityId, status, code }); } catch { /* yoksay */ }
    }
  }

  return { manifest, contextBlock, invoke };
}

module.exports = { createVotionTools, MAX_BYTES, ADMIN_ONLY_PROVIDERS, ERROR_CODES };
