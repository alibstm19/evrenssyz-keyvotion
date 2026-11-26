'use strict';

/*
 * T-170 — Çökme kalkanı.
 *
 * Kullanıcı şikâyeti: tur bitince beyaz ekran/donma (T-168'de kök nedeni
 * düzeltildi). Aynı sınıfın kalan yarısı: renderer çökerse ya da bir betik
 * yakalanmayan hata fırlatırsa kullanıcı kilitli ekranda kalmasın.
 *
 * Bu test sözleşmeyi kaynak düzeyinde kilitler:
 *   1) boot() çökme kalkanını kurar (uncaught error + unhandled rejection).
 *   2) Kart DOM'u vardır ve gizlidir; sayfa açılışında görünmez.
 *   3) Ana süreç renderer çökmesini yakalar ve BİR KEZ yeniden yükler
 *      (yeniden yükleme döngüsü kurmaz), olayı denetime yazar.
 *   4) did-fail-load denetimi vardır.
 *   5) Kart stilleri token tabanlıdır; ham renk yok.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const html = read(path.join(RENDERER, 'index.html'));
const main = read(path.join(SRC, 'main', 'main.js'));
const css = read(path.join(RENDERER, 'styles', 'tur14.css'));

test('crash 1: boot() çökme kalkanını kurar', () => {
  assert.match(app, /function installCrashGuard\(/, 'kalkan fonksiyonu yok');
  const boot = app.slice(app.indexOf('async function boot()'), app.indexOf('async function boot()') + 400);
  assert.match(boot, /installCrashGuard\(\);/, 'boot() kalkanı çağırmıyor');
  assert.match(app, /addEventListener\('error'/, 'yakalanmayan hata dinlenmiyor');
  assert.match(app, /addEventListener\('unhandledrejection'/, 'işlenmeyen söz reddi dinlenmiyor');
});

test('crash 2: kart DOM’u var ve başlangıçta gizli', () => {
  assert.match(html, /<div data-crash-root hidden><\/div>/, 'çökme kökü yok ya da gizli değil');
  assert.match(app, /function showCrashCard\(/, 'kart çizen fonksiyon yok');
  assert.match(app, /\$\('\[data-crash-root\]'\)/, 'kök seçilmiyor');
  /* Kart yenileme ve kopyalama sunmalı: veri diskte, yenileme güvenli. */
  assert.match(app, /location\.reload\(\)/, 'yenileme eylemi yok');
  assert.match(app, /copyText\(text\)/, 'ayrıntı kopyalama yok');
});

test('crash 3: ana süreç çökmeyi yakalar, bir kez yeniden yükler', () => {
  assert.match(main, /win\.webContents\.on\('render-process-gone'/, 'renderer çökmesi dinlenmiyor');
  const start = main.indexOf("on('render-process-gone'");
  const block = main.slice(start, start + 900);
  assert.match(block, /reloadsAfterCrash >= 1/, 'yeniden yükleme sınırı yok (döngü riski)');
  assert.match(block, /win\.reload\(\)/, 'çökme sonrası yeniden yükleme yok');
  assert.match(block, /runtime\.audit\.append\(/, 'çökme denetime yazılmıyor');
  assert.match(block, /op: 'renderer-crash'/, 'çökme olay adı yok');
});

test('crash 4: yükleme hatası da denetlenir', () => {
  assert.match(main, /on\('did-fail-load'/, 'did-fail-load dinlenmiyor');
  assert.match(main, /isMainFrame/, 'yalnız ana çerçeve hatası sayılmalı');
  assert.match(main, /op: 'renderer-load-failed'/, 'yükleme hatası olay adı yok');
});

test('crash 5: kart stilleri token tabanlı, ham renk yok', () => {
  assert.match(css, /\[data-crash-root\]:not\(\[hidden\]\)/, 'kaplama stili yok');
  assert.match(css, /\.kv-crash__title/, 'başlık stili yok');
  assert.match(css, /\.kv-crash__detail/, 'ayrıntı stili yok');
  const block = css.slice(css.indexOf('[data-crash-root]'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'çökme stillerinde ham renk var');
  assert.match(block, /var\(--kv-state-error\)/, 'hata vurgusu token kullanmıyor');
  assert.match(block, /focus-visible/, 'odak halkası yok');
});
