'use strict';

// T10 — dosya sahipliği ihlali yok (emir T-015 zorunlu başlık 10)
// K1 §5.3 + UI sözleşmesi §10: DSN yalnız src/renderer/styles/** (+mockup+taslak belge) yazar;
// DEV styles/ içine yazmaz; satır içi <style> bloğu ürün kodunda olmaz.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { SRC, RENDERER, walk, read } = require('./lib');

test('T10a: src/renderer/styles/ altında .js dosyası yok (DEV styles içine yazmamış)', () => {
  const jsInStyles = walk(path.join(RENDERER, 'styles'), (f) => f.endsWith('.js'));
  assert.strictEqual(
    jsInStyles.length,
    0,
    `styles/ içinde .js dosyası var (DEV ihlali, UI-45): ${jsInStyles.join(', ')}`
  );
});

test('T10b: src/ altındaki tüm .css dosyaları src/renderer/styles/ içinde (DSN alanı dışına css yok)', () => {
  const allCss = walk(SRC, (f) => f.endsWith('.css'));
  const stylesDir = path.join(RENDERER, 'styles') + path.sep;
  const outside = allCss.filter((f) => !f.startsWith(stylesDir));
  assert.strictEqual(
    outside.length,
    0,
    `styles/ dışında css dosyası var (UI-45/§10 ihlali): ${outside.join(', ')}`
  );
});

test('T10c: index.html satır içi <style> bloğu içermiyor (UI-06/§10 — stil DSN dosyalarında)', () => {
  const html = read(path.join(RENDERER, 'index.html'));
  assert.doesNotMatch(html, /<style[\s>]/i, 'satır içi <style> bloğu var — stil DSN’in css dosyalarına ait');
  assert.doesNotMatch(html, /\sstyle=["'][^"']+["']/i, 'satır içi style="" özniteliği var (UI-06)');
});

test('T10d: ürün kodu work/console-mockup.html referans etmiyor (mockup yalnız tasarım referansı)', () => {
  const offenders = [];
  for (const file of walk(SRC, (f) => /\.(js|html)$/.test(f))) {
    if (/mockup/i.test(read(file))) offenders.push(path.relative(SRC, file));
  }
  assert.strictEqual(offenders.length, 0, `mockup referansı ürün koduna girmiş: ${offenders.join(', ')}`);
});
