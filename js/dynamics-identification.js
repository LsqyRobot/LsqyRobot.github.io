(function () {
  "use strict";

  var form = document.querySelector("#dynamics-identification-form");
  if (!form) {
    return;
  }

  var MAX_REQUEST_BYTES = 12 * 1024 * 1024;
  var MODES = {
    fixed: {
      examples: {
        urdf: "/tools/dynamics-identification/examples/two_link.urdf",
        csv: "/tools/dynamics-identification/examples/two_link_data.csv"
      },
      exampleNames: { urdf: "two_link.urdf", csv: "two_link_data.csv" },
      exampleButton: "载入双连杆示例",
      exampleCopy: "先用仓库内固定基示例验证完整链路，再替换成自己的数据。",
      readyCopy: "双连杆 URDF 与实验 CSV 已载入，可以开始辨识。",
      uploadDetails: {
        urdf: "固定基；支持 revolute / continuous / prismatic",
        csv: "每个关节提供 q、dq、ddq 与 tau 列"
      },
      csvConvention: "固定基 CSV：time（可选），以及每个可动关节的 q_<joint>、dq_<joint>、ddq_<joint>、tau_<joint>。可直接参照双连杆示例。",
      modelLabel: "fixed base",
      engineLabel: "C++ RNEA",
      solverLabel: "临时文件交给 C++ RNEA 求解器"
    },
    floating: {
      examples: {
        urdf: "/tools/dynamics-identification/examples/floating_quadruped.urdf",
        csv: "/tools/dynamics-identification/examples/floating_quadruped_data.csv"
      },
      exampleNames: {
        urdf: "floating_quadruped.urdf",
        csv: "floating_quadruped_data.csv"
      },
      exampleButton: "载入浮动基四足示例",
      exampleCopy: "CSV v2 示例包含 FreeFlyer 状态、关节量和世界系已知接触力。",
      readyCopy: "浮动基四足 URDF 与 CSV v2 已载入，可以调用 Pinocchio 辨识。",
      uploadDetails: {
        urdf: "Pinocchio FreeFlyer；根 link 作为浮动基",
        csv: "CSV v2：基座 pose / LOCAL v,a + 关节量 + 已知接触力"
      },
      csvConvention: "浮动基 CSV v2：base_* 位姿与 LOCAL 线/角速度、加速度，关节 q/dq/ddq/tau；contact_<frame>_fx/fy/fz 是作用于 frame 原点的世界系已知力。",
      modelLabel: "floating base",
      engineLabel: "Pinocchio sidecar",
      solverLabel: "临时文件交给 Pinocchio sidecar"
    }
  };
  var UPLOAD_TITLES = {
    urdf: "拖入或选择 URDF",
    csv: "拖入或选择 CSV"
  };
  var PARAMETER_KEYS = [
    "parameters",
    "identified_parameters",
    "parameter_estimates",
    "base_parameters",
    "theta"
  ];

  var elements = {
    message: document.querySelector("[data-message]"),
    healthState: document.querySelector("[data-health-state]"),
    healthRetry: document.querySelector("[data-health-retry]"),
    runtimeState: document.querySelector("[data-runtime-state]"),
    runButton: document.querySelector("[data-run-identification]"),
    resetButton: document.querySelector("[data-reset-identification]"),
    exampleButton: document.querySelector("[data-load-example]"),
    results: document.querySelector("[data-results]"),
    resultSummary: document.querySelector("[data-result-summary]"),
    resultWarnings: document.querySelector("[data-result-warnings]"),
    resultWarningList: document.querySelector("[data-result-warning-list]"),
    metricsBody: document.querySelector("[data-metrics-body]"),
    parametersBody: document.querySelector("[data-parameters-body]"),
    metricCount: document.querySelector("[data-metric-count]"),
    parameterCount: document.querySelector("[data-parameter-count]"),
    rawResult: document.querySelector("[data-raw-result]"),
    downloadButton: document.querySelector("[data-download-result]"),
    resultEngine: document.querySelector("[data-result-engine]"),
    resultBaseMode: document.querySelector("[data-result-base-mode]"),
    resultContactFrames: document.querySelector("[data-result-contact-frames]"),
    baseMode: document.querySelector("#dynamics-base"),
    modelState: document.querySelector("[data-model-state]"),
    engineState: document.querySelector("[data-engine-state]"),
    exampleCopy: document.querySelector("[data-example-copy]"),
    csvConvention: document.querySelector("[data-csv-convention]"),
    solverProcessLabel: document.querySelector("[data-solver-process-label]"),
    validationRatio: document.querySelector("#dynamics-validation"),
    ridge: document.querySelector("#dynamics-ridge"),
    rankTolerance: document.querySelector("#dynamics-rank-tolerance"),
    friction: document.querySelector("#dynamics-friction")
  };

  var state = {
    uploads: { urdf: null, csv: null },
    healthPayload: null,
    backendReady: false,
    running: false,
    loadingExample: false,
    lastResult: null
  };

  function selectedBaseMode() {
    return elements.baseMode && elements.baseMode.value === "floating" ? "floating" : "fixed";
  }

  function modeConfig() {
    return MODES[selectedBaseMode()];
  }

  function updateModeCopy() {
    var config = modeConfig();
    elements.exampleButton.textContent = config.exampleButton;
    elements.exampleCopy.textContent = config.exampleCopy;
    elements.csvConvention.textContent = config.csvConvention;
    elements.modelState.textContent = config.modelLabel;
    elements.engineState.textContent = config.engineLabel;
    elements.solverProcessLabel.textContent = config.solverLabel;
    ["urdf", "csv"].forEach(function (kind) {
      if (state.uploads[kind]) {
        return;
      }
      var detail = document.querySelector('[data-upload-detail="' + kind + '"]');
      if (detail) {
        detail.textContent = config.uploadDetails[kind];
      }
    });
  }

  function floatingHealth(payload) {
    if (!payload) {
      return null;
    }
    return (payload.backends && payload.backends.floating) ||
      (payload.solvers && payload.solvers.floating) ||
      null;
  }

  function floatingHealthDetail(payload) {
    var health = floatingHealth(payload);
    if (!health) {
      return "健康响应未包含 backends.floating";
    }
    if (health.error) {
      var detail = health.error.message || health.error.code || "sidecar 未就绪";
      if (health.error.details) {
        detail += "：" + health.error.details;
      }
      return detail;
    }
    return health.backend ? "后端 " + health.backend + " 未就绪" : "sidecar 未返回就绪状态";
  }

  function applyHealthForMode(showSuccess) {
    var payload = state.healthPayload;
    var mode = selectedBaseMode();
    var fixedReady = Boolean(payload && payload.ok === true);
    var sidecarReady = Boolean(floatingHealth(payload) && floatingHealth(payload).ok === true);
    state.backendReady = fixedReady && (mode === "fixed" || sidecarReady);

    elements.healthState.classList.remove("is-ready", "is-error");
    elements.runtimeState.classList.remove("is-updated");
    if (state.backendReady) {
      elements.healthState.textContent = "ready";
      elements.healthState.classList.add("is-ready");
      elements.runtimeState.textContent = "READY FOR INPUT";
      elements.runtimeState.classList.add("is-updated");
      elements.engineState.textContent = modeConfig().engineLabel + " · ready";
      markProcess("backend", true, false);
      if (showSuccess) {
        setMessage(
          mode === "floating"
            ? "Docker 计算服务与 Pinocchio 浮动基 sidecar 均已就绪。"
            : "Docker 计算服务与固定基 C++ 求解器均已就绪。",
          "success"
        );
      } else if (elements.message && elements.message.classList.contains("di-message-warning")) {
        clearMessage();
      }
    } else if (mode === "floating" && fixedReady) {
      elements.healthState.textContent = "sidecar offline";
      elements.healthState.classList.add("is-error");
      elements.runtimeState.textContent = "PINOCCHIO SIDECAR OFFLINE";
      elements.engineState.textContent = "Pinocchio sidecar · unavailable";
      markProcess("backend", false, false);
      setMessage(
        "Pinocchio 浮动基 sidecar 未就绪：" + floatingHealthDetail(payload) +
          "。固定基模式仍可使用；浮动基需要先启动或修复 sidecar。",
        "warning"
      );
    }
    updateRunButton();
  }

  function apiUrl(path) {
    var workbench = window.RoboticsWorkbench;
    return workbench && typeof workbench.apiUrl === "function"
      ? workbench.apiUrl(path)
      : path;
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "0 B";
    }
    var units = ["B", "KB", "MB"];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
  }

  function setMessage(text, kind) {
    if (!elements.message) {
      return;
    }
    elements.message.textContent = text;
    elements.message.className = "di-message" + (kind ? " di-message-" + kind : "");
    elements.message.hidden = !text;
  }

  function clearMessage() {
    setMessage("", "");
  }

  function markProcess(name, active, running) {
    var item = document.querySelector('[data-process="' + name + '"]');
    if (!item) {
      return;
    }
    item.classList.toggle("is-previewed", Boolean(active));
    item.classList.toggle("is-running", Boolean(running));
  }

  function updateRunButton() {
    var busy = state.running || state.loadingExample;
    elements.runButton.disabled = busy || !state.backendReady || !state.uploads.urdf || !state.uploads.csv;
    document.querySelectorAll("[data-upload-input]").forEach(function (input) {
      input.disabled = busy;
    });
    elements.resetButton.disabled = busy;
    elements.exampleButton.disabled = busy;
    elements.healthRetry.disabled = busy;
    elements.validationRatio.disabled = busy;
    elements.ridge.disabled = busy;
    elements.rankTolerance.disabled = busy;
    elements.friction.disabled = busy;
    elements.baseMode.disabled = busy;
  }

  function validateUpload(kind, file) {
    var lowerName = file.name.toLowerCase();
    if (kind === "urdf" && !lowerName.endsWith(".urdf")) {
      throw new Error("机器人模型必须是 .urdf 文件；当前不解析 Xacro、DH 或 MDH。");
    }
    if (kind === "csv" && !lowerName.endsWith(".csv")) {
      throw new Error("实验数据必须是 .csv 文件。");
    }
    if (file.size > MAX_REQUEST_BYTES) {
      throw new Error(file.name + " 超过 12 MB 请求上限。");
    }
  }

  function setUpload(kind, upload) {
    if (state.running) {
      throw new Error("辨识运行中，暂时不能替换输入文件。");
    }
    if (state.loadingExample && !upload.example) {
      throw new Error("示例正在载入，请稍后再替换输入文件。");
    }
    validateUpload(kind, upload);
    state.uploads[kind] = upload;

    var dropZone = document.querySelector('[data-drop-zone="' + kind + '"]');
    var title = document.querySelector('[data-upload-title="' + kind + '"]');
    var detail = document.querySelector('[data-upload-detail="' + kind + '"]');
    if (dropZone) {
      dropZone.classList.add("has-file");
    }
    if (title) {
      title.textContent = upload.name;
    }
    if (detail) {
      detail.textContent = formatBytes(upload.size) + (upload.example ? " · 仓库示例" : " · 本地文件") + " · 已就绪";
    }

    markProcess("input", Boolean(state.uploads.urdf && state.uploads.csv), false);
    clearResult();
    if (state.backendReady) {
      clearMessage();
    } else {
      setMessage(
        "文件已就绪，但当前模式的计算后端尚未就绪。" +
          (selectedBaseMode() === "floating" ? "请检查 Docker 服务与 Pinocchio sidecar。" : "请检查 Docker 服务。"),
        "warning"
      );
    }
    updateRunButton();
  }

  function resetUpload(kind) {
    state.uploads[kind] = null;
    var input = document.querySelector('[data-upload-input="' + kind + '"]');
    var dropZone = document.querySelector('[data-drop-zone="' + kind + '"]');
    var title = document.querySelector('[data-upload-title="' + kind + '"]');
    var detail = document.querySelector('[data-upload-detail="' + kind + '"]');
    if (input) {
      input.value = "";
    }
    if (dropZone) {
      dropZone.classList.remove("has-file", "is-dragover");
    }
    if (title) {
      title.textContent = UPLOAD_TITLES[kind];
    }
    if (detail) {
      detail.textContent = modeConfig().uploadDetails[kind];
    }
  }

  function initializeUploads() {
    document.querySelectorAll("[data-upload-input]").forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) {
          return;
        }
        try {
          setUpload(input.dataset.uploadInput, file);
        } catch (error) {
          input.value = "";
          setMessage(error.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-drop-zone]").forEach(function (dropZone) {
      ["dragenter", "dragover"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
          }
          dropZone.classList.add("is-dragover");
        });
      });
      ["dragleave", "drop"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          dropZone.classList.remove("is-dragover");
        });
      });
      dropZone.addEventListener("drop", function (event) {
        if (state.running || state.loadingExample) {
          setMessage("当前操作尚未完成，请稍后再替换输入文件。", "warning");
          return;
        }
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) {
          return;
        }
        try {
          setUpload(dropZone.dataset.dropZone, file);
        } catch (error) {
          setMessage(error.message, "error");
        }
      });
    });
  }

  async function responseJson(response) {
    var text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  }

  function apiError(payload, response, pinocchioContext) {
    if (payload && payload.error) {
      if (typeof payload.error === "string") {
        return payload.error;
      }
      var code = payload.error.code || "";
      var message = payload.error.message || code || "请求失败";
      if (payload.error.details) {
        message += "：" + payload.error.details;
      }
      if (pinocchioContext || code.indexOf("FLOATING_BACKEND") !== -1 || code.indexOf("PINOCCHIO") !== -1) {
        return "Pinocchio 浮动基 sidecar：" + message;
      }
      return message;
    }
    return "Docker 计算服务返回 HTTP " + response.status + "，但没有可读取的 JSON 错误信息。";
  }

  async function checkHealth(showSuccess) {
    state.healthPayload = null;
    state.backendReady = false;
    elements.healthState.textContent = "checking";
    elements.healthState.classList.remove("is-ready", "is-error");
    elements.runtimeState.textContent = "CHECKING BACKEND";
    elements.runtimeState.classList.remove("is-updated");
    markProcess("backend", false, true);
    updateRunButton();

    try {
      var response = await fetch(apiUrl("/api/dynamics/health"), { cache: "no-store" });
      var payload = await responseJson(response);
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(apiError(payload, response, false));
      }
      state.healthPayload = payload;
      applyHealthForMode(showSuccess);
    } catch (error) {
      state.healthPayload = null;
      state.backendReady = false;
      elements.healthState.textContent = "offline";
      elements.healthState.classList.add("is-error");
      elements.runtimeState.textContent = "BACKEND OFFLINE";
      elements.runtimeState.classList.remove("is-updated");
      elements.engineState.textContent = modeConfig().engineLabel + " · unavailable";
      markProcess("backend", false, false);
      setMessage(
        "Docker 计算服务不可用：" + error.message +
          "。请确认服务已启动并检查 API 地址；浮动基还需要 Pinocchio sidecar 健康。",
        "warning"
      );
    } finally {
      updateRunButton();
    }
  }

  async function loadExamples() {
    if (state.loadingExample || state.running) {
      return;
    }
    var previousText = elements.exampleButton.textContent;
    state.loadingExample = true;
    var config = modeConfig();
    var selectedMode = selectedBaseMode();
    updateRunButton();
    elements.exampleButton.textContent = "正在载入…";
    clearMessage();
    try {
      var responses = await Promise.all([
        fetch(config.examples.urdf, { cache: "no-store" }),
        fetch(config.examples.csv, { cache: "no-store" })
      ]);
      responses.forEach(function (response) {
        if (!response.ok) {
          throw new Error("示例文件返回 HTTP " + response.status);
        }
      });
      var contents = await Promise.all(responses.map(function (response) { return response.text(); }));
      var urdf = { name: config.exampleNames.urdf, text: contents[0], size: new Blob([contents[0]]).size, example: true };
      var csv = { name: config.exampleNames.csv, text: contents[1], size: new Blob([contents[1]]).size, example: true };
      setUpload("urdf", urdf);
      setUpload("csv", csv);
      if (state.backendReady) {
        setMessage(config.readyCopy, "success");
      } else {
        setMessage(
          (selectedMode === "floating" ? "浮动基示例" : "双连杆示例") +
            "已载入，但当前模式的计算后端尚未就绪。请检查 Docker 服务" +
            (selectedMode === "floating" ? "与 Pinocchio sidecar。" : "。"),
          "warning"
        );
      }
    } catch (error) {
      setMessage("示例载入失败：" + error.message, "error");
    } finally {
      state.loadingExample = false;
      elements.exampleButton.textContent = previousText;
      updateRunButton();
    }
  }

  async function uploadText(upload) {
    if (typeof upload.text === "string") {
      return upload.text;
    }
    return upload.text();
  }

  function numericOption(input, label, minimum, maximum, strictMinimum) {
    var raw = input.value.trim();
    if (!raw) {
      return undefined;
    }
    var value = Number(raw);
    var lowerInvalid = strictMinimum ? value <= minimum : value < minimum;
    if (!Number.isFinite(value) || lowerInvalid || (maximum !== undefined && value >= maximum)) {
      throw new Error(label + "的取值无效。");
    }
    return value;
  }

  function collectOptions() {
    var options = { baseMode: selectedBaseMode() };
    var validationRatio = numericOption(elements.validationRatio, "验证集比例", 0, 0.8, false);
    var ridge = numericOption(elements.ridge, "URDF 先验系数", 0, undefined, false);
    var rankTolerance = numericOption(elements.rankTolerance, "秩判定容差", 1e-8, undefined, false);
    if (rankTolerance !== undefined && rankTolerance > 1e-2) {
      throw new Error("秩判定容差必须小于或等于 0.01。");
    }
    if (validationRatio !== undefined) {
      options.validationRatio = validationRatio;
    }
    if (ridge !== undefined) {
      options.ridge = ridge;
    }
    if (rankTolerance !== undefined) {
      options.rankTolerance = rankTolerance;
    }
    if (elements.friction.value) {
      options.friction = elements.friction.value;
    }
    return options;
  }

  function unwrapResult(payload) {
    if (payload && payload.ok === true && payload.result && typeof payload.result === "object") {
      return payload.result;
    }
    return payload;
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function findParameterValue(value, depth) {
    if (!isPlainObject(value) || depth > 4) {
      return null;
    }
    for (var index = 0; index < PARAMETER_KEYS.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, PARAMETER_KEYS[index])) {
        return value[PARAMETER_KEYS[index]];
      }
    }
    var nestedKeys = Object.keys(value);
    for (var nestedIndex = 0; nestedIndex < nestedKeys.length; nestedIndex += 1) {
      var nested = value[nestedKeys[nestedIndex]];
      var found = findParameterValue(nested, depth + 1);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  function formatValue(value) {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return String(value);
      }
      var absolute = Math.abs(value);
      if (absolute >= 100000 || (absolute > 0 && absolute < 0.0001)) {
        return value.toExponential(6);
      }
      return value.toLocaleString("zh-CN", { maximumSignificantDigits: 9, useGrouping: false });
    }
    if (value === null || value === undefined || value === "") {
      return "—";
    }
    if (Array.isArray(value)) {
      return value.map(formatValue).join(", ");
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function parameterExtra(item) {
    if (Object.prototype.hasOwnProperty.call(item, "estimate") &&
        Object.prototype.hasOwnProperty.call(item, "nominal")) {
      var details = [];
      if (item.unit) {
        details.push("unit=" + item.unit);
      }
      details.push("nominal=" + formatValue(item.nominal));
      if (item.delta !== undefined) {
        details.push("delta=" + formatValue(item.delta));
      }
      if (item.excited !== undefined) {
        details.push(item.excited ? "excited" : "not excited");
      }
      return details.join(" · ");
    }
    var excluded = ["name", "parameter", "label", "key", "value", "estimate", "estimated_value"];
    return Object.keys(item).filter(function (key) {
      return excluded.indexOf(key) === -1 && item[key] !== undefined && item[key] !== null;
    }).slice(0, 4).map(function (key) {
      return key.replaceAll("_", " ") + "=" + formatValue(item[key]);
    }).join(" · ");
  }

  function flattenParameterObject(value, prefix, rows, depth) {
    if (depth > 5 || rows.length >= 500) {
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (rows.length >= 500) {
        return;
      }
      var item = value[key];
      var name = prefix ? prefix + "." + key : key;
      if (typeof item === "number" || typeof item === "string" || typeof item === "boolean") {
        rows.push({ name: name, value: item, extra: "" });
      } else if (isPlainObject(item)) {
        var estimate = item.value !== undefined ? item.value : (item.estimate !== undefined ? item.estimate : item.estimated_value);
        if (estimate !== undefined) {
          rows.push({ name: item.name || item.parameter || name, value: estimate, extra: parameterExtra(item) });
        } else {
          flattenParameterObject(item, name, rows, depth + 1);
        }
      } else if (Array.isArray(item) && item.every(function (entry) { return typeof entry === "number"; })) {
        item.forEach(function (entry, index) {
          rows.push({ name: name + "[" + index + "]", value: entry, extra: "" });
        });
      }
    });
  }

  function normalizeParameters(root) {
    var source = findParameterValue(root, 0);
    var rows = [];
    if (source === null || source === undefined) {
      return rows;
    }
    if (Array.isArray(source)) {
      source.forEach(function (item, index) {
        if (isPlainObject(item)) {
          var name = item.name || item.parameter || item.label || item.key || "theta[" + index + "]";
          var value = item.value !== undefined ? item.value : (item.estimate !== undefined ? item.estimate : item.estimated_value);
          rows.push({ name: name, value: value, extra: parameterExtra(item) });
        } else {
          rows.push({ name: "theta[" + index + "]", value: item, extra: "" });
        }
      });
    } else if (isPlainObject(source)) {
      if (Array.isArray(source.names) && Array.isArray(source.values)) {
        source.values.forEach(function (value, index) {
          rows.push({ name: source.names[index] || "theta[" + index + "]", value: value, extra: "" });
        });
      } else {
        flattenParameterObject(source, "", rows, 0);
      }
    }
    return rows;
  }

  function isParameterKey(key) {
    return PARAMETER_KEYS.indexOf(key.toLowerCase()) !== -1;
  }

  function metricItemLabel(item, index) {
    if (!isPlainObject(item)) {
      return "[" + index + "]";
    }
    return item.joint || item.component || item.axis || item.frame || item.name || "[" + index + "]";
  }

  function flattenMetrics(value, prefix, rows, depth, group) {
    if (rows.length >= 500 || depth > 6 || value === null || value === undefined) {
      return;
    }
    if (typeof value !== "object") {
      rows.push({ name: prefix || "result", value: value, group: group });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length <= 20 && value.every(function (item) { return typeof item !== "object"; })) {
        rows.push({ name: prefix, value: value, group: group });
      } else {
        value.forEach(function (item, index) {
          if (isPlainObject(item)) {
            flattenMetrics(item, prefix + "." + metricItemLabel(item, index), rows, depth + 1, group);
          }
        });
      }
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (rows.length >= 500 || isParameterKey(key)) {
        return;
      }
      var item = value[key];
      var name = prefix ? prefix + "." + key : key;
      if (["joint", "component", "axis", "frame", "name"].indexOf(key) !== -1 &&
          (typeof item !== "object" || item === null)) {
        return;
      }
      if (typeof item !== "object" || item === null) {
        rows.push({ name: name, value: item, group: group });
      } else if (Array.isArray(item)) {
        if (item.length <= 20 && item.every(function (entry) { return typeof entry !== "object"; })) {
          rows.push({ name: name, value: item, group: group });
        } else {
          flattenMetrics(item, name, rows, depth + 1, group);
        }
      } else {
        flattenMetrics(item, name, rows, depth + 1, group);
      }
    });
  }

  function normalizeMetrics(root) {
    var rows = [];
    if (root && isPlainObject(root.metrics)) {
      Object.keys(root.metrics).forEach(function (key) {
        if (["base", "joints", "by_joint"].indexOf(key) === -1) {
          flattenMetrics(root.metrics[key], "metrics." + key, rows, 0, "总体拟合");
        }
      });
      if (root.metrics.base) {
        flattenMetrics(root.metrics.base, "metrics.base", rows, 0, "基座 6D");
      }
      if (root.metrics.joints) {
        flattenMetrics(root.metrics.joints, "metrics.joints", rows, 0, "关节总体");
      }
      if (root.metrics.by_joint) {
        flattenMetrics(root.metrics.by_joint, "metrics.by_joint", rows, 0, "逐关节");
      }
    }
    [
      ["diagnostics", "求解诊断"],
      ["data", "数据集"],
      ["model", "模型"],
      ["summary", "其他"],
      ["fit", "其他"],
      ["validation", "其他"],
      ["dataset", "数据集"],
      ["solver", "求解诊断"]
    ].forEach(function (entry) {
      var key = entry[0];
      if (root && Object.prototype.hasOwnProperty.call(root, key)) {
        flattenMetrics(root[key], key, rows, 0, entry[1]);
      }
    });
    if (!rows.length) {
      flattenMetrics(root, "", rows, 0, "结果");
    }
    var seen = new Set();
    return rows.filter(function (row) {
      var identity = row.group + ":" + row.name;
      if (!row.name || seen.has(identity)) {
        return false;
      }
      seen.add(identity);
      return true;
    });
  }

  function humanizeName(name) {
    return name.replaceAll("_", " ").replaceAll(".", " · ");
  }

  function resultMetadata(root) {
    var options = root && isPlainObject(root.options) ? root.options : {};
    var engine = root && root.engine;
    var baseMode = root && root.base_mode;
    if (!baseMode) {
      baseMode = options.base_mode;
    }
    if (!baseMode) {
      baseMode = options.fixed_base === false ? "floating" : "fixed";
    }
    var engineName = typeof engine === "string" ? engine : (engine && (engine.name || engine.backend));
    if (!engineName) {
      engineName = baseMode === "floating"
        ? "Pinocchio sidecar（未上报 engine）"
        : "legacy fixed C++（未上报 engine）";
    }
    var contacts = root && root.model && root.model.contact_frames;
    if (!contacts && root) {
      contacts = root.contact_frames || (root.data && root.data.contact_frames);
    }
    var contactsReported = Array.isArray(contacts);
    if (!Array.isArray(contacts)) {
      contacts = [];
    }
    contacts = contacts.map(function (item) {
      return isPlainObject(item) ? (item.frame || item.name || JSON.stringify(item)) : String(item);
    });
    return {
      engine: engineName,
      baseMode: String(baseMode),
      contactFrames: contacts.length
        ? contacts.join(", ")
        : (baseMode === "fixed" ? "不适用（fixed）" : (contactsReported ? "无（0）" : "未上报"))
    };
  }

  function appendCell(row, value) {
    var cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
  }

  function emptyTable(body, columns, text) {
    var row = document.createElement("tr");
    var cell = document.createElement("td");
    cell.colSpan = columns;
    cell.className = "di-empty-cell";
    cell.textContent = text;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function appendMetricGroup(body, label) {
    var row = document.createElement("tr");
    var cell = document.createElement("td");
    row.className = "di-metric-group-row";
    cell.colSpan = 2;
    cell.textContent = label;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function renderResult(payload) {
    var root = unwrapResult(payload);
    var metrics = normalizeMetrics(root);
    var parameters = normalizeParameters(root);
    var metadata = resultMetadata(root);
    var warnings = root && Array.isArray(root.warnings) ? root.warnings : [];
    elements.metricsBody.replaceChildren();
    elements.parametersBody.replaceChildren();
    elements.resultWarningList.replaceChildren();

    var currentGroup = "";
    metrics.forEach(function (metric) {
      if (metric.group !== currentGroup) {
        currentGroup = metric.group;
        appendMetricGroup(elements.metricsBody, currentGroup);
      }
      var row = document.createElement("tr");
      appendCell(row, humanizeName(metric.name));
      appendCell(row, formatValue(metric.value));
      elements.metricsBody.appendChild(row);
    });
    parameters.forEach(function (parameter) {
      var row = document.createElement("tr");
      appendCell(row, parameter.name);
      appendCell(row, formatValue(parameter.value));
      appendCell(row, parameter.extra || "—");
      elements.parametersBody.appendChild(row);
    });
    if (!metrics.length) {
      emptyTable(elements.metricsBody, 2, "CLI 未返回可展开的标量指标，请查看原始 JSON。");
    }
    if (!parameters.length) {
      emptyTable(elements.parametersBody, 3, "CLI 未返回可识别的 parameters 字段，请查看原始 JSON。");
    }
    warnings.forEach(function (warning) {
      var item = document.createElement("li");
      item.textContent = String(warning);
      elements.resultWarningList.appendChild(item);
    });
    elements.resultWarnings.hidden = !warnings.length;

    elements.metricCount.textContent = metrics.length + " items";
    elements.parameterCount.textContent = parameters.length + " items";
    elements.resultEngine.textContent = metadata.engine;
    elements.resultBaseMode.textContent = metadata.baseMode;
    elements.resultContactFrames.textContent = metadata.contactFrames;
    elements.rawResult.textContent = JSON.stringify(payload, null, 2);
    elements.resultSummary.textContent = metadata.engine + "（" + metadata.baseMode + "）已返回 " +
      metrics.length + " 项指标和 " + parameters.length + " 项参数。";
    elements.results.hidden = false;
    elements.downloadButton.disabled = false;
    state.lastResult = payload;
    return warnings.length;
  }

  function clearResult() {
    state.lastResult = null;
    elements.results.hidden = true;
    elements.downloadButton.disabled = true;
    elements.metricsBody.replaceChildren();
    elements.parametersBody.replaceChildren();
    elements.resultWarningList.replaceChildren();
    elements.resultWarnings.hidden = true;
    elements.rawResult.textContent = "";
    elements.resultEngine.textContent = "—";
    elements.resultBaseMode.textContent = "—";
    elements.resultContactFrames.textContent = "—";
    markProcess("solver", false, false);
    markProcess("result", false, false);
  }

  async function runIdentification(event) {
    event.preventDefault();
    if (state.running || state.loadingExample) {
      return;
    }
    if (!state.backendReady) {
      setMessage(
        selectedBaseMode() === "floating"
          ? "Pinocchio 浮动基 sidecar 尚未就绪，请重新检查服务。"
          : "Docker 固定基计算服务尚未就绪，请重新检查服务。",
        "error"
      );
      return;
    }
    if (!state.uploads.urdf || !state.uploads.csv) {
      setMessage("请同时选择 URDF 与 CSV 文件。", "error");
      return;
    }

    var previousText = elements.runButton.textContent;
    state.running = true;
    elements.runButton.textContent = "正在计算…";
    elements.runtimeState.textContent = selectedBaseMode() === "floating"
      ? "PINOCCHIO SOLVER RUNNING"
      : "C++ SOLVER RUNNING";
    clearResult();
    markProcess("solver", false, true);
    clearMessage();
    updateRunButton();

    try {
      var contents = await Promise.all([uploadText(state.uploads.urdf), uploadText(state.uploads.csv)]);
      var request = {
        urdf: contents[0],
        csv: contents[1],
        options: collectOptions()
      };
      var requestJson = JSON.stringify(request);
      var requestBytes = new Blob([requestJson]).size;
      if (requestBytes > MAX_REQUEST_BYTES) {
        throw new Error("URDF、CSV 与 JSON 封装合计 " + formatBytes(requestBytes) + "，超过 12 MB 请求上限。");
      }

      var response = await fetch(apiUrl("/api/dynamics/identify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestJson
      });
      var payload = await responseJson(response);
      if (!response.ok) {
        throw new Error(apiError(payload, response, selectedBaseMode() === "floating"));
      }
      if (payload === null || typeof payload !== "object") {
        throw new Error("求解服务未返回有效 JSON。");
      }

      var warningCount = renderResult(payload);
      markProcess("solver", true, false);
      markProcess("result", true, false);
      elements.runtimeState.textContent = "IDENTIFICATION COMPLETE";
      elements.runtimeState.classList.add("is-updated");
      if (warningCount) {
        setMessage("辨识完成，并返回 " + warningCount + " 条结果解释或警告；请先阅读后再使用参数。", "warning");
      } else {
        setMessage("辨识完成。请结合验证误差、矩阵秩与参数量级判断结果是否可信。", "success");
      }
      var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.results.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    } catch (error) {
      markProcess("solver", false, false);
      elements.runtimeState.textContent = "IDENTIFICATION FAILED";
      elements.runtimeState.classList.remove("is-updated");
      setMessage("辨识失败：" + error.message, "error");
    } finally {
      state.running = false;
      elements.runButton.textContent = previousText;
      updateRunButton();
    }
  }

  function resetAll() {
    form.reset();
    updateModeCopy();
    resetUpload("urdf");
    resetUpload("csv");
    clearMessage();
    applyHealthForMode(false);
    if (!state.backendReady && !state.healthPayload) {
      setMessage("Docker 计算服务尚未启动。请确认服务已启动，并检查 API 地址配置。", "warning");
    }
    clearResult();
    markProcess("input", false, false);
    updateRunButton();
  }

  function changeBaseMode() {
    resetUpload("urdf");
    resetUpload("csv");
    clearResult();
    markProcess("input", false, false);
    clearMessage();
    updateModeCopy();
    applyHealthForMode(false);
    updateRunButton();
  }

  function downloadResult() {
    if (!state.lastResult) {
      return;
    }
    var timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
    var blob = new Blob([JSON.stringify(state.lastResult, null, 2) + "\n"], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "dynamics-identification-" + timestamp + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  updateModeCopy();
  initializeUploads();
  form.addEventListener("submit", runIdentification);
  elements.baseMode.addEventListener("change", changeBaseMode);
  elements.exampleButton.addEventListener("click", loadExamples);
  elements.resetButton.addEventListener("click", resetAll);
  elements.healthRetry.addEventListener("click", function () { checkHealth(true); });
  elements.downloadButton.addEventListener("click", downloadResult);
  checkHealth(false);
})();
