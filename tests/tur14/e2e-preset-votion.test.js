'use strict';

/*
 * T-151 (daraltılmış kapsam) — preset apply + Votion invoke, GERÇEK main servisleri.
 *
 * Gerçek dosyalar:
 *   mcp-registry.js + mcp-client.js   → stdio JSON-RPC (gerçek süreç, gerçek hat)
 *   integrations.js + presets.js      → kayıt/şifreleme/invoke (gerçek katalog)
 *   votion-tools.js + votion-actions.js + audit.js
 *
 * Ortam sınırları (kaçınılmaz, ürün kodu DEĞİL):
 *   - safeStorage: OS anahtar kasası yalnız Electron'da var; testte aynı sözleşmeyi
 *     (isEncryptionAvailable/encryptString/decryptString) AES-256-GCM ile karşılayan
 *     vekil kullanılır. Şifreleme yolu gerçektir, anahtar rastgele ve bellekte.
 *   - fetchImpl: dış HTTP yasak; enjekte edilen fetch isteği kaydeder ve sabit yanıt
 *     döner. URL/başlık/gövde kurulumu gerçek integrations.js kodundan geçer.
 *   - stdio MCP: katalogdaki `npx` komutu ağ gerektirir; apply'ın yazdığı config
 *     korunur, yalnız komut geçici bir yerel JSON-RPC sunucusuna çevrilir.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
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
const { createVotionActions } = require(path.join(SERVICES, 'votion-actions.js'));
const { createAuditLog } = require(path.join(SERVICES, 'audit.js'));
const { createConfirmStore } = require(path.join(SERVICES, 'confirm.js'));
const { CODES } = require(path.join(SRC, 'shared', 'errors.js'));

const INTEGRATION_CATALOG = require(path.join(SERVICES, 'integration-catalog.json'));
const MCP_CATALOG = require(path.join(SERVICES, 'mcp-catalog.json'));

const KEY_GITLAB = 'E2E_GITLAB_APIKEY_123';
const KEY_OPENAI = 'E2E_OPENAI_APIKEY_456';

/* ------------------------------------------------------------------ ortam */

function tmpRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-e2e-t151-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fakeSafeStorage() {
  const key = crypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decryptString(buf) {
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const body = buf.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    }
  };
}

function readTree(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readTree(full));
    else out.push({ file: full, text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

/** Gerçek integrations + presets + mcp-registry + audit, geçici kökte. */
function harness(t) {
  const dir = tmpRoot(t);
  const statePath = path.join(dir, '.keyvotion', 'integrations.json');
  const mcpPath = path.join(dir, '.keyvotion', 'mcp.json');
  const logDir = path.join(dir, 'logs');

  const audit = createAuditLog({ logDir });
  const requests = [];
  const fetchImpl = (url, init) => {
    requests.push({ url: String(url), init });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify({ e2e: true }))
    });
  };

  const integrations = createIntegrationsService({
    catalogPath: path.join(SERVICES, 'integration-catalog.json'),
    statePath,
    safeStorage: fakeSafeStorage(),
    fetchImpl
  });
  const mcpRegistry = createMcpRegistry({ configPath: mcpPath });
  const presets = createPresetsService({
    integrationCatalog: INTEGRATION_CATALOG,
    mcpCatalog: MCP_CATALOG,
    integrations,
    mcpRegistry
  });

  /* main.js PRESET_APPLY denetim davranışı (paket zarfı hariç). */
  function applyPreset(payload) {
    return Promise.resolve()
      .then(() => presets.apply(payload))
      .then((res) => {
        audit.append({ op: 'kv:preset:apply', code: CODES.OK, target: String(payload.presetId) });
        return res;
      }, (err) => {
        audit.append({
          op: 'kv:preset:apply',
          code: (err && err.code) || 'E_INTERNAL',
          target: String(payload.presetId)
        });
        throw err;
      });
  }

  return {
    dir, statePath, mcpPath, logDir, audit, integrations, mcpRegistry, presets,
    requests, applyPreset,
    auditRows: () => audit.readTail(500),
    auditText: () => { try { return fs.readFileSync(audit.file, 'utf8'); } catch { return ''; } },
    treeText: () => readTree(dir).map((f) => f.text).join('\n')
  };
}

/* ---------------------------------------------- A1: stdio MCP preseti */

const ECHO_SERVER = `'use strict';
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
const TOOLS = [{ name: 'echo', description: 'Yankı', inputSchema: { type: 'object' } }];
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const send = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\\n');
  if (msg.method === 'initialize') {
    return send({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'e2e-echo', version: '1.0.0' } });
  }
  if (msg.method === 'tools/list') return send({ tools: TOOLS });
  if (msg.method === 'tools/call') {
    return send({ content: [{ type: 'text', text: JSON.stringify(msg.params.arguments || {}) }], isError: false });
  }
  if (msg.method === 'notifications/initialized') return undefined;
  if (msg.id !== undefined) return send({});
  return undefined;
});
`;

test('e2e/A1a: stdio MCP preseti apply → diskte gerçek config, sır yok', async (t) => {
  const h = harness(t);

  const res = await h.applyPreset({ presetId: 'mcp-filesystem' });
  assert.equal(res.ok, true);
  assert.equal(res.next, 'installed');
  assert.equal(res.kind, 'mcp');
  assert.equal(res.serverId, 'filesystem');

  const cfg = JSON.parse(fs.readFileSync(h.mcpPath, 'utf8'));
  assert.equal(cfg.version, 1);
  assert.equal(cfg.servers.length, 1);
  const server = cfg.servers[0];
  assert.equal(server.id, 'filesystem');
  assert.equal(server.transport, 'stdio');
  assert.equal(server.command, 'npx');
  assert.deepEqual(server.args, ['-y', '@modelcontextprotocol/server-filesystem', '.']);
  assert.deepEqual(server.envKeys, [], 'MCP config sır listesi taşımamalı');
  assert.equal(/token|cipher|password|secret/i.test(JSON.stringify(server)), false, 'MCP kaydında sır alanı var');

  const rows = h.auditRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].op, 'kv:preset:apply');
  assert.equal(rows[0].target, 'mcp-filesystem');
  assert.equal(rows[0].code, CODES.OK);
  assert.equal(h.auditText().includes(KEY_GITLAB), false);
});

test('e2e/A1b: gerçek mcp-client stdio JSON-RPC — connect + tools/list + tools/call', async (t) => {
  const h = harness(t);
  await h.applyPreset({ presetId: 'mcp-filesystem' });

  /* Yalnız komut yerelleştirilir: apply'ın yazdığı kayıt korunur, ağ yok. */
  const fixture = path.join(h.dir, 'echo-server.js');
  fs.writeFileSync(fixture, ECHO_SERVER, 'utf8');
  const cfg = JSON.parse(fs.readFileSync(h.mcpPath, 'utf8'));
  cfg.servers[0].command = process.execPath;
  cfg.servers[0].args = [fixture];
  fs.writeFileSync(h.mcpPath, JSON.stringify(cfg, null, 2), 'utf8');

  t.after(() => h.mcpRegistry.shutdown());

  const connected = await h.mcpRegistry.connect('filesystem');
  assert.equal(connected.state, 'ready');
  assert.equal(connected.tools.length, 1);
  assert.equal(connected.tools[0].name, 'echo');

  const called = await h.mcpRegistry.call('filesystem', 'echo', { text: 'merhaba', n: 7 });
  assert.equal(called.id, 'filesystem');
  assert.equal(called.tool, 'echo');
  assert.equal(called.result.isError, false);
  const payload = JSON.parse(called.result.content[0].text);
  assert.deepEqual(payload, { text: 'merhaba', n: 7 });

  const listed = h.mcpRegistry.list();
  assert.equal(listed.servers[0].state, 'ready');
  assert.equal(listed.servers[0].toolCount, 1);

  await h.mcpRegistry.disconnect('filesystem');
  assert.equal(h.mcpRegistry.list().servers[0].state, 'stopped');
});

/* ------------------------------------ A2: entegrasyon preseti (özel başlık) */

test('e2e/A2a: entegrasyon preseti apply → next=saved, diskte şifreli, yanıtta sır yok', async (t) => {
  const h = harness(t);

  const res = await h.applyPreset({ presetId: 'int-gitlab', values: { token: KEY_GITLAB } });
  assert.equal(res.ok, true);
  assert.equal(res.next, 'saved');
  assert.equal(res.kind, 'integration');
  assert.match(String(res.accountId), /^gitlab-[0-9a-f]{8}$/);
  assert.equal(JSON.stringify(res).includes(KEY_GITLAB), false, 'apply yanıtı API anahtarını taşıyor');

  const state = JSON.parse(fs.readFileSync(h.statePath, 'utf8'));
  assert.equal(state.version, 1);
  assert.equal(state.accounts.length, 1);
  const acc = state.accounts[0];
  assert.equal(acc.providerId, 'gitlab');
  assert.equal(acc.id, res.accountId);
  assert.equal(typeof acc.tokenCipher, 'string');
  assert.equal(acc.tokenCipher.length > 20, true);
  assert.equal(acc.state, 'unknown');
  assert.equal(acc.lastTestAt, null);
  assert.equal(/E2E_GITLAB_APIKEY_123/.test(JSON.stringify(acc)), false, 'tokenCipher düz metin anahtar içeriyor');
  assert.equal(/E2E_GITLAB_APIKEY_123/.test(h.treeText()), false, 'diskte düz metin anahtar var');

  const accounts = h.integrations.list().accounts;
  assert.deepEqual(accounts.map((a) => a.providerId), ['gitlab']);
  assert.equal('tokenCipher' in accounts[0], false, 'list() cipher sızdırıyor');
  assert.equal(JSON.stringify(accounts).includes(KEY_GITLAB), false);
});

test('e2e/A2b: gerçek integrations.invoke — katalog URL/başlık/gövde, dönüş zarfı', async (t) => {
  const h = harness(t);
  const applied = await h.applyPreset({ presetId: 'int-gitlab', values: { token: KEY_GITLAB } });

  const result = await h.integrations.invoke({
    id: applied.accountId,
    capability: 'listProjects',
    params: { limit: 3 }
  });

  assert.equal(h.requests.length, 1);
  const sent = h.requests[0];
  assert.equal(sent.url, 'https://gitlab.com/api/v4/projects?per_page=3');
  assert.equal(sent.init.method, 'GET');
  assert.equal(sent.init.headers.accept, 'application/json');
  assert.equal(sent.init.headers['PRIVATE-TOKEN'], KEY_GITLAB);
  assert.equal(sent.init.body, undefined);

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { e2e: true });
  assert.equal(JSON.stringify(result).includes(KEY_GITLAB), false, 'invoke yanıtı anahtarı taşıyor');

  const badCap = await h.integrations.invoke({ id: applied.accountId, capability: 'yok', params: {} })
    .then(() => null, (err) => err);
  assert.equal(badCap && badCap.code, 'E_BAD_REQUEST');
  assert.equal(JSON.stringify(badCap).includes(KEY_GITLAB), false);

  const badParam = await h.integrations.invoke({
    id: applied.accountId, capability: 'listProjects', params: { token: KEY_GITLAB }
  }).then(() => null, (err) => err);
  assert.equal(badParam && badParam.code, 'E_BAD_REQUEST');
});

/* ------------------------------ A3: yalnız API anahtarı (OAuth'suz) */

test('e2e/A3: OAuth gerektirmeyen API anahtarı preseti — Bearer başlığı', async (t) => {
  const h = harness(t);

  const applied = await h.applyPreset({ presetId: 'int-openai', values: { token: KEY_OPENAI } });
  assert.equal(applied.next, 'saved');
  assert.equal(JSON.stringify(applied).includes(KEY_OPENAI), false);
  assert.equal(/E2E_OPENAI_APIKEY_456/.test(h.treeText()), false, 'diskte düz metin API anahtarı var');

  const result = await h.integrations.invoke({ id: applied.accountId, capability: 'listModels' });
  assert.equal(result.ok, true);
  assert.equal(h.requests[0].url, 'https://api.openai.com/v1/models');
  assert.equal(h.requests[0].init.headers.Authorization, `Bearer ${KEY_OPENAI}`);
  assert.equal(JSON.stringify(result).includes(KEY_OPENAI), false);

  /* OAuth yolu çağrılmadı: oauth servisi hiç enjekte edilmedi, akış 'saved' döndü. */
  assert.equal(applied.next === 'oauth', false);
});

/* ------------------------------------------- B: Votion invoke yolu */

test('e2e/B1: votion-actions izinli eylem kümesi + confirmToken kapısı', async (t) => {
  const dir = tmpRoot(t);
  const project = path.join(dir, 'proje');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'not.txt'), 'silinecek', 'utf8');

  const actions = createVotionActions({
    baseDir: dir,
    getProjectDir: () => project,
    shellApi: { trashItem: async () => {} }
  });

  /* Beyaz liste sözleşmeden okunur (uydurma yok). */
  const denied = await actions.run({ action: 'rm -rf /' });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_BAD_REQUEST');
  const allowed = denied.error.detail.allowed;
  assert.deepEqual(allowed.slice().sort(), [
    'browser', 'command', 'grant', 'grants', 'list', 'listFiles', 'log',
    'move', 'openApp', 'revokeGrant', 'screenshot', 'trash', 'writeFile'
  ]);
  for (const action of actions.CONFIRM_ACTIONS) {
    assert.ok(allowed.includes(action), `onay isteyen eylem beyaz listede değil: ${action}`);
  }
  /* T-198: yetenek onayı (grant) da onay ister; komut/yazma yetki defterinden geçer. */
  assert.deepEqual(actions.CONFIRM_ACTIONS.slice().sort(), ['browser', 'grant', 'move', 'trash']);

  /* İzinli tek araç: list → ok zarfı, dış kabuk yok. */
  const listed = await actions.run({ action: 'list', limit: 5 });
  assert.equal(listed.ok, true);
  assert.ok(Array.isArray(listed.data.apps) && listed.data.apps.length > 0);
  assert.deepEqual(listed.data.roots.map((r) => r.id), ['project']);

  /* main.js VOTION_ACT policy: onay yalnız CONFIRM_ACTIONS için zorunlu. */
  const mainSrc = fs.readFileSync(path.join(SRC, 'main', 'main.js'), 'utf8');
  assert.match(mainSrc, /CONFIRM_ACTIONS\.includes\(wanted\)[\s\S]{0,160}confirm\.verify\(payload\.confirmToken, CHANNELS\.VOTION_ACT\)/,
    'VOTION_ACT handler onay kapısını uygulamıyor');

  const confirm = createConfirmStore();
  /* Yıkıcı eylem anahtarsız geçmez. */
  const gate = confirm.verify(undefined, 'kv:votion:act');
  assert.equal(gate.ok, false);
  assert.equal(gate.error.code, 'E_CONFIRM_REQUIRED');

  /* Yıkıcı eylem anahtarsız çalışmamalı: kapı reddederse run() çağrılmaz. */
  const trashTarget = path.join(project, 'not.txt');
  const before = fs.readFileSync(trashTarget, 'utf8');
  if (actions.CONFIRM_ACTIONS.includes('trash')) {
    const deniedTrash = confirm.verify(undefined, 'kv:votion:act');
    assert.equal(deniedTrash.ok, false);
    assert.equal(fs.readFileSync(trashTarget, 'utf8'), before, 'onaysız eylem dosyaya dokundu');
  }
  /* Geçerli anahtar bir kez geçer. */
  const token = 'B'.repeat(24);
  assert.equal(confirm.verify(token, 'kv:votion:act'), null);
  assert.equal(confirm.verify(token, 'kv:votion:act').error.code, 'E_CONFIRM_REQUIRED');
});

test('e2e/B2: votion-tools invoke — manifestteki yetenek, zarf ve audit params sızdırmaz', async (t) => {
  const h = harness(t);
  const applied = await h.applyPreset({ presetId: 'int-gitlab', values: { token: KEY_GITLAB } });

  const votion = createVotionTools({
    integrationCatalog: INTEGRATION_CATALOG,
    mcpCatalog: MCP_CATALOG,
    presets: h.presets,
    integrations: h.integrations,
    mcpRegistry: h.mcpRegistry,
    /* main.js ile aynı üst veri kaydı. */
    audit: (entry) => h.audit.append({
      op: entry.op,
      code: entry.code,
      target: entry.capabilityId,
      extra: { capabilityId: entry.capabilityId, status: entry.status }
    })
  });

  /* Araç manifest'ten seçilir (sabit capabilityId gömülmez). */
  const manifest = votion.manifest();
  const ready = manifest.integrations.find((i) => i.ready === true && i.capabilities.length > 0);
  assert.ok(ready, 'kayıtlı hesap manifestte ready görünmüyor');
  assert.equal(ready.id, 'gitlab');
  const capId = ready.capabilities[0].id;
  const capabilityId = `integration:${ready.id}:${capId}`;

  /* Yetenek şeması yalnız `limit` kabul eder; değer URL'de görünür, audit'te görünmemeli. */
  const result = await votion.invoke({ capabilityId, params: { limit: 37 } });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(h.requests[0].url, 'https://gitlab.com/api/v4/projects?per_page=37');
  assert.equal(h.requests[0].init.headers['PRIVATE-TOKEN'], KEY_GITLAB);

  /* Audit: yalnız üst veri; params/değer/anahtar yok. */
  const rows = h.auditRows();
  const invokeRows = rows.filter((r) => r.op === 'votion:invoke');
  assert.equal(invokeRows.length, 1);
  const row = invokeRows[0];
  const allowedKeys = new Set(['at', 'op', 'code', 'target', 'status', 'idempotencyKey', 'capabilityId']);
  for (const key of Object.keys(row)) {
    assert.ok(allowedKeys.has(key), `audit kaydında beklenmeyen alan: ${key}`);
  }
  assert.equal(row.capabilityId, capabilityId);
  assert.equal(row.target, capabilityId);
  assert.equal(row.status, 'ok');
  assert.equal(row.code, CODES.OK);
  const auditText = h.auditText();
  for (const needle of ['per_page=37', KEY_GITLAB, '"params"', '"limit"']) {
    assert.equal(auditText.includes(needle), false, `audit kaydı sızdırıyor: ${needle}`);
  }

  /* Bilinmeyen yetenek: E_PRESET_UNKNOWN + error audit, params yine yok. */
  const unknown = await votion.invoke({ capabilityId: 'integration:gitlab:yok', params: { x: 'GIZLI2' } })
    .then(() => null, (err) => err);
  assert.ok(unknown);
  assert.equal(unknown.code, 'E_PRESET_UNKNOWN');
  const errRows = h.auditRows().filter((r) => r.op === 'votion:invoke' && r.status === 'error');
  assert.equal(errRows.length, 1);
  assert.equal(errRows[0].code, 'E_PRESET_UNKNOWN');
  assert.equal(h.auditText().includes('GIZLI2'), false);

  /* Rol sınırı: yönetsel sağlayıcı öğretmene kapalı. */
  const adminOnly = 'stripe';
  assert.equal(INTEGRATION_CATALOG.some((p) => p.id === adminOnly), true);
  const forbidden = await votion.invoke({
    capabilityId: `integration:${adminOnly}:listCharges`, role: 'teacher', params: { limit: 1 }
  }).then(() => null, (err) => err);
  assert.equal(forbidden && forbidden.code, 'E_FORBIDDEN');
  assert.equal(h.auditText().includes('listCharges') && h.auditText().includes('"params"'), false);
});
