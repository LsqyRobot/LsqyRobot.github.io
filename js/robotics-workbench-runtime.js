(function () {
  "use strict";

  var EVENT_NAME = "robotics-workbench-runtime";
  var HELPER_READ_TIMEOUT_MS = 22000;
  var HELPER_ACTION_TIMEOUT_MS = 3000;
  var HEALTH_TIMEOUT_MS = 3000;
  // Stay slightly beyond the helper's 30 minute first-build ceiling so the
  // page does not time out while that same Docker job is still legitimate.
  var ACTION_TIMEOUT_MS = 31 * 60 * 1000;
  var POLL_INTERVAL_MS = 1000;

  function metaContent(name) {
    var meta = document.querySelector('meta[name="' + name + '"]');
    return meta ? String(meta.getAttribute("content") || "").trim() : "";
  }

  function isLoopbackHostname(hostname) {
    var value = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    return value === "localhost" || value === "127.0.0.1" || value === "::1";
  }

  function detectMode(locationLike, configuredMode) {
    var declared = String(configuredMode || "auto").toLowerCase();
    if (declared === "online") {
      return "online";
    }
    // A marker may force the safer online mode, but it may never turn a
    // non-loopback deployment into a controller for the visitor's machine.
    return isLoopbackHostname(locationLike && locationLike.hostname) ? "local" : "online";
  }

  function normalizeHttpBase(value, fallback) {
    try {
      var url = new URL(String(value || fallback || ""), window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return fallback;
      }
      url.search = "";
      url.hash = "";
      return url.href.replace(/\/+$/, "");
    } catch (_error) {
      return fallback;
    }
  }

  function joinUrl(base, path) {
    return String(base).replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
  }

  async function fetchJson(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, timeoutMs);
    try {
      var response = await fetch(url, Object.assign({
        cache: "no-store",
        signal: controller.signal
      }, options || {}));
      var payload = null;
      try {
        payload = await response.json();
      } catch (_error) {
        payload = null;
      }
      if (!response.ok) {
        var apiMessage = payload && payload.error &&
          (payload.error.message || payload.error.code || payload.error);
        var error = new Error(apiMessage || "HTTP " + response.status);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("服务没有返回有效 JSON。");
      }
      return payload;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("请求超时（" + Math.round(timeoutMs / 1000) + " 秒）。");
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function compactOutput(value) {
    var text = String(value || "").trim();
    if (!text) {
      return "";
    }
    var lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - 12)).join("\n");
  }

  function humanFailure(error) {
    var payload = error && error.payload;
    var code = payload && payload.error && payload.error.code;
    var message = error && error.message ? error.message : "请求失败";
    var combined = (code + " " + message).toLowerCase();
    if (combined.includes("permission") || combined.includes("denied")) {
      return "Docker 权限被拒绝；请在终端确认当前用户可以运行 Docker。";
    }
    if (combined.includes("compose") && (combined.includes("missing") || combined.includes("not found"))) {
      return "没有可用的 Docker Compose v2。";
    }
    if (combined.includes("docker") && (combined.includes("missing") || combined.includes("not found"))) {
      return "没有找到 Docker CLI。";
    }
    if (combined.includes("port") || combined.includes("address already in use") ||
        combined.includes("bind") || combined.includes("allocated")) {
      return "端口 4010 被占用，Workbench 无法绑定本机回环地址。";
    }
    return message;
  }

  function createController() {
    var panel = document.querySelector("[data-rc-service-panel]");
    if (!panel) {
      return null;
    }

    var elements = {
      healthState: document.querySelector("[data-rc-health-state]"),
      serviceState: panel.querySelector("[data-rc-service-state]"),
      summary: panel.querySelector("[data-rc-service-summary]"),
      runtimeMode: panel.querySelector("[data-rc-runtime-mode]"),
      helperState: panel.querySelector("[data-rc-helper-state]"),
      apiState: panel.querySelector("[data-rc-api-state]"),
      imageState: panel.querySelector("[data-rc-image-state]"),
      localActions: Array.from(panel.querySelectorAll("[data-rc-local-actions]")),
      start: panel.querySelector("[data-rc-service-start]"),
      check: panel.querySelector("[data-rc-service-check]"),
      logs: panel.querySelector("[data-rc-service-logs]"),
      stop: panel.querySelector("[data-rc-service-stop]"),
      progress: panel.querySelector("[data-rc-service-progress]"),
      progressCopy: panel.querySelector("[data-rc-service-progress-copy]"),
      log: panel.querySelector("[data-rc-service-log]"),
      fallback: panel.querySelector("[data-rc-command-fallback]")
    };

    var mode = detectMode(window.location, metaContent("robotics-runtime-mode"));
    var helperBase = normalizeHttpBase(
      metaContent("robotics-helper-base"),
      "http://127.0.0.1:4011"
    );
    var apiBase = window.RoboticsWorkbench &&
      typeof window.RoboticsWorkbench.apiUrl === "function"
      ? window.RoboticsWorkbench.apiUrl("")
      : "http://127.0.0.1:4010";
    var snapshot = {
      mode: mode,
      status: mode === "online" ? "online" : "checking",
      backendReady: false,
      helperConnected: false,
      helper: null,
      api: null,
      busy: false,
      notification: "",
      notificationKind: ""
    };
    var actionPromise = null;

    function notify(next) {
      snapshot = Object.assign({}, snapshot, next || {});
      render();
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: Object.assign({}, snapshot) }));
      return Object.assign({}, snapshot);
    }

    function stateCopy() {
      if (snapshot.status === "ready") {
        return {
          title: "服务已运行",
          summary: "Robotics Workbench 与标定 C++ 内核均通过健康检查，可以运行标定、FK 和 IK。"
        };
      }
      if (snapshot.status === "starting") {
        return {
          title: "服务启动中",
          summary: snapshot.helper && snapshot.helper.diagnostics && snapshot.helper.diagnostics.buildRequired
            ? "本机尚无计算镜像，helper 正在构建并启动容器；首次运行可能需要几分钟。"
            : "helper 正在启动容器并等待 :4010 健康检查。"
        };
      }
      if (snapshot.status === "stopping") {
        return { title: "服务停止中", summary: "正在停止共享的 Workbench；动力学、标定和轨迹页都会暂时不可用。" };
      }
      if (snapshot.status === "error") {
        return {
          title: "服务异常",
          summary: snapshot.failure || "Docker 或 Workbench 返回异常。请查看日志后重试，或复制命令在终端排查。"
        };
      }
      if (snapshot.status === "online") {
        return {
          title: "当前为线上版本",
          summary: "为避免公网页面探测或控制访问者电脑，本页不会请求 127.0.0.1，也不会尝试启动 Docker。参数说明和静态示例仍可查看；C++ 标定、FK、IK 与轨迹计算仅支持本地运行。"
        };
      }
      if (snapshot.status === "checking") {
        return { title: "正在检查服务", summary: "正在检查本机 helper 与 Workbench 健康状态，请稍候。" };
      }
      return {
        title: "Docker 未启动",
        summary: snapshot.helperConnected
          ? "受控 helper 已连接，但 Workbench 尚未运行。可点击“启动 Docker”。"
          : "Workbench 未响应，且没有连接到受控 helper。请用 calibration-serve 启动本地预览，或复制下面的命令手动运行。"
      };
    }

    function helperServiceState() {
      return snapshot.helper && snapshot.helper.service && snapshot.helper.service.state;
    }

    function render() {
      var copy = stateCopy();
      var status = snapshot.status;
      elements.serviceState.textContent = copy.title;
      elements.serviceState.className = "rc-service-state is-" + status;
      elements.summary.textContent = copy.summary;
      elements.healthState.textContent = copy.title;
      elements.healthState.classList.toggle("is-ready", status === "ready");
      elements.healthState.classList.toggle("rc-health-error", status === "error");
      elements.runtimeMode.textContent = mode === "local" ? "本机回环预览" : "线上静态版本";
      elements.helperState.textContent = mode === "online"
        ? "不连接"
        : (snapshot.helperConnected ? "已连接 · :4011" : "未运行 / 被阻止");
      elements.apiState.textContent = status === "ready"
        ? "健康 · :4010"
        : (mode === "online" ? "不探测" : (status === "checking" ? "检查中" : "不可用"));

      var diagnostics = snapshot.helper && snapshot.helper.diagnostics;
      if (mode === "online") {
        elements.imageState.textContent = "不检查";
      } else if (diagnostics && (diagnostics.imagePresent === true ||
          (diagnostics.image && diagnostics.image.present === true))) {
        elements.imageState.textContent = "已存在";
      } else if (diagnostics && (diagnostics.buildRequired === true || diagnostics.imagePresent === false ||
          (diagnostics.image && diagnostics.image.present === false))) {
        elements.imageState.textContent = "首次启动需构建";
      } else {
        elements.imageState.textContent = "未知";
      }

      elements.localActions.forEach(function (element) {
        element.hidden = mode !== "local";
      });
      var jobBusy = status === "starting" || status === "stopping" || snapshot.busy;
      elements.start.disabled = jobBusy || !snapshot.helperConnected || status === "ready";
      elements.check.disabled = jobBusy;
      elements.logs.disabled = jobBusy || !snapshot.helperConnected;
      elements.stop.disabled = jobBusy || !snapshot.helperConnected ||
        (status !== "ready" && status !== "error");
      elements.progress.hidden = !jobBusy;
      if (jobBusy) {
        var job = snapshot.helper && snapshot.helper.job;
        var output = compactOutput(job && (job.output || job.stderr || job.stdout));
        elements.progressCopy.textContent = status === "stopping"
          ? "正在停止 Workbench……"
          : (output || "正在等待 Docker 和健康检查；可刷新页面重新连接当前任务。");
      }
      if (status === "online" || (!snapshot.helperConnected && status !== "checking") || status === "error") {
        elements.fallback.open = true;
      }
    }

    async function readApiHealth() {
      var payload = await fetchJson(joinUrl(apiBase, "/api/calibration/health"), {}, HEALTH_TIMEOUT_MS);
      if (payload.ok !== true || payload.engine !== "robot_calibrator") {
        throw new Error("响应不是预期的 Robotics Workbench 标定内核。");
      }
      return payload;
    }

    async function readHelperStatus() {
      var payload = await fetchJson(joinUrl(helperBase, "/api/helper/status"), {}, HELPER_READ_TIMEOUT_MS);
      if (payload.ok !== true) {
        throw new Error("helper 状态响应缺少 ok=true。 ");
      }
      return payload;
    }

    function statusFrom(helper, apiReady) {
      var service = helper && helper.service && helper.service.state;
      var job = helper && helper.job;
      if ((job && job.state === "running" && job.action === "start") || service === "starting") {
        return "starting";
      }
      if ((job && job.state === "running" && job.action === "stop") || service === "stopping") {
        return "stopping";
      }
      if (service === "error") {
        return "error";
      }
      if (apiReady) {
        return "ready";
      }
      if (service === "ready" || service === "running") {
        return "error";
      }
      return "offline";
    }

    async function refresh(options) {
      options = options || {};
      if (mode === "online") {
        return notify({
          status: "online",
          backendReady: false,
          helperConnected: false,
          helper: null,
          api: null,
          busy: false,
          notification: options.showNotice
            ? "线上静态版本不会连接或启动访问者电脑上的 Docker。"
            : "",
          notificationKind: "warning"
        });
      }

      if (!options.quiet) {
        notify({ status: "checking", backendReady: false, busy: false });
      }
      var results = await Promise.allSettled([readApiHealth(), readHelperStatus()]);
      var apiReady = results[0].status === "fulfilled";
      var helperConnected = results[1].status === "fulfilled";
      var helper = helperConnected ? results[1].value : null;
      var status = statusFrom(helper, apiReady);
      var helperError = helperConnected ? null : results[1].reason;
      var apiError = apiReady ? null : results[0].reason;
      var failure = "";
      if (status === "error") {
        var job = helper && helper.job;
        var jobOutput = compactOutput(job && (job.output || job.stderr || job.stdout));
        var structuredError = helper && ((helper.service && helper.service.error) ||
          (helper.diagnostics && helper.diagnostics.error));
        var structuredMessage = structuredError && (structuredError.message || structuredError.code);
        var serviceError = new Error(jobOutput || structuredMessage || "Workbench 启动失败。");
        if (structuredError) {
          serviceError.payload = { error: structuredError };
        }
        var helperSaysReady = helper && helper.service &&
          (helper.service.state === "ready" || helper.service.state === "running");
        failure = helperSaysReady
          ? "helper 确认容器已运行，但当前浏览器无法访问 :4010；请检查浏览器本地网络权限、CORS 或端口占用。"
          : humanFailure(serviceError);
      }
      var notification = "";
      var notificationKind = "";
      if (options.showNotice) {
        if (status === "ready") {
          notification = "Docker 计算服务和标定 C++ 内核均已就绪。";
          notificationKind = "success";
        } else if (!helperConnected) {
          notification = "Workbench 与本机 helper 均不可用：" + humanFailure(helperError || apiError) + " 请复制页面中的本地命令。";
          notificationKind = "warning";
        } else if (status === "error") {
          notification = failure;
          notificationKind = "error";
        } else if (status === "offline") {
          notification = "Docker 计算服务尚未启动。";
          notificationKind = "warning";
        }
      }
      var current = notify({
        status: status,
        backendReady: status === "ready" && apiReady,
        helperConnected: helperConnected,
        helper: helper,
        api: apiReady ? results[0].value : null,
        busy: status === "starting" || status === "stopping" || Boolean(actionPromise),
        failure: failure,
        notification: notification,
        notificationKind: notificationKind
      });
      if ((status === "starting" || status === "stopping") && !actionPromise) {
        adoptRunningJob(status === "starting" ? "start" : "stop");
      }
      return current;
    }

    async function helperPost(path) {
      if (mode !== "local") {
        throw new Error("线上静态版本禁止调用本机 helper。");
      }
      return fetchJson(joinUrl(helperBase, path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }, HELPER_ACTION_TIMEOUT_MS);
    }

    function delay(milliseconds) {
      return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
    }

    async function pollAction(action) {
      var deadline = Date.now() + ACTION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await delay(POLL_INTERVAL_MS);
        var current = await refresh({ quiet: true });
        if (action === "start" && current.status === "ready") {
          return notify({
            busy: false,
            notification: "Docker 已启动，标定 C++ 内核通过健康检查；已保留当前页面参数。",
            notificationKind: "success"
          });
        }
        if (action === "stop" && current.status === "offline" && current.helperConnected) {
          return notify({
            busy: false,
            notification: "Robotics Workbench 已停止；动力学、标定和轨迹页现已离线。",
            notificationKind: "success"
          });
        }
        var job = current.helper && current.helper.job;
        if (current.status === "error" || (job && job.state === "failed")) {
          throw new Error(current.failure || compactOutput(job && job.output) || "helper 操作失败。");
        }
      }
      throw new Error("等待 Docker " + (action === "start" ? "启动" : "停止") + "超时；任务可能仍在后台运行，请检查状态和日志。");
    }

    function adoptRunningJob(action) {
      if (actionPromise) return actionPromise;
      actionPromise = pollAction(action).catch(function (error) {
        elements.fallback.open = true;
        return notify({
          status: "error",
          backendReady: false,
          busy: false,
          failure: humanFailure(error),
          notification: humanFailure(error) + " 可查看日志或复制命令继续排查。",
          notificationKind: "error"
        });
      }).finally(function () {
        actionPromise = null;
      });
      return actionPromise;
    }

    function runAction(action) {
      if (mode !== "local") {
        return Promise.resolve(notify({
          status: "online",
          backendReady: false,
          helperConnected: false,
          helper: null,
          api: null,
          busy: false,
          notification: "线上静态版本不会连接或启动访问者电脑上的 Docker。",
          notificationKind: "warning"
        }));
      }
      if (actionPromise) {
        return actionPromise;
      }
      actionPromise = (async function () {
        try {
          notify({
            status: action === "start" ? "starting" : "stopping",
            backendReady: action === "stop" ? false : snapshot.backendReady,
            busy: true,
            notification: "",
            notificationKind: ""
          });
          var accepted = await helperPost("/api/helper/" + action);
          notify({ helper: Object.assign({}, snapshot.helper || {}, { job: accepted.job || null }) });
          return await pollAction(action);
        } catch (error) {
          elements.fallback.open = true;
          return notify({
            status: "error",
            backendReady: false,
            busy: false,
            failure: humanFailure(error),
            notification: humanFailure(error) + " 可复制页面中的命令在终端继续。",
            notificationKind: "error"
          });
        } finally {
          actionPromise = null;
        }
      })();
      return actionPromise;
    }

    async function showLogs() {
      if (mode !== "local") {
        return notify({
          status: "online",
          backendReady: false,
          helperConnected: false,
          notification: "线上静态版本不会读取访问者电脑上的 Docker 日志。",
          notificationKind: "warning"
        });
      }
      try {
        var payload = await fetchJson(joinUrl(helperBase, "/api/helper/logs"), {}, HELPER_READ_TIMEOUT_MS);
        var output = payload.output || payload.logs || "当前容器没有可显示的日志。";
        elements.log.textContent = String(output);
        elements.log.hidden = false;
        elements.log.focus({ preventScroll: true });
      } catch (error) {
        notify({
          notification: "无法读取受控日志：" + humanFailure(error),
          notificationKind: "error"
        });
      }
    }

    function copyCommand(button) {
      var command = button.dataset.rcCopyCommand || "";
      var copy = navigator.clipboard && window.isSecureContext
        ? navigator.clipboard.writeText(command)
        : new Promise(function (resolve, reject) {
          var field = document.createElement("textarea");
          field.value = command;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();
          var copied = document.execCommand("copy");
          field.remove();
          if (copied) resolve(); else reject(new Error("copy failed"));
        });
      copy.then(function () {
        var original = button.textContent;
        button.textContent = "已复制";
        window.setTimeout(function () { button.textContent = original; }, 1200);
      }).catch(function () {
        notify({ notification: "浏览器禁止写入剪贴板，请手动选择命令复制。", notificationKind: "warning" });
      });
    }

    elements.start.addEventListener("click", function () { void runAction("start"); });
    elements.check.addEventListener("click", function () { void refresh({ showNotice: true }); });
    elements.logs.addEventListener("click", function () { void showLogs(); });
    elements.stop.addEventListener("click", function () {
      var confirmed = window.confirm(
        "停止 Robotics Workbench？这会同时中断动力学辨识、机器人标定/FK/IK 和轨迹规划页面的本地计算。"
      );
      if (confirmed) {
        void runAction("stop");
      }
    });
    Array.from(panel.querySelectorAll("[data-rc-copy-command]")).forEach(function (button) {
      button.addEventListener("click", function () { copyCommand(button); });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && mode === "local" && !actionPromise) {
        void refresh({ quiet: true });
      }
    });

    render();
    return {
      mode: mode,
      refresh: refresh,
      start: function () { return runAction("start"); },
      stop: function () { return runAction("stop"); },
      showLogs: showLogs,
      snapshot: function () { return Object.assign({}, snapshot); }
    };
  }

  var exported = {
    EVENT_NAME: EVENT_NAME,
    isLoopbackHostname: isLoopbackHostname,
    detectMode: detectMode,
    createController: createController
  };
  window.RoboticsRuntimeControl = exported;
  window.roboticsRuntimeController = createController();
})();
