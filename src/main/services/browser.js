'use strict';

const { WebContentsView } = require('electron');
const { CODES, ok, fail } = require('../../shared/errors');

/*
 * Uygulama ici tarayici — T4-5.
 *
 * ONEMLI: renderer'da <webview> ve <iframe> YASAK (CSP frame-src 'none',
 * webviewTag:false). Bu yuzden tarayici MAIN prosesde WebContentsView olarak
 * yasar; renderer yalnizca "su dikdortgende goster" der. Boylece renderer'in
 * `connect-src 'none'` politikasi bozulmaz.
 *
 * Gezinme yalniz http(s). file:, javascript:, data: reddedilir.
 * Yeni pencere acma (window.open) reddedilir.
 */

function normalizeUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Chromium ag hatasini kullaniciya anlasilir Turkce metne cevir. */
function describeNetError(code, desc) {
  switch (Number(code)) {
    case -105: return 'Adres çözümlenemedi (DNS). İnternet bağlantısını kontrol edin.';
    case -106: return 'İnternet bağlantısı yok.';
    case -102: return 'Sunucuya bağlanılamadı.';
    case -118: return 'Bağlantı zaman aşımına uğradı.';
    case -201: return 'Sertifika geçersiz — siteye güvenilmiyor.';
    case -202: return 'Sertifika yetkisi reddedildi.';
    case -501: return 'Güvenli bağlantı kurulamadı.';
    case -6: return 'Dosya bulunamadı.';
    case -7: return 'İşlem zaman aşımına uğradı.';
    default: return `Sayfa yüklenemedi${desc ? `: ${desc}` : ''}.`;
  }
}

function sanitizeBounds(b) {
  if (!b || typeof b !== 'object') return null;
  const x = Math.round(Number(b.x));
  const y = Math.round(Number(b.y));
  const width = Math.round(Number(b.width));
  const height = Math.round(Number(b.height));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 80 || height < 80) return null;
  if (width > 20000 || height > 20000) return null;
  return { x: Math.max(0, x), y: Math.max(0, y), width, height };
}

/**
 * @param {{getWindow: () => import('electron').BrowserWindow|null,
 *          onState?: (state: object) => void}} options
 */
function createBrowserService(options) {
  const getWindow = options.getWindow;
  const onState = options.onState || (() => {});

  let view = null;
  let lastURL = null;
  let lastBounds = null;
  let lastLoadError = null;
  let hidden = false;

  function emit() {
    onState(stateData());
  }

  function stateData() {
    if (!view) return { open: false, url: null, title: null, canGoBack: false, canGoForward: false, loading: false };
    const wc = view.webContents;
    let url = null;
    let title = null;
    let canGoBack = false;
    let canGoForward = false;
    let loadError = null;
    try {
      url = wc.getURL() || lastURL || null;
      title = wc.getTitle() || null;
      const h = wc.navigationHistory;
      if (h && typeof h.canGoBack === 'function') {
        canGoBack = Boolean(h.canGoBack());
        canGoForward = Boolean(h.canGoForward());
      } else {
        canGoBack = Boolean(wc.canGoBack && wc.canGoBack());
        canGoForward = Boolean(wc.canGoForward && wc.canGoForward());
      }
      loadError = lastLoadError;
    } catch {
      // Pencere kapanirken
    }
    return {
      open: true,
      url,
      title,
      canGoBack,
      canGoForward,
      loading: Boolean(wc.isLoading && wc.isLoading()),
      error: loadError,
      bounds: lastBounds,
      zoom: (() => { try { return wc.getZoomFactor ? Number(wc.getZoomFactor().toFixed(2)) : 1; } catch { return 1; } })()
    };
  }

  function ensureView(win) {
    if (view) return view;
    view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        partition: 'persist:keyvotion-browser'
      }
    });
    const wc = view.webContents;

    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (event, url) => {
      const safe = normalizeUrl(url);
      if (!safe) {
        event.preventDefault();
        return;
      }
      lastURL = safe;
    });
    wc.on('did-navigate', (_e, url) => { lastURL = url; lastLoadError = null; emit(); });
    wc.on('did-navigate-in-page', (_e, url) => { lastURL = url; emit(); });
    wc.on('did-start-loading', () => { lastLoadError = null; emit(); });
    wc.on('did-stop-loading', emit);
    wc.on('page-title-updated', emit);
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame) return;
      /* -3 = ERR_ABORTED: kullanici gezinmeyi iptal etti, hata sayilmez. */
      if (code !== -3) {
        lastLoadError = {
          code,
          desc: String(desc || ''),
          url: String(url || ''),
          message: describeNetError(code, desc)
        };
      }
      emit();
    });
    wc.on('will-prevent-unload', (event) => event.preventDefault());

    win.contentView.addChildView(view);
    return view;
  }

  function destroyView(win) {
    if (!view) return;
    try {
      if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
    } catch { /* zaten kaldirilmis */ }
    try {
      view.webContents.close();
    } catch { /* kapanmis */ }
    view = null;
  }

  function open(input) {
    const p = input && typeof input === 'object' ? input : {};
    const win = getWindow();
    if (!win || win.isDestroyed()) return fail(CODES.INTERNAL, 'Pencere yok.');

    const bounds = sanitizeBounds(p.bounds);
    if (!bounds) return fail(CODES.BAD_REQUEST, 'Tarayıcı alanı geçersiz.');

    const url = normalizeUrl(p.url);
    if (!url) return fail(CODES.BAD_REQUEST, 'Yalnız http(s) adresleri açılabilir.');

    try {
      const v = ensureView(win);
      v.setBounds(bounds);
      if (typeof v.setVisible === 'function') v.setVisible(true);
      hidden = false;
      lastBounds = bounds;
      lastURL = url;
      lastLoadError = null;
      v.webContents.loadURL(url);
    } catch (error) {
      return fail(CODES.INTERNAL, 'Tarayıcı açılamadı.', { detail: String(error && error.message || '') });
    }
    return ok(stateData());
  }

  function navigate(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (!view) return fail(CODES.NOT_FOUND, 'Tarayıcı kapalı — önce açın.');

    const bounds = sanitizeBounds(p.bounds);
    if (bounds) {
      try {
        view.setBounds(bounds);
        if (typeof view.setVisible === 'function') view.setVisible(true);
        hidden = false;
        lastBounds = bounds;
      } catch { /* yoksay */ }
    }

    if (typeof p.action === 'string') {
      const wc = view.webContents;
      try {
        if (p.action === 'hide') {
          /* Modal/palet acilinca native gorunum ustte kalmasin. */
          hidden = true;
          if (typeof view.setVisible === 'function') view.setVisible(false);
          else view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
          return ok(stateData());
        }
        if (p.action === 'show') {
          hidden = false;
          if (typeof view.setVisible === 'function') view.setVisible(true);
          if (lastBounds) view.setBounds(lastBounds);
          return ok(stateData());
        }
        if (p.action === 'back') {
          if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
          else if (wc.canGoBack && wc.canGoBack()) wc.goBack();
        } else if (p.action === 'forward') {
          if (wc.navigationHistory && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
          else if (wc.canGoForward && wc.canGoForward()) wc.goForward();
        } else if (p.action === 'reload') {
          wc.reload();
        } else if (p.action === 'stop') {
          if (wc.stop) wc.stop();
        } else if (p.action === 'zoom') {
          const factor = Math.min(3, Math.max(0.5, Number(p.zoom) || 1));
          if (wc.setZoomFactor) wc.setZoomFactor(factor);
        } else {
          return fail(CODES.BAD_REQUEST, 'Bilinmeyen gezinme eylemi.');
        }
      } catch {
        return fail(CODES.INTERNAL, 'Gezinme başarısız.');
      }
      return ok(stateData());
    }

    const url = normalizeUrl(p.url);
    if (!url) return fail(CODES.BAD_REQUEST, 'Yalnız http(s) adresleri açılabilir.');
    try {
      lastURL = url;
      lastLoadError = null;
      view.webContents.loadURL(url);
    } catch {
      return fail(CODES.INTERNAL, 'Sayfa yüklenemedi.');
    }
    return ok(stateData());
  }

  /**
   * Ajanin sayfayi "okumasi": gorunen metin + baslik + baglantilar.
   * Renderer ag yapmaz; bu cagri main'deki gercek sayfadan gelir.
   */
  async function extract(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (!view) return fail(CODES.NOT_FOUND, 'Tarayıcı kapalı — önce bir sayfa açın.');
    const limit = Number.isInteger(p.limit) ? Math.min(40000, Math.max(500, p.limit)) : 12000;
    const script = `(() => {
      const body = document.body || document.documentElement;
      const text = (body && body.innerText ? body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').trim();
      const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 80).map((a) => ({
        text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 120),
        href: a.href
      })).filter((l) => /^https?:/i.test(l.href));
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 40)
        .map((h) => ({ level: Number(h.tagName.slice(1)), text: (h.innerText || '').trim().slice(0, 160) }))
        .filter((h) => h.text);
      return JSON.stringify({ title: document.title, url: location.href, text, links, headings });
    })()`;
    try {
      const raw = await view.webContents.executeJavaScript(script, true);
      const parsed = JSON.parse(raw);
      return ok({
        title: parsed.title || null,
        url: parsed.url || stateData().url,
        text: String(parsed.text || '').slice(0, limit),
        truncated: String(parsed.text || '').length > limit,
        links: (parsed.links || []).slice(0, 50),
        headings: parsed.headings || []
      });
    } catch (error) {
      return fail(CODES.INTERNAL, 'Sayfa okunamadı.', { detail: String(error && error.message || '') });
    }
  }

  /**
   * Bildirimsel sayfa otomasyonu — T8 (Votion görev esnasında form doldurur).
   *
   * GÜVENLİK: serbest JavaScript YOK. Yalnız üç adım türü vardır:
   *   {op:'click', selector} | {op:'type', selector, text} | {op:'read', selector} |
   *   {op:'scroll', selector} | {op:'wait', ms}
   * Seçiciler 300 karakterle sınırlıdır ve `javascript:`/`file:` gibi şemalar
   * yalnız DOM seçicisi olarak kullanılır (değerlendirilmez). Sonuç adım adım
   * raporlanır; hata tüm işlemi durdurur (kısmi başarı "başarı" sayılmaz).
   */
  async function automate(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (!view) return fail(CODES.NOT_FOUND, 'Otomasyon için önce tarayıcıda bir sayfa açın.');
    const steps = Array.isArray(p.steps) ? p.steps.slice(0, 20) : [];
    if (!steps.length) return fail(CODES.BAD_REQUEST, 'Otomasyon adımı yok.');
    if (!view.webContents || view.webContents.isDestroyed()) {
      return fail(CODES.NOT_FOUND, 'Tarayıcı görünümü kapalı.');
    }

    const results = [];
    for (const [index, raw] of steps.entries()) {
      const step = raw && typeof raw === 'object' ? raw : {};
      const op = String(step.op || '');
      const selector = typeof step.selector === 'string' ? step.selector.slice(0, 300) : '';
      if (!['click', 'type', 'read', 'scroll', 'wait'].includes(op)) {
        return fail(CODES.BAD_REQUEST, `Adım ${index + 1}: bilinmeyen işlem.`, { detail: { results } });
      }
      if (op !== 'wait' && !selector) {
        return fail(CODES.BAD_REQUEST, `Adım ${index + 1}: seçici yok.`, { detail: { results } });
      }
      const text = typeof step.text === 'string' ? step.text.slice(0, 4000) : '';
      const script = `(() => {
        const sel = ${JSON.stringify(selector)};
        const el = sel ? document.querySelector(sel) : null;
        if (!el) return JSON.stringify({ ok: false, code: 'E_NOT_FOUND' });
        if (${JSON.stringify(op)} === 'click') { el.scrollIntoView({ block: 'center' }); el.click(); return JSON.stringify({ ok: true }); }
        if (${JSON.stringify(op)} === 'type') {
          el.scrollIntoView({ block: 'center' });
          if (el.focus) el.focus();
          const value = ${JSON.stringify(text)};
          if ('value' in el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            el.textContent = value;
          }
          return JSON.stringify({ ok: true });
        }
        if (${JSON.stringify(op)} === 'read') return JSON.stringify({ ok: true, text: (el.innerText || el.value || '').slice(0, 2000) });
        if (${JSON.stringify(op)} === 'scroll') { el.scrollIntoView({ block: 'center' }); return JSON.stringify({ ok: true }); }
        return JSON.stringify({ ok: true });
      })()`;

      try {
        if (op === 'wait') {
          const ms = Math.min(5000, Math.max(50, Number(step.ms) || 400));
          await new Promise((resolve) => setTimeout(resolve, ms));
          results.push({ index, op, ok: true, ms });
          continue;
        }
        const rawResult = await view.webContents.executeJavaScript(script, true);
        const parsed = JSON.parse(rawResult);
        results.push({ index, op, selector, ok: Boolean(parsed.ok), text: parsed.text || null });
        if (!parsed.ok) {
          return fail(CODES.NOT_FOUND, `Adım ${index + 1}: öğe bulunamadı (${selector}).`, { detail: { results } });
        }
      } catch (error) {
        return fail(CODES.INTERNAL, `Adım ${index + 1} çalıştırılamadı.`, { detail: { results, error: String(error && error.message || '') } });
      }
    }
    return ok({ steps: results, done: results.length });
  }

  function close() {
    const win = getWindow();
    destroyView(win);
    lastURL = null;
    lastBounds = null;
    lastLoadError = null;
    hidden = false;
    onState({ open: false, url: null, title: null, canGoBack: false, canGoForward: false, loading: false });
    return ok({ open: false });
  }

  function state() {
    return ok(stateData());
  }

  /** Pencere kapanirken cagrilir. */
  function dispose() {
    destroyView(null);
  }

  return { open, navigate, extract, automate, close, state, dispose, normalizeUrl };
}

module.exports = { createBrowserService, normalizeUrl, sanitizeBounds };
