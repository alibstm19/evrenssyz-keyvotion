'use strict';
/*
 * Yerel erişim izni — uçtan uca (gerçek uygulama).
 *
 * Kullanıcı isteği: "PC içinde bir izin sorusu; o izinden sonra yerel olarak
 * çoğu şeye erişimi olsun." Bu kapı sözleşmeyi kullanıcının gördüğü yoldan
 * ölçer:
 *   1) Ayarlar → Bu bilgisayar: izin KAPALI, durum metni "izin istenmedi".
 *   2) Dosyalar: yalnız proje klasörü; sürücü kısayolu YOK.
 *   3) "İzin sor" → diyalog açılır, "İzin ver" → izin açık + diske yazılır.
 *   4) Dosyalar: sürücüler/ev kısayolu görünür, başka sürücü gezilebilir.
 *   5) "İzni kaldır" → kısayollar kaybolur, erişim yeniden kapalı.
 *
 * Kullanım: node tools/verify/local-access-ui.js
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolvePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
let PORT = 0;
const PROFILE = path.join(ROOT, 'work', 'local-access-profile');
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
  const screen = document.querySelector('[data-screen="files"]');
  const jump = screen ? screen.querySelector('.kv-files-jump') : null;
  return {
    state: (document.querySelector('[data-field="local-state"]') || {}).textContent || '',
    checked: Boolean((document.querySelector('[data-field="local-access"]') || {}).checked),
    at: (document.querySelector('[data-field="local-at"]') || {}).textContent || '',
    screenOpen: !!screen && !screen.hidden,
    path: (document.querySelector('[data-field="files-path"]') || {}).textContent || '',
    chips: jump ? [...jump.querySelectorAll('button')].map((b) => b.textContent.trim()) : [],
    htmlFlag: document.documentElement.getAttribute('data-local-access')
  };
})()`;

(async () => {
  if (!fs.existsSync(ELECTRON)) { console.log('ELEKTRON YOK'); process.exit(2); }
  fs.rmSync(PROFILE, { recursive: true, force: true });
  PORT = await resolvePort('KV_LOCAL_CDP_PORT');
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`], {
    cwd: path.join(ROOT, 'src'), stdio: 'ignore'
  });
  const exc = [];
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
    s.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown') exc.push(String(m.params.exceptionDetails.text).slice(0, 200));
    });
    await SLEEP(3500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="onboard-skip"]'); if (b) b.click(); return true; })()`);
    await SLEEP(900);

    const go = (name) => s.eval(`(() => { const b = document.querySelector('[data-nav-item="${name}"]'); if (!b) return false; b.click(); return true; })()`);

    /* 1) Başlangıç: izin kapalı, Dosyalar yalnız proje kökü. */
    await go('settings');
    await SLEEP(600);
    const initial = await s.eval(SNAP);

    await go('files');
    await SLEEP(1200);
    const filesBefore = await s.eval(SNAP);

    /* 2) İzin sor → diyalog → İzin ver. */
    await go('settings');
    await SLEEP(500);
    const asked = await s.eval(`(() => {
      const b = document.querySelector('[data-action="local-ask"]');
      if (!b) return { ok: false, reason: 'izin sor yok' };
      b.click();
      const dlg = document.querySelector('[data-modal-root] [role="dialog"]');
      const grant = document.querySelector('[data-action="local-grant"]');
      return { ok: true, dialog: !!dlg, grant: !!grant, title: dlg ? (dlg.querySelector('h2') || {}).textContent : '' };
    })()`);
    await SLEEP(400);
    await s.eval(`(() => { const b = document.querySelector('[data-action="local-grant"]'); if (b) b.click(); return true; })()`);
    await SLEEP(1400);
    const afterGrant = await s.eval(SNAP);

    /* 3) Dosyalar: sürücü/ev kısayolları görünmeli. */
    await go('files');
    await SLEEP(1500);
    const filesAfter = await s.eval(SNAP);

    /* 4) Başka bir sürücüye/klasöre geçiş gerçekten çalışıyor mu? */
    const jump = await s.eval(`(() => {
      const screen = document.querySelector('[data-screen="files"]');
      const buttons = [...screen.querySelectorAll('.kv-files-jump button')];
      if (!buttons.length) return { ok: false, reason: 'kısayol yok' };
      buttons[0].click();
      return { ok: true, label: buttons[0].textContent.trim() };
    })()`);
    await SLEEP(1800);
    const afterJump = await s.eval(SNAP);

    /* 5) İzni kaldır → kısayollar gider, dosya ekranı köke döner. */
    await go('settings');
    await SLEEP(500);
    await s.eval(`(() => { const b = document.querySelector('[data-action="local-revoke"]'); if (b) b.click(); return true; })()`);
    await SLEEP(1400);
    const afterRevoke = await s.eval(SNAP);
    await go('files');
    await SLEEP(1500);
    const filesRevoked = await s.eval(SNAP);

    const cfgFile = path.join(PROFILE, 'config.json');
    let onDisk = null;
    try { onDisk = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { /* yok */ }

    const report = {
      initial, filesBefore, asked, afterGrant, filesAfter, jump, afterJump, afterRevoke, filesRevoked,
      configLocalAccess: onDisk ? onDisk.localAccess : null,
      configAsked: onDisk ? onDisk.localAccessAsked : null,
      exceptions: exc.length
    };
    console.log(JSON.stringify(report, null, 1));

    const ok = initial.checked === false
      && filesBefore.chips.length === 0
      && asked.ok && asked.dialog && asked.grant
      && afterGrant.checked === true && afterGrant.htmlFlag === 'on'
      && filesAfter.chips.length >= 2
      && jump.ok && afterJump.path !== filesAfter.path
      && afterRevoke.checked === false && afterRevoke.htmlFlag === 'off'
      && filesRevoked.chips.length === 0
      && onDisk && onDisk.localAccess === false && onDisk.localAccessAsked === true
      && exc.length === 0;

    console.log(ok ? 'YEREL ERISIM: GECTI' : 'YEREL ERISIM: KALDI');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('HATA', e.message);
    process.exitCode = 1;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
  }
})();
