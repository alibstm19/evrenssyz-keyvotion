'use strict';

/*
 * T-196 — Entegrasyona GİR, geri dön.
 *
 * Kusur (ölçüldü, düzeltmeden önce): entegrasyonlar tek uzun sayfaydı (ölçüm:
 * 8.103 px içerik, 900 px pencere). Katalogdaki 64 karttan birine tıklamak
 * yalnız "seç" durumunu değiştiriyordu; bağlantı formu sayfanın ortasında
 * kalıyor, kullanıcı girdiğini sanıyor ama hiçbir yere girmiyordu. Geri dönüş
 * yolu da yoktu (yalnız Alt+Sol biliyordu).
 *
 * Bu test kilidi:
 *   1) Karta tıklamak detay görünümünü açar, katalog gizlenir.
 *   2) Detayın görünür bir GERİ düğmesi vardır.
 *   3) Geri / Esc / tarayıcı gerisi listeye döner.
 *   4) Detay kendi gezinme kaydıdır: `kv://integrations/<sağlayıcı>` adresi.
 *   5) 23 ekran sözleşmesi bozulmaz (yeni ekran EKLENMEZ).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('../lib');

const html = read(path.join(ROOT, 'src', 'renderer', 'index.html'));
const app = read(path.join(ROOT, 'src', 'renderer', 'app.js'));
const css = read(path.join(ROOT, 'src', 'renderer', 'styles', 'tur12.css'));

test('entegrasyon detay 1: detay şeridi ve geri düğmesi işaretlemede var', () => {
  assert.match(html, /data-integration-detail/, 'detay şeridi yok');
  assert.match(html, /data-action="integration-back"/, 'geri düğmesi yok');
  assert.match(html, /data-field="integration-detail-title"/, 'detay başlığı yok');
  assert.match(html, /data-integrations-block="b1"[\s\S]*data-integration-catalog/, 'katalog bloğu yerinde değil');
});

test('entegrasyon detay 2: karta tıklamak detaya girer', () => {
  assert.match(app, /integration: \{[\s\S]{0,400}?view: 'list'/, 'görünüm durumu yok');
  const pick = app.match(/async function pickIntegration\([\s\S]*?\n\}/);
  assert.ok(pick, 'pickIntegration yok');
  assert.match(pick[0], /st\.view = st\.providerId \? 'detail' : 'list'/, 'tıklama detaya girmiyor');
  assert.match(pick[0], /navRecord\(navEntryOf\('integration'/, 'detay gezinme kaydı yazmıyor');
});

test('entegrasyon detay 3: geri yolları bağlı (düğme, Esc, tarayıcı gerisi)', () => {
  assert.match(app, /case 'integration-back': closeIntegrationDetail\(\);/, 'geri düğmesi bağlı değil');
  assert.match(app, /function closeIntegrationDetail\(\)[\s\S]{0,200}?navBack\(\)/, 'geri, gezinme geçmişini kullanmıyor');
  assert.match(app, /store\.screen === 'integrations' && store\.integration\.view === 'detail'[\s\S]{0,120}?closeIntegrationDetail\(\)/,
    'Esc detaydan çıkarmıyor');
  assert.match(app, /let integrationDetailTarget = null;/, 'detay hedefi tutulmuyor');
  assert.match(app, /if \(!integrationDetailTarget\) \{\s*store\.integration\.view = 'list';/, 'ekrana giriş listeye dönmüyor');
});

test('entegrasyon detay 4: adres ve sekme kaydı', () => {
  assert.match(app, /if \(entry\.kind === 'integration'\) return `integrations\/\$\{entry\.ref\}`;/, 'adres biçimi yok');
  assert.match(app, /if \(kind === 'integration'\) \{[\s\S]{0,200}?Entegrasyon ·/, 'sekme başlığı yok');
  assert.match(app, /head === 'integrations' && ref\) \{ navOpen\(navEntryOf\('integration', ref\)\)/, 'adres çubuğu rotası yok');
  assert.match(app, /entry\.kind === 'integration'\) \{\s*integrationDetailTarget = entry\.ref;/, 'gezinme uygulaması detayı açmıyor');
});

test('entegrasyon detay 5: detay görünümü katalogu gizler, yeni ekran eklemez', () => {
  const screens = [...html.matchAll(/data-screen="([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(screens).size, 23, `ekran sayısı ${new Set(screens).size} — sözleşme 23`);
  assert.ok(!screens.includes('integration-detail'), 'yeni ekran eklenmiş — detay aynı ekranda olmalı');
  assert.match(css, /\.kv-integrations\[data-integrations-view="detail"\] \[data-integrations-block="b1"\] \{\s*display: none;/, 'detayda katalog gizlenmiyor');
  assert.match(css, /\.kv-detail-head/, 'detay şeridi stili yok');
  assert.ok(!/style="/.test(html), 'satır içi style kullanılmış');
});

test('entegrasyon detay 6: hesap listesi detayda sağlayıcıya daralır', () => {
  assert.match(app, /st\.view === 'detail'\s*\? st\.accounts\.filter\(\(a\) => a\.providerId === st\.providerId\)/,
    'detayda hesaplar filtrelenmiyor');
});
