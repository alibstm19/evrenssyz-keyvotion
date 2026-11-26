'use strict';

/**
 * Sayfa ozeti (T6-3).
 *
 * IKI KATMANLI calisir:
 *  1) SEZGİSEL (her zaman, anahtar gerektirmez): cumle puanlama ile cikarimci
 *     ozet + anahtar kelimeler. Boylece API anahtari yokken de tarayici
 *     "girdigin sekmeyi ozetle" islevini yerine getirir.
 *  2) MODEL (anahtar varsa): sezgisel ozet + sayfa metni modele verilir,
 *     daha akici bir ozet istenir. Model hata verirse sezgisel sonuc doner —
 *     ozellik asla bos donmez.
 *
 * Ag cagrisi yapmaz (API-01): providers.runRequest uzerinden gider.
 */

const { CODES, ok, fail } = require('../../shared/errors');

const MAX_CHARS = 12000;
const STOPWORDS = new Set([
  've', 'ile', 'için', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'mi', 'mu',
  'ama', 'fakat', 'veya', 'ya', 'çok', 'daha', 'en', 'gibi', 'olarak', 'olan',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  'have', 'has', 'had', 'not', 'but', 'you', 'your', 'they', 'their', 'its',
  'a', 'an', 'of', 'to', 'in', 'on', 'is', 'it', 'as', 'at', 'be', 'by'
]);

function normalize(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cumlelere ayir (nokta/soru/unlem + satir sonu). */
function sentences(text) {
  const clean = normalize(text);
  const parts = clean
    .split(/(?<=[.!?…])\s+|\n{2,}/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 400);
  return parts;
}

function words(text) {
  return normalize(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function keywords(text, limit) {
  const freq = new Map();
  for (const w of words(text)) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit || 12)
    .map(([word, count]) => ({ word, count }));
}

/**
 * Cikarimci ozet: cumle frekansi + konum + uzunluk dengesi.
 * @returns {{points:string[], ranked:Array, score:number}}
 */
function extractive(text, limit) {
  const sents = sentences(text);
  if (!sents.length) return { points: [], ranked: [] };

  const freq = new Map();
  for (const w of words(text)) freq.set(w, (freq.get(w) || 0) + 1);
  const maxFreq = Math.max(1, ...freq.values());

  const scored = sents.map((s, i) => {
    const ws = words(s);
    if (!ws.length) return { index: i, text: s, score: 0 };
    let sum = 0;
    for (const w of ws) sum += (freq.get(w) || 0) / maxFreq;
    const density = sum / ws.length;
    const position = i === 0 ? 0.28 : i < 3 ? 0.12 : 0;
    const lengthPenalty = s.length > 260 ? -0.08 : 0;
    const numericBonus = /\d/.test(s) ? 0.04 : 0;
    return { index: i, text: s, score: density + position + lengthPenalty + numericBonus };
  });

  const picked = scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(3, Math.min(7, limit || 5)))
    .sort((a, b) => a.index - b.index);

  return { points: picked.map((p) => p.text), ranked: scored };
}

/** Basit baslik cikarimi: ilk anlamli kisa satir. */
function guessTitle(text) {
  const lines = normalize(text).split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 12)) {
    if (line.length >= 8 && line.length <= 120 && !/[.!?]$/.test(line)) return line;
  }
  return lines[0] ? lines[0].slice(0, 100) : '';
}

/**
 * @param {{providers:object, chat?:object}} options
 */
function createSummarizeService(options) {
  const providers = options.providers;

  function heuristic(body, input) {
    const p = input && typeof input === 'object' ? input : {};
    const text = normalize(body);
    const limit = Number.isInteger(p.limit) ? Math.max(3, Math.min(10, p.limit)) : 5;
    const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : guessTitle(text);
    const url = typeof p.url === 'string' ? p.url : '';
    const { points, ranked } = extractive(text, limit);
    const kw = keywords(text, 10);

    /* Kisa ozet: en yuksek puanli 2 cumle, tek paragraf. */
    const top = (ranked || []).slice().sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.index - b.index);
    const lead = top.map((t) => t.text).join(' ');

    return {
      title,
      url,
      summary: lead || (points[0] || ''),
      points,
      keywords: kw.map((k) => k.word),
      keywordCounts: kw,
      chars: text.length,
      sentences: sentences(text).length,
      engine: 'heuristic'
    };
  }

  async function summarize(input) {
    const p = input && typeof input === 'object' ? input : {};
    /* Girdi: sayfa govdesi ya da tarayicidan cekilen metin. */
    let body = typeof p.text === 'string' ? p.text : '';
    let title = typeof p.title === 'string' ? p.title : '';
    let url = typeof p.url === 'string' ? p.url : '';

    if (!body && p.useBrowser !== false && options.browser) {
      const st = options.browser.state();
      if (st && st.ok) {
        title = title || st.data.title || '';
        url = url || st.data.url || '';
      }
      const ex = await options.browser.extract({ limit: MAX_CHARS });
      if (ex && ex.ok) body = ex.data.text || '';
      else if (ex && ex.error) {
        return fail(ex.error.code, ex.error.message, { detail: ex.error.detail });
      }
    }

    if (!normalize(body)) {
      return fail(CODES.BAD_REQUEST, 'Özetlenecek sayfa metni yok. Önce bir adres açın.', {
        detail: { hint: 'Tarayıcı ekranından sayfayı yükleyin.' }
      });
    }

    const base = heuristic(body, { ...p, title, url });

    /* Model katmani (istege bagli; hata ozelligi bozmaz). */
    const wantModel = p.engine === 'model' || p.engine === 'auto';
    if (!wantModel || !providers || !providers.runRequest) {
      return ok(base);
    }

    const clipped = normalize(body).slice(0, MAX_CHARS);
    const modelBody = {
      model: null,
      temperature: 0.2,
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'Sen bir sayfa özetleyicisisin. Türkçe yaz. Yalnız verilen metne dayan, uydurma. En fazla 3 cümlelik özet ve 5 madde üret. Biçim: ilk satır özet, sonra "- " ile maddeler.'
        },
        { role: 'user', content: `BAŞLIK: ${base.title || '(yok)'}\nADRES: ${base.url || '(yok)'}\n\nMETİN:\n${clipped}` }
      ]
    };

    let res;
    try {
      res = await providers.runRequest(null, {
        method: 'POST',
        pathName: '/chat/completions',
        body: modelBody,
        rawBody: true,
        timeoutMs: 90000
      });
    } catch {
      return ok({ ...base, engine: 'heuristic', modelError: 'request-failed' });
    }

    if (!res || !res.ok) {
      return ok({ ...base, engine: 'heuristic', modelError: (res && res.error && res.error.code) || 'model-failed' });
    }

    let parsed = null;
    try {
      parsed = res.data.body ? JSON.parse(res.data.body) : null;
    } catch {
      return ok({ ...base, engine: 'heuristic', modelError: 'parse-failed' });
    }

    const choice = parsed && Array.isArray(parsed.choices) ? parsed.choices[0] : null;
    const msg = choice && (choice.message || choice.delta);
    const content = msg && typeof msg.content === 'string' ? msg.content.trim() : '';
    if (!content) return ok({ ...base, engine: 'heuristic', modelError: 'empty' });

    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, ''));
    const summaryLine = lines.find((l) => !/^[-•*]\s+/.test(l)) || base.summary;

    return ok({
      ...base,
      summary: summaryLine,
      points: bullets.length ? bullets.slice(0, 8) : base.points,
      engine: 'model',
      mask: res.data.mask || null,
      model: res.data.model || null
    });
  }

  return { summarize, heuristic, extractive, keywords };
}

module.exports = { createSummarizeService, extractive, keywords, guessTitle, sentences };
