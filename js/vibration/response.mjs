import { responseAt, naturalFrequency } from './model.mjs';
const NS = 'http://www.w3.org/2000/svg';
let count = 0;
function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function svg(tag, attributes = {}, text) {
  const item = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, String(value));
  if (text !== undefined) item.textContent = text;
  return item;
}
function mount(root) {
  if (root.dataset.initialized) return;
  const id = 'vibration-response-' + (++count);
  const title = element('h3', '阻尼、共振与隔振：两个不同响应', 'vibration-demo-title');
  title.id = id;
  root.setAttribute('role', 'region'); root.setAttribute('aria-labelledby', id);
  const controls = element('div', undefined, 'vibration-demo-controls');
  const makeSlider = (label, min, max, step, value, suffix) => {
    const wrapper = element('label'), input = element('input'), output = element('output');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    input.id = id + '-' + suffix; wrapper.htmlFor = input.id;
    output.htmlFor = input.id;
    wrapper.append(element('span', label), input, output); controls.append(wrapper);
    return {input, output};
  };
  const damping = makeSlider('阻尼比 ζ', '0.02', '0.6', '0.01', '0.1', 'damping');
  const frequency = makeSlider('激励频率 f / Hz', '0.2', '9.5', '0.01', '3.18', 'frequency');
  const reset = element('button', '重置'); reset.type = 'button'; controls.append(reset);
  const stage = element('div', undefined, 'vibration-chart-scroll');
  const readout = element('p', undefined, 'vibration-demo-readout');
  readout.setAttribute('role', 'status'); readout.setAttribute('aria-live', 'polite');
  const legend = element('p', '蓝线 D：力激励下位移/静挠度；橙线 T：基座运动下绝对位移/基座位移。灰线表示比值 1。', 'vibration-demo-note');
  root.replaceChildren(title, controls, stage, readout, legend);
  const fn = naturalFrequency(10, 4000);
  function render() {
    const zeta = Number(damping.input.value), f = Number(frequency.input.value), r = f / fn;
    const current = responseAt(r, zeta);
    damping.output.value = zeta.toFixed(2); frequency.output.value = f.toFixed(2);
    const points = Array.from({length: 601}, (_, i) => ({r: i / 200, ...responseAt(i / 200, zeta)}));
    const ymax = Math.ceil(Math.max(...points.flatMap(p => [p.force, p.base])) * 1.1);
    const x = r => 55 + r / 3 * 525, y = v => 290 - v / ymax * 235;
    const chart = svg('svg', {viewBox: '0 0 640 340', class: 'vibration-chart', role: 'img',
      'aria-label': `线性模型的力激励放大与基座传递率，阻尼比 ${zeta}；当前频率比 ${r.toFixed(2)}`});
    chart.append(svg('rect', {x: x(Math.SQRT2), y: 55, width: x(3)-x(Math.SQRT2), height:235, fill:'#eef5ef'}));
    for (let i=0; i<=4; i++) {
      const v = ymax * i / 4;
      chart.append(svg('line', {x1:55,y1:y(v),x2:580,y2:y(v),stroke:'#d5e0e8'}),
        svg('text',{x:48,y:y(v)+4,'text-anchor':'end'},v.toFixed(v<4?1:0)));
    }
    chart.append(svg('line',{x1:55,y1:y(1),x2:580,y2:y(1),stroke:'#65788b','stroke-dasharray':'5 4'}));
    for (const value of [0,0.5,1,1.5,2,2.5,3]) {
      chart.append(svg('line',{x1:x(value),y1:290,x2:x(value),y2:295,stroke:'#50697c'}),
        svg('text',{x:x(value),y:314,'text-anchor':'middle'},String(value)));
    }
    chart.append(svg('text',{x:55,y:30},'无量纲响应比'),
      svg('text',{x:330,y:336,'text-anchor':'middle'},'频率比 r = f / fn'),
      svg('text',{x:x(2.15),y:49,'text-anchor':'middle'},'T < 1 的隔振区'));
    for (const [key,color] of [['force','#246aab'],['base','#ad581b']]) {
      chart.append(svg('path',{d:points.map((p,i)=>(i?'L':'M')+x(p.r).toFixed(2)+' '+y(p[key]).toFixed(2)).join(' '),
        fill:'none',stroke:color,'stroke-width':2.5}));
      chart.append(svg('circle',{cx:x(r),cy:y(current[key]),r:4.5,fill:color}));
    }
    chart.append(svg('line',{x1:x(r),y1:55,x2:x(r),y2:290,stroke:'#364f65','stroke-dasharray':'3 4'}));
    stage.replaceChildren(chart);
    root.dataset.state = JSON.stringify({damping:zeta,frequency:f,naturalFrequency:fn,ratio:r,...current});
    readout.textContent = `fn = ${fn.toFixed(3)} Hz；r = ${r.toFixed(3)}；D = ${current.force.toFixed(3)}；T = ${current.base.toFixed(3)}。` +
      (current.base < 1 ? '此频点基座传递率小于 1。' : '此频点仍未进入基座隔振区。') + '纵轴随峰值调整，请比较读数。';
  }
  damping.input.addEventListener('input',render); frequency.input.addEventListener('input',render);
  reset.addEventListener('click',()=>{damping.input.value='0.1';frequency.input.value='3.18';render();});
  root.dataset.initialized='true'; render();
}
document.querySelectorAll('.vibration-response-demo').forEach(mount);
