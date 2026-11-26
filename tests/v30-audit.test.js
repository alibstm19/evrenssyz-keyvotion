'use strict';
/*
 * v3.0 bagimsiz denetim (T-123).
 * Urun kodunu DUZELTMEZ; sozlesmenin gercekten uygulandigini yeni iddialarla olcer.
 * Her iddia dosya okumasi veya gercek servis cagrisidir; skip yok.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const API = rd('docs/console-api-contract.md');
const UI = rd('docs/console-ui-contract.md');
const IDX = rd('src/renderer/index.html');
const APP = rd('src/renderer/app.js');
const MAIN = rd('src/main/main.js');
const PRELOAD = rd('src/preload/preload.js');
const TUR12 = rd('src/renderer/styles/tur12.css');
const CH = require(path.join(SRC, 'shared', 'ipc-channels.js'));

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-audit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/* ---------- 1) Katalog butunlugu + placeholder kilidi ---------- */
test('T-123/1 katalog: 64 saglayici, 195 yetenek, placeholder cozumlu', () => {
  const cat = JSON.parse(rd('src/main/services/integration-catalog.json'));
  assert.equal(cat.length, 64, `saglayici 64 olmali (v3.1); ${cat.length}`);
  const ids = cat.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'saglayici id tekil degil');

  let caps = 0;
  for (const p of cat) {
    assert.ok(Array.isArray(p.capabilities) && p.capabilities.length > 0, `${p.id}: yetenek yok`);
    assert.ok(Array.isArray(p.hosts) && p.hosts.length > 0, `${p.id}: host beyaz listesi yok`);
    assert.ok(Array.isArray(p.fields), `${p.id}: fields yok`);
    caps += p.capabilities.length;
    const fieldKeys = new Set(p.fields.map((f) => f.key));
    for (const cap of p.capabilities) {
      assert.ok(typeof cap.verb === 'string' && cap.verb, `${p.id}/${cap.id}: verb yok`);
      assert.ok(typeof cap.path === 'string' && cap.path, `${p.id}/${cap.id}: path yok`);
      /* path ya sunucuya goreli ('/...') ya da mutlak http(s) olabilir; mutlak ise host beyaz listede olmali. */
      if (!cap.path.startsWith('/')) {
        const u = new URL(cap.path);
        assert.ok(p.hosts.includes(u.hostname), `${p.id}/${cap.id}: mutlak path host beyaz listede degil (${u.hostname})`);
      }
      const placeholders = [...cap.path.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
      const paramKeys = new Set(Object.keys(cap.params || {}));
      for (const ph of placeholders) {
        const covered = paramKeys.has(ph) || fieldKeys.has(ph) || ph === 'token';
        assert.ok(covered, `${p.id}/${cap.id}: {${ph}} placeholder'i ne params ne fields icinde (T-120 kusuru)`);
      }
    }
  }
  assert.equal(caps, 195, `yetenek toplami 195 olmali (v3.1); ${caps}`);
});

/* ---------- 2) Sir sizdirmama: audit'e token/params/url yazilmaz ---------- */
test('T-123/2 audit kayitlari sir/arguman/url tasimaz', () => {
  const forbidden = /(^|[\s,{])(token|params|password|secret|authorization)\s*:/m;
  const blocks = [...MAIN.matchAll(/audit\.append\(\{([\s\S]*?)\n\s*\}\);/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 20, `audit cagrisi beklenenden az: ${blocks.length}`);
  for (const b of blocks) {
    assert.equal(forbidden.test(b), false, `audit blogunda sır alanı var: ${b.slice(0, 120)}`);
  }
  /* integration.invoke: yalniz id + capability; mcp.call: yalniz tool */
  const invIdx = MAIN.indexOf('ipcMain.handle(CHANNELS.INTEGRATION_INVOKE');
  const invEnd = MAIN.indexOf('ipcMain.handle(', invIdx + 10);
  const inv = MAIN.slice(invIdx, invEnd);
  assert.match(inv, /extra:\s*\{\s*capability:/, 'integration.invoke auditi capability tasimali');
  assert.equal(/payload\.params/.test(inv), false, 'integration.invoke auditi arguman tasiyor');
  assert.equal(/payload\.token/.test(inv), false, 'integration.invoke auditi token tasiyor');

  const mcpIdx = MAIN.indexOf("op: 'mcp.call'");
  const mcp = MAIN.slice(mcpIdx, mcpIdx + 400);
  assert.match(mcp, /extra:\s*\{\s*tool:/, 'mcp.call auditi tool tasimali');
  assert.equal(/arguments/.test(mcp), false, 'mcp.call auditi arguman tasiyor');
});

/* ---------- 3) MCP guvenligi (davranissal) ---------- */
test('T-123/3 mcp-registry: sema disi alan, https zorunlu, env beyaz liste', async (t) => {
  const { createMcpRegistry, ENV_ALLOWLIST } = require(path.join(SRC, 'main/services/mcp-registry.js'));
  assert.ok(ENV_ALLOWLIST instanceof Set, 'ENV_ALLOWLIST bir Set olmali');
  assert.ok(ENV_ALLOWLIST.has('PATH'), 'ENV_ALLOWLIST PATH icermeli');
  assert.equal(ENV_ALLOWLIST.has('LD_PRELOAD'), false, 'LD_PRELOAD beyaz listede olmamali');

  const cfg = path.join(tempDir(t), 'mcp.json');
  const reg = createMcpRegistry({ configPath: cfg });
  assert.throws(() => reg.add({
    id: 'x1', name: 'X', transport: 'stdio', command: process.execPath, surprise: true
  }), (e) => e && e.code === 'E_BAD_REQUEST');
  assert.throws(() => reg.add({
    id: 'x2', name: 'X', transport: 'http', url: 'http://example.com/mcp'
  }), (e) => e && e.code === 'E_FORBIDDEN');
  assert.throws(() => reg.add({
    id: 'x3', name: 'X', transport: 'http', url: 'not-a-url'
  }), (e) => e && e.code === 'E_BAD_REQUEST');
  reg.add({ id: 'x4', name: 'Yerel', transport: 'stdio', command: process.execPath, envRecord: { PATH: process.env.PATH || '' } });
  const saved = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  const env = saved.servers[0].envKeys || [];
  assert.equal(env.some((k) => !ENV_ALLOWLIST.has(k)), false, 'beyaz liste disi env kaydedildi');
  await reg.shutdown();

  /* Varsayilan GUVENLI: loopback http bile kapali; acikca izin verilince gecerli. */
  const cfg2 = path.join(tempDir(t), 'mcp2.json');
  const reg2 = createMcpRegistry({ configPath: cfg2, allowInsecureLoopback: true });
  reg2.add({ id: 'x5', name: 'Yerel', transport: 'http', url: 'http://127.0.0.1:9/mcp' });
  assert.throws(() => reg2.add({
    id: 'x6', name: 'Uzak', transport: 'http', url: 'http://example.com/mcp'
  }), (e) => e && e.code === 'E_FORBIDDEN');
  await reg2.shutdown();
});

/* ---------- 4) Renderer sozlesmesi ---------- */
/* v3.1 (T-142): sayilar sabit yazilmaz — UI sozlesmesi §2 ekran kumesi ve
 * §10/UI-123 stylesheet zincirinden turetilir (tur10/contract 4-5 deseni). */
function contractScreens() {
  const start = UI.indexOf('## 2. Ekran kimlikleri');
  assert.ok(start >= 0, 'UI sozlesmesinde §2 bulunamadi');
  const end = UI.indexOf('## 3.', start);
  const section = UI.slice(start, end > 0 ? end : UI.length);
  return [...new Set([...section.matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((m) => m[1]))];
}

function contractStylesheets() {
  const row = UI.split(/\r?\n/).find((l) => l.includes('| UI-123 |'));
  assert.ok(row, 'UI sozlesmesinde UI-123 satiri yok');
  const chain = (row.match(/`([a-z0-9-]+\.css(?:\s*→\s*[a-z0-9-]+\.css)+)`/) || [])[1];
  assert.ok(chain, 'UI-123 satirinda stylesheet zinciri yok');
  return chain.split('→').map((s) => s.trim());
}

test('T-123/4 renderer: sozlesme ekran/stylesheet kumesi, sifir style/innerHTML, sir alani', () => {
  const screens = [...new Set([...IDX.matchAll(/data-screen="([a-z]+)"/g)].map((m) => m[1]))];
  const links = [...IDX.matchAll(/<link\s+rel="stylesheet"\s+href="styles\/([a-z0-9-]+\.css)">/g)].map((m) => m[1]);
  assert.deepEqual(screens.slice().sort(), contractScreens().slice().sort(),
    `ekran kumesi UI §2 ile uyusmuyor; kod ${screens.length}, sozlesme ${contractScreens().length}`);
  assert.deepEqual(links, contractStylesheets(),
    `stylesheet zinciri UI-123 ile uyusmuyor; kod ${links.length}, sozlesme ${contractStylesheets().length}`);
  assert.strictEqual(links[links.length - 1], contractStylesheets().pop(),
    'son stylesheet sozlesme zincirinin son katmani olmali');
  assert.equal((IDX.match(/\sstyle="/g) || []).length, 0, 'index.html inline style tasiyor');
  assert.equal((IDX.match(/innerHTML/g) || []).length + (APP.match(/innerHTML/g) || []).length, 0, 'innerHTML kullanimi var');
  for (const f of ['integration-token']) {
    const tag = (IDX.match(new RegExp(`<input[^>]*data-field="${f}"[^>]*>`)) || [''])[0];
    assert.ok(tag, `${f}: sir alani yok`);
    assert.match(tag, /type="password"/, `${f}: type=password degil`);
    assert.match(tag, /autocomplete="off"/, `${f}: autocomplete=off degil`);
    assert.match(tag, /spellcheck="false"/, `${f}: spellcheck=false degil`);
  }
  assert.match(IDX, /<ul data-mcp-log aria-live="polite">/, 'mcp log aria-live=polite degil');
  assert.match(APP, /const LOG_LIMIT = 200;/, 'halka tampon 200 degil');
});

/* ---------- 5) Durum ayrimi ---------- */
test('T-123/5 data-state yalniz §5.1, baglanti data-conn-state', () => {
  const STATES = new Set(['idle', 'busy', 'error', 'offline']);
  const CONN = new Set(['connected', 'degraded', 'error', 'untested']);
  const badSel = [...TUR12.matchAll(/\[data-state="([a-zA-Z-]+)"\]/g)].map((m) => m[1]).filter((v) => !STATES.has(v));
  assert.deepEqual(badSel, [], 'tur12.css §5.1 disi data-state secicisi tasiyor');
  const connSel = new Set([...TUR12.matchAll(/\[data-conn-state="([a-zA-Z-]+)"\]/g)].map((m) => m[1]));
  assert.ok(connSel.size >= 4, `data-conn-state secicisi ${connSel.size}; en az 4 olmali`);
  for (const v of connSel) assert.ok(CONN.has(v), `data-conn-state degeri gecersiz: ${v}`);
  const used = [...new Set([
    ...[...IDX.matchAll(/data-state="([a-zA-Z-]+)"/g)].map((m) => m[1]),
    ...[...APP.matchAll(/dataset\.state\s*=\s*['"]([a-zA-Z-]+)['"]/g)].map((m) => m[1])
  ])];
  for (const v of used) assert.ok(STATES.has(v), `data-state gecersiz deger: ${v}`);
});

/* ---------- 6) Rol projeksiyonu: integrations/mcps admin-only ---------- */
test('T-123/6 rol projeksiyonu: iki yeni ekran ROLE_SCREENS icinde degil', () => {
  const start = APP.indexOf('const ROLE_SCREENS = {');
  const end = APP.indexOf('};', start);
  assert.ok(start > -1 && end > start, 'ROLE_SCREENS bulunamadi');
  const block = APP.slice(start, end);
  assert.equal(block.includes('integrations'), false, 'integrations teacher/student kumesinde');
  assert.equal(block.includes('mcps'), false, 'mcps teacher/student kumesinde');
  assert.match(block, /teacher:\s*new Set\(\[/, 'teacher kumesi yok');
  assert.match(block, /student:\s*new Set\(\[/, 'student kumesi yok');
});

/* ---------- 7) Kanal esligi ---------- */
/* v3.2 (T-148): sayilar sozlesmeden turetilir; kod sabit sayi gommez. */
function contractChannelNames() {
  const start = API.indexOf('### 7.2 Kanal tablosu');
  assert.ok(start >= 0, 'API sozlesmesinde §7.2 kanal tablosu yok');
  const end = API.indexOf('### 7.3', start);
  const section = API.slice(start, end > 0 ? end : API.length);
  return [...new Set(
    [...section.matchAll(/^\|\s*`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`\s*\|/gm)].map((m) => m[1])
  )];
}

function contractPushNames() {
  const start = API.indexOf('### 7.2 Kanal tablosu');
  const end = API.indexOf('### 7.3', start);
  const section = API.slice(start, end > 0 ? end : API.length);
  return [...section.matchAll(/^\|\s*`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`\s*\|\s*\*\*push\*\*/gm)].map((m) => m[1]);
}

function contractWriteNames() {
  const line = API.split(/\r?\n/).find((l) => l.includes('| API-51a |'));
  assert.ok(line, 'API sozlesmesinde API-51a satiri yok');
  return [...new Set(
    [...line.matchAll(/`(kv:[a-z][a-z-]*:[a-zA-Z-]+)`/g)].map((m) => m[1])
      .filter((c) => !c.includes('settings:set'))
  )];
}

test('T-123/7 kanal/kume sozlesmeyle birebir, main+preload eksiksiz, push yazma degil', () => {
  const keys = Object.keys(CH.CHANNELS);
  const values = Object.values(CH.CHANNELS);
  const wantChannels = contractChannelNames();
  assert.deepEqual(values.slice().sort(), wantChannels.slice().sort(),
    `CHANNELS ${values.length} kanal; sozlesme §7.2 ${wantChannels.length}`);
  assert.deepEqual(CH.WRITE_CHANNELS.slice().sort(), contractWriteNames().sort(),
    `WRITE_CHANNELS ${CH.WRITE_CHANNELS.length}; sozlesme API-51a ${contractWriteNames().length}`);
  assert.deepEqual(CH.PUSH_CHANNELS.slice().sort(), contractPushNames().sort(),
    `PUSH_CHANNELS ${CH.PUSH_CHANNELS.length}; sozlesme §7.2 push ${contractPushNames().length}`);
  for (const p of CH.PUSH_CHANNELS) {
    assert.ok(values.includes(p), `push kanali CHANNELS icinde degil: ${p}`);
    assert.equal(CH.WRITE_CHANNELS.includes(p), false, `push kanali yazma listesinde: ${p}`);
  }
  const missingMain = keys.filter((k) => !CH.PUSH_CHANNELS.includes(CH.CHANNELS[k]) && !MAIN.includes(`CHANNELS.${k}`));
  assert.deepEqual(missingMain, [], `main.js handler eksik: ${missingMain.join(',')}`);
  const missingPreload = values.filter((v) => !PRELOAD.includes(v));
  assert.deepEqual(missingPreload, [], `preload kanal degeri eksik: ${missingPreload.join(',')}`);
});

/* ---------- 8) Sozlesme sayilari tutarli ---------- */
test('T-123/8 sozlesme sayilari kodla tutarli', () => {
  const screens = new Set([...IDX.matchAll(/data-screen="([a-z]+)"/g)].map((m) => m[1]));
  const links = [...IDX.matchAll(/<link\s+rel="stylesheet"/g)].length;
  /* v3.3 (T-199): sozlesme 23 ekran + 18 stylesheet + 109 kanal / 44 yazma.
   * Ekran/stylesheet birebirligi §2 ve UI-123'ten turetilir (T-142 deseni);
   * burada iddia: kod sozlesmeyi ASMAZ, kanal sayilari sozlesmeyle esittir. */
  const secStart = UI.indexOf('## 2. Ekran kimlikleri');
  const secEnd = UI.indexOf('## 3.', secStart);
  const uiScreens = [...new Set(
    [...UI.slice(secStart, secEnd).matchAll(/^\|\s*`([a-z]+)`\s*\|/gm)].map((m) => m[1])
  )];
  const row = UI.split(/\r?\n/).find((l) => l.includes('| UI-123 |'));
  const chain = (row.match(/`([a-z0-9-]+\.css(?:\s*→\s*[a-z0-9-]+\.css)+)`/) || [])[1];
  const chainLen = chain ? chain.split('→').length : 0;
  assert.ok(uiScreens.length >= 23, `UI sozlesmesi 23 ekran demeli; ${uiScreens.length}`);
  assert.ok(chainLen >= 18, `UI-123 zinciri 18 stylesheet demeli; ${chainLen}`);
  assert.ok(screens.size <= uiScreens.length, `ekran sayisi sozlesmeyi asiyor: ${screens.size} > ${uiScreens.length}`);
  assert.ok(links <= chainLen, `stylesheet sayisi sozlesmeyi asiyor: ${links} > ${chainLen}`);
  assert.equal(Object.keys(CH.CHANNELS).length, contractChannelNames().length);
  assert.equal(CH.WRITE_CHANNELS.length, contractWriteNames().length);
});
