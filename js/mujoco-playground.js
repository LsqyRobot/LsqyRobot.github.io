(function () {
  "use strict";

  var root = document.querySelector(".mjp-page");
  if (!root) return;

  var INTERACTIVE_MODEL_IDS = ["ur5e", "franka-panda"];
  var DRAG_METERS_PER_PIXEL = 0.00075;
  var CONTROL_INTERVAL_MS = 48;
  var VELOCITY_COMMAND_INTERVAL_MS = 80;
  var VELOCITY_KEEPALIVE_MS = 180;
  var VELOCITY_EPSILON = 0.0001;
  var STATE_POLL_MS = 320;
  var API_REQUEST_TIMEOUT_MS = 4500;
  var SESSION_CREATE_TIMEOUT_MS = 12000;
  var CONTROL_REQUEST_TIMEOUT_MS = 1400;
  var SESSION_RESET_TIMEOUT_MS = 6500;
  var SESSION_RELEASE_TIMEOUT_MS = 1200;
  var TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  var PLANES = {
    xy: { u: "X", v: "Y", label: "XY PLANE" },
    xz: { u: "X", v: "Z", label: "XZ PLANE" },
    yz: { u: "Y", v: "Z", label: "YZ PLANE" }
  };
  var DEFAULT_VELOCITY_RANGES = {
    vx: { min: -1, max: 1, step: 0.02 },
    vy: { min: -0.6, max: 0.6, step: 0.02 },
    wz: { min: -1.5, max: 1.5, step: 0.02 }
  };

  var elements = {
    health: root.querySelector("[data-mjp-health]"),
    version: root.querySelector("[data-mjp-version]"),
    message: root.querySelector("[data-mjp-message]"),
    count: root.querySelector("[data-mjp-model-count]"),
    list: root.querySelector("[data-mjp-model-list]"),
    filters: Array.from(root.querySelectorAll("[data-mjp-filter]")),
    selectedName: root.querySelector("[data-mjp-selected-name]"),
    playerState: root.querySelector("[data-mjp-player-state]"),
    thumbnail: root.querySelector("[data-mjp-thumbnail]"),
    stream: root.querySelector("[data-mjp-stream]"),
    placeholder: root.querySelector("[data-mjp-placeholder]"),
    overlay: root.querySelector("[data-mjp-render-overlay]"),
    stats: root.querySelector("[data-mjp-stats]"),
    form: root.querySelector("[data-mjp-form]"),
    startButton: root.querySelector("[data-mjp-start]"),
    stopButton: root.querySelector("[data-mjp-stop]"),
    description: root.querySelector("[data-mjp-description]"),
    mode: root.querySelector("#mjp-mode"),
    policyMode: root.querySelector("[data-mjp-policy-mode]"),
    policyField: root.querySelector("[data-mjp-policy-field]"),
    policySelect: root.querySelector("#mjp-policy"),
    fps: root.querySelector("#mjp-fps"),
    quality: root.querySelector("#mjp-quality"),
    interactionLayer: root.querySelector("[data-mjp-interaction-layer]"),
    endEffectorHandle: root.querySelector("[data-mjp-ee-handle]"),
    axisU: root.querySelector("[data-mjp-axis-u]"),
    axisV: root.querySelector("[data-mjp-axis-v]"),
    planeReadout: root.querySelector("[data-mjp-plane-readout]"),
    planeButtons: Array.from(root.querySelectorAll("[data-mjp-plane]")),
    controlPanel: root.querySelector("[data-mjp-control-panel]"),
    controlTitle: root.querySelector("#mjp-control-title"),
    controlStatus: root.querySelector("[data-mjp-control-status]"),
    readonly: root.querySelector("[data-mjp-readonly]"),
    readonlyReason: root.querySelector("[data-mjp-readonly-reason]"),
    liveControls: root.querySelector("[data-mjp-live-controls]"),
    resetButton: root.querySelector("[data-mjp-reset]"),
    endEffectorPosition: root.querySelector("[data-mjp-ee-position]"),
    jointList: root.querySelector("[data-mjp-joint-list]"),
    policyControls: root.querySelector("[data-mjp-policy-controls]"),
    policyName: root.querySelector("[data-mjp-policy-name]"),
    policyContract: root.querySelector("[data-mjp-policy-contract]"),
    policyRuntime: root.querySelector("[data-mjp-policy-runtime]"),
    policyStatus: root.querySelector("[data-mjp-policy-status]"),
    policySafety: root.querySelector("[data-mjp-policy-safety]"),
    policySafetyLabel: root.querySelector("[data-mjp-policy-safety-label]"),
    policyFault: root.querySelector("[data-mjp-policy-fault]"),
    velocityPad: root.querySelector("[data-mjp-velocity-pad]"),
    velocityPadHandle: root.querySelector("[data-mjp-pad-handle]"),
    velocityPadValue: root.querySelector("[data-mjp-pad-value]"),
    velocityInputs: Array.from(root.querySelectorAll("[data-mjp-velocity]")),
    vxOutput: root.querySelector("[data-mjp-vx-output]"),
    vyOutput: root.querySelector("[data-mjp-vy-output]"),
    wzOutput: root.querySelector("[data-mjp-wz-output]"),
    policyZeroButton: root.querySelector("[data-mjp-policy-zero]"),
    policyResetButton: root.querySelector("[data-mjp-policy-reset]"),
    policyStopButton: root.querySelector("[data-mjp-policy-stop]"),
    commandRequested: root.querySelector("[data-mjp-command-requested]"),
    commandApplied: root.querySelector("[data-mjp-command-applied]"),
    commandMeasured: root.querySelector("[data-mjp-command-measured]"),
    inference: root.querySelector("[data-mjp-inference]"),
    controlHz: root.querySelector("[data-mjp-control-hz]"),
    watchdog: root.querySelector("[data-mjp-watchdog]")
  };

  var models = [];
  var policies = [];
  var selectedModel = null;
  var selectedPolicy = null;
  var activeFilter = "all";
  var activePlane = "xy";
  var streaming = false;
  var streamRequestActive = false;
  var suppressStreamError = false;
  var streamStartTimer = 0;
  var thumbnailRetryTimer = 0;
  var statePollTimer = 0;
  var stateRequestInFlight = false;
  var stateFailures = 0;
  var sessionId = "";
  var sessionGeneration = 0;
  var sessionInteractive = false;
  var sessionPolicy = false;
  var sessionStarting = false;
  var jointSignature = "";
  var controlInFlight = false;
  var controlTimer = 0;
  var pendingReset = false;
  var pendingJoints = new Map();
  var pendingCartesian = {
    xy: [0, 0],
    xz: [0, 0],
    yz: [0, 0]
  };
  var velocityCommand = { vx: 0, vy: 0, wz: 0 };
  var velocityApplied = { vx: 0, vy: 0, wz: 0 };
  var velocityMeasured = { vx: 0, vy: 0, wz: 0 };
  var velocityDirty = false;
  var velocityRequestInFlight = false;
  var velocityTimer = 0;
  var velocityKeepaliveTimer = 0;
  var lastVelocityRequestAt = 0;
  var velocityCapability = null;
  var velocityCommandEnabled = false;
  var policyResetInFlight = false;
  var padPointerId = null;
  var drag = {
    pointerId: null,
    plane: "xy",
    lastX: 0,
    lastY: 0,
    visualX: 0,
    visualY: 0
  };

  function normalizeBase(value) {
    try {
      var parsed = new URL(value, window.location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
      parsed.search = "";
      parsed.hash = "";
      return parsed.href.replace(/\/+$/, "");
    } catch (_error) {
      return "";
    }
  }

  function apiBase() {
    var meta = document.querySelector('meta[name="mujoco-api-base"]');
    return normalizeBase(window.MUJOCO_PLAYGROUND_API_BASE || (meta && meta.content)) || "http://127.0.0.1:4020";
  }

  function apiUrl(path) {
    return apiBase() + "/" + String(path || "").replace(/^\/+/, "");
  }

  function safeNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function errorMessage(payload, fallback) {
    if (payload && payload.error && payload.error.message) return String(payload.error.message);
    if (payload && payload.message) return String(payload.message);
    return fallback;
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var settings = Object.assign({}, options || {}, { signal: controller.signal });
    var timeout = Math.max(250, safeNumber(timeoutMs, API_REQUEST_TIMEOUT_MS));
    var timedOut = false;
    var timer = window.setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, timeout);
    try {
      return await fetch(url, settings);
    } catch (error) {
      if (timedOut) throw new Error("Docker API 请求超时（" + timeout + " ms）");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function requestJson(url, options, timeoutMs) {
    var response = await fetchWithTimeout(url, options || {}, timeoutMs);
    var payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }
    if (!response.ok) {
      var error = new Error(errorMessage(payload, "Docker API 返回 HTTP " + response.status));
      error.status = response.status;
      throw error;
    }
    return payload || {};
  }

  function sessionFromPayload(payload) {
    return payload && payload.session && typeof payload.session === "object" ? payload.session : (payload || {});
  }

  function sessionIdentifier(payload) {
    var session = sessionFromPayload(payload);
    return String(session.id || session.sessionId || (payload && payload.sessionId) || "");
  }

  function showMessage(text, state) {
    elements.message.textContent = text;
    elements.message.className = "mjp-message" + (state ? " is-" + state : "");
    elements.message.hidden = false;
  }

  function hideMessage() {
    elements.message.hidden = true;
  }

  function setPlayerState(text, state) {
    elements.playerState.textContent = text;
    elements.playerState.className = state ? "is-" + state : "";
  }

  function setControlStatus(text, state) {
    elements.controlStatus.textContent = text;
    elements.controlStatus.className = state ? "is-" + state : "";
  }

  function categoryLabel(value) {
    return { quadruped: "四足", humanoid: "人形", manipulator: "机械臂" }[value] || value;
  }

  function categoryCode(value) {
    return { quadruped: "Q", humanoid: "H", manipulator: "A" }[value] || "M";
  }

  function modelSupportsInteraction(model) {
    if (!model) return false;
    if (typeof model.interactive === "boolean") return model.interactive;
    return INTERACTIVE_MODEL_IDS.indexOf(model.id) !== -1;
  }

  function policyIdentifier(policy) {
    return String(policy && (policy.id || policy.policyId) || "");
  }

  function policyRobotIds(policy) {
    if (!policy) return [];
    var values = policy.robotIds || policy.modelIds || policy.compatibleModels || policy.compatibleModelIds;
    if (!Array.isArray(values)) values = [policy.robotId || policy.modelId || (typeof policy.robot === "string" ? policy.robot : (policy.robot && policy.robot.id))];
    return values.filter(Boolean).map(function (value) { return String(value).replace(/_/g, "-"); });
  }

  function policyIsAvailable(policy) {
    if (!policy) return false;
    if (policy.available === false || policy.enabled === false) return false;
    return String(policy.status || "").toLowerCase() !== "unavailable";
  }

  function policySafetyLabel(policy) {
    var status = String(policy && policy.status || "").toLowerCase();
    var source = policy && policy.source && typeof policy.source === "object" ? policy.source : {};
    var experimental = status.indexOf("experimental") !== -1;
    var community = status.indexOf("community") !== -1 || source.official === false;
    if (experimental && community) return "实验性社区策略";
    if (experimental) return "实验性策略";
    if (community) return "社区策略";
    return "仿真策略";
  }

  function updatePolicySafety(policy) {
    if (!elements.policySafety || !elements.policySafetyLabel) return;
    elements.policySafety.hidden = !policy;
    if (policy) elements.policySafetyLabel.textContent = policySafetyLabel(policy);
  }

  function policiesForModel(model) {
    if (!model) return [];
    return policies.filter(function (policy) {
      return policyRobotIds(policy).indexOf(String(model.id).replace(/_/g, "-")) !== -1;
    });
  }

  function selectedPolicyId() {
    return policyIdentifier(selectedPolicy);
  }

  function policyModeSelected() {
    return elements.mode.value === "policy" && Boolean(selectedPolicyId());
  }

  function normalizeRange(range, fallback) {
    var source = range && typeof range === "object" ? range : {};
    var minimum = safeNumber(source.min, fallback.min);
    var maximum = safeNumber(source.max, fallback.max);
    if (maximum <= minimum) return fallback;
    return {
      min: minimum,
      max: maximum,
      step: Math.max(0.001, safeNumber(source.step, fallback.step))
    };
  }

  function policyCommandRanges(policy, capability) {
    var ranges = (capability && (capability.commandRanges || capability.ranges || (capability.vx && capability))) ||
      (policy && (policy.commandRanges || policy.ranges || policy.commandBounds || policy.command_bounds || (policy.command && policy.command.ranges))) || {};
    if (Array.isArray(ranges.minimum) && Array.isArray(ranges.maximum)) {
      ranges = {
        vx: { min: ranges.minimum[0], max: ranges.maximum[0] },
        vy: { min: ranges.minimum[1], max: ranges.maximum[1] },
        wz: { min: ranges.minimum[2], max: ranges.maximum[2] }
      };
    }
    return {
      vx: normalizeRange(ranges.vx, DEFAULT_VELOCITY_RANGES.vx),
      vy: normalizeRange(ranges.vy, DEFAULT_VELOCITY_RANGES.vy),
      wz: normalizeRange(ranges.wz || ranges.rz, DEFAULT_VELOCITY_RANGES.wz)
    };
  }

  function describePolicy(policy) {
    if (!policy) return "策略、观测适配器与控制范围均由 Docker 运行时声明。";
    var adapter = policy.adapter || policy.observationAdapter || "显式观测适配器";
    var frequency = safeNumber(policy.controlHz || policy.policyHz, 0);
    return adapter + (frequency > 0 ? " · " + frequency.toFixed(0) + " Hz" : "") + " · 指令超时自动归零";
  }

  function configurePolicyPicker(model, preferPolicy) {
    var compatible = policiesForModel(model);
    var currentId = elements.policySelect.value;
    elements.policySelect.replaceChildren();
    compatible.forEach(function (policy) {
      var option = document.createElement("option");
      option.value = policyIdentifier(policy);
      option.textContent = (policy.name || policy.displayName || policy.display_name || option.value) +
        " · " + policySafetyLabel(policy);
      option.disabled = !policyIsAvailable(policy);
      elements.policySelect.appendChild(option);
    });

    var available = compatible.filter(policyIsAvailable);
    var selected = available.find(function (policy) { return policyIdentifier(policy) === currentId; }) || available[0] || null;
    selectedPolicy = selected;
    if (selected) elements.policySelect.value = policyIdentifier(selected);
    elements.policySelect.disabled = !available.length;
    elements.policyMode.hidden = !available.length;
    elements.policyMode.disabled = !available.length;

    if (!available.length && elements.mode.value === "policy") elements.mode.value = "settle";
    if (preferPolicy && available.length) elements.mode.value = "policy";
    updatePolicySelectionDisplay();
  }

  function updatePolicySelectionDisplay() {
    var show = policyModeSelected();
    elements.policyField.hidden = !show;
    elements.form.classList.toggle("has-policy", show);
    elements.policyControls.hidden = !show;
    updateSelectedDescription();
    updatePolicySafety(selectedPolicy);
    if (!selectedPolicy) return;
    elements.policyName.textContent = selectedPolicy.name || selectedPolicy.displayName || selectedPolicy.display_name || selectedPolicyId();
    elements.policyContract.textContent = describePolicy(selectedPolicy);
    elements.policyRuntime.textContent = String(selectedPolicy.backend || selectedPolicy.runtime || "onnxruntime_cpu").replace(/_/g, " ").toUpperCase();
    configureVelocityRanges(policyCommandRanges(selectedPolicy, velocityCapability));
  }

  function updateSelectedDescription() {
    if (!selectedModel) return;
    if (policyModeSelected() && selectedPolicy) {
      var runtimeModel = selectedPolicy.runtimeModel || {};
      var repository = (runtimeModel.repository || "固定策略运行模型")
        .replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
      var revision = String(runtimeModel.revision || "").slice(0, 8);
      var license = runtimeModel.license || selectedModel.license;
      elements.description.textContent = selectedModel.description + " 策略运行模型：" + repository +
        (revision ? " " + revision : "") + "，许可：" + license + "。";
      return;
    }
    elements.description.textContent = selectedModel.description + " 模型来源：MuJoCo Menagerie " +
      selectedModel.sourceRevision.slice(0, 8) + "，许可：" + selectedModel.license + "。";
  }

  function createModelCard(model) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "mjp-model-card";
    button.dataset.modelId = model.id;
    button.dataset.category = model.category;
    button.setAttribute("aria-pressed", "false");

    var icon = document.createElement("span");
    icon.className = "mjp-model-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = categoryCode(model.category) + String(model.nu).padStart(2, "0");

    var copy = document.createElement("span");
    copy.className = "mjp-model-copy";
    var name = document.createElement("strong");
    name.textContent = model.name;
    var detail = document.createElement("small");
    detail.textContent = categoryLabel(model.category) + " · " + model.maker + " · nu " + model.nu;
    copy.append(name, detail);

    var arrow = document.createElement("em");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    button.append(icon, copy, arrow);
    button.addEventListener("click", function () { selectModel(model.id); });
    return button;
  }

  function renderCatalog() {
    elements.list.replaceChildren();
    models.forEach(function (model) {
      elements.list.appendChild(createModelCard(model));
    });
    applyFilter(activeFilter);
  }

  function applyFilter(filter) {
    activeFilter = filter;
    elements.filters.forEach(function (button) {
      var active = button.dataset.mjpFilter === filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    root.querySelectorAll(".mjp-model-card").forEach(function (card) {
      card.hidden = filter !== "all" && card.dataset.category !== filter;
    });
  }

  function updateStats(model) {
    var values = [model.nq, model.nv, model.nu, model.bodies, model.geometries, model.license];
    Array.from(elements.stats.querySelectorAll("dd")).forEach(function (item, index) {
      item.textContent = values[index];
      item.title = String(values[index]);
    });
  }

  function showThumbnail(retryCount) {
    window.clearTimeout(thumbnailRetryTimer);
    if (!selectedModel) {
      elements.thumbnail.hidden = true;
      elements.placeholder.hidden = false;
      return;
    }
    var attempt = retryCount || 0;
    elements.placeholder.hidden = true;
    elements.thumbnail.hidden = false;
    elements.thumbnail.alt = selectedModel.name + " 的 MuJoCo 无头渲染预览";
    elements.thumbnail.dataset.modelId = selectedModel.id;
    elements.thumbnail.dataset.retryCount = String(attempt);
    elements.thumbnail.src = apiUrl("api/mujoco/models/" + encodeURIComponent(selectedModel.id) + "/thumbnail.png?width=800&height=600") +
      "&v=" + encodeURIComponent(selectedModel.sourceRevision.slice(0, 8)) + "&attempt=" + attempt;
  }

  function setSessionControlsEnabled(enabled) {
    elements.planeButtons.forEach(function (button) { button.disabled = !enabled; });
    elements.resetButton.disabled = !enabled;
    elements.endEffectorHandle.disabled = !enabled;
    elements.jointList.querySelectorAll("input[type=range]").forEach(function (input) {
      input.disabled = !enabled;
    });
  }

  function resetJointPlaceholder(text) {
    jointSignature = "";
    var paragraph = document.createElement("p");
    paragraph.textContent = text;
    elements.jointList.replaceChildren(paragraph);
  }

  function setVelocityCommandControlsEnabled(enabled) {
    elements.velocityInputs.forEach(function (input) { input.disabled = !enabled; });
    elements.velocityPad.classList.toggle("is-disabled", !enabled);
    elements.velocityPad.setAttribute("aria-disabled", enabled ? "false" : "true");
    elements.velocityPad.tabIndex = enabled ? 0 : -1;
    elements.policyZeroButton.disabled = !enabled;
  }

  function setPolicySessionActionsEnabled(enabled) {
    elements.policyResetButton.disabled = !enabled || policyResetInFlight;
    elements.policyStopButton.disabled = !enabled;
  }

  function setAllPolicyControlsEnabled(enabled) {
    setVelocityCommandControlsEnabled(enabled);
    setPolicySessionActionsEnabled(enabled);
  }

  function velocityInput(axis) {
    return elements.velocityInputs.find(function (input) { return input.dataset.mjpVelocity === axis; });
  }

  function velocityRange(axis) {
    var input = velocityInput(axis);
    var fallback = DEFAULT_VELOCITY_RANGES[axis];
    return input ? {
      min: safeNumber(input.min, fallback.min),
      max: safeNumber(input.max, fallback.max),
      step: safeNumber(input.step, fallback.step)
    } : fallback;
  }

  function configureVelocityRanges(ranges) {
    Object.keys(DEFAULT_VELOCITY_RANGES).forEach(function (axis) {
      var input = velocityInput(axis);
      if (!input) return;
      var range = normalizeRange(ranges && ranges[axis], DEFAULT_VELOCITY_RANGES[axis]);
      input.min = String(range.min);
      input.max = String(range.max);
      input.step = String(range.step);
      velocityCommand[axis] = clamp(velocityCommand[axis], range.min, range.max);
      input.value = String(velocityCommand[axis]);
    });
    updateVelocityDisplay();
  }

  function formatSigned(value) {
    var number = safeNumber(value, 0);
    if (Math.abs(number) < 0.0005) number = 0;
    return (number >= 0 ? "+" : "") + number.toFixed(2);
  }

  function formatVelocityVector(command) {
    var value = command || {};
    return ["vx", "vy", "wz"].map(function (axis) { return formatSigned(value[axis]); }).join(" · ");
  }

  function rangeFraction(value, range) {
    if (value >= 0) return range.max > 0 ? value / range.max : 0;
    return range.min < 0 ? value / Math.abs(range.min) : 0;
  }

  function updateVelocityDisplay() {
    var outputByAxis = { vx: elements.vxOutput, vy: elements.vyOutput, wz: elements.wzOutput };
    elements.velocityInputs.forEach(function (input) {
      var axis = input.dataset.mjpVelocity;
      input.value = String(velocityCommand[axis]);
      outputByAxis[axis].textContent = formatSigned(velocityCommand[axis]) + (axis === "wz" ? " rad/s" : " m/s");
    });
    elements.commandRequested.textContent = formatVelocityVector(velocityCommand);
    var padValueText = "vx " + formatSigned(velocityCommand.vx) + " 米每秒，vy " +
      formatSigned(velocityCommand.vy) + " 米每秒";
    elements.velocityPad.setAttribute("aria-valuetext", padValueText);
    elements.velocityPad.setAttribute(
      "aria-label",
      "平面速度摇杆：上下控制前进速度 vx，左右控制横向速度 vy；当前 " + padValueText
    );
    if (elements.velocityPadValue) elements.velocityPadValue.textContent = "当前 " + padValueText + "。";
    var padX = clamp(rangeFraction(velocityCommand.vy, velocityRange("vy")), -1, 1) * 42;
    var padY = -clamp(rangeFraction(velocityCommand.vx, velocityRange("vx")), -1, 1) * 42;
    elements.velocityPad.style.setProperty("--mjp-pad-x", padX.toFixed(1) + "%");
    elements.velocityPad.style.setProperty("--mjp-pad-y", padY.toFixed(1) + "%");
  }

  function resetPolicyTelemetry() {
    velocityCapability = null;
    velocityCommandEnabled = false;
    velocityApplied = { vx: 0, vy: 0, wz: 0 };
    velocityMeasured = { vx: 0, vy: 0, wz: 0 };
    elements.commandApplied.textContent = formatVelocityVector(velocityApplied);
    elements.commandMeasured.textContent = formatVelocityVector(velocityMeasured);
    elements.inference.textContent = "— ms";
    elements.controlHz.textContent = selectedPolicy && (selectedPolicy.controlHz || selectedPolicy.policyHz) ?
      safeNumber(selectedPolicy.controlHz || selectedPolicy.policyHz, 0).toFixed(0) + " Hz" : "— Hz";
    elements.watchdog.textContent = "ARMED";
    elements.watchdog.className = "";
    elements.policyStatus.textContent = sessionId ? "CONNECTING" : "READY";
    elements.policyStatus.className = "";
    elements.policyFault.hidden = true;
    elements.policyFault.querySelector("p").textContent = "策略运行异常";
  }

  function setVelocityCommand(next, shouldQueue) {
    ["vx", "vy", "wz"].forEach(function (axis) {
      var range = velocityRange(axis);
      velocityCommand[axis] = clamp(safeNumber(next && next[axis], velocityCommand[axis]), range.min, range.max);
      if (Math.abs(velocityCommand[axis]) < range.step * 0.45) velocityCommand[axis] = 0;
    });
    updateVelocityDisplay();
    if (shouldQueue !== false) queueVelocityCommand();
  }

  function velocityIsNonzero(command) {
    var value = command || velocityCommand;
    return Math.abs(safeNumber(value.vx, 0)) > VELOCITY_EPSILON ||
      Math.abs(safeNumber(value.vy, 0)) > VELOCITY_EPSILON ||
      Math.abs(safeNumber(value.wz, 0)) > VELOCITY_EPSILON;
  }

  function configurePolicyPreview() {
    sessionPolicy = false;
    elements.interactionLayer.hidden = true;
    elements.readonly.hidden = true;
    elements.liveControls.hidden = true;
    elements.policyControls.hidden = false;
    elements.controlTitle.textContent = "策略速度控制";
    elements.startButton.textContent = "启动 ONNX 策略 →";
    setSessionControlsEnabled(false);
    setAllPolicyControlsEnabled(false);
    resetPolicyTelemetry();
    setControlStatus(selectedPolicy ? "策略就绪 · 启动后控制" : "策略不可用", selectedPolicy ? "ready" : "error");
  }

  function configureInteractionPreview(model) {
    sessionInteractive = false;
    elements.interactionLayer.hidden = true;
    elements.endEffectorPosition.textContent = "X — · Y — · Z —";
    setSessionControlsEnabled(false);
    setAllPolicyControlsEnabled(false);
    resetHandlePosition();

    if (policyModeSelected()) {
      configurePolicyPreview();
      return;
    }

    elements.policyControls.hidden = true;

    if (modelSupportsInteraction(model)) {
      elements.readonly.hidden = true;
      elements.liveControls.hidden = false;
      elements.controlTitle.textContent = "末端与关节控制";
      elements.startButton.textContent = "启动交互仿真 →";
      setControlStatus("启动后可拖拽", "ready");
      resetJointPlaceholder("启动实时会话后读取关节范围。");
      return;
    }

    elements.liveControls.hidden = true;
    elements.readonly.hidden = false;
    elements.controlTitle.textContent = "当前模型控制能力";
    elements.startButton.textContent = "开始只读回放 →";
    if (model && model.category === "quadruped") {
      elements.readonlyReason.textContent = "四足机器人具有浮动基和周期接触；安全拖拽需要支撑腿约束、落足规划与全身控制器，当前先保持只读。";
    } else if (model && model.category === "humanoid") {
      elements.readonlyReason.textContent = "人形机器人需要同时处理平衡、接触切换和自碰撞，固定基机械臂 IK 不能直接用于全身拖拽，当前先保持只读。";
    } else {
      elements.readonlyReason.textContent = "此模型尚未声明可交互的末端、关节映射与安全约束，因此当前只开放实时回放。";
    }
    setControlStatus("只读回放", "locked");
  }

  function clearControlQueues() {
    window.clearTimeout(controlTimer);
    controlTimer = 0;
    controlInFlight = false;
    pendingReset = false;
    pendingJoints.clear();
    Object.keys(pendingCartesian).forEach(function (plane) {
      pendingCartesian[plane][0] = 0;
      pendingCartesian[plane][1] = 0;
    });
    window.clearTimeout(velocityTimer);
    window.clearTimeout(velocityKeepaliveTimer);
    velocityTimer = 0;
    velocityKeepaliveTimer = 0;
    velocityDirty = false;
    velocityRequestInFlight = false;
    lastVelocityRequestAt = 0;
    policyResetInFlight = false;
  }

  function finishDrag() {
    if (drag.pointerId !== null && elements.endEffectorHandle.hasPointerCapture && elements.endEffectorHandle.hasPointerCapture(drag.pointerId)) {
      try { elements.endEffectorHandle.releasePointerCapture(drag.pointerId); } catch (_error) { /* Pointer already released. */ }
    }
    drag.pointerId = null;
    drag.visualX = 0;
    drag.visualY = 0;
    elements.endEffectorHandle.classList.remove("is-dragging");
    elements.endEffectorHandle.style.setProperty("--mjp-drag-x", "0px");
    elements.endEffectorHandle.style.setProperty("--mjp-drag-y", "0px");
  }

  function resetHandlePosition() {
    finishDrag();
    elements.endEffectorHandle.style.left = "50%";
    elements.endEffectorHandle.style.top = "50%";
  }

  function releaseSession(identifier, keepalive) {
    if (!identifier) return Promise.resolve();
    return fetchWithTimeout(apiUrl("api/mujoco/sessions/" + encodeURIComponent(identifier)), {
      method: "DELETE",
      cache: "no-store",
      keepalive: Boolean(keepalive)
    }, SESSION_RELEASE_TIMEOUT_MS).catch(function () { /* Session expiry remains a safe fallback. */ });
  }

  function retireSession(identifier, policySession, keepalive) {
    if (!identifier) return;
    if (policySession) {
      sendVelocityCommand(identifier, { vx: 0, vy: 0, wz: 0 }, keepalive).catch(function () {
        /* The server-side watchdog still guarantees a zero command. */
      });
    }
    /* DELETE is deliberately independent from the best-effort zero request: a
       stalled control connection must not keep a simulation session alive. */
    releaseSession(identifier, keepalive);
  }

  function stopStream(options) {
    var settings = options || {};
    var retiringSession = sessionId;
    var retiringPolicySession = sessionPolicy;
    sessionGeneration += 1;
    sessionId = "";
    sessionStarting = false;
    sessionInteractive = false;
    sessionPolicy = false;
    streaming = false;
    streamRequestActive = false;
    suppressStreamError = false;
    stateRequestInFlight = false;
    stateFailures = 0;
    window.clearTimeout(streamStartTimer);
    window.clearTimeout(statePollTimer);
    clearControlQueues();
    finishDrag();
    elements.stream.removeAttribute("src");
    elements.stream.hidden = true;
    elements.overlay.hidden = true;
    elements.interactionLayer.hidden = true;
    elements.startButton.disabled = !selectedModel;
    elements.stopButton.disabled = true;
    setSessionControlsEnabled(false);
    setAllPolicyControlsEnabled(false);
    setVelocityCommand({ vx: 0, vy: 0, wz: 0 }, false);
    resetPolicyTelemetry();
    retireSession(retiringSession, retiringPolicySession, false);
    if (settings.thumbnail !== false) showThumbnail();
    if (settings.state !== false) setPlayerState(selectedModel ? "MODEL READY" : "AWAITING DOCKER", selectedModel ? "ready" : "");
    if (selectedModel && settings.controlState !== false) {
      if (policyModeSelected()) {
        configurePolicyPreview();
      } else if (modelSupportsInteraction(selectedModel)) {
        setControlStatus("启动后可拖拽", "ready");
        resetJointPlaceholder("启动实时会话后读取关节范围。");
      }
    }
  }

  function selectModel(identifier) {
    var model = models.find(function (item) { return item.id === identifier; });
    if (!model) return;
    stopStream({ thumbnail: false, state: false, controlState: false });
    selectedModel = model;
    hideMessage();
    root.querySelectorAll(".mjp-model-card").forEach(function (card) {
      var selected = card.dataset.modelId === identifier;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    elements.selectedName.textContent = model.name;
    updateStats(model);
    configurePolicyPicker(model, false);
    configureInteractionPreview(model);
    showThumbnail();
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
    setPlayerState("MODEL READY", "ready");
  }

  function qualityOptions() {
    if (elements.quality.value === "360") return { width: 480, height: 360, quality: 76 };
    if (elements.quality.value === "720") return { width: 960, height: 720, quality: 84 };
    return { width: 640, height: 480, quality: 82 };
  }

  function streamUrl(identifier) {
    var quality = qualityOptions();
    var query = new URLSearchParams({
      fps: elements.fps.value,
      width: String(quality.width),
      height: String(quality.height),
      quality: String(quality.quality),
      nonce: String(Date.now())
    });
    return apiUrl("api/mujoco/sessions/" + encodeURIComponent(identifier) + "/stream.mjpeg?") + query.toString();
  }

  function displayStream(identifier) {
    window.clearTimeout(streamStartTimer);
    elements.thumbnail.removeAttribute("src");
    elements.thumbnail.hidden = true;
    elements.placeholder.hidden = true;
    streamRequestActive = false;
    elements.stream.removeAttribute("src");
    elements.stream.hidden = false;
    elements.overlay.hidden = false;
    elements.interactionLayer.hidden = true;
    elements.stream.alt = selectedModel.name + " 的 MuJoCo 实时仿真画面";
    if (!streaming || sessionId !== identifier) return;
    suppressStreamError = false;
    streamRequestActive = true;
    elements.stream.src = streamUrl(identifier);
    waitForStreamFrame(0, identifier);
  }

  async function startStream(event) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (!selectedModel || sessionStarting) return;
    if (elements.mode.value === "policy" && !selectedPolicyId()) {
      showMessage("当前模型没有可用的 ONNX 策略，请选择其他回放模式。", "error");
      return;
    }

    stopStream({ thumbnail: false, state: false, controlState: false });
    var generation = ++sessionGeneration;
    sessionStarting = true;
    streaming = true;
    window.clearTimeout(thumbnailRetryTimer);
    elements.thumbnail.hidden = true;
    elements.placeholder.hidden = true;
    elements.overlay.hidden = false;
    elements.startButton.disabled = true;
    elements.stopButton.disabled = true;
    setPlayerState("CREATING SESSION", "busy");
    var startingPolicy = policyModeSelected();
    setControlStatus(startingPolicy ? "正在加载 ONNX 策略…" : (modelSupportsInteraction(selectedModel) ? "建立控制会话…" : "建立只读会话…"), "busy");
    showMessage(startingPolicy ? "正在 Docker 内加载策略、观测适配器和 MuJoCo 控制回路。" : "正在 Docker 内创建持久 MuJoCo 会话，画面与控制将共享同一份仿真状态。", "success");

    try {
      var sessionRequest = { modelId: selectedModel.id, mode: startingPolicy ? "policy" : elements.mode.value };
      if (startingPolicy) sessionRequest.policyId = selectedPolicyId();
      var payload = await requestJson(apiUrl("api/mujoco/sessions"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionRequest)
      }, SESSION_CREATE_TIMEOUT_MS);
      var createdId = sessionIdentifier(payload);
      if (!createdId) throw new Error("Docker API 未返回 session id");
      if (generation !== sessionGeneration || !streaming) {
        releaseSession(createdId, false);
        return;
      }

      sessionId = createdId;
      sessionStarting = false;
      sessionPolicy = startingPolicy;
      elements.stopButton.disabled = false;
      applySessionState(sessionFromPayload(payload));
      setPlayerState("CONNECTING STREAM", "busy");
      displayStream(createdId);
      pollSessionState(generation, true);
    } catch (error) {
      if (generation !== sessionGeneration) return;
      sessionStarting = false;
      stopStream({ thumbnail: true, state: false, controlState: false });
      setPlayerState("SESSION FAILED", "");
      configureInteractionPreview(selectedModel);
      showMessage("无法创建 MuJoCo 会话：" + error.message + "。请确认 Docker 服务已更新并正在运行。", "error");
    }
  }

  function waitForStreamFrame(attempt, identifier) {
    if (!streaming || sessionId !== identifier) return;
    if (elements.stream.naturalWidth >= 320 && elements.stream.naturalHeight >= 240) {
      handleStreamReady();
      return;
    }
    if (attempt >= 80) {
      handleStreamError();
      return;
    }
    streamStartTimer = window.setTimeout(function () { waitForStreamFrame(attempt + 1, identifier); }, 125);
  }

  function handleStreamReady() {
    if (!streaming || !sessionId || !streamRequestActive || suppressStreamError) return;
    window.clearTimeout(streamStartTimer);
    elements.overlay.hidden = true;
    elements.interactionLayer.hidden = sessionPolicy || !sessionInteractive;
    setPlayerState("LIVE · " + elements.fps.value + " FPS", "ready");
    if (sessionPolicy) {
      elements.startButton.textContent = "ONNX 仿真会话运行中";
      var policyRuntimeStatus = elements.policyStatus.textContent;
      if (policyRuntimeStatus === "RUNNING" && velocityCommandEnabled) {
        setControlStatus("速度控制已连接", "ready");
        showMessage(selectedModel.name + " 的实验性社区 ONNX 策略正在 Docker CPU 仿真中运行；可使用摇杆或 vx、vy、wz 滑块发送速度指令，不可连接真机。", "success");
      } else if (policyRuntimeStatus === "ERROR") {
        setControlStatus("策略故障 · 可复位或停止", "error");
        showMessage("实时画面已连接，但策略控制器报告故障；速度输入保持禁用，请复位机器人或停止策略。", "error");
      } else {
        setControlStatus("实时画面已连接 · 等待策略控制器", "busy");
        showMessage("实时画面已连接，正在等待 Docker 明确声明策略状态和速度控制能力。", "success");
      }
    } else if (sessionInteractive) {
      elements.startButton.textContent = "交互会话运行中";
      setControlStatus("可拖拽 · " + activePlane.toUpperCase(), "ready");
      showMessage(selectedModel.name + " 正在 Docker 中运行；拖动画面中的 TCP 手柄，或使用下方关节滑块实时控制。", "success");
    } else {
      elements.startButton.textContent = "只读回放运行中";
      showMessage(selectedModel.name + " 正在 Docker 中实时运行；该浮动基模型当前保持只读回放。", "success");
    }
  }

  function handleStreamError() {
    if (!streaming || !streamRequestActive || suppressStreamError) return;
    streamRequestActive = false;
    stopStream({ thumbnail: true, state: false, controlState: false });
    setPlayerState("STREAM FAILED", "");
    configureInteractionPreview(selectedModel);
    showMessage("实时流中断。可能是渲染器启动失败或 Docker 服务已停止；已请求释放会话，请检查状态后重试。", "error");
  }

  async function pollSessionState(generation, immediate) {
    window.clearTimeout(statePollTimer);
    if (!streaming || !sessionId || generation !== sessionGeneration) return;
    if (!immediate) {
      statePollTimer = window.setTimeout(function () { pollSessionState(generation, true); }, STATE_POLL_MS);
      return;
    }
    if (stateRequestInFlight) {
      statePollTimer = window.setTimeout(function () { pollSessionState(generation, true); }, STATE_POLL_MS);
      return;
    }

    stateRequestInFlight = true;
    try {
      var identifier = sessionId;
      var payload = await requestJson(
        apiUrl("api/mujoco/sessions/" + encodeURIComponent(identifier) + "/state"),
        { cache: "no-store" },
        API_REQUEST_TIMEOUT_MS
      );
      if (generation !== sessionGeneration || identifier !== sessionId) return;
      stateFailures = 0;
      applySessionState(sessionFromPayload(payload));
    } catch (error) {
      if (generation !== sessionGeneration) return;
      stateFailures += 1;
      if (stateFailures >= 3) {
        setControlStatus("状态同步中断", "error");
        showMessage("实时画面仍可继续，但控制状态连续读取失败：" + error.message + "。", "error");
      }
    } finally {
      stateRequestInFlight = false;
      if (generation === sessionGeneration && streaming && sessionId) {
        statePollTimer = window.setTimeout(function () { pollSessionState(generation, true); }, STATE_POLL_MS);
      }
    }
  }

  function applySessionState(state) {
    if (!state || typeof state !== "object") return;
    if (typeof state.interactive === "boolean") sessionInteractive = state.interactive;

    var capabilities = state.capabilities && typeof state.capabilities === "object" ? state.capabilities : {};
    var hasVelocityDeclaration = Object.prototype.hasOwnProperty.call(capabilities, "velocityCommand");
    var declaredVelocity = capabilities.velocityCommand;
    if (hasVelocityDeclaration) {
      velocityCapability = declaredVelocity === true ? {} :
        (declaredVelocity && typeof declaredVelocity === "object" ? declaredVelocity : null);
    } else {
      velocityCapability = null;
    }
    var controller = state.controller && typeof state.controller === "object" ? state.controller : null;
    var controllerMode = String(controller && controller.mode || state.mode || "").toLowerCase();
    if (declaredVelocity === true || (declaredVelocity && typeof declaredVelocity === "object") || controllerMode === "policy") sessionPolicy = true;
    if (sessionPolicy) {
      velocityCommandEnabled = hasVelocityDeclaration && (
        declaredVelocity === true ||
        Boolean(declaredVelocity && typeof declaredVelocity === "object" && declaredVelocity.enabled === true)
      );
    }

    if (sessionPolicy) {
      elements.readonly.hidden = true;
      elements.liveControls.hidden = true;
      elements.policyControls.hidden = false;
      elements.controlTitle.textContent = "策略速度控制";
      elements.interactionLayer.hidden = true;
      setSessionControlsEnabled(false);
      setVelocityCommandControlsEnabled(Boolean(sessionId && velocityCommandEnabled));
      setPolicySessionActionsEnabled(Boolean(sessionId));
      configureVelocityRanges(policyCommandRanges(selectedPolicy, velocityCapability));
      updatePolicyController(controller, state);
    } else if (sessionInteractive) {
      elements.readonly.hidden = true;
      elements.liveControls.hidden = false;
      elements.policyControls.hidden = true;
      elements.controlTitle.textContent = "末端与关节控制";
      setSessionControlsEnabled(Boolean(sessionId));
      elements.interactionLayer.hidden = !streaming;
      updateEndEffector(state.endEffector);
      updateJoints(Array.isArray(state.joints) ? state.joints : []);
    } else if (sessionId) {
      elements.liveControls.hidden = true;
      elements.policyControls.hidden = true;
      elements.readonly.hidden = false;
      elements.interactionLayer.hidden = true;
      setSessionControlsEnabled(false);
      if (state.control && state.control.message) elements.readonlyReason.textContent = String(state.control.message);
      setControlStatus("只读回放", "locked");
    }

    if (!sessionPolicy && sessionInteractive && state.control && drag.pointerId === null) {
      var reachable = state.control.reachable;
      var message = state.control.message ? String(state.control.message) : "";
      if (reachable === false) {
        setControlStatus(message || "目标不可达", "error");
      } else if (message) {
        setControlStatus(message, "ready");
      }
    }
  }

  function commandFromObject(value, fallback) {
    var source = value && typeof value === "object" ? value : {};
    var previous = fallback || { vx: 0, vy: 0, wz: 0 };
    return {
      vx: safeNumber(source.vx, previous.vx),
      vy: safeNumber(source.vy, previous.vy),
      wz: safeNumber(source.wz, safeNumber(source.rz, previous.wz))
    };
  }

  function faultMessage(fault) {
    if (!fault) return "";
    if (typeof fault === "string") return fault;
    if (fault.message) return String(fault.message);
    if (fault.code) return String(fault.code);
    try { return JSON.stringify(fault); } catch (_error) { return "策略运行异常"; }
  }

  function updatePolicyController(controller, state) {
    if (!controller || typeof controller !== "object") {
      elements.policyStatus.textContent = "LOADING";
      elements.policyStatus.className = "is-busy";
      elements.policyFault.hidden = true;
      elements.inference.textContent = "— ms";
      elements.watchdog.textContent = "ARMED";
      elements.watchdog.className = "";
      setControlStatus("等待策略控制器声明状态…", "busy");
      setVelocityCommandControlsEnabled(false);
      setPolicySessionActionsEnabled(Boolean(sessionId));
      return;
    }
    var data = controller;
    var requested = commandFromObject(data.requested, velocityCommand);
    velocityApplied = commandFromObject(data.applied || data.commandApplied || data.command, velocityApplied);
    velocityMeasured = commandFromObject(data.measured || data.velocity || data.actual, velocityMeasured);
    elements.commandRequested.textContent = formatVelocityVector(requested);
    elements.commandApplied.textContent = formatVelocityVector(velocityApplied);
    elements.commandMeasured.textContent = formatVelocityVector(velocityMeasured);

    var inferenceMs = safeNumber(data.inferenceMs, safeNumber(data.inference_ms, NaN));
    var policyHz = safeNumber(data.controlHz, safeNumber(data.policyHz, safeNumber(data.policy_hz, NaN)));
    elements.inference.textContent = Number.isFinite(inferenceMs) ? inferenceMs.toFixed(inferenceMs < 10 ? 2 : 1) + " ms" : "— ms";
    elements.controlHz.textContent = Number.isFinite(policyHz) ? policyHz.toFixed(1) + " Hz" : "— Hz";

    var status = String(data.status || "loading").toLowerCase();
    var fault = faultMessage(data.fault || data.error || (state && state.fault));
    elements.policyStatus.textContent = status.toUpperCase();
    elements.policyStatus.className = status === "error" || fault ? "is-error" : (status === "running" ? "is-ready" : "is-busy");
    if (fault) {
      elements.policyFault.hidden = false;
      elements.policyFault.querySelector("p").textContent = fault;
      setControlStatus("策略故障", "error");
    } else {
      elements.policyFault.hidden = true;
      if (status === "running" && velocityCommandEnabled) {
        setControlStatus("速度控制已连接", "ready");
      } else if (status === "running") {
        setControlStatus("策略运行中 · 未声明速度控制", "busy");
      } else {
        setControlStatus("策略 " + status, "busy");
      }
    }

    var watchdogTripped = Boolean(data.watchdogTripped || data.watchdogTimeout || data.commandTimedOut);
    elements.watchdog.textContent = watchdogTripped ? "ZEROED" : (data.watchdogActive ? "ACTIVE" : "ARMED");
    elements.watchdog.className = watchdogTripped ? "is-error" : "is-ready";
    setVelocityCommandControlsEnabled(Boolean(sessionId && velocityCommandEnabled) && status === "running" && !fault);
    setPolicySessionActionsEnabled(Boolean(sessionId));
  }

  function sendVelocityCommand(identifier, command, keepalive) {
    return requestJson(apiUrl("api/mujoco/sessions/" + encodeURIComponent(identifier) + "/control"), {
      method: "POST",
      cache: "no-store",
      keepalive: Boolean(keepalive),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "velocity-command",
        vx: safeNumber(command.vx, 0),
        vy: safeNumber(command.vy, 0),
        wz: safeNumber(command.wz, 0)
      })
    }, CONTROL_REQUEST_TIMEOUT_MS);
  }

  function scheduleVelocityKeepalive() {
    window.clearTimeout(velocityKeepaliveTimer);
    velocityKeepaliveTimer = 0;
    if (!sessionId || !sessionPolicy || !velocityIsNonzero()) return;
    velocityKeepaliveTimer = window.setTimeout(function () {
      velocityKeepaliveTimer = 0;
      velocityDirty = true;
      scheduleVelocityCommand(0);
    }, VELOCITY_KEEPALIVE_MS);
  }

  function scheduleVelocityCommand(delay) {
    if (!sessionId || !sessionPolicy || velocityTimer || velocityRequestInFlight) return;
    var elapsed = Date.now() - lastVelocityRequestAt;
    var minimumDelay = Math.max(0, VELOCITY_COMMAND_INTERVAL_MS - elapsed);
    velocityTimer = window.setTimeout(function () {
      velocityTimer = 0;
      flushVelocityCommand();
    }, Math.max(typeof delay === "number" ? delay : VELOCITY_COMMAND_INTERVAL_MS, minimumDelay));
  }

  function queueVelocityCommand() {
    if (!sessionId || !sessionPolicy) return;
    velocityDirty = true;
    scheduleVelocityCommand(0);
  }

  async function flushVelocityCommand() {
    if (!sessionId || !sessionPolicy || velocityRequestInFlight || !velocityDirty) return;
    var identifier = sessionId;
    var generation = sessionGeneration;
    var command = { vx: velocityCommand.vx, vy: velocityCommand.vy, wz: velocityCommand.wz };
    velocityDirty = false;
    velocityRequestInFlight = true;
    lastVelocityRequestAt = Date.now();
    try {
      var payload = await sendVelocityCommand(identifier, command, false);
      if (generation === sessionGeneration && identifier === sessionId) applySessionState(sessionFromPayload(payload));
    } catch (error) {
      if (generation === sessionGeneration && identifier === sessionId) {
        setControlStatus(error.message || "速度指令发送失败", "error");
        showMessage("速度控制请求失败：" + error.message + "。安全看门狗会将指令归零。", "error");
      }
    } finally {
      velocityRequestInFlight = false;
      if (generation === sessionGeneration && identifier === sessionId) {
        if (velocityDirty) scheduleVelocityCommand(0);
        else scheduleVelocityKeepalive();
      }
    }
  }

  function zeroVelocityCommand(shouldQueue) {
    setVelocityCommand({ vx: 0, vy: 0, wz: 0 }, shouldQueue !== false);
  }

  async function resetPolicySession() {
    if (!sessionId || !sessionPolicy) return;
    var identifier = sessionId;
    var generation = sessionGeneration;
    zeroVelocityCommand(false);
    policyResetInFlight = true;
    setVelocityCommandControlsEnabled(false);
    setPolicySessionActionsEnabled(true);
    setControlStatus("正在安全复位…", "busy");
    try {
      await sendVelocityCommand(identifier, velocityCommand, false).catch(function () {
        /* Reset remains the recovery path if the preceding zero request failed. */
      });
      var payload = await requestJson(apiUrl("api/mujoco/sessions/" + encodeURIComponent(identifier) + "/control"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reset" })
      }, SESSION_RESET_TIMEOUT_MS);
      if (generation === sessionGeneration && identifier === sessionId) applySessionState(sessionFromPayload(payload));
    } catch (error) {
      if (generation === sessionGeneration && identifier === sessionId) setControlStatus(error.message || "复位失败", "error");
    } finally {
      if (generation === sessionGeneration && identifier === sessionId) {
        policyResetInFlight = false;
        setPolicySessionActionsEnabled(true);
      }
    }
  }

  function stopPolicySession() {
    if (!sessionId || !sessionPolicy) return;
    zeroVelocityCommand(false);
    setAllPolicyControlsEnabled(false);
    setControlStatus("正在停止策略…", "busy");
    stopStream();
    configureInteractionPreview(selectedModel);
    showMessage("已停止本地控制，并请求 Docker 并行归零和释放策略会话。", "success");
  }

  function sendVisibilityZero() {
    if (!sessionId || !sessionPolicy) return;
    var identifier = sessionId;
    zeroVelocityCommand(false);
    window.clearTimeout(velocityKeepaliveTimer);
    sendVelocityCommand(identifier, velocityCommand, true).catch(function () { /* Docker watchdog remains armed. */ });
  }

  function teardownForPageExit() {
    var identifier = sessionId;
    var retiringPolicySession = sessionPolicy;
    if (!identifier) return;
    zeroVelocityCommand(false);
    sessionId = "";
    sessionGeneration += 1;
    retireSession(identifier, retiringPolicySession, true);
  }

  function updateEndEffector(endEffector) {
    if (!endEffector || typeof endEffector !== "object") return;
    if (Array.isArray(endEffector.position) && endEffector.position.length >= 3) {
      var position = endEffector.position.map(function (value) { return safeNumber(value, 0); });
      elements.endEffectorPosition.textContent = "X " + position[0].toFixed(3) + " · Y " + position[1].toFixed(3) + " · Z " + position[2].toFixed(3);
    }
    if (Array.isArray(endEffector.screen) && endEffector.screen.length >= 2) {
      var screenX = safeNumber(endEffector.screen[0], 0.5);
      var screenY = safeNumber(endEffector.screen[1], 0.5);
      elements.endEffectorHandle.style.left = (clamp(screenX, 0.035, 0.965) * 100).toFixed(2) + "%";
      elements.endEffectorHandle.style.top = (clamp(screenY, 0.055, 0.945) * 100).toFixed(2) + "%";
    }
  }

  function jointKey(joint) {
    return [joint.index, joint.name, joint.min, joint.max].join(":");
  }

  function formatJointValue(value) {
    return safeNumber(value, 0).toFixed(3) + " rad";
  }

  function renderJointControls(joints) {
    elements.jointList.replaceChildren();
    joints.forEach(function (joint, order) {
      var index = Math.round(safeNumber(joint.index, order));
      var minimum = safeNumber(joint.min, -Math.PI);
      var maximum = safeNumber(joint.max, Math.PI);
      if (maximum <= minimum) {
        minimum = -Math.PI;
        maximum = Math.PI;
      }
      var value = clamp(safeNumber(joint.value, 0), minimum, maximum);
      var step = joint.unit === "m" ? 0.0005 : 0.001;
      var identifier = "mjp-joint-" + index;

      var row = document.createElement("label");
      row.className = "mjp-joint-row";
      row.htmlFor = identifier;
      var heading = document.createElement("span");
      var name = document.createElement("strong");
      name.textContent = joint.name || ("joint_" + index);
      name.title = name.textContent;
      var output = document.createElement("output");
      output.setAttribute("for", identifier);
      output.textContent = formatJointValue(value);
      heading.append(name, output);

      var input = document.createElement("input");
      input.id = identifier;
      input.type = "range";
      input.min = String(minimum);
      input.max = String(maximum);
      input.step = String(step);
      input.value = String(value);
      input.dataset.jointIndex = String(index);
      input.setAttribute("aria-label", name.textContent + " 目标角度，单位弧度");
      input.disabled = !sessionId;
      input.addEventListener("pointerdown", function () { input.dataset.userActive = "true"; });
      input.addEventListener("pointerup", function () { delete input.dataset.userActive; });
      input.addEventListener("pointercancel", function () { delete input.dataset.userActive; });
      input.addEventListener("change", function () { delete input.dataset.userActive; });
      input.addEventListener("input", function () {
        var target = safeNumber(input.value, value);
        output.textContent = formatJointValue(target);
        queueJointTarget(index, target);
      });
      row.append(heading, input);
      elements.jointList.appendChild(row);
    });
  }

  function updateJoints(joints) {
    if (!joints.length) {
      if (!jointSignature) resetJointPlaceholder("此会话尚未返回可控制关节。");
      return;
    }
    var signature = joints.map(jointKey).join("|");
    if (signature !== jointSignature) {
      jointSignature = signature;
      renderJointControls(joints);
      return;
    }
    joints.forEach(function (joint, order) {
      var index = Math.round(safeNumber(joint.index, order));
      var input = elements.jointList.querySelector('input[data-joint-index="' + index + '"]');
      if (!input || input.dataset.userActive === "true" || document.activeElement === input) return;
      var value = clamp(safeNumber(joint.value, safeNumber(input.value, 0)), safeNumber(input.min, -Math.PI), safeNumber(input.max, Math.PI));
      input.value = String(value);
      var output = input.parentElement.querySelector("output");
      if (output) output.textContent = formatJointValue(value);
    });
  }

  function hasQueuedControl() {
    if (pendingReset || pendingJoints.size) return true;
    return Object.keys(pendingCartesian).some(function (plane) {
      return Math.abs(pendingCartesian[plane][0]) > 1e-8 || Math.abs(pendingCartesian[plane][1]) > 1e-8;
    });
  }

  function nextControlCommand() {
    if (pendingReset) {
      pendingReset = false;
      Object.keys(pendingCartesian).forEach(function (plane) { pendingCartesian[plane] = [0, 0]; });
      pendingJoints.clear();
      return { type: "reset" };
    }
    var planeNames = [drag.plane, activePlane, "xy", "xz", "yz"];
    for (var i = 0; i < planeNames.length; i += 1) {
      var plane = planeNames[i];
      var queued = pendingCartesian[plane];
      if (!queued || (Math.abs(queued[0]) <= 1e-8 && Math.abs(queued[1]) <= 1e-8)) continue;
      var du = clamp(queued[0], -0.04, 0.04);
      var dv = clamp(queued[1], -0.04, 0.04);
      queued[0] -= du;
      queued[1] -= dv;
      return { type: "cartesian-delta", plane: plane, delta: [du, dv] };
    }
    var firstJoint = pendingJoints.entries().next();
    if (!firstJoint.done) {
      pendingJoints.delete(firstJoint.value[0]);
      return { type: "joint-target", index: firstJoint.value[0], value: firstJoint.value[1] };
    }
    return null;
  }

  function scheduleControl(delay) {
    if (controlTimer || controlInFlight) return;
    controlTimer = window.setTimeout(function () {
      controlTimer = 0;
      flushControlQueue();
    }, typeof delay === "number" ? delay : CONTROL_INTERVAL_MS);
  }

  async function flushControlQueue() {
    if (controlInFlight || !sessionId || !sessionInteractive) return;
    var command = nextControlCommand();
    if (!command) return;
    var identifier = sessionId;
    var generation = sessionGeneration;
    controlInFlight = true;
    try {
      var payload = await requestJson(apiUrl("api/mujoco/sessions/" + encodeURIComponent(identifier) + "/control"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command)
      }, CONTROL_REQUEST_TIMEOUT_MS);
      if (generation === sessionGeneration && identifier === sessionId) applySessionState(sessionFromPayload(payload));
    } catch (error) {
      if (generation === sessionGeneration && identifier === sessionId) {
        setControlStatus(error.message || "控制请求失败", "error");
      }
    } finally {
      controlInFlight = false;
      if (generation === sessionGeneration && identifier === sessionId && hasQueuedControl()) scheduleControl(0);
    }
  }

  function queueCartesianDelta(plane, du, dv) {
    if (!sessionId || !sessionInteractive || !PLANES[plane]) return;
    pendingCartesian[plane][0] += safeNumber(du, 0);
    pendingCartesian[plane][1] += safeNumber(dv, 0);
    scheduleControl(CONTROL_INTERVAL_MS);
  }

  function queueJointTarget(index, value) {
    if (!sessionId || !sessionInteractive) return;
    pendingJoints.set(index, value);
    scheduleControl(70);
  }

  function queueReset() {
    if (!sessionId || !sessionInteractive) return;
    pendingReset = true;
    elements.jointList.querySelectorAll("input[type=range]").forEach(function (input) { input.blur(); });
    setControlStatus("正在复位…", "busy");
    scheduleControl(0);
  }

  function updatePlane(plane) {
    if (!PLANES[plane]) return;
    activePlane = plane;
    var definition = PLANES[plane];
    elements.axisU.textContent = definition.u;
    elements.axisV.textContent = definition.v;
    elements.planeReadout.textContent = definition.label;
    elements.endEffectorHandle.setAttribute("aria-label", "在 " + plane.toUpperCase() + " 平面拖动机械臂末端；水平控制 " + definition.u + "，向上控制 " + definition.v + " 正方向；也可以使用方向键微调");
    elements.planeButtons.forEach(function (button) {
      var active = button.dataset.mjpPlane === plane;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (sessionInteractive) setControlStatus("可拖拽 · " + plane.toUpperCase(), "ready");
  }

  function beginEndEffectorDrag(event) {
    if (!sessionId || !sessionInteractive || elements.endEffectorHandle.disabled) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    drag.pointerId = event.pointerId;
    drag.plane = activePlane;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.visualX = 0;
    drag.visualY = 0;
    elements.endEffectorHandle.setPointerCapture(event.pointerId);
    elements.endEffectorHandle.classList.add("is-dragging");
    setControlStatus("拖动中 · " + drag.plane.toUpperCase(), "busy");
    event.preventDefault();
  }

  function moveEndEffector(event) {
    if (drag.pointerId === null || event.pointerId !== drag.pointerId) return;
    var dx = clamp(event.clientX - drag.lastX, -80, 80);
    var dy = clamp(event.clientY - drag.lastY, -80, 80);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.visualX = clamp(drag.visualX + dx, -90, 90);
    drag.visualY = clamp(drag.visualY + dy, -90, 90);
    elements.endEffectorHandle.style.setProperty("--mjp-drag-x", drag.visualX.toFixed(1) + "px");
    elements.endEffectorHandle.style.setProperty("--mjp-drag-y", drag.visualY.toFixed(1) + "px");
    queueCartesianDelta(drag.plane, dx * DRAG_METERS_PER_PIXEL, -dy * DRAG_METERS_PER_PIXEL);
    event.preventDefault();
  }

  function endEndEffectorDrag(event) {
    if (drag.pointerId === null || (event && event.pointerId !== drag.pointerId)) return;
    finishDrag();
    if (sessionInteractive) setControlStatus("可拖拽 · " + activePlane.toUpperCase(), "ready");
  }

  function handleEndEffectorKeyboard(event) {
    if (!sessionId || !sessionInteractive) return;
    var du = 0;
    var dv = 0;
    var step = event.shiftKey ? 0.003 : 0.01;
    if (event.key === "ArrowLeft") du = -step;
    else if (event.key === "ArrowRight") du = step;
    else if (event.key === "ArrowUp") dv = step;
    else if (event.key === "ArrowDown") dv = -step;
    else return;
    event.preventDefault();
    queueCartesianDelta(activePlane, du, dv);
    setControlStatus("微调 " + activePlane.toUpperCase() + " · " + (step * 1000).toFixed(0) + " mm", "busy");
  }

  function fractionToVelocity(fraction, range) {
    var normalized = clamp(fraction, -1, 1);
    return normalized >= 0 ? normalized * range.max : normalized * Math.abs(range.min);
  }

  function updateVelocityFromPad(event) {
    var rect = elements.velocityPad.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var horizontal = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    var vertical = -(((event.clientY - rect.top) / rect.height - 0.5) * 2);
    var radius = Math.hypot(horizontal, vertical);
    if (radius > 1) {
      horizontal /= radius;
      vertical /= radius;
    }
    setVelocityCommand({
      vx: fractionToVelocity(vertical, velocityRange("vx")),
      vy: fractionToVelocity(horizontal, velocityRange("vy")),
      wz: velocityCommand.wz
    }, true);
  }

  function beginVelocityPad(event) {
    if (!sessionId || !sessionPolicy || elements.velocityPad.getAttribute("aria-disabled") === "true") return;
    if (typeof event.button === "number" && event.button !== 0) return;
    padPointerId = event.pointerId;
    elements.velocityPad.setPointerCapture(event.pointerId);
    elements.velocityPad.classList.add("is-active");
    updateVelocityFromPad(event);
    event.preventDefault();
  }

  function moveVelocityPad(event) {
    if (padPointerId === null || event.pointerId !== padPointerId) return;
    updateVelocityFromPad(event);
    event.preventDefault();
  }

  function endVelocityPad(event) {
    if (padPointerId === null || (event && event.pointerId !== padPointerId)) return;
    if (elements.velocityPad.hasPointerCapture && elements.velocityPad.hasPointerCapture(padPointerId)) {
      try { elements.velocityPad.releasePointerCapture(padPointerId); } catch (_error) { /* Pointer already released. */ }
    }
    padPointerId = null;
    elements.velocityPad.classList.remove("is-active");
    setVelocityCommand({ vx: 0, vy: 0, wz: velocityCommand.wz }, true);
  }

  function handleVelocityPadKeyboard(event) {
    if (!sessionId || !sessionPolicy || elements.velocityPad.getAttribute("aria-disabled") === "true") return;
    var vxRange = velocityRange("vx");
    var vyRange = velocityRange("vy");
    var vxStep = Math.max(vxRange.step, (vxRange.max - vxRange.min) / (event.shiftKey ? 80 : 20));
    var vyStep = Math.max(vyRange.step, (vyRange.max - vyRange.min) / (event.shiftKey ? 80 : 20));
    var next = { vx: velocityCommand.vx, vy: velocityCommand.vy, wz: velocityCommand.wz };
    if (event.key === "ArrowUp") next.vx += vxStep;
    else if (event.key === "ArrowDown") next.vx -= vxStep;
    else if (event.key === "ArrowRight") next.vy += vyStep;
    else if (event.key === "ArrowLeft") next.vy -= vyStep;
    else if (event.key === " " || event.key === "Home") { next.vx = 0; next.vy = 0; }
    else return;
    event.preventDefault();
    setVelocityCommand(next, true);
  }

  async function restartStreamImage() {
    if (!streaming || !sessionId) return;
    var identifier = sessionId;
    var generation = sessionGeneration;
    window.clearTimeout(streamStartTimer);
    setPlayerState("CONNECTING STREAM", "busy");
    suppressStreamError = true;
    streamRequestActive = false;
    elements.overlay.hidden = false;
    elements.interactionLayer.hidden = true;
    elements.stream.src = TRANSPARENT_PIXEL;

    for (var attempt = 0; attempt < 8; attempt += 1) {
      await new Promise(function (resolve) { window.setTimeout(resolve, 100); });
      if (!streaming || sessionId !== identifier || generation !== sessionGeneration) return;
      try {
        var payload = await requestJson(
          apiUrl("api/mujoco/sessions/" + encodeURIComponent(identifier) + "/state"),
          { cache: "no-store" },
          API_REQUEST_TIMEOUT_MS
        );
        var state = sessionFromPayload(payload);
        applySessionState(state);
        if (state.streamActive === false) {
          displayStream(identifier);
          return;
        }
      } catch (_error) {
        /* The regular state poll reports persistent errors. */
      }
    }

    if (streaming && sessionId === identifier && generation === sessionGeneration) {
      /* Newer servers preempt the prior stream generation on this request. */
      displayStream(identifier);
    }
  }

  async function initialize() {
    elements.filters.forEach(function (button) {
      button.addEventListener("click", function () { applyFilter(button.dataset.mjpFilter); });
    });
    elements.planeButtons.forEach(function (button) {
      button.addEventListener("click", function () { updatePlane(button.dataset.mjpPlane); });
    });
    elements.form.addEventListener("submit", startStream);
    elements.stopButton.addEventListener("click", function () {
      stopStream();
      configureInteractionPreview(selectedModel);
      showMessage("实时播放已暂停，并已请求 Docker 释放持久 session 与渲染器。", "success");
    });
    elements.resetButton.addEventListener("click", queueReset);
    elements.policyZeroButton.addEventListener("click", function () {
      zeroVelocityCommand(true);
      setControlStatus("已请求速度归零", "ready");
    });
    elements.policyResetButton.addEventListener("click", resetPolicySession);
    elements.policyStopButton.addEventListener("click", stopPolicySession);
    elements.policySelect.addEventListener("change", function () {
      selectedPolicy = policies.find(function (policy) { return policyIdentifier(policy) === elements.policySelect.value; }) || null;
      velocityCapability = null;
      updatePolicySelectionDisplay();
      if (streaming) {
        sendVisibilityZero();
        startStream({ preventDefault: function () {} });
      } else {
        configureInteractionPreview(selectedModel);
      }
    });
    elements.velocityInputs.forEach(function (input) {
      input.addEventListener("input", function () {
        var next = { vx: velocityCommand.vx, vy: velocityCommand.vy, wz: velocityCommand.wz };
        next[input.dataset.mjpVelocity] = safeNumber(input.value, 0);
        setVelocityCommand(next, true);
      });
    });
    elements.velocityPad.addEventListener("pointerdown", beginVelocityPad);
    elements.velocityPad.addEventListener("pointermove", moveVelocityPad);
    elements.velocityPad.addEventListener("pointerup", endVelocityPad);
    elements.velocityPad.addEventListener("pointercancel", endVelocityPad);
    elements.velocityPad.addEventListener("lostpointercapture", endVelocityPad);
    elements.velocityPad.addEventListener("keydown", handleVelocityPadKeyboard);
    elements.endEffectorHandle.addEventListener("pointerdown", beginEndEffectorDrag);
    elements.endEffectorHandle.addEventListener("pointermove", moveEndEffector);
    elements.endEffectorHandle.addEventListener("pointerup", endEndEffectorDrag);
    elements.endEffectorHandle.addEventListener("pointercancel", endEndEffectorDrag);
    elements.endEffectorHandle.addEventListener("lostpointercapture", endEndEffectorDrag);
    elements.endEffectorHandle.addEventListener("keydown", handleEndEffectorKeyboard);
    elements.stream.addEventListener("load", handleStreamReady);
    elements.stream.addEventListener("error", handleStreamError);
    elements.thumbnail.addEventListener("error", function () {
      if (streaming) return;
      var failedModelId = elements.thumbnail.dataset.modelId;
      var retryCount = Number(elements.thumbnail.dataset.retryCount || "0");
      if (selectedModel && failedModelId === selectedModel.id && retryCount < 3) {
        elements.thumbnail.hidden = true;
        thumbnailRetryTimer = window.setTimeout(function () {
          if (!streaming && selectedModel && selectedModel.id === failedModelId) showThumbnail(retryCount + 1);
        }, 250 * (retryCount + 1));
        return;
      }
      elements.thumbnail.hidden = true;
      elements.placeholder.hidden = false;
      showMessage("模型元数据已加载，但静态预览失败；仍可尝试开始实时播放。", "error");
    });
    elements.mode.addEventListener("change", function () {
      updatePolicySelectionDisplay();
      if (streaming) {
        sendVisibilityZero();
        startStream({ preventDefault: function () {} });
      } else {
        configureInteractionPreview(selectedModel);
      }
    });
    [elements.fps, elements.quality].forEach(function (control) {
      control.addEventListener("change", restartStreamImage);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) sendVisibilityZero();
    });
    window.addEventListener("pagehide", function (event) {
      if (event.persisted) sendVisibilityZero();
      else teardownForPageExit();
    });
    window.addEventListener("beforeunload", teardownForPageExit);
    updatePlane(activePlane);
    updateVelocityDisplay();
    setAllPolicyControlsEnabled(false);

    try {
      var responses = await Promise.all([
        requestJson(apiUrl("api/mujoco/health"), { cache: "no-store" }, API_REQUEST_TIMEOUT_MS),
        requestJson(apiUrl("api/mujoco/models"), { cache: "no-store" }, API_REQUEST_TIMEOUT_MS),
        requestJson(apiUrl("api/mujoco/policies"), { cache: "no-store" }, API_REQUEST_TIMEOUT_MS).catch(function () { return {}; })
      ]);
      var health = responses[0];
      var catalog = responses[1];
      var policyCatalog = responses[2] || {};
      if (!health.ok || !catalog.ok || !Array.isArray(catalog.models)) throw new Error("Docker API 数据契约无效");
      models = catalog.models;
      policies = Array.isArray(policyCatalog.policies) ? policyCatalog.policies : [];
      elements.health.textContent = "online";
      elements.health.classList.add("is-ready");
      elements.version.textContent = "MUJOCO " + health.mujocoVersion;
      elements.count.textContent = String(models.length).padStart(2, "0");
      renderCatalog();
      if (models.length) selectModel(models[0].id);
      showMessage("Docker MuJoCo 服务已连接：" + models.length + " 个模型、" + policies.filter(policyIsAvailable).length + " 个可用策略，" + health.renderer.toUpperCase() + " 实时无头渲染。", "success");
    } catch (error) {
      elements.health.textContent = "offline";
      elements.list.innerHTML = '<div class="mjp-model-skeleton">Docker :4020 未连接<br><code>./bin/site.sh mujoco-up</code></div>';
      setPlayerState("DOCKER OFFLINE", "");
      setControlStatus("服务离线", "error");
      showMessage("MuJoCo Docker 服务不可用：" + error.message + "。请先运行 ./bin/site.sh mujoco-up。", "error");
    }
  }

  initialize();
})();
