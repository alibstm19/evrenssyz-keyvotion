'use strict';

// T-093a — Tur 10 / `innerHTML` yasağı (İSKELET).
//
// `src/renderer/*.js` içinde `innerHTML` kullanımı 0 olmalıdır.
// (DOM kurulumu `textContent`/`createElement` ile yapılır; XSS yüzeyi kapatılır.)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { RENDERER } = require('../lib');

function rendererScripts() {
  return fs.readdirSync(RENDERER)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(RENDERER, f));
}

test('tur10/innerHTML 1: src/renderer/*.js içinde innerHTML kullanımı 0', () => {
  const files = rendererScripts();
  assert.ok(files.length > 0, 'src/renderer altında .js dosyası yok');
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/\binnerHTML\b/.test(line)) {
        hits.push(`${path.basename(file)}:${i + 1}: ${line.trim().slice(0, 160)}`);
      }
    });
  }
  assert.deepStrictEqual(hits, [], `innerHTML kullanımı bulundu:\n${hits.join('\n')}`);
});
