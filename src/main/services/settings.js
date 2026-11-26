'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');

/*
 * Varsayilan proje dizini: kullanicinin kendi ev dizininde `Keyvotion`.
 * Sabit bir makine yolu YAZILMAZ — aksi halde baska bir bilgisayarda kurulum
 * var olmayan bir dizine isaret eder ve pano/hafiza yazimlari ENOENT verir.
 */
const DEFAULT_PROJECT_DIR = path.join(os.homedir(), 'Keyvotion');
const DEFAULT_SERVER_URL = 'http://127.0.0.1:51764';
const SCHEMA_VERSION = 1;

const DEFAULT_CONFIG = Object.freeze({
  serverURL: DEFAULT_SERVER_URL,
  projectDir: DEFAULT_PROJECT_DIR,
  theme: 'dark',
  density: 'comfortable',
  language: 'tr',
  /* T-153: ilk-kurulum akışının tamamlanıp tamamlanmadığı. Sır içermez. */
  onboarded: false,
  /*
   * Yerel erişim izni (kullanıcı onayı): açıkken Dosyalar ekranı yalnız proje
   * klasörünü değil, bu bilgisayarın her yerini gezdirir (sır dosyaları hariç).
   * Varsayılan KAPALI — onay olmadan makineye erişim yok.
   */
  localAccess: false,
  /* İzin sorusu bir kez sorulur; "şimdi değil" de cevap sayılır. */
  localAccessAsked: false,
  schemaVersion: SCHEMA_VERSION
});

function isLoopback(url) {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Ayar + sir servisi.
 * - config.json: SIR YOK (§4.6)
 * - secrets.bin: safeStorage (DPAPI) ile sifreli parola
 *
 * @param {{baseDir: string, safeStorage?: object, envPassword?: () => string|undefined}} options
 */
function createSettings(options) {
  const baseDir = options.baseDir;
  const safeStorage = options.safeStorage || null;
  const envPassword = options.envPassword || (() => process.env.OPENCODE_PASSWORD);

  const configPath = path.join(baseDir, 'config.json');
  const secretsPath = path.join(baseDir, 'secrets.bin');

  let cache = null;

  function ensureDir() {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  function sanitize(input) {
    const next = { ...DEFAULT_CONFIG };
    if (input && typeof input === 'object') {
      if (typeof input.serverURL === 'string' && input.serverURL.trim()) next.serverURL = input.serverURL.trim();
      if (typeof input.projectDir === 'string' && input.projectDir.trim()) next.projectDir = input.projectDir.trim();
      if (input.theme === 'dark' || input.theme === 'light') next.theme = input.theme;
      if (input.density === 'comfortable' || input.density === 'compact') next.density = input.density;
      if (typeof input.language === 'string' && input.language) next.language = input.language;
      if (typeof input.onboarded === 'boolean') next.onboarded = input.onboarded;
      if (typeof input.localAccess === 'boolean') next.localAccess = input.localAccess;
      if (typeof input.localAccessAsked === 'boolean') next.localAccessAsked = input.localAccessAsked;
    }
    next.schemaVersion = SCHEMA_VERSION;
    return next;
  }

  function loadRaw() {
    if (cache) return cache;
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      cache = sanitize(parsed);
    } catch {
      cache = sanitize(null);
    }
    return cache;
  }

  /** Parola degerini okur: (1) secrets.bin (2) OPENCODE_PASSWORD (3) null. */
  function getPassword() {
    if (fs.existsSync(secretsPath)) {
      try {
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          const encrypted = fs.readFileSync(secretsPath);
          const plain = safeStorage.decryptString(encrypted);
          if (plain) return plain;
        }
      } catch {
        // Cozulemezse env'e dus; durum state() ile bildirilir.
      }
    }
    const fromEnv = envPassword();
    if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
    return null;
  }

  /** 'stored' | 'missing' | 'corrupt' — DEGER DONDURMEZ. */
  function secretState() {
    if (!fs.existsSync(secretsPath)) {
      const fromEnv = envPassword();
      return typeof fromEnv === 'string' && fromEnv.trim() ? 'stored' : 'missing';
    }
    try {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) return 'corrupt';
      const plain = safeStorage.decryptString(fs.readFileSync(secretsPath));
      return plain ? 'stored' : 'corrupt';
    } catch {
      return 'corrupt';
    }
  }

  function toPublic() {
    const cfg = loadRaw();
    return {
      serverURL: cfg.serverURL,
      projectDir: cfg.projectDir,
      theme: cfg.theme,
      density: cfg.density,
      language: cfg.language,
      onboarded: cfg.onboarded,
      localAccess: cfg.localAccess,
      localAccessAsked: cfg.localAccessAsked,
      schemaVersion: cfg.schemaVersion,
      secretState: secretState(),
      secureWarning: !isLoopback(cfg.serverURL)
    };
  }

  function get() {
    return ok(toPublic());
  }

  /**
   * @param {{serverURL?: string, projectDir?: string, theme?: 'dark'|'light',
   *          density?: 'comfortable'|'compact', language?: string,
   *          onboarded?: boolean, localAccess?: boolean,
   *          localAccessAsked?: boolean}} patch
   */
  function set(patch) {
    if (!patch || typeof patch !== 'object') {
      return fail(CODES.BAD_REQUEST, 'Geçersiz ayar isteği.');
    }
    if (patch.serverURL !== undefined) {
      if (typeof patch.serverURL !== 'string' || !/^https?:\/\//i.test(patch.serverURL)) {
        return fail(CODES.BAD_REQUEST, 'Sunucu adresi geçersiz.');
      }
    }
    if (patch.projectDir !== undefined && typeof patch.projectDir !== 'string') {
      return fail(CODES.BAD_REQUEST, 'Proje dizini geçersiz.');
    }
    /* Secilen dizin yoksa olusturulur: pano/hafiza/proje dosyalari ilk yazimda
       ENOENT vermesin. Olusturulamiyorsa ayar kabul edilmez (yanlis vaat yok). */
    if (typeof patch.projectDir === 'string' && patch.projectDir.trim()) {
      try {
        fs.mkdirSync(patch.projectDir.trim(), { recursive: true });
      } catch {
        return fail(CODES.BAD_REQUEST, 'Proje dizini oluşturulamadı; yol yazılabilir değil.');
      }
    }

    const merged = sanitize({ ...loadRaw(), ...patch });
    try {
      ensureDir();
      fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    } catch {
      return fail(CODES.INTERNAL, 'Ayarlar yazılamadı.');
    }
    cache = merged;
    return get();
  }

  /** Parolayi DPAPI ile sifreleyip yazar; degeri geri dondurmez (API-52). */
  function setPassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
      return fail(CODES.BAD_REQUEST, 'Parola boş olamaz.');
    }
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
      return fail(CODES.INTERNAL, 'Parola şifreleme bu sistemde kullanılamıyor (DPAPI yok).');
    }
    try {
      ensureDir();
      const encrypted = safeStorage.encryptString(password);
      fs.writeFileSync(secretsPath, encrypted);
    } catch {
      return fail(CODES.INTERNAL, 'Parola kaydedilemedi.');
    }
    return ok({ secretState: secretState() });
  }

  /** http-client icin: {baseUrl, projectDir} */
  function connection() {
    const cfg = loadRaw();
    return { baseUrl: cfg.serverURL, projectDir: cfg.projectDir };
  }

  return {
    get,
    set,
    setPassword,
    getPassword,
    secretState,
    connection,
    toPublic,
    configPath,
    secretsPath,
    DEFAULT_PROJECT_DIR
  };
}

module.exports = {
  createSettings,
  DEFAULT_CONFIG,
  DEFAULT_PROJECT_DIR,
  DEFAULT_SERVER_URL,
  SCHEMA_VERSION,
  isLoopback
};
