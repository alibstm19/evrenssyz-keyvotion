'use strict';

// T-093a — Tur 10 / leaderCycles alan sözleşmesi (İSKELET).
//
// Kapsam: yalnız `reports.list()` yanıtındaki `leaderCycles` alanı.
// T-089 DEV tarafı yarım olduğu için bu dosyadaki testler KIRMIZI olabilir;
// bu beklenen durumdur ve skip/todo ile gizlenmez.
//
// Not: `readLeaderCycles` dışa açılmaz; servis `createReportsService().list()`
// üzerinden çağrılır. Oturum kaynağı bilinçli olarak `ok:false` döner; böylece
// ölçüm yalnız dosya kaynağına (`.team/log/decisions.md`) bakar.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ROOT } = require('../lib');

/* T-208: testler herkese açık fixture ile çalışır (özel .team/ verisi depoda yok). */
const TEAM_FIXTURE = path.join(__dirname, '..', 'fixtures', 'team');

const { createReportsService } = require(path.join(ROOT, 'src', 'main', 'services', 'reports.js'));

const CARD_FIELDS = ['at', 'title', 'status', 'intent', 'idea', 'derived'];
const MISSING_LABELS = [null, '—'];

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

test('tur10/leaderCycles 1: reports.list() yanıtında leaderCycles alanı dizi olarak vardır', async () => {
  const res = await serviceFor(TEAM_FIXTURE).list();
  assert.strictEqual(res.ok, true, `reports.list hata döndü: ${JSON.stringify(res.error || null)}`);
  assert.ok(Object.prototype.hasOwnProperty.call(res.data, 'leaderCycles'),
    'yanıtta leaderCycles alanı yok');
  assert.ok(Array.isArray(res.data.leaderCycles), 'leaderCycles dizi değil');
});

test('tur10/leaderCycles 2: kart sayısı en fazla 20', async () => {
  const res = await serviceFor(TEAM_FIXTURE).list();
  assert.ok(Array.isArray(res.data.leaderCycles), 'leaderCycles dizi değil');
  assert.ok(res.data.leaderCycles.length <= 20,
    `kart sayısı 20'yi aşıyor: ${res.data.leaderCycles.length}`);
});

test('tur10/leaderCycles 3: her kart at/title/status/intent/idea/derived alanlarını taşır', async () => {
  const res = await serviceFor(TEAM_FIXTURE).list();
  const cycles = res.data.leaderCycles || [];
  assert.ok(cycles.length > 0, 'gerçek decisions.md hiç kart üretmedi');
  cycles.forEach((card, i) => {
    for (const field of CARD_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(card, field),
        `kart ${i} içinde '${field}' alanı yok: ${JSON.stringify(card)}`);
    }
  });
});

test('tur10/leaderCycles 4: eksik etiket null/— ve derived tutarlı', async () => {
  const res = await serviceFor(TEAM_FIXTURE).list();
  const cycles = res.data.leaderCycles || [];
  for (const [i, card] of cycles.entries()) {
    for (const field of ['at', 'title', 'status', 'intent', 'idea']) {
      const v = card[field];
      assert.ok(v === null || typeof v === 'string',
        `kart ${i}.${field} ne null ne string: ${JSON.stringify(v)}`);
      if (v === '') assert.fail(`kart ${i}.${field} boş string; eksik etiket null/— olmalı`);
    }
    assert.strictEqual(typeof card.derived, 'boolean',
      `kart ${i}.derived boolean değil: ${JSON.stringify(card.derived)}`);
    // v2 (Lider kararı, 2026-11-05): derived = HİÇBİR etiket çıkarılamadı → AND.
    // `||` eski spesifikasyondu; decisions.md'de status etiketi çoğunlukla yok,
    // bu yüzden `||` 20/20 kartı "türetilmiş" gösterip bayrağı anlamsızlaştırıyordu.
    const expectedDerived = (card.status === null || card.status === undefined)
      && (card.idea === null || card.idea === undefined);
    assert.strictEqual(card.derived, expectedDerived,
      `kart ${i}.derived status/idea null durumuyla tutarsız`);
    if (card.status === null) assert.ok(MISSING_LABELS.includes(card.status), 'eksik durum etiketi null/— olmalı');
  }

  // Bayrak ayırt etmeli: hepsi aynı değerdeyse bilgi taşımaz.
  const derivedTrue = cycles.filter((c) => c.derived === true).length;
  const derivedFalse = cycles.filter((c) => c.derived === false).length;
  assert.ok(derivedFalse >= 1,
    `hiç derived:false kart yok (derived true=${derivedTrue}, false=${derivedFalse}) — bayrak ayırt etmiyor`);
  assert.ok(derivedTrue >= 1,
    `hiç derived:true kart yok (derived true=${derivedTrue}, false=${derivedFalse}) — bayrak ayırt etmiyor`);
});

test('tur10/leaderCycles 5: gerçek decisions.md en az bir kart üretir', async () => {
  const res = await serviceFor(TEAM_FIXTURE).list();
  const cycles = res.data.leaderCycles || [];
  assert.ok(cycles.length >= 1 && cycles.length <= 20,
    `kart sayısı 1..20 aralığında değil: ${cycles.length}`);
});
