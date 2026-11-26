'use strict';
/*
 * "En alta in" düğmesi — uçtan uca (T-189).
 *
 * T-188 okuma konumunu korur; artık dipten uzaktaki kullanıcının tek tıkla
 * sona dönebilmesi gerekir. Bu kapı gerçek uygulamada ölçer:
 *   1) Dipteyken düğme gizli.
 *   2) Kullanıcı yukarı kaydırınca düğme görünür ve gerçek bir düğmedir
 *      (`<button>`, `aria-label`, tabindex -1 değil).
 *   3) Düğme yerleşimi bozmaz: görünürken sohbet yüksekliği aynı kalır.
 *   4) Tıklama en alta iner ve düğme yeniden gizlenir.
 *   5) Klavyeyle odaktayken tıklama odağı mesaj kutusuna bırakır.
 *   6) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/chat-jump.js   (çıkış 0 = geçti)
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

const STATE = `(() => {
  const t = document.querySelector('[data-chat-thread]');
  const b = document.querySelector('[data-action="chat-jump-bottom"]');
  if (!t || !b) return { missing: !t ? 'thread' : 'button' };
  const cs = getComputedStyle(b);
  return {
    hidden: b.hidden,
    visible: cs.display !== 'none' && cs.visibility !== 'hidden',
    position: cs.position,
    label: b.getAttribute('aria-label'),
    tag: b.tagName,
    tabindex: b.tabIndex,
    distance: Math.round(t.scrollHeight - t.scrollTop - t.clientHeight),
    room: t.scrollHeight - t.clientHeight,
    clientHeight: t.clientHeight,
    bubbles: t.querySelectorAll('.kv-bubble').length,
    focus: (document.activeElement && (document.activeElement.getAttribute('data-field') || document.activeElement.tagName)) || null
  };
})()`;

const PICK = (index) => `(() => {
  const all = [...document.querySelectorAll('[data-chat-pick]')];
  const b = all[${index}];
  if (!b) return { picked: false, total: all.length };
  b.click();
  return { picked: true, total: all.length, id: b.dataset.chatPick };
})()`;

const SCROLL_UP = `(() => {
  const t = document.querySelector('[data-chat-thread]');
  t.scrollTop = 0;
  t.dispatchEvent(new Event('scroll'));
  return Math.round(t.scrollTop);
})()`;

/* Düğmeye klavye odağı ver, sonra gerçek tıklama. */
const FOCUS_AND_CLICK = `(() => {
  const b = document.querySelector('[data-action="chat-jump-bottom"]');
  b.focus();
  const focused = document.activeElement === b;
  b.click();
  return { focused };
})()`;

(async () => {
  PORT = await resolvePort('KV_JUMP_CDP_PORT');
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

    /* Pencereyi kısalt: gerçek konuşma metni taşsın. */
    const inner = await s.eval(`({ w: window.innerWidth, h: window.innerHeight })`);
    let viewport = null;
    for (const h of [inner.h - 80, 720, 660, 600, 540]) {
      await s.send('Emulation.setDeviceMetricsOverride', {
        width: inner.w, height: h, deviceScaleFactor: 1, mobile: false
      });
      await SLEEP(400);
      await s.eval(PICK(0));
      await SLEEP(1000);
      const st = await s.eval(STATE);
      viewport = { width: inner.w, height: h, room: st.room, clientHeight: st.clientHeight };
      if (st.room > 120 && st.clientHeight >= 120) break;
    }

    /* En uzun konuşmayı bul. */
    let total = 0;
    for (let attempt = 0; attempt < 4 && !total; attempt += 1) {
      await SLEEP(900);
      total = (await s.eval(PICK(0))).total;
    }
    if (!total) throw new Error('konuşma listesi boş');
    const inventory = [];
    for (let i = 0; i < total; i += 1) {
      const p = await s.eval(PICK(i));
      if (!p.picked) continue;
      await SLEEP(850);
      const st = await s.eval(STATE);
      inventory.push({ index: i, id: p.id, room: st.room, bubbles: st.bubbles });
    }
    const longest = inventory.slice().sort((a, b) => b.room - a.room)[0] || null;
    const picked = await s.eval(PICK(longest.index));
    await SLEEP(1100);

    /* 1) Dipteyken gizli. */
    const atBottom = await s.eval(STATE);

    /* 2) Yukarı kaydır → görünür; yerleşim değişmez. */
    const scrolledTo = await s.eval(SCROLL_UP);
    await SLEEP(350);
    const scrolledUp = await s.eval(STATE);

    /* 3) Tıklama dibe indirir + gizlenir + odak mesaj kutusuna geçer. */
    const click = await s.eval(FOCUS_AND_CLICK);
    await SLEEP(500);
    const afterClick = await s.eval(STATE);

    /* 4) Tekrar yukarı kaydırıp fare tıklaması (odak düğmede değil). */
    await s.eval(SCROLL_UP);
    await SLEEP(300);
    const upAgain = await s.eval(STATE);
    await s.eval(`(() => { const b = document.querySelector('[data-action="chat-jump-bottom"]'); b.click(); return true; })()`);
    await SLEEP(500);
    const afterSecond = await s.eval(STATE);

    const report = {
      viewport, total, longest, picked,
      atBottom, scrolledTo, scrolledUp, click, afterClick, upAgain, afterSecond,
      exceptions: exc.length, consoleErrors: errs
    };
    console.log(JSON.stringify(report, null, 1));

    const ok = longest !== null && viewport && viewport.room > 120 && longest.bubbles > 0
      && atBottom.distance <= 5 && atBottom.hidden === true && atBottom.visible === false
      && scrolledTo === 0 && scrolledUp.visible === true && scrolledUp.hidden === false
      && scrolledUp.tag === 'BUTTON' && scrolledUp.tabindex === 0
      && scrolledUp.label === 'En alta in' && scrolledUp.position === 'absolute'
      && scrolledUp.clientHeight === atBottom.clientHeight
      && scrolledUp.room === atBottom.room
      && click.focused === true
      && afterClick.distance <= 5 && afterClick.hidden === true
      && afterClick.focus === 'chat-text'
      && upAgain.visible === true
      && afterSecond.distance <= 5 && afterSecond.hidden === true
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'EN ALTA IN: GECTI' : 'EN ALTA IN: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
