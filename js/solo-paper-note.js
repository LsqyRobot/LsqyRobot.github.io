(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var motionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  var reduceMotion = motionQuery ? motionQuery.matches : false;
  var palette = {
    background: "#061421",
    panel: "#0b2134",
    panelSoft: "#102d46",
    grid: "rgba(164, 205, 224, 0.13)",
    axis: "rgba(207, 231, 241, 0.42)",
    text: "#edf9ff",
    muted: "#91aebb",
    cyan: "#5de6d1",
    blue: "#5aa9ff",
    gold: "#f2c166",
    coral: "#ff7f8f",
    violet: "#af9dff",
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function easeOut(value) {
    var t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function prepareCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 720));
    var height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 360));
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
    var gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette.background);
    gradient.addColorStop(1, palette.panel);
    context.clearRect(0, 0, width, height);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
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

  function drawBox(context, x, y, width, height, fill, stroke, radius) {
    context.save();
    roundedPath(context, x, y, width, height, radius || 10);
    context.fillStyle = fill || palette.panelSoft;
    context.fill();
    context.strokeStyle = stroke || "rgba(145, 190, 213, 0.2)";
    context.lineWidth = 1;
    context.stroke();
    context.restore();
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

  function drawText(context, value, x, y, options) {
    var settings = options || {};
    context.save();
    context.fillStyle = settings.color || palette.muted;
    context.font =
      (settings.weight || 500) +
      " " +
      (settings.size || 12) +
      "px system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    context.textAlign = settings.align || "left";
    context.textBaseline = settings.baseline || "alphabetic";
    context.fillText(value, x, y, settings.maxWidth);
    context.restore();
  }

  function observeResize(element, callback) {
    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(callback);
      observer.observe(element);
    } else {
      window.addEventListener("resize", callback, { passive: true });
    }
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

  function bindDescription(canvas, readout, index) {
    var identifier = "solo-paper-lab-readout-" + index;
    readout.id = identifier;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-describedby", identifier);
  }

  function createLoop(root, canvas, toggle, advance, draw, settings) {
    var options = settings || {};
    var paused = reduceMotion;
    var visible = true;
    var elapsed = options.initialElapsed || 0;
    var lastTimestamp = 0;
    var frame = 0;

    function updateButton() {
      if (reduceMotion) {
        toggle.textContent = "静态模式";
        toggle.disabled = true;
      } else {
        toggle.disabled = false;
        toggle.textContent = paused ? "继续" : "暂停";
      }
      toggle.setAttribute("aria-pressed", paused ? "true" : "false");
      root.classList.toggle("is-paused", paused);
      root.classList.toggle("is-static", reduceMotion);
    }

    function render() {
      draw(elapsed);
    }

    function tick(timestamp) {
      if (!lastTimestamp) {
        lastTimestamp = timestamp;
      }
      var delta = Math.min(50, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      if (!paused && visible) {
        elapsed = advance(elapsed, delta);
        draw(elapsed);
      }
      frame = window.requestAnimationFrame(tick);
    }

    toggle.addEventListener("click", function () {
      if (reduceMotion) {
        return;
      }
      paused = !paused;
      updateButton();
      render();
    });

    observeResize(canvas, render);
    observeVisibility(root, function (isVisible) {
      visible = isVisible;
      lastTimestamp = 0;
    });

    updateButton();
    render();
    frame = window.requestAnimationFrame(tick);

    return {
      render: render,
      reset: function () {
        elapsed = 0;
        render();
      },
      destroy: function () {
        window.cancelAnimationFrame(frame);
      },
    };
  }

  function terrainHeight(kind, x) {
    if (kind === "stones") {
      if ((x > 0.08 && x < 0.24) || (x > 0.37 && x < 0.54) || (x > 0.68 && x < 0.84)) {
        return x > 0.66 ? 0.58 : x > 0.34 ? 0.43 : 0.3;
      }
      return 0.02;
    }
    if (x < 0.24) {
      return 0.05;
    }
    if (x < 0.5) {
      return 0.28;
    }
    if (x < 0.75) {
      return 0.52;
    }
    return 0.76;
  }

  function smoothHeight(kind, x, strength) {
    var radius = 0.018 + strength * 0.00125;
    var samples = 25;
    var sum = 0;
    var weights = 0;
    var i;
    for (i = 0; i < samples; i += 1) {
      var offset = ((i / (samples - 1)) * 2 - 1) * radius;
      var weight = 1 - Math.abs(offset / radius);
      sum += terrainHeight(kind, clamp(x + offset, 0, 1)) * weight;
      weights += weight;
    }
    return sum / weights;
  }

  function drawTerrainTrace(context, box, valueAt, color, fill, cellMode, reveal) {
    var count = cellMode ? 48 : 180;
    var i;
    context.save();
    context.beginPath();
    context.rect(box.x, box.y, box.width, box.height);
    context.clip();

    if (fill) {
      context.beginPath();
      context.moveTo(box.x, box.y + box.height);
      for (i = 0; i <= count; i += 1) {
        var fillX = i / count;
        var fillY = valueAt(fillX, i);
        context.lineTo(
          box.x + fillX * box.width,
          box.y + box.height - fillY * box.height * 0.86,
        );
      }
      context.lineTo(box.x + box.width, box.y + box.height);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
    }

    context.beginPath();
    for (i = 0; i <= count; i += 1) {
      var normalizedX = i / count;
      var value = valueAt(normalizedX, i);
      var x = box.x + normalizedX * box.width;
      var y = box.y + box.height - value * box.height * 0.86;
      if (i === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.strokeStyle = color;
    context.lineWidth = cellMode ? 2 : 2.5;
    context.stroke();

    if (cellMode) {
      var visibleCells = Math.floor(clamp(reveal, 0, 1) * count);
      for (i = 0; i < visibleCells; i += 1) {
        var cellX = (i + 0.5) / count;
        var cellValue = valueAt(cellX, i);
        var px = box.x + cellX * box.width;
        var py = box.y + box.height - cellValue * box.height * 0.86;
        drawDot(context, px, py, i === visibleCells - 1 ? 4.4 : 2.1, color);
      }
    }
    context.restore();
  }

  function initQrLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var terrain = root.querySelector('[data-role="terrain"]');
    var blur = root.querySelector('[data-role="blur"]');
    var blurOutput = root.querySelector('[data-role="blur-output"]');
    var readout = root.querySelector('[data-role="readout"]');
    bindDescription(canvas, readout, index);

    function draw(elapsed) {
      var prepared = prepareCanvas(canvas);
      var context = prepared.context;
      var width = prepared.width;
      var height = prepared.height;
      clearCanvas(context, width, height);

      var left = width < 540 ? 18 : 30;
      var right = width < 540 ? 14 : 24;
      var top = 24;
      var gap = 13;
      var rowHeight = (height - top - 30 - gap * 2) / 3;
      var labels = [
        ["地形真值", palette.gold],
        ["共享表示 + dense decoder", palette.coral],
        ["SOLO：每个 cell query 单独取证", palette.cyan],
      ];
      var kind = terrain.value;
      var strength = Number(blur.value);
      var reveal = reduceMotion ? 1 : (elapsed % 3200) / 3200;
      var row;

      for (row = 0; row < 3; row += 1) {
        var y = top + row * (rowHeight + gap);
        drawBox(
          context,
          left,
          y,
          width - left - right,
          rowHeight,
          "rgba(7, 24, 39, 0.58)",
          "rgba(145, 190, 213, 0.18)",
          10,
        );
        drawText(context, labels[row][0], left + 13, y + 20, {
          color: labels[row][1],
          size: width < 540 ? 10 : 12,
          weight: 750,
        });
        var plot = {
          x: left + (width < 540 ? 108 : 185),
          y: y + 11,
          width: width - left - right - (width < 540 ? 120 : 199),
          height: rowHeight - 20,
        };
        drawLine(
          context,
          plot.x,
          plot.y + plot.height,
          plot.x + plot.width,
          plot.y + plot.height,
          palette.axis,
          1,
        );
        if (row === 0) {
          drawTerrainTrace(
            context,
            plot,
            function (x) {
              return terrainHeight(kind, x);
            },
            palette.gold,
            "rgba(242, 193, 102, 0.12)",
            false,
            1,
          );
        } else if (row === 1) {
          drawTerrainTrace(
            context,
            plot,
            function (x) {
              return smoothHeight(kind, x, strength);
            },
            palette.coral,
            "rgba(255, 127, 143, 0.10)",
            false,
            1,
          );
        } else {
          drawTerrainTrace(
            context,
            plot,
            function (x, cell) {
              var stableNoise = Math.sin(cell * 2.37 + 0.7) * 0.009;
              return clamp(terrainHeight(kind, x) + stableNoise, 0, 1);
            },
            palette.cyan,
            "rgba(93, 230, 209, 0.08)",
            true,
            reveal,
          );
          var scannerX = plot.x + reveal * plot.width;
          drawLine(
            context,
            scannerX,
            plot.y + 4,
            scannerX,
            plot.y + plot.height,
            "rgba(93, 230, 209, 0.55)",
            1.5,
            [4, 5],
          );
        }
      }

      blurOutput.value = strength + "%";
      readout.textContent =
        kind === "stones"
          ? "示意：窄踏石的两个边界都决定脚掌是否完整落在支撑面；逐格 query 正依次读取 48 个示意 cell。"
          : "示意：共享瓶颈越强，台阶竖直边缘越像斜坡；逐格 query 保留各单元的空间身份。";
    }

    var loop = createLoop(
      root,
      canvas,
      toggle,
      function (elapsed, delta) {
        return elapsed + delta;
      },
      draw,
    );

    terrain.addEventListener("change", loop.reset);
    blur.addEventListener("input", loop.render);
  }

  function initCreditLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var gamma = root.querySelector('[data-role="gamma"]');
    var horizon = root.querySelector('[data-role="horizon"]');
    var gammaOutput = root.querySelector('[data-role="gamma-output"]');
    var horizonOutput = root.querySelector('[data-role="horizon-output"]');
    var readout = root.querySelector('[data-role="readout"]');
    bindDescription(canvas, readout, index);

    function drawTimeline(context, box, title, temporal, elapsed) {
      var nodeCount = 9;
      var eventIndex = Number(horizon.value);
      var gammaValue = Number(gamma.value) / 100;
      var progress = reduceMotion ? 1 : (elapsed % 3600) / 3600;
      var i;

      drawBox(
        context,
        box.x,
        box.y,
        box.width,
        box.height,
        "rgba(7, 24, 39, 0.58)",
        temporal ? "rgba(93, 230, 209, 0.24)" : "rgba(255, 127, 143, 0.2)",
        12,
      );
      drawText(context, title, box.x + 14, box.y + 22, {
        color: temporal ? palette.cyan : palette.coral,
        size: 12,
        weight: 760,
      });

      var startX = box.x + 38;
      var endX = box.x + box.width - 35;
      var y = box.y + box.height * 0.6;
      drawLine(context, startX, y, endX, y, palette.axis, 2);

      for (i = 0; i < nodeCount; i += 1) {
        var x = startX + (i / (nodeCount - 1)) * (endX - startX);
        var isEvent = i === eventIndex;
        var active = temporal && i < eventIndex;
        var distance = eventIndex - i - 1;
        var weight = active ? Math.pow(gammaValue, Math.max(0, distance)) : 0;
        var reached = temporal && progress >= (eventIndex - i) / eventIndex;
        var fill = isEvent
          ? palette.gold
          : reached
            ? "rgba(93, 230, 209," + (0.25 + weight * 0.7) + ")"
            : palette.panelSoft;
        drawDot(context, x, y, isEvent ? 8 : 6, fill, isEvent ? "#fff0c4" : palette.axis);
        drawText(context, i === 0 ? "t" : "t+" + i, x, y + 23, {
          align: "center",
          color: isEvent ? palette.gold : palette.muted,
          size: 10,
        });
        if (active && reached) {
          drawArrow(
            context,
            x + 7,
            y - 16,
            startX + ((i + 1) / (nodeCount - 1)) * (endX - startX) - 7,
            y - 16,
            "rgba(93, 230, 209," + (0.25 + weight * 0.65) + ")",
            2,
          );
          drawText(context, weight.toFixed(2), x + 12, y - 25, {
            align: "center",
            color: "rgba(210, 247, 240," + (0.35 + weight * 0.65) + ")",
            size: 9,
          });
        }
      }

      var eventX = startX + (eventIndex / (nodeCount - 1)) * (endX - startX);
      drawText(context, "未来师生分歧", eventX, y - 28, {
        align: "center",
        color: palette.gold,
        size: 10,
        weight: 700,
      });
      if (!temporal) {
        drawText(context, "当前 MSE 只监督同一状态，不给更早动作分配这项后果", box.x + box.width / 2, box.y + box.height - 13, {
          align: "center",
          color: palette.muted,
          size: box.width < 560 ? 9 : 11,
        });
      }
    }

    function draw(elapsed) {
      var prepared = prepareCanvas(canvas);
      var context = prepared.context;
      var width = prepared.width;
      var height = prepared.height;
      clearCanvas(context, width, height);
      var margin = width < 540 ? 12 : 24;
      var top = 20;
      var gap = 16;
      var boxHeight = (height - top - 27 - gap) / 2;

      drawTimeline(
        context,
        { x: margin, y: top, width: width - margin * 2, height: boxHeight },
        "Pointwise MSE：只看当前状态",
        false,
        elapsed,
      );
      drawTimeline(
        context,
        { x: margin, y: top + boxHeight + gap, width: width - margin * 2, height: boxHeight },
        "TA-MSE + GAE：未来分歧向此前动作传播",
        true,
        elapsed,
      );

      var gammaValue = Number(gamma.value) / 100;
      var step = Number(horizon.value);
      var earliestWeight = Math.pow(gammaValue, Math.max(0, step - 1));
      gammaOutput.value = gammaValue.toFixed(2);
      horizonOutput.value = "t + " + step;
      readout.textContent =
        "分歧出现在 t+" +
        step +
        " 时，对 t 对应模仿回报的示意折扣权重为 γ^" +
        Math.max(0, step - 1) +
        " = " +
        earliestWeight.toFixed(3) +
        "；episode boundary 还会把传播截断。";
    }

    var loop = createLoop(
      root,
      canvas,
      toggle,
      function (elapsed, delta) {
        return elapsed + delta;
      },
      draw,
    );
    gamma.addEventListener("input", loop.render);
    horizon.addEventListener("input", loop.reset);
  }

  function initResultsLab(root, index) {
    var canvas = root.querySelector('[data-role="canvas"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var metric = root.querySelector('[data-role="metric"]');
    var readout = root.querySelector('[data-role="readout"]');
    bindDescription(canvas, readout, index);
    var values = {
      mean: [75.0, 75.6, 97.5],
      stones: [3.0, 0.0, 96.0],
      worst: [3.0, 0.0, 92.0],
    };
    var descriptions = {
      mean: "论文口径：8 类最高难度地形、每类 100 次 rollout 的平均成功率。",
      stones: "踏石最直接暴露边缘平滑问题：QR 为 96%，两种 dense baseline 为 3% 和 0%。",
      worst: "即使只取各方法最差地形，QR 仍为 92%；START 与 DPL 分别为 3% 和 0%。",
    };
    var labels = ["START", "DPL", "SOLO / QR"];
    var colors = [palette.coral, palette.violet, palette.cyan];

    function draw(elapsed) {
      var prepared = prepareCanvas(canvas);
      var context = prepared.context;
      var width = prepared.width;
      var height = prepared.height;
      clearCanvas(context, width, height);
      var margin = {
        left: width < 540 ? 39 : 60,
        right: width < 540 ? 15 : 30,
        top: 28,
        bottom: 58,
      };
      var plot = {
        x: margin.left,
        y: margin.top,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
      };
      var progress = reduceMotion ? 1 : easeOut(Math.min(1, (elapsed % 5200) / 1150));
      var currentValues = values[metric.value];
      var gridValue;
      for (gridValue = 0; gridValue <= 100; gridValue += 25) {
        var gridY = plot.y + plot.height - (gridValue / 100) * plot.height;
        drawLine(context, plot.x, gridY, plot.x + plot.width, gridY, palette.grid, 1);
        drawText(context, gridValue + "%", plot.x - 8, gridY, {
          align: "right",
          baseline: "middle",
          color: palette.muted,
          size: 10,
        });
      }

      var groupWidth = plot.width / 3;
      var barWidth = Math.min(112, groupWidth * 0.48);
      var i;
      for (i = 0; i < 3; i += 1) {
        var centerX = plot.x + groupWidth * (i + 0.5);
        var displayed = currentValues[i] * progress;
        var barHeight = Math.max(currentValues[i] === 0 ? 2 : 4, (displayed / 100) * plot.height);
        var x = centerX - barWidth / 2;
        var y = plot.y + plot.height - barHeight;
        var gradient = context.createLinearGradient(0, y, 0, plot.y + plot.height);
        gradient.addColorStop(0, colors[i]);
        gradient.addColorStop(1, "rgba(27, 68, 88, 0.58)");
        drawBox(context, x, y, barWidth, barHeight, gradient, colors[i], 8);
        drawText(context, currentValues[i].toFixed(currentValues[i] % 1 ? 1 : 0) + "%", centerX, Math.max(plot.y + 14, y - 10), {
          align: "center",
          color: colors[i],
          size: width < 540 ? 12 : 15,
          weight: 800,
        });
        drawText(context, labels[i], centerX, plot.y + plot.height + 28, {
          align: "center",
          color: i === 2 ? palette.text : palette.muted,
          size: width < 540 ? 10 : 12,
          weight: i === 2 ? 760 : 600,
        });
      }
      readout.textContent = descriptions[metric.value];
    }

    var loop = createLoop(
      root,
      canvas,
      toggle,
      function (elapsed, delta) {
        return elapsed + delta;
      },
      draw,
    );
    metric.addEventListener("change", loop.reset);
  }

  function initialize() {
    var labs = document.querySelectorAll("[data-solo-lab]");
    Array.prototype.forEach.call(labs, function (root, index) {
      var kind = root.getAttribute("data-solo-lab");
      if (kind === "qr") {
        initQrLab(root, index);
      } else if (kind === "credit") {
        initCreditLab(root, index);
      } else if (kind === "results") {
        initResultsLab(root, index);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
