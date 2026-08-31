/* Legacy state object, DOM cache, and runtime variables.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- STATE MANAGEMENT ---
	        let state = {
	            tracks: [],
        savedOnlineMusicLibraryIndex: {},
    currentTrackId: null,
    currentTrack: null,
        currentPlaybackSource: 'local',
	            isPlaying: false,
	            windowedModeActive: false,
	            fsModeActive: false,
	            videoFsModeActive: false,
    volume: 0.8,
    isDarkMode: true,
    viewMode: 'list',
    sortType: 'date',
    sortDirection: 'desc',
    activeTab: 'all',
    appRoute: 'app',
    privateSession: createDefaultPrivateSessionState(),
    searchQuery: '',
    isSidebarOpen: false, // Default closed on mobile
    playbackSpeed: 1.0,
    sleepTimer: null,
    dragCounter: 0,
    metadataQueue: [],
    processingQueue: false,
    // Auto queue: when true, clicking a track builds a queue from the current view
    autoQueueEnabled: true,
	            // NexPlay display modes (app-controlled overlays)
    // Crossfade settings
    crossfadeEnabled: false,
    crossfadeDuration: 0,
    // Recently played history (most recent first)
    playHistory: [],
    // Track currently being edited in the metadata modal
    editingTrackId: null,
    // Debounce handle for search-driven rendering
    searchDebounceTimer: null,
    commandPaletteOpen: false,
    commandPaletteQuery: '',
    commandPaletteSelectedIndex: 0,
    commandPaletteContext: null,
    // Statistics: total listening time across all tracks (seconds)
    totalListeningTime: 0,
    // Internal tracker to compute deltas between timeupdate events
    lastProgressTime: 0,
    // Track id that has already had playCount incremented for the current play session
    lastCountedTrackId: null,
    // Interval ID for manual progress updates
    progressInterval: null,
    // Drag guard to prevent file overlay while queue items are dragged
    queueDragging: false

    ,
    // Audio queue state (isolated from video)
    audioQueueState: {
        entries: [],
        currentIndex: -1,
        queue: [],
        queueSource: 'auto',
        isShuffle: false,
        repeatMode: 'none',
        shuffleOrder: [],
        shuffleQueue: [],
        shuffleIndex: -1,
        pendingShuffleSeed: null,
        failedEntryIds: []
    },
    // Video queue state (isolated from audio)
    videoQueueState: {
        queue: [],
        queueSource: 'auto',
        isShuffle: false,
        repeatMode: 'none',
        shuffleQueue: [],
        shuffleIndex: -1,
        pendingShuffleSeed: null
    },

    // Active queue (mirrors one of the above based on current media type)
    queue: [],
    queueSource: 'auto',
    isShuffle: false,
    repeatMode: 'none',
    shuffleQueue: [],
    shuffleIndex: -1,
    pendingShuffleSeed: null,
    // Listening history aggregated by calendar day (YYYY-MM-DD -> seconds listened).
    // This structure is used to render a time-series chart on the stats page.
    listeningHistory: {},

    // Current tag filter.  When non-null, only tracks containing this tag will be shown.
    tagFilter: null,

    // Accent color used throughout the UI.  This value is synced to the CSS variable
    // --accent-color.  Users can change this via the accent color picker in the System
    // section.
    accentColor: '#06b6d4',
    // Automatically derive accent color from album art when enabled.
    autoAccentFromArt: false,

// Visualizer style.  Supported values: 'bars' (default), 'wave' and 'dots'.
// Users can select a style from the visualizer style picker in the System section.
visualizerStyle: 'bars',

    // Customizable keyboard bindings for player controls.  These map keyboard event.code
    // values to application actions.  A settings modal allows the user to change these
    // bindings.  Defaults mirror the original hotkeys.
	            keyBindings: {
	                playPause: 'Space',
	                next: 'ArrowRight',
	                prev: 'ArrowLeft',
	                volumeUp: 'ArrowUp',
	                volumeDown: 'ArrowDown',
	                mute: 'KeyM',
	                fsModeToggle: 'KeyF'
	            },

    // Internal structure for karaoke-style lyrics highlighting.  Contains the split
    // lyric lines, the duration per line and the index of the currently highlighted
    // line.  See prepareLyricsHighlight() for initialization.
    lyricsHighlight: {
        lines: [],
        lineDuration: 0,
        lastIndex: -1,
        timestamps: [],
        offset: 0
    }
    ,
    // Currently selected smart playlist filter.  When non-null and the Smart
    // tab is active, renderSmart() will display tracks belonging to the
    // chosen dynamic playlist.  Otherwise, the list of smart playlists is shown.
    smartFilter: null
,
// Whether the queue overlay panel is currently open.  Controls conditional rendering.
isQueueOverlayOpen: false

	    ,
	    // Persisted manual lyrics cache keyed by track id so lyrics survive reloads.
	    customLyricsCache: {},
	    // Persisted lyrics cache (manual + fetched) keyed for offline use.
	    offlineLyricsCache: {},
	    // Simple in-memory cover cache keyed by artist|title to avoid repeat lookups
	    coverCache: {},
	    // Persisted edits keyed by file fingerprint so re-imported files keep metadata
	    metadataStore: {},
    // User-defined playlists
    playlists: [],
    activePlaylistId: null,
    // Multi-select support
    multiSelectMode: false,
    multiSelectLassoMode: false,
    selectedTrackIds: [],
    pendingPlaylistTrackId: null,
    pendingDeleteTrack: null,
    lastDeletedTrack: null,
    savedVideoLinks: [],
    onlineMusic: createDefaultOnlineMusicState(),
    currentUrlVideoSource: null,
    appSettings: createDefaultAppSettings(),
    videoFilterStore: {},
    featureToggles: createDefaultFeatureToggles(),
    resumeStore: createDefaultResumeStore(),
    queueSnapshots: [],
    chapterBookmarks: {},
    linkCollections: createDefaultLinkCollections(),
    activeLinkCollectionId: 'all',
    momentCaptures: [],
    moodDialState: { value: 0, updatedAt: 0 },
    queueUndoState: null,
    autoplayRadioState: { active: false, source: '', generatedAt: 0, reasons: {} },
    storyModeState: { lastGeneratedAt: 0, lastSummary: null },
    scenePackState: { activePack: DEFAULT_SCENE_PACK, visualBias: 1, updatedAt: 0 },
    coverWallState: { lastUpdatedAt: 0, cachedTrackIds: [] },
    desktopPerformancePreset: '',
    perfPolicy: { fps: 60, tier: 'normal', updatedAt: 0 },
    musicGames: createDefaultMusicGamesState(),
    notyPad: createDefaultNotyPadState(),
    debugOverlayVisible: false,
    lastSessionAbnormalExit: false
};

	        // --- AUDIO ENGINE ---
	        let audioCtx, analyser, gainNode, eqPreampNode, eqFilters = [], sourceNode;
	        let eqChainConnected = false;
	        let eqVisualizerStarted = false;
	        const eqRuntime = {
	            preset: EQ_DEFAULT_PRESET,
	            bands: getDefaultEqBandValues(),
	            sliderEls: [],
	            dbEls: [],
	            selectEl: null,
	            persistTimer: null,
	            applyingPreset: false,
	            audioUnavailable: false,
	            headroomDb: 0,
	            graphReady: false
	        };
	        let activeQueueType = 'audio';
let localMediaDbPromise = null;
let localLibraryPersistenceWarningShown = false;
let localLibraryRestorePromise = null;
let lastDesktopLocalLibrarySnapshotsJson = '';
const localCoverPlaceholderCache = new Map();
let privateSessionClockTimer = null;

const els = {
    audio: document.getElementById('main-audio-element'),
    dropZone: document.getElementById('drop-zone'),
    tracksContainer: document.getElementById('tracks-container'),
    multiSelectToggle: document.getElementById('multi-select-toggle'),
    multiSelectPanel: document.getElementById('multi-select-panel'),
    multiSelectStatus: document.getElementById('multi-select-status'),
    multiSelectLassoToggle: document.getElementById('multi-select-lasso-toggle'),
    windowedModePanel: document.getElementById('windowedModePanel'),
	            fsModeOverlay: document.getElementById('fsModeOverlay'),
	            videoFsModeOverlay: document.getElementById('videoFsModeOverlay'),
	            videoFsModeVideoContainer: document.getElementById('videoFsModeVideoContainer'),
	            speedBtn: document.getElementById('speed-normal'),
	            sleepLabel: document.getElementById('sleep-label'),
    sidebar: document.getElementById('sidebar'),
    commandPaletteModal: document.getElementById('command-palette-modal'),
    commandPaletteTitle: document.getElementById('command-palette-title'),
    commandPaletteSubtitle: document.getElementById('command-palette-subtitle'),
    commandPaletteInput: document.getElementById('command-palette-input'),
    commandPaletteResults: document.getElementById('command-palette-results')
};
// Global references for synced lyrics handling
const aud = els.audio;
    let lrcData = [];
    let activeLyricIndex = -1;
    let lyricsFetchToken = 0;
    let lyricsPanelMode = 'view';
    let lyricsPanelTrackId = null;
    let lastLyricAutoScrollTop = -1;
    let lastLyricAutoScrollTs = 0;
    let lastStatsRefresh = 0;
	            let lastVideoPosSave = 0;
	            let lastUniversalResumeSave = 0;
	            let lastSessionSnapshotPersistTs = 0;
	            let lastMediaPositionStateTs = 0;
    let lastStatsDetailRefreshTs = 0;
    let lastVideoBufferPaintTs = 0;
    let pendingResumeTime = null;
    const videoPreviewCache = {};
    let lastBeatReactiveWriteTs = 0;
    let lastBeatReactiveValue = -1;
    let perfSamplerRafId = null;
    let perfSamplerTimeoutId = null;
    let liveViewsRafId = 0;
    const domRefCache = Object.create(null);
    let lastCoverWallStorePersist = 0;
    let commandPaletteLastFocus = null;
    let onlineMusicPlayer = null;
    let onlineMusicPlayerReady = false;
    let onlineMusicApiReadyPromise = null;
    let onlineMusicApiReadyResolve = null;
    let onlineMusicApiReadyReject = null;
    let onlineMusicApiLoadGeneration = 0;
    let onlineMusicApiAttemptGeneration = 0;
    let onlineMusicPlayerGeneration = 0;
    let onlineMusicProgressTimer = null;
    let onlineMusicSuppressSeekSync = false;
    let onlineMusicSeekCommitTimer = null;
    let onlineMusicPendingSeekValue = null;
    let onlineMusicArtistWorkSearchRenderTimer = null;
    let lastOnlineMusicPersistTs = 0;
    let onlineMusicSessionId = 0;
    let onlineMusicPrewarmRequested = false;
    const onlineMusicFailedTrackCache = new Map();
    let onlineMusicPlaybackAttemptSeq = 0;
    let onlineMusicLatestPlaybackAttempt = { id: 0, trackId: '' };
    let onlineMusicConnectingAttempt = { attemptId: 0, trackId: '', sessionId: 0, startedAt: 0, phase: '' };
    let onlineMusicAdvanceAfterFailureTimer = null;
    let onlineMusicCurrentTrackStartedFromQueue = false;
    let onlineMusicDirectAudioMode = { active: false, trackId: '', videoId: '', streamUrl: '', startedAt: 0 };
    let onlineMusicDirectAudioStart = { key: '', promise: null };
    let onlineMusicTransportOwner = { sessionId: 0, trackId: '', kind: 'none', attemptId: 0 };
    let onlineMusicDirectAudioStallTimer = null;
    const onlineMusicDirectAudioFailureCache = new Map();
    let notyPadPersistTimer = null;
	            let setupEventListenersBound = false;
	            let videoFsInteractionsBound = false;
	            let isSwitchingTrack = false;
	            let activeTrackSwitchId = '';
	            let isUpdatingQueue = false;
	            let isLoadingSource = false;
	            let trackSwitchStartedAt = 0;
	            let queueUpdateStartedAt = 0;
	            let sourceLoadStartedAt = 0;
	            let metadataProcessingStartedAt = 0;
	            let latestSourceLoadRequestId = 0;
	            let latestQueueUpdateRequestId = 0;
	            let pendingMediaPlayRequestId = 0;
                let playbackIntentSeq = 0;
                let activePlaybackIntent = { id: 0, trackId: '', sourceKind: '' };
	            let sourceLoadTimeoutTimer = null;
	            let videoSpinnerTimeoutTimer = null;
    let onlineMusicConnectTimeoutTimer = null;
	            let playbackHealthTimer = null;
	            let playbackHealthLastTime = -1;
	            let playbackHealthLastTrackId = '';
	            let playbackHealthFrozenTicks = 0;
	            let playbackHealthLastAdvanceAt = 0;
	            let playbackRecoveryInFlight = false;
	            let sourceRecoveryInFlight = false;
	            let localTrackMediaRecoveryInFlight = false;
	            const localTrackMediaRecoveryAttempts = new Map();
	            const nexPlayDesktopBridge = window.NexPlayDesktop || null;
    function isDesktopRuntimeAvailable() {
        return !!(nexPlayDesktopBridge && nexPlayDesktopBridge.isDesktopApp);
    }
    function getDesktopOnlyMessage(featureLabel = 'This feature') {
        const label = sanitizeText(featureLabel || 'This feature') || 'This feature';
        const verb = /s$/i.test(label) ? 'are' : 'is';
        return `${label} ${verb} only available in the desktop app.`;
    }
    function renderDesktopRuntimeNotice(message = 'MP3 downloads and watch folders are available in the desktop app only.') {
        if (isDesktopRuntimeAvailable()) return '';
        return `<div class="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">${escapeHtml(message)}</div>`;
    }
    function renderRuntimePill(label = '', tone = 'neutral') {
        const safeLabel = sanitizeText(label || '');
        if (!safeLabel) return '';
        const toneClass = tone === 'desktop'
            ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
            : (tone === 'warn'
                ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
                : 'border-white/10 bg-black/30 text-gray-300');
        return `<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${toneClass}">${escapeHtml(safeLabel)}</span>`;
    }
    function renderOnlineMusicRuntimeBadge(kind = 'mode') {
        if (kind === 'downloads') {
            return isDesktopRuntimeAvailable()
                ? renderRuntimePill('MP3 Downloads Ready', 'desktop')
                : renderRuntimePill('MP3 Downloads: Desktop', 'warn');
        }
        return isDesktopRuntimeAvailable()
            ? renderRuntimePill('Desktop Runtime', 'desktop')
            : renderRuntimePill('Web Build', 'neutral');
    }
    function syncOnlineMusicHubHeader() {
        const description = document.getElementById('online-music-hub-description');
        const badges = document.getElementById('online-music-runtime-badges');
        const flow = document.getElementById('online-music-hub-flow-label');
        const isDesktopRuntime = isDesktopRuntimeAvailable();
        if (description) {
            description.textContent = isDesktopRuntime
        ? 'Search streaming music, play tracks instantly, import YouTube Music playlists, add tracks to NexPlay, or download MP3 copies in the desktop app.'
        : 'Search streaming music, play results instantly, import YouTube Music playlists, and add tracks to NexPlay. MP3 downloads stay in the desktop app.';
        }
        if (badges) {
            badges.innerHTML = `${renderOnlineMusicRuntimeBadge()}${renderOnlineMusicRuntimeBadge('downloads')}`;
        }
        if (flow) {
            flow.textContent = isDesktopRuntime ? 'Search -> Play -> Add / Download' : 'Search -> Play -> Add';
            flow.title = isDesktopRuntime
                ? 'Search, play, add, or download with the desktop runtime.'
                : 'Search, play, and add on the web build. MP3 downloads stay desktop-only.';
        }
    }
    let releaseOnlineMusicDownloadListener = null;
    let onlineMusicDownloadQueueListener = null;
    let libraryWatchUpdateListener = null;

function isRepeatModeValid(mode = '') {
    return ['none', 'one', 'all'].includes(mode);
}

	        function withQueueUpdateLock(task, fallback = false) {
	            if (isUpdatingQueue) {
	                logAction('queue-mutation-skipped', 'Queue update skipped because another update is in-flight');
	                return fallback;
	            }
	            isUpdatingQueue = true;
	            queueUpdateStartedAt = Date.now();
	            latestQueueUpdateRequestId += 1;
	            const requestId = latestQueueUpdateRequestId;
	            logQueueMutation('queue-mutation-start', 'Queue mutation started', {
	                requestId,
	                operation: sanitizeText(task?.name || 'anonymous')
	            });
	            try {
	                const result = typeof task === 'function' ? task(requestId) : fallback;
	                normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
	                logQueueMutation('queue-mutation-success', 'Queue mutation completed', {
	                    requestId,
	                    result: result === false ? 'noop' : 'applied'
	                });
	                return result;
	            } catch (error) {
	                logError('queue-mutation-failure', 'Queue mutation failed and was rolled back safely', {
	                    requestId,
	                    error: sanitizeText(error?.message || '')
	                });
	                normalizeRuntimeState({ syncQueueViews: true, allowStopWhenQueueEmpty: false });
	                return fallback;
	            } finally {
	                if (requestId === latestQueueUpdateRequestId) {
	                    isUpdatingQueue = false;
	                    queueUpdateStartedAt = 0;
	                }
	                scheduleDebugOverlayRefresh();
	            }
	        }

            function invalidatePendingMediaPlayRequests() {
                pendingMediaPlayRequestId += 1;
                return pendingMediaPlayRequestId;
            }

            function beginPlaybackIntent(trackId = '', sourceKind = '') {
                playbackIntentSeq += 1;
                activePlaybackIntent = {
                    id: playbackIntentSeq,
                    trackId: sanitizeText(trackId || ''),
                    sourceKind: sanitizeText(sourceKind || '')
                };
                invalidatePendingMediaPlayRequests();
                return { ...activePlaybackIntent };
            }

            function isPlaybackIntentActive(intent = null) {
                const intentId = Number(intent?.id || 0) || 0;
                if (!intentId || intentId !== Number(activePlaybackIntent.id || 0)) return false;
                const intentTrackId = sanitizeText(intent?.trackId || '');
                if (intentTrackId && intentTrackId !== sanitizeText(activePlaybackIntent.trackId || '')) return false;
                const sourceKind = sanitizeText(intent?.sourceKind || '');
                if (sourceKind && sourceKind !== sanitizeText(activePlaybackIntent.sourceKind || '')) return false;
                return true;
            }

            function getActivePlaybackIntent() {
                return { ...activePlaybackIntent };
            }

	        function beginSourceLoad() {
	            latestSourceLoadRequestId += 1;
	            isLoadingSource = true;
	            sourceLoadStartedAt = Date.now();
	            logAction('source-load-start', 'Source load started', {
	                requestId: latestSourceLoadRequestId,
	                trackId: sanitizeText(state.currentTrackId || '')
	            });
	            scheduleDebugOverlayRefresh();
	            return latestSourceLoadRequestId;
	        }

	        function finishSourceLoad(requestId = 0) {
	            if (requestId && requestId !== latestSourceLoadRequestId) return;
	            const wasLoading = isLoadingSource;
	            isLoadingSource = false;
	            sourceLoadStartedAt = 0;
	            if (sourceLoadTimeoutTimer) {
	                clearTimeout(sourceLoadTimeoutTimer);
	                sourceLoadTimeoutTimer = null;
	            }
	            if (wasLoading) {
	                logAction('source-load-finish', 'Source load finished', {
	                    requestId: requestId || latestSourceLoadRequestId,
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	            }
	            scheduleDebugOverlayRefresh();
	        }

	        function armSourceLoadTimeout(trackId = '', timeoutMs = 12000) {
	            const expectedTrackId = sanitizeText(trackId || state.currentTrackId || '');
	            const requestId = latestSourceLoadRequestId;
    if (sourceLoadTimeoutTimer) clearTimeout(sourceLoadTimeoutTimer);
    sourceLoadTimeoutTimer = setTimeout(() => {
	                if (requestId !== latestSourceLoadRequestId) return;
	                isLoadingSource = false;
	                sourceLoadStartedAt = 0;
	                const activeTrackId = sanitizeText(state.currentTrackId || '');
	                if (expectedTrackId && activeTrackId && expectedTrackId !== activeTrackId) return;
	                safePauseMedia(els.audio);
	                state.isPlaying = false;
	                updatePlayIcons();
	                logError('source-load-timeout', 'Playback source load timed out', {
	                    trackId: expectedTrackId || activeTrackId || '',
	                    timeoutMs: Math.max(3000, Number(timeoutMs) || 12000)
	                });
	                logRecovery('source-load-timeout', 'Timed-out source was stopped safely', {
	                    trackId: expectedTrackId || activeTrackId || ''
	                });
	                showToast('Playback loading timed out. Track was stopped safely.', 'warn');
	                showInternalNotice('Loading timed out, using safe fallback.', 'warn');
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	            }, Math.max(3000, Number(timeoutMs) || DESKTOP_ONLINE_MUSIC_CONNECT_TIMEOUT_MS));
	        }

function clearOnlineMusicConnectTimeout() {
    if (!onlineMusicConnectTimeoutTimer) return;
    clearTimeout(onlineMusicConnectTimeoutTimer);
    onlineMusicConnectTimeoutTimer = null;
}

function canUseDesktopOnlineAudioStream() {
    return !!(nexPlayDesktopBridge && typeof nexPlayDesktopBridge.resolveOnlineTrackAudioStream === 'function');
}

function setOnlineMusicTransportOwner(kind = 'none', options = {}) {
    const nextKind = ['none', 'connecting', 'iframe', 'direct'].includes(kind) ? kind : 'none';
    onlineMusicTransportOwner = {
        sessionId: Math.max(0, Number(options.sessionId || 0) || 0),
        trackId: normalizeOnlineMusicTrackId(options.trackId || ''),
        kind: nextKind,
        attemptId: Math.max(0, Number(options.attemptId || options.attempt?.id || 0) || 0)
    };
    return { ...onlineMusicTransportOwner };
}

function clearOnlineMusicTransportOwner(options = {}) {
    const force = !!options.force;
    const sessionId = Math.max(0, Number(options.sessionId || 0) || 0);
    const trackId = normalizeOnlineMusicTrackId(options.trackId || '');
    if (!force && sessionId && Number(onlineMusicTransportOwner.sessionId || 0) !== sessionId) return false;
    if (!force && trackId && normalizeOnlineMusicTrackId(onlineMusicTransportOwner.trackId || '') !== trackId) return false;
    setOnlineMusicTransportOwner('none');
    return true;
}

function isOnlineMusicTransportOwner(kind = '', options = {}) {
    const expectedKind = sanitizeText(kind || '').trim();
    if (expectedKind && onlineMusicTransportOwner.kind !== expectedKind) return false;
    const sessionId = Math.max(0, Number(options.sessionId || 0) || 0);
    if (sessionId && Number(onlineMusicTransportOwner.sessionId || 0) !== sessionId) return false;
    const trackId = normalizeOnlineMusicTrackId(options.trackId || '');
    if (trackId && normalizeOnlineMusicTrackId(onlineMusicTransportOwner.trackId || '') !== trackId) return false;
    const attemptId = Math.max(0, Number(options.attemptId || options.attempt?.id || 0) || 0);
    if (attemptId && Number(onlineMusicTransportOwner.attemptId || 0) !== attemptId) return false;
    return onlineMusicTransportOwner.kind !== 'none';
}

function claimOnlineMusicTransportOwner(kind = '', options = {}) {
    const nextKind = sanitizeText(kind || '').trim();
    if (!['connecting', 'iframe', 'direct'].includes(nextKind)) return false;
    const sessionId = Math.max(0, Number(options.sessionId || 0) || 0);
    const trackId = normalizeOnlineMusicTrackId(options.trackId || '');
    if (!sessionId || !trackId) return false;
    const online = getOnlineMusicState();
    if (Number(online.sessionId || 0) !== sessionId || Number(onlineMusicSessionId || 0) !== sessionId) return false;
    if (options.playbackIntent && !isPlaybackIntentActive(options.playbackIntent)) return false;
    const current = onlineMusicTransportOwner;
    if (Number(current.sessionId || 0) !== sessionId || normalizeOnlineMusicTrackId(current.trackId || '') !== trackId) return false;
    if (current.kind === nextKind) return true;
    const allowedKinds = Array.isArray(options.fromKinds) && options.fromKinds.length
        ? options.fromKinds
        : ['connecting'];
    if (!allowedKinds.includes(current.kind)) return false;
    setOnlineMusicTransportOwner(nextKind, {
        sessionId,
        trackId,
        attemptId: options.attemptId || options.attempt?.id || current.attemptId || 0
    });
    return true;
}

function getOnlineMusicDirectAudioFallbackKey(track = null) {
    const trackId = normalizeOnlineMusicTrackId(track?.id || track || '');
    const videoId = sanitizeText(track?.videoId || getOnlineMusicCurrentTrack()?.videoId || '').trim();
    return trackId ? `${trackId}:${videoId || 'unknown'}` : '';
}

function hasRecentOnlineMusicDirectAudioFailure(track = null) {
    const key = getOnlineMusicDirectAudioFallbackKey(track);
    if (!key) return false;
    const failedAt = Number(onlineMusicDirectAudioFailureCache.get(key) || 0);
    if (!failedAt) return false;
    if (Date.now() - failedAt > 10 * 60 * 1000) {
        onlineMusicDirectAudioFailureCache.delete(key);
        return false;
    }
    return true;
}

function rememberOnlineMusicDirectAudioFailure(track = null) {
    const key = getOnlineMusicDirectAudioFallbackKey(track);
    if (key) onlineMusicDirectAudioFailureCache.set(key, Date.now());
}

function forgetOnlineMusicDirectAudioFailure(track = null) {
    const key = getOnlineMusicDirectAudioFallbackKey(track);
    if (key) onlineMusicDirectAudioFailureCache.delete(key);
}

function isOnlineMusicDirectAudioActive(options = {}) {
    if (!onlineMusicDirectAudioMode?.active) return false;
    const trackId = normalizeOnlineMusicTrackId(options.trackId || '');
    if (trackId && trackId !== normalizeOnlineMusicTrackId(onlineMusicDirectAudioMode.trackId || '')) return false;
    return true;
}

function clearOnlineMusicDirectAudioStallTimer() {
    if (!onlineMusicDirectAudioStallTimer) return;
    clearTimeout(onlineMusicDirectAudioStallTimer);
    onlineMusicDirectAudioStallTimer = null;
}

function isOnlineMusicPlaybackEndPremature(track = null, position = 0, duration = 0) {
    const current = track || getOnlineMusicCurrentTrack();
    const knownDuration = Math.max(
        Number(duration || 0) || 0,
        Number(current?.duration || 0) || 0,
        Number(getOnlineMusicState().duration || 0) || 0
    );
    const elapsed = Math.max(0, Number(position || 0) || 0);
    if (!knownDuration || knownDuration < 45 || elapsed < 3) return false;
    const remaining = knownDuration - elapsed;
    return remaining > Math.max(12, Math.min(45, knownDuration * 0.1));
}

function armOnlineMusicDirectAudioStallTimer(reason = 'stalled') {
    if (!isOnlineMusicDirectAudioActive() || !els.audio) return false;
    clearOnlineMusicDirectAudioStallTimer();
    const activeTrackId = normalizeOnlineMusicTrackId(onlineMusicDirectAudioMode.trackId || getOnlineMusicState().currentTrackId || '');
    const sessionId = Number(getOnlineMusicState().sessionId || 0);
    const startedAt = Number(onlineMusicDirectAudioMode.startedAt || 0);
    onlineMusicDirectAudioStallTimer = setTimeout(() => {
        onlineMusicDirectAudioStallTimer = null;
        if (!isOnlineMusicDirectAudioActive({ trackId: activeTrackId })) return;
        const online = getOnlineMusicState();
        if (sessionId && Number(online.sessionId || 0) !== sessionId) return;
        if (startedAt && Number(onlineMusicDirectAudioMode.startedAt || 0) !== startedAt) return;
        if (els.audio?.ended) return;
        handleOnlineMusicDirectAudioStreamInterruption(reason).catch((error) => {
            logError('online-direct-audio-stall-recovery-failed', 'Desktop audio stall recovery failed', {
                trackId: sanitizeText(activeTrackId || ''),
                reason: sanitizeText(reason || ''),
                error: sanitizeText(error?.message || '')
            });
        });
    }, Math.max(3000, Number(DESKTOP_ONLINE_MUSIC_AUDIO_STALL_TIMEOUT_MS) || 12000));
    logPlaybackState('waiting', 'Online direct audio is waiting for data', {
        trackId: sanitizeText(activeTrackId || ''),
        reason: sanitizeText(reason || ''),
        timeoutMs: Math.max(3000, Number(DESKTOP_ONLINE_MUSIC_AUDIO_STALL_TIMEOUT_MS) || 12000)
    });
    return true;
}

function stopOnlineMusicDirectAudioTransport(options = {}) {
    const opts = { clearSource: true, resetTime: false, ...options };
    const wasActive = !!onlineMusicDirectAudioMode?.active;
    const ownedTrackId = normalizeOnlineMusicTrackId(onlineMusicDirectAudioMode?.trackId || '');
    const ownedSessionId = Number(getOnlineMusicState().sessionId || 0);
    clearOnlineMusicDirectAudioStallTimer();
    onlineMusicDirectAudioMode = { active: false, trackId: '', videoId: '', streamUrl: '', startedAt: 0 };
    if (isOnlineMusicTransportOwner('direct', { trackId: ownedTrackId, sessionId: ownedSessionId })) {
        clearOnlineMusicTransportOwner({ trackId: ownedTrackId, sessionId: ownedSessionId });
    }
    if (!wasActive || !els.audio) return false;
    safePauseMedia(els.audio);
    if (opts.resetTime) {
        safeSeekMedia(els.audio, 0);
    }
    if (opts.clearSource) {
        safeCall(() => {
            els.audio.removeAttribute('src');
            els.audio.load();
        });
    }
    return true;
}

async function startOnlineMusicDirectAudioFallback(track = null, options = {}) {
    const current = track || getOnlineMusicCurrentTrack();
    if (!current || !canUseDesktopOnlineAudioStream() || !els.audio) return false;
    if (hasRecentOnlineMusicDirectAudioFailure(current)) return false;
    const online = getOnlineMusicState();
    const expectedTrackId = normalizeOnlineMusicTrackId(current.id || online.currentTrackId || '');
    const expectedSessionId = Number(options.sessionId || online.sessionId || 0);
    const playbackIntent = options.playbackIntent || getActivePlaybackIntent();
    if (!expectedTrackId) return false;
    if (!playbackIntent || !isPlaybackIntentActive(playbackIntent)) return false;
    const intentTrackId = normalizeOnlineMusicTrackId(playbackIntent.trackId || '');
    const intentSourceKind = sanitizeText(playbackIntent.sourceKind || '');
    if (intentTrackId && intentTrackId !== expectedTrackId) return false;
    if (intentSourceKind && intentSourceKind !== 'online-music') return false;
    const fallbackKey = `${getOnlineMusicDirectAudioFallbackKey(current)}:${expectedSessionId || 'session'}`;
    if (fallbackKey && onlineMusicDirectAudioStart.key === fallbackKey && onlineMusicDirectAudioStart.promise) {
        return await onlineMusicDirectAudioStart.promise;
    }
    if (!claimOnlineMusicTransportOwner('direct', {
        sessionId: expectedSessionId,
        trackId: expectedTrackId,
        attempt: options.attempt,
        playbackIntent,
        fromKinds: ['connecting', 'iframe']
    })) {
        return isOnlineMusicDirectAudioActive({ trackId: expectedTrackId })
            && isOnlineMusicTransportOwner('direct', { sessionId: expectedSessionId, trackId: expectedTrackId });
    }

    updateOnlineMusicFeedback(`Switching "${sanitizeText(current.title || 'track')}" to desktop audio playback...`, 'info');
    const startPromise = (async () => {
        try {
            const stream = await nexPlayDesktopBridge.resolveOnlineTrackAudioStream({
                trackId: current.id,
                videoId: current.videoId || current.youtubeVideoId || '',
                title: current.title,
                artist: current.artist,
                canonicalUrl: current.canonicalUrl || '',
                duration: Math.max(0, Number(current.duration || online.duration || 0) || 0),
                timeoutMs: DESKTOP_ONLINE_MUSIC_AUDIO_STREAM_TIMEOUT_MS
            });
            const streamUrl = sanitizeText(stream?.streamUrl || '').trim();
            if (!streamUrl) throw new Error('No desktop audio stream was returned.');
            if (!isPlaybackIntentActive(playbackIntent)) return false;
            if (normalizeOnlineMusicTrackId(getOnlineMusicState().currentTrackId || '') !== expectedTrackId) return false;
            if (expectedSessionId && Number(getOnlineMusicState().sessionId || 0) !== expectedSessionId) return false;
            if (!isOnlineMusicTransportOwner('direct', { sessionId: expectedSessionId, trackId: expectedTrackId })) return false;
            clearOnlineMusicConnectTimeout();
            clearOnlineMusicDirectAudioStallTimer();
            clearOnlineMusicConnectingAttempt({ trackId: expectedTrackId, sessionId: expectedSessionId });
            safeCall(() => onlineMusicPlayer?.pauseVideo?.());
            onlineMusicDirectAudioMode = {
                active: true,
                trackId: expectedTrackId,
                videoId: sanitizeText(current.videoId || stream.videoId || ''),
                streamUrl,
                startedAt: Date.now()
            };
            invalidatePendingMediaPlayRequests();
            els.audio.src = streamUrl;
            els.audio.volume = state.volume;
            els.audio.playbackRate = state.playbackSpeed;
            const ready = await waitForMediaReady(els.audio, DESKTOP_ONLINE_MUSIC_AUDIO_READY_TIMEOUT_MS);
            if (!ready) throw new Error('Desktop audio stream could not become ready.');
            if (!isPlaybackIntentActive(playbackIntent)) return false;
            if (!isOnlineMusicTransportOwner('direct', { sessionId: expectedSessionId, trackId: expectedTrackId })) return false;
            const startSeconds = Math.max(0, Number(options.startTime ?? online.currentTime ?? 0) || 0);
            if (startSeconds > 0) {
                safeSeekMedia(els.audio, startSeconds, { fallbackDuration: Number(current.duration || online.duration || stream?.duration || 0) });
            }
            const started = await safePlayMedia(els.audio, {
                waitForReady: false,
                timeoutMs: DESKTOP_ONLINE_MUSIC_AUDIO_READY_TIMEOUT_MS,
                force: true,
                playbackIntent,
                expectedTrackId,
                expectedPlaybackSource: 'online-music',
                expectedMediaSource: streamUrl
            });
            if (!started) throw new Error('Desktop audio stream could not start.');
            if (!isPlaybackIntentActive(playbackIntent)) return false;
            if (!isOnlineMusicTransportOwner('direct', { sessionId: expectedSessionId, trackId: expectedTrackId })) return false;
            online.isPlaying = true;
            state.isPlaying = true;
            state.currentPlaybackSource = 'online-music';
            online.currentTime = getMediaCurrentTimeSafe(els.audio);
            const directDuration = getMediaDurationSafe(els.audio, Number(stream?.duration || current.duration || online.duration || 0));
            if (directDuration > 0) online.duration = directDuration;
            forgetOnlineMusicDirectAudioFailure(current);
            forgetFailedOnlineMusicTrack(current.id);
            rememberOnlineMusicPlaybackResolverState('healthy', `Playing "${current.title}" through desktop audio.`);
            startOnlineMusicProgressTimer();
            updateOnlineMusicFeedback(`Playing "${current.title}".`, 'success');
            updatePlayIcons();
            syncOnlineMusicPlayerCard();
            syncOnlineMusicResultRows();
            persistOnlineMusicState();
            return true;
        } catch (error) {
            const stillCurrent = isPlaybackIntentActive(playbackIntent)
                && Number(getOnlineMusicState().sessionId || 0) === expectedSessionId;
            if (stillCurrent) {
                rememberOnlineMusicDirectAudioFailure(current);
                logError('online-direct-audio-fallback-failed', 'Desktop audio fallback failed', {
                    trackId: sanitizeText(current.id || ''),
                    videoId: sanitizeText(current.videoId || ''),
                    error: sanitizeText(error?.message || '')
                });
                if (isOnlineMusicTransportOwner('direct', { sessionId: expectedSessionId, trackId: expectedTrackId })) {
                    stopOnlineMusicDirectAudioTransport({ clearSource: true, resetTime: false });
                }
            }
            return false;
        }
    })();
    onlineMusicDirectAudioStart = { key: fallbackKey, promise: startPromise };
    try {
        return await startPromise;
    } finally {
        if (onlineMusicDirectAudioStart.promise === startPromise) {
            onlineMusicDirectAudioStart = { key: '', promise: null };
        }
    }
}

async function handleOnlineMusicDirectAudioStreamInterruption(reason = 'error') {
    if (!isOnlineMusicDirectAudioActive()) return false;
    const current = getOnlineMusicCurrentTrack();
    const activeTrackId = normalizeOnlineMusicTrackId(onlineMusicDirectAudioMode.trackId || current?.id || '');
    const online = getOnlineMusicState();
    if (els.audio) {
        const currentTime = getMediaCurrentTimeSafe(els.audio);
        if (Number.isFinite(currentTime) && currentTime >= 0) online.currentTime = currentTime;
    }
    rememberOnlineMusicDirectAudioFailure(current);
    stopOnlineMusicDirectAudioTransport({ clearSource: true, resetTime: false });
    clearOnlineMusicConnectTimeout();
    clearOnlineMusicConnectingAttempt({ force: true });
    online.isPlaying = false;
    state.isPlaying = false;
    stopOnlineMusicProgressTimer();
    logError('online-direct-audio-interruption', 'Desktop audio stream stopped before it could continue', {
        trackId: sanitizeText(activeTrackId || ''),
        videoId: sanitizeText(current?.videoId || ''),
        reason: sanitizeText(reason || ''),
        readyState: Number(els.audio?.readyState || 0),
        networkState: Number(els.audio?.networkState || 0)
    });
    const retryStarted = await retryOnlineMusicPlaybackAfterPlayerError(current, {
        videoId: current?.videoId || '',
        message: reason === 'ended-early'
            ? 'Desktop audio stream ended before the song finished.'
            : 'Desktop audio stream failed.'
    });
    if (retryStarted) {
        updateOnlineMusicFeedback(`Trying another YouTube source for "${sanitizeText(current?.title || 'track')}"...`, 'info');
        return true;
    }
    const failure = rememberFailedOnlineMusicTrack(current, 'This YouTube audio stream could not be played.', {
        videoId: current?.videoId || ''
    });
    rememberOnlineMusicPlaybackResolverState('error', failure.message);
    updateOnlineMusicFeedback(failure.message, 'error');
    if (failure.isFirstFailure && current) {
        showToast(`Unable to play "${current.title}".`, 'error');
    }
    updatePlayIcons();
    syncOnlineMusicPlayerCard();
    syncOnlineMusicResultRows();
    persistOnlineMusicState();
    if (onlineMusicCurrentTrackStartedFromQueue) {
        scheduleOnlineMusicAdvanceAfterFailure(activeTrackId);
    }
    return true;
}

async function handleOnlineMusicDirectAudioElementError() {
    return handleOnlineMusicDirectAudioStreamInterruption('error');
}

function handleOnlineMusicConnectTimeoutFailure(expectedTrackId = '') {
    const shouldAdvanceAfterFailure = !!onlineMusicCurrentTrackStartedFromQueue;
    const message = shouldAdvanceAfterFailure
        ? 'Online playback took too long to start. Skipping safely.'
        : 'Online playback took too long to start. Stopped safely.';
    updateOnlineMusicFeedback(message, 'warn');
    showInternalNotice(message, 'warn');
    if (shouldAdvanceAfterFailure) {
        scheduleOnlineMusicAdvanceAfterFailure(expectedTrackId);
        return;
    }
    deactivateOnlineMusicTransport({
        nextPlaybackSource: 'local',
        stopPlayer: true,
        resetTime: false
    });
}

	        function armOnlineMusicConnectTimeout(sessionId = 0, trackId = '', timeoutMs = DESKTOP_ONLINE_MUSIC_CONNECT_TIMEOUT_MS, playbackIntent = null) {
	            clearOnlineMusicConnectTimeout();
	            const expectedTrackId = normalizeOnlineMusicTrackId(trackId || '');
	            const expectedPlaybackIntent = playbackIntent ? { ...playbackIntent } : getActivePlaybackIntent();
	            onlineMusicConnectTimeoutTimer = setTimeout(() => {
        onlineMusicConnectTimeoutTimer = null;
        const online = getOnlineMusicState();
        const activeSession = Number(online.sessionId || 0);
        const connectingTrackId = normalizeOnlineMusicTrackId(online.connectingTrackId || '');
        if (!sessionId || activeSession !== Number(sessionId)) return;
        if (!expectedTrackId || connectingTrackId !== expectedTrackId) return;
        if (!isPlaybackIntentActive(expectedPlaybackIntent)) return;
        if (normalizeOnlineMusicTrackId(expectedPlaybackIntent.trackId || '') !== expectedTrackId) return;
        if (!isOnlineMusicTransportOwner('iframe', { sessionId, trackId: expectedTrackId })) return;
        clearOnlineMusicConnectingAttempt({ trackId: expectedTrackId, sessionId });
        const current = getOnlineMusicCurrentTrack();
        if (current && !hasRecentOnlineMusicDirectAudioFailure(current) && canUseDesktopOnlineAudioStream()) {
            const fallbackPromise = startOnlineMusicDirectAudioFallback(current, {
                sessionId,
                startTime: Math.max(0, Number(online.currentTime || 0) || 0),
                playbackIntent: expectedPlaybackIntent
            });
            fallbackPromise.then((started) => {
                if (started) return;
                handleGuardedFailure();
            }).catch(() => {
                handleGuardedFailure();
            });
            const handleGuardedFailure = () => {
                const latestOnline = getOnlineMusicState();
                if (!isPlaybackIntentActive(expectedPlaybackIntent)) return;
                if (Number(latestOnline.sessionId || 0) !== Number(sessionId)) return;
                if (normalizeOnlineMusicTrackId(latestOnline.currentTrackId || '') !== expectedTrackId) return;
                handleOnlineMusicConnectTimeoutFailure(expectedTrackId);
            };
            return;
        }
        clearOnlineMusicTransportOwner({ sessionId, trackId: expectedTrackId });
        online.isPlaying = false;
        state.isPlaying = false;
	                stopOnlineMusicProgressTimer();
	                safeCall(() => onlineMusicPlayer?.pauseVideo?.());
	                updatePlayIcons();
	                syncOnlineMusicPlayerCard();
	                persistOnlineMusicState();
	                logError('online-connect-timeout', 'Online playback connection timed out', {
	                    trackId: expectedTrackId,
	                    sessionId: Number(sessionId || 0)
	                });
	                logRecovery('online-connect-timeout', 'Online playback timeout handled safely by skipping track', {
	                    trackId: expectedTrackId
	                });
	                handleOnlineMusicConnectTimeoutFailure(expectedTrackId);
	            }, Math.max(3000, Number(timeoutMs) || 12000));
	        }

function getMediaDurationSafe(media = null, fallback = 0) {
    const duration = Number(media?.duration);
    if (isValidNumber(duration) && duration >= 0) return duration;
    const alt = Number(fallback || 0);
    return isValidNumber(alt) && alt >= 0 ? alt : 0;
}

function getMediaCurrentTimeSafe(media = null) {
    const currentTime = Number(media?.currentTime);
    return isValidNumber(currentTime) && currentTime >= 0 ? currentTime : 0;
}

function hasPlayableSource(media = null) {
    if (!media) return false;
    const src = sanitizeText(media.currentSrc || media.src || '');
    return !!src;
}

async function waitForMediaReady(media = null, timeoutMs = 8000) {
    if (!media || media.readyState >= 1) return true;
    return new Promise((resolve) => {
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            media.removeEventListener('loadedmetadata', onReady);
            media.removeEventListener('canplay', onReady);
            media.removeEventListener('error', onError);
            resolve(!!ok);
        };
        const onReady = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), Math.max(1000, Number(timeoutMs) || 8000));
        media.addEventListener('loadedmetadata', onReady, { once: true });
        media.addEventListener('canplay', onReady, { once: true });
        media.addEventListener('error', onError, { once: true });
        safeCall(() => media.load());
    });
}

async function safePlayMedia(media = null, options = {}) {
    const opts = { waitForReady: true, timeoutMs: 8000, force: false, ...options };
    if (!media || typeof media.play !== 'function') return false;
    const normalizeMediaSource = (value = '') => {
        const raw = sanitizeText(value || '').trim();
        if (!raw) return '';
        return safeCall(() => new URL(raw, window.location?.href || undefined).href, raw);
    };
    const expectedMediaSource = normalizeMediaSource(opts.expectedMediaSource || media.currentSrc || media.src || '');
    const contextIsActive = () => {
        if (opts.playbackIntent && !isPlaybackIntentActive(opts.playbackIntent)) return false;
        const expectedTrackId = sanitizeText(opts.expectedTrackId || '');
        if (expectedTrackId && expectedTrackId !== sanitizeText(state.currentTrackId || '')) return false;
        const expectedPlaybackSource = sanitizeText(opts.expectedPlaybackSource || '');
        if (expectedPlaybackSource && expectedPlaybackSource !== sanitizeText(state.currentPlaybackSource || '')) return false;
        if (expectedMediaSource && expectedMediaSource !== normalizeMediaSource(media.currentSrc || media.src || '')) return false;
        return true;
    };
    if (!contextIsActive()) return false;
    if (!opts.force && !media.paused) return true;
    if (!hasPlayableSource(media)) return false;
    const requestId = ++pendingMediaPlayRequestId;
    const requestIsActive = () => {
        if (requestId !== pendingMediaPlayRequestId) return false;
        return contextIsActive();
    };
    if (opts.waitForReady) {
        const ready = await waitForMediaReady(media, opts.timeoutMs);
        if (!ready || !requestIsActive()) return false;
    }
    if (!requestIsActive()) return false;
    try {
        const playAttempt = media.play();
        if (playAttempt && typeof playAttempt.then === 'function') {
            await playAttempt;
        }
        return requestIsActive();
    } catch (_) {
        return false;
    }
}

function safePauseMedia(media = null) {
    if (!media || typeof media.pause !== 'function') return false;
    invalidatePendingMediaPlayRequests();
    return safeCall(() => {
        media.pause();
        return true;
    }, false);
}

function safeSeekMedia(media = null, seconds = 0, options = {}) {
    if (!media) return false;
    const opts = typeof options === 'number'
        ? { fallbackDuration: options }
        : (options && typeof options === 'object' ? options : {});
    const target = Math.max(0, Number(seconds) || 0);
    let duration = getMediaDurationSafe(media, Number(opts.fallbackDuration || 0));
    if (duration <= 0 && media.seekable && Number(media.seekable.length || 0) > 0) {
        duration = safeCall(() => Number(media.seekable.end(media.seekable.length - 1) || 0), 0);
    }
    if (duration <= 0 && target > 0) return false;
    const bounded = duration > 0
        ? Math.min(target, Math.max(0, duration - 0.01))
        : 0;
    return safeCall(() => {
        if (opts.preferFastSeek === true && typeof media.fastSeek === 'function') {
            media.fastSeek(bounded);
        } else {
            media.currentTime = bounded;
        }
        return true;
    }, false);
}

function normalizeQueueTrackIds(ids = [], mediaType = 'any') {
    return safeArray(ids)
        .map((id) => sanitizeText(id || ''))
        .filter(Boolean)
        .filter((id) => {
            const track = resolveQueueDisplayTrack(id);
            if (!track) return false;
            if (mediaType === 'audio') return track.type !== 'video';
            if (mediaType === 'video') return track.type === 'video';
            return true;
        });
}

	        function normalizeRuntimeState(options = {}) {
	            const opts = { syncQueueViews: false, allowStopWhenQueueEmpty: true, ...options };
	            if (normalizeRuntimeState._busy) return false;
	            normalizeRuntimeState._busy = true;
	            const repairNotes = [];
	            const noteRepair = (type, message, details = null) => {
	                repairNotes.push({
	                    type: sanitizeText(type || 'state-repair') || 'state-repair',
	                    message: sanitizeText(message || 'State was repaired') || 'State was repaired',
	                    details: details && typeof details === 'object' ? details : null
	                });
	            };
	            try {
	                const beforeVolume = Number(state.volume);
	                const beforeRepeatMode = sanitizeText(state.repeatMode || 'none');
	                const beforeShuffle = !!state.isShuffle;
	                const beforeQueueLength = safeArray(state.queue).length;
	                const beforeShuffleQueueLength = safeArray(state.shuffleQueue).length;
	                const beforeAudioEntriesLength = safeArray(state.audioQueueState?.entries).length;
	                const beforeVideoQueueLength = safeArray(state.videoQueueState?.queue).length;
	                const beforeCurrentTrackId = sanitizeText(state.currentTrackId || '');

	                state.volume = clamp(state.volume, 0, 1);
	                if (!isValidNumber(beforeVolume) || Math.abs(state.volume - beforeVolume) > 0.0001) {
	                    noteRepair('volume-normalized', 'Volume was normalized to a safe range', {
	                        previous: beforeVolume,
	                        next: state.volume
	                    });
	                }
	                state.isShuffle = !!state.isShuffle;
	                if (beforeShuffle !== state.isShuffle) {
	                    noteRepair('shuffle-normalized', 'Shuffle flag was normalized', {
	                        previous: beforeShuffle,
	                        next: state.isShuffle
	                    });
	                }
	                state.repeatMode = isRepeatModeValid(state.repeatMode) ? state.repeatMode : 'none';
	                if (beforeRepeatMode !== state.repeatMode) {
	                    noteRepair('repeat-normalized', 'Repeat mode was normalized', {
	                        previous: beforeRepeatMode,
	                        next: state.repeatMode
	                    });
	                }
	                state.queueSource = sanitizeText(state.queueSource || 'auto') || 'auto';
	                state.queue = normalizeQueueTrackIds(state.queue, 'video');
	                state.shuffleQueue = normalizeQueueTrackIds(state.shuffleQueue, 'video');
	                if (state.queue.length !== beforeQueueLength) {
	                    noteRepair('queue-sanitized', 'Invalid queue entries were removed', {
	                        previousLength: beforeQueueLength,
	                        nextLength: state.queue.length
	                    });
	                }
	                if (state.shuffleQueue.length !== beforeShuffleQueueLength) {
	                    noteRepair('shuffle-queue-sanitized', 'Invalid shuffle queue entries were removed', {
	                        previousLength: beforeShuffleQueueLength,
	                        nextLength: state.shuffleQueue.length
	                    });
	                }
	                if (!isValidNumber(state.shuffleIndex)) state.shuffleIndex = -1;
	                if (state.shuffleQueue.length === 0) state.shuffleIndex = -1;
	                else state.shuffleIndex = Math.trunc(clamp(state.shuffleIndex, -1, state.shuffleQueue.length - 1));

	                const videoBucket = getQueueBucket('video');
	                videoBucket.queue = normalizeQueueTrackIds(videoBucket.queue, 'video');
	                videoBucket.shuffleQueue = normalizeQueueTrackIds(videoBucket.shuffleQueue, 'video');
	                if (videoBucket.queue.length !== beforeVideoQueueLength) {
	                    noteRepair('video-queue-sanitized', 'Video queue was sanitized after mutation', {
	                        previousLength: beforeVideoQueueLength,
	                        nextLength: videoBucket.queue.length
	                    });
	                }
	                videoBucket.isShuffle = !!videoBucket.isShuffle;
	                videoBucket.repeatMode = isRepeatModeValid(videoBucket.repeatMode) ? videoBucket.repeatMode : 'none';
	                videoBucket.queueSource = sanitizeText(videoBucket.queueSource || 'auto') || 'auto';
        if (!isValidNumber(videoBucket.shuffleIndex)) videoBucket.shuffleIndex = -1;
        if (!videoBucket.shuffleQueue.length) videoBucket.shuffleIndex = -1;
        else videoBucket.shuffleIndex = Math.trunc(clamp(videoBucket.shuffleIndex, -1, videoBucket.shuffleQueue.length - 1));
        videoBucket.pendingShuffleSeed = sanitizeText(videoBucket.pendingShuffleSeed || '') || null;

	                const audioBucket = getAudioQueueBucketState();
	                audioBucket.entries = safeArray(audioBucket.entries).map((entry) => {
	                    if (!entry || typeof entry !== 'object') return null;
            const trackId = sanitizeText(entry.trackId || '');
            const resolvedTrack = resolveQueueDisplayTrack(trackId);
            if (!trackId || !resolvedTrack || resolvedTrack.type === 'video') return null;
            const entryId = sanitizeText(entry.id || generateId()) || generateId();
            return {
                ...entry,
                id: entryId,
                trackId,
                sourceKind: entry.sourceKind === 'online' ? 'online' : 'local',
                mediaType: 'audio',
                title: sanitizeText(entry.title || resolvedTrack.title || 'Untitled'),
                artist: sanitizeText(entry.artist || resolvedTrack.artist || ''),
                cover: sanitizeText(entry.cover || resolvedTrack.cover || ''),
                provider: sanitizeText(entry.provider || resolvedTrack.provider || ''),
                videoId: sanitizeText(entry.videoId || resolvedTrack.videoId || ''),
                isSavedOnline: !!entry.isSavedOnline
            };
	                }).filter(Boolean);
	                if (audioBucket.entries.length !== beforeAudioEntriesLength) {
	                    noteRepair('audio-queue-sanitized', 'Audio queue entries were sanitized', {
	                        previousLength: beforeAudioEntriesLength,
	                        nextLength: audioBucket.entries.length
	                    });
	                }
	                audioBucket.currentIndex = isValidNumber(audioBucket.currentIndex) ? Math.trunc(Number(audioBucket.currentIndex)) : -1;
	                if (!audioBucket.entries.length) {
	                    audioBucket.currentIndex = -1;
        } else if (audioBucket.currentIndex < -1 || audioBucket.currentIndex >= audioBucket.entries.length) {
            // -1 is intentional: it means the deck has queued items but no
            // current item yet. Clamping it to zero consumes the first item
            // before playback starts, so the queue appears empty after Add.
            audioBucket.currentIndex = Math.trunc(clamp(audioBucket.currentIndex, -1, audioBucket.entries.length - 1));
        }
        audioBucket.isShuffle = !!audioBucket.isShuffle;
        audioBucket.repeatMode = isRepeatModeValid(audioBucket.repeatMode) ? audioBucket.repeatMode : 'none';
        audioBucket.shuffleOrder = safeArray(audioBucket.shuffleOrder)
            .map((id) => sanitizeText(id || ''))
            .filter((id) => audioBucket.entries.some((entry) => entry.id === id));
        audioBucket.failedEntryIds = safeArray(audioBucket.failedEntryIds)
            .map((id) => sanitizeText(id || ''))
            .filter((id) => audioBucket.entries.some((entry) => entry.id === id));
        normalizeAndSyncAudioQueueBucket({ applyToState: activeQueueType === 'audio' });

	                const activeTrack = resolveQueueDisplayTrack(state.currentTrackId || '');
	                if (activeTrack) {
	                    state.currentTrackId = activeTrack.id;
	                    state.currentTrack = activeTrack;
            if (activeTrack.type !== 'video') {
                const activeEntryIndex = (audioBucket.entries || []).findIndex((entry) => entry.trackId === activeTrack.id);
                if (activeEntryIndex === -1) {
                    const snapshot = buildAudioQueueEntrySnapshot(activeTrack);
                    if (snapshot) {
                        audioBucket.entries.unshift(snapshot);
                        audioBucket.currentIndex = 0;
                        normalizeAndSyncAudioQueueBucket({ applyToState: activeQueueType === 'audio' });
                    }
                } else if (audioBucket.currentIndex !== activeEntryIndex) {
                    // A selected/playing track is the only valid reason to
                    // promote a queued entry to the current position.
                    audioBucket.currentIndex = activeEntryIndex;
                    normalizeAndSyncAudioQueueBucket({ applyToState: activeQueueType === 'audio' });
                }
            }
	                } else if (state.currentTrackId) {
	                    noteRepair('current-track-cleared', 'Current track reference was invalid and has been cleared', {
	                        previousTrackId: sanitizeText(state.currentTrackId || '')
	                    });
	                    state.currentTrackId = null;
	                    state.currentTrack = null;
	                    state.isPlaying = false;
	                    stopLocalMediaTransport({ resetTime: true });
	                    deactivateOnlineMusicTransport({ nextPlaybackSource: 'local', stopPlayer: true, resetTime: true });
        }

	                const hasQueueItems = audioBucket.entries.length > 0
	                    || videoBucket.queue.length > 0
	                    || videoBucket.shuffleQueue.length > 0
	                    || state.queue.length > 0
	                    || state.shuffleQueue.length > 0;
	                if (!hasQueueItems && opts.allowStopWhenQueueEmpty && !state.currentTrackId) {
	                    if (beforeCurrentTrackId || state.isPlaying) {
	                        noteRepair('queue-empty-stop', 'Queue became empty while active playback state was set; playback was stopped safely', {
	                            previousTrackId: beforeCurrentTrackId
	                        });
	                    }
	                    state.isPlaying = false;
	                    stopLocalMediaTransport({ resetTime: true });
	                    deactivateOnlineMusicTransport({ nextPlaybackSource: 'local', stopPlayer: true, resetTime: true });
	                    resetProgressUI();
	                    updatePlayIcons();
	                }

        if (opts.syncQueueViews) {
            renderMiniQueuePeek();
            if (state.isQueueOverlayOpen) renderQueueOverlay();
	                    if (state.activeTab === 'queue') renderQueue();
	                }
	                if (repairNotes.length) {
	                    repairNotes.slice(0, 8).forEach((entry) => {
	                        logRecovery('state-normalize', entry.message, {
	                            ...(entry.details || {}),
	                            repairType: entry.type
	                        });
	                    });
	                    syncUiAfterRecovery({ clearLoading: false, refreshQueue: true });
	                }
	                scheduleDebugOverlayRefresh();
	                return true;
	            } finally {
	                normalizeRuntimeState._busy = false;
	            }
	        }

	        async function recoverFromStuckPlayback(source = 'local', track = null, currentTime = 0) {
	            const trackId = sanitizeText(track?.id || state.currentTrackId || '');
	            if (!trackId || playbackRecoveryInFlight) return false;
	            const retryKey = `${source}:${trackId}`;
	            if (!consumeRecoveryAttempt('stuckPlayback', retryKey, RECOVERY_RETRY_LIMIT)) {
	                logError('playback-stuck-fallback', 'Playback remained stuck after retry; stopping safely', {
	                    source,
	                    trackId
	                });
	                resetPlaybackState({ reason: 'stuck-fallback' });
	                showInternalNotice('Playback was stuck and was stopped safely.', 'warn');
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: true });
	                return false;
	            }
	            playbackRecoveryInFlight = true;
	            logRecovery('playback-stuck', 'Stuck playback detected. Attempting safe recovery.', {
	                source,
	                trackId,
	                currentTime: Math.max(0, Number(currentTime || 0))
	            });
	            showInternalNotice('Playback was stuck, resyncing.', 'warn', { duration: 2200 });
	            let recovered = false;
	            try {
	                if (source === 'online-music' && isOnlineMusicPlaybackActive()) {
	                    const online = getOnlineMusicState();
	                    const restartAt = Math.max(0, Number(currentTime || online.currentTime || 0));
	                    captureOnlineMusicProgress({ forcePersist: true });
	                    safeCall(() => onlineMusicPlayer?.playVideo?.());
	                    await new Promise((resolve) => setTimeout(resolve, 900));
	                    const advanced = Math.max(0, Number(getOnlineMusicState().currentTime || 0));
	                    if (advanced > restartAt + 0.04) {
	                        recovered = true;
	                    } else {
	                        const restarted = await playOnlineMusicTrack(trackId, {
	                            autoplay: true,
	                            startTime: restartAt,
	                            playbackContext: normalizeOnlineMusicPlaybackContext(online.playbackContext || 'library'),
	                            queueContextView: normalizeOnlineMusicPlaybackContext(online.queueContextView || online.playbackContext || 'library'),
	                            queueContextKey: sanitizeText(online.queueContextKey || ''),
	                            queueMode: getUnifiedAudioQueueState().isShuffle ? 'shuffle' : 'ordered',
	                            trackSnapshot: track || getOnlineMusicCurrentTrack()
	                        });
	                        recovered = !!restarted;
	                    }
	                } else {
	                    const media = els.audio;
	                    if (media && hasPlayableSource(media)) {
	                        const target = Math.max(0, Number(currentTime || getMediaCurrentTimeSafe(media) || 0));
	                        safePauseMedia(media);
	                        safeSeekMedia(media, target);
	                        recovered = await safePlayMedia(media, { waitForReady: false, timeoutMs: 2500 });
	                        if (!recovered && trackId) {
	                            loadTrack(trackId, true, null);
	                            recovered = true;
	                        }
	                    }
	                }
	            } catch (error) {
	                logError('playback-stuck-recovery-failed', 'Stuck playback recovery failed', {
	                    source,
	                    trackId,
	                    error: sanitizeText(error?.message || '')
	                });
	                recovered = false;
	            } finally {
	                playbackRecoveryInFlight = false;
	            }
	            if (recovered) {
	                clearRecoveryAttempt('stuckPlayback', retryKey);
	                logRecovery('playback-stuck-recovered', 'Playback recovered after stuck state', {
	                    source,
	                    trackId
	                });
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	                return true;
	            }
	            resetPlaybackState({ reason: 'stuck-recovery-failed' });
	            showInternalNotice('Playback recovery failed, stopped safely.', 'warn');
	            syncUiAfterRecovery({ clearLoading: true, refreshQueue: true });
	            return false;
	        }

	        function runRecoveryWatchdogs() {
	            const now = Date.now();
	            if (isSwitchingTrack && trackSwitchStartedAt > 0 && now - trackSwitchStartedAt > 15000) {
	                logError('source-switch-stuck', 'Track switch lock exceeded timeout', {
	                    elapsedMs: now - trackSwitchStartedAt,
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                resetSourceFlags({ reason: 'switch-timeout' });
	                showInternalNotice('Track switch timed out, flags reset.', 'warn');
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	            }
	            if (isLoadingSource && sourceLoadStartedAt > 0 && now - sourceLoadStartedAt > 18000) {
	                logError('source-loading-stuck', 'Source loading exceeded watchdog timeout', {
	                    elapsedMs: now - sourceLoadStartedAt,
	                    trackId: sanitizeText(state.currentTrackId || '')
	                });
	                resetLoadingState({ reason: 'source-load-watchdog' });
	                showInternalNotice('Loading timed out, using fallback.', 'warn');
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	            }
	            if (isUpdatingQueue && queueUpdateStartedAt > 0 && now - queueUpdateStartedAt > 10000) {
	                logError('queue-lock-stuck', 'Queue update lock exceeded timeout', {
	                    elapsedMs: now - queueUpdateStartedAt
	                });
	                isUpdatingQueue = false;
	                queueUpdateStartedAt = 0;
	                logRecovery('queue-lock-reset', 'Queue update lock was reset safely');
	                resetQueueViewState({ reason: 'queue-lock-watchdog' });
	            }
	            if (state.processingQueue) {
	                if (!metadataProcessingStartedAt) metadataProcessingStartedAt = now;
	                if (now - metadataProcessingStartedAt > 25000) {
	                    logError('metadata-loading-stuck', 'Metadata processing exceeded watchdog timeout', {
	                        elapsedMs: now - metadataProcessingStartedAt,
	                        pendingCount: safeArray(state.metadataQueue).length
	                    });
	                    resetLoadingState({ reason: 'metadata-watchdog' });
	                    showInternalNotice('Metadata loading timed out, continued safely.', 'warn');
	                }
	            } else {
	                metadataProcessingStartedAt = 0;
	            }
	        }

	        function ensureSourceConsistency() {
	            if (sourceRecoveryInFlight) return;
	            const online = getOnlineMusicState();
	            const media = els.audio;
	            const YTState = window.YT?.PlayerState || {};
	            const playerState = safeCall(() => onlineMusicPlayer?.getPlayerState?.(), null);
	            const localActive = !!(media && !media.paused && hasPlayableSource(media));
	            const onlineActive = !!(online.currentTrackId && (online.isPlaying || playerState === YTState.PLAYING));
	            if (localActive && onlineActive) {
	                sourceRecoveryInFlight = true;
	                try {
	                    if (state.currentPlaybackSource === 'online-music') {
	                        stopLocalMediaTransport();
	                    } else {
	                        deactivateOnlineMusicTransport({
	                            nextPlaybackSource: state.currentPlaybackSource || 'local',
	                            stopPlayer: true,
	                            resetTime: false
	                        });
	                    }
	                    logRecovery('source-overlap-repair', 'Detected overlapping active sources and stopped the stale one', {
	                        preferredSource: sanitizeText(state.currentPlaybackSource || '')
	                    });
	                    showInternalNotice('Recovered overlapping playback sources.', 'warn');
	                } finally {
	                    sourceRecoveryInFlight = false;
	                }
	                syncUiAfterRecovery({ clearLoading: false, refreshQueue: false });
	                return;
	            }
	            if (state.currentPlaybackSource === 'online-music' && online.currentTrackId && (!onlineMusicPlayer || typeof onlineMusicPlayer.loadVideoById !== 'function')) {
	                const retryKey = `online-player-missing:${sanitizeText(online.currentTrackId || '')}`;
	                if (!consumeRecoveryAttempt('sourceRecovery', retryKey, RECOVERY_RETRY_LIMIT)) {
	                    resetPlaybackState({ reason: 'online-player-missing-stop' });
	                } else {
	                    sourceRecoveryInFlight = true;
	                    try {
	                        deactivateOnlineMusicTransport({
	                            nextPlaybackSource: 'local',
	                            stopPlayer: true,
	                            resetTime: false
	                        });
	                        logRecovery('source-player-missing', 'Online source was marked active but player was unavailable. Recovered to local idle.', {
	                            trackId: sanitizeText(online.currentTrackId || '')
	                        });
	                        showInternalNotice('Online source failed, switched to safe idle.', 'warn');
	                    } finally {
	                        sourceRecoveryInFlight = false;
	                    }
	                }
	                syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	                return;
	            }
	            if (!localActive && !onlineActive && state.isPlaying && !isLoadingSource && !online.connectingTrackId) {
	                const retryKey = `source-none-active:${sanitizeText(state.currentPlaybackSource || '')}:${sanitizeText(state.currentTrackId || '')}`;
	                if (!consumeRecoveryAttempt('sourceRecovery', retryKey, RECOVERY_RETRY_LIMIT)) {
	                    resetPlaybackState({ reason: 'none-active-fallback' });
	                    showInternalNotice('Playback state was inconsistent and was reset safely.', 'warn');
	                    syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	                    return;
	                }
	                logRecovery('source-none-active', 'Playback was marked active but no source was active. Attempting resync.', {
	                    source: sanitizeText(state.currentPlaybackSource || '')
	                });
	                if (state.currentPlaybackSource === 'online-music' && online.currentTrackId) {
	                    safeCall(() => onlineMusicPlayer?.playVideo?.());
	                } else {
	                    safePlayMedia(els.audio, { waitForReady: false, timeoutMs: 2500 }).then((ok) => {
	                        if (ok) return;
	                        resetPlaybackState({ reason: 'none-active-play-failed' });
	                        syncUiAfterRecovery({ clearLoading: true, refreshQueue: false });
	                    });
	                }
	                syncUiAfterRecovery({ clearLoading: false, refreshQueue: false });
	            }
	        }

	        function startPlaybackHealthMonitor() {
	            if (playbackHealthTimer) clearInterval(playbackHealthTimer);
	            playbackHealthLastTime = -1;
	            playbackHealthLastTrackId = '';
	            playbackHealthFrozenTicks = 0;
	            playbackHealthLastAdvanceAt = Date.now();
	            playbackHealthTimer = setInterval(() => {
	                runRecoveryWatchdogs();
	                ensureSourceConsistency();
	                const track = getActivePlaybackTrack();
	                const trackId = sanitizeText(track?.id || '');
	                if (!trackId) {
	                    if (state.isPlaying) {
	                        logRecovery('active-track-missing', 'Playback was active without a valid track; stopping safely');
	                        resetPlaybackState({ reason: 'active-track-missing' });
	                        syncUiAfterRecovery({ clearLoading: true, refreshQueue: true });
	                    }
	                    playbackHealthLastTime = -1;
	                    playbackHealthLastTrackId = '';
	                    playbackHealthFrozenTicks = 0;
	                    playbackHealthLastAdvanceAt = Date.now();
	                    return;
	                }
	                const now = Date.now();
	                if (trackId !== playbackHealthLastTrackId) {
	                    playbackHealthFrozenTicks = 0;
	                    playbackHealthLastAdvanceAt = now;
	                    clearRecoveryAttempt('stuckPlayback');
	                }
	                if (isOnlineMusicPlaybackActive()) {
	                    const online = getOnlineMusicState();
	                    const cur = Math.max(0, Number(online.currentTime || 0));
	                    const dur = Math.max(0, Number(online.duration || track?.duration || 0));
	                    const invalid = !isValidNumber(cur) || (dur > 0 && cur > dur + 0.5);
	                    if (invalid) {
	                        logError('online-time-invalid', 'Online playback time was invalid and reset', {
	                            trackId,
	                            currentTime: cur,
	                            duration: dur
	                        });
	                        online.currentTime = 0;
	                        captureOnlineMusicProgress({ forcePersist: true });
	                        playbackHealthFrozenTicks = 0;
	                        playbackHealthLastAdvanceAt = now;
	                    } else {
	                        const inGrace = isLoadingSource || !!online.connectingTrackId || isSwitchingTrack || now - playbackHealthLastAdvanceAt < 4500;
	                        const moved = playbackHealthLastTrackId !== trackId || Math.abs(cur - playbackHealthLastTime) > 0.02;
	                        if (moved) {
	                            playbackHealthFrozenTicks = 0;
	                            playbackHealthLastAdvanceAt = now;
	                        } else if (state.isPlaying && online.isPlaying && !inGrace) {
	                            playbackHealthFrozenTicks += 1;
	                        }
	                        const nearEndWithoutEndEvent = dur > 0 && cur >= Math.max(0, dur - 0.2) && playbackHealthFrozenTicks >= 2;
	                        if (nearEndWithoutEndEvent && state.repeatMode !== 'one') {
	                            logRecovery('online-ended-repair', 'Online track reached end without end-event; advancing queue safely', {
	                                trackId
	                            });
	                            playNext().catch(() => {});
	                            playbackHealthFrozenTicks = 0;
	                        } else if (playbackHealthFrozenTicks >= 3 && state.isPlaying && !inGrace) {
	                            recoverFromStuckPlayback('online-music', track, cur).catch(() => {});
	                            playbackHealthFrozenTicks = 0;
	                        }
	                    }
	                    playbackHealthLastTrackId = trackId;
	                    playbackHealthLastTime = cur;
	                    return;
	                }
	                const media = els.audio;
	                const cur = getMediaCurrentTimeSafe(media);
	                const dur = getMediaDurationSafe(media, track?.duration || 0);
	                const invalid = !isValidNumber(cur) || cur < 0 || (dur > 0 && cur > dur + 0.5);
	                if (invalid) {
	                    logError('local-time-invalid', 'Local playback time was invalid and reset', {
	                        trackId,
	                        currentTime: cur,
	                        duration: dur
	                    });
	                    safeSeekMedia(media, 0);
	                    playbackHealthLastTrackId = trackId;
	                    playbackHealthLastTime = 0;
	                    playbackHealthFrozenTicks = 0;
	                    playbackHealthLastAdvanceAt = now;
	                    return;
	                }
	                const buffering = !!(media && (media.seeking || media.readyState < 2 || media.networkState === 2));
	                const inGrace = isLoadingSource || isSwitchingTrack || buffering || now - playbackHealthLastAdvanceAt < 4500;
	                const moved = playbackHealthLastTrackId !== trackId || Math.abs(cur - playbackHealthLastTime) > 0.02;
	                if (moved) {
	                    playbackHealthFrozenTicks = 0;
	                    playbackHealthLastAdvanceAt = now;
	                } else if (state.isPlaying && media && !media.paused && !inGrace) {
	                    playbackHealthFrozenTicks += 1;
	                }
	                const nearEndWithoutEndEvent = dur > 0 && cur >= Math.max(0, dur - 0.2) && playbackHealthFrozenTicks >= 2;
	                if (nearEndWithoutEndEvent && state.repeatMode !== 'one') {
	                    logRecovery('local-ended-repair', 'Local track reached end without end-event; advancing queue safely', {
	                        trackId
	                    });
	                    playNext().catch(() => {});
	                    playbackHealthFrozenTicks = 0;
	                } else if (playbackHealthFrozenTicks >= 3 && state.isPlaying && !inGrace) {
	                    recoverFromStuckPlayback('local', track, cur).catch(() => {});
	                    playbackHealthFrozenTicks = 0;
	                }
	                playbackHealthLastTrackId = trackId;
	                playbackHealthLastTime = cur;
	            }, 2000);
	        }

// Queue helpers (audio/video isolated, globals mirror active type)
function getQueueBucket(type = 'audio') {
    return type === 'video' ? state.videoQueueState : state.audioQueueState;
}
function getAudioQueueHelper() {
    return window.NexPlayAudioQueueHelpers || {};
}
function getAudioQueueBucketState() {
    return getQueueBucket('audio');
}
function buildOnlineMusicTrackSnapshotFromQueueEntry(entry = null) {
    const helper = window.NexPlayOnlineMusicHelpers;
    const rawSnapshot = helper && typeof helper.buildOnlineMusicTrackFromQueueEntry === 'function'
        ? helper.buildOnlineMusicTrackFromQueueEntry(entry)
        : (entry?.trackSnapshot && typeof entry.trackSnapshot === 'object'
            ? { ...entry.trackSnapshot }
            : (entry?.sourceKind === 'online'
                ? {
                    id: sanitizeText(entry.trackId || ''),
                    title: sanitizeText(entry.title || 'Untitled'),
                    artist: sanitizeText(entry.artist || ''),
                    cover: sanitizeText(entry.cover || ''),
                    provider: sanitizeText(entry.provider || ''),
                    videoId: sanitizeText(entry.videoId || ''),
                    source: 'online-music',
                    type: 'audio'
                }
                : null));
    const clean = sanitizeStoredOnlineMusicTrack(rawSnapshot || {});
    return clean ? { ...clean, resumePosition: 0, resumeUpdatedAt: 0 } : null;
}
function buildAudioQueueEntrySnapshot(track = null) {
    if (!track || track.type === 'video') return null;
    const onlineSnapshot = isOnlineMusicTrackRecord(track)
        ? sanitizeStoredOnlineMusicTrack(track)
        : null;
    const baseTrack = onlineSnapshot || track;
    const trackId = sanitizeText(baseTrack?.id || '');
    if (!trackId) return null;
    const privateSnapshot = isPrivateSessionTrackRecord(track)
        ? clonePrivateSessionValue({
            ...track,
            resumePosition: 0,
            resumeUpdatedAt: 0
        }, null)
        : null;
    return {
        id: generateId(),
        trackId,
        sourceKind: getTrackQueueSourceKind(baseTrack),
        mediaType: 'audio',
        title: sanitizeText(baseTrack.title || baseTrack.fileName || 'Untitled'),
        artist: sanitizeText(baseTrack.artist || ''),
        cover: sanitizeText(baseTrack.cover || ''),
        provider: sanitizeText(baseTrack.provider || baseTrack.catalogProvider || ''),
        videoId: sanitizeText(baseTrack.videoId || ''),
        isSavedOnline: !!(isOnlineMusicTrackRecord(baseTrack) && getSavedOnlineTrack(trackId)),
        trackSnapshot: privateSnapshot || (onlineSnapshot ? { ...onlineSnapshot, resumePosition: 0, resumeUpdatedAt: 0 } : null)
    };
}
function normalizeAndSyncAudioQueueBucket(options = {}) {
    const bucket = getAudioQueueBucketState();
    const helper = getAudioQueueHelper();
    const normalized = typeof helper.normalizeState === 'function'
        ? helper.normalizeState(bucket)
        : {
            entries: Array.isArray(bucket.entries) ? bucket.entries.slice() : [],
            currentIndex: Number.isFinite(Number(bucket.currentIndex)) ? Number(bucket.currentIndex) : -1,
            isShuffle: !!bucket.isShuffle,
            repeatMode: ['none', 'all', 'one'].includes(bucket.repeatMode) ? bucket.repeatMode : 'none',
            shuffleOrder: Array.isArray(bucket.shuffleOrder) ? bucket.shuffleOrder.slice() : []
        };
    bucket.entries = Array.isArray(normalized.entries) ? normalized.entries.slice() : [];
    bucket.currentIndex = Number.isFinite(Number(normalized.currentIndex)) ? Number(normalized.currentIndex) : -1;
    bucket.isShuffle = !!normalized.isShuffle;
    bucket.repeatMode = ['none', 'all', 'one'].includes(normalized.repeatMode) ? normalized.repeatMode : 'none';
    bucket.shuffleOrder = Array.isArray(normalized.shuffleOrder) ? normalized.shuffleOrder.slice() : [];
    bucket.queueSource = sanitizeText(bucket.queueSource || 'auto') || 'auto';
    bucket.pendingShuffleSeed = bucket.pendingShuffleSeed || null;
    bucket.failedEntryIds = Array.from(new Set((Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds : [])
        .map((id) => sanitizeText(id))
        .filter(Boolean)));
    const byId = new Map(bucket.entries.map((entry) => [entry.id, entry]));
    const upcoming = typeof helper.upcomingEntries === 'function'
        ? helper.upcomingEntries(normalized)
        : [];
    bucket.queue = upcoming.map((entry) => sanitizeText(entry?.trackId || '')).filter(Boolean);
    bucket.shuffleQueue = bucket.isShuffle
        ? bucket.shuffleOrder.map((entryId) => byId.get(entryId)?.trackId).filter(Boolean)
        : [];
    const currentEntry = bucket.currentIndex >= 0 ? bucket.entries[bucket.currentIndex] || null : null;
    bucket.shuffleIndex = bucket.isShuffle && currentEntry ? bucket.shuffleOrder.indexOf(currentEntry.id) : -1;
    if (options.applyToState !== false) {
        state.queue = bucket.queue.slice();
        state.queueSource = bucket.queueSource;
        state.isShuffle = !!bucket.isShuffle;
        state.repeatMode = bucket.repeatMode;
        state.shuffleQueue = bucket.shuffleQueue.slice();
        state.shuffleIndex = bucket.shuffleIndex;
        state.pendingShuffleSeed = bucket.pendingShuffleSeed || null;
    }
    return bucket;
}
	        function commitUnifiedAudioQueue(nextState = {}, options = {}) {
	            const bucket = getAudioQueueBucketState();
	            const previousLength = safeArray(bucket.entries).length;
	            const previousIndex = Number(bucket.currentIndex ?? -1);
	            const next = nextState && typeof nextState === 'object' ? nextState : {};
	            Object.assign(bucket, next);
    if (!Object.prototype.hasOwnProperty.call(next, 'queueSource')) {
        bucket.queueSource = sanitizeText(bucket.queueSource || 'auto') || 'auto';
    }
    normalizeAndSyncAudioQueueBucket({ applyToState: activeQueueType === 'audio' || options.applyToState === true });
    if (options.refresh !== false && activeQueueType === 'audio') {
        refreshQueueViews();
    }
    if (options.updateIcons !== false) {
        updateShuffleIcon();
        updateRepeatIcon();
	            }
	            normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
	            logQueueMutation('audio-queue-commit', 'Unified audio queue committed', {
	                previousLength,
	                nextLength: safeArray(bucket.entries).length,
	                previousIndex,
	                nextIndex: Number(bucket.currentIndex ?? -1),
	                queueSource: sanitizeText(bucket.queueSource || 'auto')
	            });
	            return bucket;
	        }
function getUnifiedAudioQueueState() {
    return normalizeAndSyncAudioQueueBucket({ applyToState: false });
}
function getUnifiedAudioQueueCurrentEntry() {
    const bucket = getUnifiedAudioQueueState();
    return bucket.currentIndex >= 0 ? bucket.entries[bucket.currentIndex] || null : null;
}
function getUnifiedAudioQueueEntryByTrackId(trackId = '') {
    const id = sanitizeText(trackId || '');
    if (!id) return null;
    return getUnifiedAudioQueueState().entries.find((entry) => sanitizeText(entry?.trackId || '') === id) || null;
}
function resolveUnifiedAudioQueueEntryTrack(entry = null) {
    if (!entry) return null;
    const direct = (state.tracks || []).find((track) => track?.id === entry.trackId) || null;
    if (direct) return direct;
    if (entry.trackSnapshot && typeof entry.trackSnapshot === 'object') {
        return clonePrivateSessionValue(entry.trackSnapshot, null);
    }
    if (entry.sourceKind === 'online') {
        return buildOnlineMusicTrackSnapshotFromQueueEntry(entry);
    }
    return {
        id: entry.trackId,
        title: entry.title || 'Untitled',
        artist: entry.artist || '',
        cover: entry.cover || '',
        source: 'local',
        type: 'audio'
    };
}
function findUnifiedAudioQueueEntryIndexByTrackId(trackId = '') {
    const id = sanitizeText(trackId || '');
    if (!id) return -1;
    const bucket = getUnifiedAudioQueueState();
    return bucket.entries.findIndex((entry) => entry?.trackId === id);
}
function setUnifiedAudioQueueFromTrackList(tracks = [], currentTrackId = '', options = {}) {
    const helper = getAudioQueueHelper();
    const bucket = getAudioQueueBucketState();
    const audioTracks = (Array.isArray(tracks) ? tracks : [])
        .filter((track) => track && track.type !== 'video')
        .map((track) => isPrivateSessionTrackRecord(track)
            ? track
            : (isOnlineMusicTrackRecord(track)
                ? (sanitizeStoredOnlineMusicTrack(track) || track)
                : track));
    let entries = audioTracks.map((track) => buildAudioQueueEntrySnapshot(track)).filter(Boolean);
    const activeTrackId = sanitizeText(currentTrackId || '');
    let currentIndex = activeTrackId ? entries.findIndex((entry) => entry.trackId === activeTrackId) : -1;
    if (activeTrackId && currentIndex === -1) {
        const currentTrack = resolveQueueDisplayTrack(activeTrackId);
        const currentEntry = buildAudioQueueEntrySnapshot(currentTrack);
        if (currentEntry) {
            entries.unshift(currentEntry);
            currentIndex = 0;
        }
    }
    const isShuffle = !!options.isShuffle;
    const shuffleOrder = Array.isArray(options.shuffleOrder) && options.shuffleOrder.length
        ? options.shuffleOrder.slice()
        : (isShuffle
            ? (options.preserveShuffleOrder
                ? entries.map((entry) => entry.id)
                : (typeof helper.buildShuffleOrder === 'function'
                    ? helper.buildShuffleOrder(entries, currentIndex)
                    : entries.map((entry) => entry.id)))
            : []);
    return commitUnifiedAudioQueue({
        entries,
        currentIndex,
        isShuffle,
        repeatMode: options.repeatMode || bucket.repeatMode || 'none',
        shuffleOrder,
        queueSource: options.queueSource || bucket.queueSource || 'auto',
        pendingShuffleSeed: null,
        failedEntryIds: options.resetFailures ? [] : (bucket.failedEntryIds || []).slice()
    }, {
        refresh: options.refresh !== false
    });
}
function syncUnifiedAudioQueueCurrentTrack(track = null, options = {}) {
    if (!track || track.type === 'video') return null;
    const helper = getAudioQueueHelper();
    const bucket = getUnifiedAudioQueueState();
    let entries = bucket.entries.slice();
    let currentIndex = entries.findIndex((entry) => entry?.trackId === track.id);
    const insertedNewCurrent = currentIndex === -1;
    if (currentIndex === -1) {
        const nextEntry = buildAudioQueueEntrySnapshot(track);
        if (!nextEntry) return null;
        if (options.replaceDeck || !entries.length) {
            entries = [nextEntry];
        } else {
            entries = [nextEntry, ...entries.filter((entry) => entry?.trackId !== track.id)];
        }
        currentIndex = 0;
    } else {
        const existing = entries[currentIndex];
        const refreshed = buildAudioQueueEntrySnapshot(track) || existing;
        entries[currentIndex] = {
            ...existing,
            ...refreshed,
            id: existing.id
        };
    }
    const isShuffle = options.isShuffle != null ? !!options.isShuffle : bucket.isShuffle;
    const shuffleOrder = isShuffle
        ? (!insertedNewCurrent && bucket.isShuffle && typeof helper.normalizeState === 'function'
            ? helper.normalizeState({
                ...bucket,
                entries,
                currentIndex,
                isShuffle: true
            }).shuffleOrder
            : (typeof helper.buildShuffleOrder === 'function'
                ? helper.buildShuffleOrder(entries, currentIndex)
                : entries.map((entry) => entry.id)))
        : [];
    return commitUnifiedAudioQueue({
        entries,
        currentIndex,
        isShuffle,
        shuffleOrder,
        queueSource: options.queueSource || bucket.queueSource || 'auto',
        pendingShuffleSeed: null,
        failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : []
    }, {
        refresh: options.refresh !== false
    });
}
function queueUnifiedAudioTrack(track = null, placement = 'end', options = {}) {
    if (!track || track.type === 'video') return false;
    const helper = getAudioQueueHelper();
    const entry = buildAudioQueueEntrySnapshot(track);
    if (!entry) return false;
    const bucket = getUnifiedAudioQueueState();
    const nextState = placement === 'next' && typeof helper.insertPlayNext === 'function'
        ? helper.insertPlayNext(bucket, entry)
        : (typeof helper.insertToEnd === 'function' ? helper.insertToEnd(bucket, entry) : bucket);
    commitUnifiedAudioQueue({
        ...nextState,
        queueSource: 'manual',
        failedEntryIds: Array.isArray(bucket.failedEntryIds) ? bucket.failedEntryIds.slice() : [],
        pendingShuffleSeed: null
    });
    if (!options.quiet) {
        showToast(`${track.title || 'Track'} queued ${placement === 'next' ? 'next' : 'to the end'}.`, 'info');
    }
    return true;
}
function getUnifiedAudioQueueDisplayList() {
    const helper = getAudioQueueHelper();
    const bucket = getUnifiedAudioQueueState();
    const entries = typeof helper.upcomingEntries === 'function'
        ? helper.upcomingEntries(bucket)
        : [];
    return {
        type: bucket.isShuffle ? 'shuffle' : 'manual',
        entries,
        list: entries.map((entry) => resolveUnifiedAudioQueueEntryTrack(entry)).filter(Boolean)
    };
}
function setUnifiedAudioQueueCurrentIndexByTrackId(trackId = '') {
    const bucket = getUnifiedAudioQueueState();
    const nextIndex = findUnifiedAudioQueueEntryIndexByTrackId(trackId);
    if (nextIndex === -1) return false;
    commitUnifiedAudioQueue({
        currentIndex: nextIndex
    });
    return true;
}
function rememberAudioQueueFailure(entryId = '') {
    const bucket = getAudioQueueBucketState();
    const cleanId = sanitizeText(entryId || '');
    if (!cleanId) return false;
    if ((bucket.failedEntryIds || []).includes(cleanId)) return false;
    bucket.failedEntryIds = [...(bucket.failedEntryIds || []), cleanId];
    normalizeAndSyncAudioQueueBucket({ applyToState: activeQueueType === 'audio' });
    return true;
}
function saveActiveQueueBucket() {
    if (activeQueueType === 'audio') {
        const bucket = getAudioQueueBucketState();
        bucket.queueSource = state.queueSource || bucket.queueSource || 'auto';
        bucket.isShuffle = !!state.isShuffle;
        bucket.repeatMode = state.repeatMode || bucket.repeatMode || 'none';
        bucket.pendingShuffleSeed = state.pendingShuffleSeed || bucket.pendingShuffleSeed || null;
        normalizeAndSyncAudioQueueBucket({ applyToState: false });
        normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
        return;
    }
    const bucket = getQueueBucket(activeQueueType);
    bucket.queue = [...state.queue];
    bucket.queueSource = state.queueSource;
    bucket.isShuffle = state.isShuffle;
    bucket.repeatMode = state.repeatMode;
    bucket.shuffleQueue = [...state.shuffleQueue];
    bucket.shuffleIndex = state.shuffleIndex;
    bucket.pendingShuffleSeed = state.pendingShuffleSeed;
    normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
}
function loadQueueBucket(type = 'audio') {
    if (type === 'audio') {
        normalizeAndSyncAudioQueueBucket({ applyToState: true });
        activeQueueType = 'audio';
        normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
        return;
    }
    const bucket = getQueueBucket(type);
    state.queue = [...bucket.queue];
    state.queueSource = bucket.queueSource;
    state.isShuffle = bucket.isShuffle;
    state.repeatMode = bucket.repeatMode;
    state.shuffleQueue = [...bucket.shuffleQueue];
    state.shuffleIndex = bucket.shuffleIndex;
    state.pendingShuffleSeed = bucket.pendingShuffleSeed;
    activeQueueType = type;
    normalizeRuntimeState({ allowStopWhenQueueEmpty: false });
}
function ensureQueueForType(type) {
    if (!type) type = 'audio';
    if (type !== activeQueueType) {
        saveActiveQueueBucket();
        loadQueueBucket(type);
    }
}
function currentMediaType() {
    const t = getActivePlaybackTrack();
    return (t && t.type === 'video') ? 'video' : 'audio';
}
function isOnlineMusicPlaybackActive() {
    return state.currentPlaybackSource === 'online-music' && !!getOnlineMusicState().currentTrackId;
}
function getActivePlaybackTrack() {
    if (isOnlineMusicPlaybackActive()) return getOnlineMusicCurrentTrack();
    return getCurrentTrack();
}

	        function stopLocalMediaTransport(options = {}) {
	            const opts = { resetTime: false, ...options };
	            const aud = els.audio;
	            if (!aud) return false;
	            logAction('local-transport-stop', 'Stopping local media transport', {
	                resetTime: !!opts.resetTime,
	                trackId: sanitizeText(state.currentTrackId || '')
	            });
	            safePauseMedia(aud);
	            if (state.progressInterval) {
	                clearInterval(state.progressInterval);
	                state.progressInterval = null;
	            }
    if (opts.resetTime) {
        if (!safeSeekMedia(aud, 0)) {
            safeCall(() => { aud.currentTime = 0; });
        }
    }
	            finishSourceLoad();
	            return true;
	        }

	        function handoffToLocalPlayback(options = {}) {
	            const opts = { resetOnlineTime: false, stopLocalTransport: true, ...options };
	            logSourceTransition('handoff-local', 'Switching playback source to local media', {
	                from: sanitizeText(state.currentPlaybackSource || ''),
	                resetOnlineTime: !!opts.resetOnlineTime,
	                stopLocalTransport: !!opts.stopLocalTransport
	            });
	            deactivateOnlineMusicTransport({
	                nextPlaybackSource: 'local',
	                stopPlayer: true,
	                resetTime: !!opts.resetOnlineTime
	            });
	            if (opts.stopLocalTransport) {
	                stopLocalMediaTransport({ resetTime: false });
	            }
	            state.currentPlaybackSource = 'local';
	            scheduleDebugOverlayRefresh();
	        }

	        function handoffToOnlinePlayback(options = {}) {
	            logSourceTransition('handoff-online', 'Switching playback source to online player', {
	                from: sanitizeText(state.currentPlaybackSource || ''),
	                resetLocalTime: !!options.resetLocalTime
	            });
	            stopLocalMediaTransport({ resetTime: !!options.resetLocalTime });
	            state.currentPlaybackSource = 'online-music';
	            scheduleDebugOverlayRefresh();
	        }

function getTrackQueueSourceKind(track = null) {
    return isOnlineMusicTrackRecord(track) ? 'online' : 'local';
}

function getQueueAllowedSourceMode() {
    const mode = sanitizeText(getAppSettings().queue?.allowedSources || 'both').toLowerCase();
    return ['both', 'local', 'online'].includes(mode) ? mode : 'both';
}

function getQueueAllowedSourceLabel(mode = '') {
    if (mode === 'local') return 'Local only';
    if (mode === 'online') return 'Online only';
    return 'Both';
}

function canQueueTrackInContext(track = null, options = {}) {
    if (!track) return false;
    const source = getTrackQueueSourceKind(track);
    const contextTab = sanitizeText(options.contextTab || state.activeTab || '').toLowerCase();
    if (contextTab === 'online-music' && source === 'online') return true;
    const allowed = getQueueAllowedSourceMode();
    return allowed === 'both' || allowed === source;
}

function isOnlineQueueTrackId(id = '') {
    const raw = sanitizeText(id || '');
    return /^(?:yt|youtube|itunes|deezer|spotify)[:_]/i.test(raw);
}

function isOnlineOnlyQueueIds(ids = []) {
    const list = (Array.isArray(ids) ? ids : []).map((id) => sanitizeText(id || '')).filter(Boolean);
    return list.length > 0 && list.every((id) => isOnlineQueueTrackId(id));
}

function detachSharedOnlineQueueContext(options = {}) {
    const opts = { clearAudioQueue: false, persist: true, ...options };
    if (!isSharedOnlineMusicQueuePlayback()) return false;
    const online = getOnlineMusicState();
    online.playbackContext = 'library';
    online.queueContextView = 'library';
    online.queueContextKey = 'library';
    let queueMutated = false;
    if (opts.clearAudioQueue) {
        const audioBucket = getQueueBucket('audio');
        if (isOnlineOnlyQueueIds(audioBucket.queue)) {
            audioBucket.queue = [];
            if (audioBucket.queueSource !== 'radio') audioBucket.queueSource = 'auto';
            queueMutated = true;
        }
        if (isOnlineOnlyQueueIds(audioBucket.shuffleQueue)) {
            audioBucket.shuffleQueue = [];
            audioBucket.shuffleIndex = -1;
            audioBucket.pendingShuffleSeed = null;
            queueMutated = true;
        }
        if (queueMutated && activeQueueType === 'audio') {
            loadQueueBucket('audio');
            refreshQueueViews();
            saveActiveQueueBucket();
        }
    }
    if (opts.persist) persistOnlineMusicState();
    return true;
}

function notifyQueueSourceBlocked(track = null) {
    const sourceLabel = getTrackQueueSourceKind(track) === 'online' ? 'Online tracks' : 'Local tracks';
    const allowedLabel = getQueueAllowedSourceLabel(getQueueAllowedSourceMode());
    const extraHint = getTrackQueueSourceKind(track) === 'online'
        ? ' Online Music still allows online queueing.'
        : '';
    showToast(`${sourceLabel} are blocked while Queue Source is set to ${allowedLabel}.${extraHint}`, 'info');
}

function ensureManualQueueAllowed(track = null, options = {}) {
    if (canQueueTrackInContext(track, options)) return true;
    if (!options.quiet) notifyQueueSourceBlocked(track);
    return false;
}

function renderQueueSourceBadge(track = null) {
    const source = getTrackQueueSourceKind(track);
    const tone = source === 'online'
        ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
        : 'border-white/10 bg-black/30 text-gray-300';
    const label = source === 'online' ? 'Online' : 'Local';
    return `<span class="rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${tone}">${label}</span>`;
}

function isCurrentLibraryTrack(track = null) {
    return !!track && !!state.currentTrackId && track.id === state.currentTrackId;
}
function clearLocalTrackHighlights() {
    document.querySelectorAll('[data-track-id]').forEach(el => el.classList.remove('track-active'));
    document.querySelectorAll('.track-playing-overlay').forEach(el => el.classList.add('hidden'));
    lastActiveTrackId = null;
}
    let videoControlsHideTimer = null;
    let videoFilterPersistTimer = null;
    let videoScrubbing = false;
    let lastPointerInVideo = false;
    let hoverPreviewRaf = null;
    let lastHoverEvent = null;
    let autoManagedVideoPiP = false;
    let visibilityPauseTriggered = false;
    let skipOutroHandledTrackId = null;
    state.videoSharpness = 0;
    state.videoBrightness = 1; // normalized (1 = neutral)
    state.videoContrast = 1; // neutral
// Track which element should be highlighted as "current" so autoâ€‘advances
// (ended event -> playNext -> loadTrack) always update the UI selection.
let lastActiveTrackId = null;
