// tools/verify/html-check.js — coarse tag-balance check (independent).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
const stack = [];
let m;
let errors = 0;
const lineOf = (idx) => html.slice(0, idx).split(/\r?\n/).length;
while ((m = re.exec(html))) {
  const tag = m[1].toLowerCase();
  const isClose = m[0][1] === '/';
  const selfClose = /\/>$/.test(m[0]);
  if (VOID.has(tag) || selfClose) continue;
  if (!isClose) { stack.push({ tag, line: lineOf(m.index) }); continue; }
  const top = stack.pop();
  if (!top) { console.log('FAZLA KAPANIS:', tag, 'satir', lineOf(m.index)); errors += 1; continue; }
  if (top.tag !== tag) {
    console.log('UYUMSUZ:', top.tag, '(satir', top.line + ') kapanisi', tag, 'satir', lineOf(m.index));
    errors += 1;
  }
}
for (const s of stack) { console.log('KAPANMAMIS:', s.tag, 'satir', s.line); errors += 1; }
console.log(errors ? `HATA: ${errors}` : 'HTML DENGELI');
process.exit(errors ? 1 : 0);
