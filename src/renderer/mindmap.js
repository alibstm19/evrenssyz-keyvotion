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
    empty.textContent = 'Henüz hafıza kaydı yok — bir görev tamamlanınca burası dolar.';
    host.appendChild(empty);
    return { destroy() { host.replaceChildren(); }, nodeCount: 0, edgeCount: 0 };
  }

  /* Hub her zaman kalir; kalanlar agirliga gore kirpilir. */
  const hub = allNodes.find((n) => n.kind === 'hub' || n.role === 'hub') || allNodes[0];
  const rest = allNodes
    .filter((n) => n !== hub)
    .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
  const shown = [hub, ...rest.slice(0, Math.max(0, maxNodes - 1))];
  const byId = new Map(shown.map((n) => [n.id, n]));

  /* --- kenarlar --- */
  const canvas = document.createElementNS(SVG_NS, 'svg');
  canvas.setAttribute('class', 'kv-mind__canvas');
  canvas.setAttribute('viewBox', '0 0 100 100');
  canvas.setAttribute('preserveAspectRatio', 'none');
  canvas.setAttribute('aria-hidden', 'true');

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
  let nodeCount = 0;
  for (const node of shown) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = node === hub || node.kind === 'hub' ? 'kv-mind__node kv-mind__node--hub' : 'kv-mind__node';
    btn.style.setProperty('--x', `${pct(node.x)}%`);
    btn.style.setProperty('--y', `${pct(node.y)}%`);
    if (node.scope) btn.setAttribute('data-scope', String(node.scope));
    if (node.kind) btn.setAttribute('data-kind', String(node.kind));
    btn.setAttribute('aria-label', `${String(node.label || node.id)} · ${node.scope || 'proje'}`);
    btn.addEventListener('mouseenter', () => showTip(node, btn));
    btn.addEventListener('focus', () => showTip(node, btn));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('blur', hideTip);
    if (onSelect) {
      btn.addEventListener('click', () => {
        onSelect(node);
        tip.setAttribute('data-open', 'true');
      });
    }
    host.appendChild(btn);
    nodeCount += 1;
  }

  host.appendChild(canvas);
  host.appendChild(tip);

  /* --- gosterge --- */
  const legend = document.createElement('div');
  legend.className = 'kv-mind__legend';
  const totalNode = document.createElement('span');
  totalNode.textContent = `${nodeCount} nokta`;
  const scopes = document.createElement('span');
  const byScope = (graph && graph.byScope) || {};
  scopes.textContent = `kullanıcı ${byScope.user || 0} · ekip ${byScope.team || 0} · proje ${byScope.project || 0}`;
  legend.append(totalNode, scopes);
  if (allNodes.length > maxNodes) {
    const clipped = document.createElement('span');
    clipped.textContent = `${allNodes.length} kayıttan ${maxNodes} gösteriliyor`;
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
