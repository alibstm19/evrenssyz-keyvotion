'use strict';
/*
 * T-166 — Paketlenmiş .exe'de ilk-kurulum kalıcılığı.
 *
 * Gerçek kullanıcı senaryosu: uygulamayı açar, karşılama panelini "Atla" ile
 * kapatır, ertesi gün yeniden açar. Panel İKİNCİ açılışta çıkmamalı. Panel
 * her açılışta çıkıyorsa kullanıcı her seferinde engellenir.
 *
 * Ölçülen: birinci açılışta panel açık mı → kapat → süreci sonlandır →
 * aynı `--user-data-dir` ile ikinci açılış → panel kapalı mı, `onboarded`
 * diskte true mu.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { freePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const EXE = path.join(ROOT, 'dist', 'Keyvotion Console', 'Keyvotion Console.exe');
const PROFILE = path.join(ROOT, 'work', 'onboard-persist-profile');
const HOME_DIR = path.join(ROOT, 'work', 'onboard-persist-home');

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

/** Uygulamayı açar, CDP'ye bağlanır, `probe` ifadesini çalıştırır, kapatır. */
async function launch(port, probe) {
  const proc = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${PROFILE}`], {
    cwd: path.dirname(EXE), stdio: 'ignore', env: { ...process.env, USERPROFILE: HOME_DIR }
  });
  try {
    let page = null;
    for (let i = 0; i < 150 && !page; i += 1) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* bekle */ }
      if (!page) await SLEEP(400);
    }
    if (!page) throw new Error('CDP sayfa yok (port ' + port + ')');
    const s = new S(page.webSocketDebuggerUrl);
    await s.ready;
    await s.send('Runtime.enable');
    await SLEEP(3200);
    const value = await s.eval(probe);
    return value;
  } finally {
    try { proc.kill(); } catch { /* yoksay */ }
    /* Süreç kapanana kadar bekle: config.json yazımı bitmiş olmalı. */
    for (let i = 0; i < 40; i += 1) {
      if (!proc.pid) break;
      try { process.kill(proc.pid, 0); } catch { break; }
      await SLEEP(150);
    }
    await SLEEP(900);
  }
}

const PANEL_STATE = `(() => {
  const root = document.querySelector('[data-onboard]');
  return {
    open: !!root && !root.hasAttribute('hidden'),
    visitedScreens: document.querySelectorAll('[data-screen]').length,
    title: document.title
  };
})()`;

const SKIP = `(async () => {
  const rootBefore = document.querySelector('[data-onboard]');
  const openBefore = !!rootBefore && !rootBefore.hasAttribute('hidden');
  const b = document.querySelector('[data-action="onboard-skip"]');
  if (!b) return { skipped: false, reason: 'atla yok', openBefore };
  b.click();
  await new Promise((r) => setTimeout(r, 1400));
  const root = document.querySelector('[data-onboard]');
  return { skipped: true, openBefore, closedAfterSkip: !!root && root.hasAttribute('hidden') };
})()`;

function readConfig() {
  const file = path.join(PROFILE, 'config.json');
  if (!fs.existsSync(file)) return { exists: false };
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { exists: true, onboarded: cfg.onboarded, projectDir: cfg.projectDir };
  } catch (e) {
    return { exists: true, error: e.message };
  }
}

(async () => {
  if (!fs.existsSync(EXE)) {
    console.log(JSON.stringify({ packaged: false, reason: 'exe yok' }));
    console.log('ILK-KURULUM KALICILIGI: ATLANDI');
    process.exit(2);
  }
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.rmSync(HOME_DIR, { recursive: true, force: true });
  fs.mkdirSync(HOME_DIR, { recursive: true });

  /* --- 1. açılış: panel görünmeli, atla ile kapanmalı --- */
  const first = await launch(await freePort(), PANEL_STATE);
  const configAfterFirst = readConfig();
  const skip = await launch(await freePort(), SKIP);
  /* skip ikinci bir süreç açtı; aynı profili kullandığı için panel bu kez
     ZATEN kapalı olabilir — asıl kanıt config ve sonraki açılış. */
  const configAfterSkip = readConfig();

  /* --- 2. açılış (yeni süreç, aynı profil): panel kapalı olmalı --- */
  const second = await launch(await freePort(), PANEL_STATE);
  const configAfterSecond = readConfig();

  /* Kanıt dosyası depoda izlenir: mutlak kullanıcı yolu yazılmaz (T-208).
     Ölçüm ham değerle yapılır, dosyaya `<HOME>` ile göreli yazılır. */
  const redact = (c) => (c && typeof c.projectDir === 'string'
    ? { ...c, projectDir: `<HOME>${c.projectDir.slice(HOME_DIR.length)}` }
    : c);
  const portable = Boolean(configAfterSecond.projectDir
    && configAfterSecond.projectDir.toLowerCase().startsWith(HOME_DIR.toLowerCase()));

  const report = {
    firstLaunch: first,
    configAfterFirst,
    skipAttempt: skip,
    configAfterSkip: redact(configAfterSkip),
    secondLaunch: second,
    configAfterSecond: redact(configAfterSecond),
    projectDirIsPortable: portable
  };
  console.log(JSON.stringify(report, null, 1));

  /* Kabul: ilk açılışta panel açık; atla paneli kapatır VE diske onboarded:true
     yazar; ikinci açılışta panel kapalı. */
  const ok = Boolean(first && first.open)
    && Boolean(skip && skip.openBefore && skip.skipped && skip.closedAfterSkip)
    && configAfterSkip.exists === true
    && configAfterSkip.onboarded === true
    && Boolean(second && second.open === false)
    && report.projectDirIsPortable;

  fs.writeFileSync(path.join(__dirname, 'packaged-onboard-persist.json'), JSON.stringify({ ...report, ok }, null, 2));
  console.log(ok ? 'ILK-KURULUM KALICILIGI: GECTI' : 'ILK-KURULUM KALICILIGI: KALDI');
  process.exitCode = ok ? 0 : 1;
})().catch((e) => { console.error('HATA', e.message); process.exit(1); });
