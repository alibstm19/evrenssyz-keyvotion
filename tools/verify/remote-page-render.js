'use strict';
/**
 * Telefon sayfasi GERCEK TARAYICI kapisi — T-206.
 *
 * NEDEN: T-205 kapisi yalniz kaynak metnini olcuyordu; bu yuzden gercek
 * kusuru kacirdi. Kusur: `.overlay { display:flex }` kurali, `hidden`
 * ozniteliginin UA stilini eziyordu (sinif > oge). Sonuc: `#overlay-error`
 * HER ACILISTA ekranda kaliyor ve telefon kullanicisi hep "Baglanti Hatasi"
 * goruyordu — sunucu saglikli olsa bile.
 *
 * Bu kapi sayfayi headless Chrome/Edge ile 390x844 (telefon) olcusunde
 * GERCEKTEN cizer ve hesaplanmis (computed) stilleri olcer:
 *   1) Jetonla acilista hata katmani GORUNMEZ (display: none).
 *   2) Jetonla acilista giris katmani GORUNMEZ.
 *   3) Baglanti gostergesi "bagli" der, sohbet balonlari cizilir.
 *   4) Jetonsuz acilista GIRIS katmani gorunur (kullanici kod girebilmeli).
 *
 * Negatif kontrol KALICIDIR: gizleme kurali cikarilmis bir kopya da ayni
 * tarayicida cizilir ve orada hata katmaninin GORUNUR olmasi beklenir.
 * Yani kapi, kusuru yeniden uretemedigi surece gecemez.
 *
 * Bagimlilik yok: node:http + yerel Chrome/Edge (CDP).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { freePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'src', 'main', 'services', 'remote-page.html');
const TOKEN = 'DEMO1234';

const BROWSERS = [
  path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
];

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  for (const p of BROWSERS) {
    try { if (p && fs.existsSync(p)) return p; } catch { /* yoksay */ }
  }
  return null;
}

/* ------------------------------------------------------------- sayfa sunucusu */

function startServer(legacyHtml) {
  const html = fs.readFileSync(PAGE, 'utf8');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const body = url.searchParams.get('legacy') === '1' ? legacyHtml : html;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }
    if (url.pathname === '/api/state' || url.pathname === '/api/board') {
      if (req.headers['x-kv-token'] !== TOKEN) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: { code: 'E_UNAUTHORIZED' } }));
        return;
      }
      const data = url.pathname === '/api/state'
        ? {
          conversation: {
            id: 'c1',
            title: 'Uzaktan kontrol',
            role: 'LDR',
            model: 'anthropic/claude',
            messages: [
              { role: 'user', content: 'Telefondan ekip durumunu ozetle.' },
              { role: 'assistant', content: 'Ekip hazir.', meta: { model: 'anthropic/claude', latency: 812 } }
            ]
          },
          messages: [],
          model: 'anthropic/claude',
          role: 'LDR',
          memoryCount: 1,
          memory: [{ text: 'Prototip varsayilan.', scope: 'global', kind: 'note' }],
          team: [{ role: 'Lider', code: 'LDR', model: 'anthropic/claude', state: 'busy' }],
          conversations: [{ id: 'c1', title: 'Uzaktan kontrol' }]
        }
        : { phase: 'dev', nextID: 'T-207', rows: [{ id: 'T-206', title: 'Ayarlar', state: 'active', owner: 'DEV' }], leaderCycles: [] };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'E_NOT_FOUND' } }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* ---------------------------------------------------------------- CDP istemci */

class Client {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.seq = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); return; }
      const list = this.events.get(msg.method);
      if (list && list.length) list.shift()(msg.params);
    };
  }
  send(method, params = {}) {
    const id = (this.seq += 1);
    return new Promise((res) => { this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  once(method, timeoutMs = 15000) {
    return new Promise((res) => {
      const list = this.events.get(method) || [];
      let done = false;
      const fire = (p) => { if (!done) { done = true; res(p); } };
      list.push(fire);
      this.events.set(method, list);
      setTimeout(() => fire(null), timeoutMs);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text || 'eval');
    return r.result && r.result.result ? r.result.result.value : null;
  }
  close() { try { this.ws.close(); } catch { /* yoksay */ } }
}

/* ------------------------------------------------------------------- olcum */

const PROBE = `(() => {
  const style = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'yok';
    return getComputedStyle(el).display;
  };
  return {
    errorOverlay: style('#overlay-error'),
    loginOverlay: style('#overlay-login'),
    conn: (document.getElementById('conn-text') || {}).textContent || '',
    bubbles: document.querySelectorAll('#chat-container .bubble').length,
    chatText: (document.getElementById('chat-container') || {}).textContent || '',
    ready: document.readyState
  };
})()`;

async function measure(client, url) {
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url });
  await loaded;
  await SLEEP(1800); /* ilk yoklama + yanit */
  return client.eval(PROBE);
}

/* --------------------------------------------------------------------- ana */

(async () => {
  const browser = findBrowser();
  if (!browser) {
    console.log('ATLANDI: Chrome/Edge bulunamadi (gercek tarayici kapisi calistirilamadi).');
    process.exit(2);
  }
  if (!fs.existsSync(PAGE)) { console.log('HATA: remote-page.html yok.'); process.exit(1); }

  /* Negatif kontrol icin gizleme kurali cikarilmis kopya. */
  const html = fs.readFileSync(PAGE, 'utf8');
  const rule = /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/;
  if (!rule.test(html)) {
    console.log('HATA: sayfada [hidden] gizleme kurali yok — duzeltme kaybolmus.');
    process.exit(1);
  }
  const legacyHtml = html.replace(rule, '/* kural yok (negatif kontrol) */');

  const { server, port } = await startServer(legacyHtml);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-render-'));
  const dbgPort = await freePort();
  const child = spawn(browser, [
    '--headless=new',
    `--remote-debugging-port=${dbgPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-gpu',
    '--window-size=390,844',
    'about:blank'
  ], { stdio: 'ignore' });

  const fails = [];
  try {
    let target = null;
    for (let i = 0; i < 100 && !target; i += 1) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch { /* bekle */ }
      if (!target) await SLEEP(200);
    }
    if (!target) throw new Error('headless tarayici hedefi acilmadi');

    const client = new Client(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true
    });

    /* 1) Jetonlu acilis: kullanici sohbeti gormeli, hata kartini GORMEMELI. */
    const withToken = await measure(client, `http://127.0.0.1:${port}/#${TOKEN}`);
    if (withToken.ready !== 'complete') fails.push('sayfa tam yuklenmedi');
    if (withToken.errorOverlay !== 'none') fails.push(`hata katmani jetonlu acilista GORUNUR (display: ${withToken.errorOverlay})`);
    if (withToken.loginOverlay !== 'none') fails.push(`giris katmani jetonlu acilista GORUNUR (display: ${withToken.loginOverlay})`);
    if (!/ba/i.test(String(withToken.conn))) fails.push(`baglanti gostergesi "bagli" demiyor: "${withToken.conn}"`);
    if (withToken.bubbles < 2) fails.push(`sohbet balonlari cizilmedi (${withToken.bubbles})`);
    if (!String(withToken.chatText).includes('Ekip hazir')) fails.push('sohbet icerigi ekranda degil');

    /* 2) Jetonsuz acilis: giris katmani gorunmeli (kod girisi). */
    await client.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    await client.once('Page.loadEventFired');
    await SLEEP(600);
    await client.eval('localStorage.clear()');
    const loaded2 = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: `http://127.0.0.1:${port}/?fresh=1` });
    await loaded2;
    await SLEEP(600);
    const noToken = await client.eval(PROBE);
    if (noToken.loginOverlay === 'none') fails.push('jetonsuz acilista giris katmani gizli kaldi');
    if (noToken.errorOverlay !== 'none') fails.push(`jetonsuz acilista hata katmani erken acildi (display: ${noToken.errorOverlay})`);

    /* 3) NEGATIF KONTROL: gizleme kurali olmayan sayfa kusuru yeniden uretmeli. */
    const legacy = await measure(client, `http://127.0.0.1:${port}/?legacy=1#${TOKEN}`);
    if (legacy.errorOverlay === 'none') {
      fails.push('NEGATIF KONTROL BASARISIZ: kural olmadan da hata katmani gizli — olcum kusuru yakalamiyor');
    }

    client.close();

    const lines = [
      `tarayici: ${path.basename(browser)} · telefon olcusu 390x844`,
      `jetonlu: hata=${withToken.errorOverlay} giris=${withToken.loginOverlay} durum="${withToken.conn}" balon=${withToken.bubbles}`,
      `jetonsuz: giris=${noToken.loginOverlay} hata=${noToken.errorOverlay}`,
      `negatif kontrol (kural yok): hata=${legacy.errorOverlay} (GORUNUR olmali)`
    ];
    for (const l of lines) console.log(l);

    if (fails.length) {
      console.log(`\nKAPI BASARISIZ (${fails.length}):`);
      for (const f of fails) console.log(` - ${f}`);
      process.exit(1);
    }
    console.log('\nKAPI BASARILI: telefon sayfasi gercek tarayicida hata karti gostermiyor.');
  } finally {
    try { child.kill(); } catch { /* yoksay */ }
    try { server.close(); } catch { /* yoksay */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* yoksay */ }
  }
})().catch((e) => { console.log('HATA:', e.message); process.exit(1); });
