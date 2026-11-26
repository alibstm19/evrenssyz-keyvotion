'use strict';

// T9 — pencere açılış testi (emir T-015 zorunlu başlık 9)
// electron.exe başlat; süreç ayakta kalmalı; stderr'de CSP uyarısı olmamalı.
// Not: "3 sn içinde ilk kare" (K1 §7.2/1) görsel doğrulama ister — bu test açılış + sağkalım ölçer.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const { SRC, ELECTRON_EXE } = require('./lib');

const ALIVE_WAIT_MS = 6000;

test('T9: electron uygulaması açılır, süreç ayakta kalır, stderr temiz', { timeout: 60000 }, async () => {
  assert.ok(fs.existsSync(ELECTRON_EXE), `electron binary bulunamadı: ${ELECTRON_EXE}`);

  const child = spawn(ELECTRON_EXE, ['.'], { cwd: SRC, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });

  try {
    const earlyExit = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ALIVE_WAIT_MS);
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

    assert.ok(
      earlyExit === false,
      `uygulama ${ALIVE_WAIT_MS} ms'den önce kapandı (code=${earlyExit.code}, signal=${earlyExit.signal}).\n` +
        `stderr:\n${stderr.slice(0, 2000) || '(boş)'}`
    );

    assert.ok(child.exitCode === null && child.signalCode === null, 'süreç ayakta değil');

    assert.doesNotMatch(
      stderr,
      /Content-Security-Policy/i,
      `stderr'de CSP uyarısı var — renderer güvenlik politikası reddediliyor:\n${stderr.slice(0, 2000)}`
    );
    assert.doesNotMatch(
      stderr,
      /Electron Security Warning/i,
      `stderr'de Electron güvenlik uyarısı var:\n${stderr.slice(0, 2000)}`
    );
    assert.doesNotMatch(
      stderr,
      /(Unable to load|ERR_FAILED|did-fail-load)/i,
      `stderr'de yükleme hatası var (index.html/preload yolu bozuk olabilir):\n${stderr.slice(0, 2000)}`
    );
  } finally {
    // Windows: süreç ağacını temizle (renderer/GPU çocuk süreçleriyle birlikte).
    if (child.exitCode === null && !child.killed) {
      try {
        execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        child.kill();
      }
    }
  }
});
