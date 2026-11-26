'use strict';

/* T-146 — hazır bağlantı şablonları çekirdeği gerçek testleri (ağ YOK). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SRC } = require('../lib');
const { createPresetsService } = require(path.join(SRC, 'main', 'services', 'presets.js'));

const INTEGRATIONS = require(path.join(SRC, 'main', 'services', 'integration-catalog.json'));
const MCP = require(path.join(SRC, 'main', 'services', 'mcp-catalog.json'));

function fixture(t) {
  const calls = { begin: [], save: [], add: [] };
  const oauth = {
    begin: (input) => {
      calls.begin.push(input);
      return Promise.resolve({ flowId: 'flow-1', authUrl: 'FLOW_URL', redirectUri: 'CALLBACK_URL' });
    }
  };
  const integrations = {
    save: (input) => {
      calls.save.push(input);
      return { id: 'acct-generated', state: 'unknown' };
    }
  };
  const mcpRegistry = {
    add: (input) => {
      calls.add.push(input);
      return { id: input.id, state: 'stopped' };
    }
  };
  const svc = createPresetsService({
    integrationCatalog: INTEGRATIONS,
    mcpCatalog: MCP,
    oauth,
    integrations,
    mcpRegistry
  });
  return { svc, calls };
}

const codeOf = (err) => err && err.code;

test('tur14/presets 1: list() 124 kayıt, alan görünümünde DEĞER yok', () => {
  const { svc } = fixture({ after: () => {} });
  const list = svc.list();
  assert.equal(list.length, 124);
  assert.equal(new Set(list.map((p) => p.id)).size, 124);
  const allowed = new Set(['key', 'label', 'placeholder', 'hint', 'secret', 'required', 'howToGet', 'url']);
  for (const preset of list) {
    assert.ok(!('values' in preset), `${preset.id}: values alanı sızıyor`);
    for (const field of preset.fields) {
      for (const key of Object.keys(field)) {
        assert.ok(allowed.has(key), `${preset.id}.${field.key}: izinsiz alan ${key}`);
      }
    }
  }
  const raw = JSON.stringify(list);
  assert.ok(!raw.includes('"value"'), 'alan görünümünde value anahtarı var');
  assert.ok(!raw.includes('ghp_1'), 'gerçek anahtar değeri sızıyor');
});

test('tur14/presets 2: bilinmeyen preset E_PRESET_UNKNOWN', () => {
  const { svc } = fixture({ after: () => {} });
  assert.throws(() => svc.apply({ presetId: 'int-yok' }), (err) => codeOf(err) === 'E_PRESET_UNKNOWN');
  assert.throws(() => svc.resolve('mcp-yok'), (err) => codeOf(err) === 'E_PRESET_UNKNOWN');
});

test('tur14/presets 3: zorunlu alan eksikse yalnız anahtar listesi döner', () => {
  const { svc } = fixture({ after: () => {} });
  let caught = null;
  try { svc.apply({ presetId: 'int-openai', values: {} }); } catch (err) { caught = err; }
  assert.equal(codeOf(caught), 'E_PRESET_MISSING_FIELDS');
  assert.deepStrictEqual(caught.detail.fields, ['token']);
  assert.ok(!JSON.stringify(caught).includes('TEST_SECRET_VALUE'));
});

test('tur14/presets 4: kind uyuşmazlığı E_PRESET_KIND_MISMATCH', () => {
  const { svc } = fixture({ onEvent: null, after: () => {} });
  assert.throws(
    () => svc.apply({ presetId: 'int-openai', kind: 'mcp', values: { token: 'x' } }),
    (err) => codeOf(err) === 'E_PRESET_KIND_MISMATCH'
  );
});

test('tur14/presets 5: oauth2 şablonu onay akışına yönlenir, sır dönmez', async () => {
  const { svc, calls } = fixture({ after: () => {} });
  const res = await svc.apply({ presetId: 'int-github' });
  assert.equal(res.ok, true);
  assert.equal(res.next, 'oauth');
  assert.equal(res.kind, 'integration');
  assert.equal(calls.begin[0].providerId, 'github');
  assert.ok(calls.begin[0].accountId);
  assert.equal(res.flowId, 'flow-1');
  assert.ok(!JSON.stringify(res).includes('access_token'));
});

test('tur14/presets 6: token şablonu mevcut entegrasyon servisine yönlenir', async () => {
  const { svc, calls } = fixture({ after: () => {} });
  const res = await svc.apply({ presetId: 'int-openai', values: { token: 'TEST_SECRET_VALUE' } });
  assert.equal(res.next, 'saved');
  assert.equal(res.accountId, 'acct-generated');
  assert.equal(calls.save[0].providerId, 'openai');
  assert.equal(calls.save[0].token, 'TEST_SECRET_VALUE');
  assert.ok(!JSON.stringify(res).includes('TEST_SECRET_VALUE'));
});

test('tur14/presets 7: MCP şablonu kayıt defterine yönlenir', async () => {
  const { svc, calls } = fixture({ after: () => {} });
  const res = await svc.apply({ presetId: 'mcp-filesystem' });
  assert.equal(res.next, 'installed');
  assert.equal(res.serverId, 'filesystem');
  assert.equal(calls.add[0].id, 'filesystem');
  assert.equal(calls.add[0].transport, 'stdio');
  assert.ok(!('token' in calls.add[0]));
});

test('tur14/presets 8: resolve() şablon + katalog kaydı döner', () => {
  const { svc } = fixture({ after: () => {} });
  const { preset, ref } = svc.resolve('int-github');
  assert.equal(preset.id, 'int-github');
  assert.equal(ref.id, 'github');
  assert.ok(Array.isArray(ref.capabilities));
});

test('tur14/presets 9: kaynakta ağ/sır düz metni yok (API-01)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-t146-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of ['presets.js', 'votion-tools.js']) {
    const src = fs.readFileSync(path.join(SRC, 'main', 'services', file), 'utf8');
    for (const needle of ['access_token', 'refresh_token', 'Bearer ', 'fetch(', 'http', 'https', 'require(\'http\'', 'require("http"']) {
      assert.ok(!src.includes(needle), `${file}: yasaklı düz metin ${needle}`);
    }
  }
});
