'use strict';

// T-093a — Tur 10 / telefon sayfası script derleme regresyonu (T-095 sınıfı, İSKELET).
//
// `src/main/services/remote-page.html` içindeki HER satır içi `<script>` bloğu
// `vm.Script` ile derlenir. P0 düzeltmesi sonrası bu test GEÇMELİDİR.
// Not: yalnız HTML string'i derlenir; dosya çalıştırılmaz (yan etki yok).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const vm = require('node:vm');
const { SRC, read } = require('../lib');

const HTML_PATH = path.join(SRC, 'main', 'services', 'remote-page.html');

/** HTML'deki satır içi script bloklarını sırayla döndürür (src= harici atlanır). */
function inlineScripts(html) {
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let index = 0;
  while ((m = re.exec(html)) !== null) {
    index += 1;
    if (/\bsrc\s*=/i.test(m[1] || '')) continue;
    blocks.push({ index, code: m[2] });
  }
  return blocks;
}

test('tur10/remote-page 1: en az bir satır içi <script> bloğu var', () => {
  const blocks = inlineScripts(read(HTML_PATH));
  assert.ok(blocks.length >= 1, 'remote-page.html içinde satır içi script bulunamadı');
});

test('tur10/remote-page 2: her <script> bloğu vm.Script ile derlenir', () => {
  const blocks = inlineScripts(read(HTML_PATH));
  assert.ok(blocks.length >= 1, 'remote-page.html içinde satır içi script bulunamadı');
  for (const block of blocks) {
    assert.doesNotThrow(() => {
      new vm.Script(block.code, { filename: `remote-page.html#script${block.index}` });
    }, `remote-page.html blok ${block.index} derlenemedi`);
  }
});
