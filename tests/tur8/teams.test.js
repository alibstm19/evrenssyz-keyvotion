'use strict';

// Tur 8 / Çoklu ekip servisi (T8-5)
//
// Ölçülen iddialar:
//  1) Ekip oluşturma/listeleme; aktif ekip tek.
//  2) Silme YOK: arşivleme kaydı korur (`archived:true`), dosyada kalır.
//  3) Ekip izolasyonu: bir ekibin harcaması diğerinin bütçesini değiştirmez.
//  4) Deterministik model ataması: aynı girdi → aynı çıktı.
//  5) Katalog boşsa uydurma yok: E_NOT_FOUND.
//  6) Lider ekipten çıkarılamaz (E_FORBIDDEN).
//  7) Bütçe aşımı `over:true` ile bildirilir.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SRC } = require('../lib');

const {
  createTeamsService,
  autoAssign,
  ROLE_PROFILES
} = require(path.join(SRC, 'main', 'services', 'teams.js'));

const POOL = [
  { id: 'evren/reason-pro', name: 'Reason Pro', strengths: 'reasoning, planning, kod', capabilities: { tools: true } },
  { id: 'evren/code-max', name: 'Code Max', strengths: 'coding, tools, yazılım', capabilities: { tools: true } },
  { id: 'evren/design-eyes', name: 'Design Eyes', strengths: 'design, vision, arayüz', capabilities: { input: ['image'] } },
  { id: 'evren/fast-mini', name: 'Fast Mini', strengths: 'fast, mini, otomasyon' }
];

function sandbox(pool) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-teams-'));
  const models = pool === undefined ? POOL : pool;
  const service = createTeamsService({
    baseDir,
    getModels: () => ({ ok: true, data: { pool: models } })
  });
  return { baseDir, service, file: path.join(baseDir, 'teams.json') };
}

test('tur8/teams 1: oluştur → liste → aktif ekip', () => {
  const { service } = sandbox();
  const created = service.run({ action: 'create', name: 'Vitrin', leaderName: 'Ali', limitTokens: 5000 });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.data.team.id, 'T1');
  assert.strictEqual(created.data.team.leader.name, 'Ali');

  const list = service.list();
  assert.strictEqual(list.ok, true);
  assert.strictEqual(list.data.activeId, 'T1');
  assert.strictEqual(list.data.totals.teams, 1);
  assert.strictEqual(list.data.available, true);
});

test('tur8/teams 2: aynı adla ikinci açık ekip reddedilir (E_CONFLICT)', () => {
  const { service } = sandbox();
  service.run({ action: 'create', name: 'Vitrin' });
  const again = service.run({ action: 'create', name: 'vitrin' });
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.error.code, 'E_CONFLICT');
});

test('tur8/teams 3: arşivleme silmez — kayıt dosyada kalır', () => {
  const { service, file } = sandbox();
  service.run({ action: 'create', name: 'A' });
  service.run({ action: 'create', name: 'B' });
  const res = service.run({ action: 'archive', id: 'T1' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.activeId, 'T2');

  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(disk.teams.length, 2);
  assert.strictEqual(disk.teams.find((t) => t.id === 'T1').archived, true);

  const list = service.list();
  assert.strictEqual(list.data.teams.length, 2);
  assert.strictEqual(list.data.totals.teams, 1);
  assert.strictEqual(list.data.activeId, 'T2');
});

test('tur8/teams 4: ekip izolasyonu — harcama diğer ekibi etkilemez', () => {
  const { service } = sandbox();
  service.run({ action: 'create', name: 'A', limitTokens: 1000 });
  service.run({ action: 'create', name: 'B', limitTokens: 1000 });

  const spendA = service.run({ action: 'spend', id: 'T1', tokens: 1200 });
  assert.strictEqual(spendA.ok, true);
  assert.strictEqual(spendA.data.team.spentTokens, 1200);
  assert.strictEqual(spendA.data.over, true);

  const list = service.list();
  const a = list.data.teams.find((t) => t.id === 'T1');
  const b = list.data.teams.find((t) => t.id === 'T2');
  assert.strictEqual(a.spentTokens, 1200);
  assert.strictEqual(b.spentTokens, 0);
  assert.strictEqual(b.budget.remaining, 1000);
  assert.strictEqual(a.budget.remaining, 0);
});

test('tur8/teams 5: autoAssign deterministik — aynı girdi aynı çıktı', () => {
  const roles = ['LDR', 'ARC', 'DEV', 'DSN', 'QA', 'OPS'];
  const first = autoAssign(roles, POOL);
  const second = autoAssign(roles, POOL);
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.assignments.length, roles.length);
  assert.ok(first.assignments.every((a) => typeof a.model === 'string' && a.model.includes('/')));

  /* Rol profili sırası sabittir. */
  assert.deepStrictEqual(Object.keys(ROLE_PROFILES), ['LDR', 'ARC', 'DEV', 'DSN', 'QA', 'OPS']);
  /* Tasarımcı görsel/design sinyali taşıyan modeli alır. */
  assert.strictEqual(first.assignments.find((a) => a.role === 'DSN').model, 'evren/design-eyes');
});

test('tur8/teams 6: katalog boşsa uydurma atama yok (E_NOT_FOUND)', () => {
  const { service } = sandbox([]);
  service.run({ action: 'create', name: 'A' });
  const res = service.run({ action: 'autoAssign', id: 'T1' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, 'E_NOT_FOUND');
});

test('tur8/teams 7: üye ekle/çıkar — lider korunur, silme arşivdir', () => {
  const { service, file } = sandbox();
  service.run({ action: 'create', name: 'A' });

  const add = service.run({ action: 'addMember', id: 'T1', role: 'DEV', code: 'DEV', name: 'Yazılımcı' });
  assert.strictEqual(add.ok, true);
  assert.strictEqual(add.data.team.members.length, 2);

  const dup = service.run({ action: 'addMember', id: 'T1', role: 'DEV', code: 'DEV' });
  assert.strictEqual(dup.error.code, 'E_DUPLICATE_ROLE');

  const leader = service.run({ action: 'removeMember', id: 'T1', code: 'LDR' });
  assert.strictEqual(leader.ok, false);
  assert.strictEqual(leader.error.code, 'E_FORBIDDEN');

  const removed = service.run({ action: 'removeMember', id: 'T1', code: 'DEV' });
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(removed.data.team.members.length, 1);
  assert.strictEqual(removed.data.team.archivedMembers.length, 1);

  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dev = disk.teams[0].members.find((m) => m.code === 'DEV');
  assert.strictEqual(dev.active, false);
});

test('tur8/teams 8: autoAssign ekibe uygulanır ve gerekçe yazılır', () => {
  const { service } = sandbox();
  service.run({ action: 'create', name: 'A' });
  service.run({ action: 'addMember', id: 'T1', role: 'DEV', code: 'DEV' });
  const res = service.run({ action: 'autoAssign', id: 'T1' });
  assert.strictEqual(res.ok, true);
  const dev = res.data.team.members.find((m) => m.code === 'DEV');
  assert.strictEqual(dev.model, 'evren/code-max');
  assert.ok(dev.assignment && typeof dev.assignment.reason === 'string');
});
