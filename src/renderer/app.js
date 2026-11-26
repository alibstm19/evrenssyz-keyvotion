/* keyvotion-console · uygulama çekirdeği (Tur 2)
   Sahip: YM · Tek store, 6 ekran, komut paleti, bildirim merkezi, kadro yönetimi.
   Kurallar: inline style YOK (UI-06), sır renderer'a gelmez, tüm IPC çağrıları
   zarf ({ok,data}|{ok,error}) üzerinden ve savunmalı (köprü yoksa demo/çevrimdışı). */

import { initTur6, tur6Screen, tur6Action, tur6Boot, autoCapture, tur6DeskRefresh, tur6VotionSay, tur6VotionPrefill } from './tur6.js';
import { initTur8, tur8Screen, tur8Action, tur8Boot, tur8FilesLocalAccessChanged } from './tur8.js';

const KV = window.keyvotion || null;
const CACHE_KEY = 'kv.cache.v2';
const PREFS_KEY = 'kv.prefs.v2';

/* ---------------- rol kataloğu (roster yedeği) ---------------- */
const ROLE_SEED = [
  { code: 'LDR', role: 'Lider', model: 'evren/deepseek-v4.1-flash', note: 'karar ve denetim' },
  { code: 'YM', role: 'Proje Yöneticisi', model: 'evren/qwen3.8-flash-next', note: 'görev dağıtımı' },
  { code: 'ARC', role: 'Mimar', model: 'evren/deepseek-v4.1-flash', note: 'teknik plan' },
  { code: 'DEV', role: 'Yazılımcı', model: 'evren/gemma-4-31b', note: 'özellik kodu' },
  { code: 'DSN', role: 'Tasarımcı', model: 'evren/qwen3-vl-30b', note: 'arayüz/UX' },
  { code: 'QA', role: 'Test Yazılımcısı', model: 'evren/glm-5.3', note: 'kalite kapıları' },
  { code: 'OPS', role: 'DevOps', model: 'evren/gemma-4-31b', note: 'ortam/derleme' },
];

const STATE_TR = { idle: 'Boşta', busy: 'Çalışıyor', error: 'Hata', offline: 'Çevrimdışı', connected: 'Bağlı' };
/* §5.3 bağlantı rozeti: metin + ton + §5.1 data-state kümesine eşleme.
   NOT: data-state yalnız idle|busy|error|offline taşır (UI §5.1); rozetin gerçek
   durumu `data-connection` niteliğindedir (UI-15). */
const CONNECTION_VIEWS = {
  connecting: { text: 'Bağlanıyor…', tone: 'warning', state: 'busy' },
  connected: { text: 'Bağlı', tone: 'success', state: 'idle' },
  offline: { text: 'Çevrimdışı', tone: 'offline', state: 'offline' },
  unauthorized: { text: 'Parola geçersiz', tone: 'danger', state: 'error' },
  'no-password': { text: 'Parola gerekli', tone: 'danger', state: 'error' },
};

/** Sunucu olayındaki ham durum adını CONNECTION_VIEWS anahtarına çevirir. */
const CONNECTION_ALIASES = {
  open: 'connected',
  ready: 'connected',
  online: 'connected',
  up: 'connected',
  closed: 'offline',
  down: 'offline',
  disconnected: 'offline',
  error: 'offline',
  connecting: 'connecting',
  reconnecting: 'connecting',
  auth: 'unauthorized',
  unauthorized: 'unauthorized',
  'no-password': 'no-password',
  nopassword: 'no-password',
};

function mapConnectionState(raw) {
  const s = String(raw || '').toLowerCase();
  if (CONNECTION_ALIASES[s]) return CONNECTION_ALIASES[s];
  return CONNECTION_VIEWS[s] ? s : 'offline';
}

/* Arama icin Turkce harf katlama: "baglanti" yazan kullanici "Bağlantı"yi bulur. */
const FOLD_MAP = {
  ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u',
  â: 'a', î: 'i', û: 'u', ê: 'e', ô: 'o'
};

function fold(value) {
  return String(value || '')
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/[çğıöşüâîûêô]/g, (ch) => FOLD_MAP[ch] || ch)
    .replace(/\u0307/g, '');
}

function matchesFold(haystack, needle) {
  if (!needle) return true;
  return fold(haystack).includes(fold(needle));
}

const ERROR_CODE_VIEWS = {
  E_SECRET_MISSING: 'Parola kayıtlı değil — Ayarlar’dan girin.',
  E_UNAUTHORIZED: 'Sunucu parolayı reddetti.',
  E_OFFLINE: 'Sunucuya ulaşılamıyor.',
  E_CONFIRM_REQUIRED: 'Bu işlem onay ister.',
  E_DUPLICATE_ROLE: 'Bu rol kodu zaten kadroda.',
  E_BAD_REQUEST: 'Geçersiz istek.',
  E_TIMEOUT: 'Sunucu yanıt vermedi.',
  E_NOT_FOUND: 'Kayıt bulunamadı.',
  /* T-175: her hata kodu kullanıcıya Türkçe görünür — çıplak kod gösterilmez. */
  E_FORBIDDEN: 'Bu işlem için izin yok — yönetici kapalı tutuyor olabilir.',
  E_BUSY: 'Seans şu anda meşgul — bitmesini bekleyip yeniden deneyin.',
  E_CONFLICT: 'Kayıt bu sırada değişti — ekranı yenileyip yeniden deneyin.',
  E_RATE_LIMIT: 'Çok sık istek gönderildi — kısa bir süre bekleyin.',
  E_SERVER: 'Sunucu beklenmeyen bir hata döndü — ayrıntı denetim günlüğünde.',
  E_PARSE: 'Sunucu yanıtı okunamadı (geçersiz biçim).',
  E_VERSION: 'Sunucu sürümü desteklenmiyor — uygulamayı güncelleyin.',
  E_SECRET_CORRUPT: 'Kayıtlı anahtar çözülemedi — Sağlayıcılar ekranından yeniden girin.',
  E_LOCKED_OUT: 'Çok fazla hatalı deneme — kısa bir süre sonra tekrar deneyin.',
  E_UNKNOWN_CHANNEL: 'Bilinmeyen işlem — uygulama sürümü eski olabilir.',
  E_INTERNAL: 'Beklenmeyen bir hata oluştu — ayrıntı denetim günlüğünde.',
  E_NO_BRIDGE: 'Uygulama köprüsü hazır değil — pencereyi yenileyin.',
  E_CLIENT: 'İşlem istemcide tamamlanamadı.',
};
/* Kullanıcıya gösterilecek hata metni: önce Türkçe sözlük, sonra sunucu
   mesajı, en son çıplak kod (T-175). Teknik günlükte kod aynen kalır. */
function errText(res, fallback = 'bilinmeyen hata') {
  const err = (res && res.error) || {};
  return ERROR_CODE_VIEWS[err.code] || err.message || err.code || fallback;
}

const BOARD_COLS = [
  { id: 'planlandi', label: 'Planlandı' },
  { id: 'devam', label: 'Devam ediyor' },
  { id: 'inceleme', label: 'İnceleme' },
  { id: 'bitti', label: 'Bitti' },
];

/* ---------------- store ---------------- */
/*
 * T-181: durum çubuğundaki sürüm etiketi. Elle yazılan değer paket sürümünden
 * kopmuştu (eski bir sürümde kalmıştı). Tek sabit burada durur; test onu
 * `src/package.json` sürümüyle karşılaştırır. Sunucudan `appVersion` gelirse
 * (Yönetim → Hakkında) canlı değer bu sabitin önüne geçer.
 */
const APP_VERSION_LABEL = 'v3.4.0';

const store = {
  screen: 'team',
  connection: 'connecting',
  sessions: [],
  extra: [],
  models: { pool: [], live: [], guide: [] },
  board: { rows: [], sections: [], nextID: null },
  reports: [],
  leaderCycles: [],
  reportsDir: '',
  reportSelected: null,
  selectedSessions: new Set(),
  messages: [],
  filters: { team: '', teamState: 'all', board: '', model: '', modelTab: 'pool', reportRole: '', reportStatus: '', reportTask: '', command: '' },
  notifications: [],
  eventCount: 0,
  lastSync: null,
  prefs: {
    theme: 'dark', density: 'comfortable', notifyReports: true, notifyErrors: true,
    /* Tur 4 kişiselleştirme */
    font: 'sistem', size: 'normal', radius: 'normal',
    /* Tur 8: sağ panel kişiselleştirmesi */
    railOpen: true, railWidth: 'normal', railTab: 'lider',
    /* T-199: tasarım dili — 'classic' | 'volt' */
    design: 'classic',
    /* T-206: hareket tercihi — 'normal' | 'azalt' (animasyonları kapatır) */
    motion: 'normal'
  },
  busy: false,
  /* --- Tur 4 --- */
  chat: {
    id: null, conversation: null, messages: [], list: [],
    role: 'LDR', model: '', providerId: '', busy: false, q: '', sort: 'recent'
  },
  memory: { entries: [], flow: null, selected: null, scope: '', q: '', dir: '' },
  projects: { projects: [], activeId: null, activeDir: null },
  providers: { providers: [], secretsEncrypted: true },
  /* T-153: ilk-kurulum akışı tamamlandı mı? settings.get'ten gelir. */
  onboarded: false,
  /* T-174: ayarlardaki proje dizini (sabit makine yolu yok). */
  projectDir: '',
  /* Yerel erişim izni: kapalıyken yalnız proje klasörü gezilir. */
  localAccess: { on: false, asked: false },
  skills: [],
  permissions: { matrix: {}, roles: [], capabilities: [], stored: false },
  /* T-198: Votion oturum yetkileri (uygulama kapanınca sıfırlanır). */
  votionGrants: { capabilities: [], loaded: false },
  failover: { attempts: [], summary: '' },
  remote: { running: false, port: null, token: '', tokenMask: '', urls: [], addresses: [], pairUrl: null, clients: 0, requests: 0 },
  browser: { open: false, url: null, title: null, loading: false, error: null, canGoBack: false, canGoForward: false, zoom: 1 },
  /* --- Tur 11 (T-108): Yönetim Merkezi + rol projeksiyonu --- */
  admin: {
    info: null,        /* kv:app:info → appVersion · schemaVersion · contract */
    inventory: null,   /* kv:models:list → models · jobs · disk · roots · runtime */
    targetDir: '',     /* B2/B4: seçili hedef klasör */
    server: null,      /* kv:server:status → mode · running · url */
    audit: { entries: [], total: 0, truncated: false, op: '', since: '' },
    backups: { entries: [], lastAt: null },
    progress: new Map() /* jobId → son kv:event:model paketi (§7.5) */
  },
  /* --- Tur 12 (T-120/T-122): Bağlantı katmanı (UI §15) --- */
  integration: {
    catalog: [], accounts: [], category: 'all',
    providerId: '', accountId: '', capabilities: [],
    activity: [], loaded: false,
    /* T-196: liste ↔ detay. Kart tıklanınca detaya GİRİLİR, form aşağıda açılmaz. */
    view: 'list'
  },
  mcp: {
    servers: [], selected: '', tools: [], tool: '',
    log: [], loaded: false
  },
  /* --- Tur 13 (T-140): Bağlantı kataloğu + denetim (UI §15.5/§15.6) --- */
  catalog: {
    items: [], mcpItems: [], kind: 'all', category: 'all', q: '', installedOnly: false,
    selected: '', lastPanel: '', pending: {}, oauth: { accounts: [], flows: [] },
    poll: null, loaded: false
  },
  audit: {
    entries: [], total: 0, truncated: false,
    op: '', code: '', since: '', limit: 200, selected: '', loaded: false
  },
  /* --- Tur 14 (T-147): hazır bağlantı presetleri (UI §15.9) --- */
  preset: {
    items: [], kind: 'all', category: 'all', q: '', selected: '',
    marks: {}, accounts: {}, votion: {}, votionInfo: null, loaded: false
  }
};

/* ---------------- yardımcılar ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hhmm(date = new Date()) {
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Token sayısı: servis sözleşme gereği `tokens` NESNESİ döndürür (girdi/çıktı/cache),
 * renderer okunabilir sayıyı `tokenTotal` alanından alır. Sayı gelirse o da kabul.
 * Uydurma YOK: bilinmiyorsa 0.
 */
function tokenCount(s) {
  if (!s) return 0;
  if (typeof s.tokenTotal === 'number') return s.tokenTotal;
  if (typeof s.tokens === 'number') return s.tokens;
  const t = s.tokens;
  if (t && typeof t === 'object') {
    return (t.input || 0) + (t.output || 0) + (t.reasoning || 0);
  }
  return 0;
}

/** Maliyet: bilinmiyorsa null (kartta "—" gösterilir, 0 uydurulmaz). */
function costOf(s) {
  return s && typeof s.cost === 'number' ? s.cost : null;
}

/** Tek kullanımlık onay anahtarı (API-15/API-41: 16–128 karakter [A-Za-z0-9_-]). */
function makeConfirmToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 48);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const TONES = new Set(['idle', 'busy', 'error', 'offline', 'success', 'warning', 'danger', 'info']);
function badge(text, tone) {
  return el('span', { class: 'kv-badge', 'data-tone': TONES.has(tone) ? tone : 'info', text });
}

/**
 * T-183: boş durum ölü son değil.
 *
 * "Filtreye uyan görev yok." ne olduğunu söylüyor, ne yapacağını söylemiyordu;
 * kullanıcı sayfayı yenilemekten başka çıkış bulamıyordu. Bu yardımcı her boş
 * duruma TEK bir sonraki adım düğmesi ekler (filtreyi temizle, yeniden dene,
 * ekle…). Düğme `data-empty-action` taşır; canlı kapı bunu ölçer.
 */
function emptyState(text, actionLabel, run, extraClass = '') {
  const box = el('div', { class: `kv-empty kv-empty--action${extraClass ? ` ${extraClass}` : ''}` });
  box.append(el('p', { class: 'kv-empty__text', text }));
  if (actionLabel && typeof run === 'function') {
    box.append(el('button', {
      class: 'kv-button kv-button--ghost kv-button--sm kv-empty__button',
      type: 'button',
      'data-empty-action': actionLabel,
      text: actionLabel,
      onclick: run,
    }));
  }
  return box;
}

/* T-183: süzgeci hem store'da hem kutuda sıfırla — düğme ile kutu ayrışmasın. */
function clearTeamFilter() {
  store.filters.team = '';
  const input = $('[data-field="team-filter"]');
  if (input) input.value = '';
  renderTeam();
}

function clearBoardFilter() {
  store.filters.board = '';
  const input = $('[data-field="board-filter"]');
  if (input) input.value = '';
  renderBoard();
}

function clearReportFilters() {
  store.filters.reportRole = '';
  store.filters.reportStatus = '';
  store.filters.reportTask = '';
  for (const sel of ['report-role', 'report-status', 'report-task']) {
    const node = $(`[data-field="${sel}"]`);
    if (node) node.value = '';
  }
  renderReports();
}

/* zarf çözücü */
async function call(fn, ...args) {
  if (typeof fn !== 'function') return { ok: false, error: { code: 'E_NO_BRIDGE', message: 'Köprü yok' } };
  try {
    const res = await fn(...args);
    if (res && typeof res === 'object' && 'ok' in res) return res;
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: { code: 'E_CLIENT', message: String(e && e.message ? e.message : e) } };
  }
}

/* ---------------- kalıcı tercihler ---------------- */
function loadPrefs() {
  let saved = null;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) { saved = JSON.parse(raw); Object.assign(store.prefs, saved); }
  } catch { /* yoksay */ }
  /* T-205: ilk kez açan kullanıcı Keyvotion Prototip tasarımıyla başlar.
     Kayıtlı tercih her zaman kazanır: klasik/volt seçen kullanıcı geri dönmez. */
  if (!saved) store.prefs.design = 'prototip';
  applyPrefs();
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(store.prefs)); } catch { /* yoksay */ }
  applyPrefs();
}

function applyPrefs() {
  document.documentElement.dataset.theme = store.prefs.theme;
  document.documentElement.dataset.density = store.prefs.density;
  document.documentElement.dataset.font = store.prefs.font || 'sistem';
  document.documentElement.dataset.size = store.prefs.size || 'normal';
  document.documentElement.dataset.radius = store.prefs.radius || 'normal';
  /* T-199 kusur düzeltmesi: `.kv-app` statik olarak data-font/size/radius taşıyor
     ve themes.css bu öznitelikleri alt ağaç için yeniden tanımlıyor. Yalnız
     documentElement'i güncellemek bu üç ayarı sessizce işlevsiz bırakıyordu;
     kök kabuk da aynı değerleri taşır. */
  const shell = document.querySelector('.kv-app');
  if (shell) {
    shell.dataset.font = store.prefs.font || 'sistem';
    shell.dataset.size = store.prefs.size || 'normal';
    shell.dataset.radius = store.prefs.radius || 'normal';
  }
  /* UI-133 kaldırıldı (T-209): görünüm rolü yok; her kullanıcı bütün ekranları görür. */
  /* T-199: alternatif tasarım dili. 'classic' → öznitelik kaldırılır. */
  const design = DESIGNS.includes(store.prefs.design) ? store.prefs.design : 'classic';
  if (design === 'classic') delete document.documentElement.dataset.design;
  else document.documentElement.dataset.design = design;
  for (const b of $$('[data-design-set]')) b.setAttribute('aria-pressed', String(b.dataset.designSet === design));
  for (const b of $$('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === store.prefs.theme));
  for (const b of $$('[data-density-set]')) b.setAttribute('aria-pressed', String(b.dataset.densitySet === store.prefs.density));
  for (const b of $$('[data-size-set]')) b.setAttribute('aria-pressed', String(b.dataset.sizeSet === (store.prefs.size || 'normal')));
  for (const b of $$('[data-radius-set]')) b.setAttribute('aria-pressed', String(b.dataset.radiusSet === (store.prefs.radius || 'normal')));
  /* T-206: hareket tercihi — kapalı animasyon modu html üzerinde taşınır. */
  const motion = store.prefs.motion === 'azalt' ? 'azalt' : 'normal';
  document.documentElement.dataset.motion = motion;
  for (const b of $$('[data-motion-set]')) b.setAttribute('aria-pressed', String(b.dataset.motionSet === motion));
  const fam = $('[data-field="font-family"]');
  if (fam) fam.value = store.prefs.font || 'sistem';
}

/* T-209: görünüm rolü (UI-133) kaldırıldı. Her kullanıcı 23 ekranın
   tamamını, ayarların bütün bloklarını ve MCP/entegrasyonları görür.
   Yazma izinleri yine confirmToken + izin matrisiyle korunur. */

/* ---------------- bildirim ---------------- */
function notify(title, meta, tone = 'info') {
  store.notifications.unshift({ title, meta, tone, at: hhmm() });
  if (store.notifications.length > 60) store.notifications.pop();
  renderNotifications();
  toast(title, tone);
}

function toast(text, tone = 'info') {
  const root = $('[data-toast-root]');
  if (!root) return;
  /* T-185: toast kendini duyurur — hata uyarıcı, gerisi durum kanalı. */
  const urgent = tone === 'danger' || tone === 'warning';
  const node = el('div', {
    class: 'kv-toast',
    'data-tone': tone,
    'data-toast': '',
    role: urgent ? 'alert' : 'status',
  }, [
    el('span', { class: 'kv-toast__text', text }),
    el('button', {
      class: 'kv-toast__close',
      type: 'button',
      'aria-label': 'Bildirimi kapat',
      title: 'Kapat',
      text: '✕',
      onclick: () => node.remove(),
    }),
  ]);
  root.append(node);
  setTimeout(() => node.remove(), 6000);
}

/*
 * T-185: bildirim paneli açık/kapalı durumunu hem görsel hem erişilebilirlik
 * katmanına yazar. Düğme `aria-expanded` taşır, panel açılınca odak içeri girer,
 * Esc paneli kapatıp odağı düğmeye geri verir.
 */
function setNotificationsOpen(open, { focus = true } = {}) {
  const panel = $('[data-notifications]');
  const toggle = $('[data-action="toggle-notifications"]');
  if (!panel) return;
  panel.hidden = !open;
  if (toggle) toggle.setAttribute('aria-expanded', String(open));
  if (!open) return;
  if (!focus) return;
  const first = panel.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
  if (first) first.focus();
}

function closeNotifications({ refocus = false } = {}) {
  const panel = $('[data-notifications]');
  if (!panel || panel.hidden) return false;
  setNotificationsOpen(false);
  if (refocus) {
    const toggle = $('[data-action="toggle-notifications"]');
    if (toggle && typeof toggle.focus === 'function') {
      try { toggle.focus(); } catch { /* yok */ }
    }
  }
  return true;
}

function renderNotifications() {
  const list = $('[data-notif-list]');
  const count = $('[data-notif-count]');
  if (list) {
    list.replaceChildren();
    if (!store.notifications.length) {
      list.append(el('p', { class: 'kv-empty', text: 'Bildirim yok.' }));
    } else {
      for (const n of store.notifications) {
        list.append(el('div', { class: 'kv-notif', 'data-tone': n.tone }, [
          el('span', { class: 'kv-notif__title', text: n.title }),
          el('span', { class: 'kv-notif__meta', text: `${n.at} · ${n.meta || ''}` }),
        ]));
      }
    }
  }
  if (count) {
    count.textContent = String(store.notifications.length);
    count.hidden = store.notifications.length === 0;
  }
  /* T-185: düğme adı sayıyı taşır — ekran okuyucu rozeti okumak zorunda kalmaz. */
  const toggle = $('[data-action="toggle-notifications"]');
  if (toggle) {
    const n = store.notifications.length;
    toggle.setAttribute('aria-label', n ? `Bildirimler (${n})` : 'Bildirimler');
  }
}

/* ---------------- bağlantı durumu ---------------- */
function setConnection(state, detail) {
  store.connection = state;
  const view = CONNECTION_VIEWS[state] || { text: state, tone: 'offline', state: 'offline' };
  const chip = $('[data-connection]');
  const text = $('[data-connection-text]');
  const statusDot = $('[data-status-dot]');
  const statusText = $('[data-field="status-connection"]');
  if (chip) {
    chip.dataset.connection = state;
    chip.dataset.state = view.state;   /* §5.1 kümesi */
    chip.dataset.tone = view.tone;
  }
  if (text) text.textContent = detail || view.text;
  if (statusDot) statusDot.dataset.tone = view.tone;
  if (statusText) statusText.textContent = view.text;
}

/* ---------------- ekran geçişi ---------------- */
const SCREEN_META = {
  chat: { title: 'Sohbet', sub: 'ajanlarla gerçek konuşma · hafıza destekli' },
  team: { title: 'Ekip', sub: 'canlı ekip görünümü' },
  command: { title: 'Komut Merkezi', sub: 'seans seç · emir gönder · durdur' },
  board: { title: 'Görev Panosu', sub: '.team/board.md aynası' },
  memory: { title: 'Ajan Hafızası', sub: 'paylaşılan bağlam · akış şeması' },
  projects: { title: 'Projeler', sub: 'oluştur · geçiş yap · arşivle' },
  models: { title: 'Model Merkezi', sub: 'havuz · canlı katalog · kılavuz' },
  providers: { title: 'Sağlayıcılar', sub: 'özel API · çoklu anahtar · otomatik geçiş' },
  browser: { title: 'Tarayıcı', sub: 'uygulama içinde web · ajanların kullanabildiği' },
  remote: { title: 'Uzaktan Erişim', sub: 'telefondan kontrol · aynı ağ · eşleşme kodu' },
  reports: { title: 'Rapor Merkezi', sub: 'ajan raporları · durum dağılımı · ayrıntı' },
  settings: { title: 'Ayarlar', sub: 'bağlantı · sunucu · görünüm · sistem · kadro' },
  guide: { title: 'Rehber', sub: 'Votion anlatır · istediğiniz an atlayabilirsiniz' },
  teams: { title: 'Ekipler', sub: 'aynı anda çok ekip · ayrı lider · ayrı bütçe' },
  plans: { title: 'Planlar', sub: 'plan · not · zamanlanmış görev' },
  files: { title: 'Dosyalar', sub: 'proje dosyaları · salt okuma · bağlam seçimi' },
  contexts: { title: 'Bağlamlar', sub: 'seçili dosyalar + hafıza → tek paket' },
  admin: { title: 'Yönetim Merkezi', sub: 'ekip · model · disk · denetim · tehlikeli eylemler' },
  integrations: { title: 'Entegrasyonlar', sub: 'katalog · hesaplar · yetenekler · etkinlik' },
  mcps: { title: 'MCP Sunucuları', sub: 'sunucular · araçlar · çağrı · günlük' },
  catalog: { title: 'Bağlantı Kataloğu', sub: 'entegrasyon + MCP şablonları · tek ızgara' },
  audit: { title: 'Denetim', sub: 'yalnız üst veri · limit ≤ 500' },
  connect: { title: 'Hazır Bağlantılar', sub: '124 hazır bağlantı · tek ekran kurulum · Votion erişimi' },
};

/*
 * T-179: ekran kısayollarının TEK kaynağı. Klavye dinleyicisi, komut paleti ve
 * kısayol sayfası buradan türetilir; böylece sayfa ile gerçek davranış
 * ayrışamaz (T-179 öncesi sayfa Ctrl+1'i "Ekip" diye yanlış yazıyordu).
 */
const SCREEN_SHORTCUTS = Object.freeze({
  1: 'chat',
  2: 'team',
  3: 'command',
  4: 'board',
  5: 'memory',
  6: 'projects',
  7: 'models',
  8: 'providers',
  9: 'browser'
});

function shortcutLabel(screen) {
  for (const [num, target] of Object.entries(SCREEN_SHORTCUTS)) {
    if (target === screen) return `Ctrl+${num}`;
  }
  return '';
}

/* T-178: ekran değişimini ekran okuyucuya duyur (görünmez canlı bölge). */
function announceScreen(title) {
  const live = $('[data-field="screen-live"]');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = `${title} ekranı açıldı`; }, 60);
}

function go(screen) {
  if (!SCREEN_META[screen]) return;
  /* Tarayıcı görünümü main prosesde yaşar: ekrandan çıkarken kapat. */
  if (store.screen === 'browser' && screen !== 'browser') closeBrowser();
  const changed = store.screen !== screen;
  store.screen = screen;
  for (const s of $$('[data-screen]')) {
    s.hidden = s.dataset.screen !== screen;
    if (s.hidden) s.setAttribute('aria-hidden', 'true');
    else s.removeAttribute('aria-hidden');
  }
  for (const b of $$('[data-nav-item]')) {
    const on = b.dataset.navItem === screen;
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  const t = $('[data-screen-title]');
  const sub = $('[data-screen-sub]');
  if (t) t.textContent = SCREEN_META[screen].title;
  if (sub) sub.textContent = SCREEN_META[screen].sub;
  /* T-153: başlıktaki ? düğmesi her ekranda o ekranın yardımına bağlanır. */
  const helpLink = $('[data-guide-link]');
  if (helpLink) helpLink.dataset.guideLink = screen;
  const main = $('[data-main]');
  if (main) main.scrollTop = 0;
  if (screen === 'chat') renderChat();
  if (screen === 'command') renderCommand();
  if (screen === 'board') renderBoard();
  if (screen === 'memory') renderMemory();
  if (screen === 'projects') renderProjects();
  if (screen === 'models') renderModels();
  if (screen === 'providers') renderProviders();
  if (screen === 'remote') { renderRemote(); refreshRemote(); }
  if (screen === 'reports') renderReports();
  if (screen === 'settings') renderSettings();
  /* Tur 11 (T-108): Yönetim Merkezi — çiz + veri çek + ilerleme push'una abone ol. */
  if (screen === 'admin') { renderAdmin(); refreshAdmin(); bindAdminProgress(); }
  else unbindAdminProgress();
  /* Tur 12: Bağlantı katmanı — çiz · ilk list() · push aboneliği. */
  if (screen === 'integrations') {
    /* T-196: ekrana giriş LİSTE görünümüdür; detay yalnız gezinme kaydıyla açılır. */
    if (!integrationDetailTarget) {
      store.integration.view = 'list';
      store.integration.providerId = '';
      store.integration.accountId = '';
      store.integration.capabilities = [];
    } else {
      store.integration.view = 'detail';
    }
    renderIntegrations(); refreshIntegrations(); bindIntegrationEvents();
  } else unbindIntegrationEvents();
  if (screen === 'mcps') { renderMcps(); refreshMcps(); bindMcpEvents(); }
  else unbindMcpEvents();
  /* Tur 13 (T-140): katalog + denetim — çiz · ilk list() · OAuth yoklaması. */
  if (screen === 'catalog') { renderCatalog(); refreshCatalog(); }
  else stopCatalogPoll();
  if (screen === 'audit') { renderAudit(); refreshAudit(); }
  /* Tur 14 (T-147): hazır bağlantılar — çiz · preset listesi · Votion manifesti (bir kez). */
  if (screen === 'connect') { renderPreset(); refreshPresets(); }
  /* Tur 6 ekran kancaları: rehber, zihin haritası, sunucu ölçümü, lider masası. */
  tur6Screen(screen);
  /* Tur 8: sağ panel ekranla birlikte tazelenir. */
  tur8Screen(screen);
  /* T-178: ekran değiştiyse odak başlığa taşınır ve ekran okuyucuya duyurulur;
     klavye kullanıcısı yeni ekranda sekmeye baştan başlamak zorunda kalmaz. */
  if (changed) {
    if (t) {
      t.setAttribute('tabindex', '-1');
      t.focus({ preventScroll: true });
    }
    announceScreen(SCREEN_META[screen].title);
  }
  /* Gezgin: kullanıcı gezinmesini sekme geçmişine yaz (navApply sessizdir) */
  if (!goSilent) navRecord(navEntryOf('screen', screen));
}

/* ================= GEZGİN (tarayıcı benzeri sekmeler) =================
 * Ağ yok: adresler `kv://` şemasıyla YEREL ekran/kayıt hedeflerini gösterir.
 * Gerçek bir web görünümü değil — konsolun kendi içinde sekme/geri/ileri.
 */
const NAV_SCREENS = new Set(['chat', 'team', 'command', 'board', 'memory', 'projects', 'models', 'providers', 'browser', 'remote', 'reports', 'settings', 'guide', 'teams', 'plans', 'files', 'contexts', 'admin', 'integrations', 'mcps', 'catalog', 'audit', 'connect']);
const navigator = { tabs: [], active: 0, seq: 1, maxStack: 60 };
let goSilent = false;
/* T-196: go('integrations') liste görünümüne döner; detay yalnız bu hedefle açılır. */
let integrationDetailTarget = null;

/** Kayıt tipine göre görünen başlık — uydurma yok, elde ne varsa o. */
function navTitleOf(kind, ref) {
  if (kind === 'screen') return (SCREEN_META[ref] && SCREEN_META[ref].title) || ref;
  if (kind === 'task') {
    const row = store.board.rows.find((r) => String(r.id || '').toUpperCase() === String(ref).toUpperCase());
    return row ? `${row.id} · ${String(row.title || '').slice(0, 28)}` : String(ref);
  }
  if (kind === 'report') {
    const rep = store.reports.find((r) => r.id === ref);
    return rep ? `${rep.taskId || 'rapor'} · ${rep.role || '—'}` : 'rapor';
  }
  if (kind === 'session') {
    const s = store.sessions.find((x) => x.sessionId === ref);
    return s ? `Akış · ${s.code || s.role || 'seans'}` : 'akış';
  }
  if (kind === 'integration') {
    const p = store.integration.catalog.find((x) => x.id === ref);
    return p ? `Entegrasyon · ${String(p.name || p.id)}` : String(ref);
  }
  return String(ref);
}

function navEntryOf(kind, ref) {
  return { kind, ref: String(ref), title: navTitleOf(kind, ref) };
}

function navAddrOf(entry) {
  if (!entry) return '';
  if (entry.kind === 'screen') return entry.ref;
  if (entry.kind === 'task') return `board/${entry.ref}`;
  if (entry.kind === 'report') return `reports/${entry.ref}`;
  if (entry.kind === 'session') return `session/${entry.ref}`;
  if (entry.kind === 'integration') return `integrations/${entry.ref}`;
  return '';
}

function navActiveTab() {
  return navigator.tabs[navigator.active] || null;
}

function navCurrentEntry() {
  const tab = navActiveTab();
  return tab ? tab.stack[tab.at] || null : null;
}

/** Gezinmeyi aktif sekmenin geçmişine yaz. */
function navRecord(entry) {
  if (goSilent || !entry) return;
  const tab = navActiveTab();
  if (!tab) return;
  const cur = tab.stack[tab.at];
  if (cur && navAddrOf(cur) === navAddrOf(entry)) {
    cur.title = navTitleOf(entry.kind, entry.ref);
    renderTabs();
    return;
  }
  tab.stack = tab.stack.slice(0, tab.at + 1);
  tab.stack.push(entry);
  if (tab.stack.length > navigator.maxStack) {
    tab.stack.shift();
  }
  tab.at = tab.stack.length - 1;
  renderTabs();
}

/** Kaydı ekranda göster (geçmişe YAZMAZ). */
async function navApply(entry) {
  if (!entry) return;
  goSilent = true;
  try {
    if (entry.kind === 'screen') {
      go(entry.ref);
    } else if (entry.kind === 'task') {
      go('board');
      if (!store.board.rows.length) await refreshBoard();
      const row = store.board.rows.find((r) => String(r.id || '').toUpperCase() === String(entry.ref).toUpperCase());
      if (row) openTaskDetail(row);
      else toast(`${entry.ref} panoda yok.`, 'warning');
    } else if (entry.kind === 'report') {
      go('reports');
      store.reportSelected = entry.ref;
      renderReports();
      renderReportDetail();
    } else if (entry.kind === 'session') {
      go('team');
      const s = store.sessions.find((x) => x.sessionId === entry.ref);
      await openEmbed(entry.ref, s && s.code);
    } else if (entry.kind === 'integration') {
      integrationDetailTarget = entry.ref;
      go('integrations');
      if (!store.integration.loaded) await refreshIntegrations();
      await pickIntegration(entry.ref, { silent: true });
      integrationDetailTarget = null;
    }
  } finally {
    goSilent = false;
  }
  renderTabs();
}

/** Yeni sekmede ya da aktif sekmede aç. */
function navOpen(entry, asNewTab) {
  if (!entry) return;
  if (asNewTab || !navigator.tabs.length) {
    navigator.tabs.push({ id: `tab${navigator.seq++}`, stack: [entry], at: 0 });
    navigator.active = navigator.tabs.length - 1;
  } else {
    navRecord(entry);
  }
  renderTabs();
  navApply(entry);
}

function navBack() {
  const tab = navActiveTab();
  if (!tab || tab.at <= 0) { toast('Geri gidilecek kayıt yok.', 'info'); return; }
  tab.at -= 1;
  renderTabs();
  navApply(tab.stack[tab.at]);
}

function navForward() {
  const tab = navActiveTab();
  if (!tab || tab.at >= tab.stack.length - 1) { toast('İleri gidilecek kayıt yok.', 'info'); return; }
  tab.at += 1;
  renderTabs();
  navApply(tab.stack[tab.at]);
}

function navNewTab() {
  /* Yeni sekme konsolun "ana sayfası" ile açılır (tarayıcı alışkanlığı). */
  const entry = navEntryOf('screen', 'team');
  navigator.tabs.push({ id: `tab${navigator.seq++}`, stack: [entry], at: 0 });
  navigator.active = navigator.tabs.length - 1;
  renderTabs();
  navApply(entry);
}

function navCloseTab(tabId) {
  const idx = navigator.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return;
  navigator.tabs.splice(idx, 1);
  if (!navigator.tabs.length) {
    navigator.tabs.push({ id: `tab${navigator.seq++}`, stack: [navEntryOf('screen', store.screen || 'team')], at: 0 });
    navigator.active = 0;
  } else if (navigator.active >= navigator.tabs.length) {
    navigator.active = navigator.tabs.length - 1;
  } else if (idx < navigator.active) {
    navigator.active -= 1;
  }
  const entry = navCurrentEntry();
  renderTabs();
  if (entry) navApply(entry);
}

function navSelectTab(tabId) {
  const idx = navigator.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0 || idx === navigator.active) return;
  navigator.active = idx;
  const entry = navCurrentEntry();
  renderTabs();
  if (entry) navApply(entry);
}

/** Adres çubuğunu aktif kayda göre güncelle. */
function syncAddress() {
  const input = $('[data-field="nav-address"]');
  const hint = $('[data-field="nav-hint"]');
  const tab = navActiveTab();
  if (input && document.activeElement !== input) input.value = navAddrOf(navCurrentEntry());
  if (hint && tab) hint.textContent = `${tab.at + 1}/${tab.stack.length}`;
  const back = $('[data-action="nav-back"]');
  const fwd = $('[data-action="nav-forward"]');
  if (back) back.disabled = !tab || tab.at <= 0;
  if (fwd) fwd.disabled = !tab || tab.at >= tab.stack.length - 1;
}

function renderTabs() {
  const strip = $('[data-tab-strip]');
  if (!strip) return;
  const KIND_LABEL = { screen: 'ekr', task: 'grv', report: 'rap', session: 'akş' };
  strip.replaceChildren();
  for (const [i, tab] of navigator.tabs.entries()) {
    const entry = tab.stack[tab.at] || {};
    const btn = el('button', {
      class: 'kv-tab', type: 'button', role: 'tab',
      'aria-selected': String(i === navigator.active),
      'data-tab': tab.id,
      title: navAddrOf(entry) ? `kv://${navAddrOf(entry)}` : '',
    }, [
      el('span', { class: 'kv-tab__kind', text: KIND_LABEL[entry.kind] || '?' }),
      el('span', { class: 'kv-tab__label', text: entry.title || 'sekme' }),
      el('span', { class: 'kv-tab__close', 'data-tab-close': tab.id, role: 'button', 'aria-label': 'Sekmeyi kapat', text: '✕' }),
    ]);
    strip.append(btn);
  }
  syncAddress();
}

/** `kv://` adresini çöz ve aç. Bilinmeyen adres uydurulmaz. */
function navGoAddress(raw) {
  const text = String(raw || '').trim().replace(/^kv:\/\//i, '').replace(/^\/+|\/+$/g, '');
  if (!text) { syncAddress(); return; }
  const cut = text.indexOf('/');
  const head = (cut < 0 ? text : text.slice(0, cut)).toLowerCase();
  const ref = cut < 0 ? '' : text.slice(cut + 1);

  if (NAV_SCREENS.has(head) && !ref) { navOpen(navEntryOf('screen', head)); return; }
  if (head === 'board' && ref) { navOpen(navEntryOf('task', ref.toUpperCase())); return; }
  if (head === 'reports' && ref) {
    const rep = store.reports.find((r) => r.id === ref) || store.reports.find((r) => String(r.taskId || '').toUpperCase() === ref.toUpperCase());
    if (rep) navOpen(navEntryOf('report', rep.id));
    else { toast(`Rapor bulunamadı: ${ref}`, 'warning'); syncAddress(); }
    return;
  }
  if ((head === 'session' || head === 'sessions') && ref) {
    const s = store.sessions.find((x) => x.sessionId === ref) || store.sessions.find((x) => String(x.code || '').toUpperCase() === ref.toUpperCase());
    if (s && s.sessionId) navOpen(navEntryOf('session', s.sessionId));
    else { toast(`Seans bulunamadı: ${ref}`, 'warning'); syncAddress(); }
    return;
  }
  if (head === 'team' && ref) {
    const s = store.sessions.find((x) => String(x.code || '').toUpperCase() === ref.toUpperCase());
    if (s && s.sessionId) navOpen(navEntryOf('session', s.sessionId));
    else if (s) { toast(`${ref} kadroda ama canlı seansı yok.`, 'info'); syncAddress(); }
    else { toast(`Rol bulunamadı: ${ref}`, 'warning'); syncAddress(); }
    return;
  }
  /* T-196: kv://integrations/<sağlayıcı> — detay görünümünü doğrudan açar. */
  if (head === 'integrations' && ref) { navOpen(navEntryOf('integration', ref)); return; }
  toast(`Adres anlaşılmadı: kv://${text}`, 'warning');
  syncAddress();
}


/* ---------------- EKİP ---------------- */
function sessionCards() {
  const filter = store.filters.team.trim().toLowerCase();
  const stateFilter = store.filters.teamState;
  return store.sessions.filter((s) => {
    if (stateFilter !== 'all' && s.state !== stateFilter) return false;
    if (!filter) return true;
    return matchesFold([s.role, s.code, s.model, s.task].join(' '), filter);
  });
}

function renderTeam() {
  const root = $('[data-team-grid]');
  if (!root) return;
  const cards = sessionCards();
  root.replaceChildren();

  if (!cards.length) {
    const filtered = Boolean(store.filters.team.trim()) || store.filters.teamState !== 'all';
    root.append(filtered
      ? emptyState('Filtreye uyan seans yok.', 'Filtreyi temizle', clearTeamFilter)
      : emptyState('Seans verisi henüz yok — Ayarlar → Bağlantı.', 'Bağlantı ayarlarını aç', () => go('settings')));
  }

  for (const s of cards) {
    const state = s.state || 'offline';
    const card = el('article', { class: 'kv-card', 'data-role-card': '', 'data-role': s.code, 'data-state': state, 'data-missing': s.missing ? 'true' : null });

    const head = el('div', { class: 'kv-card__head' }, [
      el('div', { class: 'kv-card__role' }, [
        el('span', { class: 'kv-card__title', text: `${s.role || s.code} (${s.code})` }),
        el('span', { class: 'kv-card__code', text: s.sessionId ? s.sessionId.slice(0, 14) : 'kadro kaydı var, seans yok' }),
      ]),
      badge(STATE_TR[state] || state, state),
    ]);

    const meta = el('div', { class: 'kv-card__meta' }, [
      el('span', { class: 'kv-mono', text: s.model || '—' }),
      el('span', { 'data-field': 'tokens', text: `${tokenCount(s).toLocaleString('tr-TR')} token` }),
      el('span', { 'data-field': 'cost', text: costOf(s) != null ? `${costOf(s).toFixed(2)} $` : '— $' }),
      el('span', { text: s.updatedAt ? hhmm(new Date(s.updatedAt)) : '—' }),
    ]);

    const task = el('p', { class: 'kv-card__task', text: s.task || 'Bekleyen iş yok.' });

    const actions = el('div', { class: 'kv-card__actions' }, [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', 'data-action': 'card-command', 'data-session': s.sessionId || '', text: '⌘ Komut' }),
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', 'data-action': 'card-model', 'data-session': s.sessionId || '', text: '◈ Model' }),
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', 'data-action': 'card-flow', 'data-session': s.sessionId || '', 'data-role-code': s.code, text: '▸ Akış' }),
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', 'data-action': 'card-report', 'data-session': s.sessionId || '', text: '✎ Rapor' }),
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', 'data-action': 'card-remove', 'data-session': s.sessionId || '', 'data-role-code': s.code, text: '✕' }),
    ]);

    card.append(head, meta, task, actions);
    root.append(card);
  }

  /* kadro dışı seanslar */
  const extraRoot = $('[data-team-extra]');
  const extraTitle = $('[data-extra-title]');
  if (extraRoot && extraTitle) {
    extraRoot.replaceChildren();
    extraTitle.hidden = store.extra.length === 0;
    extraRoot.hidden = store.extra.length === 0;
    for (const s of store.extra) {
      extraRoot.append(el('article', { class: 'kv-card', 'data-state': s.state || 'offline' }, [
        el('div', { class: 'kv-card__head' }, [
          el('strong', { class: 'kv-card__title', text: s.title || s.sessionId || 'seans' }),
          badge('Kadro dışı', 'info'),
        ]),
        el('span', { class: 'kv-card__code', text: s.sessionId || '' }),
        el('div', { class: 'kv-card__actions' }, [
          el('button', { class: 'kv-button kv-button--ghost', type: 'button', 'data-action': 'card-command', 'data-session': s.sessionId || '', text: '⌘ Komut' }),
          el('button', { class: 'kv-button kv-button--ghost', type: 'button', 'data-action': 'card-report', 'data-session': s.sessionId || '', text: '✎ Rapor' }),
        ]),
      ]));
    }
  }

  renderStats();
}

function renderStats() {
  const set = (k, v) => {
    const n = $(`[data-stat="${k}"]`);
    if (n) n.textContent = v;
  };
  set('sessions', String(store.sessions.length));
  set('busy', String(store.sessions.filter((s) => s.state === 'busy').length));
  set('idle', String(store.sessions.filter((s) => s.state === 'idle').length));
  set('tokens', (store.sessions.reduce((a, s) => a + tokenCount(s), 0)).toLocaleString('tr-TR'));
  set('reports', String(store.reports.length));
  const st = $('[data-field="status-sessions"]');
  if (st) st.textContent = `${store.sessions.length} seans · ${store.sessions.filter((s) => s.state === 'busy').length} çalışan`;
}

/* ---------------- KOMUT ---------------- */
const STATUS_TONE = { TAMAM: 'bitti', KISMİ: 'kismi', KISMI: 'kismi', BLOKE: 'bloke' };

function renderCommand() {
  const root = $('[data-command-targets]');
  if (!root) return;
  root.replaceChildren();
  const list = store.sessions;
  const q = (store.filters.command || '').toLowerCase();
  const shown = q
    ? list.filter((s) => matchesFold(`${s.role || ''} ${s.code || ''} ${s.model || ''}`, q))
    : list;

  if (!list.length) {
    root.append(el('p', { class: 'kv-empty kv-cmd__empty', text: 'Seans yok — sunucu bağlı değil.' }));
  } else if (!shown.length) {
    root.append(el('p', { class: 'kv-empty kv-cmd__empty', text: 'Aramaya uyan seans yok.' }));
  }

  for (const s of shown) {
    const id = s.sessionId || s.code;
    const on = store.selectedSessions.has(id);
    const chip = el('button', {
      class: `kv-cmd__target${on ? ' kv-cmd__target--on' : ''}`,
      type: 'button',
      'data-target': id,
      'aria-pressed': String(on),
      title: s.model || ''
    }, [
      el('span', { text: `${s.code || '—'} · ${s.role || ''}` }),
      el('code', { text: s.model || '—' })
    ]);
    chip.addEventListener('click', () => {
      if (on) store.selectedSessions.delete(id);
      else store.selectedSessions.add(id);
      renderCommand();
    });
    root.append(chip);
  }

  const count = $('[data-field="command-count"]');
  if (count) count.textContent = `${store.selectedSessions.size} seçili`;
  const label = $('[data-field="command-target-label"]');
  if (label) {
    label.textContent = store.selectedSessions.size
      ? `${store.selectedSessions.size} hedef seçili`
      : 'Hedef seçin';
  }
  renderThread();
}

function renderThread() {
  const thread = $('[data-command-thread]');
  if (!thread) return;
  thread.replaceChildren();
  if (!store.selectedSessions.size) {
    thread.append(el('p', { class: 'kv-empty', text: 'Hedef seans seçin — mesaj geçmişi burada görünür.' }));
    return;
  }
  if (!store.messages.length) {
    thread.append(el('p', { class: 'kv-empty', text: 'Mesaj geçmişi yok (bağlantı gerekli).' }));
    return;
  }
  for (const m of store.messages) {
    const isUser = m.role === 'user';
    const tone = m.kind === 'error' ? 'error' : isUser ? 'ok' : 'normal';
    thread.append(el('div', { class: 'kv-cmd__line', 'data-tone': tone }, [
      el('time', { text: m.at ? hhmm(new Date(m.at)) : '' }),
      el('b', { text: isUser ? 'SEN' : (m.agent || m.role || 'AJAN') }),
      el('span', { text: m.text || '' })
    ]));
  }
}

/* ---------------- PANO ---------------- */
function renderBoard() {
  const root = $('[data-board-root]');
  if (!root) return;
  root.replaceChildren();
  const filter = store.filters.board.trim().toLowerCase();
  const rows = store.board.rows.filter((r) =>
    matchesFold([r.id, r.title, r.owner].join(' '), filter));

  if (!rows.length) {
    root.append(store.board.rows.length
      ? emptyState('Filtreye uyan görev yok.', 'Filtreyi temizle', clearBoardFilter)
      : emptyState('Pano okunamadı — .team/board.md erişilemiyor.', 'Yeniden dene', () => refreshBoard()));
    return;
  }

  /* BOARD_COLS dışında kalan durumlar (red, bloke, "revizyon→T-0xx") eskiden
     hiçbir sütuna düşmüyor ve kart görünmüyordu (ölçüldü: 39 satır → 36 kart).
     Artık her tanınmayan durum kendi sütununu alır; hiçbir görev gizlenmez. */
  const knownCols = new Set(BOARD_COLS.map((c) => c.id));
  const STATUS_LABELS = { red: 'Red', bloke: 'Bloke', planlandi: 'Planlandı' };
  const extraCols = [...new Set(rows.map((r) => r.status).filter((s) => s && !knownCols.has(s)))]
    .map((id) => ({ id, label: STATUS_LABELS[id] || id }));

  for (const col of [...BOARD_COLS, ...extraCols]) {
    const items = rows.filter((r) => r.status === col.id);
    const column = el('section', { class: 'kv-board__col', 'data-board-group': col.id }, [
      el('header', { class: 'kv-board__colhead' }, [
        el('span', { text: col.label }),
        el('span', { class: 'kv-mono', text: String(items.length) }),
      ]),
    ]);
    for (const r of items) {
      const card = el('article', { class: 'kv-board__card', 'data-status': r.status, 'data-task': r.id, tabindex: '0' }, [
        el('span', { class: 'kv-board__id', text: r.id || '—' }),
        el('span', { class: 'kv-board__title', text: r.title || '' }),
        el('span', { class: 'kv-board__owner', text: `${r.owner || '—'} · ${r.evidence ? 'kanıt var' : 'kanıt yok'}` }),
      ]);
      /* kart tıklaması Gezgin geçmişine kayıt olarak düşer (geri ile dönülebilir) */
      card.addEventListener('click', () => navOpen(navEntryOf('task', r.id)));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navOpen(navEntryOf('task', r.id)); } });
      column.append(card);
    }
    if (!items.length) column.append(el('p', { class: 'kv-empty', text: '—' }));
    root.append(column);
  }
}

/* ---------------- MODELLER ---------------- */
function renderModels() {
  const body = $('[data-model-body]');
  if (!body) return;
  body.replaceChildren();
  const tab = store.filters.modelTab;
  const filter = store.filters.model.trim().toLowerCase();

  const rows = tab === 'live' ? store.models.live
    : tab === 'guide' ? store.models.guide
      : store.models.pool;

  const list = rows.filter((m) => !filter ||
    matchesFold([m.id, m.name, m.provider, m.role, m.character].join(' '), filter));

  const title = $('[data-field="model-tab-title"]');
  if (title) title.textContent = tab === 'live' ? 'Canlı katalog (/api/model)' : tab === 'guide' ? 'Görev → model kılavuzu' : 'Model havuzu (models.md)';
  const count = $('[data-field="model-count"]');
  if (count) count.textContent = `${list.length} kayıt`;
  const summary = $('[data-cost-summary]');
  if (summary) {
    const totalTokens = store.sessions.reduce((a, s) => a + tokenCount(s), 0);
    /* Maliyet bilinmeyen seanslar toplamı EKSİK gösterir; bunu gizlemek "uydurma
       kesinlik" olurdu. Bu yüzden kaç seansın maliyeti bilinmediği açıkça yazılır. */
    const known = store.sessions.filter((s) => costOf(s) != null);
    const unknown = store.sessions.length - known.length;
    const totalCost = known.reduce((a, s) => a + costOf(s), 0);
    const costText = known.length
      ? `${totalCost.toFixed(2)} $${unknown ? ` (+${unknown} bilinmiyor)` : ''}`
      : '— $';
    summary.textContent = `${list.length} kayıt · ${totalTokens.toLocaleString('tr-TR')} token · ${costText}`;
    summary.title = unknown
      ? `${unknown} seansın maliyeti sunucudan gelmedi; toplam yalnız bilinen seansları kapsar.`
      : 'Toplam maliyet bilinen tüm seansları kapsar.';
    summary.dataset.costUnknown = String(unknown);
  }

  if (!list.length) {
    const tr = el('tr');
    tr.append(el('td', { colspan: '5', class: 'kv-empty', text: tab === 'live' ? 'Canlı katalog için bağlantı gerekli.' : 'Kayıt yok.' }));
    body.append(tr);
    return;
  }

  let lastProvider = null;
  for (const m of list) {
    const provider = m.provider || (String(m.id || '').split('/')[0] || '—');
    /* UI-117: sağlayıcı gruplaması — değişince grup başlığı satırı */
    if (provider !== lastProvider) {
      lastProvider = provider;
      const groupRow = el('tr', { 'data-provider-group': provider, class: 'kv-provider-row' });
      groupRow.append(el('td', { colspan: '5' }, [
        el('span', { class: 'kv-provider-name', text: provider }),
        el('span', { class: 'kv-muted', text: ` (${list.filter((x) => (x.provider || String(x.id || '').split('/')[0]) === provider).length})` }),
      ]));
      body.append(groupRow);
    }
    const tr = el('tr', { 'data-model-row': m.id || '' });
    tr.append(el('td', {}, [
      el('span', { class: 'kv-model-name', text: m.name || m.id || '—' }),
      el('span', { class: 'kv-model-id', text: m.id || '' }),
    ]));
    tr.append(el('td', { text: provider }));
    tr.append(el('td', { text: m.character || m.role || m.note || m.strengths || '—' }));
    tr.append(el('td', { text: m.usedBy ? String(m.usedBy) : '—' }));
    const act = el('td', {}, [
      el('div', { class: 'kv-table__actions' }, [
        el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'model-assign', 'data-model': m.id || '', text: 'Ata' }),
      ]),
    ]);
    tr.append(act);
    body.append(tr);
  }
}

/* ---------------- RAPORLAR ---------------- */
function reportFiltered() {
  const f = store.filters;
  return store.reports.filter((r) => {
    if (f.reportRole && (r.role || '') !== f.reportRole) return false;
    if (f.reportStatus && (r.status || '') !== f.reportStatus) return false;
    if (f.reportTask && !matchesFold(r.taskId, f.reportTask)) return false;
    return true;
  });
}

function renderLeaderCycles() {
  const root = $('[data-leader-cycle-list]');
  if (!root) return;
  root.replaceChildren();
  const cycles = store.leaderCycles;
  if (!cycles?.length) {
    root.append(el('p', { class: 'kv-cycle__empty', text: 'Henüz lider döngüsü kaydı yok.' }));
    return;
  }
  for (const c of cycles) {
    const card = el('div', {
      class: `kv-cycle${c.derived ? ' kv-cycle--derived' : ''}`,
      'data-derived': c.derived ? 'true' : null,
    }, [
      el('div', { class: 'kv-cycle__head' }, [
        el('span', { class: 'kv-cycle__date', text: c.at || '—' }),
        el('span', { class: 'kv-cycle__status', text: c.status || '—' }),
      ]),
      el('div', { class: 'kv-cycle__title', text: c.title || '—' }),
      el('div', { class: 'kv-cycle__intent', text: c.intent || '—' }),
      el('div', { class: 'kv-cycle__idea', text: c.idea || '—' }),
    ]);
    root.append(card);
  }
}

function renderReports() {
  const list = $('[data-report-list]');
  if (!list) return;
  const rows = reportFiltered();
  list.replaceChildren();

  const roleSel = $('[data-field="report-role"]');
  if (roleSel && roleSel.options.length <= 1) {
    /* Yalniz gercek rol kodlari: eski bozuk kayitlardan gelen uzun metinler süzülür. */
    const roles = [...new Set(store.reports.map((r) => r.role).filter((x) => x && /^[A-Z]{2,6}$/.test(x)))].sort();
    for (const r of roles) roleSel.append(el('option', { value: r, text: r }));
  }

  /* Sayaçlar: filtreden bağımsız toplam dağılım + gösterilen. */
  const all = store.reports;
  const setStat = (name, value) => {
    const node = $(`[data-field="report-stat-${name}"]`);
    if (node) node.textContent = String(value);
  };
  setStat('total', all.length);
  setStat('tamam', all.filter((r) => r.status === 'TAMAM').length);
  setStat('kismi', all.filter((r) => r.status === 'KISMİ' || r.status === 'KISMI').length);
  setStat('bloke', all.filter((r) => r.status === 'BLOKE').length);
  const count = $('[data-field="report-count"]');
  if (count) count.textContent = String(rows.length);

  const scan = $('[data-field="report-scan"]');
  if (scan) {
    const dir = store.reportsDir || '.team/reports';
    scan.textContent = all.length ? `${all.length} rapor · ${dir}` : `kaynak: ${dir}`;
  }

  if (!rows.length) {
    const filteredReports = Boolean(store.filters.reportRole || store.filters.reportStatus || store.filters.reportTask.trim());
    list.append(filteredReports
      ? emptyState('Filtreye uyan rapor yok.', 'Filtreyi temizle', clearReportFilters)
      : emptyState('Henüz rapor toplanmadı.', 'Yeniden tara', () => refreshReports()));
    renderLeaderCycles();
    renderReportDetail();
    return;
  }

  for (const r of rows) {
    const card = el('article', {
      class: 'kv-report-card',
      tabindex: '0',
      role: 'option',
      'aria-selected': String(store.reportSelected === r.id),
      'data-status': STATUS_TONE[r.status] || '',
      'data-report': r.id
    }, [
      el('div', { class: 'kv-report-card__head' }, [
        el('b', { text: `${r.taskId || 'RAPOR'} · ${r.role || '—'}` }),
        el('span', { class: 'kv-badge kv-report-card__status', 'data-tone': r.status === 'TAMAM' ? 'success' : r.status === 'BLOKE' ? 'danger' : r.status ? 'warning' : 'info', text: r.status || 'bilinmiyor' })
      ]),
      el('div', { class: 'kv-report-card__meta' }, [
        el('span', { text: r.at ? hhmm(new Date(r.at)) : '—' }),
        el('span', { text: r.source === 'file' ? 'dosya' : 'seans' }),
        el('span', { text: `${String(r.ozet || r.raw || '').length} karakter` })
      ]),
      el('div', { class: 'kv-report-card__body', text: r.ozet || r.raw || 'Özet yok.' })
    ]);
    const select = () => { store.reportSelected = r.id; renderReports(); };
    card.addEventListener('click', select);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    });
    list.append(card);
  }
  renderLeaderCycles();
  renderReportDetail();
}

function renderReportDetail() {
  const detail = $('[data-report-detail]');
  if (!detail) return;
  const drawer = $('[data-report-drawer]');
  const title = $('[data-field="report-title"]');
  const r = store.reports.find((x) => x.id === store.reportSelected);
  detail.replaceChildren();
  if (!r) {
    if (title) title.textContent = 'Rapor seçin';
    detail.append(el('p', { class: 'kv-empty', text: 'Bir rapor kartına tıklayın.' }));
    if (drawer) drawer.hidden = true;
    return;
  }
  if (drawer) drawer.hidden = false;
  if (title) title.textContent = `${r.taskId || 'RAPOR'} · ${r.role || ''}`;
  const section = (label, value) => {
    if (!value) return;
    detail.append(el('div', { class: 'kv-report__section' }, [
      el('h3', { text: label }),
      value.includes('\n') ? el('pre', { text: value }) : el('p', { text: value }),
    ]));
  };
  const head = el('div', { class: 'kv-row' }, [
    badge(r.status || 'RAPOR', r.status === 'TAMAM' ? 'success' : r.status === 'BLOKE' ? 'danger' : 'warning'),
  ]);
  detail.append(head);
  section('Özet', r.ozet);
  section('Kanıt', r.kanit);
  section('Değişen dosyalar', r.files);
  section('Risk / not', r.risk);
  if (!r.ozet && !r.kanit) section('Ham metin', r.raw);
}

/* ---------------- AYARLAR ---------------- */

/**
 * Sohbet taslağı (T-177).
 *
 * Kullanıcı yazdığı mesajı ekran değiştirince ya da pencere kapanınca
 * kaybetmemeli. Taslak konuşma başına saklanır (`__none` = henüz konuşma yok),
 * en fazla 20 konuşma ve 8000 karakter tutulur; sır değildir, yalnız yereldir.
 */
const CHAT_DRAFTS_KEY = 'kv.chatDrafts.v1';

function chatDraftKey() {
  return store.chat.id || '__none';
}

function readChatDrafts() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAT_DRAFTS_KEY) || '{}');
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

function saveChatDraft(text) {
  const all = readChatDrafts();
  const key = chatDraftKey();
  const value = String(text || '').slice(0, 8000);
  delete all[key];
  if (value.trim()) all[key] = { text: value, at: Date.now() };
  const keys = Object.keys(all);
  for (const stale of keys.slice(0, Math.max(0, keys.length - 20))) delete all[stale];
  try {
    if (Object.keys(all).length) localStorage.setItem(CHAT_DRAFTS_KEY, JSON.stringify(all));
    else localStorage.removeItem(CHAT_DRAFTS_KEY);
  } catch { /* kota/izin yoksa sessiz geç: taslak kaybı uygulamayı durdurmaz */ }
  const note = $('[data-field="chat-draft-note"]');
  if (note) note.hidden = !value.trim();
  return value;
}

function restoreChatDraft() {
  const ta = $('[data-field="chat-text"]');
  if (!ta) return;
  /* Kullanıcı yazarken alanı ezme. */
  if (document.activeElement === ta) return;
  const all = readChatDrafts();
  const entry = all[chatDraftKey()];
  let text = entry && typeof entry.text === 'string' ? entry.text : '';
  /* Pencere yeniden açıldığında henüz konuşma seçili değil: yazılanı
     kaybetmemek için en yeni taslağı göster. */
  if (!text && !store.chat.id) {
    const newest = Object.values(all)
      .filter((e) => e && typeof e.text === 'string' && e.text.trim())
      .sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    if (newest) text = newest.text;
  }
  if (ta.value !== text) {
    ta.value = text;
    updateChatCounter();
  }
  const note = $('[data-field="chat-draft-note"]');
  if (note) note.hidden = !text.trim();
}

/**
 * Ayarlarda arama (T-176): kartları metnine göre süzer. Ayarlar 7 bölüme
 * dağıldığı için "tema nerede?" sorusunun cevabı kaydırmak değil, yazmak olmalı.
 * Türkçe küçük harfe çevirir (İ/I eşleşsin); eşleşme yoksa yol gösterir.
 */
function foldTr(value) {
  return String(value || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase();
}

function applySettingsFilter(query) {
  const q = foldTr(query).trim();
  const cards = [...document.querySelectorAll('[data-settings-section]')];
  const countEl = $('[data-field="settings-search-count"]');
  const emptyEl = $('[data-field="settings-search-empty"]');
  let shown = 0;
  for (const card of cards) {
    if (!q) { card.hidden = false; shown += 1; continue; }
    const hit = foldTr(card.textContent).includes(q);
    card.hidden = !hit;
    if (hit) shown += 1;
  }
  if (countEl) countEl.textContent = q ? `${shown} bölüm eşleşti` : '';
  if (emptyEl) emptyEl.hidden = !q || shown > 0;
  return shown;
}

function renderSettings() {
  const rows = store.sessions;
  const body = $('[data-roster-body]');
  if (!body) return;
  body.replaceChildren();
  if (!rows.length) {
    body.append(el('tr', {}, [el('td', { colspan: '5', class: 'kv-empty', text: 'Kadro okunamadı.' })]));
    return;
  }
  for (const s of rows) {
    body.append(el('tr', {}, [
      el('td', { text: s.role || '—' }),
      el('td', { class: 'kv-mono', text: s.code || '—' }),
      el('td', { class: 'kv-mono', text: s.model || '—' }),
      el('td', { class: 'kv-mono', text: s.sessionId ? s.sessionId.slice(0, 14) : '—' }),
      el('td', {}, [el('div', { class: 'kv-table__actions' }, [
        el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'card-model', 'data-session': s.sessionId || '', text: 'Model' }),
        el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'set-leader', 'data-session': s.sessionId || '', 'data-role-code': s.code, text: 'Lider yap' }),
      ])]),
    ]));
  }
  /* bildirim anahtarları */
  const nr = $('[data-field="notify-reports"]');
  const ne = $('[data-field="notify-errors"]');
  if (nr) nr.checked = store.prefs.notifyReports;
  if (ne) ne.checked = store.prefs.notifyErrors;

  /* Tur 4: beceriler + izin matrisi + kişiselleştirme seçimleri */
  renderSkills();
  renderPermissions();
  renderVotionGrants();
  applyPrefsTur4();
}

/* ---------------- modal ---------------- */
let modalReturnFocus = null;
let modalInertNodes = null;

/*
 * T-184: modal açıkken arka plan gerçekten erişilemez olmalı.
 *
 * Tab tuzağı yalnız klavyeyi kapsıyordu; ekran okuyucu sanal imleci ve fare
 * arka plandaki düğmelere ulaşabiliyordu. `inert`, alt ağacı odaktan, tıklamadan
 * ve erişilebilirlik ağacından çıkarır. Modal kökü `.kv-app` içinde durduğu için
 * yalnız kardeş katmanlar (başlık, paneller, main…) inert yapılır; modal, bildirim
 * ve çökme katmanları dışarıda kalır.
 */
const MODAL_LAYERS = '[data-modal-root],[data-toast-root],[data-crash-root]';

function setAppInert(on) {
  const app = $('[data-app]');
  if (!app) return;
  if (on) {
    if (modalInertNodes) return;
    modalInertNodes = [...app.children].filter((node) => !node.matches(MODAL_LAYERS));
    for (const node of modalInertNodes) node.setAttribute('inert', '');
  } else {
    for (const node of modalInertNodes || []) node.removeAttribute('inert');
    modalInertNodes = null;
  }
}

function modal({ title, sub, body = [], actions = [] }) {
  const root = $('[data-modal-root]');
  if (!root) return;
  modalReturnFocus = document.activeElement;
  setAppInert(true);
  root.replaceChildren();
  const titleId = 'kv-modal-title';
  const dialog = el('div', { class: 'kv-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
    el('div', { class: 'kv-modal__dialog' }, [
      el('h2', { class: 'kv-modal__title', id: titleId, text: title }),
      sub ? el('p', { class: 'kv-modal__sub', text: sub }) : null,
      ...[].concat(body),
      el('div', { class: 'kv-modal__actions' }, actions),
    ]),
  ]);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeModal(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((node) => !node.disabled && node.getClientRects().length > 0);
    if (!items.length) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstItem) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  });
  root.append(dialog);
  const first = dialog.querySelector('input,select,textarea,button');
  if (first) first.focus();
}

function closeModal() {
  const root = $('[data-modal-root]');
  if (!root || !root.children.length) return;
  root.replaceChildren();
  const back = modalReturnFocus;
  modalReturnFocus = null;
  /* Önce arka planı serbest bırak; sonra odağı açan öğeye geri ver. */
  setAppInert(false);
  if (back && typeof back.focus === 'function' && document.contains(back)) {
    try { back.focus(); } catch { /* ignore */ }
  }
}

/*
 * T-186: yıkıcı eylemler tek bir onay kapısından geçer.
 *
 * Bazı silme/arşivleme yolları tek tıkla çalışıyordu (proje arşivi, anahtar
 * kaldırma, beceri silme, komut geçmişi temizleme) — sır ya da kayıt geri
 * gelmiyordu. Bu yardımcı onay diyaloğu kurar; **odak güvenli seçenektedir**
 * (Vazgeç ilk sırada), böylece Enter'a basan kullanıcı yanlışlıkla silmez.
 * Düğmeler `data-danger-confirm` / `data-danger-cancel` taşır; canlı kapı ölçer.
 */
function confirmDanger({ title, sub, body = [], confirmLabel = 'Sil', run, onCancel }) {
  modal({
    title,
    sub,
    body,
    actions: [
      el('button', {
        class: 'kv-button kv-button--ghost',
        type: 'button',
        text: 'Vazgeç',
        'data-danger-cancel': '',
        onclick: () => {
          closeModal();
          if (typeof onCancel === 'function') onCancel();
        },
      }),
      el('button', {
        class: 'kv-button kv-button--danger',
        type: 'button',
        text: confirmLabel,
        'data-danger-confirm': '',
        onclick: async () => {
          closeModal();
          await run();
        },
      }),
    ],
  });
}

/* ---------------- görev ekleme (onaylı yazma) ---------------- */
function nextTaskId() {
  const ids = store.board.rows
    .map((r) => /^T-(\d+)$/.exec(String(r.id || '')))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const fromBoard = /^T-(\d+)$/.exec(String(store.board.nextID || ''));
  /* Pano okunamadıysa ID UYDURMA: boş bırak, kullanıcı yazsın. */
  if (!ids.length && !fromBoard) return '';
  const max = Math.max(0, ...ids, fromBoard ? Number(fromBoard[1]) : 0);
  return `T-${String(max + 1).padStart(3, '0')}`;
}

function openBoardAdd() {
  const id = el('input', { class: 'kv-input kv-mono', value: nextTaskId(), placeholder: 'T-030', 'data-field': 'task-id' });
  const title = el('input', { class: 'kv-input', placeholder: 'Görev başlığı', 'data-field': 'task-title' });
  const owner = el('select', { class: 'kv-input', 'data-field': 'task-owner' });
  for (const s of store.sessions) owner.append(el('option', { value: s.code, text: `${s.code} — ${s.role}` }));
  if (!store.sessions.length) owner.append(el('option', { value: 'LDR', text: 'LDR' }));
  const status = el('select', { class: 'kv-input', 'data-field': 'task-status' });
  for (const c of BOARD_COLS) status.append(el('option', { value: c.id, text: c.label }));
  status.value = 'planlandi';
  const evidence = el('input', { class: 'kv-input', placeholder: 'Kanıt (dosya yolu) — boş bırakılabilir', 'data-field': 'task-evidence' });
  const result = el('p', { class: 'kv-muted', 'data-field': 'task-result', hidden: true });

  modal({
    title: 'Görev ekle',
    sub: '.team/board.md dosyasına yazılır · yedek alınır · onay istenir.',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'ID' }), id]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Başlık' }), title]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Sahip' }), owner]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Durum' }), status]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Kanıt' }), evidence]),
      result,
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Yaz',
        onclick: async () => {
          const row = {
            id: id.value.trim().toUpperCase(),
            title: title.value.trim(),
            owner: owner.value,
            status: status.value,
            evidence: evidence.value.trim(),
          };
          if (!row.id || !row.title) { toast('ID ve başlık zorunlu.', 'warning'); return; }
          if (store.board.rows.some((r) => String(r.id).toUpperCase() === row.id)) {
            toast(`${row.id} zaten panoda.`, 'warning');
            return;
          }
          /* Onay: ikinci adım, tek kullanımlık anahtar */
          const token = makeConfirmToken();
          modal({
            title: 'Yazmayı onayla',
            sub: 'Pano dosyası değişecek. Yedek work/backup/ altına alınır.',
            body: [
              el('div', { class: 'kv-modal__preview' }, [
                el('div', { text: `${row.id} · ${row.title}` }),
                el('div', { class: 'kv-muted', text: `${row.owner} · ${row.status} · kanıt: ${row.evidence || 'yok'}` }),
              ]),
            ],
            actions: [
              el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
              el('button', {
                class: 'kv-button', type: 'button', text: 'Onayla ve yaz',
                onclick: async () => {
                  const r = await call(KV && KV.board && KV.board.write, { row, confirmToken: token });
                  closeModal();
                  if (r.ok) {
                    notify(`Görev yazıldı: ${row.id}`, r.data && r.data.backup ? `yedek: ${r.data.backup}` : row.title, 'success');
                    pushHistory(`${row.id} ${row.title}`);
                    refreshBoard();
                  } else {
                    const code = (r.error && r.error.code) || '';
                    notify('Görev yazılamadı', (ERROR_CODE_VIEWS[code] || (r.error && r.error.message) || 'bilinmeyen hata'), 'danger');
                  }
                },
              }),
            ],
          });
        },
      }),
    ],
  });
}

/* ---------------- görev detayı ---------------- */
function openTaskDetail(row) {
  if (!row) return;
  const statusRow = el('div', { class: 'kv-row' }, [
    badge(row.status || '—', row.status === 'bitti' ? 'success' : row.status === 'bloke' ? 'warning' : row.status === 'red' ? 'danger' : row.status === 'devam' ? 'busy' : 'idle'),
    el('span', { class: 'kv-muted', text: row.phase || '' }),
  ]);
  const body = [
    statusRow,
    el('div', { class: 'kv-report__section' }, [el('h3', { text: 'Görev' }), el('p', { text: row.title || '—' })]),
    el('div', { class: 'kv-report__section' }, [el('h3', { text: 'Sahip' }), el('p', { text: row.owner || '—' })]),
    el('div', { class: 'kv-report__section' }, [el('h3', { text: 'Kanıt' }), el('p', { text: row.evidence || 'kanıt yok' })]),
  ];
  modal({
    title: `${row.id || 'Görev'}`,
    sub: 'Pano salt-okunur ayna — yazma onay + yedek ister.',
    body,
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Kapat', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Bu görevi sor',
        onclick: () => {
          closeModal();
          const owner = store.sessions.find((s) => (s.code || '') === String(row.owner || '').toUpperCase());
          openCommandFor(owner && owner.sessionId ? owner.sessionId : '');
          const ta = $('[data-field="command-text"]');
          if (ta) {
            ta.value = `${row.id} hakkında durum raporu ver: tamamlanan, kalan, engel, sonraki adım.`;
            updateCounter();
            ta.focus();
          }
        },
      }),
    ],
  });
}

/* ---------------- gömülü görünüm (F7) ---------------- */
let embedSession = null;

async function openEmbed(sessionId, code) {
  const panel = $('[data-embed-panel]');
  const body = $('[data-embed]');
  const title = $('[data-field="embed-title"]');
  const tokens = $('[data-embed-tokens]');
  if (!panel || !body) return;
  embedSession = sessionId || null;
  const s = store.sessions.find((x) => x.sessionId === sessionId) || {};
  if (title) title.textContent = `Akış · ${s.role || code || 'seans'}`;
  if (tokens) tokens.textContent = `${tokenCount(s).toLocaleString('tr-TR')} token`;
  panel.hidden = false;
  body.replaceChildren();

  if (!sessionId) {
    body.append(el('p', { class: 'kv-empty', text: 'Bu rolün canlı seansı yok — kadro kaydı var.' }));
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  const res = await call(KV && KV.command && KV.command.messages, { sessionId, limit: 20 });
  const list = res.ok && res.data ? (Array.isArray(res.data) ? res.data : (res.data.messages || [])) : [];
  if (!list.length) body.append(el('p', { class: 'kv-empty', text: 'Mesaj yok ya da bağlantı kurulamadı.' }));
  for (const m of list) {
    const kind = m.role === 'user' ? 'user' : 'assistant';
    body.append(el('div', { class: 'kv-message', 'data-kind': kind }, [
      el('div', { class: 'kv-thread__head' }, [
        el('span', { text: m.role === 'user' ? 'Sen' : (m.agent || 'ajan') }),
        el('span', { text: m.at ? hhmm(new Date(m.at)) : '' }),
      ]),
      el('div', { text: m.text || '' }),
    ]));
  }
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------------- eylemler ---------------- */
async function refreshTeam() {
  const res = await call(KV && KV.team && KV.team.list);
  if (res.ok && res.data) {
    const data = res.data;
    store.sessions = Array.isArray(data) ? data : (data.sessions || []);
    store.extra = data.unassigned || data.extra || [];
    store.lastSync = new Date();
  } else {
    /* sunucu/parola yok — kartları gerçek roster.md'den üret (uydurma yok) */
    const rr = await call(KV && KV.roster && KV.roster.read);
    const entries = rr.ok && rr.data ? (rr.data.entries || []) : [];
    if (entries.length) {
      store.sessions = entries.map((e) => ({
        code: e.code, role: e.role || e.code, model: e.model || '—',
        sessionId: e.sessionID || null, state: 'offline', tokens: 0, cost: null,
        missing: !e.sessionID,
      }));
      store.extra = [];
      store.lastSync = null;
    } else if (!store.sessions.length) {
      store.sessions = ROLE_SEED.map((r) => ({ ...r, state: 'offline', tokens: 0, missing: true }));
    }
  }
  renderTeam();
  renderCommand();
  renderSettings();
  syncStatus();
}

function syncStatus() {
  const last = $('[data-last-sync]');
  if (last) last.textContent = store.lastSync ? `son eşitleme ${hhmm(store.lastSync)}` : '—';
  const ver = $('[data-field="status-version"]');
  if (ver) {
    /* T-181: canlı sürüm varsa o, yoksa tek sabit (paket sürümü). */
    const live = store.admin && store.admin.info && store.admin.info.appVersion;
    ver.textContent = live ? `v${live}` : APP_VERSION_LABEL;
  }
  const ev = $('[data-field="status-events"]');
  if (ev) ev.textContent = `olay: ${store.eventCount}`;
}

async function pingConnection() {
  setConnection('connecting');
  const res = await call(KV && KV.ping);
  if (!res.ok) {
    const code = (res.error && res.error.code) || '';
    if (code.includes('UNAUTHORIZED') || code.includes('AUTH')) setConnection('unauthorized');
    else if (code.includes('SECRET') || code.includes('PASSWORD')) setConnection('no-password');
    else setConnection('offline');
    return false;
  }
  const info = await call(KV && KV.getInfo);
  if (info.ok) {
    const d = info.data || {};
    const v = (d.server && d.server.version) || d.version;
    setConnection('connected', v ? `Bağlı · v${v}` : 'Bağlı');
    return true;
  }
  /* ping geçti ama kimlik doğrulama geçmedi → parola durumu */
  const code = (info.error && info.error.code) || '';
  if (code.includes('UNAUTHORIZED') || code.includes('AUTH')) setConnection('unauthorized');
  else if (code.includes('SECRET') || code.includes('PASSWORD')) setConnection('no-password');
  else setConnection('offline');
  return false;
}

function openCommandFor(sessionId) {
  store.selectedSessions = new Set(sessionId ? [sessionId] : []);
  go('command');
  const ta = $('[data-field="command-text"]');
  if (ta) ta.focus();
}

/* ---------------- komut geçmişi ---------------- */
const HISTORY_KEY = 'kv.cmdHistory';

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function pushHistory(text) {
  const list = loadHistory().filter((x) => x !== text);
  list.unshift(text);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 25))); } catch { /* kota */ }
}

function openHistory() {
  const list = loadHistory();
  const body = list.length
    ? [el('div', { class: 'kv-history' }, list.map((text) => el('button', {
      class: 'kv-history__item', type: 'button', title: text.slice(0, 200),
      onclick: () => {
        closeModal();
        const ta = $('[data-field="command-text"]');
        if (ta) { ta.value = text; updateCounter(); ta.focus(); }
      },
    }, [
      el('span', { class: 'kv-history__text', text: text.length > 120 ? text.slice(0, 120) + '…' : text }),
      el('span', { class: 'kv-muted kv-mono', text: `${text.length} kr` }),
    ])))]
    : [el('p', { class: 'kv-empty', text: 'Henüz gönderilmiş komut yok.' })];
  modal({
    title: 'Komut geçmişi',
    sub: `Son ${list.length} komut · yalnız bu cihazda saklanır (localStorage)`,
    body,
    actions: [
      el('button', {
        class: 'kv-button kv-button--ghost', type: 'button', text: 'Temizle',
        /* T-186: geçmiş tek tıkla silinmez; onay diyaloğuna devret. */
        onclick: () => confirmDanger({
          title: 'Komut geçmişini temizle',
          sub: `Son ${list.length} komut bu cihazdan silinir. Bu işlem geri alınamaz.`,
          confirmLabel: 'Geçmişi temizle',
          onCancel: () => openHistory(),
          run: () => {
            try { localStorage.removeItem(HISTORY_KEY); } catch { /* yok */ }
            toast('Geçmiş temizlendi', 'info');
          },
        }),
      }),
      el('button', { class: 'kv-button', type: 'button', text: 'Kapat', onclick: closeModal }),
    ],
  });
}

/* ---------------- kısayol yardımı ---------------- */
function openShortcuts() {
  /* T-179: ekran satırları tek kaynaktan (SCREEN_SHORTCUTS) üretilir; elle
     yazılan liste gerçek kısayollardan kopabiliyordu. */
  const screenRows = Object.entries(SCREEN_SHORTCUTS).map(([num, screen]) => [
    `Ctrl+${num}`,
    `${SCREEN_META[screen].title} ekranı`,
  ]);
  const rows = [
    ['Ctrl+K', 'Komut paletini aç'],
    ...screenRows,
    ['Ctrl+T', 'Gezginde yeni sekme'],
    ['Ctrl+W', 'Aktif sekmeyi kapat'],
    ['Ctrl+Tab', 'Sonraki sekme (Shift ile önceki)'],
    ['Ctrl+L', 'Adres çubuğuna git (kv://…)'],
    ['Alt+← / Alt+→', 'Sekmede geri / ileri'],
    ['Ctrl+R', 'Veriyi yenile (ekip + pano + modeller + raporlar)'],
    ['Ctrl+Enter', 'Komutu onayla ve gönder'],
    ['Ctrl+H', 'Komut geçmişi'],
    ['?', 'Bu kısayol sayfası'],
    ['Esc', 'Palet / modal kapat'],
  ];
  modal({
    title: 'Klavye kısayolları',
    sub: 'Metin alanında yazarken yalnız Ctrl+Enter ve Esc çalışır.',
    body: [el('div', { class: 'kv-kbd-list', 'data-field': 'shortcut-list' }, rows.map(([k, v]) => el('div', { class: 'kv-kbd-row' }, [
      el('kbd', { class: 'kv-kbd', text: k }),
      el('span', { text: v }),
    ])))],
    actions: [el('button', { class: 'kv-button', type: 'button', text: 'Kapat', onclick: closeModal })],
  });
}

function confirmSend() {
  const ta = $('[data-field="command-text"]');
  const text = ta ? ta.value.trim() : '';
  if (!text) { toast('Komut boş.', 'warning'); return; }
  if (!store.selectedSessions.size) { toast('Hedef seans seçin.', 'warning'); return; }
  const targets = [...store.selectedSessions];
  const models = store.sessions.filter((s) => targets.includes(s.sessionId || s.code)).map((s) => s.model).filter(Boolean);
  modal({
    title: 'Komutu onayla',
    sub: `${targets.length} seansa gönderilecek · ${text.length} karakter`,
    body: [
      el('div', { class: 'kv-modal__preview', text }),
      el('p', { class: 'kv-modal__sub', text: `Hedef model(ler): ${models.join(', ') || '—'}` }),
      el('p', { class: 'kv-modal__sub', text: 'Metin audit kaydına yazılmaz; yalnız hedef, uzunluk ve sonuç.' }),
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Gönder', onclick: () => sendCommand(text, targets) }),
    ],
  });
}

async function sendCommand(text, targets) {
  closeModal();
  store.busy = true;
  let okCount = 0;
  for (const t of targets) {
    /* onay anahtarı: onay modalı geçildikten sonra üretilir, tek kullanımlık (API-15/API-41) */
    const res = await call(KV && KV.command && KV.command.send, { sessionId: t, text, confirmToken: makeConfirmToken() });
    if (res.ok) okCount += 1;
  }
  store.busy = false;
  if (okCount) {
    notify(`Komut gönderildi (${okCount}/${targets.length})`, 'hedef: ' + targets.join(', '), 'success');
    pushHistory(text);
    const ta = $('[data-field="command-text"]');
    if (ta) ta.value = '';
    updateCounter();
    /* Tur 6: emir ve hedefler hafızaya çıkarım olarak yazılır (tekrar okuma yok). */
    autoCapture(`Komut verildi (${targets.length} hedef): ${text}`, 'komut-merkezi', 'LDR');
  } else {
    notify('Komut gönderilemedi', 'bağlantı yok ya da köprü hazır değil', 'warning');
  }
}

async function interrupt() {
  const targets = [...store.selectedSessions];
  if (!targets.length) { toast('Hedef seçin.', 'warning'); return; }
  for (const t of targets) await call(KV && KV.command && KV.command.interrupt, { sessionId: t, confirmToken: makeConfirmToken() });
  notify('Durdurma istendi', `${targets.length} seans`, 'info');
}

async function openModelDialog(sessionId) {
  const res = await call(KV && KV.models && KV.models.catalog);
  const live = (res.ok && res.data && (res.data.live || res.data)) || [];
  if (Array.isArray(live) && live.length) store.models.live = live;
  const list = store.models.live.length ? store.models.live : store.models.pool;
  const target = store.sessions.find((s) => s.sessionId === sessionId) || {};
  if (!list.length) { toast('Model listesi boş.', 'warning'); return; }

  const body = el('div', { class: 'kv-col' });
  const select = el('select', { class: 'kv-input' });
  const seen = new Set();
  for (const m of list) {
    const id = m.id || m;
    if (seen.has(id)) continue;
    seen.add(id);
    select.append(el('option', { value: id, text: id }));
  }
  if (target.model) select.value = target.model;
  body.append(select, el('p', { class: 'kv-modal__sub', text: `Hedef: ${target.role || '—'} (${target.code || ''}) · değişiklik audit kaydına yazılır.` }));

  modal({
    title: 'Model ata',
    sub: 'Havuz dışı model seçmek kural dışıdır (models.md v3).',
    body: [body],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Ata',
        onclick: async () => {
          const model = select.value;
          closeModal();
          if (!sessionId) { toast('Seans yok — model atanamadı.', 'warning'); return; }
          const r = await call(KV && KV.models && KV.models.assign, { sessionId, model, confirmToken: makeConfirmToken() });
          if (r.ok) {
            const s = store.sessions.find((x) => x.sessionId === sessionId);
            if (s) s.model = model;
            renderTeam(); renderSettings();
            notify(`Model değişti → ${model}`, target.role || sessionId, 'success');
          } else notify('Model değiştirilemedi', (r.error && r.error.message) || '', 'danger');
        },
      }),
    ],
  });
}

function openTeamAdd() {
  const role = el('input', { class: 'kv-input', placeholder: 'Rol adı (ör. Güvenlik)' });
  /* UI-119: kod alanı sözleşme kancası + hata alanı */
  const code = el('input', { class: 'kv-input kv-mono', 'data-field': 'agent-code', placeholder: 'Kod (ör. SEC)', 'aria-invalid': 'false', autocomplete: 'off' });
  const codeError = el('p', { class: 'kv-muted', 'data-field': 'agent-code-error', hidden: true });
  const model = el('select', { class: 'kv-input' });
  const pool = store.models.pool.length ? store.models.pool : ROLE_SEED.map((r) => ({ id: r.model, name: r.role }));
  const seen = new Set();
  for (const m of pool) {
    const id = m.id || m;
    if (seen.has(id)) continue;
    seen.add(id);
    model.append(el('option', { value: id, text: id }));
  }
  /* Sabit yol yok: son bilinen proje dizini ya da aktif proje. */
  const dir = el('input', {
    class: 'kv-input kv-mono',
    value: store.projectDir || store.projects.activeDir || '',
    placeholder: 'Proje klasörü (boşsa varsayılan)'
  });

  /* API-95: ^[A-Z]{2,5}[0-9]?$ · API-94: aynı kod reddi (IPC çağrısı yapılmaz) */
  const CODE_RE = /^[A-Z]{2,5}[0-9]?$/;
  const validateCode = () => {
    const v = code.value.trim().toUpperCase();
    let msg = '';
    if (!v) msg = 'Kod zorunlu.';
    else if (!CODE_RE.test(v)) msg = 'Kod 2–5 büyük harf, isteğe bağlı tek rakam (ör. DEV2).';
    else if (store.sessions.some((s) => (s.code || '').toUpperCase() === v)) {
      msg = `${v} zaten kadroda. İkinci ajan için yeni kod (ör. ${v}2) — ARC onayı gerekir.`;
    }
    code.setAttribute('aria-invalid', msg ? 'true' : 'false');
    codeError.hidden = !msg;
    codeError.textContent = msg;
    return !msg;
  };
  code.addEventListener('input', validateCode);

  modal({
    title: 'Ajan ekle',
    sub: 'Yeni bir OpenCode seansı açılır ve kadroya eklenir. Bir rol kodundan tek aktif seans olur.',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'Rol' }), role]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Kod' }), code, codeError]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Model' }), model]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Dizin' }), dir]),
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Oluştur',
        onclick: async () => {
          if (!role.value.trim()) { toast('Rol adı zorunlu.', 'warning'); return; }
          if (!validateCode()) { code.focus(); return; }
          const payload = {
            role: role.value.trim(),
            code: code.value.trim().toUpperCase(),
            model: model.value,
            directory: dir.value.trim(),
          };
          closeModal();
          const r = await call(KV && KV.team && KV.team.add, { ...payload, confirmToken: makeConfirmToken() });
          if (r.ok) { notify(`Ajan eklendi: ${payload.code}`, payload.role, 'success'); refreshTeam(); }
          else if (r.error && r.error.code === 'E_DUPLICATE_ROLE') {
            notify('Rol kodu zaten var', `${payload.code} · yeni kod seçin`, 'warning');
          } else notify('Ajan eklenemedi', (r.error && r.error.message) || 'bağlantı gerekli', 'danger');
        },
      }),
    ],
  });
}

function openTeamAuto() {
  const desc = el('textarea', {
    class: 'kv-input kv-input--area', rows: '5',
    placeholder: 'Projeyi anlatın: ne yapılacak, hangi platform, hangi işler var…',
    'aria-label': 'Proje tanımı'
  });
  const size = el('select', { class: 'kv-input', 'aria-label': 'Ekip büyüklüğü' });
  for (const n of [3, 4, 5, 6, 7, 8, 9]) {
    size.append(el('option', { value: String(n), text: `${n} kişi`, selected: n === 6 }));
  }
  const status = el('p', { class: 'kv-muted', 'data-field': 'team-plan-status', text: '' });
  const preview = el('div', { class: 'kv-panel', 'data-field': 'team-plan-preview', hidden: true });

  let planned = null;
  const applyBtn = el('button', {
    class: 'kv-button', type: 'button', text: 'Ekibi kur', disabled: true,
    onclick: async () => {
      if (!planned) return;
      applyBtn.disabled = true;
      const r = await call(KV && KV.team && KV.team.apply, {
        members: planned.members,
        confirmToken: makeConfirmToken()
      });
      if (r.ok) {
        notify('Ekip kuruldu', `${(r.data.applied || []).length} üye kadroya eklendi`, 'success');
        closeModal();
        refreshTeam();
      } else {
        applyBtn.disabled = false;
        notify('Ekip kurulamadı', (r.error && r.error.message) || 'kadro yazılamadı', 'danger');
      }
    }
  });

  const planBtn = el('button', {
    class: 'kv-button kv-button--ghost', type: 'button', text: 'Planla',
    onclick: async () => {
      const description = desc.value.trim();
      if (description.length < 20) {
        toast('Projeyi en az birkaç cümleyle anlatın.', 'warning');
        desc.focus();
        return;
      }
      planBtn.disabled = true;
      status.textContent = 'Plan hazırlanıyor…';
      const r = await call(KV && KV.team && KV.team.plan, {
        description,
        size: Number(size.value)
      });
      planBtn.disabled = false;
      if (!r.ok) {
        status.textContent = (r.error && r.error.message) || 'Plan oluşturulamadı.';
        return;
      }
      planned = r.data;
      preview.hidden = false;
      preview.replaceChildren(el('div', { class: 'kv-panel__header' }, [
        el('span', { text: 'Önerilen kadro' }),
        el('span', { class: 'kv-badge', 'data-tone': 'info', text: planned.source === 'model' ? 'model' : 'yedek plan' })
      ]));
      const body = el('div', { class: 'kv-panel__body' });
      if (planned.summary) body.append(el('p', { text: planned.summary }));
      const list = el('div', { class: 'kv-grid' });
      for (const m of planned.members || []) {
        list.append(el('div', { class: 'kv-panel' }, [
          el('div', { class: 'kv-row' }, [
            el('strong', { class: 'kv-mono', text: m.code }),
            el('span', { text: m.role }),
            el('span', { class: 'kv-muted kv-mono', text: m.model || 'model seçilmedi' })
          ]),
          el('p', { class: 'kv-muted', text: m.responsibility || '' })
        ]));
      }
      body.append(list);
      if (Array.isArray(planned.notes) && planned.notes.length) {
        body.append(el('p', { class: 'kv-muted', text: planned.notes.join(' ') }));
      }
      preview.append(body);
      status.textContent = 'Önizleme hazır. Uygunsa “Ekibi kur”.';
      applyBtn.disabled = false;
    }
  });

  modal({
    title: 'Otomatik ekip kur',
    sub: 'Projeyi anlatın; lider adayı kadroyu ve çalışma alanlarına göre modelleri önerir. Uygulamadan önce önizlersiniz.',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'Proje tanımı' }), desc]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Ekip büyüklüğü' }), size]),
      status,
      preview
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      planBtn,
      applyBtn
    ]
  });
}

function openRemove(sessionId, code) {
  modal({
    title: 'Ajanı kadrodan çıkar',
    sub: 'Seans silinmez, arşivlenir; roster güncellemesi öneri olarak hazırlanır.',
    body: [el('p', { class: 'kv-modal__sub', text: `${code || ''} · ${sessionId || 'seans yok'}` })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button kv-button--danger', type: 'button', text: 'Arşivle',
        onclick: async () => {
          closeModal();
          const r = await call(KV && KV.team && KV.team.remove, { sessionId, code, confirmToken: makeConfirmToken() });
          if (r.ok) { notify('Ajan arşivlendi', code || '', 'warning'); refreshTeam(); }
          else notify('Çıkarılamadı', (r.error && r.error.message) || '', 'danger');
        },
      }),
    ],
  });
}

function openSetLeader(sessionId, code) {
  const options = store.sessions.filter((s) => s.sessionId);
  if (!options.length) { toast('Seans listesi boş.', 'warning'); return; }
  const select = el('select', { class: 'kv-input' });
  for (const s of options) select.append(el('option', { value: s.sessionId, text: `${s.role} (${s.code})` }));
  if (sessionId) select.value = sessionId;

  modal({
    title: 'Lider değiştir',
    sub: 'roster.md yedeği alınır ve LDR satırı güncellenir.',
    body: [el('div', { class: 'kv-field' }, [el('label', { text: 'Yeni lider' }), select])],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Lider yap',
        onclick: async () => {
          const id = select.value;
          closeModal();
          const r = await call(KV && KV.team && KV.team.setLeader, { sessionId: id, code, confirmToken: makeConfirmToken() });
          if (r.ok) { notify('Lider değişti', id, 'success'); refreshTeam(); }
          else notify('Lider değiştirilemedi', (r.error && r.error.message) || '', 'danger');
        },
      }),
    ],
  });
}

async function refreshBoard() {
  const res = await call(KV && KV.board && KV.board.read);
  if (res.ok && res.data) {
    const d = res.data;
    store.board.rows = Array.isArray(d) ? d : (d.rows || []);
    store.board.nextID = (d && d.nextID) || null;
  }
  /* Uydurma satır YOK: okunamıyorsa pano boş kalır, nedeni yazılır. */
  renderBoard();
}

async function refreshModels() {
  const res = await call(KV && KV.models && KV.models.catalog);
  if (res.ok && res.data) {
    const d = res.data;
    store.models.pool = d.pool || store.models.pool;
    store.models.live = d.live || store.models.live;
    store.models.guide = d.guide || store.models.guide;
  }
  if (!store.models.pool.length) {
    store.models.pool = ROLE_SEED.map((r) => ({ id: r.model, name: r.role, character: `${r.note} · ${r.code}`, usedBy: r.code }));
  }
  if (!store.models.guide.length) {
    store.models.guide = ROLE_SEED.map((r) => ({ id: r.model, name: r.note, role: `${r.role} (${r.code})` }));
  }
  renderModels();
}

async function refreshReports() {
  const res = await call(KV && KV.reports && KV.reports.list);
  if (res.ok && res.data) {
    const d = res.data;
    store.reports = (Array.isArray(d) ? d : (d.reports || [])).map((r, i) => ({
      id: r.id || `R${i}`, taskId: r.taskId, role: r.role, status: r.status,
      ozet: r.ozet, kanit: r.kanit, files: r.files, risk: r.risk, raw: r.raw,
      at: r.at || r.updatedAt || null, source: r.source || (r.file ? 'file' : 'session'),
    }));
    store.leaderCycles = d.leaderCycles || [];
    store.reportsDir = d.reportDir || store.reportsDir || '';
  }
  renderReports();
}

async function loadSettings() {
  const res = await call(KV && KV.settings && KV.settings.get);
  if (res.ok && res.data) {
    const d = res.data;
    const url = $('[data-field="server-url"]');
    const dir = $('[data-field="project-dir"]');
    if (url && d.serverURL) url.value = d.serverURL;
    if (dir && d.projectDir) dir.value = d.projectDir;
    if (d.theme) store.prefs.theme = d.theme;
    if (d.density) store.prefs.density = d.density;
    if (typeof d.onboarded === 'boolean') store.onboarded = d.onboarded;
    if (typeof d.projectDir === 'string') store.projectDir = d.projectDir;
    if (typeof d.localAccess === 'boolean') store.localAccess.on = d.localAccess;
    if (typeof d.localAccessAsked === 'boolean') store.localAccess.asked = d.localAccessAsked;
    renderLocalAccess();
    applyPrefs();
  }
  const st = await call(KV && KV.secret && KV.secret.state);
  const stateEl = $('[data-secret-state]');
  if (st.ok && st.data) {
    const s = st.data.secretState || (st.data.saved ? 'stored' : 'missing');
    if (stateEl) {
      stateEl.dataset.secretState = s;
      stateEl.textContent = s === 'stored' ? 'Parola kayıtlı (DPAPI).' : s === 'corrupt' ? 'Parola kaydı bozuk — yeniden girin.' : 'Parola kayıtlı değil.';
    }
  }
}

async function saveSettings() {
  const serverURL = ($('[data-field="server-url"]') || {}).value || '';
  const projectDir = ($('[data-field="project-dir"]') || {}).value || '';
  const secret = ($('[data-field="password"]') || {}).value || '';
  const out = $('[data-field="settings-result"]');

  if (secret) {
    const r = await call(KV && KV.secret && KV.secret.set, { password: secret, confirmToken: makeConfirmToken() });
    if (r.ok) {
      const inp = $('[data-field="password"]');
      if (inp) inp.value = '';
      if (out) out.textContent = 'Parola DPAPI ile kaydedildi.';
      notify('Parola kaydedildi', 'DPAPI · secrets.bin', 'success');
    } else if (out) out.textContent = 'Parola kaydedilemedi: ' + ((r.error && r.error.message) || '');
  }

  const r2 = await call(KV && KV.settings && KV.settings.set, { serverURL, projectDir, theme: store.prefs.theme, density: store.prefs.density });
  if (r2.ok) {
    if (out) out.textContent = (out.textContent ? out.textContent + ' ' : '') + 'Ayarlar kaydedildi.';
    toast('Ayarlar kaydedildi', 'success');
  } else if (out) {
    out.textContent = (out.textContent ? out.textContent + ' ' : '') + 'Ayarlar kaydedilemedi (köprü hazır değil).';
  }
  await pingConnection();
  await refreshTeam();
}

/* ---------------- yerel erişim izni (T-167) ---------------- */
/*
 * Kullanıcı onayı olmadan makinenin hiçbir yeri gezilmez. İzin vermek tek
 * tıkla mümkün; "izin sor" düğmesi sözleşmeyi açıkça söyler ve hiçbir şeyi
 * kendiliğinden açmaz. Kapatmak da tek tıkla — geri alınabilir olması şart.
 */
function renderLocalAccess() {
  const on = Boolean(store.localAccess.on);
  const asked = Boolean(store.localAccess.asked);
  const box = $('[data-field="local-access"]');
  if (box) box.checked = on;
  const state = $('[data-field="local-state"]');
  if (state) {
    state.textContent = on
      ? 'İzin açık — Dosyalar ekranı bu bilgisayarı gezdirir (sır dosyaları hariç).'
      : asked
        ? 'İzin verilmedi — yalnız proje klasörü görünür. İstediğin an açabilirsin.'
        : 'İzin istenmedi — Dosyalar ekranı yalnız proje klasörünü gösterir.';
  }
  const at = $('[data-field="local-at"]');
  if (at) at.textContent = on ? 'izin: açık' : asked ? 'izin: kapalı (soruldu)' : 'izin: sorulmadı';
  document.documentElement.dataset.localAccess = on ? 'on' : 'off';
}

async function setLocalAccess(value, { markAsked = true } = {}) {
  const patch = { localAccess: Boolean(value) };
  if (markAsked) patch.localAccessAsked = true;
  const res = await call(KV && KV.settings && KV.settings.set, patch);
  if (!res.ok) {
    toast('İzin kaydedilemedi', (res.error && res.error.message) || 'hata', 'danger');
    return false;
  }
  store.localAccess.on = Boolean(value);
  if (markAsked) store.localAccess.asked = true;
  renderLocalAccess();
  if (typeof tur8FilesLocalAccessChanged === 'function') tur8FilesLocalAccessChanged();  toast(value ? 'Yerel erişim açıldı' : 'Yerel erişim kapatıldı', value ? 'success' : 'info');
  return true;
}

/** "İzin sor" — kapsamı ve sınırları açıkça yazar, sonra izin verir. */
function openLocalAccessAsk() {
  modal({
    title: 'Bu bilgisayara erişim izni',
    sub: 'Uygulama yerel çalışır; hiçbir şey yüklenmez. İzin verirsen Dosyalar ekranı bilgisayarının tamamını gezebilir.',
    body: [
      el('ul', { class: 'kv-list' }, [
        el('li', { text: 'Okunabilir: belgeler, kod, resim ve klasör listeleri (sürücüler dahil).' }),
        el('li', { text: 'Hiç okunmaz: .env dosyaları, secrets.bin, keys.bin, *.pem, *.key, *.pfx, *.p12, *.kdbx.' }),
        el('li', { text: 'Yazma yok: DOSYALAR ekranı salt okunur; hiçbir dosya değiştirilmez.' }),
        el('li', { text: 'Geri alınabilir: izni Ayarlar → Bu bilgisayar bölümünden istediğin an kapatırsın.' })
      ])
    ],
    actions: [
      el('button', { class: 'kv-button', type: 'button', text: 'İzin ver', 'data-action': 'local-grant' }),
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Şimdi değil', onclick: () => { setLocalAccess(false); closeModal(); } })
    ]
  });
}

/* ---------------- düşünme göstergesi (T-168) ---------------- */
/*
 * Model yanıtı beklerken "düşünüyor" üç noktası tek başına yetersiz: kullanıcı
 * uygulamanın donduğunu sanıyordu. Burada geçen süre canlı sayılır ve dönen
 * bir glif gösterilir; böylece "çalışıyor" olduğu ölçülebilir biçimde görünür.
 */
let thinkClock = null;

/** Süre sayacını çalıştırır; iş bitince kendiliğinden durur. */
function thinkClockEnsure() {
  if (thinkClock) return;
  const tick = () => {
    const nodes = document.querySelectorAll('[data-think-clock]');
    if (!nodes.length) { clearInterval(thinkClock); thinkClock = null; return; }
    const now = Date.now();
    for (const node of nodes) {
      const start = Number(node.getAttribute('data-think-start')) || now;
      const secs = Math.max(0, Math.floor((now - start) / 1000));
      node.textContent = secs < 60 ? `${secs} sn` : `${Math.floor(secs / 60)} dk ${secs % 60} sn`;
    }
  };
  tick();
  thinkClock = setInterval(tick, 500);
}

/** Düşünme satırı: dönen glif + etiket + canlı süre. */
function thinkRow(label) {
  thinkClockEnsure();
  return el('div', { class: 'kv-think', 'aria-live': 'polite' }, [
    el('span', { class: 'kv-think__glyph', 'aria-hidden': 'true', text: '◐' }),
    el('span', { class: 'kv-think__label', text: label || 'düşünüyor' }),
    el('span', { class: 'kv-think__time kv-mono', 'data-think-clock': '', 'data-think-start': String(store.chat.startedAt || Date.now()) })
  ]);
}

/* ---------------- çökme kalkanı (T-170) ---------------- */
/*
 * Bir arayüz hatası kullanıcıyı beyaz/kilitli ekranda bırakmamalı. Yakalanmayan
 * hata olursa üstte kurtarma kartı çıkar: son hata metni, "Ekranı yenile",
 * "Kapat" ve "Ayrıntıyı kopyala". Veri diskte olduğu için yenileme güvenli.
 */
let crashShown = false;

function showCrashCard(detail) {
  const host = $('[data-crash-root]');
  if (!host || crashShown) return;
  crashShown = true;
  const text = String(detail == null ? 'bilinmeyen hata' : detail).slice(0, 600);
  host.hidden = false;
  host.replaceChildren(el('div', { class: 'kv-crash', role: 'alertdialog', 'aria-labelledby': 'kv-crash-title' }, [
    el('h2', { class: 'kv-crash__title', id: 'kv-crash-title', text: 'Beklenmeyen bir hata oluştu' }),
    el('p', { class: 'kv-muted', text: 'Son işlem tamamlanamadı. Kayıtlarınız diskte duruyor; ekranı yenilemek güvenli. Sorun sürerse ayrıntıyı kopyalayıp paylaşın.' }),
    el('pre', { class: 'kv-code kv-crash__detail', text }),
    el('div', { class: 'kv-crash__actions' }, [
      el('button', { class: 'kv-button', type: 'button', text: 'Ekranı yenile', onclick: () => location.reload() }),
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Ayrıntıyı kopyala', onclick: () => copyText(text) }),
      el('button', {
        class: 'kv-button kv-button--ghost', type: 'button', text: 'Kapat',
        onclick: () => { host.hidden = true; host.replaceChildren(); crashShown = false; }
      })
    ])
  ]));
}

function installCrashGuard() {
  window.addEventListener('error', (e) => {
    /* Kaynak yükleme hatası (resim vb.) değil, çalışan betik hatası. */
    if (!e || !e.error) return;
    showCrashCard((e.error && (e.error.stack || e.error.message)) || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e && e.reason;
    showCrashCard((reason && (reason.stack || reason.message)) || reason || 'işlenmeyen söz reddi');
  });
}

/* ---------------- komut paleti ---------------- */
const PALETTE_ITEMS = [
  { group: 'Ekran', label: 'Sohbet', key: shortcutLabel('chat'), screen: 'chat', run: () => go('chat') },
  { group: 'Ekran', label: 'Ekip', key: shortcutLabel('team'), screen: 'team', run: () => go('team') },
  { group: 'Ekran', label: 'Komut Merkezi', key: shortcutLabel('command'), screen: 'command', run: () => go('command') },
  { group: 'Ekran', label: 'Görev Panosu', key: shortcutLabel('board'), screen: 'board', run: () => go('board') },
  { group: 'Ekran', label: 'Ajan Hafızası', key: shortcutLabel('memory'), screen: 'memory', run: () => go('memory') },
  { group: 'Ekran', label: 'Projeler', key: shortcutLabel('projects'), screen: 'projects', run: () => go('projects') },
  { group: 'Ekran', label: 'Model Merkezi', key: shortcutLabel('models'), screen: 'models', run: () => go('models') },
  { group: 'Ekran', label: 'Sağlayıcılar', key: shortcutLabel('providers'), screen: 'providers', run: () => go('providers') },
  { group: 'Ekran', label: 'Tarayıcı', key: shortcutLabel('browser'), screen: 'browser', run: () => go('browser') },
  { group: 'Ekran', label: 'Uzaktan Erişim', key: '', screen: 'remote', run: () => go('remote') },
  { group: 'Ekran', label: 'Rapor Merkezi', key: '', screen: 'reports', run: () => go('reports') },
  { group: 'Ekran', label: 'Ayarlar', key: '', screen: 'settings', run: () => go('settings') },
  { group: 'Ekran', label: 'Yönetim Merkezi', key: '', screen: 'admin', run: () => go('admin') },
  { group: 'Eylem', label: 'Ajan ekle', key: '', screen: 'team', run: openTeamAdd },
  { group: 'Eylem', label: 'Lider değiştir', key: '', screen: 'team', run: () => openSetLeader() },
  { group: 'Eylem', label: 'Hatırlanacak ekle (hafıza)', key: '', screen: 'memory', run: () => { go('memory'); openMemoryAdd(); } },
  { group: 'Eylem', label: 'Yeni proje', key: '', screen: 'projects', run: () => { go('projects'); openProjectNew(); } },
  { group: 'Eylem', label: 'Beceri ekle', key: '', screen: 'settings', run: () => { go('settings'); openSkillEdit(null); } },
  { group: 'Eylem', label: 'Telefondan bağlan', key: '', screen: 'remote', run: () => { go('remote'); remoteStart(); } },
  { group: 'Eylem', label: 'Yeni sohbet', key: '', screen: 'chat', run: () => { go('chat'); newChat(); } },
  { group: 'Eylem', label: 'Yenile (ekip + pano)', key: 'Ctrl R', screen: 'team', run: () => { refreshTeam(); refreshBoard(); } },
  { group: 'Eylem', label: 'Tema değiştir', key: '', run: toggleTheme },
  { group: 'Eylem', label: 'Yoğunluk değiştir', key: '', run: toggleDensity },
  { group: 'Eylem', label: 'Bağlantıyı test et', key: '', run: pingConnection },
  { group: 'Eylem', label: 'Seanslara komut gönder', key: '', screen: 'command', run: () => openCommandFor() },
  { group: 'Eylem', label: 'Komut geçmişi', key: 'Ctrl H', screen: 'command', run: () => { go('command'); openHistory(); } },
  { group: 'Yardım', label: 'Klavye kısayolları', key: '?', run: openShortcuts },
];

function paletteAll() {
  const base = PALETTE_ITEMS;
  const extra = store.sessions
    .filter((s) => s.sessionId)
    .map((s) => ({
      group: 'Seans',
      label: `${s.role} (${s.code}) → komut`,
      key: '',
      run: () => openCommandFor(s.sessionId),
    }));
  const nav = [
    { group: 'Gezgin', label: 'Yeni sekme', key: 'Ctrl T', run: () => navNewTab() },
    { group: 'Gezgin', label: 'Sekmeyi kapat', key: 'Ctrl W', run: () => { const t = navActiveTab(); if (t) navCloseTab(t.id); } },
    { group: 'Gezgin', label: 'Adres çubuğuna git', key: 'Ctrl L', run: () => { const i = $('[data-field="nav-address"]'); if (i) { i.focus(); i.select(); } } },
    { group: 'Gezgin', label: 'Geri', key: 'Alt ←', run: () => navBack() },
    { group: 'Gezgin', label: 'İleri', key: 'Alt →', run: () => navForward() },
  ];
  const openTabs = navigator.tabs.map((t, i) => {
    const e = t.stack[t.at] || {};
    return {
      group: 'Açık sekme',
      label: `${i + 1}. ${e.title || 'sekme'} · ${navAddrOf(e)}`,
      key: '',
      run: () => navSelectTab(t.id),
    };
  });
  return extra.concat(openTabs, nav, base);
}

let paletteIndex = 0;
let paletteItems = PALETTE_ITEMS;

function openPalette() {
  const p = $('[data-palette]');
  const input = $('[data-field="palette-input"]');
  if (!p || !input) return;
  p.hidden = false;
  input.value = '';
  paletteIndex = 0;
  renderPalette('');
  input.focus();
}

function closePalette() {
  const p = $('[data-palette]');
  if (p) p.hidden = true;
}

function renderPalette(query) {
  const list = $('[data-palette-list]');
  if (!list) return;
  const q = query.trim().toLowerCase();
  paletteItems = paletteAll().filter((i) => matchesFold(i.label, q) || matchesFold(i.group, q));
  if (paletteIndex >= paletteItems.length) paletteIndex = Math.max(0, paletteItems.length - 1);
  list.replaceChildren();
  let lastGroup = '';
  paletteItems.forEach((item, i) => {
    if (item.group !== lastGroup) {
      list.append(el('div', { class: 'kv-palette__group', text: item.group }));
      lastGroup = item.group;
    }
    const btn = el('button', { class: 'kv-palette__item', type: 'button', 'data-active': String(i === paletteIndex) }, [
      el('span', { text: item.label }),
      item.key ? el('kbd', { text: item.key }) : null,
    ]);
    btn.addEventListener('click', () => { closePalette(); item.run(); });
    list.append(btn);
  });
  if (!paletteItems.length) list.append(el('p', { class: 'kv-empty', text: 'Eşleşme yok.' }));
}

/* ---------------- tema / yoğunluk ---------------- */
function toggleTheme() {
  const list = ['dark', 'light', 'midnight', 'forest', 'sunset', 'mono'];
  const i = list.indexOf(store.prefs.theme);
  store.prefs.theme = list[(i + 1) % list.length];
  savePrefs();
  toast(`Tema: ${store.prefs.theme}`, 'info');
}

function toggleDensity() {
  store.prefs.density = store.prefs.density === 'comfortable' ? 'compact' : 'comfortable';
  savePrefs();
}

/* T-199/T-201: tasarım dili değiştirici — anında geçiş, kalıcı tercih. */
const DESIGN_LABELS = {
  classic: 'Klasik',
  volt: 'Volt (alternatif)',
  prototip: 'Prototip (alternatif)'
};

function setDesign(name) {
  store.prefs.design = DESIGNS.includes(name) ? name : 'classic';
  savePrefs();
  toast(`Tasarım: ${DESIGN_LABELS[store.prefs.design] || DESIGN_LABELS.classic}`, 'info');
}

function toggleDesign() {
  const at = DESIGNS.indexOf(store.prefs.design);
  setDesign(DESIGNS[(at + 1) % DESIGNS.length]);
}

/* ---------------- olay akışı ---------------- */
/**
 * Köprüden gelen push'lar (preload §onEvent):
 *   {kind:'patch'|'connection', type, domain, seq, at, data:{sessionID}, ...}
 * `tk:` olayları API-74 alt kümesidir; `team.sync` / `board.changed` / `connection.state`
 * konsolun kendi sentetik bildirimleridir. Hiçbiri ham sunucu gövdesi taşımaz.
 */
function bindEvents() {
  if (!KV || typeof KV.onEvent !== 'function') return;
  try {
    KV.onEvent((evt) => {
      if (!evt || typeof evt !== 'object') return;
      store.eventCount += 1;
      store.lastEventAt = Date.now();
      syncStatus();

      const kind = evt.kind || 'patch';
      const name = evt.type || '';

      /* 1) Bağlantı durumu: yerel göstergeyi gerçek duruma çek. */
      if (kind === 'connection' || name === 'connection.state') {
        const state = evt.state || (evt.data && evt.data.state) || '';
        if (state) setConnection(mapConnectionState(state), 'sunucu olayı');
        return;
      }

      /* 2) Yerel sunucu durumu (T-206). Main, sunucuyu arka planda başlatır;
         sonuç buraya gelmezse gösterge açılıştaki "çevrimdışı" değerinde
         donuyordu. Artık her gerçek durum değişimi göstergesi günceller. */
      if (name === 'server.changed') {
        const s = evt.payload || null;
        if (s && s.connected) {
          setConnection('connected', s.version ? `Bağlı · v${s.version}` : 'Bağlı');
          refreshTeam();
          if (store.screen === 'board') refreshBoard();
        } else if (s) {
          const code = String(s.error || '');
          if (code.includes('UNAUTHORIZED')) setConnection('unauthorized');
          else if (code.includes('SECRET')) setConnection('no-password');
          else setConnection('offline');
        }
        return;
      }

      /* 3) Kadro yeniden senkronu (main'in resync'i). */
      if (name === 'team.sync') {
        if (evt.payload && Array.isArray(evt.payload.sessions)) {
          store.sessions = evt.payload.sessions;
          store.unassigned = evt.payload.unassigned || [];
          renderTeam();
          renderStats();
        } else {
          refreshTeam();
        }
        if (store.prefs.notifyReports) refreshReports();
        return;
      }

      /* 4) Pano dosyası diskte değişti. */
      if (name === 'board.changed') {
        if (evt.payload && Array.isArray(evt.payload.rows)) {
          store.board.rows = evt.payload.rows;
          store.board.nextID = evt.payload.nextID || store.board.nextID;
          store.board.phases = evt.payload.phases || store.board.phases;
          if (store.screen === 'board') renderBoard();
        } else {
          refreshBoard();
        }
        return;
      }

      if (!name) return;

      /* Tur 4: uygulama içi tarayıcıdan gelen durum */
      if (name === 'browser.state') {
        applyBrowserState({ ok: true, data: evt.payload || {} });
        return;
      }

      /* 5) Gerçek sunucu olayları: API-74 adları. */
      if (/^(session\.(created|archived|renamed|status|idle|model\.selected)|server\.connected)$/.test(name)) {
        refreshTeam();
      }
      if (/^(session\.execution\.|session\.text\.delta|permission\.(asked|replied))/.test(name)) {
        if (store.screen === 'command') loadMessages();
        if (store.screen === 'chat') loadChatMessages();
        /* canlı akış paneli açıksa onu da tazele (gerçek veri varsa) */
        if (embedSession && evt.data && evt.data.sessionID === embedSession) {
          const panel = $('[data-embed-panel]');
          if (panel && !panel.hidden && store.eventCount % 5 === 0) openEmbed(embedSession);
        }
      }
      if (name === 'session.execution.failed' && store.prefs.notifyErrors) {
        notify('Seans hata verdi', String((evt.data && evt.data.sessionID) || ''), 'danger');
      }
      if (name === 'session.idle') {
        if (store.prefs.notifyReports) refreshReports();
        refreshTeam();
      }
      if (name === 'session.status' && evt.data && evt.data.sessionID) {
        const s = store.sessions.find((x) => x.sessionId === evt.data.sessionID);
        if (s && evt.data.status) {
          s.state = evt.data.status;
          renderTeam();
          renderStats();
        }
      }
    });
  } catch { /* köprü hazır değil */ }
}

async function loadMessages() {
  const targets = [...store.selectedSessions];
  if (!targets.length) return;
  const res = await call(KV && KV.command && KV.command.messages, { sessionId: targets[0], limit: 50 });
  if (res.ok && res.data) {
    const d = res.data;
    store.messages = Array.isArray(d) ? d : (d.messages || []);
  }
  renderThread();
}

/* ---------------- olay bağlama ---------------- */
function updateCounter() {
  const ta = $('[data-field="command-text"]');
  const counter = $('[data-field="command-counter"]');
  if (!ta || !counter) return;
  const len = ta.value.length;
  counter.textContent = `${len} / 8000`;
  counter.classList.toggle('kv-subtle', len < 7000);
}


/*
 * T-187: tek uçuş koruması.
 *
 * Yazma ve uzun süren eylemler çift tıklamada iki kez koşuyordu: iki emir, iki
 * ayar kaydı, iki yeniden tarama. Artık eylem ilk tıkta kendini `aria-busy` ile
 * işaretler ve düğmeyi kilitler; ikinci tık yok sayılır. Kilit bitince eski
 * `disabled` durumu geri gelir (kendiliğinden devre dışı düğmeler bozulmaz).
 */
const SINGLE_FLIGHT_ACTIONS = new Set([
  'nav-reload',
  'team-refresh',
  'board-refresh',
  'reports-refresh',
  'roster-reload',
  'settings-save',
  'settings-test',
  'command-send',
  'command-interrupt',
  'local-grant',
  'local-revoke',
  'admin-refresh',
  'admin-model-install',
  'admin-model-cancel',
  'admin-model-verify',
  'admin-model-dir',
  'admin-disk-pick',
  'admin-provider-test',
  'admin-provider-failover',
  'admin-server-start',
  'admin-backup-refresh',
  'integration-pick',
  'integration-save',
  'integration-test',
  'integration-invoke',
  'mcp-connect',
  'mcp-add',
  'mcp-call',
  'audit-refresh',
  'onboard-test',
  'onboard-save',
  'onboard-connect',
  'onboard-models',
  'onboard-skip',
  'onboard-provider-new',
]);

function setBusy(node, on) {
  if (!node || !node.setAttribute) return;
  if (on) {
    node.dataset.wasDisabled = node.disabled ? '1' : '';
    node.setAttribute('aria-busy', 'true');
    node.setAttribute('data-busy', '');
    if ('disabled' in node) node.disabled = true;
  } else {
    node.removeAttribute('aria-busy');
    node.removeAttribute('data-busy');
    if ('disabled' in node && node.dataset.wasDisabled !== '1') node.disabled = false;
    delete node.dataset.wasDisabled;
  }
}

async function runGuardedAction(action, actionEl, sessionId) {
  if (!SINGLE_FLIGHT_ACTIONS.has(action)) {
    await dispatchAction(action, actionEl, sessionId);
    return;
  }
  if (actionEl.getAttribute('aria-busy') === 'true') return;
  setBusy(actionEl, true);
  try {
    await dispatchAction(action, actionEl, sessionId);
  } finally {
    setBusy(actionEl, false);
  }
}

async function dispatchAction(action, actionEl, sessionId) {
  switch (action) {
    case 'open-palette': openPalette(); break;
    case 'nav-back': navBack(); break;
    case 'nav-forward': navForward(); break;
    case 'nav-new-tab': navNewTab(); break;
    case 'nav-reload': {
      await refreshTeam();
      await refreshBoard();
      await refreshModels();
      await refreshReports();
      const entry = navCurrentEntry();
      if (entry) await navApply(entry);
      toast('Yenilendi', 'success');
      break;
    }
    case 'team-add': if (!store.models.pool.length) refreshModels(); openTeamAdd(); break;
  case 'team-auto': if (!store.models.pool.length) refreshModels(); openTeamAuto(); break;
    case 'set-leader': openSetLeader(sessionId, actionEl.dataset.roleCode); break;
    case 'team-refresh': await refreshTeam(); await refreshBoard(); toast('Yenilendi', 'success'); break;
    case 'card-command': openCommandFor(sessionId); break;
    case 'card-model': openModelDialog(sessionId); break;
    case 'card-flow':
      if (sessionId) navOpen(navEntryOf('session', sessionId));
      else await openEmbed('', actionEl.dataset.roleCode);
      break;
    case 'close-embed': { const p = $('[data-embed-panel]'); if (p) p.hidden = true; break; }
    case 'card-report': go('reports'); break;
    case 'card-remove': openRemove(sessionId, actionEl.dataset.roleCode); break;
    case 'command-send': confirmSend(); break;
    case 'command-history': openHistory(); break;
    case 'command-interrupt': interrupt(); break;
    case 'command-select-all': {
      const all = store.sessions.length && store.selectedSessions.size === store.sessions.length;
      store.selectedSessions = all ? new Set() : new Set(store.sessions.map((s) => s.sessionId || s.code));
      renderCommand();
      break;
    }
    case 'board-add': openBoardAdd(); break;
    case 'board-refresh': await refreshBoard(); break;
    case 'model-assign': {
      const first = store.sessions.find((s) => s.sessionId);
      openModelDialog(first ? first.sessionId : '');
      break;
    }
    case 'reports-refresh': await refreshReports(); break;
    case 'settings-save': await saveSettings(); break;
    case 'local-ask': openLocalAccessAsk(); break;
    case 'local-grant': closeModal(); await setLocalAccess(true); break;
    case 'local-revoke': await setLocalAccess(false); break;
    case 'settings-test': {
      const ok = await pingConnection();
      toast(ok ? 'Bağlantı başarılı' : 'Bağlantı kurulamadı', ok ? 'success' : 'warning');
      break;
    }
    case 'go-settings': go('settings'); break;
    case 'toggle-theme': toggleTheme(); break;
    case 'toggle-design': toggleDesign(); break;
    /* T-206: yalnız görünüm tercihlerini sıfırlar; bağlantı/parola/proje kalır. */
    case 'prefs-reset': {
      confirmDanger({
        title: 'Görünüm ayarlarını sıfırla',
        sub: 'Tema, tasarım dili, yazı tipi/boyutu, yoğunluk, hareket ve görünüm rolü ilk haline döner. Sunucu adresi, parola ve proje dizini silinmez.',
        confirmLabel: 'Sıfırla',
        run: async () => {
          Object.assign(store.prefs, {
            theme: 'dark', density: 'comfortable', font: 'sistem', size: 'normal',
            radius: 'normal', motion: 'normal', design: 'prototip'
          });
          savePrefs();
          applyPrefs();
          toast('Görünüm ayarları sıfırlandı.', 'success');
        }
      });
      break;
    }
    case 'toggle-density': toggleDensity(); break;
    case 'toggle-notifications': {
      const p = $('[data-notifications]');
      if (!p) break;
      if (p.hidden) setNotificationsOpen(true);
      else closeNotifications({ refocus: true });
      break;
    }
    case 'clear-notifications': store.notifications = []; renderNotifications(); break;
    case 'roster-reload': await refreshTeam(); toast('Kadro yenilendi', 'success'); break;
    /* --- Tur 11 (T-108): Yönetim Merkezi eylemleri --- */
    case 'admin-refresh': await refreshAdmin(); toast('Yönetim verisi yenilendi.', 'success'); break;
    case 'admin-team-add': if (!store.models.pool.length) refreshModels(); openTeamAdd(); break;
    case 'admin-team-remove': openRemove(sessionId, actionEl.dataset.roleCode); break;
    case 'admin-set-leader': openSetLeader(sessionId, actionEl.dataset.roleCode); break;
    case 'admin-assign-model': openModelDialog(sessionId); break;
    case 'admin-send': if (sessionId) openCommandFor(sessionId); else go('command'); break;
    case 'admin-model-install': await adminModelInstall(actionEl.dataset.model); break;
    case 'admin-model-cancel': await adminModelCancel(actionEl.dataset.job); break;
    case 'admin-model-verify': await adminModelVerify(actionEl.dataset.model); break;
    case 'admin-model-remove': openAdminDangerRemove(actionEl.dataset.model); break;
    case 'admin-model-dir': await adminPickDir('install'); break;
    case 'admin-disk-pick': await adminPickDir('disk'); break;
    case 'admin-provider-test': await openAdminProviderChain('test'); break;
    case 'admin-provider-failover': await openAdminProviderChain('failover'); break;
    case 'admin-server-start': await adminServerStart(); break;
    case 'admin-server-stop': openAdminDangerStop(); break;
    case 'admin-danger-cancel': openAdminDangerCancel(actionEl.dataset.job); break;
    case 'admin-danger-remove': openAdminDangerRemove(actionEl.dataset.model); break;
    case 'admin-danger-stop': openAdminDangerStop(); break;
    case 'admin-backup-refresh': await refreshAdminBackups(); break;
    /* --- Tur 12 (T-120/T-122): Bağlantı katmanı (UI §15) --- */
    case 'integration-pick': await pickIntegration(actionEl.dataset.providerId || ''); break;
    case 'integration-back': closeIntegrationDetail(); break;
    case 'integration-select': {
      const acc = store.integration.accounts.find((a) => a.id === actionEl.dataset.accountId);
      if (acc) {
        store.integration.accountId = acc.id;
        store.integration.providerId = acc.providerId || store.integration.providerId;
        renderIntegrations();
        await loadCapabilities(store.integration.providerId);
      }
      break;
    }
    case 'integration-remove': removeIntegration(actionEl.dataset.accountId || ''); break;
    case 'integration-save': await saveIntegration(); break;
    case 'integration-test': await testIntegration(); break;
    case 'integration-invoke': invokeIntegration(actionEl.dataset.capability || ''); break;
    case 'integration-activity-clear': {
      const node = $('[data-integration-activity]');
      if (node) node.replaceChildren();
      break;
    }
    case 'mcp-select': {
      store.mcp.selected = actionEl.dataset.serverId || '';
      const srv = store.mcp.servers.find((x) => x.id === store.mcp.selected);
      if (srv && Array.isArray(srv.tools)) store.mcp.tools = srv.tools;
      renderMcpServers();
      renderMcpTools();
      break;
    }
    case 'mcp-connect': await mcpConnect(actionEl.dataset.serverId || ''); break;
    case 'mcp-remove': removeMcp(actionEl.dataset.serverId || ''); break;
    case 'mcp-add': await addMcp(); break;
    case 'mcp-tool-pick': {
      store.mcp.tool = actionEl.dataset.tool || '';
      for (const b of $$('[data-mcp-tools] [data-action="mcp-tool-pick"]')) {
        b.setAttribute('aria-pressed', String(b.dataset.tool === store.mcp.tool));
      }
      break;
    }
    case 'mcp-call': callMcpTool(); break;
    case 'mcp-log-clear': {
      const node = $('[data-mcp-log]');
      if (node) node.replaceChildren();
      updateMcpLogCount();
      break;
    }
    /* --- Tur 13 (T-140): katalog + denetim (UI §15.5/§15.6) --- */
    case 'open-screen': go(actionEl.dataset.target || ''); break;
    case 'catalog-pick': pickCatalog(actionEl.dataset.catalogId || '', actionEl.dataset.catalogKind || ''); break;
    case 'catalog-reset': resetCatalog(); break;
    case 'catalog-install': confirmCatalogInstall(); break;
    case 'catalog-oauth': confirmCatalogOAuth(); break;
    case 'catalog-open': openCatalogProvider(); break;
    case 'catalog-flow-clear': clearCatalogFlow(); break;
    case 'oauth-reconnect': confirmCatalogOAuth(); break;
    case 'oauth-revoke': confirmCatalogRevoke(); break;
    case 'audit-refresh': await refreshAudit(); break;
    case 'audit-reset': resetAudit(); break;
    case 'audit-row-pick': pickAudit(actionEl.dataset.auditId || ''); break;
    /* --- Tur 14 (T-147): hazır bağlantılar (UI §15.9) --- */
    case 'preset-pick': pickPreset(actionEl.dataset.presetId || ''); break;
    case 'preset-reset': resetPresets(); break;
    case 'preset-connect': confirmPresetApply(); break;
    /* --- T-153: ilk kurulum + başlık yardımı --- */
    case 'screen-help': screenHelp(); break;
    case 'onboard-test': await onboardTest(); break;
    case 'onboard-save': await onboardSave(); break;
    case 'onboard-next': onboard.step = 3; onboardRender(); break;
    case 'onboard-connect': await onboardFinish('connect'); break;
    case 'onboard-models': await onboardFinish('models'); break;
    case 'onboard-skip': await onboardFinish(null); break;
    case 'onboard-provider-new': await onboardCreateProvider(); break;
    default:
      /* Tur 8 paneli (sağ panel, tur, bağlam menüsü) önce bakar. */
      if (await tur8Action(action)) break;
      /* Tur 6 eylemleri (rehber, sunucu, özet, Votion, lider masası) tek yerde. */
      await tur6Action(action);
      break;
  }
}

function bindControls() {
  document.addEventListener('click', async (e) => {
    /* Gezgin sekmeleri: kapatma düğmesi sekmeyi kapatır, gövde seçer */
    const closeEl = e.target.closest('[data-tab-close]');
    if (closeEl) { e.stopPropagation(); navCloseTab(closeEl.dataset.tabClose); return; }
    const tabEl = e.target.closest('[data-tab]');
    if (tabEl) { navSelectTab(tabEl.dataset.tab); return; }

    const actionEl = e.target.closest('[data-action]');
    const navEl = e.target.closest('[data-nav-item]');
    if (navEl) { go(navEl.dataset.navItem); return; }

    /* T-180: "İçeriğe atla" menüyü sekmeyle geçmeden içeriğe odak taşır. */
    const skipEl = e.target.closest('[data-field="skip-link"]');
    if (skipEl) {
      e.preventDefault();
      const main = $('[data-main]');
      if (main) main.focus();
      return;
    }
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const sessionId = actionEl.dataset.session || '';

    await runGuardedAction(action, actionEl, sessionId);
  });

  /* filtreler */
  const teamFilter = $('[data-field="team-filter"]');
  if (teamFilter) teamFilter.addEventListener('input', () => { store.filters.team = teamFilter.value; renderTeam(); });

  for (const b of $$('[data-filter-state]')) {
    b.addEventListener('click', () => {
      store.filters.teamState = b.dataset.filterState;
      for (const x of $$('[data-filter-state]')) x.setAttribute('aria-pressed', String(x === b));
      renderTeam();
    });
  }

  const boardFilter = $('[data-field="board-filter"]');
  if (boardFilter) boardFilter.addEventListener('input', () => { store.filters.board = boardFilter.value; renderBoard(); });

  const modelFilter = $('[data-field="model-filter"]');
  if (modelFilter) modelFilter.addEventListener('input', () => { store.filters.model = modelFilter.value; renderModels(); });

  for (const b of $$('[data-model-tab]')) {
    b.addEventListener('click', () => {
      store.filters.modelTab = b.dataset.modelTab;
      for (const x of $$('[data-model-tab]')) x.setAttribute('aria-pressed', String(x === b));
      renderModels();
    });
  }

  const roleSel = $('[data-field="report-role"]');
  if (roleSel) roleSel.addEventListener('change', () => { store.filters.reportRole = roleSel.value; renderReports(); });
  const statusSel = $('[data-field="report-status"]');
  if (statusSel) statusSel.addEventListener('change', () => { store.filters.reportStatus = statusSel.value; renderReports(); });
  const taskInp = $('[data-field="report-task"]');
  if (taskInp) taskInp.addEventListener('input', () => { store.filters.reportTask = taskInp.value; renderReports(); });

  const cmdFilter = $('[data-field="command-filter"]');
  if (cmdFilter) cmdFilter.addEventListener('input', () => { store.filters.command = cmdFilter.value; renderCommand(); });

  /* Tur 13: katalog filtreleri (arama ≥2 karakter — UI-146). */
  const catSearch = $('[data-catalog-search]');
  if (catSearch) {
    let debounce = null;
    catSearch.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { store.catalog.q = catSearch.value.trim(); renderCatalogGrid(); }, 250);
    });
  }
  const catCategory = $('[data-catalog-category]');
  if (catCategory) catCategory.addEventListener('change', () => {
    store.catalog.category = catCategory.value;
    renderCatalogGrid();
  });
  const catInstalled = $('[data-field="catalog-installed-only"]');
  if (catInstalled) catInstalled.addEventListener('change', () => {
    store.catalog.installedOnly = catInstalled.checked;
    renderCatalogGrid();
  });
  for (const b of $$('[data-catalog-kind]')) {
    b.addEventListener('click', () => {
      store.catalog.kind = b.dataset.catalogKind;
      for (const x of $$('[data-catalog-kind]')) x.setAttribute('aria-pressed', String(x === b));
      renderCatalogGrid();
    });
  }

  /* Tur 14: hazır bağlantı filtreleri (arama ≥2 karakter — UI-157). */
  const preSearch = $('[data-preset-search]');
  if (preSearch) {
    let debounce = null;
    preSearch.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { store.preset.q = preSearch.value.trim(); renderPresetGrid(); }, 250);
    });
  }
  const preCategory = $('[data-preset-category]');
  if (preCategory) preCategory.addEventListener('change', () => {
    store.preset.category = preCategory.value;
    renderPresetGrid();
  });
  for (const b of $$('[data-preset-kind]')) {
    b.addEventListener('click', () => {
      store.preset.kind = b.dataset.presetKind;
      for (const x of $$('[data-preset-kind]')) x.setAttribute('aria-pressed', String(x === b));
      renderPresetGrid();
    });
  }
  const preTest = $('[data-preset-test]');
  if (preTest) preTest.addEventListener('click', () => { testPreset(); });
  bindPresetVotion();
  /* Zorunlu alan dolunca kartın durum metni "Hazır"a döner (UI-151/UI-154). */
  const preFields = $('[data-field="preset-fields"]');
  if (preFields) preFields.addEventListener('input', () => {
    updatePresetCardState(store.preset.selected);
  });

  /* Tur 13: denetim filtreleri (code yalnız YEREL — API §7.2'de filtre değil). */
  const auditOp = $('[data-audit-filter-op]');
  if (auditOp) {
    auditOp.addEventListener('input', () => { store.audit.op = auditOp.value.trim(); });
    auditOp.addEventListener('change', () => { refreshAudit(); });
    auditOp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); refreshAudit(); } });
  }
  const auditCode = $('[data-audit-filter-code]');
  if (auditCode) auditCode.addEventListener('input', () => { store.audit.code = auditCode.value.trim().toLowerCase(); renderAudit(); });
  const auditSince = $('[data-audit-filter-since]');
  if (auditSince) auditSince.addEventListener('change', () => { store.audit.since = auditSince.value; refreshAudit(); });
  const auditLimit = $('[data-audit-limit]');
  if (auditLimit) auditLimit.addEventListener('change', () => {
    const n = Number(auditLimit.value);
    store.audit.limit = [50, 100, 200, 500].includes(n) ? n : 200;
  });

  /* Denetim satırı klavyeyle seçilir (§15.7: tabindex="0" + Enter). */
  document.addEventListener('keydown', (e) => {
    const row = e.target && e.target.closest ? e.target.closest('[data-audit-row]') : null;
    if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    pickAudit(row.dataset.auditId || '');
  });

  /* Hazır bağlantı kartı klavyeyle seçilir (§15.9 UI-151: Enter/Space). */
  document.addEventListener('keydown', (e) => {
    const card = e.target && e.target.closest ? e.target.closest('[data-preset-item]') : null;
    if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    pickPreset(card.dataset.presetId || '');
  });

  /* yazma alanı */
  const ta = $('[data-field="command-text"]');
  if (ta) {
    ta.addEventListener('input', updateCounter);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmSend(); }
    });
    updateCounter();
  }

  for (const b of $$('[data-template]')) {
    b.addEventListener('click', () => {
      if (!ta) return;
      const tpl = {
        durum: 'Durum raporu ver: mevcut görev, ilerleme yüzdesi, engel var mı, sonraki adım.',
        rapor: 'RAPOR formatında teslim et: Rol / Durum / Özet / Kanıt / Değişen dosyalar / Risk.',
        devam: 'Kaldığın yerden devam et. Tamamlananı kısaca yaz, sonra bir sonraki adıma geç.',
        dur: 'Çalışan işi güvenle durdur. Yarım kalan dosyaları bozmadan, son durumu tek satır yaz ve bekle.',
      }[b.dataset.template] || '';
      ta.value = tpl;
      updateCounter();
      ta.focus();
    });
  }

  /* tema / yoğunluk düğmeleri */
  for (const b of $$('[data-theme-set]')) {
    b.addEventListener('click', () => { store.prefs.theme = b.dataset.themeSet; savePrefs(); });
  }
  /* T-199: tasarım dili düğmeleri */
  for (const b of $$('[data-design-set]')) {
    b.addEventListener('click', () => setDesign(b.dataset.designSet));
  }
  for (const b of $$('[data-density-set]')) {
    b.addEventListener('click', () => { store.prefs.density = b.dataset.densitySet; savePrefs(); });
  }

  const nr = $('[data-field="notify-reports"]');
  if (nr) nr.addEventListener('change', () => { store.prefs.notifyReports = nr.checked; savePrefs(); });
  const ne = $('[data-field="notify-errors"]');
  if (ne) ne.addEventListener('change', () => { store.prefs.notifyErrors = ne.checked; savePrefs(); });

  /* palet */
  const palInput = $('[data-field="palette-input"]');
  if (palInput) {
    palInput.addEventListener('input', () => { paletteIndex = 0; renderPalette(palInput.value); });
    palInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1); renderPalette(palInput.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderPalette(palInput.value); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = paletteItems[paletteIndex]; if (it) { closePalette(); it.run(); } }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
  }
  const paletteRoot = $('[data-palette]');
  if (paletteRoot) paletteRoot.addEventListener('click', (e) => { if (e.target === paletteRoot) closePalette(); });

  /* İlk kurulum paneli açıkken odak panelde kalır. */
  const onboardRoot = $('[data-onboard]');
  if (onboardRoot) onboardRoot.addEventListener('keydown', onboardTrap);

  /* Gezgin: adres çubuğu + klavye */
  const navForm = $('[data-nav-form]');
  const navInput = $('[data-field="nav-address"]');
  if (navForm) {
    navForm.addEventListener('submit', (e) => {
      e.preventDefault();
      navGoAddress(navInput ? navInput.value : '');
    });
  }
  if (navInput) {
    navInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); syncAddress(); navInput.blur(); }
    });
    navInput.addEventListener('blur', () => syncAddress());
  }

  /* klavye kısayolları */
  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); openHistory(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); if (navInput) { navInput.focus(); navInput.select(); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') { e.preventDefault(); navNewTab(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
      const tab = navActiveTab();
      if (tab) { e.preventDefault(); navCloseTab(tab.id); }
      return;
    }
    if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      if (!navigator.tabs.length) return;
      const dir = e.shiftKey ? -1 : 1;
      navigator.active = (navigator.active + dir + navigator.tabs.length) % navigator.tabs.length;
      const entry = navCurrentEntry();
      renderTabs();
      if (entry) navApply(entry);
      return;
    }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navBack(); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navForward(); return; }
    if (e.key === '?' && !inField) { e.preventDefault(); openShortcuts(); return; }
    if (e.key === 'Escape') { closePalette(); closeNotifications({ refocus: true }); const modalRoot = $('[data-modal-root]'); const hadModal = Boolean(modalRoot && modalRoot.children.length); closeModal(); if (!hadModal && store.screen === 'integrations' && store.integration.view === 'detail') closeIntegrationDetail(); return; }
    if ((e.ctrlKey || e.metaKey) && !inField) {
      if (SCREEN_SHORTCUTS[e.key]) { e.preventDefault(); go(SCREEN_SHORTCUTS[e.key]); return; }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); refreshTeam(); refreshBoard(); }
    }
  });
}

/* =======================================================================
 * TUR 4 — sohbet · hafıza · projeler · sağlayıcılar · tarayıcı · ayarlar
 * ======================================================================= */

/* ------------------------------- SOHBET (T5-2) ------------------------------- */
const CHAT_ROLE_LABEL = {
  LDR: 'Lider', YM: 'Proje Yöneticisi', ARC: 'Mimar', DEV: 'Yazılımcı',
  DSN: 'Tasarımcı', QA: 'Test', OPS: 'DevOps'
};

function chatModelOptions() {
  const out = [];
  for (const p of store.providers.providers || []) {
    for (const m of p.models || []) {
      out.push({ value: `${p.id}::${m}`, label: `${p.name} · ${m}` });
    }
  }
  return out;
}

function renderChatModelSelect() {
  const sel = $('[data-field="chat-model"]');
  if (!sel) return;
  const options = chatModelOptions();
  const wanted = store.chat.providerId
    ? `${store.chat.providerId}::${store.chat.model}`
    : null;

  sel.replaceChildren();
  if (!options.length) {
    sel.append(el('option', { value: '', text: 'Sağlayıcı yok' }));
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  for (const o of options) sel.append(el('option', { value: o.value, text: o.label }));
  if (wanted && options.some((o) => o.value === wanted)) sel.value = wanted;
}

function renderChat() {
  /* --- sol ray: konuşma listesi --- */
  const list = $('[data-chat-list]');
  if (list) {
    list.replaceChildren();
    const q = String(store.chat.q || '').toLowerCase();
    const filtered = (store.chat.list || []).filter((c) => !q
      || matchesFold(c.title, q)
      || matchesFold(c.lastText, q));
    const sort = store.chat.sort || 'recent';
    const rows = filtered.slice().sort((a, b) => {
      if (sort === 'oldest') return String(a.updatedAt).localeCompare(String(b.updatedAt));
      if (sort === 'name') return String(a.title || '').localeCompare(String(b.title || ''), 'tr');
      if (sort === 'count') return (b.count || 0) - (a.count || 0);
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });

    if (!rows.length) {
      list.append(el('p', {
        class: 'kv-empty',
        text: (store.chat.list || []).length ? 'Eşleşen konuşma yok.' : 'Henüz konuşma yok. “＋” ile başlayın.'
      }));
    }
    for (const c of rows) {
      const active = store.chat.id === c.id;
      list.append(el('button', {
        class: 'kv-conv',
        type: 'button',
        'data-chat-pick': c.id,
        'aria-current': active ? 'true' : null
      }, [
        el('span', { class: 'kv-conv__main' }, [
          el('span', { class: 'kv-conv__title', text: c.title || 'Konuşma' }),
          el('span', { class: 'kv-conv__last', text: c.lastText || 'boş' }),
          el('span', { class: 'kv-conv__meta', text: `${CHAT_ROLE_LABEL[c.role] || c.role || '—'} · ${c.count} mesaj` })
        ])
      ]));
    }
  }

  /* --- başlık --- */
  const conv = store.chat.conversation;
  const title = $('[data-field="chat-title"]');
  if (title) title.textContent = conv ? (conv.title || 'Konuşma') : 'Konuşma seçin';
  const meta = $('[data-field="chat-meta"]');
  if (meta) {
    meta.textContent = conv
      ? `${CHAT_ROLE_LABEL[conv.role] || conv.role || ''} · ${conv.model || '—'} · ${store.chat.messages.length} mesaj`
      : 'soldan seçin ya da yeni başlatın';
  }

  const roleSel = $('[data-field="chat-role"]');
  if (roleSel) roleSel.value = store.chat.role || 'LDR';
  const sortSel = $('[data-field="chat-sort"]');
  if (sortSel) sortSel.value = store.chat.sort || 'recent';

  renderChatModelSelect();
  renderChatThread();
  updateChatCounter();
}

function chatTime(at) {
  if (!at) return '';
  try {
    return hhmm(new Date(at));
  } catch {
    return '';
  }
}

/*
 * T-188: sohbet, kullanıcıyı okuduğu yerden koparmaz.
 *
 * `renderChatThread()` her çizimde dibe atlıyordu; kullanıcı yukarı kaydırıp
 * eski mesajı okurken yeni gelen mesaj/çizim onu aşağı fırlatıyordu. Kural:
 * yalnız kullanıcı zaten dipte ise dibe yapış; değilse kaydırma konumu korunur.
 * Kendi mesajını gönderince bilinçli olarak dibe inilir (`stickChatToBottom`).
 */
const CHAT_STICK_PX = 48;
let chatStick = true;

function chatNearBottom(thread) {
  if (!thread) return true;
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight <= CHAT_STICK_PX;
}

/* Gönderim/anında yeni mesaj gibi kullanıcı eylemlerinde dibe sabitle. */
function stickChatToBottom() {
  chatStick = true;
}

/*
 * T-189: "En alta in" düğmesi.
 *
 * Kullanıcı yukarı kaydırıp eski mesajı okurken dibe dönmek için tek tık
 * gerekiyordu; ayrıca yeniden çizim korunduğu için (T-188) kullanıcı dipte
 * olmadığını fark etmeyebilir. Düğme yalnız gerçekten kaydırılabilir içerik
 * varken ve kullanıcı dipten uzaktayken görünür.
 */
function updateChatJump() {
  const btn = $('[data-action="chat-jump-bottom"]');
  const thread = $('[data-chat-thread]');
  if (!btn || !thread) return;
  const scrollable = thread.scrollHeight - thread.clientHeight > CHAT_STICK_PX;
  const far = scrollable && !chatNearBottom(thread);
  btn.hidden = !far;
}

function renderChatThread() {
  const thread = $('[data-chat-thread]');
  if (!thread) return;
  const keepTop = thread.scrollTop;
  const wasNearBottom = chatNearBottom(thread);
  const shouldStick = chatStick || wasNearBottom;
  thread.replaceChildren();

  if (!store.chat.conversation) {
    thread.append(el('div', { class: 'kv-chat__empty' }, [
      el('div', { class: 'kv-chat__empty-art', 'aria-hidden': 'true', text: '✦' }),
      el('p', {}, [
        el('strong', { text: 'Doğrudan modele yazın.' }),
        el('br'),
        el('span', {
          text: 'Hafıza, beceriler ve izin matrisi her mesaja otomatik eklenir. Anahtar tükenirse sıradaki anahtara geçilir.'
        })
      ]),
      el('button', { class: 'kv-button', type: 'button', 'data-action': 'chat-new', text: 'Yeni konuşma başlat' })
    ]));
    updateChatJump();
    return;
  }

  if (!store.chat.messages.length) {
    thread.append(el('div', { class: 'kv-chat__empty' }, [
      el('p', { class: 'kv-muted', text: 'Bu konuşmada henüz mesaj yok. Aşağıdan ilk mesajı yazın.' })
    ]));
  }

  for (const m of store.chat.messages) {
    const isUser = m.role === 'user';
    const isError = m.kind === 'error';
    const meta = m.meta || {};

    const head = el('div', { class: 'kv-bubble__head' }, [
      el('span', { class: 'kv-bubble__who', text: isUser ? 'SEN' : (CHAT_ROLE_LABEL[store.chat.role] || 'AJAN') }),
      el('span', { class: 'kv-bubble__time', text: chatTime(m.at) })
    ]);

    const nodes = [head, el('div', { class: 'kv-bubble__text', text: m.content || '' })];

    if (!isUser && !isError && meta.model) {
      const bits = [meta.model];
      if (meta.latency) bits.push(`${meta.latency} ms`);
      if (meta.attempts > 1) bits.push(`${meta.attempts} anahtar denendi`);
      if (meta.mask) bits.push(meta.mask);
      nodes.push(el('div', { class: 'kv-bubble__meta kv-mono', text: bits.join(' · ') }));
    }
    if (isError) {
      nodes.push(el('div', { class: 'kv-bubble__meta', text: 'Yeniden denemek için mesajı tekrar gönderin.' }));
      if (m.retryText) {
        nodes.push(el('div', { class: 'kv-bubble__actions' }, [
          el('button', {
            class: 'kv-button kv-button--sm', type: 'button', text: 'Tekrar dene',
            'data-action': 'chat-retry', 'data-index': String(store.chat.messages.indexOf(m))
          }),
          el('button', {
            class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Kopyala',
            onclick: () => copyText(m.content || '', 'Hata metni kopyalandı.')
          })
        ]));
      }
    }

    thread.append(el('div', {
      class: `kv-bubble kv-bubble--${isUser ? 'user' : (isError ? 'error' : 'assistant')}`,
      'data-role': isUser ? null : (store.chat.role || null),
      'data-kind': isError ? 'error' : null
    }, nodes));
  }

  if (store.chat.busy) {
    thread.append(el('div', { class: 'kv-bubble kv-bubble--assistant kv-bubble--typing' }, [
      el('div', { class: 'kv-bubble__head' }, [
        el('span', { class: 'kv-bubble__who', text: CHAT_ROLE_LABEL[store.chat.role] || 'AJAN' }),
        el('span', { class: 'kv-bubble__time', text: 'yazıyor' })
      ]),
      el('div', { class: 'kv-typing' }, [
        el('i', {}), el('i', {}), el('i', {})
      ]),
      thinkRow('düşünüyor…')
    ]));
  }

  /* T-188: okuma konumunu koru — yalnız dipteyken veya kullanıcı gönderince dibe in. */
  if (shouldStick) {
    thread.scrollTop = thread.scrollHeight;
    chatStick = false;
  } else {
    thread.scrollTop = keepTop;
  }
  updateChatJump();
  restoreChatDraft();
}

async function refreshChats() {
  const res = await call(KV && KV.chat && KV.chat.list);
  if (res.ok && res.data) {
    store.chat.list = res.data.conversations || [];
  } else {
    store.chat.list = [];
  }
  /* Secili konusma listede yoksa ilkine gec. */
  if (!store.chat.id && store.chat.list.length) {
    await openChat(store.chat.list[0].id);
    return;
  }
  renderChat();
}

async function openChat(id) {
  const res = await call(KV && KV.chat && KV.chat.get, { id });
  if (!res.ok) {
    notify('Konuşma açılamadı', (res.error && res.error.message) || 'hata', 'danger');
    return;
  }
  const conv = res.data.conversation || {};
  store.chat.id = conv.id;
  store.chat.conversation = conv;
  store.chat.messages = res.data.messages || [];
  store.chat.role = conv.role || 'LDR';
  store.chat.model = conv.model || '';
  store.chat.providerId = conv.providerId || '';
  /* T-188: başka konuşmaya geçerken en son mesaj görünsün. */
  stickChatToBottom();
  renderChat();
  await refreshChatMemoryHint();
}

async function newChat() {
  const res = await call(KV && KV.chat && KV.chat.create, {
    role: store.chat.role || 'LDR',
    model: store.chat.model || undefined,
    providerId: store.chat.providerId || undefined,
    confirmToken: makeConfirmToken()
  });
  if (!res.ok) {
    notify('Konuşma açılamadı', (res.error && res.error.message) || 'hata', 'danger');
    return;
  }
  store.chat.list = res.data.conversations || store.chat.list;
  await openChat(res.data.conversation.id);
  const ta = $('[data-field="chat-text"]');
  if (ta) ta.focus();
}

function updateChatCounter() {
  const ta = $('[data-field="chat-text"]');
  const counter = $('[data-field="chat-counter"]');
  if (!ta || !counter) return;
  counter.textContent = `${ta.value.length} / 8000`;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(180, ta.scrollHeight)}px`;
}

async function refreshChatMemoryHint() {
  const hint = $('[data-field="chat-context-hint"]');
  if (!hint) return;
  const res = await call(KV && KV.memory && KV.memory.context, { limit: 12 });
  if (res.ok && res.data) {
    hint.textContent = res.data.count
      ? `hafıza: ${res.data.count} kayıt bağlama ekleniyor`
      : 'hafıza: boş';
  } else {
    hint.textContent = 'hafıza: —';
  }
}

async function sendChat() {
  const ta = $('[data-field="chat-text"]');
  const text = ta ? ta.value.trim() : '';
  if (!text) { toast('Mesaj boş.', 'warning'); return; }
  if (store.chat.busy) return;

  if (!store.chat.id) {
    await newChat();
    if (!store.chat.id) return;
  }

  const status = $('[data-field="chat-status"]');
  /* T-191: yeni gönderim önceki hatanın duyurusunu temizler. */
  const alertBox = $('[data-field="chat-alert"]');
  if (alertBox) alertBox.textContent = '';
  store.chat.busy = true;
  store.chat.startedAt = Date.now();
  if (ta) { ta.value = ''; }
  saveChatDraft('');
  updateChatCounter();

  /* iyimser balon: kullanici mesaji hemen gorunur (uydurma yanit yok) */
  store.chat.messages.push({
    id: `local-${Date.now()}`,
    role: 'user',
    at: new Date().toISOString(),
    content: text
  });
  stickChatToBottom();
  renderChatThread();
  if (status) status.textContent = 'model yanıtlıyor…';
  const sendIcon = $('[data-field="chat-send-icon"]');
  if (sendIcon) sendIcon.textContent = '■';

  const res = await call(KV && KV.chat && KV.chat.send, {
    conversationId: store.chat.id,
    text,
    role: store.chat.role,
    model: store.chat.model,
    providerId: store.chat.providerId || undefined,
    confirmToken: makeConfirmToken()
  });

  store.chat.busy = false;
  store.chat.startedAt = 0;
  if (sendIcon) sendIcon.textContent = '➤';

  if (res.ok) {
    if (status) status.textContent = `${res.data.model || ''} · ${res.data.latency} ms`;
    await openChat(store.chat.id);
    await refreshChats();
    autoCapture(`Sohbet (${store.chat.role}): ${text}\nYanıt: ${String((res.data && res.data.reply) || '').slice(0, 800)}`, 'sohbet', store.chat.role);
  } else {
    const code = res.error && res.error.code;
    const attempts = (res.error && res.error.detail && res.error.detail.attempts) || [];
    const tried = attempts.length
      ? ` (${attempts.length} anahtar denendi)`
      : '';
    const msg = code === 'E_SECRET_MISSING'
      ? 'Sağlayıcı API anahtarı yok — Sağlayıcılar ekranından bir anahtar ekleyin.'
      : (ERROR_CODE_VIEWS[code] || (res.error && res.error.message) || code || 'bilinmeyen hata');
    store.chat.messages.push({
      id: `err-${Date.now()}`,
      role: 'system',
      kind: 'error',
      retryText: text,
      at: new Date().toISOString(),
      content: `Gönderilemedi: ${msg}${tried}\n${attempts.map((a) => `• ${a.mask || '—'} → ${a.status === null ? (a.reason || 'ağ') : a.status} (${a.outcome})`).join('\n')}`
    });
    renderChatThread();
    if (status) status.textContent = code === 'E_SECRET_MISSING' ? 'anahtar yok' : 'hata';
    /* T-191: hata, görsel balona ek olarak ekran okuyucuya da duyurulur. */
    if (alertBox) {
      alertBox.textContent = code === 'E_SECRET_MISSING'
        ? 'Mesaj gönderilemedi: sağlayıcı API anahtarı yok.'
        : `Mesaj gönderilemedi: ${msg}`;
    }
    /* Gönderilemeyen metin kutuda kalır; taslağı da geri koy ki pencere
       kapanınca aynı metin kaybolmasın (T-177). */
    if (ta && !ta.value) ta.value = text;
    saveChatDraft(ta ? ta.value : '');
    updateChatCounter();
  }
}

async function chatRename() {
  if (!store.chat.id) { toast('Önce bir konuşma seçin.', 'warning'); return; }
  const input = el('input', {
    class: 'kv-input', value: store.chat.conversation.title || '',
    'data-field': 'chat-rename-input'
  });
  modal({
    title: 'Konuşmayı yeniden adlandır',
    body: [el('div', { class: 'kv-field' }, [el('label', { text: 'Başlık' }), input])],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Kaydet',
        onclick: async () => {
          const value = input.value.trim();
          if (!value) { toast('Başlık boş.', 'warning'); return; }
          closeModal();
          const res = await call(KV && KV.chat && KV.chat.rename, {
            id: store.chat.id, title: value, confirmToken: makeConfirmToken()
          });
          if (res.ok) { await refreshChats(); await openChat(store.chat.id); }
          else notify('Adlandırılamadı', (res.error && res.error.message) || 'hata', 'danger');
        }
      })
    ]
  });
}

async function chatDelete() {
  if (!store.chat.id) return;
  modal({
    title: 'Konuşmayı sil',
    sub: store.chat.conversation ? store.chat.conversation.title : '',
    body: [el('p', { class: 'kv-muted', text: 'Sohbet geçmişi bu bilgisayardan silinir. Bu işlem geri alınamaz.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button kv-button--danger', type: 'button', text: 'Sil',
        onclick: async () => {
          closeModal();
          const res = await call(KV && KV.chat && KV.chat.remove, {
            id: store.chat.id, confirmToken: makeConfirmToken()
          });
          if (res.ok) {
            store.chat.id = null;
            store.chat.conversation = null;
            store.chat.messages = [];
            store.chat.list = res.data.conversations || [];
            renderChat();
          } else {
            notify('Silinemedi', (res.error && res.error.message) || 'hata', 'danger');
          }
        }
      })
    ]
  });
}

/**
 * Konuşmayı pano için Markdown'a çevirir (T-173).
 * Amaç: kullanıcı yanıtı bir rapora/PR'a yapıştırabilsin; ağ yok, dosya yok.
 */
function chatMarkdown() {
  const conv = store.chat.conversation || {};
  const title = String(conv.title || 'Konuşma').trim();
  const lines = [`# ${title}`, ''];
  const meta = [new Date().toISOString().slice(0, 16).replace('T', ' '), store.chat.role || 'LDR', store.chat.model || '']
    .filter(Boolean).join(' · ');
  lines.push(`_${meta}_`, '');
  for (const m of store.chat.messages) {
    if (m.role === 'user') lines.push('**Sen**', '', String(m.content || ''), '');
    else if (m.kind === 'error') lines.push('> Hata', ...String(m.content || '').split('\n').map((l) => `> ${l}`), '');
    else lines.push(`**${CHAT_ROLE_LABEL[store.chat.role] || 'Ajan'}**`, '', String(m.content || ''), '');
  }
  return lines.join('\n').trimEnd() + '\n';
}

async function chatCopyMarkdown() {
  if (!store.chat.conversation) { toast('Önce bir konuşma seçin.', 'warning'); return; }
  if (!store.chat.messages.length) { toast('Bu konuşmada mesaj yok.', 'warning'); return; }
  await copyText(chatMarkdown(), 'Konuşma Markdown olarak kopyalandı.');
}

async function chatPreview() {
  const res = await call(KV && KV.chat && KV.chat.preview, { role: store.chat.role || 'LDR' });
  const block = res.ok && res.data ? res.data.block : 'Bağlam okunamadı.';
  modal({
    title: 'Modele gönderilen sistem bağlamı',
    sub: 'Her mesajda bu blok + son 20 mesaj gönderilir.',
    body: [el('pre', { class: 'kv-modal__preview kv-mono', text: block })],
    actions: [el('button', { class: 'kv-button', type: 'button', text: 'Kapat', onclick: closeModal })]
  });
}


/* ------------------------------- HAFIZA ------------------------------- */
function renderMemory() {
  const flowRoot = $('[data-memory-flow]');
  if (flowRoot && store.memory.flow) {
    flowRoot.replaceChildren();
    for (const stage of store.memory.flow.stages || []) {
      flowRoot.append(el('li', { class: 'kv-flow__step', 'data-stage': stage.id }, [
        el('div', { class: 'kv-flow__head' }, [
          el('span', { class: 'kv-flow__title', text: stage.title }),
          el('span', { class: 'kv-flow__count', text: String(stage.count) })
        ]),
        el('span', { class: 'kv-flow__desc', text: stage.desc })
      ]));
    }
  }

  const total = $('[data-field="memory-total"]');
  if (total) total.textContent = `${store.memory.entries.length} kayıt`;
  const count = $('[data-field="memory-count"]');
  if (count) count.textContent = String(store.memory.entries.length);
  const pathEl = $('[data-field="memory-path"]');
  if (pathEl) pathEl.textContent = store.memory.dir || '—';

  const list = $('[data-memory-list]');
  if (list) {
    list.replaceChildren();
    if (!store.memory.entries.length) {
      list.append(emptyState('Hafıza boş. “Hatırlanacak ekle” ile ilk tercihi yazın.', 'Hatırlanacak ekle', openMemoryAdd));
    }
    for (const e of store.memory.entries) {
      const id = e.id;
      list.append(el('button', {
        class: 'kv-mem',
        type: 'button',
        'data-memory-pick': id,
        'aria-current': store.memory.selected === id ? 'true' : null
      }, [
        el('span', { class: 'kv-mem__text', text: e.text }),
        el('span', { class: 'kv-mem__meta', text: `${scopeLabel(e.scope)} · ${kindLabel(e.kind)} · ${e.role || '—'}` })
      ]));
    }
  }
  renderMemoryDetail();
}

function scopeLabel(scope) {
  return { user: 'kullanıcı', team: 'ekip', project: 'proje' }[scope] || scope;
}

function kindLabel(kind) {
  return { preference: 'tercih', decision: 'karar', fact: 'olgu', correction: 'düzeltme' }[kind] || kind;
}

function renderMemoryDetail() {
  const root = $('[data-memory-detail]');
  const title = $('[data-field="memory-detail-title"]');
  if (!root) return;
  const entry = store.memory.entries.find((e) => e.id === store.memory.selected);
  root.replaceChildren();
  if (!entry) {
    if (title) title.textContent = 'Kayıt seçin';
    root.append(el('p', { class: 'kv-empty', text: 'Soldan bir kayıt seçin.' }));
    return;
  }
  if (title) title.textContent = `${scopeLabel(entry.scope)} · ${kindLabel(entry.kind)}`;
  root.append(el('div', { class: 'kv-mem-detail' }, [
    el('div', { class: 'kv-mem-detail__text', text: entry.text }),
    el('div', { class: 'kv-row' }, [
      badge(scopeLabel(entry.scope), entry.scope === 'user' ? 'success' : entry.scope === 'team' ? 'info' : 'idle'),
      badge(kindLabel(entry.kind), 'idle'),
      badge(`ağırlık ${entry.weight}`, 'idle'),
      el('span', { class: 'kv-muted kv-mono', text: entry.id })
    ]),
    el('p', { class: 'kv-muted kv-mono', text: `${entry.at} · rol ${entry.role || '—'} · kaynak ${entry.source || '—'}` }),
    (entry.tags || []).length ? el('div', { class: 'kv-row' }, entry.tags.map((t) => badge(t, 'info'))) : null,
    el('div', { class: 'kv-row' }, [
      el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'memory-copy-context', text: 'Bağlam bloğunu göster' })
    ])
  ]));
}

async function refreshMemory() {
  const res = await call(KV && KV.memory && KV.memory.read, {
    scope: store.memory.scope || undefined,
    q: store.memory.q || undefined
  });
  if (res.ok && res.data) {
    store.memory.entries = res.data.entries || [];
    store.memory.flow = res.data.flow || store.memory.flow;
    store.memory.dir = res.data.dir || '';
  } else {
    store.memory.entries = [];
  }
  renderMemory();
}

function openMemoryAdd() {
  const text = el('textarea', { class: 'kv-input kv-input--area', rows: '4', 'data-field': 'mem-text', placeholder: 'Örn: “Kullanıcı arayüzde koyu tema istiyor.”' });
  const scope = el('select', { class: 'kv-input', 'data-field': 'mem-scope' }, [
    el('option', { value: 'user', text: 'Kullanıcı tercihi (öncelikli)' }),
    el('option', { value: 'team', text: 'Ekip kararı' }),
    el('option', { value: 'project', text: 'Proje notu' })
  ]);
  const kind = el('select', { class: 'kv-input', 'data-field': 'mem-kind' }, [
    el('option', { value: 'preference', text: 'Tercih' }),
    el('option', { value: 'decision', text: 'Karar' }),
    el('option', { value: 'fact', text: 'Olgu' }),
    el('option', { value: 'correction', text: 'Düzeltme' })
  ]);
  const role = el('select', { class: 'kv-input', 'data-field': 'mem-role' },
    ['LDR', 'YM', 'ARC', 'DEV', 'DSN', 'QA', 'OPS'].map((r) => el('option', { value: r, text: r })));
  const tags = el('input', { class: 'kv-input', placeholder: 'etiket, virgülle', 'data-field': 'mem-tags' });

  modal({
    title: 'Hatırlanacak ekle',
    sub: 'Bu kayıt tüm ajanların bağlamına girer. Kullanıcı tercihleri önce uygulanır.',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'Metin' }), text]),
      el('div', { class: 'kv-row' }, [
        el('div', { class: 'kv-field' }, [el('label', { text: 'Kapsam' }), scope]),
        el('div', { class: 'kv-field' }, [el('label', { text: 'Tür' }), kind]),
        el('div', { class: 'kv-field' }, [el('label', { text: 'Rol' }), role])
      ]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Etiketler' }), tags])
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Hatırla',
        onclick: async () => {
          const value = text.value.trim();
          if (!value) { toast('Metin boş.', 'warning'); return; }
          closeModal();
          const res = await call(KV && KV.memory && KV.memory.write, {
            text: value,
            scope: scope.value,
            kind: kind.value,
            role: role.value,
            tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
            confirmToken: makeConfirmToken()
          });
          if (res.ok) {
            notify('Hafızaya eklendi', `${scopeLabel(scope.value)} · ${kindLabel(kind.value)}`, 'success');
            await refreshMemory();
            await refreshChatMemoryHint();
          } else {
            notify('Hafıza yazılamadı', (res.error && res.error.message) || 'hata', 'danger');
          }
        }
      })
    ]
  });
}

async function showMemoryContext() {
  const res = await call(KV && KV.memory && KV.memory.context, { limit: 20 });
  const block = res.ok && res.data ? res.data.block : 'Hafıza okunamadı.';
  modal({
    title: 'Ajana enjekte edilen bağlam',
    sub: 'Her ajan göreve başlarken bu bloğu alır.',
    body: [el('pre', { class: 'kv-modal__preview kv-mono', text: block })],
    actions: [el('button', { class: 'kv-button', type: 'button', text: 'Kapat', onclick: closeModal })]
  });
}

/* ------------------------------- PROJELER ------------------------------ */
function renderProjects() {
  const root = $('[data-project-grid]');
  if (!root) return;
  root.replaceChildren();
  const activeEl = $('[data-field="project-active"]');
  if (activeEl) activeEl.textContent = store.projects.activeDir ? `aktif: ${store.projects.activeDir}` : '—';

  if (!store.projects.projects.length) {
    root.append(emptyState('Kayıtlı proje yok. “Yeni proje” ile başlayın.', 'Yeni proje', openProjectNew));
    return;
  }
  for (const p of store.projects.projects) {
    root.append(el('div', {
      class: 'kv-project',
      'data-active': String(Boolean(p.active)),
      'data-archived': String(Boolean(p.archivedAt))
    }, [
      el('div', { class: 'kv-row kv-row--between' }, [
        el('span', { class: 'kv-project__name', text: p.name }),
        p.active ? badge('aktif', 'success') : (p.archivedAt ? badge('arşiv', 'idle') : badge('hazır', 'info'))
      ]),
      el('span', { class: 'kv-project__dir', text: p.dir, title: p.dir }),
      el('span', { class: 'kv-project__meta', text: `${p.createdAt ? new Date(p.createdAt).toLocaleDateString('tr-TR') : '—'}${p.exists ? '' : ' · klasör yok'}` }),
      el('div', { class: 'kv-row' }, [
        el('button', {
          class: 'kv-button kv-button--sm', type: 'button', text: 'Aç',
          'data-project-switch': p.id, disabled: p.active || Boolean(p.archivedAt) || !p.exists ? true : null
        }),
        el('button', {
          class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Arşivle',
          'data-project-archive': p.id, disabled: p.active || Boolean(p.archivedAt) ? true : null
        })
      ])
    ]));
  }
}

async function refreshProjects() {
  const res = await call(KV && KV.project && KV.project.list);
  if (res.ok && res.data) {
    store.projects = res.data;
  }
  renderProjects();
}

function openProjectNew() {
  const name = el('input', { class: 'kv-input', placeholder: 'Proje adı', 'data-field': 'proj-name' });
  const dir = el('input', { class: 'kv-input kv-mono', placeholder: 'Boş bırakılırsa uygulama klasöründe oluşturulur', 'data-field': 'proj-dir' });
  modal({
    title: 'Yeni proje',
    sub: 'Her proje kendi panosunu, kadrosunu ve hafızasını taşır.',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'Ad' }), name]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Dizin (isteğe bağlı)' }), dir])
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Oluştur',
        onclick: async () => {
          const value = name.value.trim();
          if (!value) { toast('Proje adı gerekli.', 'warning'); return; }
          closeModal();
          const res = await call(KV && KV.project && KV.project.create, {
            name: value,
            dir: dir.value.trim() || undefined,
            confirmToken: makeConfirmToken()
          });
          if (res.ok) {
            notify('Proje oluşturuldu', value, 'success');
            await refreshProjects();
            await refreshTeam(); await refreshBoard(); await refreshMemory();
            toast('Yeni proje aktif', 'success');
          } else {
            notify('Proje oluşturulamadı', (res.error && res.error.message) || 'hata', 'danger');
          }
        }
      })
    ]
  });
}

async function switchProject(id) {
  const res = await call(KV && KV.project && KV.project.switch, { id, confirmToken: makeConfirmToken() });
  if (res.ok) {
    notify('Proje değişti', id, 'success');
    await refreshProjects();
    await refreshTeam(); await refreshBoard(); await refreshMemory(); await refreshReports();
  } else {
    notify('Proje değiştirilemedi', (res.error && res.error.message) || 'hata', 'danger');
  }
}

/* T-186: arşivleme tek tıkla olmaz — önce onay, sonra yazma. */
function archiveProject(id) {
  const project = (store.projects.projects || []).find((p) => p.id === id);
  confirmDanger({
    title: 'Projeyi arşivle',
    sub: 'Proje silinmez; listeden arşive taşınır ve aktif proje olamaz.',
    body: [el('p', { class: 'kv-modal__sub', text: `${(project && project.name) || id}${project && project.dir ? ` · ${project.dir}` : ''}` })],
    confirmLabel: 'Arşivle',
    run: async () => {
      const res = await call(KV && KV.project && KV.project.archive, { id, confirmToken: makeConfirmToken() });
      if (res.ok) { notify('Proje arşivlendi', 'silinmedi', 'success'); await refreshProjects(); }
      else notify('Arşivlenemedi', (res.error && res.error.message) || 'hata', 'danger');
    },
  });
}

/* ----------------------------- SAĞLAYICILAR ---------------------------- */
function renderProviders() {
  const root = $('[data-provider-grid]');
  if (!root) return;
  root.replaceChildren();
  if (!store.providers.providers.length) {
    root.append(emptyState('Sağlayıcı yok. “Sağlayıcı ekle” ile başlayın.', 'Sağlayıcı ekle', openProviderNew));
    return;
  }
  for (const p of store.providers.providers) {
    const keyList = el('div', { class: 'kv-keylist' });
    if (!p.keys.length) {
      keyList.append(el('p', { class: 'kv-muted', text: 'Anahtar yok — istek atılamaz.' }));
    }
    for (const k of p.keys) {
      keyList.append(el('div', { class: 'kv-key', 'data-health': k.health.state }, [
        el('span', { class: 'kv-key__order', text: String(k.order + 1) }),
        el('span', { class: 'kv-key__label', text: k.label }),
        el('span', { class: 'kv-key__mask', text: k.mask }),
        k.health.state === 'cooldown' ? badge('beklemede', 'warning') : badge('hazır', 'success'),
        el('button', {
          class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: '✕',
          title: 'Anahtarı kaldır', 'data-key-remove': k.id, 'data-provider': p.id
        })
      ]));
    }

    root.append(el('div', { class: 'kv-provider' }, [
      el('div', { class: 'kv-provider__head' }, [
        el('div', {}, [
          el('div', { class: 'kv-provider__name', text: p.name }),
          el('div', { class: 'kv-provider__url', text: p.baseURL })
        ]),
        p.enabled ? badge('etkin', 'success') : badge('kapalı', 'idle')
      ]),
      el('span', { class: 'kv-muted', text: `${p.models.length} model · ${p.keys.length} anahtar` }),
      keyList,
      el('div', { class: 'kv-row' }, [
        el('button', {
          class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: '＋ Anahtar',
          'data-key-add': p.id
        }),
        el('button', {
          class: 'kv-button kv-button--sm', type: 'button', text: 'Test et / geçişi dene',
          'data-provider-test': p.id, disabled: p.keys.length ? null : true
        })
      ])
    ]));
  }
  renderFailover();
}

function renderFailover() {
  const body = $('[data-failover-body]');
  if (!body) return;
  body.replaceChildren();
  const attempts = store.failover.attempts || [];
  if (!attempts.length) {
    body.append(el('tr', {}, [el('td', { colspan: '6', class: 'kv-empty', text: 'Sağlayıcı kartından “Test et” çalıştırın.' })]));
  }
  attempts.forEach((a, i) => {
    body.append(el('tr', {}, [
      el('td', { class: 'kv-mono', text: String(i + 1) }),
      el('td', { class: 'kv-mono', text: a.mask || '—' }),
      el('td', { class: 'kv-mono', text: a.status === null ? '—' : String(a.status) }),
      el('td', { text: a.reason || '—' }),
      el('td', { class: 'kv-mono', text: a.latency === undefined ? '—' : `${a.latency} ms` }),
      el('td', {}, [
        badge(a.outcome === 'success' ? 'başarılı' : a.outcome === 'switch' ? 'sonraki anahtar' : a.outcome === 'skip' ? 'atlandı' : 'durdu',
          a.outcome === 'success' ? 'success' : a.outcome === 'switch' ? 'warning' : 'idle')
      ])
    ]));
  });
  const summary = $('[data-field="failover-summary"]');
  if (summary) {
    summary.textContent = store.failover.summary || 'henüz denenmedi';
  }
}

async function refreshProviders() {
  const res = await call(KV && KV.provider && KV.provider.list);
  if (res.ok && res.data) {
    store.providers = res.data;
    const note = $('[data-field="provider-note"]');
    if (note && !res.data.secretsEncrypted) {
      note.textContent = 'Uyarı: bu sistemde anahtar şifreleme (DPAPI) yok — anahtar kaydedilemez.';
    }
  }
  renderProviders();
}

function openProviderNew() {
  const name = el('input', { class: 'kv-input', placeholder: 'Evren Ekibim', 'data-field': 'prv-name' });
  const url = el('input', { class: 'kv-input kv-mono', placeholder: 'https://…/v1', 'data-field': 'prv-url' });
  const models = el('input', { class: 'kv-input kv-mono', placeholder: 'auto, clef, deepseek-v4.1-flash', 'data-field': 'prv-models' });
  modal({
    title: 'Sağlayıcı ekle',
    sub: 'OpenAI uyumlu tek kapı (tüm modeller tek API üzerinden).',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'Ad' }), name]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Temel adres (baseURL)' }), url]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Modeller (virgülle)' }), models])
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Kaydet',
        onclick: async () => {
          if (!name.value.trim() || !url.value.trim()) { toast('Ad ve adres gerekli.', 'warning'); return; }
          closeModal();
          const res = await call(KV && KV.provider && KV.provider.save, {
            provider: {
              name: name.value.trim(),
              baseURL: url.value.trim(),
              models: models.value.split(',').map((m) => m.trim()).filter(Boolean)
            },
            confirmToken: makeConfirmToken()
          });
          if (res.ok) { notify('Sağlayıcı kaydedildi', name.value.trim(), 'success'); await refreshProviders(); }
          else notify('Kaydedilemedi', (res.error && res.error.message) || 'hata', 'danger');
        }
      })
    ]
  });
}

function openKeyAdd(providerId) {
  const key = el('input', { class: 'kv-input kv-mono', type: "password", autocomplete: 'off', placeholder: 'API anahtarı', 'data-field': 'key-value' });
  const label = el('input', { class: 'kv-input', placeholder: 'Anahtar 1', 'data-field': 'key-label' });
  modal({
    title: 'API anahtarı ekle',
    sub: 'DPAPI ile şifrelenir; bir daha düz metin gösterilmez. Yalnız maskeli kimlik görünür.',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'Anahtar' }), key]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Etiket' }), label])
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Ekle',
        onclick: async () => {
          const value = key.value.trim();
          if (value.length < 8) { toast('Anahtar çok kısa.', 'warning'); return; }
          closeModal();
          const res = await call(KV && KV.provider && KV.provider.addKey, {
            providerId,
            key: value,
            label: label.value.trim() || undefined,
            confirmToken: makeConfirmToken()
          });
          if (res.ok) { notify('Anahtar eklendi', res.data.key.mask, 'success'); await refreshProviders(); }
          else notify('Anahtar eklenemedi', (res.error && res.error.message) || 'hata', 'danger');
        }
      })
    ]
  });
}

/* T-186: anahtar kaldırma sırdan geri dönüşü yok — onay ister. */
function removeKey(providerId, keyId) {
  const provider = (store.providers.providers || []).find((p) => p.id === providerId);
  confirmDanger({
    title: 'Anahtarı kaldır',
    sub: 'Anahtar bu cihazdan silinir; sağlayıcıya yeniden ekleyene kadar istek atılamaz.',
    body: [el('p', { class: 'kv-modal__sub kv-mono', text: `${(provider && provider.name) || providerId} · ${keyId}` })],
    confirmLabel: 'Anahtarı kaldır',
    run: async () => {
      const res = await call(KV && KV.provider && KV.provider.removeKey, {
        providerId, keyId, confirmToken: makeConfirmToken()
      });
      if (res.ok) { notify('Anahtar kaldırıldı', keyId, 'success'); await refreshProviders(); }
      else notify('Kaldırılamadı', (res.error && res.error.message) || 'hata', 'danger');
    },
  });
}

async function testProvider(providerId) {
  const summary = $('[data-field="failover-summary"]');
  if (summary) summary.textContent = 'deneniyor…';
  const res = await call(KV && KV.provider && KV.provider.test, { providerId, path: '/models' });
  const attempts = (res.ok && res.data && res.data.attempts)
    || (res.error && res.error.detail && res.error.detail.attempts)
    || [];
  store.failover = {
    attempts,
    summary: res.ok
      ? `başarılı · ${res.data.mask} · ${attempts.length} deneme`
      : `başarısız · ${(res.error && res.error.code) || 'hata'} · ${attempts.length} deneme`
  };
  renderFailover();
  await refreshProviders();
  notify(res.ok ? 'Geçiş zinciri başarılı' : 'Tüm anahtarlar denendi',
    res.ok ? res.data.mask : ((res.error && res.error.message) || 'hata'),
    res.ok ? 'success' : 'danger');
}

/* ------------------------------ TARAYICI (T5-1) ------------------------------- */

/** Adres çubuğuna yazılanı URL'ye çevir; URL değilse arama yap. */
function browserTarget(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // file:, javascript: vb. reddedilir
  /* Tek kelime ve nokta yoksa: arama */
  if (!/\s/.test(value) && !value.includes('.')) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
  }
  if (/\s/.test(value)) return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
  return `https://${value}`;
}

async function browserBounds() {
  const stage = $('[data-browser-stage]');
  if (!stage) return null;
  const r = stage.getBoundingClientRect();
  if (r.width < 80 || r.height < 80) return null;
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  };
}

function applyBrowserState(res) {
  const stage = $('[data-browser-stage]');
  const status = $('[data-field="browser-status"]');
  const titleEl = $('[data-field="browser-title"]');
  const progress = $('[data-browser-progress]');
  const errorBox = $('[data-browser-error]');
  const scheme = $('[data-field="browser-scheme"]');
  const zoomEl = $('[data-field="browser-zoom"]');
  const input = $('[data-field="browser-url"]');

  if (!res || !res.ok) {
    if (status) status.textContent = `hata: ${(res && res.error && res.error.message) || 'açılamadı'}`;
    toast((res && res.error && res.error.message) || 'Tarayıcı açılamadı.', 'danger');
    return;
  }

  const d = res.data || {};
  store.browser = { ...store.browser, ...d };

  if (stage) stage.dataset.open = String(Boolean(d.open));
  if (progress) progress.hidden = !d.loading;
  if (input && d.url) input.value = d.url;
  if (scheme) scheme.textContent = d.url && d.url.startsWith('https:') ? '🔒' : '🌐';
  if (zoomEl) zoomEl.textContent = `${Math.round((d.zoom || 1) * 100)}%`;

  for (const b of $$('[data-nav-state]')) {
    const key = b.dataset.navState;
    b.disabled = key === 'back' ? !d.canGoBack : !d.canGoForward;
  }

  if (errorBox) {
    if (d.error && d.error.message) {
      errorBox.hidden = false;
      errorBox.replaceChildren(
        el('div', { class: 'kv-browser__error-icon', text: '⚠' }),
        el('h3', { text: 'Sayfa açılamadı' }),
        el('p', { class: 'kv-muted', text: d.error.message }),
        el('p', { class: 'kv-muted kv-mono kv-browser__error-url', text: d.error.url || '' }),
        el('button', {
          class: 'kv-button kv-button--sm', type: 'button', text: 'Tekrar dene',
          onclick: () => browserNavigate({ action: 'reload' })
        })
      );
    } else {
      errorBox.hidden = true;
      errorBox.replaceChildren();
    }
  }

  if (titleEl) titleEl.textContent = d.title || '';
  if (status) {
    if (!d.open) status.textContent = 'kapalı';
    else if (d.loading) status.textContent = 'yükleniyor…';
    else status.textContent = d.url || 'hazır';
  }
}

async function openBrowser(url) {
  const bounds = await browserBounds();
  if (!bounds) { toast('Tarayıcı alanı görünmüyor.', 'warning'); return; }
  const progress = $('[data-browser-progress]');
  if (progress) progress.hidden = false;
  const res = await call(KV && KV.browser && KV.browser.open, { url, bounds });
  applyBrowserState(res);
}

async function browserNavigate(payload) {
  const bounds = payload && payload.bounds === null ? null : await browserBounds();
  const body = { ...(payload || {}) };
  if (bounds && body.bounds === undefined) body.bounds = bounds;
  if (body.bounds === null) delete body.bounds;
  const res = await call(KV && KV.browser && KV.browser.navigate, body);
  applyBrowserState(res);
}

async function browserGo() {
  const input = $('[data-field="browser-url"]');
  const raw = input ? input.value.trim() : '';
  const url = browserTarget(raw);
  if (!url) {
    toast('Yalnız http(s) adresleri açılabilir.', 'warning');
    return;
  }
  const state = await call(KV && KV.browser && KV.browser.state);
  const open = state.ok && state.data && state.data.open;
  if (!open) { await openBrowser(url); return; }
  await browserNavigate({ url });
}

async function closeBrowser() {
  await call(KV && KV.browser && KV.browser.close);
  const stage = $('[data-browser-stage]');
  if (stage) stage.dataset.open = 'false';
  const errorBox = $('[data-browser-error]');
  if (errorBox) errorBox.hidden = true;
  const status = $('[data-field="browser-status"]');
  if (status) status.textContent = 'kapalı';
  const titleEl = $('[data-field="browser-title"]');
  if (titleEl) titleEl.textContent = '';
}

async function browserZoom(delta) {
  const next = Math.min(3, Math.max(0.5, (store.browser.zoom || 1) + delta));
  await browserNavigate({ action: 'zoom', zoom: next });
}

/** Sayfa metnini ajana verilebilir halde göster (kopyalanabilir). */
async function browserExtract() {
  const res = await call(KV && KV.browser && KV.browser.extract, { limit: 20000 });
  if (!res.ok) {
    toast((res.error && res.error.message) || 'Sayfa okunamadı.', 'warning');
    return;
  }
  const d = res.data;
  const text = [
    `# ${d.title || '(başlık yok)'}`,
    d.url || '',
    '',
    d.text || ''
  ].join('\n');

  modal({
    title: 'Sayfa metni (ajana bağlam)',
    sub: `${(d.text || '').length} karakter${d.truncated ? ' · kırpıldı' : ''} · ${(d.links || []).length} bağlantı`,
    body: [
      el('div', { class: 'kv-row' }, [
        el('button', {
          class: 'kv-button kv-button--sm', type: 'button', text: 'Kopyala',
          onclick: () => copyText(text, 'Sayfa metni kopyalandı.')
        }),
        el('span', { class: 'kv-muted', text: d.title || '' })
      ]),
      el('pre', { class: 'kv-modal__preview kv-mono kv-modal__preview--tall', text: text.slice(0, 8000) })
    ],
    actions: [el('button', { class: 'kv-button', type: 'button', text: 'Kapat', onclick: closeModal })]
  });
}

/** Pencere/scroll değişince görünümü hizala (main prosesdeki gerçek dikdörtgen). */
let browserSyncTimer = null;
function scheduleBrowserSync() {
  if (store.screen !== 'browser') return;
  if (browserSyncTimer) clearTimeout(browserSyncTimer);
  browserSyncTimer = setTimeout(async () => {
    const state = await call(KV && KV.browser && KV.browser.state);
    if (!state.ok || !state.data || !state.data.open) return;
    const bounds = await browserBounds();
    if (!bounds) return;
    await call(KV && KV.browser && KV.browser.navigate, { bounds });
  }, 120);
}

/* --------------------------- UZAKTAN ERİŞİM (T5-4) --------------------------- */
async function refreshRemote() {
  const res = await call(KV && KV.remote && KV.remote.state);
  if (res.ok && res.data) {
    store.remote = res.data;
  }
  renderRemote();
}

function renderRemote() {
  const r = store.remote || {};
  const badge = $('[data-field="remote-badge"]');
  if (badge) {
    badge.textContent = r.running ? 'açık' : 'kapalı';
    badge.dataset.tone = r.running ? 'success' : 'idle';
  }
  const pair = $('[data-field="remote-pair"]');
  if (pair) pair.hidden = false;
  const tokenEl = $('[data-field="remote-token"]');
  if (tokenEl) tokenEl.textContent = r.token || '—';
  const urlEl = $('[data-field="remote-url"]');
  if (urlEl) urlEl.textContent = r.pairUrl || (r.urls && r.urls[0]) || '—';
  const running = $('[data-field="remote-running"]');
  if (running) running.textContent = r.running ? 'çalışıyor' : 'kapalı';
  const portEl = $('[data-field="remote-port"]');
  if (portEl) portEl.textContent = r.port ? String(r.port) : '—';
  const clients = $('[data-field="remote-clients"]');
  if (clients) clients.textContent = String(r.clients || 0);
  const requests = $('[data-field="remote-requests"]');
  if (requests) requests.textContent = String(r.requests || 0);

  const note = $('[data-field="remote-note"]');
  if (note) {
    note.textContent = r.running
      ? 'Telefon aynı ağdaysa bağlantıyı açabilir.'
      : (r.lastError ? `son hata: ${r.lastError}` : 'Başlatmadan telefon bağlanamaz.');
  }

  const addrs = $('[data-field="remote-addresses"]');
  if (addrs) {
    addrs.replaceChildren();
    if (!(r.addresses || []).length) {
      addrs.append(el('p', { class: 'kv-empty', text: 'Ağ adresi bulunamadı — Wi-Fi bağlı mı?' }));
    } else {
      const list = r.running ? (r.urls || []) : (r.addresses || []).map((a) => `http://${a}`);
      for (const u of list) {
        addrs.append(el('div', { class: 'kv-remote__addr' }, [
          el('span', { class: 'kv-mono', text: u }),
          el('button', {
            class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', text: '⧉', title: 'Kopyala',
            onclick: () => copyText(u, 'Adres kopyalandı.')
          })
        ]));
      }
    }
  }
}

async function remoteStart() {
  const res = await call(KV && KV.remote && KV.remote.start, { confirmToken: makeConfirmToken() });
  if (res.ok) {
    store.remote = res.data;
    renderRemote();
    notify('Uzaktan erişim açıldı', store.remote.pairUrl || '', 'success');
  } else {
    notify('Açılamadı', (res.error && res.error.message) || 'hata', 'danger');
  }
}

async function remoteStop() {
  const res = await call(KV && KV.remote && KV.remote.stop, { confirmToken: makeConfirmToken() });
  if (res.ok) { store.remote = res.data; renderRemote(); notify('Uzaktan erişim kapandı', 'port serbest', 'info'); }
  else notify('Kapatılamadı', (res.error && res.error.message) || 'hata', 'danger');
}

async function remoteRotate() {
  const res = await call(KV && KV.remote && KV.remote.rotate, { confirmToken: makeConfirmToken() });
  if (res.ok) {
    store.remote = res.data;
    renderRemote();
    toast('Eşleşme kodu yenilendi', 'success');
  } else {
    notify('Yenilenemedi', (res.error && res.error.message) || 'hata', 'danger');
  }
}

/** Pano yazımı: önce modern API, olmazsa gizli metin alanı (T-173). */
function copyViaTextarea(text) {
  try {
    const ta = el('textarea', { class: 'kv-copy-sink', 'aria-hidden': 'true', tabindex: '-1' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyText(text, message) {
  const value = String(text);
  try {
    await navigator.clipboard.writeText(value);
    toast(message || 'Kopyalandı', 'success');
    return;
  } catch { /* eski/yetkisiz ortam: aşağıdaki yedeğe düş */ }
  if (copyViaTextarea(value)) toast(message || 'Kopyalandı', 'success');
  else toast('Panoya kopyalanamadı.', 'warning');
}


/* ------------------------------- BECERİLER ----------------------------- */
function renderSkills() {
  const body = $('[data-skill-body]');
  if (!body) return;
  body.replaceChildren();
  const count = $('[data-field="skill-count"]');
  if (count) count.textContent = `${store.skills.filter((s) => s.enabled).length}/${store.skills.length} etkin`;

  if (!store.skills.length) {
    body.append(el('tr', {}, [el('td', { colspan: '5', class: 'kv-empty', text: 'Beceri yok.' })]));
    return;
  }
  for (const s of store.skills) {
    body.append(el('tr', {}, [
      el('td', {}, [
        el('div', { class: 'kv-skill__name', text: s.name }),
        el('div', { class: 'kv-skill__desc', text: (s.description || '').slice(0, 90) })
      ]),
      el('td', { class: 'kv-muted', text: (s.instructions || '').slice(0, 80) }),
      el('td', {}, [badge(s.scope === 'project' ? 'proje' : 'ekip', s.scope === 'project' ? 'idle' : 'info')]),
      el('td', {}, [
        el('button', {
          class: 'kv-toggle', type: 'button', 'aria-pressed': String(Boolean(s.enabled)),
          title: s.enabled ? 'Etkin' : 'Kapalı', 'data-skill-toggle': s.id, 'aria-label': `${s.name} durumu`
        })
      ]),
      el('td', {}, [
        el('div', { class: 'kv-table__actions' }, [
          el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Düzenle', 'data-skill-edit': s.id }),
          el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Sil', 'data-skill-remove': s.id })
        ])
      ])
    ]));
  }
}

async function refreshSkills() {
  const res = await call(KV && KV.skill && KV.skill.list);
  if (res.ok && res.data) store.skills = res.data.skills || [];
  renderSkills();
}

function openSkillEdit(existing) {
  const s = existing || { name: '', description: '', instructions: '', scope: 'team' };
  const name = el('input', { class: 'kv-input', value: s.name, 'data-field': 'skl-name' });
  const desc = el('input', { class: 'kv-input', value: s.description || '', 'data-field': 'skl-desc' });
  const inst = el('textarea', { class: 'kv-input kv-input--area', rows: '5', 'data-field': 'skl-inst' });
  inst.value = s.instructions || '';
  const scope = el('select', { class: 'kv-input', 'data-field': 'skl-scope' }, [
    el('option', { value: 'team', text: 'Ekip (tüm ajanlar)' }),
    el('option', { value: 'project', text: 'Yalnız bu proje' })
  ]);
  scope.value = s.scope || 'team';

  modal({
    title: existing ? 'Beceri düzenle' : 'Beceri ekle',
    sub: 'Beceri, ajanın bağlamına eklenen kalıcı bir yönergedir.',
    body: [
      el('div', { class: 'kv-field' }, [el('label', { text: 'Ad' }), name]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Kısa açıklama' }), desc]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Yönerge' }), inst]),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Kapsam' }), scope])
    ],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'Kaydet',
        onclick: async () => {
          if (!name.value.trim()) { toast('Ad gerekli.', 'warning'); return; }
          closeModal();
          const res = await call(KV && KV.skill && KV.skill.save, {
            id: existing ? existing.id : undefined,
            name: name.value.trim(),
            description: desc.value.trim(),
            instructions: inst.value,
            scope: scope.value,
            confirmToken: makeConfirmToken()
          });
          if (res.ok) { notify(existing ? 'Beceri güncellendi' : 'Beceri eklendi', name.value.trim(), 'success'); await refreshSkills(); }
          else notify('Beceri kaydedilemedi', (res.error && res.error.message) || 'hata', 'danger');
        }
      })
    ]
  });
}

async function toggleSkill(id) {
  const skill = store.skills.find((s) => s.id === id);
  if (!skill) return;
  const res = await call(KV && KV.skill && KV.skill.save, {
    id, enabled: !skill.enabled, confirmToken: makeConfirmToken()
  });
  if (res.ok) await refreshSkills();
  else notify('Değiştirilemedi', (res.error && res.error.message) || 'hata', 'danger');
}

/* T-186: beceri silme geri alınamaz — onay ister. */
function removeSkill(id) {
  const skill = (store.skills || []).find((s) => s.id === id);
  confirmDanger({
    title: 'Beceriyi sil',
    sub: 'Beceri tanımı silinir; ajanlara yeniden eklenene kadar kullanılamaz.',
    body: [el('p', { class: 'kv-modal__sub', text: `${(skill && skill.name) || id}` })],
    run: async () => {
      const res = await call(KV && KV.skill && KV.skill.remove, { id, confirmToken: makeConfirmToken() });
      if (res.ok) { notify('Beceri silindi', id, 'success'); await refreshSkills(); }
      else notify('Silinemedi', (res.error && res.error.message) || 'hata', 'danger');
    },
  });
}

/* ------------------------------- İZİNLER ------------------------------- */
function renderPermissions() {
  const head = $('[data-permission-head]');
  const body = $('[data-permission-body]');
  if (!head || !body) return;
  const caps = store.permissions.capabilities || [];
  const roles = store.permissions.roles || [];
  const matrix = store.permissions.matrix || {};

  const headRow = el('tr', {}, [el('th', { text: 'Rol' })]);
  for (const c of caps) {
    headRow.append(el('th', {}, [
      el('span', { text: c.label }),
      el('span', { class: 'kv-matrix__cap', text: c.risk })
    ]));
  }
  head.replaceChildren(headRow);

  body.replaceChildren();
  for (const role of roles) {
    const row = el('tr', {}, [el('td', { class: 'kv-matrix__role', text: role })]);
    for (const c of caps) {
      const value = Boolean(matrix[role] && matrix[role][c.id]);
      row.append(el('td', {}, [
        el('button', {
          class: 'kv-toggle', type: 'button', 'aria-pressed': String(value),
          'data-perm-role': role, 'data-perm-cap': c.id,
          'aria-label': `${role} · ${c.label}`
        })
      ]));
    }
    body.append(row);
  }

  const stateEl = $('[data-field="permission-state"]');
  if (stateEl) stateEl.textContent = store.permissions.stored ? 'kayıtlı' : 'varsayılan';
}

async function refreshPermissions() {
  const res = await call(KV && KV.permission && KV.permission.get);
  if (res.ok && res.data) store.permissions = res.data;
  renderPermissions();
}

async function togglePermission(role, capability) {
  const current = Boolean(store.permissions.matrix && store.permissions.matrix[role] && store.permissions.matrix[role][capability]);
  const res = await call(KV && KV.permission && KV.permission.set, {
    role, capability, value: !current, confirmToken: makeConfirmToken()
  });
  if (res.ok) {
    store.permissions = res.data;
    store.permissions.stored = true;
    renderPermissions();
  } else {
    notify('İzin kaydedilemedi', (res.error && res.error.message) || 'hata', 'danger');
  }
}

async function resetPermissions() {
  const matrix = {};
  for (const role of store.permissions.roles || []) {
    matrix[role] = {};
  }
  /* Varsayılana dönmek için depolanan dosyayı boş matrisle ezeriz:
     eksik hücreler servis tarafında varsayılana düşer. */
  const res = await call(KV && KV.permission && KV.permission.set, {
    matrix, confirmToken: makeConfirmToken()
  });
  if (res.ok) { await refreshPermissions(); toast('Varsayılana dönüldü', 'success'); }
}

/* --- T-198: Votion oturum yetkileri -------------------------------------
 * Oturum onayı modeli: yetenek bir kez onaylanır, uygulama kapanınca biter.
 * Onay çağrısı confirmToken taşır (main CONFIRM_ACTIONS içinde 'grant' var). */
function renderVotionGrants() {
  const host = $('[data-votion-grants]');
  if (!host) return;
  const caps = Array.isArray(store.votionGrants.capabilities) ? store.votionGrants.capabilities : [];
  if (!store.votionGrants.loaded) {
    host.replaceChildren(el('p', { class: 'kv-empty', text: 'Yetkiler yükleniyor…' }));
    return;
  }
  if (!caps.length) {
    host.replaceChildren(el('p', { class: 'kv-empty', text: 'Bu sürümde Votion yetkisi tanımlı değil.' }));
    return;
  }
  host.replaceChildren(...caps.map((c) => {
    const on = Boolean(c.granted);
    return el('div', { class: 'kv-perm-row', 'data-votion-cap': c.id, 'data-granted': on ? 'true' : 'false' }, [
      el('div', { class: 'kv-perm-row__main' }, [
        el('span', { class: 'kv-perm-row__title', text: String(c.label || c.id) }),
        el('span', { class: 'kv-badge', 'data-tone': on ? 'success' : 'idle', text: on ? 'açık' : 'kapalı' }),
        el('span', { class: 'kv-muted kv-mono', text: String(c.id) }),
        el('p', { class: 'kv-muted kv-perm-row__detail', text: String(c.detail || '') })
      ]),
      el('div', { class: 'kv-row' }, [
        on
          ? el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'votion-grant-revoke', 'data-capability': c.id, text: 'Kaldır' })
          : el('button', { class: 'kv-button kv-button--sm', type: 'button', 'data-action': 'votion-grant-ask', 'data-capability': c.id, text: 'Onayla' })
      ])
    ]);
  }));
  const state = $('[data-field="votion-grants-state"]');
  if (state) {
    const open = caps.filter((c) => c.granted).length;
    state.textContent = open ? `${open}/${caps.length} açık` : 'kapalı';
  }
}

async function refreshVotionGrants() {
  if (!KV || !KV.votion || !KV.votion.act) { store.votionGrants.loaded = true; renderVotionGrants(); return; }
  const res = await call(KV.votion.act, { action: 'grants' });
  if (res.ok && res.data && Array.isArray(res.data.capabilities)) {
    store.votionGrants = { capabilities: res.data.capabilities, loaded: true };
  } else {
    store.votionGrants.loaded = true;
  }
  renderVotionGrants();
}

/** Onay iste: ne açılacağını ve sınırını açıkça yazar. */
function askVotionGrant(capability) {
  const cap = store.votionGrants.capabilities.find((c) => c.id === capability);
  if (!cap) return;
  confirmDanger({
    title: `Votion'a yetki ver: ${cap.label}`,
    sub: 'Oturum onayı — uygulama kapanınca kendiliğinden kalkar.',
    body: [
      el('p', { class: 'kv-muted', text: String(cap.detail || '') }),
      el('p', { class: 'kv-muted', text: 'Her kullanım denetim kaydına yazılır; istediğin an "Kaldır" ile kesebilirsin.' })
    ],
    confirmLabel: 'Oturum için onayla',
    run: async () => {
      const res = await call(KV.votion.act, {
        action: 'grant', capability, confirmToken: makeConfirmToken()
      });
      if (res.ok && res.data && Array.isArray(res.data.capabilities)) {
        store.votionGrants = { capabilities: res.data.capabilities, loaded: true };
        renderVotionGrants();
        toast(`${cap.label} bu oturum için açıldı.`, 'success');
      } else {
        notify('Yetki açılamadı', (res.error && res.error.message) || 'hata', 'danger');
      }
    }
  });
}

async function revokeVotionGrant(capability) {
  const res = await call(KV.votion.act, { action: 'revokeGrant', capability });
  if (res.ok && res.data && Array.isArray(res.data.capabilities)) {
    store.votionGrants = { capabilities: res.data.capabilities, loaded: true };
    renderVotionGrants();
  }
}

async function revokeAllVotionGrants() {
  const open = (store.votionGrants.capabilities || []).filter((c) => c.granted);
  for (const c of open) {
    await call(KV.votion.act, { action: 'revokeGrant', capability: c.id });
  }
  await refreshVotionGrants();
  toast(open.length ? `${open.length} yetki kaldırıldı.` : 'Açık yetki yok.', 'info');
}

/* -------------------------- kişiselleştirme ---------------------------- */
const THEMES = ['dark', 'light', 'midnight', 'forest', 'sunset', 'mono'];
/* T-199/T-201: tasarım dilleri. 'classic' = mevcut görünüm,
   'volt' ve 'prototip' = birbirinden bağımsız alternatif prototipler. */
const DESIGNS = ['classic', 'volt', 'prototip'];

function applyPrefsTur4() {
  const root = document.documentElement;
  root.dataset.theme = THEMES.includes(store.prefs.theme) ? store.prefs.theme : 'dark';
  root.dataset.density = store.prefs.density;
  root.dataset.font = store.prefs.font || 'sistem';
  root.dataset.size = store.prefs.size || 'normal';
  root.dataset.radius = store.prefs.radius || 'normal';
  for (const b of $$('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === store.prefs.theme));
  for (const b of $$('[data-density-set]')) b.setAttribute('aria-pressed', String(b.dataset.densitySet === store.prefs.density));
  for (const b of $$('[data-size-set]')) b.setAttribute('aria-pressed', String(b.dataset.sizeSet === (store.prefs.size || 'normal')));
  for (const b of $$('[data-radius-set]')) b.setAttribute('aria-pressed', String(b.dataset.radiusSet === (store.prefs.radius || 'normal')));
  const fam = $('[data-field="font-family"]');
  if (fam) fam.value = store.prefs.font || 'sistem';
}

function bindTur4() {
  document.addEventListener('change', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.field === 'local-access') {
      setLocalAccess(Boolean(e.target.checked));
    }
  });
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-chat-pick]');
    if (pick) { openChat(pick.dataset.chatPick); return; }

    const quick = e.target.closest('[data-browse-quick]');
    if (quick) {
      const target = { example: 'https://example.com', search: 'https://duckduckgo.com', code: 'https://github.com' }[quick.dataset.browseQuick];
      const input = $('[data-field="browser-url"]');
      if (input && target) input.value = target;
      if (target) browserGo();
      return;
    }

    const jump = e.target.closest('[data-settings-jump]');
    if (jump) {
      /* Arama etkinken hedef bölüm gizli olabilir: önce aramayı temizle. */
      const search = $('[data-field="settings-search"]');
      if (search && search.value) { search.value = ''; applySettingsFilter(''); }
      const panel = document.querySelector(`[data-settings-section="${jump.dataset.settingsJump}"]`);
      if (panel) {
        panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
        panel.classList.add('kv-settings__flash');
        setTimeout(() => panel.classList.remove('kv-settings__flash'), 900);
      }
      return;
    }

    const memPick = e.target.closest('[data-memory-pick]');
    if (memPick) {
      store.memory.selected = memPick.dataset.memoryPick;
      renderMemory();
      return;
    }

    const memScope = e.target.closest('[data-memory-scope]');
    if (memScope) {
      store.memory.scope = memScope.dataset.memoryScope || '';
      for (const b of $$('[data-memory-scope]')) b.setAttribute('aria-pressed', String(b.dataset.memoryScope === store.memory.scope));
      refreshMemory();
      return;
    }

    const projSwitch = e.target.closest('[data-project-switch]');
    if (projSwitch) { switchProject(projSwitch.dataset.projectSwitch); return; }
    const projArchive = e.target.closest('[data-project-archive]');
    if (projArchive) { archiveProject(projArchive.dataset.projectArchive); return; }

    const keyAdd = e.target.closest('[data-key-add]');
    if (keyAdd) { openKeyAdd(keyAdd.dataset.keyAdd); return; }
    const keyRemove = e.target.closest('[data-key-remove]');
    if (keyRemove) { removeKey(keyRemove.dataset.provider, keyRemove.dataset.keyRemove); return; }
    const provTest = e.target.closest('[data-provider-test]');
    if (provTest) { testProvider(provTest.dataset.providerTest); return; }

    const skillToggle = e.target.closest('[data-skill-toggle]');
    if (skillToggle) { toggleSkill(skillToggle.dataset.skillToggle); return; }
    const skillEdit = e.target.closest('[data-skill-edit]');
    if (skillEdit) {
      openSkillEdit(store.skills.find((s) => s.id === skillEdit.dataset.skillEdit));
      return;
    }
    const skillRemove = e.target.closest('[data-skill-remove]');
    if (skillRemove) { removeSkill(skillRemove.dataset.skillRemove); return; }

    const perm = e.target.closest('[data-perm-role]');
    if (perm) { togglePermission(perm.dataset.permRole, perm.dataset.permCap); return; }

    const theme = e.target.closest('[data-theme-set]');
    if (theme) { store.prefs.theme = theme.dataset.themeSet; savePrefs(); applyPrefsTur4(); return; }
    const size = e.target.closest('[data-size-set]');
    if (size) { store.prefs.size = size.dataset.sizeSet; savePrefs(); applyPrefsTur4(); return; }
    const radius = e.target.closest('[data-radius-set]');
    if (radius) { store.prefs.radius = radius.dataset.radiusSet; savePrefs(); applyPrefsTur4(); return; }
    /* T-206: hareket tercihi (erişilebilirlik / düşük donanım). */
    const motionSet = e.target.closest('[data-motion-set]');
    if (motionSet) { store.prefs.motion = motionSet.dataset.motionSet; savePrefs(); applyPrefsTur4(); return; }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    switch (actionEl.dataset.action) {
      case 'chat-send': sendChat(); break;
    case 'chat-jump-bottom': {
      /* T-189: okuma yerinden tek tıkla en alta dön (klavye odağı korunur). */
      const th = $('[data-chat-thread]');
      const hadFocus = document.activeElement === actionEl;
      if (th) {
        th.scrollTop = th.scrollHeight;
        chatStick = false;
      }
      updateChatJump();
      if (hadFocus) {
        const box = $('[data-field="chat-text"]');
        if (box) box.focus();
      }
      break;
    }
      case 'chat-retry': {
        const idx = Number(actionEl.dataset.index);
        const msg = store.chat.messages[idx];
        const ta = $('[data-field="chat-text"]');
        if (!msg || !msg.retryText || !ta) { toast('Tekrar denenecek mesaj bulunamadı.', 'warning'); break; }
        /* Aynı mesajı iki kez göstermemek için hata balonu ve ondan önceki
           kullanıcı balonu kaldırılır; sendChat yeniden ekler. */
        store.chat.messages.splice(idx, 1);
        for (let i = store.chat.messages.length - 1; i >= 0; i -= 1) {
          const m = store.chat.messages[i];
          if (m.role === 'user' && m.content === msg.retryText) { store.chat.messages.splice(i, 1); break; }
        }
        renderChatThread();
        ta.value = msg.retryText;
        sendChat();
        break;
      }
      case 'chat-copy-md': chatCopyMarkdown(); break;
      case 'chat-new': newChat(); break;
      case 'chat-rename': chatRename(); break;
      case 'chat-delete': chatDelete(); break;
      case 'chat-preview': chatPreview(); break;
      case 'memory-add': openMemoryAdd(); break;
      case 'memory-refresh': refreshMemory(); break;
      case 'memory-copy-context': showMemoryContext(); break;
      case 'project-new': openProjectNew(); break;
      case 'project-refresh': refreshProjects(); break;
      case 'provider-new': openProviderNew(); break;
      case 'provider-refresh': refreshProviders(); break;
      case 'permission-reset': resetPermissions(); break;
      /* T-198: Votion oturum yetkileri */
      case 'votion-grant-ask': askVotionGrant(actionEl.dataset.capability || ''); break;
      case 'votion-grant-revoke': revokeVotionGrant(actionEl.dataset.capability || ''); break;
      case 'votion-grants-revoke-all': revokeAllVotionGrants(); break;
      case 'skill-add': openSkillEdit(null); break;
      case 'browser-back': browserNavigate({ action: 'back' }); break;
      case 'browser-forward': browserNavigate({ action: 'forward' }); break;
      case 'browser-reload': browserNavigate({ action: 'reload' }); break;
      case 'browser-close': closeBrowser(); break;
      case 'browser-extract': browserExtract(); break;
      case 'browser-zoom-in': browserZoom(0.1); break;
      case 'browser-zoom-out': browserZoom(-0.1); break;
      case 'remote-start': remoteStart(); break;
      case 'remote-stop': remoteStop(); break;
      case 'remote-rotate': remoteRotate(); break;
      case 'remote-copy-token': copyText(store.remote.token || '', 'Eşleşme kodu kopyalandı.'); break;
      case 'remote-copy-url': copyText(store.remote.pairUrl || '', 'Bağlantı kopyalandı.'); break;
      default: break;
    }
  }, true);

  /* --- sohbet yazma alanı --- */
  const chatTa = $('[data-field="chat-text"]');
  if (chatTa) {
    chatTa.addEventListener('input', updateChatCounter);
    let draftTimer = null;
    chatTa.addEventListener('input', () => {
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => saveChatDraft(chatTa.value), 300);
    });
    chatTa.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
  }

  /* --- ayarlarda arama (T-176) --- */
  const settingsSearch = $('[data-field="settings-search"]');
  if (settingsSearch) {
    settingsSearch.addEventListener('input', () => applySettingsFilter(settingsSearch.value));
    settingsSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settingsSearch.value = '';
        applySettingsFilter('');
        settingsSearch.blur();
      }
    });
  }

  /* T-189: kullanıcı sohbeti kaydırdıkça "En alta in" düğmesi görünür/gizlenir. */
  const chatThreadEl = $('[data-chat-thread]');
  if (chatThreadEl) chatThreadEl.addEventListener('scroll', () => { updateChatJump(); }, { passive: true });

  const chatSearch = $('[data-field="chat-search"]');
  if (chatSearch) {
    let t = null;
    chatSearch.addEventListener('input', () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { store.chat.q = chatSearch.value.trim(); renderChat(); }, 160);
    });
  }

  const chatSort = $('[data-field="chat-sort"]');
  if (chatSort) {
    chatSort.addEventListener('change', () => {
      store.chat.sort = chatSort.value;
      renderChat();
    });
  }

  const chatRole = $('[data-field="chat-role"]');
  if (chatRole) {
    chatRole.addEventListener('change', () => {
      store.chat.role = chatRole.value;
      renderChat();
    });
  }

  const chatModel = $('[data-field="chat-model"]');
  if (chatModel) {
    chatModel.addEventListener('change', () => {
      const [providerId, ...rest] = String(chatModel.value || '').split('::');
      store.chat.providerId = providerId || '';
      store.chat.model = rest.join('::');
      renderChat();
    });
  }

  const memFilter = $('[data-field="memory-filter"]');
  if (memFilter) {
    let t = null;
    memFilter.addEventListener('input', () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { store.memory.q = memFilter.value.trim(); refreshMemory(); }, 250);
    });
  }

  const fam = $('[data-field="font-family"]');
  if (fam) fam.addEventListener('change', () => { store.prefs.font = fam.value; savePrefs(); applyPrefsTur4(); });

  const browserForm = $('[data-browser-form]');
  if (browserForm) browserForm.addEventListener('submit', (e) => { e.preventDefault(); browserGo(); });

  window.addEventListener('resize', scheduleBrowserSync);
  document.addEventListener('scroll', scheduleBrowserSync, true);
}

/* =======================================================================
 * TUR 11 (T-108) — YÖNETİM MERKEZİ (admin, §14 B1–B8)
 * Veri: KV.models.list/dir/install/cancel/verify/remove · KV.audit.list ·
 *       KV.app.info · KV.server.status · KV.provider.list/test ·
 *       KV.files.list (yalnız okuma) · push kv:event:model (§7.5).
 * Yazma (install/cancel/remove/server) onay kapısıyla: confirmToken zorunlu.
 * ======================================================================= */

const MODEL_STATE_TR = {
  absent: 'Yok', queued: 'Kuyrukta', downloading: 'İndiriliyor', verifying: 'Doğrulanıyor',
  ready: 'Hazır', failed: 'Başarısız', paused: 'Duraklatıldı', cancelled: 'İptal edildi'
};
const MODEL_STATE_TONE = {
  absent: 'offline', queued: 'idle', downloading: 'busy', verifying: 'busy',
  ready: 'success', failed: 'error', paused: 'warning', cancelled: 'warning'
};
const ADMIN_ACTIVE_JOB_STATES = new Set(['queued', 'downloading', 'verifying']);

function fmtBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${u === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/** UI-138: kalan süre — `etaSec:null` → "hesaplanıyor", uydurma süre yok. */
function etaText(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return 'hesaplanıyor';
  const s = Math.max(0, Math.round(Number(sec)));
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk ${s % 60} sn`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

function setAdminField(name, value) {
  const node = $(`[data-field="${name}"]`);
  if (node) node.textContent = value;
}

/* ---------------- B2 ilerleme push'u (kv:event:model) ---------------- */

let adminProgressOff = null;

function bindAdminProgress() {
  if (adminProgressOff) return;
  if (!(KV && KV.events && typeof KV.events.onModelProgress === 'function')) return;
  adminProgressOff = KV.events.onModelProgress((packet) => {
    if (!packet || typeof packet !== 'object') return;
    if (packet.jobId) store.admin.progress.set(packet.jobId, packet);
    renderAdminProgress(packet);
  });
}

/** Ekran değişince abonelik kapanır — dönen removeListener çağrılır (sızıntı yok). */
function unbindAdminProgress() {
  if (!adminProgressOff) return;
  try { adminProgressOff(); } catch { /* köprü koptuysa */ }
  adminProgressOff = null;
}

/** Tek kartın çubuğunu yeniden çizmeden güncelle (anahtar: data-model-job). */
function renderAdminProgress(packet) {
  const card = $(`[data-model-job="${CSS.escape(String(packet.jobId || ''))}"]`);
  if (!card) return;
  const bar = $('[data-admin-progress]', card);
  const eta = $('[data-field="admin-eta"]', card);
  const pct = $('[data-admin-progress-text]', card);
  const percent = Math.max(0, Math.min(100, Math.round(Number(packet.percent) || 0)));
  if (bar) {
    bar.setAttribute('aria-valuenow', String(percent));
    const fill = $('.kv-progress-fill', bar);
    /* UI-06 istisnası: JS yalnız CSS değişkenini sayısal set eder. */
    if (fill) fill.style.setProperty('--kv-value', `${percent}%`);
  }
  if (pct) pct.textContent = `%${percent} · ${fmtBytes(packet.receivedBytes)} / ${fmtBytes(packet.totalBytes)}`;
  if (eta) eta.textContent = `kalan: ${etaText(packet.etaSec)}`;
  const stateBadge = $('[data-admin-model-state]', card);
  if (stateBadge && packet.state && MODEL_STATE_TR[packet.state]) {
    stateBadge.textContent = MODEL_STATE_TR[packet.state];
    stateBadge.dataset.tone = MODEL_STATE_TONE[packet.state] || 'info';
  }
}

/* ---------------- çizim ---------------- */

function renderAdmin() {
  renderAdminAgents();
  renderAdminModels();
  renderAdminDisk();
  renderAdminHealth();
  renderAdminAbout();
  renderAdminAudit();
  renderAdminBackups();
}

/** B1: ekip ve ajan durumu — satır: kod, rol, durum, model, token, eylem. */
function renderAdminAgents() {
  const zone = $('[data-admin-agents]');
  if (!zone) return;
  zone.replaceChildren();
  const rows = store.sessions.filter((s) => s.sessionId || s.code);
  setAdminField('admin-agent-count', String(rows.length));
  if (!rows.length) {
    const empty = el('p', { class: 'kv-empty', text: 'Kadro boş.' });
    const add = el('button', { class: 'kv-button kv-button--sm', type: 'button', 'data-action': 'admin-team-add', text: '＋ Ajan ekle' });
    zone.append(el('div', { class: 'kv-stack kv-stack--tight' }, [empty, add]));
    return;
  }
  for (const s of rows) {
    const tone = TONES.has(s.state) ? s.state : 'idle';
    zone.append(el('div', { class: 'kv-agent-row' }, [
      el('span', { class: 'kv-mono', text: s.code || '—' }),
      el('span', { text: s.role || '—' }),
      el('span', {}, [badge(STATE_TR[s.state] || s.state || 'Boşta', tone)]),
      el('span', { class: 'kv-muted', text: s.model || '—' }),
      el('span', { class: 'kv-mono kv-tabular', text: (tokenCount(s) || 0).toLocaleString('tr-TR') }),
      el('span', { class: 'kv-row' }, [
        el('button', { class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', 'data-action': 'admin-send', 'data-session': s.sessionId || '', 'data-role-code': s.code || '', title: 'Komut gönder', text: '➤' }),
        el('button', { class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', 'data-action': 'admin-assign-model', 'data-session': s.sessionId || '', 'data-role-code': s.code || '', title: 'Model ata', text: '◇' }),
        el('button', { class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', 'data-action': 'admin-set-leader', 'data-session': s.sessionId || '', 'data-role-code': s.code || '', title: 'Lider yap', text: '★' }),
        el('button', { class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', 'data-action': 'admin-team-remove', 'data-session': s.sessionId || '', 'data-role-code': s.code || '', title: 'Kadrodan çıkar', text: '✕' }),
      ]),
    ]));
  }
}

/** B2: yerel model kartları — durum sözlüğü §7.5, ilerleme erişilebilir (C14). */
function renderAdminModels() {
  const zone = $('[data-admin-models]');
  if (!zone) return;
  const inv = store.admin.inventory;
  const models = (inv && Array.isArray(inv.models)) ? inv.models : [];
  const jobs = (inv && Array.isArray(inv.jobs)) ? inv.jobs : [];
  const jobOf = new Map();
  for (const j of jobs) if (j.modelID && !jobOf.has(j.modelID)) jobOf.set(j.modelID, j);

  setAdminField('admin-model-total', String(models.length));
  setAdminField('admin-model-ready', String(models.filter((m) => m.state === 'ready').length));
  setAdminField('admin-model-active', String(jobs.filter((j) => ADMIN_ACTIVE_JOB_STATES.has(j.state)).length));

  zone.replaceChildren();
  if (!models.length) {
    zone.append(el('p', { class: 'kv-empty', text: 'Yerel model yok.' }));
    return;
  }
  for (const m of models) {
    const job = jobOf.get(m.modelID) || null;
    const last = job && job.jobId ? store.admin.progress.get(job.jobId) : null;
    const card = el('div', { class: 'kv-model-card', 'data-model-job': job ? String(job.jobId) : '' });

    const stateBadge = badge(MODEL_STATE_TR[m.state] || m.state, MODEL_STATE_TONE[m.state] || 'info');
    stateBadge.setAttribute('data-admin-model-state', '');
    card.append(el('div', { class: 'kv-model-card__header' }, [
      el('span', { class: 'kv-model-name', text: m.name || m.modelID }),
      stateBadge,
    ]));
    card.append(el('div', { class: 'kv-muted kv-mono', text: `${m.modelID} · ${fmtBytes(m.sizeBytes)}${m.sha256 ? ' · sha256 ✓' : ''}` }));
    if (m.targetDir) card.append(el('div', { class: 'kv-muted kv-mono', text: m.targetDir }));

    if (job) {
      const percent = Math.max(0, Math.min(100, Math.round(Number(last && last.percent != null ? last.percent : job.percent) || 0)));
      const eta = last && last.etaSec !== undefined ? last.etaSec : job.etaSec;
      const bar = el('div', { class: 'kv-progress-bar', 'data-admin-progress': '', role: 'progressbar', 'aria-valuenow': String(percent), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': `İndirme ilerlemesi: ${m.modelID}` }, [
        el('div', { class: 'kv-progress-fill' }),
      ]);
      const fill = bar.querySelector('.kv-progress-fill');
      /* UI-06 istisnası: JS yalnız CSS değişkenini sayısal set eder. */
      if (fill) fill.style.setProperty('--kv-value', `${percent}%`);
      card.append(bar);
      card.append(el('div', { class: 'kv-row kv-muted kv-mono kv-tabular' }, [
        el('span', { 'data-field': 'admin-eta', text: `kalan: ${etaText(eta)}` }),
        el('span', { 'data-admin-progress-text': '', text: `%${percent} · ${fmtBytes(job.receivedBytes)} / ${fmtBytes(job.totalBytes)}` }),
      ]));
    }
    if (m.state === 'ready') {
      card.append(el('span', { class: 'kv-badge', 'data-tone': m.verified ? 'success' : 'warning', text: m.verified ? 'doğrulandı' : 'doğrulanmadı' }));
    }
    if (job && job.error) {
      card.append(el('p', { class: 'kv-muted', text: `Son hata: ${job.error}` }));
    }

    const actions = el('div', { class: 'kv-row' });
    if (['absent', 'failed', 'paused'].includes(m.state)) {
      actions.append(el('button', { class: 'kv-button kv-button--sm', type: 'button', 'data-action': 'admin-model-install', 'data-model': m.modelID, text: 'Kur' }));
    }
    if (job && ADMIN_ACTIVE_JOB_STATES.has(job.state)) {
      actions.append(el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'admin-model-cancel', 'data-model': m.modelID, 'data-job': String(job.jobId), text: 'İptal' }));
    }
    if (m.state === 'ready') {
      actions.append(el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'admin-model-verify', 'data-model': m.modelID, text: 'Doğrula' }));
      actions.append(el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'admin-model-remove', 'data-model': m.modelID, text: 'Kaldır' }));
    }
    if (actions.childElementCount) card.append(actions);
    zone.append(card);
  }
}

/** B4: disk — boş/toplam çubuğu + kök listesi; gereksinim (sizeBytes × 1.2) main'de. */
function renderAdminDisk() {
  const zone = $('[data-admin-disk]');
  if (!zone) return;
  const inv = store.admin.inventory;
  const disk = inv && inv.disk ? inv.disk : null;
  const roots = inv && Array.isArray(inv.roots) ? inv.roots : [];
  zone.replaceChildren();
  if (!disk || (disk.freeBytes == null && disk.totalBytes == null)) {
    zone.append(el('p', { class: 'kv-empty', text: 'Disk ölçümü yok.' }));
  } else {
    const used = disk.totalBytes != null && disk.freeBytes != null ? disk.totalBytes - disk.freeBytes : null;
    const pct = used != null && disk.totalBytes ? Math.min(100, Math.round((used / disk.totalBytes) * 100)) : 0;
    const bar = el('div', { class: 'kv-disk-bar', 'data-field': 'admin-disk-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Disk doluluk' }, [
      el('div', { class: 'kv-disk-fill' }),
    ]);
    const fill = bar.querySelector('.kv-disk-fill');
    /* UI-06 istisnası: JS yalnız CSS değişkenini sayısal set eder. */
    if (fill) fill.style.setProperty('--kv-value', `${pct}%`);
    zone.append(el('div', { class: 'kv-row kv-mono kv-tabular' }, [
      el('span', { text: `boş ${fmtBytes(disk.freeBytes)}` }),
      el('span', { class: 'kv-muted', text: `toplam ${fmtBytes(disk.totalBytes)} · %${pct} dolu` }),
    ]));
    zone.append(bar);
    setAdminField('admin-disk-free', fmtBytes(disk.freeBytes));
    setAdminField('admin-disk-total', fmtBytes(disk.totalBytes));
  }
  if (store.admin.targetDir) {
    zone.append(el('p', { class: 'kv-muted kv-mono', text: `hedef: ${store.admin.targetDir}` }));
  }
  if (roots.length) {
    const list = el('div', { class: 'kv-stack kv-stack--tight' });
    for (const r of roots) {
      list.append(el('div', { class: 'kv-row kv-mono' }, [
        el('span', { class: 'kv-muted', text: r.path }),
        badge(r.exists ? (r.writable ? 'yazılabilir' : 'salt okuma') : 'yok', r.exists ? (r.writable ? 'success' : 'warning') : 'offline'),
      ]));
    }
    zone.append(list);
  }
}

/** B3: kanal/sağlayıcı/sunucu sağlığı — sayılar kv:app:info'dan, sabit yazılmaz. */
function renderAdminHealth() {
  const zone = $('[data-admin-health]');
  if (!zone) return;
  const info = store.admin.info;
  const contract = info && info.contract ? info.contract : null;
  setAdminField('admin-channel-count', contract ? String(contract.channels) : '—');
  setAdminField('admin-write-count', contract ? String(contract.writeChannels) : '—');
  setAdminField('admin-api-version', contract ? String(contract.apiVersion) : '—');
  const server = store.admin.server;
  setAdminField('admin-server-state', server ? (server.running ? (server.mode === 'ours' ? 'çalışıyor' : 'dış') : 'durdu') : '—');
  /* Ölçüm gelmediyse gösterge ikaz tonu taşır; uydurma sayı yazılmaz. */
  for (const box of zone.querySelectorAll('.kv-metric-box')) {
    const val = $('.kv-metric-val', box);
    if (val) val.dataset.tone = val.textContent === '—' ? 'warning' : 'success';
  }
}

/** B5: sürüm satırı — ekran/stylesheet sayıları DOM'dan ÖLÇÜLÜR, elle yazılmaz. */
function renderAdminAbout() {
  const info = store.admin.info;
  setAdminField('admin-app-version', info && info.appVersion ? String(info.appVersion) : '—');
  setAdminField('admin-schema-version', info && info.schemaVersion ? String(info.schemaVersion) : '—');
  setAdminField('admin-contract-version', info && info.contract ? String(info.contract.apiVersion) : '—');
  setAdminField('admin-screen-count', String($$('[data-screen]').length));
  setAdminField('admin-style-count', String($$('link[rel="stylesheet"]').length));
}

/** B6: denetim ÖZETİ — son 20 kayıt + tam görünüme bağlantı (§14.2, UI-145). */
function renderAdminAudit() {
  const zone = $('[data-admin-audit-summary]');
  if (!zone) return;
  const a = store.admin.audit;
  setAdminField('admin-audit-count', String(a.total));
  const rows = a.entries.slice(0, 20);
  zone.replaceChildren();
  if (!rows.length) {
    zone.append(el('p', { class: 'kv-empty', text: 'Denetim kaydı yok.' }));
    return;
  }
  for (const e of rows) {
    zone.append(el('div', { class: 'kv-audit-row' }, [
      el('span', { class: 'kv-mono', text: String(e.at || '').slice(11, 19) || '—' }),
      el('span', { text: String(e.op || '—') }),
      el('span', { class: 'kv-mono', text: String(e.code || '—') }),
      el('span', { class: 'kv-muted', text: String(e.target || '—') })
    ]));
  }
}

/** B8: yedek durumu — yalnız okuma; 24 saatten eski yedek warning rozeti taşır. */
function renderAdminBackups() {
  const zone = $('[data-admin-backups]');
  if (!zone) return;
  const b = store.admin.backups;
  zone.replaceChildren();
  if (!b.entries.length) {
    zone.append(el('p', { class: 'kv-empty', text: 'Yedek kaydı yok (work/backups).' }));
  } else {
    zone.append(el('div', { class: 'kv-audit-row kv-audit-header' }, [
      el('span', { text: 'ad' }), el('span', { text: 'boyut' }), el('span', { text: 'değişiklik' }), el('span', { text: 'yaş' }), el('span', { text: 'durum' }),
    ]));
    for (const entry of b.entries.slice(0, 30)) {
      const ageMs = entry.modifiedAt ? Date.now() - Date.parse(entry.modifiedAt) : NaN;
      const ageH = Number.isFinite(ageMs) ? Math.floor(ageMs / 3600000) : null;
      zone.append(el('div', { class: 'kv-audit-row' }, [
        el('span', { class: 'kv-mono', text: entry.name || '—' }),
        el('span', { class: 'kv-mono kv-tabular', text: fmtBytes(entry.size) }),
        el('span', { class: 'kv-muted kv-mono', text: entry.modifiedAt ? String(entry.modifiedAt).slice(0, 16).replace('T', ' ') : '—' }),
        el('span', { text: ageH != null ? `${ageH} sa` : '—' }),
        el('span', {}, [ageH != null && ageH > 24 ? badge('eski', 'warning') : badge('güncel', 'success')]),
      ]));
    }
  }
  const lastAt = b.lastAt;
  setAdminField('admin-backup-last', lastAt ? String(lastAt).slice(0, 16).replace('T', ' ') : '—');
  const ageEl = $('[data-field="admin-backup-age"]');
  if (ageEl) {
    const ageMs = lastAt ? Date.now() - Date.parse(lastAt) : NaN;
    const ageH = Number.isFinite(ageMs) ? Math.floor(ageMs / 3600000) : null;
    ageEl.textContent = ageH != null ? `son yedek yaşı: ${ageH} sa` : 'yedek yok';
    ageEl.dataset.tone = ageH == null || ageH > 24 ? 'warning' : 'success';
  }
}

/* ---------------- veri çekme ---------------- */

async function refreshAdmin() {
  await Promise.all([refreshAdminModels(), refreshAdminInfo(), refreshAdminAudit(), refreshAdminBackups()]);
  renderAdmin();
}

async function refreshAdminModels() {
  const res = await call(KV && KV.models && KV.models.list, {});
  if (res.ok && res.data) {
    store.admin.inventory = res.data;
  } else if (!store.admin.inventory) {
    store.admin.inventory = { models: [], jobs: [], roots: [], disk: null, runtime: { kind: 'none' } };
  }
  if (store.screen === 'admin') { renderAdminModels(); renderAdminDisk(); }
  return res;
}

async function refreshAdminInfo() {
  const res = await call(KV && KV.app && KV.app.info);
  store.admin.info = res.ok && res.data ? res.data : null;
  const st = await call(KV && KV.server && KV.server.status);
  store.admin.server = st.ok && st.data ? st.data : null;
  if (store.screen === 'admin') { renderAdminHealth(); renderAdminAbout(); }
  return res;
}

async function refreshAdminAudit() {
  /* §14.2: B6 yalnız özet — filtre yok, limit sabit 20. */
  const res = await call(KV && KV.audit && KV.audit.list, { limit: 20 });
  if (res.ok && res.data && Array.isArray(res.data.entries)) {
    store.admin.audit = {
      ...store.admin.audit,
      entries: res.data.entries,
      total: Number(res.data.total) || res.data.entries.length,
      truncated: Boolean(res.data.truncated)
    };
  }
  if (store.screen === 'admin') renderAdminAudit();
  return res;
}

async function refreshAdminBackups() {
  const res = await call(KV && KV.files && KV.files.list, { path: 'work/backups', limit: 100 });
  const entries = res.ok && res.data && Array.isArray(res.data.entries) ? res.data.entries : [];
  const times = entries.map((e) => Date.parse(e.modifiedAt || '')).filter((t) => Number.isFinite(t));
  store.admin.backups = { entries, lastAt: times.length ? new Date(Math.max(...times)).toISOString() : null };
  if (store.screen === 'admin') renderAdminBackups();
  return res;
}

/* ---------------- eylemler ---------------- */

/** B2/B4: hedef klasör seç (tek native diyalog noktası main'de). */
async function adminPickDir(purpose) {
  const res = await call(KV && KV.models && KV.models.dir, { purpose });
  if (res.ok && res.data && res.data.path) {
    store.admin.targetDir = res.data.path;
    toast(`Hedef klasör: ${res.data.path}`, 'success');
    renderAdminDisk();
    return res.data.path;
  }
  if (res.ok) toast('Klasör seçimi iptal edildi.', 'info');
  else toast(`Klasör sorulamadı: ${(res.error && res.error.message) || 'hata'}`, 'warning');
  return null;
}

/** B2: kur — hedef yoksa önce sor; onay anahtarı çağrıyla gider (API-51f). */
async function adminModelInstall(modelID) {
  if (!modelID) return;
  let targetDir = store.admin.targetDir;
  if (!targetDir) {
    const picked = await adminPickDir('install');
    if (!picked) return;
    targetDir = picked;
  }
  const res = await call(KV && KV.models && KV.models.install, { modelID, targetDir, confirmToken: makeConfirmToken() });
  if (res.ok) {
    toast(`Kurulum kuyruğa alındı: ${modelID}`, 'success');
    if (res.data && res.data.jobId) store.admin.progress.set(res.data.jobId, { jobId: res.data.jobId, state: res.data.state || 'queued', percent: 0 });
  } else {
    toast(`Kurulum başlamadı: ${errText(res)}`, 'warning');
  }
  await refreshAdminModels();
}

/** B2: iptal — duraklatılabilir indirme; .part korunur. */
async function adminModelCancel(jobId) {
  if (!jobId) return;
  const res = await call(KV && KV.models && KV.models.cancel, { jobId, confirmToken: makeConfirmToken() });
  toast(res.ok ? 'İndirme duraklatıldı (.part korundu).' : `İptal edilmedi: ${errText(res)}`, res.ok ? 'success' : 'warning');
  await refreshAdminModels();
}

/** B2: doğrula — hash eşleşmesi; yazma değil, token gerekmez. */
async function adminModelVerify(modelID) {
  if (!modelID) return;
  const res = await call(KV && KV.models && KV.models.verify, { modelID });
  if (res.ok && res.data) {
    toast(res.data.verified ? `Doğrulandı: ${modelID} (${fmtBytes(res.data.sizeBytes)})` : `Hash uyuşmadı: ${modelID}`, res.data.verified ? 'success' : 'danger');
  } else {
    toast(`Doğrulanamadı: ${errText(res)}`, 'warning');
  }
  await refreshAdminModels();
}

/** B7: yerel modeli kaldır — geri alınamaz; onay metni ne kaybedileceğini yazar. */
function openAdminDangerRemove(presetModel) {
  const models = ((store.admin.inventory && store.admin.inventory.models) || []).filter((m) => m.state !== 'absent');
  if (!models.length) { toast('Kaldırılacak yerel model yok.', 'info'); return; }
  const sel = el('select', { class: 'kv-input', 'data-field': 'admin-danger-model' });
  for (const m of models) sel.append(el('option', { value: m.modelID, text: `${m.name || m.modelID} · ${fmtBytes(m.sizeBytes)} · ${MODEL_STATE_TR[m.state] || m.state}` }));
  if (presetModel) sel.value = presetModel;
  const desc = el('p', { class: 'kv-muted', text: 'Silinecek: hedef dizindeki model dosyası ve durumu tutan kayıt.' });
  sel.addEventListener('change', () => {
    const m = models.find((x) => x.modelID === sel.value);
    if (m) desc.textContent = `Silinecek: ${m.targetDir || 'hedef dizin'} içindeki ${m.modelID} · ${fmtBytes(m.sizeBytes)} — geri alınamaz.`;
  });
  modal({
    title: 'Yerel modeli kaldır',
    sub: 'Geri alınamaz: dosya diskten silinir, kazanılan bayt geri gelmez.',
    body: [el('div', { class: 'kv-field' }, [el('label', { text: 'Model' }), sel]), desc],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button kv-button--danger', type: 'button', text: 'Kalıcı olarak kaldır',
        onclick: async () => {
          const modelID = sel.value;
          const res = await call(KV && KV.models && KV.models.remove, { modelID, confirmToken: makeConfirmToken() });
          closeModal();
          toast(res.ok ? `Kaldırıldı: ${modelID} (${fmtBytes(res.data && res.data.freedBytes)})` : `Kaldırılamadı: ${errText(res)}`, res.ok ? 'success' : 'warning');
          await refreshAdminModels();
        },
      }),
    ],
  });
}

/** B7: indirmeyi iptal et — geri alınabilir kademe. */
function openAdminDangerCancel(presetJob) {
  const jobs = ((store.admin.inventory && store.admin.inventory.jobs) || []).filter((j) => ADMIN_ACTIVE_JOB_STATES.has(j.state));
  if (!jobs.length) { toast('Etkin indirme işi yok.', 'info'); return; }
  const sel = el('select', { class: 'kv-input', 'data-field': 'admin-danger-job' });
  for (const j of jobs) sel.append(el('option', { value: j.jobId, text: `${j.modelID} · ${MODEL_STATE_TR[j.state] || j.state} · %${Math.round(j.percent || 0)}` }));
  if (presetJob) sel.value = presetJob;
  modal({
    title: 'İndirmeyi iptal et',
    sub: 'Geri alınabilir: indirme duraklatılır, yarım dosya (.part) korunur.',
    body: [el('div', { class: 'kv-field' }, [el('label', { text: 'İş' }), sel])],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: 'İptal et',
        onclick: async () => {
          const jobId = sel.value;
          const res = await call(KV && KV.models && KV.models.cancel, { jobId, confirmToken: makeConfirmToken() });
          closeModal();
          toast(res.ok ? 'İndirme duraklatıldı.' : `İptal edilmedi: ${errText(res)}`, res.ok ? 'success' : 'warning');
          await refreshAdminModels();
        },
      }),
    ],
  });
}

/** B7: sunucuyu durdur — dış etkili kademe; onay modalı + confirmToken. */
function openAdminDangerStop() {
  modal({
    title: 'Yerel sunucuyu durdur',
    sub: 'Dış etkili: bağlı tüm istemciler ve uzak oturumlar kapanır.',
    body: [el('p', { class: 'kv-muted', text: 'Sunucu durunca ekip seansları yeniden başlatılana kadar erişilemez.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button kv-button--danger', type: 'button', text: 'Sunucuyu durdur',
        onclick: async () => {
          const res = await call(KV && KV.server && KV.server.stop, { confirmToken: makeConfirmToken() });
          closeModal();
          toast(res.ok ? 'Sunucu durduruldu.' : `Durdurulamadı: ${errText(res)}`, res.ok ? 'success' : 'warning');
          await refreshAdminInfo();
        },
      }),
    ],
  });
}

/** B3: sağlayıcı testi / failover zinciri — sonuç modal içinde gösterilir. */
async function openAdminProviderChain(mode) {
  const res = await call(KV && KV.provider && KV.provider.list);
  const providers = res.ok && res.data && Array.isArray(res.data.providers) ? res.data.providers : [];
  if (!providers.length) { toast('Sağlayıcı yok — Ayarlar → Sağlayıcılar.', 'info'); return; }
  const sel = el('select', { class: 'kv-input', 'data-field': 'admin-provider' });
  for (const p of providers) sel.append(el('option', { value: p.id, text: `${p.name || p.id}${p.baseURL ? ` · ${p.baseURL}` : ''}` }));
  const out = el('p', { class: 'kv-muted', 'data-field': 'admin-chain-result', text: 'Zincir henüz koşmadı.' });
  modal({
    title: mode === 'failover' ? 'Failover zinciri' : 'Sağlayıcı testi',
    sub: 'Anahtarlar sırayla denenir; sonuç deneme sayısıyla döner.',
    body: [el('div', { class: 'kv-field' }, [el('label', { text: 'Sağlayıcı' }), sel]), out],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Kapat', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: mode === 'failover' ? 'Zinciri koştur' : 'Test et',
        onclick: async () => {
          out.textContent = 'deneniyor…';
          const r = await call(KV && KV.provider && KV.provider.test, { providerId: sel.value, path: '/models' });
          const attempts = (r.ok && r.data && r.data.attempts) || (r.error && r.error.detail && r.error.detail.attempts) || [];
          out.textContent = r.ok
            ? `başarılı · ${(r.data && r.data.mask) || sel.value} · ${attempts.length} deneme`
            : `başarısız · ${(r.error && r.error.code) || 'hata'} · ${attempts.length} deneme`;
        },
      }),
    ],
  });
}

/** B3: sunucuyu başlat — yazma kanalı; confirmToken çağrıyla gider. */
async function adminServerStart() {
  const res = await call(KV && KV.server && KV.server.start, { confirmToken: makeConfirmToken() });
  toast(res.ok ? 'Sunucu başlatılıyor.' : `Başlatılamadı: ${errText(res)}`, res.ok ? 'success' : 'warning');
  await refreshAdminInfo();
}

/* ================= TUR 13 (T-140): KATALOG + DENETIM (UI §15.5/§15.6) =================
 * Ağ renderer'da yok (connect-src 'none'): tüm IPC main üzerinden.
 * Sır (token/cipher) hiçbir data-* alanına yazılmaz (API-30 / UI-142).
 */

/** İki kaynağı tek kart listesinde birleştirir (B2). */
function catalogItems() {
  const st = store.catalog;
  const accounts = store.integration.accounts || [];
  const integrations = (store.integration.catalog || []).map((p) => {
    const acc = accounts.find((a) => a.providerId === p.id);
    const authKind = String((p.auth && p.auth.kind) || 'none');
    return {
      id: String(p.id || ''), kind: 'integration',
      name: String(p.name || p.id || ''),
      vendor: String(p.vendor || p.name || p.id || ''),
      category: String(p.category || 'other'), type: authKind,
      toolsHint: String(p.summary || p.description || p.toolsHint || ''),
      envKeys: [], docs: String(p.docs || ''),
      installed: Boolean(acc), state: acc && acc.state ? String(acc.state) : 'untested',
      accountId: acc ? String(acc.id || '') : '', raw: p
    };
  });
  const installedMcps = new Set((store.mcp.servers || []).map((s) => String(s.id || '')));
  const mcps = (st.mcpItems || []).map((m) => ({
    id: String(m.id || ''), kind: 'mcp',
    name: String(m.name || m.id || ''), vendor: String(m.vendor || '—'),
    category: String(m.category || 'other'), type: String(m.transport || '—'),
    toolsHint: String(m.toolsHint || ''),
    envKeys: Array.isArray(m.envKeys) ? m.envKeys.map(String) : [],
    docs: String(m.docs || ''), installed: installedMcps.has(String(m.id || '')),
    state: '', accountId: '', raw: m
  }));
  return [...integrations, ...mcps];
}

/** Görünür durum: OAuth akışı sürerken 'pending' (UI-144). */
function catalogStateOf(item) {
  if (item.kind === 'integration' && item.type === 'oauth2' && item.accountId
      && store.catalog.pending && store.catalog.pending[item.accountId]) return 'pending';
  return item.state || 'untested';
}

/** Arama ≥2 karakter, tür / kategori / kurulu süzgeçleri (UI-146). */
function catalogVisibleItems() {
  const st = store.catalog;
  const q = st.q.length >= 2 ? st.q.toLowerCase() : '';
  return catalogItems().filter((item) => {
    if (st.kind !== 'all' && item.kind !== st.kind) return false;
    if (st.category !== 'all' && item.category !== st.category) return false;
    if (st.installedOnly && !item.installed) return false;
    if (!q) return true;
    return [item.name, item.vendor, item.category, item.toolsHint]
      .some((v) => matchesFold(v, q));
  });
}

async function refreshCatalog() {
  const st = store.catalog;
  const [catRes, mcpRes, srvRes] = await Promise.all([
    call(KV && KV.integration && KV.integration.list),
    call(KV && KV.mcpCatalog && KV.mcpCatalog.list, {}),
    call(KV && KV.mcp && KV.mcp.list, {})
  ]);
  if (catRes.ok && catRes.data) {
    const d = catRes.data;
    store.integration.catalog = Array.isArray(d.catalog) ? d.catalog : [];
    store.integration.accounts = Array.isArray(d.accounts) ? d.accounts : [];
    store.integration.loaded = true;
  }
  const raw = mcpRes.ok ? mcpRes.data : null;
  st.mcpItems = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
  if (srvRes.ok && srvRes.data) {
    const d = srvRes.data;
    store.mcp.servers = Array.isArray(d) ? d : (Array.isArray(d.servers) ? d.servers : []);
  }
  st.loaded = true;
  if (store.screen === 'catalog') renderCatalog();
  if (st.poll) await pollCatalogOAuth();
}

function renderCatalog() {
  fillCatalogCategories();
  renderCatalogGrid();
  renderCatalogDetail();
  renderCatalogInstall();
}

function fillCatalogCategories() {
  const sel = $('[data-catalog-category]');
  if (!sel) return;
  const cats = [...new Set(catalogItems().map((i) => i.category).filter(Boolean))].sort();
  const cur = store.catalog.category;
  sel.replaceChildren(
    el('option', { value: 'all', text: 'Tüm kategoriler' }),
    ...cats.map((c) => el('option', { value: c, text: c }))
  );
  sel.value = cats.includes(cur) ? cur : 'all';
  store.catalog.category = sel.value;
}

function renderCatalogGrid() {
  const host = $('[data-catalog-grid]');
  if (!host) return;
  const shown = catalogVisibleItems();
  const count = $('[data-catalog-count]');
  if (count) count.textContent = `${shown.length} sonuç`;
  const empty = $('[data-catalog-empty]');
  if (empty) empty.hidden = shown.length !== 0;
  if (!shown.length) {
    host.replaceChildren(el('p', {
      class: 'kv-empty', text: store.catalog.loaded ? 'Eşleşen kayıt yok.' : 'Katalog yükleniyor…'
    }));
    return;
  }
  host.replaceChildren(...shown.map((item) => {
    const conn = connStateFor(catalogStateOf(item));
    const key = `${item.kind}:${item.id}`;
    return el('button', {
      class: 'kv-card', type: 'button', 'data-catalog-item': '', role: 'listitem',
      'data-catalog-id': item.id, 'data-catalog-kind': item.kind,
      'data-catalog-installed': String(item.installed),
      'data-conn-state': conn, 'data-state': CONN_TO_STATE[conn] || 'offline',
      'data-action': 'catalog-pick', 'aria-pressed': String(store.catalog.selected === key)
    }, [
      el('span', { class: 'kv-card__title', text: item.name }),
      el('span', { class: 'kv-row' }, [
        el('span', { class: 'kv-badge', 'data-tone': 'info', text: item.category }),
        el('span', { class: 'kv-muted', text: item.kind }),
        el('span', { class: 'kv-muted kv-mono', text: item.type })
      ]),
      el('span', { class: 'kv-muted', text: item.vendor }),
      el('span', { class: 'kv-row' }, [
        el('span', { class: 'kv-badge', 'data-tone': toneForConn(conn), text: conn }),
        item.installed ? el('span', { class: 'kv-muted', text: 'Kurulu' }) : null
      ])
    ]);
  }));
}

function pickCatalog(id, kind) {
  if (!id) return;
  store.catalog.selected = `${kind || 'integration'}:${id}`;
  renderCatalogGrid();
  renderCatalogDetail();
  renderCatalogInstall();
}

function selectedCatalogItem() {
  const key = store.catalog.selected;
  if (!key) return null;
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  return catalogItems().find((i) => i.kind === kind && i.id === id) || null;
}

/** B3: salt okuma — sır alanı yok (API-30). */
function renderCatalogDetail() {
  const host = $('[data-catalog-detail]');
  if (!host) return;
  const item = selectedCatalogItem();
  host.hidden = !item;
  if (!item) return;
  setFieldText('catalog-detail-vendor', item.vendor || '—');
  setFieldText('catalog-detail-kind', `${item.category} · ${item.type}`);
  setFieldText('catalog-detail-hint', item.toolsHint || '—');
  setFieldText('catalog-detail-env', item.envKeys.length ? item.envKeys.join(', ') : '—');
  const docs = $('[data-field="catalog-detail-docs"]');
  if (docs) {
    const url = /^https:\/\//i.test(item.docs) ? item.docs : '';
    docs.textContent = url || '—';
    if (url) { docs.setAttribute('href', url); docs.removeAttribute('aria-disabled'); }
    else { docs.setAttribute('href', '#'); docs.setAttribute('aria-disabled', 'true'); }
  }
}

/** B4: türüne göre tek kurulum yolu; reconnect/revoke asla birlikte görünmez. */
function renderCatalogInstall() {
  const host = $('[data-catalog-install-panel]');
  if (!host) return;
  const item = selectedCatalogItem();
  host.hidden = !item;
  if (!item) return;
  const hint = host.querySelector('p.kv-hint');
  if (hint) hint.textContent = `${item.name} · ${item.kind} · ${item.category}`;
  const idField = host.querySelector('[data-field="catalog-install-id"]');
  const envField = host.querySelector('[data-field="catalog-install-env"]');
  const isMcp = item.kind === 'mcp';
  if (idField && idField.closest('.kv-field')) idField.closest('.kv-field').hidden = !isMcp;
  if (envField && envField.closest('.kv-field')) envField.closest('.kv-field').hidden = !isMcp;
  if (idField && store.catalog.lastPanel !== store.catalog.selected) idField.value = item.id;
  if (envField && store.catalog.lastPanel !== store.catalog.selected) {
    envField.value = item.envKeys.map((k) => `${k}=`).join('\n');
  }
  store.catalog.lastPanel = store.catalog.selected;

  const conn = connStateFor(catalogStateOf(item));
  const badgeEl = host.querySelector('[data-conn-state]');
  if (badgeEl) {
    badgeEl.textContent = conn;
    badgeEl.setAttribute('data-conn-state', conn);
    badgeEl.setAttribute('data-state', CONN_TO_STATE[conn] || 'offline');
    badgeEl.setAttribute('data-tone', toneForConn(conn));
  }
  const isOauth = !isMcp && item.type === 'oauth2';
  const show = (sel, on) => { const n = host.querySelector(sel); if (n) n.hidden = !on; };
  show('[data-catalog-install]', isMcp);
  show('[data-action="catalog-oauth"]', isOauth);
  show('[data-action="catalog-open"]', !isMcp && !isOauth);
  show('[data-oauth-reconnect]', isOauth && conn === 'expired');
  show('[data-oauth-revoke]', isOauth && conn === 'connected');
}

function resetCatalog() {
  const st = store.catalog;
  st.q = ''; st.kind = 'all'; st.category = 'all'; st.installedOnly = false;
  const search = $('[data-catalog-search]'); if (search) search.value = '';
  const sel = $('[data-catalog-category]'); if (sel) sel.value = 'all';
  const chk = $('[data-field="catalog-installed-only"]'); if (chk) chk.checked = false;
  for (const b of $$('[data-catalog-kind]')) {
    b.setAttribute('aria-pressed', String(b.dataset.catalogKind === 'all'));
  }
  renderCatalogGrid();
}

/** B5: adım göstergesi --kv-oauth-step (yalnız okuma). */
function catalogFlow(step, detail) {
  const host = $('[data-catalog-flow]');
  if (!host) return;
  const counter = $('[data-field="catalog-flow-step"]');
  if (counter) { counter.hidden = false; counter.textContent = String(step); }
  host.append(el('div', { class: 'kv-log__row' }, [
    el('span', { class: 'kv-badge', 'data-tone': 'info', text: String(step) }),
    el('span', { class: 'kv-muted', text: String(detail || '') })
  ]));
}

function stopCatalogPoll() {
  if (store.catalog.poll) { clearInterval(store.catalog.poll); store.catalog.poll = null; }
  store.catalog.pending = {};
  if (store.screen === 'catalog') renderCatalogInstall();
}

function clearCatalogFlow() {
  stopCatalogPoll();
  const host = $('[data-catalog-flow]');
  if (!host) return;
  for (const child of [...host.children]) {
    if (!child.hasAttribute('data-field')) child.remove();
  }
  const counter = host.querySelector('[data-field="catalog-flow-step"]');
  if (counter) counter.textContent = 'Akış yok.';
}

/** Yol 1: MCP şablonu — onay modalı + confirmToken; süreç başlatılmaz. */
function confirmCatalogInstall() {
  const item = selectedCatalogItem();
  if (!item) { toast('Kart seçin.', 'warning'); return; }
  if (item.kind !== 'mcp') { openCatalogProvider(); return; }
  const idField = $('[data-field="catalog-install-id"]');
  const id = String(idField && idField.value.trim() ? idField.value.trim() : item.id);
  modal({
    title: 'MCP şablonunu kur',
    sub: `${item.name} · ${id}`,
    body: [el('p', { class: 'kv-modal__sub', text: 'Şablon kopyalanır, süreç başlatılmaz. Onay olmadan istek gitmez.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Kur', onclick: async () => {
        closeModal();
        catalogFlow('doğrulama', 'confirmToken üretildi');
        /* Mevcut main şeması yalnız {id, confirmToken} kabul eder (API-52). */
        const res = await call(KV && KV.mcpCatalog && KV.mcpCatalog.install,
          { id, confirmToken: makeConfirmToken() });
        if (!res.ok) {
          catalogFlow('hata', (res.error && res.error.code) || 'E_INSTALL');
          toast('Kurulum başarısız.', 'warning');
          return;
        }
        catalogFlow('tamam', `${id} kuruldu`);
        await refreshCatalog();
      } })
    ]
  });
}

function newOAuthAccountId(providerId) {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const tail = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 18);
  return `oa-${String(providerId || 'p').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)}-${tail}`.slice(0, 96);
}

/** Yol 2: OAuth2 — harici tarayıcı, 2 sn status yoklaması. */
function confirmCatalogOAuth() {
  const item = selectedCatalogItem();
  if (!item || item.kind !== 'integration' || item.type !== 'oauth2') {
    toast('OAuth2 sağlayıcısı seçin.', 'warning'); return;
  }
  const existing = (store.integration.accounts || []).find((a) => a.providerId === item.id);
  const accountId = existing ? String(existing.id || '') : newOAuthAccountId(item.id);
  const reconnect = catalogStateOf(item) === 'expired';
  modal({
    title: reconnect ? 'Yeniden bağlan' : 'OAuth2 ile bağlan',
    sub: `${item.name} · harici tarayıcı açılır`,
    body: [el('p', { class: 'kv-modal__sub', text: 'Bağlantı formuna token yazılmaz; onay olmadan istek gitmez.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: reconnect ? 'Yeniden bağlan' : 'Bağlan', onclick: async () => {
        closeModal();
        const res = await call(KV && KV.oauth && KV.oauth.start,
          { providerId: item.id, accountId, confirmToken: makeConfirmToken() });
        if (!res.ok) {
          catalogFlow('hata', (res.error && res.error.code) || 'E_OAUTH');
          toast('Akış başlatılamadı.', 'warning');
          return;
        }
        store.catalog.pending = { ...(store.catalog.pending || {}), [accountId]: item.id };
        catalogFlow('pending', `${item.id} · onay bekleniyor`);
        renderCatalogGrid(); renderCatalogInstall();
        startCatalogPoll();
      } })
    ]
  });
}

function startCatalogPoll() {
  if (store.catalog.poll) return;
  store.catalog.poll = setInterval(() => { pollCatalogOAuth(); }, 2000);
}

async function pollCatalogOAuth() {
  const pending = Object.keys(store.catalog.pending || {});
  if (!pending.length) { stopCatalogPoll(); return; }
  for (const accountId of pending) {
    const res = await call(KV && KV.oauth && KV.oauth.status, { accountId });
    if (!res.ok) continue;
    if (res.data && res.data.connected === true) {
      delete store.catalog.pending[accountId];
      catalogFlow('connected', 'bağlantı tamamlandı');
      stopCatalogPoll();
      await refreshCatalog();
      return;
    }
  }
}

function confirmCatalogRevoke() {
  const item = selectedCatalogItem();
  const acc = item && (store.integration.accounts || []).find((a) => a.providerId === item.id
    && a.state === 'connected');
  if (!acc) { toast('Bağlı hesap yok.', 'warning'); return; }
  modal({
    title: 'Bağlantıyı kes',
    sub: `${item.name} · ${acc.id}`,
    body: [el('p', { class: 'kv-modal__sub', text: 'Yerel şifreli kayıt silinir; onay olmadan istek gitmez.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Kes', onclick: async () => {
        closeModal();
        const res = await call(KV && KV.oauth && KV.oauth.revoke,
          { accountId: String(acc.id), confirmToken: makeConfirmToken() });
        if (!res.ok) { catalogFlow('hata', (res.error && res.error.code) || 'E_REVOKE'); toast('İptal başarısız.', 'warning'); return; }
        catalogFlow('revoked', 'bağlantı kesildi');
        await refreshCatalog();
      } })
    ]
  });
}

/** Yol 3: token tabanlı sağlayıcı — integrations B3'e seçili geç. */
function openCatalogProvider() {
  const item = selectedCatalogItem();
  if (!item || item.kind !== 'integration' || item.type === 'oauth2') {
    toast('Sağlayıcı seçin.', 'warning'); return;
  }
  modal({
    title: 'Bağlantı formuna geç',
    sub: `${item.name} · sır yalnız formda yazılır`,
    body: [el('p', { class: 'kv-modal__sub', text: 'Token type="password" alanına yalnız entegrasyon ekranında girilir.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Aç', onclick: () => {
        closeModal();
        store.integration.providerId = item.id;
        go('integrations');
      } })
    ]
  });
}

/* ---------------- denetim (§15.6) ---------------- */

function auditRowId(entry, index) {
  const id = entry && (entry.id || entry.idempotencyKey);
  return id ? String(id) : `row-${index}`;
}

function renderAudit() {
  const host = $('[data-audit-list]');
  if (!host) return;
  const a = store.audit;
  const shown = a.entries.filter((e) => !a.code || matchesFold(e.code, a.code));
  const counter = $('[data-audit-count]');
  if (counter) counter.textContent = `Toplam ${a.total} kayıt`;
  const truncated = $('[data-audit-truncated]');
  if (truncated) truncated.hidden = !a.truncated;

  host.replaceChildren(el('div', { class: 'kv-audit-row kv-audit-header' }, [
    el('span', { text: 'saat' }), el('span', { text: 'işlem' }), el('span', { text: 'kod' }),
    el('span', { text: 'hedef' }), el('span', { text: 'durum' }), el('span', { text: 'idem' })
  ]));
  if (!shown.length) {
    host.append(el('p', { class: 'kv-empty', text: a.loaded ? 'Kayıt yok.' : 'Denetim kaydı yükleniyor…' }));
    renderAuditDetail();
    return;
  }
  for (const [i, e] of shown.entries()) {
    const rowId = auditRowId(e, i);
    const ok = e.code === 'OK';
    host.append(el('div', {
      class: 'kv-audit-row', 'data-audit-row': '', 'data-audit-id': rowId,
      tabindex: '0', role: 'button', 'data-action': 'audit-row-pick',
      'aria-pressed': String(a.selected === rowId)
    }, [
      el('span', { class: 'kv-mono', text: String(e.at || '').slice(11, 19) || '—' }),
      el('span', { text: String(e.op || '—') }),
      el('span', { class: 'kv-mono', text: String(e.code || '—') }),
      el('span', { class: 'kv-muted', text: String(e.target || '—') }),
      el('span', {}, [badge(ok ? 'tamam' : String(e.status || 'hata'), ok ? 'success' : 'error')]),
      el('span', { class: 'kv-mono', text: String(e.idempotencyKey || '—') })
    ]));
  }
  renderAuditDetail();
}

/** B3: yalnız üst veri (at, op, code, target, status, idempotencyKey). */
function renderAuditDetail() {
  const host = $('[data-audit-detail]');
  if (!host) return;
  const a = store.audit;
  const row = a.entries.find((e, i) => auditRowId(e, i) === a.selected) || null;
  host.hidden = !row;
  if (!row) return;
  setFieldText('audit-detail-op', row.op || '—');
  setFieldText('audit-detail-code', row.code || '—');
  setFieldText('audit-detail-target', row.target || '—');
  setFieldText('audit-detail-status', row.status || '—');
  setFieldText('audit-detail-idem', row.idempotencyKey || '—');
}

function pickAudit(id) {
  if (!id) return;
  store.audit.selected = id;
  renderAudit();
}

async function refreshAudit() {
  const a = store.audit;
  const n = Number(a.limit);
  const limit = [50, 100, 200, 500].includes(n) ? n : 200;
  /* API §7.2: yalnız {limit?, op?, since?}; code YEREL süzgeç, IPC'ye GİTMEZ. */
  const payload = { limit };
  if (a.op) payload.op = a.op;
  if (a.since) payload.since = a.since;
  const res = await call(KV && KV.audit && KV.audit.list, payload);
  if (!res.ok) {
    a.loaded = true;
    if (store.screen === 'audit') renderAudit();
    toast('Denetim alınamadı.', 'warning');
    return;
  }
  const d = res.data || {};
  a.entries = Array.isArray(d.entries) ? d.entries : [];
  a.total = Number(d.total) || a.entries.length;
  a.truncated = Boolean(d.truncated);
  a.loaded = true;
  if (!a.entries.some((e, i) => auditRowId(e, i) === a.selected)) a.selected = '';
  if (store.screen === 'audit') renderAudit();
}

function resetAudit() {
  const a = store.audit;
  a.op = ''; a.code = ''; a.since = ''; a.limit = 200; a.selected = '';
  for (const sel of ['[data-audit-filter-op]', '[data-audit-filter-code]', '[data-audit-filter-since]']) {
    const node = $(sel); if (node) node.value = '';
  }
  const lim = $('[data-audit-limit]'); if (lim) lim.value = '200';
  renderAudit();
}

/* ================= TUR 14 (T-147): HAZIR BAĞLANTILAR (UI §15.9) =================
 * Veri tek kaynaktan: kv:preset:list (124 şablon). Kurulum kv:preset:apply
 * üzerinden onay modalı + confirmToken ile gider. Sır DEĞERİ store'a yazılmaz;
 * yalnız form alanından okunur ve yanıttan geri gelmez (API-30 / UI-152).
 */

const PRESET_READY_TEXT = {
  ready: 'Hazır', 'needs-fields': 'Alan eksik',
  installed: 'Kurulu', connected: 'Bağlı', error: 'Hata'
};

const PRESET_ERROR_TEXT = {
  E_PRESET_UNKNOWN: 'Bağlantı şablonu bulunamadı; listeyi tazeleyip yeniden deneyin.',
  E_PRESET_KIND_MISMATCH: 'Bağlantı türü uyuşmuyor; kartı yeniden seçin.',
  E_PRESET_MISSING_FIELDS: 'Zorunlu alanlar eksik; işaretli alanları doldurun.',
  E_CONFIRM_REQUIRED: 'Onay anahtarı geçersiz; "Bağlan" ile onayı yeniden verin.'
};

/* UI-152: sır alanının türü — sır DEĞERİ değil, yalnız giriş alanı biçimi. */
const SECRET_INPUT_TYPE = { type: 'password' }.type;

let presetVotionLabelNode = null;

/** UI-155: anahtar yalnız admin görünümünde DOM'da durur. */
function presetVotionLabel() {
  if (presetVotionLabelNode && presetVotionLabelNode.isConnected) return presetVotionLabelNode;
  const slot = $('[data-field="preset-votion-slot"]');
  if (!slot) return null;
  let node = slot.querySelector('label.kv-check');
  if (!node) {
    node = el('label', { class: 'kv-check' }, [
      el('input', { type: 'checkbox', 'data-field': 'preset-votion-access' }),
      document.createTextNode(' Votion bu bağlantıyı kullanabilir')
    ]);
    slot.append(node);
  }
  presetVotionLabelNode = node;
  bindPresetVotion();
  return node;
}

function bindPresetVotion() {
  const box = $('[data-field="preset-votion-access"]');
  if (!box || box.dataset.bound === '1') return;
  box.dataset.bound = '1';
  box.addEventListener('change', () => {
    const p = presetById(store.preset.selected);
    if (p) store.preset.votion[p.id] = box.checked;
  });
}

function presetById(id) {
  return store.preset.items.find((p) => p && p.id === id) || null;
}

/** Form alanlarındaki değerler — yalnız gönderim anında okunur. */
function presetFieldValues() {
  const out = {};
  for (const input of $$('[data-preset-input]')) {
    const key = input.getAttribute('data-preset-input');
    if (key) out[key] = input.value;
  }
  return out;
}

function presetMissingFields(preset) {
  if (!preset) return [];
  const values = presetFieldValues();
  return (preset.fields || [])
    .filter((f) => f.required && !String(values[f.key] == null ? '' : values[f.key]).trim())
    .map((f) => String(f.key));
}

/** Kart durumu: oturum işareti kazanır; zorunlu alanlar dolunca "Hazır". */
function presetReadyOf(p) {
  const mark = store.preset.marks[p.id];
  if (mark === 'connected' || mark === 'installed' || mark === 'error') return mark;
  if (p.authMode === 'install') return 'ready';
  const required = (p.fields || []).filter((f) => f.required);
  if (!required.length) return 'ready';
  if (store.preset.selected === p.id) {
    const values = presetFieldValues();
    if (required.every((f) => String(values[f.key] == null ? '' : values[f.key]).trim())) return 'ready';
  }
  return 'needs-fields';
}

/** UI-157: arama ≥2 karakter; tür + kategori süzgeçleri. */
function presetVisibleItems() {
  const st = store.preset;
  const q = st.q.length >= 2 ? st.q.toLowerCase() : '';
  return st.items.filter((p) => {
    if (st.kind !== 'all' && p.kind !== st.kind) return false;
    if (st.category !== 'all' && p.category !== st.category) return false;
    if (!q) return true;
    return [p.name, p.vendor, p.category, p.authMode, p.summary]
      .some((v) => matchesFold(v, q));
  });
}

function presetLetter(p) {
  const raw = String((p && (p.logoHint || p.name || p.id)) || '?').trim();
  return raw.slice(0, 1).toLocaleUpperCase('tr-TR') || '?';
}

function renderPreset() {
  fillPresetCategories();
  renderPresetGrid();
  renderPresetDetail();
  renderPresetForm();
  refreshPresetVotionLine();
}

/** Kategori listesi listeden türetilir (yanıt düz dizi döner). */
function fillPresetCategories() {
  const sel = $('[data-preset-category]');
  if (!sel) return;
  const cats = [...new Set(store.preset.items.map((p) => String(p.category || '')).filter(Boolean))].sort();
  const cur = store.preset.category;
  sel.replaceChildren(
    el('option', { value: 'all', text: 'Tüm kategoriler' }),
    ...cats.map((c) => el('option', { value: c, text: c }))
  );
  sel.value = cats.includes(cur) ? cur : 'all';
  store.preset.category = sel.value;
}

function renderPresetGrid() {
  const host = $('[data-preset-grid]');
  if (!host) return;
  const st = store.preset;
  const shown = presetVisibleItems();
  const filtered = st.q.length >= 2 || st.kind !== 'all' || st.category !== 'all';
  const count = $('[data-preset-count]');
  if (count) count.textContent = filtered ? `${shown.length} sonuç` : `${st.items.length} bağlantı`;
  const empty = $('[data-preset-empty]');
  if (empty) empty.hidden = shown.length !== 0 || !st.loaded;
  if (!shown.length) {
    host.replaceChildren(el('p', {
      class: 'kv-empty', text: st.loaded ? 'Eşleşen bağlantı yok.' : 'Bağlantılar yükleniyor…'
    }));
    return;
  }
  host.replaceChildren(...shown.map((p) => presetCard(p)));
}

function presetCard(p) {
  const ready = presetReadyOf(p);
  return el('div', {
    class: 'kv-preset__card', role: 'listitem', tabindex: '0',
    'data-preset-item': '', 'data-preset-id': String(p.id || ''),
    'data-preset-kind': String(p.kind || ''), 'data-preset-ready': ready,
    'data-action': 'preset-pick', 'aria-pressed': String(store.preset.selected === p.id)
  }, [
    el('span', { class: 'kv-preset__logo', 'aria-hidden': 'true', text: presetLetter(p) }),
    el('span', { class: 'kv-card__title', text: String(p.name || p.id || '—') }),
    el('span', { class: 'kv-muted', text: String(p.vendor || '—') }),
    el('span', { class: 'kv-row' }, [
      el('span', { class: 'kv-preset__badge', text: String(p.category || 'other') }),
      el('span', { class: 'kv-preset__badge', text: String(p.authMode || 'none') })
    ]),
    el('span', { class: 'kv-preset__summary', text: String(p.summary || '') }),
    el('span', { class: 'kv-preset__state', text: PRESET_READY_TEXT[ready] || ready })
  ]);
}

function updatePresetCardState(id) {
  const p = presetById(id);
  if (!p) return;
  const card = $(`[data-preset-item][data-preset-id="${String(id).replace(/["\\]/g, '')}"]`);
  if (!card) return;
  const ready = presetReadyOf(p);
  card.setAttribute('data-preset-ready', ready);
  const state = card.querySelector('.kv-preset__state');
  if (state) state.textContent = PRESET_READY_TEXT[ready] || ready;
}

function pickPreset(id) {
  if (!id) return;
  store.preset.selected = id;
  renderPresetGrid();
  renderPresetDetail();
  renderPresetForm();
}

/** B3: summary + docsUrl + her zaman görünür adım listesi (UI-153). */
function renderPresetDetail() {
  const host = $('[data-preset-detail]');
  if (!host) return;
  const p = presetById(store.preset.selected);
  host.hidden = !p;
  if (!p) return;
  setFieldText('preset-detail-logo', presetLetter(p));
  setFieldText('preset-detail-name', p.name || p.id);
  setFieldText('preset-detail-meta',
    `${p.vendor || '—'} · ${p.category || 'other'} · ${p.authMode || 'none'}`);
  setFieldText('preset-detail-summary', p.summary || '—');
  const docs = $('[data-field="preset-detail-docs"]');
  if (docs) {
    const url = /^https:\/\//i.test(String(p.docsUrl || '')) ? String(p.docsUrl) : '';
    docs.textContent = url || '—';
    if (url) { docs.setAttribute('href', url); docs.removeAttribute('aria-disabled'); }
    else { docs.setAttribute('href', '#'); docs.setAttribute('aria-disabled', 'true'); }
  }
  renderPresetHowTo(p);
}

/* UI-153: `howToGet` metni zaten "1) … 2) … 3) …" biçiminde numaralıdır.
 * Adımları işaretlerinden böleriz; numarayı tekrar basmayız (çift numara yok). */
const PRESET_STEP_SPLIT = /(?:^|\s)([1-9])\)\s+/g;
const PRESET_URL_RE = /https?:\/\/[^\s<>"']+/gi;

function presetHowToParts(text) {
  const src = String(text || '').trim();
  if (!src) return [];
  const marks = [];
  PRESET_STEP_SPLIT.lastIndex = 0;
  let m;
  while ((m = PRESET_STEP_SPLIT.exec(src)) !== null) {
    const lead = m[0].length - m[0].replace(/^\s*/, '').length;
    marks.push({ start: m.index + lead, end: m.index + m[0].length });
  }
  if (!marks.length) return [src];
  const parts = [];
  for (let i = 0; i < marks.length; i += 1) {
    const stop = i + 1 < marks.length ? marks[i + 1].start : src.length;
    const piece = src.slice(marks[i].end, stop).trim();
    if (piece) parts.push(piece);
  }
  /* Numaradan önce gelen metin varsa (ör. "Şunu yap: 1) …") kaybolmaz. */
  const lead = src.slice(0, marks[0].start).trim();
  if (lead) parts.unshift(lead);
  return parts.length ? parts : [src];
}

function presetHowToSteps(p) {
  const steps = [];
  for (const f of p.fields || []) {
    const fieldUrl = /^https:\/\//i.test(String(f.url || '')) ? String(f.url) : '';
    const parts = presetHowToParts(f.howToGet);
    if (!parts.length) {
      if (!fieldUrl) continue;
      steps.push({ text: 'Bağlantı bilgisini sağlayıcı panelinden alın.', url: fieldUrl });
      continue;
    }
    let linked = false;
    for (const part of parts) {
      const urls = [];
      const text = part
        .replace(PRESET_URL_RE, (u) => {
          urls.push(u.replace(/[),.;:]+$/, ''));
          return ' ';
        })
        .replace(/\s{2,}/g, ' ')
        .trim();
      /* URL metinden çıkarılır; adım başına en çok bir bağlantı basılır. */
      let url = '';
      if (!linked) {
        url = urls.find((u) => /^https:\/\//i.test(u)) || fieldUrl || '';
        linked = Boolean(url);
      }
      steps.push({ text: text || 'Bağlantı bilgisini sağlayıcı panelinden alın.', url });
    }
  }
  if (!steps.length) {
    steps.push({
      text: p.authMode === 'install'
        ? 'Kartı seçip "Bağlan" ile MCP sunucusunu kurun; ek alan gerekmez.'
        : 'Kartı seçip "Bağlan" ile bağlantıyı kaydedin; ek alan gerekmez.',
      url: ''
    });
  }
  return steps;
}

function renderPresetHowTo(p) {
  const host = $('[data-preset-howto]');
  if (!host) return;
  const steps = presetHowToSteps(p);
  host.replaceChildren(...steps.map((s, i) => {
    const url = /^https:\/\//i.test(String(s.url || '')) ? String(s.url) : '';
    return el('div', { class: 'kv-preset__step', role: 'listitem' }, [
      el('span', { class: 'kv-preset__step-num', text: `${i + 1})` }),
      el('span', {}, [
        document.createTextNode(s.text),
        url ? document.createTextNode(' ') : null,
        url ? el('a', {
          class: 'kv-link', href: url, target: '_blank',
          rel: 'noopener noreferrer', text: url
        }) : null
      ])
    ]);
  }));
}

/** B4: alan formu; install ise yalnız kurulum düğmesi. */
function renderPresetForm() {
  const p = presetById(store.preset.selected);
  const hint = $('[data-field="preset-form-hint"]');
  const connect = $('[data-preset-connect]');
  const test = $('[data-preset-test]');
  const votionSlot = $('[data-field="preset-votion-slot"]');
  if (hint) hint.textContent = p ? `${p.name || p.id} · ${p.authMode || 'none'}` : 'Kart seçin.';
  if (connect) {
    connect.hidden = !p;
    connect.textContent = p && p.authMode === 'install' ? 'Kur' : 'Bağlan';
  }
  if (test) {
    const cap = p && p.kind === 'integration' && p.testCapability ? String(p.testCapability) : '';
    test.hidden = !cap;
    test.disabled = !cap;
    test.title = cap ? `${cap} ile test et` : 'Bu bağlantı için test yeteneği tanımlı değil';
  }
  if (votionSlot) {
    /* T-209: rol filtresi kalktı; anahtar seçili bağlantı için her zaman görünür. */
    votionSlot.hidden = !p;
    if (p) presetVotionLabel();
  }
  const fieldsHost = $('[data-field="preset-fields"]');
  if (!fieldsHost) return;
  if (!p) { fieldsHost.replaceChildren(); return; }
  const fields = Array.isArray(p.fields) ? p.fields : [];
  if (!fields.length) {
    fieldsHost.replaceChildren(el('p', {
      class: 'kv-muted kv-hint', text: 'Bu bağlantı ek alan istemez.'
    }));
  } else {
    fieldsHost.replaceChildren(...fields.map((f) => presetFieldRow(f)));
  }
  const votion = $('[data-field="preset-votion-access"]');
  if (votion) votion.checked = Boolean(store.preset.votion[p.id]);
}

function presetFieldRow(f) {
  const key = String(f.key || '');
  const id = `preset-field-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const attrs = {
    class: 'kv-input', id, 'data-preset-input': key,
    type: 'text', autocomplete: 'off',
    placeholder: String(f.placeholder || ''),
    'aria-required': f.required ? 'true' : 'false'
  };
  if (f.secret) attrs.type = SECRET_INPUT_TYPE;
  const input = el('input', attrs);
  const row = el('div', {
    class: 'kv-preset__field', 'data-preset-field': '', 'data-preset-field-key': key
  }, [
    el('label', { for: id }, [
      document.createTextNode(String(f.label || key)),
      f.required ? el('span', { class: 'kv-muted', text: ' *' }) : null
    ]),
    input
  ]);
  if (f.secret) {
    const toggle = el('button', {
      class: 'kv-button kv-button--ghost kv-button--sm', type: 'button',
      'data-preset-secret-toggle': '', 'aria-pressed': 'false', text: 'göster'
    });
    toggle.addEventListener('click', () => {
      const show = input.getAttribute('type') === SECRET_INPUT_TYPE;
      input.setAttribute('type', show ? 'text' : SECRET_INPUT_TYPE);
      toggle.setAttribute('aria-pressed', String(show));
      toggle.textContent = show ? 'gizle' : 'göster';
    });
    row.append(toggle);
  }
  row.append(el('span', {
    class: 'kv-preset__hint', 'data-preset-field-hint': '', text: String(f.hint || '')
  }));
  return row;
}

function clearPresetFields() {
  for (const input of $$('[data-preset-input]')) input.value = '';
}

/** UI-156: hata alanın altında; "ne oldu + ne yapmalı". */
function showPresetFieldErrors(keys) {
  const list = (Array.isArray(keys) ? keys : []).map(String);
  const p = presetById(store.preset.selected);
  for (const row of $$('[data-preset-field]')) {
    const key = row.getAttribute('data-preset-field-key') || '';
    const hint = row.querySelector('[data-preset-field-hint]');
    if (!hint) continue;
    const field = p && (p.fields || []).find((f) => f.key === key);
    hint.textContent = list.includes(key)
      ? 'Zorunlu alan boş — bu alanı doldurun.'
      : String((field && field.hint) || '');
  }
}

function setPresetResult(text) {
  const node = $('[data-preset-result]');
  if (!node) return;
  node.replaceChildren(document.createTextNode(String(text == null ? '' : text)));
}

function resetPresets() {
  const st = store.preset;
  st.q = ''; st.kind = 'all'; st.category = 'all';
  const search = $('[data-preset-search]'); if (search) search.value = '';
  const sel = $('[data-preset-category]'); if (sel) sel.value = 'all';
  for (const b of $$('[data-preset-kind]')) {
    b.setAttribute('aria-pressed', String(b.dataset.presetKind === 'all'));
  }
  renderPresetGrid();
}

/** "Bağlan"/"Kur" → onay modalı → confirmToken (dış etkili yazma). */
function confirmPresetApply() {
  const p = presetById(store.preset.selected);
  if (!p) { toast('Önce bir kart seçin.', 'warning'); return; }
  const missing = presetMissingFields(p);
  if (missing.length) {
    showPresetFieldErrors(missing);
    setPresetResult(`Zorunlu alanlar eksik: ${missing.join(', ')}. İşaretli alanları doldurup yeniden deneyin. [E_PRESET_MISSING_FIELDS]`);
    return;
  }
  const isInstall = p.authMode === 'install';
  modal({
    title: isInstall ? 'MCP sunucusunu kur' : 'Bağlantıyı kaydet',
    sub: `${p.name || p.id} · ${p.vendor || p.kind || ''}`,
    body: [el('p', {
      class: 'kv-modal__sub',
      text: 'Değerler yerel şifreli kayda gider; onay olmadan istek gitmez.'
    })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', {
        class: 'kv-button', type: 'button', text: isInstall ? 'Kur' : 'Bağlan',
        onclick: () => { closeModal(); applyPreset(p); }
      })
    ]
  });
}

async function applyPreset(p) {
  if (!p) return;
  const values = presetFieldValues();
  setPresetResult(`${p.name || p.id}: istek gönderiliyor…`);
  const res = await call(KV && KV.preset && KV.preset.apply, {
    presetId: p.id, values, kind: p.kind, confirmToken: makeConfirmToken()
  });
  if (!res.ok) {
    const err = res.error || {};
    const code = String(err.code || 'E_PRESET');
    if (code === 'E_PRESET_MISSING_FIELDS') {
      const miss = err.detail && Array.isArray(err.detail.fields) ? err.detail.fields : [];
      showPresetFieldErrors(miss);
      setPresetResult(`Zorunlu alanlar eksik: ${miss.join(', ') || '—'}. İşaretli alanları doldurun. [${code}]`);
      return;
    }
    store.preset.marks[p.id] = 'error';
    renderPresetGrid();
    const text = PRESET_ERROR_TEXT[code] || 'Bağlantı kurulamadı; ayrıntı için denetim kaydına bakın.';
    setPresetResult(`${text} [${code}]`);
    return;
  }
  const d = res.data || {};
  clearPresetFields();
  if (d.next === 'oauth') {
    /* OAuth2: kart "Hazır" kalır; onay tarayıcıda tamamlanır. */
    delete store.preset.marks[p.id];
    const url = /^https:\/\//i.test(String(d.authUrl || '')) ? String(d.authUrl) : '';
    setPresetResult(`Tarayıcıda onayla: ${url || 'adres dönmedi'}. Onaydan sonra bağlantı "Bağlı" olur.`);
    const node = $('[data-preset-result]');
    if (node && url) {
      node.append(document.createTextNode(' '), el('a', {
        class: 'kv-link', href: url, target: '_blank',
        rel: 'noopener noreferrer', text: 'tarayıcıda onayla'
      }));
    }
  } else if (d.next === 'installed') {
    store.preset.marks[p.id] = 'installed';
    setPresetResult('MCP sunucusu kuruldu.');
  } else {
    store.preset.marks[p.id] = 'connected';
    if (p.kind === 'integration' && d.accountId) store.preset.accounts[p.refId] = String(d.accountId);
    setPresetResult('Bağlantı kaydedildi.');
  }
  renderPresetGrid();
  renderPresetForm();
}

/** "Test et": testCapability yoksa düğme gizli; varsa kayıtlı hesap test edilir. */
async function testPreset() {
  const p = presetById(store.preset.selected);
  if (!p) { toast('Önce bir kart seçin.', 'warning'); return; }
  if (!p.testCapability) {
    setPresetResult('Bu bağlantı için test yeteneği tanımlı değil.');
    return;
  }
  const accountId = store.preset.accounts[p.refId];
  if (!accountId) {
    setPresetResult('Önce "Bağlan" ile hesabı kaydedin; test kayıtlı hesap üzerinde koşar.');
    return;
  }
  setPresetResult(`${p.name || p.id}: test ediliyor…`);
  const res = await call(KV && KV.integration && KV.integration.test, { id: accountId });
  if (!res.ok) {
    setPresetResult(`Test başarısız. ${errText(res, 'E_TEST')}`);
    return;
  }
  const state = res.data && res.data.state;
  if (state === 'connected') store.preset.marks[p.id] = 'connected';
  setPresetResult(`Test tamamlandı: ${state || 'tamam'}.`);
  renderPresetGrid();
}

/** B4 satırı: Votion manifesti bir kez çekilir (kv:votion:tools). */
function refreshPresetVotionLine() {
  const node = $('[data-field="preset-votion-line"]');
  if (!node) return;
  const info = store.preset.votionInfo;
  if (!info) { node.textContent = 'Votion: —'; return; }
  const integrations = Array.isArray(info.integrations) ? info.integrations : [];
  const caps = integrations.reduce((n, i) => n + (Array.isArray(i.capabilities) ? i.capabilities.length : 0), 0);
  const mcp = Array.isArray(info.mcp) ? info.mcp.length : 0;
  node.textContent = `Votion: ${caps} yetenek / ${mcp} MCP aracı erişilebilir`;
}

async function refreshPresets() {
  const st = store.preset;
  const [listRes, intRes, mcpRes, votionRes] = await Promise.all([
    call(KV && KV.preset && KV.preset.list),
    call(KV && KV.integration && KV.integration.list),
    call(KV && KV.mcp && KV.mcp.list, {}),
    st.votionInfo ? Promise.resolve(null) : call(KV && KV.votion && KV.votion.tools)
  ]);
  if (listRes.ok && Array.isArray(listRes.data)) {
    st.items = listRes.data;
  } else if (!listRes.ok) {
    toast('Hazır bağlantılar alınamadı.', 'warning');
  }
  st.loaded = true;

  /* Kayıtlı hesaplar: "Bağlı" işareti + test için hesap kimliği. */
  if (intRes && intRes.ok && intRes.data) {
    const accounts = Array.isArray(intRes.data.accounts) ? intRes.data.accounts : [];
    st.accounts = {};
    for (const a of accounts) {
      if (!a || !a.providerId) continue;
      st.accounts[a.providerId] = String(a.id || '');
      if (a.state !== 'connected') continue;
      for (const p of st.items) {
        if (p.kind === 'integration' && p.refId === a.providerId) st.marks[p.id] = 'connected';
      }
    }
  }
  /* Kurulu MCP sunucuları: "Kurulu" işareti. */
  if (mcpRes && mcpRes.ok && mcpRes.data) {
    const d = mcpRes.data;
    const rows = Array.isArray(d) ? d : (Array.isArray(d.servers) ? d.servers : []);
    const ids = new Set(rows.map((r) => r && r.id).filter(Boolean).map(String));
    for (const p of st.items) {
      if (p.kind === 'mcp' && ids.has(String(p.refId))) st.marks[p.id] = 'installed';
    }
  }
  if (votionRes && votionRes.ok) st.votionInfo = votionRes.data || null;
  if (store.screen === 'connect') renderPreset();
}

/* ================= T-153: İLK KURULUM + EKRAN YARDIMI =================
   Yeni kanal YOK: kv:provider:list/save/keyAdd/test ve kv:settings:set kullanılır.
   Sır yalnız ŞİFRE alanından okunur, tek yön kv:provider:keyAdd'a gider;
   textContent/log/toast'a karışmaz. Ham HTML ve satır içi stil kullanılmaz. */
const ONBOARD_TITLE = "Keyvotion Console'a hoş geldin — 3 adım";
const KEY_HELP = 'Anahtarı sağlayıcının hesap ayarlarındaki "API Keys" bölümünden oluşturabilirsin; kimseyle paylaşma.';
const onboard = { step: 1, providers: [], providerId: '', savedSig: '', busy: false };

/* İlk kurulumda hazır sağlayıcılar: kullanıcı temel adresi yazmak zorunda
 * kalmasın. Hepsi OpenAI uyumlu (Bearer) uçlardır; Ollama yereldir ve
 * anahtar istemez. */
const PROVIDER_PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1' },
  { name: 'Mistral', url: 'https://api.mistral.ai/v1' },
  { name: 'Yerel (Ollama)', url: 'http://127.0.0.1:11434/v1' }
];

/** Yerel (loopback) sağlayıcı anahtar istemez — Ollama gibi. */
function isLocalProviderUrl(url) {
  let parsed;
  try { parsed = new URL(String(url || '')); } catch { return false; }
  const host = parsed.hostname.toLowerCase();
  return host === 'localhost' || host === '::1' || /^127\./.test(host);
}

const SCREEN_HELP = {
  team: 'Her kart bir ajan. Kartın üzerine gelince hızlı işlemler, sağ tık ile bağlam menüsü çıkar; Lider masasından doğrudan görev verebilirsin.',
  command: 'Hedef seç, emri yaz, gönder. /durum, /rapor, /devam, /dur şablonları tek tıkla doldurulur.',
  board: 'Görevler durum sütunlarında yaşar. Karta tıklayınca ayrıntı açılır, sekmede de tutabilirsin.',
  memory: 'Her işten sonra çıkarımlar buraya yazılır. Zihin haritasındaki noktaların üzerine gelerek özeti gör.',
  projects: 'Bir projeyi etkin seç; ekip ve dosya işlemleri o dizinde yürür.',
  models: 'Havuz, canlı katalog ve kılavuz sekmeleri. Model seçimi sohbet ve ajanlar için varsayılanı belirler.',
  providers: 'OpenAI uyumlu bir sağlayıcı ekle, API anahtarını yapıştır. Anahtarlar DPAPI ile şifrelenir, değer asla geri gösterilmez.',
  browser: 'Uygulama içinde bir sayfa aç; ajanlar o sayfanın özetini çıkarabilir. Güvenilmeyen sitelere parola girme.',
  remote: 'Yerel sunucuyu başlat, eşleşme kodunu telefondaki uzaktan ekrana gir; aynı ağda olman gerekir.',
  reports: 'Ajan raporları durum dağılımıyla listelenir; satıra tıklayarak tam metni ve bağlamı gör.',
  settings: 'Sunucu adresi, proje dizini, görünüm ve parola burada. Parola secrets.bin içinde şifreli tutulur.',
  guide: 'Votion bu rehberi adım adım anlatır. İstediğin an atlayabilir ya da Ayarlar → Sistem’den yeniden başlatabilirsin.',
  teams: 'Aynı anda çok ekip çalıştırabilirsin; her ekibin kendi lideri, üyeleri ve token bütçesi vardır.',
  plans: 'Plan, not ve zamanlanmış görevler. Zamanlayıcılar lider için düzenli iş açar.',
  files: 'Proje dosyaları salt okunur listelenir. Kutucuk işaretleyerek dosyaları bağlama ekleyebilirsin.',
  contexts: 'Seçili dosyalar ve hafıza kayıtları tek bir bağlam paketine dönüşür; kopyalayıp ajana verebilirsin.',
  admin: 'Yönetim merkezi: ekip, model kurulumu, disk ve denetim. Tehlikeli eylemlerden önce onay ister.',
  integrations: 'Katalogdan bir entegrasyon seç, hesabını bağla ve yeteneklerini dene. Gizli değerler düz metin dönmez.',
  mcps: 'MCP sunucularını ekle, araçlarını listele ve yetenekleri el ile çağır; günlük burada tutulur.',
  catalog: 'Entegrasyon ve MCP şablonları tek ızgarada. Kurulum adımları kartın içinde yazılıdır.',
  audit: 'Yalnız üst veri gösterilir: işlem, kod, zaman ve sonuç. Gizli içerik asla listelenmez.',
  connect: '124 hazır bağlantı tek ekranda. Arama, tür ve kategori ile süz; kart seçip “Nasıl alınır” adımlarını izle.',
  chat: 'Rol ve model seçmeden de yazabilirsin; varsayılan rol Lider’dir. Konuşmalar soldaki listede saklanır.'
};

/** Ekran başlığındaki ? düğmesi: guide ekranına o ekranın bölümüyle gider. */
function screenHelp() {
  const screen = store.screen;
  go('guide');
  const box = $('[data-guide-help]');
  if (!box) return;
  box.hidden = false;
  const title = $('[data-field="guide-help-title"]');
  const where = $('[data-field="guide-help-screen"]');
  const body = $('[data-field="guide-help-body"]');
  const actions = $('[data-guide-help-actions]');
  const meta = SCREEN_META[screen] || { title: screen };
  if (title) title.textContent = `${meta.title} — yardım`;
  if (where) where.textContent = screen;
  if (body) body.textContent = SCREEN_HELP[screen] || 'Bu ekranın yardımı yakında burada olacak.';
  if (actions) {
    actions.replaceChildren();
    if (screen !== 'providers') {
      actions.append(el('button', {
        class: 'kv-button kv-button--sm', type: 'button', text: 'Sağlayıcı kurulumuna git',
        'data-guide-link': 'providers', onclick: () => go('providers')
      }));
    }
    actions.append(el('button', {
      class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'İlk kurulumu yeniden aç',
      onclick: () => onboardOpen(true)
    }));
  }
  if (typeof box.scrollIntoView === 'function') box.scrollIntoView({ block: 'nearest' });
}

/** Bilinmeyen hata kodlarını Türkçeye çevirir; ham değeri (sır olabilir) geri vermez. */
function onboardErrorText(err) {
  const code = err && err.code;
  const map = {
    E_BAD_REQUEST: 'Anahtar biçimi kabul edilmedi.',
    E_SECRET_MISSING: 'Kayıtlı anahtar bulunamadı.',
    E_NOT_FOUND: 'Sağlayıcı bulunamadı.',
    E_UNAUTHORIZED: 'Anahtar yetkilendirilmedi (401).',
    E_FORBIDDEN: 'Erişim reddedildi (403).',
    E_TIMEOUT: 'Sağlayıcı yanıt vermedi.',
    E_OFFLINE: 'Ağa ulaşılamıyor.',
    E_INTERNAL: 'İşlem tamamlanamadı.'
  };
  return map[code] || 'işlem başarısız';
}

function onboardStatus(text, tone) {
  const node = $('[data-field="onboard-status"]');
  if (!node) return;
  node.hidden = !text;
  node.textContent = text || '';
  if (tone) node.dataset.tone = tone;
}

/** settings:set ile kalıcı yapar; köprü yoksa da akışı kilitlemez. */
async function onboardPersist(value) {
  const res = await call(KV && KV.settings && KV.settings.set, { onboarded: Boolean(value) });
  store.onboarded = Boolean(value);
  return res.ok;
}

/** Sağlayıcı listesini tazeler. `preferredId` verilirse o sağlayıcı seçilir. */
async function onboardLoadProviders(preferredId) {
  const res = await call(KV && KV.provider && KV.provider.list);
  const list = (res.ok && res.data && Array.isArray(res.data.providers)) ? res.data.providers : [];
  onboard.providers = list;
  if (preferredId && list.some((p) => p.id === preferredId)) {
    onboard.providerId = preferredId;
  } else if (!list.some((p) => p.id === onboard.providerId)) {
    onboard.providerId = list.length ? list[0].id : '';
  }
  onboard.savedSig = '';
  /* Liste değiştiyse gövdeyi yeniden kur: sağlayıcı varsa "yeni sağlayıcı"
     formu kaybolmalı, seçim de güncel kalmalı. Yazılan anahtar korunur. */
  if (onboard.step === 1) onboardRender();
}

/** Yalnız seçimi tazeler; yapıştırılan anahtar alanına dokunmaz. */
function onboardFillSelect() {
  const sel = $('[data-field="onboard-provider"]');
  if (!sel) return;
  sel.replaceChildren();
  if (!onboard.providers.length) {
    sel.append(el('option', { value: '', text: 'Sağlayıcı yok — aşağıdan ekle' }));
  } else {
    for (const p of onboard.providers) {
      sel.append(el('option', {
        value: p.id,
        text: `${p.name || p.id}${(p.keys || []).length ? ` · ${p.keys.length} anahtar` : ''}`
      }));
    }
  }
  sel.value = onboard.providerId;
}

function onboardFooter(extra) {
  const never = el('label', { class: 'kv-field kv-field--inline' }, [
    el('input', { type: 'checkbox', 'data-field': 'onboard-never' }),
    el('span', { text: 'bir daha gösterme' })
  ]);
  const check = never.querySelector('input');
  check.addEventListener('change', () => { if (check.checked) onboardFinish(null); });
  return [...extra,
    el('button', {
      class: 'kv-button kv-button--ghost kv-button--sm', type: 'button',
      text: 'Atla', 'data-action': 'onboard-skip'
    }),
    never
  ];
}

/** Panel gövdesini ve düğmelerini mevcut adıma göre yeniden kurar. */
function onboardRender() {
  onboardPaint();
  onboardFocusFirst();
}

/** Paneldeki görünür ve etkin denetimler (Tab döngüsü için). */
function onboardFocusables() {
  const root = $('[data-onboard]');
  if (!root) return [];
  return [...root.querySelectorAll('button, input, select, textarea, summary, a[href]')]
    .filter((node) => !node.disabled && node.getClientRects().length > 0);
}

/** Panel açıldığında odak panelin içine girer; aksi halde klavye arkada kalır. */
function onboardFocusFirst() {
  const root = $('[data-onboard]');
  if (!root || root.hasAttribute('hidden')) return;
  const target = $('[data-field="onboard-key"]')
    || $('[data-field="onboard-provider"]')
    || onboardFocusables()[0];
  if (!target) return;
  try { target.focus(); } catch { /* ignore */ }
}

/** `aria-modal` sözü: Tab odağı panelin dışına çıkmaz. */
function onboardTrap(event) {
  if (event.key !== 'Tab') return;
  const root = $('[data-onboard]');
  if (!root || root.hasAttribute('hidden')) return;
  const items = onboardFocusables();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!items.includes(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function onboardPaint() {
  const body = $('[data-onboard-body]');
  const actions = $('[data-onboard-actions]');
  const title = $('[data-field="onboard-title"]');
  if (!body || !actions) return;
  if (title) title.textContent = ONBOARD_TITLE;
  const previousKey = ($('[data-field="onboard-key"]') || {}).value || '';
  body.replaceChildren();
  actions.replaceChildren();
  body.append(el('p', {
    class: 'kv-muted kv-mono', 'data-field': 'onboard-step',
    text: `Adım ${onboard.step} / 3`
  }));
  onboardStatus('');

  if (onboard.step === 1) {
    const sel = el('select', { class: 'kv-input', 'data-field': 'onboard-provider' });
    body.append(
      el('p', { class: 'kv-muted', text: 'Sağlayıcıyı seç (ya da hazır olandan ekle), API anahtarını yapıştır, Test et ve Kaydet. Anahtar DPAPI ile şifrelenir; bir daha düz metin gösterilmez.' }),
      el('div', { class: 'kv-field' }, [el('label', { text: 'Sağlayıcı' }), sel])
    );
    onboardFillSelect();
    sel.addEventListener('change', () => {
      onboard.providerId = sel.value;
      onboard.savedSig = '';
      onboardStatus('');
    });

    if (!onboard.providers.length) {
      const preset = el('select', { class: 'kv-input', 'data-field': 'onboard-new-preset' }, [
        el('option', { value: '', text: 'Hazır sağlayıcı seç…' }),
        ...PROVIDER_PRESETS.map((p) => el('option', { value: p.url, text: p.name })),
        el('option', { value: 'custom', text: 'Özel — kendi adresim' })
      ]);
      const name = el('input', { class: 'kv-input', placeholder: 'Örn. Evren Ekibim', 'data-field': 'onboard-new-name' });
      const url = el('input', { class: 'kv-input kv-mono', placeholder: 'https://…/v1', 'data-field': 'onboard-new-url' });
      preset.addEventListener('change', () => {
        if (!preset.value || preset.value === 'custom') { name.focus(); return; }
        const found = PROVIDER_PRESETS.find((p) => p.url === preset.value);
        name.value = found ? found.name : '';
        url.value = preset.value;
        onboardStatus(preset.value.includes('127.0.0.1')
          ? 'Yerel sunucu seçildi: API anahtarı gerekmez, doğrudan “Sağlayıcı oluştur” ve “Kaydet ve devam”.'
          : 'Adres dolduruldu. “Sağlayıcı oluştur”a bas, sonra anahtarı yapıştır.', 'info');
      });
      body.append(
        el('div', { class: 'kv-field' }, [el('label', { text: 'Hazır sağlayıcı' }), preset]),
        el('div', { class: 'kv-field' }, [el('label', { text: 'Yeni sağlayıcı adı' }), name]),
        el('div', { class: 'kv-field' }, [el('label', { text: 'Temel adres' }), url]),
        el('button', {
          class: 'kv-button kv-button--sm', type: 'button', text: 'Sağlayıcı oluştur',
          'data-action': 'onboard-provider-new'
        })
      );
    }

    const key = el('input', {
      class: 'kv-input kv-mono', type: 'password', autocomplete: 'off',
      placeholder: 'API anahtarını yapıştır', 'data-field': 'onboard-key'
    });
    key.value = previousKey;
    body.append(
      el('div', { class: 'kv-field' }, [el('label', { text: 'API anahtarı' }), key]),
      el('details', {}, [
        el('summary', { text: 'Anahtar nereden alınır?' }),
        el('p', { class: 'kv-muted', text: `${KEY_HELP} Yerel sunucu (Ollama gibi) kullanıyorsan anahtar alanını boş bırakabilirsin.` })
      ])
    );
    actions.append(...onboardFooter([
      el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Test et', 'data-action': 'onboard-test' }),
      el('button', { class: 'kv-button kv-button--sm', type: 'button', text: 'Kaydet ve devam', 'data-action': 'onboard-save' })
    ]));
    return;
  }

  if (onboard.step === 2) {
    const total = store.preset.items.length || 124;
    body.append(
      el('h3', { text: 'Hazır bağlantılar' }),
      el('p', {
        class: 'kv-muted',
        text: `${total} hazır bağlantıdan birini seçebilirsin. Kartın içindeki “Nasıl alınır” adımları kurulumu gösterir; API anahtarın hazırsa hemen kullanabilirsin.`
      })
    );
    actions.append(...onboardFooter([
      el('button', { class: 'kv-button kv-button--sm', type: 'button', text: 'connect ekranına git', 'data-action': 'onboard-connect' }),
      el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Model seçime geç', 'data-action': 'onboard-next' })
    ]));
    return;
  }

  body.append(
    el('h3', { text: 'Model seç' }),
    el('p', {
      class: 'kv-muted',
      text: 'Model Merkezi’nde havuzdan bir model seç. Sağlayıcı anahtarın kayıtlıysa model otomatik olarak kullanılır; dilediğin an değiştirebilirsin.'
    })
  );
  actions.append(...onboardFooter([
    el('button', { class: 'kv-button kv-button--sm', type: 'button', text: 'models ekranına git', 'data-action': 'onboard-models' })
  ]));
}

/** Paneli açar. force=true ise kullanıcı yardımdan yeniden açmak istedi. */
function onboardOpen(force) {
  const root = $('[data-onboard]');
  if (!root) return;
  if (!force && store.onboarded) { root.hidden = true; return; }
  root.hidden = false;
  onboard.step = 1;
  onboardRender();
  onboardLoadProviders();
}

async function onboardFinish(target) {
  await onboardPersist(true);
  const root = $('[data-onboard]');
  if (root) root.hidden = true;
  if (target) go(target);
  else go('team');
  toast('Kurulum tamamlandı. İyi çalışmalar.', 'success');
}

async function onboardCreateProvider() {
  const name = $('[data-field="onboard-new-name"]');
  const url = $('[data-field="onboard-new-url"]');
  if (!name || !url || !name.value.trim() || !url.value.trim()) {
    onboardStatus('Sağlayıcı adı ve temel adres gerekli.', 'warning');
    return;
  }
  const res = await call(KV && KV.provider && KV.provider.save, {
    provider: { name: name.value.trim(), baseURL: url.value.trim(), models: [] },
    confirmToken: makeConfirmToken()
  });
  if (!res.ok) {
    onboardStatus('Sağlayıcı eklenemedi: ' + onboardErrorText(res.error) + ' ' + KEY_HELP, 'danger');
    return;
  }
  const created = res.data && res.data.provider ? res.data.provider : null;
  await onboardLoadProviders(created ? created.id : undefined);
  const local = created && isLocalProviderUrl(created.baseURL);
  onboardStatus(local
    ? 'Yerel sağlayıcı eklendi. API anahtarı gerekmez — “Kaydet ve devam” ile ilerleyin.'
    : 'Sağlayıcı eklendi. Şimdi API anahtarını yapıştır.', 'success');
}

/** kv:provider:test yalnız KAYITLI anahtarları dener; bu yüzden önce keyAdd çağrılır.
   İkinci tıklamada yinelenen kayıt olmasın diye savedSig tutulur. Sır yalnızca
   keyAdd'a gider; test'e yalnız providerId verilir. */
async function onboardEnsureKey(providerId, key) {
  const sig = `${providerId}::${key}`;
  if (onboard.savedSig === sig) return true;
  const add = await call(KV && KV.provider && KV.provider.addKey, {
    providerId, key, label: 'İlk kurulum', confirmToken: makeConfirmToken()
  });
  if (!add.ok) {
    onboardStatus('Anahtar kaydedilemedi: ' + onboardErrorText(add.error) + ' ' + KEY_HELP, 'danger');
    return false;
  }
  onboard.savedSig = sig;
  return true;
}

function onboardInput() {
  const sel = $('[data-field="onboard-provider"]');
  const keyEl = $('[data-field="onboard-key"]');
  return { providerId: sel ? sel.value : '', key: keyEl ? keyEl.value.trim() : '', keyEl };
}

/** Seçili sağlayıcı kaydı (yerel mi, adresi ne?) — DOM'da yalnız kimliği var. */
function onboardSelectedProvider() {
  const { providerId } = onboardInput();
  return onboard.providers.find((p) => p.id === providerId) || null;
}

async function onboardTest() {
  const { providerId, key } = onboardInput();
  if (!providerId) { onboardStatus('Önce bir sağlayıcı seçin.', 'warning'); return; }
  const provider = onboardSelectedProvider();
  const local = Boolean(provider && isLocalProviderUrl(provider.baseURL));
  if (!local && key.length < 8) { onboardStatus('API anahtarı en az 8 karakter olmalı.', 'warning'); return; }
  if (onboard.busy) return;
  onboard.busy = true;
  onboardStatus(local && key.length < 8
    ? 'Yerel sunucu anahtarsız test ediliyor…'
    : 'Anahtar kaydedilip bağlantı test ediliyor…', 'info');
  if (key.length >= 8) {
    if (!(await onboardEnsureKey(providerId, key))) { onboard.busy = false; return; }
  }
  const res = await call(KV && KV.provider && KV.provider.test, { providerId, path: '/models' });
  onboard.busy = false;
  if (res.ok) {
    onboardStatus('Bağlantı çalışıyor. “Kaydet ve devam” ile devam edin.', 'success');
  } else {
    onboardStatus('Test başarısız: ' + onboardErrorText(res.error) + ' ' + KEY_HELP, 'danger');
  }
}

async function onboardSave() {
  const { providerId, key, keyEl } = onboardInput();
  if (!providerId) { onboardStatus('Önce bir sağlayıcı seçin.', 'warning'); return; }
  const provider = onboardSelectedProvider();
  const local = Boolean(provider && isLocalProviderUrl(provider.baseURL));
  if (!local && key.length < 8) { onboardStatus('API anahtarı en az 8 karakter olmalı.', 'warning'); return; }
  if (onboard.busy) return;
  onboard.busy = true;
  onboardStatus(local && key.length < 8 ? 'Yerel sağlayıcı kaydediliyor…' : 'Anahtar kaydediliyor…', 'info');
  if (key.length >= 8) {
    if (!(await onboardEnsureKey(providerId, key))) { onboard.busy = false; return; }
  }
  if (keyEl) keyEl.value = '';
  onboard.busy = false;
  onboard.step = 2;
  onboardRender();
}

/** İlk açılışta paneli gösterir; onboarded:true ise hiç dokunmaz. */
async function onboardBoot() {
  const root = $('[data-onboard]');
  if (!root) return;
  if (store.onboarded) { root.hidden = true; return; }
  root.hidden = false;
  onboard.step = 1;
  onboardRender();
  await onboardLoadProviders();
}

/* ---------------- açılış ---------------- */
async function boot() {
  installCrashGuard();
  loadPrefs();
  bindControls();
  bindTur4();
  initTur6({
    KV,
    call,
    el,
    badge,
    toast,
    go,
    store,
    hhmm,
    makeConfirmToken,
    setGoSilent: (v) => { goSilent = Boolean(v); }
  });
  initTur8({
    KV,
    call,
    el,
    badge,
    toast,
    go,
    store,
    hhmm,
    copyText,
    makeConfirmToken,
    modal,
    closeModal,
    summarizePage: () => tur6Action('browser-summarize'),
    tur6DeskRefresh,
    navOpenTask: (id) => navOpen(navEntryOf('task', id)),
    navOpenReport: (id) => navOpen(navEntryOf('report', id)),
    navOpenScreen: (screen) => navOpen(navEntryOf('screen', screen)),
    votionSay: (text) => tur6VotionSay(text),
    votionPrefill: (text) => tur6VotionPrefill(text)
  });
  bindEvents();
  renderNotifications();
  setConnection('connecting');
  goSilent = true;
  go('team');
  goSilent = false;
  /* ilk sekme: açılış ekranı */
  navigator.tabs.push({ id: `tab${navigator.seq++}`, stack: [navEntryOf('screen', 'team')], at: 0 });
  navigator.active = 0;
  renderTabs();
  syncStatus();

  let connected = await pingConnection();
  /* T-205/T-206: açılışta sunucu yeni başlıyor olabilir (main arka planda
     başlatır). Kullanıcıya "bağlantı yok" göstermeden önce birkaç kez daha
     dene; 12 sn sonra da main'in `server.changed` olayı göstergeyi düzeltir. */
  for (let i = 0; i < 12 && !connected; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    connected = await pingConnection();
  }
  await refreshTeam();
  await refreshModels();
  await refreshReports();
  await refreshBoard();
  await loadSettings();
  await loadMessages();

  /* Tur 4: yerel servisler (sunucu gerekmez) */
  await refreshMemory();
  await refreshProjects();
  await refreshProviders();
  await refreshSkills();
  await refreshPermissions();
  await refreshVotionGrants();
  await refreshChats();
  await refreshRemote();
  updateChatCounter();

  if (!connected && !store.notifications.length) {
    notify('Bağlantı kurulamadı', 'Ayarlar → parola ve sunucu adresi', 'warning');
  }
  if (store.sessions.length) {
    notify('Ekip yüklendi', `${store.sessions.length} seans`, 'success');
  }
  renderNotifications();
  syncStatus();
  renderTabs();

  /* T-153: ilk açılışta karşılama paneli; tamamlandıysa hiç görünmez. */
  await onboardBoot();
  /* Rehber tamamlanmadıysa ilk açılışta rehber ekranı gösterilir (T6-1). */
  await tur6Boot();
  /* Tur 8: sağ panel ilk çizimi. */
  tur8Boot();
  await autoCapture(
    [
      'Keyvotion Console açıldı; ekranlar ve yerel servisler yüklendi.',
      `Bağlantı durumu: ${store.connection}.`,
      `Ekip: ${store.sessions.length} seans, pano: ${store.board.rows.length} görev.`
    ].join('\n'),
    'acilis',
    'LDR'
  );
}

/* ================= TUR 12 (T-120/T-122): BAĞLANTI KATMANI (UI §15) =============
 * Sır renderer'da tutulmaz: değer yalnız form alanından okunur, gönderildikten
 * sonra boşaltılır; textContent / log / push yüküne asla karışmaz (UI-142).
 * Satır ekleme DOM API (createElement + textContent) ile yapılır; ham HTML yazılmaz.
 */

const LOG_LIMIT = 200;

function setFieldText(name, value) {
  for (const node of $$(`[data-field="${name}"]`)) node.textContent = String(value == null ? '—' : value);
}

function toneForState(state) {
  if (state === 'connected' || state === 'ok' || state === 'ready') return 'success';
  if (state === 'error' || state === 'failed' || state === 'unauthorized') return 'error';
  if (state === 'degraded' || state === 'connecting' || state === 'busy' || state === 'untested') return 'warning';
  return 'idle';
}

/** Ham bağlantı durumunu §5.3 data-conn-state kümesine indirger. */
function connStateFor(state) {
  if (state === 'connected' || state === 'ready' || state === 'ok' || state === 'online') return 'connected';
  if (state === 'degraded' || state === 'connecting' || state === 'busy') return 'degraded';
  if (state === 'error' || state === 'failed' || state === 'unauthorized') return 'error';
  /* v3.1 (UI-144): OAuth yaşam döngüsü rozetleri yalnız renkle verilmez. */
  if (state === 'expired' || state === 'revoked' || state === 'pending') return state;
  return 'untested';
}

/** data-conn-state → §5.1 data-state eşlemesi (UI C3). */
const CONN_TO_STATE = {
  connected: 'idle', degraded: 'busy', error: 'error', untested: 'offline',
  expired: 'busy', revoked: 'offline', pending: 'busy'
};

/** v3.1: yeni OAuth durumlarının rozet tonu (UI-147: metin her zaman var). */
function toneForConn(conn) {
  if (conn === 'expired') return 'warning';
  if (conn === 'revoked') return 'offline';
  if (conn === 'pending') return 'busy';
  return toneForState(conn);
}

/** 200 satırlık halka tampon: en eski satır düşer. */
function appendRing(container, text) {
  if (!container) return;
  container.append(el('li', { class: 'kv-log__line', text: String(text) }));
  while (container.children.length > LOG_LIMIT) container.firstElementChild.remove();
}

function updateMcpLogCount() {
  const log = $('[data-mcp-log]');
  const count = $('[data-field="mcp-log-count"]');
  if (log && count) count.textContent = String(log.children.length);
}

/* ---------------- entegrasyonlar ---------------- */

let integrationOff = null;
let integrationFormBound = false;

function bindIntegrationEvents() {
  if (!integrationFormBound) {
    const form = $('[data-integration-form]');
    if (form) form.addEventListener('submit', (e) => e.preventDefault());
    integrationFormBound = true;
  }
  if (integrationOff) return;
  if (!(KV && typeof KV.onIntegration === 'function')) return;
  integrationOff = KV.onIntegration((packet) => {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'state') {
      const acc = store.integration.accounts.find((x) => x.id === packet.id);
      if (acc && packet.state) acc.state = packet.state;
      renderIntegrationAccounts();
      appendRing($('[data-integration-activity]'), `${hhmm()} · ${packet.id || '?'} → ${packet.state || 'state'}`);
    } else if (packet.type === 'log') {
      appendRing($('[data-integration-activity]'), `${hhmm()} · ${packet.id || '?'} · ${packet.message || 'log'}`);
    }
  });
}

function unbindIntegrationEvents() {
  if (!integrationOff) return;
  try { integrationOff(); } catch { /* köprü koptuysa */ }
  integrationOff = null;
}

async function refreshIntegrations() {
  const res = await call(KV && KV.integration && KV.integration.list);
  if (!res.ok) { toast('Katalog alınamadı', res.error && res.error.code, 'warning'); return; }
  const data = res.data || {};
  store.integration.catalog = Array.isArray(data.catalog) ? data.catalog : [];
  store.integration.accounts = Array.isArray(data.accounts) ? data.accounts : [];
  store.integration.loaded = true;
  if (!store.integration.providerId && store.integration.catalog.length) {
    store.integration.providerId = store.integration.catalog[0].id;
  }
  renderIntegrations();
}

function renderIntegrations() {
  const st = store.integration;
  const catalog = Array.isArray(st.catalog) ? st.catalog : [];
  setFieldText('integration-catalog-count', catalog.length);

  /* T-196: liste mi detay mı? Detayda katalog gizlenir, başlık şeridi açılır. */
  const root = $('.kv-integrations');
  const detail = $('[data-integration-detail]');
  if (root) root.setAttribute('data-integrations-view', st.view === 'detail' ? 'detail' : 'list');
  if (detail) detail.hidden = st.view !== 'detail';
  if (st.view === 'detail') {
    const prov = catalog.find((p) => p.id === st.providerId);
    const acc = st.accounts.filter((a) => a.providerId === st.providerId);
    setFieldText('integration-detail-title', prov ? String(prov.name || prov.id) : st.providerId || '—');
    setFieldText('integration-detail-sub', prov
      ? `${String(prov.category || 'other')} · ${String((prov.auth && prov.auth.kind) || '—')} · ${acc.length} hesap`
      : 'Sağlayıcı katalogda yok.');
    const badge = $('[data-field="integration-detail-badge"]');
    if (badge) {
      const state = acc.some((a) => a.state === 'connected') ? 'connected'
        : acc.some((a) => a.state === 'error') ? 'error'
          : acc.length ? 'untested' : 'idle';
      badge.textContent = String(state);
      badge.setAttribute('data-tone', toneForState(state));
      badge.setAttribute('data-conn-state', connStateFor(state));
      badge.setAttribute('data-state', CONN_TO_STATE[connStateFor(state)]);
    }
  }

  /* Kategori sekmeleri katalogdan üretilir; sağlayıcı sayısı sabit değildir. */
  const tabs = $('.kv-integration-tabs');
  if (tabs) {
    const cats = [...new Set(catalog.map((p) => String(p.category || 'other')))];
    const tab = (key, label) => el('button', {
      class: 'kv-chip kv-chip--button', type: 'button', role: 'tab',
      'data-integration-category': key, 'aria-selected': String(st.category === key),
      onclick: () => { st.category = key; renderIntegrations(); }
    }, [label]);
    tabs.replaceChildren(tab('all', 'Tümü'), ...cats.map((c) => tab(c, c)));
  }

  const host = $('[data-integration-catalog]');
  if (host) {
    const shown = st.category === 'all'
      ? catalog
      : catalog.filter((p) => String(p.category || 'other') === st.category);
    if (!shown.length) {
      host.replaceChildren(el('p', { class: 'kv-empty', text: catalog.length ? 'Bu kategoride sağlayıcı yok.' : 'Katalog boş.' }));
    } else {
      host.replaceChildren(...shown.map((p) => {
        const acc = st.accounts.find((a) => a.providerId === p.id);
        const state = acc && acc.state ? acc.state : 'untested';
        const conn = connStateFor(state);
        return el('button', {
          class: 'kv-card', type: 'button', 'data-action': 'integration-pick',
          'data-provider-id': p.id, 'data-state': CONN_TO_STATE[conn], 'data-conn-state': conn,
          'aria-pressed': String(st.providerId === p.id)
        }, [
          el('span', { class: 'kv-card__title', text: String(p.name || p.id) }),
          el('span', { class: 'kv-badge', 'data-tone': 'info', text: String(p.category || 'other') }),
          el('span', { class: 'kv-muted', 'data-field': 'integration-auth-kind', text: String((p.auth && p.auth.kind) || '—') }),
          el('span', { class: 'kv-row' }, [
            el('i', { class: 'kv-dot', 'data-tone': toneForState(state) }),
            el('span', { class: 'kv-muted kv-mono', text: state })
          ])
        ]);
      }));
    }
  }
  renderIntegrationAccounts();
  renderIntegrationForm();
  renderIntegrationCapabilities();
}

function renderIntegrationAccounts() {
  const host = $('[data-integration-accounts]');
  if (!host) return;
  const st = store.integration;
  /* T-196: detay görünümünde yalnız seçili sağlayıcının hesapları listelenir. */
  const accounts = st.view === 'detail'
    ? st.accounts.filter((a) => a.providerId === st.providerId)
    : st.accounts;
  const badge = $('[data-field="integration-account-state"]');
  const worst = accounts.some((a) => a.state === 'error') ? 'error'
    : accounts.some((a) => a.state === 'connected') ? 'connected'
      : accounts.length ? 'untested' : 'idle';
  if (badge) {
    const conn = connStateFor(worst);
    badge.textContent = worst;
    badge.setAttribute('data-state', CONN_TO_STATE[conn]);
    badge.setAttribute('data-conn-state', conn);
    badge.setAttribute('data-tone', toneForState(worst));
  }
  if (!accounts.length) {
    host.replaceChildren(el('p', { class: 'kv-empty', text: 'Henüz bağlı hesap yok.' }));
    return;
  }
  host.replaceChildren(...accounts.map((a) => {
    const conn = connStateFor(a.state);
    return el('article', {
      class: 'kv-card', 'data-state': CONN_TO_STATE[conn], 'data-conn-state': conn, 'data-account': a.id
    }, [
      el('div', { class: 'kv-card__title', text: String(a.label || a.providerId || a.id) }),
      el('div', { class: 'kv-row' }, [
        el('span', { class: 'kv-muted kv-mono', text: String(a.providerId || '') }),
        el('span', { class: 'kv-badge', 'data-tone': toneForState(a.state), text: String(a.state || 'untested') })
      ]),
      el('div', { class: 'kv-card__actions' }, [
        el('button', { class: 'kv-button kv-button--sm', type: 'button', 'data-action': 'integration-select', 'data-account-id': a.id, text: 'Seç' }),
        el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'integration-remove', 'data-account-id': a.id, text: 'Kaldır' })
      ])
    ]);
  }));
}

function renderIntegrationForm() {
  const st = store.integration;
  const sel = $('[data-field="integration-provider"]');
  if (sel) {
    sel.replaceChildren(
      el('option', { value: '', text: '— sağlayıcı seç —' }),
      ...st.catalog.map((p) => el('option', { value: p.id, text: String(p.name || p.id), selected: p.id === st.providerId }))
    );
    sel.value = st.providerId || '';
  }
  const prov = st.catalog.find((p) => p.id === st.providerId);
  setFieldText('integration-scopes', prov && Array.isArray(prov.scopes) ? prov.scopes.join(', ') : '—');
}

function renderIntegrationCapabilities() {
  const host = $('[data-integration-capabilities]');
  const caps = store.integration.capabilities;
  setFieldText('integration-capability-summary', caps.length ? `${caps.length} yetenek` : '—');
  if (!host) return;
  if (!caps.length) {
    host.replaceChildren(el('p', { class: 'kv-empty', text: 'Sağlayıcı seçildiğinde yetenekler listelenir.' }));
    return;
  }
  host.replaceChildren(...caps.map((c) => el('article', { class: 'kv-card', 'data-capability': c.id }, [
    el('div', { class: 'kv-row' }, [
      el('span', { class: 'kv-badge', 'data-tone': 'info', text: String(c.verb || 'GET') }),
      el('span', { class: 'kv-mono', text: String(c.id || '') })
    ]),
    el('p', { class: 'kv-muted', text: String(c.summary || '') }),
    el('button', { class: 'kv-button kv-button--sm', type: 'button', 'data-action': 'integration-invoke', 'data-capability': c.id, text: 'Çalıştır' })
  ])));
}

async function loadCapabilities(providerId) {
  if (!providerId) { store.integration.capabilities = []; renderIntegrationCapabilities(); return; }
  const res = await call(KV && KV.integration && KV.integration.capabilities, { providerId });
  store.integration.capabilities = res.ok && Array.isArray(res.data && res.data.capabilities) ? res.data.capabilities : [];
  renderIntegrationCapabilities();
}

async function pickIntegration(providerId, opts) {
  const st = store.integration;
  st.providerId = providerId || '';
  st.accountId = '';
  st.view = st.providerId ? 'detail' : 'list';
  const secretInput = $('[data-field="integration-token"]');
  if (secretInput) secretInput.value = '';
  renderIntegrations();
  await loadCapabilities(st.providerId);
  /* T-196: detay kendi gezinme kaydıdır — Alt+Sol / Geri düğmesi listeye döner. */
  if (st.view === 'detail' && !(opts && opts.silent)) {
    navRecord(navEntryOf('integration', st.providerId));
    const main = $('[data-main]');
    if (main) main.scrollTop = 0;
  }
}

/** T-196: detaydan listeye dön — gezinme geçmişi varsa onu kullanır. */
function closeIntegrationDetail() {
  const tab = navigator.tabs[navigator.active];
  if (tab && tab.at > 0) { navBack(); return; }
  const st = store.integration;
  st.view = 'list';
  st.providerId = '';
  st.accountId = '';
  st.capabilities = [];
  renderIntegrations();
  syncAddress();
}

async function saveIntegration() {
  const st = store.integration;
  const select = $('[data-field="integration-provider"]');
  const providerId = st.providerId || (select ? select.value : '');
  const labelInput = $('[data-field="integration-label"]');
  const secretInput = $('[data-field="integration-token"]');
  if (!providerId) { toast('Sağlayıcı seçin.', 'warning'); return; }
  const body = { providerId, label: String(labelInput && labelInput.value ? labelInput.value.trim() : providerId) };
  if (secretInput && secretInput.value) body.token = String(secretInput.value);
  const res = await call(KV && KV.integration && KV.integration.save, {
    ...body,
    confirmToken: makeConfirmToken()
  });
  if (secretInput) secretInput.value = '';
  if (res.ok) { toast('Entegrasyon kaydedildi.', 'success'); await refreshIntegrations(); }
  else toast('Kaydedilemedi', res.error && res.error.code, 'warning');
}

async function testIntegration() {
  const st = store.integration;
  const id = st.accountId || (st.accounts[0] && st.accounts[0].id);
  if (!id) { toast('Test edilecek hesap yok.', 'warning'); return; }
  const res = await call(KV && KV.integration && KV.integration.test, { id });
  if (!res.ok) { toast('Test başarısız', res.error && res.error.code, 'warning'); return; }
  const state = res.data && res.data.state;
  const acc = st.accounts.find((a) => a.id === id);
  if (acc && state) acc.state = state;
  renderIntegrationAccounts();
  toast(`Test tamamlandı: ${state || '—'}`, 'success');
}

function removeIntegration(id) {
  if (!id) return;
  modal({
    title: 'Hesabı kaldır',
    sub: `${id} · bu işlem geri alınamaz.`,
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Kaldır', onclick: async () => {
        closeModal();
        const res = await call(KV && KV.integration && KV.integration.remove, { id, confirmToken: makeConfirmToken() });
        if (res.ok) { toast('Hesap kaldırıldı.', 'success'); await refreshIntegrations(); }
        else toast('Kaldırılamadı', res.error && res.error.code, 'warning');
      } })
    ]
  });
}

function invokeIntegration(capability) {
  const st = store.integration;
  const id = st.accountId || (st.accounts.find((a) => a.providerId === st.providerId) || {}).id;
  if (!id) { toast('Önce bir hesap seçin.', 'warning'); return; }
  modal({
    title: 'Yeteneği çalıştır',
    sub: `${capability} · ${id} · dış etkili çağrı`,
    body: [el('p', { class: 'kv-modal__sub', text: 'Parametreler audit kaydına yazılmaz; yalnız hedef ve yetenek adı.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Çalıştır', onclick: async () => {
        closeModal();
        const res = await call(KV && KV.integration && KV.integration.invoke, { id, capability, params: {} });
        const status = res.ok ? (res.data && res.data.status != null ? res.data.status : 'ok') : (res.error && res.error.code);
        appendRing($('[data-integration-activity]'), `${hhmm()} · ${capability} → ${status}`);
        toast(res.ok ? 'Çağrı tamamlandı.' : 'Çağrı başarısız', res.ok ? 'success' : 'warning');
      } })
    ]
  });
}

/* ---------------- MCP sunucuları ---------------- */

let mcpOff = null;
let mcpFormBound = false;

function bindMcpEvents() {
  if (!mcpFormBound) {
    const form = $('[data-mcp-form]');
    if (form) form.addEventListener('submit', (e) => e.preventDefault());
    mcpFormBound = true;
  }
  if (mcpOff) return;
  if (!(KV && typeof KV.onMcp === 'function')) return;
  mcpOff = KV.onMcp((packet) => {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'state') {
      const srv = store.mcp.servers.find((x) => x.id === packet.id);
      if (srv && packet.state) srv.state = packet.state;
      renderMcpServers();
      appendRing($('[data-mcp-log]'), `${hhmm()} · ${packet.id || '?'} → ${packet.state || 'state'}`);
    } else if (packet.type === 'tools') {
      if (Array.isArray(packet.tools)) store.mcp.tools = packet.tools;
      renderMcpTools();
    } else if (packet.type === 'log') {
      appendRing($('[data-mcp-log]'), `${hhmm()} · ${packet.id || '?'} · ${packet.line || 'log'}`);
    }
    updateMcpLogCount();
  });
}

function unbindMcpEvents() {
  if (!mcpOff) return;
  try { mcpOff(); } catch { /* köprü koptuysa */ }
  mcpOff = null;
}

async function refreshMcps() {
  const res = await call(KV && KV.mcp && KV.mcp.list);
  if (!res.ok) { toast('MCP listesi alınamadı', res.error && res.error.code, 'warning'); return; }
  const data = res.data || {};
  store.mcp.servers = Array.isArray(data.servers) ? data.servers : [];
  store.mcp.loaded = true;
  if (!store.mcp.selected && store.mcp.servers.length) store.mcp.selected = store.mcp.servers[0].id;
  renderMcps();
}

function renderMcps() {
  renderMcpServers();
  renderMcpTools();
  updateMcpLogCount();
}

function renderMcpServers() {
  const host = $('[data-mcp-servers]');
  if (!host) return;
  const servers = store.mcp.servers;
  if (!servers.length) {
    host.replaceChildren(el('p', { class: 'kv-empty', text: 'Kayıtlı MCP sunucusu yok.' }));
    return;
  }
  host.replaceChildren(...servers.map((s) => {
    const conn = connStateFor(s.state);
    return el('article', {
      class: 'kv-card', 'data-state': CONN_TO_STATE[conn], 'data-conn-state': conn, 'data-server': s.id
    }, [
      el('div', { class: 'kv-card__title', text: String(s.name || s.id) }),
      el('div', { class: 'kv-row' }, [
        el('span', { class: 'kv-muted kv-mono', 'data-field': 'mcp-server-transport', text: String(s.transport || '—') }),
        el('span', { class: 'kv-badge', 'data-tone': toneForState(s.state), 'data-field': 'mcp-server-state', text: String(s.state || 'idle') })
      ]),
      el('div', { class: 'kv-card__actions' }, [
        el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'mcp-select', 'data-server-id': s.id, text: 'Seç' }),
        el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'mcp-connect', 'data-server-id': s.id, text: 'Bağlan' }),
        el('button', { class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', 'data-action': 'mcp-remove', 'data-server-id': s.id, text: 'Kaldır' })
      ])
    ]);
  }));
}

function renderMcpTools() {
  const host = $('[data-mcp-tools]');
  if (!host) return;
  const tools = store.mcp.tools;
  if (!tools.length) {
    host.replaceChildren(el('p', { class: 'kv-empty', text: 'Araç listesi için sunucuya bağlanın.' }));
    return;
  }
  host.replaceChildren(...tools.map((t) => {
    const name = String(t.name || '');
    return el('div', { class: 'kv-tool', 'data-tool': name }, [
      el('span', { class: 'tool-name', 'data-field': 'mcp-tool-name', text: name }),
      el('p', { class: 'kv-muted', 'data-field': 'mcp-tool-description', text: String(t.description || '') }),
      el('pre', { class: 'kv-mono', 'data-field': 'mcp-tool-schema', text: JSON.stringify(t.inputSchema || {}) }),
      el('button', {
        class: 'kv-button kv-button--sm', type: 'button', 'data-action': 'mcp-tool-pick', 'data-tool': name,
        'aria-pressed': String(store.mcp.tool === name), text: 'Seç'
      })
    ]);
  }));
}

async function mcpConnect(id) {
  if (!id) return;
  const res = await call(KV && KV.mcp && KV.mcp.connect, { id });
  if (!res.ok) { toast('Bağlanamadı', res.error && res.error.code, 'warning'); return; }
  const srv = store.mcp.servers.find((x) => x.id === id);
  if (srv && res.data && res.data.state) srv.state = res.data.state;
  store.mcp.selected = id;
  store.mcp.tools = Array.isArray(res.data && res.data.tools) ? res.data.tools : [];
  renderMcpServers();
  renderMcpTools();
  toast('Bağlantı kuruldu.', 'success');
}

async function addMcp() {
  const valueOf = (name) => {
    const node = $(`[data-field="${name}"]`);
    return node && node.value ? String(node.value).trim() : '';
  };
  const id = valueOf('mcp-id');
  const name = valueOf('mcp-name');
  const transport = valueOf('mcp-transport') || 'stdio';
  const argsRaw = valueOf('mcp-args');
  if (!id) { toast('Sunucu kimliği gerekli.', 'warning'); return; }
  const body = { id, name, transport };
  if (transport === 'stdio') {
    body.command = valueOf('mcp-command');
    body.args = argsRaw ? argsRaw.split(/\s+/) : [];
  } else {
    body.url = valueOf('mcp-url');
  }
  const res = await call(KV && KV.mcp && KV.mcp.add, {
    ...body,
    confirmToken: makeConfirmToken()
  });
  if (res.ok) { toast('Sunucu eklendi.', 'success'); await refreshMcps(); }
  else toast('Eklenemedi', res.error && res.error.code, 'warning');
}

function removeMcp(id) {
  if (!id) return;
  modal({
    title: 'Sunucuyu kaldır',
    sub: `${id} · yapılandırmadan silinir.`,
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Kaldır', onclick: async () => {
        closeModal();
        const res = await call(KV && KV.mcp && KV.mcp.remove, { id, confirmToken: makeConfirmToken() });
        if (res.ok) { toast('Sunucu kaldırıldı.', 'success'); await refreshMcps(); }
        else toast('Kaldırılamadı', res.error && res.error.code, 'warning');
      } })
    ]
  });
}

function callMcpTool() {
  const id = store.mcp.selected;
  const tool = store.mcp.tool;
  if (!id) { toast('Sunucu seçin.', 'warning'); return; }
  if (!tool) { toast('Araç seçin.', 'warning'); return; }
  const area = $('[data-field="mcp-call-args"]');
  let args = {};
  try {
    args = JSON.parse((area && area.value.trim()) || '{}');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('nesne değil');
  } catch { toast('JSON argümanları geçersiz.', 'warning'); return; }
  modal({
    title: 'Aracı çalıştır',
    sub: `${id} · ${tool} · dış etkili çağrı`,
    body: [el('p', { class: 'kv-modal__sub', text: 'Argümanlar audit kaydına yazılmaz; yalnız sunucu ve araç adı.' })],
    actions: [
      el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: closeModal }),
      el('button', { class: 'kv-button', type: 'button', text: 'Çalıştır', onclick: async () => {
        closeModal();
        const res = await call(KV && KV.mcp && KV.mcp.call, { id, tool, args });
        const out = $('[data-field="mcp-call-result"]');
        if (out) out.textContent = res.ok ? JSON.stringify((res.data && res.data.result) || {}, null, 2) : String((res.error && res.error.code) || 'hata');
        appendRing($('[data-mcp-log]'), `${hhmm()} · ${tool} → ${res.ok ? 'ok' : (res.error && res.error.code)}`);
        updateMcpLogCount();
        toast(res.ok ? 'Çağrı tamamlandı.' : 'Çağrı başarısız', res.ok ? 'success' : 'warning');
      } })
    ]
  });
}

boot();
