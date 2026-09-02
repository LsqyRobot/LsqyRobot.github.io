(function () {
  "use strict";

  var form = document.querySelector("#trajectory-planning-form");
  if (!form) {
    return;
  }

  var MAX_REQUEST_BYTES = 12 * 1024 * 1024;
  var MAX_MODEL_BYTES = 1024 * 1024;
  var MAX_WAYPOINT_BYTES = 10 * 1024 * 1024;
  var MAX_WAYPOINTS = 200;
  var MAX_COLUMNS = 128;
  var MAX_LINE_BYTES = 64 * 1024;
  var DISPLAY_SAMPLE_LIMIT = 200;
  var EXAMPLES = {
    model: "/tools/robot-parameter-calibration/examples/abb_irb120_3_58.urdf",
    joint: "/tools/robot-parameter-calibration/examples/abb_irb120_joint_waypoints.csv",
    cartesian: "/tools/robot-parameter-calibration/examples/abb_irb120_cartesian_waypoints.csv"
  };
  var MODEL_COPY = {
    urdf: {
      title: "拖入或选择已展开 URDF",
      detail: "固定基串联链；不解析 Xacro",
      accept: ".urdf,application/xml,text/xml"
    },
    dh: {
      title: "拖入或选择标准 DH CSV",
      detail: "一行一个 joint；明确 q 限位和动态上限",
      accept: ".csv,text/csv"
    },
    mdh: {
      title: "拖入或选择 Craig MDH CSV",
      detail: "Craig 约定；一行一个 joint",
      accept: ".csv,text/csv"
    }
  };
  var WAYPOINT_COPY = {
    joint: {
      title: "拖入或选择关节路径点 CSV",
      detail: "q_<joint>、blend_radius、stop",
      placeholder: "waypoint_id,q_joint_1,...,blend_radius,stop",
      help: "关节模式必须提供 q_<joint>...；waypoint_id、blend_radius、stop 可选。首尾点自动停车且半径须为 0；非零半径绕过中间拐点，零半径的非共线拐点停车。",
      contractTitle: "关节路径 CSV",
      contractCopy: "整条路径在一次请求内规划。首尾点固定停止；中间点 stop=true 会停车，零半径的非共线拐点也会停车，非零半径会连续绕过拐点。",
      solverCopy: "关节路径圆角与统一时间参数化",
      runCopy: "规划整条关节路径 →"
    },
    cartesian: {
      title: "拖入或选择笛卡尔路径点 CSV",
      detail: "TCP XYZ / XYZW、blend_radius、stop",
      placeholder: "waypoint_id,px,py,pz,qx,qy,qz,qw,blend_radius,stop",
      help: "笛卡尔模式必须提供 px/py/pz 与 qx/qy/qz/qw；waypoint_id、blend_radius、stop 可选。半径使用当前长度单位，姿态四元数固定为 XYZW；相邻点须有位置位移，暂不支持原地变姿态段。",
      contractTitle: "笛卡尔路径 CSV",
      contractCopy: "位置按直线与相切圆弧构造，姿态沿 primitive 做最短弧 SLERP，再以连续 IK 生成整条关节路径；相邻点须有位置位移，暂不支持原地变姿态段。",
      solverCopy: "TCP 直线 / 圆弧、SLERP、连续 IK 与统一时间参数化",
      runCopy: "规划整条笛卡尔路径 →"
    }
  };

  var elements = {
    message: document.querySelector("[data-tp-message]"),
    healthState: document.querySelector("[data-tp-health-state]"),
    healthRetry: document.querySelector("[data-tp-health-retry]"),
    runtimeState: document.querySelector("[data-tp-runtime-state]"),
    modelInput: document.querySelector("#tp-model-file"),
    waypointInput: document.querySelector("#tp-waypoints-file"),
    waypointEditor: document.querySelector("#tp-waypoints-editor"),
    spaceHelp: document.querySelector("[data-tp-space-help]"),
    waypointContract: document.querySelector("[data-tp-waypoint-contract]"),
    pathContractTitle: document.querySelector("[data-tp-path-contract-title]"),
    pathContractCopy: document.querySelector("[data-tp-path-contract-copy]"),
    solverCopy: document.querySelector("[data-tp-solver-copy]"),
    tipField: document.querySelector("[data-tp-tip-field]"),
    tipLink: document.querySelector("#tp-tip-link"),
    lengthUnit: document.querySelector("#tp-length-unit"),
    angleUnit: document.querySelector("#tp-angle-unit"),
    samplePeriod: document.querySelector("#tp-sample-period"),
    pathStep: document.querySelector("#tp-path-step"),
    orientationStep: document.querySelector("#tp-orientation-step"),
    maximumOutputSamples: document.querySelector("#tp-maximum-output-samples"),
    maxVelocity: document.querySelector("#tp-max-velocity"),
    maxAcceleration: document.querySelector("#tp-max-acceleration"),
    jointMetricScale: document.querySelector("#tp-joint-metric-scale"),
    clampBlends: document.querySelector("#tp-clamp-blends"),
    assumeDynamicLimits: document.querySelector("#tp-assume-dynamic-limits"),
    assumePositionLimits: document.querySelector("#tp-assume-position-limits"),
    ikSeed: document.querySelector("#tp-ik-seed"),
    ikRestarts: document.querySelector("#tp-ik-restarts"),
    ikMaxIterations: document.querySelector("#tp-ik-max-iterations"),
    ikPositionTolerance: document.querySelector("#tp-ik-position-tolerance"),
    ikOrientationTolerance: document.querySelector("#tp-ik-orientation-tolerance"),
    ikOrientationWeight: document.querySelector("#tp-ik-orientation-weight"),
    ikRandomSeed: document.querySelector("#tp-ik-random-seed"),
    ikAllowAssumedLimits: document.querySelector("#tp-ik-allow-assumed-limits"),
    toolXyz: document.querySelector("#tp-tool-xyz"),
    toolRpy: document.querySelector("#tp-tool-rpy"),
    corrections: document.querySelector("#tp-corrections"),
    runButton: document.querySelector("[data-tp-run]"),
    inspectButton: document.querySelector("[data-tp-inspect]"),
    resetButton: document.querySelector("[data-tp-reset]"),
    abbJointButton: document.querySelector("[data-tp-run-abb-joint]"),
    abbCartesianButton: document.querySelector("[data-tp-run-abb-cartesian]"),
    inspection: document.querySelector("[data-tp-inspection]"),
    inspectionState: document.querySelector("[data-tp-inspection-state]"),
    inspectionSummary: document.querySelector("[data-tp-inspection-summary]"),
    inspectionList: document.querySelector("[data-tp-inspection-list]"),
    inspectionWarnings: document.querySelector("[data-tp-inspection-warnings]"),
    results: document.querySelector("[data-tp-results]"),
    resultsTitle: document.querySelector("#tp-results-title"),
    resultSummary: document.querySelector("[data-tp-result-summary]"),
    resultWarnings: document.querySelector("[data-tp-result-warnings]"),
    resultWarningList: document.querySelector("[data-tp-result-warning-list]"),
    blendsBody: document.querySelector("[data-tp-blends-body]"),
    blendCount: document.querySelector("[data-tp-blend-count]"),
    usageBody: document.querySelector("[data-tp-usage-body]"),
    usageCount: document.querySelector("[data-tp-usage-count]"),
    samplesBody: document.querySelector("[data-tp-samples-body]"),
    sampleCount: document.querySelector("[data-tp-sample-count]"),
    rawDetails: document.querySelector("[data-tp-raw-details]"),
    rawResult: document.querySelector("[data-tp-raw-result]"),
    downloadJson: document.querySelector("[data-tp-download-json]"),
    downloadCsv: document.querySelector("[data-tp-download-csv]")
  };

  var viewerRoot = document.querySelector("[data-tp-viewer-root]");
  var viewer = window.TrajectoryViewer && viewerRoot
    ? window.TrajectoryViewer(viewerRoot)
    : null;
  var state = {
    space: "joint",
    modelType: "urdf",
    uploads: { model: null, waypoints: null },
    backendReady: false,
    healthChecking: false,
    action: "",
    inspectionValid: false,
    inspectionPayload: null,
    lastResult: null,
    rawRenderedFor: null
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

  function textBytes(text) {
    return new Blob([String(text || "")]).size;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    var units = ["B", "KB", "MB"];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 2);
    return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
  }

  function formatValue(value, digits) {
    if (typeof value !== "number") {
      if (value === undefined || value === null || value === "") return "—";
      if (typeof value === "boolean") return value ? "true" : "false";
      return String(value);
    }
    if (!Number.isFinite(value)) return String(value);
    var absolute = Math.abs(value);
    if (absolute >= 100000 || (absolute > 0 && absolute < 0.0001)) {
      return value.toExponential(digits === undefined ? 5 : digits);
    }
    return value.toLocaleString("zh-CN", {
      maximumSignificantDigits: digits === undefined ? 8 : digits,
      useGrouping: false
    });
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "—";
  }

  function formatVector(value) {
    return value.map(function (component) { return formatValue(component, 7); }).join(", ");
  }

  function humanize(name) {
    return String(name).replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  function setMessage(text, kind, focus) {
    elements.message.textContent = text || "";
    elements.message.className = "rc-message" + (kind ? " rc-message-" + kind : "");
    elements.message.hidden = !text;
    elements.message.setAttribute("role", kind === "error" ? "alert" : "status");
    elements.message.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    if (text && focus) elements.message.focus();
  }

  function clearMessage() {
    setMessage("", "");
  }

  function setRuntime(text, ready) {
    elements.runtimeState.textContent = text;
    elements.runtimeState.classList.toggle("is-updated", Boolean(ready));
  }

  function markProcess(name, status) {
    var item = document.querySelector('[data-tp-process="' + name + '"]');
    if (!item) return;
    item.classList.toggle("is-previewed", status === "ready");
    item.classList.toggle("is-running", status === "running");
    item.classList.toggle("is-error", status === "error");
  }

  function setReadyRuntime() {
    if (!state.backendReady) setRuntime("BACKEND OFFLINE", false);
    else if (state.inspectionValid && elements.waypointEditor.value.trim()) {
      setRuntime("READY TO PLAN", true);
    } else if (state.inspectionValid) setRuntime("MODEL VALID / NEED PATH", true);
    else if (state.uploads.model) setRuntime("MODEL NEEDS CHECK", false);
    else setRuntime("READY FOR INPUT", true);
  }

  function updateControls() {
    var busy = isBusy();
    form.setAttribute("aria-busy", busy ? "true" : "false");
    Array.from(form.querySelectorAll("button, input, select, textarea")).forEach(function (control) {
      control.disabled = busy;
    });
    elements.tipLink.disabled = busy || state.modelType !== "urdf";
    Array.from(document.querySelectorAll("[data-tp-cartesian-only] input, [data-tp-cartesian-only] select"))
      .forEach(function (control) { control.disabled = busy || state.space !== "cartesian"; });
    Array.from(document.querySelectorAll("[data-tp-joint-only] input, [data-tp-joint-only] select"))
      .forEach(function (control) { control.disabled = busy || state.space !== "joint"; });
    elements.inspectButton.disabled = busy || !state.backendReady || !state.uploads.model;
    elements.runButton.disabled = busy || !state.backendReady || !state.inspectionValid ||
      !state.uploads.model || !elements.waypointEditor.value.trim();
    elements.resetButton.disabled = busy;
    elements.abbJointButton.disabled = busy || !state.backendReady;
    elements.abbCartesianButton.disabled = busy || !state.backendReady;
    elements.healthRetry.disabled = busy;
    elements.downloadJson.disabled = busy || !state.lastResult;
    elements.downloadCsv.disabled = busy || !state.lastResult;
  }

  function uploadDefaults(kind) {
    return kind === "model" ? MODEL_COPY[state.modelType] : WAYPOINT_COPY[state.space];
  }

  function updateUploadDisplay(kind) {
    var upload = state.uploads[kind];
    var dropZone = document.querySelector('[data-tp-drop-zone="' + kind + '"]');
    var title = document.querySelector('[data-tp-upload-title="' + kind + '"]');
    var detail = document.querySelector('[data-tp-upload-detail="' + kind + '"]');
    var defaults = uploadDefaults(kind);
    var editorText = kind === "waypoints" ? elements.waypointEditor.value : "";
    var hasContent = Boolean(upload || editorText.trim());
    dropZone.classList.toggle("has-file", hasContent);
    dropZone.classList.remove("is-dragover");
    if (!hasContent) {
      title.textContent = defaults.title;
      detail.textContent = defaults.detail;
      return;
    }
    if (upload) {
      title.textContent = upload.name;
      detail.textContent = formatBytes(upload.size) +
        (upload.example ? " · 仓库示例" : " · 本地文件") +
        (kind === "waypoints" && upload.content !== editorText ? " · 已编辑" : " · 已就绪");
    } else {
      title.textContent = "编辑器中的路径点 CSV";
      detail.textContent = formatBytes(textBytes(editorText)) + " · 未绑定本地文件";
    }
  }

  function resetUpload(kind) {
    state.uploads[kind] = null;
    var input = kind === "model" ? elements.modelInput : elements.waypointInput;
    input.value = "";
    if (kind === "waypoints") elements.waypointEditor.value = "";
    updateUploadDisplay(kind);
  }

  function validateFile(kind, file) {
    var name = String(file.name || "").toLowerCase();
    if (kind === "model") {
      if (state.modelType === "urdf" && !name.endsWith(".urdf")) {
        throw new Error("URDF 模型必须是已展开的 .urdf 文件；当前不处理 Xacro。");
      }
      if (state.modelType !== "urdf" && !name.endsWith(".csv")) {
        throw new Error("DH / MDH 模型必须是 .csv 文件。");
      }
    } else if (!name.endsWith(".csv")) {
      throw new Error("路径点文件必须是 .csv 文件。");
    }
    if (!file.size) throw new Error((file.name || "文件") + " 是空文件。");
    var limit = kind === "model" ? MAX_MODEL_BYTES : MAX_WAYPOINT_BYTES;
    if (file.size > limit) {
      throw new Error((file.name || "文件") + " 超过 " +
        (kind === "model" ? "1 MB 模型" : "10 MB 路径点") + "上限。");
    }
  }

  function viewerConfiguration() {
    return {
      modelType: state.modelType,
      text: state.uploads.model.content,
      tipLink: state.modelType === "urdf" ? elements.tipLink.value.trim() : "",
      lengthUnit: elements.lengthUnit.value,
      angleUnit: elements.angleUnit.value,
      toolXyz: optionalVectorText(elements.toolXyz, "工具 XYZ", 3) || [0, 0, 0],
      toolRpy: optionalVectorText(elements.toolRpy, "工具 RPY", 3) || [0, 0, 0]
    };
  }

  function syncViewerModel() {
    if (!viewer || !state.inspectionValid || !state.uploads.model) return;
    viewer.setModel(viewerConfiguration());
  }

  function resetViewerTrajectory() {
    if (!viewer) return;
    viewer.clear();
    if (state.inspectionValid && state.uploads.model) {
      try {
        syncViewerModel();
      } catch (_error) {
        // Form validation will report malformed tool vectors before planning.
      }
    }
  }

  function clearResult() {
    var hadResult = Boolean(state.lastResult);
    state.lastResult = null;
    state.rawRenderedFor = null;
    elements.results.hidden = true;
    elements.resultWarningList.replaceChildren();
    elements.resultWarnings.hidden = true;
    elements.blendsBody.replaceChildren();
    elements.usageBody.replaceChildren();
    elements.samplesBody.replaceChildren();
    elements.rawResult.textContent = "";
    elements.rawDetails.open = false;
    Object.keys({ duration: 1, samples: 1, velocity: 1, acceleration: 1 }).forEach(function (key) {
      var target = document.querySelector('[data-tp-summary="' + key + '"]');
      target.textContent = "—";
      target.classList.remove("is-over-limit");
    });
    if (hadResult) resetViewerTrajectory();
    updateControls();
  }

  function invalidateInspection(message) {
    state.inspectionValid = false;
    state.inspectionPayload = null;
    elements.inspection.hidden = true;
    elements.inspectionList.replaceChildren();
    elements.inspectionWarnings.replaceChildren();
    markProcess("model", "");
    clearResult();
    if (viewer) viewer.clear();
    setReadyRuntime();
    if (message && state.uploads.model) setMessage(message, "warning");
    updateControls();
  }

  function syncModelTypeUi() {
    Array.from(document.querySelectorAll("[data-tp-model-type]")).forEach(function (button) {
      var active = button.dataset.tpModelType === state.modelType;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    elements.modelInput.accept = MODEL_COPY[state.modelType].accept;
    elements.tipField.hidden = state.modelType !== "urdf";
    updateUploadDisplay("model");
  }

  function setModelType(modelType) {
    if (isBusy() || !Object.prototype.hasOwnProperty.call(MODEL_COPY, modelType)) return;
    if (state.modelType !== modelType) {
      state.modelType = modelType;
      resetUpload("model");
      invalidateInspection();
    }
    syncModelTypeUi();
    clearMessage();
    updateControls();
  }

  function syncSpaceUi() {
    Array.from(document.querySelectorAll("[data-tp-space]")).forEach(function (button) {
      var active = button.dataset.tpSpace === state.space;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    Array.from(document.querySelectorAll("[data-tp-cartesian-only]")).forEach(function (element) {
      element.hidden = state.space !== "cartesian";
    });
    Array.from(document.querySelectorAll("[data-tp-joint-only]")).forEach(function (element) {
      element.hidden = state.space !== "joint";
    });
    var copy = WAYPOINT_COPY[state.space];
    elements.spaceHelp.textContent = state.space === "joint"
      ? "CSV 中每行给出所有活动关节位置；中间点可设置关节空间 blend_radius。"
      : "CSV 中每行给出 TCP 位置和 XYZW 四元数；中间点的 blend_radius 使用当前长度单位。";
    elements.waypointEditor.placeholder = copy.placeholder;
    elements.waypointContract.textContent = copy.help;
    elements.pathContractTitle.textContent = copy.contractTitle;
    elements.pathContractCopy.textContent = copy.contractCopy;
    elements.solverCopy.textContent = copy.solverCopy;
    elements.runButton.textContent = copy.runCopy;
    updateUploadDisplay("waypoints");
    updateControls();
  }

  function setSpace(space) {
    if (isBusy() || !Object.prototype.hasOwnProperty.call(WAYPOINT_COPY, space)) return;
    if (state.space !== space) {
      state.space = space;
      resetUpload("waypoints");
      clearResult();
      markProcess("path", "");
      markProcess("solver", "");
      markProcess("result", "");
      resetViewerTrajectory();
    }
    syncSpaceUi();
    setReadyRuntime();
    clearMessage();
  }

  async function responseJson(response) {
    var text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  }

  function apiError(payload, response) {
    if (payload && payload.error) {
      if (typeof payload.error === "string") return payload.error;
      var message = payload.error.message || payload.error.code || "请求失败";
      if (payload.error.details) message += "：" + payload.error.details;
      return message;
    }
    return "Docker 计算服务返回 HTTP " + response.status + "，但没有有效 JSON 错误信息。";
  }

  async function postJson(path, body) {
    var bodyText = JSON.stringify(body);
    var requestSize = textBytes(bodyText);
    if (requestSize > MAX_REQUEST_BYTES) {
      throw new Error("文件与 JSON 封装合计 " + formatBytes(requestSize) + "，超过 12 MB 请求上限。");
    }
    var response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyText
    });
    var payload = await responseJson(response);
    if (!response.ok) throw new Error(apiError(payload, response));
    if (!isPlainObject(payload) || payload.ok !== true) {
      throw new Error("轨迹服务未返回带 ok=true 的有效 JSON。");
    }
    return payload;
  }

  async function checkHealth(showSuccess) {
    if (isBusy()) return;
    state.healthChecking = true;
    state.backendReady = false;
    elements.healthState.textContent = "checking";
    elements.healthState.classList.remove("is-ready", "rc-health-error");
    setRuntime("CHECKING BACKEND", false);
    markProcess("backend", "running");
    updateControls();
    try {
      var response = await fetch(apiUrl("/api/trajectory/health"), { cache: "no-store" });
      var payload = await responseJson(response);
      if (!response.ok || !isPlainObject(payload) || payload.ok !== true) {
        throw new Error(apiError(payload, response));
      }
      if (!isPlainObject(payload.capabilities) ||
          !Array.isArray(payload.capabilities.spaces) ||
          payload.capabilities.spaces.indexOf("joint") === -1 ||
          payload.capabilities.spaces.indexOf("cartesian") === -1) {
        throw new Error("后端未声明 joint / cartesian 整路径规划能力。");
      }
      state.backendReady = true;
      elements.healthState.textContent = "ready";
      elements.healthState.classList.add("is-ready");
      markProcess("backend", "ready");
      setReadyRuntime();
      if (showSuccess) setMessage("Docker 计算服务和轨迹 C++ 内核均已就绪。", "success");
    } catch (error) {
      elements.healthState.textContent = "offline";
      elements.healthState.classList.add("rc-health-error");
      setRuntime("BACKEND OFFLINE", false);
      markProcess("backend", "error");
      setMessage("Docker 计算服务不可用：" + error.message +
        "。请确认服务已启动、API 地址配置正确，并检查 robot_calibrator。", "warning");
    } finally {
      state.healthChecking = false;
      updateControls();
    }
  }

  function numericInput(input, label, settings) {
    var raw = input.value.trim();
    if (!raw) throw new Error(label + "不能为空。");
    var value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(label + "必须是有限数值。");
    if (settings.integer && !Number.isInteger(value)) throw new Error(label + "必须是整数。");
    if (settings.minimum !== undefined && value < settings.minimum) {
      throw new Error(label + "不能小于 " + settings.minimum + "。");
    }
    if (settings.strictMinimum !== undefined && value <= settings.strictMinimum) {
      throw new Error(label + "必须大于 " + settings.strictMinimum + "。");
    }
    if (settings.maximum !== undefined && value > settings.maximum) {
      throw new Error(label + "不能大于 " + settings.maximum + "。");
    }
    return value;
  }

  function parseVectorText(raw, label, minimumLength, maximumLength, positive) {
    var tokens = String(raw || "").trim().split(/[,，\s]+/).filter(Boolean);
    if (tokens.length < minimumLength || tokens.length > maximumLength) {
      throw new Error(label + "必须包含 " +
        (minimumLength === maximumLength ? minimumLength : minimumLength + "–" + maximumLength) + " 项。");
    }
    return tokens.map(function (token) {
      var value = Number(token);
      if (!Number.isFinite(value) || (positive && !(value > 0))) {
        throw new Error(label + (positive ? "必须全部为有限正数。" : "必须全部为有限数值。"));
      }
      return value;
    });
  }

  function optionalVectorText(input, label, expected, positive) {
    var raw = input.value.trim();
    return raw ? parseVectorText(raw, label, expected, expected, positive) : undefined;
  }

  function basicModelOptions() {
    var options = {
      lengthUnit: elements.lengthUnit.value,
      angleUnit: elements.angleUnit.value
    };
    var tip = elements.tipLink.value.trim();
    if (state.modelType === "urdf" && tip) options.tipLink = tip;
    return options;
  }

  function inspectionRoot() {
    return state.inspectionPayload && isPlainObject(state.inspectionPayload.inspection)
      ? state.inspectionPayload.inspection
      : state.inspectionPayload;
  }

  function activeJoints() {
    var inspection = inspectionRoot();
    if (!inspection || !Array.isArray(inspection.joints)) return [];
    return inspection.joints.filter(function (joint) {
      return isPlainObject(joint) && joint.type !== "fixed";
    });
  }

  function parseCsvLine(line, lineNumber) {
    if (textBytes(line) > MAX_LINE_BYTES) {
      throw new Error("路径点 CSV 第 " + lineNumber + " 行超过 64 KiB 上限。");
    }
    var cells = [];
    var value = "";
    var quoted = false;
    var closedQuote = false;
    for (var index = 0; index < line.length; index += 1) {
      var character = line[index];
      if (quoted) {
        if (character === '"' && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
          closedQuote = true;
        } else {
          value += character;
        }
      } else if (closedQuote) {
        if (character === ",") {
          cells.push(value.trim());
          value = "";
          closedQuote = false;
        } else if (!/\s/.test(character)) {
          throw new Error("路径点 CSV 第 " + lineNumber + " 行引号闭合后存在非法字符。");
        }
      } else if (character === ",") {
        cells.push(value.trim());
        value = "";
      } else if (character === '"') {
        if (value.trim()) throw new Error("路径点 CSV 第 " + lineNumber + " 行引号位置无效。");
        quoted = true;
      } else {
        value += character;
      }
    }
    if (quoted) throw new Error("路径点 CSV 第 " + lineNumber + " 行存在未闭合引号。");
    cells.push(value.trim());
    return cells;
  }

  function parsedCsv(text) {
    var lines = String(text || "").split(/\r?\n/);
    var rows = [];
    lines.forEach(function (line, index) {
      if (!line.trim() || line.trim().startsWith("#")) return;
      rows.push({ line: index + 1, cells: parseCsvLine(line, index + 1) });
    });
    if (!rows.length) throw new Error("路径点 CSV 没有表头。");
    rows[0].cells[0] = rows[0].cells[0].replace(/^\uFEFF/, "");
    if (rows[0].cells.length > MAX_COLUMNS) throw new Error("路径点 CSV 超过 128 列上限。");
    var header = rows[0].cells.map(function (cell) { return cell.trim().toLowerCase(); });
    var seen = new Set();
    header.forEach(function (name) {
      if (!name || seen.has(name)) throw new Error("路径点 CSV 表头包含空列或重复列：" + (name || "<empty>"));
      seen.add(name);
    });
    rows.slice(1).forEach(function (row) {
      if (row.cells.length !== header.length) {
        throw new Error("路径点 CSV 第 " + row.line + " 行列数与表头不一致。");
      }
    });
    return { header: header, rows: rows.slice(1) };
  }

  function findColumn(header, aliases, label) {
    for (var index = 0; index < aliases.length; index += 1) {
      var found = header.indexOf(aliases[index]);
      if (found !== -1) return found;
    }
    if (label) throw new Error("路径点 CSV 缺少列：" + label + "。");
    return -1;
  }

  function finiteCell(row, column, label) {
    var value = Number(row.cells[column]);
    if (!row.cells[column].trim() || !Number.isFinite(value)) {
      throw new Error("路径点 CSV 第 " + row.line + " 行 " + label + " 必须是有限数值。");
    }
    return value;
  }

  function booleanCell(row, column, label) {
    var value = row.cells[column].trim().toLowerCase();
    if (value === "true" || value === "1" || value === "yes") return true;
    if (value === "false" || value === "0" || value === "no") return false;
    throw new Error("路径点 CSV 第 " + row.line + " 行 " + label + " 仅支持 true/false、1/0 或 yes/no。");
  }

  function validateWaypointCsv(text) {
    if (textBytes(text) > MAX_WAYPOINT_BYTES) throw new Error("路径点 CSV 超过 10 MB 上限。");
    var csv = parsedCsv(text);
    if (csv.rows.length < 2 || csv.rows.length > MAX_WAYPOINTS) {
      throw new Error("轨迹必须包含 2–" + MAX_WAYPOINTS + " 个路径点；当前为 " + csv.rows.length + " 个。");
    }
    var idColumn = findColumn(csv.header, ["waypoint_id", "id", "name"]);
    var radiusColumn = findColumn(csv.header, ["blend_radius", "radius"]);
    var stopColumn = findColumn(csv.header, ["stop"]);
    var ids = new Set();
    var radii = [];
    var stops = [];
    var positions = [];
    var joints = activeJoints();
    if (!joints.length) throw new Error("模型预检结果缺少活动关节列表，请重新预检。");
    var columns;
    if (state.space === "joint") {
      columns = joints.map(function (joint) {
        return findColumn(csv.header, [("q_" + joint.name).toLowerCase()], "q_" + joint.name);
      });
    } else {
      columns = [
        findColumn(csv.header, ["px", "x"], "px"),
        findColumn(csv.header, ["py", "y"], "py"),
        findColumn(csv.header, ["pz", "z"], "pz"),
        findColumn(csv.header, ["qx"], "qx"),
        findColumn(csv.header, ["qy"], "qy"),
        findColumn(csv.header, ["qz"], "qz"),
        findColumn(csv.header, ["qw"], "qw")
      ];
    }
    csv.rows.forEach(function (row, rowIndex) {
      var id = idColumn === -1 ? "P" + rowIndex : row.cells[idColumn].trim();
      if (!id || ids.has(id)) throw new Error("路径点 id 不能为空或重复：" + (id || "<empty>") + "。");
      if (textBytes(id) > 128) throw new Error("路径点 id 的 UTF-8 长度不能超过 128 bytes：" + id.slice(0, 40) + "…");
      ids.add(id);
      var radius = radiusColumn === -1 ? 0 :
        finiteCell(row, radiusColumn, "blend_radius");
      if (radius < 0) throw new Error("路径点 " + id + " 的 blend_radius 不能为负数。");
      radii.push(radius);
      stops.push(stopColumn === -1 ? false : booleanCell(row, stopColumn, "stop"));
      if (state.space === "joint") {
        var q = columns.map(function (column, index) {
          var value = finiteCell(row, column, "q_" + joints[index].name);
          var factor = joints[index].type === "prismatic"
            ? (elements.lengthUnit.value === "mm" ? 0.001 : 1)
            : (elements.angleUnit.value === "deg" ? Math.PI / 180 : 1);
          var valueSi = value * factor;
          if (joints[index].hasLimits && !joints[index].continuous &&
              (valueSi < Number(joints[index].lower) - 1e-10 ||
               valueSi > Number(joints[index].upper) + 1e-10)) {
            throw new Error("路径点 " + id + " 的关节 " + joints[index].name + " 超出模型位置限位。");
          }
          return value;
        });
        positions.push(q);
      } else {
        var pose = columns.map(function (column, index) {
          return finiteCell(row, column, ["px", "py", "pz", "qx", "qy", "qz", "qw"][index]);
        });
        if (Math.hypot(pose[3], pose[4], pose[5], pose[6]) <= 1e-12) {
          throw new Error("路径点 " + id + " 的四元数不能为零。");
        }
        positions.push(pose.slice(0, 3));
      }
    });
    if (Math.abs(radii[0]) > 1e-12 || Math.abs(radii[radii.length - 1]) > 1e-12) {
      throw new Error("首尾路径点会自动停车，blend_radius 必须为 0。");
    }
    for (var index = 1; index + 1 < radii.length; index += 1) {
      if (stops[index] && radii[index] > 0) {
        throw new Error("中间路径点 " + Array.from(ids)[index] + " 不能同时 stop=true 且设置正 blend_radius。");
      }
    }
    for (var point = 1; point < positions.length; point += 1) {
      var difference = positions[point].map(function (value, axis) {
        return value - positions[point - 1][axis];
      });
      var minimumDistance = state.space === "cartesian"
        ? (elements.lengthUnit.value === "mm" ? 1e-6 : 1e-9)
        : 1e-12;
      if (Math.hypot.apply(null, difference) <= minimumDistance) {
        if (state.space === "cartesian") {
          throw new Error("相邻笛卡尔路径点须有 TCP 位置位移，暂不支持原地变姿态段（第 " +
            point + " 与 " + (point + 1) + " 个数据行）。");
        }
        throw new Error("相邻关节路径点不能相同（第 " + point + " 与 " + (point + 1) + " 个数据行）。");
      }
    }
    return {
      count: csv.rows.length,
      hasPositiveBlend: radii.some(function (radius) { return radius > 0; })
    };
  }

  function parseCorrections() {
    var text = elements.corrections.value.trim();
    if (!text) return [];
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("标定修正 JSON 无效：" + error.message);
    }
    function locate(value, depth) {
      if (depth > 6 || !value) return null;
      if (Array.isArray(value)) return value;
      if (!isPlainObject(value)) return null;
      var keys = ["parameters", "corrections", "parameter_estimates", "calibration_parameters"];
      for (var index = 0; index < keys.length; index += 1) {
        if (Array.isArray(value[keys[index]])) return value[keys[index]];
      }
      if (isPlainObject(value.result)) return locate(value.result, depth + 1);
      return null;
    }
    var source = locate(parsed, 0);
    if (!source || source.length > 96) throw new Error("标定修正必须是至多 96 项的数组，或包含 parameters 数组的标定结果。");
    var names = new Set();
    return source.map(function (item, index) {
      if (!isPlainObject(item) || typeof item.name !== "string" || !item.name.trim()) {
        throw new Error("标定修正第 " + (index + 1) + " 项缺少 name。");
      }
      var name = item.name.trim();
      if (name.length > 256 || name.includes("\0") || name.includes("=") || names.has(name)) {
        throw new Error("标定修正 name 过长、重复或含非法字符：" + name);
      }
      names.add(name);
      var value = item.deltaSi !== undefined ? item.deltaSi : item.delta;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("标定修正 " + name + " 缺少有限数值 deltaSi / delta。");
      }
      return { name: name, deltaSi: value };
    });
  }

  function planRequest() {
    if (!state.backendReady) throw new Error("Docker 计算服务尚未就绪。");
    if (!state.inspectionValid || !state.uploads.model) throw new Error("请先上传并预检模型。");
    var waypointText = elements.waypointEditor.value.trim();
    if (!waypointText) throw new Error("请上传或填写路径点 CSV。");
    var csvInfo = validateWaypointCsv(waypointText);
    var joints = activeJoints();
    var jointCount = joints.length;
    var options = basicModelOptions();
    options.samplePeriod = numericInput(elements.samplePeriod, "输出采样周期", {
      minimum: 0.001,
      maximum: 1
    });
    options.maximumOutputSamples = numericInput(elements.maximumOutputSamples, "最大输出样本", {
      integer: true,
      minimum: 3,
      maximum: 10000
    });
    var maxVelocity = optionalVectorText(elements.maxVelocity, "最大速度向量", jointCount, true);
    var maxAcceleration = optionalVectorText(elements.maxAcceleration, "最大加速度向量", jointCount, true);
    var metricScale = optionalVectorText(elements.jointMetricScale, "joint metric scale", jointCount, true);
    if (maxVelocity) options.maxVelocity = maxVelocity;
    if (maxAcceleration) options.maxAcceleration = maxAcceleration;
    if (metricScale) options.jointMetricScale = metricScale;
    options.clampBlends = elements.clampBlends.checked;
    options.allowAssumedDynamicLimits = elements.assumeDynamicLimits.checked;
    var inspection = inspectionRoot();
    var checks = isPlainObject(inspection.checks) ? inspection.checks : {};
    if (!maxVelocity && checks.velocityLimitsComplete !== true && !options.allowAssumedDynamicLimits) {
      throw new Error("模型缺少完整速度上限：请显式填写最大速度向量，或仅为仿真勾选“允许假设动态限制”。");
    }
    if (!maxAcceleration && checks.accelerationLimitsComplete !== true && !options.allowAssumedDynamicLimits) {
      throw new Error("模型缺少完整加速度上限：请显式填写最大加速度向量，或仅为仿真勾选“允许假设动态限制”。");
    }
    var hasRevolute = joints.some(function (joint) { return joint.type !== "prismatic"; });
    var hasPrismatic = joints.some(function (joint) { return joint.type === "prismatic"; });
    if (state.space === "joint" && csvInfo.hasPositiveBlend && hasRevolute && hasPrismatic && !metricScale) {
      throw new Error("混合旋转 / 移动关节的关节空间 blend 必须显式提供 joint metric scale。");
    }
    if (state.space === "joint") {
      options.allowAssumedPositionLimits = elements.assumePositionLimits.checked;
      if (checks.limitsComplete !== true && !options.allowAssumedPositionLimits) {
        throw new Error("模型缺少完整关节位置限位：关节路径默认拒绝规划；仅离线演示可显式允许 simulation-only 临时范围。");
      }
    }
    var toolXyz = optionalVectorText(elements.toolXyz, "工具 XYZ", 3);
    var toolRpy = optionalVectorText(elements.toolRpy, "工具 RPY", 3);
    if (toolXyz) options.toolXyz = toolXyz;
    if (toolRpy) options.toolRpy = toolRpy;
    if (state.space === "cartesian") {
      options.pathStep = numericInput(elements.pathStep, "笛卡尔位置离散步长", { strictMinimum: 0 });
      options.orientationStep = numericInput(elements.orientationStep, "姿态离散步长", { strictMinimum: 0 });
      options.ikSeed = parseVectorText(elements.ikSeed.value, "首路径点 IK seed", jointCount, jointCount, false);
      options.ikRestarts = numericInput(elements.ikRestarts, "IK 多起点次数", {
        integer: true, minimum: 1, maximum: 64
      });
      options.ikMaxIterations = numericInput(elements.ikMaxIterations, "IK 每点最大迭代", {
        integer: true, minimum: 1, maximum: 200
      });
      options.ikPositionTolerance = numericInput(elements.ikPositionTolerance, "IK 位置容差", { strictMinimum: 0 });
      options.ikOrientationTolerance = numericInput(elements.ikOrientationTolerance, "IK 姿态容差", { strictMinimum: 0 });
      options.ikOrientationWeight = numericInput(elements.ikOrientationWeight, "IK 姿态残差权重", {
        strictMinimum: 0, maximum: 10000
      });
      options.ikRandomSeed = numericInput(elements.ikRandomSeed, "IK 随机种子", {
        integer: true, minimum: 0, maximum: 4294967295
      });
      options.ikAllowAssumedLimits = elements.ikAllowAssumedLimits.checked;
      if (checks.limitsComplete !== true && !options.ikAllowAssumedLimits) {
        throw new Error("模型缺少完整位置限位；笛卡尔连续 IK 默认拒绝临时关节范围。");
      }
    }
    return {
      body: {
        modelType: state.modelType,
        model: state.uploads.model.content,
        space: state.space,
        waypoints: waypointText,
        corrections: parseCorrections(),
        options: options
      },
      waypointText: waypointText,
      waypointCount: csvInfo.count
    };
  }

  function renderInspection(payload) {
    var inspection = payload.inspection;
    var rows = [
      ["模型类型", inspection.modelType],
      ["模型名称", inspection.name],
      ["基座 link", inspection.baseLink],
      ["末端 link", inspection.tipLink],
      ["链路 joint 数", inspection.jointCount],
      ["活动关节数", inspection.activeJointCount]
    ];
    if (isPlainObject(inspection.checks)) {
      Object.keys(inspection.checks).forEach(function (key) {
        rows.push(["检查 · " + humanize(key), inspection.checks[key]]);
      });
    }
    if (Array.isArray(inspection.joints)) {
      inspection.joints.filter(function (joint) { return joint.type !== "fixed"; }).forEach(function (joint) {
        var details = [joint.type];
        details.push(joint.continuous ? "continuous" :
          (joint.hasLimits ? "limits=[" + formatValue(joint.lower) + ", " + formatValue(joint.upper) + "]" : "limits missing"));
        details.push(joint.hasVelocityLimit ? "v=" + formatValue(joint.velocityLimitSi) + " SI" : "v missing");
        details.push(joint.hasAccelerationLimit ? "a=" + formatValue(joint.accelerationLimitSi) + " SI" : "a missing");
        rows.push(["joint · " + joint.name, details.join(" · ")]);
      });
    }
    elements.inspectionList.replaceChildren();
    rows.forEach(function (row) {
      var term = document.createElement("dt");
      var value = document.createElement("dd");
      term.textContent = row[0];
      value.textContent = formatValue(row[1]);
      elements.inspectionList.append(term, value);
    });
    var warnings = Array.isArray(inspection.warnings) ? inspection.warnings : [];
    elements.inspectionWarnings.replaceChildren();
    warnings.forEach(function (warning) {
      var item = document.createElement("li");
      item.textContent = String(warning);
      elements.inspectionWarnings.appendChild(item);
    });
    elements.inspectionWarnings.hidden = !warnings.length;
    elements.inspectionState.textContent = warnings.length ? "VALID / WARNINGS" : "VALID";
    elements.inspectionState.classList.remove("is-error");
    elements.inspectionSummary.textContent = "模型解析完成，活动关节顺序为：" +
      activeJoints().map(function (joint) { return joint.name; }).join(" → ") + "。";
    elements.inspection.hidden = false;
  }

  function renderInspectionError(message) {
    elements.inspectionList.replaceChildren();
    elements.inspectionWarnings.replaceChildren();
    elements.inspectionWarnings.hidden = true;
    elements.inspectionState.textContent = "INVALID";
    elements.inspectionState.classList.add("is-error");
    elements.inspectionSummary.textContent = message;
    elements.inspection.hidden = false;
  }

  async function performInspection(showSuccess) {
    try {
      if (!state.uploads.model) throw new Error("请先选择机器人模型。");
      viewerConfiguration();
      setRuntime("INSPECTING MODEL", false);
      markProcess("model", "running");
      clearResult();
      var payload = await postJson("/api/calibration/inspect", {
        modelType: state.modelType,
        model: state.uploads.model.content,
        options: basicModelOptions()
      });
      if (!isPlainObject(payload.inspection) || payload.inspection.valid !== true ||
          !Number.isInteger(payload.inspection.activeJointCount) ||
          payload.inspection.activeJointCount < 1 || !Array.isArray(payload.inspection.joints)) {
        throw new Error("模型预检结果结构无效或 valid 不是 true。");
      }
      state.inspectionPayload = payload;
      state.inspectionValid = true;
      renderInspection(payload);
      syncViewerModel();
      markProcess("model", "ready");
      setReadyRuntime();
      if (showSuccess) setMessage("模型预检通过，浏览器运动学骨架已就绪。请核对目标链、关节顺序与限位来源。", "success");
      return true;
    } catch (error) {
      state.inspectionPayload = null;
      state.inspectionValid = false;
      if (viewer) viewer.clear();
      renderInspectionError(error.message);
      markProcess("model", "error");
      setRuntime("MODEL INVALID", false);
      setMessage("模型预检失败：" + error.message, "error", true);
      return false;
    }
  }

  async function inspectModel(showSuccess) {
    if (isBusy()) return false;
    if (!state.backendReady) {
      setMessage("Docker 计算服务尚未就绪，请先重新检查服务。", "error", true);
      return false;
    }
    state.action = "inspect";
    clearMessage();
    updateControls();
    try {
      return await performInspection(showSuccess);
    } finally {
      state.action = "";
      updateControls();
    }
  }

  function requireFiniteNumber(value, label, minimum) {
    if (typeof value !== "number" || !Number.isFinite(value) ||
        (minimum !== undefined && value < minimum)) {
      throw new Error("规划结果中的 " + label + " 无效。");
    }
    return value;
  }

  function requireFiniteArray(value, length, label) {
    if (!Array.isArray(value) || value.length !== length ||
        value.some(function (item) { return typeof item !== "number" || !Number.isFinite(item); })) {
      throw new Error("规划结果中的 " + label + " 必须包含 " + length + " 个有限数值。");
    }
  }

  function validateResult(payload) {
    if (payload.mode !== "trajectory" || payload.success !== true ||
        (payload.space !== "joint" && payload.space !== "cartesian")) {
      throw new Error("规划结果缺少有效的 trajectory mode / space / success。");
    }
    if (!isPlainObject(payload.summary) || !Array.isArray(payload.joints) ||
        !payload.joints.length || payload.joints.some(function (joint) { return typeof joint !== "string" || !joint; })) {
      throw new Error("规划结果缺少 summary 或 joints。");
    }
    var summary = payload.summary;
    ["waypointCount", "sectionCount", "sampleCount"].forEach(function (key) {
      if (!Number.isInteger(summary[key]) || summary[key] < 1) throw new Error("规划结果中的 " + key + " 无效。");
    });
    ["durationS", "pathLength", "maximumVelocityRatio", "maximumAccelerationRatio",
      "maximumCartesianPositionErrorM", "maximumCartesianOrientationErrorRad"].forEach(function (key) {
      requireFiniteNumber(summary[key], key, 0);
    });
    if (typeof summary.allLimitsSatisfied !== "boolean") throw new Error("规划结果缺少 allLimitsSatisfied 布尔值。");
    if (typeof summary.positionLimitsComplete !== "boolean" ||
        typeof summary.assumedPositionLimitsAllowed !== "boolean") {
      throw new Error("规划结果缺少位置限位来源状态。");
    }
    if (!Array.isArray(payload.samples) || payload.samples.length !== summary.sampleCount ||
        payload.samples.length < 3 || payload.samples.length > 10000) {
      throw new Error("规划结果 samples 数量与 summary 不一致或超限。");
    }
    var previousTime = -Infinity;
    payload.samples.forEach(function (sample, index) {
      if (!isPlainObject(sample)) throw new Error("规划样本 " + index + " 不是对象。");
      requireFiniteNumber(sample.timeS, "samples[" + index + "].timeS", 0);
      requireFiniteNumber(sample.pathS, "samples[" + index + "].pathS", 0);
      if (index > 0 && !(sample.timeS > previousTime)) throw new Error("规划样本时间必须严格递增。");
      previousTime = sample.timeS;
      if (!Number.isInteger(sample.sectionIndex) || sample.sectionIndex < 0) {
        throw new Error("规划样本 sectionIndex 无效。");
      }
      requireFiniteArray(sample.qSi, payload.joints.length, "samples[" + index + "].qSi");
      requireFiniteArray(sample.dqSi, payload.joints.length, "samples[" + index + "].dqSi");
      requireFiniteArray(sample.ddqSi, payload.joints.length, "samples[" + index + "].ddqSi");
      if (!isPlainObject(sample.tcp)) throw new Error("规划样本缺少 TCP 位姿。");
      requireFiniteArray(sample.tcp.positionM, 3, "samples[" + index + "].tcp.positionM");
      requireFiniteArray(sample.tcp.quaternionXyzw, 4, "samples[" + index + "].tcp.quaternionXyzw");
    });
    if (!Array.isArray(payload.blends) || !Array.isArray(payload.jointUsage) ||
        payload.jointUsage.length !== payload.joints.length) {
      throw new Error("规划结果缺少 blends 或完整 jointUsage。");
    }
    payload.blends.forEach(function (blend, index) {
      if (!isPlainObject(blend) || typeof blend.waypointId !== "string") {
        throw new Error("blend[" + index + "] 结构无效。");
      }
      ["requestedRadius", "appliedRadius", "turnAngleRad", "tangentDistance", "waypointDeviation"]
        .forEach(function (key) { requireFiniteNumber(blend[key], "blend." + key, 0); });
    });
    payload.jointUsage.forEach(function (usage, index) {
      if (!isPlainObject(usage) || typeof usage.joint !== "string") {
        throw new Error("jointUsage[" + index + "] 结构无效。");
      }
      ["maxVelocitySi", "maxAccelerationSi", "peakAbsVelocitySi", "peakAbsAccelerationSi",
        "velocityRatio", "accelerationRatio"].forEach(function (key) {
        requireFiniteNumber(usage[key], "jointUsage." + key, 0);
      });
    });
    if (payload.warnings !== undefined && (!Array.isArray(payload.warnings) ||
        payload.warnings.some(function (warning) { return typeof warning !== "string"; }))) {
      throw new Error("规划结果 warnings 必须是字符串数组。");
    }
    return payload;
  }

  function appendCell(row, value, className) {
    var cell = document.createElement("td");
    cell.textContent = value;
    if (className) cell.className = className;
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

  function sampledPreview(samples) {
    if (samples.length <= DISPLAY_SAMPLE_LIMIT) return samples;
    var result = [];
    var previous = -1;
    for (var index = 0; index < DISPLAY_SAMPLE_LIMIT; index += 1) {
      var source = Math.round(index * (samples.length - 1) / (DISPLAY_SAMPLE_LIMIT - 1));
      if (source !== previous) result.push(samples[source]);
      previous = source;
    }
    return result;
  }

  function renderRawMetadata() {
    if (!state.lastResult || !elements.rawDetails.open || state.rawRenderedFor === state.lastResult) return;
    var metadata = {};
    Object.keys(state.lastResult).forEach(function (key) {
      if (key !== "samples") metadata[key] = state.lastResult[key];
    });
    metadata.samplesOmitted = {
      count: state.lastResult.samples.length,
      note: "完整 samples 请使用 JSON 或 CSV 下载按钮。"
    };
    elements.rawResult.textContent = JSON.stringify(metadata, null, 2);
    state.rawRenderedFor = state.lastResult;
  }

  function renderResult(result, waypointText) {
    var summary = result.summary;
    document.querySelector('[data-tp-summary="duration"]').textContent = formatValue(summary.durationS, 8);
    document.querySelector('[data-tp-summary="samples"]').textContent = String(summary.sampleCount);
    var velocitySummary = document.querySelector('[data-tp-summary="velocity"]');
    var accelerationSummary = document.querySelector('[data-tp-summary="acceleration"]');
    velocitySummary.textContent = formatPercent(summary.maximumVelocityRatio);
    accelerationSummary.textContent = formatPercent(summary.maximumAccelerationRatio);
    velocitySummary.classList.toggle("is-over-limit", summary.maximumVelocityRatio > 1.000001);
    accelerationSummary.classList.toggle("is-over-limit", summary.maximumAccelerationRatio > 1.000001);
    elements.resultSummary.textContent = (result.space === "joint" ? "关节" : "笛卡尔") +
      "整路径包含 " + summary.waypointCount + " 个路径点、" + summary.sectionCount +
      " 个停车 section，规划时长 " + formatValue(summary.durationS) + " s；" +
      (summary.allLimitsSatisfied ? "离散速度 / 加速度检查通过。" : "存在离散约束超限，请勿使用该轨迹。 ");

    var warnings = Array.isArray(result.warnings) ? result.warnings.slice() : [];
    if (result.planner && result.planner.jerkLimited === false) {
      warnings.push("当前时间参数化不限制 jerk；三维视口也不计算碰撞、动力学或控制器跟踪。");
    }
    if (!summary.positionLimitsComplete) {
      warnings.push("当前模型的位置限位不完整且启用了 simulation-only 临时范围；该结果不能用于真实机器人。");
    } else if (summary.assumedPositionLimitsAllowed) {
      warnings.push("请求允许 simulation-only 临时位置范围；本次模型限位完整，但实机前仍应核对真实控制器软硬限位。");
    }
    if (!summary.allLimitsSatisfied) warnings.push("至少一个关节的离散速度或加速度超过设定限制。");
    warnings = warnings.filter(function (warning, index) { return warnings.indexOf(warning) === index; });
    elements.resultWarningList.replaceChildren();
    warnings.forEach(function (warning) {
      var item = document.createElement("li");
      item.textContent = warning;
      elements.resultWarningList.appendChild(item);
    });
    elements.resultWarnings.hidden = !warnings.length;

    elements.blendsBody.replaceChildren();
    result.blends.forEach(function (blend) {
      var row = document.createElement("tr");
      appendCell(row, blend.waypointId);
      appendCell(row, formatValue(blend.requestedRadius));
      appendCell(row, formatValue(blend.appliedRadius));
      appendCell(row, formatValue(blend.turnAngleRad) + " rad");
      appendCell(row, formatValue(blend.tangentDistance));
      appendCell(row, formatValue(blend.waypointDeviation));
      var status = blend.stopped ? "停车" : (blend.clamped ? "fly-by · 已缩小" :
        (blend.appliedRadius > 0 ? "fly-by" : "共线通过"));
      appendCell(row, status, blend.clamped || blend.stopped ? "is-warning" : "");
      elements.blendsBody.appendChild(row);
    });
    if (!result.blends.length) emptyTable(elements.blendsBody, 7, "路径只有首尾点，没有中间 blend。");
    elements.blendCount.textContent = result.blends.length + " items";

    elements.usageBody.replaceChildren();
    result.jointUsage.forEach(function (usage) {
      var row = document.createElement("tr");
      appendCell(row, usage.joint + " · " + usage.type);
      appendCell(row, formatValue(usage.peakAbsVelocitySi) + " / " + formatValue(usage.maxVelocitySi));
      appendCell(row, formatPercent(usage.velocityRatio), usage.velocityRatio > 1.000001 ? "is-warning" : "");
      appendCell(row, formatValue(usage.peakAbsAccelerationSi) + " / " + formatValue(usage.maxAccelerationSi));
      appendCell(row, formatPercent(usage.accelerationRatio), usage.accelerationRatio > 1.000001 ? "is-warning" : "");
      appendCell(row, (usage.velocitySource || "—") + " / " + (usage.accelerationSource || "—"));
      elements.usageBody.appendChild(row);
    });
    elements.usageCount.textContent = result.jointUsage.length + " joints";

    var preview = sampledPreview(result.samples);
    elements.samplesBody.replaceChildren();
    preview.forEach(function (sample) {
      var row = document.createElement("tr");
      appendCell(row, formatValue(sample.timeS));
      appendCell(row, formatValue(sample.pathS));
      appendCell(row, String(sample.sectionIndex));
      appendCell(row, formatVector(sample.qSi));
      appendCell(row, formatVector(sample.dqSi));
      appendCell(row, formatVector(sample.ddqSi));
      appendCell(row, formatVector(sample.tcp.positionM));
      appendCell(row, formatVector(sample.tcp.quaternionXyzw));
      elements.samplesBody.appendChild(row);
    });
    elements.sampleCount.textContent = preview.length + " / " + result.samples.length + " samples";
    state.lastResult = result;
    state.rawRenderedFor = null;
    elements.rawResult.textContent = "";
    elements.results.hidden = false;
    if (viewer) viewer.setTrajectory(result, waypointText, result.space);
    renderRawMetadata();
    updateControls();
  }

  async function performPlan() {
    try {
      setRuntime("VALIDATING WHOLE PATH", false);
      markProcess("path", "running");
      markProcess("solver", "");
      markProcess("result", "");
      clearResult();
      var request = planRequest();
      markProcess("path", "ready");
      markProcess("solver", "running");
      setRuntime("PLANNING / RETIMING", false);
      var payload = await postJson("/api/trajectory/plan", request.body);
      var result = validateResult(payload);
      markProcess("solver", "ready");
      markProcess("result", "running");
      renderResult(result, request.waypointText);
      markProcess("result", result.summary.allLimitsSatisfied ? "ready" : "error");
      setRuntime(result.summary.allLimitsSatisfied ? "TRAJECTORY VERIFIED" : "LIMIT CHECK FAILED",
        result.summary.allLimitsSatisfied);
      setMessage("整条路径规划完成。已生成 " + result.samples.length +
        " 个样本并载入运动学回放；下载前请检查 blend、关节利用率和全部警告。",
      result.summary.allLimitsSatisfied ? "success" : "warning");
      return true;
    } catch (error) {
      markProcess("path", "error");
      markProcess("solver", "error");
      markProcess("result", "");
      setRuntime("TRAJECTORY REJECTED", false);
      setMessage("轨迹规划失败：" + error.message, "error", true);
      return false;
    }
  }

  async function planTrajectory(event) {
    if (event) event.preventDefault();
    if (isBusy()) return false;
    state.action = "plan";
    clearMessage();
    updateControls();
    try {
      return await performPlan();
    } finally {
      state.action = "";
      updateControls();
    }
  }

  async function fetchExampleText(path, label, maximumBytes) {
    var response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(label + "读取失败：HTTP " + response.status);
    var text = await response.text();
    var size = textBytes(text);
    if (!size || size > maximumBytes) throw new Error(label + "为空或超过大小上限。");
    return { text: text, size: size };
  }

  function configureAbbExample(space, model, waypoints) {
    form.reset();
    state.modelType = "urdf";
    state.space = space;
    state.inspectionValid = false;
    state.inspectionPayload = null;
    state.lastResult = null;
    state.uploads.model = {
      name: "abb_irb120_3_58.urdf",
      size: model.size,
      content: model.text,
      example: true
    };
    state.uploads.waypoints = {
      name: space === "joint" ? "abb_irb120_joint_waypoints.csv" : "abb_irb120_cartesian_waypoints.csv",
      size: waypoints.size,
      content: waypoints.text,
      example: true
    };
    elements.waypointEditor.value = waypoints.text;
    elements.tipLink.value = "tool0";
    elements.lengthUnit.value = "m";
    elements.angleUnit.value = "rad";
    elements.samplePeriod.value = "0.02";
    elements.pathStep.value = "0.003";
    elements.orientationStep.value = "0.04";
    elements.maximumOutputSamples.value = "5000";
    elements.maxVelocity.value = "";
    elements.maxAcceleration.value = "4, 4, 4, 8, 8, 10";
    elements.jointMetricScale.value = "";
    elements.clampBlends.checked = false;
    elements.assumeDynamicLimits.checked = false;
    elements.assumePositionLimits.checked = false;
    elements.ikSeed.value = "0, -0.8, 0.5, 0, -0.4, 0";
    elements.ikRestarts.value = "8";
    elements.ikMaxIterations.value = "120";
    elements.ikPositionTolerance.value = "0.00001";
    elements.ikOrientationTolerance.value = "0.0001";
    elements.ikOrientationWeight.value = "0.2";
    elements.ikRandomSeed.value = "42";
    elements.ikAllowAssumedLimits.checked = false;
    elements.toolXyz.value = "";
    elements.toolRpy.value = "";
    elements.corrections.value = "";
    elements.inspection.hidden = true;
    if (viewer) viewer.clear();
    syncModelTypeUi();
    syncSpaceUi();
    updateUploadDisplay("model");
    updateUploadDisplay("waypoints");
    clearResult();
    markProcess("model", "");
    markProcess("path", "");
    markProcess("solver", "");
    markProcess("result", "");
  }

  async function runAbbExample(space) {
    if (isBusy() || !state.backendReady) return;
    var button = space === "joint" ? elements.abbJointButton : elements.abbCartesianButton;
    var previousText = button.textContent;
    state.action = "abb-example";
    button.textContent = "正在载入并闭环规划…";
    clearMessage();
    setRuntime("LOADING ABB EXAMPLE", false);
    updateControls();
    try {
      var loaded = await Promise.all([
        fetchExampleText(EXAMPLES.model, "ABB URDF", MAX_MODEL_BYTES),
        fetchExampleText(EXAMPLES[space], "ABB 路径点", MAX_WAYPOINT_BYTES)
      ]);
      configureAbbExample(space, loaded[0], loaded[1]);
      if (!await performInspection(false)) return;
      if (await performPlan()) {
        setMessage("ABB IRB 120 " + (space === "joint" ? "关节" : "笛卡尔") +
          "示例已完成模型预检、整路径规划、限制回放与浏览器运动学可视化。示例加速度仅用于软件回归，不是 ABB 认证规格。",
        "success");
        elements.resultsTitle.focus({ preventScroll: true });
      }
    } catch (error) {
      setRuntime("ABB EXAMPLE FAILED", false);
      setMessage("ABB 示例失败：" + error.message, "error", true);
    } finally {
      state.action = "";
      button.textContent = previousText;
      updateControls();
    }
  }

  function blobDownload(content, type, filename) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function downloadJson() {
    if (!state.lastResult) return;
    var timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
    blobDownload(JSON.stringify(state.lastResult, null, 2) + "\n", "application/json",
      "robot-trajectory-" + state.lastResult.space + "-" + timestamp + ".json");
  }

  function csvCell(value) {
    var text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }

  function downloadCsv() {
    if (!state.lastResult) return;
    var result = state.lastResult;
    var headers = ["time_s", "path_s", "section_index"];
    result.joints.forEach(function (joint) { headers.push("q_" + joint + "_si"); });
    result.joints.forEach(function (joint) { headers.push("dq_" + joint + "_si"); });
    result.joints.forEach(function (joint) { headers.push("ddq_" + joint + "_si"); });
    headers.push("tcp_px_m", "tcp_py_m", "tcp_pz_m", "tcp_qx", "tcp_qy", "tcp_qz", "tcp_qw");
    var lines = [headers.map(csvCell).join(",")];
    result.samples.forEach(function (sample) {
      var row = [sample.timeS, sample.pathS, sample.sectionIndex]
        .concat(sample.qSi, sample.dqSi, sample.ddqSi,
          sample.tcp.positionM, sample.tcp.quaternionXyzw);
      lines.push(row.map(csvCell).join(","));
    });
    var timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
    blobDownload("\uFEFF" + lines.join("\r\n") + "\r\n", "text/csv;charset=utf-8",
      "robot-trajectory-samples-" + result.space + "-" + timestamp + ".csv");
  }

  function resetAll() {
    if (isBusy()) return;
    form.reset();
    state.space = "joint";
    state.modelType = "urdf";
    state.uploads.model = null;
    state.uploads.waypoints = null;
    state.inspectionValid = false;
    state.inspectionPayload = null;
    elements.modelInput.value = "";
    elements.waypointInput.value = "";
    elements.waypointEditor.value = "";
    elements.inspection.hidden = true;
    elements.inspectionList.replaceChildren();
    elements.inspectionWarnings.replaceChildren();
    if (viewer) viewer.clear();
    syncModelTypeUi();
    syncSpaceUi();
    updateUploadDisplay("model");
    updateUploadDisplay("waypoints");
    clearResult();
    ["model", "path", "solver", "result"].forEach(function (name) { markProcess(name, ""); });
    setReadyRuntime();
    if (state.backendReady) clearMessage();
    else setMessage("Docker 计算服务尚未启动，请确认服务已启动并重新检查。", "warning");
    updateControls();
  }

  async function loadLocalFile(kind, file) {
    if (isBusy()) return;
    state.action = "read-file";
    clearMessage();
    updateControls();
    try {
      validateFile(kind, file);
      var content = await file.text();
      if (!content.trim()) throw new Error(file.name + " 没有有效文本内容。");
      state.uploads[kind] = {
        name: file.name,
        size: file.size,
        content: content,
        example: false
      };
      if (kind === "model") invalidateInspection();
      else {
        elements.waypointEditor.value = content;
        clearResult();
        markProcess("path", "");
      }
      updateUploadDisplay(kind);
      setReadyRuntime();
    } catch (error) {
      if (kind === "model") elements.modelInput.value = "";
      else elements.waypointInput.value = "";
      setMessage(error.message, "error", true);
      return;
    } finally {
      state.action = "";
      updateControls();
    }
    if (kind === "model" && state.backendReady) await inspectModel(false);
  }

  function initializeUploads() {
    Array.from(document.querySelectorAll("[data-tp-upload-input]")).forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (file) void loadLocalFile(input.dataset.tpUploadInput, file);
      });
    });
    Array.from(document.querySelectorAll("[data-tp-drop-zone]")).forEach(function (dropZone) {
      ["dragenter", "dragover"].forEach(function (eventName) {
        dropZone.addEventListener(eventName, function (event) {
          event.preventDefault();
          if (isBusy()) return;
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
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
        var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) void loadLocalFile(dropZone.dataset.tpDropZone, file);
      });
    });
  }

  function initializeChoices() {
    Array.from(document.querySelectorAll("[data-tp-model-type]")).forEach(function (button) {
      button.addEventListener("click", function () { setModelType(button.dataset.tpModelType); });
    });
    Array.from(document.querySelectorAll("[data-tp-space]")).forEach(function (button) {
      button.addEventListener("click", function () { setSpace(button.dataset.tpSpace); });
    });
  }

  function initializeInvalidation() {
    [elements.tipLink, elements.lengthUnit, elements.angleUnit].forEach(function (input) {
      input.addEventListener("change", function () {
        invalidateInspection("模型解释设置已改变，请重新预检。");
      });
    });
    [elements.toolXyz, elements.toolRpy].forEach(function (input) {
      input.addEventListener("change", function () {
        clearResult();
        try {
          syncViewerModel();
          clearMessage();
        } catch (error) {
          setMessage(error.message, "error", true);
        }
      });
    });
    elements.waypointEditor.addEventListener("input", function () {
      clearResult();
      updateUploadDisplay("waypoints");
      markProcess("path", "");
      setReadyRuntime();
      updateControls();
    });
    Array.from(form.querySelectorAll(
      "#tp-sample-period, #tp-path-step, #tp-orientation-step, #tp-maximum-output-samples, " +
      "#tp-max-velocity, #tp-max-acceleration, #tp-joint-metric-scale, #tp-clamp-blends, " +
      "#tp-assume-dynamic-limits, #tp-assume-position-limits, #tp-ik-seed, #tp-ik-restarts, #tp-ik-max-iterations, " +
      "#tp-ik-position-tolerance, #tp-ik-orientation-tolerance, #tp-ik-orientation-weight, " +
      "#tp-ik-random-seed, #tp-ik-allow-assumed-limits, #tp-corrections"
    )).forEach(function (input) {
      input.addEventListener("change", function () {
        clearResult();
        setReadyRuntime();
      });
    });
  }

  initializeUploads();
  initializeChoices();
  initializeInvalidation();
  form.addEventListener("submit", planTrajectory);
  elements.inspectButton.addEventListener("click", function () { void inspectModel(true); });
  elements.resetButton.addEventListener("click", resetAll);
  elements.healthRetry.addEventListener("click", function () { void checkHealth(true); });
  elements.abbJointButton.addEventListener("click", function () { void runAbbExample("joint"); });
  elements.abbCartesianButton.addEventListener("click", function () { void runAbbExample("cartesian"); });
  elements.downloadJson.addEventListener("click", downloadJson);
  elements.downloadCsv.addEventListener("click", downloadCsv);
  elements.rawDetails.addEventListener("toggle", renderRawMetadata);

  syncModelTypeUi();
  syncSpaceUi();
  updateUploadDisplay("model");
  updateUploadDisplay("waypoints");
  clearResult();
  updateControls();
  void checkHealth(false);
}());
