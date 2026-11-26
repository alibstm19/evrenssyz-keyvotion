'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CODES, ok, fail } = require('../../shared/errors');
const { parseTables } = require('./roster');

function stripCode(value) {
  return String(value || '').replace(/`/g, '').trim();
}

function splitModelRef(value) {
  const ref = stripCode(value);
  const index = ref.indexOf('/');
  if (index < 0) return { providerID: null, modelID: ref };
  return {
    providerID: ref.slice(0, index),
    modelID: ref.slice(index + 1)
  };
}

/** models.md havuz tablosunu ayristirir: Model | Karakter | Guclu oldugu isler. */
function parsePool(markdown) {
  const tables = parseTables(markdown);
  const target = tables.find((table) => {
    const first = (table.header[0] || '').toLowerCase();
    return first === 'model' || first === 'model adı';
  });
  if (!target) return [];

  const pool = [];
  for (const row of target.rows) {
    const refs = String(row[0] || '').match(/`([^`]+)`/g);
    if (!refs) continue;
    const names = refs.map((r) => r.replace(/`/g, '').trim()).filter(Boolean);
    for (const name of names) {
      if (!name.includes('/')) continue;
      const { providerID, modelID } = splitModelRef(name);
      pool.push({
        id: name,
        providerID,
        modelID,
        name: modelID,
        provider: providerID,
        character: row[1] || '',
        strengths: row[2] || ''
      });
    }
  }
  return pool;
}

/** models.md gorev tipi -> model kilavuzu tablosu. */
function parseGuide(markdown) {
  const tables = parseTables(markdown);
  const target = tables.find((table) => /görev tipi/i.test(table.header[0] || ''));
  if (!target) return [];
  return target.rows.map((row) => ({
    taskType: row[0] || '',
    primary: stripCode(row[1]),
    fallback: stripCode(row[2]),
    // Renderer uyum alanlari (Model Merkezi kilavuz sekmesi)
    id: stripCode(row[0]),
    name: stripCode(row[1]),
    role: stripCode(row[0]),
    note: stripCode(row[2])
  }));
}

/** /api/model ham Model -> beyaz liste (§4.2). settings/apiKey ASLA gecmez. */
function mapModel(raw, poolSet) {
  const capabilities = raw && raw.capabilities ? raw.capabilities : {};
  const variants = Array.isArray(raw && raw.variants) ? raw.variants : [];
  const ref = `${raw && raw.providerID ? raw.providerID : ''}/${raw && raw.id ? raw.id : ''}`;

  return {
    id: typeof raw.id === 'string' ? raw.id : null,
    providerID: typeof raw.providerID === 'string' ? raw.providerID : null,
    name: typeof raw.name === 'string' ? raw.name : null,
    type: typeof raw.type === 'string' ? raw.type : null,
    family: typeof raw.family === 'string' ? raw.family : null,
    capabilities: {
      tools: Boolean(capabilities.tools),
      input: Array.isArray(capabilities.input) ? capabilities.input.slice() : [],
      output: Array.isArray(capabilities.output) ? capabilities.output.slice() : []
    },
    variantIDs: variants
      .map((variant) => (variant && typeof variant.id === 'string' ? variant.id : null))
      .filter(Boolean),
    inPool: poolSet.has(ref)
  };
}

/**
 * @param {{http: object, getProjectDir: () => string}} deps
 */
function createModelsService(deps) {
  const http = deps.http;
  const getProjectDir = deps.getProjectDir;

  function modelsPath() {
    return path.join(getProjectDir(), '.team', 'models.md');
  }

  function readPoolMarkdown() {
    try {
      return fs.readFileSync(modelsPath(), 'utf8');
    } catch {
      return null;
    }
  }

  /** models.md havuzu (dosya yoksa bos liste; uygulama durmaz). */
  function pool() {
    const markdown = readPoolMarkdown();
    if (!markdown) {
      return ok({ pool: [], guide: [], available: false });
    }
    return ok({ pool: parsePool(markdown), guide: parseGuide(markdown), available: true });
  }

  /** Canli katalog + havuz birlestirme (F4). */
  async function catalog() {
    const poolRes = pool();
    const poolList = poolRes.ok ? poolRes.data.pool : [];
    const poolSet = new Set(poolList.map((item) => item.id));

    const res = await http.get('/api/model');
    if (!res.ok) {
      // Sunucu yoksa havuz yine de gosterilebilir (cevrimdisi mod).
      if (poolList.length > 0) {
        return ok({
          models: [],
          live: [],
          pool: poolList,
          guide: poolRes.ok ? poolRes.data.guide : [],
          offline: true,
          reason: res.error ? res.error.code : 'E_OFFLINE'
        });
      }
      return res;
    }

    const rawList = res.data && Array.isArray(res.data.data) ? res.data.data : [];
    const models = rawList.map((raw) => mapModel(raw, poolSet)).filter((m) => m.id);

    return ok({
      models,
      live: models,
      pool: poolList,
      guide: poolRes.ok ? poolRes.data.guide : [],
      offline: false
    });
  }

  /** Seans modeli degistirme — /api/session/{id}/model (E14). */
  async function assign(sessionID, model) {
    if (!sessionID) return fail(CODES.BAD_REQUEST, 'Seans kimliği gerekli.');
    if (typeof model !== 'string' || !model.includes('/')) {
      return fail(CODES.BAD_REQUEST, 'Model "sağlayıcı/model" biçiminde olmalı.');
    }
    const { providerID, modelID } = splitModelRef(model);
    if (!providerID || !modelID) {
      return fail(CODES.BAD_REQUEST, 'Model "sağlayıcı/model" biçiminde olmalı.');
    }

    const res = await http.post(`/api/session/${encodeURIComponent(sessionID)}/model`, {
      body: { providerID, modelID }
    });
    if (!res.ok) return res;
    return ok({ sessionID, model });
  }

  return { catalog, pool, assign, modelsPath };
}

module.exports = {
  createModelsService,
  parsePool,
  parseGuide,
  mapModel,
  splitModelRef
};
