import {
  normalizeQuaternion as coreNormalizeQuaternion,
  quaternionAngularDistance,
  rotateVectorByQuaternion,
  slerpQuaternion as coreSlerpQuaternion
} from "./quaternion-euler-core.mjs";

(function () {
  "use strict";

  var root = document.querySelector(".qe-page");
  if (!root) return;

  var unit = "deg";
  var euler = {};
  var quat = {};
  ["roll", "pitch", "yaw"].forEach(function (key) {
    euler[key] = root.querySelector('[data-euler="' + key + '"]');
  });
  ["w", "x", "y", "z"].forEach(function (key) {
    quat[key] = root.querySelector('[data-quaternion="' + key + '"]');
  });

  var canvas = root.querySelector("[data-attitude-canvas]");
  var canvasWrap = canvas ? canvas.parentElement : null;
  var ctx = canvas ? canvas.getContext("2d") : null;
  var outQ = root.querySelector("[data-output-quaternion]");
  var outE = root.querySelector("[data-output-euler]");
  var msg = root.querySelector("[data-message]");
  var stageText = root.querySelector("[data-animation-stage]");
  var progressBar = root.querySelector("[data-animation-progress]");
  var scrubber = root.querySelector("[data-animation-scrubber]");
  var scrubberValue = root.querySelector("[data-scrubber-value]");
  var scrubberHelp = root.querySelector("[data-scrubber-help]");
  var speedRange = root.querySelector("[data-animation-speed]");
  var speedText = root.querySelector("[data-animation-speed-value]");
  var pauseButton = root.querySelector("[data-animation-pause]");
  var resumeButton = root.querySelector("[data-animation-resume]");
  var replayButton = root.querySelector("[data-animation-replay]");
  var loopButton = root.querySelector("[data-animation-loop]");
  var frameMeaning = root.querySelector("[data-frame-meaning]");
  var frameExplanation = root.querySelector("[data-frame-explanation]");
  var transformDirection = root.querySelector("[data-transform-direction]");
  var transformOperation = root.querySelector("[data-transform-operation]");
  var translationToggle = root.querySelector("[data-translation-enabled]");
  var translationControls = root.querySelector("[data-translation-controls]");
  var translationReadout = root.querySelector("[data-translation-readout]");
  var translationInputs = {
    x: root.querySelector('[data-translation="x"]'),
    y: root.querySelector('[data-translation="y"]'),
    z: root.querySelector('[data-translation="z"]')
  };
  var transformEquation = root.querySelector("[data-transform-equation]");
  var vectorSourceLabel = root.querySelector("[data-vector-source-label]");
  var vectorTargetLabel = root.querySelector("[data-vector-target-label]");
  var vectorSource = root.querySelector("[data-vector-source]");
  var vectorTarget = root.querySelector("[data-vector-target]");
  var axisAngleText = root.querySelector("[data-axis-angle]");
  var stageTimeline = root.querySelector("[data-stage-timeline]");
  var stageCards = root.querySelectorAll("[data-stage-card]");
  var snapshotCards = root.querySelectorAll("[data-stage-snapshot-card]");
  var snapshotCanvases = root.querySelectorAll("[data-stage-snapshot]");
  var snapshotStatuses = root.querySelectorAll("[data-stage-snapshot-status]");
  var snapshotValues = root.querySelectorAll("[data-stage-snapshot-value]");
  var probeVectorReadout = root.querySelector("[data-probe-vector]");
  var probeResetButton = root.querySelector("[data-probe-reset]");
  var slerpCanvas = root.querySelector("[data-slerp-canvas]");
  var slerpProgress = root.querySelector("[data-slerp-progress]");
  var slerpProgressValue = root.querySelector("[data-slerp-progress-value]");
  var slerpError = root.querySelector("[data-slerp-error]");
  var slerpQuaternionOutput = root.querySelector("[data-slerp-quaternion]");
  var slerpTotalAngle = root.querySelector("[data-slerp-total-angle]");
  var slerpCurrentAngle = root.querySelector("[data-slerp-current-angle]");
  var slerpSpeedCheck = root.querySelector("[data-slerp-speed-check]");
  var slerpUseCurrent = root.querySelector("[data-slerp-use-current]");
  var slerpInputs = { q0: {}, q1: {} };
  ["w", "x", "y", "z"].forEach(function (key) {
    slerpInputs.q0[key] = root.querySelector('[data-slerp-q0="' + key + '"]');
    slerpInputs.q1[key] = root.querySelector('[data-slerp-q1="' + key + '"]');
  });
  var pathDescription = root.querySelector("[data-path-description]");
  var frameMode = "body-to-world";
  var quaternionPath = "zyx";
  var initialProbeVector = normalizeVector([0.78, 0.38, 0.46]);
  var probeVector = initialProbeVector.slice();
  var probeHandleScreen = null;
  var vectorDragging = { active: false, lastX: 0, lastY: 0 };
  var snapshotCaptured = [false, false, false];
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var autoLoopEnabled = !reducedMotion;
  var translationEnabled = !translationToggle || translationToggle.checked;
  var translationTarget = [
    translationInputs.x ? Number(translationInputs.x.value) : 0.55,
    translationInputs.y ? Number(translationInputs.y.value) : -0.35,
    translationInputs.z ? Number(translationInputs.z.value) : 0.40
  ].map(function (value, index) {
    return Number.isFinite(value) ? value : [0.55, -0.35, 0.40][index];
  });
  var activeTranslationPreset = "example";

  var state = {
    q: fromEuler(),
    running: false
  };

  var animation = {
    raf: null,
    mode: "euler",
    running: false,
    startQ: fromEuler(),
    targetQ: fromEuler(),
    startEuler: toEuler(fromEuler()),
    endEuler: toEuler(fromEuler()),
    axis: [1, 0, 0],
    angle: 0,
    startTime: 0,
    paused: false,
    pausedElapsed: 0,
    lastMode: "euler",
    lastTarget: null,
    lastStartQ: null,
    visualProgress: 1,
    micro: false,
    microAngle: 0,
    eulerStepTargets: [],
    eulerSegment: 0,
    loopTimer: null,
    hasMotion: false,
    segmentProgress: 0,
    scrubbing: false
  };
  animation.visualProgress = 1;

  var camera = {
    yaw: -0.85,
    pitch: 0.5,
    zoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  function n(input) {
    var value = Number(input.value);
    return Number.isFinite(value) ? value : 0;
  }

  function format(value) {
    return value.toFixed(6);
  }

  function toRadians(value) {
    return unit === "deg" ? value * Math.PI / 180 : value;
  }

  function toDegrees(value) {
    return value * 180 / Math.PI;
  }

  function getSpeed() {
    var value = Number(speedRange ? speedRange.value : 1);
    if (!Number.isFinite(value)) return 1;
    if (value < 0.2) return 0.2;
    if (value > 3) return 3;
    return value;
  }

  function getDuration() {
    return (isSegmentedAnimation() ? 3000 : 1800) / getSpeed();
  }

  function isSegmentedAnimation() {
    return animation.mode === "euler" || animation.mode === "quaternion-zyx";
  }

  function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function wrapPi(angle) {
    angle = (angle + Math.PI) % (Math.PI * 2);
    if (angle < 0) angle += Math.PI * 2;
    return angle - Math.PI;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function normalize(q) {
    var length = Math.hypot(q.w, q.x, q.y, q.z) || 1;
    return {
      w: q.w / length,
      x: q.x / length,
      y: q.y / length,
      z: q.z / length
    };
  }

  function fromEulerState(e) {
    var cr = Math.cos(e.roll / 2);
    var sr = Math.sin(e.roll / 2);
    var cp = Math.cos(e.pitch / 2);
    var sp = Math.sin(e.pitch / 2);
    var cy = Math.cos(e.yaw / 2);
    var sy = Math.sin(e.yaw / 2);
    return normalize({
      w: cr * cp * cy + sr * sp * sy,
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy
    });
  }

  function fromEuler() {
    return fromEulerState({
      roll: toRadians(n(euler.roll)),
      pitch: toRadians(n(euler.pitch)),
      yaw: toRadians(n(euler.yaw))
    });
  }

  function toEuler(q) {
    q = normalize(q);
    var sinp = 2 * (q.w * q.y - q.z * q.x);
    return {
      roll: Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y)),
      pitch: Math.asin(Math.max(-1, Math.min(1, sinp))),
      yaw: Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
    };
  }

  function multiply(a, b) {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
    };
  }

  function inverse(q) {
    return {
      w: q.w,
      x: -q.x,
      y: -q.y,
      z: -q.z
    };
  }

  function axisAngle(q) {
    q = normalize(q);
    if (q.w < 0) {
      q = { w: -q.w, x: -q.x, y: -q.y, z: -q.z };
    }
    var w = Math.max(-1, Math.min(1, q.w));
    var angle = 2 * Math.acos(w);
    var sinHalf = Math.sqrt(1 - w * w);
    if (sinHalf < 1e-8) {
      return { axis: [1, 0, 0], angle: 0 };
    }
    return {
      axis: [q.x / sinHalf, q.y / sinHalf, q.z / sinHalf],
      angle: angle
    };
  }

  function fromAxisAngle(axis, angle) {
    if (angle === 0) return { w: 1, x: 0, y: 0, z: 0 };
    var half = angle / 2;
    var s = Math.sin(half);
    return {
      w: Math.cos(half),
      x: axis[0] * s,
      y: axis[1] * s,
      z: axis[2] * s
    };
  }

  function rotation(q) {
    return [
      [
        1 - 2 * (q.y * q.y + q.z * q.z),
        2 * (q.x * q.y - q.z * q.w),
        2 * (q.x * q.z + q.y * q.w)
      ],
      [
        2 * (q.x * q.y + q.z * q.w),
        1 - 2 * (q.x * q.x + q.z * q.z),
        2 * (q.y * q.z - q.x * q.w)
      ],
      [
        2 * (q.x * q.z - q.y * q.w),
        2 * (q.y * q.z + q.x * q.w),
        1 - 2 * (q.x * q.x + q.y * q.y)
      ]
    ];
  }

  function axesFromQuaternion(q) {
    var r = rotation(q);
    return [
      [r[0][0], r[1][0], r[2][0]],
      [r[0][1], r[1][1], r[2][1]],
      [r[0][2], r[1][2], r[2][2]]
    ];
  }

  function normalizeVector(v) {
    var length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  function scaleVector(v, scale) {
    return [v[0] * scale, v[1] * scale, v[2] * scale];
  }

  function addVector(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function crossVector(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function dotVector(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function addVector(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function subtractVector(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function vectorLength(v) {
    return Math.sqrt(dotVector(v, v));
  }

  function currentTranslationProgress() {
    return translationProgressForTimeline(animation.visualProgress === undefined ? 1 : animation.visualProgress);
  }

  function rotationProgressForTimeline(t) {
    t = clamp01(t);
    return translationEnabled ? clamp01(t / 0.75) : t;
  }

  function translationProgressForTimeline(t) {
    if (!translationEnabled) return 0;
    return clamp01((clamp01(t) - 0.75) / 0.25);
  }

  function isTranslationStage(t) {
    return translationEnabled && clamp01(t) >= 0.75;
  }

  function translationAt(progress) {
    return translationEnabled ? scaleVector(translationTarget, clamp01(progress)) : [0, 0, 0];
  }

  function currentBodyOrigin() {
    return translationAt(currentTranslationProgress());
  }

  function targetBodyOrigin() {
    return translationEnabled ? translationTarget.slice() : [0, 0, 0];
  }

  function axesMatchQuaternion(vectors, q) {
    if (!q || q.w === undefined) return false;
    var expected = axesFromQuaternion(q);
    var error = 0;
    for (var i = 0; i < 3; i += 1) {
      for (var j = 0; j < 3; j += 1) error += Math.abs(vectors[i][j] - expected[i][j]);
    }
    return error < 0.002;
  }

  function inferredAxisOrigin(vectors, options) {
    if (options.origin) return options.origin;
    if (!translationEnabled) return [0, 0, 0];
    var identityAxes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    var identityError = 0;
    for (var i = 0; i < 3; i += 1) {
      for (var j = 0; j < 3; j += 1) identityError += Math.abs(vectors[i][j] - identityAxes[i][j]);
    }
    var descriptor = [options.frameLabel, options.prefix, options.labelSuffix].filter(Boolean).join(" ");
    if (descriptor === "W" || /世界|world/i.test(descriptor)) return [0, 0, 0];
    if (/B(?:₁|1)|第一|中间 1/.test(descriptor)) return translationAt(1 / 3);
    if (/B(?:₂|2)|第二|中间 2/.test(descriptor)) return translationAt(2 / 3);
    if (/B\*|目标|target/i.test(descriptor)) return targetBodyOrigin();
    if (animation.eulerStepTargets && animation.eulerStepTargets.length) {
      if (axesMatchQuaternion(vectors, animation.eulerStepTargets[0])) return translationAt(1 / 3);
      if (axesMatchQuaternion(vectors, animation.eulerStepTargets[1])) return translationAt(2 / 3);
      if (axesMatchQuaternion(vectors, animation.eulerStepTargets[2])) return targetBodyOrigin();
    }
    if (axesMatchQuaternion(vectors, animation.targetQ) && !axesMatchQuaternion(vectors, state.q)) {
      return targetBodyOrigin();
    }
    if (identityError < 0.002 && /W/.test(descriptor)) return [0, 0, 0];
    return currentBodyOrigin();
  }

  function rotateAroundAxis(v, axis, angle) {
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    var dot = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
    var cross = crossVector(axis, v);
    return [
      v[0] * c + cross[0] * s + axis[0] * dot * (1 - c),
      v[1] * c + cross[1] * s + axis[1] * dot * (1 - c),
      v[2] * c + cross[2] * s + axis[2] * dot * (1 - c)
    ];
  }

  function transformVector(q, v) {
    var r = rotation(q);
    return [
      r[0][0] * v[0] + r[0][1] * v[1] + r[0][2] * v[2],
      r[1][0] * v[0] + r[1][1] * v[1] + r[1][2] * v[2],
      r[2][0] * v[0] + r[2][1] * v[1] + r[2][2] * v[2]
    ];
  }

  function inverseTransformVector(q, v) {
    var r = rotation(q);
    return [
      r[0][0] * v[0] + r[1][0] * v[1] + r[2][0] * v[2],
      r[0][1] * v[0] + r[1][1] * v[1] + r[2][1] * v[2],
      r[0][2] * v[0] + r[1][2] * v[1] + r[2][2] * v[2]
    ];
  }

  function formatVector(v) {
    return "[ " + v.map(function (value) { return value.toFixed(3); }).join(", ") + " ]";
  }

  function slerpQuaternion(a, b, t) {
    t = clamp01(t);
    var dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
    if (dot < 0) {
      b = {
        w: -b.w,
        x: -b.x,
        y: -b.y,
        z: -b.z
      };
      dot = -dot;
    }
    if (dot > 0.9995) {
      return normalize({
        w: lerp(a.w, b.w, t),
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        z: lerp(a.z, b.z, t)
      });
    }
    var theta0 = Math.acos(dot);
    var sinTheta0 = Math.sin(theta0);
    var theta = theta0 * t;
    var sinTheta = Math.sin(theta);
    var s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    var s1 = sinTheta / sinTheta0;
    return normalize({
      w: a.w * s0 + b.w * s1,
      x: a.x * s0 + b.x * s1,
      y: a.y * s0 + b.y * s1,
      z: a.z * s0 + b.z * s1
    });
  }

  function syncInputsFromQuaternion(q) {
    var e = toEuler(q);
    ["w", "x", "y", "z"].forEach(function (key) {
      quat[key].value = format(q[key]);
    });
    ["roll", "pitch", "yaw"].forEach(function (key) {
      euler[key].value = format(unit === "deg" ? toDegrees(e[key]) : e[key]);
    });
  }

  function syncOutputs(q) {
    var e = toEuler(q);
    outQ.textContent = "[ " + [q.w, q.x, q.y, q.z].map(format).join(", ") + " ]";
    outE.textContent = "roll " + format(unit === "deg" ? toDegrees(e.roll) : e.roll) +
      " · pitch " + format(unit === "deg" ? toDegrees(e.pitch) : e.pitch) +
      " · yaw " + format(unit === "deg" ? toDegrees(e.yaw) : e.yaw) +
      (unit === "deg" ? "°" : "rad");
  }

  function syncFrameReadout(q) {
    var source;
    var target;
    var aa = axisAngle(q);
    var axisLabel = "[" + aa.axis.map(function (value) { return value.toFixed(2); }).join(", ") + "]";
    if (frameMode === "body-to-world") {
      source = probeVector;
      target = transformVector(q, source);
      frameMeaning.textContent = "q_WB：B 系坐标 → W 系坐标";
      frameExplanation.textContent = "B 系中的分量保持不变；机体系转动后，向量在世界中的方向随之改变。";
      transformDirection.textContent = "B → W";
      transformOperation.textContent = "q · p_B · q*";
      transformEquation.textContent = "p_W = q_WB ⊗ p_B ⊗ q_WB*";
      vectorSourceLabel.textContent = "v_B";
      vectorTargetLabel.textContent = "v_W";
    } else {
      source = probeVector;
      target = inverseTransformVector(q, source);
      frameMeaning.textContent = "q_WB*：W 系坐标 → B 系坐标";
      frameExplanation.textContent = "金色几何向量固定在世界中；机体系转动时，只有它在 B 系中的三个坐标分量发生变化。";
      transformDirection.textContent = "W → B";
      transformOperation.textContent = "q* · p_W · q";
      transformEquation.textContent = "p_B = q_WB* ⊗ p_W ⊗ q_WB";
      vectorSourceLabel.textContent = "v_W";
      vectorTargetLabel.textContent = "v_B";
    }
    vectorSource.textContent = formatVector(source);
    vectorTarget.textContent = formatVector(target);
    axisAngleText.textContent = aa.angle < 1e-8
      ? "轴角：恒等旋转"
      : "轴 u = " + axisLabel + " · θ = " + toDegrees(aa.angle).toFixed(1) + "°";
  }

  function describeEulerStage() {
    var timelineProgress = clamp01(animation.visualProgress === undefined ? 1 : animation.visualProgress);
    if (isTranslationStage(timelineProgress) && animation.lastTarget) {
      return "阶段 4/4（平移）· " + (translationProgressForTimeline(timelineProgress) * 100).toFixed(1) + "%";
    }
    if (!isSegmentedAnimation()) {
      if (!animation.lastTarget) return "--";
      if (animation.angle < 1e-8) return "轴角 · 恒等旋转";
      return "轴角 · " + toDegrees(animation.angle * rotationProgressForTimeline(timelineProgress)).toFixed(1) + "° / " + toDegrees(animation.angle).toFixed(1) + "°";
    }
    if (!state.running && !animation.running && animation.eulerSegment === 0) {
      return "--";
    }
    if (animation.micro) {
      return "微动 1/3（roll）";
    }
    var stage = animation.eulerSegment || 0;
    var totalStages = translationEnabled ? 4 : 3;
    if (stage <= 0) return "0/" + totalStages;
    if (stage === 1) return "1/" + totalStages + "（绕 Z · yaw）";
    if (stage === 2) return "2/" + totalStages + "（绕 Y′ · pitch）";
    return "3/" + totalStages + "（绕 X″ · roll）";
  }

  function syncStageTimeline() {
    var target = animation.endEuler || toEuler(animation.targetQ || state.q);
    var angleValues = { yaw: target.yaw, pitch: target.pitch, roll: target.roll };
    Object.keys(angleValues).forEach(function (key) {
      var output = root.querySelector('[data-stage-angle="' + key + '"]');
      if (!output) return;
      output.textContent = unit === "deg"
        ? toDegrees(angleValues[key]).toFixed(1) + "°"
        : angleValues[key].toFixed(3) + " rad";
    });
    var segmented = isSegmentedAnimation();
    if (stageTimeline) stageTimeline.classList.toggle("is-axis-mode", !segmented);
    stageCards.forEach(function (card) {
      var step = Number(card.dataset.stageCard);
      var active = segmented && animation.running && animation.eulerSegment === step;
      var done = segmented && !!animation.lastTarget && ((!animation.running && animation.eulerSegment >= step) || animation.eulerSegment > step);
      card.classList.toggle("is-active", active);
      card.classList.toggle("is-done", done);
      if (active) card.setAttribute("aria-current", "step");
      else card.removeAttribute("aria-current");
    });
  }

  function refreshStageLabel() {
    if (stageText) stageText.textContent = "阶段: " + describeEulerStage();
    syncStageTimeline();
  }

  function syncState(q, syncInputs) {
    state.q = q;
    if (syncInputs !== false) {
      syncInputsFromQuaternion(q);
    }
    syncOutputs(q);
    syncFrameReadout(q);
    draw(q);
    if (progressBar) {
      progressBar.value = animationProgress();
    }
    refreshStageLabel();
    updateControlStatus();
  }

  function animationProgress() {
    if (!state.running || !animation.running || animation.startTime <= 0) return 0;
    var d = getDuration();
    if (d <= 0) return 0;
    return clamp01((performance.now() - animation.startTime) / d) * 100;
  }

  function inverseEaseOutCubic(t) {
    return 1 - Math.pow(1 - clamp01(t), 1 / 3);
  }

  function scrubberDescription(t) {
    t = clamp01(t);
    if (translationEnabled && isSegmentedAnimation()) {
      if (t <= 0) return "t = 0：B₀ 与世界系 W 对齐，原点均位于 O_W。";
      if (t < 0.25) return "阶段 1/4：绕初始 Z 轴执行 yaw；机体系原点保持在 O_W。";
      if (t < 0.5) return "阶段 2/4：绕当前 Y′ 轴执行 pitch；机体系原点仍保持在 O_W。";
      if (t < 0.75) return "阶段 3/4：绕当前 X″ 轴执行 roll；到 t = 0.75 时旋转完成。";
      if (t < 1) return "阶段 4/4：姿态保持最终值，仅将 O_B 从 O_W 线性平移到目标位置。";
      return "t = 1：旋转和平移全部完成，当前机体系 B 已到达最终 B*。";
    }
    if (translationEnabled) {
      if (t <= 0) return "t = 0：B₀ 与世界系 W 对齐，原点均位于 O_W。";
      if (t < 0.75) return "合成轴角旋转阶段：原点保持在 O_W，旋转已完成 " + (rotationProgressForTimeline(t) * 100).toFixed(1) + "% 。";
      if (t < 1) return "阶段 4/4：合成旋转已经完成，姿态保持不变，仅执行线性平移。";
      return "t = 1：旋转和平移全部完成，当前机体系 B 已到达最终 B*。";
    }
    if (!isSegmentedAnimation()) {
      return t <= 0
        ? "t = 0：B₀ 与 W 对齐；拖动滑块可沿合成旋转轴检查姿态。"
        : t >= 1
          ? "t = 1：已到达目标机体系 B*。"
          : "合成轴角路径：已完成 " + (t * 100).toFixed(1) + "% 的旋转。";
    }
    if (t <= 0) return "t = 0：机体系初始姿态 B₀ 与世界系 W 对齐，并不是同一个坐标系对象。";
    if (t < 1 / 3) return "第 1 段：正在绕初始 Z 轴执行 yaw。";
    if (t < 2 / 3) return "第 2 段：yaw 已完成，正在绕当前 Y′ 轴执行 pitch。";
    if (t < 1) return "第 3 段：yaw、pitch 已完成，正在绕当前 X″ 轴执行 roll。";
    return "t = 1：三段旋转全部完成，当前机体系 B 已到达目标 B*。";
  }

  function syncScrubber(t) {
    t = clamp01(t);
    if (scrubber) scrubber.value = t.toFixed(3);
    if (scrubberValue) scrubberValue.textContent = "t = " + t.toFixed(3);
    if (scrubberHelp) scrubberHelp.textContent = scrubberDescription(t);
  }

  function samplePoseAtTimeline(t) {
    var rotationProgress = rotationProgressForTimeline(t);
    var current;
    var segment = 0;
    var localProgress = rotationProgress;
    if (isSegmentedAnimation()) {
      var sampled = sampleEulerBySegmentProgress(animation.startEuler, animation.startQ, animation.endEuler, rotationProgress);
      current = sampled.q;
      segment = isTranslationStage(t) ? 4 : sampled.segment;
      localProgress = isTranslationStage(t) ? translationProgressForTimeline(t) : sampled.localProgress;
    } else {
      current = animation.angle < 1e-10
        ? animation.targetQ
        : normalize(multiply(fromAxisAngle(animation.axis, animation.angle * rotationProgress), animation.startQ));
      segment = isTranslationStage(t) ? 4 : 0;
      localProgress = isTranslationStage(t) ? translationProgressForTimeline(t) : rotationProgress;
    }
    return { q: current, segment: segment, localProgress: localProgress };
  }

  function scrubAnimation(t) {
    if (!animation.lastTarget || !animation.lastStartQ) return;
    t = clamp01(t);
    animation.visualProgress = t;
    var start = animation.lastStartQ;
    var target = animation.lastTarget;
    var mode = animation.lastMode;
    stopAnimation();
    animation.mode = mode;
    animation.startQ = start;
    animation.targetQ = target;
    animation.startEuler = toEuler(start);
    if (mode !== "euler") animation.endEuler = toEuler(target);
    var relative = axisAngle(multiply(target, inverse(start)));
    animation.axis = relative.axis;
    animation.angle = relative.angle;
    animation.eulerStepTargets = isSegmentedAnimation() ? eulerStepTargets(animation.startEuler, animation.endEuler) : [];
    animation.visualProgress = t;
    animation.scrubbing = true;
    var sampledPose = samplePoseAtTimeline(t);
    var current = sampledPose.q;
    animation.eulerSegment = sampledPose.segment;
    animation.segmentProgress = sampledPose.localProgress;
    captureCompletedStageSnapshots(rotationProgressForTimeline(t));
    state.running = true;
    animation.running = true;
    animation.paused = true;
    animation.pausedElapsed = inverseEaseOutCubic(t) * getDuration();
    syncState(current, false);
    syncScrubber(t);
    if (progressBar) progressBar.value = inverseEaseOutCubic(t) * 100;
    msg.textContent = "已暂停在 t = " + t.toFixed(3) + "；可继续拖动，或点击“继续”从这里播放。";
    updateControlStatus();
  }

  function cameraBasis() {
    var cosElevation = Math.cos(camera.pitch);
    var direction = [
      cosElevation * Math.cos(camera.yaw),
      cosElevation * Math.sin(camera.yaw),
      Math.sin(camera.pitch)
    ];
    var forward = scaleVector(direction, -1);
    var worldUp = [0, 0, 1];
    var right = normalizeVector(crossVector(forward, worldUp));
    var screenUp = normalizeVector(crossVector(right, forward));
    return { direction: direction, forward: forward, right: right, screenUp: screenUp };
  }

  function withCamera(v) {
    var basis = cameraBasis();
    var direction = basis.direction;
    var right = basis.right;
    var screenUp = basis.screenUp;
    return [dotVector(v, right), dotVector(v, screenUp), dotVector(v, direction)];
  }

  function projectPoint(v) {
    var p = withCamera(v);
    var scale = Math.min(canvas.width, canvas.height) * 0.32;
    var perspective = camera.zoom * Math.max(0.72, Math.min(1.28, 1 + p[2] * 0.08));
    return [
      canvas.width / 2 + p[0] * scale * perspective,
      canvas.height / 2 + 34 - p[1] * scale * perspective
    ];
  }

  function canvasPointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return [
      (event.clientX - rect.left) * canvas.width / rect.width,
      (event.clientY - rect.top) * canvas.height / rect.height
    ];
  }

  function currentProbeWorldVector(q) {
    return frameMode === "body-to-world" ? transformVector(q, probeVector) : probeVector.slice();
  }

  function screenDeltaToWorld(dx, dy, worldPoint) {
    var basis = cameraBasis();
    var depth = withCamera(worldPoint)[2];
    var scale = Math.min(canvas.width, canvas.height) * 0.32;
    var perspective = camera.zoom * Math.max(0.72, Math.min(1.28, 1 + depth * 0.08));
    var worldPerPixel = 1 / Math.max(1, scale * perspective);
    return addVector(
      scaleVector(basis.right, dx * worldPerPixel),
      scaleVector(basis.screenUp, -dy * worldPerPixel)
    );
  }

  function clampProbeVector(value) {
    var length = vectorLength(value);
    if (length < 0.08) return scaleVector(normalizeVector(value), 0.08);
    if (length > 1.65) return scaleVector(value, 1.65 / length);
    return value;
  }

  function syncProbeVectorReadout() {
    if (!probeVectorReadout) return;
    probeVectorReadout.textContent = (frameMode === "body-to-world" ? "v_B = " : "v_W = ") + formatVector(probeVector);
  }

  function miniProjection(point, origin, scale) {
    var right = [0.70710678, -0.70710678, 0];
    var up = [-0.40824829, -0.40824829, 0.81649658];
    return [origin[0] + dotVector(point, right) * scale, origin[1] - dotVector(point, up) * scale];
  }

  function drawMiniArrow(context, from, to, color, width, alpha) {
    var angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    context.save();
    context.globalAlpha = alpha === undefined ? 1 : alpha;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = width || 2;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(from[0], from[1]);
    context.lineTo(to[0], to[1]);
    context.stroke();
    context.beginPath();
    context.moveTo(to[0], to[1]);
    context.lineTo(to[0] - Math.cos(angle - 0.5) * 7, to[1] - Math.sin(angle - 0.5) * 7);
    context.lineTo(to[0] - Math.cos(angle + 0.5) * 7, to[1] - Math.sin(angle + 0.5) * 7);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawStageSnapshot(canvasElement, q, index, placeholder) {
    if (!canvasElement) return;
    var context = canvasElement.getContext("2d");
    var width = canvasElement.width;
    var height = canvasElement.height;
    var origin = [width * 0.5, height * 0.62];
    var colors = ["#ff816f", "#73d8b4", "#78aaff"];
    context.clearRect(0, 0, width, height);
    var gradient = context.createRadialGradient(width * .48, height * .52, 4, width * .48, height * .52, height * .82);
    gradient.addColorStop(0, "#12313c");
    gradient.addColorStop(1, "#07151d");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (axis, axisIndex) {
      var worldEnd = miniProjection(scaleVector(axis, .78), origin, 55);
      context.save();
      context.setLineDash([4, 4]);
      context.strokeStyle = "rgba(173,205,209,.28)";
      context.beginPath();
      context.moveTo(origin[0], origin[1]);
      context.lineTo(worldEnd[0], worldEnd[1]);
      context.stroke();
      context.restore();
      var bodyAxis = axesFromQuaternion(q)[axisIndex];
      var bodyEnd = miniProjection(scaleVector(bodyAxis, .92), origin, 55);
      drawMiniArrow(context, origin, bodyEnd, colors[axisIndex], 3, placeholder ? .35 : 1);
      context.fillStyle = colors[axisIndex];
      context.globalAlpha = placeholder ? .42 : 1;
      context.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillText(["X", "Y", "Z"][axisIndex] + "_B", bodyEnd[0] + 5, bodyEnd[1] - 4);
      context.globalAlpha = 1;
    });
    context.fillStyle = placeholder ? "#6f8991" : "#f1bd8c";
    context.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(placeholder ? "等待经过分段边界" : ["Z / YAW", "Y′ / PITCH", "X″ / ROLL"][index], 10, 17);
  }

  function resetStageSnapshots(available) {
    snapshotCaptured = [false, false, false];
    snapshotCards.forEach(function (card, index) {
      card.dataset.state = available ? "waiting" : "unavailable";
      if (snapshotStatuses[index]) snapshotStatuses[index].textContent = available ? "等待本轮经过边界" : "仅三段 ZYX 路径记录";
      if (snapshotValues[index]) snapshotValues[index].textContent = "—";
      drawStageSnapshot(snapshotCanvases[index], { w: 1, x: 0, y: 0, z: 0 }, index, true);
    });
  }

  function captureStageSnapshot(index, q) {
    if (snapshotCaptured[index] || !snapshotCards[index]) return;
    snapshotCaptured[index] = true;
    snapshotCards[index].dataset.state = "captured";
    if (snapshotStatuses[index]) snapshotStatuses[index].textContent = "已记录本轮真实边界姿态";
    if (snapshotValues[index]) {
      snapshotValues[index].textContent = "q = [" + [q.w, q.x, q.y, q.z].map(function (value) { return value.toFixed(3); }).join(", ") + "]";
    }
    drawStageSnapshot(snapshotCanvases[index], q, index, false);
  }

  function captureCompletedStageSnapshots(rotationProgress) {
    if (!isSegmentedAnimation() || animation.eulerStepTargets.length !== 3) return;
    [1 / 3, 2 / 3, 1].forEach(function (boundary, index) {
      if (rotationProgress + 1e-9 >= boundary) captureStageSnapshot(index, animation.eulerStepTargets[index]);
    });
  }

  function drawArrowHead(from, to, color, size) {
    var angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to[0], to[1]);
    ctx.lineTo(to[0] - Math.cos(angle - 0.48) * size, to[1] - Math.sin(angle - 0.48) * size);
    ctx.lineTo(to[0] - Math.cos(angle + 0.48) * size, to[1] - Math.sin(angle + 0.48) * size);
    ctx.closePath();
    ctx.fill();
  }

  function drawLine3D(start, end, options) {
    var a = projectPoint(start);
    var b = projectPoint(end);
    ctx.save();
    ctx.globalAlpha = options.alpha === undefined ? 1 : options.alpha;
    ctx.setLineDash(options.dashed || []);
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.lineWidth || 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    if (options.arrow) drawArrowHead(a, b, options.color, options.arrowSize || 9);
    ctx.restore();
    return { start: a, end: b };
  }

  function drawAxisSet(vectors, options) {
    var colors = options.colors || ["#ff816f", "#73d8b4", "#78aaff"];
    var names = ["X", "Y", "Z"];
    var origin = options.origin || [0, 0, 0];
    vectors.forEach(function (axis, index) {
      var line = drawLine3D(origin, addVector(origin, scaleVector(axis, options.length || 1)), {
        color: colors[index],
        lineWidth: options.lineWidth || 3,
        dashed: options.dashed || [],
        alpha: options.alpha,
        arrow: options.arrow !== false,
        arrowSize: options.arrowSize || 8
      });
      if (options.labels) {
        ctx.save();
        ctx.globalAlpha = options.alpha === undefined ? 1 : options.alpha;
        ctx.fillStyle = colors[index];
        ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(names[index] + "_" + options.suffix, line.end[0] + 8, line.end[1] - 7);
        ctx.restore();
      }
      if (index === 2 && options.frameLabel) {
        ctx.save();
        ctx.globalAlpha = options.alpha === undefined ? 1 : options.alpha;
        ctx.fillStyle = options.frameColor || colors[index];
        ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(options.frameLabel, line.end[0] + 7, line.end[1] + 11);
        ctx.restore();
      }
    });
  }

  function drawGroundGrid() {
    var gridColor = "rgba(139, 180, 184, .09)";
    for (var i = -4; i <= 4; i += 1) {
      var value = i / 4;
      drawLine3D([-1.18, value, 0], [1.18, value, 0], { color: gridColor, lineWidth: 1 });
      drawLine3D([value, -1.18, 0], [value, 1.18, 0], { color: gridColor, lineWidth: 1 });
    }
    drawTranslationGeometry();
  }

  function drawCanvasLabel(point, label, color, offsetX, offsetY) {
    var projected = projectPoint(point);
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(label, projected[0] + (offsetX || 7), projected[1] + (offsetY || -8));
    ctx.restore();
  }

  function drawTranslationGeometry() {
    var origin = currentBodyOrigin();
    var target = targetBodyOrigin();
    var originLength = vectorLength(origin);
    var targetLength = vectorLength(target);
    drawCanvasLabel([0, 0, 0], translationEnabled ? "O_W" : "O_W = O_B", "#d6e5e7", 7, 17);
    if (!translationEnabled) return;
    if (targetLength > 0.002 && vectorLength(subtractVector(target, origin)) > 0.002) {
      drawLine3D([0, 0, 0], target, {
        color: "#e6c889",
        lineWidth: 2,
        dashed: [7, 6],
        alpha: 0.42,
        arrow: true,
        arrowSize: 8
      });
      drawCanvasLabel(target, "O_B*", "rgba(230, 200, 137, .8)", 8, -8);
    }
    if (originLength > 0.002) {
      var line = drawLine3D([0, 0, 0], origin, {
        color: "#f4c96b",
        lineWidth: 3,
        arrow: true,
        arrowSize: 10
      });
      ctx.save();
      ctx.fillStyle = "#f7d98e";
      ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText("t_WB", (line.start[0] + line.end[0]) / 2 + 7, (line.start[1] + line.end[1]) / 2 - 7);
      ctx.restore();
    }
    drawCanvasLabel(origin, "O_B(t)", "#f7d98e", 8, 17);
  }

  function drawRotationArcArrow3D(geometry, origin) {
    var angle = Math.min(Math.abs(geometry.angle), Math.PI * 1.92);
    if (angle < 0.025) return;
    var axis = normalizeVector(geometry.axis);
    var helper = Math.abs(axis[2]) < 0.82 ? [0, 0, 1] : [0, 1, 0];
    var radial = scaleVector(normalizeVector(crossVector(axis, helper)), 0.43);
    var points = [];
    var steps = Math.max(12, Math.ceil(angle * 20));
    for (var i = 0; i <= steps; i += 1) {
      points.push(projectPoint(addVector(origin, rotateAroundAxis(radial, axis, angle * i / steps))));
    }
    ctx.save();
    ctx.strokeStyle = "#ffb26f";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var p = 1; p < points.length; p += 1) ctx.lineTo(points[p][0], points[p][1]);
    ctx.stroke();
    var tip = points[points.length - 1];
    var previous = points[Math.max(0, points.length - 2)];
    for (var k = points.length - 2; k >= 0; k -= 1) {
      previous = points[k];
      var dx = tip[0] - previous[0];
      var dy = tip[1] - previous[1];
      if (dx * dx + dy * dy > 20) break;
    }
    drawArrowHead(previous, tip, "#ffb26f", 10);
    ctx.restore();
  }

  function drawRotationGeometry(q) {
    var aa = currentSegmentGeometry() || axisAngle(q);
    var targetAngle = aa.targetAngle === undefined ? aa.angle : aa.targetAngle;
    if (targetAngle < 0.02) return;
    var rotationOrigin = currentBodyOrigin();
    drawRotationArcArrow3D(aa, rotationOrigin);
    drawLine3D(addVector(rotationOrigin, scaleVector(aa.axis, -1.18)), addVector(rotationOrigin, scaleVector(aa.axis, 1.18)), {
      color: "#f0ac77",
      lineWidth: 1.5,
      dashed: [7, 6],
      alpha: .78,
      arrow: true,
      arrowSize: 7
    });
    var axisEnd = projectPoint(scaleVector(aa.axis, 1.18));
    ctx.fillStyle = "#f4bd8f";
    ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(aa.label || "u", axisEnd[0] + 7, axisEnd[1] + 4);

    if (aa.angle < 0.005) return;

    var helper = Math.abs(aa.axis[2]) < .86 ? [0, 0, 1] : [0, 1, 0];
    var radial = scaleVector(normalizeVector(crossVector(aa.axis, helper)), .62);
    var points = [];
    var steps = Math.max(12, Math.ceil(aa.angle * 18));
    for (var step = 0; step <= steps; step += 1) {
      points.push(projectPoint(rotateAroundAxis(radial, aa.axis, aa.angle * step / steps)));
    }
    ctx.save();
    ctx.strokeStyle = "rgba(240, 172, 119, .9)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    });
    ctx.stroke();
    drawArrowHead(points[points.length - 2], points[points.length - 1], "#f0ac77", 8);
    var middle = points[Math.floor(points.length / 2)];
    ctx.fillStyle = "#f5c69f";
    ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(aa.label
      ? aa.label + " · " + toDegrees(aa.angle).toFixed(1) + "° / " + toDegrees(targetAngle).toFixed(1) + "°"
      : "q_WB · " + toDegrees(aa.angle).toFixed(1) + "°", middle[0] + 8, middle[1] - 8);
    ctx.restore();
  }

  function currentSegmentGeometry() {
    if (!animation.running || !isSegmentedAnimation() || !animation.eulerStepTargets.length) return null;
    var stage = Math.max(1, Math.min(3, animation.eulerSegment || 1));
    var deltas = [
      wrapPi(animation.endEuler.yaw - animation.startEuler.yaw),
      wrapPi(animation.endEuler.pitch - animation.startEuler.pitch),
      wrapPi(animation.endEuler.roll - animation.startEuler.roll)
    ];
    var before = stage === 1 ? animation.startQ : animation.eulerStepTargets[stage - 2];
    var axisIndex = [2, 1, 0][stage - 1];
    var axis = axesFromQuaternion(before)[axisIndex];
    var signedAngle = deltas[stage - 1];
    if (signedAngle < 0) axis = scaleVector(axis, -1);
    return {
      axis: normalizeVector(axis),
      angle: Math.abs(signedAngle) * animation.segmentProgress,
      targetAngle: Math.abs(signedAngle),
      label: ["Z", "Y′", "X″"][stage - 1]
    };
  }

  function drawVectorDecomposition(q) {
    updateTranslationReadout(q);
    drawPointTransform(q);
    var bodyAxes = axesFromQuaternion(q);
    var coordinates;
    var worldVector;
    if (frameMode === "body-to-world") {
      coordinates = probeVector;
      worldVector = transformVector(q, probeVector);
    } else {
      worldVector = probeVector;
      coordinates = inverseTransformVector(q, worldVector);
    }

    var componentColors = ["rgba(255,129,111,.9)", "rgba(115,216,180,.9)", "rgba(120,170,255,.9)"];
    var point = [0, 0, 0];
    coordinates.forEach(function (component, index) {
      var next = addVector(point, scaleVector(bodyAxes[index], component));
      var line = drawLine3D(point, next, {
        color: componentColors[index],
        lineWidth: 2.3,
        dashed: [5, 4],
        alpha: .9
      });
      var midpoint = [(line.start[0] + line.end[0]) / 2, (line.start[1] + line.end[1]) / 2];
      ctx.fillStyle = componentColors[index];
      ctx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(component.toFixed(2) + "·" + ["x_B", "y_B", "z_B"][index], midpoint[0] + 5, midpoint[1] - 5);
      point = next;
    });

    var vectorLine = drawLine3D([0, 0, 0], worldVector, {
      color: "#ffd36f",
      lineWidth: 5,
      arrow: true,
      arrowSize: 12
    });
    ctx.fillStyle = "#ffe29a";
    ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(frameMode === "body-to-world" ? "v_W = R·v_B" : "v_W · fixed", vectorLine.end[0] + 10, vectorLine.end[1] + 5);
    probeHandleScreen = vectorLine.end.slice();
    ctx.save();
    ctx.fillStyle = "#07151d";
    ctx.strokeStyle = "#fff0af";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(255,211,111,.55)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(probeHandleScreen[0], probeHandleScreen[1], vectorDragging.active ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    syncProbeVectorReadout();
  }

  function formatVector(v) {
    return "[" + v.map(function (value) { return value.toFixed(3); }).join(", ") + "]";
  }

  function updateTranslationReadout(q) {
    if (!translationReadout) return;
    var translation = currentBodyOrigin();
    var text = "当前 t_WB^W = " + formatVector(translation) + "（世界坐标表达）。自由向量仍满足 v_W = R_WB v_B，不受平移影响。";
    if (frameMode === "body-to-world") {
      var pointWorld = addVector(transformVector(q, probeVector), translation);
      text += " 点变换：p_W = R_WB p_B + t_WB = " + formatVector(pointWorld) + "。";
    } else {
      var pointBody = inverseTransformVector(q, subtractVector(probeVector, translation));
      text += " 点变换：p_B = R_WB^T(p_W - t_WB) = " + formatVector(pointBody) + "。";
    }
    translationReadout.textContent = text;
  }

  function drawPointTransform(q) {
    if (!translationEnabled) return;
    var origin = currentBodyOrigin();
    var pointWorld = frameMode === "body-to-world"
      ? addVector(origin, transformVector(q, probeVector))
      : probeVector;
    drawLine3D(origin, pointWorld, {
      color: "#80dce6",
      lineWidth: 2.5,
      dashed: [4, 4],
      alpha: 0.9,
      arrow: true,
      arrowSize: 8
    });
    var projected = projectPoint(pointWorld);
    ctx.save();
    ctx.fillStyle = "#b9f2f4";
    ctx.beginPath();
    ctx.arc(projected[0], projected[1], 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("p_W", projected[0] + 8, projected[1] - 8);
    ctx.restore();
  }

  function draw(q) {
    if (!ctx) return;
    var w = canvas.width;
    var h = canvas.height;
    var referenceAxes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    var currentAxes = axesFromQuaternion(q);
    ctx.clearRect(0, 0, w, h);
    var background = ctx.createRadialGradient(w * .48, h * .48, 10, w * .48, h * .48, h * .72);
    background.addColorStop(0, "#102b36");
    background.addColorStop(.58, "#0b1d27");
    background.addColorStop(1, "#07151d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);

    drawGroundGrid();

    if (animation.lastStartQ) {
      drawAxisSet(axesFromQuaternion(animation.lastStartQ), {
        origin: [0, 0, 0],
        length: .88,
        frameLabel: "B₀",
        frameColor: "#f0ac77",
        colors: ["#f0ac77", "#f0ac77", "#f0ac77"],
        lineWidth: 1.5,
        dashed: [5, 5],
        alpha: .48,
        arrow: false
      });
    }

    if (animation.running) {
      var target = animation.targetQ;
      var translating = isTranslationStage(animation.visualProgress);
      var targetOrigin = translationEnabled && !translating ? [0, 0, 0] : targetBodyOrigin();
      var targetFrameLabel = translationEnabled && !translating ? "B_R" : "B*";
      if (isSegmentedAnimation() && animation.eulerStepTargets.length) {
        if (translating) {
          target = animation.targetQ;
          targetOrigin = targetBodyOrigin();
          targetFrameLabel = "B*";
        } else {
          var segment = Math.max(0, Math.min(2, (animation.eulerSegment || 1) - 1));
          target = animation.eulerStepTargets[segment] || animation.targetQ;
          targetOrigin = [0, 0, 0];
          targetFrameLabel = segment < 2 ? "B" + (segment + 1) : "B_R";
        }
      }
      drawAxisSet(axesFromQuaternion(target), {
        origin: targetOrigin,
        length: 1.03,
        frameLabel: targetFrameLabel,
        frameColor: "#93b7ff",
        colors: ["#93b7ff", "#93b7ff", "#93b7ff"],
        lineWidth: 1.8,
        dashed: [2, 5],
        alpha: .56,
        arrow: false
      });
    }

    if (!isTranslationStage(animation.visualProgress)) drawRotationGeometry(q);
    drawAxisSet(currentAxes, {
      origin: currentBodyOrigin(),
      length: 1,
      labels: true,
      suffix: "B",
      colors: ["#ff816f", "#73d8b4", "#78aaff"],
      lineWidth: 4,
      arrowSize: 10
    });
    drawVectorDecomposition(q);

    drawAxisSet(referenceAxes, {
      origin: [0, 0, 0],
      length: 1.2,
      labels: true,
      suffix: "W",
      colors: ["rgba(255,129,111,.62)", "rgba(115,216,180,.62)", "rgba(120,170,255,.62)"],
      lineWidth: 2.2,
      dashed: [8, 6],
      arrowSize: 7
    });

    var worldOrigin = projectPoint([0, 0, 0]);
    ctx.save();
    ctx.strokeStyle = "rgba(234,246,245,.9)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(worldOrigin[0], worldOrigin[1], 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(worldOrigin[0] - 10, worldOrigin[1]);
    ctx.lineTo(worldOrigin[0] + 10, worldOrigin[1]);
    ctx.moveTo(worldOrigin[0], worldOrigin[1] - 10);
    ctx.lineTo(worldOrigin[0], worldOrigin[1] + 10);
    ctx.stroke();
    ctx.fillStyle = "rgba(226, 244, 241, .78)";
    ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("O_W · 固定", worldOrigin[0] + 12, worldOrigin[1] + 18);

    var bodyOriginVector = currentBodyOrigin();
    var bodyOrigin = projectPoint(bodyOriginVector);
    var timelineProgress = clamp01(animation.visualProgress === undefined ? 1 : animation.visualProgress);
    var originsCoincide = !translationEnabled || currentTranslationProgress() <= 0.0005;
    var atTimelineStart = timelineProgress <= 0.0005;
    ctx.fillStyle = originsCoincide ? "#eaf6f5" : "#f0ac77";
    ctx.beginPath();
    ctx.arc(bodyOrigin[0], bodyOrigin[1], 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "800 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    var bodyOriginLabel = !translationEnabled || atTimelineStart
      ? "O_B(0) = O_W"
      : originsCoincide
        ? "O_B(t) = O_W · 仅旋转"
        : "O_B(t) · 运动";
    ctx.fillText(bodyOriginLabel, bodyOrigin[0] + 10, bodyOrigin[1] - 12);
    if (translationEnabled && !originsCoincide) {
      var translationLabelPoint = projectPoint(scaleVector(bodyOriginVector, .5));
      ctx.fillStyle = "rgba(240,172,119,.95)";
      ctx.fillText("t_WB(t): O_W → O_B", translationLabelPoint[0] + 8, translationLabelPoint[1] - 9);
    }
    ctx.restore();

    ctx.fillStyle = "#dff5ef";
    ctx.font = "800 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("世界系 W 固定  |  仅 B 随 R、t 运动", 22, 31);
    ctx.fillStyle = "rgba(151, 181, 186, .78)";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(frameMode === "body-to-world" ? "B → W / vector follows frame" : "W → B / vector stays fixed", 22, 49);
    ctx.fillText("R columns = body axes expressed in world", 22, 66);
  }

  function eulerStepTargets(startEuler, endEuler) {
    var dr = wrapPi(endEuler.roll - startEuler.roll);
    var dp = wrapPi(endEuler.pitch - startEuler.pitch);
    var dy = wrapPi(endEuler.yaw - startEuler.yaw);
    return [
      fromEulerState({
        roll: startEuler.roll,
        pitch: startEuler.pitch,
        yaw: startEuler.yaw + dy
      }),
      fromEulerState({
        roll: startEuler.roll,
        pitch: startEuler.pitch + dp,
        yaw: startEuler.yaw + dy
      }),
      fromEulerState({
        roll: startEuler.roll + dr,
        pitch: startEuler.pitch + dp,
        yaw: startEuler.yaw + dy
      })
    ];
  }

  function sampleEulerBySegmentProgress(startEuler, startQ, endEuler, progress) {
    var dr = wrapPi(endEuler.roll - startEuler.roll);
    var dp = wrapPi(endEuler.pitch - startEuler.pitch);
    var dy = wrapPi(endEuler.yaw - startEuler.yaw);
    var q1 = fromEulerState({
      roll: startEuler.roll,
      pitch: startEuler.pitch,
      yaw: startEuler.yaw + dy
    });
    var q2 = fromEulerState({
      roll: startEuler.roll,
      pitch: startEuler.pitch + dp,
      yaw: startEuler.yaw + dy
    });
    var q3 = fromEulerState({
      roll: startEuler.roll + dr,
      pitch: startEuler.pitch + dp,
      yaw: startEuler.yaw + dy
    });
    var seg = 1 / 3;
    var t = clamp01(progress);
    var segment = 1;
    if (t <= seg) {
      var s1 = t / seg;
      return { q: slerpQuaternion(startQ, q1, s1), segment: 1, localProgress: s1 };
    }
    if (t <= seg * 2) {
      var s2 = (t - seg) / seg;
      return { q: slerpQuaternion(q1, q2, s2), segment: 2, localProgress: s2 };
    }
    var s3 = (t - seg * 2) / seg;
    return { q: slerpQuaternion(q2, q3, s3), segment: 3, localProgress: s3 };
  }

  function animateTick(now) {
    if (!state.running || !animation.running || animation.paused) return;
    var duration = getDuration();
    var progress = clamp01((now - animation.startTime) / duration);
    var p = easeOutCubic(progress);
    animation.visualProgress = p;
    animation.scrubbing = false;
    syncScrubber(p);
    var uiProgress = Math.round(progress * 100);
    var sampledPose = samplePoseAtTimeline(p);
    var current = sampledPose.q;
    animation.eulerSegment = sampledPose.segment;
    animation.segmentProgress = sampledPose.localProgress;
    captureCompletedStageSnapshots(rotationProgressForTimeline(p));

    syncState(current, false);
    if (progressBar) {
      progressBar.value = uiProgress;
    }
    if (isTranslationStage(p)) {
      msg.textContent = "阶段 4/4：旋转已完成，姿态保持不变，仅执行平移（" + (translationProgressForTimeline(p) * 100).toFixed(1) + "%）。";
      refreshStageLabel();
    } else if (isSegmentedAnimation()) {
      if (animation.eulerSegment >= 1 && animation.eulerSegment <= 3) {
        var stageNames = ["", "绕初始 Z 轴 · yaw", "绕当前 Y′ 轴 · pitch", "绕当前 X″ 轴 · roll"];
        var sourceName = animation.mode === "quaternion-zyx" ? "四元数等价 ZYX" : "欧拉角 ZYX";
        msg.textContent = sourceName + " 第 " + animation.eulerSegment + "/" + (translationEnabled ? 4 : 3) + " 段：" + stageNames[animation.eulerSegment];
      }
      refreshStageLabel();
    } else {
      msg.textContent = "四元数轴角插值：" + toDegrees(animation.angle * rotationProgressForTimeline(p)).toFixed(1) + "° / " + toDegrees(animation.angle).toFixed(1) + "°";
      refreshStageLabel();
    }
    if (progress < 1) {
      animation.raf = requestAnimationFrame(animateTick);
      return;
    }

    var translationCompletion = translationEnabled ? "；第 4/4 阶段平移已完成" : "";
    finishAnimation(animation.targetQ, (animation.mode === "euler"
      ? "欧拉角随动轴 ZYX 已完成（Z → Y′ → X″）"
      : animation.mode === "quaternion-zyx"
        ? "四元数的等价 ZYX 分解已完成（Z → Y′ → X″）"
        : "四元数动画已完成（按合成轴角插值）") + translationCompletion);
    if (progressBar) {
      progressBar.value = 100;
    }
  }

  function finishAnimation(target, text) {
    captureCompletedStageSnapshots(1);
    state.running = false;
    animation.running = false;
    animation.paused = false;
    animation.pausedElapsed = 0;
    animation.visualProgress = 1;
    animation.scrubbing = false;
    syncScrubber(1);
    if (animation.raf) {
      cancelAnimationFrame(animation.raf);
      animation.raf = null;
    }
    syncState(target);
    msg.textContent = text;
    animation.eulerSegment = translationEnabled ? 4 : 3;
    refreshStageLabel();
    updateControlStatus();
    if (autoLoopEnabled && animation.hasMotion) {
      msg.textContent = text + " · 稍后从起点自动重播。";
      scheduleAutoLoop(1100);
    }
  }

  function clearAutoLoopTimer() {
    if (!animation.loopTimer) return;
    window.clearTimeout(animation.loopTimer);
    animation.loopTimer = null;
  }

  function scheduleAutoLoop(delay) {
    clearAutoLoopTimer();
    if (!autoLoopEnabled || reducedMotion || !animation.hasMotion || !animation.lastStartQ || !animation.lastTarget) return;
    animation.loopTimer = window.setTimeout(function () {
      animation.loopTimer = null;
      if (!autoLoopEnabled || state.running || animation.paused) return;
      var replayStart = animation.lastStartQ;
      var replayTarget = animation.lastTarget;
      var replayMode = animation.lastMode;
      syncState(replayStart, false);
      syncInputsFromQuaternion(replayTarget);
      startAnimation(replayTarget, replayMode);
    }, delay === undefined ? 1100 : delay);
  }

  function stopAnimation() {
    clearAutoLoopTimer();
    if (!state.running && !animation.running) return;
    state.running = false;
    animation.running = false;
    animation.paused = false;
    if (animation.raf) {
      cancelAnimationFrame(animation.raf);
      animation.raf = null;
    }
  }

  function startAnimation(target, mode) {
    stopAnimation();
    animation.visualProgress = 0;
    syncScrubber(0);
    animation.mode = mode;
    animation.micro = false;
    animation.startQ = state.q;
    animation.lastStartQ = state.q;
    animation.targetQ = normalize(target);
    animation.lastMode = mode;
    animation.lastTarget = animation.targetQ;
    animation.startTime = performance.now();
    animation.paused = false;
    animation.pausedElapsed = 0;
    animation.startEuler = toEuler(animation.startQ);
    animation.endEuler = mode === "euler" ? {
      roll: toRadians(n(euler.roll)),
      pitch: toRadians(n(euler.pitch)),
      yaw: toRadians(n(euler.yaw))
    } : toEuler(animation.targetQ);
    var aa = axisAngle(multiply(animation.targetQ, inverse(animation.startQ)));
    animation.axis = aa.axis;
    animation.angle = aa.angle;
    animation.eulerSegment = 0;
    animation.eulerStepTargets = [];
    animation.visualProgress = 0;
    animation.segmentProgress = 0;
    animation.scrubbing = false;
    syncScrubber(0);
    var noChange = !isSegmentedAnimation() && animation.angle < 1e-10;
    if (isSegmentedAnimation()) {
      animation.eulerStepTargets = eulerStepTargets(animation.startEuler, animation.endEuler);
      var eDiff = Math.max(
        Math.abs(wrapPi(animation.endEuler.roll - animation.startEuler.roll)),
        Math.abs(wrapPi(animation.endEuler.pitch - animation.startEuler.pitch)),
        Math.abs(wrapPi(animation.endEuler.yaw - animation.startEuler.yaw))
      );
      if (eDiff < 1e-9) {
        noChange = true;
      }
    }
    resetStageSnapshots(isSegmentedAnimation());
    animation.hasMotion = !noChange;
    if (progressBar) {
      progressBar.value = 0;
    }

    if (noChange) {
      finishAnimation(animation.targetQ, "输入姿态与当前姿态相同；未制造虚假的旋转动画。");
      if (progressBar) progressBar.value = 100;
      return;
    }
    if (reducedMotion) {
      finishAnimation(animation.targetQ, "已按“减少动态效果”设置直接显示目标姿态；起点、轴角和向量分解仍保留。");
      if (progressBar) progressBar.value = 100;
      return;
    }

    state.running = true;
    animation.running = true;
    animation.startTime = performance.now();
    msg.textContent = animation.mode === "euler"
      ? "欧拉角随动轴 ZYX：Z → Y′ → X″..."
      : animation.mode === "quaternion-zyx"
        ? "正在把输入四元数按等价 ZYX 拆成三段：Z → Y′ → X″..."
        : "四元数动画播放中（合成轴角插值）...";
    refreshStageLabel();
    updateControlStatus();
    animation.raf = requestAnimationFrame(animateTick);
  }

  function pauseAnimation() {
    if (!state.running || !animation.running || animation.paused) return;
    animation.paused = true;
    animation.pausedElapsed = performance.now() - animation.startTime;
    if (animation.raf) {
      cancelAnimationFrame(animation.raf);
      animation.raf = null;
    }
    msg.textContent = "动画已暂停。";
    refreshStageLabel();
    updateControlStatus();
  }

  function resumeAnimation() {
    if (!state.running || !animation.running || !animation.paused) return;
    animation.paused = false;
    animation.scrubbing = false;
    animation.startTime = performance.now() - animation.pausedElapsed;
    animation.raf = requestAnimationFrame(animateTick);
    msg.textContent = animation.mode === "euler"
      ? "继续播放欧拉角随动轴 ZYX：Z → Y′ → X″..."
      : animation.mode === "quaternion-zyx"
        ? "继续播放四元数的等价 ZYX 三段分解..."
        : "继续播放四元数合成轴角动画...";
    refreshStageLabel();
    updateControlStatus();
  }

  function replayAnimation() {
    if (!animation.lastTarget || !animation.lastStartQ) {
      msg.textContent = "尚未有可重放目标，请先点击一次“以欧拉角为准”或“以四元数为准”。";
      return;
    }
    var replayStart = animation.lastStartQ;
    var replayTarget = animation.lastTarget;
    var replayMode = animation.lastMode;
    syncState(replayStart, false);
    syncInputsFromQuaternion(replayTarget);
    startAnimation(replayTarget, replayMode);
  }

  function updateAutoLoopControl() {
    if (!loopButton) return;
    loopButton.disabled = !!reducedMotion;
    loopButton.classList.toggle("is-active", autoLoopEnabled);
    loopButton.setAttribute("aria-pressed", autoLoopEnabled ? "true" : "false");
    loopButton.textContent = reducedMotion
      ? "自动循环：已关闭（减少动态）"
      : "自动循环：" + (autoLoopEnabled ? "开" : "关");
  }

  function toggleAutoLoop() {
    if (reducedMotion) return;
    autoLoopEnabled = !autoLoopEnabled;
    updateAutoLoopControl();
    if (!autoLoopEnabled) {
      clearAutoLoopTimer();
      msg.textContent = state.running ? "自动循环已关闭；当前这一轮会正常播放至终点。" : "自动循环已关闭。";
      return;
    }
    if (!state.running && animation.hasMotion) {
      msg.textContent = "自动循环已开启；即将从起点重播。";
      scheduleAutoLoop(250);
    }
  }

  function updateControlStatus() {
    pauseButton.disabled = !state.running || animation.paused;
    resumeButton.disabled = !state.running || !animation.paused;
    replayButton.disabled = !animation.lastTarget;
  }

  function setUnitButtons(nextUnit) {
    unit = nextUnit;
    root.querySelectorAll("[data-unit]").forEach(function (button) {
      var active = button.dataset.unit === nextUnit;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    syncState(state.q, false);
  }

  function setFrameMode(nextMode) {
    frameMode = nextMode;
    root.querySelectorAll("[data-frame-mode]").forEach(function (button) {
      var active = button.dataset.frameMode === nextMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    syncFrameReadout(state.q);
    draw(state.q);
  }

  function setQuaternionPath(nextPath) {
    quaternionPath = nextPath;
    root.querySelectorAll("[data-quaternion-path]").forEach(function (button) {
      var active = button.dataset.quaternionPath === nextPath;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    pathDescription.textContent = nextPath === "zyx"
      ? "将输入 q 转为一组等价 ZYX 欧拉角，按随动轴 Z → Y′ → X″ 分三段播放。"
      : "使用四元数原生的合成轴角，只沿一根固定旋转轴走最短路径。";
    if (animation.lastTarget) {
      var target = animation.lastTarget;
      stopAnimation();
      syncState({ w: 1, x: 0, y: 0, z: 0 }, false);
      syncInputsFromQuaternion(target);
      startAnimation(target, nextPath === "zyx" ? "quaternion-zyx" : "quaternion");
    } else {
      syncStageTimeline();
    }
  }

  function setCameraPreset(name) {
    var presets = {
      iso: { yaw: -.85, pitch: .5, zoom: 1 },
      front: { yaw: -Math.PI / 2, pitch: 0, zoom: 1 },
      top: { yaw: -Math.PI / 2, pitch: 1.47, zoom: .92 }
    };
    var preset = presets[name] || presets.iso;
    camera.yaw = preset.yaw;
    camera.pitch = preset.pitch;
    camera.zoom = preset.zoom;
    root.querySelectorAll("[data-camera]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.camera === name);
    });
    draw(state.q);
  }

  function readSlerpQuaternion(group) {
    var values = {};
    ["w", "x", "y", "z"].forEach(function (key) {
      var input = slerpInputs[group][key];
      if (!input || input.value.trim() === "") throw new RangeError(group + " 的 " + key + " 分量不能为空。");
      values[key] = Number(input.value);
    });
    return coreNormalizeQuaternion(values);
  }

  function writeSlerpQuaternion(group, q) {
    ["w", "x", "y", "z"].forEach(function (key) {
      if (slerpInputs[group][key]) slerpInputs[group][key].value = q[key].toFixed(6);
    });
  }

  function drawSlerpFrame(context, q, origin, label, detail, emphasized) {
    var colors = ["#ff816f", "#73d8b4", "#78aaff"];
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (axis, index) {
      var rotated = rotateVectorByQuaternion(q, axis);
      var end = miniProjection(scaleVector(rotated, .9), origin, 57);
      drawMiniArrow(context, origin, end, colors[index], emphasized ? 4 : 2.5, emphasized ? 1 : .7);
    });
    context.fillStyle = emphasized ? "#ffd36f" : "#98b3b8";
    context.beginPath();
    context.arc(origin[0], origin[1], emphasized ? 5 : 4, 0, Math.PI * 2);
    context.fill();
    context.textAlign = "center";
    context.fillStyle = emphasized ? "#ffe6a5" : "#d9ecec";
    context.font = "800 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(label, origin[0], 25);
    context.fillStyle = "#78959c";
    context.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(detail, origin[0], 43);
    context.textAlign = "start";
  }

  function drawSlerpComparison(q0, qt, q1, t) {
    if (!slerpCanvas) return;
    var context = slerpCanvas.getContext("2d");
    var width = slerpCanvas.width;
    var height = slerpCanvas.height;
    context.clearRect(0, 0, width, height);
    var background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#0d2833");
    background.addColorStop(1, "#07151d");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(103,215,191,.17)";
    context.lineWidth = 2;
    context.setLineDash([5, 7]);
    context.beginPath();
    context.moveTo(width * .19, height * .72);
    context.bezierCurveTo(width * .34, height * .38, width * .66, height * .38, width * .81, height * .72);
    context.stroke();
    context.setLineDash([]);
    drawSlerpFrame(context, q0, [width * .19, height * .72], "q₀", "t = 0", false);
    drawSlerpFrame(context, qt, [width * .5, height * .66], "q(t)", "t = " + t.toFixed(3), true);
    drawSlerpFrame(context, q1, [width * .81, height * .72], "q₁", "t = 1", false);
    context.fillStyle = "rgba(103,215,191,.8)";
    context.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText("UNIT QUATERNION · SHORTEST ARC", 18, height - 16);
  }

  function updateSlerpLab() {
    if (!slerpProgress) return;
    try {
      var q0 = readSlerpQuaternion("q0");
      var q1 = readSlerpQuaternion("q1");
      var t = clamp01(Number(slerpProgress.value));
      var qt = coreSlerpQuaternion(q0, q1, t);
      var total = quaternionAngularDistance(q0, q1);
      var current = quaternionAngularDistance(q0, qt);
      var expected = total * t;
      var residual = Math.abs(current - expected);
      if (slerpProgressValue) slerpProgressValue.textContent = t.toFixed(3);
      if (slerpQuaternionOutput) {
        slerpQuaternionOutput.textContent = "[" + [qt.w, qt.x, qt.y, qt.z].map(function (value) { return value.toFixed(6); }).join(", ") + "]";
      }
      if (slerpTotalAngle) slerpTotalAngle.textContent = toDegrees(total).toFixed(3) + "°";
      if (slerpCurrentAngle) {
        slerpCurrentAngle.textContent = toDegrees(current).toFixed(3) + "° / " + (total < 1e-10 ? "同一姿态" : (current / total * 100).toFixed(1) + "%");
      }
      if (slerpSpeedCheck) {
        slerpSpeedCheck.textContent = residual < 2e-7 ? "通过 · θ(t) = t · θ总" : "误差 " + toDegrees(residual).toExponential(2) + "°";
        slerpSpeedCheck.dataset.state = residual < 2e-7 ? "pass" : "warning";
      }
      if (slerpError) {
        slerpError.hidden = true;
        slerpError.textContent = "";
      }
      drawSlerpComparison(q0, qt, q1, t);
    } catch (error) {
      if (slerpError) {
        slerpError.hidden = false;
        slerpError.textContent = error instanceof Error ? error.message : "SLERP 输入无效。";
      }
      if (slerpSpeedCheck) {
        slerpSpeedCheck.textContent = "等待有效输入";
        slerpSpeedCheck.dataset.state = "warning";
      }
    }
  }

  function updateFromInputs(source) {
    var target;
    var mode;
    if (source === "euler") {
      target = fromEuler();
      mode = "euler";
    } else {
      target = normalize({
        w: n(quat.w),
        x: n(quat.x),
        y: n(quat.y),
        z: n(quat.z)
      });
      mode = quaternionPath === "zyx" ? "quaternion-zyx" : "quaternion";
    }
    stopAnimation();
    syncState({ w: 1, x: 0, y: 0, z: 0 }, false);
    startAnimation(target, mode);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    var point = canvasPointFromEvent(event);
    var hitsVector = probeHandleScreen && Math.hypot(point[0] - probeHandleScreen[0], point[1] - probeHandleScreen[1]) <= 24;
    if (hitsVector) {
      vectorDragging.active = true;
      vectorDragging.lastX = event.clientX;
      vectorDragging.lastY = event.clientY;
      if (canvasWrap) {
        canvasWrap.classList.remove("is-dragging");
        canvasWrap.classList.add("is-vector-dragging");
      }
      msg.textContent = "正在拖动金色向量端点；当前相机视角保持不变。";
    } else {
      camera.dragging = true;
      camera.lastX = event.clientX;
      camera.lastY = event.clientY;
      if (canvasWrap) canvasWrap.classList.add("is-dragging");
    }
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (e) {}
    }
  }

  function onPointerMove(event) {
    if (vectorDragging.active) {
      event.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var dxVector = (event.clientX - vectorDragging.lastX) * canvas.width / rect.width;
      var dyVector = (event.clientY - vectorDragging.lastY) * canvas.height / rect.height;
      var worldVector = currentProbeWorldVector(state.q);
      var movedWorldVector = addVector(worldVector, screenDeltaToWorld(dxVector, dyVector, worldVector));
      probeVector = clampProbeVector(frameMode === "body-to-world"
        ? inverseTransformVector(state.q, movedWorldVector)
        : movedWorldVector);
      vectorDragging.lastX = event.clientX;
      vectorDragging.lastY = event.clientY;
      draw(state.q);
      return;
    }
    if (!camera.dragging) {
      var hoverPoint = canvasPointFromEvent(event);
      var hovering = probeHandleScreen && Math.hypot(hoverPoint[0] - probeHandleScreen[0], hoverPoint[1] - probeHandleScreen[1]) <= 24;
      if (canvasWrap) canvasWrap.classList.toggle("is-vector-hover", !!hovering);
      return;
    }
    var dx = event.clientX - camera.lastX;
    var dy = event.clientY - camera.lastY;
    camera.yaw += dx * 0.006;
    camera.pitch += dy * 0.006;
    camera.pitch = Math.max(-1.45, Math.min(1.47, camera.pitch));
    camera.lastX = event.clientX;
    camera.lastY = event.clientY;
    root.querySelectorAll("[data-camera]").forEach(function (button) {
      button.classList.remove("is-active");
    });
    draw(state.q);
  }

  function onPointerUp(event) {
    if (!camera.dragging && !vectorDragging.active) return;
    var completedVectorDrag = vectorDragging.active;
    camera.dragging = false;
    vectorDragging.active = false;
    if (canvasWrap) {
      canvasWrap.classList.remove("is-dragging");
      canvasWrap.classList.remove("is-vector-dragging");
    }
    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (e) {}
    }
    if (completedVectorDrag) {
      syncProbeVectorReadout();
      msg.textContent = "示例向量已更新为 " + formatVector(probeVector) + "；可继续拖动端点或切换 B → W / W → B 对照。";
      draw(state.q);
    }
  }

  if (canvas) {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", function () {
      if (canvasWrap && !camera.dragging && !vectorDragging.active) canvasWrap.classList.remove("is-vector-hover");
    });
    canvas.addEventListener("wheel", function (event) {
      event.preventDefault();
      camera.zoom = Math.max(0.45, Math.min(2, camera.zoom * (event.deltaY > 0 ? 0.95 : 1.06)));
      draw(state.q);
    }, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  if (probeResetButton) {
    probeResetButton.addEventListener("click", function () {
      probeVector = initialProbeVector.slice();
      syncProbeVectorReadout();
      draw(state.q);
      msg.textContent = "示例向量已恢复为默认值。";
    });
  }

  ["q0", "q1"].forEach(function (group) {
    ["w", "x", "y", "z"].forEach(function (key) {
      var input = slerpInputs[group][key];
      if (input) input.addEventListener("input", updateSlerpLab);
    });
  });
  if (slerpProgress) slerpProgress.addEventListener("input", updateSlerpLab);
  if (slerpUseCurrent) {
    slerpUseCurrent.addEventListener("click", function () {
      writeSlerpQuaternion("q1", animation.lastTarget || state.q);
      updateSlerpLab();
    });
  }

  root.querySelectorAll("[data-frame-mode]").forEach(function (button) {
    button.addEventListener("click", function () {
      setFrameMode(button.dataset.frameMode);
    });
  });
  root.querySelectorAll("[data-quaternion-path]").forEach(function (button) {
    button.addEventListener("click", function () {
      setQuaternionPath(button.dataset.quaternionPath);
    });
  });
  root.querySelectorAll("[data-camera]").forEach(function (button) {
    button.addEventListener("click", function () {
      setCameraPreset(button.dataset.camera);
    });
  });

  if (speedRange && speedText) {
    speedText.textContent = getSpeed().toFixed(1) + "x";
    speedRange.addEventListener("input", function () {
      speedText.textContent = getSpeed().toFixed(1) + "x";
    });
  }

  if (scrubber) {
    scrubber.addEventListener("input", function () {
      scrubAnimation(Number(scrubber.value));
    });
  }

  function syncTranslationControls() {
    translationEnabled = !translationToggle || translationToggle.checked;
    Object.keys(translationInputs).forEach(function (key) {
      if (translationInputs[key]) translationInputs[key].disabled = !translationEnabled;
    });
    if (translationControls) translationControls.classList.toggle("is-disabled", !translationEnabled);
    root.querySelectorAll("[data-translation-preset]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.translationPreset === activeTranslationPreset);
    });
  }

  function setTranslationTarget(values, presetName) {
    translationTarget = values.slice();
    activeTranslationPreset = presetName || "custom";
    ["x", "y", "z"].forEach(function (key, index) {
      if (translationInputs[key]) translationInputs[key].value = values[index].toFixed(2);
    });
    syncTranslationControls();
    draw(state.q);
  }

  if (translationToggle) {
    translationToggle.addEventListener("change", function () {
      translationEnabled = translationToggle.checked;
      syncTranslationControls();
      draw(state.q);
    });
  }

  if (translationToggle) {
    translationToggle.addEventListener("change", function () {
      translationEnabled = translationToggle.checked;
      if (!animation.lastTarget || !animation.lastStartQ || (!state.running && !animation.paused && !animation.scrubbing)) {
        draw(state.q);
        return;
      }
      var timelineProgress = clamp01(animation.visualProgress === undefined ? 1 : animation.visualProgress);
      var sampledPose = samplePoseAtTimeline(timelineProgress);
      animation.eulerSegment = sampledPose.segment;
      animation.segmentProgress = sampledPose.localProgress;
      syncState(sampledPose.q, false);
      syncScrubber(timelineProgress);
      refreshStageLabel();
    });
  }

  Object.keys(translationInputs).forEach(function (key, index) {
    var input = translationInputs[key];
    if (!input) return;
    input.addEventListener("input", function () {
      var value = Number(input.value);
      if (Number.isFinite(value)) translationTarget[index] = value;
      activeTranslationPreset = "custom";
      syncTranslationControls();
      draw(state.q);
    });
  });

  root.querySelectorAll("[data-translation-preset]").forEach(function (button) {
    button.addEventListener("click", function () {
      var presets = {
        example: [0.55, -0.35, 0.40],
        "x-only": [0.70, 0, 0],
        zero: [0, 0, 0]
      };
      setTranslationTarget(presets[button.dataset.translationPreset] || presets.example, button.dataset.translationPreset);
    });
  });

  root.querySelectorAll('[data-action="reset"], [data-reset]').forEach(function (button) {
    button.addEventListener("click", function () {
      window.setTimeout(function () {
        if (translationToggle) translationToggle.checked = true;
        translationEnabled = true;
        animation.visualProgress = 1;
        setTranslationTarget([0.55, -0.35, 0.40], "example");
      }, 0);
    });
  });

  syncTranslationControls();

  if (pauseButton) {
    pauseButton.addEventListener("click", pauseAnimation);
  }
  if (resumeButton) {
    resumeButton.addEventListener("click", resumeAnimation);
  }
  if (replayButton) {
    replayButton.addEventListener("click", replayAnimation);
  }
  if (loopButton) {
    loopButton.addEventListener("click", toggleAutoLoop);
  }

  root.querySelectorAll("[data-unit]").forEach(function (button) {
    button.addEventListener("click", function () {
      setUnitButtons(button.dataset.unit);
    });
  });
  root.querySelector('[data-source="euler"]').addEventListener("click", function () {
    updateFromInputs("euler");
  });
  root.querySelector('[data-source="quaternion"]').addEventListener("click", function () {
    updateFromInputs("quaternion");
  });
  root.querySelector("[data-reset]").addEventListener("click", function () {
    euler.roll.value = 25;
    euler.pitch.value = -12;
    euler.yaw.value = 40;
    updateFromInputs("euler");
  });

  syncProbeVectorReadout();
  resetStageSnapshots(true);
  updateSlerpLab();
  var initialTarget = state.q;
  syncState({ w: 1, x: 0, y: 0, z: 0 }, false);
  updateAutoLoopControl();
  if (reducedMotion) {
    syncState(initialTarget);
    msg.textContent = "检测到“减少动态效果”设置，已直接显示示例目标姿态。";
  } else {
    window.requestAnimationFrame(function () {
      startAnimation(initialTarget, "quaternion-zyx");
    });
  }
  updateControlStatus();
}());
