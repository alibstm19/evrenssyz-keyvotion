'use strict';

// T5 — CSP meta etiketi mevcut ve connect-src 'none' (emir T-015 zorunlu başlık 5)
// K1 §2.4 ağ kuralı: renderer'da fetch CSP ile kapatılır.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { RENDERER, read } = require('./lib');

const html = read(path.join(RENDERER, 'index.html'));

test('T5: CSP meta etiketi mevcut; connect-src none; script-src/default-src self', () => {
  const metaMatch = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i);
  assert.ok(metaMatch, 'index.html içinde Content-Security-Policy meta etiketi yok');

  // content özniteliği TEK tırnak içerir ('self'); bu yüzden çift tırnakla ayrılmış
  // öznitelik değeri sonuna kadar alınmalı (ilk apostrofta kesilmez).
  const contentMatch = metaMatch[0].match(/content="([^"]*)"|content='([^']*)'/i);
  assert.ok(contentMatch, 'CSP meta etiketinde content özniteliği yok');

  const csp = contentMatch[1] || contentMatch[2];
  assert.match(csp, /connect-src\s+'none'/, "CSP'te connect-src 'none' yok — renderer ağa açılır");
  assert.match(csp, /default-src\s+'self'/, "CSP'te default-src 'self' yok");
  assert.match(csp, /script-src\s+'self'/, "CSP'te script-src 'self' yok — satır içi/uzak script açılır");
});
