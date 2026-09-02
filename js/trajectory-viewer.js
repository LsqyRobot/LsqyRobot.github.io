(function () {
  "use strict";

  var PI = Math.PI;

  function numberList(text, expected, fallback) {
    if (!text) {
      return fallback ? fallback.slice() : [];
    }
    var values = String(text).trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.some(function (value) { return !Number.isFinite(value); }) ||
        (expected && values.length !== expected)) {
      throw new Error("向量格式无效：" + text);
    }
    return values;
  }

  function csvRows(text) {
    var rows = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      if (!line.trim() || line.trim().startsWith("#")) {
        return;
      }
      var row = [];
      var value = "";
      var quoted = false;
      for (var index = 0; index < line.length; index += 1) {
        var character = line[index];
        if (quoted) {
          if (character === '"' && line[index + 1] === '"') {
            value += '"';
            index += 1;
          } else if (character === '"') {
            quoted = false;
          } else {
            value += character;
          }
        } else if (character === '"') {
          quoted = true;
        } else if (character === ",") {
          row.push(value.trim());
          value = "";
        } else {
          value += character;
        }
      }
      row.push(value.trim());
      rows.push(row);
    });
    return rows;
  }

  function vecAdd(first, second) {
    return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
  }

  function vecSubtract(first, second) {
    return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
  }

  function vecScale(value, factor) {
    return [value[0] * factor, value[1] * factor, value[2] * factor];
  }

  function vecDot(first, second) {
    return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
  }

  function vecCross(first, second) {
    return [
      first[1] * second[2] - first[2] * second[1],
      first[2] * second[0] - first[0] * second[2],
      first[0] * second[1] - first[1] * second[0]
    ];
  }

  function vecNorm(value) {
    return Math.sqrt(vecDot(value, value));
  }

  function vecNormalize(value, fallback) {
    var length = vecNorm(value);
    return length > 1e-12 ? vecScale(value, 1 / length) : fallback.slice();
  }

  function identityTransform() {
    return {
      r: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      t: [0, 0, 0]
    };
  }

  function matVec(matrix, value) {
    return [
      matrix[0] * value[0] + matrix[1] * value[1] + matrix[2] * value[2],
      matrix[3] * value[0] + matrix[4] * value[1] + matrix[5] * value[2],
      matrix[6] * value[0] + matrix[7] * value[1] + matrix[8] * value[2]
    ];
  }

  function matMultiply(first, second) {
    var result = new Array(9).fill(0);
    for (var row = 0; row < 3; row += 1) {
      for (var column = 0; column < 3; column += 1) {
        for (var inner = 0; inner < 3; inner += 1) {
          result[row * 3 + column] +=
            first[row * 3 + inner] * second[inner * 3 + column];
        }
      }
    }
    return result;
  }

  function compose(first, second) {
    return {
      r: matMultiply(first.r, second.r),
      t: vecAdd(first.t, matVec(first.r, second.t))
    };
  }

  function translate(value) {
    var result = identityTransform();
    result.t = value.slice();
    return result;
  }

  function rotateAxis(axis, angle) {
    var unit = vecNormalize(axis, [1, 0, 0]);
    var x = unit[0];
    var y = unit[1];
    var z = unit[2];
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    var one = 1 - cosine;
    return {
      r: [
        cosine + x * x * one,
        x * y * one - z * sine,
        x * z * one + y * sine,
        y * x * one + z * sine,
        cosine + y * y * one,
        y * z * one - x * sine,
        z * x * one - y * sine,
        z * y * one + x * sine,
        cosine + z * z * one
      ],
      t: [0, 0, 0]
    };
  }

  function rotateX(angle) {
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    return { r: [1, 0, 0, 0, cosine, -sine, 0, sine, cosine], t: [0, 0, 0] };
  }

  function rotateY(angle) {
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    return { r: [cosine, 0, sine, 0, 1, 0, -sine, 0, cosine], t: [0, 0, 0] };
  }

  function rotateZ(angle) {
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    return { r: [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1], t: [0, 0, 0] };
  }

  function rotateRpy(rpy) {
    return compose(compose(rotateZ(rpy[2]), rotateY(rpy[1])), rotateX(rpy[0]));
  }

  function parseUrdf(text, tipLink) {
    var documentNode = new DOMParser().parseFromString(text, "application/xml");
    if (documentNode.querySelector("parsererror")) {
      throw new Error("浏览器无法解析 URDF XML");
    }
    var joints = Array.from(documentNode.querySelectorAll("robot > joint")).map(function (node) {
      var parent = node.querySelector(":scope > parent");
      var child = node.querySelector(":scope > child");
      var origin = node.querySelector(":scope > origin");
      var axis = node.querySelector(":scope > axis");
      return {
        name: node.getAttribute("name") || "joint",
        type: (node.getAttribute("type") || "fixed").toLowerCase(),
        parent: parent && parent.getAttribute("link"),
        child: child && child.getAttribute("link"),
        xyz: numberList(origin && origin.getAttribute("xyz"), 3, [0, 0, 0]),
        rpy: numberList(origin && origin.getAttribute("rpy"), 3, [0, 0, 0]),
        axis: numberList(axis && axis.getAttribute("xyz"), 3, [1, 0, 0])
      };
    });
    var childMap = new Map();
    var parentLinks = new Set();
    joints.forEach(function (joint) {
      if (joint.child) childMap.set(joint.child, joint);
      if (joint.parent) parentLinks.add(joint.parent);
    });
    var selectedTip = tipLink && childMap.has(tipLink) ? tipLink : "";
    if (!selectedTip) {
      var leaves = joints.map(function (joint) { return joint.child; }).filter(function (link) {
        return link && !parentLinks.has(link);
      });
      selectedTip = leaves[0] || (joints[joints.length - 1] && joints[joints.length - 1].child);
    }
    var chain = [];
    var cursor = selectedTip;
    var visited = new Set();
    while (cursor && childMap.has(cursor) && !visited.has(cursor)) {
      visited.add(cursor);
      var joint = childMap.get(cursor);
      chain.unshift(joint);
      cursor = joint.parent;
    }
    if (!chain.length) {
      throw new Error("无法从 URDF 构造固定基串联链");
    }
    return {
      kind: "urdf",
      joints: chain,
      activeNames: chain.filter(function (joint) { return joint.type !== "fixed"; })
        .map(function (joint) { return joint.name; })
    };
  }

  function parseDh(text, type, lengthFactor, angleFactor) {
    var rows = csvRows(text);
    if (rows.length < 2) throw new Error("DH / MDH CSV 没有参数行");
    var header = rows[0].map(function (value) { return value.toLowerCase(); });
    function column(names, required) {
      for (var index = 0; index < names.length; index += 1) {
        var found = header.indexOf(names[index]);
        if (found !== -1) return found;
      }
      if (required) throw new Error("DH / MDH CSV 缺少列：" + names[0]);
      return -1;
    }
    var columns = {
      name: column(["joint", "joint_name"], true),
      type: column(["type", "joint_type"], true),
      a: column(["a", "a_m"], true),
      alpha: column(["alpha", "alpha_rad"], true),
      d: column(["d", "d_m"], true),
      theta: column(["theta", "theta_rad"], true),
      sign: column(["q_sign"], false)
    };
    var joints = rows.slice(1).map(function (row) {
      var jointType = String(row[columns.type] || "fixed").toLowerCase();
      return {
        name: row[columns.name],
        type: jointType,
        a: Number(row[columns.a]) * lengthFactor,
        alpha: Number(row[columns.alpha]) * angleFactor,
        d: Number(row[columns.d]) * lengthFactor,
        theta: Number(row[columns.theta]) * angleFactor,
        sign: columns.sign === -1 ? 1 : Number(row[columns.sign] || 1)
      };
    });
    if (joints.some(function (joint) {
      return [joint.a, joint.alpha, joint.d, joint.theta, joint.sign]
        .some(function (value) { return !Number.isFinite(value); });
    })) {
      throw new Error("DH / MDH CSV 含非有限数值");
    }
    return {
      kind: type,
      joints: joints,
      activeNames: joints.filter(function (joint) { return joint.type !== "fixed"; })
        .map(function (joint) { return joint.name; })
    };
  }

  function modelPose(model, q, toolXyz, toolRpy) {
    var transform = identityTransform();
    var points = [transform.t.slice()];
    var jointMarkers = [];
    var activeIndex = 0;
    model.joints.forEach(function (joint) {
      if (model.kind === "urdf") {
        transform = compose(transform, compose(translate(joint.xyz), rotateRpy(joint.rpy)));
        var originPoint = transform.t.slice();
        var axisWorld = matVec(transform.r, vecNormalize(joint.axis, [1, 0, 0]));
        if (vecNorm(vecSubtract(points[points.length - 1], originPoint)) > 1e-9) {
          points.push(originPoint);
        }
        if (joint.type === "revolute" || joint.type === "continuous") {
          transform = compose(transform, rotateAxis(joint.axis, q[activeIndex] || 0));
          activeIndex += 1;
          jointMarkers.push({ point: originPoint, axis: axisWorld });
        } else if (joint.type === "prismatic") {
          transform = compose(transform, translate(vecScale(joint.axis, q[activeIndex] || 0)));
          activeIndex += 1;
          jointMarkers.push({ point: transform.t.slice(), axis: axisWorld });
        }
        if (vecNorm(vecSubtract(points[points.length - 1], transform.t)) > 1e-9) {
          points.push(transform.t.slice());
        }
      } else {
        var value = joint.type === "fixed" ? 0 : (q[activeIndex] || 0) * joint.sign;
        if (joint.type !== "fixed") activeIndex += 1;
        if (model.kind === "dh") {
          jointMarkers.push({ point: transform.t.slice(), axis: matVec(transform.r, [0, 0, 1]) });
          var theta = joint.theta +
            ((joint.type === "revolute" || joint.type === "continuous") ? value : 0);
          var d = joint.d + (joint.type === "prismatic" ? value : 0);
          transform = compose(transform, rotateZ(theta));
          transform = compose(transform, translate([0, 0, d]));
          transform = compose(transform, translate([joint.a, 0, 0]));
          transform = compose(transform, rotateX(joint.alpha));
        } else {
          transform = compose(transform, translate([joint.a, 0, 0]));
          transform = compose(transform, rotateX(joint.alpha));
          jointMarkers.push({ point: transform.t.slice(), axis: matVec(transform.r, [0, 0, 1]) });
          var mdhTheta = joint.theta +
            ((joint.type === "revolute" || joint.type === "continuous") ? value : 0);
          var mdhD = joint.d + (joint.type === "prismatic" ? value : 0);
          transform = compose(transform, rotateZ(mdhTheta));
          transform = compose(transform, translate([0, 0, mdhD]));
        }
        points.push(transform.t.slice());
      }
    });
    transform = compose(transform, compose(translate(toolXyz), rotateRpy(toolRpy)));
    if (vecNorm(vecSubtract(points[points.length - 1], transform.t)) > 1e-9) {
      points.push(transform.t.slice());
    }
    return { points: points, joints: jointMarkers, tcp: transform.t.slice() };
  }

  function Viewer(root) {
    if (!root) throw new Error("TrajectoryViewer 缺少根元素");
    this.root = root;
    this.canvas = root.querySelector("[data-tp-viewer-canvas]");
    this.context = this.canvas && this.canvas.getContext("2d");
    this.playButton = root.querySelector("[data-tp-viewer-play]");
    this.slider = root.querySelector("[data-tp-viewer-time]");
    this.speed = root.querySelector("[data-tp-viewer-speed]");
    this.resetButton = root.querySelector("[data-tp-viewer-reset-camera]");
    this.timeLabel = root.querySelector("[data-tp-viewer-time-label]");
    this.stateLabel = root.querySelector("[data-tp-viewer-state]");
    this.model = null;
    this.modelConfig = null;
    this.samples = [];
    this.actualPath = [];
    this.waypointPath = [];
    this.hasCorrections = false;
    this.currentTime = 0;
    this.duration = 0;
    this.playing = false;
    this.lastFrame = 0;
    this.camera = { yaw: -0.8, pitch: 0.38, distance: 1.5, target: [0, 0, 0.3] };
    this.pointer = null;
    this.animationFrame = null;
    this.bind();
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(this.resize.bind(this)) : null;
    if (this.resizeObserver) this.resizeObserver.observe(this.canvas);
    this.resize();
  }

  Viewer.prototype.bind = function () {
    var viewer = this;
    if (this.playButton) {
      this.playButton.addEventListener("click", function () {
        if (!viewer.samples.length) return;
        if (viewer.currentTime >= viewer.duration - 1e-9) viewer.currentTime = 0;
        viewer.playing = !viewer.playing;
        viewer.lastFrame = performance.now();
        viewer.syncControls();
        viewer.requestDraw();
      });
    }
    if (this.slider) {
      this.slider.addEventListener("input", function () {
        viewer.currentTime = Number(viewer.slider.value) || 0;
        viewer.playing = false;
        viewer.syncControls();
        viewer.requestDraw();
      });
    }
    if (this.resetButton) {
      this.resetButton.addEventListener("click", function () {
        viewer.frameScene();
        viewer.requestDraw();
      });
    }
    this.canvas.addEventListener("pointerdown", function (event) {
      viewer.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewer.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", function (event) {
      if (!viewer.pointer || viewer.pointer.id !== event.pointerId) return;
      var dx = event.clientX - viewer.pointer.x;
      var dy = event.clientY - viewer.pointer.y;
      viewer.pointer.x = event.clientX;
      viewer.pointer.y = event.clientY;
      viewer.camera.yaw -= dx * 0.008;
      viewer.camera.pitch = Math.max(-1.35, Math.min(1.35,
        viewer.camera.pitch + dy * 0.008));
      viewer.requestDraw();
    });
    function release(event) {
      if (viewer.pointer && viewer.pointer.id === event.pointerId) viewer.pointer = null;
    }
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener("wheel", function (event) {
      event.preventDefault();
      viewer.camera.distance = Math.max(0.05,
        viewer.camera.distance * Math.exp(event.deltaY * 0.0012));
      viewer.requestDraw();
    }, { passive: false });
  };

  Viewer.prototype.resize = function () {
    if (!this.canvas || !this.context) return;
    var rectangle = this.canvas.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rectangle.width * ratio));
    var height = Math.max(1, Math.round(rectangle.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.requestDraw();
  };

  Viewer.prototype.setModel = function (configuration) {
    this.modelConfig = configuration;
    try {
      var lengthFactor = configuration.lengthUnit === "mm" ? 0.001 : 1;
      var angleFactor = configuration.angleUnit === "deg" ? PI / 180 : 1;
      this.model = configuration.modelType === "urdf"
        ? parseUrdf(configuration.text, configuration.tipLink)
        : parseDh(configuration.text, configuration.modelType, lengthFactor, angleFactor);
      this.modelConfig.toolXyzSi = (configuration.toolXyz || [0, 0, 0])
        .map(function (value) { return value * lengthFactor; });
      this.modelConfig.toolRpySi = (configuration.toolRpy || [0, 0, 0])
        .map(function (value) { return value * angleFactor; });
      if (this.stateLabel) {
        this.stateLabel.textContent = "MODEL READY · " + this.model.activeNames.length + " AXES";
        this.stateLabel.classList.add("is-ready");
      }
      this.frameScene();
    } catch (error) {
      this.model = null;
      if (this.stateLabel) {
        this.stateLabel.textContent = "VIEWER MODEL ERROR";
        this.stateLabel.classList.remove("is-ready");
        this.stateLabel.title = error.message;
      }
    }
    this.requestDraw();
  };

  Viewer.prototype.setTrajectory = function (result, waypointCsv, space) {
    this.samples = Array.isArray(result && result.samples) ? result.samples : [];
    this.duration = Number(result && result.summary && result.summary.durationS) ||
      (this.samples.length ? Number(this.samples[this.samples.length - 1].timeS) : 0);
    this.currentTime = 0;
    this.playing = false;
    this.hasCorrections = Array.isArray(result && result.corrections) &&
      result.corrections.length > 0;
    var stride = Math.max(1, Math.ceil(this.samples.length / 1800));
    this.actualPath = this.samples.filter(function (_sample, index) {
      return index % stride === 0;
    }).map(function (sample) {
      return sample.tcp && sample.tcp.positionM;
    }).filter(Boolean);
    if (this.samples.length && this.actualPath[this.actualPath.length - 1] !==
        this.samples[this.samples.length - 1].tcp.positionM) {
      this.actualPath.push(this.samples[this.samples.length - 1].tcp.positionM);
    }
    this.waypointPath = this.parseWaypointPath(waypointCsv, space);
    if (this.slider) {
      this.slider.min = "0";
      this.slider.max = String(this.duration);
      this.slider.step = String(Math.max(0.0001, this.duration / 10000));
      this.slider.value = "0";
    }
    if (this.stateLabel) {
      this.stateLabel.textContent = "TRAJECTORY READY · " + this.samples.length +
        " SAMPLES" + (this.hasCorrections ? " · CORRECTED TCP" : "");
      this.stateLabel.classList.add("is-ready");
    }
    this.frameScene();
    this.syncControls();
    this.requestDraw();
  };

  Viewer.prototype.parseWaypointPath = function (text, space) {
    if (!this.model) return [];
    try {
      var rows = csvRows(text);
      if (rows.length < 2) return [];
      var header = rows[0].map(function (value) { return value.toLowerCase(); });
      var viewer = this;
      var lengthFactor = this.modelConfig.lengthUnit === "mm" ? 0.001 : 1;
      var angleFactor = this.modelConfig.angleUnit === "deg" ? PI / 180 : 1;
      return rows.slice(1).map(function (row) {
        if (space === "cartesian") {
          function value(names) {
            for (var nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
              var column = header.indexOf(names[nameIndex]);
              if (column !== -1) return Number(row[column]);
            }
            return 0;
          }
          return [value(["px", "x"]) * lengthFactor,
            value(["py", "y"]) * lengthFactor,
            value(["pz", "z"]) * lengthFactor];
        }
        var q = viewer.model.activeNames.map(function (name) {
          var column = header.indexOf(("q_" + name).toLowerCase());
          var joint = viewer.model.joints.find(function (item) { return item.name === name; });
          var factor = joint && joint.type === "prismatic" ? lengthFactor : angleFactor;
          return column === -1 ? 0 : Number(row[column]) * factor;
        });
        return modelPose(viewer.model, q, viewer.modelConfig.toolXyzSi,
          viewer.modelConfig.toolRpySi).tcp;
      }).filter(function (point) {
        return point.every(Number.isFinite);
      });
    } catch (_error) {
      return [];
    }
  };

  Viewer.prototype.clear = function () {
    this.playing = false;
    this.samples = [];
    this.actualPath = [];
    this.waypointPath = [];
    this.hasCorrections = false;
    this.currentTime = 0;
    this.duration = 0;
    this.model = null;
    if (this.stateLabel) {
      this.stateLabel.textContent = "AWAITING MODEL";
      this.stateLabel.classList.remove("is-ready");
    }
    this.syncControls();
    this.requestDraw();
  };

  Viewer.prototype.sampleAt = function (time) {
    if (!this.samples.length) return null;
    if (time <= Number(this.samples[0].timeS)) return this.samples[0];
    if (time >= Number(this.samples[this.samples.length - 1].timeS)) {
      return this.samples[this.samples.length - 1];
    }
    var low = 0;
    var high = this.samples.length - 1;
    while (low + 1 < high) {
      var middle = Math.floor((low + high) / 2);
      if (Number(this.samples[middle].timeS) <= time) low = middle;
      else high = middle;
    }
    var first = this.samples[low];
    var second = this.samples[high];
    var interval = Number(second.timeS) - Number(first.timeS);
    var ratio = interval > 0 ? (time - Number(first.timeS)) / interval : 0;
    var interpolated = Object.assign({}, first);
    interpolated.qSi = first.qSi.map(function (value, index) {
      return value + ratio * (second.qSi[index] - value);
    });
    if (first.tcp && second.tcp && Array.isArray(first.tcp.positionM) &&
        Array.isArray(second.tcp.positionM)) {
      interpolated.tcp = Object.assign({}, first.tcp, {
        positionM: first.tcp.positionM.map(function (value, index) {
          return value + ratio * (second.tcp.positionM[index] - value);
        })
      });
    }
    return interpolated;
  };

  Viewer.prototype.scenePoints = function () {
    var points = this.actualPath.concat(this.waypointPath);
    if (this.model) {
      var sample = this.sampleAt(this.currentTime);
      var q = sample ? sample.qSi : new Array(this.model.activeNames.length).fill(0);
      points = points.concat(modelPose(this.model, q,
        this.modelConfig.toolXyzSi, this.modelConfig.toolRpySi).points);
    }
    return points.length ? points : [[0, 0, 0], [0.4, 0.4, 0.4]];
  };

  Viewer.prototype.frameScene = function () {
    var points = this.scenePoints();
    var minimum = [Infinity, Infinity, Infinity];
    var maximum = [-Infinity, -Infinity, -Infinity];
    points.forEach(function (point) {
      for (var axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], point[axis]);
        maximum[axis] = Math.max(maximum[axis], point[axis]);
      }
    });
    this.camera.target = vecScale(vecAdd(minimum, maximum), 0.5);
    var span = Math.max(maximum[0] - minimum[0], maximum[1] - minimum[1],
      maximum[2] - minimum[2], 0.2);
    this.camera.distance = span * 2.7;
    this.camera.yaw = -0.8;
    this.camera.pitch = 0.38;
  };

  Viewer.prototype.projector = function () {
    var camera = this.camera;
    var horizontal = Math.cos(camera.pitch);
    var position = vecAdd(camera.target, vecScale([
      horizontal * Math.cos(camera.yaw),
      horizontal * Math.sin(camera.yaw),
      Math.sin(camera.pitch)
    ], camera.distance));
    var forward = vecNormalize(vecSubtract(camera.target, position), [0, 0, -1]);
    var right = vecNormalize(vecCross(forward, [0, 0, 1]), [1, 0, 0]);
    var up = vecNormalize(vecCross(right, forward), [0, 1, 0]);
    var width = this.canvas.width;
    var height = this.canvas.height;
    var focal = 0.5 * Math.min(width, height) / Math.tan(50 * PI / 360);
    return function (point) {
      var relative = vecSubtract(point, position);
      var depth = vecDot(relative, forward);
      if (depth <= 0.005) return { visible: false, depth: depth };
      return {
        visible: true,
        x: width * 0.5 + focal * vecDot(relative, right) / depth,
        y: height * 0.5 - focal * vecDot(relative, up) / depth,
        depth: depth,
        scale: focal / depth
      };
    };
  };

  Viewer.prototype.drawPolyline = function (points, projector, style) {
    if (points.length < 2) return;
    var context = this.context;
    context.save();
    context.strokeStyle = style.color;
    context.lineWidth = style.width;
    context.globalAlpha = style.alpha === undefined ? 1 : style.alpha;
    context.setLineDash(style.dash || []);
    context.beginPath();
    var started = false;
    points.forEach(function (point) {
      var projected = projector(point);
      if (!projected.visible) {
        started = false;
        return;
      }
      if (!started) context.moveTo(projected.x, projected.y);
      else context.lineTo(projected.x, projected.y);
      started = true;
    });
    context.stroke();
    context.restore();
  };

  Viewer.prototype.draw = function () {
    if (!this.context) return;
    var context = this.context;
    var width = this.canvas.width;
    var height = this.canvas.height;
    context.clearRect(0, 0, width, height);
    var gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#101b25");
    gradient.addColorStop(1, "#071015");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    var projector = this.projector();
    var span = Math.max(0.25, this.camera.distance * 0.55);
    var gridCenter = this.camera.target;
    var gridStep = Math.pow(10, Math.floor(Math.log10(span / 5)));
    if (span / gridStep > 10) gridStep *= 2;
    var gridLines = Math.min(20, Math.ceil(span / gridStep));
    for (var index = -gridLines; index <= gridLines; index += 1) {
      var offset = index * gridStep;
      this.drawPolyline([
        [gridCenter[0] - span, gridCenter[1] + offset, 0],
        [gridCenter[0] + span, gridCenter[1] + offset, 0]
      ], projector, { color: "#7592a3", width: 1, alpha: 0.12 });
      this.drawPolyline([
        [gridCenter[0] + offset, gridCenter[1] - span, 0],
        [gridCenter[0] + offset, gridCenter[1] + span, 0]
      ], projector, { color: "#7592a3", width: 1, alpha: 0.12 });
    }
    var axisLength = span * 0.22;
    this.drawPolyline([[0, 0, 0], [axisLength, 0, 0]], projector,
      { color: "#ff6565", width: 2, alpha: 0.8 });
    this.drawPolyline([[0, 0, 0], [0, axisLength, 0]], projector,
      { color: "#65d785", width: 2, alpha: 0.8 });
    this.drawPolyline([[0, 0, 0], [0, 0, axisLength]], projector,
      { color: "#58a6ff", width: 2, alpha: 0.8 });

    this.drawPolyline(this.waypointPath, projector,
      { color: "#ffb65c", width: 2.5, alpha: 0.65, dash: [8, 7] });
    this.drawPolyline(this.actualPath, projector,
      { color: "#58d5ff", width: 3.5, alpha: 0.92 });
    this.waypointPath.forEach(function (point) {
      var projected = projector(point);
      if (!projected.visible) return;
      context.beginPath();
      context.arc(projected.x, projected.y, 5, 0, 2 * PI);
      context.fillStyle = "#ffb65c";
      context.fill();
      context.strokeStyle = "#251708";
      context.lineWidth = 1.5;
      context.stroke();
    });

    if (this.model) {
      var sample = this.sampleAt(this.currentTime);
      var q = sample ? sample.qSi : new Array(this.model.activeNames.length).fill(0);
      var pose = modelPose(this.model, q,
        this.modelConfig.toolXyzSi, this.modelConfig.toolRpySi);
      var segments = [];
      for (var segment = 0; segment + 1 < pose.points.length; segment += 1) {
        var first = projector(pose.points[segment]);
        var second = projector(pose.points[segment + 1]);
        if (first.visible && second.visible) {
          segments.push({ first: first, second: second,
            depth: (first.depth + second.depth) * 0.5 });
        }
      }
      segments.sort(function (first, second) { return second.depth - first.depth; });
      segments.forEach(function (item, segmentIndex) {
        var linkWidth = Math.max(4, Math.min(13,
          0.012 * (item.first.scale + item.second.scale)));
        context.beginPath();
        context.moveTo(item.first.x, item.first.y);
        context.lineTo(item.second.x, item.second.y);
        context.strokeStyle = "rgba(0,0,0,.48)";
        context.lineWidth = linkWidth + 3;
        context.lineCap = "round";
        context.stroke();
        context.strokeStyle = segmentIndex % 2 ? "#d8e2e8" : "#f1f5f7";
        context.lineWidth = linkWidth;
        context.stroke();
      });
      pose.joints.forEach(function (joint) {
        var projected = projector(joint.point);
        if (!projected.visible) return;
        var radius = Math.max(4, Math.min(9, projected.scale * 0.012));
        context.beginPath();
        context.arc(projected.x, projected.y, radius, 0, 2 * PI);
        context.fillStyle = "#ff9f43";
        context.fill();
        context.strokeStyle = "#3b210b";
        context.lineWidth = 1.5;
        context.stroke();
      });
      var authoritativeTcp = sample && sample.tcp &&
        Array.isArray(sample.tcp.positionM) ? sample.tcp.positionM : pose.tcp;
      if (vecNorm(vecSubtract(authoritativeTcp, pose.tcp)) > 1e-7) {
        this.drawPolyline([pose.tcp, authoritativeTcp], projector,
          { color: "#ffb65c", width: 2, alpha: 0.75, dash: [5, 4] });
      }
      var tcp = projector(authoritativeTcp);
      if (tcp.visible) {
        context.beginPath();
        context.arc(tcp.x, tcp.y, 7, 0, 2 * PI);
        context.fillStyle = "#58d5ff";
        context.fill();
        context.strokeStyle = "#e8fbff";
        context.lineWidth = 2;
        context.stroke();
      }
    } else {
      context.fillStyle = "rgba(225,238,245,.72)";
      context.font = Math.max(14, width / 45) + "px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("载入并预检模型后显示机器人骨架", width / 2, height / 2);
    }
    this.syncControls();
  };

  Viewer.prototype.syncControls = function () {
    if (this.playButton) {
      this.playButton.textContent = this.playing ? "暂停" : "播放";
      this.playButton.disabled = !this.samples.length;
    }
    if (this.slider) this.slider.value = String(this.currentTime);
    if (this.timeLabel) {
      this.timeLabel.textContent = this.currentTime.toFixed(3) + " / " +
        this.duration.toFixed(3) + " s";
    }
  };

  Viewer.prototype.requestDraw = function () {
    var viewer = this;
    if (this.animationFrame !== null) return;
    this.animationFrame = requestAnimationFrame(function (timestamp) {
      viewer.animationFrame = null;
      if (viewer.playing) {
        var delta = Math.max(0, (timestamp - viewer.lastFrame) / 1000);
        viewer.lastFrame = timestamp;
        var speed = Number(viewer.speed && viewer.speed.value) || 1;
        viewer.currentTime += delta * speed;
        if (viewer.currentTime >= viewer.duration) {
          viewer.currentTime = viewer.duration;
          viewer.playing = false;
        }
      }
      viewer.draw();
      if (viewer.playing) viewer.requestDraw();
    });
  };

  window.TrajectoryViewer = function (root) {
    return new Viewer(root);
  };
}());
