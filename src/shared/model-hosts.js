'use strict';

/**
 * API-51g - yerel model indirmesinde izinli host tabanlari (TEK KAYNAK).
 * Tam eslesme VEYA `.taban` ile biten alt alan adi kabul edilir
 * (HuggingFace `us.aws.cdn.hf.co` gibi dinamik CDN host'lari icin).
 * URL kullanici tarafindan yazilamaz; katalog `work/models.catalog.json` tek kaynaktir.
 */
const MODEL_HOST_ALLOWLIST = Object.freeze([
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'hf.co',
  'cdn-lfs.hf.co'
]);

module.exports = { MODEL_HOST_ALLOWLIST };
