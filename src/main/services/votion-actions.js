'use strict';

/**
 * Votion masaüstü eylemleri — T8 (Tur 8).
 *
 * TASARIM (güvenlik önce):
 *   - Renderer hiçbir zaman serbest komut çalıştırmaz. Yalnız AŞAĞIDAKİ sabit
 *     eylem kümesini ister: `list`, `openApp`, `listFiles`, `move`,
 *     `trash`, `screenshot`, `browser`, `log`.
 *   - `openApp` yalnız BEYAZ LISTEDEKİ uygulama kimlikleriyle çalışır; kabuk
 *     (cmd/powershell) ve serbest yol YOKTUR. `shell:true` asla kullanılmaz.
 *   - Dosya işlemleri yalnız izinli köklerin (Masaüstü, Belgeler, İndirilenler,
 *     proje dizini) İÇİNDE yapılır. `..` kaçışı, sembolik link ve kök dışı yol
 *     reddedilir. Silme kalıcı değildir: Geri Dönüşüm Kutusu'na taşınır.
 *   - Her eylem `votion/actions.jsonl` dosyasına eklenir (append-only, sır yok).
 *
 * Kural: uydurma yok. Yapılamayan eylem `E_FORBIDDEN` / `E_BAD_REQUEST` döner.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { CODES, ok, fail } = require('../../shared/errors');

/** Beyaz liste: kimlik -> çalıştırılabilir dosya adı (System32 içinde aranır). */
const APPS = Object.freeze({
  notepad: { file: 'notepad.exe', label: 'Not Defteri' },
  calc: { file: 'calc.exe', label: 'Hesap Makinesi' },
  mspaint: { file: 'mspaint.exe', label: 'Paint' },
  explorer: { file: 'explorer.exe', label: 'Dosya Gezgini' },
  control: { file: 'control.exe', label: 'Denetim Masası' },
  taskmgr: { file: 'Taskmgr.exe', label: 'Görev Yöneticisi' },
  snippingtool: { file: 'SnippingTool.exe', label: 'Ekran Alıntısı' },
  charmap: { file: 'charmap.exe', label: 'Karakter Eşlem' }
});

const MAX_ENTRIES = 200;
const MAX_LOG = 400;

function isInside(root, target) {
  if (!root || !target) return false;
  const r = path.resolve(root).toLowerCase().replace(/[\\/]+$/, '');
  const t = path.resolve(target).toLowerCase();
  if (t === r) return false;
  return t.startsWith(`${r}${path.sep}`);
}

/**
 * @param {{baseDir:string, getProjectDir:()=>string, getRoots?:()=>object,
 *          audit?:object, shellApi:object, capturer?:object, spawnFn?:Function}} options
 */
function createVotionActions(options) {
  const baseDir = options.baseDir;
  const getProjectDir = options.getProjectDir;
  const shellApi = options.shellApi;
  const capturer = options.capturer || null;
  const spawnFn = options.spawnFn || spawn;
  const audit = options.audit || null;
  /* T-198: oturum yetkileri + komut/dosya yürütücüsü (main.js kurar). */
  const grants = options.grants || null;
  const exec = options.exec || null;
  const grantsApi = options.grantsApi || null;

  const logDir = path.join(baseDir, 'votion');
  const logPath = path.join(logDir, 'actions.jsonl');

  function roots() {
    const base = typeof options.getRoots === 'function' ? options.getRoots() || {} : {};
    const list = [];
    for (const key of ['desktop', 'documents', 'downloads']) {
      if (base[key]) list.push({ id: key, label: key === 'desktop' ? 'Masaüstü' : key === 'documents' ? 'Belgeler' : 'İndirilenler', dir: base[key] });
    }
    const project = getProjectDir();
    if (project) list.push({ id: 'project', label: 'Proje', dir: project });
    return list;
  }

  function record(entry) {
    const row = { at: new Date().toISOString(), ...entry };
    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logPath, `${JSON.stringify(row)}\n`, 'utf8');
    } catch { /* kayıt tutulamazsa eylem yine yapılır; sır yazılmaz */ }
    if (audit && typeof audit.append === 'function') {
      try {
        audit.append({ op: 'votion:act', code: row.ok ? CODES.OK : row.code || CODES.INTERNAL, target: row.action || 'votion', extra: { target: row.target || null } });
      } catch { /* yoksay */ }
    }
    return row;
  }

  function recentLog(limit) {
    const max = Number.isInteger(limit) ? Math.min(MAX_LOG, Math.max(1, limit)) : 30;
    try {
      if (!fs.existsSync(logPath)) return [];
      const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
      return lines.slice(-max).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean).reverse();
    } catch {
      return [];
    }
  }

  /** İzinli köklerden birine ait mi? Kök kimliğini de döndürür. */
  function resolveSafe(target) {
    const raw = typeof target === 'string' ? target.trim() : '';
    if (!raw) return { error: 'Yol boş.' };
    if (raw.length > 500) return { error: 'Yol çok uzun.' };
    if (raw.includes('\u0000')) return { error: 'Yol geçersiz.' };
    const abs = path.resolve(raw);
    for (const root of roots()) {
      if (isInside(root.dir, abs)) return { abs, root };
    }
    return { error: 'Bu yol izinli klasörlerin dışında.' };
  }

  function listApps() {
    return Object.entries(APPS).map(([id, v]) => ({ id, label: v.label }));
  }

  function list(input) {
    const p = input || {};
    const project = getProjectDir();
    return ok({
      apps: listApps(),
      roots: roots().map((r) => ({ id: r.id, label: r.label, dir: r.dir })),
      project,
      log: recentLog(p.limit),
      /* T-198: oturum yetkileri — arayüz onay/kaldır düğmelerini buradan çizer. */
      grants: grantsApi ? grantsApi.list() : null,
      commands: exec ? Object.entries(exec.COMMANDS).map(([id, v]) => ({ id, label: v.label })) : [],
      limits: {
        maxBytes: null,
        note: 'Silme Geri Dönüşüm Kutusu’na taşınır; kalıcı silme yoktur.'
      }
    });
  }

  async function openApp(input) {
    const p = input || {};
    const id = String(p.app || '').toLowerCase();
    const app = APPS[id];
    if (!app) {
      return fail(CODES.FORBIDDEN, 'Bu uygulama beyaz listede yok.', {
        detail: { allowed: Object.keys(APPS) }
      });
    }
    const winDir = process.env.WINDIR || 'C:\\Windows';
    const exe = path.join(winDir, 'System32', app.file);
    if (!fs.existsSync(exe)) return fail(CODES.NOT_FOUND, `${app.label} bu bilgisayarda bulunamadı.`);
    try {
      const child = spawnFn(exe, [], { detached: true, stdio: 'ignore', shell: false, windowsHide: false });
      if (child && typeof child.unref === 'function') child.unref();
    } catch (error) {
      record({ action: 'openApp', target: id, ok: false, code: CODES.INTERNAL });
      return fail(CODES.INTERNAL, `${app.label} açılamadı.`, { detail: String(error && error.message || '') });
    }
    record({ action: 'openApp', target: id, ok: true });
    return ok({ app: id, label: app.label, opened: true });
  }

  function listFiles(input) {
    const p = input || {};
    const rootId = String(p.root || 'project');
    const root = roots().find((r) => r.id === rootId);
    if (!root) return fail(CODES.BAD_REQUEST, 'Bilinmeyen klasör.', { detail: { roots: roots().map((r) => r.id) } });
    const dir = p.path ? path.resolve(p.path) : path.resolve(root.dir);
    if (!isInside(root.dir, dir) && dir !== path.resolve(root.dir)) {
      return fail(CODES.FORBIDDEN, 'Bu klasör izinli kökün dışında.');
    }
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.') || e.name === '.team')
        .slice(0, MAX_ENTRIES)
        .map((e) => {
          const full = path.join(dir, e.name);
          let size = null;
          let mtime = null;
          try {
            const st = fs.statSync(full);
            size = e.isDirectory() ? null : st.size;
            mtime = st.mtime.toISOString();
          } catch { /* erisilemeyen girdi */ }
          return { name: e.name, dir: e.isDirectory(), size, at: mtime };
        })
        .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, 'tr'));
      record({ action: 'listFiles', target: dir, ok: true });
      return ok({ root: rootId, dir, entries, total: entries.length, truncated: entries.length >= MAX_ENTRIES });
    } catch (error) {
      return fail(CODES.NOT_FOUND, 'Klasör okunamadı.', { detail: String(error && error.message || '') });
    }
  }

  async function move(input) {
    const p = input || {};
    const from = resolveSafe(p.from);
    if (from.error) return fail(CODES.FORBIDDEN, from.error);
    const to = resolveSafe(p.to);
    if (to.error) return fail(CODES.FORBIDDEN, to.error);
    if (from.root.id !== to.root.id) {
      return fail(CODES.FORBIDDEN, 'Taşıma yalnız aynı izinli klasör içinde yapılabilir.');
    }
    if (!fs.existsSync(from.abs)) return fail(CODES.NOT_FOUND, 'Kaynak bulunamadı.');
    let destDir = to.abs;
    try {
      if (!fs.statSync(to.abs).isDirectory()) destDir = path.dirname(to.abs);
      if (!isInside(to.root.dir, destDir)) return fail(CODES.FORBIDDEN, 'Hedef klasör izinli kökün dışında.');
      const dest = path.join(destDir, path.basename(from.abs));
      if (fs.existsSync(dest)) return fail(CODES.CONFLICT, 'Hedefte aynı adlı kayıt var.');
      fs.renameSync(from.abs, dest);
      record({ action: 'move', target: from.abs, ok: true, detail: { to: dest } });
      return ok({ from: from.abs, to: dest, moved: true });
    } catch (error) {
      record({ action: 'move', target: from.abs, ok: false, code: CODES.INTERNAL });
      return fail(CODES.INTERNAL, 'Taşıma başarısız.', { detail: String(error && error.message || '') });
    }
  }

  async function trash(input) {
    const p = input || {};
    const target = resolveSafe(p.path);
    if (target.error) return fail(CODES.FORBIDDEN, target.error);
    if (!fs.existsSync(target.abs)) return fail(CODES.NOT_FOUND, 'Silinecek kayıt bulunamadı.');
    try {
      if (!shellApi || typeof shellApi.trashItem !== 'function') {
        return fail(CODES.INTERNAL, 'Geri dönüşüm kutusu kullanılamıyor.');
      }
      await shellApi.trashItem(target.abs);
    } catch (error) {
      record({ action: 'trash', target: target.abs, ok: false, code: CODES.INTERNAL });
      return fail(CODES.INTERNAL, 'Silme başarısız.', { detail: String(error && error.message || '') });
    }
    record({ action: 'trash', target: target.abs, ok: true });
    return ok({ path: target.abs, trashed: true, restorable: true });
  }

  async function screenshot(input) {
    const p = input || {};
    if (!capturer) return fail(CODES.INTERNAL, 'Ekran yakalama bu sürümde kapalı.');
    const width = Math.min(1600, Math.max(640, Number(p.width) || 1280));
    let sources = [];
    try {
      sources = await capturer.getSources({ types: ['screen'], thumbnailSize: { width, height: Math.round(width * 0.62) } });
    } catch (error) {
      return fail(CODES.INTERNAL, 'Ekran okunamadı.', { detail: String(error && error.message || '') });
    }
    const source = sources[0];
    if (!source || !source.thumbnail || source.thumbnail.isEmpty()) {
      return fail(CODES.NOT_FOUND, 'Ekran görüntüsü alınamadı.');
    }
    const image = source.thumbnail;
    const size = image.getSize();
    const dir = path.join(logDir, 'screens');
    const file = path.join(dir, `screen-${Date.now()}.png`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, image.toPNG());
    } catch (error) {
      return fail(CODES.INTERNAL, 'Ekran görüntüsü yazılamadı.', { detail: String(error && error.message || '') });
    }
    record({ action: 'screenshot', target: file, ok: true });
    return ok({ path: file, width: size.width, height: size.height, dataUrl: image.toDataURL(), at: new Date().toISOString() });
  }

  async function run(input) {
    const p = input || {};
    const action = String(p.action || '');
    switch (action) {
      case 'list': return list(p);
      case 'openApp': return openApp(p);
      case 'listFiles': return listFiles(p);
      case 'move': return move(p);
      case 'trash': return trash(p);
      case 'screenshot': return screenshot(p);
      case 'browser': {
        const browser = options.browser && options.browser();
        if (!browser || typeof browser.automate !== 'function') {
          return fail(CODES.INTERNAL, 'Tarayıcı otomasyonu hazır değil.');
        }
        return browser.automate({ steps: p.steps });
      }
      case 'log': return ok({ log: recentLog(p.limit) });
      /* --- T-198: oturum yetkileri --- */
      case 'grants': return ok(grantsApi ? grantsApi.list() : { capabilities: [] });
      case 'grant': {
        if (!grantsApi) return fail(CODES.INTERNAL, 'Yetki defteri hazır değil.');
        const res = grantsApi.grant(String(p.capability || ''));
        if (!res.ok) return fail(CODES.BAD_REQUEST, 'Bilinmeyen yetenek.', { detail: { capability: p.capability } });
        record({ action: 'grant', target: res.capability, ok: true });
        return ok(grantsApi.list());
      }
      case 'revokeGrant': {
        if (!grantsApi) return fail(CODES.INTERNAL, 'Yetki defteri hazır değil.');
        const res = grantsApi.revoke(String(p.capability || ''));
        if (!res.ok) return fail(CODES.BAD_REQUEST, 'Bilinmeyen yetenek.', { detail: { capability: p.capability } });
        record({ action: 'revokeGrant', target: res.capability, ok: true });
        return ok(grantsApi.list());
      }
      /* --- T-198: onaylı komut ve kod düzenleme --- */
      case 'command': {
        if (!exec) return fail(CODES.INTERNAL, 'Komut yürütücüsü hazır değil.');
        return exec.runCommand(p);
      }
      case 'writeFile': {
        if (!exec) return fail(CODES.INTERNAL, 'Dosya yürütücüsü hazır değil.');
        return exec.writeFile(p);
      }
      default:
        return fail(CODES.BAD_REQUEST, 'Bilinmeyen Votion eylemi.', { detail: { action, allowed: ['list', 'openApp', 'listFiles', 'move', 'trash', 'screenshot', 'browser', 'log', 'grants', 'grant', 'revokeGrant', 'command', 'writeFile'] } });
    }
  }

  /** Onay isteyen (geri alınamaz/yıkıcı) eylemler — API-51a kapısı. */
  const CONFIRM_ACTIONS = Object.freeze(['move', 'trash', 'browser', 'grant']);

  return {
    run, list, listApps, listFiles, move, trash, screenshot, openApp, recentLog, roots,
    CONFIRM_ACTIONS,
    grants: grantsApi,
    exec
  };
}

module.exports = { createVotionActions, APPS, isInside };
