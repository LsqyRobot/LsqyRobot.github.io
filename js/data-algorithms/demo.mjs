import { getDemoTrace } from './model.mjs';

const svgNS = 'http://www.w3.org/2000/svg';
let instanceId = 0;
const make = (name, className, value) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
};
const svg = (name, attributes = {}) => {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};
function field(label, value) {
  const item = make('div', 'algorithm-field');
  item.append(make('span', 'algorithm-field-label', label), make('strong', '', value));
  return item;
}
function renderArray(stage, frame, kind) {
  const cells = make('div', 'algorithm-cells');
  cells.setAttribute('aria-label', kind === 'dp' ? '每个金额的最少硬币数' : '当前数组');
  for (let i = 0; i < frame.items.length; i++) {
    const classes = ['algorithm-cell'];
    if (frame.hole === i) classes.push('is-hole');
    if (frame.active?.includes(i) || frame.mid === i) classes.push('is-active');
    if (kind === 'binary' && i >= frame.lo && i < frame.hi) classes.push('is-range');
    if (kind === 'window' && !frame.done && i >= frame.left && i < frame.right) classes.push('is-range');
    if (kind === 'insertion' && i < frame.sorted) classes.push('is-sorted');
    if (kind === 'dp' && frame.source === i) classes.push('is-source');
    if (frame.done && (kind === 'binary' ? i === frame.answer : kind === 'window' ?
      frame.bestWindow !== null && i >= frame.bestWindow[0] && i < frame.bestWindow[1] : true)) classes.push('is-final');
    const cell = make('div', classes.join(' '));
    cell.append(
      make('span', 'algorithm-index', (kind === 'dp' ? '金额 ' : '下标 ') + i),
      make('strong', 'algorithm-value', frame.items[i] === null ? (kind === 'dp' ? '∞' : '空') : frame.items[i]),
      make('span', 'algorithm-cell-note', frame.hole === i ? '空位' : frame.mid === i ? 'mid' :
        kind === 'dp' && frame.source === i ? '前驱' : frame.active?.includes(i) ? '本步' : '\u00a0')
    );
    cells.append(cell);
  }
  if (!frame.items.length) cells.append(make('p', 'algorithm-empty', '空序列'));
  stage.append(cells);
  const meta = make('div', 'algorithm-meta');
  if (kind === 'binary') {
    meta.append(field('候选区间', '[' + frame.lo + ', ' + frame.hi + ')'), field('目标', frame.target));
    if (frame.answer !== undefined) meta.append(field('返回下标', frame.answer + (frame.answer === frame.items.length ? '（尾后）' : '')));
  } else if (kind === 'insertion') {
    meta.append(field('单独保存的 key', frame.key === null ? '无' : frame.key));
  } else if (kind === 'dp') {
    meta.append(field('可用硬币', frame.coins.join('、') || '无'), field('本次硬币', frame.coin ?? '—'));
    if (frame.answer !== undefined) meta.append(field('答案', frame.answer === null ? '不可达' : frame.answer));
  } else if (kind === 'window') {
    meta.append(field('窗口 [left, right)', '[' + frame.left + ', ' + frame.right + ')'),
      field('sum', frame.sum), field('target', frame.target),
      field('当前最短长度', frame.best ?? '尚无达标窗口'));
    if (frame.bestWindow !== null) meta.append(field('最短窗口', '[' + frame.bestWindow[0] + ', ' + frame.bestWindow[1] + ')'));
    if (frame.done && frame.answer === 0) meta.append(field('返回值', '0（不存在达标段）'));
  } else {
    meta.append(field('插入位置', frame.index));
  }
  stage.append(meta);
}
function renderLinked(stage, frame) {
  const meta = make('div', 'algorithm-meta');
  meta.append(field('head', frame.head ?? 'nullptr'), field('prev', frame.previous ?? '头部插入'));
  stage.append(meta);
  const nodes = make('div', 'algorithm-linked-nodes');
  for (const item of frame.nodes) {
    const node = make('div', 'algorithm-node' + (frame.active.includes(item.id) ? ' is-active' : ''));
    node.append(make('span', 'algorithm-index', item.id), make('strong', 'algorithm-value', item.value),
      make('span', 'algorithm-next', 'next → ' + (item.next ?? 'nullptr')));
    nodes.append(node);
  }
  stage.append(nodes);
  const byId = new Map(frame.nodes.map((node) => [node.id, node]));
  const path = ['head'], visited = new Set();
  let current = frame.head;
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const node = byId.get(current);
    path.push(node.value + ' (' + node.id + ')');
    current = node.next;
  }
  path.push('nullptr');
  stage.append(make('p', 'algorithm-path', '可达链路：' + path.join(' → ')));
}
function renderBfs(stage, frame, id) {
  const graph = svg('svg', { viewBox: '0 0 430 235', class: 'algorithm-graph', role: 'img',
    'aria-label': '有向图 A 到 B 和 C，B 到 D，C 到 D 和 E。当前节点 ' + (frame.current ?? '无') });
  const positions = { A: [55, 112], B: [210, 45], C: [210, 180], D: [375, 45], E: [375, 180] };
  const defs = svg('defs');
  const marker = svg('marker', { id: id + '-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
    markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#637b9a' }));
  defs.append(marker);
  graph.append(defs);
  for (const [from, neighbors] of Object.entries(frame.graph)) {
    for (const to of neighbors) {
      const a = positions[from], b = positions[to], dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      const hot = frame.edge?.[0] === from && frame.edge?.[1] === to;
      graph.append(svg('line', {
        x1: a[0] + dx / length * 25, y1: a[1] + dy / length * 25,
        x2: b[0] - dx / length * 30, y2: b[1] - dy / length * 30,
        stroke: hot ? '#b35314' : '#637b9a', 'stroke-width': hot ? 4 : 2,
        'marker-end': 'url(#' + id + '-arrow)'
      }));
    }
  }
  for (const [name, position] of Object.entries(positions)) {
    const state = frame.current === name ? 'active' : frame.order.includes(name) ? 'finished' :
      frame.seen.includes(name) ? 'queued' : 'unseen';
    const group = svg('g', { class: 'algorithm-graph-node is-' + state });
    group.append(svg('circle', { cx: position[0], cy: position[1], r: 24 }));
    const label = svg('text', { x: position[0], y: position[1] + 6, 'text-anchor': 'middle' });
    label.textContent = name;
    group.append(label);
    const distance = svg('text', { x: position[0], y: position[1] + 43, 'text-anchor': 'middle', class: 'algorithm-distance' });
    distance.textContent = '距离 ' + (frame.distance[name] ?? '∞');
    group.append(distance);
    graph.append(group);
  }
  stage.append(graph);
  const meta = make('div', 'algorithm-meta');
  meta.append(field('队列（左为队首）', frame.queue.join(' → ') || '空'),
    field('已展开顺序', frame.order.join(' → ') || '无'));
  stage.append(meta);
}

function renderDijkstra(stage, frame, id) {
  const names = Object.keys(frame.graph);
  const graph = svg('svg', { viewBox: '0 0 480 330', class: 'algorithm-graph', role: 'img',
    'aria-label': 'Dijkstra 有向带权图。已确定：' + (frame.settled.join('、') || '无') +
      '。距离：' + names.map((name) => name + '=' + (frame.distance[name] ?? '∞')).join('，') });
  // Keep weight, distance and predecessor labels readable on small screens.
  graph.style.flex = '0 0 480px';
  graph.style.width = '480px';
  graph.style.maxWidth = '480px';
  const defaultPositions = { A: [45, 130], B: [175, 40], C: [175, 225], D: [315, 130], E: [440, 130], F: [440, 255] };
  const positions = Object.fromEntries(names.map((name, i) => [name, defaultPositions[name] ??
    [240 + 175 * Math.cos(2 * Math.PI * i / names.length), 150 + 100 * Math.sin(2 * Math.PI * i / names.length)]]));
  const defs = svg('defs');
  const marker = svg('marker', { id: id + '-weighted-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
    markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#637b9a' }));
  defs.append(marker);
  graph.append(defs);
  for (const [from, neighbors] of Object.entries(frame.graph)) {
    for (const edge of neighbors) {
      const a = positions[from], b = positions[edge.to], dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      const hot = frame.edge?.[0] === from && frame.edge?.[1] === edge.to;
      if (length === 0) continue;
      graph.append(svg('line', {
        x1: a[0] + dx / length * 25, y1: a[1] + dy / length * 25,
        x2: b[0] - dx / length * 30, y2: b[1] - dy / length * 30,
        stroke: hot ? '#b35314' : '#637b9a', 'stroke-width': hot ? 4 : 2,
        'marker-end': 'url(#' + id + '-weighted-arrow)'
      }));
      const x = (a[0] + b[0]) / 2 - dy / length * 12;
      const y = (a[1] + b[1]) / 2 + dx / length * 12;
      const width = Math.max(22, String(edge.weight).length * 8 + 10);
      graph.append(svg('rect', { x: x - width / 2, y: y - 10, width, height: 20, rx: 4, fill: '#f6f9fc' }));
      const weight = svg('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 14,
        'font-weight': hot ? 700 : 500, fill: hot ? '#a24f12' : '#264661' });
      weight.textContent = String(edge.weight);
      graph.append(weight);
    }
  }
  for (const [name, position] of Object.entries(positions)) {
    const state = frame.current === name ? 'active' : frame.settled.includes(name) ? 'finished' :
      frame.distance[name] !== null ? 'queued' : 'unseen';
    const group = svg('g', { class: 'algorithm-graph-node is-' + state });
    group.append(svg('circle', { cx: position[0], cy: position[1], r: 24 }));
    const label = svg('text', { x: position[0], y: position[1] + 6, 'text-anchor': 'middle' });
    label.textContent = name;
    group.append(label);
    for (const [text, offset] of [['距离 ' + (frame.distance[name] ?? '∞'), 42],
      ['前驱 ' + (frame.predecessor[name] ?? '—'), 59]]) {
      const detail = svg('text', { x: position[0], y: position[1] + offset,
        'text-anchor': 'middle', class: 'algorithm-distance' });
      detail.textContent = text;
      group.append(detail);
    }
    graph.append(group);
  }
  const scroller = make('div', 'algorithm-cells');
  scroller.tabIndex = 0;
  scroller.setAttribute('aria-label', '有向带权图；窄屏可左右滑动查看');
  scroller.append(graph);
  stage.append(scroller);
  const meta = make('div', 'algorithm-meta');
  const entryLabel = (entry) => entry.node + '（' + entry.distance + '）';
  meta.append(field('优先队列（左为最小）', frame.queue.map(entryLabel).join(' → ') || '空'),
    field('已确定顺序', frame.settled.join(' → ') || '无'),
    field('本次取出', frame.popped === null ? '—' : entryLabel(frame.popped) + (frame.skipped ? '，已过期' : '')),
    field('已跳过过期条目', frame.staleEntries.map((entry) => entryLabel(entry) + '，现值 ' + entry.currentDistance).join('；') || '无'));
  stage.append(meta);
  stage.append(make('p', 'algorithm-path', '箭头表示有向边；窄屏可左右滑动查看图。前驱“—”表示起点或不可达。'));
}

export function mountAlgorithmDemo(container) {
  if (container.dataset.initialized === 'true') return;
  const kind = container.dataset.demo;
  let data;
  try { data = getDemoTrace(kind); } catch {
    container.append(make('p', '', '未找到此演示，请检查 data-demo。'));
    return;
  }
  container.dataset.initialized = 'true';
  const id = 'algorithm-demo-' + (++instanceId);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, timer = null;
  const title = make('h3', 'algorithm-demo-title', data.title);
  title.id = id + '-title';
  container.setAttribute('role', 'region');
  container.setAttribute('aria-labelledby', title.id);
  const controls = make('div', 'algorithm-controls');
  const previous = make('button', '', '上一步');
  const next = make('button', '', '下一步');
  const reset = make('button', '', '重置');
  const play = make('button', '', '播放');
  for (const button of [previous, next, reset, play]) {
    button.type = 'button';
    controls.append(button);
  }
  const progress = make('span', 'algorithm-progress');
  controls.append(progress);
  const stage = make('div', 'algorithm-stage');
  const caption = make('p', 'algorithm-caption');
  caption.setAttribute('role', 'status');
  caption.setAttribute('aria-live', 'polite');
  const motionNote = make('p', 'algorithm-motion-note');
  const legend = make('p', 'algorithm-legend', data.legend);
  container.replaceChildren(title, controls, stage, caption, legend, motionNote);

  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    play.textContent = '播放';
    play.setAttribute('aria-pressed', 'false');
  };
  const render = () => {
    const frame = data.steps[index];
    stage.replaceChildren();
    if (kind === 'linked') renderLinked(stage, frame);
    else if (kind === 'bfs') renderBfs(stage, frame, id);
    else if (kind === 'dijkstra') renderDijkstra(stage, frame, id);
    else renderArray(stage, frame, kind);
    progress.textContent = (index + 1) + ' / ' + data.steps.length;
    caption.textContent = '第 ' + (index + 1) + ' 步：' + frame.caption;
    previous.disabled = index === 0;
    next.disabled = index === data.steps.length - 1;
    play.disabled = reduceMotion.matches || index === data.steps.length - 1;
    motionNote.hidden = !reduceMotion.matches;
    motionNote.textContent = '已开启减少动态效果：请用上一步、下一步查看，不启用定时播放。';
    container.dataset.step = String(index);
    container.dataset.stepCount = String(data.steps.length);
    if (index === data.steps.length - 1) stop();
  };
  previous.addEventListener('click', () => { stop(); index = Math.max(0, index - 1); render(); });
  next.addEventListener('click', () => { stop(); index = Math.min(data.steps.length - 1, index + 1); render(); });
  reset.addEventListener('click', () => { stop(); index = 0; render(); });
  play.addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    if (reduceMotion.matches || index === data.steps.length - 1) return;
    play.textContent = '暂停';
    play.setAttribute('aria-pressed', 'true');
    timer = window.setInterval(() => {
      if (!container.isConnected || document.hidden) { stop(); return; }
      index++;
      render();
    }, 1100);
  });
  reduceMotion.addEventListener('change', () => { stop(); render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  play.setAttribute('aria-pressed', 'false');
  render();
}

document.querySelectorAll('.algorithm-demo[data-demo]').forEach(mountAlgorithmDemo);
