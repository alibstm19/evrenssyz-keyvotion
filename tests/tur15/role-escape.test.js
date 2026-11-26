'use strict';
/* T-209 kilit testi — görünüm rolü kaldırıldı, her kullanıcı her şeyi görür.
 *
 * Kullanıcı bildirimi: "ayarlarda profiller var öğretmen vs.; yan tarafta MCP ve
 * entegrasyonlar yerini göremiyorum. O profil yerini kaldır, her kullanan her şeyi
 * görebilsin."
 *
 * Kanıt kuralları:
 *   1) Kaynakta rol filtresi kalmaz (viewRole, ROLE_SCREENS, roleCanSee, ...).
 *   2) Ayarlar'da rol seçici yok; yönetim blokları (kadro, beceriler, izinler,
 *      Votion yetkileri) DOM'da durur.
 *   3) `go()` yalnız seçili olmayan ekranları gizler; rol koşulu yoktur.
 *   4) Komut paleti bütün ekranları listeler.
 *   5) Ayarlar araması yalnız sorguya bakar, rol engeli uygulamaz.
 *   6) Sözleşme v3.7 notu kaldırmayı yazar ve MCP/entegrasyon gezinme öğeleri
 *      index.html'de durur.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read } = require('../lib');

const APP = read(path.join(SRC, 'renderer', 'app.js'));
const HTML = read(path.join(SRC, 'renderer', 'index.html'));
const CONTRACT = read(path.join(__dirname, '..', '..', 'docs', 'console-ui-contract.md'));

const BANNED = [
  'viewRole', 'ROLE_SCREENS', 'roleCanSee', 'applyRoleProjection',
  'setViewRole', 'ADMIN_SETTINGS_SECTIONS', 'data-role-set', 'syncPresetVotionGate'
];

test('T-209/1 kaynakta rol filtresi kalmaz', () => {
  const found = BANNED.filter((token) => APP.includes(token) || HTML.includes(token));
  assert.deepEqual(found, [], `rol filtresi kalıntısı: ${found.join(', ')}`);
  assert.doesNotMatch(HTML, /data-field="role-select"/, 'index.html: rol seçici alanı duruyor');
  assert.doesNotMatch(HTML, />Eğitmen</, 'index.html: Eğitmen düğmesi duruyor');
  assert.doesNotMatch(HTML, />Öğrenci</, 'index.html: Öğrenci düğmesi duruyor');
});

test('T-209/2 yönetim ayar blokları herkese açık DOM’da', () => {
  for (const id of ['roster', 'skills', 'permissions', 'votion-grants']) {
    assert.ok(HTML.includes(`data-settings-section="${id}"`),
      `index.html: ${id} ayar kartı yok`);
  }
  for (const id of ['roster', 'skills', 'permissions']) {
    assert.ok(HTML.includes(`data-settings-jump="${id}"`),
      `index.html: ${id} bölüm çipi yok`);
  }
});

test('T-209/3 go() yalnız seçili olmayan ekranı gizler', () => {
  const start = APP.indexOf('function go(screen)');
  const end = APP.indexOf('function ', start + 10);
  assert.ok(start > -1 && end > start, 'go() bulunamadı');
  const fn = APP.slice(start, end);
  assert.match(fn, /s\.hidden = s\.dataset\.screen !== screen;/, 'ekran gizleme rol koşulu taşıyor');
  assert.doesNotMatch(fn, /role/, 'go() içinde rol koşulu kaldı');
});

test('T-209/4 komut paleti bütün ekranları listeler', () => {
  const start = APP.indexOf('function paletteAll()');
  const end = APP.indexOf('function ', start + 10);
  assert.ok(start > -1 && end > start, 'paletteAll() bulunamadı');
  const fn = APP.slice(start, end);
  assert.match(fn, /const base = PALETTE_ITEMS;/, 'palet rol süzgeci uyguluyor');
  assert.doesNotMatch(fn, /roleCanSee|viewRole/, 'palette rol filtresi kaldı');
});

test('T-209/5 ayar araması rol engeli uygulamaz', () => {
  const start = APP.indexOf('function applySettingsFilter');
  const end = APP.indexOf('function ', start + 10);
  assert.ok(start > -1 && end > start, 'applySettingsFilter bulunamadı');
  const fn = APP.slice(start, end);
  assert.doesNotMatch(fn, /ADMIN_SETTINGS_SECTIONS|blocked|viewRole/, 'aramada rol engeli kaldı');
  assert.match(fn, /foldTr\(card\.textContent\)\.includes\(q\)/, 'arama metin eşleşmesi yapmıyor');
});

test('T-209/6 sözleşme kaldırmayı yazar; MCP ve entegrasyon gezinmede', () => {
  assert.match(CONTRACT, /v3\.7 notu \(T-209\)/, 'sözleşmede v3.7 notu yok');
  assert.match(CONTRACT, /görünüm rolü.{0,80}kaldırıldı/is, 'sözleşme kaldırmayı yazmıyor');
  for (const item of ['integrations', 'mcps', 'catalog', 'audit', 'admin']) {
    assert.ok(HTML.includes(`data-nav-item="${item}"`), `index.html: ${item} gezinme öğesi yok`);
  }
});
