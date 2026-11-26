'use strict';

/* T-119 — MCP istemcisi + kayıt defteri (gerçek stdio fixture, dış ağ YOK). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMcpClient } = require('../../src/main/services/mcp-client');
const { createMcpRegistry } = require('../../src/main/services/mcp-registry');

const FIXTURE = path.join(__dirname, 'fixtures', 'fake-mcp-stdio.js');

function makeClient(extra = {}) {
  return createMcpClient({
    transport: 'stdio',
    command: process.execPath,
    args: [FIXTURE],
    cwd: process.cwd(),
    env: { ...process.env },
    ...extra
  });
}

async function withClient(extra, fn) {
  const client = makeClient(extra);
  await client.start();
  try {
    return await fn(client);
  } finally {
    await client.stop();
  }
}

function tempConfig(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-mcp-'));
  const configPath = path.join(dir, '.keyvotion', 'mcp.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return configPath;
}

test('initialize + listTools: iki araç listelenir', async () => {
  await withClient({}, async (client) => {
    assert.equal(client.state(), 'ready');
    assert.ok(client.pid() > 0);
    const tools = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ['echo', 'boom']);
    assert.equal(tools[0].inputSchema.type, 'object');
  });
});

test('callTool echo başarısı', async () => {
  await withClient({}, async (client) => {
    const res = await client.callTool('echo', { text: 'merhaba' });
    assert.notEqual(res.isError, true);
    assert.equal(res.content[0].type, 'text');
    assert.equal(res.content[0].text, 'merhaba');
  });
});

test('callTool isError yanıtı', async () => {
  await withClient({}, async (client) => {
    const res = await client.callTool('boom', {});
    assert.equal(res.isError, true);
    assert.equal(res.content[0].text, 'boom');
  });
});

test('callTool zaman aşımı → E_TIMEOUT', async () => {
  /* T-200 (kusur düzeltmesi): istemcinin `timeoutMs` değeri YALNIZ isteklere
     değil, `start()` içindeki `initialize` el sıkışmasına da uygulanır
     (mcp-client.js: `await request('initialize', ...)`). 300 ms seçildiğinde
     yüklü makinede node alt sürecinin doğuşu + el sıkışma 300 ms'yi aşınca
     test, `callTool`'u hiç sınamadan `start()` tan E_TIMEOUT alıp düşüyordu
     (k3'te ölçüldü: 306 ms). 1500 ms, el sıkışma gürültüsünün çok üstünde ve
     fikstürün 5000 ms'lik `sleep` yanıtının altında — iddia aynen korunur:
     yanıt gelmeden zaman aşımına düşülmeli. */
  const client = makeClient({ timeoutMs: 1500 });
  await client.start();
  try {
    await assert.rejects(
      () => client.callTool('sleep', {}),
      (err) => err && err.code === 'E_TIMEOUT'
    );
  } finally {
    await client.stop();
  }
});

test('stop() sonrası process.kill(pid, 0) throw', async () => {
  const client = makeClient();
  await client.start();
  const pid = client.pid();
  assert.ok(pid > 0);
  await client.stop();

  let dead = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      dead = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(client.state(), 'stopped');
  assert.equal(dead, true, `pid ${pid} hâlâ yaşıyor`);
});

test('stop() bekleyen çağrıları reddeder (asılı promise yok)', async () => {
  const client = makeClient({ timeoutMs: 10000 });
  await client.start();
  /* Reddetme stop() içinde anında gelir: handler hemen takılmalı. */
  const settled = client.callTool('sleep', {}).then(
    () => null,
    (err) => err
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await client.stop();
  const err = await settled;
  assert.ok(err && typeof err.code === 'string', 'bekleyen çağrı reddedilmedi');
});

test('registry: bozuk dosya → boş, add/remove atomik', async (t) => {
  const configPath = tempConfig(t);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, '{ bu json bozuk', 'utf8');

  const events = [];
  const registry = createMcpRegistry({
    configPath,
    onEvent: (packet) => events.push(packet)
  });
  assert.deepEqual(registry.list().servers, []);

  const added = registry.add({
    id: 'srv-1',
    name: 'Test Sunucusu',
    transport: 'stdio',
    command: process.execPath,
    args: [FIXTURE],
    envRecord: { PATH: process.env.PATH || '' }
  });
  assert.deepEqual(added, { id: 'srv-1', state: 'stopped' });

  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = JSON.parse(raw);
  assert.equal(cfg.version, 1);
  assert.equal(cfg.servers.length, 1);
  assert.deepEqual(cfg.servers[0].envKeys, ['PATH']);
  assert.equal(Object.prototype.hasOwnProperty.call(cfg.servers[0], 'envRecord'), false);
  assert.equal(fs.existsSync(`${configPath}.tmp`), false);
  assert.ok(events.some((e) => e.type === 'state' && e.id === 'srv-1'));

  assert.deepEqual(await registry.remove('srv-1'), { id: 'srv-1', removed: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')).servers, []);
  await registry.shutdown();
});

test('registry: şema dışı add alanı → E_BAD_REQUEST', (t) => {
  const registry = createMcpRegistry({ configPath: tempConfig(t) });
  assert.throws(
    () => registry.add({
      id: 'srv-2',
      name: 'Şema dışı',
      transport: 'stdio',
      command: process.execPath,
      surprise: true
    }),
    (err) => err && err.code === 'E_BAD_REQUEST'
  );
});

test('registry: http url https zorunlu (127.0.0.1 istisnası)', (t) => {
  const configPath = tempConfig(t);
  const strict = createMcpRegistry({ configPath });
  assert.throws(
    () => strict.add({ id: 'web-1', name: 'Uzak', transport: 'http', url: 'http://example.com/mcp' }),
    (err) => err && err.code === 'E_FORBIDDEN'
  );

  const loose = createMcpRegistry({ configPath, allowInsecureLoopback: true });
  const added = loose.add({
    id: 'web-2', name: 'Yerel', transport: 'http', url: 'http://127.0.0.1:1234/mcp'
  });
  assert.equal(added.state, 'stopped');
});

test('T-200 kilidi: zaman aşımı testi el sıkışma gürültüsünün üstünde kalır', () => {
  /* Neden: istemcinin timeoutMs değeri start() içindeki initialize el
     sıkışmasına da uygulanır. Eşik, node alt sürecinin doğuşu + el sıkışma
     süresinin üstünde olmalı; fikstürün sleep yanıtı da eşiğin belirgin
     biçimde altında kalmamalı (yoksa iddia zayıflar). Ölçülen arıza: yüklü
     makinede 306 ms, 300 ms eşiğini aştı. */
  const self = fs.readFileSync(__filename, 'utf8');
  const m = self.match(/makeClient\(\{ timeoutMs: (\d+) \}\)/);
  assert.ok(m, 'zaman aşımı testi makeClient({ timeoutMs: N }) biçimini kaybetmiş');
  const threshold = Number(m[1]);
  assert.ok(threshold >= 1000,
    `zaman aşımı eşiği el sıkışma gürültüsünün altında: ${threshold} ms (>=1000 olmalı)`);

  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'fake-mcp-stdio.js'), 'utf8');
  const sleepDelay = Number((fixture.match(/setTimeout\(resolve, (\d+)\)/) || [])[1] || 0);
  assert.ok(sleepDelay >= threshold * 2,
    `fikstür sleep süresi eşiğin iki katından küçük: ${sleepDelay} ms vs eşik ${threshold} ms`);
});
