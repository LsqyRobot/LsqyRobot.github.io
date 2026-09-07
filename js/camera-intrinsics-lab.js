(function () {
    'use strict';

    var namespace = 'http://www.w3.org/2000/svg';
    var defaults = { fx: 600, fy: 600, cx: 320, cy: 240, z: 2 };
    var limits = { fx: [200, 1200], fy: [200, 1200], cx: [0, 639], cy: [0, 479], z: [0.5, 5] };
    var clipIndex = 0;

    function svgElement(name, attributes, text) {
        var element = document.createElementNS(namespace, name);
        Object.keys(attributes).forEach(function (key) { element.setAttribute(key, attributes[key]); });
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function initLab(root) {
        if (root.dataset.cameraReady === 'true') return;
        var image = root.querySelector('[data-camera-image]');
        var square = root.querySelector('[data-camera-square]');
        var point = root.querySelector('[data-camera-point]');
        var principal = root.querySelector('[data-camera-principal]');
        var readout = root.querySelector('[data-camera-readout]');
        var fov = root.querySelector('[data-camera-fov]');
        if (!image || !square || !point || !principal) return;

        var inputs = {};
        var outputs = {};
        Object.keys(defaults).forEach(function (key) {
            inputs[key] = root.querySelector('[data-camera-param="' + key + '"]');
            outputs[key] = root.querySelector('[data-camera-value="' + key + '"]');
        });

        var grid = root.querySelector('[data-camera-grid]');
        if (!grid) {
            grid = svgElement('g', { 'data-camera-grid': '' });
            image.insertBefore(grid, image.firstChild);
        }
        var drawing = document.createDocumentFragment();
        drawing.appendChild(svgElement('rect', {
            x: -0.5, y: -0.5, width: 640, height: 480,
            fill: '#f8fafc', stroke: '#66788a', 'stroke-width': 1.5
        }));
        for (var x = 80; x < 640; x += 80) {
            drawing.appendChild(svgElement('line', { x1: x, y1: 0, x2: x, y2: 479, stroke: '#dce4eb', 'stroke-width': 1 }));
        }
        for (var y = 80; y < 480; y += 80) {
            drawing.appendChild(svgElement('line', { x1: 0, y1: y, x2: 639, y2: y, stroke: '#dce4eb', 'stroke-width': 1 }));
        }
        drawing.appendChild(svgElement('path', {
            d: 'M 0 479 V 0 H 639 M 630 -5 L 639 0 L 630 5 M -5 470 L 0 479 L 5 470',
            fill: 'none', stroke: '#40566c', 'stroke-width': 1.5
        }));
        drawing.appendChild(svgElement('circle', { cx: 0, cy: 0, r: 3, fill: '#40566c' }));
        [
            [7, -7, 'start', '(0, 0)'],
            [637, -7, 'end', 'u / px'],
            [12, 460, 'start', 'v / px'],
            [320, 502, 'middle', '320'],
            [639, 502, 'end', '639'],
            [7, 245, 'start', '240'],
            [7, 502, 'start', '479']
        ].forEach(function (tick) {
            drawing.appendChild(svgElement('text', {
                x: tick[0], y: tick[1], 'text-anchor': tick[2], fill: '#40566c', 'font-size': 18
            }, tick[3]));
        });
        grid.replaceChildren(drawing);

        var clipId;
        do { clipId = 'camera-lab-image-clip-' + (++clipIndex); } while (document.getElementById(clipId));
        var definitions = svgElement('defs', {});
        var clip = svgElement('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
        clip.appendChild(svgElement('rect', { x: -0.5, y: -0.5, width: 640, height: 480 }));
        definitions.appendChild(clip);
        image.insertBefore(definitions, image.firstChild);
        square.setAttribute('clip-path', 'url(#' + clipId + ')');
        point.setAttribute('clip-path', 'url(#' + clipId + ')');

        if (!principal.children.length) {
            principal.appendChild(svgElement('path', { d: 'M -9 0 H 9 M 0 -9 V 9', fill: 'none' }));
        }

        function render() {
            var parameters = {};
            Object.keys(defaults).forEach(function (key) {
                var value = inputs[key] ? Number(inputs[key].value) : defaults[key];
                if (!Number.isFinite(value)) value = defaults[key];
                parameters[key] = Math.max(limits[key][0], Math.min(limits[key][1], value));
                if (outputs[key]) outputs[key].textContent = parameters[key].toFixed(key === 'z' ? 1 : 0);
            });

            var u = parameters.fx * 0.2 / parameters.z + parameters.cx;
            var v = parameters.fy * 0.1 / parameters.z + parameters.cy;
            var projectedWidth = parameters.fx * 0.6 / parameters.z;
            var projectedHeight = parameters.fy * 0.6 / parameters.z;
            var inside = u >= -0.5 && u < 639.5 && v >= -0.5 && v < 479.5;
            square.setAttribute('x', u - projectedWidth / 2);
            square.setAttribute('y', v - projectedHeight / 2);
            square.setAttribute('width', projectedWidth);
            square.setAttribute('height', projectedHeight);
            point.setAttribute('cx', u);
            point.setAttribute('cy', v);
            principal.setAttribute('transform', 'translate(' + parameters.cx + ' ' + parameters.cy + ')');
            root.dataset.cameraInside = String(inside);

            if (readout) {
                readout.textContent = 'P 的投影：(u, v) = (' + u.toFixed(2) + ', ' + v.toFixed(2) + ') px，'
                    + (inside ? '位于图像内。' : '位于图像外。')
                    + '正方形投影尺寸：' + projectedWidth.toFixed(2) + ' × ' + projectedHeight.toFixed(2) + ' px。';
            }
            if (fov) {
                var horizontal = Math.atan((639.5 - parameters.cx) / parameters.fx) - Math.atan((-0.5 - parameters.cx) / parameters.fx);
                var vertical = Math.atan((479.5 - parameters.cy) / parameters.fy) - Math.atan((-0.5 - parameters.cy) / parameters.fy);
                fov.textContent = '水平视场角：' + (horizontal * 180 / Math.PI).toFixed(2) + '°；垂直视场角：'
                    + (vertical * 180 / Math.PI).toFixed(2) + '°。';
            }
        }

        Object.keys(inputs).forEach(function (key) {
            if (inputs[key]) inputs[key].addEventListener('input', render);
        });
        var reset = root.querySelector('[data-camera-reset]');
        if (reset) {
            reset.addEventListener('click', function (event) {
                event.preventDefault();
                Object.keys(inputs).forEach(function (key) { if (inputs[key]) inputs[key].value = defaults[key]; });
                render();
            });
        }
        render();
        root.dataset.cameraReady = 'true';
    }

    function init() { document.querySelectorAll('[data-camera-lab]').forEach(initLab); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
