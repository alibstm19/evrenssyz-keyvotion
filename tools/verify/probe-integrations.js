'use strict';
/* Lider ölçüm T-196: kart → detay → geri. Gerçek Electron + CDP. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { freePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
const OUT = path.join(ROOT, 'work', 'shots');
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
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    if (!r.result || !r.result.data) return null;
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  }
}

(async () => {
  const PORT = await freePort();
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`], { cwd: path.join(ROOT, 'src'), stdio: 'ignore' });
  const exc = [];
  try {
    let page = null;
    for (let i = 0; i < 120 && !page; i += 1) {
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* bekle */ }
      if (!page) await SLEEP(400);
    }
    if (!page) throw new Error('CDP sayfa yok');
    const s = new S(page.webSocketDebuggerUrl);
    await s.ready;
    await s.send('Page.enable'); await s.send('Runtime.enable');
    s.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.text).slice(0, 200));
    });
    await SLEEP(3200);
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await SLEEP(500);

    const goto = async () => s.eval(`(() => {
      const n = [...document.querySelectorAll('[data-nav-item]')].find((x) => x.dataset.navItem === 'integrations');
      if (n) n.click();
      return !!n;
    })()`);
    await goto();
    await SLEEP(1600);
    console.log('liste:', await s.shot('t196-1-list'));

    /* 1) karta tıkla → detay */
    const step1 = await s.eval(`(async () => {
      const sec = document.querySelector('[data-screen="integrations"]');
      const card = sec.querySelector('[data-integration-catalog] [data-action="integration-pick"]');
      const id = card.dataset.providerId;
      card.click();
      await new Promise((r) => setTimeout(r, 900));
      const root = sec.querySelector('.kv-integrations');
      const head = sec.querySelector('[data-integration-detail]');
      const b1 = sec.querySelector('[data-integrations-block="b1"]');
      const title = sec.querySelector('[data-field="integration-detail-title"]');
      const addr = document.querySelector('[data-field="nav-address"]');
      const form = sec.querySelector('[data-integration-form]');
      const r = {
        id,
        view: root.getAttribute('data-integrations-view'),
        headHidden: head.hidden,
        catalogVisible: b1.getClientRects().length > 0,
        title: String(title.textContent || '').trim(),
        address: addr ? addr.value : null,
        formVisible: form ? form.getClientRects().length > 0 : null,
        backVisible: sec.querySelector('[data-action="integration-back"]').getClientRects().length > 0,
        tabLabel: (document.querySelector('[data-tab-strip] [aria-selected="true"] .kv-tab__label') || {}).textContent || null
      };
      return r;
    })()`);
    console.log('kart tiklama:', JSON.stringify(step1));
    console.log('detay:', await s.shot('t196-2-detail'));

    /* 2) geri düğmesi */
    const step2 = await s.eval(`(async () => {
      const sec = document.querySelector('[data-screen="integrations"]');
      sec.querySelector('[data-action="integration-back"]').click();
      await new Promise((r) => setTimeout(r, 800));
      return { view: sec.querySelector('.kv-integrations').getAttribute('data-integrations-view'),
               headHidden: sec.querySelector('[data-integration-detail]').hidden,
               catalogVisible: sec.querySelector('[data-integrations-block="b1"]').getClientRects().length > 0,
               address: (document.querySelector('[data-field="nav-address"]') || {}).value };
    })()`);
    console.log('geri dugmesi:', JSON.stringify(step2));

    /* 3) Esc ile geri */
    const step3 = await s.eval(`(async () => {
      const sec = document.querySelector('[data-screen="integrations"]');
      sec.querySelector('[data-integration-catalog] [data-action="integration-pick"]').click();
      await new Promise((r) => setTimeout(r, 700));
      const inDetail = sec.querySelector('.kv-integrations').getAttribute('data-integrations-view');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 700));
      return { inDetail, afterEsc: sec.querySelector('.kv-integrations').getAttribute('data-integrations-view') };
    })()`);
    console.log('Esc:', JSON.stringify(step3));

    /* 4) adres çubuğundan doğrudan detay */
    const step4 = await s.eval(`(async () => {
      const sec = document.querySelector('[data-screen="integrations"]');
      const addr = document.querySelector('[data-field="nav-address"]');
      addr.focus();
      addr.value = 'kv://integrations/slack';
      document.querySelector('[data-nav-form]').requestSubmit();
      await new Promise((r) => setTimeout(r, 900));
      return { view: sec.querySelector('.kv-integrations').getAttribute('data-integrations-view'),
               title: String(sec.querySelector('[data-field="integration-detail-title"]').textContent || '').trim(),
               addr: addr.value };
    })()`);
    console.log('adres:', JSON.stringify(step4));
    console.log('detay slack:', await s.shot('t196-3-slack'));

    console.log('exception:', exc.length, exc.slice(0, 3));
  } finally { try { proc.kill(); } catch { /* yok */ } }
})().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
