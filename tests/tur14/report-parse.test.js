'use strict';
/* Rapor ayristirma: rol kodu ve durum, tek satira sikistirilmis raporlarda da dogru. */
const test = require('node:test');
const assert = require('node:assert');
const { parseReport } = require('../../src/main/services/messages');

test('reports/parse 1: tek satir rapor — rol kodu ve durum cikarilir', () => {
  const r = parseReport('RAPOR T-152 Rol: DEV Durum: TAMAM Kapsam: disi test kirmizi');
  assert.equal(r.role, 'DEV');
  assert.equal(r.status, 'TAMAM');
});

test('reports/parse 2: cok satirli rapor bozulmadan okunur', () => {
  const r = parseReport('# RAPOR T-025\n\nRol: QA\nDurum: TAMAM\nÖzet: testler gecti\nKanıt: 12/12');
  assert.equal(r.role, 'QA');
  assert.equal(r.status, 'TAMAM');
  assert.equal(r.ozet, 'testler gecti');
  assert.equal(r.kanit, '12/12');
});

test('reports/parse 3: DEVOPS kodu OPS olarak normalize edilir', () => {
  assert.equal(parseReport('RAPOR T-001 Rol: DEVOPS Durum: TAMAM').role, 'OPS');
});

test('reports/parse 4: "DEVAM" kelimesi rol sayilmaz', () => {
  assert.equal(parseReport('RAPOR T-002\nRol: DEVAM\nDurum: TAMAM').role, 'DEVAM');
});

test('reports/parse 5: rol yoksa null, uydurulmaz', () => {
  assert.equal(parseReport('RAPOR T-003\nDurum: TAMAM').role, null);
  assert.equal(parseReport('merhaba'), null);
});

test('reports/parse 6: KISMI -> KISMİ, taninmayan durum null', () => {
  assert.equal(parseReport('RAPOR T-004\nRol: DSN\nDurum: KISMI').status, 'KISMİ');
  assert.equal(parseReport('RAPOR T-005\nRol: ARC\nÖzet: x').status, null);
});

test('reports/parse 7: elle yazilmis uzun rol metni 12 harfe kirpilir', () => {
  const r = parseReport('RAPOR T-006\nRol: sef mimar\nDurum: TAMAM');
  assert.equal(r.role, 'SEFMIMAR');
});
