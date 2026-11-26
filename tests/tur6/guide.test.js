'use strict';

/*
 * Tur 6 / T6-1 — Rehber / ilk kurulum servisi.
 *
 * NE ÖLÇÜLÜR (gerçek kod, gerçek disk):
 *   1) İlk açılışta varsayılan: onboarded=false, step=0, 6 adım.
 *   2) update({step}) diske yazılır; yeni instance aynı adımı okur (kalıcılık).
 *   3) onboarded=true → completedAt dolar.
 *   4) Adım aralığı kırpılır: 99 → 5, -5 → 0.
 *   5) reset → başlangıç durumuna döner ve diskte de öyledir.
 *   6) Bozuk guide.json çökmeden varsayılana döner.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createGuideService } = require(path.join(SRC, 'main', 'services', 'guide.js'));

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('tur6/guide 1: ilk durum varsayılan, 6 adım', (t) => {
  const dir = tempDir('guide-default', t);
  const guide = createGuideService({ baseDir: dir });

  const res = guide.state();
  assert.ok(res.ok);
  assert.equal(res.data.onboarded, false);
  assert.equal(res.data.step, 0);
  assert.equal(res.data.total, 6);
  assert.ok(Array.isArray(res.data.steps));
  assert.equal(res.data.steps.length, 6);
  assert.equal(res.data.completedAt, null);
});

test('tur6/guide 2: step diske yazılır, yeni instance okur', (t) => {
  const dir = tempDir('guide-persist', t);
  const first = createGuideService({ baseDir: dir });
  const updated = first.update({ step: 3 });
  assert.ok(updated.ok);
  assert.equal(updated.data.step, 3);

  const second = createGuideService({ baseDir: dir });
  const res = second.state();
  assert.ok(res.ok);
  assert.equal(res.data.step, 3, 'kalıcılık: yeni instance adımı diskten okumalı');
});

test('tur6/guide 3: onboarded=true completedAt doldurur ve kalıcıdır', (t) => {
  const dir = tempDir('guide-onboarded', t);
  const guide = createGuideService({ baseDir: dir });
  const res = guide.update({ onboarded: true });
  assert.ok(res.ok);
  assert.equal(res.data.onboarded, true);
  assert.equal(typeof res.data.completedAt, 'string');
  assert.ok(res.data.completedAt.length > 0);
  assert.ok(!Number.isNaN(Date.parse(res.data.completedAt)), 'completedAt geçerli ISO olmalı');

  const again = createGuideService({ baseDir: dir }).state();
  assert.ok(again.ok);
  assert.equal(again.data.onboarded, true);
  assert.equal(again.data.completedAt, res.data.completedAt);
});

test('tur6/guide 4: adım 99 → 5, -5 → 0 kırpılır', (t) => {
  const dir = tempDir('guide-clamp', t);
  const guide = createGuideService({ baseDir: dir });

  const high = guide.update({ step: 99 });
  assert.ok(high.ok);
  assert.equal(high.data.step, 5, 'üst sınır 5 olmalı');

  const low = guide.update({ step: -5 });
  assert.ok(low.ok);
  assert.equal(low.data.step, 0, 'alt sınır 0 olmalı');
});

test('tur6/guide 5: reset başlangıca döner ve diskte de öyledir', (t) => {
  const dir = tempDir('guide-reset', t);
  const guide = createGuideService({ baseDir: dir });
  guide.update({ step: 4, onboarded: true });

  const res = guide.update({ reset: true });
  assert.ok(res.ok);
  assert.equal(res.data.onboarded, false);
  assert.equal(res.data.step, 0);
  assert.equal(res.data.completedAt, null);

  const fresh = createGuideService({ baseDir: dir }).state();
  assert.ok(fresh.ok);
  assert.equal(fresh.data.onboarded, false);
  assert.equal(fresh.data.step, 0);
});

test('tur6/guide 6: bozuk guide.json çökmeden varsayılana döner', (t) => {
  const dir = tempDir('guide-corrupt', t);
  fs.writeFileSync(path.join(dir, 'guide.json'), '{bozuk', 'utf8');

  const guide = createGuideService({ baseDir: dir });
  const res = guide.state();
  assert.ok(res.ok, 'bozuk dosya state() çökertmemeli');
  assert.equal(res.data.onboarded, false);
  assert.equal(res.data.step, 0);
  assert.equal(res.data.steps.length, 6);
});
