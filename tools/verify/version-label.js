'use strict';
/*
 * Durum çubuğu sürüm etiketi — uçtan uca (T-181).
 *
 * Etiket elle yazılmıştı ve `v0.2.0` kalmıştı; ürünün sürümü başka. Bu kapı
 * gerçek uygulamada ölçer:
 *   1) Durum çubuğundaki `[data-field="status-version"]` metni paket sürümüdür.
 *   2) Uzun metin değil, `v<major>.<minor>.<patch>` biçimindedir.
 *   3) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/version-label.js   (çıkış 0 = geçti)
 */
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PKG = require(path.join(ROOT, 'src', 'package.json'));
const { resolvePort } = require('./lib/cdp');
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

(async () => {
  PORT = await resolvePort('KV_VERSION_CDP_PORT');
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`], { cwd: path.join(ROOT, 'src'), stdio: 'ignore' });
  const exc = [];
  const errs = [];
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
    await s.send('Log.enable').catch(() => {});
    s.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.text).slice(0, 200));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        const text = String(m.params.entry.text);
        if (!/frame-ancestors/.test(text)) errs.push(text.slice(0, 200));
      }
    });
    await SLEEP(3500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(1200);

    /* Birkaç ekran gezinerek etiketin her yerde aynı kaldığını gör. */
    const read = () => s.eval(`(() => {
      const el = document.querySelector('[data-field="status-version"]');
      return el ? el.textContent.trim() : null;
    })()`);
    const team = await read();
    await s.eval(`(() => { document.querySelector('[data-nav-item="board"]').click(); return true; })()`);
    await SLEEP(600);
    const board = await read();
    await s.eval(`(() => { document.querySelector('[data-nav-item="settings"]').click(); return true; })()`);
    await SLEEP(600);
    const settings = await read();

    const expected = `v${PKG.version}`;
    const report = { expected, team, board, settings, exceptions: exc.length, consoleErrors: errs };
    console.log(JSON.stringify(report, null, 1));

    const ok = team === expected && board === expected && settings === expected
      && /^v\d+\.\d+\.\d+$/.test(String(team))
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'SURUM ETIKETI: GECTI' : 'SURUM ETIKETI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
