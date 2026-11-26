'use strict';

const { CODES, ok, fail } = require('../../shared/errors');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const TEXT_MAX = 4000;

const REPORT_LABELS = [
  { key: 'role', pattern: /^rol$/i },
  { key: 'status', pattern: /^durum$/i },
  { key: 'ozet', pattern: /^(özet|ozet)$/i },
  { key: 'kanit', pattern: /^(kanıt|kanit)$/i },
  { key: 'files', pattern: /^(değişen dosyalar|degisen dosyalar)$/i },
  { key: 'risk', pattern: /^(risk\s*\/\s*not|risk\s*\/\s*notlar|risk)$/i },
  { key: 'karar', pattern: /^(karar gereken)$/i }
];

const STATUS_MAP = new Map([
  ['TAMAM', 'TAMAM'],
  ['KISMI', 'KISMİ'],
  ['KISMİ', 'KISMİ'],
  ['BLOKE', 'BLOKE']
]);

/* Bilinen rol kodlari. Tek satira sikistirilmis raporlarda "Rol:" alanina
 * tum cumle duser; bu yuzden rol metninden gercek kodu cikariyoruz. */
const KNOWN_ROLES = ['LDR', 'YM', 'ARC', 'DEV', 'DSN', 'QA', 'OPS', 'DEVOPS'];

function normalizeRole(value) {
  const text = String(value || '');
  if (!text) return null;
  const upper = text.toUpperCase().replace(/İ/g, 'I');
  const found = KNOWN_ROLES.find((code) => new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`).test(upper));
  if (found) return found === 'DEVOPS' ? 'OPS' : found;
  const letters = upper.replace(/[^A-Z]/g, '');
  return letters ? letters.slice(0, 12) : null;
}

/** Durum alani bos kaldiysa ham metinde `DURUM: X` ara (tek satir raporlar). */
function statusFromText(text) {
  const m = String(text || '').toUpperCase().replace(/İ/g, 'I').match(/DURUM\s*:?\s*(TAMAM|KISMI|BLOKE)/);
  return m ? normalizeStatus(m[1]) : null;
}

const INLINE_LABEL_RE = /(Rol|Durum|Özet|Ozet|Kanıt|Kanit|Değişen dosyalar|Degisen dosyalar|Risk|Karar gereken)\s*:\s*/gi;

/**
 * Tek satira sikistirilmis raporlar icin: metindeki her etiketi bulur ve
 * degerini bir sonraki etikete kadar alir. Satir bazli ayristirma bu
 * durumda alan acamaz (satir basinda baska metin var).
 */
function scrapeInline(text) {
  const src = String(text || '');
  const hits = [...src.matchAll(INLINE_LABEL_RE)];
  const out = {};
  const clean = (v) => v.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < hits.length; i += 1) {
    const key = matchLabel(hits[i][1]);
    if (!key || out[key]) continue;
    const start = hits[i].index + hits[i][0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : Math.min(src.length, start + TEXT_MAX);
    const value = clean(src.slice(start, end));
    if (value) out[key] = value;
  }
  return out;
}

function truncate(text, max) {
  if (typeof text !== 'string') return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeStatus(value) {
  if (!value) return null;
  // Savunmali: eski bozuk raporlarda alan cok satirli gelmis olabilir.
  // Durum her zaman ilk satirda yazar.
  const first = String(value).split('\n')[0];
  const key = first.toUpperCase().replace(/[İI]/g, 'I').trim();
  const normalized = key === 'KISMI' ? 'KISMI' : key;
  if (normalized === 'KISMI') return 'KISMİ';
  return STATUS_MAP.get(normalized) || null;
}

function splitFiles(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\n]|·/)
    .map((item) => item.replace(/^[-*•\s]+/, '').replace(/`/g, '').trim())
    .filter(Boolean);
}

/** `## Özet` / `**Özet**` / `Özet:` -> etiket anahtari (bilinmiyorsa null). */
function matchLabel(raw) {
  const label = String(raw || '')
    .replace(/[*_`#]/g, '')
    .replace(/\s*:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label || label.length > 32) return null;
  const found = REPORT_LABELS.find((item) => item.pattern.test(label));
  return found ? found.key : null;
}

/*
 * Uc etiket bicimi de ayni anahtara baglanir:
 *   1) `## Özet` / `### Özet` / `# Özet`      (markdown baslik)
 *   2) `**Özet**` / `**Özet:**`               (kalin metin, degeri ayni satirda olabilir)
 *   3) `Özet: ...` / `Özet : ...`             (satir ici)
 *
 * Baslik satiri ICERIGE EKLENMEZ; yalnizca `current` alanini degistirir.
 */
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const BOLD_RE = /^\s*\*\*(.+?)\*\*\s*:?\s*(.*)$/;
const INLINE_RE = /^\s*([^:]{2,32}):\s*(.*)$/;

/**
 * RAPOR metnini alanlara ayirir (protocols.md §2).
 * @param {string} text
 * @returns {null | {taskId, role, status, ozet, kanit, files, risk, karar, raw}}
 */
function parseReport(text) {
  if (typeof text !== 'string') return null;

  const head = text.match(/RAPOR\s+(T-\d{3}[A-Za-z0-9-]*)/i);
  if (!head) return null;

  const taskId = head[1].toUpperCase();
  const body = text.slice(head.index);

  const lines = body.split(/\r?\n/);
  const fields = {};
  let current = null;

  const open = (key, inlineValue) => {
    current = key;
    if (!fields[current]) fields[current] = [];
    if (inlineValue) fields[current].push(inlineValue.trim());
  };

  for (const line of lines) {
    // 1) markdown baslik: `## Özet` (+ `## Özet: metin`)
    const heading = line.match(HEADING_RE);
    if (heading) {
      const parts = heading[1].split(/:\s*/);
      const key = matchLabel(parts[0]);
      if (key) {
        open(key, parts.length > 1 ? parts.slice(1).join(': ') : '');
        continue;
      }
    }

    // 2) kalin etiket: `**Özet**`, `**Özet:** deger`
    const bold = line.match(BOLD_RE);
    if (bold) {
      const key = matchLabel(bold[1]);
      if (key) {
        open(key, bold[2]);
        continue;
      }
    }

    // 3) satir ici: `Özet: metin` — yalniz BILINEN etiketler alan acar.
    //    Duz metindeki iki nokta ("yazıldı: docs/...") alan ACMAZ.
    const inline = line.match(INLINE_RE);
    if (inline) {
      const key = matchLabel(inline[1]);
      if (key) {
        open(key, inline[2]);
        continue;
      }
    }

    if (current) fields[current].push(line);
  }

  const joined = (key) => {
    if (!fields[key]) return '';
    return fields[key].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  const cells = scrapeInline(body);
  const pick = (key) => joined(key) || cells[key] || '';
  const role = normalizeRole(pick('role'));
  const status = normalizeStatus(pick('status')) || statusFromText(body);
  return {
    taskId,
    role,
    status,
    ozet: pick('ozet'),
    kanit: pick('kanit'),
    files: splitFiles(pick('files')),
    risk: pick('risk'),
    karar: pick('karar'),
    raw: truncate(body, TEXT_MAX)
  };
}

/** Ham mesaj -> beyaz listeli DTO (§4.3). */
function mapMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const info = raw.info && typeof raw.info === 'object' ? raw.info : raw;
  const parts = Array.isArray(raw.parts) ? raw.parts : (Array.isArray(info.parts) ? info.parts : []);
  const time = info.time || raw.time || {};

  let text = '';
  let toolName = null;
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && typeof part.text === 'string') {
      text += part.text;
    } else if (part.type === 'tool' && !toolName) {
      toolName = typeof part.tool === 'string' ? part.tool : (part.name || 'tool');
    }
  }
  if (!text && typeof info.text === 'string') text = info.text;
  if (!text && typeof raw.text === 'string') text = raw.text;

  const role = typeof info.role === 'string' ? info.role : (typeof raw.role === 'string' ? raw.role : '');
  let kind = 'system';
  if (role === 'user') kind = 'user';
  else if (role === 'assistant') kind = 'assistant';
  else if (toolName) kind = 'tool';

  const created = typeof time.created === 'number' ? time.created : null;
  const at = created ? new Date(created).toISOString() : new Date(0).toISOString();

  return {
    id: typeof info.id === 'string' ? info.id : (typeof raw.id === 'string' ? raw.id : null),
    kind,
    at,
    text: truncate(text, TEXT_MAX),
    toolName,

    // Renderer uyum alani: kind ile ayni deger (UI-04 mesaj semasi).
    role: kind
  };
}

/**
 * @param {{http: object}} deps
 */
function createMessagesService(deps) {
  const http = deps.http;

  /** Son N mesaj (en fazla 50, API-18). */
  async function list(sessionID, limit) {
    if (!sessionID) return fail(CODES.BAD_REQUEST, 'Seans kimliği gerekli.');

    const requested = Number.isFinite(Number(limit)) ? Number(limit) : DEFAULT_LIMIT;
    const capped = Math.min(Math.max(requested, 1), MAX_LIMIT);

    const res = await http.get(
      `/api/session/${encodeURIComponent(sessionID)}/message?limit=${capped}`
    );
    if (!res.ok) return res;

    const rawList = res.data && Array.isArray(res.data.data) ? res.data.data : [];
    const messages = rawList.map(mapMessage).filter(Boolean).slice(-capped);

    return ok({ sessionID, limit: capped, messages });
  }

  /** Mesajlardan RAPOR'lari cikarir (F5 icin). */
  async function reports(sessionID, limit) {
    const res = await list(sessionID, limit);
    if (!res.ok) return res;
    const found = [];
    for (const message of res.data.messages) {
      const report = parseReport(message.text);
      if (report) {
        found.push({
          ...report,
          id: `${sessionID}:${message.id || found.length}`,
          sessionID,
          messageID: message.id,
          at: message.at,
          kind: message.kind
        });
      }
    }
    return ok({ sessionID, reports: found });
  }

  return { list, reports, parseReport, mapMessage };
}

module.exports = {
  createMessagesService,
  parseReport,
  mapMessage,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
