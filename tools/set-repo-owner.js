'use strict';
/**
 * Point every public GitHub link at the real repository.
 *
 * Usage:
 *   node tools/set-repo-owner.js <owner> [repo]
 *   node tools/set-repo-owner.js --dry-run <owner> [repo]
 *
 * Rewrites `https://github.com/<owner>/<repo>` in the files that ship to the
 * public (README, package metadata, issue-template links). Safe to re-run:
 * it replaces the previous owner, not only the `OWNER` placeholder.
 * `--dry-run` prints what would change and writes nothing.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'README.md',
  path.join('src', 'package.json'),
  path.join('.github', 'ISSUE_TEMPLATE', 'config.yml')
];

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run') || argv.includes('-n');
const positional = argv.filter((a) => !a.startsWith('-'));

const owner = String(positional[0] || '').trim();
const repo = String(positional[1] || 'keyvotion').trim();

if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) {
  console.error('usage: node tools/set-repo-owner.js <owner> [repo]');
  console.error('owner: 1-39 characters, letters/digits/hyphen, no leading hyphen');
  process.exit(1);
}
if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
  console.error('repo name is not valid');
  process.exit(1);
}

const url = `https://github.com/${owner}/${repo}`;
const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const linkPattern = new RegExp(`https://github\\.com/[A-Za-z0-9-]+/${escapedRepo}`, 'g');
let changed = 0;
let found = 0;
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`skip (missing) ${rel}`);
    continue;
  }
  const before = fs.readFileSync(file, 'utf8');
  const matches = before.match(linkPattern) || [];
  found += matches.length;
  const after = before.replace(linkPattern, url);
  if (after !== before) {
    const count = matches.length;
    if (dryRun) {
      const from = [...new Set(matches)].join(', ');
      console.log(`would update ${rel} (${count}) ${from} -> ${url}`);
    } else {
      fs.writeFileSync(file, after);
      console.log(`updated ${rel} (${count})`);
    }
    changed += count;
  } else {
    console.log(`unchanged ${rel}`);
  }
}

if (dryRun) {
  console.log(`\n[dry-run] ${changed} of ${found} link(s) would point at ${url}`);
  console.log('nothing written');
} else {
  console.log(`\n${changed} link(s) -> ${url}`);
}

console.log('next:');
console.log(`  git remote add origin ${url}.git`);
console.log('  git push -u origin master');
