// @ts-nocheck -- The browser playback helper is evaluated in a focused VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const onlineMusicSource = fs.readFileSync(new URL('../js/legacy/online-music.js', import.meta.url), 'utf8');

function sliceRequired(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(start, -1, startMarker);
    assert.notEqual(end, -1, endMarker);
    return source.slice(start, end);
}

const retryHelperSource = sliceRequired(
    onlineMusicSource,
    'async function ensureOnlineMusicPlayerForPlayback',
    'async function resolvePlayableOnlineMusicTrack'
);

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createRetryHarness(results = []) {
    const queue = results.slice();
    const calls = [];
    const logs = [];
    let stale = false;
    let intentActive = true;
    let stateSessionId = 7;
    const context = vm.createContext({
        ensureOnlineMusicPlayer(videoId, options) {
            calls.push({ videoId, options: { ...options } });
            return Promise.resolve(queue.shift() ?? null);
        },
        isOnlineMusicPlaybackAttemptStale() {
            return stale;
        },
        isPlaybackIntentActive() {
            return intentActive;
        },
        getOnlineMusicState() {
            return { sessionId: stateSessionId };
        },
        sanitizeText(value = '') {
            return String(value ?? '').trim();
        },
        logAction(code, message, details) {
            logs.push({ code, message, details });
        }
    });
    vm.runInContext(`
        let onlineMusicSessionId = 7;
        ${retryHelperSource}
        globalThis.retryApi = {
            ensureOnlineMusicPlayerForPlayback,
            setEngineSessionId(value) { onlineMusicSessionId = Number(value) || 0; }
        };
    `, context);
    return {
        api: context.retryApi,
        calls,
        logs,
        setStale(value) { stale = !!value; },
        setIntentActive(value) { intentActive = !!value; },
        setStateSessionId(value) { stateSessionId = Number(value) || 0; }
    };
}

function playbackOptions(overrides = {}) {
    return {
        retry: true,
        attempt: { id: 3, trackId: 'track-a' },
        sessionId: 7,
        playbackIntent: { id: 4, trackId: 'track-a', sourceKind: 'online-music' },
        ...overrides
    };
}

test('cold-start player initialization retries once and returns the fresh usable player', async () => {
    const readyPlayer = { loadVideoById() {} };
    const harness = createRetryHarness([null, readyPlayer]);
    const player = await harness.api.ensureOnlineMusicPlayerForPlayback('video-a', playbackOptions());

    assert.equal(player, readyPlayer);
    assert.equal(harness.calls.length, 2);
    assert.deepEqual(harness.calls.map((call) => call.videoId), ['video-a', 'video-a']);
    assert.equal(harness.calls.every((call) => call.options.quiet === true), true);
    assert.equal(harness.logs.length, 1);
    assert.equal(harness.logs[0].code, 'online-player-init-retry');
});

test('a failed parallel initialization gets exactly one fresh retry', async () => {
    const readyPlayer = { loadVideoById() {} };
    const harness = createRetryHarness([readyPlayer]);
    const player = await harness.api.ensureOnlineMusicPlayerForPlayback('resolved-video', playbackOptions({
        initialPromise: Promise.resolve(null)
    }));

    assert.equal(player, readyPlayer);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].videoId, 'resolved-video');
    assert.equal(harness.logs.length, 1);
});

test('player initialization never retries more than once', async () => {
    const unexpectedThirdPlayer = { loadVideoById() {} };
    const harness = createRetryHarness([null, null, unexpectedThirdPlayer]);
    const player = await harness.api.ensureOnlineMusicPlayerForPlayback('video-a', playbackOptions());

    assert.equal(player, null);
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.logs.length, 1);
});

test('paused preparation opts out of the cold-start retry', async () => {
    const harness = createRetryHarness([null, { loadVideoById() {} }]);
    const player = await harness.api.ensureOnlineMusicPlayerForPlayback('video-a', playbackOptions({ retry: false }));

    assert.equal(player, null);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.logs.length, 0);
});

test('stale attempts, intents, and sessions cannot launch the fresh retry', async () => {
    const cases = [
        {
            name: 'stale attempt',
            configure(harness) { harness.setStale(true); }
        },
        {
            name: 'inactive playback intent',
            configure(harness) { harness.setIntentActive(false); }
        },
        {
            name: 'replaced state session',
            configure(harness) { harness.setStateSessionId(8); }
        },
        {
            name: 'replaced engine session',
            configure(harness) { harness.api.setEngineSessionId(8); }
        }
    ];

    for (const scenario of cases) {
        const firstAttempt = createDeferred();
        const harness = createRetryHarness([{ loadVideoById() {} }]);
        const playback = harness.api.ensureOnlineMusicPlayerForPlayback('video-a', playbackOptions({
            initialPromise: firstAttempt.promise
        }));
        scenario.configure(harness);
        firstAttempt.resolve(null);

        assert.equal(await playback, null, scenario.name);
        assert.equal(harness.calls.length, 0, scenario.name);
        assert.equal(harness.logs.length, 0, scenario.name);
    }
});

test('playback keeps parallel initialization, post-retry guards, and direct-audio fallback ordering', () => {
    const playBody = sliceRequired(
        onlineMusicSource,
        'async function playOnlineMusicTrack',
        'async function toggleOnlineMusicPlayback'
    );
    const parallelInit = playBody.indexOf('const playerPromise = track.playableInEmbed === false');
    const resolver = playBody.indexOf('resolvePlayableOnlineMusicTrack(track');
    const retryWait = playBody.indexOf('player = await ensureOnlineMusicPlayerForPlayback');
    const staleGuard = playBody.indexOf('if (isOnlineMusicPlaybackAttemptStale(attempt))', retryWait);
    const unavailableBranch = playBody.indexOf("logError('online-player-unavailable'", retryWait);
    const directFallback = playBody.indexOf('startOnlineMusicDirectAudioFallback(resolved', unavailableBranch);

    assert.ok(parallelInit >= 0 && parallelInit < resolver);
    assert.ok(retryWait > resolver);
    assert.match(playBody.slice(retryWait, staleGuard), /initialPromise:\s*playerPromise/);
    assert.match(playBody.slice(retryWait, staleGuard), /retry:\s*shouldAutoplay/);
    assert.match(playBody.slice(retryWait, staleGuard), /attempt,[\s\S]*?sessionId,[\s\S]*?playbackIntent/);
    assert.ok(staleGuard > retryWait);
    assert.ok(unavailableBranch > staleGuard);
    assert.ok(directFallback > unavailableBranch);
});
