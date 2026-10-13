// Steady-state, linear SDOF model. Ratios are dimensionless, not measured data.
export function responseAt(ratio, damping) {
  if (!Number.isFinite(ratio) || ratio < 0 || !Number.isFinite(damping) || damping <= 0 || damping > 1)
    throw new RangeError('Require finite r >= 0 and 0 < damping <= 1');
  const denominator = Math.hypot(1 - ratio * ratio, 2 * damping * ratio);
  if (!Number.isFinite(denominator)) throw new RangeError('Response exceeds numeric range');
  const force = 1 / denominator, base = Math.hypot(1, 2 * damping * ratio) / denominator;
  if (!Number.isFinite(force) || !Number.isFinite(base)) throw new RangeError('Response exceeds numeric range');
  return { force, base };
}
export function naturalFrequency(mass, stiffness) {
  if (!Number.isFinite(mass) || mass <= 0 || !Number.isFinite(stiffness) || stiffness <= 0)
    throw new RangeError('Mass and stiffness must be finite and positive');
  const frequency = Math.sqrt(stiffness / mass) / (2 * Math.PI);
  if (!Number.isFinite(frequency) || frequency <= 0) throw new RangeError('Frequency exceeds numeric range');
  return frequency;
}
