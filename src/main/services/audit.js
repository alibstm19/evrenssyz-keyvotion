'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 5 * 1024 * 1024;
const ROTATE_KEEP = 3;

/**
 * Denetim gunlugu: logs/audit.jsonl
 * YALNIZ ust veri yazar; emir/rapor METNI ve sir YAZILMAZ (API-30).
 *
 * @param {{logDir: string}} options
 */
function createAuditLog(options) {
  const logDir = options.logDir;
  const file = path.join(logDir, 'audit.jsonl');

  function rotateIfNeeded() {
    try {
      const stat = fs.statSync(file);
      if (stat.size < MAX_BYTES) return;
      for (let i = ROTATE_KEEP - 1; i >= 1; i -= 1) {
        const from = `${file}.${i}`;
        const to = `${file}.${i + 1}`;
        if (fs.existsSync(from)) {
          try { fs.renameSync(from, to); } catch { /* yoksay */ }
        }
      }
      try { fs.renameSync(file, `${file}.1`); } catch { /* yoksay */ }
    } catch {
      // Dosya yoksa dondurme gerekmez.
    }
  }

  /**
   * @param {{op: string, code: string, target?: string|null, status?: number|null,
   *          idempotencyKey?: string|null, at?: string, extra?: object}} entry
   */
  function append(entry) {
    const line = {
      at: entry.at || new Date().toISOString(),
      op: entry.op,
      code: entry.code,
      target: entry.target === undefined ? null : entry.target,
      status: entry.status === undefined ? null : entry.status,
      idempotencyKey: entry.idempotencyKey === undefined ? null : entry.idempotencyKey
    };
    if (entry.extra && typeof entry.extra === 'object') {
      Object.assign(line, entry.extra);
    }

    try {
      fs.mkdirSync(logDir, { recursive: true });
      rotateIfNeeded();
      fs.appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8');
    } catch {
      // Denetim yazilamazsa is akisini durdurmuyoruz; sessiz gec.
    }
    return line;
  }

  function readTail(limit = 50) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (!raw) return [];
      return raw.split(/\r?\n/).slice(-limit).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  return { append, readTail, file };
}

module.exports = { createAuditLog, MAX_BYTES };
