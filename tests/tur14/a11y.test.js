'use strict';

/*
 * T-171 — Erişilebilirlik sözleşmesi (statik).
 *
 * Ürün hedefi: arayüz yalnız fareyle değil klavye ve ekran okuyucuyla da
 * kullanılabilir olsun. Bu test işaretlemeyi kaynak düzeyinde kilitler:
 *   1) Her ekran (`[data-screen]`) erişilebilir bir ad taşır.
 *   2) Statik her form alanı etiketlidir (aria-label / for / saran label).
 *   3) Hiçbir görsel `alt` olmadan gelmez.
 *   4) `id` değerleri benzersizdir (etiket hedefleri bozulmasın).
 *   5) Gerçek uygulamayı gezen kapı (`tools/verify/a11y.js`) vardır.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const html = read(path.join(RENDERER, 'index.html'));

/** Bir alanın saran <label> içinde olup olmadığını kaba ama yeterli biçimde söyler. */
function insideLabel(text, index) {
  const before = text.slice(0, index);
  const opens = (before.match(/<label\b/g) || []).length;
  const closes = (before.match(/<\/label>/g) || []).length;
  return opens > closes;
}

test('a11y 1: her ekran erişilebilir ad taşır', () => {
  const sections = [...html.matchAll(/<section\b[^>]*data-screen="([^"]+)"[^>]*>/g)];
  assert.strictEqual(sections.length, 23, '23 ekran bekleniyordu');
  const missing = sections
    .filter(([tag]) => !/aria-labelledby=|aria-label=/.test(tag))
    .map(([, name]) => name);
  assert.deepStrictEqual(missing, [], 'adsız ekranlar var');
});

test('a11y 2: statik form alanları etiketli', () => {
  const fields = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)];
  assert.ok(fields.length >= 40, 'beklenen alan sayısı bulunamadı');
  const bad = [];
  for (const m of fields) {
    const tag = m[0];
    if (/type="hidden"/.test(tag)) continue;
    if (/aria-label=|aria-labelledby=/.test(tag)) continue;
    const idm = /id="([^"]+)"/.exec(tag);
    if (idm && new RegExp(`<label[^>]*for="${idm[1]}"`).test(html)) continue;
    if (insideLabel(html, m.index)) continue;
    bad.push((tag.match(/data-field="([^"]+)"/) || [, tag.slice(0, 60)])[1]);
  }
  assert.deepStrictEqual(bad, [], 'etiketsiz form alanları var');
});

test('a11y 3: görseller alt taşır, id’ler benzersiz', () => {
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.deepStrictEqual(imgs.filter((t) => !/\balt=/.test(t)), [], 'alt’sız görsel var');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepStrictEqual([...new Set(dup)], [], 'id tekrarı var');
});

test('a11y 4: uçtan uca erişilebilirlik kapısı var', () => {
  const gate = fs.readFileSync(path.join(SRC, '..', 'tools', 'verify', 'a11y.js'), 'utf8');
  for (const needle of ['aria-label', 'aria-labelledby', 'f.closest', 'hasAttribute(\'alt\')', 'dupIds']) {
    assert.ok(gate.includes(needle), `kapıda eksik kural: ${needle}`);
  }
  assert.match(gate, /report\.length === 23/, 'kapı 23 ekranı zorlamıyor');
});
