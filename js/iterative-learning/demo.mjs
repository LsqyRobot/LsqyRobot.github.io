// Display only: all plant trajectories and metrics are computed in Docker beforehand.
const NS = 'http://www.w3.org/2000/svg';
const palette = { reference: '#586979', baseline: '#a65517', current: '#176ca3', other: '#247a66' };
let datasetPromise;
const make = (tag, className = '', value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
};
const svg = (tag, attributes = {}, value) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, item] of Object.entries(attributes)) node.setAttribute(key, String(item));
  if (value !== undefined) node.textContent = String(value);
  return node;
};
function number(value, significant = 4) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) return value.toExponential(2);
  return Number(value.toPrecision(significant)).toString();
}
function button(label, action, handler) {
  const node = make('button', '', label); node.type = 'button'; node.dataset.action = action;
  node.addEventListener('click', handler); return node;
}
function metric(label, value, key) {
  const card = make('div', 'ilc-metric'); card.dataset.metric = key;
  card.append(make('span', '', label), make('strong', '', value)); return card;
}
function loadData() {
  if (!datasetPromise) {
    datasetPromise = fetch(new URL('./experiments.json', import.meta.url)).then((response) => {
      if (!response.ok) throw new Error('数据请求失败（HTTP ' + response.status + '）');
      return response.json();
    }).then((data) => {
      if (data.schemaVersion !== 1 || !data.scenarios) throw new Error('数据版本与展示程序不匹配');
      return data;
    }).catch((error) => { datasetPromise = undefined; throw error; });
  }
  return datasetPromise;
}
function validateScenario(scenario, kind) {
  if (!scenario || !Array.isArray(scenario.time) || scenario.time.length < 2 || !scenario.channels?.length) throw new Error('场景数据不完整');
  const count = scenario.time.length, dimensions = scenario.channels.length;
  if (!scenario.time.every((time, i, all) => Number.isFinite(time) && (!i || time > all[i - 1]))) throw new Error('时间采样必须严格递增');
  const matrix = (data, channels) => Array.isArray(data) && data.length === count && data.every((row) => Array.isArray(row) && row.length === channels && row.every(Number.isFinite));
  if (!matrix(scenario.reference, dimensions)) throw new Error('参考曲线长度不一致');
  const trial = (entry) => {
    if (!entry || !matrix(entry.output, dimensions) || !matrix(entry.error, dimensions) || !matrix(entry.correction, dimensions) ||
      !Number.isFinite(entry.metrics?.rms) || !Number.isFinite(entry.metrics?.maxAbs)) throw new Error('轮次数据或指标不完整');
    if (kind === 'arm' && (!matrix(entry.tipOutput, 2) || !Number.isFinite(entry.metrics.positionRms))) throw new Error('末端轨迹数据不完整');
    if (kind === 'flexible' && (!Number.isFinite(entry.metrics.settlingRms) || !Number.isFinite(entry.metrics.settlingPeakToPeak))) throw new Error('残振指标不完整');
  };
  trial(scenario.baseline);
  for (const key of ['conservative', 'default', 'aggressive']) {
    const configuration = scenario.configurations?.[key];
    if (!configuration?.iterations?.length) throw new Error('缺少学习配置：' + key);
    configuration.iterations.forEach((entry, index) => { trial(entry); if (entry.iteration !== index) throw new Error('学习轮次编号不连续'); });
  }
  if (kind === 'arm' && (!matrix(scenario.tipReference, 2) || !matrix(scenario.tipBaseline, 2))) throw new Error('末端参考或基线不完整');
  if (kind === 'flexible' && (!Array.isArray(scenario.settlingWindow) || scenario.settlingWindow.length !== 2 || !scenario.settlingWindow.every(Number.isFinite))) throw new Error('停稳区间不完整');
}
const sample = (times, matrix, channel = 0) => times.map((time, index) => [time, matrix[index][channel]]);
const lineSeries = (label, points, role = 'current') => ({ label, points, color: palette[role], dash: role === 'reference' ? '10 6' : role === 'baseline' ? '2 6' : role === 'other' ? '12 5' : '' });

function chart(title, series, options = {}) {
  const card = make('section', 'ilc-chart'); card.append(make('h5', '', title));
  const legend = make('div', 'ilc-legend');
  series.forEach((entry) => {
    const item = make('span', 'ilc-legend-item'), swatch = make('span', 'ilc-swatch');
    swatch.style.setProperty('--ilc-color', entry.color);
    swatch.dataset.line = entry.dash === '2 6' ? 'dotted' : entry.dash ? 'dashed' : 'solid';
    item.append(swatch, make('span', '', entry.label)); legend.append(item);
  });
  card.append(legend);
  const scroll = make('div', 'ilc-chart-scroll'); scroll.tabIndex = 0;
  scroll.setAttribute('aria-label', title + '，窄屏可横向滚动');
  const width = 760, height = options.square ? 480 : 365;
  const bounds = { left: 98, right: 724, top: 50, bottom: height - 66 };
  const plotWidth = bounds.right - bounds.left, plotHeight = bounds.bottom - bounds.top;
  const all = series.flatMap((entry) => entry.points);
  let xmin = Math.min(...all.map((p) => p[0])), xmax = Math.max(...all.map((p) => p[0]));
  const logarithmic = options.log && all.every((p) => p[1] > 0);
  const yValue = (value) => logarithmic ? Math.log10(value) : value;
  let ymin = Math.min(...all.map((p) => yValue(p[1]))), ymax = Math.max(...all.map((p) => yValue(p[1])));
  if (xmax === xmin) { xmin -= 0.5; xmax += 0.5; }
  const yPadding = ymax === ymin ? Math.max(Math.abs(ymax) * 0.1, logarithmic ? 0.5 : 0.001) : (ymax - ymin) * 0.1;
  ymin -= yPadding; ymax += yPadding;
  if (options.square) {
    const pixelsPerUnit = Math.min(plotWidth / (xmax - xmin), plotHeight / (ymax - ymin));
    const xc = (xmin + xmax) / 2, yc = (ymin + ymax) / 2;
    const xr = plotWidth / pixelsPerUnit / 2, yr = plotHeight / pixelsPerUnit / 2;
    xmin = xc - xr; xmax = xc + xr; ymin = yc - yr; ymax = yc + yr;
  }
  const x = (v) => bounds.left + (v - xmin) / (xmax - xmin) * plotWidth;
  const y = (v) => bounds.bottom - (yValue(v) - ymin) / (ymax - ymin) * plotHeight;
  const root = svg('svg', { class: 'ilc-plot', viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': title + '；' + (logarithmic ? '纵轴为对数刻度。' : '纵轴为线性刻度。') + series.map((entry) => entry.label).join('、') });
  root.append(svg('rect', { width, height, fill: '#f7fafc', rx: 10 }));
  if (options.interval) {
    const start = Math.max(xmin, options.interval[0]), end = Math.min(xmax, options.interval[1]);
    if (end > start) root.append(svg('rect', { x: x(start), y: bounds.top, width: x(end) - x(start), height: plotHeight, fill: '#e1f0e8' }));
  }
  for (let tick = 0; tick <= 4; tick++) {
    const fraction = tick / 4, xv = xmin + (xmax - xmin) * fraction, yy = bounds.bottom - plotHeight * fraction;
    const yv = ymin + (ymax - ymin) * fraction;
    root.append(svg('line', { x1: x(xv), y1: bounds.top, x2: x(xv), y2: bounds.bottom, stroke: '#d6e2eb' }),
      svg('line', { x1: bounds.left, y1: yy, x2: bounds.right, y2: yy, stroke: '#d6e2eb' }),
      svg('text', { x: x(xv), y: bounds.bottom + 28, 'text-anchor': 'middle', 'font-size': 20, fill: '#3d5b6f' }, number(xv, 3)),
      svg('text', { x: bounds.left - 12, y: yy + 7, 'text-anchor': 'end', 'font-size': 20, fill: '#3d5b6f' }, number(logarithmic ? 10 ** yv : yv, 3)));
  }
  series.forEach((entry) => {
    const d = entry.points.map((point, index) => (index ? 'L' : 'M') + x(point[0]).toFixed(2) + ' ' + y(point[1]).toFixed(2)).join(' ');
    const attributes = { d, fill: 'none', stroke: entry.color, 'stroke-width': entry.dash ? 2.8 : 3.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (entry.dash) attributes['stroke-dasharray'] = entry.dash;
    root.append(svg('path', attributes));
  });
  if (options.current) root.append(svg('circle', { cx: x(options.current[0]), cy: y(options.current[1]), r: 6.5, fill: '#247a66', stroke: '#fff', 'stroke-width': 2 }));
  root.append(svg('text', { x: 20, y: 24, 'font-size': 20, fill: '#26485f' }, options.yLabel ?? ''),
    svg('text', { x: (bounds.left + bounds.right) / 2, y: height - 15, 'font-size': 21, 'text-anchor': 'middle', fill: '#26485f' }, options.xLabel ?? '时间 t（s）'));
  scroll.append(root); card.append(scroll);
  if (options.note) card.append(make('p', 'ilc-chart-note', options.note));
  return card;
}
function renderCharts(container, scenario, config, trial, kind) {
  const time = scenario.time, baseline = scenario.baseline, plots = [];
  const zero = time.map((t) => [t, 0]);
  if (kind === 'arm') {
    plots.push(chart('末端 xy 路径（横纵轴等比例）', [
      lineSeries('参考圆轨迹', scenario.tipReference, 'reference'),
      lineSeries('反馈基线 k=0', scenario.tipBaseline, 'baseline'),
      lineSeries('本轮末端轨迹', trial.tipOutput)
    ], { square: true, xLabel: 'x（m）', yLabel: 'y（m）', note: '末端位置由两个等效关节伺服的角度经过 2R 正运动学得到。' }));
  } else {
    plots.push(chart(kind === 'flexible' ? '柔性输出角与参考（绿色底色为停稳区间）' : '关节角与参考', [
      lineSeries('参考', sample(time, scenario.reference), 'reference'),
      lineSeries('反馈基线 k=0', sample(time, baseline.output), 'baseline'),
      lineSeries('本轮输出', sample(time, trial.output))
    ], { yLabel: '角度（rad）', interval: scenario.settlingWindow }));
  }
  scenario.channels.forEach((channel, index) => {
    plots.push(chart(channel + '：误差 e = r − y', [lineSeries('零误差', zero, 'reference'),
      lineSeries('基线误差', sample(time, baseline.error, index), 'baseline'),
      lineSeries('本轮误差', sample(time, trial.error, index))], { yLabel: '误差（rad）', interval: scenario.settlingWindow }));
  });
  if (kind === 'flexible') {
    const [start, end] = scenario.settlingWindow;
    const within = (points) => points.filter(([t]) => t >= start && t <= end);
    plots.push(chart('停稳区间误差放大：' + start + '–' + end + ' s', [lineSeries('零误差', within(zero), 'reference'),
      lineSeries('基线残振', within(sample(time, baseline.error)), 'baseline'),
      lineSeries('本轮残振', within(sample(time, trial.error)))], { yLabel: '误差（rad）', note: '停稳 RMS 与峰峰值只统计该保持区间；整段 RMS 不能替代残振指标。' }));
  }
  plots.push(chart('学习前馈：参考角修正（不是力矩）', [lineSeries('零修正', zero, 'reference'),
    ...scenario.channels.map((channel, index) => lineSeries(channel + ' 修正', sample(time, trial.correction, index), index ? 'other' : 'current'))], { yLabel: '修正（rad）' }));
  const convergence = config.iterations.map((entry) => [entry.iteration, entry.metrics.rms]);
  plots.push(chart('逐轮误差：当前配置的全部已计算轮次', [
    lineSeries('反馈基线 RMS', convergence.map(([k]) => [k, baseline.metrics.rms]), 'baseline'), lineSeries('各轮 RMS', convergence)
  ], { xLabel: '学习轮次 k', yLabel: 'RMS（rad，对数轴）', log: true, current: [trial.iteration, trial.metrics.rms], note: '绿色圆点标记当前轮次。所有点来自预计算数据；误差上升也保留。' }));
  container.replaceChildren(...plots);
}
function build(mount, scenario, kind) {
  let configuration = 'default', iteration = 0;
  mount.replaceChildren();
  mount.append(make('h4', 'ilc-title', '预计算教学模型 · ' + scenario.title), make('p', 'ilc-model-note', scenario.modelNote));
  const controls = make('div', 'ilc-controls');
  const configurationLabel = make('label', 'ilc-config-label'), select = make('select'); select.dataset.control = 'config';
  configurationLabel.append(make('span', '', '学习配置'));
  for (const key of ['conservative', 'default', 'aggressive']) {
    const option = make('option', '', scenario.configurations[key].label); option.value = key; select.append(option);
  }
  select.value = configuration; configurationLabel.append(select);
  const iterationLabel = make('label', 'ilc-iteration-label'), line = make('span', 'ilc-iteration-heading'), output = make('output');
  line.append(make('span', '', '学习轮次 k'), output);
  const input = make('input'); input.type = 'range'; input.min = '0'; input.step = '1'; input.dataset.control = 'iteration';
  iterationLabel.append(line, input);
  const previous = button('上一轮', 'prev', () => { if (iteration > 0) iteration--; render(); });
  const next = button('下一轮', 'next', () => { if (iteration < scenario.configurations[configuration].iterations.length - 1) iteration++; render(); });
  const reset = button('重置', 'reset', () => { configuration = 'default'; iteration = 0; select.value = configuration; render(); });
  controls.append(configurationLabel, iterationLabel, previous, next, reset);
  const summary = make('p', 'ilc-configuration-note'), metrics = make('div', 'ilc-metrics');
  const status = make('p', 'ilc-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const plots = make('div', 'ilc-plots');
  mount.append(controls, summary, metrics, status, plots);
  mount.append(make('p', 'ilc-footnote', '这是离线预计算教学数据，浏览器只切换曲线与指标；没有自动播放，也不连接机器人。曲线范围由可见数据决定，精确数值以指标为准。'));
  const render = () => {
    const config = scenario.configurations[configuration], trial = config.iterations[iteration], values = trial.metrics;
    input.max = String(config.iterations.length - 1); input.value = String(iteration); output.textContent = iteration + ' / ' + input.max;
    previous.disabled = iteration === 0; next.disabled = iteration === config.iterations.length - 1;
    summary.textContent = config.label + '：α = ' + number(config.alpha) + '，γ = ' + number(config.gamma) + '。' + config.description;
    metrics.replaceChildren(metric('本轮 RMS', number(values.rms) + ' rad', 'rms'), metric('本轮最大绝对误差', number(values.maxAbs) + ' rad', 'maxAbs'),
      metric('反馈基线 RMS', number(scenario.baseline.metrics.rms) + ' rad', 'baselineRms'),
      metric('本轮 RMS / 基线', number(values.rms / scenario.baseline.metrics.rms) + ' 倍', 'rmsRatio'));
    if (kind === 'arm') metrics.append(metric('末端位置 RMS', number(values.positionRms) + ' m', 'positionRms'));
    if (kind === 'flexible') metrics.append(metric('停稳区间 RMS', number(values.settlingRms) + ' rad', 'settlingRms'),
      metric('停稳区间峰峰值', number(values.settlingPeakToPeak) + ' rad', 'settlingPeakToPeak'));
    const comparison = iteration === 0 ? '第 0 轮尚未学习，输出与反馈基线相同。' : values.rms > scenario.baseline.metrics.rms ? '本轮 RMS 高于反馈基线；学习步长越大不代表效果越好。' : '本轮 RMS 低于或等于反馈基线；继续对照最大误差与局部曲线。';
    status.textContent = comparison + (config.stoppedEarly ? ' 此配置提前停止：' + config.stopReason : ' 显示全部 ' + config.iterations.length + ' 个已计算轮次；计算完成不等于稳定性证明。');
    renderCharts(plots, scenario, config, trial, kind);
    mount.dataset.state = JSON.stringify({ scenario: kind, config: configuration, iteration: trial.iteration, rms: values.rms, maxAbs: values.maxAbs,
      ...(kind === 'arm' ? { positionRms: values.positionRms } : {}),
      ...(kind === 'flexible' ? { settlingRms: values.settlingRms, settlingPeakToPeak: values.settlingPeakToPeak } : {}) });
  };
  select.addEventListener('change', () => { configuration = select.value; iteration = 0; render(); });
  input.addEventListener('input', () => { iteration = Number(input.value); render(); });
  render(); mount.dataset.initialized = 'true';
}
async function initialize(mount) {
  if (mount.dataset.initialized === 'true' || mount.dataset.initialized === 'loading') return;
  mount.dataset.initialized = 'loading'; mount.setAttribute('aria-busy', 'true');
  mount.replaceChildren(make('p', 'ilc-loading', '正在读取预计算教学数据……'));
  try {
    const data = await loadData(), kind = mount.dataset.scenario;
    if (!['joint', 'arm', 'flexible'].includes(kind)) throw new Error('未知的教学场景');
    validateScenario(data.scenarios[kind], kind); build(mount, data.scenarios[kind], kind);
  } catch (error) {
    mount.dataset.initialized = 'error'; mount.dataset.state = JSON.stringify({ scenario: mount.dataset.scenario, error: true });
    const notice = make('p', 'ilc-error', '教学数据暂时无法显示：' + error.message); notice.setAttribute('role', 'alert');
    mount.replaceChildren(notice, button('重试加载', 'retry', () => initialize(mount)));
  } finally { mount.setAttribute('aria-busy', 'false'); }
}
document.querySelectorAll('.ilc-demo[data-scenario]').forEach(initialize);
