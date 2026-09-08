(function () {
    'use strict';

    function initIntro() {
        var intro = document.querySelector('#intro.home-hero');
        if (!intro || intro.dataset.textReady === 'true') return;
        intro.dataset.textReady = 'true';

        var preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        var animations = [];

        // Normal links and all lettering remain readable without animation support.
        var next = intro.querySelector('.intro-continue');
        if (next) next.addEventListener('click', function (event) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            var header = document.getElementById('header');
            if (!header) return;
            event.preventDefault();
            if (!header.hasAttribute('tabindex')) header.setAttribute('tabindex', '-1');
            header.focus({ preventScroll: true });
            header.scrollIntoView({ behavior: preference.matches ? 'auto' : 'smooth', block: 'start' });
        });

        if (typeof intro.animate !== 'function') return;

        function clearAnimations() {
            animations.forEach(function (animation) { animation.cancel(); });
            animations = [];
        }

        function reveal(element, delay, isCharacter) {
            if (!element) return;
            var animation = element.animate([
                { opacity: 0, transform: 'translateY(' + (isCharacter ? 12 : 16) + 'px)', filter: 'blur(' + (isCharacter ? 5 : 3) + 'px)' },
                { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
            ], {
                duration: isCharacter ? 850 : 1000,
                delay: delay,
                easing: 'cubic-bezier(.22, 1, .36, 1)',
                fill: 'backwards'
            });
            animations.push(animation);
            if (document.hidden) animation.pause();
        }

        function play() {
            clearAnimations();
            if (preference.matches) return;
            intro.querySelectorAll('.intro-character').forEach(function (character, index) {
                reveal(character, index * 110, true);
            });
            // Fade complete English lines to preserve the joins in the script font.
            reveal(intro.querySelector('[data-intro-line="first"]'), 1200, false);
            reveal(intro.querySelector('[data-intro-line="second"]'), 2050, false);
            reveal(intro.querySelector('[data-intro-line="motto"]'), 2950, false);
        }

        function updatePreference() {
            if (preference.matches) clearAnimations();
        }

        if (preference.addEventListener) preference.addEventListener('change', updatePreference);
        else preference.addListener(updatePreference);

        document.addEventListener('visibilitychange', function () {
            animations.forEach(function (animation) {
                if (document.hidden && animation.playState === 'running') animation.pause();
                else if (!document.hidden && animation.playState === 'paused') animation.play();
            });
        });

        play();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initIntro, { once: true });
    else initIntro();
})();
