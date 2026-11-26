'use strict';
/*
 * Paketlenmiş yapı duman testi — `dist/` içindeki gerçek .exe'yi açar.
 *
 * `ldr-smoke.js` kaynaktan (`src/`) çalışır; indiren kullanıcı ise .exe'yi
 * çalıştırır. İkisi arasındaki fark (eksik dosya, yanlış yol, paket dışı
 * bırakılmış varlık) yalnız burada görünür. 23 ekran gezilir, connect kartı
 * sayılır, exception ve konsol hatası toplanır.
 *
 * Kullanım: node tools/verify/packaged-smoke.js
 * Çıkış: 0 = geçti, 1 = kaldı, 2 = dist yok (atlanır).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolvePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'Keyvotion Console', 'Keyvotion Console.exe');
let PORT = 0;
const PROFILE = path.join(ROOT, 'work', 'pkg-smoke-profile');
const HOME_DIR = path.join(ROOT, 'work', 'pkg-smoke-home');
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

class S {
  constructor(url) {
    this.ws = new WebSocket(url); this.seq = 0; this.p = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.p.has(m.id)) { this.p.get(m.id)(m); this.p.delete(m.id); }
    };
  }
  send(method, params = {}) {
    const id = (this.seq += 1);
    return new Promise((res) => { this.p.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  }
}

const SMOKE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nav = [...document.querySelectorAll('[data-nav-item]')];
  const secs = [...document.querySelectorAll('[data-screen]')];
  const out = { title: document.title, nav: nav.length, screens: secs.length, empty: [], blank: [], visited: 0 };
  out.design = document.documentElement.dataset.design || '';
  out.teamAuto = !!document.querySelector('[data-action="team-auto"]');
  for (const s of secs) {
    const id = s.getAttribute('data-screen');
    const btn = nav.find((n) => n.dataset.navItem === id);
    if (!btn) { out.empty.push(id + ':nav-yok'); continue; }
    btn.click();
    await sleep(120);
    if (s.hasAttribute('hidden')) { out.empty.push(id + ':acilmadi'); continue; }
    out.visited += 1;
    const text = (s.innerText || '').replace(/\\s+/g, ' ').trim();
    if (text.length < 40) out.blank.push(id + ':' + text.length);
  }
  return out;
})()`;

const CONNECT = `(async () => {
  const n = [...document.querySelectorAll('[data-nav-item]')].find((x) => x.dataset.navItem === 'connect');
  if (!n) return { ok: false, reason: 'connect nav yok' };
  n.click(); await new Promise((r) => setTimeout(r, 900));
  const sec = document.querySelector('[data-screen="connect"]');
  if (!sec) return { ok: false, reason: 'connect ekrani yok' };
  return {
    ok: true,
    cards: sec.querySelectorAll('[data-preset-item]:not([hidden])').length,
    count: String((sec.querySelector('[data-preset-count]') || {}).textContent || '').trim()
  };
})()`;

(async () => {
  if (!fs.existsSync(EXE)) {
    console.log(JSON.stringify({ packaged: false, reason: 'dist/Keyvotion Console/Keyvotion Console.exe yok' }));
    console.log('PAKET DUMAN: ATLANDI');
    process.exit(2);
  }
  const bytes = fs.statSync(EXE).size;
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(HOME_DIR, { recursive: true, force: true });
  fs.mkdirSync(HOME_DIR, { recursive: true });

  const started = Date.now();
  PORT = await resolvePort('KV_PKG_CDP_PORT');
  const proc = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], {
    cwd: path.dirname(EXE), stdio: 'ignore', env: { ...process.env, USERPROFILE: HOME_DIR }
  });
  const exc = [];
  const errs = [];
  try {
    let page = null;
    for (let i = 0; i < 150 && !page; i += 1) {
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* bekle */ }
      if (!page) await SLEEP(400);
    }
    if (!page) throw new Error('CDP sayfa yok (paketlenmiş exe açılmadı)');
    const bootMs = Date.now() - started;
    const s = new S(page.webSocketDebuggerUrl);
    await s.ready;
    await s.send('Page.enable'); await s.send('Runtime.enable'); await s.send('Log.enable').catch(() => {});
    s.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.text).slice(0, 160));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console');
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(String(m.params.entry.text).slice(0, 160));
    });
    await SLEEP(3500);

    /* İlk kurulum paneli ilk açılışta beklenir; sonra kapatılır ki ekranlar gezilsin. */
    const onboard = await s.eval(`(() => {
      const ob = document.querySelector('[data-onboard]');
      const open = !!ob && !ob.hasAttribute('hidden');
      if (open) { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); }
      return { open, hasSkip: !!document.querySelector('[data-action="onboard-skip"]') };
    })()`);
    await SLEEP(900);

    await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await SLEEP(400);
    const app = await s.eval(SMOKE);
    const connect = await s.eval(CONNECT);

    /* Tur: kullanıcı "Bitir"e basınca uygulama beyaz ekrana düşmemeli.
       Kök neden `[data-tour]` seçicisinin <html>'i yakalamasıydı. */
    const tour = await s.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = document.querySelector('[data-action="tour-start"]');
      if (!b) return { ok: false, reason: 'tur düğmesi yok' };
      b.click();
      await sleep(500);
      let steps = 0;
      for (let i = 0; i < 14; i += 1) {
        const n = document.querySelector('[data-action="tour-next"]');
        if (!n) break;
        n.click();
        steps += 1;
        await sleep(450);
        const root = document.querySelector('.kv-tour');
        if (!root || root.hidden) break;
      }
      await sleep(600);
      const openScreens = [...document.querySelectorAll('[data-screen]')].filter((x) => !x.hidden).length;
      return {
        ok: document.documentElement.hidden === false && document.documentElement.getAttribute('data-tour-active') === null && openScreens >= 1,
        steps,
        htmlHidden: document.documentElement.hidden,
        openScreens
      };
    })()`);

    const url = page.url || '';
    /* Taşınabilirlik kanıtı: sahte ev dizininde proje klasörü oluştu mu?
       Sabit makine yolu kalsaydı yazım başka yere gider, burada klasör olmazdı. */
    const fakeHomeProject = path.join(HOME_DIR, 'Keyvotion');
    const projectDirCreated = fs.existsSync(fakeHomeProject);
    const projectHasTeam = fs.existsSync(path.join(fakeHomeProject, '.team'));
    const report = {
      exe: path.relative(ROOT, EXE),
      exeBytes: bytes,
      bootMs,
      url: url.replace(/^file:\/\/\//, '').replace(ROOT.replace(/\\/g, '/') + '/', '').slice(0, 120),
      onboard,
      app,
      connect,
      tour,
      projectDirCreated,
      projectHasTeam,
      exceptions: exc.length,
      consoleErrors: errs.length
    };
    console.log(JSON.stringify(report, null, 1));
    if (exc.length) console.log('EXC', exc.slice(0, 3));
    if (errs.length) console.log('ERR', errs.slice(0, 3));

    const ok = Boolean(app) && app.visited === 23 && app.empty.length === 0
      && app.design === 'prototip' && app.teamAuto === true
      && exc.length === 0 && errs.length === 0
      && connect && connect.ok && connect.cards === 124
      && tour && tour.ok
      && projectDirCreated && projectHasTeam;
    fs.writeFileSync(path.join(__dirname, 'packaged-smoke.json'), JSON.stringify({ ...report, ok }, null, 2));
    console.log(ok ? 'PAKET DUMAN: GECTI' : 'PAKET DUMAN: KALDI');
    process.exitCode = ok ? 0 : 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})().catch((e) => { console.error('HATA', e.message); process.exit(1); });
