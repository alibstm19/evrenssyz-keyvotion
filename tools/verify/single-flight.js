'use strict';
/*
 * Tek uçuş: çift tıklama tek iş üretir — uçtan uca (T-187).
 *
 * Yazma/uzun eylemler çift tıklandığında iki kez koşuyordu. Bu kapı gerçek
 * uygulamada ölçer:
 *   1) İki senkron tıklamadan hemen sonra düğme `aria-busy="true"` + devre dışı.
 *   2) İş bitince düğme eski hâline döner (aria-busy yok, tıklanabilir).
 *   3) İki tık **tek** sonuç üretir: tek "Yenilendi" toast'ı, tek "Ayarlar kaydedildi".
 *   4) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/single-flight.js   (çıkış 0 = geçti)
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
    if (r.result && r.result.exceptionDetails) {
      const ex = r.result.exceptionDetails.exception;
      return { __err: String((ex && (ex.description || ex.value)) || r.result.exceptionDetails.text).slice(0, 300) };
    }
    return r.result && r.result.result ? r.result.result.value : null;
  }
}

const BUTTON = (sel) => `(() => {
  const b = document.querySelector(${JSON.stringify(sel)});
  return b ? {
    busy: b.getAttribute('aria-busy'),
    disabled: Boolean(b.disabled),
    marked: b.hasAttribute('data-busy')
  } : null;
})()`;

/* İki tıkı aynı görevde at, hemen ardından düğme durumunu oku. */
const DOUBLE_CLICK = (sel) => `(() => {
  const b = document.querySelector(${JSON.stringify(sel)});
  if (!b) return { clicked: false };
  b.click();
  b.click();
  return {
    clicked: true,
    busy: b.getAttribute('aria-busy'),
    disabled: Boolean(b.disabled),
    marked: b.hasAttribute('data-busy')
  };
})()`;

const TOASTS = (text) => `(() => {
  const all = [...document.querySelectorAll('[data-toast]')];
  return {
    total: all.length,
    matching: all.filter((n) => ((n.querySelector('.kv-toast__text') || {}).textContent || '') === ${JSON.stringify(text)}).length
  };
})()`;

const NAV = (screen) => `(() => { const n = document.querySelector('[data-nav-item="${screen}"]'); if (!n) return false; n.click(); return true; })()`;

(async () => {
  PORT = await resolvePort('KV_FLIGHT_CDP_PORT');
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
    await SLEEP(900);

    /* 1) Ekip yenile: iki senkron tık → tek "Yenilendi". */
    await s.eval(NAV('team'));
    await SLEEP(900);
    await s.eval(`(() => { document.querySelectorAll('[data-toast]').forEach((n) => n.remove()); return true; })()`);
    const teamDouble = await s.eval(DOUBLE_CLICK('[data-action="team-refresh"]'));
    await SLEEP(1600);
    const teamToasts = await s.eval(TOASTS('Yenilendi'));
    const teamAfter = await s.eval(BUTTON('[data-action="team-refresh"]'));

    /* 2) Ayarlar kaydet (yazma): iki senkron tık → tek "Ayarlar kaydedildi". */
    await s.eval(NAV('settings'));
    await SLEEP(1200);
    await s.eval(`(() => { document.querySelectorAll('[data-toast]').forEach((n) => n.remove()); return true; })()`);
    const saveDouble = await s.eval(DOUBLE_CLICK('[data-action="settings-save"]'));
    await SLEEP(1800);
    const saveToasts = await s.eval(TOASTS('Ayarlar kaydedildi'));
    const saveAfter = await s.eval(BUTTON('[data-action="settings-save"]'));

    const report = {
      team: { double: teamDouble, toasts: teamToasts, after: teamAfter },
      save: { double: saveDouble, toasts: saveToasts, after: saveAfter },
      exceptions: exc.length,
      consoleErrors: errs
    };
    console.log(JSON.stringify(report, null, 1));

    const ok = teamDouble.clicked === true
      && teamDouble.busy === 'true' && teamDouble.disabled === true && teamDouble.marked === true
      && teamToasts.matching === 1
      && teamAfter.busy === null && teamAfter.disabled === false
      && saveDouble.clicked === true && saveDouble.busy === 'true' && saveDouble.disabled === true
      && saveToasts.matching === 1
      && saveAfter.busy === null && saveAfter.disabled === false
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'TEK UCUS: GECTI' : 'TEK UCUS: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
