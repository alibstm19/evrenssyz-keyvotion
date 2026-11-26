'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ok } = require('../../shared/errors');
const { parseReport } = require('./messages');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MESSAGE_SCAN_LIMIT = 50;

/**
 * Dosyanin KENDI basligi `RAPOR T-xxx` mi?
 *
 * Yedek tarama (`.team/log/*.md`) serbest metin dosyalarini da gorur; bunlarin
 * icinde alintilanmis bir rapor blogu olabilir (or. `decisions.md`). Boyle bir
 * dosyayi rapor saymak yanlis pozitif uretir. Bu yuzden ilk bos olmayan satir
 * `RAPOR T-xxx` basligi olmak zorunda.
 *
 * @param {string} text
 * @returns {boolean}
 */
function startsWithReportTitle(text) {
  if (typeof text !== 'string') return false;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    return /^#{0,6}\s*\**\s*RAPOR\s+T-\d{3}/i.test(trimmed);
  }
  return false;
}

/**
 * Dosya tabanli raporlar: `.team/log/raporlar/*.md` ve `.team/log/*.md`.
 * Yalnizca `RAPOR T-xxx` basligi tasiyan dosyalar kayda girer — uydurma yok.
 * Yedek klasorde baslik dosyanin KENDI ilk satiri olmak zorunda; aksi halde
 * alintili rapor bloklari rapor sanilir.
 *
 * @param {string} projectDir
 * @returns {{items: object[], dir: string, dirExists: boolean}}
 */
function readReportFiles(projectDir) {
  const logDir = path.join(projectDir, '.team', 'log');
  const dir = path.join(logDir, 'raporlar');
  const items = [];

  let dirExists = false;
  try {
    dirExists = fs.statSync(dir).isDirectory();
  } catch {
    dirExists = false;
  }

  const scan = (fromDir, idPrefix, requireTitle) => {
    let names = [];
    try {
      names = fs.readdirSync(fromDir);
    } catch {
      return;
    }

    for (const name of names) {
      if (!name.toLowerCase().endsWith('.md')) continue;
      const full = path.join(fromDir, name);

      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;

      let text = '';
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }

      if (requireTitle && !startsWithReportTitle(text)) continue;

      const parsed = parseReport(text);
      if (!parsed) continue;

      items.push({
        ...parsed,
        id: `${idPrefix}:${name}`,
        sessionID: null,
        messageID: null,
        at: null,
        source: 'file',
        file: name
      });
    }
  };

  scan(dir, 'file', false);
  scan(logDir, 'log', true);

  return { items, dir, dirExists };
}

/**
 * .team/log/decisions.md dosyasindan lider dongulerini ayiklar.
 * 
 * @param {string} projectDir
 * @returns {{cycles: object[], error?: string}}
 */
function readLeaderCycles(projectDir) {
  const filePath = path.join(projectDir, '.team', 'log', 'decisions.md');
  try {
    if (!fs.existsSync(filePath)) return { cycles: [] };
    const text = fs.readFileSync(filePath, 'utf8');
    
    const cleanStr = s => s ? s.replace(/\*\*|`/g, '').trim() : null;

    const lines = text.split(/\r?\n/);
    const cycles = [];
    const priorityKeywords = ['FİKİR', 'Değerlendirme', 'Ders', 'Not'];
    
    let currentCycle = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) {
        if (currentCycle) cycles.push(currentCycle);
        
        const heading = trimmed.slice(3).trim();
        const dateMatch = heading.match(/^(\d{4}-\d{2}-\d{2})/);
        const at = dateMatch ? dateMatch[1] : null;
        const titleParts = heading.split(' — ');
        const title = cleanStr(titleParts.length > 1 ? titleParts.slice(1).join(' — ').trim() : heading);
        
        currentCycle = { at, title, status: null, intent: null, idea: null, _body: [] };
      } else if (currentCycle) {
        currentCycle._body.push(line);
      }
    }
    if (currentCycle) cycles.push(currentCycle);
    
    const processed = cycles.map(c => {
      const body = c._body.join('\n');
      
      const extractField = (keywords) => {
        const bodyLines = body.split('\n');
        for (const line of bodyLines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          for (const kw of keywords) {
            if (trimmed.includes(kw)) {
              const lastColon = trimmed.lastIndexOf(':');
              if (lastColon !== -1) return cleanStr(trimmed.slice(lastColon + 1));
            }
          }
        }
        return null;
      };

      const status = extractField(['Durum', 'Denetim', 'Lider kararı']);
      const idea = extractField(priorityKeywords);
      
      let intent = null;
      const bodyLines = body.split('\n');
      for (const line of bodyLines) {
        const trimmed = line.trim();
        if (/^[-*]\s+/.test(trimmed)) {
          intent = cleanStr(trimmed.slice(1).trim()).slice(0, 180);
          break;
        }
      }
      
      return {
        at: c.at,
        title: c.title,
        status,
        intent,
        idea,
        derived: (status === null && idea === null)
      };
    });
    
    return {
      cycles: processed.reverse().slice(0, 20)
    };
  } catch (e) {
    return { cycles: [], error: 'E_PARSE' };
  }
}

function createReportsService(deps) {
  const sessions = deps.sessions;
  const messages = deps.messages;
  const getProjectDir = deps.getProjectDir;

  async function list(filters = {}) {
    const projectDir = getProjectDir();
    const files = readReportFiles(projectDir);
    const lcRes = readLeaderCycles(projectDir);

    let messageItems = [];
    let offline = false;
    let offlineReason = null;

    const teamRes = await sessions.list();
    if (teamRes.ok) {
      const live = teamRes.data.sessions.filter((s) => s.id);
      for (const session of live) {
        const res = await messages.reports(session.id, MESSAGE_SCAN_LIMIT);
        if (!res.ok) continue;
        for (const report of res.data.reports) {
          messageItems.push({
            ...report,
            role: report.role || session.role,
            sessionRole: session.role,
            source: 'message'
          });
        }
      }
    } else {
      offline = true;
      offlineReason = { code: teamRes.error.code, message: teamRes.error.message };
      messageItems = [];
    }

    const fileKeys = new Set(files.items.map((r) => `${r.taskId}|${r.role}`));
    const merged = messageItems
      .filter((r) => !fileKeys.has(`${r.taskId}|${r.role}`))
      .concat(files.items);

    const filtered = merged.filter((entry) => {
      if (filters.role && entry.role !== filters.role) return false;
      if (filters.status && entry.status !== filters.status) return false;
      if (filters.taskId && entry.taskId !== String(filters.taskId).toUpperCase()) return false;
      return true;
    });

    const seen = new Set();
    const unique = filtered.filter((entry) => {
      const key = [entry.taskId, entry.role, entry.status, String(entry.ozet || '').slice(0, 80)].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => {
      const atA = a.at ? Date.parse(a.at) : 0;
      const atB = b.at ? Date.parse(b.at) : 0;
      if (atA !== atB) return atB - atA;
      return String(a.taskId || '').localeCompare(String(b.taskId || ''));
    });

    const limit = Number.isFinite(Number(filters.limit))
      ? Math.max(1, Math.min(Number(filters.limit), MAX_LIMIT))
      : DEFAULT_LIMIT;
    const page = unique.slice(0, limit);

    return ok({
      reports: page,
      items: page,
      leaderCycles: lcRes.cycles || [],
      counts: {
        total: unique.length,
        tamam: unique.filter((r) => r.status === 'TAMAM').length,
        kismi: unique.filter((r) => r.status === 'KISMİ' || r.status === 'KISMI').length,
        bloke: unique.filter((r) => r.status === 'BLOKE').length
      },
      offline,
      offlineReason,
      scannedAt: new Date().toISOString(),
      sources: { message: messageItems.length, file: files.items.length },
      reportDir: files.dir,
      reportDirExists: files.dirExists
    });
  }

  return { list, readReportFiles };
}

module.exports = {
  createReportsService,
  readReportFiles,
  readLeaderCycles,
  startsWithReportTitle,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MESSAGE_SCAN_LIMIT
};
