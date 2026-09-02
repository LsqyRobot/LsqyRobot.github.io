(function () {
  "use strict";

  var form = document.querySelector("#robot-calibration-form");
  if (!form) {
    return;
  }

  var MAX_REQUEST_BYTES = 12 * 1024 * 1024;
  var MAX_MODEL_BYTES = 1024 * 1024;
  var MAX_DATA_BYTES = 10 * 1024 * 1024;
  var EXAMPLES = {
    model: "/tools/robot-parameter-calibration/examples/six_axis_standard_dh.csv",
    data: "/tools/robot-parameter-calibration/examples/six_axis_measurements.csv",
    abbModel: "/tools/robot-parameter-calibration/examples/abb_irb120_3_58.urdf",
    abbDemo: "/tools/robot-parameter-calibration/examples/abb_irb120_demo.json"
  };
  var MODEL_COPY = {
    dh: {
      title: "拖入或选择 DH 参数 CSV",
      detail: "标准 DH；一行对应一个关节",
      accept: ".csv,text/csv"
    },
    mdh: {
      title: "拖入或选择 MDH 参数 CSV",
      detail: "Craig Modified DH；一行对应一个关节",
      accept: ".csv,text/csv"
    },
    urdf: {
      title: "拖入或选择 URDF",
      detail: "已展开的固定基 .urdf；不解析 Xacro",
      accept: ".urdf,application/xml,text/xml"
    }
  };
  var FORMULAS = {
    dh: {
      title: "标准 DH 约定",
      formula: "Aᵢ = Rz(θᵢ) · Tz(dᵢ) · Tx(aᵢ) · Rx(αᵢ)"
    },
    mdh: {
      title: "Craig MDH 约定",
      formula: "Aᵢ = Tx(aᵢ₋₁) · Rx(αᵢ₋₁) · Rz(θᵢ) · Tz(dᵢ)"
    },
    urdf: {
      title: "URDF 关节变换约定",
      formula: "Aᵢ(q) = T(originᵢ) · Motion(axisᵢ, qᵢ + δqᵢ)"
    }
  };
  var PARAMETER_KEYS = [
    "parameters",
    "parameter_estimates",
    "calibration_parameters",
    "identified_parameters",
    "corrections",
    "estimates"
  ];

  var elements = {
    message: document.querySelector("[data-rc-message]"),
    healthState: document.querySelector("[data-rc-health-state]"),
    healthRetry: document.querySelector("[data-rc-health-retry]"),
    runtimeState: document.querySelector("[data-rc-runtime-state]"),
    modeHelp: document.querySelector("[data-rc-mode-help]"),
    fileGrid: document.querySelector(".rc-file-grid"),
    measuredPanel: document.querySelector("[data-rc-measured-panel]"),
    closedLoopPanel: document.querySelector("[data-rc-closed-loop-panel]"),
    ikPanel: document.querySelector("[data-rc-ik-panel]"),
    calibrationOnly: document.querySelectorAll("[data-rc-calibration-only]"),
    calibrationNote: document.querySelector("[data-rc-calibration-note]"),
    tipField: document.querySelector("[data-rc-tip-field]"),
    tipLink: document.querySelector("#rc-tip-link"),
    modelInput: document.querySelector("#rc-model-file"),
    dataInput: document.querySelector("#rc-measurement-file"),
    lengthUnit: document.querySelector("#rc-length-unit"),
    angleUnit: document.querySelector("#rc-angle-unit"),
    validationRatio: document.querySelector("#rc-validation-ratio"),
    orientationWeight: document.querySelector("#rc-orientation-weight"),
    huberDelta: document.querySelector("#rc-huber-delta"),
    maxIterations: document.querySelector("#rc-max-iterations"),
    samples: document.querySelector("#rc-samples"),
    seed: document.querySelector("#rc-seed"),
    noisePosition: document.querySelector("#rc-noise-position"),
    noiseOrientation: document.querySelector("#rc-noise-orientation"),
    ikSeed: document.querySelector("#rc-ik-seed"),
    ikStrategy: document.querySelector("#rc-ik-strategy"),
    ikMaxSolutions: document.querySelector("#rc-ik-max-solutions"),
    ikRestarts: document.querySelector("#rc-ik-restarts"),
    ikMaxIterations: document.querySelector("#rc-ik-max-iterations"),
    ikPositionTolerance: document.querySelector("#rc-ik-position-tolerance"),
    ikOrientationTolerance: document.querySelector("#rc-ik-orientation-tolerance"),
    ikOrientationWeight: document.querySelector("#rc-ik-orientation-weight"),
    ikSolutionTolerance: document.querySelector("#rc-ik-solution-tolerance"),
    ikRandomSeed: document.querySelector("#rc-ik-random-seed"),
    ikAllowAssumedLimits: document.querySelector("#rc-ik-allow-assumed-limits"),
    runButton: document.querySelector("[data-rc-run]"),
    inspectButton: document.querySelector("[data-rc-inspect]"),
    resetButton: document.querySelector("[data-rc-reset]"),
    exampleButton: document.querySelector("[data-rc-load-example]"),
    abbDemoButton: document.querySelector("[data-rc-run-abb-demo]"),
    dataProcessCopy: document.querySelector("[data-rc-data-process-copy]"),
    dataProcessCode: document.querySelector("[data-rc-data-process-code]"),
    solverProcessCopy: document.querySelector("[data-rc-solver-process-copy]"),
    solverProcessCode: document.querySelector("[data-rc-solver-process-code]"),
    resultProcessCopy: document.querySelector("[data-rc-result-process-copy]"),
    resultProcessCode: document.querySelector("[data-rc-result-process-code]"),
    formulaTitle: document.querySelector("[data-rc-formula-title]"),
    modelFormula: document.querySelector("[data-rc-model-formula]"),
    inspection: document.querySelector("[data-rc-inspection]"),
    inspectionState: document.querySelector("[data-rc-inspection-state]"),
    inspectionSummary: document.querySelector("[data-rc-inspection-summary]"),
    inspectionList: document.querySelector("[data-rc-inspection-list]"),
    inspectionWarnings: document.querySelector("[data-rc-inspection-warnings]"),
    results: document.querySelector("[data-rc-results]"),
    resultsTitle: document.querySelector("#rc-results-title"),
    resultKicker: document.querySelector("[data-rc-result-kicker]"),
    resultSummary: document.querySelector("[data-rc-result-summary]"),
    resultWarnings: document.querySelector("[data-rc-result-warnings]"),
    resultWarningList: document.querySelector("[data-rc-result-warning-list]"),
    metricsBody: document.querySelector("[data-rc-metrics-body]"),
    parametersBody: document.querySelector("[data-rc-parameters-body]"),
    diagnosticsBody: document.querySelector("[data-rc-diagnostics-body]"),
    metricCount: document.querySelector("[data-rc-metric-count]"),
    parameterCount: document.querySelector("[data-rc-parameter-count]"),
    diagnosticCount: document.querySelector("[data-rc-diagnostic-count]"),
    calibrationSummary: document.querySelector("[data-rc-calibration-summary]"),
    calibrationMetrics: document.querySelector("[data-rc-calibration-metrics]"),
    calibrationParameters: document.querySelector("[data-rc-calibration-parameters]"),
    ikSolutionsCard: document.querySelector("[data-rc-ik-solutions-card]"),
    ikSolutionsBody: document.querySelector("[data-rc-ik-solutions-body]"),
    ikSolutionCount: document.querySelector("[data-rc-ik-solution-count]"),
    rawResult: document.querySelector("[data-rc-raw-result]"),
    downloadButton: document.querySelector("[data-rc-download]")
  };

  var state = {
    mode: "measured",
    modelType: "dh",
    uploads: { model: null, data: null },
    backendReady: false,
    healthChecking: false,
    action: "",
    inspectionValid: false,
    inspectionPayload: null,
    lastResult: null,
    ikToleranceUnits: { length: "m", angle: "rad" }
  };

  function apiUrl(path) {
    var workbench = window.RoboticsWorkbench;
    return workbench && typeof workbench.apiUrl === "function"
      ? workbench.apiUrl(path)
      : path;
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function isBusy() {
    return state.healthChecking || Boolean(state.action);
  }

  function formatBytes(bytes) {
    if (!bytes) {
      return "0 B";
    }
    var units = ["B", "KB", "MB"];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
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
      return value.toLocaleString("zh-CN", {
        maximumSignificantDigits: 9,
        useGrouping: false
      });
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (value === null || value === undefined || value === "") {
      return "—";
    }
    if (Array.isArray(value)) {
      var displayed = value.slice(0, 24).map(formatValue).join(", ");
      return displayed + (value.length > 24 ? " … (" + value.length + " items)" : "");
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    var text = String(value);
    return text.length > 260 ? text.slice(0, 257) + "…" : text;
  }

  function humanizeName(name) {
    return String(name)
      .replaceAll("_", " ")
      .replaceAll(".", " · ")
      .replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  function setMessage(text, kind, focus) {
    elements.message.textContent = text || "";
    elements.message.className = "rc-message" + (kind ? " rc-message-" + kind : "");
    elements.message.hidden = !text;
    elements.message.setAttribute("role", kind === "error" ? "alert" : "status");
    elements.message.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    if (text && focus) {
      elements.message.focus();
    }
  }

  function clearMessage() {
    setMessage("", "");
  }

  function setRuntime(text, updated) {
    elements.runtimeState.textContent = text;
    elements.runtimeState.classList.toggle("is-updated", Boolean(updated));
  }

  function setReadyRuntime() {
    if (!state.backendReady) {
      setRuntime("BACKEND OFFLINE", false);
    } else if (state.inspectionValid) {
      setRuntime("READY TO SOLVE", true);
    } else if (state.uploads.model) {
      setRuntime("MODEL NEEDS CHECK", false);
    } else {
      setRuntime("READY FOR MODEL", true);
    }
  }

  function markProcess(name, status) {
    var item = document.querySelector('[data-rc-process="' + name + '"]');
    if (!item) {
      return;
    }
    item.classList.toggle("is-previewed", status === "ready");
    item.classList.toggle("is-running", status === "running");
    item.classList.toggle("is-error", status === "error");
  }

  function updateControls() {
    var busy = isBusy();
    form.setAttribute("aria-busy", busy ? "true" : "false");

    Array.from(form.querySelectorAll("button, input, select")).forEach(function (control) {
      control.disabled = busy;
    });

    Array.from(document.querySelectorAll("[data-rc-mode], [data-rc-model-type]")).forEach(function (button) {
      button.disabled = busy;
    });
    elements.healthRetry.disabled = busy;
    elements.downloadButton.disabled = busy || !state.lastResult;
    elements.resetButton.disabled = busy;
    elements.exampleButton.disabled = busy;
    elements.abbDemoButton.disabled = busy || !state.backendReady;
    elements.inspectButton.disabled = busy || !state.backendReady || !state.uploads.model;
    elements.runButton.disabled = busy ||
      !state.backendReady ||
      !state.inspectionValid ||
      !state.uploads.model ||
      (state.mode === "measured" && !state.uploads.data);

    elements.dataInput.disabled = busy || state.mode !== "measured";
    elements.samples.disabled = busy || state.mode !== "closed-loop";
    elements.seed.disabled = busy || state.mode !== "closed-loop";
    elements.noisePosition.disabled = busy || state.mode !== "closed-loop";
    elements.noiseOrientation.disabled = busy || state.mode !== "closed-loop";
    Array.from(elements.ikPanel.querySelectorAll("input, select")).forEach(function (control) {
      control.disabled = busy || state.mode !== "ik";
    });
    elements.tipLink.disabled = busy || state.modelType !== "urdf";
  }

  function modelDefaultCopy() {
    return MODEL_COPY[state.modelType];
  }

  function updateUploadDisplay(kind) {
    var upload = state.uploads[kind];
    var dropZone = document.querySelector('[data-rc-drop-zone="' + kind + '"]');
    var title = document.querySelector('[data-rc-upload-title="' + kind + '"]');
    var detail = document.querySelector('[data-rc-upload-detail="' + kind + '"]');
    var defaults = kind === "model" ? modelDefaultCopy() : {
      title: "拖入或选择测量 CSV",
      detail: "q_<joint>、位置以及可选的 qx qy qz qw"
    };

    dropZone.classList.toggle("has-file", Boolean(upload));
    dropZone.classList.remove("is-dragover");
    if (!upload) {
      title.textContent = defaults.title;
      detail.textContent = defaults.detail;
      return;
    }
    title.textContent = upload.name;
    detail.textContent = formatBytes(upload.size) +
      (upload.example ? " · 仓库示例" : " · 本地文件") +
      " · 已就绪";
  }

  function resetUpload(kind) {
    state.uploads[kind] = null;
    var input = kind === "model" ? elements.modelInput : elements.dataInput;
    input.value = "";
    updateUploadDisplay(kind);
  }

  function validateUpload(kind, upload) {
    var name = String(upload.name || "").toLowerCase();
    if (kind === "model") {
      if (state.modelType === "urdf" && !name.endsWith(".urdf")) {
        throw new Error("URDF 模型必须是已展开的 .urdf 文件；当前不处理 Xacro。");
      }
      if (state.modelType !== "urdf" && !name.endsWith(".csv")) {
        throw new Error("DH / MDH 名义模型必须是 .csv 文件。");
      }
    } else if (!name.endsWith(".csv")) {
      throw new Error("关节与末端测量必须是 .csv 文件。");
    }
    if (!upload.size) {
      throw new Error(upload.name + " 是空文件。");
    }
    var maximumBytes = kind === "model" ? MAX_MODEL_BYTES : MAX_DATA_BYTES;
    if (upload.size > maximumBytes) {
      throw new Error(upload.name + " 超过 " +
        (kind === "model" ? "1 MB 模型" : "10 MB 测量数据") + "上限。");
    }
  }

  function invalidateInspection(message) {
    state.inspectionValid = false;
    state.inspectionPayload = null;
    elements.inspection.hidden = true;
    elements.inspectionList.replaceChildren();
    elements.inspectionWarnings.replaceChildren();
    markProcess("model", state.uploads.model ? "" : "");
    clearResult();
    setReadyRuntime();
    if (message && state.uploads.model) {
      setMessage(message, "warning");
    }
    updateControls();
  }

  function setUpload(kind, upload) {
    if (isBusy() && !upload.example) {
      throw new Error("当前操作尚未结束，请稍后再替换输入。");
    }
    validateUpload(kind, upload);
    state.uploads[kind] = upload;
    updateUploadDisplay(kind);
    clearResult();

    if (kind === "model") {
      invalidateInspection();
    } else {
      markProcess("data", "ready");
      setReadyRuntime();
    }
    updateControls();
  }

  function readUpload(upload) {
    if (typeof upload.content === "string") {
      return Promise.resolve(upload.content);
    }
    if (upload && typeof upload.text === "function") {
      return upload.text();
    }
    return Promise.reject(new Error("无法读取输入文件内容。"));
  }

  function syncModeUi() {
    Array.from(document.querySelectorAll("[data-rc-mode]")).forEach(function (button) {
      var active = button.dataset.rcMode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    var closedLoop = state.mode === "closed-loop";
    var ik = state.mode === "ik";
    elements.measuredPanel.hidden = state.mode !== "measured";
    elements.fileGrid.classList.toggle("is-single", state.mode !== "measured");
    elements.closedLoopPanel.hidden = !closedLoop;
    elements.ikPanel.hidden = !ik;
    Array.from(elements.calibrationOnly).forEach(function (element) {
      element.hidden = ik;
    });
    elements.calibrationNote.hidden = ik;
    elements.runButton.textContent = ik
      ? "求解目标位姿 IK →"
      : (closedLoop ? "运行合成闭环 →" : "开始实测标定 →");
    elements.modeHelp.textContent = ik
      ? "输入目标位置和可选 XYZW 四元数，通过多起点、关节限位感知的数值求解器返回候选关节位置。"
      : (closedLoop
        ? "从独立 truth 扰动模型生成训练和留出样本，验证参数恢复与标定前后误差。"
        : "使用外部设备测得的末端位置或完整位姿进行标定。");
    elements.dataProcessCopy.textContent = ik
      ? "读取目标位姿与可选关节初值"
      : (closedLoop ? "生成独立真值、关节样本与测量噪声" : "对齐关节列与外部末端测量");
    elements.dataProcessCode.textContent = ik ? "TARGET" : "DATA";
    elements.solverProcessCopy.textContent = ik
      ? "多起点搜索并投影到关节限位"
      : "构造误差雅可比并迭代求解";
    elements.solverProcessCode.textContent = ik ? "IK / LM" : "LM / SVD";
    elements.resultProcessCopy.textContent = ik
      ? "去重、按策略排序并报告位姿误差"
      : "留出集评估与参数诊断";
    elements.resultProcessCode.textContent = ik ? "SOLUTIONS" : "VERIFY";
    markProcess("data", state.mode !== "measured" || state.uploads.data ? "ready" : "");
  }

  function setMode(mode) {
    if (isBusy() || (mode !== "measured" && mode !== "closed-loop" && mode !== "ik")) {
      return;
    }
    if (state.mode === mode) {
      return;
    }
    state.mode = mode;
    syncModeUi();
    clearResult();
    setReadyRuntime();
    clearMessage();
    updateControls();
  }

  function syncModelTypeUi() {
    Array.from(document.querySelectorAll("[data-rc-model-type]")).forEach(function (button) {
      var active = button.dataset.rcModelType === state.modelType;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    var copy = modelDefaultCopy();
    elements.modelInput.accept = copy.accept;
    elements.tipField.hidden = state.modelType !== "urdf";
    elements.formulaTitle.textContent = FORMULAS[state.modelType].title;
    elements.modelFormula.textContent = FORMULAS[state.modelType].formula;
    updateUploadDisplay("model");
  }

  function setModelType(modelType) {
    if (isBusy() || !Object.prototype.hasOwnProperty.call(MODEL_COPY, modelType)) {
      return;
    }
    if (state.modelType !== modelType) {
      state.modelType = modelType;
      resetUpload("model");
      invalidateInspection();
    }
    syncModelTypeUi();
    clearMessage();
    updateControls();
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

  function apiError(payload, response) {
    if (payload && payload.error) {
      if (typeof payload.error === "string") {
        return payload.error;
      }
      var message = payload.error.message || payload.error.code || "请求失败";
      if (payload.error.details) {
        message += "：" + payload.error.details;
      }
      return message;
    }
    return "Docker 计算服务返回 HTTP " + response.status + "，但没有有效 JSON 错误信息。";
  }

  async function postJson(path, body) {
    var bodyText = JSON.stringify(body);
    var requestSize = new Blob([bodyText]).size;
    if (requestSize > MAX_REQUEST_BYTES) {
      throw new Error("文件与 JSON 封装合计 " + formatBytes(requestSize) + "，超过 12 MB 请求上限。");
    }
    var response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyText
    });
    var payload = await responseJson(response);
    if (!response.ok) {
      throw new Error(apiError(payload, response));
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("标定服务未返回有效 JSON。");
    }
    if (payload.ok !== true) {
      throw new Error("标定服务返回的 JSON 缺少 ok=true。");
    }
    return payload;
  }

  async function checkHealth(showSuccess) {
    if (isBusy()) {
      return;
    }
    state.healthChecking = true;
    state.backendReady = false;
    elements.healthState.textContent = "checking";
    elements.healthState.classList.remove("is-ready", "rc-health-error");
    setRuntime("CHECKING BACKEND", false);
    markProcess("backend", "running");
    updateControls();

    try {
      var response = await fetch(apiUrl("/api/calibration/health"), { cache: "no-store" });
      var payload = await responseJson(response);
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(apiError(payload, response));
      }
      state.backendReady = true;
      elements.healthState.textContent = "ready";
      elements.healthState.classList.add("is-ready");
      setRuntime(state.inspectionValid ? "READY TO SOLVE" : "READY FOR MODEL", true);
      markProcess("backend", "ready");
      if (showSuccess) {
        setMessage("Docker 计算服务和标定 C++ 内核均已就绪。", "success");
      } else if (elements.message.classList.contains("rc-message-warning")) {
        clearMessage();
      }
    } catch (error) {
      elements.healthState.textContent = "offline";
      elements.healthState.classList.add("rc-health-error");
      setRuntime("BACKEND OFFLINE", false);
      markProcess("backend", "error");
      setMessage(
        "Docker 计算服务不可用：" + error.message +
        "。请确认服务已启动、API 地址配置正确，并检查标定 C++ 内核。",
        "warning"
      );
    } finally {
      state.healthChecking = false;
      updateControls();
    }
  }

  function basicModelOptions() {
    var options = {
      lengthUnit: elements.lengthUnit.value,
      angleUnit: elements.angleUnit.value
    };
    var tipLink = elements.tipLink.value.trim();
    if (state.modelType === "urdf" && tipLink) {
      options.tipLink = tipLink;
    }
    return options;
  }

  function convertNumericInput(input, factor) {
    var value = Number(input.value);
    if (input.value.trim() && Number.isFinite(value)) {
      input.value = String(value * factor);
    }
  }

  function syncIkToleranceUnits() {
    var nextLength = elements.lengthUnit.value;
    var nextAngle = elements.angleUnit.value;
    if (state.ikToleranceUnits.length !== nextLength) {
      convertNumericInput(elements.ikPositionTolerance,
        state.ikToleranceUnits.length === "m" ? 1000 : 0.001);
      state.ikToleranceUnits.length = nextLength;
    }
    if (state.ikToleranceUnits.angle !== nextAngle) {
      convertNumericInput(elements.ikOrientationTolerance,
        state.ikToleranceUnits.angle === "rad" ? 180 / Math.PI : Math.PI / 180);
      state.ikToleranceUnits.angle = nextAngle;
    }
  }

  function unwrapPayload(payload) {
    if (payload && isPlainObject(payload.result)) {
      return payload.result;
    }
    return payload;
  }

  function flattenScalars(value, prefix, rows, depth, maximum) {
    if (rows.length >= maximum || depth > 6 || value === null || value === undefined) {
      return;
    }
    if (typeof value !== "object") {
      rows.push({ name: prefix || "value", value: value });
      return;
    }
    if (Array.isArray(value)) {
      if (value.every(function (item) { return typeof item !== "object"; })) {
        rows.push({ name: prefix, value: value });
      }
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (rows.length >= maximum || key === "ok" || key === "warnings" || PARAMETER_KEYS.indexOf(key) !== -1) {
        return;
      }
      var item = value[key];
      var name = prefix ? prefix + "." + key : key;
      if (item !== null && typeof item === "object") {
        flattenScalars(item, name, rows, depth + 1, maximum);
      } else {
        rows.push({ name: name, value: item });
      }
    });
  }

  function collectWarnings(payload, root) {
    var warnings = [];
    function visit(source, depth) {
      if (!source || typeof source !== "object" || depth > 6) {
        return;
      }
      if (Array.isArray(source.warnings)) {
        source.warnings.forEach(function (warning) {
          var text = typeof warning === "string" ? warning : formatValue(warning);
          if (warnings.indexOf(text) === -1) {
            warnings.push(text);
          }
        });
      }
      if (Array.isArray(source)) {
        return;
      }
      Object.keys(source).forEach(function (key) {
        if (key !== "warnings" && source[key] && typeof source[key] === "object") {
          visit(source[key], depth + 1);
        }
      });
    }
    visit(payload, 0);
    if (root !== payload) {
      visit(root, 0);
    }
    return warnings;
  }

  function renderInspection(payload) {
    var root = unwrapPayload(payload);
    var inspection = isPlainObject(payload.inspection)
      ? payload.inspection
      : (isPlainObject(root.inspection) ? root.inspection : root);
    var rows = [];
    [
      ["modelType", "模型类型"],
      ["name", "模型名称"],
      ["baseLink", "基座 link"],
      ["tipLink", "末端 link"],
      ["jointCount", "链路 joint 数"],
      ["activeJointCount", "可动关节数"]
    ].forEach(function (entry) {
      if (inspection[entry[0]] !== undefined) {
        rows.push({ name: entry[1], value: inspection[entry[0]] });
      }
    });
    if (isPlainObject(inspection.checks)) {
      Object.keys(inspection.checks).forEach(function (key) {
        rows.push({ name: "检查 · " + humanizeName(key), value: inspection.checks[key] });
      });
    }
    if (Array.isArray(inspection.joints)) {
      inspection.joints.slice(0, 30).forEach(function (joint) {
        if (!isPlainObject(joint)) {
          return;
        }
        var details = [joint.type || "unknown"];
        if (joint.continuous) {
          details.push("continuous");
        } else if (joint.hasLimits) {
          details.push("limits=[" + formatValue(joint.lower) + ", " + formatValue(joint.upper) + "]");
        } else {
          details.push("limits missing");
        }
        rows.push({ name: "joint · " + (joint.name || "unnamed"), value: details.join(" · ") });
      });
    }
    if (!rows.length) {
      flattenScalars(root, "", rows, 0, 40);
    }
    var warnings = collectWarnings(payload, root);

    elements.inspectionList.replaceChildren();
    elements.inspectionWarnings.replaceChildren();
    rows.slice(0, 46).forEach(function (row) {
      var term = document.createElement("dt");
      var description = document.createElement("dd");
      term.textContent = humanizeName(row.name);
      description.textContent = formatValue(row.value);
      elements.inspectionList.append(term, description);
    });
    warnings.forEach(function (warning) {
      var item = document.createElement("li");
      item.textContent = warning;
      elements.inspectionWarnings.appendChild(item);
    });

    elements.inspectionState.textContent = warnings.length ? "VALID / WARNINGS" : "VALID";
    elements.inspectionState.classList.remove("is-error");
    elements.inspectionSummary.textContent = typeof inspection.activeJointCount === "number"
      ? "模型解析完成，检测到 " + formatValue(inspection.activeJointCount) + " 个可动关节。"
      : "模型结构、数值字段和目标链解析完成。";
    elements.inspectionWarnings.hidden = !warnings.length;
    elements.inspection.hidden = false;
  }

  function renderInspectionError(message) {
    elements.inspectionList.replaceChildren();
    elements.inspectionWarnings.replaceChildren();
    elements.inspectionState.textContent = "INVALID";
    elements.inspectionState.classList.add("is-error");
    elements.inspectionSummary.textContent = message;
    elements.inspectionWarnings.hidden = true;
    elements.inspection.hidden = false;
  }

  async function inspectModel(showSuccess) {
    if (isBusy()) {
      return;
    }
    if (!state.backendReady) {
      setMessage("Docker 计算服务尚未就绪，请先重新检查服务。", "error", true);
      return;
    }
    if (!state.uploads.model) {
      setMessage("请先选择名义模型文件。", "error", true);
      return;
    }

    state.action = "inspect";
    state.inspectionValid = false;
    setRuntime("INSPECTING MODEL", false);
    markProcess("model", "running");
    clearResult();
    clearMessage();
    updateControls();

    try {
      var model = await readUpload(state.uploads.model);
      var payload = await postJson("/api/calibration/inspect", {
        modelType: state.modelType,
        model: model,
        options: basicModelOptions()
      });
      if (payload.inspection && payload.inspection.valid !== true) {
        throw new Error("模型预检返回 valid=false。");
      }
      state.inspectionPayload = payload;
      state.inspectionValid = true;
      renderInspection(payload);
      markProcess("model", "ready");
      setRuntime("MODEL VALID / READY", true);
      if (showSuccess !== false) {
        setMessage("模型预检通过。请结合关节数、目标链和警告确认约定无误。", "success");
      }
    } catch (error) {
      state.inspectionPayload = null;
      state.inspectionValid = false;
      renderInspectionError(error.message);
      markProcess("model", "error");
      setRuntime("MODEL INVALID", false);
      setMessage("模型预检失败：" + error.message, "error", true);
    } finally {
      state.action = "";
      updateControls();
    }
  }

  function numericInput(input, label, settings) {
    var raw = input.value.trim();
    if (!raw) {
      throw new Error(label + "不能为空。");
    }
    var value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(label + "必须是有限数值。");
    }
    if (settings.integer && !Number.isInteger(value)) {
      throw new Error(label + "必须是整数。");
    }
    if (settings.minimum !== undefined && value < settings.minimum) {
      throw new Error(label + "不能小于 " + settings.minimum + "。");
    }
    if (settings.strictMinimum !== undefined && value <= settings.strictMinimum) {
      throw new Error(label + "必须大于 " + settings.strictMinimum + "。");
    }
    if (settings.maximum !== undefined && value > settings.maximum) {
      throw new Error(label + "不能大于 " + settings.maximum + "。");
    }
    if (settings.exclusiveMaximum !== undefined && value >= settings.exclusiveMaximum) {
      throw new Error(label + "必须小于 " + settings.exclusiveMaximum + "。");
    }
    return value;
  }

  function optionalVector(selector, label) {
    var inputs = Array.from(document.querySelectorAll(selector));
    var raw = inputs.map(function (input) { return input.value.trim(); });
    if (raw.every(function (value) { return !value; })) {
      return undefined;
    }
    if (raw.some(function (value) { return !value; })) {
      throw new Error(label + "的三个分量必须同时填写或同时留空。");
    }
    return raw.map(function (value) {
      var number = Number(value);
      if (!Number.isFinite(number)) {
        throw new Error(label + "必须全部为有限数值。");
      }
      return number;
    });
  }

  function requiredVector(selector, label) {
    var value = optionalVector(selector, label);
    if (!value) {
      throw new Error(label + "不能为空。");
    }
    return value;
  }

  function optionalQuaternion() {
    var inputs = Array.from(document.querySelectorAll("[data-rc-ik-target-quaternion]"));
    var raw = inputs.map(function (input) { return input.value.trim(); });
    if (raw.every(function (value) { return !value; })) {
      return undefined;
    }
    if (raw.some(function (value) { return !value; })) {
      throw new Error("目标四元数的四个 XYZW 分量必须同时填写或同时留空。");
    }
    var quaternion = raw.map(function (value) {
      var number = Number(value);
      if (!Number.isFinite(number)) {
        throw new Error("目标四元数必须全部为有限数值。");
      }
      return number;
    });
    var normSquared = quaternion.reduce(function (sum, value) {
      return sum + value * value;
    }, 0);
    if (normSquared <= 1e-24) {
      throw new Error("目标四元数的模长必须大于 0。");
    }
    return quaternion;
  }

  function inspectionJointCount() {
    var payload = state.inspectionPayload;
    var root = unwrapPayload(payload);
    var inspection = payload && isPlainObject(payload.inspection)
      ? payload.inspection
      : (root && isPlainObject(root.inspection) ? root.inspection : root);
    return inspection && Number.isInteger(inspection.activeJointCount)
      ? inspection.activeJointCount
      : undefined;
  }

  function optionalIkSeed() {
    var raw = elements.ikSeed.value.trim();
    if (!raw) {
      return undefined;
    }
    var tokens = raw.split(/[,，\s]+/).filter(Boolean);
    if (!tokens.length || tokens.length > 32) {
      throw new Error("IK 关节初值必须包含 1 到 32 个数值。");
    }
    var seed = tokens.map(function (token) {
      var value = Number(token);
      if (!Number.isFinite(value)) {
        throw new Error("IK 关节初值必须是逗号或空格分隔的有限数值。");
      }
      return value;
    });
    var expected = inspectionJointCount();
    if (expected !== undefined && seed.length !== expected) {
      throw new Error("IK 关节初值需要 " + expected + " 项，与模型活动关节数一致；当前填写了 " + seed.length + " 项。");
    }
    return seed;
  }

  function appendToolOptions(options) {
    var toolXyz = optionalVector("[data-rc-tool-xyz]", "工具 XYZ");
    var toolRpy = optionalVector("[data-rc-tool-rpy]", "工具 RPY");
    if (toolXyz) {
      options.toolXyz = toolXyz;
    }
    if (toolRpy) {
      options.toolRpy = toolRpy;
    }
  }

  function ikTarget() {
    var target = {
      position: requiredVector("[data-rc-ik-target-xyz]", "IK 目标 XYZ")
    };
    var quaternion = optionalQuaternion();
    if (quaternion) {
      target.quaternion = quaternion;
    }
    return target;
  }

  function solveOptions() {
    var options = basicModelOptions();
    appendToolOptions(options);

    if (state.mode === "ik") {
      var ikSeed = optionalIkSeed();
      if (ikSeed) {
        options.ikSeed = ikSeed;
      }
      options.ikMaxSolutions = numericInput(elements.ikMaxSolutions, "IK 最多返回解数", {
        integer: true,
        minimum: 1,
        maximum: 16
      });
      options.ikRestarts = numericInput(elements.ikRestarts, "IK 多起点次数", {
        integer: true,
        minimum: 1,
        maximum: 64
      });
      options.ikMaxIterations = numericInput(elements.ikMaxIterations, "IK 每个起点最大迭代", {
        integer: true,
        minimum: 1,
        maximum: 200
      });
      options.ikPositionTolerance = numericInput(elements.ikPositionTolerance, "IK 位置收敛容差", {
        strictMinimum: 0
      });
      options.ikOrientationTolerance = numericInput(elements.ikOrientationTolerance, "IK 姿态收敛容差", {
        strictMinimum: 0
      });
      options.ikOrientationWeight = numericInput(elements.ikOrientationWeight, "IK 姿态残差权重", {
        strictMinimum: 0,
        maximum: 10000
      });
      options.ikSolutionTolerance = numericInput(elements.ikSolutionTolerance, "IK 重复解判定容差", {
        strictMinimum: 0,
        maximum: 1
      });
      options.ikRandomSeed = numericInput(elements.ikRandomSeed, "IK 多起点随机种子", {
        integer: true,
        minimum: 0,
        maximum: 4294967295
      });
      if (elements.ikStrategy.value !== "distance" && elements.ikStrategy.value !== "speed") {
        throw new Error("IK 解排序策略必须是 distance 或 speed。");
      }
      options.ikStrategy = elements.ikStrategy.value;
      options.ikAllowAssumedLimits = elements.ikAllowAssumedLimits.checked;
      return options;
    }

    options.targets = Array.from(document.querySelectorAll("[data-rc-target]:checked")).map(function (input) {
      return input.value;
    });
    if (!options.targets.length) {
      throw new Error("至少选择一类待标定参数。");
    }

    options.validationRatio = numericInput(elements.validationRatio, "验证集比例", {
      minimum: 0,
      exclusiveMaximum: 0.8
    });
    options.orientationWeight = numericInput(elements.orientationWeight, "姿态残差权重", {
      minimum: 0
    });
    if (options.orientationWeight === 0 && options.targets.indexOf("tool-rotation") !== -1) {
      throw new Error("姿态残差权重为 0 时，工具旋转参数不可辨识。");
    }
    options.huberDelta = numericInput(elements.huberDelta, "Huber 阈值", {
      strictMinimum: 0
    });
    options.maxIterations = numericInput(elements.maxIterations, "最大迭代次数", {
      integer: true,
      minimum: 1,
      maximum: 200
    });

    if (state.mode === "closed-loop") {
      options.samples = numericInput(elements.samples, "合成样本数", {
        integer: true,
        minimum: 20,
        maximum: 20000
      });
      if (Math.floor(options.samples * options.validationRatio) < 8) {
        throw new Error("合成闭环至少需要 8 个独立验证样本，请增加样本数或验证集比例。");
      }
      options.seed = numericInput(elements.seed, "随机种子", {
        integer: true,
        minimum: 0,
        maximum: 4294967295
      });
      options.noisePosition = numericInput(elements.noisePosition, "位置噪声", {
        minimum: 0
      });
      options.noiseOrientation = numericInput(elements.noiseOrientation, "姿态噪声", {
        minimum: 0
      });
    }
    return options;
  }

  function findParameterSource(value, depth) {
    if (!isPlainObject(value) || depth > 5) {
      return null;
    }
    for (var index = 0; index < PARAMETER_KEYS.length; index += 1) {
      var key = PARAMETER_KEYS[index];
      if (Object.prototype.hasOwnProperty.call(value, key) &&
          (Array.isArray(value[key]) || isPlainObject(value[key]))) {
        return value[key];
      }
    }
    var keys = Object.keys(value);
    for (var nestedIndex = 0; nestedIndex < keys.length; nestedIndex += 1) {
      var nested = findParameterSource(value[keys[nestedIndex]], depth + 1);
      if (nested !== null) {
        return nested;
      }
    }
    return null;
  }

  function firstDefined(item, keys) {
    for (var index = 0; index < keys.length; index += 1) {
      if (item[keys[index]] !== undefined) {
        return item[keys[index]];
      }
    }
    return undefined;
  }

  function parameterDetails(item) {
    var details = [];
    [
      "unit",
      "group",
      "frame",
      "scale",
      "stddev",
      "standard_deviation",
      "sensitivity",
      "truth",
      "truthError",
      "truth_error"
    ].forEach(function (key) {
      if (item[key] !== undefined) {
        details.push(humanizeName(key) + "=" + formatValue(item[key]));
      }
    });
    if (item.observable !== undefined) {
      details.push(item.observable ? "observable" : "not observable");
    }
    if (item.excited !== undefined) {
      details.push(item.excited ? "excited" : "not excited");
    }
    return details.join(" · ");
  }

  function normalizeParameters(root) {
    var source = findParameterSource(root, 0);
    var rows = [];
    if (Array.isArray(source)) {
      source.slice(0, 500).forEach(function (item, index) {
        if (!isPlainObject(item)) {
          rows.push({
            name: "parameter[" + index + "]",
            nominal: undefined,
            delta: undefined,
            calibrated: item,
            details: ""
          });
          return;
        }
        rows.push({
          name: firstDefined(item, ["name", "parameter", "label", "key", "id"]) || "parameter[" + index + "]",
          nominal: firstDefined(item, ["nominal", "initial", "nominal_value"]),
          delta: firstDefined(item, ["delta", "correction", "change", "offset"]),
          calibrated: firstDefined(item, ["calibrated", "estimate", "estimated", "value", "estimated_value"]),
          details: parameterDetails(item)
        });
      });
    } else if (isPlainObject(source)) {
      if (Array.isArray(source.names) && Array.isArray(source.values)) {
        source.values.slice(0, 500).forEach(function (value, index) {
          rows.push({
            name: source.names[index] || "parameter[" + index + "]",
            nominal: Array.isArray(source.nominal) ? source.nominal[index] : undefined,
            delta: Array.isArray(source.delta) ? source.delta[index] : undefined,
            calibrated: value,
            details: ""
          });
        });
      } else {
        Object.keys(source).slice(0, 500).forEach(function (key) {
          var item = source[key];
          if (isPlainObject(item)) {
            rows.push({
              name: item.name || key,
              nominal: firstDefined(item, ["nominal", "initial"]),
              delta: firstDefined(item, ["delta", "correction", "change"]),
              calibrated: firstDefined(item, ["calibrated", "estimate", "estimated", "value"]),
              details: parameterDetails(item)
            });
          } else {
            rows.push({ name: key, nominal: undefined, delta: undefined, calibrated: item, details: "" });
          }
        });
      }
    }
    return rows;
  }

  function uniqueRows(rows) {
    var seen = new Set();
    return rows.filter(function (row) {
      if (!row.name || seen.has(row.name)) {
        return false;
      }
      seen.add(row.name);
      return true;
    });
  }

  function resultRows(root) {
    var allRows = [];
    flattenScalars(root, "", allRows, 0, 240);
    var metrics = allRows.filter(function (row) {
      return /(metric|rmse|mae|residual|error|accuracy|improvement|median|p95|max_abs)/i.test(row.name) &&
        !/(condition|error_code|error_message)/i.test(row.name);
    });
    if (root.measurement && root.measurement.type === "position") {
      metrics = metrics.filter(function (row) {
        return !/(orientation|rotation|angular)/i.test(row.name);
      });
    }
    var diagnostics = allRows.filter(function (row) {
      return /(^|\.)(diagnostics|solver|observability)(\.|$)/i.test(row.name) ||
        /(^|\.)measurement\.(sampleCount|trainSamples|validationSamples)$/i.test(row.name) ||
        /(^|\.)synthetic\.(enabled|seed)$/i.test(row.name);
    });
    if (!diagnostics.length) {
      diagnostics = allRows.filter(function (row) {
        return /(rank|condition|singular|iteration|converg|observable|sensitivity|sample_?count|samples|dof|parameter_?count|cost|lambda|duration)/i.test(row.name);
      });
    }
    return {
      all: uniqueRows(allRows),
      metrics: uniqueRows(metrics).slice(0, 100),
      diagnostics: uniqueRows(diagnostics).slice(0, 100)
    };
  }

  function appendCell(row, value, className) {
    var cell = document.createElement("td");
    cell.textContent = value;
    if (className) {
      cell.className = className;
    }
    row.appendChild(cell);
  }

  function emptyTable(body, columns, text) {
    var row = document.createElement("tr");
    var cell = document.createElement("td");
    cell.colSpan = columns;
    cell.className = "rc-empty-cell";
    cell.textContent = text;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function normalizedPath(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  }

  function findSummaryMetric(rows, phaseWords, quantityWords, preferValidation) {
    var candidates = rows.filter(function (row) {
      if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
        return false;
      }
      var path = normalizedPath(row.name);
      return path.indexOf("rmse") !== -1 &&
        phaseWords.some(function (word) { return path.indexOf(word) !== -1; }) &&
        quantityWords.some(function (word) { return path.indexOf(word) !== -1; });
    });
    var validation = preferValidation && candidates.find(function (row) {
      return normalizedPath(row.name).indexOf("validation") !== -1;
    });
    return validation || candidates.find(function (row) {
      return normalizedPath(row.name).indexOf(" all ") !== -1;
    }) || candidates[0];
  }

  function renderSummaryCards(rows, root) {
    var beforeWords = ["before", "nominal", "initial", "pre"];
    var afterWords = ["after", "calibrated", "final", "post"];
    var positionWords = ["position", "translation", "translational"];
    var orientationWords = ["orientation", "rotation", "angular"];
    var preferValidation = !(root.measurement && root.measurement.validationSamples === 0);
    var values = {
      "before-position": findSummaryMetric(rows, beforeWords, positionWords, preferValidation),
      "after-position": findSummaryMetric(rows, afterWords, positionWords, preferValidation),
      "before-orientation": findSummaryMetric(rows, beforeWords, orientationWords, preferValidation),
      "after-orientation": findSummaryMetric(rows, afterWords, orientationWords, preferValidation)
    };

    Object.keys(values).forEach(function (key) {
      var element = document.querySelector('[data-rc-summary-value="' + key + '"]');
      element.textContent = values[key] ? formatValue(values[key].value) : "—";
      element.title = values[key] ? values[key].name : "";
    });

    ["position", "orientation"].forEach(function (quantity) {
      var before = values["before-" + quantity];
      var after = values["after-" + quantity];
      var improvement = document.querySelector('[data-rc-summary-improvement="' + quantity + '"]');
      improvement.textContent = "";
      improvement.classList.remove("is-positive", "is-negative");
      if (before && after && before.value > 0) {
        var percent = (1 - after.value / before.value) * 100;
        improvement.textContent = (percent >= 0 ? "改善 " : "恶化 ") + formatValue(Math.abs(percent)) + "%";
        improvement.classList.add(percent >= 0 ? "is-positive" : "is-negative");
      }
    });
  }

  function syncResultLayout(ik) {
    elements.calibrationSummary.hidden = ik;
    elements.calibrationMetrics.hidden = ik;
    elements.calibrationParameters.hidden = ik;
    elements.ikSolutionsCard.hidden = !ik;
    elements.resultKicker.textContent = ik ? "Inverse kinematics result" : "Calibration result";
    elements.resultsTitle.textContent = ik ? "通用 IK 求解结果" : "标定与闭环结果";
  }

  function ikJointVector(solution, joints) {
    var values = Array.isArray(solution.q)
      ? solution.q
      : (Array.isArray(solution.qSi) ? solution.qSi : []);
    if (!values.length) {
      return "—";
    }
    return values.map(function (value, index) {
      var joint = joints[index];
      if (!joint || !joint.name) {
        return "q" + (index + 1) + "=" + formatValue(value);
      }
      return joint.name + "=" + formatValue(value) + (joint.unit ? " " + joint.unit : "");
    }).join(", ");
  }

  function renderIkResult(payload, root) {
    var solutions = Array.isArray(root.solutions)
      ? root.solutions.filter(isPlainObject)
      : [];
    var joints = Array.isArray(root.joints) ? root.joints : [];
    var warnings = collectWarnings(payload, root);
    var safetyWarning = "IK 候选解未经过自碰撞、环境碰撞、轨迹连续性或动力学约束检查；下发机器人前必须另行验证。";
    var hasSafetyWarning = warnings.some(function (warning) {
      return /(碰撞|collision)/i.test(warning) && /(轨迹|trajectory)/i.test(warning);
    });
    if (!hasSafetyWarning) {
      warnings.push(safetyWarning);
    }

    syncResultLayout(true);
    elements.metricsBody.replaceChildren();
    elements.parametersBody.replaceChildren();
    elements.ikSolutionsBody.replaceChildren();
    elements.diagnosticsBody.replaceChildren();
    elements.resultWarningList.replaceChildren();

    solutions.forEach(function (solution, index) {
      var row = document.createElement("tr");
      appendCell(row, formatValue(solution.index !== undefined ? solution.index + 1 : index + 1));
      appendCell(row, ikJointVector(solution, joints));
      appendCell(row, formatValue(solution.positionErrorM));
      appendCell(row, root.target && root.target.hasOrientation === false
        ? "不适用"
        : formatValue(solution.orientationErrorRad));
      appendCell(row, formatValue(solution.iterations));
      appendCell(row, solution.restart === undefined ? "—" : formatValue(solution.restart + 1));
      elements.ikSolutionsBody.appendChild(row);
    });
    if (!solutions.length) {
      emptyTable(elements.ikSolutionsBody, 6, "当前关节限位、容差和多起点设置下未找到 IK 解。");
    }

    var diagnostics = [];
    if (root.backend !== undefined) {
      diagnostics.push({ name: "backend", value: root.backend });
    }
    diagnostics.push({ name: "success", value: root.success === true });
    if (root.target && root.target.hasOrientation !== undefined) {
      diagnostics.push({ name: "target.hasOrientation", value: root.target.hasOrientation });
    }
    flattenScalars(root.diagnostics, "diagnostics", diagnostics, 0, 100);
    flattenScalars(root.settings, "settings", diagnostics, 0, 130);
    diagnostics = uniqueRows(diagnostics).slice(0, 130);
    diagnostics.forEach(function (diagnostic) {
      var row = document.createElement("tr");
      appendCell(row, humanizeName(diagnostic.name));
      appendCell(row, formatValue(diagnostic.value));
      elements.diagnosticsBody.appendChild(row);
    });
    if (!diagnostics.length) {
      emptyTable(elements.diagnosticsBody, 2, "服务未返回 IK 求解诊断，请查看原始 JSON。");
    }
    warnings.forEach(function (warning) {
      var item = document.createElement("li");
      item.textContent = warning;
      elements.resultWarningList.appendChild(item);
    });

    elements.resultWarnings.hidden = false;
    elements.ikSolutionCount.textContent = solutions.length + " solutions";
    elements.metricCount.textContent = "0 items";
    elements.parameterCount.textContent = "0 items";
    elements.diagnosticCount.textContent = diagnostics.length + " items";
    elements.rawResult.textContent = JSON.stringify(payload, null, 2);
    elements.resultSummary.textContent = root.success === true
      ? "IK 求解完成：返回 " + solutions.length + " 个候选解，关节值按当前页面单位显示。"
      : "IK 搜索已完成，但没有候选解；请检查目标可达性、关节限位、工具位姿、初值与多起点设置。";
    elements.results.hidden = false;
    state.lastResult = payload;
    updateControls();
    return warnings.length;
  }

  function renderResult(payload) {
    var root = unwrapPayload(payload);
    if (state.mode === "ik" || root.mode === "ik") {
      return renderIkResult(payload, root);
    }
    syncResultLayout(false);
    var rows = resultRows(root);
    var parameters = normalizeParameters(root);
    var warnings = collectWarnings(payload, root);

    elements.metricsBody.replaceChildren();
    elements.parametersBody.replaceChildren();
    elements.diagnosticsBody.replaceChildren();
    elements.resultWarningList.replaceChildren();

    rows.metrics.forEach(function (metric) {
      var row = document.createElement("tr");
      appendCell(row, humanizeName(metric.name));
      appendCell(row, formatValue(metric.value));
      elements.metricsBody.appendChild(row);
    });
    parameters.forEach(function (parameter) {
      var row = document.createElement("tr");
      appendCell(row, parameter.name);
      appendCell(row, formatValue(parameter.nominal));
      appendCell(row, formatValue(parameter.delta));
      var calibrated = formatValue(parameter.calibrated);
      if (parameter.details) {
        calibrated += " · " + parameter.details;
      }
      appendCell(row, calibrated);
      elements.parametersBody.appendChild(row);
    });
    rows.diagnostics.forEach(function (diagnostic) {
      var row = document.createElement("tr");
      appendCell(row, humanizeName(diagnostic.name));
      appendCell(row, formatValue(diagnostic.value));
      elements.diagnosticsBody.appendChild(row);
    });
    if (!rows.metrics.length) {
      emptyTable(elements.metricsBody, 2, "未找到标量误差指标，请查看原始 JSON。");
    }
    if (!parameters.length) {
      emptyTable(elements.parametersBody, 4, "未找到 parameters 字段，请查看原始 JSON。");
    }
    if (!rows.diagnostics.length) {
      emptyTable(elements.diagnosticsBody, 2, "未找到秩或求解诊断，请查看原始 JSON。");
    }
    warnings.forEach(function (warning) {
      var item = document.createElement("li");
      item.textContent = warning;
      elements.resultWarningList.appendChild(item);
    });

    elements.resultWarnings.hidden = !warnings.length;
    elements.metricCount.textContent = rows.metrics.length + " items";
    elements.parameterCount.textContent = parameters.length + " items";
    elements.diagnosticCount.textContent = rows.diagnostics.length + " items";
    elements.rawResult.textContent = JSON.stringify(payload, null, 2);
    var noValidation = root.measurement && root.measurement.validationSamples === 0;
    elements.resultSummary.textContent =
      (state.mode === "closed-loop" ? "合成闭环" : "实测标定") +
      "完成：返回 " + parameters.length + " 项参数、" +
      rows.metrics.length + " 项误差指标和 " + rows.diagnostics.length + " 项诊断。" +
      (noValidation ? " 验证集比例为 0，核心卡片显示全体样本指标。" : "");
    renderSummaryCards(rows.all, root);
    if (root.measurement && root.measurement.type === "position") {
      ["before-orientation", "after-orientation"].forEach(function (key) {
        var element = document.querySelector('[data-rc-summary-value="' + key + '"]');
        element.textContent = "不适用";
        element.title = "当前数据仅包含位置测量";
      });
      document.querySelector('[data-rc-summary-improvement="orientation"]').textContent = "";
    }
    elements.results.hidden = false;
    state.lastResult = payload;
    updateControls();
    return warnings.length;
  }

  function finiteVector(value, length, label) {
    if (!Array.isArray(value) || value.length !== length ||
        value.some(function (component) { return typeof component !== "number" || !Number.isFinite(component); })) {
      throw new Error(label + "必须包含 " + length + " 个有限数值。");
    }
    return value.slice();
  }

  function abbDemoSettings(manifest) {
    if (!isPlainObject(manifest)) {
      throw new Error("ABB 示例清单不是 JSON 对象。");
    }
    var model = isPlainObject(manifest.model) ? manifest.model : {};
    var expected = isPlainObject(model.expected)
      ? model.expected
      : (isPlainObject(manifest.expected) ? manifest.expected : {});
    var zeroPose = isPlainObject(expected.zeroPose) ? expected.zeroPose : {};
    var thresholds = isPlainObject(manifest.thresholds)
      ? manifest.thresholds
      : (isPlainObject(manifest.acceptance) ? manifest.acceptance : {});
    var calibrationThresholds = isPlainObject(thresholds.calibration)
      ? thresholds.calibration
      : thresholds;
    var closureThresholds = isPlainObject(thresholds.calibratedIkTruthClosure)
      ? thresholds.calibratedIkTruthClosure
      : thresholds;
    var ikThresholds = isPlainObject(thresholds.ik) ? thresholds.ik : thresholds;
    var targetPose = isPlainObject(manifest.target) ? manifest.target : {};
    var calibrationOptions = isPlainObject(manifest.calibrationOptions)
      ? manifest.calibrationOptions
      : (isPlainObject(manifest.calibration) ? manifest.calibration : {});
    var ikOptions = isPlainObject(manifest.ikOptions)
      ? manifest.ikOptions
      : (isPlainObject(manifest.ik) ? manifest.ik : {});
    var qReference = manifest.qReference || manifest.qReferenceRad;

    return {
      id: manifest.id || "abb-irb120-3-0.58-full-loop",
      displayName: manifest.displayName || "ABB IRB 120-3/0.58",
      modelType: model.type || manifest.modelType || "urdf",
      tipLink: model.tipLink || manifest.tipLink || "tool0",
      qReference: finiteVector(qReference, 6, "ABB 示例 qReference"),
      calibrationOptions: calibrationOptions,
      ikOptions: ikOptions,
      expected: {
        activeJointCount: expected.activeJointCount === undefined ? 6 : expected.activeJointCount,
        jointCount: expected.jointCount === undefined ? 8 : expected.jointCount,
        limitsComplete: expected.limitsComplete === undefined ? true : expected.limitsComplete,
        robotName: expected.robotName || "abb_irb120_3_58_kinematics_demo",
        baseLink: expected.baseLink || "base_link",
        warningCount: expected.warningCount === undefined ? 0 : expected.warningCount,
        activeJointOrder: Array.isArray(expected.activeJointOrder)
          ? expected.activeJointOrder.slice()
          : ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"],
        zeroPosition: finiteVector(zeroPose.position || zeroPose.positionM, 3, "ABB 零位参考位置"),
        zeroQuaternion: finiteVector(
          zeroPose.quaternion || zeroPose.quaternionXyzw,
          4,
          "ABB 零位参考四元数"
        ),
        referencePosition: finiteVector(targetPose.position, 3, "ABB 非零位参考位置"),
        referenceQuaternion: finiteVector(targetPose.quaternion, 4, "ABB 非零位参考四元数")
      },
      thresholds: {
        zeroPositionErrorM: zeroPose.positionToleranceM === undefined
          ? (thresholds.zeroPositionErrorM === undefined ? 1e-12 : thresholds.zeroPositionErrorM)
          : zeroPose.positionToleranceM,
        zeroOrientationErrorRad: zeroPose.orientationToleranceRad === undefined
          ? (thresholds.zeroOrientationErrorRad === undefined ? 1e-12 : thresholds.zeroOrientationErrorRad)
          : zeroPose.orientationToleranceRad,
        expectedParameterCount: calibrationThresholds.expectedParameterCount,
        expectedGaugeLocks: Array.isArray(calibrationThresholds.expectedGaugeLocks)
          ? calibrationThresholds.expectedGaugeLocks.slice()
          : [],
        maximumConditionNumber: calibrationThresholds.maximumConditionNumber,
        minimumValidationSamples: calibrationThresholds.minimumValidationSamples,
        validationPositionRmseM: calibrationThresholds.maximumValidationPositionRmseM === undefined
          ? (thresholds.validationPositionRmseM === undefined ? 2e-6 : thresholds.validationPositionRmseM)
          : calibrationThresholds.maximumValidationPositionRmseM,
        validationOrientationRmseRad: calibrationThresholds.maximumValidationOrientationRmseRad === undefined
          ? (thresholds.validationOrientationRmseRad === undefined ? 1e-5 : thresholds.validationOrientationRmseRad)
          : calibrationThresholds.maximumValidationOrientationRmseRad,
        parameterTruthErrorScaleRatio: calibrationThresholds.maximumAbsoluteTruthErrorOverParameterScale === undefined
          ? 0.01
          : calibrationThresholds.maximumAbsoluteTruthErrorOverParameterScale,
        validationPositionImprovementMin: calibrationThresholds.minimumValidationPositionImprovementRatio === undefined
          ? (thresholds.validationImprovementMin === undefined ? 500 : thresholds.validationImprovementMin)
          : calibrationThresholds.minimumValidationPositionImprovementRatio,
        validationOrientationImprovementMin: calibrationThresholds.minimumValidationOrientationImprovementRatio === undefined
          ? (thresholds.validationImprovementMin === undefined ? 500 : thresholds.validationImprovementMin)
          : calibrationThresholds.minimumValidationOrientationImprovementRatio,
        replayPositionErrorM: closureThresholds.maximumTruthReplayPositionErrorM === undefined
          ? (thresholds.replayPositionErrorM === undefined ? 1e-5 : thresholds.replayPositionErrorM)
          : closureThresholds.maximumTruthReplayPositionErrorM,
        replayOrientationErrorRad: closureThresholds.maximumTruthReplayOrientationErrorRad === undefined
          ? (thresholds.replayOrientationErrorRad === undefined ? 2e-5 : thresholds.replayOrientationErrorRad)
          : closureThresholds.maximumTruthReplayOrientationErrorRad,
        replayPositionImprovementMin: closureThresholds.minimumPositionImprovementRatioOverNominalIk === undefined
          ? (thresholds.replayImprovementMin === undefined ? 50 : thresholds.replayImprovementMin)
          : closureThresholds.minimumPositionImprovementRatioOverNominalIk,
        replayOrientationImprovementMin: closureThresholds.minimumOrientationImprovementRatioOverNominalIk === undefined
          ? (thresholds.replayImprovementMin === undefined ? 50 : thresholds.replayImprovementMin)
          : closureThresholds.minimumOrientationImprovementRatioOverNominalIk,
        referencePositionErrorM: ikThresholds.maximumIndependentFkReplayPositionErrorM === undefined
          ? 2e-6
          : ikThresholds.maximumIndependentFkReplayPositionErrorM,
        referenceOrientationErrorRad: ikThresholds.maximumIndependentFkReplayOrientationErrorRad === undefined
          ? 2e-5
          : ikThresholds.maximumIndependentFkReplayOrientationErrorRad
      }
    };
  }

  function fkPose(payload) {
    var root = unwrapPayload(payload);
    var pose = isPlainObject(root.pose)
      ? root.pose
      : (isPlainObject(root.endEffectorPose) ? root.endEffectorPose : root);
    return {
      position: finiteVector(pose.position || pose.positionM || pose.xyz, 3, "FK 位置"),
      quaternion: finiteVector(
        pose.quaternion || pose.quaternionXyzw || pose.xyzw,
        4,
        "FK 四元数"
      )
    };
  }

  function poseDifference(actual, target) {
    var positionErrorM = Math.hypot(
      actual.position[0] - target.position[0],
      actual.position[1] - target.position[1],
      actual.position[2] - target.position[2]
    );
    var actualNorm = Math.hypot.apply(null, actual.quaternion);
    var targetNorm = Math.hypot.apply(null, target.quaternion);
    var dotProduct = 0;
    for (var index = 0; index < 4; index += 1) {
      dotProduct += actual.quaternion[index] * target.quaternion[index];
    }
    var normalizedDot = Math.abs(dotProduct / (actualNorm * targetNorm));
    normalizedDot = Math.max(-1, Math.min(1, normalizedDot));
    return {
      positionErrorM: positionErrorM,
      orientationErrorRad: 2 * Math.acos(normalizedDot)
    };
  }

  function correctionsFromCalibration(calibration, key) {
    var root = unwrapPayload(calibration);
    if (!Array.isArray(root.parameters)) {
      throw new Error("闭环标定结果缺少 parameters 数组。");
    }
    return root.parameters.map(function (parameter) {
      if (!isPlainObject(parameter) || typeof parameter.name !== "string" ||
          typeof parameter[key] !== "number" || !Number.isFinite(parameter[key])) {
        throw new Error("闭环标定参数缺少有效的 " + key + " 修正量。");
      }
      return { name: parameter.name, deltaSi: parameter[key] };
    });
  }

  function firstIkSolution(payload, label) {
    var root = unwrapPayload(payload);
    if (root.success !== true || !Array.isArray(root.solutions) || !root.solutions.length) {
      throw new Error(label + "没有找到 IK 解。");
    }
    var solution = root.solutions[0];
    var q = Array.isArray(solution.qSi) ? solution.qSi : solution.q;
    finiteVector(q, 6, label + "关节解");
    return solution;
  }

  function addAbbCheck(checks, name, pass, value, limit) {
    checks.push({ name: name, pass: Boolean(pass), value: value, limit: limit });
  }

  function buildAbbChecks(settings, inspectionPayload, zeroPose, referencePose,
                          calibration, nominalIk, calibratedIk,
                          nominalReplay, calibratedReplay) {
    var checks = [];
    var inspection = inspectionPayload.inspection || unwrapPayload(inspectionPayload);
    var calibrationRoot = unwrapPayload(calibration);
    var threshold = settings.thresholds;
    var zeroError = poseDifference(zeroPose, {
      position: settings.expected.zeroPosition,
      quaternion: settings.expected.zeroQuaternion
    });
    var referenceError = poseDifference(referencePose, {
      position: settings.expected.referencePosition,
      quaternion: settings.expected.referenceQuaternion
    });
    var initialValidation = calibrationRoot.metrics.initial.validation;
    var calibratedValidation = calibrationRoot.metrics.calibrated.validation;
    var positionImprovement = initialValidation.positionRmseM / calibratedValidation.positionRmseM;
    var orientationImprovement = initialValidation.orientationRmseRad / calibratedValidation.orientationRmseRad;
    var truthErrorScaleRatioMax = Math.max.apply(null, calibrationRoot.parameters.map(function (parameter) {
      var scale = typeof parameter.scale === "number" && parameter.scale > 0
        ? parameter.scale
        : 0.005;
      return Math.abs(parameter.truthError) / scale;
    }));
    var replayPositionImprovement = nominalReplay.positionErrorM /
      Math.max(calibratedReplay.positionErrorM, Number.EPSILON);
    var replayOrientationImprovement = nominalReplay.orientationErrorRad /
      Math.max(calibratedReplay.orientationErrorRad, Number.EPSILON);

    addAbbCheck(checks, "URDF 结构有效", inspection.valid === true, inspection.valid, true);
    addAbbCheck(checks, "机器人名称",
      inspection.name === settings.expected.robotName,
      inspection.name, settings.expected.robotName);
    addAbbCheck(checks, "基座 link",
      inspection.baseLink === settings.expected.baseLink,
      inspection.baseLink, settings.expected.baseLink);
    addAbbCheck(checks, "活动关节数", inspection.activeJointCount === settings.expected.activeJointCount,
      inspection.activeJointCount, settings.expected.activeJointCount);
    addAbbCheck(checks, "链路关节数", inspection.jointCount === settings.expected.jointCount,
      inspection.jointCount, settings.expected.jointCount);
    addAbbCheck(checks, "六轴物理限位完整",
      inspection.checks && inspection.checks.limitsComplete === settings.expected.limitsComplete,
      inspection.checks && inspection.checks.limitsComplete, settings.expected.limitsComplete);
    var activeOrder = Array.isArray(inspection.joints)
      ? inspection.joints.filter(function (joint) { return joint.type !== "fixed"; })
        .map(function (joint) { return joint.name; })
      : [];
    addAbbCheck(checks, "活动关节顺序",
      JSON.stringify(activeOrder) === JSON.stringify(settings.expected.activeJointOrder),
      activeOrder, settings.expected.activeJointOrder);
    addAbbCheck(checks, "URDF 预检警告数",
      Array.isArray(inspection.warnings) && inspection.warnings.length === settings.expected.warningCount,
      Array.isArray(inspection.warnings) ? inspection.warnings.length : undefined,
      settings.expected.warningCount);
    addAbbCheck(checks, "零位 FK 位置参考", zeroError.positionErrorM <= threshold.zeroPositionErrorM,
      zeroError.positionErrorM, "≤ " + threshold.zeroPositionErrorM + " m");
    addAbbCheck(checks, "零位 FK 姿态参考", zeroError.orientationErrorRad <= threshold.zeroOrientationErrorRad,
      zeroError.orientationErrorRad, "≤ " + threshold.zeroOrientationErrorRad + " rad");
    addAbbCheck(checks, "非零位 FK 位置参考",
      referenceError.positionErrorM <= threshold.referencePositionErrorM,
      referenceError.positionErrorM, "≤ " + threshold.referencePositionErrorM + " m");
    addAbbCheck(checks, "非零位 FK 姿态参考",
      referenceError.orientationErrorRad <= threshold.referenceOrientationErrorRad,
      referenceError.orientationErrorRad, "≤ " + threshold.referenceOrientationErrorRad + " rad");
    addAbbCheck(checks, "标定求解收敛", calibrationRoot.diagnostics.converged === true,
      calibrationRoot.diagnostics.converged, true);
    addAbbCheck(checks, "标定 Jacobian 满秩",
      calibrationRoot.diagnostics.rank === calibrationRoot.diagnostics.parameterCount,
      calibrationRoot.diagnostics.rank + "/" + calibrationRoot.diagnostics.parameterCount, "满秩");
    if (threshold.expectedParameterCount !== undefined) {
      addAbbCheck(checks, "规约后参数数量",
        calibrationRoot.diagnostics.parameterCount === threshold.expectedParameterCount,
        calibrationRoot.diagnostics.parameterCount, threshold.expectedParameterCount);
    }
    if (threshold.expectedGaugeLocks.length) {
      var estimatedNames = calibrationRoot.parameters.map(function (parameter) {
        return parameter.name;
      });
      var gaugeLocksApplied = threshold.expectedGaugeLocks.every(function (name) {
        return estimatedNames.indexOf(name) === -1;
      });
      addAbbCheck(checks, "规约自由度已锁定", gaugeLocksApplied,
        threshold.expectedGaugeLocks.filter(function (name) {
          return estimatedNames.indexOf(name) === -1;
        }), threshold.expectedGaugeLocks);
    }
    addAbbCheck(checks, "全部参数可观测",
      calibrationRoot.parameters.every(function (parameter) { return parameter.observable === true; }),
      calibrationRoot.parameters.filter(function (parameter) { return parameter.observable !== true; }).length,
      "0 unobservable");
    if (threshold.maximumConditionNumber !== undefined) {
      addAbbCheck(checks, "标定条件数",
        calibrationRoot.diagnostics.conditionNumber <= threshold.maximumConditionNumber,
        calibrationRoot.diagnostics.conditionNumber, "≤ " + threshold.maximumConditionNumber);
    }
    if (threshold.minimumValidationSamples !== undefined) {
      addAbbCheck(checks, "独立留出样本数",
        calibrationRoot.measurement.validationSamples >= threshold.minimumValidationSamples,
        calibrationRoot.measurement.validationSamples, "≥ " + threshold.minimumValidationSamples);
    }
    addAbbCheck(checks, "留出集位置 RMSE",
      calibratedValidation.positionRmseM <= threshold.validationPositionRmseM,
      calibratedValidation.positionRmseM, "≤ " + threshold.validationPositionRmseM + " m");
    addAbbCheck(checks, "留出集姿态 RMSE",
      calibratedValidation.orientationRmseRad <= threshold.validationOrientationRmseRad,
      calibratedValidation.orientationRmseRad, "≤ " + threshold.validationOrientationRmseRad + " rad");
    addAbbCheck(checks, "参数真值误差 / 参数尺度",
      truthErrorScaleRatioMax <= threshold.parameterTruthErrorScaleRatio,
      truthErrorScaleRatioMax, "≤ " + threshold.parameterTruthErrorScaleRatio);
    addAbbCheck(checks, "留出集位置改善倍数",
      positionImprovement >= threshold.validationPositionImprovementMin,
      positionImprovement, "≥ " + threshold.validationPositionImprovementMin + "×");
    addAbbCheck(checks, "留出集姿态改善倍数",
      orientationImprovement >= threshold.validationOrientationImprovementMin,
      orientationImprovement, "≥ " + threshold.validationOrientationImprovementMin + "×");
    addAbbCheck(checks, "名义模型 IK 有解", unwrapPayload(nominalIk).success === true,
      unwrapPayload(nominalIk).success, true);
    addAbbCheck(checks, "辨识补偿 IK 有解", unwrapPayload(calibratedIk).success === true,
      unwrapPayload(calibratedIk).success, true);
    addAbbCheck(checks, "补偿回放位置误差", calibratedReplay.positionErrorM <= threshold.replayPositionErrorM,
      calibratedReplay.positionErrorM, "≤ " + threshold.replayPositionErrorM + " m");
    addAbbCheck(checks, "补偿回放姿态误差", calibratedReplay.orientationErrorRad <= threshold.replayOrientationErrorRad,
      calibratedReplay.orientationErrorRad, "≤ " + threshold.replayOrientationErrorRad + " rad");
    addAbbCheck(checks, "物理回放位置改善倍数",
      replayPositionImprovement >= threshold.replayPositionImprovementMin,
      replayPositionImprovement, "≥ " + threshold.replayPositionImprovementMin + "×");
    addAbbCheck(checks, "物理回放姿态改善倍数",
      replayOrientationImprovement >= threshold.replayOrientationImprovementMin,
      replayOrientationImprovement, "≥ " + threshold.replayOrientationImprovementMin + "×");

    return {
      allPassed: checks.every(function (check) { return check.pass; }),
      checks: checks,
      zeroReferenceError: zeroError,
      nonzeroReferenceError: referenceError,
      validationImprovement: {
        position: positionImprovement,
        orientation: orientationImprovement
      },
      replayImprovement: {
        position: replayPositionImprovement,
        orientation: replayOrientationImprovement
      },
      parameterTruthErrorOverScaleMax: truthErrorScaleRatioMax
    };
  }

  function renderAbbDemoResult(payload) {
    renderResult(payload.calibration);
    var nominalRoot = unwrapPayload(payload.nominalIk);
    var calibratedRoot = unwrapPayload(payload.calibratedIk);
    var nominalSolution = nominalRoot.solutions[0];
    var calibratedSolution = calibratedRoot.solutions[0];
    var joints = Array.isArray(calibratedRoot.joints) ? calibratedRoot.joints : nominalRoot.joints;

    elements.ikSolutionsBody.replaceChildren();
    [
      { label: "名义模型 IK → truth FK", solution: nominalSolution, error: payload.replay.nominal },
      { label: "辨识补偿 IK → truth FK", solution: calibratedSolution, error: payload.replay.calibrated }
    ].forEach(function (entry) {
      var row = document.createElement("tr");
      appendCell(row, entry.label);
      appendCell(row, ikJointVector(entry.solution, joints));
      appendCell(row, formatValue(entry.error.positionErrorM));
      appendCell(row, formatValue(entry.error.orientationErrorRad));
      appendCell(row, formatValue(entry.solution.iterations));
      appendCell(row, entry.solution.restart === undefined ? "—" : formatValue(entry.solution.restart + 1));
      elements.ikSolutionsBody.appendChild(row);
    });
    payload.acceptance.checks.forEach(function (check) {
      var row = document.createElement("tr");
      appendCell(row, (check.pass ? "PASS · " : "FAIL · ") + check.name);
      appendCell(row, formatValue(check.value) + " · 验收 " + formatValue(check.limit));
      elements.diagnosticsBody.appendChild(row);
    });

    [
      "ABB 示例使用合成隐藏真值和社区 URDF，只证明这套软件链路能闭环，不代表某台实机已完成标定。",
      "IK 回放未检查碰撞、轨迹连续性、速度、加速度、力矩或控制器安全配置，不能直接下发机器人。"
    ].forEach(function (warning) {
      var item = document.createElement("li");
      item.textContent = warning;
      elements.resultWarningList.appendChild(item);
    });

    elements.calibrationSummary.hidden = false;
    elements.calibrationMetrics.hidden = false;
    elements.calibrationParameters.hidden = false;
    elements.ikSolutionsCard.hidden = false;
    elements.resultKicker.textContent = "ABB IRB 120 full-loop acceptance";
    elements.resultsTitle.textContent = "ABB IRB 120 全闭环结果";
    elements.resultWarnings.hidden = false;
    elements.ikSolutionCount.textContent = "2 physical replays";
    elements.diagnosticCount.textContent = elements.diagnosticsBody.children.length + " items";
    elements.rawResult.textContent = JSON.stringify(payload, null, 2);
    elements.resultSummary.textContent = payload.acceptance.allPassed
      ? "全部 " + payload.acceptance.checks.length + " 项验收通过；辨识补偿已在独立 truth FK 回放中显著降低末端误差。"
      : "全闭环已执行，但有验收项未通过；请查看诊断表中的 FAIL 项和原始 JSON。";
    elements.results.hidden = false;
    state.lastResult = payload;
    updateControls();
  }

  function clearResult() {
    state.lastResult = null;
    elements.results.hidden = true;
    elements.downloadButton.disabled = true;
    elements.metricsBody.replaceChildren();
    elements.parametersBody.replaceChildren();
    elements.ikSolutionsBody.replaceChildren();
    elements.diagnosticsBody.replaceChildren();
    elements.resultWarningList.replaceChildren();
    elements.resultWarnings.hidden = true;
    elements.rawResult.textContent = "";
    elements.ikSolutionCount.textContent = "0 solutions";
    Array.from(document.querySelectorAll("[data-rc-summary-value]")).forEach(function (element) {
      element.textContent = "—";
      element.title = "";
    });
    Array.from(document.querySelectorAll("[data-rc-summary-improvement]")).forEach(function (element) {
      element.textContent = "";
      element.classList.remove("is-positive", "is-negative");
    });
    markProcess("solver", "");
    markProcess("result", "");
  }

  async function runCalibration(event) {
    event.preventDefault();
    if (isBusy()) {
      return;
    }
    if (!state.backendReady) {
      setMessage("Docker 计算服务尚未就绪，请重新检查服务。", "error", true);
      return;
    }
    if (!state.inspectionValid) {
      setMessage("模型尚未通过当前设置下的预检，请先点击“预检模型”。", "error", true);
      return;
    }
    if (!state.uploads.model || (state.mode === "measured" && !state.uploads.data)) {
      setMessage("请提供当前模式所需的模型和测量文件。", "error", true);
      return;
    }

    state.action = "solve";
    var previousText = elements.runButton.textContent;
    elements.runButton.textContent = state.mode === "ik"
      ? "正在搜索 IK 解…"
      : (state.mode === "closed-loop" ? "正在生成并标定…" : "正在标定…");
    setRuntime(state.mode === "ik"
      ? "IK SEARCH RUNNING"
      : (state.mode === "closed-loop" ? "CLOSED LOOP RUNNING" : "CALIBRATION RUNNING"), false);
    markProcess("solver", "running");
    clearResult();
    clearMessage();
    updateControls();

    try {
      var model = await readUpload(state.uploads.model);
      var body = {
        modelType: state.modelType,
        model: model,
        options: solveOptions()
      };
      var endpoint = "/api/calibration/closed-loop";
      if (state.mode === "measured") {
        body.data = await readUpload(state.uploads.data);
        endpoint = "/api/calibration/identify";
      } else if (state.mode === "ik") {
        body.target = ikTarget();
        endpoint = "/api/calibration/ik";
      }

      var payload = await postJson(endpoint, body);
      var warningCount = renderResult(payload);
      markProcess("solver", "ready");
      markProcess("result", "ready");
      setRuntime(state.mode === "ik"
        ? "IK SEARCH COMPLETE"
        : (state.mode === "closed-loop" ? "CLOSED LOOP COMPLETE" : "CALIBRATION COMPLETE"), true);
      var root = unwrapPayload(payload);
      var noValidation = root.measurement && root.measurement.validationSamples === 0;
      if (state.mode === "ik" && root.success !== true) {
        setMessage("IK 搜索完成但未找到解。请检查目标可达性和真实关节限位，也可调整初值或多起点次数。", "warning");
      } else if (state.mode === "ik") {
        setMessage("IK 候选解已生成；下发机器人前请另行完成碰撞、轨迹连续性和动力学检查。", "warning");
      } else if (warningCount) {
        setMessage("求解完成，并返回 " + warningCount + " 条可辨识性或结果警告；应用补偿前请先阅读。", "warning");
      } else if (noValidation) {
        setMessage("求解完成；验证集比例为 0，核心卡片显示全体样本。真实应用建议保留独立验证点。", "warning");
      } else {
        setMessage("求解完成。请重点比较验证集的标定前后误差、数值秩和条件数。", "success");
      }

      var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.results.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start"
      });
      window.setTimeout(function () {
        elements.resultsTitle.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 350);
    } catch (error) {
      markProcess("solver", "error");
      setRuntime(state.mode === "ik" ? "IK SEARCH FAILED" : "CALIBRATION FAILED", false);
      setMessage((state.mode === "ik" ? "IK 求解失败：" : "标定失败：") + error.message, "error", true);
    } finally {
      state.action = "";
      elements.runButton.textContent = previousText;
      syncModeUi();
      updateControls();
    }
  }

  async function loadExamples() {
    if (isBusy()) {
      return;
    }
    state.action = "example";
    var previousText = elements.exampleButton.textContent;
    elements.exampleButton.textContent = "正在载入…";
    clearMessage();
    updateControls();

    try {
      var responses = await Promise.all([
        fetch(EXAMPLES.model, { cache: "no-store" }),
        fetch(EXAMPLES.data, { cache: "no-store" })
      ]);
      responses.forEach(function (response) {
        if (!response.ok) {
          throw new Error("示例文件返回 HTTP " + response.status);
        }
      });
      var contents = await Promise.all(responses.map(function (response) { return response.text(); }));

      state.mode = "measured";
      state.modelType = "dh";
      elements.lengthUnit.value = "m";
      elements.angleUnit.value = "rad";
      syncIkToleranceUnits();
      syncModeUi();
      syncModelTypeUi();
      resetUpload("model");
      resetUpload("data");
      setUpload("model", {
        name: "six_axis_standard_dh.csv",
        content: contents[0],
        size: new Blob([contents[0]]).size,
        example: true
      });
      setUpload("data", {
        name: "six_axis_measurements.csv",
        content: contents[1],
        size: new Blob([contents[1]]).size,
        example: true
      });
      setMessage("六轴标准 DH 模型和合成位姿测量示例已载入，正在准备模型预检。", "success");
    } catch (error) {
      setMessage("示例载入失败：" + error.message, "error", true);
    } finally {
      state.action = "";
      elements.exampleButton.textContent = previousText;
      updateControls();
    }

    if (state.backendReady && state.uploads.model) {
      await inspectModel(false);
    }
  }

  function commonKinematicsOptions(source) {
    var result = {};
    ["tipLink", "toolXyz", "toolRpy", "lengthUnit", "angleUnit"].forEach(function (key) {
      if (source[key] !== undefined) {
        result[key] = Array.isArray(source[key]) ? source[key].slice() : source[key];
      }
    });
    return result;
  }

  function setVectorInputs(selector, values) {
    Array.from(document.querySelectorAll(selector)).forEach(function (input, index) {
      input.value = values && values[index] !== undefined ? String(values[index]) : "";
    });
  }

  function configureAbbDemoForm(settings, modelText) {
    var options = settings.calibrationOptions;
    state.mode = "closed-loop";
    state.modelType = settings.modelType;
    elements.lengthUnit.value = options.lengthUnit || "m";
    elements.angleUnit.value = options.angleUnit || "rad";
    state.ikToleranceUnits = {
      length: elements.lengthUnit.value,
      angle: elements.angleUnit.value
    };
    elements.tipLink.value = settings.tipLink;
    elements.validationRatio.value = String(options.validationRatio);
    elements.orientationWeight.value = String(options.orientationWeight);
    elements.huberDelta.value = String(options.huberDelta);
    elements.maxIterations.value = String(options.maxIterations);
    elements.samples.value = String(options.samples);
    elements.seed.value = String(options.seed);
    elements.noisePosition.value = String(options.noisePosition);
    elements.noiseOrientation.value = String(options.noiseOrientation);
    setVectorInputs("[data-rc-tool-xyz]", options.toolXyz || [0, 0, 0]);
    setVectorInputs("[data-rc-tool-rpy]", options.toolRpy || [0, 0, 0]);
    Array.from(document.querySelectorAll("[data-rc-target]")).forEach(function (input) {
      input.checked = options.targets.indexOf(input.value) !== -1;
    });

    var ik = settings.ikOptions;
    elements.ikSeed.value = (ik.ikSeed || settings.qReference).join(", ");
    elements.ikStrategy.value = ik.ikStrategy;
    elements.ikMaxSolutions.value = String(ik.ikMaxSolutions);
    elements.ikRestarts.value = String(ik.ikRestarts);
    elements.ikMaxIterations.value = String(ik.ikMaxIterations);
    elements.ikPositionTolerance.value = String(ik.ikPositionTolerance);
    elements.ikOrientationTolerance.value = String(ik.ikOrientationTolerance);
    elements.ikOrientationWeight.value = String(ik.ikOrientationWeight);
    elements.ikSolutionTolerance.value = String(ik.ikSolutionTolerance);
    elements.ikRandomSeed.value = String(ik.ikRandomSeed);
    elements.ikAllowAssumedLimits.checked = ik.ikAllowAssumedLimits === true;

    syncModeUi();
    syncModelTypeUi();
    resetUpload("model");
    resetUpload("data");
    setUpload("model", {
      name: "abb_irb120_3_58.urdf",
      content: modelText,
      size: new Blob([modelText]).size,
      example: true
    });
  }

  async function runAbbDemo() {
    if (isBusy()) {
      return;
    }
    if (!state.backendReady) {
      setMessage("Docker 计算服务尚未就绪，无法运行 ABB 全闭环示例。", "error", true);
      return;
    }

    state.action = "abb-demo";
    var previousText = elements.abbDemoButton.textContent;
    elements.abbDemoButton.textContent = "ABB 全闭环运行中…";
    clearResult();
    clearMessage();
    setRuntime("ABB DEMO · LOADING FIXTURE", false);
    markProcess("model", "running");
    updateControls();

    try {
      var responses = await Promise.all([
        fetch(EXAMPLES.abbModel, { cache: "no-store" }),
        fetch(EXAMPLES.abbDemo, { cache: "no-store" })
      ]);
      responses.forEach(function (response) {
        if (!response.ok) {
          throw new Error("ABB 示例资产返回 HTTP " + response.status + "。");
        }
      });
      var modelText = await responses[0].text();
      var manifest = await responses[1].json();
      var settings = abbDemoSettings(manifest);
      if (settings.modelType !== "urdf") {
        throw new Error("ABB 示例清单的模型类型必须是 urdf。");
      }
      configureAbbDemoForm(settings, modelText);

      setRuntime("ABB DEMO · VALIDATING URDF", false);
      var inspection = await postJson("/api/calibration/inspect", {
        modelType: settings.modelType,
        model: modelText,
        options: {
          tipLink: settings.tipLink,
          lengthUnit: "m",
          angleUnit: "rad"
        }
      });
      if (!inspection.inspection || inspection.inspection.valid !== true) {
        throw new Error("ABB URDF 预检没有返回 valid=true。");
      }
      state.inspectionPayload = inspection;
      state.inspectionValid = true;
      renderInspection(inspection);
      markProcess("model", "ready");

      var playbackOptions = commonKinematicsOptions(settings.ikOptions);

      var zeroFk = await postJson("/api/calibration/fk", {
        modelType: settings.modelType,
        model: modelText,
        q: settings.qReference.map(function () { return 0; }),
        options: { tipLink: settings.tipLink, lengthUnit: "m", angleUnit: "rad" }
      });
      var referenceFk = await postJson("/api/calibration/fk", {
        modelType: settings.modelType,
        model: modelText,
        q: settings.qReference,
        options: playbackOptions
      });

      setRuntime("ABB DEMO · IDENTIFYING HIDDEN PARAMETERS", false);
      markProcess("data", "running");
      markProcess("solver", "running");
      var calibration = await postJson("/api/calibration/closed-loop", {
        modelType: settings.modelType,
        model: modelText,
        options: Object.assign({}, settings.calibrationOptions)
      });
      markProcess("data", "ready");
      var truthCorrections = correctionsFromCalibration(calibration, "truth");
      var estimatedCorrections = correctionsFromCalibration(calibration, "delta");

      setRuntime("ABB DEMO · GENERATING INDEPENDENT TRUTH TARGET", false);
      var truthTargetFk = await postJson("/api/calibration/fk", {
        modelType: settings.modelType,
        model: modelText,
        q: settings.qReference,
        corrections: truthCorrections,
        options: playbackOptions
      });
      var truthTarget = fkPose(truthTargetFk);
      setVectorInputs("[data-rc-ik-target-xyz]", truthTarget.position);
      setVectorInputs("[data-rc-ik-target-quaternion]", truthTarget.quaternion);

      setRuntime("ABB DEMO · REPLAYING NOMINAL IK", false);
      var nominalIk = await postJson("/api/calibration/ik", {
        modelType: settings.modelType,
        model: modelText,
        target: {
          position: truthTarget.position,
          quaternion: truthTarget.quaternion
        },
        options: Object.assign({}, settings.ikOptions)
      });
      var nominalSolution = firstIkSolution(nominalIk, "名义模型");
      var nominalQ = Array.isArray(nominalSolution.qSi) ? nominalSolution.qSi : nominalSolution.q;
      var nominalTruthFk = await postJson("/api/calibration/fk", {
        modelType: settings.modelType,
        model: modelText,
        q: nominalQ,
        corrections: truthCorrections,
        options: playbackOptions
      });

      setRuntime("ABB DEMO · REPLAYING CALIBRATED IK", false);
      var calibratedIk = await postJson("/api/calibration/ik", {
        modelType: settings.modelType,
        model: modelText,
        target: {
          position: truthTarget.position,
          quaternion: truthTarget.quaternion
        },
        corrections: estimatedCorrections,
        options: Object.assign({}, settings.ikOptions)
      });
      var calibratedSolution = firstIkSolution(calibratedIk, "辨识补偿模型");
      var calibratedQ = Array.isArray(calibratedSolution.qSi) ? calibratedSolution.qSi : calibratedSolution.q;
      var calibratedTruthFk = await postJson("/api/calibration/fk", {
        modelType: settings.modelType,
        model: modelText,
        q: calibratedQ,
        corrections: truthCorrections,
        options: playbackOptions
      });

      var nominalReplay = poseDifference(fkPose(nominalTruthFk), truthTarget);
      var calibratedReplay = poseDifference(fkPose(calibratedTruthFk), truthTarget);
      var acceptance = buildAbbChecks(
        settings,
        inspection,
        fkPose(zeroFk),
        fkPose(referenceFk),
        calibration,
        nominalIk,
        calibratedIk,
        nominalReplay,
        calibratedReplay
      );
      var payload = {
        ok: true,
        mode: "abb-full-loop",
        success: acceptance.allPassed,
        fixture: manifest,
        inspection: inspection,
        zeroFk: zeroFk,
        referenceFk: referenceFk,
        calibration: calibration,
        truthTargetFk: truthTargetFk,
        nominalIk: nominalIk,
        calibratedIk: calibratedIk,
        replay: {
          nominal: nominalReplay,
          calibrated: calibratedReplay,
          nominalTruthFk: nominalTruthFk,
          calibratedTruthFk: calibratedTruthFk
        },
        acceptance: acceptance
      };

      renderAbbDemoResult(payload);
      markProcess("solver", "ready");
      markProcess("result", acceptance.allPassed ? "ready" : "error");
      setRuntime(acceptance.allPassed ? "ABB FULL LOOP · ALL PASS" : "ABB FULL LOOP · CHECK FAILED", acceptance.allPassed);
      setMessage(
        acceptance.allPassed
          ? "ABB IRB 120 软件全闭环验收通过：URDF、参数恢复、留出集和补偿后 truth FK 回放均满足固定阈值。"
          : "ABB IRB 120 全闭环已执行，但有验收项未通过；请查看结果诊断中的 FAIL 项。",
        acceptance.allPassed ? "success" : "warning",
        !acceptance.allPassed
      );

      var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      elements.results.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start"
      });
      window.setTimeout(function () {
        elements.resultsTitle.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 350);
    } catch (error) {
      markProcess("solver", "error");
      markProcess("result", "error");
      setRuntime("ABB FULL LOOP · FAILED", false);
      setMessage("ABB IRB 120 全闭环失败：" + error.message, "error", true);
    } finally {
      state.action = "";
      elements.abbDemoButton.textContent = previousText;
      syncModeUi();
      updateControls();
    }
  }

  function downloadResult() {
    if (!state.lastResult) {
      return;
    }
    var timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
    var blob = new Blob([JSON.stringify(state.lastResult, null, 2) + "\n"], {
      type: "application/json"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "robot-calibration-" +
      (state.lastResult.mode || state.mode) + "-" + timestamp + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function resetAll() {
    if (isBusy()) {
      return;
    }
    form.reset();
    state.mode = "measured";
    state.modelType = "dh";
    state.ikToleranceUnits.length = elements.lengthUnit.value;
    state.ikToleranceUnits.angle = elements.angleUnit.value;
    resetUpload("model");
    resetUpload("data");
    state.inspectionValid = false;
    state.inspectionPayload = null;
    elements.inspection.hidden = true;
    elements.inspectionList.replaceChildren();
    elements.inspectionWarnings.replaceChildren();
    syncModeUi();
    syncModelTypeUi();
    clearResult();
    markProcess("model", "");
    markProcess("data", "");
    setRuntime(state.backendReady ? "READY FOR MODEL" : "BACKEND OFFLINE", state.backendReady);
    if (state.backendReady) {
      clearMessage();
    } else {
      setMessage("Docker 计算服务尚未启动，请确认服务已启动并重新检查。", "warning");
    }
    updateControls();
  }

  function initializeUploads() {
    Array.from(document.querySelectorAll("[data-rc-upload-input]")).forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) {
          return;
        }
        try {
          setUpload(input.dataset.rcUploadInput, file);
          if (input.dataset.rcUploadInput === "model" && state.backendReady) {
            void inspectModel(false);
          }
        } catch (error) {
          input.value = "";
          setMessage(error.message, "error", true);
        }
      });
    });

    Array.from(document.querySelectorAll("[data-rc-drop-zone]")).forEach(function (dropZone) {
      ["dragenter", "dragover"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          if (isBusy()) {
            return;
          }
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
        if (isBusy()) {
          setMessage("当前操作尚未结束，请稍后再替换输入。", "warning");
          return;
        }
        var file = event.dataTransfer && event.dataTransfer.files &&
          event.dataTransfer.files[0];
        if (!file) {
          return;
        }
        try {
          var kind = dropZone.dataset.rcDropZone;
          setUpload(kind, file);
          if (kind === "model" && state.backendReady) {
            void inspectModel(false);
          }
        } catch (error) {
          setMessage(error.message, "error", true);
        }
      });
    });
  }

  function initializeChoices() {
    Array.from(document.querySelectorAll("[data-rc-mode]")).forEach(function (button) {
      button.addEventListener("click", function () {
        setMode(button.dataset.rcMode);
      });
    });
    Array.from(document.querySelectorAll("[data-rc-model-type]")).forEach(function (button) {
      button.addEventListener("click", function () {
        setModelType(button.dataset.rcModelType);
      });
    });
  }

  function initializeInvalidation() {
    [elements.tipLink, elements.lengthUnit, elements.angleUnit].forEach(function (input) {
      input.addEventListener("change", function () {
        if (input === elements.lengthUnit || input === elements.angleUnit) {
          syncIkToleranceUnits();
        }
        invalidateInspection("模型解释设置已改变，请重新预检。");
      });
    });
    Array.from(form.querySelectorAll(
      "[data-rc-target], [data-rc-tool-xyz], [data-rc-tool-rpy], " +
      "[data-rc-ik-target-xyz], [data-rc-ik-target-quaternion], " +
      "#rc-validation-ratio, #rc-orientation-weight, #rc-huber-delta, #rc-max-iterations, " +
      "#rc-samples, #rc-seed, #rc-noise-position, #rc-noise-orientation, " +
      "#rc-ik-seed, #rc-ik-strategy, #rc-ik-max-solutions, #rc-ik-restarts, " +
      "#rc-ik-max-iterations, #rc-ik-position-tolerance, #rc-ik-orientation-tolerance, " +
      "#rc-ik-orientation-weight, #rc-ik-solution-tolerance, #rc-ik-random-seed, " +
      "#rc-ik-allow-assumed-limits"
    )).forEach(function (input) {
      input.addEventListener("change", function () {
        clearResult();
        setReadyRuntime();
        updateControls();
      });
    });
  }

  initializeUploads();
  initializeChoices();
  initializeInvalidation();
  form.addEventListener("submit", runCalibration);
  elements.inspectButton.addEventListener("click", function () { void inspectModel(true); });
  elements.exampleButton.addEventListener("click", function () { void loadExamples(); });
  elements.abbDemoButton.addEventListener("click", function () { void runAbbDemo(); });
  elements.resetButton.addEventListener("click", resetAll);
  elements.healthRetry.addEventListener("click", function () { void checkHealth(true); });
  elements.downloadButton.addEventListener("click", downloadResult);

  syncModeUi();
  syncModelTypeUi();
  updateUploadDisplay("data");
  clearResult();
  updateControls();
  void checkHealth(false);
})();
