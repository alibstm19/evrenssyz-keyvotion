'use strict';
/* T-203 kilit testi — rol görünümü kendi geri dönüş yolunu gizlemez.
 *
 * Kullanıcı bildirimi: "ayarlar bölümü kayıp, ayarlar ve bağlantı bölümünde
 * bir şey yok." Ölçülen kök neden: viewRole=teacher iken Ayarlar gizliydi,
 * oysa rol seçicisi Ayarlar'ın içinde. Kanıt kuralları:
 *   1) `settings` hem teacher hem student kümesinde (kilitlenme olmaz).
 *   2) Ayarlar'ın yönetim blokları yalnız admin görünümünde (kart + çip).
 *   3) Üyeleri bütünüyle gizlenen gezinme grubu da gizlenir (boş etiket yok).
 *   4) Ayarlar araması rolün gizlediği bloğu geri getirmez.
 *   5) Sözleşme aynı sayıları yazar (teacher 13 · student 6).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read } = require('../lib');

const APP = read(path.join(SRC, 'renderer', 'app.js'));
const HTML = read(path.join(SRC, 'renderer', 'index.html'));
const CONTRACT = read(path.join(__dirname, '..', '..', 'docs', 'console-ui-contract.md'));

function roleBlock() {
  const start = APP.indexOf('const ROLE_SCREENS = {');
  const end = APP.indexOf('};', start);
  assert.ok(start > -1 && end > start, 'ROLE_SCREENS bulunamadi');
  return APP.slice(start, end);
}

function roleSet(name) {
  const block = roleBlock();
  const m = new RegExp(`${name}:\\s*new Set\\(\\[([^\\]]*)\\]\\)`).exec(block);
  assert.ok(m, `${name} kumesi yok`);
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

const ADMIN_SECTIONS = ['roster', 'skills', 'permissions', 'votion-grants'];

test('T-203/1 settings her rolde gorunur (teacher 13, student 6)', () => {
  const teacher = roleSet('teacher');
  const student = roleSet('student');
  assert.ok(teacher.includes('settings'), 'teacher kumesinde settings yok — rol secicisi kilitlenir');
  assert.ok(student.includes('settings'), 'student kumesinde settings yok — rol secicisi kilitlenir');
  assert.equal(teacher.length, 13, `teacher ${teacher.length} ekran; 13 olmali`);
  assert.equal(student.length, 6, `student ${student.length} ekran; 6 olmali`);
});

test('T-203/2 admin-only ayar bloklari tanimli ve yonetim ekrani disinda degil', () => {
  assert.match(APP, /const ADMIN_SETTINGS_SECTIONS = \[[^\]]*'roster'/, 'ADMIN_SETTINGS_SECTIONS yok');
  for (const id of ADMIN_SECTIONS) {
    assert.ok(APP.includes(`'${id}'`), `ADMIN_SETTINGS_SECTIONS icinde ${id} yok`);
    assert.ok(
      HTML.includes(`data-settings-section="${id}"`),
      `index.html: ${id} ayar karti yok`
    );
  }
  /* Bolum cipi olan yonetim bloklari (votion-grants kart olarak durur). */
  for (const id of ['roster', 'skills', 'permissions']) {
    assert.ok(
      HTML.includes(`data-settings-jump="${id}"`),
      `index.html: ${id} bolum cipi yok`
    );
  }
});

test('T-203/3 gizli bloklar rol degisiminde kart + cip olarak kapanir', () => {
  const start = APP.indexOf('const isAdmin = role === \'admin\';');
  const end = APP.indexOf('reattachRoleActions();', start);
  assert.ok(start > -1 && end > start, 'rol projeksiyonunda admin blok kapanisi yok');
  const block = APP.slice(start, end);
  assert.match(block, /ADMIN_SETTINGS_SECTIONS/, 'kapanis listesi kullanilmiyor');
  assert.match(block, /data-settings-section/, 'kart gizlenmiyor');
  assert.match(block, /data-settings-jump/, 'bolum cipi gizlenmiyor');
  assert.match(block, /card\.hidden = !isAdmin/, 'kart hidden atanmiyor');
  assert.match(block, /chip\.hidden = !isAdmin/, 'cip hidden atanmiyor');
});

test('T-203/4 butun uyeleri gizli gezinme grubu da gizlenir (bos etiket yok)', () => {
  const start = APP.indexOf('function applyRoleProjection');
  const end = APP.indexOf('/* UI-155', start);
  assert.ok(start > -1 && end > start, 'applyRoleProjection bulunamadi');
  const fn = APP.slice(start, end);
  assert.match(fn, /\.kv-nav__group/, 'grup dongusu yok');
  assert.match(fn, /g\.hidden = !items\.some/, 'bos grup gizlenmiyor');
  /* Kanit: "Baglanti" grubu admin-only uyelerden olusur. */
  const connGroup = HTML.indexOf('<span class="kv-nav__group-label">Bağlantı</span>');
  assert.ok(connGroup > -1, 'Baglanti grubu index.html de yok');
  const tail = HTML.slice(connGroup, HTML.indexOf('</div>', connGroup));
  assert.ok(tail.includes('data-nav-item="integrations"'), 'Baglanti grubu beklenen uyeleri tasimiyor');
});

test('T-203/5 ayar aramasi rolun gizledigi blogu geri getirmez', () => {
  const start = APP.indexOf('function applySettingsFilter');
  const end = APP.indexOf('function renderSettings', start);
  assert.ok(start > -1 && end > start, 'applySettingsFilter bulunamadi');
  const fn = APP.slice(start, end);
  assert.match(fn, /ADMIN_SETTINGS_SECTIONS/, 'arama rol filtresini uygulamiyor');
  assert.match(fn, /blocked\.has\(card\.dataset\.settingsSection\)/, 'arama gizli karti atlamiyor');
  assert.match(fn, /role === 'admin'/, 'admin disi rol tespiti yok');
});

test('T-203/6 sozlesme ayni sayilari yazar (teacher 13, student 6)', () => {
  assert.match(CONTRACT, /teacher` \*\*13\*\* ekran/, 'sozlesmede teacher 13 yazmiyor');
  assert.match(CONTRACT, /student` \*\*6\*\* ekran/, 'sozlesmede student 6 yazmiyor');
  assert.match(CONTRACT, /v3\.5 notu \(T-203\)/, 'sozlesmede v3.5 notu yok');
  assert.match(CONTRACT, /`settings` her rolde açıktır/, 'sozlesme settings istisnasini yazmiyor');
});
