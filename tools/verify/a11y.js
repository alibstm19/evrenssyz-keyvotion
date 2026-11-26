'use strict';
/*
 * Erişilebilirlik kapısı — 23 ekranı gerçek uygulamada gezer ve makine ile
 * ölçülebilir kuralları denetler:
 *   1) Her ekran erişilebilir bir ad taşır (`aria-labelledby` hedefi ya da
 *      içinde başlık, ya da `aria-label`).
 *   2) Görünür her düğmenin erişilebilir adı vardır (metin/aria-label/title).
 *   3) Görünür her form alanı etiketlidir.
 *   4) Her görselin `alt` niteliği vardır.
 *   5) Aynı `id` iki kez kullanılmaz (etiket/hedef çakışması).
 *
 * Kullanım: node tools/verify/a11y.js   (çıkış 0 = geçti)
 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolvePort } = require('./lib/cdp');

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
    return r.result && r.result.result ? r.result.result.value : null;
  }
}

const SCAN = `(() => {
  const name = (n) => (n.getAttribute('aria-label') || n.getAttribute('title') || n.textContent || '').trim();
  const visible = (n) => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
  const screen = [...document.querySelectorAll('[data-screen]')].find((s) => !s.hidden);
  if (!screen) return { screen: '(yok)', error: 'açık ekran yok' };
  const id = screen.getAttribute('data-screen');
  const buttons = [];
  for (const b of screen.querySelectorAll('button, [role="button"]')) {
    if (!visible(b)) continue;
    if (!name(b)) buttons.push((b.getAttribute('data-action') || b.className || 'button').trim().slice(0, 60));
  }
  const fields = [];
  for (const f of screen.querySelectorAll('input, select, textarea')) {
    if (!visible(f)) continue;
    if ((f.getAttribute('type') || '').toLowerCase() === 'hidden') continue;
    const labelled = f.getAttribute('aria-label')
      || f.getAttribute('aria-labelledby')
      || f.getAttribute('title')
      || (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]'))
      || f.closest('label');
    if (!labelled) fields.push((f.getAttribute('data-field') || f.getAttribute('name') || f.tagName).trim());
  }
  const images = [];
  for (const img of screen.querySelectorAll('img')) {
    if (!visible(img)) continue;
    if (!img.hasAttribute('alt')) images.push((img.getAttribute('src') || '').slice(0, 60));
  }
  const byId = screen.getAttribute('aria-labelledby');
  const target = byId ? document.getElementById(byId) : null;
  const labelText = screen.getAttribute('aria-label')
    || (target && target.textContent)
    || ((screen.querySelector('h1, h2, h3') || {}).textContent)
    || '';
  return { screen: id, label: String(labelText).trim().slice(0, 60), buttons, fields, images };
})()`;

(async () => {
  PORT = await resolvePort('KV_A11Y_CDP_PORT');
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`], { cwd: path.join(ROOT, 'src'), stdio: 'ignore' });
  try {
    let page = null;
    for (let i = 0; i < 150 && !page; i += 1) {
      try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* bekle */ }
      if (!page) await SLEEP(400);
    }
    if (!page) throw new Error('CDP sayfa yok');
    const s = new S(page.webSocketDebuggerUrl);
    await s.ready;
    await s.send('Runtime.enable');
    await SLEEP(3500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(800);
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    const screens = await s.eval(`[...document.querySelectorAll('[data-nav-item]')].map((b) => b.getAttribute('data-nav-item'))`);
    const report = [];
    for (const name of screens) {
      await s.eval(`(() => { const b = document.querySelector('[data-nav-item="${name}"]'); if (b) b.click(); return true; })()`);
      await SLEEP(650);
      report.push(await s.eval(SCAN));
    }

    /* Aynı id iki kez: etiket hedefleri ve form alanları bozulur. */
    const dupIds = await s.eval(`(() => {
      const seen = new Map();
      for (const n of document.querySelectorAll('[id]')) seen.set(n.id, (seen.get(n.id) || 0) + 1);
      return [...seen.entries()].filter(([, c]) => c > 1).map(([k, c]) => k + ' x' + c);
    })()`);

    const bad = report.filter((r) => r.error || !r.label || r.buttons.length || r.fields.length || r.images.length);
    console.log(JSON.stringify({ screens: report.length, ok: report.length - bad.length, bad, dupIds }, null, 1));

    const pass = report.length === 23 && bad.length === 0 && Array.isArray(dupIds) && dupIds.length === 0;
    console.log(pass ? 'ERISILEBILIRLIK: GECTI' : 'ERISILEBILIRLIK: KALDI');
    process.exitCode = pass ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
