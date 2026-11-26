'use strict';

/*
 * T-151 — uçtan uca işlev testi yardımcısı (ağ YOK, gerçek kullanıcı verisi YOK).
 *
 * Gerçek main servislerini geçici bir köke bağlar:
 *   integrations.js  → gerçek şifreleme yolu (safeStorage yerine AES-256-GCM vekili)
 *   presets.js       → gerçek apply
 *   mcp-registry.js  → gerçek config yazımı
 *   audit.js         → gerçek jsonl denetim kaydı
 *
 * IPC katmanı (confirmToken, wrap, paket zarfı) bu testin kapsamı dışındadır;
 * main.js'teki handler'ların audit çağrısı birebir taklit edilir.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { SRC } = require('../lib');

const SERVICES = path.join(SRC, 'main', 'services');
const { createIntegrationsService } = require(path.join(SERVICES, 'integrations.js'));
const { createPresetsService } = require(path.join(SERVICES, 'presets.js'));
const { createMcpRegistry } = require(path.join(SERVICES, 'mcp-registry.js'));
const { createVotionTools } = require(path.join(SERVICES, 'votion-tools.js'));
const { createAuditLog } = require(path.join(SERVICES, 'audit.js'));
const { CODES } = require(path.join(SRC, 'shared', 'errors.js'));

const INTEGRATION_CATALOG = require(path.join(SERVICES, 'integration-catalog.json'));
const MCP_CATALOG = require(path.join(SERVICES, 'mcp-catalog.json'));

/** Elektron safeStorage vekili: gerçek iki yönlü şifreleme (AES-256-GCM). */
function fakeSafeStorage() {
  const key = crypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decryptString: (buf) => {
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const body = buf.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    }
  };
}

function tmpRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-e2e-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Geçici kökteki TÜM dosyaların içeriği (düz metin araması için). */
function readTree(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readTree(full));
    else out.push({ file: full, text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

/**
 * Gerçek disk zinciri: integrations.save → şifreli json, presets.apply → audit.
 */
function createApplyHarness(t) {
  const dir = tmpRoot(t);
  const statePath = path.join(dir, '.keyvotion', 'integrations.json');
  const mcpPath = path.join(dir, '.keyvotion', 'mcp.json');
  const logDir = path.join(dir, 'logs');

  const audit = createAuditLog({ logDir });
  const integrations = createIntegrationsService({
    catalogPath: path.join(SERVICES, 'integration-catalog.json'),
    statePath,
    safeStorage: fakeSafeStorage()
  });
  const mcpRegistry = createMcpRegistry({ configPath: mcpPath });
  const presets = createPresetsService({
    integrationCatalog: INTEGRATION_CATALOG,
    mcpCatalog: MCP_CATALOG,
    integrations,
    mcpRegistry
  });

  /** main.js PRESET_APPLY handler'ının audit davranışı (paket zarfı hariç). */
  async function applyPreset(payload) {
    try {
      const res = await presets.apply(payload);
      audit.append({
        op: 'kv:preset:apply',
        code: CODES.OK,
        target: typeof payload.presetId === 'string' ? payload.presetId : null
      });
      return res;
    } catch (err) {
      audit.append({
        op: 'kv:preset:apply',
        code: err && typeof err.code === 'string' ? err.code : 'E_INTERNAL',
        target: typeof payload.presetId === 'string' ? payload.presetId : null
      });
      throw err;
    }
  }

  return {
    dir, statePath, mcpPath, logDir, audit, integrations, mcpRegistry, presets,
    applyPreset,
    auditRows: () => audit.readTail(200),
    auditText: () => fs.readFileSync(audit.file, 'utf8'),
    readTree: () => readTree(dir),
    stateJson: () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
  };
}

/**
 * votion-tools: ağ yapmayan enjekte servislerle gerçek fabrika + gerçek audit.
 */
function createVotionHarness(t, accounts) {
  const dir = tmpRoot(t);
  const audit = createAuditLog({ logDir: path.join(dir, 'logs') });

  const calls = { invoke: [], call: [] };
  const integrations = {
    list: () => ({ accounts: (accounts || []).slice() }),
    invoke: (input) => {
      calls.invoke.push(input);
      return Promise.resolve({ ok: true, status: 200, data: { e2e: true } });
    }
  };
  const mcpRegistry = {
    list: () => ({ servers: [{ id: 'filesystem', name: 'Filesystem', state: 'ready' }] }),
    call: (id, tool, params) => {
      calls.call.push({ id, tool, params });
      return Promise.resolve({ id, tool, result: { e2e: true } });
    }
  };
  const presets = createPresetsService({
    integrationCatalog: INTEGRATION_CATALOG,
    mcpCatalog: MCP_CATALOG,
    integrations,
    mcpRegistry
  });

  const votion = createVotionTools({
    integrationCatalog: INTEGRATION_CATALOG,
    mcpCatalog: MCP_CATALOG,
    presets,
    integrations,
    mcpRegistry,
    /* main.js ile aynı üst veri kaydı; params ASLA yazılmaz. */
    audit: (entry) => audit.append({
      op: entry.op,
      code: entry.code,
      target: entry.capabilityId,
      extra: { capabilityId: entry.capabilityId, status: entry.status }
    })
  });

  /** main.js VOTION_INVOKE handler'ı: audit servis içinde yazılır. */
  async function invokeVotion(payload) {
    return votion.invoke(payload);
  }

  return {
    dir, audit, votion, calls, invokeVotion,
    auditRows: () => audit.readTail(200),
    auditText: () => fs.readFileSync(audit.file, 'utf8')
  };
}

module.exports = {
  INTEGRATION_CATALOG,
  MCP_CATALOG,
  createApplyHarness,
  createVotionHarness,
  fakeSafeStorage,
  readTree,
  SERVICES
};
