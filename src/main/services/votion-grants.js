'use strict';

/**
 * Votion oturum yetkileri — T-198.
 *
 * Kullanıcı kararı (2026-11-24): "oturum onayı". Bir yetenek bir kez onaylanınca
 * uygulama oturumu boyunca geçerlidir; uygulama kapanınca sıfırlanır. Disk
 * üzerinde kalıcı yetki yazılmaz: yeni açılışta her şey kapalıdır (fail-closed).
 *
 * Yetenekler yalnız VOTION_ACT içinde kullanılır; serbest kabuk yoktur. Komut
 * çalıştırma ve dosya yazma ayrı ayrı onay ister. Her kullanım `votion/actions.jsonl`
 * ve denetim günlüğüne yazılır.
 */

const CAPABILITIES = Object.freeze([
  {
    id: 'run.commands',
    label: 'Komut çalıştırma',
    risk: 'high',
    detail: 'Beyaz listedeki araçlar (node, npm, npx, git, python) yalnız proje dizininde, zaman aşımıyla.'
  },
  {
    id: 'write.files',
    label: 'Proje içinde kod düzenleme',
    risk: 'high',
    detail: 'Proje kökünün içindeki metin dosyaları; her yazmadan önce yedek alınır, .env ve sır dosyaları kapalı.'
  }
]);

const KNOWN = new Set(CAPABILITIES.map((c) => c.id));

function createVotionGrants(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  /* Yetenek -> verildiği an (epoch ms). Uygulama oturumu = süreç ömrü. */
  const granted = new Map();

  function list() {
    return {
      grantedAt: new Date(now()).toISOString(),
      session: true,
      capabilities: CAPABILITIES.map((c) => ({
        ...c,
        granted: granted.has(c.id),
        at: granted.has(c.id) ? new Date(granted.get(c.id)).toISOString() : null
      }))
    };
  }

  function has(capability) {
    return KNOWN.has(capability) && granted.has(capability);
  }

  function grant(capability) {
    if (!KNOWN.has(capability)) return { ok: false, reason: 'unknown' };
    if (!granted.has(capability)) granted.set(capability, now());
    return { ok: true, capability, granted: true };
  }

  function revoke(capability) {
    if (!KNOWN.has(capability)) return { ok: false, reason: 'unknown' };
    granted.delete(capability);
    return { ok: true, capability, granted: false };
  }

  function reset() {
    const count = granted.size;
    granted.clear();
    return { ok: true, cleared: count };
  }

  return { list, has, grant, revoke, reset, CAPABILITIES };
}

module.exports = { createVotionGrants, CAPABILITIES };
