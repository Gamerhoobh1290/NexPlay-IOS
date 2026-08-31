/* Legacy init() definition. The modular app orchestrator calls this after modules register.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- INITIALIZATION ---
	        async function init() {
	            const abnormalExitDetected = detectAbnormalPreviousExit();
    const requestedAppRoute = getAppRouteFromHash(window.location.hash || '');
	            if (abnormalExitDetected) {
	                logRecovery('abnormal-exit-detected', 'Previous session appears to have ended abnormally. Using safer restore path.');
	            }
	            // Load Persistence
	            const parsed = readPersistedAppState(null);
    if (parsed && typeof parsed === 'object') {
        state.volume = parsed.volume ?? 0.8;
        state.isDarkMode = parsed.isDarkMode ?? true;
        state.viewMode = parsed.viewMode ?? state.viewMode;
        state.sortType = parsed.sortType ?? state.sortType;
        state.sortDirection = parsed.sortDirection ?? state.sortDirection;
        state.playbackSpeed = parsed.playbackSpeed ?? state.playbackSpeed;
        // Restore accent and theme preferences
        state.accentColor = parsed.accentColor ?? state.accentColor;
        state.visualizerStyle = normalizeVisualizerStyle(parsed.visualizerStyle ?? state.visualizerStyle);
	                state.keyBindings = sanitizeKeyBindings(parsed.keyBindings ?? state.keyBindings);
	                state.playHistory = Array.isArray(parsed.playHistory) ? parsed.playHistory.filter(Boolean) : state.playHistory;
	                state.listeningHistory = parsed.listeningHistory ?? state.listeningHistory;
	                restoreTotalListeningTime(parsed);
        state.crossfadeDuration = parsed.crossfadeDuration ?? state.crossfadeDuration;
        state.crossfadeEnabled = (parsed.crossfadeDuration ?? 0) > 0;
        state.autoAccentFromArt = parsed.autoAccentFromArt ?? false;
        state.autoQueueEnabled = parsed.autoQueueEnabled ?? state.autoQueueEnabled;
        state.notyPad = sanitizeNotyPadState(parsed.notyPad || createDefaultNotyPadState());
        state.appSettings = sanitizeAppSettings(parsed.appSettings || {
            appearance: { themeMode: parsed.themeMode || (parsed.isDarkMode === false ? 'light' : 'dark') }
        });
        state.viewMode = state.appSettings.appearance.defaultViewMode || state.viewMode;
        state.activeTab = state.appSettings.appearance.defaultStartTab || state.activeTab;
        applyAppSettings({ syncViewMode: true });
        // Apply accent color and ambient glow
        setAccentColor(state.accentColor, { fromAuto: state.autoAccentFromArt });
    }
	            // Always start with mode overlays disabled to avoid stale persisted state
    loadDesktopPerformancePreset();
    applyDesktopPerformancePresetRuntime();
    state.customLyricsCache = readStorageJson('nexplay_pro_lyrics', state.customLyricsCache || {});
    if (!state.customLyricsCache || typeof state.customLyricsCache !== 'object') {
        state.customLyricsCache = {};
    }
    state.offlineLyricsCache = readStorageJson('nexplay_pro_offline_lyrics', {});
    if (!state.offlineLyricsCache || typeof state.offlineLyricsCache !== 'object') {
        state.offlineLyricsCache = {};
    }
    state.metadataStore = sanitizeStoredMetadata(readStorageJson('nexplay_pro_metadata', {}));
    state.playlists = sanitizeStoredPlaylists(readStorageJson('nexplay_pro_playlists', []));
    state.savedVideoLinks = sanitizeStoredVideoLinks(readStorageJson(VIDEO_URL_LIBRARY_KEY, []));
    const rawSavedOnlineMusic = readStorageJson(ONLINE_MUSIC_STATE_KEY, null);
    if (rawSavedOnlineMusic && typeof rawSavedOnlineMusic === 'object') {
        state.onlineMusic = sanitizeStoredOnlineMusicState(rawSavedOnlineMusic);
    } else {
        state.onlineMusic = createDefaultOnlineMusicState();
    }
    hydrateOnlineMusicReleaseTracksCache();
    loadFeatureToggles();
    loadExtendedStores();
    applyFeatureRuntimeGuards();
    bindSystemThemeListener();
    applyAppSettings({ syncViewMode: true });

    purgeStoredSpotifyImportsOnStartup();
    state.tracks = [...DEMO_TRACKS];
    syncOnlineLibraryIntoMainLibrary();
    applyLegacyOnlineMusicMigration(rawSavedOnlineMusic);
	            clearOnlineMusicResumeMetadata();
	            // Initialize active queue snapshot (defaults to audio)
	            loadQueueBucket('audio');
	            normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
	            let restoredSession = false;
	            try {
	                restoredSession = await restoreSessionSnapshotSafely({
	                    safeMode: abnormalExitDetected
	                });
	            } catch (error) {
	                logError('session-restore-failed', 'Session restore failed and was skipped safely', {
	                    error: sanitizeText(error?.message || '')
	                });
	            }
	            if (abnormalExitDetected) {
	                showInternalNotice('Recovered from previous abnormal shutdown.', 'warn', { duration: 3200 });
	            }
	            
	            // Build UI
	            renderNav();
    syncLibraryOnlineToggleButton();
    renderTracks();
    renderVideoUrlPlayer(state.currentUrlVideoSource);
    renderVideoUrlLibrary();
    updateLibraryStatsLabel();
    renderOnlineMusicContent();
    buildEQ();
    // Update library stats to reflect demo tracks on first load
    const statsEl = document.getElementById('library-stats');
    if (statsEl) {
        statsEl.innerHTML = `${state.tracks.length} <span class="text-xs font-normal text-gray-500">tracks</span>`;
    }
    
	            // Initialize Audio Defaults
	            els.audio.volume = state.volume;
	            updateVolumeUI(state.volume);
	            
	            if (!restoredSession && requestedAppRoute !== 'private-session' && state.tracks.length > 0 && !state.currentTrackId) {
	                const startupTrack = state.tracks.find((track) => track && track.source !== 'online-music');
	                if (startupTrack) loadTrack(startupTrack.id, false);
	            }
    
    setupEventListeners();
    setupHeaderOverflowControls();
    window.addEventListener('hashchange', handlePrivateSessionRouteChange);
    restartLibraryWatchFromSettings({ quiet: true }).catch((error) => {
        console.error(error);
    });
    syncSidebarVisibility();
    refreshLucideIcons();
    // Initialize shuffle & repeat icons state
    updateShuffleIcon();
    updateRepeatIcon();
    syncCrossfadeUI();
    const sortSel = document.getElementById('sort-select');
    if (sortSel) sortSel.value = `${state.sortType}-${state.sortDirection}`;

    // Set initial playback speed label and highlight
    setSpeed(state.playbackSpeed);
    // Sync visualizer label/menu with the current style (normalized)
    state.visualizerStyle = normalizeVisualizerStyle(state.visualizerStyle);
    syncVisualizerMenu(state.visualizerStyle);
    // Sync auto-accent toggle state
    syncAutoAccentToggle();
    renderMiniQueuePeek();
    syncSearchClear();
	            setupVideoFsInteractions();
	            maybeShowDesktopPerformancePresetOnboarding({ route: requestedAppRoute });
	            startPerfSampler();
	            startPlaybackHealthMonitor();
	            markSessionRuntimeActive();
	            persistSessionSnapshot({ reason: 'init' });
    window.dispatchEvent(new CustomEvent('nexplay:app-ready', {
	                detail: {
	                    trackCount: state.tracks.length,
            currentTrackId: state.currentTrackId
        }
    }));
    window.setTimeout(() => {
        if (state.activeTab === 'online-music' && navigator.onLine !== false) {
            prewarmOnlineMusicPlayer();
        }
    }, 250);
    hydratePersistedLocalLibraryIntoState().catch((error) => {
        console.warn('Failed to restore persisted local library', error);
    });
	            // Normalize persisted state shape early so old oversized payloads do not block future saves.
	            persistMetadataStoreWithFallback();
	            persistAppStateNow();
    applyAppRoute(requestedAppRoute, { quiet: true, preserveScroll: false, force: true });
	            scheduleDebugOverlayRefresh();
	        }

function setupHeaderOverflowControls() {
    const overflow = document.getElementById('header-overflow');
    const trigger = document.getElementById('header-more-trigger');
    const panel = document.getElementById('header-overflow-panel');
    if (!overflow || !trigger || !panel || trigger.dataset.headerOverflowBound === 'true') return;

    trigger.dataset.headerOverflowBound = 'true';
    const inlineLayout = window.matchMedia('(min-width: 1500px)');
    const focusableSelector = [
        'button:not([disabled])',
        'select:not([disabled])',
        'input:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    let isOpen = false;

    const setPanelInert = (inert) => {
        if (inert) panel.setAttribute('inert', '');
        else panel.removeAttribute('inert');
    };

    const renderState = () => {
        const isInline = inlineLayout.matches;
        panel.dataset.presentation = isInline ? 'inline' : 'popover';
        trigger.setAttribute('aria-expanded', String(!isInline && isOpen));
        panel.classList.toggle('is-open', !isInline && isOpen);
        panel.setAttribute('aria-hidden', String(!isInline && !isOpen));
        setPanelInert(!isInline && !isOpen);
    };

    const focusTrigger = () => {
        window.requestAnimationFrame(() => {
            if (typeof trigger.focus === 'function') trigger.focus();
        });
    };

    const closeOverflow = ({ returnFocus = false } = {}) => {
        const wasOpen = isOpen;
        isOpen = false;
        renderState();
        if (wasOpen && returnFocus) focusTrigger();
    };

    const openOverflow = ({ focusLast = false } = {}) => {
        if (inlineLayout.matches) return;
        isOpen = true;
        renderState();
        window.requestAnimationFrame(() => {
            const controls = Array.from(panel.querySelectorAll(focusableSelector));
            const target = focusLast ? controls[controls.length - 1] : controls[0];
            if (target && typeof target.focus === 'function') target.focus();
        });
    };

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        if (isOpen) closeOverflow({ returnFocus: true });
        else openOverflow();
    });
    trigger.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        openOverflow({ focusLast: event.key === 'ArrowUp' });
    });
    panel.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closeOverflow({ returnFocus: true });
    });
    document.addEventListener('pointerdown', (event) => {
        if (isOpen && !overflow.contains(event.target)) closeOverflow();
    });
    document.addEventListener('focusin', (event) => {
        if (isOpen && !overflow.contains(event.target)) closeOverflow();
    });

    const closeForResize = () => {
        const shouldReturnFocus = isOpen && panel.contains(document.activeElement);
        closeOverflow({ returnFocus: shouldReturnFocus });
        renderState();
    };
    window.addEventListener('resize', closeForResize, { passive: true });
    if (typeof inlineLayout.addEventListener === 'function') {
        inlineLayout.addEventListener('change', closeForResize);
    } else if (typeof inlineLayout.addListener === 'function') {
        inlineLayout.addListener(closeForResize);
    }
    renderState();
}

function setupEventListeners() {
    if (setupEventListenersBound) return;
    setupEventListenersBound = true;
    if (!els.audio) return;
    normalizeRuntimeState();
    attachHyperionActionDelegation();
    // Audio Events
	            els.audio.addEventListener('loadedmetadata', () => {
            if (isOnlineMusicDirectAudioActive()) {
                finishSourceLoad();
                const online = getOnlineMusicState();
                const current = getOnlineMusicCurrentTrack();
                const dur = getMediaDurationSafe(els.audio, Number(current?.duration || online.duration || 0));
                if (dur > 0) {
                    online.duration = dur;
                    if (current) {
                        online.currentTrack = { ...current, duration: Math.max(Number(current.duration) || 0, dur) };
                        updateVisibleTrackDurationLabels(current.id, dur);
                    }
                }
                online.currentTime = getMediaCurrentTimeSafe(els.audio);
                state.currentPlaybackSource = 'online-music';
                clearOnlineMusicConnectTimeout();
                clearOnlineMusicConnectingAttempt({ trackId: onlineMusicDirectAudioMode.trackId, sessionId: online.sessionId });
                updateProgress();
                syncOnlineMusicPlayerCard();
                syncOnlineMusicResultRows();
                return;
            }
	                if (state.currentPlaybackSource === 'online-music') return;
	                finishSourceLoad();
	                const dur = els.audio.duration;
            const isolatePreviewUi = isMusicGamePreviewActive();
            const suppressMusicGameMetrics = shouldSuppressMusicGameMetrics();
	                if(dur && !isNaN(dur)) {
                if (!isolatePreviewUi) {
	                        ['mini-seek-slider', 'windowedModeSeekSlider', 'fsModeSeekSlider', 'videoFsModeSeekSlider'].forEach(s => { 
	                            const el = document.getElementById(s);
	                            if (!el) return;
	                            el.max = dur; 
	                            el.value = 0;
	                            el.disabled = false; 
	                        });
	                        ['mini-time-duration', 'windowedModeTimeDuration', 'fsModeTimeDuration'].forEach(el => {
	                            const elem = document.getElementById(el);
	                            if (elem) elem.textContent = formatTime(dur);
	                        });
        ['mini-time-current','windowedModeTimeCurrent','fsModeTimeCurrent','videoFsTimeCurrent'].forEach(id => {
	                            const t = document.getElementById(id);
	                            if (t) t.textContent = '0:00';
	                        });
	                        ['mini-progress-fill','windowedModeProgressFill','fsModeProgressFill','videoFsModeProgressFill'].forEach(id => {
	                            const bar = document.getElementById(id);
	                            if (bar) bar.style.width = '0%';
	                        });
                }
            const track = getMusicGameTransportTrack();
            if (track) {
                track.duration = dur;
                updateVisibleTrackDurationLabels(track.id, dur);
                if (!suppressMusicGameMetrics) {
                    persistTrackMetadata(track);
                    if (track.type === 'video') {
                        applyRememberedVideoAdjustments(track);
                    }
                    if (!pendingResumeTime && shouldUseLocalResume(dur)) {
                        const storedResume = getStoredTrackResume(track);
                        if (storedResume > 1) pendingResumeTime = storedResume;
                    }
                    if (pendingResumeTime) {
                        const target = Math.min(pendingResumeTime, Math.max(0, dur - 0.25));
                        if (target > 1) {
                            safeSeekMedia(els.audio, target);
                        }
                        pendingResumeTime = null;
                    } else {
                        const introSkip = clampNumber(getAppSettings().playback.skipIntroSeconds, 0, 120, 0);
                        if (introSkip > 0 && dur > introSkip + 1) {
                            safeSeekMedia(els.audio, introSkip);
                        }
                    }
                } else {
                    pendingResumeTime = null;
                }
            }
	                    const rem = document.getElementById('videoFsTimeRemaining');
	                    if (rem && !isolatePreviewUi) rem.textContent = `-${formatClock(dur)}`;
            if (!suppressMusicGameMetrics && track?.type === 'video') maybeApplyVideoModeDefaults(track);
	                    if (!isolatePreviewUi) refreshLiveViews();
	                }
	            });
    els.audio.addEventListener('leavepictureinpicture', () => {
        autoManagedVideoPiP = false;
    });
	            aud.ontimeupdate = () => {
            if (isOnlineMusicDirectAudioActive()) {
                clearOnlineMusicDirectAudioStallTimer();
                captureOnlineMusicProgress();
                return;
            }
            updateProgress();
        };
	            els.audio.addEventListener('ended', () => { 
            if (isOnlineMusicDirectAudioActive()) {
                const online = getOnlineMusicState();
                const current = getOnlineMusicCurrentTrack();
                const endedTrackId = normalizeOnlineMusicTrackId(onlineMusicDirectAudioMode.trackId || online.currentTrackId || '');
                const position = getMediaCurrentTimeSafe(els.audio);
                const duration = getMediaDurationSafe(els.audio, Number(current?.duration || online.duration || 0));
                online.currentTime = position;
                if (isOnlineMusicPlaybackEndPremature(current, position, duration)) {
                    handleOnlineMusicDirectAudioStreamInterruption('ended-early').catch((error) => {
                        logError('online-direct-audio-ended-recovery-failed', 'Desktop audio early-end recovery failed', {
                            trackId: sanitizeText(endedTrackId || ''),
                            error: sanitizeText(error?.message || '')
                        });
                    });
                    return;
                }
                clearOnlineMusicDirectAudioStallTimer();
                online.isPlaying = false;
                state.isPlaying = false;
                stopOnlineMusicProgressTimer();
                captureOnlineMusicProgress({ forcePersist: true });
                logPlaybackState('ended', 'Online direct audio playback ended', {
                    trackId: sanitizeText(endedTrackId || '')
                });
                if (isMusicGamePreviewActive()) {
                    stopMusicGamePreview({ restore: false, resetShell: false });
                    return;
                }
                playNext();
                return;
            }
	                if (state.currentPlaybackSource === 'online-music') return;
	                logPlaybackState('ended', 'Local media ended', {
	                    trackId: sanitizeText(state.currentTrackId || ''),
	                    repeatMode: sanitizeText(state.repeatMode || 'none')
	                });
	                if (isMusicGamePreviewActive()) {
	                    stopMusicGamePreview({ restore: false, resetShell: false });
	                    return;
        }
        // Clear the progress interval when track ends
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
        window.dispatchEvent(new CustomEvent('nexplay:track-ended', {
            detail: {
                trackId: state.currentTrackId,
                repeatMode: state.repeatMode
            }
        }));
        // When repeating a single track (repeatMode === 'one'), rely on
        // the HTMLAudioElement's loop property to restart playback.  In
        // this case, skip calling playNext() to avoid advancing the
        // queue.  Restart playback explicitly so the timeupdate and
        // progress intervals resume.
        if (state.repeatMode === 'one') {
            // Restart the current track from the beginning and resume playback.  We do not rely on
            // the HTMLAudioElement loop property, so we reset currentTime manually.
            skipOutroHandledTrackId = null;
            safeSeekMedia(els.audio, 0);
            handoffToLocalPlayback({ resetOnlineTime: false });
            safePlayMedia(els.audio, { waitForReady: false, timeoutMs: 4000 });
            return;
        }
	                playNext();
	            });
	            els.audio.addEventListener('play', () => { 
            if (isOnlineMusicDirectAudioActive()) {
                clearOnlineMusicDirectAudioStallTimer();
                finishSourceLoad();
                const online = getOnlineMusicState();
                state.currentPlaybackSource = 'online-music';
                online.isPlaying = true;
                state.isPlaying = true;
                clearOnlineMusicConnectTimeout();
                clearOnlineMusicConnectingAttempt({ trackId: onlineMusicDirectAudioMode.trackId, sessionId: online.sessionId });
                startOnlineMusicProgressTimer();
                captureOnlineMusicProgress({ forcePersist: true });
                logPlaybackState('play', 'Online direct audio playback entered playing state', {
                    trackId: sanitizeText(onlineMusicDirectAudioMode.trackId || online.currentTrackId || '')
                });
                if (!isMusicGamePreviewActive()) {
                    updatePlayIcons();
                    refreshPlayingIndicators();
                    syncOnlineMusicPlayerCard();
                    syncOnlineMusicResultRows();
                }
                return;
            }
	                if (state.currentPlaybackSource === 'online-music') {
	                    safePauseMedia(els.audio);
	                    return;
	                }
	                finishSourceLoad();
	                handoffToLocalPlayback({ resetOnlineTime: false, stopLocalTransport: false });
	                state.currentPlaybackSource = 'local';
	                state.isPlaying = true;
	                logPlaybackState('play', 'Local playback entered playing state', {
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                if (!isMusicGamePreviewActive()) {
	                    updatePlayIcons();
	                    refreshPlayingIndicators();
            ensureActiveTrackHighlight();
        }
        const current = getMusicGameTransportTrack();
        if (!shouldSuppressMusicGameMetrics() && current && state.lastCountedTrackId !== current.id) {
            current.playCount = (current.playCount || 0) + 1;
            state.lastCountedTrackId = current.id;
            persistTrackMetadata(current);
        }
        if (current && isPrivateSessionTrackRecord(current) && isPrivateSessionRouteActive()) {
            renderPrivateSessionCollections();
        }
        if (state.videoFsModeActive) {
            showVideoControls();
        }
        initAudioContext();
        // Start a manual interval to update progress regularly in case timeupdate events are infrequent
        if (state.progressInterval) clearInterval(state.progressInterval);
        state.progressInterval = setInterval(() => {
            updateProgress();
        }, 250);
	            });
	            els.audio.addEventListener('pause', () => { 
            if (isOnlineMusicDirectAudioActive()) {
                clearOnlineMusicDirectAudioStallTimer();
                const online = getOnlineMusicState();
                online.isPlaying = false;
                state.isPlaying = false;
                stopOnlineMusicProgressTimer();
                captureOnlineMusicProgress({ forcePersist: true });
                logPlaybackState('pause', 'Online direct audio playback paused', {
                    trackId: sanitizeText(onlineMusicDirectAudioMode.trackId || online.currentTrackId || '')
                });
                if (!isMusicGamePreviewActive()) {
                    updatePlayIcons();
                    refreshPlayingIndicators();
                    syncOnlineMusicPlayerCard();
                    syncOnlineMusicResultRows();
                }
                return;
            }
	                if (state.currentPlaybackSource === 'online-music') return;
	                state.isPlaying = false;
	                logPlaybackState('pause', 'Local playback entered paused state', {
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                if (!isMusicGamePreviewActive()) {
	                    updatePlayIcons();
	                    refreshPlayingIndicators();
            showVideoControls(true);
        }
        if (isPrivateSessionRouteActive() && isPrivateSessionTrackRecord(getCurrentTrack())) {
            renderPrivateSessionCollections();
        }
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
    });
    // Video-specific telemetry
    ['waiting','stalled'].forEach(ev => els.audio.addEventListener(ev, () => {
        if (isOnlineMusicDirectAudioActive()) armOnlineMusicDirectAudioStallTimer(ev);
        setVideoSpinner(state.videoFsModeActive);
    }));
    ['seeking','loadstart'].forEach(ev => els.audio.addEventListener(ev, () => setVideoSpinner(state.videoFsModeActive)));
    ['canplay','playing','seeked'].forEach(ev => els.audio.addEventListener(ev, () => {
        if (isOnlineMusicDirectAudioActive()) clearOnlineMusicDirectAudioStallTimer();
        setVideoSpinner(false);
    }));
    els.audio.addEventListener('progress', () => {
        if (isOnlineMusicDirectAudioActive()) clearOnlineMusicDirectAudioStallTimer();
        updateVideoBufferBar();
    });
	            els.audio.addEventListener('error', async () => {
            // Capture ownership before any await or UI mutation. The shared
            // media element can emit a delayed error for the source it just
            // replaced, and that event must not finish the newer source load.
            const failedTrack = getCurrentTrack();
            const failedTrackId = sanitizeText(failedTrack?.id || '');
            const failedMediaSource = sanitizeText(els.audio.currentSrc || els.audio.src || '').trim();
            const failedPlaybackSource = sanitizeText(state.currentPlaybackSource || '');
            if (failedPlaybackSource === 'online-music' || isOnlineMusicDirectAudioActive()) {
                await handleOnlineMusicDirectAudioElementError();
                return;
            }
	                if (state.currentPlaybackSource === 'online-music') return;
	                if (localTrackMediaRecoveryInFlight) return;
            const activeTrackId = sanitizeText(state.currentTrackId || '');
            if (failedTrackId && activeTrackId && failedTrackId !== activeTrackId) return;
            const expectedTrackSource = sanitizeText(failedTrack?.url || '').trim();
            const normalizeSource = (value) => safeCall(
                () => new URL(value, window.location.href).href,
                value
            );
            if (
                failedMediaSource
                && expectedTrackSource
                && normalizeSource(failedMediaSource) !== normalizeSource(expectedTrackSource)
            ) return;
	                finishSourceLoad();
	                setVideoSpinner(false);
            if (failedTrack && sanitizeText(failedTrack.source || '') === 'local') {
                localTrackMediaRecoveryInFlight = true;
                try {
                    const recovery = await tryRecoverLocalTrackMediaSource(failedTrack);
                    if (
                        sanitizeText(state.currentTrackId || '') !== failedTrackId
                        || state.currentPlaybackSource === 'online-music'
                    ) return;
                    if (recovery.recovered) return;
                    if (recovery.missing) {
                        state.isPlaying = false;
                        updatePlayIcons();
                        logError('media-error-missing-file', 'Local media file is missing from disk', {
                            trackId: sanitizeText(state.currentTrackId || ''),
                            sourcePath: sanitizeText(failedTrack?.sourcePath || '')
                        });
                        showToast('This song file is missing from disk. Restore it or import it again.', 'error');
                        syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
                        return;
                    }
                } finally {
                    localTrackMediaRecoveryInFlight = false;
                }
            }
	                state.isPlaying = false;
	                updatePlayIcons();
	                logError('media-error', 'Media element reported an error and playback was stopped safely', {
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                showInternalNotice('Media source failed, playback stopped safely.', 'warn');
	                showToast('Media source failed to load. Playback stopped safely.', 'error');
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	            });

    // UI Interaction
    const volSlider = safeQuery('#vol-slider');
    if (volSlider) volSlider.addEventListener('input', handleVolume);
    const themeToggle = safeQuery('#theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    const sidebarToggle = safeQuery('#sidebar-toggle');
    if (sidebarToggle) sidebarToggle.addEventListener('click', openSidebar);
    const sidebarCloseBtn = document.getElementById('sidebar-close');
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', closeSidebar);
    }
    window.addEventListener('resize', syncSidebarVisibility);
    const searchInput = safeQuery('#search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            syncSearchClear();
            if (state.searchDebounceTimer) {
                clearTimeout(state.searchDebounceTimer);
            }
            state.searchDebounceTimer = setTimeout(() => {
                renderTracks({ preserveScroll: true });
            }, 120);
        });
    }
    const fileUploadInput = safeQuery('#file-upload');
    const privateFileUploadInput = safeQuery('#private-file-upload');
    if (fileUploadInput) fileUploadInput.addEventListener('change', handleFileUpload);
    if (privateFileUploadInput) privateFileUploadInput.addEventListener('change', handlePrivateSessionFileUpload);
    const videoUrlInput = document.getElementById('video-url-input');
    const videoUrlLoadBtn = document.getElementById('video-url-load-btn');
    const videoUrlSaveBtn = document.getElementById('video-url-save-btn');
    const videoUrlLibrary = document.getElementById('video-url-library');
    const onlineMusicSearchInput = document.getElementById('online-music-search-input');
    const onlineMusicSearchBtn = document.getElementById('online-music-search-btn');
    const onlineMusicPlaylistUrlInput = document.getElementById('online-music-playlist-url-input');
    const onlineMusicPlaylistImportBtn = document.getElementById('online-music-playlist-import-btn');
    const onlineMusicContent = document.getElementById('online-music-content');
    const onlineMusicSeek = document.getElementById('online-music-seek-slider');
    const onlineMusicVolume = document.getElementById('online-music-volume-slider');
    const onlineMusicPlayBtn = document.getElementById('online-music-play-btn');
    const onlineMusicPrevBtn = document.getElementById('online-music-prev-btn');
    const onlineMusicNextBtn = document.getElementById('online-music-next-btn');
    const onlineMusicSaveCurrentBtn = document.getElementById('online-music-save-current-btn');
    const onlineMusicFavoriteCurrentBtn = document.getElementById('online-music-favorite-current-btn');
    const onlineMusicCurrentArtistBtn = document.getElementById('online-music-current-artist');
    const privateSessionImportBtn = document.getElementById('private-session-import-btn');
    const privateSessionSearchInput = document.getElementById('private-session-search-input');
    const privateSessionSearchBtn = document.getElementById('private-session-search-btn');
    const privateSessionPlaylistInput = document.getElementById('private-session-playlist-url-input');
    const privateSessionPlaylistImportBtn = document.getElementById('private-session-playlist-import-btn');
    const privateSessionExitBtn = document.getElementById('private-session-exit-btn');
    if (videoUrlLoadBtn) {
        videoUrlLoadBtn.addEventListener('click', () => loadPastedVideoUrl());
    }
    if (videoUrlSaveBtn) {
        videoUrlSaveBtn.addEventListener('click', () => saveCurrentVideoUrl());
    }
    if (videoUrlInput) {
        videoUrlInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            loadPastedVideoUrl();
        });
        // Required UX: pasting a URL should load immediately.
        videoUrlInput.addEventListener('paste', () => {
            setTimeout(() => loadPastedVideoUrl({ quiet: true }), 0);
        });
    }
    if (videoUrlLibrary) {
        videoUrlLibrary.addEventListener('click', handleVideoUrlLibraryClick);
        videoUrlLibrary.addEventListener('change', handleVideoUrlLibraryChange);
    }
    const videoLinkCollectionFilter = document.getElementById('video-link-collection-filter');
    if (videoLinkCollectionFilter) {
        videoLinkCollectionFilter.addEventListener('change', handleVideoUrlLibraryChange);
    }
    if (onlineMusicSearchBtn) {
        onlineMusicSearchBtn.addEventListener('click', () => searchOnlineMusic({ source: 'button' }));
    }
    if (onlineMusicSearchInput) {
        onlineMusicSearchInput.addEventListener('input', (e) => {
            handleOnlineMusicLiveSearchInput(e.target?.value || '', {
                isComposing: !!e.isComposing
            });
        });
        onlineMusicSearchInput.addEventListener('compositionstart', () => {
            setOnlineMusicLiveSearchCompositionActive(true);
        });
        onlineMusicSearchInput.addEventListener('compositionend', (e) => {
            setOnlineMusicLiveSearchCompositionActive(false);
            handleOnlineMusicLiveSearchInput(e.target?.value || '', { compositionEnded: true });
        });
        onlineMusicSearchInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            if (e.isComposing) return;
            e.preventDefault();
            searchOnlineMusic({ source: 'enter' });
        });
    }
    if (onlineMusicPlaylistImportBtn) {
        onlineMusicPlaylistImportBtn.addEventListener('click', () => {
            const raw = onlineMusicPlaylistUrlInput?.value || '';
            importYouTubeMusicPlaylistFromInput(raw).catch((err) => {
                console.error(err);
                updateOnlineMusicFeedback(err?.message || 'Playlist import failed.', 'error');
                showToast(err?.message || 'Playlist import failed.', 'error');
            });
        });
    }
    if (onlineMusicPlaylistUrlInput) {
        onlineMusicPlaylistUrlInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            importYouTubeMusicPlaylistFromInput(onlineMusicPlaylistUrlInput.value || '').catch((err) => {
                console.error(err);
                updateOnlineMusicFeedback(err?.message || 'Playlist import failed.', 'error');
                showToast(err?.message || 'Playlist import failed.', 'error');
            });
        });
    }
    if (privateSessionImportBtn) {
        privateSessionImportBtn.addEventListener('click', () => requestPrivateSessionImport());
    }
    if (privateSessionSearchBtn) {
        privateSessionSearchBtn.addEventListener('click', () => searchPrivateSessionOnlineMusic());
    }
    if (privateSessionSearchInput) {
        privateSessionSearchInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            searchPrivateSessionOnlineMusic();
        });
    }
    if (privateSessionPlaylistImportBtn) {
        privateSessionPlaylistImportBtn.addEventListener('click', () => {
            importPrivateSessionPlaylistFromInput(privateSessionPlaylistInput?.value || '').catch((error) => {
                console.error(error);
                setPrivateSessionFeedback(error?.message || 'Private playlist import failed.', 'error');
            });
        });
    }
    if (privateSessionPlaylistInput) {
        privateSessionPlaylistInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            importPrivateSessionPlaylistFromInput(privateSessionPlaylistInput.value || '').catch((error) => {
                console.error(error);
                setPrivateSessionFeedback(error?.message || 'Private playlist import failed.', 'error');
            });
        });
    }
    if (privateSessionExitBtn) {
        privateSessionExitBtn.addEventListener('click', () => changeTab('settings'));
    }
    if (releaseOnlineMusicDownloadListener) {
        releaseOnlineMusicDownloadListener();
        releaseOnlineMusicDownloadListener = null;
    }
    if (onlineMusicDownloadQueueListener) {
        onlineMusicDownloadQueueListener();
        onlineMusicDownloadQueueListener = null;
    }
    if (libraryWatchUpdateListener) {
        libraryWatchUpdateListener();
        libraryWatchUpdateListener = null;
    }
    if (nexPlayDesktopBridge && typeof nexPlayDesktopBridge.onOnlineTrackDownloadProgress === 'function') {
        releaseOnlineMusicDownloadListener = nexPlayDesktopBridge.onOnlineTrackDownloadProgress((payload) => {
            handleOnlineMusicDownloadProgress(payload || {});
        });
    }
    if (nexPlayDesktopBridge && typeof nexPlayDesktopBridge.onOnlineDownloadQueueUpdate === 'function') {
        onlineMusicDownloadQueueListener = nexPlayDesktopBridge.onOnlineDownloadQueueUpdate((payload) => {
            applyOnlineMusicDownloadQueueUpdate(payload || {});
        });
    }
    if (nexPlayDesktopBridge && typeof nexPlayDesktopBridge.onLibraryWatchUpdate === 'function') {
        libraryWatchUpdateListener = nexPlayDesktopBridge.onLibraryWatchUpdate((payload) => {
            reconcileWatchedFolderSnapshot(payload || {});
        });
    }
    if (onlineMusicContent) {
        onlineMusicContent.addEventListener('click', handleOnlineMusicContentClick);
        onlineMusicContent.addEventListener('input', handleOnlineMusicContentInput);
        onlineMusicContent.addEventListener('change', handleOnlineMusicContentChange);
    }
	            if (onlineMusicSeek) {
	                onlineMusicSeek.addEventListener('input', (e) => {
	                    onlineMusicSuppressSeekSync = true;
	                    const value = Number(e.target.value || 0);
	                    logAction('seek-input', 'Online seek slider moved', { target: value });
	                    const online = getOnlineMusicState();
	                    online.currentTime = value;
	                    const currentEl = document.getElementById('online-music-time-current');
	                    if (currentEl) currentEl.textContent = formatTime(value);
	                    scheduleOnlineMusicSeek(value);
	                });
	                onlineMusicSeek.addEventListener('change', async (e) => {
	                    const value = Number(e.target.value || 0);
	                    await seekOnlineMusicTo(value, { forcePersist: true });
	                    logAction('seek-success', 'Online seek slider commit applied', { target: value });
	                    onlineMusicSuppressSeekSync = false;
	                });
        onlineMusicSeek.addEventListener('mouseup', () => { onlineMusicSuppressSeekSync = false; });
        onlineMusicSeek.addEventListener('touchend', () => { onlineMusicSuppressSeekSync = false; });
    }
    if (onlineMusicVolume) {
        onlineMusicVolume.addEventListener('input', (e) => setOnlineMusicVolume(Number(e.target.value || 0)));
    }
    if (onlineMusicPlayBtn) {
        onlineMusicPlayBtn.addEventListener('click', () => toggleOnlineMusicPlayback());
    }
    if (onlineMusicPrevBtn) {
        onlineMusicPrevBtn.addEventListener('click', () => playPrevOnlineMusic());
    }
    if (onlineMusicNextBtn) {
        onlineMusicNextBtn.addEventListener('click', () => playNextOnlineMusic());
    }
    if (onlineMusicSaveCurrentBtn) {
        onlineMusicSaveCurrentBtn.addEventListener('click', () => saveOnlineMusicTrackToLibrary(getOnlineMusicState().currentTrackId));
    }
    if (onlineMusicFavoriteCurrentBtn) {
        onlineMusicFavoriteCurrentBtn.addEventListener('click', () => toggleOnlineMusicFavorite(getOnlineMusicState().currentTrackId));
    }
    if (onlineMusicCurrentArtistBtn) {
        onlineMusicCurrentArtistBtn.addEventListener('click', () => openOnlineMusicArtistFromCurrentTrack());
    }
    const coverInput = document.getElementById('edit-cover');
    if (coverInput) {
        coverInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const data = await readFileAsDataURL(file);
            const preview = document.getElementById('edit-cover-preview');
            if (preview) {
                preview.src = data;
                preview.classList.remove('hidden');
            }
        });
    }

    // Toggleable menus for speed, sleep timer, accent picker, visualizer style and crossfade
    const speedBtn = document.getElementById('speed-btn');
    const speedMenu = document.getElementById('speed-menu');
    const sleepBtn = document.getElementById('sleep-btn');
    const sleepMenu = document.getElementById('sleep-menu');
    const accentBtn = document.getElementById('accent-btn');
    const accentMenu = document.getElementById('accent-menu');
    const vizBtn = document.getElementById('viz-btn');
    const vizMenu = document.getElementById('viz-menu');
    const crossBtn = document.getElementById('crossfade-btn');
    const crossMenu = document.getElementById('crossfade-menu');

    function showMenu(menu) {
        if (!menu) return;
        menu.classList.remove('hidden');
        requestAnimationFrame(() => menu.classList.add('menu-open'));
    }
    function hideMenu(menu) {
        if (!menu) return;
        menu.classList.remove('menu-open');
        setTimeout(() => menu.classList.add('hidden'), 220);
    }
    function toggleMenu(menu) {
        if (!menu) return;
        const isOpen = menu.classList.contains('menu-open');
        if (isOpen) hideMenu(menu); else showMenu(menu);
    }
    // Set up click handlers for each button to toggle its menu and hide others
    if (speedBtn && speedMenu) {
        speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu(speedMenu);
            hideMenu(sleepMenu);
            hideMenu(accentMenu);
            hideMenu(vizMenu);
            hideMenu(crossMenu);
        });
    }
    if (sleepBtn && sleepMenu) {
        sleepBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu(sleepMenu);
            hideMenu(speedMenu);
            hideMenu(accentMenu);
            hideMenu(vizMenu);
            hideMenu(crossMenu);
        });
    }
    if (crossBtn && crossMenu) {
        crossBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu(crossMenu);
            hideMenu(speedMenu);
            hideMenu(sleepMenu);
            hideMenu(accentMenu);
            hideMenu(vizMenu);
        });
        const slider = document.getElementById('crossfade-slider');
        if (slider) {
            slider.addEventListener('input', (e) => {
                setCrossfadeDuration(parseFloat(e.target.value), true);
            });
        }
    }
    if (accentBtn && accentMenu) {
        accentBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu(accentMenu);
            hideMenu(speedMenu);
            hideMenu(sleepMenu);
            hideMenu(crossMenu);
            hideMenu(vizMenu);
        });
    }
    if (vizBtn && vizMenu) {
        vizBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu(vizMenu);
            hideMenu(speedMenu);
            hideMenu(sleepMenu);
            hideMenu(crossMenu);
            hideMenu(accentMenu);
        });
    }
    // Hide menus when clicking outside of them
    document.addEventListener('click', (e) => {
        const menus = [speedMenu, sleepMenu, crossMenu, accentMenu, vizMenu];
        const buttons = [speedBtn, sleepBtn, crossBtn, accentBtn, vizBtn];
        menus.forEach((menu, i) => {
            const btn = buttons[i];
            if (menu && menu.classList.contains('menu-open')) {
                const clickOnButton = btn && btn.contains ? btn.contains(e.target) : false;
                if (!menu.contains(e.target) && !clickOnButton) {
                    hideMenu(menu);
                }
            }
        });
        const clickTarget = e.target instanceof Element ? e.target : null;
        const clickPath = typeof e.composedPath === 'function' ? e.composedPath() : [];
        const eqPanel = document.getElementById('eq-panel');
        const eqToggleClicked = !!clickTarget?.closest('[onclick*="toggleEQPanel"]');
        if (eqPanel && !eqPanel.classList.contains('hidden') && !eqPanel.contains(clickTarget) && !eqToggleClicked) {
            eqPanel.classList.add('hidden');
        }
        const queuePanel = document.getElementById('queue-overlay');
        const queueToggle = document.getElementById('queue-toggle');
        const clickInsideQueue = queuePanel
            ? (clickPath.includes(queuePanel) || (!!clickTarget && queuePanel.contains(clickTarget)))
            : false;
        const clickOnQueueToggle = queueToggle
            ? (clickPath.includes(queueToggle) || (!!clickTarget && queueToggle.contains(clickTarget)))
            : false;
        if (queuePanel && state.isQueueOverlayOpen && !clickInsideQueue && !clickOnQueueToggle) {
            closeTransientPanels({ queue: true, eq: false, menus: false });
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTransientPanels({ queue: true, eq: true, menus: true });
        }
    });
    
    // Seekers
	            ['mini-seek-slider', 'windowedModeSeekSlider', 'fsModeSeekSlider', 'videoFsModeSeekSlider'].forEach(sliderId => {
	                const slider = document.getElementById(sliderId);
	                if (!slider) return;
	                slider.addEventListener('input', (e) => {
	                    const t = Number(e.target.value);
                if (isOnlineMusicPlaybackActive()) {
                    const online = getOnlineMusicState();
                    online.currentTime = t;
                    const current = getOnlineMusicCurrentTrack();
                    if (current) {
                        online.currentTrack = {
                            ...current,
                            duration: Math.max(Number(current.duration) || 0, Number(online.duration) || 0),
                            resumePosition: 0,
                            resumeUpdatedAt: 0
                        };
                    }
                }
	                    const miniTime = document.getElementById('mini-time-current');
	                    const windowedTime = document.getElementById('windowedModeTimeCurrent');
	                    const fsModeTime = document.getElementById('fsModeTimeCurrent');
	                    const videoTime = document.getElementById('videoFsModeTimeCurrent');
	                    if (miniTime) miniTime.textContent = formatTime(t);
	                    if (windowedTime) windowedTime.textContent = formatTime(t);
	                    if (fsModeTime) fsModeTime.textContent = formatTime(t);
	                    if (videoTime) videoTime.textContent = formatTime(t);
	                    
	                    // Visual update while dragging
	                    if(slider.max > 0) {
	                        const pct = (t / slider.max) * 100;
	                        const miniFill = document.getElementById('mini-progress-fill');
	                        const windowedFill = document.getElementById('windowedModeProgressFill');
	                        const fsModeFill = document.getElementById('fsModeProgressFill');
	                        const videoFill = document.getElementById('videoFsModeProgressFill');
	                        if (miniFill) miniFill.style.width = pct + '%';
	                        if (windowedFill) windowedFill.style.width = pct + '%';
	                        if (fsModeFill) fsModeFill.style.width = pct + '%';
	                        if (videoFill) videoFill.style.width = pct + '%';
	                    }
                if (isOnlineMusicPlaybackActive()) {
                    updateProgress();
                    scheduleOnlineMusicSeek(t);
                }
	                });
	                slider.addEventListener('change', (e) => {
	                    const t = Number(e.target.value);
	                    logAction('seek-input', 'Seek slider commit requested', {
	                        source: sanitizeText(state.currentPlaybackSource || ''),
	                        target: t
	                    });
	                    if (isOnlineMusicPlaybackActive()) {
	                        scheduleOnlineMusicSeek(t, { flush: true, forcePersist: true });
	                        return;
	                    }
	                    if (!safeSeekMedia(els.audio, t)) {
	                        logError('seek-failed', 'Seek slider commit skipped due invalid media duration', {
	                            target: t
	                        });
	                        updateProgress();
	                        return;
	                    }
	                    logAction('seek-success', 'Seek slider commit applied', { target: t });
	                });
	            });

    // Drag & Drop
    const isFileDrag = (event) => {
        const types = event?.dataTransfer?.types;
        return types && Array.from(types).includes('Files');
    };
    window.addEventListener('dragenter', (e) => { 
        e.preventDefault(); 
        if (state.queueDragging) return;
        if (!isFileDrag(e)) return;
        state.dragCounter++; 
        els.dropZone.classList.remove('hidden');
        els.dropZone.style.pointerEvents = "auto";
        requestAnimationFrame(()=>els.dropZone.style.opacity=1); 
    });
    window.addEventListener('dragleave', (e) => { 
        e.preventDefault(); 
        if (state.queueDragging) return;
        if (!isFileDrag(e)) return;
        state.dragCounter--; 
        if(state.dragCounter <= 0) { 
            state.dragCounter = 0;
            els.dropZone.style.opacity=0; 
            els.dropZone.style.pointerEvents = "none";
            setTimeout(()=>els.dropZone.classList.add('hidden'), 200); 
        } 
    });
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (state.queueDragging) return;
    });
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (state.queueDragging) return;
        if (!isFileDrag(e)) return;
        // Reset drag state and hide the drop zone (which is permanently hidden by CSS anyway)
        state.dragCounter = 0;
        els.dropZone.style.opacity = 0;
        els.dropZone.style.pointerEvents = "none";
        setTimeout(() => els.dropZone.classList.add('hidden'), 200);
        // Only handle file drops when actual files are present.  This avoids treating queue dragâ€‘andâ€‘drop
        // operations as file uploads.
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            if (isPrivateSessionRouteActive()) {
                handlePrivateSessionFiles(e.dataTransfer.files);
            } else {
                handleFiles(e.dataTransfer.files);
            }
        }
    });
    // Safety: clear queue drag guard on any drag end
    window.addEventListener('dragend', () => { state.queueDragging = false; });

    // Keyboard Shortcuts
		            window.addEventListener('keydown', (e) => {
	                    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
	                        e.preventDefault();
	                        toggleDebugOverlay();
	                        return;
	                    }
	                    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
	                        e.preventDefault();
	                        if (state.commandPaletteOpen) closeCommandPalette();
                else openCommandPalette();
                return;
            }
            if (state.commandPaletteOpen) return;
            const shortcutTarget = e.target instanceof Element ? e.target : null;
            const isInteractiveTarget = !!shortcutTarget?.closest([
                'input',
                'textarea',
                'select',
                'button',
                'a[href]',
                'summary',
                '[contenteditable="true"]',
                '[role="button"]',
                '[role="menuitem"]',
                '[role="option"]',
                '[role="slider"]'
            ].join(','));
            if (isInteractiveTarget) return;
            if (handleMusicGamesKeydown(e)) return;
	                const action = Object.keys(state.keyBindings).find(key => state.keyBindings[key] === e.code);
	                if (!action) {
	                    const isVideoActive = state.videoFsModeActive && (state.tracks.find(t => t.id === state.currentTrackId)?.type === 'video');
	                    if (isVideoActive) {
	                        switch (e.code) {
	                            case 'Comma': e.preventDefault(); stepVideoFrames(-1); return;
	                            case 'Period': e.preventDefault(); stepVideoFrames(1); return;
	                            case 'ArrowLeft': {
                            e.preventDefault();
                            const step = getConfiguredSeekStepSeconds(e.shiftKey ? 2 : 1);
                            const current = getMediaCurrentTimeSafe(els.audio);
                            safeSeekMedia(els.audio, Math.max(0, current - step));
                            showVideoControls(true);
                            return;
                        }
	                            case 'ArrowRight': {
                            e.preventDefault();
                            const step = getConfiguredSeekStepSeconds(e.shiftKey ? 2 : 1);
                            const current = getMediaCurrentTimeSafe(els.audio);
                            safeSeekMedia(els.audio, current + step);
                            showVideoControls(true);
                            return;
                        }
	                            case 'ArrowUp': e.preventDefault(); rampVolume(Math.min(1, state.volume + 0.05)); return;
	                            case 'ArrowDown': e.preventDefault(); rampVolume(Math.max(0, state.volume - 0.05)); return;
	                            case 'KeyM': e.preventDefault(); toggleMute(); return;
	                            case 'KeyF': e.preventDefault(); toggleVideoFullscreen(); return;
	                            case 'KeyP': e.preventDefault(); togglePiP(); return;
	                            case 'Space': e.preventDefault(); togglePlay(); return;
	                            case 'Enter': e.preventDefault(); togglePlay(); return;
	                            case 'BracketRight':
	                            case 'Period': break;
	                            case 'BracketLeft':
	                            case 'Comma': break;
	                            case 'Equal':
	                            case 'NumpadAdd': e.preventDefault(); setSpeed(Math.min(2.5, (state.playbackSpeed || 1) + 0.25)); return;
	                            case 'Minus':
	                            case 'NumpadSubtract': e.preventDefault(); setSpeed(Math.max(0.25, (state.playbackSpeed || 1) - 0.25)); return;
	                            default:
	                                if (e.code.startsWith('Digit') && e.code.length === 6) {
	                                    const n = parseInt(e.code.slice(-1), 10);
	                                    if (!isNaN(n) && els.audio && isValidNumber(els.audio.duration) && Number(els.audio.duration) > 0) {
	                                        e.preventDefault();
	                                        const target = (n / 10) * els.audio.duration;
	                                        safeSeekMedia(els.audio, target);
	                                    }
	                                }
	                        }
	                    }
	                    return;
	                }
	                e.preventDefault();
	                switch (action) {
	                    case 'playPause': togglePlay(); break;
	                    case 'next': playNext(); break;
	                    case 'prev': playPrev(); break;
	                    case 'volumeUp': changeVolume(0.1); break;
	                    case 'volumeDown': changeVolume(-0.1); break;
	                    case 'mute': toggleMute(); break;
	                    case 'fsModeToggle': toggleFsModeForCurrentTrack(); break;
	                    default: break;
	                }
	            });
	
	            // Escape closes active modes (explicit, no native API)
		            document.addEventListener('keydown', (e) => {
		                if (e.key !== 'Escape') return;
                if (state.commandPaletteOpen) { closeCommandPalette(); return; }
                if (state.videoFsModeActive) { exitVideoFsMode(); return; }
		                if (state.fsModeActive) { exitFsMode(); return; }
		                if (state.windowedModeActive) { exitWindowedMode(); return; }
                if (state.activeTab === 'music-games' && getMusicGamesState().view === 'game') {
                    const games = getMusicGamesState();
                    if (games.activeGameId === 'piano-tiles') {
                        if (games.pianoTiles.phase === 'gameplay') {
                            e.preventDefault();
                            finishPianoTilesRun('quit');
                        }
                        return;
                    }
                    returnToMusicGamesHub();
                    return;
                }
		            });

	            // Track selection: single-click + drag box
	            setupTrackSelectionInteractions();

	            // Save State on Unload
	            window.addEventListener('beforeunload', () => {
        if (shouldBypassStorageWriteForPrivateSession()) {
            stopPrivateSessionPlaybackRuntime();
            resetPrivateSessionState({ revokeUrls: true });
            markSessionRuntimeInactive('beforeunload-private-session');
            return;
        }
	                // Persist preferences plus a lightweight runtime snapshot for safe restore.
	                persistAppStateNow();
	                persistSessionSnapshot({ reason: 'beforeunload' });
	                markSessionRuntimeInactive('beforeunload');
	                persistLocalLibraryIndex();
	                writeStorageJson('nexplay_pro_lyrics', state.customLyricsCache || {});
	                writeStorageJson('nexplay_pro_offline_lyrics', state.offlineLyricsCache || {});
        persistMetadataStoreWithFallback();
        writeStorageJson('nexplay_pro_playlists', state.playlists || []);
        writeStorageJson(VIDEO_URL_LIBRARY_KEY, state.savedVideoLinks || []);
        captureOnlineMusicProgress({ forcePersist: true });
        persistOnlineMusicState();
        const track = getCurrentTrack();
        if (track) persistTrackResumeEntry(track, Math.max(0, Number(aud.currentTime || 0)), Math.max(0, Number(aud.duration || track.duration || 0)));
        if (state.currentUrlVideoSource) persistOnlineResumeEntry(state.currentUrlVideoSource, 0, 'unload');
        persistFeatureToggles();
        persistExtendedStores();
        if (state.searchDebounceTimer) {
            clearTimeout(state.searchDebounceTimer);
            state.searchDebounceTimer = null;
        }
        resetPrivateSessionState({ revokeUrls: true });
	                (state.tracks || []).forEach((track) => {
	                    if (track && typeof track.url === 'string' && track.url.indexOf('blob:') === 0) {
	                        try { URL.revokeObjectURL(track.url); } catch (_) {}
	                    }
	                });
	            });
	            window.addEventListener('pagehide', () => {
        if (shouldBypassStorageWriteForPrivateSession()) {
            stopPrivateSessionPlaybackRuntime();
            resetPrivateSessionState({ revokeUrls: true });
            markSessionRuntimeInactive('pagehide-private-session');
            return;
        }
	                persistSessionSnapshot({ reason: 'pagehide' });
	                markSessionRuntimeInactive('pagehide');
	            });
	            document.addEventListener('visibilitychange', () => {
	                updatePlayIcons();
	                if (document.visibilityState === 'hidden') {
	                    if (getAppSettings().playback.pauseWhenHidden && state.isPlaying && !aud.paused) {
	                        visibilityPauseTriggered = true;
	                        aud.pause();
	                    }
            if (shouldBypassStorageWriteForPrivateSession()) {
                return;
            }
	                    persistSessionSnapshot({ reason: 'visibility-hidden', throttleMs: 1500 });
	                    captureOnlineMusicProgress({ forcePersist: true });
	                    const track = getCurrentTrack();
	                    if (!track) return;
	                    persistTrackResumeEntry(track, Math.max(0, Number(aud.currentTime || 0)), Math.max(0, Number(aud.duration || track.duration || 0)));
	                    persistExtendedStores();
            return;
        }
        visibilityPauseTriggered = false;
    });
	        }

