'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

/*
 * Proje yonetimi (T4-2).
 *
 * Her proje kendi `.team/` klasorune sahiptir: board.md, roster.md,
 * memory/, work/. Aktif proje = settings.projectDir. Boylece tum servisler
 * (pano, kadro, hafiza, rapor) hicbir degisiklik yapilmadan proje basina
 * calisir.
 *
 * Silme YOK: arsivleme var (Anayasa "ajan/silme" kuralinin proje karsiligi).
 *
 * Kayit: <userData>/projects.json — sir tutmaz.
 */

const FILE_NAME = 'projects.json';
const MAX_NAME = 60;

function makeId() {
  return `prj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* Yeni proje icin iskelet dosyalar. Bos pano gecerli bir panodur. */
const BOARD_SEED = [
  '# Görev Panosu',
  '',
  '| ID | Görev | Sahip | Durum | Not |',
  '|---|---|---|---|---|',
  '',
  'Sıradaki ID: **T-001**',
  ''
].join('\n');

const ROSTER_SEED = [
  '# Kadro',
  '',
  '| Rol | Kod | Model | Not |',
  '|---|---|---|---|',
  ''
].join('\n');

function createProjectsService(options) {
  const baseDir = options.baseDir;
  const settings = options.settings;
  const getProjectDir = options.getProjectDir;

  const filePath = path.join(baseDir, FILE_NAME);
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cache = {
        activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
        projects: Array.isArray(parsed.projects) ? parsed.projects.filter((p) => p && typeof p.id === 'string') : []
      };
    } catch {
      cache = { activeId: null, projects: [] };
    }
    return cache;
  }

  function save(data) {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    cache = data;
  }

  /** Aktif dizini (settings) proje listesiyle esitler; kayit yoksa tohumlar. */
  function ensureSeeded() {
    const data = load();
    const current = getProjectDir();
    let changed = false;

    if (!data.projects.length) {
      data.projects.push({
        id: makeId(),
        name: path.basename(current) || 'Keyvotion',
        dir: current,
        createdAt: new Date().toISOString(),
        archivedAt: null
      });
      changed = true;
    }

    const active = data.projects.find((p) => p.dir === current && !p.archivedAt);
    if (active) {
      if (data.activeId !== active.id) { data.activeId = active.id; changed = true; }
    } else {
      data.activeId = null;
      changed = true;
    }

    if (changed) {
      try { save(data); } catch { /* yazilamazsa salt-okunur devam */ }
    }
    return data;
  }

  function publicList() {
    const data = ensureSeeded();
    const current = getProjectDir();
    return {
      activeId: data.activeId,
      activeDir: current,
      projects: data.projects.map((p) => ({
        id: p.id,
        name: p.name,
        dir: p.dir,
        createdAt: p.createdAt,
        archivedAt: p.archivedAt || null,
        active: p.dir === current && !p.archivedAt,
        exists: fs.existsSync(p.dir)
      }))
    };
  }

  function list() {
    return ok(publicList());
  }

  function create(input) {
    const p = input && typeof input === 'object' ? input : {};
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name || name.length > MAX_NAME) {
      return fail(CODES.BAD_REQUEST, `Proje adı 1–${MAX_NAME} karakter olmalı.`);
    }

    const data = ensureSeeded();
    const id = makeId();
    const dir = (typeof p.dir === 'string' && p.dir.trim())
      ? path.resolve(p.dir.trim())
      : path.join(baseDir, 'projects', id);

    if (data.projects.some((x) => !x.archivedAt && x.dir.toLowerCase() === dir.toLowerCase())) {
      return fail(CODES.CONFLICT, 'Bu dizinde zaten bir proje var.');
    }

    try {
      fs.mkdirSync(path.join(dir, '.team', 'memory'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
      const boardPath = path.join(dir, '.team', 'board.md');
      if (!fs.existsSync(boardPath)) fs.writeFileSync(boardPath, BOARD_SEED, 'utf8');
      const rosterPath = path.join(dir, '.team', 'roster.md');
      if (!fs.existsSync(rosterPath)) fs.writeFileSync(rosterPath, ROSTER_SEED, 'utf8');
    } catch {
      return fail(CODES.INTERNAL, 'Proje klasörü oluşturulamadı.');
    }

    const entry = {
      id,
      name,
      dir,
      createdAt: new Date().toISOString(),
      archivedAt: null
    };
    data.projects.push(entry);

    /* Yeni proje aktif olur: kullanici olusturduktan sonra orada calisir. */
    const res = settings.set({ projectDir: dir });
    if (!res.ok) {
      data.projects.pop();
      save(data);
      return res;
    }
    data.activeId = id;
    save(data);
    return ok({ project: entry, ...publicList() });
  }

  function switchTo(input) {
    const p = input && typeof input === 'object' ? input : {};
    const data = ensureSeeded();
    const target = data.projects.find((x) => x.id === p.id);
    if (!target) return fail(CODES.NOT_FOUND, 'Proje bulunamadı.');
    if (target.archivedAt) return fail(CODES.CONFLICT, 'Arşivlenmiş proje açılamaz.');
    if (!fs.existsSync(target.dir)) return fail(CODES.NOT_FOUND, 'Proje klasörü diskte yok.');

    const res = settings.set({ projectDir: target.dir });
    if (!res.ok) return res;
    data.activeId = target.id;
    save(data);
    return ok({ project: target, ...publicList() });
  }

  /** Silme degil arsivleme; aktif proje arsivlenemez. */
  function archive(input) {
    const p = input && typeof input === 'object' ? input : {};
    const data = ensureSeeded();
    const target = data.projects.find((x) => x.id === p.id);
    if (!target) return fail(CODES.NOT_FOUND, 'Proje bulunamadı.');
    if (target.dir === getProjectDir()) {
      return fail(CODES.CONFLICT, 'Aktif proje arşivlenemez — önce başka projeye geçin.');
    }
    target.archivedAt = new Date().toISOString();
    save(data);
    return ok(publicList());
  }

  return { list, create, switch: switchTo, archive, filePath, publicList };
}

module.exports = { createProjectsService, BOARD_SEED, ROSTER_SEED };
