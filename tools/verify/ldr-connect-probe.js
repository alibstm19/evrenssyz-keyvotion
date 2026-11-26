'use strict';
/* Lider bağımsız CDP probu — `connect` ekranı (T-147 / T-149 doğrulaması). Salt okuma. */
const path = require('node:path');
const { spawn } = require('node:child_process');
const { freePort } = require('./lib/cdp');
const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
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
    return r.result && r.result.result ? r.result.result.value : { __err: 'bos' };
  }
}

const PROBE = String.raw`
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => el && el.getClientRects().length > 0 && !el.closest('[hidden]');
  const nav = [...document.querySelectorAll('[data-nav-item]')].find((x) => x.dataset.navItem === 'connect');
  if (!nav) return { err: 'connect nav yok' };
  nav.click();
  await sleep(600);
  const sec = document.querySelector('[data-screen="connect"]');
  if (!sec) return { err: 'connect bolum yok' };
  const out = { cards: sec.querySelectorAll('[data-preset-item]:not([hidden])').length };

  // kart sec (sirli preset)
  const card = sec.querySelector('[data-preset-item][data-preset-id="int-gitlab"]');
  if (!card) return { ...out, err: 'int-gitlab karti yok' };
  card.click();
  await sleep(500);

  out.fields = sec.querySelectorAll('[data-preset-field]').length;
  out.fieldKeys = [...sec.querySelectorAll('[data-preset-field-key]')].map((e) => e.getAttribute('data-preset-field-key'));
  out.hints = sec.querySelectorAll('[data-preset-field-hint]').length;
  out.howtoSteps = sec.querySelectorAll('[data-preset-howto] > *').length;
  out.howtoText = (sec.querySelector('[data-preset-howto]') || {}).textContent?.trim().slice(0, 60) || '';
  const inp = sec.querySelector('[data-preset-field] input');
  out.inputType = inp ? inp.type : '';
  out.autocomplete = inp ? inp.getAttribute('autocomplete') : '';
  out.showBtn = sec.querySelectorAll('[data-preset-form] button[aria-pressed]').length;

  // 36px alti hedefler
  const sel = 'button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],label.kv-check';
  out.small = [];
  for (const el of [...sec.querySelectorAll(sel)].filter(vis)) {
    const h = Math.round(el.getBoundingClientRect().height * 10) / 10;
    if (h < 36) out.small.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40), h });
  }
  out.targets = [...sec.querySelectorAll(sel)].filter(vis).length;

  // zorunlu bos gonderim: baglan'a bas, sonuc metnini oku
  const connectBtn = sec.querySelector('[data-preset-connect]');
  if (connectBtn) { connectBtn.click(); await sleep(400); }
  // Votion anahtari: gercek hedef + isaret gorunumu
  const chk = sec.querySelector('.kv-check');
  const box = chk ? chk.querySelector('input[type="checkbox"]') : null;
  if (chk && box) {
    out.checkH = Math.round(box.getBoundingClientRect().height * 10) / 10;
    out.labelH = Math.round(chk.getBoundingClientRect().height * 10) / 10;
    const before = (st) => getComputedStyle(chk, '::before')[st];
    out.boxBefore = before('backgroundColor');
    chk.click();
    await sleep(200);
    out.checked = box.checked;
    out.boxAfter = before('backgroundColor');
    const after = getComputedStyle(chk, '::after');
    out.markW = after.width;
  }

  out.resultText = (sec.querySelector('[data-preset-result]') || {}).textContent?.trim().slice(0, 90) || '';
  out.errorText = (sec.querySelector('.kv-preset__error') || {}).textContent?.trim().slice(0, 60) || '';
  out.dialogOpen = !!document.querySelector('dialog[open],[data-confirm][open]');
  return out;
})()`;

(async () => {
  PORT = await freePort();
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`], { cwd: path.join(ROOT, 'src'), stdio: 'ignore' });
  const exc = [];
  try {
    let page = null;
    for (let i = 0; i < 100 && !page; i += 1) {
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* bekle */ }
      if (!page) await SLEEP(400);
    }
    if (!page) throw new Error('CDP sayfa yok');
    const s = new S(page.webSocketDebuggerUrl);
    await s.ready;
    await s.send('Page.enable'); await s.send('Runtime.enable');
    s.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.text).slice(0, 120));
    });
    await SLEEP(3000);
    for (const w of [1400, 768]) {
      await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w <= 768 });
      await SLEEP(400);
      const r = await s.eval(PROBE);
      console.log(`@${w}:`, JSON.stringify(r));
    }
    console.log('exception:', exc.length, exc.join(' | '));
  } finally { try { proc.kill(); } catch { /* yok */ } }
})().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
