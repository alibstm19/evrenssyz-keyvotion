'use strict';
/*
 * Sohbet okuma konumunu korur — uçtan uca (T-188).
 *
 * Kusur: `renderChatThread()` her çizimde dibe atlıyordu. Kullanıcı yukarı
 * kaydırıp eski mesajı okurken liste yeniden çizilince (arama, sekme değişimi,
 * yeni mesaj) yerinden koparılıyordu.
 *
 * Bu kapı yalnız gerçek kullanıcı yollarını kullanır (renderer modül kapsamı
 * CDP'den görünmez; `store`/`stickChatToBottom` çağrılmaz):
 *   1) Pencere sohbetin taşacağı kadar kısaltılır (gerçek konuşma metni, uydurma
 *      tohum yok), en uzun konuşma `[data-chat-pick]` ile açılır → dibe iner.
 *   2) Kullanıcı yukarı kaydırır; arama girdisi olayı yeniden çizim tetikler
 *      (`[data-field="chat-search"]` → `renderChat`) → konum KORUNUR.
 *   3) Dipteyken aynı yeniden çizim dibe yapışır (yeni mesaj kaçmaz).
 *   4) Başka bir dolu konuşmaya geçmek (`[data-chat-pick]`) dibe iner.
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/chat-scroll.js   (çıkış 0 = geçti)
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

const METRICS = `(() => {
  const t = document.querySelector('[data-chat-thread]');
  if (!t) return { missing: true };
  return {
    scrollTop: Math.round(t.scrollTop),
    scrollHeight: t.scrollHeight,
    clientHeight: t.clientHeight,
    distance: Math.round(t.scrollHeight - t.scrollTop - t.clientHeight),
    room: t.scrollHeight - t.clientHeight,
    bubbles: t.querySelectorAll('.kv-bubble').length,
    title: ((document.querySelector('[data-field="chat-title"]') || {}).textContent || '').trim(),
    active: ((document.querySelector('[data-chat-pick][aria-current="true"]') || {}).dataset || {}).chatPick || null
  };
})()`;

const SCROLL_TOP = `(() => {
  const t = document.querySelector('[data-chat-thread]');
  t.scrollTop = 0;
  return Math.round(t.scrollTop);
})()`;

const SCROLL_BOTTOM = `(() => {
  const t = document.querySelector('[data-chat-thread]');
  t.scrollTop = t.scrollHeight;
  return Math.round(t.scrollHeight - t.scrollTop - t.clientHeight);
})()`;

/* Gerçek yol: arama alanına input olayı → renderChat() (160 ms debounce). */
const RERENDER = `(() => {
  const i = document.querySelector('[data-field="chat-search"]');
  if (!i) return false;
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

const PICK = (index) => `(() => {
  const all = [...document.querySelectorAll('[data-chat-pick]')];
  const b = all[${index}];
  if (!b) return { picked: false, total: all.length };
  const id = b.dataset.chatPick;
  b.click();
  return { picked: true, total: all.length, id };
})()`;

(async () => {
  PORT = await resolvePort('KV_SCROLL_CDP_PORT');
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

    await s.eval(`(() => { const n = document.querySelector('[data-nav-item="chat"]'); if (n) n.click(); return true; })()`);
    await SLEEP(1400);

    /* Pencereyi kısalt: gerçek konuşma metni taşsın (genişlik korunur, düzen bozulmaz). */
    const inner = await s.eval(`({ w: window.innerWidth, h: window.innerHeight })`);
    let viewport = null;
    for (const h of [inner.h - 80, 720, 660, 600, 540]) {
      await s.send('Emulation.setDeviceMetricsOverride', {
        width: inner.w, height: h, deviceScaleFactor: 1, mobile: false
      });
      await SLEEP(400);
      await s.eval(PICK(0));
      await SLEEP(1000);
      const m = await s.eval(METRICS);
      viewport = { width: inner.w, height: h, room: m.room, clientHeight: m.clientHeight };
      if (m.room > 120 && m.clientHeight >= 120) break;
    }

    /* Konuşmaları tek tek aç (gerçek tıklama), en uzununu bul. */
    let inventory = [];
    const total = (await s.eval(PICK(0))).total;
    for (let i = 0; i < total; i += 1) {
      const p = await s.eval(PICK(i));
      if (!p.picked) continue;
      await SLEEP(850);
      const m = await s.eval(METRICS);
      inventory.push({
        index: i, id: p.id, title: m.title, bubbles: m.bubbles,
        scrollHeight: m.scrollHeight, clientHeight: m.clientHeight, room: m.room, distance: m.distance
      });
    }
    const longest = inventory.slice().sort((a, b) => b.room - a.room)[0] || null;
    const other = inventory.filter((r) => r.bubbles > 0 && r.id !== (longest && longest.id))[0] || null;

    /* 1) En uzun konuşma → dibe inmeli, içerik taşmalı. */
    const picked1 = await s.eval(PICK(longest.index));
    await SLEEP(1100);
    const atBottom = await s.eval(METRICS);

    /* 2) Yukarı kaydır + gerçek yeniden çizim → konum korunur. */
    const scrolledTo = await s.eval(SCROLL_TOP);
    await SLEEP(250);
    const afterUp = await s.eval(METRICS);
    const rerendered = await s.eval(RERENDER);
    await SLEEP(700);
    const afterRerender = await s.eval(METRICS);

    /* 3) Dipteyken yeniden çizim dibe yapışır. */
    const bottomBack = await s.eval(SCROLL_BOTTOM);
    await SLEEP(250);
    await s.eval(RERENDER);
    await SLEEP(700);
    const bottomStick = await s.eval(METRICS);

    /* 4) Başka dolu konuşmaya geç → dibe inmeli. */
    let picked2 = { picked: false, total };
    let afterPick = null;
    if (other) {
      picked2 = await s.eval(PICK(other.index));
      await SLEEP(1100);
      afterPick = await s.eval(METRICS);
      /* uzun konuşmaya geri dön: sonraki kapılar temiz kalsın */
      await s.eval(PICK(longest.index));
      await SLEEP(900);
    }

    const report = {
      viewport, total, inventory, picked1, atBottom, scrolledTo, afterUp,
      rerendered, afterRerender, bottomBack, bottomStick, picked2, afterPick,
      exceptions: exc.length, consoleErrors: errs
    };
    console.log(JSON.stringify(report, null, 1));

    const roomy = atBottom.room > 120;
    const ok = longest !== null && viewport && viewport.room > 120
      && roomy && atBottom.bubbles > 0
      && atBottom.distance <= 5
      && scrolledTo === 0 && afterUp.distance > 60
      && rerendered === true
      && afterRerender.scrollTop === 0
      && afterRerender.distance === afterUp.distance
      && afterRerender.bubbles === afterUp.bubbles
      && bottomBack === 0 && bottomStick.distance <= 5
      && other !== null && picked2.picked === true
      && afterPick && afterPick.bubbles > 0 && afterPick.distance <= 5
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'SOHBET KAYDIRMA: GECTI' : 'SOHBET KAYDIRMA: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
