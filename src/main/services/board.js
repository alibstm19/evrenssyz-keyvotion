'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');
const { parseTables, backupFile } = require('./roster');

const VALID_STATUS = ['planlandi', 'devam', 'inceleme', 'bitti', 'red', 'bloke'];

const STATUS_ALIASES = new Map([
  ['planlandı', 'planlandi'],
  ['planlandi', 'planlandi'],
  ['bekliyor', 'planlandi'],
  ['devam', 'devam'],
  ['devam ediyor', 'devam'],
  ['inceleme', 'inceleme'],
  ['bitti', 'bitti'],
  ['tamam', 'bitti'],
  ['red', 'red'],
  ['reddedildi', 'red'],
  ['bloke', 'bloke'],
  ['bloke edildi', 'bloke']
]);

function normalizeStatus(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase();
  const mapped = STATUS_ALIASES.get(key);
  if (mapped) return { status: mapped, statusRaw: null };
  return { status: 'bloke', statusRaw: raw };
}

function stripCode(value) {
  return String(value || '').replace(/`/g, '').trim();
}

/** board.md oku -> {nextID, phases:[{title, rows}], rows, path} */
function parseBoard(markdown) {
  const lines = markdown.split(/\r?\n/);

  let nextID = null;
  const idLine = markdown.match(/Sıradaki ID:\s*\*{0,2}(T-\d{3})/i)
    || markdown.match(/Siradaki ID:\s*\*{0,2}(T-\d{3})/i);
  if (idLine) nextID = idLine[1].toUpperCase();

  // Asama basliklarinin satir indeksleri
  const phaseAt = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^##\s+(Aşama\s+\d+.*|Asama\s+\d+.*)$/i);
    if (match) phaseAt.push({ index: i, title: match[1].trim() });
  }

  const phases = phaseAt.map((phase, outer) => ({
    title: phase.title,
    rows: [],
    index: phase.index,
    end: outer + 1 < phaseAt.length ? phaseAt[outer + 1].index : lines.length
  }));

  const tables = parseTables(markdown);
  const boardTables = tables.filter((table) => {
    const first = (table.header[0] || '').toUpperCase();
    return first === 'ID' && table.header.length >= 5;
  });

  const rows = [];
  for (const table of boardTables) {
    const phase = phases.find((p) => table.headerIndex > p.index && table.headerIndex < p.end);
    for (const cells of table.rows) {
      const idMatch = String(cells[0] || '').match(/^T-\d{3}$/);
      if (!idMatch) continue;
      const { status, statusRaw } = normalizeStatus(cells[3]);
      rows.push({
        id: cells[0].trim().toUpperCase(),
        title: cells[1] || '',
        owner: stripCode(cells[2]),
        status,
        statusRaw,
        evidence: cells[4] || '',
        phase: phase ? phase.title : null
      });
    }
  }

  return {
    nextID,
    phases: phases.map((p) => ({ title: p.title, rows: rows.filter((r) => r.phase === p.title) })),
    rows
  };
}

function formatRow(row) {
  const status = VALID_STATUS.includes(row.status) ? row.status : 'bloke';
  return `| ${row.id} | ${row.title} | ${row.owner} | ${status} | ${row.evidence} |`;
}

/**
 * @param {{getProjectDir: () => string, backupRoot: string}} deps
 */
function createBoardService(deps) {
  const getProjectDir = deps.getProjectDir;
  const getBackupRoot = deps.getBackupRoot || (() => deps.backupRoot);

  function boardPath() {
    return path.join(getProjectDir(), '.team', 'board.md');
  }

  function read() {
    const file = boardPath();
    let markdown;
    try {
      markdown = fs.readFileSync(file, 'utf8');
    } catch {
      return fail(CODES.NOT_FOUND, 'Pano bulunamadı.');
    }
    try {
      const parsed = parseBoard(markdown);
      return ok({ ...parsed, path: file });
    } catch {
      return fail(CODES.PARSE, 'Pano okunamadı. Son iyi kopya gösteriliyor.');
    }
  }

  /**
   * Satir yaz (varsa degistir, yoksa son tabloya ekle).
   * Yedek yazmadan ONCE alinir (K1 §5.4/7).
   * @param {{id: string, title?: string, owner?: string, status?: string, evidence?: string}} row
   */
  function write(row) {
    if (!row || !/^T-\d{3}$/i.test(String(row.id || ''))) {
      return fail(CODES.BAD_REQUEST, 'Görev kimliği T-xxx biçiminde olmalı.');
    }
    if (row.status !== undefined && !VALID_STATUS.includes(row.status)) {
      return fail(CODES.BAD_REQUEST, `Geçersiz durum. Geçerli: ${VALID_STATUS.join(', ')}`);
    }

    const file = boardPath();
    let markdown;
    try {
      markdown = fs.readFileSync(file, 'utf8');
    } catch {
      return fail(CODES.NOT_FOUND, 'Pano bulunamadı.');
    }

    const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
    const lines = markdown.split(/\r?\n/);
    const parsed = parseBoard(markdown);
    const existing = parsed.rows.find((r) => r.id.toUpperCase() === String(row.id).toUpperCase());

    const merged = {
      id: String(row.id).toUpperCase(),
      title: row.title !== undefined ? row.title : (existing ? existing.title : ''),
      owner: row.owner !== undefined ? row.owner : (existing ? existing.owner : ''),
      status: row.status !== undefined ? row.status : (existing ? existing.status : 'planlandi'),
      evidence: row.evidence !== undefined ? row.evidence : (existing ? existing.evidence : '')
    };

    const rowIndex = lines.findIndex((line) => {
      const cells = line.trim().startsWith('|') ? line.replace(/^\|/, '').replace(/\|$/, '').split('|') : [];
      return cells.length > 0 && String(cells[0] || '').trim().toUpperCase() === merged.id;
    });

    let nextLines;
    if (rowIndex >= 0) {
      nextLines = lines.slice();
      nextLines[rowIndex] = formatRow(merged);
    } else {
      // Son pano tablosunun son satirindan sonra ekle.
      let insertAt = -1;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (/^\|\s*T-\d{3}\s*\|/.test(lines[i].trim())) { insertAt = i + 1; break; }
      }
      if (insertAt < 0) {
        return fail(CODES.PARSE, 'Pano tablosu bulunamadı; yeni satır eklenemedi.');
      }
      nextLines = lines.slice(0, insertAt).concat([formatRow(merged)], lines.slice(insertAt));
    }

    let backup;
    try {
      backup = backupFile(file, getBackupRoot(), 'board.md');
    } catch {
      return fail(CODES.INTERNAL, 'Pano yedeği alınamadı; yazma yapılmadı.');
    }

    try {
      fs.writeFileSync(file, nextLines.join(eol), 'utf8');
    } catch {
      return fail(CODES.INTERNAL, 'Pano yazılamadı.');
    }

    return ok({ row: merged, backup, created: rowIndex < 0 });
  }

  /**
   * fs.watch + 300 ms debounce.
   * @param {(result: object) => void} callback
   * @returns {() => void} unwatch
   */
  function watch(callback) {
    const file = boardPath();
    const dir = path.dirname(file);
    let timer = null;
    let watcher;

    try {
      watcher = fs.watch(dir, (eventType, filename) => {
        if (filename && path.basename(String(filename)) !== 'board.md') return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          const res = read();
          if (typeof callback === 'function') callback(res);
        }, 300);
      });
    } catch {
      return () => {};
    }

    return () => {
      if (timer) clearTimeout(timer);
      try { watcher.close(); } catch { /* yoksay */ }
    };
  }

  return { read, write, watch, boardPath, VALID_STATUS };
}

module.exports = { createBoardService, parseBoard, normalizeStatus, VALID_STATUS };
