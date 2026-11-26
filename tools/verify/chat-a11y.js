'use strict';
/*
 * Sohbet durumu ekran okuyucuya duyurulur — uçtan uca (T-191).
 *
 * Kusur: sohbetin durum satırı ("model yanıtlıyor…", "anahtar yok", gecikme)
 * yalnız görseldi; gönderim hatası kullanıcıya yalnızca sohbet balonuyla
 * gösteriliyordu. Ekran okuyucu kullanan biri mesajının gönderilemediğini
 * duymuyordu.
 *
 * Bu kapı gerçek uygulamada ölçer:
 *   1) Durum satırı erişilebilirlik ağacında `status` rolünde ve `live=polite`.
 *   2) Hata duyurusu ayrı bir `alert` düğümünde ve `live=assertive`.
 *   3) Uyarı düğümü görsel olarak yer kaplamaz (1×1, görünmez) — arayüzde
 *      ikinci bir yazı belirmez.
 *   4) Metin yazılınca ağaçtaki ad güncellenir (gerçek canlı bölge).
 *   5) exception / konsol hatası yok.
 *
 * Kullanım: node tools/verify/chat-a11y.js   (çıkış 0 = geçti)
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

const ATTRS = `(() => {
  const st = document.querySelector('[data-field="chat-status"]');
  const al = document.querySelector('[data-field="chat-alert"]');
  if (!st || !al) return { missing: !st ? 'status' : 'alert' };
  const r = al.getBoundingClientRect();
  const cs = getComputedStyle(al);
  return {
    status: {
      role: st.getAttribute('role'),
      live: st.getAttribute('aria-live'),
      atomic: st.getAttribute('aria-atomic')
    },
    alert: {
      role: al.getAttribute('role'),
      live: al.getAttribute('aria-live'),
      w: Math.round(r.width),
      h: Math.round(r.height),
      display: cs.display,
      overflow: cs.overflow,
      clipPath: cs.clipPath || cs.clip || '',
      visible: cs.display !== 'none' && cs.visibility !== 'hidden'
    }
  };
})()`;

const WRITE = (field, text) => `(() => {
  const n = document.querySelector('[data-field=${JSON.stringify(field)}]');
  if (!n) return false;
  n.textContent = ${JSON.stringify(text)};
  return true;
})()`;

/* Erişilebilirlik ağacında canlı bölgeleri bul. */
function liveRegions(tree) {
  const out = [];
  for (const n of tree.nodes || []) {
    const role = n.role && n.role.value;
    const props = Object.fromEntries((n.properties || []).map((p) => [p.name, p.value && p.value.value]));
    if (role === 'status' || role === 'alert') {
      out.push({ role, live: props.live, atomic: props.atomic, name: (n.name && n.name.value) || '' });
    }
  }
  return out;
}

/* Canlı bölgenin içindeki metin Chrome'da StaticText düğümünde durur. */
function textsOf(tree) {
  return (tree.nodes || [])
    .filter((n) => n.role && n.role.value === 'StaticText')
    .map((n) => (n.name && n.name.value) || '');
}

(async () => {
  PORT = await resolvePort('KV_CHATA11Y_CDP_PORT');
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
    await s.send('Accessibility.enable').catch(() => {});
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

    /* 1–3) Öznitelikler ve görsel gizlilik. */
    const attrs = await s.eval(ATTRS);

    /* 4) Gerçek canlı bölge: metin yaz, ağaçta görün. */
    const statusText = 'model yanıtlıyor… (duyuru testi)';
    const alertText = 'Mesaj gönderilemedi: sağlayıcı API anahtarı yok. (duyuru testi)';
    const wroteStatus = await s.eval(WRITE('chat-status', statusText));
    const wroteAlert = await s.eval(WRITE('chat-alert', alertText));
    await SLEEP(600);
    const treeMsg = await s.send('Accessibility.getFullAXTree');
    const tree = treeMsg.result || treeMsg;
    const regions = liveRegions(tree);
    const texts = textsOf(tree);
    const statusNode = regions.find((n) => n.role === 'status');
    const alertNode = regions.find((n) => n.role === 'alert');
    const statusInTree = texts.some((t) => t.includes('model yanıtlıyor… (duyuru testi)'));
    const alertInTree = texts.some((t) => t.includes('Mesaj gönderilemedi'));

    /* Temizle: sonraki kapılar boş durumla başlasın. */
    await s.eval(WRITE('chat-status', ''));
    await s.eval(WRITE('chat-alert', ''));

    const report = {
      attrs, wroteStatus, wroteAlert,
      axStatus: statusNode || null,
      axAlert: alertNode || null,
      statusInTree, alertInTree,
      exceptions: exc.length,
      consoleErrors: errs
    };
    console.log(JSON.stringify(report, null, 1));

    const ok = attrs && attrs.status && attrs.alert
      && attrs.status.role === 'status' && attrs.status.live === 'polite' && attrs.status.atomic === 'true'
      && attrs.alert.role === 'alert' && attrs.alert.live === 'assertive'
      && attrs.alert.visible === true && attrs.alert.w <= 2 && attrs.alert.h <= 2
      && /hidden/.test(attrs.alert.overflow)
      && wroteStatus === true && wroteAlert === true
      && statusNode && statusNode.live === 'polite' && String(statusNode.atomic) === 'true'
      && alertNode && alertNode.live === 'assertive' && String(alertNode.atomic) === 'true'
      && statusInTree === true && alertInTree === true
      && exc.length === 0 && errs.length === 0;

    console.log(ok ? 'SOHBET DUYURUSU: GECTI' : 'SOHBET DUYURUSU: KALDI');    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
