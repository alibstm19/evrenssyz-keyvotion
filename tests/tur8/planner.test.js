'use strict';

// Tur 8 / Plan · not · zamanlanmış görev servisi (T8-6)
//
// Ölçülen iddialar:
//  1) nextRunOf saf ve doğru: daily, weekly, once (geçmiş/future).
//  2) scheduleSave doğrulama: geçersiz saat/tür/gün → E_BAD_REQUEST.
//  3) tick tetiklenen zamanlama için görev açar, sonraki anı ilerletir.
//  4) `once` zamanlama bir kez çalışır ve kapanır.
//  5) Silme YOK: plan/not/zamanlama arşivlenir, dosyada kalır.
//  6) Ekip izolasyonu: list({teamId}) yalnız o ekibin + global kayıtları döner.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SRC } = require('../lib');

const {
  createPlannerService,
  nextRunOf,
  validateSchedule
} = require(path.join(SRC, 'main', 'services', 'planner.js'));

function sandbox() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-plan-'));
  const service = createPlannerService({ baseDir });
  return { baseDir, service, file: path.join(baseDir, 'planner.json') };
}

/* 2026-01-05 Pazartesi, 10:00 yerel saat */
const MONDAY_10 = new Date(2026, 0, 5, 10, 0, 0);

test('tur8/planner 1: nextRunOf daily — bugün geçtiyse yarın 09:00', () => {
  const next = nextRunOf({ kind: 'daily', time: '09:00' }, MONDAY_10);
  const d = new Date(next);
  assert.strictEqual(d.getDate(), 6);
  assert.strictEqual(d.getHours(), 9);
  assert.strictEqual(d.getMinutes(), 0);
});

test('tur8/planner 2: nextRunOf daily — saat gelmediyse bugün 09:00', () => {
  const early = new Date(2026, 0, 5, 7, 0, 0);
  const d = new Date(nextRunOf({ kind: 'daily', time: '09:00' }, early));
  assert.strictEqual(d.getDate(), 5);
  assert.strictEqual(d.getHours(), 9);
});

test('tur8/planner 3: nextRunOf weekly — seçili gün, sonraki hafta', () => {
  const next = nextRunOf({ kind: 'weekly', time: '09:00', weekdays: [1] }, MONDAY_10);
  const d = new Date(next);
  assert.strictEqual(d.getDay(), 1);
  assert.strictEqual(d.getDate(), 12);
  assert.strictEqual(d.getHours(), 9);
});

test('tur8/planner 4: nextRunOf once — gelecek tarih, geçmiş tarih null', () => {
  const future = nextRunOf({ kind: 'once', time: '09:00', once: '2026-01-06' }, MONDAY_10);
  assert.ok(future);
  const d = new Date(future);
  assert.strictEqual(d.getDate(), 6);
  assert.strictEqual(d.getHours(), 9);

  const past = nextRunOf({ kind: 'once', time: '09:00', once: '2026-01-04' }, MONDAY_10);
  assert.strictEqual(past, null);
});

test('tur8/planner 5: kapalı zamanlama için sonraki an yok', () => {
  assert.strictEqual(nextRunOf({ kind: 'daily', time: '09:00', enabled: false }, MONDAY_10), null);
});

test('tur8/planner 6: validateSchedule geçersiz girdileri reddeder', () => {
  assert.ok(validateSchedule({ kind: 'daily', time: '9:00' }).error);
  assert.ok(validateSchedule({ kind: 'hourly', time: '09:00' }).error);
  assert.ok(validateSchedule({ kind: 'weekly', time: '09:00', weekdays: [] }).error);
  assert.ok(validateSchedule({ kind: 'weekly', time: '09:00', weekdays: [9] }).error);
  assert.ok(validateSchedule({ kind: 'once', time: '09:00', once: '2026-13-01' }).error);
  assert.deepStrictEqual(validateSchedule({ kind: 'daily', time: '09:00' }), {
    kind: 'daily', time: '09:00', weekdays: [], once: null
  });
});

test('tur8/planner 7: tick tetiklenen zamanlama için görev açar', () => {
  const { service } = sandbox();
  const saved = service.run({
    action: 'scheduleSave', title: 'Sabah durumu', prompt: 'Panoyu özetle',
    kind: 'daily', time: '09:00'
  });
  assert.strictEqual(saved.ok, true);
  const id = saved.data.schedule.id;

  /* Sonraki çalışma anı geçmişe ayarlanır: tick bunu yakalar. */
  const state = JSON.parse(fs.readFileSync(service.file, 'utf8'));
  state.schedules.find((s) => s.id === id).nextRunAt = new Date(Date.now() - 60000).toISOString();
  fs.writeFileSync(service.file, JSON.stringify(state, null, 2), 'utf8');

  const fired = service.tick(new Date());
  assert.strictEqual(fired.ok, true);
  assert.strictEqual(fired.data.fired.length, 1);
  assert.strictEqual(fired.data.fired[0].source, 'schedule');
  assert.strictEqual(fired.data.fired[0].title, 'Sabah durumu');

  const list = service.list({});
  assert.strictEqual(list.data.tasks.length, 1);
  assert.strictEqual(list.data.schedules[0].runs, 1);
  assert.ok(new Date(list.data.schedules[0].nextRunAt).getTime() > Date.now());
});

test('tur8/planner 8: once zamanlama bir kez çalışır ve kapanır', () => {
  const { service } = sandbox();
  const saved = service.run({
    action: 'scheduleSave', title: 'Tek sefer', kind: 'once', time: '09:00', once: '2026-01-06'
  });
  const id = saved.data.schedule.id;
  const state = JSON.parse(fs.readFileSync(service.file, 'utf8'));
  state.schedules.find((s) => s.id === id).nextRunAt = new Date(Date.now() - 60000).toISOString();
  fs.writeFileSync(service.file, JSON.stringify(state, null, 2), 'utf8');

  assert.strictEqual(service.tick(new Date()).data.fired.length, 1);
  const after = JSON.parse(fs.readFileSync(service.file, 'utf8'));
  assert.strictEqual(after.schedules[0].enabled, false);
  assert.strictEqual(service.tick(new Date()).data.fired.length, 0);
});

test('tur8/planner 9: silme yok — plan/not/zamanlama arşivlenir', () => {
  const { service, file } = sandbox();
  const plan = service.run({ action: 'planSave', title: 'Yol haritası', body: '## Adımlar' });
  const note = service.run({ action: 'noteSave', text: 'Lider notu' });
  const sched = service.run({ action: 'scheduleSave', title: 'Haftalık', kind: 'weekly', time: '09:00', weekdays: [1] });

  assert.strictEqual(service.run({ action: 'planRemove', id: plan.data.plan.id }).ok, true);
  assert.strictEqual(service.run({ action: 'noteRemove', id: note.data.note.id }).ok, true);
  assert.strictEqual(service.run({ action: 'scheduleRemove', id: sched.data.schedule.id }).ok, true);

  const list = service.list({});
  assert.strictEqual(list.data.plans.length, 0);
  assert.strictEqual(list.data.notes.length, 0);
  assert.strictEqual(list.data.schedules.length, 0);

  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(disk.plans.length, 1);
  assert.strictEqual(disk.notes.length, 1);
  assert.strictEqual(disk.schedules.length, 1);
  assert.strictEqual(disk.plans[0].archived, true);
});

test('tur8/planner 10: ekip izolasyonu — yalnız o ekibin + global kayıtlar', () => {
  const { service } = sandbox();
  service.run({ action: 'planSave', title: 'Global plan' });
  service.run({ action: 'planSave', title: 'A planı', teamId: 'T1' });
  service.run({ action: 'planSave', title: 'B planı', teamId: 'T2' });

  const a = service.list({ teamId: 'T1' });
  const titles = a.data.plans.map((p) => p.title).sort();
  assert.deepStrictEqual(titles, ['A planı', 'Global plan']);

  const b = service.list({ teamId: 'T2' });
  assert.deepStrictEqual(b.data.plans.map((p) => p.title).sort(), ['B planı', 'Global plan']);

  const all = service.list({});
  assert.strictEqual(all.data.plans.length, 3);
});

test('tur8/planner 11: görev durumu güncellenir; açık görev sayısı değişir', () => {
  const { service } = sandbox();
  const task = service.run({ action: 'taskAdd', title: 'İnceleme', role: 'QA' });
  assert.strictEqual(service.list({}).data.counts.tasks, 1);

  const upd = service.run({ action: 'taskUpdate', id: task.data.task.id, status: 'bitti' });
  assert.strictEqual(upd.ok, true);
  assert.strictEqual(service.list({}).data.counts.tasks, 0);

  const bad = service.run({ action: 'taskUpdate', id: task.data.task.id, status: 'uçtu' });
  assert.strictEqual(bad.error.code, 'E_BAD_REQUEST');
});
