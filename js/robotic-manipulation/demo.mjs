import { frameState, arm2R, bracketTrace } from './model.mjs';

const namespace = 'http://www.w3.org/2000/svg';
let serial = 0;
const fmt = (n, digits = 3) => (Math.abs(n) < 0.0000001 ? 0 : n).toFixed(digits).replace(/\.?0+$/, '') || '0';
const coord = (point) => '(' + point.map((n) => fmt(n)).join(', ') + ')';
const radians = (degrees) => degrees * Math.PI / 180;
function el(tag, className = '', value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}
function svg(tag, attributes = {}, text) {
  const node = document.createElementNS(namespace, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, action, handler) {
  const node = el('button', '', text);
  node.type = 'button'; node.dataset.action = action; node.addEventListener('click', handler);
  return node;
}
function field(label, text) {
  const node = el('div', 'robotics-field');
  node.append(el('span', '', label), el('strong', '', text));
  return node;
}
function slider(container, name, label, initial, onChange) {
  const wrapper = el('label', 'robotics-slider'), title = el('span', 'robotics-slider-label');
  const output = el('output', '', initial + '°');
  const input = el('input');
  input.type = 'range'; input.min = '-180'; input.max = '180'; input.step = '1'; input.value = String(initial);
  input.dataset.control = name;
  title.append(el('span', '', label), output);
  wrapper.append(title, input); container.append(wrapper);
  input.addEventListener('input', () => { output.textContent = input.value + '°'; onChange(Number(input.value)); });
  return { input, set(value) { input.value = String(value); output.textContent = value + '°'; } };
}
function plot(id, label, width = 640, height = 420) {
  const root = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'robotics-plot', role: 'img', 'aria-label': label });
  const defs = svg('defs');
  for (const color of ['#4f6982', '#176d9d', '#a85816', '#27826b', '#b44765']) {
    const marker = svg('marker', { id: id + color.slice(1), viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(svg('path', { d: 'M0 0L10 5L0 10Z', fill: color })); defs.append(marker);
  }
  root.append(defs, svg('rect', { x: 1, y: 1, width: width - 2, height: height - 2, rx: 15, fill: '#f7fafc', stroke: '#d5e1eb' }));
  return root;
}
function line(root, start, end, color, id, dashed = false, width = 3) {
  const attrs = { x1: start[0], y1: start[1], x2: end[0], y2: end[1], stroke: color, 'stroke-width': width };
  if (dashed) attrs['stroke-dasharray'] = '7 5';
  if (id && Math.hypot(end[0] - start[0], end[1] - start[1]) > 0.1) attrs['marker-end'] = 'url(#' + id + color.slice(1) + ')';
  root.append(svg('line', attrs));
}
function text(root, x, y, value, color = '#223f53', size = 20, anchor = 'start') {
  root.append(svg('text', { x, y, fill: color, 'font-size': size, 'text-anchor': anchor }, value));
}
function point(root, p, color, radius = 6) {
  root.append(svg('circle', { cx: p[0], cy: p[1], r: radius, fill: color, stroke: '#fff', 'stroke-width': 2 }));
}
function framePlot(state, id) {
  const root = plot(id, '蓝色为参考坐标系 a，绿色为随角度旋转的坐标系 b；橙色点为同一物理点。');
  const project = ([x, y]) => [150 + 85 * x, 335 - 85 * y];
  for (let i = -1; i <= 4; i++) {
    line(root, project([i, -0.5]), project([i, 3.5]), '#dce6ed');
    if (i <= 3) line(root, project([-1, i]), project([4, i]), '#dce6ed');
  }
  line(root, project([-0.8, 0]), project([4, 0]), '#176d9d', id);
  line(root, project([0, -0.5]), project([0, 3.5]), '#176d9d', id);
  text(root, 505, 361, 'xₐ', '#176d9d'); text(root, 119, 38, 'yₐ', '#176d9d');
  text(root, 115, 361, 'Oₐ', '#176d9d');
  const origin = project(state.origin), world = project(state.worldPoint);
  line(root, project([0, 0]), origin, '#4f6982', id, true);
  text(root, 202, 282, 'p = (1, 2)', '#4f6982', 19);
  state.basis.forEach((basis, i) => {
    const end = project(state.origin.map((v, j) => v + basis[j] * 0.8));
    line(root, origin, end, '#27826b', id);
    text(root, end[0] + 8, end[1] - 8, i === 0 ? 'xᵦ' : 'yᵦ', '#27826b');
  });
  line(root, origin, world, '#a85816', null, true, 3);
  point(root, origin, '#27826b'); point(root, world, '#a85816', 8);
  text(root, origin[0] + 9, origin[1] + 23, 'Oᵦ', '#27826b');
  text(root, 412, 63, '同一物理点', '#a85816', 22);
  text(root, 412, 94, 'xᵦ = (1, 0)', '#a85816', 20);
  text(root, 412, 125, 'xₐ = ' + coord(state.worldPoint), '#a85816', 18);
  return root;
}
function armPlot(state, id) {
  const root = plot(id, '左图是平面两连杆与末端力；右图是末端平移速度椭圆及点雅可比的两列。');
  const project = ([x, y]) => [178 + 60 * x, 230 - 60 * y];
  text(root, 178, 35, '2R：连杆各长 1 m', '#223f53', 22, 'middle');
  text(root, 493, 35, '平移速度空间', '#223f53', 22, 'middle');
  line(root, [351, 56], [351, 400], '#d5e1eb');
  line(root, project([-2.2, 0]), project([2.3, 0]), '#4f6982', id, false, 1.5);
  line(root, project([0, -2.2]), project([0, 2.3]), '#4f6982', id, false, 1.5);
  text(root, 319, 254, 'x', '#4f6982', 18); text(root, 153, 86, 'y', '#4f6982', 18);
  line(root, project([0, 0]), project(state.elbow), '#176d9d', null, false, 11);
  line(root, project(state.elbow), project(state.endpoint), '#27826b', null, false, 11);
  [[0, 0], state.elbow, state.endpoint].forEach((p) => point(root, project(p), '#223f53', 7));
  const end = project(state.endpoint), forceEnd = [end[0] + 34 * state.force[0], end[1] - 34 * state.force[1]];
  line(root, end, forceEnd, '#b44765', id, false, 4);
  text(root, forceEnd[0] + 5, forceEnd[1] - 8, 'F', '#b44765', 20);
  const center = [493, 230], velocity = (v) => [center[0] + 48 * v[0], center[1] - 48 * v[1]];
  line(root, [375, 230], [615, 230], '#4f6982', id, false, 1.5);
  line(root, [493, 345], [493, 100], '#4f6982', id, false, 1.5);
  const path = state.velocityEllipse.map((p, i) => (i ? 'L' : 'M') + velocity(p).join(' ')).join(' ') + 'Z';
  root.append(svg('path', { d: path, fill: '#d8e9f6', 'fill-opacity': 0.8, stroke: '#176d9d', 'stroke-width': 3 }));
  state.columns.forEach((column, i) => {
    const endV = velocity(column), color = i ? '#27826b' : '#a85816';
    line(root, center, endV, color, id, false, 4);
    const pointsRight = endV[0] > center[0];
    text(root, endV[0] + (pointsRight ? -8 : 8), endV[1] + (i ? 22 : -9), 'Jₚ 第 ' + (i + 1) + ' 列', color, 18, pointsRight ? 'end' : 'start');
  });
  point(root, center, '#223f53', 4);
  text(root, 604, 255, 'ẋ', '#4f6982', 19); text(root, 471, 96, 'ẏ', '#4f6982', 19);
  text(root, 493, 378, '边界：‖q̇‖₂ = 1', '#4f6982', 20, 'middle');
  return root;
}
function bracketPlot(trace, step, id) {
  const root = plot(id, '独轮车四段动作：前进、转向、后退、转回；每一步的位置与朝向。', 640, 390);
  const project = ([x, y]) => [122 + x * 540, 145 - y * 540];
  line(root, project([-0.13, 0]), project([0.84, 0]), '#4f6982', id, false, 1.5);
  line(root, project([0, -0.35]), project([0, 0.17]), '#4f6982', id, false, 1.5);
  text(root, 589, 171, 'x', '#4f6982'); text(root, 96, 49, 'y', '#4f6982');
  const pose = trace.steps[step].pose, active = project(pose);
  if (step >= 1) line(root, project(trace.steps[0].pose), project(trace.steps[1].pose), '#176d9d', id, false, 6);
  if (step >= 3) line(root, project(trace.steps[2].pose), project(trace.steps[3].pose), '#a85816', id, false, 6);
  point(root, project([0, 0]), '#223f53', 5);
  text(root, 64, 180, '起点', '#223f53', 20);
  const angle = -pose[2] * 180 / Math.PI;
  const body = svg('g', { transform: 'translate(' + active.join(' ') + ') rotate(' + angle + ')' });
  body.append(svg('rect', { x: -21, y: -14, width: 42, height: 28, rx: 5, fill: '#27826b', stroke: '#fff', 'stroke-width': 2 }),
    svg('path', { d: 'M8 -9L22 0L8 9', fill: 'none', stroke: '#fff', 'stroke-width': 3 }));
  root.append(body);
  if (step >= 3) {
    line(root, project([0, pose[1]]), active, '#b44765', null, true, 2);
    text(root, 225, 318, '最终 x 漂移 ≠ 0', '#b44765', 20);
  }
  text(root, 36, 365, '蓝：前进路径　橙：后退路径　绿色车身：当前位置与朝向', '#4f6982', 18);
  return root;
}

function initialize(mount) {
  if (mount.dataset.initialized) return;
  const kind = mount.dataset.demo;
  if (!['frames', 'arm', 'bracket'].includes(kind)) return;
  const id = 'robotics-' + (++serial) + '-';
  const titles = { frames: '把同一个点换一种坐标表示', arm: '关节速度、末端速度与关节力矩', bracket: '按顺序执行动作，观察净位移' };
  const heading = el('h4', 'robotics-title', titles[kind]), controls = el('div', 'robotics-controls');
  const stage = el('div', 'robotics-stage'), metrics = el('div', 'robotics-metrics');
  const status = el('p', 'robotics-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  mount.append(heading, controls, stage, metrics, status);
  mount.dataset.initialized = 'true';
  if (kind === 'frames') {
    let degrees = 90;
    const render = () => {
      const state = frameState(radians(degrees));
      stage.replaceChildren(framePlot(state, id));
      metrics.replaceChildren(field('点：xₐ = Rxᵦ + p', coord(state.worldPoint)),
        field('方向：dₐ = Rdᵦ', coord(state.direction)), field('坐标系 b 的原点 p', '(1, 2)'));
      const matrix = el('pre', 'robotics-matrix', 'gₐᵦ（平面） =\n' + state.homogeneous.map((row) => '[ ' + row.map((v) => fmt(v).padStart(6)).join('  ') + ' ]').join('\n'));
      metrics.append(matrix);
      status.textContent = 'θ = ' + degrees + '°。点的齐次末项为 1，因此加平移；方向的末项为 0，因此只旋转。这里展示平面 3×3 写法，三维对应 4×4。';
      mount.dataset.state = JSON.stringify({ theta: state.theta, worldPoint: state.worldPoint, direction: state.direction });
    };
    const angle = slider(controls, 'theta', '坐标系角度 θ', 90, (value) => { degrees = value; render(); });
    controls.append(button('重置', 'reset', () => { degrees = 90; angle.set(90); render(); })); render();
  } else if (kind === 'arm') {
    const values = { q1: 0, q2: 90, forceAngle: 0 }, inputs = {};
    const render = () => {
      const forceAngle = radians(values.forceAngle), force = [Math.cos(forceAngle), Math.sin(forceAngle)];
      const state = arm2R(radians(values.q1), radians(values.q2), { force });
      stage.replaceChildren(armPlot(state, id));
      metrics.replaceChildren(field('末端位置 p（m）', coord(state.endpoint)), field('末端外力 F（1 N）', coord(force)),
        field('外力广义转矩 JₚᵀF（N·m）', coord(state.torques)), field('点雅可比 rank(Jₚ)', state.rank + ' / 2'));
      metrics.append(el('pre', 'robotics-matrix', 'Jₚ =\n' + state.jacobian.map((row) => '[ ' + row.map((v) => fmt(v).padStart(6)).join('  ') + ' ]').join('\n')));
      status.textContent = (state.rank === 1 ? '当前处于平移奇异位形：速度椭圆塌缩为线段，不能瞬时产生任意平面方向的速度。' : '速度椭圆表示单位关节速度球经 Jₚ 映射得到的平移速度边界。') + ' Jₚ 是 2×2 的末端点雅可比，不是六维空间 twist 雅可比；力与速度都在同一参考系、同一作用点表达。这里显示外力贡献；保持静止的驱动转矩还需抵消它并考虑重力。';
      mount.dataset.state = JSON.stringify({ q1: state.q1, q2: state.q2, forceAngle, endpoint: state.endpoint, jacobian: state.jacobian, torques: state.torques, rank: state.rank });
    };
    for (const [name, label] of [['q1', '关节角 q₁'], ['q2', '关节角 q₂'], ['forceAngle', '末端力方向']]) {
      inputs[name] = slider(controls, name, label, values[name], (value) => { values[name] = value; render(); });
    }
    controls.append(button('直臂 q₂ = 0°', 'singular', () => { values.q2 = 0; inputs.q2.set(0); render(); }),
      button('重置', 'reset', () => { Object.assign(values, { q1: 0, q2: 90, forceAngle: 0 }); for (const key of Object.keys(inputs)) inputs[key].set(values[key]); render(); }));
    render();
  } else {
    const trace = bracketTrace(); let current = 0;
    const previous = button('上一步', 'prev', () => { if (current > 0) current--; render(); });
    const next = button('下一步', 'next', () => { if (current < trace.steps.length - 1) current++; render(); });
    controls.append(previous, next, button('重置', 'reset', () => { current = 0; render(); }));
    const render = () => {
      const state = trace.steps[current]; previous.disabled = current === 0; next.disabled = current === trace.steps.length - 1;
      stage.replaceChildren(bracketPlot(trace, current, id));
      metrics.replaceChildren(field('当前步骤', current + ' / 4 · ' + state.action), field('位置 (x, y)', coord(state.pose.slice(0, 2))),
        field('朝向 θ（弧度）', fmt(state.pose[2])), field('固定参数', 'a = 0.6，b = 0.45 rad'));
      status.textContent = state.caption + (current === 4 ? ' 精确终点为 (a(1−cos b), −a sin b, 0)；小步长下主导的侧向项为 −ab。' : ' 操作顺序是前进 a → 左转 b → 后退 a → 右转 b。');
      mount.dataset.state = JSON.stringify({ step: current, pose: state.pose });
    };
    render();
  }
}
document.querySelectorAll('.robotics-demo[data-demo]').forEach(initialize);
