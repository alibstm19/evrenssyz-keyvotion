'use strict';
/**
 * Keyvotion Console — tek komutta yayın hazırlığı kanıtı (T-194).
 *
 * Var olan kapıları SIRAYLA koşar, her adımı tek satırda ölçer ve en sonda
 * tek satır karar verir:  YAYIN HAZIR: EVET  |  YAYIN HAZIR: HAYIR
 *
 * Kural: kısa devre YOK. Bir adım KALDI verse bile sonrakiler koşar; böylece
 * tablo tam görünür ve yayın provası tek koşuda biter.
 *
 * Kullanım:
 *   node tools/verify/publish-readiness.js            # tam sıra (canlı kapılar dahil)
 *   node tools/verify/publish-readiness.js --static    # CI: canlı Electron kapıları yok
 *
 * Yeni bağımlılık yok; yalnız Node standart kütüphanesi ve mevcut kapılar.
 * Bu komut HİÇBİR ŞEY yayınlamaz: push, etiket ve release onaysız yapılmaz.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const NODE = process.execPath;
const args = new Set(process.argv.slice(2));
const STATIC_ONLY = args.has('--static');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'package.json'), 'utf8'));
const VERSION = pkg.version || '0.0.0';
const ZIP = `Keyvotion-Console-win32-x64-v${VERSION}.zip`;

const num = (m) => (m ? Number(m[1]) : null);

/* ------------------------------------------------------------------------- */
/* Adım tanımları — sıra emirdeki sıradır, değiştirme.                       */
/* ------------------------------------------------------------------------- */

const STEPS = [
  {
    id: 'package',
    label: 'paket üret (--verify --zip)',
    args: ['tools/package.js', '--verify', '--zip'],
    timeoutMs: 15 * 60 * 1000,
    live: true,
    measure: (out) => {
      const boot = num(/\[package\] boot (\d+) ms/.exec(out));
      return boot === null ? 'paket' : `önyükleme ${boot} ms`;
    },
  },
  {
    id: 'freshness',
    label: 'paket tazeliği',
    args: ['tools/verify/package-freshness.js'],
    timeoutMs: 3 * 60 * 1000,
    measure: (out) => (/PAKET TAZELIGI: GECTI/.test(out) ? 'src/ ile aynı' : 'bayat'),
  },
  {
    id: 'tap-count',
    label: 'tap-count (tüm testler)',
    args: ['tools/verify/tap-count.js', 'tests'],
    timeoutMs: 10 * 60 * 1000,
    measure: (out) => {
      const m = /"tests":(\d+),"pass":(\d+),"fail":(\d+)/.exec(out);
      return m ? `${m[2]}/${m[1]} (${m[3]} hata)` : 'test';
    },
  },
  {
    id: 'doctor',
    label: 'doctor (ortam/kanal/kod)',
    args: ['tools/doctor.js'],
    timeoutMs: 5 * 60 * 1000,
    measure: (out) => {
      const f = num(/Total FAILS: (\d+)/.exec(out));
      const w = num(/Total WARNS: (\d+)/.exec(out));
      return f === null ? 'denetim' : `${f} hata, ${w === null ? '?' : w} uyarı`;
    },
  },
  {
    id: 'k3',
    label: 'k3 (doctor + tüm testler)',
    args: ['tools/k3.js'],
    timeoutMs: 10 * 60 * 1000,
    measure: (out) => {
      const m = /K3 Gate (Passed|Failed)/.exec(out);
      return m ? `durum ${m[1] === 'Passed' ? 'PASSED' : 'FAILED'}` : 'k3';
    },
  },
  {
    id: 'html-check',
    label: 'html-check (dengeli işaretleme)',
    args: ['tools/verify/html-check.js'],
    timeoutMs: 2 * 60 * 1000,
    measure: (out) => (/HTML DENGELI/.test(out) ? 'dengeli' : 'bozuk'),
  },
  {
    id: 'ldr-smoke',
    label: 'ldr-smoke (gerçek Electron, 23 ekran)',
    args: ['tools/verify/ldr-smoke.js'],
    timeoutMs: 10 * 60 * 1000,
    live: true,
    measure: (out) => {
      const verdict = /DUMAN TESTI: (GECTI|KALDI)/.exec(out);
      const visited = num(/"visited":(\d+)/.exec(out));
      const cards = num(/"cards":(\d+)/.exec(out));
      return verdict
        ? `${verdict[1]} · ${visited === null ? '?' : visited} ekran, ${cards === null ? '?' : cards} kart`
        : 'duman';
    },
  },
  {
    id: 'packaged-smoke',
    label: 'packaged-smoke (paket .exe)',
    args: ['tools/verify/packaged-smoke.js'],
    timeoutMs: 10 * 60 * 1000,
    live: true,
    measure: (out) => {
      const s = /"visited": (\d+)/.exec(out);
      const c = /"cards": (\d+)/.exec(out);
      return s && c ? `${s[1]} ekran, ${c[1]} kart` : 'paket';
    },
  },
  {
    id: 'packaged-onboard-persist',
    label: 'packaged-onboard-persist (ilk kurulum)',
    args: ['tools/verify/packaged-onboard-persist.js'],
    timeoutMs: 10 * 60 * 1000,
    live: true,
    measure: (out) => (/ILK-KURULUM KALICILIGI: GECTI/.test(out) ? '3 açılış, panel bir kez' : 'kalıcılık'),
  },
  {
    id: 'boot-budget',
    label: 'boot-budget (ılık/soğuk bütçe)',
    args: ['tools/verify/boot-budget.js'],
    timeoutMs: 10 * 60 * 1000,
    live: true,
    measure: (out) => {
      const med = num(/"warmMedian": (\d+)/.exec(out));
      const cold = num(/"cold": (\d+)/.exec(out));
      return med === null ? 'bütçe' : `ortanca ${med} ms, soğuk ${cold === null ? '?' : cold} ms`;
    },
  },
  {
    id: 'secret-scan',
    label: 'sır taraması (t02 + t07)',
    args: ['--test', 'tests/t02-secrecy.test.js', 'tests/t07-secret-logging.test.js'],
    timeoutMs: 5 * 60 * 1000,
    measure: (out) => {
      const p = num(/(?:ℹ|#) pass (\d+)/.exec(out));
      const f = num(/(?:ℹ|#) fail (\d+)/.exec(out));
      return p === null ? 'tarama' : `${p} geçti, ${f === null ? '?' : f} kaldı`;
    },
  },
  {
    id: 'set-repo-owner',
    label: 'set-repo-owner --dry-run (bağlantı sayımı)',
    args: ['tools/set-repo-owner.js', '--dry-run', 'readiness-probe', 'keyvotion'],
    timeoutMs: 60 * 1000,
    measure: (out) => {
      const m = /\[dry-run\] (\d+) of (\d+) link/.exec(out);
      return m ? `${m[1]}/${m[2]} bağlantı, yazma yok` : 'kuru koşu';
    },
  },
];

/* ------------------------------------------------------------------------- */
/* Yayın komutları — onay gelince kopyala-yapıştır.                          */
/* ------------------------------------------------------------------------- */

function printPublishCommands() {
  const lines = [
    '# ===========================================================================',
    '# ONAY GELİNCE YÜRÜTÜLECEK KESİN KOMUTLAR — sırayla, kopyala-yapıştır',
    '# (bu bloktaki hiçbir şey bu komut tarafından çalıştırılmaz)',
    '# ---------------------------------------------------------------------------',
    '# 1) Bağlantıları gerçek depoya çevir (OWNER yerine hesap adı):',
    '#    node tools/set-repo-owner.js <owner> keyvotion',
    '#    git add -A',
    '#    git commit -m "chore: point public links at the repository"',
    '# 2) Paketi tazele ve tazeliğini kanıtla (etiket TAZE paketi göstermeli):',
    '#    node tools/package.js --verify --zip',
    '#    node tools/verify/package-freshness.js',
    '# 3) Depoyu bağla ve gönder (bir kez remote):',
    '#    git remote add origin https://github.com/<owner>/keyvotion.git',
    '#    git push -u origin master',
    `# 4) Etiketi at ve gönder (sürüm ${VERSION}):`,
    `#    git tag -a v${VERSION} -m "Keyvotion Console v${VERSION}"`,
    `#    git push origin v${VERSION}`,
    '# 5) Checksum ile birlikte release yayınla:',
    `#    gh release create v${VERSION} "dist/${ZIP}" "dist/SHA256SUMS.txt" \\`,
    `#      --title "Keyvotion Console v${VERSION}" --notes-file CHANGELOG.md`,
    '# 6) Yayınlanan özeti doğrula (SHA256SUMS.txt ile aynı olmalı):',
    `#    certutil -hashfile "dist\\${ZIP}" SHA256`,
    '# ===========================================================================',
    '',
  ];
  console.log(lines.join('\n'));
}

/* ------------------------------------------------------------------------- */
/* Koşucu                                                                    */
/* ------------------------------------------------------------------------- */

function runStep(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(NODE, step.args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const cap = (chunk) => { out += chunk.toString('utf8'); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* yoksay */ }
    }, step.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, out: `${out}\n${err.message}`, ms: Date.now() - started, code: null });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, out, ms: Date.now() - started, code, timedOut });
    });
  });
}

const selected = STEPS.filter((s) => !STATIC_ONLY || !s.live);
const skipped = STEPS.filter((s) => STATIC_ONLY && s.live);

(async () => {
  printPublishCommands();
  if (STATIC_ONLY) {
    console.log(`# CI kipi: canlı Electron kapıları atlandı (${skipped.map((s) => s.id).join(', ')}).`);
    console.log('');
  }

  const results = [];
  for (let i = 0; i < selected.length; i += 1) {
    const step = selected[i];
    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${step.label} … `);
    const r = await runStep(step);
    let measure;
    try {
      measure = step.measure(r.out);
    } catch {
      measure = 'ölçüm hatası';
    }
    if (r.timedOut) measure = `zaman aşımı (${Math.round(step.timeoutMs / 1000)} s)`;
    else if (!r.ok && r.code === null) measure = 'başlatılamadı';
    console.log(`${measure} · ${r.ok ? 'GECTI' : 'KALDI'} · ${(r.ms / 1000).toFixed(1)} s`);
    if (!r.ok) {
      /* Kısa devre yok; yalnız son 3 satır ipucu olarak yazılır. */
      const tail = r.out.trim().split(/\r?\n/).filter(Boolean).slice(-3);
      for (const l of tail) console.log(`      ! ${l.slice(0, 160)}`);
    }
    results.push({ step, ok: r.ok, measure, ms: r.ms });
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`adım: ${results.length - failed.length}/${results.length} GECTI`);
  if (failed.length) console.log(`kalan: ${failed.map((r) => r.step.id).join(', ')}`);
  console.log(`YAYIN HAZIR: ${failed.length === 0 ? 'EVET' : 'HAYIR'}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
})().catch((err) => {
  console.error('HATA', err && err.message ? err.message : err);
  console.log('YAYIN HAZIR: HAYIR');
  process.exitCode = 1;
});
