'use strict';
/*
 * "İçeriğe atla" bağlantısı — uçtan uca (T-180).
 *
 * Menü 23 ekran düğmesi taşıyor; klavye kullanıcısı her seferinde hepsini
 * sekmeyle geçmek zorunda kalmamalı. Bu kapı gerçek uygulamada ölçer:
 *   1) Sayfadaki ilk Tab "İçeriğe atla" bağlantısına gider ve bağlantı görünür.
 *   2) Enter içeriği (main) odaklar; bağlantı yine gizlenir.
 *   3) main odaktayken Tab ekran içeriğine geçer (odak tuzağı yok).
 *   4) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/skip-link.js   (çıkış 0 = geçti)
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

const SNAP = `(() => {
  const a = document.activeElement || {};
  const skip = document.querySelector('[data-field="skip-link"]');
  const box = skip ? skip.getBoundingClientRect() : null;
  return {
    tag: a.tagName || '',
    field: a.getAttribute ? (a.getAttribute('data-field') || '') : '',
    id: a.id || '',
    skipVisible: Boolean(box && box.top >= 0 && box.height > 0),
    skipText: skip ? skip.textContent : ''
  };
})()`;

const TAB = async (s, shift) => {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
};

const ENTER = async (s) => {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await s.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
};

(async () => {
  PORT = await resolvePort('KV_SKIP_CDP_PORT');
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

    /* Odak akışını baştan al: gövdeye dön, ilk Tab at. */
    await s.eval(`(() => { if (document.activeElement) document.activeElement.blur(); document.body.focus(); return true; })()`);
    await SLEEP(200);
    await TAB(s);
    await SLEEP(400);
    const first = await s.eval(SNAP);

    await ENTER(s);
    await SLEEP(500);
    const afterEnter = await s.eval(SNAP);

    await TAB(s);
    await SLEEP(400);
    const afterTab = await s.eval(SNAP);

    const report = { first, afterEnter, afterTab, exceptions: exc.length, consoleErrors: errs };
    console.log(JSON.stringify(report, null, 1));

    const ok = first.field === 'skip-link' && first.tag === 'A' && first.skipVisible === true
      && /İçeriğe atla/.test(first.skipText)
      && afterEnter.tag === 'MAIN' && afterEnter.id === 'kv-main' && afterEnter.skipVisible === false
      && afterTab.tag !== 'MAIN' && afterTab.field !== 'skip-link'
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'ICERIGE ATLA: GECTI' : 'ICERIGE ATLA: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
