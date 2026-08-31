// @ts-nocheck -- This test evaluates selected browser functions in focused VM sandboxes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtimeSource = fs.readFileSync(new URL('../js/legacy/runtime-state.js', import.meta.url), 'utf8');
const onlineMusicSource = fs.readFileSync(new URL('../js/legacy/online-music.js', import.meta.url), 'utf8');
const playerSource = fs.readFileSync(new URL('../js/legacy/player.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const componentsCssSource = fs.readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');

function sliceRequired(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(start, -1, startMarker);
    assert.notEqual(end, -1, endMarker);
    return source.slice(start, end);
}

function createRuntimeCoordinatorContext(extra = {}) {
    const context = vm.createContext({
        URL,
        window: { location: { href: 'http://localhost:5000/' } },
        sanitizeText: (value) => String(value ?? ''),
        safeCall: (callback, fallback = null) => {
            try { return callback(); } catch { return fallback; }
        },
        ...extra
    });
    const intentFunctions = sliceRequired(
        runtimeSource,
        'function invalidatePendingMediaPlayRequests',
        'function beginSourceLoad'
    );
    vm.runInContext(`
        let pendingMediaPlayRequestId = 0;
        let playbackIntentSeq = 0;
        let activePlaybackIntent = { id: 0, trackId: '', sourceKind: '' };
        ${intentFunctions}
        globalThis.intentApi = {
            beginPlaybackIntent,
            getActivePlaybackIntent,
            invalidatePendingMediaPlayRequests,
            isPlaybackIntentActive,
            getPendingRequestId: () => pendingMediaPlayRequestId
        };
    `, context);
    return context;
}

function createFakeTimerHarness() {
    let nextId = 0;
    const entries = [];
    return {
        entries,
        setTimeout(callback, delay = 0) {
            const entry = { id: ++nextId, callback, delay: Number(delay) || 0, cleared: false };
            entries.push(entry);
            return entry.id;
        },
        clearTimeout(id) {
            const entry = entries.find((candidate) => candidate.id === id);
            if (entry) entry.cleared = true;
        },
        run(id) {
            const entry = entries.find((candidate) => candidate.id === id);
            assert.ok(entry, `timer ${id} should exist`);
            entry.callback();
        },
        latest(delay) {
            for (let index = entries.length - 1; index >= 0; index -= 1) {
                if (entries[index].delay === delay) return entries[index];
            }
            return null;
        }
    };
}

function createOnlineMusicPlayerLifecycleHarness(options = {}) {
    const timers = createFakeTimerHarness();
    const elements = new Map();
    let hostCreateCount = 0;
    const createNode = (tagName = 'div') => ({
        tagName: String(tagName).toUpperCase(),
        id: '',
        parentNode: null,
        remove() {
            this.parentNode?.removeChild(this);
        }
    });
    const shell = createNode('div');
    shell.id = 'online-music-player-shell';
    shell.children = [];
    shell.appendChild = (node) => {
        node.parentNode = shell;
        shell.children.push(node);
        if (node.id) elements.set(node.id, node);
        hostCreateCount += node.id === 'online-music-yt-player' ? 1 : 0;
        return node;
    };
    shell.removeChild = (node) => {
        shell.children = shell.children.filter((candidate) => candidate !== node);
        if (elements.get(node.id) === node) elements.delete(node.id);
        node.parentNode = null;
        return node;
    };
    elements.set(shell.id, shell);
    const initialHost = createNode('div');
    initialHost.id = 'online-music-yt-player';
    shell.appendChild(initialHost);

    const document = {
        getElementById: (id) => elements.get(id) || null,
        createElement: (tagName) => createNode(tagName)
    };
    const players = [];
    let playerConstructorCalls = 0;
    let stateChangeCalls = 0;
    let errorCalls = 0;
    let syncCalls = 0;
    const throwOnConstructorCalls = new Set(options.throwOnConstructorCalls || []);
    class FakePlayer {
        constructor(_hostId, config) {
            playerConstructorCalls += 1;
            if (throwOnConstructorCalls.has(playerConstructorCalls)) {
                throw new Error('fake player construction failed');
            }
            const player = {
                config,
                destroyed: false,
                volume: null,
                loadVideoById() {},
                setVolume(value) { this.volume = value; },
                destroy() { this.destroyed = true; }
            };
            players.push(player);
            return player;
        }
    }
    const window = {
        YT: {
            Player: FakePlayer,
            PlayerState: { UNSTARTED: -1, PLAYING: 1, PAUSED: 2 }
        },
        setTimeout: timers.setTimeout,
        __nexplayOnlineMusicPlayerInitPromise: null
    };
    const context = vm.createContext({
        window,
        document,
        clearTimeout: timers.clearTimeout,
        YOUTUBE_EMBED_HOST: 'https://www.youtube.com',
        loadYouTubeIframeApi: async () => window.YT,
        sanitizeText: (value) => String(value ?? ''),
        getOnlineMusicCurrentTrack: () => null,
        getSafeAppOrigin: () => 'http://localhost:5000',
        clampNumber: (value, min, max, fallback) => {
            const number = Number(value);
            return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
        },
        getOnlineMusicState: () => ({ volume: 55 }),
        syncOnlineMusicPlayerCard: () => { syncCalls += 1; },
        handleOnlineMusicPlayerStateChange: () => { stateChangeCalls += 1; },
        handleOnlineMusicPlayerError: async () => { errorCalls += 1; },
        updateOnlineMusicFeedback() {},
        showToast() {}
    });
    const lifecycleFunctions = sliceRequired(
        onlineMusicSource,
        'function recreateOnlineMusicPlayerHost',
        'async function resolvePlayableOnlineMusicTrack'
    );
    vm.runInContext(`
        let onlineMusicPlayer = null;
        let onlineMusicPlayerReady = false;
        let onlineMusicPlayerGeneration = 0;
        let onlineMusicPrewarmRequested = false;
        ${lifecycleFunctions}
        globalThis.playerLifecycleApi = {
            ensureOnlineMusicPlayer,
            snapshot: () => ({
                player: onlineMusicPlayer,
                ready: onlineMusicPlayerReady,
                generation: onlineMusicPlayerGeneration,
                prewarmRequested: onlineMusicPrewarmRequested,
                initPromise: window.__nexplayOnlineMusicPlayerInitPromise
            })
        };
    `, context);
    return {
        context,
        document,
        players,
        timers,
        getHostCreateCount: () => hostCreateCount,
        getPlayerConstructorCalls: () => playerConstructorCalls,
        getStateChangeCalls: () => stateChangeCalls,
        getErrorCalls: () => errorCalls,
        getSyncCalls: () => syncCalls
    };
}

test('a newer playback intent invalidates the old intent and pending media request', () => {
    const context = createRuntimeCoordinatorContext();
    const first = context.intentApi.beginPlaybackIntent('track-a', 'local');
    const firstRequestGeneration = context.intentApi.getPendingRequestId();
    const second = context.intentApi.beginPlaybackIntent('track-b', 'online-music');

    assert.equal(context.intentApi.isPlaybackIntentActive(first), false);
    assert.equal(context.intentApi.isPlaybackIntentActive(second), true);
    assert.ok(context.intentApi.getPendingRequestId() > firstRequestGeneration);
    assert.equal(context.intentApi.getActivePlaybackIntent().trackId, 'track-b');
});

test('a different track choice supersedes a pending switch while duplicate clicks stay deduped', () => {
    const switchGuard = sliceRequired(
        playerSource,
        'function shouldIgnoreTrackSwitchRequest',
        'function loadTrack'
    );
    const context = vm.createContext({
        isSwitchingTrack: true,
        activeTrackSwitchId: 'online-a',
        sanitizeText: (value) => String(value ?? '')
    });
    vm.runInContext(`${switchGuard}; globalThis.shouldIgnore = shouldIgnoreTrackSwitchRequest;`, context);

    assert.equal(context.shouldIgnore('online-a'), true, 'same pending track should remain deduped');
    assert.equal(context.shouldIgnore('local-b'), false, 'newer track choice should supersede the pending track');
    assert.equal(context.shouldIgnore('online-a', { allowQueueSwitch: true }), false);
    context.isSwitchingTrack = false;
    assert.equal(context.shouldIgnore('online-a'), false);

    const loadBody = sliceRequired(playerSource, 'function loadTrack', 'function syncActiveTrackHighlight');
    assert.match(loadBody, /activeTrackSwitchId = sanitizeText\(id \|\| ''\)/);
    assert.match(loadBody, /sourceLoadRequestId !== latestSourceLoadRequestId\) return;/);
    assert.match(loadBody, /\.catch\(\(error\) => \{[\s\S]*?online-source-switch-failed/);
});

test('safePlayMedia does not call play after a readiness wait is superseded', async () => {
    let finishReady;
    const readyPromise = new Promise((resolve) => { finishReady = resolve; });
    const state = { currentTrackId: 'track-a', currentPlaybackSource: 'local' };
    const context = createRuntimeCoordinatorContext({
        state,
        hasPlayableSource: () => true,
        waitForMediaReady: () => readyPromise
    });
    const mediaFunctions = sliceRequired(runtimeSource, 'async function safePlayMedia', 'function safeSeekMedia');
    vm.runInContext(`${mediaFunctions}; globalThis.mediaApi = { safePlayMedia, safePauseMedia };`, context);

    let playCalls = 0;
    const media = {
        paused: true,
        src: 'http://localhost:5000/a.mp3',
        currentSrc: 'http://localhost:5000/a.mp3',
        play: async () => { playCalls += 1; },
        pause() {}
    };
    const first = context.intentApi.beginPlaybackIntent('track-a', 'local');
    const pendingPlay = context.mediaApi.safePlayMedia(media, {
        waitForReady: true,
        playbackIntent: first,
        expectedTrackId: 'track-a',
        expectedPlaybackSource: 'local'
    });
    context.intentApi.beginPlaybackIntent('track-b', 'online-music');
    state.currentTrackId = 'track-b';
    state.currentPlaybackSource = 'online-music';
    finishReady(true);

    assert.equal(await pendingPlay, false);
    assert.equal(playCalls, 0);
});

test('safePlayMedia rejects stale context even when the shared media element is already playing', async () => {
    const state = { currentTrackId: 'track-b', currentPlaybackSource: 'online-music' };
    const context = createRuntimeCoordinatorContext({
        state,
        hasPlayableSource: () => true,
        waitForMediaReady: async () => true
    });
    const mediaFunctions = sliceRequired(runtimeSource, 'async function safePlayMedia', 'function safeSeekMedia');
    vm.runInContext(`${mediaFunctions}; globalThis.mediaApi = { safePlayMedia, safePauseMedia };`, context);

    const staleIntent = context.intentApi.beginPlaybackIntent('track-a', 'local');
    context.intentApi.beginPlaybackIntent('track-b', 'online-music');
    let playCalls = 0;
    const media = {
        paused: false,
        src: 'http://localhost:5000/b.mp3',
        currentSrc: 'http://localhost:5000/b.mp3',
        play: async () => { playCalls += 1; },
        pause() {}
    };

    assert.equal(await context.mediaApi.safePlayMedia(media, {
        waitForReady: false,
        playbackIntent: staleIntent,
        expectedTrackId: 'track-a',
        expectedPlaybackSource: 'local'
    }), false);
    assert.equal(playCalls, 0);
});

test('transport ownership cannot move from direct audio back to iframe in the same session', () => {
    const online = { sessionId: 7 };
    const context = createRuntimeCoordinatorContext({
        onlineMusicSessionId: 7,
        getOnlineMusicState: () => online,
        normalizeOnlineMusicTrackId: (value) => String(value || ''),
        isPlaybackIntentActive: () => true
    });
    const ownerFunctions = sliceRequired(
        runtimeSource,
        'function setOnlineMusicTransportOwner',
        'function getOnlineMusicDirectAudioFallbackKey'
    );
    vm.runInContext(`
        let onlineMusicTransportOwner = { sessionId: 0, trackId: '', kind: 'none', attemptId: 0 };
        ${ownerFunctions}
        globalThis.ownerApi = {
            setOnlineMusicTransportOwner,
            claimOnlineMusicTransportOwner,
            isOnlineMusicTransportOwner
        };
    `, context);

    context.ownerApi.setOnlineMusicTransportOwner('connecting', { sessionId: 7, trackId: 'track-a', attemptId: 3 });
    assert.equal(context.ownerApi.claimOnlineMusicTransportOwner('direct', {
        sessionId: 7,
        trackId: 'track-a',
        attemptId: 3,
        fromKinds: ['connecting', 'iframe']
    }), true);
    assert.equal(context.ownerApi.claimOnlineMusicTransportOwner('iframe', {
        sessionId: 7,
        trackId: 'track-a',
        attemptId: 3,
        fromKinds: ['connecting']
    }), false);
    assert.equal(context.ownerApi.isOnlineMusicTransportOwner('direct', { sessionId: 7, trackId: 'track-a' }), true);
});

test('direct fallback is single-flight and seeks before it starts playback', async () => {
    let resolveStream;
    let resolverCalls = 0;
    let activeIntentId = 1;
    const order = [];
    const online = { sessionId: 11, currentTrackId: 'track-a', currentTime: 18, duration: 240, isPlaying: false };
    const state = {
        currentTrackId: 'track-a',
        currentPlaybackSource: 'online-music',
        volume: 0.8,
        playbackSpeed: 1,
        isPlaying: false
    };
    const audio = {
        src: '',
        currentSrc: '',
        volume: 0,
        playbackRate: 1,
        currentTime: 0,
        duration: 240
    };
    let owner = 'connecting';
    const context = vm.createContext({
        DESKTOP_ONLINE_MUSIC_AUDIO_STREAM_TIMEOUT_MS: 9000,
        DESKTOP_ONLINE_MUSIC_AUDIO_READY_TIMEOUT_MS: 7000,
        Date,
        state,
        els: { audio },
        onlineMusicSessionId: 11,
        onlineMusicDirectAudioMode: { active: false, trackId: '', videoId: '', streamUrl: '', startedAt: 0 },
        onlineMusicDirectAudioStart: { key: '', promise: null },
        onlineMusicPlayer: null,
        nexPlayDesktopBridge: {
            resolveOnlineTrackAudioStream() {
                resolverCalls += 1;
                return new Promise((resolve) => { resolveStream = resolve; });
            }
        },
        canUseDesktopOnlineAudioStream: () => true,
        hasRecentOnlineMusicDirectAudioFailure: () => false,
        getOnlineMusicState: () => online,
        getOnlineMusicCurrentTrack: () => ({ id: 'track-a', videoId: 'video-a', title: 'A', artist: 'Artist', duration: 240 }),
        getOnlineMusicDirectAudioFallbackKey: () => 'track-a:video-a',
        normalizeOnlineMusicTrackId: (value) => String(value || ''),
        sanitizeText: (value) => String(value ?? ''),
        isPlaybackIntentActive: (intent) => Number(intent?.id || 0) === activeIntentId,
        claimOnlineMusicTransportOwner(kind) {
            if (kind !== 'direct' || !['connecting', 'iframe', 'direct'].includes(owner)) return false;
            owner = 'direct';
            return true;
        },
        isOnlineMusicTransportOwner: (kind) => owner === kind,
        isOnlineMusicDirectAudioActive: ({ trackId } = {}) => owner === 'direct' && (!trackId || trackId === 'track-a'),
        updateOnlineMusicFeedback() {},
        clearOnlineMusicConnectTimeout() {},
        clearOnlineMusicDirectAudioStallTimer() {},
        clearOnlineMusicConnectingAttempt() {},
        safeCall: (callback, fallback = null) => {
            try { return callback(); } catch { return fallback; }
        },
        invalidatePendingMediaPlayRequests() {},
        waitForMediaReady: async () => true,
        safeSeekMedia(_media, seconds) {
            order.push('seek');
            audio.currentTime = seconds;
            return true;
        },
        safePlayMedia: async () => {
            order.push('play');
            return true;
        },
        getMediaCurrentTimeSafe: () => audio.currentTime,
        getMediaDurationSafe: () => audio.duration,
        forgetOnlineMusicDirectAudioFailure() {},
        forgetFailedOnlineMusicTrack() {},
        rememberOnlineMusicPlaybackResolverState() {},
        startOnlineMusicProgressTimer() {},
        updatePlayIcons() {},
        syncOnlineMusicPlayerCard() {},
        syncOnlineMusicResultRows() {},
        persistOnlineMusicState() {},
        rememberOnlineMusicDirectAudioFailure() {},
        logError() {},
        stopOnlineMusicDirectAudioTransport() { owner = 'none'; }
    });
    const fallbackFunction = sliceRequired(
        runtimeSource,
        'async function startOnlineMusicDirectAudioFallback',
        'async function handleOnlineMusicDirectAudioStreamInterruption'
    );
    vm.runInContext(`${fallbackFunction}; globalThis.startFallback = startOnlineMusicDirectAudioFallback;`, context);

    const track = { id: 'track-a', videoId: 'video-a', title: 'A', artist: 'Artist', duration: 240 };
    const first = context.startFallback(track, { sessionId: 11, startTime: 18, playbackIntent: { id: 1 } });
    const second = context.startFallback(track, { sessionId: 11, startTime: 18, playbackIntent: { id: 1 } });
    assert.equal(resolverCalls, 1);
    resolveStream({ streamUrl: 'http://localhost:5000/stream', videoId: 'video-a', duration: 240 });

    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(resolverCalls, 1);
    assert.deepEqual(order, ['seek', 'play']);

    owner = 'iframe';
    online.sessionId = 12;
    activeIntentId = 1;
    order.length = 0;
    const staleFallback = context.startFallback(track, {
        sessionId: 12,
        startTime: 18,
        playbackIntent: { id: 1, trackId: 'track-a', sourceKind: 'online-music' }
    });
    assert.equal(resolverCalls, 2);
    activeIntentId = 2;
    online.sessionId = 13;
    owner = 'none';
    resolveStream({ streamUrl: 'http://localhost:5000/stale-stream', videoId: 'video-a', duration: 240 });
    assert.equal(await staleFallback, false);
    assert.deepEqual(order, [], 'a superseded fallback must never seek or play shared audio');

    const mismatchedIntent = await context.startFallback(track, {
        sessionId: 13,
        playbackIntent: { id: 2, trackId: 'track-b', sourceKind: 'online-music' }
    });
    assert.equal(mismatchedIntent, false);
    assert.equal(resolverCalls, 2, 'a different active track must be rejected before stream resolution');
});

test('a new online selection invalidates the previous session before its resolver can yield', () => {
    const order = [];
    const online = { isPlaying: true };
    const state = { currentPlaybackSource: 'online-music', isPlaying: true };
    const context = vm.createContext({
        state,
        normalizeOnlineMusicTrackId: (value) => String(value || ''),
        getOnlineMusicState: () => online,
        invalidateOnlineMusicSession: () => { order.push('invalidate-session'); },
        setOnlineMusicConnectingAttempt: () => { order.push('set-connecting'); },
        clearOnlineMusicConnectingAttempt() {},
        stopOnlineMusicDirectAudioTransport: () => { order.push('stop-direct'); },
        stopLocalMediaTransport: () => { order.push('stop-local'); },
        onlineMusicPlayer: { stopVideo: () => { order.push('stop-iframe'); } },
        stopOnlineMusicProgressTimer() {},
        clearOnlineMusicConnectTimeout() {},
        updatePlayIcons() {},
        syncOnlineMusicResultRows() {},
        syncOnlineMusicPlayerCard() {},
        scheduleDebugOverlayRefresh() {}
    });
    const silenceFunction = sliceRequired(
        fs.readFileSync(new URL('../js/legacy/online-playlists.js', import.meta.url), 'utf8'),
        'function silenceActivePlaybackForOnlineSwitch',
        'function prewarmOnlineMusicPlayer'
    );
    vm.runInContext(`${silenceFunction}; globalThis.silence = silenceActivePlaybackForOnlineSwitch;`, context);
    context.silence({ id: 'track-b' }, { autoplay: true, attempt: { id: 2 } });

    assert.equal(order[0], 'invalidate-session');
    assert.ok(order.indexOf('invalidate-session') < order.indexOf('set-connecting'));
    assert.ok(order.indexOf('invalidate-session') < order.indexOf('stop-direct'));
});

test('iframe connection timeout is armed only after loadVideoById', () => {
    const playBody = sliceRequired(
        onlineMusicSource,
        'async function playOnlineMusicTrack',
        'async function toggleOnlineMusicPlayback'
    );
    const playerWait = playBody.indexOf('player = await ensureOnlineMusicPlayerForPlayback');
    const loadVideo = playBody.indexOf('player.loadVideoById');
    const armTimeout = playBody.indexOf('armOnlineMusicConnectTimeout');

    assert.ok(playerWait >= 0);
    assert.ok(loadVideo > playerWait);
    assert.ok(armTimeout > loadVideo);
    assert.equal(playBody.slice(0, loadVideo).includes('armOnlineMusicConnectTimeout'), false);
});

test('synchronous YouTube player command failures are cleaned up and use guarded fallback', () => {
    const playBody = sliceRequired(
        onlineMusicSource,
        'async function playOnlineMusicTrack',
        'async function toggleOnlineMusicPlayback'
    );
    const cueCommand = playBody.indexOf('player.cueVideoById');
    const loadCommand = playBody.indexOf('player.loadVideoById');
    const commandFailure = playBody.indexOf("logError('online-player-command-failed'");
    const clearAttempt = playBody.indexOf('clearOnlineMusicConnectingAttempt', commandFailure);
    const invalidatePlayer = playBody.indexOf('invalidateOnlineMusicPlayerInstance', commandFailure);
    const fallback = playBody.indexOf('startOnlineMusicDirectAudioFallback(resolved', commandFailure);
    const deactivate = playBody.indexOf('deactivateOnlineMusicTransport', fallback);

    assert.ok(cueCommand >= 0 && loadCommand >= 0);
    assert.ok(commandFailure > cueCommand && commandFailure > loadCommand);
    assert.ok(clearAttempt > commandFailure);
    assert.ok(invalidatePlayer > clearAttempt);
    assert.ok(fallback > invalidatePlayer);
    assert.ok(deactivate > fallback);
    assert.match(playBody.slice(commandFailure, deactivate), /isOnlineMusicPlaybackAttemptStale\(attempt\)/);
    assert.match(playBody.slice(commandFailure, deactivate), /!isPlaybackIntentActive\(playbackIntent\)/);
});

test('stale YouTube API attempt callbacks cannot settle or inject over the active retry', async () => {
    const timers = createFakeTimerHarness();
    const scripts = [];
    let currentScript = null;
    const document = {
        querySelector: () => (currentScript && !currentScript.removed ? currentScript : null),
        createElement: () => {
            const listeners = {};
            return {
                listeners,
                dataset: {},
                removed: false,
                addEventListener(type, callback) { listeners[type] = callback; },
                remove() {
                    this.removed = true;
                    if (currentScript === this) currentScript = null;
                }
            };
        },
        head: {
            appendChild(script) {
                scripts.push(script);
                currentScript = script;
                return script;
            }
        }
    };
    const window = { setTimeout: timers.setTimeout };
    const context = vm.createContext({
        URL,
        Date,
        window,
        document,
        clearTimeout: timers.clearTimeout,
        YOUTUBE_EMBED_HOST: 'https://www.youtube.com'
    });
    const loaderFunction = sliceRequired(
        onlineMusicSource,
        'function loadYouTubeIframeApi',
        'function recreateOnlineMusicPlayerHost'
    );
    vm.runInContext(`
        let onlineMusicApiReadyPromise = null;
        let onlineMusicApiReadyResolve = null;
        let onlineMusicApiReadyReject = null;
        let onlineMusicApiLoadGeneration = 0;
        let onlineMusicApiAttemptGeneration = 0;
        ${loaderFunction}
        globalThis.youtubeApiLoader = loadYouTubeIframeApi;
    `, context);

    const readyPromise = context.youtubeApiLoader();
    const firstScript = scripts[0];
    const firstTimeout = timers.latest(8000);
    assert.ok(firstScript);
    assert.ok(firstTimeout);

    firstScript.listeners.error();
    assert.equal(scripts.length, 2);
    const secondScript = scripts[1];
    const timerCountAfterRetry = timers.entries.length;

    firstScript.listeners.error();
    firstScript.listeners.load();
    timers.run(firstTimeout.id);
    assert.equal(scripts.length, 2);
    assert.equal(timers.entries.length, timerCountAfterRetry);

    let outcome = 'pending';
    readyPromise.then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
    await Promise.resolve();
    assert.equal(outcome, 'pending');

    window.YT = { Player: function FakeApiPlayer() {} };
    secondScript.listeners.load();
    const activeLoadCheck = timers.latest(1200);
    assert.ok(activeLoadCheck);
    timers.run(activeLoadCheck.id);
    assert.equal(await readyPromise, window.YT);
    assert.equal(outcome, 'resolved');
});

test('callbacks from a failed YouTube API load generation cannot settle its clean retry', async () => {
    const timers = createFakeTimerHarness();
    const scripts = [];
    let currentScript = null;
    const document = {
        querySelector: () => (currentScript && !currentScript.removed ? currentScript : null),
        createElement: () => {
            const listeners = {};
            return {
                listeners,
                dataset: {},
                removed: false,
                addEventListener(type, callback) { listeners[type] = callback; },
                remove() {
                    this.removed = true;
                    if (currentScript === this) currentScript = null;
                }
            };
        },
        head: {
            appendChild(script) {
                scripts.push(script);
                currentScript = script;
                return script;
            }
        }
    };
    const window = { setTimeout: timers.setTimeout };
    const context = vm.createContext({
        URL,
        Date,
        window,
        document,
        clearTimeout: timers.clearTimeout,
        YOUTUBE_EMBED_HOST: 'https://www.youtube.com'
    });
    const loaderFunction = sliceRequired(
        onlineMusicSource,
        'function loadYouTubeIframeApi',
        'function recreateOnlineMusicPlayerHost'
    );
    vm.runInContext(`
        let onlineMusicApiReadyPromise = null;
        let onlineMusicApiReadyResolve = null;
        let onlineMusicApiReadyReject = null;
        let onlineMusicApiLoadGeneration = 0;
        let onlineMusicApiAttemptGeneration = 0;
        ${loaderFunction}
        globalThis.youtubeApiLoader = loadYouTubeIframeApi;
    `, context);

    const failedPromise = context.youtubeApiLoader();
    const staleReadyHandler = window.onYouTubeIframeAPIReady;
    const firstScript = scripts[0];
    firstScript.listeners.error();
    const secondScript = scripts[1];
    secondScript.listeners.error();
    await assert.rejects(failedPromise, /could not be reached/i);

    const retryPromise = context.youtubeApiLoader();
    const retryScript = scripts[2];
    let retryOutcome = 'pending';
    retryPromise.then(() => { retryOutcome = 'resolved'; }, () => { retryOutcome = 'rejected'; });
    window.YT = { Player: function FakeApiPlayer() {} };

    staleReadyHandler();
    firstScript.listeners.error();
    secondScript.listeners.load();
    await Promise.resolve();
    assert.equal(scripts.length, 3);
    assert.equal(retryOutcome, 'pending');

    retryScript.listeners.load();
    timers.run(timers.latest(1200).id);
    assert.equal(await retryPromise, window.YT);
    assert.equal(retryOutcome, 'resolved');
});

test('player timeout destroys the stale instance and ignores its callbacks during a clean retry', async () => {
    const harness = createOnlineMusicPlayerLifecycleHarness();
    const api = harness.context.playerLifecycleApi;
    const firstPromise = api.ensureOnlineMusicPlayer('video-a');
    assert.equal(api.ensureOnlineMusicPlayer('video-a'), firstPromise);
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(harness.players.length, 1);
    const firstPlayer = harness.players[0];
    assert.equal(firstPlayer.config.width, '200');
    assert.equal(firstPlayer.config.height, '200');
    const firstHost = harness.document.getElementById('online-music-yt-player');
    const firstReadyTimeout = harness.timers.latest(9000);
    assert.ok(firstReadyTimeout);
    harness.timers.run(firstReadyTimeout.id);

    assert.equal(await firstPromise, null);
    assert.equal(firstPlayer.destroyed, true);
    assert.notEqual(harness.document.getElementById('online-music-yt-player'), firstHost);
    assert.equal(api.snapshot().initPromise, null);

    const secondPromise = api.ensureOnlineMusicPlayer('video-b');
    assert.equal(api.ensureOnlineMusicPlayer('video-b'), secondPromise);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(harness.players.length, 2);
    const secondPlayer = harness.players[1];

    firstPlayer.config.events.onReady({ target: firstPlayer });
    firstPlayer.config.events.onStateChange({ target: firstPlayer, data: 1 });
    firstPlayer.config.events.onError({ target: firstPlayer, data: 5 });
    harness.timers.run(firstReadyTimeout.id);
    assert.equal(harness.getStateChangeCalls(), 0);
    assert.equal(harness.getErrorCalls(), 0);
    assert.equal(secondPlayer.destroyed, false);
    assert.equal(api.snapshot().player, secondPlayer);
    assert.equal(api.snapshot().ready, false);

    secondPlayer.config.events.onReady({ target: secondPlayer });
    assert.equal(await secondPromise, secondPlayer);
    assert.equal(api.snapshot().ready, true);
    assert.equal(secondPlayer.volume, 55);
    assert.equal(harness.getSyncCalls(), 1);

    secondPlayer.config.events.onStateChange({ target: secondPlayer, data: 1 });
    secondPlayer.config.events.onError({ target: secondPlayer, data: 5 });
    assert.equal(harness.getStateChangeCalls(), 1);
    assert.equal(harness.getErrorCalls(), 1);
});

test('player constructor failure rebuilds the host and permits a single-flight retry', async () => {
    const harness = createOnlineMusicPlayerLifecycleHarness({ throwOnConstructorCalls: [1] });
    const api = harness.context.playerLifecycleApi;
    const hostCountBeforeFailure = harness.getHostCreateCount();
    const failedPromise = api.ensureOnlineMusicPlayer('video-a');
    assert.equal(api.ensureOnlineMusicPlayer('video-a'), failedPromise);
    assert.equal(await failedPromise, null);
    assert.equal(harness.getPlayerConstructorCalls(), 1);
    assert.ok(harness.getHostCreateCount() > hostCountBeforeFailure);
    assert.equal(api.snapshot().initPromise, null);

    const retryPromise = api.ensureOnlineMusicPlayer('video-b');
    assert.equal(api.ensureOnlineMusicPlayer('video-b'), retryPromise);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(harness.getPlayerConstructorCalls(), 2);
    assert.equal(harness.players.length, 1);
    const retryPlayer = harness.players[0];
    retryPlayer.config.events.onReady({ target: retryPlayer });
    assert.equal(await retryPromise, retryPlayer);
    assert.equal(api.snapshot().player, retryPlayer);
    assert.equal(api.snapshot().ready, true);
});

test('hidden YouTube engine keeps exact 200 by 200 geometry while remaining inert and offscreen', () => {
    const hiddenRule = sliceRequired(
        componentsCssSource,
        '.online-music-player-hidden {',
        '/* Keyboard accessibility: visible focus rings */'
    );
    assert.match(hiddenRule, /left:\s*-9999px/);
    assert.match(hiddenRule, /width:\s*200px/);
    assert.match(hiddenRule, /height:\s*200px/);
    assert.match(hiddenRule, /opacity:\s*0/);
    assert.match(hiddenRule, /pointer-events:\s*none/);
    assert.match(indexSource, /id="online-music-player-shell"[^>]*aria-hidden="true"[^>]*\binert\b/);
});
