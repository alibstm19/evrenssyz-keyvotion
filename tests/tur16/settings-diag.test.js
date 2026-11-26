'use strict';

/*
 * T-206 — telefon sayfası görünürlük kilidi + Ayarlar genişletmesi.
 *
 * NEDEN: Telefonda "Bağlantı Hatası" kartı sunucu sağlıklıyken de görünüyordu.
 * Kök neden CSS'ti: `.overlay { display: flex }` kuralı `hidden` özniteliğinin
 * tarayıcı varsayılanını eziyor, iki katman da (giriş + hata) her açılışta
 * üst üste çiziliyordu. Kaynak metni ölçen eski kapı bunu göremedi; bu yüzden
 * gizleme kuralı burada AYRICA ve doğrudan kilitlenir.
 *
 * Gerçek tarayıcı ölçümü ayrı kapıdadır: tools/verify/remote-page-render.js
 * (390x844, computed style + kalıcı negatif kontrol).
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ROOT, read } = require('../lib');

const PAGE = read(path.join(ROOT, 'src', 'main', 'services', 'remote-page.html'));
const HTML = read(path.join(ROOT, 'src', 'renderer', 'index.html'));
const APP = read(path.join(ROOT, 'src', 'renderer', 'app.js'));
const TUR6 = read(path.join(ROOT, 'src', 'renderer', 'tur6.js'));

test('settings 1: telefon sayfası `hidden` katmanlarını gerçekten gizler', () => {
  assert.match(PAGE, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
    '[hidden] gizleme kuralı yok — hata katmanı yine her açılışta görünür');
  /* Kusurun kaynağı: sınıf kuralı öznitelik kuralından güçlü. Kural, overlay
     tanımından ÖNCE gelmeli ki sonradan yazılan display:flex onu bozmasın. */
  const ruleAt = PAGE.search(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  const overlayAt = PAGE.indexOf('.overlay {');
  assert.ok(ruleAt > 0 && overlayAt > 0, 'kural veya overlay tanımı bulunamadı');
  assert.ok(ruleAt < overlayAt, '[hidden] kuralı .overlay tanımından sonra kalmış');
});

test('settings 2: Ayarlar ekranı telefon + tanılama bölümlerini taşır ve her bölümün çipi var', () => {
  for (const section of ['remote', 'diagnostics']) {
    assert.match(HTML, new RegExp(`data-settings-section="${section}"`), `bölüm yok: ${section}`);
    assert.match(HTML, new RegExp(`data-settings-jump="${section}"`), `bölüm çipi yok: ${section}`);
  }
  assert.match(HTML, /data-action="set-remote-start"/, 'telefon kartında açma düğmesi yok');
  assert.match(HTML, /data-action="set-remote-copy"/, 'telefon kartında adres kopyalama yok');
  assert.match(HTML, /data-action="diag-run"/, 'tanılama çalıştırma düğmesi yok');
  assert.match(HTML, /data-action="diag-copy"/, 'tanılama raporu kopyalama yok');
  assert.match(HTML, /data-motion-set="azalt"/, 'hareket azaltma seçeneği yok');
  assert.match(HTML, /data-action="prefs-reset"/, 'görünüm sıfırlama düğmesi yok');
});

test('settings 3: tanılama gerçekten ölçer ve hiçbir sır yazmaz', () => {
  assert.match(TUR6, /async function runDiagnostics\(\)/, 'runDiagnostics yok');
  for (const call of ['KV.ping', 'KV.server', 'KV.secret', 'KV.remote', 'KV.settings', 'KV.audit']) {
    assert.ok(TUR6.includes(call), `tanılama ${call} ölçmüyor`);
  }
  /* Rapor metni yalnız etiket + değer taşır; parola/jeton alanı okunmaz. */
  assert.match(TUR6, /function diagText\(\)/, 'kopyalanabilir rapor üreteci yok');
  assert.doesNotMatch(TUR6, /password\s*:\s*\(/, 'tanılama parola okuyor');
  for (const action of ['diag-run', 'diag-copy', 'diag-fix', 'set-remote-start', 'set-remote-stop', 'set-remote-rotate', 'set-remote-copy', 'set-remote-open']) {
    assert.ok(TUR6.includes(`case '${action}'`), `tur6 eylem yönlendirmesi yok: ${action}`);
  }
});

test('settings 4: hareket tercihi kalıcı ve görünüm sıfırlama güvenli', () => {
  assert.match(APP, /motion:\s*'normal'/, 'varsayılan hareket tercihi yok');
  assert.match(APP, /documentElement\.dataset\.motion\s*=\s*motion/, 'hareket tercihi köke uygulanmıyor');
  assert.match(APP, /data-motion-set/, 'hareket düğmeleri bağlanmamış');
  assert.match(APP, /case 'prefs-reset'/, 'görünüm sıfırlama eylemi yok');
  /* Sıfırlama yıkıcı onay kapısından geçmeli ve sırrı silmemeli. */
  const block = APP.slice(APP.indexOf("case 'prefs-reset'"), APP.indexOf("case 'toggle-density'"));
  assert.match(block, /confirmDanger\(/, 'görünüm sıfırlama onay istemiyor');
  assert.ok(!/password|secret/i.test(block), 'görünüm sıfırlama parola/sır alanına dokunuyor');
});
