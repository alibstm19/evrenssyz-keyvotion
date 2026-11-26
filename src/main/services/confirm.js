'use strict';

const { CODES, fail } = require('../../shared/errors');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Kayit tavani. Tukenmis anahtarlar REPLAY'i onlemek icin hatirlanir; bu yuzden
 * kayitlar ASLA silinmez. Tavan dolarsa depo fail-closed davranir: yeni anahtar
 * REDDEDILIR, eskisi atilmaz. Boylece "tavan asildi -> eski kayit dustu ->
 * tekrar oynatilabilir" acigi kapanir.
 */
const MAX_ENTRIES = 10000;

/**
 * Siniflandirma sonucu -> kullaniciya donen kural etiketi.
 *
 * `capacity` burada durur ama `classify()` ASLA dondurmez: kapasite token'in
 * degil DEPONUN durumudur. Kontrolu `verify()` yapar.
 */
const RULES = Object.freeze({
  missing: 'missing',
  format: 'format',
  reuse: 'reuse',
  expired: 'expired',
  capacity: 'capacity',
  ok: 'ok'
});

/**
 * Onay anahtari dogrulayici (API-15 / API-41).
 *
 * Tasarim notu: arayuz onay modalini gectikten sonra kendi urettigi tek
 * kullanimlik anahtari gonderir (T-029: kopru uretmez). Main tarafi
 * (a) bicimi, (b) tek kullanim, (c) omru dogrular.
 *
 * T-034 (replay duzeltmesi):
 *   - Gecerli kullanim penceresi: ilk gorulme + TOKEN_TTL_MS.
 *   - Pencere icinde tekrar -> `reuse` (RED).
 *   - Pencere disinda (TTL asildi) -> `expired` (RED) ve anahtar "tukenmis"
 *     olarak ISARETLENIR; bir daha ASLA kabul edilmez.
 *   - Anahtar kaydi SILINMEZ: silinen kayit bir sonraki denemede "hic
 *     gorulmemis" olur ve replay'e kapi acar. Bellek tavani MAX_ENTRIES.
 *
 * T-035 (fail-closed kapasite):
 *   - Tavan dolunca (`seen.size >= maxEntries`) YENI anahtar `capacity` ile
 *     REDDEDILIR. Hicbir kayit silinmez, yani hicbir anahtar tekrar
 *     oynatilabilir hale gelmez.
 *
 * @param {{now?: () => number, maxEntries?: number}} [options]
 *   `now` yalniz test icin (TTL sahteleme).
 */
function createConfirmStore(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
    ? Math.floor(options.maxEntries)
    : MAX_ENTRIES;

  /**
   * token -> { at: ilk gorulme (epoch ms), spentAt: TTL asildigi an | null }
   * `spentAt !== null` ise anahtar tukenmistir (kalici RED).
   * @type {Map<string, {at: number, spentAt: number|null}>}
   */
  const seen = new Map();

  /**
   * Token'in hangi kurala takildigini soyler (YAN ETKISIZ — kayit degistirmez).
   *
   * Not: silme islemi burada YAPILMAZ. `classify` silerse, sirasi degisen bir
   * cagri suresi dolmus anahtari "hic gorulmemis" yapabilir; o da replay acigi
   * demektir. `capacity` de burada DONDURULMEZ (depo durumu, token durumu degil).
   *
   * @param {unknown} token
   * @param {number} [at]
   * @returns {'missing'|'format'|'reuse'|'expired'|'ok'}
   */
  function classify(token, at) {
    if (typeof token !== 'string' || token.length === 0) return RULES.missing;
    if (!TOKEN_PATTERN.test(token)) return RULES.format;

    const stamp = at === undefined ? now() : at;
    const entry = seen.get(token);
    if (entry === undefined) return RULES.ok;
    if (entry.spentAt !== null) return RULES.expired;
    if (stamp - entry.at > TOKEN_TTL_MS) return RULES.expired;
    return RULES.reuse;
  }

  /**
   * @param {unknown} token
   * @param {string} op
   * @returns {null | {ok: false}} hata zarfı ya da null (gecerli)
   */
  function verify(token, op) {
    const at = now();

    // DIKKAT: burada sweep/prune yapilmaz. Suresi dolmus anahtarin kaydi
    // silinirse classify onu "ok" sanar ve replay'e izin verilir.
    const rule = classify(token, at);

    if (rule === RULES.missing || rule === RULES.format) {
      return fail(CODES.CONFIRM_REQUIRED, 'Onay gerekli. İşlem gönderilmedi.', {
        detail: `${op || 'op'}|rule:${rule}`
      });
    }

    if (rule === RULES.reuse) {
      return fail(CODES.CONFIRM_REQUIRED, 'Onay anahtarı daha önce kullanılmış.', {
        detail: `${op || 'op'}|rule:${rule}`
      });
    }

    // TTL penceresi kapandi: anahtar KALICI olarak tukenir, islem GECMEZ.
    if (rule === RULES.expired) {
      const entry = seen.get(token);
      // Kaydi silmiyoruz; "tukendi" isaretliyoruz. Boylece ayni anahtar
      // sonraki denemelerde de `expired` kalir (replay kapali).
      if (entry && entry.spentAt === null) entry.spentAt = at;
      return fail(
        CODES.CONFIRM_REQUIRED,
        'Onay anahtarının süresi doldu. Yeniden onaylayın.',
        { detail: `${op || 'op'}|rule:${rule}` }
      );
    }

    // Yalnizca `ok` (daha once hic gorulmemis) kabul edilir. Tavan buysa
    // fail-closed: yeni anahtar REDDEDILIR, eski kayit SILINMEZ (silmek
    // eski anahtari tekrar oynatilabilir yapar).
    if (seen.size >= maxEntries) {
      return fail(CODES.CONFIRM_REQUIRED, 'Onay deposu dolu. Konsolu yeniden başlatın.', {
        detail: `${op || 'op'}|rule:${RULES.capacity}`
      });
    }

    seen.set(token, { at, spentAt: null });
    return null;
  }

  return {
    verify,
    classify,
    size: () => seen.size,
    spent: () => {
      let count = 0;
      for (const entry of seen.values()) if (entry.spentAt !== null) count += 1;
      return count;
    },
    TOKEN_TTL_MS,
    MAX_ENTRIES: maxEntries
  };
}

module.exports = {
  createConfirmStore,
  TOKEN_PATTERN,
  TOKEN_TTL_MS,
  MAX_ENTRIES,
  RULES
};
