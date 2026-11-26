'use strict';
/*
 * Sohbet taslağı — uçtan uca (T-177).
 *
 * Kullanıcı yazdığı yarım mesajı ekran değiştirince ya da pencere kapanınca
 * kaybetmemeli. Bu kapı gerçek uygulamada ölçer:
 *   1) Konuşmada yazı yazınca "Taslak kaydedildi" notu çıkar.
 *   2) Başka ekrana gidip sohbete dönünce metin aynen durur.
 *   3) Sayfa yenilenince (pencere kapanıp açılması) metin geri gelir.
 *   4) Gönderilemeyen metin kutuda kalır ve taslağı korunur; metni silmek taslağı siler.
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/chat-draft.js   (çıkış 0 = geçti)
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolvePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
let PORT = 0;
const PROFILE = path.join(ROOT, 'work', 'chat-draft-profile');
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
  const ta = document.querySelector('[data-field="chat-text"]');
  const note = document.querySelector('[data-field="chat-draft-note"]');
  return {
    value: ta ? ta.value : null,
    note: note ? !note.hidden : null,
    raw: (() => { try { return localStorage.getItem('kv.chatDrafts.v1'); } catch (e) { return '__ERR__'; } })()
  };
})()`;

const TYPE = (text) => `(() => {
  const ta = document.querySelector('[data-field="chat-text"]');
  if (!ta) return false;
  ta.focus();
  ta.value = ${JSON.stringify(text)};
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

(async () => {
  if (!fs.existsSync(ELECTRON)) { console.log('ELEKTRON YOK'); process.exit(2); }
  fs.rmSync(PROFILE, { recursive: true, force: true });
  PORT = await resolvePort('KV_DRAFT_CDP_PORT');
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], {
    cwd: path.join(ROOT, 'src'), stdio: 'ignore'
  });
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
        /* Chromium meta etiketindeki frame-ancestors'ı yok sayar; bu bir uyarı,
           ürün kusuru değil (başlıkla sunulan sürümde direktif etkin). */
        if (!/frame-ancestors/.test(text)) errs.push(text.slice(0, 200));
      }
    });
    await SLEEP(3500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(900);
    await s.eval(`(() => {
      document.querySelector('[data-nav-item="chat"]').click();
      const n = document.querySelector('[data-action="chat-new"]');
      if (n) n.click();
      return true;
    })()`);
    await SLEEP(1500);

    const typed = await s.eval(TYPE('Yarım kalan taslak metni'));
    await SLEEP(700);
    const afterType = await s.eval(SNAP);

    await s.eval(`(() => { document.querySelector('[data-nav-item="team"]').click(); return true; })()`);
    await SLEEP(700);
    await s.eval(`(() => { document.querySelector('[data-nav-item="chat"]').click(); return true; })()`);
    await SLEEP(900);
    const afterReturn = await s.eval(SNAP);

    /* Pencere kapanıp açılması: sayfayı yenile, taslak localStorage'dan gelmeli. */
    await s.send('Page.enable').catch(() => {});
    await s.send('Page.reload', { ignoreCache: false }).catch(() => {});
    await SLEEP(4000);
    await s.eval(`(() => {
      const b = document.querySelector('[data-action="onboard-skip"]');
      if (b) b.click();
      document.querySelector('[data-nav-item="chat"]').click();
      return true;
    })()`);
    await SLEEP(1200);
    const afterReload = await s.eval(SNAP);

    /* Gönderim (anahtar yok → hata) taslağı temizlemeli. */
    await s.eval(`(() => {
      document.querySelector('[data-action="chat-new"]').click();
      return true;
    })()`);
    await SLEEP(1200);
    await s.eval(TYPE('Gönderilecek taslak'));
    await SLEEP(500);
    await s.eval(`(() => {
      const ta = document.querySelector('[data-field="chat-text"]');
      ta.focus();
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    })()`);
    await SLEEP(2500);
    const afterSend = await s.eval(SNAP);

    /* Metni silmek taslağı da silmeli. */
    await s.eval(TYPE(''));
    await SLEEP(700);
    const afterClear = await s.eval(SNAP);

    const report = { typed, afterType, afterReturn, afterReload, afterSend, afterClear, exceptions: exc.length, consoleErrors: errs, consoleErrorsCount: errs.length };
    console.log(JSON.stringify(report, null, 1));

    const ok = typed === true
      && afterType.value === 'Yarım kalan taslak metni' && afterType.note === true
      && /Yarım kalan taslak metni/.test(String(afterType.raw))
      && afterReturn.value === 'Yarım kalan taslak metni'
      && afterReload.value === 'Yarım kalan taslak metni' && afterReload.note === true
      && afterSend.value === 'Gönderilecek taslak' && afterSend.note === true
      && /Gönderilecek taslak/.test(String(afterSend.raw))
      && afterClear.value === '' && afterClear.note === false
      && !/Gönderilecek taslak/.test(String(afterClear.raw))
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'SOHBET TASLAGI: GECTI' : 'SOHBET TASLAGI: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
