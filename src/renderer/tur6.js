/* keyvotion-console · Tur 6 — rehber, Votion, zihin haritası, lider masası,
   sunucu durumu, sayfa özeti ve otomatik hafıza çıkarımı.
   Sahip: LDR · Bağımlılık yok · Ağ yok (her şey IPC köprüsünden). */

import { createVotion } from './votion.js';
import { renderMindMap } from './mindmap.js';

/** Tur 6 durumu — store ile karışmasın diye ayrı tutulur. */
const t6 = {
  guide: { onboarded: true, step: 0, steps: [], skipped: false, loaded: false },
  server: null,
  serverTimer: null,
  graph: null,
  summary: null,
  desk: { id: null, messages: [], busy: false, model: '' },
  votion: null,
  votionSpeak: true,
  autoCount: 0,
  lastServerAt: 0,
  /* T-206: son tanılama ölçümü (kopyalanabilir rapor). */
  diag: null
};

let ctx = null;

const GUIDE_FALLBACK = [
  { id: 'welcome', title: 'Keyvotion Console’a hoş geldin', body: 'Ben Votion. Bu konsol, Keyvotion ekibini tek pencerede çalıştırır.' },
  { id: 'provider', title: 'Model bağlantısını kur', body: 'Sağlayıcılar ekranından bir API anahtarı ekleyin.' },
  { id: 'server', title: 'Yerel sunucu', body: 'Sunucu kapalıysa konsol çevrim dışı görünür; Ayarlar → Sunucu’dan başlatın.' },
  { id: 'remote', title: 'Telefondan kontrol', body: 'Uzaktan ekranından sunucuyu başlatın, eşleşme kodunu telefonda açın.' },
  { id: 'memory', title: 'Hafıza ve zihin haritası', body: 'Her işten sonra çıkarımlar hafızaya yazılır; haritada noktaların üzerine gelin.' },
  { id: 'votion', title: 'Beni her zaman çağırabilirsin', body: 'Sağ alttaki düğmeye basıp soru sorun; yanıtı sesli veririm.' }
];

/* ------------------------------------------------------------------ yardımcı */

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function setField(name, value) {
  const node = $(`[data-field="${name}"]`);
  if (node) node.textContent = value == null ? '' : String(value);
  return node;
}

function btn(label, action, extra = {}) {
  return ctx.el('button', {
    class: extra.class || 'kv-button kv-button--ghost kv-button--sm',
    type: 'button',
    'data-action': action,
    text: label
  });
}

function stateText(s) {
  return { idle: 'Boşta', busy: 'Çalışıyor', error: 'Hata', offline: 'Çevrimdışı' }[s] || s || '—';
}

/* ------------------------------------------------------------------- rehber */

async function loadGuide(force) {
  if (t6.guide.loaded && !force) return;
  const res = await ctx.call(ctx.KV && ctx.KV.guide && ctx.KV.guide.state);
  if (res.ok && res.data) {
    t6.guide = {
      onboarded: Boolean(res.data.onboarded),
      step: Number.isInteger(res.data.step) ? res.data.step : 0,
      steps: (res.data.steps || []).length ? res.data.steps : GUIDE_FALLBACK,
      skipped: Boolean(res.data.skipped),
      loaded: true
    };
  } else {
    t6.guide.steps = GUIDE_FALLBACK;
    t6.guide.loaded = false;
  }
  renderGuide();
}

function renderGuide() {
  const steps = t6.guide.steps.length ? t6.guide.steps : GUIDE_FALLBACK;
  const index = Math.max(0, Math.min(steps.length - 1, t6.guide.step));
  const step = steps[index];

  const title = setField('guide-title', step.title);
  const body = setField('guide-body', step.body);
  setField('guide-counter', `${index + 1} / ${steps.length}`);

  const bar = $('[data-guide-bar]');
  if (bar) bar.style.width = `${((index + 1) / steps.length) * 100}%`;
  const progress = $('[data-guide-progress]');
  if (progress) {
    progress.setAttribute('aria-valuemax', String(steps.length));
    progress.setAttribute('aria-valuenow', String(index + 1));
  }

  const prev = $('[data-action="guide-prev"]');
  if (prev) prev.disabled = index === 0;
  const next = $('[data-action="guide-next"]');
  if (next) next.textContent = index === steps.length - 1 ? 'Bitir' : 'Devam';

  /* adıma özel kısayollar: boşlukları buradan doldur */
  const extra = $('[data-field="guide-extra"]');
  if (extra) {
    extra.replaceChildren();
    if (step.id === 'provider') {
      extra.append(btn('Sağlayıcılar ekranına git', 'guide-goto-providers', { class: 'kv-button kv-button--sm' }));
    }
    if (step.id === 'server') {
      extra.append(ctx.el('div', { class: 'kv-row' }, [
        btn('Sunucuyu başlat', 'server-start', { class: 'kv-button kv-button--sm' }),
        btn('Durumu ölç', 'server-refresh')
      ]));
    }
    if (step.id === 'remote') {
      extra.append(btn('Uzaktan erişime git', 'guide-goto-remote', { class: 'kv-button kv-button--sm' }));
    }
    if (step.id === 'memory') {
      extra.append(btn('Hafızayı aç', 'guide-goto-memory', { class: 'kv-button kv-button--sm' }));
    }
    if (step.id === 'votion') {
      extra.append(ctx.el('div', { class: 'kv-row' }, [
        btn('Votion’ı dinle', 'guide-speak', { class: 'kv-button kv-button--sm' }),
        btn('Votion’a bir şey sor', 'votion-open')
      ]));
    }
  }

  /* giriş animasyonu */
  const box = $('[data-guide-step]');
  if (box) {
    box.classList.remove('kv-guide__step--active');
    void box.offsetWidth;
    box.classList.add('kv-guide__step--active');
  }
  if (!title) return;
}

async function guideUpdate(patch) {
  const res = await ctx.call(ctx.KV && ctx.KV.guide && ctx.KV.guide.update, {
    ...patch,
    confirmToken: ctx.makeConfirmToken()
  });
  if (res.ok && res.data) {
    t6.guide.onboarded = Boolean(res.data.onboarded);
    t6.guide.step = Number.isInteger(res.data.step) ? res.data.step : t6.guide.step;
    t6.guide.skipped = Boolean(res.data.skipped);
  }
  return res;
}

async function guideNext() {
  const steps = t6.guide.steps.length ? t6.guide.steps : GUIDE_FALLBACK;
  if (t6.guide.step >= steps.length - 1) {
    await guideUpdate({ onboarded: true, step: t6.guide.step });
    ctx.toast('Rehber tamam — iyi çalışmalar.', 'success');
    ctx.go('team');
    return;
  }
  t6.guide.step += 1;
  renderGuide();
  await guideUpdate({ step: t6.guide.step });
}

async function guidePrev() {
  if (t6.guide.step <= 0) return;
  t6.guide.step -= 1;
  renderGuide();
  await guideUpdate({ step: t6.guide.step });
}

async function guideSkip() {
  await guideUpdate({ onboarded: true, skipped: true });
  ctx.toast('Rehber atlandı. Ayarlar → Sistem’den geri dönebilirsiniz.', 'info');
  ctx.go('team');
}

function guideSpeak() {
  const steps = t6.guide.steps.length ? t6.guide.steps : GUIDE_FALLBACK;
  const step = steps[t6.guide.step] || steps[0];
  if (t6.votion) t6.votion.speak(`${step.title}. ${step.body}`);
}

/* ------------------------------------------------------------------- Votion */

function votionRow({ who, text, error, transcript, engine, model }) {
  const log = $('[data-votion-log]');
  if (!log) return;
  const row = ctx.el('div', {
    class: 'kv-votion__row',
    'data-who': who === 'user' ? 'user' : 'votion',
    'data-error': error ? 'true' : null,
    'data-transcript': transcript ? 'true' : null
  });
  row.append(ctx.el('p', { class: 'kv-votion__text', text: String(text || '') }));
  const meta = engine === 'model' ? `model${model ? ` · ${model}` : ''}`
    : engine === 'local' ? 'yerel'
      : transcript ? 'yazıya çevrildi' : '';
  if (meta) row.append(ctx.el('span', { class: 'kv-votion__meta', text: meta }));
  log.append(row);
  log.scrollTop = log.scrollHeight;
}

function votionState(s, detail) {
  const label = { idle: 'hazır', listening: 'dinliyorum', thinking: 'düşünüyorum', speaking: 'konuşuyorum' }[s] || s;
  setField('votion-state', label);
  const fab = $('[data-votion-fab]');
  if (fab) fab.dataset.state = s;
  const panel = $('[data-votion-panel]');
  if (panel) {
    panel.dataset.state = s;
    panel.classList.toggle('kv-votion--listening', s === 'listening');
    panel.classList.toggle('kv-votion--speaking', s === 'speaking');
    panel.classList.toggle('kv-votion--thinking', s === 'thinking');
  }
  const mic = $('[data-action="votion-mic"]');
  if (mic) {
    mic.setAttribute('aria-pressed', String(s === 'listening'));
    mic.dataset.state = s;
  }
  const wave = $('[data-votion-wave]');
  if (wave && detail && Number.isFinite(detail.level)) {
    wave.style.setProperty('--level', String(Math.max(0.06, Math.min(1, detail.level))));
  }
}

function openVotion(open) {
  const panel = $('[data-votion-panel]');
  const fab = $('[data-votion-fab]');
  if (!panel) return;
  panel.hidden = !open;
  if (fab) fab.setAttribute('aria-expanded', String(open));
  if (open) {
    const input = $('[data-field="votion-text"]');
    if (input) input.focus();
    refreshVotionCapabilities();
  }
}

/** Sağlayıcı anahtarı var mı? Sesin gerçekten çalışıp çalışmayacağını yazar. */
async function refreshVotionCapabilities() {
  const note = $('[data-field="votion-support"]');
  if (!note || !t6.votion) return;
  const support = t6.votion.isSupported();
  let hasKey = false;
  try {
    const res = await ctx.call(ctx.KV && ctx.KV.provider && ctx.KV.provider.list);
    if (res && res.ok && Array.isArray(res.data.providers)) {
      hasKey = res.data.providers.some((p) => p.enabled !== false && (p.keys || []).length > 0);
    }
  } catch { /* köprü yoksa yazarak devam */ }
  if (!hasKey) {
    note.textContent = 'Ses için Sağlayıcılar ekranından bir API anahtarı ekleyin; şimdilik yazarak sorabilirsiniz.';
    return;
  }
  if (support.stt && support.tts) note.textContent = 'Mikrofon, konuşma tanıma ve Türkçe seslendirme hazır.';
  else if (support.mic) note.textContent = 'Mikrofon hazır; seslendirme bu sistemde yedeğe düşer.';
  else note.textContent = 'Mikrofon desteği yok — yazarak sorabilirsiniz.';
}

function initVotion() {
  if (!ctx.KV || !ctx.KV.voice) return;
  const spoken = ctx.KV.voice;
  t6.votion = createVotion({
    call: (channel, payload) => ctx.call(spoken.ask, payload),
    callSpeak: spoken.speak ? (payload) => ctx.call(spoken.speak, payload) : null,
    callTranscribe: spoken.transcribe ? (payload) => ctx.call(spoken.transcribe, payload) : null,
    onState: votionState,
    onRow: votionRow,
    onAction: async (action) => {
      if (typeof ctx.votionRun === 'function') await ctx.votionRun(action);
      else ctx.toast('Masaüstü eylemi bu sürümde yok.', 'warning');
    }
  });
  t6.votion.setSpeakEnabled(t6.votionSpeak);
  refreshVotionCapabilities();
}

function votionAskFromInput() {
  const input = $('[data-field="votion-text"]');
  const text = input ? input.value.trim() : '';
  if (!text) return;
  if (input) input.value = '';
  openVotion(true);
  if (t6.votion) t6.votion.ask(text);
}

/* --------------------------------------------------------------- zihin haritası */

async function refreshGraph() {
  const host = $('[data-memory-graph]');
  if (!host) return;
  const res = await ctx.call(ctx.KV && ctx.KV.memory && ctx.KV.memory.graph);
  if (!res.ok || !res.data) {
    host.replaceChildren(ctx.el('p', { class: 'kv-empty', text: 'Zihin haritası okunamadı.' }));
    return;
  }
  t6.graph = res.data;
  renderGraph();
  const total = $('[data-field="memory-flow-total"]');
  if (total) total.textContent = `${res.data.total} kayıt`;
  const auto = $('[data-field="memory-auto-state"]');
  if (auto) auto.textContent = `otomatik kayıt açık · ${res.data.total} kayıt`;
}

function renderGraph() {
  const host = $('[data-memory-graph]');
  const inspector = $('[data-mind-inspector]');
  const graph = t6.graph;
  if (!host || !inspector || !graph) return;
  const q = ($('[data-mind-search]')?.value || '').trim().toLocaleLowerCase('tr');
  const scope = $('[data-mind-scope]')?.value;
  const nodes = graph.nodes.filter((node) => node.kind === 'hub' ||
    ((!scope || node.scope === scope) &&
      (!q || [node.label, node.text, ...(node.tags || [])].join(' ').toLocaleLowerCase('tr').includes(q))));
  inspector.replaceChildren(ctx.el('h3', { text: 'Düğüm ayrıntısı' }),
    ctx.el('p', { class: 'kv-muted', text: 'Bir noktayı seçerek kaydı ve ilişkilerini inceleyin.' }));
  renderMindMap(host, { ...graph, nodes }, {
    maxNodes: 140,
    filtered: Boolean(scope || q),
    onSelect: (node, related, select) => {
      inspector.replaceChildren(
        ctx.el('h3', { text: node.label || 'Hafıza kaydı' }),
        ctx.el('p', { class: 'kv-muted', text: [node.kind, node.role, node.at?.slice(0, 10)].filter(Boolean).join(' · ') }),
        ctx.el('p', { text: node.text || '' }),
        ctx.el('p', { class: 'kv-muted', text: (node.tags || []).length ? node.tags.join(' · ') : '' })
      );
      const entry = ctx.store.memory.entries.find((row) => row.id === node.id);
      if (entry) inspector.append(ctx.el('button', { class: 'kv-button kv-button--ghost kv-button--sm',
        type: 'button', text: 'Kaydın tamamını aç', onclick: () => ctx.openMemoryRecord?.(entry.id) }));
      if (related.length) {
        inspector.append(ctx.el('h4', { text: 'Bağlı kayıtlar' }), ...related.map((entry) =>
          ctx.el('button', { class: 'kv-button kv-button--ghost kv-button--sm',
            type: 'button', text: entry.label, onclick: () => select(entry.id) })));
      }
    }
  });
}

/* -------------------------------------------------------------------- sunucu */

async function refreshServer(force) {
  const res = await ctx.call(ctx.KV && ctx.KV.server && ctx.KV.server.status);
  if (!res.ok || !res.data) {
    setField('server-state', 'Durum okunamadı');
    setField('server-hint', (res.error && res.error.message) || 'Sunucu yöneticisi yanıt vermedi.');
    const dot = $('[data-server-dot]');
    if (dot) dot.dataset.state = 'error';
    return;
  }
  t6.server = res.data;
  t6.lastServerAt = Date.now();

  const d = res.data;
  const dot = $('[data-server-dot]');
  if (dot) dot.dataset.state = d.connected ? 'idle' : d.running ? 'busy' : 'offline';
  setField('server-state', d.connected ? 'Çevrim içi' : d.running ? 'Ayakta, bağlantı yok' : 'Kapalı');
  setField('server-latency', d.latencyMs != null ? `${d.latencyMs} ms` : '—');

  const hint = d.connected
    ? `${d.url} · ${d.mode === 'ours' ? 'konsol başlattı' : 'dış süreç'}${d.version ? ` · v${d.version}` : ''}`
    : (d.hint || (d.error === 'E_OFFLINE' ? 'Süreç kapalı. “Başlat” ile açın.' : (d.error || 'bilinmiyor')));
  setField('server-hint', hint);

  /* rehberdeki sunucu durumu da aynı ölçümü gösterir */
  const guideExtra = $('[data-field="guide-extra"]');
  if (guideExtra && t6.guide.step >= 0 && force) renderGuide();
  return d;
}

async function serverAction(kind) {
  /* Onay anahtarı çağrı yerinde üretilir; kanal çağrısı düz metin kalır ki
     köprü paritesi denetimi (tests/tur2/bridge-parity) kanalı görebilsin. */
  const res = kind === 'start'
    ? await ctx.call(ctx.KV && ctx.KV.server && ctx.KV.server.start, { confirmToken: ctx.makeConfirmToken() })
    : await ctx.call(ctx.KV && ctx.KV.server && ctx.KV.server.stop, { confirmToken: ctx.makeConfirmToken() });
  if (!res.ok) {
    const code = res.error && res.error.code;
    const msg = code === 'E_NOT_FOUND'
      ? 'opencode çalıştırılabilir dosyası bulunamadı. Sunucuyu elle başlatın.'
      : (res.error && res.error.message) || code || 'işlem başarısız';
    ctx.toast(msg, code === 'E_NOT_FOUND' ? 'warning' : 'danger');
    await refreshServer(true);
    return;
  }
  if (kind === 'start') {
    ctx.toast(res.data?.connected ? 'Sunucu bağlandı.' : (res.data?.hint || 'Sunucu için bağlantı doğrulanamadı.'),
      res.data?.connected ? 'success' : 'warning');
  } else {
    ctx.toast(res.data?.stopped ? 'Sunucu durduruldu.' : (res.data?.note || 'Yönetilen sunucu çalışmıyor.'),
      res.data?.stopped ? 'success' : 'info');
  }
  await refreshServer(true);
}

/* ------------------------------------------- T-206: ayarlar · tanılama + telefon */

/**
 * Ayarlar → Tanılama.
 *
 * NEDEN: "Sunucu kırmızı görünüyor", "telefon bağlanmıyor" gibi şikâyetlerde
 * kullanıcının elinde ölçüm yoktu; herkes farklı bir tahmin yürütüyordu.
 * Bu düğme gerçekten ÖLÇER ve tek bir kopyalanabilir rapor üretir.
 */
async function runDiagnostics() {
  const body = $('[data-diag-body]');
  const verdict = $('[data-field="diag-verdict"]');
  if (body) {
    body.replaceChildren(ctx.el('tr', {}, [ctx.el('td', { class: 'kv-empty', colspan: '3', text: 'Ölçülüyor…' })]));
  }
  const rows = [];
  const add = (label, value, ok) => rows.push({ label, value: String(value), ok: Boolean(ok) });

  const t0 = performance.now();
  const ping = await ctx.call(ctx.KV && ctx.KV.ping);
  const pingMs = Math.round(performance.now() - t0);
  add('Köprü (IPC)', ping.ok ? `yanıt ${pingMs} ms` : 'yanıt yok', ping.ok);

  const srv = await ctx.call(ctx.KV && ctx.KV.server && ctx.KV.server.status, { probe: true });
  const s = (srv.ok && srv.data) || {};
  add('Yerel sunucu', s.connected
    ? `${s.host}:${s.port} · ${s.latencyMs} ms${s.version ? ` · v${s.version}` : ''}`
    : `${s.running ? 'ayakta, bağlantı yok' : 'kapalı'} · ${s.error || 'E_OFFLINE'}${s.canStart ? ' · başlatılabilir' : ' · opencode bulunamadı'}`,
  Boolean(s.connected));

  const sec = await ctx.call(ctx.KV && ctx.KV.secret && ctx.KV.secret.state);
  const sd = (sec.ok && sec.data) || {};
  const secretOk = Boolean(sd.saved || sd.secretState === 'stored');
  add('Parola kasası', secretOk ? 'kayıtlı (DPAPI)' : (sd.secretState === 'corrupt' ? 'kayıt bozuk — yeniden girin' : 'kayıt yok'), secretOk);

  const rem = await ctx.call(ctx.KV && ctx.KV.remote && ctx.KV.remote.state);
  const rd = (rem.ok && rem.data) || {};
  add('Telefon erişimi', rd.running ? `açık · port ${rd.port} · ${(rd.addresses || []).join(', ') || 'adres yok'}` : 'kapalı', rem.ok);

  const set = await ctx.call(ctx.KV && ctx.KV.settings && ctx.KV.settings.get);
  const cfg = (set.ok && set.data) || {};
  add('Proje dizini', cfg.projectDir || '(tanımsız)', Boolean(cfg.projectDir));

  const audit = await ctx.call(ctx.KV && ctx.KV.audit && ctx.KV.audit.list, { limit: 1 });
  const total = audit.ok && audit.data ? (audit.data.total ?? (audit.data.entries || []).length) : null;
  add('Denetim kaydı', total === null ? 'okunamadı' : `${total} kayıt`, audit.ok);

  if (body) {
    body.replaceChildren(...rows.map((r) => ctx.el('tr', {}, [
      ctx.el('td', { text: r.label }),
      ctx.el('td', { class: 'kv-mono kv-break', text: r.value }),
      ctx.el('td', { class: r.ok ? 'kv-diag-ok' : 'kv-diag-warn', text: r.ok ? 'tamam' : 'dikkat' })
    ])));
  }
  const bad = rows.filter((r) => !r.ok).length;
  if (verdict) {
    verdict.textContent = bad
      ? `${bad} ölçüm dikkat istiyor. Ayrıntı için satırlara bakın; "Sunucuyu başlat" çoğu durumda yeter.`
      : 'Her şey yolunda: köprü, sunucu, parola kasası ve telefon erişimi ölçüldü.';
    verdict.dataset.tone = bad ? 'warning' : 'success';
  }
  t6.diag = { at: new Date().toISOString(), rows };
  return bad;
}

function diagText() {
  if (!t6.diag) return '';
  const head = `Keyvotion Console · tanılama · ${t6.diag.at}`;
  const lines = t6.diag.rows.map((r) => `${r.ok ? '[tamam]' : '[dikkat]'} ${r.label}: ${r.value}`);
  return [head, ...lines].join('\n');
}

async function copySettingsText(text, message) {
  const value = String(text || '');
  if (!value) { ctx.toast('Kopyalanacak içerik yok.', 'warning'); return; }
  try {
    await navigator.clipboard.writeText(value);
    ctx.toast(message || 'Kopyalandı.', 'success');
    return;
  } catch { /* yedek yol */ }
  try {
    const ta = ctx.el('textarea', { class: 'kv-copy-sink', 'aria-hidden': 'true', tabindex: '-1' });
    ta.value = value;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    ctx.toast(ok ? (message || 'Kopyalandı.') : 'Panoya kopyalanamadı.', ok ? 'success' : 'warning');
  } catch {
    ctx.toast('Panoya kopyalanamadı.', 'warning');
  }
}

/** Ayarlar → Telefon kartı: uzaktan erişimin GERÇEK durumunu gösterir. */
async function refreshSettingsRemote() {
  const res = await ctx.call(ctx.KV && ctx.KV.remote && ctx.KV.remote.state);
  if (!res.ok || !res.data) return null;
  const d = res.data;
  /* Paylaşılan durum: Uzaktan erişim ekranı da aynı ölçümü görsün. */
  if (ctx.store) ctx.store.remote = d;
  const dot = $('[data-remote-dot]');
  if (dot) dot.dataset.state = d.running ? 'idle' : 'offline';
  setField('set-remote-state', d.running ? 'açık' : 'kapalı');
  setField('set-remote-port', d.port ? String(d.port) : '-');
  setField('set-remote-url', d.pairUrl || (d.urls && d.urls[0]) || 'Kapalı — açınca eşleşme adresi burada görünür');
  setField('set-remote-note', d.running
    ? 'Telefon aynı Wi-Fi ağındayken bu adresi tarayıcıda açın; kod bağlantının içinde gelir.'
    : (d.lastError ? `Son hata: ${d.lastError}` : 'İlk kurulumda kapalı: istenmeden ağa kapı açılmaz.'));
  const btnStart = $('[data-action="set-remote-start"]');
  if (btnStart) btnStart.disabled = Boolean(d.running);
  const btnStop = $('[data-action="set-remote-stop"]');
  if (btnStop) btnStop.disabled = !d.running;
  return d;
}

async function settingsRemoteAction(kind) {
  if (kind === 'open') { ctx.go('remote'); return; }
  if (kind === 'copy') {
    const state = await refreshSettingsRemote();
    const url = state && (state.pairUrl || (state.urls && state.urls[0]));
    await copySettingsText(url, 'Eşleşme adresi kopyalandı.');
    return;
  }
  const fn = kind === 'rotate'
    ? ctx.KV && ctx.KV.remote && ctx.KV.remote.rotate
    : kind === 'stop'
      ? ctx.KV && ctx.KV.remote && ctx.KV.remote.stop
      : ctx.KV && ctx.KV.remote && ctx.KV.remote.start;
  const res = await ctx.call(fn, { confirmToken: ctx.makeConfirmToken() });
  if (!res.ok) {
    ctx.toast((res.error && res.error.message) || 'Uzaktan erişim işlemi başarısız.', 'danger');
    await refreshSettingsRemote();
    return;
  }
  ctx.toast(kind === 'rotate' ? 'Eşleşme kodu yenilendi.' : kind === 'stop' ? 'Telefon erişimi kapandı.' : 'Telefon erişimi açıldı.', 'success');
  await refreshSettingsRemote();
}

/* --------------------------------------------------------------- lider masası */

const DESK_TITLE = 'Lider masası';

async function deskEnsure(createNew = false) {
  if (t6.desk.id) return t6.desk.id;
  const listRes = createNew ? null : await ctx.call(ctx.KV?.chat?.list);
  const list = (listRes?.ok && listRes.data && listRes.data.conversations) || [];
  const found = list.find((c) => c.role === 'LDR' && String(c.title || '').trim() === DESK_TITLE);
  if (found) {
    await deskOpen(found.id);
    return t6.desk.id;
  }
  const providers = (ctx.store.providers.providers || []);
  const firstModel = providers.flatMap((p) => (p.models || []).map((m) => `${p.id}::${m}`))[0];
  const [providerId, model] = firstModel ? firstModel.split('::') : [undefined, undefined];
  const res = await ctx.call(ctx.KV?.chat?.create, {
    role: 'LDR',
    title: DESK_TITLE,
    model,
    providerId,
    confirmToken: ctx.makeConfirmToken()
  });
  if (!res.ok) {
    deskRenderError((res.error && res.error.message) || 'Lider konuşması açılamadı.');
    return null;
  }
  t6.desk.id = res.data.conversation.id;
  t6.desk.messages = [];
  t6.desk.model = res.data.conversation.model || model || '';
  renderDesk();
  return t6.desk.id;
}

async function deskOpen(id) {
  const res = await ctx.call(ctx.KV?.chat?.get, { id });
  if (!res.ok) { deskRenderError('Konuşma açılamadı.'); return; }
  t6.desk.id = res.data.conversation.id;
  t6.desk.model = res.data.conversation.model || '';
  t6.desk.messages = (res.data.messages || []).map((m) => ({
    role: m.role,
    text: m.content || m.text || '',
    at: m.at,
    kind: m.kind
  }));
  renderDesk();
}

function deskRenderError(text) {
  const stream = $('[data-desk-stream]');
  if (!stream) return;
  stream.replaceChildren(ctx.el('p', { class: 'kv-empty', text }));
}

function renderDesk() {
  const stream = $('[data-desk-stream]');
  if (stream) {
    stream.replaceChildren();
    if (!t6.desk.messages.length) {
      stream.append(ctx.el('div', { class: 'kv-desk__msg kv-desk__msg--lider' }, [
        ctx.el('div', { text: 'Ben Lider. Ekibin durumunu sorabilir, görev dağıtabilir, karar isteyebilirsin.' }),
        ctx.el('small', { text: 'hazır' })
      ]));
    }
    for (const m of t6.desk.messages) {
      const isUser = m.role === 'user';
      stream.append(ctx.el('div', {
        class: `kv-desk__msg ${isUser ? 'kv-desk__msg--user' : 'kv-desk__msg--lider'}`
      }, [
        ctx.el('div', { text: m.text || '' }),
        ctx.el('small', { text: m.at ? ctx.hhmm(new Date(m.at)) : '' })
      ]));
    }
    if (t6.desk.busy) {
      stream.append(ctx.el('div', { class: 'kv-desk__msg kv-desk__msg--lider' }, [
        ctx.el('div', { class: 'kv-typing' }, [ctx.el('i'), ctx.el('i'), ctx.el('i')]),
        ctx.el('div', { class: 'kv-think kv-think--inline', 'aria-live': 'polite' }, [
          ctx.el('span', { class: 'kv-think__glyph', 'aria-hidden': 'true', text: '◐' }),
          ctx.el('span', { class: 'kv-think__label', text: 'düşünüyor…' }),
          ctx.el('span', {
            class: 'kv-think__time kv-mono',
            'data-think-clock': '',
            'data-think-start': String(t6.desk.startedAt || Date.now())
          })
        ])
      ]));
    }
    stream.scrollTop = stream.scrollHeight;
  }
  setField('desk-model', t6.desk.model || '—');
  renderDeskRoster();
}

function renderDeskRoster() {
  const root = $('[data-desk-roster]');
  if (!root) return;
  root.replaceChildren();
  const rows = ctx.store.sessions || [];
  setField('desk-roster-count', String(rows.length));
  if (!rows.length) {
    root.append(ctx.el('p', { class: 'kv-empty', text: 'Ekip listesi boş — sunucu bağlı değil.' }));
    return;
  }
  for (const s of rows) {
    const row = ctx.el('div', { class: 'kv-desk__roster-row' }, [
      ctx.el('i', { class: 'kv-dot', 'data-state': s.state === 'busy' ? 'busy' : s.state === 'error' ? 'error' : s.state === 'offline' ? 'offline' : 'idle' }),
      ctx.el('b', { text: `${s.code || '—'} · ${s.role || ''}` }),
      ctx.el('span', { class: 'kv-muted kv-mono', text: stateText(s.state) })
    ]);
    row.addEventListener('click', () => ctx.go('team'));
    root.append(row);
  }
}

async function deskSend() {
  const input = $('[data-field="desk-text"]');
  const text = input ? input.value.trim() : '';
  if (!text) return;
  if (t6.desk.busy) return;
  t6.desk.busy = true;
  const id = await deskEnsure();
  if (!id) { t6.desk.busy = false; return; }
  if (input && input.value.trim() === text) input.value = '';

  t6.desk.messages.push({ role: 'user', text, at: new Date().toISOString() });
  t6.desk.startedAt = Date.now();
  renderDesk();

  const res = await ctx.call(ctx.KV.chat.send, {
    conversationId: id,
    text,
    role: 'LDR',
    model: t6.desk.model || undefined,
    confirmToken: ctx.makeConfirmToken()
  });

  t6.desk.busy = false;
  t6.desk.startedAt = 0;
  if (res.ok) {
    await deskOpen(id);
    autoCapture(text, 'lider-masasi', 'LDR');
  } else {
    const code = res.error && res.error.code;
    const message = code === 'E_SECRET_MISSING'
      ? 'Model anahtarı yok — Sağlayıcılar ekranından bir anahtar ekleyin.'
      : (res.error && res.error.message) || code || 'gönderilemedi';
    if (input && !input.value) input.value = text;
    t6.desk.messages.push({ role: 'assistant', text: `Gönderilemedi: ${message}`, at: new Date().toISOString(), kind: 'error' });
    renderDesk();
  }
}

/* ------------------------------------------------------------- sayfa özeti */

async function summarizePage() {
  const panel = $('[data-summary-panel]');
  if (panel) panel.hidden = false;
  setField('summary-title', 'Sayfa özetleniyor…');
  setField('summary-lead', '');
  setField('summary-engine', 'çalışıyor');
  const points = $('[data-summary-points]');
  if (points) points.replaceChildren();
  const kw = $('[data-summary-keywords]');
  if (kw) kw.replaceChildren();

  const res = await ctx.call(ctx.KV && ctx.KV.browser && ctx.KV.browser.summarize, {
    engine: 'auto',
    limit: 6
  });

  if (!res.ok || !res.data) {
    const code = res.error && res.error.code;
    setField('summary-title', 'Özet çıkarılamadı');
    setField('summary-lead', code === 'E_BAD_REQUEST'
      ? 'Önce tarayıcıda bir sayfa açın; sayfa metni boş.'
      : (res.error && res.error.message) || 'Bilinmeyen hata.');
    setField('summary-engine', 'yok');
    return;
  }

  t6.summary = res.data;
  const d = res.data;
  setField('summary-title', d.title || 'Sayfa özeti');
  setField('summary-lead', d.summary || '');
  setField('summary-engine', d.engine === 'model' ? 'model özeti' : 'sezgisel özet');
  setField('summary-meta', `${d.chars} karakter · ${(d.points || []).length} madde`);
  if (points) {
    for (const p of (d.points || [])) points.append(ctx.el('li', { text: p }));
  }
  if (kw) {
    for (const k of (d.keywords || []).slice(0, 10)) kw.append(ctx.el('span', { text: k }));
  }
}

async function summaryToMemory() {
  if (!t6.summary) { ctx.toast('Önce bir sayfa özetleyin.', 'warning'); return; }
  const d = t6.summary;
  const text = [`${d.title || 'Sayfa'}: ${d.summary}`, ...(d.points || []).slice(0, 4)].join('\n');
  const saved = await autoCapture(text, 'tarayici-ozeti', 'LDR');
  ctx.toast(saved ? 'Özet hafızaya yazıldı.' : 'Hafızaya yazılamadı.', saved ? 'success' : 'warning');
}

/* --------------------------------------------------- otomatik hafıza çıkarımı */

/**
 * Bir iş bittiğinde çıkarımları hafızaya yazar (T6-4).
 * Sessizdir: başarısızlık kullanıcıyı rahatsız etmez, yalnız sayacı günceller.
 * @returns {Promise<boolean>}
 */
export async function autoCapture(text, source, role) {
  if (!text || !ctx || !ctx.KV || !ctx.KV.memory || !ctx.KV.memory.auto) return false;
  const res = await ctx.call(ctx.KV.memory.auto, {
    text: String(text).slice(0, 6000),
    source: source || 'otomatik',
    role: role || 'LDR',
    scope: 'project'
  });
  if (!res.ok) return false;
  if (res.data.count > 0) {
    t6.autoCount += res.data.count;
    const auto = $('[data-field="memory-auto-state"]');
    if (auto) auto.textContent = `otomatik kayıt açık · ${res.data.total} kayıt`;
  }
  return true;
}

/* --------------------------------------------------------------- ekran kancası */

export function tur6Screen(screen) {
  if (!ctx) return;
  if (screen === 'guide') {
    loadGuide(true);
    stopServerPoll();
  } else if (screen === 'memory') {
    refreshGraph();
    stopServerPoll();
  } else if (screen === 'settings') {
    refreshServer(true);
    refreshSettingsRemote();
    startServerPoll();
  } else if (screen === 'browser') {
    const panel = $('[data-summary-panel]');
    if (panel && t6.summary) panel.hidden = false;
    stopServerPoll();
  } else {
    stopServerPoll();
  }
  if (screen === 'team') renderDeskRoster();
}

function startServerPoll() {
  stopServerPoll();
  t6.serverTimer = setInterval(() => {
    if (ctx.store.screen !== 'settings') { stopServerPoll(); return; }
    refreshServer();
    refreshSettingsRemote();
  }, 12000);
}

function stopServerPoll() {
  if (t6.serverTimer) { clearInterval(t6.serverTimer); t6.serverTimer = null; }
}

/* ----------------------------------------------------------------------- init */

export function initTur6(context) {
  ctx = context;

  initVotion();

  /* --- rehber düğmeleri olayları (tek delege) --- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-guide-step-index]');
    if (t) { t6.guide.step = Number(t.dataset.guideStepIndex); renderGuide(); return; }

    const fab = e.target.closest('[data-votion-fab]');
    if (fab) {
      const panel = $('[data-votion-panel]');
      openVotion(Boolean(panel && panel.hidden));
      return;
    }
  });

  /* --- Votion formu --- */
  const form = $('[data-votion-form]');
  if (form) {
    form.addEventListener('submit', (e) => { e.preventDefault(); votionAskFromInput(); });
  }

  /* --- Lider masası formu --- */
  $('[data-mind-search]')?.addEventListener('input', renderGraph);
  $('[data-mind-scope]')?.addEventListener('change', renderGraph);
  const deskForm = $('[data-desk-form]');
  if (deskForm) {
    deskForm.addEventListener('submit', (e) => { e.preventDefault(); deskSend(); });
  }
  const deskText = $('[data-field="desk-text"]');
  if (deskText) {
    deskText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); deskSend(); }
    });
  }

  /* --- Votion sesli okuma tercihi --- */
  const speakPref = $('[data-field="votion-speak"]');
  if (speakPref) {
    speakPref.checked = t6.votionSpeak;
    speakPref.addEventListener('change', () => {
      t6.votionSpeak = speakPref.checked;
      if (t6.votion) t6.votion.setSpeakEnabled(t6.votionSpeak);
    });
  }
}

/** app.js'nin olay anahtarı: tur6 aksiyonlarını tek yerden yürütür. */
export async function tur6Action(action) {
  switch (action) {
    case 'guide-next': await guideNext(); return true;
    case 'guide-prev': await guidePrev(); return true;
    case 'guide-skip': await guideSkip(); return true;
    case 'guide-speak': guideSpeak(); return true;
    case 'guide-open': ctx.go('guide'); loadGuide(true); return true;
    case 'guide-restart': {
      await guideUpdate({ onboarded: false, step: 0, reset: true });
      t6.guide.step = 0;
      t6.guide.onboarded = false;
      renderGuide();
      ctx.go('guide');
      ctx.toast('Rehber baştan başladı.', 'success');
      return true;
    }
    case 'guide-goto-providers': ctx.go('providers'); return true;
    case 'guide-goto-remote': ctx.go('remote'); return true;
    case 'guide-goto-memory': ctx.go('memory'); return true;
    case 'server-start': await serverAction('start'); return true;
    case 'server-stop': await serverAction('stop'); return true;
    case 'server-refresh': await refreshServer(true); return true;
    case 'diag-run': await runDiagnostics(); return true;
    case 'diag-copy': {
      if (!t6.diag) await runDiagnostics();
      await copySettingsText(diagText(), 'Tanılama raporu kopyalandı.');
      return true;
    }
    case 'diag-fix': await serverAction('start'); await runDiagnostics(); return true;
    case 'set-remote-start': await settingsRemoteAction('start'); return true;
    case 'set-remote-stop': await settingsRemoteAction('stop'); return true;
    case 'set-remote-rotate': await settingsRemoteAction('rotate'); return true;
    case 'set-remote-copy': await settingsRemoteAction('copy'); return true;
    case 'set-remote-open': await settingsRemoteAction('open'); return true;
    case 'browser-summarize': await summarizePage(); return true;
    case 'summary-close': {
      const panel = $('[data-summary-panel]');
      if (panel) panel.hidden = true;
      return true;
    }
    case 'summary-copy': {
      if (!t6.summary) { ctx.toast('Özet yok.', 'warning'); return true; }
      const d = t6.summary;
      const text = [d.title, d.summary, ...(d.points || []).map((p) => `- ${p}`)].filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(text); ctx.toast('Özet kopyalandı.', 'success'); }
      catch { ctx.toast('Kopyalanamadı.', 'warning'); }
      return true;
    }
    case 'summary-to-memory': await summaryToMemory(); return true;
    case 'desk-new': {
      if (t6.desk.busy) return true;
      const previous = t6.desk;
      t6.desk = { id: null, messages: [], busy: true, model: '' };
      if (await deskEnsure(true)) {
        t6.desk.busy = false;
        renderDesk();
      } else {
        t6.desk = previous;
        renderDesk();
        ctx.toast('Yeni lider konuşması açılamadı.', 'warning');
      }
      return true;
    }
    case 'mind-refresh': await refreshGraph(); return true;
    case 'desk-send': await deskSend(); return true;
    case 'votion-open': openVotion(true); return true;
    case 'votion-close': openVotion(false); return true;
    case 'votion-send': votionAskFromInput(); return true;
    case 'votion-mic': {
      if (!t6.votion) return true;
      if (t6.votion.getState() === 'listening') { t6.votion.stopListening(); return true; }
      const res = await t6.votion.startListening();
      if (!res.ok) {
        ctx.toast(res.reason === 'denied'
          ? 'Mikrofon izni verilmedi — Windows ayarlarından izin ver ya da yazarak sor.'
          : res.reason === 'no-stt'
            ? 'Konuşma tanıma için Sağlayıcılar ekranından API anahtarı ekleyin.'
            : res.reason === 'unsupported'
              ? 'Bu sistemde mikrofon desteği yok — yazarak sorabilirsiniz.'
              : 'Mikrofon başlatılamadı.', 'warning');
      }
      return true;
    }
    case 'votion-stop': { if (t6.votion) t6.votion.cancel(); return true; }
    case 'votion-speak-toggle': {
      t6.votionSpeak = !t6.votionSpeak;
      if (t6.votion) t6.votion.setSpeakEnabled(t6.votionSpeak);
      const pref = $('[data-field="votion-speak"]');
      if (pref) pref.checked = t6.votionSpeak;
      const btn = $('[data-action="votion-speak-toggle"]');
      if (btn) btn.setAttribute('aria-pressed', String(t6.votionSpeak));
      ctx.toast(t6.votionSpeak ? 'Votion sesli yanıt veriyor.' : 'Votion sessiz modda.', 'info');
      return true;
    }
    case 'report-copy': {
      const detail = $('[data-report-detail]');
      if (!detail) return true;
      try { await navigator.clipboard.writeText(detail.innerText || ''); ctx.toast('Rapor kopyalandı.', 'success'); }
      catch { ctx.toast('Kopyalanamadı.', 'warning'); }
      return true;
    }
    case 'report-close': {
      const drawer = $('[data-report-drawer]');
      if (drawer) drawer.hidden = true;
      return true;
    }
    default: return false;
  }
}

/** Rehber verisini kullanıcı açmadan önce hazırlar. */
export async function tur6Boot() {
  await loadGuide(true);
}

export function tur6DeskOpen() { return deskEnsure(); }
export function tur6DeskRefresh() { return renderDesk(); }

/** Sağ panelden Votion'a metin söylet (T8-3): paneli açar, satırı yazar, seslendirir. */
export function tur6VotionSay(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  openVotion(true);
  votionRow({ who: 'votion', text: value });
  if (t6.votion) t6.votion.speak(value);
  return true;
}

/** Bağlam menüsünden Votion'a soru hazırla: paneli açar, metni alana yazar. */
export function tur6VotionPrefill(text) {
  openVotion(true);
  const input = $('[data-field="votion-text"]');
  if (input) {
    input.value = String(text || '').slice(0, 900);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  return true;
}
