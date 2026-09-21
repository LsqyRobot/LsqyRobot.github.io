// Original teaching arithmetic. Not a RoboGauge rollout or a locomotion policy.
import { pathToFileURL } from 'node:url';

export function geometricQuality(scores, weights) {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new RangeError('scores must be a nonempty array');
  }
  weights ??= scores.map(() => 1);
  if (!Array.isArray(weights) || scores.length !== weights.length) {
    throw new RangeError('scores and weights must have matching, nonzero lengths');
  }
  if (Array.from(scores).some(x => !Number.isFinite(x) || x < 0 || x > 1) ||
      Array.from(weights).some(w => !Number.isFinite(w) || w <= 0)) {
    throw new RangeError('scores must be in [0,1], weights must be positive');
  }
  // Exact mathematical zero, unlike an upstream numerical epsilon floor.
  if (scores.includes(0)) return 0;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(totalWeight)) throw new RangeError('weight total must be finite');
  return Math.exp(scores.reduce((sum, x, i) => sum + (weights[i] / totalWeight) * Math.log(x), 0));
}

export function levelQuality(level, quality) {
  if (!Number.isInteger(level) || level < 1 || level > 10 ||
      !Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new RangeError('passable level must be 1..10 and quality must be in [0,1]');
  }
  // Does not define failure-to-pass or the special flat-terrain pipeline.
  return 0.09 * (level - 1) + 0.19 * quality;
}

export function examples() {
  const a = Array(8).fill(0.7);
  const b = [...Array(7).fill(0.9), 0.1];
  return {
    balanced: { arithmetic: a.reduce((s, x) => s + x, 0) / 8, geometric: geometricQuality(a) },
    imbalanced: { arithmetic: b.reduce((s, x) => s + x, 0) / 8, geometric: geometricQuality(b) },
    lowerLevelGood: levelQuality(6, 0.95),
    higherLevelPoor: levelQuality(7, 0.4),
    temporal: { combineThenAverage: 0.1, averageThenCombine: geometricQuality([0.505, 0.505]) }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Teaching examples only; no robot, ONNX model or measured paper results.');
  console.log(JSON.stringify(examples(), null, 2));
}
