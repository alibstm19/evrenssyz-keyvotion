/**
 * Votion — gerçek sesli asistan arayüzü (Tur 9).
 *
 * SES
 *  - Konuşma tanıma: mikrofon → 16 kHz mono WAV → `kv:voice:transcribe`
 *    (sağlayıcıdaki qwen3-asr). Tarayıcının Web Speech API'sine bağımlı değil,
 *    bu yüzden Electron'da gerçekten çalışır.
 *  - Seslendirme: `kv:voice:speak` (voxcpm2) → mp3; sağlayıcı yoksa yerel
 *    `speechSynthesis` yedeği.
 *  - Sessizlik algılama (VAD): konuşma bitince ~1,4 sn sonra kendiliğinden
 *    durur; en fazla 25 sn kayıt.
 *
 * Kural: ağ çağrısı yok (her şey IPC), DOM yalnız DOM API'leriyle kurulur.
 */

const TARGET_RATE = 16000;
const MAX_RECORD_MS = 25000;
const SILENCE_MS = 1400;
const SPEECH_RMS = 0.012;

function rmsOf(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/** Float32 [-1,1] → 16-bit PCM WAV ArrayBuffer. */
function encodeWav(chunks, inputRate) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const ratio = inputRate / TARGET_RATE;
  const outLength = Math.floor(total / ratio);
  const buffer = new ArrayBuffer(44 + outLength * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + outLength * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, outLength * 2, true);

  const flat = new Float32Array(total);
  let at = 0;
  for (const c of chunks) { flat.set(c, at); at += c.length; }

  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(total - 1, i0 + 1);
    const frac = pos - i0;
    const sample = (flat[i0] || 0) * (1 - frac) + (flat[i1] || 0) * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** Konuşma için markdown işaretlerini sadeleştirir. */
function speakable(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' kod bloğu. ')
    .replace(/[*_`#>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

export function createVotion({ call, callSpeak, callTranscribe, onState, onRow, onAction }) {
  let recognition = null;
  let pendingAsk = 0;
  let currentState = 'idle';
  let speakEnabled = true;
  let history = [];
  let audioEl = null;
  let recorder = null;
  let destroyed = false;
  /*
   * T-197: seslendirme nesli. `speak()` her çağrıldığında artar. IPC yanıtı
   * geciken eski bir istek dönerse **çalınmaz**; aksi halde iki cevap üst üste
   * konuşuyordu ("sesler karışıyor"). Aynı koruma yedek seslendirme için de var.
   */
  let speakSeq = 0;

  function setState(s, detail) {
    currentState = s;
    if (onState) onState(s, detail || {});
  }

  function pushRow(row) {
    if (onRow) onRow(row);
    const text = typeof row.text === 'string' ? row.text : '';
    if (text && (row.who === 'user' || row.who === 'votion')) {
      history.push({ role: row.who === 'user' ? 'user' : 'assistant', content: text });
      if (history.length > 16) history = history.slice(-16);
    }
  }

  function stopAudio() {
    /* Nesli ilerlet: bekleyen IPC yanıtları çalınmasın (T-197). */
    speakSeq += 1;
    if (audioEl) {
      try { audioEl.pause(); } catch { /* yok */ }
      try { audioEl.removeAttribute('src'); } catch { /* yok */ }
      audioEl = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch { /* yok */ }
    }
  }

  function fallbackSpeak(text, seq) {
    if (!text || !('speechSynthesis' in window)) {
      setState('idle');
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'tr-TR';
    utter.rate = 1.02;
    const voices = window.speechSynthesis.getVoices();
    const tr = voices.find((v) => /^tr/i.test(v.lang));
    if (tr) utter.voice = tr;
    utter.onstart = () => { if (seq === speakSeq) setState('speaking'); };
    utter.onend = () => { if (seq === speakSeq) setState('idle'); };
    utter.onerror = () => { if (seq === speakSeq) setState('idle'); };
    window.speechSynthesis.speak(utter);
  }

  async function speak(text) {
    const clean = speakable(text);
    if (!clean) { setState('idle'); return; }
    if (!speakEnabled) { setState('idle'); return; }
    /* Konuşurken mikrofon açık kalırsa asistan kendi sesini duyar (T-197). */
    if (recorder) recorder.cancel();
    stopAudio();
    const seq = speakSeq;
    setState('speaking');

    if (callSpeak) {
      try {
        const res = await callSpeak({ text: clean });
        if (destroyed || seq !== speakSeq) return;
        if (res && res.ok && res.data && res.data.base64) {
          const mime = res.data.mime || 'audio/mpeg';
          const el = new Audio(`data:${mime};base64,${res.data.base64}`);
          audioEl = el;
          el.onended = () => { if (seq === speakSeq) setState('idle'); };
          el.onerror = () => {
            if (seq !== speakSeq) return;
            setState('idle');
            fallbackSpeak(clean, seq);
          };
          await el.play();
          return;
        }
      } catch {
        /* yedeğe düşer */
      }
      if (destroyed || seq !== speakSeq) return;
    }
    fallbackSpeak(clean, seq);
  }

  function patchHistory(msgs) {
    history = Array.isArray(msgs) ? msgs.slice(-16) : [];
  }

  async function ask(text, opts) {
    const value = String(text || '').trim();
    if (!value) return;
    const requestId = ++pendingAsk;
    stopAudio();
    const options = opts && typeof opts === 'object' ? opts : {};
    pushRow({ who: 'user', text: value, transcript: Boolean(options.transcript), at: new Date().toISOString() });
    setState('thinking');

    try {
      const response = await call('voice.ask', { question: value, history: history.slice(0, -1) });
      if (requestId !== pendingAsk || destroyed) return;

      if (response && response.ok) {
        const data = response.data;
        pushRow({
          who: 'votion',
          text: data.answer,
          intent: data.intent,
          engine: data.data && data.data.engine,
          model: data.data && data.data.model,
          at: data.at
        });
        if (data.action && onAction) {
          await onAction(data.action, data);
          if (requestId !== pendingAsk) return;
        }
        if (!data.action) speak(data.answer);
        else setState('idle');
        return;
      }

      const message = (response && response.error && response.error.message) || 'Yanıt üretemedim.';
      pushRow({ who: 'votion', text: message, error: true, at: new Date().toISOString() });
      setState('idle');
    } catch {
      if (requestId !== pendingAsk) return;
      pushRow({ who: 'votion', text: 'Bağlantı kurulamadı; tekrar dener misin?', error: true, at: new Date().toISOString() });
      setState('idle');
    }
  }

  /** Mikrofon + VAD + WAV + STT. */
  async function startListening() {
    if (recorder) return { ok: false, reason: 'already' };
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setState('idle');
      return { ok: false, reason: 'unsupported' };
    }
    if (!callTranscribe) {
      setState('idle');
      return { ok: false, reason: 'no-stt' };
    }

    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (error) {
      const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      return { ok: false, reason: denied ? 'denied' : 'mic-error' };
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      try { media.getTracks().forEach((t) => t.stop()); } catch { /* yok */ }
      return { ok: false, reason: 'unsupported' };
    }

    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(media);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    const chunks = [];
    const startedAt = Date.now();
    let lastSpeechAt = 0;
    let heardSpeech = false;
    let finished = false;
    let peak = 0;

    const cleanup = () => {
      try { processor.disconnect(); } catch { /* yok */ }
      try { source.disconnect(); } catch { /* yok */ }
      try { mute.disconnect(); } catch { /* yok */ }
      try { media.getTracks().forEach((t) => t.stop()); } catch { /* yok */ }
      try { ctx.close(); } catch { /* yok */ }
      recorder = null;
    };

    const finish = (cancelled) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (cancelled) { setState('idle'); return; }
      if (!heardSpeech || chunks.length === 0) {
        setState('idle');
        if (onRow) onRow({ who: 'votion', text: 'Seni duyamadım — mikrofona biraz daha yakın konuşur musun?', error: true, at: new Date().toISOString() });
        return;
      }
      transcribeAndAsk(chunks, ctx.sampleRate || 48000);
    };

    processor.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      const level = rmsOf(data);
      if (level > peak) peak = level;
      if (level > SPEECH_RMS) {
        heardSpeech = true;
        lastSpeechAt = Date.now();
      }
      if (onState) onState('listening', { level: Math.min(1, level * 12) });
      const now = Date.now();
      if (now - startedAt > MAX_RECORD_MS) finish(false);
      else if (heardSpeech && now - lastSpeechAt > SILENCE_MS) finish(false);
    };

    recorder = {
      stop() { finish(false); },
      cancel() { finish(true); }
    };

    setState('listening', { level: 0 });
    return { ok: true };
  }

  async function transcribeAndAsk(chunks, sampleRate) {
    setState('thinking', { phase: 'transcribe' });
    let base64;
    try {
      base64 = toBase64(encodeWav(chunks, sampleRate));
    } catch {
      setState('idle');
      return;
    }
    let res;
    try {
      res = await callTranscribe({ base64, mime: 'audio/wav', language: 'tr' });
    } catch {
      res = null;
    }
    if (destroyed) return;
    if (!res || !res.ok) {
      const message = (res && res.error && res.error.message) || 'Sesi yazıya çeviremedim.';
      if (onRow) onRow({ who: 'votion', text: message, error: true, at: new Date().toISOString() });
      setState('idle');
      return;
    }
    const text = res.data && res.data.text ? res.data.text.trim() : '';
    if (!text) {
      if (onRow) onRow({ who: 'votion', text: 'Konuşmayı anlayamadım; yazarak da sorabilirsin.', error: true, at: new Date().toISOString() });
      setState('idle');
      return;
    }
    await ask(text, { transcript: true });
  }

  function stopListening() {
    if (recorder) recorder.stop();
    else setState('idle');
  }

  function cancel() {
    pendingAsk += 1;
    if (recorder) recorder.cancel();
    stopAudio();
    setState('idle');
  }

  function stopSpeak() {
    stopAudio();
    setState('idle');
  }

  function setSpeakEnabled(value) {
    speakEnabled = Boolean(value);
    if (!speakEnabled) stopAudio();
  }

  function isSupported() {
    return {
      tts: Boolean(callSpeak) || ('speechSynthesis' in window),
      stt: Boolean(callTranscribe) && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      mic: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
  }

  function destroy() {
    destroyed = true;
    pendingAsk += 1;
    if (recorder) recorder.cancel();
    stopAudio();
    recognition = null;
  }

  return {
    ask,
    speak,
    startListening,
    stopListening,
    cancel,
    stopSpeak,
    setSpeakEnabled,
    isSupported,
    patchHistory,
    getHistory: () => history.slice(),
    destroy,
    getState: () => currentState
  };
}
