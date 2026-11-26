'use strict';
/* T-199 kilit testi — Volt tasarım paketi.
 *
 * Kanıt kuralları (ekip anayasası):
 *   1) Paket YALNIZ [data-design="volt"] altında konuşur: hiçbir kural sızmaz.
 *   2) Klasik görünüm anahtarı kaldırınca geri gelir (tek öznitelik).
 *   3) CSP: satır içi stil, @import, uzak url, @font-face yok.
 *   4) UI-149: her tıklanabilir hedef ≥36px (bu yüzden volt.css'te küçük
 *      min-height kalmamalı).
 *   5) UI-138: ölçülen kontrast çiftleri AA eşiğini geçer (hesap burada).
 *   6) Ayarlar'daki seçimler (tema/köşe/yazı tipi) Volt'ta sessizce ölmez.
 *   7) index.html paketi EN SON yükler ve düğme/segment kancaları vardır.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, read } = require('../lib');

const CSS = read(path.join(SRC, 'renderer', 'styles', 'volt.css'));
const HTML = read(path.join(SRC, 'renderer', 'index.html'));
const APP = read(path.join(SRC, 'renderer', 'app.js'));

/** Sızmaz: `[data-design="volt"]` ile başlamayan hiçbir seçici olmamalı.
 *  :root[data-design="volt"]… de kabul (öznitelik html'de). */
function leakingSelectors(css) {
  const out = [];
  /* Yorumlar ve @keyframes gövdeleri seçici değildir. */
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
    /* @media koşulu seçici değil; içindeki bloklar ayrı ayrı denetlenir. */
    const list = selectors.replace(/@media[^{]*/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of list) {
      if (/^@/.test(sel)) continue;
      const scoped = /\[data-design="volt"\]/.test(sel);
      if (!scoped) out.push(sel);
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

test('volt 1: kural sızıntısı yok — klasik görünüm etkilenmez', () => {
  const leaks = leakingSelectors(CSS);
  assert.deepEqual(leaks, [], `data-design kapsamı dışında seçici: ${leaks.slice(0, 5).join(' | ')}`);
  /* Ters kanıt: kapsamlı seçici sayısı gerçekten büyük (boş dosya geçmesin). */
  assert.ok((CSS.match(/\[data-design="volt"\]/g) || []).length > 100);
});

test('volt 2: paket en son yüklenir ve anahtar kancaları vardır', () => {
  const links = [...HTML.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map((m) => m[1]);
  /* T-201: volt.css'ten sonra prototip.css gelir; Volt hâlâ zincirin
     sonlarına yakın ve prototip'ten ÖNCE yüklenir. */
  assert.ok(links.includes('styles/volt.css'), 'volt.css zincirde yok');
  assert.ok(links.indexOf('styles/volt.css') < links.indexOf('styles/prototip.css'),
    'volt.css prototip.css\'ten sonra yükleniyor');
  assert.match(HTML, /data-design-set="volt"/, 'ayarlarda Volt seçimi yok');
  assert.match(HTML, /data-design-set="classic"/, 'ayarlarda Klasik seçimi yok');
  assert.match(HTML, /data-action="toggle-design"/, 'üst şeritte geçiş düğmesi yok');
  assert.match(APP, /const DESIGNS = \['classic', 'volt', 'prototip'\]/, 'DESIGNS listesi yok');
  assert.match(APP, /dataset\.design/, 'html data-design yazılmıyor');
  assert.match(APP, /case 'toggle-design'/, 'toggle-design eylemi bağlı değil');
});

test('volt 3: CSP temiz — satır içi stil, @import, uzak kaynak yok', () => {
  assert.doesNotMatch(CSS, /@import/);
  assert.doesNotMatch(CSS, /@font-face/);
  assert.doesNotMatch(CSS, /url\(\s*['"]?https?:/);
  assert.doesNotMatch(HTML, /\sstyle="/, 'index.html içinde satır içi stil var (CSP ihlali)');
  assert.match(HTML, /connect-src 'none'/);
});

test('volt 4: UI-149 — tıklanabilir hedefler 36px altına inmez', () => {
  /* volt.css içinde 36'dan küçük min-height / height veren düğme kuralı olmamalı. */
  const blocks = CSS.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  const bad = [];
  for (const block of blocks) {
    const open = block.indexOf('{');
    if (open < 0) continue;
    const sel = block.slice(0, open);
    const body = block.slice(open + 1);
    if (!/kv-(button|iconbtn|nav__item)/.test(sel)) continue;
    for (const m of body.matchAll(/(?:min-)?height:\s*(\d+)px/g)) {
      if (Number(m[1]) < 36) bad.push(`${sel.trim().slice(0, 50)} → ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `36px altı hedef: ${bad.join(' | ')}`);
});

test('volt 5: UI-138 — metin/ikon kontrastı AA', () => {
  const pairs = [
    ['#f4f1e9', '#0f1013', 4.5, 'koyu gövde'],
    ['#a9abb6', '#0f1013', 4.5, 'koyu ikincil'],
    ['#8b8e99', '#0f1013', 4.5, 'koyu soluk'],
    ['#0b0b0d', '#ff5a1f', 4.5, 'koyu düğme'],
    ['#ff5a1f', '#08090b', 4.5, 'koyu vurgu metni'],
    ['#c6f24e', '#0f1013', 4.5, 'koyu asit'],
    ['#5bd8ea', '#0f1013', 4.5, 'koyu bilgi'],
    ['#ff5470', '#0f1013', 4.5, 'koyu tehlike'],
    ['#15140f', '#fbf9f4', 4.5, 'açık gövde'],
    ['#57544a', '#fbf9f4', 4.5, 'açık ikincil'],
    ['#66624f', '#fbf9f4', 4.5, 'açık soluk'],
    ['#fff9f2', '#bd3a05', 4.5, 'açık düğme'],
    ['#bd3a05', '#f1ede4', 4.5, 'açık vurgu metni'],
    ['#4c6a00', '#fbf9f4', 4.5, 'açık asit'],
    ['#0b6473', '#fbf9f4', 4.5, 'açık bilgi'],
    ['#a81c34', '#fbf9f4', 4.5, 'açık tehlike']
  ];
  const failures = pairs
    .map(([fg, bg, min, label]) => ({ label, ratio: contrast(fg, bg), min }))
    .filter((p) => p.ratio < p.min);
  assert.deepEqual(failures, [], `AA altı: ${failures.map((f) => `${f.label} ${f.ratio}`).join(' | ')}`);
  /* Renkler gerçekten dosyada tanımlı mı (uydurma değer testte kalmasın). */
  for (const hex of ['#ff5a1f', '#c6f24e', '#bd3a05', '#4c6a00']) {
    assert.ok(CSS.toLowerCase().includes(hex), `${hex} volt.css içinde yok`);
  }
});

test('volt 6: ayarlar sessizce ölmez — tema, köşe, yazı tipi', () => {
  /* 6 tema: dark/light + 4 Volt paleti ayrı ayrı tanımlı olmalı. */
  for (const theme of ['midnight', 'forest', 'sunset', 'mono']) {
    assert.match(CSS, new RegExp(`:root\\[data-design="volt"\\]\\[data-theme="${theme}"\\]`),
      `${theme} için Volt paleti yok — tema seçimi işlevsiz kalır`);
  }
  /* Köşe: üç seçim de html üzerinde tanımlı. */
  for (const radius of ['keskin', 'yuvarlak']) {
    assert.match(CSS, new RegExp(`:root\\[data-design="volt"\\]\\[data-radius="${radius}"\\]`),
      `${radius} köşe seçimi Volt'ta tanımsız`);
  }
  /* Yazı tipi: yalnız "sistem" için yüz değişir; diğerleri themes.css'ten gelir. */
  assert.match(CSS, /:root\[data-design="volt"\]\[data-font="sistem"\]/);
  const unconditional = /:root\[data-design="volt"\]\s*\{[^}]*--kv-font-sans/.test(CSS);
  assert.equal(unconditional, false, 'yazı tipi seçimini ezen koşulsuz --kv-font-sans var');
});

test('volt 7: dar ekranda gezinme etiketleri gizlenmez (erişilebilir ad)', () => {
  /* İkon aria-hidden; etiket display:none olursa düğme adsız kalır. */
  const media = CSS.slice(CSS.indexOf('@media (max-width: 860px)'));
  const block = media.slice(0, media.indexOf('@media (prefers-reduced-motion'));
  assert.doesNotMatch(block, /\.kv-nav__item > span:not\(\.kv-nav__icon\)[^{]*\{[^}]*display:\s*none/,
    'dar ekranda etiket gizleniyor → eylemsiz adsız düğme');
  /* Her gezinme düğmesi title taşır (kırpılan etiketin tam adı). */
  const items = [...HTML.matchAll(/<button class="kv-nav__item"[^>]*>/g)].map((m) => m[0]);
  assert.equal(items.length, 23, 'gezinme düğmesi sayısı 23 değil');
  const untitled = items.filter((b) => !/\stitle="[^"]+"/.test(b));
  assert.deepEqual(untitled, [], `title taşımayan düğme: ${untitled.length}`);
});
