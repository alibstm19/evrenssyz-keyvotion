'use strict';

/**
 * Tek zarf (envelope) ve hata kodu sozlugu.
 * Kaynak: docs/console-api-contract.md §5.1 / §5.2.
 *
 * Basari : { ok: true,  data }
 * Hata   : { ok: false, error: { code, message, status, retryable, detail } }
 *
 * Hicbir alan parola/anahtar/token DEGERI tasimaz (API-03).
 */

const CODES = Object.freeze({
  OK: 'E_OK',
  BAD_REQUEST: 'E_BAD_REQUEST',
  UNAUTHORIZED: 'E_UNAUTHORIZED',
  FORBIDDEN: 'E_FORBIDDEN',
  NOT_FOUND: 'E_NOT_FOUND',
  BUSY: 'E_BUSY',
  CONFLICT: 'E_CONFLICT',
  DUPLICATE_ROLE: 'E_DUPLICATE_ROLE',
  TIMEOUT: 'E_TIMEOUT',
  RATE_LIMIT: 'E_RATE_LIMIT',
  SERVER: 'E_SERVER',
  OFFLINE: 'E_OFFLINE',
  PARSE: 'E_PARSE',
  VERSION: 'E_VERSION',
  SECRET_MISSING: 'E_SECRET_MISSING',
  SECRET_CORRUPT: 'E_SECRET_CORRUPT',
  CONFIRM_REQUIRED: 'E_CONFIRM_REQUIRED',
  LOCKED_OUT: 'E_LOCKED_OUT',
  UNKNOWN_CHANNEL: 'E_UNKNOWN_CHANNEL',
  INTERNAL: 'E_INTERNAL'
});

/** Kullaniciya gosterilebilir Turkce metinler (API-26). */
const MESSAGES = Object.freeze({
  E_BAD_REQUEST: 'İstek geçersiz.',
  E_UNAUTHORIZED: 'Parola geçersiz. Ayarlar’dan yeniden girin.',
  E_FORBIDDEN: 'Bu işlem sunucuda kapalı.',
  E_NOT_FOUND: 'Kayıt bulunamadı.',
  E_BUSY: 'Seans meşgul.',
  E_CONFLICT: 'Durum değişti, yenileniyor.',
  E_DUPLICATE_ROLE: 'Bu rol kodu zaten kullanımda.',
  E_TIMEOUT: 'Sunucu yanıt vermedi.',
  E_RATE_LIMIT: 'Çok fazla istek, biraz bekleyin.',
  E_SERVER: 'Sunucu hatası.',
  E_OFFLINE: 'Sunucuya ulaşılamadı.',
  E_PARSE: 'Yanıt okunamadı.',
  E_VERSION: 'Desteklenmeyen sunucu sürümü.',
  E_SECRET_MISSING: 'Kayıtlı parola yok.',
  E_SECRET_CORRUPT: 'Parola okunamadı, yeniden girin.',
  E_CONFIRM_REQUIRED: 'Onay gerekli.',
  E_LOCKED_OUT: 'Çok fazla deneme. 60 sn sonra.',
  E_UNKNOWN_CHANNEL: 'Bilinmeyen kanal.',
  E_INTERNAL: 'Beklenmeyen hata.'
});

/** Bu kodlar yeniden denenebilir (API-27). */
const RETRYABLE = new Set([
  CODES.TIMEOUT,
  CODES.OFFLINE,
  CODES.RATE_LIMIT,
  CODES.SERVER
]);

function ok(data) {
  return { ok: true, data: data === undefined ? null : data };
}

/**
 * @param {string} code
 * @param {string} [message]
 * @param {{status?: number|null, retryable?: boolean, detail?: unknown}} [extra]
 */
function fail(code, message, extra = {}) {
  const known = Object.prototype.hasOwnProperty.call(MESSAGES, code);
  return {
    ok: false,
    error: {
      code: known ? code : CODES.INTERNAL,
      message: message || (known ? MESSAGES[code] : MESSAGES.E_INTERNAL),
      status: extra.status === undefined ? null : extra.status,
      retryable: extra.retryable === undefined
        ? RETRYABLE.has(code)
        : Boolean(extra.retryable),
      detail: extra.detail === undefined ? null : extra.detail
    }
  };
}

/** HTTP durum kodu -> hata kodu (cevrimdisi/timeout ayri ele alinir). */
function fromHttpStatus(status) {
  if (status === 400) return CODES.BAD_REQUEST;
  if (status === 401) return CODES.UNAUTHORIZED;
  if (status === 403) return CODES.FORBIDDEN;
  if (status === 404) return CODES.NOT_FOUND;
  if (status === 409) return CODES.BUSY;
  if (status === 429) return CODES.RATE_LIMIT;
  if (status >= 500) return CODES.SERVER;
  return CODES.INTERNAL;
}

/** Arayuzden gelen deger zarf mi? (preload/main sinirinda) */
function isEnvelope(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.ok !== 'boolean') return false;
  if (value.ok === true) return true;
  return Boolean(value.error) && typeof value.error === 'object'
    && typeof value.error.code === 'string';
}

module.exports = {
  CODES,
  MESSAGES,
  ok,
  fail,
  fromHttpStatus,
  isEnvelope
};
