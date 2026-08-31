// @ts-nocheck -- Focused browser playback guards are evaluated in a VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const onlineMusicSource = fs.readFileSync(new URL('../js/legacy/online-music.js', import.meta.url), 'utf8');
const runtimeStateSource = fs.readFileSync(new URL('../js/legacy/runtime-state.js', import.meta.url), 'utf8');

function sliceRequired(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(start, -1, startMarker);
    assert.notEqual(end, -1, endMarker);
    return source.slice(start, end);
}

const recoverySource = sliceRequired(
    onlineMusicSource,
    'const ONLINE_MUSIC_PLAYBACK_STABLE_WINDOW_MS',
    'async function handleOnlineMusicPlayerError'
);

function createFakeTimers() {
    let nextId = 0;
    const entries = [];
    return {
        entries,
        setTimeout(callback, delay = 0) {
            const entry = { id: ++nextId, callback, delay: Number(delay) || 0, cleared: false, ran: false };
            entries.push(entry);
            return entry.id;
        },
        clearTimeout(id) {
            const entry = entries.find((candidate) => candidate.id === id);
            if (entry) entry.cleared = true;
        },
        run(entry) {
            assert.ok(entry, 'timer entry should exist');
            if (entry.cleared || entry.ran) return;
            entry.ran = true;
            entry.callback();
        },
        latest(delay) {
            for (let index = entries.length - 1; index >= 0; index -= 1) {
                const entry = entries[index];
                if (!entry.cleared && !entry.ran && entry.delay === delay) return entry;
            }
            return null;
        }
    };
}

function createRecoveryHarness() {
    const timers = createFakeTimers();
    const track = { id: 'track-a', videoId: 'video-a', title: 'Track A', artist: 'Artist', duration: 240 };
    const online = {
        sessionId: 7,
        currentTrackId: 'track-a',
        currentTime: 0,
        duration: 240,
        isPlaying: true,
        playbackContext: 'release',
        queueContextView: 'release',
        queueContextKey: 'release:album-a'
    };
    let activeIntent = { id: 11, trackId: 'track-a', sourceKind: 'online-music' };
    let iframeOwner = true;
    let playerVideoId = 'video-a';
    let playVideoCalls = 0;
    let playbackResult = true;
    const forgotten = [];
    const logs = [];
    const playbackCalls = [];
    const scheduledAdvances = [];
    const failedTracks = [];
    const resolverStates = [];
    const context = vm.createContext({
        Date,
        Promise,
        window: {
            setTimeout: timers.setTimeout,
            YT: { PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0, CUED: 5 } }
        },
        clearTimeout: timers.clearTimeout,
        onlineMusicPlayer: { playVideo() { playVideoCalls += 1; } },
        onlineMusicCurrentTrackStartedFromQueue: false,
        getOnlineMusicState: () => online,
        getOnlineMusicCurrentTrack: () => track,
        getActivePlaybackIntent: () => ({ ...activeIntent }),
        isPlaybackIntentActive(intent) {
            return Number(intent?.id || 0) === activeIntent.id
                && String(intent?.trackId || '') === activeIntent.trackId
                && String(intent?.sourceKind || '') === activeIntent.sourceKind;
        },
        isOnlineMusicTransportOwner: (kind, options = {}) => iframeOwner
            && kind === 'iframe'
            && (!options.sessionId || Number(options.sessionId) === Number(online.sessionId))
            && (!options.trackId || String(options.trackId) === online.currentTrackId),
        getOnlineMusicPlayerVideoId: () => playerVideoId,
        normalizeOnlineMusicTrackId: (value) => String(value || '').trim(),
        sanitizeText: (value) => String(value ?? '').trim(),
        forgetFailedOnlineMusicTrack: (trackId) => forgotten.push(String(trackId || '')),
        rememberFailedOnlineMusicTrack(current, message, options = {}) {
            const failure = {
                trackId: String(current?.id || ''),
                message: String(message || ''),
                videoId: String(options.videoId || '')
            };
            failedTracks.push(failure);
            return failure;
        },
        rememberOnlineMusicPlaybackResolverState(status, message) {
            resolverStates.push({ status: String(status || ''), message: String(message || '') });
        },
        logPlaybackState: (code, message, details) => logs.push({ code, message, details }),
        safeCall(callback, fallback = null) {
            try { return callback(); } catch { return fallback; }
        },
        isOnlineMusicPlaybackResolutionAvailable: () => true,
        getFailedOnlineMusicTrackVideoIds: () => [],
        sanitizeStoredOnlineMusicTrack: (value) => ({ ...value }),
        updateOnlineMusicFeedback() {},
        updatePlayIcons() {},
        syncOnlineMusicPlayerCard() {},
        syncOnlineMusicResultRows() {},
        persistOnlineMusicState() {},
        normalizeOnlineMusicPlaybackContext: (value) => String(value || 'library'),
        getUnifiedAudioQueueState: () => ({ isShuffle: false }),
        isPrivateOnlineMusicPlaybackContext: () => false,
        isPrivateSessionTrackRecord: () => false,
        playOnlineMusicTrack(trackId, options) {
            playbackCalls.push({ trackId, options });
            return playbackResult;
        },
        scheduleOnlineMusicAdvanceAfterFailure: (trackId) => scheduledAdvances.push(String(trackId || '')),
        logError(code, message, details) { logs.push({ code, message, details }); }
    });
    vm.runInContext(`
        ${recoverySource}
        globalThis.recoveryApi = {
            armOnlineMusicPlaybackStabilityWindow,
            markOnlineMusicUserPauseRequested,
            markOnlineMusicUserResumeRequested,
            scheduleOnlineMusicStartupPauseRecovery,
            isOnlineMusicRepeatedStartupPause,
            handleOnlineMusicRepeatedStartupPause,
            isOnlineMusicStartupEndGlitch,
            reserveOnlineMusicTransientResolutionRetry,
            retryOnlineMusicPlaybackAfterPlayerError,
            snapshot: () => ({
                intentId: onlineMusicPlaybackRecoveryGuard.intentId,
                trackId: onlineMusicPlaybackRecoveryGuard.trackId,
                sourceRecoveryCount: onlineMusicPlaybackRecoveryGuard.sourceRecoveryCount,
                resolutionRetryUsed: onlineMusicPlaybackRecoveryGuard.resolutionRetryUsed,
                failedVideoIds: onlineMusicPlaybackRecoveryGuard.failedVideoIds.slice(),
                retryPending: onlineMusicPlaybackRecoveryGuard.retryPending,
                sessionId: onlineMusicPlaybackRecoveryGuard.sessionId,
                videoId: onlineMusicPlaybackRecoveryGuard.videoId,
                playingStartedPosition: onlineMusicPlaybackRecoveryGuard.playingStartedPosition,
                stable: onlineMusicPlaybackRecoveryGuard.stable,
                startupPauseRetryUsed: onlineMusicPlaybackRecoveryGuard.startupPauseRetryUsed,
                userPauseRequested: onlineMusicPlaybackRecoveryGuard.userPauseRequested
            })
        };
    `, context);
    return {
        api: context.recoveryApi,
        timers,
        track,
        online,
        forgotten,
        logs,
        playbackCalls,
        scheduledAdvances,
        failedTracks,
        resolverStates,
        getPlayVideoCalls: () => playVideoCalls,
        setPlaybackResult(value) { playbackResult = value; },
        setStartedFromQueue(value) { context.onlineMusicCurrentTrackStartedFromQueue = !!value; },
        setIntent(intent) { activeIntent = { ...intent }; },
        setIframeOwner(value) { iframeOwner = !!value; },
        setPlayerVideoId(value) { playerVideoId = String(value || ''); }
    };
}

test('YouTube playback is only marked healthy after a five-second stable start', () => {
    const harness = createRecoveryHarness();
    assert.equal(harness.api.armOnlineMusicPlaybackStabilityWindow(harness.track, {
        playbackIntent: { id: 11, trackId: 'track-a', sourceKind: 'online-music' },
        sessionId: 7,
        videoId: 'video-a'
    }), true);
    assert.deepEqual(harness.forgotten, [], 'a split-second PLAYING event must not erase failed-source history');

    const stableTimer = harness.timers.entries.find((entry) => !entry.cleared && !entry.ran && entry.delay >= 4900);
    assert.ok(stableTimer);
    harness.online.currentTime = 2;
    harness.timers.run(stableTimer);

    assert.deepEqual(harness.forgotten, ['track-a']);
    assert.equal(harness.api.snapshot().stable, true);
    assert.equal(harness.logs.some((entry) => entry.code === 'play-stable'), true);
});

test('a PLAYING event without real timeline progress is never declared stable', () => {
    const harness = createRecoveryHarness();
    harness.api.armOnlineMusicPlaybackStabilityWindow(harness.track, {
        playbackIntent: { id: 11, trackId: 'track-a', sourceKind: 'online-music' },
        sessionId: 7,
        videoId: 'video-a'
    });
    harness.online.currentTime = 0.25;
    harness.timers.run(harness.timers.entries.find((entry) => !entry.cleared && !entry.ran && entry.delay >= 4900));

    assert.deepEqual(harness.forgotten, []);
    assert.equal(harness.api.snapshot().stable, false);
});

test('stability callbacks cannot commit after intent, session, owner, or video ownership changes', () => {
    const scenarios = [
        (harness) => harness.setIntent({ id: 12, trackId: 'track-b', sourceKind: 'online-music' }),
        (harness) => { harness.online.sessionId = 8; },
        (harness) => harness.setIframeOwner(false),
        (harness) => harness.setPlayerVideoId('video-b')
    ];
    for (const mutate of scenarios) {
        const harness = createRecoveryHarness();
        harness.api.armOnlineMusicPlaybackStabilityWindow(harness.track, {
            playbackIntent: { id: 11, trackId: 'track-a', sourceKind: 'online-music' },
            sessionId: 7,
            videoId: 'video-a'
        });
        mutate(harness);
        harness.online.currentTime = 2;
        const stableTimer = harness.timers.entries.find((entry) => !entry.cleared && !entry.ran && entry.delay >= 4900);
        harness.timers.run(stableTimer);
        assert.deepEqual(harness.forgotten, []);
        assert.equal(harness.api.snapshot().stable, false);
    }
});

test('automatic alternate-source recovery is single-flight and capped once per playback intent', async () => {
    const harness = createRecoveryHarness();
    const intent = { id: 11, trackId: 'track-a', sourceKind: 'online-music' };

    assert.equal(await harness.api.retryOnlineMusicPlaybackAfterPlayerError(harness.track, {
        videoId: 'video-a',
        playbackIntent: intent
    }), true);
    assert.equal(await harness.api.retryOnlineMusicPlaybackAfterPlayerError(harness.track, {
        videoId: 'video-a',
        playbackIntent: intent
    }), false, 'a duplicate failure must not start a concurrent recovery');

    harness.timers.run(harness.timers.latest(0));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.playbackCalls.length, 1);
    assert.deepEqual(Array.from(harness.playbackCalls[0].options.excludeVideoIds), ['video-a']);
    assert.equal(harness.api.snapshot().retryPending, false);

    assert.equal(await harness.api.retryOnlineMusicPlaybackAfterPlayerError(
        { ...harness.track, videoId: 'video-b' },
        { videoId: 'video-b', playbackIntent: intent }
    ), false, 'a short-lived alternate must not recursively replay forever');
    assert.equal(harness.playbackCalls.length, 1);
});

test('scheduled source recovery is abandoned when its original intent or session becomes stale', async () => {
    const intent = { id: 11, trackId: 'track-a', sourceKind: 'online-music' };
    const mutations = [
        (harness) => { harness.online.sessionId = 8; },
        (harness) => harness.setIntent({ id: 12, trackId: 'track-b', sourceKind: 'online-music' })
    ];
    for (const mutate of mutations) {
        const harness = createRecoveryHarness();
        assert.equal(await harness.api.retryOnlineMusicPlaybackAfterPlayerError(harness.track, {
            videoId: 'video-a',
            playbackIntent: intent
        }), true);
        mutate(harness);
        harness.timers.run(harness.timers.latest(0));
        await Promise.resolve();
        assert.equal(harness.playbackCalls.length, 0);
        assert.equal(harness.api.snapshot().retryPending, false);
    }
});

test('a failed bounded recovery advances an owned queue instead of leaving it stuck', async () => {
    const harness = createRecoveryHarness();
    const intent = { id: 11, trackId: 'track-a', sourceKind: 'online-music' };
    harness.setStartedFromQueue(true);
    harness.setPlaybackResult(false);
    assert.equal(await harness.api.retryOnlineMusicPlaybackAfterPlayerError(harness.track, {
        videoId: 'video-a',
        playbackIntent: intent
    }), true);
    harness.timers.run(harness.timers.latest(0));
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(harness.scheduledAdvances, ['track-a']);
});

test('startup pause recovery issues one guarded play command and respects a user pause', () => {
    const harness = createRecoveryHarness();
    const intent = { id: 11, trackId: 'track-a', sourceKind: 'online-music' };
    harness.api.armOnlineMusicPlaybackStabilityWindow(harness.track, {
        playbackIntent: intent,
        sessionId: 7,
        videoId: 'video-a'
    });
    assert.equal(harness.api.scheduleOnlineMusicStartupPauseRecovery(harness.track), true);
    assert.equal(harness.api.scheduleOnlineMusicStartupPauseRecovery(harness.track), false);
    harness.api.markOnlineMusicUserPauseRequested(harness.track);
    assert.equal(harness.api.handleOnlineMusicRepeatedStartupPause(harness.track), false);
    harness.timers.run(harness.timers.latest(160));
    assert.equal(harness.getPlayVideoCalls(), 0, 'an explicit pause during the retry delay must win');

    const automaticHarness = createRecoveryHarness();
    automaticHarness.api.armOnlineMusicPlaybackStabilityWindow(automaticHarness.track, {
        playbackIntent: intent,
        sessionId: 7,
        videoId: 'video-a'
    });
    assert.equal(automaticHarness.api.scheduleOnlineMusicStartupPauseRecovery(automaticHarness.track), true);
    automaticHarness.timers.run(automaticHarness.timers.latest(160));
    assert.equal(automaticHarness.getPlayVideoCalls(), 1);

    const staleHarness = createRecoveryHarness();
    staleHarness.api.armOnlineMusicPlaybackStabilityWindow(staleHarness.track, {
        playbackIntent: intent,
        sessionId: 7,
        videoId: 'video-a'
    });
    assert.equal(staleHarness.api.scheduleOnlineMusicStartupPauseRecovery(staleHarness.track), true);
    staleHarness.online.sessionId = 8;
    assert.equal(staleHarness.api.handleOnlineMusicRepeatedStartupPause(staleHarness.track), false);
    staleHarness.timers.run(staleHarness.timers.latest(160));
    assert.equal(staleHarness.getPlayVideoCalls(), 0);
});

test('PLAYING then PAUSED then guarded replay then PAUSED switches source once without a manual click', async () => {
    const harness = createRecoveryHarness();
    const intent = { id: 11, trackId: 'track-a', sourceKind: 'online-music' };

    harness.api.armOnlineMusicPlaybackStabilityWindow(harness.track, {
        playbackIntent: intent,
        sessionId: 7,
        videoId: 'video-a'
    });
    harness.online.isPlaying = false;
    assert.equal(harness.api.scheduleOnlineMusicStartupPauseRecovery(harness.track), true);
    harness.timers.run(harness.timers.latest(160));
    assert.equal(harness.getPlayVideoCalls(), 1, 'the first unsolicited startup pause gets one guarded replay');

    harness.online.isPlaying = true;
    harness.online.currentTime = 0.4;
    harness.api.armOnlineMusicPlaybackStabilityWindow(harness.track, {
        playbackIntent: intent,
        sessionId: 7,
        videoId: 'video-a'
    });
    harness.online.isPlaying = false;
    assert.equal(harness.api.scheduleOnlineMusicStartupPauseRecovery(harness.track), false);
    assert.equal(harness.api.handleOnlineMusicRepeatedStartupPause(harness.track), true);
    assert.equal(harness.failedTracks.length, 1);
    assert.equal(harness.logs.some((entry) => entry.code === 'online-player-startup-pause-loop'), true);

    harness.timers.run(harness.timers.latest(0));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.playbackCalls.length, 1, 'the repeated pause should resolve and start one alternate source');
    assert.equal(harness.playbackCalls[0].options.forcePlaybackResolution, true);
    assert.deepEqual(Array.from(harness.playbackCalls[0].options.excludeVideoIds), ['video-a']);
    assert.equal(harness.api.snapshot().sourceRecoveryCount, 1);
    assert.equal(harness.api.snapshot().retryPending, false);

    harness.setStartedFromQueue(true);
    assert.equal(harness.api.handleOnlineMusicRepeatedStartupPause(harness.track), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.playbackCalls.length, 1, 'the alternate-source recovery cap must prevent a playback loop');
    assert.deepEqual(harness.scheduledAdvances, ['track-a'], 'an exhausted queued recovery advances instead of stalling');
});

test('transient resolver timeout gets exactly one retry budget per user playback intent', () => {
    const harness = createRecoveryHarness();
    const firstIntent = { id: 11, trackId: 'track-a', sourceKind: 'online-music' };
    const timeout = new Error('YouTube Music search timed out after 3 seconds.');
    assert.equal(harness.api.reserveOnlineMusicTransientResolutionRetry(harness.track, firstIntent, timeout), true);
    assert.equal(harness.api.reserveOnlineMusicTransientResolutionRetry(harness.track, firstIntent, timeout), false);
    assert.equal(harness.api.reserveOnlineMusicTransientResolutionRetry(
        harness.track,
        firstIntent,
        new Error('Unable to resolve a playable YouTube Music match for this track.')
    ), false);

    const secondIntent = { id: 12, trackId: 'track-a', sourceKind: 'online-music' };
    harness.setIntent(secondIntent);
    assert.equal(harness.api.reserveOnlineMusicTransientResolutionRetry(harness.track, secondIntent, timeout), true);
});

test('successful direct-audio fallback clears the failed-track block after current-owner checks', () => {
    const fallbackBody = sliceRequired(
        runtimeStateSource,
        'async function startOnlineMusicDirectAudioFallback',
        'async function handleOnlineMusicDirectAudioStreamInterruption'
    );
    const mediaStarted = fallbackBody.indexOf('const started = await safePlayMedia');
    const intentGuard = fallbackBody.indexOf('if (!isPlaybackIntentActive(playbackIntent)) return false;', mediaStarted);
    const ownerGuard = fallbackBody.indexOf("if (!isOnlineMusicTransportOwner('direct'", intentGuard);
    const clearFailedTrack = fallbackBody.indexOf('forgetFailedOnlineMusicTrack(current.id)', ownerGuard);
    const successReturn = fallbackBody.indexOf('return true;', clearFailedTrack);
    assert.ok(mediaStarted >= 0 && intentGuard > mediaStarted);
    assert.ok(ownerGuard > intentGuard);
    assert.ok(clearFailedTrack > ownerGuard);
    assert.ok(successReturn > clearFailedTrack);

    const errorHandler = sliceRequired(
        onlineMusicSource,
        'async function handleOnlineMusicPlayerError',
        'function handleOnlineMusicPlayerStateChange'
    );
    const directSuccess = errorHandler.indexOf('if (directStarted)');
    const alternateRetry = errorHandler.indexOf('retryOnlineMusicPlaybackAfterPlayerError(current');
    assert.ok(directSuccess >= 0 && alternateRetry > directSuccess);
    assert.match(errorHandler.slice(directSuccess, alternateRetry), /return;/);
});

test('player state wiring delays health, catches startup endings, and never recursively resumes', () => {
    const stateHandler = sliceRequired(
        onlineMusicSource,
        'function handleOnlineMusicPlayerStateChange',
        'function loadYouTubeIframeApi'
    );
    const playingStart = stateHandler.indexOf('if (event?.data === YTState.PLAYING)');
    const pausedStart = stateHandler.indexOf('} else if (event?.data === YTState.PAUSED)', playingStart);
    const endedStart = stateHandler.indexOf('} else if (event?.data === YTState.ENDED)', pausedStart);
    assert.ok(playingStart >= 0 && pausedStart > playingStart && endedStart > pausedStart);

    const playingBranch = stateHandler.slice(playingStart, pausedStart);
    assert.match(playingBranch, /armOnlineMusicPlaybackStabilityWindow\(current/);
    assert.doesNotMatch(playingBranch, /forgetFailedOnlineMusicTrack/);
    assert.match(stateHandler.slice(pausedStart, endedStart), /scheduleOnlineMusicStartupPauseRecovery\(current/);
    assert.match(stateHandler.slice(pausedStart, endedStart), /handleOnlineMusicRepeatedStartupPause\(current\)/);
    assert.match(stateHandler.slice(endedStart), /isOnlineMusicStartupEndGlitch\(current/);
    assert.match(stateHandler.slice(endedStart), /rememberFailedOnlineMusicTrack\(current/);
    assert.match(stateHandler.slice(endedStart), /playbackIntent:\s*recoveryPlaybackIntent/);

    const playBody = sliceRequired(
        onlineMusicSource,
        'async function playOnlineMusicTrack',
        'async function toggleOnlineMusicPlayback'
    );
    assert.match(playBody, /reserveOnlineMusicTransientResolutionRetry\(track, playbackIntent, error\)/);
    assert.match(playBody, /ONLINE_MUSIC_TRANSIENT_RESOLUTION_RETRY_DELAY_MS/);
    assert.match(playBody, /isOnlineMusicPlaybackAttemptStale\(attempt\) \|\| !isPlaybackIntentActive\(playbackIntent\)/);
});
