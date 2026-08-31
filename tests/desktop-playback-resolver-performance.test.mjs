// @ts-nocheck -- The focused tests evaluate the CommonJS Electron entrypoint in a VM sandbox.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const electronMainUrl = new URL('../electron-main.cjs', import.meta.url);
const electronMainPath = fileURLToPath(electronMainUrl);
const electronMainDir = path.dirname(electronMainPath);
const electronMainSource = fs.readFileSync(electronMainUrl, 'utf8');
const requireFromElectronMain = createRequire(electronMainUrl);

function loadResolverApi() {
    const app = {
        isPackaged: false,
        requestSingleInstanceLock: () => true,
        on() {},
        whenReady: () => ({ then() {} }),
        getPath: () => electronMainDir,
        getVersion: () => 'test'
    };
    class BrowserWindowMock {
        static getAllWindows() {
            return [];
        }
    }
    const electronMock = {
        app,
        BrowserWindow: BrowserWindowMock,
        dialog: {},
        ipcMain: { handle() {} },
        session: { defaultSession: {} }
    };
    const moduleRecord = { exports: {} };
    const sandbox = {
        module: moduleRecord,
        exports: moduleRecord.exports,
        require(specifier) {
            return specifier === 'electron' ? electronMock : requireFromElectronMain(specifier);
        },
        __dirname: electronMainDir,
        __filename: electronMainPath,
        AbortController,
        Buffer,
        console,
        clearInterval,
        clearTimeout,
        fetch: globalThis.fetch,
        Headers,
        process,
        setInterval,
        setTimeout,
        URL
    };
    const instrumentedSource = `${electronMainSource}\nmodule.exports.__resolverTestApi = {
        createOnlinePlaybackResolverRuntime,
        ONLINE_PLAYBACK_EARLY_ACCEPT_SCORE,
        ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS,
        ONLINE_PLAYBACK_TOTAL_TIMEOUT_MS,
        resolveOnlineTrackPlayback
    };`;
    vm.runInNewContext(instrumentedSource, sandbox, { filename: electronMainPath });
    return moduleRecord.exports.__resolverTestApi;
}

const api = loadResolverApi();

function makeOfficialAudioEntry({
    id = 'video001',
    title = 'Artist - Song (Official Audio)',
    artist = 'Artist',
    channel = 'Artist - Topic',
    playableInEmbed = true,
    testScore = 700,
    duration = 214
} = {}) {
    return {
        id,
        title,
        artist,
        channel,
        description: 'Provided to YouTube by Artist',
        duration,
        playable_in_embed: playableInEmbed,
        testScore,
        thumbnail: `https://img.example/${id}.jpg`,
        webpage_url: `https://www.youtube.com/watch?v=${id}`
    };
}

function targetOf(args) {
    return String(args.at(-1) || '');
}

function makeHighConfidenceEntryForTarget(target, id) {
    const query = String(target || '')
        .replace(/^ytsearch\d+:/, '')
        .replace(/\s+official audio$/i, '')
        .trim();
    const [artist = 'Artist', ...titleParts] = query.split(/\s+/);
    const title = titleParts.join(' ') || 'Song';
    return makeOfficialAudioEntry({
        id,
        artist,
        channel: `${artist} - Topic`,
        title: `${artist} - ${title} (Official Audio)`
    });
}

function normalizeSyntheticPlaybackEntry(entry, options = {}) {
    const videoId = String(entry?.id || '');
    if (!videoId || options.excludeVideoIds?.has(videoId)) return null;
    const sourceSurface = String(options.sourceSurface || '');
    return {
        query: String(options.query || ''),
        videoId,
        title: String(entry.title || ''),
        artist: String(entry.artist || ''),
        channelTitle: String(entry.channel || entry.artist || ''),
        channelId: '',
        description: String(entry.description || ''),
        tags: [],
        duration: Number(entry.duration || 0),
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: String(entry.thumbnail || ''),
        sourceSurface,
        resolver: sourceSurface === 'youtube-music' ? 'yt-dlp-music-search' : 'yt-dlp-search',
        playableInEmbed: entry.playable_in_embed,
        viewCount: 0,
        score: Number(entry.testScore || 0),
        scoreReason: 'synthetic-focused-test'
    };
}

function createRuntime(options = {}) {
    return api.createOnlinePlaybackResolverRuntime({
        ...options,
        normalizeEntry: options.normalizeEntry || normalizeSyntheticPlaybackEntry
    });
}

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function createFakeClock(startMs = 0) {
    let nowMs = startMs;
    let nextTimerId = 0;
    const timers = [];
    return {
        now: () => nowMs,
        setTimer(callback, delayMs = 0) {
            const timer = {
                callback,
                cancelled: false,
                dueAt: nowMs + Math.max(0, Number(delayMs) || 0),
                id: ++nextTimerId
            };
            timers.push(timer);
            return timer.id;
        },
        clearTimer(timerId) {
            const timer = timers.find((entry) => entry.id === timerId);
            if (timer) timer.cancelled = true;
        },
        advanceTo(targetMs) {
            nowMs = targetMs;
            timers
                .filter((timer) => !timer.cancelled && timer.dueAt <= nowMs)
                .sort((left, right) => left.dueAt - right.dueAt)
                .forEach((timer) => {
                    timer.cancelled = true;
                    timer.callback();
                });
        }
    };
}

async function flushMicrotasks() {
    for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
    }
}

test('high-confidence official-audio result returns after the primary ytsearch without fallback', async () => {
    const calls = [];
    const runtime = createRuntime({
        runSearch: async (args, options) => {
            calls.push({ target: targetOf(args), options: { ...options } });
            return { entries: [makeOfficialAudioEntry({ testScore: api.ONLINE_PLAYBACK_EARLY_ACCEPT_SCORE })] };
        }
    });

    const result = await api.resolveOnlineTrackPlayback({
        artist: 'Artist',
        title: 'Song',
        releaseTitle: 'Album'
    }, runtime);

    assert.equal(calls.length, 1);
    assert.equal(api.ONLINE_PLAYBACK_EARLY_ACCEPT_SCORE, 610);
    assert.match(calls[0].target, /^ytsearch8:Artist Song official audio$/);
    assert.ok(result.playbackScore >= api.ONLINE_PLAYBACK_EARLY_ACCEPT_SCORE);
    assert.equal(result.videoId, 'video001');
    assert.equal(result.sourceSurface, 'youtube');
});

test('real production normalizer and scorer reach the exact official-audio fast path', async () => {
    const calls = [];
    const runtime = api.createOnlinePlaybackResolverRuntime({
        runSearch: async (args) => {
            calls.push(targetOf(args));
            return {
                entries: [makeOfficialAudioEntry({
                    artist: 'Artist',
                    channel: 'Artist',
                    title: 'Song (Official Audio)',
                    testScore: 0
                })]
            };
        }
    });

    const result = await api.resolveOnlineTrackPlayback({
        artist: 'Artist',
        title: 'Song',
        releaseTitle: 'Song'
    }, runtime);

    assert.equal(calls.length, 1);
    assert.ok(result.playbackScore >= api.ONLINE_PLAYBACK_EARLY_ACCEPT_SCORE);
    assert.equal(result.videoId, 'video001');
    assert.equal(result.sourceSurface, 'youtube');
});

test('a 609 primary invokes one broader fallback and preserves merged ranking order', async () => {
    const calls = [];
    const sharedId = 'shared01';
    const runtime = createRuntime({
        runSearch: async (args) => {
            const target = targetOf(args);
            calls.push(target);
            if (/^ytsearch\d+:Artist Song official audio$/.test(target)) {
                return { entries: [makeOfficialAudioEntry({ id: sharedId, testScore: 609 })] };
            }
            if (/^ytsearch\d+:Artist Song$/.test(target)) {
                return { entries: [makeOfficialAudioEntry({ id: sharedId, testScore: 700 })] };
            }
            return { entries: [] };
        }
    });

    const result = await api.resolveOnlineTrackPlayback({
        artist: 'Artist',
        title: 'Song',
        cover: 'https://covers.example/song.jpg',
        duration: 200
    }, runtime);

    assert.equal(calls.length, 2);
    assert.match(calls[0], /^ytsearch8:Artist Song official audio$/);
    assert.match(calls[1], /^ytsearch8:Artist Song$/);
    assert.equal(result.videoId, sharedId);
    assert.equal(result.sourceSurface, 'youtube');
    assert.equal(result.resolver, 'yt-dlp-search');
    assert.deepEqual(Object.keys(result).sort(), [
        'artist',
        'canonicalUrl',
        'channelId',
        'channelTitle',
        'cover',
        'duration',
        'excludedVideoIds',
        'playableInEmbed',
        'playbackScore',
        'resolvedArtist',
        'resolvedTitle',
        'resolver',
        'sourceSurface',
        'thumbnail',
        'title',
        'videoId'
    ]);
});

test('a high-scoring but non-exact official result still invokes fallback', async () => {
    const calls = [];
    const runtime = createRuntime({
        runSearch: async (args) => {
            const target = targetOf(args);
            calls.push(target);
            if (/^ytsearch\d+:Artist Song official audio$/.test(target)) {
                return {
                    entries: [makeOfficialAudioEntry({
                        id: 'live001',
                        title: 'Artist - Song Live (Official Audio)',
                        testScore: 700
                    })]
                };
            }
            if (/^ytsearch\d+:Artist Song$/.test(target)) {
                return { entries: [makeOfficialAudioEntry({ id: 'exact001', testScore: 710 })] };
            }
            return { entries: [] };
        }
    });

    const result = await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Song' }, runtime);

    assert.equal(calls.length, 2);
    assert.equal(result.videoId, 'exact001');
    assert.equal(result.sourceSurface, 'youtube');
});

test('a high-scoring non-embeddable exact result still invokes fallback', async () => {
    const calls = [];
    const runtime = createRuntime({
        runSearch: async (args) => {
            const target = targetOf(args);
            calls.push(target);
            if (/^ytsearch\d+:Artist Song official audio$/.test(target)) {
                return {
                    entries: [makeOfficialAudioEntry({
                        id: 'blocked01',
                        playableInEmbed: false,
                        testScore: 700
                    })]
                };
            }
            if (/^ytsearch\d+:Artist Song$/.test(target)) {
                return { entries: [makeOfficialAudioEntry({ id: 'embed001', testScore: 710 })] };
            }
            return { entries: [] };
        }
    });

    const result = await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Song' }, runtime);

    assert.equal(calls.length, 2);
    assert.equal(result.videoId, 'embed001');
    assert.equal(result.sourceSurface, 'youtube');
    assert.equal(result.playableInEmbed, true);
});

test('an only non-embeddable candidate is preserved for immediate desktop-audio fallback', async () => {
    const runtime = createRuntime({
        runSearch: async () => ({
            entries: [makeOfficialAudioEntry({
                id: 'blocked-only',
                playableInEmbed: false,
                testScore: 700
            })]
        })
    });

    const result = await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Song' }, runtime);
    assert.equal(result.videoId, 'blocked-only');
    assert.equal(result.playableInEmbed, false);
});

test('soft gate launches only one broad fallback and aborts the slow primary after a confident result', async () => {
    const clock = createFakeClock();
    const calls = [];
    const runtime = createRuntime({
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        runSearch: (args, options) => {
            const deferred = createDeferred();
            calls.push({
                deferred,
                target: targetOf(args),
                startedAt: clock.now(),
                timeoutMs: options.timeoutMs,
                deadlineAt: options.deadlineAt,
                signal: options.signal
            });
            return deferred.promise;
        }
    });

    const resultPromise = api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Song' }, runtime);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].startedAt, 0);
    assert.equal(calls[0].timeoutMs, 6500);
    assert.equal(calls[0].deadlineAt, 6500);

    clock.advanceTo(api.ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS);
    await flushMicrotasks();

    assert.equal(calls.length, 2, 'only one fallback should overlap the primary');
    assert.equal(calls[1].startedAt, api.ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS);
    assert.equal(calls[1].timeoutMs, 6500);
    assert.equal(calls[1].deadlineAt, 8900);
    assert.match(calls[1].target, /^ytsearch8:Artist Song$/);

    clock.advanceTo(2500);
    calls[1].deferred.resolve({
        entries: [makeOfficialAudioEntry({ id: 'fallback01', testScore: 720 })]
    });
    const result = await resultPromise;

    assert.equal(result.videoId, 'fallback01');
    assert.equal(result.sourceSurface, 'youtube');
    assert.equal(result.playbackScore, 720);
    assert.equal(calls[0].signal.aborted, true, 'the losing yt-dlp process should be cancelled');
});

test('two timed-out YouTube attempts fall back to YouTube Music with a useful bounded window', async () => {
    const clock = createFakeClock();
    const calls = [];
    const runtime = createRuntime({
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        runSearch: (args, options) => {
            const call = {
                deadlineAt: options.deadlineAt,
                startedAt: clock.now(),
                target: targetOf(args),
                timeoutMs: options.timeoutMs,
                deferred: createDeferred()
            };
            calls.push(call);
            if (call.target.startsWith('https://music.youtube.com/search?')) return call.deferred.promise;
            clock.setTimer(() => call.deferred.reject(new Error('simulated bounded timeout')), options.timeoutMs);
            return call.deferred.promise;
        }
    });

    const resultPromise = api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Song' }, runtime);
    clock.advanceTo(api.ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS);
    await flushMicrotasks();
    assert.equal(calls.length, 2);

    clock.advanceTo(6500);
    await flushMicrotasks();
    assert.equal(calls.length, 2);
    clock.advanceTo(8900);
    await flushMicrotasks();
    assert.equal(calls.length, 3, 'the final recovery starts only after both YouTube attempts fail');
    assert.ok(calls[2].target.startsWith('https://music.youtube.com/search?'));
    assert.equal(calls[2].startedAt, 8900);
    assert.equal(calls[2].timeoutMs, 6100);
    assert.equal(calls[2].deadlineAt, api.ONLINE_PLAYBACK_TOTAL_TIMEOUT_MS);

    calls[2].deferred.resolve({
        entries: [makeOfficialAudioEntry({ id: 'music-recovery', testScore: 730 })]
    });
    const result = await resultPromise;
    assert.equal(result.videoId, 'music-recovery');
    assert.equal(result.sourceSurface, 'youtube-music');
});

test('all resolver attempts remain capped at three and stop at the total deadline', async () => {
    const clock = createFakeClock();
    const calls = [];
    const runtime = createRuntime({
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        runSearch: (args, options) => new Promise((_resolve, reject) => {
            calls.push({
                deadlineAt: options.deadlineAt,
                startedAt: clock.now(),
                target: targetOf(args),
                timeoutMs: options.timeoutMs
            });
            clock.setTimer(() => reject(new Error('simulated bounded timeout')), options.timeoutMs);
        })
    });

    const resultPromise = api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Song' }, runtime);
    clock.advanceTo(api.ONLINE_PLAYBACK_PRIMARY_SEARCH_TIMEOUT_MS);
    await flushMicrotasks();
    clock.advanceTo(6500);
    await flushMicrotasks();
    clock.advanceTo(8900);
    await flushMicrotasks();
    assert.equal(calls.length, 3);
    clock.advanceTo(api.ONLINE_PLAYBACK_TOTAL_TIMEOUT_MS);
    await flushMicrotasks();
    await assert.rejects(resultPromise, /unable to resolve/i);

    assert.equal(clock.now(), api.ONLINE_PLAYBACK_TOTAL_TIMEOUT_MS);
    assert.equal(calls[0].timeoutMs, 6500);
    assert.equal(calls[1].timeoutMs, 6500);
    assert.equal(calls[2].timeoutMs, 6100);
    assert.deepEqual(calls.map((call) => call.deadlineAt), [6500, 8900, 15000]);
});

test('normalized exclusions isolate cache entries while equivalent exclusion sets share them', async () => {
    let searchCalls = 0;
    const runtime = createRuntime({
        runSearch: async () => {
            searchCalls += 1;
            return { entries: [makeOfficialAudioEntry()] };
        }
    });
    const payload = { artist: 'Artist', title: 'Song' };

    const first = await api.resolveOnlineTrackPlayback({
        ...payload,
        excludeVideoIds: ['excludeB', 'excludeA']
    }, runtime);
    const cached = await api.resolveOnlineTrackPlayback({
        artist: ' artist ',
        title: ' song ',
        excludeVideoIds: ['excludeA', 'excludeB', 'excludeA']
    }, runtime);
    await api.resolveOnlineTrackPlayback({
        ...payload,
        excludeVideoIds: ['excludeC']
    }, runtime);

    assert.equal(searchCalls, 2);
    assert.notEqual(first, cached);
    assert.deepEqual(Array.from(cached.excludedVideoIds), ['excludeA', 'excludeB']);
    first.excludedVideoIds.push('mutated');
    assert.deepEqual(Array.from(cached.excludedVideoIds), ['excludeA', 'excludeB']);
});

test('v3 query-only cache gives automatic and manual playback parity while composing caller-specific fields', async () => {
    let searchCalls = 0;
    const runtime = createRuntime({
        runSearch: async () => {
            searchCalls += 1;
            return { entries: [makeOfficialAudioEntry({ duration: 0 })] };
        }
    });
    const firstCover = `data:image/png;base64,first-${'a'.repeat(65536)}`;
    const secondCover = `data:image/png;base64,second-${'b'.repeat(65536)}`;

    const first = await api.resolveOnlineTrackPlayback({
        artist: 'Artist',
        canonicalUrl: 'https://catalog.example/first',
        cover: firstCover,
        duration: 111,
        releaseTitle: 'Album',
        title: 'Song',
        trackId: 'track-first',
        videoId: 'input001'
    }, runtime);
    const second = await api.resolveOnlineTrackPlayback({
        artist: ' ARTIST ',
        canonicalUrl: 'https://catalog.example/second',
        cover: secondCover,
        duration: 222,
        releaseTitle: '',
        title: ' song ',
        trackId: 'track-second',
        videoId: 'input002'
    }, runtime);

    assert.equal(searchCalls, 1);
    assert.equal(first.cover, firstCover);
    assert.equal(second.cover, secondCover);
    assert.equal(first.duration, 111);
    assert.equal(second.duration, 222);
    assert.equal(first.title, 'Song');
    assert.equal(second.title, 'song');
    assert.equal(first.artist, 'Artist');
    assert.equal(second.artist, 'ARTIST');
    const cacheKeys = Array.from(runtime.cache.keys());
    assert.equal(cacheKeys.length, 1);
    assert.match(cacheKeys[0], /^\["v3"/);
    assert.doesNotMatch(cacheKeys[0], /Album|track-first|track-second|input001|input002|data:image|catalog\.example|111|222/);
    const cacheRecord = Array.from(runtime.cache.values())[0];
    assert.equal(Object.hasOwn(cacheRecord.value, 'cover'), false);
    assert.equal(Object.hasOwn(cacheRecord.value, 'excludedVideoIds'), false);
    assert.equal(cacheRecord.value.duration, 0);
});

test('concurrent automatic and manual payload variants use one in-flight search and defensive result copies', async () => {
    let searchCalls = 0;
    let finishSearch;
    const pendingSearch = new Promise((resolve) => { finishSearch = resolve; });
    const runtime = createRuntime({
        runSearch: () => {
            searchCalls += 1;
            return pendingSearch;
        }
    });

    const firstPromise = api.resolveOnlineTrackPlayback({
        artist: 'Artist',
        releaseTitle: 'Album visible in the manually clicked row',
        title: 'Song',
        trackId: 'manual-row-track'
    }, runtime);
    const secondPromise = api.resolveOnlineTrackPlayback({
        artist: ' ARTIST ',
        releaseTitle: '',
        title: ' song ',
        trackId: 'automatic-queue-track'
    }, runtime);
    assert.equal(searchCalls, 1);

    finishSearch({ entries: [makeOfficialAudioEntry()] });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    assert.equal(searchCalls, 1);
    assert.notEqual(first, second);
    assert.notEqual(first.excludedVideoIds, second.excludedVideoIds);
    assert.equal(first.title, 'Song');
    assert.equal(second.title, 'song');
    first.excludedVideoIds.push('mutated');
    assert.deepEqual(Array.from(second.excludedVideoIds), []);
});

test('cache TTL expires deterministically', async () => {
    let nowMs = 0;
    let searchCalls = 0;
    const runtime = createRuntime({
        cacheTtlMs: 100,
        now: () => nowMs,
        runSearch: async () => {
            searchCalls += 1;
            return { entries: [makeOfficialAudioEntry()] };
        }
    });
    const payload = { artist: 'Artist', title: 'Song' };

    await api.resolveOnlineTrackPlayback(payload, runtime);
    nowMs = 99;
    await api.resolveOnlineTrackPlayback(payload, runtime);
    assert.equal(searchCalls, 1);
    nowMs = 100;
    await api.resolveOnlineTrackPlayback(payload, runtime);
    assert.equal(searchCalls, 2);
});

test('cache enforces LRU recency and its configured entry bound', async () => {
    let sequence = 0;
    const runtime = createRuntime({
        cacheMaxEntries: 2,
        cacheTtlMs: 10000,
        runSearch: async (args) => {
            sequence += 1;
            return { entries: [makeHighConfidenceEntryForTarget(targetOf(args), `video${String(sequence).padStart(3, '0')}`)] };
        }
    });

    await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Alpha' }, runtime);
    await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Beta' }, runtime);
    await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Alpha' }, runtime);
    await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Gamma' }, runtime);
    await api.resolveOnlineTrackPlayback({ artist: 'Artist', title: 'Beta' }, runtime);

    assert.equal(sequence, 4);
    assert.equal(runtime.cache.size, 2);
});

test('failed resolutions are neither cached nor left in the single-flight map', async () => {
    let searchCalls = 0;
    const runtime = createRuntime({
        runSearch: async () => {
            searchCalls += 1;
            throw new Error('simulated search failure');
        }
    });
    const payload = { artist: 'Artist', title: 'Song' };

    await assert.rejects(api.resolveOnlineTrackPlayback(payload, runtime), /unable to resolve/i);
    await assert.rejects(api.resolveOnlineTrackPlayback(payload, runtime), /unable to resolve/i);

    assert.equal(searchCalls, 6);
    assert.equal(runtime.cache.size, 0);
    assert.equal(runtime.inFlight.size, 0);
});
