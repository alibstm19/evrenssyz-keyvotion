'use strict';

// T-093b-2 — Tur 10 / `leader` niyeti yerel yanıt sözleşmesi.
//
// Ürün kodu T-091 ile kabul edildi; bu dosya davranışı KALICI olarak kilitler.
// Gerçek `.team/log/decisions.md` okunmaz: `reports` sahtedir (deterministik).
// Sağlayıcıya sayaçlı sahte `chat` verilir; `leader` niyeti model ÇAĞIRMAMALIDIR.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC } = require('../lib');

const { createVoiceService } = require(path.join(SRC, 'main', 'services', 'voice.js'));

const CARD_FIELDS = ['at', 'title', 'status', 'intent', 'idea', 'derived'];

/** Sahte servis kurar. `cycles` sahte reports yanıtıdır; sayaç model çağrısını ölçer. */
function makeService(options = {}) {
  const counter = { chat: 0 };
  const cycles = options.cycles === undefined ? [fullCard()] : options.cycles;
  const reportsError = options.reportsError || null;
  const reportRows = options.reportRows || [];

  const reports = {
    list: async () => {
      if (reportsError) throw reportsError;
      return { ok: true, data: { leaderCycles: cycles, reports: reportRows } };
    }
  };
  const providers = {
    chat: async () => {
      counter.chat += 1;
      return { ok: true, data: { text: 'model', model: 'fake', mask: '••••', usage: {} } };
    }
  };

  const service = createVoiceService({
    board: { read: () => ({ ok: true, data: { rows: [], nextID: 1 } }) },
    sessions: { list: async () => ({ ok: true, data: { sessions: [], unassigned: [] } }) },
    reports,
    memory: { read: () => ({ ok: true, data: { entries: [], total: 0 } }) },
    summarize: { summarize: async () => ({ ok: true, data: {} }) },
    providers,
    serverManager: { status: async () => ({ ok: true, data: { connected: false, running: false } }) },
    votionActions: { run: async () => ({ ok: true }) }
  });

  return { service, counter, cycles };
}

function fullCard(overrides = {}) {
  return {
    at: '2026-11-05',
    title: 'Kalite kapı iskeleti',
    status: 'TAMAM',
    intent: 'İskelet kur',
    idea: 'Küçük parçalarla ilerle',
    derived: false,
    ...overrides
  };
}

function textOf(res) {
  return String((res && res.data && res.data.answer) || '');
}

/* ------------------------------------------------- 1. niyet yönlendirmesi */

test('tur10/voice-leader 1: üç lider cümlesi de leader niyetine gider', async () => {
  const { service } = makeService();
  for (const question of ['Lider ne dedi?', 'brifing ver', 'liderin son kararı']) {
    const res = await service.ask({ question });
    assert.strictEqual(res.ok, true, `ask başarısız: ${question}`);
    assert.strictEqual(res.data.intent, 'leader', `'${question}' → ${res.data.intent}`);
  }
});

/* ------------------------------------------------- 2. model çağrısı 0 */

test('tur10/voice-leader 2: lider niyeti model çağırmaz, data içinde engine yok', async () => {
  const { service, counter } = makeService();
  for (const question of ['Lider ne dedi?', 'brifing ver', 'liderin son kararı']) {
    const res = await service.ask({ question });
    assert.strictEqual(res.ok, true);
    assert.strictEqual('engine' in res.data, false,
      `'${question}' zarfında engine anahtarı var: ${JSON.stringify(res.data.engine)}`);
    assert.strictEqual('engine' in res.data.data, false,
      `'${question}' iç veride engine anahtarı var: ${JSON.stringify(res.data.data.engine)}`);
  }
  assert.strictEqual(counter.chat, 0, `model ${counter.chat} kez çağrıldı (0 olmalı)`);
});

/* ------------------------------------------------- 3. sözleşme şekli */

test('tur10/voice-leader 3: data anahtar kümesi tam olarak altı alan, derived boolean', async () => {
  const { service } = makeService();
  const res = await service.ask({ question: 'Lider ne dedi?' });
  assert.strictEqual(res.ok, true);
  assert.ok(res.data.data && typeof res.data.data === 'object', 'yanıtta kart verisi (data.data) yok');
  const keys = Object.keys(res.data.data).sort();
  assert.deepStrictEqual(keys, CARD_FIELDS.slice().sort(),
    `data alanları beklenenden farklı: ${keys.join(', ')}`);
  assert.strictEqual(typeof res.data.data.derived, 'boolean',
    `derived boolean değil: ${JSON.stringify(res.data.data.derived)}`);
  assert.strictEqual(keys.length, CARD_FIELDS.length, 'kart alanı sayısı altı değil');
});

/* ------------------------------------------------- 4. eksik alan dürüstlüğü */

test('tur10/voice-leader 4: eksik etiket — tire, uydurma yok, türetildi notu koşullu', async () => {
  const missing = makeService({
    cycles: [fullCard({ status: null, idea: null, derived: true })]
  });
  const resA = await missing.service.ask({ question: 'Lider ne dedi?' });
  const textA = textOf(resA);
  assert.ok(textA.includes('—'), `eksik alan tire ile gösterilmedi: ${textA}`);
  assert.doesNotMatch(textA, /\bundefined\b/, `yanıtta undefined geçiyor: ${textA}`);
  assert.doesNotMatch(textA, /\bnull\b/, `yanıtta null geçiyor: ${textA}`);
  assert.ok(textA.includes('(etiketlerden türetildi)'),
    `derived:true iken türetildi notu yok: ${textA}`);

  const complete = makeService({
    cycles: [fullCard({ status: 'TAMAM', idea: 'Bir fikir', derived: false })]
  });
  const resB = await complete.service.ask({ question: 'Lider ne dedi?' });
  const textB = textOf(resB);
  assert.ok(!textB.includes('(etiketlerden türetildi)'),
    `derived:false iken türetildi notu var: ${textB}`);
  assert.ok(!textB.includes('—'), `tam kartta tire göründü: ${textB}`);
});

/* ------------------------------------------------- 5. boş kaynak */

test('tur10/voice-leader 5: boş leaderCycles → "Henüz lider döngüsü kaydı yok." ve data null', async () => {
  const { service } = makeService({ cycles: [] });
  const res = await service.ask({ question: 'Lider ne dedi?' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.answer, 'Henüz lider döngüsü kaydı yok.');
  assert.strictEqual(res.data.data, null);
});

/* ------------------------------------------------- 6. hata yolu */

test('tur10/voice-leader 6: reports.list fırlatırsa çökmez, dürüst hata metni döner', async () => {
  const { service } = makeService({ reportsError: new Error('boom') });
  let res;
  await assert.doesNotReject(async () => { res = await service.ask({ question: 'Lider ne dedi?' }); },
    'reports.list throw edince ask de fırlattı');
  assert.strictEqual(res.ok, true, 'hata yolu hata zarfı döndü (çökmemeli ama ok olmalı)');
  assert.strictEqual(res.data.answer, 'Lider döngülerini okuyamadım.');
  assert.strictEqual(res.data.data, null);
});

/* ------------------------------------------------- 7. regresyon */

test('tur10/voice-leader 7: pano ve ekip niyetleri bozulmadı', async () => {
  const { service } = makeService();
  const board = await service.ask({ question: 'Pano' });
  assert.strictEqual(board.ok, true);
  assert.strictEqual(board.data.intent, 'board', `'Pano' → ${board.data.intent}`);

  const team = await service.ask({ question: 'Ekip kimler' });
  assert.strictEqual(team.ok, true);
  assert.strictEqual(team.data.intent, 'team', `'Ekip kimler' → ${team.data.intent}`);
});

/* ------------------------------------------------- 8. reports (T-096 regresyonu) */

test('tur10/voice-leader 8: reports niyeti await kırığına karşı korumalı', async () => {
  // Sahte `reports.list` ASYNC olmalı: await'siz çağrı Promise'i truthy görür,
  // `res.ok` undefined kalır ve ürün "Raporları okuyamadım." der — test bunu yakalar.
  // En az 1 rapor döndürülür ki gerçek dal ("N rapor buldum") ölçülsün.
  const { service } = makeService({
    cycles: [],
    reportRows: [{ taskId: 'T-001', status: 'TAMAM' }]
  });
  const res = await service.ask({ question: 'Son raporlar' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.intent, 'reports');
  assert.notStrictEqual(res.data.answer, 'Raporları okuyamadım.',
    'await kırığı geri gelmiş: reportsAnswer Promise üzerinde .ok okuyor');
  assert.match(res.data.answer, /T-001|rapor/i,
    `yanıt beklenen içeriği taşımıyor: ${res.data.answer}`);
});
