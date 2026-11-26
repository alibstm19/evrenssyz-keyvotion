'use strict';
/*
 * Canlı tur kapanış kapısı — "tur bitince beyaz ekran" regresyonu.
 *
 * Kullanıcı şikâyeti: rehberi/turu bitirince uygulama donuyor, beyaz ekran
 * kalıyor. Kök neden tur kökünün `[data-tour]` ile seçilmesi ve tur açıkken
 * `<html data-tour="on">` olmasıydı → `close()` bütün belgeyi gizliyordu.
 *
 * Bu kapı uygulamayı gerçekten açar, turu başlatır, 10 adımı tıklar, "Bitir"e
 * basar ve ölçer:
 *   - documentElement gizli DEĞİL, görünür bir ekran var
 *   - tur kökü kapandı
 *   - exception / konsol hatası yok
 *
 * Kullanım: node tools/verify/tour-close.js   (çıkış 0 = geçti)
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

const STATE = `(() => {
  const root = document.querySelector('.kv-tour');
  const open = [...document.querySelectorAll('[data-screen]')].filter((s) => !s.hidden);
  return {
    htmlHidden: document.documentElement.hidden,
    htmlDisplay: getComputedStyle(document.documentElement).display,
    tourHidden: root ? root.hidden : 'yok',
    tourAttr: document.documentElement.getAttribute('data-tour-active'),
    openScreens: open.map((s) => s.getAttribute('data-screen')),
    bodyText: (document.body.innerText || '').trim().length
  };
})()`;

(async () => {
  PORT = await resolvePort('KV_TOUR_CDP_PORT');
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
    await s.send('Page.enable'); await s.send('Runtime.enable'); await s.send('Log.enable').catch(() => {});
    s.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.text).slice(0, 200));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console');
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(String(m.params.entry.text).slice(0, 200));
    });
    await SLEEP(3500);
    /* İlk kurulum paneli varsa atla (tur düğmesi panelin altında kalmasın). */
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(900);

    const start = await s.eval(`(() => {
      const b = document.querySelector('[data-action="tour-start"]');
      if (!b) return { ok: false, reason: 'tur düğmesi yok' };
      b.click();
      return { ok: true };
    })()`);
    await SLEEP(900);

    const steps = [];
    for (let i = 0; i < 14; i += 1) {
      const info = await s.eval(`(() => {
        const n = document.querySelector('[data-action="tour-next"]');
        const root = document.querySelector('.kv-tour');
        return {
          label: n ? n.textContent : null,
          step: (document.querySelector('[data-field="tour-step"]') || {}).textContent || '',
          closed: root ? root.hidden : true
        };
      })()`);
      steps.push(info);
      if (!info || info.closed || !info.label) break;
      await s.eval(`(() => { const n = document.querySelector('[data-action="tour-next"]'); if (n) n.click(); return true; })()`);
      await SLEEP(850);
    }
    await SLEEP(1500);

    const after = await s.eval(STATE);
    const report = {
      start,
      visitedSteps: steps.length,
      lastStep: steps[steps.length - 1] || null,
      after,
      exceptions: exc.length,
      consoleErrors: errs.length
    };
    console.log(JSON.stringify(report, null, 1));

    const ok = Boolean(start && start.ok)
      && steps.length >= 10
      && Boolean(after)
      && after.htmlHidden === false
      && after.htmlDisplay !== 'none'
      && after.tourHidden === true
      && after.tourAttr === null
      && after.openScreens.length >= 1
      && after.bodyText > 200
      && exc.length === 0
      && errs.length === 0;

    console.log(ok ? 'TUR KAPANISI: GECTI' : 'TUR KAPANISI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
