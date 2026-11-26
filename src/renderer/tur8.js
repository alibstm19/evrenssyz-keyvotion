/* keyvotion-console · Tur 8 paneli (T8-3/T8-4)
   - Sağ panel: Lider sohbeti, son sonuçlar, seçili projenin token dağılımı
   - Sağ tık bağlam menüsü: kart, görev, rapor, sohbet, hafıza, menü öğesi
   - Votion eylem çubuğu: ekran, özet, uygulama, dosya, tur
   Kural: iş mantığı YOK — mevcut kanalları/aksiyonları çağırır. Ağ yok. */

import { createTour } from './tour.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const t8 = {
  rail: { tab: 'lider', open: true, width: 'normal', timer: null },
  conv: { id: null, busy: false },
  menu: null
};

let ctx = null;

const WIDTHS = { dar: '248px', normal: '308px', genis: '384px' };

function setField(name, value) {
  const node = $(`[data-field="${name}"]`);
  if (node) node.textContent = value == null ? '' : String(value);
}

function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}b`;
  return String(Math.round(v));
}

/* ------------------------------------------------------------------ sağ panel */

function applyRail() {
  const root = $('[data-rail]');
  if (!root) return;
  root.dataset.railState = t8.rail.open ? 'open' : 'closed';
  document.documentElement.dataset.rail = t8.rail.open ? 'on' : 'off';
  root.style.setProperty('--rail-w', WIDTHS[t8.rail.width] || WIDTHS.normal);
  const toggle = $('[data-rail-toggle]');
  if (toggle) toggle.setAttribute('aria-pressed', String(t8.rail.open));
  for (const tab of $$('[data-rail-tab]')) {
    const on = tab.dataset.railTab === t8.rail.tab;
    tab.setAttribute('aria-selected', String(on));
  }
  for (const pane of $$('[data-rail-pane]')) pane.hidden = pane.dataset.railPane !== t8.rail.tab;
  for (const b of $$('[data-rail-width]')) {
    b.setAttribute('aria-pressed', String(b.dataset.railWidth === t8.rail.width));
  }
}

function railOpen(open) {
  t8.rail.open = Boolean(open);
  if (t8.rail.open) renderRail();
  applyRail();
  saveRailPrefs();
}

function saveRailPrefs() {
  if (ctx && ctx.store && ctx.store.prefs) {
    ctx.store.prefs.railOpen = t8.rail.open;
    ctx.store.prefs.railWidth = t8.rail.width;
    ctx.store.prefs.railTab = t8.rail.tab;
    try { localStorage.setItem('kv.prefs.v2', JSON.stringify(ctx.store.prefs)); } catch { /* yoksay */ }
  }
}

function railTab(tab) {
  if (!['lider', 'results', 'project'].includes(tab)) return;
  t8.rail.tab = tab;
  applyRail();
  renderRail();
  saveRailPrefs();
}

/** Raporlar + hafıza: "sonuç" panelinin iki listesi. */
function renderResults() {
  const reports = (ctx.store.reports || []).slice(0, 6);
  const reportBox = $('[data-rail-reports]');
  if (reportBox) {
    reportBox.replaceChildren();
    setField('rail-report-count', String((ctx.store.reports || []).length));
    if (!reports.length) {
      reportBox.append(ctx.el('p', { class: 'kv-empty', text: 'Rapor toplanmadı.' }));
    } else {
      for (const r of reports) {
        reportBox.append(ctx.el('button', {
          class: 'kv-rail__row', type: 'button', 'data-rail-report': r.id,
          title: `kv://reports/${r.id}`
        }, [
          ctx.el('span', { class: 'kv-rail__row-main' }, [
            ctx.el('b', { text: r.taskId || r.id || 'rapor' }),
            ctx.el('small', { text: `${r.role || '—'} · ${r.status || '—'}` })
          ]),
          ctx.badge(r.status || '—', /tamam/i.test(r.status || '') ? 'success' : /kısmi|kismi/i.test(r.status || '') ? 'warning' : 'danger')
        ]));
      }
    }
  }

  const mem = (ctx.store.memory.entries || []).slice(0, 5);
  const memBox = $('[data-rail-memory]');
  if (memBox) {
    memBox.replaceChildren();
    setField('rail-memory-count', String((ctx.store.memory.entries || []).length));
    if (!mem.length) {
      memBox.append(ctx.el('p', { class: 'kv-empty', text: 'Hafıza boş.' }));
    } else {
      for (const m of mem) {
        const text = String(m.text || '').replace(/\s+/g, ' ').trim();
        memBox.append(ctx.el('button', {
          class: 'kv-rail__row', type: 'button', 'data-rail-memory': m.id, title: text.slice(0, 160)
        }, [
          ctx.el('span', { class: 'kv-rail__row-main' }, [
            ctx.el('b', { text: `${m.scope || 'genel'} · ${m.id || ''}` }),
            ctx.el('small', { text: text.slice(0, 74) })
          ])
        ]));
      }
    }
  }
}

/** Proje paneli: token dağılımı + son işler. */
function renderProject() {
  const box = $('[data-rail-project]');
  const project = (ctx.store.projects.projects || []).find((p) => p.active) || null;
  if (box) {
    box.replaceChildren();
    if (!project) {
      box.append(ctx.el('p', { class: 'kv-empty', text: 'Proje seçilmedi — Projeler ekranından seçin.' }));
    } else {
      box.append(ctx.el('div', { class: 'kv-rail__project-card' }, [
        ctx.el('b', { text: project.name || project.id || 'proje' }),
        ctx.el('small', { text: project.dir || '' }),
        ctx.el('div', { class: 'kv-row' }, [
          ctx.badge(project.exists === false ? 'dizin yok' : 'hazır', project.exists === false ? 'warning' : 'success'),
          ctx.el('span', { class: 'kv-muted kv-mono', text: `${(ctx.store.sessions || []).length} ajan` })
        ])
      ]));
    }
  }

  /* Token dağılımı: ajan başına ölçülen token (uydurma yok, 0 ise 0). */
  const bars = $('[data-rail-bars]');
  const rows = (ctx.store.sessions || [])
    .map((s) => ({ code: s.code || s.role || '?', tokens: tokenOf(s) }))
    .sort((a, b) => b.tokens - a.tokens);
  const total = rows.reduce((sum, r) => sum + r.tokens, 0);
  setField('rail-token-total', fmtNum(total));
  if (bars) {
    bars.replaceChildren();
    if (!rows.length) {
      bars.append(ctx.el('p', { class: 'kv-empty', text: 'Ölçüm yok.' }));
    } else {
      const peak = Math.max(1, rows[0].tokens);
      for (const r of rows.slice(0, 7)) {
        const bar = ctx.el('div', { class: 'kv-rail__bar' });
        const fill = ctx.el('i');
        fill.style.setProperty('--bar', `${Math.round((r.tokens / peak) * 100)}%`);
        bar.append(ctx.el('span', { text: r.code }), fill, ctx.el('b', { class: 'kv-mono', text: fmtNum(r.tokens) }));
        bars.append(bar);
      }
    }
  }

  const tasks = $('[data-rail-tasks]');
  if (tasks) {
    tasks.replaceChildren();
    const open = (ctx.store.board.rows || [])
      .filter((r) => !/bitti|red|bloke/i.test(r.status || ''))
      .slice(0, 6);
    if (!open.length) {
      tasks.append(ctx.el('p', { class: 'kv-empty', text: 'Açık görev yok.' }));
    } else {
      for (const r of open) {
        tasks.append(ctx.el('button', {
          class: 'kv-rail__row', type: 'button', 'data-rail-task': r.id
        }, [
          ctx.el('span', { class: 'kv-rail__row-main' }, [
            ctx.el('b', { text: r.id || '?' }),
            ctx.el('small', { text: String(r.title || '').slice(0, 68) })
          ]),
          ctx.badge(r.status || '—', 'info')
        ]));
      }
    }
  }
}

function tokenOf(s) {
  if (!s) return 0;
  if (typeof s.tokenTotal === 'number') return s.tokenTotal;
  if (typeof s.tokens === 'number') return s.tokens;
  const t = s.tokens;
  if (t && typeof t === 'object') return (t.input || 0) + (t.output || 0) + (t.reasoning || 0);
  return 0;
}

/** Lider paneli: masa konuşmasını aynalar. */
async function renderLiderPane() {
  const stream = $('[data-rail-stream]');
  if (!stream) return;
  /* Masa konuşmasını temel al: aynı konuşma, iki yerde görünür. */
  const listRes = await ctx.call(ctx.KV.chat.list);
  const list = (listRes.ok && listRes.data && listRes.data.conversations) || [];
  const desk = list.find((c) => c.role === 'LDR' && String(c.title || '').trim() === 'Lider masası') || null;
  t8.conv.id = desk ? desk.id : null;
  setField('rail-model', desk && desk.model ? desk.model : (t8.conv.id ? '—' : 'yeni konuşma'));

  stream.replaceChildren();
  if (!desk) {
    stream.append(ctx.el('p', { class: 'kv-empty', text: 'Lider’e yazınca konuşma burada başlar.' }));
    return;
  }
  const res = await ctx.call(ctx.KV.chat.get, { id: desk.id });
  if (!res.ok) {
    stream.append(ctx.el('p', { class: 'kv-empty', text: 'Konuşma okunamadı.' }));
    return;
  }
  const messages = res.data.messages || [];
  if (!messages.length) {
    stream.append(ctx.el('p', { class: 'kv-empty', text: 'Konuşma boş — ilk mesajı siz yazın.' }));
  }
  for (const m of messages.slice(-40)) {
    stream.append(ctx.el('div', {
      class: `kv-rail__msg ${m.role === 'user' ? 'kv-rail__msg--user' : 'kv-rail__msg--lider'}`,
      text: m.content || m.text || ''
    }));
  }
  if (t8.conv.busy) {
    stream.append(ctx.el('div', { class: 'kv-rail__msg kv-rail__msg--lider' }, [
      ctx.el('span', { class: 'kv-typing' }, [ctx.el('i'), ctx.el('i'), ctx.el('i')]),
      ctx.el('div', { class: 'kv-think kv-think--inline', 'aria-live': 'polite' }, [
        ctx.el('span', { class: 'kv-think__glyph', 'aria-hidden': 'true', text: '◐' }),
        ctx.el('span', { class: 'kv-think__label', text: 'düşünüyor…' }),
        ctx.el('span', {
          class: 'kv-think__time kv-mono',
          'data-think-clock': '',
          'data-think-start': String(t8.conv.startedAt || Date.now())
        })
      ])
    ]));
  }
  stream.scrollTop = stream.scrollHeight;
}

function renderRail() {
  applyRail();
  if (!t8.rail.open) return;
  if (t8.rail.tab === 'lider') renderLiderPane();
  else if (t8.rail.tab === 'results') renderResults();
  else renderProject();
}

async function ensureConversation() {
  if (t8.conv.id) return t8.conv.id;
  const listRes = await ctx.call(ctx.KV.chat.list);
  const list = (listRes.ok && listRes.data && listRes.data.conversations) || [];
  const found = list.find((c) => c.role === 'LDR' && String(c.title || '').trim() === 'Lider masası');
  if (found) { t8.conv.id = found.id; return t8.conv.id; }
  const res = await ctx.call(ctx.KV.chat.create, {
    role: 'LDR',
    title: 'Lider masası',
    confirmToken: ctx.makeConfirmToken()
  });
  if (!res.ok) {
    ctx.toast((res.error && res.error.message) || 'Konuşma açılamadı.', 'danger');
    return null;
  }
  t8.conv.id = res.data.conversation.id;
  return t8.conv.id;
}

async function railSend() {
  const input = $('[data-field="rail-text"]');
  const text = input ? input.value.trim() : '';
  if (!text || t8.conv.busy) return;
  if (input) input.value = '';
  const id = await ensureConversation();
  if (!id) return;
  t8.conv.busy = true;
  t8.conv.startedAt = Date.now();
  renderLiderPane();
  const res = await ctx.call(ctx.KV.chat.send, { id, content: text, confirmToken: ctx.makeConfirmToken() });
  t8.conv.busy = false;
  t8.conv.startedAt = 0;
  if (!res.ok) {
    const code = res.error && res.error.code;
    ctx.toast(code === 'E_SECRET_MISSING'
      ? 'Model anahtarı yok — Sağlayıcılar ekranından anahtar ekleyin.'
      : (res.error && res.error.message) || 'Gönderilemedi.', code === 'E_SECRET_MISSING' ? 'warning' : 'danger');
  }
  await renderLiderPane();
  if (typeof ctx.tur6DeskRefresh === 'function') ctx.tur6DeskRefresh();
}

/* --------------------------------------------------------------- sağ tık menüsü */

function closeMenu() {
  const menu = $('[data-context-menu]');
  if (menu) menu.hidden = true;
  t8.menu = null;
}

function menuItems() {
  return [
    { key: 'team', match: '[data-team-grid] .kv-card, [data-team-grid] article', label: 'Ajan', items: [
      { label: 'Akışı aç', action: 'card-flow' },
      { label: 'Komut gönder', action: 'card-command' },
      { label: 'Model değiştir', action: 'card-model' },
      { label: 'Lider yap', action: 'set-leader' },
      { label: 'Rapor yaz', action: 'card-report' }
    ] },
    { key: 'task', match: '[data-task]', label: 'Görev', items: [
      { label: 'Ayrıntıyı aç', open: 'task' },
      { label: 'Yeni sekmede aç', open: 'task-tab' },
      { label: 'Votion’a sor', votion: true },
      { label: 'ID’yi kopyala', copy: 'id' }
    ] },
    { key: 'report', match: '[data-report]', label: 'Rapor', items: [
      { label: 'Ayrıntıyı aç', open: 'report' },
      { label: 'Yeni sekmede aç', open: 'report-tab' },
      { label: 'Votion’a sor', votion: true },
      { label: 'Metni kopyala', copy: 'text' }
    ] },
    { key: 'chat', match: '[data-chat-pick]', label: 'Konuşma', items: [
      { label: 'Aç', open: 'chat' },
      { label: 'Yeniden adlandır', action: 'chat-rename' },
      { label: 'Sil', action: 'chat-delete', danger: true },
      { label: 'Bağlamı gör', action: 'chat-preview' }
    ] },
    { key: 'memory', match: '[data-memory-pick]', label: 'Hafıza', items: [
      { label: 'Ayrıntıyı aç', open: 'memory' },
      { label: 'Bağlamı kopyala', action: 'memory-copy-context' },
      { label: 'Votion’a sor', votion: true }
    ] },
    { key: 'nav', match: '[data-nav-item]', label: 'Bölüm', items: [
      { label: 'Aç', open: 'nav' },
      { label: 'Yeni sekmede aç', open: 'nav-tab' }
    ] },
    { key: 'project', match: '[data-project-switch]', label: 'Proje', items: [
      { label: 'Projeye geç', open: 'project' },
      { label: 'Arşivle', action: 'project-archive' }
    ] }
  ];
}

function openMenu(event) {
  const menu = $('[data-context-menu]');
  if (!menu) return;
  for (const group of menuItems()) {
    const node = event.target.closest(group.match);
    if (!node) continue;
    event.preventDefault();
    menu.replaceChildren();
    menu.append(ctx.el('div', { class: 'kv-menu__head', text: group.label }));

    for (const item of group.items) {
      const enabled = item.action ? Boolean(node.dataset.action === undefined || node.dataset.action === item.action || $('[data-action="' + item.action + '"]', node)) : true;
      const btn = ctx.el('button', {
        class: 'kv-menu__item', type: 'button', role: 'menuitem',
        'data-tone': item.danger ? 'danger' : null,
        'aria-disabled': enabled ? null : 'true',
        text: item.label
      });
      btn.addEventListener('click', () => {
        closeMenu();
        runMenu(item, node);
      });
      menu.append(btn);
    }

    menu.hidden = false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = menu.getBoundingClientRect();
    const x = Math.min(event.clientX, vw - box.width - 8);
    const y = Math.min(event.clientY, vh - box.height - 8);
    menu.style.setProperty('--menu-x', `${Math.max(8, x)}px`);
    menu.style.setProperty('--menu-y', `${Math.max(8, y)}px`);
    t8.menu = { group: group.key, node };
    return;
  }
}

function clickNode(node) {
  if (!node) return;
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function runMenu(item, node) {
  const { open, action, copy, votion } = item;
  if (action) {
    /* Kart üzerinde aynı aksiyon düğmesi varsa onu tıkla; yoksa düğümün kendisi. */
    const inner = $('[data-action="' + action + '"]', node);
    clickNode(inner || node);
    return;
  }
  if (open === 'task') { clickNode(node); return; }
  if (open === 'report') { clickNode(node); return; }
  if (open === 'chat') { clickNode(node); return; }
  if (open === 'memory') { clickNode(node); return; }
  if (open === 'project') { clickNode(node); return; }
  if (open === 'nav') { clickNode(node); return; }
  if (open === 'task-tab' && typeof ctx.navOpenTask === 'function') { ctx.navOpenTask(node.dataset.task); return; }
  if (open === 'report-tab' && typeof ctx.navOpenReport === 'function') { ctx.navOpenReport(node.dataset.report); return; }
  if (open === 'nav-tab' && typeof ctx.navOpenScreen === 'function') { ctx.navOpenScreen(node.dataset.navItem); return; }
  if (copy === 'id') {
    ctx.copyText(node.dataset.task || node.dataset.report || '', 'Kimlik kopyalandı.');
    return;
  }
  if (copy === 'text') {
    ctx.copyText((node.innerText || '').trim(), 'Metin kopyalandı.');
    return;
  }
  if (votion) {
    openVotionWith(`Şunu incele ve ne yapılması gerektiğini söyle: ${(node.innerText || '').replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

function openVotionWith(text) {
  if (typeof ctx.votionPrefill === 'function') ctx.votionPrefill(text);
}

/* ------------------------------------------------------------- Votion eylemleri */

function votionSay(text) {
  if (typeof ctx.votionSay === 'function') ctx.votionSay(text);
  else ctx.toast(text, 'info');
}

/** Ekran görüntüsünü Votion günlüğüne resim olarak basar (data: URL, img-src izinli). */
function votionShowShot(shot) {
  if (!shot || !shot.dataUrl) return;
  const log = document.querySelector('[data-votion-log]');
  if (!log) return;
  const row = ctx.el('div', { class: 'kv-votion__row', 'data-who': 'votion' });
  const img = ctx.el('img', { class: 'kv-votion__shot', alt: 'Ekran görüntüsü' });
  img.src = shot.dataUrl;
  row.append(img);
  log.append(row);
  log.scrollTop = log.scrollHeight;
}

/** Votion beyaz liste eylemlerini yürütür: {kind, app?, root?}. */
async function runVotionAction(action) {
  if (!action || !ctx.KV || !ctx.KV.votion) return;
  const call = (payload) => ctx.call(ctx.KV.votion.act, { ...payload, confirmToken: ctx.makeConfirmToken() });
  if (action.kind === 'screenshot') {
    const res = await call({ action: 'screenshot' });
    if (res.ok) {
      votionShowShot(res.data);
      votionSay(`Ekran görüntüsünü aldım: ${res.data.width}×${res.data.height}.`);
    } else {
      votionSay(`Ekran görüntüsü alınamadı: ${(res.error && res.error.message) || 'bilinmeyen hata'}`);
    }
    return;
  }
  if (action.kind === 'openApp') {
    const res = await call({ action: 'openApp', app: action.app });
    votionSay(res.ok ? `${res.data.label} açıldı.` : `Açamadım: ${(res.error && res.error.message) || 'hata'}`);
    return;
  }
  if (action.kind === 'listFiles') {
    const res = await call({ action: 'listFiles', root: action.root || 'project' });
    if (!res.ok) { votionSay(`Klasörü okuyamadım: ${(res.error && res.error.message) || ''}`); return; }
    const names = (res.data.entries || []).slice(0, 8).map((e) => e.name).join(', ');
    votionSay(`${res.data.dir} klasöründe ${res.data.total} kayıt var: ${names}.`);
  }
}

async function votionAct(kind) {
  if (!ctx.KV || !ctx.KV.votion) { ctx.toast('Votion köprüsü yok.', 'warning'); return; }
  const call = (payload) => ctx.call(ctx.KV.votion && ctx.KV.votion.act, { ...payload, confirmToken: ctx.makeConfirmToken() });

  if (kind === 'screen') {
    const res = await call({ action: 'screenshot' });
    if (res.ok) {
      votionShowShot(res.data);
      votionSay(`Ekranı okudum: ${res.data.width}×${res.data.height}. İstersen bir bölümü inceleyeyim.`);
    } else {
      votionSay(`Ekranı okuyamadım: ${(res.error && res.error.message) || 'bilinmeyen hata'}`);
    }
    return;
  }
  if (kind === 'summary') {
    ctx.toast('Sayfa özeti hazırlanıyor…', 'info');
    if (typeof ctx.summarizePage === 'function') ctx.summarizePage();
    else votionSay('Önce Tarayıcı ekranından bir sayfa açın.');
    return;
  }
  if (kind === 'apps') {
    const res = await call({ action: 'list' });
    if (!res.ok) { votionSay('Uygulama listesini okuyamadım.'); return; }
    const apps = res.data.apps || [];
    const buttons = apps.map((app) => ctx.el('button', {
      class: 'kv-button kv-button--ghost kv-button--sm',
      type: 'button',
      text: app.label,
      onclick: async () => {
        ctx.closeModal();
        await runVotionAction({ kind: 'openApp', app: app.id });
      }
    }));
    ctx.modal({
      title: 'Hangi uygulamayı açayım?',
      body: [ctx.el('div', { class: 'kv-chip-row' }, buttons)],
      actions: [ctx.el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: ctx.closeModal })]
    });
    return;
  }
  if (kind === 'files') {
    await runVotionAction({ kind: 'listFiles', root: 'project' });
    return;
  }
  if (kind === 'tour') {
    openTour();
  }
}

/* ------------------------------------------------------------------------ tur */

let tourApi = null;

function openTour() {
  if (!tourApi) {
    tourApi = createTour({
      go: (screen) => ctx.go(screen),
      speak: (text) => { if (typeof ctx.votionSay === 'function') ctx.votionSay(text); }
    });
  }
  tourApi.open(0);
}

/* ==========================================================================
   TUR 8 EKRANLARI — Ekipler · Planlar · Dosyalar · Bağlamlar
   İş mantığı main'de; burada yalnız çağrı + çizim var.
   ========================================================================== */

const t8x = {
  teams: { data: null, selected: null, loading: false },
  plan: { data: null, tab: 'plans', selectedPlan: null, loading: false },
  files: { dir: '', data: null, preview: null, picked: {}, loading: false },
  context: { result: null, query: '', loading: false }
};

function actTeams(payload) {
  return ctx.call(ctx.KV.teams && ctx.KV.teams.act, { ...payload, confirmToken: ctx.makeConfirmToken() });
}

function actPlan(payload) {
  return ctx.call(ctx.KV.plan && ctx.KV.plan.act, { ...payload, confirmToken: ctx.makeConfirmToken() });
}

function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}b`;
  return String(Math.round(v));
}

function timeText(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '—';
  }
}

/* ---------------------------------------------------------------- ekipler */

async function teamsLoad() {
  if (t8x.teams.loading) return;
  t8x.teams.loading = true;
  const res = await ctx.call(ctx.KV.teams.list, {});
  t8x.teams.loading = false;
  if (!res.ok) {
    ctx.toast((res.error && res.error.message) || 'Ekipler okunamadı.', 'danger');
    return;
  }
  t8x.teams.data = res.data;
  if (!t8x.teams.selected || !res.data.teams.some((t) => t.id === t8x.teams.selected)) {
    t8x.teams.selected = res.data.activeId || (res.data.teams[0] && res.data.teams[0].id) || null;
  }
  renderTeams();
}

function renderTeams() {
  const list = $('[data-teams-list]');
  const detail = $('[data-teams-detail]');
  if (!list || !detail) return;
  const data = t8x.teams.data;
  list.replaceChildren();
  detail.replaceChildren();

  if (!data) {
    list.append(ctx.el('p', { class: 'kv-empty', text: 'Yükleniyor…' }));
    return;
  }

  setField('teams-count', String(data.totals.teams));
  setField('teams-spent', fmtTokens(data.totals.spentTokens));

  const live = data.teams.filter((t) => !t.archived);
  if (!live.length) {
    list.append(ctx.el('div', { class: 'kv-empty' }, [
      ctx.el('p', { text: 'Henüz ekip yok. Aynı anda birden çok ekip çalıştırabilirsiniz; her birinin kendi lideri ve bütçesi olur.' }),
      ctx.el('button', { class: 'kv-button', type: 'button', text: 'İlk ekibi oluştur', onclick: () => teamNewDialog() })
    ]));
  }

  for (const team of live) {
    const active = team.id === data.activeId;
    const limit = team.budget.limitTokens;
    const pct = limit ? Math.min(100, Math.round((team.spentTokens / limit) * 100)) : 0;
    const card = ctx.el('article', {
      class: 'kv-team',
      'data-team-card': team.id,
      'aria-current': active ? 'true' : null
    }, [
      ctx.el('header', { class: 'kv-team__head' }, [
        ctx.el('div', { class: 'kv-team__id' }, [
          ctx.el('b', { text: team.name }),
          ctx.el('small', { class: 'kv-mono', text: `${team.id} · ${team.members.length} üye · lider: ${team.leader.name}` })
        ]),
        active ? ctx.badge('aktif', 'success') : ctx.badge('beklemede', 'idle')
      ]),
      ctx.el('div', { class: 'kv-meter' }, [
        ctx.el('span', { class: 'kv-mono', text: `${fmtTokens(team.spentTokens)} / ${limit ? fmtTokens(limit) : 'sınırsız'}` }),
        ctx.el('i', { class: 'kv-meter__track' }, [
          ctx.el('b', { class: 'kv-meter__fill', 'data-pct': limit ? pct : 0 })
        ]),
        team.budget.over ? ctx.badge('limit aşıldı', 'warning') : null
      ]),
      ctx.el('footer', { class: 'kv-team__foot' }, [
        !active ? ctx.el('button', {
          class: 'kv-button kv-button--sm', type: 'button', text: 'Aktif yap',
          onclick: () => teamSwitch(team.id)
        }) : null,
        ctx.el('button', {
          class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Ayrıntı',
          onclick: () => { t8x.teams.selected = team.id; renderTeams(); }
        }),
        ctx.el('button', {
          class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Otomatik model',
          title: 'Her role en uygun modeli otomatik ata',
          onclick: () => teamAuto(team.id)
        })
      ])
    ]);
    /* dolgu yüzdesi sınıf değil, yerel değişkenle (ham stil yok) */
    const fill = card.querySelector('.kv-meter__fill');
    if (fill) fill.style.setProperty('--bar', `${pct}%`);
    list.append(card);
  }

  const team = live.find((t) => t.id === t8x.teams.selected) || null;
  if (!team) {
    detail.append(ctx.el('p', { class: 'kv-empty', text: 'Ayrıntı için bir ekip seçin.' }));
    return;
  }

  detail.append(ctx.el('header', { class: 'kv-section__head' }, [
    ctx.el('h3', { text: `${team.name} · üyeler` }),
    ctx.el('button', { class: 'kv-button kv-button--sm', type: 'button', text: 'Üye ekle', onclick: () => teamMemberDialog(team.id) })
  ]));

  const table = ctx.el('div', { class: 'kv-roster' }, [
    ctx.el('div', { class: 'kv-roster__head' }, [
      ctx.el('span', { text: 'Kod' }),
      ctx.el('span', { text: 'Rol' }),
      ctx.el('span', { text: 'Ad' }),
      ctx.el('span', { text: 'Model' }),
      ctx.el('span', { text: '' })
    ])
  ]);
  for (const m of team.members) {
    table.append(ctx.el('div', { class: 'kv-roster__row' }, [
      ctx.el('span', { class: 'kv-mono', text: m.code }),
      ctx.el('span', { text: (data.roles.find((r) => r.code === m.role) || {}).label || m.role }),
      ctx.el('span', { text: m.name || '—' }),
      ctx.el('span', { class: 'kv-mono kv-muted', text: m.model || 'otomatik atanmadı' }),
      ctx.el('button', {
        class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', title: 'Üyeyi arşivle', text: '✕',
        disabled: m.code === 'LDR' ? true : null,
        onclick: () => teamRemoveMember(team.id, m.code)
      })
    ]));
  }
  detail.append(table);

  const budgetInput = ctx.el('input', {
    class: 'kv-input', type: 'number', min: '0', step: '1000',
    value: team.budget.limitTokens == null ? '' : String(team.budget.limitTokens),
    'data-field': 'team-budget'
  });
  detail.append(ctx.el('div', { class: 'kv-row kv-row--gap' }, [
    ctx.el('label', { class: 'kv-field kv-field--inline' }, [ctx.el('span', { text: 'Token sınırı' }), budgetInput]),
    ctx.el('button', {
      class: 'kv-button kv-button--sm', type: 'button', text: 'Sınırı kaydet',
      onclick: async () => {
        const raw = budgetInput.value.trim();
        const res = await actTeams({ action: 'update', id: team.id, limitTokens: raw === '' ? 0 : Number(raw) });
        if (res.ok) { ctx.toast(raw === '' ? 'Sınır kaldırıldı.' : `Sınır ${raw} token.`, 'success'); teamsLoad(); }
        else ctx.toast((res.error && res.error.message) || 'Kaydedilemedi.', 'danger');
      }
    }),
    ctx.el('button', {
      class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Arşivle',
      onclick: () => teamArchive(team.id)
    })
  ]));
}

async function teamSwitch(id) {
  const res = await actTeams({ action: 'switch', id });
  if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Geçilemedi.', 'danger'); return; }
  ctx.toast('Ekip değiştirildi.', 'success');
  t8x.teams.selected = id;
  await teamsLoad();
}

async function teamAuto(id) {
  const res = await actTeams({ action: 'autoAssign', id });
  if (!res.ok) {
    ctx.toast((res.error && res.error.message) || 'Model atanamadı.', 'warning');
    return;
  }
  const assigned = (res.data.assignments || []).filter((a) => a.model).length;
  ctx.toast(`${assigned} role model atandı.`, 'success');
  await teamsLoad();
}

async function teamRemoveMember(id, code) {
  const res = await actTeams({ action: 'removeMember', id, code });
  if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Çıkarılamadı.', 'danger'); return; }
  ctx.toast(`${code} arşivlendi.`, 'success');
  await teamsLoad();
}

async function teamArchive(id) {
  const res = await actTeams({ action: 'archive', id });
  if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Arşivlenemedi.', 'danger'); return; }
  ctx.toast('Ekip arşivlendi (silinmedi).', 'success');
  t8x.teams.selected = null;
  await teamsLoad();
}

function teamNewDialog() {
  const name = ctx.el('input', { class: 'kv-input', placeholder: 'Örn. Vitrin Ekibi', 'data-field': 'team-name' });
  const leader = ctx.el('input', { class: 'kv-input', placeholder: 'Lider adı (varsayılan: Lider)', 'data-field': 'team-leader' });
  const limit = ctx.el('input', { class: 'kv-input', type: 'number', min: '0', step: '1000', placeholder: 'Token sınırı (boş = sınırsız)' });
  ctx.modal({
    title: 'Yeni ekip',
    body: [
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Ekip adı' }), name]),
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Lider' }), leader]),
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Token sınırı' }), limit])
    ],
    actions: [
      ctx.el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: ctx.closeModal }),
      ctx.el('button', {
        class: 'kv-button', type: 'button', text: 'Oluştur',
        onclick: async () => {
          const res = await actTeams({
            action: 'create',
            name: name.value.trim(),
            leaderName: leader.value.trim() || 'Lider',
            limitTokens: limit.value.trim() === '' ? null : Number(limit.value)
          });
          if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Oluşturulamadı.', 'danger'); return; }
          ctx.closeModal();
          t8x.teams.selected = res.data.team.id;
          ctx.toast('Ekip oluşturuldu.', 'success');
          await teamsLoad();
        }
      })
    ]
  });
}

function teamMemberDialog(teamId) {
  const data = t8x.teams.data;
  const role = ctx.el('select', { class: 'kv-input' },
    (data ? data.roles : []).map((r) => ctx.el('option', { value: r.code, text: `${r.code} · ${r.label}` })));
  const code = ctx.el('input', { class: 'kv-input', placeholder: 'Kod (ör. DEV2)', 'data-field': 'member-code' });
  const name = ctx.el('input', { class: 'kv-input', placeholder: 'Ad (isteğe bağlı)' });
  ctx.modal({
    title: 'Üye ekle',
    body: [
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Rol' }), role]),
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Kod' }), code]),
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Ad' }), name])
    ],
    actions: [
      ctx.el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: ctx.closeModal }),
      ctx.el('button', {
        class: 'kv-button', type: 'button', text: 'Ekle',
        onclick: async () => {
          const res = await actTeams({
            action: 'addMember', id: teamId, role: role.value,
            code: code.value.trim() || role.value, name: name.value.trim()
          });
          if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Eklenemedi.', 'danger'); return; }
          ctx.closeModal();
          ctx.toast('Üye eklendi.', 'success');
          await teamsLoad();
        }
      })
    ]
  });
}

/* ---------------------------------------------------------------- planlar */

async function planLoad() {
  if (t8x.plan.loading) return;
  t8x.plan.loading = true;
  const teamId = t8x.teams.data && t8x.teams.data.activeId ? t8x.teams.data.activeId : undefined;
  const res = await ctx.call(ctx.KV.plan.list, { teamId });
  t8x.plan.loading = false;
  if (!res.ok) {
    ctx.toast((res.error && res.error.message) || 'Planlar okunamadı.', 'danger');
    return;
  }
  t8x.plan.data = res.data;
  renderPlan();
}

function renderPlan() {
  const list = $('[data-plans-list]');
  const detail = $('[data-plans-detail]');
  if (!list || !detail) return;
  const data = t8x.plan.data;
  list.replaceChildren();
  detail.replaceChildren();

  for (const tab of $$('[data-plan-tab]')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.planTab === t8x.plan.tab));
  }

  if (!data) {
    list.append(ctx.el('p', { class: 'kv-empty', text: 'Yükleniyor…' }));
    return;
  }

  setField('plans-count', String(data.counts.plans));
  setField('plans-open-tasks', String(data.counts.tasks));
  setField('plans-next', (data.schedules[0] && timeText(data.schedules[0].nextRunAt)) || '—');

  if (t8x.plan.tab === 'plans') {
    if (!data.plans.length) {
      list.append(ctx.el('p', { class: 'kv-empty', text: 'Plan yok. Lider için bir yol haritası yazın.' }));
    }
    for (const p of data.plans) {
      list.append(ctx.el('button', {
        class: 'kv-rail__row', type: 'button', 'data-plan-pick': p.id,
        'aria-current': t8x.plan.selectedPlan === p.id ? 'true' : null,
        onclick: () => { t8x.plan.selectedPlan = p.id; renderPlan(); }
      }, [
        ctx.el('span', { class: 'kv-rail__row-main' }, [
          ctx.el('b', { text: p.title }),
          ctx.el('small', { text: `${p.status} · ${timeText(p.updatedAt)}` })
        ]),
        ctx.badge(p.status, p.status === 'bitti' ? 'success' : p.status === 'bloke' ? 'danger' : 'info')
      ]));
    }
    const plan = data.plans.find((p) => p.id === t8x.plan.selectedPlan) || null;
    if (!plan) {
      detail.append(ctx.el('p', { class: 'kv-empty', text: 'Bir plan seçin ya da yeni plan yazın.' }));
    } else {
      renderPlanEditor(detail, plan);
    }
    return;
  }

  if (t8x.plan.tab === 'notes') {
    if (!data.notes.length) list.append(ctx.el('p', { class: 'kv-empty', text: 'Not yok.' }));
    for (const n of data.notes) {
      list.append(ctx.el('article', { class: 'kv-note' }, [
        ctx.el('p', { text: n.text }),
        ctx.el('footer', { class: 'kv-row' }, [
          ctx.el('small', { class: 'kv-muted kv-mono', text: `${n.id} · ${timeText(n.at)}` }),
          ctx.el('button', {
            class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', text: '✕', title: 'Notu arşivle',
            onclick: () => planAct({ action: 'noteRemove', id: n.id }, 'Not arşivlendi.')
          })
        ])
      ]));
    }
    return;
  }

  if (t8x.plan.tab === 'schedules') {
    if (!data.schedules.length) list.append(ctx.el('p', { class: 'kv-empty', text: 'Zamanlama yok. Örn. her sabah 09:00 lider görevi.' }));
    for (const s of data.schedules) {
      list.append(ctx.el('article', { class: 'kv-sched' }, [
        ctx.el('header', { class: 'kv-sched__head' }, [
          ctx.el('b', { text: s.title }),
          s.enabled ? ctx.badge('açık', 'success') : ctx.badge('kapalı', 'idle')
        ]),
        ctx.el('p', { class: 'kv-muted', text: scheduleText(s) }),
        ctx.el('footer', { class: 'kv-row' }, [
          ctx.el('small', { class: 'kv-mono', text: `sonraki: ${timeText(s.nextRunAt)} · ${s.runs || 0} kez` }),
          ctx.el('button', {
            class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Şimdi çalıştır',
            onclick: () => planAct({ action: 'scheduleRun', id: s.id }, 'Görev açıldı.')
          }),
          ctx.el('button', {
            class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', text: '✕', title: 'Zamanlamayı arşivle',
            onclick: () => planAct({ action: 'scheduleRemove', id: s.id }, 'Zamanlama arşivlendi.')
          })
        ])
      ]));
    }
    return;
  }

  /* görevler */
  if (!data.tasks.length) list.append(ctx.el('p', { class: 'kv-empty', text: 'Açık görev yok.' }));
  for (const t of data.tasks) {
    const sel = ctx.el('select', { class: 'kv-input kv-input--sm', 'data-task-status': t.id },
      (data.statuses || []).map((s) => ctx.el('option', { value: s, text: s })));
    sel.value = t.status;
    sel.addEventListener('change', () => planAct({ action: 'taskUpdate', id: t.id, status: sel.value }, 'Görev güncellendi.'));
    list.append(ctx.el('article', { class: 'kv-task' }, [
      ctx.el('div', { class: 'kv-task__main' }, [
        ctx.el('b', { text: `${t.id} · ${t.title}` }),
        ctx.el('small', { class: 'kv-muted', text: `${t.source === 'schedule' ? 'zamanlanmış' : 'elle'} · ${t.role} · ${timeText(t.at)}` })
      ]),
      sel
    ]));
  }
}

function scheduleText(s) {
  if (s.kind === 'daily') return `Her gün ${s.time}`;
  if (s.kind === 'weekly') {
    const names = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    return `Her ${(s.weekdays || []).map((d) => names[d]).join(', ')} · ${s.time}`;
  }
  if (s.kind === 'once') return `Tek sefer · ${s.once} ${s.time}`;
  return s.time;
}

function renderPlanEditor(box, plan) {
  const title = ctx.el('input', { class: 'kv-input', value: plan.title, 'data-field': 'plan-title' });
  const body = ctx.el('textarea', { class: 'kv-input kv-textarea', rows: '12', 'data-field': 'plan-body' });
  body.value = plan.body || '';
  const status = ctx.el('select', { class: 'kv-input' },
    ['açık', 'sürüyor', 'bitti', 'bloke'].map((s) => ctx.el('option', { value: s, text: s })));
  status.value = plan.status;
  box.append(
    ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Başlık' }), title]),
    ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Plan (markdown)' }), body]),
    ctx.el('div', { class: 'kv-row kv-row--gap' }, [
      ctx.el('label', { class: 'kv-field kv-field--inline' }, [ctx.el('span', { text: 'Durum' }), status]),
      ctx.el('button', {
        class: 'kv-button kv-button--sm', type: 'button', text: 'Kaydet',
        onclick: () => planAct({ action: 'planSave', id: plan.id, teamId: plan.teamId, title: title.value, body: body.value, status: status.value }, 'Plan kaydedildi.')
      }),
      ctx.el('button', {
        class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Arşivle',
        onclick: () => planAct({ action: 'planRemove', id: plan.id }, 'Plan arşivlendi.').then(() => { t8x.plan.selectedPlan = null; })
      })
    ])
  );
}

async function planAct(payload, okText) {
  const res = await actPlan(payload);
  if (!res.ok) { ctx.toast((res.error && res.error.message) || 'İşlem başarısız.', 'danger'); return; }
  ctx.toast(okText || 'Kaydedildi.', 'success');
  await planLoad();
}

function planNewDialog(kind) {
  if (kind === 'plan') {
    const title = ctx.el('input', { class: 'kv-input', placeholder: 'Plan başlığı' });
    const body = ctx.el('textarea', { class: 'kv-input kv-textarea', rows: '8', placeholder: '## Adımlar\n- [ ] …' });
    ctx.modal({
      title: 'Yeni plan',
      body: [
        ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Başlık' }), title]),
        ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Gövde' }), body])
      ],
      actions: [
        ctx.el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: ctx.closeModal }),
        ctx.el('button', {
          class: 'kv-button', type: 'button', text: 'Kaydet',
          onclick: async () => {
            const res = await actPlan({ action: 'planSave', title: title.value.trim(), body: body.value, teamId: activeTeamId() });
            if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Kaydedilemedi.', 'danger'); return; }
            ctx.closeModal();
            t8x.plan.tab = 'plans';
            t8x.plan.selectedPlan = res.data.plan.id;
            ctx.toast('Plan oluşturuldu.', 'success');
            await planLoad();
          }
        })
      ]
    });
    return;
  }

  if (kind === 'note') {
    const text = ctx.el('textarea', { class: 'kv-input kv-textarea', rows: '4', placeholder: 'Lider için kısa not…' });
    ctx.modal({
      title: 'Yeni not',
      body: [ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Not' }), text])],
      actions: [
        ctx.el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: ctx.closeModal }),
        ctx.el('button', {
          class: 'kv-button', type: 'button', text: 'Kaydet',
          onclick: async () => {
            const res = await actPlan({ action: 'noteSave', text: text.value.trim(), teamId: activeTeamId() });
            if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Kaydedilemedi.', 'danger'); return; }
            ctx.closeModal();
            t8x.plan.tab = 'notes';
            ctx.toast('Not eklendi.', 'success');
            await planLoad();
          }
        })
      ]
    });
    return;
  }

  /* zamanlama */
  const title = ctx.el('input', { class: 'kv-input', placeholder: 'Örn. Sabah durumu' });
  const prompt = ctx.el('input', { class: 'kv-input', placeholder: 'Lider ne yapsın? (varsayılan başlık)' });
  const kindSel = ctx.el('select', { class: 'kv-input' },
    [['daily', 'Her gün'], ['weekly', 'Haftalık'], ['once', 'Tek sefer']]
      .map(([v, t]) => ctx.el('option', { value: v, text: t })));
  const time = ctx.el('input', { class: 'kv-input kv-mono', type: 'time', value: '09:00' });
  const once = ctx.el('input', { class: 'kv-input kv-mono', type: 'date' });
  const days = ctx.el('div', { class: 'kv-days' });
  ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'].forEach((name, index) => {
    const box = ctx.el('label', { class: 'kv-day' }, [
      ctx.el('input', { type: 'checkbox', value: String(index) }),
      ctx.el('span', { text: name })
    ]);
    days.append(box);
  });
  ctx.modal({
    title: 'Görev zamanla',
    body: [
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Başlık' }), title]),
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Açıklama' }), prompt]),
      ctx.el('div', { class: 'kv-row kv-row--gap' }, [
        ctx.el('label', { class: 'kv-field kv-field--inline' }, [ctx.el('span', { text: 'Tür' }), kindSel]),
        ctx.el('label', { class: 'kv-field kv-field--inline' }, [ctx.el('span', { text: 'Saat' }), time]),
        ctx.el('label', { class: 'kv-field kv-field--inline' }, [ctx.el('span', { text: 'Tarih' }), once])
      ]),
      ctx.el('div', { class: 'kv-field' }, [ctx.el('label', { text: 'Günler (haftalık)' }), days])
    ],
    actions: [
      ctx.el('button', { class: 'kv-button kv-button--ghost', type: 'button', text: 'Vazgeç', onclick: ctx.closeModal }),
      ctx.el('button', {
        class: 'kv-button', type: 'button', text: 'Zamanla',
        onclick: async () => {
          const weekdays = [...days.querySelectorAll('input:checked')].map((i) => Number(i.value));
          const res = await actPlan({
            action: 'scheduleSave',
            teamId: activeTeamId(),
            title: title.value.trim(),
            prompt: prompt.value.trim() || title.value.trim(),
            kind: kindSel.value,
            time: time.value,
            weekdays,
            once: once.value
          });
          if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Zamanlanamadı.', 'danger'); return; }
          ctx.closeModal();
          t8x.plan.tab = 'schedules';
          ctx.toast('Zamanlama kaydedildi.', 'success');
          await planLoad();
        }
      })
    ]
  });
}

function activeTeamId() {
  return t8x.teams.data && t8x.teams.data.activeId ? t8x.teams.data.activeId : null;
}

/* ---------------------------------------------------------------- dosyalar */

async function filesLoad(dir) {
  if (t8x.files.loading) return;
  t8x.files.loading = true;
  const res = await ctx.call(ctx.KV.files.list, { path: dir || '' });
  t8x.files.loading = false;
  if (!res.ok) {
    ctx.toast((res.error && res.error.message) || 'Klasör okunamadı.', 'danger');
    return;
  }
  t8x.files.data = res.data;
  /* İzin açıkken mutlak yol dolaşılır (sürücüler, ev klasörü); kapalıyken
     yalnız proje köküne göreli yol — servis zaten kök dışını reddeder. */
  t8x.files.dir = res.data.localAccess ? res.data.dir : (res.data.rel === '.' ? '' : res.data.rel);
  renderFiles();
}

function renderFiles() {
  const list = $('[data-files-list]');
  const preview = $('[data-files-preview]');
  if (!list || !preview) return;
  const data = t8x.files.data;
  list.replaceChildren();
  preview.replaceChildren();

  if (!data) {
    list.append(ctx.el('p', { class: 'kv-empty', text: 'Yükleniyor…' }));
    return;
  }

  setField('files-path', data.rel === '.' ? 'proje kökü' : data.rel);
  setField('files-count', String(data.total));
  setField('files-picked', String(Object.keys(t8x.files.picked).length));

  /* Yerel erişim açıksa kısayollar: ev klasörü + sürücüler (tek tık). */
  if (data.localAccess) {
    const jump = ctx.el('div', { class: 'kv-row kv-row--wrap kv-files-jump' }, [
      ctx.el('span', { class: 'kv-muted kv-mono', text: 'bu bilgisayar:' })
    ]);
    if (data.home) {
      jump.append(ctx.el('button', {
        class: 'kv-chip', type: 'button', text: 'ev',
        title: data.home,
        onclick: () => filesLoad(data.home)
      }));
    }
    for (const drive of data.drives || []) {
      jump.append(ctx.el('button', {
        class: 'kv-chip kv-mono', type: 'button', text: drive,
        onclick: () => filesLoad(drive)
      }));
    }
    const pin = t8x.files.dir;
    if (pin && data.dir !== data.root) {
      jump.append(ctx.el('button', {
        class: 'kv-chip', type: 'button', text: 'proje kökü',
        onclick: () => filesLoad(data.root || '')
      }));
    }
    list.append(jump);
  }

  if (!data.entries.length) list.append(ctx.el('p', { class: 'kv-empty', text: 'Klasör boş.' }));
  for (const entry of data.entries) {
    const row = ctx.el('div', {
      class: 'kv-file', role: 'button', tabindex: '0',
      'data-file': entry.rel,
      'aria-current': t8x.files.picked[entry.rel] ? 'true' : null
    }, [
      ctx.el('span', { class: 'kv-file__icon', text: entry.dir ? '▸' : entry.text ? '≡' : '•' }),
      ctx.el('span', { class: 'kv-file__main' }, [
        ctx.el('b', { text: entry.name }),
        ctx.el('small', { class: 'kv-muted kv-mono', text: entry.dir ? 'klasör' : `${entry.size == null ? '?' : Math.round(entry.size / 1024) + ' KB'} · ${entry.rel}` })
      ]),
      !entry.dir ? ctx.el('input', {
        type: 'checkbox', class: 'kv-file__pick', title: 'Bağlama ekle',
        'aria-label': `Bağlama ekle: ${entry.name}`,
        checked: Boolean(t8x.files.picked[entry.rel]) || null,
        'data-file-pick': entry.rel,
        onclick: (e) => {
          e.stopPropagation();
          if (e.target.checked) t8x.files.picked[entry.rel] = true;
          else delete t8x.files.picked[entry.rel];
          setField('files-picked', String(Object.keys(t8x.files.picked).length));
          renderContextPicks();
        }
      }) : null
    ]);
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-file-pick]')) return;
      if (entry.dir) filesLoad(entry.rel);
      else filePreview(entry.rel);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (entry.dir) filesLoad(entry.rel);
      else filePreview(entry.rel);
    });
    list.append(row);
  }

  if (!t8x.files.preview) {
    preview.append(ctx.el('p', { class: 'kv-empty', text: 'Bir dosyaya tıklayınca içerik burada açılır. Kutucuk işaretlerseniz bağlama eklenir.' }));
  } else {
    const p = t8x.files.preview;
    preview.append(ctx.el('header', { class: 'kv-section__head' }, [
      ctx.el('h3', { class: 'kv-mono', text: p.rel }),
      ctx.el('div', { class: 'kv-row' }, [
        p.binary ? ctx.badge('ikili dosya', 'warning') : ctx.badge(p.truncated ? 'kırpıldı' : 'metin', 'info'),
        ctx.el('button', {
          class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Bağlama ekle',
          onclick: () => {
            t8x.files.picked[p.rel] = true;
            ctx.toast('Bağlama eklendi.', 'success');
            renderFiles();
            renderContextPicks();
          }
        })
      ])
    ]));
    if (p.binary) {
      preview.append(ctx.el('p', { class: 'kv-empty', text: 'İkili dosya önizlenmez.' }));
    } else {
      preview.append(ctx.el('pre', { class: 'kv-code', text: p.text }));
    }
  }
}

async function filePreview(rel) {
  const res = await ctx.call(ctx.KV.files.read, { path: rel });
  if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Dosya okunamadı.', 'danger'); return; }
  t8x.files.preview = res.data;
  renderFiles();
}

/* ---------------------------------------------------------------- bağlamlar */

function renderContextPicks() {
  const box = $('[data-context-picks]');
  if (!box) return;
  box.replaceChildren();
  const picked = Object.keys(t8x.files.picked);
  if (!picked.length) {
    box.append(ctx.el('p', { class: 'kv-empty', text: 'Dosyalar ekranından dosya işaretleyin.' }));
    return;
  }
  for (const rel of picked) {
    box.append(ctx.el('div', { class: 'kv-chip-row' }, [
      ctx.el('span', { class: 'kv-chip kv-mono', text: rel }),
      ctx.el('button', {
        class: 'kv-iconbtn kv-iconbtn--sm', type: 'button', text: '✕', title: 'Bağlamdan çıkar',
        onclick: () => { delete t8x.files.picked[rel]; renderContextPicks(); setField('files-picked', String(Object.keys(t8x.files.picked).length)); }
      })
    ]));
  }
}

function renderContexts() {
  renderContextPicks();
  const out = $('[data-context-out]');
  if (!out) return;
  out.replaceChildren();
  if (!t8x.context.result) {
    out.append(ctx.el('p', { class: 'kv-empty', text: 'Dosya seçip “Bağlam oluştur”a basın. Hafıza kayıtları otomatik eklenir.' }));
    return;
  }
  const r = t8x.context.result;
  out.append(ctx.el('header', { class: 'kv-section__head' }, [
    ctx.el('h3', { text: `${r.files.length} dosya · ${r.memoryCount} hafıza · ${r.chars} karakter` }),
    ctx.el('button', {
      class: 'kv-button kv-button--ghost kv-button--sm', type: 'button', text: 'Kopyala',
      onclick: () => ctx.copyText(r.block, 'Bağlam kopyalandı.')
    })
  ]));
  if (r.skipped.length) {
    out.append(ctx.el('p', { class: 'kv-muted', text: `Atlanan: ${r.skipped.map((s) => `${s.path} (${s.reason})`).join(', ')}` }));
  }
  out.append(ctx.el('pre', { class: 'kv-code', text: r.block || '(boş)' }));
}

async function contextBuild() {
  const query = $('[data-field="context-query"]');
  const paths = Object.keys(t8x.files.picked);
  if (!paths.length) { ctx.toast('Önce Dosyalar ekranından dosya seçin.', 'warning'); return; }
  t8x.context.loading = true;
  const res = await ctx.call(ctx.KV.files.context, {
    paths,
    query: query ? query.value.trim() : ''
  });
  t8x.context.loading = false;
  if (!res.ok) { ctx.toast((res.error && res.error.message) || 'Bağlam oluşturulamadı.', 'danger'); return; }
  t8x.context.result = res.data;
  renderContexts();
}

/* ----------------------------------------------------------------------- init */

export function initTur8(context) {
  ctx = context;

  /* Tur 9: Votion'un beyaz liste eylemlerini renderer tarafında yürüten köprü. */
  ctx.votionRun = runVotionAction;
  ctx.votionShowShot = votionShowShot;

  const prefs = (ctx.store && ctx.store.prefs) || {};
  t8.rail.open = prefs.railOpen !== false;
  t8.rail.width = WIDTHS[prefs.railWidth] ? prefs.railWidth : 'normal';
  t8.rail.tab = ['lider', 'results', 'project'].includes(prefs.railTab) ? prefs.railTab : 'lider';
  applyRail();

  document.addEventListener('click', (e) => {
    const railTabBtn = e.target.closest('[data-rail-tab]');
    if (railTabBtn) { railTab(railTabBtn.dataset.railTab); return; }

    const width = e.target.closest('[data-rail-width]');
    if (width) {
      t8.rail.width = width.dataset.railWidth;
      applyRail();
      saveRailPrefs();
      return;
    }

    const railReport = e.target.closest('[data-rail-report]');
    if (railReport && typeof ctx.navOpenReport === 'function') { ctx.navOpenReport(railReport.dataset.railReport); return; }

    const railTask = e.target.closest('[data-rail-task]');
    if (railTask && typeof ctx.navOpenTask === 'function') { ctx.navOpenTask(railTask.dataset.railTask); return; }

    const railMem = e.target.closest('[data-rail-memory]');
    if (railMem) { ctx.go('memory'); ctx.store.memory.selected = railMem.dataset.railMemory; return; }

    const act = e.target.closest('[data-votion-act]');
    if (act) { votionAct(act.dataset.votionAct); return; }

    const planTab = e.target.closest('[data-plan-tab]');
    if (planTab) {
      t8x.plan.tab = planTab.dataset.planTab;
      t8x.plan.selectedPlan = null;
      renderPlan();
      return;
    }

    /* menü dışına tıklama menüyü kapatır */
    if (!e.target.closest('[data-context-menu]')) closeMenu();
  }, true);

  document.addEventListener('contextmenu', openMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); if (tourApi && tourApi.isActive()) tourApi.close(); }
  });
  window.addEventListener('resize', () => { if (tourApi && tourApi.isActive()) tourApi.resize(); });

  const form = $('[data-rail-form]');
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); railSend(); });
  const text = $('[data-field="rail-text"]');
  if (text) {
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); railSend(); }
    });
  }
}

/** app.js aksiyon anahtarı. */
export async function tur8Action(action) {
  switch (action) {
    case 'rail-toggle': railOpen(!t8.rail.open); return true;
    case 'rail-close': railOpen(false); return true;
    case 'rail-new': {
      t8.conv.id = null;
      const input = $('[data-field="rail-text"]');
      if (input) input.value = '';
      await renderLiderPane();
      ctx.toast('Yeni lider konuşması hazır.', 'info');
      return true;
    }
    case 'rail-open-reports': ctx.go('reports'); return true;
    case 'rail-open-projects': ctx.go('projects'); return true;
    case 'tour-start': openTour(); return true;
    case 'tour-next': if (tourApi) tourApi.next(); return true;
    case 'tour-prev': if (tourApi) tourApi.prev(); return true;
    case 'tour-skip':
    case 'tour-exit': if (tourApi) tourApi.close(); return true;
    /* --- Tur 8 ekran eylemleri --- */
    case 'teams-refresh': await teamsLoad(); return true;
    case 'team-new': teamNewDialog(); return true;
    case 'plan-new': planNewDialog('plan'); return true;
    case 'note-new': planNewDialog('note'); return true;
    case 'schedule-new': planNewDialog('schedule'); return true;
    case 'plan-refresh': await planLoad(); return true;
    case 'files-refresh': await filesLoad(t8x.files.dir); return true;
    case 'files-up': {
      const data = t8x.files.data;
      if (data && data.parent) await filesLoad(data.parent);
      return true;
    }
    case 'context-build': await contextBuild(); return true;
    default: return false;
  }
}

export function tur8Screen(screen) {
  /* Panel her ekranda görünür kalır; yalnız içeriği ekranla ilgilenir. */
  if (t8.rail.open) renderRail();
  /* Tur 8 ekranları kendi verisini çeker (yalnız görünürken). */
  if (screen === 'teams') teamsLoad();
  else if (screen === 'plans') planLoad();
  else if (screen === 'files') filesLoad(t8x.files.dir);
  else if (screen === 'contexts') { renderContexts(); renderContextPicks(); }
}

export function tur8Boot() {
  renderRail();
  setInterval(() => { if (t8.rail.open && t8.rail.tab !== 'lider') renderRail(); }, 20000);
}

/** Yerel erişim izni değişti: Dosyalar ekranı kök/izinden yeniden yüklenir. */
export function tur8FilesLocalAccessChanged() {
  t8x.files.data = null;
  t8x.files.dir = '';
  const screen = document.querySelector('[data-screen="files"]');
  if (screen && !screen.hidden) { filesLoad(''); return; }
  renderFiles();
}

export function tur8TourOpen(index = 0) {
  openTour();
  if (tourApi && index) tourApi.open(index);
  return Boolean(tourApi);
}
