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
  var speedRange = root.querySelector("[data-animation-speed]");
  var speedText = root.querySelector("[data-animation-speed-value]");
  var pauseButton = root.querySelector("[data-animation-pause]");
  var resumeButton = root.querySelector("[data-animation-resume]");
  var replayButton = root.querySelector("[data-animation-replay]");

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
    lastTarget: fromEuler(),
    micro: false,
    microAngle: 0,
    eulerStepTargets: [],
    eulerSegment: 0
  };

  var camera = {
    yaw: -0.8,
    pitch: -0.45,
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
    return 900 / getSpeed();
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

  function describeEulerStage() {
    if (animation.mode !== "euler") {
      return "--";
    }
    if (!state.running && !animation.running && animation.eulerSegment === 0) {
      return "--";
    }
    if (animation.micro) {
      return "微动 1/3（roll）";
    }
    var stage = animation.eulerSegment || 0;
    if (stage <= 0) return "0/3";
    if (stage === 1) return "1/3（roll）";
    if (stage === 2) return "2/3（pitch）";
    return "3/3（yaw）";
  }

  function refreshStageLabel() {
    if (!stageText) return;
    stageText.textContent = "阶段: " + describeEulerStage();
  }

  function syncState(q, syncInputs) {
    state.q = q;
    if (syncInputs !== false) {
      syncInputsFromQuaternion(q);
    }
    syncOutputs(q);
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
    return clamp01((performance.now() - animation.startTime) / d * 100);
  }

  function rotateY(v, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    return [
      v[0] * c + v[2] * s,
      v[1],
      -v[0] * s + v[2] * c
    ];
  }

  function rotateX(v, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    return [
      v[0],
      v[1] * c - v[2] * s,
      v[1] * s + v[2] * c
    ];
  }

  function withCamera(v) {
    return rotateX(rotateY(v, camera.yaw), camera.pitch);
  }

  function drawAxisSet(vectors, options) {
    var w = canvas.width;
    var h = canvas.height;
    var ox = w / 2 + (options.offsetX || 0);
    var oy = h / 2 + 18 + (options.offsetY || 0);
    var scale = Math.min(w, h) * 0.28;
    var baseColors = ["#ff816f", "#73d8b4", "#78aaff"];
    var labels = ["X", "Y", "Z"];

    var project = function (v) {
      var p = withCamera(v);
      var depth = 1.5 - p[2];
      var perspective = Math.max(0.35, Math.min(2, camera.zoom / depth));
      return [
        ox + scale * (p[0] - p[1]) * 0.82 * perspective,
        oy - scale * (p[2] + (p[0] + p[1]) * 0.28) * perspective
      ];
    };

    var origin = project([0, 0, 0]);
    if (options.dashed) {
      ctx.setLineDash([8, 7]);
    } else {
      ctx.setLineDash([]);
    }

    vectors.forEach(function (axis, index) {
      var end = project(axis);
      var color = options.color[index] || baseColors[index];
      ctx.beginPath();
      ctx.moveTo(origin[0], origin[1]);
      ctx.lineTo(end[0], end[1]);
      ctx.strokeStyle = color;
      ctx.lineWidth = options.lineWidth || 2.6;
      ctx.lineCap = "round";
      ctx.stroke();

      if (!options.reference) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(end[0], end[1], 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#eaf6f5";
        ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(labels[index], end[0] + 10, end[1] + 4);
      }
    });
    if (options.label) {
      ctx.fillStyle = options.labelColor || "#eaf6f5";
      ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(options.label, origin[0] + 8, origin[1] + 8);
    }
    ctx.setLineDash([]);
  }

  function draw(q) {
    var currentAxes = axesFromQuaternion(q);
    var w = canvas.width;
    var h = canvas.height;
    var referenceAxes = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1b25";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(176,220,218,.12)";
    ctx.lineWidth = 1;
    for (var y = 72; y <= h - 30; y += 36) {
      ctx.beginPath();
      ctx.moveTo(80, y);
      ctx.lineTo(w - 40, y);
      ctx.stroke();
    }

    drawAxisSet(referenceAxes, {
      offsetX: 0,
      offsetY: 0,
      reference: true,
      dashed: true,
      color: ["rgba(255, 129, 111, .42)", "rgba(115, 216, 180, .42)", "rgba(120, 170, 255, .42)"],
      lineWidth: 2.9
    });

    var hasHistoryOrTarget = animation.running || animation.lastTarget;
    if (hasHistoryOrTarget) {
      drawAxisSet(axesFromQuaternion(animation.startQ), {
        offsetX: -185,
        offsetY: -18,
        label: "实体A",
        labelColor: "#f0ac77",
        reference: false,
        dashed: false,
        color: ["#f0ac77", "#74bd8f", "#91bef3"],
        lineWidth: 4.1
      });
    }

    if (animation.mode === "euler" && animation.running && animation.eulerStepTargets.length) {
      var segment = Math.max(0, Math.min(2, (animation.eulerSegment || 1) - 1));
      var virtualTarget = animation.eulerStepTargets[segment] || animation.targetQ;
      drawAxisSet(axesFromQuaternion(virtualTarget), {
        offsetX: 185,
        offsetY: 18,
        label: "虚拟目标",
        labelColor: "#93b7ff",
        reference: false,
        dashed: true,
        color: ["rgba(178, 215, 255, .55)", "rgba(130, 180, 240, .55)", "rgba(100, 150, 255, .55)"],
        lineWidth: 3.1
      });
    } else if (hasHistoryOrTarget) {
      drawAxisSet(axesFromQuaternion(animation.targetQ), {
        offsetX: 185,
        offsetY: 18,
        label: "虚拟目标",
        labelColor: "#93b7ff",
        reference: false,
        dashed: true,
        color: ["rgba(255, 129, 111, .35)", "rgba(115, 216, 180, .35)", "rgba(120, 170, 255, .35)"],
        lineWidth: 3.1
      });
    }

    drawAxisSet(currentAxes, {
      offsetX: 0,
      offsetY: 0,
      label: "实体B",
      labelColor: "#78aaff",
      reference: false,
      dashed: false,
      color: ["#ff816f", "#73d8b4", "#78aaff"],
      lineWidth: 5.4
    });

    ctx.fillStyle = "#eaf6f5";
    ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Frame origin", w / 2 - 40, 28);
  }

  function eulerStepTargets(startEuler, endEuler) {
    var dr = wrapPi(endEuler.roll - startEuler.roll);
    var dp = wrapPi(endEuler.pitch - startEuler.pitch);
    var dy = wrapPi(endEuler.yaw - startEuler.yaw);
    return [
      fromEulerState({
        roll: startEuler.roll + dr,
        pitch: startEuler.pitch,
        yaw: startEuler.yaw
      }),
      fromEulerState({
        roll: startEuler.roll + dr,
        pitch: startEuler.pitch + dp,
        yaw: startEuler.yaw
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
      roll: startEuler.roll + dr,
      pitch: startEuler.pitch,
      yaw: startEuler.yaw
    });
    var q2 = fromEulerState({
      roll: startEuler.roll + dr,
      pitch: startEuler.pitch + dp,
      yaw: startEuler.yaw
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
      return { q: slerpQuaternion(startQ, q1, s1), segment: 1 };
    }
    if (t <= seg * 2) {
      var s2 = (t - seg) / seg;
      return { q: slerpQuaternion(q1, q2, s2), segment: 2 };
    }
    var s3 = (t - seg * 2) / seg;
    return { q: slerpQuaternion(q2, q3, s3), segment: 3 };
  }

  function animateTick(now) {
    if (!state.running || !animation.running || animation.paused) return;
    var duration = getDuration();
    var progress = clamp01((now - animation.startTime) / duration);
    var p = easeOutCubic(progress);
    var uiProgress = Math.round(progress * 100);
    var current = state.q;

    if (animation.micro) {
      current = normalize(multiply(fromAxisAngle(animation.axis, animation.microAngle * Math.sin(Math.PI * p)), animation.startQ));
    } else if (animation.mode === "euler") {
      var sampled = sampleEulerBySegmentProgress(animation.startEuler, animation.startQ, animation.endEuler, p);
      current = sampled.q;
      animation.eulerSegment = sampled.segment;
    } else if (animation.angle >= 1e-10) {
      current = normalize(multiply(fromAxisAngle(animation.axis, animation.angle * p), animation.startQ));
    } else {
      current = animation.targetQ;
    }

    syncState(current, false);
    if (progressBar) {
      progressBar.value = uiProgress;
    }
    if (animation.mode === "euler") {
      if (!animation.micro && animation.eulerSegment >= 1 && animation.eulerSegment <= 3) {
        var eulerStage = ["", "roll", "pitch", "yaw"][animation.eulerSegment];
        msg.textContent = "欧拉角动画播放中（" + eulerStage + "）";
      } else if (animation.micro) {
        msg.textContent = "欧拉角微动画播放中（缓变预览）...";
      }
      refreshStageLabel();
    } else if (animation.micro) {
      msg.textContent = "四元数微动画播放中（绕随机轴缓变）...";
      refreshStageLabel();
    } else {
      refreshStageLabel();
    }
    if (progress < 1) {
      animation.raf = requestAnimationFrame(animateTick);
      return;
    }

    finishAnimation(animation.targetQ, animation.mode === "euler"
      ? "欧拉角动画已完成（roll → pitch → yaw）"
      : "四元数动画已完成（按轴角插值）");
    if (progressBar) {
      progressBar.value = 100;
    }
  }

  function finishAnimation(target, text) {
    state.running = false;
    animation.running = false;
    animation.paused = false;
    animation.pausedElapsed = 0;
    if (animation.raf) {
      cancelAnimationFrame(animation.raf);
      animation.raf = null;
    }
    syncState(target);
    msg.textContent = text;
    animation.eulerSegment = 3;
    refreshStageLabel();
    updateControlStatus();
  }

  function stopAnimation() {
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
    animation.mode = mode;
    animation.micro = false;
    animation.startQ = state.q;
    animation.targetQ = normalize(target);
    animation.lastMode = mode;
    animation.lastTarget = animation.targetQ;
    animation.startTime = performance.now();
    animation.paused = false;
    animation.pausedElapsed = 0;
    animation.startEuler = toEuler(animation.startQ);
    animation.endEuler = {
      roll: toRadians(n(euler.roll)),
      pitch: toRadians(n(euler.pitch)),
      yaw: toRadians(n(euler.yaw))
    };
    var aa = axisAngle(multiply(animation.targetQ, inverse(animation.startQ)));
    animation.axis = aa.axis;
    animation.angle = aa.angle;
    animation.eulerSegment = 0;
    animation.eulerStepTargets = [];
    if (animation.mode === "quaternion" && animation.angle < 1e-10) {
      animation.micro = true;
      animation.microAngle = Math.PI * 0.35;
      animation.angle = 0;
    } else if (animation.mode === "euler") {
      animation.eulerStepTargets = eulerStepTargets(animation.startEuler, animation.endEuler);
      var eDiff = Math.max(
        Math.abs(wrapPi(animation.endEuler.roll - animation.startEuler.roll)),
        Math.abs(wrapPi(animation.endEuler.pitch - animation.startEuler.pitch)),
        Math.abs(wrapPi(animation.endEuler.yaw - animation.startEuler.yaw))
      );
      if (eDiff < 1e-9) {
        animation.micro = true;
        animation.microAngle = 0.35;
      }
    }
    if (progressBar) {
      progressBar.value = 0;
    }

    state.running = true;
    animation.running = true;
    animation.startTime = performance.now();
    msg.textContent = animation.mode === "euler"
      ? "欧拉角动画播放中（roll → pitch → yaw）..."
      : "四元数动画播放中（轴角插值）...";
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
    animation.startTime = performance.now() - animation.pausedElapsed;
    animation.raf = requestAnimationFrame(animateTick);
    msg.textContent = animation.mode === "euler"
      ? "欧拉角动画播放中（roll → pitch → yaw）..."
      : "四元数动画播放中（轴角插值）...";
    refreshStageLabel();
    updateControlStatus();
  }

  function replayAnimation() {
    if (!animation.lastTarget) {
      msg.textContent = "尚未有可重放目标，请先点击一次“以欧拉角为准”或“以四元数为准”。";
      return;
    }
    syncInputsFromQuaternion(animation.lastTarget);
    syncOutputs(animation.lastTarget);
    draw(animation.lastTarget);
    startAnimation(animation.lastTarget, animation.lastMode);
  }

  function updateControlStatus() {
    pauseButton.disabled = !state.running;
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

  function updateFromInputs(source) {
    if (source === "euler") {
      startAnimation(fromEuler(), "euler");
    } else {
      startAnimation(
        normalize({
          w: n(quat.w),
          x: n(quat.x),
          y: n(quat.y),
          z: n(quat.z)
        }),
        "quaternion"
      );
    }
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    camera.dragging = true;
    camera.lastX = event.clientX;
    camera.lastY = event.clientY;
    if (canvasWrap) {
      canvasWrap.classList.add("is-dragging");
    }
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (e) {}
    }
  }

  function onPointerMove(event) {
    if (!camera.dragging) return;
    var dx = event.clientX - camera.lastX;
    var dy = event.clientY - camera.lastY;
    camera.yaw += dx * 0.006;
    camera.pitch += dy * 0.006;
    camera.pitch = Math.max(-1.45, Math.min(1.45, camera.pitch));
    camera.lastX = event.clientX;
    camera.lastY = event.clientY;
    draw(state.q);
  }

  function onPointerUp(event) {
    if (!camera.dragging) return;
    camera.dragging = false;
    if (canvasWrap) {
      canvasWrap.classList.remove("is-dragging");
    }
    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (e) {}
    }
  }

  if (canvas) {
    canvas.addEventListener("mousedown", function (event) {
      onPointerDown({
        pointerType: "mouse",
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        preventDefault: function () { event.preventDefault(); }
      });
    });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("mousemove", onPointerMove);
    canvas.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("mouseleave", onPointerUp);
    canvas.addEventListener("wheel", function (event) {
      event.preventDefault();
      camera.zoom = Math.max(0.45, Math.min(2, camera.zoom * (event.deltaY > 0 ? 0.95 : 1.06)));
      draw(state.q);
    }, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  if (speedRange && speedText) {
    speedText.textContent = getSpeed().toFixed(1) + "x";
    speedRange.addEventListener("input", function () {
      speedText.textContent = getSpeed().toFixed(1) + "x";
    });
  }

  if (pauseButton) {
    pauseButton.addEventListener("click", pauseAnimation);
  }
  if (resumeButton) {
    resumeButton.addEventListener("click", resumeAnimation);
  }
  if (replayButton) {
    replayButton.addEventListener("click", replayAnimation);
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

  syncState(state.q);
  msg.textContent = "已使用示例欧拉角计算。可在按钮触发后观看动画。";
  updateControlStatus();
}());
