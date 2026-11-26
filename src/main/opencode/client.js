'use strict';

/**
 * UYUMLULUK KATMANI (Tur 1 -> Tur 2).
 *
 * Tur 1'de ag cagrisi bu dosyadaydi. Tur 2'de tum HTTP `services/http-client.js`
 * icine tasindi (API-01: aga cikan TEK modul). Bu dosya yalnizca eski cagri
 * imzasini koruyan ince bir sarmalayicidir; kendi `fetch` cagrisi YOKTUR.
 *
 * Yeni kod bu dosyayi kullanmamali: `services/http-client.js` kullanin.
 * (Dosyanin kaldirilmasi YM onayi ister — silme onaysiz yasak.)
 */

const os = require('node:os');
const path = require('node:path');
const { createHttpClient } = require('../services/http-client');

const DEFAULT_BASE_URL = 'http://127.0.0.1:51764';
/* Sabit makine yolu YAZILMAZ: baska bir bilgisayarda var olmayan bir dizine
   isaret ederdi. Varsayilan, kullanicinin ev dizinindeki `Keyvotion`. */
const PROJECT_DIRECTORY = path.join(os.homedir(), 'Keyvotion');

function readPassword() {
  const value = process.env.OPENCODE_PASSWORD;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Eski imza: {status:'connected'|'unauthorized'|'no-password'|'unreachable', info?, error?}
 * @param {{baseUrl?: string, projectDirectory?: string}} [options]
 */
async function getInfo(options = {}) {
  const client = createHttpClient({
    getConfig: () => ({
      baseUrl: options.baseUrl || DEFAULT_BASE_URL,
      projectDir: options.projectDirectory || PROJECT_DIRECTORY
    }),
    getPassword: () => readPassword() || null
  });

  const res = await client.info();
  if (res.ok) return { status: 'connected', info: res.data };

  const code = res.error && res.error.code;
  if (code === 'E_SECRET_MISSING') return { status: 'no-password', error: 'parola tanimli degil' };
  if (code === 'E_UNAUTHORIZED') return { status: 'unauthorized', error: `HTTP ${res.error.status}` };
  return { status: 'unreachable', error: code || 'E_OFFLINE' };
}

module.exports = { getInfo, DEFAULT_BASE_URL, PROJECT_DIRECTORY };
