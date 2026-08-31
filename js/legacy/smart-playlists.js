/* Legacy smart playlist rendering, filtering, utilities, and playback helpers.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

/**
 * Render the Smart Playlists view.  When no smartFilter is selected, displays a list
 * of available smart playlist categories.  When a smartFilter is set, displays
 * the tracks matching that dynamic category along with a Back button.
 */
function renderSmart() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    emptyEl.classList.add('hidden');
    emptyEl.classList.remove('flex');
    const storyModeControl = isFeatureEnabled(FEATURE_REGISTRY.creative_story_mode)
        ? `<button onclick="generateStoryModeQueue({ mediaType: 'audio' })" class="mx-4 w-auto text-left px-4 py-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 transition">Generate Story Mode Queue</button>`
        : '';
    const categories = SMART_PLAYLISTS.map((playlist) => ({
        playlist,
        result: getSmartPlaylistResult(playlist)
    }));

    if (state.smartFilter) {
        const category = SMART_PLAYLISTS.find((playlist) => playlist.id === state.smartFilter) || null;
        const result = getSmartPlaylistResult(category);
        const list = result.tracks;
        container.className = 'flex flex-col gap-3';
        const headerHtml = `<div class="flex items-start justify-between gap-3 px-4">
            <div class="min-w-0">
                <div class="text-gray-300 text-sm">List: <span class="accent-text font-semibold">${escapeHtml(category?.label || state.smartFilter)}</span></div>
                <div class="mt-1 text-xs text-gray-500">${escapeHtml(category?.description || 'Dynamic smart playlist')}</div>
                <div class="mt-2 text-[11px] text-gray-500 font-mono">${list.length} audio track${list.length === 1 ? '' : 's'}</div>
            </div>
            <button onclick="state.smartFilter=null; renderSmart();" class="text-xs text-gray-400 hover:text-white">Back</button>
        </div>`;
        if (!category) {
            container.innerHTML = headerHtml + `<div class="w-full text-center text-gray-400 mt-8">Smart playlist not found.</div>`;
            return;
        }
        if (!list.length) {
            container.innerHTML = headerHtml + `<div class="w-full text-center text-gray-400 mt-8">${escapeHtml(category.emptyMessage || 'No tracks in this playlist.')}</div>`;
            return;
        }
        container.innerHTML = headerHtml + list.map((track) => {
            const reason = sanitizeText(result.reasons?.[track.id] || (typeof category.getReason === 'function' ? category.getReason(track) : ''));
            return `<div onclick="loadTrack('${track.id}', true, event)" class="mx-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/10 bg-[#1a1d26] cursor-pointer">
                        <div class="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                            <i data-lucide="music" class="w-4 h-4 text-gray-400"></i>
                            <div class="min-w-0">
                                <div class="text-sm text-gray-200 font-medium truncate">${escapeHtml(track.title || '')}</div>
                                <div class="text-xs text-gray-500 truncate">${escapeHtml(track.artist || '')}</div>
                                ${reason ? `<div class="text-[11px] text-cyan-300 truncate">${escapeHtml(reason)}</div>` : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0" onclick="event.stopPropagation()">
                            <button onclick="addToQueue(event, '${track.id}')" class="p-2 rounded-full hover:bg-white/20 transition" title="Add to Queue"><i data-lucide="plus" class="w-4 h-4 text-gray-400"></i></button>
                            <button onclick="openEditModal('${track.id}')" class="p-2 rounded-full hover:bg-white/20 transition" title="Edit Metadata"><i data-lucide="edit" class="w-4 h-4 text-gray-400"></i></button>
                        </div>
                    </div>`;
        }).join('');
        refreshLucideIcons();
        return;
    }

    container.className = 'flex flex-col gap-3';
    container.innerHTML = `${storyModeControl}
        <div class="px-4">
            <div class="text-gray-300 text-sm">Choose a smart playlist</div>
            <div class="mt-1 text-xs text-gray-500">Audio-first lists built from your history, favorites, and Smart Auto-Queue signals.</div>
        </div>` +
        categories.map(({ playlist, result }) => {
            const count = result.tracks.length;
            return `<button onclick="state.smartFilter='${playlist.id}'; renderSmart();" class="mx-4 w-auto text-left rounded-2xl border border-white/10 bg-[#1a1d26] px-4 py-4 hover:bg-white/10 transition">
                        <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0">
                                <div class="text-sm font-semibold text-white">${escapeHtml(playlist.label)}</div>
                                <div class="mt-1 text-xs text-gray-400">${escapeHtml(playlist.description)}</div>
                            </div>
                            <div class="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-mono text-gray-300">${count}</div>
                        </div>
                    </button>`;
        }).join('');
    applyFeatureVisibility();
    refreshLucideIcons();
}
	        // --- FETCH LYRICS (Same logic, better UI) ---
	        async function fetchLyrics(artist, title, track = null) {
		            const container = document.getElementById('windowedModeLyricsContent');
		            const source = document.getElementById('windowedModeLyricsSource');
	                const effectiveArtist = normalizeLyricsArtistName(
	                    artist === ''
	                        ? ''
	                        : (artist || track?.lyricsArtist || track?.artist || '')
	                );
	                const effectiveTitle = sanitizeText(
	                    title === ''
	                        ? ''
	                        : (title || track?.lyricsTitle || track?.title || track?.fileName || '')
	                );
	            const requestedTrackId = getLyricsActiveTrackId(track);
	            if (isLyricsEditorOpen(requestedTrackId)) return;
	            const requestToken = ++lyricsFetchToken;
	            cancelActiveLyricsLookup();
	            const isStaleRequest = () => {
	                    const activeTrackId = getLyricsActiveTrackId();
		                return (requestedTrackId && activeTrackId && activeTrackId !== requestedTrackId) || requestToken !== lyricsFetchToken || isLyricsEditorOpen(requestedTrackId);
	            };
	            if (!container || !source) return;
                if (isPrivateLyricsContext(track)) {
                    setLyricsPanelMode('view', requestedTrackId || getLyricsActiveTrackId() || null);
                    source.className = LYRICS_SOURCE_BADGE_CLASS;
                    source.title = 'Private Session lyrics remain in memory and are never fetched automatically.';
                    const privateManualText = String(track?.customLyrics || '').trim();
                    if (privateManualText) {
                        applyLyricsText(privateManualText, 'Manual', track, {
                            kind: 'manual',
                            providerLabel: 'Private session manual lyrics',
                            format: detectLyricsFormat(privateManualText)
                        });
                    } else {
                        resetLyricState(0);
                        source.innerText = 'Private';
                        showAddLyricsPrompt('Lyrics are not fetched automatically in Private Session.');
                    }
                    return;
                }
	            let preserveRenderedCachedLyrics = false;
                let lookupController = null;
	            const loadingKey = `lyrics-${sanitizeText(requestedTrackId || 'none')}-${requestToken}`;
	            beginLoadingWatchdog(loadingKey, LYRICS_WATCHDOG_TIMEOUT_MS, () => {
	                if (isStaleRequest()) return;
                    if (preserveRenderedCachedLyrics) {
                        source.title = source.title || 'Cached lyrics remain available while the online refresh is unavailable.';
                        return;
                    }
                    cancelActiveLyricsLookup();
	                showAddLyricsPrompt('Lyrics unavailable right now.');
	                source.innerText = 'None';
	                source.title = '';
	                source.className = 'text-[10px] uppercase tracking-wider text-gray-500 border border-white/10 px-2 py-1 rounded-md';
	                resetLyricState(0);
	                logRecovery('lyrics-timeout-fallback', 'Lyrics loading timed out and fallback text was applied', {
	                    trackId: sanitizeText(requestedTrackId || ''),
	                    artist: sanitizeText(effectiveArtist || ''),
	                    title: sanitizeText(effectiveTitle || '')
	                });
	                showInternalNotice('Lyrics loading timed out, using fallback.', 'warn');
	            });
	            logAction('lyrics-fetch-start', 'Lyrics lookup started', {
	                trackId: sanitizeText(requestedTrackId || ''),
	                artist: sanitizeText(effectiveArtist || ''),
	                title: sanitizeText(effectiveTitle || '')
	            });
	            try {
	                setLyricsPanelMode('view', requestedTrackId || getLyricsActiveTrackId() || null);
	                source.className = LYRICS_SOURCE_BADGE_CLASS;
	                source.title = '';
	                // Reset offset display for the new track
	                updateLyricsOffsetDisplay(0);

	                // Use saved/manual lyrics first (in-memory or offline cache)
	                const cached = getOfflineLyricsForTrack(track, effectiveArtist, effectiveTitle);
	                if (track) {
	                    const cachedCustom = getCustomLyricsForTrack(track, effectiveArtist, effectiveTitle);
	                    if (cachedCustom) {
	                        track.customLyrics = syncTrackCustomLyricsCache(track, cachedCustom);
	                        applyLyricsText(cachedCustom, 'Manual', track, {
	                            kind: 'manual',
	                            providerLabel: 'Manual override',
	                            format: detectLyricsFormat(cachedCustom)
	                        });
	                        logAction('lyrics-fetch-hit', 'Lyrics loaded from manual cache', {
	                            trackId: sanitizeText(requestedTrackId || '')
	                        });
	                        return;
	                    }
	                    if (track.customLyrics && hasVerifiedManualLyricsOverride(track, effectiveArtist, effectiveTitle, track.customLyrics)) {
	                        applyLyricsText(track.customLyrics, 'Manual', track, {
	                            kind: 'manual',
	                            providerLabel: 'Manual override',
	                            format: detectLyricsFormat(track.customLyrics)
	                        });
	                        logAction('lyrics-fetch-hit', 'Lyrics loaded from track custom lyrics', {
	                            trackId: sanitizeText(requestedTrackId || '')
	                        });
	                        return;
	                    }
	                }
	                if (cached.manual?.raw) {
	                    if (track) {
	                        const manualText = String(cached.manual.raw || '').trim();
	                        track.customLyrics = syncTrackCustomLyricsCache(track, manualText);
	                    }
	                    applyLyricsText(cached.manual.raw, 'Manual', track, {
	                        kind: 'manual',
	                        providerLabel: 'Manual override',
	                        format: cached.manual.format || detectLyricsFormat(cached.manual.raw)
	                    });
	                    logAction('lyrics-fetch-hit', 'Lyrics loaded from offline manual cache', {
	                        trackId: sanitizeText(requestedTrackId || '')
	                    });
	                    return;
	                }
	                let renderedCachedAuto = false;
	                let deferredCachedAuto = null;
	                const cachedAutoFormat = cached.auto?.raw
	                    ? (cached.auto.format || detectLyricsFormat(cached.auto.raw))
	                    : '';
	                const cachedStrongSynced = !!cached.auto?.raw
                        && cachedAutoFormat === 'lrc'
                        && isStrongCachedSyncedLyricsEntry(cached.auto, effectiveArtist, effectiveTitle, track);
                    if (cachedStrongSynced) {
                        applyLyricsText(cached.auto.raw, 'Synced', track, {
                            kind: 'auto',
                            providerLabel: cached.auto.providerLabel || cached.auto.provider || 'Cached',
                            format: 'lrc',
                            matchedLabel: [cached.auto.matchedArtist, cached.auto.matchedTitle].filter(Boolean).join(' - '),
                            cached: true,
                            confidence: 'strong'
                        });
                        source.title = (cached.auto.providerLabel || cached.auto.provider)
                            ? `Verified synced lyrics cached from ${cached.auto.providerLabel || cached.auto.provider}`
                            : 'Verified synced lyrics loaded from the local cache.';
                        renderedCachedAuto = true;
                        preserveRenderedCachedLyrics = true;
                        logAction('lyrics-fetch-hit', 'Verified synced lyrics loaded from local cache without a network request', {
                            trackId: sanitizeText(requestedTrackId || '')
                        });
                        return;
                    }
	                const cachedAutoTrusted = !!cached.auto?.raw && isOfflineLyricsEntryTrusted(cached.auto, effectiveArtist, effectiveTitle, track);
	                const shouldRefreshCachedPlainAuto = cachedAutoTrusted && navigator?.onLine !== false && cachedAutoFormat !== 'lrc';
	                const canUseCachedAuto = cachedAutoTrusted && !shouldRefreshCachedPlainAuto;
	                if (canUseCachedAuto) {
	                    const label = cached.auto.format === 'lrc' ? 'Synced' : 'Auto';
	                    applyLyricsText(cached.auto.raw, label, track, {
	                        kind: 'auto',
	                        providerLabel: cached.auto.provider || 'Cached',
	                        format: cachedAutoFormat,
	                        matchedLabel: [cached.auto.artist, cached.auto.title].filter(Boolean).join(' - '),
	                        cached: true
	                    });
	                    source.title = cached.auto.provider ? `Cached from ${cached.auto.provider}` : '';
	                    renderedCachedAuto = true;
	                    preserveRenderedCachedLyrics = true;
	                    if (navigator?.onLine === false) {
	                        logAction('lyrics-fetch-hit', 'Lyrics loaded from trusted offline cache', {
	                            trackId: sanitizeText(requestedTrackId || '')
	                        });
	                        return;
	                    }
	                } else {
	                    if (shouldRefreshCachedPlainAuto) {
	                        deferredCachedAuto = { ...cached.auto, format: cachedAutoFormat };
	                        source.innerText = 'Searching';
	                        source.title = `Cached plain lyrics from ${cached.auto.provider || 'auto cache'} are being held as fallback while LRCLIB synced search runs.`;
	                    }
	                    resetLyricState(0);
	                    container.innerHTML = '<span class="animate-pulse text-indigo-400">Searching LRCLIB for synced lyrics...</span>';
	                }

	                try {
	                    lookupController = beginActiveLyricsLookup();
	                    const candidate = await resolveLyricsCandidate(effectiveArtist, effectiveTitle, track, isStaleRequest, lookupController?.signal || null);
	                    if (isStaleRequest()) return;
	                    if (candidate && applyResolvedLyricsCandidate(candidate, effectiveArtist, effectiveTitle, track)) {
	                        logAction('lyrics-fetch-success', 'Lyrics resolved from provider', {
	                            trackId: sanitizeText(requestedTrackId || '')
	                        });
	                        return;
	                    }
	                } catch (_) {}

	                // Online uploads often expose channel/uploader names instead of artist metadata.
	                // Retry with title-first matching by forcing an empty artist.
	                if (!isStaleRequest() && track?.source === 'online-music') {
	                    try {
	                        const fallbackTitle = sanitizeText(effectiveTitle || track?.lyricsTitle || track?.title || '');
	                        if (fallbackTitle) {
	                            const fallbackCandidate = await resolveLyricsCandidate('', fallbackTitle, track, isStaleRequest, lookupController?.signal || null);
	                            if (!isStaleRequest() && fallbackCandidate && applyResolvedLyricsCandidate(fallbackCandidate, '', fallbackTitle, track)) {
	                                logAction('lyrics-fetch-success', 'Lyrics resolved via title-only fallback', {
	                                    trackId: sanitizeText(requestedTrackId || '')
	                                });
	                                return;
	                            }
	                        }
	                    } catch (_) {}
	                }

	                // If we already showed synced cached lyrics, keep them on screen when online fetch fails.
	                if (isStaleRequest() || renderedCachedAuto) return;
	                if (deferredCachedAuto?.raw) {
	                    const label = deferredCachedAuto.format === 'lrc' ? 'Synced' : 'Auto';
	                    applyLyricsText(deferredCachedAuto.raw, label, track, {
	                        kind: 'auto',
	                        providerLabel: deferredCachedAuto.provider || 'Cached fallback',
	                        format: deferredCachedAuto.format,
	                        matchedLabel: [deferredCachedAuto.artist, deferredCachedAuto.title].filter(Boolean).join(' - '),
	                        cached: true,
	                        fallback: true
	                    });
	                    source.title = deferredCachedAuto.provider
	                        ? `Cached fallback from ${deferredCachedAuto.provider}; LRCLIB synced lyrics were not found or timed out.`
	                        : 'Cached fallback; LRCLIB synced lyrics were not found or timed out.';
	                    logAction('lyrics-fetch-hit', 'Lyrics loaded from cached plain fallback after LRCLIB refresh failed', {
	                        trackId: sanitizeText(requestedTrackId || '')
	                    });
	                    return;
	                }

	                showAddLyricsPrompt('Lyrics not found for this track.');
	                if (track) {
	                    track.assignedLyricsRaw = '';
	                    track.assignedLyricsSource = '';
	                }
	                source.innerText = 'None';
	                source.title = '';
	                source.className = 'text-[10px] uppercase tracking-wider text-gray-500 border border-white/10 px-2 py-1 rounded-md';
	                // Clear highlighting state
	                resetLyricState(0);
	                logRecovery('lyrics-fallback', 'Lyrics unavailable and fallback text was shown', {
	                    trackId: sanitizeText(requestedTrackId || '')
	                });
	            } finally {
	                releaseActiveLyricsLookup(lookupController);
	                clearLoadingWatchdog(loadingKey);
	            }
	        }

/**
 * Prepare karaoke-style highlighting for the loaded lyrics.  It splits the
 * lyrics container into individual span elements, calculates the approximate
 * duration of each line based on the current track duration, and resets
 * previous highlight state.  Called after lyrics are successfully fetched.
 */
	        function prepareLyricsHighlight(timedLines = []) {
	            const container = document.getElementById('windowedModeLyricsContent');
	            if (!container) return;
	            const linesFromTimed = Array.isArray(timedLines)
	                ? timedLines.map(line => line?.el).filter(Boolean)
	                : [];
    const lyricEls = linesFromTimed.length > 0
        ? linesFromTimed
        : Array.from(container.querySelectorAll('.lyrics-line, span'));
    const dur = isOnlineMusicPlaybackActive()
        ? Number(getOnlineMusicState().duration || getOnlineMusicCurrentTrack()?.duration || 0)
        : Number(els.audio?.duration || 0);
    const lineDur = lyricEls.length > 0 && dur > 0 ? dur / lyricEls.length : 0;
    const timestamps = Array.isArray(timedLines)
        ? timedLines
            .map(line => Number(line?.time))
            .filter((time) => Number.isFinite(time) && time >= 0)
        : [];
    state.lyricsHighlight = {
        lines: lyricEls,
        lineDuration: lineDur,
        lastIndex: -1,
        timestamps,
        offset: 0
    };
    // Remove any previous highlighting
    lyricEls.forEach((el) => {
        el.classList.remove('lyric-highlight', 'opacity-100');
        el.classList.add('opacity-30');
    });
    updateLyricsOffsetDisplay(0);
}

// --- UTILS ---
	        async function playNext() {
	            if (isSwitchingTrack || isLoadingSource) {
	                logAction('next-skipped', 'Next request ignored while switching/loading');
	                return;
	            }
	            logAction('next-start', 'Next track flow started', {
	                trackId: sanitizeText(state.currentTrackId || '')
	            });
	            isSwitchingTrack = true;
	            trackSwitchStartedAt = Date.now();
	            try {
    const cur = resolveQueueDisplayTrack(state.currentTrackId) || state.tracks.find((track) => track?.id === state.currentTrackId);
    const mediaType = cur && cur.type === 'video' ? 'video' : 'audio';
    ensureQueueForType(mediaType);
    registerSkipSignalForCurrentTrack();
    if (mediaType === 'audio') {
        const helper = getAudioQueueHelper();
        const bucket = getUnifiedAudioQueueState();
        const nextStep = typeof helper.advance === 'function'
            ? helper.advance(bucket, { skipEntryIds: bucket.failedEntryIds || [] })
            : { action: 'stop', state: bucket, entry: null };
	                if (!nextStep.entry) {
	                    if (await startAutoplayRadio({ currentTrack: cur })) {
	                        return;
	                    }
	                    clearAutoplayRadioState();
	                    commitUnifiedAudioQueue({
	                        queueSource: 'auto'
	                    }, { refresh: true });
	                    logRecovery('next-queue-exhausted', 'Queue exhausted; playback stopped safely');
	                    stopPlaybackForQueueExhaustion();
	                    return;
	                }
        commitUnifiedAudioQueue({
            ...nextStep.state,
            queueSource: bucket.queueSource || 'auto',
            failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
        });
        await playResolvedTrackFromQueue(nextStep.entry.trackId, {
            autoplay: true,
            allowCrossfade: nextStep.action === 'play'
        });
        refreshQueueViews();
        return;
    }
    const hasQueue = Array.isArray(state.queue) && state.queue.length > 0;
    const isUserManagedQueue = state.queueSource === 'manual' || state.queueSource === 'radio';
    if (hasQueue && (isUserManagedQueue || !state.isShuffle)) {
        const nextIdFromQueue = state.queue.shift();
        if (state.queue.length === 0 && !isUserManagedQueue) {
            state.queueSource = 'auto';
        }
        refreshQueueViews();
        saveActiveQueueBucket();
        if (nextIdFromQueue) {
            await playResolvedTrackFromQueue(nextIdFromQueue, {
                autoplay: true,
                allowCrossfade: true
            });
        }
        return;
    } else if (state.queue && !isUserManagedQueue && state.queue.length > 0 && state.isShuffle) {
        state.queue = [];
        refreshQueueViews();
        saveActiveQueueBucket();
    }

	            if (state.queueSource === 'radio' && (!state.queue || state.queue.length === 0)) {
	                clearAutoplayRadioState();
	                state.queueSource = 'auto';
	                saveActiveQueueBucket();
	                logRecovery('next-radio-exhausted', 'Radio queue exhausted; playback stopped safely');
	                stopPlaybackForQueueExhaustion();
	                return;
	            }

    if (state.isShuffle) {
        if (!state.shuffleQueue || state.shuffleQueue.length === 0) {
	                    if (cur && !canQueueTrackInContext(cur)) {
	                        clearAutoplayRadioState();
	                        state.queueSource = 'auto';
	                        saveActiveQueueBucket();
	                        logRecovery('next-context-invalid', 'Current track no longer valid in queue context; stopped safely');
	                        stopPlaybackForQueueExhaustion();
	                        return;
	                    }
            buildShuffleQueue(state.currentTrackId, mediaType, {
                trackFilter: (candidate) => canQueueTrackInContext(candidate)
            });
        } else if (state.currentTrackId) {
            const currentIndex = state.shuffleQueue.indexOf(state.currentTrackId);
            if (currentIndex !== -1) state.shuffleIndex = currentIndex;
        }
        const nextId = nextFromShuffleQueue();
        if (!nextId) {
            if (await startAutoplayRadio({ currentTrack: cur })) {
                return;
            }
	                    clearAutoplayRadioState();
	                    state.queueSource = 'auto';
	                    saveActiveQueueBucket();
	                    logRecovery('next-shuffle-empty', 'Shuffle queue had no next track; playback stopped safely');
	                    stopPlaybackForQueueExhaustion();
	                    return;
	                }
        await playResolvedTrackFromQueue(nextId, {
            autoplay: true,
            allowCrossfade: true
        });
        refreshQueueViews();
        return;
    }

	            if (cur && !canQueueTrackInContext(cur)) {
	                clearAutoplayRadioState();
	                state.queueSource = 'auto';
	                saveActiveQueueBucket();
	                logRecovery('next-context-stop', 'Current track left queue context; playback stopped safely');
	                stopPlaybackForQueueExhaustion();
	                return;
	            }
    const list = getFilteredTracks().filter((track) => track && track.type === mediaType && canQueueTrackInContext(track));
    const idx = list.findIndex((track) => track.id === state.currentTrackId);
    if (list.length === 0) return;
    if (idx === -1) {
        await playResolvedTrackFromQueue(list[0].id, {
            autoplay: true,
            allowCrossfade: true
        });
        return;
    }
    if (idx < list.length - 1) {
        await playResolvedTrackFromQueue(list[idx + 1].id, {
            autoplay: true,
            allowCrossfade: true
        });
        return;
    }
    if (state.repeatMode === 'all') {
        await playResolvedTrackFromQueue(list[0].id, {
            autoplay: true,
            allowCrossfade: true
        });
        return;
    }
    if (state.repeatMode === 'one') {
        if (isOnlineMusicPlaybackActive()) {
            const current = getOnlineMusicCurrentTrack();
            if (current) {
                const onlinePlaybackContext = isPrivateSessionTrackRecord(current) ? 'private-session' : 'library';
                await playOnlineMusicTrack(current.id, {
                    autoplay: true,
                    startTime: 0,
                    queueTracks: [current],
                    playbackContext: onlinePlaybackContext,
                    queueContextView: onlinePlaybackContext,
                    queueContextKey: onlinePlaybackContext === 'private-session'
                        ? getPrivateSessionQueueContextKey(getPrivateSessionState().currentCollectionKey || 'temporary')
                        : '',
                    privateSession: onlinePlaybackContext === 'private-session'
                });
            }
        } else {
            safeSeekMedia(els.audio, 0);
            handoffToLocalPlayback({ resetOnlineTime: false });
            await safePlayMedia(els.audio, { waitForReady: false, timeoutMs: 4000 });
        }
        return;
    }
    if (await startAutoplayRadio({ currentTrack: cur })) {
        return;
    }
	            clearAutoplayRadioState();
	            state.queueSource = 'auto';
	            saveActiveQueueBucket();
	            logRecovery('next-end-stop', 'Reached end of list; playback stopped safely');
	            stopPlaybackForQueueExhaustion();
	            } catch (error) {
	                console.error(error);
	                logError('next-failed', 'Next flow failed and used safe fallback stop', {
	                    error: sanitizeText(error?.message || '')
	                });
	                stopPlaybackForQueueExhaustion();
	            } finally {
	                isSwitchingTrack = false;
	                trackSwitchStartedAt = 0;
	                normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
	                logAction('next-finish', 'Next track flow finished', {
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                scheduleDebugOverlayRefresh();
	            }
	        }
	        async function playPrev() {
	            if (isSwitchingTrack || isLoadingSource) {
	                logAction('prev-skipped', 'Previous request ignored while switching/loading');
	                return;
	            }
	            logAction('prev-start', 'Previous track flow started', {
	                trackId: sanitizeText(state.currentTrackId || '')
	            });
	            isSwitchingTrack = true;
	            trackSwitchStartedAt = Date.now();
	            try {
    const cur = resolveQueueDisplayTrack(state.currentTrackId) || state.tracks.find(t => t.id === state.currentTrackId);
    const mediaType = cur && cur.type === 'video' ? 'video' : 'audio';
    ensureQueueForType(mediaType);
    if (mediaType === 'audio') {
        const helper = getAudioQueueHelper();
        const bucket = getUnifiedAudioQueueState();
        const prevStep = typeof helper.rewind === 'function'
            ? helper.rewind(bucket, { skipEntryIds: bucket.failedEntryIds || [] })
            : { action: 'stop', state: bucket, entry: null };
        if (!prevStep.entry) return;
        commitUnifiedAudioQueue({
            ...prevStep.state,
            queueSource: bucket.queueSource || 'auto',
            failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
        });
        await playResolvedTrackFromQueue(prevStep.entry.trackId, {
            autoplay: true,
            allowCrossfade: false
        });
        refreshQueueViews();
        return;
    }
    // Shuffle: step back through history
    if (state.isShuffle) {
        if (!state.shuffleQueue || state.shuffleQueue.length === 0) {
            buildShuffleQueue(state.currentTrackId, mediaType);
        } else if (state.currentTrackId) {
            const idx = state.shuffleQueue.indexOf(state.currentTrackId);
            if (idx !== -1) state.shuffleIndex = idx;
        }
        const prevId = prevFromShuffleQueue();
        if (prevId) {
            if (state.crossfadeEnabled) crossFadeToTrack(prevId); else loadTrack(prevId);
        } else {
            if (isOnlineMusicPlaybackActive()) {
                const current = getOnlineMusicCurrentTrack();
                if (current) {
                    const onlinePlaybackContext = isPrivateSessionTrackRecord(current) ? 'private-session' : 'library';
                    playOnlineMusicTrack(current.id, {
                        autoplay: true,
                        startTime: 0,
                        queueTracks: getQueueTracks(mediaType),
                        playbackContext: onlinePlaybackContext,
                        queueContextView: onlinePlaybackContext,
                        queueContextKey: onlinePlaybackContext === 'private-session'
                            ? getPrivateSessionQueueContextKey(getPrivateSessionState().currentCollectionKey || 'temporary')
                            : '',
                        privateSession: onlinePlaybackContext === 'private-session'
                    });
                }
            } else {
                safeSeekMedia(els.audio, 0);
            }
        }
        renderMiniQueuePeek();
        if (state.isQueueOverlayOpen) renderQueueOverlay();
        if (state.activeTab === 'queue') renderQueue();
        return;
    }
    let list = getFilteredTracks().filter(t => t && t.type === mediaType);
    const idx = list.findIndex(t => t.id === state.currentTrackId);
    if (list.length === 0) return;
    if (idx === -1) {
        const nextId = list[0].id;
        if (state.crossfadeEnabled) crossFadeToTrack(nextId); else loadTrack(nextId);
        return;
    }
    if (idx > 0) {
        const nextId = list[idx - 1].id;
        if (state.crossfadeEnabled) crossFadeToTrack(nextId); else loadTrack(nextId);
    } else {
        if (state.repeatMode === 'all') {
            const nextId = list[list.length - 1].id;
            if (state.crossfadeEnabled) crossFadeToTrack(nextId); else loadTrack(nextId);
        } else if (state.repeatMode === 'one') {
            if (isOnlineMusicPlaybackActive()) {
                const current = getOnlineMusicCurrentTrack();
                if (current) {
                    const onlinePlaybackContext = isPrivateSessionTrackRecord(current) ? 'private-session' : 'library';
                    playOnlineMusicTrack(current.id, {
                        autoplay: true,
                        startTime: 0,
                        queueTracks: getQueueTracks(mediaType),
                        playbackContext: onlinePlaybackContext,
                        queueContextView: onlinePlaybackContext,
                        queueContextKey: onlinePlaybackContext === 'private-session'
                            ? getPrivateSessionQueueContextKey(getPrivateSessionState().currentCollectionKey || 'temporary')
                            : '',
                        privateSession: onlinePlaybackContext === 'private-session'
                    });
                }
            } else {
                safeSeekMedia(els.audio, 0);
                handoffToLocalPlayback({ resetOnlineTime: false });
                await safePlayMedia(els.audio, { waitForReady: false, timeoutMs: 4000 });
            }
        } else {
            if (isOnlineMusicPlaybackActive()) {
                const current = getOnlineMusicCurrentTrack();
                if (current) {
                    playOnlineMusicTrack(current.id, {
                        autoplay: true,
                        startTime: 0,
                        queueTracks: getQueueTracks(mediaType),
                        playbackContext: 'library'
                    });
                }
            } else {
                safeSeekMedia(els.audio, 0);
                const nextId = list[0].id;
                if (state.crossfadeEnabled) crossFadeToTrack(nextId); else loadTrack(nextId);
            }
        }
    }
	            } catch (error) {
	                console.error(error);
	                logError('prev-failed', 'Previous flow failed', {
	                    error: sanitizeText(error?.message || '')
	                });
	            } finally {
	                isSwitchingTrack = false;
	                trackSwitchStartedAt = 0;
	                normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
	                logAction('prev-finish', 'Previous track flow finished', {
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                scheduleDebugOverlayRefresh();
	            }
	        }
function resolveLibraryTrackIds(trackIds) {
    const ids = Array.isArray(trackIds) ? trackIds : [];
    if (ids.length === 0) return [];

    const firstTrackById = new Map();
    state.tracks.forEach(track => {
        const trackId = track.id;
        if (typeof trackId === 'number' && Number.isNaN(trackId)) return;
        if (!firstTrackById.has(trackId)) firstTrackById.set(trackId, track);
    });

    return ids.map(id => firstTrackById.get(id)).filter(Boolean);
}

function getFilteredTracks() {
    // Re-use logic for getting the current "playlist" context
    // Build base list depending on active tab
    let list;
    // History tab: map playHistory into track objects preserving order
    if (state.activeTab === 'history') {
        list = resolveLibraryTrackIds(state.playHistory);
    } else if (state.activeTab === 'top') {
        // Top played tab: sort all tracks by play count descending
        list = [...state.tracks].sort((a, b) => {
            const ca = a.playCount || 0;
            const cb = b.playCount || 0;
            return cb - ca;
        });
    } else if (state.activeTab === 'playlists' && state.activePlaylistId) {
        const pl = state.playlists.find(p => p.id === state.activePlaylistId);
        list = resolveLibraryTrackIds(pl?.tracks);
    } else {
        list = [...state.tracks];
    }
    // Apply type filters only for non-history and non-top tabs
    if (state.activeTab === 'videos') list = list.filter(t => t.type === 'video');
    if (state.activeTab === 'audio') list = list.filter(t => t.type === 'audio');
    if (state.activeTab === 'favorites') list = list.filter(t => t.isFavorite);
    // Do not apply the tag filter outside of the dedicated tags view.  The
    // tags page itself (renderTags) will handle filtering; other tabs
    // should always show the full set of tracks.  In the past the
    // library view erroneously continued to filter by the last selected
    // tag, causing only tagged items to appear.  By skipping the tag
    // filter here we ensure the library and other sections display
    // correctly when navigating away from Tags.
    // Apply search filter across title and artist
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        list = list.filter(t => (t.title && t.title.toLowerCase().includes(q)) || (t.artist && t.artist.toLowerCase().includes(q)));
    }
    list = filterOnlineTracksForLibraryBrowse(list);
    return list;
}

/**
 * Build a track list for queue generation.  This function mirrors
 * getFilteredTracks() but intentionally omits the search filter.  The
 * autoâ€‘queue feature should always operate on the full context (e.g. all
 * tracks in the current tab or playlist) rather than the visible
 * search results, otherwise clicking a track while a search is active
 * would produce a queue containing only the filtered items.  Type
 * filters (videos/audio/favorites) and tab context (history/top/
 * playlists) are still respected.
 * @returns {Array} List of track objects for queue generation.
 */
function getQueueTracks(mediaType = null) {
    let list;
    // History tab: map playHistory into track objects preserving order
    if (state.activeTab === 'history') {
        list = resolveLibraryTrackIds(state.playHistory);
    } else if (state.activeTab === 'top') {
        // Top played tab: sort all tracks by play count descending
        list = [...state.tracks].sort((a, b) => {
            const ca = a.playCount || 0;
            const cb = b.playCount || 0;
            return cb - ca;
        });
    } else if (state.activeTab === 'playlists' && state.activePlaylistId) {
        const pl = state.playlists.find(p => p.id === state.activePlaylistId);
        list = resolveLibraryTrackIds(pl?.tracks);
    } else {
        list = [...state.tracks];
    }
    // Apply type filters for non-history and non-top tabs
    if (state.activeTab === 'videos') list = list.filter(t => t.type === 'video');
    if (state.activeTab === 'audio') list = list.filter(t => t.type === 'audio');
    if (state.activeTab === 'favorites') list = list.filter(t => t.isFavorite);
    if (mediaType) list = list.filter(t => t && t.type === mediaType);
    // Fallback: if tab filter produced nothing, use full library of that media type
    if (mediaType && (!list || list.length === 0)) {
        list = state.tracks.filter(t => t && t.type === mediaType);
    }
    list = filterOnlineTracksForLibraryBrowse(list);
    // For tabs that support sorting (matching renderTracks), apply the same
    // sort ordering so that the queue follows the onâ€‘screen order.  Without
    // this step the queue would reflect the raw insertion order of
    // state.tracks, causing mismatches when tracks are sorted by name,
    // size or date added.
    const sortableTabs = ['all', 'audio', 'videos', 'favorites'];
    if (sortableTabs.includes(state.activeTab)) {
        list.sort((a, b) => {
            let cmp = 0;
            if (state.sortType === 'name') {
                cmp = (a.title || '').localeCompare(b.title || '');
            } else if (state.sortType === 'size') {
                cmp = (a.size || 0) - (b.size || 0);
            } else {
                // Default to sorting by addedAt (date).  Missing values are treated as 0.
                cmp = (a.addedAt || 0) - (b.addedAt || 0);
            }
            return state.sortDirection === 'desc' ? -cmp : cmp;
        });
    }
    return list;
}

function refreshLiveViews() {
    if (liveViewsRafId) return;
    liveViewsRafId = requestAnimationFrame(() => {
        liveViewsRafId = 0;
        if (state.activeTab === 'stats') renderStats();
        if (state.activeTab === 'top') renderTracks({ preserveScroll: true });
        if (state.activeTab === 'playlists') renderPlaylists();
    });
}

function formatTime(s) { 
    if(!s || isNaN(s)) return '0:00'; 
    const m=Math.floor(s/60), sc=Math.floor(s%60); 
    return `${m}:${sc<10?'0':''}${sc}`; 
}
function formatOffsetLabel(v) {
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}s`;
}
	        function updateLyricsOffsetDisplay(val) {
	            const el = document.getElementById('windowedModeLyricsOffset');
	            if (el) el.textContent = formatOffsetLabel(val);
	        }
function adjustLyricsOffset(delta) {
    const hl = state.lyricsHighlight || {};
    const newOffset = (hl.offset || 0) + delta;
    hl.offset = newOffset;
    state.lyricsHighlight = hl;
    updateLyricsOffsetDisplay(newOffset);
    // Immediately refresh highlighting at the new offset
    updateProgress();
}

// Media Session helpers for Lively/OS integrations
function updateMediaSession(track, coverUrl) {
    if (!('mediaSession' in navigator) || !track) return;
    const art = coverUrl ? [{ src: coverUrl, sizes: '512x512', type: 'image/png' }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown',
        artist: track.artist || 'Unknown',
        album: 'NexPlay',
        artwork: art
    });
    updateMediaPositionState(true);
}
function updateMediaPositionState(force = false) {
    try {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
        const now = Date.now();
        if (!force && now - lastMediaPositionStateTs < 1000) return;
        const online = getOnlineMusicState();
        const isOnline = isOnlineMusicPlaybackActive();
        const duration = isOnline ? Number(online.duration || getOnlineMusicCurrentTrack()?.duration || 0) : Number(els.audio.duration || 0);
        const position = isOnline ? Number(online.currentTime || 0) : Number(els.audio.currentTime || 0);
        navigator.mediaSession.setPositionState({
            duration: Math.max(0, duration || 0),
            position: Math.max(0, position || 0),
            playbackRate: state.playbackSpeed || els.audio.playbackRate || 1
        });
        lastMediaPositionStateTs = now;
    } catch (_) {}
}
	        function resetProgressUI() {
	            const resetOne = (sliderId, fillId, curId, durId, remId = null) => {
	                const slider = document.getElementById(sliderId);
	                const fill = document.getElementById(fillId);
	                const cur = document.getElementById(curId);
	                const dur = document.getElementById(durId);
	                const rem = remId ? document.getElementById(remId) : null;
	                if (slider) {
	                    slider.value = 0;
	                    slider.max = 0;
	                    slider.disabled = true;
	                }
	                if (fill) fill.style.width = '0%';
	                if (cur) cur.textContent = '0:00';
	                if (dur) dur.textContent = '0:00';
	                if (rem) rem.textContent = '-0:00';
	            };
	            resetOne('mini-seek-slider', 'mini-progress-fill', 'mini-time-current', 'mini-time-duration');
	            resetOne('windowedModeSeekSlider', 'windowedModeProgressFill', 'windowedModeTimeCurrent', 'windowedModeTimeDuration');
	            resetOne('fsModeSeekSlider', 'fsModeProgressFill', 'fsModeTimeCurrent', 'fsModeTimeDuration');
	            resetOne('videoFsModeSeekSlider', 'videoFsModeProgressFill', 'videoFsTimeCurrent', null, 'videoFsTimeRemaining');
	        }
function formatSize(b) { if(!b) return ''; const i=Math.floor(Math.log(b)/Math.log(1024)); return (b/Math.pow(1024,i)).toFixed(1)+['B','KB','MB','GB'][i]; }
function updateVolumeUI(val) {
    const pct = Math.round(val * 100);
    const fill = document.getElementById('vol-fill');
    const label = document.getElementById('vol-value');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = `${pct}%`;
    const slider = document.getElementById('vol-slider');
    if (slider && slider.value != val) slider.value = val;
    updateVideoVolumeUI(val);
}
function handleVolume(e) { 
    const v = parseFloat(e.target.value);
    const clamped = isNaN(v) ? state.volume : Math.max(0, Math.min(1, v));
    state.volume = clamped; 
    els.audio.volume = clamped; 
    if (state.onlineMusic) state.onlineMusic.volume = Math.round(clamped * 100);
    if (onlineMusicPlayer && onlineMusicPlayerReady && typeof onlineMusicPlayer.setVolume === 'function') {
        try { onlineMusicPlayer.setVolume(Math.round(clamped * 100)); } catch (_) {}
    }
    updateVolumeUI(clamped);
    syncOnlineMusicPlayerCard();
    persistOnlineMusicState();
    persistAppStateNow();
}
function changeVolume(delta) { 
    let v = parseFloat(state.volume) + delta; 
    if(v > 1) v=1; if(v < 0) v=0; 
    state.volume = v; 
    els.audio.volume = v; 
    if (state.onlineMusic) state.onlineMusic.volume = Math.round(v * 100);
    if (onlineMusicPlayer && onlineMusicPlayerReady && typeof onlineMusicPlayer.setVolume === 'function') {
        try { onlineMusicPlayer.setVolume(Math.round(v * 100)); } catch (_) {}
    }
    document.getElementById('vol-slider').value = v; 
    updateVolumeUI(v);
    syncOnlineMusicPlayerCard();
    persistOnlineMusicState();
    persistAppStateNow();
}
function toggleMute() { 
    const sl = document.getElementById('vol-slider'); 
    if(state.volume > 0) { state.savedVol = state.volume; sl.value=0; handleVolume({target:{value:0}}); }
    else { sl.value = state.savedVol || 0.8; handleVolume({target:{value:sl.value}}); }
}

// Shuffle & Repeat functions
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function clearShuffleState() {
    state.shuffleQueue = [];
    state.shuffleIndex = -1;
    state.pendingShuffleSeed = null;
    renderMiniQueuePeek();
    if (state.isQueueOverlayOpen) renderQueueOverlay();
    if (state.activeTab === 'queue') renderQueue();
    saveActiveQueueBucket();
}

function buildShuffleQueue(startId = state.currentTrackId, mediaType = null, options = {}) {
    const trackFilter = typeof options.trackFilter === 'function' ? options.trackFilter : null;
    const pool = (getQueueTracks(mediaType || currentMediaType()) || [])
        .filter((track) => !trackFilter || trackFilter(track))
        .map(t => t && t.id)
        .filter(Boolean);
    const unique = Array.from(new Set(pool));
    if (unique.length === 0) { clearShuffleState(); return; }
    shuffleArray(unique);
    let idx = unique.indexOf(startId);
    if (idx === -1 && startId) {
        unique.unshift(startId);
        idx = 0;
    }
    state.shuffleQueue = unique;
    state.shuffleIndex = idx >= 0 ? idx : 0;
    state.pendingShuffleSeed = null;
    renderMiniQueuePeek();
    if (state.isQueueOverlayOpen) renderQueueOverlay();
    if (state.activeTab === 'queue') renderQueue();
    saveActiveQueueBucket();
}

function nextFromShuffleQueue() {
    if (!state.shuffleQueue || state.shuffleQueue.length === 0) return null;
    if (state.shuffleIndex == null || state.shuffleIndex < 0) {
        const idx = state.shuffleQueue.indexOf(state.currentTrackId);
        state.shuffleIndex = idx >= 0 ? idx : 0;
    }
    if (state.shuffleIndex < state.shuffleQueue.length - 1) {
        state.shuffleIndex += 1;
        return state.shuffleQueue[state.shuffleIndex];
    }
    if (state.repeatMode === 'all') {
        buildShuffleQueue(state.currentTrackId, currentMediaType(), {
            trackFilter: (candidate) => canQueueTrackInContext(candidate)
        });
        return state.shuffleQueue[0];
    }
    if (state.repeatMode === 'one') {
        return state.currentTrackId;
    }
    return null;
}

function prevFromShuffleQueue() {
    if (!state.shuffleQueue || state.shuffleQueue.length === 0) return null;
    if (state.shuffleIndex == null || state.shuffleIndex < 0) {
        const idx = state.shuffleQueue.indexOf(state.currentTrackId);
        state.shuffleIndex = idx >= 0 ? idx : 0;
    }
    if (state.shuffleIndex > 0) {
        state.shuffleIndex -= 1;
        return state.shuffleQueue[state.shuffleIndex];
    }
    if (state.repeatMode === 'all' && state.shuffleQueue.length > 0) {
        state.shuffleIndex = state.shuffleQueue.length - 1;
        return state.shuffleQueue[state.shuffleIndex];
    }
    return state.currentTrackId;
}

function rebuildActiveSharedOnlineMusicQueue(mode = 'ordered') {
    const online = getOnlineMusicState();
    const current = getOnlineMusicCurrentTrack();
    const playbackContext = normalizeOnlineMusicPlaybackContext(online.queueContextView || online.playbackContext || 'search');
    if (!current || playbackContext === 'library') return false;
    const baseTracks = getOnlineMusicTracksForView(playbackContext).filter(Boolean);
    const dedupedTracks = Array.from(new Map(baseTracks
        .filter((track) => track?.id)
        .map((track) => [track.id, track])).values());
    const orderedQueueTracks = dedupedTracks.some((track) => track.id === current.id)
        ? dedupedTracks
        : [current, ...dedupedTracks];
    const otherTracks = orderedQueueTracks.filter((track) => track.id !== current.id);
    const nextQueueTracks = mode === 'shuffle'
        ? [current, ...shuffleOnlineMusicTracks(otherTracks)]
        : orderedQueueTracks;
    setOnlineMusicQueue(nextQueueTracks.map((track) => track.id), current.id);
    setOnlineMusicQueueContext(playbackContext, sanitizeText(online.queueContextKey || getOnlineMusicQueueContextKey(playbackContext) || ''), mode);
    syncOnlineMusicQueueToSharedAudioState({
        queue: nextQueueTracks.map((track) => track.id),
        currentTrackId: current.id,
        playbackContext,
        queueMode: mode
    });
    persistOnlineMusicState();
    updateShuffleIcon();
    return true;
}

function toggleShuffle() {
    if (currentMediaType() === 'audio') {
        const helper = getAudioQueueHelper();
        const bucket = getUnifiedAudioQueueState();
        const nextShuffle = !bucket.isShuffle;
        commitUnifiedAudioQueue({
            isShuffle: nextShuffle,
            shuffleOrder: nextShuffle
                ? (typeof helper.buildShuffleOrder === 'function'
                    ? helper.buildShuffleOrder(bucket.entries || [], bucket.currentIndex)
                    : (bucket.entries || []).map((entry) => entry.id))
                : [],
            pendingShuffleSeed: null
        });
        return;
    }
    state.isShuffle = !state.isShuffle;
    if (state.isShuffle) {
        // Clear auto-generated queues; manual queue stays in order.
        if (state.queueSource !== 'manual') {
            state.queue = [];
            refreshQueueViews();
        }
        const seed = state.currentTrackId || state.pendingShuffleSeed;
        buildShuffleQueue(seed, currentMediaType());
    } else {
        clearShuffleState();
    }
    saveActiveQueueBucket();
    updateShuffleIcon();
}
function cycleRepeat() {
    // Cycle repeat modes: none -> all -> one -> none
    // Cycle repeat modes: none â†’ all â†’ one â†’ none and update the
    // underlying audio element loop property.  When repeating one
    // track, the HTML audio element handles the restart itself via
    // loop=true; otherwise we manage track transitions in playNext().
    // Cycle repeat modes: none â†’ all â†’ one â†’ none.  We do not use the HTML audio element's
    // loop property because it prevents the `ended` event from firing and can cause
    // inconsistencies with crossfading and statistics.  Instead, repeat logic is handled
    // manually in the ended event.
    if (!state.repeatMode || state.repeatMode === 'none') {
        state.repeatMode = 'all';
    } else if (state.repeatMode === 'all') {
        state.repeatMode = 'one';
    } else {
        state.repeatMode = 'none';
    }
    saveActiveQueueBucket();
    updateRepeatIcon();
}

function commitSharedOnlineMusicQueue(queue = [], options = {}) {
    const online = getOnlineMusicState();
    const nextQueue = Array.from(new Set((Array.isArray(queue) ? queue : [])
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    const currentTrackId = normalizeOnlineMusicTrackId(options.currentTrackId || online.currentTrackId || state.currentTrackId || '');
    online.queue = nextQueue;
    online.queueIndex = currentTrackId ? nextQueue.indexOf(currentTrackId) : -1;
    syncOnlineMusicQueueToSharedAudioState({
        queue: nextQueue,
        queueIndex: online.queueIndex,
        currentTrackId,
        playbackContext: options.playbackContext || online.playbackContext,
        queueMode: options.queueMode || online.queueMode
    });
    persistOnlineMusicState();
}

function mutateSharedOnlineMusicQueue(transform) {
    if (!isSharedOnlineMusicQueuePlayback()) return false;
    const online = getOnlineMusicState();
    const queue = Array.from(new Set((Array.isArray(online.queue) ? online.queue : [])
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    const currentTrackId = normalizeOnlineMusicTrackId(online.currentTrackId || state.currentTrackId || '');
    const currentIndex = currentTrackId ? queue.indexOf(currentTrackId) : -1;
    const nextQueue = typeof transform === 'function'
        ? transform({
            queue: queue.slice(),
            currentTrackId,
            currentIndex,
            queueMode: online.queueMode === 'shuffle' ? 'shuffle' : 'ordered'
        })
        : null;
    if (!Array.isArray(nextQueue)) return true;
    commitSharedOnlineMusicQueue(nextQueue, {
        currentTrackId,
        playbackContext: online.playbackContext,
        queueMode: online.queueMode
    });
    updateShuffleIcon();
    return true;
}

function canCrossfadeToResolvedTrack(track = null) {
    return !!track
        && track.type === 'audio'
        && !isOnlineMusicTrackRecord(track)
        && !isOnlineMusicPlaybackActive()
        && !!state.crossfadeEnabled
        && !!state.isPlaying;
}

async function playResolvedTrackFromQueue(trackId = '', options = {}) {
    const track = resolveQueueDisplayTrack(trackId);
    if (!track) return false;
    const opts = {
        autoplay: true,
        allowCrossfade: false,
        startTime: 0,
        ...options
    };
    if ((track.type || 'audio') !== 'video') {
        const bucket = getUnifiedAudioQueueState();
        const nextIndex = findUnifiedAudioQueueEntryIndexByTrackId(track.id);
        const currentEntry = nextIndex >= 0 ? bucket.entries[nextIndex] || null : null;
        commitUnifiedAudioQueue({
            currentIndex: nextIndex,
            failedEntryIds: currentEntry
                ? (bucket.failedEntryIds || []).filter((entryId) => entryId !== currentEntry.id)
                : (bucket.failedEntryIds || []).slice()
        }, {
            refresh: true
        });
    }
    if (isOnlineMusicTrackRecord(track)) {
        const isPrivateQueueTrack = isPrivateSessionTrackRecord(track)
            || !!(isPrivateSessionRouteActive() && findPrivateSessionTrackById(track.id, { includeSearchResults: true }));
        const privateState = getPrivateSessionState();
        const playbackContext = isPrivateQueueTrack ? 'private-session' : 'library';
        const started = await playOnlineMusicTrack(track.id, {
            autoplay: opts.autoplay !== false,
            startTime: Number(opts.startTime) || 0,
            fromQueue: true,
            playbackContext,
            queueContextView: playbackContext,
            queueContextKey: isPrivateQueueTrack
                ? getPrivateSessionQueueContextKey(privateState.currentCollectionKey || 'temporary')
                : '',
            queueMode: getUnifiedAudioQueueState().isShuffle ? 'shuffle' : 'ordered',
            trackSnapshot: track,
            privateSession: isPrivateQueueTrack
        });
        if (!started) {
            const failedEntry = getUnifiedAudioQueueCurrentEntry();
            if (failedEntry && sanitizeText(failedEntry.trackId || '') === sanitizeText(track.id || '')) {
                rememberAudioQueueFailure(failedEntry.id);
                scheduleOnlineMusicAdvanceAfterFailure(track.id);
            }
            return false;
        }
        return true;
    }
    if (opts.allowCrossfade && canCrossfadeToResolvedTrack(track)) {
        crossFadeToTrack(track.id);
        return true;
    }
    loadTrack(track.id, opts.autoplay !== false, null, { allowQueueSwitch: true });
    return true;
}

	        function stopPlaybackForQueueExhaustion() {
	            logRecovery('queue-exhausted-stop', 'Queue exhaustion triggered safe playback stop', {
	                source: sanitizeText(state.currentPlaybackSource || '')
	            });
	            if (isOnlineMusicPlaybackActive()) {
        const online = getOnlineMusicState();
        clearOnlineMusicAdvanceAfterFailureTimer();
        onlineMusicCurrentTrackStartedFromQueue = false;
        clearOnlineMusicConnectingAttempt({ force: true });
        online.isPlaying = false;
        state.isPlaying = false;
        stopOnlineMusicProgressTimer();
        if (onlineMusicPlayer && onlineMusicPlayerReady && typeof onlineMusicPlayer.pauseVideo === 'function') {
            try { onlineMusicPlayer.pauseVideo(); } catch (_) {}
        }
        updatePlayIcons();
        refreshPlayingIndicators();
        persistOnlineMusicState();
	            } else if (els.audio) {
	                safePauseMedia(els.audio);
	            }
	            refreshQueueViews();
	            syncUiAfterRecovery({ clearLoading: true, refreshQueue: true });
	        }

function playQueuedTrack(trackId, event = null) {
    if (event && event.preventDefault) event.preventDefault();
    if (event && event.stopPropagation) event.stopPropagation();
    const track = resolveQueueDisplayTrack(trackId);
    if (!track) return;
    playResolvedTrackFromQueue(track.id, {
        autoplay: true,
        allowCrossfade: false
    });
}

