'use strict';
/**
 * Keyvotion Console — zero-dependency packager.
 *
 * Copies the local Electron runtime + application sources into
 * `dist/Keyvotion Console/`, renames the executable, and (optionally)
 * produces a ZIP. Only Node standard library is used.
 *
 * Usage:
 *   node tools/package.js              # build dist/Keyvotion Console
 *   node tools/package.js --zip        # build + ZIP archive
 *   node tools/package.js --verify     # build + launch check via CDP
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'Keyvotion Console');
const EXE_NAME = 'Keyvotion Console.exe';
/* T-192: portu işletim sistemi atar; sabit port çakışması paket kapısını
   rastgele kırmızıya çeviriyordu. KV_CDP_PORT yalnız hata ayıklama içindir. */
const { freePort } = require('./verify/lib/cdp');
const { zipDirectory, verifyArchive } = require('./lib/deterministic-zip');
/* T-190: önyükleme bütçesi — soğuk disk/AV taraması payı bırakılmış üst sınır. */
const BOOT_BUDGET_MS = 3000;
const POLL_MS = 100;

const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
const VERSION = pkg.version || '0.0.0';

function log(...m) { console.log('[package]', ...m); }

function copyDir(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (filter && !filter(src, e)) continue;
    if (e.isDirectory()) copyDir(src, dst, filter);
    else if (e.isFile()) fs.copyFileSync(src, dst);
  }
}

function freshDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

const { assertPublicFiles } = require('./verify/public-content');

function sourceFiles(root, directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(root, relative) : [relative];
  });
}

function build() {
  const electronDist = path.join(SRC, 'node_modules', 'electron', 'dist');
  if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) {
    throw new Error('Electron runtime not found: src/node_modules/electron/dist. Run "npm ci" in src first.');
  }

  const appFolders = ['main', 'preload', 'renderer', 'shared', 'assets'];
  assertPublicFiles(SRC, appFolders.filter((folder) => fs.existsSync(path.join(SRC, folder)))
    .flatMap((folder) => sourceFiles(SRC, folder)));

  log('clean target', path.relative(ROOT, OUT));
  freshDir(OUT);

  log('copy electron runtime');
  copyDir(electronDist, OUT);

  const exeSrc = path.join(OUT, 'electron.exe');
  const exeDst = path.join(OUT, EXE_NAME);
  fs.renameSync(exeSrc, exeDst);
  log('renamed executable ->', EXE_NAME);

  const appDir = path.join(OUT, 'resources', 'app');
  log('copy application sources -> resources/app');
  for (const name of appFolders) {
    const from = path.join(SRC, name);
    if (fs.existsSync(from)) copyDir(from, path.join(appDir, name));
  }
  // Electron launcher expects main/main.js inside resources/app.
  const appPkg = {
    name: pkg.name,
    productName: 'Keyvotion Console',
    version: VERSION,
    private: true,
    main: 'main/main.js',
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
  };
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n');

  for (const name of ['Kur.cmd', 'install.ps1']) {
    fs.copyFileSync(path.join(__dirname, name), path.join(OUT, name));
  }
  fs.writeFileSync(path.join(OUT, 'Temiz-Deneme.cmd'), '@echo off\r\nstart "" "%~dp0Keyvotion Console.exe" --clean-profile\r\n', 'utf8');
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(OUT, 'LICENSE-KEYVOTION.txt'));
  fs.writeFileSync(path.join(OUT, 'BASLA.txt'), [
    'Keyvotion Console ' + VERSION,
    'Windows 10 / 11 x64',
    '',
    'Arşivin tamamını çıkar. Kur.cmd ile kur veya Keyvotion Console.exe ile taşınabilir çalıştır.',
    'İlk açılışı mevcut verilerden ayrı denemek için Temiz-Deneme.cmd dosyasını aç.',
    'İlk ekranda Bağlantı kurmadan gez veya Model bağla seçeneklerinden birini seç.',
    'Sorun bildirirken Rehber ekranındaki Geri bildirim bağlantısını kullan.',
    ''
  ].join('\r\n'), 'utf8');

  const screens = countScreens(path.join(appDir, 'renderer', 'index.html'));
  const size = dirSize(OUT);
  log('app packaged:', (size / 1048576).toFixed(1), 'MB;', screens, 'screens in index.html');
  return { exe: exeDst, appDir, screens, size };
}

function countScreens(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  return new Set((html.match(/data-screen="[a-z0-9-]+"/g) || [])).size;
}

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else if (e.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/*
 * T-190: önyükleme ölçümü.
 *
 * Eski sürüm 500 ms'de bir yokluyordu; sonuç 500 ms'lik kovaya yuvarlanıyordu
 * (490–518 ≈ ilk kova, 1102 ≈ ikinci kova). Ölçüm "iki kat yavaşladı" gibi
 * görünüyordu ama gerçek fark bir kova sıçramasıydı. Artık 100 ms'de bir
 * yoklanıyor ve üst bütçe aşılırsa paket doğrulaması kırmızıya dönüyor.
 */
async function verifyOnce(exe) {
  const port = process.env.KV_CDP_PORT ? Number(process.env.KV_CDP_PORT) : await freePort();
  log('launch verify on CDP port', port);
  const child = spawn(exe, [`--remote-debugging-port=${port}`], {
    cwd: OUT,
    detached: false,
    stdio: 'ignore',
  });
  const started = Date.now();
  let page = null;
  try {
    for (let i = 0; i < 100; i += 1) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const list = await getJson(port, '/json/list');
        const found = (list || []).find((p) => p.type === 'page' && /Keyvotion/i.test(p.title || ''));
        if (found) { page = found; break; }
      } catch { /* not ready yet */ }
    }
  } finally {
    try { child.kill(); } catch { /* ignore */ }
  }
  const elapsedMs = Date.now() - started;
  if (!page) return { page: null, elapsedMs };
  return { page, elapsedMs };
}

/*
 * T-192: OS ataması + kısa geri çekilme.
 *
 * Port çakışması pratikte bitti (listen(0) ayrılmış aralıklara düşmez), yine
 * de pencere hiç açılmazsa tek kez yeni portla denenir; bütçe aşımı gerçek
 * yavaşlık olduğu için yeniden denenmez (yeşili uydurmamak için).
 */
async function verify(exe) {
  let attempt = await verifyOnce(exe);
  if (!attempt.page) {
    log('window did not appear; retrying once with a fresh port');
    attempt = await verifyOnce(exe);
  }
  const { page, elapsedMs } = attempt;
  if (!page) throw new Error(`window did not appear within ${elapsedMs} ms`);
  if (elapsedMs > BOOT_BUDGET_MS) {
    throw new Error(`boot budget exceeded: ${elapsedMs} ms > ${BOOT_BUDGET_MS} ms`);
  }
  log('boot', elapsedMs, 'ms (budget', BOOT_BUDGET_MS, 'ms)');
  return { title: page.title, url: page.url, elapsedMs, budgetMs: BOOT_BUDGET_MS };
}

async function zip() {
  const target = path.join(ROOT, 'dist', `Keyvotion-Console-win32-x64-v${VERSION}.zip`);
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  log('zip ->', path.relative(ROOT, target));
  /* T-195: eski zip yolu her dosyanın disk zaman damgasını arşive yazdığı için
     aynı kaynaktan farklı SHA üretiyordu. Deterministik yazıcı sabit damga ve
     sıralı giriş kullanır; aynı `src/` her zaman aynı özeti verir. */
  const tmpDir = fs.mkdtempSync(path.join(ROOT, 'dist', '.zip-'));
  let result;
  try {
    result = await zipDirectory(OUT, target, { tmpDir });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  const check = await verifyArchive(target);
  if (check.entries.length !== result.entries) {
    throw new Error(`zip self-check failed: ${check.entries.length} entries read, ${result.entries} written`);
  }
  log('zip entries', result.entries, 'uncompressed', (dirSize(OUT) / 1048576).toFixed(1), 'MB');
  return target;
}

function sha256(file) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function writeChecksums(files) {
  const target = path.join(ROOT, 'dist', 'SHA256SUMS.txt');
  const lines = files.map((file) => `${sha256(file)}  ${path.basename(file)}`);
  fs.writeFileSync(target, lines.join('\n') + '\n');
  log('checksums ->', path.relative(ROOT, target));
  return target;
}

(async () => {
  const result = build();
  const report = { at: new Date().toISOString(), version: VERSION, exe: path.relative(ROOT, result.exe), screens: result.screens, sizeBytes: result.size };
  if (args.has('--verify')) report.verify = await verify(result.exe);
  if (args.has('--zip') || args.has('--verify')) {
    const archive = await zip();
    report.zip = path.relative(ROOT, archive);
    report.checksums = path.relative(ROOT, writeChecksums([archive]));
  }
  const out = path.join(ROOT, 'work', 'package-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  log('report ->', path.relative(ROOT, out));
  log('OK');
})().catch((err) => {
  console.error('[package] FAILED:', err.message);
  process.exit(1);
});
