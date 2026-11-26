'use strict';

/*
 * T-162 — yayın öncesi depo hazırlığı aracının kuru çalışması.
 *
 * `tools/set-repo-owner.js --dry-run <owner> <repo>` hiçbir dosya yazmamalı,
 * her hedef dosya için ne değişeceğini söylemeli ve `git remote add` + push
 * komutlarını yazdırmalı. Özel depo adı da desteklenmeli (ör. `keyvotion-console`).
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, read } = require('../lib');

const SCRIPT = path.join(ROOT, 'tools', 'set-repo-owner.js');
const TARGETS = ['README.md', path.join('src', 'package.json'), path.join('.github', 'ISSUE_TEMPLATE', 'config.yml')];

function run(args) {
  return execFileSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

function snapshot() {
  return TARGETS.map((rel) => read(path.join(ROOT, rel)));
}

test('repo-owner 1: --dry-run hiçbir dosyayı değiştirmez ve rapor eder', () => {
  const before = snapshot();
  const out = run(['--dry-run', 'ornek-owner', 'keyvotion']);
  const after = snapshot();

  assert.deepStrictEqual(after, before, 'kuru çalışma dosya yazmamalı');
  assert.match(out, /\[dry-run\] \d+ of \d+ link\(s\) would point at https:\/\/github\.com\/ornek-owner\/keyvotion/);
  assert.match(out, /nothing written/);
  assert.match(out, /git remote add origin https:\/\/github\.com\/ornek-owner\/keyvotion\.git/);
  assert.match(out, /git push -u origin master/);
  for (const rel of TARGETS) {
    assert.ok(out.includes(rel.split(path.sep).join(path.sep)), `raporda ${rel} yok`);
  }
});

const pkg = JSON.parse(read(path.join(ROOT, 'src', 'package.json')));
const REPO_NAME = new URL(pkg.repository.url).pathname.split('/').filter(Boolean).pop();

test('repo-owner 2: kuru çalışma mevcut bağlantıları kaynak olarak gösterir', () => {
  const out = run(['-n', 'ornek-owner', REPO_NAME]);
  /* Depo henüz yayınlanmadıysa OWNER yer tutucusu, yayınlandıysa gerçek ad
     görünür; iki durumda da "eski -> yeni" biçimi korunur. */
  const nameRe = REPO_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(out, new RegExp('https://github\\.com/[A-Za-z0-9-]+/' + nameRe +
    ' -> https://github\\.com/ornek-owner/' + nameRe));
});

test('repo-owner 3: özel depo adı ve geçersiz ad reddi', () => {
  const out = run(['--dry-run', 'ornek-owner', 'keyvotion-console']);
  assert.match(out, /would point at https:\/\/github\.com\/ornek-owner\/keyvotion-console/);

  assert.throws(
    () => run(['--dry-run', 'bad_owner', 'keyvotion']),
    (err) => err.status === 1 && /usage: node tools\/set-repo-owner\.js/.test(String(err.stderr)),
    'geçersiz sahip adı exit 1 ile reddedilmeli'
  );
});

test('repo-owner 4: yayın kontrol listesi tek hamlelik push adımlarını taşır', () => {
  const release = read(path.join(ROOT, 'docs', 'release.md'));
  for (const needle of ['set-repo-owner.js', '--dry-run', 'git remote add origin', 'git push -u origin master', 'SHA256SUMS.txt', 'v<version>']) {
    assert.ok(release.includes(needle), `release.md içinde eksik: ${needle}`);
  }
});
