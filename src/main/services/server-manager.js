'use strict';

/**
 * Yerel OpenCode sunucusu yoneticisi (T6-6).
 *
 * SORUN: Konsol "cevrim disi" gorunuyordu; kullanici nedenini ve nasil
 * duzeltecegini bilmiyordu. Kok neden: sunucu adresi sabit (127.0.0.1:51764),
 * surec ayakta degilse hicbir geri bildirim yoktu.
 *
 * COZUM: Durum gercekten OLCULUR (port + /api/info), surec baslatilabilir
 * (opencode serve), ve her durumda kullaniciya ne oldugu yazilir.
 *
 * KURALLAR
 *  - Ag cagrisi yapmaz: http-client (API-01) uzerinden gider.
 *  - Parola diske yazilmaz; SettingsService.getPassword() (DPAPI) kullanilir.
 *  - Baslatma icin onay (confirmToken) gerekir; API-51a.
 */

const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { CODES, ok, fail } = require('../../shared/errors');

const DEFAULT_PORT = 51764;
const DEFAULT_HOST = '127.0.0.1';

/** Portu dinleyen bir sey var mi? (hizli, ag cagrisi degil) */
function portOpen(port, host, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* yok */ }
      resolve(value);
    };
    socket.setTimeout(timeoutMs || 900, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function parseTarget(serverURL) {
  const raw = typeof serverURL === 'string' && serverURL.trim() ? serverURL.trim() : `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
  try {
    const u = new URL(raw);
    return {
      url: `${u.protocol}//${u.host}`,
      host: u.hostname || DEFAULT_HOST,
      port: Number(u.port) || DEFAULT_PORT
    };
  } catch {
    return { url: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`, host: DEFAULT_HOST, port: DEFAULT_PORT };
  }
}

/**
 * @param {{baseDir:string, httpClient:object, settings:object, audit?:object, opencodeBin?:string|null}} options
 */
function createServerManager(options) {
  const httpClient = options.httpClient;
  const settings = options.settings;
  const audit = options.audit || { append() {} };
  const opencodeBin = options.opencodeBin || null;

  /** Bizim baslattigimiz surec (yalniz bu sureci durdururuz — yabanci surece dokunmayiz). */
  let child = null;
  let startedAt = null;
  let lastError = null;
  let lastCheck = null;

  function target() {
    const cfg = settings && settings.connection ? settings.connection() : null;
    return parseTarget(cfg && cfg.serverURL);
  }

  function password() {
    try {
      return settings && settings.getPassword ? settings.getPassword() : null;
    } catch {
      return null;
    }
  }

  function childAlive() {
    return Boolean(child && child.exitCode === null && !child.killed);
  }

  /**
   * Gercek durum: { mode, running, connected, port, url, latencyMs, error }
   * mode: 'ours' | 'external' | 'stopped'
   */
  async function status(input) {
    const force = Boolean(input && input.probe);
    const t = target();
    const open = await portOpen(t.port, t.host);
    const pwd = password();

    const base = {
      mode: open ? (childAlive() ? 'ours' : 'external') : 'stopped',
      running: open,
      port: t.port,
      host: t.host,
      url: t.url,
      pid: childAlive() ? child.pid : null,
      startedAt,
      hasPassword: Boolean(pwd),
      canStart: Boolean(opencodeBin),
      opencodeBin,
      checkedAt: new Date().toISOString(),
      error: lastError
    };

    if (!open) {
      /* E_OFFLINE tek basina yetmez: kullanici nedeni ve cozumu gormeli. */
      const fix = opencodeBin
        ? "'Sunucuyu başlat' ile açabilirsiniz."
        : "Ayarlar → Bağlantı’dan opencode yolunu girip 'Sunucuyu başlat' ile açabilirsiniz.";
      lastCheck = {
        ...base,
        connected: false,
        latencyMs: null,
        error: lastError || 'E_OFFLINE',
        hint: `Sunucu çalışmıyor: ${t.host}:${t.port} portunda dinleyen süreç yok. ${fix}`
      };
      return ok(lastCheck);
    }

    if (!pwd) {
      lastCheck = {
        ...base,
        connected: false,
        latencyMs: null,
        error: 'E_SECRET_MISSING',
        hint: 'Sunucu ayakta ama parola kayıtlı değil. Ayarlar → Bağlantı bölümüne sunucu parolasını girin.'
      };
      return ok(lastCheck);
    }

    if (!force && lastCheck && lastCheck.connected && Date.now() - Date.parse(lastCheck.checkedAt) < 4000) {
      return ok(lastCheck);
    }

    const started = Date.now();
    let res;
    try {
      res = await httpClient.info();
    } catch (error) {
      res = fail(CODES.INTERNAL, 'Sunucuya ulaşılamadı.', { detail: { code: String(error && error.message) } });
    }
    const latencyMs = Date.now() - started;

    if (res && res.ok) {
      lastCheck = { ...base, connected: true, latencyMs, error: null, version: (res.data && res.data.version) || null };
    } else {
      const code = (res && res.error && res.error.code) || 'E_OFFLINE';
      lastCheck = {
        ...base,
        connected: false,
        latencyMs,
        error: code,
        errorDetail: (res && res.error && res.error.detail) || null,
        hint: code === 'E_UNAUTHORIZED'
          ? 'Parola sunucunun parolasıyla eşleşmiyor. Ayarlar → Bağlantı’dan güncelleyin.'
          : code === 'E_SECRET_MISSING'
            ? 'Parola kayıtlı değil.'
            : 'Sunucu yanıt vermedi; süreç kapalı olabilir.'
      };
    }
    return ok(lastCheck);
  }

  /** opencode serve baslatir (yalnizca opencodeBin biliniyorsa). */
  async function start() {
    if (childAlive()) {
      const st = await status({ probe: true });
      return ok({ ...st.data, alreadyRunning: true });
    }
    const t = target();
    const open = await portOpen(t.port, t.host);
    if (open) {
      const st = await status({ probe: true });
      return ok({ ...st.data, alreadyRunning: true, external: true });
    }
    if (!opencodeBin) {
      return fail(CODES.NOT_FOUND, 'opencode çalıştırılabilir dosyası bulunamadı; sunucuyu elle başlatın.', {
        detail: { hint: 'Ayarlar → Bağlantı bölümündeki yolu kontrol edin.' }
      });
    }

    lastError = null;
    startedAt = new Date().toISOString();
    /* opencode serve her açılışta yeni bir parola üretip stdout'a yazar:
       "server password <token>". Parolayı yakalayıp DPAPI kasasına yazarız;
       böylece kullanıcı hiçbir zaman parolayı elle girmez (T6-6). */
    let captured = null;
    let output = '';
    const scanPassword = (chunk) => {
      if (captured) return;
      output = (output + chunk).slice(-8192);
      /* Satır TAMAMLANMADAN eşleşme kabul edilmez: parça parça gelen
         tamponda yarım token yakalanırsa parola yanlış olur. */
      const m = /server password\s+([A-Za-z0-9_-]{16,})\s*\n/.exec(output);
      if (!m) return;
      captured = m[1];
      try {
        if (settings && typeof settings.setPassword === 'function') settings.setPassword(captured);
      } catch { /* kasa yazılamazsa bağlantı elle kurulur */ }
    };

    try {
      child = spawn(opencodeBin, ['serve', '--hostname', t.host, '--port', String(t.port)], {
        cwd: options.projectDir || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      child = null;
      startedAt = null;
      lastError = String((error && error.message) || 'spawn-failed');
      return fail(CODES.INTERNAL, 'Sunucu başlatılamadı.', { detail: { code: lastError } });
    }

    if (child.stdout) child.stdout.on('data', (d) => scanPassword(d.toString('utf8')));
    if (child.stderr) child.stderr.on('data', (d) => scanPassword(d.toString('utf8')));

    child.once('exit', (code) => {
      lastError = code ? `process-exit:${code}` : null;
      child = null;
      startedAt = null;
    });
    child.once('error', (error) => {
      lastError = String((error && error.message) || 'process-error');
    });

    /* Acilana kadar bekle (en fazla ~8 sn). */
    for (let i = 0; i < 16; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      if (await portOpen(t.port, t.host, 400)) {
        /* opencode "listening" satırını paroladan ÖNCE yazar; parolanın
           tampona düşmesi için kısa bir pencere bırak. */
        for (let j = 0; j < 10 && !captured; j += 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const st = await status({ probe: true });
        audit.append({ op: 'server.start', code: CODES.OK, target: `${t.host}:${t.port}`, extra: { pid: child && child.pid, secretCaptured: Boolean(captured) } });
        return ok({
          ...st.data,
          started: true,
          passwordCaptured: Boolean(captured),
          debug: {
            childPid: child && child.pid,
            childExit: child ? child.exitCode : null,
            outputBytes: output.length,
            lastError
          }
        });
      }
    }

    lastError = lastError || 'E_START_TIMEOUT';
    audit.append({ op: 'server.start', code: CODES.INTERNAL, target: `${t.host}:${t.port}`, extra: { error: lastError } });
    return fail(CODES.TIMEOUT, 'Sunucu zamanında açılmadı.', { detail: { code: lastError } });
  }

  /** Yalnizca bizim baslattigimiz sureci durdurur. */
  async function stop() {
    const t = target();
    if (!childAlive()) {
      const st = await status({ probe: true });
      return ok({ ...st.data, stopped: false, note: 'Bu konsolun başlattığı bir süreç yok; yabancı süreç durdurulmaz.' });
    }
    const pid = child.pid;
    try {
      child.kill();
    } catch (error) {
      return fail(CODES.INTERNAL, 'Sunucu durdurulamadı.', { detail: { code: String((error && error.message) || 'kill-failed') } });
    }
    child = null;
    startedAt = null;

    /* Portun gercekten kapandigini dogrula. */
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      if (!(await portOpen(t.port, t.host, 300))) {
        audit.append({ op: 'server.stop', code: CODES.OK, target: `${t.host}:${t.port}`, extra: { pid } });
        const st = await status();
        return ok({ ...st.data, stopped: true, pid });
      }
    }
    return fail(CODES.TIMEOUT, 'Sunucu durduruldu ama port hâlâ dinliyor.', { detail: { port: t.port } });
  }

  return {
    status, start, stop,
    _internals: { portOpen, parseTarget, target, childAlive }
  };
}

module.exports = { createServerManager, parseTarget, portOpen, DEFAULT_PORT };
