'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = rd('src/renderer/index.html');
const app = rd('src/renderer/app.js');
const ui = rd('docs/console-ui-contract.md');

// 1) ekranlar
const screens = [...html.matchAll(/data-screen="([a-z0-9-]+)"/g)].map((m) => m[1]);
console.log('data-screen:', new Set(screens).size, '| toplam nitelik:', screens.length);
const sec2 = ui.slice(ui.indexOf('## 2. Ekran'), ui.indexOf('## 3.'));
const uiScreens = [...sec2.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]);
const missingScreen = uiScreens.filter((s) => !screens.includes(s));
const extraScreen = [...new Set(screens)].filter((s) => !uiScreens.includes(s));
console.log('UI §2:', new Set(uiScreens).size, '| eksik:', missingScreen.length, missingScreen.join(','),
  '| fazla:', extraScreen.length, extraScreen.join(','));

// 2) stylesheet zinciri
const links = [...html.matchAll(/<link[^>]+href="styles\/([a-z0-9-]+\.css)"/g)].map((m) => m[1]);
console.log('link:', links.length, '| ilk:', links[0], '| son:', links[links.length - 1]);
const u123 = ui.split(/\r?\n/).find((l) => /UI-123/.test(l)) || '';
const chain = [...u123.matchAll(/([a-z0-9-]+)\.css/g)].map((m) => m[1] + '.css');
console.log('UI-123:', chain.length, '| zincir esit:', JSON.stringify(chain) === JSON.stringify(links),
  '| son tur14:', links[links.length - 1] === 'tur14.css');

// 3) kancalar
const hooks = ['data-preset-search', 'data-preset-kind', 'data-preset-category', 'data-preset-grid',
  'data-preset-item', 'data-preset-count', 'data-preset-detail', 'data-preset-howto', 'data-preset-form',
  'data-preset-field', 'data-preset-field-hint', 'data-preset-connect', 'data-preset-test',
  'data-preset-result', 'data-preset-empty'];
const miss = hooks.filter((h) => !html.includes(h) && !app.includes(h));
console.log('kanca:', hooks.length, '| eksik:', miss.length, miss.join(','));
const blok = ['b1', 'b2', 'b3', 'b4', 'b5'].filter((b) => html.includes('data-preset-block="' + b + '"'));
console.log('blok:', blok.length, blok.join(','));

// 4) yasaklar
console.log('innerHTML html:', (html.match(/innerHTML/g) || []).length,
  '| innerHTML app:', (app.match(/innerHTML/g) || []).length);
console.log('inline style= html:', (html.match(/\sstyle="/g) || []).length,
  '| app:', (app.match(/\sstyle="/g) || []).length);
console.log('ham renk app:', (app.match(/#[0-9a-fA-F]{6}\b/g) || []).length);

// 5) baglanti
for (const k of ['KV.preset.list', 'KV.preset.apply', 'KV.votion.tools', 'confirmToken']) {
  console.log(k, ':', app.includes(k));
}
console.log('preset kart olusturma:', /data-preset-item/.test(app) || /presetItem/.test(app));
console.log('howto numarali:', /howToGet/.test(app));
console.log('password tipi:', /type\s*=\s*'password'|"password"/.test(app));
console.log('ready metinleri:', ['Hazır', 'Alan eksik', 'Kurulu', 'Bağlı', 'Hata'].filter((t) => app.includes(t)).length, '/5');
console.log('votion satiri:', /votion/i.test(app));
