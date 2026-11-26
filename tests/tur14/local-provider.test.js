'use strict';

/*
 * T-161 — anahtarsız yerel sağlayıcı (Ollama gibi).
 *
 * NE ÖLÇÜLÜR (gerçek kod, gerçek disk, gerçek HTTP):
 *   1) isLoopbackBaseURL yalnız gerçek yerel adresleri kabul eder; dışarı
 *      adresler (10.x, 192.168.x, benzeri alan adları) reddedilir.
 *   2) Anahtarsız loopback sağlayıcıya istek çıkar: kimlik `local`, maske
 *      `yerel`, Authorization boş, sonuç başarılı.
 *   3) Anahtarsız UZAK sağlayıcıya hiç istek çıkmaz: E_SECRET_MISSING.
 *   4) Renderer sözleşmesi: hazır sağlayıcı listesi + yerel algılama.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { SRC, RENDERER, read } = require('../lib');

const { createHttpClient } = require(path.join(SRC, 'main', 'services', 'http-client.js'));
const providersModule = require(path.join(SRC, 'main', 'services', 'providers.js'));
const { createProvidersService, isLoopbackBaseURL } = providersModule;

const appJs = read(path.join(RENDERER, 'app.js'));

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
}

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (buf) => String(buf).replace(/^enc:/, '')
};

const audit = { rows: [], append(row) { this.rows.push(row); } };

/** Sahte OpenAI uyumlu uç; gelen istekleri kaydeder. */
function startFakeServer() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ path: req.url, auth: String(req.headers.authorization || '') });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'llama3' }] }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        seen,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

function makeProviders(baseDir) {
  const httpClient = createHttpClient({
    getConfig: () => ({ serverURL: 'http://127.0.0.1:1', projectDir: baseDir }),
    getPassword: () => null
  });
  return createProvidersService({ baseDir, safeStorage: fakeSafeStorage, http: httpClient, audit });
}

/* ------------------------------------------------------------ loopback */

test('local-provider 1: isLoopbackBaseURL sınırları', () => {
  const yes = [
    'http://127.0.0.1:11434/v1',
    'http://127.1.2.3/v1',
    'https://localhost:8080/v1',
    'http://LOCALHOST/v1',
    'http://[::1]:11434/v1',
    'http://[0:0:0:0:0:0:0:1]/v1'
  ];
  const no = [
    'https://api.openai.com/v1',
    'http://10.0.0.5:11434/v1',
    'http://192.168.1.20:11434/v1',
    'http://localhost.evil.com/v1',
    'http://127.0.0.1.evil.com/v1',
    'http://0.0.0.0:11434/v1',
    '',
    'not-a-url'
  ];
  for (const url of yes) assert.strictEqual(isLoopbackBaseURL(url), true, `yerel sayılmalı: ${url}`);
  for (const url of no) assert.strictEqual(isLoopbackBaseURL(url), false, `yerel sayılmamalı: ${url}`);
});

/* ------------------------------------------------- yerel: anahtarsız */

test('local-provider 2: anahtarsız loopback sağlayıcıya istek çıkar ve başarılı olur', async (t) => {
  const fake = await startFakeServer();
  t.after(async () => { await fake.close(); });

  const baseDir = tempDir('local-ok');
  const providers = makeProviders(baseDir);
  const saved = providers.save({
    provider: { name: 'Yerel Ollama', baseURL: `http://127.0.0.1:${fake.port}/v1`, models: ['llama3'] }
  });
  assert.ok(saved.ok, 'sağlayıcı kaydedilemedi: ' + JSON.stringify(saved.error));

  const res = await providers.test({ providerId: saved.data.provider.id, path: '/models' });
  assert.ok(res.ok, 'anahtarsız yerel sağlayıcı başarısız: ' + JSON.stringify(res.error));

  assert.strictEqual(res.data.local, true, 'yerel kimlik işaretlenmeli');
  assert.strictEqual(res.data.keyId, 'local');
  assert.strictEqual(res.data.mask, 'yerel');
  assert.strictEqual(res.data.attempts.length, 1, 'tek deneme olmalı');
  assert.strictEqual(res.data.attempts[0].outcome, 'success');

  assert.strictEqual(fake.seen.length, 1, 'tam bir istek çıkmalı');
  assert.strictEqual(fake.seen[0].auth, 'Bearer', 'yerel istek anahtarsız (boş Bearer) gitmeli');

  /* disk tarafında sahte anahtar ÜRETİLMEMELİ */
  const keysFile = providers.paths.keysPath;
  const onDisk = fs.existsSync(keysFile) ? fs.readFileSync(keysFile, 'utf8') : '';
  assert.ok(!onDisk.includes('local'), 'yerel kimlik anahtar dosyasına yazılmamalı');
});

/* ----------------------------------------------- uzak: anahtarsız yasak */

test('local-provider 3: anahtarsız uzak sağlayıcıya hiç istek çıkmaz (E_SECRET_MISSING)', async () => {
  const baseDir = tempDir('local-no');
  const providers = makeProviders(baseDir);
  const saved = providers.save({
    provider: { name: 'Uzak', baseURL: 'https://api.example.com/v1', models: ['m'] }
  });
  assert.ok(saved.ok);

  const res = await providers.test({ providerId: saved.data.provider.id, path: '/models' });
  assert.strictEqual(res.ok, false, 'anahtarsız uzak sağlayıcı başarılı olmamalı');
  assert.strictEqual(res.error.code, 'E_SECRET_MISSING');
  assert.strictEqual(res.error.detail.tried.length, 0, 'hiçbir anahtar denenmemeli');
});

/* --------------------------------------------------- renderer sözleşmesi */

test('local-provider 4: ilk kurulumda hazır sağlayıcı seçimi ve yerel algılama', () => {
  const presets = appJs.slice(appJs.indexOf('const PROVIDER_PRESETS'), appJs.indexOf('const PROVIDER_PRESETS') + 700);
  assert.ok(presets, 'PROVIDER_PRESETS yok');
  for (const name of ['OpenAI', 'OpenRouter', 'DeepSeek', 'Groq', 'Mistral', 'Yerel (Ollama)']) {
    assert.ok(presets.includes(name), `hazır listede ${name} yok`);
  }
  assert.match(presets, /127\.0\.0\.1:11434\/v1/, 'yerel Ollama adresi yok');

  const local = appJs.slice(appJs.indexOf('function isLocalProviderUrl'), appJs.indexOf('function isLocalProviderUrl') + 420);
  assert.match(local, /hostname/, 'hostname kontrolü yok');
  assert.match(local, /localhost/);
  assert.match(local, /::1/);
  assert.match(local, /\^127\\\./, '127.x aralığı kontrol edilmiyor');

  assert.match(appJs, /'data-field': 'onboard-new-preset'/, 'hazır sağlayıcı seçimi panele bağlanmamış');
  assert.match(appJs, /onboardSelectedProvider\(\)/, 'seçili sağlayıcı çözülmüyor');
  assert.match(appJs, /Yerel sunucu anahtarsız test ediliyor/, 'yerel test durumu metni yok');
});
