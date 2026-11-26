'use strict';

/**
 * IPC yuku normalestiricisi.
 *
 * Renderer serbest alan adlari kullanir (`sessionId`, `taskId`, model nesnesi);
 * sozlesme (`docs/console-api-contract.md`) `sessionID` ve `"provider/id"`
 * bekler. Ceviri TEK yerde yapilir; servisler yalniz sozlesme adini gorur.
 *
 * T-029 eklemeleri:
 *  - `taskId` her zaman buyuk harf (T-029 -> T-029, `t-9` -> `T-9`).
 *  - `model` her iki yonde cozulur: `"provider/id"` -> `modelRef`, ya da
 *    `{id, providerID}` -> `model` + `modelRef`. `model` sozlesme alanidir;
 *    `modelRef` HTTP govdesi icin hazir nesnedir.
 *
 * @param {unknown} payload
 * @returns {Record<string, unknown>}
 */

/** "provider/id" -> {providerID, modelID} | null */
function toModelRef(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const slash = raw.indexOf('/');
  if (slash <= 0 || slash === raw.length - 1) return null;
  return {
    providerID: raw.slice(0, slash),
    modelID: raw.slice(slash + 1)
  };
}

function normalizePayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const clean = { ...source };

  if (clean.sessionID === undefined && typeof clean.sessionId === 'string') {
    clean.sessionID = clean.sessionId;
  }
  if (clean.sessionIDs === undefined && Array.isArray(clean.sessionIds)) {
    clean.sessionIDs = clean.sessionIds;
  }

  // gorev kimligi: iki ad da ayni degeri tasir, her zaman buyuk harf (t-9 -> T-9)
  const rawTask = clean.taskId !== undefined ? clean.taskId : clean.taskID;
  if (typeof rawTask === 'string' && rawTask.trim()) {
    const upper = rawTask.trim().toUpperCase();
    clean.taskId = upper;
    clean.taskID = upper;
  }

  // Model: nesne -> "provider/id" (+ modelRef), metin -> modelRef.
  if (clean.model && typeof clean.model === 'object'
    && typeof clean.model.providerID === 'string'
    && typeof clean.model.id === 'string') {
    clean.modelRef = { providerID: clean.model.providerID, modelID: clean.model.id };
    clean.model = `${clean.model.providerID}/${clean.model.id}`;
  } else if (typeof clean.model === 'string') {
    const ref = toModelRef(clean.model);
    if (ref) clean.modelRef = ref;
  }

  return clean;
}

module.exports = { normalizePayload, toModelRef };
