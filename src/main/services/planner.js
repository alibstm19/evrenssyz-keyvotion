'use strict';

/**
 * Planlar, notlar ve zamanlanmış görevler (T8-6).
 *
 * Kullanıcı isteği: "lider sabah 09:00'da kendisi görev atayabilsin, planlar
 * ve notlar olsun — OpenChamber misali". Bu servis üç şeyi tutar:
 *
 *   plan     : markdown plan belgesi (başlık + gövde + durum)
 *   note     : kısa not (metin)
 *   schedule : tekrarlı/tek seferlik görev tetikleyicisi (daily/weekly/once)
 *   task     : tetiklendiğinde açılan görev kaydı (kaynak: schedule | elle)
 *
 * Kurallar:
 *   - Silme YOK; plan/not/zamanlama `archived:true` ile arşivlenir.
 *   - Ekip izolasyonu: her kayıt `teamId` taşır; `list({teamId})` yalnız o
 *     ekibin kayıtlarını (ve global `teamId:null`) döndürür.
 *   - Zamanlama yerel saate göre hesaplanır; `nextRunOf` saf ve test edilebilir.
 *   - Dosya: `<userData>/planner.json`, atomik yazım.
 */

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

const SCHEMA = 1;
const KINDS = new Set(['daily', 'weekly', 'once']);
const STATUSES = new Set(['açık', 'sürüyor', 'bitti', 'bloke']);

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowIso() {
  return new Date().toISOString();
}

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? { h: Number(match[1]), m: Number(match[2]) } : null;
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}

/**
 * Bir zamanlamanın, `from` anından SONRAKİ ilk çalışma anı.
 * Saf: verilen `from` dışında hiçbir duruma bakmaz.
 * @param {object} schedule
 * @param {Date} [from]
 * @returns {string|null} ISO
 */
function nextRunOf(schedule, from) {
  if (!schedule || schedule.enabled === false) return null;
  const base = from instanceof Date ? from : new Date();
  const at = parseTime(schedule.time);

  if (schedule.kind === 'once') {
    const day = parseDate(schedule.once);
    if (!day || !at) return null;
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), at.h, at.m, 0, 0);
    return when.getTime() > base.getTime() ? when.toISOString() : null;
  }

  if (!at) return null;
  const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), at.h, at.m, 0, 0);

  if (schedule.kind === 'daily') {
    if (candidate.getTime() <= base.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate.toISOString();
  }

  if (schedule.kind === 'weekly') {
    const days = (Array.isArray(schedule.weekdays) ? schedule.weekdays : [])
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!days.length) return null;
    for (let offset = 0; offset <= 7; offset += 1) {
      const probe = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), at.h, at.m, 0, 0);
      probe.setDate(probe.getDate() + offset);
      if (!days.includes(probe.getDay())) continue;
      if (probe.getTime() > base.getTime()) return probe.toISOString();
    }
    return null;
  }

  return null;
}

/** Zamanlama gövdesini doğrular; geçerliyse normalleştirilmiş alanları döner. */
function validateSchedule(payload) {
  const kind = String(payload.kind || 'daily');
  if (!KINDS.has(kind)) return { error: 'Zamanlama türü daily | weekly | once olmalı.' };
  if (!parseTime(payload.time)) return { error: 'Saat "SS:dd" biçiminde olmalı (örn. 09:00).' };

  let weekdays = [];
  if (kind === 'weekly') {
    weekdays = (Array.isArray(payload.weekdays) ? payload.weekdays : []).map(Number);
    if (!weekdays.length || weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { error: 'Haftalık zamanlama için 0-6 arası gün seçin (0 = Pazar).' };
    }
  }
  let once = null;
  if (kind === 'once') {
    if (!parseDate(payload.once)) return { error: 'Tek seferlik zamanlama için geçerli tarih (YYYY-AA-GG) girin.' };
    once = String(payload.once);
  }
  return { kind, time: String(payload.time), weekdays, once };
}

/**
 * @param {{baseDir:string}} deps
 */
function createPlannerService(deps) {
  const baseDir = deps.baseDir;
  const file = path.join(baseDir, 'planner.json');

  function empty() {
    return { schemaVersion: SCHEMA, seq: 1, plans: [], notes: [], schedules: [], tasks: [] };
  }

  function read() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw || typeof raw !== 'object') return empty();
      return {
        schemaVersion: SCHEMA,
        seq: Number.isInteger(raw.seq) ? raw.seq : 1,
        plans: Array.isArray(raw.plans) ? raw.plans : [],
        notes: Array.isArray(raw.notes) ? raw.notes : [],
        schedules: Array.isArray(raw.schedules) ? raw.schedules : [],
        tasks: Array.isArray(raw.tasks) ? raw.tasks : []
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

  function belongs(record, teamId) {
    if (teamId === undefined || teamId === null) return true;
    return record.teamId == null || record.teamId === teamId;
  }

  function list(query) {
    const q = query && typeof query === 'object' ? query : {};
    const teamId = q.teamId === undefined ? null : q.teamId;
    const state = read();
    const active = (rows) => rows.filter((r) => !r.archived && belongs(r, teamId));
    const schedules = active(state.schedules).map((s) => ({
      ...s,
      nextRunAt: nextRunOf(s, new Date())
    }));
    return ok({
      plans: active(state.plans).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      notes: active(state.notes).sort((a, b) => String(b.at).localeCompare(String(a.at))),
      schedules: schedules.sort((a, b) => String(a.nextRunAt || '').localeCompare(String(b.nextRunAt || ''))),
      tasks: active(state.tasks).sort((a, b) => String(b.at).localeCompare(String(a.at))),
      teamId,
      kinds: [...KINDS],
      statuses: [...STATUSES],
      counts: {
        plans: active(state.plans).length,
        notes: active(state.notes).length,
        schedules: active(state.schedules).length,
        tasks: active(state.tasks).filter((t) => t.status !== 'bitti').length
      }
    });
  }

  function planSave(payload) {
    const title = String(payload.title || '').trim();
    if (!title) return fail(CODES.BAD_REQUEST, 'Plan başlığı gerekli.');
    const body = String(payload.body || '');
    if (body.length > 200000) return fail(CODES.BAD_REQUEST, 'Plan gövdesi çok uzun (en fazla 200 000 karakter).');
    const state = read();
    const existing = payload.id ? state.plans.find((p) => p.id === payload.id && !p.archived) : null;
    if (payload.id && !existing) return fail(CODES.NOT_FOUND, 'Plan bulunamadı.');
    const status = STATUSES.has(payload.status) ? payload.status : 'açık';
    if (existing) {
      existing.title = title;
      existing.body = body;
      existing.status = status;
      existing.updatedAt = nowIso();
      write(state);
      return ok({ plan: existing });
    }
    const plan = {
      id: `P${state.seq}`,
      teamId: payload.teamId || null,
      title,
      body,
      status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.seq += 1;
    state.plans.push(plan);
    write(state);
    return ok({ plan });
  }

  function planRemove(payload) {
    const state = read();
    const plan = state.plans.find((p) => p.id === payload.id && !p.archived);
    if (!plan) return fail(CODES.NOT_FOUND, 'Plan bulunamadı.');
    plan.archived = true;
    plan.updatedAt = nowIso();
    write(state);
    return ok({ id: plan.id, archived: true });
  }

  function noteSave(payload) {
    const text = String(payload.text || '').trim();
    if (!text) return fail(CODES.BAD_REQUEST, 'Not metni gerekli.');
    if (text.length > 4000) return fail(CODES.BAD_REQUEST, 'Not en fazla 4 000 karakter olabilir.');
    const state = read();
    const existing = payload.id ? state.notes.find((n) => n.id === payload.id && !n.archived) : null;
    if (payload.id && !existing) return fail(CODES.NOT_FOUND, 'Not bulunamadı.');
    if (existing) {
      existing.text = text;
      existing.at = nowIso();
      write(state);
      return ok({ note: existing });
    }
    const note = { id: `N${state.seq}`, teamId: payload.teamId || null, text, at: nowIso() };
    state.seq += 1;
    state.notes.push(note);
    write(state);
    return ok({ note });
  }

  function noteRemove(payload) {
    const state = read();
    const note = state.notes.find((n) => n.id === payload.id && !n.archived);
    if (!note) return fail(CODES.NOT_FOUND, 'Not bulunamadı.');
    note.archived = true;
    write(state);
    return ok({ id: note.id, archived: true });
  }

  function scheduleSave(payload) {
    const title = String(payload.title || '').trim();
    if (!title) return fail(CODES.BAD_REQUEST, 'Görev başlığı gerekli.');
    const checked = validateSchedule(payload);
    if (checked.error) return fail(CODES.BAD_REQUEST, checked.error);

    const state = read();
    const existing = payload.id ? state.schedules.find((s) => s.id === payload.id && !s.archived) : null;
    if (payload.id && !existing) return fail(CODES.NOT_FOUND, 'Zamanlama bulunamadı.');

    const fields = {
      title,
      prompt: String(payload.prompt || title),
      kind: checked.kind,
      time: checked.time,
      weekdays: checked.weekdays,
      once: checked.once,
      enabled: payload.enabled !== false,
      role: String(payload.role || 'LDR').toUpperCase().slice(0, 8),
      updatedAt: nowIso()
    };
    if (existing) {
      Object.assign(existing, fields);
      existing.nextRunAt = nextRunOf(existing, new Date());
      write(state);
      return ok({ schedule: existing });
    }
    const schedule = {
      id: `S${state.seq}`,
      teamId: payload.teamId || null,
      ...fields,
      createdAt: nowIso(),
      lastRunAt: null,
      runs: 0
    };
    schedule.nextRunAt = nextRunOf(schedule, new Date());
    state.seq += 1;
    state.schedules.push(schedule);
    write(state);
    return ok({ schedule });
  }

  function scheduleRemove(payload) {
    const state = read();
    const schedule = state.schedules.find((s) => s.id === payload.id && !s.archived);
    if (!schedule) return fail(CODES.NOT_FOUND, 'Zamanlama bulunamadı.');
    schedule.archived = true;
    schedule.enabled = false;
    schedule.updatedAt = nowIso();
    write(state);
    return ok({ id: schedule.id, archived: true });
  }

  function taskAdd(payload) {
    const title = String(payload.title || '').trim();
    if (!title) return fail(CODES.BAD_REQUEST, 'Görev başlığı gerekli.');
    const state = read();
    const task = {
      id: `G${state.seq}`,
      teamId: payload.teamId || null,
      title,
      prompt: String(payload.prompt || title),
      role: String(payload.role || 'LDR').toUpperCase().slice(0, 8),
      status: STATUSES.has(payload.status) ? payload.status : 'açık',
      source: payload.source === 'schedule' ? 'schedule' : 'manual',
      scheduleId: payload.scheduleId || null,
      at: nowIso()
    };
    state.seq += 1;
    state.tasks.push(task);
    write(state);
    return ok({ task });
  }

  function taskUpdate(payload) {
    const state = read();
    const task = state.tasks.find((t) => t.id === payload.id && !t.archived);
    if (!task) return fail(CODES.NOT_FOUND, 'Görev bulunamadı.');
    if (!STATUSES.has(payload.status)) return fail(CODES.BAD_REQUEST, 'Geçersiz görev durumu.');
    task.status = payload.status;
    task.updatedAt = nowIso();
    write(state);
    return ok({ task });
  }

  /**
   * Zamanlanmış görevleri çalıştır. `now` verilmezse gerçek saat.
   * Dönen: `{fired:[task], checked}`. Tetiklenen her zamanlama için görev açılır.
   */
  function tick(now) {
    const at = now instanceof Date ? now : new Date();
    const state = read();
    const fired = [];
    let changed = false;

    for (const schedule of state.schedules) {
      if (schedule.archived || schedule.enabled === false) continue;
      const next = schedule.nextRunAt ? new Date(schedule.nextRunAt) : nextRunOf(schedule, at);
      if (!next || Number.isNaN(next.getTime())) {
        schedule.nextRunAt = nextRunOf(schedule, at);
        changed = true;
        continue;
      }
      if (next.getTime() > at.getTime()) continue;

      const task = {
        id: `G${state.seq}`,
        teamId: schedule.teamId || null,
        title: schedule.title,
        prompt: schedule.prompt,
        role: schedule.role || 'LDR',
        status: 'açık',
        source: 'schedule',
        scheduleId: schedule.id,
        at: at.toISOString()
      };
      state.seq += 1;
      state.tasks.push(task);
      schedule.lastRunAt = at.toISOString();
      schedule.runs = (Number(schedule.runs) || 0) + 1;
      schedule.nextRunAt = nextRunOf(schedule, at);
      if (schedule.kind === 'once') schedule.enabled = false;
      fired.push(task);
      changed = true;
    }

    if (changed) write(state);
    return ok({ fired, checked: state.schedules.filter((s) => !s.archived).length });
  }

  function run(payload) {
    const action = String((payload && payload.action) || '');
    switch (action) {
      case 'planSave': return planSave(payload);
      case 'planRemove': return planRemove(payload);
      case 'noteSave': return noteSave(payload);
      case 'noteRemove': return noteRemove(payload);
      case 'scheduleSave': return scheduleSave(payload);
      case 'scheduleRemove': return scheduleRemove(payload);
      case 'taskAdd': return taskAdd(payload);
      case 'taskUpdate': return taskUpdate(payload);
      case 'scheduleRun': return runNow(payload);
      default: return fail(CODES.BAD_REQUEST, `Bilinmeyen plan eylemi: ${action || '(boş)'}`);
    }
  }

  /** Zamanlamayı beklemeden şimdi çalıştır. */
  function runNow(payload) {
    const state = read();
    const schedule = state.schedules.find((s) => s.id === payload.id && !s.archived);
    if (!schedule) return fail(CODES.NOT_FOUND, 'Zamanlama bulunamadı.');
    const task = {
      id: `G${state.seq}`,
      teamId: schedule.teamId || null,
      title: schedule.title,
      prompt: schedule.prompt,
      role: schedule.role || 'LDR',
      status: 'açık',
      source: 'schedule',
      scheduleId: schedule.id,
      at: nowIso()
    };
    state.seq += 1;
    state.tasks.push(task);
    schedule.lastRunAt = nowIso();
    schedule.runs = (Number(schedule.runs) || 0) + 1;
    schedule.nextRunAt = nextRunOf(schedule, new Date());
    write(state);
    return ok({ schedule, task });
  }

  return { list, run, tick, file, nextRunOf };
}

module.exports = { createPlannerService, nextRunOf, validateSchedule, KINDS, STATUSES };
