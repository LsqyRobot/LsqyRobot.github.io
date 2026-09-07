import { simulateSavings, calculateLoan } from './finance-math.mjs?v=20260906-1';

// This calculator never sends, persists or reads personal financial data.
// All dynamic strings go through textContent; no user input becomes HTML.
const number = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rateNumber = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const money = (value) => `${number.format(value)} 元`;
const small = (value) => value >= 1e12 ? value.toExponential(1)
  : value >= 1e8 ? `${Number((value / 1e8).toPrecision(3))}亿`
    : value >= 1e4 ? `${Number((value / 1e4).toPrecision(3))}万` : `${Math.round(value)}`;
let nextLab = 0;

export function toCSV(headers, rows) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return '\ufeff' + [headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

export function mountFinanceLab(root) {
  if (root.dataset.financeReady === 'true') return;
  const doc = root.ownerDocument;
  const prefix = `finance-${++nextLab}`;
  const el = (tag, attrs = {}, text) => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const append = (parent, ...children) => children.forEach((child) => parent.appendChild(child));
  const note = (text) => el('p', { class: 'finance-note' }, text);
  const button = (text, attrs = {}) => el('button', { type: 'button', ...attrs }, text);
  root.replaceChildren();
  root.dataset.financeReady = 'true';
  append(root, note('学习测算，不是收益承诺或投资建议。默认数值只是演示；计算器不上传或自动保存输入值。'));
  const modes = el('div', { class: 'finance-modes', role: 'group', 'aria-label': '计算类型' });
  const panels = [];
  append(root, modes);

  function panel(key, title, description) {
    const section = el('section', { id: `${prefix}-${key}`, 'aria-label': title });
    const toggle = button(title, { 'aria-pressed': String(panels.length === 0), 'aria-controls': section.id });
    section.hidden = panels.length !== 0;
    const form = el('form', { novalidate: '', autocomplete: 'off', 'data-finance-form': key });
    const fields = el('div', { class: 'finance-fields' });
    const error = el('p', { class: 'finance-error', role: 'alert' });
    error.hidden = true;
    const result = el('div', { class: 'finance-result' });
    const summary = el('div', { class: 'finance-summary', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const extra = el('div', { class: 'finance-extra' });
    const details = el('details');
    const tableTitle = el('summary', {}, key === 'savings' ? '查看年度明细（元）' : '查看逐月还款明细（元）');
    const scroll = el('div', { class: 'finance-table-scroll', tabindex: '0', role: 'region', 'aria-label': tableTitle.textContent });
    const table = el('table');
    const exportButton = button('下载明细 CSV');
    const hint = note('金额显示保留两位小数；计算过程不逐期舍入，可能与实际账单的分币规则不同。');
    append(scroll, table);
    append(details, tableTitle, hint, scroll, exportButton);
    append(result, summary, extra, details);
    append(form, note(description), fields, el('button', { type: 'submit' }, '计算'), error);
    append(section, form, result);
    append(modes, toggle);
    append(root, section);
    const inputs = {};
    const definitions = {};
    const current = { section, toggle, result, summary, extra, fields, form, inputs, error, table, exportButton, definitions };
    panels.push(current);
    toggle.addEventListener('click', () => {
      for (const p of panels) {
        p.section.hidden = p !== current;
        p.toggle.setAttribute('aria-pressed', String(p === current));
      }
      // A formerly hidden chart now has its actual available width.
      if (current.redraw) current.redraw();
    });
    return current;
  }

  function field(p, key, label, value, options) {
    const id = `${p.section.id}-${key}`;
    const wrapper = el('div', { class: 'finance-field' });
    const caption = el('label', { for: id }, label);
    let input;
    if (Array.isArray(options)) {
      input = el('select', { id, name: key });
      for (const [optionValue, optionLabel] of options) append(input, el('option', { value: optionValue }, optionLabel));
    } else {
      input = el('input', { id, name: key, type: 'number', required: '', inputmode: 'decimal', step: 'any', ...options });
    }
    input.value = String(value);
    p.inputs[key] = input;
    p.definitions[key] = { label, options };
    append(wrapper, caption, input);
    append(p.fields, wrapper);
  }

  function values(p) {
    const values = {};
    Object.values(p.inputs).forEach((input) => input.removeAttribute('aria-invalid'));
    for (const [key, input] of Object.entries(p.inputs)) {
      const { label, options } = p.definitions[key];
      if (Array.isArray(options)) {
        values[key] = input.value;
      } else {
        const value = input.value.trim();
        const numeric = Number(value);
        if (!value || !Number.isFinite(numeric) || numeric < Number(options.min) ||
            numeric > Number(options.max) || (options.step === '1' && !Number.isInteger(numeric))) {
          input.setAttribute('aria-invalid', 'true');
          throw new RangeError(`${label}：请输入 ${options.min}～${options.max} 之间的${options.step === '1' ? '整数' : '数值'}。`);
        }
        values[key] = numeric;
      }
    }
    return values;
  }

  function stats(p, entries) {
    p.summary.replaceChildren();
    for (const [label, value] of entries) {
      const stat = el('div', { class: 'finance-stat' });
      append(stat, el('span', {}, label), el('strong', {}, value));
      append(p.summary, stat);
    }
  }

  function renderTable(p, headers, rows, parameters, filename) {
    p.table.replaceChildren();
    const head = el('thead');
    const headRow = el('tr');
    headers.forEach((title) => append(headRow, el('th', { scope: 'col' }, title)));
    append(head, headRow);
    const body = el('tbody');
    rows.forEach((row) => {
      const tr = el('tr');
      row.forEach((value, index) => append(tr, el('td', {}, index === 0 ? String(value) : number.format(value))));
      append(body, tr);
    });
    append(p.table, head, body);
    const metadata = [
      ['说明', '固定假设的学习测算，不是收益承诺；金额单位：元'],
      ...Object.entries(parameters).map(([key, value]) => {
        const { label, options } = p.definitions[key];
        return [label, Array.isArray(options) ? options.find(([v]) => v === value)[1] : value];
      }),
      ['口径', parameters.method
        ? '合同名义年利率除以12；固定利率；不逐期舍入；不含税费、保险或提前还款'
        : '过程不逐期舍入；费用影响包含损失的复利；不含税及其他费用'],
      [], headers,
      ...rows.map((row) => row.map((value, i) => i === 0 ? value : value.toFixed(2)))
    ];
    p.exportButton.onclick = () => {
      const blob = new Blob([toCSV(metadata[0], metadata.slice(1))], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: filename });
      append(root, link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }

  function connect(p, calculate, render) {
    const update = () => {
      try {
        const parameters = values(p);
        const result = calculate(parameters);
        p.error.hidden = true;
        p.error.textContent = '';
        p.result.hidden = false;
        p.exportButton.disabled = false;
        render(result, parameters);
      } catch (error) {
        p.error.textContent = error.message;
        p.error.hidden = false;
        // Never leave a previous valid result looking like the invalid input's answer.
        p.result.hidden = true;
        p.exportButton.disabled = true;
      }
    };
    p.form.addEventListener('submit', (event) => { event.preventDefault(); update(); });
    p.form.addEventListener('input', update);
    p.form.addEventListener('change', update);
    update();
  }

  const savings = panel('savings', '复利与定投', '按月复投、每月固定追加。月投入设为 0 即一次性本金复利；输入 5 表示 5%。目标指到期名义金额。');
  field(savings, 'principal', '初始本金（元）', 100000, { min: '0', max: '1000000000' });
  field(savings, 'monthlyContribution', '每月追加（元）', 1000, { min: '0', max: '1000000000' });
  field(savings, 'years', '投资年数（整年）', 10, { min: '0', max: '60', step: '1' });
  field(savings, 'annualRate', '假设年收益率（%）', 5, { min: '-50', max: '50' });
  field(savings, 'rateType', '收益率口径', 'effective', [['effective', '有效年收益率'], ['nominal-monthly', '名义年利率，按月计息']]);
  field(savings, 'timing', '每月投入时点', 'end', [['end', '月末投入'], ['begin', '月初投入']]);
  field(savings, 'annualFee', '年度管理费率（%）', 0.5, { min: '0', max: '10' });
  field(savings, 'inflationRate', '假设年通胀率（%）', 2, { min: '-10', max: '30' });
  field(savings, 'target', '到期目标金额（元）', 300000, { min: '0', max: '1000000000' });
  append(savings.form, note('管理费按月等效折减资产，不含税和其他费用；已扣管理费的收益率请把费率设为 0，避免重复扣除。负收益可测算，但模型不包含市场波动。'));
  const facts = el('dl', { class: 'finance-facts' });
  const targetText = el('p', { class: 'finance-target' });
  const chart = el('div', { class: 'finance-chart' });
  const legend = el('p', { class: 'finance-legend' });
  append(legend, el('span', { class: 'finance-key-balance' }, '实线：账户金额'), el('span', { class: 'finance-key-input' }, '虚线：累计投入'));
  append(savings.extra, facts, targetText, chart, legend);
  let chartRows = [];

  savings.redraw = () => {
    if (!chartRows.length) return;
    const width = Math.max(160, chart.clientWidth || 600);
    const height = 220, left = 65, right = width - 16, top = 25, bottom = 180;
    const lastYear = chartRows.at(-1).year;
    const max = Math.max(1, ...chartRows.flatMap((row) => [row.balance, row.contributed])) * 1.08;
    const x = (year) => left + year / (lastYear || 1) * (right - left);
    const y = (value) => bottom - value / max * (bottom - top);
    const svgEl = (tag, attrs = {}, text) => {
      const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `账户金额与累计投入，0 至 ${lastYear} 年，详细数值见年度明细` });
    append(svg, svgEl('text', { x: 4, y: 14 }, '金额 / 元'));
    for (let i = 0; i <= 3; i++) {
      const value = max * i / 3;
      append(svg, svgEl('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'finance-gridline' }),
        svgEl('text', { x: left - 8, y: y(value) + 4, 'text-anchor': 'end' }, small(value)));
    }
    for (const year of new Set([0, ...(width >= 360 ? [Math.round(lastYear / 2)] : []), lastYear])) {
      append(svg, svgEl('text', { x: x(year), y: bottom + 20, 'text-anchor': year === lastYear && lastYear > 0 ? 'end' : year === 0 ? 'start' : 'middle' }, `${year} 年`));
    }
    for (const [key, cssClass] of [['balance', 'finance-line-balance'], ['contributed', 'finance-line-input']]) {
      const points = chartRows.map((row) => `${x(row.year)},${y(row[key])}`).join(' ');
      append(svg, svgEl('polyline', { points, class: cssClass, fill: 'none' }));
      if (chartRows.length === 1) append(svg, svgEl('circle', { cx: x(0), cy: y(chartRows[0][key]), r: 3, class: cssClass }));
    }
    chart.replaceChildren(svg);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(savings.redraw);
    observer.observe(chart);
  }
  connect(savings, simulateSavings, (result, parameters) => {
    stats(savings, [['期末账户金额', money(result.balance)], ['累计投入本金', money(result.contributed)], ['扣管理费后名义损益', money(result.gain)]]);
    facts.replaceChildren();
    for (const [label, value] of [
      ['折回今天的购买力', money(result.realBalance)],
      ['管理费造成的终值差额（含复利影响）', money(result.feeDrag)],
      ['扣管理费后有效年收益率', `${rateNumber.format(result.effectiveAnnualNetRate)}%`]
    ]) append(facts, el('dt', {}, label), el('dd', {}, value));
    targetText.textContent = result.monthlyNeeded === null ? '年数为 0 且本金不足，无法靠未来月投入达到目标。'
      : result.monthlyNeeded === 0 ? '在这些假设下，仅初始本金的期末金额就已达到目标，无需额外月投入。'
        : `要在 ${parameters.years} 年后达到 ${money(parameters.target)}，需每月${parameters.timing === 'begin' ? '月初' : '月末'}投入约 ${money(Math.ceil(result.monthlyNeeded * 100) / 100)}（总月投入额，不是额外增加额；向上取到分）。`;
    chartRows = result.rows;
    savings.redraw();
    renderTable(savings, ['年末', '累计投入', '账户金额', '名义损益', '今日购买力', '费用影响'],
      result.rows.map((r) => [r.year, r.contributed, r.balance, r.gain, r.realBalance, r.feeDrag]), parameters, 'finance-savings.csv');
  });

  const loan = panel('loan', '贷款还款', '固定利率、每月还款；月利率 = 合同名义年利率 ÷ 12。本工具不计算含服务费的综合 APR，不含税费、保险、浮动利率和提前还款。');
  field(loan, 'principal', '贷款本金（元）', 300000, { min: '0.01', max: '1000000000' });
  field(loan, 'annualRate', '合同名义年利率（%）', 4, { min: '0', max: '50' });
  field(loan, 'months', '贷款期数（月）', 120, { min: '1', max: '600', step: '1' });
  field(loan, 'method', '还款方式', 'annuity', [['annuity', '等额本息'], ['equal-principal', '等额本金']]);
  connect(loan, calculateLoan, (result, parameters) => {
    stats(loan, [['首月还款', money(result.firstPayment)], ['末月还款', money(result.lastPayment)], ['总利息', money(result.totalInterest)]]);
    loan.extra.replaceChildren(note(`本息合计：${money(result.totalPayment)}。${parameters.method === 'annuity' ? '等额本息每月金额基本相同，但本金与利息占比随时间变化。' : '等额本金每月归还相同本金，还款额逐月减少。'}`));
    renderTable(loan, ['期数', '当期还款', '归还本金', '当期利息', '剩余本金'],
      result.rows.map((r) => [r.month, r.payment, r.principal, r.interest, r.balance]), parameters, 'finance-loan.csv');
  });
}

if (typeof document !== 'undefined') {
  const start = () => document.querySelectorAll('[data-finance-lab]').forEach(mountFinanceLab);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
