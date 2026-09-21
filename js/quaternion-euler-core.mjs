function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} 必须是有限数。`);
  return value;
}

function quaternion(value, label = "四元数") {
  if (!value || typeof value !== "object") throw new RangeError(`${label} 缺失。`);
  return {
    w: finiteNumber(Number(value.w), `${label}.w`),
    x: finiteNumber(Number(value.x), `${label}.x`),
    y: finiteNumber(Number(value.y), `${label}.y`),
    z: finiteNumber(Number(value.z), `${label}.z`)
  };
}

export function normalizeQuaternion(value) {
  const q = quaternion(value);
  const length = Math.hypot(q.w, q.x, q.y, q.z);
  if (length < 1e-12) throw new RangeError("零四元数不能表示旋转。");
  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}

export function quaternionDot(left, right) {
  const a = normalizeQuaternion(left);
  const b = normalizeQuaternion(right);
  return a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
}

export function quaternionAngularDistance(left, right) {
  const dot = Math.min(1, Math.max(-1, Math.abs(quaternionDot(left, right))));
  if (1 - dot < 1e-12) return 0;
  return 2 * Math.acos(dot);
}

export function slerpQuaternion(left, right, progress) {
  const t = finiteNumber(Number(progress), "t");
  if (t < 0 || t > 1) throw new RangeError("SLERP 的 t 必须位于 [0, 1]。");
  const a = normalizeQuaternion(left);
  let b = normalizeQuaternion(right);
  let dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  if (dot < 0) {
    b = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
    dot = -dot;
  }
  dot = Math.min(1, Math.max(-1, dot));
  if (dot > 0.9995) {
    return normalizeQuaternion({
      w: a.w + (b.w - a.w) * t,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    });
  }
  const angle = Math.acos(dot);
  const sinAngle = Math.sin(angle);
  const leftWeight = Math.sin((1 - t) * angle) / sinAngle;
  const rightWeight = Math.sin(t * angle) / sinAngle;
  return normalizeQuaternion({
    w: a.w * leftWeight + b.w * rightWeight,
    x: a.x * leftWeight + b.x * rightWeight,
    y: a.y * leftWeight + b.y * rightWeight,
    z: a.z * leftWeight + b.z * rightWeight
  });
}

export function quaternionFromEulerZYX({ roll, pitch, yaw }) {
  roll = finiteNumber(Number(roll), "roll");
  pitch = finiteNumber(Number(pitch), "pitch");
  yaw = finiteNumber(Number(yaw), "yaw");
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  return normalizeQuaternion({
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy
  });
}

export function rotateVectorByQuaternion(value, vector) {
  const q = normalizeQuaternion(value);
  if (!Array.isArray(vector) || vector.length !== 3 || vector.some(component => !Number.isFinite(component))) {
    throw new RangeError("向量必须包含三个有限分量。");
  }
  const [vx, vy, vz] = vector;
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx)
  ];
}
