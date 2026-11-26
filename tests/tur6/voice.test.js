'use strict';

/*
 * Tur 6 / T6-8 — Votion sesli asistan beyni.
 *
 * NE ÖLÇÜLÜR (gerçek kod, sahte bağımlılıklar):
 *   1) detectIntent 8 soruyu doğru niyete eşler.
 *   2) ask() her niyet için ok:true, boş olmayan yanıt ve yerel veriden gelen
 *      gerçek sayıyı içerir ("3 görev", "2 ajan", "1 rapor", "5 kayıt").
 *   3) Boş soru ve 2000 karakter üstü soru reddedilir.
 *   4) Sağlayıcı yokken genel soru dürüst yönlendirme döner (engine='none').
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SRC } = require('../lib');
const { createVoiceService, detectIntent } = require(path.join(SRC, 'main', 'services', 'voice.js'));

function tempDir(label, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kv-${label}-`));
  if (t) t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeVoice(overrides) {
  const board = {
    read: () => ({
      ok: true,
      data: {
        phase: 'x',
        nextID: 'T-7',
        rows: [
          { id: 'T-4', status: 'bitti' },
          { id: 'T-5', status: 'açık' },
          { id: 'T-6', status: 'açık' }
        ]
      }
    })
  };
  const sessions = {
    list: async () => ({
      ok: true,
      data: {
        sessions: [
          { code: 'DEV', state: 'busy' },
          { code: 'QA', state: 'idle' }
        ],
        unassigned: []
      }
    })
  };
  const reports = {
    list: () => ({ ok: true, data: { reports: [{ taskId: 'T-1', status: 'tamam' }] } })
  };
  const memory = {
    read: () => ({ ok: true, data: { entries: [{ text: 'Kısa yaz' }, { text: 'Türkçe konuş' }], total: 5 } })
  };
  const summarize = {
    summarize: async () => ({
      ok: true,
      data: {
        title: 'Test Sayfası',
        url: 'http://example.test/',
        summary: 'Kısa özet metni.',
        points: ['birinci nokta', 'ikinci nokta'],
        engine: 'heuristic'
      }
    })
  };
  const serverManager = {
    status: async () => ({
      ok: true,
      data: {
        connected: false,
        running: false,
        url: 'http://127.0.0.1:51764',
        port: 51764,
        latencyMs: null,
        error: 'E_OFFLINE'
      }
    })
  };
  const remote = {
    state: () => ({ ok: true, data: { running: false, port: null, urls: [] } })
  };
  const votionActions = { run: async () => ({ ok: true }) };
  return createVoiceService({
    board, sessions, reports, memory, summarize, serverManager, remote, votionActions, ...overrides
  });
}

async function askOk(service, question) {
  const res = await service.ask({ question });
  assert.ok(res.ok, `ask başarısız: ${question}`);
  assert.equal(typeof res.data.answer, 'string');
  assert.ok(res.data.answer.trim().length > 0, `yanıt boş: ${question}`);
  return res;
}

/* ------------------------------------------------------------- detectIntent */

test('tur6/voice 1: detectIntent board ve team', () => {
  assert.equal(detectIntent('pano durumu'), 'board');
  assert.equal(detectIntent('ekip ne yapıyor'), 'team');
});

test('tur6/voice 2: detectIntent reports ve memory', () => {
  assert.equal(detectIntent('son raporlar'), 'reports');
  assert.equal(detectIntent('hafızada ne var'), 'memory');
});

test('tur6/voice 3: detectIntent summary ve server', () => {
  assert.equal(detectIntent('bu sayfayı özetle'), 'summary');
  assert.equal(detectIntent('sunucu çevrim dışı mı'), 'server');
});

test('tur6/voice 4: detectIntent remote ve general', () => {
  assert.equal(detectIntent('telefondan nasıl bağlanırım'), 'remote');
  assert.equal(detectIntent('merhaba'), 'general');
});

/* -------------------------------------------------------------------- ask */

test('tur6/voice 5: board sorusu gerçek görev sayısını söyler', async (t) => {
  tempDir('voice-board', t);
  const service = makeVoice();
  const res = await askOk(service, 'pano durumu');
  assert.equal(res.data.intent, 'board');
  assert.match(res.data.answer, /3 görev/);
  assert.equal(res.data.data.total, 3);
});

test('tur6/voice 6: team sorusu gerçek ajan sayısını söyler', async (t) => {
  tempDir('voice-team', t);
  const service = makeVoice();
  const res = await askOk(service, 'ekip ne yapıyor');
  assert.equal(res.data.intent, 'team');
  assert.match(res.data.answer, /2 ajan/);
  assert.equal(res.data.data.total, 2);
});

test('tur6/voice 7: reports sorusu gerçek rapor sayısını söyler', async (t) => {
  tempDir('voice-reports', t);
  const service = makeVoice();
  const res = await askOk(service, 'son raporlar');
  assert.equal(res.data.intent, 'reports');
  assert.match(res.data.answer, /1 rapor/);
  assert.equal(res.data.data.total, 1);
});

test('tur6/voice 8: memory sorusu gerçek kayıt sayısını söyler', async (t) => {
  tempDir('voice-memory', t);
  const service = makeVoice();
  const res = await askOk(service, 'hafızada ne var');
  assert.equal(res.data.intent, 'memory');
  assert.match(res.data.answer, /5 kayıt/);
  assert.equal(res.data.data.total, 5);
});

test('tur6/voice 9: summary sorusu özet motorunu kullanır', async (t) => {
  tempDir('voice-summary', t);
  const service = makeVoice();
  const res = await askOk(service, 'bu sayfayı özetle');
  assert.equal(res.data.intent, 'summary');
  assert.match(res.data.answer, /Kısa özet metni/);
  assert.match(res.data.answer, /Test Sayfası/);
  assert.equal(res.data.data.engine, 'heuristic');
});

test('tur6/voice 10: server sorusu gerçek sunucu durumunu söyler', async (t) => {
  tempDir('voice-server', t);
  const service = makeVoice();
  const res = await askOk(service, 'sunucu çevrim dışı mı');
  assert.equal(res.data.intent, 'server');
  assert.match(res.data.answer, /kapalı/);
  assert.match(res.data.answer, /51764/);
  assert.match(res.data.answer, /E_OFFLINE/);
});

test('tur6/voice 11: remote sorusu uzaktan erişim durumunu söyler', async (t) => {
  tempDir('voice-remote', t);
  const service = makeVoice();
  const res = await askOk(service, 'telefondan nasıl bağlanırım');
  assert.equal(res.data.intent, 'remote');
  assert.match(res.data.answer, /Uzaktan erişim kapalı/);
});

test('tur6/voice 12: boş soru → ok:false', async (t) => {
  tempDir('voice-empty', t);
  const service = makeVoice();
  const res = await service.ask({ question: '   ' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_BAD_REQUEST');
});

test('tur6/voice 13: 2001 karakterlik soru → ok:false', async (t) => {
  tempDir('voice-long', t);
  const service = makeVoice();
  const res = await service.ask({ question: 'a'.repeat(2001) });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_BAD_REQUEST');
});

test('tur9/voice 14: sağlayıcı yokken selamlama yerel yanıtlanır', async (t) => {
  tempDir('voice-general', t);
  const service = makeVoice({ providers: null });
  const res = await askOk(service, 'merhaba');
  assert.equal(res.data.intent, 'general');
  assert.equal(res.data.data.engine, 'local');
  assert.equal(res.data.data.kind, 'greeting');
  assert.match(res.data.answer, /Merhaba/);
});

test('tur9/voice 15: uygulama açma niyeti beyaz liste eylemine döner', async (t) => {
  tempDir('voice-action', t);
  const service = makeVoice();
  const res = await askOk(service, 'not defterini aç');
  assert.equal(res.data.intent, 'action');
  assert.equal(res.data.action.kind, 'openApp');
  assert.equal(res.data.action.app, 'notepad');
  assert.equal(res.data.action.needsConfirm, false);
});

test('tur9/voice 16: anahtar varken genel soru model ile yanıtlanır', async (t) => {
  tempDir('voice-model', t);
  const providers = {
    chat: async (input) => ({
      ok: true,
      data: {
        text: `model:${input.messages[input.messages.length - 1].content}`,
        model: 'deepseek-v4.1-flash',
        mask: 'evr…9f2a',
        usage: null
      }
    })
  };
  const service = makeVoice({ providers });
  const res = await askOk(service, 'kısaca kendini tanıt');
  assert.equal(res.data.data.engine, 'model');
  assert.equal(res.data.data.model, 'deepseek-v4.1-flash');
  assert.match(res.data.answer, /^model:/);
});

test('tur9/voice 17: ekran görüntüsü niyeti eyleme döner', async (t) => {
  tempDir('voice-shot', t);
  const service = makeVoice();
  const res = await askOk(service, 'ekran görüntüsü al');
  assert.equal(res.data.action.kind, 'screenshot');
});

test('tur9/voice 18: beyaz listede olmayan uygulama eylem üretmez', async (t) => {
  tempDir('voice-noapp', t);
  const service = makeVoice({ providers: null });
  const res = await askOk(service, 'photoshop aç');
  assert.equal(res.data.action, null);
});

test('tur9/voice 19: geçmiş model isteğine eklenir', async (t) => {
  tempDir('voice-history', t);
  let seen = null;
  const providers = {
    chat: async (input) => {
      seen = input.messages;
      return { ok: true, data: { text: 'tamam', model: 'deepseek-v4.1-flash', mask: 'x', usage: null } };
    }
  };
  const service = makeVoice({ providers });
  const res = await service.ask({
    question: 'devam et',
    history: [{ role: 'user', content: 'ilk soru' }, { role: 'assistant', content: 'ilk yanıt' }]
  });
  assert.ok(res.ok);
  assert.ok(seen.some((m) => m.content === 'ilk soru'));
  assert.ok(seen.some((m) => m.content === 'ilk yanıt'));
});
