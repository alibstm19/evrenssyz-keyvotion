'use strict';
/*
 * Sohbet hatası — "Tekrar dene" (T-172).
 *
 * Kullanıcı bir yanıt alamadığında mesajı elle kopyalayıp yeniden yazmak
 * zorunda kalmamalı. Bu kapı gerçek uygulamada ölçer:
 *   1) Anahtarsız profilde gönderim başarısız olur ve HATA balonu çıkar.
 *   2) Balonda "Tekrar dene" ve "Kopyala" vardır.
 *   3) "Tekrar dene" gönderimi yeniden çalıştırır; hata balonu ÇOĞALMAZ
 *      (eski balon kaldırılır, yenisi gelir → tam 1 hata balonu).
 *   4) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/chat-retry.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolvePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
let PORT = 0;
const PROFILE = path.join(ROOT, 'work', 'chat-retry-profile');
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
  const thread = document.querySelector('[data-chat-thread]');
  const errors = thread ? [...thread.querySelectorAll('.kv-bubble--error')] : [];
  const last = errors[errors.length - 1] || null;
  return {
    errors: errors.length,
    buttons: last ? [...last.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
    text: last ? (last.querySelector('.kv-bubble__text') || {}).textContent || '' : '',
    busy: !!(document.querySelector('[data-field="chat-send-icon"]') || {}).textContent?.includes('■'),
    input: (document.querySelector('[data-field="chat-text"]') || {}).value || ''
  };
})()`;

(async () => {
  if (!fs.existsSync(ELECTRON)) { console.log('ELEKTRON YOK'); process.exit(2); }
  fs.rmSync(PROFILE, { recursive: true, force: true });
  PORT = await resolvePort('KV_RETRY_CDP_PORT');
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
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(String(m.params.entry.text).slice(0, 200));
    });
    await SLEEP(3500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(900);

    const openChat = await s.eval(`(() => {
      const b = document.querySelector('[data-nav-item="chat"]');
      if (!b) return false;
      b.click();
      const n = document.querySelector('[data-action="chat-new"]');
      if (n) n.click();
      return true;
    })()`);
    await SLEEP(1500);

    const send = await s.eval(`(() => {
      const ta = document.querySelector('[data-field="chat-text"]');
      const b = document.querySelector('[data-action="chat-send"]');
      if (!ta || !b) return { ok: false };
      ta.value = 'T-172 tekrar dene kapisi';
      b.click();
      return { ok: true };
    })()`);

    let first = null;
    for (let i = 0; i < 60; i += 1) {
      await SLEEP(500);
      const snap = await s.eval(SNAP);
      if (snap && snap.errors > 0) { first = snap; break; }
    }

    const retry = first && first.buttons.includes('Tekrar dene')
      ? await s.eval(`(() => {
          const thread = document.querySelector('[data-chat-thread]');
          const errors = [...thread.querySelectorAll('.kv-bubble--error')];
          const last = errors[errors.length - 1];
          const b = last ? [...last.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Tekrar dene') : null;
          if (!b) return { ok: false };
          b.click();
          return { ok: true };
        })()`)
      : { ok: false, reason: 'tekrar dene yok' };

    let second = null;
    if (retry.ok) {
      for (let i = 0; i < 60; i += 1) {
        await SLEEP(500);
        const snap = await s.eval(SNAP);
        if (snap && snap.errors > 0 && !snap.busy) { second = snap; break; }
      }
    }

    const report = { openChat, send, first, retry, second, exceptions: exc.length, consoleErrors: errs.length };
    console.log(JSON.stringify(report, null, 1));

    const ok = openChat === true && send.ok
      && first && first.errors >= 1 && first.buttons.includes('Tekrar dene') && first.buttons.includes('Kopyala')
      && retry.ok
      && second && second.errors === 1 && /Gönderilemedi/.test(second.text)
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'SOHBET TEKRAR DENE: GECTI' : 'SOHBET TEKRAR DENE: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
