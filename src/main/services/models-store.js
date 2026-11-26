'use strict';

/**
 * T-104 — Yerel model deposu çekirdeği (katalog + kuyruk + indirme + hash).
 *
 * KURALLAR
 *  - Ağ çağrısı YAPMAZ: indirme `download` olarak enjekte edilir
 *    (üründe `http-client.downloadToFile`). Bu yüzden bu dosyada ağ modülü yok.
 *  - Sır yok: anahtarsız kamuya açık indirme.
 *  - Uydurma yok: ETA yetersiz örnekte null; `ready` yalnız hash eşleşince.
 *  - `.part` iptal/hata durumunda KORUNUR (devam edilebilir).
 *
 * Durum sözlüğü (tek alan): absent | queued | downloading | verifying | ready | failed | paused
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATE_FILE = 'models-state.json';
const PROGRESS_THROTTLE_MS = 250;
const ETA_WINDOW_MS = 5000;
const ETA_MIN_SAMPLES = 3;
const PROGRESS_TYPE = 'model.progress';

const FORBIDDEN_PREFIXES = Object.freeze([
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
  'c:\\system volume information',
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/dev',
  '/proc',
  '/sys'
]);

function okEnvelope(data) {
  return { ok: true, data };
}

function failEnvelope(code, message, detail) {
  return {
    ok: false,
    error: {
      code,
      message,
      status: null,
      retryable: false,
      detail: detail === undefined ? null : detail
    }
  };
}

function normalizePath(value) {
  return path.resolve(value).toLowerCase().replace(/[\\/]+$/, '');
}

/** Hedef klasör politikası: sürücü kökü ve sistem klasörleri reddedilir. */
function isForbiddenDir(dir) {
  const resolved = normalizePath(dir);
  if (!resolved) return true;
  const parsed = path.parse(path.resolve(dir));
  const root = normalizePath(parsed.root);
  if (resolved === root) return true;
  return FORBIDDEN_PREFIXES.some((prefix) => resolved === prefix || resolved.startsWith(`${prefix}\\`));
}

function withinDir(rootDir, candidate) {
  const root = normalizePath(rootDir);
  const target = normalizePath(candidate);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function diskInfo(dir) {
  try {
    const stats = fs.statfsSync(dir);
    const blockSize = Number(stats.bsize) || 0;
    return {
      freeBytes: Number(stats.bavail) * blockSize,
      totalBytes: Number(stats.blocks) * blockSize
    };
  } catch {
    return { freeBytes: null, totalBytes: null };
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function fileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

/**
 * @param {{baseDir: string, catalogPath?: string,
 *          download: (input: object) => Promise<object>, now?: () => number}} options
 */
function createModelsStore(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const baseDir = opts.baseDir;
  const catalogPath = opts.catalogPath || path.join(baseDir, 'models.catalog.json');
  const download = opts.download;
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const statePath = path.join(baseDir, STATE_FILE);
  /* API-51g — host beyaz listesi indirme cagrisina dek tasinir (T-110). */
  const allowedHosts = Array.isArray(opts.allowedHosts) ? opts.allowedHosts : [];
  const allowInsecureLoopback = opts.allowInsecureLoopback === true;

  const listeners = new Set();
  const jobs = [];
  const queue = [];
  let activeJob = null;
  let jobSeq = 0;

  /* ------------------------------------------------------------- kalıcılık */

  function loadRecords() {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.models && typeof parsed.models === 'object') {
        return parsed.models;
      }
    } catch { /* yok / bozuk — temiz basla */ }
    return {};
  }

  function persistRecords() {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
      const tmp = `${statePath}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify({ models: records, updatedAt: new Date(now()).toISOString() }, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, statePath);
    } catch { /* durum yazılamadı — bellekteki kayıt geçerli */ }
  }

  const records = loadRecords();

  /* ------------------------------------------------------------- katalog */

  function loadCatalog() {
    let raw;
    try {
      raw = fs.readFileSync(catalogPath, 'utf8');
    } catch {
      return { items: [], error: 'E_NOT_FOUND' };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { items: [], error: 'E_PARSE' };
      const items = parsed
        .filter((item) => item && typeof item.id === 'string' && item.id.trim())
        .map((item) => ({
          id: item.id.trim(),
          name: typeof item.name === 'string' ? item.name : item.id,
          sizeBytes: Number(item.sizeBytes) || 0,
          sha256: typeof item.sha256 === 'string' ? item.sha256.toLowerCase() : null,
          url: typeof item.url === 'string' ? item.url : null,
          license: typeof item.license === 'string' ? item.license : null,
          runtime: item.runtime && typeof item.runtime === 'object' ? item.runtime : null
        }));
      return { items, error: null };
    } catch {
      return { items: [], error: 'E_PARSE' };
    }
  }

  function catalogEntry(modelID) {
    return loadCatalog().items.find((item) => item.id === modelID) || null;
  }

  /* ------------------------------------------------------------- ilerleme */

  function emit(job, force) {
    const moment = now();
    if (!force && job._lastEmit && moment - job._lastEmit < PROGRESS_THROTTLE_MS) return;
    job._lastEmit = moment;

    if (job._samples) {
      job._samples.push({ t: moment, bytes: job.receivedBytes });
      while (job._samples.length && moment - job._samples[0].t > ETA_WINDOW_MS) job._samples.shift();
    }

    let etaSec = null;
    const samples = job._samples || [];
    if (samples.length >= ETA_MIN_SAMPLES && job.totalBytes > 0) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsedSec = (last.t - first.t) / 1000;
      const movedBytes = last.bytes - first.bytes;
      if (elapsedSec > 0 && movedBytes > 0) {
        const speed = movedBytes / elapsedSec;
        const remaining = Math.max(0, job.totalBytes - job.receivedBytes);
        etaSec = Math.max(0, Math.round(remaining / speed));
      }
    }

    job.percent = job.totalBytes > 0
      ? Math.min(100, Math.round((job.receivedBytes / job.totalBytes) * 100))
      : 0;

    const payload = {
      type: PROGRESS_TYPE,
      jobId: job.id,
      modelID: job.modelID,
      state: job.state,
      receivedBytes: job.receivedBytes,
      totalBytes: job.totalBytes,
      percent: job.percent,
      etaSec,
      at: new Date(moment).toISOString()
    };
    for (const listener of listeners) {
      try { listener(payload); } catch { /* dinleyici hatası indirmeyi durdurmaz */ }
    }
  }

  function onProgress(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* ------------------------------------------------------------- kuyruk */

  function pump() {
    if (activeJob) return;
    const next = queue.shift();
    if (!next) return;
    activeJob = next;
    runJob(next)
      .catch((error) => {
        next.state = 'failed';
        next.error = error && error.code ? error.code : 'E_INTERNAL';
        emit(next, true);
      })
      .finally(() => {
        activeJob = null;
        pump();
      });
  }

  async function runJob(job) {
    const entry = catalogEntry(job.modelID);
    const partPath = job.partPath;
    const finalPath = job.finalPath;

    job._samples = [];
    job.state = 'downloading';
    emit(job, true);

    let result;
    try {
      result = await download({
        url: entry ? entry.url : null,
        destPath: partPath,
        expectedBytes: entry ? entry.sizeBytes : null,
        resumeFrom: fileSize(partPath) || 0,
        signal: job.controller.signal,
        allowedHosts,
        allowInsecureLoopback,
        onProgress: (progress) => {
          if (progress && Number.isFinite(progress.receivedBytes)) {
            job.receivedBytes = progress.receivedBytes;
            if (Number.isFinite(progress.totalBytes) && progress.totalBytes > 0) {
              job.totalBytes = progress.totalBytes;
            }
          }
          if (job.state === 'downloading') emit(job, false);
        }
      });
    } catch (error) {
      result = failEnvelope('E_NETWORK', (error && error.message) || 'İndirme başarısız.');
    }

    if (!result || !result.ok) {
      const code = result && result.error && result.error.code ? result.error.code : 'E_NETWORK';
      job.error = code;
      job.state = code === 'E_CANCELLED' ? 'paused' : 'failed';
      emit(job, true);
      return;
    }

    job.receivedBytes = result.data.receivedBytes;
    if (Number.isFinite(result.data.totalBytes)) job.totalBytes = result.data.totalBytes;
    /* Son indirme paketi zorunlu: kisa indirmelerde throttle ara paket uretmeyebilir. */
    emit(job, true);
    job.state = 'verifying';
    emit(job, true);

    let digest = null;
    try {
      digest = sha256File(partPath);
    } catch {
      job.state = 'failed';
      job.error = 'E_NETWORK';
      emit(job, true);
      return;
    }

    const expected = entry && entry.sha256 ? entry.sha256.toLowerCase() : null;
    const matches = Boolean(expected) && digest === expected;
    if (!matches) {
      job.sha256 = digest;
      job.state = 'failed';
      job.error = 'E_HASH_MISMATCH';
      /* .part KORUNUR: kullanıcı yeniden deneyebilir. */
      records[job.modelID] = {
        targetDir: job.targetDir,
        finalPath,
        partPath,
        state: 'failed',
        sha256: expected,
        actualSha256: digest,
        sizeBytes: job.receivedBytes,
        updatedAt: new Date(now()).toISOString()
      };
      persistRecords();
      emit(job, true);
      return;
    }

    try {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      fs.renameSync(partPath, finalPath);
    } catch {
      job.state = 'failed';
      job.error = 'E_NETWORK';
      emit(job, true);
      return;
    }

    job.sha256 = digest;
    job.state = 'ready';
    job.error = null;
    records[job.modelID] = {
      targetDir: job.targetDir,
      finalPath,
      partPath,
      state: 'ready',
      sha256: digest,
      sizeBytes: job.receivedBytes,
      updatedAt: new Date(now()).toISOString()
    };
    persistRecords();
    emit(job, true);
  }

  /* ------------------------------------------------------------- API */

  function list() {
    const catalog = loadCatalog();
    const rootCandidates = [
      path.join(baseDir, 'models'),
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Keyvotion', 'models') : null
    ].filter(Boolean);

    const seen = new Set();
    const roots = [];
    for (const candidate of rootCandidates) {
      const resolved = path.resolve(candidate);
      if (seen.has(resolved.toLowerCase())) continue;
      seen.add(resolved.toLowerCase());
      let writable = false;
      try {
        fs.mkdirSync(resolved, { recursive: true });
        fs.accessSync(resolved, fs.constants.W_OK);
        writable = true;
      } catch {
        writable = false;
      }
      roots.push({ path: resolved, ...diskInfo(resolved), writable });
    }

    const diskRoot = (roots.find((root) => root.writable) || roots[0] || { path: null }).path;
    const disk = diskRoot
      ? { root: diskRoot, ...diskInfo(diskRoot) }
      : { root: null, freeBytes: null, totalBytes: null };

    const models = catalog.items.map((item) => {
      const record = records[item.id] || null;
      const partPath = record ? record.partPath : null;
      const partExists = partPath ? fileSize(partPath) !== null : false;
      const state = record && record.state
        ? record.state
        : (partExists ? 'paused' : 'absent');
      return {
        id: item.id,
        name: item.name,
        sizeBytes: item.sizeBytes,
        sha256: item.sha256,
        license: item.license,
        runtime: item.runtime,
        state,
        targetDir: record ? record.targetDir : null,
        path: record ? record.finalPath : null,
        receivedBytes: partExists ? fileSize(partPath) : (record ? record.sizeBytes || 0 : 0)
      };
    });

    return {
      runtime: { kind: 'none', state: 'absent' },
      roots,
      disk,
      jobs: jobs.map((job) => ({
        id: job.id,
        modelID: job.modelID,
        state: job.state,
        receivedBytes: job.receivedBytes,
        totalBytes: job.totalBytes,
        percent: job.percent,
        error: job.error || null,
        targetDir: job.targetDir
      })),
      models,
      catalogPath,
      catalogError: catalog.error
    };
  }

  function install(input) {
    const p = input && typeof input === 'object' ? input : {};
    const modelID = typeof p.modelID === 'string' ? p.modelID.trim() : '';
    const entry = catalogEntry(modelID);
    if (!entry) return failEnvelope('E_NOT_FOUND', 'Model katalogda yok.');
    if (p.confirmed !== true) return failEnvelope('E_CONFIRM_REQUIRED', 'Kurulum için onay gerekli.');

    const targetDir = typeof p.targetDir === 'string' ? p.targetDir.trim() : '';
    if (!targetDir || !path.isAbsolute(targetDir)) {
      return failEnvelope('E_FORBIDDEN', 'Hedef klasör mutlak bir yol olmalı.');
    }
    if (isForbiddenDir(targetDir)) {
      return failEnvelope('E_FORBIDDEN', 'Bu klasöre model kurulamaz.');
    }

    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch {
      return failEnvelope('E_FORBIDDEN', 'Hedef klasör oluşturulamadı.');
    }

    if (!entry.sha256) {
      return failEnvelope('E_NOT_FOUND', 'Katalog girdisinde sha256 yok; otomatik kurulum yapılmaz.');
    }

    const { freeBytes } = diskInfo(targetDir);
    const needed = Math.ceil((Number(entry.sizeBytes) || 0) * 1.2);
    if (freeBytes !== null && freeBytes < needed) {
      return failEnvelope('E_DISK_FULL', 'Yeterli boş alan yok.', { freeBytes, needed });
    }

    jobSeq += 1;
    const jobId = `job_${now().toString(36)}_${jobSeq}`;
    const partPath = path.join(targetDir, `${modelID}.part`);
    const finalPath = path.join(targetDir, modelID);
    const job = {
      id: jobId,
      modelID,
      targetDir,
      partPath,
      finalPath,
      state: 'queued',
      receivedBytes: fileSize(partPath) || 0,
      totalBytes: Number(entry.sizeBytes) || 0,
      percent: 0,
      error: null,
      controller: new AbortController(),
      _lastEmit: 0,
      _samples: []
    };
    jobs.push(job);
    queue.push(job);
    emit(job, true);
    pump();
    return okEnvelope({ jobId, state: 'queued' });
  }

  function cancel(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (p.confirmed !== true) return failEnvelope('E_CONFIRM_REQUIRED', 'İptal için onay gerekli.');
    const job = jobs.find((item) => item.id === p.jobId) || null;
    if (!job) return failEnvelope('E_NOT_FOUND', 'İş bulunamadı.');
    if (job.state === 'ready') return failEnvelope('E_FORBIDDEN', 'Tamamlanmış iş iptal edilemez.');
    try { job.controller.abort(); } catch { /* zaten iptal */ }
    job.state = 'paused';
    job.error = 'E_CANCELLED';
    emit(job, true);
    return okEnvelope({ jobId: job.id, state: 'cancelled', receivedBytes: job.receivedBytes });
  }

  async function verify(input) {
    const p = input && typeof input === 'object' ? input : {};
    const modelID = typeof p.modelID === 'string' ? p.modelID.trim() : '';
    const entry = catalogEntry(modelID);
    if (!entry) return failEnvelope('E_NOT_FOUND', 'Model katalogda yok.');
    const record = records[modelID] || null;
    const filePath = record && record.finalPath && fs.existsSync(record.finalPath)
      ? record.finalPath
      : (record && record.partPath && fs.existsSync(record.partPath) ? record.partPath : null);
    if (!filePath) return failEnvelope('E_NOT_FOUND', 'İndirilmiş dosya yok.');

    const started = now();
    let digest;
    try {
      digest = sha256File(filePath);
    } catch {
      return failEnvelope('E_NETWORK', 'Dosya okunamadı.');
    }
    const expected = entry.sha256 ? entry.sha256.toLowerCase() : null;
    const verified = Boolean(expected) && digest === expected;

    if (record) {
      record.state = verified ? 'ready' : 'failed';
      if (verified) {
        record.finalPath = filePath;
        record.sha256 = digest;
      }
      persistRecords();
    }

    return okEnvelope({
      verified,
      sha256: digest,
      sizeBytes: fileSize(filePath) || 0,
      elapsedMs: Math.max(0, now() - started)
    });
  }

  function remove(input) {
    const p = input && typeof input === 'object' ? input : {};
    const modelID = typeof p.modelID === 'string' ? p.modelID.trim() : '';
    if (p.confirmed !== true) return failEnvelope('E_CONFIRM_REQUIRED', 'Silme için onay gerekli.');
    const record = records[modelID] || null;
    if (!record) return failEnvelope('E_NOT_FOUND', 'Kurulu model bulunamadı.');
    if (record.state !== 'ready' && record.state !== 'failed') {
      return failEnvelope('E_FORBIDDEN', 'Bu durumdaki model silinemez.');
    }
    if (!record.finalPath || !withinDir(record.targetDir, record.finalPath)) {
      return failEnvelope('E_FORBIDDEN', 'Hedef klasör dışına çıkılamaz.');
    }

    let freedBytes = 0;
    let deleted = 0;
    for (const candidate of [record.finalPath, record.partPath]) {
      if (!candidate || !withinDir(record.targetDir, candidate)) continue;
      const size = fileSize(candidate);
      if (size === null) continue;
      try {
        fs.unlinkSync(candidate);
        freedBytes += size;
        deleted += 1;
      } catch { /* tek dosya silinemezse diğeri denenir */ }
    }
    if (!deleted) return failEnvelope('E_NOT_FOUND', 'Silinecek dosya bulunamadı.');

    delete records[modelID];
    persistRecords();
    return okEnvelope({ removed: true, freedBytes });
  }

  return { list, install, cancel, verify, remove, onProgress };
}

module.exports = { createModelsStore, isForbiddenDir, PROGRESS_TYPE, STATE_FILE };
