'use strict';

/*
 * T-197 — Votion tek ses: geciken IPC yanıtı yeni cevabın üstüne konuşmaz.
 *
 * Kusur (ölçüldü, düzeltmeden önce): `speak()` her çağrıda `callSpeak` IPC'sini
 * bekliyordu ama bekleyen yanıtları ayırt eden bir nesil yoktu. Panelden "söyle"
 * + gelen cevabın seslendirmesi üst üste gelince **iki Audio aynı anda** çalıyor,
 * "sesler karışıyor" olarak görünüyordu. Aynı yol mikrofonda da vardı: asistan
 * konuşurken kayıt açık kalırsa kendi sesini duyuyordu.
 *
 * Bu test kilidi:
 *   1) Geç dönen eski yanıt ÇALINMAZ (tek Audio).
 *   2) En yeni istek çalınır.
 *   3) `stopAudio()` (iptal) bekleyen yanıtı da susturur.
 *   4) Konuşma başlarken açık kayıt iptal edilir.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { RENDERER } = require('../lib');

const VOTION = pathToFileURL(path.join(RENDERER, 'votion.js')).href;

/** Test için asgari pencere: speechSynthesis + Audio kaydeder. */
function installStubs() {
  const plays = [];
  const spoken = [];
  let cancels = 0;
  globalThis.window = {
    speechSynthesis: {
      getVoices: () => [],
      speak: (u) => { spoken.push(u.text); if (u.onstart) u.onstart(); if (u.onend) u.onend(); },
      cancel: () => { cancels += 1; }
    }
  };
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = false; }
    play() { plays.push(this.src); return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { /* yok */ }
  }
  globalThis.Audio = FakeAudio;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  return { plays, spoken, cancels: () => cancels };
}

/** base64 → metin (hangi cevabın çalındığını görmek için). */
const decode = (src) => Buffer.from(String(src).split(',')[1] || '', 'base64').toString('utf8');

test('votion ses 1: geciken eski yanıt çalınmaz', async () => {
  const box = installStubs();
  const { createVotion } = await import(VOTION);
  const pending = [];
  const v = createVotion({
    call: async () => ({ ok: true, data: { answer: '' } }),
    /* Her çağrı bir söz döndürür; test çözer. */
    callSpeak: ({ text }) => new Promise((resolve) => {
      pending.push({ text, resolve });
    }),
    callTranscribe: null,
    onState: () => {},
    onRow: () => {}
  });

  const first = v.speak('birinci cevap');
  const second = v.speak('ikinci cevap');
  /* Yanıtlar TERS sırada gelir: eski (birinci) en son. */
  pending[1].resolve({ ok: true, data: { base64: Buffer.from('ikinci cevap').toString('base64'), mime: 'audio/mpeg' } });
  pending[0].resolve({ ok: true, data: { base64: Buffer.from('birinci cevap').toString('base64'), mime: 'audio/mpeg' } });
  await Promise.all([first, second]);

  assert.equal(box.plays.length, 1, `aynı anda ${box.plays.length} ses çalındı — sesler karışır`);
  assert.equal(decode(box.plays[0]), 'ikinci cevap', 'en yeni cevap değil, eski cevap çalındı');
  v.destroy();
});

test('votion ses 2: iptal bekleyen yanıtı da susturur', async () => {
  const box = installStubs();
  const { createVotion } = await import(VOTION);
  let release;
  const v = createVotion({
    call: async () => ({ ok: true, data: {} }),
    callSpeak: () => new Promise((resolve) => { release = resolve; }),
    callTranscribe: null,
    onState: () => {},
    onRow: () => {}
  });

  const p = v.speak('iptal edilecek');
  v.cancel();
  release({ ok: true, data: { base64: Buffer.from('iptal edilecek').toString('base64'), mime: 'audio/mpeg' } });
  await p;

  assert.equal(box.plays.length, 0, 'iptalden sonra ses çalındı');
  assert.ok(box.cancels() >= 1, 'sistem sesi iptal edilmedi');
  v.destroy();
});

test('votion ses 3: konuşma başlarken açık kayıt iptal edilir', async () => {
  installStubs();
  const { createVotion } = await import(VOTION);
  let cancelled = 0;
  const v = createVotion({
    call: async () => ({ ok: true, data: {} }),
    callSpeak: null,
    callTranscribe: async () => ({ ok: true, data: { text: '' } }),
    onState: () => {},
    onRow: () => {}
  });
  /* Kayıt nesnesi dışarıdan görünmüyor; mikrofonu taklit eden bir kayıt
     başlat ve `speak` çağır: gerçek yolda recorder.cancel() çağrılmalı. */
  const media = { getTracks: () => [{ stop: () => { cancelled += 1; } }] };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => media } }
  });
  globalThis.window.AudioContext = class {
    constructor() { this.sampleRate = 48000; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
    createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
    close() {}
  };
  await v.startListening();
  v.speak('asistan konuşuyor');
  assert.ok(cancelled >= 1, 'konuşurken mikrofon kapatılmadı — asistan kendi sesini duyar');
  v.destroy();
});
