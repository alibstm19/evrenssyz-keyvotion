'use strict';

/**
 * Dosyalar + Bağlam (T8-7).
 *
 * Kullanıcı isteği: "dosyalar tarafı, bağlamlar tarafı yok". Bu servis proje
 * dizinini SALT OKUNUR biçimde gezdirir ve seçili dosyalardan model/ajan için
 * bir bağlam paketi üretir.
 *
 * Güvenlik:
 *   - Yalnız proje kökünün İÇİ. Kök dışı, `..` kaçışı ve kök dışına çıkan
 *     sembolik link `E_FORBIDDEN`.
 *   - Sır dosyaları (.env, keys.bin, secrets.bin, *.pem, *.key) hiç okunmaz.
 *   - Yazma YOKTUR: bu servis yalnız `list`, `read`, `context` yapar.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');
const { isInside } = require('./votion-actions');

const DENY_NAMES = new Set(['.env', '.env.local', 'keys.bin', 'secrets.bin', 'id_rsa', 'id_ed25519']);
const DENY_EXT = new Set(['.pem', '.key', '.pfx', '.p12', '.kdbx']);
const MAX_READ = 262144; /* 256 KB ham okuma tavanı */
const MAX_PREVIEW = 65536; /* 64 KB metin önizleme */
const MAX_CONTEXT_CHARS = 24000;
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.txt', '.css', '.html', '.yml', '.yaml', '.ps1', '.sh', '.sql', '.toml', '.ini', '.csv', '.xml', '.svg']);

function denyReason(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (DENY_NAMES.has(base)) return true;
  if (/^\.env(\.|$)/.test(base)) return true;
  if (DENY_EXT.has(path.extname(base))) return true;
  return false;
}

function isTextName(name) {
  const ext = path.extname(String(name || '').toLowerCase());
  return TEXT_EXT.has(ext);
}

/**
 * @param {{getProjectDir:()=>string, memory?:object, getLocalAccess?:()=>boolean}} deps
 */
function createFilesService(deps) {
  const getProjectDir = deps.getProjectDir;
  const memory = deps.memory || null;
  /* Kullanıcı izin verdiyse makinenin her yeri gezilebilir (sır dosyaları hariç). */
  const localAccess = typeof deps.getLocalAccess === 'function' ? deps.getLocalAccess : () => false;

  function root() {
    const dir = getProjectDir();
    return dir ? path.resolve(dir) : null;
  }

  function localOn() {
    try { return Boolean(localAccess()); } catch { return false; }
  }

  /** Bu bilgisayardaki erişilebilir sürücüler (Windows A:-Z:, POSIX'te /). */
  function drives() {
    if (process.platform !== 'win32') return ['/'];
    const found = [];
    for (let c = 65; c <= 90; c += 1) {
      const letter = `${String.fromCharCode(c)}:\\`;
      try { if (fs.existsSync(letter)) found.push(letter); } catch { /* atla */ }
    }
    return found;
  }

  /**
   * İstenen yolu çözer. İzin yokken yalnız proje kökünün İÇİ; izin varsa
   * mutlak yol da kabul edilir. Sembolik link kaçışı her iki halde denetlenir.
   */
  function confine(input) {
    const base = root();
    const given = input == null || input === '' ? '.' : String(input);
    const wantsAbsolute = path.isAbsolute(given);

    if (wantsAbsolute && localOn()) return path.resolve(given);
    if (!base) return null;

    const candidate = path.resolve(base, given);
    const same = candidate.toLowerCase() === base.toLowerCase();
    if (!same && !isInside(base, candidate)) return null;

    /* Mevcut yolda sembolik link kök dışına çıkıyorsa reddet. */
    try {
      const realBase = fs.realpathSync(base);
      const real = fs.realpathSync(candidate);
      const sameReal = real.toLowerCase() === realBase.toLowerCase();
      if (!sameReal && !isInside(realBase, real)) return null;
    } catch {
      /* Yol henüz yoksa (ya da izin yoksa) resolve sonucu yeterli. */
    }
    return candidate;
  }

  function relOf(filePath) {
    const base = root();
    if (!filePath) return '';
    const full = path.resolve(filePath);
    if (base) {
      if (full.toLowerCase() === base.toLowerCase()) return '.';
      if (isInside(base, full)) return path.relative(base, full).replace(/\\/g, '/') || '.';
    }
    return localOn() ? full.replace(/\\/g, '/') : '';
  }

  function list(payload) {
    const base = root();
    const access = localOn();
    if (!base && !access) return fail(CODES.NOT_FOUND, 'Proje dizini tanımlı değil (Ayarlar → proje klasörü).');
    if (base && !access && !fs.existsSync(base)) return fail(CODES.NOT_FOUND, 'Proje dizini bulunamadı.');
    const limit = Math.min(500, Math.max(1, Math.round(Number(payload && payload.limit) || 200)));
    const target = confine(payload && payload.path);
    if (!target) return fail(CODES.FORBIDDEN, access ? 'Yol çözümlenemedi.' : 'Yol proje dizininin dışında.');
    if (!fs.existsSync(target)) return fail(CODES.NOT_FOUND, 'Klasör bulunamadı.');
    if (!fs.statSync(target).isDirectory()) return fail(CODES.BAD_REQUEST, 'Yol bir klasör değil.');

    let names;
    try {
      names = fs.readdirSync(target, { withFileTypes: true });
    } catch (err) {
      return fail(CODES.FORBIDDEN, `Klasör okunamadı: ${err.code || 'E_FORBIDDEN'}`);
    }

    const entries = names
      .filter((d) => !denyReason(path.join(target, d.name)))
      .filter((d) => !(d.name.startsWith('.') && d.name !== '.team' && d.name !== '.gitignore'))
      .map((d) => {
        const full = path.join(target, d.name);
        let size = null;
        let modifiedAt = null;
        try {
          const st = fs.statSync(full);
          size = st.size;
          modifiedAt = st.mtime.toISOString();
        } catch { /* erişilemeyen kayıt yine listelenir, boyutu bilinmez */ }
        return {
          name: d.name,
          path: full,
          rel: relOf(full),
          dir: d.isDirectory(),
          size,
          modifiedAt,
          text: d.isFile() && isTextName(d.name),
          denied: false
        };
      })
      .sort((a, b) => (Number(b.dir) - Number(a.dir)) || a.name.localeCompare(b.name, 'tr'));

    const parentDir = path.dirname(target);
    const atFsRoot = parentDir === target;
    const parentSame = Boolean(base) && parentDir.toLowerCase() === base.toLowerCase();
    const parent = atFsRoot
      ? null
      : access
        ? parentDir
        : (parentSame || (base && isInside(base, parentDir)) ? parentDir : null);
    return ok({
      root: base,
      localAccess: access,
      drives: access ? drives() : [],
      home: access ? os.homedir() : null,
      dir: target,
      rel: relOf(target),
      parent,
      entries: entries.slice(0, limit),
      total: entries.length,
      truncated: entries.length > limit
    });
  }

  function read(payload) {
    const target = confine(payload && payload.path);
    if (!target) return fail(CODES.FORBIDDEN, 'Yol proje dizininin dışında.');
    if (denyReason(target)) return fail(CODES.FORBIDDEN, 'Sır dosyası okunmaz (.env / anahtar dosyaları).');
    let st;
    let resolved;
    try {
      resolved = fs.realpathSync(target);
      st = fs.statSync(resolved);
    } catch {
      return fail(CODES.NOT_FOUND, 'Dosya bulunamadı.');
    }
    if (denyReason(resolved)) {
      return fail(CODES.FORBIDDEN, 'Dosya proje sınırının dışında veya korunuyor.');
    }
    if (!st.isFile()) return fail(CODES.BAD_REQUEST, 'Yol bir dosya değil.');
    if (st.size > MAX_READ) {
      return fail(CODES.BAD_REQUEST, `Dosya çok büyük (${Math.round(st.size / 1024)} KB; sınır ${Math.round(MAX_READ / 1024)} KB).`);
    }

    let buffer;
    try {
      const fd = fs.openSync(resolved, 'r');
      try {
        const bytes = Buffer.alloc(MAX_READ + 1);
        let offset = 0;
        while (offset < bytes.length) {
          const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
          if (!count) break;
          offset += count;
        }
        if (offset > MAX_READ) return fail(CODES.BAD_REQUEST, 'Dosya okuma sınırını aşıyor.');
        buffer = bytes.subarray(0, offset);
      } finally { fs.closeSync(fd); }
    } catch {
      return fail(CODES.FORBIDDEN, 'Dosya okunamadı.');
    }
    const nul = buffer.includes(0);
    const textAllowed = isTextName(target) || (!nul && st.size > 0);
    if (nul || !textAllowed) {
      return ok({
        path: target, rel: relOf(target), name: path.basename(target),
        size: st.size, ext: path.extname(target), binary: true, text: '', truncated: false, lines: 0
      });
    }

    const raw = buffer.toString('utf8');
    const text = raw.length > MAX_PREVIEW ? raw.slice(0, MAX_PREVIEW) : raw;
    return ok({
      path: target,
      rel: relOf(target),
      name: path.basename(target),
      size: st.size,
      ext: path.extname(target),
      binary: false,
      text,
      truncated: raw.length > text.length,
      lines: raw ? raw.split(/\r?\n/).length : 0
    });
  }

  /**
   * Seçili dosyalar + hafıza kayıtlarından bağlam paketi.
   * Yalnız okuma; hiçbir dosya değişmez.
   */
  function context(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const paths = Array.isArray(p.paths) ? p.paths.slice(0, 20) : [];
    const maxChars = Math.min(MAX_CONTEXT_CHARS, Math.max(2000, Math.round(Number(p.maxChars) || MAX_CONTEXT_CHARS)));

    const files = [];
    const skipped = [];
    let used = 0;

    for (const given of paths) {
      const res = read({ path: given });
      if (!res.ok) { skipped.push({ path: given, reason: res.error.code }); continue; }
      const { rel, text, binary, size } = res.data;
      if (binary) { skipped.push({ path: rel, reason: 'binary' }); continue; }
      const remaining = maxChars - used;
      if (remaining <= 0) { skipped.push({ path: rel, reason: 'limit' }); continue; }
      const part = text.slice(0, remaining);
      used += part.length;
      files.push({ path: rel, chars: part.length, text: part });
      if (part.length < text.length) skipped.push({ path: rel, reason: 'kırpıldı', size });
    }

    let memoryBlock = '';
    let memoryCount = 0;
    if (memory && typeof memory.context === 'function') {
      const mem = memory.context({ query: p.query || '', limit: 12 });
      if (mem.ok) {
        memoryBlock = mem.data.block || '';
        memoryCount = mem.data.count || 0;
      }
    }

    const blocks = [];
    if (memoryBlock) blocks.push(memoryBlock.trim());
    if (files.length) {
      blocks.push(['## Seçili dosyalar', ...files.map((f) => `### ${f.path}\n\`\`\`\n${f.text}\n\`\`\``)].join('\n\n'));
    }
    const block = blocks.join('\n\n');

    return ok({
      files: files.map((f) => ({ path: f.path, chars: f.chars })),
      skipped,
      memoryCount,
      chars: block.length,
      truncated: used >= maxChars,
      block
    });
  }

  return { list, read, context, root, MAX_CONTEXT_CHARS };
}

module.exports = { createFilesService, denyReason, isTextName, MAX_CONTEXT_CHARS };
