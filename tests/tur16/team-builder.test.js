'use strict';

/*
 * Tur 16 — team-builder birim testleri.
 *
 * Kapsam:
 *   1) fallbackPlan: Türkçe açıklamadan deterministik kadro (tek LDR, tekil kod).
 *   2) parseModelJson: kod bloğu, ön yazı ve çöp girdi.
 *   3) validateProposal: yinelenen kod, eksik LDR, aralık dışı üye sayısı.
 *   4) plan: sağlıklı model yanıtı -> source:'model', modeller yalnız havuzdan.
 *   5) plan: sağlayıcı fırlatır / çöp döner -> ok:true, source:'fallback' (çökmez).
 *   6) plan: 20 karakterden kısa açıklama -> Türkçe hata zarfı.
 *   7) apply: her üye için append çağrısı; yinelenen kod reddedilir.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SRC } = require('../lib');
const { CODES } = require(path.join(SRC, 'shared', 'errors.js'));

const {
  createTeamBuilder
} = require(path.join(SRC, 'main', 'services', 'team-builder.js'));

const CODE_RE = /^[A-Z][A-Z0-9]{1,5}$/;

function makeBuilder(overrides = {}) {
  return createTeamBuilder({
    providers: null,
    models: { pool: () => [] },
    getProjectName: () => 'Test Projesi',
    ...overrides
  });
}

const { _internals } = makeBuilder();
const { fallbackPlan, parseModelJson, pickModelForArea, validateProposal } = _internals;

const POOL = [
  'evren/deepseek-v4.1-flash',
  { id: 'evren/mimo-v2.6-pro', name: 'mimo', character: 'genel', strengths: 'kod' },
  { id: 'evren/vision-xl', name: 'vision', character: 'görsel', strengths: 'tasarım ui css görsel' }
];

function goodProposal() {
  return {
    summary: 'Mobil uygulama için küçük ekip.',
    members: [
      { role: 'Lider', code: 'LDR', responsibility: 'Ekibi yönetir.', area: 'lider', model: 'evren/deepseek-v4.1-flash' },
      { role: 'Mobil Geliştirici', code: 'MOB', responsibility: 'Uygulamayı yazar.', area: 'mobil', model: 'uydurma/model' },
      { role: 'Arayüz Tasarımcısı', code: 'DSN', responsibility: 'Arayüzü tasarlar.', area: 'tasarım', model: 'evren/vision-xl' }
    ]
  };
}

/* 1 — fallbackPlan Türkçe anahtar kelimelerle kadro üretir. */
test('tur16/team-builder 1: fallbackPlan mobil/tasarım/test -> tek LDR, tekil geçerli kodlar, 3..9 üye', () => {
  const plan = fallbackPlan('Mobil uygulama, tasarım ve test süreçlerini birlikte yürütecek bir ekip gerekiyor.', 6, POOL);

  assert.ok(Array.isArray(plan.members), 'members dizi değil');
  assert.ok(plan.members.length >= 3 && plan.members.length <= 9, `üye sayısı aralık dışı: ${plan.members.length}`);

  const codes = plan.members.map((m) => m.code);
  assert.equal(codes.filter((code) => code === 'LDR').length, 1, 'LDR tam olarak bir kez olmalı');
  assert.equal(new Set(codes).size, codes.length, `yinelenen kod: ${codes.join(',')}`);
  for (const code of codes) assert.match(code, CODE_RE, `geçersiz kod: ${code}`);

  const areas = plan.members.map((m) => m.area);
  assert.ok(areas.includes('mobil'), 'mobil anahtar kelimesi MOB rolü üretmedi');
  assert.ok(areas.includes('tasarım'), 'tasarım anahtar kelimesi DSN rolü üretmedi');
  assert.ok(areas.includes('test'), 'test anahtar kelimesi QA rolü üretmedi');

  for (const member of plan.members) {
    assert.ok(typeof member.role === 'string' && member.role.length > 0, 'rol adı boş');
    assert.ok(typeof member.responsibility === 'string' && member.responsibility.length > 0, 'sorumluluk boş');
  }
});

/* 2 — parseModelJson savunmacı ayrıştırma. */
test('tur16/team-builder 2: parseModelJson kod bloğu, ön yazı ve çöp girdiyi ele alır', () => {
  const fenced = parseModelJson('```json\n{"summary":"x","members":[]}\n```');
  assert.deepEqual(fenced, { summary: 'x', members: [] });

  const prose = parseModelJson('İşte kadro:\n{"summary":"y","members":[{"code":"LDR"}]}\nUmarım yardımcı olur.');
  assert.equal(prose.summary, 'y');
  assert.equal(prose.members[0].code, 'LDR');

  assert.equal(parseModelJson('bu bir JSON değil'), null);
  assert.equal(parseModelJson(''), null);
  assert.equal(parseModelJson(null), null);
  assert.equal(parseModelJson('{"bozuk": '), null);
});

/* 3 — validateProposal doğrulama kuralları. */
test('tur16/team-builder 3: validateProposal yinelenen kodu, eksik LDR\'yi ve aralık dışı sayıyı reddeder', () => {
  const duplicate = {
    summary: 'x',
    members: [
      { role: 'Lider', code: 'LDR', responsibility: 'yönetir', area: 'lider' },
      { role: 'Geliştirici', code: 'DEV', responsibility: 'yazar', area: 'web' },
      { role: 'Geliştirici 2', code: 'DEV', responsibility: 'yazar', area: 'web' }
    ]
  };
  const dup = validateProposal(duplicate, { pool: POOL });
  assert.equal(dup.ok, false);
  assert.equal(dup.error.code, CODES.DUPLICATE_ROLE);

  const missingLeader = {
    summary: 'x',
    members: [
      { role: 'Geliştirici', code: 'DEV', responsibility: 'yazar', area: 'web' },
      { role: 'Tasarımcı', code: 'DSN', responsibility: 'çizer', area: 'tasarım' }
    ]
  };
  const noLeader = validateProposal(missingLeader, { pool: POOL });
  assert.equal(noLeader.ok, false);
  assert.match(noLeader.error.message, /LDR/);

  const tooFew = validateProposal({ summary: 'x', members: [
    { role: 'Lider', code: 'LDR', responsibility: 'yönetir', area: 'lider' }
  ] }, { pool: POOL });
  assert.equal(tooFew.ok, false, 'tek üyeli kadro kabul edilmemeli');

  const tooManyMembers = Array.from({ length: 10 }, (_, i) => ({
    role: `Rol ${i}`,
    code: i === 0 ? 'LDR' : `R${i}`,
    responsibility: 'görev',
    area: 'web'
  }));
  const tooMany = validateProposal({ summary: 'x', members: tooManyMembers }, { pool: POOL });
  assert.equal(tooMany.ok, false, '10 üyeli kadro kabul edilmemeli');
});

/* 4 — plan model yanıtıyla çalışır, model kimliklerini havuzla sınırlar. */
test('tur16/team-builder 4: plan iyi JSON -> source model, modeller yalnız havuzdan', async () => {
  const calls = [];
  const providers = {
    chat: async (input) => {
      calls.push(input);
      return { ok: true, data: { text: JSON.stringify(goodProposal()), model: 'm', providerId: 'p' } };
    }
  };
  const builder = makeBuilder({ providers, models: { pool: () => POOL } });

  const res = await builder.plan({ description: 'Mobil uygulama için tasarım ve test içeren bir ekip kur.', size: 3 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.data.source, 'model');
  assert.equal(res.data.members.length, 3);
  assert.equal(calls.length, 1, 'providers.chat bir kez çağrılmalı');
  assert.equal(calls[0].temperature, 0.2);
  assert.equal(calls[0].maxTokens, 1200);

  const allowed = new Set(['evren/deepseek-v4.1-flash', 'evren/mimo-v2.6-pro', 'evren/vision-xl']);
  for (const member of res.data.members) {
    assert.ok(allowed.has(member.model), `havuz dışı model üretildi: ${member.model}`);
  }

  const codes = res.data.members.map((m) => m.code);
  assert.equal(codes.filter((c) => c === 'LDR').length, 1);
});

/* 5 — plan sağlayıcı hatasında çökmez, yedek plana düşer. */
test('tur16/team-builder 5: plan sağlayıcı fırlatınca/çöp dönünce ok:true + fallback', async () => {
  const throwing = makeBuilder({
    providers: { chat: async () => { throw new Error('ağ koptu'); } },
    models: { pool: () => POOL }
  });
  const thrown = await throwing.plan({ description: 'Web sitesi ve API için bir ekip kurulacak, test de olsun.' });
  assert.equal(thrown.ok, true, 'sağlayıcı hatası zarfı bozmamalı');
  assert.equal(thrown.data.source, 'fallback');
  assert.ok(thrown.data.members.length >= 3, 'yedek plan üye üretmeli');
  assert.ok(thrown.data.notes.length >= 1, 'neden yedek plana düşüldüğü not edilmeli');

  const garbage = makeBuilder({
    providers: { chat: async () => ({ ok: true, data: { text: 'merhaba dünya' } }) },
    models: { pool: () => POOL }
  });
  const junk = await garbage.plan({ description: 'Web sitesi ve API için bir ekip kurulacak, test de olsun.' });
  assert.equal(junk.ok, true);
  assert.equal(junk.data.source, 'fallback');
  assert.equal(junk.data.members.filter((m) => m.code === 'LDR').length, 1);

  const failing = makeBuilder({
    providers: { chat: async () => ({ ok: false, error: { code: CODES.OFFLINE, message: 'sunucu yok' } }) },
    models: { pool: () => POOL }
  });
  const offline = await failing.plan({ description: 'Web sitesi ve API için bir ekip kurulacak, test de olsun.' });
  assert.equal(offline.ok, true);
  assert.equal(offline.data.source, 'fallback');
});

/* 6 — 20 karakterden kısa açıklama reddedilir. */
test('tur16/team-builder 6: plan kısa açıklamada Türkçe hata zarfı döner', async () => {
  const builder = makeBuilder({ providers: { chat: async () => { throw new Error('çağrılmamalı'); } } });
  const res = await builder.plan({ description: 'kısa' });

  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.BAD_REQUEST);
  assert.match(res.error.message, /Projeyi en az birkaç cümleyle anlatın/);
});

/* 7 — apply her üyeyi append eder, yinelenen kodu reddeder. */
test('tur16/team-builder 7: apply append çağrılarını kaydeder ve yinelenen kodu reddeder', async () => {
  const entries = [
    { role: 'Lider', code: 'LDR', responsibility: 'yönetir', model: '', sessionID: null }
  ];
  const appendCalls = [];
  const roster = {
    isValidCode: (code) => CODE_RE.test(code),
    append: async (entry) => {
      appendCalls.push(entry);
      const exists = entries.some((e) => e.code === entry.code);
      if (exists) {
        const index = entries.findIndex((e) => e.code === entry.code);
        entries[index] = { ...entry };
      } else {
        entries.push({ ...entry });
      }
      return { ok: true, data: { code: entry.code, entries: entries.slice() } };
    },
    read: async () => ({ ok: true, data: { entries: entries.slice() } })
  };
  const builder = makeBuilder({ roster });

  const res = await builder.apply({
    members: [
      { role: 'Lider', code: 'LDR', responsibility: 'yönetir', model: 'evren/deepseek-v4.1-flash' },
      { role: 'Web Geliştirici', code: 'WEB', responsibility: 'yazar', model: '' }
    ]
  });

  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.deepEqual(res.data.applied, ['LDR', 'WEB']);
  assert.deepEqual(res.data.codes, ['LDR', 'WEB']);
  assert.equal(appendCalls.length, 2, 'her üye için bir append çağrısı olmalı');
  assert.equal(appendCalls[0].code, 'LDR');
  assert.equal(appendCalls[1].code, 'WEB');
  assert.ok(Array.isArray(res.data.entries) && res.data.entries.length === 2, 'entries roster.read() aynası olmalı');

  const dupBuilder = makeBuilder({ roster });
  const before = appendCalls.length;
  const dup = await dupBuilder.apply({
    members: [
      { role: 'A', code: 'DEV', responsibility: 'x', model: '' },
      { role: 'B', code: 'DEV', responsibility: 'y', model: '' }
    ]
  });
  assert.equal(dup.ok, false);
  assert.equal(dup.error.code, CODES.DUPLICATE_ROLE);
  assert.equal(appendCalls.length, before, 'yinelenen yükte append çağrılmamalı');
});

/* Ek: pickModelForArea havuz boşken '' döner ve model uydurmaz. */
test('tur16/team-builder 8: pickModelForArea boş havuzda kimlik uydurmaz', () => {
  assert.equal(pickModelForArea('tasarım', [], 0), '');
  assert.equal(pickModelForArea('test', { pool: [] }, 1), '');

  const chosen = pickModelForArea('tasarım', POOL, 0);
  assert.ok(['evren/deepseek-v4.1-flash', 'evren/mimo-v2.6-pro', 'evren/vision-xl'].includes(chosen));
  assert.equal(pickModelForArea('tasarım', POOL, 0), chosen, 'seçim deterministik olmalı');
});

test('local planning produces a full roster without contacting the model', async () => {
  let contacted = false;
  const builder = makeBuilder({ providers: { chat() { contacted = true; } } });
  const result = await builder.plan({ description: 'İnşaat sitesi kurulacak.', size: 9, localOnly: true });
  assert.equal(result.data.source, 'fallback');
  assert.equal(result.data.members.length, 9);
  assert.ok(result.data.members.some(({ code }) => code === 'WEB'));
  assert.equal(contacted, false);
});

test('saving a revised roster preserves the existing live session and fallback model', async () => {
  const saved = [];
  const builder = makeBuilder({ roster: {
    read: () => ({ ok: true, data: { entries: [{ code: 'LDR', sessionID: 'ses_leader', model: 'existing/model' }] } }),
    append: (entry) => { saved.push(entry); return { ok: true }; }
  } });
  const result = await builder.apply({ members: [{ code: 'LDR', role: 'Lider' }] });
  assert.equal(result.ok, true);
  assert.equal(saved[0].sessionID, 'ses_leader');
  assert.equal(saved[0].model, 'existing/model');
});

test('saving the first plan creates a roster and later saves keep existing sessions', async (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const { createRoster } = require('../../src/main/services/roster');
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-first-roster-'));
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  const roster = createRoster({ getProjectDir: () => projectDir, backupRoot: path.join(projectDir, 'backup') });
  const builder = makeBuilder({ roster });
  const plan = await builder.plan({ description: 'İnşaat sitesi kurulacak.', size: 9, localOnly: true });
  assert.equal((await builder.apply({ members: plan.data.members })).ok, true);
  assert.equal(roster.read().data.entries.length, 9);
  assert.equal(roster.setLeader('ses_original').ok, true);
  assert.equal((await builder.apply({ members: [{ code: 'LDR', role: 'Lider | yeni', responsibility: 'Birinci satır\nİkinci satır' }] })).ok, true);
  assert.equal(roster.read().data.entries.length, 9);
  assert.equal(roster.read().data.nextLeaderSessionID, 'ses_original');
});
