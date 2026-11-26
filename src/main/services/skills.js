'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

/*
 * Beceriler (skills) — T4-4.
 *
 * Kullanici kendi becerisini ekler; ajanlar bu becerileri baglam olarak alir.
 * Depolama: <proje>/.team/skills.json  (sir tutmaz)
 *
 * Alanlar: id, name, description, instructions, enabled, scope, createdAt
 * scope: 'team' (tum ajanlar) | 'project' (yalniz bu proje)
 */

const MAX_NAME = 60;
const MAX_DESC = 400;
const MAX_INSTR = 8000;

function makeId() {
  return `skl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const SEED = [
  {
    name: 'Rapor formatı',
    description: 'Tüm ajan raporları aynı iskeleti kullanır.',
    instructions: 'Rapor: Rol / Durum / Özet / Kanıt / Değişen dosyalar / Risk. Kanıtsız "tamam" yazma; ölçtüğün sayıyı yaz.',
    scope: 'team'
  },
  {
    name: 'Türkçe iletişim',
    description: 'Kullanıcıya ve rapora Türkçe; koda İngilizce.',
    instructions: 'Kullanıcıya ve raporlara Türkçe yaz. Kod, dosya adı ve commit mesajları İngilizce olsun.',
    scope: 'team'
  },
  {
    name: 'Bağımlılık yasağı',
    description: 'Yeni paket eklemeden çöz.',
    instructions: 'Yeni bağımlılık ekleme. Yalnız electron. Bir ihtiyaç varsa önce Node yerleşikleriyle çöz, yoksa Lider\'e öner.',
    scope: 'team'
  }
];

function createSkillsService(options) {
  const getProjectDir = options.getProjectDir;

  function filePath() {
    return path.join(getProjectDir(), '.team', 'skills.json');
  }

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
      if (parsed && Array.isArray(parsed.skills)) {
        return parsed.skills.filter((s) => s && typeof s.id === 'string');
      }
    } catch {
      // dosya yok / bozuk -> tohum
    }
    return SEED.map((s, i) => ({
      id: `skl_seed${i + 1}`,
      name: s.name,
      description: s.description,
      instructions: s.instructions,
      scope: s.scope,
      enabled: true,
      seeded: true,
      createdAt: null
    }));
  }

  function persist(skills) {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), `${JSON.stringify({ skills }, null, 2)}\n`, 'utf8');
  }

  function list() {
    const skills = load();
    return ok({
      skills,
      total: skills.length,
      enabled: skills.filter((s) => s.enabled).length,
      path: filePath()
    });
  }

  function save(input) {
    const p = input && typeof input === 'object' ? input : {};
    const skills = load();

    if (p.id) {
      const target = skills.find((s) => s.id === p.id);
      if (!target) return fail(CODES.NOT_FOUND, 'Beceri bulunamadı.');
      if (p.name !== undefined) {
        if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > MAX_NAME) {
          return fail(CODES.BAD_REQUEST, `Beceri adı 1–${MAX_NAME} karakter olmalı.`);
        }
        target.name = p.name.trim();
      }
      if (p.description !== undefined) {
        if (typeof p.description !== 'string' || p.description.length > MAX_DESC) {
          return fail(CODES.BAD_REQUEST, `Açıklama en fazla ${MAX_DESC} karakter.`);
        }
        target.description = p.description.trim();
      }
      if (p.instructions !== undefined) {
        if (typeof p.instructions !== 'string' || p.instructions.length > MAX_INSTR) {
          return fail(CODES.BAD_REQUEST, `Yönerge en fazla ${MAX_INSTR} karakter.`);
        }
        target.instructions = p.instructions;
      }
      if (p.enabled !== undefined) target.enabled = Boolean(p.enabled);
      try {
        persist(skills);
      } catch {
        return fail(CODES.INTERNAL, 'Beceri kaydedilemedi.');
      }
      return ok({ skill: target, ...list().data });
    }

    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name || name.length > MAX_NAME) {
      return fail(CODES.BAD_REQUEST, `Beceri adı 1–${MAX_NAME} karakter olmalı.`);
    }
    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return fail(CODES.CONFLICT, 'Bu adla bir beceri zaten var.');
    }
    if (p.instructions !== undefined && (typeof p.instructions !== 'string' || p.instructions.length > MAX_INSTR)) {
      return fail(CODES.BAD_REQUEST, `Yönerge en fazla ${MAX_INSTR} karakter.`);
    }

    const entry = {
      id: makeId(),
      name,
      description: typeof p.description === 'string' ? p.description.trim().slice(0, MAX_DESC) : '',
      instructions: typeof p.instructions === 'string' ? p.instructions : '',
      scope: p.scope === 'project' ? 'project' : 'team',
      enabled: p.enabled === undefined ? true : Boolean(p.enabled),
      seeded: false,
      createdAt: new Date().toISOString()
    };
    skills.push(entry);
    try {
      persist(skills);
    } catch {
      return fail(CODES.INTERNAL, 'Beceri kaydedilemedi.');
    }
    return ok({ skill: entry, ...list().data });
  }

  function remove(input) {
    const p = input && typeof input === 'object' ? input : {};
    const skills = load();
    const i = skills.findIndex((s) => s.id === p.id);
    if (i < 0) return fail(CODES.NOT_FOUND, 'Beceri bulunamadı.');
    const [removed] = skills.splice(i, 1);
    try {
      persist(skills);
    } catch {
      return fail(CODES.INTERNAL, 'Beceri silinemedi.');
    }
    return ok({ removed: removed.id, ...list().data });
  }

  return { list, save, remove, filePath };
}

module.exports = { createSkillsService, SEED };
