'use strict';

/**
 * Çoklu ekip (T8-5) — aynı anda birden çok ekip, her birinin kendi lideri,
 * kendi üyeleri ve kendi token bütçesi. Ekipler BİRBİRİNE KARIŞMAZ:
 * her kayıt `teamId` taşır, bütçe ve harcama ekibin kendi defterinde tutulur.
 *
 * Kural:
 *   - Silme YOKTUR; ekip `archived:true` ile arşivlenir (API-33 ruhu).
 *   - Model ataması deterministiktir (aynı girdi → aynı çıktı). Uydurma yok:
 *     katalog boşsa `model:null` + gerekçe döner.
 *   - Dosya: `<userData>/teams.json`, atomik yazım (tmp + rename).
 */

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

const SCHEMA = 1;

/** Rol → o rolün işine en uygun yetenek sırası. */
const ROLE_PROFILES = Object.freeze({
  LDR: { label: 'Lider', wants: ['reasoning', 'planning', 'coding'] },
  ARC: { label: 'Mimar', wants: ['reasoning', 'architecture', 'coding'] },
  DEV: { label: 'Yazılımcı', wants: ['coding', 'tools', 'reasoning'] },
  DSN: { label: 'Tasarımcı', wants: ['design', 'vision', 'creative'] },
  QA: { label: 'Test', wants: ['reasoning', 'testing', 'coding'] },
  OPS: { label: 'DevOps', wants: ['tools', 'automation', 'fast'] }
});

/** Yetenek sözcüğü → metinde aranacak eşanlamlılar. */
const SYNONYMS = Object.freeze({
  reasoning: ['reason', 'think', 'düşün', 'analiz', 'analysis', 'o1', 'r1', 'thinking'],
  planning: ['plan', 'planla', 'architect', 'mimari'],
  architecture: ['architect', 'mimari', 'design system', 'sistem'],
  coding: ['code', 'kod', 'coding', 'swe', 'developer', 'yazılım', 'program'],
  tools: ['tool', 'araç', 'function', 'aja', 'agentic'],
  design: ['design', 'tasarım', 'ui', 'ux', 'arayüz'],
  vision: ['vision', 'görsel', 'image', 'multimodal', 'screenshot'],
  creative: ['creative', 'yaratıcı', 'metin', 'writing'],
  testing: ['test', 'qa', 'doğrula', 'verify'],
  automation: ['automat', 'otomasyon', 'script', 'ops'],
  fast: ['fast', 'hızlı', 'flash', 'mini', 'lite', 'small']
});

function lower(value) {
  return String(value == null ? '' : value).toLowerCase();
}

/** Bir modelin bir role uygunluk puanı (deterministik, saf). */
function scoreModel(model, wants) {
  if (!model) return 0;
  const caps = model.capabilities || {};
  const haystack = [
    model.id, model.name, model.character, model.strengths, model.family,
    Array.isArray(caps.input) ? caps.input.join(' ') : '',
    Array.isArray(caps.output) ? caps.output.join(' ') : '',
    caps.tools ? 'tools agentic' : ''
  ].map(lower).join(' ');

  let score = 0;
  wants.forEach((want, index) => {
    const words = SYNONYMS[want] || [want];
    const hit = words.some((word) => haystack.includes(lower(word)));
    if (hit) score += Math.max(1, 4 - index);
  });
  return score;
}

/**
 * Rol listesine model önerisi. Katalogdan en uygun modeli seçer.
 * Aynı modeli iki role vermemeye çalışır; katalog darsa yeniden kullanır.
 * @param {string[]} roles
 * @param {Array<object>} catalog
 * @returns {{assignments: Array<{role:string, model:string|null, score:number, reason:string}>, reused: string[]}}
 */
function autoAssign(roles, catalog) {
  const models = (Array.isArray(catalog) ? catalog : []).filter((m) => m && typeof m.id === 'string' && m.id.includes('/'));
  const used = new Set();
  const reused = [];
  const assignments = [];

  for (const role of roles) {
    const profile = ROLE_PROFILES[role];
    if (!profile) {
      assignments.push({ role, model: null, score: 0, reason: 'tanımsız rol' });
      continue;
    }
    if (!models.length) {
      assignments.push({ role, model: null, score: 0, reason: 'katalog boş — model önerilemedi' });
      continue;
    }

    const ranked = models
      .map((model) => ({ model, score: scoreModel(model, profile.wants) }))
      .sort((a, b) => (b.score - a.score) || String(a.model.id).localeCompare(String(b.model.id)));

    const fresh = ranked.find((entry) => !used.has(entry.model.id) && entry.score > 0);
    const pick = fresh || ranked[0];
    if (used.has(pick.model.id)) reused.push(pick.model.id);
    used.add(pick.model.id);

    const reason = pick.score > 0
      ? `${profile.wants.filter((w) => (SYNONYMS[w] || [w]).some((s) => lower(pick.model.strengths || pick.model.character || pick.model.id).includes(lower(s)))).slice(0, 2).join(', ') || 'genel uyum'}`
      : 'katalogda rol sinyali yok — en yüksek sıradaki model';

    assignments.push({ role, model: pick.model.id, score: pick.score, reason });
  }

  return { assignments, reused };
}

function nowIso() {
  return new Date().toISOString();
}

function slug(value) {
  return lower(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'ekip';
}

/**
 * @param {{baseDir:string, getModels?:()=>Array<object>}} deps
 */
function createTeamsService(deps) {
  const baseDir = deps.baseDir;
  const file = path.join(baseDir, 'teams.json');
  const getModels = typeof deps.getModels === 'function' ? deps.getModels : () => [];

  function empty() {
    return { schemaVersion: SCHEMA, activeId: null, seq: 1, teams: [] };
  }

  function read() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw || !Array.isArray(raw.teams)) return empty();
      return {
        schemaVersion: SCHEMA,
        activeId: raw.activeId || null,
        seq: Number.isInteger(raw.seq) ? raw.seq : raw.teams.length + 1,
        teams: raw.teams
      };
    } catch {
      return empty();
    }
  }

  function write(state) {
    fs.mkdirSync(baseDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  function catalog() {
    const res = getModels();
    const pool = res && res.ok && Array.isArray(res.data && res.data.pool) ? res.data.pool : [];
    return pool;
  }

  function decorate(team) {
    const spentTokens = Number(team.spentTokens) || 0;
    const limit = team.budget && Number.isFinite(team.budget.limitTokens) ? team.budget.limitTokens : null;
    return {
      ...team,
      spentTokens,
      budget: { limitTokens: limit, remaining: limit == null ? null : Math.max(0, limit - spentTokens), over: limit != null && spentTokens > limit },
      members: (team.members || []).filter((m) => m.active !== false),
      archivedMembers: (team.members || []).filter((m) => m.active === false)
    };
  }

  function list() {
    const state = read();
    const teams = state.teams.map(decorate);
    const active = teams.find((t) => t.id === state.activeId && !t.archived) || teams.find((t) => !t.archived) || null;
    const totalSpent = teams.reduce((sum, t) => sum + t.spentTokens, 0);
    return ok({
      teams,
      activeId: active ? active.id : null,
      active,
      totals: { teams: teams.filter((t) => !t.archived).length, spentTokens: totalSpent },
      roles: Object.entries(ROLE_PROFILES).map(([code, p]) => ({ code, label: p.label })),
      available: state.teams.length > 0
    });
  }

  function find(state, id) {
    return state.teams.find((t) => t.id === id) || null;
  }

  function create(payload) {
    const name = String(payload.name || '').trim();
    if (!name) return fail(CODES.BAD_REQUEST, 'Ekip adı gerekli.');
    const state = read();
    if (state.teams.some((t) => lower(t.name) === lower(name) && !t.archived)) {
      return fail(CODES.CONFLICT, `Bu adla açık ekip var: ${name}`);
    }
    const id = `T${state.seq}`;
    const limit = Number.isFinite(Number(payload.limitTokens)) && Number(payload.limitTokens) > 0
      ? Math.round(Number(payload.limitTokens))
      : null;
    const team = {
      id,
      slug: `${slug(name)}-${state.seq}`,
      name,
      projectId: payload.projectId || null,
      leader: {
        code: 'LDR',
        name: String(payload.leaderName || 'Lider').trim() || 'Lider',
        model: payload.leaderModel || null
      },
      members: [{ code: 'LDR', role: 'LDR', name: String(payload.leaderName || 'Lider').trim() || 'Lider', model: payload.leaderModel || null, active: true }],
      budget: { limitTokens: limit },
      spentTokens: 0,
      archived: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.seq += 1;
    state.teams.push(team);
    if (!state.activeId) state.activeId = id;
    write(state);
    return ok({ team: decorate(team), activeId: state.activeId });
  }

  function update(payload) {
    const state = read();
    const team = find(state, payload.id);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    if (team.archived) return fail(CODES.BAD_REQUEST, 'Arşivlenmiş ekip güncellenemez.');
    if (payload.name != null) {
      const name = String(payload.name).trim();
      if (!name) return fail(CODES.BAD_REQUEST, 'Ekip adı boş olamaz.');
      team.name = name;
    }
    if (payload.limitTokens !== undefined) {
      const limit = Number(payload.limitTokens);
      team.budget = { limitTokens: Number.isFinite(limit) && limit > 0 ? Math.round(limit) : null };
    }
    if (payload.leaderName != null) {
      const leaderName = String(payload.leaderName).trim() || 'Lider';
      team.leader.name = leaderName;
      const leader = team.members.find((m) => m.code === 'LDR');
      if (leader) leader.name = leaderName;
    }
    team.updatedAt = nowIso();
    write(state);
    return ok({ team: decorate(team) });
  }

  function switchTeam(payload) {
    const state = read();
    const team = find(state, payload.id);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    if (team.archived) return fail(CODES.BAD_REQUEST, 'Arşivlenmiş ekip aktif yapılamaz.');
    state.activeId = team.id;
    write(state);
    return ok({ activeId: team.id, team: decorate(team) });
  }

  function archive(payload) {
    const state = read();
    const team = find(state, payload.id);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    team.archived = true;
    team.archivedAt = nowIso();
    team.updatedAt = nowIso();
    if (state.activeId === team.id) {
      const next = state.teams.find((t) => !t.archived);
      state.activeId = next ? next.id : null;
    }
    write(state);
    return ok({ team: decorate(team), activeId: state.activeId });
  }

  function addMember(payload) {
    const state = read();
    const team = find(state, payload.id);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    const role = String(payload.role || '').toUpperCase();
    if (!ROLE_PROFILES[role]) return fail(CODES.BAD_REQUEST, `Bilinmeyen rol: ${payload.role || '(boş)'}`);
    const code = String(payload.code || role).toUpperCase().trim();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) return fail(CODES.BAD_REQUEST, 'Üye kodu 2-8 büyük harf/rakam olmalı.');
    if (team.members.some((m) => m.code === code && m.active !== false)) {
      return fail(CODES.DUPLICATE_ROLE, `${code} zaten ekipte.`);
    }
    const existing = team.members.find((m) => m.code === code);
    const model = payload.model || (existing && existing.model) || null;
    if (existing) {
      existing.active = true;
      existing.role = role;
      existing.name = String(payload.name || ROLE_PROFILES[role].label).trim();
      existing.model = model;
    } else {
      team.members.push({
        code, role,
        name: String(payload.name || ROLE_PROFILES[role].label).trim(),
        model,
        active: true
      });
    }
    team.updatedAt = nowIso();
    write(state);
    return ok({ team: decorate(team) });
  }

  function removeMember(payload) {
    const state = read();
    const team = find(state, payload.id);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    const code = String(payload.code || '').toUpperCase();
    if (code === 'LDR') return fail(CODES.FORBIDDEN, 'Lider ekipten çıkarılamaz; lideri değiştirin.');
    const member = team.members.find((m) => m.code === code && m.active !== false);
    if (!member) return fail(CODES.NOT_FOUND, 'Üye bulunamadı.');
    member.active = false;
    member.archivedAt = nowIso();
    team.updatedAt = nowIso();
    write(state);
    return ok({ team: decorate(team) });
  }

  function setModel(payload) {
    const state = read();
    const team = find(state, payload.id);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    const code = String(payload.code || '').toUpperCase();
    const member = team.members.find((m) => m.code === code && m.active !== false);
    if (!member) return fail(CODES.NOT_FOUND, 'Üye bulunamadı.');
    const model = payload.model == null ? null : String(payload.model).trim();
    if (model && !model.includes('/')) return fail(CODES.BAD_REQUEST, 'Model "sağlayıcı/model" biçiminde olmalı.');
    member.model = model || null;
    if (code === 'LDR') team.leader.model = member.model;
    team.updatedAt = nowIso();
    write(state);
    return ok({ team: decorate(team) });
  }

  function autoAssignTeam(payload) {
    const state = read();
    const team = find(state, payload.id);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    const members = team.members.filter((m) => m.active !== false);
    const pool = catalog();
    if (!pool.length) {
      return fail(CODES.NOT_FOUND, 'Model havuzu boş (.team/models.md). Öneri üretilemedi — uydurma atama yapılmadı.');
    }
    const { assignments, reused } = autoAssign(members.map((m) => m.role), pool);
    for (const a of assignments) {
      const member = members.find((m) => m.role === a.role);
      if (!member) continue;
      if (member.model && payload.force !== true) continue;
      member.model = a.model;
      member.assignment = { score: a.score, reason: a.reason, at: nowIso() };
      if (member.code === 'LDR') team.leader.model = a.model;
    }
    team.updatedAt = nowIso();
    write(state);
    return ok({ team: decorate(team), assignments, reused });
  }

  function spend(payload) {
    const state = read();
    const team = find(state, payload.id || state.activeId);
    if (!team) return fail(CODES.NOT_FOUND, 'Ekip bulunamadı.');
    const tokens = Math.max(0, Math.round(Number(payload.tokens) || 0));
    team.spentTokens = (Number(team.spentTokens) || 0) + tokens;
    team.updatedAt = nowIso();
    write(state);
    const decorated = decorate(team);
    return ok({ team: decorated, spentTokens: decorated.spentTokens, over: decorated.budget.over });
  }

  function run(payload) {
    const action = String((payload && payload.action) || '');
    switch (action) {
      case 'create': return create(payload);
      case 'update': return update(payload);
      case 'switch': return switchTeam(payload);
      case 'archive': return archive(payload);
      case 'addMember': return addMember(payload);
      case 'removeMember': return removeMember(payload);
      case 'setModel': return setModel(payload);
      case 'autoAssign': return autoAssignTeam(payload);
      case 'spend': return spend(payload);
      default: return fail(CODES.BAD_REQUEST, `Bilinmeyen ekip eylemi: ${action || '(boş)'}`);
    }
  }

  return { list, run, file, autoAssign, scoreModel, ROLE_PROFILES };
}

module.exports = { createTeamsService, autoAssign, scoreModel, ROLE_PROFILES };
