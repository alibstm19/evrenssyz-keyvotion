'use strict';
/* T-201 kilit testi — Prototip tasarım paketi.
 *
 * Kanıt kuralları (ekip anayasası):
 *   1) Paket YALNIZ [data-design="prototip"] altında konuşur: hiçbir kural sızmaz.
 *   2) index.html paketi EN SON yükler; üç tasarım da seçilebilir.
 *   3) CSP: satır içi stil, @import, uzak url, @font-face yok.
 *   4) UI-149: her tıklanabilir hedef ≥36px.
 *   5) UI-138: ölçülen kontrast çiftleri AA eşiğini geçer.
 *   6) Ayarlar'daki seçimler (tema/köşe/yazı tipi) Prototip'te sessizce ölmez.
 *   7) Kabuk gerçekten yeni: yüzen güverte/tuval/panel yüzeyleri tanımlı.
 *   8) Hareket azaltma tercihi ve !important disiplini korunur.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read } = require('../lib');

const CSS = read(path.join(SRC, 'renderer', 'styles', 'prototip.css'));
const VOLT = read(path.join(SRC, 'renderer', 'styles', 'volt.css'));
const HTML = read(path.join(SRC, 'renderer', 'index.html'));
const APP = read(path.join(SRC, 'renderer', 'app.js'));

/** Sızmaz: `[data-design="prototip"]` ile başlamayan hiçbir seçici olmamalı. */
function leakingSelectors(css) {
  const out = [];
  let withoutComments = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  const blocks = withoutComments.split('}');
  for (const block of blocks) {
    const open = block.indexOf('{');
    if (open < 0) continue;
    const selectors = block.slice(0, open);
    const body = block.slice(open + 1);
    if (!body.trim() && !selectors.includes(':')) continue;
    const list = selectors.replace(/@media[^{]*/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of list) {
      if (/^@/.test(sel)) continue;
      if (!/\[data-design="prototip"\]/.test(sel)) out.push(sel);
    }
  }
  return out;
}

function contrast(a, b) {
  const lum = (hex) => {
    const n = hex.replace('#', '');
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

test('prototip 1: kural sızıntısı yok — klasik ve Volt etkilenmez', () => {
  const leaks = leakingSelectors(CSS);
  assert.deepEqual(leaks, [], `data-design kapsamı dışında seçici: ${leaks.slice(0, 5).join(' | ')}`);
  assert.ok((CSS.match(/\[data-design="prototip"\]/g) || []).length > 100,
    'kapsamlı seçici sayısı çok az — paket boş görünüyor');
  /* Aynı sınıf adları iki pakette de var; ikisi ayrı dosyada ve ayrı kapsamda. */
  assert.notEqual(VOLT, CSS, 'prototip.css ile volt.css aynı dosya olmamalı');
});

test('prototip 2: paket gerçekten en son yüklenir, üç tasarım seçilebilir', () => {
  const links = [...HTML.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map((m) => m[1]);
  assert.equal(links[links.length - 1], 'styles/prototip.css', 'prototip.css son yüklenmiyor');
  assert.ok(links.indexOf('styles/volt.css') < links.lastIndexOf('styles/prototip.css'),
    'yükleme sırası volt → prototip değil');
  for (const design of ['classic', 'volt', 'prototip']) {
    assert.match(HTML, new RegExp(`data-design-set="${design}"`), `ayarlarda ${design} seçimi yok`);
  }
  assert.match(HTML, /data-action="toggle-design"/, 'üst şeritte geçiş düğmesi yok');
  assert.match(APP, /const DESIGNS = \['classic', 'volt', 'prototip'\]/, 'DESIGNS listesi üç seçenekli değil');
  assert.match(APP, /dataset\.design/, 'html data-design yazılmıyor');
  assert.match(APP, /function toggleDesign/, 'toggleDesign tanımlı değil');
  assert.match(APP, /case 'toggle-design'/, 'toggle-design eylemi bağlı değil');
});

test('prototip 3: CSP temiz — satır içi stil, @import, uzak kaynak yok', () => {
  assert.doesNotMatch(CSS, /@import/);
  assert.doesNotMatch(CSS, /@font-face/);
  assert.doesNotMatch(CSS, /url\(\s*['"]?https?:/);
  assert.doesNotMatch(CSS, /!important/, 'kaskad zorlaması (!important) kullanılmış');
  assert.doesNotMatch(HTML, /\sstyle="/, 'index.html içinde satır içi stil var (CSP ihlali)');
  assert.match(HTML, /connect-src 'none'/);
});

test('prototip 4: UI-149 — tıklanabilir hedefler 36px altına inmez', () => {
  /* Dekoratif ::before/::after kuralları hedefin kendi boyu değildir. */
  const blocks = CSS.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  const bad = [];
  for (const block of blocks) {
    const open = block.indexOf('{');
    if (open < 0) continue;
    const sel = block.slice(0, open);
    const body = block.slice(open + 1);
    if (!/kv-(button|iconbtn|nav__item)/.test(sel)) continue;
    if (/::(before|after)/.test(sel)) continue;
    for (const m of body.matchAll(/(?:min-)?height:\s*(\d+)px/g)) {
      if (Number(m[1]) < 36) bad.push(`${sel.trim().slice(0, 50)} → ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `36px altı hedef: ${bad.join(' | ')}`);
});

test('prototip 5: UI-138 — metin/ikon kontrastı AA', () => {
  const pairs = [
    ['#eef0ff', '#0e1018', 4.5, 'koyu gövde'],
    ['#aab1cb', '#0e1018', 4.5, 'koyu ikincil'],
    ['#8b93b0', '#0e1018', 4.5, 'koyu soluk'],
    ['#08080f', '#8b7bff', 4.5, 'koyu düğme'],
    ['#8b7bff', '#07080d', 4.5, 'koyu vurgu metni'],
    ['#3ee8c8', '#0e1018', 4.5, 'koyu deniz yeşili'],
    ['#4ad99b', '#0e1018', 4.5, 'koyu başarı'],
    ['#ffc65c', '#0e1018', 4.5, 'koyu uyarı'],
    ['#ff6b86', '#0e1018', 4.5, 'koyu tehlike'],
    ['#62ccff', '#0e1018', 4.5, 'koyu bilgi'],
    ['#16131f', '#ffffff', 4.5, 'açık gövde'],
    ['#565067', '#ffffff', 4.5, 'açık ikincil'],
    ['#6b6480', '#ffffff', 4.5, 'açık soluk'],
    ['#ffffff', '#5a3fe0', 4.5, 'açık düğme'],
    ['#5a3fe0', '#f4f3fa', 4.5, 'açık vurgu metni'],
    ['#0b7a68', '#ffffff', 4.5, 'açık deniz yeşili'],
    ['#0f7a4d', '#ffffff', 4.5, 'açık başarı'],
    ['#8a5a00', '#ffffff', 4.5, 'açık uyarı'],
    ['#b8203f', '#ffffff', 4.5, 'açık tehlike'],
    ['#0b6a92', '#ffffff', 4.5, 'açık bilgi']
  ];
  const failures = pairs
    .map(([fg, bg, min, label]) => ({ label, ratio: contrast(fg, bg), min }))
    .filter((p) => p.ratio < p.min);
  assert.deepEqual(failures, [], `AA altı: ${failures.map((f) => `${f.label} ${f.ratio}`).join(' | ')}`);
  for (const hex of ['#8b7bff', '#3ee8c8', '#5a3fe0', '#0b7a68']) {
    assert.ok(CSS.toLowerCase().includes(hex), `${hex} prototip.css içinde yok`);
  }
});

test('prototip 6: ayarlar sessizce ölmez — tema, köşe, yazı tipi', () => {
  for (const theme of ['midnight', 'forest', 'sunset', 'mono', 'light']) {
    assert.match(CSS, new RegExp(`:root\\[data-design="prototip"\\]\\[data-theme="${theme}"\\]`),
      `${theme} için Prototip paleti yok — tema seçimi işlevsiz kalır`);
  }
  for (const radius of ['keskin', 'yuvarlak', 'normal']) {
    assert.match(CSS, new RegExp(`:root\\[data-design="prototip"\\]\\[data-radius="${radius}"\\]`),
      `${radius} köşe seçimi html üzerinde tanımsız`);
    assert.match(CSS, new RegExp(`\\[data-design="prototip"\\] \\.kv-app\\[data-radius="${radius}"\\]`),
      `${radius} köşe seçimi .kv-app alt ağacında tanımsız`);
  }
  assert.match(CSS, /:root\[data-design="prototip"\]\[data-font="sistem"\]/);
  const unconditional = /:root\[data-design="prototip"\]\s*\{[^}]*--kv-font-sans/.test(CSS);
  assert.equal(unconditional, false, 'yazı tipi seçimini ezen koşulsuz --kv-font-sans var');
});

test('prototip 7: kabuk yeniden kurulmuş — yüzen güverte, tuval, panel', () => {
  /* Üç yüzey de kenarlık + yarıçap + gölge ile ayrışır (klasik tam-kaplama değil). */
  for (const surface of ['kv-nav', 'kv-topbar', 'kv-main', 'kv-rail']) {
    const re = new RegExp(`\\[data-design="prototip"\\] \\.${surface}\\s*\\{[^}]*border-radius`);
    assert.match(CSS, re, `${surface} yüzen yüzey olarak tanımlı değil`);
  }
  assert.match(CSS, /\[data-design="prototip"\] \.kv-nav\s*\{[^}]*margin:\s*10px/,
    'güverte tuvalden ayrılmıyor (margin yok)');
  assert.match(CSS, /\[data-design="prototip"\] \.kv-main\s*\{[^}]*background-image/,
    'tuval yüzeyi dokusuz');
  /* Yeni kimlik yardımcıları hem koyu hem açık temada tanımlı. */
  for (const helper of ['--proto-canvas', '--proto-panel', '--proto-glow', '--proto-grid']) {
    assert.ok((CSS.match(new RegExp(helper, 'g')) || []).length >= 2,
      `${helper} yalnız tek temada tanımlı`);
  }
  assert.match(CSS, /--kv-sidebar-w:\s*216px/, 'güverte genişliği ölçeklenmemiş');
});

test('prototip 8: dar ekranda gezinme etiketleri gizlenmez (erişilebilir ad)', () => {
  const media = CSS.slice(CSS.indexOf('@media (max-width: 860px)'));
  const block = media.slice(0, media.indexOf('@media (prefers-reduced-motion'));
  assert.doesNotMatch(block, /\.kv-nav__item > span:not\(\.kv-nav__icon\)[^{]*\{[^}]*display:\s*none/,
    'dar ekranda etiket gizleniyor → eylemsiz adsız düğme');
  const items = [...HTML.matchAll(/<button class="kv-nav__item"[^>]*>/g)].map((m) => m[0]);
  assert.equal(items.length, 23, 'gezinme düğmesi sayısı 23 değil');
  const untitled = items.filter((b) => !/\stitle="[^"]+"/.test(b));
  assert.deepEqual(untitled, [], `title taşımayan düğme: ${untitled.length}`);
});

test('prototip 9: hareket azaltma ve giriş animasyonu', () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/,
    'hareket azaltma tercihi yok sayılıyor');
  assert.match(CSS, /@keyframes proto-rise/);
  /* Azaltılmış harekette giriş animasyonu kapanmalı. */
  const reduce = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduce, /\[data-screen\]:not\(\[hidden\]\)\s*\{\s*animation:\s*none/);
});

test('prototip 10: sekiz tema-üstü yüzey kuralı ham renk yerine yardımcı tüketir', () => {
  /* Palet bölümü dışında (2. İSKELET'ten sonra) kalan gövde --proto-*
     yardımcılarıyla konuşmalı; ham beyaz ışıma açık temada okunmaz olurdu. */
  const body = CSS.slice(CSS.indexOf('2. İSKELET'));
  const veil = (body.match(/rgba\(255,\s*255,\s*255,\s*0\.\d+\)/g) || []).length;
  assert.equal(veil, 0, `palet dışında ham beyaz ışıma: ${veil}`);
  assert.ok((body.match(/var\(--proto-/g) || []).length > 50,
    'yüzeyler yardımcı token tüketmiyor');
});
