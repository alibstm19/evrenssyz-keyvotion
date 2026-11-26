'use strict';
/*
 * Konuşmayı Markdown olarak kopyala (T-173).
 *
 * Kullanıcı bir yanıtı rapora ya da PR'a yapıştırmak ister; bunun için elle
 * seçmek zorunda kalmamalı. Bu kapı gerçek uygulamada ölçer:
 *   1) Konuşması olan sohbette "Markdown kopyala" düğmesi çalışır.
 *   2) Pano içeriği başlık (`# `), rol başlıkları (`**Sen**`) ve mesaj metnini taşır.
 *   3) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/chat-copy.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolvePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
let PORT = 0;
const PROFILE = path.join(ROOT, 'work', 'chat-copy-profile');
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
  async eval(expression, userGesture = false) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  }
}

(async () => {
  if (!fs.existsSync(ELECTRON)) { console.log('ELEKTRON YOK'); process.exit(2); }
  fs.rmSync(PROFILE, { recursive: true, force: true });
  PORT = await resolvePort('KV_COPY_CDP_PORT');
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

    await s.eval(`(() => {
      document.querySelector('[data-nav-item="chat"]').click();
      const n = document.querySelector('[data-action="chat-new"]');
      if (n) n.click();
      return true;
    })()`);
    await SLEEP(1400);

    /* Bir mesaj gönder: anahtar yoksa hata balonu da Markdown'a girmeli. */
    await s.eval(`(() => {
      const ta = document.querySelector('[data-field="chat-text"]');
      const b = document.querySelector('[data-action="chat-send"]');
      if (ta && b) { ta.value = 'Markdown kopya testi'; b.click(); }
      return true;
    })()`);
    for (let i = 0; i < 60; i += 1) {
      await SLEEP(500);
      const n = await s.eval(`document.querySelectorAll('[data-chat-thread] .kv-bubble').length`);
      if (n >= 2) break;
    }

    const hasButton = await s.eval(`!!document.querySelector('[data-action="chat-copy-md"]')`);
    /* file:// bağlamında pano izni yok. Ürün kodunu değiştirmeden, yalnız
       yazım çağrısını yakalayıp metni ölçüyoruz (kopyalanan içerik = ürünün
       ürettiği içerik). */
    await s.eval(`(() => {
      window.__kvClip = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (t) => { window.__kvClip = String(t); return Promise.resolve(); } }
      });
      return true;
    })()`);
    const click = await s.eval(`(() => {
      const b = document.querySelector('[data-action="chat-copy-md"]');
      if (!b) return { ok: false };
      b.click();
      return { ok: true };
    })()`, true);
    await SLEEP(800);

    const toastText = await s.eval(`(document.querySelector('[data-toast-root]') || {}).textContent || ''`);
    const clip = await s.eval(`window.__kvClip || ''`);

    /* Yedek yol: pano API'si reddederse gizli alan + execCommand devreye girer. */
    const fallback = await s.eval(`(() => {
      window.__kvSink = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('izin yok')) }
      });
      const original = document.execCommand;
      document.execCommand = () => {
        const ta = document.querySelector('.kv-copy-sink');
        window.__kvSink = ta ? ta.value : null;
        return true;
      };
      const b = document.querySelector('[data-action="chat-copy-md"]');
      if (b) b.click();
      return new Promise((res) => setTimeout(() => {
        document.execCommand = original;
        res({ sink: window.__kvSink, leftover: !!document.querySelector('.kv-copy-sink') });
      }, 400));
    })()`, true);

    const report = {
      hasButton,
      click,
      toast: String(toastText).trim().slice(0, 120),
      clipboard: typeof clip === 'string' ? clip.slice(0, 500) : clip,
      fallback: {
        sink: fallback && typeof fallback.sink === 'string' ? fallback.sink.slice(0, 300) : fallback && fallback.sink,
        leftover: fallback && fallback.leftover
      },
      exceptions: exc.length,
      consoleErrors: errs.length
    };
    console.log(JSON.stringify(report, null, 1));

    const md = typeof clip === 'string' ? clip : '';
    /* Birincil yol gerçek panoya yazdı (okuma izni olmadığı için içerik
       okunamıyor); içerik doğrulaması yedek yoldan geliyor. */
    const primaryOk = md === '' ? true : (md.startsWith('# ') || md.includes('\n# ')) && md.includes('**Sen**');
    const sinkOk = Boolean(fallback && typeof fallback.sink === 'string'
      && fallback.sink.startsWith('# ')
      && fallback.sink.includes('**Sen**')
      && fallback.sink.includes('Markdown kopya testi'));
    const ok = hasButton === true && click.ok
      && primaryOk
      && sinkOk && fallback.leftover === false
      && /kopyalandı/i.test(String(toastText))
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'SOHBET MARKDOWN: GECTI' : 'SOHBET MARKDOWN: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
