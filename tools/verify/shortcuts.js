'use strict';
/*
 * Klavye kısayolları — uçtan uca (T-179).
 *
 * Kısayol sayfası gerçek davranıştan kopmuştu: Ctrl+1'i "Ekip" diye yazıyor,
 * Ctrl+1..6 diyordu ama 1..9 ekran var. Bu kapı gerçek uygulamada ölçer:
 *   1) "?" sayfası açılır ve 9 ekran satırı gösterir.
 *   2) Ctrl+1 → Sohbet, Ctrl+4 → Görev Panosu, Ctrl+9 → Tarayıcı yazar.
 *   3) Esc sayfayı kapatır.
 *   4) Ctrl+3 → Komut Merkezi, Ctrl+7 → Model Merkezi gerçekten açar.
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/shortcuts.js   (çıkış 0 = geçti)
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

const PRESS = (key, extra = '') => `(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}${extra}, bubbles: true }));
  return true;
})()`;

const SNATCH = `(() => {
  const rows = [...document.querySelectorAll('[data-field="shortcut-list"] .kv-kbd-row')].map((r) => ({
    key: (r.querySelector('kbd') || {}).textContent || '',
    text: (r.querySelector('span') || {}).textContent || ''
  }));
  const title = document.querySelector('[data-screen-title]');
  return {
    open: Boolean(document.querySelector('[data-modal-root] .kv-modal__dialog')),
    modalTitle: (document.querySelector('[data-modal-root] .kv-modal__title') || {}).textContent || '',
    rows,
    screen: [...document.querySelectorAll('[data-screen]')].filter((s) => !s.hidden).map((s) => s.getAttribute('data-screen')),
    title: title ? title.textContent : ''
  };
})()`;

(async () => {
  PORT = await resolvePort('KV_SHORTCUT_CDP_PORT');
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
        /* meta etiketindeki frame-ancestors Chromium'ca yok sayılır; ürün kusuru değil. */
        if (!/frame-ancestors/.test(text)) errs.push(text.slice(0, 200));
      }
    });
    await SLEEP(3500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(900);

    /* 1-3: "?" sayfası. */
    await s.eval(PRESS('?'));
    await SLEEP(500);
    const sheet = await s.eval(SNATCH);

    await s.eval(PRESS('Escape'));
    await SLEEP(400);
    const closed = await s.eval(SNATCH);

    /* 4: gerçek kısayollar. */
    await s.eval(PRESS('3', ', ctrlKey: true'));
    await SLEEP(700);
    const command = await s.eval(SNATCH);

    await s.eval(PRESS('7', ', ctrlKey: true'));
    await SLEEP(700);
    const models = await s.eval(SNATCH);

    await s.eval(PRESS('1', ', ctrlKey: true'));
    await SLEEP(700);
    const chat = await s.eval(SNATCH);

    const rows = (sheet && sheet.rows) || [];
    const rowOf = (key) => (rows.find((r) => r.key === key) || {}).text || '';
    const screenRows = rows.filter((r) => /^Ctrl\+[1-9]$/.test(r.key));
    const report = {
      sheetOpen: sheet && sheet.open,
      modalTitle: sheet && sheet.modalTitle,
      screenRowCount: screenRows.length,
      ctrl1: rowOf('Ctrl+1'),
      ctrl4: rowOf('Ctrl+4'),
      ctrl9: rowOf('Ctrl+9'),
      hasCtrlK: rows.some((r) => r.key === 'Ctrl+K'),
      closedAfterEsc: closed && !closed.open,
      command: command && { screen: command.screen, title: command.title },
      models: models && { screen: models.screen, title: models.title },
      chat: chat && { screen: chat.screen, title: chat.title },
      exceptions: exc.length,
      consoleErrors: errs
    };
    console.log(JSON.stringify(report, null, 1));

    const ok = report.sheetOpen === true && report.screenRowCount === 9
      && report.ctrl1 === 'Sohbet ekranı' && report.ctrl4 === 'Görev Panosu ekranı'
      && report.ctrl9 === 'Tarayıcı ekranı' && report.hasCtrlK === true
      && report.closedAfterEsc === true
      && command && command.screen.length === 1 && command.screen[0] === 'command' && command.title === 'Komut Merkezi'
      && models && models.screen.length === 1 && models.screen[0] === 'models' && models.title === 'Model Merkezi'
      && chat && chat.screen.length === 1 && chat.screen[0] === 'chat' && chat.title === 'Sohbet'
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'KISAYOLLAR: GECTI' : 'KISAYOLLAR: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
