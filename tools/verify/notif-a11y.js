'use strict';
/*
 * Bildirim merkezi ve toast'lar erişilebilir — uçtan uca (T-185).
 *
 * Panel düğmesi ne açık olduğunu duyuruyordu ne de odak yönetiyordu; toast'lar
 * kendiliğinden kayboluyor, ekran okuyucuya hiçbir şey söylemiyordu. Bu kapı
 * gerçek uygulamada ölçer:
 *   1) Düğme: aria-expanded=false, aria-controls=kv-notifications, adı "Bildirimler".
 *   2) Tıkla: panel görünür, aria-expanded=true, odak panelin içinde.
 *   3) Esc: panel gizlenir, aria-expanded=false, odak düğmeye döner.
 *   4) Ekip → Yenile: toast role=status, kapat düğmesi var, tıklayınca kaybolur.
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/notif-a11y.js   (çıkış 0 = geçti)
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

const PANEL = `(() => {
  const panel = document.querySelector('[data-notifications]');
  const toggle = document.querySelector('[data-action="toggle-notifications"]');
  const active = document.activeElement || {};
  return {
    hidden: panel ? panel.hidden : null,
    expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    controls: toggle ? toggle.getAttribute('aria-controls') : null,
    label: toggle ? toggle.getAttribute('aria-label') : null,
    role: panel ? panel.getAttribute('role') : null,
    activeInPanel: Boolean(panel && active && panel.contains(active)),
    activeAction: active && active.getAttribute ? (active.getAttribute('data-action') || '') : '',
    activeTag: active.tagName || ''
  };
})()`;

const TOAST = `(() => {
  const t = document.querySelectorAll('[data-toast]');
  const last = t[t.length - 1] || null;
  const close = last ? last.querySelector('.kv-toast__close') : null;
  return {
    count: t.length,
    role: last ? last.getAttribute('role') : '',
    text: last ? (last.querySelector('.kv-toast__text') || {}).textContent || '' : '',
    closeLabel: close ? close.getAttribute('aria-label') : '',
    hasClose: Boolean(close)
  };
})()`;

(async () => {
  PORT = await resolvePort('KV_NOTIF_CDP_PORT');
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

    const closed = await s.eval(PANEL);

    /* Aç: düğmeye gerçek tıklama. */
    await s.eval(`(() => { const b = document.querySelector('[data-action="toggle-notifications"]'); b.focus(); b.click(); return true; })()`);
    await SLEEP(500);
    const opened = await s.eval(PANEL);

    /* Esc ile kapat. */
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await SLEEP(500);
    const dismissed = await s.eval(PANEL);

    /* Toast: Ekip → Yenile (salt okuma) bir başarı toast'ı üretir. */
    await s.eval(`(() => { const n = document.querySelector('[data-nav-item="team"]'); if (n) n.click(); return Boolean(n); })()`);
    await SLEEP(900);
    const beforeToast = await s.eval(TOAST);
    await s.eval(`(() => { const b = document.querySelector('[data-action="team-refresh"]'); if (!b) return false; b.click(); return true; })()`);
    await SLEEP(1400);
    const toast = await s.eval(TOAST);

    /* Kapat düğmesine bas. */
    await s.eval(`(() => { const b = document.querySelector('.kv-toast__close'); if (!b) return false; b.click(); return true; })()`);
    await SLEEP(400);
    const afterClose = await s.eval(TOAST);

    const report = { closed, opened, dismissed, beforeToast, toast, afterClose, exceptions: exc.length, consoleErrors: errs };
    console.log(JSON.stringify(report, null, 1));

    const ok = closed.hidden === true && closed.expanded === 'false'
      && closed.controls === 'kv-notifications' && closed.label.startsWith('Bildirimler')
      && closed.role === 'region'
      && opened.hidden === false && opened.expanded === 'true' && opened.activeInPanel === true
      && dismissed.hidden === true && dismissed.expanded === 'false'
      && dismissed.activeAction === 'toggle-notifications'
      && toast.count > beforeToast.count && toast.role === 'status' && toast.text.length > 0
      && toast.hasClose === true && toast.closeLabel === 'Bildirimi kapat'
      && afterClose.count === beforeToast.count
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'BILDIRIM ERISILEBILIRLIGI: GECTI' : 'BILDIRIM ERISILEBILIRLIGI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
