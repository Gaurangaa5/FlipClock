(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);

    const state = {
        timeFormat: "12",
        seconds: "show",
        ampm: "show",
        animation: "on",
        previousDigits: [],
        timezone: "Unknown"
    };

    const countdown = {
        running: false,
        endTimestamp: 0,
        durationMs: 0,
        lastWholeSecond: null,
        rafId: null
    };

    function safeStorageGet(key) {
        try { return window.localStorage.getItem(key); } catch (_) { return null; }
    }

    function safeStorageSet(key, value) {
        try { window.localStorage.setItem(key, value); } catch (_) {}
    }

    function loadPreferences() {
        const saved = safeStorageGet("offlineFlipClockPreferences");
        if (!saved) return;
        try {
            const parsed = JSON.parse(saved);
            if (parsed && ["12", "24"].includes(parsed.timeFormat)) state.timeFormat = parsed.timeFormat;
            if (parsed && ["show", "hide"].includes(parsed.seconds)) state.seconds = parsed.seconds;
            if (parsed && ["show", "hide"].includes(parsed.ampm)) state.ampm = parsed.ampm;
            if (parsed && ["on", "off"].includes(parsed.animation)) state.animation = parsed.animation;
        } catch (_) {}
    }

    function savePreferences() {
        safeStorageSet("offlineFlipClockPreferences", JSON.stringify({
            timeFormat: state.timeFormat,
            seconds: state.seconds,
            ampm: state.ampm,
            animation: state.animation
        }));
    }

    function detectTimezone() {
        try {
            state.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local device time";
        } catch (_) {
            state.timezone = "Local device time";
        }
        $("timezone").textContent = state.timezone;
        $("fullscreenTimezone").textContent = state.timezone;
    }

    function pad2(value) {
        return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, "0");
    }

    function getClockParts(date) {
        const hours24 = date.getHours();
        let hours = hours24;
        let suffix = "";

        if (state.timeFormat === "12") {
            suffix = hours24 >= 12 ? "PM" : "AM";
            hours = hours24 % 12 || 12;
        }

        return {
            hour: pad2(hours),
            minute: pad2(date.getMinutes()),
            second: pad2(date.getSeconds()),
            suffix
        };
    }

    function buildClockMarkup(parts) {
        const chunks = [parts.hour, parts.minute];
        if (state.seconds === "show") chunks.push(parts.second);

        let html = "";
        chunks.forEach((chunk, groupIndex) => {
            if (groupIndex > 0) html += '<span class="clock-separator" aria-hidden="true">:</span>';
            [...chunk].forEach((digit) => {
                html += `<span class="flip-digit" data-digit="${digit}"><span class="digit-value">${digit}</span></span>`;
            });
        });

        if (state.timeFormat === "12" && state.ampm === "show") {
            html += `<span class="ampm">${parts.suffix}</span>`;
        }
        return html;
    }

    function updateClockElement(element, parts, animate) {
        const desired = [];
        [...parts.hour, ...parts.minute, ...(state.seconds === "show" ? [...parts.second] : [])].forEach((d) => desired.push(d));

        const existing = [...element.querySelectorAll(".flip-digit")];
        const needsRebuild = existing.length !== desired.length ||
            element.querySelector(".ampm")?.textContent !== ((state.timeFormat === "12" && state.ampm === "show") ? parts.suffix : null);

        if (needsRebuild) {
            element.innerHTML = buildClockMarkup(parts);
            return;
        }

        existing.forEach((digitEl, index) => {
            const next = desired[index];
            const valueEl = digitEl.querySelector(".digit-value");
            const current = valueEl.textContent;
            if (current !== next) {
                valueEl.textContent = next;
                digitEl.dataset.digit = next;
                if (animate && state.animation === "on" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                    digitEl.classList.remove("flipping");
                    void digitEl.offsetWidth;
                    digitEl.classList.add("flipping");
                    window.setTimeout(() => digitEl.classList.remove("flipping"), 260);
                }
            }
        });

        const ampmEl = element.querySelector(".ampm");
        if (ampmEl) ampmEl.textContent = parts.suffix;
    }

    function renderClock(date = new Date(), animate = true) {
        const parts = getClockParts(date);
        updateClockElement($("clock"), parts, animate);
        updateClockElement($("fullscreenClock"), parts, animate);

        const dateText = new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(date);

        $("dateLine").textContent = dateText;
        $("fullscreenDate").textContent = dateText;
        state.previousDigits = [...parts.hour, ...parts.minute, ...(state.seconds === "show" ? [...parts.second] : [])];
    }

    function startClockLoop() {
        const tick = () => {
            renderClock(new Date(), true);
            window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
        };
        renderClock(new Date(), false);
        tick();
    }

    function setChecked(name, value) {
        const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (input) input.checked = true;
    }

    function bindSettings() {
        setChecked("timeFormat", state.timeFormat);
        setChecked("seconds", state.seconds);
        setChecked("ampm", state.ampm);
        setChecked("animation", state.animation);

        document.querySelectorAll('input[name="timeFormat"], input[name="seconds"], input[name="ampm"], input[name="animation"]')
            .forEach((input) => {
                input.addEventListener("change", () => {
                    state.timeFormat = document.querySelector('input[name="timeFormat"]:checked').value;
                    state.seconds = document.querySelector('input[name="seconds"]:checked').value;
                    state.ampm = document.querySelector('input[name="ampm"]:checked').value;
                    state.animation = document.querySelector('input[name="animation"]:checked').value;
                    savePreferences();
                    renderClock(new Date(), false);
                });
            });
    }

    function togglePanel(panelId, buttonId) {
        const panel = $(panelId);
        const button = $(buttonId);
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        button.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function bindPanels() {
        $("settingsToggle").addEventListener("click", () => togglePanel("settingsPanel", "settingsToggle"));
        $("countdownToggle").addEventListener("click", () => togglePanel("countdownPanel", "countdownToggle"));

        document.querySelectorAll("[data-close-panel]").forEach((button) => {
            button.addEventListener("click", () => {
                const panelId = button.dataset.closePanel;
                $(panelId).hidden = true;
                const toggleId = panelId === "settingsPanel" ? "settingsToggle" : "countdownToggle";
                $(toggleId).setAttribute("aria-expanded", "false");
            });
        });
    }

    function clampInteger(value, min, max) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return min;
        return Math.min(max, Math.max(min, parsed));
    }

    function readCountdownInputs() {
        const h = clampInteger($("hoursInput").value, 0, 99);
        const m = clampInteger($("minutesInput").value, 0, 59);
        const s = clampInteger($("secondsInput").value, 0, 59);

        $("hoursInput").value = h;
        $("minutesInput").value = m;
        $("secondsInput").value = s;

        return ((h * 60 * 60) + (m * 60) + s) * 1000;
    }

    function formatCountdown(ms) {
        const safeMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
        const totalSeconds = Math.floor(safeMs / 1000);
        const hours = Math.min(99, Math.floor(totalSeconds / 3600));
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${pad2(hours)} : ${pad2(minutes)} : ${pad2(seconds)}`;
    }

    function renderCountdown(ms) {
        $("countdownDisplay").textContent = formatCountdown(ms);
    }

    function stopCountdownLoop() {
        if (countdown.rafId !== null) {
            window.cancelAnimationFrame(countdown.rafId);
            countdown.rafId = null;
        }
    }

    function countdownFrame() {
        if (!countdown.running) return;

        const remaining = Math.max(0, countdown.endTimestamp - Date.now());
        renderCountdown(remaining);

        const wholeSecond = Math.ceil(remaining / 1000);
        if (wholeSecond !== countdown.lastWholeSecond) {
            countdown.lastWholeSecond = wholeSecond;
        }

        if (remaining <= 0) {
            countdown.running = false;
            countdown.durationMs = 0;
            countdown.lastWholeSecond = 0;
            renderCountdown(0);
            $("countdownStatus").textContent = "Countdown finished.";
            stopCountdownLoop();
            return;
        }

        countdown.rafId = window.requestAnimationFrame(countdownFrame);
    }

    function startCountdown() {
        if (countdown.running) return;

        if (countdown.durationMs <= 0) {
            countdown.durationMs = readCountdownInputs();
        }

        if (!Number.isFinite(countdown.durationMs) || countdown.durationMs <= 0) {
            countdown.durationMs = 0;
            renderCountdown(0);
            $("countdownStatus").textContent = "Enter a duration greater than zero.";
            return;
        }

        countdown.endTimestamp = Date.now() + countdown.durationMs;
        countdown.running = true;
        countdown.lastWholeSecond = null;
        $("countdownStatus").textContent = "Countdown running.";
        stopCountdownLoop();
        countdown.rafId = window.requestAnimationFrame(countdownFrame);
    }

    function pauseCountdown() {
        if (!countdown.running) return;
        const remaining = Math.max(0, countdown.endTimestamp - Date.now());
        countdown.durationMs = remaining;
        countdown.running = false;
        renderCountdown(remaining);
        $("countdownStatus").textContent = "Countdown paused.";
        stopCountdownLoop();
    }

    function resetCountdown() {
        countdown.running = false;
        stopCountdownLoop();
        countdown.durationMs = readCountdownInputs();
        renderCountdown(countdown.durationMs);
        $("countdownStatus").textContent = "";
    }

    function bindCountdown() {
        ["hoursInput", "minutesInput", "secondsInput"].forEach((id) => {
            $(id).addEventListener("input", () => {
                if (!countdown.running) {
                    countdown.durationMs = readCountdownInputs();
                    renderCountdown(countdown.durationMs);
                    $("countdownStatus").textContent = "";
                }
            });
            $(id).addEventListener("blur", () => {
                if (!countdown.running) resetCountdown();
            });
        });

        $("startCountdown").addEventListener("click", startCountdown);
        $("pauseCountdown").addEventListener("click", pauseCountdown);
        $("resetCountdown").addEventListener("click", resetCountdown);

        countdown.durationMs = readCountdownInputs();
        renderCountdown(countdown.durationMs);
    }

    function enterFullscreenDisplay() {
        $("fullscreenOverlay").classList.add("is-active");
        $("fullscreenOverlay").setAttribute("aria-hidden", "false");
        document.body.classList.add("fullscreen-mode");
        $("fullscreenExit").focus({ preventScroll: true });

        // Optional enhancement only. The CSS/DOM mode remains the real fullscreen mechanism.
        if (document.documentElement.requestFullscreen) {
            try {
                const promise = document.documentElement.requestFullscreen();
                if (promise && typeof promise.catch === "function") promise.catch(() => {});
            } catch (_) {}
        }
    }

    function exitFullscreenDisplay() {
        $("fullscreenOverlay").classList.remove("is-active");
        $("fullscreenOverlay").setAttribute("aria-hidden", "true");
        document.body.classList.remove("fullscreen-mode");

        if (document.fullscreenElement && document.exitFullscreen) {
            try {
                const promise = document.exitFullscreen();
                if (promise && typeof promise.catch === "function") promise.catch(() => {});
            } catch (_) {}
        }

        $("fullscreenButton").focus({ preventScroll: true });
    }

    function bindFullscreen() {
        $("fullscreenButton").addEventListener("click", enterFullscreenDisplay);
        $("fullscreenExit").addEventListener("click", exitFullscreenDisplay);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && $("fullscreenOverlay").classList.contains("is-active")) {
                event.preventDefault();
                exitFullscreenDisplay();
            }
        });

        document.addEventListener("fullscreenchange", () => {
            // Browser fullscreen can end via Escape; keep the custom mode coherent.
            if (!document.fullscreenElement && $("fullscreenOverlay").classList.contains("is-active")) {
                // Do not immediately close: the custom DOM fullscreen remains valid.
            }
        });
    }

    function init() {
        loadPreferences();
        detectTimezone();
        bindSettings();
        bindPanels();
        bindCountdown();
        bindFullscreen();
        startClockLoop();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
