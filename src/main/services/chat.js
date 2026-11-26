'use strict';

/**
 * Dogrudan model sohbeti (T5-2).
 *
 * NEDEN: Konsol simdiye kadar yalnizca yerel OpenCode sunucusunun seanslarina
 * mesaj gonderebiliyordu. Sunucu kapaliysa (ya da parola yoksa) sohbet ekrani
 * olu kaliyordu. Bu servis kullanicinin KENDI saglayicisini (Evren Ekibim)
 * dogrudan kullanir; coklu anahtar failover'i providers uzerinden gelir.
 *
 * KURALLAR
 *  - Ag cagrisi YAPMAZ (API-01): providers.runRequest -> http.requestExternal.
 *  - Anahtar degeri hicbir alana yazilmaz; yalniz mask doner (API-03).
 *  - Konusmalar userData/conversations.json icinde tutulur (sir degil, icerik).
 *  - Her ajan istemine paylasilan hafiza + etkin beceriler + izin ozeti eklenir.
 */

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

const FILE = 'conversations.json';
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES = 200;
const TEXT_MAX = 8000;
const TITLE_MAX = 60;

const ROLES = Object.freeze(['LDR', 'YM', 'ARC', 'DEV', 'DSN', 'QA', 'OPS']);

const ROLE_PERSONA = {
  LDR: 'Sen ekibin liderisin. Hedefi netleştirir, kararı sen verirsin; kanıtsız "tamam" demezsin.',
  YM: 'Sen proje yöneticisisin. Liderin hedefini görev emirlerine böler, ekibi yönetir, raporları derlersin.',
  ARC: 'Sen mimarsın. Teknik planı ve tasarımı yaparsın; kod yazmazsın. Riski ve sınırı açıkça yazarsın.',
  DEV: 'Sen yazılımcısın. Özellik kodunu ve düzeltmeyi sen yazarsın. Çalıştırmadığın şeyi bitmiş saymazsın.',
  DSN: 'Sen tasarımcısın. Arayüz, UX ve görsel doğrulama senin işin. Tokenlara sadık kalırsın.',
  QA: 'Sen test yazılımcısısın. Test yazar, kalite kapılarını işletirsin; ürün kodunu düzeltmezsin.',
  OPS: 'Sen DevOps’sun. Otomasyon, derleme, sürüm ve altyapı senin işin. Yıkıcı işlem için onay istersin.'
};

function makeId() {
  return `cvs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function clip(text, max) {
  if (typeof text !== 'string') return '';
  return text.length > max ? text.slice(0, max) : text;
}

function safeTitle(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : (line || 'Yeni konuşma');
}

/**
 * @param {{baseDir: string, providers: object, memory?: object, skills?: object,
 *          permissions?: object, audit?: object, getProjectName?: () => string}} options
 */
function createChatService(options) {
  const baseDir = options.baseDir;
  const providers = options.providers;
  const memory = options.memory || null;
  const skills = options.skills || null;
  const permissions = options.permissions || null;
  const audit = options.audit || { append() {} };
  const getProjectName = options.getProjectName || (() => '');

  const filePath = path.join(baseDir, FILE);

  /* ------------------------------------------------------------ depolama */

  function defaults() {
    return { conversations: [], updatedAt: nowISO() };
  }

  function load() {
    try {
      if (!fs.existsSync(filePath)) return defaults();
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.conversations)) return defaults();
      return parsed;
    } catch {
      /* Bozuk dosya sohbeti kilitlemesin: yedekleyip temiz basla. */
      try {
        if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.broken`);
      } catch { /* yoksay */ }
      return defaults();
    }
  }

  function persist(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    const payload = { ...data, updatedAt: nowISO() };
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, filePath);
  }

  function summary(c) {
    const last = c.messages.length ? c.messages[c.messages.length - 1] : null;
    return {
      id: c.id,
      title: c.title,
      role: c.role,
      model: c.model,
      providerId: c.providerId || null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      count: c.messages.length,
      lastText: last ? clip(last.content, 80) : '',
      lastRole: last ? last.role : null
    };
  }

  function findByID(data, id) {
    return data.conversations.find((c) => c.id === id) || null;
  }

  /* ------------------------------------------------------------ baglam */

  function memoryBlock(limit) {
    if (!memory) return '';
    try {
      const res = memory.context({ limit: limit || 12 });
      if (res && res.ok && res.data && res.data.count) return res.data.block;
    } catch { /* hafiza okunamadi — sohbet devam eder */ }
    return '';
  }

  function skillLines() {
    if (!skills) return [];
    try {
      const res = skills.list();
      if (!res || !res.ok) return [];
      return (res.data.skills || [])
        .filter((s) => s.enabled)
        .map((s) => `- ${s.name}: ${clip(s.instructions || s.description || '', 240)}`);
    } catch {
      return [];
    }
  }

  function permissionSummary(role) {
    if (!permissions) return '';
    try {
      const res = permissions.get();
      if (!res || !res.ok) return '';
      const row = (res.data.matrix || {})[role] || {};
      const allowed = Object.entries(row).filter(([, v]) => v).map(([k]) => k);
      return allowed.length ? allowed.join(', ') : '';
    } catch {
      return '';
    }
  }

  function buildSystem(conversation) {
    const role = conversation.role || 'LDR';
    const parts = [
      'Sen Keyvotion Console içinde çalışan bir ajansın.',
      ROLE_PERSONA[role] || ROLE_PERSONA.LDR,
      '',
      'Kurallar:',
      '- Türkçe, kısa ve net yaz. Kod/dosya adları İngilizce.',
      '- Kanıtsız "tamam" deme; ölçüm yoksa ölçüm istendiğini söyle.',
      '- Kapsam dışına çıkma; büyük işi öner, kendin başlatma.',
      '- Sır (anahtar, parola, token) yazma.',
      ''
    ];

    const project = getProjectName();
    if (project) parts.push(`Aktif proje: ${project}`, '');

    const mem = memoryBlock(12);
    if (mem) parts.push(mem, '');

    const sk = skillLines();
    if (sk.length) {
      parts.push('## Etkin beceriler', ...sk, '');
    }

    const perm = permissionSummary(role);
    if (perm) {
      parts.push(`## Bu rolün izinleri`, perm, '');
    }

    parts.push('Kullanıcı seninle doğrudan konuşuyor. Yanıtı yalnızca kullanıcıya ver.');
    return parts.join('\n');
  }

  /** Son N mesaji OpenAI bicimine cevir (sistem haric). */
  function history(conversation, limit) {
    const msgs = conversation.messages.slice(-(limit || 20));
    const out = [];
    for (const m of msgs) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      out.push({ role: m.role, content: m.content });
    }
    return out;
  }

  /* --------------------------------------------------------------- CRUD */

  function list(input) {
    const p = input && typeof input === 'object' ? input : {};
    const data = load();
    const items = data.conversations
      .slice()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(summary);
    return ok({
      conversations: items,
      total: items.length,
      path: filePath,
      roleFilter: p.role || null
    });
  }

  function get(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (!p.id) return fail(CODES.BAD_REQUEST, 'Konuşma kimliği gerekli.');
    const data = load();
    const conv = findByID(data, p.id);
    if (!conv) return fail(CODES.NOT_FOUND, 'Konuşma bulunamadı.');
    return ok({
      conversation: conv,
      messages: conv.messages,
      total: conv.messages.length
    });
  }

  function create(input) {
    const p = input && typeof input === 'object' ? input : {};
    const role = ROLES.includes(p.role) ? p.role : 'LDR';
    const all = providers && providers.list ? providers.list() : null;
    const listProviders = (all && all.ok && all.data.providers) || [];
    const provider = (p.providerId && listProviders.find((x) => x.id === p.providerId))
      || (providers && providers.defaultProvider ? providers.defaultProvider() : null);
    const model = typeof p.model === 'string' && p.model.trim()
      ? p.model.trim()
      : (provider && provider.models && provider.models[0]) || '';

    if (!provider) {
      return fail(CODES.NOT_FOUND, 'Sağlayıcı yok. Önce Sağlayıcılar ekranından ekleyin.');
    }

    const data = load();
    const conv = {
      id: makeId(),
      title: safeTitle(p.title || 'Yeni konuşma'),
      role,
      model,
      providerId: provider.id,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      messages: []
    };
    data.conversations.unshift(conv);
    if (data.conversations.length > MAX_CONVERSATIONS) {
      data.conversations.length = MAX_CONVERSATIONS;
    }
    persist(data);

    audit.append({
      op: 'chat.create',
      code: CODES.OK,
      target: conv.id,
      extra: { role, model }
    });

    return ok({ conversation: conv, conversations: list().data.conversations });
  }

  function remove(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (!p.id) return fail(CODES.BAD_REQUEST, 'Konuşma kimliği gerekli.');
    const data = load();
    const before = data.conversations.length;
    data.conversations = data.conversations.filter((c) => c.id !== p.id);
    if (data.conversations.length === before) return fail(CODES.NOT_FOUND, 'Konuşma bulunamadı.');
    persist(data);
    return ok({ removed: p.id, conversations: list().data.conversations });
  }

  function rename(input) {
    const p = input && typeof input === 'object' ? input : {};
    const data = load();
    const conv = findByID(data, p.id);
    if (!conv) return fail(CODES.NOT_FOUND, 'Konuşma bulunamadı.');
    conv.title = safeTitle(p.title || conv.title);
    conv.updatedAt = nowISO();
    persist(data);
    return ok({ conversation: conv });
  }

  /* --------------------------------------------------------------- gonderi */

  /** OpenAI uyumlu yanittan metni cikar (bicim degisirse patlamaz). */
  function extractContent(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null;
    if (choice) {
      const msg = choice.message || choice.delta || null;
      if (msg) {
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
          return msg.content
            .map((part) => (typeof part === 'string' ? part : (part && part.text) || ''))
            .join('');
        }
      }
      if (typeof choice.text === 'string') return choice.text;
    }
    if (typeof parsed.output_text === 'string') return parsed.output_text;
    if (Array.isArray(parsed.content)) {
      return parsed.content.map((c) => (c && c.text) || '').join('');
    }
    return null;
  }

  function extractUsage(parsed) {
    const u = parsed && parsed.usage;
    if (!u || typeof u !== 'object') return null;
    return {
      prompt: Number(u.prompt_tokens || 0) || null,
      completion: Number(u.completion_tokens || 0) || null,
      total: Number(u.total_tokens || 0) || null
    };
  }

  /**
   * Mesaji gonderir. Renderer'dan gelen cagri confirmToken ile kapilidir;
   * uzak (telefon) istemci main icinden dogrudan cagirir.
   */
  async function send(input) {
    const p = input && typeof input === 'object' ? input : {};
    const text = typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) return fail(CODES.BAD_REQUEST, 'Mesaj boş.');
    if (text.length > TEXT_MAX) {
      return fail(CODES.BAD_REQUEST, `Mesaj çok uzun (en fazla ${TEXT_MAX} karakter).`);
    }

    const data = load();
    let conv = p.conversationId ? findByID(data, p.conversationId) : null;
    if (!conv) {
      const created = create({
        role: p.role,
        model: p.model,
        title: text,
        providerId: p.providerId
      });
      if (!created.ok) return created;
      conv = created.data.conversation;
      /* create() diski yazdi; bellekteki kopyayi tazele. */
      data.conversations = load().conversations;
      conv = findByID(data, conv.id);
    }

    if (p.providerId) conv.providerId = p.providerId;
    if (p.model) conv.model = p.model;

    const userMessage = {
      id: `msg_${Date.now().toString(36)}u`,
      role: 'user',
      content: text,
      at: nowISO()
    };
    conv.messages.push(userMessage);
    conv.updatedAt = nowISO();
    if (conv.title === 'Yeni konuşma') conv.title = safeTitle(text);
    if (conv.messages.length > MAX_MESSAGES) {
      conv.messages = conv.messages.slice(-MAX_MESSAGES);
    }
    /* Kullanici mesaji hemen kalici olsun ki hata olsa da kaybolmasin. */
    persist(data);

    const body = {
      model: conv.model,
      messages: [
        { role: 'system', content: buildSystem(conv) },
        ...history(conv, 20)
      ],
      temperature: typeof p.temperature === 'number' ? p.temperature : 0.4,
      stream: false
    };

    const started = Date.now();
    let res;
    try {
      res = await providers.runRequest(conv.providerId || null, {
        method: 'POST',
        pathName: '/chat/completions',
        body,
        rawBody: true,
        timeoutMs: 120000
      });
    } catch (error) {
      res = fail(CODES.INTERNAL, 'Sohbet isteği çalıştırılamadı.', {
        detail: { code: String((error && error.message) || 'unknown') }
      });
    }
    const latency = Date.now() - started;

    if (!res.ok) {
      /* Basarisiz denemede de konusma guncel kalsin (yeniden denenebilir). */
      audit.append({
        op: 'chat.send',
        code: res.error.code,
        target: conv.id,
        extra: { latency, attempts: (res.error.detail && res.error.detail.attempts || []).length }
      });
      return fail(res.error.code, res.error.message, {
        status: res.error.status,
        retryable: res.error.retryable,
        detail: {
          conversationId: conv.id,
          userMessage,
          attempts: (res.error.detail && res.error.detail.attempts) || [],
          tried: (res.error.detail && res.error.detail.tried) || []
        }
      });
    }

    let parsed = null;
    try {
      parsed = res.data.body ? JSON.parse(res.data.body) : null;
    } catch {
      return fail(CODES.PARSE, 'Model yanıtı okunamadı.', {
        detail: { conversationId: conv.id, preview: clip(res.data.body || '', 160) }
      });
    }

    const content = extractContent(parsed);
    if (!content) {
      return fail(CODES.PARSE, 'Model boş yanıt döndürdü.', {
        detail: { conversationId: conv.id }
      });
    }

    const assistant = {
      id: `msg_${Date.now().toString(36)}a`,
      role: 'assistant',
      content: clip(content, TEXT_MAX * 2),
      at: nowISO(),
      meta: {
        model: conv.model,
        providerId: res.data.providerId,
        providerName: res.data.providerName,
        mask: res.data.mask,
        latency,
        attempts: res.data.attempts.length,
        usage: extractUsage(parsed)
      }
    };
    conv.messages.push(assistant);
    conv.updatedAt = nowISO();
    if (conv.messages.length > MAX_MESSAGES) {
      conv.messages = conv.messages.slice(-MAX_MESSAGES);
    }
    persist(data);

    audit.append({
      op: 'chat.send',
      code: CODES.OK,
      target: conv.id,
      extra: {
        latency,
        model: conv.model,
        mask: res.data.mask,
        attempts: res.data.attempts.length
      }
    });

    return ok({
      conversation: summary(conv),
      userMessage,
      message: assistant,
      attempts: res.data.attempts,
      mask: res.data.mask,
      model: conv.model,
      latency
    });
  }

  /** Ajan istemine girecek baglam blogunu onizleme (Ayarlar/Sohbet). */
  function preview(input) {
    const p = input && typeof input === 'object' ? input : {};
    const role = ROLES.includes(p.role) ? p.role : 'LDR';
    return ok({
      block: buildSystem({ role, messages: [] }),
      memory: memoryBlock(12),
      skills: skillLines(),
      permissions: permissionSummary(role)
    });
  }

  return {
    list, get, create, remove, rename, send, preview,
    paths: { filePath },
    ROLES
  };
}

module.exports = { createChatService, ROLES };
