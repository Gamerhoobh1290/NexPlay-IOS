/* Legacy modals, delete/undo flows, progress updates, navigation, and display modes.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- METADATA EDITOR FUNCTIONS ---
function openEditModal(id) {
    state.editingTrackId = id;
    const track = state.tracks.find(t => t.id === id);
    if (!track) return;
    // Populate fields with current metadata only if the elements exist.
    const titleEl  = document.getElementById('edit-title');
    const artistEl = document.getElementById('edit-artist');
    if (titleEl)  titleEl.value  = track.title  || '';
    if (artistEl) artistEl.value = track.artist || '';
    // Populate tags field with comma-separated list
    const tagsInput = document.getElementById('edit-tags');
    if (tagsInput) tagsInput.value = (track.tags || []).join(', ');
    const fileInput = document.getElementById('edit-cover');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('edit-cover-preview');
    if (preview) {
        if (track.cover) {
            preview.src = track.cover;
            preview.classList.remove('hidden');
        } else {
            preview.classList.add('hidden');
        }
    }
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    // Render icons within the modal
    if (typeof lucide !== 'undefined') {
        refreshLucideIcons();
    }
}
function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    state.editingTrackId = null;
}
async function saveEdit() {
    const id = state.editingTrackId;
    if (!id) { closeEditModal(); return; }
    const track = state.tracks.find(t => t.id === id);
    if (track) {
        const newTitle = sanitizeText(document.getElementById('edit-title').value);
        const newArtist = sanitizeText(document.getElementById('edit-artist').value);
        if (newTitle) track.title = newTitle;
        if (newArtist) track.artist = newArtist;
        if (track.source === 'online-music') {
            const lyricsIdentity = deriveOnlineMusicLyricsIdentity(track.title || '', track.artist || '', track.channelTitle || track.artist || '');
            track.lyricsArtist = lyricsIdentity.lyricsArtist || track.artist || '';
            track.lyricsTitle = lyricsIdentity.lyricsTitle || track.title || '';
        }
        // Save tags
        const tagStr = document.getElementById('edit-tags').value || '';
        const tagArr = tagStr.split(',').map(t => sanitizeText(t)).filter(x => x);
        track.tags = tagArr;
        const fileInput = document.getElementById('edit-cover');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            track.cover = await readFileAsDataURL(file, { optimizeCover: true });
            const preview = document.getElementById('edit-cover-preview');
            if (preview) {
                preview.src = track.cover;
                preview.classList.remove('hidden');
            }
        }
        if (String(track.customLyrics || '').trim()) {
            track.customLyrics = syncTrackCustomLyricsCache(track, track.customLyrics);
        }
        persistTrackMetadata(track);
        if (isOnlineMusicTrackRecord(track)) {
            syncMainLibraryTrackToOnlineState(track, { ensureSaved: true, persist: false });
            persistOnlineMusicState();
        }
        // Update the mini/full player UI and re-render lists.  Wrap in
        // a single try/catch so that any unexpected errors do not
        // propagate and break the application.  A toast will surface
        // the issue to the user instead of leaving a blank screen.
        try {
            // Update the mini/full player and the visible tracks list.  Avoid
            // re-rendering the sidebar navigation here to reduce the risk
            // of runtime errors after editing metadata (such as when
            // adding tags).  The navigation will refresh on next
            // explicit tab change or page reload.
            updateTrackUI(track);
            if (isCurrentLibraryTrack(track)) applyCoverAccent(track);
            renderTracks({ preserveScroll: true });
            if (state.activeTab === 'online-music') renderOnlineMusicContent();
        } catch (err) {
            console.error(err);
            showToast('An error occurred while updating the track.', 'error');
        }
        persistAppStateNow();
    }
    closeEditModal();
}
function optimizeCoverDataUrl(dataUrl, { maxDimension = 900 } = {}) {
    return new Promise((resolve) => {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            resolve(dataUrl || '');
            return;
        }
        const img = new Image();
        img.onload = () => {
            try {
                const baseMax = Math.max(img.width || 1, img.height || 1);
                const baseScale = Math.min(1, maxDimension / baseMax);
                const attempts = [
                    { scale: baseScale, quality: 0.86 },
                    { scale: baseScale * 0.9, quality: 0.8 },
                    { scale: baseScale * 0.78, quality: 0.74 },
                    { scale: baseScale * 0.64, quality: 0.68 }
                ];
                let best = dataUrl;
                attempts.forEach((attempt) => {
                    const scale = Math.max(0.2, Math.min(1, attempt.scale));
                    const w = Math.max(1, Math.round(img.width * scale));
                    const h = Math.max(1, Math.round(img.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    ctx.drawImage(img, 0, 0, w, h);
                    const out = canvas.toDataURL('image/jpeg', attempt.quality);
                    if (typeof out === 'string' && out.length < best.length) best = out;
                });
                resolve(best);
            } catch (_) {
                resolve(dataUrl);
            }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function readFileAsDataURL(file, { optimizeCover = false } = {}) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const data = typeof reader.result === 'string' ? reader.result : '';
            if (!optimizeCover) {
                resolve(data);
                return;
            }
            const optimized = await optimizeCoverDataUrl(data, { maxDimension: 900 });
            resolve(optimized || data);
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}
function toggleCurrentFavorite(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isOnlineMusicPlaybackActive()) {
        toggleOnlineMusicFavorite(getOnlineMusicState().currentTrackId);
        const active = getActivePlaybackTrack();
        if (active) syncFavoriteUI(active);
        return;
    }
    toggleFavorite(e, state.currentTrackId);
}
function toggleFavorite(e, id) {
    if (e && e.stopPropagation) e.stopPropagation();
    // Toggle the favorite flag on the given track, ignoring undefined entries
    const targetId = id || state.currentTrackId;
    const t = state.tracks.find(x => x && x.id === targetId);
    if (!t) return;
    t.isFavorite = !t.isFavorite;
    persistTrackMetadata(t);
    if (isOnlineMusicTrackRecord(t)) {
        syncMainLibraryTrackToOnlineState(t, { ensureSaved: true, persist: false });
        persistOnlineMusicState();
    }
    try {
        updateTrackUI(t);
        syncFavoriteUI(t);
        renderTracks({ preserveScroll: true });
        if (state.activeTab === 'online-music') renderOnlineMusicContent();
    } catch (err) {
        console.error(err);
        showToast('An error occurred updating favorites.', 'error');
    }
}
function confirmDeleteTrack(e, ids) {
    if (e && e.stopPropagation) e.stopPropagation();
    const modal = document.getElementById('delete-confirm-modal');
    if (!modal) return;
    const list = Array.isArray(ids) ? ids : [ids];
    state.pendingDeleteTrack = list;
    const preview = state.tracks.find(t => t.id === list[0]);
    const labelEl = document.getElementById('delete-track-name');
    const label = list.length > 1 ? `${list.length} tracks` : (preview?.title || 'this track');
    if (labelEl) labelEl.textContent = `Remove ${label}? You can undo this immediately.`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeDeleteConfirm() {
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    state.pendingDeleteTrack = null;
}

function confirmDeleteProceed() {
    const ids = Array.isArray(state.pendingDeleteTrack) ? state.pendingDeleteTrack : state.pendingDeleteTrack ? [state.pendingDeleteTrack] : [];
    closeDeleteConfirm();
    if (!ids.length) return;
    applyDeletion(ids);
}

function applyDeletion(ids = []) {
    const uniqueIds = Array.from(new Set(ids));
    const deletedTracks = state.tracks.filter(t => uniqueIds.includes(t.id));
    const deletionPayload = {
        tracks: deletedTracks.map(t => ({ ...t })),
        indices: deletedTracks.map(t => state.tracks.indexOf(t)),
        queue: [...(state.queue || [])],
        audioQueueState: JSON.parse(JSON.stringify(state.audioQueueState || {})),
        videoQueue: [...(state.videoQueueState.queue || [])],
        videoShuffleQueue: [...(state.videoQueueState.shuffleQueue || [])],
        history: [...(state.playHistory || [])],
        current: state.currentTrackId,
        playlists: JSON.parse(JSON.stringify(state.playlists || [])),
        onlineMusic: JSON.parse(JSON.stringify(getOnlineMusicState() || createDefaultOnlineMusicState())),
        undone: false,
        finalizationTimer: null
    };
    state.lastDeletedTrack = deletionPayload;
    uniqueIds.forEach(id => {
        if (state.currentTrackId === id) {
            if (isOnlineMusicPlaybackActive()) {
                const online = getOnlineMusicState();
                online.isPlaying = false;
                online.currentTrackId = null;
                online.currentTrack = null;
                online.currentTime = 0;
                online.duration = 0;
                stopOnlineMusicProgressTimer();
                if (onlineMusicPlayer && onlineMusicPlayerReady && typeof onlineMusicPlayer.pauseVideo === 'function') {
                    try { onlineMusicPlayer.pauseVideo(); } catch (_) {}
                }
                state.currentPlaybackSource = 'local';
            }
            safePauseMedia(els.audio);
            els.audio.src = '';
            state.currentTrackId = null;
            state.currentTrack = null;
            state.isPlaying = false;
            resetProgressUI();
            document.getElementById('mini-title').innerText = "Standby";
            document.getElementById('mini-artist').innerText = "NexPlay OS";
            document.getElementById('mini-cover').src = "";
            document.getElementById('mini-cover').classList.add('hidden');
            updatePlayIcons();
        }
    });
    state.queue = (state.queue || []).filter(qid => !uniqueIds.includes(qid));
    state.shuffleQueue = (state.shuffleQueue || []).filter(qid => !uniqueIds.includes(qid));
    state.videoQueueState.queue = (state.videoQueueState.queue || []).filter(qid => !uniqueIds.includes(qid));
    state.videoQueueState.shuffleQueue = (state.videoQueueState.shuffleQueue || []).filter(qid => !uniqueIds.includes(qid));
    let nextAudioState = getUnifiedAudioQueueState();
    const audioHelper = getAudioQueueHelper();
    uniqueIds.forEach((deletedId) => {
        const targetEntry = (nextAudioState.entries || []).find((entry) => entry?.trackId === deletedId);
        if (targetEntry && typeof audioHelper.removeEntry === 'function') {
            nextAudioState = audioHelper.removeEntry(nextAudioState, targetEntry.id);
        }
    });
    commitUnifiedAudioQueue({
        ...nextAudioState,
        queueSource: nextAudioState.entries?.length ? (nextAudioState.queueSource || 'auto') : 'auto',
        failedEntryIds: Array.isArray(nextAudioState.failedEntryIds) ? nextAudioState.failedEntryIds.filter((entryId) => (nextAudioState.entries || []).some((entry) => entry.id === entryId)) : []
    }, { refresh: false });
    state.playHistory = (state.playHistory || []).filter(pid => !uniqueIds.includes(pid));
    state.tracks = state.tracks.filter(t => !uniqueIds.includes(t.id));
    state.selectedTrackIds = (state.selectedTrackIds || []).filter(id => !uniqueIds.includes(id));
    state.playlists = (state.playlists || []).map(pl => ({
        ...pl,
        tracks: (pl.tracks || []).filter(tid => !uniqueIds.includes(tid))
    }));
    pruneOnlineMusicLibraryEntries(deletedTracks.filter(isOnlineMusicTrackRecord).map((track) => track.id), { persist: false });
    persistOnlineMusicState();
    if (state.isShuffle) {
        buildShuffleQueue(state.currentTrackId, currentMediaType());
    } else {
        clearShuffleState();
    }
    saveActiveQueueBucket();
    renderTracks();
    updateLibraryStatsLabel();
    if (state.activeTab === 'queue') renderQueue();
    if (state.isQueueOverlayOpen) renderQueueOverlay();
    refreshLiveViews();
    persistPlaylists();
    persistLocalLibraryIndex();
    showToast(`Deleted ${uniqueIds.length} track(s).`, 'info', { action: { label: 'Undo', handler: undoDelete } });
    // Keep browser-backed media intact until the Undo control has fully left
    // the screen. This also avoids restoring a revoked blob URL.
    deletionPayload.finalizationTimer = setTimeout(() => {
        if (deletionPayload.undone) return;
        finalizeDeletedLocalMediaTracks(deletionPayload.tracks).catch((error) => {
            console.warn('Failed to finalize deleted local media', error);
        });
        if (state.lastDeletedTrack === deletionPayload) state.lastDeletedTrack = null;
    }, 4000);
}

function undoDelete() {
    const payload = state.lastDeletedTrack;
    if (!payload || !payload.tracks || payload.tracks.length === 0) return;
    payload.undone = true;
    if (payload.finalizationTimer) {
        clearTimeout(payload.finalizationTimer);
        payload.finalizationTimer = null;
    }
    payload.tracks.forEach((t, i) => {
        const idx = typeof payload.indices?.[i] === 'number' ? payload.indices[i] : state.tracks.length;
        state.tracks.splice(Math.max(0, idx), 0, t);
    });
    state.queue = payload.queue || state.queue;
    state.audioQueueState = payload.audioQueueState || state.audioQueueState;
    state.videoQueueState.queue = payload.videoQueue || state.videoQueueState.queue;
    state.videoQueueState.shuffleQueue = payload.videoShuffleQueue || state.videoQueueState.shuffleQueue;
    state.playHistory = payload.history || state.playHistory;
    if (payload.current && state.tracks.find(t => t.id === payload.current)) {
        state.currentTrackId = payload.current;
        state.currentTrack = state.tracks.find(t => t.id === payload.current) || null;
    }
    state.playlists = payload.playlists || state.playlists;
    if (payload.onlineMusic) {
        state.onlineMusic = sanitizeStoredOnlineMusicState(payload.onlineMusic);
    }
    loadQueueBucket(activeQueueType);
    if (activeQueueType === 'audio') {
        normalizeAndSyncAudioQueueBucket({ applyToState: true });
    }
    persistPlaylists();
    renderTracks({ preserveScroll: true });
    if (state.activeTab === 'online-music') renderOnlineMusicContent();
    if (state.activeTab === 'playlists') renderPlaylists();
    updateLibraryStatsLabel();
    refreshLiveViews();
    if (state.activeTab === 'queue') renderQueue();
    if (state.isQueueOverlayOpen) renderQueueOverlay();
    persistLocalLibraryIndex();
    state.lastDeletedTrack = null;
}
function formatClock(timeSec = 0) {
    const t = Math.max(0, timeSec || 0);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const pad = (n) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
}

function syncLyricsForPlaybackTime(currentTime = 0, duration = 0) {
	            // Lyrics syncing is explicitly mode-scoped:
	            // - Side-by-side lyrics list => windowedMode ONLY
	            // - Line-by-line lyrics overlay => fsMode ONLY
    const cur = Math.max(0, Number(currentTime) || 0);
    const dur = Math.max(0, Number(duration) || 0);
    const suppressMusicGameMetrics = shouldSuppressMusicGameMetrics();
	            const offset = state.lyricsHighlight && typeof state.lyricsHighlight.offset === 'number' ? state.lyricsHighlight.offset : 0;
	            const timeWithOffset = cur + offset;
	            const windowedLyricsActive = !!state.windowedModeActive;
	            const fsModeLyricsActive = !!state.fsModeActive;

	            if (!suppressMusicGameMetrics && Array.isArray(lrcData) && lrcData.length > 0) {
	                const indexNow = findSyncedLyricIndex(lrcData, timeWithOffset);
	                if (indexNow !== -1) {
	                    const line = lrcData[indexNow];
	                    const nextLine = lrcData[indexNow + 1]?.text || '';

	                    if (windowedLyricsActive) {
	                        if (activeLyricIndex !== -1 && activeLyricIndex !== indexNow) {
	                            const prev = lrcData[activeLyricIndex];
	                            if (prev && prev.el) {
	                                prev.el.classList.remove('lyric-highlight', 'opacity-100');
	                                prev.el.classList.add('opacity-30');
	                            }
	                        }
	                        if (line.el) {
	                            const needsApply = activeLyricIndex !== indexNow || !line.el.classList.contains('lyric-highlight');
	                            if (needsApply) {
	                                line.el.classList.add('lyric-highlight', 'opacity-100');
	                                line.el.classList.remove('opacity-30');
                            scrollActiveLyricLineIntoView(line.el);
	                            }
	                        }
	                    }

	                    activeLyricIndex = indexNow;
	                    if (state.lyricsHighlight) state.lyricsHighlight.lastIndex = indexNow;
	                    if (fsModeLyricsActive) updateFsModeLyricOverlay(line.text || '', nextLine);
	                } else {
	                    if (windowedLyricsActive && activeLyricIndex !== -1) {
	                        const prev = lrcData[activeLyricIndex];
	                        if (prev && prev.el) {
	                            prev.el.classList.remove('lyric-highlight', 'opacity-100');
	                            prev.el.classList.add('opacity-30');
	                        }
	                    }
	                    activeLyricIndex = -1;
	                    if (state.lyricsHighlight) state.lyricsHighlight.lastIndex = -1;
	                    if (fsModeLyricsActive) updateFsModeLyricOverlay('', '');
	                }
        return;
	            }

    if (!(state.lyricsHighlight && state.lyricsHighlight.lines && state.lyricsHighlight.lines.length > 0)) {
	                if (fsModeLyricsActive) updateFsModeLyricOverlay('', '');
        return;
    }

	            const hl = state.lyricsHighlight;
	            if ((!hl.lineDuration || hl.lineDuration <= 0) && hl.lines.length > 0 && dur > 0) {
	                hl.lineDuration = dur / hl.lines.length;
	            }
	            let idx = -1;
	            if (hl.timestamps && hl.timestamps.length > 0) {
	                for (let i = 0; i < hl.timestamps.length; i++) {
	                    if (timeWithOffset >= hl.timestamps[i]) idx = i;
	                    else break;
	                }
	            } else if (hl.lineDuration > 0) {
	                idx = Math.floor(timeWithOffset / hl.lineDuration);
	            }
	            if (idx < 0 || idx >= hl.lines.length) idx = -1;

	            if (windowedLyricsActive) {
	                if (hl.lastIndex >= 0 && hl.lastIndex < hl.lines.length && hl.lastIndex !== idx) {
	                    const elOld = hl.lines[hl.lastIndex];
	                    if (elOld) {
	                        elOld.classList.remove('lyric-highlight', 'opacity-100');
	                        elOld.classList.add('opacity-30');
	                    }
	                }
	                if (idx >= 0 && idx < hl.lines.length) {
	                    const elNew = hl.lines[idx];
	                    const needsApply = hl.lastIndex !== idx || !elNew?.classList?.contains('lyric-highlight');
	                    if (elNew && needsApply) {
	                        elNew.classList.add('lyric-highlight', 'opacity-100');
	                        elNew.classList.remove('opacity-30');
                    scrollActiveLyricLineIntoView(elNew);
	                    }
	                }
	            }

	            if (fsModeLyricsActive) {
	                if (idx >= 0 && idx < hl.lines.length) {
	                    const curText = hl.lines[idx]?.textContent || '';
	                    const nextText = hl.lines[idx + 1]?.textContent || '';
	                    updateFsModeLyricOverlay(curText, nextText);
	                } else {
	                    updateFsModeLyricOverlay('', '');
	                }
	            }

	            hl.lastIndex = idx;
}

let lastListeningStatsPersistAt = 0;

function recordListeningProgress(track, currentTime, isPlaying, options = {}) {
    const cur = Math.max(0, Number(currentTime) || 0);
    const previous = Math.max(0, Number(state.lastProgressTime) || 0);
    const delta = cur - previous;
    state.lastProgressTime = cur;
    if (options.suppress || !isPlaying || !(delta > 0 && delta < 10)) return 0;

    state.totalListeningTime = Math.max(0, Number(state.totalListeningTime) || 0) + delta;
    if (track) track.listeningTime = Math.max(0, Number(track.listeningTime) || 0) + delta;
    const dateKey = new Date().toISOString().split('T')[0];
    state.listeningHistory[dateKey] = Math.max(0, Number(state.listeningHistory[dateKey]) || 0) + delta;

    const now = Date.now();
    if (now - lastListeningStatsPersistAt >= 5000) {
        lastListeningStatsPersistAt = now;
        persistAppStateNow();
    }
    return delta;
}

function updateActivePlayerProgressControls(updateOne) {
    updateOne('mini-time-current', 'mini-time-duration', 'mini-seek-slider', 'mini-progress-fill');
    if (state.windowedModeActive) {
        updateOne('windowedModeTimeCurrent', 'windowedModeTimeDuration', 'windowedModeSeekSlider', 'windowedModeProgressFill');
    }
    if (state.fsModeActive) {
        updateOne('fsModeTimeCurrent', 'fsModeTimeDuration', 'fsModeSeekSlider', 'fsModeProgressFill');
    }
}

function updateProgress() {
    if (isMusicGamePreviewActive()) {
        restoreMusicGamePlayerShellSnapshot(false);
        return;
    }
    if (isOnlineMusicPlaybackActive()) {
        const online = getOnlineMusicState();
        const track = getOnlineMusicCurrentTrack();
        const dur = Math.max(0, Number(online.duration || track?.duration || 0));
        const cur = Math.max(0, Number(online.currentTime || 0));
        const suppressOnlineMetrics = shouldSuppressMusicGameMetrics()
            || isPrivateOnlineMusicPlaybackContext(online.playbackContext)
            || isPrivateSessionTrackRecord(track);
        recordListeningProgress(track, cur, !!online.isPlaying, { suppress: suppressOnlineMetrics });
        const displayCur = dur > 0 ? Math.min(cur, dur) : cur;
        const pct = dur > 0 ? Math.min(100, Math.max(0, (displayCur / dur) * 100)) : 0;
        const currentTimeText = formatTime(displayCur);
        const durationText = formatTime(dur);
        const remainingText = `-${formatClock(Math.max(0, dur - displayCur))}`;
        const accentFill = state.accentColor || '#57B9FF';
        const updateOne = (timeCurrentId, timeDurationId, sliderId, fillId, remainingId = null) => {
            const curEl = getCachedElement(timeCurrentId);
            const durEl = timeDurationId ? getCachedElement(timeDurationId) : null;
            setTextContentIfChanged(curEl, currentTimeText);
            setTextContentIfChanged(durEl, durationText);
            if (remainingId) {
                const remEl = getCachedElement(remainingId);
                setTextContentIfChanged(remEl, remainingText);
            }
            const slider = getCachedElement(sliderId);
            if (slider) {
                const durString = String(dur);
                if (slider.max !== durString) slider.max = durString;
                const disabled = !(dur > 0);
                if (slider.disabled !== disabled) slider.disabled = disabled;
                if (dur > 0 && document.activeElement !== slider) {
                    const currentValue = Number(slider.value || 0);
                    if (Math.abs(currentValue - displayCur) > 0.12) slider.value = String(displayCur);
                }
            }
            const fillEl = getCachedElement(fillId);
            if (fillEl) {
                const nextWidth = `${pct}%`;
                if (fillEl.style.width !== nextWidth) fillEl.style.width = nextWidth;
                if (fillEl.dataset.fillColor !== accentFill) {
                    fillEl.style.backgroundColor = accentFill;
                    fillEl.dataset.fillColor = accentFill;
                }
            }
        };
	                updateActivePlayerProgressControls(updateOne);
	                syncLyricsForPlaybackTime(displayCur, dur);
	                updateMediaPositionState();
	                persistSessionSnapshot({ reason: 'progress-online', throttleMs: 3000 });
            syncPrivateSessionPlayerDeck();
	                scheduleDebugOverlayRefresh();
	                return;
	            }
    if (!aud) return;
    const suppressMusicGameMetrics = shouldSuppressMusicGameMetrics();
    const track = getMusicGameTransportTrack();
    const rawDur = Number(aud.duration);
    const fallbackDur = track && Number.isFinite(Number(track.duration)) ? Number(track.duration) : 0;
    const dur = (Number.isFinite(rawDur) && rawDur > 0) ? rawDur : (Number.isFinite(fallbackDur) && fallbackDur > 0 ? fallbackDur : 0);
    const rawCur = Number(aud.currentTime);
    const cur = Number.isFinite(rawCur) && rawCur >= 0 ? rawCur : 0;
    const displayCur = dur > 0 ? Math.min(cur, dur) : cur;
    const pct = dur > 0 ? Math.min(100, Math.max(0, (displayCur / dur) * 100)) : 0;

    const delta = recordListeningProgress(track, cur, state.isPlaying, { suppress: suppressMusicGameMetrics });
    // Persist resume position (feature-gated) every ~2s.
    if (!suppressMusicGameMetrics && track && delta > 0) {
        const now = Date.now();
        const resumePos = dur > 0 ? Math.min(cur, Math.max(0, dur - 0.25)) : cur;
        const resumeDur = dur > 0 ? dur : (Number(track.duration) || 0);
        if (shouldUseLocalResume(resumeDur)) {
            if (now - lastUniversalResumeSave > 2000) {
                persistTrackResumeEntry(track, resumePos, resumeDur);
                lastUniversalResumeSave = now;
            }
        } else if (state.videoFsModeActive && track.type === 'video' && now - lastVideoPosSave > 2000) {
            writeStorageValue(`nexplay_video_pos_${track.id}`, resumePos);
            lastVideoPosSave = now;
        }
    }

    const currentTimeText = formatTime(displayCur);
    const durationText = formatTime(dur);
    const remainingText = `-${formatClock(Math.max(0, dur - displayCur))}`;
    const accentFill = state.accentColor || '#57B9FF';
    const updateOne = (timeCurrentId, timeDurationId, sliderId, fillId, remainingId = null) => {
        const curEl = getCachedElement(timeCurrentId);
        const durEl = timeDurationId ? getCachedElement(timeDurationId) : null;
        setTextContentIfChanged(curEl, currentTimeText);
        setTextContentIfChanged(durEl, durationText);
        if (remainingId) {
            const remEl = getCachedElement(remainingId);
            setTextContentIfChanged(remEl, remainingText);
        }
        const slider = getCachedElement(sliderId);
        if (slider) {
            const durString = String(dur);
            if (slider.max !== durString) slider.max = durString;
            const disabled = !(dur > 0);
            if (slider.disabled !== disabled) slider.disabled = disabled;
            if (dur > 0 && document.activeElement !== slider) {
                const currentValue = Number(slider.value || 0);
                if (Math.abs(currentValue - displayCur) > 0.12) slider.value = String(displayCur);
            }
            const fillEl = getCachedElement(fillId);
            if (fillEl) {
                const nextWidth = `${pct}%`;
                if (fillEl.style.width !== nextWidth) fillEl.style.width = nextWidth;
                const nextColor = fillId === 'videoFsModeProgressFill' ? '#57B9FF' : accentFill;
                if (fillEl.dataset.fillColor !== nextColor) {
                    fillEl.style.backgroundColor = nextColor;
                    fillEl.dataset.fillColor = nextColor;
                }
                if (fillEl.style.boxShadow !== 'none') fillEl.style.boxShadow = 'none';
            }
        }
    };
    if (!suppressMusicGameMetrics && track && dur > 0 && state.isPlaying) {
        const skipOutroSeconds = clampNumber(getAppSettings().playback.skipOutroSeconds, 0, 120, 0);
        const remaining = dur - displayCur;
        if (skipOutroSeconds > 0 && remaining > 0 && remaining <= skipOutroSeconds && skipOutroHandledTrackId !== track.id) {
            if (state.repeatMode === 'one') {
                skipOutroHandledTrackId = null;
                safeSeekMedia(els.audio, 0);
                handoffToLocalPlayback({ resetOnlineTime: false });
                safePlayMedia(els.audio, { waitForReady: false, timeoutMs: 4000 });
            } else {
                skipOutroHandledTrackId = track.id;
                playNext();
            }
            return;
        }
    }
    updateActivePlayerProgressControls(updateOne);
    if (state.videoFsModeActive) {
	                updateOne('videoFsTimeCurrent', null, 'videoFsModeSeekSlider', 'videoFsModeProgressFill', 'videoFsTimeRemaining');
	                const now = Date.now();
	                if (dur > 0 && now - lastVideoBufferPaintTs > 400) {
	                    updateVideoBufferBar(dur);
	                    lastVideoBufferPaintTs = now;
	                }
	            }

	            // Lyrics syncing is explicitly mode-scoped:
	            // - Side-by-side lyrics list => windowedMode ONLY
	            // - Line-by-line lyrics overlay => fsMode ONLY
	            const offset = state.lyricsHighlight && typeof state.lyricsHighlight.offset === 'number' ? state.lyricsHighlight.offset : 0;
	            const timeWithOffset = cur + offset;
	            const windowedLyricsActive = !!state.windowedModeActive;
	            const fsModeLyricsActive = !!state.fsModeActive;

	            if (Array.isArray(lrcData) && lrcData.length > 0) {
	                const indexNow = findSyncedLyricIndex(lrcData, timeWithOffset);
	                if (indexNow !== -1) {
	                    const line = lrcData[indexNow];
	                    const nextLine = lrcData[indexNow + 1]?.text || '';

	                    if (windowedLyricsActive) {
	                        if (activeLyricIndex !== -1 && activeLyricIndex !== indexNow) {
	                            const prev = lrcData[activeLyricIndex];
	                            if (prev && prev.el) {
	                                prev.el.classList.remove('lyric-highlight', 'opacity-100');
	                                prev.el.classList.add('opacity-30');
	                            }
	                        }
	                        if (line.el) {
	                            const needsApply = activeLyricIndex !== indexNow || !line.el.classList.contains('lyric-highlight');
	                            if (needsApply) {
	                                line.el.classList.add('lyric-highlight', 'opacity-100');
	                                line.el.classList.remove('opacity-30');
                            // When autoâ€‘highlighting lyrics during playback in windowed mode,
                            // we want to bring the active line into view without shifting the
                            // entire page. If the lyrics container is scrollable (has a
                            // scrollHeight greater than its clientHeight), we manually adjust
                            // its scrollTop so that the highlighted element is vertically
                            // centered.  If the container isnâ€™t scrollable, fall back to
                            // scrollIntoView using `nearest` to avoid pageâ€‘level scrolling.
                            scrollActiveLyricLineIntoView(line.el);
	                            }
	                        }
	                    }

	                    activeLyricIndex = indexNow;
	                    if (state.lyricsHighlight) state.lyricsHighlight.lastIndex = indexNow;
	                    if (fsModeLyricsActive) updateFsModeLyricOverlay(line.text || '', nextLine);
	                } else {
	                    if (windowedLyricsActive && activeLyricIndex !== -1) {
	                        const prev = lrcData[activeLyricIndex];
	                        if (prev && prev.el) {
	                            prev.el.classList.remove('lyric-highlight', 'opacity-100');
	                            prev.el.classList.add('opacity-30');
	                        }
	                    }
	                    activeLyricIndex = -1;
	                    if (state.lyricsHighlight) state.lyricsHighlight.lastIndex = -1;
	                    if (fsModeLyricsActive) updateFsModeLyricOverlay('', '');
	                }
	            } else if (!suppressMusicGameMetrics && state.lyricsHighlight && state.lyricsHighlight.lines && state.lyricsHighlight.lines.length > 0) {
	                const hl = state.lyricsHighlight;
	                if ((!hl.lineDuration || hl.lineDuration <= 0) && hl.lines.length > 0 && dur > 0) {
	                    hl.lineDuration = dur / hl.lines.length;
	                }
	                let idx = -1;
	                if (hl.timestamps && hl.timestamps.length > 0) {
	                    for (let i = 0; i < hl.timestamps.length; i++) {
	                        if (timeWithOffset >= hl.timestamps[i]) idx = i;
	                        else break;
	                    }
	                } else if (hl.lineDuration > 0) {
	                    idx = Math.floor(timeWithOffset / hl.lineDuration);
	                }
	                if (idx < 0 || idx >= hl.lines.length) idx = -1;

	                if (windowedLyricsActive) {
	                    if (hl.lastIndex >= 0 && hl.lastIndex < hl.lines.length && hl.lastIndex !== idx) {
	                        const elOld = hl.lines[hl.lastIndex];
	                        if (elOld) {
	                            elOld.classList.remove('lyric-highlight', 'opacity-100');
	                            elOld.classList.add('opacity-30');
	                        }
	                    }
	                    if (idx >= 0 && idx < hl.lines.length) {
	                        const elNew = hl.lines[idx];
	                        const needsApply = hl.lastIndex !== idx || !elNew?.classList?.contains('lyric-highlight');
	                        if (elNew && needsApply) {
	                            elNew.classList.add('lyric-highlight', 'opacity-100');
	                            elNew.classList.remove('opacity-30');
                        scrollActiveLyricLineIntoView(elNew);
	                        }
	                    }
	                }

	                if (fsModeLyricsActive) {
	                    if (idx >= 0 && idx < hl.lines.length) {
	                        const curText = hl.lines[idx]?.textContent || '';
	                        const nextText = hl.lines[idx + 1]?.textContent || '';
	                        updateFsModeLyricOverlay(curText, nextText);
	                    } else {
	                        updateFsModeLyricOverlay('', '');
	                    }
	                }

	                hl.lastIndex = idx;
	            } else {
	                if (fsModeLyricsActive) updateFsModeLyricOverlay('', '');
    }
    // Refresh media session position for integrations like Lively/lock screen
	            if (state.activeTab === 'stats') {
	                const nowTs = Date.now();
	                if (!lastStatsRefresh || nowTs - lastStatsRefresh > 1200) {
            lastStatsRefresh = nowTs;
            updateStatsLiveSummary(nowTs);
        }
	            }
	            updateMediaPositionState();
	            persistSessionSnapshot({ reason: 'progress-local', throttleMs: 3000 });
        syncPrivateSessionPlayerDeck();
	            scheduleDebugOverlayRefresh();
	        }

// Navigation & Layout
function clearSearch(e, _legacySilent = false, options = {}) {
    if (e) e.stopPropagation();
    const had = !!state.searchQuery;
    state.searchQuery = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) clearBtn.classList.add('hidden');
    // Older empty-state callbacks pass `true` as the second argument. Only
    // suppress rendering when a caller explicitly owns the following render.
    if (had && options.render !== false) renderTracks({ preserveScroll: true });
}

function syncSearchClear() {
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !state.searchQuery);
}

const HIGH_END_TAB_MOTION_SURFACE_CLASS = 'nexplay-high-end-tab-enter';
const HIGH_END_TAB_MOTION_ITEM_CLASS = 'nexplay-high-end-tab-pop';
const HIGH_END_TAB_MOTION_NAV_CLASS = 'nexplay-high-end-tab-nav-pop';
const HIGH_END_TAB_MOTION_SURFACE_PREP_CLASS = 'nexplay-high-end-tab-enter-prep';
const HIGH_END_TAB_MOTION_ITEM_PREP_CLASS = 'nexplay-high-end-tab-pop-prep';
const HIGH_END_TAB_MOTION_NAV_PREP_CLASS = 'nexplay-high-end-tab-nav-pop-prep';
const HIGH_END_TAB_MOTION_MAX_ITEMS = 8;
let highEndTabMotionStartRafId = 0;
let highEndTabMotionCleanupTimer = null;
let highEndTabMotionTargets = [];
let highEndTabMotionEndTarget = null;
let highEndTabMotionEndHandler = null;
let highEndTabMotionToken = 0;

function isHighEndTabMotionElementVisible(element = null) {
    if (!element?.classList || element.classList.contains('hidden')) return false;
    return element.getAttribute?.('aria-hidden') !== 'true';
}

function shouldRunHighEndTabMotion(tabId = '') {
    if (tabId === 'online-videos' || tabId === 'online-music') return false;
    if (typeof getSelectedDesktopPerformancePreset !== 'function'
        || getSelectedDesktopPerformancePreset() !== 'high-end') return false;
    if (typeof getEffectivePerformanceTier !== 'function'
        || getEffectivePerformanceTier() !== 'normal') return false;
    if (!document.body || document.hidden || document.body.classList.contains('reduce-motion')) return false;
    const prefersReducedMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !prefersReducedMotion;
}

function getHighEndTabMotionSurfaces() {
    const scrollArea = document.getElementById('main-scroll-area');
    if (!scrollArea) return [];
    return Array.from(scrollArea.children || [])
        .filter((element) => {
            if (!isHighEndTabMotionElementVisible(element)) return false;
            if (element.id === 'tracks-container' && !element.childElementCount) return false;
            return true;
        })
        .slice(0, 3);
}

function getBoundedHighEndTabMotionChildren(parent = null, limit = HIGH_END_TAB_MOTION_MAX_ITEMS + 1) {
    const visibleChildren = [];
    for (const child of parent?.children || []) {
        if (!isHighEndTabMotionElementVisible(child)) continue;
        visibleChildren.push(child);
        if (visibleChildren.length >= limit) break;
    }
    return visibleChildren;
}

function getHighEndTabMotionCandidates(surface = null) {
    if (!surface) return [];
    if (surface.id === 'tracks-container'
        && surface.firstElementChild?.classList?.contains('library-track-item')) {
        return [];
    }
    let candidates = getBoundedHighEndTabMotionChildren(surface);
    if (surface.id === 'tracks-container' && candidates.length === 1) {
        const pageRoot = candidates[0];
        const nestedPanels = getBoundedHighEndTabMotionChildren(pageRoot);
        if (nestedPanels.length > 1) candidates = nestedPanels;
    }
    return candidates.filter((element) => !element.classList?.contains('library-track-item'));
}

function getHighEndTabMotionPlan() {
    const stages = [];
    const items = [];
    getHighEndTabMotionSurfaces().forEach((surface) => {
        const candidates = getHighEndTabMotionCandidates(surface);
        if (!candidates.length) return;
        stages.push(candidates[0]);
        items.push(...candidates.slice(1));
    });
    return {
        stages: stages.slice(0, 2),
        items: items.slice(0, HIGH_END_TAB_MOTION_MAX_ITEMS)
    };
}

function clearHighEndTabMotion() {
    highEndTabMotionToken += 1;
    if (highEndTabMotionStartRafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(highEndTabMotionStartRafId);
    }
    if (highEndTabMotionCleanupTimer) clearTimeout(highEndTabMotionCleanupTimer);
    if (highEndTabMotionEndTarget && highEndTabMotionEndHandler) {
        highEndTabMotionEndTarget.removeEventListener('animationend', highEndTabMotionEndHandler);
        highEndTabMotionEndTarget.removeEventListener('animationcancel', highEndTabMotionEndHandler);
    }
    highEndTabMotionTargets.forEach((element) => {
        element.classList?.remove(
            HIGH_END_TAB_MOTION_SURFACE_CLASS,
            HIGH_END_TAB_MOTION_ITEM_CLASS,
            HIGH_END_TAB_MOTION_NAV_CLASS,
            HIGH_END_TAB_MOTION_SURFACE_PREP_CLASS,
            HIGH_END_TAB_MOTION_ITEM_PREP_CLASS,
            HIGH_END_TAB_MOTION_NAV_PREP_CLASS
        );
        element.style?.removeProperty('--nexplay-tab-pop-index');
    });
    highEndTabMotionStartRafId = 0;
    highEndTabMotionCleanupTimer = null;
    highEndTabMotionTargets = [];
    highEndTabMotionEndTarget = null;
    highEndTabMotionEndHandler = null;
}

function scheduleHighEndTabMotion(tabId = '') {
    clearHighEndTabMotion();
    const expectedTabId = String(tabId || '');
    if (!shouldRunHighEndTabMotion(expectedTabId)) return false;
    const { stages, items } = getHighEndTabMotionPlan();
    const activeNavButton = document.querySelector?.('#nav-container .accent-bg') || null;
    if (!stages.length && !items.length && !activeNavButton) return false;
    const motionToken = ++highEndTabMotionToken;
    highEndTabMotionTargets = [...stages, ...items, ...(activeNavButton ? [activeNavButton] : [])];
    stages.forEach((stage) => stage.classList.add(HIGH_END_TAB_MOTION_SURFACE_PREP_CLASS));
    items.forEach((item, index) => {
        item.style?.setProperty('--nexplay-tab-pop-index', String(index));
        item.classList.add(HIGH_END_TAB_MOTION_ITEM_PREP_CLASS);
    });
    activeNavButton?.classList.add(HIGH_END_TAB_MOTION_NAV_PREP_CLASS);
    highEndTabMotionStartRafId = requestAnimationFrame(() => {
        highEndTabMotionStartRafId = 0;
        if (motionToken !== highEndTabMotionToken
            || state.activeTab !== expectedTabId
            || !shouldRunHighEndTabMotion(expectedTabId)) {
            if (motionToken === highEndTabMotionToken) clearHighEndTabMotion();
            return;
        }
        stages.forEach((stage) => {
            stage.classList.remove(HIGH_END_TAB_MOTION_SURFACE_PREP_CLASS);
            stage.classList.add(HIGH_END_TAB_MOTION_SURFACE_CLASS);
        });
        items.forEach((item) => {
            item.classList.remove(HIGH_END_TAB_MOTION_ITEM_PREP_CLASS);
            item.classList.add(HIGH_END_TAB_MOTION_ITEM_CLASS);
        });
        if (activeNavButton) {
            activeNavButton.classList.remove(HIGH_END_TAB_MOTION_NAV_PREP_CLASS);
            activeNavButton.classList.add(HIGH_END_TAB_MOTION_NAV_CLASS);
        }
        highEndTabMotionEndTarget = items.at(-1) || stages.at(-1) || activeNavButton;
        const expectedAnimationName = items.length
            ? 'nexplayHighEndTabPanelPop'
            : stages.length
                ? 'nexplayHighEndTabStageIn'
                : 'nexplayHighEndTabNavPop';
        highEndTabMotionEndHandler = (event) => {
            if (motionToken !== highEndTabMotionToken
                || event.target !== highEndTabMotionEndTarget
                || event.animationName !== expectedAnimationName) return;
            clearHighEndTabMotion();
        };
        highEndTabMotionEndTarget.addEventListener('animationend', highEndTabMotionEndHandler);
        highEndTabMotionEndTarget.addEventListener('animationcancel', highEndTabMotionEndHandler);
        highEndTabMotionCleanupTimer = setTimeout(() => {
            if (motionToken === highEndTabMotionToken) clearHighEndTabMotion();
        }, 900);
    });
    return true;
}

function resetMainScrollPosition() {
    const scrollArea = document.getElementById('main-scroll-area');
    if (!scrollArea) return;
    const reset = () => {
        scrollArea.scrollTop = 0;
        scrollArea.scrollLeft = 0;
    };
    // Replacing a long library grid can make Chromium apply scroll anchoring
    // after the synchronous render has finished. Reset immediately for normal
    // route changes, then again across the next two paint opportunities so a
    // newly rendered page never inherits the previous route's scroll offset.
    scrollArea.style.overflowAnchor = 'none';
    reset();
    requestAnimationFrame(() => {
        reset();
        requestAnimationFrame(() => {
            reset();
            scrollArea.style.overflowAnchor = '';
        });
    });
}

async function changeTab(id) {
    // Reset filters when navigating away from Tags or Smart tabs
    const wasPrivateSessionRoute = isPrivateSessionRouteActive();
    const routeChanged = wasPrivateSessionRoute || state.activeTab !== id;
    closeTransientPanels({ queue: true, eq: true, menus: true });
    if (wasPrivateSessionRoute) {
        clearPrivateSessionRoute({ quiet: true, suppressRender: true });
    }
    if (state.activeTab === 'music-games' && id !== 'music-games') {
        await teardownMusicGamesSession({ restorePlayback: true, resetState: true });
    }
    if (state.activeTab === 'notypad' && id !== 'notypad') {
        persistNotyPadNow({ quiet: true });
    }
    state.activeTab = id;
    state.multiSelectMode = false;
    state.selectedTrackIds = [];
    const multiBtn = document.getElementById('multi-select-toggle');
    if (multiBtn) {
        multiBtn.textContent = 'Multi-Select';
        multiBtn.classList.remove('bg-white/10');
    }
    if (id !== 'tags') state.tagFilter = null;
    if (id !== 'smart') state.smartFilter = null;
    if (id !== 'playlists') state.activePlaylistId = null;
    clearSearch(null, true, { render: false });
    updateBulkBar();
    renderNav();
    syncLibraryOnlineToggleButton();
    renderTracks();
    if (routeChanged) {
        resetMainScrollPosition();
        scheduleHighEndTabMotion(id);
    }
}

function renderNav() {
    const navHtml = NAV_TABS.map(t => {
        const isActive = state.activeTab === t.id;
        const activeClasses = isActive
            ? 'accent-bg text-white shadow-[0_0_20px_var(--accent-glow)]'
            : 'text-gray-400 hover:bg-white/5 hover:text-white';
        return `<button onclick="changeTab('${t.id}')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeClasses}">
            <i data-lucide="${t.i}" class="w-4 h-4"></i><span class="font-medium text-sm">${t.l}</span>
        </button>`;
    }).join('');
    document.getElementById('nav-container').innerHTML = navHtml;
    syncHeaderActionVisibility();
    refreshLucideIcons();
}
function syncViewModeButtons() {
    const listBtn = document.getElementById('view-list-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (!listBtn || !gridBtn) return;
    const listActive = state.viewMode !== 'grid';
    listBtn.className = `p-2 rounded-lg transition-all ${listActive ? 'text-white bg-white/10 shadow' : 'text-gray-500 hover:text-white'}`;
    gridBtn.className = `p-2 rounded-lg transition-all ${listActive ? 'text-gray-500 hover:text-white' : 'text-white bg-white/10 shadow'}`;
}
function setViewMode(m) {
    state.viewMode = m;
    state.appSettings = sanitizeAppSettings({
        ...getAppSettings(),
        appearance: {
            ...getAppSettings().appearance,
            defaultViewMode: m
        }
    });
    renderTracks();
    syncViewModeButtons();
    persistAppStateNow();
}
function setSortMode(val) { 
    const [type, dir] = (val || '').split('-');
    state.sortType = type || 'date'; 
    state.sortDirection = dir || 'desc';
    renderTracks({ preserveScroll: true }); 
    persistAppStateNow();
}
function toggleTheme(force = null) {
    const next = typeof force === 'boolean'
        ? (force ? 'dark' : 'light')
        : (getResolvedThemeIsDark() ? 'light' : 'dark');
    state.appSettings = sanitizeAppSettings({
        ...getAppSettings(),
        appearance: {
            ...getAppSettings().appearance,
            themeMode: next
        }
    });
    applyThemePreference(next);
    persistAppStateNow();
}

	        function syncSidebarVisibility() {
	            if (!els.sidebar) return;
	            const desktopLayout = window.innerWidth >= 1024;
	            const shouldShowSidebar = desktopLayout || state.isSidebarOpen;
	            els.sidebar.classList.toggle('-translate-x-full', !shouldShowSidebar);
	            els.sidebar.setAttribute('aria-hidden', shouldShowSidebar ? 'false' : 'true');
	        }

	        function setSidebarOpen(forceOpen) {
	            state.isSidebarOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.isSidebarOpen;
	            syncSidebarVisibility();
	        }

	        function openSidebar() {
	            setSidebarOpen(true);
	        }

	        function closeSidebar() {
	            setSidebarOpen(false);
	        }

	        function toggleSidebar() {
	            setSidebarOpen();
	        }

	        // --- DISPLAY MODES (STRICTLY SEPARATED) ---
	        function getCurrentTrack() {
	            if (state.currentTrack && state.currentTrack.id === state.currentTrackId) return state.currentTrack;
        const next = resolveQueueDisplayTrack(state.currentTrackId) || state.tracks.find(t => t.id === state.currentTrackId) || null;
        state.currentTrack = next;
	            return next;
	        }

	        function exitWindowedMode() {
	            clearLyricHighlight();
	            state.windowedModeActive = false;
	            if (els.windowedModePanel) {
	                els.windowedModePanel.classList.add('hidden');
	                els.windowedModePanel.classList.remove('flex');
	            }
	        }

	        function enterWindowedMode() {
	            const track = getActivePlaybackTrack();
	            if (!track) { showToast('No track playing.', 'info'); return; }
	            if (track.type === 'video') { showToast('Video track: open videoFsMode to view.', 'info'); return; }
    ensureVisualizerLoop();
	            state.windowedModeActive = true;
	            state.fsModeActive = false;
	            state.videoFsModeActive = false;
	            if (els.fsModeOverlay) {
	                els.fsModeOverlay.classList.add('hidden');
	                els.fsModeOverlay.classList.remove('flex');
	            }
	            if (els.videoFsModeOverlay) els.videoFsModeOverlay.classList.add('hidden');
	            if (els.windowedModePanel) {
	                els.windowedModePanel.classList.remove('hidden');
	                els.windowedModePanel.classList.add('flex');
	            }
	            closeTransientPanels({ queue: true, eq: true, menus: true });
	            syncModesWithCurrentTrack();
	        }

	        function toggleWindowedMode() {
	            if (state.windowedModeActive) { exitWindowedMode(); return; }
	            enterWindowedMode();
	        }

	        function exitFsMode() {
	            state.fsModeActive = false;
	            if (els.fsModeOverlay) {
	                els.fsModeOverlay.classList.add('hidden');
	                els.fsModeOverlay.classList.remove('flex');
	            }
	            updateFsModeLyricOverlay('', '');
	            const track = getActivePlaybackTrack();
	            if (track && track.type !== 'video') {
	                enterWindowedMode();
	            }
	        }

	        function enterFsMode() {
	            const track = getActivePlaybackTrack();
	            if (!track) { showToast('No track playing.', 'info'); return; }
	            if (track.type === 'video') { showToast('Video track: use videoFsMode.', 'info'); return; }
    ensureVisualizerLoop();
    // When switching from windowed mode to fsMode we need to clear any active lyric
    // highlight in the windowed lyrics list. Without clearing, the previously
    // highlighted line retains the `lyric-highlight` class, so when returning
    // to windowed mode two lyrics appear highlighted simultaneously (the
    // stale one from before entering fsMode and the current one). See
    // bug description. Resetting here ensures only the fsMode overlay has
    // a highlighted lyric while in fsMode.
    clearLyricHighlight();
	            state.fsModeActive = true;
	            state.windowedModeActive = false;
	            state.videoFsModeActive = false;
	            if (els.windowedModePanel) {
	                els.windowedModePanel.classList.add('hidden');
	                els.windowedModePanel.classList.remove('flex');
	            }
	            if (els.videoFsModeOverlay) els.videoFsModeOverlay.classList.add('hidden');
	            if (els.fsModeOverlay) {
	                els.fsModeOverlay.classList.remove('hidden');
	                els.fsModeOverlay.classList.add('flex');
	            }
	            syncModesWithCurrentTrack();
	        }

function exitVideoFsMode() {
    state.videoFsModeActive = false;
    if (videoControlsHideTimer) { clearTimeout(videoControlsHideTimer); videoControlsHideTimer = null; }
    closeAutoManagedVideoPiP();

    // If the overlay owns fullscreen, exit cleanly so focus is returned.
    const overlay = els.videoFsModeOverlay;
    if (document.fullscreenElement === overlay) {
        document.exitFullscreen?.().catch(() => {});
    }

    if (overlay) {
        overlay.classList.remove('video-controls-hidden');
        overlay.classList.add('hidden');
    }

    // Dock the media element back to the hidden engine location.
    if (els.audio) {
        document.body.appendChild(els.audio);
        els.audio.className = 'hidden';
    }

    // Restore focus immediately to avoid post-fullscreen dead clicks.
    if (typeof document.body?.focus === 'function') {
        setTimeout(() => document.body.focus({ preventScroll: true }), 0);
    }

    updateVideoFullscreenIcon();
    setVideoSpinner(false);
    showVideoControls(true);

    const videoContainer = document.getElementById('videoFsModeVideoContainer');
    if (videoContainer) videoContainer.classList.remove('hide-cursor');

    // Reset sharpness and hide panel
    applyVideoSharpness(0, { persist: false });
    const sharpPanel = document.getElementById('sharpnessPanel');
    const sharpSlider = document.getElementById('sharpnessSlider');
    if (sharpPanel) sharpPanel.classList.add('hidden');
    if (sharpSlider) sharpSlider.value = 0;

    // Reset brightness and hide panel
    applyVideoBrightness(1, { persist: false });
    const brightPanel = document.getElementById('brightnessPanel');
    const brightSlider = document.getElementById('brightnessSlider');
    if (brightPanel) brightPanel.classList.add('hidden');
    if (brightSlider) brightSlider.value = 50;

    // Reset contrast and hide panel
    applyVideoContrast(1, { persist: false });
    const contrastPanel = document.getElementById('contrastPanel');
    const contrastSlider = document.getElementById('contrastSlider');
    if (contrastPanel) contrastPanel.classList.add('hidden');
    if (contrastSlider) contrastSlider.value = 50;
}

function enterVideoFsMode() {
	            const track = getActivePlaybackTrack();
	            if (!track) { showToast('No track playing.', 'info'); return; }
	            if (track.type !== 'video') { showToast('Current track is not a video.', 'info'); return; }
	            state.videoFsModeActive = true;
	            state.windowedModeActive = false;
	            state.fsModeActive = false;
	            if (els.windowedModePanel) {
	                els.windowedModePanel.classList.add('hidden');
	                els.windowedModePanel.classList.remove('flex');
	            }
	            if (els.fsModeOverlay) {
	                els.fsModeOverlay.classList.add('hidden');
	                els.fsModeOverlay.classList.remove('flex');
	            }
	            if (els.videoFsModeOverlay) els.videoFsModeOverlay.classList.remove('hidden');
	            syncModesWithCurrentTrack();
	            setVideoSpinner(false);
	            showVideoControls(true);
	            updateVideoFullscreenIcon();
        maybeApplyVideoModeDefaults(track);
}

	        // Entry point from the mini-player: song => windowedMode, video => videoFsMode.
	        function openNowPlaying() {
	            const track = getActivePlaybackTrack();
	            if (!track) { showToast('No track playing.', 'info'); return; }
	            if (track.type === 'video') {
	                if (state.videoFsModeActive) exitVideoFsMode();
	                else enterVideoFsMode();
	                return;
	            }
	            toggleWindowedMode();
	        }

	        // Hotkey action: song => fsMode, video => videoFsMode.
	        function toggleFsModeForCurrentTrack() {
	            const track = getActivePlaybackTrack();
	            if (!track) { showToast('No track playing.', 'info'); return; }
	            if (track.type === 'video') {
	                if (state.videoFsModeActive) exitVideoFsMode();
	                else enterVideoFsMode();
	                return;
	            }
	            if (state.fsModeActive) exitFsMode();
	            else enterFsMode();
	        }

	        // Ensures the active mode remains compatible with the current track and
	        // keeps the media element placed correctly (videoFsMode only).
	        function syncModesWithCurrentTrack() {
	            const track = getActivePlaybackTrack();
	            if (!track) return;

	            // Enforce mode compatibility explicitly (no shared mode flag).
	            if (state.videoFsModeActive && track.type !== 'video') {
            closeAutoManagedVideoPiP();
	                exitVideoFsMode();
	                return;
	            }
	            if (state.fsModeActive && track.type === 'video') {
	                // fsMode is song-only; exit without falling into a song view.
	                state.fsModeActive = false;
	                if (els.fsModeOverlay) {
	                    els.fsModeOverlay.classList.add('hidden');
	                    els.fsModeOverlay.classList.remove('flex');
	                }
	                updateFsModeLyricOverlay('', '');
	                return;
	            }
	            if (state.windowedModeActive && track.type === 'video') {
	                exitWindowedMode();
	            }

	            // Media element placement: only visible/embedded during videoFsMode.
		            if (track.type === 'video' && state.videoFsModeActive) {
                applyRememberedVideoAdjustments(track);
		                const videoTitle = document.getElementById('videoFsModeHoverTitle');
		                if (videoTitle) {
		                    videoTitle.textContent = track.title || 'Untitled video';
		                    videoTitle.classList.remove('hidden');
	                }
                // No large header: floating pill is the single source of truth.
	                if (els.videoFsModeVideoContainer && els.audio.parentElement !== els.videoFsModeVideoContainer) {
	                    els.videoFsModeVideoContainer.innerHTML = '';
	                    els.videoFsModeVideoContainer.appendChild(els.audio);
	                }
		                els.audio.className = 'w-full h-full';
		                els.audio.classList.remove('hidden');
		                updateVideoBufferBar();
		                showVideoControls(true);
		                updateVideoVolumeUI(state.volume);
		                const spBtn = document.getElementById('videoSpeedBtn');
		                if (spBtn) spBtn.textContent = `${state.playbackSpeed.toFixed(2).replace(/\.00$/,'').replace(/0$/,'')}x`;
                maybeApplyVideoModeDefaults(track);
		            } else {
                closeAutoManagedVideoPiP();
		                const videoTitle = document.getElementById('videoFsModeHoverTitle');
		                if (videoTitle) {
		                    videoTitle.textContent = '';
		                    videoTitle.classList.add('hidden');
	                }
		                const videoMainTitle = document.getElementById('videoFsTitle');
		                const videoMeta = document.getElementById('videoFsMeta');
		                if (videoMainTitle) videoMainTitle.textContent = '';
		                if (videoMeta) videoMeta.textContent = '';
	                // Dock and hide for songs/windowedMode/fsMode.
	                document.body.appendChild(els.audio);
	                els.audio.className = 'hidden';
	            }
	        }

