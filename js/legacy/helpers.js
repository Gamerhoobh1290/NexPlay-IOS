/* Legacy shared helpers, storage helpers, route helpers, and private-session utilities.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// Basic sanitizers to prevent stored metadata from injecting markup
function sanitizeText(str = '') {
    return String(str || '').replace(/[<>]/g, '').trim();
}
function cleanPlayerDisplayText(str = '') {
    return sanitizeText(str)
        .replace(/\u00e2\u20ac[\u201c\u201d]/g, '-')
        .replace(/\u00e2\u20ac[\u02dc\u2122]/g, "'")
        .replace(/\u00e2\u20ac[\u0153\ufffd]/g, '"')
        .replace(/\u00e2\u20ac\u00a6/g, '...')
        .replace(/\s+/g, ' ')
        .trim();
}
function formatPlayerTrackLine(track = null) {
    const title = cleanPlayerDisplayText(track?.title || 'Unknown Track') || 'Unknown Track';
    const artist = cleanPlayerDisplayText(track?.artist || '');
    return artist ? `${title} - ${artist}` : title;
}
function escapeSvgText(str = '') {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function buildTrackCoverPlaceholderCacheKey(track = null) {
    return sanitizeText(track?.id || track?.fingerprint || `${track?.artist || ''}|${track?.title || ''}|${track?.type || ''}`.toLowerCase());
}
function buildTrackCoverPlaceholderDataUri(track = null) {
    const title = sanitizeText(track?.title || 'NexPlay').slice(0, 28).toUpperCase();
    const artist = sanitizeText(track?.artist || (track?.type === 'video' ? 'Video Track' : 'Audio Track')).slice(0, 28).toUpperCase();
    const kind = track?.type === 'video' ? 'VIDEO' : 'AUDIO';
    const safeTitle = escapeSvgText(title || 'NEXPLAY');
    const safeArtist = escapeSvgText(artist || 'TRACK');
    const safeKind = escapeSvgText(kind);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#164e63"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="250" r="150" fill="rgba(255,255,255,0.08)"/><circle cx="300" cy="250" r="70" fill="rgba(255,255,255,0.16)"/><circle cx="300" cy="250" r="24" fill="rgba(255,255,255,0.48)"/><text x="300" y="465" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="800" fill="#e2e8f0">${safeTitle}</text><text x="300" y="510" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="600" fill="rgba(226,232,240,0.82)">${safeArtist}</text><text x="300" y="78" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="700" fill="rgba(226,232,240,0.72)" letter-spacing="8">${safeKind}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function getTrackCoverOrFallback(track = null) {
    const explicitCover = String(track?.cover || '').trim();
    if (explicitCover) return explicitCover;
    const cacheKey = buildTrackCoverPlaceholderCacheKey(track);
    if (cacheKey && localCoverPlaceholderCache.has(cacheKey)) {
        return localCoverPlaceholderCache.get(cacheKey);
    }
    const fallback = buildTrackCoverPlaceholderDataUri(track);
    if (cacheKey) localCoverPlaceholderCache.set(cacheKey, fallback);
    return fallback;
}
function bindTrackCoverImageFallbacks(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll('img[data-track-cover-image="true"]').forEach((img) => {
        if (img.dataset.fallbackBound === '1') return;
        img.dataset.fallbackBound = '1';
        img.addEventListener('error', () => {
            const trackId = sanitizeText(img.dataset.trackId || '');
            const track = (state.tracks || []).find((entry) => entry?.id === trackId) || null;
            const fallback = buildTrackCoverPlaceholderDataUri(track || {
                title: sanitizeText(img.dataset.trackTitle || 'Track'),
                artist: sanitizeText(img.dataset.trackArtist || 'Unknown'),
                type: sanitizeText(img.dataset.trackType || 'audio')
            });
            img.src = fallback;
            img.classList.remove('hidden');
            if (img.nextElementSibling) img.nextElementSibling.classList.add('hidden');
        });
    });
}
function sanitizeStoredMetadata(meta) {
    const clean = {};
    Object.entries(meta || {}).forEach(([key, val]) => {
        if (!val) return;
        const tags = Array.isArray(val.tags) ? val.tags.map(sanitizeText).filter(Boolean) : [];
        clean[key] = {
            ...val,
            title: sanitizeText(val.title),
            artist: sanitizeText(val.artist),
            tags,
            cover: val.cover || '',
            customLyrics: typeof val.customLyrics === 'string' ? val.customLyrics : '',
            isFavorite: !!val.isFavorite,
            playCount: val.playCount || 0,
            duration: val.duration || 0,
            skipCount: val.skipCount || 0,
            lastSkippedAt: val.lastSkippedAt || 0,
            listeningTime: val.listeningTime || 0,
            resumePosition: clampNumber(val.resumePosition, 0, Number.MAX_SAFE_INTEGER, 0),
            resumeUpdatedAt: clampNumber(val.resumeUpdatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
            sourcePath: sanitizeText(val.sourcePath || ''),
            watchFolderId: sanitizeText(val.watchFolderId || ''),
            sourceFingerprint: sanitizeText(val.sourceFingerprint || ''),
            originProvider: sanitizeText(val.originProvider || ''),
            originReleaseId: sanitizeText(val.originReleaseId || ''),
            downloadedAt: Number(val.downloadedAt) || 0,
            downloadState: sanitizeText(val.downloadState || '')
        };
    });
    return clean;
}
function getTrackMetadataKeys(input = {}) {
    const keys = [];
    const fingerprint = sanitizeText(input.fingerprint || '');
    if (fingerprint) keys.push(fingerprint);
    const rawFileName = typeof input.fileName === 'string'
        ? input.fileName
        : (typeof input.name === 'string' ? input.name : '');
    const fileNames = Array.from(new Set([rawFileName, sanitizeText(rawFileName)].filter(Boolean)));
    const size = Number(input.size);
    if (Number.isFinite(size) && size >= 0) {
        fileNames.forEach((fileName) => {
            keys.push(`${fileName}|${size}`);
        });
    }
    return Array.from(new Set(keys));
}
function getStoredMetadataForFile(file) {
    if (!file) return null;
    const keys = getTrackMetadataKeys({
        fingerprint: `${file.name}|${file.size}|${file.lastModified}`,
        fileName: file.name,
        size: file.size
    });
    for (const key of keys) {
        const meta = state.metadataStore?.[key];
        if (meta) return meta;
    }
    return null;
}
function sanitizeStoredPlaylists(list) {
    return (list || []).map(pl => ({
        ...pl,
        name: sanitizeText(pl.name),
        tracks: Array.isArray(pl.tracks) ? pl.tracks.filter(Boolean) : [],
        importSource: pl.importSource === 'youtube-playlist' ? 'youtube-playlist' : (pl.importSource || undefined)
    }));
}
function sanitizeKeyBindings(raw) {
    const defaults = {
        playPause: 'Space',
        next: 'ArrowRight',
        prev: 'ArrowLeft',
        volumeUp: 'ArrowUp',
        volumeDown: 'ArrowDown',
        mute: 'KeyM',
        fsModeToggle: 'KeyF'
    };
    if (!raw || typeof raw !== 'object') return { ...defaults };
    const out = { ...defaults };
    Object.keys(defaults).forEach((action) => {
        const value = raw[action];
        if (typeof value === 'string' && value.trim()) out[action] = value.trim();
    });
    return out;
}
function safeJsonParse(raw, fallback) {
    return safeParseJSON(raw, fallback);
}
function readStorageValue(key, fallback = null) {
    return safeCall(() => {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : raw;
    }, fallback);
}
function writeStorageValue(key, value) {
    return safeCall(() => {
        localStorage.setItem(key, String(value ?? ''));
        return true;
    }, false);
}
function removeStorageValue(key) {
    return safeCall(() => {
        localStorage.removeItem(key);
        return true;
    }, false);
}

function normalizeDesktopPerformancePreset(value = '') {
    const preset = String(value || '').trim().toLowerCase();
    return preset === 'low-end' || preset === 'high-end' ? preset : '';
}

function readDesktopPerformancePreset() {
    return normalizeDesktopPerformancePreset(
        readStorageValue(DESKTOP_PERFORMANCE_PRESET_STORAGE_KEY, '')
    );
}

function loadDesktopPerformancePreset() {
    state.desktopPerformancePreset = readDesktopPerformancePreset();
    return state.desktopPerformancePreset;
}

function persistDesktopPerformancePreset(value) {
    const preset = normalizeDesktopPerformancePreset(value);
    if (!preset) return false;
    return writeStorageValue(DESKTOP_PERFORMANCE_PRESET_STORAGE_KEY, preset);
}

function readStorageJson(key, fallback, options = {}) {
    const opts = { repairOnError: true, ...options };
    const raw = readStorageValue(key, null);
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    const parseSentinel = {};
    const parsed = safeParseJSON(raw, parseSentinel);
    const parseFailed = parsed === parseSentinel;
    if (parseFailed && opts.repairOnError) {
        // Reset only the corrupted key to preserve other persisted data.
        writeStorageJson(key, fallback);
    }
    return parseFailed ? fallback : parsed;
}
function writeStorageJson(key, value) {
    return safeCall(() => {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    }, false);
}

function parsePersistedAppState(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const parsed = safeParseJSON(raw, null);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

function readPersistedAppState(fallback = null) {
    const primaryRaw = readStorageValue(APP_STATE_STORAGE_KEY, null);
    const primary = parsePersistedAppState(primaryRaw);
    if (primary) {
        const backupRaw = readStorageValue(APP_STATE_BACKUP_STORAGE_KEY, null);
        if (!parsePersistedAppState(backupRaw)) {
            // Keep a last-known-good mirror so a later damaged primary can recover.
            writeStorageValue(APP_STATE_BACKUP_STORAGE_KEY, primaryRaw);
        }
        return primary;
    }

    const backupRaw = readStorageValue(APP_STATE_BACKUP_STORAGE_KEY, null);
    const backup = parsePersistedAppState(backupRaw);
    if (backup) {
        // Repair the primary in place. A failed repair is harmless because the
        // valid backup remains available on the next launch.
        writeStorageValue(APP_STATE_STORAGE_KEY, backupRaw);
        return backup;
    }

    // Neither copy is usable. Clear only these two keys; init will persist a
    // clean default state without disturbing the rest of the user's library.
    if (primaryRaw !== null) removeStorageValue(APP_STATE_STORAGE_KEY);
    if (backupRaw !== null) removeStorageValue(APP_STATE_BACKUP_STORAGE_KEY);
    return fallback;
}

function writePersistedAppState(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const serialized = safeCall(() => JSON.stringify(payload), '');
    if (!serialized) return false;

    const previousPrimaryRaw = readStorageValue(APP_STATE_STORAGE_KEY, null);
    if (parsePersistedAppState(previousPrimaryRaw)) {
        // Rotate the last valid primary first. If the process stops between the
        // two synchronous writes, the backup still contains recoverable data.
        writeStorageValue(APP_STATE_BACKUP_STORAGE_KEY, previousPrimaryRaw);
    }

    if (!writeStorageValue(APP_STATE_STORAGE_KEY, serialized)) return false;

    // Once the primary succeeds, mirror the latest state. If this secondary
    // write runs out of quota, the rotated previous copy is still usable.
    writeStorageValue(APP_STATE_BACKUP_STORAGE_KEY, serialized);
    return true;
}

function inferTrackIdentityFromFileName(fileName = '') {
    let title = sanitizeText(String(fileName || '').replace(/\.[^/.]+$/, ''));
    let artist = 'Unknown';
    if (title.includes('-')) {
        const parts = title.split('-');
        artist = sanitizeText(parts[0]) || 'Unknown';
        title = sanitizeText(parts.slice(1).join('-'));
    }
    return {
        title: title || sanitizeText(fileName) || 'Untitled',
        artist: artist || 'Unknown'
    };
}

function isPersistableLocalTrack(track = null) {
    return !!(track && track.source === 'local' && sanitizeText(track.fingerprint || ''));
}

function sanitizeStoredLocalLibrary(list) {
    return (Array.isArray(list) ? list : []).map((item) => {
        const fingerprint = sanitizeText(item?.fingerprint || '');
        const id = sanitizeText(item?.id || '');
        const fileName = sanitizeText(item?.fileName || '');
        if (!fingerprint || !id || !fileName) return null;
        const identity = inferTrackIdentityFromFileName(fileName);
        return {
            id,
            fingerprint,
            fileName,
            size: Math.max(0, Number(item?.size) || 0),
            addedAt: Math.max(0, Number(item?.addedAt) || 0),
            type: sanitizeText(item?.type || '').toLowerCase() === 'video' ? 'video' : 'audio',
            title: sanitizeText(item?.title || identity.title),
            artist: sanitizeText(item?.artist || identity.artist) || 'Unknown',
            sourcePath: sanitizeText(item?.sourcePath || ''),
            sourceFingerprint: sanitizeText(item?.sourceFingerprint || fingerprint) || fingerprint,
            lastModified: Math.max(0, Number(item?.lastModified) || 0)
        };
    }).filter(Boolean);
}

function buildPersistedLocalTrackSnapshot(track = null) {
    if (!isPersistableLocalTrack(track) || track.persistedLocally !== true) return null;
    return {
        id: sanitizeText(track.id || ''),
        fingerprint: sanitizeText(track.fingerprint || ''),
        fileName: sanitizeText(track.fileName || ''),
        size: Math.max(0, Number(track.size) || 0),
        addedAt: Math.max(0, Number(track.addedAt) || 0),
        type: track.type === 'video' ? 'video' : 'audio',
        title: sanitizeText(track.title || ''),
        artist: sanitizeText(track.artist || '') || 'Unknown',
        sourcePath: sanitizeText(track.sourcePath || ''),
        sourceFingerprint: sanitizeText(track.sourceFingerprint || track.fingerprint || ''),
        lastModified: Math.max(0, Number(track.lastModified) || 0)
    };
}

function persistLocalLibraryIndex() {
    if (shouldBypassStorageWriteForPrivateSession()) return [];
    const snapshots = (state.tracks || []).map(buildPersistedLocalTrackSnapshot).filter(Boolean);
    if (isDesktopRuntimeAvailable() && nexPlayDesktopBridge && typeof nexPlayDesktopBridge.saveLocalLibraryIndex === 'function') {
        removeStorageValue(LOCAL_LIBRARY_INDEX_KEY);
        const serializedSnapshots = safeCall(() => JSON.stringify(snapshots), '');
        if (serializedSnapshots && serializedSnapshots === lastDesktopLocalLibrarySnapshotsJson) {
            return snapshots;
        }
        if (serializedSnapshots) lastDesktopLocalLibrarySnapshotsJson = serializedSnapshots;
        nexPlayDesktopBridge.saveLocalLibraryIndex({ snapshots }).catch((error) => {
            if (serializedSnapshots) lastDesktopLocalLibrarySnapshotsJson = '';
            console.warn('Failed to save desktop local library index', error);
            announceLocalLibraryPersistenceWarning('Desktop library index could not be saved. Imported files may not restore after app restart.');
        });
        return snapshots;
    }
    writeStorageJson(LOCAL_LIBRARY_INDEX_KEY, snapshots);
    return snapshots;
}

function readStoredLocalLibraryIndexState() {
    let raw = null;
    try {
        if (typeof localStorage === 'undefined') {
            return { snapshots: [], authoritative: false, reason: 'unavailable' };
        }
        raw = localStorage.getItem(LOCAL_LIBRARY_INDEX_KEY);
    } catch (error) {
        console.warn('Failed to read browser local library index', error);
        return { snapshots: [], authoritative: false, reason: 'unavailable' };
    }

    // A missing key is not proof that the retained library is intentionally
    // empty. It can also mean the index write failed after a blob was stored.
    if (raw === null) {
        return { snapshots: [], authoritative: false, reason: 'missing' };
    }
    if (typeof raw !== 'string' || !raw.trim()) {
        return { snapshots: [], authoritative: false, reason: 'corrupt' };
    }

    const parseSentinel = {};
    const parsed = safeParseJSON(raw, parseSentinel);
    if (parsed === parseSentinel || !Array.isArray(parsed)) {
        return { snapshots: [], authoritative: false, reason: 'corrupt' };
    }

    const snapshots = sanitizeStoredLocalLibrary(parsed);
    // Do not sweep against a partially sanitized index. A rejected entry may
    // still be the only reference to a valid IndexedDB blob.
    const authoritative = snapshots.length === parsed.length;
    return {
        snapshots,
        authoritative,
        reason: authoritative ? 'ok' : 'invalid-entries'
    };
}

function getStoredLocalLibraryIndex() {
    return readStoredLocalLibraryIndexState().snapshots;
}

async function loadPersistedLocalLibraryIndex(options = {}) {
    const includeState = options?.includeState === true;
    const finishDesktopLoad = (snapshots = []) => (
        includeState
            ? { snapshots, authoritative: false, reason: 'desktop' }
            : snapshots
    );
    if (isDesktopRuntimeAvailable() && nexPlayDesktopBridge && typeof nexPlayDesktopBridge.loadLocalLibraryIndex === 'function') {
        try {
            const result = await nexPlayDesktopBridge.loadLocalLibraryIndex();
            const snapshots = sanitizeStoredLocalLibrary(result?.snapshots || []);
            if (result?.recovered) {
                announceLocalLibraryPersistenceWarning('NexPlay recovered your library index from its last-known-good backup.');
            } else if (result?.recoveryUnavailable) {
                announceLocalLibraryPersistenceWarning('The library index is damaged and no valid backup is available. Your media files were not deleted.');
            }
            if (snapshots.length) {
                removeStorageValue(LOCAL_LIBRARY_INDEX_KEY);
                lastDesktopLocalLibrarySnapshotsJson = safeCall(() => JSON.stringify(snapshots), '');
                return finishDesktopLoad(snapshots);
            }
        } catch (error) {
            console.warn('Failed to load desktop local library index', error);
        }

        // One-way legacy migration for older desktop builds that kept this index in localStorage.
        const legacySnapshots = getStoredLocalLibraryIndex();
        if (legacySnapshots.length) {
            const serializedLegacy = safeCall(() => JSON.stringify(legacySnapshots), '');
            if (serializedLegacy) lastDesktopLocalLibrarySnapshotsJson = serializedLegacy;
            if (typeof nexPlayDesktopBridge.saveLocalLibraryIndex === 'function') {
                nexPlayDesktopBridge.saveLocalLibraryIndex({ snapshots: legacySnapshots }).catch((error) => {
                    if (serializedLegacy) lastDesktopLocalLibrarySnapshotsJson = '';
                    console.warn('Failed to migrate desktop local library index from localStorage', error);
                });
            }
            removeStorageValue(LOCAL_LIBRARY_INDEX_KEY);
            return finishDesktopLoad(legacySnapshots);
        }
        return finishDesktopLoad([]);
    }
    const browserIndexState = readStoredLocalLibraryIndexState();
    if (browserIndexState.reason === 'corrupt' || browserIndexState.reason === 'invalid-entries') {
        announceLocalLibraryPersistenceWarning('The browser library index is damaged. Stored media was kept to prevent data loss.');
    }
    return includeState ? browserIndexState : browserIndexState.snapshots;
}

function announceLocalLibraryPersistenceWarning(message = '') {
    if (!message || localLibraryPersistenceWarningShown) return;
    localLibraryPersistenceWarningShown = true;
    showToast(message, 'error', { duration: 5500 });
}

function openLocalLibraryDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (localMediaDbPromise) return localMediaDbPromise;
    let cachedPromise = null;
    const openAttempt = new Promise((resolve) => {
        let settled = false;
        let timeoutId = null;
        const settle = (db = null) => {
            if (settled) {
                // A blocked or timed-out request can still succeed later. Do not
                // retain that late connection after callers have moved on.
                if (db && typeof db.close === 'function') {
                    try { db.close(); } catch (_) {}
                }
                return;
            }
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve(db || null);
        };
        try {
            const request = indexedDB.open(LOCAL_LIBRARY_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (db && !db.objectStoreNames.contains(LOCAL_LIBRARY_DB_STORE)) {
                    db.createObjectStore(LOCAL_LIBRARY_DB_STORE, { keyPath: 'fingerprint' });
                }
            };
            request.onsuccess = () => {
                const db = request.result || null;
                if (db) {
                    db.onversionchange = () => {
                        try { db.close(); } catch (_) {}
                        if (localMediaDbPromise === cachedPromise) {
                            localMediaDbPromise = null;
                        }
                    };
                }
                settle(db);
            };
            request.onerror = () => {
                console.warn('Failed to open local media storage', request.error);
                settle(null);
            };
            request.onblocked = () => {
                console.warn('Local media storage is blocked by another open tab or process.');
                settle(null);
            };
            timeoutId = setTimeout(() => {
                console.warn('Local media storage did not open before the safety timeout.');
                settle(null);
            }, 4000);
        } catch (err) {
            console.warn('Local media storage is unavailable', err);
            settle(null);
        }
    });
    cachedPromise = openAttempt.then((db) => {
        // Do not permanently cache a failed attempt. A later import/read may
        // succeed after the other tab closes or browser storage recovers.
        if (!db && localMediaDbPromise === cachedPromise) {
            localMediaDbPromise = null;
        }
        return db;
    });
    localMediaDbPromise = cachedPromise;
    return cachedPromise;
}

async function putPersistedLocalMediaBlob(track = null, file = null) {
    if (!isPersistableLocalTrack(track) || !(file instanceof Blob)) return false;
    const db = await openLocalLibraryDb();
    if (!db) return false;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(LOCAL_LIBRARY_DB_STORE, 'readwrite');
            tx.objectStore(LOCAL_LIBRARY_DB_STORE).put({
                fingerprint: sanitizeText(track.fingerprint || ''),
                fileBlob: file,
                fileName: sanitizeText(track.fileName || file.name || ''),
                type: track.type === 'video' ? 'video' : 'audio',
                updatedAt: Date.now()
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
        } catch (err) {
            console.warn('Failed to persist imported local media', err);
            resolve(false);
        }
    });
}

async function readPersistedLocalMediaBlob(fingerprint = '') {
    const key = sanitizeText(fingerprint || '');
    if (!key) return null;
    const db = await openLocalLibraryDb();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(LOCAL_LIBRARY_DB_STORE, 'readonly');
            const request = tx.objectStore(LOCAL_LIBRARY_DB_STORE).get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
        } catch (err) {
            console.warn('Failed to read persisted local media', err);
            resolve(null);
        }
    });
}

async function deletePersistedLocalMediaBlobs(fingerprints = []) {
    const keys = Array.from(new Set(
        (Array.isArray(fingerprints) ? fingerprints : [fingerprints])
            .map((fingerprint) => sanitizeText(fingerprint || ''))
            .filter(Boolean)
    ));
    if (!keys.length) return 0;
    const db = await openLocalLibraryDb();
    if (!db) return 0;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (deletedCount = 0) => {
            if (settled) return;
            settled = true;
            resolve(Math.max(0, Number(deletedCount) || 0));
        };
        try {
            const tx = db.transaction(LOCAL_LIBRARY_DB_STORE, 'readwrite');
            const store = tx.objectStore(LOCAL_LIBRARY_DB_STORE);
            keys.forEach((key) => store.delete(key));
            tx.oncomplete = () => finish(keys.length);
            tx.onerror = () => finish(0);
            tx.onabort = () => finish(0);
        } catch (err) {
            console.warn('Failed to delete persisted local media', err);
            finish(0);
        }
    });
}

async function deletePersistedLocalMediaBlob(fingerprint = '') {
    const key = sanitizeText(fingerprint || '');
    if (!key) return false;
    return (await deletePersistedLocalMediaBlobs([key])) === 1;
}

async function deleteOrphanedPersistedLocalMediaBlobs(retainedFingerprints = [], options = {}) {
    const retained = new Set(
        (Array.isArray(retainedFingerprints) ? retainedFingerprints : [])
            .map((fingerprint) => sanitizeText(fingerprint || ''))
            .filter(Boolean)
    );
    // An empty retained set is too destructive to infer. Callers performing an
    // intentional full cleanup must opt in explicitly.
    if (!retained.size && options?.allowEmpty !== true) return 0;
    const db = await openLocalLibraryDb();
    if (!db) return 0;
    return new Promise((resolve) => {
        let deletedCount = 0;
        let settled = false;
        const finish = (count = 0) => {
            if (settled) return;
            settled = true;
            resolve(Math.max(0, Number(count) || 0));
        };
        const deleteIfOrphaned = (store, rawKey) => {
            const key = sanitizeText(rawKey || '');
            if (!key || retained.has(key)) return;
            store.delete(rawKey);
            deletedCount += 1;
        };
        try {
            const tx = db.transaction(LOCAL_LIBRARY_DB_STORE, 'readwrite');
            const store = tx.objectStore(LOCAL_LIBRARY_DB_STORE);
            if (typeof store.getAllKeys === 'function') {
                const request = store.getAllKeys();
                request.onsuccess = () => {
                    (Array.isArray(request.result) ? request.result : [])
                        .forEach((key) => deleteIfOrphaned(store, key));
                };
            } else {
                const request = store.openKeyCursor();
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) return;
                    const key = sanitizeText(cursor.key || '');
                    if (key && !retained.has(key)) {
                        cursor.delete();
                        deletedCount += 1;
                    }
                    cursor.continue();
                };
            }
            tx.oncomplete = () => finish(deletedCount);
            tx.onerror = () => finish(0);
            tx.onabort = () => finish(0);
        } catch (err) {
            console.warn('Failed to remove orphaned local media', err);
            finish(0);
        }
    });
}

async function finalizeDeletedLocalMediaTracks(tracks = []) {
    const deletedTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    if (!deletedTracks.length) return { deletedBlobCount: 0, revokedUrlCount: 0 };
    const activeTracks = Array.isArray(state.tracks) ? state.tracks : [];
    const activeFingerprints = new Set(
        activeTracks.map((track) => sanitizeText(track?.fingerprint || '')).filter(Boolean)
    );
    const removableFingerprints = deletedTracks
        .map((track) => sanitizeText(track?.fingerprint || ''))
        .filter((fingerprint) => fingerprint && !activeFingerprints.has(fingerprint));
    const deletedBlobCount = await deletePersistedLocalMediaBlobs(removableFingerprints);
    const activeUrls = new Set(activeTracks.map((track) => sanitizeText(track?.url || '')).filter(Boolean));
    const removableUrls = new Set(
        deletedTracks
            .map((track) => sanitizeText(track?.url || ''))
            .filter((url) => url.startsWith('blob:') && !activeUrls.has(url))
    );
    let revokedUrlCount = 0;
    removableUrls.forEach((url) => {
        try {
            URL.revokeObjectURL(url);
            revokedUrlCount += 1;
        } catch (_) {}
    });
    return { deletedBlobCount, revokedUrlCount };
}

async function cleanupOrphanedBrowserLocalMediaAfterHydration(snapshots = [], options = {}) {
    if (options?.authoritative !== true || isDesktopRuntimeAvailable()) return 0;
    const retainedFingerprints = new Set(
        (Array.isArray(snapshots) ? snapshots : [])
            .map((snapshot) => sanitizeText(snapshot?.fingerprint || ''))
            .filter(Boolean)
    );

    // Hydration is asynchronous and imports can begin after app-ready. Protect
    // any local track that entered live state while the persisted index loaded.
    (Array.isArray(state.tracks) ? state.tracks : []).forEach((track) => {
        if (track?.source !== 'local') return;
        const fingerprint = sanitizeText(track?.fingerprint || '');
        if (fingerprint) retainedFingerprints.add(fingerprint);
    });

    try {
        return await deleteOrphanedPersistedLocalMediaBlobs(
            Array.from(retainedFingerprints),
            { allowEmpty: true }
        );
    } catch (error) {
        console.warn('Failed to finish browser local media orphan cleanup', error);
        return 0;
    }
}

function buildRestoredLocalTrack(snapshot = {}, storedEntry = null) {
    const blob = storedEntry?.fileBlob instanceof Blob
        ? storedEntry.fileBlob
        : (storedEntry instanceof Blob ? storedEntry : null);
    if (!(blob instanceof Blob)) return null;
    const metadataBySource = getStoredMetadataBySource(
        sanitizeText(snapshot.sourcePath || ''),
        sanitizeText(snapshot.sourceFingerprint || snapshot.fingerprint || '')
    );
    const metadata = state.metadataStore?.[snapshot.fingerprint] || metadataBySource || {};
    const identity = inferTrackIdentityFromFileName(snapshot.fileName || '');
    return {
        id: sanitizeText(snapshot.id || '') || generateId(),
        title: sanitizeText(metadata.title || snapshot.title || identity.title),
        artist: sanitizeText(metadata.artist || snapshot.artist || identity.artist) || 'Unknown',
        type: snapshot.type === 'video' ? 'video' : 'audio',
        source: 'local',
        url: URL.createObjectURL(blob),
        duration: Number(metadata.duration) || 0,
        size: Math.max(0, Number(snapshot.size) || Number(blob.size) || 0),
        addedAt: Math.max(0, Number(snapshot.addedAt) || Date.now()),
        isFavorite: !!metadata.isFavorite,
        cover: metadata.cover || '',
        tags: Array.isArray(metadata.tags) ? metadata.tags.map(sanitizeText).filter(Boolean) : [],
        playCount: Number(metadata.playCount) || 0,
        skipCount: Number(metadata.skipCount) || 0,
        lastSkippedAt: Number(metadata.lastSkippedAt) || 0,
        listeningTime: Number(metadata.listeningTime) || 0,
        resumePosition: clampNumber(metadata.resumePosition, 0, Number.MAX_SAFE_INTEGER, 0),
        resumeUpdatedAt: clampNumber(metadata.resumeUpdatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        customLyrics: typeof metadata.customLyrics === 'string' ? metadata.customLyrics : '',
        fingerprint: sanitizeText(snapshot.fingerprint || ''),
        fileName: sanitizeText(snapshot.fileName || ''),
        sourcePath: sanitizeText(metadata.sourcePath || snapshot.sourcePath || ''),
        watchFolderId: sanitizeText(metadata.watchFolderId || ''),
        sourceFingerprint: sanitizeText(metadata.sourceFingerprint || snapshot.sourceFingerprint || snapshot.fingerprint || ''),
        originProvider: sanitizeText(metadata.originProvider || ''),
        originReleaseId: sanitizeText(metadata.originReleaseId || ''),
        downloadedAt: Number(metadata.downloadedAt) || 0,
        downloadState: sanitizeText(metadata.downloadState || ''),
        lastModified: Math.max(0, Number(snapshot.lastModified) || 0),
        persistedLocally: true
    };
}

function buildRestoredDesktopLocalTrack(snapshot = {}, resolvedEntry = {}) {
    const mediaUrl = sanitizeText(resolvedEntry?.mediaUrl || '');
    if (!mediaUrl) return null;
    const sourcePath = sanitizeText(snapshot.sourcePath || resolvedEntry.path || '');
    const sourceFingerprint = sanitizeText(snapshot.sourceFingerprint || snapshot.fingerprint || '');
    const metadataBySource = getStoredMetadataBySource(sourcePath, sourceFingerprint);
    const metadata = state.metadataStore?.[snapshot.fingerprint] || metadataBySource || {};
    const fileName = sanitizeText(snapshot.fileName || resolvedEntry.name || sourcePath.split(/[\\/]/).pop() || '');
    const identity = inferTrackIdentityFromFileName(fileName);
    return {
        id: sanitizeText(snapshot.id || '') || generateId(),
        title: sanitizeText(metadata.title || snapshot.title || identity.title),
        artist: sanitizeText(metadata.artist || snapshot.artist || identity.artist) || 'Unknown',
        type: snapshot.type === 'video' ? 'video' : (resolvedEntry.type === 'video' ? 'video' : 'audio'),
        source: 'local',
        url: mediaUrl,
        duration: Number(metadata.duration) || 0,
        size: Math.max(0, Number(resolvedEntry.size) || Number(snapshot.size) || 0),
        addedAt: Math.max(0, Number(snapshot.addedAt) || Number(resolvedEntry.lastModified) || Date.now()),
        isFavorite: !!metadata.isFavorite,
        cover: metadata.cover || '',
        tags: Array.isArray(metadata.tags) ? metadata.tags.map(sanitizeText).filter(Boolean) : [],
        playCount: Number(metadata.playCount) || 0,
        skipCount: Number(metadata.skipCount) || 0,
        lastSkippedAt: Number(metadata.lastSkippedAt) || 0,
        listeningTime: Number(metadata.listeningTime) || 0,
        resumePosition: clampNumber(metadata.resumePosition, 0, Number.MAX_SAFE_INTEGER, 0),
        resumeUpdatedAt: clampNumber(metadata.resumeUpdatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
        customLyrics: typeof metadata.customLyrics === 'string' ? metadata.customLyrics : '',
        fingerprint: sanitizeText(snapshot.fingerprint || ''),
        fileName,
        sourcePath,
        watchFolderId: sanitizeText(metadata.watchFolderId || ''),
        sourceFingerprint: sanitizeText(metadata.sourceFingerprint || sourceFingerprint),
        originProvider: sanitizeText(metadata.originProvider || ''),
        originReleaseId: sanitizeText(metadata.originReleaseId || ''),
        downloadedAt: Number(metadata.downloadedAt) || 0,
        downloadState: sanitizeText(metadata.downloadState || ''),
        lastModified: Math.max(0, Number(resolvedEntry.lastModified) || Number(snapshot.lastModified) || 0),
        persistedLocally: true
    };
}

async function restoreDesktopLocalLibraryTracks(snapshots = [], existingIds = new Set()) {
    if (!isDesktopRuntimeAvailable() || !nexPlayDesktopBridge || typeof nexPlayDesktopBridge.resolveLocalMediaPaths !== 'function') {
        return { restoredTracks: [], missingCount: 0 };
    }
    const sourceSnapshots = (Array.isArray(snapshots) ? snapshots : []).filter((snapshot) => sanitizeText(snapshot?.sourcePath || ''));
    if (!sourceSnapshots.length) return { restoredTracks: [], missingCount: 0 };
    const resolution = await nexPlayDesktopBridge.resolveLocalMediaPaths({ snapshots: sourceSnapshots });
    const resolvedEntries = Array.isArray(resolution?.entries) ? resolution.entries : [];
    const entryByPath = new Map();
    resolvedEntries.forEach((entry) => {
        const sourcePath = sanitizeText(entry?.path || '');
        if (!sourcePath) return;
        entryByPath.set(sourcePath, entry);
        entryByPath.set(sourcePath.toLowerCase(), entry);
    });
    const restoredTracks = [];
    let missingCount = 0;
    sourceSnapshots.forEach((snapshot) => {
        if (existingIds.has(snapshot.id)) return;
        const sourcePath = sanitizeText(snapshot.sourcePath || '');
        const resolvedEntry = sourcePath
            ? (entryByPath.get(sourcePath) || entryByPath.get(sourcePath.toLowerCase()) || null)
            : null;
        const restoredTrack = buildRestoredDesktopLocalTrack(snapshot, resolvedEntry || {});
        if (!restoredTrack) {
            missingCount += 1;
            return;
        }
        restoredTracks.push(restoredTrack);
        existingIds.add(restoredTrack.id);
    });
    return { restoredTracks, missingCount };
}

function getLocalTrackRecoveryKey(track = null) {
    const trackId = sanitizeText(track?.id || '');
    if (trackId) return `track:${trackId}`;
    const sourcePath = sanitizeText(track?.sourcePath || '');
    if (sourcePath) return `path:${sourcePath.toLowerCase()}`;
    const fingerprint = sanitizeText(track?.fingerprint || '');
    if (fingerprint) return `fp:${fingerprint}`;
    return 'unknown';
}

function extractSourcePathFromMediaUrl(mediaUrl = '') {
    const raw = sanitizeText(mediaUrl || '');
    if (!raw || raw.includes('blob:')) return '';
    try {
        const parsed = new URL(raw, window.location.origin);
        if (parsed.pathname !== EXTERNAL_MEDIA_ROUTE) return '';
        return sanitizeText(parsed.searchParams.get('path') || '');
    } catch (_) {
        const queryIndex = raw.indexOf('?');
        if (queryIndex < 0) return '';
        const query = raw.slice(queryIndex + 1);
        const parts = query.split('&');
        for (const part of parts) {
            const [key, value] = part.split('=');
            if ((key || '').trim() !== 'path') continue;
            try {
                return sanitizeText(decodeURIComponent(value || ''));
            } catch (_) {
                return sanitizeText(value || '');
            }
        }
        return '';
    }
}

async function tryRecoverLocalTrackMediaSource(track = null) {
    const result = { recovered: false, missing: false };
    if (!track || sanitizeText(track.source || '') !== 'local') return result;
    if (!isDesktopRuntimeAvailable() || !nexPlayDesktopBridge || typeof nexPlayDesktopBridge.resolveLocalMediaPaths !== 'function') {
        return result;
    }

    const metadataSourcePath = sanitizeText(state.metadataStore?.[sanitizeText(track.fingerprint || '')]?.sourcePath || '');
    const sourcePath = sanitizeText(track.sourcePath || metadataSourcePath || extractSourcePathFromMediaUrl(track.url || ''));
    if (!sourcePath) return result;
    if (!sanitizeText(track.sourcePath || '')) {
        track.sourcePath = sourcePath;
    }

    const recoveryKey = getLocalTrackRecoveryKey(track);
    const now = Date.now();
    const previous = localTrackMediaRecoveryAttempts.get(recoveryKey) || { count: 0, at: 0 };
    if (previous.count >= 3 && now - previous.at < 30000) {
        return result;
    }
    localTrackMediaRecoveryAttempts.set(recoveryKey, {
        count: previous.count + 1,
        at: now
    });

    let resolution = null;
    try {
        resolution = await nexPlayDesktopBridge.resolveLocalMediaPaths({
            snapshots: [{
                sourcePath,
                sourceFingerprint: sanitizeText(track.sourceFingerprint || track.fingerprint || '')
            }]
        });
    } catch (error) {
        logError('local-track-path-resolve-failed', 'Local track path resolution failed during media recovery', {
            trackId: sanitizeText(track.id || ''),
            sourcePath,
            error: sanitizeText(error?.message || '')
        });
        return result;
    }

    const resolvedEntries = Array.isArray(resolution?.entries) ? resolution.entries : [];
    const missingEntries = Array.isArray(resolution?.missing) ? resolution.missing : [];
    const sourcePathKey = sourcePath.toLowerCase();
    const resolvedEntry = resolvedEntries.find((entry) => (
        sanitizeText(entry?.path || '').toLowerCase() === sourcePathKey
    )) || resolvedEntries[0] || null;
    const nextUrl = sanitizeText(resolvedEntry?.mediaUrl || '');

    if (!nextUrl) {
        result.missing = missingEntries.some((entry) => (
            sanitizeText(entry?.sourcePath || '').toLowerCase() === sourcePathKey
            && sanitizeText(entry?.reason || '') === 'missing'
        ));
        return result;
    }

    track.url = nextUrl;
    track.sourcePath = sanitizeText(resolvedEntry?.path || track.sourcePath || '');
    const resolvedName = sanitizeText(resolvedEntry?.name || '');
    if (resolvedName) track.fileName = resolvedName;
    if (Number.isFinite(Number(resolvedEntry?.size))) {
        track.size = Math.max(0, Number(resolvedEntry.size) || 0);
    }
    if (Number.isFinite(Number(resolvedEntry?.lastModified))) {
        track.lastModified = Math.max(0, Number(resolvedEntry.lastModified) || 0);
    }
    if (resolvedEntry?.type === 'video' || resolvedEntry?.type === 'audio') {
        track.type = resolvedEntry.type;
    }
    track.persistedLocally = true;

    persistTrackMetadata(track);
    if (isPersistableLocalTrack(track)) persistLocalLibraryIndex();

    if (!els.audio || sanitizeText(state.currentTrackId || '') !== sanitizeText(track.id || '')) {
        return result;
    }

    els.audio.src = nextUrl;
    armSourceLoadTimeout(track.id, 10000);
    const started = await safePlayMedia(els.audio, { waitForReady: true, timeoutMs: 8000, force: true });
    if (!started) return result;

    logRecovery('local-track-media-recovered', 'Recovered local track playback source after media error', {
        trackId: sanitizeText(track.id || ''),
        sourcePath: sanitizeText(track.sourcePath || '')
    });
    updateTrackUI(track);
    applyNowPlayingMetadata(track);
    localTrackMediaRecoveryAttempts.delete(recoveryKey);
    result.recovered = true;
    return result;
}

async function persistImportedLocalFiles(entries = []) {
    const persistableEntries = (Array.isArray(entries) ? entries : []).filter((entry) => (
        entry
        && isPersistableLocalTrack(entry.track)
        && entry.file instanceof Blob
    ));
    if (!persistableEntries.length) {
        persistLocalLibraryIndex();
        return 0;
    }
    const db = await openLocalLibraryDb();
    if (!db) {
        persistableEntries.forEach((entry) => {
            if (entry?.track) entry.track.persistedLocally = false;
        });
        persistLocalLibraryIndex();
        announceLocalLibraryPersistenceWarning('Browser storage is unavailable. Imported files will only last until this tab closes or reloads.');
        return 0;
    }
    let storedCount = 0;
    for (const entry of persistableEntries) {
        const ok = await putPersistedLocalMediaBlob(entry.track, entry.file);
        entry.track.persistedLocally = ok;
        if (ok) storedCount += 1;
    }
    persistLocalLibraryIndex();
    if (storedCount !== persistableEntries.length) {
        announceLocalLibraryPersistenceWarning('Some imported files could not be saved for reload. Re-import them if they disappear after refresh.');
    }
    return storedCount;
}

async function hydratePersistedLocalLibraryIntoState() {
    if (localLibraryRestorePromise) return localLibraryRestorePromise;
    localLibraryRestorePromise = (async () => {
        const indexState = await loadPersistedLocalLibraryIndex({ includeState: true });
        const snapshots = Array.isArray(indexState?.snapshots) ? indexState.snapshots : [];
        if (!snapshots.length) {
            const orphanedBlobCount = await cleanupOrphanedBrowserLocalMediaAfterHydration([], {
                authoritative: indexState?.authoritative === true
            });
            return { restoredCount: 0, missingCount: 0, unsupported: false, orphanedBlobCount };
        }
        const existingIds = new Set((state.tracks || []).map((track) => sanitizeText(track?.id || '')).filter(Boolean));
        const restoredTracks = [];
        let missingCount = 0;
        let unsupported = false;

        const desktopResult = await restoreDesktopLocalLibraryTracks(snapshots, existingIds).catch((error) => {
            console.warn('Failed to resolve desktop local media paths', error);
            return { restoredTracks: [], missingCount: 0 };
        });
        if (desktopResult?.restoredTracks?.length) {
            restoredTracks.push(...desktopResult.restoredTracks);
        }
        missingCount += Number(desktopResult?.missingCount) || 0;

        const browserSnapshots = snapshots.filter((snapshot) => !sanitizeText(snapshot?.sourcePath || ''));
        if (browserSnapshots.length) {
            const db = await openLocalLibraryDb();
            if (!db) {
                missingCount += browserSnapshots.length;
                unsupported = true;
            } else {
                for (const snapshot of browserSnapshots) {
                    if (existingIds.has(snapshot.id)) continue;
                    const storedEntry = await readPersistedLocalMediaBlob(snapshot.fingerprint);
                    const restoredTrack = buildRestoredLocalTrack(snapshot, storedEntry);
                    if (!restoredTrack) {
                        missingCount += 1;
                        continue;
                    }
                    restoredTracks.push(restoredTrack);
                    existingIds.add(restoredTrack.id);
                }
            }
        }
        if (restoredTracks.length) {
            state.tracks.push(...restoredTracks);
            persistLocalLibraryIndex();
            renderTracks({ preserveScroll: true });
            updateLibraryStatsLabel();
            refreshLiveViews();
            if (!state.currentTrackId) {
                const startupTrack = state.tracks.find((track) => track && track.source !== 'online-music');
                if (startupTrack) loadTrack(startupTrack.id, false);
            }
        }
        if (missingCount) {
            announceLocalLibraryPersistenceWarning('Some imported files could not be restored. They may have been moved, deleted, or blocked by storage limits.');
        } else if (unsupported) {
            announceLocalLibraryPersistenceWarning('Browser storage is unavailable. Previously imported files could not be restored in this session.');
        }
        const orphanedBlobCount = await cleanupOrphanedBrowserLocalMediaAfterHydration(snapshots, {
            authoritative: indexState?.authoritative === true
        });
        return { restoredCount: restoredTracks.length, missingCount, unsupported, orphanedBlobCount };
    })();
    return localLibraryRestorePromise;
}

function getCachedElement(id) {
    if (!id) return null;
    const cached = domRefCache[id];
    if (cached && cached.isConnected) return cached;
    const fresh = document.getElementById(id);
    if (fresh) domRefCache[id] = fresh;
    return fresh || null;
}

function setTextContentIfChanged(el, nextValue) {
    if (!el) return;
    const value = String(nextValue ?? '');
    if (el.textContent !== value) el.textContent = value;
}

function setHtmlIfChanged(el, nextValue) {
    if (!el) return;
    const value = String(nextValue ?? '');
    if (el.innerHTML !== value) el.innerHTML = value;
}

function toLucideIconKey(iconName = '') {
    return String(iconName || '')
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function replaceLucideIcon(target, iconName) {
    if (!target) return null;
    const key = toLucideIconKey(iconName);
    const iconDef = window.lucide?.icons?.[key];
    const create = window.lucide?.createElement;
    if (!iconDef || typeof create !== 'function') {
        target.setAttribute('data-lucide', iconName);
        return target;
    }
    const svg = create(iconDef, {
        class: target.getAttribute('class') || '',
        stroke: target.getAttribute('stroke') || 'currentColor',
        'stroke-width': target.getAttribute('stroke-width') || '2',
        'stroke-linecap': target.getAttribute('stroke-linecap') || 'round',
        'stroke-linejoin': target.getAttribute('stroke-linejoin') || 'round'
    });
    if (!svg) return target;
    Array.from(target.attributes || []).forEach((attr) => {
        if (!svg.hasAttribute(attr.name) && attr.name !== 'data-lucide' && attr.name !== 'class') {
            svg.setAttribute(attr.name, attr.value);
        }
    });
    if (target.id) svg.id = target.id;
    target.replaceWith(svg);
    return svg;
}

function getAppSettings() {
    state.appSettings = sanitizeAppSettings(state.appSettings);
    return state.appSettings;
}

function getSystemPrefersDarkMode() {
    try {
        return !!window.matchMedia && !!window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {
        return true;
    }
}

function getResolvedThemeIsDark(themeMode = null) {
    const mode = themeMode || getAppSettings().appearance.themeMode;
    if (mode === 'system') return getSystemPrefersDarkMode();
    return mode !== 'light';
}

function bindSystemThemeListener() {
    if (!window.matchMedia || window.__nexplayThemeListenerBound) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onThemeChange = () => {
        if ((getAppSettings().appearance.themeMode || 'dark') !== 'system') return;
        applyThemePreference('system');
    };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onThemeChange);
    else if (typeof media.addListener === 'function') media.addListener(onThemeChange);
    window.__nexplayThemeListenerBound = true;
}

function applyThemePreference(themeMode = null) {
    const mode = themeMode || getAppSettings().appearance.themeMode;
    const isDark = getResolvedThemeIsDark(mode);
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);
    document.body.classList.toggle('theme-dark', isDark);
    state.isDarkMode = isDark;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.setAttribute('content', isDark ? (state.accentColor || '#06b6d4') : '#e2e8f0');
}

function enforceHistoryRetentionLimit() {
    const limit = clampNumber(getAppSettings().resume.historyLimit, 5, 250, 50);
    if (!Array.isArray(state.playHistory)) state.playHistory = [];
    if (state.playHistory.length > limit) state.playHistory = state.playHistory.slice(0, limit);
}

function applyAppearanceSettings(options = {}) {
    const opts = { syncViewMode: false, ...options };
    const prefs = getAppSettings();
    applyThemePreference(prefs.appearance.themeMode);
    document.body.dataset.density = prefs.appearance.density || 'cozy';
    document.body.classList.toggle('reduce-motion', !!prefs.appearance.reducedMotion);
    document.documentElement.style.setProperty('--sidebar-width', `${prefs.appearance.sidebarWidth}px`);
    document.documentElement.style.setProperty('--visualizer-intensity', String(prefs.appearance.visualizerIntensity));
    if (els.sidebar) {
        els.sidebar.style.width = `${prefs.appearance.sidebarWidth}px`;
        els.sidebar.style.maxWidth = 'calc(100vw - 1rem)';
        els.sidebar.style.flex = `0 0 ${prefs.appearance.sidebarWidth}px`;
    }
    if (opts.syncViewMode && ['list', 'grid'].includes(prefs.appearance.defaultViewMode)) {
        state.viewMode = prefs.appearance.defaultViewMode;
    }
    syncViewModeButtons();
}

function applyAppSettings(options = {}) {
    const opts = { persist: false, syncViewMode: false, ...options };
    state.appSettings = sanitizeAppSettings(state.appSettings);
    syncConfiguredOnlineMusicApiKey();
    applyAppearanceSettings({ syncViewMode: opts.syncViewMode });
    syncPrivateSessionModeUi();
    applyVideoSettingsRuntime();
    enforceHistoryRetentionLimit();
    if (opts.persist) persistAppStateNow();
}

function normalizeAppRoute(route = '') {
    return sanitizeText(route || '').toLowerCase() === 'private-session' ? 'private-session' : 'app';
}

function getAppRouteFromHash(hash = '') {
    return normalizeAppRoute(String(hash || '').replace(/^#/, ''));
}

function clonePrivateSessionValue(value, fallback = null) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return fallback;
    }
}

function applyAppRoute(route = 'app', options = {}) {
    const opts = { quiet: false, preserveScroll: false, suppressRender: false, force: false, ...options };
    const nextRoute = normalizeAppRoute(route);
    const prevRoute = normalizeAppRoute(state.appRoute || 'app');
    if (prevRoute === nextRoute && !opts.force) {
        syncPrivateSessionModeUi();
        return false;
    }
    state.appRoute = nextRoute;
    if (nextRoute === 'private-session') {
        enterPrivateSession({ quiet: opts.quiet });
    } else if (prevRoute === 'private-session' || hasPrivateSessionRuntime()) {
        exitPrivateSession({ quiet: opts.quiet });
    }
    syncPrivateSessionModeUi();
    if (!opts.suppressRender) {
        renderNav();
        syncLibraryOnlineToggleButton();
        renderTracks({ preserveScroll: !!opts.preserveScroll });
    }
    return true;
}

function clearPrivateSessionRoute(options = {}) {
    const nextUrl = `${window.location.pathname}${window.location.search}`;
    if (window.location.hash) {
        window.history.replaceState(null, '', nextUrl);
    }
    return applyAppRoute('app', options);
}

function handlePrivateSessionRouteChange() {
    applyAppRoute(getAppRouteFromHash(window.location.hash || ''), {
        quiet: true,
        preserveScroll: true
    });
}

function normalizePrivateSessionOnlineView(value = '') {
    const raw = sanitizeText(value || '').toLowerCase();
    return ['search', 'artist', 'release'].includes(raw) ? raw : 'search';
}

function normalizePrivateSessionLoadStatus(value = '') {
    const raw = sanitizeText(value || '').toLowerCase();
    return ['idle', 'loading', 'ready', 'error'].includes(raw) ? raw : 'idle';
}

function sanitizePrivateSessionTrackRecord(raw = {}) {
    const built = buildPrivateSessionTrackRecord(raw);
    return {
        ...built,
        importedAt: Math.max(0, Number(raw?.importedAt || built.importedAt || 0)),
        privateSessionCollectionKey: sanitizeText(raw?.privateSessionCollectionKey || built.privateSessionCollectionKey || ''),
        privateSessionCollectionLabel: sanitizeText(raw?.privateSessionCollectionLabel || built.privateSessionCollectionLabel || ''),
        privateSessionPlaylistId: sanitizeText(raw?.privateSessionPlaylistId || built.privateSessionPlaylistId || ''),
        privateSessionOrigin: sanitizeText(raw?.privateSessionOrigin || built.privateSessionOrigin || '')
    };
}

function sanitizePrivateSessionPlaylistRecord(raw = {}) {
    const tracks = (Array.isArray(raw?.tracks) ? raw.tracks : []).map((track) => sanitizePrivateSessionTrackRecord(track)).filter(Boolean);
    return {
        id: sanitizeText(raw?.id || generateId()) || generateId(),
        title: sanitizeText(raw?.title || 'Playlist') || 'Playlist',
        sourcePlaylistId: sanitizeText(raw?.sourcePlaylistId || ''),
        trackCount: Math.max(0, Number(raw?.trackCount || tracks.length || 0)),
        importedAt: Math.max(0, Number(raw?.importedAt || 0)),
        tracks
    };
}

function sanitizePrivateSessionReleaseRecord(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const clean = clonePrivateSessionValue(raw, {}) || {};
    delete clean.promise;
    clean.playlistId = sanitizeText(clean.playlistId || clean.sourcePlaylistId || clean.id || '');
    clean.id = sanitizeText(clean.id || clean.playlistId || generateId());
    clean.title = sanitizeText(clean.title || clean.name || 'Release');
    clean.artist = sanitizeText(clean.artist || clean.channelTitle || '');
    clean.channelId = sanitizeText(clean.channelId || '');
    clean.channelTitle = sanitizeText(clean.channelTitle || clean.artist || '');
    clean.cover = sanitizeText(clean.cover || clean.thumbnail || '');
    clean.description = sanitizeText(clean.description || '');
    clean.provider = sanitizeText(clean.provider || '');
    clean.providerLabel = sanitizeText(clean.providerLabel || getOnlineMusicProviderLabel(clean.provider || ''));
    clean.catalogProvider = normalizeOnlineMusicProvider(clean.catalogProvider || clean.provider || '');
    clean.catalogProviderLabel = sanitizeText(clean.catalogProviderLabel || getOnlineMusicProviderLabel(clean.catalogProvider || ''));
    clean.transportProvider = normalizeOnlineMusicProvider(clean.transportProvider || 'youtube');
    clean.transportProviderLabel = sanitizeText(clean.transportProviderLabel || getOnlineMusicProviderLabel(clean.transportProvider || 'youtube'));
    clean.releaseBucket = sanitizeText(clean.releaseBucket || '');
    clean.releaseType = sanitizeText(clean.releaseType || '');
    clean.releaseSubtypes = Array.isArray(clean.releaseSubtypes)
        ? clean.releaseSubtypes.map((type) => sanitizeText(type || '')).filter(Boolean)
        : [];
    clean.trackCount = Math.max(0, Number(clean.trackCount || clean.declaredTrackCount || 0) || 0);
    clean.declaredTrackCount = Math.max(0, Number(clean.declaredTrackCount || clean.trackCount || 0) || 0);
    clean.missingTrackCount = Math.max(0, Number(clean.missingTrackCount || 0) || 0);
    clean.tracks = (Array.isArray(raw.tracks) ? raw.tracks : []).map((track) => sanitizePrivateSessionTrackRecord({
        ...track,
        privateSessionOrigin: sanitizeText(track?.privateSessionOrigin || 'release'),
        privateSessionCollectionKey: sanitizeText(track?.privateSessionCollectionKey || 'release'),
        privateSessionCollectionLabel: clean.title
    })).filter(Boolean);
    return clean.playlistId || clean.title || clean.tracks.length ? clean : null;
}

function sanitizePrivateSessionArtistCatalog(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const clean = clonePrivateSessionValue(raw, {}) || {};
    delete clean.promise;
    clean.channelId = sanitizeText(clean.channelId || '');
    clean.title = sanitizeText(clean.title || clean.artist || clean.channelTitle || 'Artist');
    clean.description = sanitizeText(clean.description || '');
    clean.cover = sanitizeText(clean.cover || clean.thumbnail || '');
    clean.uploadsPlaylistId = sanitizeText(clean.uploadsPlaylistId || '');
    clean.catalogSources = Array.isArray(clean.catalogSources)
        ? clean.catalogSources.map((source) => sanitizeText(source || '')).filter(Boolean)
        : [];
    clean.schemaVersion = Number(clean.schemaVersion || 0) || 0;
    clean.albums = (Array.isArray(raw.albums) ? raw.albums : []).map((release) => sanitizePrivateSessionReleaseRecord(release)).filter(Boolean);
    clean.singlesEps = (Array.isArray(raw.singlesEps) ? raw.singlesEps : []).map((release) => sanitizePrivateSessionReleaseRecord(release)).filter(Boolean);
    clean.otherReleases = (Array.isArray(raw.otherReleases) ? raw.otherReleases : []).map((release) => sanitizePrivateSessionReleaseRecord(release)).filter(Boolean);
    clean.allWork = (Array.isArray(raw.allWork) ? raw.allWork : []).map((track) => sanitizePrivateSessionTrackRecord({
        ...track,
        privateSessionOrigin: sanitizeText(track?.privateSessionOrigin || 'artist'),
        privateSessionCollectionKey: sanitizeText(track?.privateSessionCollectionKey || 'artist'),
        privateSessionCollectionLabel: clean.title
    })).filter(Boolean);
    return clean.channelId || clean.title || clean.allWork.length ? clean : null;
}

function getPrivateSessionState() {
    const base = createDefaultPrivateSessionState();
    const raw = state?.privateSession && typeof state.privateSession === 'object'
        ? state.privateSession
        : base;
    state.privateSession = {
        ...base,
        ...raw,
        active: !!raw.active,
        startedAt: Math.max(0, Number(raw.startedAt || 0)),
        feedback: sanitizeText(raw.feedback || base.feedback),
        feedbackTone: ['info', 'success', 'warn', 'error'].includes(raw.feedbackTone) ? raw.feedbackTone : base.feedbackTone,
        searchQuery: sanitizeText(raw.searchQuery || ''),
        playlistInput: sanitizeText(raw.playlistInput || ''),
        imports: (Array.isArray(raw.imports) ? raw.imports : []).map((track) => sanitizePrivateSessionTrackRecord(track)).filter(Boolean),
        searchResults: (Array.isArray(raw.searchResults) ? raw.searchResults : []).map((track) => sanitizePrivateSessionTrackRecord(track)).filter(Boolean),
        playlists: (Array.isArray(raw.playlists) ? raw.playlists : []).map((playlist) => sanitizePrivateSessionPlaylistRecord(playlist)).filter(Boolean),
        onlineView: normalizePrivateSessionOnlineView(raw.onlineView || base.onlineView),
        browserRequestId: Math.max(0, Number(raw.browserRequestId || 0) || 0),
        browserArtist: raw.browserArtist && typeof raw.browserArtist === 'object'
            ? sanitizePrivateSessionArtistCatalog(raw.browserArtist)
            : null,
        browserArtistStatus: normalizePrivateSessionLoadStatus(raw.browserArtistStatus || base.browserArtistStatus),
        browserArtistError: sanitizeText(raw.browserArtistError || ''),
        browserRelease: raw.browserRelease && typeof raw.browserRelease === 'object'
            ? sanitizePrivateSessionReleaseRecord(raw.browserRelease)
            : null,
        browserReleaseStatus: normalizePrivateSessionLoadStatus(raw.browserReleaseStatus || base.browserReleaseStatus),
        browserReleaseError: sanitizeText(raw.browserReleaseError || ''),
        artistWorkSortMode: normalizeOnlineMusicArtistWorkSortMode(raw.artistWorkSortMode || base.artistWorkSortMode),
        currentTrackId: sanitizeText(raw.currentTrackId || ''),
        currentCollectionKey: sanitizeText(raw.currentCollectionKey || base.currentCollectionKey) || base.currentCollectionKey,
        normalSessionSnapshot: raw.normalSessionSnapshot && typeof raw.normalSessionSnapshot === 'object'
            ? clonePrivateSessionValue(raw.normalSessionSnapshot, null)
            : null
    };
    return state.privateSession;
}

function hasPrivateSessionRuntime() {
    return !!getPrivateSessionState().active;
}

function isPrivateSessionRouteActive() {
    state.appRoute = normalizeAppRoute(state.appRoute || getAppRouteFromHash(window.location.hash || ''));
    return state.appRoute === 'private-session';
}

function isPrivateSessionActive() {
    return isPrivateSessionRouteActive() && hasPrivateSessionRuntime();
}

function isPrivateSessionTrackRecord(track = null) {
    return !!(track && typeof track === 'object' && track.privateSession);
}

function shouldBypassStorageWriteForPrivateSession() {
    return isPrivateSessionRouteActive() || hasPrivateSessionRuntime();
}

function shouldBypassPrivateSessionTrackPersistence(track = null) {
    return isPrivateSessionTrackRecord(track) || (shouldBypassStorageWriteForPrivateSession() && !!track);
}

function setPrivateSessionUiField(field = '', value = '') {
    const privateState = getPrivateSessionState();
    const safeField = sanitizeText(field || '');
    if (!['searchQuery', 'playlistInput'].includes(safeField)) return;
    privateState[safeField] = sanitizeText(value || '');
}

function setPrivateSessionFeedback(message = '', tone = 'info') {
    const safeTone = ['info', 'success', 'warn', 'error'].includes(tone) ? tone : 'info';
    const privateState = getPrivateSessionState();
    privateState.feedback = sanitizeText(message || privateState.feedback || '');
    privateState.feedbackTone = safeTone;
    const feedbackEl = document.getElementById('private-session-feedback');
    if (!feedbackEl) return;
    feedbackEl.textContent = privateState.feedback || 'Private mode ready.';
    feedbackEl.className = 'rounded-lg border px-4 py-3 text-xs md:text-sm';
    if (safeTone === 'success') {
        feedbackEl.classList.add('border-emerald-400/35', 'bg-emerald-500/12', 'text-emerald-100');
    } else if (safeTone === 'warn') {
        feedbackEl.classList.add('border-amber-400/35', 'bg-amber-500/12', 'text-amber-100');
    } else if (safeTone === 'error') {
        feedbackEl.classList.add('border-rose-400/35', 'bg-rose-500/12', 'text-rose-100');
    } else {
        feedbackEl.classList.add('border-rose-300/25', 'bg-rose-500/10', 'text-rose-50');
    }
}

function stopPrivateSessionClockTimer() {
    if (!privateSessionClockTimer) return;
    clearInterval(privateSessionClockTimer);
    privateSessionClockTimer = null;
}

function getPrivateSessionElapsedLabel() {
    const privateState = getPrivateSessionState();
    if (!privateState.active || !privateState.startedAt) return 'Session 00:00';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - privateState.startedAt) / 1000));
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    const label = hours > 0
        ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `Session ${label}`;
}

function syncPrivateSessionClock() {
    const clockLabel = getPrivateSessionElapsedLabel();
    const clockEl = document.getElementById('private-session-clock');
    if (clockEl) clockEl.textContent = clockLabel;
    const indicatorClock = document.getElementById('private-session-route-indicator-clock');
    if (indicatorClock) indicatorClock.textContent = clockLabel.replace(/^Session\s+/i, '');
}

function clearMediaSessionForPrivateSession() {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.metadata = null; } catch (_) {}
    try { navigator.mediaSession.playbackState = 'none'; } catch (_) {}
}

function restoreSharedMediaSessionAfterPrivateSession() {
    const track = getActivePlaybackTrack();
    if (track) {
        applyNowPlayingMetadata(track);
        updateMediaPositionState(true);
        return;
    }
    clearMediaSessionForPrivateSession();
}

function ensurePrivateSessionRouteIndicator() {
    let indicator = document.getElementById('private-session-route-indicator');
    if (indicator) return indicator;
    indicator = document.createElement('div');
    indicator.id = 'private-session-route-indicator';
    indicator.className = 'private-route-indicator fixed right-4 top-24 z-40 hidden rounded-lg px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white';
    indicator.innerHTML = `
        <div class="flex items-center gap-2">
            <i data-lucide="shield" class="h-4 w-4"></i>
            <span>Vault</span>
            <span class="rounded-full bg-black/20 px-2 py-1 text-[10px] text-white/85" id="private-session-route-indicator-clock">00:00</span>
        </div>
    `;
    document.body.appendChild(indicator);
    refreshLucideIcons();
    return indicator;
}

function syncPrivateSessionModeUi() {
    const active = isPrivateSessionActive();
    document.body.classList.toggle('private-route-active', active);
    const indicator = ensurePrivateSessionRouteIndicator();
    if (indicator) indicator.classList.toggle('hidden', !active);
    if (active) {
        syncPrivateSessionClock();
        if (!privateSessionClockTimer) {
            privateSessionClockTimer = setInterval(syncPrivateSessionClock, 1000);
        }
    } else {
        stopPrivateSessionClockTimer();
    }
}

function buildPrivateSessionNormalSessionSnapshot() {
    const online = getOnlineMusicState();
    return {
        currentTrackId: sanitizeText(state.currentTrackId || ''),
        currentTrack: clonePrivateSessionValue(state.currentTrack || null, null),
        currentPlaybackSource: sanitizeRuntimeSourceMode(state.currentPlaybackSource || 'local'),
        currentTime: state.currentPlaybackSource === 'online-music'
            ? Math.max(0, Number(online.currentTime || 0))
            : Math.max(0, Number(els.audio?.currentTime || 0)),
        audioQueueState: clonePrivateSessionValue(state.audioQueueState || {}, {}),
        videoQueueState: clonePrivateSessionValue(state.videoQueueState || {}, {}),
        queue: clonePrivateSessionValue(state.queue || [], []),
        queueSource: sanitizeText(state.queueSource || 'auto') || 'auto',
        isShuffle: !!state.isShuffle,
        repeatMode: isRepeatModeValid(state.repeatMode) ? state.repeatMode : 'none',
        shuffleQueue: clonePrivateSessionValue(state.shuffleQueue || [], []),
        shuffleIndex: Number.isFinite(Number(state.shuffleIndex)) ? Number(state.shuffleIndex) : -1,
        pendingShuffleSeed: sanitizeText(state.pendingShuffleSeed || ''),
        activeQueueType: activeQueueType === 'video' ? 'video' : 'audio',
        playHistory: clonePrivateSessionValue(state.playHistory || [], []),
        selectedTrackIds: clonePrivateSessionValue(state.selectedTrackIds || [], []),
        currentUrlVideoSource: clonePrivateSessionValue(state.currentUrlVideoSource || null, null),
        onlineMusic: clonePrivateSessionValue(getOnlineMusicState(), createDefaultOnlineMusicState())
    };
}

async function restoreNormalSessionRuntimeFromPrivateSession(snapshot = null) {
    if (!snapshot || typeof snapshot !== 'object') {
        restoreSharedMediaSessionAfterPrivateSession();
        return false;
    }
    stopOnlineMusicProgressTimer();
    clearOnlineMusicConnectTimeout();
    safePauseMedia(els.audio);
    try { onlineMusicPlayer?.pauseVideo?.(); } catch (_) {}
    state.audioQueueState = clonePrivateSessionValue(snapshot.audioQueueState || {}, state.audioQueueState) || state.audioQueueState;
    state.videoQueueState = clonePrivateSessionValue(snapshot.videoQueueState || {}, state.videoQueueState) || state.videoQueueState;
    state.queue = Array.isArray(snapshot.queue) ? snapshot.queue.slice() : [];
    state.queueSource = sanitizeText(snapshot.queueSource || 'auto') || 'auto';
    state.isShuffle = !!snapshot.isShuffle;
    state.repeatMode = isRepeatModeValid(snapshot.repeatMode) ? snapshot.repeatMode : 'none';
    state.shuffleQueue = Array.isArray(snapshot.shuffleQueue) ? snapshot.shuffleQueue.slice() : [];
    state.shuffleIndex = Number.isFinite(Number(snapshot.shuffleIndex)) ? Number(snapshot.shuffleIndex) : -1;
    state.pendingShuffleSeed = sanitizeText(snapshot.pendingShuffleSeed || '');
    state.playHistory = Array.isArray(snapshot.playHistory) ? snapshot.playHistory.slice() : state.playHistory;
    state.selectedTrackIds = Array.isArray(snapshot.selectedTrackIds) ? snapshot.selectedTrackIds.slice() : [];
    state.currentUrlVideoSource = clonePrivateSessionValue(snapshot.currentUrlVideoSource || null, null);
    state.currentPlaybackSource = sanitizeRuntimeSourceMode(snapshot.currentPlaybackSource || 'local');
    state.currentTrackId = sanitizeText(snapshot.currentTrackId || '');
    state.currentTrack = snapshot.currentTrack && typeof snapshot.currentTrack === 'object'
        ? clonePrivateSessionValue(snapshot.currentTrack, null)
        : null;
    state.onlineMusic = clonePrivateSessionValue(snapshot.onlineMusic, createDefaultOnlineMusicState()) || createDefaultOnlineMusicState();
    activeQueueType = snapshot.activeQueueType === 'video' ? 'video' : 'audio';
    loadQueueBucket(activeQueueType);
    normalizeRuntimeState({ syncQueueViews: true, allowStopWhenQueueEmpty: false });
    updateShuffleIcon();
    updateRepeatIcon();

    const restoredTrackId = sanitizeText(snapshot.currentTrackId || '');
    const restoredTrack = restoredTrackId
        ? (resolveQueueDisplayTrack(restoredTrackId) || snapshot.currentTrack || null)
        : null;
    if (!restoredTrack) {
        state.isPlaying = false;
        updatePlayIcons();
        refreshPlayingIndicators();
        renderTracks({ preserveScroll: true });
        restoreSharedMediaSessionAfterPrivateSession();
        return false;
    }
    if (snapshot.currentPlaybackSource === 'online-music' && isOnlineMusicTrackRecord(restoredTrack)) {
        await playOnlineMusicTrack(restoredTrack.id, {
            autoplay: false,
            startTime: Math.max(0, Number(snapshot.onlineMusic?.currentTime || snapshot.currentTime || 0)),
            playbackContext: normalizeOnlineMusicPlaybackContext(snapshot.onlineMusic?.playbackContext || 'library'),
            queueContextView: normalizeOnlineMusicPlaybackContext(snapshot.onlineMusic?.queueContextView || snapshot.onlineMusic?.playbackContext || 'library'),
            queueContextKey: sanitizeText(snapshot.onlineMusic?.queueContextKey || ''),
            queueMode: snapshot.onlineMusic?.queueMode === 'shuffle' ? 'shuffle' : 'ordered',
            trackSnapshot: restoredTrack
        });
    } else {
        loadTrack(restoredTrack.id, false, null);
        const targetTime = Math.max(0, Number(snapshot.currentTime || 0));
        if (targetTime > 0) {
            pendingResumeTime = targetTime;
            const ready = await waitForMediaReady(els.audio, 3500).catch(() => false);
            if (ready) safeSeekMedia(els.audio, targetTime);
        }
        safePauseMedia(els.audio);
        state.isPlaying = false;
        updatePlayIcons();
        refreshPlayingIndicators();
    }
    renderTracks({ preserveScroll: true });
    restoreSharedMediaSessionAfterPrivateSession();
    return true;
}

function clearPrivateSessionBlobUrls() {
    const privateState = getPrivateSessionState();
    const urls = new Set();
    (privateState.imports || []).forEach((track) => {
        const url = sanitizeText(track?.url || '');
        if (url.startsWith('blob:')) urls.add(url);
    });
    (privateState.playlists || []).forEach((playlist) => {
        (Array.isArray(playlist?.tracks) ? playlist.tracks : []).forEach((track) => {
            const url = sanitizeText(track?.url || '');
            if (url.startsWith('blob:')) urls.add(url);
        });
    });
    urls.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) {}
    });
}

function resetPrivateSessionState(options = {}) {
    const opts = { revokeUrls: true, ...options };
    if (opts.revokeUrls) clearPrivateSessionBlobUrls();
    state.privateSession = createDefaultPrivateSessionState();
}

function pauseSharedPlaybackForPrivateSession() {
    safePauseMedia(els.audio);
    try { onlineMusicPlayer?.pauseVideo?.(); } catch (_) {}
    state.isPlaying = false;
    updatePlayIcons();
    refreshPlayingIndicators();
}

function stopPrivateSessionPlaybackRuntime() {
    const currentTrack = getCurrentTrack();
    if (state.currentPlaybackSource === 'online-music' && isPrivateSessionTrackRecord(currentTrack)) {
        try { onlineMusicPlayer?.pauseVideo?.(); } catch (_) {}
        clearOnlineMusicConnectTimeout();
        stopOnlineMusicProgressTimer();
        const online = getOnlineMusicState();
        online.isPlaying = false;
        clearOnlineMusicConnectingAttempt({ force: true });
        online.currentTime = 0;
    } else if (isPrivateSessionTrackRecord(currentTrack)) {
        safePauseMedia(els.audio);
        try { els.audio.currentTime = 0; } catch (_) {}
    }
    if (isPrivateSessionTrackRecord(currentTrack)) {
        state.currentTrackId = '';
        state.currentTrack = null;
    }
    state.isPlaying = false;
    updatePlayIcons();
    refreshPlayingIndicators();
}

function enterPrivateSession(options = {}) {
    const opts = { quiet: false, ...options };
    const privateState = getPrivateSessionState();
    if (!privateState.active) {
        const normalSnapshot = buildPrivateSessionNormalSessionSnapshot();
        resetPrivateSessionState({ revokeUrls: true });
        const nextState = getPrivateSessionState();
        nextState.active = true;
        nextState.startedAt = Date.now();
        nextState.normalSessionSnapshot = normalSnapshot;
        nextState.currentCollectionKey = 'temporary';
        pauseSharedPlaybackForPrivateSession();
        clearMediaSessionForPrivateSession();
    }
    setPrivateSessionFeedback('Private mode is active. Songs, searches, and playlists stay in memory only.', 'info');
    syncPrivateSessionModeUi();
    if (!opts.quiet) {
        showToast('Private mode started. Nothing from this page is saved.', 'info');
    }
}

function exitPrivateSession(options = {}) {
    const opts = { quiet: false, restoreNormalSession: true, ...options };
    const privateState = getPrivateSessionState();
    const wasActive = !!privateState.active;
    const normalSnapshot = clonePrivateSessionValue(privateState.normalSessionSnapshot, null);
    if (wasActive) {
        stopPrivateSessionPlaybackRuntime();
        resetPrivateSessionState({ revokeUrls: true });
        if (opts.restoreNormalSession && normalSnapshot) {
            restoreNormalSessionRuntimeFromPrivateSession(normalSnapshot).catch(() => {
                restoreSharedMediaSessionAfterPrivateSession();
            });
        } else {
            restoreSharedMediaSessionAfterPrivateSession();
        }
        if (!opts.quiet) {
            showToast('Private mode ended. Temporary data was cleared.', 'info');
        }
    }
    syncPrivateSessionModeUi();
}

function openPrivateSessionFromSettings() {
    if (window.location.hash === '#private-session') {
        applyAppRoute('private-session', { quiet: false, preserveScroll: true, force: true });
        return;
    }
    window.location.hash = 'private-session';
}

function getPrivateSessionTrackKey(track = {}) {
    const canonical = sanitizeText(track?.canonicalUrl || '').toLowerCase();
    const fingerprint = sanitizeText(track?.fingerprint || '').toLowerCase();
    const onlineId = sanitizeText(track?.id || '').toLowerCase();
    const fallback = `${sanitizeText(track?.title || '').toLowerCase()}|${sanitizeText(track?.artist || '').toLowerCase()}|${sanitizeText(track?.fileName || '').toLowerCase()}`;
    return canonical || fingerprint || onlineId || fallback;
}

function buildPrivateSessionTrackRecord(raw = {}) {
    const explicitSource = sanitizeText(raw.source || '').toLowerCase();
    const explicitPrivateSource = sanitizeText(raw.privateSessionSource || '').toLowerCase();
    const rawUrl = sanitizeText(raw.url || raw.mediaUrl || '');
    const hasOnlineIdentity = !!(
        sanitizeText(raw.videoId || '')
        || sanitizeText(raw.provider || raw.catalogProvider || raw.transportProvider || '')
        || sanitizeText(raw.canonicalUrl || '').startsWith('http')
        || explicitSource === 'online-music'
        || explicitPrivateSource === 'online'
    );
    const hasLocalIdentity = !!(
        explicitSource === 'local'
        || explicitPrivateSource === 'local'
        || sanitizeText(raw.fileName || raw.name || '')
        || rawUrl.startsWith('blob:')
        || rawUrl.startsWith('file:')
        || rawUrl.startsWith('/__nexplay_media__')
        || rawUrl.includes('/__nexplay_media__')
    );
    const onlineSnapshot = (!hasLocalIdentity || hasOnlineIdentity)
        ? sanitizeStoredOnlineMusicTrack(raw || {})
        : null;
    const isOnlineTrack = !!onlineSnapshot && hasOnlineIdentity && explicitPrivateSource !== 'local';
    const sourceName = sanitizeText(raw.fileName || raw.name || raw.title || onlineSnapshot?.title || '');
    let title = sanitizeText(raw.title || onlineSnapshot?.title || sourceName.replace(/\.[^/.]+$/, '') || '');
    let artist = sanitizeText(raw.artist || raw.channelTitle || onlineSnapshot?.artist || onlineSnapshot?.channelTitle || '');
    if (title.includes('-')) {
        const split = title.split('-');
        if (!artist) artist = sanitizeText(split[0] || '');
        title = sanitizeText(split.slice(1).join('-') || title);
    }
    const fileName = sanitizeText(raw.fileName || raw.name || '');
    const localId = (() => {
        const rawId = sanitizeText(raw.id || '');
        if (rawId && (/^private[_:]/i.test(rawId) || raw.privateSession)) return rawId;
        return `private_local_${rawId || generateId()}`;
    })();
    const base = isOnlineTrack ? { ...onlineSnapshot } : {};
    return {
        ...base,
        id: isOnlineTrack ? sanitizeText(base.id || raw.id || generateId()) : localId,
        title: title || sanitizeText(raw.title || base.title || 'Untitled'),
        artist: artist || sanitizeText(base.artist || 'Unknown'),
        type: 'audio',
        source: isOnlineTrack ? 'online-music' : 'local',
        url: sanitizeText(raw.url || raw.mediaUrl || base.url || ''),
        canonicalUrl: sanitizeText(raw.canonicalUrl || base.canonicalUrl || ''),
        cover: sanitizeText(raw.cover || raw.thumbnail || base.cover || ''),
        fileName,
        duration: Math.max(0, Number(raw.duration || base.duration || 0) || 0),
        size: Math.max(0, Number(raw.size || base.size || 0)),
        lastModified: Math.max(0, Number(raw.lastModified || 0)),
        sourceLabel: sanitizeText(raw.sourceLabel || raw.providerLabel || base.providerLabel || (fileName ? 'Imported song' : 'Private track')),
        fingerprint: sanitizeText(raw.fingerprint || `${fileName}|${Math.max(0, Number(raw.size) || 0)}|${Math.max(0, Number(raw.lastModified) || 0)}|${sanitizeText(base.id || '')}`),
        importedAt: Math.max(0, Number(raw.importedAt || 0)) || Date.now(),
        privateSession: true,
        privateSessionSource: isOnlineTrack ? 'online' : 'local',
        privateSessionOrigin: sanitizeText(raw.privateSessionOrigin || ''),
        privateSessionCollectionKey: sanitizeText(raw.privateSessionCollectionKey || ''),
        privateSessionCollectionLabel: sanitizeText(raw.privateSessionCollectionLabel || ''),
        privateSessionPlaylistId: sanitizeText(raw.privateSessionPlaylistId || '')
    };
}

function findPrivateSessionTrackById(trackId = '', options = {}) {
    const opts = { includeSearchResults: true, ...options };
    const safeTrackId = sanitizeText(trackId || '');
    if (!safeTrackId) return null;
    const privateState = getPrivateSessionState();
    const importedTrack = privateState.imports.find((track) => sanitizeText(track?.id || '') === safeTrackId);
    if (importedTrack) return importedTrack;
    if (opts.includeSearchResults) {
        const searchTrack = privateState.searchResults.find((track) => sanitizeText(track?.id || '') === safeTrackId);
        if (searchTrack) return searchTrack;
    }
    for (const playlist of privateState.playlists || []) {
        const found = (Array.isArray(playlist?.tracks) ? playlist.tracks : []).find((track) => sanitizeText(track?.id || '') === safeTrackId);
        if (found) return found;
    }
    const releaseTrack = (Array.isArray(privateState.browserRelease?.tracks) ? privateState.browserRelease.tracks : [])
        .find((track) => sanitizeText(track?.id || '') === safeTrackId);
    if (releaseTrack) return releaseTrack;
    const artistTrack = (Array.isArray(privateState.browserArtist?.allWork) ? privateState.browserArtist.allWork : [])
        .find((track) => sanitizeText(track?.id || '') === safeTrackId);
    if (artistTrack) return artistTrack;
    return null;
}

function getPrivateSessionQueueContextKey(collectionKey = 'temporary') {
    const privateState = getPrivateSessionState();
    const sessionKey = privateState.startedAt ? String(privateState.startedAt) : 'session';
    return `private-session:${sanitizeText(collectionKey || 'temporary')}:${sessionKey}`;
}

function getPrivateSessionTemporaryListTracks() {
    const privateState = getPrivateSessionState();
    const seen = new Set();
    const list = [];
    (privateState.imports || []).forEach((track) => {
        const next = sanitizePrivateSessionTrackRecord({
            ...track,
            privateSessionOrigin: 'import',
            privateSessionCollectionKey: 'temporary'
        });
        const key = getPrivateSessionTrackKey(next);
        if (!key || seen.has(key)) return;
        seen.add(key);
        list.push(next);
    });
    (privateState.playlists || []).forEach((playlist) => {
        (Array.isArray(playlist?.tracks) ? playlist.tracks : []).forEach((track) => {
            const next = sanitizePrivateSessionTrackRecord({
                ...track,
                privateSessionOrigin: 'playlist',
                privateSessionCollectionKey: 'temporary',
                privateSessionCollectionLabel: playlist.title,
                privateSessionPlaylistId: playlist.id
            });
            const key = getPrivateSessionTrackKey(next);
            if (!key || seen.has(key)) return;
            seen.add(key);
            list.push(next);
        });
    });
    return list;
}

function getPrivateSessionCollectionTracks(collectionKey = 'temporary') {
    const privateState = getPrivateSessionState();
    const safeKey = sanitizeText(collectionKey || 'temporary') || 'temporary';
    if (safeKey === 'search') {
        return (privateState.searchResults || []).map((track) => sanitizePrivateSessionTrackRecord({
            ...track,
            privateSessionOrigin: 'search',
            privateSessionCollectionKey: 'search'
        }));
    }
    if (safeKey.startsWith('playlist:')) {
        const playlistId = safeKey.split(':').slice(1).join(':');
        const playlist = (privateState.playlists || []).find((entry) => sanitizeText(entry?.id || '') === sanitizeText(playlistId || ''));
        return (Array.isArray(playlist?.tracks) ? playlist.tracks : []).map((track) => sanitizePrivateSessionTrackRecord({
            ...track,
            privateSessionOrigin: 'playlist',
            privateSessionCollectionKey: safeKey,
            privateSessionCollectionLabel: sanitizeText(playlist?.title || ''),
            privateSessionPlaylistId: sanitizeText(playlist?.id || '')
        }));
    }
    if (safeKey === 'artist') {
        return (Array.isArray(privateState.browserArtist?.allWork) ? privateState.browserArtist.allWork : []).map((track) => sanitizePrivateSessionTrackRecord({
            ...track,
            privateSessionOrigin: 'artist',
            privateSessionCollectionKey: 'artist',
            privateSessionCollectionLabel: sanitizeText(privateState.browserArtist?.title || '')
        }));
    }
    if (safeKey === 'release') {
        return (Array.isArray(privateState.browserRelease?.tracks) ? privateState.browserRelease.tracks : []).map((track) => sanitizePrivateSessionTrackRecord({
            ...track,
            privateSessionOrigin: 'release',
            privateSessionCollectionKey: 'release',
            privateSessionCollectionLabel: sanitizeText(privateState.browserRelease?.title || '')
        }));
    }
    return getPrivateSessionTemporaryListTracks();
}

function addPrivateSessionImportedTracks(tracks = []) {
    const privateState = getPrivateSessionState();
    const existing = new Set((privateState.imports || []).map((track) => getPrivateSessionTrackKey(track)).filter(Boolean));
    let inserted = 0;
    (Array.isArray(tracks) ? tracks : []).forEach((rawTrack) => {
        const track = sanitizePrivateSessionTrackRecord({
            ...rawTrack,
            privateSessionOrigin: 'import',
            privateSessionCollectionKey: 'temporary'
        });
        const key = getPrivateSessionTrackKey(track);
        if (!key || existing.has(key)) return;
        existing.add(key);
        privateState.imports.push(track);
        inserted += 1;
    });
    return inserted;
}

function readPrivateSessionSynchsafeInteger(bytes, offset = 0) {
    return ((bytes[offset] & 0x7f) << 21)
        | ((bytes[offset + 1] & 0x7f) << 14)
        | ((bytes[offset + 2] & 0x7f) << 7)
        | (bytes[offset + 3] & 0x7f);
}

function decodePrivateSessionLatin1(bytes) {
    let out = '';
    for (let index = 0; index < bytes.length; index += 1) {
        out += String.fromCharCode(bytes[index]);
    }
    return out;
}

function detectPrivateSessionImageMime(bytes, fallback = 'image/jpeg') {
    if (!bytes || bytes.length < 12) return fallback;
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
    }
    return fallback || 'image/jpeg';
}

function bytesToPrivateSessionDataUrl(bytes, mime = 'image/jpeg') {
    if (!bytes || !bytes.length) return '';
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${mime};base64,${btoa(binary)}`;
}

function extractPrivateSessionApicFrameDataUrl(frameBytes) {
    if (!frameBytes || frameBytes.length < 8) return '';
    let offset = 0;
    const encoding = frameBytes[offset] || 0;
    offset += 1;
    const mimeEnd = frameBytes.indexOf(0, offset);
    if (mimeEnd <= offset) return '';
    let mime = decodePrivateSessionLatin1(frameBytes.subarray(offset, mimeEnd)).toLowerCase();
    offset = mimeEnd + 1;
    offset += 1; // picture type
    if (encoding === 1 || encoding === 2) {
        while (offset + 1 < frameBytes.length) {
            if (frameBytes[offset] === 0 && frameBytes[offset + 1] === 0) {
                offset += 2;
                break;
            }
            offset += 2;
        }
    } else {
        const descriptionEnd = frameBytes.indexOf(0, offset);
        offset = descriptionEnd >= 0 ? descriptionEnd + 1 : offset;
    }
    const imageBytes = frameBytes.subarray(offset);
    if (!imageBytes.length) return '';
    if (!mime || mime === '-->' || !mime.startsWith('image/')) {
        mime = detectPrivateSessionImageMime(imageBytes, 'image/jpeg');
    }
    return bytesToPrivateSessionDataUrl(imageBytes, mime);
}

function extractPrivateSessionEmbeddedCoverDataUrl(buffer) {
    const bytes = new Uint8Array(buffer || []);
    if (bytes.length < 20) return '';
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return '';
    const version = bytes[3] || 3;
    const tagSize = readPrivateSessionSynchsafeInteger(bytes, 6);
    const tagEnd = Math.min(bytes.length, tagSize + 10);
    let offset = 10;
    while (offset + 10 <= tagEnd) {
        const frameId = decodePrivateSessionLatin1(bytes.subarray(offset, offset + 4));
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
        const frameSize = version === 4
            ? readPrivateSessionSynchsafeInteger(bytes, offset + 4)
            : ((bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7]);
        if (!Number.isFinite(frameSize) || frameSize <= 0) break;
        const frameStart = offset + 10;
        const frameEnd = Math.min(frameStart + frameSize, tagEnd);
        if (frameId === 'APIC') {
            const cover = extractPrivateSessionApicFrameDataUrl(bytes.subarray(frameStart, frameEnd));
            if (cover) return cover;
        }
        offset = frameEnd;
    }
    return '';
}

async function extractPrivateSessionEmbeddedCoverFromFile(file = null) {
    if (!file || typeof file.slice !== 'function' || typeof file.arrayBuffer !== 'function') return '';
    try {
        const headerBuffer = await file.slice(0, 10).arrayBuffer();
        const header = new Uint8Array(headerBuffer);
        if (header.length < 10 || header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return '';
        const tagSize = readPrivateSessionSynchsafeInteger(header, 6);
        const readSize = Math.min(Number(file.size || 0), Math.max(10, tagSize + 10), 16 * 1024 * 1024);
        if (readSize <= 10) return '';
        const tagBuffer = await file.slice(0, readSize).arrayBuffer();
        return extractPrivateSessionEmbeddedCoverDataUrl(tagBuffer);
    } catch (_) {
        return '';
    }
}

async function extractPrivateSessionEmbeddedCoverFromUrl(url = '', size = 0) {
    const safeUrl = sanitizeText(url || '');
    if (!safeUrl || Number(size || 0) > 36 * 1024 * 1024) return '';
    try {
        const response = await fetch(safeUrl, { cache: 'no-store' });
        if (!response.ok) return '';
        const buffer = await response.arrayBuffer();
        return extractPrivateSessionEmbeddedCoverDataUrl(buffer);
    } catch (_) {
        return '';
    }
}

function updatePrivateSessionTrackReferences(trackId = '', patch = {}) {
    const safeTrackId = sanitizeText(trackId || '');
    if (!safeTrackId || !patch || typeof patch !== 'object') return null;
    const privateState = getPrivateSessionState();
    let updatedTrack = null;
    const applyPatch = (track = null) => {
        if (!track || sanitizeText(track.id || '') !== safeTrackId) return track;
        updatedTrack = sanitizePrivateSessionTrackRecord({ ...track, ...patch });
        return updatedTrack;
    };
    privateState.imports = (privateState.imports || []).map(applyPatch);
    privateState.searchResults = (privateState.searchResults || []).map(applyPatch);
    privateState.playlists = (privateState.playlists || []).map((playlist) => ({
        ...playlist,
        tracks: (Array.isArray(playlist?.tracks) ? playlist.tracks : []).map(applyPatch)
    }));
    if (privateState.browserRelease?.tracks) {
        privateState.browserRelease = {
            ...privateState.browserRelease,
            tracks: (privateState.browserRelease.tracks || []).map(applyPatch)
        };
    }
    if (privateState.browserArtist?.allWork) {
        privateState.browserArtist = {
            ...privateState.browserArtist,
            allWork: (privateState.browserArtist.allWork || []).map(applyPatch)
        };
    }
    if (state.currentTrackId === safeTrackId && isPrivateSessionTrackRecord(state.currentTrack)) {
        state.currentTrack = sanitizePrivateSessionTrackRecord({ ...state.currentTrack, ...patch });
        updatedTrack = state.currentTrack;
        applyNowPlayingMetadata(state.currentTrack);
    }
    const bucket = getUnifiedAudioQueueState();
    if ((bucket.entries || []).some((entry) => sanitizeText(entry?.trackId || '') === safeTrackId)) {
        commitUnifiedAudioQueue({
            ...bucket,
            entries: (bucket.entries || []).map((entry) => {
                if (sanitizeText(entry?.trackId || '') !== safeTrackId) return entry;
                const nextSnapshot = entry.trackSnapshot && typeof entry.trackSnapshot === 'object'
                    ? sanitizePrivateSessionTrackRecord({ ...entry.trackSnapshot, ...patch })
                    : entry.trackSnapshot;
                return {
                    ...entry,
                    title: sanitizeText(patch.title || entry.title || ''),
                    artist: sanitizeText(patch.artist || entry.artist || ''),
                    cover: sanitizeText(patch.cover || entry.cover || ''),
                    trackSnapshot: nextSnapshot
                };
            })
        }, { refresh: false });
    }
    if (updatedTrack) {
        updateTrackUI(updatedTrack);
    }
    renderPrivateSessionCollections();
    return updatedTrack || findPrivateSessionTrackById(safeTrackId, { includeSearchResults: true });
}

async function enrichPrivateSessionImportedTracks(items = []) {
    const queue = Array.isArray(items) ? items.slice() : [];
    for (const item of queue) {
        const seedTrack = item?.track || item;
        const safeTrackId = sanitizeText(seedTrack?.id || '');
        if (!safeTrackId) continue;
        const target = findPrivateSessionTrackById(safeTrackId, { includeSearchResults: true });
        if (!target || isOnlineMusicTrackRecord(target)) continue;
        const patch = {};
        const durationPromise = !(Number(target.duration) > 0)
            ? fetchTrackDuration(target).catch(() => 0)
            : Promise.resolve(Number(target.duration) || 0);
        if (!(Number(target.duration) > 0)) {
            durationPromise.then((duration) => {
                if (Number(duration) > 0) {
                    updatePrivateSessionTrackReferences(safeTrackId, { duration: Number(duration) || 0 });
                }
            }).catch(() => {});
        }
        if (Number(target.duration) > 0) {
            if (Number(target.duration) > 0) patch.duration = Number(target.duration) || 0;
        }
        if (!target.cover) {
            let cover = '';
            if (item?.file) {
                cover = await extractPrivateSessionEmbeddedCoverFromFile(item.file);
            }
            if (!cover && item?.entry?.mediaUrl) {
                cover = await extractPrivateSessionEmbeddedCoverFromUrl(item.entry.mediaUrl, Number(item.entry.size || target.size || 0));
            }
            const cacheKey = `${(target.artist || '').toLowerCase()}|${(target.title || '').toLowerCase()}`;
            if (!cover && state.coverCache[cacheKey]) cover = state.coverCache[cacheKey];
            if (!cover) cover = await fetchDeezer(target);
            if (!cover) cover = await fetchItunes(target);
            if (cover) {
                patch.cover = cover;
                if (!/^data:/i.test(cover)) state.coverCache[cacheKey] = cover;
            }
        }
        if (Object.keys(patch).length) {
            updatePrivateSessionTrackReferences(safeTrackId, patch);
        }
    }
}

function removePrivateSessionImportedTrack(trackId = '') {
    const safeId = sanitizeText(trackId || '');
    if (!safeId) return;
    const privateState = getPrivateSessionState();
    const target = privateState.imports.find((track) => sanitizeText(track?.id || '') === safeId);
    const targetUrl = sanitizeText(target?.url || '');
    if (targetUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(targetUrl); } catch (_) {}
    }
    if (sanitizeText(privateState.currentTrackId || '') === safeId) {
        stopPrivateSessionPlaybackRuntime();
        privateState.currentTrackId = '';
    }
    privateState.imports = privateState.imports.filter((track) => sanitizeText(track?.id || '') !== safeId);
    renderPrivateSessionCollections();
}

function removePrivateSessionPlaylist(playlistId = '') {
    const safeId = sanitizeText(playlistId || '');
    if (!safeId) return;
    const privateState = getPrivateSessionState();
    const targetPlaylist = privateState.playlists.find((playlist) => sanitizeText(playlist?.id || '') === safeId);
    const activeTrackId = sanitizeText(privateState.currentTrackId || '');
    if (activeTrackId && (Array.isArray(targetPlaylist?.tracks) ? targetPlaylist.tracks : []).some((track) => sanitizeText(track?.id || '') === activeTrackId)) {
        stopPrivateSessionPlaybackRuntime();
        privateState.currentTrackId = '';
    }
    (Array.isArray(targetPlaylist?.tracks) ? targetPlaylist.tracks : []).forEach((track) => {
        const trackUrl = sanitizeText(track?.url || '');
        if (trackUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(trackUrl); } catch (_) {}
        }
    });
    privateState.playlists = privateState.playlists.filter((playlist) => sanitizeText(playlist?.id || '') !== safeId);
    renderPrivateSessionCollections();
}

function handlePrivateSessionFiles(fileList) {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const files = Array.from(fileList || []);
    const importable = files.filter((file) => isAudioFile(file));
    if (!importable.length) {
        setPrivateSessionFeedback('Private mode currently supports songs only. Select audio files to continue.', 'warn');
        renderPrivateSessionCollections();
        return;
    }
    const pendingImports = importable.map((file) => ({
        file,
        track: sanitizePrivateSessionTrackRecord({
            id: `private_local_${generateId()}`,
            fileName: sanitizeText(file.name || ''),
            title: sanitizeText(file.name || '').replace(/\.[^/.]+$/, ''),
            size: file.size,
            lastModified: file.lastModified,
            url: URL.createObjectURL(file),
            source: 'local',
            sourceLabel: 'Imported song',
            privateSessionSource: 'local',
            privateSessionOrigin: 'import',
            privateSessionCollectionKey: 'temporary'
        })
    }));
    const toAdd = pendingImports.map((item) => item.track);
    const count = addPrivateSessionImportedTracks(toAdd);
    if (count > 0) {
        setPrivateSessionFeedback(`Imported ${count} private song${count === 1 ? '' : 's'}.`, 'success');
        enrichPrivateSessionImportedTracks(pendingImports).catch((error) => {
            console.warn('Private cover enrichment failed', error);
        });
    } else {
        toAdd.forEach((track) => {
            const blobUrl = sanitizeText(track?.url || '');
            if (blobUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(blobUrl); } catch (_) {}
            }
        });
        setPrivateSessionFeedback('No new private songs were found in that selection.', 'warn');
    }
    renderPrivateSessionCollections();
}

function importPrivateSessionDesktopMediaEntries(entries = []) {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const importable = (Array.isArray(entries) ? entries : []).filter((entry) => {
        const fileName = sanitizeText(entry?.name || entry?.path?.split(/[\\/]/).pop() || '');
        return !!(sanitizeText(entry?.path || '') && sanitizeText(entry?.mediaUrl || '') && inferMediaTypeFromFileName(fileName) === 'audio');
    });
    if (!importable.length) {
        setPrivateSessionFeedback('Desktop picker returned no importable songs.', 'warn');
        renderPrivateSessionCollections();
        return;
    }
    const pendingImports = importable.map((entry) => ({
        entry,
        track: sanitizePrivateSessionTrackRecord({
            id: `private_local_${generateId()}`,
            fileName: sanitizeText(entry?.name || entry?.path?.split(/[\\/]/).pop() || ''),
            title: sanitizeText(entry?.name || '').replace(/\.[^/.]+$/, ''),
            size: Number(entry?.size) || 0,
            lastModified: Number(entry?.lastModified) || 0,
            url: sanitizeText(entry?.mediaUrl || ''),
            source: 'local',
            sourceLabel: 'Desktop picker',
            cover: sanitizeText(entry?.cover || ''),
            fingerprint: sanitizeText(`${entry?.path || ''}|${Math.max(0, Number(entry?.size) || 0)}|${Math.max(0, Number(entry?.lastModified) || 0)}`),
            privateSessionSource: 'local',
            privateSessionOrigin: 'import',
            privateSessionCollectionKey: 'temporary'
        })
    }));
    const toAdd = pendingImports.map((item) => item.track);
    const count = addPrivateSessionImportedTracks(toAdd);
    setPrivateSessionFeedback(
        count > 0
            ? `Imported ${count} private song${count === 1 ? '' : 's'} from the desktop picker.`
            : 'Desktop picker returned no new private songs.',
        count > 0 ? 'success' : 'warn'
    );
    if (count > 0) {
        enrichPrivateSessionImportedTracks(pendingImports).catch((error) => {
            console.warn('Private cover enrichment failed', error);
        });
    }
    renderPrivateSessionCollections();
}

async function requestPrivateSessionImport() {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const privateUploadInput = document.getElementById('private-file-upload');
    const canUseDesktopPicker = isDesktopRuntimeAvailable()
        && nexPlayDesktopBridge
        && typeof nexPlayDesktopBridge.pickLocalMediaFiles === 'function';
    if (canUseDesktopPicker) {
        try {
            const result = await nexPlayDesktopBridge.pickLocalMediaFiles();
            if (result?.cancelled) return;
            importPrivateSessionDesktopMediaEntries(Array.isArray(result?.entries) ? result.entries : []);
            return;
        } catch (error) {
            console.warn('Private desktop media picker failed', error);
            setPrivateSessionFeedback('Desktop picker failed, falling back to the browser file picker.', 'warn');
        }
    }
    if (privateUploadInput) privateUploadInput.click();
}

function handlePrivateSessionFileUpload(event) {
    handlePrivateSessionFiles(event?.target?.files || []);
    if (event?.target) event.target.value = '';
}

async function searchPrivateSessionOnlineMusic() {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const privateState = getPrivateSessionState();
    const queryInput = document.getElementById('private-session-search-input');
    const query = sanitizeText(queryInput?.value || privateState.searchQuery || '').trim();
    privateState.searchQuery = query;
    if (!query) {
        setPrivateSessionFeedback('Type a song or artist name first.', 'warn');
        return;
    }
    state.privateSession = {
        ...getPrivateSessionState(),
        searchQuery: query,
        searchResults: [],
        onlineView: 'search',
        browserArtist: null,
        browserArtistStatus: 'idle',
        browserArtistError: '',
        browserRelease: null,
        browserReleaseStatus: 'idle',
        browserReleaseError: ''
    };
    setPrivateSessionFeedback(
        canUseDesktopYouTubeMusicSearch()
            ? `Searching online providers for "${query}" inside private mode...`
            : `Searching online providers for "${query}" inside private mode...`,
        'info'
    );
    renderPrivateSessionCollections();

    if (canUseDesktopYouTubeMusicSearch()) {
        let nextSearchResults = [];
        let searchErrors = [];
        try {
            const searchBundle = await fetchOnlineMusicCatalogSearchBundle(query);
            searchErrors = searchBundle.errors || [];
            nextSearchResults = mergeOnlineMusicSearchResults(searchBundle.tracks || [], { query }).slice(0, 48).map((track) => sanitizePrivateSessionTrackRecord({
                ...track,
                sourceLabel: sanitizeText(track?.catalogProviderLabel || track?.transportProviderLabel || track?.providerLabel || track?.provider || 'Online'),
                privateSessionOrigin: 'search',
                privateSessionCollectionKey: 'search'
            }));
        } catch (error) {
            searchErrors = [sanitizeOnlineProviderErrorMessage(error?.message || error || '') || 'Online search is unavailable right now.'];
        }
        state.privateSession = {
            ...getPrivateSessionState(),
            searchQuery: query,
            searchResults: nextSearchResults,
            onlineView: 'search',
            browserRelease: null,
            browserReleaseStatus: 'idle',
            browserReleaseError: ''
        };
        if (nextSearchResults.length) {
            setPrivateSessionFeedback(`Found ${nextSearchResults.length} private online result${nextSearchResults.length === 1 ? '' : 's'} for "${query}".${searchErrors.length ? ' Some online sources were unavailable.' : ''}`, searchErrors.length ? 'warn' : 'success');
        } else {
            setPrivateSessionFeedback(`No online results found for "${query}".${searchErrors.length ? ' Some online sources were unavailable.' : ''}`, searchErrors.length ? 'error' : 'warn');
        }
        renderPrivateSessionCollections();
        appendDesktopYouTubeMusicResultsToPrivateSearch(query);
        return;
    }

    const catalogResponses = await Promise.allSettled([
        fetchItunesSearchTracks(query),
        fetchDeezerSearchTracks(query)
    ]);
    const catalogResults = catalogResponses
        .filter((entry) => entry.status === 'fulfilled')
        .flatMap((entry) => Array.isArray(entry.value) ? entry.value : []);
    let youtubeResults = [];
    let youtubeError = '';
    if (shouldUseOnlineMusicYouTubeDiscovery()) {
        try {
            youtubeResults = await fetchYouTubeOnlineMusicSearchTracks(query);
        } catch (error) {
            youtubeError = sanitizeText(error?.message || 'YouTube discovery is unavailable right now.');
        }
    }
    const nextSearchResults = mergeOnlineMusicSearchResults([
        ...catalogResults,
        ...youtubeResults
    ], { query }).slice(0, 48).map((track) => sanitizePrivateSessionTrackRecord({
        ...track,
        sourceLabel: sanitizeText(track?.catalogProviderLabel || track?.transportProviderLabel || track?.providerLabel || track?.provider || 'Online'),
        privateSessionOrigin: 'search',
        privateSessionCollectionKey: 'search'
    }));
    state.privateSession = {
        ...getPrivateSessionState(),
        searchQuery: query,
        searchResults: nextSearchResults,
        onlineView: 'search',
        browserRelease: null,
        browserReleaseStatus: 'idle',
        browserReleaseError: ''
    };
    if (nextSearchResults.length) {
        setPrivateSessionFeedback(`Found ${nextSearchResults.length} private online result${nextSearchResults.length === 1 ? '' : 's'} for "${query}".${youtubeError ? ` ${youtubeError}` : ''}`, youtubeError ? 'warn' : 'success');
    } else {
        setPrivateSessionFeedback(`No online results found for "${query}".${youtubeError ? ` ${youtubeError}` : ''}`, 'warn');
    }
    renderPrivateSessionCollections();
}

function importPrivateSessionOnlineResult(trackId = '') {
    const safeTrackId = sanitizeText(trackId || '');
    if (!safeTrackId) return;
    const found = findPrivateSessionTrackById(safeTrackId, { includeSearchResults: true });
    if (!found) return;
    const count = addPrivateSessionImportedTracks([sanitizePrivateSessionTrackRecord({
        ...found,
        sourceLabel: sanitizeText(found.sourceLabel || found.providerLabel || 'Online'),
        privateSessionOrigin: 'import',
        privateSessionCollectionKey: 'temporary'
    })]);
    setPrivateSessionFeedback(
        count > 0
            ? `Added "${found.title}" to the private temporary list.`
            : `"${found.title}" is already available in the private temporary list.`,
        count > 0 ? 'success' : 'warn'
    );
    renderPrivateSessionCollections();
}

function canUsePrivateSessionOnlineTrack(track = null) {
    return !!(track && (!track.pendingPlaybackResolution || canResolveOnlineMusicTrackOnCurrentRuntime(track)));
}

function getPrivateSessionOnlineTrackPlaybackLabel(track = null) {
    if (!track) return 'Unavailable';
    if (!track.pendingPlaybackResolution) {
        return sanitizeText(track.transportProviderLabel || (track.videoId ? 'YouTube' : 'Online'));
    }
    return canUsePrivateSessionOnlineTrack(track) ? 'Resolve On Play' : 'Desktop Resolve';
}

function getPrivateSessionPlayableCollectionTracks(collectionKey = 'search') {
    return getPrivateSessionCollectionTracks(collectionKey).filter((track) => {
        if (!isOnlineMusicTrackRecord(track)) return true;
        return canUsePrivateSessionOnlineTrack(track);
    });
}

function getPrivateSessionActiveTrack() {
    const activeTrack = getActivePlaybackTrack();
    if (isPrivateSessionTrackRecord(activeTrack)) return activeTrack;
    const currentTrack = getCurrentTrack();
    if (isPrivateSessionTrackRecord(currentTrack)) return currentTrack;
    return null;
}

function getPrivateSessionFallbackPlaybackTarget() {
    const privateState = getPrivateSessionState();
    const candidateKeys = [
        privateState.currentCollectionKey || '',
        'temporary',
        privateState.onlineView || '',
        'search',
        'artist',
        'release',
        ...(privateState.playlists || []).map((playlist) => `playlist:${playlist.id}`)
    ].map((key) => sanitizeText(key || '')).filter(Boolean);
    const seen = new Set();
    for (const key of candidateKeys) {
        if (seen.has(key)) continue;
        seen.add(key);
        const tracks = getPrivateSessionPlayableCollectionTracks(key);
        const track = tracks.find(Boolean);
        if (track) return { track, collectionKey: key };
    }
    return null;
}

function getPrivateSessionQueueStepAvailability() {
    const helper = getAudioQueueHelper();
    const bucket = getUnifiedAudioQueueState();
    const prevStep = typeof helper.rewind === 'function'
        ? helper.rewind(bucket, { skipEntryIds: bucket.failedEntryIds || [] })
        : { entry: null };
    const nextStep = typeof helper.advance === 'function'
        ? helper.advance(bucket, { skipEntryIds: bucket.failedEntryIds || [] })
        : { entry: null };
    return {
        hasPrev: !!prevStep.entry,
        hasNext: !!nextStep.entry
    };
}

function getPrivateSessionPlayerSnapshot() {
    const track = getPrivateSessionActiveTrack();
    const online = getOnlineMusicState();
    const isOnlineTrack = isOnlineMusicTrackRecord(track);
    const isConnecting = !!(track && isOnlineTrack && normalizeOnlineMusicTrackId(online.connectingTrackId || '') === normalizeOnlineMusicTrackId(track.id || ''));
    const rawDuration = isOnlineTrack
        ? Number(online.duration || track?.duration || 0)
        : getMediaDurationSafe(els.audio, Number(track?.duration || 0));
    const duration = Math.max(0, Number(rawDuration) || 0);
    const rawCurrent = isOnlineTrack
        ? Number(online.currentTime || 0)
        : Number(els.audio?.currentTime || 0);
    const currentTime = Math.max(0, duration > 0 ? Math.min(rawCurrent, duration) : rawCurrent);
    const isPlaying = !!track && (isOnlineTrack
        ? !!online.isPlaying
        : (!!state.isPlaying && !els.audio?.paused));
    const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
    const queueSteps = getPrivateSessionQueueStepAvailability();
    return {
        track,
        isOnlineTrack,
        isConnecting,
        isPlaying,
        currentTime,
        duration,
        progress,
        hasPrev: queueSteps.hasPrev,
        hasNext: queueSteps.hasNext,
        sourceLabel: track
            ? (isOnlineTrack
                ? sanitizeText(track.transportProviderLabel || track.providerLabel || track.sourceLabel || 'Private stream')
                : sanitizeText(track.sourceLabel || track.fileName || 'Private file'))
            : 'Private session',
        status: !track
            ? 'Select or import a private track'
            : (isConnecting
                ? 'Connecting'
                : (isPlaying ? 'Playing inside Private Mode' : 'Ready inside Private Mode'))
    };
}

function syncPrivateSessionPlayerDeck() {
    const root = document.getElementById('private-session-player-deck');
    if (!root) return;
    const snapshot = getPrivateSessionPlayerSnapshot();
    const track = snapshot.track;
    root.classList.toggle('private-player-empty', !track);

    const titleEl = document.getElementById('private-player-title');
    const artistEl = document.getElementById('private-player-artist');
    const sourceEl = document.getElementById('private-player-source');
    const statusEl = document.getElementById('private-player-status');
    const coverEl = document.getElementById('private-player-cover');
    const fallbackEl = document.getElementById('private-player-cover-fallback');

    setTextContentIfChanged(titleEl, track?.title || 'Private session standby');
    setTextContentIfChanged(artistEl, track?.artist || track?.channelTitle || 'No private track loaded');
    setTextContentIfChanged(sourceEl, snapshot.sourceLabel);
    setTextContentIfChanged(statusEl, snapshot.status);
    if (coverEl && fallbackEl) {
        const coverSrc = track ? getTrackCoverOrFallback(track) : '';
        if (coverSrc) {
            coverEl.onerror = () => {
                const fallbackCover = buildTrackCoverPlaceholderDataUri(track || { title: 'Private session', artist: 'Vault', type: 'audio' });
                if (coverEl.src !== fallbackCover) coverEl.src = fallbackCover;
            };
            coverEl.src = coverSrc;
            coverEl.classList.remove('hidden');
            fallbackEl.classList.add('hidden');
        } else {
            coverEl.src = '';
            coverEl.classList.add('hidden');
            fallbackEl.classList.remove('hidden');
        }
    }
}

async function togglePrivateSessionPlayerPlayback() {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const currentTrack = getPrivateSessionActiveTrack();
    if (currentTrack) {
        togglePlay();
        window.setTimeout(syncPrivateSessionPlayerDeck, 80);
        return true;
    }
    const fallback = getPrivateSessionFallbackPlaybackTarget();
    if (!fallback?.track) {
        setPrivateSessionFeedback('Import or search for a private track first.', 'warn');
        syncPrivateSessionPlayerDeck();
        return false;
    }
    return playPrivateSessionTrack(fallback.track.id, fallback.collectionKey);
}

async function playPrivateSessionNext() {
    if (!getPrivateSessionActiveTrack()) return togglePrivateSessionPlayerPlayback();
    await playNext();
    syncPrivateSessionPlayerDeck();
    renderPrivateSessionCollections();
    return true;
}

async function playPrivateSessionPrevious() {
    if (!getPrivateSessionActiveTrack()) return togglePrivateSessionPlayerPlayback();
    await playPrev();
    syncPrivateSessionPlayerDeck();
    renderPrivateSessionCollections();
    return true;
}

async function seekPrivateSessionPlayerTo(rawValue = 0) {
    const track = getPrivateSessionActiveTrack();
    if (!track) return false;
    const seconds = Math.max(0, Number(rawValue) || 0);
    if (isOnlineMusicTrackRecord(track)) {
        await seekOnlineMusicTo(seconds, { forcePersist: false });
    } else if (safeSeekMedia(els.audio, seconds, { fallbackDuration: Number(track.duration || 0) })) {
        updateProgress();
    } else {
        setPrivateSessionFeedback('Private seek is not ready for this track yet.', 'warn');
        syncPrivateSessionPlayerDeck();
        return false;
    }
    syncPrivateSessionPlayerDeck();
    return true;
}

async function queuePrivateSessionTrack(trackId = '', placement = 'end', collectionKey = 'temporary') {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const safeTrackId = sanitizeText(trackId || '');
    const safePlacement = placement === 'next' ? 'next' : 'end';
    const safeCollectionKey = sanitizeText(collectionKey || 'temporary') || 'temporary';
    const collectionTracks = getPrivateSessionCollectionTracks(safeCollectionKey);
    const targetTrack = collectionTracks.find((track) => sanitizeText(track?.id || '') === safeTrackId)
        || findPrivateSessionTrackById(safeTrackId, { includeSearchResults: true });
    if (!targetTrack) {
        setPrivateSessionFeedback('That private track is no longer available.', 'warn');
        renderPrivateSessionCollections();
        return false;
    }
    if (isOnlineMusicTrackRecord(targetTrack) && !canUsePrivateSessionOnlineTrack(targetTrack)) {
        const message = getOnlineMusicPlaybackResolutionUnavailableMessage('track');
        setPrivateSessionFeedback(message, 'warn');
        showToast(message, 'info');
        renderPrivateSessionCollections();
        return false;
    }
    const privateState = getPrivateSessionState();
    privateState.currentCollectionKey = safeCollectionKey;
    if (!isPrivateSessionTrackRecord(getCurrentTrack())) {
        const deck = collectionTracks.length ? collectionTracks : [targetTrack];
        const staged = await startTrackCollectionPlayback(deck, targetTrack.id, {
            autoplay: false,
            queueSource: 'manual',
            isShuffle: false,
            playbackContext: isOnlineMusicTrackRecord(targetTrack) ? 'private-session' : 'library',
            queueContextView: isOnlineMusicTrackRecord(targetTrack) ? 'private-session' : 'library',
            queueContextKey: getPrivateSessionQueueContextKey(safeCollectionKey)
        });
        setPrivateSessionFeedback(
            staged
                ? `Staged "${targetTrack.title}" in the private queue without starting playback.`
                : `Could not queue "${targetTrack.title}" in private mode.`,
            staged ? 'success' : 'error'
        );
        renderPrivateSessionCollections();
        return !!staged;
    }
    const queued = queueUnifiedAudioTrack(targetTrack, safePlacement, { quiet: true });
    setPrivateSessionFeedback(
        queued
            ? `Queued "${targetTrack.title}" ${safePlacement === 'next' ? 'next' : 'to the end'} in private mode.`
            : `Could not queue "${targetTrack.title}" in private mode.`,
        queued ? 'success' : 'error'
    );
    renderPrivateSessionCollections();
    return !!queued;
}

async function playPrivateSessionOnlineCollection(collectionKey = 'search', mode = 'ordered') {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const safeCollectionKey = sanitizeText(collectionKey || 'search') || 'search';
    const tracks = getPrivateSessionPlayableCollectionTracks(safeCollectionKey);
    if (!tracks.length) {
        setPrivateSessionFeedback('No playable private online tracks are available in this view.', 'warn');
        renderPrivateSessionCollections();
        return false;
    }
    const orderedTracks = mode === 'shuffle' ? shuffleOnlineMusicTracks(tracks) : tracks;
    const firstTrack = orderedTracks[0];
    const privateState = getPrivateSessionState();
    privateState.currentCollectionKey = safeCollectionKey;
    privateState.currentTrackId = firstTrack.id;
    const started = await startTrackCollectionPlayback(orderedTracks, firstTrack.id, {
        autoplay: true,
        queueSource: 'manual',
        isShuffle: mode === 'shuffle',
        playbackContext: 'private-session',
        queueContextView: 'private-session',
        queueContextKey: getPrivateSessionQueueContextKey(safeCollectionKey)
    });
    setPrivateSessionFeedback(
        started
            ? `Started ${mode === 'shuffle' ? 'shuffled ' : ''}private playback for this online view.`
            : 'Could not start private online playback for this view.',
        started ? 'success' : 'error'
    );
    renderPrivateSessionCollections();
    return !!started;
}

function addPrivateSessionCollectionToTemporary(collectionKey = 'search') {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const safeCollectionKey = sanitizeText(collectionKey || 'search') || 'search';
    const tracks = getPrivateSessionCollectionTracks(safeCollectionKey);
    if (!tracks.length) {
        setPrivateSessionFeedback('There are no private tracks to add from this view.', 'warn');
        renderPrivateSessionCollections();
        return 0;
    }
    const count = addPrivateSessionImportedTracks(tracks.map((track) => sanitizePrivateSessionTrackRecord({
        ...track,
        privateSessionOrigin: 'import',
        privateSessionCollectionKey: 'temporary'
    })));
    setPrivateSessionFeedback(
        count > 0
            ? `Added ${count} private track${count === 1 ? '' : 's'} to the temporary list.`
            : 'Everything in this private view is already in the temporary list.',
        count > 0 ? 'success' : 'warn'
    );
    renderPrivateSessionCollections();
    return count;
}

function getPrivateSessionArtistRelease(playlistId = '') {
    const safePlaylistId = buildOnlineMusicReleaseCacheKey(playlistId);
    if (!safePlaylistId) return null;
    const privateState = getPrivateSessionState();
    const releases = [
        ...(privateState.browserArtist?.albums || []),
        ...(privateState.browserArtist?.singlesEps || []),
        ...(privateState.browserArtist?.otherReleases || [])
    ];
    const cachedRelease = getOnlineMusicReleaseTracksCache()[safePlaylistId]?.release || null;
    return releases.find((release) => buildOnlineMusicReleaseCacheKey(release?.playlistId || '') === safePlaylistId)
        || (cachedRelease ? sanitizePrivateSessionReleaseRecord(cachedRelease) : null)
        || null;
}

function returnToPrivateSessionOnlineSearch() {
    const privateState = getPrivateSessionState();
    privateState.onlineView = 'search';
    privateState.browserRelease = null;
    privateState.browserReleaseStatus = 'idle';
    privateState.browserReleaseError = '';
    renderPrivateSessionCollections();
}

function returnToPrivateSessionOnlineArtist() {
    const privateState = getPrivateSessionState();
    if (!privateState.browserArtist) {
        returnToPrivateSessionOnlineSearch();
        return;
    }
    privateState.onlineView = 'artist';
    privateState.browserRelease = null;
    privateState.browserReleaseStatus = 'idle';
    privateState.browserReleaseError = '';
    renderPrivateSessionCollections();
}

function setPrivateSessionArtistWorkSortMode(value = '') {
    const privateState = getPrivateSessionState();
    privateState.artistWorkSortMode = normalizeOnlineMusicArtistWorkSortMode(value || '');
    renderPrivateSessionCollections();
    return privateState.artistWorkSortMode;
}

async function openPrivateSessionOnlineArtist(trackId = '') {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const safeTrackId = sanitizeText(trackId || '');
    const targetTrack = findPrivateSessionTrackById(safeTrackId, { includeSearchResults: true })
        || (isPrivateSessionTrackRecord(getOnlineMusicCurrentTrack()) ? getOnlineMusicCurrentTrack() : null);
    if (!targetTrack) {
        setPrivateSessionFeedback('Artist could not be resolved for that private track.', 'warn');
        renderPrivateSessionCollections();
        return;
    }
    const requestId = Math.max(0, Number(getPrivateSessionState().browserRequestId || 0) || 0) + 1;
    state.privateSession = {
        ...getPrivateSessionState(),
        browserRequestId: requestId,
        onlineView: 'artist',
        browserRelease: null,
        browserReleaseStatus: 'idle',
        browserReleaseError: '',
        browserArtistStatus: 'loading',
        browserArtistError: '',
        browserArtist: sanitizePrivateSessionArtistCatalog({
            channelId: sanitizeText(targetTrack.channelId || ''),
            title: sanitizeText(targetTrack.artist || targetTrack.channelTitle || 'Artist'),
            description: '',
            cover: targetTrack.cover || '',
            uploadsPlaylistId: '',
            albums: [],
            singlesEps: [],
            otherReleases: [],
            allWork: []
        })
    };
    setPrivateSessionFeedback(`Opening ${targetTrack.artist || targetTrack.channelTitle || 'artist'} privately...`, 'info');
    renderPrivateSessionCollections();
    try {
        const catalog = await loadOnlineMusicArtistCatalog(targetTrack);
        if (Number(getPrivateSessionState().browserRequestId || 0) !== requestId) return;
        const privateCatalog = sanitizePrivateSessionArtistCatalog(catalog);
        state.privateSession = {
            ...getPrivateSessionState(),
            browserRequestId: requestId,
            onlineView: 'artist',
            browserArtist: privateCatalog,
            browserArtistStatus: 'ready',
            browserArtistError: '',
            browserRelease: null,
            browserReleaseStatus: 'idle',
            browserReleaseError: ''
        };
        setPrivateSessionFeedback(`Browsing ${privateCatalog?.title || 'artist'} privately.`, 'success');
        renderPrivateSessionCollections();
    } catch (error) {
        if (Number(getPrivateSessionState().browserRequestId || 0) !== requestId) return;
        state.privateSession = {
            ...getPrivateSessionState(),
            onlineView: 'artist',
            browserArtistStatus: 'error',
            browserArtistError: error?.message || 'Unable to load this artist in private mode.'
        };
        setPrivateSessionFeedback(getPrivateSessionState().browserArtistError, 'error');
        renderPrivateSessionCollections();
    }
}

async function openPrivateSessionOnlineRelease(playlistId = '') {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const release = getPrivateSessionArtistRelease(playlistId);
    if (!release) {
        setPrivateSessionFeedback('Release could not be opened in private mode.', 'warn');
        renderPrivateSessionCollections();
        return;
    }
    const requestId = Math.max(0, Number(getPrivateSessionState().browserRequestId || 0) || 0) + 1;
    state.privateSession = {
        ...getPrivateSessionState(),
        browserRequestId: requestId,
        onlineView: 'release',
        browserReleaseStatus: 'loading',
        browserReleaseError: '',
        browserRelease: sanitizePrivateSessionReleaseRecord({
            ...release,
            tracks: []
        })
    };
    setPrivateSessionFeedback(`Opening "${release.title || 'release'}" privately...`, 'info');
    renderPrivateSessionCollections();
    try {
        const privateState = getPrivateSessionState();
        const entry = await loadOnlineMusicReleaseTracks(release, {
            channelId: release.channelId || privateState.browserArtist?.channelId || '',
            artist: release.artist || privateState.browserArtist?.title || '',
            cache: false,
            persist: false
        });
        if (Number(getPrivateSessionState().browserRequestId || 0) !== requestId) return;
        state.privateSession = {
            ...getPrivateSessionState(),
            browserRequestId: requestId,
            onlineView: 'release',
            browserRelease: sanitizePrivateSessionReleaseRecord({
                ...(entry.release || release),
                tracks: entry.tracks || []
            }),
            browserReleaseStatus: 'ready',
            browserReleaseError: ''
        };
        setPrivateSessionFeedback(`Opened "${release.title || 'release'}" privately.`, 'success');
        renderPrivateSessionCollections();
    } catch (error) {
        if (Number(getPrivateSessionState().browserRequestId || 0) !== requestId) return;
        state.privateSession = {
            ...getPrivateSessionState(),
            onlineView: 'release',
            browserReleaseStatus: 'error',
            browserReleaseError: error?.message || 'Unable to load this release in private mode.'
        };
        setPrivateSessionFeedback(getPrivateSessionState().browserReleaseError, 'error');
        renderPrivateSessionCollections();
    }
}

async function importPrivateSessionPlaylistFromInput(rawInput = '') {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const privateState = getPrivateSessionState();
    const nextInput = sanitizeText(rawInput || privateState.playlistInput || '').trim();
    privateState.playlistInput = nextInput;
    const playlistId = extractYouTubePlaylistIdFromUrl(nextInput);
    if (!playlistId) {
        setPrivateSessionFeedback('Paste a valid YouTube playlist URL or playlist ID first.', 'warn');
        return null;
    }
    syncConfiguredOnlineMusicApiKey();
    const apiKey = sanitizeText(syncConfiguredOnlineMusicApiKey() || YOUTUBE_DATA_API_KEY);
    if (!apiKey) {
        setPrivateSessionFeedback('Add a YouTube Data API key in Settings before importing playlists.', 'error');
        return null;
    }
    setPrivateSessionFeedback('Loading playlist tracks into private mode...', 'info');
    try {
        const details = await fetchOnlineMusicPlaylistsByIds([playlistId]);
        const playlistTitle = sanitizeText(details?.[0]?.snippet?.title || 'YouTube playlist');
        const resolution = await fetchOnlineMusicTracksFromPlaylist(playlistId, {
            maxPages: 16,
            artist: '',
            channelId: '',
            channelTitle: '',
            releaseTitle: playlistTitle
        });
        const tracks = Array.isArray(resolution?.tracks) ? resolution.tracks : [];
        if (!tracks.length) {
            setPrivateSessionFeedback('No playable tracks were found in that playlist.', 'warn');
            return null;
        }
        const mappedTracks = tracks.map((track) => sanitizePrivateSessionTrackRecord({
            ...track,
            sourceLabel: playlistTitle || 'Playlist import',
            privateSessionOrigin: 'playlist',
            privateSessionCollectionKey: `playlist:${playlistId}`,
            privateSessionCollectionLabel: playlistTitle || 'Playlist import'
        }));
        const nextPlaylist = {
            id: generateId(),
            title: playlistTitle || 'YouTube playlist',
            sourcePlaylistId: playlistId,
            trackCount: mappedTracks.length,
            importedAt: Date.now(),
            tracks: mappedTracks
        };
        state.privateSession = {
            ...getPrivateSessionState(),
            playlistInput: nextInput,
            playlists: [
                nextPlaylist,
                ...(getPrivateSessionState().playlists || []).filter((playlist) => sanitizeText(playlist?.sourcePlaylistId || '') !== playlistId)
            ]
        };
        setPrivateSessionFeedback(`Imported playlist "${playlistTitle}" into private mode (${mappedTracks.length} songs).`, 'success');
        renderPrivateSessionCollections();
        return nextPlaylist;
    } catch (error) {
        setPrivateSessionFeedback(error?.message || 'Playlist import failed in private mode.', 'error');
        return null;
    }
}

function getPrivateSessionTrackActionLabel(trackId = '') {
    const current = getCurrentTrack();
    const safeId = sanitizeText(trackId || '');
    if (!safeId || !current || !isPrivateSessionTrackRecord(current) || sanitizeText(current.id || '') !== safeId) {
        return 'Play';
    }
    return state.isPlaying ? 'Pause' : 'Resume';
}

async function playPrivateSessionTrack(trackId = '', collectionKey = 'temporary') {
    if (!hasPrivateSessionRuntime()) enterPrivateSession({ quiet: true });
    const safeTrackId = sanitizeText(trackId || '');
    const safeCollectionKey = sanitizeText(collectionKey || 'temporary') || 'temporary';
    if (!safeTrackId) return false;
    const privateState = getPrivateSessionState();
    const collectionTracks = getPrivateSessionCollectionTracks(safeCollectionKey);
    const targetTrack = collectionTracks.find((track) => sanitizeText(track?.id || '') === safeTrackId)
        || findPrivateSessionTrackById(safeTrackId, { includeSearchResults: true });
    if (!targetTrack) {
        setPrivateSessionFeedback('That private track is no longer available.', 'warn');
        renderPrivateSessionCollections();
        return false;
    }
    const current = getCurrentTrack();
    if (current && isPrivateSessionTrackRecord(current) && sanitizeText(current.id || '') === safeTrackId) {
        togglePlay();
        privateState.currentTrackId = safeTrackId;
        privateState.currentCollectionKey = safeCollectionKey;
        renderPrivateSessionCollections();
        return true;
    }
    privateState.currentTrackId = safeTrackId;
    privateState.currentCollectionKey = safeCollectionKey;
    const playableTracks = collectionTracks.length ? collectionTracks : [targetTrack];
    const started = await startTrackCollectionPlayback(playableTracks, safeTrackId, {
        autoplay: true,
        queueSource: 'manual',
        isShuffle: false,
        playbackContext: isOnlineMusicTrackRecord(targetTrack) ? 'private-session' : 'library',
        queueContextView: isOnlineMusicTrackRecord(targetTrack) ? 'private-session' : 'library',
        queueContextKey: getPrivateSessionQueueContextKey(safeCollectionKey)
    });
    setPrivateSessionFeedback(
        started
            ? `Private playback ready: "${targetTrack.title}".`
            : `Could not start "${targetTrack.title}" in private mode.`,
        started ? 'success' : 'error'
    );
    renderPrivateSessionCollections();
    return !!started;
}

function renderPrivateSessionPlayerDeck() {
    return `
        <section id="private-session-player-deck" class="private-route-panel rounded-lg p-4 md:p-5">
            <div class="flex min-w-0 items-center gap-4">
                <div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-rose-200/10 bg-black/70">
                    <img id="private-player-cover" alt="Private track cover" class="hidden h-full w-full object-cover">
                    <div id="private-player-cover-fallback" class="flex h-full w-full items-center justify-center text-rose-100/80">
                        <i data-lucide="shield-half" class="h-7 w-7"></i>
                    </div>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="private-route-pill rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">Private Session</span>
                        <span id="private-player-source" class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-stone-300">Private session</span>
                    </div>
                    <div id="private-player-title" class="mt-3 truncate text-2xl font-black text-white">Private session standby</div>
                    <div id="private-player-artist" class="mt-1 truncate text-sm text-stone-300">No private track loaded</div>
                    <div id="private-player-status" class="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-100/80">Select or import a private track</div>
                </div>
            </div>
        </section>
    `;
}

function renderPrivateSessionTemporaryList() {
    const tracks = getPrivateSessionTemporaryListTracks();
    if (!tracks.length) {
        return '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-6 text-xs text-slate-300">Your temporary list is empty. Import songs, import a playlist, or add search results here.</div>';
    }
    return tracks.map((track) => {
        const actionLabel = getPrivateSessionTrackActionLabel(track.id);
        const sourceDetail = track.privateSessionOrigin === 'playlist'
            ? `Playlist - ${sanitizeText(track.privateSessionCollectionLabel || 'Imported playlist')}`
            : sanitizeText(track.sourceLabel || track.fileName || 'Private track');
        const canRemove = track.privateSessionOrigin !== 'playlist';
        const coverSrc = getTrackCoverOrFallback(track);
        return `
            <div class="flex items-center gap-3 rounded-2xl border border-teal-400/15 bg-slate-950/55 px-3 py-3">
                <div class="h-12 w-12 overflow-hidden rounded-xl border border-teal-300/15 bg-slate-900/90 shrink-0">
                    ${coverSrc ? `<img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover">` : '<div class="flex h-full w-full items-center justify-center text-teal-100/70"><i data-lucide="music-2" class="h-4 w-4"></i></div>'}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-black text-white">${escapeHtml(track.title || 'Untitled')}</div>
                    <div class="mt-1 truncate text-[11px] text-slate-300">${escapeHtml(track.artist || 'Unknown')} &middot; ${escapeHtml(sourceDetail || 'Private track')}</div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="playPrivateSessionTrack('${escapeHtml(track.id)}','temporary')" class="rounded-xl border border-teal-300/30 bg-teal-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-teal-50 transition hover:bg-teal-500/25">${escapeHtml(actionLabel)}</button>
                    ${canRemove
                        ? `<button onclick="removePrivateSessionImportedTrack('${escapeHtml(track.id)}')" class="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-500/20">Remove</button>`
                        : '<span class="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Playlist</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function renderPrivateSessionOnlineTrackRows(tracks = [], options = {}) {
    const online = getOnlineMusicState();
    const opts = {
        collectionKey: 'search',
        showArtistButton: true,
        ...options
    };
    const list = Array.isArray(tracks) ? tracks : [];
    if (!list.length) {
        return '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-6 text-xs text-slate-300">No private online tracks are available in this view yet.</div>';
    }
    return list.map((track) => {
        const safeId = sanitizeText(track?.id || '');
        const isCurrent = normalizeOnlineMusicTrackId(online.currentTrackId || state.currentTrackId || '') === normalizeOnlineMusicTrackId(safeId);
        const isConnecting = normalizeOnlineMusicTrackId(online.connectingTrackId || '') === normalizeOnlineMusicTrackId(safeId);
        const canQueueTrack = canUsePrivateSessionOnlineTrack(track);
        const playbackLabel = getPrivateSessionOnlineTrackPlaybackLabel(track);
        const coverSrc = getTrackCoverOrFallback(track);
        const playLabel = isConnecting
            ? 'Connecting...'
            : (!canQueueTrack
                ? 'Desktop Only'
                : (track.pendingPlaybackResolution && !(isCurrent && online.isPlaying)
                    ? 'Resolve + Play'
                    : (isCurrent && state.isPlaying ? 'Playing' : getPrivateSessionTrackActionLabel(track.id))));
        const disabledAttr = isConnecting || !canQueueTrack ? 'disabled' : '';
        const disabledClass = isConnecting || !canQueueTrack
            ? 'cursor-not-allowed border-white/5 bg-slate-950/40 text-slate-500 opacity-70'
            : 'border-teal-300/30 bg-teal-500/15 text-teal-50 transition hover:bg-teal-500/25';
        return `
            <div data-private-online-track-row="${escapeHtml(safeId)}" class="rounded-2xl border border-teal-400/15 bg-slate-950/55 px-3 py-3 ${isCurrent ? 'ring-1 ring-teal-300/45' : ''}">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div class="flex min-w-0 flex-1 items-center gap-3">
                        <div class="h-14 w-14 overflow-hidden rounded-xl border border-teal-300/15 bg-slate-900/90 shrink-0">
                            ${coverSrc ? `<img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(track.title || 'Track cover')}" class="h-full w-full object-cover">` : '<div class="flex h-full w-full items-center justify-center text-teal-100/70"><i data-lucide="globe-2" class="h-4 w-4"></i></div>'}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <div class="truncate text-sm font-black text-white">${escapeHtml(track.title || 'Untitled')}</div>
                                <span class="text-[10px] font-black uppercase tracking-[0.16em] text-teal-100/80">Private Streaming</span>
                                <span class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">${escapeHtml(playbackLabel)}</span>
                                <span class="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300 ${isCurrent ? '' : 'hidden'}">Now Playing</span>
                            </div>
                            ${opts.showArtistButton
                                ? `<button type="button" onclick="openPrivateSessionOnlineArtist('${escapeHtml(safeId)}').catch(() => {})" class="mt-1 truncate text-left text-xs font-mono text-teal-100 transition hover:text-white">${escapeHtml(track.artist || track.channelTitle || 'YouTube')}</button>`
                                : `<p class="mt-1 truncate text-xs text-slate-300">${escapeHtml(track.artist || track.channelTitle || 'YouTube')}</p>`}
                            <p class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">${escapeHtml(track.durationLabel || formatTime(track.duration || 0))}${playbackLabel ? ` | ${escapeHtml(playbackLabel)}` : ''}</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" onclick="playPrivateSessionTrack('${escapeHtml(safeId)}','${escapeHtml(opts.collectionKey)}')" ${disabledAttr} class="rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${disabledClass}">${escapeHtml(playLabel)}</button>
                        <button type="button" onclick="queuePrivateSessionTrack('${escapeHtml(safeId)}','next','${escapeHtml(opts.collectionKey)}').catch(() => {})" ${disabledAttr} class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${disabledClass}">Play Next</button>
                        <button type="button" onclick="queuePrivateSessionTrack('${escapeHtml(safeId)}','end','${escapeHtml(opts.collectionKey)}').catch(() => {})" ${disabledAttr} class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${disabledClass}">Add To End</button>
                        <button type="button" onclick="importPrivateSessionOnlineResult('${escapeHtml(safeId)}')" class="rounded-xl border border-amber-400/30 bg-amber-500/12 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-500/22">Add Temp</button>
                        ${track.canonicalUrl
                            ? `<button type="button" onclick="window.open('${escapeHtml(track.canonicalUrl)}','_blank','noopener,noreferrer')" class="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/15">Open</button>`
                            : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderPrivateSessionOnlineReleaseCards(releases = []) {
    const list = Array.isArray(releases) ? releases : [];
    if (!list.length) {
        return '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-5 text-xs text-slate-300">No releases are available here yet.</div>';
    }
    return `<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">${list.map((release) => `
        <button type="button" onclick="openPrivateSessionOnlineRelease('${escapeHtml(release.playlistId || release.id || '')}').catch(() => {})" class="rounded-2xl border border-teal-300/15 bg-slate-950/55 p-4 text-left transition hover:border-teal-300/45 hover:bg-teal-500/10">
            <div class="flex items-start gap-3">
                <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-teal-300/15 bg-slate-900/90">
                    ${release.cover
                        ? `<img src="${escapeHtml(release.cover)}" alt="${escapeHtml(release.title || 'Release cover')}" class="h-full w-full object-cover">`
                        : '<div class="flex h-full w-full items-center justify-center text-teal-100/70"><i data-lucide="disc-3" class="h-5 w-5"></i></div>'}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-black text-white">${escapeHtml(release.title || 'Release')}</div>
                    <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">${escapeHtml(release.trackCount || release.declaredTrackCount || 0)} tracks${release.publishedAt ? ` | ${escapeHtml((release.publishedAt || '').slice(0, 4))}` : ''}</div>
                </div>
            </div>
        </button>
    `).join('')}</div>`;
}

function renderPrivateSessionOnlineSearchView() {
    const privateState = getPrivateSessionState();
    const results = (privateState.searchResults || [])
        .filter((track) => shouldIncludeOnlineMusicSearchResult(track, { query: privateState.searchQuery || '' }));
    const playableCount = results.filter(canUsePrivateSessionOnlineTrack).length;
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-teal-300/15 bg-slate-950/45 px-4 py-4">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div class="text-sm text-white">${privateState.searchQuery ? `Private results for "${escapeHtml(privateState.searchQuery)}"` : 'Private search results'}</div>
                        <div class="text-xs text-slate-400">Search, artist browsing, queue actions, and playback stay temporary. Save, favorite, and download actions are intentionally excluded.</div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" onclick="playPrivateSessionOnlineCollection('search','ordered').catch(() => {})" ${playableCount ? '' : 'disabled'} class="rounded-xl border border-teal-300/30 bg-teal-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-teal-50 transition hover:bg-teal-500/25 ${playableCount ? '' : 'cursor-not-allowed opacity-50'}">Play Results</button>
                        <button type="button" onclick="playPrivateSessionOnlineCollection('search','shuffle').catch(() => {})" ${playableCount ? '' : 'disabled'} class="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/15 ${playableCount ? '' : 'cursor-not-allowed opacity-50'}">Shuffle</button>
                        <button type="button" onclick="addPrivateSessionCollectionToTemporary('search')" ${results.length ? '' : 'disabled'} class="rounded-xl border border-amber-400/30 bg-amber-500/12 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-500/22 ${results.length ? '' : 'cursor-not-allowed opacity-50'}">Add All Temp</button>
                        <span class="rounded-full border border-teal-300/20 bg-slate-950/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-teal-50">${results.length} results</span>
                    </div>
                </div>
            </div>
            ${results.length
                ? `<div class="space-y-3">${renderPrivateSessionOnlineTrackRows(results, { collectionKey: 'search' })}</div>`
                : '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-6 text-xs text-slate-300">Search results stay here temporarily and disappear when you leave private mode.</div>'}
        </div>
    `;
}

function renderPrivateSessionOnlineArtistView() {
    const privateState = getPrivateSessionState();
    const artist = privateState.browserArtist;
    const status = normalizePrivateSessionLoadStatus(privateState.browserArtistStatus || 'idle');
    const allWork = Array.isArray(artist?.allWork) ? artist.allWork : [];
    const playableCount = allWork.filter(canUsePrivateSessionOnlineTrack).length;
    if (!artist) {
        return '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-6 text-xs text-slate-300">Open an artist from a private search result first.</div>';
    }
    const sortMode = normalizeOnlineMusicArtistWorkSortMode(privateState.artistWorkSortMode || 'best');
    const sortedAlbums = sortOnlineMusicArtistReleasesForView(artist.albums || [], sortMode);
    const sortedSinglesEps = sortOnlineMusicArtistReleasesForView(artist.singlesEps || [], sortMode);
    const sortedOtherReleases = sortOnlineMusicArtistReleasesForView(artist.otherReleases || [], sortMode);
    const sortedAllWork = sortOnlineMusicArtistTracksForView(allWork, sortMode);
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-teal-300/15 bg-slate-950/45 px-4 py-4">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="flex min-w-0 items-start gap-4">
                        <div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-teal-300/15 bg-slate-900/90">
                            ${artist.cover
                                ? `<img src="${escapeHtml(artist.cover)}" alt="${escapeHtml(artist.title || 'Artist')}" class="h-full w-full object-cover">`
                                : '<div class="flex h-full w-full items-center justify-center text-teal-100/70"><i data-lucide="radio" class="h-6 w-6"></i></div>'}
                        </div>
                        <div class="min-w-0">
                            <button type="button" onclick="returnToPrivateSessionOnlineSearch()" class="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-teal-100/80 transition hover:text-white">Back To Search</button>
                            <div class="truncate text-2xl font-black text-white">${escapeHtml(artist.title || 'Artist')}</div>
                            <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">${escapeHtml((artist.albums || []).length)} albums | ${escapeHtml((artist.singlesEps || []).length)} singles / eps${(artist.otherReleases || []).length ? ` | ${escapeHtml((artist.otherReleases || []).length)} other releases` : ''} | ${escapeHtml(allWork.length)} tracks</div>
                            <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-300">${escapeHtml(artist.description || 'Browse releases or play private artist results without saving anything to the normal session.')}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-start gap-2 md:items-end">
                        <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">${status === 'loading' ? 'Loading artist catalog' : 'Private artist browser'}</div>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="playPrivateSessionOnlineCollection('artist','ordered').catch(() => {})" ${playableCount ? '' : 'disabled'} class="rounded-xl border border-teal-300/30 bg-teal-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-teal-50 transition hover:bg-teal-500/25 ${playableCount ? '' : 'cursor-not-allowed opacity-50'}">Play All</button>
                            <button type="button" onclick="playPrivateSessionOnlineCollection('artist','shuffle').catch(() => {})" ${playableCount ? '' : 'disabled'} class="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/15 ${playableCount ? '' : 'cursor-not-allowed opacity-50'}">Shuffle</button>
                        </div>
                        ${renderOnlineMusicArtistWorkSortControl(sortMode, { variant: 'private' })}
                    </div>
                </div>
            </div>
            ${status === 'error'
                ? `<div class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">${escapeHtml(privateState.browserArtistError || 'Unable to load this artist right now.')}</div>`
                : ''}
            ${status === 'loading' && !hasOnlineMusicArtistCatalogContent(artist)
                ? '<div class="rounded-2xl border border-teal-300/15 bg-slate-950/45 px-4 py-5 text-sm text-slate-300">Loading artist releases and catalog privately...</div>'
                : `
                    <div class="space-y-4">
                        <div class="rounded-2xl border border-teal-300/15 bg-slate-950/35 px-4 py-4">
                            <div class="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-teal-100/80">Albums</div>
                            ${renderPrivateSessionOnlineReleaseCards(sortedAlbums)}
                        </div>
                        <div class="rounded-2xl border border-teal-300/15 bg-slate-950/35 px-4 py-4">
                            <div class="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-teal-100/80">Singles &amp; EPs</div>
                            ${renderPrivateSessionOnlineReleaseCards(sortedSinglesEps)}
                        </div>
                        ${(artist.otherReleases || []).length
                            ? `<div class="rounded-2xl border border-teal-300/15 bg-slate-950/35 px-4 py-4">
                                <div class="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-teal-100/80">Other Releases</div>
                                ${renderPrivateSessionOnlineReleaseCards(sortedOtherReleases)}
                            </div>`
                            : ''}
                        <div class="rounded-2xl border border-teal-300/15 bg-slate-950/35 px-4 py-4">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-teal-100/80">All Work</div>
                                    <div class="mt-1 text-xs text-slate-500">Private artist tracks discovered from online providers.</div>
                                </div>
                                <button type="button" onclick="addPrivateSessionCollectionToTemporary('artist')" ${allWork.length ? '' : 'disabled'} class="rounded-xl border border-amber-400/30 bg-amber-500/12 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-500/22 ${allWork.length ? '' : 'cursor-not-allowed opacity-50'}">Add All Temp</button>
                            </div>
                            ${allWork.length
                                ? `<div class="space-y-3">${renderPrivateSessionOnlineTrackRows(sortedAllWork, { collectionKey: 'artist' })}</div>`
                                : '<div class="text-sm text-slate-400">No embeddable tracks were found yet for this artist.</div>'}
                        </div>
                    </div>
                `}
        </div>
    `;
}

function renderPrivateSessionOnlineReleaseView() {
    const privateState = getPrivateSessionState();
    const release = privateState.browserRelease;
    const status = normalizePrivateSessionLoadStatus(privateState.browserReleaseStatus || 'idle');
    if (!release) {
        return '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-6 text-xs text-slate-300">Open a release from the private artist browser first.</div>';
    }
    const releaseTracks = Array.isArray(release.tracks) ? release.tracks : [];
    const playableCount = releaseTracks.filter(canUsePrivateSessionOnlineTrack).length;
    const declaredTrackCount = Math.max(Number(release.declaredTrackCount || 0) || 0, Number(release.trackCount || 0) || 0, releaseTracks.length);
    const missingTrackCount = Math.max(Number(release.missingTrackCount || 0) || 0, declaredTrackCount - releaseTracks.length);
    return `
        <div class="space-y-4">
            <div class="rounded-2xl border border-teal-300/15 bg-slate-950/45 px-4 py-4">
                <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div class="flex min-w-0 items-start gap-4">
                        <div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-teal-300/15 bg-slate-900/90">
                            ${release.cover
                                ? `<img src="${escapeHtml(release.cover)}" alt="${escapeHtml(release.title || 'Release')}" class="h-full w-full object-cover">`
                                : '<div class="flex h-full w-full items-center justify-center text-teal-100/70"><i data-lucide="disc-3" class="h-6 w-6"></i></div>'}
                        </div>
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-teal-100/80">
                                <button type="button" onclick="returnToPrivateSessionOnlineSearch()" class="transition hover:text-white">Search</button>
                                <span class="text-slate-600">/</span>
                                <button type="button" onclick="returnToPrivateSessionOnlineArtist()" class="transition hover:text-white">${escapeHtml(privateState.browserArtist?.title || release.artist || 'Artist')}</button>
                            </div>
                            <div class="mt-3 truncate text-2xl font-black text-white">${escapeHtml(release.title || 'Release')}</div>
                            <div class="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">${escapeHtml(releaseTracks.length || declaredTrackCount || 0)} tracks${release.publishedAt ? ` | ${escapeHtml((release.publishedAt || '').slice(0, 4))}` : ''}</div>
                            <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-300">${escapeHtml(release.description || 'Play this release privately or add tracks to the temporary list.')}</p>
                            ${missingTrackCount > 0
                                ? `<p class="mt-2 text-xs text-amber-200">${escapeHtml(missingTrackCount)} track${missingTrackCount === 1 ? '' : 's'} could not be resolved yet.</p>`
                                : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-start gap-2 md:items-end">
                        <div class="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">${status === 'loading' ? 'Loading release' : 'Private release view'}</div>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="playPrivateSessionOnlineCollection('release','ordered').catch(() => {})" ${playableCount ? '' : 'disabled'} class="rounded-xl border border-teal-300/30 bg-teal-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-teal-50 transition hover:bg-teal-500/25 ${playableCount ? '' : 'cursor-not-allowed opacity-50'}">Play Release</button>
                            <button type="button" onclick="playPrivateSessionOnlineCollection('release','shuffle').catch(() => {})" ${playableCount ? '' : 'disabled'} class="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-white/15 ${playableCount ? '' : 'cursor-not-allowed opacity-50'}">Shuffle</button>
                            <button type="button" onclick="addPrivateSessionCollectionToTemporary('release')" ${releaseTracks.length ? '' : 'disabled'} class="rounded-xl border border-amber-400/30 bg-amber-500/12 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-500/22 ${releaseTracks.length ? '' : 'cursor-not-allowed opacity-50'}">Add Release Temp</button>
                        </div>
                    </div>
                </div>
            </div>
            ${status === 'error'
                ? `<div class="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">${escapeHtml(privateState.browserReleaseError || 'Unable to load this release right now.')}</div>`
                : ''}
            ${status === 'loading' && !releaseTracks.length
                ? '<div class="rounded-2xl border border-teal-300/15 bg-slate-950/45 px-4 py-5 text-sm text-slate-300">Loading release tracks privately...</div>'
                : (releaseTracks.length
                    ? `<div class="space-y-3">${renderPrivateSessionOnlineTrackRows(releaseTracks, { collectionKey: 'release' })}</div>`
                    : '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-6 text-xs text-slate-300">No playable tracks were found for this release.</div>')}
        </div>
    `;
}

function renderPrivateSessionOnlineResults() {
    const privateState = getPrivateSessionState();
    if (privateState.onlineView === 'artist') return renderPrivateSessionOnlineArtistView();
    if (privateState.onlineView === 'release') return renderPrivateSessionOnlineReleaseView();
    return renderPrivateSessionOnlineSearchView();
}

function renderPrivateSessionPlaylists() {
    const privateState = getPrivateSessionState();
    if (!privateState.playlists.length) {
        return '<div class="rounded-2xl border border-dashed border-teal-400/20 bg-slate-950/40 px-4 py-6 text-xs text-slate-300">Playlist imports will stay here temporarily while private mode is active.</div>';
    }
    return privateState.playlists.map((playlist) => `
        <div class="rounded-2xl border border-teal-400/15 bg-slate-950/55 px-4 py-4">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="truncate text-sm font-black text-white">${escapeHtml(playlist.title || 'Playlist')}</div>
                    <div class="mt-1 text-[11px] text-slate-300">${Math.max(0, Number(playlist.trackCount) || 0)} songs</div>
                </div>
                <button onclick="removePrivateSessionPlaylist('${escapeHtml(playlist.id)}')" class="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100 transition hover:bg-rose-500/20">Remove</button>
            </div>
            <div class="mt-3 space-y-2">
                ${(Array.isArray(playlist.tracks) ? playlist.tracks.slice(0, 5) : []).map((track) => `
                    <button onclick="playPrivateSessionTrack('${escapeHtml(track.id)}','playlist:${escapeHtml(playlist.id)}')" class="flex w-full items-center justify-between rounded-xl border border-teal-400/10 bg-slate-900/70 px-3 py-2 text-left text-[11px] text-slate-100 transition hover:border-teal-300/30">
                        <span class="truncate">${escapeHtml(track.title || 'Untitled')}</span>
                        <span class="ml-2 shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-teal-100/80">${escapeHtml(getPrivateSessionTrackActionLabel(track.id))}</span>
                    </button>
                `).join('')}
                ${(Array.isArray(playlist.tracks) ? playlist.tracks.length : 0) > 5
                    ? `<div class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">+${playlist.tracks.length - 5} more in this private playlist</div>`
                    : ''}
            </div>
        </div>
    `).join('');
}

function renderPrivateSessionCollections() {
    const temporaryEl = document.getElementById('private-session-temporary-list');
    const onlineEl = document.getElementById('private-session-online-results');
    const playlistsEl = document.getElementById('private-session-playlists-list');
    if (temporaryEl) temporaryEl.innerHTML = renderPrivateSessionTemporaryList();
    if (onlineEl) onlineEl.innerHTML = renderPrivateSessionOnlineResults();
    if (playlistsEl) playlistsEl.innerHTML = renderPrivateSessionPlaylists();
    const privateState = getPrivateSessionState();
    setPrivateSessionFeedback(privateState.feedback || '', privateState.feedbackTone || 'info');
    syncPrivateSessionClock();
    syncPrivateSessionModeUi();
    syncPrivateSessionPlayerDeck();
    refreshLucideIcons();
}

function renderPrivateSessionPage() {
    const container = els.tracksContainer;
    if (!container) return;
    const emptyEl = document.getElementById('empty-state');
    const hub = document.getElementById('video-url-hub');
    const onlineMusicHub = document.getElementById('online-music-hub');
    const privateState = getPrivateSessionState();
    const temporaryTracks = getPrivateSessionTemporaryListTracks();
    const temporaryCount = temporaryTracks.length;
    const playlistCount = Math.max(0, Number((privateState.playlists || []).length || 0));
    const searchCount = Math.max(0, Number((privateState.searchResults || []).length || 0));
    const privateViewLabel = sanitizeText((privateState.onlineView || 'search').replace('-', ' '));
    if (hub) hub.classList.add('hidden');
    if (onlineMusicHub) onlineMusicHub.classList.add('hidden');
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.classList.remove('flex');
    }
    container.className = 'w-full pb-40 pt-4';
    container.classList.remove('multi-select-active');
    container.innerHTML = `
        <div id="private-session-page" class="w-full max-w-[1500px] mx-auto animate-pop-in">
            <div class="private-route-shell rounded-lg p-3 md:p-5">
                <div class="flex flex-col gap-4">
                    <section class="private-route-hero rounded-lg p-4 md:p-5">
                        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div class="min-w-0">
                                <div class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] private-route-pill">
                                    <i data-lucide="shield" class="h-4 w-4"></i>
                                    Private Mode
                                </div>
                                <h2 class="mt-4 text-3xl font-black tracking-normal text-white md:text-5xl">NexPlay Vault</h2>
                                <div class="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-stone-300">
                                    <span class="border-l border-rose-200/25 pl-3">${temporaryCount} temp track${temporaryCount === 1 ? '' : 's'}</span>
                                    <span class="border-l border-rose-200/25 pl-3">${searchCount} search result${searchCount === 1 ? '' : 's'}</span>
                                    <span class="border-l border-rose-200/25 pl-3">${playlistCount} playlist${playlistCount === 1 ? '' : 's'}</span>
                                </div>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span id="private-session-clock" class="rounded-lg border border-rose-200/15 bg-black/50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-50">Session 00:00</span>
                                <button id="private-session-exit-btn" onclick="clearPrivateSessionRoute({ quiet: false, preserveScroll: true })" class="rounded-lg border border-rose-400/30 bg-rose-500/12 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-500/22">Exit</button>
                            </div>
                        </div>
                    </section>
                    ${renderPrivateSessionPlayerDeck()}
                    <div id="private-session-feedback" class="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-50">Private mode is active. Songs, searches, and playlists stay in memory only.</div>
                    <section class="private-route-panel rounded-lg p-4 md:p-5">
                        <div class="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <div class="space-y-4">
                                <div>
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/80">Intake</div>
                                    <div class="mt-3 flex flex-wrap gap-2">
                                        <button id="private-session-import-btn" onclick="requestPrivateSessionImport()" class="rounded-lg border border-rose-300/25 bg-rose-500/14 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-rose-50 transition hover:bg-rose-500/24">Import Songs</button>
                                        <button onclick="addPrivateSessionCollectionToTemporary('${escapeHtml(privateState.onlineView || 'search')}')" class="rounded-lg border border-orange-300/25 bg-orange-500/12 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-orange-100 transition hover:bg-orange-500/22">Add View</button>
                                    </div>
                                </div>
                                <div class="border-t border-white/10 pt-4">
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/80">Playlist</div>
                                    <div class="mt-3 flex flex-col gap-2 md:flex-row">
                                        <input id="private-session-playlist-url-input" type="text" value="${escapeHtml(privateState.playlistInput || '')}" oninput="setPrivateSessionUiField('playlistInput', this.value)" onkeydown="if (event.key === 'Enter') { event.preventDefault(); importPrivateSessionPlaylistFromInput(this.value).catch(() => {}); }" placeholder="YouTube playlist URL or ID" class="private-route-input min-w-0 flex-1 rounded-lg border px-4 py-3 text-xs placeholder:text-stone-500 focus:border-rose-300/60 focus:outline-none">
                                        <button id="private-session-playlist-import-btn" onclick="importPrivateSessionPlaylistFromInput(document.getElementById('private-session-playlist-url-input')?.value || '').catch(() => {})" class="rounded-lg border border-orange-300/25 bg-orange-500/12 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-orange-100 transition hover:bg-orange-500/22">Import</button>
                                    </div>
                                </div>
                            </div>
                            <div class="space-y-4">
                                <div>
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/80">Online Search</div>
                                    <div class="mt-3 flex flex-col gap-2 md:flex-row">
                                        <input id="private-session-search-input" type="text" value="${escapeHtml(privateState.searchQuery || '')}" oninput="setPrivateSessionUiField('searchQuery', this.value)" onkeydown="if (event.key === 'Enter') { event.preventDefault(); searchPrivateSessionOnlineMusic().catch(() => {}); }" placeholder="Search songs, artists, live versions, remixes" class="private-route-input min-w-0 flex-1 rounded-lg border px-4 py-3 text-sm placeholder:text-stone-500 focus:border-rose-300/60 focus:outline-none">
                                        <button id="private-session-search-btn" onclick="searchPrivateSessionOnlineMusic().catch(() => {})" class="rounded-lg border border-rose-300/25 bg-rose-500/14 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-rose-50 transition hover:bg-rose-500/24">Search</button>
                                    </div>
                                </div>
                                <div class="grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center">
                                    <div>
                                        <div class="text-2xl font-black text-white">${temporaryCount}</div>
                                        <div class="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500">Temp</div>
                                    </div>
                                    <div>
                                        <div class="text-2xl font-black text-white">${searchCount}</div>
                                        <div class="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500">Results</div>
                                    </div>
                                    <div>
                                        <div class="text-2xl font-black text-white">${playlistCount}</div>
                                        <div class="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500">Lists</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
                        <section class="private-route-panel rounded-lg p-4 md:p-5">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/80">Temporary Queue</div>
                                    <div class="mt-1 text-sm text-stone-300">${temporaryCount} track${temporaryCount === 1 ? '' : 's'} loaded</div>
                                </div>
                                <span class="rounded-full border border-rose-200/15 bg-black/50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-50">Memory</span>
                            </div>
                            <div id="private-session-temporary-list" class="space-y-2"></div>
                        </section>
                        <section class="private-route-panel rounded-lg p-4 md:p-5">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/80">Private Playlists</div>
                                <span class="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500">${playlistCount} imported</span>
                            </div>
                            <div id="private-session-playlists-list" class="space-y-3"></div>
                        </section>
                    </div>
                    <section class="private-route-panel rounded-lg p-4 md:p-5">
                        <div class="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-rose-100/80">Online Vault</div>
                                <div class="mt-1 text-sm text-stone-300">${escapeHtml(privateViewLabel)} view</div>
                            </div>
                            <span class="rounded-full border border-rose-200/15 bg-black/50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-50">${searchCount} results</span>
                        </div>
                        <div id="private-session-online-results" class="space-y-2"></div>
                    </section>
                </div>
            </div>
        </div>
    `;
    renderPrivateSessionCollections();
}


function getConfiguredSeekStepSeconds(multiplier = 1) {
    return clampNumber(getAppSettings().playback.seekStepSeconds, 2, 30, 5) * multiplier;
}

function getPreferredPlaybackSpeedForTrack(track = null) {
    const prefs = getAppSettings().playback;
    return track?.type === 'video' ? prefs.speedVideo : prefs.speedAudio;
}

function shouldUseLocalResume(duration = 0) {
    const prefs = getAppSettings().resume;
    return isFeatureEnabled(FEATURE_REGISTRY.core_universal_resume)
        && !!prefs.localEnabled
        && Number(duration || 0) >= Number(prefs.minimumDurationSeconds || 0);
}

function shouldUseOnlineResume() {
    const prefs = getAppSettings().resume;
    return isFeatureEnabled(FEATURE_REGISTRY.core_universal_resume)
        && !!prefs.onlineEnabled;
}

function getCurrentVideoTrack(track = null) {
    const candidate = track || getCurrentTrack();
    return candidate?.type === 'video' ? candidate : null;
}

function getVideoFilterStoreKeys(track = null) {
    const videoTrack = getCurrentVideoTrack(track);
    if (!videoTrack) return [];
    const keys = [];
    getTrackMetadataKeys(videoTrack).forEach((key) => {
        if (key) keys.push(`meta:${key}`);
    });
    if (typeof videoTrack.url === 'string' && videoTrack.url && !videoTrack.url.startsWith('blob:')) {
        keys.push(`url:${videoTrack.url}`);
    }
    const fallbackTitle = sanitizeText(videoTrack.title || '').toLowerCase();
    const fallbackArtist = sanitizeText(videoTrack.artist || '').toLowerCase();
    if (fallbackTitle || fallbackArtist) {
        keys.push(`track:${fallbackArtist}|${fallbackTitle}|video`);
    }
    return Array.from(new Set(keys.filter(Boolean)));
}

function getStoredVideoAdjustments(track = null) {
    const keys = getVideoFilterStoreKeys(track);
    for (const key of keys) {
        const entry = state.videoFilterStore?.[key];
        if (entry) {
            return {
                sharpness: clampNumber(entry.sharpness, 0, 1, 0),
                brightness: clampNumber(entry.brightness, 0.5, 1.5, 1),
                contrast: clampNumber(entry.contrast, 0.5, 1.5, 1)
            };
        }
    }
    return null;
}

function syncVideoFilterSliderUI() {
    const sharpSlider = document.getElementById('sharpnessSlider');
    const brightSlider = document.getElementById('brightnessSlider');
    const contrastSlider = document.getElementById('contrastSlider');
    if (sharpSlider) sharpSlider.value = String(Math.round(clampNumber(state.videoSharpness, 0, 1, 0) * 100));
    if (brightSlider) brightSlider.value = String(Math.round((clampNumber(state.videoBrightness, 0.5, 1.5, 1) - 0.5) * 100));
    if (contrastSlider) contrastSlider.value = String(Math.round((clampNumber(state.videoContrast, 0.5, 1.5, 1) - 0.5) * 100));
}

function applyVideoSettingsRuntime() {
    const prefs = getAppSettings().video;
    document.documentElement.style.setProperty('--video-lyric-safe-offset', `${prefs.lyricSafeOffsetPx}px`);
}

function persistRememberedVideoAdjustments(track = null) {
    const prefs = getAppSettings().video;
    const videoTrack = getCurrentVideoTrack(track);
    if (!prefs.rememberPerVideoAdjustments || !videoTrack) return false;
    const keys = getVideoFilterStoreKeys(videoTrack);
    if (!keys.length) return false;
    const payload = {
        sharpness: clampNumber(state.videoSharpness, 0, 1, 0),
        brightness: clampNumber(state.videoBrightness, 0.5, 1.5, 1),
        contrast: clampNumber(state.videoContrast, 0.5, 1.5, 1),
        updatedAt: Date.now()
    };
    keys.forEach((key) => {
        state.videoFilterStore[key] = { ...payload };
    });
    if (videoFilterPersistTimer) clearTimeout(videoFilterPersistTimer);
    videoFilterPersistTimer = setTimeout(() => {
        persistExtendedStores();
        videoFilterPersistTimer = null;
    }, 120);
    return true;
}

function applyRememberedVideoAdjustments(track = null) {
    const prefs = getAppSettings().video;
    const remembered = prefs.rememberPerVideoAdjustments ? getStoredVideoAdjustments(track) : null;
    const next = remembered || { sharpness: 0, brightness: 1, contrast: 1 };
    applyVideoSharpness(next.sharpness, { persist: false });
    applyVideoBrightness(next.brightness, { persist: false });
    applyVideoContrast(next.contrast, { persist: false });
    syncVideoFilterSliderUI();
}

function closeAutoManagedVideoPiP() {
    if (!autoManagedVideoPiP || document.pictureInPictureElement !== els.audio || typeof document.exitPictureInPicture !== 'function') return;
    autoManagedVideoPiP = false;
    const result = document.exitPictureInPicture();
    if (result && typeof result.catch === 'function') result.catch(() => {});
}

async function maybeAutoOpenVideoPiP(track = null) {
    const prefs = getAppSettings().video;
    const videoTrack = getCurrentVideoTrack(track);
    const videoEl = els.audio;
    if (prefs.pipBehavior !== 'auto_on_video_mode' || !state.videoFsModeActive || !videoTrack || !videoEl) return false;
    if (!document.pictureInPictureEnabled || typeof videoEl.requestPictureInPicture !== 'function' || videoEl.readyState < 1) return false;
    if (document.pictureInPictureElement === videoEl) {
        autoManagedVideoPiP = true;
        return true;
    }
    try {
        if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') {
            await document.exitPictureInPicture().catch(() => {});
        }
        await videoEl.requestPictureInPicture();
        autoManagedVideoPiP = true;
        return true;
    } catch (_) {
        return false;
    }
}

function maybeApplyVideoModeDefaults(track = null) {
    const prefs = getAppSettings().video;
    const videoTrack = getCurrentVideoTrack(track);
    if (!state.videoFsModeActive || !videoTrack) return;
    if (prefs.fullscreenBehavior === 'immersive_fullscreen' && !document.fullscreenElement) {
        try {
            const request = els.videoFsModeOverlay?.requestFullscreen?.();
            if (request && typeof request.catch === 'function') request.catch(() => {});
        } catch (_) {}
    }
    maybeAutoOpenVideoPiP(videoTrack);
}

function shouldAutoEnterVideoMode(track = null, autoPlay = true) {
    const videoTrack = getCurrentVideoTrack(track);
    if (!videoTrack || !autoPlay) return false;
    return getAppSettings().video.fullscreenBehavior !== 'manual';
}

function setAppSettingValue(section, key, value, options = {}) {
    const opts = { persist: true, rerenderSettings: false, syncViewMode: false, ...options };
    const current = getAppSettings();
    if (!current[section]) return;
    state.appSettings = sanitizeAppSettings({
        ...current,
        [section]: {
            ...current[section],
            [key]: value
        }
    });
    applyAppSettings({ persist: opts.persist, syncViewMode: opts.syncViewMode });
    if (opts.rerenderSettings && state.activeTab === 'settings') renderSettingsTab();
}

function isLibraryBrowseTab(tabId = state.activeTab) {
    return ['all', 'audio', 'videos', 'favorites'].includes(tabId);
}

function filterOnlineTracksForLibraryBrowse(list) {
    if (!Array.isArray(list) || !list.length) return list;
    if (!isLibraryBrowseTab()) return list;
    const savedLibraryTracks = list.filter((track) => track && (!isOnlineMusicTrackRecord(track) || !!getSavedOnlineTrack(track.id)));
    if (getAppSettings().library.showOnlineInLibrary !== false) return savedLibraryTracks;
    return savedLibraryTracks.filter((track) => track && !isOnlineMusicTrackRecord(track));
}

function syncLibraryOnlineToggleButton() {
    const btn = document.getElementById('library-toggle-online-btn');
    const label = document.getElementById('library-toggle-online-label');
    if (!btn) return;
    const show = getAppSettings().library.showOnlineInLibrary !== false;
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? 'Streaming tracks are shown in the library. Click to hide.' : 'Streaming tracks are hidden in the library. Click to show.');
    if (label) label.textContent = show ? 'Online on' : 'Online off';
    btn.classList.toggle('library-online-active', show);
    if (!show) {
        btn.classList.remove('border-cyan-500/50', 'text-cyan-100', 'bg-cyan-500/5');
    }
}

function toggleShowOnlineInLibrary() {
    const show = getAppSettings().library.showOnlineInLibrary !== false;
    setAppSettingValue('library', 'showOnlineInLibrary', !show);
    syncLibraryOnlineToggleButton();
    if (isLibraryBrowseTab()) {
        renderTracks({ preserveScroll: true });
    }
    refreshLucideIcons();
}

function formatElapsedSince(ts) {
    const time = Number(ts || 0);
    if (!Number.isFinite(time) || time <= 0) return 'just now';
    const deltaSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    const deltaMin = Math.floor(deltaSec / 60);
    if (deltaMin < 60) return `${deltaMin}m ago`;
    const deltaHr = Math.floor(deltaMin / 60);
    if (deltaHr < 24) return `${deltaHr}h ago`;
    const deltaDay = Math.floor(deltaHr / 24);
    return `${deltaDay}d ago`;
}

function getListeningHistoryTotalSeconds(history = state.listeningHistory) {
    if (!history || typeof history !== 'object') return 0;
    return Object.values(history).reduce((total, rawSeconds) => {
        const seconds = Number(rawSeconds);
        return total + (Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    }, 0);
}

function restoreTotalListeningTime(payload = {}) {
    const persistedTotal = Number(payload?.totalListeningTime);
    const derivedTotal = getListeningHistoryTotalSeconds(payload?.listeningHistory);
    state.totalListeningTime = Math.max(
        Number.isFinite(persistedTotal) && persistedTotal > 0 ? persistedTotal : 0,
        derivedTotal
    );
    return state.totalListeningTime;
}

	        function buildPersistedAppStatePayload({ trimHistory = false } = {}) {
	            return {
	                volume: state.volume,
        isDarkMode: state.isDarkMode,
        viewMode: state.viewMode,
        sortType: state.sortType,
        sortDirection: state.sortDirection,
        playbackSpeed: state.playbackSpeed,
        accentColor: state.accentColor,
        visualizerStyle: state.visualizerStyle,
        crossfadeDuration: state.crossfadeDuration,
        keyBindings: state.keyBindings,
        playHistory: trimHistory ? [] : (state.playHistory || []),
        listeningHistory: trimHistory ? {} : (state.listeningHistory || {}),
	        // Keep the aggregate even when detailed history must be trimmed to
	        // recover from a storage-quota failure.
	        totalListeningTime: Math.max(0, Number(state.totalListeningTime) || 0),
        autoAccentFromArt: state.autoAccentFromArt,
        autoQueueEnabled: state.autoQueueEnabled,
        notyPad: sanitizeNotyPadState(state.notyPad || createDefaultNotyPadState()),
        appSettings: sanitizeAppSettings(state.appSettings || createDefaultAppSettings()),
	                themeMode: sanitizeAppSettings(state.appSettings || createDefaultAppSettings()).appearance.themeMode
	            };
	        }

	        function sanitizeRuntimeSourceMode(mode = '') {
	            const clean = sanitizeText(mode || '').toLowerCase();
	            return clean === 'online-music' ? 'online-music' : 'local';
	        }

	        function buildSessionSnapshotPayload() {
	            const online = getOnlineMusicState();
	            const sourceMode = sanitizeRuntimeSourceMode(state.currentPlaybackSource || 'local');
	            const currentTime = sourceMode === 'online-music'
	                ? Math.max(0, Number(online.currentTime || 0))
	                : Math.max(0, Number(els.audio?.currentTime || 0));
	            const payload = {
	                schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
	                updatedAt: Date.now(),
	                sourceMode,
	                activeQueueType: activeQueueType === 'video' ? 'video' : 'audio',
	                currentTrackId: sanitizeText(state.currentTrackId || ''),
	                currentTime,
	                volume: clamp(state.volume, 0, 1),
	                repeatMode: isRepeatModeValid(state.repeatMode) ? state.repeatMode : 'none',
	                isShuffle: !!state.isShuffle,
	                queueSource: sanitizeText(state.queueSource || 'auto') || 'auto',
	                queue: normalizeQueueTrackIds(state.queue, 'video'),
	                shuffleQueue: normalizeQueueTrackIds(state.shuffleQueue, 'video'),
	                shuffleIndex: isValidNumber(state.shuffleIndex) ? Math.trunc(Number(state.shuffleIndex)) : -1,
	                audioQueue: {
	                    entries: safeArray(state.audioQueueState?.entries).map((entry) => sanitizeText(entry?.trackId || '')).filter(Boolean),
	                    currentIndex: isValidNumber(state.audioQueueState?.currentIndex) ? Math.trunc(Number(state.audioQueueState.currentIndex)) : -1,
	                    repeatMode: isRepeatModeValid(state.audioQueueState?.repeatMode) ? state.audioQueueState.repeatMode : 'none',
	                    isShuffle: !!state.audioQueueState?.isShuffle
	                },
	                onlineMusic: {
	                    currentTrackId: sanitizeText(online.currentTrackId || ''),
	                    currentTime: Math.max(0, Number(online.currentTime || 0)),
	                    duration: Math.max(0, Number(online.duration || 0)),
	                    volume: clampNumber(online.volume, 0, 100, 70),
	                    playbackContext: normalizeOnlineMusicPlaybackContext(online.playbackContext || 'library'),
	                    queueContextView: normalizeOnlineMusicPlaybackContext(online.queueContextView || online.playbackContext || 'library'),
	                    queueContextKey: sanitizeText(online.queueContextKey || ''),
	                    queueMode: online.queueMode === 'shuffle' ? 'shuffle' : 'ordered'
	                }
	            };
	            return payload;
	        }

	        function persistSessionSnapshot(options = {}) {
    if (shouldBypassStorageWriteForPrivateSession()) return false;
	            const opts = { reason: 'manual', throttleMs: 0, ...options };
	            const now = Date.now();
	            if (opts.throttleMs > 0 && now - lastSessionSnapshotPersistTs < Number(opts.throttleMs)) {
	                return false;
	            }
	            const payload = buildSessionSnapshotPayload();
	            const ok = writeStorageJson(SESSION_SNAPSHOT_KEY, payload);
	            if (ok) {
	                lastSessionSnapshotPersistTs = now;
	                const reason = sanitizeText(opts.reason || 'manual');
	                if (!reason.startsWith('progress-')) {
	                    logAction('session-snapshot-saved', 'Session snapshot persisted', {
	                        reason,
	                        sourceMode: payload.sourceMode,
	                        trackId: sanitizeText(payload.currentTrackId || '')
	                    });
	                }
	            }
	            return !!ok;
	        }

	        function markSessionRuntimeActive() {
	            return writeStorageJson(SESSION_RUNTIME_FLAG_KEY, {
	                schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
	                active: true,
	                startedAt: Date.now(),
	                trackId: sanitizeText(state.currentTrackId || '')
	            });
	        }

	        function markSessionRuntimeInactive(reason = 'normal-unload') {
	            return writeStorageJson(SESSION_RUNTIME_FLAG_KEY, {
	                schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
	                active: false,
	                endedAt: Date.now(),
	                reason: sanitizeText(reason || 'normal-unload')
	            });
	        }

	        function detectAbnormalPreviousExit() {
	            const runtimeFlag = readStorageJson(SESSION_RUNTIME_FLAG_KEY, null);
	            const wasActive = !!runtimeFlag?.active;
	            state.lastSessionAbnormalExit = wasActive;
	            return wasActive;
	        }

	        async function restoreSessionSnapshotSafely(options = {}) {
	            const opts = { safeMode: false, ...options };
	            logAction('session-restore-start', 'Session restore started', {
	                safeMode: !!opts.safeMode
	            });
	            const snapshot = readStorageJson(SESSION_SNAPSHOT_KEY, null);
	            if (!snapshot || typeof snapshot !== 'object') {
	                logAction('session-restore-empty', 'No prior session snapshot was available');
	                return false;
	            }
	            const repairs = [];
	            const repaired = (message, details = null) => {
	                repairs.push({ message, details });
	            };
	            const snapshotVolume = Number(snapshot.volume);
	            if (isValidNumber(snapshotVolume)) {
	                state.volume = clamp(snapshotVolume, 0, 1);
	            } else if (snapshot.volume != null) {
	                repaired('Ignored invalid saved volume');
	            }
	            if (typeof snapshot.isShuffle === 'boolean') {
	                state.isShuffle = snapshot.isShuffle;
	            } else if (snapshot.isShuffle != null) {
	                repaired('Ignored invalid saved shuffle flag');
	            }
	            state.repeatMode = isRepeatModeValid(snapshot.repeatMode) ? snapshot.repeatMode : state.repeatMode;
	            if (!isRepeatModeValid(snapshot.repeatMode) && snapshot.repeatMode != null) {
	                repaired('Ignored invalid saved repeat mode', { repeatMode: sanitizeText(snapshot.repeatMode || '') });
	            }
	            const savedQueue = normalizeQueueTrackIds(snapshot.queue, 'video');
	            if (Array.isArray(snapshot.queue) && savedQueue.length !== snapshot.queue.length) {
	                repaired('Sanitized invalid saved queue entries', {
	                    previousLength: safeArray(snapshot.queue).length,
	                    nextLength: savedQueue.length
	                });
	            }
	            state.queue = savedQueue;
	            state.queueSource = sanitizeText(snapshot.queueSource || state.queueSource || 'auto') || 'auto';
	            state.shuffleQueue = normalizeQueueTrackIds(snapshot.shuffleQueue, 'video');
	            state.shuffleIndex = isValidNumber(snapshot.shuffleIndex)
	                ? Math.trunc(clamp(snapshot.shuffleIndex, -1, Math.max(state.shuffleQueue.length - 1, -1)))
	                : -1;
	            state.videoQueueState.queue = state.queue.slice();
	            state.videoQueueState.queueSource = state.queueSource;
	            state.videoQueueState.isShuffle = !!state.isShuffle;
	            state.videoQueueState.repeatMode = state.repeatMode;
	            state.videoQueueState.shuffleQueue = state.shuffleQueue.slice();
	            state.videoQueueState.shuffleIndex = state.shuffleIndex;
	            state.audioQueueState.queueSource = state.queueSource;
	            state.audioQueueState.isShuffle = !!state.isShuffle;
	            state.audioQueueState.repeatMode = state.repeatMode;
	            const restoredAudioIds = safeArray(snapshot.audioQueue?.entries)
	                .map((trackId) => sanitizeText(trackId || ''))
	                .filter(Boolean);
	            if (restoredAudioIds.length) {
	                const restoredEntries = restoredAudioIds
	                    .map((trackId) => resolveQueueDisplayTrack(trackId))
	                    .filter((track) => track && track.type !== 'video')
	                    .map((track) => buildAudioQueueEntrySnapshot(track))
	                    .filter(Boolean);
	                if (restoredEntries.length) {
	                    state.audioQueueState.entries = restoredEntries;
	                    state.audioQueueState.currentIndex = isValidNumber(snapshot.audioQueue?.currentIndex)
	                        ? Math.trunc(clamp(snapshot.audioQueue.currentIndex, 0, restoredEntries.length - 1))
	                        : 0;
	                    state.audioQueueState.isShuffle = !!snapshot.audioQueue?.isShuffle;
	                    state.audioQueueState.repeatMode = isRepeatModeValid(snapshot.audioQueue?.repeatMode)
	                        ? snapshot.audioQueue.repeatMode
	                        : state.audioQueueState.repeatMode;
	                } else {
	                    repaired('Ignored invalid saved audio queue entries');
	                }
	            }
	            const savedMode = snapshot.activeQueueType === 'video' ? 'video' : 'audio';
	            loadQueueBucket(savedMode);
	            const sourceMode = opts.safeMode ? 'local' : sanitizeRuntimeSourceMode(snapshot.sourceMode || 'local');
	            state.currentPlaybackSource = sourceMode;
	            const restoredTrackId = sanitizeText(snapshot.currentTrackId || '');
	            const restoredTrack = restoredTrackId
	                ? (resolveQueueDisplayTrack(restoredTrackId) || state.tracks.find((track) => track?.id === restoredTrackId) || null)
	                : null;
	            if (restoredTrack) {
	                if (sourceMode === 'online-music' && restoredTrack.source === 'online-music') {
	                    const onlineSnapshot = snapshot.onlineMusic || {};
	                    const startTime = Math.max(0, Number(onlineSnapshot.currentTime || snapshot.currentTime || 0));
	                    const restoredOnlineTrack = sanitizeStoredOnlineMusicTrack(restoredTrack);
	                    if (restoredOnlineTrack) {
	                        const online = getOnlineMusicState();
	                        online.currentTrackId = restoredOnlineTrack.id;
	                        online.currentTrack = { ...restoredOnlineTrack, resumePosition: 0, resumeUpdatedAt: 0 };
	                        online.currentTime = startTime;
	                        online.duration = Math.max(0, Number(onlineSnapshot.duration || restoredOnlineTrack.duration || 0) || 0);
	                        online.isPlaying = false;
	                        online.playbackContext = normalizeOnlineMusicPlaybackContext(onlineSnapshot.playbackContext || 'library');
	                        online.queueContextView = normalizeOnlineMusicPlaybackContext(onlineSnapshot.queueContextView || onlineSnapshot.playbackContext || 'library');
	                        online.queueContextKey = sanitizeText(onlineSnapshot.queueContextKey || '');
	                        online.queueMode = onlineSnapshot.queueMode === 'shuffle' ? 'shuffle' : 'ordered';
	                        state.currentTrackId = restoredOnlineTrack.id;
	                        state.currentTrack = { ...restoredOnlineTrack, resumePosition: 0, resumeUpdatedAt: 0 };
	                        state.isPlaying = false;
	                        window.setTimeout(() => {
	                            playOnlineMusicTrack(restoredOnlineTrack.id, {
	                                autoplay: false,
	                                startTime,
	                                playbackContext: online.playbackContext,
	                                queueContextView: online.queueContextView,
	                                queueContextKey: online.queueContextKey,
	                                queueMode: online.queueMode,
	                                trackSnapshot: restoredOnlineTrack
	                            }).catch((error) => {
	                                logError('session-restore-online-cue-failed', 'Online track restore cue failed after startup render', {
	                                    trackId: sanitizeText(restoredOnlineTrack.id || ''),
	                                    error: sanitizeText(error?.message || '')
	                                });
	                            });
	                        }, 0);
	                    } else {
	                        repaired('Online track restore failed; kept safe idle state', {
	                            trackId: restoredTrack.id
	                        });
	                    }
	                } else {
	                    loadTrack(restoredTrack.id, false, null);
	                    const targetTime = Math.max(0, Number(snapshot.currentTime || 0));
	                    if (targetTime > 0 && !opts.safeMode) {
	                        pendingResumeTime = targetTime;
	                        window.setTimeout(() => {
	                            if (state.currentTrackId !== restoredTrack.id || !pendingResumeTime) return;
	                            if (els.audio?.readyState >= 1) {
	                                const target = Math.min(pendingResumeTime, Math.max(0, getMediaDurationSafe(els.audio, restoredTrack.duration || 0) - 0.25));
	                                if (target > 1) safeSeekMedia(els.audio, target, { fallbackDuration: Number(restoredTrack.duration || 0) });
	                                pendingResumeTime = null;
	                            }
	                        }, 0);
	                    }
	                }
	            } else if (restoredTrackId) {
	                repaired('Saved current track was unavailable and was skipped', { trackId: restoredTrackId });
	            }
	            normalizeRuntimeState({ syncQueueViews: true, allowStopWhenQueueEmpty: false });
	            updateVolumeUI(state.volume);
	            if (els.audio) els.audio.volume = state.volume;
	            if (repairs.length) {
	                repairs.forEach((entry) => {
	                    logRecovery('session-restore-partial', entry.message, entry.details || null);
	                });
	                showInternalNotice('Recovered previous session with safe fallbacks.', 'warn');
	            } else {
	                logAction('session-restore-success', 'Session restore completed successfully');
	            }
	            scheduleDebugOverlayRefresh();
	            return true;
	        }

	        function persistAppStateNow() {
    if (shouldBypassStorageWriteForPrivateSession()) return false;
	            if (writePersistedAppState(buildPersistedAppStatePayload())) return true;
	            if (writePersistedAppState(buildPersistedAppStatePayload({ trimHistory: true }))) return true;
	            console.warn('Failed to persist nexplay_pro_state');
	            return false;
}

function getNotyPadState() {
    state.notyPad = sanitizeNotyPadState(state.notyPad || createDefaultNotyPadState());
    return state.notyPad;
}

function getNotyPadMetrics(text = '') {
    const safeText = String(text || '');
    const wordMatches = safeText.trim() ? safeText.trim().match(/\S+/g) : null;
    return {
        words: wordMatches ? wordMatches.length : 0,
        characters: safeText.length,
        lines: safeText.length ? safeText.split('\n').length : 1
    };
}

function renderNotyPadMetricBadges(metrics = getNotyPadMetrics()) {
    return [
        { label: 'Words', value: metrics.words },
        { label: 'Chars', value: metrics.characters },
        { label: 'Lines', value: metrics.lines }
    ].map((item) => `
        <span class="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-200">
            ${escapeHtml(item.label)} ${escapeHtml(Number(item.value || 0).toLocaleString())}
        </span>
    `).join('');
}

function renderNotyPadMetricRows(metrics = getNotyPadMetrics()) {
    return [
        { label: 'Words', value: metrics.words },
        { label: 'Characters', value: metrics.characters },
        { label: 'Lines', value: metrics.lines }
    ].map((item) => `
        <div class="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-3">
            <span class="text-xs uppercase tracking-[0.14em] text-gray-400">${escapeHtml(item.label)}</span>
            <span class="text-sm font-black text-white">${escapeHtml(Number(item.value || 0).toLocaleString())}</span>
        </div>
    `).join('');
}

function setNotyPadSaveStatus(message = '', tone = 'neutral') {
    const el = document.getElementById('notypad-save-status');
    if (!el) return;
    const toneClasses = {
        neutral: 'text-gray-300',
        pending: 'text-amber-200',
        saved: 'text-emerald-200',
        error: 'text-rose-200'
    };
    el.className = `text-sm font-semibold ${toneClasses[tone] || toneClasses.neutral}`;
    el.textContent = message;
}

function applyNotyPadEditorPreferences() {
    const note = getNotyPadState();
    const textarea = document.getElementById('notypad-textarea');
    if (textarea) {
        textarea.wrap = note.wrapLines ? 'soft' : 'off';
        textarea.style.whiteSpace = note.wrapLines ? 'pre-wrap' : 'pre';
        textarea.style.overflowX = note.wrapLines ? 'hidden' : 'auto';
        textarea.style.fontSize = `${note.fontSize}px`;
    }
    const fontLabel = document.getElementById('notypad-font-size-value');
    if (fontLabel) fontLabel.textContent = `${note.fontSize}px`;
}

function refreshNotyPadMeta(status = null) {
    const note = getNotyPadState();
    const metrics = getNotyPadMetrics(note.text);
    const summary = document.getElementById('notypad-quick-stats');
    const details = document.getElementById('notypad-live-counts');
    const titleMirror = document.getElementById('notypad-panel-title');
    const savedAt = document.getElementById('notypad-saved-at');
    if (summary) summary.innerHTML = renderNotyPadMetricBadges(metrics);
    if (details) details.innerHTML = renderNotyPadMetricRows(metrics);
    if (titleMirror) titleMirror.textContent = (note.title || '').trim() || 'Untitled Note';
    if (savedAt) savedAt.textContent = note.updatedAt ? new Date(note.updatedAt).toLocaleString() : 'Not saved yet';
    const defaultMessage = note.updatedAt ? `Auto-saved ${formatElapsedSince(note.updatedAt)}` : 'Auto-save ready';
    setNotyPadSaveStatus(status?.message || defaultMessage, status?.tone || (note.updatedAt ? 'saved' : 'neutral'));
    applyNotyPadEditorPreferences();
}

function persistNotyPadNow(options = {}) {
    const opts = { quiet: true, showToastOnSuccess: false, successMessage: 'NotyPad saved.', ...options };
    if (notyPadPersistTimer) {
        clearTimeout(notyPadPersistTimer);
        notyPadPersistTimer = null;
    }
    const note = getNotyPadState();
    note.updatedAt = Date.now();
    state.notyPad = note;
    const ok = persistAppStateNow();
    if (ok) {
        refreshNotyPadMeta({ message: `Auto-saved ${formatElapsedSince(note.updatedAt)}`, tone: 'saved' });
        if (opts.showToastOnSuccess) showToast(opts.successMessage, 'success');
        return true;
    }
    refreshNotyPadMeta({ message: 'Save failed. Free some local storage and try again.', tone: 'error' });
    if (!opts.quiet) showToast('NotyPad could not save locally. Free some browser storage and try again.', 'error');
    return false;
}

function scheduleNotyPadPersist() {
    if (notyPadPersistTimer) clearTimeout(notyPadPersistTimer);
    refreshNotyPadMeta({ message: 'Saving...', tone: 'pending' });
    notyPadPersistTimer = setTimeout(() => {
        notyPadPersistTimer = null;
        persistNotyPadNow({ quiet: true });
    }, 220);
}

function updateNotyPadTitle(value = '') {
    const note = getNotyPadState();
    note.title = String(value || '').replace(/[<>]/g, '').replace(/[\r\n]+/g, ' ').slice(0, 120);
    state.notyPad = note;
    refreshNotyPadMeta({ message: 'Saving...', tone: 'pending' });
    scheduleNotyPadPersist();
}

function updateNotyPadText(value = '') {
    const note = getNotyPadState();
    note.text = String(value || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
    state.notyPad = note;
    refreshNotyPadMeta({ message: 'Saving...', tone: 'pending' });
    scheduleNotyPadPersist();
}

function toggleNotyPadWrap(checked) {
    const note = getNotyPadState();
    note.wrapLines = !!checked;
    state.notyPad = note;
    applyNotyPadEditorPreferences();
    persistNotyPadNow({ quiet: true });
}

function setNotyPadFontSize(value) {
    const note = getNotyPadState();
    note.fontSize = clampNumber(value, 13, 28, 16);
    state.notyPad = note;
    applyNotyPadEditorPreferences();
    persistNotyPadNow({ quiet: true });
}

function replaceNotyPadSelection(insertText = '') {
    const textarea = document.getElementById('notypad-textarea');
    if (!textarea) return;
    const start = Number(textarea.selectionStart ?? textarea.value.length);
    const end = Number(textarea.selectionEnd ?? start);
    const nextValue = `${textarea.value.slice(0, start)}${insertText}${textarea.value.slice(end)}`;
    textarea.value = nextValue;
    const nextCursor = start + insertText.length;
    textarea.selectionStart = nextCursor;
    textarea.selectionEnd = nextCursor;
    textarea.focus();
    updateNotyPadText(nextValue);
}

function insertNotyPadTimestamp() {
    replaceNotyPadSelection(`[${new Date().toLocaleString()}] `);
}

async function copyNotyPadText() {
    const note = getNotyPadState();
    if (!note.text) {
        showToast('NotyPad is empty.', 'info');
        return false;
    }
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(note.text);
        } else {
            const textarea = document.getElementById('notypad-textarea');
            if (!textarea) throw new Error('Clipboard unavailable.');
            const selectionStart = textarea.selectionStart;
            const selectionEnd = textarea.selectionEnd;
            textarea.focus();
            textarea.select();
            const copied = document.execCommand('copy');
            textarea.selectionStart = selectionStart;
            textarea.selectionEnd = selectionEnd;
            if (!copied) throw new Error('Clipboard unavailable.');
        }
        showToast('NotyPad copied to clipboard.', 'success');
        return true;
    } catch (err) {
        showToast('Could not copy the note.', 'error');
        return false;
    }
}

function downloadNotyPadText() {
    const note = getNotyPadState();
    if (!note.text) {
        showToast('NotyPad is empty.', 'info');
        return null;
    }
    const fileBase = (note.title || 'notypad-note')
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60) || 'notypad-note';
    const blob = new Blob([note.text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileBase}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('NotyPad exported as TXT.', 'success');
    return true;
}

function clearNotyPad() {
    const note = getNotyPadState();
    if (!note.title && !note.text) {
        showToast('NotyPad is already empty.', 'info');
        return;
    }
    if (!window.confirm('Clear the current NotyPad note? This cannot be undone.')) return;
    state.notyPad = sanitizeNotyPadState({
        ...createDefaultNotyPadState(),
        updatedAt: Date.now()
    });
    if (state.activeTab === 'notypad') renderNotyPadTab();
    persistNotyPadNow({ quiet: false });
    showToast('NotyPad cleared.', 'info');
}

function handleNotyPadKeydown(event) {
    if (!event) return;
    if ((event.metaKey || event.ctrlKey) && event.key && event.key.toLowerCase() === 's') {
        event.preventDefault();
        persistNotyPadNow({ quiet: false, showToastOnSuccess: true });
        return;
    }
    if (event.key === 'Tab') {
        event.preventDefault();
        replaceNotyPadSelection('    ');
    }
}

function renderNotyPadTab() {
    const container = els.tracksContainer;
    const emptyEl = document.getElementById('empty-state');
    const hub = document.getElementById('video-url-hub');
    const onlineMusicHub = document.getElementById('online-music-hub');
    const note = getNotyPadState();
    if (hub) hub.classList.add('hidden');
    if (onlineMusicHub) onlineMusicHub.classList.add('hidden');
    if (emptyEl) {
        emptyEl.classList.add('hidden');
        emptyEl.classList.remove('flex');
    }
    container.className = 'w-full pb-8 pt-4';
    container.classList.remove('multi-select-active');
    const displayTitle = (note.title || '').trim() || 'Untitled Note';
    const saveLabel = note.updatedAt ? `Auto-saved ${formatElapsedSince(note.updatedAt)}` : 'Auto-save ready';
    container.innerHTML = `
        <div id="notypad-page" class="w-full max-w-6xl mx-auto flex flex-col gap-6 animate-pop-in">
            <section class="holo-panel rounded-[1.75rem] p-5 md:p-6">
                <div class="flex flex-col gap-5">
                    <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div class="min-w-0 flex-1">
                            <div class="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/80">NotyPad</div>
                            <div class="mt-2 flex flex-col gap-4">
                                <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                    <label class="flex-1 text-xs text-gray-400">
                                        Note Title
                                        <input id="notypad-title-input" type="text" maxlength="120" value="${escapeHtml(note.title || '')}" oninput="updateNotyPadTitle(this.value)" placeholder="Untitled Note" class="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white placeholder-gray-500 outline-none transition focus:border-cyan-400/60 focus:bg-black/45">
                                    </label>
                                    <div id="notypad-quick-stats" class="flex flex-wrap gap-2">${renderNotyPadMetricBadges(getNotyPadMetrics(note.text))}</div>
                                </div>
                                <div class="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                    <span id="notypad-panel-title" class="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-cyan-100">${escapeHtml(displayTitle)}</span>
                                    <span>Everything saves automatically on this device.</span>
                                    <span>Ctrl/Cmd + S forces a save.</span>
                                    <span>Tab inserts indentation.</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2 xl:max-w-md xl:justify-end">
                            <button onclick="copyNotyPadText()" class="px-3 py-2 rounded-xl border border-white/10 bg-black/35 text-xs font-bold uppercase tracking-[0.16em] text-gray-200 hover:bg-white/10">Copy All</button>
                            <button onclick="downloadNotyPadText()" class="px-3 py-2 rounded-xl border border-white/10 bg-black/35 text-xs font-bold uppercase tracking-[0.16em] text-gray-200 hover:bg-white/10">Download TXT</button>
                            <button onclick="insertNotyPadTimestamp()" class="px-3 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200 hover:bg-cyan-500/20">Insert Timestamp</button>
                            <button onclick="clearNotyPad()" class="px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs font-bold uppercase tracking-[0.16em] text-red-200 hover:bg-red-500/20">Clear</button>
                        </div>
                    </div>
                    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                        <div class="rounded-[1.5rem] border border-white/10 bg-black/25 p-3">
                            <textarea id="notypad-textarea" spellcheck="true" autocapitalize="sentences" autocomplete="off" wrap="${note.wrapLines ? 'soft' : 'off'}" oninput="updateNotyPadText(this.value)" onkeydown="handleNotyPadKeydown(event)" class="min-h-[30rem] w-full resize-y rounded-[1.2rem] border border-white/10 bg-black/45 px-4 py-4 font-mono leading-7 text-white outline-none transition focus:border-cyan-400/60 focus:bg-black/55">${escapeHtml(note.text || '')}</textarea>
                        </div>
                        <aside class="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 flex flex-col gap-4">
                            <div class="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
                                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Auto Save</div>
                                <div id="notypad-save-status" class="mt-2 text-sm font-semibold ${note.updatedAt ? 'text-emerald-200' : 'text-gray-200'}">${escapeHtml(saveLabel)}</div>
                                <div class="mt-1 text-xs text-gray-500">Last write: <span id="notypad-saved-at">${escapeHtml(note.updatedAt ? new Date(note.updatedAt).toLocaleString() : 'Not saved yet')}</span></div>
                            </div>
                            <div class="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
                                <div class="flex items-center justify-between text-xs text-gray-400">
                                    <span>Font Size</span>
                                    <span id="notypad-font-size-value" class="text-white">${note.fontSize}px</span>
                                </div>
                                <input type="range" min="13" max="28" step="1" value="${note.fontSize}" oninput="setNotyPadFontSize(this.value)" class="mt-3 w-full">
                                <label class="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                                    <span>
                                        <span class="block text-sm text-white">Wrap Lines</span>
                                        <span class="block mt-1 text-xs text-gray-400">Turn off wrapping for code blocks or long drafts.</span>
                                    </span>
                                    <input type="checkbox" class="h-4 w-4 accent-cyan-500" ${note.wrapLines ? 'checked' : ''} onchange="toggleNotyPadWrap(this.checked)">
                                </label>
                            </div>
                            <div>
                                <div class="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Live Counts</div>
                                <div id="notypad-live-counts" class="space-y-2">${renderNotyPadMetricRows(getNotyPadMetrics(note.text))}</div>
                            </div>
                            <div class="rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 py-4 text-xs leading-6 text-gray-400">
                                Use this for scratch notes, lyrics planning, playlist ideas, reminders, or quick text you want NexPlay to keep between launches.
                            </div>
                        </aside>
                    </div>
                </div>
            </section>
        </div>
    `;
    refreshNotyPadMeta();
}

function setHeaderControlHidden(control, hidden) {
    if (!control) return;
    control.classList.toggle('hidden', !!hidden);
}

function syncHeaderActionVisibility() {
    const isNotyPadTab = state.activeTab === 'notypad';
    const shouldHideLibraryControls = isNotyPadTab || isPrivateSessionRouteActive();
    const searchWrap = document.getElementById('header-search-wrap');
    const libraryToggle = document.getElementById('library-toggle-online-btn');
    const sortWrap = document.getElementById('sort-select')?.parentElement;
    const importDesktop = document.getElementById('import-media-btn');
    const importMobile = document.getElementById('import-media-btn-mobile');
    const viewModeToggle = document.getElementById('view-mode-toggle');
    const multiSelect = document.getElementById('multi-select-toggle');
    setHeaderControlHidden(searchWrap, shouldHideLibraryControls);
    setHeaderControlHidden(libraryToggle, shouldHideLibraryControls);
    setHeaderControlHidden(sortWrap, shouldHideLibraryControls);
    setHeaderControlHidden(importDesktop, shouldHideLibraryControls);
    setHeaderControlHidden(importMobile, shouldHideLibraryControls);
    setHeaderControlHidden(viewModeToggle, shouldHideLibraryControls);
    setHeaderControlHidden(multiSelect, shouldHideLibraryControls);
}

function sanitizeFeatureToggleMap(raw) {
    const base = createDefaultFeatureToggles();
    if (!raw || typeof raw !== 'object') return base;
    FEATURE_IDS.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(raw, id)) {
            base[id] = !!raw[id];
        }
    });
    return base;
}

function sanitizeResumeStore(raw) {
    const out = createDefaultResumeStore();
    if (!raw || typeof raw !== 'object') return out;
    const tracks = raw.tracks && typeof raw.tracks === 'object' ? raw.tracks : {};
    Object.entries(tracks).forEach(([trackId, entry]) => {
        const time = Number(entry?.time ?? 0);
        if (!trackId || !Number.isFinite(time) || time <= 0) return;
        out.tracks[trackId] = {
            time: Math.max(0, time),
            duration: Number(entry?.duration ?? 0) || 0,
            updatedAt: Number(entry?.updatedAt ?? Date.now()) || Date.now(),
            mediaType: entry?.mediaType === 'video' ? 'video' : 'audio'
        };
    });
    const online = raw.online && typeof raw.online === 'object' ? raw.online : {};
    Object.entries(online).forEach(([key, entry]) => {
        if (!key || !entry || typeof entry !== 'object') return;
        out.online[key] = {
            position: Number(entry.position ?? 0) || 0,
            provider: sanitizeText(entry.provider || 'embed'),
            sourceType: sanitizeText(entry.sourceType || 'embed'),
            updatedAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
            lastKnownCanonicalUrl: sanitizeText(entry.lastKnownCanonicalUrl || key),
            playerState: sanitizeText(entry.playerState || '')
        };
    });
    out.lastUpdatedAt = Number(raw.lastUpdatedAt ?? Date.now()) || Date.now();
    return out;
}

function sanitizeQueueSnapshots(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
        if (!item || typeof item !== 'object') return null;
        const queue = Array.isArray(item.queue)
            ? item.queue.map((entry, index) => {
                if (entry && typeof entry === 'object') {
                    const trackId = sanitizeText(entry.trackId || entry.id || '');
                    if (!trackId) return null;
                    return {
                        id: sanitizeText(entry.id || `snapshot_entry_${index}`) || `snapshot_entry_${index}`,
                        trackId,
                        sourceKind: sanitizeText(entry.sourceKind || entry.source || '').toLowerCase() === 'online' ? 'online' : 'local',
                        mediaType: 'audio',
                        title: sanitizeText(entry.title || 'Untitled'),
                        artist: sanitizeText(entry.artist || ''),
                        cover: sanitizeText(entry.cover || ''),
                        provider: sanitizeText(entry.provider || ''),
                        videoId: sanitizeText(entry.videoId || ''),
                        isSavedOnline: !!entry.isSavedOnline
                    };
                }
                return sanitizeText(entry || '');
            }).filter(Boolean)
            : [];
        return {
            id: typeof item.id === 'string' && item.id ? item.id : generateId(),
            name: sanitizeText(item.name || 'Snapshot'),
            queue,
            currentIndex: Number(item.currentIndex ?? -1),
            currentTrackId: sanitizeText(item.currentTrackId || ''),
            mediaType: item.mediaType === 'video' ? 'video' : 'audio',
            isShuffle: !!item.isShuffle,
            repeatMode: ['none', 'all', 'one'].includes(item.repeatMode) ? item.repeatMode : 'none',
            source: sanitizeText(item.source || 'auto'),
            createdAt: Number(item.createdAt ?? Date.now()) || Date.now()
        };
    }).filter(Boolean).slice(0, 80);
}

function sanitizeChapterBookmarks(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.entries(raw).forEach(([trackId, list]) => {
        if (!trackId || !Array.isArray(list)) return;
        const clean = list.map((item) => {
            const t = Number(item?.time ?? 0);
            if (!Number.isFinite(t) || t < 0) return null;
            return {
                id: typeof item?.id === 'string' && item.id ? item.id : generateId(),
                time: Math.max(0, t),
                label: sanitizeText(item?.label || ''),
                updatedAt: Number(item?.updatedAt ?? Date.now()) || Date.now()
            };
        }).filter(Boolean).sort((a, b) => a.time - b.time);
        if (clean.length) out[trackId] = clean;
    });
    return out;
}

function sanitizeLinkCollections(raw) {
    const base = createDefaultLinkCollections();
    if (!raw || typeof raw !== 'object') return base;
    const seen = new Set();
    const list = Array.isArray(raw.collections) ? raw.collections : [];
    const collections = list.map((item, idx) => {
        const id = typeof item?.id === 'string' && item.id ? sanitizeText(item.id) : generateId();
        if (!id || seen.has(id)) return null;
        seen.add(id);
        return {
            id,
            name: sanitizeText(item?.name || `Collection ${idx + 1}`) || `Collection ${idx + 1}`,
            createdAt: Number(item?.createdAt ?? Date.now()) || Date.now(),
            updatedAt: Number(item?.updatedAt ?? Date.now()) || Date.now(),
            order: Number(item?.order ?? idx) || idx
        };
    }).filter(Boolean);
    if (!collections.some((c) => c.id === 'default')) {
        collections.unshift({ id: 'default', name: 'General', createdAt: Date.now(), updatedAt: Date.now(), order: -1 });
    }
    collections.sort((a, b) => (a.order || 0) - (b.order || 0));
    const validIds = new Set(collections.map((c) => c.id));
    const assignments = {};
    const rawAssignments = raw.assignments && typeof raw.assignments === 'object' ? raw.assignments : {};
    Object.entries(rawAssignments).forEach(([linkId, collectionId]) => {
        if (!linkId || typeof collectionId !== 'string') return;
        assignments[linkId] = validIds.has(collectionId) ? collectionId : 'default';
    });
    return { collections, assignments };
}

function sanitizeMomentCaptures(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
        if (!item || typeof item !== 'object') return null;
        return {
            id: typeof item.id === 'string' && item.id ? item.id : generateId(),
            kind: item.kind === 'online' ? 'online' : 'track',
            trackId: sanitizeText(item.trackId || ''),
            sourceUrl: sanitizeText(item.sourceUrl || ''),
            mediaType: item.mediaType === 'video' ? 'video' : 'audio',
            time: Math.max(0, Number(item.time ?? 0) || 0),
            note: sanitizeText(item.note || ''),
            context: sanitizeText(item.context || ''),
            createdAt: Number(item.createdAt ?? Date.now()) || Date.now()
        };
    }).filter(Boolean).slice(0, 250);
}

function sanitizeMoodDialState(raw) {
    const value = Math.max(-100, Math.min(100, Number(raw?.value ?? 0) || 0));
    return { value, updatedAt: Number(raw?.updatedAt ?? Date.now()) || Date.now() };
}

function sanitizeStoryModeState(raw) {
    return {
        lastGeneratedAt: Number(raw?.lastGeneratedAt ?? 0) || 0,
        lastSummary: raw?.lastSummary && typeof raw.lastSummary === 'object'
            ? {
                count: Number(raw.lastSummary.count ?? 0) || 0,
                warmup: Number(raw.lastSummary.warmup ?? 0) || 0,
                peak: Number(raw.lastSummary.peak ?? 0) || 0,
                cooldown: Number(raw.lastSummary.cooldown ?? 0) || 0
            }
            : null
    };
}

function sanitizeScenePackState(raw) {
    const activePack = Object.prototype.hasOwnProperty.call(SCENE_PACKS, raw?.activePack)
        ? raw.activePack
        : DEFAULT_SCENE_PACK;
    const visualBias = Math.max(0.5, Math.min(1.8, Number(raw?.visualBias ?? 1) || 1));
    return { activePack, visualBias, updatedAt: Number(raw?.updatedAt ?? Date.now()) || Date.now() };
}

function sanitizeCoverWallState(raw) {
    const ids = Array.isArray(raw?.cachedTrackIds) ? raw.cachedTrackIds.filter(Boolean).slice(0, 60) : [];
    return {
        lastUpdatedAt: Number(raw?.lastUpdatedAt ?? 0) || 0,
        cachedTrackIds: ids
    };
}

function sanitizeVideoFilterStore(raw) {
    const clean = {};
    if (!raw || typeof raw !== 'object') return clean;
    Object.entries(raw).slice(0, 500).forEach(([key, entry]) => {
        const safeKey = typeof key === 'string' ? key.trim() : '';
        if (!safeKey) return;
        clean[safeKey] = {
            sharpness: clampNumber(entry?.sharpness, 0, 1, 0),
            brightness: clampNumber(entry?.brightness, 0.5, 1.5, 1),
            contrast: clampNumber(entry?.contrast, 0.5, 1.5, 1),
            updatedAt: Number(entry?.updatedAt ?? 0) || 0
        };
    });
    return clean;
}

function sanitizeExtendedStores() {
    state.resumeStore = sanitizeResumeStore(state.resumeStore);
    state.queueSnapshots = sanitizeQueueSnapshots(state.queueSnapshots);
    state.chapterBookmarks = sanitizeChapterBookmarks(state.chapterBookmarks);
    state.linkCollections = sanitizeLinkCollections(state.linkCollections);
    state.momentCaptures = sanitizeMomentCaptures(state.momentCaptures);
    state.moodDialState = sanitizeMoodDialState(state.moodDialState);
    state.storyModeState = sanitizeStoryModeState(state.storyModeState);
    state.scenePackState = sanitizeScenePackState(state.scenePackState);
    state.coverWallState = sanitizeCoverWallState(state.coverWallState);
    state.videoFilterStore = sanitizeVideoFilterStore(state.videoFilterStore);
}

function persistFeatureToggles() {
    if (shouldBypassStorageWriteForPrivateSession()) return false;
    writeStorageJson(FEATURE_TOGGLE_STORAGE_KEY, sanitizeFeatureToggleMap(state.featureToggles));
    return true;
}

function persistExtendedStores() {
    if (shouldBypassStorageWriteForPrivateSession()) return false;
    sanitizeExtendedStores();
    writeStorageJson(EXTENDED_STORAGE_KEYS.resumeStore, state.resumeStore);
    writeStorageJson(EXTENDED_STORAGE_KEYS.queueSnapshots, state.queueSnapshots);
    writeStorageJson(EXTENDED_STORAGE_KEYS.chapterBookmarks, state.chapterBookmarks);
    writeStorageJson(EXTENDED_STORAGE_KEYS.linkCollections, state.linkCollections);
    writeStorageJson(EXTENDED_STORAGE_KEYS.momentCaptures, state.momentCaptures);
    writeStorageJson(EXTENDED_STORAGE_KEYS.moodDialState, state.moodDialState);
    writeStorageJson(EXTENDED_STORAGE_KEYS.storyModeState, state.storyModeState);
    writeStorageJson(EXTENDED_STORAGE_KEYS.scenePackState, state.scenePackState);
    writeStorageJson(EXTENDED_STORAGE_KEYS.coverWallState, state.coverWallState);
    writeStorageJson(EXTENDED_STORAGE_KEYS.videoFilterStore, state.videoFilterStore);
    return true;
}

function loadFeatureToggles() {
    state.featureToggles = sanitizeFeatureToggleMap(readStorageJson(FEATURE_TOGGLE_STORAGE_KEY, {}));
}

function loadExtendedStores() {
    state.resumeStore = sanitizeResumeStore(readStorageJson(EXTENDED_STORAGE_KEYS.resumeStore, createDefaultResumeStore()));
    state.queueSnapshots = sanitizeQueueSnapshots(readStorageJson(EXTENDED_STORAGE_KEYS.queueSnapshots, []));
    state.chapterBookmarks = sanitizeChapterBookmarks(readStorageJson(EXTENDED_STORAGE_KEYS.chapterBookmarks, {}));
    state.linkCollections = sanitizeLinkCollections(readStorageJson(EXTENDED_STORAGE_KEYS.linkCollections, createDefaultLinkCollections()));
    state.momentCaptures = sanitizeMomentCaptures(readStorageJson(EXTENDED_STORAGE_KEYS.momentCaptures, []));
    state.moodDialState = sanitizeMoodDialState(readStorageJson(EXTENDED_STORAGE_KEYS.moodDialState, { value: 0, updatedAt: 0 }));
    state.storyModeState = sanitizeStoryModeState(readStorageJson(EXTENDED_STORAGE_KEYS.storyModeState, { lastGeneratedAt: 0, lastSummary: null }));
    state.scenePackState = sanitizeScenePackState(readStorageJson(EXTENDED_STORAGE_KEYS.scenePackState, { activePack: DEFAULT_SCENE_PACK, visualBias: 1, updatedAt: 0 }));
    state.coverWallState = sanitizeCoverWallState(readStorageJson(EXTENDED_STORAGE_KEYS.coverWallState, { lastUpdatedAt: 0, cachedTrackIds: [] }));
    state.videoFilterStore = sanitizeVideoFilterStore(readStorageJson(EXTENDED_STORAGE_KEYS.videoFilterStore, {}));
}

function isFeatureEnabled(id) {
    return !!(id && state.featureToggles && state.featureToggles[id]);
}

function setFeatureEnabled(id, value, options = {}) {
    if (!FEATURE_IDS.includes(id)) return false;
    const next = !!value;
    if (state.featureToggles[id] === next) return false;
    state.featureToggles[id] = next;
    refreshFeatureRuntime(options);
    return true;
}

function applyFeaturePreset(presetId, options = {}) {
    const next = createDefaultFeatureToggles();
    if (presetId === 'core_essentials') {
        FEATURE_GROUPS.core.forEach((id) => { next[id] = true; });
    } else if (presetId === 'creative_lab') {
        FEATURE_GROUPS.creative.forEach((id) => { next[id] = true; });
    } else if (presetId === 'everything_on') {
        FEATURE_IDS.forEach((id) => { next[id] = true; });
    }
    state.featureToggles = next;
    refreshFeatureRuntime(options);
}

function resetFeatureToggles(options = {}) {
    state.featureToggles = createDefaultFeatureToggles();
    refreshFeatureRuntime(options);
}

function applyScenePackClass(packId = DEFAULT_SCENE_PACK) {
    const body = document.body;
    if (!body) return;
    Object.values(SCENE_PACKS).forEach((pack) => {
        if (pack.className) body.classList.remove(pack.className);
    });
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_scene_packs)) return;
    const active = SCENE_PACKS[packId] || SCENE_PACKS[DEFAULT_SCENE_PACK];
    if (active.className) body.classList.add(active.className);
}

function applyFeatureVisibility() {
    document.querySelectorAll('[data-feature-id]').forEach((el) => {
        const id = el.getAttribute('data-feature-id');
        if (!id) return;
        el.classList.toggle('hidden', !isFeatureEnabled(id));
    });
}

function applyFeatureRuntimeGuards() {
    sanitizeExtendedStores();
    applyScenePackClass(state.scenePackState?.activePack || DEFAULT_SCENE_PACK);
    const moodValue = Math.max(-100, Math.min(100, Number(state.moodDialState?.value ?? 0) || 0));
    const moodBias = (moodValue / 100).toFixed(3);
    const moodIntensity = (Math.abs(moodValue) / 100).toFixed(3);
    document.documentElement.style.setProperty('--mood-bias', moodBias);
    document.documentElement.style.setProperty('--mood-intensity', moodIntensity);
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_mood_dial)) {
        document.documentElement.style.setProperty('--mood-bias', '0');
        document.documentElement.style.setProperty('--mood-intensity', '0');
    }
    if (!isFeatureEnabled(FEATURE_REGISTRY.creative_beat_reactive_ui)) {
        document.documentElement.style.setProperty('--beat-intensity', '0');
        lastBeatReactiveValue = -1;
        lastBeatReactiveWriteTs = 0;
    }
    if (!isFeatureEnabled(FEATURE_REGISTRY.core_link_collections)) {
        state.linkCollections = sanitizeLinkCollections(state.linkCollections);
    }
    // Performance presentation is owned by the sampler and the user's desktop
    // preset, not by optional creative-feature switches.
    if (typeof applyMeasuredPerformanceTier === 'function') {
        applyMeasuredPerformanceTier(state.perfPolicy?.tier || 'normal');
    }
    applyFeatureVisibility();
}

function refreshFeatureRuntime(options = {}) {
    const opts = { rerender: true, preserveScroll: true, ...options };
    persistFeatureToggles();
    persistExtendedStores();
    persistAppStateNow();
    applyFeatureRuntimeGuards();
    if (!opts.rerender) return;
    renderNav();
    renderTracks({ preserveScroll: !!opts.preserveScroll });
    if (state.activeTab === 'online-videos') {
        renderVideoUrlLibrary();
        renderVideoUrlPlayer(state.currentUrlVideoSource);
    }
    if (state.activeTab === 'stats') renderStats();
}

function escapeHtml(value = '') {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeInlineJsArgument(value = '') {
    return escapeHtml(JSON.stringify(String(value ?? '')));
}

const textPromptDialogState = {
    mode: 'text',
    allowEmpty: false,
    validate: null,
    resolver: null,
    previousFocus: null
};

function getTextPromptDialogElements() {
    return {
        modal: document.getElementById('text-prompt-modal'),
        title: document.getElementById('text-prompt-title'),
        message: document.getElementById('text-prompt-message'),
        inputWrap: document.getElementById('text-prompt-input-wrap'),
        label: document.getElementById('text-prompt-label'),
        input: document.getElementById('text-prompt-input'),
        error: document.getElementById('text-prompt-error'),
        cancel: document.getElementById('text-prompt-cancel'),
        confirm: document.getElementById('text-prompt-confirm')
    };
}

function setTextPromptError(message = '') {
    const { error } = getTextPromptDialogElements();
    if (!error) return;
    if (message) {
        error.textContent = message;
        error.classList.remove('hidden');
    } else {
        error.textContent = '';
        error.classList.add('hidden');
    }
}

function closeTextPromptDialog(result) {
    const { modal, input } = getTextPromptDialogElements();
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (input) input.value = '';
    setTextPromptError('');
    const resolver = textPromptDialogState.resolver;
    const previousFocus = textPromptDialogState.previousFocus;
    textPromptDialogState.resolver = null;
    textPromptDialogState.validate = null;
    textPromptDialogState.previousFocus = null;
    textPromptDialogState.allowEmpty = false;
    textPromptDialogState.mode = 'text';
    if (previousFocus && typeof previousFocus.focus === 'function') {
        setTimeout(() => {
            try { previousFocus.focus({ preventScroll: true }); } catch (_) {}
        }, 0);
    }
    if (resolver) resolver(result);
}

function openTextPromptModal(options = {}) {
    const els = getTextPromptDialogElements();
    if (!els.modal || !els.input) {
        showToast('Dialog could not be opened.', 'error');
        return Promise.resolve(null);
    }
    if (textPromptDialogState.resolver) closeTextPromptDialog(null);
    const {
        title = 'Enter value',
        message = '',
        label = 'Value',
        defaultValue = '',
        placeholder = '',
        confirmLabel = 'Save',
        cancelLabel = 'Cancel',
        allowEmpty = false,
        validate = null
    } = options;
    return new Promise((resolve) => {
        textPromptDialogState.mode = 'text';
        textPromptDialogState.allowEmpty = !!allowEmpty;
        textPromptDialogState.validate = typeof validate === 'function' ? validate : null;
        textPromptDialogState.resolver = resolve;
        textPromptDialogState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (els.title) els.title.textContent = title;
        if (els.message) {
            els.message.textContent = message;
            els.message.classList.toggle('hidden', !message);
        }
        if (els.label) els.label.textContent = label;
        if (els.inputWrap) els.inputWrap.classList.remove('hidden');
        els.input.value = String(defaultValue ?? '');
        els.input.placeholder = placeholder;
        if (els.cancel) els.cancel.textContent = cancelLabel;
        if (els.confirm) {
            els.confirm.textContent = confirmLabel;
            els.confirm.className = 'px-4 py-2 text-sm bg-cyan-600 rounded-lg text-white hover:bg-cyan-500';
        }
        setTextPromptError('');
        els.modal.classList.remove('hidden');
        els.modal.classList.add('flex');
        refreshLucideIcons();
        requestAnimationFrame(() => {
            els.input.focus();
            els.input.select();
        });
    });
}

function openConfirmDialog(options = {}) {
    const els = getTextPromptDialogElements();
    if (!els.modal) {
        showToast('Dialog could not be opened.', 'error');
        return Promise.resolve(false);
    }
    if (textPromptDialogState.resolver) closeTextPromptDialog(false);
    const {
        title = 'Confirm action',
        message = 'Are you sure?',
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
        destructive = false
    } = options;
    return new Promise((resolve) => {
        textPromptDialogState.mode = 'confirm';
        textPromptDialogState.resolver = resolve;
        textPromptDialogState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (els.title) els.title.textContent = title;
        if (els.message) {
            els.message.textContent = message;
            els.message.classList.remove('hidden');
        }
        if (els.inputWrap) els.inputWrap.classList.add('hidden');
        if (els.cancel) els.cancel.textContent = cancelLabel;
        if (els.confirm) {
            els.confirm.textContent = confirmLabel;
            els.confirm.className = destructive
                ? 'px-4 py-2 text-sm bg-red-600 rounded-lg text-white hover:bg-red-500'
                : 'px-4 py-2 text-sm bg-cyan-600 rounded-lg text-white hover:bg-cyan-500';
        }
        setTextPromptError('');
        els.modal.classList.remove('hidden');
        els.modal.classList.add('flex');
        refreshLucideIcons();
        requestAnimationFrame(() => {
            if (els.confirm) els.confirm.focus();
        });
    });
}

function submitTextPromptDialog() {
    if (!textPromptDialogState.resolver) return;
    if (textPromptDialogState.mode === 'confirm') {
        closeTextPromptDialog(true);
        return;
    }
    const { input } = getTextPromptDialogElements();
    const value = sanitizeText(input ? input.value : '');
    if (!textPromptDialogState.allowEmpty && !value) {
        setTextPromptError('Enter a value.');
        return;
    }
    if (textPromptDialogState.validate) {
        const validationMessage = textPromptDialogState.validate(value);
        if (validationMessage) {
            setTextPromptError(validationMessage);
            return;
        }
    }
    closeTextPromptDialog(value);
}

function cancelTextPromptDialog() {
    closeTextPromptDialog(textPromptDialogState.mode === 'confirm' ? false : null);
}

function handleTextPromptKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        cancelTextPromptDialog();
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        submitTextPromptDialog();
    }
}

function handleTextPromptBackdrop(event) {
    const { modal } = getTextPromptDialogElements();
    if (event.target === modal) cancelTextPromptDialog();
}

function normalizeVideoUrlInput(raw = '') {
    const input = String(raw || '').trim();
    if (!input) throw new Error('Paste a video URL first.');
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input)) return input;
    if (input.startsWith('//')) return `https:${input}`;
    return `https://${input}`;
}

function getSafeAppOrigin() {
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    return /^https?:\/\//i.test(origin) ? origin : '';
}

function buildYouTubeEmbedUrl(videoId) {
    const params = new URLSearchParams({
        autoplay: '1',
        rel: '0',
        modestbranding: '1',
        playsinline: '1'
    });
    const origin = getSafeAppOrigin();
    if (origin) params.set('origin', origin);
    return `${YOUTUBE_EMBED_HOST}/embed/${videoId}?${params.toString()}`;
}

function extractYouTubeVideoId(urlObj) {
    const host = (urlObj.hostname || '').toLowerCase();
    const parts = (urlObj.pathname || '').split('/').filter(Boolean);
    let id = '';
    if (host === 'youtu.be') {
        id = parts[0] || '';
    } else if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
        id = urlObj.searchParams.get('v') || urlObj.searchParams.get('vi') || '';
        if (!id && parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
            id = parts[1];
        }
    }
    id = String(id || '').split(/[?&#]/)[0].trim();
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : '';
}
