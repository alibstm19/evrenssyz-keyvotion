'use strict';

/* T-146 — Votion araç erişimi gerçek testleri (ağ YOK). */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SRC } = require('../lib');
const { createVotionTools, MAX_BYTES, ADMIN_ONLY_PROVIDERS } =
  require(path.join(SRC, 'main', 'services', 'votion-tools.js'));

const INTEGRATIONS = require(path.join(SRC, 'main', 'services', 'integration-catalog.json'));
const MCP = require(path.join(SRC, 'main', 'services', 'mcp-catalog.json'));
const PRESETS = require(path.join(SRC, 'main', 'services', 'connection-presets.json'));

function fixture() {
  const auditEntries = [];
  const calls = { invoke: [], call: [] };
  const integrations = {
    list: () => ({ accounts: [{ id: 'acct-1', providerId: 'github' }, { id: 'acct-2', providerId: 'stripe' }] }),
    invoke: async (input) => {
      calls.invoke.push(input);
      return { ok: true, status: 200, data: {} };
    }
  };
  const mcpRegistry = {
    list: () => ({ servers: [{ id: 'filesystem' }] }),
    call: async (id, tool, args) => {
      calls.call.push({ id, tool, args });
      return { id, tool, result: {} };
    }
  };
  const svc = createVotionTools({
    integrationCatalog: INTEGRATIONS,
    mcpCatalog: MCP,
    presets: PRESETS,
    integrations,
    mcpRegistry,
    audit: (entry) => auditEntries.push(entry)
  });
  return { svc, auditEntries, calls };
}

test('tur14/votion-tools 1: manifest sınırı + sayılar (64/195/60)', () => {
  const { svc } = fixture();
  const manifest = svc.manifest();
  const bytes = Buffer.byteLength(JSON.stringify(manifest), 'utf8');
  assert.ok(bytes <= MAX_BYTES, `manifest ${bytes} B > ${MAX_BYTES}`);
  assert.equal(manifest.integrations.length, 64);
  const totalCaps = manifest.integrations.reduce((n, item) => n + item.capabilities.length, 0);
  assert.equal(totalCaps, 195);
  assert.equal(manifest.mcp.length, 60);
  assert.equal(manifest.limits.maxBytes, 24000);
  assert.equal(manifest.presets.total, 124);
  /* Tam katalog sığmadığında özet kısaltma uygulanır ve bayrak kalkar. */
  assert.equal(manifest.limits.truncated, true);
  assert.ok(!JSON.stringify(manifest).includes('TEST_SECRET_VALUE'));
});

test('tur14/votion-tools 2: manifest kırpma sonrası alan şeması korunur', () => {
  const { svc } = fixture();
  const manifest = svc.manifest();
  for (const item of manifest.integrations) {
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.authMode, 'string');
    assert.equal(typeof item.ready, 'boolean');
    for (const cap of item.capabilities) {
      assert.equal(typeof cap.id, 'string');
      assert.ok('summary' in cap && 'verb' in cap && 'params' in cap);
    }
  }
  for (const item of manifest.mcp) {
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.installed, 'boolean');
    assert.ok('toolsHint' in item);
  }
});

test('tur14/votion-tools 3: contextBlock Türkçe, sınırlı ve sırsız', () => {
  const { svc } = fixture();
  const block = svc.contextBlock();
  assert.ok(Buffer.byteLength(block, 'utf8') <= MAX_BYTES);
  assert.match(block, /Şu bağlantıların var, şu yetenekleri çağırabilirsin/);
  assert.match(block, /integration:github:listRepos/);
  assert.match(block, /mcp:filesystem/);
  for (const needle of ['access_token', 'refresh_token', 'Bearer ', 'TEST_SECRET_VALUE']) {
    assert.ok(!block.includes(needle), `bağlam bloğunda sır: ${needle}`);
  }
});

test('tur14/votion-tools 4: bilinmeyen capabilityId hata + auditsüz parametre', async () => {
  const { svc, auditEntries } = fixture();
  await assert.rejects(
    () => svc.invoke({ capabilityId: 'integration:yok:cap', params: { token: 'TEST_SECRET_VALUE' } }),
    (err) => err.code === 'E_PRESET_UNKNOWN'
  );
  assert.equal(auditEntries.length, 1);
  const entry = auditEntries[0];
  assert.equal(entry.op, 'votion:invoke');
  assert.equal(entry.capabilityId, 'integration:yok:cap');
  assert.equal(entry.status, 'error');
  assert.ok(!('params' in entry));
  assert.ok(!JSON.stringify(entry).includes('TEST_SECRET_VALUE'));
});

test('tur14/votion-tools 5: entegrasyon çağrısı mevcut yola yönlenir', async () => {
  const { svc, calls, auditEntries } = fixture();
  const res = await svc.invoke({
    capabilityId: 'integration:github:listRepos',
    params: { token: 'TEST_SECRET_VALUE', limit: 5 }
  });
  assert.equal(res.ok, true);
  assert.equal(calls.invoke.length, 1);
  assert.equal(calls.invoke[0].id, 'acct-1');
  assert.equal(calls.invoke[0].capability, 'listRepos');
  assert.equal(calls.invoke[0].params.limit, 5);
  assert.ok(!JSON.stringify(auditEntries).includes('TEST_SECRET_VALUE'));
  assert.equal(auditEntries[0].status, 'ok');
});

test('tur14/votion-tools 6: MCP çağrısı mevcut kayıt defterine yönlenir', async () => {
  const { svc, calls } = fixture();
  const res = await svc.invoke({ capabilityId: 'mcp:filesystem:read_file', params: { path: '.' } });
  assert.equal(res.tool, 'read_file');
  assert.equal(calls.call[0].id, 'filesystem');
  assert.equal(calls.call[0].tool, 'read_file');
  assert.equal(calls.call[0].args.path, '.');
});

test('tur14/votion-tools 7: yönetsel bağlantı öğretmen/öğrenciye kapalı', async () => {
  const { svc, calls } = fixture();
  assert.ok(ADMIN_ONLY_PROVIDERS.includes('stripe'));
  for (const role of ['teacher', 'student']) {
    await assert.rejects(
      () => svc.invoke({ capabilityId: 'integration:stripe:listCharges', role }),
      (err) => err.code === 'E_FORBIDDEN'
    );
  }
  assert.equal(calls.invoke.length, 0);
});
