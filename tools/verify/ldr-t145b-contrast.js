'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function blocks(css) {
  const out = []; let depth = 0, buf = '', sel = '';
  for (const c of css) {
    if (c === '{') { depth++; if (depth === 1) { sel = buf.trim(); buf = ''; } continue; }
    if (c === '}') { depth--; if (depth === 0) { out.push({ sel, body: buf }); buf = ''; } continue; }
    buf += c;
  }
  return out;
}
const vars = (body) => { const o = {}; for (const d of body.matchAll(/(--kv-[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) o[d[1]] = d[2].trim(); return o; };
const collect = (file, pred) => {
  let o = {};
  for (const b of blocks(rd(file))) if (pred(b.sel)) o = { ...o, ...vars(b.body) };
  return o;
};
// koyu = tokens :root (light olmayan) + theme-dark ; acik = tokens [data-theme=light] + theme-light
let dark = collect('src/renderer/styles/tokens.css', (s) => /:root/.test(s) && !/light/.test(s));
let light = collect('src/renderer/styles/tokens.css', (s) => /light/.test(s));
dark = { ...dark, ...collect('src/renderer/styles/theme-dark.css', () => true) };
light = { ...light, ...collect('src/renderer/styles/theme-light.css', () => true) };

const lum = (hex) => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  const [r, g, b] = v.map((x) => parseInt(x.slice(0, 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };

// tur14.css'te GERCEK kullanim: metin renkleri ve zeminleri
const rows = [
  // [ne, fg-token, bg-token, tip, esik]
  ['logo harfi', '--kv-fg', '--kv-bg-elev-2', 'metin', 4.5],
  ['kart durum metni', '--kv-fg', '--kv-bg-elev-1', 'metin', 4.5],
  ['alan etiketi', '--kv-fg-muted', '--kv-bg-elev-2', 'metin', 4.5],
  ['alan ipucu', '--kv-fg-subtle', '--kv-bg-elev-2', 'metin', 4.5],
  ['adim numarasi', '--kv-accent', '--kv-bg-elev-1', 'metin', 4.5],
  ['hata metni', '--kv-fg', '--kv-bg-elev-2', 'metin', 4.5],
  ['kart basligi', '--kv-fg', '--kv-bg-elev-1', 'metin', 4.5],
  ['durum noktasi ready', '--kv-preset-ready', '--kv-bg-elev-1', 'dekor', 3.0],
  ['durum noktasi needs-fields', '--kv-preset-missing', '--kv-bg-elev-1', 'dekor', 3.0],
  ['durum noktasi error', '--kv-state-error', '--kv-bg-elev-1', 'dekor', 3.0],
  ['hata kenari', '--kv-state-error', '--kv-bg-elev-2', 'dekor', 3.0],
  ['form kenari', '--kv-border', '--kv-bg-elev-2', 'dekor', 3.0],
];
let fails = 0;
for (const [theme, t] of [['K', dark], ['A', light]]) {
  for (const [name, fg, bg, tip, esik] of rows) {
    const f = t[fg], b = t[bg];
    if (!f || !b) { console.log(theme, name.padEnd(28), 'TANIMSIZ', fg, bg); fails++; continue; }
    const r = ratio(f, b);
    const ok = r >= esik;
    if (!ok) fails++;
    console.log(theme, name.padEnd(28), tip.padEnd(6), f.padEnd(9), 'üzerinde', b.padEnd(9),
      String(r).padStart(6), ok ? 'GECTI' : 'KALDI', '(eşik ' + esik + ')');
  }
}
console.log('--- kalan:', fails);

// 36px + focus + token
const css = rd('src/renderer/styles/tur14.css');
console.log('min-height 36px:', (css.match(/min-height:\s*36px/g) || []).length,
  '| :focus-visible:', (css.match(/:focus-visible/g) || []).length,
  '| @media:', (css.match(/@media/g) || []).length,
  '| ham renk:', (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length);
const tokens = new Set([...rd('src/renderer/styles/tokens.css').matchAll(/(--kv-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const used = [...new Set([...css.matchAll(/var\((--kv-[a-z0-9-]+)/g)].map((m) => m[1]))];
console.log('token:', tokens.size, '| kullanilan:', used.length, '| tanimsiz:', used.filter((u) => !tokens.has(u)).length);
