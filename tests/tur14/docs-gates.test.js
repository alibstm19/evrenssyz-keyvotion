'use strict';

/*
 * T-182 — README kapıları belge değil, gerçek dosya.
 *
 * README "dört kalite kapısı" diyordu ama on altı komut listeliyordu; CI ise
 * bunlardan yalnız dördünü koşuyor. Bu test belgeyi ölçülebilir tutar:
 *   1) README "Quality gates" bloğundaki her komut var olan bir betiğe işaret eder.
 *   2) Bloktaki kapı sayısı ile "seventeen quality gates" gibi sayı sözcüğü aynı
 *      sayıyı söyler (sözcük listeden türetilir; yeni kapı eklenince test kırılır).
 *   3) CI'ın koştuğu her komut README bloğunda da listelenir (belge CI'dan eksik olmaz).
 *   4) `docs/release.md` README'nin tüm kapılarını kapsar (tek yerden eksik kalmaz).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('../lib');

const README = read(path.join(ROOT, 'README.md'));
const RELEASE = read(path.join(ROOT, 'docs', 'release.md'));
const CI = read(path.join(ROOT, '.github', 'workflows', 'ci.yml'));

function gateBlock(text) {
  const start = text.indexOf('## Quality gates');
  assert.ok(start >= 0, 'README Quality gates bölümü yok');
  const end = text.indexOf('\n## ', start + 5);
  return text.slice(start, end > start ? end : text.length);
}

function commands(text) {
  return [...text.matchAll(/^node\s+(\S+)/gm)].map((m) => m[1]);
}

const README_CMDS = commands(gateBlock(README));
const CI_CMDS = [...CI.matchAll(/node\s+(tools\/[^\s]+)/g)].map((m) => m[1]);

test('docs 1: README kapı komutları gerçek dosyalar', () => {
  assert.ok(README_CMDS.length >= 10, `kapı listesi çok kısa (${README_CMDS.length})`);
  for (const cmd of README_CMDS) {
    assert.ok(fs.existsSync(path.join(ROOT, cmd)), `README’de olmayan dosya: ${cmd}`);
  }
});

/* docs 2: kapı sayısı README'de rakamla yazılır (liste sayısından türetilir). */

test('docs 2: sayı ile liste uyuşur', () => {
  assert.match(README, new RegExp(`${README_CMDS.length} kalite kapısı depoyla birlikte gelir`),
    `README’de ${README_CMDS.length} komut var, metin bu sayıyı söylemeli`);
  /* Eski ifade kalıntısını ara. */
  assert.doesNotMatch(README, /and four quality gates ship/, 'eski “four quality gates” ifadesi kaldı');
  assert.doesNotMatch(README, /three quality gates ship/, 'eski “three quality gates” ifadesi kaldı');
});

test('docs 3: CI komutları README’de listelenir', () => {
  assert.ok(CI_CMDS.length >= 4, `CI’da ${CI_CMDS.length} kapı var`);
  for (const cmd of CI_CMDS) {
    const listed = README_CMDS.some((c) => c === cmd || c.endsWith(cmd.replace('tools/', '')));
    assert.ok(listed, `CI’da koşan ${cmd} README listesinde yok`);
  }
  assert.match(README, /CI, beş statik kapıyı \(tap-count, doctor, k3, html-check, public-content\)/, 'CI kapsamı yanlış anlatılıyor');
});

test('docs 4: release.md tüm README kapılarını kapsar', () => {
  const releaseCmds = commands(RELEASE);
  for (const cmd of README_CMDS) {
    assert.ok(releaseCmds.includes(cmd), `docs/release.md ${cmd} komutunu içermiyor`);
  }
});
