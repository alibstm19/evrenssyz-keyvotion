'use strict';
/*
 * Önyükleme bütçesi — kalıcı kapı (T-190).
 *
 * Neden: `tools/package.js --verify` eskiden CDP'yi 500 ms'de bir yokluyordu.
 * Ölçüm 500 ms'lik kovalara yuvarlanıyordu: 22–23 Kasım'daki "490–518 ms" ilk
 * kova, son paketteki "1102 ms" ikinci kovaydı. Kullanıcıya "iki kat yavaşladı"
 * gibi görünen fark aslında bir kova sıçramasıydı; gerçek önyükleme 25 ms
 * çözünürlükte 161–324 ms.
 *
 * Bu kapı gerçek pencereyi 25 ms'de bir yoklar ve eşikleri sürer:
 *   - Isınmış koşuların ortancası ≤ 800 ms (ölçülen ortanca 205–252 ms; ~3x pay)
 *   - Isınmış koşuların en kötüsü ≤ 2000 ms
 *   - İlk (soğuk) koşu ≤ 3000 ms — disk/AV taraması payı; ayrı raporlanır
 *
 * Hedef: paketlenmiş exe varsa o, yoksa kaynak (`electron .`).
 * Kullanım: node tools/verify/boot-budget.js   (çıkış 0 = geçti)
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { freePort } = require('./lib/cdp');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'src', 'node_modules', 'electron', 'dist', 'electron.exe');
const EXE = path.join(ROOT, 'dist', 'Keyvotion Console', 'Keyvotion Console.exe');

const WARM_MEDIAN_MS = 800;
const WARM_MAX_MS = 2000;
const COLD_MAX_MS = 3000;
const WARM_RUNS = 5;
const POLL_MS = 25;

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(port, url) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: url, timeout: 500 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function launch(kind, port) {
  const bin = kind === 'exe' ? EXE : ELECTRON;
  const args = kind === 'exe' ? [`--remote-debugging-port=${port}`] : ['.', `--remote-debugging-port=${port}`];
  const cwd = kind === 'exe' ? path.dirname(EXE) : path.join(ROOT, 'src');
  const child = spawn(bin, args, { cwd, stdio: 'ignore' });
  const started = process.hrtime.bigint();
  let ms = null;
  try {
    for (let i = 0; i < 400; i += 1) { /* 12 s üst sınır = bütçe aşımı */
      try {
        const list = await getJson(port, '/json/list');
        if ((list || []).some((p) => p.type === 'page' && /Keyvotion/i.test(p.title || ''))) {
          ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
          break;
        }
      } catch { /* henüz değil */ }
      await SLEEP(POLL_MS);
    }
  } finally {
    try { child.kill(); } catch { /* yoksay */ }
    await SLEEP(900); /* port ve dosya tutamaçları serbest kalsın */
  }
  return ms;
}

const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

(async () => {
  const kind = fs.existsSync(EXE) ? 'exe' : 'src';
  const runs = [];
  for (let i = 0; i < WARM_RUNS + 1; i += 1) {
    const ms = await launch(kind, await freePort());
    runs.push(ms);
    console.log(`kosu ${i + 1}${i === 0 ? ' (ilk)' : ''}: ${ms === null ? 'pencere yok' : `${ms} ms`}`);
    if (ms === null) break;
  }
  const cold = runs[0];
  const warm = runs.slice(1).filter((x) => x !== null);
  const ok = runs.every((x) => x !== null)
    && cold <= COLD_MAX_MS
    && warm.length === WARM_RUNS
    && median(warm) <= WARM_MEDIAN_MS
    && Math.max(...warm) <= WARM_MAX_MS;

  const report = {
    target: kind,
    cold,
    warm,
    warmMedian: warm.length ? median(warm) : null,
    warmMax: warm.length ? Math.max(...warm) : null,
    budget: { warmMedian: WARM_MEDIAN_MS, warmMax: WARM_MAX_MS, cold: COLD_MAX_MS },
    pollMs: POLL_MS
  };
  console.log(JSON.stringify(report, null, 1));
  console.log(ok ? 'ONYUKLEME BUTCESI: GECTI' : 'ONYUKLEME BUTCESI: KALDI');
  process.exitCode = ok ? 0 : 1;
})();
