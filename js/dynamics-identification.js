(function () {
  "use strict";

  var form = document.querySelector("#dynamics-identification-form");
  if (!form) {
    return;
  }

  var MAX_REQUEST_BYTES = 12 * 1024 * 1024;
  var EXAMPLES = {
    urdf: "/tools/dynamics-identification/examples/two_link.urdf",
    csv: "/tools/dynamics-identification/examples/two_link_data.csv"
  };
  var DEFAULT_COPY = {
    urdf: {
      title: "拖入或选择 URDF",
      detail: "固定基；支持 revolute / continuous / prismatic"
    },
    csv: {
      title: "拖入或选择 CSV",
      detail: "每个关节提供 q、dq、ddq 与 tau 列"
    }
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
    validationRatio: document.querySelector("#dynamics-validation"),
    ridge: document.querySelector("#dynamics-ridge"),
    rankTolerance: document.querySelector("#dynamics-rank-tolerance"),
    friction: document.querySelector("#dynamics-friction")
  };

  var state = {
    uploads: { urdf: null, csv: null },
    backendReady: false,
    running: false,
    loadingExample: false,
    lastResult: null
  };

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
      setMessage("文件已就绪，但 Docker 计算服务尚未启动。请确认服务已启动，并检查 API 地址配置。", "warning");
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
      title.textContent = DEFAULT_COPY[kind].title;
    }
    if (detail) {
      detail.textContent = DEFAULT_COPY[kind].detail;
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
    return "Docker 计算服务返回 HTTP " + response.status + "，但没有可读取的 JSON 错误信息。";
  }

  async function checkHealth(showSuccess) {
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
      state.backendReady = Boolean(response.ok && payload && payload.ok);
      if (!state.backendReady) {
        throw new Error(apiError(payload, response));
      }
      elements.healthState.textContent = "ready";
      elements.healthState.classList.add("is-ready");
      elements.runtimeState.textContent = "READY FOR INPUT";
      elements.runtimeState.classList.add("is-updated");
      markProcess("backend", true, false);
      if (showSuccess) {
        setMessage("Docker 计算服务和 C++ 求解器均已就绪。", "success");
      } else if (elements.message && elements.message.classList.contains("di-message-warning")) {
        clearMessage();
      }
    } catch (error) {
      elements.healthState.textContent = "offline";
      elements.healthState.classList.add("is-error");
      elements.runtimeState.textContent = "BACKEND OFFLINE";
      elements.runtimeState.classList.remove("is-updated");
      markProcess("backend", false, false);
      setMessage("Docker 计算服务不可用：" + error.message + "。请确认服务已启动，并检查 API 地址配置。", "warning");
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
    updateRunButton();
    elements.exampleButton.textContent = "正在载入…";
    clearMessage();
    try {
      var responses = await Promise.all([
        fetch(EXAMPLES.urdf, { cache: "no-store" }),
        fetch(EXAMPLES.csv, { cache: "no-store" })
      ]);
      responses.forEach(function (response) {
        if (!response.ok) {
          throw new Error("示例文件返回 HTTP " + response.status);
        }
      });
      var contents = await Promise.all(responses.map(function (response) { return response.text(); }));
      var urdf = { name: "two_link.urdf", text: contents[0], size: new Blob([contents[0]]).size, example: true };
      var csv = { name: "two_link_data.csv", text: contents[1], size: new Blob([contents[1]]).size, example: true };
      setUpload("urdf", urdf);
      setUpload("csv", csv);
      if (state.backendReady) {
        setMessage("双连杆 URDF 与实验 CSV 已载入，可以开始辨识。", "success");
      } else {
        setMessage("双连杆示例已载入，但 Docker 计算服务尚未启动。请确认服务已启动，并检查 API 地址配置。", "warning");
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
    var options = {};
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

  function flattenMetrics(value, prefix, rows, depth) {
    if (rows.length >= 80 || depth > 5 || value === null || value === undefined) {
      return;
    }
    if (typeof value !== "object") {
      rows.push({ name: prefix || "result", value: value });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length <= 20 && value.every(function (item) { return typeof item !== "object"; })) {
        rows.push({ name: prefix, value: value });
      }
      return;
    }
    Object.keys(value).forEach(function (key) {
      if (rows.length >= 80 || isParameterKey(key)) {
        return;
      }
      var item = value[key];
      var name = prefix ? prefix + "." + key : key;
      if (typeof item !== "object" || item === null) {
        rows.push({ name: name, value: item });
      } else if (Array.isArray(item)) {
        if (item.length <= 20 && item.every(function (entry) { return typeof entry !== "object"; })) {
          rows.push({ name: name, value: item });
        }
      } else {
        flattenMetrics(item, name, rows, depth + 1);
      }
    });
  }

  function normalizeMetrics(root) {
    var rows = [];
    var preferredKeys = ["metrics", "diagnostics", "data", "summary", "fit", "validation", "dataset", "solver", "model"];
    preferredKeys.forEach(function (key) {
      if (root && Object.prototype.hasOwnProperty.call(root, key)) {
        flattenMetrics(root[key], key, rows, 0);
      }
    });
    if (root && root.metrics && Array.isArray(root.metrics.by_joint)) {
      root.metrics.by_joint.forEach(function (joint, index) {
        if (!isPlainObject(joint)) {
          return;
        }
        var jointName = joint.joint || "joint[" + index + "]";
        ["all", "train", "validation"].forEach(function (scope) {
          if (!isPlainObject(joint[scope])) {
            return;
          }
          ["rmse", "mae", "max_abs", "r2"].forEach(function (metric) {
            if (joint[scope][metric] !== undefined) {
              rows.push({
                name: "metrics.by_joint." + jointName + "." + scope + "." + metric,
                value: joint[scope][metric]
              });
            }
          });
        });
      });
    }
    if (!rows.length) {
      flattenMetrics(root, "", rows, 0);
    }
    var seen = new Set();
    return rows.filter(function (row) {
      if (!row.name || seen.has(row.name)) {
        return false;
      }
      seen.add(row.name);
      return true;
    });
  }

  function humanizeName(name) {
    return name.replaceAll("_", " ").replaceAll(".", " · ");
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

  function renderResult(payload) {
    var root = unwrapResult(payload);
    var metrics = normalizeMetrics(root);
    var parameters = normalizeParameters(root);
    var warnings = root && Array.isArray(root.warnings) ? root.warnings : [];
    elements.metricsBody.replaceChildren();
    elements.parametersBody.replaceChildren();
    elements.resultWarningList.replaceChildren();

    metrics.forEach(function (metric) {
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
    elements.rawResult.textContent = JSON.stringify(payload, null, 2);
    elements.resultSummary.textContent = "C++ 求解器已返回 " + metrics.length + " 项指标和 " + parameters.length + " 项参数。";
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
    markProcess("solver", false, false);
    markProcess("result", false, false);
  }

  async function runIdentification(event) {
    event.preventDefault();
    if (state.running || state.loadingExample) {
      return;
    }
    if (!state.backendReady) {
      setMessage("Docker 计算服务尚未就绪，请重新检查服务。", "error");
      return;
    }
    if (!state.uploads.urdf || !state.uploads.csv) {
      setMessage("请同时选择 URDF 与 CSV 文件。", "error");
      return;
    }

    var previousText = elements.runButton.textContent;
    state.running = true;
    elements.runButton.textContent = "正在计算…";
    elements.runtimeState.textContent = "C++ SOLVER RUNNING";
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
        throw new Error(apiError(payload, response));
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
    resetUpload("urdf");
    resetUpload("csv");
    if (state.backendReady) {
      clearMessage();
    } else {
      setMessage("Docker 计算服务尚未启动。请确认服务已启动，并检查 API 地址配置。", "warning");
    }
    clearResult();
    markProcess("input", false, false);
    elements.runtimeState.textContent = state.backendReady ? "READY FOR INPUT" : "BACKEND OFFLINE";
    elements.runtimeState.classList.toggle("is-updated", state.backendReady);
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

  initializeUploads();
  form.addEventListener("submit", runIdentification);
  elements.exampleButton.addEventListener("click", loadExamples);
  elements.resetButton.addEventListener("click", resetAll);
  elements.healthRetry.addEventListener("click", function () { checkHealth(true); });
  elements.downloadButton.addEventListener("click", downloadResult);
  checkHealth(false);
})();
