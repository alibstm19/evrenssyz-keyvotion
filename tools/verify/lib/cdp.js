'use strict';
/**
 * T-192: deterministik CDP portu.
 *
 * Kapılar sabit portlar (9479–9590) kullanıyordu. Sabit port iki şekilde
 * kırılır:
 *   1. Portu başka bir süreç tutuyorsa (artık kalmış Electron, Docker, başka
 *      ajan) Chromium bağlanamaz ve kapı rastgele kırmızıya döner.
 *   2. Windows'ta Hyper-V/WinNAT ayrılmış aralıkları (netsh int ipv4 show
 *      excludedtcp portrange) sabit portlarımızı kapsayabilir; o makinede kapı
 *      her seferinde düşer.
 *
 * Çözüm: portu işletim sisteminden iste. `listen(0)` çekirdeğin boşta olan
 * geçici portunu verir; ayrılmış aralıklara düşmez. Soket hemen kapatılır ve
 * port Chromium'a verilir (aradaki pencere mikrosaniyeler).
 *
 * Kullanım:
 *   const { freePort, getJson } = require('./lib/cdp');
 *   const PORT = await freePort();
 */
const http = require('node:http');
const net = require('node:net');

/** İşletim sisteminin atadığı boş bir TCP portu (127.0.0.1). */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** CDP JSON ucu. */
function getJson(port, url, timeoutMs = 600) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: url, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * Kapı ortam değişkeni verilmişse onu, verilmemişse OS atamasını kullanır.
 * `KV_X_CDP_PORT` yalnız hata ayıklama içindir; varsayılan yol OS atamasıdır.
 */
async function resolvePort(envName) {
  const forced = envName ? Number(process.env[envName] || 0) : 0;
  return forced > 0 ? forced : freePort();
}

module.exports = { freePort, getJson, resolvePort };
