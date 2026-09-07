(function () {
    'use strict';

    function initProfile() {
        var sentence = document.querySelector('#home-profile .home-profile-description');
        if (!sentence || sentence.dataset.typewriterReady === 'true') return;
        var text = sentence.textContent;
        if (!text.trim() || !window.matchMedia) return;

        var preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        var letters = typeof Intl !== 'undefined' && Intl.Segmenter
            ? Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text), function (part) { return part.segment; })
            : Array.from(text);
        var fragment = document.createDocumentFragment();
        var characters = letters.map(function (letter) {
            var character = document.createElement('span');
            character.className = 'home-profile-character';
            character.textContent = letter;
            fragment.appendChild(character);
            return character;
        });

        // Keep every character in normal flow: copying and assistive technology
        // get the full sentence, and typing never changes line wrapping/height.
        // With JavaScript disabled, the original server-rendered text is visible.
        sentence.replaceChildren(fragment);
        sentence.dataset.typewriterReady = 'true';
        sentence.tabIndex = 0;

        var count = preference.matches ? characters.length : 0;
        var timer = null;
        var hovered = sentence.matches(':hover');
        var focused = sentence.contains(document.activeElement);
        var pageHidden = false;
        var inView = typeof window.IntersectionObserver !== 'function';

        function paused() {
            return preference.matches || document.hidden || pageHidden || !inView || hovered || focused;
        }

        function paint() {
            var typing = count > 0 && count < characters.length && !paused();
            characters.forEach(function (character, index) {
                character.classList.toggle('is-visible', index < count);
                character.classList.toggle('is-cursor', typing && index === count - 1);
            });
        }

        function schedule() {
            if (timer !== null) window.clearTimeout(timer);
            timer = null;
            paint();
            if (paused()) return;
            // The five-second reading pause begins only after the last letter.
            timer = window.setTimeout(function () {
                timer = null;
                if (paused()) return;
                count = count === characters.length ? 1 : count + 1;
                schedule();
            }, count < characters.length ? 100 : 5000);
        }

        function resume() {
            if (count === 0 && !paused()) count = 1;
            schedule();
        }

        function finishForReading() {
            count = characters.length;
            schedule();
        }

        sentence.addEventListener('mouseenter', function () {
            hovered = true;
            finishForReading();
        });
        sentence.addEventListener('mouseleave', function () {
            hovered = false;
            resume();
        });
        sentence.addEventListener('focusin', function () {
            focused = true;
            finishForReading();
        });
        sentence.addEventListener('focusout', function (event) {
            if (sentence.contains(event.relatedTarget)) return;
            focused = false;
            resume();
        });

        function updatePreference() {
            if (preference.matches) count = characters.length;
            resume();
        }
        if (preference.addEventListener) preference.addEventListener('change', updatePreference);
        else preference.addListener(updatePreference);
        document.addEventListener('visibilitychange', resume);
        window.addEventListener('pagehide', function () { pageHidden = true; schedule(); });
        window.addEventListener('pageshow', function () { pageHidden = false; resume(); });

        if (typeof window.IntersectionObserver === 'function') {
            var observer = new window.IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.target !== sentence) return;
                    inView = entry.isIntersecting;
                    resume();
                });
            });
            observer.observe(sentence);
        }
        if (hovered || focused) count = characters.length;
        resume();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfile, { once: true });
    else initProfile();
})();
