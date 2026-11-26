'use strict';
/*
 * Ekran değişiminde odak ve duyuru — uçtan uca (T-178).
 *
 * Klavye/ekran okuyucu kullanıcısı yeni ekrana geçtiğinde odağın nerede
 * olduğunu ve ne açıldığını bilmeli. Bu kapı gerçek uygulamada ölçer:
 *   1) Menüden Pano'ya geçince odak ekran başlığındadır (nav düğmesinde değil).
 *   2) Başlık metni "Görev Panosu".
 *   3) Görünmez canlı bölge "Görev Panosu ekranı açıldı" der.
 *   4) Ctrl+2 ile Ekip'e dönünce odak yine başlıkta ve duyuru "Ekip".
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/screen-focus.js   (çıkış 0 = geçti)
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
  const live = document.querySelector('[data-field="screen-live"]');
  const title = document.querySelector('[data-screen-title]');
  return {
    activeId: a.id || a.getAttribute && a.getAttribute('data-nav-item') || a.tagName,
    activeTag: a.tagName || '',
    title: title ? title.textContent : '',
    live: live ? live.textContent : '',
    openScreens: [...document.querySelectorAll('[data-screen]')].filter((s) => !s.hidden).map((s) => s.getAttribute('data-screen'))
  };
})()`;

(async () => {
  PORT = await resolvePort('KV_FOCUS_CDP_PORT');
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

    await s.eval(`(() => { document.querySelector('[data-nav-item="board"]').click(); return true; })()`);
    await SLEEP(600);
    const board = await s.eval(SNAP);

    await s.eval(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }));
      return true;
    })()`);
    await SLEEP(700);
    const team = await s.eval(SNAP);

    /* Başlık odaktayken Tab, ekran içeriğine geçmeli (odak tuzağı yok). */
    await s.eval(`(() => { document.querySelector('[data-screen-title]').focus(); return true; })()`);
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }).catch(() => {});
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }).catch(() => {});
    await SLEEP(300);
    const afterTab = await s.eval(SNAP);

    const report = { board, team, afterTab, exceptions: exc.length, consoleErrors: errs };
    console.log(JSON.stringify(report, null, 1));

    const ok = board.activeId === 'screen-title' && board.activeTag === 'H1'
      && board.title === 'Görev Panosu' && /Görev Panosu ekranı açıldı/.test(board.live)
      && board.openScreens.length === 1 && board.openScreens[0] === 'board'
      && team.activeId === 'screen-title' && team.title === 'Ekip' && /Ekip ekranı açıldı/.test(team.live)
      && afterTab.activeTag !== 'H1'
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'EKRAN ODAGI: GECTI' : 'EKRAN ODAGI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
