'use strict';

/**
 * Votion komut + dosya yetenekleri — T-198.
 *
 * Kullanıcı isteği: Votion "PC'de çalışan test yapabilen, her uygulamayı açıp
 * kodları değiştirebilen" bir asistana dönüşmeli — *izin dahilinde*.
 *
 * Güvenlik sınırları (pazarlık yok):
 *   - KABUK YOK. `spawn(..., { shell: false })`; komut adı **beyaz listede**
 *     olmalı (node, npm.cmd, npx.cmd, git, python, py). Serbest metin komut yok.
 *   - Çalışma dizini proje kökünün İÇİNDE olmalı (`..` kaçışı reddedilir).
 *   - Zaman aşımı ve çıktı tavanı vardır; süreç ağacı öldürülür.
 *   - Dosya yazma yalnız proje kökü içinde; **her yazmadan önce yedek** alınır.
 *     `.env*`, `secrets.bin`, `node_modules/`, `.git/` reddedilir.
 *   - İki yetenek de oturum onayı ister (`votion-grants`); onay yoksa E_FORBIDDEN
 *     ve `needsGrant` alanı döner — arayüz onay isteyebilsin.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { CODES, ok, fail } = require('../../shared/errors');
const { isInside } = require('./votion-actions');

const MAX_TIMEOUT_MS = 120000;
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_OUTPUT = 200 * 1024;
const MAX_WRITE_BYTES = 400 * 1024;
const MAX_READ_BACKUP = 2 * 1024 * 1024;

/** Beyaz liste: kimlik -> yürütülebilir dosya adı. Kabuk yok. */
const COMMANDS = Object.freeze({
  node: { file: 'node.exe', label: 'Node' },
  npm: { file: 'npm.cmd', label: 'npm' },
  npx: { file: 'npx.cmd', label: 'npx' },
  git: { file: 'git.exe', label: 'git' },
  python: { file: 'python.exe', label: 'Python' },
  py: { file: 'py.exe', label: 'Python başlatıcı' }
});

const BLOCKED_SEGMENTS = Object.freeze(['node_modules', '.git', '.keyvotion']);

function containsSecretName(rel) {
  const lower = rel.toLowerCase().replace(/\\/g, '/');
  const base = lower.split('/').pop();
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (base === 'secrets.bin' || base.endsWith('.pem') || base.endsWith('.pfx')) return true;
  return lower.split('/').some((seg) => BLOCKED_SEGMENTS.includes(seg));
}

/**
 * @param {{getProjectDir:()=>string, grants:object, baseDir:string,
 *          spawnFn?:Function, record?:(e:object)=>void}} options
 */
function createVotionExec(options) {
  const getProjectDir = options.getProjectDir;
  const grants = options.grants;
  const baseDir = options.baseDir;
  const spawnFn = options.spawnFn || spawn;
  const record = typeof options.record === 'function' ? options.record : () => {};
  /* T-198: kayıt dosyası servis sahibidir — main.js diske yazmaz (7.2.8b kapısı). */
  const logDir = path.join(baseDir, 'votion');
  const logPath = path.join(logDir, 'actions.jsonl');
  const optionsAudit = options.audit || null;

  function localRecord(entry) {
    const row = { at: new Date().toISOString(), ...entry };
    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logPath, `${JSON.stringify(row)}\n`, 'utf8');
    } catch { /* kayıt tutulamazsa eylem yine yapılır */ }
    if (optionsAudit && typeof optionsAudit.append === 'function') {
      try { optionsAudit.append({ op: 'votion:exec', code: row.code || (row.ok ? CODES.OK : CODES.INTERNAL), target: row.action || 'votion' }); } catch { /* yoksay */ }
    }
    record(row);
  }

  function projectRoot() {
    const dir = getProjectDir();
    return dir ? path.resolve(dir) : '';
  }

  function withinProject(candidate) {
    const root = projectRoot();
    if (!root) return { error: 'Proje dizini ayarlı değil.' };
    const abs = path.resolve(candidate || root);
    if (abs !== root && !isInside(root, abs)) return { error: 'Yol proje dizininin dışında.' };
    return { abs, root };
  }

  function grantFailure(capability, label) {
    return fail(CODES.FORBIDDEN, `Votion bu işlem için oturum onayı istiyor: ${label}.`, {
      detail: { needsGrant: capability }
    });
  }

  /** Beyaz listeli komut — çıktı ve süre ölçülür. */
  function runCommand(input) {
    if (!grants.has('run.commands')) return grantFailure('run.commands', 'Komut çalıştırma');
    const p = input || {};
    const id = String(p.command || p.cmd || '').toLowerCase();
    const spec = COMMANDS[id];
    if (!spec) {
      return fail(CODES.FORBIDDEN, 'Bu komut beyaz listede yok.', {
        detail: { allowed: Object.keys(COMMANDS) }
      });
    }
    const args = Array.isArray(p.args) ? p.args.map((a) => String(a).slice(0, 500)) : [];
    if (args.length > 24) return fail(CODES.BAD_REQUEST, 'Çok fazla argüman.');
    const cwdInput = p.cwd ? path.resolve(String(p.cwd)) : projectRoot();
    const place = withinProject(cwdInput);
    if (place.error) return fail(CODES.FORBIDDEN, place.error);
    if (!fs.existsSync(place.abs) || !fs.statSync(place.abs).isDirectory()) {
      return fail(CODES.NOT_FOUND, 'Çalışma dizini bulunamadı.');
    }
    const timeout = Math.min(MAX_TIMEOUT_MS, Math.max(1000, Number(p.timeoutMs) || DEFAULT_TIMEOUT_MS));

    return new Promise((resolve) => {
      const started = Date.now();
      let out = '';
      let err = '';
      let truncated = false;
      let settled = false;
      let child;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const append = (chunk, toErr) => {
        const text = String(chunk);
        if ((out.length + err.length + text.length) > MAX_OUTPUT) {
          truncated = true;
          const room = Math.max(0, MAX_OUTPUT - (out.length + err.length));
          if (toErr) err += text.slice(0, room);
          else out += text.slice(0, room);
          return;
        }
        if (toErr) err += text;
        else out += text;
      };
      try {
        child = spawnFn(spec.file, args, {
          cwd: place.abs,
          shell: false,
          windowsHide: true,
          env: { ...process.env, CI: '1', NO_COLOR: '1' }
        });
      } catch (error) {
        localRecord({ action: 'command', target: id, ok: false, code: CODES.INTERNAL });
        return finish(fail(CODES.INTERNAL, 'Komut başlatılamadı.', { detail: String(error && error.message || '') }));
      }
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* yok */ }
        const ms = Date.now() - started;
        localRecord({ action: 'command', target: id, ok: false, code: CODES.TIMEOUT });
        finish(fail(CODES.TIMEOUT, `Komut ${ms} ms içinde bitmedi; durduruldu.`, {
          detail: { command: id, args, cwd: place.abs, stdout: out, stderr: err, truncated }
        }));
      }, timeout);
      if (child.stdout) child.stdout.on('data', (c) => append(c, false));
      if (child.stderr) child.stderr.on('data', (c) => append(c, true));
      child.on('error', (error) => {
        clearTimeout(timer);
        localRecord({ action: 'command', target: id, ok: false, code: CODES.INTERNAL });
        finish(fail(CODES.INTERNAL, 'Komut çalıştırılamadı.', { detail: String(error && error.message || '') }));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const ms = Date.now() - started;
        localRecord({ action: 'command', target: id, ok: code === 0, code: code === 0 ? CODES.OK : CODES.INTERNAL, exitCode: code, ms });
        /* Sıfır olmayan çıkış kodu bir HATA değil, sonuçtur: testler kırmızı olabilir. */
        finish(ok({ command: id, args, cwd: place.abs, exitCode: code, ms, stdout: out, stderr: err, truncated }));
      });
    });
  }

  /** Proje içinde metin dosyası yaz — yedek + isteğe bağlı `find` değiştirme. */
  function writeFile(input) {
    if (!grants.has('write.files')) return grantFailure('write.files', 'Proje içinde kod düzenleme');
    const p = input || {};
    const raw = String(p.path || '');
    if (!raw.trim()) return fail(CODES.BAD_REQUEST, 'Dosya yolu gerekli.');
    const place = withinProject(path.isAbsolute(raw) ? raw : path.join(projectRoot(), raw));
    if (place.error) return fail(CODES.FORBIDDEN, place.error);
    const rel = path.relative(place.root, place.abs).replace(/\\/g, '/');
    if (!rel) return fail(CODES.BAD_REQUEST, 'Proje kökü dosya olarak yazılamaz.');
    if (containsSecretName(rel)) {
      return fail(CODES.FORBIDDEN, 'Bu dosya korumalı (sır / bağımlılık / sürüm dizini).', { detail: { rel } });
    }
    if (place.abs.length > 400) return fail(CODES.BAD_REQUEST, 'Yol çok uzun.');

    let previous = null;
    if (fs.existsSync(place.abs)) {
      const st = fs.statSync(place.abs);
      if (!st.isFile()) return fail(CODES.BAD_REQUEST, 'Hedef bir dosya değil.');
      if (st.size > MAX_READ_BACKUP) return fail(CODES.BAD_REQUEST, 'Dosya yedek için çok büyük.');
      previous = fs.readFileSync(place.abs, 'utf8');
    }

    let next = typeof p.content === 'string' ? p.content : null;
    const find = typeof p.find === 'string' ? p.find : '';
    if (find) {
      if (previous == null) return fail(CODES.NOT_FOUND, 'Değiştirilecek dosya yok.');
      const hits = previous.split(find).length - 1;
      if (hits === 0) return fail(CODES.NOT_FOUND, 'Aranan metin dosyada yok.', { detail: { rel } });
      if (hits > 1 && !p.all) {
        return fail(CODES.CONFLICT, `Aranan metin ${hits} yerde geçiyor; hepsi için all:true gerekir.`, { detail: { rel, hits } });
      }
      if (typeof p.replace !== 'string') return fail(CODES.BAD_REQUEST, 'replace alanı gerekli.');
      next = previous.split(find).join(String(p.replace));
    }
    if (next == null) return fail(CODES.BAD_REQUEST, 'content ya da find/replace gerekli.');
    const bytes = Buffer.byteLength(next, 'utf8');
    if (bytes > MAX_WRITE_BYTES) return fail(CODES.BAD_REQUEST, 'İçerik çok büyük.', { detail: { bytes } });

    let backup = null;
    try {
      if (previous != null) {
        const dir = path.join(baseDir, 'votion', 'backups');
        fs.mkdirSync(dir, { recursive: true });
        backup = path.join(dir, `${Date.now()}-${rel.replace(/[\\/]/g, '_')}`);
        fs.writeFileSync(backup, previous, 'utf8');
      }
      fs.mkdirSync(path.dirname(place.abs), { recursive: true });
      fs.writeFileSync(place.abs, next, 'utf8');
    } catch (error) {
      localRecord({ action: 'writeFile', target: place.abs, ok: false, code: CODES.INTERNAL });
      return fail(CODES.INTERNAL, 'Dosya yazılamadı.', { detail: String(error && error.message || '') });
    }
    localRecord({ action: 'writeFile', target: place.abs, ok: true, detail: { rel, bytes, backup } });
    return ok({
      path: place.abs, rel, bytes, created: previous == null,
      replaced: Boolean(find), backup
    });
  }

  return { runCommand, writeFile, COMMANDS, projectRoot, withinProject };
}

module.exports = { createVotionExec, COMMANDS };
