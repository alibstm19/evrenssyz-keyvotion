'use strict';

/*
 * Team builder (C-1) — plain-language project description -> roster proposal.
 *
 * The service has two halves:
 *   plan(input)  asks the model for a STRICT JSON roster; if the model is
 *                unavailable or its answer is unusable it DEGRADES to a
 *                deterministic Turkish-keyword plan instead of failing.
 *   apply(input) appends the proposed members to .team/roster.md through the
 *                roster service (append updates an existing code, never deletes).
 *
 * Design notes:
 *  - No dependency outside the Node standard library.
 *  - Models are only ever taken from the supplied pool; an id that is not in
 *    the pool is never invented. Empty pool -> model is ''.
 *  - `replace` is intentionally a no-op: silently deleting roster rows is not
 *    allowed. Only `append` is used.
 *  - createTeamBuilder({ providers, models, getProjectName, roster?, getProjectDir? })
 *    `roster` is the normal injection (see main.js); when omitted the service
 *    builds its own instance from `getProjectDir`.
 */

const { CODES, ok, fail } = require('../../shared/errors');
const { createRoster, isValidCode: rosterIsValidCode } = require('./roster');

const MIN_DESCRIPTION = 20;
const MIN_SIZE = 3;
const MAX_SIZE = 9;
const DEFAULT_SIZE = 6;
const MEMBER_MIN = 2;
const MEMBER_MAX = 9;
const TIMEOUT_MS = 60000;

/*
 * Keyword -> role table for the deterministic fallback plan.
 * `code` values satisfy CODE_PATTERN (2-6 chars, starts with a letter).
 */
const ROLE_DEFS = Object.freeze([
  {
    area: 'mobil',
    code: 'MOB',
    role: 'Mobil Geliştirici',
    responsibility: 'Mobil uygulama geliştirme ve cihaz uyumu.',
    pattern: /mobil|telefon|android|ios|tablet/i
  },
  {
    area: 'web',
    code: 'WEB',
    role: 'Web Geliştirici',
    responsibility: 'Web arayüzü ve sayfa geliştirme.',
    pattern: /web|site|sayfa|frontend|tarayıcı/i
  },
  {
    area: 'backend',
    code: 'API',
    role: 'Backend Geliştirici',
    responsibility: 'API, sunucu ve veri akışı.',
    pattern: /api|sunucu|backend|servis|endpoint/i
  },
  {
    area: 'tasarım',
    code: 'DSN',
    role: 'Arayüz Tasarımcısı',
    responsibility: 'Arayüz tasarımı, görsel dil ve kullanılabilirlik.',
    pattern: /tasar|arayüz|ui|ux|css|görsel|görünüm/i
  },
  {
    area: 'test',
    code: 'QA',
    role: 'Test Yazılımcısı',
    responsibility: 'Test planı, kalite kapıları ve hata doğrulama.',
    pattern: /test|kalite|qa|doğrula|hata/i
  },
  {
    area: 'veri',
    code: 'VERI',
    role: 'Veri Analisti',
    responsibility: 'Veri modeli, rapor ve ölçüm.',
    pattern: /veri|rapor|analiz|metrik|dashboard/i
  },
  {
    area: 'güvenlik',
    code: 'SEC',
    role: 'Güvenlik Uzmanı',
    responsibility: 'Güvenlik, yetki ve sır yönetimi.',
    pattern: /güvenlik|guvenlik|yetki|şifre|sır|auth/i
  },
  {
    area: 'devops',
    code: 'OPS',
    role: 'DevOps Mühendisi',
    responsibility: 'Derleme, dağıtım ve ortam otomasyonu.',
    pattern: /dağıtım|dagitim|devops|ortam|ci\/cd|yayın|yayin/i
  }
]);

/*
 * Fill order when the description matches fewer roles than the requested size
 * (and the default set when nothing matches).
 */
const DEFAULT_ORDER = ['web', 'backend', 'tasarım', 'test', 'devops', 'veri', 'güvenlik', 'mobil'];

const LEADER = Object.freeze({
  area: 'lider',
  code: 'LDR',
  role: 'Lider',
  responsibility: 'Hedefi belirler, ekibi yönetir, raporları denetler.'
});

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampSize(value) {
  if (!Number.isFinite(value)) return DEFAULT_SIZE;
  const n = Math.round(value);
  if (n < MIN_SIZE) return MIN_SIZE;
  if (n > MAX_SIZE) return MAX_SIZE;
  return n;
}

/**
 * Model pool normaliser. Accepts the models service envelope
 * ({ok:true,data:{pool:[...]}}), a plain array, or `{pool:[...]}`.
 * Entries may be strings or objects ({id|name, character, strengths, ...}).
 */
function normalizePool(input) {
  let list = [];
  if (Array.isArray(input)) {
    list = input;
  } else if (input && Array.isArray(input.pool)) {
    list = input.pool;
  } else if (input && input.ok === true && input.data && Array.isArray(input.data.pool)) {
    list = input.data.pool;
  }

  const out = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const id = item.trim();
      if (id) out.push({ id, haystack: id.toLowerCase() });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const id = str(item.id) || str(item.name) || str(item.modelID);
    if (!id) continue;
    const haystack = [
      id,
      str(item.name),
      str(item.character),
      str(item.strengths),
      str(item.providerID),
      str(item.provider)
    ].join(' ').toLowerCase();
    out.push({ id, haystack });
  }
  return out;
}

function hash(value) {
  let h = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    h = ((h * 31) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/*
 * Deterministic area -> model choice. The pool is the only source of truth:
 * when every hint misses, the whole pool is scanned in stable order.
 * `offset` lets the fallback spread different roles across the pool.
 */
function pickModelForArea(area, pool, offset = 0) {
  const list = normalizePool(pool);
  if (!list.length) return '';

  const key = String(area || '').toLowerCase();
  const hints = [];
  if (/tasar|ui|css|görsel|gorsel|web|front/.test(key)) {
    hints.push(/vision|image|görsel|gorsel|ui|design|multimodal|vl/i);
  }
  if (/test|qa|kalite/.test(key)) {
    hints.push(/reason|pro|max|thinking|general|code/i);
  }
  if (/mobil/.test(key)) {
    hints.push(/pro|general|code|flash|fast/i);
  }
  if (/backend|api|veri/.test(key)) {
    hints.push(/code|pro|reason|thinking|general/i);
  }
  if (/devops|güvenlik|guvenlik|ops|sec/.test(key)) {
    hints.push(/code|pro|general|fast|flash/i);
  }

  let candidates = list;
  for (const hint of hints) {
    const matched = list.filter((item) => hint.test(item.haystack));
    if (matched.length) { candidates = matched; break; }
  }

  const index = (hash(key) + Math.abs(Number(offset) || 0)) % candidates.length;
  return candidates[index].id;
}

/* Remove ```json fences and any leading/trailing prose, then parse. */
function parseModelJson(text) {
  if (text && typeof text === 'object') return text;
  if (typeof text !== 'string') return null;

  const unfenced = text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

function definitionFor(area) {
  return ROLE_DEFS.find((def) => def.area === area) || null;
}

/**
 * Deterministic proposal used whenever the model cannot supply one.
 * Returns { summary, members, notes } — never throws.
 */
function fallbackPlan(description, size, pool, notes) {
  const text = String(description || '');
  const limit = clampSize(size);
  const poolList = normalizePool(pool);

  const matched = ROLE_DEFS.filter((def) => def.pattern.test(text));
  const ordered = matched.concat(
    DEFAULT_ORDER.map(definitionFor).filter(Boolean)
  );

  const members = [{
    role: LEADER.role,
    code: LEADER.code,
    responsibility: LEADER.responsibility,
    area: LEADER.area
  }];
  const seen = new Set([LEADER.code]);

  for (const def of ordered) {
    if (members.length >= limit) break;
    if (!def || seen.has(def.code)) continue;
    seen.add(def.code);
    members.push({
      role: def.role,
      code: def.code,
      responsibility: def.responsibility,
      area: def.area
    });
  }

  // A plan always has a leader plus at least one teammate (min size is 3).
  for (const def of ROLE_DEFS) {
    if (members.length >= MIN_SIZE) break;
    if (seen.has(def.code)) continue;
    seen.add(def.code);
    members.push({
      role: def.role,
      code: def.code,
      responsibility: def.responsibility,
      area: def.area
    });
  }

  members.forEach((member, index) => {
    member.model = pickModelForArea(member.area, poolList, index);
  });

  const summary = text
    ? `Önerilen kadro: ${text.replace(/\s+/g, ' ').slice(0, 180)}`
    : 'Önerilen kadro';

  return {
    summary,
    members,
    notes: Array.isArray(notes) ? notes.slice() : []
  };
}

/**
 * Validates a parsed model proposal and normalises it.
 * @param {object} proposal
 * @param {{pool?: array|object, summaryFallback?: string}} [options]
 */
function validateProposal(proposal, options = {}) {
  if (!proposal || typeof proposal !== 'object') {
    return fail(CODES.PARSE, 'Model yanıtı çözümlenemedi.');
  }
  const raw = Array.isArray(proposal.members) ? proposal.members : null;
  if (!raw) {
    return fail(CODES.PARSE, 'Model yanıtında kadro listesi yok.');
  }
  if (raw.length < MEMBER_MIN || raw.length > MEMBER_MAX) {
    return fail(CODES.BAD_REQUEST, `Kadro ${MEMBER_MIN}-${MEMBER_MAX} üye olmalı; gelen: ${raw.length}.`);
  }

  const members = [];
  const seen = new Set();

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return fail(CODES.PARSE, 'Kadro üyesi nesne değil.');
    }
    const role = str(item.role);
    const responsibility = str(item.responsibility);
    const area = str(item.area);
    const code = str(item.code).toUpperCase();

    if (!role) return fail(CODES.PARSE, 'Kadro üyesinin rol adı boş.');
    if (!responsibility) return fail(CODES.PARSE, `"${role}" için sorumluluk boş.`);
    if (!rosterIsValidCode(code)) {
      return fail(CODES.BAD_REQUEST, `Geçersiz kadro kodu: "${item.code}". 2-6 karakter, harfle başlamalı.`);
    }
    if (seen.has(code)) {
      return fail(CODES.DUPLICATE_ROLE, `Kadroda ${code} kodu birden çok kez geçiyor.`);
    }
    seen.add(code);

    members.push({ role, code, responsibility, area, model: str(item.model) });
  }

  const leaders = members.filter((member) => member.code === 'LDR');
  if (leaders.length !== 1) {
    return fail(CODES.BAD_REQUEST, 'Kadroda tam olarak bir LDR (Lider) olmalı.');
  }

  const pool = normalizePool(options.pool);
  const allowed = new Set(pool.map((item) => item.id));
  members.forEach((member, index) => {
    if (!pool.length) {
      member.model = '';
      return;
    }
    member.model = allowed.has(member.model)
      ? member.model
      : pickModelForArea(member.area || member.role, pool, index);
  });

  const summary = str(proposal.summary)
    || str(options.summaryFallback)
    || `Kadro: ${members.map((member) => member.role).join(', ')}`;

  return ok({ summary, members });
}

function buildPrompt(description, size, pool, leaderCode, projectName) {
  const poolLines = pool.length
    ? pool.map((item) => `- ${item.id}`).join('\n')
    : '(havuz boş; model alanını boş bırak)';
  const leaderHint = leaderCode ? `İstenen lider kodu: ${leaderCode}. ` : '';
  const projectLine = projectName ? `Proje: ${projectName}. ` : '';

  return [
    'Sen bir yazılım ekibi kurgulayıcısısın. Aşağıdaki proje açıklaması için bir kadro öner.',
    `${projectLine}${leaderHint}Yalnızca GEÇERLİ JSON döndür; açıklama, markdown veya kod bloğu ekleme.`,
    'Şema:',
    '{"summary":"kısa Türkçe özet","members":[{"role":"Lider","code":"LDR","responsibility":"görev","area":"alan","model":"sağlayıcı/model"}]}',
    'Kurallar:',
    `- Üye sayısı 2 ile 9 arasında olmalı; hedef ${size} üye.`,
    '- Tam olarak bir "LDR" kodlu Lider üyesi olmalı.',
    '- Rol kodları ASCII büyük harf, 2-6 karakter, benzersiz olmalı.',
    '- Her üyenin role ve responsibility alanı boş olmamalı.',
    '- model alanı yalnızca aşağıdaki havuzdan seçilmeli.',
    'Model havuzu:',
    poolLines,
    'Proje açıklaması:',
    description
  ].join('\n');
}

/**
 * @param {{providers: object, models: object, getProjectName?: () => string,
 *          roster?: object, getProjectDir?: () => string}} deps
 */
function createTeamBuilder(deps) {
  const options = deps && typeof deps === 'object' ? deps : {};
  const providers = options.providers || null;
  const models = options.models || null;
  const getProjectName = typeof options.getProjectName === 'function'
    ? options.getProjectName
    : () => '';

  let roster = options.roster || null;
  if (!roster && typeof options.getProjectDir === 'function') {
    try {
      roster = createRoster({ getProjectDir: options.getProjectDir });
    } catch {
      roster = null;
    }
  }

  function safeProjectName() {
    try {
      return String(getProjectName() || '');
    } catch {
      return '';
    }
  }

  function safePool() {
    try {
      if (!models || typeof models.pool !== 'function') return [];
      return normalizePool(models.pool());
    } catch {
      return [];
    }
  }

  function isValidCode(code) {
    if (roster && typeof roster.isValidCode === 'function') {
      return roster.isValidCode(code);
    }
    return rosterIsValidCode(code);
  }

  async function plan(input) {
    const p = input && typeof input === 'object' ? input : {};
    const description = str(p.description);

    if (description.length < MIN_DESCRIPTION) {
      return fail(CODES.BAD_REQUEST, 'Projeyi en az birkaç cümleyle anlatın.');
    }

    const size = clampSize(Number.isFinite(p.size) ? p.size : DEFAULT_SIZE);
    const leaderCode = str(p.leaderCode);
    const pool = safePool();

    try {
      if (!providers || typeof providers.chat !== 'function') {
        return ok({
          source: 'fallback',
          ...fallbackPlan(description, size, pool, ['Sağlayıcı bağlı değil; yedek plan kullanıldı.'])
        });
      }

      const res = await providers.chat({
        messages: [
          { role: 'system', content: 'Yalnızca geçerli JSON döndüren bir kadro planlayıcısısın.' },
          { role: 'user', content: buildPrompt(description, size, pool, leaderCode, safeProjectName()) }
        ],
        temperature: 0.2,
        maxTokens: 1200,
        timeoutMs: TIMEOUT_MS
      });

      if (!res || !res.ok) {
        const reason = res && res.error && res.error.message
          ? res.error.message
          : 'Model yanıtı alınamadı.';
        return ok({
          source: 'fallback',
          ...fallbackPlan(description, size, pool, [`Model kullanılamadı: ${reason}`])
        });
      }

      const text = res.data && typeof res.data.text === 'string' ? res.data.text : '';
      const parsed = parseModelJson(text);
      const valid = validateProposal(parsed, {
        pool,
        summaryFallback: `Kadro: ${description.slice(0, 120)}`
      });

      if (!valid.ok) {
        return ok({
          source: 'fallback',
          ...fallbackPlan(description, size, pool, [`Model yanıtı geçersiz: ${valid.error.message}`])
        });
      }

      return ok({
        source: 'model',
        summary: valid.data.summary,
        members: valid.data.members,
        notes: []
      });
    } catch (error) {
      const message = error && error.message ? error.message : 'Bilinmeyen hata.';
      return ok({
        source: 'fallback',
        ...fallbackPlan(description, size, pool, [`Model çağrısı başarısız: ${message}`])
      });
    }
  }

  async function apply(input) {
    const p = input && typeof input === 'object' ? input : {};
    const members = Array.isArray(p.members) ? p.members : [];

    if (!members.length) {
      return fail(CODES.BAD_REQUEST, 'Uygulanacak kadro üyesi yok.');
    }
    if (!roster || typeof roster.append !== 'function') {
      return fail(CODES.INTERNAL, 'Kadro servisi bağlı değil.');
    }

    const seen = new Set();
    for (const member of members) {
      if (!member || typeof member !== 'object') {
        return fail(CODES.BAD_REQUEST, 'Kadro üyesi nesne değil.');
      }
      const code = str(member.code).toUpperCase();
      if (!isValidCode(code)) {
        return fail(CODES.BAD_REQUEST, `Geçersiz kadro kodu: "${member.code}". 2-6 karakter, harfle başlamalı.`);
      }
      if (seen.has(code)) {
        return fail(CODES.DUPLICATE_ROLE, `Kadroda ${code} kodu birden çok kez geçiyor.`);
      }
      seen.add(code);
    }

    /*
     * `replace` is accepted for forward compatibility but MUST NOT delete:
     * silently dropping roster rows is forbidden. Every member is appended;
     * append() updates an existing code in place.
     */
    const applied = [];
    const codes = [];

    for (const member of members) {
      const code = str(member.code).toUpperCase();
      const entry = {
        role: str(member.role) || code,
        code,
        responsibility: str(member.responsibility),
        model: str(member.model),
        sessionID: null
      };

      let res;
      try {
        res = await roster.append(entry);
      } catch (error) {
        const message = error && error.message ? error.message : 'Kadro yazılamadı.';
        return fail(CODES.INTERNAL, message, {
          detail: { applied, codes, failed: code }
        });
      }

      if (!res || !res.ok) {
        const code_ = res && res.error ? res.error.code : CODES.INTERNAL;
        const message = res && res.error ? res.error.message : 'Kadro yazılamadı.';
        return fail(code_, message, {
          detail: { applied, codes, failed: code }
        });
      }

      applied.push(code);
      codes.push(code);
    }

    let entries = [];
    if (typeof roster.read === 'function') {
      try {
        const current = await roster.read();
        if (current && current.ok && current.data && Array.isArray(current.data.entries)) {
          entries = current.data.entries;
        }
      } catch {
        entries = [];
      }
    }

    return ok({ applied, codes, entries });
  }

  return {
    plan,
    apply,
    _internals: {
      fallbackPlan,
      parseModelJson,
      pickModelForArea,
      validateProposal
    }
  };
}

module.exports = {
  createTeamBuilder,
  fallbackPlan,
  parseModelJson,
  pickModelForArea,
  validateProposal,
  normalizePool
};
