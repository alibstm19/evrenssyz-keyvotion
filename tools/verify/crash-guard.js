'use strict';
/*
 * Çökme kalkanı — uçtan uca (gerçek uygulama).
 *
 * Kullanıcı şikâyeti: bir hata olunca arayüz kilitleniyor/beyaz kalıyor.
 * Bu kapı sözleşmeyi kullanıcının gördüğü yerden ölçer:
 *   1) Açılışta kurtarma kartı gizli.
 *   2) Yakalanmayan bir hata fırlatılınca kart görünür, başlık + yenile düğmesi var.
 *   3) "Kapat" kartı gizler ve uygulama çalışmaya devam eder (ekran açık).
 *
 * Kullanım: node tools/verify/crash-guard.js   (çıkış 0 = geçti)
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
  const host = document.querySelector('[data-crash-root]');
  const card = host ? host.querySelector('.kv-crash') : null;
  const openScreens = [...document.querySelectorAll('[data-screen]')].filter((s) => !s.hidden).length;
  return {
    hostHidden: host ? host.hidden : 'yok',
    card: !!card,
    title: card ? (card.querySelector('.kv-crash__title') || {}).textContent || '' : '',
    buttons: card ? [...card.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
    openScreens,
    htmlHidden: document.documentElement.hidden
  };
})()`;

(async () => {
  PORT = await resolvePort('KV_CRASH_CDP_PORT');
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
    await SLEEP(900);

    const before = await s.eval(SNAP);

    /* Yakalanmayan hata: kalkan kartı çıkarmalı. */
    await s.eval(`(() => { setTimeout(() => { throw new Error('T-170 kalkan testi'); }, 0); return true; })()`);
    await SLEEP(900);
    const shown = await s.eval(SNAP);

    /* Kapat → kart gizlenir, ekran açık kalır. */
    await s.eval(`(() => {
      const host = document.querySelector('[data-crash-root]');
      const b = host ? [...host.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Kapat') : null;
      if (b) b.click();
      return true;
    })()`);
    await SLEEP(500);
    const closed = await s.eval(SNAP);

    const report = { before, shown, closed };
    console.log(JSON.stringify(report, null, 1));

    const ok = before.hostHidden === true && before.card === false
      && shown.hostHidden === false && shown.card === true
      && /hata/i.test(shown.title)
      && shown.buttons.includes('Ekranı yenile') && shown.buttons.includes('Kapat')
      && closed.hostHidden === true && closed.card === false
      && closed.openScreens >= 1 && closed.htmlHidden === false;

    console.log(ok ? 'COKME KALKANI: GECTI' : 'COKME KALKANI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
