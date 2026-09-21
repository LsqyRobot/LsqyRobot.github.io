(function () {
  "use strict";

  var root = document.querySelector(".ros2v-page");
  if (!root) return;

  var PROTOCOL = "lsqy.ros2.control.visualization.v2";
  var TOPICS = [
    "/go2/control/status",
    "/go2/joint_state_broadcaster/joint_states",
    "/go2/tf"
  ];
  var SCENARIO_ID = "go2_mock";
  var CONTROLLER_MANAGER = "/go2/controller_manager";
  var HARDWARE = {
    name: "Go2MockSystem",
    plugin: "mock_components/GenericSystem"
  };
  var CONTROLLERS = ["joint_state_broadcaster", "go2_position_controller"];
  var SUPERVISOR = "/go2/control_supervisor";
  var JOINT_NAMES = [
    "FL_hip_joint", "FL_thigh_joint", "FL_calf_joint",
    "FR_hip_joint", "FR_thigh_joint", "FR_calf_joint",
    "RL_hip_joint", "RL_thigh_joint", "RL_calf_joint",
    "RR_hip_joint", "RR_thigh_joint", "RR_calf_joint"
  ];
  var FOOT_FRAMES = ["FL_foot", "FR_foot", "RL_foot", "RR_foot"];
  var STALE_AFTER_MS = 2500;
  var MAX_RETRY_MS = 8000;
  var meta = document.querySelector('meta[name="ros2-viz-websocket"]');
  var configuredEndpoint = meta ? meta.getAttribute("content") : "";
  var rvizMeta = document.querySelector('meta[name="ros2-rviz-url"]');
  var configuredRvizEndpoint = rvizMeta ? rvizMeta.getAttribute("content") : "";
  var terminalMeta = document.querySelector('meta[name="ros2-terminal-url"]');
  var configuredTerminalEndpoint = terminalMeta ? terminalMeta.getAttribute("content") : "";
  var localHosts = ["127.0.0.1", "localhost"];
  var localPreview = localHosts.indexOf(window.location.hostname) !== -1;

  var elements = {
    rvizPanel: root.querySelector("[data-ros2v-rviz-panel]"),
    rvizFrame: root.querySelector("[data-ros2v-rviz-frame]"),
    rvizPlaceholder: root.querySelector("[data-ros2v-rviz-placeholder]"),
    rvizState: root.querySelector("[data-ros2v-rviz-state]"),
    rvizNotice: root.querySelector("[data-ros2v-rviz-notice]"),
    rvizOpen: root.querySelector("[data-ros2v-rviz-open]"),
    terminalToggle: root.querySelector("[data-ros2v-terminal-toggle]"),
    terminalPanel: root.querySelector("[data-ros2v-terminal-panel]"),
    terminalFrame: root.querySelector("[data-ros2v-terminal-frame]"),
    terminalPlaceholder: root.querySelector("[data-ros2v-terminal-placeholder]"),
    terminalOpen: root.querySelector("[data-ros2v-terminal-open]"),
    terminalClose: root.querySelector("[data-ros2v-terminal-close]"),
    connection: root.querySelector("[data-ros2v-connection]"),
    distro: root.querySelector("[data-ros2v-distro]"),
    notice: root.querySelector("[data-ros2v-notice]"),
    stage: root.querySelector("[data-ros2v-stage]"),
    overlay: root.querySelector("[data-ros2v-overlay]"),
    stageState: root.querySelector("[data-ros2v-stage-state]"),
    rate: root.querySelector("[data-ros2v-rate]"),
    age: root.querySelector("[data-ros2v-age]"),
    tfStatus: root.querySelector("[data-ros2v-tf-status]"),
    scenario: root.querySelector("[data-ros2v-scenario]"),
    manager: root.querySelector("[data-ros2v-manager]"),
    hardware: root.querySelector("[data-ros2v-hardware]"),
    supervisor: root.querySelector("[data-ros2v-supervisor]"),
    lifecycle: root.querySelector("[data-ros2v-lifecycle]"),
    mode: root.querySelector("[data-ros2v-mode]"),
    jointStateBroadcaster: root.querySelector("[data-ros2v-controller-jsb]"),
    positionController: root.querySelector("[data-ros2v-controller-position]"),
    sequence: root.querySelector("[data-ros2v-sequence]"),
    packet: root.querySelector("[data-ros2v-packet]"),
    reconnect: root.querySelector("[data-ros2v-reconnect]"),
    copy: root.querySelector("[data-ros2v-copy]")
  };
  var jointOutputs = {};
  JOINT_NAMES.forEach(function (name) {
    jointOutputs[name] = root.querySelector('[data-ros2v-joint="' + name + '"]');
  });
  var diagnosticsReady = [
    elements.connection, elements.notice, elements.stage, elements.overlay,
    elements.stageState, elements.rate, elements.age, elements.tfStatus,
    elements.sequence, elements.packet, elements.reconnect
  ].every(Boolean) && JOINT_NAMES.every(function (name) { return Boolean(jointOutputs[name]); });

  var socket = null;
  var socketGeneration = 0;
  var reconnectTimer = 0;
  var reconnectAttempt = 0;
  var contractAccepted = false;
  var lastSnapshotAt = 0;
  var latestSequence = 0;
  var arrivalTimes = [];
  var pendingSnapshot = null;
  var renderFrame = 0;
  var connectionState = "offline";

  function validEndpoint(value) {
    try {
      var url = new URL(value);
      return (url.protocol === "ws:" || url.protocol === "wss:") &&
        localHosts.indexOf(url.hostname) !== -1 &&
        url.pathname === "/ws" &&
        !url.username && !url.password && !url.search && !url.hash;
    } catch (_error) {
      return false;
    }
  }

  function validRvizEndpoint(value) {
    try {
      var url = new URL(value);
      return url.protocol === "http:" &&
        localHosts.indexOf(url.hostname) !== -1 &&
        url.port === "6080" &&
        url.pathname === "/vnc.html" &&
        !url.username && !url.password && !url.search &&
        url.hash === "#autoconnect=1&reconnect=1&resize=scale";
    } catch (_error) {
      return false;
    }
  }

  function validTerminalEndpoint(value) {
    try {
      var url = new URL(value);
      return url.protocol === "http:" &&
        localHosts.indexOf(url.hostname) !== -1 &&
        url.port === "7681" &&
        url.pathname === "/" &&
        !url.username && !url.password && !url.search && !url.hash;
    } catch (_error) {
      return false;
    }
  }

  function setRvizState(state, message) {
    if (!elements.rvizPanel || !elements.rvizState || !elements.rvizNotice) return;
    var labels = {
      loading: "LOADING RVIZ",
      loaded: "NOVNC LOADED",
      remote: "LOCAL ONLY",
      blocked: "BLOCKED"
    };
    elements.rvizPanel.dataset.state = state;
    elements.rvizState.textContent = labels[state] || "CHECKING";
    elements.rvizNotice.textContent = message;

    if (elements.rvizPlaceholder && state !== "loaded") {
      var title = elements.rvizPlaceholder.querySelector("strong");
      var detail = elements.rvizPlaceholder.querySelector("small");
      if (title) title.textContent = state === "remote" ? "仅本地预览加载 RViz2" : state === "blocked" ? "RViz2 地址已被拒绝" : "正在加载本机 :6080";
      if (detail) detail.textContent = state === "remote" ? "在仓库本地启动 Docker 与 Hexo 后查看" : "先运行 ./bin/site.sh ros2-serve 4000";
    }
  }

  function setupRviz() {
    if (!elements.rvizPanel || !elements.rvizFrame || !elements.rvizOpen) return;
    if (!localPreview) {
      elements.rvizOpen.setAttribute("aria-disabled", "true");
      setRvizState("remote", "这是本地 Docker 桌面；公开站点不会自动探测访问者电脑的 6080 端口。");
      return;
    }
    if (!validRvizEndpoint(configuredRvizEndpoint)) {
      elements.rvizOpen.setAttribute("aria-disabled", "true");
      setRvizState("blocked", "RViz2 地址必须是本机回环地址上的 6080/vnc.html；当前配置已被拒绝。");
      return;
    }

    var endpoint = new URL(configuredRvizEndpoint).href;
    elements.rvizOpen.setAttribute("href", endpoint);
    elements.rvizOpen.setAttribute("aria-disabled", "false");
    elements.rvizFrame.addEventListener("load", function () {
      setRvizState("loaded", "noVNC 页面已加载；它会在画面内自动连接容器中的真实 RViz2 桌面。");
    });
    setRvizState("loading", "正在从本机 6080 加载 noVNC，并等待 RViz2 桌面就绪……");
    elements.rvizFrame.setAttribute("src", endpoint);
  }

  function setupTerminal() {
    if (!elements.terminalToggle || !elements.terminalPanel || !elements.terminalFrame ||
        !elements.terminalOpen || !elements.terminalClose) return;
    var terminalEndpoint = "";
    elements.terminalOpen.removeAttribute("href");
    elements.terminalOpen.setAttribute("aria-disabled", "true");
    elements.terminalToggle.disabled = true;
    if (!localPreview || !validTerminalEndpoint(configuredTerminalEndpoint)) return;
    terminalEndpoint = new URL(configuredTerminalEndpoint).href;
    elements.terminalOpen.setAttribute("href", terminalEndpoint);
    elements.terminalOpen.setAttribute("aria-disabled", "false");
    elements.terminalToggle.disabled = false;

    function setTerminalVisible(visible) {
      elements.terminalToggle.setAttribute("aria-expanded", visible ? "true" : "false");
      elements.terminalToggle.textContent = visible ? "收起 Docker 终端" : "进入 Docker 终端";
      if (!visible) {
        elements.terminalPanel.hidden = true;
        elements.terminalPanel.dataset.state = "closed";
        elements.terminalFrame.removeAttribute("src");
        return;
      }
      elements.terminalPanel.hidden = false;
      elements.terminalPanel.dataset.state = "loading";
      if (elements.terminalFrame.getAttribute("src") !== terminalEndpoint) {
        elements.terminalFrame.setAttribute("src", terminalEndpoint);
      }
      if (typeof elements.terminalPanel.scrollIntoView === "function") {
        elements.terminalPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    elements.terminalFrame.addEventListener("load", function () {
      if (!elements.terminalPanel.hidden) elements.terminalPanel.dataset.state = "loaded";
    });
    elements.terminalToggle.addEventListener("click", function () {
      setTerminalVisible(elements.terminalPanel.hidden);
    });
    elements.terminalClose.addEventListener("click", function () {
      setTerminalVisible(false);
      elements.terminalToggle.focus();
    });
  }

  function exactTopics(value) {
    if (!Array.isArray(value) || value.length !== TOPICS.length) return false;
    return value.slice().sort().join("\n") === TOPICS.slice().sort().join("\n");
  }

  function exactOrderedStrings(value, expected) {
    return Array.isArray(value) && value.length === expected.length && value.every(function (item, index) {
      return typeof item === "string" && item === expected[index];
    });
  }

  function plainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function validRobot(robot) {
    return plainObject(robot) && robot.name === "unitree_go2" && robot.root_frame === "base" &&
      exactOrderedStrings(robot.joints, JOINT_NAMES) && exactOrderedStrings(robot.foot_frames, FOOT_FRAMES);
  }

  function validHardware(hardware) {
    return plainObject(hardware) && hardware.name === HARDWARE.name && hardware.plugin === HARDWARE.plugin;
  }

  function validRuntimeHardware(hardware) {
    var interfaces = plainObject(hardware) ? hardware.command_interfaces : null;
    return validHardware(hardware) && hardware.reported_plugin === HARDWARE.plugin &&
      hardware.state === "active" && plainObject(interfaces) &&
      interfaces.expected === JOINT_NAMES.length && interfaces.available === JOINT_NAMES.length &&
      (interfaces.claimed === 0 || interfaces.claimed === JOINT_NAMES.length);
  }

  function validControl(control) {
    return plainObject(control) && control.framework === "ros2_control" &&
      control.scenario === SCENARIO_ID && control.controller_manager === CONTROLLER_MANAGER &&
      validHardware(control.hardware) && exactOrderedStrings(control.controllers, CONTROLLERS) &&
      control.supervisor === SUPERVISOR &&
      exactOrderedStrings(control.states, ["unconfigured", "inactive", "active", "fault"]);
  }

  function managedStatusMode(status) {
    if (!plainObject(status) || status.framework !== "ros2_control" ||
        status.scenario !== SCENARIO_ID || status.controller_manager !== CONTROLLER_MANAGER ||
        !validRuntimeHardware(status.hardware) || !plainObject(status.controllers) ||
        typeof status.control_ready !== "boolean" || typeof status.fault_latched !== "boolean") return "";
    var lifecycle = status.lifecycle_state;
    var mode = status.mode;
    var stateBroadcaster = status.controllers.joint_state_broadcaster;
    var positionController = status.controllers.go2_position_controller;
    if (stateBroadcaster !== "active" || ["active", "inactive"].indexOf(positionController) === -1) return "";
    if (mode === "RUNNING") {
      return lifecycle === "active" && status.control_ready === true && status.fault_latched === false &&
        positionController === "active" && status.hardware.command_interfaces.claimed === JOINT_NAMES.length
        ? mode : "";
    }
    if (mode === "STANDBY") {
      return lifecycle === "inactive" && status.control_ready === false && status.fault_latched === false &&
        positionController === "inactive" && status.hardware.command_interfaces.claimed === 0
        ? mode : "";
    }
    if (mode === "FAULT") {
      return (lifecycle === "unconfigured" || lifecycle === "inactive" || lifecycle === "active") &&
        status.control_ready === false && status.fault_latched === true ? mode : "";
    }
    if (mode === "STARTING") {
      return (lifecycle === "active" || lifecycle === "inactive") &&
        status.control_ready === false && status.fault_latched === false
        ? mode : "";
    }
    if (mode === "BOOT") {
      return lifecycle === "unconfigured" && status.control_ready === false && status.fault_latched === false
        ? mode : "";
    }
    return "";
  }

  function validControlStatus(status) {
    return managedStatusMode(status) === "RUNNING";
  }

  function setControlReadout(status) {
    var live = validControlStatus(status);
    var lifecycle = plainObject(status) && typeof status.lifecycle_state === "string" ? status.lifecycle_state : "unknown";
    var mode = plainObject(status) && typeof status.mode === "string" ? status.mode : "WAITING";
    var controllers = plainObject(status) && plainObject(status.controllers) ? status.controllers : {};

    if (elements.scenario) elements.scenario.textContent = SCENARIO_ID.toUpperCase();
    if (elements.manager) elements.manager.textContent = CONTROLLER_MANAGER;
    if (elements.hardware) elements.hardware.textContent = HARDWARE.name;
    if (elements.supervisor) elements.supervisor.textContent = SUPERVISOR;
    if (elements.lifecycle) {
      elements.lifecycle.textContent = lifecycle.toUpperCase();
      elements.lifecycle.classList.toggle("is-live", live);
    }
    if (elements.mode) {
      elements.mode.textContent = mode;
      elements.mode.classList.toggle("is-live", live);
      elements.mode.classList.toggle("is-fault", mode === "FAULT");
    }
    if (elements.jointStateBroadcaster) {
      elements.jointStateBroadcaster.textContent = (controllers.joint_state_broadcaster || "unknown").toUpperCase();
      elements.jointStateBroadcaster.classList.toggle("is-live", controllers.joint_state_broadcaster === "active");
    }
    if (elements.positionController) {
      elements.positionController.textContent = (controllers.go2_position_controller || "unknown").toUpperCase();
      elements.positionController.classList.toggle("is-live", controllers.go2_position_controller === "active");
    }
    if (typeof root.querySelectorAll === "function") {
      root.querySelectorAll("[data-ros2v-machine-state]").forEach(function (item) {
        item.classList.toggle("is-current", item.getAttribute("data-ros2v-machine-state") === mode);
      });
    }
  }

  function setConnectionState(state, message) {
    connectionState = state;
    var label = {
      connecting: "CONNECTING",
      live: "LIVE",
      standby: "STANDBY",
      fault: "FAULT",
      starting: "STARTING",
      stale: "STALE",
      retrying: "RECONNECTING",
      offline: "OFFLINE",
      blocked: "BLOCKED"
    }[state] || "OFFLINE";

    elements.connection.textContent = label;
    elements.connection.classList.toggle("is-live", state === "live");
    elements.connection.classList.toggle("is-fault", state === "fault");
    elements.connection.classList.toggle("is-retrying", state === "connecting" || state === "retrying" || state === "stale" || state === "starting");
    elements.stageState.textContent = state === "live" ? "RUNNING · CONTROL READY" :
      state === "standby" ? "STANDBY · INTERFACES RELEASED" :
      state === "fault" ? "FAULT · RESET REQUIRED" : label;
    elements.stageState.classList.toggle("is-live", state === "live");
    elements.stage.dataset.state = state === "live" ? "live" : state === "stale" ? "stale" : "offline";
    elements.notice.classList.toggle("is-live", state === "live");
    elements.notice.classList.toggle("is-error", state === "blocked" || state === "fault");
    elements.notice.textContent = message;

    if (state !== "live") {
      var overlayTitle = elements.overlay.querySelector("strong");
      var overlayDetail = elements.overlay.querySelector("small");
      if (overlayTitle) overlayTitle.textContent = state === "blocked" ? "ros2_control 契约不匹配" :
        state === "stale" ? "控制遥测已经过期" :
        state === "standby" ? "STANDBY · 命令接口已释放" :
        state === "fault" ? "FAULT · 等待复位" : "等待 controller_manager";
      if (overlayDetail) overlayDetail.textContent = state === "retrying" ? "页面正在有界重连" :
        state === "standby" ? "可在同容器终端显式 activate" :
        state === "fault" ? "先 reset_fault，再显式 activate" : "启动后无需刷新页面";
      setControlReadout(null);
    }
  }

  function closeSocket(reason) {
    socketGeneration += 1;
    contractAccepted = false;
    if (socket) {
      var current = socket;
      socket = null;
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      if (current.readyState === WebSocket.CONNECTING || current.readyState === WebSocket.OPEN) {
        try {
          current.close(1000, reason || "client lifecycle");
        } catch (_error) {
          // Some engines reject close() while the opening handshake is pending.
        }
      }
    }
  }

  function clearReconnect() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
    }
  }

  function canConnect() {
    return localPreview && document.visibilityState !== "hidden" && navigator.onLine !== false;
  }

  function scheduleReconnect(reason) {
    clearReconnect();
    if (!canConnect() || connectionState === "blocked") return;
    var exponent = Math.min(reconnectAttempt, 5);
    var delay = Math.min(MAX_RETRY_MS, 500 * Math.pow(2, exponent));
    var jitter = Math.floor(Math.random() * Math.min(240, delay * 0.15));
    reconnectAttempt += 1;
    setConnectionState("retrying", reason + "；约 " + ((delay + jitter) / 1000).toFixed(1) + " 秒后重连。也可以立即重连。");
    reconnectTimer = window.setTimeout(function () {
      reconnectTimer = 0;
      connect(false);
    }, delay + jitter);
  }

  function connect(manual) {
    clearReconnect();
    closeSocket("replace connection");
    if (!localPreview) {
      setConnectionState("offline", "这是本地 Docker 工具；公开站点不会探测访问者电脑的回环端口。请在本站本地预览中打开。");
      return;
    }
    if (!validEndpoint(configuredEndpoint)) {
      setConnectionState("blocked", "WebSocket 地址必须是本机回环地址上的 /ws；当前配置已被拒绝。");
      return;
    }
    if (!canConnect()) {
      setConnectionState("offline", "页面当前离线或处于后台；恢复可见后会重新连接。");
      return;
    }
    if (manual) reconnectAttempt = 0;

    var generation = socketGeneration;
    contractAccepted = false;
    setConnectionState("connecting", "正在连接本机 Docker :9090，并等待 ROS 2 协议握手……");

    try {
      socket = new WebSocket(configuredEndpoint);
    } catch (_error) {
      scheduleReconnect("无法创建本地 WebSocket");
      return;
    }

    socket.onopen = function () {
      if (generation !== socketGeneration) return;
      setConnectionState("connecting", "WebSocket 已连接，正在校验 ros2_control 场景、硬件与控制器契约……");
    };

    socket.onmessage = function (event) {
      if (generation !== socketGeneration || typeof event.data !== "string") return;
      var payload;
      try {
        payload = JSON.parse(event.data);
      } catch (_error) {
        blockContract("服务返回了无效 JSON，连接已关闭。");
        return;
      }
      if (!plainObject(payload)) {
        blockContract("服务返回了非对象消息，连接已关闭。");
        return;
      }

      if (payload.type === "hello") {
        if (payload.protocol !== PROTOCOL || payload.read_only !== true || !exactTopics(payload.topic_allowlist) ||
            !validRobot(payload.robot) || !validControl(payload.control)) {
          blockContract("桥接协议、Go2 模型、ros2_control 管理图或 topic allowlist 与页面契约不一致。");
          return;
        }
        contractAccepted = true;
        latestSequence = 0;
        arrivalTimes = [];
        if (elements.distro && typeof payload.ros_distro === "string") {
          elements.distro.textContent = payload.ros_distro.toUpperCase();
        }
        return;
      }

      if (payload.type === "snapshot") {
        if (!contractAccepted || payload.protocol !== PROTOCOL || !validSnapshot(payload)) {
          blockContract("遥测快照不符合已确认的只读协议。");
          return;
        }
        if (latestSequence && payload.sequence <= latestSequence) return;
        latestSequence = payload.sequence;
        lastSnapshotAt = Date.now();
        arrivalTimes.push(lastSnapshotAt);
        if (arrivalTimes.length > 25) arrivalTimes.shift();
        reconnectAttempt = 0;
        var mode = managedStatusMode(payload.status);
        if (mode === "RUNNING") {
          setConnectionState("live", "已连接：Lifecycle 为 active，两个控制器均由 /go2/controller_manager 管理并处于 active。");
        } else if (mode === "STANDBY") {
          setConnectionState("standby", "已连接：Lifecycle 为 inactive，运动控制器已停用，命令接口已释放。");
        } else if (mode === "FAULT") {
          setConnectionState("fault", "已连接：supervisor 已锁存 FAULT；复位后仍需显式 activate。");
        } else {
          setConnectionState("starting", "已连接：控制图正在完成 Lifecycle 或 controller 切换。");
        }
        queueRender(payload);
      }
    };

    socket.onerror = function () {
      // onclose owns user-facing retry state; expected connection refusals stay out of the console.
    };

    socket.onclose = function () {
      if (generation !== socketGeneration || connectionState === "blocked") return;
      socket = null;
      contractAccepted = false;
      scheduleReconnect("本机 ROS 2 WebSocket 已断开");
    };
  }

  function blockContract(message) {
    clearReconnect();
    setConnectionState("blocked", message);
    closeSocket("protocol mismatch");
  }

  function validSnapshot(payload) {
    if (!Number.isSafeInteger(payload.sequence) || payload.sequence < 1 || typeof payload.ready !== "boolean") return false;
    var mode = managedStatusMode(payload.status);
    if (!mode || payload.ready !== (mode === "RUNNING")) return false;
    if (!plainObject(payload.joint_state) || !Array.isArray(payload.joint_state.name) || !Array.isArray(payload.joint_state.position)) return false;
    if (!exactOrderedStrings(payload.joint_state.name, JOINT_NAMES) || payload.joint_state.position.length !== JOINT_NAMES.length) return false;
    if (!payload.joint_state.position.every(Number.isFinite)) return false;
    if (!Array.isArray(payload.transforms) || !payload.transforms.every(function (transform) {
      return plainObject(transform) && typeof transform.parent === "string" && typeof transform.child === "string" &&
        Array.isArray(transform.translation) && transform.translation.length === 3 && transform.translation.every(Number.isFinite) &&
        Array.isArray(transform.rotation) && transform.rotation.length === 4 && transform.rotation.every(Number.isFinite);
    })) return false;
    var transformChildren = payload.transforms.map(function (transform) { return transform.child; });
    if (!FOOT_FRAMES.every(function (frame) { return transformChildren.indexOf(frame) !== -1; })) return false;
    if (!plainObject(payload.topics) || Object.keys(payload.topics).sort().join("\n") !== TOPICS.slice().sort().join("\n")) return false;
    return TOPICS.every(function (topic) {
      var item = payload.topics[topic];
      return plainObject(item) && Number.isSafeInteger(item.messages) && item.messages > 0 &&
        Number.isFinite(item.age_seconds) && item.age_seconds >= 0;
    });
  }

  function queueRender(snapshot) {
    pendingSnapshot = snapshot;
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(function () {
      renderFrame = 0;
      if (!pendingSnapshot) return;
      try {
        renderSnapshot(pendingSnapshot);
      } catch (_error) {
        blockContract("遥测无法安全渲染，连接已关闭。");
      }
      pendingSnapshot = null;
    });
  }

  function fixedSigned(value, digits) {
    var safeValue = Number.isFinite(value) ? value : 0;
    return (safeValue >= 0 ? "+" : "") + safeValue.toFixed(digits);
  }

  function renderSnapshot(snapshot) {
    setControlReadout(snapshot.status);
    var jointPacket = {};
    JOINT_NAMES.forEach(function (name, index) {
      var value = snapshot.joint_state.position[index];
      var output = jointOutputs[name];
      if (output) output.textContent = fixedSigned(value, 3) + " rad";
      jointPacket[name] = Number(value.toFixed(4));
    });

    var elapsed = arrivalTimes.length > 1 ? arrivalTimes[arrivalTimes.length - 1] - arrivalTimes[0] : 0;
    var rate = elapsed > 0 ? (arrivalTimes.length - 1) * 1000 / elapsed : 0;
    elements.rate.textContent = rate ? rate.toFixed(1) + " Hz" : "— Hz";
    elements.sequence.textContent = "#" + snapshot.sequence;

    TOPICS.forEach(function (topic) {
      var row = root.querySelector('[data-ros2v-topic="' + topic + '"]');
      var current = snapshot.topics[topic];
      if (!row) return;
      row.classList.toggle("is-live", current.age_seconds < 1);
      var counter = row.querySelector("output");
      if (counter) counter.textContent = String(current.messages);
    });

    var children = snapshot.transforms.map(function (transform) { return transform.child; });
    var liveFootFrames = FOOT_FRAMES.filter(function (frame) { return children.indexOf(frame) !== -1; });
    elements.tfStatus.textContent = "四腿 TF 已收到 · 4/4 foot frames · " + snapshot.transforms.length + " transforms";
    elements.packet.textContent = JSON.stringify({
      scenario: snapshot.status.scenario,
      mode: snapshot.status.mode,
      lifecycle_state: snapshot.status.lifecycle_state,
      control_ready: snapshot.status.control_ready,
      fault_latched: snapshot.status.fault_latched,
      controller_manager: snapshot.status.controller_manager,
      hardware: snapshot.status.hardware,
      controllers: snapshot.status.controllers,
      command_source: snapshot.status.command_source,
      command_sequence: snapshot.status.command_sequence,
      joints: jointPacket,
      foot_frames: liveFootFrames,
      frames: snapshot.transforms.map(function (transform) {
        return transform.parent + " → " + transform.child;
      })
    }, null, 2);
  }

  function updateAge() {
    if (!lastSnapshotAt) {
      elements.age.textContent = "— ms";
      return;
    }
    var age = Date.now() - lastSnapshotAt;
    elements.age.textContent = age < 1000 ? age + " ms" : (age / 1000).toFixed(1) + " s";
    if (["live", "standby", "fault", "starting"].indexOf(connectionState) !== -1 && age > STALE_AFTER_MS) {
      setConnectionState("stale", "WebSocket 仍在，但 ROS 遥测已超过 2.5 秒没有更新；正在重建连接。");
      if (socket) socket.close(4000, "stale telemetry");
    }
  }

  setupRviz();
  setupTerminal();
  if (!diagnosticsReady) return;

  elements.reconnect.addEventListener("click", function () {
    connectionState = "offline";
    connect(true);
  });

  if (elements.copy) {
    elements.copy.addEventListener("click", function () {
      var value = elements.copy.getAttribute("data-copy-text") || "";
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(value).then(function () {
        var previous = elements.copy.textContent;
        elements.copy.textContent = "已复制";
        window.setTimeout(function () { elements.copy.textContent = previous; }, 1200);
      }).catch(function () {
        // Clipboard access is optional and may be denied outside a secure context.
      });
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      clearReconnect();
      closeSocket("page hidden");
      setConnectionState("offline", "页面处于后台，实时连接已主动释放；返回页面后会恢复。");
    } else {
      connectionState = "offline";
      connect(true);
    }
  });

  window.addEventListener("offline", function () {
    clearReconnect();
    closeSocket("browser offline");
    setConnectionState("offline", "浏览器已离线；网络恢复后会重新连接本机 Docker。");
  });
  window.addEventListener("online", function () {
    connectionState = "offline";
    connect(true);
  });
  window.addEventListener("pagehide", function () {
    clearReconnect();
    closeSocket("page hidden");
  });
  window.addEventListener("pageshow", function () {
    if (!socket && document.visibilityState !== "hidden") {
      connectionState = "offline";
      connect(true);
    }
  });

  window.setInterval(updateAge, 250);
  connect(true);
})();
