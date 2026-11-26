'use strict';
/* Lider duman testi — uygulamayı gerçekten açar, 23 ekranın hepsini gezer, hata toplar. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { freePort } = require('./lib/cdp');
const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
const PROFILE = path.join(ROOT, 'work', `ldr-smoke-profile-${process.pid}`);
let PORT = 0;
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

const SMOKE = String.raw`
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nav = [...document.querySelectorAll('[data-nav-item]')];
  const secs = [...document.querySelectorAll('[data-screen]')];
  const out = {
    title: document.title, nav: nav.length, screens: secs.length,
    empty: [], blank: [], visited: 0, shell: !!document.querySelector('[data-shell], .kv-shell, body > main')
  };
  for (const s of secs) {
    const id = s.getAttribute('data-screen');
    const btn = nav.find((n) => n.dataset.navItem === id);
    if (!btn) { out.empty.push(id + ':nav-yok'); continue; }
    btn.click();
    await sleep(120);
    if (s.hasAttribute('hidden')) { out.empty.push(id + ':acilmadi'); continue; }
    out.visited += 1;
    const text = (s.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length < 40) out.blank.push(id + ':' + text.length);
  }
  return out;
})()`;

(async () => {
  PORT = await freePort();
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], { cwd: path.join(ROOT, 'src'), stdio: 'ignore' });
  const exc = [], errs = [];
  try {
    let page = null;
    for (let i = 0; i < 120 && !page; i += 1) {
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* bekle */ }
      if (!page) await SLEEP(400);
    }
    if (!page) throw new Error('CDP sayfa yok (uygulama açılmadı)');
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
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await SLEEP(400);
    const r = await s.eval(SMOKE);
    console.log('uygulama:', JSON.stringify(r));
    // connect ekranı veri kontrolü
    const c = await s.eval(`(async () => {
      const n = [...document.querySelectorAll('[data-nav-item]')].find((x) => x.dataset.navItem === 'connect');
      n.click(); await new Promise((r) => setTimeout(r, 900));
      const sec = document.querySelector('[data-screen="connect"]');
      return { cards: sec.querySelectorAll('[data-preset-item]:not([hidden])').length,
               count: String((sec.querySelector('[data-preset-count]') || {}).textContent || '').trim(),
               kinds: { all: sec.querySelectorAll('[data-preset-kind]').length } };
    })()`);
    console.log('connect:', JSON.stringify(c));
    console.log('exception:', exc.length, '| konsol hatasi:', errs.length);
    if (exc.length) console.log(exc);
    if (errs.length) console.log(errs.slice(0, 5));
    const ok = r && r.visited === 23 && exc.length === 0 && c && c.cards === 124;
    console.log(ok ? 'DUMAN TESTI: GECTI' : 'DUMAN TESTI: KALDI');
    process.exitCode = ok ? 0 : 1;
    fs.writeFileSync(path.join(__dirname, 'ldr-smoke.json'), JSON.stringify({ app: r, connect: c, exc, errs, ok }, null, 2));
  } finally { try { proc.kill(); } catch { /* yok */ } }
})().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
