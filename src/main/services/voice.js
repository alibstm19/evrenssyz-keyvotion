'use strict';

/**
 * Votion — sesli/görsel asistan beyni (T6-8, Tur 9'da yenilendi).
 *
 * TASARIM
 *  - Niyet eşleme iki katmanlı: (1) konsol verisi (pano, ekip, rapor, hafıza,
 *    sunucu, uzaktan, sayfa özeti), (2) masaüstü eylemleri (uygulama aç, ekran
 *    görüntüsü, dosya listesi) — eylemler yalnız beyaz listeye çevrilir.
 *  - "merhaba" gibi sohbet cümleleri MODEL GEREKTİRMEZ; yerel yanıtlanır.
 *  - Genel sorular model ile yanıtlanır (sağlayıcı anahtarı varsa), konuşma
 *    geçmişi son 8 tur ile birlikte gönderilir.
 *  - Uydurma yok: veri yoksa "kayıt yok" der; sır okumaz/yazmaz.
 *
 * Sesin kendisi (TTS/STT) sağlayıcı üzerinden yapılır (kv:voice:speak /
 * kv:voice:transcribe) — bu servis yalnız ANLAR ve YANIT üretir.
 */

const { CODES, ok, fail } = require('../../shared/errors');

const INTENTS = Object.freeze([
  { id: 'board', words: ['pano', 'görev', 'gorev', 'board', 'sıradaki', 'siradaki', 'durum'] },
  { id: 'team', words: ['ekip', 'ajan', 'takım', 'takim', 'kim', 'meşgul', 'mesgul', 'çalışıyor', 'calisiyor'] },
  { id: 'reports', words: ['rapor', 'report', 'sonuç', 'sonuc', 'bulgu'] },
  { id: 'memory', words: ['hafıza', 'hafiza', 'hatırla', 'hatirla', 'memory', 'not'] },
  { id: 'summary', words: ['özet', 'ozet', 'sayfa', 'site', 'tarayıcı', 'tarayici', 'summarize'] },
  { id: 'server', words: ['sunucu', 'server', 'çevrim', 'cevrim', 'online', 'offline', 'bağlantı', 'baglanti'] },
  { id: 'remote', words: ['telefon', 'uzaktan', 'eşleşme', 'eslesme', 'kod', 'pair'] },
  /* T-091: lider brifingi. Sona eklendi: eşitlikte mevcut niyetler kazanır. */
  { id: 'leader', words: ['lider ne dedi', 'lider', 'brifing', 'ne dedi', 'liderin'] }
]);

/** Beyaz listedeki uygulamalar için Türkçe eş anlamlılar (votion-actions APPS). */
const APP_WORDS = Object.freeze([
  { app: 'notepad', words: ['not defteri', 'notdefteri', 'notepad', 'notlar'] },
  { app: 'calc', words: ['hesap makinesi', 'hesap makinası', 'hesap makinası', 'calculator', 'calc'] },
  { app: 'mspaint', words: ['paint', 'boyama', 'resim çiz'] },
  { app: 'explorer', words: ['dosya gezgini', 'gezgin', 'explorer', 'klasörü aç'] },
  { app: 'control', words: ['denetim masası', 'denetim masasi', 'control panel'] },
  { app: 'taskmgr', words: ['görev yöneticisi', 'gorev yoneticisi', 'task manager'] },
  { app: 'snippingtool', words: ['ekran alıntısı', 'ekran alintisi', 'snipping'] }
]);

const GREETINGS = Object.freeze(['merhaba', 'selam', 'hey', 'günaydın', 'gunaydin', 'iyi akşamlar',
  'iyi aksamlar', 'iyi geceler', 'naber', 'nasılsın', 'nasilsin', 'hello', 'hi']);
const THANKS = Object.freeze(['teşekkür', 'tesekkur', 'sağ ol', 'sag ol', 'eline sağlık', 'eline saglik']);
const BYE = Object.freeze(['görüşürüz', 'gorusuruz', 'hoşça kal', 'hosca kal', 'iyi çalışmalar', 'kapat']);

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[ıİ]/g, 'i').replace(/\s+/g, ' ').trim();
}

function hasAny(q, words) {
  return words.some((w) => q.includes(normalize(w)));
}

function detectIntent(question) {
  const q = normalize(question);
  let best = null;
  for (const intent of INTENTS) {
    const hits = intent.words.filter((w) => q.includes(normalize(w))).length;
    if (hits && (!best || hits > best.hits)) best = { id: intent.id, hits };
  }
  return best ? best.id : 'general';
}

/**
 * Masaüstü eylemi niyeti. Eylem yoksa null.
 * Yalnız beyaz listedeki kind'lar üretilir; serbest komut asla.
 * @returns {{kind:string, app?:string, root?:string, needsConfirm:boolean, label:string}|null}
 */
function detectAction(question) {
  const q = normalize(question);
  if (!q) return null;

  if (/(ekran (görüntüsü|goruntusu|fotoğrafı|fotografi)|ekranı gör|ekrani gor|screenshot)/.test(q)) {
    return { kind: 'screenshot', needsConfirm: false, label: 'Ekran görüntüsü' };
  }
  if (/(dosya|klasör|klasor|dizin).*(liste|göster|goster|bak)|(liste).*(dosya|klasör|klasor)|neler var/.test(q)) {
    const root = /masaüstü|masaustu/.test(q) ? 'desktop'
      : /belge/.test(q) ? 'documents'
        : /indir/.test(q) ? 'downloads' : 'project';
    return { kind: 'listFiles', root, needsConfirm: false, label: 'Dosya listesi' };
  }
  if (/(uygulama|program).*(aç|ac|başlat|baslat)/.test(q) || /(aç|ac|başlat|baslat)\b/.test(q)) {
    for (const entry of APP_WORDS) {
      if (hasAny(q, entry.words)) {
        return { kind: 'openApp', app: entry.app, needsConfirm: false, label: 'Uygulama aç' };
      }
    }
  }
  for (const entry of APP_WORDS) {
    if (hasAny(q, entry.words)) {
      return { kind: 'openApp', app: entry.app, needsConfirm: false, label: 'Uygulama aç' };
    }
  }
  if (/(neler yapabilir|ne yapabilir|yetenek|komut|yardım et|yardim et|nasıl kullan)/.test(q)) {
    return { kind: 'capabilities', needsConfirm: false, label: 'Yetenekler' };
  }
  return null;
}

function clampText(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function partOfDay() {
  const h = new Date().getHours();
  if (h < 6) return 'Gece';
  if (h < 12) return 'Sabah';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/**
 * @param {{board:object, sessions:object, reports:object, memory:object,
 *          summarize:object, providers:object, serverManager:object,
 *          votionActions?:object, getVotionActions?:()=>object}} options
 */
function createVoiceService(options) {
  const board = options.board;
  const sessions = options.sessions;
  const reports = options.reports;
  const memory = options.memory;
  const summarize = options.summarize;
  const providers = options.providers;
  const serverManager = options.serverManager;

  function actionsService() {
    if (typeof options.getVotionActions === 'function') return options.getVotionActions();
    return options.votionActions || null;
  }

  const SYSTEM_PROMPT = [
    'Sen Votion’sun: Keyvotion Console’un Türkçe asistanı ve ekip liderinin sağ kolusun.',
    'Kısa, sıcak ve net konuş; varsayılan olarak en fazla 4 cümle yaz, kullanıcı ayrıntı isterse uzat.',
    'Bilmediğin şeyi uydurma; "elimde veri yok" de ve nasıl öğrenebileceğini söyle.',
    'Konsol ekranları: Sohbet, Ekip, Komut, Pano, Hafıza, Projeler, Modeller, Sağlayıcılar, Tarayıcı, Uzaktan, Raporlar, Ayarlar, Rehber, Ekipler, Planlar, Dosyalar, Bağlamlar.',
    'Sır (parola, API anahtarı, token) istemezsin ve asla yazmazsın.',
    'Görevleri kendin uydurma; ekibin işi liderin emriyle yürür.'
  ].join(' ');

  async function boardAnswer() {
    const res = board.read();
    if (!res.ok) return { text: 'Panoyu okuyamadım.', data: null };
    const rows = res.data.rows || [];
    const open = rows.filter((r) => !/bitti|red|bloke/i.test(r.status || ''));
    const last = rows[rows.length - 1];
    const parts = [
      `Panoda ${rows.length} görev var; ${open.length} tanesi açık.`,
      `Sıradaki kimlik ${res.data.nextID}.`,
      last ? `Son satır: ${last.id}, ${last.status}.` : ''
    ].filter(Boolean);
    return { text: parts.join(' '), data: { total: rows.length, open: open.length, nextID: res.data.nextID, last } };
  }

  async function teamAnswer() {
    const res = await sessions.list();
    if (!res.ok) return { text: 'Ekip listesini okuyamadım.', data: null };
    const all = [...(res.data.sessions || []), ...(res.data.unassigned || [])];
    if (!all.length) return { text: 'Kayıtlı seans yok. Ekip ekranından ajan ekleyin.', data: null };
    const busy = all.filter((s) => (s.state || s.status) === 'busy');
    const names = all.slice(0, 6).map((s) => `${s.code || s.role || 'Ajan'} ${s.state || ''}`.trim());
    return {
      text: `${all.length} ajan var; ${busy.length} tanesi meşgul. ${names.join(', ')}.`,
      data: { total: all.length, busy: busy.length, sessions: names }
    };
  }

  async function reportsAnswer() {
    const res = await reports.list({ limit: 5 });
    if (!res.ok) return { text: 'Raporları okuyamadım.', data: null };
    const rows = res.data.reports || [];
    if (!rows.length) return { text: 'Arşivde rapor yok.', data: null };
    const head = rows.slice(0, 3).map((r) => `${r.taskId || '?'} ${r.status || ''}`.trim());
    return {
      text: `${rows.length} rapor buldum. En yeniler: ${head.join(', ')}.`,
      data: { total: rows.length, head }
    };
  }

  /**
   * T-091 — "Lider ne dedi?": son lider döngüsünü YEREL özetler.
   * Model çağrısı yok; veri `reports.list().leaderCycles` (T-089).
   * Uydurma yok: eksik alan '—'.
   */
  async function leaderAnswer() {
    let res;
    try {
      res = await reports.list({ limit: 1 });
    } catch {
      res = null;
    }
    if (!res || !res.ok) return { text: 'Lider döngülerini okuyamadım.', data: null };
    const cycles = res.data ? res.data.leaderCycles : null;
    if (!Array.isArray(cycles) || !cycles.length) {
      return { text: 'Henüz lider döngüsü kaydı yok.', data: null };
    }
    const card = cycles[0] || {};
    const dash = (v) => (v === null || v === undefined || String(v).trim() === '' ? '—' : clampText(v, 180));
    const derived = card.derived === true;
    const parts = [
      `Son lider döngüsü ${dash(card.at)}: ${dash(card.title)}.`,
      `Durum: ${dash(card.status)}.`,
      `Niyet: ${dash(card.intent)}.`,
      `Fikir: ${dash(card.idea)}.`
    ];
    if (derived) parts.push('(etiketlerden türetildi)');
    return {
      text: parts.join(' '),
      data: {
        at: card.at === undefined ? null : card.at,
        title: card.title === undefined ? null : card.title,
        status: card.status === undefined ? null : card.status,
        intent: card.intent === undefined ? null : card.intent,
        idea: card.idea === undefined ? null : card.idea,
        derived
      }
    };
  }

  async function memoryAnswer() {
    const res = memory.read({ limit: 5 });
    if (!res.ok) return { text: 'Hafızayı okuyamadım.', data: null };
    const rows = res.data.entries || [];
    if (!rows.length) return { text: `Hafıza boş. ${res.data.total || 0} kayıt var.`, data: null };
    return {
      text: `Hafızada ${res.data.total} kayıt var. Öne çıkanlar: ${rows.slice(0, 3).map((e) => clampText(e.text, 90)).join(' | ')}`,
      data: { total: res.data.total, entries: rows.length }
    };
  }

  async function summaryAnswer() {
    if (!summarize) return { text: 'Özet motoru yüklü değil.', data: null };
    const res = await summarize.summarize({ engine: 'auto', limit: 4 });
    if (!res.ok) {
      return { text: 'Özetlenecek sayfa yok. Tarayıcı ekranından bir adres açın.', data: null };
    }
    const d = res.data;
    return {
      text: `${d.title || 'Sayfa'}: ${d.summary} Anahtar noktalar: ${(d.points || []).slice(0, 3).map((p) => clampText(p, 70)).join('; ')}`,
      data: { title: d.title, url: d.url, points: d.points, engine: d.engine }
    };
  }

  async function serverAnswer() {
    if (!serverManager) return { text: 'Sunucu yöneticisi yüklü değil.', data: null };
    const res = await serverManager.status();
    if (!res.ok) return { text: 'Sunucu durumunu okuyamadım.', data: null };
    const d = res.data;
    const stateText = d.connected ? 'çevrim içi' : d.running ? 'ayakta ama bağlantı kurulamadı' : 'kapalı';
    return {
      text: `Yerel sunucu ${stateText}. Adres ${d.url}, port ${d.port}${d.latencyMs != null ? `, ${d.latencyMs} ms` : ''}.${d.error ? ` Neden: ${d.error}.` : ''}`,
      data: d
    };
  }

  async function remoteAnswer() {
    const remote = typeof options.getRemote === 'function' ? options.getRemote() : options.remote;
    if (!remote) return { text: 'Uzaktan erişim servisi yüklü değil.', data: null };
    let d;
    try {
      d = remote.state();
    } catch {
      return { text: 'Uzaktan erişim durumunu okuyamadım.', data: null };
    }
    if (!d || typeof d !== 'object') return { text: 'Uzaktan erişim durumunu okuyamadım.', data: null };
    if (d.ok === true && d.data) d = d.data;
    return {
      text: d.running
        ? `Uzaktan erişim açık. Telefonda ${d.urls && d.urls[0] ? d.urls[0] : `port ${d.port}`} adresine git ve eşleşme kodunu gir.`
        : 'Uzaktan erişim kapalı. Uzaktan ekranından Başlat deyin; 10 haneli kod ve LAN adresi görünür.',
      data: { running: Boolean(d.running), port: d.port || null, urls: d.urls || [] }
    };
  }

  function greetingAnswer(question) {
    const q = normalize(question);
    const lines = [`Merhaba! Ben Votion, Keyvotion Console'un asistanı. ${partOfDay()}. Size nasıl yardımcı olabilirim?`];
    if (hasAny(q, ['nasılsın', 'nasilsin', 'naber'])) {
      lines.push('İyiyim, teşekkürler — ekibin durumunu izliyorum. Sen nasılsın?');
    }
    const caps = actionsService();
    if (caps) {
      lines.push('Uygulama açabilir, ekran görüntüsü alabilir, dosya listeleyebilir, pano ve ekibi özetleyebilirim.');
    }
    return { text: lines.join(' '), data: { engine: 'local', kind: 'greeting' } };
  }

  function abilitiesAnswer() {
    const list = [
      'Pano durumu ve sıradaki görev',
      'Ekip kim meşgul, son raporlar, hafıza kayıtları',
      'Açık sayfayı özetleme',
      'Sunucu ve uzaktan erişim durumu',
      'Uygulama açma (Not Defteri, Hesap Makinesi, Paint, Gezgin, Görev Yöneticisi, Ekran Alıntısı)',
      'Ekran görüntüsü alma ve dosya listeleme',
      'Genel sorular (model bağlantısı varsa)'
    ];
    return {
      text: `Şunları yapabilirim: ${list.join('; ')}. Mikrofona basıp konuşabilir, yazarak da sorabilirsin.`,
      data: { engine: 'local', kind: 'abilities' }
    };
  }

  function timeAnswer() {
    const now = new Date();
    const text = now.toLocaleString('tr-TR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    return { text: `Şu an ${text}.`, data: { engine: 'local', kind: 'time', at: now.toISOString() } };
  }

  async function actionAnswer(action) {
    const svc = actionsService();
    if (!svc) {
      return { text: 'Masaüstü eylemleri bu sürümde kapalı.', data: { engine: 'local', kind: 'action', available: false } };
    }
    if (action.kind === 'capabilities') {
      const res = abilitiesAnswer();
      return { ...res, action: null };
    }
    const pending = {
      openApp: 'Uygulamayı açıyorum.',
      screenshot: 'Ekran görüntüsünü alıyorum.',
      listFiles: 'Dosyaları listeliyorum.'
    }[action.kind] || 'Tamam.';
    return {
      text: pending,
      data: { engine: 'local', kind: 'action' },
      action
    };
  }

  /**
   * Genel soru: önce yerel sohbet, sonra model (geçmişle).
   * @param {string} question
   * @param {Array<{role:string, content:string}>} history
   */
  async function generalAnswer(question, history) {
    const q = normalize(question);

    if (hasAny(q, BYE)) {
      return { text: 'Görüşürüz! Bir şey olursa buradayım.', data: { engine: 'local', kind: 'bye' } };
    }
    if (hasAny(q, THANKS) && q.length < 40) {
      return { text: 'Rica ederim. Başka bir şey ister misin?', data: { engine: 'local', kind: 'thanks' } };
    }
    if (/sen kimsin|adın ne|adin ne|kimsin/.test(q)) {
      return {
        text: 'Ben Votion — Keyvotion Console’un sesli asistanıyım. Ekibi, panoyu ve bu bilgisayarı senin adına izlerim.',
        data: { engine: 'local', kind: 'identity' }
      };
    }
    if (/saat kaç|saat kac|bugün günlerden|bugun gunlerden|tarih ne/.test(q)) {
      return timeAnswer();
    }
    if (hasAny(q, GREETINGS) && q.split(' ').length <= 6) {
      return greetingAnswer(question);
    }

    if (providers && typeof providers.chat === 'function') {
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
      const safeHistory = Array.isArray(history) ? history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : [];
      for (const m of safeHistory.slice(-8)) {
        messages.push({ role: m.role, content: clampText(m.content, 1200) });
      }
      messages.push({ role: 'user', content: clampText(question, 1500) });
      try {
        const res = await providers.chat({ messages, temperature: 0.5, maxTokens: 700 });
        if (res && res.ok) {
          return {
            text: res.data.text,
            data: { engine: 'model', model: res.data.model, mask: res.data.mask, usage: res.data.usage }
          };
        }
        const code = res && res.error ? res.error.code : null;
        if (code && code !== CODES.SECRET_MISSING && code !== CODES.NOT_FOUND) {
          const msg = res.error && res.error.message ? res.error.message : 'Model yanıt veremedi.';
          return {
            text: `${msg} Panoyu, ekibi ve hafızayı yine yanıtlayabilirim.`,
            data: { engine: 'none', code }
          };
        }
      } catch { /* aşağıdaki dürüst yönlendirmeye düşer */ }
    }

    return {
      text: 'Bu soru için model bağlantısı gerekiyor. Sağlayıcılar ekranından API anahtarı ekle; o zamana kadar pano, ekip, rapor, hafıza, sunucu ve masaüstü komutlarını yanıtlayabilirim.',
      data: { engine: 'none' }
    };
  }

  async function ask(input) {
    const p = input && typeof input === 'object' ? input : {};
    const question = typeof p.question === 'string' ? p.question.trim() : '';
    if (!question) return fail(CODES.BAD_REQUEST, 'Soru boş.');
    if (question.length > 2000) return fail(CODES.BAD_REQUEST, 'Soru çok uzun.');

    const intent = p.intent && INTENTS.some((i) => i.id === p.intent) ? p.intent : detectIntent(question);
    const action = p.intent ? null : detectAction(question);
    let result;
    if (action) {
      result = await actionAnswer(action);
    } else {
      switch (intent) {
        case 'board': result = await boardAnswer(); break;
        case 'team': result = await teamAnswer(); break;
        case 'reports': result = await reportsAnswer(); break;
        case 'memory': result = await memoryAnswer(); break;
        case 'summary': result = await summaryAnswer(); break;
        case 'server': result = await serverAnswer(); break;
        case 'remote': result = await remoteAnswer(); break;
        case 'leader': result = await leaderAnswer(); break;
        default: result = await generalAnswer(question, p.history);
      }
    }

    return ok({
      question,
      intent: action ? 'action' : intent,
      answer: result.text,
      action: result.action || null,
      data: result.data,
      at: new Date().toISOString()
    });
  }

  return { ask, detectIntent, detectAction, INTENTS, APP_WORDS };
}

module.exports = { createVoiceService, detectIntent, detectAction, INTENTS, APP_WORDS };
