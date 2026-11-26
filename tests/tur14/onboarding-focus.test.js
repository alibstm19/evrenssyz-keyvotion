'use strict';

/* İlk kurulum paneli erişilebilirlik sözleşmesi (T-161).
 * Panel `aria-modal="true"` diyorsa klavye odağı panelin dışına çıkmamalı ve
 * açılışta panelin içine girmeli. Bu test kablolamayı kaynak düzeyinde kilitler;
 * gerçek davranış Lider tarafından CDP ile ölçüldü (bkz. karar günlüğü). */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { RENDERER, read } = require('../lib');

const html = read(path.join(RENDERER, 'index.html'));
const appJs = read(path.join(RENDERER, 'app.js'));

function sliceFn(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} app.js icinde yok`);
  return appJs.slice(start, start + 1200);
}

test('onboarding-focus 1: panel modal olarak isaretli', () => {
  const root = html.match(/<div[^>]*data-onboard[^>]*>/);
  assert.ok(root, 'data-onboard paneli yok');
  assert.match(root[0], /role="dialog"/);
  assert.match(root[0], /aria-modal="true"/);
  assert.match(root[0], /aria-label="[^"]+"/);
});

test('onboarding-focus 2: her render odagi panelin icine alir', () => {
  const render = sliceFn('onboardRender');
  assert.match(render, /onboardPaint\(\)/, 'render hala paint cagirmali');
  assert.match(render, /onboardFocusFirst\(\)/, 'render odagi panele almali');
  const focus = sliceFn('onboardFocusFirst');
  assert.match(focus, /data-field="onboard-key"/, 'ilk hedef API anahtari olmali');
  assert.match(focus, /data-field="onboard-provider"/, 'yedek hedef saglayici secimi olmali');
  assert.match(focus, /hidden/, 'kapali panel odak almamali');
});

test('onboarding-focus 3: Tab dongusu panelin icinde kapanir', () => {
  const trap = sliceFn('onboardTrap');
  assert.match(trap, /event\.key !== 'Tab'/, 'yalniz Tab tusunda calismali');
  assert.match(trap, /event\.shiftKey/, 'geri Tab da ele alinmali');
  assert.match(trap, /event\.preventDefault\(\)/, 'varsayilan sekme davranisi engellenmeli');
  assert.match(trap, /items\.includes\(active\)/, 'odak disaridayken panele donmeli');

  const focusables = sliceFn('onboardFocusables');
  for (const sel of ['button', 'input', 'select', 'textarea', 'summary']) {
    assert.ok(focusables.includes(sel), `odaklanabilir kumesinde ${sel} yok`);
  }
  assert.match(focusables, /getClientRects\(\)\.length/, 'gizli denetimler sayilmamali');
});

test('onboarding-focus 4: tuzak panelde dinleniyor', () => {
  assert.match(appJs, /onboardRoot\.addEventListener\('keydown', onboardTrap\)/,
    'onboardTrap panelde dinlenmiyor');
});
