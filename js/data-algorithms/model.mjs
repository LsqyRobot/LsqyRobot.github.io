// Pure trace generators. A frame owns its state; later steps never mutate it.
const clone = (value) => structuredClone(value);
function trace(kind, title, legend) {
  return { kind, title, legend, steps: [] };
}
function record(result, caption, state) {
  result.steps.push({ caption, ...clone(state) });
}
function checkNumbers(values) {
  if (!Array.isArray(values) || values.some((x) => !Number.isFinite(x))) {
    throw new TypeError('values must be an array of finite numbers');
  }
}
function checkIndex(index, min, max) {
  if (!Number.isInteger(index) || index < min || index > max) {
    throw new RangeError('index outside the allowed range');
  }
}

export function vectorInsertTrace(values = [10, 20, 30], index = 1, value = 15) {
  checkNumbers(values);
  if (!Number.isFinite(value)) throw new TypeError('inserted value must be finite');
  checkIndex(index, 0, values.length);
  const result = trace('vector', '连续序列：在下标 ' + index + ' 插入 ' + value,
    '橙色：本步写入；虚线：空位。示意已获得足够空间后的移动，不模拟分配器。');
  const items = [...values];
  record(result, '原序列；下标从 0 开始。', { items, active: [], hole: null, index });
  items.push(null);
  let hole = values.length;
  record(result, '准备一个尾部空位；插入之前，原有元素顺序保持不变。',
    { items, active: [hole], hole, index });
  for (let source = values.length - 1; source >= index; source--) {
    items[source + 1] = items[source];
    items[source] = null;
    hole = source;
    record(result, '将下标 ' + source + ' 的元素右移到 ' + (source + 1) + '；空位向左移动。',
      { items, active: [source + 1], hole, index });
  }
  items[index] = value;
  record(result, '把新值放入空位；后缀右移完成。', { items, active: [index], hole: null, index, done: true });
  return result;
}

export function linkedInsertTrace(values = [10, 20, 30], prevIndex = 0, value = 15) {
  checkNumbers(values);
  if (!Number.isFinite(value)) throw new TypeError('inserted value must be finite');
  checkIndex(prevIndex, -1, values.length - 1);
  const result = trace('linked', '单链表：先接后继，再接前驱',
    '节点方框显示值与 next；节点摆放不表示连续内存，连接关系以 next 和 head 为准。');
  const nodes = values.map((item, i) => ({
    id: 'n' + i, value: item, next: i + 1 < values.length ? 'n' + (i + 1) : null
  }));
  let head = nodes[0]?.id ?? null;
  const previous = prevIndex === -1 ? null : nodes[prevIndex];
  record(result, '原链表，从 head 沿 next 可以找到全部节点。',
    { nodes, head, active: [], previous: previous?.id ?? null });
  const inserted = { id: 'new', value, next: null };
  nodes.push(inserted);
  record(result, '建立独立的新节点；此时 head 链路还没有经过它。',
    { nodes, head, active: ['new'], previous: previous?.id ?? null });
  inserted.next = previous ? previous.next : head;
  record(result, previous ? '执行 new.next = prev.next，先保存原后继。' : '执行 new.next = head，保存原头节点。',
    { nodes, head, active: ['new'], previous: previous?.id ?? null });
  if (previous) previous.next = 'new';
  else head = 'new';
  record(result, previous ? '执行 prev.next = new，接通新节点。' : '执行 head = new，更新头指针。',
    { nodes, head, active: previous ? [previous.id, 'new'] : ['new'], previous: previous?.id ?? null, done: true });
  return result;
}

export function lowerBoundTrace(values = [1, 3, 3, 5, 8], target = 3) {
  checkNumbers(values);
  if (!Number.isFinite(target)) throw new TypeError('target must be finite');
  if (values.some((x, i) => i > 0 && x < values[i - 1])) throw new RangeError('input must be sorted');
  const result = trace('binary', 'lower_bound：第一个不小于 ' + target + ' 的位置',
    '蓝色：当前候选区间 [lo, hi)；橙色：本步 mid。hi 可以等于长度，不读取该位置。');
  let lo = 0, hi = values.length;
  record(result, '候选区间初始化为 [0, n)。', { items: values, lo, hi, mid: null, target });
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    record(result, '比较 a[' + mid + '] = ' + values[mid] + ' 与目标 ' + target + '。',
      { items: values, lo, hi, mid, target });
    if (values[mid] < target) {
      lo = mid + 1;
      record(result, 'mid 的值小于目标，令 lo = mid + 1。', { items: values, lo, hi, mid: null, target });
    } else {
      hi = mid;
      record(result, 'mid 的值不小于目标，令 hi = mid；保留更靠左的可能答案。',
        { items: values, lo, hi, mid: null, target });
    }
  }
  record(result, lo === values.length ? 'lo == hi：返回 n，即尾后位置。' : 'lo == hi：返回下标 ' + lo + '。',
    { items: values, lo, hi, mid: null, target, answer: lo, done: true });
  return result;
}

export function insertionSortTrace(values = [5, 2, 4, 1]) {
  checkNumbers(values);
  const result = trace('insertion', '插入排序：拿出 key，逐项右移',
    '绿色：已处理前缀；橙色：本步写入；虚线：空位。key 单独保存，不用相邻交换冒充插入排序。');
  const items = [...values];
  record(result, '长度为 0 或 1 的前缀天然有序。', {
    items, sorted: Math.min(1, items.length), hole: null, key: null, active: []
  });
  for (let i = 1; i < items.length; i++) {
    const key = items[i];
    items[i] = null;
    let hole = i;
    record(result, '取出下标 ' + i + ' 的 key = ' + key + '，在原位置留下空位。',
      { items, sorted: i, hole, key, active: [i] });
    while (hole > 0 && items[hole - 1] > key) {
      items[hole] = items[hole - 1];
      items[hole - 1] = null;
      hole--;
      record(result, '左侧元素大于 key，右移一格；空位移到 ' + hole + '。',
        { items, sorted: i, hole, key, active: [hole + 1] });
    }
    items[hole] = key;
    record(result, '把 key 放入下标 ' + hole + '；前 ' + (i + 1) + ' 个元素已有序。',
      { items, sorted: i + 1, hole: null, key: null, active: [hole] });
  }
  record(result, '排序完成；相等元素不右移，保留它们原来的先后顺序。',
    { items, sorted: items.length, hole: null, key: null, active: [], done: true });
  return result;
}

export const DEFAULT_GRAPH = Object.freeze({
  A: Object.freeze(['B', 'C']), B: Object.freeze(['D']), C: Object.freeze(['D', 'E']),
  D: Object.freeze([]), E: Object.freeze([])
});
export function bfsTrace(graph = DEFAULT_GRAPH, start = 'A') {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw new TypeError('graph must be an adjacency object');
  const names = Object.keys(graph);
  if (!Object.hasOwn(graph, start)) throw new RangeError('start is not a graph node');
  for (const node of names) {
    if (!Array.isArray(graph[node]) || graph[node].some((next) => !Object.hasOwn(graph, next))) {
      throw new RangeError('every edge must refer to an existing node');
    }
  }
  const result = trace('bfs', 'BFS：入队时标记，避免重复入队',
    '灰色：未发现；蓝色：已入队；橙色：正在展开；绿色：已展开。箭头表示有向边。');
  const queue = [start], seen = [start], order = [], distance = { [start]: 0 };
  const snapshot = (current = null, edge = null) => ({ graph, queue, seen, order, distance, current, edge });
  record(result, '起点 ' + start + ' 入队，同时标记已发现，距离为 0。', snapshot());
  while (queue.length) {
    const current = queue.shift();
    record(result, '从队首取出 ' + current + '，按邻接表顺序检查出边。', snapshot(current));
    for (const next of graph[current]) {
      if (!seen.includes(next)) {
        seen.push(next);
        queue.push(next);
        distance[next] = distance[current] + 1;
        record(result, '首次发现 ' + next + '：标记后入队，距离为 ' + distance[next] + '。',
          snapshot(current, [current, next]));
      } else {
        record(result, next + ' 已经发现，跳过这条边，不重复入队。', snapshot(current, [current, next]));
      }
    }
    order.push(current);
    record(result, current + ' 的出边已检查完毕。', snapshot());
  }
  record(result, '队列为空，完成从起点可达部分的遍历。', { ...snapshot(), done: true });
  return result;
}

export function coinChangeTrace(coins = [1, 3, 4], amount = 6) {
  if (!Array.isArray(coins) || coins.some((coin) => !Number.isInteger(coin) || coin <= 0)) {
    throw new RangeError('coin values must be positive integers');
  }
  // Each teaching frame copies the table, so keep trace generation deliberately bounded.
  if (!Number.isInteger(amount) || amount < 0 || amount > 100) throw new RangeError('amount must be an integer in [0, 100]');
  const denominations = [...new Set(coins)].sort((a, b) => a - b);
  const result = trace('dp', '动态规划：凑出 ' + amount + ' 的最少硬币数',
    '∞：暂时不可达；橙色：当前金额；蓝色：本次读取的前驱金额。每种硬币可重复使用。');
  const items = Array(amount + 1).fill(null);
  items[0] = 0;
  record(result, 'dp[0] = 0，其余金额初始不可达。', { items, coins: denominations, amount, active: [], source: null, coin: null });
  for (let total = 1; total <= amount; total++) {
    for (const coin of denominations) {
      if (coin > total) continue;
      const source = total - coin;
      const candidate = items[source] === null ? null : items[source] + 1;
      const changed = candidate !== null && (items[total] === null || candidate < items[total]);
      if (changed) items[total] = candidate;
      record(result, '金额 ' + total + '，尝试硬币 ' + coin + '：' +
        (candidate === null ? '前驱不可达，不更新。' : '候选为 ' + candidate + (changed ? '，更新 dp。' : '，无需更新。')),
        { items, coins: denominations, amount, active: [total], source, coin, candidate, changed });
    }
  }
  record(result, items[amount] === null ? '目标金额不可达。' : '最少需要 ' + items[amount] + ' 枚硬币。',
    { items, coins: denominations, amount, active: [amount], source: null, coin: null, answer: items[amount], done: true });
  return result;
}

function safeAdd(a, b) {
  if (b > Number.MAX_SAFE_INTEGER - a) throw new RangeError('sum exceeds safe integer range');
  return a + b;
}

export function windowTrace(values = [2, 3, 1, 2, 4, 3], target = 7) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (values.length > 60) throw new RangeError('window trace supports at most 60 values');
  if (Array.from(values).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError('window values must be nonnegative safe integers');
  }
  if (!Number.isSafeInteger(target) || target <= 0) throw new RangeError('target must be a positive safe integer');
  const result = trace('window', '滑动窗口：总和至少为 ' + target + ' 的最短连续段',
    '蓝色：当前半开窗口 [left, right)；橙色：本步加入或移出的元素；最终绿色：一个最短窗口。先记录达标窗口，再收缩左端。');
  const items = [...values];
  let left = 0, right = 0, sum = 0, best = null, bestWindow = null;
  const snapshot = (active = [], event = null) => ({ items, left, right, sum, target, best, bestWindow, active, event });
  record(result, '初始窗口 [0, 0) 为空，sum = 0，还没有达标窗口。', snapshot([], 'init'));
  while (right < items.length) {
    const entered = right;
    sum = safeAdd(sum, items[right]);
    right++;
    record(result, '加入下标 ' + entered + ' 的 ' + items[entered] + '，窗口扩展为 [' + left + ', ' + right + ')，sum = ' + sum + '。',
      snapshot([entered], 'expand'));
    while (sum >= target) {
      const length = right - left;
      const changed = best === null || length < best;
      if (changed) {
        best = length;
        bestWindow = [left, right];
      }
      record(result, '当前窗口达标，长度为 ' + length + (changed ? '，更新最短长度为 ' + best + '。' : '，未改善最短长度。'),
        { ...snapshot([], 'candidate'), changed });
      const removed = left;
      sum -= items[left];
      left++;
      record(result, '移出下标 ' + removed + ' 的 ' + items[removed] + '，窗口变为 [' + left + ', ' + right + ')，sum = ' + sum + '。',
        snapshot([removed], 'shrink'));
    }
  }
  record(result, best === null ? '没有总和达到目标的非空窗口，返回 0。' :
    '最短长度为 ' + best + '，对应窗口 [' + bestWindow[0] + ', ' + bestWindow[1] + ')。',
    { ...snapshot([], 'done'), answer: best ?? 0, done: true });
  return result;
}

export const DEFAULT_WEIGHTED_GRAPH = Object.freeze({
  A: Object.freeze([Object.freeze({ to: 'B', weight: 6 }), Object.freeze({ to: 'C', weight: 1 })]),
  B: Object.freeze([Object.freeze({ to: 'D', weight: 1 })]),
  C: Object.freeze([Object.freeze({ to: 'B', weight: 2 }), Object.freeze({ to: 'D', weight: 5 })]),
  D: Object.freeze([Object.freeze({ to: 'E', weight: 3 })]),
  E: Object.freeze([]), F: Object.freeze([])
});

export function dijkstraTrace(graph = DEFAULT_WEIGHTED_GRAPH, start = 'A') {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw new TypeError('graph must be an adjacency object');
  const names = Object.keys(graph);
  if (names.length > 12) throw new RangeError('Dijkstra trace supports at most 12 nodes');
  if (typeof start !== 'string' || !Object.hasOwn(graph, start)) throw new RangeError('start is not a graph node');
  let edgeCount = 0;
  for (const node of names) {
    if (!node.length || node.length > 24 || !Array.isArray(graph[node])) throw new RangeError('invalid graph node or adjacency list');
    edgeCount += graph[node].length;
    if (edgeCount > 60) throw new RangeError('Dijkstra trace supports at most 60 edges');
    for (const edge of graph[node]) {
      if (!edge || typeof edge !== 'object' || typeof edge.to !== 'string' || !Object.hasOwn(graph, edge.to)) {
        throw new RangeError('every edge must refer to an existing node');
      }
      if (!Number.isSafeInteger(edge.weight) || edge.weight < 0) throw new RangeError('edge weights must be nonnegative safe integers');
    }
  }
  // Retain only the bounded teaching contract, not arbitrary extra input payloads.
  graph = Object.fromEntries(names.map((node) => [node, graph[node].map(({ to, weight }) => ({ to, weight }))]));
  const result = trace('dijkstra', 'Dijkstra：按距离确定顶点，跳过过期条目',
    '箭头表示有向带权边；灰色：不可达或未发现，蓝色：有暂定距离，绿色：已确定。队列按距离排序，平局保持入队顺序。');
  const distance = Object.fromEntries(names.map((node) => [node, null]));
  const predecessor = Object.fromEntries(names.map((node) => [node, null]));
  const settled = [], staleEntries = [];
  let sequence = 0;
  const queue = [{ node: start, distance: 0, sequence: sequence++ }];
  const sortQueue = () => queue.sort((a, b) => a.distance - b.distance || a.sequence - b.sequence);
  distance[start] = 0;
  const snapshot = (current = null, edge = null, popped = null, event = null) => ({
    graph, start, distance, predecessor, settled, queue, staleEntries, current, edge, popped, event
  });
  record(result, '起点 ' + start + ' 距离为 0，入优先队列；其他距离为 ∞。', snapshot(null, null, null, 'init'));
  while (queue.length) {
    const entry = queue.shift();
    record(result, '取出最小距离条目 ' + entry.node + '（' + entry.distance + '）。', snapshot(null, null, entry, 'pop'));
    if (entry.distance !== distance[entry.node]) {
      staleEntries.push({ node: entry.node, distance: entry.distance, currentDistance: distance[entry.node] });
      record(result, entry.node + '（' + entry.distance + '）已过期，当前距离为 ' + distance[entry.node] + '，跳过，不重复展开。',
        { ...snapshot(null, null, entry, 'stale'), skipped: true });
      continue;
    }
    const current = entry.node;
    settled.push(current);
    record(result, '确定 ' + current + ' 的最短距离为 ' + distance[current] + '，开始检查出边。',
      snapshot(current, null, entry, 'settle'));
    for (const edge of graph[current]) {
      const candidate = safeAdd(distance[current], edge.weight);
      const previousDistance = distance[edge.to];
      const changed = previousDistance === null || candidate < previousDistance;
      if (changed) {
        distance[edge.to] = candidate;
        predecessor[edge.to] = current;
        queue.push({ node: edge.to, distance: candidate, sequence: sequence++ });
        sortQueue();
      }
      record(result, '检查 ' + current + ' → ' + edge.to + '（权重 ' + edge.weight + '），候选距离 ' + candidate +
        (changed ? '，更新距离与前驱，并把新条目入队。' : '，不改善当前距离。'),
        { ...snapshot(current, [current, edge.to], entry, 'relax'), candidate, previousDistance, changed });
    }
    record(result, current + ' 的出边检查完毕。', snapshot(null, null, null, 'finish'));
  }
  record(result, '优先队列为空，最短距离计算完成；∞ 表示从起点不可达。',
    { ...snapshot(null, null, null, 'done'), done: true });
  return result;
}

const factories = {
  vector: vectorInsertTrace, linked: linkedInsertTrace, binary: lowerBoundTrace,
  insertion: insertionSortTrace, bfs: bfsTrace, dp: coinChangeTrace,
  window: windowTrace, dijkstra: dijkstraTrace
};
export function getDemoTrace(kind) {
  if (!Object.hasOwn(factories, kind)) throw new RangeError('unknown demo kind');
  return factories[kind]();
}
