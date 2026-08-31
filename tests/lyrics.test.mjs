// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readNexPlaySource } from './source-fixture.mjs';

const html = readNexPlaySource();
const bootstrap = fs.readFileSync(new URL('../nexplay-next/bootstrap.js', import.meta.url), 'utf8');
const enrichmentWorker = fs.readFileSync(new URL('../nexplay-next/workers/enrichment.worker.js', import.meta.url), 'utf8');

function sliceRequired(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    assert.notEqual(start, -1, `Missing marker: ${startMarker}`);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(end, -1, `Missing marker: ${endMarker}`);
    return source.slice(start, end);
}

test('lyrics lookup normalization preserves valid international punctuation and letters', () => {
    const normalizeSource = sliceRequired(
        html,
        'function normalizeLyricsLookupText',
        'function normalizeLyricsArtistName'
    );
    const context = vm.createContext({
        cleanStr: (value) => String(value || '').trim()
    });
    vm.runInContext(`${normalizeSource}; globalThis.normalize = normalizeLyricsLookupText;`, context);

    assert.equal(context.normalize('Anaïs'), 'Anaïs');
    assert.equal(context.normalize('¿Dónde?'), '¿Dónde?');
    assert.equal(context.normalize('½ Alive'), '½ Alive');
});

test('synced lyrics parser handles comma decimals, offsets, and long minute tags', () => {
    const parserSource = sliceRequired(
        html,
        'function normalizeSyncedLyricTimeline',
        'function findSyncedLyricIndex'
    );
    const raw = [
        '[offset:+500]',
        '[00:01,250][00:02.500]Got your life',
        '[123:04.050]Long-form timestamp'
    ].join('\n');
    const context = {};

    vm.runInNewContext(`
        const LYRICS_MAX_RAW_LENGTH = 500000;
        const LYRICS_MAX_SOURCE_LINES = 10000;
        const LYRICS_MAX_PARSED_LINES = 5000;
        ${parserSource}
        globalThis.parseSyncedLyricsUnderTest = parseSyncedLyrics;
        globalThis.result = parseSyncedLyrics(${JSON.stringify(raw)});
    `, context);

    const result = JSON.parse(JSON.stringify(context.result));

    assert.deepEqual(result.map((line) => line.text), [
        'Got your life',
        'Got your life',
        'Long-form timestamp'
    ]);
    assert.deepEqual(result.map((line) => Number(line.time.toFixed(3))), [
        1.75,
        3,
        7384.55
    ]);
    assert.deepEqual(Array.from(context.parseSyncedLyricsUnderTest('x'.repeat(500001))), []);
    assert.deepEqual(Array.from(context.parseSyncedLyricsUnderTest('[00:01]line\n'.repeat(10001))), []);
});

test('lyrics resolver searches LRCLIB alternatives before exact get and filters weak fallback candidates', () => {
    const resolverSource = sliceRequired(
        html,
        'async function resolveLyricsCandidate',
        'function applyResolvedLyricsCandidate'
    );
    const getIndex = resolverSource.indexOf('fetchLrclibGetCandidates');
    const searchIndex = resolverSource.indexOf('fetchLrclibSearchCandidates');

    assert.ok(getIndex > -1, 'resolver should call the exact LRCLIB get endpoint');
    assert.ok(searchIndex > -1, 'resolver should use LRCLIB search');
    assert.ok(searchIndex < getIndex, 'search should run before exact get so synced alternates beat plain-only get matches');
    assert.match(resolverSource, /getBestAcceptableLyricsCandidate\(ranked\)/);
    assert.match(html, /function isAcceptableLyricsCandidate\(candidate = null\)/);
});

test('lyrics resolver mirrors LRCLIB website keyword search before accepting plain lyrics', () => {
    assert.match(html, /const LYRICS_LRCLIB_SEARCH_RESULT_LIMIT = 20;/);
    assert.match(html, /function buildLrclibKeywordSearchQueries\(queries = \[\], track = null\)/);
    assert.match(html, /params\.set\('q', query\.q\)/);
    assert.match(html, /provider: 'lrclib:search:q'/);
    assert.match(html, /slice\(0, LYRICS_LRCLIB_SEARCH_RESULT_LIMIT\)\.flatMap/);
    assert.doesNotMatch(html, /async function collectLyricsCandidatesUntilSynced/);
    assert.doesNotMatch(html, /const LYRICS_FAST_QUERY_LIMIT/);

    const resolverSource = sliceRequired(
        html,
        'async function resolveLyricsCandidate',
        'function applyResolvedLyricsCandidate'
    );
    const structuredSearchIndex = resolverSource.indexOf('fetchLrclibSearchCandidates(queries, track, { signal })');
    const keywordSearchIndex = resolverSource.indexOf('buildLrclibKeywordSearchQueries(queries, track)');
    const plainFallbackIndex = resolverSource.indexOf('fetchLyricsOvhCandidates(queries, track, { signal })');

    assert.ok(structuredSearchIndex > -1, 'resolver should still try structured LRCLIB search');
    assert.ok(keywordSearchIndex > -1, 'resolver should build LRCLIB keyword searches');
    assert.ok(plainFallbackIndex > keywordSearchIndex, 'plain fallback providers should wait until keyword LRCLIB search finishes');
});

test('LRCLIB lookups allow enough time before falling back to plain providers', () => {
    assert.match(html, /const LYRICS_FETCH_TIMEOUT_MS = 12000;/);
    assert.match(html, /const LYRICS_LRCLIB_TIMEOUT_MS = 30000;/);
    assert.match(html, /const LYRICS_WATCHDOG_TIMEOUT_MS = 45000;/);
    assert.doesNotMatch(html, /fetchJsonWithTimeout\(url, 3600\)/);
    assert.match(html, /fetchLrclibSearchCandidates[\s\S]*fetchJsonWithTimeout\(url, LYRICS_LRCLIB_TIMEOUT_MS, \{ signal: options\.signal \}\)/);
});

test('lyrics request timeouts abort the underlying provider request', async () => {
    const timeoutSource = sliceRequired(
        html,
        'async function fetchJsonWithTimeout',
        'function buildLrclibUrl'
    );
    let observedSignal = null;
    const context = {
        AbortController,
        clearTimeout,
        setTimeout,
        fetch: (_url, options = {}) => {
            observedSignal = options.signal;
            return new Promise((_resolve, reject) => {
                const rejectAborted = () => {
                    const error = new Error('aborted');
                    error.name = 'AbortError';
                    reject(error);
                };
                if (options.signal?.aborted) rejectAborted();
                else options.signal?.addEventListener('abort', rejectAborted, { once: true });
            });
        }
    };

    vm.runInNewContext(`
        const LYRICS_FETCH_TIMEOUT_MS = 12000;
        ${timeoutSource}
        globalThis.fetchJsonWithTimeoutUnderTest = fetchJsonWithTimeout;
    `, context);

    await assert.rejects(
        context.fetchJsonWithTimeoutUnderTest('https://lyrics.test/hang', 5),
        (error) => error?.name === 'AbortError'
    );
    assert.equal(observedSignal?.aborted, true);

    const staleController = new AbortController();
    const staleRequest = context.fetchJsonWithTimeoutUnderTest(
        'https://lyrics.test/stale',
        1000,
        { signal: staleController.signal }
    );
    staleController.abort();
    await assert.rejects(staleRequest, (error) => error?.name === 'AbortError');
    assert.equal(observedSignal?.aborted, true);
});

test('Unicode lyric identity matching keeps version qualifiers as durable-cache evidence', () => {
    const trustSource = sliceRequired(
        html,
        'function tokenizeLyricsLookupText',
        'function getLyricsTokenOverlapRatio'
    );
    const context = {
        normalizeLyricsLookupText: (value = '') => String(value || '').trim(),
        sanitizeText: (value = '') => String(value || '').trim()
    };

    vm.runInNewContext(`
        ${trustSource}
        globalThis.tokenizeLyricsLookupTextUnderTest = tokenizeLyricsLookupText;
        globalThis.getLyricsVersionQualifiersUnderTest = getLyricsVersionQualifiers;
        globalThis.getLyricsStrictExpectedIdentityUnderTest = getLyricsStrictExpectedIdentity;
        globalThis.isStrongLyricsIdentityMatchUnderTest = isStrongLyricsIdentityMatch;
    `, context);

    assert.deepEqual(
        Array.from(context.tokenizeLyricsLookupTextUnderTest('مرحبا بالعالم Café 東京')),
        ['مرحبا', 'بالعالم', 'café', '東京']
    );
    const expected = context.getLyricsStrictExpectedIdentityUnderTest(
        'Beyoncé',
        'Halo',
        { artist: 'Beyoncé', lyricsTitle: 'Halo', title: 'Halo (Live)' }
    );
    assert.deepEqual(Array.from(context.getLyricsVersionQualifiersUnderTest(expected.title)), ['live']);
    assert.equal(context.isStrongLyricsIdentityMatchUnderTest(
        { artist: 'Beyoncé', title: 'Halo (Live)' },
        expected,
        { artist: 'Beyoncé', title: 'Halo', reason: 'exact' }
    ), true);
    assert.equal(context.isStrongLyricsIdentityMatchUnderTest(
        { artist: 'Beyoncé', title: 'Halo (Remix)' },
        expected,
        { artist: 'Beyoncé', title: 'Halo', reason: 'exact' }
    ), false);
});

test('strong synced lyric evidence requires a real multi-line timeline and matching duration', () => {
    const parserSource = sliceRequired(
        html,
        'function normalizeSyncedLyricTimeline',
        'function findSyncedLyricIndex'
    );
    const evidenceSource = sliceRequired(
        html,
        'function getLyricsPlaybackDurationHint',
        'function hashLyricsContent'
    );
    const context = {
        els: { audio: { duration: 60 } },
        state: { currentTrackId: 'track-1' },
        isOnlineMusicPlaybackActive: () => false,
        getOnlineMusicCurrentTrack: () => null,
        getOnlineMusicState: () => ({})
    };

    vm.runInNewContext(`
        const LYRICS_CACHE_SCHEMA_VERSION = 2;
        const LYRICS_STRONG_SYNC_SCORE = 118;
        const LYRICS_MIN_STRONG_LINE_COUNT = 8;
        const LYRICS_MIN_STRONG_TIMELINE_SPAN_SECONDS = 24;
        const LYRICS_MAX_RAW_LENGTH = 500000;
        const LYRICS_MAX_SOURCE_LINES = 10000;
        const LYRICS_MAX_PARSED_LINES = 5000;
        ${parserSource}
        ${evidenceSource}
        globalThis.getSyncedLyricsTimelineEvidenceUnderTest = getSyncedLyricsTimelineEvidence;
    `, context);

    const completeLrc = Array.from({ length: 10 }, (_item, index) => {
        const seconds = String(index * 6).padStart(2, '0');
        return `[00:${seconds}.00]Line ${index + 1}`;
    }).join('\n');
    const sparseLrc = '[00:00.00]One\n[00:30.00]Two\n[00:54.00]Three';
    const track = { id: 'track-1', duration: 60, source: 'local' };

    assert.equal(context.getSyncedLyricsTimelineEvidenceUnderTest(
        completeLrc,
        track,
        { duration: 60 }
    ).valid, true);
    assert.equal(context.getSyncedLyricsTimelineEvidenceUnderTest(
        sparseLrc,
        track,
        { duration: 60 }
    ).valid, false);
    assert.equal(context.getSyncedLyricsTimelineEvidenceUnderTest(
        completeLrc,
        { ...track, duration: 120 },
        { duration: 60 }
    ).valid, false);
    assert.equal(context.getSyncedLyricsTimelineEvidenceUnderTest(
        completeLrc,
        track,
        { duration: 0 }
    ).valid, false);
});

test('displayable provider lyrics are separated from durable strong synced lyrics', () => {
    const acceptanceSource = sliceRequired(
        html,
        'function isStrongSyncedLyricsCandidate',
        'function createLyricsCandidate'
    );
    const applySource = sliceRequired(
        html,
        'function applyResolvedLyricsCandidate',
        'function getOfflineLyricsForTrack'
    );

    assert.match(acceptanceSource, /candidate\.format !== 'lrc'/);
    assert.match(acceptanceSource, /candidate\.rankScore \|\| 0\) < LYRICS_STRONG_SYNC_SCORE/);
    assert.match(acceptanceSource, /candidate\.syncEvidence\?\.valid/);
    assert.match(acceptanceSource, /candidate\.strictIdentityMatch/);
    assert.match(applySource, /applyLyricsText\(candidate\.raw/);
    assert.match(applySource, /if \(isStrongSyncedLyricsCandidate\(candidate\)\) \{\s*saveOfflineLyrics/);
});

test('online plain auto cache is deferred until LRCLIB synced refresh fails', () => {
    const fetchSource = sliceRequired(
        html,
        'async function fetchLyrics(artist, title, track = null)',
        'Prepare karaoke-style highlighting'
    );

    assert.match(fetchSource, /shouldRefreshCachedPlainAuto/);
    assert.match(fetchSource, /deferredCachedAuto = \{ \.\.\.cached\.auto, format: cachedAutoFormat \}/);
    assert.match(fetchSource, /Searching LRCLIB for synced lyrics/);
    assert.match(fetchSource, /Cached plain lyrics from/);
});

test('verified strong synced cache is terminal online and its watchdog cannot erase it', async () => {
    const fetchSource = sliceRequired(
        html,
        'async function fetchLyrics(artist, title, track = null)',
        'function prepareLyricsHighlight'
    );
    const container = { innerHTML: '' };
    const source = { className: '', innerText: '', title: '' };
    const counters = {
        applied: 0,
        clearedWatchdogs: 0,
        prompts: 0,
        resets: 0,
        resolverCalls: 0
    };
    let watchdogCallback = null;
    const cachedEntry = {
        raw: '[00:00.00]Line 1\n[00:08.00]Line 2',
        format: 'lrc',
        provider: 'lrclib:search',
        providerLabel: 'LRCLIB Search',
        matchedArtist: 'Artist',
        matchedTitle: 'Song',
        confidence: 'strong',
        strongSync: true
    };
    const context = {
        LYRICS_SOURCE_BADGE_CLASS: 'source-badge',
        LYRICS_WATCHDOG_TIMEOUT_MS: 45000,
        lyricsFetchToken: 0,
        document: {
            getElementById: (id) => id === 'windowedModeLyricsContent' ? container : source
        },
        normalizeLyricsArtistName: (value = '') => String(value),
        sanitizeText: (value = '') => String(value),
        getLyricsActiveTrackId: (track = null) => track?.id || 'track-1',
        isLyricsEditorOpen: () => false,
        cancelActiveLyricsLookup: () => {},
        isPrivateLyricsContext: () => false,
        beginLoadingWatchdog: (_key, _timeout, callback) => { watchdogCallback = callback; },
        clearLoadingWatchdog: () => { counters.clearedWatchdogs++; },
        logAction: () => {},
        logRecovery: () => {},
        showInternalNotice: () => {},
        setLyricsPanelMode: () => {},
        updateLyricsOffsetDisplay: () => {},
        getOfflineLyricsForTrack: () => ({ manual: null, auto: cachedEntry }),
        getCustomLyricsForTrack: () => '',
        syncTrackCustomLyricsCache: (_track, raw) => raw,
        hasVerifiedManualLyricsOverride: () => false,
        detectLyricsFormat: () => 'lrc',
        isStrongCachedSyncedLyricsEntry: () => true,
        isOfflineLyricsEntryTrusted: () => true,
        applyLyricsText: () => { counters.applied++; },
        resetLyricState: () => { counters.resets++; },
        showAddLyricsPrompt: () => { counters.prompts++; },
        beginActiveLyricsLookup: () => null,
        releaseActiveLyricsLookup: () => {},
        resolveLyricsCandidate: async () => { counters.resolverCalls++; return null; },
        applyResolvedLyricsCandidate: () => false,
        toggleLyricsEditButton: () => {},
        navigator: { onLine: true }
    };

    vm.runInNewContext(`
        ${fetchSource}
        globalThis.fetchLyricsUnderTest = fetchLyrics;
    `, context);

    await context.fetchLyricsUnderTest('Artist', 'Song', { id: 'track-1', artist: 'Artist', title: 'Song' });
    assert.equal(counters.applied, 1);
    assert.equal(counters.resolverCalls, 0, 'a verified synced cache hit must not refetch online');
    assert.equal(counters.clearedWatchdogs, 1);
    assert.equal(source.innerText, '');
    assert.match(source.title, /Verified synced lyrics cached from LRCLIB Search/);

    assert.equal(typeof watchdogCallback, 'function');
    watchdogCallback();
    assert.equal(counters.prompts, 0, 'the watchdog must not replace rendered cached lyrics');
    assert.equal(counters.resets, 0, 'the watchdog must not clear synced highlighting state');
});

test('private sessions do not read caches, start watchdogs, or fetch lyric providers', async () => {
    const fetchSource = sliceRequired(
        html,
        'async function fetchLyrics(artist, title, track = null)',
        'function prepareLyricsHighlight'
    );
    const container = { innerHTML: '' };
    const source = { className: '', innerText: '', title: '' };
    const counters = { cacheReads: 0, providerCalls: 0, watchdogs: 0, prompts: 0 };
    const context = {
        LYRICS_SOURCE_BADGE_CLASS: 'source-badge',
        LYRICS_WATCHDOG_TIMEOUT_MS: 45000,
        lyricsFetchToken: 0,
        document: {
            getElementById: (id) => id === 'windowedModeLyricsContent' ? container : source
        },
        normalizeLyricsArtistName: (value = '') => String(value),
        sanitizeText: (value = '') => String(value),
        getLyricsActiveTrackId: (track = null) => track?.id || 'private-track',
        isLyricsEditorOpen: () => false,
        cancelActiveLyricsLookup: () => {},
        isPrivateLyricsContext: () => true,
        setLyricsPanelMode: () => {},
        detectLyricsFormat: () => 'plain',
        applyLyricsText: () => {},
        resetLyricState: () => {},
        showAddLyricsPrompt: () => { counters.prompts++; },
        beginLoadingWatchdog: () => { counters.watchdogs++; },
        getOfflineLyricsForTrack: () => { counters.cacheReads++; return {}; },
        resolveLyricsCandidate: async () => { counters.providerCalls++; return null; }
    };

    vm.runInNewContext(`
        ${fetchSource}
        globalThis.fetchLyricsUnderTest = fetchLyrics;
    `, context);

    await context.fetchLyricsUnderTest('Artist', 'Song', {
        id: 'private-track',
        artist: 'Artist',
        title: 'Song',
        source: 'online-music'
    });
    assert.equal(counters.cacheReads, 0);
    assert.equal(counters.providerCalls, 0);
    assert.equal(counters.watchdogs, 0);
    assert.equal(counters.prompts, 1);
    assert.equal(source.innerText, 'Private');
});

test('lyrics prefetch and playback schedulers are not wired into the stable app', () => {
    assert.doesNotMatch(html, /const LYRICS_PREFETCH_LOOKAHEAD/);
    assert.doesNotMatch(html, /const LYRICS_PREFETCH_CONCURRENCY/);
    assert.doesNotMatch(html, /function enqueueLyricsPrefetch\(track = null, reason = 'queue'\)/);
    assert.doesNotMatch(html, /function scheduleLyricsPrefetchForUpcoming\(activeTrack = null, options = \{\}\)/);
    assert.doesNotMatch(html, /function runLyricsPrefetch\(item = \{\}\)/);
    assert.doesNotMatch(html, /function schedulePlaybackLyricsFetch\(track = null, options = \{\}\)/);
    assert.doesNotMatch(html, /scheduleLyricsPrefetchForUpcoming\(getActivePlaybackTrack\(\), \{ reason: 'queue-commit' \}\)/);
    assert.doesNotMatch(html, /scheduleLyricsPrefetchForUpcoming\(track, \{ reason: 'track-load' \}\)/);
    assert.doesNotMatch(html, /scheduleLyricsPrefetchForUpcoming\(libraryTrack \|\| resolved, \{ reason: 'online-play' \}\)/);
});

test('lyrics speed changes do not replace the stable playback lyrics calls', () => {
    const loadTrackSource = sliceRequired(
        html,
        'function loadTrack',
        'function syncActiveTrackHighlight'
    );
    const onlineSource = sliceRequired(
        html,
        'async function playOnlineMusicTrack',
        'async function toggleOnlineMusicPlayback'
    );

    assert.match(loadTrackSource, /fetchLyrics\(track\.lyricsArtist \|\| track\.artist, track\.lyricsTitle \|\| track\.title, track\);/);
    assert.match(loadTrackSource, /safePlayMedia\(els\.audio, \{[\s\S]*?waitForReady: true,[\s\S]*?timeoutMs: 8000,[\s\S]*?playbackIntent,[\s\S]*?expectedTrackId: track\.id,[\s\S]*?expectedPlaybackSource: 'local',[\s\S]*?expectedMediaSource: nextUrl[\s\S]*?\}\)\.then\(\(ok\) => \{\s*if \(ok\) return;/);
    assert.doesNotMatch(loadTrackSource, /clearPlaybackLyricsForPrivateSession/);
    assert.match(onlineSource, /player\.loadVideoById\(\{ videoId: resolved\.videoId, startSeconds \}\);[\s\S]*setTimeout\(\(\) => \{[\s\S]*fetchLyrics\(resolved\.lyricsArtist \|\| resolved\.artist, resolved\.lyricsTitle \|\| resolved\.title, libraryTrack \|\| resolved\);[\s\S]*\}, 0\);/);
    assert.doesNotMatch(onlineSource, /schedulePlaybackLyricsFetch/);
});

test('durable lyric cache accepts only revalidated strong synced candidates and preserves better entries', () => {
    const saveSource = sliceRequired(
        html,
        'function saveOfflineLyrics',
        'function syncTrackCustomLyricsCache'
    );

    assert.match(saveSource, /resolvedFormat === 'lrc'/);
    assert.match(saveSource, /startsWith\('lrclib'\)/);
    assert.match(saveSource, /Number\(metadata\?\.rankScore \|\| 0\) >= LYRICS_STRONG_SYNC_SCORE/);
    assert.match(saveSource, /strictIdentityMatch/);
    assert.match(saveSource, /syncedEvidence\?\.valid === true/);
    assert.match(saveSource, /existingIsStrong && Number\(existing\.rankScore \|\| 0\) > entry\.rankScore/);
    assert.match(saveSource, /existingIsStrong && existing\.contentHash === entry\.contentHash/);
    assert.match(saveSource, /providerRecordId/);
    assert.match(saveSource, /matchedArtist/);
    assert.match(saveSource, /matchedTitle/);
    assert.match(saveSource, /queryReason/);
});

test('plain, weak, mismatched, and private-session lyrics cannot overwrite durable synced cache', () => {
    const saveSource = sliceRequired(
        html,
        'function saveOfflineLyrics',
        'function syncTrackCustomLyricsCache'
    );
    const cacheState = { offlineLyricsCache: {} };
    let identityValid = true;
    let timelineValid = true;
    let persistenceCount = 0;
    const context = {
        LYRICS_CACHE_SCHEMA_VERSION: 2,
        LYRICS_STRONG_SYNC_SCORE: 118,
        state: cacheState,
        isPrivateLyricsContext: (track = null) => !!track?.private,
        removeOfflineLyrics: () => {},
        detectLyricsFormat: () => 'plain',
        hashLyricsContent: (raw = '') => `hash:${String(raw)}`,
        getSyncedLyricsTimelineEvidence: () => ({
            valid: timelineValid,
            lineCount: 10,
            uniqueTimeCount: 10,
            firstTime: 0,
            lastTime: 54,
            span: 54
        }),
        getLyricsStrictExpectedIdentity: () => ({ artist: 'artist', title: 'song live' }),
        isStrongLyricsIdentityMatch: () => identityValid,
        getLyricsCacheKeys: () => ['at:artist|song-live'],
        normalizeLyricsLookupText: (value = '') => String(value).toLowerCase(),
        normalizeLyricsTrustText: (value = '') => String(value).toLowerCase(),
        sanitizeText: (value = '') => String(value),
        isStrongCachedSyncedLyricsEntry: (entry = null) => !!entry?.strongSync && Number(entry?.rankScore || 0) >= 118,
        persistOfflineLyricsCache: () => { persistenceCount++; return true; }
    };

    vm.runInNewContext(`
        ${saveSource}
        globalThis.saveOfflineLyricsUnderTest = saveOfflineLyrics;
    `, context);
    const save = context.saveOfflineLyricsUnderTest;
    const track = { id: 'track-1', artist: 'Artist', title: 'Song (Live)', duration: 60 };
    const metadata = (raw, rankScore) => ({
        providerLabel: 'LRCLIB Search',
        providerRecordId: 42,
        matchedArtist: 'Artist',
        matchedTitle: 'Song (Live)',
        matchedAlbum: 'Album',
        matchedDuration: 60,
        queryArtist: 'Artist',
        queryTitle: 'Song Live',
        queryReason: 'exact',
        score: rankScore - 20,
        rankScore,
        strongSync: true,
        contentHash: `hash:${raw}`
    });

    const firstRaw = '[00:00.00]First strong timeline';
    assert.equal(save(track, 'Artist', 'Song (Live)', 'auto', firstRaw, 'plain', 'lrclib:search', metadata(firstRaw, 160)), false);
    assert.equal(save(track, 'Artist', 'Song (Live)', 'auto', firstRaw, 'lrc', 'lyrics.ovh', metadata(firstRaw, 160)), false);
    identityValid = false;
    assert.equal(save(track, 'Artist', 'Song (Live)', 'auto', firstRaw, 'lrc', 'lrclib:search', metadata(firstRaw, 160)), false);
    identityValid = true;
    timelineValid = false;
    assert.equal(save(track, 'Artist', 'Song (Live)', 'auto', firstRaw, 'lrc', 'lrclib:search', metadata(firstRaw, 160)), false);
    timelineValid = true;
    assert.equal(save(track, 'Artist', 'Song (Live)', 'auto', firstRaw, 'lrc', 'lrclib:search', metadata(firstRaw, 160)), true);

    const bucket = cacheState.offlineLyricsCache['at:artist|song-live'];
    assert.equal(bucket.auto.raw, firstRaw);
    assert.equal(bucket.auto.providerRecordId, 42);
    assert.equal(bucket.auto.matchedArtist, 'Artist');
    assert.equal(bucket.auto.matchedTitle, 'Song (Live)');
    assert.equal(bucket.auto.confidence, 'strong');

    const weakerRaw = '[00:00.00]Different lower-ranked timeline';
    assert.equal(save(track, 'Artist', 'Song (Live)', 'auto', weakerRaw, 'lrc', 'lrclib:search', metadata(weakerRaw, 120)), true);
    assert.equal(bucket.auto.raw, firstRaw, 'lower-ranked synced lyrics must not replace the stronger cache entry');

    assert.equal(save(track, 'Artist', 'Song (Live)', 'manual', 'My manual words', 'plain', 'manual'), true);
    assert.equal(bucket.auto.raw, firstRaw);
    assert.equal(bucket.manual.raw, 'My manual words');
    assert.equal(bucket.manual.confidence, 'manual');

    const privateRaw = '[00:00.00]Private timeline';
    assert.equal(save({ ...track, private: true }, 'Artist', 'Song (Live)', 'auto', privateRaw, 'lrc', 'lrclib:get', metadata(privateRaw, 200)), false);
    assert.equal(bucket.auto.raw, firstRaw);
    assert.equal(persistenceCount, 2, 'only the strong auto entry and manual entry should persist');
});

test('track customLyrics only wins when it is a verified manual override', () => {
    const fetchSource = sliceRequired(
        html,
        'async function fetchLyrics(artist, title, track = null)',
        'Prepare karaoke-style highlighting'
    );

    assert.match(fetchSource, /hasVerifiedManualLyricsOverride\(track, effectiveArtist, effectiveTitle, track\.customLyrics\)/);
    assert.doesNotMatch(fetchSource, /if \(track\.customLyrics\) \{\s*applyLyricsText\(track\.customLyrics, 'Manual'/);
});

test('optional enrichment worker does not persist fetched lyrics as manual custom lyrics', () => {
    assert.doesNotMatch(bootstrap, /track\.customLyrics\s*=\s*workerLyrics\.raw/);
    assert.match(bootstrap, /const result = await originalFetchLyrics\(\.\.\.args\);/);
    assert.match(bootstrap, /workerLyrics\.kind === 'synced'/);
    assert.match(bootstrap, /track\.assignedLyricsRaw\s*=\s*workerLyrics\.raw/);
    assert.match(bootstrap, /track\.assignedLyricsSource\s*=\s*'Synced'/);
    assert.doesNotMatch(bootstrap, /track\.assignedLyricsSource\s*=\s*workerLyrics\.kind === 'synced' \? 'Synced' : 'Auto'/);
});

test('enrichment worker searches LRCLIB for synced lyrics before plain get fallback', () => {
    const lookupSource = sliceRequired(
        enrichmentWorker,
        'async function lookupLyrics',
        '\n    return null;\n}'
    );

    assert.doesNotMatch(enrichmentWorker, /const WORKER_LRCLIB_SEARCH_TIMEOUT_MS/);
    assert.doesNotMatch(enrichmentWorker, /async function lookupSyncedLyricsFromSearch/);
    assert.match(lookupSource, /api\/search/);
    assert.match(lookupSource, /syncedItem = items\.find/);
    assert.doesNotMatch(lookupSource, /Promise\.race\(Array\.from\(pending\.values\(\)\)\)/);
    assert.match(lookupSource, /api\/get/);
    assert.ok(
        lookupSource.indexOf('api/search') < lookupSource.indexOf('api/get'),
        'worker should search LRCLIB alternatives before exact get'
    );
});
