'use strict';

// T-093a — Tur 10 / `.team/log/decisions.md` ayrıştırma dayanıklılığı (İSKELET).
//
// Gerçek dosya: 1..20 kart, throw yok.
// Bozuk fixture: `readFileSync` patlar (decisions.md bir DİZİN) → E_PARSE veya boş dizi,
// ama liste çağrısı ASLA throw etmez.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../lib');

/* T-208: gerçek özel .team/ yerine herkese açık fixture kullanılır. */
const TEAM_FIXTURE = path.join(__dirname, '..', 'fixtures', 'team');

const { createReportsService } = require(path.join(ROOT, 'src', 'main', 'services', 'reports.js'));

function serviceFor(projectDir) {
  return createReportsService({
    sessions: {
      list: async () => ({ ok: false, error: { code: 'E_OFFLINE', message: 'tur10 fixture' } })
    },
    messages: {
      reports: async () => ({ ok: false, error: { code: 'E_OFFLINE', message: 'tur10 fixture' } })
    },
    getProjectDir: () => projectDir
  });
}

function makeFixtureDir(suffix) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'work', `t093-${suffix}-`));
  fs.mkdirSync(path.join(dir, '.team', 'log'), { recursive: true });
  return dir;
}

test('tur10/decisions 1: gerçek decisions.md 1..20 kart üretir ve throw etmez', async () => {
  const res = await serviceFor(TEAM_FIXTURE).list();
  assert.strictEqual(res.ok, true, 'reports.list hata döndü');
  const cycles = res.data.leaderCycles;
  assert.ok(Array.isArray(cycles), 'leaderCycles dizi değil');
  assert.ok(cycles.length >= 1, `gerçek decisions.md kart üretmedi (${cycles.length})`);
  assert.ok(cycles.length <= 20, `kart sayısı 20'yi aşıyor (${cycles.length})`);
});

test('tur10/decisions 2: bozuk fixture (okunamayan decisions.md) → E_PARSE/boş dizi, throw yok', async () => {
  const dir = makeFixtureDir('broken');
  const decisionsPath = path.join(dir, '.team', 'log', 'decisions.md');
  try {
    // Dizin oluştur: readFileSync EISDIR ile patlar → catch dalı (E_PARSE).
    fs.mkdirSync(decisionsPath);

    let res;
    await assert.doesNotReject(async () => {
      res = await serviceFor(dir).list();
    }, 'bozuk decisions.md list() çağrısını fırlattı');

    assert.strictEqual(res.ok, true, 'liste bozuk fixture yüzünden hata zarfı döndü');
    assert.ok(Array.isArray(res.data.leaderCycles), 'leaderCycles dizi değil');
    assert.deepStrictEqual(res.data.leaderCycles, [], 'bozuk fixture boş dizi döndürmeli (E_PARSE yutulur)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tur10/decisions 3: başlıksız fixture → boş dizi, throw yok', async () => {
  const dir = makeFixtureDir('noheadings');
  try {
    fs.writeFileSync(path.join(dir, '.team', 'log', 'decisions.md'),
      '# Kararlar\n\nBu dosyada H2 başlığı yok.\n', 'utf8');

    let res;
    await assert.doesNotReject(async () => {
      res = await serviceFor(dir).list();
    }, 'başlıksız fixture list() çağrısını fırlattı');

    assert.strictEqual(res.ok, true, 'liste başlıksız fixture yüzünden hata zarfı döndü');
    assert.deepStrictEqual(res.data.leaderCycles, [], 'H2 yoksa boş dizi beklenir');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
