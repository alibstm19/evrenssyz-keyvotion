'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fail, ok, CODES } = require('../../shared/errors');

const ROLE_CODES = ['LDR', 'YM', 'ARC', 'DEV', 'DSN', 'QA', 'OPS'];

/**
 * Gecerli rol kodu: 2-6 karakter, harfle baslar, buyuk harf/rakam.
 * Sabit liste yalniz ILK kurulum icindir; C-1 dinamik kadro yeni kod ekleyebilir.
 */
const CODE_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

function isValidCode(code) {
  return typeof code === 'string' && CODE_PATTERN.test(code.trim());
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Yazma oncesi yedek (K1 §5.4/7). Silme yok, kopya var. */
function backupFile(filePath, backupRoot, label) {
  if (!fs.existsSync(filePath)) return null;
  const dir = path.join(backupRoot, today());
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `${label}.${stamp}.bak`);
  fs.copyFileSync(filePath, target);
  return target;
}

function splitRow(line) {
  // "| a | b |" -> ['a','b'] (kacisli boru desteklenmez; panoda yok)
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));
}

/** Markdown tablolarini [{header, rows}] olarak cikarir. */
function parseTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  let current = null;

  for (const line of lines) {
    const cells = splitRow(line);
    if (!cells) {
      if (current) { tables.push(current); current = null; }
      continue;
    }
    if (!current) {
      current = { header: cells, rows: [], headerIndex: 0, endIndex: 0 };
      continue;
    }
    if (current.rows.length === 0 && isSeparatorRow(cells)) {
      current.separator = cells;
      continue;
    }
    current.rows.push(cells);
  }
  if (current) tables.push(current);

  let cursor = 0;
  for (const table of tables) {
    while (cursor < lines.length) {
      const cells = splitRow(lines[cursor]);
      if (cells && cells.join('|') === table.header.join('|')) break;
      cursor += 1;
    }
    table.headerIndex = cursor;
    let end = cursor;
    while (end < lines.length && splitRow(lines[end])) end += 1;
    table.endIndex = end;
  }
  return tables;
}

function stripCode(value) {
  if (!value) return '';
  return String(value).replace(/`/g, '').trim();
}

/**
 * .team/roster.md oku/yaz.
 * Satirlar: Rol | Kod | Sorumluluk | model | Seans
 */
function createRoster(options) {
  const getProjectDir = options.getProjectDir;
  const getBackupRoot = options.getBackupRoot || (() => options.backupRoot);

  function rosterPath() {
    return path.join(getProjectDir(), '.team', 'roster.md');
  }

  function read() {
    const file = rosterPath();
    let markdown;
    try {
      markdown = fs.readFileSync(file, 'utf8');
    } catch {
      return fail(CODES.NOT_FOUND, 'Kadro dosyası bulunamadı.');
    }

    const lines = markdown.split(/\r?\n/);
    const entries = [];
    let inTable = false;

    for (const line of lines) {
      const cells = splitRow(line);
      if (!cells) { inTable = false; continue; }

      const isHeader = cells[0].toLowerCase() === 'rol' && cells[1] === 'Kod';
      if (isHeader) { inTable = true; continue; }
      if (!inTable) continue;
      if (isSeparatorRow(cells)) continue;
      if (cells.length < 5) continue;

      const code = stripCode(cells[1]);
      if (!isValidCode(code)) continue;

      entries.push({
        role: stripCode(cells[0]),
        code,
        responsibility: cells[2],
        model: stripCode(cells[3]),
        sessionID: stripCode(cells[4]) || null
      });
    }

    return {
      ok: true,
      data: {
        entries,
        // Sozlesme §9.1 adi: roles (name = role metni). Ayni veri, iki ad.
        roles: entries.map((e) => ({
          code: e.code,
          name: e.role,
          sessionID: e.sessionID,
          model: e.model,
          status: e.sessionID ? 'active' : 'missing'
        })),
        path: file,
        nextLeaderSessionID: (entries.find((e) => e.code === 'LDR') || {}).sessionID || null
      }
    };
  }

  /** Tablo blogunu yeniden yazar; tablo disindaki metin korunur. */
  function write(entries) {
    const file = rosterPath();
    let markdown;
    try {
      markdown = fs.readFileSync(file, 'utf8');
    } catch {
      return fail(CODES.NOT_FOUND, 'Kadro dosyası bulunamadı.');
    }

    const list = Array.isArray(entries) ? entries : [];
    for (const entry of list) {
      if (!entry || !isValidCode(entry.code)) {
        return fail(CODES.BAD_REQUEST, 'Geçersiz kadro kodu (2-6 karakter, harfle başlar).');
      }
    }

    const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
    const lines = markdown.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => {
      const cells = splitRow(line);
      return cells && cells[0].toLowerCase() === 'rol' && cells[1] === 'Kod';
    });
    if (headerIndex < 0) return fail(CODES.PARSE, 'Kadro tablosu bulunamadı.');

    let end = headerIndex;
    while (end < lines.length && splitRow(lines[end])) end += 1;

    const rebuilt = [
      '| Rol | Kod | Sorumluluk | Açılış modeli (varsayılan) | Seans |',
      '|---|---|---|---|---|'
    ];
    for (const entry of list) {
      rebuilt.push(`| ${entry.role} | ${entry.code} | ${entry.responsibility || ''} | \`${entry.model || ''}\` | \`${entry.sessionID || ''}\` |`);
    }

    let backup;
    try {
      backup = backupFile(file, getBackupRoot(), 'roster.md');
    } catch {
      return fail(CODES.INTERNAL, 'Kadro yedeği alınamadı; yazma yapılmadı.');
    }

    const next = lines.slice(0, headerIndex).concat(rebuilt, lines.slice(end));
    try {
      fs.writeFileSync(file, next.join(eol), 'utf8');
    } catch {
      return fail(CODES.INTERNAL, 'Kadro dosyası yazılamadı.');
    }

    return { ok: true, data: { path: file, backup, count: list.length } };
  }

  /** LDR satirinin seans ID'sini degistirir (F8). */
  function setLeader(sessionID) {
    const current = read();
    if (!current.ok) return current;
    if (typeof sessionID !== 'string' || !sessionID.startsWith('ses_')) {
      return fail(CODES.BAD_REQUEST, 'Geçersiz seans kimliği.');
    }
    const entries = current.data.entries.map((entry) => (
      entry.code === 'LDR' ? { ...entry, sessionID } : entry
    ));
    const res = write(entries);
    if (!res.ok) return res;
    return { ok: true, data: { sessionID, backup: res.data.backup } };
  }

  /**
   * Kadroya satir ekler; ayni kod varsa GUNCELLER (C-6: rol kodu tekilligi).
   * Yedek write() icinde alinir.
   * @param {{role: string, code: string, responsibility?: string, model?: string, sessionID?: string}} entry
   */
  function append(entry) {
    if (!entry || !isValidCode(entry.code)) {
      return fail(CODES.BAD_REQUEST, 'Geçersiz kadro kodu (2-6 karakter, harfle başlar).');
    }
    const current = read();
    if (!current.ok) return current;

    const code = entry.code.trim().toUpperCase();
    const row = {
      role: entry.role || code,
      code,
      responsibility: entry.responsibility || '',
      model: entry.model || '',
      sessionID: entry.sessionID || null
    };

    const exists = current.data.entries.some((e) => e.code === code);
    const entries = exists
      ? current.data.entries.map((e) => (e.code === code ? { ...e, ...row } : e))
      : current.data.entries.concat([row]);

    const res = write(entries);
    if (!res.ok) return res;
    return ok({ code, updated: exists, created: !exists, backup: res.data.backup, entries });
  }

  /**
   * C-6 / API-94: rol kodu tekilliği. Ag istegi ATILMADAN once cagrilir.
   *
   * Karsilastirma harf buyuk/kucuk duyarsizdir ve `stripCode` (ters tirnak /
   * bosluk temizligi) sonrasi yapilir. `context.titles` verilirse aktif seans
   * basliklarinda da aranir (API-94'un "veya aktif seans basliginda" kismi).
   *
   * Fail-open YALNIZ kadro okunamadiginda uygulanir: cakisma kanitlanamiyorsa
   * kullaniciyi engellemek yanlis olur. Diger her durumda fail-closed.
   *
   * @param {string} code istenen rol kodu (ham; normalize edilir)
   * @param {{titles?: string[]}} [context]
   * @returns {{ok:true, data:object} | {ok:false, error:object}}
   */
  function assertUniqueCode(code, context = {}) {
    const wanted = stripCode(code).toUpperCase();

    const res = read();
    if (!res.ok) {
      // Cakisma KANITLANAMADI -> akis devam eder (fail-open, yalniz burada).
      return ok({
        code: wanted,
        checked: false,
        reason: 'roster-unreadable',
        error: res.error.code
      });
    }

    const codes = res.data.entries.map((entry) => entry.code.toUpperCase());
    const rosterHit = codes.includes(wanted);

    const titles = Array.isArray(context && context.titles) ? context.titles : [];
    const titleHit = Boolean(wanted) && titles.some((title) => {
      const text = String(title || '').toUpperCase();
      return new RegExp(`(^|[^A-Z0-9])${wanted}([^A-Z0-9]|$)`).test(text);
    });

    if (rosterHit || titleHit) {
      return fail(
        CODES.DUPLICATE_ROLE,
        `Bu rol kodu zaten kullanımda. ${wanted} yerine yeni bir kod seçin.`,
        { detail: `duplicate-role:${wanted}|source:${rosterHit ? 'roster' : 'title'}` }
      );
    }

    return ok({ code: wanted, checked: true, source: 'roster' });
  }

  /** Kadrodan satir cikarir (seans arsivlenirken). */
  function remove(code) {
    const current = read();
    if (!current.ok) return current;
    const key = String(code || '').trim().toUpperCase();
    if (!current.data.entries.some((e) => e.code === key)) {
      return fail(CODES.NOT_FOUND, 'Kadroda böyle bir kod yok.');
    }
    const entries = current.data.entries.filter((e) => e.code !== key);
    const res = write(entries);
    if (!res.ok) return res;
    return ok({ removed: key, backup: res.data.backup, entries });
  }

  return { read, write, append, remove, setLeader, assertUniqueCode, rosterPath, ROLE_CODES, isValidCode };
}

module.exports = {
  createRoster,
  parseTables,
  splitRow,
  backupFile,
  today,
  ROLE_CODES,
  CODE_PATTERN,
  isValidCode
};
