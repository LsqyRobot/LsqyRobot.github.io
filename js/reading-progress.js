(function () {
    'use strict';

    function initReadingProgress() {
        var meter = document.getElementById('readingProgress');
        if (!meter || meter.dataset.initialized === 'true') {
            return;
        }

        var targetSelector = meter.getAttribute('data-reading-target') || '.post-article-content';
        var article = document.querySelector(targetSelector);
        var fill = meter.querySelector('.reading-progress-fill');
        var label = meter.querySelector('.reading-progress-label');

        if (!article || !fill || !label) {
            return;
        }

        meter.dataset.initialized = 'true';
        meter.hidden = false;

        var articleTop = 0;
        var articleHeight = 1;
        var articleEnd = 1;
        var framePending = false;
        var lastRoundedPercent = -1;

        function interpolateColor(from, to, amount) {
            return from.map(function (channel, index) {
                return Math.round(channel + ((to[index] - channel) * amount));
            });
        }

        function colorForRatio(ratio) {
            var cyan = [24, 191, 239];
            var mint = [149, 225, 211];
            var coral = [243, 129, 129];

            if (ratio <= 0.5) {
                return interpolateColor(cyan, mint, ratio * 2);
            }

            return interpolateColor(mint, coral, (ratio - 0.5) * 2);
        }

        function getScrollTop() {
            return window.scrollY || window.pageYOffset ||
                document.documentElement.scrollTop || document.body.scrollTop || 0;
        }

        function measureArticle() {
            var scrollTop = getScrollTop();
            var rect = article.getBoundingClientRect();
            articleTop = rect.top + scrollTop;
            articleHeight = Math.max(rect.height, article.scrollHeight, 1);
            articleEnd = Math.max(articleTop + articleHeight - window.innerHeight, articleTop + 1);
        }

        function renderProgress() {
            framePending = false;

            // Start when the article reaches the viewport top and finish when
            // its final screen is visible. The cover and footer are excluded.
            var ratio = (getScrollTop() - articleTop) / (articleEnd - articleTop);
            ratio = Math.max(0, Math.min(1, ratio));

            var percent = Math.round(ratio * 100);
            var rgb = colorForRatio(ratio);
            var color = 'rgb(' + rgb.join(', ') + ')';
            var shadow = 'rgba(' + rgb.join(', ') + ', 0.38)';

            fill.style.transform = 'scaleX(' + ratio.toFixed(5) + ')';
            meter.style.setProperty('--reading-progress-color', color);
            meter.style.setProperty('--reading-progress-shadow', shadow);
            meter.classList.toggle('is-complete', percent === 100);

            if (percent !== lastRoundedPercent) {
                lastRoundedPercent = percent;
                label.textContent = percent + '%';
                meter.setAttribute('aria-valuenow', String(percent));
                meter.setAttribute('aria-valuetext', '已阅读 ' + percent + '%');
            }
        }

        function requestRender() {
            if (framePending) {
                return;
            }

            framePending = true;
            window.requestAnimationFrame(renderProgress);
        }

        function remeasureAndRender() {
            measureArticle();
            requestRender();
        }

        window.addEventListener('scroll', requestRender, { passive: true });
        window.addEventListener('resize', remeasureAndRender, { passive: true });
        window.addEventListener('load', remeasureAndRender, { passive: true });
        window.addEventListener('pageshow', remeasureAndRender, { passive: true });
        document.addEventListener('scroll', requestRender, { passive: true, capture: true });

        if ('ResizeObserver' in window) {
            var observer = new ResizeObserver(remeasureAndRender);
            observer.observe(article);
        }

        Array.from(article.querySelectorAll('img')).forEach(function (image) {
            if (!image.complete) {
                image.addEventListener('load', remeasureAndRender, { once: true, passive: true });
                image.addEventListener('error', remeasureAndRender, { once: true, passive: true });
            }
        });

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(remeasureAndRender);
        }

        remeasureAndRender();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReadingProgress, { once: true });
    } else {
        initReadingProgress();
    }
})();
