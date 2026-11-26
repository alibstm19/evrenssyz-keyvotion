'use strict';
/*
 * Boş durumlar sonraki adımı önerir — uçtan uca (T-183).
 *
 * "Filtreye uyan görev yok." çıkmaz sokaktı: ne yapılacağını söylemiyordu.
 * Bu kapı gerçek uygulamada, verili bir profilde ölçer:
 *   1) Ekip "zzzz" süzgeci → boş durum + "Filtreyi temizle" düğmesi.
 *   2) Düğme kutuyu VE listeyi eski hâline getirir (kart sayısı aynı, kutu boş).
 *   3) Pano "zzzz" süzgeci → aynı davranış.
 *   4) Raporlar görev süzgeci "zzzz" → aynı davranış.
 *   5) exception / konsol hatası yok.
 *
 * Veri gerektiren ekranlar (hafıza/projeler/sağlayıcılar) boşken eylem düğmesi
 * `tests/tur14/empty-actions.test.js` ile kaynak düzeyinde kilitlidir.
 *
 * Kullanım: node tools/verify/empty-actions.js   (çıkış 0 = geçti)
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

/* Kapsayıcının boş durumunu ve gerçek içerik sayısını okur. */
const PROBE = (container, countSel) => `(() => {
  const root = document.querySelector(${JSON.stringify(container)});
  const btn = root ? root.querySelector('[data-empty-action]') : null;
  return {
    hasEmpty: Boolean(root && root.querySelector('.kv-empty--action')),
    label: btn ? btn.textContent.trim() : '',
    content: root ? root.querySelectorAll(${JSON.stringify(countSel)}).length : -1
  };
})()`;

const SET_FILTER = (sel, value) => `(() => {
  const i = document.querySelector(${JSON.stringify(sel)});
  if (!i) return false;
  i.value = ${JSON.stringify(value)};
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

const CLICK_EMPTY = (container) => `(() => {
  const root = document.querySelector(${JSON.stringify(container)});
  const btn = root ? root.querySelector('[data-empty-action]') : null;
  if (!btn) return false;
  btn.click();
  return true;
})()`;

const INPUT_VALUE = (sel) => `(() => { const i = document.querySelector(${JSON.stringify(sel)}); return i ? i.value : null; })()`;

(async () => {
  PORT = await resolvePort('KV_EMPTY_CDP_PORT');
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
    await SLEEP(1000);

    /* 1-2) Ekip. */
    await s.eval(`(() => { document.querySelector('[data-nav-item="team"]').click(); return true; })()`);
    await SLEEP(800);
    const teamBefore = await s.eval(PROBE('[data-team-grid]', '[data-role-card]'));
    await s.eval(SET_FILTER('[data-field="team-filter"]', 'zzzz'));
    await SLEEP(500);
    const teamEmpty = await s.eval(PROBE('[data-team-grid]', '[data-role-card]'));
    await s.eval(CLICK_EMPTY('[data-team-grid]'));
    await SLEEP(700);
    const teamAfter = await s.eval(PROBE('[data-team-grid]', '[data-role-card]'));
    const teamInput = await s.eval(INPUT_VALUE('[data-field="team-filter"]'));

    /* 3) Pano. */
    await s.eval(`(() => { document.querySelector('[data-nav-item="board"]').click(); return true; })()`);
    await SLEEP(1100);
    const boardBefore = await s.eval(PROBE('[data-board-root]', '[data-task]'));
    await s.eval(SET_FILTER('[data-field="board-filter"]', 'zzzz'));
    await SLEEP(600);
    const boardEmpty = await s.eval(PROBE('[data-board-root]', '[data-task]'));
    await s.eval(CLICK_EMPTY('[data-board-root]'));
    await SLEEP(700);
    const boardAfter = await s.eval(PROBE('[data-board-root]', '[data-task]'));
    const boardInput = await s.eval(INPUT_VALUE('[data-field="board-filter"]'));

    /* 4) Raporlar. */
    await s.eval(`(() => { document.querySelector('[data-nav-item="reports"]').click(); return true; })()`);
    await SLEEP(1200);
    const reportsBefore = await s.eval(PROBE('[data-report-list]', '[data-report]'));
    await s.eval(SET_FILTER('[data-field="report-task"]', 'zzzz'));
    await SLEEP(600);
    const reportsEmpty = await s.eval(PROBE('[data-report-list]', '[data-report]'));
    await s.eval(CLICK_EMPTY('[data-report-list]'));
    await SLEEP(700);
    const reportsAfter = await s.eval(PROBE('[data-report-list]', '[data-report]'));
    const reportsInput = await s.eval(INPUT_VALUE('[data-field="report-task"]'));

    const report = {
      team: { before: teamBefore, empty: teamEmpty, after: teamAfter, input: teamInput },
      board: { before: boardBefore, empty: boardEmpty, after: boardAfter, input: boardInput },
      reports: { before: reportsBefore, empty: reportsEmpty, after: reportsAfter, input: reportsInput },
      exceptions: exc.length,
      consoleErrors: errs
    };
    console.log(JSON.stringify(report, null, 1));

    const emptyOk = (before, empty, after, input) => before.content > 0
      && empty.hasEmpty === true && empty.label === 'Filtreyi temizle' && empty.content === 0
      && after.hasEmpty === false && after.content === before.content && input === '';

    const ok = emptyOk(teamBefore, teamEmpty, teamAfter, teamInput)
      && emptyOk(boardBefore, boardEmpty, boardAfter, boardInput)
      && emptyOk(reportsBefore, reportsEmpty, reportsAfter, reportsInput)
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'BOS DURUM EYLEMI: GECTI' : 'BOS DURUM EYLEMI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
