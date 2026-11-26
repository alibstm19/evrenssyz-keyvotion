'use strict';

const { CODES, ok, fail } = require('../../shared/errors');

const ROLE_ORDER = ['LDR', 'YM', 'ARC', 'DEV', 'DSN', 'QA', 'OPS'];
const TITLE_MAX = 60;

function truncate(value, max) {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Ham Session -> beyaz listeli DTO (§4.1). Yasak alanlar gecmez. */
function mapSession(raw, context) {
  const model = raw && raw.model ? raw.model : {};
  const tokens = raw && raw.tokens ? raw.tokens : {};
  const cache = tokens.cache || {};
  const time = raw && raw.time ? raw.time : {};
  const location = raw && raw.location ? raw.location : {};
  const rosterEntry = context.rosterByID.get(raw && raw.id) || null;

  const active = Boolean(context.activeByID[raw && raw.id]);
  const idleAt = time.idle === undefined ? null : time.idle;
  const outcome = typeof raw.outcome === 'string' ? raw.outcome : null;

  let state = 'idle';
  if (active) state = 'busy';
  else if (outcome === 'failed' && idleAt !== null) state = 'error';

  const providerID = typeof model.providerID === 'string' ? model.providerID : null;
  const modelID = typeof model.id === 'string' ? model.id : null;
  const tokenTotal = toNumber(tokens.input) + toNumber(tokens.output) + toNumber(tokens.reasoning);

  // T-042: maliyet BILINMIYORSA `null`. `toNumber` burada kullanilmaz cunku
  // bilinmeyen maliyeti `0` yapar; kartta "0.00 $" uydurma maliyet demektir.
  // `0` gercek bir degerdir ve korunur; string/NaN/Infinity maliyet sayilmaz.
  const cost = typeof (raw && raw.cost) === 'number' && Number.isFinite(raw.cost) ? raw.cost : null;

  return {
    // --- sozlesme DTO (§4.1) ---
    id: raw.id,
    role: rosterEntry ? rosterEntry.code : null,
    title: truncate(raw.title, TITLE_MAX),
    agent: typeof raw.agent === 'string' ? raw.agent : null,
    providerID,
    modelID,
    variant: typeof model.variant === 'string' ? model.variant : null,
    state,
    outcome,
    tokens: {
      input: toNumber(tokens.input),
      output: toNumber(tokens.output),
      reasoning: toNumber(tokens.reasoning),
      cacheRead: toNumber(cache.read)
    },
    cost,
    updatedAt: toNumber(time.updated),
    idleAt,
    directory: typeof location.directory === 'string' ? location.directory : null,
    inRoster: Boolean(rosterEntry),
    missing: false,

    // --- renderer uyum alanlari (F1 kart semasi) ---
    sessionId: raw.id,
    code: rosterEntry ? rosterEntry.code : null,
    model: providerID && modelID ? `${providerID}/${modelID}` : null,
    tokenTotal,
    task: null
  };
}

/** Kadroda olup sunucuda seansi olmayan rol icin yer tutucu kart (UI-20). */
function makeMissingCard(entry, projectDir) {
  return {
    id: null,
    role: entry.code,
    title: 'kadro kaydı var, seans yok',
    agent: null,
    providerID: entry.model && entry.model.includes('/') ? entry.model.split('/')[0] : null,
    modelID: entry.model && entry.model.includes('/') ? entry.model.split('/')[1] : entry.model || null,
    variant: null,
    state: 'offline',
    outcome: null,
    tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0 },
    // T-042: iskelette de maliyet BILINMIYOR -> null (0 uydurulmaz).
    cost: null,
    updatedAt: 0,
    idleAt: null,
    directory: projectDir,
    inRoster: true,
    missing: true,

    // --- renderer uyum alanlari ---
    sessionId: null,
    code: entry.code,
    model: entry.model || null,
    tokenTotal: 0,
    task: null
  };
}

/**
 * @param {{http: object, roster: object, getProjectDir: () => string}} deps
 */
function createSessionsService(deps) {
  const http = deps.http;
  const roster = deps.roster;
  const getProjectDir = deps.getProjectDir;

  async function fetchAll() {
    const [listRes, activeRes] = await Promise.all([
      http.get('/api/session'),
      http.get('/api/session/active')
    ]);

    if (!listRes.ok) return listRes;

    const rawList = listRes.data && Array.isArray(listRes.data.data) ? listRes.data.data : [];
    const activeByID = activeRes.ok && activeRes.data && activeRes.data.data
      && typeof activeRes.data.data === 'object'
      ? activeRes.data.data
      : {};

    const rosterRes = roster.read();
    const entries = rosterRes.ok ? rosterRes.data.entries : [];
    const rosterByID = new Map(
      entries.filter((e) => e.sessionID).map((e) => [e.sessionID, e])
    );
    const projectDir = getProjectDir();

    const context = { rosterByID, activeByID };
    const mapped = rawList
      .filter((raw) => raw && typeof raw.id === 'string')
      .map((raw) => mapSession(raw, context));

    // Kadro kapsami: yalniz proje dizinindeki seanslar "takim" sayilir.
    const inProject = mapped.filter((s) => !s.directory || s.directory === projectDir);
    const outside = mapped.filter((s) => s.directory && s.directory !== projectDir);

    // C-1 dinamik kadro: sira roster.md'den gelir; roster bos ise sabit sira.
    const order = entries.length
      ? entries.map((e) => e.code)
      : ROLE_ORDER.slice();

    const byCode = new Map(inProject.filter((s) => s.code).map((s) => [s.code, s]));
    const team = [];
    for (const code of order) {
      const found = byCode.get(code);
      if (found) {
        team.push(found);
      } else {
        const entry = entries.find((e) => e.code === code);
        if (entry) team.push(makeMissingCard(entry, projectDir));
      }
    }

    // Kadroda karsiligi olmayan canli seanslar -> unassigned (API-99: kesismez).
    const unassigned = inProject
      .filter((s) => !s.code)
      .concat(outside.map((s) => ({ ...s, inRoster: false })));

    const all = team.concat(unassigned);

    return ok({
      sessions: team,
      unassigned,
      counts: {
        total: all.length,
        inRoster: team.filter((s) => !s.missing).length,
        missing: team.filter((s) => s.missing).length,
        outOfRoster: unassigned.length,
        busy: all.filter((s) => s.state === 'busy').length
      },
      roster: entries,
      updatedAt: Date.now()
    });
  }

  async function get(sessionID) {
    if (!sessionID) return fail(CODES.BAD_REQUEST, 'Seans kimliği gerekli.');
    const res = await http.get(`/api/session/${encodeURIComponent(sessionID)}`);
    if (!res.ok) return res;

    const raw = res.data && res.data.data ? res.data.data : null;
    if (!raw) return fail(CODES.NOT_FOUND, 'Seans bulunamadı.');

    const rosterRes = roster.read();
    const entries = rosterRes.ok ? rosterRes.data.entries : [];
    const rosterByID = new Map(entries.filter((e) => e.sessionID).map((e) => [e.sessionID, e]));
    return ok(mapSession(raw, { rosterByID, activeByID: {} }));
  }

  /**
   * Ajan ekle (F1).
   *
   * Renderer gonderimi: {role, code, model, directory}
   * Sozlesme gonderimi: {roleCode, agent, model:{id,providerID}, title}
   * Ikisi de kabul edilir; seans acilir ve (kod verildiyse) roster'a satir eklenir.
   */
  async function create(input) {
    const payload = input || {};

    const code = typeof payload.code === 'string'
      ? payload.code.trim().toUpperCase()
      : (typeof payload.roleCode === 'string' ? payload.roleCode.trim().toUpperCase() : null);
    const role = typeof payload.role === 'string' ? payload.role.trim() : null;

    let title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title && (role || code)) title = `${role || code}${code ? ` (${code})` : ''}`;
    if (!title) return fail(CODES.BAD_REQUEST, 'Seans başlığı gerekli.');

    // Model: "provider/id" ya da {id, providerID}
    let model = null;
    if (typeof payload.model === 'string' && payload.model.includes('/')) {
      model = payload.model.trim();
    } else if (payload.model && typeof payload.model === 'object'
      && typeof payload.model.providerID === 'string' && typeof payload.model.id === 'string') {
      model = `${payload.model.providerID}/${payload.model.id}`;
    }

    const body = { title };
    if (typeof payload.agent === 'string' && payload.agent.trim()) body.agent = payload.agent.trim();
    if (model) {
      const [providerID, ...rest] = model.split('/');
      body.model = { providerID, id: rest.join('/') };
    }

    const res = await http.post('/api/session', { body, idempotencyKey: payload.idempotencyKey });
    if (!res.ok) return res;

    const raw = res.data && res.data.data ? res.data.data : res.data;
    if (!raw || typeof raw.id !== 'string') {
      return fail(CODES.PARSE, 'Sunucu yeni seans kimliği döndürmedi.');
    }

    // Seans acildi; simdi kadroya yaz (yedekli). Yazilamazsa seans yine de doner.
    let rosterResult = null;
    if (code) {
      rosterResult = roster.append({
        role: role || code,
        code,
        responsibility: typeof payload.responsibility === 'string' ? payload.responsibility : '',
        model: model || '',
        sessionID: raw.id
      });
    }

    return ok({
      id: raw.id,
      sessionId: raw.id,
      title: truncate(raw.title || title, TITLE_MAX),
      code,
      role,
      model,
      rosterWritten: Boolean(rosterResult && rosterResult.ok),
      rosterError: rosterResult && !rosterResult.ok
        ? { code: rosterResult.error.code, message: rosterResult.error.message }
        : null
    });
  }

  /** Arsivle (silme degil). Uc nokta semasi canli dogrulanmadi. */
  async function archive(sessionID) {
    if (!sessionID) return fail(CODES.BAD_REQUEST, 'Seans kimliği gerekli.');
    const res = await http.post(`/api/session/${encodeURIComponent(sessionID)}/archive`, {
      body: {},
      idempotencyKey: undefined
    });
    if (!res.ok) return res;
    return ok({ sessionID, archived: true });
  }

  /** POST /api/session/{id}/model — {providerID, modelID} (E14). */
  async function setModel(sessionID, model) {
    if (!sessionID) return fail(CODES.BAD_REQUEST, 'Seans kimliği gerekli.');
    if (typeof model !== 'string' || !model.includes('/')) {
      return fail(CODES.BAD_REQUEST, 'Model "sağlayıcı/model" biçiminde olmalı.');
    }
    const [providerID, ...rest] = model.split('/');
    const modelID = rest.join('/');
    if (!providerID || !modelID) {
      return fail(CODES.BAD_REQUEST, 'Model "sağlayıcı/model" biçiminde olmalı.');
    }

    const res = await http.post(`/api/session/${encodeURIComponent(sessionID)}/model`, {
      body: { providerID, modelID }
    });
    if (!res.ok) return res;
    return ok({ sessionID, model });
  }

  /** Lider degistir: roster.md guncelle + yedek (F8). */
  async function setLeader(sessionID) {
    const live = await get(sessionID);
    if (!live.ok) return live;
    return roster.setLeader(sessionID);
  }

  return { list: fetchAll, get, create, archive, setModel, setLeader, mapSession };
}

module.exports = { createSessionsService, mapSession, makeMissingCard, ROLE_ORDER, TITLE_MAX };
