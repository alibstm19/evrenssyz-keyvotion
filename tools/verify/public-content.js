'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PRIVATE_NAME = /^(conversations\.json|providers\.json|projects\.json|planner\.json|teams\.json|audit\.jsonl|config\.json|remote\.json|secrets\.bin|keys\.bin|credentials\.json|credentials\.ini|id_rsa|id_ed25519)$/i;
const PRIVATE_EXT = /\.(log|sqlite(?:3)?(?:-wal|-shm)?|db|pem|pfx|p12)$/i;
const TEXT_EXT = /\.(md|txt|js|mjs|cjs|ts|json|jsonl|html|css|yml|yaml|ps1|cmd|ini|toml)$/i;
const TOKENS = /(?:github_pat_[A-Za-z0-9_]{40,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:(?:proj|live|ant)-)?[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{20,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----)/;

function checkFile(root, relative, allowFixtures = false) {
  const name = path.basename(relative);
  const parts = relative.split(/[\\/]/);
  const fixture = allowFixtures && relative.startsWith('tests/fixtures/team/.team/');
  if ((parts.includes('.team') && !fixture) || parts.includes('.keyvotion') || (parts.includes('oauth') && /\.bin$/i.test(name)) ||
      PRIVATE_NAME.test(name) || PRIVATE_EXT.test(name) ||
      (/^\.env(?:\.|$)/i.test(name) && name !== '.env.example')) return 'kişisel dosya yolu';
  const absolute = path.join(root, relative);
  if (fs.lstatSync(absolute).isSymbolicLink()) return 'sembolik bağlantı';
  if (TEXT_EXT.test(name) && TOKENS.test(fs.readFileSync(absolute, 'utf8'))) return 'olası erişim anahtarı';
  return '';
}

function assertPublicFiles(root, files, allowFixtures = false) {
  const failures = files.flatMap((file) => {
    const issue = checkFile(root, file, allowFixtures);
    return issue ? [`${file} (${issue})`] : [];
  });
  if (failures.length) throw new Error('Kişisel veri denetimi başarısız:\n' + failures.join('\n'));
}

if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((file) => file && fs.existsSync(path.join(root, file)));
  assertPublicFiles(root, files, true);
  console.log(`Kişisel veri denetimi geçti (${files.length} izlenen dosya).`);
}

module.exports = { assertPublicFiles };
