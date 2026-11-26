'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

/*
 * Izin matrisi — T4-4.
 *
 * Rol x yetenek matrisi. Ajan bir islem yapmadan once yetkisi sorulur.
 * Depolama: <proje>/.team/permissions.json (sir tutmaz)
 *
 * Guvenli varsayilan: yazma/ag/deploy yetkileri yalniz gerekli rollere acik.
 */

const ROLES = Object.freeze(['LDR', 'YM', 'ARC', 'DEV', 'DSN', 'QA', 'OPS']);

const CAPABILITIES = Object.freeze([
  { id: 'read.files', label: 'Dosya okuma', risk: 'low' },
  { id: 'write.files', label: 'Dosya yazma', risk: 'medium' },
  { id: 'run.commands', label: 'Komut çalıştırma', risk: 'high' },
  { id: 'network', label: 'Ağ erişimi', risk: 'medium' },
  { id: 'browser', label: 'Uygulama içi tarayıcı', risk: 'medium' },
  { id: 'memory.write', label: 'Hafızaya yazma', risk: 'low' },
  { id: 'deploy', label: 'Yayınlama / kurulum', risk: 'high' },
  { id: 'git', label: 'Sürüm kontrolü', risk: 'high' }
]);

const DEFAULTS = Object.freeze({
  LDR: { 'read.files': true, 'write.files': true, 'run.commands': true, network: true, browser: true, 'memory.write': true, deploy: true, git: true },
  YM: { 'read.files': true, 'write.files': true, 'run.commands': true, network: true, browser: true, 'memory.write': true, deploy: false, git: false },
  ARC: { 'read.files': true, 'write.files': false, 'run.commands': false, network: true, browser: true, 'memory.write': true, deploy: false, git: false },
  DEV: { 'read.files': true, 'write.files': true, 'run.commands': true, network: true, browser: false, 'memory.write': true, deploy: false, git: false },
  DSN: { 'read.files': true, 'write.files': true, 'run.commands': false, network: false, browser: true, 'memory.write': true, deploy: false, git: false },
  QA: { 'read.files': true, 'write.files': true, 'run.commands': true, network: true, browser: true, 'memory.write': true, deploy: false, git: false },
  OPS: { 'read.files': true, 'write.files': true, 'run.commands': true, network: true, browser: true, 'memory.write': true, deploy: true, git: true }
});

function createPermissionsService(options) {
  const getProjectDir = options.getProjectDir;

  function filePath() {
    return path.join(getProjectDir(), '.team', 'permissions.json');
  }

  function defaults() {
    const out = {};
    for (const role of ROLES) out[role] = { ...DEFAULTS[role] };
    return out;
  }

  function load() {
    let stored = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
      if (parsed && typeof parsed.matrix === 'object' && parsed.matrix) stored = parsed.matrix;
    } catch {
      stored = null;
    }
    const base = defaults();
    if (!stored) return base;
    /* Eksik hucre varsayilana duser (yeni yetenek eklenirse matris bozulmaz). */
    for (const role of ROLES) {
      if (!stored[role] || typeof stored[role] !== 'object') continue;
      for (const cap of CAPABILITIES) {
        if (typeof stored[role][cap.id] === 'boolean') base[role][cap.id] = stored[role][cap.id];
      }
    }
    return base;
  }

  function get() {
    const matrix = load();
    return ok({
      matrix,
      roles: ROLES.slice(),
      capabilities: CAPABILITIES.map((c) => ({ ...c })),
      path: filePath(),
      stored: fs.existsSync(filePath())
    });
  }

  /** Toplu kaydet: { matrix: { ROLE: { cap: bool } } } veya tek hucre {role, capability, value}. */
  function set(input) {
    const p = input && typeof input === 'object' ? input : {};
    const matrix = load();

    if (typeof p.role === 'string' && typeof p.capability === 'string') {
      if (!ROLES.includes(p.role)) return fail(CODES.BAD_REQUEST, 'Geçersiz rol.');
      if (!CAPABILITIES.some((c) => c.id === p.capability)) {
        return fail(CODES.BAD_REQUEST, 'Geçersiz yetenek.');
      }
      matrix[p.role][p.capability] = Boolean(p.value);
    } else if (p.matrix && typeof p.matrix === 'object') {
      for (const [role, caps] of Object.entries(p.matrix)) {
        if (!ROLES.includes(role)) continue;
        if (!caps || typeof caps !== 'object') continue;
        for (const cap of CAPABILITIES) {
          if (typeof caps[cap.id] === 'boolean') matrix[role][cap.id] = caps[cap.id];
        }
      }
    } else {
      return fail(CODES.BAD_REQUEST, 'Matris ya da tek hücre gerekli.');
    }

    try {
      fs.mkdirSync(path.dirname(filePath()), { recursive: true });
      fs.writeFileSync(
        filePath(),
        `${JSON.stringify({ matrix, updatedAt: new Date().toISOString() }, null, 2)}\n`,
        'utf8'
      );
    } catch {
      return fail(CODES.INTERNAL, 'İzinler kaydedilemedi.');
    }
    return get();
  }

  /** Ajan islemi icin tek sorgu — baska servisler kullanabilir. */
  function allows(role, capability) {
    const matrix = load();
    return Boolean(matrix[String(role || '').toUpperCase()] && matrix[String(role || '').toUpperCase()][capability]);
  }

  return { get, set, allows, filePath, ROLES, CAPABILITIES };
}

module.exports = { createPermissionsService, ROLES, CAPABILITIES, DEFAULTS };
