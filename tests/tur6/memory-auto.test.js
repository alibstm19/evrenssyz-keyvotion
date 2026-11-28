'use strict';

/*
 * Tur 6 / T6-4 — Hafıza otomatiği + zihin haritası.
 *
 * NE ÖLÇÜLÜR (gerçek kod, gerçek disk; geçici proje dizini):
 *   1) auto() üç çıkarımı diske yazar; imza jsonl dosyasından doğrulanır.
 *   2) Aynı çağrı ikinci kez yazmaz (idempotent) — total değişmez.
 *   3) kind çıkarımı: karar → decision, düzeltme → correction,
 *      "her zaman" → preference, öteki → fact.
 *   4) Boş metin → ok:false.
 *   5) graph() hub + bir düğüm/kayıt, deterministik koordinat, yeterli kenar.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createMemoryService } = require(path.join(SRC, 'main', 'services', 'memory.js'));

const THREE_LINES = [
  'Karar verildi: pano satırları sabit sırada gösterilecek',
  'Düzeltme: eski rapor başlığı yanlış yazılmış',
  'Her zaman Türkçe yaz ve kısa cümle kullan'
].join('\n');

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeService(label, t) {
  const dir = tempDir(label, t);
  const service = createMemoryService({ getProjectDir: () => dir });
  return { dir, service };
}

test('tur6/memory 1: auto üç çıkarımı diske yazar (imza dosyadan)', (t) => {
  const { service } = makeService('memory-auto', t);

  const res = service.auto({ text: THREE_LINES, source: 'test' });
  assert.ok(res.ok, JSON.stringify(res.error));
  assert.equal(res.data.count, 3);
  assert.equal(res.data.total, 3);

  const jsonl = service.paths.jsonlPath();
  assert.ok(fs.existsSync(jsonl), 'memory.jsonl yazılmadı');
  const lines = fs.readFileSync(jsonl, 'utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 3);

  const entries = lines.map((line) => JSON.parse(line));
  assert.equal(entries.length, res.data.count);
  for (const entry of entries) {
    assert.match(String(entry.id), /^mem_/, 'id imzası mem_ ile başlamalı');
    assert.equal(typeof entry.text, 'string');
    assert.ok(THREE_LINES.includes(entry.text), 'diskteki metin girdiden gelmeli (uydurma yok)');
    assert.equal(entry.source, 'test');
  }
  assert.ok(fs.existsSync(service.paths.mdPath()), 'memory.md aynası yazılmadı');
});

test('tur6/memory 2: aynı auto çağrısı ikinci kez yazmaz (idempotent)', (t) => {
  const { service } = makeService('memory-idempotent', t);

  const first = service.auto({ text: THREE_LINES, source: 'test' });
  assert.ok(first.ok);
  assert.equal(first.data.count, 3);
  assert.equal(first.data.total, 3);

  const second = service.auto({ text: THREE_LINES, source: 'test' });
  assert.ok(second.ok);
  assert.equal(second.data.count, 0, 'aynı satırlar tekrar yazılmamalı');
  assert.equal(second.data.total, 3, 'total değişmemeli');
});

test('tur6/memory 3: "Karar verildi" → decision', (t) => {
  const { service } = makeService('memory-kind-decision', t);
  const res = service.auto({ text: 'Karar verildi: pano satırları sabit sırada gösterilecek', source: 'test' });
  assert.ok(res.ok);
  assert.equal(res.data.count, 1);
  assert.equal(res.data.entries[0].kind, 'decision');
});

test('tur6/memory 4: "Düzeltme" → correction', (t) => {
  const { service } = makeService('memory-kind-correction', t);
  const res = service.auto({ text: 'Düzeltme: eski rapor başlığı yanlış yazılmış', source: 'test' });
  assert.ok(res.ok);
  assert.equal(res.data.count, 1);
  assert.equal(res.data.entries[0].kind, 'correction');
});

test('tur6/memory 5: "Her zaman" → preference', (t) => {
  const { service } = makeService('memory-kind-preference', t);
  const res = service.auto({ text: 'Her zaman Türkçe yaz ve kısa cümle kullan', source: 'test' });
  assert.ok(res.ok);
  assert.equal(res.data.count, 1);
  assert.equal(res.data.entries[0].kind, 'preference');
});

test('tur6/memory 6: nötr çıkarım → fact', (t) => {
  const { service } = makeService('memory-kind-fact', t);
  const res = service.auto({ text: 'Toplantı notları arşive eklendi ve kilitlendi', source: 'test' });
  assert.ok(res.ok);
  assert.equal(res.data.count, 1);
  assert.equal(res.data.entries[0].kind, 'fact');
});

test('tur6/memory 7: boş metin → ok:false', (t) => {
  const { service } = makeService('memory-empty', t);
  const res = service.auto({ text: '   ', source: 'test' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_BAD_REQUEST');
});

test('tur6/memory 8: graph hub + kayıt düğümleri ve yeterli kenar üretir', (t) => {
  const { service } = makeService('memory-graph', t);
  const auto = service.auto({ text: THREE_LINES, source: 'test' });
  assert.ok(auto.ok);

  const res = service.graph();
  assert.ok(res.ok);
  assert.equal(res.data.total, 3);
  assert.equal(res.data.nodes.length, res.data.total + 1, 'hub + her kayıt bir düğüm');
  assert.equal(res.data.nodes[0].id, 'hub');
  assert.equal(res.data.nodes[0].kind, 'hub');
  assert.ok(res.data.edges.length >= res.data.nodes.length - 1,
    `kenar sayısı yetersiz: ${res.data.edges.length}`);
  assert.ok(res.data.edges.some((e) => e.from === 'hub'), 'hub bağlantısı yok');
});

test('tur6/memory 9: graph koordinatları iki çağrıda aynı (deterministik)', (t) => {
  const { service } = makeService('memory-graph-deterministic', t);
  service.auto({ text: THREE_LINES, source: 'test' });

  const a = service.graph();
  const b = service.graph();
  assert.ok(a.ok && b.ok);

  const mapB = new Map(b.data.nodes.map((n) => [n.id, n]));
  for (const node of a.data.nodes) {
    const other = mapB.get(node.id);
    assert.ok(other, `düğüm ikinci çağrıda yok: ${node.id}`);
    assert.equal(node.x, other.x, `x deterministik değil: ${node.id}`);
    assert.equal(node.y, other.y, `y deterministik değil: ${node.id}`);
  }
});

test('tur6/memory: Turkish search and kind filter retain the unfiltered total', (t) => {
  const { service } = makeService('memory-filters', t);
  assert.ok(service.write({ text: 'İstanbul dosyası', scope: 'project', kind: 'decision' }).ok);
  assert.ok(service.write({ text: 'İstanbul kılavuzu', scope: 'project', kind: 'fact' }).ok);
  const result = service.read({ q: 'istanbul', kind: 'decision', sort: 'recent' });
  assert.equal(result.data.total, 2);
  assert.deepEqual(result.data.entries.map((entry) => entry.text), ['İstanbul dosyası']);
});
