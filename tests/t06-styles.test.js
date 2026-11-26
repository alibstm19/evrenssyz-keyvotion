'use strict';

// T6 — index.html'de styles linkleri mevcut (emir T-015 zorunlu başlık 6)
// UI sözleşmesi §10 (v2.2 / T-037 S-1): 8 dosyalı teslim; tek giriş noktası
// (toplu @import dosyası) sözleşmeden KALDIRILDI; sıra bağlayıcıdır (UI-123).
//
// v2.1 (EMİR T-025): beklenen liste elle YAZILMAZ — docs/console-ui-contract.md
// §10/UI-123'ten okunur. Eski test 6 dosyalı v1 listesini (layout.css, index.css)
// elle taşıyordu ve ürünün 8 dosyalı teslimini yanlış failing ediyordu (ölçüm
// hatası; YM Kategori 2 kararı). Kalan iddialar: her link sözleşme adı, sıra
// birebir, tokens ilk, polish son.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, RENDERER, read } = require('./lib');

const html = read(path.join(RENDERER, 'index.html'));
const contract = read(path.join(ROOT, 'docs', 'console-ui-contract.md'));

// Sözleşmeden sıralı listeyi çöz: UI-123 kural hücresindeki
// `tokens.css → theme-dark.css → … → polish.css` zinciri tek yetkilidir.
function contractStyleOrder() {
  const sectionStart = contract.indexOf('## 10');
  assert.ok(sectionStart >= 0, 'console-ui-contract.md içinde §10 bulunamadı — test sözleşmeye yeniden bağlanmalı (test hatası, ürün hatası değil)');
  const sectionEnd = contract.indexOf('## 11', sectionStart);
  const section = contract.slice(sectionStart, sectionEnd < 0 ? contract.length : sectionEnd);

  const chain = section.match(/`((?:[a-z][a-z0-9-]*\.css)(?:\s*→\s*[a-z][a-z0-9-]*\.css)+)`/);
  assert.ok(chain, '§10/UI-123 sıra zinciri (`a.css → b.css → …`) bulunamadı — sözleşme biçimi değişti; test güncellenmeli');

  const names = chain[1].split('→').map((s) => s.trim());
  assert.ok(names.length >= 4, `§10 sıra zinciri anlamsız kısa: ${names.join(', ')}`);

  // Zincirdeki her ad §10 dosya tablosunda TAM YOLUYLE geçmeli (varlık + sahiplik).
  // YM kararı (EMİR T-025): §10 tablosundaki kısaltma (tek satırda iki dosya, styles/
  // öneki olmadan) SÖZLEŞME kusurudur — test bunu affetmez. ARC T-053 satırı ikiye
  // bölüp tam yollara çevirene kadar bu denetim kırmızı kalır; bu beklenen davranıştır.
  for (const name of names) {
    assert.ok(
      section.includes(`styles/${name}`),
      `§10 sırasında ${name} var ama §10 dosya tablosunda src/renderer/styles/${name} yok — sözleşme iç tutarsızlık (ARC T-053 kapsamında bildirildi)`
    );
  }
  return names;
}

function stylesheetHrefs() {
  const links = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)];
  return links.map((m) => {
    const href = m[0].match(/href=["']([^"']+)["']/i);
    return href ? href[1] : '(href yok)';
  });
}

test('T6a: index.html en az bir <link rel="stylesheet"> taşır', () => {
  const hrefs = stylesheetHrefs();
  assert.ok(hrefs.length >= 1, 'stylesheet linki yok — sayfa stilssiz açılır');
});

test('T6b: stylesheet hrefleri UI sözleşmesi §10 (v2.2) dosya adlarından; dosyalar diskte var', () => {
  // v2.1: liste sözleşmeden okunur (eski elle liste yanlıştı — v1 kalıntısı).
  const expected = contractStyleOrder();
  const hrefs = stylesheetHrefs();
  const offenders = hrefs.filter((h) => {
    const name = path.posix.basename(h.replace(/\\/g, '/'));
    return !expected.includes(name);
  });
  assert.strictEqual(
    offenders.length,
    0,
    `sözleşme dışı stylesheet adı: ${offenders.join(', ')} — §10 (v2.2) listesi: ${expected.join(', ')}`
  );

  const missingOnDisk = expected.filter((name) => !fs.existsSync(path.join(RENDERER, 'styles', name)));
  assert.strictEqual(
    missingOnDisk.length,
    0,
    `src/renderer/styles/ altında eksik dosya: ${missingOnDisk.join(', ')} — §10 tablosundaki her dosya teslim edilmiş olmalı`
  );
});

test('T6c: stylesheet sırası sözleşmeyle birebir — tokens ilk, polish son (UI-123)', () => {
  // v2.1: "index.css tek giriş noktası" iddiası KALKTI (T-037/S-1: sözleşmeden
  // kaldırıldı); yerine sıranın kendisi bağlayıcı (UI-123). Bu bir gevşetme değil
  // yeniden bağlama: eski iddia yanlış sözleşme sürümüne dayanıyordu.
  const expected = contractStyleOrder();
  const hrefs = stylesheetHrefs().map((h) => path.posix.basename(h.replace(/\\/g, '/')));
  assert.deepStrictEqual(
    hrefs,
    expected,
    `stylesheet sırası §10/UI-123 ile birebir olmalı.\n  beklenen: ${expected.join(' → ')}\n  bulunan: ${hrefs.join(' → ')}`
  );
  assert.strictEqual(hrefs[0], 'tokens.css', 'tokens.css ilk link olmalı (tema tabanı önce yüklenir)');
  assert.strictEqual(
    hrefs[hrefs.length - 1],
    expected[expected.length - 1],
    `en son link sözleşmedeki son katman olmalı (bulunan: ${hrefs[hrefs.length - 1]}, beklenen: ${expected[expected.length - 1]})`
  );
});

test('T6d: linklenen css dosyaları diskte mevcut', () => {
  const hrefs = stylesheetHrefs();
  const missing = hrefs.filter((h) => !fs.existsSync(path.join(RENDERER, h)));
  assert.strictEqual(
    missing.length,
    0,
    `diskte olmayan stylesheet: ${missing.join(', ')} — src/renderer/styles/ teslimi eksik (sahibi DSN)`
  );
});
