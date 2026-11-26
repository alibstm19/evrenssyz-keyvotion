'use strict';

// K1 planı §7.2 — 10 MVP kabul ölçütünün madde madde test turu (T-015 hedef 2)
// Durumlar: PASS (ölçüt karşılanıyor) · FAIL (ölçüt karşılanmıyor — konum+öneri raporda)
//
// Dikkat: "kabuk var" ≠ "ölçüt karşılandı". Her ölçüt, veri kaynağı/davranış sinyali
// arar; yalnız DOM kancası veya sabit ad eşleşmesi geçmiş sayılmaz.
//
// v2.1 (EMİR T-025): 7.2.1b ve 7.2.8 todo'dan gerçek ölçüme çevrildi (skip/TODO yasak);
// 7.2.4a/4b bağlantı görünümü gerçek yapılara (CONNECTION_VIEWS/setConnection/pingConnection/
// BACKOFF_MS) bağlandı; 7.2.10 gezinme metni çıkarımı dekoratif ikon gliflerini atlayacak
// şekilde düzeltildi (eski regex ◫ ⌘ ▤ ◈ ✎ ⚙ gliflerini metin sanıyordu).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execSync } = require('node:child_process');
const {
  ROOT, RENDERER, SRC, ELECTRON_EXE, walk, isRendererCode, read, readIfExists,
  grepLines, passwordMentionsUnsanctioned
} = require('./lib');

const html = read(path.join(RENDERER, 'index.html'));
const appJs = read(path.join(RENDERER, 'app.js'));
const mainJs = read(path.join(SRC, 'main', 'main.js'));
const preloadJs = read(path.join(SRC, 'preload', 'preload.js'));
const eventsJs = read(path.join(SRC, 'main', 'services', 'events.js'));
const backend = mainJs + preloadJs;
const rendererFiles = walk(RENDERER, isRendererCode);

// §7.2/1 — npm.cmd start ile açılır (T9 canlı test eder); 3 sn ilk kare görsel doğrulama ister.
test('7.2.1: uygulama açılış akışı tanımlı (whenReady → createWindow, ready-to-show)', () => {
  assert.match(mainJs, /app\.whenReady/, 'main.js whenReady ile açılmıyor');
  assert.match(mainJs, /function createWindow/, 'main.js createWindow tanımlı değil');
  assert.match(mainJs, /ready-to-show/, 'ready-to-show ile ilk kare beklenmiyor (beyaz parlamayı önler)');
});

// v2.1: todo → gerçek ölçüm. Elektron uygulaması gerçekten başlatılır; pencere başlığının
// ("Keyvotion Console") süreç tablosunda görünmesi beklenir. main.js show:false +
// ready-to-show ile pencereyi İLK KAREDEN SONRA gösterir; başlık ölçümü pencerenin
// yaratılıp gösterilmeye hazır olduğunun gerçek sinyalidir (tam görsel doğrulama DSN
// turunun işidir). Ölçüm kökenli gecikme de (tasklist) bütçenin içindedir — konservatif.
test('7.2.1b: ilk kare 3 sn içinde çiziliyor (pencere 3 sn içinde görünür oluyor)', { timeout: 30000 }, async () => {
  assert.ok(fs.existsSync(ELECTRON_EXE), `electron binary bulunamadı: ${ELECTRON_EXE}`);

  const child = spawn(ELECTRON_EXE, ['.'], { cwd: SRC, stdio: ['ignore', 'ignore', 'ignore'] });
  const t0 = Date.now();
  let titleAtMs = null;

  try {
    while (Date.now() - t0 <= 3000) {
      const res = spawnSync('tasklist', ['/V', '/FI', `PID eq ${child.pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      if (((res.stdout || '')).includes('Keyvotion Console')) {
        titleAtMs = Date.now() - t0;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(
      titleAtMs !== null,
      'pencere başlığı ("Keyvotion Console") 3 sn içinde süreç tablosunda görünmedi — ' +
        'ilk kare 3 sn bütçesini aşıyor olabilir (K1 §7.2/1) ya da pencere hiç açılmıyor'
    );
    assert.ok(titleAtMs <= 3000, `pencere görünürlüğü ${titleAtMs} ms’de geldi; bütçe 3000 ms (K1 §7.2/1)`);
  } finally {
    // Windows: süreç ağacını temizle (renderer/GPU çocuk süreçleriyle birlikte) — t09 deseni.
    if (child.exitCode === null && !child.killed) {
      try {
        execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        child.kill();
      }
    }
  }
});

// §7.2/2 — bağlıyken kartlar görünür; kayıp seans işaretlenir.
test('7.2.2: ekip ekranı seans listesini kanaldan alıp kart üretiyor', () => {
  const hasTeamChannel = /kv:team:(list|refresh)/.test(backend);
  const hasCardCreation = /data-role-card/.test(appJs) && /(createElement|cloneNode|insertAdjacentHTML|appendChild|importNode)/.test(appJs);
  assert.ok(
    hasTeamChannel && hasCardCreation,
    'henüz uygulanmamış: seans listesi kanalı (kv:team:list / kv:team:refresh, API §7.2) yok ve ' +
      'app.js kart ÜRETİYOR değil. (DEV kapsamı)'
  );
});

// §7.2/3 — komut onay modalı zorunlu; audit'te metin yok.
test('7.2.3: komut gönderimi onay diyaloğundan geçiyor (data-confirm-dialog)', () => {
  const hasConfirm = /data-confirm-dialog|confirm-send|confirmToken/.test(html + appJs + backend);
  assert.ok(
    hasConfirm,
    'henüz uygulanmamış: onay diyaloğu (UI §4.2) ve confirmToken (API-41) yok.'
  );
});

// §7.2/4 — sunucu kapalıyken çevrimdışı bandı; açılınca kendiliğinden toparlanma.
// v2.1: gerçek yapılara bağlandı — CONNECTION_VIEWS (§5.3 + 'no-password' uzantısı, YM),
// setConnection rozet kanallarını (data-connection/data-state/tone) yazar.
test('7.2.4a: çevrimdışı görünüm tanımlı (rozet + durum kodu eşlemesi)', () => {
  assert.match(appJs, /const CONNECTION_VIEWS/, 'app.js CONNECTION_VIEWS tablosu yok');
  assert.match(appJs, /offline:\s*\{\s*text:\s*'Çevrimdışı'/, 'CONNECTION_VIEWS içinde offline görünümü yok');
  assert.match(appJs, /unauthorized:\s*\{\s*text:\s*'Parola geçersiz'/, 'CONNECTION_VIEWS içinde unauthorized görünümü yok');
  assert.match(appJs, /E_OFFLINE/, 'app.js E_OFFLINE hata kodunu eşlemiyor (API §5.2)');
  assert.match(html, /data-connection/, 'rozet data-connection kanca taşıyor (UI-15) — index.html’de yok');
  assert.match(appJs, /dataset\.connection\s*=\s*state/, 'setConnection data-connection yazmıyor');
  assert.match(appJs, /dataset\.state\s*=\s*view\.state/, 'setConnection §5.1 data-state yazmıyor (UI-15)');
});

// v2.1: toparlanma iki tarafta ölçülür — main'de SSE istemcisi (BACKOFF_MS 1→2→4→8→16→30,
// API-36; bağlanınca tam uzlaştırma, API-32), renderer'da pingConnection + bağlantı
// push'unu (kind === 'connection') rozete uygulama.
test('7.2.4b: bağlantı kopunca kendiliğinden toparlanma (yeniden deneme/uzlaştırma)', () => {
  // main: üstel geri çekilme merdiveni birebir (API-36: 1,2,4,8,16,30 sn; sonra 30 sabit)
  const backoffMatch = eventsJs.match(/const BACKOFF_MS\s*=\s*\[([^\]]+)\]/);
  assert.ok(backoffMatch, 'events.js BACKOFF_MS merdiveni yok (API-36)');
  const ladder = backoffMatch[1].split(',').map((x) => Number(x.trim()));
  assert.deepStrictEqual(ladder, [1000, 2000, 4000, 8000, 16000, 30000],
    `BACKOFF_MS merdiveni sözleşmeden sapıyor: ${ladder.join(', ')} (API-36)`);
  assert.match(eventsJs, /function scheduleReconnect/, 'events.js scheduleReconnect yok — kopunca yeniden deneme yok');
  assert.match(eventsJs, /onConnection\('connected'\)/, "bağlanınca onConnection('connected') bildirilmiyor");
  assert.match(eventsJs, /await onResync\(\)/, 'bağlanınca tam uzlaştırma (onResync) çağrılmıyor (API-32/37)');

  // main: bağlantı durumu renderer'a push edilir (scheduleResync → kv:event:connection)
  assert.match(mainJs, /EVENT_CONNECTION/, 'main.js bağlantı durumu push etmiyor (kv:event:connection)');

  // renderer: açılışta pingConnection ile durum ölçülür; bağlantı push'u rozete uygulanır
  assert.match(appJs, /async function pingConnection/, 'app.js pingConnection yok — açılışta bağlantı ölçülmüyor');
  assert.match(appJs, /setConnection\('connecting'\)/, "pingConnection 'connecting' ile başlamıyor");
  assert.match(appJs, /kind === 'connection'/, "bindEvents bağlantı push'unu (kind === 'connection') işlemiyor");
});

// §7.2/5 — board.md değişince pano güncellenir; bozuk markdown çökmez.
test('7.2.5: pano veri katmanı (board.md okuma/izleme) bağlanmış', () => {
  const hasBoardChannel = /kv:board:read/.test(backend);
  const hasBoardLogic = /(BoardService|fs\.watch|data-board-row|data-board-next)/.test(mainJs + appJs);
  assert.ok(
    hasBoardChannel || hasBoardLogic,
    'henüz uygulanmamış: board ekranının kabuğu (data-board-root) var ama veri katmanı yok'
  );
});

// §7.2/6 — renderer'da sır deseni yok (değer düzeyinde; alan adı istisnası C7).
// v2.1: onaylı biçimler lib.passwordMentionsUnsanctioned içinde (API-52/§5.3; EMİR T-025).
test('7.2.6: renderer içinde parola DEĞERİ / apiKey / Authorization → 0', () => {
  const hits = [];
  for (const file of rendererFiles) {
    for (const line of grepLines(read(file), /apiKey|password|authorization/i, path.relative(RENDERER, file))) {
      if (passwordMentionsUnsanctioned(line)) hits.push(line);
    }
  }
  assert.strictEqual(hits.length, 0, `sır deseni sızıyor:\n  - ${hits.join('\n  - ')}`);
});

// §7.2/7 — renderer'da fetch/require yok; main'de nodeIntegration kapalı.
test('7.2.7: renderer dosyalarda fetch(/require( yok; main.js güvenlik bayrakları açık', () => {
  const hits = [];
  for (const file of rendererFiles) {
    hits.push(...grepLines(read(file), /fetch\(|require\(/, path.relative(RENDERER, file)));
  }
  assert.strictEqual(hits.length, 0, `renderer'da yasak çağrı:\n  - ${hits.join('\n  - ')}`);
  assert.match(mainJs, /nodeIntegration:\s*false/, 'main.js nodeIntegration:false değil');
  assert.match(mainJs, /contextIsolation:\s*true/, 'main.js contextIsolation:true değil');
  assert.match(mainJs, /sandbox:\s*true/, 'main.js sandbox:true değil');
});

// §7.2/8 — ayarlar/sır saklama. v2.1: todo → gerçek disk denetimi (SettingsService artık var).
// Yalnız OKUNUR — test userData'ya asla yazmaz. Parola kaydedilmemişse secrets.bin olmayabilir;
// bu geçerli durumdur ("Parola gerekli" görünümü).
test('7.2.8: ayarlar/sır saklama — SettingsService + userData disk durumları', () => {
  // Kod tarafı: servis var, sır yalnız safeStorage (DPAPI) ile, config şablonunda sır yok.
  const settingsJs = read(path.join(SRC, 'main', 'services', 'settings.js'));
  assert.match(settingsJs, /function createSettings/, 'settings.js createSettings yok — SettingsService yok');
  assert.match(settingsJs, /safeStorage/, 'settings.js safeStorage kullanmıyor — sır düz metne yazılabilir');
  assert.match(settingsJs, /secrets\.bin/, 'settings.js secrets.bin yolu yok');
  const defaults = settingsJs.match(/const DEFAULT_CONFIG\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
  assert.ok(defaults, 'settings.js DEFAULT_CONFIG yok');
  assert.doesNotMatch(defaults[1], /password|apiKey|secret/i, 'DEFAULT_CONFIG sır alanı taşıyor (§4.6)');

  // Disk tarafı: %APPDATA%\keyvotion-console (yalnız okuma).
  const userData = path.join(process.env.APPDATA || '', 'keyvotion-console');
  assert.ok(fs.existsSync(userData), `userData dizini yok: ${userData}`);

  const cfgPath = path.join(userData, 'config.json');
  assert.ok(fs.existsSync(cfgPath), `config.json yok: ${cfgPath} (SettingsService hiç çalışmamış olabilir)`);
  const cfgRaw = read(cfgPath);
  let cfg;
  try {
    cfg = JSON.parse(cfgRaw);
  } catch {
    assert.fail(`config.json ayrıştırılamıyor (bozuk yazım): ${cfgRaw.slice(0, 120)}`);
  }
  const allowed = ['serverURL', 'projectDir', 'theme', 'density', 'language', 'locale', 'notifications', 'schemaVersion', 'onboarded'];
  const badKeys = Object.keys(cfg).filter((k) => !allowed.includes(k));
  assert.strictEqual(badKeys.length, 0, `config.json içinde izin dışı anahtar: ${badKeys.join(', ')} (§4.6 beyaz liste)`);
  assert.doesNotMatch(cfgRaw, /password|apiKey|authorization/i, 'config.json sır deseni taşıyor (§4.6: sır yok)');

  const auditPath = path.join(userData, 'logs', 'audit.jsonl');
  assert.ok(fs.existsSync(auditPath), `logs/audit.jsonl yok: ${auditPath}`);
  const auditLines = read(auditPath).split(/\r?\n/).filter(Boolean);
  assert.ok(auditLines.length >= 1, 'audit.jsonl boş');
  for (const line of auditLines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      assert.fail(`audit.jsonl bozuk satır: ${line.slice(0, 120)}`);
    }
    assert.ok(rec && typeof rec.op === 'string' && typeof rec.code === 'string',
      `audit satırı op/code taşımıyor (API-30 üst veri): ${line.slice(0, 120)}`);
    assert.doesNotMatch(line, /password|apiKey|authorization/i,
      `audit satırında sır deseni var (API-30): ${line.slice(0, 120)}`);
  }

  // secrets.bin: yoksa geçerli (parola kaydedilmemiş); varsa düz metin olmamalı.
  const binPath = path.join(userData, 'secrets.bin');
  if (fs.existsSync(binPath)) {
    const raw = fs.readFileSync(binPath, 'utf8');
    assert.doesNotMatch(raw, /"password"|password\s*:/i, 'secrets.bin düz metin görünüyor — safeStorage (DPAPI) şifreli olmalı');
  }
});

test('7.2.8b: bugün main süreçte parolayı diske yazan kod yok', () => {
  assert.doesNotMatch(mainJs, /writeFile|appendFile|createWriteStream/, 'main.js dosyaya yazıyor — parola diske sızmış olabilir');
  const configJson = readIfExists(path.join(SRC, 'config.json'));
  assert.ok(!configJson || !/password|apiKey/i.test(configJson), 'src/config.json içinde sır deseni var');
});

// §7.2/9 — tema değişimi yeniden başlatma gerektirmez; reduced-motion.
test('7.2.9a: tema değiştirici markup VE JS bağlantısı mevcut (yeniden başlatma olmadan)', () => {
  const hasMarkup = /data-theme-set|data-field=["']theme["']|toggle-theme/.test(html);
  const hasWiring = /data-theme/.test(appJs);
  assert.ok(
    hasMarkup && hasWiring,
    hasMarkup
      ? 'markup var (tema düğmeleri) ama app.js bağlantısı yok — düğme basıldığında <html data-theme> değişmez'
      : 'tema değiştirici hiç yok (UI §4.5 data-field="theme"; UI-47)'
  );
});
test('7.2.9b: prefers-reduced-motion kuralı stil dosyalarında (UI-48)', () => {
  const stylesDir = path.join(RENDERER, 'styles');
  const css = walk(stylesDir, (f) => f.endsWith('.css')).map(read).join('\n');
  assert.ok(
    css.length > 0 && /prefers-reduced-motion/.test(css),
    'styles/ teslimi sürüyor: prefers-reduced-motion kuralı hiçbir teslim edilmiş css dosyasında yok (UI-48)'
  );
});

// §7.2/10 — Türkçe arayüz, İngilizce tanımlayıcı.
// v2.1: gezinme ETİKETİ çıkarımı düzeltildi — düğme içinden <span class="kv-nav__icon">…
// (dekoratif glif) ve <kbd> (kısayol) atılır, kalan etiket metni Türkçe olur. Eski regex
// ilk metin düğümünü alıyordu ve ◫ ⌘ ▤ ◈ ✎ ⚙ gliflerini "metin" sanıyordu (ölçüm hatası).
test('7.2.10: arayüz Türkçe (lang=tr, görünür metinler), tanımlayıcılar İngilizce', () => {
  assert.match(html, /<html[^>]+lang=["']tr["']/, 'lang="tr" yok (AGENTS.md dil kuralı)');
  const dataValues = [...html.matchAll(/data-[a-z-]+=["']([^"']*)["']/g)].map((m) => m[1]).filter((v) => v.length > 0);
  const nonAscii = dataValues.filter((v) => !/^[a-z0-9.:\-]+$/i.test(v));
  assert.strictEqual(nonAscii.length, 0, `data-* değerinde ASCII olmayan karakter: ${nonAscii.join(', ')}`);

  const navButtons = [...html.matchAll(/<button[^>]*data-nav-item=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/g)];
  assert.ok(navButtons.length >= 6, `en az 6 gezinme düğmesi beklenirdi; ${navButtons.length}`);
  const navTexts = navButtons.map((m) => {
    let inner = m[2];
    inner = inner.replace(/<span[^>]*kv-nav__icon[^>]*>[\s\S]*?<\/span>/g, ''); // dekoratif ikon
    inner = inner.replace(/<kbd[\s\S]*?<\/kbd>/g, ''); // klavye kısayolu
    return inner.replace(/<[^>]+>/g, '').trim(); // kalan etiketleri soyup metni al
  }).filter(Boolean);
  assert.strictEqual(navTexts.length, navButtons.length, 'gezinme düğmelerinden etiket metni çıkarılamadı');
  const nonTurkish = navTexts.filter((t) => !/[çğıöşüÇĞİÖŞÜa-z]/i.test(t));
  assert.strictEqual(nonTurkish.length, 0, `gezinme etiketi Türkçe harf içermiyor: ${nonTurkish.join(', ')}`);
});
