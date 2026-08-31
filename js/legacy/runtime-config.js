/* Legacy constants, feature registry, defaults, and shared configuration.
 * Extracted from NexPlay.html without behavior changes. New code should use js/core, js/ui, and js/features modules. */

// --- CONSTANTS & CONFIG ---
// Demo library left empty so users start with their own media.
const DEMO_TRACKS = [];

	        const EQ_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
	        const EQ_PRESETS = {
	            flat:  [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	            bass:  [ 9, 8, 5, 1,-2,-3,-2, 1, 2, 1],
	            rock:  [ 5, 4, 2,-1,-3, 1, 4, 5, 4, 3],
	            pop:   [ 3, 4, 2, 0,-1, 2, 4, 5, 4, 3],
	            vocal: [-8,-6,-3, 2, 5, 7, 5, 2, 0,-2]
	        };
	        const EQ_DEFAULT_PRESET = 'flat';
	        const EQ_CUSTOM_PRESET = 'custom';
	        const EQ_MIN_DB = -12;
	        const EQ_MAX_DB = 12;
	        const EQ_GAIN_SMOOTH_TIME = 0.03;
	        const EQ_PREAMP_SMOOTH_TIME = 0.035;
	        const EQ_FILTER_Q_VALUES = [0.707, 0.95, 1.05, 1.1, 1.05, 1.05, 1.0, 0.95, 0.9, 0.707];

// Safe UUID generator (falls back for browsers without crypto.randomUUID)
function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const rand = Math.random().toString(36).slice(2, 10);
    const time = Date.now().toString(36);
    return `id-${time}-${rand}`;
}

function refreshLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// Map legacy/unknown visualizer styles to supported ones
function normalizeVisualizerStyle(style) {
    if (style === 'radial' || style === 'halo') return 'bars'; // migrate old settings
    const supported = ['bars', 'wave', 'dots'];
    return supported.includes(style) ? style : 'bars';
}

function getFileExtension(file) {
    const name = (file && file.name) || '';
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function isVideoFile(file) {
    const type = (file && file.type) || '';
    const ext = getFileExtension(file);
    const videoExts = ['.mkv', '.mk3d', '.mks', '.webm', '.mp4', '.m4v', '.mov', '.avi', '.mpg', '.mpeg', '.ogv'];
    return type.startsWith('video') || videoExts.includes(ext);
}

function isAudioFile(file) {
    const type = (file && file.type) || '';
    const ext = getFileExtension(file);
    const audioExts = ['.mp3', '.aac', '.flac', '.wav', '.ogg', '.oga', '.m4a', '.opus', '.alac'];
    return type.startsWith('audio') || audioExts.includes(ext);
}

const VIDEO_URL_LIBRARY_KEY = 'nexplay_video_url_library';
	        const ONLINE_MUSIC_STATE_KEY = 'nexplay_online_music_state_v2';
	        const ONLINE_MUSIC_LIBRARY_KEY = 'nexplay_online_music_library_v2';
	        const ONLINE_MUSIC_ARTIST_CATALOG_SCHEMA_VERSION = 3;
	        const ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY = 'nexplay_online_release_tracks_cache_v1';
	        const ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION = 1;
	        const ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
	        const ONLINE_MUSIC_RELEASE_TRACKS_CACHE_ENTRY_LIMIT = 48;
	        const ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TRACK_LIMIT = 200;
	        const ONLINE_MUSIC_RELEASE_TRACKS_CACHE_BYTE_LIMIT = 1_500_000;
	        const ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_LIMIT = 6;
	        const ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_CONCURRENCY = 2;
	        const ONLINE_MUSIC_ARTIST_WORK_SORT_OPTIONS = Object.freeze([
	            { id: 'best', label: 'Best Match' },
	            { id: 'date-desc', label: 'Newest' },
	            { id: 'date-asc', label: 'Oldest' },
	            { id: 'name-asc', label: 'A-Z' },
	            { id: 'name-desc', label: 'Z-A' },
	            { id: 'tracks-desc', label: 'Most Tracks' },
	            { id: 'tracks-asc', label: 'Fewest Tracks' }
	        ]);
	        const SESSION_RUNTIME_FLAG_KEY = 'nexplay_runtime_session_v1';
	        const SESSION_SNAPSHOT_KEY = 'nexplay_session_snapshot_v1';
	        const SESSION_SNAPSHOT_SCHEMA_VERSION = 1;
	        const APP_STATE_STORAGE_KEY = 'nexplay_pro_state';
	        const APP_STATE_BACKUP_STORAGE_KEY = 'nexplay_pro_state_backup_v1';
	        const DESKTOP_PERFORMANCE_PRESET_STORAGE_KEY = 'nexplay_desktop_performance_preset_v1';
	        const DIAGNOSTIC_ENTRY_LIMIT = 50;
	        const RECOVERY_RETRY_LIMIT = 1;
	        const LOADING_WATCHDOG_DEFAULT_MS = 12000;
	        const YOUTUBE_EMBED_HOST = 'https://www.youtube.com';
const LOCAL_LIBRARY_INDEX_KEY = 'nexplay_local_library_v1';
const LOCAL_LIBRARY_DB_NAME = 'nexplay_local_media_v1';
const LOCAL_LIBRARY_DB_STORE = 'tracks';
// Intentionally empty: this file is served publicly by the web build, so a
// baked-in key would be readable by anyone. Users supply their own under
// Settings > Online Music, which takes priority via
// `syncConfiguredOnlineMusicApiKey() || YOUTUBE_DATA_API_KEY`.
const YOUTUBE_DATA_API_KEY = '';
const ONLINE_MUSIC_SEARCH_LIMIT = 12;
const DESKTOP_ONLINE_MUSIC_SEARCH_TIMEOUT_MS = 9000;
const DESKTOP_ONLINE_MUSIC_CONNECT_TIMEOUT_MS = 6500;
const DESKTOP_ONLINE_MUSIC_AUDIO_STREAM_TIMEOUT_MS = 9000;
const DESKTOP_ONLINE_MUSIC_AUDIO_READY_TIMEOUT_MS = 7000;
const DESKTOP_ONLINE_MUSIC_AUDIO_STALL_TIMEOUT_MS = 12000;
const DIRECT_VIDEO_URL_EXTENSIONS = new Set([
    '.mp4', '.webm', '.m4v', '.mov', '.ogv', '.ogg', '.mkv', '.avi', '.mpeg', '.mpg'
]);
const FEATURE_REGISTRY = Object.freeze({
    core_universal_resume: 'core_universal_resume',
    core_queue_snapshots: 'core_queue_snapshots',
    core_smart_autoqueue: 'core_smart_autoqueue',
    core_chapter_bookmarks: 'core_chapter_bookmarks',
    core_link_collections: 'core_link_collections',
    core_offline_export_import: 'core_offline_export_import',
    creative_scene_packs: 'creative_scene_packs',
    creative_beat_reactive_ui: 'creative_beat_reactive_ui',
    creative_story_mode: 'creative_story_mode',
    creative_moment_capture: 'creative_moment_capture',
    creative_dynamic_cover_wall: 'creative_dynamic_cover_wall',
    creative_mood_dial: 'creative_mood_dial'
});
const FEATURE_GROUPS = Object.freeze({
    core: Object.freeze([
        FEATURE_REGISTRY.core_universal_resume,
        FEATURE_REGISTRY.core_queue_snapshots,
        FEATURE_REGISTRY.core_smart_autoqueue,
        FEATURE_REGISTRY.core_chapter_bookmarks,
        FEATURE_REGISTRY.core_link_collections,
        FEATURE_REGISTRY.core_offline_export_import
    ]),
    creative: Object.freeze([
        FEATURE_REGISTRY.creative_scene_packs,
        FEATURE_REGISTRY.creative_beat_reactive_ui,
        FEATURE_REGISTRY.creative_story_mode,
        FEATURE_REGISTRY.creative_moment_capture,
        FEATURE_REGISTRY.creative_dynamic_cover_wall,
        FEATURE_REGISTRY.creative_mood_dial
    ])
});
const FEATURE_IDS = Object.freeze([...FEATURE_GROUPS.core, ...FEATURE_GROUPS.creative]);
const WINDOWED_HEAVY_FEATURE_IDS = Object.freeze([
    FEATURE_REGISTRY.creative_scene_packs,
    FEATURE_REGISTRY.creative_beat_reactive_ui,
    FEATURE_REGISTRY.creative_mood_dial
]);
const FEATURE_TOGGLE_STORAGE_KEY = 'nexplay_feature_toggles_v1';
const PIANO_TILES_STORAGE_KEYS = Object.freeze({
    beatmaps: 'nexplay_piano_tiles_beatmaps_v2',
    scores: 'nexplay_piano_tiles_scores_v1',
    keyBindings: 'nexplay_piano_tiles_keybindings_v1'
});
const EXTENDED_STORAGE_KEYS = Object.freeze({
    resumeStore: 'nexplay_resume_store_v1',
        queueSnapshots: 'nexplay_queue_snapshots_v1',
        chapterBookmarks: 'nexplay_chapter_bookmarks_v1',
        linkCollections: 'nexplay_link_collections_v1',
        momentCaptures: 'nexplay_moment_captures_v1',
        moodDialState: 'nexplay_mood_dial_state_v1',
        storyModeState: 'nexplay_story_mode_state_v1',
        scenePackState: 'nexplay_scene_pack_state_v1',
        coverWallState: 'nexplay_cover_wall_state_v1',
        videoFilterStore: 'nexplay_video_filter_store_v1'
    });
const BACKUP_SCHEMA_VERSION = 'nexplay_backup_v1';
const FEATURE_META = Object.freeze({
    core_universal_resume: { title: 'Universal Resume', hint: 'Resume audio/video/direct URL and provider metadata' },
    core_queue_snapshots: { title: 'Queue Snapshots', hint: 'Save and restore named queue states' },
    core_smart_autoqueue: { title: 'Smart Auto-Queue 2.0', hint: 'Weighted queue scoring with deterministic ordering' },
    core_chapter_bookmarks: { title: 'Chapter Bookmarks', hint: 'Per-track timestamp bookmarks with labels' },
    core_link_collections: { title: 'Link Collections', hint: 'Folder layer for saved online links' },
    core_offline_export_import: { title: 'Offline Export/Import', hint: 'Backup and restore app data as JSON' },
    creative_scene_packs: { title: 'Visual Scene Packs', hint: 'Themed scene classes and backdrop effects' },
    creative_beat_reactive_ui: { title: 'Beat-Reactive UI', hint: 'Analyser-driven UI intensity updates' },
    creative_story_mode: { title: 'Story Mode Playlist', hint: 'Warmup -> peak -> cooldown queue generation' },
    creative_moment_capture: { title: 'Moment Capture', hint: 'Save/reopen moments with notes and context' },
    creative_dynamic_cover_wall: { title: 'Dynamic Cover Wall', hint: 'Live collage in stats/library surfaces' },
    creative_mood_dial: { title: 'Mood Dial', hint: 'Bias queue scoring and visual intensity' }
});
const DEFAULT_SCENE_PACK = 'default';
const SCENE_PACKS = Object.freeze({
    default: { id: 'default', label: 'Default Orbit', className: '' },
    aurora: { id: 'aurora', label: 'Aurora Drift', className: 'scene-pack-aurora' },
    ember: { id: 'ember', label: 'Ember Pulse', className: 'scene-pack-ember' },
    midnight: { id: 'midnight', label: 'Midnight Grid', className: 'scene-pack-midnight' },
    nebula: { id: 'nebula', label: 'Nebula Bloom', className: 'scene-pack-nebula' },
    voltage: { id: 'voltage', label: 'Voltage Surge', className: 'scene-pack-voltage' },
    prism: { id: 'prism', label: 'Prism Spectrum', className: 'scene-pack-prism' },
    circuit: { id: 'circuit', label: 'Circuit Flow', className: 'scene-pack-circuit' }
});
const NAV_TABS = Object.freeze([
    { id: 'all', l: 'Library', i: 'list' },
    { id: 'audio', l: 'Audio', i: 'music' },
    { id: 'videos', l: 'Videos', i: 'video' },
    { id: 'online-videos', l: 'Online Videos', i: 'globe-2' },
    { id: 'online-music', l: 'Online Music', i: 'radio' },
    { id: 'favorites', l: 'Favorites', i: 'heart' },
    { id: 'playlists', l: 'Playlists', i: 'list-plus' },
    { id: 'history', l: 'History', i: 'history' },
    { id: 'top', l: 'Top Played', i: 'trending-up' },
    { id: 'stats', l: 'Stats', i: 'bar-chart-3' },
    { id: 'tags', l: 'Tags', i: 'tag' },
    { id: 'smart', l: 'Smart', i: 'list-plus' },
    { id: 'music-games', l: 'Music Games', i: 'gamepad-2' },
    { id: 'settings', l: 'Settings', i: 'settings-2' },
    { id: 'notypad', l: 'NotyPad', i: 'file-text' }
]);
const MUSIC_GAME_DEFINITIONS = Object.freeze([
    {
        id: 'piano-tiles',
        title: 'NexBeat Tiles',
        icon: 'keyboard',
        description: 'Tap falling beat tiles with fully customizable lane controls while NexPlay maps songs into fair rhythm patterns.',
        accent: 'from-cyan-500/18 via-emerald-300/10 to-transparent'
    },
    {
        id: 'math-unlock',
        title: 'Math Unlock Game',
        icon: 'calculator',
        description: 'Pick any song from your library, solve the equation, and unlock normal NexPlay playback.',
        accent: 'from-cyan-500/18 via-cyan-400/8 to-transparent'
    },
    {
        id: 'snake-album-covers',
        title: 'Snake (Album Covers)',
        icon: 'disc-3',
        description: 'Run a no-fail board with edge-bounce movement, combo scoring, and album-cover pickups from your own library.',
        accent: 'from-emerald-500/18 via-emerald-300/10 to-transparent'
    },
    {
        id: 'song-race',
        title: 'Song Race',
        icon: 'flag',
        description: 'Draft a race from your library and trigger tactical boosts while the standings update in real time.',
        accent: 'from-amber-500/18 via-orange-300/10 to-transparent'
    },
    {
        id: 'memory-playlist',
        title: 'Memory Playlist Game',
        icon: 'list-music',
        description: 'Replay cover-flash patterns with strike limits, hint reveals, and automatic round escalation.',
        accent: 'from-violet-500/18 via-fuchsia-300/10 to-transparent'
    },
    {
        id: 'whos-that-artist',
        title: 'Who’s That Artist?',
        icon: 'mic-vocal',
        description: 'Hear a short local snippet and pick the correct artist from clean multiple-choice options.',
        accent: 'from-sky-500/18 via-cyan-300/10 to-transparent'
    },
    {
        id: 'finish-the-lyrics',
        title: 'Finish the Lyrics',
        icon: 'quote',
        description: 'Complete missing words from lyrics already stored in your NexPlay library.',
        accent: 'from-rose-500/18 via-pink-300/10 to-transparent'
    },
    {
        id: 'guess-the-song',
        title: 'Guess the Song',
        icon: 'music-4',
        description: 'Listen to a quick clip and lock in the right title from local-library decoy choices.',
        accent: 'from-blue-500/18 via-indigo-300/10 to-transparent'
    }
]);
const MUSIC_GAME_BY_ID = Object.freeze(Object.fromEntries(MUSIC_GAME_DEFINITIONS.map((game) => [game.id, game])));
const MUSIC_GAME_PREVIEW_FADE_MS = 140;
const MUSIC_GAME_DEFAULT_SNIPPET_SECONDS = 3.6;
const MUSIC_GAME_SNAKE_TICK_MS = 360;
const MUSIC_GAME_SONG_RACE_TICK_MS = 120;
const MUSIC_GAME_MEMORY_REVEAL_MS = 760;
const PIANO_TILES_LANE_COUNT = 3;
const PIANO_TILES_DEFAULT_KEYS = Object.freeze(['Numpad1', 'Numpad2', 'Numpad3']);
const PIANO_TILES_DEFAULT_BINDINGS = Object.freeze([
    Object.freeze({ id: 'lane-0', label: 'Lane 1', code: 'Numpad1', key: '1', display: 'Numpad 1' }),
    Object.freeze({ id: 'lane-1', label: 'Lane 2', code: 'Numpad2', key: '2', display: 'Numpad 2' }),
    Object.freeze({ id: 'lane-2', label: 'Lane 3', code: 'Numpad3', key: '3', display: 'Numpad 3' })
]);
const NEXPLAY_KEYBINDING_CANCEL_CODES = Object.freeze(['Escape']);
const NEXPLAY_KEYBINDING_INVALID_CODES = Object.freeze(['', 'Unidentified', 'Process', 'Dead', 'Tab']);
const PIANO_TILES_LEAD_TIME_SECONDS = 2.05;
const PIANO_TILES_HIT_WINDOWS = Object.freeze({
    perfect: 0.052,
    great: 0.092,
    good: 0.138,
    miss: 0.18
});
const PIANO_TILES_PATTERN_PROFILES = Object.freeze({
    early: Object.freeze({
        id: 'early',
        label: 'Readable warmup',
        minGap: 0.34,
        repeatGap: 0.58,
        fastWideGap: 0.42,
        bounceGap: 0.54,
        maxSameRun: 1,
        snapSubdivision: 1,
        snapTolerance: 0.072,
        density: 0.68
    }),
    mid: Object.freeze({
        id: 'mid',
        label: 'Flow patterns',
        minGap: 0.24,
        repeatGap: 0.42,
        fastWideGap: 0.31,
        bounceGap: 0.42,
        maxSameRun: 2,
        snapSubdivision: 2,
        snapTolerance: 0.062,
        density: 0.82
    }),
    late: Object.freeze({
        id: 'late',
        label: 'Advanced but fair',
        minGap: 0.18,
        repeatGap: 0.30,
        fastWideGap: 0.24,
        bounceGap: 0.34,
        maxSameRun: 2,
        snapSubdivision: 2,
        snapTolerance: 0.052,
        density: 0.94
    })
});
const PIANO_TILES_PATTERN_LIBRARY = Object.freeze([
    Object.freeze({ id: 'center-walk', stages: Object.freeze(['early', 'mid', 'late']), sequence: Object.freeze([1, 0, 1, 2]), weight: 7 }),
    Object.freeze({ id: 'left-wave', stages: Object.freeze(['early', 'mid', 'late']), sequence: Object.freeze([0, 1, 2, 1]), weight: 6 }),
    Object.freeze({ id: 'right-wave', stages: Object.freeze(['early', 'mid', 'late']), sequence: Object.freeze([2, 1, 0, 1]), weight: 6 }),
    Object.freeze({ id: 'step-up', stages: Object.freeze(['mid', 'late']), sequence: Object.freeze([0, 1, 2, 1, 2]), weight: 4 }),
    Object.freeze({ id: 'step-down', stages: Object.freeze(['mid', 'late']), sequence: Object.freeze([2, 1, 0, 1, 0]), weight: 4 }),
    Object.freeze({ id: 'center-pivot', stages: Object.freeze(['mid', 'late']), sequence: Object.freeze([1, 0, 1, 2, 1, 0]), weight: 5 }),
    Object.freeze({ id: 'late-crossflow', stages: Object.freeze(['late']), sequence: Object.freeze([0, 1, 2, 1, 0, 1, 2]), weight: 3 }),
    Object.freeze({ id: 'late-syncopation', stages: Object.freeze(['late']), sequence: Object.freeze([2, 1, 0, 1, 2, 0, 1]), weight: 2 })
]);
function createDefaultMusicGamesState() {
    return {
        view: 'hub',
        activeGameId: null,
        playbackSnapshot: null,
        preview: {
            active: false,
            suppressMetrics: false,
            trackId: null,
            previewTrack: null,
            uiShellSnapshot: null,
            endTimerId: null,
            token: 0
        },
        pianoTiles: {
            phase: 'select',
            selectedTrackId: null,
            analysisStatus: 'Choose a song to analyze.',
            analysisProgress: 0,
            beatmap: null,
            beatmapSource: '',
            error: '',
            isRunning: false,
            startedAt: 0,
            endedAt: 0,
            score: 0,
            combo: 0,
            bestCombo: 0,
            hits: 0,
            misses: 0,
            accuracyTotal: 0,
            lastJudgement: '',
            lastScore: 0,
            highScore: 0,
            newHighScore: false,
            currentTime: 0,
            duration: 0,
            bindingLaneIndex: null,
            bindingMessage: '',
            bindingMessageType: '',
            laneKeys: PIANO_TILES_DEFAULT_KEYS.slice(),
            laneBindings: PIANO_TILES_DEFAULT_BINDINGS.map((binding) => ({ ...binding })),
            rafId: 0,
            inputLockedUntil: 0,
            playbackToken: 0
        },
        mathUnlock: {
            selectedTrackId: null,
            challenge: null,
            submittedAnswer: '',
            feedback: '',
            unlockedTrackId: null
        },
        snake: {
            boardSize: 12,
            snake: [],
            direction: 'right',
            pendingDirection: 'right',
            food: null,
            hazards: [],
            collectedCovers: [],
            score: 0,
            combo: 1,
            bestCombo: 1,
            totalFood: 0,
            running: false,
            gameOver: false,
            endReason: '',
            startedAt: 0,
            speedMs: MUSIC_GAME_SNAKE_TICK_MS,
            tickTimerId: null,
            rafId: null,
            lastStepAt: 0,
            motionFrom: [],
            motionSerial: 0
        },
        songRace: {
            lanes: [],
            selectedTrackIds: [],
            winnerTrackId: null,
            winnerSnippetRaceId: null,
            leaderTrackId: null,
            userBoostsRemaining: 2,
            phaseLabel: 'Ready',
            raceId: 0,
            running: false,
            finished: false,
            elapsedMs: 0,
            tickTimerId: null,
            finishTimerId: null,
            startAt: 0
        },
        memoryPlaylist: {
            round: 1,
            sequenceTrackIds: [],
            poolTrackIds: [],
            inputTrackIds: [],
            showingSequence: false,
            highlightedTrackId: null,
            feedback: '',
            roundComplete: false,
            strikes: 0,
            maxStrikes: 3,
            hintTrackId: null,
            hintsUsed: 0,
            revealToken: 0,
            revealTimerId: null,
            advanceToken: 0,
            advanceTimerId: null
        },
        whosThatArtist: {
            round: 1,
            trackId: null,
            optionArtists: [],
            correctArtist: '',
            selectedArtist: '',
            answered: false,
            feedback: ''
        },
        finishTheLyrics: {
            round: 1,
            trackId: null,
            promptLine: '',
            promptDisplay: '',
            promptTimeSeconds: null,
            promptReplayDurationSeconds: MUSIC_GAME_DEFAULT_SNIPPET_SECONDS,
            timedSource: false,
            optionWords: [],
            correctWord: '',
            selectedWord: '',
            answered: false,
            feedback: '',
            unavailableReason: ''
        },
        guessTheSong: {
            round: 1,
            trackId: null,
            lastTrackId: null,
            previewToken: 0,
            optionTrackIds: [],
            correctTrackId: null,
            selectedTrackId: '',
            answered: false,
            feedback: ''
        }
    };
}
const SMART_PLAYLISTS = Object.freeze([
    {
        id: 'recentlyAdded',
        label: 'Recently Added',
        description: 'Fresh additions from your audio library.',
        emptyMessage: 'No recently added audio tracks yet.',
        getTracks: () => getSmartAudioLibraryTracks()
            .slice()
            .sort((a, b) => Number(b.addedAt || 0) - Number(a.addedAt || 0))
            .slice(0, 20)
    },
    {
        id: 'recentlyPlayed',
        label: 'Recently Played',
        description: 'Your latest audio listens in order.',
        emptyMessage: 'No recently played audio tracks yet.',
        getTracks: () => (state.playHistory || [])
            .map((id) => state.tracks.find((track) => track && track.id === id))
            .filter((track) => track && track.type === 'audio')
    },
    {
        id: 'mostPlayed',
        label: 'Most Played',
        description: 'Audio tracks with the strongest listening history.',
        emptyMessage: 'Play a few audio tracks to build this list.',
        getTracks: () => getSmartAudioLibraryTracks()
            .filter((track) => Number(track.playCount || 0) > 0)
            .slice()
            .sort((a, b) => {
                const bCount = Number(b.playCount || 0);
                const aCount = Number(a.playCount || 0);
                if (bCount !== aCount) return bCount - aCount;
                return Number(b.lastPlayedAt || 0) - Number(a.lastPlayedAt || 0);
            })
            .slice(0, 20)
    },
    {
        id: 'neverPlayed',
        label: 'Never Played',
        description: 'Audio tracks still waiting for a first play.',
        emptyMessage: 'Every audio track has already been played.',
        getTracks: () => getSmartAudioLibraryTracks()
            .filter((track) => !Number(track.playCount || 0))
            .slice()
            .sort((a, b) => Number(b.addedAt || 0) - Number(a.addedAt || 0))
    },
    {
        id: 'favoritesMix',
        label: 'Favorites Mix',
        description: 'Favorited audio tracks ranked by your smart queue signals.',
        emptyMessage: 'Mark some audio tracks as favorites to build this mix.',
        getTracks: () => sortSmartTracksByScore(
            getSmartAudioLibraryTracks().filter((track) => !!track.isFavorite),
            getSmartAnchorTrack()
        ).slice(0, 20)
    },
    {
        id: 'recommendedNext',
        label: 'Recommended Next',
        description: 'Auto-queue style picks based on the current audio track.',
        emptyMessage: 'Start an audio track to generate recommendations.',
        getTracks: () => getSmartRecommendedNextData().tracks,
        getReason: (track) => getSmartRecommendedNextData().reasons?.[track?.id || ''] || ''
    }
]);

// Global safety helpers used across persistence, DOM access, and playback guards.
function safeCall(fn, fallback = null) {
    try {
        return typeof fn === 'function' ? fn() : fallback;
    } catch (_) {
        return fallback;
    }
}

function safeQuery(selector, root = document) {
    if (!selector || !root || typeof root.querySelector !== 'function') return null;
    return safeCall(() => root.querySelector(selector), null);
}

function safeParseJSON(str, fallback) {
    if (typeof str !== 'string' || !str.trim()) return fallback;
    return safeCall(() => JSON.parse(str), fallback);
}

function isValidNumber(n) {
    return Number.isFinite(Number(n));
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!isValidNumber(num)) return Number(min) || 0;
    const safeMin = isValidNumber(min) ? Number(min) : 0;
    const safeMax = isValidNumber(max) ? Number(max) : safeMin;
    const lower = Math.min(safeMin, safeMax);
    const upper = Math.max(safeMin, safeMax);
    return Math.min(upper, Math.max(lower, num));
}

function safeArray(arr) {
    return Array.isArray(arr) ? arr : [];
}

	        function clampNumber(value, min, max, fallback) {
	            if (!isValidNumber(value)) return fallback;
	            return clamp(value, min, max);
	        }

	        // Equalizer helpers keep preset/band validation consistent across UI, persistence, and runtime.
	        function getDefaultEqBandValues() {
	            return (EQ_PRESETS[EQ_DEFAULT_PRESET] || []).slice();
	        }

	        function sanitizeEqPresetName(name = '', options = {}) {
	            const opts = { allowCustom: true, ...options };
	            const clean = sanitizeText(String(name || '')).toLowerCase();
	            if (Object.prototype.hasOwnProperty.call(EQ_PRESETS, clean)) return clean;
	            if (opts.allowCustom && clean === EQ_CUSTOM_PRESET) return EQ_CUSTOM_PRESET;
	            return EQ_DEFAULT_PRESET;
	        }

	        function sanitizeEqBandValues(values = null, fallback = null) {
	            const base = Array.isArray(fallback) ? fallback.slice() : getDefaultEqBandValues();
	            const safe = Array.isArray(values) ? values : [];
	            return EQ_FREQUENCIES.map((_, index) => {
	                const next = Number(safe[index]);
	                if (!Number.isFinite(next)) return clamp(base[index] ?? 0, EQ_MIN_DB, EQ_MAX_DB);
	                return clamp(next, EQ_MIN_DB, EQ_MAX_DB);
	            });
	        }

	        function formatEqDb(value = 0) {
	            const safe = clamp(Number(value) || 0, EQ_MIN_DB, EQ_MAX_DB);
	            if (Math.abs(safe) < 0.001) return '0 dB';
	            const rounded = Math.round(safe * 10) / 10;
	            return `${rounded > 0 ? '+' : ''}${rounded} dB`;
	        }

	        function dbToLinearGain(db = 0) {
	            const safeDb = clamp(Number(db) || 0, -24, 12);
	            return Math.pow(10, safeDb / 20);
	        }

	        function getEqFilterType(index = 0) {
	            const safeIndex = Math.max(0, Math.min(EQ_FREQUENCIES.length - 1, Number(index) || 0));
	            if (safeIndex === 0) return 'lowshelf';
	            if (safeIndex === EQ_FREQUENCIES.length - 1) return 'highshelf';
	            return 'peaking';
	        }

	        function getEqFilterQ(index = 0) {
	            const safeIndex = Math.max(0, Math.min(EQ_FREQUENCIES.length - 1, Number(index) || 0));
	            return clamp(Number(EQ_FILTER_Q_VALUES[safeIndex]) || 1, 0.5, 2);
	        }

	        function calculateEqHeadroomDb(values = null) {
	            const bands = sanitizeEqBandValues(values, eqRuntime.bands);
	            const maxBoost = bands.reduce((max, value) => Math.max(max, Number(value) || 0), 0);
	            if (maxBoost <= 0) return 0;
	            return -clamp(maxBoost * 0.55, 0, 7.5);
	        }

	        function applyEqHeadroom(values = null, options = {}) {
	            const opts = { smooth: true, ...options };
	            const headroomDb = calculateEqHeadroomDb(values);
	            eqRuntime.headroomDb = headroomDb;
	            if (!eqPreampNode || !eqPreampNode.gain) return false;
	            const target = dbToLinearGain(headroomDb);
	            return safeCall(() => {
	                if (audioCtx && audioCtx.state !== 'closed' && opts.smooth !== false && typeof eqPreampNode.gain.setTargetAtTime === 'function') {
	                    const now = Number(audioCtx.currentTime || 0);
	                    eqPreampNode.gain.cancelScheduledValues(now);
	                    eqPreampNode.gain.setTargetAtTime(target, now, EQ_PREAMP_SMOOTH_TIME);
	                } else {
	                    eqPreampNode.gain.value = target;
	                }
	                return true;
	            }, false);
	        }

	        // Lightweight in-memory diagnostics. This is intentionally bounded and fail-safe.
	        const runtimeDiagnostics = {
	            entries: [],
	            actions: [],
	            errors: [],
	            recoveries: [],
	            sourceTransitions: [],
	            queueMutations: [],
	            playbackStates: [],
	            lastError: null,
	            lastRecovery: null,
	            revision: 0
	        };
	        const loadingWatchdogs = Object.create(null);
	        const recoveryAttemptCounters = {
	            stuckPlayback: Object.create(null),
	            sourceRecovery: Object.create(null),
	            loadingRecovery: Object.create(null)
	        };
	        let activeInternalNotice = null;
	        let internalNoticeTimer = null;
	        let lastInternalNoticeKey = '';
	        let lastInternalNoticeAt = 0;
	        let debugOverlayRafId = 0;

	        function getDiagnosticBucket(kind = '') {
	            if (kind === 'action') return runtimeDiagnostics.actions;
	            if (kind === 'error') return runtimeDiagnostics.errors;
	            if (kind === 'recovery') return runtimeDiagnostics.recoveries;
	            if (kind === 'source') return runtimeDiagnostics.sourceTransitions;
	            if (kind === 'queue') return runtimeDiagnostics.queueMutations;
	            if (kind === 'playback') return runtimeDiagnostics.playbackStates;
	            return runtimeDiagnostics.entries;
	        }

	        function normalizeDiagnosticDetails(details = null) {
	            if (!details || typeof details !== 'object') return null;
	            const clean = {};
	            safeCall(() => {
	                Object.entries(details).forEach(([key, value]) => {
	                    const safeKey = sanitizeText(key || '');
	                    if (!safeKey) return;
	                    if (value == null) {
	                        clean[safeKey] = value;
	                        return;
	                    }
	                    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
	                        clean[safeKey] = value;
	                        return;
	                    }
	                    if (Array.isArray(value)) {
	                        clean[safeKey] = value.slice(0, 12).map((entry) => {
	                            if (entry == null) return entry;
	                            if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') return entry;
	                            return sanitizeText(String(entry));
	                        });
	                        return;
	                    }
	                    clean[safeKey] = sanitizeText(String(value));
	                });
	            });
	            return Object.keys(clean).length ? clean : null;
	        }

	        function pushDiagnosticEntry(kind = 'action', type = '', message = '', details = null) {
	            return safeCall(() => {
	                const entry = {
	                    timestamp: Date.now(),
	                    kind: sanitizeText(kind || '') || 'action',
	                    type: sanitizeText(type || '') || 'event',
	                    message: sanitizeText(message || '') || 'event',
	                    details: normalizeDiagnosticDetails(details)
	                };
	                const pushBounded = (list) => {
	                    if (!Array.isArray(list)) return;
	                    list.push(entry);
	                    if (list.length > DIAGNOSTIC_ENTRY_LIMIT) {
	                        list.splice(0, list.length - DIAGNOSTIC_ENTRY_LIMIT);
	                    }
	                };
	                pushBounded(runtimeDiagnostics.entries);
	                pushBounded(getDiagnosticBucket(entry.kind));
	                if (entry.kind === 'error') runtimeDiagnostics.lastError = entry;
	                if (entry.kind === 'recovery') runtimeDiagnostics.lastRecovery = entry;
	                runtimeDiagnostics.revision += 1;
	                scheduleDebugOverlayRefresh();
	                return entry;
	            }, null);
	        }

	        function logAction(type, message, details = null) {
	            return pushDiagnosticEntry('action', type, message, details);
	        }

	        function logError(type, message, details = null) {
	            return pushDiagnosticEntry('error', type, message, details);
	        }

	        const reportHyperionIssueLastSeen = Object.create(null);

	        function reportHyperionIssue(system = 'hyperion', action = 'unknown', error = null, options = {}) {
	            return safeCall(() => {
	                const safeSystem = sanitizeText(system || 'hyperion') || 'hyperion';
	                const safeAction = sanitizeText(action || 'unknown') || 'unknown';
	                const message = sanitizeText(error?.message || String(error || 'Unknown issue')) || 'Unknown issue';
	                const key = `${safeSystem}:${safeAction}:${message}`;
	                const now = Date.now();
	                if (reportHyperionIssueLastSeen[key] && now - reportHyperionIssueLastSeen[key] < 2500) {
	                    return false;
	                }
	                reportHyperionIssueLastSeen[key] = now;
	                logError(`${safeSystem}:${safeAction}`, message, {
	                    system: safeSystem,
	                    action: safeAction,
	                    profileId: sanitizeText(options.profileId || ''),
	                    message
	                });
	                const method = options.level === 'error' ? 'error' : 'warn';
	                const logger = typeof console !== 'undefined' ? console : null;
	                if (logger && typeof logger[method] === 'function') {
	                    logger[method](`[NexPlay:${safeSystem}] ${safeAction}`, error);
	                }
	                if (options.userFacing && typeof showToast === 'function') {
	                    showToast(options.userMessage || 'NexPlay handled a settings issue safely.', options.toastType || 'error');
	                }
	                return false;
	            }, false);
	        }

	        function logRecovery(type, message, details = null) {
	            return pushDiagnosticEntry('recovery', type, message, details);
	        }

	        function logSourceTransition(type, message, details = null) {
	            return pushDiagnosticEntry('source', type, message, details);
	        }

	        function logQueueMutation(type, message, details = null) {
	            return pushDiagnosticEntry('queue', type, message, details);
	        }

	        function logPlaybackState(type, message, details = null) {
	            return pushDiagnosticEntry('playback', type, message, details);
	        }

	        function getRecentDiagnostics(limit = DIAGNOSTIC_ENTRY_LIMIT) {
	            const take = Math.max(1, Math.min(DIAGNOSTIC_ENTRY_LIMIT, Number(limit) || DIAGNOSTIC_ENTRY_LIMIT));
	            return safeArray(runtimeDiagnostics.entries).slice(-take).map((entry) => ({ ...entry }));
	        }

	        safeCall(() => {
	            window.NexPlayDiagnostics = {
	                getRecent: (limit = DIAGNOSTIC_ENTRY_LIMIT) => getRecentDiagnostics(limit),
	                getLastError: () => runtimeDiagnostics.lastError ? { ...runtimeDiagnostics.lastError } : null,
	                getLastRecovery: () => runtimeDiagnostics.lastRecovery ? { ...runtimeDiagnostics.lastRecovery } : null
	            };
	        });

	        function ensureInternalNoticeElement() {
	            return safeCall(() => {
	                let el = document.getElementById('nexplay-internal-notice');
	                if (el) return el;
	                el = document.createElement('div');
	                el.id = 'nexplay-internal-notice';
	                el.style.position = 'fixed';
	                el.style.right = '12px';
	                el.style.bottom = '12px';
	                el.style.maxWidth = '320px';
	                el.style.padding = '8px 10px';
	                el.style.borderRadius = '10px';
	                el.style.border = '1px solid rgba(255,255,255,0.16)';
	                el.style.background = 'rgba(15,23,42,0.88)';
	                el.style.color = '#d1d5db';
	                el.style.fontSize = '12px';
	                el.style.fontWeight = '600';
	                el.style.lineHeight = '1.35';
	                el.style.zIndex = '111';
	                el.style.pointerEvents = 'none';
	                el.style.display = 'none';
	                document.body.appendChild(el);
	                return el;
	            }, null);
	        }

	        function hideInternalNotice() {
	            const el = document.getElementById('nexplay-internal-notice');
	            if (!el) return;
	            el.style.display = 'none';
	            if (internalNoticeTimer) {
	                clearTimeout(internalNoticeTimer);
	                internalNoticeTimer = null;
	            }
	            activeInternalNotice = null;
	        }

	        function showInternalNotice(message = '', tone = 'info', options = {}) {
	            // Disabled: these corner notices were noisy in desktop runtime.
	            hideInternalNotice();
	            return false;
	        }

	        function beginLoadingWatchdog(key = '', timeoutMs = LOADING_WATCHDOG_DEFAULT_MS, onTimeout = null) {
	            const watchKey = sanitizeText(key || '');
	            if (!watchKey) return;
	            clearLoadingWatchdog(watchKey);
	            const timeout = Math.max(1500, Number(timeoutMs) || LOADING_WATCHDOG_DEFAULT_MS);
	            loadingWatchdogs[watchKey] = {
	                startedAt: Date.now(),
	                timeoutMs: timeout,
	                timer: setTimeout(() => {
	                    const active = loadingWatchdogs[watchKey];
	                    if (!active) return;
	                    delete loadingWatchdogs[watchKey];
	                    logError('loading-timeout', `${watchKey} loading timed out`, {
	                        timeoutMs: timeout
	                    });
	                    logRecovery('loading-timeout', `${watchKey} loading cancelled after timeout`, {
	                        timeoutMs: timeout
	                    });
	                    safeCall(() => onTimeout && onTimeout());
	                }, timeout)
	            };
	        }

	        function clearLoadingWatchdog(key = '') {
	            const watchKey = sanitizeText(key || '');
	            if (!watchKey) return;
	            const active = loadingWatchdogs[watchKey];
	            if (!active) return;
	            safeCall(() => clearTimeout(active.timer));
	            delete loadingWatchdogs[watchKey];
	        }

	        function consumeRecoveryAttempt(category = 'stuckPlayback', key = '', maxAttempts = RECOVERY_RETRY_LIMIT) {
	            const cleanCategory = Object.prototype.hasOwnProperty.call(recoveryAttemptCounters, category) ? category : 'stuckPlayback';
	            const counterStore = recoveryAttemptCounters[cleanCategory];
	            const cleanKey = sanitizeText(key || '') || 'default';
	            const current = Number(counterStore[cleanKey] || 0);
	            if (current >= Math.max(0, Number(maxAttempts) || 0)) return false;
	            counterStore[cleanKey] = current + 1;
	            return true;
	        }

	        function clearRecoveryAttempt(category = 'stuckPlayback', key = '') {
	            const cleanCategory = Object.prototype.hasOwnProperty.call(recoveryAttemptCounters, category) ? category : 'stuckPlayback';
	            const counterStore = recoveryAttemptCounters[cleanCategory];
	            const cleanKey = sanitizeText(key || '');
	            if (!cleanKey) {
	                Object.keys(counterStore).forEach((entryKey) => { delete counterStore[entryKey]; });
	                return;
	            }
	            delete counterStore[cleanKey];
	        }

	        function buildDiagnosticOverlayText() {
	            const track = safeCall(() => getActivePlaybackTrack(), null);
	            const online = safeCall(() => getOnlineMusicState(), null) || {};
	            const source = sanitizeText(state?.currentPlaybackSource || 'local') || 'local';
	            const isOnline = source === 'online-music';
	            const current = isOnline
	                ? Math.max(0, Number(online.currentTime || 0))
	                : Math.max(0, Number(els?.audio?.currentTime || 0));
	            const duration = isOnline
	                ? Math.max(0, Number(online.duration || track?.duration || 0))
	                : Math.max(0, Number(els?.audio?.duration || track?.duration || 0));
	            const activeQueueLength = activeQueueType === 'audio'
	                ? safeArray(state?.audioQueueState?.entries).length
	                : safeArray(state?.queue).length;
	            const queueIndex = activeQueueType === 'audio'
	                ? Number(state?.audioQueueState?.currentIndex ?? -1)
	                : (state?.isShuffle ? Number(state?.shuffleIndex ?? -1) : safeArray(state?.queue).indexOf(state?.currentTrackId));
	            const lastError = runtimeDiagnostics.lastError?.message || 'none';
	            const lastRecovery = runtimeDiagnostics.lastRecovery?.message || 'none';
	            return [
	                'NexPlay Debug',
	                `source: ${source}`,
	                `track: ${sanitizeText(track?.id || '') || 'none'}`,
	                `index: ${Number.isFinite(queueIndex) ? queueIndex : -1}`,
	                `queue: ${activeQueueLength}`,
	                `playing: ${state?.isPlaying ? 'yes' : 'no'}`,
	                `time: ${formatTime(current)} / ${formatTime(duration)}`,
	                `loading: source=${isLoadingSource ? '1' : '0'} metadata=${state?.processingQueue ? '1' : '0'} spinner=${videoSpinnerTimeoutTimer ? '1' : '0'}`,
	                `switching: track=${isSwitchingTrack ? '1' : '0'} queue=${isUpdatingQueue ? '1' : '0'}`,
	                `last error: ${lastError}`,
	                `last recovery: ${lastRecovery}`
	            ].join('\n');
	        }

	        function ensureDebugOverlayElement() {
	            return safeCall(() => {
	                let root = document.getElementById('nexplay-debug-overlay');
	                if (root) return root;
	                root = document.createElement('pre');
	                root.id = 'nexplay-debug-overlay';
	                root.style.position = 'fixed';
	                root.style.top = '10px';
	                root.style.right = '10px';
	                root.style.width = 'min(340px, calc(100vw - 20px))';
	                root.style.maxHeight = '44vh';
	                root.style.overflow = 'auto';
	                root.style.padding = '8px 10px';
	                root.style.margin = '0';
	                root.style.borderRadius = '10px';
	                root.style.border = '1px solid rgba(56,189,248,0.35)';
	                root.style.background = 'rgba(2,6,23,0.88)';
	                root.style.color = '#bfdbfe';
	                root.style.font = '11px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
	                root.style.zIndex = '112';
	                root.style.pointerEvents = 'none';
	                root.style.whiteSpace = 'pre-wrap';
	                root.style.display = 'none';
	                document.body.appendChild(root);
	                return root;
	            }, null);
	        }

	        function updateDebugOverlay() {
	            safeCall(() => {
	                const root = ensureDebugOverlayElement();
	                if (!root) return;
	                const visible = !!state?.debugOverlayVisible;
	                root.style.display = visible ? 'block' : 'none';
	                if (!visible) return;
	                root.textContent = buildDiagnosticOverlayText();
	            });
	        }

	        function scheduleDebugOverlayRefresh() {
	            if (!state?.debugOverlayVisible) return;
	            if (debugOverlayRafId) return;
	            debugOverlayRafId = requestAnimationFrame(() => {
	                debugOverlayRafId = 0;
	                updateDebugOverlay();
	            });
	        }

	        function toggleDebugOverlay(force = null) {
	            state.debugOverlayVisible = typeof force === 'boolean' ? force : !state.debugOverlayVisible;
	            logAction('debug-overlay', state.debugOverlayVisible ? 'Debug overlay enabled' : 'Debug overlay hidden');
	            if (!state.debugOverlayVisible) {
	                if (debugOverlayRafId) {
	                    cancelAnimationFrame(debugOverlayRafId);
	                    debugOverlayRafId = 0;
	                }
	                const root = document.getElementById('nexplay-debug-overlay');
	                if (root && root.style.display !== 'none') root.style.display = 'none';
	                return;
	            }
	            scheduleDebugOverlayRefresh();
	        }

	        function resetPlaybackState(options = {}) {
	            const opts = { clearTrack: false, reason: 'recovery', ...options };
	            logRecovery('soft-reset-playback', 'Reset playback state', { reason: opts.reason, clearTrack: !!opts.clearTrack });
	            const online = getOnlineMusicState();
	            state.isPlaying = false;
	            online.isPlaying = false;
	            clearOnlineMusicConnectingAttempt({ force: true });
	            if (opts.clearTrack) {
	                state.currentTrackId = null;
	                state.currentTrack = null;
	            }
	            if (state.progressInterval) {
	                clearInterval(state.progressInterval);
	                state.progressInterval = null;
	            }
	            safePauseMedia(els.audio);
	            stopOnlineMusicProgressTimer();
	            updatePlayIcons();
	            refreshPlayingIndicators();
	        }

	        function resetSourceFlags(options = {}) {
	            const opts = { reason: 'recovery', ...options };
	            logRecovery('soft-reset-source', 'Reset source flags', { reason: opts.reason });
	            isSwitchingTrack = false;
	            activeTrackSwitchId = '';
	            isLoadingSource = false;
	            trackSwitchStartedAt = 0;
	            sourceLoadStartedAt = 0;
	            finishSourceLoad();
	            clearOnlineMusicConnectTimeout();
	        }

	        function resetLoadingState(options = {}) {
	            const opts = { reason: 'recovery', ...options };
	            logRecovery('soft-reset-loading', 'Reset loading state', { reason: opts.reason });
	            Object.keys(loadingWatchdogs).forEach((key) => clearLoadingWatchdog(key));
	            setVideoSpinner(false);
	            finishSourceLoad();
	            state.processingQueue = false;
	            const status = document.getElementById('queue-status');
	            if (status) {
	                status.classList.add('hidden');
	                status.classList.remove('flex');
	            }
	        }

	        function resetQueueViewState(options = {}) {
	            const opts = { reason: 'recovery', ...options };
	            logRecovery('soft-reset-queue-view', 'Reset queue view state', { reason: opts.reason });
	            renderMiniQueuePeek();
	            if (state.isQueueOverlayOpen) renderQueueOverlay();
	            if (state.activeTab === 'queue') renderQueue();
	        }

	        function syncUiAfterRecovery(options = {}) {
	            const opts = { clearLoading: true, refreshQueue: true, ...options };
	            updatePlayIcons();
	            const activeTrack = getActivePlaybackTrack();
	            if (activeTrack) {
	                applyNowPlayingMetadata(activeTrack);
	                updateTrackUI(activeTrack);
	            } else {
	                applyNowPlayingMetadata(null);
	            }
	            if (opts.refreshQueue) resetQueueViewState({ reason: 'ui-resync' });
	            if (opts.clearLoading) setVideoSpinner(false);
	            updateProgress();
	            scheduleDebugOverlayRefresh();
	        }

function createDefaultNotyPadState() {
    return {
        title: '',
        text: '',
        updatedAt: 0,
        wrapLines: true,
        fontSize: 16
    };
}

function sanitizeNotyPadState(raw) {
    const base = createDefaultNotyPadState();
    const rawTitle = typeof raw?.title === 'string' ? raw.title : base.title;
    const rawText = typeof raw?.text === 'string' ? raw.text : base.text;
    return {
        title: rawTitle.replace(/[<>]/g, '').replace(/[\r\n]+/g, ' ').slice(0, 120),
        text: rawText.replace(/\u0000/g, '').replace(/\r\n?/g, '\n'),
        updatedAt: clampNumber(raw?.updatedAt, 0, Number.MAX_SAFE_INTEGER, base.updatedAt),
        wrapLines: raw?.wrapLines !== false,
        fontSize: clampNumber(raw?.fontSize, 13, 28, base.fontSize)
    };
}

function createDefaultAppSettings() {
    return {
	                playback: {
	                    autoplayOnTrackClick: true,
	                    seekStepSeconds: 5,
	                    speedAudio: 1,
	                    speedVideo: 1,
	                    skipIntroSeconds: 0,
	                    skipOutroSeconds: 0,
	                    pauseWhenHidden: false
	                },
	                audio: {
	                    equalizer: {
	                        preset: EQ_DEFAULT_PRESET,
	                        bands: getDefaultEqBandValues()
	                    }
	                },
        resume: {
            localEnabled: true,
            onlineEnabled: true,
            minimumDurationSeconds: 45,
            historyLimit: 50
        },
        appearance: {
            themeMode: 'dark',
            density: 'cozy',
            sidebarWidth: 288,
            reducedMotion: false,
            visualizerIntensity: 1,
            defaultViewMode: 'list',
            defaultStartTab: 'all'
        },
        queue: {
            allowedSources: 'both',
            favoriteWeight: 18,
            recencyWeight: 30,
            sameArtistPenalty: 22,
            tagAffinityWeight: 18,
            longFormBias: 0,
            storyModeAggression: 55
        },
        onlineMusic: {
            customApiKey: '',
            preferYoutubeDiscovery: true,
            autoImportDownloads: true,
            autoplayRadioEnabled: false
        },
        library: {
            watchedFolders: [],
            showOnlineInLibrary: true
        },
        video: {
            rememberPerVideoAdjustments: true,
            fullscreenBehavior: 'manual',
            frameStepSeconds: 1 / 25,
            pipBehavior: 'manual',
            lyricSafeOffsetPx: 160
        }
    };
}

	        function sanitizeAppSettings(raw) {
	            const base = createDefaultAppSettings();
	            const playback = raw?.playback || {};
	            const audio = raw?.audio || {};
	            const resume = raw?.resume || {};
	            const appearance = raw?.appearance || {};
	            const queue = raw?.queue || {};
	            const onlineMusic = raw?.onlineMusic || {};
	            const library = raw?.library || {};
	            const video = raw?.video || {};
	            const equalizer = audio?.equalizer || {};
	            const nextTheme = ['light', 'dark', 'system'].includes(appearance.themeMode) ? appearance.themeMode : base.appearance.themeMode;
	            const nextDensity = ['compact', 'cozy'].includes(appearance.density) ? appearance.density : base.appearance.density;
	            const nextViewMode = ['list', 'grid'].includes(appearance.defaultViewMode) ? appearance.defaultViewMode : base.appearance.defaultViewMode;
	            const nextStartTab = NAV_TABS.some((tab) => tab.id === appearance.defaultStartTab && tab.id !== 'private-session')
            ? appearance.defaultStartTab
            : base.appearance.defaultStartTab;
	            const nextFullscreenBehavior = ['manual', 'immersive', 'immersive_fullscreen'].includes(video.fullscreenBehavior) ? video.fullscreenBehavior : base.video.fullscreenBehavior;
    const nextPipBehavior = ['manual', 'auto_on_video_mode'].includes(video.pipBehavior) ? video.pipBehavior : base.video.pipBehavior;
    return {
        playback: {
            autoplayOnTrackClick: playback.autoplayOnTrackClick ?? base.playback.autoplayOnTrackClick,
            seekStepSeconds: clampNumber(playback.seekStepSeconds, 2, 30, base.playback.seekStepSeconds),
            speedAudio: clampNumber(playback.speedAudio, 0.5, 2.5, base.playback.speedAudio),
            speedVideo: clampNumber(playback.speedVideo, 0.5, 2.5, base.playback.speedVideo),
	                    skipIntroSeconds: clampNumber(playback.skipIntroSeconds, 0, 120, base.playback.skipIntroSeconds),
	                    skipOutroSeconds: clampNumber(playback.skipOutroSeconds, 0, 120, base.playback.skipOutroSeconds),
	                    pauseWhenHidden: playback.pauseWhenHidden ?? base.playback.pauseWhenHidden
	                },
	                audio: {
	                    equalizer: {
	                        preset: sanitizeEqPresetName(equalizer.preset, { allowCustom: true }),
	                        bands: sanitizeEqBandValues(equalizer.bands, base.audio.equalizer.bands)
	                    }
	                },
        resume: {
            localEnabled: resume.localEnabled ?? base.resume.localEnabled,
            onlineEnabled: resume.onlineEnabled ?? base.resume.onlineEnabled,
            minimumDurationSeconds: clampNumber(resume.minimumDurationSeconds, 0, 1800, base.resume.minimumDurationSeconds),
            historyLimit: clampNumber(resume.historyLimit, 5, 250, base.resume.historyLimit)
        },
        appearance: {
            themeMode: nextTheme,
            density: nextDensity,
            sidebarWidth: clampNumber(appearance.sidebarWidth, 240, 420, base.appearance.sidebarWidth),
            reducedMotion: appearance.reducedMotion ?? base.appearance.reducedMotion,
            visualizerIntensity: clampNumber(appearance.visualizerIntensity, 0.25, 1.75, base.appearance.visualizerIntensity),
            defaultViewMode: nextViewMode,
            defaultStartTab: nextStartTab
        },
        queue: {
            allowedSources: ['both', 'local', 'online'].includes(sanitizeText(queue.allowedSources || '').toLowerCase())
                ? sanitizeText(queue.allowedSources || '').toLowerCase()
                : base.queue.allowedSources,
            favoriteWeight: clampNumber(queue.favoriteWeight, 0, 100, base.queue.favoriteWeight),
            recencyWeight: clampNumber(queue.recencyWeight, 0, 100, base.queue.recencyWeight),
            sameArtistPenalty: clampNumber(queue.sameArtistPenalty, 0, 100, base.queue.sameArtistPenalty),
            tagAffinityWeight: clampNumber(queue.tagAffinityWeight, 0, 100, base.queue.tagAffinityWeight),
            longFormBias: clampNumber(queue.longFormBias, -100, 100, base.queue.longFormBias),
            storyModeAggression: clampNumber(queue.storyModeAggression, 0, 100, base.queue.storyModeAggression)
        },
        onlineMusic: {
            customApiKey: sanitizeText(onlineMusic.customApiKey || ''),
            preferYoutubeDiscovery: onlineMusic.preferYoutubeDiscovery ?? base.onlineMusic.preferYoutubeDiscovery,
            autoImportDownloads: onlineMusic.autoImportDownloads ?? base.onlineMusic.autoImportDownloads,
            autoplayRadioEnabled: onlineMusic.autoplayRadioEnabled ?? base.onlineMusic.autoplayRadioEnabled
        },
        library: {
            watchedFolders: Array.from(new Map((Array.isArray(library.watchedFolders) ? library.watchedFolders : [])
                .map((entry) => {
                    const folderPath = sanitizeText(entry?.path || '');
                    if (!folderPath) return null;
                    return [folderPath, {
                        id: sanitizeText(entry?.id || folderPath) || folderPath,
                        name: sanitizeText(entry?.name || folderPath) || folderPath,
                        path: folderPath
                    }];
                })
                .filter(Boolean)).values()),
            showOnlineInLibrary: library.showOnlineInLibrary !== false
        },
        video: {
            rememberPerVideoAdjustments: video.rememberPerVideoAdjustments ?? base.video.rememberPerVideoAdjustments,
            fullscreenBehavior: nextFullscreenBehavior,
            frameStepSeconds: clampNumber(video.frameStepSeconds, 0.02, 0.2, base.video.frameStepSeconds),
            pipBehavior: nextPipBehavior,
            lyricSafeOffsetPx: clampNumber(video.lyricSafeOffsetPx, 120, 260, base.video.lyricSafeOffsetPx)
        }
    };
}

function createDefaultFeatureToggles() {
    return FEATURE_IDS.reduce((acc, id) => {
        acc[id] = false;
        return acc;
    }, {});
}

function createDefaultResumeStore() {
    return { tracks: {}, online: {}, lastUpdatedAt: 0 };
}

function createDefaultLinkCollections() {
    return {
        collections: [{ id: 'default', name: 'General', createdAt: Date.now(), updatedAt: Date.now(), order: 0 }],
        assignments: {}
    };
}

function createDefaultOnlineMusicState() {
    return {
        apiKey: YOUTUBE_DATA_API_KEY,
        searchQuery: '',
        searchResults: [],
        searchStatus: 'Ready. Search streaming music, import YouTube Music playlists, add songs to your library, or download MP3 copies in the desktop app.',
        currentTrackId: null,
        currentTrack: null,
        currentTime: 0,
        duration: 0,
        volume: 70,
        isPlaying: false,
        queue: [],
        queueIndex: -1,
        queueMode: 'ordered',
        queueContextView: 'search',
        queueContextKey: '',
        playbackContext: 'search',
        sessionId: 0,
        expectedVideoId: '',
        connectingTrackId: null,
        browserView: 'search',
        browserArtist: null,
        browserArtistStatus: 'idle',
        browserArtistError: '',
        browserRelease: null,
        browserReleaseStatus: 'idle',
        browserReleaseError: '',
        browserReleaseTrackEntrancePending: false,
        artistWorkSortMode: 'best',
        artistWorkSearchQuery: '',
        browserRequestId: 0,
        artistCatalogCache: {},
        releaseTracksCache: {},
        downloadingTrackIds: [],
        pendingTrackId: null,
        downloadJobs: [],
        importReviewItems: [],
        providerHealth: {
            youtubeDiscovery: 'healthy',
            youtubePlaybackResolver: 'idle',
            lastMessage: '',
            lastCode: '',
            lastUpdatedAt: 0,
            blockedUntil: 0
        },
        lastUpdatedAt: 0
    };
}

function createDefaultPrivateSessionState() {
    return {
        active: false,
        startedAt: 0,
        feedback: 'Private mode ready. Imports and searches stay in memory only.',
        feedbackTone: 'info',
        searchQuery: '',
        playlistInput: '',
        imports: [],
        searchResults: [],
        playlists: [],
        onlineView: 'search',
        browserRequestId: 0,
        browserArtist: null,
        browserArtistStatus: 'idle',
        browserArtistError: '',
        browserRelease: null,
        browserReleaseStatus: 'idle',
        browserReleaseError: '',
        artistWorkSortMode: 'best',
        currentTrackId: '',
        currentCollectionKey: 'temporary',
        normalSessionSnapshot: null
    };
}

