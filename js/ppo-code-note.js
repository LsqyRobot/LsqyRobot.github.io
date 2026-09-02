(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var motionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  var reduceMotion = motionQuery ? motionQuery.matches : false;
  var motionCallbacks = [];
  var colors = {
    background: "#07111f",
    panel: "#0d1b30",
    panelSoft: "#132640",
    grid: "rgba(149, 184, 229, 0.14)",
    axis: "rgba(202, 222, 247, 0.46)",
    text: "#e5f0ff",
    muted: "#91abc8",
    blue: "#62a8ff",
    cyan: "#56e3d0",
    gold: "#f6c85f",
    coral: "#ff7f96",
    violet: "#a99cff",
    greenFill: "rgba(86, 227, 208, 0.14)",
    redFill: "rgba(255, 127, 150, 0.12)",
    goldFill: "rgba(246, 200, 95, 0.12)",
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function format(value, digits) {
    var safe = Math.abs(value) < Math.pow(10, -digits) / 2 ? 0 : value;
    return safe.toFixed(digits).replace("-", "−");
  }

  function prepareCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 640));
    var height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 320));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pixelWidth = Math.round(width * dpr);
    var pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    var context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    return { context: context, width: width, height: height };
  }

  function clearCanvas(context, width, height) {
    context.clearRect(0, 0, width, height);
    var gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors.background);
    gradient.addColorStop(1, colors.panel);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  function drawLine(context, x1, y1, x2, y2, color, width, dash) {
    context.save();
    context.beginPath();
    context.setLineDash(dash || []);
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.strokeStyle = color;
    context.lineWidth = width || 1;
    context.stroke();
    context.restore();
  }

  function drawArrow(context, x1, y1, x2, y2, color, width) {
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var head = 7;
    drawLine(context, x1, y1, x2, y2, color, width || 1.5);
    context.save();
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(
      x2 - head * Math.cos(angle - Math.PI / 6),
      y2 - head * Math.sin(angle - Math.PI / 6),
    );
    context.lineTo(
      x2 - head * Math.cos(angle + Math.PI / 6),
      y2 - head * Math.sin(angle + Math.PI / 6),
    );
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.restore();
  }

  function roundedPath(context, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function drawBox(context, x, y, width, height, options) {
    var settings = options || {};
    context.save();
    roundedPath(context, x, y, width, height, settings.radius || 10);
    context.fillStyle = settings.fill || colors.panelSoft;
    context.fill();
    context.strokeStyle = settings.stroke || "rgba(151, 186, 229, 0.24)";
    context.lineWidth = settings.lineWidth || 1;
    context.stroke();
    context.restore();
  }

  function drawDot(context, x, y, radius, fill, stroke) {
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 1.5;
      context.stroke();
    }
    context.restore();
  }

  function drawText(context, text, x, y, options) {
    var settings = options || {};
    context.save();
    context.fillStyle = settings.color || colors.muted;
    context.font =
      (settings.weight || 500) +
      " " +
      (settings.size || 12) +
      "px system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    context.textAlign = settings.align || "left";
    context.textBaseline = settings.baseline || "alphabetic";
    if (settings.maxWidth) {
      context.fillText(text, x, y, settings.maxWidth);
    } else {
      context.fillText(text, x, y);
    }
    context.restore();
  }

  function drawPlotGrid(context, box, xLines, yLines) {
    var i;
    for (i = 0; i <= xLines; i += 1) {
      var x = box.x + (box.width * i) / xLines;
      drawLine(context, x, box.y, x, box.y + box.height, colors.grid, 1);
    }
    for (i = 0; i <= yLines; i += 1) {
      var y = box.y + (box.height * i) / yLines;
      drawLine(context, box.x, y, box.x + box.width, y, colors.grid, 1);
    }
  }

  function observeResize(element, callback) {
    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(callback);
      observer.observe(element);
      return;
    }
    window.addEventListener("resize", callback, { passive: true });
  }

  function observeVisibility(element, callback) {
    if (!("IntersectionObserver" in window)) {
      callback(true);
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        callback(entries[0] ? entries[0].isIntersecting : true);
      },
      { rootMargin: "140px 0px" },
    );
    observer.observe(element);
  }

  function bindCanvasDescription(root, canvas, readout, index) {
    var identifier = "ppo-code-lab-readout-" + index;
    readout.id = identifier;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-describedby", identifier);
  }

  function createLoop(root, canvas, toggle, advance, draw, options) {
    var settings = options || {};
    var paused = reduceMotion || !!settings.initialPaused;
    var visible = true;
    var frame = 0;
    var elapsed = settings.initialElapsed || 0;
    var lastTimestamp = 0;

    function updateButton() {
      if (reduceMotion) {
        toggle.textContent = "静态模式";
        toggle.disabled = true;
      } else {
        toggle.disabled = false;
        toggle.textContent = paused
          ? settings.pausedLabel || "继续"
          : settings.runningLabel || "暂停";
      }
      toggle.setAttribute("aria-pressed", paused ? "true" : "false");
      root.classList.toggle("is-paused", paused);
      root.classList.toggle("is-static", reduceMotion);
    }

    function paint() {
      draw(elapsed);
    }

    function schedule() {
      if (!frame && visible && !paused && !reduceMotion) {
        frame = window.requestAnimationFrame(tick);
      }
    }

    function tick(timestamp) {
      frame = 0;
      if (!visible || paused || reduceMotion) return;
      if (lastTimestamp && timestamp - lastTimestamp < 32) {
        schedule();
        return;
      }
      var delta = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.08) : 0;
      lastTimestamp = timestamp;
      elapsed += delta;
      if (advance) advance(delta, elapsed);
      paint();
      schedule();
    }

    function setPaused(nextPaused) {
      paused = !!nextPaused;
      lastTimestamp = 0;
      updateButton();
      paint();
      schedule();
    }

    toggle.addEventListener("click", function () {
      if (!reduceMotion) setPaused(!paused);
    });

    observeVisibility(root, function (isVisible) {
      visible = isVisible;
      lastTimestamp = 0;
      if (visible) {
        paint();
        schedule();
      } else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    observeResize(canvas, paint);

    motionCallbacks.push(function (matches) {
      reduceMotion = matches;
      if (matches) paused = true;
      lastTimestamp = 0;
      updateButton();
      paint();
      schedule();
    });

    updateButton();
    paint();
    schedule();

    return {
      paint: paint,
      pause: function () {
        setPaused(true);
      },
      isPaused: function () {
        return paused;
      },
      elapsed: function () {
        return elapsed;
      },
    };
  }

  function setupPipelineLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var readout = root.querySelector('[data-role="readout"]');
    if (!canvas || !toggle || !readout) return;
    bindCanvasDescription(root, canvas, readout, index);

    var envCount = 3;
    var stepCount = 4;
    var collectDuration = 5.2;
    var processNames = ["反向 GAE", "展平 / shuffle", "K × M 次更新", "πθ_new 再采样"];

    function draw(elapsed) {
      var surface = prepareCanvas(canvas);
      var context = surface.context;
      var width = surface.width;
      var height = surface.height;
      clearCanvas(context, width, height);

      var cycle = reduceMotion ? 6.7 : elapsed % 11;
      var filled = cycle < collectDuration
        ? Math.min(envCount * stepCount, Math.floor(cycle / (collectDuration / 12)) + 1)
        : envCount * stepCount;
      var processIndex = cycle < collectDuration
        ? -1
        : Math.min(3, Math.floor((cycle - collectDuration) / 1.35));
      var left = Math.max(46, width * 0.1);
      var right = width - 22;
      var top = 55;
      var gridHeight = Math.min(145, height * 0.38);
      var rowGap = 7;
      var rowHeight = (gridHeight - rowGap * (envCount - 1)) / envCount;
      var colGap = 7;
      var colWidth = (right - left - colGap * (stepCount - 1)) / stepCount;

      drawText(context, "ROLLOUT BUFFER · πθ_old 在采样期间冻结", 20, 25, {
        color: colors.cyan,
        size: 12,
        weight: 800,
      });
      drawText(context, "列是 timestep；提前结束后，下一格仍可属于 reset 后的新 episode", 20, 43, {
        color: colors.muted,
        size: 10,
      });

      var sequence = [];
      var t;
      var env;
      for (t = 0; t < stepCount; t += 1) {
        for (env = 0; env < envCount; env += 1) sequence.push({ env: env, step: t });
      }

      for (env = 0; env < envCount; env += 1) {
        var y = top + env * (rowHeight + rowGap);
        drawText(context, "E" + env, left - 12, y + rowHeight / 2, {
          align: "right",
          baseline: "middle",
          color: colors.text,
          size: 11,
          weight: 800,
        });
        for (t = 0; t < stepCount; t += 1) {
          var x = left + t * (colWidth + colGap);
          var sequenceIndex = t * envCount + env;
          var available = sequenceIndex < filled;
          var isTerminal = env === 1 && t === 2;
          var isTimeout = env === 2 && t === 3;
          var isResetEpisode = env === 1 && t === 3;
          var stroke = available ? "rgba(98, 168, 255, 0.65)" : "rgba(145, 171, 205, 0.2)";
          var fill = available ? "rgba(57, 103, 164, 0.26)" : "rgba(14, 29, 49, 0.54)";
          if (available && isTerminal) {
            stroke = colors.coral;
            fill = colors.redFill;
          }
          if (available && isTimeout) {
            stroke = colors.gold;
            fill = colors.goldFill;
          }
          drawBox(context, x, y, colWidth, rowHeight, {
            fill: fill,
            stroke: stroke,
            radius: 7,
          });
          drawText(context, "t" + t, x + colWidth / 2, y + 14, {
            align: "center",
            color: available ? colors.text : colors.muted,
            size: 9,
            weight: 800,
          });
          drawText(context, isTerminal ? "terminal" : isTimeout ? "timeout" : isResetEpisode ? "new ep." : "o,a,r,V,logπ", x + colWidth / 2, y + rowHeight - 10, {
            align: "center",
            color: isTerminal ? colors.coral : isTimeout ? colors.gold : colors.muted,
            size: Math.max(7, Math.min(10, colWidth / 10)),
            maxWidth: colWidth - 7,
          });
        }
      }

      var legendY = top + gridHeight + 17;
      drawDot(context, left, legendY, 4, colors.coral);
      drawText(context, "terminal: b=0,c=0", left + 9, legendY + 1, {
        color: colors.muted,
        size: 9,
        baseline: "middle",
      });
      drawDot(context, Math.min(left + 142, width * 0.55), legendY, 4, colors.gold);
      drawText(context, "timeout: b=1,c=0", Math.min(left + 151, width * 0.55 + 9), legendY + 1, {
        color: colors.muted,
        size: 9,
        baseline: "middle",
      });

      var stageTop = Math.max(legendY + 30, height * 0.63);
      var stageGap = width < 520 ? 5 : 9;
      var stageLeft = 15;
      var stageWidth = (width - 30 - stageGap * 3) / 4;
      var stageHeight = Math.min(75, height - stageTop - 28);
      for (var stage = 0; stage < 4; stage += 1) {
        var stageX = stageLeft + stage * (stageWidth + stageGap);
        var active = stage === processIndex;
        var unlocked = processIndex >= stage || (reduceMotion && stage <= 1);
        drawBox(context, stageX, stageTop, stageWidth, stageHeight, {
          fill: active ? colors.greenFill : "rgba(14, 31, 53, 0.74)",
          stroke: active ? colors.cyan : unlocked ? "rgba(98, 168, 255, 0.5)" : "rgba(145, 171, 205, 0.18)",
          lineWidth: active ? 2 : 1,
          radius: 9,
        });
        drawText(context, String(stage + 1).padStart(2, "0"), stageX + 8, stageTop + 17, {
          color: active ? colors.cyan : colors.muted,
          size: 9,
          weight: 800,
        });
        drawText(context, processNames[stage], stageX + stageWidth / 2, stageTop + stageHeight / 2 + 8, {
          align: "center",
          color: unlocked ? colors.text : "rgba(145, 171, 205, 0.5)",
          size: Math.max(8, Math.min(11, stageWidth / 9)),
          weight: 700,
          maxWidth: stageWidth - 8,
        });
        if (stage < 3) {
          drawArrow(context, stageX + stageWidth + 1, stageTop + stageHeight / 2, stageX + stageWidth + stageGap - 1, stageTop + stageHeight / 2, unlocked ? colors.blue : colors.grid, 1.3);
        }
      }

      if (processIndex < 0) {
        readout.textContent = "采样中：已写入 " + filled + "/12 个 transition；update 仍锁定，πθ_old 不变。";
      } else {
        readout.textContent = "12 个新 transition 已收齐；当前阶段：" + processNames[processIndex] + "。只有 rollout 完成后才更新参数。";
      }
    }

    createLoop(root, canvas, toggle, null, draw, {
      runningLabel: "暂停",
      pausedLabel: "继续",
      initialElapsed: 0.8,
    });
  }

  function setupPolicyLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var readout = root.querySelector('[data-role="readout"]');
    var muInput = root.querySelector('[data-role="mu"]');
    var sigmaInput = root.querySelector('[data-role="sigma"]');
    var scaleInput = root.querySelector('[data-role="scale"]');
    var muOutput = root.querySelector('[data-role="mu-output"]');
    var sigmaOutput = root.querySelector('[data-role="sigma-output"]');
    var scaleOutput = root.querySelector('[data-role="scale-output"]');
    if (!canvas || !toggle || !readout || !muInput || !sigmaInput || !scaleInput) return;
    bindCanvasDescription(root, canvas, readout, index);

    var loop;
    var actionClip = 1;
    var qDefault = 0.2;
    var q = 0.1;
    var qDot = 0.3;
    var kp = 20;
    var kd = 0.5;
    var torqueLimit = 5;

    function values(elapsed) {
      var mu = Number(muInput.value);
      var sigma = Math.max(0.001, Number(sigmaInput.value));
      var scale = Number(scaleInput.value);
      var z = reduceMotion || (loop && loop.isPaused())
        ? 1
        : 0.92 * Math.sin(elapsed * 1.25) + 0.38 * Math.sin(elapsed * 0.53 + 0.7);
      z = clamp(z, -2.2, 2.2);
      var raw = mu + sigma * z;
      var applied = clamp(raw, -actionClip, actionClip);
      var target = qDefault + scale * applied;
      var rawTorque = kp * (target - q) - kd * qDot;
      var torque = clamp(rawTorque, -torqueLimit, torqueLimit);
      var logProbability = -0.5 * z * z - Math.log(sigma) - 0.5 * Math.log(TAU);
      return {
        mu: mu,
        sigma: sigma,
        scale: scale,
        z: z,
        raw: raw,
        applied: applied,
        target: target,
        rawTorque: rawTorque,
        torque: torque,
        logProbability: logProbability,
      };
    }

    function drawGaussian(context, box, data) {
      drawText(context, "POLICY DENSITY p(u | o)", box.x, box.y - 11, {
        color: colors.cyan,
        size: 10,
        weight: 800,
      });
      drawPlotGrid(context, box, 4, 3);
      var xMin = -2;
      var xMax = 2;
      var maxDensity = 1 / (data.sigma * Math.sqrt(TAU));
      var yMax = Math.max(1.15, maxDensity * 1.12);
      function mapX(value) {
        return box.x + ((value - xMin) / (xMax - xMin)) * box.width;
      }
      function mapY(value) {
        return box.y + box.height - (value / yMax) * box.height;
      }
      context.save();
      context.beginPath();
      for (var pixel = 0; pixel <= box.width; pixel += 2) {
        var xValue = xMin + (pixel / box.width) * (xMax - xMin);
        var z = (xValue - data.mu) / data.sigma;
        var density = Math.exp(-0.5 * z * z) / (data.sigma * Math.sqrt(TAU));
        var px = box.x + pixel;
        var py = mapY(density);
        if (pixel === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.strokeStyle = colors.blue;
      context.lineWidth = 2.4;
      context.stroke();
      context.restore();
      drawLine(context, mapX(data.mu), box.y, mapX(data.mu), box.y + box.height, colors.cyan, 1.2, [4, 4]);
      var sampleX = clamp(mapX(data.raw), box.x, box.x + box.width);
      drawLine(context, sampleX, box.y, sampleX, box.y + box.height, colors.gold, 2);
      drawDot(context, sampleX, box.y + box.height - 5, 5, colors.gold, "#fff2bd");
      drawText(context, "μ", clamp(mapX(data.mu), box.x + 8, box.x + box.width - 8), box.y + 14, {
        align: "center",
        color: colors.cyan,
        size: 10,
        weight: 800,
      });
      drawText(context, "raw u", sampleX, box.y + box.height - 14, {
        align: "center",
        color: colors.gold,
        size: 9,
        weight: 800,
      });
      [-2, -1, 0, 1, 2].forEach(function (tick) {
        drawText(context, String(tick).replace("-", "−"), mapX(tick), box.y + box.height + 16, {
          align: "center",
          color: colors.muted,
          size: 9,
        });
      });
    }

    function drawChain(context, box, data, vertical) {
      var items = [
        { title: "raw sample u", value: format(data.raw, 2), color: colors.gold },
        { title: "clip → a", value: format(data.applied, 2), color: Math.abs(data.raw) > 1 ? colors.coral : colors.cyan },
        { title: "q target", value: format(data.target, 2) + " rad", color: colors.blue },
        { title: "torque clip", value: format(data.torque, 2) + " Nm", color: Math.abs(data.rawTorque) > torqueLimit ? colors.coral : colors.violet },
      ];
      var gap = vertical ? 8 : 6;
      var itemWidth = vertical ? box.width : (box.width - gap * 3) / 4;
      var itemHeight = vertical ? (box.height - gap * 3) / 4 : box.height;
      items.forEach(function (item, itemIndex) {
        var x = vertical ? box.x : box.x + itemIndex * (itemWidth + gap);
        var y = vertical ? box.y + itemIndex * (itemHeight + gap) : box.y;
        drawBox(context, x, y, itemWidth, itemHeight, {
          fill: "rgba(17, 37, 64, 0.82)",
          stroke: item.color,
          radius: 8,
        });
        drawText(context, item.title, x + itemWidth / 2, y + itemHeight * 0.38, {
          align: "center",
          color: colors.muted,
          size: Math.max(7, Math.min(10, itemWidth / 9)),
          maxWidth: itemWidth - 8,
        });
        drawText(context, item.value, x + itemWidth / 2, y + itemHeight * 0.68, {
          align: "center",
          color: item.color,
          size: Math.max(8, Math.min(12, itemWidth / 8)),
          weight: 800,
          maxWidth: itemWidth - 8,
        });
        if (itemIndex < 3) {
          if (vertical) {
            drawArrow(context, x + itemWidth / 2, y + itemHeight + 1, x + itemWidth / 2, y + itemHeight + gap - 1, colors.axis, 1.2);
          } else {
            drawArrow(context, x + itemWidth + 1, y + itemHeight / 2, x + itemWidth + gap - 1, y + itemHeight / 2, colors.axis, 1.2);
          }
        }
      });
    }

    function draw(elapsed) {
      var surface = prepareCanvas(canvas);
      var context = surface.context;
      var width = surface.width;
      var height = surface.height;
      var data = values(elapsed);
      clearCanvas(context, width, height);
      muOutput.textContent = format(data.mu, 2);
      sigmaOutput.textContent = format(data.sigma, 2);
      scaleOutput.textContent = format(data.scale, 2) + " rad";

      if (width >= 680) {
        var plot = { x: 42, y: 55, width: width * 0.43, height: height - 105 };
        drawGaussian(context, plot, data);
        drawText(context, "CONTROL PATH · q₀=0.20, q=0.10, q̇=0.30", width * 0.52, 27, {
          color: colors.cyan,
          size: 10,
          weight: 800,
        });
        drawChain(context, { x: width * 0.52, y: 52, width: width * 0.43, height: height - 82 }, data, true);
      } else {
        var mobilePlot = { x: 34, y: 43, width: width - 55, height: height * 0.43 };
        drawGaussian(context, mobilePlot, data);
        drawChain(context, { x: 10, y: height * 0.62, width: width - 20, height: height * 0.27 }, data, false);
      }
      var actionWasClipped = Math.abs(data.raw - data.applied) > 1e-8;
      var torqueWasClipped = Math.abs(data.rawTorque - data.torque) > 1e-8;
      readout.textContent =
        "ε=" + format(data.z, 2) +
        "，log π_old(u|o)=" + format(data.logProbability, 3) +
        "；raw u=" + format(data.raw, 2) +
        (actionWasClipped ? " → action 已截断；" : " → action 未截断；") +
        "τ_raw=" + format(data.rawTorque, 2) + " Nm" +
        (torqueWasClipped ? " → 执行器输出饱和为 " + format(data.torque, 2) + " Nm。" : "，未触发 torque limit。") ;
    }

    loop = createLoop(root, canvas, toggle, null, draw, {
      runningLabel: "暂停",
      pausedLabel: "继续",
      initialElapsed: 0.45,
    });
    [muInput, sigmaInput, scaleInput].forEach(function (input) {
      input.addEventListener("input", loop.paint);
    });
  }

  function computeGaeFixture(gamma, lambdaValue, boundary, boundaryType) {
    var rewards = [0.55, -0.2, 0.9, 0.15, -0.35, 0.25, 0.8, -0.1, 0.45, 0.2];
    var values = [0.42, 0.51, 0.36, 0.61, 0.48, 0.55, 0.62, 0.44, 0.57, 0.5, 0.46];
    var deltas = [];
    var advantages = new Array(10);
    var nextAdvantage = 0;
    for (var step = 9; step >= 0; step -= 1) {
      var atBoundary = step === boundary;
      var bootstrap = atBoundary && boundaryType === "terminal" ? 0 : 1;
      var continueMask = atBoundary ? 0 : 1;
      deltas[step] = rewards[step] + gamma * bootstrap * values[step + 1] - values[step];
      advantages[step] = deltas[step] + gamma * lambdaValue * continueMask * nextAdvantage;
      nextAdvantage = advantages[step];
    }
    return { rewards: rewards, values: values, deltas: deltas, advantages: advantages };
  }

  function setupGaeLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var readout = root.querySelector('[data-role="readout"]');
    var gammaInput = root.querySelector('[data-role="gamma"]');
    var lambdaInput = root.querySelector('[data-role="lambda"]');
    var doneInput = root.querySelector('[data-role="done"]');
    var boundarySelect = root.querySelector('[data-role="boundary"]');
    var gammaOutput = root.querySelector('[data-role="gamma-output"]');
    var lambdaOutput = root.querySelector('[data-role="lambda-output"]');
    var doneOutput = root.querySelector('[data-role="done-output"]');
    if (!canvas || !toggle || !readout || !gammaInput || !lambdaInput || !doneInput || !boundarySelect) return;
    bindCanvasDescription(root, canvas, readout, index);
    var loop;

    function draw(elapsed) {
      var surface = prepareCanvas(canvas);
      var context = surface.context;
      var width = surface.width;
      var height = surface.height;
      var gamma = Number(gammaInput.value);
      var lambdaValue = Number(lambdaInput.value);
      var boundaryAfter = Number(doneInput.value);
      var boundary = boundaryAfter - 1;
      var boundaryType = boundarySelect.value;
      var fixture = computeGaeFixture(gamma, lambdaValue, boundary, boundaryType);
      var active = reduceMotion || (loop && loop.isPaused())
        ? 0
        : boundary - (Math.floor(elapsed / 0.72) % (boundary + 1));
      clearCanvas(context, width, height);
      gammaOutput.textContent = format(gamma, 2);
      lambdaOutput.textContent = format(lambdaValue, 2);
      doneOutput.textContent = "第 " + boundaryAfter + " 步后";

      var left = 23;
      var right = width - 18;
      var gap = width < 520 ? 3 : 6;
      var cellWidth = (right - left - gap * 9) / 10;
      var cellTop = 70;
      var cellHeight = Math.min(86, height * 0.2);
      drawText(context, "有限 rollout：从右向左递推 Aₜ", left, 27, {
        color: colors.cyan,
        size: 11,
        weight: 800,
      });
      drawText(context, "δₜ = rₜ + γ bₜ Vₜ₊₁ − Vₜ   ·   Aₜ = δₜ + γλ cₜ Aₜ₊₁", left, 47, {
        color: colors.muted,
        size: width < 520 ? 8 : 10,
        maxWidth: right - left,
      });

      for (var step = 0; step < 10; step += 1) {
        var x = left + step * (cellWidth + gap);
        var beforeBoundary = step <= boundary;
        var isBoundary = step === boundary;
        var isActive = step === active;
        drawBox(context, x, cellTop, cellWidth, cellHeight, {
          fill: isActive ? colors.greenFill : beforeBoundary ? "rgba(23, 48, 81, 0.72)" : "rgba(11, 24, 42, 0.45)",
          stroke: isBoundary ? (boundaryType === "terminal" ? colors.coral : colors.gold) : isActive ? colors.cyan : "rgba(142, 179, 224, 0.25)",
          lineWidth: isBoundary || isActive ? 2 : 1,
          radius: 7,
        });
        drawText(context, "t" + step, x + cellWidth / 2, cellTop + 17, {
          align: "center",
          color: beforeBoundary ? colors.text : "rgba(145, 171, 200, 0.5)",
          size: 9,
          weight: 800,
        });
        drawText(context, "δ " + format(fixture.deltas[step], 2), x + cellWidth / 2, cellTop + cellHeight * 0.53, {
          align: "center",
          color: fixture.deltas[step] >= 0 ? colors.cyan : colors.coral,
          size: Math.max(7, Math.min(10, cellWidth / 6)),
          maxWidth: cellWidth - 4,
        });
        drawText(context, beforeBoundary ? "A " + format(fixture.advantages[step], 2) : "新 episode", x + cellWidth / 2, cellTop + cellHeight - 11, {
          align: "center",
          color: beforeBoundary ? colors.gold : "rgba(145, 171, 200, 0.46)",
          size: Math.max(6, Math.min(9, cellWidth / 7)),
          maxWidth: cellWidth - 4,
        });
      }

      var wallX = left + (boundary + 1) * cellWidth + boundary * gap + gap / 2;
      drawLine(context, wallX, cellTop - 12, wallX, cellTop + cellHeight + 15, boundaryType === "terminal" ? colors.coral : colors.gold, 3, [5, 4]);
      drawText(context, boundaryType === "terminal" ? "terminal" : "timeout", clamp(wallX, 43, width - 43), cellTop - 19, {
        align: "center",
        color: boundaryType === "terminal" ? colors.coral : colors.gold,
        size: 9,
        weight: 800,
      });

      var barTop = cellTop + cellHeight + 56;
      var barBottom = height - 47;
      var barHeight = Math.max(65, barBottom - barTop);
      drawText(context, "对 A₀ 的贡献：δₗ × (γλ)ˡ（边界后严格为 0）", left, barTop - 18, {
        color: colors.text,
        size: width < 520 ? 9 : 11,
        weight: 700,
      });
      drawLine(context, left, barTop + barHeight / 2, right, barTop + barHeight / 2, colors.axis, 1);
      var maximum = 0.001;
      var contributions = [];
      for (step = 0; step < 10; step += 1) {
        var contribution = step <= boundary ? fixture.deltas[step] * Math.pow(gamma * lambdaValue, step) : 0;
        contributions.push(contribution);
        maximum = Math.max(maximum, Math.abs(contribution));
      }
      for (step = 0; step < 10; step += 1) {
        var barX = left + step * (cellWidth + gap) + cellWidth * 0.15;
        var barWidth = cellWidth * 0.7;
        var normalized = contributions[step] / maximum;
        var midY = barTop + barHeight / 2;
        var pixels = normalized * (barHeight * 0.42);
        context.fillStyle = contributions[step] >= 0 ? colors.cyan : colors.coral;
        context.fillRect(barX, pixels >= 0 ? midY - pixels : midY, barWidth, Math.abs(pixels));
        drawText(context, "w" + step, barX + barWidth / 2, barTop + barHeight + 15, {
          align: "center",
          color: step <= boundary ? colors.muted : "rgba(145, 171, 200, 0.35)",
          size: 8,
        });
      }
      var boundaryDelta = fixture.deltas[boundary];
      var approximateSpan = gamma * lambdaValue >= 0.999 ? "很长" : format(1 / (1 - gamma * lambdaValue), 1) + " 步";
      readout.textContent =
        (boundaryType === "terminal" ? "真正 terminal：b=0,c=0" : "timeout：b=1,c=0") +
        "；边界 δ=" + format(boundaryDelta, 3) +
        "，A₀=" + format(fixture.advantages[0], 3) +
        "，γλ=" + format(gamma * lambdaValue, 3) +
        "（几何衰减尺度约 " + approximateSpan + "）" +
        (boundaryType === "timeout" ? "；bootstrap 用 reset 前的 V_terminal，不是右侧新 episode 的 V。" : "。") ;
    }

    loop = createLoop(root, canvas, toggle, null, draw, {
      runningLabel: "暂停",
      pausedLabel: "继续",
      initialElapsed: 1.1,
    });
    [gammaInput, lambdaInput, doneInput, boundarySelect].forEach(function (input) {
      input.addEventListener("input", loop.paint);
      input.addEventListener("change", loop.paint);
    });
  }

  function clippedObjective(ratio, advantage, epsilon) {
    var clippedRatio = clamp(ratio, 1 - epsilon, 1 + epsilon);
    return Math.min(ratio * advantage, clippedRatio * advantage);
  }

  function setupClipLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var readout = root.querySelector('[data-role="readout"]');
    var advantageSelect = root.querySelector('[data-role="advantage"]');
    var epsilonInput = root.querySelector('[data-role="epsilon"]');
    var ratioInput = root.querySelector('[data-role="ratio"]');
    var epsilonOutput = root.querySelector('[data-role="epsilon-output"]');
    var ratioOutput = root.querySelector('[data-role="ratio-output"]');
    if (!canvas || !toggle || !readout || !advantageSelect || !epsilonInput || !ratioInput) return;
    bindCanvasDescription(root, canvas, readout, index);
    var loop;

    function advance(delta, elapsed) {
      var ratio = 1 + 0.6 * Math.sin(elapsed * 1.12);
      ratioInput.value = ratio.toFixed(2);
    }

    function draw(elapsed) {
      var surface = prepareCanvas(canvas);
      var context = surface.context;
      var width = surface.width;
      var height = surface.height;
      var epsilon = Number(epsilonInput.value);
      var ratio = Number(ratioInput.value);
      var advantage = advantageSelect.value === "negative" ? -1 : 1;
      clearCanvas(context, width, height);
      epsilonOutput.textContent = format(epsilon, 2);
      ratioOutput.textContent = format(ratio, 2);

      var box = { x: width < 520 ? 43 : 62, y: 58, width: width - (width < 520 ? 61 : 88), height: height - 118 };
      var xMin = 0.4;
      var xMax = 1.6;
      var yMin = advantage > 0 ? 0.3 : -1.7;
      var yMax = advantage > 0 ? 1.35 : -0.3;
      function mapX(value) {
        return box.x + ((value - xMin) / (xMax - xMin)) * box.width;
      }
      function mapY(value) {
        return box.y + box.height - ((value - yMin) / (yMax - yMin)) * box.height;
      }
      drawPlotGrid(context, box, 6, 5);
      drawText(context, "单样本目标（最大化）", box.x, 27, {
        color: colors.cyan,
        size: 11,
        weight: 800,
      });
      drawText(context, "代码中的 policy loss = −Lclip", box.x, 44, {
        color: colors.muted,
        size: 9,
      });
      var lowX = mapX(1 - epsilon);
      var highX = mapX(1 + epsilon);
      context.fillStyle = "rgba(246, 200, 95, 0.055)";
      context.fillRect(lowX, box.y, highX - lowX, box.height);
      drawLine(context, lowX, box.y, lowX, box.y + box.height, colors.gold, 1.4, [5, 4]);
      drawLine(context, highX, box.y, highX, box.y + box.height, colors.gold, 1.4, [5, 4]);
      drawText(context, "1−ε", lowX, box.y + 15, { align: "center", color: colors.gold, size: 9 });
      drawText(context, "1+ε", highX, box.y + 15, { align: "center", color: colors.gold, size: 9 });

      function strokeCurve(valueFunction, color, lineWidth, dash) {
        context.save();
        context.beginPath();
        context.setLineDash(dash || []);
        for (var pixel = 0; pixel <= box.width; pixel += 2) {
          var r = xMin + (pixel / box.width) * (xMax - xMin);
          var x = box.x + pixel;
          var y = mapY(valueFunction(r));
          if (pixel === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
        context.restore();
      }
      strokeCurve(function (r) { return r * advantage; }, colors.blue, 1.7, [6, 5]);
      strokeCurve(function (r) { return clamp(r, 1 - epsilon, 1 + epsilon) * advantage; }, colors.gold, 1.4, [2, 4]);
      strokeCurve(function (r) { return clippedObjective(r, advantage, epsilon); }, advantage > 0 ? colors.cyan : colors.coral, 3, []);

      var objective = clippedObjective(ratio, advantage, epsilon);
      var rawObjective = ratio * advantage;
      var pointX = mapX(ratio);
      var pointY = mapY(objective);
      drawLine(context, pointX, box.y, pointX, box.y + box.height, "rgba(229, 240, 255, 0.38)", 1, [3, 5]);
      drawDot(context, pointX, pointY, 6, advantage > 0 ? colors.cyan : colors.coral, "#ffffff");
      drawText(context, "r=" + format(ratio, 2), pointX, box.y + box.height + 22, {
        align: "center",
        color: colors.text,
        size: 10,
        weight: 800,
      });
      drawText(context, "rA（虚线）", box.x + 4, box.y + box.height - 13, { color: colors.blue, size: 9, weight: 700 });
      drawText(context, "clip(r)A（点线）", box.x + Math.min(92, box.width * 0.32), box.y + box.height - 13, { color: colors.gold, size: 9, weight: 700 });
      drawText(context, "min（粗实线）", box.x + Math.min(215, box.width * 0.68), box.y + box.height - 13, { color: advantage > 0 ? colors.cyan : colors.coral, size: 9, weight: 700 });

      var isLimited = Math.abs(objective - rawObjective) > 1e-9;
      readout.textContent =
        "A=" + (advantage > 0 ? "+1" : "−1") +
        "，rA=" + format(rawObjective, 3) +
        "，clip(r)=" + format(clamp(ratio, 1 - epsilon, 1 + epsilon), 2) +
        "，Lclip=" + format(objective, 3) +
        "；" + (isLimited ? "当前由 clip 分支限制继续获益。" : "当前由原始 rA 分支决定目标。") ;
    }

    loop = createLoop(root, canvas, toggle, advance, draw, {
      runningLabel: "停止扫描",
      pausedLabel: "自动扫描",
      initialPaused: true,
      initialElapsed: 0,
    });
    advantageSelect.addEventListener("change", loop.paint);
    epsilonInput.addEventListener("input", loop.paint);
    ratioInput.addEventListener("input", function () {
      loop.pause();
      loop.paint();
    });
  }

  function seededPermutation(length, seed) {
    var values = [];
    var state = seed >>> 0;
    for (var index = 0; index < length; index += 1) values.push(index);
    function random() {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    }
    for (var cursor = length - 1; cursor > 0; cursor -= 1) {
      var swapIndex = Math.floor(random() * (cursor + 1));
      var temporary = values[cursor];
      values[cursor] = values[swapIndex];
      values[swapIndex] = temporary;
    }
    return values;
  }

  function environmentColor(environment, environmentCount, alpha) {
    var hue = 188 + (environment / Math.max(1, environmentCount - 1)) * 92;
    return "hsla(" + hue.toFixed(0) + ", 76%, 65%, " + (alpha === undefined ? 0.88 : alpha) + ")";
  }

  function setupBatchLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var readout = root.querySelector('[data-role="readout"]');
    var envInput = root.querySelector('[data-role="envs"]');
    var stepInput = root.querySelector('[data-role="steps"]');
    var minibatchInput = root.querySelector('[data-role="minibatches"]');
    var epochInput = root.querySelector('[data-role="epochs"]');
    var envOutput = root.querySelector('[data-role="env-output"]');
    var stepOutput = root.querySelector('[data-role="steps-output"]');
    var minibatchOutput = root.querySelector('[data-role="minibatch-output"]');
    var epochOutput = root.querySelector('[data-role="epoch-output"]');
    if (!canvas || !toggle || !readout || !envInput || !stepInput || !minibatchInput || !epochInput) return;
    bindCanvasDescription(root, canvas, readout, index);
    var loop;

    function draw(elapsed) {
      var surface = prepareCanvas(canvas);
      var context = surface.context;
      var width = surface.width;
      var height = surface.height;
      var envs = Number(envInput.value);
      var steps = Number(stepInput.value);
      var minibatches = Number(minibatchInput.value);
      var epochs = Number(epochInput.value);
      var batchSize = envs * steps;
      var miniSize = Math.floor(batchSize / minibatches);
      var used = miniSize * minibatches;
      var remainder = batchSize - used;
      var permutation = seededPermutation(used, 20260829);
      var updateCursor = reduceMotion || (loop && loop.isPaused())
        ? 0
        : Math.floor(elapsed / 0.72) % (epochs * minibatches);
      var currentEpoch = Math.floor(updateCursor / minibatches);
      var currentMini = updateCursor % minibatches;
      clearCanvas(context, width, height);
      envOutput.textContent = String(envs);
      stepOutput.textContent = String(steps);
      minibatchOutput.textContent = String(minibatches);
      epochOutput.textContent = String(epochs);

      var gridLeft = width < 520 ? 37 : 52;
      var gridTop = 48;
      var gridWidth = width - gridLeft - 18;
      var gridHeight = Math.min(height * 0.34, 155);
      var cellGap = 1.5;
      var cellWidth = (gridWidth - cellGap * (steps - 1)) / steps;
      var cellHeight = (gridHeight - cellGap * (envs - 1)) / envs;
      drawText(context, "FRESH ROLLOUT · B = N × T = " + batchSize, gridLeft, 25, {
        color: colors.cyan,
        size: 11,
        weight: 800,
      });
      for (var env = 0; env < envs; env += 1) {
        var y = gridTop + env * (cellHeight + cellGap);
        if (envs <= 8 || env % 2 === 0) {
          drawText(context, "E" + env, gridLeft - 6, y + cellHeight / 2, {
            align: "right",
            baseline: "middle",
            color: colors.muted,
            size: 7,
          });
        }
        for (var step = 0; step < steps; step += 1) {
          var x = gridLeft + step * (cellWidth + cellGap);
          context.fillStyle = environmentColor(env, envs, 0.72);
          context.fillRect(x, y, Math.max(1, cellWidth), Math.max(1, cellHeight));
        }
      }
      drawText(context, "每一格是唯一 transition；GAE 在打乱前完成", gridLeft, gridTop + gridHeight + 17, {
        color: colors.muted,
        size: 9,
      });

      var batchTop = gridTop + gridHeight + 50;
      var batchBottom = height - 78;
      var batchAreaHeight = Math.max(75, batchBottom - batchTop);
      var rowGap = 4;
      var rowHeight = (batchAreaHeight - rowGap * (minibatches - 1)) / minibatches;
      var labelWidth = width < 520 ? 34 : 54;
      var tokenLeft = gridLeft + labelWidth;
      var tokenWidth = width - tokenLeft - 18;
      drawText(context, "一次 randperm → 同一分块复用 K 个 epoch", gridLeft, batchTop - 17, {
        color: colors.text,
        size: width < 520 ? 9 : 11,
        weight: 700,
      });

      for (var mini = 0; mini < minibatches; mini += 1) {
        var rowY = batchTop + mini * (rowHeight + rowGap);
        var active = mini === currentMini;
        drawText(context, "MB" + (mini + 1), gridLeft, rowY + rowHeight / 2, {
          baseline: "middle",
          color: active ? colors.gold : colors.muted,
          size: 8,
          weight: active ? 800 : 600,
        });
        drawBox(context, tokenLeft, rowY, tokenWidth, rowHeight, {
          fill: active ? colors.goldFill : "rgba(15, 31, 53, 0.72)",
          stroke: active ? colors.gold : "rgba(143, 178, 225, 0.19)",
          radius: 5,
          lineWidth: active ? 1.8 : 1,
        });
        var start = mini * miniSize;
        var visibleTokens = Math.min(miniSize, Math.max(8, Math.floor(tokenWidth / 7)));
        var tokenGap = 1;
        var smallWidth = (tokenWidth - 8 - tokenGap * (visibleTokens - 1)) / visibleTokens;
        for (var token = 0; token < visibleTokens; token += 1) {
          var sourceOffset = Math.floor((token / visibleTokens) * miniSize);
          var transitionId = permutation[start + sourceOffset];
          var tokenEnv = transitionId % envs;
          context.fillStyle = environmentColor(tokenEnv, envs, active ? 0.95 : 0.58);
          context.fillRect(tokenLeft + 4 + token * (smallWidth + tokenGap), rowY + rowHeight * 0.28, Math.max(1, smallWidth), Math.max(2, rowHeight * 0.44));
        }
      }

      var footerY = height - 44;
      var epochGap = 5;
      var epochWidth = Math.min(52, (width - gridLeft - 18 - epochGap * (epochs - 1)) / epochs);
      drawText(context, "epoch", gridLeft, footerY + 7, { color: colors.muted, size: 9 });
      var epochLeft = gridLeft + 42;
      for (var epoch = 0; epoch < epochs; epoch += 1) {
        var epochX = epochLeft + epoch * (epochWidth + epochGap);
        drawBox(context, epochX, footerY - 9, epochWidth, 27, {
          fill: epoch === currentEpoch ? colors.greenFill : "rgba(13, 28, 48, 0.72)",
          stroke: epoch === currentEpoch ? colors.cyan : "rgba(143, 178, 225, 0.22)",
          radius: 5,
        });
        drawText(context, String(epoch + 1), epochX + epochWidth / 2, footerY + 5, {
          align: "center",
          baseline: "middle",
          color: epoch === currentEpoch ? colors.cyan : colors.muted,
          size: 9,
          weight: 800,
        });
      }
      if (remainder > 0) {
        drawText(context, "尾部未用 " + remainder, width - 18, footerY + 7, {
          align: "right",
          color: colors.coral,
          size: 9,
          weight: 800,
        });
      }

      readout.textContent =
        "新鲜且唯一的 transition：B=" + batchSize +
        "；mini-batch size=" + miniSize +
        "；optimizer step=" + (epochs * minibatches) +
        "；样本处理次数=" + (epochs * used) +
        (remainder ? "；因不能整除，每个 epoch 有 " + remainder + " 个尾部样本未使用。" : "；每个 transition 恰好复用 " + epochs + " 次。") ;
    }

    loop = createLoop(root, canvas, toggle, null, draw, {
      runningLabel: "暂停",
      pausedLabel: "继续",
      initialElapsed: 0.8,
    });
    [envInput, stepInput, minibatchInput, epochInput].forEach(function (input) {
      input.addEventListener("input", loop.paint);
    });
  }

  function validateMathFixtures() {
    var epsilon = 0.2;
    var cases = [
      [0.5, 1, 0.5], [1, 1, 1], [1.5, 1, 1.2],
      [0.5, -1, -0.8], [1, -1, -1], [1.5, -1, -1.5],
    ];
    cases.forEach(function (fixture) {
      var actual = clippedObjective(fixture[0], fixture[1], epsilon);
      if (Math.abs(actual - fixture[2]) > 1e-10) {
        throw new Error("PPO clip fixture failed");
      }
    });
    var gamma = 0.9;
    var lambdaValue = 0.8;
    var rewards = [1, 2, 3];
    var values = [0.5, 1, 1.5];
    var advantage = 0;
    var expected = [3.8696, 3.43, 1.5];
    for (var step = 2; step >= 0; step -= 1) {
      var bootstrap = step === 2 ? 0 : 1;
      var nextValue = step === 2 ? 0 : values[step + 1];
      var delta = rewards[step] + gamma * bootstrap * nextValue - values[step];
      advantage = delta + gamma * lambdaValue * bootstrap * advantage;
      if (Math.abs(advantage - expected[step]) > 1e-9) {
        throw new Error("GAE fixture failed");
      }
    }
  }

  function initialize() {
    validateMathFixtures();
    var labs = document.querySelectorAll("[data-ppo-lab]");
    labs.forEach(function (root, index) {
      var type = root.getAttribute("data-ppo-lab");
      if (type === "pipeline") setupPipelineLab(root, index);
      if (type === "policy") setupPolicyLab(root, index);
      if (type === "gae") setupGaeLab(root, index);
      if (type === "clip") setupClipLab(root, index);
      if (type === "batch") setupBatchLab(root, index);
    });
  }

  if (motionQuery) {
    var onMotionChange = function (event) {
      reduceMotion = event.matches;
      motionCallbacks.slice().forEach(function (callback) {
        callback(event.matches);
      });
    };
    if (motionQuery.addEventListener) motionQuery.addEventListener("change", onMotionChange);
    else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
