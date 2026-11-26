'use strict';

/*
 * Tur 6 / T6-3 — Sayfa özeti (sezgisel + model katmanı).
 *
 * NE ÖLÇÜLÜR (gerçek kod):
 *   1) Sağlayıcı yokken bile engine='heuristic' ve dolu sonuç: 3..7 madde,
 *      anahtar kelime, boş olmayan özet, chars>0.
 *   2) Maddeler kaynak metindeki gerçek cümlelerdir (uydurma yok).
 *   3) Aynı girdi iki kez aynı maddeleri üretir (deterministik).
 *   4) Boş metin → ok:false.
 *   5) limit:1 → alt sınır 3'e yukarı kırpılır.
 *   6) engine:'auto' + her zaman fail eden sağlayıcı → yine heuristic ve
 *      modelError dolu; özellik bozulmaz.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createSummarizeService } = require(path.join(SRC, 'main', 'services', 'summarize.js'));

const TEXT = [
  'Keyvotion Console ekibi tek pencerede yönetir ve görevleri panoda takip eder.',
  'Yerel sunucu kapalıysa konsol çevrim dışı görünür ve kullanıcıya nedenini yazar.',
  'Hafıza servisi her işten sonra önemli çıkarımları otomatik olarak kaydeder.',
  'Zihin haritası kayıtları düğüm olarak gösterir ve koordinatları deterministik üretir.',
  'Uzaktan erişim yalnız özel ağ adreslerinden gelen istekleri kabul eder.',
  'Sayfa özeti anahtar gerektirmeden sezgisel yöntemle çalışır ve asla boş dönmez.',
  'Sesli asistan pano, ekip, rapor ve hafıza sorularını yerel veriden yanıtlar.',
  'Rehber ilk kurulumda altı adım gösterir ve ilerlemeyi diske yazar.'
].join(' ');

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('tur6/summarize 1: sağlayıcısız sezgisel özet dolu sonuç üretir', async (t) => {
  tempDir('summarize-basic', t);
  const service = createSummarizeService({ providers: null });
  const res = await service.summarize({ text: TEXT });

  assert.ok(res.ok, JSON.stringify(res.error));
  assert.equal(res.data.engine, 'heuristic');
  assert.ok(Array.isArray(res.data.points));
  assert.ok(res.data.points.length >= 3 && res.data.points.length <= 7,
    `madde sayısı 3..7 olmalı, gelen: ${res.data.points.length}`);
  assert.ok(Array.isArray(res.data.keywords));
  assert.ok(res.data.keywords.length > 0, 'anahtar kelime yok');
  assert.equal(typeof res.data.summary, 'string');
  assert.ok(res.data.summary.trim().length > 0, 'özet boş');
  assert.ok(res.data.chars > 0, 'chars 0 olmamalı');
  assert.equal(res.data.sentences, 8, 'kaynak 8 cümle olmalı');
});

test('tur6/summarize 2: maddeler kaynak metinde birebir geçer', async (t) => {
  tempDir('summarize-source', t);
  const service = createSummarizeService({ providers: null });
  const res = await service.summarize({ text: TEXT });
  assert.ok(res.ok);

  for (const point of res.data.points) {
    assert.ok(TEXT.includes(point), `madde kaynak metinde yok (uydurma): ${point}`);
  }
});

test('tur6/summarize 3: aynı girdi deterministik aynı maddeleri verir', async (t) => {
  tempDir('summarize-deterministic', t);
  const service = createSummarizeService({ providers: null });
  const a = await service.summarize({ text: TEXT });
  const b = await service.summarize({ text: TEXT });
  assert.ok(a.ok && b.ok);
  assert.deepEqual(a.data.points, b.data.points);
  assert.deepEqual(a.data.keywords, b.data.keywords);
  assert.equal(a.data.summary, b.data.summary);
});

test('tur6/summarize 4: boş metin + browser:null → ok:false', async (t) => {
  tempDir('summarize-empty', t);
  const service = createSummarizeService({ providers: null, browser: null });
  const res = await service.summarize({ text: '', browser: null });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_BAD_REQUEST');
});

test('tur6/summarize 5: limit:1 alt sınır 3e yukarı kırpılır', async (t) => {
  tempDir('summarize-limit', t);
  const service = createSummarizeService({ providers: null });
  const res = await service.summarize({ text: TEXT, limit: 1 });
  assert.ok(res.ok);
  assert.equal(res.data.points.length, 3, 'limit 1 istense bile en az 3 madde');
});

test('tur6/summarize 6: model fail ederse engine heuristic + modelError dolu', async (t) => {
  tempDir('summarize-modelfail', t);
  let calls = 0;
  const service = createSummarizeService({
    providers: {
      runRequest: async () => {
        calls += 1;
        return { ok: false, error: { code: 'E_TEST_FAIL', message: 'sahte hata' } };
      }
    }
  });

  const res = await service.summarize({ text: TEXT, engine: 'auto' });
  assert.ok(res.ok, 'model hatası özelliği bozmamalı');
  assert.equal(calls, 1, 'engine:auto sağlayıcıyı denemeli');
  assert.equal(res.data.engine, 'heuristic');
  assert.ok(res.data.modelError, 'modelError dolu olmalı');
  assert.ok(res.data.points.length >= 3, 'sezgisel maddeler korunmalı');
});
