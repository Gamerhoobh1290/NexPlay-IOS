/* Legacy online music import, provider, and persistence logic.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

/**
 * Import a YouTube / YouTube Music playlist: loads tracks via the Data API, saves each as an
 * online library entry, and creates a NexPlay playlist containing those tracks.
 */
async function importYouTubeMusicPlaylistFromInput(rawInput = '', options = {}) {
    if (onlineMusicPlaylistImportBusy) return null;
    const opts = { ...options, maxPages: Math.max(1, Math.min(Number(options.maxPages) || 16, 40)) };
    const playlistId = extractYouTubePlaylistIdFromUrl(rawInput);
    if (!playlistId) {
        showToast('Paste a YouTube or YouTube Music playlist link, or a playlist ID.', 'error');
        updateOnlineMusicFeedback('Could not read a playlist ID. Use a link with ?list=... or music.youtube.com/playlist?list=...', 'warn');
        return null;
    }
    syncConfiguredOnlineMusicApiKey();
    const apiKey = sanitizeText(syncConfiguredOnlineMusicApiKey() || YOUTUBE_DATA_API_KEY);
    if (!apiKey) {
        showToast('Add a YouTube Data API v3 key in Settings to import playlists.', 'error');
        updateOnlineMusicFeedback('Playlist import needs a YouTube API key (Feature Settings).', 'error');
        return null;
    }
    onlineMusicPlaylistImportBusy = true;
    const importBtn = document.getElementById('online-music-playlist-import-btn');
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.dataset.prevLabel = importBtn.textContent || '';
        importBtn.textContent = 'Importingâ€¦';
    }
    updateOnlineMusicFeedback('Loading playlist from YouTube...', 'info');
    let playlistTitle = 'YouTube playlist';
    try {
        const details = await fetchOnlineMusicPlaylistsByIds([playlistId]);
        const snippet = details[0]?.snippet;
        if (snippet?.title) playlistTitle = sanitizeText(snippet.title) || playlistTitle;
    } catch (error) {
        onlineMusicPlaylistImportBusy = false;
        if (importBtn) {
            importBtn.disabled = false;
            if (importBtn.dataset.prevLabel) importBtn.textContent = importBtn.dataset.prevLabel;
        }
        updateOnlineMusicFeedback(error?.message || 'Could not read that playlist.', 'error');
        showToast(error?.message || 'Playlist lookup failed.', 'error');
        return null;
    }
    let resolution;
    try {
        resolution = await fetchOnlineMusicTracksFromPlaylist(playlistId, {
            maxPages: opts.maxPages,
            artist: '',
            channelId: '',
            channelTitle: '',
            releaseTitle: playlistTitle
        });
    } catch (error) {
        onlineMusicPlaylistImportBusy = false;
        if (importBtn) {
            importBtn.disabled = false;
            if (importBtn.dataset.prevLabel) importBtn.textContent = importBtn.dataset.prevLabel;
        }
        updateOnlineMusicFeedback(error?.message || 'Could not load playlist tracks.', 'error');
        showToast(error?.message || 'Failed to load playlist.', 'error');
        return null;
    }
    const tracks = resolution?.tracks || [];
    if (!tracks.length) {
        onlineMusicPlaylistImportBusy = false;
        if (importBtn) {
            importBtn.disabled = false;
            if (importBtn.dataset.prevLabel) importBtn.textContent = importBtn.dataset.prevLabel;
        }
        updateOnlineMusicFeedback('No playable tracks were found in that playlist.', 'warn');
        showToast('No tracks were imported.', 'info');
        return null;
    }
    const importedIds = [];
    tracks.forEach((track) => {
        const merged = upsertOnlineMusicTrack(track, { persist: false });
        if (merged?.id) importedIds.push(merged.id);
    });
    persistSavedOnlineMusicLibrary();
    persistOnlineMusicState();
    const safeName = playlistTitle.slice(0, 120) || 'YouTube playlist';
    const newPl = {
        id: generateId(),
        name: safeName,
        tracks: importedIds.slice(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        importSource: 'youtube-playlist'
    };
    state.playlists.push(newPl);
    persistPlaylists();
    persistAppStateNow();
    updateLibraryStatsLabel();
    const missingNote = Number(resolution?.missingTrackCount || 0) > 0
        ? ` (${resolution.missingTrackCount} entries skipped or unavailable.)`
        : '';
    updateOnlineMusicFeedback(`Imported ${importedIds.length} track(s) from "${safeName}" into your library and playlists.${missingNote}`, 'success');
    showToast(`Imported playlist: ${safeName}`, 'success');
    onlineMusicPlaylistImportBusy = false;
    if (importBtn) {
        importBtn.disabled = false;
        if (importBtn.dataset.prevLabel) importBtn.textContent = importBtn.dataset.prevLabel;
    }
    if (state.activeTab === 'online-music') renderOnlineMusicContent();
    else renderTracks({ preserveScroll: true });
    return newPl;
}

function setOnlineMusicQueue(trackIds = [], currentTrackId = null) {
    const online = getOnlineMusicState();
    online.queue = Array.from(new Set((Array.isArray(trackIds) ? trackIds : [])
        .map((id) => normalizeOnlineMusicTrackId(id))
        .filter(Boolean)));
    const targetId = normalizeOnlineMusicTrackId(currentTrackId || online.currentTrackId || '');
    online.queueIndex = targetId ? online.queue.indexOf(targetId) : -1;
}

function shuffleOnlineMusicTracks(tracks = []) {
    const list = (Array.isArray(tracks) ? tracks : []).slice();
    for (let index = list.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    }
    return list;
}

async function playOnlineMusicReleaseCollection(mode = 'ordered') {
    const online = getOnlineMusicState();
    const release = online.browserRelease;
    const releaseTracks = Array.isArray(release?.tracks) ? release.tracks.slice() : [];
    if (!release?.playlistId || !releaseTracks.length) {
        showToast('No release tracks are available yet.', 'info');
        return;
    }
    const queueTracks = mode === 'shuffle' ? shuffleOnlineMusicTracks(releaseTracks) : releaseTracks;
    const firstTrack = queueTracks.find((track) => canResolveOnlineMusicTrackOnCurrentRuntime(track));
    if (!firstTrack) {
        const message = getOnlineMusicPlaybackResolutionUnavailableMessage('collection');
        updateOnlineMusicFeedback(message, 'warn');
        showToast(message, 'info');
        return;
    }
    await startTrackCollectionPlayback(queueTracks, firstTrack.id, {
        autoplay: true,
        queueSource: 'manual',
        isShuffle: mode === 'shuffle',
        queueContextView: 'release',
        queueContextKey: getOnlineMusicQueueContextKey('release', { release }),
        playbackContext: 'release'
    });
}

function upsertOnlineMusicTrack(track, options = {}) {
    const clean = sanitizeStoredOnlineMusicTrack(track);
    if (!clean) return null;
    const online = getOnlineMusicState();
    upsertSavedOnlineMusicLibraryTrack(clean);
    const merged = syncOnlineTrackIntoMainLibrary(clean, { allowInsert: true, persistLibrary: false }) || clean;
    mapOnlineMusicCollections((item) => item?.id === merged.id ? { ...item, ...merged, resumePosition: 0, resumeUpdatedAt: 0 } : item);
    if (online.currentTrackId === merged.id || online.currentTrack?.id === merged.id) {
        online.currentTrack = { ...merged, resumePosition: 0, resumeUpdatedAt: 0 };
    }
    clearOnlineMusicResumeMetadata(merged);
    if (options.persist !== false) {
        persistSavedOnlineMusicLibrary();
        persistOnlineMusicState();
    }
    return merged;
}

function saveOnlineMusicTrackToLibrary(trackId, options = {}) {
    const explicitId = normalizeOnlineMusicTrackId(trackId || options?.track?.id || '');
    if (!explicitId) return null;
    const candidate = options?.track && normalizeOnlineMusicTrackId(options.track.id || '') === explicitId
        ? options.track
        : null;
    const track = candidate || getOnlineMusicTrack(explicitId);
    if (!track) return null;
    const saved = upsertOnlineMusicTrack(track, { persist: false });
    if (!saved || normalizeOnlineMusicTrackId(saved.id || '') !== explicitId) return null;
    persistSavedOnlineMusicLibrary();
    persistOnlineMusicState();
    updateLibraryStatsLabel();
    if (state.activeTab === 'online-music') renderOnlineMusicContent();
    else renderTracks({ preserveScroll: true });
    if (!options.quiet) {
        updateOnlineMusicFeedback(`Added "${saved.title}" to your NexPlay library.`, 'success');
        showToast('Added to library.', 'info');
    }
    return saved;
}

function toggleOnlineMusicFavorite(trackId, options = {}) {
    const saved = saveOnlineMusicTrackToLibrary(trackId, { quiet: true });
    if (!saved) return;
    const target = state.tracks.find((item) => item?.id === saved.id);
    if (!target) return;
    target.isFavorite = !target.isFavorite;
    persistTrackMetadata(target);
    syncMainLibraryTrackToOnlineState(target, { ensureSaved: true, persist: false });
    persistSavedOnlineMusicLibrary();
    persistOnlineMusicState();
    if (state.activeTab === 'online-music') renderOnlineMusicContent();
    else renderTracks({ preserveScroll: true });
    if (!options.quiet) {
        updateOnlineMusicFeedback(target.isFavorite ? `Favorited "${target.title}".` : `Removed "${target.title}" from favorites.`, target.isFavorite ? 'success' : 'info');
        showToast(target.isFavorite ? 'Added to favorites.' : 'Removed from favorites.', 'info');
    }
}

function removeOnlineMusicTrackFromLibrary(trackId) {
    const id = normalizeOnlineMusicTrackId(trackId);
    if (!id) return;
    pruneOnlineMusicLibraryEntries(id, { persist: false });
    removeOnlineTrackFromMainLibrary(id);
    persistSavedOnlineMusicLibrary();
    persistOnlineMusicState();
    updateLibraryStatsLabel();
    if (state.activeTab === 'online-music') renderOnlineMusicContent();
    else renderTracks({ preserveScroll: true });
    updateOnlineMusicFeedback('Removed streaming track from your library.', 'info');
    showToast('Removed from library.', 'info');
}

function promptAddOnlineMusicTrackToPlaylist(trackId) {
    const track = saveOnlineMusicTrackToLibrary(trackId, { quiet: true });
    if (!track) return;
    openPlaylistModal(track.id);
    updateOnlineMusicFeedback(`Choose a playlist for "${track.title}".`, 'info');
}

function createOnlineMusicPlaylistFromInput() {
    openPlaylistModal();
}

function deleteOnlineMusicPlaylist(playlistId) {
    return;
}

function selectOnlineMusicPlaylist(playlistId) {
    openPlaylist(playlistId);
}

function removeOnlineMusicTrackFromPlaylist(playlistId, trackId) {
    removeFromPlaylist(playlistId, trackId);
}

function syncOnlineMusicPlayerCard() {
    const online = getOnlineMusicState();
    const current = getOnlineMusicCurrentTrack();
    const canOpenArtist = !!current;
    const isConnecting = !!(current && normalizeOnlineMusicTrackId(online.connectingTrackId || '') === normalizeOnlineMusicTrackId(current.id || ''));
    const cover = document.getElementById('online-music-current-cover');
    const fallback = document.getElementById('online-music-current-cover-fallback');
    const title = document.getElementById('online-music-current-title');
    const artist = document.getElementById('online-music-current-artist');
    const status = document.getElementById('online-music-current-status');
    const playBtn = document.getElementById('online-music-play-btn');
    const saveBtn = document.getElementById('online-music-save-current-btn');
    const favoriteBtn = document.getElementById('online-music-favorite-current-btn');
    const prevBtn = document.getElementById('online-music-prev-btn');
    const nextBtn = document.getElementById('online-music-next-btn');
    const seek = document.getElementById('online-music-seek-slider');
    const currentTime = document.getElementById('online-music-time-current');
    const totalTime = document.getElementById('online-music-time-duration');
    const volume = document.getElementById('online-music-volume-slider');
    const volumeLabel = document.getElementById('online-music-volume-label');
    const isSaved = current ? !!getSavedOnlineTrack(current.id) : false;

    if (title) title.textContent = current?.title || 'No track selected';
    if (artist) {
        artist.textContent = current?.artist || 'Search and press play.';
        artist.disabled = !canOpenArtist;
        artist.title = canOpenArtist ? `Open ${current.artist || current.channelTitle || 'artist'} catalog` : '';
        artist.classList.toggle('text-cyan-200', canOpenArtist);
        artist.classList.toggle('hover:text-white', canOpenArtist);
        artist.classList.toggle('text-gray-500', !canOpenArtist);
    }
    if (status) {
        if (!current) status.textContent = 'Play a result here, then use the shared NexPlay transport below.';
        else if (online.pendingTrackId && online.pendingTrackId === current.id) status.textContent = 'Downloading MP3 copy in the desktop queue.';
        else if (isConnecting) status.textContent = 'Connecting the hidden YouTube player...';
        else if (online.isPlaying) status.textContent = isSaved ? 'Streaming through the shared NexPlay player.' : 'Streaming search result through the shared NexPlay player.';
        else status.textContent = isSaved ? 'Saved streaming track ready in the shared player.' : 'Search result ready in the shared player.';
    }
    if (cover && fallback) {
        if (current?.cover) {
            cover.src = current.cover;
            cover.classList.remove('hidden');
            fallback.classList.add('hidden');
        } else {
            cover.src = '';
            cover.classList.add('hidden');
            fallback.classList.remove('hidden');
        }
    }
    if (playBtn) {
        playBtn.textContent = isConnecting ? 'Connecting...' : (online.isPlaying ? 'Pause' : 'Play');
        playBtn.disabled = !!isConnecting;
    }
    if (saveBtn) saveBtn.textContent = isSaved ? 'Saved' : 'Save';
    if (favoriteBtn) favoriteBtn.textContent = current?.isFavorite ? 'Favorited' : 'Favorite';
    if (prevBtn || nextBtn) {
        const helper = getAudioQueueHelper();
        const audioQueue = getUnifiedAudioQueueState();
        const prevState = typeof helper.rewind === 'function'
            ? helper.rewind(audioQueue, { skipEntryIds: audioQueue.failedEntryIds || [] })
            : { entry: null };
        const nextState = typeof helper.advance === 'function'
            ? helper.advance(audioQueue, { skipEntryIds: audioQueue.failedEntryIds || [] })
            : { entry: null };
        if (prevBtn) prevBtn.disabled = !prevState.entry;
        if (nextBtn) nextBtn.disabled = !nextState.entry;
    }
    if (seek) {
        const max = Math.max(0, Math.floor(Number(online.duration || current?.duration || 0)));
        seek.max = String(max);
        seek.disabled = !current || max <= 0;
        if (!onlineMusicSuppressSeekSync) seek.value = String(Math.max(0, Math.floor(Number(online.currentTime || 0))));
    }
    if (currentTime) currentTime.textContent = formatTime(Number(online.currentTime || 0));
    if (totalTime) totalTime.textContent = formatTime(Number(online.duration || current?.duration || 0));
    if (volume) volume.value = String(clampNumber(online.volume, 0, 100, 70));
    if (volumeLabel) volumeLabel.textContent = `${clampNumber(online.volume, 0, 100, 70)}%`;
    syncOnlineMusicResultRows();
}

function captureOnlineMusicProgress(options = {}) {
    const opts = { forcePersist: false, ...options };
    const online = getOnlineMusicState();
    const isolatePreviewUi = isMusicGamePreviewActive();
    if (!online.currentTrackId) {
        if (!isolatePreviewUi) syncOnlineMusicPlayerCard();
        return;
    }
    const current = getOnlineMusicCurrentTrack();
    if (!current || shouldIgnoreOnlineMusicTransport(current)) {
        return;
    }
    const isPrivatePlayback = isPrivateOnlineMusicPlaybackContext(online.playbackContext) || isPrivateSessionTrackRecord(current);
    if (isOnlineMusicDirectAudioActive() && els.audio) {
        const nextTime = getMediaCurrentTimeSafe(els.audio);
        if (Number.isFinite(nextTime) && nextTime >= 0) online.currentTime = nextTime;
        const nextDuration = getMediaDurationSafe(els.audio, Number(current?.duration || online.duration || 0));
        if (Number.isFinite(nextDuration) && nextDuration > 0) online.duration = nextDuration;
    } else if (onlineMusicPlayer && onlineMusicPlayerReady) {
        try {
            const nextTime = Number(onlineMusicPlayer.getCurrentTime?.() || 0);
            if (Number.isFinite(nextTime) && nextTime >= 0) online.currentTime = nextTime;
        } catch (_) {}
        try {
            const nextDuration = Number(onlineMusicPlayer.getDuration?.() || 0);
            if (Number.isFinite(nextDuration) && nextDuration >= 0) online.duration = nextDuration;
        } catch (_) {}
    }
    if (current) {
        const nextTrack = {
            ...current,
            duration: online.duration > 0 ? Math.max(Number(current.duration) || 0, Number(online.duration) || 0) : Number(current.duration) || 0,
            resumePosition: 0,
            resumeUpdatedAt: 0
        };
        online.currentTrack = { ...nextTrack };
        const savedTrack = isPrivatePlayback ? null : getSavedOnlineTrack(current.id);
        if (!isPrivatePlayback && (savedTrack || online.playbackContext === 'library')) {
            const syncedTrack = syncOnlineTrackIntoMainLibrary(nextTrack, {
                allowInsert: true
            });
            if (syncedTrack && state.currentTrackId === syncedTrack.id) {
                state.currentTrack = { ...syncedTrack };
            }
        } else if (state.currentTrackId === nextTrack.id) {
            state.currentTrack = { ...nextTrack };
        }
    }
    updateProgress();
    if (!isolatePreviewUi) syncOnlineMusicPlayerCard();
    const now = Date.now();
    if (!isPrivatePlayback && !shouldSuppressMusicGameMetrics() && (opts.forcePersist || now - lastOnlineMusicPersistTs > 4000)) {
        lastOnlineMusicPersistTs = now;
        persistOnlineMusicState();
    }
}

function startOnlineMusicProgressTimer() {
    if (onlineMusicProgressTimer) clearInterval(onlineMusicProgressTimer);
    onlineMusicProgressTimer = setInterval(() => captureOnlineMusicProgress(), 200);
}

function stopOnlineMusicProgressTimer() {
    if (!onlineMusicProgressTimer) return;
    clearInterval(onlineMusicProgressTimer);
    onlineMusicProgressTimer = null;
}

async function retryOnlineMusicPlaybackAfterPlayerError(track = null, options = {}) {
    const current = track || getOnlineMusicCurrentTrack();
    if (!current || !isOnlineMusicPlaybackResolutionAvailable()) return false;
    const failedVideoId = sanitizeText(options.videoId || current.videoId || '').trim();
    const failedVideoIds = Array.from(new Set([
        ...getFailedOnlineMusicTrackVideoIds(current.id),
        failedVideoId
    ].map((id) => sanitizeText(id || '').trim()).filter(Boolean))).slice(-6);
    if (!failedVideoId || failedVideoIds.length > 5) return false;
    const online = getOnlineMusicState();
    const retryTrack = sanitizeStoredOnlineMusicTrack({
        ...current,
        videoId: '',
        youtubeVideoId: '',
        canonicalUrl: '',
        transportProvider: '',
        transportProviderLabel: '',
        pendingPlaybackResolution: true
    });
    if (!retryTrack) return false;
    updateOnlineMusicFeedback(`Trying another YouTube source for "${sanitizeText(current.title || 'track')}"...`, 'info');
    window.setTimeout(() => {
        playOnlineMusicTrack(current.id, {
            autoplay: true,
            startTime: Math.max(0, Number(online.currentTime || 0) || 0),
            playbackContext: normalizeOnlineMusicPlaybackContext(online.playbackContext || 'library'),
            queueContextView: normalizeOnlineMusicPlaybackContext(online.queueContextView || online.playbackContext || 'library'),
            queueContextKey: sanitizeText(online.queueContextKey || ''),
            queueMode: getUnifiedAudioQueueState().isShuffle ? 'shuffle' : 'ordered',
            trackSnapshot: retryTrack,
            forcePlaybackResolution: true,
            excludeVideoIds: failedVideoIds,
            fromErrorRecovery: true,
            fromQueue: !!onlineMusicCurrentTrackStartedFromQueue,
            privateSession: isPrivateOnlineMusicPlaybackContext(online.playbackContext) || isPrivateSessionTrackRecord(current)
        }).catch((error) => {
            logError('online-player-retry-failed', 'Online player retry failed', {
                trackId: sanitizeText(current.id || ''),
                error: sanitizeText(error?.message || '')
            });
        });
    }, 0);
    return true;
}

	        async function handleOnlineMusicPlayerError(event) {
	            const current = getOnlineMusicCurrentTrack();
	            if (shouldIgnoreOnlineMusicTransport(current)) return;
    if (isOnlineMusicDirectAudioActive({ trackId: current?.id || '' })) return;
	            const online = getOnlineMusicState();
    clearOnlineMusicConnectTimeout();
    clearOnlineMusicConnectingAttempt({ trackId: current?.id || online.currentTrackId || '', sessionId: online.sessionId });
	            const code = Number(event?.data || 0);
	            logError('online-player-error', 'Online player emitted an error', {
	                code,
	                trackId: sanitizeText(current?.id || ''),
	                videoId: sanitizeText(current?.videoId || '')
	            });
	            const messages = {
        2: 'Invalid YouTube video request.',
        5: 'This YouTube video could not be played in the hidden player.',
        100: 'That YouTube video is no longer available.',
        101: 'This YouTube video does not allow embedded playback.',
        150: 'This YouTube video does not allow embedded playback.'
    };
    const message = messages[code] || 'Hidden YouTube playback failed for this track.';
    rememberFailedOnlineMusicTrack(current, message, { videoId: current?.videoId || '' });
    const directStarted = await startOnlineMusicDirectAudioFallback(current, {
        sessionId: online.sessionId,
        startTime: Math.max(0, Number(online.currentTime || 0) || 0)
    });
    if (directStarted) {
        syncOnlineMusicResultRows();
        return;
    }
    online.isPlaying = false;
    state.isPlaying = false;
    stopOnlineMusicProgressTimer();
    const failure = rememberFailedOnlineMusicTrack(current, message, { videoId: current?.videoId || '' });
    rememberOnlineMusicPlaybackResolverState('error', failure.message);
    updatePlayIcons();
    syncOnlineMusicPlayerCard();
    persistOnlineMusicState();
    const retryStarted = await retryOnlineMusicPlaybackAfterPlayerError(current, {
        code,
        message: failure.message,
        videoId: current?.videoId || ''
    });
    if (retryStarted) {
        syncOnlineMusicResultRows();
        return;
    }
    updateOnlineMusicFeedback(failure.message, 'error');
    const failedEntry = getUnifiedAudioQueueCurrentEntry();
    const isQueueFailure = !!onlineMusicCurrentTrackStartedFromQueue
        && !!failedEntry
        && failedEntry.sourceKind === 'online'
        && sanitizeText(failedEntry.trackId || '') === sanitizeText(current?.id || '');
    if (current && failure.isFirstFailure) {
        showToast(`Unable to play "${current.title}".`, 'error');
    }
	            if (isQueueFailure) {
	                rememberAudioQueueFailure(failedEntry.id);
	                scheduleOnlineMusicAdvanceAfterFailure(current?.id || '');
	            }
	            showInternalNotice('Online playback failed, using safe recovery.', 'warn');
	        }

function handleOnlineMusicPlayerStateChange(event) {
    const online = getOnlineMusicState();
    const YTState = window.YT?.PlayerState || {};
    const current = getOnlineMusicCurrentTrack();
    const isolatePreviewUi = isMusicGamePreviewActive();
    const isPrivatePlayback = isPrivateOnlineMusicPlaybackContext(online.playbackContext) || isPrivateSessionTrackRecord(current);
    if (isOnlineMusicDirectAudioActive({ trackId: current?.id || '' })) {
        return;
    }
    if (shouldIgnoreOnlineMusicTransport(current)) {
        return;
    }
    if (shouldHoldOnlineMusicTransportEventDuringConnect(event?.data)) {
        online.isPlaying = false;
        if (!isolatePreviewUi) state.isPlaying = false;
        stopOnlineMusicProgressTimer();
        logPlaybackState('connecting', 'Online playback transport event held during connection', {
            trackId: sanitizeText(getOnlineMusicConnectingAttemptTrackId() || current?.id || online.currentTrackId || ''),
            eventState: Number(event?.data)
        });
        if (!isolatePreviewUi) {
            updatePlayIcons();
            syncOnlineMusicResultRows();
            syncOnlineMusicPlayerCard();
        }
        return;
    }
    const activeConnectingTrackId = getOnlineMusicConnectingAttemptTrackId();
    const currentTrackId = normalizeOnlineMusicTrackId(current?.id || online.currentTrackId || '');
    if (event?.data === YTState.PLAYING
        && activeConnectingTrackId
        && currentTrackId !== activeConnectingTrackId
        && isOnlineMusicConnectingAttemptActive({ trackId: activeConnectingTrackId })) {
        online.isPlaying = false;
        if (!isolatePreviewUi) state.isPlaying = false;
        stopOnlineMusicProgressTimer();
        logPlaybackState('connecting', 'Stale online playback event ignored during connection', {
            trackId: sanitizeText(activeConnectingTrackId),
            eventTrackId: sanitizeText(currentTrackId)
        });
        if (!isolatePreviewUi) {
            updatePlayIcons();
            syncOnlineMusicResultRows();
            syncOnlineMusicPlayerCard();
        }
        return;
    }
	            if (event?.data === YTState.PLAYING) {
	                clearOnlineMusicConnectTimeout();
	                stopLocalMediaTransport();
	                state.currentPlaybackSource = 'online-music';
        ensureVisualizerLoop();
        clearOnlineMusicConnectingAttempt({ trackId: current?.id || online.currentTrackId || '', sessionId: online.sessionId });
        online.isPlaying = true;
        if (!isolatePreviewUi) state.isPlaying = true;
        const suppressMusicGameMetrics = shouldSuppressMusicGameMetrics();
        if (current) {
            const now = Date.now();
            const saved = isPrivatePlayback ? null : getSavedOnlineTrack(current.id);
            const target = {
                ...(saved || {}),
                ...current,
                duration: Math.max(Number(current.duration) || 0, Number(online.duration) || 0),
                resumePosition: 0,
                resumeUpdatedAt: 0
            };
            if (!isPrivatePlayback && !suppressMusicGameMetrics && now - (target.lastPlayedAt || 0) > 5000) {
                target.playCount = (target.playCount || 0) + 1;
            }
            if (!isPrivatePlayback && !suppressMusicGameMetrics) {
                target.lastPlayedAt = now;
            }
            online.currentTrack = { ...target };
            if (!isolatePreviewUi) {
                state.currentTrackId = target.id;
                const persistedTrack = (!isPrivatePlayback && ((online.playbackContext === 'library') || !!saved))
                    ? syncOnlineTrackIntoMainLibrary(target, { allowInsert: true })
                    : null;
                state.currentTrack = persistedTrack ? { ...persistedTrack } : { ...target };
                syncUnifiedAudioQueueCurrentTrack(state.currentTrack || persistedTrack || target, {
                    replaceDeck: !getUnifiedAudioQueueState().entries.length,
                    queueSource: getUnifiedAudioQueueState().queueSource || 'auto',
                    isShuffle: getUnifiedAudioQueueState().isShuffle,
                    refresh: false
                });
                if (persistedTrack && !suppressMusicGameMetrics) {
                    const historyIndex = state.playHistory.indexOf(target.id);
                    if (historyIndex !== -1) state.playHistory.splice(historyIndex, 1);
                    state.playHistory.unshift(target.id);
                    enforceHistoryRetentionLimit();
                    refreshLiveViews();
                }
            }
        }
	                startOnlineMusicProgressTimer();
	                logPlaybackState('play', 'Online playback entered playing state', {
	                    trackId: sanitizeText(current?.id || online.currentTrackId || '')
	                });
	                if (!isolatePreviewUi) updateOnlineMusicFeedback(current ? `Playing "${current.title}".` : 'Online music playing.', 'success');
	            } else if (event?.data === YTState.PAUSED) {
	                clearOnlineMusicConnectTimeout();
        clearOnlineMusicConnectingAttempt({ force: true });
        online.isPlaying = false;
        if (!isolatePreviewUi) state.isPlaying = false;
	                stopOnlineMusicProgressTimer();
	                captureOnlineMusicProgress({ forcePersist: true });
	                logPlaybackState('pause', 'Online playback entered paused state', {
	                    trackId: sanitizeText(current?.id || online.currentTrackId || '')
	                });
	            } else if (event?.data === YTState.ENDED) {
	                clearOnlineMusicConnectTimeout();
        clearOnlineMusicConnectingAttempt({ force: true });
        online.isPlaying = false;
        if (!isolatePreviewUi) state.isPlaying = false;
	                stopOnlineMusicProgressTimer();
	                captureOnlineMusicProgress({ forcePersist: true });
	                logPlaybackState('ended', 'Online playback ended', {
	                    trackId: sanitizeText(current?.id || online.currentTrackId || '')
	                });
        if (isOnlineMusicPlaybackEndPremature(current, Number(online.currentTime || 0), Number(online.duration || current?.duration || 0))) {
            logError('online-player-ended-early', 'Hidden YouTube playback ended before the expected duration', {
                trackId: sanitizeText(current?.id || online.currentTrackId || ''),
                videoId: sanitizeText(current?.videoId || ''),
                currentTime: Number(online.currentTime || 0),
                duration: Number(online.duration || current?.duration || 0)
            });
            retryOnlineMusicPlaybackAfterPlayerError(current, {
                videoId: current?.videoId || '',
                message: 'YouTube playback ended before the song finished.'
            }).then((retryStarted) => {
                if (retryStarted) return;
                if (onlineMusicCurrentTrackStartedFromQueue) {
                    scheduleOnlineMusicAdvanceAfterFailure(current?.id || online.currentTrackId || '');
                }
            }).catch(() => {
                if (onlineMusicCurrentTrackStartedFromQueue) {
                    scheduleOnlineMusicAdvanceAfterFailure(current?.id || online.currentTrackId || '');
                }
            });
            updateOnlineMusicFeedback(`Trying another YouTube source for "${sanitizeText(current?.title || 'track')}"...`, 'info');
            return;
        }
	                if (isolatePreviewUi) {
	                    stopMusicGamePreview({ restore: false, resetShell: false });
	                    return;
	                }
	                playNext();
	                return;
	            } else if (event?.data === YTState.CUED) {
	                clearOnlineMusicConnectTimeout();
        clearOnlineMusicConnectingAttempt({ force: true });
        online.isPlaying = false;
	                if (!isolatePreviewUi) state.isPlaying = false;
	                captureOnlineMusicProgress({ forcePersist: true });
	                logPlaybackState('cued', 'Online playback entered cued state', {
	                    trackId: sanitizeText(current?.id || online.currentTrackId || '')
	                });
	            }
    if (!isolatePreviewUi) {
        updatePlayIcons();
        applyNowPlayingMetadata(current || online.currentTrack);
        refreshPlayingIndicators();
        syncOnlineMusicPlayerCard();
        syncOnlineMusicResultRows();
        if (!isPrivatePlayback) persistOnlineMusicState();
    } else {
        restoreMusicGamePlayerShellSnapshot(false);
    }
    if (isPrivatePlayback && isPrivateSessionRouteActive()) {
        renderPrivateSessionCollections();
    }
}

function loadYouTubeIframeApi() {
    if (window.YT && typeof window.YT.Player === 'function') {
        return Promise.resolve(window.YT);
    }
    if (onlineMusicApiReadyPromise) return onlineMusicApiReadyPromise;
    onlineMusicApiReadyPromise = new Promise((resolve, reject) => {
        onlineMusicApiReadyResolve = resolve;
        onlineMusicApiReadyReject = reject;
    });
    const previous = window.onYouTubeIframeAPIReady;
    let settled = false;
    const maxAttempts = 2;
    let apiReadyTimer = null;
    const clearApiScript = () => {
        const existing = document.querySelector('script[data-nexplay-youtube-iframe-api]');
        if (existing) existing.remove();
    };
    const settleFailure = (message) => {
        if (settled) return;
        settled = true;
        clearTimeout(apiReadyTimer);
        clearApiScript();
        window.onYouTubeIframeAPIReady = previous;
        const reject = onlineMusicApiReadyReject;
        onlineMusicApiReadyPromise = null;
        onlineMusicApiReadyResolve = null;
        onlineMusicApiReadyReject = null;
        if (typeof reject === 'function') {
            reject(new Error(message));
        }
    };
    window.onYouTubeIframeAPIReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(apiReadyTimer);
        if (typeof previous === 'function') previous();
        const resolve = onlineMusicApiReadyResolve;
        onlineMusicApiReadyResolve = null;
        onlineMusicApiReadyReject = null;
        if (typeof resolve === 'function') resolve(window.YT);
    };
    const injectAttempt = (attemptNumber = 1) => {
        clearApiScript();
        const script = document.createElement('script');
        const url = new URL(`${YOUTUBE_EMBED_HOST}/iframe_api`);
        if (attemptNumber > 1) {
            url.searchParams.set('nexplayRetry', String(Date.now()));
        }
        script.src = url.toString();
        script.async = true;
        script.defer = true;
        script.fetchPriority = 'high';
        script.dataset.nexplayYoutubeIframeApi = 'true';
        const fail = () => {
            clearTimeout(apiReadyTimer);
            if (attemptNumber < maxAttempts) {
                injectAttempt(attemptNumber + 1);
                return;
            }
            settleFailure('YouTube playback service could not be reached.');
        };
        apiReadyTimer = window.setTimeout(() => fail(), 8000);
        script.addEventListener('error', () => {
            fail();
        }, { once: true });
        script.addEventListener('load', () => {
            window.setTimeout(() => {
                if (!settled && window.YT && typeof window.YT.Player === 'function') {
                    window.onYouTubeIframeAPIReady();
                } else if (!settled) {
                    fail();
                }
            }, 1200);
        }, { once: true });
        document.head.appendChild(script);
    };
    injectAttempt();
    return onlineMusicApiReadyPromise;
}

function ensureOnlineMusicPlayer(initialVideoId = '', options = {}) {
    const opts = { quiet: false, ...options };
    if (onlineMusicPlayerReady && onlineMusicPlayer && typeof onlineMusicPlayer.loadVideoById === 'function') {
        return Promise.resolve(onlineMusicPlayer);
    }
    if (window.__nexplayOnlineMusicPlayerInitPromise) {
        return window.__nexplayOnlineMusicPlayerInitPromise;
    }
    window.__nexplayOnlineMusicPlayerInitPromise = loadYouTubeIframeApi()
        .then(() => new Promise((resolve) => {
            onlineMusicPlayerReady = false;
            let settled = false;
            let playerReadyTimer = null;
            const finishInit = (player = null) => {
                if (settled) return;
                settled = true;
                clearTimeout(playerReadyTimer);
                if (!player) {
                    window.__nexplayOnlineMusicPlayerInitPromise = null;
                }
                resolve(player);
            };
            let host = document.getElementById('online-music-yt-player');
            if (!host) {
                const shell = document.getElementById('online-music-player-shell');
                if (shell) {
                    host = document.createElement('div');
                    host.id = 'online-music-yt-player';
                    shell.appendChild(host);
                }
            }
            if (!host) {
                return finishInit(null);
            }
            const playerVars = {
                autoplay: 0,
                controls: 0,
                rel: 0,
                modestbranding: 1,
                playsinline: 1,
                enablejsapi: 1,
                iv_load_policy: 3
            };
            const origin = getSafeAppOrigin();
            if (origin) {
                playerVars.origin = origin;
                playerVars.widget_referrer = origin;
            }
            const startingVideoId = sanitizeText(initialVideoId || getOnlineMusicCurrentTrack()?.videoId || '');
            try {
                playerReadyTimer = window.setTimeout(() => {
                    onlineMusicPlayerReady = false;
                    onlineMusicPrewarmRequested = false;
                    finishInit(null);
                }, 9000);
                onlineMusicPlayer = new window.YT.Player('online-music-yt-player', {
                    host: YOUTUBE_EMBED_HOST,
                    width: '1',
                    height: '1',
                    videoId: startingVideoId || undefined,
                    playerVars,
                    events: {
                        onReady: () => {
                            onlineMusicPlayerReady = true;
                            onlineMusicPrewarmRequested = true;
                            try {
                                onlineMusicPlayer.setVolume(clampNumber(getOnlineMusicState().volume, 0, 100, 70));
                            } catch (_) {}
                            syncOnlineMusicPlayerCard();
                            finishInit(onlineMusicPlayer);
                        },
                        onStateChange: (event) => {
                            if (!onlineMusicPlayerReady && event?.data !== window.YT?.PlayerState?.UNSTARTED) {
                                onlineMusicPlayerReady = true;
                            }
                            handleOnlineMusicPlayerStateChange(event);
                        },
                        onError: handleOnlineMusicPlayerError
                    }
                });
            } catch (_) {
                finishInit(null);
            }
        }))
        .catch((error) => {
            onlineMusicPrewarmRequested = false;
            onlineMusicPlayerReady = false;
            window.__nexplayOnlineMusicPlayerInitPromise = null;
            const message = error?.message || 'YouTube playback service could not load.';
            if (!opts.quiet) {
                updateOnlineMusicFeedback(message, 'error');
                showToast(message, 'error');
            }
            return null;
        });
    return window.__nexplayOnlineMusicPlayerInitPromise;
}

async function resolvePlayableOnlineMusicTrack(track, options = {}) {
    const baseTrack = sanitizeStoredOnlineMusicTrack(track);
    if (!baseTrack) return null;
    const excludedVideoIds = Array.from(new Set([
        ...(Array.isArray(options.excludeVideoIds) ? options.excludeVideoIds : []),
        ...getFailedOnlineMusicTrackVideoIds(baseTrack.id)
    ].map((id) => sanitizeText(id || '').trim()).filter(Boolean)));
    const forceRefresh = !!options.forceRefresh || (baseTrack.videoId && excludedVideoIds.includes(baseTrack.videoId));
    if (baseTrack.videoId && !forceRefresh) {
        rememberOnlineMusicPlaybackResolverState('healthy', '');
        return upsertOnlineMusicTrackReferences(baseTrack);
    }
    if (!isOnlineMusicPlaybackResolutionAvailable()) {
        const message = getOnlineMusicPlaybackResolutionUnavailableMessage('track');
        rememberOnlineMusicPlaybackResolverState('error', message);
        throw new Error(message);
    }
    rememberOnlineMusicPlaybackResolverState('idle', `Resolving "${baseTrack.title}" for playback...`);
    const resolved = await nexPlayDesktopBridge.resolveOnlineTrackPlayback({
        trackId: baseTrack.id,
        title: baseTrack.title,
        artist: baseTrack.artist,
        canonicalUrl: baseTrack.canonicalUrl || '',
        cover: baseTrack.cover || '',
        releaseTitle: sanitizeText(options.releaseTitle || baseTrack.releaseTitle || ''),
        duration: Math.max(0, Number(baseTrack.duration || 0) || 0),
        excludeVideoIds: excludedVideoIds
    });
    const merged = sanitizeStoredOnlineMusicTrack({
        ...baseTrack,
        ...resolved,
        id: baseTrack.id,
        title: baseTrack.title,
        artist: baseTrack.artist,
        lyricsTitle: baseTrack.lyricsTitle || baseTrack.title,
        lyricsArtist: baseTrack.lyricsArtist || baseTrack.artist,
        resolvedTitle: sanitizeText(resolved.resolvedTitle || resolved.title || ''),
        resolvedArtist: sanitizeText(resolved.resolvedArtist || resolved.artist || ''),
        provider: baseTrack.provider,
        providerLabel: baseTrack.providerLabel,
        catalogProvider: baseTrack.catalogProvider || baseTrack.provider,
        catalogProviderLabel: baseTrack.catalogProviderLabel || baseTrack.providerLabel,
        transportProvider: 'youtube',
        transportProviderLabel: 'YouTube',
        pendingPlaybackResolution: false,
        thumbnail: resolved.thumbnail || baseTrack.thumbnail || '',
        cover: baseTrack.cover || resolved.cover || resolved.thumbnail || ''
    });
    if (!merged?.videoId) {
        rememberOnlineMusicPlaybackResolverState('error', 'Unable to resolve a playable YouTube match for this track.');
        throw new Error('Unable to resolve a playable YouTube match for this track.');
    }
    forgetFailedOnlineMusicTrack(merged.id);
    rememberOnlineMusicPlaybackResolverState('healthy', `Resolved "${merged.title}" for playback.`);
    return upsertOnlineMusicTrackReferences(merged);
}

	        async function playOnlineMusicTrack(trackId, options = {}) {
	            logAction('online-play-start', 'Online playback start requested', {
	                trackId: sanitizeText(trackId || '')
	            });
	            const track = options.trackSnapshot
	                || getOnlineMusicTrack(trackId)
	                || resolveQueueDisplayTrack(trackId);
	            if (!track) {
	                logError('online-play-missing-track', 'Online playback failed because track was not found', {
	                    trackId: sanitizeText(trackId || '')
	                });
	                showToast('Track not found in online music.', 'error');
	                return false;
	            }
    const online = getOnlineMusicState();
    const shouldAutoplay = options.autoplay !== false;
    const requestedTrackId = normalizeOnlineMusicTrackId(track.id || trackId || '');
    if (shouldAutoplay
        && requestedTrackId
        && normalizeOnlineMusicTrackId(online.connectingTrackId || '') === requestedTrackId
        && isOnlineMusicConnectingAttemptActive({ trackId: requestedTrackId })) {
        syncOnlineMusicResultRows();
        syncOnlineMusicPlayerCard();
        return true;
    }
    const attempt = beginOnlineMusicPlaybackAttempt(track.id);
    clearOnlineMusicConnectTimeout();
    const playbackContext = normalizeOnlineMusicPlaybackContext(options.playbackContext || 'library');
    const isPrivatePlayback = !!options.privateSession || isPrivateOnlineMusicPlaybackContext(playbackContext) || isPrivateSessionTrackRecord(track);
    const queueContextView = normalizeOnlineMusicPlaybackContext(options.queueContextView || playbackContext);
    const queueContextKey = sanitizeText(options.queueContextKey || getOnlineMusicQueueContextKey(queueContextView, {
        release: options.release || online.browserRelease,
        artist: options.artist || online.browserArtist,
        searchQuery: online.searchQuery
    }));
    const isolatePreviewUi = isMusicGamePreviewActive();
    const failedTrackRecord = getFailedOnlineMusicTrackRecord(track.id);
    const failedVideoIds = getFailedOnlineMusicTrackVideoIds(track.id);
    const shouldRetryFailedTrack = !!options.forcePlaybackResolution
        || !!options.fromErrorRecovery
        || !options.fromQueue;
	            if (failedTrackRecord && !shouldRetryFailedTrack) {
	                logError('online-play-blocked', 'Online playback blocked due to known failed track', {
	                    trackId: sanitizeText(track.id || ''),
	                    reason: sanitizeText(failedTrackRecord.message || '')
	                });
	                rememberOnlineMusicPlaybackResolverState('error', failedTrackRecord.message);
	                updateOnlineMusicFeedback(getFailedOnlineMusicTrackMessage(track.id, failedTrackRecord.message), 'error');
	                if (state.activeTab === 'online-music') renderOnlineMusicContent();
        else syncOnlineMusicPlayerCard();
        return false;
    }
    if (shouldAutoplay && !isolatePreviewUi) {
        silenceActivePlaybackForOnlineSwitch(track, { autoplay: true, attempt });
        updateOnlineMusicFeedback(`Connecting "${sanitizeText(track.title || 'track')}"...`, 'info');
    }
    const shouldForceResolution = !!options.forcePlaybackResolution
        || (!!track.videoId && failedVideoIds.includes(sanitizeText(track.videoId || '')));
    const playerPromise = ensureOnlineMusicPlayer(shouldForceResolution ? '' : sanitizeText(track.videoId || ''));
    let playableTrack = null;
    try {
        playableTrack = await resolvePlayableOnlineMusicTrack(track, {
            releaseTitle: sanitizeText(options.release?.title || online.browserRelease?.title || track.releaseTitle || ''),
            forceRefresh: shouldForceResolution,
            excludeVideoIds: Array.from(new Set([
                ...failedVideoIds,
                ...(Array.isArray(options.excludeVideoIds) ? options.excludeVideoIds : [])
            ].map((id) => sanitizeText(id || '')).filter(Boolean)))
        });
	            } catch (error) {
	                if (isOnlineMusicPlaybackAttemptStale(attempt)) {
	                    return true;
	                }
	                logError('online-play-resolve-failed', 'Online playback could not resolve a playable source', {
	                    trackId: sanitizeText(track.id || ''),
	                    error: sanitizeText(error?.message || '')
	                });
        clearOnlineMusicConnectingAttempt({ trackId: track.id, attempt });
        if (shouldAutoplay && !isolatePreviewUi) {
            clearOnlineMusicConnectTimeout();
            deactivateOnlineMusicTransport({
                nextPlaybackSource: 'local',
                stopPlayer: false,
                resetTime: false
            });
        }
	                const failure = rememberFailedOnlineMusicTrack(track, error?.message || 'This track could not be resolved for playback.');
        rememberOnlineMusicPlaybackResolverState('error', failure.message);
        updateOnlineMusicFeedback(failure.message, 'error');
        if (failure.isFirstFailure) {
            showToast(failure.message, 'error');
        }
        if (!isPrivatePlayback) persistOnlineMusicState();
        if (state.activeTab === 'online-music') renderOnlineMusicContent();
        else syncOnlineMusicPlayerCard();
        return false;
    }
    const clean = sanitizeStoredOnlineMusicTrack(playableTrack);
    const saved = (!isPrivatePlayback && clean) ? getSavedOnlineTrack(clean.id) : null;
    const resolved = clean ? {
        ...clean,
        ...(saved || {}),
        ...(isPrivatePlayback ? { privateSession: true, privateSessionSource: 'online' } : {})
    } : null;
    if (!resolved) {
        clearOnlineMusicConnectingAttempt({ trackId: track.id, attempt });
        return false;
    }
    const sessionId = beginOnlineMusicSession(resolved);
    handoffToOnlinePlayback({ resetLocalTime: false });
    onlineMusicCurrentTrackStartedFromQueue = !!options.fromQueue;
    state.lastProgressTime = 0;
    const prevTrackId = state.currentTrackId;
    if (!isolatePreviewUi) clearLocalTrackHighlights();
    online.currentTrackId = resolved.id;
    online.playbackContext = playbackContext;
    online.queueContextView = queueContextView;
    online.queueContextKey = queueContextKey;
    online.queueMode = options.queueMode === 'shuffle' ? 'shuffle' : 'ordered';
    const libraryTrack = syncOnlineTrackIntoMainLibrary(resolved, {
        allowInsert: !isPrivatePlayback && (!!saved || playbackContext === 'library'),
        persistLibrary: !isPrivatePlayback && !!saved,
        privateSession: isPrivatePlayback
    });
    online.currentTrack = { ...(libraryTrack || resolved), resumePosition: 0, resumeUpdatedAt: 0 };
    if (!isolatePreviewUi) {
        state.currentTrackId = resolved.id;
        state.currentTrack = libraryTrack ? { ...libraryTrack } : { ...resolved, resumePosition: 0, resumeUpdatedAt: 0 };
    }
    if (shouldAutoplay) {
        setOnlineMusicConnectingAttempt(resolved.id, { attempt, sessionId, phase: 'loading' });
    } else {
        clearOnlineMusicConnectingAttempt({ trackId: resolved.id, attempt });
    }
    online.currentTime = Math.max(0, Number(options.startTime) || 0);
    online.duration = Math.max(0, Number(libraryTrack?.duration || resolved.duration) || 0);
    if (shouldAutoplay) {
        armOnlineMusicConnectTimeout(sessionId, resolved.id, DESKTOP_ONLINE_MUSIC_CONNECT_TIMEOUT_MS);
    } else {
        clearOnlineMusicConnectTimeout();
    }
    if (!isolatePreviewUi) {
        applyNowPlayingMetadata(libraryTrack || resolved);
        updateTrackUI(libraryTrack || resolved);
        applyCoverAccent(libraryTrack || resolved);
        refreshOnlineMusicCatalogCover(libraryTrack || resolved).catch(() => {});
        syncModesWithCurrentTrack();
        ensureActiveTrackHighlight(prevTrackId, resolved.id);
        refreshPlayingIndicators();
        updateShuffleIcon();
        updateRepeatIcon();
        updatePlayIcons();
        updateProgress();
        syncOnlineMusicPlayerCard();
        if (!isPrivatePlayback) persistOnlineMusicState();
    } else {
        restoreMusicGamePlayerShellSnapshot(false);
    }
    if (shouldAutoplay && !isolatePreviewUi) {
        updateOnlineMusicFeedback(`Connecting "${resolved.title}"...`, 'info');
    }
    stopLocalMediaTransport();
    let player = null;
    try {
        player = await playerPromise;
	            } catch (error) {
	                if (isOnlineMusicPlaybackAttemptStale(attempt)) {
	                    return true;
	                }
	                logError('online-player-init-failed', 'Online player initialization failed during source switch', {
	                    trackId: sanitizeText(resolved.id || ''),
	                    error: sanitizeText(error?.message || '')
	                });
        const directStarted = await startOnlineMusicDirectAudioFallback(resolved, {
            sessionId,
            startTime: Math.max(0, Number(online.currentTime || 0) || 0)
        });
        if (directStarted) {
            return true;
        }
	                deactivateOnlineMusicTransport({
            nextPlaybackSource: 'local',
            stopPlayer: false,
            resetTime: false
        });
        clearOnlineMusicConnectTimeout();
        const failure = rememberFailedOnlineMusicTrack(resolved, error?.message || 'Online player could not initialize for this track.');
        rememberOnlineMusicPlaybackResolverState('error', failure.message);
        updateOnlineMusicFeedback(failure.message, 'error');
        if (failure.isFirstFailure) {
            showToast(failure.message, 'error');
        }
        syncOnlineMusicPlayerCard();
        if (!isPrivatePlayback) persistOnlineMusicState();
        return false;
    }
    if (isOnlineMusicPlaybackAttemptStale(attempt)) {
        return true;
    }
    if (Number(getOnlineMusicState().sessionId || 0) !== sessionId || Number(onlineMusicSessionId || 0) !== sessionId) {
        return true;
    }
	            if (!player || typeof player.loadVideoById !== 'function') {
	                logError('online-player-unavailable', 'Online player was unavailable after initialization', {
	                    trackId: sanitizeText(resolved.id || '')
	                });
        const directStarted = await startOnlineMusicDirectAudioFallback(resolved, {
            sessionId,
            startTime: Math.max(0, Number(online.currentTime || 0) || 0)
        });
        if (directStarted) {
            return true;
        }
	                deactivateOnlineMusicTransport({
            nextPlaybackSource: 'local',
            stopPlayer: false,
            resetTime: false
        });
        clearOnlineMusicConnectTimeout();
        clearOnlineMusicConnectingAttempt({ trackId: resolved.id, attempt, sessionId });
        syncOnlineMusicPlayerCard();
        updateOnlineMusicFeedback('Online player could not initialize.', 'error');
        if (!isPrivatePlayback) persistOnlineMusicState();
        return false;
    }
    try { player.setVolume(Math.round(Math.max(0, Math.min(1, state.volume || 0.8)) * 100)); } catch (_) {}
    const startSeconds = Math.max(0, Math.floor(online.currentTime || 0));
    if (!shouldAutoplay) {
        player.cueVideoById({ videoId: resolved.videoId, startSeconds });
        clearOnlineMusicConnectingAttempt({ trackId: resolved.id, attempt, sessionId });
        online.isPlaying = false;
        state.isPlaying = false;
        clearOnlineMusicConnectTimeout();
    } else {
        player.loadVideoById({ videoId: resolved.videoId, startSeconds });
        window.setTimeout(() => {
            if (!isOnlineMusicConnectingAttemptActive({ trackId: resolved.id, attempt, sessionId })) return;
            safeCall(() => player.playVideo?.());
        }, 60);
    }
	            setTimeout(() => {
	                if (Number(getOnlineMusicState().sessionId || 0) !== sessionId || Number(onlineMusicSessionId || 0) !== sessionId) {
	                    return;
	                }
	                fetchLyrics(resolved.lyricsArtist || resolved.artist, resolved.lyricsTitle || resolved.title, libraryTrack || resolved);
	            }, 0);
	            logAction('online-play-success', 'Online playback source prepared', {
	                trackId: sanitizeText(resolved.id || ''),
	                autoplay: !!shouldAutoplay
	            });
	            return true;
	        }

	        async function toggleOnlineMusicPlayback() {
	            const online = getOnlineMusicState();
	            const current = getOnlineMusicCurrentTrack();
	            logAction('online-toggle-start', 'Online play/pause toggle requested', {
	                trackId: sanitizeText(current?.id || ''),
	                isPlaying: !!online.isPlaying
	            });
    if (!current) {
	                const first = (online.searchResults || [])[0];
        if (first) {
            await startTrackCollectionPlayback(online.searchResults || [], first.id, {
                autoplay: true,
                queueSource: 'manual',
                isShuffle: false,
                playbackContext: 'search',
                queueContextView: 'search',
                queueContextKey: getOnlineMusicQueueContextKey('search', { searchQuery: online.searchQuery })
            });
        } else {
            showToast('Search for a track first.', 'info');
        }
        return;
    }
    if (isOnlineMusicDirectAudioActive({ trackId: current.id }) && els.audio) {
        if (online.isPlaying) {
            safePauseMedia(els.audio);
            online.isPlaying = false;
            state.isPlaying = false;
            stopOnlineMusicProgressTimer();
            logAction('online-toggle-pause', 'Online direct audio pause requested');
        } else {
            handoffToOnlinePlayback({ resetLocalTime: false });
            onlineMusicDirectAudioMode.active = true;
            const started = await safePlayMedia(els.audio, { waitForReady: false, timeoutMs: 4000, force: true });
            if (started) {
                online.isPlaying = true;
                state.isPlaying = true;
                startOnlineMusicProgressTimer();
            }
            logAction('online-toggle-play', 'Online direct audio play requested');
        }
        updatePlayIcons();
        syncOnlineMusicPlayerCard();
        syncOnlineMusicResultRows();
        return;
    }
    let player = null;
	            try {
	                player = await ensureOnlineMusicPlayer(current.videoId);
	            } catch (_) {
	                logError('online-toggle-player-unready', 'Online player is not ready for toggle');
	                updateOnlineMusicFeedback('Online player is not ready yet.', 'warn');
	                syncOnlineMusicPlayerCard();
	                return;
	            }
	            if (!player) {
	                logError('online-toggle-player-null', 'Online player was unavailable for toggle');
	                updateOnlineMusicFeedback('Online player is not ready yet.', 'warn');
	                syncOnlineMusicPlayerCard();
	                return;
    }
    const loadedVideoId = sanitizeText(player.getVideoData?.().video_id || '');
    if (loadedVideoId !== current.videoId) {
        await playOnlineMusicTrack(current.id, {
            autoplay: true,
            startTime: online.currentTime || 0,
            playbackContext: normalizeOnlineMusicPlaybackContext(online.playbackContext),
            queueContextView: normalizeOnlineMusicPlaybackContext(online.queueContextView || online.playbackContext),
            queueContextKey: sanitizeText(online.queueContextKey || ''),
            queueMode: getUnifiedAudioQueueState().isShuffle ? 'shuffle' : 'ordered',
            trackSnapshot: current
        });
        return;
    }
	            if (online.isPlaying) {
	                safeCall(() => player.pauseVideo?.());
	                logAction('online-toggle-pause', 'Online playback pause requested');
	            } else {
	                handoffToOnlinePlayback({ resetLocalTime: false });
	                safeCall(() => player.playVideo?.());
	                logAction('online-toggle-play', 'Online playback play requested');
	            }
	        }

async function seekOnlineMusicTo(seconds, options = {}) {
    const opts = { forcePersist: false, ...options };
    const online = getOnlineMusicState();
    if (!online.currentTrackId) return;
    const duration = Math.max(0, Number(online.duration || getOnlineMusicCurrentTrack()?.duration || 0));
    const target = Math.max(0, Math.min(duration || Math.max(0, Number(seconds) || 0), Number(seconds) || 0));
    online.currentTime = target;
    const current = getOnlineMusicCurrentTrack();
    if (current) {
        online.currentTrack = { ...current, duration: Math.max(Number(current.duration) || 0, duration || 0), resumePosition: 0, resumeUpdatedAt: 0 };
    }
    updateProgress();
    syncOnlineMusicPlayerCard();
    if (isOnlineMusicDirectAudioActive({ trackId: current?.id || '' }) && els.audio) {
        safeSeekMedia(els.audio, target, { fallbackDuration: duration || Number(current?.duration || 0) });
        window.setTimeout(() => captureOnlineMusicProgress({ forcePersist: true }), 120);
        return target;
    }
    const player = (onlineMusicPlayer && onlineMusicPlayerReady) ? onlineMusicPlayer : await ensureOnlineMusicPlayer(getOnlineMusicCurrentTrack()?.videoId || '');
    try { player.seekTo(target, true); } catch (_) {}
    if (opts.forcePersist) {
        window.setTimeout(() => captureOnlineMusicProgress({ forcePersist: true }), 120);
    }
    return target;
}

function scheduleOnlineMusicSeek(seconds, options = {}) {
    const opts = { flush: false, forcePersist: false, ...options };
    const target = Math.max(0, Number(seconds) || 0);
    onlineMusicPendingSeekValue = target;
    const commit = () => {
        const next = onlineMusicPendingSeekValue;
        onlineMusicPendingSeekValue = null;
        if (onlineMusicSeekCommitTimer) {
            clearTimeout(onlineMusicSeekCommitTimer);
            onlineMusicSeekCommitTimer = null;
        }
        seekOnlineMusicTo(next, { forcePersist: opts.forcePersist }).catch(() => {});
    };
    if (opts.flush) {
        commit();
        return;
    }
    if (onlineMusicSeekCommitTimer) return;
    onlineMusicSeekCommitTimer = window.setTimeout(commit, 90);
}

function setOnlineMusicVolume(value) {
    const online = getOnlineMusicState();
    online.volume = clampNumber(value, 0, 100, 70);
    state.volume = online.volume / 100;
    if (onlineMusicPlayer && onlineMusicPlayerReady && typeof onlineMusicPlayer.setVolume === 'function') {
        try { onlineMusicPlayer.setVolume(online.volume); } catch (_) {}
    }
    updateVolumeUI(state.volume);
    syncOnlineMusicPlayerCard();
    persistAppStateNow();
    persistOnlineMusicState();
}

	        function stopSharedOnlineMusicPlayback() {
	            const online = getOnlineMusicState();
	            logAction('online-stop-shared', 'Stopping shared online playback', {
	                trackId: sanitizeText(online.currentTrackId || '')
	            });
	            clearOnlineMusicAdvanceAfterFailureTimer();
	            clearOnlineMusicConnectTimeout();
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
	            refreshQueueViews();
	            scheduleDebugOverlayRefresh();
	        }

async function playAdjacentOnlineMusic(offset) {
    const online = getOnlineMusicState();
    if (!(online.queue || []).length) {
        const tracks = getOnlineMusicTracksForView(online.playbackContext);
        setOnlineMusicQueue(tracks.map((track) => track.id), online.currentTrackId);
        syncOnlineMusicQueueToSharedAudioState({
            currentTrackId: online.currentTrackId || state.currentTrackId || '',
            playbackContext: online.playbackContext,
            queueMode: online.queueMode === 'shuffle' ? 'shuffle' : 'ordered'
        });
    }
    if (!(online.queue || []).length) {
        showToast('No online tracks queued.', 'info');
        return;
    }
    const nextStep = resolveOnlineQueueStep({
        queue: online.queue,
        queueIndex: online.queueIndex,
        currentTrackId: online.currentTrackId,
        offset,
        repeatMode: state.repeatMode
    });
    if (nextStep.action === 'stop') {
        if (await startAutoplayRadio({ currentTrack: getOnlineMusicCurrentTrack() })) {
            return;
        }
        stopSharedOnlineMusicPlayback();
        return;
    }
    const targetTrackId = nextStep.nextTrackId || online.currentTrackId;
    if (!targetTrackId) {
        stopSharedOnlineMusicPlayback();
        return;
    }
    await playOnlineMusicTrack(targetTrackId, {
        ...getSharedOnlineMusicQueuePlaybackOptions({
            autoplay: true,
            startTime: nextStep.action === 'restart' ? 0 : 0
        }),
        fromQueue: true
    });
}

function playNextOnlineMusic() {
    return playNext();
}

function playPrevOnlineMusic() {
    return playPrev();
}

function setOnlineMusicView(view) {
    const online = getOnlineMusicState();
    online.playbackContext = view === 'library' ? 'library' : 'search';
    persistOnlineMusicState();
    renderOnlineMusicContent();
}

function setOnlineMusicDownloadState(trackId, isActive, options = {}) {
    const id = normalizeOnlineMusicTrackId(trackId);
    if (!id) return;
    const online = getOnlineMusicState();
    const activeIds = new Set(Array.isArray(online.downloadingTrackIds) ? online.downloadingTrackIds : []);
    if (isActive) activeIds.add(id);
    else activeIds.delete(id);
    online.downloadingTrackIds = Array.from(activeIds);
    if (options.pending === true) online.pendingTrackId = id;
    else if (options.pending === false && online.pendingTrackId === id) online.pendingTrackId = null;
    else if (!online.pendingTrackId && online.downloadingTrackIds.length) online.pendingTrackId = online.downloadingTrackIds[0];
    if (!online.downloadingTrackIds.length) online.pendingTrackId = null;
}

function bufferFromBase64(base64 = '') {
    const safe = typeof base64 === 'string' ? base64 : '';
    const normalized = safe.includes(',') ? safe.split(',').pop() : safe;
    const binary = window.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function primeMetadataForDownloadedOnlineTrack(file, track, downloadResult = {}) {
    if (!file || !track) return;
    const keys = getTrackMetadataKeys({
        fingerprint: `${file.name}|${file.size}|${file.lastModified}`,
        fileName: file.name,
        size: file.size
    });
    if (!keys.length) return;
    const payload = {
        title: sanitizeText(track.title || file.name.replace(/\.[^/.]+$/, '')),
        artist: sanitizeText(track.artist || 'Unknown'),
        tags: Array.isArray(track.tags) ? track.tags.map(sanitizeText).filter(Boolean) : [],
        cover: track.cover || '',
        customLyrics: typeof track.customLyrics === 'string' ? track.customLyrics : '',
        isFavorite: false,
        playCount: 0,
        duration: Number(track.duration) || 0,
        skipCount: 0,
        lastSkippedAt: 0,
        listeningTime: 0,
        resumePosition: 0,
        resumeUpdatedAt: 0,
        sourcePath: sanitizeText(downloadResult.savedPath || ''),
        watchFolderId: '',
        sourceFingerprint: sanitizeText(`${file.name}|${file.size}|${file.lastModified}`),
        originProvider: sanitizeText(downloadResult.originProvider || track.originProvider || track.provider || ''),
        originReleaseId: sanitizeText(downloadResult.originReleaseId || track.originReleaseId || ''),
        downloadedAt: Number(downloadResult.lastModified) || Date.now(),
        downloadState: 'downloaded'
    };
    keys.forEach((key) => {
        state.metadataStore[key] = { ...payload };
    });
    persistMetadataStoreWithFallback(keys[0]);
}

async function importDownloadedOnlineTrack(downloadResult, track) {
    if (!downloadResult?.base64 || typeof File !== 'function') {
        throw new Error('Downloaded audio could not be imported in this environment.');
    }
    const bytes = bufferFromBase64(downloadResult.base64);
    const file = new File([bytes], sanitizeText(downloadResult.fileName || `${track?.artist || 'Track'} - ${track?.title || 'Download'}.mp3`) || 'download.mp3', {
        type: sanitizeText(downloadResult.mimeType || 'audio/mpeg') || 'audio/mpeg',
        lastModified: Number(downloadResult.lastModified) || Date.now()
    });
    primeMetadataForDownloadedOnlineTrack(file, track, downloadResult);
    handleFiles([file]);
}

function handleOnlineMusicDownloadProgress(payload = {}) {
    const trackId = normalizeOnlineMusicTrackId(payload.trackId || '');
    if (!trackId) return;
    const phase = sanitizeText(payload.phase || '');
    const message = sanitizeText(payload.message || '');
    let shouldRerender = false;
    if (phase === 'queued') {
        setOnlineMusicDownloadState(trackId, true);
        updateOnlineMusicFeedback(message || 'Queued MP3 download.', 'info');
        shouldRerender = true;
    } else if (phase === 'starting' || phase === 'downloading' || phase === 'converting') {
        setOnlineMusicDownloadState(trackId, true, { pending: true });
        updateOnlineMusicFeedback(message || 'Downloading MP3 copy...', phase === 'converting' ? 'warn' : 'info');
        shouldRerender = phase !== 'downloading';
    } else if (phase === 'completed') {
        setOnlineMusicDownloadState(trackId, false, { pending: false });
        updateOnlineMusicFeedback(message || 'MP3 download finished.', 'success');
        shouldRerender = true;
    } else if (phase === 'cancelled') {
        setOnlineMusicDownloadState(trackId, false, { pending: false });
        updateOnlineMusicFeedback(message || 'Download cancelled.', 'warn');
        shouldRerender = true;
    } else if (phase === 'error') {
        setOnlineMusicDownloadState(trackId, false, { pending: false });
        updateOnlineMusicFeedback(message || 'Download failed.', 'error');
        shouldRerender = true;
    }
    if (shouldRerender) renderOnlineMusicContent();
    else syncOnlineMusicPlayerCard();
}

async function downloadOnlineMusicTrack(trackId) {
    let track = getOnlineMusicTrack(trackId);
    if (!track) {
        showToast('Unable to download that track.', 'error');
        return;
    }
    if (!nexPlayDesktopBridge || typeof nexPlayDesktopBridge.downloadOnlineTrack !== 'function') {
        const message = getDesktopOnlyMessage('MP3 downloads');
        updateOnlineMusicFeedback(message, 'warn');
        showToast(message, 'info');
        return;
    }
    if (!track.videoId) {
        try {
            track = await resolvePlayableOnlineMusicTrack(track, {
                releaseTitle: sanitizeText(getOnlineMusicState().browserRelease?.title || track.releaseTitle || '')
            });
        } catch (error) {
            showToast(error?.message || 'Unable to resolve this track for download.', 'error');
            return;
        }
    }
    const online = getOnlineMusicState();
    if ((online.downloadingTrackIds || []).includes(track.id)) return;
    setOnlineMusicDownloadState(track.id, true);
    renderOnlineMusicContent();
    try {
        const result = await nexPlayDesktopBridge.downloadOnlineTrack({
            trackId: track.id,
            videoId: track.videoId,
            title: track.title,
            artist: track.artist,
            cover: track.cover || '',
            canonicalUrl: track.canonicalUrl || ''
        });
        if (result?.cancelled) {
            handleOnlineMusicDownloadProgress({
                trackId: track.id,
                phase: 'cancelled',
                message: 'Download cancelled.'
            });
            return;
        }
        await importDownloadedOnlineTrack(result, track);
        handleOnlineMusicDownloadProgress({
            trackId: track.id,
            phase: 'completed',
            message: `Downloaded "${track.title}" as an MP3 and added it to local files.`
        });
        showToast(`Downloaded "${track.title}" to MP3.`, 'success');
    } catch (error) {
        console.error(error);
        handleOnlineMusicDownloadProgress({
            trackId: track.id,
            phase: 'error',
            message: error?.message || 'Download failed.'
        });
        showToast(error?.message || 'Unable to download this track.', 'error');
    }
}

function applyOnlineMusicDownloadQueueUpdate(payload = {}) {
    const online = getOnlineMusicState();
    const sanitized = sanitizeStoredOnlineMusicState({
        ...online,
        downloadJobs: Array.isArray(payload?.jobs) ? payload.jobs : []
    });
    online.downloadJobs = sanitized.downloadJobs;
    const activeIds = new Set();
    (online.downloadJobs || []).forEach((job) => {
        (job.tracks || []).forEach((track) => {
            if (['queued', 'running', 'converting'].includes(track.status)) {
                const id = normalizeOnlineMusicTrackId(track.trackId || '');
                if (id) activeIds.add(id);
            }
        });
    });
    online.downloadingTrackIds = Array.from(activeIds);
    if (!online.pendingTrackId || !activeIds.has(online.pendingTrackId)) {
        online.pendingTrackId = online.downloadingTrackIds[0] || null;
    }
    persistOnlineMusicState();
    if (state.activeTab === 'online-music' || state.activeTab === 'settings') {
        renderTracks({ preserveScroll: true });
    } else {
        syncOnlineMusicPlayerCard();
    }
}

function clearPersistedOnlineMusicDownloadJobs(mode = 'finished') {
    const requestedMode = sanitizeText(mode || 'finished').toLowerCase();
    if (requestedMode !== 'finished') {
        return { cleared: 0, remaining: (getOnlineMusicState().downloadJobs || []).length };
    }
    const terminalStatuses = new Set(['completed', 'completed_with_errors', 'error', 'cancelled']);
    const online = getOnlineMusicState();
    const currentJobs = Array.isArray(online.downloadJobs) ? online.downloadJobs : [];
    const nextJobs = currentJobs.filter((job) => !terminalStatuses.has(sanitizeText(job?.status || '').toLowerCase()));
    const cleared = Math.max(0, currentJobs.length - nextJobs.length);
    if (!cleared) {
        return { cleared: 0, remaining: currentJobs.length };
    }
    applyOnlineMusicDownloadQueueUpdate({ jobs: nextJobs });
    return {
        cleared,
        remaining: nextJobs.length
    };
}

function renderOnlineMusicDownloadJobsPanel() {
    const jobs = (getOnlineMusicState().downloadJobs || []).slice();
    if (!jobs.length) return '';
    const isDesktopRuntime = isDesktopRuntimeAvailable();
    const activeJobs = jobs.filter((job) => ['queued', 'running', 'converting'].includes(job.status)).length;
    const finishedJobs = jobs.filter((job) => ['completed', 'completed_with_errors', 'error', 'cancelled'].includes(job.status)).length;
    return `
        <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">${isDesktopRuntime ? 'Download Queue' : 'Desktop Download History'}</div>
                    <div class="mt-1 text-sm text-white">${isDesktopRuntime ? `${jobs.length} job${jobs.length === 1 ? '' : 's'} tracked across the desktop app.` : `${jobs.length} desktop job${jobs.length === 1 ? '' : 's'} saved from another session.`}</div>
                </div>
                <div class="flex items-center gap-2">
                    ${isDesktopRuntime
                        ? `<button type="button" onclick="clearOnlineMusicDownloadQueue('finished')" class="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-red-200 hover:bg-red-500/20 ${finishedJobs ? '' : 'opacity-50'}" ${finishedJobs ? '' : 'disabled'}>Clear Finished</button>`
                        : ''}
                    <div class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${isDesktopRuntime ? 'MP3 only' : 'Read only on web'}</div>
                </div>
            </div>
            ${isDesktopRuntime
                ? ''
                : `<div class="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-xs text-gray-400">The web build can show saved desktop download state, but only the desktop app can start, resume, or cancel MP3 jobs${activeJobs ? '.' : ' right now.'}</div>`}
            <div class="mt-4 space-y-3">
                ${jobs.map((job) => `
                    <div class="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div class="min-w-0 flex-1">
                                <div class="flex flex-wrap items-center gap-2">
                                    <div class="truncate text-sm font-bold text-white">${escapeHtml(job.title || 'Download')}</div>
                                    <span class="text-[10px] font-black uppercase tracking-[0.16em] ${['completed', 'completed_with_errors'].includes(job.status) ? 'text-emerald-300' : (job.status === 'error' ? 'text-rose-300' : (job.status === 'cancelled' ? 'text-amber-200' : 'text-cyan-200'))}">${escapeHtml(job.status.replace(/_/g, ' '))}</span>
                                </div>
                                <div class="mt-1 text-xs text-gray-400">${escapeHtml(job.message || 'Queued')}</div>
                                <div class="mt-2 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(job.completedCount || 0)} complete | ${escapeHtml(job.failedCount || 0)} failed | ${escapeHtml(job.totalCount || 0)} total</div>
                            </div>
                            ${isDesktopRuntime && ['queued', 'running'].includes(job.status)
                                ? `<button type="button" onclick="cancelOnlineMusicDownloadJob('${escapeHtml(job.id)}')" class="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-200 hover:bg-amber-500/20">Cancel</button>`
                                : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderOnlineMusicImportReviewPanel() {
    const items = (getOnlineMusicState().importReviewItems || []).slice(0, 12);
    if (!items.length) return '';
    return `
        <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">Import Review</div>
                    <div class="mt-1 text-sm text-white">Recent duplicates, metadata gaps, and import notes.</div>
                </div>
                <button type="button" onclick="clearOnlineMusicImportReview()" class="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-300 hover:bg-white/10">Clear</button>
            </div>
            <div class="mt-4 space-y-3">
                ${items.map((item) => `
                    <div class="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <div class="text-sm font-bold text-white">${escapeHtml(item.title || 'Import Review')}</div>
                            <span class="text-[10px] font-black uppercase tracking-[0.16em] ${item.kind === 'duplicate' ? 'text-amber-200' : (item.kind === 'metadata' ? 'text-cyan-200' : 'text-gray-400')}">${escapeHtml(item.kind || 'info')}</span>
                        </div>
                        <div class="mt-1 text-xs text-gray-400">${escapeHtml(item.detail || '')}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

async function cancelOnlineMusicDownloadJob(jobId = '') {
    const id = sanitizeText(jobId || '');
    if (!id) return;
    if (!nexPlayDesktopBridge || typeof nexPlayDesktopBridge.cancelOnlineDownload !== 'function') {
        const message = getDesktopOnlyMessage('Download queue controls');
        updateOnlineMusicFeedback(message, 'info');
        showToast(message, 'info');
        return;
    }
    try {
        await nexPlayDesktopBridge.cancelOnlineDownload(id);
        updateOnlineMusicFeedback('Cancelling download job...', 'warn');
    } catch (error) {
        const message = error?.message || 'Unable to cancel this download job.';
        updateOnlineMusicFeedback(message, 'error');
        showToast(message, 'error');
    }
}

async function clearOnlineMusicDownloadQueue(mode = 'finished') {
    if (!nexPlayDesktopBridge || typeof nexPlayDesktopBridge.clearOnlineDownloadQueue !== 'function') {
        const message = getDesktopOnlyMessage('Download queue controls');
        updateOnlineMusicFeedback(message, 'info');
        showToast(message, 'info');
        return;
    }
    const localResult = clearPersistedOnlineMusicDownloadJobs(mode || 'finished');
    try {
        const result = await nexPlayDesktopBridge.clearOnlineDownloadQueue(mode || 'finished');
        const cleared = Math.max(
            0,
            Number(result?.cleared || 0) || 0,
            Number(localResult?.cleared || 0) || 0
        );
        if (cleared > 0) {
            updateOnlineMusicFeedback(`Cleared ${cleared} finished download job${cleared === 1 ? '' : 's'}.`, 'success');
            showToast('Finished download jobs cleared.', 'info');
        } else {
            updateOnlineMusicFeedback('No finished download jobs were waiting to be cleared.', 'info');
            showToast('No finished jobs to clear.', 'info');
        }
    } catch (error) {
        const cleared = Math.max(0, Number(localResult?.cleared || 0) || 0);
        if (cleared > 0) {
            updateOnlineMusicFeedback(`Cleared ${cleared} finished download job${cleared === 1 ? '' : 's'} from saved queue history.`, 'warn');
            showToast('Finished download jobs cleared locally.', 'info');
            return;
        }
        const message = error?.message || 'Unable to clear finished download jobs.';
        updateOnlineMusicFeedback(message, 'error');
        showToast(message, 'error');
    }
}

async function downloadOnlineMusicRelease() {
    const online = getOnlineMusicState();
    const release = online.browserRelease;
    const releaseTracks = Array.isArray(release?.tracks) ? release.tracks.slice() : [];
    if (!release?.playlistId || !releaseTracks.length) {
        showToast('No release tracks are available to download.', 'info');
        return;
    }
    if (!nexPlayDesktopBridge || typeof nexPlayDesktopBridge.downloadOnlineRelease !== 'function') {
        const message = getDesktopOnlyMessage('Release downloads');
        updateOnlineMusicFeedback(message, 'warn');
        showToast(message, 'info');
        return;
    }
    updateOnlineMusicFeedback(`Preparing "${release.title || 'release'}" for download...`, 'info');
    const resolvedTracks = [];
    const trackMap = new Map();
    for (const track of releaseTracks) {
        let playable = track;
        if (!track?.videoId) {
            try {
                playable = await resolvePlayableOnlineMusicTrack(track, {
                    releaseTitle: sanitizeText(release?.title || track.releaseTitle || '')
                });
            } catch (error) {
                appendOnlineMusicImportReviewItem({
                    kind: 'metadata',
                    title: `${track.title || 'Track'} skipped`,
                    detail: error?.message || 'This track could not be resolved for release download.',
                    trackId: track.id
                });
                continue;
            }
        }
        if (!playable?.videoId) continue;
        resolvedTracks.push({
            trackId: playable.id,
            videoId: playable.videoId,
            title: playable.title,
            artist: playable.artist,
            cover: playable.cover || '',
            canonicalUrl: playable.canonicalUrl || '',
            originProvider: playable.catalogProvider || playable.provider || '',
            originReleaseId: release.playlistId || playable.originReleaseId || ''
        });
        trackMap.set(playable.id, playable);
    }
    if (!resolvedTracks.length) {
        showToast('No playable release tracks could be resolved for download.', 'error');
        return;
    }
    const autoImport = !!getAppSettings().onlineMusic?.autoImportDownloads;
    const result = await nexPlayDesktopBridge.downloadOnlineRelease({
        title: sanitizeText(release.title || 'Release Download'),
        autoImport,
        tracks: resolvedTracks
    });
    if (result?.cancelled) {
        updateOnlineMusicFeedback('Release download cancelled.', 'warn');
        return;
    }
    if (autoImport && Array.isArray(result?.items)) {
        for (const item of result.items) {
            const baseTrack = trackMap.get(normalizeOnlineMusicTrackId(item?.trackId || '')) || trackMap.get(String(item?.trackId || '').trim()) || releaseTracks.find((track) => track?.title === item?.title) || null;
            if (!baseTrack) continue;
            await importDownloadedOnlineTrack(item, {
                ...baseTrack,
                originProvider: item.originProvider || baseTrack.originProvider || baseTrack.provider || '',
                originReleaseId: item.originReleaseId || baseTrack.originReleaseId || release.playlistId || ''
            });
        }
        appendOnlineMusicImportReviewItem({
            kind: 'info',
            title: `${release.title || 'Release'} imported`,
            detail: `Downloaded ${result.items.length} release track(s) and added them to the local library.`
        });
    }
    updateOnlineMusicFeedback(`Finished downloading "${release.title || 'release'}".`, 'success');
    renderOnlineMusicContent();
}

function createOnlineMusicReleaseFromPlaylist(item, channel) {
    const playlist = item && typeof item === 'object' ? item : {};
    const snippet = playlist.snippet || {};
    const release = {
        playlistId: sanitizeText(playlist.id || ''),
        provider: 'youtube',
        providerLabel: 'YouTube',
        providerReleaseId: sanitizeText(playlist.id || ''),
        channelId: sanitizeText(channel?.channelId || snippet.channelId || ''),
        ownerChannelId: sanitizeText(snippet.channelId || ''),
        ownerChannelTitle: sanitizeText(snippet.channelTitle || ''),
        title: sanitizeText(snippet.title || ''),
        description: sanitizeText(snippet.description || ''),
        cover: getOnlineMusicThumbnail(snippet),
        trackCount: Number(playlist?.contentDetails?.itemCount || 0) || 0,
        publishedAt: sanitizeText(snippet.publishedAt || ''),
        artist: sanitizeText(channel?.title || snippet.channelTitle || '')
    };
    const classification = classifyOnlineMusicRelease(release);
    if (!classification.include || !release.playlistId) return null;
    return {
        ...release,
        kind: classification.kind,
        sourceSummary: 'YouTube'
    };
}

function mergeUniqueOnlineMusicReleases(releases = []) {
    const merged = new Map();
    (Array.isArray(releases) ? releases : []).forEach((release) => {
        const key = buildOnlineMusicReleaseIdentity(release);
        if (!key) return;
        if (!merged.has(key)) {
            merged.set(key, mergeOnlineMusicReleaseRecords({}, release));
            return;
        }
        merged.set(key, mergeOnlineMusicReleaseRecords(merged.get(key) || {}, release));
    });
    return sortOnlineMusicReleases(Array.from(merged.values()));
}

function scoreOnlineMusicReleasePlaylistCandidate(playlist, channel) {
    const artistName = normalizeLyricsLookupText(getOnlineMusicCatalogArtistName(channel));
    const ownerTitle = normalizeLyricsLookupText(normalizeLyricsArtistName(playlist?.snippet?.channelTitle || ''));
    const playlistTitle = normalizeLyricsLookupText(normalizeLyricsArtistName(playlist?.snippet?.title || ''));
    let score = 0;
    if (!artistName) return score;
    if (ownerTitle === artistName) score += 42;
    else if (ownerTitle && (ownerTitle.includes(artistName) || artistName.includes(ownerTitle))) score += 24;
    if (playlistTitle.includes(artistName)) score += 10;
    if (/\btopic\b/i.test(playlist?.snippet?.channelTitle || '')) score += 8;
    return score;
}

async function searchOnlineMusicArtistReleasePlaylists(channel) {
    const safeChannel = channel && typeof channel === 'object' ? channel : null;
    if (!safeChannel?.title) return [];
    const queries = Array.from(new Set([
        `${safeChannel.title} album`,
        `${safeChannel.title} ep`,
        `${safeChannel.title} single`
    ].map((value) => sanitizeText(value)).filter(Boolean)));
    const playlistIds = new Set();
    for (const query of queries) {
        const items = await fetchOnlineMusicYouTubeItems('search', {
            part: 'snippet',
            type: 'playlist',
            q: query,
            maxResults: 8
        }, { maxPages: 1 });
        items.forEach((item) => {
            const playlistId = sanitizeText(item?.id?.playlistId || '');
            if (playlistId) playlistIds.add(playlistId);
        });
    }
    const details = await fetchOnlineMusicPlaylistsByIds(Array.from(playlistIds));
    return details
        .filter((playlist) => scoreOnlineMusicReleasePlaylistCandidate(playlist, safeChannel) >= 18)
        .map((playlist) => createOnlineMusicReleaseFromPlaylist(playlist, safeChannel))
        .filter(Boolean);
}

function createItunesReleaseFromCollection(item, channel, artistInfo = {}) {
    const collectionId = sanitizeText(item?.collectionId || '');
    const title = sanitizeText(item?.collectionName || item?.collectionCensoredName || '');
    if (!collectionId || !title) return null;
    const trackCount = Number(item?.trackCount || 0) || 0;
    const collectionType = sanitizeText(item?.collectionType || '');
    const titleLooksSingleEp = /\bEP\b/i.test(title) || /\s[-\u2013\u2014]\s*single\b/i.test(title);
    const kind = !titleLooksSingleEp && /\balbum\b/i.test(collectionType) && trackCount !== 1
        ? 'album'
        : 'single-ep';
    return {
        playlistId: `itunes:${collectionId}`,
        provider: 'itunes',
        providerLabel: 'iTunes',
        providerReleaseId: collectionId,
        providerArtistId: sanitizeText(artistInfo?.artistId || item?.artistId || ''),
        channelId: sanitizeText(channel?.channelId || ''),
        title,
        description: sanitizeText(item?.primaryGenreName || ''),
        cover: buildItunesArtworkUrl(item?.artworkUrl100 || item?.artworkUrl60 || ''),
        trackCount,
        publishedAt: sanitizeText(item?.releaseDate || ''),
        artist: sanitizeText(item?.artistName || artistInfo?.title || getOnlineMusicCatalogArtistName(channel) || channel?.title || ''),
        kind,
        sourceSummary: 'iTunes'
    };
}

async function fetchItunesArtistById(artistId, fallbackName = '') {
    const safeArtistId = sanitizeText(artistId || '');
    if (!safeArtistId) return null;
    const payload = await fetchJsonpPayload(`https://itunes.apple.com/lookup?id=${encodeURIComponent(safeArtistId)}&entity=musicArtist&limit=1`, {
        callbackPrefix: 'nexplay_itunes_artist_id_',
        errorMessage: 'iTunes artist lookup failed.'
    });
    const artist = (Array.isArray(payload?.results) ? payload.results : [])
        .find((item) => item?.wrapperType === 'artist' || sanitizeText(item?.artistId || '') === safeArtistId);
    if (!artist) {
        return {
            artistId: safeArtistId,
            title: sanitizeText(fallbackName || ''),
            primaryGenreName: ''
        };
    }
    return {
        artistId: sanitizeText(artist?.artistId || safeArtistId),
        title: sanitizeText(artist?.artistName || fallbackName || ''),
        primaryGenreName: sanitizeText(artist?.primaryGenreName || '')
    };
}

async function searchItunesArtistCandidate(artistName = '') {
    const safeName = normalizeOnlineMusicCatalogArtistName(artistName || '');
    if (!safeName) return null;
    const payload = await fetchJsonpPayload(`https://itunes.apple.com/search?term=${encodeURIComponent(safeName)}&entity=musicArtist&limit=10`, {
        callbackPrefix: 'nexplay_itunes_artist_',
        errorMessage: 'iTunes artist search failed.'
    });
    const scored = (Array.isArray(payload?.results) ? payload.results : [])
        .map((item) => ({
            item,
            score: scoreOnlineMusicArtistNameCandidate(item?.artistName || '', safeName)
                + Math.min(12, Number(item?.artistLinkUrl ? 6 : 0))
        }))
        .sort((left, right) => right.score - left.score);
    const best = scored[0];
    if (!best?.item || best.score < 60) return null;
    return {
        artistId: sanitizeText(best.item?.artistId || ''),
        title: sanitizeText(best.item?.artistName || safeName),
        primaryGenreName: sanitizeText(best.item?.primaryGenreName || '')
    };
}

async function resolveItunesArtist(channel) {
    const artistName = getOnlineMusicCatalogArtistName(channel);
    if (!artistName) return null;
    return searchItunesArtistCandidate(artistName);
}

async function resolveItunesArtistCandidates(channel) {
    const names = buildOnlineMusicCatalogArtistNameCandidates(channel);
    const directArtistId = getOnlineMusicCatalogProviderArtistId(channel, 'itunes');
    const direct = directArtistId
        ? [fetchItunesArtistById(directArtistId, names[0] || getOnlineMusicCatalogArtistName(channel))]
        : [];
    const searched = names.slice(0, 4).map((name) => searchItunesArtistCandidate(name).catch(() => null));
    const artists = await Promise.all([...direct, ...searched]);
    const seen = new Set();
    return artists
        .filter((artist) => artist?.artistId)
        .filter((artist) => {
            const key = sanitizeText(artist.artistId || '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

async function fetchItunesArtistReleasesByArtist(artist, channel) {
    if (!artist?.artistId) return [];
    const payload = await fetchJsonpPayload(`https://itunes.apple.com/lookup?id=${encodeURIComponent(artist.artistId)}&entity=album&limit=200`, {
        callbackPrefix: 'nexplay_itunes_lookup_',
        errorMessage: 'iTunes catalog lookup failed.'
    });
    return (Array.isArray(payload?.results) ? payload.results : [])
        .filter((item) => item?.wrapperType === 'collection' && sanitizeText(item?.collectionId || ''))
        .filter((item) => shouldKeepOnlineMusicCatalogReleaseForArtist(item, channel, artist))
        .map((item) => createItunesReleaseFromCollection(item, channel, artist))
        .filter(Boolean);
}

async function searchItunesAlbumReleasesByArtistName(artistName = '', channel = {}) {
    const safeName = normalizeOnlineMusicCatalogArtistName(artistName || '');
    if (!safeName) return [];
    const payload = await fetchJsonpPayload(`https://itunes.apple.com/search?term=${encodeURIComponent(safeName)}&media=music&entity=album&attribute=artistTerm&limit=200`, {
        callbackPrefix: 'nexplay_itunes_album_search_',
        errorMessage: 'iTunes album search failed.'
    });
    return (Array.isArray(payload?.results) ? payload.results : [])
        .filter((item) => item?.wrapperType === 'collection' && sanitizeText(item?.collectionId || ''))
        .filter((item) => Math.max(
            scoreOnlineMusicArtistNameCandidate(item?.artistName || '', safeName),
            scoreOnlineMusicArtistNameCandidate(item?.collectionArtistName || '', safeName)
        ) >= 76)
        .filter((item) => shouldKeepOnlineMusicCatalogReleaseForArtist(item, channel, { title: safeName }))
        .map((item) => createItunesReleaseFromCollection(item, channel, {
            artistId: item?.artistId || getOnlineMusicCatalogProviderArtistId(channel, 'itunes'),
            title: item?.artistName || safeName
        }))
        .filter(Boolean);
}

async function fetchItunesArtistCatalog(channel) {
    const names = buildOnlineMusicCatalogArtistNameCandidates(channel);
    const artists = await resolveItunesArtistCandidates(channel).catch(() => []);
    const releaseGroups = await Promise.all([
        ...artists.slice(0, 3).map((artist) => fetchItunesArtistReleasesByArtist(artist, channel).catch(() => [])),
        ...names.slice(0, 3).map((name) => searchItunesAlbumReleasesByArtistName(name, channel).catch(() => []))
    ]);
    const releases = mergeUniqueOnlineMusicReleases(releaseGroups.flat());
    const artist = artists[0] || null;
    return {
        provider: 'itunes',
        providerLabel: 'iTunes',
        artistId: sanitizeText(artist?.artistId || getOnlineMusicCatalogProviderArtistId(channel, 'itunes') || ''),
        title: sanitizeText(artist?.title || names[0] || getOnlineMusicCatalogArtistName(channel) || ''),
        releases,
        cover: releases.find((release) => !!release.cover)?.cover || ''
    };
}

function createDeezerReleaseFromAlbum(item, channel, artistInfo = {}) {
    const albumId = sanitizeText(item?.id || '');
    const title = sanitizeText(item?.title || '');
    if (!albumId || !title) return null;
    const recordType = sanitizeText(item?.record_type || '');
    const trackCount = Number(item?.nb_tracks || 0) || 0;
    const titleLooksSingleEp = /\bEP\b/i.test(title) || /\s[-\u2013\u2014]\s*single\b/i.test(title);
    const kind = !titleLooksSingleEp && recordType === 'album'
        ? 'album'
        : (trackCount >= 7 ? 'album' : 'single-ep');
    return {
        playlistId: `deezer:${albumId}`,
        provider: 'deezer',
        providerLabel: 'Deezer',
        providerReleaseId: albumId,
        providerArtistId: sanitizeText(artistInfo?.artistId || item?.artist?.id || ''),
        channelId: sanitizeText(channel?.channelId || ''),
        title,
        description: '',
        cover: item?.cover_xl || item?.cover_big || item?.cover_medium || '',
        trackCount,
        publishedAt: sanitizeText(item?.release_date || ''),
        artist: sanitizeText(artistInfo?.title || item?.artist?.name || getOnlineMusicCatalogArtistName(channel) || channel?.title || ''),
        kind,
        sourceSummary: 'Deezer'
    };
}

async function fetchDeezerArtistById(artistId, fallbackName = '') {
    const safeArtistId = sanitizeText(artistId || '');
    if (!safeArtistId) return null;
    const payload = await fetchJsonpPayload(`https://api.deezer.com/artist/${encodeURIComponent(safeArtistId)}?output=jsonp`, {
        callbackPrefix: 'nexplay_deezer_artist_id_',
        errorMessage: 'Deezer artist lookup failed.'
    });
    if (!payload || payload.error) {
        return {
            artistId: safeArtistId,
            title: sanitizeText(fallbackName || ''),
            cover: ''
        };
    }
    return {
        artistId: sanitizeText(payload?.id || safeArtistId),
        title: sanitizeText(payload?.name || fallbackName || ''),
        cover: payload?.picture_xl || payload?.picture_big || payload?.picture_medium || ''
    };
}

async function searchDeezerArtistCandidate(artistName = '') {
    const safeName = normalizeOnlineMusicCatalogArtistName(artistName || '');
    if (!safeName) return null;
    const payload = await fetchJsonpPayload(`https://api.deezer.com/search/artist?q=${encodeURIComponent(safeName)}&output=jsonp`, {
        callbackPrefix: 'nexplay_deezer_artist_',
        errorMessage: 'Deezer artist search failed.'
    });
    const scored = (Array.isArray(payload?.data) ? payload.data : [])
        .map((item) => ({
            item,
            score: scoreOnlineMusicArtistNameCandidate(item?.name || '', safeName)
                + Math.min(20, Number(item?.nb_album || 0) || 0)
        }))
        .sort((left, right) => right.score - left.score);
    const best = scored[0];
    if (!best?.item || best.score < 60) return null;
    return {
        artistId: sanitizeText(best.item?.id || ''),
        title: sanitizeText(best.item?.name || safeName),
        cover: best.item?.picture_xl || best.item?.picture_big || best.item?.picture_medium || ''
    };
}

async function resolveDeezerArtist(channel) {
    const artistName = getOnlineMusicCatalogArtistName(channel);
    if (!artistName) return null;
    return searchDeezerArtistCandidate(artistName);
}

async function resolveDeezerArtistCandidates(channel) {
    const names = buildOnlineMusicCatalogArtistNameCandidates(channel);
    const directArtistId = getOnlineMusicCatalogProviderArtistId(channel, 'deezer');
    const direct = directArtistId
        ? [fetchDeezerArtistById(directArtistId, names[0] || getOnlineMusicCatalogArtistName(channel))]
        : [];
    const searched = names.slice(0, 4).map((name) => searchDeezerArtistCandidate(name).catch(() => null));
    const artists = await Promise.all([...direct, ...searched]);
    const seen = new Set();
    return artists
        .filter((artist) => artist?.artistId)
        .filter((artist) => {
            const key = sanitizeText(artist.artistId || '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

async function fetchDeezerArtistAlbums(artistId, options = {}) {
    const opts = { pageSize: 50, maxPages: 3, ...options };
    const safeArtistId = sanitizeText(artistId || '');
    if (!safeArtistId) return [];
    const results = [];
    let index = 0;
    for (let page = 0; page < opts.maxPages; page += 1) {
        const payload = await fetchJsonpPayload(`https://api.deezer.com/artist/${encodeURIComponent(safeArtistId)}/albums?limit=${encodeURIComponent(String(opts.pageSize))}&index=${encodeURIComponent(String(index))}&output=jsonp`, {
            callbackPrefix: 'nexplay_deezer_albums_',
            errorMessage: 'Deezer release lookup failed.'
        });
        const data = Array.isArray(payload?.data) ? payload.data : [];
        results.push(...data);
        if (!data.length || data.length < opts.pageSize) break;
        index += data.length;
        if ((Number(payload?.total || 0) || 0) > 0 && results.length >= Number(payload.total || 0)) break;
    }
    return results;
}

async function searchDeezerAlbumReleasesByArtistName(artistName = '', channel = {}) {
    const safeName = normalizeOnlineMusicCatalogArtistName(artistName || '');
    if (!safeName) return [];
    const payload = await fetchJsonpPayload(`https://api.deezer.com/search/album?q=${encodeURIComponent(safeName)}&limit=100&output=jsonp`, {
        callbackPrefix: 'nexplay_deezer_album_search_',
        errorMessage: 'Deezer album search failed.'
    });
    return (Array.isArray(payload?.data) ? payload.data : [])
        .filter((item) => Math.max(
            scoreOnlineMusicArtistNameCandidate(item?.artist?.name || '', safeName),
            scoreOnlineMusicArtistNameCandidate(item?.artistName || '', safeName)
        ) >= 76)
        .filter((item) => shouldKeepOnlineMusicCatalogReleaseForArtist(item, channel, { title: safeName }))
        .map((item) => createDeezerReleaseFromAlbum(item, channel, {
            artistId: item?.artist?.id || getOnlineMusicCatalogProviderArtistId(channel, 'deezer'),
            title: item?.artist?.name || safeName
        }))
        .filter(Boolean);
}

async function fetchDeezerArtistCatalog(channel) {
    const names = buildOnlineMusicCatalogArtistNameCandidates(channel);
    const artists = await resolveDeezerArtistCandidates(channel).catch(() => []);
    const releaseGroups = await Promise.all([
        ...artists.slice(0, 3).map((artist) => fetchDeezerArtistAlbums(artist.artistId, { pageSize: 50, maxPages: 3 })
            .then((albums) => albums
                .filter((item) => shouldKeepOnlineMusicCatalogReleaseForArtist(item, channel, artist))
                .map((item) => createDeezerReleaseFromAlbum(item, channel, artist))
                .filter(Boolean))
            .catch(() => [])),
        ...names.slice(0, 3).map((name) => searchDeezerAlbumReleasesByArtistName(name, channel).catch(() => []))
    ]);
    const releases = releaseGroups.flat().filter(Boolean);
    const mergedReleases = mergeUniqueOnlineMusicReleases(releases);
    const artist = artists[0] || null;
    return {
        provider: 'deezer',
        providerLabel: 'Deezer',
        artistId: sanitizeText(artist?.artistId || getOnlineMusicCatalogProviderArtistId(channel, 'deezer') || ''),
        title: sanitizeText(artist?.title || names[0] || getOnlineMusicCatalogArtistName(channel) || ''),
        cover: artist?.cover || mergedReleases.find((release) => !!release.cover)?.cover || '',
        releases: mergedReleases
    };
}

function formatMusicBrainzArtistCredit(credits = []) {
    return (Array.isArray(credits) ? credits : [])
        .map((credit) => sanitizeText(credit?.artist?.name || credit?.name || ''))
        .filter(Boolean)
        .join(', ');
}

function createMusicBrainzReleaseFromGroup(item, channel, artistInfo = {}) {
    const releaseGroupId = sanitizeText(item?.id || '');
    const title = sanitizeText(item?.title || '');
    if (!releaseGroupId || !title) return null;
    const primaryType = sanitizeText(item?.['primary-type'] || '');
    const secondaryTypes = Array.isArray(item?.['secondary-types']) ? item['secondary-types'].map((type) => sanitizeText(type || '')) : [];
    const typeText = [primaryType, ...secondaryTypes].join(' ');
    const kind = /single|ep/i.test(typeText)
        ? 'single-ep'
        : (/\balbum\b/i.test(primaryType) ? 'album' : 'single-ep');
    const releaseBucket = kind === 'single-ep'
        ? 'singlesEps'
        : (/\b(?:compilation|soundtrack|live|remix(?:es)?|dj[\s-]*mix|mixtape|interview|spokenword|spoken\s+word)\b/i.test(typeText)
            ? 'otherReleases'
            : 'albums');
    return {
        playlistId: `musicbrainz:${releaseGroupId}`,
        provider: 'musicbrainz',
        providerLabel: 'MusicBrainz',
        providerReleaseId: releaseGroupId,
        providerArtistId: sanitizeText(artistInfo?.artistId || ''),
        channelId: sanitizeText(channel?.channelId || ''),
        title,
        description: sanitizeText([primaryType, ...secondaryTypes].filter(Boolean).join(' / ')),
        cover: '',
        trackCount: 0,
        publishedAt: sanitizeText(item?.['first-release-date'] || ''),
        artist: sanitizeText(artistInfo?.title || getOnlineMusicCatalogArtistName(channel) || channel?.title || ''),
        kind,
        releaseBucket,
        releaseType: primaryType,
        releaseSubtypes: secondaryTypes,
        sourceSummary: 'MusicBrainz'
    };
}

async function searchMusicBrainzArtistCandidate(artistName = '') {
    const safeName = normalizeOnlineMusicCatalogArtistName(artistName || '');
    if (!safeName) return null;
    const query = `artist:"${safeName.replace(/"/g, '')}"`;
    const payload = await fetchJsonPayload(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&fmt=json&limit=8`, {
        timeoutMs: 5000,
        errorMessage: 'MusicBrainz artist search failed.'
    });
    const scored = (Array.isArray(payload?.artists) ? payload.artists : [])
        .map((item) => ({
            item,
            score: Math.max(
                scoreOnlineMusicArtistNameCandidate(item?.name || '', safeName),
                scoreOnlineMusicArtistNameCandidate(item?.['sort-name'] || '', safeName)
            ) + Math.min(10, Number(item?.score || 0) / 10)
        }))
        .sort((left, right) => right.score - left.score);
    const best = scored[0];
    if (!best?.item || best.score < 60) return null;
    return {
        artistId: sanitizeText(best.item?.id || ''),
        title: sanitizeText(best.item?.name || safeName)
    };
}

async function fetchMusicBrainzReleaseGroups(artistId = '', options = {}) {
    const safeArtistId = sanitizeText(artistId || '');
    if (!safeArtistId) return [];
    const opts = { pageSize: 100, maxPages: 2, ...options };
    const results = [];
    for (let page = 0; page < opts.maxPages; page += 1) {
        const offset = page * opts.pageSize;
        const payload = await fetchJsonPayload(`https://musicbrainz.org/ws/2/release-group?artist=${encodeURIComponent(safeArtistId)}&fmt=json&limit=${encodeURIComponent(String(opts.pageSize))}&offset=${encodeURIComponent(String(offset))}`, {
            timeoutMs: 5000,
            errorMessage: 'MusicBrainz release groups lookup failed.'
        });
        const groups = Array.isArray(payload?.['release-groups']) ? payload['release-groups'] : [];
        results.push(...groups);
        if (!groups.length || groups.length < opts.pageSize) break;
        if ((Number(payload?.count || 0) || 0) > 0 && results.length >= Number(payload.count || 0)) break;
    }
    return results;
}

async function fetchMusicBrainzArtistCatalog(channel) {
    const names = buildOnlineMusicCatalogArtistNameCandidates(channel);
    if (!names.length) return { provider: 'musicbrainz', providerLabel: 'MusicBrainz', releases: [] };
    const artists = (await Promise.all(names.slice(0, 3).map((name) => searchMusicBrainzArtistCandidate(name).catch(() => null))))
        .filter((artist) => artist?.artistId)
        .filter((artist, index, list) => list.findIndex((item) => item.artistId === artist.artistId) === index)
        .slice(0, 2);
    if (!artists.length) return { provider: 'musicbrainz', providerLabel: 'MusicBrainz', releases: [] };
    const releaseGroups = await Promise.all(artists.map((artist) => fetchMusicBrainzReleaseGroups(artist.artistId)
        .then((groups) => groups.map((item) => createMusicBrainzReleaseFromGroup(item, channel, artist)).filter(Boolean))
        .catch(() => [])));
    const releases = mergeUniqueOnlineMusicReleases(releaseGroups.flat());
    const artist = artists[0] || null;
    return {
        provider: 'musicbrainz',
        providerLabel: 'MusicBrainz',
        artistId: sanitizeText(artist?.artistId || ''),
        title: sanitizeText(artist?.title || names[0] || ''),
        releases,
        cover: ''
    };
}

function buildOnlineMusicArtistCatalog(channel, releases = [], uploadsTracks = []) {
    const catalogArtistName = getOnlineMusicCatalogArtistName(channel);
    const artistCatalogKey = buildOnlineMusicArtistCatalogCacheKey(channel);
    const mergedReleases = mergeUniqueOnlineMusicReleases(releases);
    const catalogIdentityBase = {
        ...channel,
        catalogArtistName,
        title: sanitizeText(catalogArtistName || channel?.title || '')
    };
    const publicReleases = buildOnlineMusicPublicArtistReleaseGroups(mergedReleases, catalogIdentityBase);
    const { albums, singlesEps, otherReleases } = publicReleases;
    const catalogSources = Array.from(new Set([
        uploadsTracks.length ? 'YouTube' : '',
        ...[...albums, ...singlesEps, ...otherReleases].flatMap((release) => getOnlineMusicReleaseSourceLabels(release))
    ].filter(Boolean)));
    const catalogIdentity = {
        ...catalogIdentityBase,
        albums,
        singlesEps,
        otherReleases
    };
    return {
        schemaVersion: ONLINE_MUSIC_ARTIST_CATALOG_SCHEMA_VERSION,
        channelId: sanitizeText(channel?.channelId || ''),
        artistCatalogKey,
        catalogArtistName,
        title: sanitizeText(catalogArtistName || channel?.title || ''),
        description: sanitizeText(channel?.description || ''),
        cover: channel?.cover || '',
        uploadsPlaylistId: sanitizeText(channel?.uploadsPlaylistId || ''),
        subscriberCount: Number(channel?.subscriberCount || 0) || 0,
        videoCount: Number(channel?.videoCount || 0) || 0,
        albums,
        singlesEps,
        otherReleases,
        allWork: filterOnlineMusicArtistWorkTracksForArtist(uploadsTracks, catalogIdentity),
        catalogSources,
        updatedAt: Date.now()
    };
}

function updateOnlineMusicArtistCatalog(catalog) {
    const cacheKey = buildOnlineMusicArtistCatalogCacheKey(catalog);
    if (!cacheKey) return null;
    const online = getOnlineMusicState();
    const cache = getOnlineMusicArtistCatalogCache();
    const channelId = sanitizeText(catalog?.channelId || '');
    const nextCatalog = {
        ...(cache[cacheKey] || (channelId ? cache[channelId] : {}) || {}),
        ...catalog,
        schemaVersion: ONLINE_MUSIC_ARTIST_CATALOG_SCHEMA_VERSION,
        artistCatalogKey: cacheKey
    };
    cache[cacheKey] = nextCatalog;
    if (channelId) cache[channelId] = nextCatalog;
    if (online.browserArtist?.artistCatalogKey === cacheKey || online.browserArtist?.channelId === channelId) {
        online.browserArtist = nextCatalog;
    }
    return nextCatalog;
}

function mergeTracksIntoOnlineMusicArtistCatalog(channelId, tracks = []) {
    const safeChannelId = sanitizeText(channelId || '');
    if (!safeChannelId) return null;
    const cache = getOnlineMusicArtistCatalogCache();
    const catalog = cache[safeChannelId];
    if (!catalog) return null;
    const filteredTracks = filterOnlineMusicArtistWorkTracksForArtist(tracks, catalog);
    return updateOnlineMusicArtistCatalog({
        ...catalog,
        allWork: mergeUniqueOnlineMusicTracks([...(catalog.allWork || []), ...filteredTracks]),
        updatedAt: Date.now()
    });
}

function getOnlineMusicArtistRelease(playlistId = '') {
    const safePlaylistId = buildOnlineMusicReleaseCacheKey(playlistId);
    if (!safePlaylistId) return null;
    const online = getOnlineMusicState();
    const publicArtist = online.browserArtist
        ? getOnlineMusicArtistCatalogForPublicView(online.browserArtist)
        : null;
    const artistReleases = [
        ...(publicArtist?.albums || []),
        ...(publicArtist?.singlesEps || []),
        ...(publicArtist?.otherReleases || [])
    ];
    const cachedRelease = getOnlineMusicReleaseTracksCache()[safePlaylistId]?.release || null;
    const publicCachedRelease = cachedRelease && publicArtist && isPublicOnlineMusicArtistReleaseCandidate(cachedRelease, publicArtist)
        ? cachedRelease
        : null;
    return artistReleases.find((release) => release?.playlistId === safePlaylistId)
        || publicCachedRelease
        || null;
}

async function fetchItunesReleaseTrackCandidates(source, release) {
    const collectionId = sanitizeText(source?.providerReleaseId || source?.playlistId || '').replace(/^itunes:/i, '');
    if (!collectionId) {
        return { release, trackCandidates: [] };
    }
    const payload = await fetchJsonpPayload(`https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=song&limit=200`, {
        callbackPrefix: 'nexplay_itunes_tracks_',
        errorMessage: 'iTunes release lookup failed.'
    });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const collection = results.find((item) => item?.wrapperType === 'collection') || {};
    const trackCandidates = results
        .filter((item) => item?.wrapperType === 'track' && sanitizeText(item?.trackName || ''))
        .sort((left, right) => {
            const leftDisc = Number(left?.discNumber || 0) || 0;
            const rightDisc = Number(right?.discNumber || 0) || 0;
            if (leftDisc !== rightDisc) return leftDisc - rightDisc;
            return (Number(left?.trackNumber || 0) || 0) - (Number(right?.trackNumber || 0) || 0);
        })
        .map((item) => ({
            id: sanitizeText(item?.trackId || ''),
            title: sanitizeText(item?.trackName || ''),
            artist: sanitizeText(item?.artistName || release?.artist || ''),
            releaseTitle: sanitizeText(item?.collectionName || release?.title || ''),
            publishedAt: sanitizeText(item?.releaseDate || release?.publishedAt || ''),
            duration: Math.round(Math.max(0, Number(item?.trackTimeMillis || 0) || 0) / 1000),
            trackNumber: Number(item?.trackNumber || 0) || 0,
            discNumber: Number(item?.discNumber || 0) || 0,
            cover: buildItunesArtworkUrl(item?.artworkUrl100 || collection?.artworkUrl100 || release?.cover || '')
        }));
    return {
        release: {
            ...release,
            catalogProvider: 'itunes',
            catalogProviderLabel: 'iTunes',
            transportProvider: 'youtube',
            transportProviderLabel: 'YouTube',
            cover: release?.cover || buildItunesArtworkUrl(collection?.artworkUrl100 || ''),
            trackCount: Math.max(Number(release?.trackCount || 0) || 0, Number(collection?.trackCount || 0) || 0),
            publishedAt: sanitizeText(release?.publishedAt || collection?.releaseDate || ''),
            description: sanitizeText(release?.description || collection?.primaryGenreName || '')
        },
        trackCandidates
    };
}

async function fetchDeezerReleaseTrackCandidates(source, release) {
    const albumId = sanitizeText(source?.providerReleaseId || source?.playlistId || '').replace(/^deezer:/i, '');
    if (!albumId) {
        return { release, trackCandidates: [] };
    }
    const payload = await fetchJsonpPayload(`https://api.deezer.com/album/${encodeURIComponent(albumId)}?output=jsonp`, {
        callbackPrefix: 'nexplay_deezer_tracks_',
        errorMessage: 'Deezer release lookup failed.'
    });
    const trackCandidates = (Array.isArray(payload?.tracks?.data) ? payload.tracks.data : [])
        .sort((left, right) => {
            const leftDisc = Number(left?.disk_number || 0) || 0;
            const rightDisc = Number(right?.disk_number || 0) || 0;
            if (leftDisc !== rightDisc) return leftDisc - rightDisc;
            return (Number(left?.track_position || 0) || 0) - (Number(right?.track_position || 0) || 0);
        })
        .map((item) => ({
            id: sanitizeText(item?.id || ''),
            title: sanitizeText(item?.title || ''),
            artist: sanitizeText(item?.artist?.name || release?.artist || ''),
            releaseTitle: sanitizeText(payload?.title || release?.title || ''),
            publishedAt: sanitizeText(payload?.release_date || release?.publishedAt || ''),
            duration: Number(item?.duration || 0) || 0,
            trackNumber: Number(item?.track_position || 0) || 0,
            discNumber: Number(item?.disk_number || 0) || 0,
            cover: payload?.cover_xl || payload?.cover_big || payload?.cover_medium || release?.cover || ''
        }));
    return {
        release: {
            ...release,
            catalogProvider: 'deezer',
            catalogProviderLabel: 'Deezer',
            transportProvider: 'youtube',
            transportProviderLabel: 'YouTube',
            title: sanitizeText(release?.title || payload?.title || ''),
            cover: release?.cover || payload?.cover_xl || payload?.cover_big || payload?.cover_medium || '',
            trackCount: Math.max(Number(release?.trackCount || 0) || 0, Number(payload?.nb_tracks || 0) || 0),
            publishedAt: sanitizeText(release?.publishedAt || payload?.release_date || ''),
            description: sanitizeText(release?.description || payload?.label || '')
        },
        trackCandidates
    };
}

function scoreMusicBrainzReleaseCandidate(release = {}) {
    const media = Array.isArray(release?.media) ? release.media : [];
    const trackCount = media.reduce((total, item) => total + (Array.isArray(item?.tracks) ? item.tracks.length : 0), 0);
    let score = trackCount > 0 ? 80 : 0;
    if (/^official$/i.test(release?.status || '')) score += 40;
    if (/^(?:xw|us|gb)$/i.test(release?.country || '')) score += 10;
    if (sanitizeText(release?.date || '')) score += 6;
    return score;
}

async function fetchMusicBrainzReleaseTrackCandidates(source, release) {
    const releaseGroupId = sanitizeText(source?.providerReleaseId || source?.playlistId || '').replace(/^musicbrainz:/i, '');
    if (!releaseGroupId) {
        return { release, trackCandidates: [] };
    }
    const payload = await fetchJsonPayload(`https://musicbrainz.org/ws/2/release?release-group=${encodeURIComponent(releaseGroupId)}&inc=recordings+artist-credits&fmt=json&limit=25`, {
        timeoutMs: 5500,
        errorMessage: 'MusicBrainz release lookup failed.'
    });
    const bestRelease = (Array.isArray(payload?.releases) ? payload.releases : [])
        .slice()
        .sort((left, right) => scoreMusicBrainzReleaseCandidate(right) - scoreMusicBrainzReleaseCandidate(left))[0] || {};
    const media = Array.isArray(bestRelease?.media) ? bestRelease.media : [];
    const trackCandidates = media.flatMap((disc, discIndex) => {
        const tracks = Array.isArray(disc?.tracks) ? disc.tracks : [];
        return tracks.map((item, index) => {
            const recording = item?.recording || {};
            const title = sanitizeText(item?.title || recording?.title || '');
            return {
                id: sanitizeText(recording?.id || item?.id || ''),
                title,
                artist: formatMusicBrainzArtistCredit(item?.['artist-credit'] || recording?.['artist-credit']) || release?.artist || '',
                releaseTitle: sanitizeText(bestRelease?.title || release?.title || ''),
                publishedAt: sanitizeText(bestRelease?.date || release?.publishedAt || ''),
                duration: Math.round(Math.max(0, Number(recording?.length || item?.length || 0) || 0) / 1000),
                trackNumber: Number(item?.position || index + 1) || index + 1,
                discNumber: Number(disc?.position || discIndex + 1) || discIndex + 1,
                cover: release?.cover || ''
            };
        });
    }).filter((candidate) => sanitizeText(candidate.title || ''));
    return {
        release: {
            ...release,
            catalogProvider: 'musicbrainz',
            catalogProviderLabel: 'MusicBrainz',
            transportProvider: 'youtube',
            transportProviderLabel: 'YouTube',
            title: sanitizeText(release?.title || bestRelease?.title || ''),
            trackCount: Math.max(Number(release?.trackCount || 0) || 0, trackCandidates.length),
            publishedAt: sanitizeText(release?.publishedAt || bestRelease?.date || '')
        },
        trackCandidates
    };
}

function createPendingOnlineMusicTrackFromCatalogCandidate(candidate = {}, options = {}) {
    const release = options.release || {};
    const provider = normalizeOnlineMusicProvider(options.catalogProvider || release.catalogProvider || release.provider || '');
    const providerLabel = sanitizeText(options.catalogProviderLabel || release.catalogProviderLabel || getOnlineMusicProviderLabel(provider));
    const providerTrackId = sanitizeText(candidate?.providerTrackId || candidate?.id || '');
    const fallbackKey = normalizeLyricsLookupText([
        candidate?.artist || release?.artist || '',
        candidate?.releaseTitle || release?.title || '',
        candidate?.title || ''
    ].join(' ')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
    const id = provider && (providerTrackId || fallbackKey)
        ? `${provider}:${providerTrackId || fallbackKey}`
        : sanitizeText(candidate?.id || fallbackKey || generateId());
    return sanitizeStoredOnlineMusicTrack({
        id,
        provider: provider || 'online',
        providerLabel: providerLabel || 'Online',
        providerTrackId,
        title: sanitizeText(candidate?.title || ''),
        artist: sanitizeText(candidate?.artist || release?.artist || ''),
        channelTitle: sanitizeText(candidate?.artist || release?.artist || ''),
        channelId: sanitizeText(release?.channelId || options.channelId || ''),
        cover: candidate?.cover || release?.cover || '',
        duration: Number(candidate?.duration || 0) || 0,
        canonicalUrl: sanitizeText(candidate?.canonicalUrl || ''),
        publishedAt: sanitizeText(candidate?.publishedAt || release?.publishedAt || ''),
        releaseTitle: sanitizeText(candidate?.releaseTitle || release?.title || ''),
        catalogProvider: provider || normalizeOnlineMusicProvider(release?.catalogProvider || release?.provider || ''),
        catalogProviderLabel: providerLabel,
        transportProvider: 'youtube',
        transportProviderLabel: 'YouTube',
        originProvider: provider || normalizeOnlineMusicProvider(release?.originProvider || release?.provider || ''),
        originReleaseId: sanitizeText(release?.originReleaseId || release?.providerReleaseId || release?.playlistId || ''),
        addedAt: Date.now()
    });
}

async function resolveOnlineMusicProviderReleaseTrackCandidates(trackCandidates = [], options = {}) {
    const candidates = (Array.isArray(trackCandidates) ? trackCandidates : []).slice().sort((left, right) => {
        const leftDisc = Number(left?.discNumber || 0) || 0;
        const rightDisc = Number(right?.discNumber || 0) || 0;
        if (leftDisc !== rightDisc) return leftDisc - rightDisc;
        return (Number(left?.trackNumber || 0) || 0) - (Number(right?.trackNumber || 0) || 0);
    });
    const resolvedTracks = [];
    const releaseCatalogProvider = normalizeOnlineMusicProvider(options.release?.catalogProvider || options.release?.provider || '');
    const releaseCatalogProviderLabel = sanitizeText(options.release?.catalogProviderLabel || getOnlineMusicProviderLabel(releaseCatalogProvider || ''));
    const releaseTransportProvider = sanitizeText(options.release?.transportProvider || 'youtube') || 'youtube';
    const releaseTransportProviderLabel = sanitizeText(options.release?.transportProviderLabel || getOnlineMusicProviderLabel(releaseTransportProvider));
    const releaseOriginProvider = sanitizeText(options.release?.originProvider || releaseCatalogProvider || '');
    const releaseOriginId = sanitizeText(options.release?.originReleaseId || options.release?.providerReleaseId || options.release?.playlistId || '');
    if (isOnlineMusicPlaybackResolutionAvailable()) {
        const pendingTracks = uniqueOnlineMusicTracksInDeclaredOrder(candidates
            .map((candidate) => createPendingOnlineMusicTrackFromCatalogCandidate(candidate, {
                release: {
                    ...options.release,
                    catalogProvider: releaseCatalogProvider,
                    catalogProviderLabel: releaseCatalogProviderLabel,
                    transportProvider: releaseTransportProvider,
                    transportProviderLabel: releaseTransportProviderLabel,
                    originProvider: releaseOriginProvider,
                    originReleaseId: releaseOriginId
                },
                channelId: options.channelId || ''
            }))
            .filter(Boolean));
        return {
            tracks: pendingTracks,
            rawItems: candidates,
            declaredTrackCount: candidates.length,
            missingTrackCount: 0
        };
    }
    for (const candidate of candidates) {
        const resolved = await searchOnlineMusicFallbackTrackForPlaylistItem({
            videoId: '',
            title: candidate?.title || '',
            publishedAt: candidate?.publishedAt || options.release?.publishedAt || '',
            position: Number(candidate?.trackNumber || resolvedTracks.length || 0) || 0,
            artist: candidate?.artist || options.release?.artist || '',
            releaseTitle: candidate?.releaseTitle || options.release?.title || '',
            channelId: options.channelId || options.release?.channelId || '',
            channelTitle: options.release?.artist || candidate?.artist || '',
            fallbackAllowed: true
        }, {
            maxResults: options.recoverySearchLimit || 6
        });
        if (!resolved) continue;
        const duration = Math.max(Number(resolved?.duration || 0) || 0, Number(candidate?.duration || 0) || 0);
        resolvedTracks.push({
            ...resolved,
            title: sanitizeText(candidate?.title || resolved?.title || ''),
            artist: sanitizeText(candidate?.artist || resolved?.artist || ''),
            lyricsArtist: sanitizeText(candidate?.artist || resolved?.lyricsArtist || resolved?.artist || ''),
            lyricsTitle: sanitizeText(candidate?.title || resolved?.lyricsTitle || resolved?.title || ''),
            providerTrackId: sanitizeText(candidate?.providerTrackId || candidate?.id || resolved?.providerTrackId || ''),
            canonicalUrl: sanitizeText(candidate?.canonicalUrl || resolved?.canonicalUrl || ''),
            catalogProvider: releaseCatalogProvider || normalizeOnlineMusicProvider(resolved?.catalogProvider || resolved?.provider || ''),
            catalogProviderLabel: releaseCatalogProviderLabel || sanitizeText(resolved?.catalogProviderLabel || resolved?.providerLabel || ''),
            transportProvider: releaseTransportProvider,
            transportProviderLabel: releaseTransportProviderLabel,
            originProvider: releaseOriginProvider || sanitizeText(resolved?.originProvider || resolved?.provider || ''),
            originReleaseId: releaseOriginId || sanitizeText(resolved?.originReleaseId || ''),
            cover: candidate?.cover || options.release?.cover || resolved?.cover || '',
            duration,
            durationLabel: formatTime(duration || 0),
            publishedAt: sanitizeText(candidate?.publishedAt || resolved?.publishedAt || options.release?.publishedAt || '')
        });
    }
    const orderedTracks = uniqueOnlineMusicTracksInDeclaredOrder(resolvedTracks);
    return {
        tracks: orderedTracks,
        rawItems: candidates,
        declaredTrackCount: candidates.length,
        missingTrackCount: Math.max(0, candidates.length - orderedTracks.length)
    };
}

async function fetchOnlineMusicReleaseTracksFromSource(source, release, options = {}) {
    const provider = normalizeOnlineMusicProvider(source?.provider || '');
    if (provider === 'youtube') {
        const resolution = await fetchOnlineMusicTracksFromPlaylist(source.playlistId, {
            maxPages: options.maxPages || 4,
            channelId: release?.channelId || options.channelId || '',
            artist: release?.artist || options.artist || '',
            channelTitle: release?.artist || options.artist || '',
            releaseTitle: release?.title || ''
        });
        return {
            ...resolution,
            release: {
                ...release,
                catalogProvider: 'youtube',
                catalogProviderLabel: 'YouTube',
                transportProvider: 'youtube',
                transportProviderLabel: 'YouTube'
            }
        };
    }
    if (provider === 'itunes') {
        const catalog = await fetchItunesReleaseTrackCandidates(source, release);
        const resolution = await resolveOnlineMusicProviderReleaseTrackCandidates(catalog.trackCandidates, {
            release: catalog.release,
            channelId: release?.channelId || options.channelId || '',
            recoverySearchLimit: options.recoverySearchLimit || 6
        });
        return {
            ...resolution,
            release: catalog.release
        };
    }
    if (provider === 'deezer') {
        const catalog = await fetchDeezerReleaseTrackCandidates(source, release);
        const resolution = await resolveOnlineMusicProviderReleaseTrackCandidates(catalog.trackCandidates, {
            release: catalog.release,
            channelId: release?.channelId || options.channelId || '',
            recoverySearchLimit: options.recoverySearchLimit || 6
        });
        return {
            ...resolution,
            release: catalog.release
        };
    }
    if (provider === 'musicbrainz') {
        const catalog = await fetchMusicBrainzReleaseTrackCandidates(source, release);
        const resolution = await resolveOnlineMusicProviderReleaseTrackCandidates(catalog.trackCandidates, {
            release: catalog.release,
            channelId: release?.channelId || options.channelId || '',
            recoverySearchLimit: options.recoverySearchLimit || 6
        });
        return {
            ...resolution,
            release: catalog.release
        };
    }
    throw new Error('This release provider is not supported yet.');
}

async function loadOnlineMusicReleaseTracks(release, options = {}) {
    const safePlaylistId = buildOnlineMusicReleaseCacheKey(release?.playlistId || '');
    if (!safePlaylistId) throw new Error('This release is missing an id.');
    const cache = getOnlineMusicReleaseTracksCache();
    const existing = cache[safePlaylistId];
    if (existing && (Array.isArray(existing.tracks) || Array.isArray(existing.rawItems))) {
        const declaredCount = Number(existing.declaredTrackCount || existing.release?.declaredTrackCount || existing.release?.trackCount || 0) || 0;
        if ((existing.tracks || []).length || (existing.rawItems || []).length || declaredCount > 0) return existing;
    }
    if (existing?.promise) return existing.promise;

    const promise = (async () => {
        const sources = buildOnlineMusicReleaseSourceList(release);
        if (!sources.length) {
            throw new Error('This release does not expose a supported provider source.');
        }
        let lastError = null;
        let bestEmptyEntry = null;
        for (const source of sources) {
            try {
                const resolution = await fetchOnlineMusicReleaseTracksFromSource(source, release, options);
                const entry = {
                    release: {
                        ...(existing?.release || {}),
                        ...(release || {}),
                        ...(resolution?.release || {}),
                        playlistId: safePlaylistId,
                        provider: source.provider || inferOnlineMusicReleaseProvider(release),
                        providerLabel: getOnlineMusicProviderLabel(source.provider || inferOnlineMusicReleaseProvider(release)),
                        trackCount: Math.max(
                            Number(release?.trackCount || 0) || 0,
                            Number(resolution?.release?.trackCount || 0) || 0,
                            Number(resolution?.declaredTrackCount || 0) || 0
                        ),
                        declaredTrackCount: Number(resolution?.declaredTrackCount || 0) || Number(resolution?.release?.trackCount || 0) || Number(release?.trackCount || 0) || 0,
                        missingTrackCount: Number(resolution?.missingTrackCount || 0) || 0
                    },
                    tracks: Array.isArray(resolution?.tracks) ? resolution.tracks : [],
                    rawItems: Array.isArray(resolution?.rawItems) ? resolution.rawItems : [],
                    declaredTrackCount: Number(resolution?.declaredTrackCount || 0) || 0,
                    missingTrackCount: Number(resolution?.missingTrackCount || 0) || 0,
                    updatedAt: Date.now()
                };
                if ((entry.tracks || []).length) {
                    cache[safePlaylistId] = entry;
                    mergeTracksIntoOnlineMusicArtistCatalog(entry.release.channelId || options.channelId || '', entry.tracks);
                    return entry;
                }
                bestEmptyEntry = entry;
                continue;
            } catch (error) {
                lastError = error;
            }
        }
        if (bestEmptyEntry) {
            cache[safePlaylistId] = bestEmptyEntry;
            return bestEmptyEntry;
        }
        throw lastError || new Error('Unable to load this release right now.');
    })();

    cache[safePlaylistId] = {
        ...(existing || {}),
        release: {
            ...(existing?.release || {}),
            ...(release || {}),
            playlistId: safePlaylistId
        },
        promise
    };
    try {
        const entry = await promise;
        if (cache[safePlaylistId]) delete cache[safePlaylistId].promise;
        return entry;
    } catch (error) {
        if (cache[safePlaylistId]) delete cache[safePlaylistId].promise;
        throw error;
    }
}

async function loadOnlineMusicArtistCatalog(track) {
    const channel = withOnlineMusicCatalogArtistMetadata(await resolveOnlineMusicArtistChannel(track), track);
    const cacheKey = buildOnlineMusicArtistCatalogCacheKey(channel, track);
    const cache = getOnlineMusicArtistCatalogCache();
    const existing = cache[cacheKey] || cache[channel.channelId];
    if (isReusableOnlineMusicArtistCatalog(existing)) {
        return updateOnlineMusicArtistCatalog({
            ...channel,
            ...existing,
            artistCatalogKey: cacheKey,
            catalogArtistName: getOnlineMusicCatalogArtistName(channel, track) || existing.catalogArtistName || '',
            title: existing.title || getOnlineMusicCatalogArtistName(channel, track) || channel.title || ''
        });
    }
    if (existing?.promise) {
        return existing.promise;
    }

    const promise = (async () => {
        const [itunesCatalog, deezerCatalog, musicBrainzCatalog] = await Promise.all([
            fetchItunesArtistCatalog(channel).catch(() => ({ provider: 'itunes', providerLabel: 'iTunes', releases: [] })),
            fetchDeezerArtistCatalog(channel).catch(() => ({ provider: 'deezer', providerLabel: 'Deezer', releases: [] })),
            fetchMusicBrainzArtistCatalog(channel).catch(() => ({ provider: 'musicbrainz', providerLabel: 'MusicBrainz', releases: [] }))
        ]);
        const catalogReleases = mergeUniqueOnlineMusicReleases([
            ...(Array.isArray(itunesCatalog?.releases) ? itunesCatalog.releases : []),
            ...(Array.isArray(deezerCatalog?.releases) ? deezerCatalog.releases : []),
            ...(Array.isArray(musicBrainzCatalog?.releases) ? musicBrainzCatalog.releases : [])
        ]);
        if (catalogReleases.length) {
            return updateOnlineMusicArtistCatalog(buildOnlineMusicArtistCatalog({
                ...channel,
                artistCatalogKey: cacheKey,
                cover: channel.cover || itunesCatalog?.cover || deezerCatalog?.cover || musicBrainzCatalog?.cover || ''
            }, catalogReleases, []));
        }

        const shouldLoadYouTubeArtistData = !isCatalogOnlyOnlineMusicArtistChannel(channel) && sanitizeText(channel.channelId || '');
        let youtubeChannel = channel;
        if (shouldLoadYouTubeArtistData && !sanitizeText(channel.uploadsPlaylistId || '')) {
            try {
                const directItems = await fetchOnlineMusicYouTubeItems('channels', {
                    part: 'snippet,contentDetails,statistics',
                    id: channel.channelId,
                    maxResults: 1
                });
                const directChannel = sanitizeOnlineMusicChannel(directItems[0] || {});
                if (directChannel.channelId) {
                    youtubeChannel = withOnlineMusicCatalogArtistMetadata({
                        ...channel,
                        ...directChannel,
                        title: getOnlineMusicCatalogArtistName(channel) || directChannel.title || channel.title || ''
                    }, track);
                }
            } catch (_) {}
        }
        const [playlistItems, searchedReleases, uploadResolution] = await Promise.all([
            shouldLoadYouTubeArtistData
                ? fetchOnlineMusicYouTubeItems('playlists', {
                    part: 'snippet,contentDetails',
                    channelId: youtubeChannel.channelId,
                    maxResults: 50
                }, { maxPages: 4 }).catch(() => [])
                : Promise.resolve([]),
            shouldLoadYouTubeArtistData
                ? searchOnlineMusicArtistReleasePlaylists(youtubeChannel).catch(() => [])
                : Promise.resolve([]),
            shouldLoadYouTubeArtistData && youtubeChannel.uploadsPlaylistId
                ? fetchOnlineMusicTracksFromPlaylist(youtubeChannel.uploadsPlaylistId, {
                    maxPages: 4,
                    channelId: youtubeChannel.channelId,
                    artist: youtubeChannel.title,
                    channelTitle: youtubeChannel.title
                }).catch(() => ({ tracks: [] }))
                : Promise.resolve({ tracks: [] })
        ]);
        const youtubeReleases = mergeUniqueOnlineMusicReleases([
            ...(playlistItems
                .map((item) => createOnlineMusicReleaseFromPlaylist(item, youtubeChannel))
                .filter(Boolean)),
            ...(Array.isArray(searchedReleases) ? searchedReleases : [])
        ]);
        return updateOnlineMusicArtistCatalog(buildOnlineMusicArtistCatalog({
            ...youtubeChannel,
            artistCatalogKey: cacheKey,
            cover: channel.cover || itunesCatalog?.cover || deezerCatalog?.cover || ''
        }, youtubeReleases, uploadResolution?.tracks || []));
    })();

    cache[cacheKey] = {
        ...(existing || {}),
        ...channel,
        artistCatalogKey: cacheKey,
        promise
    };
    if (channel.channelId) cache[channel.channelId] = cache[cacheKey];
    try {
        const catalog = await promise;
        if (cache[cacheKey]) delete cache[cacheKey].promise;
        if (channel.channelId && cache[channel.channelId]) delete cache[channel.channelId].promise;
        return catalog;
    } catch (error) {
        if (cache[cacheKey]) delete cache[cacheKey].promise;
        if (channel.channelId && cache[channel.channelId]) delete cache[channel.channelId].promise;
        throw error;
    }
}

function primeOnlineMusicArtistReleaseTracks(catalog) {
    const safeCatalog = catalog && typeof catalog === 'object' ? catalog : null;
    if (!safeCatalog?.channelId) return;
    const publicCatalog = getOnlineMusicArtistCatalogForPublicView(safeCatalog);
    const releases = [...(publicCatalog.albums || []), ...(publicCatalog.singlesEps || []), ...(publicCatalog.otherReleases || [])]
        .filter((release) => buildOnlineMusicReleaseSourceList(release)
            .some((source) => {
                const provider = normalizeOnlineMusicProvider(source?.provider || '');
                if (provider === 'youtube') return !!sanitizeText(source?.playlistId || '');
                return ['itunes', 'deezer', 'musicbrainz'].includes(provider)
                    && !!sanitizeText(source?.providerReleaseId || source?.playlistId || '');
            }))
        .slice(0, 12);
    releases.forEach((release) => {
        loadOnlineMusicReleaseTracks(release, {
            channelId: safeCatalog.channelId,
            artist: safeCatalog.title,
            maxPages: 2,
            recoverySearchLimit: 4
        }).then(() => {
            const online = getOnlineMusicState();
            if (online.browserArtist?.channelId === safeCatalog.channelId && state.activeTab === 'online-music' && online.browserView !== 'search') {
                renderOnlineMusicContent();
            }
        }).catch(() => {});
    });
}

async function openOnlineMusicArtistFromTrack(trackId) {
    const track = getOnlineMusicTrack(trackId) || getOnlineMusicCurrentTrack();
    if (!track) {
        showToast('Artist could not be resolved for this track.', 'error');
        return;
    }
    const online = getOnlineMusicState();
    const requestId = Number(online.browserRequestId || 0) + 1;
    online.browserRequestId = requestId;
    online.browserView = 'artist';
    online.browserRelease = null;
    online.browserReleaseStatus = 'idle';
    online.browserReleaseError = '';
    online.browserArtistStatus = 'loading';
    online.browserArtistError = '';
    online.artistWorkSearchQuery = '';
    const initialCatalogArtistName = getOnlineMusicCatalogArtistName({}, track) || sanitizeText(track.artist || track.channelTitle || 'Artist');
    const initialArtistCatalogKey = buildOnlineMusicCatalogArtistChannelId(initialCatalogArtistName) || sanitizeText(track.channelId || '');
    online.browserArtist = {
        channelId: sanitizeText(track.channelId || ''),
        artistCatalogKey: initialArtistCatalogKey,
        catalogArtistName: initialCatalogArtistName,
        title: initialCatalogArtistName,
        description: '',
        cover: track.cover || '',
        uploadsPlaylistId: '',
        albums: [],
        singlesEps: [],
        otherReleases: [],
        allWork: []
    };
    renderOnlineMusicContent();
    updateOnlineMusicFeedback(`Opening ${track.artist || 'artist'}...`, 'info');
    try {
        const catalog = await loadOnlineMusicArtistCatalog(track);
        if (Number(getOnlineMusicState().browserRequestId || 0) !== requestId) return;
        online.browserArtist = catalog;
        online.browserArtistStatus = 'ready';
        online.browserArtistError = '';
        updateOnlineMusicFeedback(`Browsing ${catalog.title}.`, 'success');
        renderOnlineMusicContent();
        primeOnlineMusicArtistReleaseTracks(catalog);
    } catch (error) {
        if (Number(getOnlineMusicState().browserRequestId || 0) !== requestId) return;
        online.browserArtistStatus = 'error';
        online.browserArtistError = error?.message || 'Unable to load this artist right now.';
        updateOnlineMusicFeedback(online.browserArtistError, 'error');
        renderOnlineMusicContent();
    }
}

function openOnlineMusicArtistFromCurrentTrack() {
    const current = getOnlineMusicCurrentTrack();
    if (!current) return;
    openOnlineMusicArtistFromTrack(current.id);
}

async function openOnlineMusicRelease(playlistId) {
    const release = getOnlineMusicArtistRelease(playlistId);
    if (!release) {
        showToast('Release could not be opened.', 'error');
        return;
    }
    const online = getOnlineMusicState();
    const cachedEntry = getOnlineMusicReleaseTracksCache()[release.playlistId] || null;
    const requestId = Number(online.browserRequestId || 0) + 1;
    online.browserRequestId = requestId;
    online.browserView = 'release';
    online.browserReleaseStatus = 'loading';
    online.browserReleaseError = '';
    online.browserRelease = {
        ...(cachedEntry?.release || {}),
        ...release,
        tracks: Array.isArray(cachedEntry?.tracks)
            ? cachedEntry.tracks.slice()
            : []
    };
    renderOnlineMusicContent();
    try {
        const entry = await loadOnlineMusicReleaseTracks(release, {
            channelId: release.channelId || online.browserArtist?.channelId || '',
            artist: release.artist || online.browserArtist?.title || ''
        });
        if (Number(getOnlineMusicState().browserRequestId || 0) !== requestId) return;
        online.browserRelease = {
            ...(entry.release || release),
            tracks: entry.tracks || []
        };
        online.browserReleaseStatus = 'ready';
        online.browserReleaseError = '';
        updateOnlineMusicFeedback(`Opened "${release.title}".`, 'success');
        renderOnlineMusicContent();
    } catch (error) {
        if (Number(getOnlineMusicState().browserRequestId || 0) !== requestId) return;
        online.browserReleaseStatus = 'error';
        online.browserReleaseError = error?.message || 'Unable to load this release right now.';
        updateOnlineMusicFeedback(online.browserReleaseError, 'error');
        renderOnlineMusicContent();
    }
}

function returnToOnlineMusicSearch() {
    const online = getOnlineMusicState();
    online.browserView = 'search';
    online.browserRelease = null;
    online.browserReleaseStatus = 'idle';
    online.browserReleaseError = '';
    renderOnlineMusicContent();
}

function returnToOnlineMusicArtist() {
    const online = getOnlineMusicState();
    if (!online.browserArtist) {
        returnToOnlineMusicSearch();
        return;
    }
    online.browserView = 'artist';
    online.browserRelease = null;
    online.browserReleaseStatus = 'idle';
    online.browserReleaseError = '';
    renderOnlineMusicContent();
}

function setOnlineMusicArtistWorkSortMode(value = '') {
    const online = getOnlineMusicState();
    const nextMode = normalizeOnlineMusicArtistWorkSortMode(value || '');
    online.artistWorkSortMode = nextMode;
    persistOnlineMusicState();
    if (state.activeTab === 'online-music') renderOnlineMusicContent();
    return nextMode;
}

function scheduleOnlineMusicArtistWorkSearchRender() {
    if (onlineMusicArtistWorkSearchRenderTimer) {
        window.clearTimeout(onlineMusicArtistWorkSearchRenderTimer);
    }
    onlineMusicArtistWorkSearchRenderTimer = window.setTimeout(() => {
        onlineMusicArtistWorkSearchRenderTimer = null;
        persistOnlineMusicState();
        if (state.activeTab === 'online-music' && getOnlineMusicState().browserView === 'artist') {
            renderOnlineMusicContent({ restoreArtistWorkSearchFocus: true });
        }
    }, 90);
}

function sanitizeOnlineMusicArtistWorkSearchInput(value = '') {
    return String(value || '').replace(/[<>]/g, '');
}

function setOnlineMusicArtistWorkSearchQuery(value = '', options = {}) {
    const online = getOnlineMusicState();
    const nextQuery = sanitizeOnlineMusicArtistWorkSearchInput(value || '');
    online.artistWorkSearchQuery = nextQuery;
    if (options.immediate) {
        if (onlineMusicArtistWorkSearchRenderTimer) {
            window.clearTimeout(onlineMusicArtistWorkSearchRenderTimer);
            onlineMusicArtistWorkSearchRenderTimer = null;
        }
        persistOnlineMusicState();
        if (state.activeTab === 'online-music') renderOnlineMusicContent({ restoreArtistWorkSearchFocus: !!options.restoreFocus });
    } else {
        scheduleOnlineMusicArtistWorkSearchRender();
    }
    return nextQuery;
}

function clearOnlineMusicArtistWorkSearchQuery() {
    setOnlineMusicArtistWorkSearchQuery('', { immediate: true, restoreFocus: true });
}

function handleOnlineMusicContentInput(event) {
    const searchInput = event.target?.closest?.('[data-online-music-artist-work-search]');
    if (!searchInput) return;
    setOnlineMusicArtistWorkSearchQuery(searchInput.value || '');
}

function handleOnlineMusicContentChange(event) {
    const sortSelect = event.target?.closest?.('[data-online-music-artist-sort-select]');
    if (!sortSelect) return;
    setOnlineMusicArtistWorkSortMode(sortSelect.value || '');
}

function renderOnlineMusicReleaseCardsLegacy(releases = []) {
    const list = Array.isArray(releases) ? releases : [];
    if (!list.length) {
        return '<div class="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-gray-500">No releases available here yet.</div>';
    }
    return `<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">${list.map((release) => `
        <button type="button" data-online-music-action="open-release" data-playlist-id="${escapeHtml(release.playlistId)}" class="rounded-2xl border border-white/10 bg-black/30 p-4 text-left transition hover:border-cyan-400/40 hover:bg-white/5">
            <div class="flex items-start gap-3">
                <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                    ${release.cover
                        ? `<img src="${release.cover}" alt="${escapeHtml(release.title)}" class="h-full w-full object-cover">`
                        : `<div class="flex h-full w-full items-center justify-center text-gray-500"><i data-lucide="disc-3" class="h-5 w-5"></i></div>`}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-black text-white">${escapeHtml(release.title)}</div>
                    <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(release.trackCount || 0)} tracks${release.publishedAt ? ` Ã‚Â· ${escapeHtml((release.publishedAt || '').slice(0, 4))}` : ''}</div>
                </div>
            </div>
        </button>
    `).join('')}</div>`;
}

function renderOnlineMusicTrackRowsLegacy(tracks, options = {}) {
    const online = getOnlineMusicState();
    const canDownloadTracks = isDesktopRuntimeAvailable();
    const opts = {
        context: normalizeOnlineMusicPlaybackContext(options.context || getOnlineMusicActiveViewContext()),
        showArtistButton: options.showArtistButton !== false,
        ...options
    };
    const downloadingIds = new Set(online.downloadingTrackIds || []);
    return tracks.map((track) => {
        const inLibrary = !!getSavedOnlineTrack(track.id);
        const duration = track.durationLabel || formatTime(track.duration || 0);
        const isCurrent = online.currentTrackId === track.id;
        const isConnecting = normalizeOnlineMusicTrackId(online.connectingTrackId || '') === normalizeOnlineMusicTrackId(track.id || '');
        const isDownloading = downloadingIds.has(track.id);
        const downloadDisabled = isDownloading || !canDownloadTracks;
        const downloadLabel = isDownloading ? 'Downloading...' : (canDownloadTracks ? 'Download MP3' : 'Desktop Only');
        return `
            <div data-online-music-track-row="${track.id}" class="video-link-row rounded-2xl px-4 py-4 ${isCurrent ? 'ring-1 ring-cyan-400/40' : ''}">
                <div class="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        <div class="w-14 h-14 rounded-xl overflow-hidden bg-black/50 shrink-0 ring-1 ring-white/10">
                            ${track.cover
                                ? `<img src="${track.cover}" alt="${escapeHtml(track.title)}" class="w-full h-full object-cover">`
                                : `<div class="w-full h-full flex items-center justify-center text-gray-500"><i data-lucide="disc-3" class="w-5 h-5"></i></div>`}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-sm font-bold text-white truncate">${escapeHtml(track.title)}</h3>
                                ${inLibrary ? '<span class="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">In Library</span>' : '<span class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">Streaming</span>'}
                                <span data-online-music-now-playing-badge class="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300 ${isCurrent ? '' : 'hidden'}">Now Playing</span>
                            </div>
                            ${opts.showArtistButton
                                ? `<button type="button" data-online-music-action="open-artist" data-track-id="${track.id}" class="truncate text-left text-xs font-mono text-cyan-200 transition hover:text-white">${escapeHtml(track.artist || track.channelTitle || 'YouTube')}</button>`
                                : `<p class="text-xs text-gray-400 truncate">${escapeHtml(track.artist || track.channelTitle || 'YouTube')}</p>`}
                            <p class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(duration)} Â· Added tracks appear in Library, Favorites, and Playlists.</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" data-online-music-action="play-track" data-track-id="${track.id}" data-playback-context="${opts.context}" ${isConnecting ? 'disabled' : ''} class="px-3 py-2 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-[0.16em] ${isConnecting ? 'cursor-wait opacity-80' : 'hover:scale-[1.02] transition-transform'}">${isConnecting ? 'Connecting...' : (isCurrent && online.isPlaying ? 'Playing' : 'Play')}</button>
                        <button type="button" data-online-music-action="save-track" data-track-id="${track.id}" data-playback-context="${opts.context}" ${inLibrary ? 'disabled' : ''} class="px-3 py-2 rounded-xl border border-white/10 text-[11px] font-bold uppercase tracking-[0.16em] ${inLibrary ? 'text-cyan-300 border-cyan-400/30 bg-cyan-500/10 cursor-default' : 'text-gray-200 hover:bg-white/10'}">${inLibrary ? 'Added' : 'Add To Library'}</button>
                        <button type="button" data-online-music-action="download-track" data-track-id="${track.id}" data-playback-context="${opts.context}" ${downloadDisabled ? 'disabled' : ''} title="${canDownloadTracks ? 'Download MP3 copy in the desktop app.' : 'Desktop app required for MP3 downloads.'}" class="px-3 py-2 rounded-xl border border-white/10 text-[11px] font-bold uppercase tracking-[0.16em] ${isDownloading ? 'text-amber-200 border-amber-400/30 bg-amber-500/10 cursor-wait' : (canDownloadTracks ? 'text-gray-200 hover:bg-white/10' : 'cursor-not-allowed border-white/5 bg-black/30 text-gray-500 opacity-70')}">${escapeHtml(downloadLabel)}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderOnlineMusicSearchViewLegacy() {
    const online = getOnlineMusicState();
    const results = online.searchResults || [];
    const savedCount = results.filter((track) => !!getSavedOnlineTrack(track.id)).length;
    return `
        <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div class="text-sm text-gray-200">${online.searchQuery ? `Results for "${escapeHtml(online.searchQuery)}"` : 'Search results'}</div>
                    <div class="text-xs text-gray-500">Click an artist name to browse Albums, Singles &amp; EPs, and All Work without leaving Online Music.</div>
                </div>
                <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500">${results.length} tracks${savedCount ? ` Ã‚Â· ${savedCount} added` : ''}</div>
            </div>
        </div>
        ${results.length
            ? `<div class="space-y-3">${renderOnlineMusicTrackRows(results, { context: 'search' })}</div>`
            : '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-gray-400">Run a search to pull in YouTube music results.</div>'}
    `;
}

function renderOnlineMusicArtistViewLegacy() {
    const online = getOnlineMusicState();
    const artist = online.browserArtist;
    const status = sanitizeText(online.browserArtistStatus || 'idle');
    const errorMessage = sanitizeText(online.browserArtistError || '');
    if (!artist) {
        return '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">Choose an artist from Online Music search results first.</div>';
    }
    const sortMode = normalizeOnlineMusicArtistWorkSortMode(online.artistWorkSortMode || 'best');
    const sortedAlbums = sortOnlineMusicArtistReleasesForView(artist.albums || [], sortMode);
    const sortedSinglesEps = sortOnlineMusicArtistReleasesForView(artist.singlesEps || [], sortMode);
    const sortedOtherReleases = sortOnlineMusicArtistReleasesForView(artist.otherReleases || [], sortMode);
    const sortedAllWork = sortOnlineMusicArtistTracksForView(artist.allWork || [], sortMode);
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="flex items-start gap-4 min-w-0">
                        <div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                            ${artist.cover
                                ? `<img src="${artist.cover}" alt="${escapeHtml(artist.title)}" class="h-full w-full object-cover">`
                                : `<div class="flex h-full w-full items-center justify-center text-gray-500"><i data-lucide="radio" class="h-6 w-6"></i></div>`}
                        </div>
                        <div class="min-w-0">
                            <button type="button" data-online-music-action="back-to-search" class="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80 transition hover:text-white">Back To Search</button>
                            <div class="truncate text-2xl font-black text-white">${escapeHtml(artist.title || 'Artist')}</div>
                            <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml((artist.albums || []).length)} albums Ã‚Â· ${escapeHtml((artist.singlesEps || []).length)} singles / eps Ã‚Â· ${escapeHtml((artist.allWork || []).length)} tracks</div>
                            <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">${escapeHtml(artist.description || 'Browse official release playlists or play anything from the artist catalog below.')}</p>
                        </div>
                    </div>
                    <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500">${status === 'loading' ? 'Loading artist catalog' : 'Artist browser'}</div>
                </div>
            </div>
            ${status === 'error'
                ? `<div class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">${escapeHtml(errorMessage || 'Unable to load this artist right now.')}</div>`
                : ''}
            ${status === 'loading' && !(artist.albums || []).length && !(artist.singlesEps || []).length && !(artist.allWork || []).length
                ? '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">Loading artist releases and catalog...</div>'
                : `
                    <div class="space-y-4">
                        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div class="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">Albums</div>
                            ${renderOnlineMusicReleaseCards(artist.albums || [])}
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div class="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">Singles &amp; EPs</div>
                            ${renderOnlineMusicReleaseCards(artist.singlesEps || [])}
                        </div>
                        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">All Work</div>
                                    <div class="mt-1 text-xs text-gray-500">Tracks discovered from the artist uploads channel and matched release playlists.</div>
                                </div>
                                <div class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml((artist.allWork || []).length)} tracks</div>
                            </div>
                            ${(artist.allWork || []).length
                                ? `<div class="space-y-3">${renderOnlineMusicTrackRows(artist.allWork || [], { context: 'artist' })}</div>`
                                : '<div class="text-sm text-gray-400">No embeddable tracks were found yet for this artist.</div>'}
                        </div>
                    </div>
                `}
        </div>
    `;
}

function renderOnlineMusicReleaseViewLegacy() {
    const online = getOnlineMusicState();
    const release = online.browserRelease;
    const errorMessage = sanitizeText(online.browserReleaseError || '');
    if (!release) {
        return '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">Open a release from the artist page first.</div>';
    }
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="flex items-start gap-4 min-w-0">
                        <div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                            ${release.cover
                                ? `<img src="${release.cover}" alt="${escapeHtml(release.title)}" class="h-full w-full object-cover">`
                                : `<div class="flex h-full w-full items-center justify-center text-gray-500"><i data-lucide="disc-3" class="h-6 w-6"></i></div>`}
                        </div>
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300/80">
                                <button type="button" data-online-music-action="back-to-search" class="transition hover:text-white">Search</button>
                                <span class="text-gray-600">/</span>
                                <button type="button" data-online-music-action="back-to-artist" class="transition hover:text-white">${escapeHtml(online.browserArtist?.title || release.artist || 'Artist')}</button>
                            </div>
                            <div class="mt-3 truncate text-2xl font-black text-white">${escapeHtml(release.title || 'Release')}</div>
                            <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(release.trackCount || 0)} tracks${release.publishedAt ? ` Ã‚Â· ${escapeHtml((release.publishedAt || '').slice(0, 4))}` : ''}</div>
                            <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">${escapeHtml(release.description || 'Play any track here, or jump back to the artist page to browse more releases.')}</p>
                        </div>
                    </div>
                    <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500">${online.browserReleaseStatus === 'loading' ? 'Loading release' : 'Release view'}</div>
                </div>
            </div>
            ${online.browserReleaseStatus === 'error'
                ? `<div class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">${escapeHtml(errorMessage || 'Unable to load this release right now.')}</div>`
                : ''}
            ${online.browserReleaseStatus === 'loading' && !(release.tracks || []).length
                ? '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">Loading release tracks...</div>'
                : ((release.tracks || []).length
                    ? `<div class="space-y-3">${renderOnlineMusicTrackRows(release.tracks || [], { context: 'release' })}</div>`
                    : '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">No embeddable tracks were found for this release.</div>')}
        </div>
    `;
}

function renderOnlineMusicContentLegacy() {
    const online = getOnlineMusicState();
    const container = document.getElementById('online-music-content');
    const searchInput = document.getElementById('online-music-search-input');
    if (!container) return;
    if (searchInput) searchInput.value = online.searchQuery || '';
    syncOnlineMusicPlayerCard();
    let nextBody = renderOnlineMusicSearchView();
    if (online.browserView === 'artist') {
        nextBody = renderOnlineMusicArtistView();
    } else if (online.browserView === 'release') {
        nextBody = renderOnlineMusicReleaseView();
    }
    container.innerHTML = nextBody;
    refreshLucideIcons();
    return;
    const results = online.searchResults || [];
    const savedCount = results.filter((track) => !!getSavedOnlineTrack(track.id)).length;
    const body = `
        <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div class="text-sm text-gray-200">${online.searchQuery ? `Results for "${escapeHtml(online.searchQuery)}"` : 'Search results'}</div>
                    <div class="text-xs text-gray-500">Saved streaming tracks show up in the main Library, Favorites, Playlists, and queue views automatically.</div>
                </div>
                <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500">${results.length} tracks${savedCount ? ` Â· ${savedCount} added` : ''}</div>
            </div>
        </div>
        ${results.length
            ? `<div class="space-y-3">${renderOnlineMusicTrackRows(results)}</div>`
            : '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-gray-400">Run a search to pull in YouTube music results.</div>'}
    `;

    container.innerHTML = body;
    refreshLucideIcons();
}

function renderOnlineMusicReleaseCards(releases = []) {
    const list = Array.isArray(releases) ? releases : [];
    if (!list.length) {
        return '<div class="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-gray-500">No releases available here yet.</div>';
    }
    return `<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">${list.map((release) => `
        <button type="button" data-online-music-action="open-release" data-playlist-id="${escapeHtml(release.playlistId)}" class="rounded-2xl border border-white/10 bg-black/30 p-4 text-left transition hover:border-cyan-400/40 hover:bg-white/5">
            <div class="flex items-start gap-3">
                <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                    ${release.cover
                        ? `<img src="${release.cover}" alt="${escapeHtml(release.title)}" class="h-full w-full object-cover">`
                        : `<div class="flex h-full w-full items-center justify-center text-gray-500"><i data-lucide="disc-3" class="h-5 w-5"></i></div>`}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-black text-white">${escapeHtml(release.title)}</div>
                    <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(release.trackCount || 0)} tracks${release.publishedAt ? ` | ${escapeHtml((release.publishedAt || '').slice(0, 4))}` : ''}</div>
                </div>
            </div>
        </button>
    `).join('')}</div>`;
}

function renderOnlineMusicTrackRows(tracks, options = {}) {
    const online = getOnlineMusicState();
    const canDownloadTracks = isDesktopRuntimeAvailable();
    const opts = {
        context: normalizeOnlineMusicPlaybackContext(options.context || getOnlineMusicActiveViewContext()),
        showArtistButton: options.showArtistButton !== false,
        ...options
    };
    const downloadingIds = new Set(online.downloadingTrackIds || []);
    return tracks.map((track) => {
        const inLibrary = !!getSavedOnlineTrack(track.id);
        const duration = track.durationLabel || formatTime(track.duration || 0);
        const isCurrent = online.currentTrackId === track.id;
        const isConnecting = normalizeOnlineMusicTrackId(online.connectingTrackId || '') === normalizeOnlineMusicTrackId(track.id || '');
        const isDownloading = downloadingIds.has(track.id);
        const downloadDisabled = isDownloading || !canDownloadTracks;
        const canResolveTrack = canResolveOnlineMusicTrackOnCurrentRuntime(track);
        const canQueueTrack = !track.pendingPlaybackResolution || canResolveTrack;
        const transportLabel = sanitizeText(track.transportProviderLabel || (track.videoId ? 'YouTube' : 'Resolve On Play'));
        const playbackLabel = track.pendingPlaybackResolution
            ? (canResolveTrack ? 'Resolve On Play' : 'Desktop Resolve')
            : (transportLabel || 'YouTube');
        const playLabel = isConnecting
            ? 'Connecting...'
            : (!canQueueTrack
                ? 'Desktop Only'
                : (track.pendingPlaybackResolution && !(isCurrent && online.isPlaying)
                    ? 'Resolve + Play'
                    : (isCurrent && online.isPlaying ? 'Playing' : 'Play')));
        const downloadLabel = isDownloading ? 'Downloading...' : (canDownloadTracks ? 'Download MP3' : 'Desktop Only');
        const playButtonTitle = !canQueueTrack
            ? getOnlineMusicPlaybackResolutionUnavailableMessage('track')
            : (track.pendingPlaybackResolution ? 'Resolve this track for playback and start playing.' : 'Play this track.');
        const queueButtonTitle = !canQueueTrack
            ? getOnlineMusicPlaybackResolutionUnavailableMessage('track')
            : 'Add this track to the end of the queue.';
        return `
            <div data-online-music-track-row="${track.id}" class="video-link-row rounded-2xl px-4 py-4 ${isCurrent ? 'ring-1 ring-cyan-400/40' : ''}">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div class="flex min-w-0 flex-1 items-center gap-3">
                        <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black/50 ring-1 ring-white/10">
                            ${track.cover
                                ? `<img src="${track.cover}" alt="${escapeHtml(track.title)}" class="h-full w-full object-cover">`
                                : `<div class="flex h-full w-full items-center justify-center text-gray-500"><i data-lucide="disc-3" class="h-5 w-5"></i></div>`}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="truncate text-sm font-bold text-white">${escapeHtml(track.title)}</h3>
                                ${inLibrary ? '<span class="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">In Library</span>' : '<span class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">Streaming</span>'}
                                ${track.pendingPlaybackResolution ? `<span class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">${escapeHtml(playbackLabel)}</span>` : `<span class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">${escapeHtml(transportLabel)}</span>`}
                                <span data-online-music-now-playing-badge class="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300 ${isCurrent ? '' : 'hidden'}">Now Playing</span>
                            </div>
                            ${opts.showArtistButton
                                ? `<button type="button" data-online-music-action="open-artist" data-track-id="${track.id}" class="truncate text-left text-xs font-mono text-cyan-200 transition hover:text-white">${escapeHtml(track.artist || track.channelTitle || 'YouTube')}</button>`
                                : `<p class="truncate text-xs text-gray-400">${escapeHtml(track.artist || track.channelTitle || 'YouTube')}</p>`}
                            <p class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(duration)}${playbackLabel ? ` | ${escapeHtml(playbackLabel)}` : ''}</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" data-online-music-action="play-track" data-track-id="${track.id}" data-playback-context="${opts.context}" ${isConnecting || !canQueueTrack ? 'disabled' : ''} title="${escapeHtml(playButtonTitle)}" class="rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${isConnecting ? 'bg-white text-black cursor-wait opacity-80' : (canQueueTrack ? 'bg-white text-black transition-transform hover:scale-[1.02]' : 'cursor-not-allowed border border-white/5 bg-black/30 text-gray-500 opacity-70')}">${escapeHtml(playLabel)}</button>

                        <button type="button" data-online-music-action="add-to-end" data-track-id="${track.id}" data-playback-context="${opts.context}" ${!canQueueTrack ? 'disabled' : ''} title="${escapeHtml(queueButtonTitle)}" class="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] ${canQueueTrack ? 'text-gray-200 hover:bg-white/10' : 'cursor-not-allowed border-white/5 bg-black/30 text-gray-500 opacity-70'}">Add To End</button>
                        <button type="button" data-online-music-action="save-track" data-track-id="${track.id}" data-playback-context="${opts.context}" ${inLibrary ? 'disabled' : ''} class="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] ${inLibrary ? 'cursor-default border-cyan-400/30 bg-cyan-500/10 text-cyan-300' : 'text-gray-200 hover:bg-white/10'}">${inLibrary ? 'Added' : 'Add To Library'}</button>
                        <button type="button" data-online-music-action="download-track" data-track-id="${track.id}" data-playback-context="${opts.context}" ${downloadDisabled ? 'disabled' : ''} title="${canDownloadTracks ? 'Download MP3 copy in the desktop app.' : 'Desktop app required for MP3 downloads.'}" class="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] ${isDownloading ? 'cursor-wait border-amber-400/30 bg-amber-500/10 text-amber-200' : (canDownloadTracks ? 'text-gray-200 hover:bg-white/10' : 'cursor-not-allowed border-white/5 bg-black/30 text-gray-500 opacity-70')}">${escapeHtml(downloadLabel)}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderOnlineMusicSearchView() {
    const online = getOnlineMusicState();
    const results = (online.searchResults || [])
        .filter((track) => shouldIncludeOnlineMusicSearchResult(track, { query: online.searchQuery || '' }));
    const savedCount = results.filter((track) => !!getSavedOnlineTrack(track.id)).length;
    const downloadPanel = renderOnlineMusicDownloadJobsPanel();
    const importReviewPanel = renderOnlineMusicImportReviewPanel();
    const sourceDescription = 'Search results are filtered for music playback. Saved tracks show up in Library, Favorites, and Playlists.';
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div class="text-sm text-gray-200">${online.searchQuery ? `Results for "${escapeHtml(online.searchQuery)}"` : 'Search results'}</div>
                        <div class="text-xs text-gray-500">${escapeHtml(sourceDescription)}</div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 md:justify-end">
                        ${renderOnlineMusicRuntimeBadge()}
                        ${renderOnlineMusicRuntimeBadge('downloads')}
                        <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500">${results.length} tracks${savedCount ? ` | ${savedCount} added` : ''}</div>
                    </div>
                </div>
            </div>
            ${downloadPanel || importReviewPanel
                ? `<div class="space-y-4">${downloadPanel}${importReviewPanel}</div>`
                : ''}
            ${results.length
                ? `<div class="space-y-3">${renderOnlineMusicTrackRows(results, { context: 'search' })}</div>`
                : '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-gray-400">Run a search to pull in streaming results when available.</div>'}
        </div>
    `;
}

function renderOnlineMusicArtistLoadingSkeleton() {
    const cards = Array.from({ length: 6 }).map(() => `
        <div class="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div class="flex items-start gap-3">
                <div class="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-white/10"></div>
                <div class="min-w-0 flex-1 space-y-2 pt-1">
                    <div class="h-3 w-2/3 animate-pulse rounded-full bg-white/10"></div>
                    <div class="h-2 w-1/3 animate-pulse rounded-full bg-white/5"></div>
                </div>
            </div>
        </div>
    `).join('');
    return `
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
            <div class="mb-3 h-3 w-20 animate-pulse rounded-full bg-cyan-300/20"></div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">${cards}</div>
        </div>
    `;
}

function renderOnlineMusicArtistWorkSearchControl(searchQuery = '') {
    const safeQuery = sanitizeOnlineMusicArtistWorkSearchInput(searchQuery || '');
    return `
        <label class="block w-80 max-w-full shrink-0" style="width: 20rem; max-width: 100%; flex-shrink: 0;">
            <span class="relative block">
                <i data-lucide="search" class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/70" style="left: 1rem;"></i>
                <input
                    id="online-music-artist-work-search-input"
                    data-online-music-artist-work-search="true"
                    type="search"
                    aria-label="Search artist work"
                    value="${escapeHtml(safeQuery)}"
                    autocomplete="off"
                    placeholder="Search songs, albums, singles..."
                    class="h-12 w-full rounded-xl border border-white/10 bg-black/50 pl-12 pr-11 text-xs font-bold text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-400/60 focus:bg-black/70"
                    style="padding-left: 3rem; padding-right: 2.75rem;"
                >
                ${safeQuery
                    ? `<button type="button" data-online-music-action="clear-artist-work-search" aria-label="Clear artist search" class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white/10 hover:text-white" style="right: 0.5rem;"><i data-lucide="x" class="h-4 w-4"></i></button>`
                    : ''}
            </span>
        </label>
    `;
}

function renderOnlineMusicArtistReleaseSection(title = '', releases = [], options = {}) {
    const list = Array.isArray(releases) ? releases : [];
    const shouldRender = options.alwaysShow !== false || list.length;
    if (!shouldRender) return '';
    return `
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
            <div class="mb-3 flex items-center justify-between gap-3">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">${escapeHtml(title)}</div>
                ${options.showCount ? `<div class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(list.length)} match${list.length === 1 ? '' : 'es'}</div>` : ''}
            </div>
            ${renderOnlineMusicReleaseCards(list)}
        </div>
    `;
}

function renderOnlineMusicArtistView() {
    const online = getOnlineMusicState();
    const artist = online.browserArtist;
    const status = sanitizeText(online.browserArtistStatus || 'idle');
    const errorMessage = sanitizeText(online.browserArtistError || '');
    if (!artist) {
        return '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">Choose an artist from Online Music search results first.</div>';
    }
    const publicArtist = getOnlineMusicArtistCatalogForPublicView(artist);
    const sortMode = normalizeOnlineMusicArtistWorkSortMode(online.artistWorkSortMode || 'best');
    const sortedAlbums = sortOnlineMusicArtistReleasesForView(publicArtist.albums || [], sortMode);
    const sortedSinglesEps = sortOnlineMusicArtistReleasesForView(publicArtist.singlesEps || [], sortMode);
    const sortedOtherReleases = sortOnlineMusicArtistReleasesForView(publicArtist.otherReleases || [], sortMode);
    const artistTrackPool = getOnlineMusicArtistTrackSearchPool(publicArtist);
    const sortedAllWork = sortOnlineMusicArtistTracksForView(artistTrackPool, sortMode);
    const artistSearchQuery = sanitizeOnlineMusicArtistWorkSearchInput(online.artistWorkSearchQuery || '');
    const hasArtistSearchQuery = !!normalizeOnlineMusicArtistWorkSearchQuery(artistSearchQuery);
    const filteredAlbums = filterOnlineMusicArtistReleasesForSearch(sortedAlbums, artistSearchQuery);
    const filteredSinglesEps = filterOnlineMusicArtistReleasesForSearch(sortedSinglesEps, artistSearchQuery);
    const filteredOtherReleases = filterOnlineMusicArtistReleasesForSearch(sortedOtherReleases, artistSearchQuery);
    const filteredAllWork = filterOnlineMusicArtistTracksForSearch(sortedAllWork, artistSearchQuery);
    const matchCount = filteredAlbums.length + filteredSinglesEps.length + filteredOtherReleases.length + filteredAllWork.length;
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="flex min-w-0 items-start gap-4">
                        <div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                            ${artist.cover
                                ? `<img src="${artist.cover}" alt="${escapeHtml(artist.title)}" class="h-full w-full object-cover">`
                                : `<div class="flex h-full w-full items-center justify-center text-gray-500"><i data-lucide="radio" class="h-6 w-6"></i></div>`}
                        </div>
                        <div class="min-w-0">
                            <button type="button" data-online-music-action="back-to-search" class="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80 transition hover:text-white">Back To Search</button>
                            <div class="truncate text-2xl font-black text-white">${escapeHtml(artist.title || 'Artist')}</div>
                            <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml((publicArtist.albums || []).length)} albums | ${escapeHtml((publicArtist.singlesEps || []).length)} singles / eps${(publicArtist.otherReleases || []).length ? ` | ${escapeHtml((publicArtist.otherReleases || []).length)} other releases` : ''} | ${escapeHtml(artistTrackPool.length)} tracks</div>
                            <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">${escapeHtml(artist.description || 'Browse official release playlists or play anything from the artist catalog below.')}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-start gap-2 md:items-end">
                        <div class="flex flex-wrap items-center gap-2 md:justify-end">
                            ${renderOnlineMusicRuntimeBadge()}
                            ${renderOnlineMusicRuntimeBadge('downloads')}
                            <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500">${status === 'loading' ? 'Loading artist catalog' : 'Artist browser'}</div>
                        </div>
                        <div class="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center md:w-auto md:justify-end">
                            ${renderOnlineMusicArtistWorkSearchControl(artistSearchQuery)}
                            ${renderOnlineMusicArtistWorkSortControl(sortMode)}
                        </div>
                    </div>
                </div>
            </div>
            ${status === 'error'
                ? `<div class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">${escapeHtml(errorMessage || 'Unable to load this artist right now.')}</div>`
                : ''}
            ${status === 'loading' && !hasOnlineMusicArtistCatalogContent(artist)
                ? renderOnlineMusicArtistLoadingSkeleton()
                : `
                    <div class="space-y-4">
                        ${hasArtistSearchQuery
                            ? `<div class="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">Showing ${escapeHtml(matchCount)} artist result${matchCount === 1 ? '' : 's'} for "${escapeHtml(artistSearchQuery)}".</div>`
                            : ''}
                        ${renderOnlineMusicArtistReleaseSection('Albums', filteredAlbums, { alwaysShow: !hasArtistSearchQuery, showCount: hasArtistSearchQuery })}
                        ${renderOnlineMusicArtistReleaseSection('Singles & EPs', filteredSinglesEps, { alwaysShow: !hasArtistSearchQuery, showCount: hasArtistSearchQuery })}
                        ${renderOnlineMusicArtistReleaseSection('Other Releases', filteredOtherReleases, { alwaysShow: !hasArtistSearchQuery && (publicArtist.otherReleases || []).length > 0, showCount: hasArtistSearchQuery })}
                        ${(!hasArtistSearchQuery || filteredAllWork.length)
                            ? `<div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">Songs</div>
                                    <div class="mt-1 text-xs text-gray-500">Songs discovered from artist releases and playable matches.</div>
                                </div>
                                <div class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(filteredAllWork.length)} song${filteredAllWork.length === 1 ? '' : 's'}</div>
                            </div>
                            ${filteredAllWork.length
                                ? `<div class="space-y-3">${renderOnlineMusicTrackRows(filteredAllWork, { context: 'artist' })}</div>`
                                : '<div class="text-sm text-gray-400">No embeddable songs were found yet for this artist.</div>'}
                        </div>`
                            : ''}
                        ${hasArtistSearchQuery && !matchCount
                            ? `<div class="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-gray-400">No songs, albums, singles, or releases matched "${escapeHtml(artistSearchQuery)}".</div>`
                            : ''}
                    </div>
                `}
        </div>
    `;
}

function renderOnlineMusicReleaseView() {
    const online = getOnlineMusicState();
    const release = online.browserRelease;
    const errorMessage = sanitizeText(online.browserReleaseError || '');
    const isDesktopRuntime = isDesktopRuntimeAvailable();
    if (!release) {
        return '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">Open a release from the artist page first.</div>';
    }
    const releaseTracks = Array.isArray(release.tracks) ? release.tracks : [];
    const availableTrackCount = releaseTracks.length;
    const canStartReleasePlayback = hasResolvableOnlineMusicTrackInCollection(releaseTracks);
    const declaredTrackCount = Math.max(Number(release.declaredTrackCount || 0) || 0, Number(release.trackCount || 0) || 0, availableTrackCount);
    const missingTrackCount = Math.max(Number(release.missingTrackCount || 0) || 0, declaredTrackCount - availableTrackCount);
    const isAlbumLike = release.kind === 'album';
    const playLabel = isAlbumLike ? 'Play Album' : 'Play Release';
    const shuffleLabel = isAlbumLike ? 'Shuffle Album' : 'Shuffle Release';
    const availabilityLabel = missingTrackCount > 0 && declaredTrackCount > 0
        ? `${availableTrackCount} of ${declaredTrackCount} available`
        : `${declaredTrackCount || availableTrackCount} tracks`;
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="flex min-w-0 items-start gap-4">
                        <div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                            ${release.cover
                                ? `<img src="${release.cover}" alt="${escapeHtml(release.title)}" class="h-full w-full object-cover">`
                                : `<div class="flex h-full w-full items-center justify-center text-gray-500"><i data-lucide="disc-3" class="h-6 w-6"></i></div>`}
                        </div>
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300/80">
                                <button type="button" data-online-music-action="back-to-search" class="transition hover:text-white">Search</button>
                                <span class="text-gray-600">/</span>
                                <button type="button" data-online-music-action="back-to-artist" class="transition hover:text-white">${escapeHtml(online.browserArtist?.title || release.artist || 'Artist')}</button>
                            </div>
                            <div class="mt-3 truncate text-2xl font-black text-white">${escapeHtml(release.title || 'Release')}</div>
                            <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">${escapeHtml(availabilityLabel)}${release.publishedAt ? ` | ${escapeHtml((release.publishedAt || '').slice(0, 4))}` : ''}</div>
                            <p class="mt-3 max-w-3xl text-sm leading-6 text-gray-400">${escapeHtml(release.description || 'Play any track here, or jump back to the artist page to browse more releases.')}</p>
                            ${missingTrackCount > 0
                                ? `<p class="mt-2 text-xs text-amber-200">Some songs are still unavailable. NexPlay recovered as many embeddable matches as it could.</p>`
                                : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-start gap-2 md:items-end">
                        <div class="flex flex-wrap items-center gap-2 md:justify-end">
                            ${renderOnlineMusicRuntimeBadge()}
                            ${renderOnlineMusicRuntimeBadge('downloads')}
                            <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500">${online.browserReleaseStatus === 'loading' ? 'Loading release' : 'Release view'}</div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" data-online-music-action="play-release-ordered" ${online.browserReleaseStatus === 'loading' || !releaseTracks.length || !canStartReleasePlayback ? 'disabled' : ''} title="${escapeHtml(canStartReleasePlayback ? 'Start playback for this release.' : getOnlineMusicPlaybackResolutionUnavailableMessage('collection'))}" class="rounded-xl bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-black ${online.browserReleaseStatus === 'loading' || !releaseTracks.length || !canStartReleasePlayback ? 'cursor-default opacity-60' : 'transition-transform hover:scale-[1.02]'}">${escapeHtml(playLabel)}</button>
                            <button type="button" data-online-music-action="play-release-shuffle" ${online.browserReleaseStatus === 'loading' || !releaseTracks.length || !canStartReleasePlayback ? 'disabled' : ''} title="${escapeHtml(canStartReleasePlayback ? 'Shuffle this release and start playback.' : getOnlineMusicPlaybackResolutionUnavailableMessage('collection'))}" class="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] ${online.browserReleaseStatus === 'loading' || !releaseTracks.length || !canStartReleasePlayback ? 'cursor-default opacity-60 text-gray-500' : 'text-gray-200 hover:bg-white/10'}">${escapeHtml(shuffleLabel)}</button>
                            <button type="button" data-online-music-action="download-release" ${online.browserReleaseStatus === 'loading' || !releaseTracks.length || !isDesktopRuntime ? 'disabled' : ''} title="${isDesktopRuntime ? 'Download this release in the desktop app.' : 'Desktop app required for release downloads.'}" class="rounded-xl border border-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] ${online.browserReleaseStatus === 'loading' || !releaseTracks.length ? 'cursor-default opacity-60 text-gray-500' : (isDesktopRuntime ? 'text-gray-200 hover:bg-white/10' : 'cursor-not-allowed border-white/5 bg-black/30 text-gray-500 opacity-70')}">${isDesktopRuntime ? 'Download Release' : 'Desktop Only'}</button>
                        </div>
                        ${!canStartReleasePlayback
                            ? '<div class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">This release needs playback resolution before it can start here.</div>'
                            : (isDesktopRuntime
                                ? '<div class="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-200/80">Desktop downloads are available for this release.</div>'
                                : '<div class="text-[10px] font-mono uppercase tracking-[0.14em] text-gray-500">Play and add-to-library work here. Release downloads stay in the desktop app.</div>')}
                    </div>
                </div>
            </div>
            ${renderOnlineMusicDownloadJobsPanel()}
            ${renderOnlineMusicImportReviewPanel()}
            ${online.browserReleaseStatus === 'error'
                ? `<div class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">${escapeHtml(errorMessage || 'Unable to load this release right now.')}</div>`
                : ''}
            ${online.browserReleaseStatus === 'loading' && !(release.tracks || []).length
                ? '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">Loading release tracks...</div>'
                : ((release.tracks || []).length
                    ? `<div class="space-y-3">${renderOnlineMusicTrackRows(release.tracks || [], { context: 'release' })}</div>`
                    : '<div class="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-sm text-gray-400">No embeddable tracks were found for this release.</div>')}
        </div>
    `;
}

function renderOnlineMusicContent(options = {}) {
    const online = getOnlineMusicState();
    const container = document.getElementById('online-music-content');
    const searchInput = document.getElementById('online-music-search-input');
    if (!container) return;
    const activeElement = document.activeElement;
    const shouldRestoreArtistSearchFocus = !!options.restoreArtistWorkSearchFocus
        || !!activeElement?.matches?.('[data-online-music-artist-work-search]');
    const artistSearchSelectionStart = shouldRestoreArtistSearchFocus ? Number(activeElement?.selectionStart || 0) : 0;
    const artistSearchSelectionEnd = shouldRestoreArtistSearchFocus ? Number(activeElement?.selectionEnd || artistSearchSelectionStart) : artistSearchSelectionStart;
    syncOnlineMusicHubHeader();
    if (searchInput) searchInput.value = online.searchQuery || '';
    syncOnlineMusicPlayerCard();
    let nextBody = renderOnlineMusicSearchView();
    if (online.browserView === 'artist') {
        nextBody = renderOnlineMusicArtistView();
    } else if (online.browserView === 'release') {
        nextBody = renderOnlineMusicReleaseView();
    }
    const runtimeNotice = renderDesktopRuntimeNotice();
    container.innerHTML = runtimeNotice ? `<div class="space-y-4">${runtimeNotice}${nextBody}</div>` : nextBody;
    refreshLucideIcons();
    if (shouldRestoreArtistSearchFocus) {
        const nextInput = document.getElementById('online-music-artist-work-search-input');
        if (nextInput) {
            nextInput.focus({ preventScroll: true });
            try {
                const length = String(nextInput.value || '').length;
                nextInput.setSelectionRange(
                    Math.min(artistSearchSelectionStart, length),
                    Math.min(artistSearchSelectionEnd, length)
                );
            } catch (_) {}
        }
    }
}

async function searchOnlineMusic() {
    const online = getOnlineMusicState();
    const input = document.getElementById('online-music-search-input');
    const query = sanitizeText(input?.value || online.searchQuery || '');
    if (!query) {
        updateOnlineMusicFeedback('Type a song or artist name first.', 'warn');
        return;
    }
    syncConfiguredOnlineMusicApiKey();
    online.searchQuery = query;
    online.searchResults = [];
    online.browserView = 'search';
    online.browserArtist = null;
    online.browserArtistStatus = 'idle';
    online.browserArtistError = '';
    online.artistWorkSearchQuery = '';
    online.browserRelease = null;
    online.browserReleaseStatus = 'idle';
    online.browserReleaseError = '';
    online.searchStatus = `Searching online providers for "${query}"...`;
    updateOnlineMusicFeedback(online.searchStatus, 'info');
    renderOnlineMusicContent();

    if (canUseDesktopYouTubeMusicSearch()) {
        const requestedQuery = query;
        const youtubeSearchPromise = fetchDesktopYouTubeMusicSearchTracks(query, {
            timeoutMs: DESKTOP_ONLINE_MUSIC_SEARCH_TIMEOUT_MS
        });
        const catalogSearchPromise = fetchOnlineMusicCatalogSearchBundle(query)
            .catch((error) => ({ tracks: [], errors: [error] }));
        const isCurrentDesktopSearch = () => {
            const current = getOnlineMusicState();
            return sanitizeText(current.searchQuery || '') === requestedQuery && current.browserView === 'search';
        };
        const commitDesktopSearchResults = (tracks = [], errors = []) => {
            if (!isCurrentDesktopSearch()) return false;
            const current = getOnlineMusicState();
            const searchErrors = (Array.isArray(errors) ? errors : [])
                .map((error) => sanitizeOnlineProviderErrorMessage(error?.message || error || ''))
                .filter(Boolean);
            current.searchResults = mergeOnlineMusicSearchResults(tracks || [], {
                query: requestedQuery,
                preferPlayableTransport: true
            });
            if (current.searchResults.length) {
                current.searchStatus = `Found ${current.searchResults.length} streaming result${current.searchResults.length === 1 ? '' : 's'}.${searchErrors.length ? ' Some online sources were unavailable.' : ''}`;
                updateOnlineMusicFeedback(current.searchStatus, searchErrors.length ? 'warn' : 'success');
            } else {
                current.searchStatus = `No streaming results found for "${requestedQuery}".${searchErrors.length ? ' Some online sources were unavailable.' : ''}`;
                updateOnlineMusicFeedback(current.searchStatus, searchErrors.length ? 'error' : 'warn');
            }
            persistOnlineMusicState();
            renderOnlineMusicContent();
            const firstPlayable = (current.searchResults || []).find((track) => track?.videoId);
            if (firstPlayable?.videoId) {
                ensureOnlineMusicPlayer(firstPlayable.videoId, { quiet: true }).catch(() => {});
            }
            return true;
        };

        let youtubeTracks = [];
        let youtubeErrors = [];
        try {
            youtubeTracks = await youtubeSearchPromise;
        } catch (error) {
            youtubeErrors = [error];
        }
        if (!isCurrentDesktopSearch()) return;

        if (Array.isArray(youtubeTracks) && youtubeTracks.length) {
            commitDesktopSearchResults(youtubeTracks, youtubeErrors);
            catalogSearchPromise
                .then((catalogBundle) => {
                    if (!isCurrentDesktopSearch()) return;
                    const current = getOnlineMusicState();
                    const catalogTracks = Array.isArray(catalogBundle?.tracks) ? catalogBundle.tracks : [];
                    const mergedInput = [
                        ...(current.searchResults || []),
                        ...catalogTracks
                    ];
                    commitDesktopSearchResults(mergedInput, [
                        ...youtubeErrors,
                        ...(Array.isArray(catalogBundle?.errors) ? catalogBundle.errors : [])
                    ]);
                })
            return;
        }

        const catalogBundle = await catalogSearchPromise;
        commitDesktopSearchResults([
            ...(Array.isArray(youtubeTracks) ? youtubeTracks : []),
            ...(Array.isArray(catalogBundle?.tracks) ? catalogBundle.tracks : [])
        ], [
            ...youtubeErrors,
            ...(Array.isArray(catalogBundle?.errors) ? catalogBundle.errors : [])
        ]);
        return;
    }

    const catalogResponses = await Promise.allSettled([
        fetchItunesSearchTracks(query),
        fetchDeezerSearchTracks(query)
    ]);

    try {
        const catalogResults = catalogResponses
            .filter((entry) => entry.status === 'fulfilled')
            .flatMap((entry) => Array.isArray(entry.value) ? entry.value : []);
        const catalogErrors = catalogResponses
            .filter((entry) => entry.status === 'rejected')
            .map((entry) => sanitizeOnlineProviderErrorMessage(entry.reason?.message || entry.reason || ''))
            .filter(Boolean);

        let youtubeResults = [];
        let youtubeErrorMessage = '';
        const shouldTryYouTubeDiscovery = shouldUseOnlineMusicYouTubeDiscovery();
        if (shouldTryYouTubeDiscovery) {
            try {
                youtubeResults = await fetchYouTubeOnlineMusicSearchTracks(query);
            } catch (error) {
                youtubeErrorMessage = sanitizeText(error?.message || 'YouTube discovery is unavailable right now.');
            }
        }

        online.searchResults = mergeOnlineMusicSearchResults([
            ...catalogResults,
            ...youtubeResults
        ], { query });

        const discoveryNote = shouldTryYouTubeDiscovery
            ? (youtubeErrorMessage ? ` ${youtubeErrorMessage}` : '')
            : (isOnlineMusicYouTubeDiscoveryBlocked()
                ? ' YouTube discovery is paused for this session. Playback will resolve on demand.'
                : (!getAppSettings().onlineMusic?.preferYoutubeDiscovery
                    ? ' YouTube discovery enrichment is off in Settings.'
                    : ''));

        if (online.searchResults.length) {
            online.searchStatus = `Found ${online.searchResults.length} streaming result${online.searchResults.length === 1 ? '' : 's'}.${discoveryNote}`;
            updateOnlineMusicFeedback(online.searchStatus, 'success');
        } else {
            const combinedError = catalogErrors[0] || youtubeErrorMessage;
            online.searchStatus = combinedError
                ? `No results found for "${query}". ${combinedError}`
                : `No streaming results found for "${query}".`;
            updateOnlineMusicFeedback(online.searchStatus, combinedError ? 'error' : 'warn');
        }
        persistOnlineMusicState();
        renderOnlineMusicContent();
    } catch (error) {
        online.searchResults = [];
        online.searchStatus = error?.message || 'Unable to search YouTube right now.';
        updateOnlineMusicFeedback(online.searchStatus, 'error');
        persistOnlineMusicState();
        renderOnlineMusicContent();
    }
}

async function handleOnlineMusicContentClick(event) {
    const actionEl = event.target.closest('[data-online-music-action]');
    if (!actionEl) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionEl.getAttribute('data-online-music-action');
    const playlistId = actionEl.getAttribute('data-playlist-id') || '';
    const playbackContext = normalizeOnlineMusicPlaybackContext(actionEl.getAttribute('data-playback-context') || getOnlineMusicActiveViewContext());
    const actionTarget = resolveOnlineMusicActionTarget(actionEl, { context: playbackContext });
    const trackId = actionTarget.trackId || '';
    const online = getOnlineMusicState();
    const queueContextKey = getOnlineMusicQueueContextKey(playbackContext, {
        release: online.browserRelease,
        artist: online.browserArtist,
        searchQuery: online.searchQuery
    });

    if ((action === 'download-track' || action === 'download-release') && !isDesktopRuntimeAvailable()) {
        const message = getDesktopOnlyMessage(action === 'download-release' ? 'Release downloads' : 'MP3 downloads');
        updateOnlineMusicFeedback(message, 'warn');
        showToast(message, 'info');
        return;
    }

    if ((action === 'play-track' || action === 'add-to-end')
        && actionTarget.track?.pendingPlaybackResolution
        && !canResolveOnlineMusicTrackOnCurrentRuntime(actionTarget.track)) {
        const message = getOnlineMusicPlaybackResolutionUnavailableMessage('track');
        updateOnlineMusicFeedback(message, 'warn');
        showToast(message, 'info');
        return;
    }

    if (action === 'play-track') {
        const preferredQueueTracks = getOnlineMusicPreferredQueueTracks(playbackContext, {
            queueContextKey,
            release: online.browserRelease,
            artist: online.browserArtist,
            searchQuery: online.searchQuery
        });
        const queueTracks = actionTarget.track && !preferredQueueTracks
            .some((track) => normalizeOnlineMusicTrackId(track?.id || '') === normalizeOnlineMusicTrackId(actionTarget.track?.id || ''))
            ? [actionTarget.track, ...preferredQueueTracks]
            : preferredQueueTracks;
        await startTrackCollectionPlayback(
            queueTracks,
            trackId,
            {
                autoplay: true,
                queueSource: 'manual',
                isShuffle: false,
                playbackContext,
                queueContextView: playbackContext,
                queueContextKey,
                forcePlaybackResolution: !!actionTarget.track?.pendingPlaybackResolution
            }
        );
    } else if (action === 'play-next') {
        queueTrackNext(trackId);
    } else if (action === 'add-to-end') {
        queueTrackToEnd(trackId);
    } else if (action === 'save-track') {
        if (!trackId) return;
        saveOnlineMusicTrackToLibrary(trackId, { track: actionTarget.track });
    } else if (action === 'download-track') {
        downloadOnlineMusicTrack(trackId);
    } else if (action === 'clear-artist-work-search') {
        clearOnlineMusicArtistWorkSearchQuery();
    } else if (action === 'play-release-ordered') {
        await playOnlineMusicReleaseCollection('ordered');
    } else if (action === 'play-release-shuffle') {
        await playOnlineMusicReleaseCollection('shuffle');
    } else if (action === 'download-release') {
        await downloadOnlineMusicRelease();
    } else if (action === 'open-artist') {
        openOnlineMusicArtistFromTrack(trackId);
    } else if (action === 'open-release') {
        openOnlineMusicRelease(playlistId);
    } else if (action === 'back-to-search') {
        returnToOnlineMusicSearch();
    } else if (action === 'back-to-artist') {
        returnToOnlineMusicArtist();
    }
}

function renderOnlineMusicTab() {
    const hub = document.getElementById('online-music-hub');
    const emptyEl = document.getElementById('empty-state');
    const container = els.tracksContainer;
    if (hub) hub.classList.remove('hidden');
    syncOnlineMusicHubHeader();
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.classList.remove('flex');
    }
    if (container) {
        container.innerHTML = '';
        container.className = 'w-full pb-8 pt-4';
        container.classList.remove('multi-select-active');
    }
    if (!getSafeAppOrigin()) {
        updateOnlineMusicFeedback('YouTube embeds work best when NexPlay is served over http://localhost:5000/ instead of file://.', 'warn');
    } else {
        updateOnlineMusicFeedback(getOnlineMusicState().searchStatus, 'info');
    }
    renderOnlineMusicContent();
    updateBulkBar();
    applyFeatureVisibility();
}

function purgeStoredSpotifyImportsOnStartup() {
    const helper = window.NexPlayOnlineMusicHelpers;
    if (!helper || typeof helper.purgeSpotifyImportedData !== 'function') return;
    const savedOnlineTracks = sanitizeStoredOnlineMusicLibrary(readStorageJson(ONLINE_MUSIC_LIBRARY_KEY, []));
    const purge = helper.purgeSpotifyImportedData({
        savedOnlineTracks,
        appState: {
            tracks: state.tracks || [],
            selectedTrackIds: state.selectedTrackIds || [],
            queue: state.queue || [],
            shuffleQueue: state.shuffleQueue || [],
            playHistory: state.playHistory || [],
            playlists: state.playlists || [],
            currentTrackId: state.currentTrackId,
            currentTrack: state.currentTrack,
            videoQueueState: state.videoQueueState || {}
        },
        metadataStore: state.metadataStore || {},
        onlineMusicState: state.onlineMusic || createDefaultOnlineMusicState(),
        appSettings: state.appSettings || createDefaultAppSettings()
    });
    if (!purge || !purge.changed) return;
    const removedTrackIds = Array.isArray(purge.removedTrackIds) ? purge.removedTrackIds.filter(Boolean) : [];
    const removedTrackIdSet = new Set(removedTrackIds);
    replaceSavedOnlineMusicLibrary(sanitizeStoredOnlineMusicLibrary(purge.savedOnlineTracks || []));
    state.playlists = sanitizeStoredPlaylists(purge.appState?.playlists || []);
    state.selectedTrackIds = Array.isArray(purge.appState?.selectedTrackIds) ? purge.appState.selectedTrackIds.filter(Boolean) : [];
    state.queue = Array.isArray(purge.appState?.queue) ? purge.appState.queue.filter(Boolean) : [];
    state.shuffleQueue = Array.isArray(purge.appState?.shuffleQueue) ? purge.appState.shuffleQueue.filter(Boolean) : [];
    state.playHistory = Array.isArray(purge.appState?.playHistory) ? purge.appState.playHistory.filter(Boolean) : [];
    state.currentTrackId = sanitizeText(purge.appState?.currentTrackId || '') || null;
    state.currentTrack = purge.appState?.currentTrack ? sanitizeStoredTrack(purge.appState.currentTrack) : null;
    state.videoQueueState = {
        ...(state.videoQueueState || {}),
        ...(purge.appState?.videoQueueState || {}),
        queue: Array.isArray(purge.appState?.videoQueueState?.queue) ? purge.appState.videoQueueState.queue.filter(Boolean) : [],
        shuffleQueue: Array.isArray(purge.appState?.videoQueueState?.shuffleQueue) ? purge.appState.videoQueueState.shuffleQueue.filter(Boolean) : []
    };
    state.metadataStore = sanitizeStoredMetadata(purge.metadataStore || {});
    state.onlineMusic = sanitizeStoredOnlineMusicState(purge.onlineMusicState || createDefaultOnlineMusicState());
    state.appSettings = sanitizeAppSettings(purge.appSettings || createDefaultAppSettings());
    if (removedTrackIdSet.size) {
        removeTrackIdsFromCollections(removedTrackIds);
        state.resumeStore = sanitizeResumeStore({
            ...(state.resumeStore || {}),
            tracks: Object.fromEntries(Object.entries(state.resumeStore?.tracks || {}).filter(([trackId]) => !removedTrackIdSet.has(sanitizeText(trackId || ''))))
        });
        state.queueSnapshots = sanitizeQueueSnapshots((state.queueSnapshots || []).map((snapshot) => ({
            ...(snapshot || {}),
            queue: (Array.isArray(snapshot?.queue) ? snapshot.queue : []).filter((entry) => {
                const trackId = typeof entry === 'string'
                    ? sanitizeText(entry || '')
                    : sanitizeText(entry?.trackId || entry?.id || '');
                return !removedTrackIdSet.has(trackId);
            }),
            currentTrackId: removedTrackIdSet.has(sanitizeText(snapshot?.currentTrackId || ''))
                ? ''
                : sanitizeText(snapshot?.currentTrackId || '')
        })).filter((snapshot) => Array.isArray(snapshot?.queue) ? snapshot.queue.length > 0 || !!snapshot.currentTrackId : false));
        state.chapterBookmarks = sanitizeChapterBookmarks(Object.fromEntries(Object.entries(state.chapterBookmarks || {}).filter(([trackId]) => !removedTrackIdSet.has(sanitizeText(trackId || '')))));
        state.coverWallState = sanitizeCoverWallState({
            ...(state.coverWallState || {}),
            cachedTrackIds: (state.coverWallState?.cachedTrackIds || []).filter((trackId) => !removedTrackIdSet.has(sanitizeText(trackId || '')))
        });
    }
    persistSavedOnlineMusicLibrary();
    persistPlaylists();
    persistOnlineMusicState();
    persistMetadataStoreWithFallback();
    persistExtendedStores();
    persistAppStateNow();
}

