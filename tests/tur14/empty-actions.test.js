'use strict';

/*
 * T-183 — Boş durumlar bir sonraki adımı önerir.
 *
 * "Filtreye uyan görev yok." ne olduğunu söylüyor, ne yapacağını söylemiyordu.
 * Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) Tek yardımcı (`emptyState`) boş durumu metin + TEK eylem düğmesiyle kurar;
 *      düğme `data-empty-action` taşır.
 *   2) Süzgeç boşlukları (ekip/pano/rapor) "Filtreyi temizle" sunar; temizleyici
 *      store'u, giriş kutusunu ve listeyi birlikte sıfırlar.
 *   3) Veri boşlukları (hafıza/projeler/sağlayıcılar) ilgili ekleme penceresini açar.
 *   4) Pano okunamadığında "Yeniden dene" gerçekten yeniden okur.
 *   5) Görsel sınıf ve gerçek uygulama kapısı vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const css = read(path.join(RENDERER, 'styles', 'components.css'));

test('empty 1: tek yardımcı, tek eylem düğmesi', () => {
  assert.match(app, /function emptyState\(text, actionLabel, run, extraClass = ''\)/, 'yardımcı yok');
  const start = app.indexOf('function emptyState(');
  const block = app.slice(start, app.indexOf('/* T-183: süzgeci', start));
  assert.match(block, /'data-empty-action': actionLabel/, 'düğme işaretlenmiyor');
  assert.match(block, /'data-empty-action'/, 'kapı kancası yok');
  assert.match(block, /class: `kv-empty kv-empty--action/, 'eylem sınıfı yok');
  assert.match(block, /onclick: run/, 'düğme eylemi bağlanmıyor');
  assert.strictEqual((block.match(/el\('button'/g) || []).length, 1, 'birden fazla eylem düğmesi');
});

test('empty 2: süzgeç boşlukları temizleme sunar', () => {
  for (const [fn, helper, field] of [
    ['renderTeam', 'clearTeamFilter', 'team-filter'],
    ['renderBoard', 'clearBoardFilter', 'board-filter'],
    ['renderReports', 'clearReportFilters', 'report-task'],
  ]) {
    const start = app.indexOf(`function ${fn}()`);
    assert.ok(start > 0, `${fn} yok`);
    const block = app.slice(start, start + 4000);
    assert.match(block, /Filtreye uyan .* yok\./, `${fn} süzgeç metni yok`);
    assert.match(block, new RegExp(`emptyState\\('[^']*', 'Filtreyi temizle', ${helper}\\)`), `${fn} temizleme düğmesi yok`);
  }
  for (const [helper, field] of [['clearTeamFilter', 'team-filter'], ['clearBoardFilter', 'board-filter']]) {
    const start = app.indexOf(`function ${helper}()`);
    const block = app.slice(start, start + 320);
    assert.match(block, new RegExp(`\\[data-field="${field}"\\]`), `${helper} kutuyu sıfırlamıyor`);
    assert.match(block, /\.value = ''/, `${helper} kutu değerini temizlemiyor`);
    assert.match(block, /store\.filters\.\w+ = ''/, `${helper} store'u temizlemiyor`);
  }
  const cf = app.slice(app.indexOf('function clearReportFilters()'), app.indexOf('function clearReportFilters()') + 500);
  for (const f of ['reportRole', 'reportStatus', 'reportTask']) {
    assert.match(cf, new RegExp(`store\\.filters\\.${f} = ''`), `${f} sıfırlanmıyor`);
  }
});

test('empty 3: veri boşlukları ekleme penceresi açar', () => {
  const cases = [
    ['data-memory-list', 'Hatırlanacak ekle', 'openMemoryAdd'],
    ['data-project-grid', 'Yeni proje', 'openProjectNew'],
    ['data-provider-grid', 'Sağlayıcı ekle', 'openProviderNew'],
  ];
  for (const [anchor, label, fn] of cases) {
    const at = app.indexOf(anchor);
    assert.ok(at > 0, `${anchor} yok`);
    const block = app.slice(at - 200, at + 400);
    assert.match(block, new RegExp(`emptyState\\([^)]*'${label}', ${fn}\\)|emptyState\\([^)]*, '${label}', ${fn}`), `${anchor} eylem düğmesi (${label}) yok`);
  }
});

test('empty 4: pano okunamazsa yeniden dener', () => {
  assert.match(app, /emptyState\('Pano okunamadı[^']*', 'Yeniden dene', \(\) => refreshBoard\(\)\)/, 'yeniden dene düğmesi yok');
  assert.match(app, /emptyState\('Henüz rapor toplanmadı\.', 'Yeniden tara', \(\) => refreshReports\(\)\)/, 'rapor yeniden tarama yok');
});

test('empty 5: görsel sınıf ve canlı kapı var', () => {
  assert.match(css, /\.kv-empty--action \{/, 'eylem stili yok');
  const style = css.slice(css.indexOf('.kv-empty--action {'), css.indexOf('.kv-empty--action {') + 300);
  assert.match(style, /display: flex/, 'düğme hizalanmıyor');
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'verify', 'empty-actions.js'), 'utf8');
  assert.match(gate, /Filtreyi temizle/, 'kapı düğmeyi ölçmüyor');
  assert.match(gate, /BOS DURUM EYLEMI: GECTI/, 'kapı sonucu yazmıyor');
});
