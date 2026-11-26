'use strict';
/*
 * Modal açıkken arka plan erişilemez — uçtan uca (T-184).
 *
 * Tab tuzağı yalnız klavyeyi kapsıyordu; fare ve ekran okuyucu sanal imleci
 * arkadaki düğmelere ulaşabiliyordu. Bu kapı gerçek uygulamada ölçer:
 *   1) Pano → "+ Görev ekle": diyalog açılır, odak içine girer.
 *   2) Kabuk katmanları `inert` olur; modal/bildirim/çökme katmanları olmaz.
 *   3) 14 Tab + 1 Shift+Tab odak diyaloğun dışına çıkmaz.
 *   4) Esc: diyalog kapanır, `inert` temizlenir, odak açan düğmeye döner.
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/modal-inert.js   (çıkış 0 = geçti)
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

const PROBE = `(() => {
  const app = document.querySelector('[data-app]');
  const dialog = document.querySelector('[data-modal-root] .kv-modal');
  const active = document.activeElement;
  const kids = app ? [...app.children] : [];
  return {
    dialog: Boolean(dialog),
    role: dialog ? dialog.getAttribute('role') : '',
    ariaModal: dialog ? dialog.getAttribute('aria-modal') : '',
    activeInside: Boolean(dialog && active && dialog.contains(active)),
    activeTag: active ? active.tagName : '',
    activeAction: active && active.getAttribute ? (active.getAttribute('data-action') || '') : '',
    appInert: Boolean(app && app.hasAttribute('inert')),
    inertCount: kids.filter((k) => k.hasAttribute('inert')).length,
    exemptInert: kids.filter((k) => k.matches('[data-modal-root],[data-toast-root],[data-crash-root]') && k.hasAttribute('inert')).length,
    inertTag: (kids.find((k) => k.hasAttribute('inert')) || { tagName: '' }).tagName
  };
})()`;

const TAB = async (s, shift) => {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
  await SLEEP(40);
};

(async () => {
  PORT = await resolvePort('KV_MODAL_CDP_PORT');
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

    /* Pano ekranına git ve "Görev ekle" diyaloğunu aç. */
    await s.eval(`(() => { const n = document.querySelector('[data-nav-item="board"]'); if (n) n.click(); return Boolean(n); })()`);
    await SLEEP(1100);
    await s.eval(`(() => { const b = document.querySelector('[data-action="board-add"]'); if (!b) return false; b.focus(); b.click(); return true; })()`);
    await SLEEP(700);

    const open = await s.eval(PROBE);
    const outside = [];
    for (let i = 0; i < 14; i += 1) {
      await TAB(s, false);
      const p = await s.eval(PROBE);
      if (!p.activeInside) outside.push(`${i + 1}:${p.activeTag}${p.activeAction ? '[' + p.activeAction + ']' : ''}`);
    }
    await TAB(s, true);
    const afterShift = await s.eval(PROBE);
    if (!afterShift.activeInside) outside.push(`shift:${afterShift.activeTag}`);

    /* Esc ile kapat. */
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await SLEEP(700);
    const closed = await s.eval(PROBE);

    const report = { open, outside, afterShift, closed, exceptions: exc.length, consoleErrors: errs };
    console.log(JSON.stringify(report, null, 1));

    const ok = open.dialog === true && open.role === 'dialog' && open.ariaModal === 'true'
      && open.activeInside === true
      && open.appInert === false && open.inertCount >= 2 && open.exemptInert === 0
      && outside.length === 0
      && closed.dialog === false && closed.inertCount === 0
      && closed.activeAction === 'board-add'
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'MODAL INERT: GECTI' : 'MODAL INERT: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
