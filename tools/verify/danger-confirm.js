'use strict';
/*
 * Yıkıcı eylemler onay ister — uçtan uca (T-186).
 *
 * Proje arşivi, anahtar kaldırma, beceri silme ve komut geçmişi temizleme tek
 * tıkla çalışıyordu. Bu kapı gerçek uygulamada, **yazma yapmadan** ölçer:
 *   1) Anahtar kaldırma, beceri silme ve geçmiş temizleme bir onay diyaloğu açar.
 *   2) Odak güvenli seçenektedir ("Vazgeç"), yani Enter yanlışlıkla silmez.
 *   3) "Vazgeç" / Esc diyaloğu kapatır; kart, anahtar, beceri ve geçmiş sayısı
 *      aynı kalır (hiçbir yazma olmadı).
 *   4) Komut geçmişi onayı iptal edilince geçmiş listesi geri gelir.
 *   5) exception / konsol hatası yok.
 *
 * Proje arşivi bu profilde ölçülemez: tek proje aktif ve arşiv düğmesi bilinçli
 * olarak devre dışı. O yol `tests/tur14/danger-confirm.test.js` ile kaynak
 * düzeyinde kilitlidir (aynı `confirmDanger` yardımcısına bağlı).
 *
 * Kullanım: node tools/verify/danger-confirm.js   (çıkış 0 = geçti)
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

const DIALOG = `(() => {
  const dialog = document.querySelector('[data-modal-root] .kv-modal');
  const active = document.activeElement || {};
  const confirmBtn = dialog ? dialog.querySelector('[data-danger-confirm]') : null;
  const cancelBtn = dialog ? dialog.querySelector('[data-danger-cancel]') : null;
  return {
    open: Boolean(dialog),
    title: dialog ? (dialog.querySelector('.kv-modal__title') || {}).textContent || '' : '',
    confirmLabel: confirmBtn ? confirmBtn.textContent.trim() : '',
    cancelLabel: cancelBtn ? cancelBtn.textContent.trim() : '',
    focusIsCancel: Boolean(cancelBtn && active === cancelBtn),
    focusIsConfirm: Boolean(confirmBtn && active === confirmBtn),
    activeTag: active.tagName || ''
  };
})()`;

const COUNT = (container, sel) => `(() => {
  const root = document.querySelector(${JSON.stringify(container)});
  return root ? root.querySelectorAll(${JSON.stringify(sel)}).length : -1;
})()`;

const HISTORY_RAW = `(() => localStorage.getItem('kv.cmdHistory'))()`;

const CLICK = (sel) => `(() => {
  const n = document.querySelector(${JSON.stringify(sel)});
  if (!n) return false;
  n.click();
  return true;
})()`;

const NAV = (screen) => `(() => { const n = document.querySelector('[data-nav-item="${screen}"]'); if (!n) return false; n.click(); return true; })()`;
const ACTION = (name) => CLICK(`[data-action="${name}"]`);

const CANCEL = `(() => {
  const b = document.querySelector('[data-modal-root] [data-danger-cancel]');
  if (!b) return false;
  b.click();
  return true;
})()`;

const ESC = async (s) => {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
};

(async () => {
  PORT = await resolvePort('KV_DANGER_CDP_PORT');
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

    /* Geçmiş için tohum (yalnız localStorage). */
    await s.eval(`(() => { localStorage.setItem('kv.cmdHistory', JSON.stringify(['hedefi özetle', 'kapıları koş'])); return true; })()`);

    /* --- 1) Anahtar kaldırma --- */
    await s.eval(NAV('providers'));
    await SLEEP(1000);
    const keysBefore = await s.eval(COUNT('[data-provider-grid]', '[data-key-remove]'));
    const providersBefore = await s.eval(COUNT('[data-provider-grid]', '[data-provider]'));
    const keyClicked = await s.eval(CLICK('[data-key-remove]'));
    await SLEEP(500);
    const keyDialog = await s.eval(DIALOG);
    await ESC(s);
    await SLEEP(500);
    const keysAfterEsc = await s.eval(COUNT('[data-provider-grid]', '[data-key-remove]'));

    /* --- 2) Beceri silme --- */
    await s.eval(NAV('settings'));
    await SLEEP(1300);
    const skillsBefore = await s.eval(COUNT('[data-screen="settings"]', '[data-skill-remove]'));
    const skillClicked = await s.eval(CLICK('[data-skill-remove]'));
    await SLEEP(500);
    const skillDialog = await s.eval(DIALOG);
    await s.eval(CANCEL);
    await SLEEP(500);
    const skillsAfterCancel = await s.eval(COUNT('[data-screen="settings"]', '[data-skill-remove]'));

    /* --- 3) Komut geçmişi temizleme --- */
    await s.eval(NAV('command'));
    await SLEEP(1000);
    const historyRawBefore = await s.eval(HISTORY_RAW);
    await s.eval(ACTION('command-history'));
    await SLEEP(600);
    const historyOpen = await s.eval(DIALOG);
    const clearClicked = await s.eval(`(() => {
      const d = document.querySelector('[data-modal-root] .kv-modal');
      if (!d) return false;
      const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Temizle');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    await SLEEP(600);
    const historyConfirm = await s.eval(DIALOG);
    await s.eval(CANCEL);
    await SLEEP(600);
    const historyRestored = await s.eval(DIALOG);
    const historyItems = await s.eval(`(() => document.querySelectorAll('.kv-history__item').length)()`);
    const historyRawAfter = await s.eval(HISTORY_RAW);
    await ESC(s);
    await SLEEP(400);

    /* --- 4) Hiçbir yazma olmadı doğrula (ekranları yeniden gez). --- */
    await s.eval(NAV('providers'));
    await SLEEP(900);
    const keysEnd = await s.eval(COUNT('[data-provider-grid]', '[data-key-remove]'));
    const providersEnd = await s.eval(COUNT('[data-provider-grid]', '[data-provider]'));
    await s.eval(NAV('settings'));
    await SLEEP(1100);
    const skillsEnd = await s.eval(COUNT('[data-screen="settings"]', '[data-skill-remove]'));

    const report = {
      providers: { before: providersBefore, end: providersEnd },
      keys: { before: keysBefore, afterEsc: keysAfterEsc, end: keysEnd, dialog: keyDialog, clicked: keyClicked },
      skills: { before: skillsBefore, afterCancel: skillsAfterCancel, end: skillsEnd, dialog: skillDialog, clicked: skillClicked },
      history: {
        open: historyOpen, clearClicked, confirm: historyConfirm, restored: historyRestored,
        items: historyItems, rawSame: historyRawBefore === historyRawAfter
      },
      exceptions: exc.length,
      consoleErrors: errs
    };
    console.log(JSON.stringify(report, null, 1));

    const okFor = (d) => d.open === true && d.title.length > 0
      && d.confirmLabel.length > 0 && d.cancelLabel === 'Vazgeç'
      && d.focusIsCancel === true && d.focusIsConfirm === false;

    const ok = keyClicked === true && okFor(keyDialog)
      && keysBefore > 0 && keysAfterEsc === keysBefore && keysEnd === keysBefore
      && skillClicked === true && okFor(skillDialog)
      && skillsBefore > 0 && skillsAfterCancel === skillsBefore && skillsEnd === skillsBefore
      && historyOpen.open === true && clearClicked === true && okFor(historyConfirm)
      && historyRestored.open === true && historyItems === 2 && report.history.rawSame === true
      && providersEnd === providersBefore
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'TEHLIKELI EYLEM ONAYI: GECTI' : 'TEHLIKELI EYLEM ONAYI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
