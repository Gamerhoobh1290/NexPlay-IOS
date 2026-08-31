/* Legacy playback loading, media-session sync, and transport logic.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- PLAYBACK ---
	        function shouldIgnoreTrackSwitchRequest(id, options = {}) {
	            if (!isSwitchingTrack || options.allowQueueSwitch) return false;
	            const requestedTrackId = sanitizeText(id || '');
	            const pendingTrackId = sanitizeText(activeTrackSwitchId || '');
	            // Preserve the lock for internal/non-track operations and dedupe
	            // repeated clicks on the same pending track. A different explicit
	            // track choice must be allowed to supersede the pending request.
	            return !pendingTrackId || pendingTrackId === requestedTrackId;
	        }

	        function loadTrack(id, autoPlay = true, evt = null, options = {}) {
	            const opts = options && typeof options === 'object' ? options : {};
	            const allowQueueSwitch = !!opts.allowQueueSwitch;
	            if (shouldIgnoreTrackSwitchRequest(id, { allowQueueSwitch })) {
	                logAction('source-switch-skipped', 'Track switch request ignored because a switch is already in progress', {
	                    trackId: sanitizeText(id || '')
	                });
	                return;
	            }
	            if (isSwitchingTrack && !allowQueueSwitch) {
	                logAction('source-switch-superseded', 'A newer track choice superseded the pending switch', {
	                    previousTrackId: sanitizeText(activeTrackSwitchId || ''),
	                    trackId: sanitizeText(id || '')
	                });
	            }
	            if (evt && evt.preventDefault) evt.preventDefault();
	            if (evt && evt.stopPropagation) evt.stopPropagation();
	            const sourceLoadRequestId = beginSourceLoad();
	            isSwitchingTrack = true;
	            activeTrackSwitchId = sanitizeText(id || '');
	            trackSwitchStartedAt = Date.now();
	            logAction('source-switch-start', 'Track switch started', {
	                trackId: sanitizeText(id || ''),
	                autoPlay: !!autoPlay
	            });
	            const track = resolveQueueDisplayTrack(id) || state.tracks.find(t => t.id === id);
	            if(!track) {
	                finishSourceLoad(sourceLoadRequestId);
	                isSwitchingTrack = false;
	                activeTrackSwitchId = '';
	                trackSwitchStartedAt = 0;
	                logError('source-switch-missing-track', 'Track switch failed because the track could not be found', {
	                    trackId: sanitizeText(id || '')
	                });
	                showInternalNotice('Track was missing and was skipped safely.', 'warn');
	                return;
	            }
	            const playbackIntent = track.source === 'online-music'
	                ? null
	                : beginPlaybackIntent(track.id, 'local');
	            try {
	            if (track.source !== 'online-music') {
	                handoffToLocalPlayback({ resetOnlineTime: true });
    }
    if (evt) autoPlay = !!getAppSettings().playback.autoplayOnTrackClick;
    // Switch queue context based on media type to prevent cross-contamination
    const newType = track.type === 'video' ? 'video' : 'audio';
    ensureQueueForType(newType);
    if (evt && state.queueSource === 'radio') {
        if (newType === 'audio') {
            commitUnifiedAudioQueue({
                entries: [],
                currentIndex: -1,
                queueSource: 'auto',
                isShuffle: false,
                shuffleOrder: [],
                failedEntryIds: []
            }, { refresh: false });
        } else {
            state.queue = [];
            state.queueSource = 'auto';
        }
        clearAutoplayRadioState();
        saveActiveQueueBucket();
    }
    const prevTrackId = state.currentTrackId;
    skipOutroHandledTrackId = null;
    // Autoâ€‘queue: when a user clicks a track, build the queue from the remainder
    // of the relevant track list.  Previously this used getFilteredTracks(),
    // which applies the search filter and therefore only included visible items
    // (e.g. after a search).  Instead, build the queue from a base list that
    // ignores the search query.  See getQueueTracks() for details.
    if (evt && state.autoQueueEnabled) {
        const autoQueueAllowed = canQueueTrackInContext(track);
        if (newType === 'audio') {
            let deckTracks = [];
            if (!autoQueueAllowed) {
                deckTracks = [track];
            } else if (isFeatureEnabled(FEATURE_REGISTRY.core_smart_autoqueue)) {
                const smartQueueIds = buildSmartAutoQueue(track, track.type, { contextTab: state.activeTab });
                const smartQueueTracks = smartQueueIds
                    .map((queuedTrackId) => resolveQueueDisplayTrack(queuedTrackId))
                    .filter(Boolean);
                deckTracks = [track, ...smartQueueTracks.filter((candidate) => candidate.id !== track.id)];
            } else {
                deckTracks = (getQueueTracks(track.type) || []).filter((candidate) => candidate && canQueueTrackInContext(candidate));
                if (!deckTracks.some((candidate) => candidate.id === track.id)) {
                    deckTracks.unshift(track);
                }
            }
            setUnifiedAudioQueueFromTrackList(deckTracks, id, {
                queueSource: 'auto',
                isShuffle: !!state.isShuffle,
                repeatMode: getUnifiedAudioQueueState().repeatMode || state.repeatMode || 'none',
                resetFailures: true
            });
        } else if (state.isShuffle) {
            // Shuffle ignores auto-generated queues; rebuild shuffle queue from clicked track.
            state.queue = [];
            state.queueSource = 'auto';
            state.pendingShuffleSeed = id;
            if (autoQueueAllowed) {
                buildShuffleQueue(id, track.type, {
                    trackFilter: (candidate) => canQueueTrackInContext(candidate)
                });
            } else {
                clearShuffleState();
            }
        } else {
            if (isFeatureEnabled(FEATURE_REGISTRY.core_smart_autoqueue)) {
                state.queue = autoQueueAllowed ? buildSmartAutoQueue(track, track.type, { contextTab: state.activeTab }) : [];
                state.queueSource = 'auto';
            } else {
                const list = autoQueueAllowed
                    ? (getQueueTracks(track.type) || []).filter((candidate) => candidate && canQueueTrackInContext(candidate))
                    : [];
                const idx = list.findIndex(t => t.id === id);
                if (idx !== -1) {
                    state.queue = list.slice(idx + 1).map(t => t.id);
                    state.queueSource = 'auto';
                } else {
                    state.queue = [];
                    state.queueSource = 'auto';
                }
            }
            renderMiniQueuePeek();
            if (state.isQueueOverlayOpen) renderQueueOverlay();
            if (state.activeTab === 'queue') renderQueue();
        }
        saveActiveQueueBucket();
    } else if (newType === 'audio') {
        syncUnifiedAudioQueueCurrentTrack(track, {
            replaceDeck: !getUnifiedAudioQueueState().entries.length,
            queueSource: getUnifiedAudioQueueState().queueSource || 'auto',
            isShuffle: getUnifiedAudioQueueState().isShuffle,
            refresh: true
        });
    }
    // Attach cached custom lyrics to the track if available
    const cachedCustom = getCustomLyricsForTrack(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title);
    if (cachedCustom) {
        track.customLyrics = cachedCustom;
        state.customLyricsCache = state.customLyricsCache || {};
        state.customLyricsCache[id] = cachedCustom;
    }
    // Reset counted id so play event increments playCount for the new track
    state.lastCountedTrackId = null;
    state.currentTrackId = id;
    state.currentTrack = track;
    pendingResumeTime = null;
    if (track.source !== 'online-music' && shouldUseLocalResume(track.duration || 0)) {
        const stored = getStoredTrackResume(track);
        if (stored > 1) pendingResumeTime = stored;
    } else if (track.source !== 'online-music' && track.type === 'video') {
        const resume = readStorageValue(`nexplay_video_pos_${track.id}`, '');
        if (resume) {
            const val = parseFloat(resume);
            if (!isNaN(val) && val > 1) pendingResumeTime = val;
        }
    }
    resetProgressUI();
    lastVideoBufferPaintTs = 0;
    if (state.progressInterval) {
        clearInterval(state.progressInterval);
        state.progressInterval = null;
    }
    if (state.isShuffle && newType !== 'audio') {
        if (evt) {
            if (canQueueTrackInContext(track)) {
                buildShuffleQueue(id, track.type, {
                    trackFilter: (candidate) => canQueueTrackInContext(candidate)
                });
            } else {
                clearShuffleState();
            }
        } else if (state.shuffleQueue && state.shuffleQueue.length > 0) {
            const idx = state.shuffleQueue.indexOf(id);
            if (idx !== -1) state.shuffleIndex = idx;
        }
    }
    // Reset progress time for statistics tracking
    state.lastProgressTime = 0;
    // Update recently played history
    if (!Array.isArray(state.playHistory)) state.playHistory = [];
    if (!isPrivateSessionTrackRecord(track)) {
        const histIndex = state.playHistory.indexOf(id);
        if (histIndex !== -1) state.playHistory.splice(histIndex, 1);
        state.playHistory.unshift(id);
        enforceHistoryRetentionLimit();
    }
    refreshLiveViews();

	            if (track.source === 'online-music') {
        const onlinePlaybackContext = isPrivateSessionTrackRecord(track) ? 'private-session' : 'library';
	                playOnlineMusicTrack(id, {
	                    autoplay: autoPlay,
	                    startTime: 0,
            playbackContext: onlinePlaybackContext,
            queueContextView: onlinePlaybackContext,
            queueContextKey: isPrivateSessionTrackRecord(track) ? getPrivateSessionQueueContextKey(getPrivateSessionState().currentCollectionKey || 'temporary') : '',
            queueMode: getUnifiedAudioQueueState().isShuffle ? 'shuffle' : 'ordered',
            trackSnapshot: track,
            privateSession: isPrivateSessionTrackRecord(track),
            playbackIntent
        }).catch((error) => {
                    if (sourceLoadRequestId === latestSourceLoadRequestId) {
                        logError('online-source-switch-failed', 'Online track switch failed safely', {
                            trackId: sanitizeText(id || ''),
                            error: sanitizeText(error?.message || '')
                        });
                        showInternalNotice('Online playback could not start, state recovered.', 'warn');
                    }
                    return false;
        }).finally(() => {
	                    finishSourceLoad(sourceLoadRequestId);
	                    if (sourceLoadRequestId !== latestSourceLoadRequestId) return;
	                    isSwitchingTrack = false;
	                    activeTrackSwitchId = '';
	                    trackSwitchStartedAt = 0;
	                    normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
	                    logAction('source-switch-finish', 'Track switch finished for online playback', {
	                        trackId: sanitizeText(id || ''),
	                        started: true
	                    });
	                });
	                return;
	            }
	            const nextUrl = sanitizeText(track.url || '');
	            if (!nextUrl) {
	                finishSourceLoad(sourceLoadRequestId);
	                isSwitchingTrack = false;
	                activeTrackSwitchId = '';
	                trackSwitchStartedAt = 0;
	                logError('source-switch-missing-source', 'Track source URL was missing and track was skipped safely', {
	                    trackId: sanitizeText(id || '')
	                });
	                logRecovery('source-switch-skip', 'Unsupported or missing track source was skipped', {
	                    trackId: sanitizeText(id || '')
	                });
	                showToast('Unsupported or missing media source. Skipping track safely.', 'warn');
	                showInternalNotice('Unsupported source skipped safely.', 'warn');
	                return;
	            }
    invalidatePendingMediaPlayRequests();
    els.audio.src = nextUrl;
    armSourceLoadTimeout(id);
    state.playbackSpeed = getPreferredPlaybackSpeedForTrack(track);
    els.audio.playbackRate = state.playbackSpeed;
    els.audio.volume = state.volume;
    updateVolumeUI(state.volume);

	            // UI Updates
	            updateTrackUI(track);
        applyNowPlayingMetadata(track);
	            const cover = getTrackCoverOrFallback(track);
	            document.getElementById('mini-cover').src = cover;
	            document.getElementById('mini-cover').classList.remove('hidden');
	            const windowedCover = document.getElementById('windowedModeCoverArt');
	            const windowedBg = document.getElementById('windowedModeBgArt');
	            const fsModeCover = document.getElementById('fsModeCoverArt');
	            const fsModeBg = document.getElementById('fsModeBgArt');
	            if (windowedCover) {
	                windowedCover.src = cover;
	                syncWindowedOnlineCoverCrop(track, windowedCover, cover);
	            }
	            if (windowedBg) windowedBg.src = cover;
	            if (fsModeCover) fsModeCover.src = cover;
	            if (fsModeBg) fsModeBg.src = cover;
	            updateMediaSession(track, cover);
	            applyCoverAccent(track);

    if (track.type === 'video') {
        setLyricsPanelMode('view', track.id);
	                track.assignedLyricsRaw = '';
        track.assignedLyricsSource = '';
	                resetLyricState(0);
        const lc = document.getElementById('windowedModeLyricsContent');
        if (lc) lc.innerHTML = '<span class="text-blue-400">Video track</span><br><span class="opacity-60">Open videoFsMode to view.</span>';
        applyRememberedVideoAdjustments(track);
    } else {
        closeAutoManagedVideoPiP();
        applyVideoSharpness(0, { persist: false });
        applyVideoBrightness(1, { persist: false });
        applyVideoContrast(1, { persist: false });
        syncVideoFilterSliderUI();
        fetchLyrics(track.lyricsArtist || track.artist, track.lyricsTitle || track.title, track);
    }
    syncModesWithCurrentTrack();
    if (shouldAutoEnterVideoMode(track, autoPlay) && !state.videoFsModeActive) {
        enterVideoFsMode();
    }

    ensureActiveTrackHighlight(prevTrackId, id);
    refreshPlayingIndicators();
    updateShuffleIcon();
    updateRepeatIcon();
    updateProgress();
	            if (autoPlay) {
	                handoffToLocalPlayback({ resetOnlineTime: false });
	                ensureEqualizerGraph({ resume: true, notify: false, smooth: false });
	                safePlayMedia(els.audio, {
	                    waitForReady: true,
	                    timeoutMs: 8000,
	                    playbackIntent,
	                    expectedTrackId: track.id,
	                    expectedPlaybackSource: 'local',
	                    expectedMediaSource: nextUrl
	                }).then((ok) => {
	                    if (ok) return;
	                    if (!isPlaybackIntentActive(playbackIntent)) return;
	                    state.isPlaying = false;
	                    updatePlayIcons();
	                    logError('play-start-failed', 'Playback could not start for the selected track', {
	                        trackId: sanitizeText(track.id || '')
	                    });
	                    showToast('Playback could not start for this track.', 'warn');
	                    showInternalNotice('Playback could not start, state recovered.', 'warn');
	                });
	            } else {
	                finishSourceLoad(sourceLoadRequestId);
	            }
	            normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
	            logAction('source-switch-finish', 'Track switch finished', {
	                trackId: sanitizeText(track.id || ''),
	                source: sanitizeText(track.source || 'local'),
	                autoPlay: !!autoPlay
	            });
	            } finally {
	                if (track.source !== 'online-music' && sourceLoadRequestId === latestSourceLoadRequestId) {
	                    isSwitchingTrack = false;
	                    activeTrackSwitchId = '';
	                    trackSwitchStartedAt = 0;
	                }
	                scheduleDebugOverlayRefresh();
	            }
	        }

function syncActiveTrackHighlight(prevId, nextId) {
    if (prevId && prevId !== nextId) {
        document.querySelectorAll(`[data-track-id="${prevId}"]`).forEach(el => {
            el.classList.remove('track-active');
            const indicator = el.querySelector('.track-playing-overlay');
            if (indicator) indicator.classList.add('hidden');
        });
    }
    if (nextId) {
        document.querySelectorAll(`[data-track-id="${nextId}"]`).forEach(el => {
            el.classList.add('track-active');
            const indicator = el.querySelector('.track-playing-overlay');
            if (indicator) indicator.classList.toggle('hidden', !state.isPlaying);
        });
    }
}

function refreshPlayingIndicators() {
    document.querySelectorAll('.track-playing-overlay').forEach(el => el.classList.add('hidden'));
    if (!state.currentTrackId || !state.isPlaying) return;
    document.querySelectorAll(`[data-track-id="${state.currentTrackId}"] .track-playing-overlay`).forEach(el => el.classList.remove('hidden'));
}

function updateVisibleTrackDurationLabels(trackId, duration) {
    if (!trackId) return;
    const nextLabel = formatTime(duration || 0);
    document.querySelectorAll('[data-track-duration-for]').forEach((el) => {
        if (el.dataset.trackDurationFor !== trackId) return;
        setTextContentIfChanged(el, nextLabel);
    });
}

// Keeps the active track highlight in sync when playback changes without user clicks (e.g., auto-advance).
function ensureActiveTrackHighlight(prevIdOverride = null, nextIdOverride = null) {
    const prevId = prevIdOverride !== null ? prevIdOverride : lastActiveTrackId;
    const nextId = nextIdOverride !== null ? nextIdOverride : state.currentTrackId;
    syncActiveTrackHighlight(prevId, nextId);
    lastActiveTrackId = nextId;
}

	        function togglePlay() { 
	            logAction('play-toggle-start', 'Play/pause toggle requested', {
	                source: sanitizeText(state.currentPlaybackSource || ''),
	                currentlyPlaying: !!state.isPlaying
	            });
	            if (isLoadingSource) {
	                logAction('play-toggle-skipped', 'Play/pause ignored while source is loading');
	                return;
	            }
	            if (isOnlineMusicPlaybackActive()) {
	                safeCall(() => toggleOnlineMusicPlayback());
	                logAction('play-toggle-dispatch', 'Play/pause routed to online playback');
	                return;
	            }
	            const media = els.audio;
	            if (!media) {
	                logError('play-toggle-no-media', 'Play/pause failed because no media element is available');
	                return;
	            }
	            if (media.paused) {
	                if (!hasPlayableSource(media)) {
	                    logError('play-toggle-no-source', 'Play request ignored because no playable source is loaded');
	                    showToast('No playable source is loaded.', 'info');
	                    return;
	                }
	                handoffToLocalPlayback({ resetOnlineTime: false });
	                ensureEqualizerGraph({ resume: true, notify: false, smooth: false });
	                safePlayMedia(media, { waitForReady: true, timeoutMs: 8000 }).then((ok) => {
	                    if (ok) {
	                        logAction('play-success', 'Playback started successfully', {
	                            trackId: sanitizeText(state.currentTrackId || '')
	                        });
	                        scheduleDebugOverlayRefresh();
	                        return;
	                    }
	                    state.isPlaying = false;
	                    updatePlayIcons();
	                    logError('play-failed', 'Playback start failed and state was reset safely', {
	                        trackId: sanitizeText(state.currentTrackId || '')
	                    });
	                    showInternalNotice('Playback could not start, state was recovered.', 'warn');
	                });
	            } else {
	                const paused = safePauseMedia(media);
	                logAction('pause', paused ? 'Playback paused' : 'Pause request could not be applied', {
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	            }
	            scheduleDebugOverlayRefresh();
	        }

	        function updatePlayIcons() {
	            const iconName = state.isPlaying ? 'pause' : 'play';
	            replaceLucideIcon(getCachedElement('mini-play-icon'), iconName);
	            replaceLucideIcon(getCachedElement('windowedModePlayIcon'), iconName);
	            replaceLucideIcon(getCachedElement('fsModePlayIcon'), iconName);
	            replaceLucideIcon(getCachedElement('videoFsModePlayIcon'), iconName);
	            const wraps = [
	                getCachedElement('windowedModeCoverArt')?.parentElement,
	                getCachedElement('fsModeCoverArt')?.parentElement
	            ].filter(Boolean);
	            wraps.forEach(wrap => wrap.classList.toggle('scale-[1.02]', !!state.isPlaying));
        syncPrivateSessionPlayerDeck();
	        }

