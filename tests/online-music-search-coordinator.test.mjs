// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const onlineMusicSource = fs.readFileSync(new URL('../js/legacy/online-music.js', import.meta.url), 'utf8');
const providerSource = fs.readFileSync(new URL('../js/legacy/online-playlists.js', import.meta.url), 'utf8');
const appInitSource = fs.readFileSync(new URL('../js/legacy/app-init.js', import.meta.url), 'utf8');
const electronMainSource = fs.readFileSync(new URL('../electron-main.cjs', import.meta.url), 'utf8');
const animationCss = fs.readFileSync(new URL('../css/animations.css', import.meta.url), 'utf8');
const coordinatorStart = onlineMusicSource.indexOf('const DESKTOP_ONLINE_MUSIC_SEARCH_CACHE_TTL_MS');
const coordinatorEnd = onlineMusicSource.indexOf('async function handleOnlineMusicContentClick', coordinatorStart);
assert.notEqual(coordinatorStart, -1);
assert.notEqual(coordinatorEnd, -1);
const coordinatorSource = onlineMusicSource.slice(coordinatorStart, coordinatorEnd);

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function flushTasks() {
    return new Promise((resolve) => setImmediate(resolve));
}

function trackIds(tracks = []) {
    return Array.from(tracks, (track) => track.id);
}

function createSearchHarness(options = {}) {
    const state = {
        activeTab: 'online-music',
        searchQuery: '',
        searchResults: [],
        searchStatus: '',
        browserView: 'search',
        browserArtist: null,
        browserArtistStatus: 'idle',
        browserArtistError: '',
        artistWorkSearchQuery: '',
        browserRelease: null,
        browserReleaseStatus: 'idle',
        browserReleaseError: ''
    };
    const requests = [];
    const renders = [];
    const feedback = [];
    const prewarmedVideoIds = [];
    const mergeCalls = [];
    let inputValue = '';
    let persistCount = 0;
    let youtubeDiscoveryEnabled = !!options.youtubeDiscovery;
    let timerSequence = 0;
    const manualTimers = new Map();

    const requestProvider = (provider, query, requestOptions = {}) => {
        const deferred = createDeferred();
        requests.push({
            provider,
            query,
            signal: requestOptions?.signal || null,
            ...deferred
        });
        return deferred.promise;
    };
    const sanitizeText = (value = '') => String(value ?? '').trim();
    const harnessSetTimeout = options.manualTimers
        ? (callback) => {
            const timerId = ++timerSequence;
            manualTimers.set(timerId, callback);
            return timerId;
        }
        : options.immediateTimeout
        ? (callback) => {
            queueMicrotask(callback);
            return 1;
        }
        : setTimeout;
    const harnessClearTimeout = options.manualTimers
        ? (timerId) => manualTimers.delete(timerId)
        : (options.immediateTimeout ? () => {} : clearTimeout);
    const context = {
        AbortController,
        console,
        setTimeout: harnessSetTimeout,
        clearTimeout: harnessClearTimeout,
        ONLINE_MUSIC_SEARCH_LIMIT: 12,
        DESKTOP_ONLINE_MUSIC_SEARCH_TIMEOUT_MS: 9000,
        sanitizeText,
        state,
        sanitizeOnlineProviderErrorMessage: (message = '') => sanitizeText(message),
        getOnlineMusicState: () => state,
        getSavedOnlineLibraryTracks: () => Array.isArray(options.savedTracks) ? options.savedTracks : [],
        canUseDesktopYouTubeMusicSearch: () => options.desktopRuntime !== false,
        shouldUseOnlineMusicYouTubeDiscovery: () => youtubeDiscoveryEnabled,
        isOnlineMusicYouTubeDiscoveryBlocked: () => !youtubeDiscoveryEnabled && !!options.discoveryBlocked,
        getAppSettings: () => ({ onlineMusic: { preferYoutubeDiscovery: options.preferYoutubeDiscovery !== false } }),
        syncConfiguredOnlineMusicApiKey: () => '',
        fetchDesktopYouTubeMusicSearchTracks: (query, requestOptions) => requestProvider('youtube-music', query, requestOptions),
        fetchItunesSearchTracks: (query, requestOptions) => requestProvider('itunes', query, requestOptions),
        fetchDeezerSearchTracks: (query, requestOptions) => requestProvider('deezer', query, requestOptions),
        fetchYouTubeOnlineMusicSearchTracks: (query, requestOptions) => requestProvider('youtube-discovery', query, requestOptions),
        fetchOnlineMusicSearchSuggestions: async (query) => options.suggestions?.[query] || [],
        getOnlineMusicPredictiveSearchQuery: (query, suggestions = []) => suggestions[0] || query,
        mergeOnlineMusicSearchResults: (tracks = [], mergeOptions = {}) => {
            mergeCalls.push({ ...mergeOptions });
            const seen = new Set();
            return tracks.filter((track) => {
                const id = sanitizeText(track?.id || '');
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            }).map((track) => ({ ...track }));
        },
        updateOnlineMusicFeedback: (message, type) => feedback.push({ message, type }),
        renderOnlineMusicContent: () => renders.push({
            query: state.searchQuery,
            ids: trackIds(state.searchResults)
        }),
        persistOnlineMusicState: () => {
            persistCount += 1;
        },
        ensureOnlineMusicPlayer: (videoId) => {
            prewarmedVideoIds.push(videoId);
            return Promise.resolve();
        },
        document: {
            getElementById: (id) => (id === 'online-music-search-input' ? { value: inputValue } : null)
        }
    };
    context.window = context;
    vm.runInNewContext(`${coordinatorSource}\n;globalThis.__searchTestApi = {
        searchOnlineMusic,
        handleOnlineMusicLiveSearchInput,
        previewOnlineMusicLiveSearch,
        setOnlineMusicLiveSearchCompositionActive,
        readDesktopOnlineMusicSearchCache,
        writeDesktopOnlineMusicSearchCache,
        getDesktopOnlineMusicSearchCacheKey,
        get cacheSize() { return desktopOnlineMusicSearchCache.size; },
        get requestSequence() { return desktopOnlineMusicSearchRequestSequence; },
        get hasLiveTimer() { return !!desktopOnlineMusicLiveSearchTimer; }
    };`, context);

    return {
        api: context.__searchTestApi,
        state,
        requests,
        renders,
        feedback,
        prewarmedVideoIds,
        mergeCalls,
        get persistCount() {
            return persistCount;
        },
        setQuery(value) {
            inputValue = value;
        },
        setYoutubeDiscoveryEnabled(value) {
            youtubeDiscoveryEnabled = !!value;
        },
        get pendingTimerCount() {
            return manualTimers.size;
        },
        runNextTimer() {
            const next = manualTimers.entries().next().value;
            if (!next) return false;
            const [timerId, callback] = next;
            manualTimers.delete(timerId);
            callback();
            return true;
        }
    };
}

function searchTrack(id, provider = 'youtube') {
    return {
        id,
        videoId: provider === 'youtube' ? id : '',
        title: `Track ${id}`,
        artist: 'Test Artist',
        provider,
        transportProvider: provider === 'youtube' ? 'youtube' : '',
        transportProviderLabel: provider === 'youtube' ? 'YouTube' : ''
    };
}

test('desktop search request ids reject stale A to B to A completions', async () => {
    const harness = createSearchHarness();
    harness.setQuery('Alpha');
    const firstAlpha = harness.api.searchOnlineMusic();
    await flushTasks();

    harness.setQuery('Beta');
    const beta = harness.api.searchOnlineMusic();
    await flushTasks();

    harness.setQuery('Alpha');
    const secondAlpha = harness.api.searchOnlineMusic();
    await flushTasks();

    const alphaDesktopRequests = harness.requests.filter((request) => request.provider === 'youtube-music' && request.query === 'Alpha');
    assert.equal(alphaDesktopRequests.length, 2);
    assert.equal(alphaDesktopRequests[0].signal.aborted, true);
    assert.equal(
        harness.requests.filter((request) => request.query === 'Beta').every((request) => request.signal.aborted),
        true
    );
    for (const request of harness.requests) {
        if (request.provider !== 'youtube-music') {
            request.resolve([]);
        } else if (request.query === 'Beta') {
            request.resolve([searchTrack('stale-beta')]);
        } else if (request === alphaDesktopRequests[0]) {
            request.resolve([searchTrack('stale-alpha')]);
        } else {
            request.resolve([searchTrack('current-alpha')]);
        }
    }

    await Promise.all([firstAlpha, beta, secondAlpha]);
    assert.equal(harness.api.requestSequence, 3);
    assert.equal(harness.state.searchQuery, 'Alpha');
    assert.deepEqual(trackIds(harness.state.searchResults), ['current-alpha']);
    assert.equal(harness.renders.some((render) => render.ids.includes('stale-alpha')), false);
    assert.equal(harness.renders.some((render) => render.ids.includes('stale-beta')), false);
});

test('identical in-flight desktop searches coalesce and identical refreshes do not rerender rows', async () => {
    const harness = createSearchHarness();
    harness.setQuery('Same Song');
    const first = harness.api.searchOnlineMusic();
    const coalesced = harness.api.searchOnlineMusic();
    await flushTasks();

    assert.equal(harness.requests.length, 3);
    harness.requests.forEach((request) => {
        request.resolve(request.provider === 'youtube-music' ? [searchTrack('same-track')] : []);
    });
    await Promise.all([first, coalesced]);
    assert.equal(harness.api.requestSequence, 1);
    assert.deepEqual(trackIds(harness.state.searchResults), ['same-track']);
    assert.equal(harness.prewarmedVideoIds.length, 1);
    assert.equal(harness.mergeCalls.every((call) => call.preferPlayableTransport === true), true);

    const renderCountBeforeRefresh = harness.renders.length;
    const requestCountBeforeRefresh = harness.requests.length;
    const refresh = harness.api.searchOnlineMusic();
    assert.deepEqual(trackIds(harness.state.searchResults), ['same-track']);
    await flushTasks();
    const refreshRequests = harness.requests.slice(requestCountBeforeRefresh);
    assert.equal(refreshRequests.length, 3);
    refreshRequests.forEach((request) => {
        request.resolve(request.provider === 'youtube-music' ? [searchTrack('same-track')] : []);
    });
    await refresh;
    assert.equal(harness.renders.length, renderCountBeforeRefresh);
    assert.equal(harness.persistCount, 2);
    assert.equal(harness.prewarmedVideoIds.length, 2);
});

test('local web entrypoint replays a fresh cache despite transient discovery blocking', async () => {
    const harness = createSearchHarness({
        desktopRuntime: false,
        youtubeDiscovery: true,
        discoveryBlocked: true
    });
    harness.setQuery('Daft Punk');
    const firstSearch = harness.api.searchOnlineMusic();
    await flushTasks();
    assert.deepEqual(harness.requests.map((request) => request.provider), [
        'itunes',
        'deezer',
        'youtube-discovery'
    ]);
    const catalogTracks = Array.from({ length: 34 }, (_, index) => searchTrack(`daft-${index}`, 'itunes'));
    harness.requests.forEach((request) => {
        request.resolve(request.provider === 'itunes' ? catalogTracks : []);
    });
    await firstSearch;
    assert.equal(harness.state.searchResults.length, 34);
    assert.equal(harness.prewarmedVideoIds.length, 0);
    assert.equal(
        harness.mergeCalls.every((call) => call.preferPlayableTransport === undefined),
        true
    );

    const requestCount = harness.requests.length;
    harness.state.searchResults = [];
    harness.setYoutubeDiscoveryEnabled(false);
    const repeatedSearch = harness.api.searchOnlineMusic();
    assert.equal(harness.state.searchResults.length, 34);
    assert.match(harness.state.searchStatus, /cached streaming results/);
    assert.doesNotMatch(harness.state.searchStatus, /Searching online providers/);
    assert.equal(harness.requests.length, requestCount);
    await repeatedSearch;
    assert.equal(harness.requests.length, requestCount);
    assert.equal(harness.prewarmedVideoIds.length, 0);
    assert.equal(
        harness.api.getDesktopOnlineMusicSearchCacheKey('Daft Punk', true),
        harness.api.getDesktopOnlineMusicSearchCacheKey('Daft Punk', false)
    );
});

test('incremental desktop results retain declared provider order when providers settle out of order', async () => {
    const harness = createSearchHarness();
    harness.setQuery('Provider Order');
    const search = harness.api.searchOnlineMusic();
    await flushTasks();
    const byProvider = Object.fromEntries(harness.requests.map((request) => [request.provider, request]));

    byProvider.deezer.resolve([searchTrack('deezer-track', 'deezer')]);
    await flushTasks();
    assert.deepEqual(trackIds(harness.state.searchResults), ['deezer-track']);

    byProvider['youtube-music'].resolve([searchTrack('youtube-track')]);
    await flushTasks();
    assert.deepEqual(trackIds(harness.state.searchResults), ['youtube-track', 'deezer-track']);

    byProvider.itunes.resolve([searchTrack('itunes-track', 'itunes')]);
    await search;
    assert.deepEqual(trackIds(harness.state.searchResults), [
        'youtube-track',
        'itunes-track',
        'deezer-track'
    ]);
});

test('YouTube-only rows wait for catalog evidence before the first incremental render', async () => {
    const harness = createSearchHarness();
    harness.setQuery('Dirty D');
    const search = harness.api.searchOnlineMusic();
    await flushTasks();
    const byProvider = Object.fromEntries(harness.requests.map((request) => [request.provider, request]));

    byProvider['youtube-music'].resolve([searchTrack('youtube-artist-collision')]);
    await flushTasks();
    assert.deepEqual(trackIds(harness.state.searchResults), []);
    assert.equal(harness.renders.some((render) => render.ids.includes('youtube-artist-collision')), false);

    byProvider.itunes.resolve([searchTrack('canonical-catalog', 'itunes')]);
    await flushTasks();
    assert.deepEqual(trackIds(harness.state.searchResults), [
        'youtube-artist-collision',
        'canonical-catalog'
    ]);

    byProvider.deezer.resolve([]);
    await search;
});

test('live partial queries wait for preferred catalog evidence before publishing a weaker provider', async () => {
    const harness = createSearchHarness();
    harness.setQuery('Dirty D');
    const search = harness.api.searchOnlineMusic({ live: true, allowPlayerPrewarm: false });
    await flushTasks();
    const byProvider = Object.fromEntries(harness.requests.map((request) => [request.provider, request]));

    byProvider.deezer.resolve([searchTrack('literal-dirty-d-artist', 'deezer')]);
    await flushTasks();
    assert.deepEqual(trackIds(harness.state.searchResults), []);

    byProvider.itunes.resolve([searchTrack('dirty-diana', 'itunes')]);
    await flushTasks();
    assert.deepEqual(trackIds(harness.state.searchResults), [
        'dirty-diana',
        'literal-dirty-d-artist'
    ]);

    byProvider['youtube-music'].resolve([]);
    await search;
});

test('live typing uses the leading autocomplete prediction while explicit search keeps the typed query', async () => {
    const liveHarness = createSearchHarness({ suggestions: { 'Dirty D': ['Dirty Diana'] } });
    liveHarness.setQuery('Dirty D');
    const liveSearch = liveHarness.api.searchOnlineMusic({ live: true, allowPlayerPrewarm: false });
    await flushTasks();
    assert.deepEqual(liveHarness.requests.map((request) => request.query), [
        'Dirty Diana',
        'Dirty Diana',
        'Dirty Diana'
    ]);
    liveHarness.requests.forEach((request) => request.resolve([]));
    await liveSearch;

    const explicitHarness = createSearchHarness({ suggestions: { 'Dirty D': ['Dirty Diana'] } });
    explicitHarness.setQuery('Dirty D');
    const explicitSearch = explicitHarness.api.searchOnlineMusic();
    await flushTasks();
    assert.deepEqual(explicitHarness.requests.map((request) => request.query), [
        'Dirty D',
        'Dirty D',
        'Dirty D'
    ]);
    explicitHarness.requests.forEach((request) => request.resolve([]));
    await explicitSearch;
});

test('desktop provider deadlines settle a hung search without an unbounded final wait', async () => {
    const harness = createSearchHarness({ immediateTimeout: true });
    harness.setQuery('Never Settles');
    await harness.api.searchOnlineMusic();
    assert.equal(harness.requests.length, 3);
    assert.equal(harness.requests.every((request) => request.signal.aborted), true);
    assert.deepEqual(trackIds(harness.state.searchResults), []);
    assert.match(harness.state.searchStatus, /Some online sources were unavailable/);
    assert.equal(harness.persistCount, 1);
});

test('desktop search cache is clone-safe, TTL bounded, and LRU bounded', () => {
    const harness = createSearchHarness();
    for (let index = 0; index < 25; index += 1) {
        assert.equal(harness.api.writeDesktopOnlineMusicSearchCache(
            `key-${index}`,
            [searchTrack(`track-${index}`)],
            1000 + index
        ), true);
    }
    assert.equal(harness.api.cacheSize, 24);
    assert.equal(harness.api.readDesktopOnlineMusicSearchCache('key-0', 1025), null);

    const cached = harness.api.readDesktopOnlineMusicSearchCache('key-1', 1001);
    assert.equal(cached[0].title, 'Track track-1');
    cached[0].title = 'Mutated outside cache';
    assert.equal(harness.api.readDesktopOnlineMusicSearchCache('key-1', 1001)[0].title, 'Track track-1');
    assert.equal(
        harness.api.readDesktopOnlineMusicSearchCache('key-1', 1001 + (5 * 60 * 1000) + 1),
        null
    );
});

test('live typing previews cached predictions immediately and debounces provider work', async () => {
    const harness = createSearchHarness({ manualTimers: true });
    const cachedTrack = searchTrack('dirty-diana');
    cachedTrack.title = 'Dirty Diana';
    cachedTrack.artist = 'Michael Jackson';
    harness.api.writeDesktopOnlineMusicSearchCache(
        harness.api.getDesktopOnlineMusicSearchCacheKey('Dirty Diana'),
        [cachedTrack]
    );

    assert.deepEqual(trackIds(harness.api.handleOnlineMusicLiveSearchInput('D')), []);
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.api.hasLiveTimer, false);
    assert.match(harness.state.searchStatus, /starts after 2 characters/);

    assert.deepEqual(trackIds(harness.api.handleOnlineMusicLiveSearchInput('Dirty D')), ['dirty-diana']);
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.pendingTimerCount, 1);
    assert.match(harness.state.searchStatus, /likely match/);

    harness.api.handleOnlineMusicLiveSearchInput('Dirty Di');
    assert.equal(harness.pendingTimerCount, 1, 'a newer keystroke replaces the older debounce');
    assert.equal(harness.runNextTimer(), true);
    await flushTasks();
    assert.deepEqual(harness.requests.map((request) => [request.provider, request.query]), [
        ['youtube-music', 'Dirty Di'],
        ['itunes', 'Dirty Di'],
        ['deezer', 'Dirty Di']
    ]);
    harness.requests.forEach((request) => request.resolve(
        request.provider === 'youtube-music' ? [cachedTrack] : []
    ));
    await flushTasks();
    await flushTasks();
    assert.equal(harness.state.searchQuery, 'Dirty Di');
    assert.deepEqual(trackIds(harness.state.searchResults), ['dirty-diana']);
});

test('typing a new live query aborts the active UI session before the debounce fires', async () => {
    const harness = createSearchHarness({ manualTimers: true });
    harness.setQuery('Alpha');
    const alphaSearch = harness.api.searchOnlineMusic();
    await flushTasks();
    assert.equal(harness.requests.length, 3);

    harness.api.handleOnlineMusicLiveSearchInput('Beta');
    await alphaSearch;
    assert.equal(harness.requests.every((request) => request.signal.aborted), true);
    assert.equal(harness.requests.length, 3, 'no Beta provider starts until its debounce runs');
    assert.equal(harness.pendingTimerCount, 1);
    assert.equal(harness.state.searchQuery, 'Beta');
});

test('IME composition never starts a partial online search', () => {
    const harness = createSearchHarness({ manualTimers: true });
    harness.api.setOnlineMusicLiveSearchCompositionActive(true);
    harness.api.handleOnlineMusicLiveSearchInput('mich', { isComposing: true });
    assert.equal(harness.pendingTimerCount, 0);
    assert.equal(harness.state.searchQuery, '');

    harness.api.setOnlineMusicLiveSearchCompositionActive(false);
    harness.api.handleOnlineMusicLiveSearchInput('michael', { compositionEnded: true });
    assert.equal(harness.pendingTimerCount, 1);
    assert.equal(harness.state.searchQuery, 'michael');
});

test('search providers accept cancellation and YouTube discovery has a bounded fetch path', () => {
    const jsonpStart = providerSource.indexOf('function fetchJsonpPayload');
    const searchProviderEnd = providerSource.indexOf('function sanitizeOnlineMusicChannel', jsonpStart);
    assert.notEqual(jsonpStart, -1);
    assert.notEqual(searchProviderEnd, -1);
    const body = providerSource.slice(jsonpStart, searchProviderEnd);
    assert.match(body, /signal: null/);
    assert.match(body, /opts\.signal\.addEventListener\('abort'/);
    assert.match(body, /async function fetchItunesSearchTracks\(query = '', options = \{\}\)/);
    assert.match(body, /async function fetchDeezerSearchTracks\(query = '', options = \{\}\)/);
    assert.match(body, /async function fetchOnlineMusicSearchSuggestions\(query = '', options = \{\}\)/);
    assert.match(body, /async function fetchYouTubeOnlineMusicSearchTracks\(query = '', options = \{\}\)/);
    assert.match(body, /async function fetchOnlineMusicYouTube\(resource, query = \{\}, options = \{\}\)/);
    assert.match(body, /signal: controller\.signal/);
    assert.match(body, /YouTube search timed out\./);
    assert.match(onlineMusicSource, /loading="lazy" decoding="async"/);
    assert.match(electronMainSource, /suggestqueries\.google\.com/);
});

test('online search input is wired for live typing, IME safety, and explicit submit', () => {
    const inputStart = appInitSource.indexOf("if (onlineMusicSearchInput) {");
    const inputEnd = appInitSource.indexOf("if (onlineMusicPlaylistImportBtn)", inputStart);
    assert.ok(inputStart >= 0 && inputEnd > inputStart);
    const inputWiring = appInitSource.slice(inputStart, inputEnd);
    assert.match(inputWiring, /addEventListener\('input'/);
    assert.match(inputWiring, /handleOnlineMusicLiveSearchInput/);
    assert.match(inputWiring, /addEventListener\('compositionstart'/);
    assert.match(inputWiring, /addEventListener\('compositionend'/);
    assert.match(inputWiring, /if \(e\.isComposing\) return/);
    assert.match(inputWiring, /searchOnlineMusic\(\{ source: 'enter' \}\)/);
    assert.match(onlineMusicSource, /DESKTOP_ONLINE_MUSIC_LIVE_SEARCH_DEBOUNCE_MS = 260/);
    assert.match(onlineMusicSource, /DESKTOP_ONLINE_MUSIC_LIVE_SEARCH_MIN_CHARACTERS = 2/);
});

test('a newer desktop YouTube Music query cancels the previous sender process', () => {
    const searchStart = electronMainSource.indexOf('async function searchYouTubeMusic(');
    const resolverStart = electronMainSource.indexOf('async function runOnlinePlaybackResolverSearch', searchStart);
    assert.ok(searchStart >= 0 && resolverStart > searchStart);
    const searchBody = electronMainSource.slice(searchStart, resolverStart);
    assert.match(searchBody, /signal: options\.signal \|\| null/);
    assert.match(searchBody, /activeOnlineMusicSearchBySender\.get\(senderKey\)/);
    assert.match(searchBody, /previousController\.abort\(\)/);
    assert.match(searchBody, /activeOnlineMusicSearchBySender\.delete\(senderKey\)/);
    assert.match(electronMainSource, /return searchYouTubeMusicForSender\(event, payload\)/);
});

test('live-result entrance motion is one-shot, High End-only, and reduced-motion safe', () => {
    assert.match(onlineMusicSource, /consumeDesktopOnlineMusicSearchResultEntrance\(\)/);
    assert.match(onlineMusicSource, /online-music-live-search-results-enter/);
    const highEndGate = String.raw`body\.performance-preset-high-end:not\(\.reduce-motion\):not\(\.creative-throttle-degraded\):not\(\.creative-throttle-low\)`;
    assert.match(animationCss, new RegExp(`${highEndGate}[^\\{]*\\.online-music-live-search-results-enter`));
    const motionStart = animationCss.indexOf('.online-music-live-search-results-enter');
    const reducedMotionStart = animationCss.indexOf('@media (prefers-reduced-motion: reduce)', motionStart);
    assert.ok(motionStart >= 0 && reducedMotionStart > motionStart);
    const motionBody = animationCss.slice(motionStart, reducedMotionStart);
    assert.doesNotMatch(motionBody, /performance-preset-low-end/);
    assert.doesNotMatch(motionBody, /filter:|backdrop-filter:|box-shadow:/);
    assert.match(motionBody, /transform:/);
    assert.match(motionBody, /opacity:/);
    assert.match(animationCss.slice(reducedMotionStart), /online-music-live-search-results-enter/);
});
