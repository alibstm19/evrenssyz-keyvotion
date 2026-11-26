/* keyvotion-console · canlı tur (T8-1)
   Ekranda GERÇEKTEN gezen rehber: hedefe gider, öğeyi vurgu kutusuyla
   işaretler, kartı hedefin yanına yerleştirir. Konumlar ölçülerek verilir
   (uydurma yok); hedef görünmüyorsa adım "hedef bulunamadı" der ve geçilir.
   Sahip: LDR · Bağımlılık yok · Ağ yok. */

const $ = (sel, root = document) => root.querySelector(sel);

/*
 * Tur kökü SADECE sınıfla seçilir.
 * Eski kod `[data-tour]` kullanıyordu; tur açıkken <html data-tour="on">
 * olduğu için bu seçici <html>'i yakalıyor ve `close()` belgeyi gizliyordu
 * (tur bitince bembeyaz ekran). Sınıf seçicisi o tuzağı kapatır.
 */
const ROOT_SEL = '.kv-tour';

const STEPS = [
  {
    id: 'nav',
    screen: 'team',
    target: '[data-nav]',
    title: 'Sol menü: bölümler',
    body: 'Her bölüm tek bir işi yapar. Tur boyunca sırayla gezineceğiz; istediğin an "Atla" ile çıkabilirsin.',
    place: 'right'
  },
  {
    id: 'tabs',
    screen: 'team',
    target: '[data-tabs]',
    title: 'Gezgin şeridi',
    body: 'Tarayıcı gibi sekmeler: bir görev, rapor ya da ekran açtığında yeni sekmede kalır, geri/ileri ile dolaşırsın.',
    place: 'bottom'
  },
  {
    id: 'rail',
    screen: 'team',
    target: '[data-rail]',
    title: 'Sağ panel: boşluk değil, çalışma alanı',
    body: 'Liderle konuşma, son sonuçlar ve seçili projenin token dağılımı burada. Üst şeritten açıp kapatabilirsin.',
    place: 'left'
  },
  {
    id: 'team',
    screen: 'team',
    target: '[data-team-grid]',
    title: 'Ekip',
    body: 'Her kart bir ajan. Kartın üzerine gelince hızlı işlemler, sağ tık ile bağlam menüsü çıkar.',
    place: 'bottom'
  },
  {
    id: 'desk',
    screen: 'team',
    target: '.kv-desk',
    title: 'Lider masası',
    body: 'Liderle doğrudan yazış. Görev dağıtımı, durum sorma ve karar alma buradan yürür.',
    place: 'top'
  },
  {
    id: 'command',
    screen: 'command',
    target: '[data-screen="command"] .kv-cmd__composer',
    title: 'Komut merkezi',
    body: 'Hedef seç, emri yaz, gönder. Şablonlar (/durum, /rapor, /devam, /dur) tek tıkla doldurur.',
    place: 'top'
  },
  {
    id: 'board',
    screen: 'board',
    target: '[data-board-root]',
    title: 'Pano',
    body: 'Görevler durum sütunlarında yaşar. Bir karta tıklayınca ayrıntı paneli açılır ve sekme olarak da açılabilir.',
    place: 'top'
  },
  {
    id: 'memory',
    screen: 'memory',
    target: '[data-memory-graph]',
    title: 'Hafıza haritası',
    body: 'Her nokta bir çıkarım. Üzerine gelince özet görürsün; hafıza her işten sonra kendiliğinden büyür.',
    place: 'bottom'
  },
  {
    id: 'chat',
    screen: 'chat',
    target: '.kv-chat-rail',
    title: 'Sohbetler',
    body: 'Ajan ya da model seçmeden de yazabilirsin: varsayılan rol Lider, model otomatik seçilir. Konuşmalar burada listelenir.',
    place: 'right'
  },
  {
    id: 'votion',
    screen: 'chat',
    target: '[data-votion-fab]',
    title: 'Votion',
    body: 'Sesli komutla uygulamada dolaşır, sayfa özetler, ekranı okur, uygulama açar. Yıkıcı işlerde önce senden onay ister.',
    place: 'left'
  }
];

const tour = {
  active: false,
  index: 0,
  steps: STEPS,
  goScreen: null,
  timer: null
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Hedefin ekran dikdörtgeni — görünmüyorsa null. */
function rectOf(selector) {
  const node = $(selector);
  if (!node) return null;
  const r = node.getBoundingClientRect();
  if (!r || r.width < 8 || r.height < 8) return null;
  const style = window.getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height, node };
}

function paintSpot(rect, pad) {
  const spot = $('[data-tour-spot]');
  if (!spot) return;
  if (!rect) {
    spot.hidden = true;
    return;
  }
  spot.hidden = false;
  spot.style.setProperty('--tour-x', `${Math.round(rect.x - pad)}px`);
  spot.style.setProperty('--tour-y', `${Math.round(rect.y - pad)}px`);
  spot.style.setProperty('--tour-w', `${Math.round(rect.w + pad * 2)}px`);
  spot.style.setProperty('--tour-h', `${Math.round(rect.h + pad * 2)}px`);
}

function placeCard(rect, place) {
  const card = $('[data-tour-card]');
  if (!card) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box = card.getBoundingClientRect();
  const cw = box.width || 320;
  const ch = box.height || 180;
  const gap = 16;

  let x = vw - cw - 24;
  let y = vh - ch - 24;

  if (rect) {
    if (place === 'right') x = rect.x + rect.w + gap;
    else if (place === 'left') x = rect.x - cw - gap;
    else if (place === 'bottom') { x = rect.x + rect.w / 2 - cw / 2; y = rect.y + rect.h + gap; }
    else { x = rect.x + rect.w / 2 - cw / 2; y = rect.y - ch - gap; }

    /* sığmıyorsa karşı tarafa çevir */
    if (place === 'right' && x + cw > vw - 12) x = rect.x - cw - gap;
    if (place === 'left' && x < 12) x = rect.x + rect.w + gap;
    if (place === 'bottom' && y + ch > vh - 12) y = rect.y - ch - gap;
    if (place === 'top' && y < 12) y = rect.y + rect.h + gap;
  }

  card.style.setProperty('--tour-card-x', `${Math.round(clamp(x, 12, vw - cw - 12))}px`);
  card.style.setProperty('--tour-card-y', `${Math.round(clamp(y, 12, vh - ch - 12))}px`);
}

function renderStep() {
  const root = $(ROOT_SEL);
  if (!root) return;
  const steps = tour.steps;
  const index = clamp(tour.index, 0, steps.length - 1);
  const step = steps[index];
  const rect = rectOf(step.target);

  const set = (name, text) => {
    const node = $(`[data-field="${name}"]`);
    if (node) node.textContent = text == null ? '' : String(text);
  };
  set('tour-step', `${index + 1} / ${steps.length}`);
  set('tour-target', rect ? step.target : `${step.target} · bulunamadı`);
  set('tour-title', step.title);
  set('tour-body', rect ? step.body : `${step.body} (Bu adımın hedefi şu an ekranda değil.)`);
  set('tour-hint', rect ? `${Math.round(rect.w)}×${Math.round(rect.h)}` : 'hedef yok');

  const prev = $('[data-action="tour-prev"]');
  if (prev) prev.disabled = index === 0;
  const next = $('[data-action="tour-next"]');
  if (next) next.textContent = index === steps.length - 1 ? 'Bitir' : 'İleri';

  paintSpot(rect, 8);
  placeCard(rect, step.place);
  if (rect && typeof rect.node.scrollIntoView === 'function') {
    rect.node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    /* kaydırma bitince yeniden ölç (kutu hedefte kalsın) */
    clearTimeout(tour.timer);
    tour.timer = setTimeout(() => {
      const again = rectOf(step.target);
      paintSpot(again, 8);
      placeCard(again, step.place);
    }, 320);
  }
}

function waitFor(selector, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (rectOf(selector) || Date.now() - started > timeoutMs) resolve(Boolean(rectOf(selector)));
      else setTimeout(tick, 60);
    };
    tick();
  });
}

async function goStep(index) {
  const step = tour.steps[index];
  if (!step) return;
  tour.index = index;
  if (step.screen && typeof tour.goScreen === 'function') {
    tour.goScreen(step.screen);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await waitFor(step.target, 900);
  }
  renderStep();
}

export function createTour({ go, speak } = {}) {
  tour.goScreen = typeof go === 'function' ? go : null;

  function open(index = 0, steps) {
    const root = $(ROOT_SEL);
    if (!root) return false;
    if (Array.isArray(steps) && steps.length) tour.steps = steps;
    else if (!tour.steps.length) tour.steps = STEPS;
    root.hidden = false;
    document.documentElement.dataset.tourActive = 'on';
    tour.active = true;
    goStep(clamp(index, 0, tour.steps.length - 1));
    if (typeof speak === 'function') {
      const step = tour.steps[tour.index];
      if (step) speak(`${step.title}. ${step.body}`);
    }
    return true;
  }

  function close() {
    const root = $(ROOT_SEL);
    if (root) root.hidden = true;
    document.documentElement.removeAttribute('data-tour-active');
    tour.active = false;
    clearTimeout(tour.timer);
  }

  function next() {
    if (!tour.active) return false;
    if (tour.index >= tour.steps.length - 1) { close(); return true; }
    goStep(tour.index + 1);
    return true;
  }

  function prev() {
    if (!tour.active || tour.index <= 0) return false;
    goStep(tour.index - 1);
    return true;
  }

  function resize() {
    if (tour.active) renderStep();
  }

  return { open, close, next, prev, resize, isActive: () => tour.active, steps: () => tour.steps.slice() };
}

export { STEPS as TOUR_STEPS };
