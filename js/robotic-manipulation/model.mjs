// Pure planar examples. Angles use radians; twists in the notes use (v, omega).
const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(name + ' must be finite');
  return value;
};
const pair = (value, name) => {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(name + ' must be a pair');
  value.forEach((item) => finite(item, name));
  return [...value];
};
export const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
export const matVec = (matrix, vector) => matrix.map((row) => dot(row, vector));

export function frameTransform(theta, translation, point) {
  finite(theta, 'theta');
  const p = pair(translation, 'translation'), x = pair(point, 'point');
  const c = Math.cos(theta), s = Math.sin(theta);
  return [c * x[0] - s * x[1] + p[0], s * x[0] + c * x[1] + p[1]];
}
export function frameInverse(theta, translation, point) {
  finite(theta, 'theta');
  const p = pair(translation, 'translation'), x = pair(point, 'point');
  const c = Math.cos(theta), s = Math.sin(theta), dx = x[0] - p[0], dy = x[1] - p[1];
  return [c * dx + s * dy, -s * dx + c * dy];
}
export function frameState(theta = Math.PI / 2, translation = [1, 2], point = [1, 0]) {
  const origin = pair(translation, 'translation'), localPoint = pair(point, 'point');
  const worldPoint = frameTransform(theta, origin, localPoint);
  const direction = frameTransform(theta, [0, 0], localPoint);
  const c = Math.cos(theta), s = Math.sin(theta);
  return { theta, origin, localPoint, worldPoint, direction, rotation: [[c, -s], [s, c]],
    homogeneous: [[c, -s, origin[0]], [s, c, origin[1]], [0, 0, 1]],
    basis: [[c, s], [-s, c]] };
}

// Jp maps joint rates to endpoint translation, not to the six-dimensional spatial twist.
export function arm2R(q1 = 0, q2 = Math.PI / 2, options = {}) {
  finite(q1, 'q1'); finite(q2, 'q2');
  const l1 = finite(options.l1 ?? 1, 'l1'), l2 = finite(options.l2 ?? 1, 'l2');
  if (l1 <= 0 || l2 <= 0) throw new RangeError('link lengths must be positive');
  const force = pair(options.force ?? [1, 0], 'force');
  const s1 = Math.sin(q1), c1 = Math.cos(q1), s12 = Math.sin(q1 + q2), c12 = Math.cos(q1 + q2);
  const elbow = [l1 * c1, l1 * s1], endpoint = [elbow[0] + l2 * c12, elbow[1] + l2 * s12];
  const jacobian = [[-l1 * s1 - l2 * s12, -l2 * s12], [l1 * c1 + l2 * c12, l2 * c12]];
  const columns = [[jacobian[0][0], jacobian[1][0]], [jacobian[0][1], jacobian[1][1]]];
  const torques = columns.map((column) => dot(column, force));
  const determinant = l1 * l2 * Math.sin(q2);
  const a = dot(jacobian[0], jacobian[0]), b = dot(jacobian[0], jacobian[1]), d = dot(jacobian[1], jacobian[1]);
  const discriminant = Math.hypot(a - d, 2 * b);
  const singularValues = [Math.sqrt(Math.max(0, (a + d + discriminant) / 2)), Math.sqrt(Math.max(0, (a + d - discriminant) / 2))];
  const rank = Math.abs(determinant) <= 1e-10 * l1 * l2 ? 1 : 2;
  const velocityEllipse = Array.from({ length: 97 }, (_, i) => {
    const angle = i * 2 * Math.PI / 96;
    return matVec(jacobian, [Math.cos(angle), Math.sin(angle)]);
  });
  return { q1, q2, l1, l2, force, elbow, endpoint, jacobian, columns, torques,
    determinant, rank, singularValues, velocityEllipse };
}

// A finite flow commutator; the residual x displacement is deliberately retained.
export function bracketTrace(a = 0.6, b = 0.45) {
  finite(a, 'a'); finite(b, 'b');
  if (a < 0) throw new RangeError('a must be nonnegative');
  const x = a * (1 - Math.cos(b)), y = -a * Math.sin(b);
  return { a, b, steps: [
    { pose: [0, 0, 0], caption: '初始：朝向 x 正方向，侧向速度受约束。', action: '初始' },
    { pose: [a, 0, 0], caption: '沿当前朝向前进 a；车轮始终沿自身纵向滚动。', action: '前进 a' },
    { pose: [a, 0, b], caption: '旋转 b：位置保持不变，朝向变为 b。', action: b >= 0 ? '左转 b' : '旋转 b' },
    { pose: [x, y, b], caption: '沿新的朝向后退 a，侧向位移与 x 漂移由转角共同决定。', action: '后退 a' },
    { pose: [x, y, 0], caption: '旋转 −b：恢复初始朝向。有限动作序列不等于纯横移。', action: b >= 0 ? '右转 b' : '旋转 −b' }
  ] };
}
