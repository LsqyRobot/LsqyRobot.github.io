/**
 * 经济学笔记的纯计算层：无 DOM、网络、存储或第三方依赖。
 * 金额保持未按分舍入的浮点数；所有输入利率均为百分数（5 表示 5%）。
 * 这是固定参数的教学模型，不预测投资收益，也不计算税款或银行合同费用。
 */

const MAX_AMOUNT = 1_000_000_000;

function requireOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new RangeError('请提供包含计算参数的对象。');
  }
  return options;
}

function numberInRange(value, label, minimum, maximum, { integer = false, positive = false } = {}) {
  // 不将空字符串、null、布尔值等隐式转为 0。表单层应显式读取 valueAsNumber。
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${label}必须是有限数字，不能为空。`);
  }
  if (value < minimum || value > maximum || (positive && value === 0)) {
    const interval = positive ? `大于 0 且不超过 ${maximum}` : `在 ${minimum} 至 ${maximum} 之间（含边界）`;
    throw new RangeError(`${label}须${interval}。`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new RangeError(`${label}必须是整数。`);
  }
  return value;
}

function oneOf(value, label, choices) {
  if (!choices.includes(value)) {
    throw new RangeError(`${label}必须为 ${choices.join(' 或 ')}。`);
  }
  return value;
}

function checked(value, label, { nonnegative = false } = {}) {
  if (!Number.isFinite(value) || (nonnegative && value < 0)) {
    throw new RangeError(`${label}超出可计算的有效范围，请检查输入。`);
  }
  return Object.is(value, -0) ? 0 : value;
}

// 补偿求和降低数百个月的小额利息或大额本金累计造成的舍入误差。
function accumulator(initial = 0) {
  let sum = initial;
  let correction = 0;
  return {
    add(amount) {
      const adjusted = amount - correction;
      const next = sum + adjusted;
      correction = (next - sum) - adjusted;
      sum = next;
      return sum;
    },
    get value() { return sum; },
  };
}

function advanceMonth(balance, contribution, rate, timing) {
  if (timing === 'begin') balance.add(contribution);
  balance.add(balance.value * rate);
  if (timing === 'end') balance.add(contribution);
}

/**
 * 固定收益与固定月投入的储蓄情景。
 *
 * 必填数字：principal、monthlyContribution、years、annualRate。
 * 默认：rateType='effective'、timing='end'、annualFee=0、inflationRate=0、target=0。
 * effective：月收益 (1 + R)^(1/12) - 1；nominal-monthly：月收益 R/12。
 * 费用模型：每月资产乘 (1 - f)^(1/12)，并非简单用收益率减费率。
 * realBalance 为期末金额按固定通胀率折为今天购买力，不是“实际收益”。
 * feeDrag 为无费用路径与当前路径的终值差，含被费用削弱的后续复利。
 * monthlyNeeded 为达到 target 所需的总固定月存额，与当前 monthlyContribution 无关；
 * 本金自行增长已足够则为 0，零年且本金不足则为 null。target 用期末名义金额。
 * 返回：balance, contributed, gain, realBalance, feeDrag,
 * effectiveAnnualNetRate（百分数）, monthlyNeeded, rows（初始及每年末）。
 */
export function simulateSavings(options = {}) {
  const input = requireOptions(options);
  const principal = numberInRange(input.principal, '初始本金', 0, MAX_AMOUNT);
  const contribution = numberInRange(input.monthlyContribution, '每月投入', 0, MAX_AMOUNT);
  const years = numberInRange(input.years, '储蓄年数', 0, 60, { integer: true });
  const annualRate = numberInRange(input.annualRate, '年收益率', -50, 50) / 100;
  const annualFee = numberInRange(input.annualFee === undefined ? 0 : input.annualFee, '年费用率', 0, 10) / 100;
  const inflation = numberInRange(input.inflationRate === undefined ? 0 : input.inflationRate, '年通胀率', -10, 30) / 100;
  const target = numberInRange(input.target === undefined ? 0 : input.target, '期末目标金额', 0, MAX_AMOUNT);
  const rateType = oneOf(input.rateType === undefined ? 'effective' : input.rateType, '利率口径', ['effective', 'nominal-monthly']);
  const timing = oneOf(input.timing === undefined ? 'end' : input.timing, '投入时点', ['end', 'begin']);

  // 在对数域合并增长与费用，再用 expm1 保留接近零的净月收益。
  const grossLog = rateType === 'effective' ? Math.log1p(annualRate) / 12 : Math.log1p(annualRate / 12);
  const netLog = grossLog + Math.log1p(-annualFee) / 12;
  const grossRate = Math.expm1(grossLog);
  const netRate = Math.expm1(netLog);
  const balance = accumulator(principal);
  const noFee = accumulator(principal);
  const unitContribution = accumulator();
  const rows = [];
  const months = years * 12;

  function snapshot(month) {
    const contributed = checked(principal + contribution * month, '累计投入', { nonnegative: true });
    const nominalBalance = checked(balance.value, '期末金额', { nonnegative: true });
    // 两条路径的微小浮点尾差不能显示为“负费用”。这不改变任何用户输入。
    const rawDrag = noFee.value - nominalBalance;
    const tolerance = Number.EPSILON * Math.max(noFee.value, nominalBalance, 1) * 16;
    const feeDrag = rawDrag < 0 && rawDrag >= -tolerance ? 0 : rawDrag;
    return {
      year: month / 12,
      balance: nominalBalance,
      contributed,
      gain: checked(nominalBalance - contributed, '累计名义收益'),
      realBalance: checked(nominalBalance * Math.exp(-Math.log1p(inflation) * month / 12), '今日购买力', { nonnegative: true }),
      feeDrag: checked(feeDrag, '费用拖累', { nonnegative: true }),
    };
  }

  rows.push(snapshot(0));
  for (let month = 1; month <= months; month += 1) {
    advanceMonth(balance, contribution, netRate, timing);
    advanceMonth(noFee, contribution, grossRate, timing);
    advanceMonth(unitContribution, 1, netRate, timing);
    if (month % 12 === 0) rows.push(snapshot(month));
  }

  const principalFuture = checked(principal * Math.exp(netLog * months), '本金终值', { nonnegative: true });
  let monthlyNeeded;
  if (target <= principalFuture) {
    monthlyNeeded = 0;
  } else if (months === 0 || unitContribution.value <= 0) {
    monthlyNeeded = null;
  } else {
    monthlyNeeded = checked((target - principalFuture) / unitContribution.value, '所需月投入', { nonnegative: true });
  }

  const { year: _year, ...finalRow } = rows.at(-1);
  return {
    ...finalRow,
    effectiveAnnualNetRate: checked(Math.expm1(netLog * 12) * 100, '扣费后有效年收益率'),
    monthlyNeeded,
    rows,
  };
}

/**
 * 按月偿还的固定利率贷款；annualRate 为合同名义年利率，月利率=年利率/12。
 * method='annuity'（默认等额本息）或 'equal-principal'（等额本金）。
 * 不包含税费、保险、手续费、浮动利率、日计息差异或提前还款；不作逐月分位舍入。
 * 返回 firstPayment, lastPayment, totalInterest, totalPayment,
 * rows（月度 month, payment, principal, interest, balance）。末月结清浮点尾差。
 */
export function calculateLoan(options = {}) {
  const input = requireOptions(options);
  const principal = numberInRange(input.principal, '贷款本金', 0, MAX_AMOUNT, { positive: true });
  const annualRate = numberInRange(input.annualRate, '贷款年利率', 0, 50) / 100;
  const months = numberInRange(input.months, '还款月数', 1, 600, { integer: true });
  const method = oneOf(input.method === undefined ? 'annuity' : input.method, '还款方式', ['annuity', 'equal-principal']);
  const monthlyRate = annualRate / 12;
  const monthlyLog = Math.log1p(monthlyRate);
  // P*i / (1-(1+i)^(-n))：expm1 避免接近零利率时分母消失。
  const payment = monthlyRate === 0
    ? principal / months
    : principal * (monthlyRate / -Math.expm1(-months * monthlyLog));
  const principalRepaid = accumulator();
  const interestTotal = accumulator();
  const rows = [];
  let remaining = principal;

  for (let month = 1; month <= months; month += 1) {
    const interest = checked(remaining * monthlyRate, '当期利息', { nonnegative: true });
    // 等额本息本金部分直接由封闭式计算，避免“大额月供-大额利息”
    // 在高利率、长年限时的消减误差被递推放大。
    let principalPart = method === 'equal-principal' || monthlyRate === 0
      ? principal / months
      : payment * Math.exp(-(months - month + 1) * monthlyLog);
    if (month === months) principalPart = remaining;
    principalPart = checked(principalPart, '当期本金', { nonnegative: true });
    principalRepaid.add(principalPart);
    remaining = month === months ? 0 : principal - principalRepaid.value;
    remaining = checked(remaining, '剩余本金', { nonnegative: true });
    interestTotal.add(interest);
    rows.push({
      month,
      payment: checked(principalPart + interest, '当期月供', { nonnegative: true }),
      principal: principalPart,
      interest,
      balance: remaining,
    });
  }

  return {
    firstPayment: rows[0].payment,
    lastPayment: rows.at(-1).payment,
    totalInterest: checked(interestTotal.value, '总利息', { nonnegative: true }),
    totalPayment: checked(principal + interestTotal.value, '总还款金额', { nonnegative: true }),
    rows,
  };
}
