'use strict';

/*
 * T-175 — Hata kodları kullanıcıya Türkçe görünür.
 *
 * Kullanıcı `E_BUSY` gibi çıplak bir kodla karşılaşmamalı. Bu test sözleşmeyi
 * kaynak düzeyinde kilitler:
 *   1) `src/shared/errors.js` sözlüğündeki HER kod (E_OK hariç) renderer'da bir
 *      Türkçe karşılığa sahiptir.
 *   2) Karşılıklar çıplak kod değildir (en az bir cümle).
 *   3) Hata gösterimi sözlüğü önce dener, sonra sunucunun mesajına düşer.
 *   4) Yerel istemci hataları da (köprü yok, istemci hatası) çevrilmiştir.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, RENDERER, read } = require('../lib');

const app = read(path.join(RENDERER, 'app.js'));
const shared = read(path.join(SRC, 'shared', 'errors.js'));

const CODES = [...new Set([...shared.matchAll(/E_[A-Z0-9_]+/g)].map((m) => m[0]))].filter((c) => c !== 'E_OK');

function viewsBlock() {
  const start = app.indexOf('const ERROR_CODE_VIEWS');
  assert.ok(start > 0, 'ERROR_CODE_VIEWS yok');
  return app.slice(start, app.indexOf('};', start));
}

test('errors 1: her hata kodu Türkçe karşılık taşır', () => {
  const block = viewsBlock();
  const missing = CODES.filter((code) => !block.includes(`${code}:`));
  assert.deepStrictEqual(missing, [], 'çevrilmemiş hata kodu var');
  assert.ok(CODES.length >= 19, 'kod sözlüğü beklenen büyüklükte değil');
});

test('errors 2: karşılıklar çıplak kod değil, açıklayıcı cümle', () => {
  const block = viewsBlock();
  for (const line of block.split('\n')) {
    const m = /^\s*(E_[A-Z0-9_]+):\s*'([^']*)'/.exec(line);
    if (!m) continue;
    const [, code, text] = m;
    assert.ok(text.length >= 12, `${code}: açıklama çok kısa (${text})`);
    assert.ok(!text.startsWith(code), `${code}: metin kodu tekrar ediyor`);
    assert.match(text, /[a-zçğıöşü]/, `${code}: Türkçe cümle değil`);
  }
});

test('errors 3: gösterim önce sözlüğü dener', () => {
  assert.match(app, /ERROR_CODE_VIEWS\[code\]/, 'sözlük kullanılmıyor');
  /* Sözlükte yoksa çıplak kod göstermek yerine son çare metin var. */
  assert.match(app, /'bilinmeyen hata'/, 'bilinmeyen kod için son çare metin yok');
});

test('errors 4: yerel istemci hataları da çevrili', () => {
  const block = viewsBlock();
  for (const code of ['E_NO_BRIDGE', 'E_CLIENT']) {
    assert.ok(block.includes(`${code}:`), `${code} çevrilmemiş`);
  }
});

test('errors 5: ortak errText yardımcısı toast’larda kullanılıyor', () => {
  assert.match(app, /function errText\(res, fallback = 'bilinmeyen hata'\)/, 'errText yok');
  const uses = (app.match(/\$\{errText\(res/g) || []).length;
  assert.ok(uses >= 6, `errText kullanımı az (${uses})`);
  /* Doğrudan çıplak kod gösteren toast kalmamalı. */
  const leaks = app.split('\n').filter((l) => /toast\(/.test(l) && /res\.error\.code\) \|\| 'hata'/.test(l));
  assert.deepStrictEqual(leaks.map((l) => l.trim().slice(0, 60)), [], 'toast hâlâ çıplak kod gösteriyor');
});
