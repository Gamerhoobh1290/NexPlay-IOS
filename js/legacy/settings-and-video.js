/* Legacy settings, enhanced controls, and video experience logic.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- NEW FEATURES ---
function setSpeed(val) {
    state.playbackSpeed = val;
    if (isOnlineMusicPlaybackActive() && onlineMusicPlayer && onlineMusicPlayerReady && typeof onlineMusicPlayer.setPlaybackRate === 'function') {
        try { onlineMusicPlayer.setPlaybackRate(val); } catch (_) {}
    } else {
        els.audio.playbackRate = val;
    }
    // Update the visible label on the Playback Speed button to reflect the current speed
    const speedLabel = document.getElementById('speed-btn-label');
    if (speedLabel) {
        speedLabel.textContent = (val === 1.0 ? 'Speed' : `${val}x`);
    }
    const vBtn = document.getElementById('videoSpeedBtn');
    if (vBtn) vBtn.textContent = `${val.toFixed(2).replace(/\.00$/,'').replace(/0$/,'')}x`;
    // Highlight the active option in the menu by toggling classes
    const menu = document.getElementById('speed-menu');
    if (menu) {
        const buttons = menu.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.classList.remove('text-cyan-400', 'font-bold', 'bg-white/10');
        });
        buttons.forEach(btn => {
            const speedVal = parseFloat(btn.dataset.speed);
            if (Math.abs(speedVal - val) < 0.01) {
                btn.classList.add('text-cyan-400', 'font-bold', 'bg-white/10');
            }
        });
        // Hide the speed menu after selecting a value (for better UX)
        // menu.classList.add('hidden'); // DISABLED for Accordion
    }
    persistAppStateNow();
}

function setSleepTimer(min) {
    if(state.sleepTimer) clearTimeout(state.sleepTimer);
    const smenu = document.getElementById('sleep-menu');
    if (smenu) {
        smenu.classList.remove('menu-open');
        setTimeout(() => smenu.classList.add('hidden'), 200);
    }
    els.sleepLabel.textContent = min === 0 ? 'Sleep' : `${min}m`;
    if(min > 0) {
        state.sleepTimer = setTimeout(() => {
            safePauseMedia(els.audio);
            state.isPlaying = false;
            updatePlayIcons();
            els.sleepLabel.textContent = 'Sleep';
        }, min * 60000);
    }
}

async function togglePiP() {
    const track = state.tracks.find(t => t.id === state.currentTrackId);
    // PiP only makes sense for video tracks; surface a friendly notice for audio
    if (!track || track.type !== 'video') {
        showToast('Picture-in-Picture is available for video tracks only.', 'info');
        return;
    }
    const videoEl = els.audio;
    if (!videoEl || typeof videoEl.requestPictureInPicture !== 'function') {
        showToast('Picture-in-Picture not supported in this browser.', 'error');
        return;
    }
    if (videoEl.readyState < 1) {
        showToast('Video not ready yet.', 'info');
        return;
    }
    try {
        autoManagedVideoPiP = false;
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            await videoEl.requestPictureInPicture();
        }
    } catch (e) { console.error(e); }
}

// --- Video Experience Enhancements ---
let videoFsGeometryResizeObserver = null;

function rampVolume(target, duration = 140) {
    const start = Math.max(0, Math.min(1, els.audio.volume));
    const tgt = Math.max(0, Math.min(1, target));
    const diff = tgt - start;
    const startTs = performance.now();
    const step = (now) => {
        const t = Math.min(1, (now - startTs) / duration);
        const next = Math.max(0, Math.min(1, start + diff * t + 1e-6)); // guard float drift
        els.audio.volume = next;
        updateVolumeUI(next);
        updateVideoVolumeUI(next);
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function updateVideoVolumeUI(val) {
    const pct = Math.round(val * 100);
    const bar = document.getElementById('videoVolFill');
    const label = document.getElementById('videoVolValue');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = `${pct}%`;
}

	        function setVideoSpinner(show) {
	            const sp = document.getElementById('videoFsModeSpinner');
	            if (sp) sp.classList.toggle('hidden', !show);
	            const status = document.getElementById('videoBufferStatus');
	            if (status) status.classList.toggle('hidden', !show);
    if (videoSpinnerTimeoutTimer) {
        clearTimeout(videoSpinnerTimeoutTimer);
        videoSpinnerTimeoutTimer = null;
    }
	            if (show) {
	                logAction('video-spinner', 'Video loading spinner shown', {
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                // Loading fail-safe: never leave the spinner running forever.
	                videoSpinnerTimeoutTimer = setTimeout(() => {
	                    setVideoSpinner(false);
	                    logRecovery('video-spinner-timeout', 'Video loading spinner timed out and was cleared', {
	                        trackId: sanitizeText(state.currentTrackId || '')
	                    });
	                    showInternalNotice('Video loading timed out, spinner cleared.', 'warn');
	                }, 12000);
	            }
	        }

function updateVideoBufferBar(durOverride = null) {
    const fill = document.getElementById('videoFsModeBufferFill');
    const dur = durOverride ?? els.audio?.duration;
    if (!fill || !dur || !isFinite(dur) || dur <= 0 || !els.audio || !els.audio.buffered || els.audio.buffered.length === 0) {
        if (fill) fill.style.setProperty('--buf', '0%');
        return;
    }
    try {
        const bufEnd = els.audio.buffered.end(els.audio.buffered.length - 1);
        const pct = Math.min(100, Math.max(0, (bufEnd / dur) * 100));
        fill.style.setProperty('--buf', `${pct}%`);
        const status = document.getElementById('videoBufferStatus');
        if (status && !status.classList.contains('hidden')) {
            status.textContent = `Buffering ${pct.toFixed(0)}%`;
        }
    } catch (_) {
        fill.style.setProperty('--buf', '0%');
    }
}

function showVideoControls(force = false) {
    const overlay = document.getElementById('videoFsModeOverlay');
    const videoContainer = document.getElementById('videoFsModeVideoContainer');
    if (!overlay) return;
    overlay.classList.remove('video-controls-hidden');
    if (videoContainer) videoContainer.classList.remove('hide-cursor');
    if (videoControlsHideTimer) clearTimeout(videoControlsHideTimer);
    if (!force && els.audio && !els.audio.paused && state.videoFsModeActive) {
        videoControlsHideTimer = setTimeout(() => {
            overlay.classList.add('video-controls-hidden');
            if (videoContainer) videoContainer.classList.toggle('hide-cursor', lastPointerInVideo);
            // Hide hover preview when controls fade out
            lastHoverEvent = null;
            if (hoverPreviewRaf) cancelAnimationFrame(hoverPreviewRaf);
            hoverPreviewRaf = null;
            const hp = document.getElementById('videoFsHoverPreview');
            if (hp) hp.classList.remove('active');
        }, 2800);
    }
}

function toggleVideoFullscreen() {
    const overlay = document.getElementById('videoFsModeOverlay');
    if (!overlay) return;
    if (!document.fullscreenElement) {
        overlay.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

function updateVideoFullscreenIcon() {
    const icon = document.querySelector('#videoFsModeFsBtn i, #videoFsModeFsBtn svg');
    if (!icon) return;
    replaceLucideIcon(icon, document.fullscreenElement ? 'minimize' : 'maximize');
}

function stepVideoFrames(direction = 1) {
    if (!state.videoFsModeActive || !els.audio || !isFinite(els.audio.duration)) return;
    const frame = clampNumber(getAppSettings().video.frameStepSeconds, 0.02, 0.2, 1 / 25);
    const current = getMediaCurrentTimeSafe(els.audio);
    safeSeekMedia(els.audio, current + frame * direction);
    showVideoControls(true);
}

function getPreviewFrameForTime(trackId, t) {
    // Placeholder: expects state.previewFrames[trackId] = [{start, end, src, x, y, w, h}]
    const frames = state.previewFrames && state.previewFrames[trackId];
    if (!Array.isArray(frames) || !isFinite(t)) return null;
    for (const f of frames) {
        if (t >= (f.start || 0) && t < (f.end || Infinity)) return f;
    }
    return null;
}

function applyVideoFilters() {
    const videoEl = els.audio;
    if (!videoEl) return;
    const sharp = Math.max(0, Math.min(1, state.videoSharpness || 0));
    const bright = Math.max(0.5, Math.min(1.5, state.videoBrightness ?? 1));
    const userContrast = Math.max(0.5, Math.min(1.5, state.videoContrast ?? 1));
    const sharpContrast = 1 + sharp * 0.35;
    const contrast = sharpContrast * userContrast;
    const saturate = 1 + sharp * 0.25;
    const isNeutral = Math.abs(bright - 1) < 0.01 && Math.abs(contrast - 1) < 0.01 && Math.abs(saturate - 1) < 0.01;
    videoEl.style.filter = isNeutral ? '' : `brightness(${bright}) contrast(${contrast}) saturate(${saturate})`;
}

function applyVideoSharpness(val = null, options = {}) {
    state.videoSharpness = Math.max(0, Math.min(1, val === null ? (state.videoSharpness || 0) : val));
    applyVideoFilters();
    if (options.persist !== false) persistRememberedVideoAdjustments();
}

function applyVideoBrightness(val = null, options = {}) {
    // Slider 0-100 mapped to 0.0..1.5, neutral at 0.5 (mapped from 50)
    state.videoBrightness = Math.max(0, Math.min(1.5, val === null ? (state.videoBrightness || 0.5) : val));
    applyVideoFilters();
    if (options.persist !== false) persistRememberedVideoAdjustments();
}

function applyVideoContrast(val = null, options = {}) {
    // Slider 0-100 mapped to 0.5..1.5, neutral at 1.0 (slider 50)
    state.videoContrast = Math.max(0.5, Math.min(1.5, val === null ? (state.videoContrast || 1) : val));
    applyVideoFilters();
    if (options.persist !== false) persistRememberedVideoAdjustments();
}

function setupVideoFsInteractions() {
    if (videoFsInteractionsBound) return;
    const overlay = document.getElementById('videoFsModeOverlay');
    const progressWrap = document.getElementById('videoFsModeProgressWrap');
    const seekSlider = document.getElementById('videoFsModeSeekSlider');
    const volSlider = document.getElementById('videoVolSlider');
    const speedBtn = document.getElementById('videoSpeedBtn');
    const videoContainer = document.getElementById('videoFsModeVideoContainer');
    if (!overlay || !progressWrap || !seekSlider) return;
    videoFsInteractionsBound = true;

    if (videoContainer) {
        videoContainer.addEventListener('mouseenter', () => { lastPointerInVideo = true; });
        videoContainer.addEventListener('mouseleave', () => {
            lastPointerInVideo = false;
            videoContainer.classList.remove('hide-cursor');
            lastHoverEvent = null;
            if (hoverPreviewRaf) cancelAnimationFrame(hoverPreviewRaf);
            hoverPreviewRaf = null;
            const hp = document.getElementById('videoFsHoverPreview');
            if (hp) hp.classList.remove('active');
        });
    }

    const hoverPreview = document.getElementById('videoFsHoverPreview');
    const hoverThumb = document.getElementById('videoFsHoverThumb');
    const hoverTimeLabel = document.getElementById('videoFsHoverTime');
    const sharpPanel = document.getElementById('sharpnessPanel');
    const sharpToggle = document.getElementById('sharpnessToggle');
    const sharpSlider = document.getElementById('sharpnessSlider');
    const sharpReset = document.getElementById('sharpnessReset');
    const brightPanel = document.getElementById('brightnessPanel');
    const brightToggle = document.getElementById('brightnessToggle');
    const brightSlider = document.getElementById('brightnessSlider');
    const brightReset = document.getElementById('brightnessReset');
    const contrastPanel = document.getElementById('contrastPanel');
    const contrastToggle = document.getElementById('contrastToggle');
    const contrastSlider = document.getElementById('contrastSlider');
    const contrastReset = document.getElementById('contrastReset');
    let progressGeometry = null;
    let hoverPreviewWidth = null;

    const invalidateProgressGeometry = () => {
        progressGeometry = null;
        hoverPreviewWidth = null;
    };
    const getProgressGeometry = () => {
        if (progressGeometry) return progressGeometry;
        const rect = progressWrap.getBoundingClientRect();
        const width = Math.max(0, Number(rect.width || 0));
        if (width <= 0) return null;
        progressGeometry = { left: Number(rect.left || 0), width };
        return progressGeometry;
    };
    const getHoverPreviewWidth = () => {
        if (hoverPreviewWidth !== null) return hoverPreviewWidth;
        hoverPreviewWidth = hoverPreview ? Math.max(0, Number(hoverPreview.offsetWidth || 0)) : 0;
        return hoverPreviewWidth;
    };

    progressWrap.addEventListener('pointerenter', invalidateProgressGeometry, { passive: true });
    progressWrap.addEventListener('focusin', invalidateProgressGeometry);
    window.addEventListener('resize', invalidateProgressGeometry, { passive: true });
    window.addEventListener('scroll', invalidateProgressGeometry, { passive: true, capture: true });
    document.addEventListener('fullscreenchange', invalidateProgressGeometry);
    if (typeof ResizeObserver === 'function') {
        if (videoFsGeometryResizeObserver) videoFsGeometryResizeObserver.disconnect();
        videoFsGeometryResizeObserver = new ResizeObserver(invalidateProgressGeometry);
        videoFsGeometryResizeObserver.observe(progressWrap);
        if (hoverPreview) videoFsGeometryResizeObserver.observe(hoverPreview);
    }

    const updateHoverPreview = () => {
        hoverPreviewRaf = null;
        if (!lastHoverEvent || !els.audio || !isFinite(els.audio.duration)) return;
        const geometry = getProgressGeometry();
        if (!geometry) return;
        const x = Math.min(Math.max(lastHoverEvent.clientX - geometry.left, 0), geometry.width);
        const pct = x / geometry.width;
        const t = pct * els.audio.duration;

        if (hoverTimeLabel) {
            const nextTimeLabel = formatClock(t);
            if (hoverTimeLabel.textContent !== nextTimeLabel) hoverTimeLabel.textContent = nextTimeLabel;
        }

        // Position tooltip centered on cursor, clamped within wrap
        const tooltipWidth = getHoverPreviewWidth();
        const clampedX = Math.min(Math.max(x, tooltipWidth / 2), geometry.width - tooltipWidth / 2);
        if (hoverPreview) {
            const nextLeft = `${(clampedX / geometry.width) * 100}%`;
            if (hoverPreview.style.left !== nextLeft) hoverPreview.style.left = nextLeft;
        }

        // Thumbnail lookup (placeholder logic; expects state.previewFrames map if available)
        if (hoverThumb) {
            const frame = getPreviewFrameForTime(state.currentTrackId, t);
            if (frame) {
                if (hoverThumb.getAttribute('src') !== frame.src) hoverThumb.src = frame.src;
                if (frame.x != null && frame.y != null && frame.w && frame.h) {
                    hoverThumb.style.objectFit = 'cover';
                }
                hoverThumb.classList.add('has-frame');
            } else {
                hoverThumb.classList.remove('has-frame');
            }
        }

        if (hoverPreview) {
            hoverPreview.classList.add('active');
        }
    };

    const hoverHandler = (evt) => {
        if (!els.audio || !isFinite(els.audio.duration)) return;
        lastHoverEvent = { clientX: evt.clientX };
        if (!hoverPreviewRaf) hoverPreviewRaf = requestAnimationFrame(updateHoverPreview);
    };
    const leaveHandler = () => {
        lastHoverEvent = null;
        invalidateProgressGeometry();
        if (hoverPreviewRaf) cancelAnimationFrame(hoverPreviewRaf);
        hoverPreviewRaf = null;
        if (hoverPreview) hoverPreview.classList.remove('active');
    };

    progressWrap.addEventListener('mousemove', hoverHandler);
    progressWrap.addEventListener('mouseleave', leaveHandler);
    progressWrap.addEventListener('pointerleave', leaveHandler);
    overlay.addEventListener('mouseleave', leaveHandler);
    overlay.addEventListener('pointerleave', leaveHandler);

    // Ensure neutral filters on entry
    applyVideoFilters();
    progressWrap.addEventListener('click', (e) => {
        if (!els.audio || !isFinite(els.audio.duration)) return;
        const geometry = getProgressGeometry();
        if (!geometry) return;
        const pct = Math.min(Math.max((e.clientX - geometry.left) / geometry.width, 0), 1);
        const targetTime = pct * els.audio.duration;
        safeSeekMedia(els.audio, targetTime);
        updateProgress();
    });

    seekSlider.addEventListener('pointerdown', () => { videoScrubbing = true; showVideoControls(true); });
    seekSlider.addEventListener('pointerup', () => { videoScrubbing = false; showVideoControls(); });
    seekSlider.addEventListener('input', (e) => {
        if (!els.audio || !isFinite(els.audio.duration)) return;
        const t = Number(e.target.value);
        // keep hover tooltip in sync while scrubbing
        const geometry = getProgressGeometry();
        if (!geometry) return;
        lastHoverEvent = { clientX: (t / els.audio.duration) * geometry.width + geometry.left };
        if (!hoverPreviewRaf) hoverPreviewRaf = requestAnimationFrame(updateHoverPreview);
    });

    if (sharpToggle && sharpPanel) {
        sharpToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sharpPanel.classList.toggle('hidden');
            if (!sharpPanel.classList.contains('hidden') && brightPanel) brightPanel.classList.add('hidden');
        });
    }
    if (sharpSlider) {
        sharpSlider.addEventListener('input', (e) => {
            const v = Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100));
            applyVideoSharpness(v);
        });
    }
    if (sharpReset) {
        sharpReset.addEventListener('click', () => {
            applyVideoSharpness(0);
            if (sharpSlider) sharpSlider.value = 0;
        });
    }

    if (brightToggle && brightPanel) {
        brightToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            brightPanel.classList.toggle('hidden');
            if (!brightPanel.classList.contains('hidden')) {
                if (sharpPanel) sharpPanel.classList.add('hidden');
                if (contrastPanel) contrastPanel.classList.add('hidden');
            }
        });
    }
    if (brightSlider) {
        brightSlider.addEventListener('input', (e) => {
            const raw = parseFloat(e.target.value);
            const v = 1 + ((isNaN(raw) ? 50 : raw) - 50) / 100; // map 0..100 -> 0.5..1.5 with neutral at 1
            applyVideoBrightness(v);
        });
    }
    if (brightReset) {
        brightReset.addEventListener('click', () => {
            applyVideoBrightness(1);
            if (brightSlider) brightSlider.value = 50;
        });
    }

    if (contrastToggle && contrastPanel) {
        contrastToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            contrastPanel.classList.toggle('hidden');
            if (!contrastPanel.classList.contains('hidden')) {
                if (sharpPanel) sharpPanel.classList.add('hidden');
                if (brightPanel) brightPanel.classList.add('hidden');
            }
        });
    }
    if (contrastSlider) {
        contrastSlider.addEventListener('input', (e) => {
            const raw = parseFloat(e.target.value);
            const v = 0.5 + ((isNaN(raw) ? 50 : raw) / 100); // 0..100 -> 0.5..1.5
            applyVideoContrast(v);
        });
    }
    if (contrastReset) {
        contrastReset.addEventListener('click', () => {
            applyVideoContrast(1);
            if (contrastSlider) contrastSlider.value = 50;
        });
    }

    ['mousemove','touchstart','click','keydown'].forEach(evt => {
        overlay.addEventListener(evt, (e) => {
            if (videoContainer) {
                lastPointerInVideo = videoContainer.contains(e.target);
            }
            if (e.type === 'mousemove') {
                const now = performance.now();
                const dx = e.movementX || 0;
                const dy = e.movementY || 0;
                const speed = Math.hypot(dx, dy);
                const delay = speed > 4 ? 3600 : 2600;
                const hide = () => {
                    if (videoControlsHideTimer) clearTimeout(videoControlsHideTimer);
                    if (!els.audio.paused) {
                        videoControlsHideTimer = setTimeout(() => {
                            overlay.classList.add('video-controls-hidden');
                            if (videoContainer) videoContainer.classList.toggle('hide-cursor', lastPointerInVideo);
                        }, delay);
                    }
                };
                overlay.classList.remove('video-controls-hidden');
                if (videoContainer) videoContainer.classList.remove('hide-cursor');
                hide();
            } else {
                showVideoControls();
            }
        });
    });
    document.addEventListener('fullscreenchange', updateVideoFullscreenIcon);

    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            const clamped = Math.max(0, Math.min(1, v));
            rampVolume(clamped, 120);
        });
    }

    if (speedBtn) {
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        speedBtn.addEventListener('click', () => {
            const cur = state.playbackSpeed || 1;
            const idx = speeds.findIndex(s => Math.abs(s - cur) < 0.001);
            const next = speeds[(idx + 1) % speeds.length];
            setSpeed(next);
            speedBtn.textContent = `${next}x`;
        });
        speedBtn.textContent = `${state.playbackSpeed.toFixed(2).replace(/\.00$/,'').replace(/0$/,'')}x`;
    }
}

// Surprise me: play a random track different from current if possible
function surpriseMe() {
    const list = state.tracks.filter(Boolean);
    if (list.length === 0) { showToast('No tracks loaded.', 'info'); return; }
    if (list.length === 1) { loadTrack(list[0].id); return; }
    let candidate = list[Math.floor(Math.random() * list.length)];
    if (candidate.id === state.currentTrackId) {
        candidate = list[(list.indexOf(candidate) + 1) % list.length];
    }
    loadTrack(candidate.id);
}


function setFeatureToggleFromUI(featureId, checked) {
    setFeatureEnabled(featureId, !!checked);
}

function selectScenePack(packId) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_scene_packs)) return;
    if (!Object.prototype.hasOwnProperty.call(SCENE_PACKS, packId)) return;
    state.scenePackState.activePack = packId;
    state.scenePackState.updatedAt = Date.now();
    refreshFeatureRuntime({ rerender: true, preserveScroll: true });
}

function setMoodDial(value) {
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_mood_dial)) return;
    state.moodDialState = sanitizeMoodDialState({
        value: Number(value),
        updatedAt: Date.now()
    });
    refreshFeatureRuntime({ rerender: false });
    const valueEl = document.getElementById('mood-dial-value');
    if (valueEl) valueEl.textContent = `${state.moodDialState.value}`;
}

function getEnabledWindowedHeavyFeatures() {
    return WINDOWED_HEAVY_FEATURE_IDS
        .filter((id) => isFeatureEnabled(id))
        .map((id) => FEATURE_META[id]?.title || id);
}

function disableWindowedHeavyFeatures() {
    let changed = false;
    WINDOWED_HEAVY_FEATURE_IDS.forEach((id) => {
        if (state.featureToggles[id]) {
            state.featureToggles[id] = false;
            changed = true;
        }
    });
    if (!changed) {
        showToast('Windowed heavy visual toggles are already OFF.', 'info');
        return;
    }
    refreshFeatureRuntime({ rerender: true, preserveScroll: true });
    showToast('Disabled heavy windowed visual toggles.', 'info');
}

function renderFeatureToggleRows(ids = []) {
    return ids.map((id) => {
        const meta = FEATURE_META[id] || { title: id, hint: '' };
        const enabled = isFeatureEnabled(id);
        return `
            <label class="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <span class="min-w-0">
                    <span class="block text-sm font-semibold text-white">${escapeHtml(meta.title)}</span>
                    <span class="block text-xs text-gray-400">${escapeHtml(meta.hint)}</span>
                </span>
                <span class="shrink-0 mt-1">
                    <input type="checkbox" class="h-4 w-4 accent-cyan-500" ${enabled ? 'checked' : ''} onchange="setFeatureToggleFromUI('${id}', this.checked)">
                </span>
            </label>
        `;
    }).join('');
}

function clearAllResumeMarkers() {
    state.resumeStore = createDefaultResumeStore();
    (state.tracks || []).forEach((track) => {
        if (!track) return;
        track.resumePosition = 0;
        track.resumeUpdatedAt = 0;
        persistTrackMetadata(track);
    });
    Object.keys(state.metadataStore || {}).forEach((key) => {
        const meta = state.metadataStore[key];
        if (!meta) return;
        state.metadataStore[key] = {
            ...meta,
            resumePosition: 0,
            resumeUpdatedAt: 0
        };
    });
    writeStorageJson(EXTENDED_STORAGE_KEYS.resumeStore, state.resumeStore);
    persistMetadataStoreWithFallback();
    if (state.activeTab === 'settings') renderSettingsTab();
    showToast('Cleared all resume markers.', 'info');
}

function deleteResumeEntry(kind, key) {
    if (kind === 'track') {
        if (state.resumeStore && state.resumeStore.tracks) delete state.resumeStore.tracks[key];
        const track = state.tracks.find((item) => item.id === key);
        if (track) {
            track.resumePosition = 0;
            track.resumeUpdatedAt = 0;
            persistTrackMetadata(track);
        }
    } else if (kind === 'online') {
        if (state.resumeStore && state.resumeStore.online) delete state.resumeStore.online[key];
    }
    state.resumeStore.lastUpdatedAt = Date.now();
    writeStorageJson(EXTENDED_STORAGE_KEYS.resumeStore, state.resumeStore);
    if (state.activeTab === 'settings') renderSettingsTab();
}

function jumpToResumeEntry(kind, key) {
    if (kind === 'track') {
        const track = state.tracks.find((item) => item.id === key);
        if (!track) {
            showToast('That track is not loaded in the current library.', 'error');
            return;
        }
        loadTrack(track.id, true);
        showToast('Jumped to saved resume point.', 'info');
        return;
    }
    const entry = state.resumeStore?.online?.[key];
    if (!entry) return;
    const input = document.getElementById('video-url-input');
    if (input) input.value = entry.lastKnownCanonicalUrl || key;
    changeTab('online-videos');
    loadPastedVideoUrl({ quiet: true });
    showToast('Opened saved online video resume point.', 'info');
}

function renderResumeManagerRows() {
    const localRows = Object.entries(state.resumeStore?.tracks || {})
        .map(([trackId, entry]) => ({ trackId, entry, track: state.tracks.find((item) => item.id === trackId) || null }))
        .sort((a, b) => (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0));
    const onlineRows = Object.entries(state.resumeStore?.online || {})
        .map(([key, entry]) => ({ key, entry }))
        .sort((a, b) => (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0));
    if (!localRows.length && !onlineRows.length) {
        return '<div class="text-xs text-gray-500">No resume markers saved yet.</div>';
    }
    const localHtml = localRows.map(({ trackId, entry, track }) => {
        const label = track ? `${track.title} - ${track.artist}` : `Track ${trackId.slice(0, 8)}`;
        return `
            <div class="rounded-xl border border-white/10 bg-black/30 px-3 py-3 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                    <div class="text-sm text-white truncate">${escapeHtml(label)}</div>
                    <div class="text-[11px] text-gray-500">Resume at ${formatTime(entry.time || 0)} &middot; ${formatElapsedSince(entry.updatedAt)}</div>
                </div>
                <button onclick="jumpToResumeEntry('track', '${trackId}')" class="px-3 py-2 rounded-lg text-[10px] uppercase tracking-wide border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10">Jump</button>
                <button onclick="deleteResumeEntry('track', '${trackId}')" class="px-3 py-2 rounded-lg text-[10px] uppercase tracking-wide border border-red-500/30 text-red-200 hover:bg-red-500/10">Delete</button>
            </div>
        `;
    }).join('');
    const onlineHtml = onlineRows.map(({ key, entry }) => {
        const encodedKey = encodeURIComponent(key);
        return `
            <div class="rounded-xl border border-white/10 bg-black/30 px-3 py-3 flex items-center gap-3">
                <div class="min-w-0 flex-1">
                    <div class="text-sm text-white truncate">${escapeHtml(entry.provider || entry.lastKnownCanonicalUrl || key)}</div>
                    <div class="text-[11px] text-gray-500 truncate">Resume at ${formatTime(entry.position || 0)} &middot; ${formatElapsedSince(entry.updatedAt)}</div>
                </div>
                <button onclick="jumpToResumeEntry('online', decodeURIComponent('${encodedKey}'))" class="px-3 py-2 rounded-lg text-[10px] uppercase tracking-wide border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10">Open</button>
                <button onclick="deleteResumeEntry('online', decodeURIComponent('${encodedKey}'))" class="px-3 py-2 rounded-lg text-[10px] uppercase tracking-wide border border-red-500/30 text-red-200 hover:bg-red-500/10">Delete</button>
            </div>
        `;
    }).join('');
    return `
        <div class="space-y-4">
            ${localHtml ? `<div class="space-y-2"><div class="text-[10px] uppercase tracking-[0.18em] text-gray-500">Local Tracks</div>${localHtml}</div>` : ''}
            ${onlineHtml ? `<div class="space-y-2"><div class="text-[10px] uppercase tracking-[0.18em] text-gray-500">Online Sources</div>${onlineHtml}</div>` : ''}
        </div>
    `;
}

const SETTINGS_HELP_TEXT = Object.freeze({
    themeMode: 'Choose how NexPlay looks overall. Dark is easier in dim rooms, Light is brighter in daylight, and System follows your device setting automatically.',
    density: 'Changes how roomy or compact the layout feels. Cozy leaves more breathing room, while Compact fits more controls and tracks on screen.',
    defaultViewMode: 'Choose how your library usually appears when a track list opens. List is easier to scan quickly, while Grid gives artwork more space.',
    defaultStartTab: 'Pick the section NexPlay opens to when the app starts so you land where you normally begin.',
    sidebarWidth: 'Makes the left navigation panel narrower or wider. A wider sidebar is easier to read; a narrower one gives more room to your library.',
    visualizerIntensity: 'Controls how strong the visual motion and audio-reactive effects feel. Higher values look more energetic, lower values feel calmer.',
    reducedMotion: 'Turns down most animations and hover movement. This can make the interface feel steadier and more comfortable if motion is distracting.',
    autoplayOnTrackClick: 'When this is on, selecting a track starts playback right away. When it is off, the track loads first and waits for you to press play.',
    seekStepSeconds: 'Sets how far NexPlay jumps when you use skip or seek controls. Larger values move faster through a track, smaller values feel more precise.',
    speedAudio: 'Sets the normal playback speed for songs, podcasts, and other audio files. A value of 1.00x means the sound plays at its natural speed.',
    speedVideo: 'Sets the normal playback speed for videos. This is useful if you usually watch a little faster or slower than normal.',
    skipIntroSeconds: 'Automatically moves past the first part of playback by this amount. Helpful for long intros, spoken lead-ins, or empty silence at the start.',
    skipOutroSeconds: 'Leaves the last part of playback early by this amount. Helpful for long fade-outs, credits, or silence at the end of a file.',
    pauseWhenHidden: 'Pauses playback when NexPlay is no longer the active tab or window. This helps prevent audio or video from continuing in the background by accident.',
    localResume: 'Remembers where you stopped in imported files so you can continue later instead of finding your place again.',
    onlineResume: 'Remembers where you stopped in pasted direct links and embedded online videos. YouTube music search results always restart when you switch tracks.',
    minimumDurationSeconds: 'Only saves a resume point for media longer than this amount. Short clips usually do not need a saved place.',
    historyLimit: 'Controls how many recently played items NexPlay keeps in your history list before older ones drop off.',
    privateSessionLaunch: 'Opens the dedicated private-session workspace. Items imported or searched there stay temporary and are cleared when you leave the page.',
    rememberPerVideoAdjustments: 'Saves video tuning like brightness, contrast, and sharpness for each individual video so each one can keep its own look.',
    fullscreenBehavior: 'Choose what happens when you open a video. Manual stays in the standard view, Immersive opens the larger cinematic view, and Immersive + Fullscreen also asks the browser for fullscreen.',
    pipBehavior: 'Controls whether Picture in Picture stays a manual choice or turns on automatically when you enter video mode.',
    frameStepSeconds: 'Sets the size of each frame-by-frame step when you nudge through video. Smaller steps feel more precise for close inspection.',
    lyricSafeOffsetPx: 'Adds extra vertical spacing so lyrics stay clear of video controls, artwork, and other overlays.',
    allowedQueueSources: 'Controls which source types can be added to the queue outside Online Music. Online Music always allows online queue additions.',
    favoriteWeight: 'Tells Smart Auto-Queue how strongly it should favor tracks you marked as favorites. Higher values bring favorites forward more often.',
    recencyWeight: 'Tells Smart Auto-Queue how much recent activity should matter. Higher values make newer or more recently touched tracks show up more often.',
    sameArtistPenalty: 'Reduces back-to-back picks from the same artist. Higher values create more variety between artists.',
    tagAffinityWeight: 'Gives more weight to matching tags and similar moods when NexPlay builds an automatic queue.',
    longFormBias: 'Moves automatic queues toward shorter or longer content. Negative values lean shorter, while positive values lean longer.',
    storyModeAggression: 'Controls how strongly Story Mode shapes a queue from warmup to peak to cooldown. Higher values make the progression feel more dramatic.'
});
const SETTINGS_PROFILES = Object.freeze((() => {
    const defaults = createDefaultAppSettings();
    return {
        default: {
            id: 'default',
            label: 'Default',
            helpText: 'Resets playback, appearance, resume, queue, and video behavior to NexPlay\u2019s original balanced defaults.',
            scenePackId: DEFAULT_SCENE_PACK,
            enableScenePacks: false,
            settingsPatch: {
                playback: { ...defaults.playback },
                resume: { ...defaults.resume },
                appearance: { ...defaults.appearance },
                queue: { ...defaults.queue },
                video: { ...defaults.video }
            }
        },
        focus: {
            id: 'focus',
            label: 'Focus',
            helpText: 'A calmer, tighter setup for reading, studying, or background listening with less motion and fewer surprises.',
            scenePackId: 'midnight',
            enableScenePacks: true,
            settingsPatch: {
                playback: { autoplayOnTrackClick: false, pauseWhenHidden: true, skipIntroSeconds: 0, skipOutroSeconds: 8 },
                resume: {},
                appearance: { themeMode: 'dark', density: 'compact', visualizerIntensity: 0.55, reducedMotion: true, defaultViewMode: 'list', defaultStartTab: 'audio', sidebarWidth: 280 },
                queue: { favoriteWeight: 12, recencyWeight: 40, sameArtistPenalty: 32, tagAffinityWeight: 28, longFormBias: -18, storyModeAggression: 30 },
                video: {}
            }
        },
        cinema: {
            id: 'cinema',
            label: 'Cinema',
            helpText: 'A more visual, video-first setup with larger presentation choices and a more theatrical feel.',
            scenePackId: 'aurora',
            enableScenePacks: true,
            settingsPatch: {
                playback: { autoplayOnTrackClick: true, pauseWhenHidden: false, speedVideo: 1, skipIntroSeconds: 4, skipOutroSeconds: 10 },
                resume: {},
                appearance: { themeMode: 'dark', density: 'cozy', visualizerIntensity: 1.15, reducedMotion: false, defaultViewMode: 'grid', defaultStartTab: 'videos', sidebarWidth: 316 },
                queue: { favoriteWeight: 20, recencyWeight: 24, sameArtistPenalty: 16, tagAffinityWeight: 16, longFormBias: 34, storyModeAggression: 68 },
                video: {}
            }
        },
        gym: {
            id: 'gym',
            label: 'Gym',
            helpText: 'A brighter, more energetic setup that favors quick browsing and faster-paced listening.',
            scenePackId: 'voltage',
            enableScenePacks: true,
            settingsPatch: {
                playback: { autoplayOnTrackClick: true, pauseWhenHidden: false, speedAudio: 1.05, skipIntroSeconds: 2, skipOutroSeconds: 6 },
                resume: {},
                appearance: { themeMode: 'light', density: 'compact', visualizerIntensity: 1.35, reducedMotion: false, defaultViewMode: 'grid', defaultStartTab: 'favorites', sidebarWidth: 272 },
                queue: { favoriteWeight: 30, recencyWeight: 22, sameArtistPenalty: 12, tagAffinityWeight: 12, longFormBias: -24, storyModeAggression: 86 },
                video: {}
            }
        },
        night: {
            id: 'night',
            label: 'Night',
            helpText: 'A softer evening setup with balanced visuals, gentler queue behavior, and a history-first landing point.',
            scenePackId: 'nebula',
            enableScenePacks: true,
            settingsPatch: {
                playback: { autoplayOnTrackClick: true, pauseWhenHidden: true, skipIntroSeconds: 0, skipOutroSeconds: 12 },
                resume: {},
                appearance: { themeMode: 'system', density: 'cozy', visualizerIntensity: 0.7, reducedMotion: false, defaultViewMode: 'list', defaultStartTab: 'history', sidebarWidth: 296 },
                queue: { favoriteWeight: 22, recencyWeight: 34, sameArtistPenalty: 28, tagAffinityWeight: 22, longFormBias: 18, storyModeAggression: 48 },
                video: {}
            }
        },
        discovery: {
            id: 'discovery',
            label: 'Discovery',
            helpText: 'A higher-energy online-music setup for fast discovery, broader exploration, and richer visual atmosphere.',
            scenePackId: 'prism',
            enableScenePacks: true,
            settingsPatch: {
                playback: { autoplayOnTrackClick: true, pauseWhenHidden: false, seekStepSeconds: 6, skipIntroSeconds: 1, skipOutroSeconds: 4 },
                resume: {},
                appearance: { themeMode: 'dark', density: 'cozy', visualizerIntensity: 1.45, reducedMotion: false, defaultViewMode: 'grid', defaultStartTab: 'online-music', sidebarWidth: 304 },
                queue: { favoriteWeight: 18, recencyWeight: 44, sameArtistPenalty: 18, tagAffinityWeight: 26, longFormBias: -10, storyModeAggression: 76 },
                video: {}
            }
        },
        commute: {
            id: 'commute',
            label: 'Commute',
            helpText: 'A compact audio-first setup for quick navigation, faster skips, and dependable background listening on the move.',
            scenePackId: 'circuit',
            enableScenePacks: true,
            settingsPatch: {
                playback: { autoplayOnTrackClick: true, pauseWhenHidden: true, seekStepSeconds: 8, speedAudio: 1.08, skipIntroSeconds: 1, skipOutroSeconds: 5 },
                resume: {},
                appearance: { themeMode: 'dark', density: 'compact', visualizerIntensity: 0.85, reducedMotion: false, defaultViewMode: 'list', defaultStartTab: 'audio', sidebarWidth: 264 },
                queue: { favoriteWeight: 24, recencyWeight: 36, sameArtistPenalty: 24, tagAffinityWeight: 18, longFormBias: -20, storyModeAggression: 42 },
                video: {}
            }
        },
        lounge: {
            id: 'lounge',
            label: 'Lounge',
            helpText: 'A warmer, slower setup for favorites-heavy sessions with calmer visuals and longer-form queue choices.',
            scenePackId: 'ember',
            enableScenePacks: true,
            settingsPatch: {
                playback: { autoplayOnTrackClick: true, pauseWhenHidden: false, speedAudio: 0.98, skipIntroSeconds: 0, skipOutroSeconds: 10 },
                resume: {},
                appearance: { themeMode: 'dark', density: 'cozy', visualizerIntensity: 0.6, reducedMotion: false, defaultViewMode: 'grid', defaultStartTab: 'favorites', sidebarWidth: 308 },
                queue: { favoriteWeight: 32, recencyWeight: 20, sameArtistPenalty: 20, tagAffinityWeight: 30, longFormBias: 40, storyModeAggression: 36 },
                video: {}
            }
        }
    };
})());

const HYPERION_PRESET_SUMMARIES = Object.freeze({
    default: {
        label: 'Default',
        summary: 'Balanced NexPlay defaults for everyday listening.',
        changes: [
            'Restores balanced playback',
            'Returns appearance to the familiar default',
            'Keeps queue and video behavior steady'
        ]
    },
    focus: {
        label: 'Focus',
        summary: 'Calmer listening for studying or deep work.',
        changes: [
            'Reduces motion',
            'Lowers visual intensity',
            'Uses a tighter layout',
            'Keeps playback and queue behavior stable'
        ]
    },
    cinema: {
        label: 'Cinema',
        summary: 'Immersive media playback with stronger visual presence.',
        changes: [
            'Prioritizes media surfaces',
            'Enhances visual atmosphere',
            'Keeps controls accessible'
        ]
    },
    gym: {
        label: 'Gym',
        summary: 'Faster, brighter browsing for high-energy listening.',
        changes: [
            'Raises visual energy',
            'Favors quick browsing',
            'Keeps playback moving'
        ]
    },
    night: {
        label: 'Night',
        summary: 'Softer evening playback with gentler defaults.',
        changes: [
            'Softens visual intensity',
            'Keeps history easy to reach',
            'Uses calmer queue behavior'
        ]
    },
    discovery: {
        label: 'Discovery',
        summary: 'Online-music exploration with richer browsing energy.',
        changes: [
            'Prioritizes online discovery',
            'Increases visual atmosphere',
            'Keeps exploration quick'
        ]
    },
    commute: {
        label: 'Commute',
        summary: 'Compact audio-first listening for quick navigation.',
        changes: [
            'Uses a compact layout',
            'Keeps audio controls fast',
            'Supports dependable background listening'
        ]
    },
    lounge: {
        label: 'Lounge',
        summary: 'Warmer favorites-heavy playback for slower sessions.',
        changes: [
            'Calms visual intensity',
            'Favors favorites',
            'Leans toward longer-form listening'
        ]
    }
});

function getHyperionPresetSummary(presetId) {
    return safeCall(() => {
        const id = sanitizeText(presetId || '').toLowerCase();
        const profile = SETTINGS_PROFILES[id] || null;
        const summary = HYPERION_PRESET_SUMMARIES[id] || null;
        const fallbackLabel = sanitizeText(profile?.label || id || 'Profile') || 'Profile';
        const label = sanitizeText(summary?.label || fallbackLabel) || fallbackLabel;
        const text = sanitizeText(summary?.summary || profile?.helpText || `Applies the ${label} profile.`) || `Applies the ${label} profile.`;
        const changes = safeArray(summary?.changes)
            .map((change) => sanitizeText(change || ''))
            .filter(Boolean)
            .slice(0, 4);
        return { id, label, summary: text, changes };
    }, {
        id: '',
        label: 'Profile',
        summary: 'Applies a NexPlay profile.',
        changes: []
    });
}

function showPresetAppliedSummary(presetId) {
    return safeCall(() => {
        if (typeof showToast !== 'function') return false;
        const summary = getHyperionPresetSummary(presetId);
        const changes = safeArray(summary.changes)
            .slice(0, 3)
            .map((change) => change ? change.charAt(0).toLowerCase() + change.slice(1) : '')
            .filter(Boolean);
        const intro = summary.id === 'focus'
            ? `${summary.label} mode enabled`
            : `${summary.label} profile applied`;
        const detail = changes.length ? changes.join(', ') : summary.summary;
        showToast(`${intro} - ${detail}.`, 'info', { duration: 4200 });
        return true;
    }, false);
}

function renderSettingInfoTooltip(text, options = {}) {
    if (!text) return '';
    const alignClass = options.align === 'center' ? 'align-center' : '';
    const width = escapeHtml(options.width || '19rem');
    const safeText = escapeHtml(text);
    const ariaText = escapeHtml(`Setting help: ${sanitizeText(text || '')}`);
    return `
        <span class="setting-help-trigger" tabindex="0" role="note" aria-label="${ariaText}" onpointerdown="event.preventDefault(); event.stopPropagation();" onclick="event.preventDefault(); event.stopPropagation();">
            <span aria-hidden="true">i</span>
            <span class="setting-help-tooltip ${alignClass}" style="width:${width}; max-width:min(${width}, calc(100vw - 2rem));">${safeText}</span>
        </span>
    `;
}
function renderSettingInlineLabel(label, helpText) {
    return `<span class="setting-help-label">${escapeHtml(label)}${renderSettingInfoTooltip(helpText)}</span>`;
}
function renderSettingCardTitle(label, helpText) {
    return `<span class="setting-help-label"><span class="block text-sm text-white">${escapeHtml(label)}</span>${renderSettingInfoTooltip(helpText)}</span>`;
}
function renderSettingsProfileButton(profileId, label, helpText) {
    const safeProfileId = escapeHtml(sanitizeText(profileId || ''));
    const safeLabel = escapeHtml(label || 'Profile');
    const ariaLabel = escapeHtml(`Apply ${sanitizeText(label || 'profile')} profile`);
    return `
        <button type="button" data-hyperion-action="apply-preset" data-preset-id="${safeProfileId}" aria-label="${ariaLabel}" class="px-3 py-3 rounded-xl border border-white/10 bg-black/30 text-sm text-white hover:bg-white/10">
            <span class="setting-help-label justify-center">${safeLabel}${renderSettingInfoTooltip(helpText, { align: 'center', width: '16rem' })}</span>
        </button>
    `;
}

let hyperionActionDelegationAttached = false;

function attachHyperionActionDelegation() {
    if (hyperionActionDelegationAttached) return;
    document.addEventListener('click', handleHyperionActionClick);
    hyperionActionDelegationAttached = true;
}

function handleHyperionActionClick(event) {
    const target = event.target?.closest?.('[data-hyperion-action]');
    if (!target) return;
    const action = target.dataset.hyperionAction;
    if (action === 'apply-preset') {
        const presetId = target.dataset.presetId || '';
        if (!presetId) {
            reportHyperionIssue('settings-profile', 'apply', new Error('Missing settings profile id'));
            return;
        }
        applySettingsProfile(presetId);
    }
}

function applySettingsProfile(profileId) {
    const safeProfileId = sanitizeText(profileId || '').toLowerCase();
    const profile = SETTINGS_PROFILES[safeProfileId];
    if (!profile) {
        reportHyperionIssue('settings-profile', 'apply', new Error(`Unknown settings profile: ${safeProfileId || 'empty'}`), { profileId: safeProfileId });
        return false;
    }
    try {
        const current = getAppSettings();
        const patch = profile.settingsPatch || {};
        state.appSettings = sanitizeAppSettings({
            ...current,
            playback: { ...current.playback, ...(patch.playback || {}) },
            resume: { ...current.resume, ...(patch.resume || {}) },
            appearance: { ...current.appearance, ...(patch.appearance || {}) },
            queue: { ...current.queue, ...(patch.queue || {}) },
            video: { ...current.video, ...(patch.video || {}) }
        });
        state.scenePackState = sanitizeScenePackState({
            ...state.scenePackState,
            activePack: profile.scenePackId || DEFAULT_SCENE_PACK,
            updatedAt: Date.now()
        });
        state.featureToggles = sanitizeFeatureToggleMap({
            ...state.featureToggles,
            [FEATURE_REGISTRY.creative_scene_packs]: !!profile.enableScenePacks
        });
        applyAppSettings({ persist: false, syncViewMode: true });
        refreshFeatureRuntime({ rerender: true, preserveScroll: true });
        showPresetAppliedSummary(safeProfileId);
        return true;
    } catch (error) {
        reportHyperionIssue('settings-profile', 'apply', error, {
            profileId: safeProfileId,
            userFacing: true,
            userMessage: 'That profile could not be applied. NexPlay kept your session running.',
            toastType: 'error'
        });
        return false;
    }
}

function setOnlineMusicCustomApiKey(value = '') {
    setAppSettingValue('onlineMusic', 'customApiKey', sanitizeText(value || ''), { persist: true });
    syncConfiguredOnlineMusicApiKey();
    if (state.activeTab === 'settings') renderSettingsTab();
}

function getOnlineMusicProviderHealthTone(status = '') {
    const normalized = sanitizeText(status || '').toLowerCase();
    if (['healthy', 'ready', 'active'].includes(normalized)) return 'text-emerald-200 border-emerald-400/30 bg-emerald-500/10';
    if (['quota', 'paused', 'warn'].includes(normalized)) return 'text-amber-200 border-amber-400/30 bg-amber-500/10';
    if (['error', 'disabled', 'missing', 'offline'].includes(normalized)) return 'text-rose-200 border-rose-400/30 bg-rose-500/10';
    return 'text-gray-300 border-white/10 bg-black/30';
}

function formatOnlineMusicProviderHealthLabel(status = '') {
    const normalized = sanitizeText(status || '').toLowerCase();
    if (normalized === 'healthy') return 'Healthy';
    if (normalized === 'quota') return 'Quota Paused';
    if (normalized === 'disabled') return 'Disabled';
    if (normalized === 'error') return 'Error';
    if (normalized === 'idle') return 'Idle';
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Unknown';
}

function resetOnlineMusicProviderStateFromSettings() {
    resetOnlineMusicProviderHealth();
    syncConfiguredOnlineMusicApiKey();
    if (state.activeTab === 'settings') renderSettingsTab();
}

function hashStableString(value = '') {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function inferMediaTypeFromFileName(fileName = '') {
    return /\.(mp4|webm|ogv|mov)$/i.test(String(fileName || '')) ? 'video' : 'audio';
}

function parseTrackInfoFromFileName(fileName = '') {
    const stem = sanitizeText(String(fileName || '').replace(/\.[^.]+$/, ''));
    const artistTitleMatch = stem.match(/^(.+?)\s+-\s+(.+)$/);
    if (artistTitleMatch) {
        return {
            artist: sanitizeText(artistTitleMatch[1] || ''),
            title: sanitizeText(artistTitleMatch[2] || '')
        };
    }
    return {
        artist: '',
        title: stem || 'Track'
    };
}

function buildWatchedFolderItemFingerprint(item = {}) {
    const fileName = sanitizeText(item.name || '');
    return sanitizeText(`${fileName}|${Number(item.size) || 0}|${Number(item.lastModified) || 0}`);
}

function getStoredMetadataBySource(sourcePath = '', fingerprint = '') {
    const exact = Object.values(state.metadataStore || {}).find((entry) => {
        if (!entry) return false;
        return (sourcePath && sanitizeText(entry.sourcePath || '') === sourcePath)
            || (fingerprint && sanitizeText(entry.sourceFingerprint || '') === fingerprint);
    });
    return exact || null;
}

function findWatchedFolderTrackMatch(item = {}, root = {}) {
    const sourcePath = sanitizeText(item.path || '');
    const fingerprint = buildWatchedFolderItemFingerprint(item);
    const existingTrack = (state.tracks || []).find((track) => track && (
        (fingerprint && sanitizeText(track.sourceFingerprint || '') === fingerprint)
        || (sourcePath && sanitizeText(track.sourcePath || '') === sourcePath)
    )) || null;
    return {
        existingTrack,
        metadata: existingTrack || getStoredMetadataBySource(sourcePath, fingerprint) || null,
        sourcePath,
        fingerprint,
        rootId: sanitizeText(root.id || root.path || '')
    };
}

function createWatchedFolderTrackRecord(item = {}, root = {}) {
    const match = findWatchedFolderTrackMatch(item, root);
    const fileName = sanitizeText(item.name || match.sourcePath.split(/[\\/]/).pop() || '');
    const parsed = parseTrackInfoFromFileName(fileName);
    const existing = match.existingTrack || {};
    const metadata = match.metadata || {};
    const stableId = sanitizeText(existing.id || `watch_${hashStableString(match.sourcePath || `${match.rootId}|${match.fingerprint}`)}`);
    return {
        ...existing,
        ...metadata,
        id: stableId,
        title: sanitizeText(existing.title || metadata.title || parsed.title || 'Track'),
        artist: sanitizeText(existing.artist || metadata.artist || parsed.artist || 'Unknown Artist'),
        fileName,
        name: fileName,
        url: sanitizeText(item.mediaUrl || existing.url || ''),
        type: inferMediaTypeFromFileName(fileName),
        source: 'local',
        platformLabel: 'Watched Folder',
        size: Number(item.size) || Number(existing.size || 0),
        addedAt: Number(existing.addedAt || item.lastModified || Date.now()),
        lastModified: Number(item.lastModified) || Number(existing.lastModified || Date.now()),
        cover: existing.cover || metadata.cover || '',
        fingerprint: match.fingerprint,
        sourcePath: match.sourcePath,
        watchFolderId: match.rootId,
        sourceFingerprint: match.fingerprint,
        tags: Array.isArray(existing.tags) ? existing.tags.slice() : (Array.isArray(metadata.tags) ? metadata.tags.slice() : []),
        isFavorite: !!(existing.isFavorite ?? metadata.isFavorite),
        playCount: Number(existing.playCount ?? metadata.playCount ?? 0),
        duration: Number(existing.duration ?? metadata.duration ?? 0),
        skipCount: Number(existing.skipCount ?? metadata.skipCount ?? 0),
        lastSkippedAt: Number(existing.lastSkippedAt ?? metadata.lastSkippedAt ?? 0),
        listeningTime: Number(existing.listeningTime ?? metadata.listeningTime ?? 0),
        resumePosition: clampNumber(existing.resumePosition ?? metadata.resumePosition, 0, Number.MAX_SAFE_INTEGER, 0),
        resumeUpdatedAt: clampNumber(existing.resumeUpdatedAt ?? metadata.resumeUpdatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        downloadedAt: Number(existing.downloadedAt ?? metadata.downloadedAt ?? 0),
        downloadState: sanitizeText(existing.downloadState || metadata.downloadState || '')
    };
}

function setWatchedFoldersSetting(roots = [], options = {}) {
    const opts = { quiet: false, restart: true, ...options };
    const current = getAppSettings();
    state.appSettings = sanitizeAppSettings({
        ...current,
        library: {
            ...current.library,
            watchedFolders: Array.isArray(roots) ? roots : []
        }
    });
    applyAppSettings({ persist: true });
    if (state.activeTab === 'settings') renderSettingsTab();
    if (opts.restart) {
        restartLibraryWatchFromSettings({ quiet: opts.quiet }).catch((error) => {
            console.error(error);
            showToast(error?.message || 'Unable to refresh watch folders.', 'error');
        });
    }
}

async function pickLibraryWatchFolders() {
    if (!nexPlayDesktopBridge || typeof nexPlayDesktopBridge.pickWatchFolders !== 'function') {
        showToast('Watch folders are only available in the desktop app.', 'info');
        return;
    }
    const result = await nexPlayDesktopBridge.pickWatchFolders();
    if (result?.cancelled) return;
    const existing = Array.isArray(getAppSettings().library?.watchedFolders) ? getAppSettings().library.watchedFolders : [];
    const merged = new Map();
    existing.forEach((root) => {
        const key = sanitizeText(root?.path || '');
        if (!key) return;
        merged.set(key, root);
    });
    (result?.roots || []).forEach((root) => {
        const key = sanitizeText(root?.path || '');
        if (!key) return;
        merged.set(key, root);
    });
    setWatchedFoldersSetting(Array.from(merged.values()), { quiet: false, restart: true });
}

function removeLibraryWatchFolder(rootId = '') {
    const id = sanitizeText(rootId || '');
    if (!id) return;
    const current = Array.isArray(getAppSettings().library?.watchedFolders) ? getAppSettings().library.watchedFolders : [];
    const next = current.filter((root) => sanitizeText(root?.id || root?.path || '') !== id);
    setWatchedFoldersSetting(next, { quiet: false, restart: true });
}

async function restartLibraryWatchFromSettings(options = {}) {
    const opts = { quiet: false, ...options };
    if (!nexPlayDesktopBridge || typeof nexPlayDesktopBridge.startLibraryWatch !== 'function') return null;
    const roots = Array.isArray(getAppSettings().library?.watchedFolders) ? getAppSettings().library.watchedFolders : [];
    if (!roots.length) {
        if (typeof nexPlayDesktopBridge.stopLibraryWatch === 'function') {
            await nexPlayDesktopBridge.stopLibraryWatch().catch(() => {});
        }
        reconcileWatchedFolderSnapshot({ roots: [], folders: [], reason: 'stop' });
        if (!opts.quiet) showToast('Watch folders cleared.', 'info');
        return { roots: [], folders: [] };
    }
    const snapshot = await nexPlayDesktopBridge.startLibraryWatch({ roots });
    reconcileWatchedFolderSnapshot(snapshot || {});
    if (!opts.quiet) showToast(`Watching ${roots.length} folder${roots.length === 1 ? '' : 's'}.`, 'success');
    return snapshot;
}

async function scanLibraryWatchFoldersNow(options = {}) {
    const opts = { quiet: false, ...options };
    if (!nexPlayDesktopBridge || typeof nexPlayDesktopBridge.scanWatchFoldersNow !== 'function') {
        showToast('Watch folders are only available in the desktop app.', 'info');
        return null;
    }
    const snapshot = await nexPlayDesktopBridge.scanWatchFoldersNow();
    reconcileWatchedFolderSnapshot({ ...(snapshot || {}), reason: 'manual-scan' });
    if (!opts.quiet) showToast('Watch folders rescanned.', 'success');
    return snapshot;
}

function reconcileWatchedFolderSnapshot(payload = {}) {
    const roots = Array.isArray(payload.roots) ? payload.roots : [];
    const folders = Array.isArray(payload.folders) ? payload.folders : [];
    const rootIds = new Set(roots.map((root) => sanitizeText(root?.id || root?.path || '')).filter(Boolean));
    const nextTracks = [];
    const seenIds = new Set();
    folders.forEach((folder) => {
        const root = {
            id: sanitizeText(folder?.id || folder?.path || ''),
            name: sanitizeText(folder?.name || ''),
            path: sanitizeText(folder?.path || '')
        };
        (Array.isArray(folder?.items) ? folder.items : []).forEach((item) => {
            const track = createWatchedFolderTrackRecord(item, root);
            if (!track) return;
            if (seenIds.has(track.id)) {
                appendOnlineMusicImportReviewItem({
                    kind: 'duplicate',
                    title: track.title || 'Watch folder duplicate',
                    detail: `Multiple watched files resolved to the same library entry for ${track.sourcePath || track.fileName || 'a file'}.`
                });
                return;
            }
            seenIds.add(track.id);
            nextTracks.push(track);
        });
    });
    const keepIds = new Set(nextTracks.map((track) => track.id));
    const removedIds = (state.tracks || [])
        .filter((track) => track && sanitizeText(track.watchFolderId || ''))
        .filter((track) => !rootIds.has(sanitizeText(track.watchFolderId || '')) || !keepIds.has(track.id))
        .map((track) => track.id);
    if (removedIds.length) {
        removeTrackIdsFromCollections(removedIds);
    }
    nextTracks.forEach((track) => {
        const existingIndex = state.tracks.findIndex((candidate) => candidate?.id === track.id);
        if (existingIndex === -1) {
            state.tracks.push(track);
            persistTrackMetadata(track);
            return;
        }
        state.tracks.splice(existingIndex, 1, {
            ...state.tracks[existingIndex],
            ...track
        });
        persistTrackMetadata(state.tracks[existingIndex]);
    });
    updateLibraryStatsLabel();
    refreshQueueViews();
    renderTracks({ preserveScroll: true });
}

function loadQueueSnapshotById(snapshotId = '') {
    const id = sanitizeText(snapshotId || '');
    if (!id) return;
    const snapshot = (state.queueSnapshots || []).find((item) => item.id === id);
    if (!snapshot) return;
    applyQueueSnapshot(snapshot);
    showToast(`Loaded snapshot "${snapshot.name}".`, 'info');
}

function renderDesktopPerformancePresetSettingsChoice(preset, selectedPreset, recommendedPreset) {
    const isLowEnd = preset === 'low-end';
    const isSelected = selectedPreset === preset;
    const isRecommended = recommendedPreset === preset;
    const label = isLowEnd ? 'Low End PCs' : 'High End';
    const description = isLowEnd
        ? 'Fewer visual updates, shorter transitions, and lighter rendering while every feature stays available.'
        : 'Richer, smoother motion and full visual detail, with adaptive protection if frame rate drops.';
    const detail = isLowEnd ? 'Responsive + light' : 'Smooth + expressive';
    const icon = isLowEnd ? 'gauge' : 'sparkles';
    return `
        <button type="button"
                class="performance-preset-settings-choice ${isSelected ? 'is-selected' : ''}"
                data-settings-performance-preset="${preset}"
                aria-pressed="${isSelected ? 'true' : 'false'}"
                onclick="selectDesktopPerformancePreset('${preset}', { source: 'settings' })">
            <span class="performance-preset-choice-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span>
            <span class="performance-preset-choice-copy">
                <span class="performance-preset-choice-heading">
                    <span>${label}</span>
                    ${isRecommended ? '<span class="performance-preset-recommended-label">Recommended for this PC</span>' : ''}
                </span>
                <span class="performance-preset-choice-description">${description}</span>
                <span class="performance-preset-choice-detail">${detail}</span>
            </span>
            <span class="performance-preset-choice-check" aria-hidden="true"><i data-lucide="check"></i></span>
        </button>
    `;
}

function renderSettingsTab() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    const hub = document.getElementById('video-url-hub');
    if (hub) hub.classList.add('hidden');
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.classList.remove('flex');
    }
    container.className = 'w-full pb-8 pt-4';
    container.classList.remove('multi-select-active');
    const moodValue = Math.max(-100, Math.min(100, Number(state.moodDialState?.value ?? 0) || 0));
    const perfSnapshot = state.perfPolicy || { fps: 60, tier: 'normal' };
    const measuredPerfTier = perfSnapshot.tier || 'normal';
    const perfTier = getEffectivePerformanceTier(measuredPerfTier);
    const perfToneClass = perfTier === 'low' ? 'text-red-300' : perfTier === 'degraded' ? 'text-amber-300' : 'text-emerald-300';
    const fpsValue = Number.isFinite(perfSnapshot.fps) ? perfSnapshot.fps.toFixed(1) : '--';
    const selectedPerformancePreset = getSelectedDesktopPerformancePreset();
    const recommendedPerformancePreset = getDesktopPerformancePresetRecommendation();
    const selectedPerformanceLabel = selectedPerformancePreset === 'low-end'
        ? 'Low End PCs'
        : selectedPerformancePreset === 'high-end'
            ? 'High End'
            : 'Not selected';
    const heavyEnabled = getEnabledWindowedHeavyFeatures();
    const heavyEnabledText = heavyEnabled.length
        ? heavyEnabled.map((label) => escapeHtml(label)).join(', ')
        : 'None';
    const prefs = getAppSettings();
    const playbackPrefs = prefs.playback;
    const resumePrefs = prefs.resume;
    const appearancePrefs = prefs.appearance;
    const queuePrefs = prefs.queue;
    const videoPrefs = prefs.video;
    const onlineMusicPrefs = prefs.onlineMusic;
    const libraryPrefs = prefs.library;
    const providerHealth = getOnlineMusicProviderHealth();
    const watchedFolders = Array.isArray(libraryPrefs.watchedFolders) ? libraryPrefs.watchedFolders : [];
    const isDesktopRuntime = isDesktopRuntimeAvailable();
    const downloadJobs = Array.isArray(getOnlineMusicState().downloadJobs) ? getOnlineMusicState().downloadJobs : [];
    const importReviewItems = Array.isArray(getOnlineMusicState().importReviewItems) ? getOnlineMusicState().importReviewItems : [];
    const activeDownloadJobs = downloadJobs.filter((job) => ['queued', 'running', 'converting'].includes(job.status)).length;
    const completedDownloadJobs = downloadJobs.filter((job) => ['completed', 'completed_with_errors'].includes(job.status)).length;
    const errorDownloadJobs = downloadJobs.filter((job) => ['error', 'cancelled'].includes(job.status)).length;
    const watchedTrackCount = (state.tracks || []).filter((track) => sanitizeText(track?.watchFolderId || '')).length;
    const sceneOptions = Object.values(SCENE_PACKS).map((pack) => {
        const selected = (state.scenePackState?.activePack || DEFAULT_SCENE_PACK) === pack.id;
        return `<button class="px-3 py-2 rounded-lg border text-xs ${selected ? 'border-cyan-400 text-cyan-200 bg-cyan-500/10' : 'border-white/10 text-gray-300 bg-black/30 hover:bg-white/5'}" onclick="selectScenePack('${pack.id}')">${escapeHtml(pack.label)}</button>`;
    }).join('');
    const startTabOptions = NAV_TABS
        .filter((tab) => tab.id !== 'private-session')
        .map((tab) => `<option value="${tab.id}" ${appearancePrefs.defaultStartTab === tab.id ? 'selected' : ''}>${escapeHtml(tab.l)}</option>`)
        .join('');
    const smartQueueStatus = isFeatureEnabled(FEATURE_REGISTRY.core_smart_autoqueue);
    const help = SETTINGS_HELP_TEXT;
    const settingsProfiles = Object.values(SETTINGS_PROFILES);
    const profileButtonsHtml = settingsProfiles
        .map((profile) => renderSettingsProfileButton(profile.id, profile.label, profile.helpText))
        .join('');
    const performanceSettingsHtml = `
        <section class="holo-panel performance-preset-settings rounded-2xl p-5 md:p-6">
            <div class="performance-preset-settings-header">
                <div>
                    <div class="performance-preset-settings-kicker">This PC</div>
                    <h3>Performance preset</h3>
                    <p>Choose how much visual work NexPlay uses. Playback, tools, and features stay exactly the same.</p>
                </div>
                <div class="performance-preset-live-status">
                    <span>${escapeHtml(selectedPerformanceLabel)}</span>
                    <small>Effective tier ${escapeHtml(perfTier.toUpperCase())}</small>
                </div>
            </div>
            <div class="performance-preset-settings-grid">
                ${renderDesktopPerformancePresetSettingsChoice('low-end', selectedPerformancePreset, recommendedPerformancePreset)}
                ${renderDesktopPerformancePresetSettingsChoice('high-end', selectedPerformancePreset, recommendedPerformancePreset)}
            </div>
            <p class="performance-preset-settings-note">Saved on this PC until you change it. Reduced Motion remains a separate accessibility preference.</p>
        </section>
    `;
    const experienceSettingsHtml = `
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Settings Profiles</h3>
                        <p class="text-xs text-gray-400 mt-1">One-click bundles for playback, visuals, and queue tuning.</p>
                    </div>
                    <span class="text-[10px] text-gray-500">${settingsProfiles.length} profiles</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2" style="grid-template-columns: repeat(auto-fit, minmax(9.25rem, 1fr));">${profileButtonsHtml}</div>
            </section>
            <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Appearance & Startup</h3>
                        <p class="text-xs text-gray-400 mt-1">Theme, density, startup tab, and visual intensity.</p>
                    </div>
                    <span class="text-[10px] text-gray-500">${escapeHtml(appearancePrefs.themeMode.toUpperCase())}</span>
                </div>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Theme', help.themeMode)}
                    <select onchange="setAppSettingValue('appearance','themeMode', this.value, { rerenderSettings: true })" class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white">
                        <option value="dark" ${appearancePrefs.themeMode === 'dark' ? 'selected' : ''}>Dark</option>
                        <option value="light" ${appearancePrefs.themeMode === 'light' ? 'selected' : ''}>Light</option>
                        <option value="system" ${appearancePrefs.themeMode === 'system' ? 'selected' : ''}>System</option>
                    </select>
                </label>
                <div class="grid grid-cols-2 gap-3">
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Density', help.density)}
                        <select onchange="setAppSettingValue('appearance','density', this.value, { rerenderSettings: true })" class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white">
                            <option value="cozy" ${appearancePrefs.density === 'cozy' ? 'selected' : ''}>Cozy</option>
                            <option value="compact" ${appearancePrefs.density === 'compact' ? 'selected' : ''}>Compact</option>
                        </select>
                    </label>
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Default View', help.defaultViewMode)}
                        <select onchange="setAppSettingValue('appearance','defaultViewMode', this.value, { syncViewMode: true, rerenderSettings: true })" class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white">
                            <option value="list" ${appearancePrefs.defaultViewMode === 'list' ? 'selected' : ''}>List</option>
                            <option value="grid" ${appearancePrefs.defaultViewMode === 'grid' ? 'selected' : ''}>Grid</option>
                        </select>
                    </label>
                </div>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Default Start Tab', help.defaultStartTab)}
                    <select onchange="setAppSettingValue('appearance','defaultStartTab', this.value, { rerenderSettings: true })" class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white">${startTabOptions}</select>
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Sidebar Width', help.sidebarWidth)} <span id="sidebar-width-value" class="text-gray-500">${appearancePrefs.sidebarWidth}px</span>
                    <input type="range" min="240" max="420" step="4" value="${appearancePrefs.sidebarWidth}" class="mt-3 w-full" oninput="document.getElementById('sidebar-width-value').textContent = this.value + 'px'; setAppSettingValue('appearance','sidebarWidth', Number(this.value))">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Visualizer Intensity', help.visualizerIntensity)} <span id="visualizer-intensity-value" class="text-gray-500">${appearancePrefs.visualizerIntensity.toFixed(2)}x</span>
                    <input type="range" min="0.25" max="1.75" step="0.05" value="${appearancePrefs.visualizerIntensity}" class="mt-3 w-full" oninput="document.getElementById('visualizer-intensity-value').textContent = Number(this.value).toFixed(2) + 'x'; setAppSettingValue('appearance','visualizerIntensity', Number(this.value))">
                </label>
                <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <span>
                        ${renderSettingCardTitle('Reduced Motion', help.reducedMotion)}
                        <span class="block text-xs text-gray-400 mt-1">Disable most animations and hover motion.</span>
                    </span>
                    <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${appearancePrefs.reducedMotion ? 'checked' : ''} onchange="setAppSettingValue('appearance','reducedMotion', this.checked, { rerenderSettings: true })">
                </label>
            </section>
            <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Playback Behavior</h3>
                        <p class="text-xs text-gray-400 mt-1">Autoplay, seek step, default speeds, and focus handling.</p>
                    </div>
                    <span class="text-[10px] text-gray-500">${playbackPrefs.seekStepSeconds}s seek</span>
                </div>
                <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <span>
                        ${renderSettingCardTitle('Autoplay on Track Click', help.autoplayOnTrackClick)}
                        <span class="block text-xs text-gray-400 mt-1">When off, clicking a track loads it without starting playback.</span>
                    </span>
                    <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${playbackPrefs.autoplayOnTrackClick ? 'checked' : ''} onchange="setAppSettingValue('playback','autoplayOnTrackClick', this.checked, { rerenderSettings: true })">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Seek Step', help.seekStepSeconds)} <span id="seek-step-value" class="text-gray-500">${playbackPrefs.seekStepSeconds}s</span>
                    <input type="range" min="2" max="30" step="1" value="${playbackPrefs.seekStepSeconds}" class="mt-3 w-full" oninput="document.getElementById('seek-step-value').textContent = this.value + 's'; setAppSettingValue('playback','seekStepSeconds', Number(this.value))">
                </label>
                <div class="grid grid-cols-2 gap-3">
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Audio Speed', help.speedAudio)} <span id="audio-speed-value" class="text-gray-500">${playbackPrefs.speedAudio.toFixed(2)}x</span>
                        <input type="range" min="0.5" max="2.5" step="0.05" value="${playbackPrefs.speedAudio}" class="mt-3 w-full" oninput="document.getElementById('audio-speed-value').textContent = Number(this.value).toFixed(2) + 'x'; setAppSettingValue('playback','speedAudio', Number(this.value))">
                    </label>
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Video Speed', help.speedVideo)} <span id="video-speed-value" class="text-gray-500">${playbackPrefs.speedVideo.toFixed(2)}x</span>
                        <input type="range" min="0.5" max="2.5" step="0.05" value="${playbackPrefs.speedVideo}" class="mt-3 w-full" oninput="document.getElementById('video-speed-value').textContent = Number(this.value).toFixed(2) + 'x'; setAppSettingValue('playback','speedVideo', Number(this.value))">
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Skip Intro', help.skipIntroSeconds)} <span id="skip-intro-value" class="text-gray-500">${playbackPrefs.skipIntroSeconds}s</span>
                        <input type="range" min="0" max="60" step="1" value="${playbackPrefs.skipIntroSeconds}" class="mt-3 w-full" oninput="document.getElementById('skip-intro-value').textContent = this.value + 's'; setAppSettingValue('playback','skipIntroSeconds', Number(this.value))">
                    </label>
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Skip Outro', help.skipOutroSeconds)} <span id="skip-outro-value" class="text-gray-500">${playbackPrefs.skipOutroSeconds}s</span>
                        <input type="range" min="0" max="60" step="1" value="${playbackPrefs.skipOutroSeconds}" class="mt-3 w-full" oninput="document.getElementById('skip-outro-value').textContent = this.value + 's'; setAppSettingValue('playback','skipOutroSeconds', Number(this.value))">
                    </label>
                </div>
                <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <span>
                        ${renderSettingCardTitle('Pause When App Loses Focus', help.pauseWhenHidden)}
                        <span class="block text-xs text-gray-400 mt-1">Pauses playback when the tab or window becomes hidden.</span>
                    </span>
                    <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${playbackPrefs.pauseWhenHidden ? 'checked' : ''} onchange="setAppSettingValue('playback','pauseWhenHidden', this.checked, { rerenderSettings: true })">
                </label>
            </section>
            <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Resume & History</h3>
                        <p class="text-xs text-gray-400 mt-1">Separate resume controls, session history, and retention limits.</p>
                    </div>
                    <span class="text-[10px] text-gray-500">${(state.playHistory || []).length} recent items</span>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <span>
                            ${renderSettingCardTitle('Local Resume', help.localResume)}
                            <span class="block text-xs text-gray-400 mt-1">Remember imported track positions.</span>
                        </span>
                        <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${resumePrefs.localEnabled ? 'checked' : ''} onchange="setAppSettingValue('resume','localEnabled', this.checked, { rerenderSettings: true })">
                    </label>
                    <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <span>
                            ${renderSettingCardTitle('Online Video Resume', help.onlineResume)}
                            <span class="block text-xs text-gray-400 mt-1">Remember direct and embedded video URL positions. YouTube music search does not use universal resume.</span>
                        </span>
                        <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${resumePrefs.onlineEnabled ? 'checked' : ''} onchange="setAppSettingValue('resume','onlineEnabled', this.checked, { rerenderSettings: true })">
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Minimum Length for Resume', help.minimumDurationSeconds)} <span id="resume-min-value" class="text-gray-500">${resumePrefs.minimumDurationSeconds}s</span>
                        <input type="range" min="0" max="300" step="5" value="${resumePrefs.minimumDurationSeconds}" class="mt-3 w-full" oninput="document.getElementById('resume-min-value').textContent = this.value + 's'; setAppSettingValue('resume','minimumDurationSeconds', Number(this.value))">
                    </label>
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('History Retention', help.historyLimit)} <span id="history-limit-value" class="text-gray-500">${resumePrefs.historyLimit}</span>
                        <input type="range" min="5" max="250" step="5" value="${resumePrefs.historyLimit}" class="mt-3 w-full" oninput="document.getElementById('history-limit-value').textContent = this.value; setAppSettingValue('resume','historyLimit', Number(this.value))">
                    </label>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <div class="flex items-start justify-between gap-3">
                        <span>
                            ${renderSettingCardTitle('Private Session', help.privateSessionLaunch)}
                            <span class="block text-xs text-gray-400 mt-1">Open a dedicated private page where imports, searches, and playlist lookups stay temporary.</span>
                        </span>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button onclick="openPrivateSessionFromSettings()" class="px-3 py-2 rounded-lg text-xs border border-orange-300/40 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30">Start Private Session</button>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button onclick="clearAllResumeMarkers()" class="px-3 py-2 rounded-lg text-xs border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20">Clear Resume Markers</button>
                    <button onclick="clearHistory(); persistAppStateNow(); if (state.activeTab === 'settings') renderSettingsTab();" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Clear Play History</button>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div class="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-3">Resume Manager</div>
                    ${renderResumeManagerRows()}
                </div>
            </section>
            <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Video Playback</h3>
                        <p class="text-xs text-gray-400 mt-1">Remember per-video tuning, set immersive defaults, and protect lyric overlay spacing.</p>
                    </div>
                    <span class="text-[10px] text-gray-500">${Math.round(videoPrefs.frameStepSeconds * 1000)}ms step</span>
                </div>
                <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <span>
                        ${renderSettingCardTitle('Remember Adjustments Per Video', help.rememberPerVideoAdjustments)}
                        <span class="block text-xs text-gray-400 mt-1">Store brightness, contrast, and sharpness for each imported video.</span>
                    </span>
                    <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${videoPrefs.rememberPerVideoAdjustments ? 'checked' : ''} onchange="setAppSettingValue('video','rememberPerVideoAdjustments', this.checked, { rerenderSettings: true })">
                </label>
                <div class="grid grid-cols-2 gap-3">
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Video Open Mode', help.fullscreenBehavior)}
                        <select onchange="setAppSettingValue('video','fullscreenBehavior', this.value, { rerenderSettings: true })" class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white">
                            <option value="manual" ${videoPrefs.fullscreenBehavior === 'manual' ? 'selected' : ''}>Manual</option>
                            <option value="immersive" ${videoPrefs.fullscreenBehavior === 'immersive' ? 'selected' : ''}>Immersive Overlay</option>
                            <option value="immersive_fullscreen" ${videoPrefs.fullscreenBehavior === 'immersive_fullscreen' ? 'selected' : ''}>Immersive + Fullscreen</option>
                        </select>
                    </label>
                    <label class="text-xs text-gray-400">${renderSettingInlineLabel('Picture in Picture', help.pipBehavior)}
                        <select onchange="setAppSettingValue('video','pipBehavior', this.value, { rerenderSettings: true })" class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white">
                            <option value="manual" ${videoPrefs.pipBehavior === 'manual' ? 'selected' : ''}>Manual</option>
                            <option value="auto_on_video_mode" ${videoPrefs.pipBehavior === 'auto_on_video_mode' ? 'selected' : ''}>Auto in Video Mode</option>
                        </select>
                    </label>
                </div>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Frame Step', help.frameStepSeconds)} <span id="video-frame-step-value" class="text-gray-500">${Math.round(videoPrefs.frameStepSeconds * 1000)}ms</span>
                    <input type="range" min="0.02" max="0.2" step="0.005" value="${videoPrefs.frameStepSeconds}" class="mt-3 w-full" oninput="document.getElementById('video-frame-step-value').textContent = Math.round(Number(this.value) * 1000) + 'ms'; setAppSettingValue('video','frameStepSeconds', Number(this.value))">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Lyric Safe Offset', help.lyricSafeOffsetPx)} <span id="video-lyric-offset-value" class="text-gray-500">${videoPrefs.lyricSafeOffsetPx}px</span>
                    <input type="range" min="120" max="260" step="10" value="${videoPrefs.lyricSafeOffsetPx}" class="mt-3 w-full" oninput="document.getElementById('video-lyric-offset-value').textContent = this.value + 'px'; setAppSettingValue('video','lyricSafeOffsetPx', Number(this.value))">
                </label>
            </section>
        </div>
        <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Online Music & Desktop</h3>
                    <p class="text-xs text-gray-400 mt-1">${isDesktopRuntime ? 'Provider fallback, desktop downloads, autoplay radio, and watch-folder sync.' : 'Provider fallback and autoplay radio work here. MP3 downloads and watch-folder sync stay in the desktop app.'}</p>
                </div>
                <div class="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">
                    ${isDesktopRuntime ? `
                        <span>${activeDownloadJobs} active jobs</span>
                        <span>|</span>
                        <span>${importReviewItems.length} review items</span>
                        <span>|</span>
                        <span>${watchedTrackCount} watched tracks</span>
                    ` : `
                        <span>browser mode</span>
                        <span>|</span>
                        <span>${importReviewItems.length} review items</span>
                        <span>|</span>
                        <span>${watchedFolders.length} saved watch folders</span>
                    `}
                </div>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div class="rounded-2xl border border-white/10 bg-black/30 p-4 flex flex-col gap-4">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">Provider Controls</div>
                        <div class="mt-1 text-xs text-gray-400">Set provider credentials here for YouTube discovery quota and playlist import.</div>
                    </div>
                    <label class="text-xs text-gray-400">
                        Custom YouTube API Key
                        <input type="text" value="${escapeHtml(onlineMusicPrefs.customApiKey || '')}" placeholder="AIza..." class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white placeholder:text-gray-500" onchange="setOnlineMusicCustomApiKey(this.value)">
                    </label>
                    <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <span>
                            <span class="block text-sm text-white">Prefer YouTube Discovery</span>
                            <span class="block text-xs text-gray-400 mt-1">When off, iTunes and Deezer metadata stay primary and YouTube search enrichment is skipped.</span>
                        </span>
                        <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${onlineMusicPrefs.preferYoutubeDiscovery ? 'checked' : ''} onchange="setAppSettingValue('onlineMusic','preferYoutubeDiscovery', this.checked, { rerenderSettings: true })">
                    </label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="rounded-xl border ${getOnlineMusicProviderHealthTone(providerHealth.youtubeDiscovery)} px-3 py-3">
                            <div class="text-[10px] font-black uppercase tracking-[0.16em]">YouTube Discovery</div>
                            <div class="mt-1 text-sm">${escapeHtml(formatOnlineMusicProviderHealthLabel(providerHealth.youtubeDiscovery || 'unknown'))}</div>
                        </div>
                        <div class="rounded-xl border ${getOnlineMusicProviderHealthTone(providerHealth.youtubePlaybackResolver)} px-3 py-3">
                            <div class="text-[10px] font-black uppercase tracking-[0.16em]">Playback Resolver</div>
                            <div class="mt-1 text-sm">${escapeHtml(formatOnlineMusicProviderHealthLabel(providerHealth.youtubePlaybackResolver || 'unknown'))}</div>
                        </div>
                    </div>
                    <div class="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-gray-400">
                        <div>Last message: <span class="text-gray-200">${escapeHtml(providerHealth.lastMessage || 'No provider errors in this session.')}</span></div>
                        <div class="mt-1">Updated: <span class="text-gray-200">${providerHealth.lastUpdatedAt ? escapeHtml(formatElapsedSince(providerHealth.lastUpdatedAt)) : 'Never'}</span></div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="resetOnlineMusicProviderStateFromSettings()" class="px-3 py-2 rounded-lg text-xs border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">Reset Provider State</button>
                        <button onclick="changeTab('online-music')" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Open Online Music</button>
                    </div>
                </div>
                <div class="rounded-2xl border border-white/10 bg-black/30 p-4 flex flex-col gap-4">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">${isDesktopRuntime ? 'Downloads, Radio & Watch Folders' : 'Radio & Desktop Tools'}</div>
                        <div class="mt-1 text-xs text-gray-400">${isDesktopRuntime ? 'Desktop-only storage helpers stay hidden on the web build.' : 'Autoplay radio works here. Download automation and watch-folder sync stay dormant until the desktop app is running.'}</div>
                    </div>
                    <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <span>
                            <span class="block text-sm text-white">Auto Import Downloads</span>
                            <span class="block text-xs text-gray-400 mt-1">${isDesktopRuntime ? 'Bring release and track downloads into the local library automatically.' : 'Desktop only. This setting becomes active in the Electron app.'}</span>
                        </span>
                        <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${onlineMusicPrefs.autoImportDownloads ? 'checked' : ''} ${isDesktopRuntime ? '' : 'disabled'} onchange="setAppSettingValue('onlineMusic','autoImportDownloads', this.checked, { rerenderSettings: true })">
                    </label>
                    <label class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <span>
                            <span class="block text-sm text-white">Autoplay Radio</span>
                            <span class="block text-xs text-gray-400 mt-1">When an audio queue ends, build a radio-style continuation from local tracks first, then online context if needed.</span>
                        </span>
                        <input type="checkbox" class="mt-1 h-4 w-4 accent-cyan-500" ${onlineMusicPrefs.autoplayRadioEnabled ? 'checked' : ''} onchange="setAppSettingValue('onlineMusic','autoplayRadioEnabled', this.checked, { rerenderSettings: true })">
                    </label>
                    ${isDesktopRuntime ? `
                        <div class="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-gray-300">
                            <div>Download jobs: <span class="text-white">${downloadJobs.length}</span></div>
                            <div class="mt-1">Completed: <span class="text-white">${completedDownloadJobs}</span> | Errors: <span class="text-white">${errorDownloadJobs}</span></div>
                            <div class="mt-1">Import review: <span class="text-white">${importReviewItems.length}</span></div>
                        </div>
                    ` : `
                        <div class="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-xs text-gray-400">
                            <div>Browser mode keeps autoplay radio and provider health live.</div>
                            <div class="mt-1">Saved desktop jobs: <span class="text-white">${downloadJobs.length}</span> | Saved watch folders: <span class="text-white">${watchedFolders.length}</span></div>
                            <div class="mt-1">Import review: <span class="text-white">${importReviewItems.length}</span> | Watched tracks remembered: <span class="text-white">${watchedTrackCount}</span></div>
                            <div class="mt-1">Open the desktop app to run MP3 downloads, refresh watch folders, or resume desktop sync.</div>
                        </div>
                    `}
                    ${isDesktopRuntime ? `
                        <div class="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                            <div class="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div class="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300/80">Watch Folders</div>
                                    <div class="mt-1 text-xs text-gray-400">${watchedFolders.length} folder${watchedFolders.length === 1 ? '' : 's'} configured | ${watchedTrackCount} tracked file${watchedTrackCount === 1 ? '' : 's'}</div>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <button onclick="pickLibraryWatchFolders()" class="px-3 py-2 rounded-lg text-xs border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">Add Folders</button>
                                    <button onclick="scanLibraryWatchFoldersNow()" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Rescan Now</button>
                                </div>
                            </div>
                            <div class="mt-3 space-y-2">
                                ${watchedFolders.length
                                    ? watchedFolders.map((root) => `
                                        <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                                            <div class="min-w-0">
                                                <div class="truncate text-sm text-white">${escapeHtml(root.name || root.path || 'Folder')}</div>
                                                <div class="truncate text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(root.path || '')}</div>
                                            </div>
                                            <button onclick="removeLibraryWatchFolder(${JSON.stringify(sanitizeText(root.id || root.path || ''))})" class="px-3 py-2 rounded-lg text-[11px] border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20">Remove</button>
                                        </div>
                                    `).join('')
                                    : '<div class="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-gray-500">No watch folders configured yet.</div>'}
                            </div>
                        </div>
                    ` : `
                        <div class="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-gray-500">Watch folders stay read-only on the web build. NexPlay remembers ${watchedFolders.length} saved folder${watchedFolders.length === 1 ? '' : 's'} from desktop sessions, but only the Electron app can scan or sync them.</div>
                    `}
                </div>
            </div>
        </section>
        <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Queue Intelligence</h3>
                    <p class="text-xs text-gray-400 mt-1">Tune how Smart Auto-Queue scores favorites, recency, tags, and pacing.</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] ${smartQueueStatus ? 'text-emerald-300' : 'text-amber-300'}">${smartQueueStatus ? 'SMART QUEUE ON' : 'SMART QUEUE OFF'}</span>
                    ${smartQueueStatus ? '' : `<button onclick="setFeatureEnabled('${FEATURE_REGISTRY.core_smart_autoqueue}', true)" class="px-3 py-2 rounded-lg text-[10px] uppercase tracking-wide border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10">Enable</button>`}
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Queue Source', help.allowedQueueSources)}
                    <select onchange="setAppSettingValue('queue','allowedSources', this.value, { rerenderSettings: true })" class="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white">
                        <option value="both" ${queuePrefs.allowedSources === 'both' ? 'selected' : ''}>Both</option>
                        <option value="local" ${queuePrefs.allowedSources === 'local' ? 'selected' : ''}>Local only</option>
                        <option value="online" ${queuePrefs.allowedSources === 'online' ? 'selected' : ''}>Online only</option>
                    </select>
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Favorite Weight', help.favoriteWeight)} <span id="queue-favorite-value" class="text-gray-500">${queuePrefs.favoriteWeight}</span>
                    <input type="range" min="0" max="100" step="1" value="${queuePrefs.favoriteWeight}" class="mt-3 w-full" oninput="document.getElementById('queue-favorite-value').textContent = this.value; setAppSettingValue('queue','favoriteWeight', Number(this.value))">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Recency Weight', help.recencyWeight)} <span id="queue-recency-value" class="text-gray-500">${queuePrefs.recencyWeight}</span>
                    <input type="range" min="0" max="100" step="1" value="${queuePrefs.recencyWeight}" class="mt-3 w-full" oninput="document.getElementById('queue-recency-value').textContent = this.value; setAppSettingValue('queue','recencyWeight', Number(this.value))">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Same Artist Penalty', help.sameArtistPenalty)} <span id="queue-artist-penalty-value" class="text-gray-500">${queuePrefs.sameArtistPenalty}</span>
                    <input type="range" min="0" max="100" step="1" value="${queuePrefs.sameArtistPenalty}" class="mt-3 w-full" oninput="document.getElementById('queue-artist-penalty-value').textContent = this.value; setAppSettingValue('queue','sameArtistPenalty', Number(this.value))">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Tag Affinity', help.tagAffinityWeight)} <span id="queue-tag-affinity-value" class="text-gray-500">${queuePrefs.tagAffinityWeight}</span>
                    <input type="range" min="0" max="100" step="1" value="${queuePrefs.tagAffinityWeight}" class="mt-3 w-full" oninput="document.getElementById('queue-tag-affinity-value').textContent = this.value; setAppSettingValue('queue','tagAffinityWeight', Number(this.value))">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Long-form Bias', help.longFormBias)} <span id="queue-longform-value" class="text-gray-500">${queuePrefs.longFormBias}</span>
                    <input type="range" min="-100" max="100" step="1" value="${queuePrefs.longFormBias}" class="mt-3 w-full" oninput="document.getElementById('queue-longform-value').textContent = this.value; setAppSettingValue('queue','longFormBias', Number(this.value))">
                </label>
                <label class="text-xs text-gray-400">${renderSettingInlineLabel('Story Mode Aggression', help.storyModeAggression)} <span id="queue-story-value" class="text-gray-500">${queuePrefs.storyModeAggression}</span>
                    <input type="range" min="0" max="100" step="1" value="${queuePrefs.storyModeAggression}" class="mt-3 w-full" oninput="document.getElementById('queue-story-value').textContent = this.value; setAppSettingValue('queue','storyModeAggression', Number(this.value))">
                </label>
            </div>
        </section>
        </div>
    `;
    container.innerHTML = `
        <div id="settings-page" class="w-full max-w-5xl mx-auto flex flex-col gap-6">
            <div class="holo-panel rounded-2xl p-5 md:p-6">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 class="text-white text-lg font-black tracking-wide">Feature Settings</h2>
                        <p class="text-xs text-gray-400 mt-1">All advanced features are OFF by default. Changes apply instantly and are persisted.</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button id="settings-private-session-launcher" onclick="openPrivateSessionFromSettings()" class="px-4 py-2 rounded-lg text-xs border border-orange-300/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30 font-black uppercase tracking-[0.14em]">Start Private Session</button>
                        <button onclick="applyFeaturePreset('all_off')" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">All Off</button>
                        <button onclick="applyFeaturePreset('core_essentials')" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Core Essentials</button>
                        <button onclick="applyFeaturePreset('creative_lab')" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Creative Lab</button>
                        <button onclick="applyFeaturePreset('everything_on')" class="px-3 py-2 rounded-lg text-xs border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">Everything On</button>
                        <button onclick="resetFeatureToggles()" class="px-3 py-2 rounded-lg text-xs border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20">Reset to Defaults</button>
                    </div>
                </div>
            </div>
            <section class="rounded-[1.5rem] border border-orange-300/30 bg-gradient-to-br from-orange-500/18 via-amber-500/10 to-slate-950/80 p-5 shadow-[0_18px_50px_rgba(251,146,60,0.12)]">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0">
                        <div class="text-[10px] font-black uppercase tracking-[0.2em] text-orange-100/90">Private Session</div>
                        <h3 class="mt-2 text-xl font-black text-white">Open the dedicated private page.</h3>
                        <p class="mt-2 max-w-2xl text-sm leading-6 text-orange-50/80">Imports, online song searches, and playlist lookups stay temporary and are cleared when you leave private mode.</p>
                    </div>
                    <button id="settings-private-session-hero-launcher" onclick="openPrivateSessionFromSettings()" class="shrink-0 rounded-2xl border border-orange-200/50 bg-orange-400 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_28px_rgba(251,191,36,0.25)] transition hover:scale-[1.02] hover:bg-orange-300">Start Private Session</button>
                </div>
            </section>
            ${performanceSettingsHtml}
            ${experienceSettingsHtml}
            <div class="holo-panel rounded-2xl p-5 md:p-6">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Live Performance Diagnostics</h3>
                        <p class="text-xs text-gray-400 mt-1">FPS sample and adaptive visual tier. Presets never change playback behavior.</p>
                    </div>
                    <div class="text-xs font-mono ${perfToneClass}">FPS ${fpsValue} / ${escapeHtml(perfTier.toUpperCase())}</div>
                </div>
                <div class="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <p class="text-xs text-gray-300">Measured tier: <span class="text-white">${escapeHtml(measuredPerfTier.toUpperCase())}</span> · Likely heavy toggles ON: <span class="text-white">${heavyEnabledText}</span></p>
                    <button onclick="disableWindowedHeavyFeatures()" class="px-3 py-2 rounded-lg text-xs border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20">Disable Heavy Windowed Visuals</button>
                </div>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <section class="holo-panel rounded-2xl p-5 flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Core Reinforcement</h3>
                        <span class="text-[10px] text-gray-500">6 toggles</span>
                    </div>
                    ${renderFeatureToggleRows(FEATURE_GROUPS.core)}
                </section>
                <section class="holo-panel rounded-2xl p-5 flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Creative / Signature</h3>
                        <span class="text-[10px] text-gray-500">6 toggles</span>
                    </div>
                    ${renderFeatureToggleRows(FEATURE_GROUPS.creative)}
                </section>
            </div>
            <section class="holo-panel rounded-2xl p-5 flex flex-col gap-4">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-bold text-white uppercase tracking-[0.14em]">Creative Controls</h3>
                    <span class="text-[10px] text-gray-500">Entry points remain hidden when feature is OFF</span>
                </div>
                <div data-feature-id="${FEATURE_REGISTRY.creative_scene_packs}" class="flex flex-col gap-2 hidden">
                    <div class="text-xs text-gray-300">Scene Pack</div>
                    <div class="flex flex-wrap gap-2">${sceneOptions}</div>
                </div>
                <div data-feature-id="${FEATURE_REGISTRY.creative_mood_dial}" class="hidden">
                    <div class="flex items-center justify-between text-xs text-gray-300 mb-2">
                        <span>Mood Dial Bias</span>
                        <span id="mood-dial-value" class="font-mono">${moodValue}</span>
                    </div>
                    <input type="range" min="-100" max="100" step="1" value="${moodValue}" class="w-full" oninput="setMoodDial(this.value)">
                </div>
                <div data-feature-id="${FEATURE_REGISTRY.core_offline_export_import}" class="flex flex-wrap gap-2 hidden">
                    <button onclick="exportBackup()" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Export Backup</button>
                    <button onclick="document.getElementById('backup-import-input')?.click()" class="px-3 py-2 rounded-lg text-xs border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10">Import Backup</button>
                    <input id="backup-import-input" type="file" accept="application/json" class="hidden" onchange="importBackupFromFile(event)">
                </div>
                <div data-feature-id="${FEATURE_REGISTRY.core_chapter_bookmarks}" class="hidden">
                    <div class="text-xs text-gray-300 mb-2">Current Track Bookmarks</div>
                    ${renderCurrentBookmarkList()}
                </div>
                <div data-feature-id="${FEATURE_REGISTRY.creative_moment_capture}" class="hidden">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs text-gray-300">Moment Captures</span>
                        <button onclick="captureMomentPrompt()" class="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-gray-200 hover:bg-white/10">Capture Now</button>
                    </div>
                    ${renderMomentList()}
                </div>
                <div data-feature-id="${FEATURE_REGISTRY.creative_story_mode}" class="hidden flex items-center justify-between gap-3">
                    <span class="text-xs text-gray-300">Generate warmup -> peak -> cooldown queue</span>
                    <button onclick="generateStoryModeQueue()" class="px-3 py-2 rounded-lg text-xs border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">Generate Story Queue</button>
                </div>
            </section>
        </div>
    `;
    applyFeatureVisibility();
    refreshLucideIcons();
}

function setEmptyStateVariant(variant, config = {}) {
    const welcome = document.getElementById('empty-state-welcome');
    const basic = document.getElementById('empty-state-basic');
    const titleEl = document.getElementById('empty-state-title');
    const subtitleEl = document.getElementById('empty-state-subtitle');
    const primaryBtn = document.getElementById('empty-state-primary-action');
    const secondaryBtn = document.getElementById('empty-state-secondary-action');
    if (!welcome || !basic) return;

    const showWelcome = variant === 'welcome';
    welcome.classList.toggle('hidden', !showWelcome);
    basic.classList.toggle('hidden', showWelcome);
    if (showWelcome) return;

    if (titleEl) titleEl.textContent = config.title || 'Nothing here yet';
    if (subtitleEl) subtitleEl.textContent = config.subtitle || 'Import songs or change views to get started.';

    if (primaryBtn) {
        if (config.primaryActionLabel && typeof config.primaryAction === 'function') {
            primaryBtn.textContent = config.primaryActionLabel;
            primaryBtn.onclick = config.primaryAction;
            primaryBtn.classList.remove('hidden');
        } else {
            primaryBtn.onclick = null;
            primaryBtn.classList.add('hidden');
        }
    }

    if (secondaryBtn) {
        if (config.secondaryActionLabel && typeof config.secondaryAction === 'function') {
            secondaryBtn.textContent = config.secondaryActionLabel;
            secondaryBtn.onclick = config.secondaryAction;
            secondaryBtn.classList.remove('hidden');
        } else {
            secondaryBtn.onclick = null;
            secondaryBtn.classList.add('hidden');
        }
    }
}

function getEmptyStateConfig() {
    const query = (state.searchQuery || '').trim();
    if (query) {
        return {
            title: 'No matches found',
            subtitle: `Nothing matched "${query}". Try a different search or clear it to see your full library again.`,
            primaryActionLabel: 'Clear Search',
            primaryAction: () => clearSearch(null, true),
            secondaryActionLabel: 'Open Library',
            secondaryAction: () => changeTab('all')
        };
    }

    const importSongs = () => requestMediaImport();
    const goLibrary = () => changeTab('all');

    switch (state.activeTab) {
        case 'favorites':
            return {
                title: 'No favorites yet',
                subtitle: 'Click the heart on any track you love and it will appear here.',
                primaryActionLabel: 'Open Library',
                primaryAction: goLibrary
            };
        case 'history':
            return {
                title: 'No history yet',
                subtitle: 'Play a track once and NexPlay will remember it here.',
                primaryActionLabel: 'Open Library',
                primaryAction: goLibrary
            };
        case 'top':
            return {
                title: 'Nothing ranked yet',
                subtitle: 'Your most-played tracks will show up here after you spend some time listening.',
                primaryActionLabel: 'Open Library',
                primaryAction: goLibrary
            };
        case 'audio':
            return {
                title: 'No songs in this view',
                subtitle: 'Import audio files like MP3, M4A, FLAC, WAV, AAC, or OGG to fill this section.',
                primaryActionLabel: 'Import Songs',
                primaryAction: importSongs,
                secondaryActionLabel: 'Open Library',
                secondaryAction: goLibrary
            };
        case 'videos':
            return {
                title: 'No videos in this view',
                subtitle: 'Import local video files like MP4, WebM, MOV, or MKV if you want them in NexPlay too.',
                primaryActionLabel: 'Import Media',
                primaryAction: importSongs,
                secondaryActionLabel: 'Open Library',
                secondaryAction: goLibrary
            };
        default:
            return {
                title: 'Nothing here yet',
                subtitle: 'Import songs or switch views to keep exploring your library.',
                primaryActionLabel: 'Import Songs',
                primaryAction: importSongs
            };
    }
}

