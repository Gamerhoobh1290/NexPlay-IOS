// @ts-nocheck -- Legacy browser cache helpers run in an isolated VM context.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtimeConfigSource = fs.readFileSync(new URL('../js/legacy/runtime-config.js', import.meta.url), 'utf8');
const playlistSource = fs.readFileSync(new URL('../js/legacy/online-playlists.js', import.meta.url), 'utf8');
const onlineMusicSource = fs.readFileSync(new URL('../js/legacy/online-music.js', import.meta.url), 'utf8');
const privateSessionSource = fs.readFileSync(new URL('../js/legacy/helpers.js', import.meta.url), 'utf8');
const appInitSource = fs.readFileSync(new URL('../js/legacy/app-init.js', import.meta.url), 'utf8');

const CACHE_CONSTANTS = Object.freeze({
    key: 'nexplay_online_release_tracks_cache_v1',
    schemaVersion: 1,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    entryLimit: 48,
    trackLimit: 200,
    byteLimit: 1_500_000
});

function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing source marker: ${startMarker}`);
    assert.ok(end > start, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
}

function cloneAcrossRealm(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeTrack(index = 0, overrides = {}) {
    return {
        id: `itunes_track_${index}`,
        title: `Track ${index}`,
        artist: 'Cache Artist',
        provider: 'itunes',
        providerTrackId: `track-${index}`,
        providerReleaseId: 'release-1',
        releaseTitle: 'Cache Album',
        cover: 'https://example.com/track-cover.jpg',
        canonicalUrl: `https://example.com/tracks/${index}`,
        duration: 180 + index,
        tags: ['pop'],
        ...overrides
    };
}

function makeEntry(playlistId = 'itunes:release-1', now = 2_000_000_000_000, overrides = {}) {
    const tracks = overrides.tracks || [makeTrack(1)];
    return {
        release: {
            playlistId,
            provider: 'itunes',
            providerReleaseId: playlistId.replace(/^itunes:/, ''),
            title: 'Cache Album',
            artist: 'Cache Artist',
            cover: 'https://example.com/release-cover.jpg',
            trackCount: tracks.length,
            ...overrides.release
        },
        tracks,
        rawItems: [{ secretProviderPayload: true }],
        promise: Promise.resolve('must never persist'),
        declaredTrackCount: tracks.length,
        missingTrackCount: 0,
        updatedAt: now,
        lastAccessedAt: now,
        ...overrides
    };
}

function createCacheHarness(options = {}) {
    const online = { releaseTracksCache: {} };
    const storage = new Map();
    const writes = [];
    const removals = [];
    let privateSession = !!options.privateSession;

    const context = {
        console,
        Map,
        Set,
        URL,
        TextEncoder,
        Date,
        Math,
        JSON,
        Object,
        Array,
        Number,
        String,
        Boolean,
        RegExp,
        Promise,
        AbortController,
        setTimeout,
        clearTimeout,
        state: { onlineMusic: online },
        DIRECT_VIDEO_URL_EXTENSIONS: new Set(),
        ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY: CACHE_CONSTANTS.key,
        ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION: CACHE_CONSTANTS.schemaVersion,
        ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TTL_MS: CACHE_CONSTANTS.ttlMs,
        ONLINE_MUSIC_RELEASE_TRACKS_CACHE_ENTRY_LIMIT: CACHE_CONSTANTS.entryLimit,
        ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TRACK_LIMIT: CACHE_CONSTANTS.trackLimit,
        ONLINE_MUSIC_RELEASE_TRACKS_CACHE_BYTE_LIMIT: CACHE_CONSTANTS.byteLimit,
        sanitizeText(value = '') {
            return String(value ?? '').replace(/[<>]/g, '').trim();
        },
        normalizeLyricsArtistName(value = '') {
            return String(value ?? '').trim();
        },
        normalizeLyricsLookupText(value = '') {
            return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        },
        formatTime(seconds = 0) {
            return String(Math.max(0, Number(seconds) || 0));
        },
        safeCall(callback, fallback = null) {
            try { return callback(); } catch (_) { return fallback; }
        },
        generateId() {
            return 'generated-cache-id';
        },
        getOnlineMusicState() {
            return online;
        },
        shouldBypassStorageWriteForPrivateSession() {
            return privateSession;
        },
        readStorageJson(key, fallback = null) {
            return storage.has(key) ? cloneAcrossRealm(storage.get(key)) : fallback;
        },
        writeStorageJson(key, value) {
            const cloned = cloneAcrossRealm(value);
            writes.push({ key, value: cloned });
            storage.set(key, cloned);
            return options.writeSucceeds !== false;
        },
        removeStorageValue(key) {
            removals.push(key);
            storage.delete(key);
            return true;
        }
    };
    context.window = context;
    context.globalThis = context;

    vm.runInNewContext(`${playlistSource}\n;globalThis.__releaseCacheApi = {
        sanitizeStoredOnlineMusicReleaseTracksCacheEntry,
        sanitizeStoredOnlineMusicReleaseTracksCache,
        hydrateOnlineMusicReleaseTracksCache,
        persistOnlineMusicReleaseTracksCache,
        getReusableOnlineMusicReleaseTracksCacheEntry,
        storeOnlineMusicReleaseTracksCacheEntry
    };`, context);

    return {
        api: context.__releaseCacheApi,
        online,
        storage,
        writes,
        removals,
        setPrivateSession(value) {
            privateSession = !!value;
        }
    };
}

test('release cache declares stable schema, retention, size, and prefetch limits', () => {
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_RELEASE_TRACKS_CACHE_KEY\s*=\s*'nexplay_online_release_tracks_cache_v1'/);
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_RELEASE_TRACKS_CACHE_SCHEMA_VERSION\s*=\s*1/);
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TTL_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_RELEASE_TRACKS_CACHE_ENTRY_LIMIT\s*=\s*48/);
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_RELEASE_TRACKS_CACHE_TRACK_LIMIT\s*=\s*200/);
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_RELEASE_TRACKS_CACHE_BYTE_LIMIT\s*=\s*1_500_000/);
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_LIMIT\s*=\s*6/);
    assert.match(runtimeConfigSource, /ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_CONCURRENCY\s*=\s*2/);
});

test('release cache rejects corrupt schemas, stale entries, empty entries, and unsafe URLs', () => {
    const { api } = createCacheHarness();
    const now = 2_000_000_000_000;

    const wrongSchema = api.sanitizeStoredOnlineMusicReleaseTracksCache({
        schemaVersion: CACHE_CONSTANTS.schemaVersion + 1,
        entries: { poisoned: makeEntry('poisoned', now) }
    }, now);
    assert.equal(wrongSchema.schemaVersion, CACHE_CONSTANTS.schemaVersion);
    assert.deepEqual(Object.keys(wrongSchema.entries), []);

    assert.equal(api.sanitizeStoredOnlineMusicReleaseTracksCacheEntry(null, now, 'bad'), null);
    assert.equal(api.sanitizeStoredOnlineMusicReleaseTracksCacheEntry(
        makeEntry('stale', now - CACHE_CONSTANTS.ttlMs - 1),
        now,
        'stale'
    ), null);
    assert.equal(api.sanitizeStoredOnlineMusicReleaseTracksCacheEntry(
        makeEntry('empty', now, { tracks: [], declaredTrackCount: 12, rawItems: [{ title: 'not enough' }] }),
        now,
        'empty'
    ), null);

    const safe = api.sanitizeStoredOnlineMusicReleaseTracksCacheEntry(makeEntry('itunes:safe', now, {
        release: { cover: 'javascript:alert(1)" onerror="alert(2)' },
        tracks: [makeTrack(1, {
            cover: 'data:text/html,<script>alert(1)</script>',
            canonicalUrl: 'https://example.com/song'
        })]
    }), now, 'itunes:safe');
    assert.ok(safe);
    assert.equal(safe.release.cover, '');
    assert.equal(safe.tracks[0].cover, '');
    assert.equal(safe.tracks[0].canonicalUrl, 'https://example.com/song');
});

test('release cache enforces per-entry track and global entry limits', () => {
    const { api } = createCacheHarness();
    const now = 2_000_000_000_000;
    const oversizedEntry = makeEntry('itunes:many-tracks', now, {
        tracks: Array.from({ length: CACHE_CONSTANTS.trackLimit + 9 }, (_, index) => makeTrack(index))
    });
    const sanitizedEntry = api.sanitizeStoredOnlineMusicReleaseTracksCacheEntry(oversizedEntry, now, 'itunes:many-tracks');
    assert.equal(sanitizedEntry.tracks.length, CACHE_CONSTANTS.trackLimit);

    const entries = {};
    for (let index = 0; index < CACHE_CONSTANTS.entryLimit + 7; index += 1) {
        const key = `itunes:release-${index}`;
        entries[key] = makeEntry(key, now - index, { lastAccessedAt: now - index });
    }
    const sanitizedCache = api.sanitizeStoredOnlineMusicReleaseTracksCache({
        schemaVersion: CACHE_CONSTANTS.schemaVersion,
        entries
    }, now);
    assert.equal(Object.keys(sanitizedCache.entries).length, CACHE_CONSTANTS.entryLimit);
    assert.ok(sanitizedCache.entries['itunes:release-0']);
    assert.equal(sanitizedCache.entries[`itunes:release-${CACHE_CONSTANTS.entryLimit + 6}`], undefined);
});

test('release cache enforces its serialized byte ceiling', () => {
    const { api } = createCacheHarness();
    const now = 2_000_000_000_000;
    const entries = {};
    const largeDescription = 'x'.repeat(1000);
    for (let entryIndex = 0; entryIndex < CACHE_CONSTANTS.entryLimit; entryIndex += 1) {
        const key = `itunes:large-${entryIndex}`;
        entries[key] = makeEntry(key, now - entryIndex, {
            tracks: Array.from({ length: 40 }, (_, trackIndex) => makeTrack(
                entryIndex * 1000 + trackIndex,
                { description: largeDescription, tags: Array.from({ length: 16 }, () => 't'.repeat(80)) }
            )),
            lastAccessedAt: now - entryIndex
        });
    }
    const sanitized = api.sanitizeStoredOnlineMusicReleaseTracksCache({
        schemaVersion: CACHE_CONSTANTS.schemaVersion,
        entries
    }, now);
    const bytes = new TextEncoder().encode(JSON.stringify(cloneAcrossRealm(sanitized))).length;
    assert.ok(bytes <= CACHE_CONSTANTS.byteLimit, `${bytes} bytes exceeds the release-cache limit`);
    assert.ok(Object.keys(sanitized.entries).length < Object.keys(entries).length);
});

test('release cache storage installs sanitized entries and honors non-persistent callers', () => {
    const harness = createCacheHarness();
    const now = 2_000_000_000_000;
    const stored = harness.api.storeOnlineMusicReleaseTracksCacheEntry(
        'itunes:release-1',
        makeEntry('itunes:release-1', now),
        { now, persist: false }
    );
    assert.ok(stored);
    assert.equal(harness.online.releaseTracksCache['itunes:release-1'].tracks.length, 1);
    assert.equal(Object.hasOwn(stored, 'promise'), false);
    assert.equal(Object.hasOwn(stored, 'rawItems'), false);
    assert.equal(harness.writes.length, 0);

    const persisted = harness.api.storeOnlineMusicReleaseTracksCacheEntry(
        'itunes:release-2',
        makeEntry('itunes:release-2', now),
        { now }
    );
    assert.ok(persisted);
    assert.equal(harness.writes.length, 1);
    assert.ok(harness.writes[0].value.entries['itunes:release-2']);

    assert.equal(harness.api.storeOnlineMusicReleaseTracksCacheEntry(
        'itunes:empty',
        makeEntry('itunes:empty', now, { tracks: [], declaredTrackCount: 8 }),
        { now }
    ), null);
});

test('release cache persistence strips promises and raw provider payloads', () => {
    const harness = createCacheHarness();
    const now = 2_000_000_000_000;
    harness.online.releaseTracksCache['itunes:release-1'] = makeEntry('itunes:release-1', now);

    assert.equal(harness.api.persistOnlineMusicReleaseTracksCache({ now }), true);
    assert.equal(harness.writes.length, 1);
    const written = harness.writes[0];
    assert.equal(written.key, CACHE_CONSTANTS.key);
    const persistedEntry = written.value.entries['itunes:release-1'];
    assert.ok(persistedEntry);
    assert.equal(Object.hasOwn(persistedEntry, 'promise'), false);
    assert.equal(Object.hasOwn(persistedEntry, 'rawItems'), false);
    assert.equal(JSON.stringify(written.value).includes('secretProviderPayload'), false);
});

test('release cache hydrates valid rows and serves only reusable non-empty entries', () => {
    const harness = createCacheHarness();
    const now = 2_000_000_000_000;
    harness.storage.set(CACHE_CONSTANTS.key, {
        schemaVersion: CACHE_CONSTANTS.schemaVersion,
        savedAt: now,
        entries: {
            'itunes:release-1': makeEntry('itunes:release-1', now)
        }
    });

    assert.equal(harness.api.hydrateOnlineMusicReleaseTracksCache({ now }), 1);
    const hydrated = harness.online.releaseTracksCache['itunes:release-1'];
    assert.ok(hydrated);
    assert.equal(hydrated.tracks.length, 1);
    assert.equal(Object.hasOwn(hydrated, 'promise'), false);
    assert.equal(Object.hasOwn(hydrated, 'rawItems'), false);

    const reusable = harness.api.getReusableOnlineMusicReleaseTracksCacheEntry('itunes:release-1', now + 1);
    assert.ok(reusable);
    assert.equal(reusable.tracks[0].title, 'Track 1');

    harness.online.releaseTracksCache.empty = {
        release: { playlistId: 'empty', title: 'Empty' },
        tracks: [],
        rawItems: [{ title: 'catalog row' }],
        declaredTrackCount: 10,
        updatedAt: now
    };
    assert.equal(harness.api.getReusableOnlineMusicReleaseTracksCacheEntry('empty', now + 1), null);
    assert.equal(harness.online.releaseTracksCache.empty, undefined);
});

test('release cache performs no persistent writes during Private Session', () => {
    const harness = createCacheHarness({ privateSession: true });
    const now = 2_000_000_000_000;
    harness.online.releaseTracksCache['itunes:private'] = makeEntry('itunes:private', now);

    assert.equal(harness.api.persistOnlineMusicReleaseTracksCache({ now }), false);
    assert.equal(harness.writes.length, 0);
    assert.equal(harness.api.hydrateOnlineMusicReleaseTracksCache({ now }), 0);
    assert.equal(harness.writes.length, 0);
});

test('startup, bounded prefetch, private-session, and release-loader integrations remain wired', () => {
    const initBody = sliceBetween(appInitSource, 'async function init()', 'function setupEventListeners');
    assert.match(initBody, /state\.onlineMusic\s*=\s*sanitizeStoredOnlineMusicState/);
    assert.match(initBody, /hydrateOnlineMusicReleaseTracksCache\(\)/);
    assert.ok(
        initBody.indexOf('state.onlineMusic = sanitizeStoredOnlineMusicState')
            < initBody.indexOf('hydrateOnlineMusicReleaseTracksCache()'),
        'cache hydration must occur after online state restoration'
    );

    const primeBody = sliceBetween(
        onlineMusicSource,
        'function primeOnlineMusicArtistReleaseTracks',
        'async function openOnlineMusicArtistFromTrack'
    );
    assert.match(primeBody, /ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_LIMIT/);
    assert.match(primeBody, /ONLINE_MUSIC_ARTIST_RELEASE_PREFETCH_CONCURRENCY/);
    assert.match(primeBody, /Array\.from\(\{\s*length:\s*workerCount\s*\}/);
    assert.match(primeBody, /await\s+loadOnlineMusicReleaseTracks/);
    assert.match(primeBody, /Promise\.all\(workers\)/);
    assert.doesNotMatch(primeBody, /\.slice\(0,\s*12\)/);
    assert.doesNotMatch(primeBody, /releases\.forEach/);

    const privateReleaseBody = sliceBetween(
        privateSessionSource,
        'async function openPrivateSessionOnlineRelease',
        'async function importPrivateSessionPlaylistFromInput'
    );
    assert.match(privateReleaseBody, /loadOnlineMusicReleaseTracks\(release,[\s\S]*?cache:\s*false[\s\S]*?persist:\s*false/);

    const loaderBody = sliceBetween(
        onlineMusicSource,
        'async function loadOnlineMusicReleaseTracks',
        'async function loadOnlineMusicArtistCatalog'
    );
    assert.match(loaderBody, /getReusableOnlineMusicReleaseTracksCacheEntry/);
    assert.match(loaderBody, /storeOnlineMusicReleaseTracksCacheEntry/);
    assert.match(loaderBody, /persist:\s*options\?\.persist\s*!==\s*false/);
    assert.doesNotMatch(loaderBody, /rawItems\s*\|\|\s*\[\]\)\.length\s*\|\|\s*declaredCount\s*>\s*0\)\s*return existing/);
});
