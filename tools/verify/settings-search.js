'use strict';
/*
 * Ayarlarda arama — uçtan uca (T-176).
 *
 * Kullanıcı "tema nerede?" diye 7 kartı kaydırmak zorunda kalmamalı.
 * Bu kapı gerçek uygulamada ölçer:
 *   1) Ayarlar açıkken 8 bölüm de görünür.
 *   2) "tema" yazınca yalnız Görünüm bölümü kalır ve sayaç "1 bölüm eşleşti" der.
 *   3) Eşleşmeyen aramada hiç bölüm kalmaz, "Eşleşen ayar yok" görünür.
 *   4) Esc aramayı temizler, 8 bölüm geri gelir.
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/settings-search.js   (çıkış 0 = geçti)
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
  const cards = [...document.querySelectorAll('[data-settings-section]')];
  return {
    sections: cards.length,
    visible: cards.filter((c) => !c.hidden).map((c) => c.getAttribute('data-settings-section')),
    count: (document.querySelector('[data-field="settings-search-count"]') || {}).textContent || '',
    empty: !(document.querySelector('[data-field="settings-search-empty"]') || {}).hidden,
    value: (document.querySelector('[data-field="settings-search"]') || {}).value || ''
  };
})()`;

(async () => {
  PORT = await resolvePort('KV_SETTINGS_CDP_PORT');
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
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(String(m.params.entry.text).slice(0, 200));
    });
    await SLEEP(3500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(900);
    await s.eval(`(() => { const b = document.querySelector('[data-nav-item="settings"]'); if (b) b.click(); return true; })()`);
    await SLEEP(900);

    const before = await s.eval(SNAP);

    const type = (text) => s.eval(`(() => {
      const i = document.querySelector('[data-field="settings-search"]');
      if (!i) return false;
      i.value = ${JSON.stringify(text)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);

    await type('tema');
    await SLEEP(300);
    const tema = await s.eval(SNAP);

    await type('zzzz');
    await SLEEP(300);
    const none = await s.eval(SNAP);

    await s.eval(`(() => {
      const i = document.querySelector('[data-field="settings-search"]');
      if (!i) return false;
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`);
    await SLEEP(300);
    const cleared = await s.eval(SNAP);

    const report = { before, tema, none, cleared, exceptions: exc.length, consoleErrors: errs.length };
    console.log(JSON.stringify(report, null, 1));

    const ok = before.sections === 8 && before.visible.length === 8
      && tema.visible.length === 1 && tema.visible[0] === 'appearance'
      && /1 bölüm eşleşti/.test(tema.count) && tema.empty === false
      && none.visible.length === 0 && none.empty === true
      && cleared.visible.length === 8 && cleared.value === '' && cleared.count === ''
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'AYAR ARAMA: GECTI' : 'AYAR ARAMA: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
