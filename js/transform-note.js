(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
  var colors = {
    background: "#07101f",
    panel: "#0b1729",
    grid: "rgba(151, 183, 224, 0.13)",
    axis: "rgba(194, 215, 242, 0.45)",
    text: "#dbeafe",
    muted: "#8fa8c5",
    blue: "#5da2ff",
    cyan: "#4de4d1",
    gold: "#f6c453",
    coral: "#fb7185",
    greenFill: "rgba(45, 212, 191, 0.09)",
    redFill: "rgba(251, 113, 133, 0.07)",
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function formatNumber(value, digits) {
    var rounded = Math.abs(value) < Math.pow(10, -digits) / 2 ? 0 : value;
    return rounded.toFixed(digits).replace("-", "−");
  }

  function complexLabel(real, imaginary, digits) {
    var sign = imaginary >= 0 ? "+" : "−";
    return (
      formatNumber(real, digits) +
      " " +
      sign +
      " j" +
      formatNumber(Math.abs(imaginary), digits)
    );
  }

  function prepareCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(1, Math.round(rect.width || canvas.clientWidth || 600));
    var cssHeight = Math.max(1, Math.round(rect.height || canvas.clientHeight || 300));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pixelWidth = Math.round(cssWidth * dpr);
    var pixelHeight = Math.round(cssHeight * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    var context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    return { context: context, width: cssWidth, height: cssHeight };
  }

  function clearCanvas(context, width, height) {
    context.clearRect(0, 0, width, height);
    var gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors.background);
    gradient.addColorStop(1, colors.panel);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  function drawLine(context, x1, y1, x2, y2, color, lineWidth, dash) {
    context.save();
    context.beginPath();
    context.setLineDash(dash || []);
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.strokeStyle = color;
    context.lineWidth = lineWidth || 1;
    context.stroke();
    context.restore();
  }

  function drawArrow(context, x1, y1, x2, y2, color, lineWidth) {
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var head = 7;
    drawLine(context, x1, y1, x2, y2, color, lineWidth || 1.5);
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

  function drawCross(context, x, y, radius, color, lineWidth) {
    drawLine(context, x - radius, y - radius, x + radius, y + radius, color, lineWidth || 2);
    drawLine(context, x - radius, y + radius, x + radius, y - radius, color, lineWidth || 2);
  }

  function drawRing(context, x, y, radius, color, lineWidth) {
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.strokeStyle = color;
    context.lineWidth = lineWidth || 2;
    context.stroke();
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
    context.fillText(text, x, y);
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
      var observer = new ResizeObserver(function () {
        callback();
      });
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
      { rootMargin: "160px 0px" },
    );
    observer.observe(element);
  }

  function setupFourierLab(root) {
    var timeCanvas = root.querySelector('[data-role="time-canvas"]');
    var phasorCanvas = root.querySelector('[data-role="phasor-canvas"]');
    var signalSelect = root.querySelector('[data-role="signal"]');
    var probeInput = root.querySelector('[data-role="probe"]');
    var probeOutput = root.querySelector('[data-role="probe-output"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var readout = root.querySelector('[data-role="readout"]');
    if (
      !timeCanvas ||
      !phasorCanvas ||
      !signalSelect ||
      !probeInput ||
      !probeOutput ||
      !toggle ||
      !readout
    ) {
      return;
    }

    var paused = reduceMotion;
    var elapsed = 4.2;
    var lastTimestamp = 0;
    var lastPaint = 0;
    var duration = 2;
    var sampleCount = 480;
    var currentProgress = paused ? 0.78 : (elapsed % 5.6) / 5.6;
    var visible = true;
    var animationFrame = 0;
    var cachedData = null;
    var cachedKey = "";

    if (reduceMotion) root.classList.add("is-static");

    function signalValue(preset, time) {
      if (preset === "square") {
        return Math.sin(TAU * time) >= 0 ? 1 : -1;
      }
      if (preset === "decay") {
        return Math.exp(-1.25 * time) * Math.cos(TAU * 2 * time + 0.25);
      }
      return Math.sin(TAU * time) + 0.55 * Math.sin(TAU * 3 * time + 0.55);
    }

    function buildData() {
      var preset = signalSelect.value;
      var probe = Number(probeInput.value);
      var key = preset + "|" + probe.toFixed(4);
      if (cachedData && key === cachedKey) return cachedData;
      var samples = [];
      var cumulative = [];
      var real = 0;
      var imaginary = 0;
      var maximumSignal = preset === "two-tone" ? 1.65 : 1.08;

      for (var index = 0; index < sampleCount; index += 1) {
        var time = (duration * index) / (sampleCount - 1);
        var value = signalValue(preset, time);
        var angle = TAU * probe * time;
        real += (2 / sampleCount) * value * Math.cos(angle);
        imaginary -= (2 / sampleCount) * value * Math.sin(angle);
        samples.push({ time: time, value: value });
        cumulative.push({ real: real, imaginary: imaginary });
      }

      cachedKey = key;
      cachedData = {
        samples: samples,
        cumulative: cumulative,
        maximumSignal: maximumSignal,
        finalMagnitude: Math.hypot(real, imaginary),
        probe: probe,
        preset: preset,
      };
      return cachedData;
    }

    function drawTimePlot(data, progress) {
      var prepared = prepareCanvas(timeCanvas);
      var context = prepared.context;
      var width = prepared.width;
      var height = prepared.height;
      clearCanvas(context, width, height);

      var box = { x: 42, y: 28, width: width - 58, height: height - 62 };
      drawPlotGrid(context, box, 4, 4);
      var zeroY = box.y + box.height / 2;
      drawLine(context, box.x, zeroY, box.x + box.width, zeroY, colors.axis, 1.2);

      drawText(context, "x(t)", 12, 20, { color: colors.cyan, weight: 700 });
      drawText(context, "探针 cos", 50, 20, { color: colors.gold, weight: 700 });
      drawText(context, "0 s", box.x, height - 11, { align: "center" });
      drawText(context, duration.toFixed(0) + " s", box.x + box.width, height - 11, {
        align: "center",
      });

      context.save();
      context.beginPath();
      data.samples.forEach(function (sample, index) {
        var x = box.x + (sample.time / duration) * box.width;
        var reference = 0.48 * Math.cos(TAU * data.probe * sample.time);
        var y = zeroY - (reference / data.maximumSignal) * (box.height * 0.43);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.setLineDash([5, 5]);
      context.strokeStyle = "rgba(246, 196, 83, 0.66)";
      context.lineWidth = 1.25;
      context.stroke();
      context.restore();

      context.save();
      context.beginPath();
      data.samples.forEach(function (sample, index) {
        var x = box.x + (sample.time / duration) * box.width;
        var y = zeroY - (sample.value / data.maximumSignal) * (box.height * 0.43);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = "rgba(105, 176, 255, 0.34)";
      context.lineWidth = 1.4;
      context.stroke();
      context.restore();

      var activeIndex = clamp(Math.floor(progress * (sampleCount - 1)), 1, sampleCount - 1);
      context.save();
      context.beginPath();
      for (var index = 0; index <= activeIndex; index += 1) {
        var activeSample = data.samples[index];
        var activeX = box.x + (activeSample.time / duration) * box.width;
        var activeY = zeroY - (activeSample.value / data.maximumSignal) * (box.height * 0.43);
        if (index === 0) context.moveTo(activeX, activeY);
        else context.lineTo(activeX, activeY);
      }
      context.strokeStyle = colors.cyan;
      context.lineWidth = 2.2;
      context.shadowColor = "rgba(77, 228, 209, 0.55)";
      context.shadowBlur = 7;
      context.stroke();
      context.restore();

      var current = data.samples[activeIndex];
      var cursorX = box.x + (current.time / duration) * box.width;
      var cursorY = zeroY - (current.value / data.maximumSignal) * (box.height * 0.43);
      drawLine(context, cursorX, box.y, cursorX, box.y + box.height, "rgba(93, 162, 255, 0.32)", 1);
      drawDot(context, cursorX, cursorY, 4.5, colors.cyan, "#d9fffa");
    }

    function drawPhasorPlot(data, progress) {
      var prepared = prepareCanvas(phasorCanvas);
      var context = prepared.context;
      var width = prepared.width;
      var height = prepared.height;
      clearCanvas(context, width, height);

      var centerX = width / 2;
      var centerY = height / 2;
      var radius = Math.min(width, height) * 0.36;
      var domain = 1.35;
      var scale = radius / domain;
      var activeIndex = clamp(Math.floor(progress * (sampleCount - 1)), 1, sampleCount - 1);

      for (var ring = 1; ring <= 3; ring += 1) {
        drawRing(context, centerX, centerY, (radius * ring) / 3, colors.grid, 1);
      }
      drawLine(context, centerX - radius - 8, centerY, centerX + radius + 8, centerY, colors.axis, 1.1);
      drawLine(context, centerX, centerY - radius - 8, centerX, centerY + radius + 8, colors.axis, 1.1);
      drawText(context, "Re", centerX + radius + 11, centerY + 4, { color: colors.muted });
      drawText(context, "Im", centerX + 5, centerY - radius - 8, { color: colors.muted });

      function plotTrack(limit, color, lineWidth) {
        context.save();
        context.beginPath();
        context.moveTo(centerX, centerY);
        for (var index = 0; index <= limit; index += 1) {
          var point = data.cumulative[index];
          context.lineTo(centerX + point.real * scale, centerY - point.imaginary * scale);
        }
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
        context.restore();
      }

      plotTrack(sampleCount - 1, "rgba(93, 162, 255, 0.22)", 1.1);
      plotTrack(activeIndex, colors.cyan, 2.2);

      var endpoint = data.cumulative[activeIndex];
      var endpointX = centerX + endpoint.real * scale;
      var endpointY = centerY - endpoint.imaginary * scale;
      drawArrow(context, centerX, centerY, endpointX, endpointY, colors.gold, 2);
      drawDot(context, endpointX, endpointY, 4.5, colors.gold, "#fff5cf");

      var currentMagnitude = Math.hypot(endpoint.real, endpoint.imaginary);
      drawText(context, "|累计向量| ≈ " + currentMagnitude.toFixed(2), 14, 21, {
        color: colors.text,
        weight: 700,
      });
    }

    function draw(progress) {
      var data = buildData();
      probeOutput.textContent = data.probe.toFixed(2) + " Hz";
      drawTimePlot(data, progress);
      drawPhasorPlot(data, progress);

      var judgement = "大多相互抵消";
      if (data.finalMagnitude > 0.7) judgement = "明显匹配";
      else if (data.finalMagnitude > 0.18) judgement = "存在较弱或部分相关";
      var readoutHtml =
        "完整 2 s 窗的归一化幅值估计约为 <strong>" +
        data.finalMagnitude.toFixed(3) +
        "</strong>，当前判断：" +
        judgement +
        "。";
      if (readout.innerHTML !== readoutHtml) readout.innerHTML = readoutHtml;
    }

    function syncToggle() {
      toggle.textContent = paused ? "播放" : "暂停";
    }

    signalSelect.addEventListener("change", function () {
      elapsed = 0;
      currentProgress = 0;
      draw(currentProgress);
    });
    probeInput.addEventListener("input", function () {
      draw(currentProgress);
    });
    toggle.addEventListener("click", function () {
      paused = !paused;
      if (!paused) root.classList.remove("is-static");
      lastTimestamp = 0;
      syncToggle();
      scheduleAnimation();
    });

    function scheduleAnimation() {
      if (!animationFrame && !paused && visible && !document.hidden) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    function animate(timestamp) {
      animationFrame = 0;
      if (!lastTimestamp) lastTimestamp = timestamp;
      var delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;
      if (!paused && !document.hidden && visible) {
        elapsed += delta;
        currentProgress = (elapsed % 5.6) / 5.6;
      }
      if (!paused && visible && timestamp - lastPaint > 32) {
        draw(currentProgress);
        lastPaint = timestamp;
      }
      scheduleAnimation();
    }

    observeResize(root, function () {
      draw(currentProgress);
    });
    observeVisibility(root, function (isVisible) {
      visible = isVisible;
      lastTimestamp = 0;
      if (visible) {
        draw(currentProgress);
        scheduleAnimation();
      }
    });
    document.addEventListener("visibilitychange", scheduleAnimation);
    syncToggle();
    draw(currentProgress);
    scheduleAnimation();
  }

  function setupMappingLab(root) {
    var canvas = root.querySelector('[data-role="mapping-canvas"]');
    var sigmaInput = root.querySelector('[data-role="sigma"]');
    var omegaInput = root.querySelector('[data-role="omega"]');
    var periodInput = root.querySelector('[data-role="period"]');
    var sigmaOutput = root.querySelector('[data-role="sigma-output"]');
    var omegaOutput = root.querySelector('[data-role="omega-output"]');
    var periodOutput = root.querySelector('[data-role="period-output"]');
    var readout = root.querySelector('[data-role="readout"]');
    if (
      !canvas ||
      !sigmaInput ||
      !omegaInput ||
      !periodInput ||
      !sigmaOutput ||
      !omegaOutput ||
      !periodOutput ||
      !readout
    ) {
      return;
    }

    function drawPlaneAxes(context, box, realLabel, imaginaryLabel) {
      var centerX = box.x + box.width / 2;
      var centerY = box.y + box.height / 2;
      drawLine(context, box.x, centerY, box.x + box.width, centerY, colors.axis, 1.2);
      drawLine(context, centerX, box.y, centerX, box.y + box.height, colors.axis, 1.2);
      drawText(context, realLabel, box.x + box.width - 2, centerY - 7, {
        align: "right",
        color: colors.muted,
      });
      drawText(context, imaginaryLabel, centerX + 7, box.y + 12, { color: colors.muted });
    }

    function draw() {
      var prepared = prepareCanvas(canvas);
      var context = prepared.context;
      var width = prepared.width;
      var height = prepared.height;
      clearCanvas(context, width, height);

      var sigma = Number(sigmaInput.value);
      var omega = Number(omegaInput.value);
      var period = Number(periodInput.value);
      var magnitude = Math.exp(sigma * period);
      var rawAngle = omega * period;
      var wrappedAngle = Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
      var zReal = magnitude * Math.cos(wrappedAngle);
      var zImaginary = magnitude * Math.sin(wrappedAngle);

      sigmaOutput.textContent = formatNumber(sigma, 2) + " s⁻¹";
      omegaOutput.textContent = formatNumber(omega, 2) + " rad/s";
      periodOutput.textContent = period.toFixed(3) + " s";

      var outerPadding = width < 560 ? 18 : 28;
      var gap = width < 560 ? 24 : 46;
      var titleHeight = 34;
      var panelWidth = (width - outerPadding * 2 - gap) / 2;
      var planeHeight = height - titleHeight - 38;
      var sBox = {
        x: outerPadding,
        y: titleHeight,
        width: panelWidth,
        height: planeHeight,
      };
      var zBox = {
        x: outerPadding + panelWidth + gap,
        y: titleHeight,
        width: panelWidth,
        height: planeHeight,
      };

      drawText(context, "s 平面", sBox.x, 21, { color: colors.text, size: 14, weight: 750 });
      drawText(context, "z = eˢᵀ", width / 2, 21, {
        color: colors.gold,
        size: 13,
        weight: 750,
        align: "center",
      });
      drawText(context, "z 平面", zBox.x, 21, { color: colors.text, size: 14, weight: 750 });

      var sCenterX = sBox.x + sBox.width * (5.5 / 8);
      var sCenterY = sBox.y + sBox.height / 2;
      context.save();
      context.fillStyle = colors.greenFill;
      context.fillRect(sBox.x, sBox.y, sCenterX - sBox.x, sBox.height);
      context.fillStyle = colors.redFill;
      context.fillRect(sCenterX, sBox.y, sBox.x + sBox.width - sCenterX, sBox.height);
      context.restore();
      drawPlotGrid(context, sBox, 4, 4);
      drawLine(context, sBox.x, sCenterY, sBox.x + sBox.width, sCenterY, colors.axis, 1.2);
      drawLine(context, sCenterX, sBox.y, sCenterX, sBox.y + sBox.height, colors.blue, 1.6);
      drawText(context, "Re(s)", sBox.x + sBox.width - 2, sCenterY - 7, {
        align: "right",
      });
      drawText(context, "jω", sCenterX + 6, sBox.y + 12);
      if (sBox.width > 210) {
        drawText(context, "稳定模态", sBox.x + 8, sBox.y + 17, { color: colors.cyan });
        drawText(context, "增长模态", sBox.x + sBox.width - 8, sBox.y + 17, {
          color: colors.coral,
          align: "right",
        });
      }

      function mapS(real, imaginary) {
        return {
          x: sCenterX + (real / 8) * sBox.width,
          y: sCenterY - (imaginary / 80) * sBox.height,
        };
      }

      var sPoint = mapS(sigma, omega);
      drawDot(context, sPoint.x, sPoint.y, 5.5, colors.gold, "#fff3c4");
      drawLine(context, sPoint.x, sCenterY, sPoint.x, sPoint.y, "rgba(246,196,83,0.35)", 1, [4, 4]);

      var aliasSpacing = TAU / period;
      [-2, -1, 1, 2].forEach(function (copy) {
        var aliasOmega = omega + copy * aliasSpacing;
        if (aliasOmega >= -40 && aliasOmega <= 40) {
          var aliasPoint = mapS(sigma, aliasOmega);
          drawRing(context, aliasPoint.x, aliasPoint.y, 4.5, "rgba(246,196,83,0.5)", 1.3);
          drawLine(
            context,
            aliasPoint.x,
            aliasPoint.y,
            sPoint.x,
            sPoint.y,
            "rgba(246,196,83,0.15)",
            1,
            [3, 5],
          );
        }
      });

      var zCenterX = zBox.x + zBox.width / 2;
      var zCenterY = zBox.y + zBox.height / 2;
      var zScale = Math.min(zBox.width, zBox.height) / 3.45;
      context.save();
      context.beginPath();
      context.arc(zCenterX, zCenterY, zScale, 0, TAU);
      context.fillStyle = colors.greenFill;
      context.fill();
      context.restore();
      drawPlotGrid(context, zBox, 4, 4);
      drawLine(context, zBox.x, zCenterY, zBox.x + zBox.width, zCenterY, colors.axis, 1.2);
      drawLine(context, zCenterX, zBox.y, zCenterX, zBox.y + zBox.height, colors.axis, 1.2);
      drawRing(context, zCenterX, zCenterY, zScale, colors.blue, 1.8);
      drawText(context, "Re(z)", zBox.x + zBox.width - 2, zCenterY - 7, { align: "right" });
      drawText(context, "Im(z)", zCenterX + 6, zBox.y + 12);
      drawText(context, "|z| = 1", zCenterX + zScale * 0.7, zCenterY - zScale * 0.72, {
        color: colors.blue,
        size: 11,
      });

      var zPointX = zCenterX + zReal * zScale;
      var zPointY = zCenterY - zImaginary * zScale;
      drawArrow(context, zCenterX, zCenterY, zPointX, zPointY, colors.gold, 2);
      drawDot(context, zPointX, zPointY, 5.5, colors.gold, "#fff3c4");

      var sourceX = sBox.x + sBox.width + 7;
      var destinationX = zBox.x - 7;
      drawArrow(context, sourceX, height / 2, destinationX, height / 2, "rgba(246,196,83,0.72)", 1.7);

      var stability;
      if (Math.abs(sigma) < 0.0001) stability = "不衰减，落在单位圆上";
      else if (sigma < 0) stability = "随采样衰减，落在单位圆内";
      else stability = "随采样增长，落在单位圆外";
      var aliasFrequency = TAU / period;
      readout.innerHTML =
        "s = <strong>" +
        complexLabel(sigma, omega, 2) +
        "</strong> 映射为 z = <strong>" +
        complexLabel(zReal, zImaginary, 4) +
        "</strong>；|z| = " +
        magnitude.toFixed(4) +
        "，Ω = " +
        formatNumber(wrappedAngle, 4) +
        " rad/sample，因此该模态" +
        stability +
        "。连续角频率每相差 " +
        aliasFrequency.toFixed(2) +
        " rad/s 会映射到同一离散角度。";
    }

    [sigmaInput, omegaInput, periodInput].forEach(function (input) {
      input.addEventListener("input", draw);
    });
    observeResize(root, draw);
    draw();
  }

  function setupNotchLab(root) {
    var canvas = root.querySelector('[data-role="notch-canvas"]');
    var frequencyInput = root.querySelector('[data-role="frequency"]');
    var radiusInput = root.querySelector('[data-role="radius"]');
    var sweepInput = root.querySelector('[data-role="sweep"]');
    var frequencyOutput = root.querySelector('[data-role="frequency-output"]');
    var radiusOutput = root.querySelector('[data-role="radius-output"]');
    var sweepOutput = root.querySelector('[data-role="sweep-output"]');
    var toggle = root.querySelector('[data-role="toggle"]');
    var readout = root.querySelector('[data-role="readout"]');
    if (
      !canvas ||
      !frequencyInput ||
      !radiusInput ||
      !sweepInput ||
      !frequencyOutput ||
      !radiusOutput ||
      !sweepOutput ||
      !toggle ||
      !readout
    ) {
      return;
    }

    var sampleRate = 1000;
    var paused = reduceMotion;
    var sweepFrequency = Number(sweepInput.value);
    var lastTimestamp = 0;
    var lastPaint = 0;
    var visible = true;
    var sweepDirection = 1;
    var animationFrame = 0;
    var responseCurveCache = null;
    var responseCurveKey = "";
    if (reduceMotion) root.classList.add("is-static");

    function distance(angle, radius, poleAngle) {
      var real = Math.cos(angle) - radius * Math.cos(poleAngle);
      var imaginary = Math.sin(angle) - radius * Math.sin(poleAngle);
      return Math.hypot(real, imaginary);
    }

    function responseMagnitude(frequency, targetFrequency, poleRadius) {
      var angle = TAU * frequency / sampleRate;
      var targetAngle = TAU * targetFrequency / sampleRate;
      var numerator = distance(angle, 1, targetAngle) * distance(angle, 1, -targetAngle);
      var denominator =
        distance(angle, poleRadius, targetAngle) *
        distance(angle, poleRadius, -targetAngle);
      var cosine = Math.cos(targetAngle);
      var gain =
        (1 - 2 * poleRadius * cosine + poleRadius * poleRadius) /
        (2 - 2 * cosine);
      return denominator > 1e-12 ? (gain * numerator) / denominator : 0;
    }

    function responseDb(frequency, targetFrequency, poleRadius) {
      return 20 * Math.log10(Math.max(responseMagnitude(frequency, targetFrequency, poleRadius), 1e-6));
    }

    function responseCurve(targetFrequency, poleRadius) {
      var key = targetFrequency.toFixed(3) + "|" + poleRadius.toFixed(6);
      if (responseCurveCache && key === responseCurveKey) return responseCurveCache;

      var frequencies = [];
      var pointCount = 1000;
      for (var index = 0; index <= pointCount; index += 1) {
        frequencies.push((sampleRate / 2) * index / pointCount);
      }
      frequencies.push(targetFrequency);
      frequencies.sort(function (left, right) {
        return left - right;
      });

      var maximum = -Infinity;
      var points = frequencies.map(function (frequency) {
        var db = responseDb(frequency, targetFrequency, poleRadius);
        maximum = Math.max(maximum, db);
        return { frequency: frequency, db: db };
      });

      responseCurveKey = key;
      responseCurveCache = { points: points, maximum: maximum };
      return responseCurveCache;
    }

    function draw() {
      var prepared = prepareCanvas(canvas);
      var context = prepared.context;
      var width = prepared.width;
      var height = prepared.height;
      clearCanvas(context, width, height);

      var targetFrequency = Number(frequencyInput.value);
      var poleRadius = Number(radiusInput.value);
      sweepFrequency = clamp(sweepFrequency, 0, sampleRate / 2);
      sweepInput.value = String(Math.round(sweepFrequency));
      frequencyOutput.textContent = Math.round(targetFrequency) + " Hz";
      radiusOutput.textContent = poleRadius.toFixed(3);
      sweepOutput.textContent = Math.round(sweepFrequency) + " Hz";

      var compact = width < 600;
      var padding = compact ? 15 : 25;
      var gap = compact ? 18 : 34;
      var leftWidth = Math.min(width * 0.39, height * 0.88);
      var rightX = padding + leftWidth + gap;
      var rightWidth = width - rightX - padding;
      var titleY = 20;

      drawText(context, "z 平面", padding, titleY, { color: colors.text, size: 14, weight: 750 });
      drawText(context, "幅频响应 / dB", rightX, titleY, {
        color: colors.text,
        size: 14,
        weight: 750,
      });

      var planeSize = Math.min(leftWidth, height - 52);
      var centerX = padding + leftWidth / 2;
      var centerY = 31 + (height - 42) / 2;
      var unitRadius = planeSize * 0.39;
      drawLine(context, centerX - unitRadius - 10, centerY, centerX + unitRadius + 10, centerY, colors.axis, 1.1);
      drawLine(context, centerX, centerY - unitRadius - 10, centerX, centerY + unitRadius + 10, colors.axis, 1.1);
      context.save();
      context.beginPath();
      context.arc(centerX, centerY, unitRadius, 0, TAU);
      context.fillStyle = colors.greenFill;
      context.fill();
      context.restore();
      drawRing(context, centerX, centerY, unitRadius, colors.blue, 1.8);
      drawText(context, "单位圆", centerX + unitRadius * 0.62, centerY - unitRadius * 0.72, {
        color: colors.blue,
        size: 10,
      });

      var targetAngle = TAU * targetFrequency / sampleRate;
      var sweepAngle = TAU * sweepFrequency / sampleRate;
      var zeroPoints = [targetAngle, -targetAngle].map(function (angle) {
        return {
          x: centerX + Math.cos(angle) * unitRadius,
          y: centerY - Math.sin(angle) * unitRadius,
        };
      });
      var polePoints = [targetAngle, -targetAngle].map(function (angle) {
        return {
          x: centerX + poleRadius * Math.cos(angle) * unitRadius,
          y: centerY - poleRadius * Math.sin(angle) * unitRadius,
        };
      });
      var evaluationPoint = {
        x: centerX + Math.cos(sweepAngle) * unitRadius,
        y: centerY - Math.sin(sweepAngle) * unitRadius,
      };

      zeroPoints.forEach(function (point) {
        drawLine(
          context,
          evaluationPoint.x,
          evaluationPoint.y,
          point.x,
          point.y,
          "rgba(77,228,209,0.34)",
          1,
        );
        drawRing(context, point.x, point.y, compact ? 4.5 : 6, colors.cyan, 2.2);
      });
      polePoints.forEach(function (point) {
        drawLine(
          context,
          evaluationPoint.x,
          evaluationPoint.y,
          point.x,
          point.y,
          "rgba(251,113,133,0.32)",
          1,
        );
        drawCross(context, point.x, point.y, compact ? 4 : 5.5, colors.coral, 2.2);
      });
      drawArrow(context, centerX, centerY, evaluationPoint.x, evaluationPoint.y, colors.gold, 1.8);
      drawDot(context, evaluationPoint.x, evaluationPoint.y, 4.5, colors.gold, "#fff4c2");

      if (!compact) {
        drawText(context, "○ 零点", padding, height - 12, { color: colors.cyan, size: 11 });
        drawText(context, "× 极点", padding + 64, height - 12, { color: colors.coral, size: 11 });
        drawText(context, "● 扫频点", padding + 126, height - 12, { color: colors.gold, size: 11 });
      }

      var graph = {
        x: rightX + 36,
        y: 34,
        width: Math.max(80, rightWidth - 43),
        height: height - 69,
      };
      var minimumDb = -60;
      var curve = responseCurve(targetFrequency, poleRadius);
      var maximumDb = Math.max(6, Math.ceil(curve.maximum / 6) * 6);
      function graphX(frequency) {
        return graph.x + (frequency / (sampleRate / 2)) * graph.width;
      }
      function graphY(db) {
        var clipped = clamp(db, minimumDb, maximumDb);
        return graph.y + ((maximumDb - clipped) / (maximumDb - minimumDb)) * graph.height;
      }

      for (var verticalIndex = 0; verticalIndex <= 5; verticalIndex += 1) {
        var verticalX = graph.x + graph.width * verticalIndex / 5;
        drawLine(context, verticalX, graph.y, verticalX, graph.y + graph.height, colors.grid, 1);
      }
      var yTicks = [-60, -40, -20, 0];
      for (var positiveTick = 20; positiveTick < maximumDb; positiveTick += 20) {
        yTicks.push(positiveTick);
      }
      yTicks.push(maximumDb);
      yTicks = yTicks.filter(function (value, index, values) {
        return values.indexOf(value) === index && value <= maximumDb;
      });
      yTicks.forEach(function (db) {
        drawLine(context, graph.x, graphY(db), graph.x + graph.width, graphY(db), colors.grid, 1);
        drawText(context, db.toString(), graph.x - 7, graphY(db) + 3, {
          align: "right",
          color: colors.muted,
          size: compact ? 9 : 10,
        });
      });
      [0, 250, 500].forEach(function (frequency) {
        drawText(context, frequency.toString(), graphX(frequency), height - 10, {
          align: "center",
          color: colors.muted,
          size: compact ? 9 : 10,
        });
      });
      drawText(context, "Hz", graph.x + graph.width, height - 10, {
        align: "right",
        color: colors.muted,
        size: 10,
      });

      context.save();
      context.beginPath();
      curve.points.forEach(function (point, index) {
        var x = graphX(point.frequency);
        var y = graphY(point.db);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = colors.cyan;
      context.lineWidth = 2.2;
      context.shadowColor = "rgba(77,228,209,0.38)";
      context.shadowBlur = 6;
      context.stroke();
      context.restore();

      var currentDb = responseDb(sweepFrequency, targetFrequency, poleRadius);
      var markerX = graphX(sweepFrequency);
      var markerY = graphY(currentDb);
      drawLine(context, markerX, graph.y, markerX, graph.y + graph.height, "rgba(246,196,83,0.42)", 1);
      drawDot(context, markerX, markerY, 4.2, colors.gold, "#fff4c2");
      drawText(
        context,
        Math.max(currentDb, -120).toFixed(1) + " dB",
        clamp(markerX, graph.x + 30, graph.x + graph.width - 30),
        clamp(markerY - 9, graph.y + 12, graph.y + graph.height - 7),
        { align: "center", color: colors.gold, size: 10, weight: 750 },
      );

      var decaySamples = -1 / Math.log(poleRadius);
      var decayMilliseconds = (1000 * decaySamples) / sampleRate;
      var peakNote =
        curve.maximum > 6
          ? " 远离陷波处的最高增益约为 " + curve.maximum.toFixed(1) + " dB。"
          : "";
      readout.innerHTML =
        "当前扫频点为 <strong>" +
        Math.round(sweepFrequency) +
        " Hz</strong>，幅值约 " +
        Math.max(currentDb, -120).toFixed(2) +
        " dB。极点包络时间常数约 <strong>" +
        decaySamples.toFixed(1) +
        " 个样本（" +
        decayMilliseconds.toFixed(1) +
        " ms）</strong>；r 越接近 1，陷波越窄而暂态越长。";
      if (peakNote) readout.innerHTML += peakNote;
    }

    function syncToggle() {
      toggle.textContent = paused ? "播放扫频" : "暂停扫频";
    }

    frequencyInput.addEventListener("input", draw);
    radiusInput.addEventListener("input", draw);
    sweepInput.addEventListener("input", function () {
      sweepFrequency = Number(sweepInput.value);
      draw();
    });
    toggle.addEventListener("click", function () {
      paused = !paused;
      if (!paused) root.classList.remove("is-static");
      lastTimestamp = 0;
      syncToggle();
      scheduleAnimation();
    });

    function scheduleAnimation() {
      if (!animationFrame && !paused && visible && !document.hidden) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    function animate(timestamp) {
      animationFrame = 0;
      if (!lastTimestamp) lastTimestamp = timestamp;
      var delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;
      if (!paused && !document.hidden && visible) {
        sweepFrequency += delta * 62.5 * sweepDirection;
        if (sweepFrequency >= sampleRate / 2) {
          sweepFrequency = sampleRate / 2;
          sweepDirection = -1;
        } else if (sweepFrequency <= 0) {
          sweepFrequency = 0;
          sweepDirection = 1;
        }
      }
      if (!paused && visible && timestamp - lastPaint > 32) {
        draw();
        lastPaint = timestamp;
      }
      scheduleAnimation();
    }

    observeResize(root, draw);
    observeVisibility(root, function (isVisible) {
      visible = isVisible;
      lastTimestamp = 0;
      if (visible) {
        draw();
        scheduleAnimation();
      }
    });
    document.addEventListener("visibilitychange", scheduleAnimation);
    syncToggle();
    draw();
    scheduleAnimation();
  }

  function initialize() {
    document.querySelectorAll('[data-transform-lab="fourier"]').forEach(setupFourierLab);
    document.querySelectorAll('[data-transform-lab="mapping"]').forEach(setupMappingLab);
    document.querySelectorAll('[data-transform-lab="notch"]').forEach(setupNotchLab);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
