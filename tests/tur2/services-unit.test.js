'use strict';

// Tur 2 / Servis birim testleri — gerçek .team verisi üzerinde SALT OKUNUR (EMİR T-020/T-025)
// Kaynak: .team/roster.md, .team/board.md, .team/models.md + K1 §4 veri şemaları.
//
// DİKKAT: Bu testler HiÇBiR .team dosyasına YAZMAZ. Yalnız read()/pool() çağrılır.
// Servis fabrikaları saf JS'tir (electron require etmez) — kökten require edilebilir.
// Alt sınırlar (≥7 kadro, ≥31 pano satırı, ≥12 havuz modeli) K1 kurulum gerçekliğidir;
// pano büyüdükçe üstüne çıkar, asla altına inmez.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ROOT } = require('../lib');

/* T-208: bu testler ARTIK herkese açık örnek veriyle çalışır.
   Önceden geliştiricinin yerel `.team/` klasörünü okuyorlardı; depo
   yayımlandığında özel veri taşımamak için sabit bir fixture kullanılır.
   Eşikler (≥7 kadro, ≥31 pano satırı, ≥12 havuz modeli) DEĞİŞMEDİ. */
const TEAM_FIXTURE = path.join(__dirname, '..', 'fixtures', 'team');

const { createRoster } = require(path.join(ROOT, 'src', 'main', 'services', 'roster.js'));
const { createBoardService, parseBoard } = require(path.join(ROOT, 'src', 'main', 'services', 'board.js'));
const { createModelsService, parsePool, parseGuide } = require(path.join(ROOT, 'src', 'main', 'services', 'models.js'));

const roster = createRoster({ getProjectDir: () => TEAM_FIXTURE });
const board = createBoardService({ getProjectDir: () => TEAM_FIXTURE });
const models = createModelsService({ http: null, getProjectDir: () => TEAM_FIXTURE });

test('tur2/services 1: roster.read() — ≥7 giriş, geçerli tekil kodlar, LDR seanslı, roles aynası', () => {
  const res = roster.read();
  assert.ok(res.ok, `roster.read() başarısız: ${JSON.stringify(res.error)}`);

  const entries = res.data.entries;
  assert.ok(entries.length >= 7, `kadro ≥7 rol beklenirdi; bulunan: ${entries.length}`);

  const codes = entries.map((e) => e.code);
  assert.strictEqual(new Set(codes).size, codes.length, `kadroda yinelenen kod: ${codes.join(',')}`);
  for (const entry of entries) {
    assert.match(entry.code, /^[A-Z][A-Z0-9]{1,5}$/, `geçersiz kod biçimi: ${entry.code} (C-1 deseni)`);
    assert.ok(typeof entry.role === 'string' && entry.role.length > 0, `${entry.code}: rol adı boş`);
  }

  // LDR mevcut ve canlı (seans kimliği taşır) — lider zinciri verisi.
  const ldr = entries.find((e) => e.code === 'LDR');
  assert.ok(ldr, 'kadroda LDR yok — komuta zinciri verisi eksik');
  assert.match(ldr.sessionID || '', /^ses_/, `LDR seans kimliği ses_ ile başlamalı; bulunan: ${JSON.stringify(ldr.sessionID)}`);

  // §9.1 aynası: roles[] aynı veriyi taşır (name = role metni).
  assert.strictEqual(res.data.roles.length, entries.length, 'roles[] aynası entries ile uzunlukta değil');
  const byCode = new Map(res.data.roles.map((r) => [r.code, r]));
  for (const entry of entries) {
    const mirror = byCode.get(entry.code);
    assert.ok(mirror, `roles[] aynasında ${entry.code} yok`);
    assert.strictEqual(mirror.name, entry.role, `${entry.code}: roles[].name entries[].role ile aynı değil`);
    assert.strictEqual(mirror.sessionID, entry.sessionID, `${entry.code}: roles[].sessionID kayıyor`);
  }

  assert.strictEqual(res.data.nextLeaderSessionID, ldr.sessionID,
    'nextLeaderSessionID LDR seansıyla aynı olmalı (devir senaryosunun verisi)');
});

test('tur2/services 2: board.read() — nextID biçimli ve satırların maksimumundan büyük, ≥31 satır', () => {
  const res = board.read();
  assert.ok(res.ok, `board.read() başarısız: ${JSON.stringify(res.error)}`);

  const data = res.data;
  assert.ok(data.rows.length >= 31, `pano ≥31 görev satırı beklenirdi; bulunan: ${data.rows.length}`);

  assert.match(data.nextID || '', /^T-\d{3}$/, `nextID T-xxx biçiminde değil: ${JSON.stringify(data.nextID)}`);
  const numbers = data.rows.map((r) => Number(r.id.slice(2)));
  const maxNum = numbers.length ? Math.max(...numbers) : 0;
  assert.ok(
    Number(data.nextID.slice(2)) > maxNum,
    `nextID (${data.nextID}) mevcut maksimum görevden büyük olmalı (maks: T-${String(maxNum).padStart(3, '0')}) — çakışan yeni kimlik riski`
  );

  // Durumlar geçerli kümeden; her satır sahiplik ve kanıt alanı taşır.
  const valid = new Set(board.VALID_STATUS);
  for (const row of data.rows) {
    assert.ok(valid.has(row.status), `geçersiz durum: ${row.id} → ${JSON.stringify(row.status)}`);
    assert.match(row.id, /^T-\d{3}$/, `satır kimliği bozuk: ${JSON.stringify(row.id)}`);
    assert.ok(typeof row.title === 'string' && row.title.length > 0, `${row.id}: başlık boş`);
  }

  // Aşamalar satırları kapsıyor (her satır bir aşamaya bağlı ya da null — bölünme kaybı yok).
  assert.ok(data.phases.length >= 1, 'panoda aşama başlığı yok (## Aşama …)');
  const phaseTitles = new Set(data.phases.map((p) => p.title));
  for (const row of data.rows) {
    assert.ok(row.phase === null || phaseTitles.has(row.phase),
      `${row.id}: aşaması (${row.phase}) pano aşama listesinde yok`);
  }
});

test('tur2/services 3: parseBoard bozuk girdiyi çökmeden yok sayar (kabuk dayanıklılığı)', () => {
  // Boş/kirli markdown → satır yok, nextID null; exception YOK (7.2.5: bozuk markdown çökmez).
  const empty = parseBoard('');
  assert.deepStrictEqual(empty.rows, []);
  assert.strictEqual(empty.nextID, null);

  const junk = parseBoard('# başlık\n| ne | alakasız |\n|---|---|\n| x | y |');
  assert.deepStrictEqual(junk.rows, [], 'ID başlıklı tablo olmayan satırlar göreve dönüşmemeli');
  assert.strictEqual(junk.nextID, null);
});

test('tur2/services 4: models.pool() — ≥12 model, hepsi evren sağlayıcısı, tekil kimlikler', () => {
  const res = models.pool();
  assert.ok(res.ok, `models.pool() başarısız: ${JSON.stringify(res.error)}`);
  assert.strictEqual(res.data.available, true, 'models.md okunamadı (available:false) — havuz verisi yok');

  const pool = res.data.pool;
  assert.ok(pool.length >= 12, `model havuzu ≥12 beklenirdi; bulunan: ${pool.length}`);

  const ids = pool.map((m) => m.id);
  assert.strictEqual(new Set(ids).size, ids.length, `havuzda yinelenen model kimliği: ${ids.join(', ')}`);
  for (const item of pool) {
    assert.strictEqual(item.providerID, 'evren', `havuz dışı sağlayıcı: ${item.id} (${item.providerID}) — model politikası ihlali`);
    assert.ok(typeof item.modelID === 'string' && item.modelID.length > 0, `model kimliği boş: ${JSON.stringify(item.id)}`);
    assert.ok(typeof item.character === 'string', `${item.id}: karakter alanı yok`);
  }
});

test('tur2/services 5: parseGuide — görev tipi kilavuzu ≥5 satır; primary/fallback havuz biçiminde', () => {
  const res = models.pool();
  assert.ok(res.ok);
  const guide = res.data.guide;
  assert.ok(guide.length >= 5, `model kilavuzu ≥5 satır beklenirdi; bulunan: ${guide.length}`);

  const poolIds = new Set(res.data.pool.map((m) => m.id));
  for (const row of guide) {
    assert.ok(typeof row.taskType === 'string' && row.taskType.length > 0, `kilavuz satırında görev tipi boş: ${JSON.stringify(row)}`);
    assert.match(row.primary || '', /^[a-z-]+\/.+/, `primary "sağlayıcı/model" biçiminde değil: ${JSON.stringify(row.primary)}`);
    assert.match(row.fallback || '', /^[a-z-]+\/.+/, `fallback "sağlayıcı/model" biçiminde değil: ${JSON.stringify(row.fallback)}`);
    assert.ok(poolIds.has(row.primary) || poolIds.has(row.fallback),
      `kilavuz satırı havuzla bağlantısız (primary/fallback hiçbiri havuzda değil): ${row.primary} / ${row.fallback}`);
  }
});

test('tur2/services 6: parsePool/parseGuide boş girdide boş liste döner (çökmez)', () => {
  assert.deepStrictEqual(parsePool(''), []);
  assert.deepStrictEqual(parseGuide(''), []);
  assert.deepStrictEqual(parsePool('# model yok\n| a | b |\n|---|---|\n| x | y |'), [],
    'Model başlıklı tablo yoksa havuz üretilmemeli');
});
