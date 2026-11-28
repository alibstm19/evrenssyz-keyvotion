/**
 * Zihin haritasi (T6-4) — deterministik koordinatli dugum/kenar cizimi.
 *
 * Girdi: memory.graph() ciktisi { nodes[], edges[], total }.
 * Ciktilar CSS degiskenleriyle konumlanir (UI-06: inline left/top yok):
 *   .kv-mind__node  -> --x, --y  (yuzde)
 *   .kv-mind__tip   -> --tx, --ty (yuzde)
 * Metin her zaman textContent ile yazilir (hafiza metni HTML sayilmaz).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 10) / 10)) : 50;
}

export function renderMindMap(host, graph, options = {}) {
  if (!host) return { destroy() {}, nodeCount: 0, edgeCount: 0 };

  const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
  const maxNodes = Number.isInteger(options.maxNodes) && options.maxNodes > 0 ? options.maxNodes : 160;

  host.replaceChildren();

  const allNodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const allEdges = Array.isArray(graph && graph.edges) ? graph.edges : [];

  /* Bos hafiza: dugum yok, acik bir bilgi karti. */
  if (allNodes.length <= 1) {
    const empty = document.createElement('div');
    empty.className = 'kv-mind__tip';
    empty.setAttribute('data-open', 'true');
    empty.textContent = options.filtered
      ? 'Bu filtrelerle eşleşen düğüm yok.'
      : 'Haritada gösterilecek kayıt yok. Hafıza kaydı eklediğinizde burada görünür.';
    host.appendChild(empty);
    return { destroy() { host.replaceChildren(); }, nodeCount: 0, edgeCount: 0 };
  }

  /* Hub her zaman kalir; kalanlar agirliga gore kirpilir. */
  const hub = allNodes.find((n) => n.kind === 'hub' || n.role === 'hub') || allNodes[0];
  const rest = allNodes
    .filter((n) => n !== hub)
    .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
  const shown = [{ ...hub, x: 50, y: 48 }, ...rest.slice(0, maxNodes - 1).map((node, index, list) => {
    const side = index % 2 === 0 ? -1 : 1;
    const radius = Math.sqrt((Math.floor(index / 2) + 1) / Math.ceil(list.length / 2));
    const angle = index * 2.399963;
    return { ...node, x: 50 + side * (22 + Math.cos(angle) * radius * 17),
      y: 47 + Math.sin(angle) * radius * 31 };
  })];
  const byId = new Map(shown.map((n) => [n.id, n]));

  /* --- kenarlar --- */
  const canvas = document.createElementNS(SVG_NS, 'svg');
  canvas.setAttribute('class', 'kv-mind__canvas');
  canvas.setAttribute('viewBox', '0 0 100 100');
  canvas.setAttribute('preserveAspectRatio', 'none');
  canvas.setAttribute('aria-hidden', 'true');

  for (const outline of [
    'M50 18 C42 7 28 8 21 14 C11 13 6 25 8 33 C1 43 5 56 11 62 C9 73 21 85 32 81 C39 86 47 79 50 72 Z',
    'M50 18 C58 7 72 8 79 14 C89 13 94 25 92 33 C99 43 95 56 89 62 C91 73 79 85 68 81 C61 86 53 79 50 72 Z'
  ]) {
    const lobe = document.createElementNS(SVG_NS, 'path');
    lobe.setAttribute('d', outline);
    lobe.setAttribute('class', 'kv-mind__lobe');
    canvas.appendChild(lobe);
  }
  const connections = [];
  let edgeCount = 0;
  for (const edge of allEdges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(pct(from.x)));
    line.setAttribute('y1', String(pct(from.y)));
    line.setAttribute('x2', String(pct(to.x)));
    line.setAttribute('y2', String(pct(to.y)));
    line.setAttribute('class', edge.kind === 'tag' ? 'kv-mind__edge kv-mind__edge--tag' : 'kv-mind__edge');
    canvas.appendChild(line);
    connections.push({ edge, line });
    edgeCount += 1;
  }

  /* --- ipucu karti --- */
  const tip = document.createElement('div');
  tip.className = 'kv-mind__tip';
  tip.setAttribute('data-open', 'false');
  tip.setAttribute('role', 'tooltip');

  const tipHead = document.createElement('b');
  const tipMeta = document.createElement('span');
  const tipBody = document.createElement('p');
  tipBody.className = 'kv-mind__tip-body';
  tip.append(tipHead, tipMeta, tipBody);

  function showTip(node, element) {
    tipHead.textContent = node.kind === 'hub' ? 'Merkez' : String(node.kind || 'kayıt');
    tipMeta.textContent = `${node.scope || 'proje'}${node.at ? ` · ${String(node.at).slice(0, 10)}` : ''}`;
    tipBody.textContent = String(node.text || node.label || '');
    tip.style.setProperty('--tx', `${pct(node.x)}%`);
    tip.style.setProperty('--ty', `${pct(node.y)}%`);
    tip.setAttribute('data-open', 'true');
    element.setAttribute('aria-describedby', 'kv-mind-tip');
  }

  function hideTip() {
    tip.setAttribute('data-open', 'false');
  }

  tip.id = 'kv-mind-tip';

  /* --- dugumler --- */
  const buttons = new Map();
  function select(id, focus = false) {
    const node = byId.get(id);
    if (!node || node.kind === 'hub') return;
    const related = new Set();
    for (const { edge, line } of connections) {
      const active = edge.from === id || edge.to === id;
      line.classList.toggle('kv-mind__edge--hot', active);
      if (active && edge.kind === 'tag') related.add(edge.from === id ? edge.to : edge.from);
    }
    for (const [key, button] of buttons) {
      button.setAttribute('aria-pressed', String(key === id));
      button.classList.toggle('kv-mind__node--related', related.has(key));
    }
    if (focus) buttons.get(id)?.focus({ preventScroll: true });
    if (onSelect) onSelect(node, [...related].map((key) => byId.get(key)), (key) => select(key, true));
  }

  let nodeCount = 0;
  for (const node of shown) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = node.kind === 'hub' ? 'kv-mind__node kv-mind__node--hub' : 'kv-mind__node';
    btn.style.setProperty('--x', `${pct(node.x)}%`);
    btn.style.setProperty('--y', `${pct(node.y)}%`);
    if (node.scope) btn.setAttribute('data-scope', String(node.scope));
    if (node.kind) btn.setAttribute('data-kind', String(node.kind));
    btn.setAttribute('aria-label', `${String(node.label || node.id)} · ${node.scope || 'proje'}`);
    btn.addEventListener('mouseenter', () => showTip(node, btn));
    btn.addEventListener('focus', () => showTip(node, btn));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('blur', hideTip);
    if (node.kind === 'hub') {
      btn.disabled = true;
    } else {
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => select(node.id));
      buttons.set(node.id, btn);
    }
    host.appendChild(btn);
    nodeCount += 1;
  }

  host.prepend(canvas);
  host.appendChild(tip);

  /* --- gosterge --- */
  const legend = document.createElement('div');
  legend.className = 'kv-mind__legend';
  const totalNode = document.createElement('span');
  totalNode.textContent = `${nodeCount - 1} gösterilen kayıt · ${graph.total ?? allNodes.length - 1} toplam`;
  const scopes = document.createElement('span');
  const byScope = (graph && graph.byScope) || {};
  scopes.textContent = `kullanıcı ${byScope.user || 0} · ekip ${byScope.team || 0} · proje ${byScope.project || 0}`;
  legend.append(totalNode, scopes);
  if (allNodes.length > maxNodes) {
    const clipped = document.createElement('span');
    clipped.textContent = 'Daha fazla kayıt için arama veya kapsam filtresini kullanın.';
    legend.appendChild(clipped);
  }
  host.appendChild(legend);

  return {
    destroy() {
      host.replaceChildren();
    },
    nodeCount,
    edgeCount
  };
}
