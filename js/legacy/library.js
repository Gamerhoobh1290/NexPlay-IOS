/* Legacy local library import, metadata, artwork, and lyrics setup.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- CORE FUNCTIONALITY ---

async function requestMediaImport() {
    if (isPrivateSessionRouteActive()) {
        await requestPrivateSessionImport();
        return;
    }
    const fileUploadInput = document.getElementById('file-upload');
    const canUseDesktopPicker = isDesktopRuntimeAvailable()
        && nexPlayDesktopBridge
        && typeof nexPlayDesktopBridge.pickLocalMediaFiles === 'function';
    if (canUseDesktopPicker) {
        try {
            const result = await nexPlayDesktopBridge.pickLocalMediaFiles();
            if (result?.cancelled) return;
            const entries = Array.isArray(result?.entries) ? result.entries : [];
            if (!entries.length) return;
            importDesktopMediaEntries(entries);
            return;
        } catch (error) {
            console.warn('Desktop media picker failed', error);
            showToast('Desktop media picker failed. Falling back to the browser picker.', 'error');
        }
    }
    if (fileUploadInput) fileUploadInput.click();
}

function importDesktopMediaEntries(entries = []) {
    const importableEntries = (Array.isArray(entries) ? entries : []).filter((entry) => {
        return !!(sanitizeText(entry?.path || '') && sanitizeText(entry?.mediaUrl || ''));
    });
    if (!importableEntries.length) return;
    const importToast = showToast(`Importing ${importableEntries.length} file(s)...`, 'info', { duration: 0 });
    const toAdd = [];
    importableEntries.forEach((entry) => {
        const sourcePath = sanitizeText(entry.path || '');
        const mediaUrl = sanitizeText(entry.mediaUrl || '');
        const fileName = sanitizeText(entry.name || sourcePath.split(/[\\/]/).pop() || '');
        if (!sourcePath || !mediaUrl || !fileName) return;
        const type = entry.type === 'video' ? 'video' : inferMediaTypeFromFileName(fileName);
        const size = Math.max(0, Number(entry.size) || 0);
        const lastModified = Math.max(0, Number(entry.lastModified) || 0);
        const fingerprint = sanitizeText(`${fileName}|${size}|${lastModified}`);
        const storedMeta = getStoredMetadataBySource(sourcePath, fingerprint) || state.metadataStore?.[fingerprint] || null;
        let name = sanitizeText(fileName.replace(/\.[^/.]+$/, ''));
        let artist = 'Unknown';
        if (name.includes('-')) {
            const p = name.split('-');
            artist = sanitizeText(p[0]);
            name = sanitizeText(p.slice(1).join('-'));
        }
        const nextTitle = sanitizeText(storedMeta?.title || name);
        const nextArtist = sanitizeText(storedMeta?.artist || artist);
        const duplicateMatches = state.tracks.filter((t) => t && t.title === nextTitle && t.artist === nextArtist);
        const hasBlockingDuplicate = duplicateMatches.some((t) => t.source !== 'online-music');
        if (hasBlockingDuplicate) {
            appendOnlineMusicImportReviewItem({
                kind: 'duplicate',
                title: `${fileName} skipped`,
                detail: `Exact duplicate detected for ${nextArtist || 'Unknown'} - ${nextTitle || fileName}.`
            });
            showToast(`${fileName} already exists.`, 'error');
            return;
        }
        const trackData = {
            id: generateId(),
            title: nextTitle,
            artist: nextArtist,
            type,
            source: 'local',
            url: mediaUrl,
            duration: Number(storedMeta?.duration) || 0,
            size,
            addedAt: Date.now(),
            isFavorite: !!storedMeta?.isFavorite,
            cover: storedMeta?.cover || '',
            tags: Array.isArray(storedMeta?.tags) ? storedMeta.tags.map(sanitizeText).filter(Boolean) : [],
            playCount: Number(storedMeta?.playCount) || 0,
            skipCount: Number(storedMeta?.skipCount) || 0,
            lastSkippedAt: Number(storedMeta?.lastSkippedAt) || 0,
            listeningTime: Number(storedMeta?.listeningTime) || 0,
            resumePosition: Number(storedMeta?.resumePosition) || 0,
            resumeUpdatedAt: Number(storedMeta?.resumeUpdatedAt) || 0,
            customLyrics: typeof storedMeta?.customLyrics === 'string' ? storedMeta.customLyrics : '',
            fingerprint,
            fileName,
            sourcePath,
            watchFolderId: sanitizeText(storedMeta?.watchFolderId || ''),
            sourceFingerprint: sanitizeText(storedMeta?.sourceFingerprint || fingerprint),
            originProvider: sanitizeText(storedMeta?.originProvider || ''),
            originReleaseId: sanitizeText(storedMeta?.originReleaseId || ''),
            downloadedAt: Number(storedMeta?.downloadedAt) || 0,
            downloadState: sanitizeText(storedMeta?.downloadState || ''),
            lastModified,
            persistedLocally: true
        };
        if (!trackData.cover || !(Number(trackData.duration) > 0)) {
            const missingBits = [
                !trackData.cover ? 'cover art' : '',
                !(Number(trackData.duration) > 0) ? 'duration' : ''
            ].filter(Boolean).join(' and ');
            appendOnlineMusicImportReviewItem({
                kind: 'metadata',
                title: `${trackData.title || fileName} needs review`,
                detail: `Imported without ${missingBits}. NexPlay will try to enrich it later.`,
                trackId: trackData.id
            });
        }
        toAdd.push(trackData);
    });
    if (toAdd.length === 0) {
        if (importToast && importToast.close) importToast.close(1800, 'No New Files');
        return;
    }
    state.tracks.push(...toAdd);
    if (state.isShuffle) {
        buildShuffleQueue(state.currentTrackId || (toAdd[0] && toAdd[0].id), currentMediaType());
    } else {
        clearShuffleState();
    }
    renderTracks();
    const statsEl = document.getElementById('library-stats');
    if (statsEl) {
        statsEl.innerHTML = `${state.tracks.length} <span class="text-xs font-normal text-gray-500">tracks</span>`;
    }
    refreshLiveViews();
    state.metadataQueue.push(...toAdd);
    if (!state.processingQueue) processMetadata();
    persistLocalLibraryIndex();
    if (importToast && importToast.close) {
        importToast.close(2500, 'Imported');
    }
    window.dispatchEvent(new CustomEvent('nexplay:import-complete', {
        detail: {
            count: toAdd.length,
            trackIds: toAdd.map((track) => track.id)
        }
    }));
}

function handleFileUpload(e) {
    if (isPrivateSessionRouteActive()) {
        handlePrivateSessionFiles(e?.target?.files || []);
        if (e?.target) e.target.value = '';
        return;
    }
    handleFiles(e.target.files);
    e.target.value = '';
}

function handleFiles(fileList) {
    if (!fileList.length) return;
    const importToast = showToast(`Importing ${fileList.length} file(s)...`, 'info', { duration: 0 });
    // Build a list of new tracks while checking for duplicates.  If a file
    // matches an existing track (same parsed title and artist), skip
    // adding it and notify the user via a toast.  This prevents
    // accidental re-uploads of the same song.
    const toAdd = [];
    const persistedLocalEntries = [];
    Array.from(fileList).forEach(file => {
        const isVideo = isVideoFile(file);
        const isAudio = isAudioFile(file);
        if (!isVideo && !isAudio) return;
        let name = sanitizeText(file.name.replace(/\.[^/.]+$/, ""));
        let artist = 'Unknown';
        if(name.includes('-')) {
            const p = name.split('-');
            artist = sanitizeText(p[0]);
            name = sanitizeText(p.slice(1).join('-'));
        }
        const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;
        const storedMeta = getStoredMetadataForFile(file);
        const nextTitle = sanitizeText(storedMeta?.title || name);
        const nextArtist = sanitizeText(storedMeta?.artist || artist);
        const duplicateMatches = state.tracks.filter((t) => t && t.title === nextTitle && t.artist === nextArtist);
        const hasBlockingDuplicate = duplicateMatches.some((t) => t.source !== 'online-music');
        if (hasBlockingDuplicate) {
            appendOnlineMusicImportReviewItem({
                kind: 'duplicate',
                title: `${file.name} skipped`,
                detail: `Exact duplicate detected for ${nextArtist || 'Unknown'} - ${nextTitle || file.name}.`
            });
            showToast(`${file.name} already exists.`, 'error');
            return;
        }
        const trackData = {
            id: generateId(),
            title: nextTitle,
            artist: nextArtist,
            type: isVideo ? 'video' : 'audio',
            source: 'local',
            url: URL.createObjectURL(file),
            duration: storedMeta?.duration || 0,
            size: file.size,
            addedAt: Date.now(),
            isFavorite: storedMeta?.isFavorite || false,
            cover: storedMeta?.cover || '',
            tags: Array.isArray(storedMeta?.tags) ? storedMeta.tags.map(sanitizeText).filter(Boolean) : [],
            playCount: storedMeta?.playCount || 0,
            skipCount: storedMeta?.skipCount || 0,
            lastSkippedAt: storedMeta?.lastSkippedAt || 0,
            listeningTime: storedMeta?.listeningTime || 0,
            resumePosition: storedMeta?.resumePosition || 0,
            resumeUpdatedAt: storedMeta?.resumeUpdatedAt || 0,
            customLyrics: typeof storedMeta?.customLyrics === 'string' ? storedMeta.customLyrics : '',
            fingerprint,
            fileName: sanitizeText(file.name),
            sourcePath: sanitizeText(storedMeta?.sourcePath || ''),
            watchFolderId: sanitizeText(storedMeta?.watchFolderId || ''),
            sourceFingerprint: sanitizeText(storedMeta?.sourceFingerprint || ''),
            originProvider: sanitizeText(storedMeta?.originProvider || ''),
            originReleaseId: sanitizeText(storedMeta?.originReleaseId || ''),
            downloadedAt: Number(storedMeta?.downloadedAt) || 0,
            downloadState: sanitizeText(storedMeta?.downloadState || ''),
            lastModified: Math.max(0, Number(file.lastModified) || 0),
            persistedLocally: false
        };
        if (!trackData.cover || !(Number(trackData.duration) > 0)) {
            const missingBits = [
                !trackData.cover ? 'cover art' : '',
                !(Number(trackData.duration) > 0) ? 'duration' : ''
            ].filter(Boolean).join(' and ');
            appendOnlineMusicImportReviewItem({
                kind: 'metadata',
                title: `${trackData.title || file.name} needs review`,
                detail: `Imported without ${missingBits}. NexPlay will try to enrich it later.`,
                trackId: trackData.id
            });
        }
        toAdd.push(trackData);
        persistedLocalEntries.push({ track: trackData, file });
    });
    if (toAdd.length === 0) {
        if (importToast && importToast.close) importToast.close(1800, 'No New Files');
        return;
    }
    state.tracks.push(...toAdd);
    if (state.isShuffle) {
        buildShuffleQueue(state.currentTrackId || (toAdd[0] && toAdd[0].id), currentMediaType());
    } else {
        clearShuffleState();
    }
    renderTracks();
    // Update library stats for number of tracks after adding
    const statsEl = document.getElementById('library-stats');
    if (statsEl) {
        statsEl.innerHTML = `${state.tracks.length} <span class="text-xs font-normal text-gray-500">tracks</span>`;
    }
    refreshLiveViews();
    // Push new tracks into the metadata processing queue for cover fetching
    state.metadataQueue.push(...toAdd);
    if(!state.processingQueue) processMetadata();
    if (importToast && importToast.close) {
        importToast.close(2500, 'Imported');
    }
    persistImportedLocalFiles(persistedLocalEntries).catch((error) => {
        console.warn('Failed to save imported local files for reload', error);
        announceLocalLibraryPersistenceWarning('Imported files are available now, but reload persistence failed for this browser session.');
    });
    window.dispatchEvent(new CustomEvent('nexplay:import-complete', {
        detail: {
            count: toAdd.length,
            trackIds: toAdd.map((track) => track.id)
        }
    }));
}

	        async function processMetadata() {
	            state.processingQueue = true;
	            metadataProcessingStartedAt = Date.now();
	            beginLoadingWatchdog('metadata-processing', 25000, () => {
	                state.processingQueue = false;
	                const status = document.getElementById('queue-status');
	                if (status) {
	                    status.classList.add('hidden');
	                    status.classList.remove('flex');
	                    status.textContent = 'SYNCING...';
	                }
	                logRecovery('metadata-processing-timeout', 'Metadata processing timed out and was stopped safely', {
	                    pendingCount: safeArray(state.metadataQueue).length
	                });
	                showInternalNotice('Metadata loading timed out, using fallback.', 'warn');
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	            });
	            logAction('metadata-processing-start', 'Metadata processing started', {
	                pendingCount: safeArray(state.metadataQueue).length
	            });
	            const status = document.getElementById('queue-status');
	            if (status) {
	                status.textContent = 'IMPORTING...';
	                status.classList.remove('hidden');
	                status.classList.add('flex');
	            }
	            try {
	                while (state.metadataQueue.length > 0) {
	                    const track = state.metadataQueue.shift();
	                    if (status) status.textContent = `IMPORTING (${state.metadataQueue.length + 1} left)...`;
	                    if (!track) continue;
	                    if (!track.duration || isNaN(track.duration)) {
	                        await fetchTrackDuration(track);
	                    }
	                    const cacheKey = `${(track.artist || '').toLowerCase()}|${(track.title || '').toLowerCase()}`;
	                    if (!track.cover && state.coverCache[cacheKey]) {
	                        track.cover = state.coverCache[cacheKey];
	                        updateTrackUI(track);
	                    }
	                    if (track.type === 'video') {
	                        await generateVideoThumb(track);
	                    } else {
	                        // Waterfall API Strategy
	                        let cover = null;
	                        if (!track.cover) {
	                            cover = await fetchDeezer(track);
	                        }
	                        if (!cover && !track.cover) {
	                            cover = await fetchItunes(track);
	                        }
	                        const finalCover = cover || track.cover;
	                        if (finalCover) {
	                            track.cover = finalCover;
	                            if (!/^data:/i.test(finalCover)) {
	                                state.coverCache[cacheKey] = finalCover;
	                            }
	                            updateTrackUI(track);
	                        }
	                    }
	                    persistTrackMetadata(track);
	                    await new Promise(r => setTimeout(r, 150));
	                }
	            } catch (error) {
	                logError('metadata-processing-failed', 'Metadata processing encountered an error', {
	                    error: sanitizeText(error?.message || '')
	                });
	                showInternalNotice('Metadata processing failed, continuing safely.', 'warn');
	            } finally {
	                clearLoadingWatchdog('metadata-processing');
	                metadataProcessingStartedAt = 0;
	                state.processingQueue = false;
	                if (status) {
	                    status.classList.add('hidden');
	                    status.classList.remove('flex');
	                    status.textContent = 'SYNCING...';
	                }
	                logAction('metadata-processing-finish', 'Metadata processing finished', {
	                    pendingCount: safeArray(state.metadataQueue).length
	                });
	            }
	        }

async function fetchTrackDuration(track) {
    return new Promise(resolve => {
        try {
            const probe = document.createElement(track.type === 'video' ? 'video' : 'audio');
            let settled = false;
            const finish = (duration = 0) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                probe.onloadedmetadata = null;
                probe.onerror = null;
                try {
                    probe.pause();
                    probe.removeAttribute('src');
                    probe.load();
                } catch (_) {}
                resolve(duration);
            };
            const timeoutId = setTimeout(() => finish(0), 3500);
            probe.preload = 'metadata';
            probe.src = track.url;
            probe.onloadedmetadata = () => {
                track.duration = probe.duration || 0;
                persistTrackMetadata(track);
                updateVisibleTrackDurationLabels(track.id, track.duration);
                finish(track.duration);
            };
            probe.onerror = () => finish(0);
        } catch (e) {
            resolve(0);
        }
    });
}

function persistMetadataStoreWithFallback(preferredKey = '') {
    const snapshot = state.metadataStore && typeof state.metadataStore === 'object'
        ? state.metadataStore
        : {};
    if (writeStorageJson('nexplay_pro_metadata', snapshot)) return true;

    try {
        const working = { ...snapshot };
        const removable = Object.entries(working)
            .filter(([, meta]) =>
                typeof meta?.cover === 'string'
                && /^data:image\//i.test(meta.cover)
            )
            .sort((a, b) => {
                // Preserve the track being edited until every other embedded
                // artwork candidate has been tried.
                const preferredOrder = Number(a[0] === preferredKey) - Number(b[0] === preferredKey);
                return preferredOrder || (b[1].cover.length || 0) - (a[1].cover.length || 0);
            });

        for (const [key] of removable) {
            const item = working[key];
            if (!item) continue;
            working[key] = { ...item, cover: '' };
            if (writeStorageJson('nexplay_pro_metadata', working)) {
                state.metadataStore = working;
                return true;
            }
        }
    } catch (_) {}
    return false;
}

function persistTrackMetadata(track) {
    if (!track) return false;
    if (shouldBypassPrivateSessionTrackPersistence(track)) return false;
    const keys = getTrackMetadataKeys(track);
    if (!keys.length) return false;
    const payload = {
        title: track.title,
        artist: track.artist,
        tags: track.tags || [],
        cover: track.cover || '',
        customLyrics: typeof track.customLyrics === 'string' ? track.customLyrics : '',
        isFavorite: !!track.isFavorite,
        playCount: track.playCount || 0,
        duration: track.duration || 0,
        skipCount: track.skipCount || 0,
        lastSkippedAt: track.lastSkippedAt || 0,
        listeningTime: track.listeningTime || 0,
        resumePosition: clampNumber(track.resumePosition, 0, Number.MAX_SAFE_INTEGER, 0),
        resumeUpdatedAt: clampNumber(track.resumeUpdatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        sourcePath: sanitizeText(track.sourcePath || ''),
        watchFolderId: sanitizeText(track.watchFolderId || ''),
        sourceFingerprint: sanitizeText(track.sourceFingerprint || ''),
        originProvider: sanitizeText(track.originProvider || track.provider || ''),
        originReleaseId: sanitizeText(track.originReleaseId || ''),
        downloadedAt: Number(track.downloadedAt) || 0,
        downloadState: sanitizeText(track.downloadState || '')
    };
    keys.forEach((key) => {
        state.metadataStore[key] = { ...payload };
    });
    const persisted = persistMetadataStoreWithFallback(keys[0]);
    if (isPersistableLocalTrack(track)) persistLocalLibraryIndex();
    return persisted;
}

// --- API HELPERS ---
function cleanStr(s) { return s.replace(/\(Official Video\)|\(Lyrics\)|\.mp3|\.wav|ft\.|feat\./gi, "").trim(); }

async function fetchItunes(track) {
    try {
        const payload = await fetchJsonpPayload(
            `https://itunes.apple.com/search?term=${encodeURIComponent(cleanStr(track.artist + ' ' + track.title))}&media=music&limit=1`,
            { callbackPrefix: 'nexplay_itunes_cover_', timeoutMs: 2500, errorMessage: 'iTunes artwork request failed.' }
        );
        return payload?.resultCount && payload?.results?.[0]?.artworkUrl100
            ? payload.results[0].artworkUrl100.replace('100x100', '600x600')
            : null;
    } catch (_) {
        return null;
    }
}

async function fetchDeezer(track) {
    try {
        const payload = await fetchJsonpPayload(
            `https://api.deezer.com/search?q=${encodeURIComponent(cleanStr(track.artist + ' ' + track.title))}&limit=1&output=jsonp`,
            { callbackPrefix: 'nexplay_deezer_cover_', timeoutMs: 2500, errorMessage: 'Deezer artwork request failed.' }
        );
        return payload?.data?.[0]?.album?.cover_xl || null;
    } catch (_) {
        return null;
    }
}

	        function normalizeSyncedLyricTimeline(entries = []) {
	            const sorted = (entries || []).slice().sort((a, b) => a.time - b.time);
	            const deduped = new Map();
	            sorted.forEach((entry) => {
	                const text = String(entry?.text || '').trim();
	                let time = Number(entry?.time);
	                if (!text || !Number.isFinite(time)) return;
	                time = Math.max(0, time);
	                // Keep one line per timestamp (latest wins) to avoid zero-length highlight windows.
	                const keyMs = Math.round(time * 1000);
	                deduped.set(keyMs, { time: keyMs / 1000, text });
	            });
	            return Array.from(deduped.values()).sort((a, b) => a.time - b.time);
	        }

	        function parseSyncedLyrics(raw) {
	            if (!raw) return [];
	            const text = String(raw).replace(/^\uFEFF/, '');
	            if (text.length > LYRICS_MAX_RAW_LENGTH) return [];
	            const lines = text.split(/\r?\n/);
	            if (lines.length > LYRICS_MAX_SOURCE_LINES) return [];
	            const parsed = [];
	            const offsetMatch = text.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
	            const offsetSeconds = offsetMatch ? (Number(offsetMatch[1]) || 0) / 1000 : 0;
	            const timeRegex = /\[(\d{1,3}):([0-5]?\d)(?:[\.,:](\d{1,3}))?\]/g;
	            lines.forEach((lineRaw) => {
	                const line = String(lineRaw || '');
	                let match;
	                const times = [];
	                timeRegex.lastIndex = 0;
	                while ((match = timeRegex.exec(line)) !== null) {
	                    const min = parseInt(match[1], 10);
	                    const sec = parseInt(match[2], 10);
	                    const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
	                    const base = min * 60 + sec + ms / 1000;
	                    if (Number.isFinite(base)) times.push(base + offsetSeconds);
	                }
	                const lyricText = line.replace(/\[(\d{1,3}):([0-5]?\d)(?:[\.,:](\d{1,3}))?\]/g, '').trim();
	                if (!lyricText || times.length === 0) return;
	                times.forEach((time) => {
	                    if (parsed.length < LYRICS_MAX_PARSED_LINES) parsed.push({ time, text: lyricText });
	                });
	            });
	            return normalizeSyncedLyricTimeline(parsed);
	        }

	        function findSyncedLyricIndex(lines, timeValue) {
	            if (!Array.isArray(lines) || lines.length === 0 || !Number.isFinite(timeValue)) return -1;
	            let lo = 0;
	            let hi = lines.length - 1;
	            let result = -1;
	            while (lo <= hi) {
	                const mid = (lo + hi) >> 1;
	                if (timeValue >= lines[mid].time) {
	                    result = mid;
	                    lo = mid + 1;
	                } else {
	                    hi = mid - 1;
	                }
	            }
	            return result;
	        }

	        const LYRICS_SOURCE_BADGE_CLASS = 'text-xs font-bold bg-white/10 px-2 py-1 rounded text-white';

	        function normalizeLyricsCacheSegment(value) {
	            return (value || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
	        }

function getLyricsCacheArtistVariants(value = '') {
    const base = normalizeLyricsLookupText(normalizeLyricsArtistName(value || ''));
    if (!base) return [];
    const primary = normalizeLyricsLookupText((base || '').split(/\s*(?:,|&| x | X | and | with )\s*/)[0] || base);
    return Array.from(new Set([base, primary].filter(Boolean)));
}

function getLyricsCacheTitleVariants(value = '') {
    const base = normalizeLyricsLookupText(value || '');
    if (!base) return [];
    const noFeat = normalizeLyricsLookupText(base.replace(/\b(?:ft|feat|featuring)\b\.?\s+.+$/i, ' ')) || base;
    const noSuffix = normalizeLyricsLookupText(noFeat.replace(/\s+-\s+.*$/, ' ')) || noFeat;
    const noBrackets = normalizeLyricsLookupText(noSuffix.replace(/\s*[\(\[\{][^)\]\}]{1,80}[\)\]\}]\s*/g, ' ')) || noSuffix;
    const noQuotes = noBrackets.replace(/["']/g, '').trim();
    return Array.from(new Set([base, noFeat, noSuffix, noBrackets, noQuotes].filter(Boolean)));
}

	        function getLyricsCacheKeys(track, artist, title) {
	            const keys = [];
	            if (track?.fingerprint) keys.push(`fp:${track.fingerprint}`);
	            if (track?.fileName && track?.size != null) keys.push(`fs:${track.fileName}|${track.size}`);
    const rawArtist = artist === ''
        ? ''
        : (artist || track?.lyricsArtist || track?.artist || '');
    const rawTitle = title === ''
        ? ''
        : (title || track?.lyricsTitle || track?.title || track?.fileName || '');
    const artistVariants = getLyricsCacheArtistVariants(rawArtist);
    const titleVariants = getLyricsCacheTitleVariants(rawTitle);
    if (artistVariants.length || titleVariants.length) {
        const safeArtists = artistVariants.length ? artistVariants : [''];
        const safeTitles = titleVariants.length ? titleVariants : [''];
        safeArtists.forEach((artistKey) => {
            safeTitles.forEach((titleKey) => {
                const normArtist = normalizeLyricsCacheSegment(artistKey);
                const normTitle = normalizeLyricsCacheSegment(titleKey);
                if (normArtist || normTitle) keys.push(`at:${normArtist}|${normTitle}`);
            });
        });
    } else {
	            const normArtist = normalizeLyricsCacheSegment(cleanStr(rawArtist));
	            const normTitle = normalizeLyricsCacheSegment(cleanStr(rawTitle));
	            if (normArtist || normTitle) keys.push(`at:${normArtist}|${normTitle}`);
    }
	            return Array.from(new Set(keys));
	        }

	        function detectLyricsFormat(raw) {
	            try {
	                return parseSyncedLyrics(raw).length > 0 ? 'lrc' : 'plain';
	            } catch (e) {
	                return 'plain';
	            }
	        }

const LYRICS_FETCH_TIMEOUT_MS = 12000;
const LYRICS_LRCLIB_TIMEOUT_MS = 30000;
const LYRICS_WATCHDOG_TIMEOUT_MS = 45000;
const LYRICS_STRONG_SYNC_SCORE = 118;
const LYRICS_CACHE_SCHEMA_VERSION = 2;
const LYRICS_MIN_STRONG_LINE_COUNT = 8;
const LYRICS_MIN_STRONG_TIMELINE_SPAN_SECONDS = 24;
const LYRICS_MAX_RAW_LENGTH = 500000;
const LYRICS_MAX_SOURCE_LINES = 10000;
const LYRICS_MAX_PARSED_LINES = 5000;
const LYRICS_QUERY_LIMIT = 5;
const LYRICS_LRCLIB_SEARCH_RESULT_LIMIT = 20;
const LYRICS_PROVIDER_BONUS = Object.freeze({
    'lrclib:get': 28,
    'lrclib:search:q': 22,
    'lrclib:search': 14,
    'lyrics.ovh': -10
});
const LYRICS_QUERY_REASON_BONUS = Object.freeze({
    exact: 12,
    'website-keyword': 10,
    'website-keyword-title-first': 8,
    'clean-title': 8,
    'primary-artist': 6,
    'title-core': 4,
    'title-no-brackets': 3,
    'ascii-title': 1,
    'title-only': -12
});
const LYRICS_MIN_SYNC_SCORE = 45;
const LYRICS_MIN_PLAIN_SCORE = 42;
const LYRICS_MIN_OVH_SCORE = 58;
let activeLyricsLookupController = null;

function isPrivateLyricsContext(track = null) {
    if (typeof isPrivateSessionTrackRecord === 'function' && isPrivateSessionTrackRecord(track)) return true;
    if (typeof isPrivateSessionRouteActive === 'function' && isPrivateSessionRouteActive()) return true;
    if (typeof shouldBypassPrivateSessionTrackPersistence === 'function' && shouldBypassPrivateSessionTrackPersistence(track)) return true;
    return false;
}

function cancelActiveLyricsLookup() {
    const controller = activeLyricsLookupController;
    activeLyricsLookupController = null;
    if (controller && typeof controller.abort === 'function' && !controller.signal?.aborted) {
        try { controller.abort(); } catch (_) {}
    }
}

function beginActiveLyricsLookup() {
    cancelActiveLyricsLookup();
    if (typeof AbortController !== 'function') return null;
    activeLyricsLookupController = new AbortController();
    return activeLyricsLookupController;
}

function releaseActiveLyricsLookup(controller = null) {
    if (controller && activeLyricsLookupController === controller) activeLyricsLookupController = null;
}

function normalizeLyricsLookupText(value = '') {
    return cleanStr(String(value || ''))
        .replace(/\.[a-z0-9]{2,4}$/i, ' ')
        .replace(/[_]+/g, ' ')
        .replace(/[\(\[\{]\s*(?:ft|feat|featuring)\.?\s+[^)\]\}]*[\)\]\}]/gi, ' ')
        .replace(/[\(\[\{]\s*with\s+[^)\]\}]*[\)\]\}]/gi, ' ')
        .replace(/\s*[\(\[\{]\s*(?:official|lyrics?|lyric video|audio|video|visualizer|live|remaster(?:ed)?(?: \d{4})?|acoustic|demo|edit|mix|version|explicit|clean|sped up|slowed(?: down)?|reverb|bass boosted)[^)\]\}]*[\)\]\}]\s*/gi, ' ')
        .replace(/\b(?:official|lyric video|lyrics?|audio|video|visualizer|hd|hq|4k)\b/gi, ' ')
        .replace(/\b(?:ft|feat|featuring)\b\.?\s+.+$/i, ' ')
        .replace(/\s+-\s+(?:official|lyrics?|lyric video|audio|video|visualizer|live|remaster(?:ed)?(?: \d{4})?|acoustic|demo|edit|mix|version|explicit|clean|sped up|slowed(?: down)?|reverb).*/gi, ' ')
        .replace(/[|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeLyricsArtistName(value = '') {
    return sanitizeText(value || '')
        .replace(/\s*-\s*topic\b/gi, ' ')
        .replace(/\bvevo\b/gi, ' ')
        .replace(/\bofficial artist channel\b/gi, ' ')
        .replace(/\bofficial\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeLyricsLookupText(value = '') {
    const normalized = normalizeLyricsLookupText(value).toLocaleLowerCase();
    try {
        return normalized.match(/[\p{L}\p{N}']+/gu) || [];
    } catch (_) {
        return normalized.split(/[^a-z0-9']+/).filter(Boolean);
    }
}

function normalizeLyricsTrustText(value = '') {
    let text = sanitizeText(value || '');
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text
        .toLocaleLowerCase()
        .replace(/\.[a-z0-9]{2,4}$/i, ' ')
        .replace(/\b(?:official(?: music)? video|official audio|lyrics?|lyric video|audio only|visuali[sz]er|hd|hq|4k)\b/giu, ' ')
        .replace(/[\p{P}\p{S}_]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeLyricsTrustText(value = '') {
    const normalized = normalizeLyricsTrustText(value);
    try {
        return normalized.match(/[\p{L}\p{N}']+/gu) || [];
    } catch (_) {
        return normalized.split(/[^a-z0-9']+/).filter(Boolean);
    }
}

function getLyricsStrictTokenOverlapRatio(source = '', target = '') {
    const sourceTokens = new Set(tokenizeLyricsTrustText(source));
    const targetTokens = new Set(tokenizeLyricsTrustText(target));
    if (!sourceTokens.size || !targetTokens.size) return 0;
    let shared = 0;
    sourceTokens.forEach((token) => { if (targetTokens.has(token)) shared++; });
    return shared / Math.max(sourceTokens.size, targetTokens.size, 1);
}

function getLyricsVersionQualifiers(value = '') {
    const normalized = normalizeLyricsTrustText(value);
    const matches = normalized.match(/\b(?:live|acoustic|remix|remastered?|demo|instrumental|karaoke|edit|mix|version|clean|explicit|sped up|slowed(?: down)?|reverb|bass boosted)\b/giu) || [];
    return Array.from(new Set(matches.map((item) => item.toLocaleLowerCase()))).sort();
}

function haveMatchingLyricsVersionQualifiers(left = '', right = '') {
    const leftQualifiers = getLyricsVersionQualifiers(left);
    const rightQualifiers = getLyricsVersionQualifiers(right);
    if (leftQualifiers.length !== rightQualifiers.length) return false;
    return leftQualifiers.every((value, index) => value === rightQualifiers[index]);
}

function getLyricsStrictExpectedIdentity(artist, title, track = null) {
    const rawArtist = artist === ''
        ? ''
        : (track?.lyricsArtist || track?.artist || artist || '');
    const baseTitle = title === ''
        ? ''
        : (track?.lyricsTitle || track?.title || track?.fileName || title || '');
    const sourceTitle = title === '' ? '' : (track?.title || title || baseTitle);
    const sourceQualifiers = getLyricsVersionQualifiers(sourceTitle);
    const baseQualifiers = new Set(getLyricsVersionQualifiers(baseTitle));
    const missingQualifiers = sourceQualifiers.filter((value) => !baseQualifiers.has(value));
    const rawTitle = [baseTitle, ...missingQualifiers].filter(Boolean).join(' ');
    return {
        artist: sanitizeText(rawArtist),
        title: sanitizeText(rawTitle)
    };
}

function isStrongLyricsIdentityMatch(meta = {}, strictExpected = {}, query = {}) {
    const candidateArtist = meta.artist || meta.artistName || '';
    const candidateTitle = meta.title || meta.trackName || '';
    const expectedArtist = strictExpected.artist || '';
    const expectedTitle = strictExpected.title || '';
    if (!candidateArtist || !candidateTitle || !expectedArtist || !expectedTitle) return false;
    if (!query.artist || query.reason === 'title-only') return false;
    if (!haveMatchingLyricsVersionQualifiers(candidateTitle, expectedTitle)) return false;
    const titleRatio = getLyricsStrictTokenOverlapRatio(candidateTitle, expectedTitle);
    const artistRatio = getLyricsStrictTokenOverlapRatio(candidateArtist, expectedArtist);
    return titleRatio >= 0.8 && artistRatio >= 0.6;
}

function getLyricsTokenOverlapRatio(source = '', target = '') {
    const sourceTokens = new Set(tokenizeLyricsLookupText(source));
    const targetTokens = new Set(tokenizeLyricsLookupText(target));
    if (!sourceTokens.size || !targetTokens.size) return 0;
    let shared = 0;
    sourceTokens.forEach(token => { if (targetTokens.has(token)) shared++; });
    return shared / Math.max(sourceTokens.size, targetTokens.size, 1);
}

function getLyricsTokenOverlapScore(source = '', target = '') {
    return getLyricsTokenOverlapRatio(source, target) * 18;
}

function getLyricsExpectedIdentity(artist, title, track = null) {
    const rawArtist = artist === ''
        ? ''
        : (artist || track?.lyricsArtist || track?.artist || '');
    const rawTitle = title === ''
        ? ''
        : (title || track?.lyricsTitle || track?.title || track?.fileName || '');
    return {
        artist: normalizeLyricsLookupText(normalizeLyricsArtistName(rawArtist)),
        title: normalizeLyricsLookupText(rawTitle)
    };
}

function isLyricsCandidateMatch(meta = {}, expected = {}, query = {}) {
    const expectedTitle = normalizeLyricsLookupText(expected.title || '');
    const expectedArtist = normalizeLyricsLookupText(expected.artist || '');
    const candidateTitle = normalizeLyricsLookupText(meta.title || meta.trackName || query.title || '');
    const candidateArtist = normalizeLyricsLookupText(meta.artist || meta.artistName || query.artist || '');
    if (!expectedTitle || !candidateTitle) return false;
    const titleRatio = getLyricsTokenOverlapRatio(candidateTitle, expectedTitle);
    if (titleRatio < 0.58) return false;
    if (expectedArtist) {
        if (!candidateArtist) return false;
        const artistRatio = getLyricsTokenOverlapRatio(candidateArtist, expectedArtist);
        if (artistRatio < 0.34) return false;
    }
    return true;
}

function isOfflineLyricsEntryTrusted(entry, artist, title, track = null) {
    if (!entry?.raw) return false;
    const expected = getLyricsExpectedIdentity(artist, title, track);
    const hasIdentity = !!(entry.artist || entry.title);
    if (!hasIdentity) return false;
    return isLyricsCandidateMatch(
        { artist: entry.artist || '', title: entry.title || '' },
        expected,
        { artist: entry.artist || '', title: entry.title || '' }
    );
}

function isUnknownLyricsArtist(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return true;
    const normalized = normalizeLyricsLookupText(normalizeLyricsArtistName(raw));
    if (!normalized) return true;
    if (/^(unknown|youtube|various artists?)$/i.test(normalized)) return true;
    if (/\b(?:official|channel|music)\b/i.test(normalized) && normalized.split(/\s+/).length <= 3) return true;
    return false;
}

function buildLyricsLookupQueries(artist, title, track = null) {
    const rawArtist = normalizeLyricsArtistName(
        artist === ''
            ? ''
            : (artist || track?.lyricsArtist || track?.artist || '')
    );
    const rawTitle = sanitizeText(
        title === ''
            ? ''
            : (title || track?.lyricsTitle || track?.title || track?.fileName || '')
    );
    const artistBase = normalizeLyricsLookupText(rawArtist);
    const titleBase = normalizeLyricsLookupText(rawTitle) || rawTitle;
    const primaryArtist = normalizeLyricsLookupText((artistBase || '').split(/\s*(?:,|&| x | X | and | with )\s*/)[0] || artistBase);
    const titleNoFeat = normalizeLyricsLookupText(titleBase.replace(/\b(?:ft|feat|featuring)\b\.?\s+.+$/i, ' ')) || titleBase;
    const titleNoSuffix = normalizeLyricsLookupText(titleNoFeat.replace(/\s+-\s+.*$/, ' ')) || titleNoFeat;
    const titleNoBrackets = normalizeLyricsLookupText(titleNoSuffix.replace(/\s*[\(\[\{][^)\]\}]{1,80}[\)\]\}]\s*/g, ' ')) || titleNoSuffix;
    const titleNoQuotes = titleNoBrackets.replace(/["']/g, '').trim();
    const variants = [
        { artist: artistBase, title: titleBase, reason: 'exact' },
        { artist: artistBase, title: titleNoFeat, reason: 'clean-title' },
        { artist: primaryArtist || artistBase, title: titleNoFeat, reason: 'primary-artist' },
        { artist: artistBase, title: titleNoSuffix, reason: 'title-core' },
        { artist: artistBase, title: titleNoBrackets, reason: 'title-no-brackets' },
        { artist: primaryArtist || artistBase, title: titleNoQuotes || titleNoSuffix, reason: 'ascii-title' }
    ];
    if (!artistBase || isUnknownLyricsArtist(artistBase)) {
        variants.push({ artist: '', title: titleNoFeat, reason: 'title-only' });
    }
    const seen = new Set();
    const queries = [];
    variants.forEach(variant => {
        const cleanArtist = normalizeLyricsLookupText(variant.artist || '');
        const cleanTitle = normalizeLyricsLookupText(variant.title || '');
        if (!cleanTitle) return;
        const key = `${cleanArtist}|${cleanTitle}`;
        if (seen.has(key)) return;
        seen.add(key);
        queries.push({
            artist: cleanArtist,
            title: cleanTitle,
            reason: variant.reason
        });
    });
    return queries.slice(0, LYRICS_QUERY_LIMIT);
}

function getLyricsTrackAlbumHint(track = null) {
    return sanitizeText(
        track?.album
        || track?.albumName
        || track?.releaseTitle
        || track?.release
        || track?.providerReleaseTitle
        || track?.assignedLyricsMeta?.album
        || ''
    );
}

function getLyricsTrackDurationHint(track = null) {
    const duration = getLyricsReferenceDuration(track);
    return duration > 0 ? Math.round(duration) : 0;
}

function withLyricsTrackHints(query = {}, track = null) {
    return {
        ...query,
        album: query.album || getLyricsTrackAlbumHint(track),
        duration: Number(query.duration || 0) || getLyricsTrackDurationHint(track)
    };
}

function buildLrclibKeywordSearchQueries(queries = [], track = null) {
    const seen = new Set();
    const keywordQueries = [];
    const addKeywordQuery = (keyword, baseQuery = {}, reason = 'website-keyword') => {
        const q = sanitizeText(String(keyword || '').replace(/\s+/g, ' ').trim());
        if (!q) return;
        const key = q.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        keywordQueries.push({
            ...withLyricsTrackHints(baseQuery, track),
            q,
            reason
        });
    };

    (queries || []).slice(0, LYRICS_QUERY_LIMIT).forEach((query) => {
        const artistPart = normalizeLyricsLookupText(query.artist || '');
        const titlePart = normalizeLyricsLookupText(query.title || '');
        if (!titlePart) return;
        if (artistPart) {
            addKeywordQuery(`${artistPart} ${titlePart}`, query, 'website-keyword');
            addKeywordQuery(`${titlePart} ${artistPart}`, query, 'website-keyword-title-first');
        } else {
            addKeywordQuery(titlePart, query, query.reason || 'title-only');
        }
    });

    const rawArtist = normalizeLyricsLookupText(normalizeLyricsArtistName(track?.lyricsArtist || track?.artist || track?.channelTitle || ''));
    const rawTitle = normalizeLyricsLookupText(track?.lyricsTitle || track?.title || track?.fileName || '');
    if (rawArtist && rawTitle) addKeywordQuery(`${rawArtist} ${rawTitle}`, { artist: rawArtist, title: rawTitle, reason: 'website-keyword' }, 'website-keyword');
    if (rawTitle && rawTitle !== queries?.[0]?.title) addKeywordQuery(rawTitle, { artist: rawArtist, title: rawTitle, reason: 'title-only' }, 'title-only');

    return keywordQueries.slice(0, LYRICS_QUERY_LIMIT);
}

function getLyricsReferenceDuration(track, meta = {}) {
    const playbackDuration = getLyricsPlaybackDurationHint(track);
    const metaDuration = Number(meta.duration || meta.songDuration || 0);
    return playbackDuration > 0
        ? playbackDuration
        : metaDuration > 0
            ? metaDuration
            : 0;
}

function scoreLyricsMetaMatch(meta = {}, query = {}) {
    const metaArtist = meta.artist || meta.artistName || '';
    const metaTitle = meta.title || meta.trackName || '';
    return getLyricsTokenOverlapScore(metaArtist, query.artist || '') + getLyricsTokenOverlapScore(metaTitle, query.title || '');
}

function scoreLyricsIdentityBonus(meta = {}, expected = {}, query = {}) {
    const expectedArtist = normalizeLyricsLookupText(expected.artist || '');
    const expectedTitle = normalizeLyricsLookupText(expected.title || '');
    const candidateArtist = normalizeLyricsLookupText(meta.artist || meta.artistName || query.artist || '');
    const candidateTitle = normalizeLyricsLookupText(meta.title || meta.trackName || query.title || '');
    let score = 0;
    if (candidateTitle && expectedTitle) {
        if (candidateTitle === expectedTitle) score += 26;
        else if (candidateTitle.startsWith(expectedTitle) || expectedTitle.startsWith(candidateTitle)) score += 14;
    }
    if (candidateArtist && expectedArtist) {
        if (candidateArtist === expectedArtist) score += 18;
        else if (candidateArtist.startsWith(expectedArtist) || expectedArtist.startsWith(candidateArtist)) score += 9;
    }
    score += LYRICS_PROVIDER_BONUS[meta.provider || query.provider || ''] || 0;
    score += LYRICS_QUERY_REASON_BONUS[query.reason || ''] || 0;
    return score;
}

function getLyricsPlaybackDurationHint(track = null) {
    const trackDuration = Number(track?.duration || 0);
    if (trackDuration > 0) return trackDuration;
    const onlineActive = typeof isOnlineMusicPlaybackActive === 'function' && isOnlineMusicPlaybackActive();
    const onlineTrack = typeof getOnlineMusicCurrentTrack === 'function' ? getOnlineMusicCurrentTrack() : null;
    const isRequestedOnlineTrack = track?.source === 'online-music';
    const matchesOnlineTrack = !track?.id || !onlineTrack?.id || track.id === onlineTrack.id;
    if ((isRequestedOnlineTrack || (!track && onlineActive)) && matchesOnlineTrack) {
        const onlineState = typeof getOnlineMusicState === 'function' ? getOnlineMusicState() : null;
        const onlineDuration = Number(onlineState?.duration || onlineTrack?.duration || 0);
        if (onlineDuration > 0) return onlineDuration;
    }
    const matchesLocalTrack = !track?.id || !state?.currentTrackId || track.id === state.currentTrackId;
    if (!isRequestedOnlineTrack && !onlineActive && matchesLocalTrack) {
        const audioDuration = Number(els.audio?.duration || 0);
        if (audioDuration > 0) return audioDuration;
    }
    return 0;
}

function isStrongCachedSyncedLyricsEntry(entry, artist, title, track = null) {
    if (!entry?.raw || entry.format !== 'lrc') return false;
    if (Number(entry.schemaVersion || 0) !== LYRICS_CACHE_SCHEMA_VERSION) return false;
    if (entry.confidence !== 'strong' || entry.strongSync !== true) return false;
    if (!String(entry.provider || '').toLowerCase().startsWith('lrclib')) return false;
    if (Number(entry.rankScore || 0) < LYRICS_STRONG_SYNC_SCORE) return false;
    if (entry.contentHash !== hashLyricsContent(entry.raw)) return false;
    const strictExpected = getLyricsStrictExpectedIdentity(artist, title, track);
    const strictMeta = {
        artist: entry.matchedArtist || '',
        title: entry.matchedTitle || ''
    };
    const strictQuery = {
        artist: entry.queryArtist || entry.matchedArtist || '',
        title: entry.queryTitle || entry.matchedTitle || '',
        reason: entry.queryReason || ''
    };
    if (!isStrongLyricsIdentityMatch(strictMeta, strictExpected, strictQuery)) return false;
    const evidence = getSyncedLyricsTimelineEvidence(entry.raw, track, {
        duration: entry.matchedDuration || 0
    });
    return evidence.valid;
}

function getSyncedLyricsTimelineEvidence(raw, track = null, meta = {}, parsedLines = null) {
    const lines = Array.isArray(parsedLines) ? parsedLines : parseSyncedLyrics(raw);
    const uniqueTimeCount = new Set(lines.map((line) => Math.round(Number(line.time || 0) * 1000))).size;
    const firstTime = Number(lines[0]?.time || 0);
    const lastTime = Number(lines[lines.length - 1]?.time || 0);
    const span = Math.max(0, lastTime - firstTime);
    const providerDuration = Math.max(0, Number(meta.duration || meta.songDuration || 0));
    const playbackDuration = Math.max(0, getLyricsPlaybackDurationHint(track));
    const referenceDuration = playbackDuration || providerDuration;
    const durationTolerance = referenceDuration > 0 ? Math.max(5, referenceDuration * 0.035) : 0;
    const providerTolerance = providerDuration > 0 ? Math.max(5, providerDuration * 0.035) : 0;
    const playbackProviderDelta = playbackDuration > 0 && providerDuration > 0
        ? Math.abs(playbackDuration - providerDuration)
        : 0;
    const timelineFitsProvider = providerDuration > 0
        && lastTime <= providerDuration + providerTolerance
        && lastTime >= providerDuration * 0.5;
    const playbackMatchesProvider = playbackDuration <= 0
        || (providerDuration > 0 && playbackProviderDelta <= Math.max(6, playbackDuration * 0.04));
    const timelineFitsPlayback = playbackDuration <= 0
        || (lastTime <= playbackDuration + durationTolerance && lastTime >= playbackDuration * 0.5);
    const valid = lines.length >= LYRICS_MIN_STRONG_LINE_COUNT
        && uniqueTimeCount >= LYRICS_MIN_STRONG_LINE_COUNT
        && span >= LYRICS_MIN_STRONG_TIMELINE_SPAN_SECONDS
        && firstTime <= 30
        && timelineFitsProvider
        && playbackMatchesProvider
        && timelineFitsPlayback;
    return {
        valid,
        lineCount: lines.length,
        uniqueTimeCount,
        firstTime,
        lastTime,
        span,
        providerDuration,
        playbackDuration,
        playbackProviderDelta,
        timelineFitsProvider,
        playbackMatchesProvider,
        timelineFitsPlayback
    };
}

function hashLyricsContent(raw = '') {
    const text = String(raw || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function scoreSyncedLyricsCandidate(raw, track = null, meta = {}, query = {}, expected = {}, parsedLines = null) {
    const lines = Array.isArray(parsedLines) ? parsedLines : parseSyncedLyrics(raw);
    if (!lines.length) return -Infinity;
    const uniqueTimeCount = new Set(lines.map(line => Math.round(line.time * 10))).size;
    const firstTime = lines[0]?.time || 0;
    const lastTime = lines[lines.length - 1]?.time || 0;
    const span = Math.max(0, lastTime - firstTime);
    const averageGap = lines.length > 1 ? span / (lines.length - 1) : span;
    const averageTextLength = lines.reduce((sum, line) => sum + ((line.text || '').trim().length), 0) / Math.max(lines.length, 1);
    const duration = getLyricsReferenceDuration(track, meta);
    const densityPerMinute = duration > 0 ? uniqueTimeCount / Math.max(duration / 60, 1) : uniqueTimeCount / Math.max(span / 60, 1);
    let score = 0;

    score += Math.min(uniqueTimeCount, 220) * 0.7;
    score += Math.min(densityPerMinute, 30) * 2.1;
    score += Math.min(averageTextLength, 36) * 0.2;
    score += scoreLyricsMetaMatch(meta, query);
    score += scoreLyricsIdentityBonus(meta, expected, query);
    score += 24;
    if (firstTime <= 12) score += 8;
    if (averageGap > 0 && averageGap <= 6) score += 16;
    else if (averageGap <= 9) score += 8;
    else if (averageGap > 14) score -= Math.min(averageGap - 14, 18);
    if (lines.length < 8) score -= 18;

    if (duration > 0 && lastTime > 0) {
        const delta = Math.abs(lastTime - duration);
        const coverage = lastTime / Math.max(duration, 1);
        score += Math.max(0, 42 - Math.min(delta, 42));
        if (coverage >= 0.8 && coverage <= 1.08) score += 18;
        if (coverage < 0.55) score -= 18;
        if (delta > Math.max(20, duration * 0.18)) score -= 12;
    }

    return score;
}

function scorePlainLyricsCandidate(raw, meta = {}, query = {}, expected = {}) {
    const lines = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return -Infinity;
    const averageTextLength = lines.reduce((sum, line) => sum + line.length, 0) / Math.max(lines.length, 1);
    const duration = getLyricsReferenceDuration(null, meta);
    const linesPerMinute = duration > 0 ? lines.length / Math.max(duration / 60, 1) : lines.length;
    let score = 0;
    score += Math.min(lines.length, 160) * 0.45;
    score += Math.min(averageTextLength, 40) * 0.2;
    score += scoreLyricsMetaMatch(meta, query) * 0.75;
    score += scoreLyricsIdentityBonus(meta, expected, query) * 0.85;
    if (lines.length < 4) score -= 20;
    else if (lines.length < 8) score -= 10;
    if (averageTextLength > 90) score -= 14;
    if (linesPerMinute < 5) score -= 8;
    return score;
}

function isStrongSyncedLyricsCandidate(candidate = null) {
    if (!candidate || candidate.format !== 'lrc') return false;
    if (!String(candidate.provider || '').toLowerCase().startsWith('lrclib')) return false;
    if (Number(candidate.rankScore || 0) < LYRICS_STRONG_SYNC_SCORE) return false;
    if (!candidate.syncEvidence?.valid) return false;
    if (!candidate.strictIdentityMatch) return false;
    return true;
}

function createLyricsCandidate({ raw, format, provider, providerLabel, meta = {}, query = {}, track = null, expected = {}, strictExpected = null }) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const detectedFormat = format || detectLyricsFormat(text);
    const metaWithProvider = { ...meta, provider };
    const parsedLines = detectedFormat === 'lrc' ? parseSyncedLyrics(text) : null;
    const score = detectedFormat === 'lrc'
        ? scoreSyncedLyricsCandidate(text, track, metaWithProvider, query, expected, parsedLines)
        : scorePlainLyricsCandidate(text, metaWithProvider, query, expected);
    if (!Number.isFinite(score)) return null;
    const resolvedStrictExpected = strictExpected || getLyricsStrictExpectedIdentity(query.artist, query.title, track);
    const candidate = {
        raw: text,
        format: detectedFormat,
        provider,
        providerLabel: providerLabel || provider,
        meta: metaWithProvider,
        query,
        score,
        rankScore: score + (detectedFormat === 'lrc' ? 20 : 0),
        key: `${detectedFormat}:${hashLyricsContent(text)}`,
        contentHash: hashLyricsContent(text),
        strictExpected: resolvedStrictExpected,
        strictIdentityMatch: isStrongLyricsIdentityMatch(metaWithProvider, resolvedStrictExpected, query),
        syncEvidence: detectedFormat === 'lrc'
            ? getSyncedLyricsTimelineEvidence(text, track, metaWithProvider, parsedLines)
            : null
    };
    candidate.strongSync = isStrongSyncedLyricsCandidate(candidate);
    return candidate;
}

function rankLyricsCandidates(candidates = []) {
    return (candidates || []).slice().sort((a, b) => {
        if ((b.rankScore || 0) !== (a.rankScore || 0)) return (b.rankScore || 0) - (a.rankScore || 0);
        if (a.format !== b.format) return a.format === 'lrc' ? -1 : 1;
        return (b.score || 0) - (a.score || 0);
    });
}

function isAcceptableLyricsCandidate(candidate = null) {
    if (!candidate || !Number.isFinite(Number(candidate.rankScore))) return false;
    if (candidate.format === 'lrc') {
        return Number(candidate.rankScore) >= LYRICS_MIN_SYNC_SCORE;
    }
    const provider = String(candidate.provider || '').toLowerCase();
    const minScore = provider === 'lyrics.ovh' ? LYRICS_MIN_OVH_SCORE : LYRICS_MIN_PLAIN_SCORE;
    return Number(candidate.rankScore) >= minScore;
}

function getBestAcceptableLyricsCandidate(candidates = []) {
    return rankLyricsCandidates(candidates).find(candidate => isAcceptableLyricsCandidate(candidate)) || null;
}

async function fetchJsonWithTimeout(url, timeoutMs = LYRICS_FETCH_TIMEOUT_MS, options = {}) {
    const externalSignal = options?.signal || null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = null;
    let externalAbortHandler = null;
    try {
        if (controller) {
            if (externalSignal?.aborted) controller.abort();
            else if (externalSignal && typeof externalSignal.addEventListener === 'function') {
                externalAbortHandler = () => controller.abort();
                externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
            }
            timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            return await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
        }
        return await Promise.race([
            fetch(url, { headers: { 'Accept': 'application/json' } }),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Lyrics request timed out')), timeoutMs);
            })
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (externalSignal && externalAbortHandler && typeof externalSignal.removeEventListener === 'function') {
            externalSignal.removeEventListener('abort', externalAbortHandler);
        }
    }
}

function buildLrclibUrl(endpoint, query) {
    if (!query?.title && !query?.q) return '';
    const params = new URLSearchParams();
    if (endpoint === 'search' && query.q) {
        params.set('q', query.q);
    } else {
        if (query.artist && !isUnknownLyricsArtist(query.artist)) params.set('artist_name', query.artist);
        if (query.title) params.set('track_name', query.title);
        if (query.album) params.set('album_name', query.album);
        if (endpoint !== 'search' && Number(query.duration || 0) > 0) params.set('duration', String(Math.round(Number(query.duration || 0))));
    }
    const qs = params.toString();
    return qs ? `https://lrclib.net/api/${endpoint}?${qs}` : '';
}

async function fetchLrclibGetCandidates(query, track, options = {}) {
    if (!query?.title || isUnknownLyricsArtist(query.artist)) return [];
    const queryWithHints = withLyricsTrackHints(query, track);
    const url = buildLrclibUrl('get', queryWithHints);
    if (!url) return [];
    try {
        const res = await fetchJsonWithTimeout(url, LYRICS_LRCLIB_TIMEOUT_MS, { signal: options.signal });
        if (!res?.ok) return [];
        const data = await res.json();
        const candidates = [];
        const expected = getLyricsExpectedIdentity(queryWithHints.artist, queryWithHints.title, track);
        if ((data.syncedLyrics || '').trim()) {
            const syncedCandidate = createLyricsCandidate({
                raw: data.syncedLyrics,
                format: 'lrc',
                provider: 'lrclib:get',
                providerLabel: 'LRCLIB',
                meta: {
                    id: data.id ?? null,
                    artist: data.artistName || queryWithHints.artist,
                    title: data.trackName || queryWithHints.title,
                    album: data.albumName || queryWithHints.album,
                    duration: data.duration,
                    instrumental: !!data.instrumental
                },
                query: queryWithHints,
                track,
                expected,
                strictExpected: getLyricsStrictExpectedIdentity(queryWithHints.artist, queryWithHints.title, track)
            });
            if (syncedCandidate) candidates.push(syncedCandidate);
        }
        if ((data.plainLyrics || '').trim()) {
            const plainCandidate = createLyricsCandidate({
                raw: data.plainLyrics,
                format: 'plain',
                provider: 'lrclib:get',
                providerLabel: 'LRCLIB',
                meta: {
                    id: data.id ?? null,
                    artist: data.artistName || queryWithHints.artist,
                    title: data.trackName || queryWithHints.title,
                    album: data.albumName || queryWithHints.album,
                    duration: data.duration,
                    instrumental: !!data.instrumental
                },
                query: queryWithHints,
                track,
                expected,
                strictExpected: getLyricsStrictExpectedIdentity(queryWithHints.artist, queryWithHints.title, track)
            });
            if (plainCandidate) candidates.push(plainCandidate);
        }
        return candidates;
    } catch (e) {
        return [];
    }
}

async function fetchLrclibSearchCandidates(queries, track, options = {}) {
    const provider = options.provider || 'lrclib:search';
    const providerLabel = options.providerLabel || 'LRCLIB Search';
    const activeQueries = (queries || []).filter(query => query?.title || query?.q).slice(0, LYRICS_QUERY_LIMIT);
    if (!activeQueries.length) return [];
    const settled = await Promise.allSettled(activeQueries.map(async query => {
        const queryWithHints = withLyricsTrackHints(query, track);
        const expected = getLyricsExpectedIdentity(queryWithHints.artist, queryWithHints.title, track);
        const url = buildLrclibUrl('search', queryWithHints);
        if (!url) return [];
        const res = await fetchJsonWithTimeout(url, LYRICS_LRCLIB_TIMEOUT_MS, { signal: options.signal });
        if (!res?.ok) return [];
        const payload = await res.json();
        return (Array.isArray(payload) ? payload : []).slice(0, LYRICS_LRCLIB_SEARCH_RESULT_LIMIT).flatMap(item => {
            const next = [];
            const meta = {
                id: item.id ?? null,
                artist: item.artistName || queryWithHints.artist,
                title: item.trackName || queryWithHints.title,
                album: item.albumName || queryWithHints.album,
                duration: item.duration,
                instrumental: !!item.instrumental
            };
            if ((item.syncedLyrics || '').trim()) {
                const syncedCandidate = createLyricsCandidate({
                    raw: item.syncedLyrics,
                    format: 'lrc',
                    provider,
                    providerLabel,
                    meta,
                    query: queryWithHints,
                    track,
                    expected,
                    strictExpected: getLyricsStrictExpectedIdentity(queryWithHints.artist, queryWithHints.title, track)
                });
                if (syncedCandidate) next.push(syncedCandidate);
            }
            if ((item.plainLyrics || '').trim()) {
                const plainCandidate = createLyricsCandidate({
                raw: item.plainLyrics,
                format: 'plain',
                provider,
                providerLabel,
                meta,
                query: queryWithHints,
                track,
                expected,
                strictExpected: getLyricsStrictExpectedIdentity(queryWithHints.artist, queryWithHints.title, track)
            });
            if (plainCandidate) next.push(plainCandidate);
        }
            return next;
        });
    }));
    return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

async function fetchLyricsOvhCandidates(queries, track, options = {}) {
    const activeQueries = (queries || [])
        .filter(query => query?.title && query.artist && !isUnknownLyricsArtist(query.artist))
        .slice(0, 2);
    if (!activeQueries.length) return [];
    const settled = await Promise.allSettled(activeQueries.map(async query => {
        const expected = getLyricsExpectedIdentity(query.artist, query.title, track);
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(query.artist)}/${encodeURIComponent(query.title)}`;
        const res = await fetchJsonWithTimeout(url, 2600, { signal: options.signal });
        if (!res?.ok) return [];
        const payload = await res.json();
        if (!(payload?.lyrics || '').trim()) return [];
        const candidate = createLyricsCandidate({
            raw: payload.lyrics,
            format: 'plain',
            provider: 'lyrics.ovh',
            providerLabel: 'Lyrics.ovh',
            meta: {
                artist: query.artist,
                title: query.title
            },
            query,
            track,
            expected,
            strictExpected: getLyricsStrictExpectedIdentity(query.artist, query.title, track)
        });
        return candidate ? [candidate] : [];
    }));
    return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

async function resolveLyricsCandidate(artist, title, track, isStale = () => false, signal = null) {
    const queries = buildLyricsLookupQueries(artist, title, track);
    const expectedIdentity = getLyricsExpectedIdentity(artist, title, track);
    const candidateMap = new Map();
    const addCandidates = (items = []) => {
        items.forEach(candidate => {
            if (!candidate) return;
            if (!isLyricsCandidateMatch(candidate.meta, expectedIdentity, candidate.query)) return;
            const existing = candidateMap.get(candidate.key);
            if (!existing || (candidate.rankScore || 0) > (existing.rankScore || 0)) {
                candidateMap.set(candidate.key, candidate);
            }
        });
    };
    const getRanked = () => rankLyricsCandidates(Array.from(candidateMap.values()));
    const shouldStop = () => isStale() || !!signal?.aborted;
    if (shouldStop()) return null;

    addCandidates(await fetchLrclibSearchCandidates(queries, track, { signal }));
    let ranked = getRanked();
    let bestSynced = ranked.find(candidate => candidate.format === 'lrc' && isAcceptableLyricsCandidate(candidate));
    if (bestSynced) return bestSynced;

    if (shouldStop()) return getBestAcceptableLyricsCandidate(ranked);
    const exactQueries = queries.filter((query) => query.reason === 'exact' || query.reason === 'clean-title').slice(0, 2);
    const keywordQueries = buildLrclibKeywordSearchQueries(queries, track);
    const fallbackTasks = [];
    if (exactQueries.length) {
        fallbackTasks.push(Promise.allSettled(exactQueries.map((query) => fetchLrclibGetCandidates(query, track, { signal })))
            .then(results => results.flatMap(result => result.status === 'fulfilled' ? result.value : [])));
    }
    if (keywordQueries.length) {
        fallbackTasks.push(fetchLrclibSearchCandidates(keywordQueries, track, {
            provider: 'lrclib:search:q',
            providerLabel: 'LRCLIB Keyword Search',
            signal
        }));
    }
    if (fallbackTasks.length) {
        const settledFallbacks = await Promise.allSettled(fallbackTasks);
        settledFallbacks.forEach((result) => {
            if (result.status === 'fulfilled') addCandidates(result.value);
        });
    }
    ranked = getRanked();
    bestSynced = ranked.find(candidate => candidate.format === 'lrc' && isAcceptableLyricsCandidate(candidate));
    if (bestSynced) return bestSynced;
    if (ranked[0] && ranked[0].format === 'lrc' && isAcceptableLyricsCandidate(ranked[0])) {
        return ranked[0];
    }

    if (shouldStop()) return getBestAcceptableLyricsCandidate(ranked);
    addCandidates(await fetchLyricsOvhCandidates(queries, track, { signal }));
    ranked = getRanked();
    return getBestAcceptableLyricsCandidate(ranked);
}

function applyResolvedLyricsCandidate(candidate, artist, title, track) {
    if (!candidate) return false;
    const source = document.getElementById('windowedModeLyricsSource');
    const label = candidate.format === 'lrc' ? 'Synced' : 'Auto';
    const matchedArtist = candidate.meta?.artist || '';
    const matchedTitle = candidate.meta?.title || '';
    const matchedLabel = [matchedArtist, matchedTitle].filter(Boolean).join(' - ');
    applyLyricsText(candidate.raw, label, track, {
        kind: 'auto',
        providerLabel: candidate.providerLabel,
        format: candidate.format,
        matchedLabel,
        queryReason: candidate.query?.reason || '',
        provider: candidate.provider || ''
    });
    if (source) {
        source.title = `${candidate.format === 'lrc' ? 'Synced' : 'Lyrics'} via ${candidate.providerLabel}${matchedLabel ? `: ${matchedLabel}` : ''}`;
    }
    toggleLyricsEditButton(false);
    if (isStrongSyncedLyricsCandidate(candidate)) {
        saveOfflineLyrics(track, artist, title, 'auto', candidate.raw, candidate.format, candidate.provider, {
            providerLabel: candidate.providerLabel || candidate.provider || 'LRCLIB',
            providerRecordId: candidate.meta?.id ?? null,
            matchedArtist,
            matchedTitle,
            matchedAlbum: candidate.meta?.album || '',
            matchedDuration: Number(candidate.meta?.duration || 0),
            queryArtist: candidate.query?.artist || '',
            queryTitle: candidate.query?.title || '',
            queryReason: candidate.query?.reason || '',
            score: Number(candidate.score || 0),
            rankScore: Number(candidate.rankScore || 0),
            contentHash: candidate.contentHash || hashLyricsContent(candidate.raw),
            strongSync: true,
            syncEvidence: candidate.syncEvidence || null
        });
    }
    return true;
}

	        function getOfflineLyricsForTrack(track, artist, title) {
	            if (isPrivateLyricsContext(track)) return { keys: [], manual: null, auto: null };
	            const keys = getLyricsCacheKeys(track, artist, title);
	            const cache = state.offlineLyricsCache || {};
	            let manual = null;
	            let auto = null;
	            keys.forEach(key => {
	                const bucket = cache[key];
	                const manualEntry = bucket?.manual;
	                const autoEntry = bucket?.auto;
	                if (manualEntry?.raw && (!manual || (manualEntry.savedAt || 0) > (manual.savedAt || 0))) {
	                    manual = manualEntry;
	                }
	                if (autoEntry?.raw) {
                        const autoEntryStrong = autoEntry.format === 'lrc'
                            && autoEntry.strongSync === true
                            && Number(autoEntry.rankScore || 0) >= LYRICS_STRONG_SYNC_SCORE;
                        const currentStrong = !!auto
                            && auto.format === 'lrc'
                            && auto.strongSync === true
                            && Number(auto.rankScore || 0) >= LYRICS_STRONG_SYNC_SCORE;
                        const shouldReplace = !auto
                            || (autoEntryStrong && !currentStrong)
                            || (autoEntryStrong === currentStrong && Number(autoEntry.rankScore || 0) > Number(auto.rankScore || 0))
                            || (autoEntryStrong === currentStrong
                                && Number(autoEntry.rankScore || 0) === Number(auto.rankScore || 0)
                                && Number(autoEntry.savedAt || 0) > Number(auto.savedAt || 0));
                        if (shouldReplace) auto = autoEntry;
	                }
	            });
	            return { keys, manual, auto };
	        }

function getCustomLyricsForTrack(track, artist, title) {
    if (!track || !state.customLyricsCache || typeof state.customLyricsCache !== 'object') return '';
    if (isPrivateLyricsContext(track)) return '';
    const candidateKeys = [track.id, ...getLyricsCacheKeys(track, artist, title)];
    for (const key of candidateKeys) {
        const value = state.customLyricsCache[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function hasVerifiedManualLyricsOverride(track, artist, title, raw = '') {
    if (!track) return false;
    const text = String(raw || '').trim();
    if (!text) return false;
    const cachedCustom = getCustomLyricsForTrack(track, artist, title);
    if (cachedCustom && cachedCustom === text) return true;
    const cached = getOfflineLyricsForTrack(track, artist, title);
    const manualText = String(cached?.manual?.raw || '').trim();
    return !!manualText && manualText === text;
}

	        function persistOfflineLyricsCache() {
	            const saved = writeStorageJson('nexplay_pro_offline_lyrics', state.offlineLyricsCache || {});
            if (!saved) {
                logError('lyrics-cache-write-failed', 'Lyrics cache could not be saved locally.');
            }
            return !!saved;
	        }

	        function saveOfflineLyrics(track, artist, title, kind, raw, format, provider = 'lrclib', metadata = {}) {
	            if (kind !== 'manual' && kind !== 'auto') return;
            if (isPrivateLyricsContext(track)) return false;
	            const text = (raw || '').trim();
	            if (!text) {
	                removeOfflineLyrics(track, artist, title, kind);
	                return false;
	            }
	            const resolvedFormat = format || detectLyricsFormat(text);
            const contentHash = hashLyricsContent(text);
            const syncedEvidence = kind === 'auto'
                ? getSyncedLyricsTimelineEvidence(text, track, { duration: metadata?.matchedDuration || 0 })
                : null;
            const strictExpected = getLyricsStrictExpectedIdentity(artist, title, track);
            const strictIdentityMatch = kind === 'auto' && isStrongLyricsIdentityMatch({
                artist: metadata?.matchedArtist || '',
                title: metadata?.matchedTitle || ''
            }, strictExpected, {
                artist: metadata?.queryArtist || '',
                title: metadata?.queryTitle || '',
                reason: metadata?.queryReason || ''
            });
            if (kind === 'auto') {
                const isDurableStrongSync = resolvedFormat === 'lrc'
                    && String(provider || '').toLowerCase().startsWith('lrclib')
                    && metadata?.strongSync === true
                    && Number(metadata?.rankScore || 0) >= LYRICS_STRONG_SYNC_SCORE
                    && metadata?.contentHash === contentHash
                    && strictIdentityMatch
                    && syncedEvidence?.valid === true;
                if (!isDurableStrongSync) return false;
            }
	            const keys = getLyricsCacheKeys(track, artist, title);
	            if (!keys.length) return false;
	            const entry = {
        schemaVersion: LYRICS_CACHE_SCHEMA_VERSION,
        raw: text,
        format: resolvedFormat,
        provider,
        providerLabel: sanitizeText(metadata?.providerLabel || provider || ''),
        providerRecordId: metadata?.providerRecordId ?? null,
        artist: normalizeLyricsLookupText(artist || track?.artist || ''),
        title: normalizeLyricsLookupText(title || track?.title || track?.fileName || ''),
        strictArtist: normalizeLyricsTrustText(artist || track?.lyricsArtist || track?.artist || ''),
        strictTitle: normalizeLyricsTrustText(title || track?.lyricsTitle || track?.title || track?.fileName || ''),
        matchedArtist: sanitizeText(metadata?.matchedArtist || ''),
        matchedTitle: sanitizeText(metadata?.matchedTitle || ''),
        matchedAlbum: sanitizeText(metadata?.matchedAlbum || ''),
        matchedDuration: Math.max(0, Number(metadata?.matchedDuration || 0)),
        queryArtist: sanitizeText(metadata?.queryArtist || ''),
        queryTitle: sanitizeText(metadata?.queryTitle || ''),
        queryReason: sanitizeText(metadata?.queryReason || ''),
        score: Number(metadata?.score || 0),
        rankScore: Number(metadata?.rankScore || 0),
        confidence: kind === 'manual' ? 'manual' : 'strong',
        strongSync: kind === 'auto' && metadata?.strongSync === true,
        contentHash,
        syncEvidence: kind === 'auto' && syncedEvidence
            ? {
                lineCount: Number(syncedEvidence.lineCount || 0),
                uniqueTimeCount: Number(syncedEvidence.uniqueTimeCount || 0),
                firstTime: Number(syncedEvidence.firstTime || 0),
                lastTime: Number(syncedEvidence.lastTime || 0),
                span: Number(syncedEvidence.span || 0)
            }
            : null,
        savedAt: Date.now()
    };
	            state.offlineLyricsCache = state.offlineLyricsCache || {};
	            let changed = false;
	            keys.forEach(key => {
	                const bucket = state.offlineLyricsCache[key] || {};
	                const existing = bucket[kind];
                if (kind === 'auto' && existing?.raw) {
                    const existingIsStrong = isStrongCachedSyncedLyricsEntry(existing, artist, title, track);
                    if (existingIsStrong && Number(existing.rankScore || 0) > entry.rankScore) return;
                    if (existingIsStrong && existing.contentHash === entry.contentHash) return;
                }
	                bucket[kind] = entry;
	                state.offlineLyricsCache[key] = bucket;
	                changed = true;
	            });
	            return changed ? persistOfflineLyricsCache() : true;
	        }

function syncTrackCustomLyricsCache(track, rawText = '') {
    if (!track) return '';
    const text = String(rawText || '').trim();
    if (isPrivateLyricsContext(track)) return text;
    state.customLyricsCache = state.customLyricsCache || {};
    const keys = [track.id, ...getLyricsCacheKeys(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title)];
    if (text) {
        keys.forEach((key) => {
            state.customLyricsCache[key] = text;
        });
        saveOfflineLyrics(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title, 'manual', text, detectLyricsFormat(text), 'manual');
    } else {
        keys.forEach((key) => {
            delete state.customLyricsCache[key];
        });
        removeOfflineLyrics(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title, 'manual');
    }
    writeStorageJson('nexplay_pro_lyrics', state.customLyricsCache || {});
    return text;
}

	        function removeOfflineLyrics(track, artist, title, kind) {
	            if (kind !== 'manual' && kind !== 'auto') return;
	            if (isPrivateLyricsContext(track)) return;
	            const keys = getLyricsCacheKeys(track, artist, title);
	            if (!keys.length || !state.offlineLyricsCache) return;
	            keys.forEach(key => {
	                const bucket = state.offlineLyricsCache[key];
	                if (!bucket) return;
	                delete bucket[kind];
	                if (!bucket.manual && !bucket.auto) delete state.offlineLyricsCache[key];
	            });
	            persistOfflineLyricsCache();
	        }

function getLyricsActiveTrackId(track = null) {
    if (track?.id) return track.id;
    if (isOnlineMusicPlaybackActive()) {
        return getOnlineMusicState().currentTrackId || getOnlineMusicCurrentTrack()?.id || null;
    }
    return state.currentTrackId || null;
}

function getLyricsActiveTrack(track = null) {
    if (track) return track;
    if (isOnlineMusicPlaybackActive()) return getOnlineMusicCurrentTrack();
    return state.tracks.find((item) => item.id === state.currentTrackId) || null;
}

function persistLyricsTrackState(track = null) {
    const active = getLyricsActiveTrack(track);
    if (!active) return;
    if (active.source === 'online-music' || isOnlineMusicPlaybackActive()) {
        persistOnlineMusicState();
        return;
    }
    persistTrackMetadata(active);
}

	        function seekActivePlaybackPosition(seconds = 0) {
	            const target = Math.max(0, Number(seconds) || 0);
        const activeTrack = getActivePlaybackTrack();
	            logAction('seek-start', 'Seek requested', {
	                source: sanitizeText(state.currentPlaybackSource || ''),
	                target
	            });
	            if (isOnlineMusicPlaybackActive()) {
	                Promise.resolve(seekOnlineMusicTo(target, { forcePersist: false }))
	                    .then(() => {
	                        logAction('seek-success', 'Online seek completed', { target });
                    if (isPrivateSessionTrackRecord(activeTrack) || isPrivateSessionRouteActive()) {
                        syncPrivateSessionPlayerDeck();
                    }
	                    })
	                    .catch((error) => {
	                        logError('seek-failed', 'Online seek failed', {
	                            target,
	                            error: sanitizeText(error?.message || '')
	                        });
	                    });
	                return;
	            }
	            if (aud && Number.isFinite(target)) {
	                if (!safeSeekMedia(aud, target, { fallbackDuration: Number(activeTrack?.duration || 0) })) {
	                    // No valid duration yet; keep current position unchanged.
	                    logError('seek-failed', 'Seek ignored because duration/readiness was invalid', {
	                        target,
	                        duration: Number(aud?.duration || activeTrack?.duration || 0)
	                    });
	                    return;
	                }
            updateProgress();
            if (isPrivateSessionTrackRecord(activeTrack) || isPrivateSessionRouteActive()) {
                syncPrivateSessionPlayerDeck();
            }
	                logAction('seek-success', 'Local seek completed', { target });
	            }
	        }

function setLyricsPanelMode(mode = 'view', trackId = null) {
    lyricsPanelMode = mode === 'editor' ? 'editor' : 'view';
    lyricsPanelTrackId = trackId || getLyricsActiveTrackId() || null;
    const container = document.getElementById('windowedModeLyricsContent');
    if (container) {
        const isEditor = lyricsPanelMode === 'editor';
        container.classList.toggle('lyrics-content-editor', isEditor);
        container.classList.toggle('lyrics-content-view', !isEditor);
    }
}

function isLyricsEditorOpen(trackId = null) {
    if (lyricsPanelMode !== 'editor') return false;
    if (!trackId || !lyricsPanelTrackId) return true;
    return lyricsPanelTrackId === trackId;
}

	        // Reset all lyric-related state for a new track/load
	        function resetLyricState(offset = 0) {
	            lrcData = [];
	            activeLyricIndex = -1;
		            state.lyricsHighlight = {
	                lines: [],
	                lineDuration: 0,
	                lastIndex: -1,
	                timestamps: [],
	                offset
	            };
    lastLyricAutoScrollTop = -1;
    lastLyricAutoScrollTs = 0;
	            if (state.fsModeActive) updateFsModeLyricOverlay('', '');
	        }

// Remove any active lyric highlight from the DOM and state
	        function clearLyricHighlight() {
    document.querySelectorAll('#windowedModeLyricsContent .lyric-highlight').forEach((el) => {
        el.classList.remove('lyric-highlight', 'opacity-100');
        el.classList.add('opacity-30');
    });
    activeLyricIndex = -1;
    if (state.lyricsHighlight) state.lyricsHighlight.lastIndex = -1;
}

function scrollActiveLyricLineIntoView(el) {
    const container = document.getElementById('windowedModeLyricsContent');
    if (!container || !el) return;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const smoothScroll = getEffectivePerformanceTier() === 'normal';
    if (container.scrollHeight > container.clientHeight) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offsetInContainer = elRect.top - containerRect.top;
        let targetTop = container.scrollTop + offsetInContainer - (container.clientHeight / 2) + (el.offsetHeight / 2);
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (targetTop < 0) targetTop = 0;
        if (targetTop > maxScroll) targetTop = maxScroll;
        const delta = Math.abs(targetTop - container.scrollTop);
        if (delta < Math.max(10, Math.floor(el.offsetHeight * 0.45))) return;
        if (Math.abs(targetTop - lastLyricAutoScrollTop) < 8) return;
        const useSmooth = smoothScroll && delta < Math.max(220, container.clientHeight * 0.85) && (now - lastLyricAutoScrollTs) > 180;
        container.scrollTo({ top: targetTop, behavior: useSmooth ? 'smooth' : 'auto' });
        lastLyricAutoScrollTop = targetTop;
        lastLyricAutoScrollTs = now;
    } else {
        el.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'auto', block: 'nearest', inline: 'nearest' });
        lastLyricAutoScrollTop = container.scrollTop;
        lastLyricAutoScrollTs = now;
    }
}

	        // Parse LRC lyrics, render clickable lines and store DOM references for syncing
	        function parseLyrics(raw) {
	            const container = document.getElementById('windowedModeLyricsContent');
	            resetLyricState(0);
	            if (!container) return [];
    container.innerHTML = '';
    if (!raw) {
        container.innerHTML = '<span class="opacity-50">No synced lyrics.</span>';
        return [];
    }
    const parsedLines = parseSyncedLyrics(raw);
    if (parsedLines.length === 0) {
        container.innerHTML = '<span class="opacity-50">No synced lyrics.</span>';
        return [];
    }
    parsedLines.forEach(entry => {
        const el = document.createElement('p');
        el.textContent = entry.text;
        el.className = 'lyrics-line opacity-30 cursor-pointer';
        el.onclick = () => {
            if (!Number.isNaN(entry.time)) seekActivePlaybackPosition(entry.time);
        };
        lrcData.push({ ...entry, el });
        container.appendChild(el);
    });
    state.lyricsHighlight.timestamps = lrcData.map(l => l.time);
    clearLyricHighlight();
    updateLyricsOffsetDisplay(state.lyricsHighlight.offset || 0);
    return lrcData;
}

function renderPlainLyrics(raw, track = null) {
    const container = document.getElementById('windowedModeLyricsContent');
    if (!container) return [];
    const lines = String(raw || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    container.innerHTML = '';
    if (!lines.length) return [];

    const rawDur = isOnlineMusicPlaybackActive()
        ? Number(getOnlineMusicState().duration || getOnlineMusicCurrentTrack()?.duration || 0)
        : Number(els.audio?.duration);
    const fallbackDur = Number(track?.duration || 0);
    const duration = (Number.isFinite(rawDur) && rawDur > 0)
        ? rawDur
        : ((Number.isFinite(fallbackDur) && fallbackDur > 0) ? fallbackDur : 0);
    const lineDur = duration > 0 ? duration / lines.length : 0;
    const timedLines = [];

    lines.forEach((text, idx) => {
        const el = document.createElement('p');
        el.textContent = text;
        el.className = 'lyrics-line opacity-30 cursor-pointer';
        const time = lineDur > 0 ? (idx * lineDur) : NaN;
        el.onclick = () => {
            let target = Number.isFinite(time) ? time : NaN;
            if (!Number.isFinite(target)) {
                const currentDur = isOnlineMusicPlaybackActive()
                    ? Number(getOnlineMusicState().duration || getOnlineMusicCurrentTrack()?.duration || 0)
                    : Number(aud?.duration || 0);
                const fallback = Number(track?.duration || 0);
                const safeDur = (Number.isFinite(currentDur) && currentDur > 0)
                    ? currentDur
                    : ((Number.isFinite(fallback) && fallback > 0) ? fallback : 0);
                const runtimeLineDur = safeDur > 0 ? safeDur / lines.length : Number(state.lyricsHighlight?.lineDuration || 0);
                if (Number.isFinite(runtimeLineDur) && runtimeLineDur > 0) {
                    target = idx * runtimeLineDur;
                }
            }
            if (Number.isFinite(target) && target >= 0) {
                seekActivePlaybackPosition(target);
            }
        };
        timedLines.push({ text, time, el });
        container.appendChild(el);
    });

    return timedLines;
}

function getAssignedLyricsText(track) {
    if (!track) return '';
    const manual = String(track.customLyrics || '').trim();
    if (manual) return manual;
    const assigned = String(track.assignedLyricsRaw || '').trim();
    if (assigned) return assigned;
    const cached = getOfflineLyricsForTrack(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title);
    const cachedManual = String(cached?.manual?.raw || '').trim();
    if (cachedManual) return cachedManual;
    const cachedAuto = String(cached?.auto?.raw || '').trim();
    if (cachedAuto) return cachedAuto;
    return '';
}

function hasManualLyricsOverride(track = null) {
    const activeTrack = getLyricsActiveTrack(track);
    if (!activeTrack) return false;
    if (hasVerifiedManualLyricsOverride(activeTrack, activeTrack.lyricsArtist || activeTrack.artist, activeTrack.lyricsTitle || activeTrack.title, activeTrack.customLyrics)) return true;
    const cached = getOfflineLyricsForTrack(activeTrack, activeTrack.lyricsArtist || activeTrack.artist, activeTrack.lyricsTitle || activeTrack.title);
    return !!String(cached?.manual?.raw || '').trim();
}

function syncLyricsManualBadge(track = null) {
    const badge = document.getElementById('windowedModeLyricsManualBadge');
    if (!badge) return;
    const visible = hasManualLyricsOverride(track);
    badge.classList.toggle('hidden', !visible);
}

function setTrackLyricsSourceMeta(track, meta = null) {
    if (!track) return;
    if (!meta) {
        delete track.assignedLyricsMeta;
        return;
    }
    track.assignedLyricsMeta = { ...meta };
}

function getLyricsSourceDetails(track = null) {
    const activeTrack = getLyricsActiveTrack(track);
    const sourceTitle = document.getElementById('windowedModeLyricsSource')?.title || '';
    const cached = activeTrack ? getOfflineLyricsForTrack(activeTrack, activeTrack.lyricsArtist || activeTrack.artist, activeTrack.lyricsTitle || activeTrack.title) : { manual: null, auto: null };
    const sourceLabel = String(activeTrack?.assignedLyricsSource || '').trim() || (hasManualLyricsOverride(activeTrack) ? 'Manual' : 'None');
    const meta = activeTrack?.assignedLyricsMeta || null;
    const lines = [];
    if (sourceLabel === 'Manual') {
        lines.push('Manual override is stored locally and always wins over fetched lyrics.');
    }
    if (meta?.providerLabel) {
        lines.push(`Provider: ${meta.providerLabel}`);
    } else if (cached?.auto?.provider) {
        lines.push(`Provider: ${cached.auto.provider}`);
    }
    if (meta?.format || cached?.auto?.format) {
        lines.push(`Format: ${(meta?.format || cached?.auto?.format || '').toUpperCase()}`);
    }
    if (meta?.matchedLabel) {
        lines.push(`Matched entry: ${meta.matchedLabel}`);
    }
    if (meta?.queryReason) {
        lines.push(`Lookup path: ${meta.queryReason}`);
    }
    if (sourceTitle) {
        lines.push(sourceTitle);
    }
    if (!lines.length) {
        lines.push('No source details are available for this track yet.');
    }
    return {
        label: sourceLabel || 'None',
        detailText: lines.join('\n'),
        canReset: !!(activeTrack && hasManualLyricsOverride(activeTrack)),
        hasSourceInfo: !!lines.length
    };
}

function toggleLyricsSourceDetails() {
    const panel = document.getElementById('lyrics-source-details');
    if (!panel) return;
    panel.classList.toggle('hidden');
}

function openLyricsSourceDetails() {
    const panel = document.getElementById('lyrics-source-details');
    const track = getLyricsActiveTrack();
    const info = getLyricsSourceDetails(track);
    if (panel) panel.textContent = info.detailText;
    if (panel && panel.classList.contains('hidden')) panel.classList.remove('hidden');
}

function resetLyricsToFetched() {
    const track = getLyricsActiveTrack();
    if (!track) return;
    track.customLyrics = syncTrackCustomLyricsCache(track, '');
    persistLyricsTrackState(track);
    const cached = getOfflineLyricsForTrack(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title);
    if (cached.auto?.raw) {
        const label = cached.auto.format === 'lrc' ? 'Synced' : 'Auto';
        applyLyricsText(cached.auto.raw, label, track, {
            kind: 'auto',
            providerLabel: cached.auto.provider || 'Cached',
            format: cached.auto.format,
            matchedLabel: [cached.auto.artist, cached.auto.title].filter(Boolean).join(' - '),
            cached: true
        });
        const source = document.getElementById('windowedModeLyricsSource');
        if (source) source.title = cached.auto.provider ? `Cached from ${cached.auto.provider}` : '';
        showToast('Reverted to fetched lyrics.', 'info');
        return;
    }
    fetchLyrics(track.lyricsArtist || track.artist, track.lyricsTitle || track.title, track);
    showToast('Manual lyrics removed. Refetching best match.', 'info');
}

	        // Toggle the header add/edit lyrics button visibility and label
	        function toggleLyricsEditButton(show, label = 'Add Lyrics') {
	            const btn = document.getElementById('windowedModeLyricsEditBtn');
	            if (!btn) return;
	            const resolvedLabel = 'Edit Lyrics';
	            btn.classList.remove('hidden');
	            btn.title = resolvedLabel;
	            btn.setAttribute('aria-label', resolvedLabel);
	        }

	        // Apply raw lyrics text to the UI. Supports LRC (timestamped) and plain text.
	        function applyLyricsText(raw, sourceLabel = 'Manual', track = null, sourceMeta = null) {
	            const container = document.getElementById('windowedModeLyricsContent');
	            const source = document.getElementById('windowedModeLyricsSource');
	            if (!container || !source) return;
	            const activeTrack = getLyricsActiveTrack(track);
    setLyricsPanelMode('view', getLyricsActiveTrackId(activeTrack));
    if (activeTrack) {
        const assigned = String(raw || '').trim();
        activeTrack.assignedLyricsRaw = assigned;
        activeTrack.assignedLyricsSource = sourceLabel || '';
        setTrackLyricsSourceMeta(activeTrack, sourceMeta || {
            kind: sourceLabel === 'Manual' ? 'manual' : 'auto',
            providerLabel: sourceLabel === 'Manual' ? 'Manual override' : '',
            format: assigned ? detectLyricsFormat(assigned) : ''
        });
    }
	            resetLyricState(0);
    if (!raw || !raw.trim()) {
        syncLyricsManualBadge(activeTrack);
        showAddLyricsPrompt('No lyrics saved yet.');
        return;
    }
	            const parsed = parseLyrics(raw);
	            if (parsed.length > 0) {
	                source.innerText = sourceLabel;
	                source.className = LYRICS_SOURCE_BADGE_CLASS;
            source.title = sourceLabel === 'Manual'
                ? 'Manual override stored locally and preferred over fetched lyrics.'
                : '';
            syncLyricsManualBadge(activeTrack);
	                // source.classList.add('bg-blue-500/20','text-blue-400','border-blue-500/50');
	                toggleLyricsEditButton(true, 'Edit Lyrics');
	                return;
	            }
	            const plainTimedLines = renderPlainLyrics(raw, activeTrack);
	            source.innerText = sourceLabel;
	            source.className = LYRICS_SOURCE_BADGE_CLASS;
        source.title = sourceLabel === 'Manual'
            ? 'Manual override stored locally and preferred over fetched lyrics.'
            : '';
        syncLyricsManualBadge(activeTrack);
	            // source.classList.add('bg-blue-500/20','text-blue-400','border-blue-500/50');
	            toggleLyricsEditButton(true, 'Edit Lyrics');
    if (activeTrack && activeTrack.type === 'video') {
        resetLyricState(0);
    } else {
        prepareLyricsHighlight(plainTimedLines);
    }
}

// Render a small call-to-action when no lyrics exist
function showAddLyricsPrompt(message = 'Lyrics not found.') {
	            const container = document.getElementById('windowedModeLyricsContent');
	            if (!container) return;
    setLyricsPanelMode('view', getLyricsActiveTrackId());
        syncLyricsManualBadge(getLyricsActiveTrack());
	            toggleLyricsEditButton(true, 'Edit Lyrics');
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center gap-3 text-sm text-gray-300 py-8">
            <span class="text-gray-400 font-mono">${message}</span>
            <button onclick="openLyricsEditor()" class="px-6 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/20 transition-colors text-xs uppercase tracking-widest font-bold">Edit Lyrics</button>
        </div>`;
}

// Show an inline editor for adding/editing lyrics on the current track
function openLyricsEditor() {
	            const container = document.getElementById('windowedModeLyricsContent');
	            if (!container) return;
	            const track = getLyricsActiveTrack();
    lyricsFetchToken += 1;
    cancelActiveLyricsLookup();
    setLyricsPanelMode('editor', getLyricsActiveTrackId(track));
    resetLyricState(Number(state.lyricsHighlight?.offset || 0));
    const info = getLyricsSourceDetails(track);
    container.innerHTML = `
        <div class="flex flex-col gap-3 text-sm text-gray-200 h-full">
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div class="min-w-0">
                    <div class="text-[10px] text-gray-500 uppercase font-bold tracking-[0.18em]">Current Source</div>
                    <div class="mt-1 flex flex-wrap items-center gap-2">
                        <span class="text-[11px] font-bold px-2 py-1 rounded bg-white/10 text-white">${escapeHtml(info.label)}</span>
                        ${info.canReset ? '<span class="text-[10px] font-black uppercase tracking-[0.18em] px-2 py-1 rounded border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">MANUAL SAVED</span>' : ''}
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <button onclick="openLyricsSourceDetails()" class="px-3 py-2 rounded-md bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10">View Source</button>
                    ${info.canReset ? '<button onclick="resetLyricsToFetched()" class="px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-200 hover:bg-amber-500/20">Reset to Fetched</button>' : ''}
                </div>
            </div>
            <pre id="lyrics-source-details" class="hidden whitespace-pre-wrap rounded-xl border border-white/10 bg-black/35 p-3 text-[11px] leading-5 text-gray-300"></pre>
            <label for="lyrics-input" class="text-[10px] text-gray-500 uppercase font-bold ml-1 text-left">Lyrics</label>
            <textarea id="lyrics-input" name="lyrics-input" class="w-full h-full bg-black/50 border border-white/10 rounded-lg p-4 text-white focus:outline-none focus:border-cyan-500 resize-none font-mono" placeholder="Paste lyrics or LRC with timestamps..."></textarea>
            <div class="flex items-center justify-end gap-2 text-xs">
                <button onclick="cancelLyricsEditor()" class="px-4 py-2 rounded-md bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10">Cancel</button>
                <button onclick="saveCustomLyrics()" class="px-4 py-2 rounded-md bg-cyan-600 text-white hover:bg-cyan-500 font-bold">Save</button>
            </div>
        </div>`;
    // Set value separately to avoid HTML injection issues
    const input = document.getElementById('lyrics-input');
    if (input) input.value = getAssignedLyricsText(track);
}

// Cancel editing and restore existing lyrics view
function cancelLyricsEditor() {
    const track = getLyricsActiveTrack();
    setLyricsPanelMode('view', getLyricsActiveTrackId(track));
    if (track && hasVerifiedManualLyricsOverride(track, track.lyricsArtist || track.artist, track.lyricsTitle || track.title, track.customLyrics)) {
        applyLyricsText(track.customLyrics, 'Manual', track);
    } else if (track) {
        fetchLyrics(track.lyricsArtist || track.artist, track.lyricsTitle || track.title, track);
    } else {
        showAddLyricsPrompt('Select a track to view lyrics.');
    }
}

// Save custom lyrics to the current track and render them
	        function saveCustomLyrics() {
	            const input = document.getElementById('lyrics-input');
	            if (!input) return;
	            const text = input.value.trim();
	            const track = getLyricsActiveTrack();
	            if (!track) return;
	            track.customLyrics = syncTrackCustomLyricsCache(track, text);
    persistLyricsTrackState(track);
	            if (text) {
	                applyLyricsText(text, 'Manual', track);
	            } else {
	                showAddLyricsPrompt('No lyrics saved yet.');
	            }
    persistAppStateNow();
	        }

function generateVideoThumb(track) {
    return new Promise(resolve => {
        try {
            if (!track || !track.url) { resolve(); return; }

            const normalizeTitle = (s = '') => (s || '')
                .toLowerCase()
                .replace(/[\\.,\\-_\\(\\)\\[\\]\\{\\}!@#$%^&*;:'\"?]+/g, ' ')
                .replace(/\\s+/g, ' ')
                .trim();
            const isRegularShow = normalizeTitle(track.title || track.fileName || '')
                .includes('regular show');

            const v = document.createElement('video');
            v.src = track.url;
            v.muted = true;
            v.preload = 'metadata';

            const capture = () => {
                try {
                    const c = document.createElement('canvas');
                    c.width = 320; c.height = 180;
                    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
                    track.cover = c.toDataURL('image/jpeg', 0.72);
                    const cacheKey = `${(track.artist||'').toLowerCase()}|${(track.title||'').toLowerCase()}`;
                    if (track.cover && !/^data:/i.test(track.cover)) {
                        state.coverCache[cacheKey] = track.cover;
                    }
                    updateTrackUI(track);
                } catch (_) {}
                resolve();
            };

            v.onerror = () => resolve();

            v.addEventListener('loadedmetadata', () => {
                const dur = v.duration;
                let target = 1;
                if (isFinite(dur) && dur > 0) {
                    if (isRegularShow) {
                        target = dur >= 6 ? 6 : Math.max(0, Math.min(1, dur / 2));
                    } else {
                        target = Math.min(dur / 2, 10);
                    }
                }
                const trySeek = () => {
                    try { v.currentTime = target; }
                    catch (_) { capture(); }
                };
                v.addEventListener('seeked', capture, { once: true });
                trySeek();
            }, { once: true });

            // Fallback if seek never happens
            setTimeout(capture, 4000);

            v.load();
        } catch (e) {
            resolve();
        }
    });
}

