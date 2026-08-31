/* Legacy Web Audio equalizer and visualizer runtime.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

	        // --- ADVANCED AUDIO (EQ & VISUALIZER) ---
	        function getEqSettingsSnapshot() {
	            const current = getAppSettings();
	            const saved = current?.audio?.equalizer || {};
	            const preset = sanitizeEqPresetName(saved.preset, { allowCustom: true });
	            const bands = preset === EQ_CUSTOM_PRESET
	                ? sanitizeEqBandValues(saved.bands, getDefaultEqBandValues())
	                : sanitizeEqBandValues(EQ_PRESETS[preset], getDefaultEqBandValues());
	            return {
	                preset,
	                bands
	            };
	        }

	        function setEqSettingsSnapshot(preset = EQ_DEFAULT_PRESET, bands = getDefaultEqBandValues(), options = {}) {
	            const opts = { persist: true, immediate: false, ...options };
	            const current = getAppSettings();
	            const safePreset = sanitizeEqPresetName(preset, { allowCustom: true });
	            const safeBands = sanitizeEqBandValues(bands, getDefaultEqBandValues());
	            state.appSettings = sanitizeAppSettings({
	                ...current,
	                audio: {
	                    ...(current.audio || {}),
	                    equalizer: {
	                        preset: safePreset,
	                        bands: safeBands
	                    }
	                }
	            });
	            if (!opts.persist) return;
	            if (eqRuntime.persistTimer) {
	                clearTimeout(eqRuntime.persistTimer);
	                eqRuntime.persistTimer = null;
	            }
	            if (opts.immediate) {
	                persistAppStateNow();
	                return;
	            }
	            eqRuntime.persistTimer = setTimeout(() => {
	                eqRuntime.persistTimer = null;
	                persistAppStateNow();
	            }, 120);
	        }

	        function getEqPresetSelectElement() {
	            if (eqRuntime.selectEl && document.body.contains(eqRuntime.selectEl)) return eqRuntime.selectEl;
	            eqRuntime.selectEl = document.getElementById('eq-preset-select');
	            return eqRuntime.selectEl;
	        }

	        function setEqPresetSelectValue(preset = EQ_DEFAULT_PRESET) {
	            const select = getEqPresetSelectElement();
	            if (!select) return;
	            const safePreset = sanitizeEqPresetName(preset, { allowCustom: true });
	            const hasOption = Array.from(select.options || []).some((option) => option.value === safePreset);
	            if (!hasOption) return;
	            if (select.value !== safePreset) {
	                select.value = safePreset;
	            }
	        }

	        function updateEqDbLabel(index = 0, value = 0) {
	            const label = eqRuntime.dbEls[index] || document.getElementById(`eq-db-${index}`);
	            if (!label) return;
	            const next = formatEqDb(value);
	            if (label.textContent !== next) label.textContent = next;
	        }

	        function applyEqGainToFilter(index = 0, value = 0, options = {}) {
	            const opts = { smooth: true, ...options };
	            const filter = eqFilters[index];
	            if (!filter || !filter.gain) return false;
	            const target = clamp(Number(value) || 0, EQ_MIN_DB, EQ_MAX_DB);
	            return safeCall(() => {
	                if (audioCtx && audioCtx.state !== 'closed' && opts.smooth !== false && typeof filter.gain.setTargetAtTime === 'function') {
	                    const now = Number(audioCtx.currentTime || 0);
	                    filter.gain.cancelScheduledValues(now);
	                    filter.gain.setTargetAtTime(target, now, EQ_GAIN_SMOOTH_TIME);
	                } else {
	                    filter.gain.value = target;
	                }
	                return true;
	            }, false);
	        }

	        function applyEqBandsToFilters(values = null, options = {}) {
	            const opts = { smooth: true, ...options };
	            const bands = sanitizeEqBandValues(values, eqRuntime.bands);
	            eqRuntime.bands = bands.slice();
	            bands.forEach((value, index) => {
	                applyEqGainToFilter(index, value, { smooth: opts.smooth });
	            });
	            applyEqHeadroom(bands, { smooth: opts.smooth });
	            return bands;
	        }

	        function syncEqSliderUi(values = null) {
	            const bands = sanitizeEqBandValues(values, eqRuntime.bands);
	            eqRuntime.bands = bands.slice();
	            eqRuntime.sliderEls.forEach((slider, index) => {
	                if (!slider) return;
	                const next = String(bands[index]);
	                if (slider.value !== next) slider.value = next;
	                updateEqDbLabel(index, bands[index]);
	            });
	        }

	        function setEqPresetInternal(name = EQ_DEFAULT_PRESET, options = {}) {
	            const opts = { persist: true, smooth: true, ...options };
	            const preset = sanitizeEqPresetName(name, { allowCustom: true });
	            if (preset === EQ_CUSTOM_PRESET) {
	                eqRuntime.preset = EQ_CUSTOM_PRESET;
	                setEqPresetSelectValue(EQ_CUSTOM_PRESET);
	                setEqSettingsSnapshot(eqRuntime.preset, eqRuntime.bands, { persist: opts.persist, immediate: false });
	                return;
	            }
	            const values = sanitizeEqBandValues(EQ_PRESETS[preset], getDefaultEqBandValues());
	            eqRuntime.applyingPreset = true;
	            try {
	                eqRuntime.preset = preset;
	                syncEqSliderUi(values);
	                ensureEqualizerGraph({ resume: true, notify: false, smooth: opts.smooth });
	                applyEqBandsToFilters(values, { smooth: opts.smooth });
	            } finally {
	                eqRuntime.applyingPreset = false;
	            }
	            setEqPresetSelectValue(preset);
	            setEqSettingsSnapshot(preset, values, { persist: opts.persist, immediate: false });
	            logAction('eq-preset', 'Equalizer preset applied', { preset });
	        }

	        function handleEqSliderInput(index = 0, value = 0, options = {}) {
	            const opts = { persist: true, ...options };
	            const safeIndex = Math.max(0, Math.min(EQ_FREQUENCIES.length - 1, Number(index) || 0));
	            const safeValue = clamp(Number(value) || 0, EQ_MIN_DB, EQ_MAX_DB);
	            eqRuntime.bands[safeIndex] = safeValue;
	            updateEqDbLabel(safeIndex, safeValue);
	            ensureEqualizerGraph({ resume: true, notify: false, smooth: true });
	            applyEqGainToFilter(safeIndex, safeValue, { smooth: true });
	            applyEqHeadroom(eqRuntime.bands, { smooth: true });
	            if (!eqRuntime.applyingPreset && eqRuntime.preset !== EQ_CUSTOM_PRESET) {
	                eqRuntime.preset = EQ_CUSTOM_PRESET;
	                setEqPresetSelectValue(EQ_CUSTOM_PRESET);
	            }
	            if (opts.persist) {
	                setEqSettingsSnapshot(eqRuntime.preset, eqRuntime.bands, { persist: true, immediate: false });
	            }
	        }

	        function restoreEqualizerState() {
	            const snapshot = getEqSettingsSnapshot();
	            eqRuntime.preset = snapshot.preset;
	            eqRuntime.bands = snapshot.bands.slice();
	            syncEqSliderUi(eqRuntime.bands);
	            setEqPresetSelectValue(eqRuntime.preset);
	            applyEqBandsToFilters(eqRuntime.bands, { smooth: false });
	            setEqSettingsSnapshot(eqRuntime.preset, eqRuntime.bands, { persist: false });
	        }

	        function ensureEqualizerGraph(options = {}) {
	            const opts = { resume: true, notify: false, ...options };
	            const ready = initAudioContext(opts);
	            if (ready) applyEqBandsToFilters(eqRuntime.bands, { smooth: opts.smooth !== false });
	            return ready;
	        }

	        function getEqualizerRuntimeStatus() {
	            return {
	                available: !eqRuntime.audioUnavailable,
	                graphReady: !!eqRuntime.graphReady,
	                contextState: audioCtx?.state || 'none',
	                preset: eqRuntime.preset,
	                bands: eqRuntime.bands.slice(),
	                headroomDb: Number(eqRuntime.headroomDb || 0),
	                filterCount: Array.isArray(eqFilters) ? eqFilters.length : 0,
	                filterTypes: Array.isArray(eqFilters) ? eqFilters.map((filter) => sanitizeText(filter?.type || '')) : [],
	                filterFrequencies: Array.isArray(eqFilters) ? eqFilters.map((filter) => Number(filter?.frequency?.value || 0)) : [],
	                filterGains: Array.isArray(eqFilters) ? eqFilters.map((filter) => Number(filter?.gain?.value || 0)) : [],
	                preampGain: Number(eqPreampNode?.gain?.value || 0)
	            };
	        }

	        function initAudioContext(options = {}) {
	            const opts = { resume: true, notify: true, ...options };
	            if (eqRuntime.audioUnavailable || !els.audio) return false;
	            try {
	                const AC = window.AudioContext || window.webkitAudioContext;
	                if (!AC) throw new Error('Web Audio API is unavailable in this environment.');
	                if (!audioCtx || audioCtx.state === 'closed') {
	                    audioCtx = new AC();
	                    sourceNode = null;
	                    eqPreampNode = null;
	                    gainNode = null;
	                    analyser = null;
	                    eqFilters = [];
	                    eqChainConnected = false;
	                    eqVisualizerStarted = false;
	                } else if (audioCtx.state === 'suspended' && opts.resume !== false) {
	                    safeCall(() => audioCtx.resume());
	                }

	                if (!sourceNode) {
	                    sourceNode = audioCtx.createMediaElementSource(els.audio);
	                }
	                if (!eqPreampNode) {
	                    eqPreampNode = audioCtx.createGain();
	                }
	                if (!gainNode) {
	                    gainNode = audioCtx.createGain();
	                }
	                if (!analyser) {
	                    analyser = audioCtx.createAnalyser();
	                    analyser.fftSize = 1024;
	                    analyser.smoothingTimeConstant = 0.84;
	                    analyser.minDecibels = -90;
	                    analyser.maxDecibels = -18;
	                }
	                if (!Array.isArray(eqFilters) || eqFilters.length !== EQ_FREQUENCIES.length) {
	                    eqFilters = EQ_FREQUENCIES.map((freq, index) => {
	                        const filter = audioCtx.createBiquadFilter();
	                        filter.type = getEqFilterType(index);
	                        filter.frequency.value = freq;
	                        if (filter.Q) filter.Q.value = getEqFilterQ(index);
	                        filter.gain.value = clamp(eqRuntime.bands[index] ?? 0, EQ_MIN_DB, EQ_MAX_DB);
	                        return filter;
	                    });
	                    eqChainConnected = false;
	                }

	                if (!eqChainConnected) {
	                    let prevNode = sourceNode;
	                    prevNode.connect(eqPreampNode);
	                    prevNode = eqPreampNode;
	                    eqFilters.forEach((filter) => {
	                        prevNode.connect(filter);
	                        prevNode = filter;
	                    });
	                    prevNode.connect(analyser);
	                    analyser.connect(gainNode);
	                    gainNode.connect(audioCtx.destination);
	                    eqChainConnected = true;
	                }

	                // Apply persisted EQ curve to the live filter chain without recreating nodes.
	                applyEqBandsToFilters(eqRuntime.bands, { smooth: false });
	                eqRuntime.graphReady = true;
	                if (analyser) ensureVisualizerLoop();
	                if (audioCtx.state === 'suspended' && opts.resume !== false) {
	                    safeCall(() => audioCtx.resume());
	                }
	                return true;
	            } catch (error) {
	                eqRuntime.audioUnavailable = true;
	                eqRuntime.graphReady = false;
	                logError('eq-audio-init', 'Equalizer audio context failed; falling back to normal playback.', {
	                    error: sanitizeText(error?.message || '')
	                });
	                if (opts.notify !== false) showInternalNotice('Equalizer unavailable. Playback continues normally.', 'warn');
	                return false;
	            }
	        }

    function ensureVisualizerLoop() {
        if (eqVisualizerStarted) return true;
        startVisualizer();
        eqVisualizerStarted = true;
        return true;
    }

	        function buildEQ() {
	            const container = document.getElementById('eq-sliders');
	            if (!container) return;
	            container.innerHTML = '';
	            eqRuntime.sliderEls = [];
	            eqRuntime.dbEls = [];
	            eqRuntime.selectEl = document.getElementById('eq-preset-select');
	            EQ_FREQUENCIES.forEach((freq, i) => {
	                const wrap = document.createElement('div');
	                wrap.className = 'eq-band';
	                const dbValue = document.createElement('div');
	                dbValue.className = 'eq-db-label';
	                dbValue.id = `eq-db-${i}`;
	                dbValue.textContent = formatEqDb(eqRuntime.bands[i] ?? 0);
	                const rail = document.createElement('div');
	                rail.className = 'eq-slider-rail';
	                const input = document.createElement('input');
	                input.type = 'range';
	                input.min = String(EQ_MIN_DB);
	                input.max = String(EQ_MAX_DB);
	                input.value = String(clamp(eqRuntime.bands[i] ?? 0, EQ_MIN_DB, EQ_MAX_DB));
	                input.step = 1;
	                input.className = 'range-vertical';
	                input.setAttribute('orient', 'vertical'); // Firefox fix
	                input.setAttribute('aria-label', `${freq >= 1000 ? (freq / 1000) + 'k' : freq} equalizer band`);
	                input.addEventListener('input', (e) => {
	                    handleEqSliderInput(i, e.target.value, { persist: true });
	                });
	                input.addEventListener('change', (e) => {
	                    handleEqSliderInput(i, e.target.value, { persist: true });
	                });
	                input.id = `eq-${i}`;
	                const label = document.createElement('div');
	                label.className = 'eq-frequency-label';
	                label.textContent = freq >= 1000 ? (freq / 1000) + 'k' : String(freq);
	                wrap.appendChild(dbValue);
	                rail.appendChild(input);
	                wrap.appendChild(rail);
	                wrap.appendChild(label);
	                container.appendChild(wrap);
	                eqRuntime.sliderEls[i] = input;
	                eqRuntime.dbEls[i] = dbValue;
	            });
	            restoreEqualizerState();
	        }

	        function setEQPreset(name) {
	            const preset = sanitizeEqPresetName(name, { allowCustom: true });
	            if (preset === EQ_CUSTOM_PRESET) {
	                eqRuntime.preset = EQ_CUSTOM_PRESET;
	                setEqPresetSelectValue(EQ_CUSTOM_PRESET);
	                ensureEqualizerGraph({ resume: true, notify: false, smooth: true });
	                applyEqBandsToFilters(eqRuntime.bands, { smooth: true });
	                setEqSettingsSnapshot(eqRuntime.preset, eqRuntime.bands, { persist: true, immediate: false });
	                return;
	            }
	            setEqPresetInternal(preset, { persist: true, smooth: true });
	        }

function closeMenuDropdownById(id = '') {
    const menu = document.getElementById(id);
    if (!menu) return;
    menu.classList.remove('menu-open');
    menu.classList.add('hidden');
}

function closeTransientPanels(options = {}) {
    const opts = { queue: false, eq: true, menus: true, ...options };
    if (opts.eq) {
        const eqPanel = document.getElementById('eq-panel');
        if (eqPanel) eqPanel.classList.add('hidden');
    }
    if (opts.menus) {
        ['speed-menu', 'sleep-menu', 'accent-menu', 'viz-menu', 'crossfade-menu'].forEach(closeMenuDropdownById);
    }
    if (opts.queue) {
        const queuePanel = document.getElementById('queue-overlay');
        if (queuePanel) {
            queuePanel.classList.add('hidden');
            queuePanel.classList.remove('flex');
        }
        state.isQueueOverlayOpen = false;
    }
}

function toggleEQPanel() {
    const p = document.getElementById('eq-panel');
    if (!p) return;
    const shouldOpen = p.classList.contains('hidden');
    if (shouldOpen) {
        closeTransientPanels({ queue: true, eq: false, menus: true });
        ensureEqualizerGraph({ resume: true, notify: false, smooth: false });
        p.classList.remove('hidden');
        return;
    }
    p.classList.add('hidden');
}

	        function startVisualizer() {
	            let canvas = null;
	            let ctx = null;
	            const canvasRefCache = { windowed: null, fs: null };
	            let bufferLength = analyser?.frequencyBinCount || 512;
	            let dataArray = new Uint8Array(bufferLength);
	            let timeArray = new Uint8Array(analyser?.fftSize || 1024);
    const smoothedBands = [];
    let beatFrame = 0;
    let lastDrawTs = 0;
    let idleCleared = false;
    let canvasSizeSignature = '';
    let waveStrokeCache = { key: '', value: null };
    let waveFillCache = { key: '', value: null };
    let barsFillCache = { key: '', value: null };
    let logBandRangeCache = { key: '', ranges: [] };
    let lastCanvasResyncTs = 0;
    let lastCanvasTier = '';
    let lastCanvasMode = '';
    let visualizerTimeoutId = null;

    function queueNextDraw(delayMs = 0) {
        if (visualizerTimeoutId) {
            clearTimeout(visualizerTimeoutId);
            visualizerTimeoutId = null;
        }
        if (delayMs > 0) {
            visualizerTimeoutId = setTimeout(() => {
                visualizerTimeoutId = null;
                requestAnimationFrame(draw);
            }, delayMs);
            return;
        }
        requestAnimationFrame(draw);
    }

    function getDesiredCanvas() {
        if (state.fsModeActive) {
            if (!canvasRefCache.fs) canvasRefCache.fs = document.getElementById('fsModeVisualizerCanvas');
            return canvasRefCache.fs;
        }
        if (state.windowedModeActive) {
            if (!canvasRefCache.windowed) canvasRefCache.windowed = document.getElementById('windowedModeVisualizerCanvas');
            return canvasRefCache.windowed;
        }
        return null;
    }

    function getCanvasMode() {
        if (state.fsModeActive) return 'fs';
        if (state.windowedModeActive) return 'windowed';
        return '';
    }

    function syncVisualizerBuffers() {
        const nextBufferLength = Math.max(1, analyser?.frequencyBinCount || 512);
        const nextTimeLength = Math.max(2, analyser?.fftSize || 1024);
        if (nextBufferLength !== bufferLength) {
            bufferLength = nextBufferLength;
            dataArray = new Uint8Array(bufferLength);
            smoothedBands.length = 0;
            logBandRangeCache = { key: '', ranges: [] };
        }
        if (timeArray.length !== nextTimeLength) {
            timeArray = new Uint8Array(nextTimeLength);
        }
    }

    function hashVisualizerSeed(text = '') {
        let hash = 2166136261;
        const source = String(text || '');
        for (let i = 0; i < source.length; i += 1) {
            hash ^= source.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function readOnlineMusicVisualizerSnapshot(nowTs) {
        if (!isOnlineMusicPlaybackActive()) return null;
        const online = getOnlineMusicState();
        const track = getOnlineMusicCurrentTrack();
        if (!track) return null;
        let playerState = null;
        try { playerState = onlineMusicPlayer?.getPlayerState?.(); } catch (_) {}
        const YTState = window.YT?.PlayerState || {};
        const playerPlaying = playerState === YTState.PLAYING;
        const playerBuffering = playerState === YTState.BUFFERING;
        const playing = !!online.isPlaying || playerPlaying || (!!state.isPlaying && !playerBuffering);
        if (!playing) return null;
        let currentTime = Math.max(0, Number(online.currentTime || 0));
        let duration = Math.max(0, Number(online.duration || track.duration || 0));
        try {
            const playerTime = Number(onlineMusicPlayer?.getCurrentTime?.() || 0);
            if (Number.isFinite(playerTime) && playerTime >= 0) currentTime = playerTime;
        } catch (_) {}
        try {
            const playerDuration = Number(onlineMusicPlayer?.getDuration?.() || 0);
            if (Number.isFinite(playerDuration) && playerDuration >= 0) duration = Math.max(duration, playerDuration);
        } catch (_) {}
        const seedText = [
            track.id,
            track.videoId,
            track.title,
            track.artist,
            track.channelTitle,
            track.releaseTitle
        ].map((value) => sanitizeText(value || '')).filter(Boolean).join('|');
        return {
            track,
            seed: hashVisualizerSeed(seedText || `${currentTime}|${duration}`),
            currentTime,
            duration,
            nowSeconds: Math.max(0, Number(nowTs || performance.now()) / 1000)
        };
    }

    function synthesizeOnlineVisualizerFrame(snapshot, nowTs) {
        if (!snapshot) return false;
        syncVisualizerBuffers();
        const t = Number.isFinite(snapshot.currentTime) ? snapshot.currentTime : snapshot.nowSeconds;
        const seed = snapshot.seed || 1;
        const tempo = 78 + (seed % 68);
        const beatPosition = ((t * tempo) / 60) % 1;
        const beatDistance = Math.min(beatPosition, 1 - beatPosition);
        const kick = Math.pow(Math.max(0, 1 - beatDistance / 0.18), 2.8);
        const halfBeat = Math.pow(Math.max(0, 1 - Math.abs((beatPosition + 0.5) % 1 - 0.5) / 0.28), 1.8);
        const phrase = 0.64 + 0.36 * Math.sin((t / 7.5) + ((seed >>> 8) % 17));
        const section = 0.78 + 0.22 * Math.sin((t / 23) + ((seed >>> 16) % 19));
        const shimmerRate = 2.1 + ((seed >>> 20) % 9) * 0.19;
        const motion = Math.max(0.25, Math.min(1, (0.34 + kick * 0.46 + halfBeat * 0.18 + phrase * 0.2) * section));

        for (let i = 0; i < bufferLength; i += 1) {
            const norm = bufferLength > 1 ? i / (bufferLength - 1) : 0;
            const low = Math.exp(-norm * 9.5) * (0.35 + kick * 0.82);
            const midCenter = 0.18 + ((seed >>> 4) % 18) / 140;
            const mid = Math.exp(-Math.pow((norm - midCenter) / 0.18, 2)) * (0.22 + halfBeat * 0.36 + phrase * 0.22);
            const high = Math.exp(-Math.pow((norm - 0.68) / 0.32, 2)) * (0.14 + 0.16 * Math.sin(t * shimmerRate + i * 0.13));
            const grain = 0.07 * Math.sin((i + 1) * ((seed % 31) + 7) * 0.017 + t * (1.4 + (seed % 5) * 0.2));
            const rolloff = Math.pow(1 - norm * 0.72, 1.08);
            const value = Math.max(0, Math.min(1, (low + mid + high + grain) * rolloff * motion));
            dataArray[i] = Math.max(0, Math.min(255, Math.round(22 + value * 222)));
        }

        const cycles = 2.4 + (seed % 6) * 0.24;
        const wobble = Math.sin(t * 0.73 + (seed % 13)) * 0.22;
        const amplitude = 19 + kick * 42 + halfBeat * 16 + Math.max(0, phrase) * 16;
        for (let i = 0; i < timeArray.length; i += 1) {
            const x = timeArray.length > 1 ? i / (timeArray.length - 1) : 0;
            const wave = Math.sin((x * cycles + t * (0.58 + (seed % 7) * 0.035)) * Math.PI * 2);
            const overtone = Math.sin((x * cycles * 2.15 + t * 0.91 + (seed % 23)) * Math.PI * 2) * 0.32;
            const shaped = (wave + overtone + wobble * Math.sin(x * Math.PI * 2)) / 1.45;
            timeArray[i] = Math.max(0, Math.min(255, Math.round(128 + shaped * amplitude)));
        }
        return true;
    }

    function getLogBandRanges(totalBands) {
        const bands = Math.max(1, totalBands || 1);
        const key = `${bufferLength}:${bands}`;
        if (logBandRangeCache.key === key) return logBandRangeCache.ranges;
        const curve = 1.85;
        const ranges = Array.from({ length: bands }, (_, index) => {
            const startNorm = Math.max(0, Math.min(1, index / bands));
            const endNorm = Math.max(startNorm, Math.min(1, (index + 1) / bands));
            const start = Math.floor(Math.pow(startNorm, curve) * (bufferLength - 1));
            const end = Math.max(start + 1, Math.floor(Math.pow(endNorm, curve) * (bufferLength - 1)));
            return { start, end };
        });
        logBandRangeCache = { key, ranges };
        return ranges;
    }

    function readLogBandEnergy(index, totalBands) {
        const range = getLogBandRanges(totalBands)[index] || { start: 0, end: 1 };
        let sum = 0;
        let samples = 0;
        for (let i = range.start; i <= range.end && i < bufferLength; i += 1) {
            sum += dataArray[i] || 0;
            samples += 1;
        }
        const raw = samples ? (sum / samples) / 255 : 0;
        return Math.pow(Math.max(0, Math.min(1, raw)), 0.82);
    }

    function smoothBand(index, nextValue) {
        const prev = Number.isFinite(smoothedBands[index]) ? smoothedBands[index] : nextValue;
        const coefficient = nextValue > prev ? 0.42 : 0.16;
        const next = prev + (nextValue - prev) * coefficient;
        smoothedBands[index] = next;
        return next;
    }

    function syncCanvasResolution(perfTier, isWindowed) {
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        const cssWidth = Math.max(240, Math.floor(rect.width || canvas.clientWidth || canvas.width || 1000));
        const cssHeight = Math.max(90, Math.floor(rect.height || canvas.clientHeight || canvas.height || 200));
        const qualityScale = isWindowed
            ? (perfTier === 'low' ? 0.58 : perfTier === 'degraded' ? 0.74 : 0.9)
            : (perfTier === 'low' ? 0.7 : perfTier === 'degraded' ? 0.86 : 1);
        const dprCap = perfTier === 'normal' ? 1.5 : 1;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
        const targetWidth = Math.max(240, Math.floor(cssWidth * qualityScale * pixelRatio));
        const targetHeight = Math.max(90, Math.floor(cssHeight * qualityScale * pixelRatio));
        const signature = `${targetWidth}x${targetHeight}`;
        if (signature === canvasSizeSignature) return;
        canvasSizeSignature = signature;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        waveStrokeCache = { key: '', value: null };
        waveFillCache = { key: '', value: null };
        barsFillCache = { key: '', value: null };
    }

	            function draw(nowTs = performance.now()) {
	                const desiredCanvas = getDesiredCanvas();
	                if (desiredCanvas !== canvas) {
	                    canvas = desiredCanvas;
	                    ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
            idleCleared = false;
            canvasSizeSignature = '';
            lastCanvasResyncTs = 0;
	                    lastCanvasTier = '';
	                    lastCanvasMode = '';
	                }
	                if (!canvas || !ctx) {
            queueNextDraw(250);
            return;
        }

        const perfTier = getEffectivePerformanceTier();
        const canvasMode = getCanvasMode();
        const isWindowed = canvasMode === 'windowed';
        const creativeStress =
            isFeatureEnabled(FEATURE_REGISTRY.creative_scene_packs) ||
            isFeatureEnabled(FEATURE_REGISTRY.creative_beat_reactive_ui) ||
            isFeatureEnabled(FEATURE_REGISTRY.creative_mood_dial);
        const minFrameMs = isWindowed
            ? (perfTier === 'low' ? 100 : perfTier === 'degraded' ? 68 : (creativeStress ? 42 : 32))
            : (perfTier === 'low' ? 72 : perfTier === 'degraded' ? 42 : 18);
        if (nowTs - lastDrawTs < minFrameMs) {
            queueNextDraw(0);
            return;
        }
        lastDrawTs = nowTs;

        const needsResync = !canvasSizeSignature
            || lastCanvasTier !== perfTier
            || lastCanvasMode !== canvasMode
            || nowTs - lastCanvasResyncTs > 900;
        if (needsResync) {
            syncCanvasResolution(perfTier, isWindowed);
            lastCanvasResyncTs = nowTs;
            lastCanvasTier = perfTier;
            lastCanvasMode = canvasMode;
        }

        const onlineSnapshot = readOnlineMusicVisualizerSnapshot(nowTs);
        const isOnlineVisualizer = !!onlineSnapshot;
        const isLocalPlaying = !!state.isPlaying && !!els.audio && !els.audio.paused && !isOnlineMusicPlaybackActive();
        const isPlaying = isOnlineVisualizer || isLocalPlaying;
        if (!isPlaying || document.hidden) {
            if (!idleCleared) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                idleCleared = true;
            }
            queueNextDraw(document.hidden ? 500 : 180);
            return;
        }

	                const activeTrack = getCurrentTrack();
	                if (activeTrack && activeTrack.type === 'video') {
	                    ctx.clearRect(0, 0, canvas.width, canvas.height);
            idleCleared = true;
            queueNextDraw(220);
	                    return;
        }

        idleCleared = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (isOnlineVisualizer) {
            synthesizeOnlineVisualizerFrame(onlineSnapshot, nowTs);
        } else if (analyser) {
            syncVisualizerBuffers();
            analyser.getByteFrequencyData(dataArray);
        } else {
            queueNextDraw(250);
            return;
        }
        const style = normalizeVisualizerStyle(state.visualizerStyle);
        if (style === 'wave' && !isOnlineVisualizer && analyser) analyser.getByteTimeDomainData(timeArray);

        beatFrame += 1;
        const beatCadence = isWindowed
            ? (perfTier === 'low' ? 16 : perfTier === 'degraded' ? 10 : 6)
            : (perfTier === 'low' ? 12 : perfTier === 'degraded' ? 8 : 4);
        if (beatFrame % beatCadence === 0) applyBeatReactiveStyles(dataArray);

        const accent = state.accentColor || '#3b82f6';
        if (style === 'wave') {
            const stride = perfTier === 'low' ? 6 : perfTier === 'degraded' ? 4 : (isWindowed ? 2 : 1);
            const pointCount = Math.ceil(timeArray.length / stride);
            const slice = canvas.width / Math.max(1, pointCount - 1);
            const midY = canvas.height / 2;
            ctx.beginPath();
            let point = 0;
            for (let i = 0; i < timeArray.length; i += stride) {
                const v = timeArray[i] / 255;
                const y = midY + (v - 0.5) * canvas.height * 0.74;
                const x = point * slice;
                if (point === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                point += 1;
            }
            const useGradients = perfTier === 'normal' && !isWindowed;
            if (useGradients) {
                const strokeKey = `${canvas.width}|${accent}`;
                if (waveStrokeCache.key !== strokeKey) {
                    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
                    grad.addColorStop(0, `${accent}55`);
                    grad.addColorStop(1, accent);
                    waveStrokeCache = { key: strokeKey, value: grad };
                }
                ctx.strokeStyle = waveStrokeCache.value || accent;
                ctx.shadowColor = accent;
                ctx.shadowBlur = 9;
            } else {
                ctx.strokeStyle = `${accent}cc`;
                ctx.shadowBlur = 0;
            }
            ctx.lineWidth = perfTier === 'low' ? 1.4 : perfTier === 'degraded' ? 1.8 : 2.2;
            ctx.stroke();
            if (useGradients) {
                ctx.lineTo(canvas.width, midY);
                ctx.lineTo(0, midY);
                ctx.closePath();
                const fillKey = `${canvas.height}|${accent}`;
                if (waveFillCache.key !== fillKey) {
                    const fillGrad = ctx.createLinearGradient(0, midY, 0, canvas.height);
                    fillGrad.addColorStop(0, `${accent}22`);
                    fillGrad.addColorStop(1, 'transparent');
                    waveFillCache = { key: fillKey, value: fillGrad };
                }
                ctx.fillStyle = waveFillCache.value || `${accent}22`;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        } else if (style === 'dots') {
            const dots = Math.min(bufferLength, perfTier === 'low' ? 18 : perfTier === 'degraded' ? 30 : (isWindowed ? 42 : 60));
            const spacing = canvas.width / dots;
            const midY = canvas.height / 2;
            const useSimpleDots = perfTier !== 'normal' || isWindowed;
            if (useSimpleDots) ctx.fillStyle = `${accent}bb`;
            for (let i = 0; i < dots; i += 1) {
                const energy = smoothBand(i, readLogBandEnergy(i, dots));
                const radius = Math.max(1.5, energy * (useSimpleDots ? 5.4 : 8));
                const drift = Math.sin(nowTs / (useSimpleDots ? 760 : 560) + i * 0.58) * (useSimpleDots ? 3.6 : 5.2);
                const x = spacing * i + spacing / 2;
                const y = midY + drift;
                if (!useSimpleDots) {
                    const grad = ctx.createRadialGradient(x, y, 1, x, y, radius * 1.8);
                    grad.addColorStop(0, `${accent}aa`);
                    grad.addColorStop(1, `${accent}11`);
                    ctx.fillStyle = grad;
                }
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            const maxBars = perfTier === 'low'
                ? Math.max(16, Math.floor(bufferLength * 0.28))
                : perfTier === 'degraded'
                    ? Math.max(24, Math.floor(bufferLength * 0.44))
                    : Math.max(isWindowed ? 40 : 56, Math.floor(bufferLength * (isWindowed ? 0.72 : 0.9)));
            const activeBars = Math.max(1, Math.min(bufferLength, maxBars));
            const barWidth = Math.max(1, (canvas.width / Math.max(2, activeBars * 2)) * 0.86);
            const useGradient = perfTier === 'normal' && !isWindowed;
            if (useGradient) {
                const barsKey = `${canvas.height}|${accent}`;
                if (barsFillCache.key !== barsKey) {
                    const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
                    grad.addColorStop(0, accent);
                    grad.addColorStop(1, `${accent}88`);
                    barsFillCache = { key: barsKey, value: grad };
                }
                ctx.fillStyle = barsFillCache.value || accent;
            } else {
                ctx.fillStyle = `${accent}cc`;
            }
            let x = 0;
            const center = canvas.width / 2;
            const gap = perfTier === 'low' ? 0.5 : 1;
            for (let i = 0; i < activeBars; i += 1) {
                const energy = smoothBand(i, readLogBandEnergy(i, activeBars));
                const barHeight = energy * canvas.height;
                const y = (canvas.height - barHeight) / 2;
                ctx.fillRect(center + x, y, barWidth, barHeight);
                ctx.fillRect(center - x - barWidth, y, barWidth, barHeight);
                x += barWidth + gap;
            }
        }
        queueNextDraw(0);
    }
    queueNextDraw(0);
}

