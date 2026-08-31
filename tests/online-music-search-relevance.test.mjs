// @ts-nocheck

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const onlineMusicHelpers = require('../nexplay-next/legacy-online-music-helpers.cjs');
const providerSource = fs.readFileSync(new URL('../js/legacy/online-playlists.js', import.meta.url), 'utf8');

function sourceBetween(startMarker, endMarker) {
    const start = providerSource.indexOf(startMarker);
    const end = providerSource.indexOf(endMarker, start);
    assert.notEqual(start, -1, startMarker);
    assert.notEqual(end, -1, endMarker);
    return providerSource.slice(start, end);
}

const sanitizerSource = sourceBetween(
    'function normalizeOnlineMusicTrackId',
    'function sanitizeStoredOnlineMusicPlaylists'
);
const relevanceSource = sourceBetween(
    'function normalizeOnlineMusicSearchMergeTitle',
    'function createItunesSearchTrack'
);
const mappingSource = sourceBetween(
    'function createItunesSearchTrack',
    'function canUseDesktopYouTubeMusicSearch'
);

function normalizeLookupText(value = '') {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeArtistName(value = '') {
    return String(value || '')
        .replace(/\s+-\s+Topic\s*$/i, '')
        .replace(/\bVEVO\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function createRelevanceHarness(options = {}) {
    const state = { currentTrackId: '' };
    const sanitizeText = (value = '') => String(value ?? '').trim();
    const context = {
        console,
        Date,
        ONLINE_MUSIC_SEARCH_LIMIT: 12,
        sanitizeText,
        normalizeLyricsLookupText: normalizeLookupText,
        normalizeLyricsArtistName: normalizeArtistName,
        normalizeOnlineMusicProvider: onlineMusicHelpers.normalizeOnlineMusicProvider,
        getOnlineMusicProviderLabel: onlineMusicHelpers.getOnlineMusicProviderLabel,
        formatTime: (seconds = 0) => {
            const total = Math.max(0, Math.floor(Number(seconds || 0) || 0));
            return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
        },
        buildItunesArtworkUrl: (url = '') => sanitizeText(url),
        getOnlineMusicState: () => state,
        getSavedOnlineTrack: () => null,
        state,
        fetchJsonpPayload: async (url) => {
            if (typeof options.fetchJsonpPayload === 'function') return options.fetchJsonpPayload(url);
            if (/itunes\.apple\.com/i.test(url)) return options.itunesPayload || { results: [] };
            if (/api\.deezer\.com/i.test(url)) return options.deezerPayload || { data: [] };
            throw new Error(`Unexpected provider URL: ${url}`);
        }
    };
    context.window = context;
    context.NexPlayOnlineMusicHelpers = onlineMusicHelpers;
    vm.runInNewContext(`
        ${sanitizerSource}
        ${relevanceSource}
        ${mappingSource}
        globalThis.__relevanceApi = {
            sanitizeStoredOnlineMusicTrack,
            scoreOnlineMusicSearchResult,
            mergeOnlineMusicSearchResults,
            createItunesSearchTrack,
            createDeezerSearchTrack,
            fetchItunesSearchTracks,
            fetchDeezerSearchTracks
        };
    `, context);
    return context.__relevanceApi;
}

function catalogTrack(api, options = {}) {
    const provider = options.provider || 'itunes';
    const id = options.id || `${provider}-${Math.random().toString(16).slice(2)}`;
    return api.sanitizeStoredOnlineMusicTrack({
        id: `${provider}:${id}`,
        provider,
        catalogProvider: provider,
        catalogProviderLabel: provider === 'itunes' ? 'iTunes' : 'Deezer',
        providerTrackId: id,
        title: options.title || 'Dirty Diana',
        artist: options.artist || 'Michael Jackson',
        channelTitle: options.artist || 'Michael Jackson',
        cover: options.cover || `${provider}-cover.jpg`,
        duration: options.duration || 251,
        providerSearchRank: options.rank || 0,
        providerPopularity: options.popularity || 0
    });
}

function youtubeTrack(api, options = {}) {
    const videoId = options.videoId || 'youtube-video';
    return api.sanitizeStoredOnlineMusicTrack({
        id: videoId,
        videoId,
        provider: 'youtube',
        providerLabel: 'YouTube Music',
        catalogProvider: 'youtube',
        catalogProviderLabel: 'YouTube Music',
        transportProvider: 'youtube',
        transportProviderLabel: 'YouTube',
        sourceSurface: 'youtube-music',
        resolver: 'yt-dlp-ytmsearch',
        title: options.title || 'Dirty Diana',
        artist: options.artist || 'Michael Jackson',
        channelTitle: options.artist || 'Michael Jackson',
        cover: options.cover || 'youtube-cover.jpg',
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        duration: options.duration || 251,
        providerSearchRank: options.rank || 1,
        viewCount: options.viewCount || 0,
        tags: options.tags || []
    });
}

test('catalog provider mappings retain source order and Deezer popularity', async () => {
    const api = createRelevanceHarness({
        itunesPayload: {
            results: [
                { wrapperType: 'track', trackId: 101, trackName: 'First', artistName: 'Artist A', trackTimeMillis: 180000 },
                { wrapperType: 'track', trackId: 102, trackName: 'Second', artistName: 'Artist B', trackTimeMillis: 181000 }
            ]
        },
        deezerPayload: {
            data: [
                { id: 201, title: 'First Deezer', duration: 182, rank: 987654, artist: { id: 1, name: 'Artist C' }, album: { id: 2, title: 'Album C' } },
                { id: 202, title: 'Second Deezer', duration: 183, rank: 321000, artist: { id: 3, name: 'Artist D' }, album: { id: 4, title: 'Album D' } }
            ]
        }
    });

    const [itunes, deezer] = await Promise.all([
        api.fetchItunesSearchTracks('test'),
        api.fetchDeezerSearchTracks('test')
    ]);

    assert.deepEqual(Array.from(itunes, (track) => track.providerSearchRank), [1, 2]);
    assert.deepEqual(Array.from(deezer, (track) => track.providerSearchRank), [1, 2]);
    assert.deepEqual(Array.from(deezer, (track) => track.providerPopularity), [987654, 321000]);
});

test('catalog metadata remains primary when matching YouTube transport is attached', () => {
    const api = createRelevanceHarness();
    const catalog = catalogTrack(api, {
        provider: 'itunes',
        id: 'dirty-diana-catalog',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        cover: 'itunes-authoritative-cover.jpg',
        rank: 1
    });
    const youtube = youtubeTrack(api, {
        videoId: 'dirty-diana-video',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        cover: 'youtube-thumbnail.jpg'
    });

    const results = api.mergeOnlineMusicSearchResults([youtube, catalog], {
        query: 'Dirty Diana',
        preferPlayableTransport: true
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].provider, 'itunes');
    assert.equal(results[0].artist, 'Michael Jackson');
    assert.equal(results[0].cover, 'itunes-authoritative-cover.jpg');
    assert.equal(results[0].videoId, 'dirty-diana-video');
    assert.equal(results[0].transportProvider, 'youtube');
    assert.equal(results[0].pendingPlaybackResolution, false);
});

test('equal-score catalog duplicates merge deterministically regardless of provider arrival order', () => {
    const api = createRelevanceHarness();
    const rows = ['Michael Jackson', "Shaman's Harvest"].flatMap((artist) => {
        const title = 'Dirty Diana';
        const slug = artist.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return [
            catalogTrack(api, {
                provider: 'itunes',
                id: `${slug}-itunes`,
                title,
                artist,
                cover: `${slug}-itunes.jpg`,
                rank: 1
            }),
            catalogTrack(api, {
                provider: 'deezer',
                id: `${slug}-deezer`,
                title,
                artist,
                cover: `${slug}-deezer.jpg`,
                rank: 1,
                popularity: 40
            })
        ];
    });
    const options = { query: '' };
    assert.equal(api.scoreOnlineMusicSearchResult(rows[0], options), api.scoreOnlineMusicSearchResult(rows[1], options));
    assert.equal(api.scoreOnlineMusicSearchResult(rows[2], options), api.scoreOnlineMusicSearchResult(rows[3], options));

    const forward = JSON.parse(JSON.stringify(api.mergeOnlineMusicSearchResults(rows, options)));
    const reversed = JSON.parse(JSON.stringify(api.mergeOnlineMusicSearchResults(rows.slice().reverse(), options)));

    assert.deepEqual(reversed, forward);
    assert.equal(forward.length, 2);
    assert.equal(forward.every((track) => track.provider === 'itunes'), true);
    assert.equal(forward.every((track) => track.searchCatalogSources.join(',') === 'itunes,deezer'), true);
});

test('playability is a tie-breaker rather than the former 900-point override', () => {
    assert.doesNotMatch(relevanceSource, /track\?\.videoId\s*\?\s*900/);
    const api = createRelevanceHarness();
    const base = catalogTrack(api, {
        provider: 'itunes',
        id: 'playability-delta',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1
    });
    const playable = api.sanitizeStoredOnlineMusicTrack({
        ...base,
        videoId: 'playability-video',
        transportProvider: 'youtube',
        transportProviderLabel: 'YouTube'
    });
    const options = { query: 'Dirty Diana', preferPlayableTransport: true };
    const delta = api.scoreOnlineMusicSearchResult(playable, options)
        - api.scoreOnlineMusicSearchResult(base, options);

    assert.ok(delta > 0);
    assert.ok(delta < 200, `playability delta was ${delta}`);
});

test('Dirty Diana keeps canonical and useful YouTube alternatives while rejecting unrelated identities', () => {
    const api = createRelevanceHarness();
    const itunesCanonical = catalogTrack(api, {
        provider: 'itunes',
        id: 'mj-itunes',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1
    });
    const deezerCanonical = catalogTrack(api, {
        provider: 'deezer',
        id: 'mj-deezer',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1,
        popularity: 1000000
    });
    const lowRankUnknown = catalogTrack(api, {
        provider: 'itunes',
        id: 'unknown-itunes',
        title: 'Dirty Diana',
        artist: 'Unknown Artist',
        rank: 22
    });
    const genericYouTubeMusic = youtubeTrack(api, {
        videoId: 'generic-ytm',
        title: 'Dirty Diana',
        artist: 'YouTube Music',
        rank: 1
    });
    const unrelatedRankOneYouTube = youtubeTrack(api, {
        videoId: 'unrelated-rank-one-youtube',
        title: 'Dirty Diana',
        artist: 'Random Unknown Artist',
        rank: 1
    });
    const crossProviderSameTitleNoise = [
        ['shamans-harvest', "Shaman's Harvest", 2, 358898],
        ['gunna', 'Gunna', 4, 328287],
        ['jordan-adetunji', 'Jordan Adetunji', 5, 265000],
        ['fame-on-fire', 'Fame on Fire', 7, 175000],
        ['scala', 'Scala & Kolacny Brothers', 10, 125000]
    ].flatMap(([id, artist, rank, popularity]) => [
        catalogTrack(api, { provider: 'itunes', id: `${id}-itunes`, title: 'Dirty Diana', artist, rank }),
        catalogTrack(api, { provider: 'deezer', id: `${id}-deezer`, title: 'Dirty Diana', artist, rank, popularity })
    ]);
    const singleProviderSameTitleNoise = [
        catalogTrack(api, { provider: 'itunes', id: 'che-salah-itunes', title: 'Dirty Diana', artist: 'Ché Salah', rank: 3 }),
        catalogTrack(api, { provider: 'deezer', id: 'esso-luxueux-deezer', title: 'Dirty Diana', artist: 'Esso Luxueux', rank: 6, popularity: 95000 })
    ];
    const officialAudio = youtubeTrack(api, {
        videoId: 'mj-official-audio',
        title: 'Michael Jackson - Dirty Diana (Official Audio)',
        artist: 'Michael Jackson',
        rank: 1,
        viewCount: 85000000
    });
    const lyricsVideo = youtubeTrack(api, {
        videoId: 'mj-lyrics',
        title: 'Michael Jackson - Dirty Diana (Lyrics)',
        artist: '7clouds',
        rank: 2,
        viewCount: 12000000
    });
    const officialVideo = youtubeTrack(api, {
        videoId: 'mj-official-video',
        title: 'Michael Jackson - Dirty Diana (Official Music Video)',
        artist: 'Michael Jackson',
        rank: 3,
        viewCount: 190000000
    });
    const credibleCover = youtubeTrack(api, {
        videoId: 'dirty-diana-cover',
        title: 'Dirty Diana (Rock Cover)',
        artist: 'First to Eleven',
        rank: 5,
        viewCount: 5000000
    });

    const results = api.mergeOnlineMusicSearchResults([
        lowRankUnknown,
        genericYouTubeMusic,
        unrelatedRankOneYouTube,
        ...singleProviderSameTitleNoise,
        ...crossProviderSameTitleNoise,
        credibleCover,
        officialVideo,
        lyricsVideo,
        officialAudio,
        deezerCanonical,
        itunesCanonical
    ], {
        query: 'Dirty Diana',
        preferPlayableTransport: true
    });

    assert.equal(results.length, 4, JSON.stringify({
        results: results.map((track) => ({ title: track.title, artist: track.artist, videoId: track.videoId, score: api.scoreOnlineMusicSearchResult(track, { query: 'Dirty Diana', preferPlayableTransport: true }) })),
        coverScore: api.scoreOnlineMusicSearchResult(credibleCover, { query: 'Dirty Diana', preferPlayableTransport: true })
    }));
    assert.equal(results[0].title, 'Dirty Diana');
    assert.equal(results[0].artist, 'Michael Jackson');
    assert.equal(results[0].videoId, 'mj-official-audio');
    assert.equal(results[0].searchCatalogConsensus, 2);
    assert.deepEqual(new Set(results[0].searchCatalogSources), new Set(['itunes', 'deezer']));
    assert.equal(results.some((track) => track.videoId === 'mj-lyrics'), true);
    assert.equal(results.some((track) => track.videoId === 'mj-official-video'), true);
    assert.equal(results.some((track) => track.videoId === 'dirty-diana-cover'), true);
    assert.equal(results.some((track) => track.artist === 'Unknown Artist'), false);
    assert.equal(results.some((track) => track.artist === 'YouTube Music'), false);
    assert.equal(results.some((track) => track.artist === 'Random Unknown Artist'), false);
    assert.equal(results.some((track) => [
        "Shaman's Harvest",
        'Gunna',
        'Jordan Adetunji',
        'Fame on Fire',
        'Scala & Kolacny Brothers',
        'Ché Salah',
        'Esso Luxueux'
    ].includes(track.artist)), false);
});

test('single-provider outage still collapses same-title noise to the winning artist identity', () => {
    const api = createRelevanceHarness();
    const rows = [
        catalogTrack(api, { provider: 'itunes', id: 'mj-only-provider', title: 'Dirty Diana', artist: 'Michael Jackson', rank: 1 }),
        catalogTrack(api, { provider: 'itunes', id: 'shaman-only-provider', title: 'Dirty Diana', artist: "Shaman's Harvest", rank: 2 }),
        catalogTrack(api, { provider: 'itunes', id: 'che-only-provider', title: 'Dirty Diana', artist: 'Ché Salah', rank: 3 }),
        catalogTrack(api, { provider: 'itunes', id: 'gunna-only-provider', title: 'Dirty Diana', artist: 'Gunna', rank: 4 }),
        catalogTrack(api, { provider: 'itunes', id: 'jordan-only-provider', title: 'Dirty Diana', artist: 'Jordan Adetunji', rank: 5 }),
        catalogTrack(api, { provider: 'itunes', id: 'esso-only-provider', title: 'Dirty Diana', artist: 'Esso Luxueux', rank: 6 }),
        catalogTrack(api, { provider: 'itunes', id: 'fame-only-provider', title: 'Dirty Diana', artist: 'Fame on Fire', rank: 7 }),
        catalogTrack(api, { provider: 'itunes', id: 'scala-only-provider', title: 'Dirty Diana', artist: 'Scala & Kolacny Brothers', rank: 10 })
    ];

    const results = api.mergeOnlineMusicSearchResults(rows, { query: 'Dirty Diana' });

    assert.equal(results.length, 1);
    assert.equal(results[0].artist, 'Michael Jackson');
});

test('canonical catalog identity ranks above a high-view third-party lyrics upload', () => {
    const api = createRelevanceHarness();
    const canonical = catalogTrack(api, {
        provider: 'itunes',
        id: 'mj-canonical-single-provider',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1
    });
    const thirdPartyLyrics = youtubeTrack(api, {
        videoId: 'glyphoric-dirty-diana-lyrics',
        title: 'Michael Jackson - Dirty Diana [Lyrics]',
        artist: 'GlyphoricVibes',
        rank: 1,
        viewCount: 500000000
    });

    const results = api.mergeOnlineMusicSearchResults([thirdPartyLyrics, canonical], {
        query: 'Dirty Diana',
        preferPlayableTransport: true
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].artist, 'Michael Jackson');
    assert.equal(results[0].title, 'Dirty Diana');
    assert.equal(results[1].videoId, 'glyphoric-dirty-diana-lyrics');
});

test('rank-one catalog identity survives a detached high-view lyrics leader', () => {
    const api = createRelevanceHarness();
    const canonical = catalogTrack(api, {
        provider: 'itunes',
        id: 'mj-detached-lyrics-canonical',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1
    });
    const detachedLyrics = youtubeTrack(api, {
        videoId: 'detached-dirty-diana-lyrics',
        title: 'Dirty Diana (Lyrics)',
        artist: '7clouds',
        rank: 1,
        viewCount: 500000000
    });

    const results = api.mergeOnlineMusicSearchResults([detachedLyrics, canonical], {
        query: 'Dirty Diana',
        preferPlayableTransport: true
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].provider, 'itunes');
    assert.equal(results[0].artist, 'Michael Jackson');
    assert.equal(results[1].videoId, 'detached-dirty-diana-lyrics');
});

test('dual-provider catalog consensus retains one strong detached exact-title lyrics fallback', () => {
    const api = createRelevanceHarness();
    const itunesCanonical = catalogTrack(api, {
        provider: 'itunes',
        id: 'mj-consensus-detached-lyrics-itunes',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1
    });
    const deezerCanonical = catalogTrack(api, {
        provider: 'deezer',
        id: 'mj-consensus-detached-lyrics-deezer',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1,
        popularity: 1000000
    });
    const detachedLyrics = youtubeTrack(api, {
        videoId: 'consensus-detached-dirty-diana-lyrics',
        title: 'Dirty Diana (Lyrics)',
        artist: '7clouds',
        rank: 1,
        viewCount: 500000000
    });

    const results = api.mergeOnlineMusicSearchResults([
        detachedLyrics,
        itunesCanonical,
        deezerCanonical
    ], {
        query: 'Dirty Diana',
        preferPlayableTransport: true
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].artist, 'Michael Jackson');
    assert.equal(results[0].searchCatalogConsensus, 2);
    assert.equal(results[1].videoId, 'consensus-detached-dirty-diana-lyrics');
});

test('coherent structured catalog rows survive a misspelled explicit artist query', () => {
    const api = createRelevanceHarness();
    const canonical = catalogTrack(api, {
        provider: 'itunes',
        id: 'mj-explicit-artist-typo',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1
    });
    const unrelated = catalogTrack(api, {
        provider: 'itunes',
        id: 'tribute-explicit-artist-typo',
        title: 'Dirty Diana',
        artist: 'Tribute Band',
        rank: 2
    });
    const thirdPartyLyrics = youtubeTrack(api, {
        videoId: 'glyphoric-explicit-artist-typo-lyrics',
        title: 'Michael Jackson - Dirty Diana [Lyrics]',
        artist: 'GlyphoricVibes',
        rank: 1,
        viewCount: 500000000
    });
    const query = 'Dirty Diana by Micheal Jackson';
    const packagedEligibility = onlineMusicHelpers.classifyOnlineMusicSearchResultEligibility({
        ...canonical,
        query
    });

    assert.equal(packagedEligibility.include, false);
    assert.match(packagedEligibility.reason, /^explicit-(?:title|artist)-mismatch$/);
    const results = api.mergeOnlineMusicSearchResults([thirdPartyLyrics, unrelated, canonical], {
        query,
        preferPlayableTransport: true
    });
    assert.equal(results.length, 2);
    assert.equal(results[0].artist, 'Michael Jackson');
    assert.equal(results[0].title, 'Dirty Diana');
    assert.equal(results[1].videoId, 'glyphoric-explicit-artist-typo-lyrics');
});

test('an exact-title collision cannot collapse a multi-song artist-name search', () => {
    const api = createRelevanceHarness();
    const rows = [
        catalogTrack(api, { provider: 'itunes', id: 'title-collision', title: 'Michael Jackson', artist: 'The Interview Project', rank: 1 }),
        catalogTrack(api, { provider: 'itunes', id: 'billie-jean', title: 'Billie Jean', artist: 'Michael Jackson', rank: 2 }),
        catalogTrack(api, { provider: 'itunes', id: 'beat-it', title: 'Beat It', artist: 'Michael Jackson', rank: 3 }),
        catalogTrack(api, { provider: 'itunes', id: 'smooth-criminal', title: 'Smooth Criminal', artist: 'Michael Jackson', rank: 4 })
    ];

    const results = api.mergeOnlineMusicSearchResults(rows, { query: 'Michael Jackson' });
    const michaelJacksonSongs = results.filter((track) => track.artist === 'Michael Jackson');

    assert.equal(michaelJacksonSongs.length, 3);
    assert.deepEqual(new Set(michaelJacksonSongs.map((track) => track.title)), new Set(['Billie Jean', 'Beat It', 'Smooth Criminal']));
});

test('artist-only discovery ranks catalog and official artist rows before third-party lyrics uploads', () => {
    const api = createRelevanceHarness();
    const catalogRows = ['Billie Jean', 'Beat It', 'Smooth Criminal', 'Thriller', 'Bad'].map((title, index) => (
        catalogTrack(api, {
            provider: 'itunes',
            id: `mj-catalog-${index + 1}`,
            title,
            artist: 'Michael Jackson',
            rank: index + 1
        })
    ));
    const officialRow = youtubeTrack(api, {
        videoId: 'mj-human-nature-official',
        title: 'Michael Jackson - Human Nature (Official Audio)',
        artist: 'Michael Jackson',
        rank: 1,
        viewCount: 50000000
    });
    const lyricRows = ['Dirty Diana', 'Remember the Time', 'Earth Song', 'You Rock My World', 'The Way You Make Me Feel'].map((title, index) => (
        youtubeTrack(api, {
            videoId: `third-party-lyrics-${index + 1}`,
            title: `Michael Jackson - ${title} [Lyrics]`,
            artist: `Lyrics Channel ${index + 1}`,
            rank: index + 1,
            viewCount: 400000000 - (index * 10000000)
        })
    ));

    const results = api.mergeOnlineMusicSearchResults([
        ...lyricRows,
        officialRow,
        ...catalogRows
    ], { query: 'Michael Jackson', preferPlayableTransport: true });
    const firstLyricsIndex = results.findIndex((track) => /^Lyrics Channel/.test(track.artist));
    const lastAuthoritativeIndex = Math.max(...results.map((track, index) => (
        track.provider === 'itunes' || track.videoId === 'mj-human-nature-official' ? index : -1
    )));

    assert.equal(results.length, 11);
    assert.equal(results.slice(0, 5).every((track) => track.provider === 'itunes'), true);
    assert.ok(firstLyricsIndex > lastAuthoritativeIndex);
});

test('artist-only typo search expands to the canonical artist query and keeps their songs', async () => {
    const requestedUrls = [];
    const api = createRelevanceHarness({
        fetchJsonpPayload: async (url) => {
            requestedUrls.push(url);
            if (/Tate%20McRae/i.test(url)) {
                return {
                    results: [
                        { wrapperType: 'track', trackId: 302, trackName: 'greedy', artistName: 'Tate McRae', trackTimeMillis: 131000 },
                        { wrapperType: 'track', trackId: 303, trackName: 'you broke me first', artistName: 'Tate McRae', trackTimeMillis: 169000 },
                        { wrapperType: 'track', trackId: 304, trackName: 'sports car', artistName: 'Tate McRae', trackTimeMillis: 167000 }
                    ]
                };
            }
            return {
                results: [
                    { wrapperType: 'track', trackId: 301, trackName: 'greedy', artistName: 'Tate McRae', trackTimeMillis: 131000 }
                ]
            };
        }
    });

    const tracks = await api.fetchItunesSearchTracks('Tate Macre');
    const results = api.mergeOnlineMusicSearchResults(tracks, { query: 'Tate Macre' });

    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[1], /Tate%20McRae/i);
    assert.equal(results.length, 3);
    assert.equal(results.every((track) => track.artist === 'Tate McRae'), true);
    assert.deepEqual(new Set(results.map((track) => track.title)), new Set(['greedy', 'you broke me first', 'sports car']));
});

test('incomplete title prefixes predict the canonical song without admitting unrelated rows', () => {
    const api = createRelevanceHarness();
    const dirtyDiana = catalogTrack(api, {
        provider: 'itunes',
        id: 'dirty-diana-prefix',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        rank: 1
    });
    const dirtyDancer = catalogTrack(api, {
        provider: 'deezer',
        id: 'dirty-dancer-prefix',
        title: 'Dirty Dancer',
        artist: 'Enrique Iglesias',
        rank: 6,
        popularity: 250000
    });
    const unrelated = catalogTrack(api, {
        provider: 'itunes',
        id: 'unrelated-prefix',
        title: 'Diana',
        artist: 'Random Artist',
        rank: 2
    });

    const results = api.mergeOnlineMusicSearchResults([unrelated, dirtyDancer, dirtyDiana], {
        query: 'Dirty D'
    });

    assert.equal(results[0].title, 'Dirty Diana');
    assert.equal(results.some((track) => track.title === 'Dirty Dancer'), true);
    assert.equal(results.some((track) => track.title === 'Diana'), false);
});

test('incomplete artist prefixes predict that artist catalog instead of requiring the full name', () => {
    const api = createRelevanceHarness();
    const michaelJacksonTracks = ['Beat It', 'Human Nature', 'Dirty Diana'].map((title, index) => catalogTrack(api, {
        provider: index % 2 ? 'deezer' : 'itunes',
        id: `michael-j-prefix-${index}`,
        title,
        artist: 'Michael Jackson',
        rank: index + 1,
        popularity: 600000 - (index * 50000)
    }));
    const unrelated = catalogTrack(api, {
        provider: 'itunes',
        id: 'michelle-branch-prefix',
        title: 'Everywhere',
        artist: 'Michelle Branch',
        rank: 1
    });

    const results = api.mergeOnlineMusicSearchResults([unrelated, ...michaelJacksonTracks], {
        query: 'Michael J'
    });

    assert.equal(results.length, 3);
    assert.equal(results.every((track) => track.artist === 'Michael Jackson'), true);
});

test('search result cap preserves broad artist discovery', () => {
    const api = createRelevanceHarness();
    const broadArtistCatalog = Array.from({ length: 20 }, (_, index) => catalogTrack(api, {
        provider: 'itunes',
        id: `daft-punk-${index + 1}`,
        title: `Catalog Song ${index + 1}`,
        artist: 'Daft Punk',
        rank: index + 1
    }));

    const results = api.mergeOnlineMusicSearchResults(broadArtistCatalog, { query: 'Daft Punk' });

    assert.equal(results.length, 12);
    assert.equal(results.every((track) => track.artist === 'Daft Punk'), true);
    assert.equal(results.some((track) => !/daft punk/i.test(track.title)), true);
});

test('obscure exact-title results remain available without a stronger catalog consensus', () => {
    const api = createRelevanceHarness();
    const lowRankCatalogOnly = catalogTrack(api, {
        provider: 'itunes',
        id: 'obscure-catalog',
        title: 'Midnight Semaphore',
        artist: 'Small Artist',
        rank: 24
    });
    const catalogResults = api.mergeOnlineMusicSearchResults([lowRankCatalogOnly], {
        query: 'Midnight Semaphore'
    });
    const youtubeFallback = youtubeTrack(api, {
        videoId: 'obscure-youtube',
        title: 'Midnight Semaphore',
        artist: 'YouTube Music',
        rank: 12
    });
    const defaultYoutubeResults = api.mergeOnlineMusicSearchResults([youtubeFallback], {
        query: 'Midnight Semaphore',
        preferPlayableTransport: true
    });
    const explicitYoutubeFallbackResults = api.mergeOnlineMusicSearchResults([youtubeFallback], {
        query: 'Midnight Semaphore',
        preferPlayableTransport: true,
        allowGenericYouTubeFallback: true
    });

    assert.equal(catalogResults.length, 1);
    assert.equal(catalogResults[0].artist, 'Small Artist');
    assert.equal(defaultYoutubeResults.length, 0);
    assert.equal(explicitYoutubeFallbackResults.length, 1);
    assert.equal(explicitYoutubeFallbackResults[0].videoId, 'obscure-youtube');
});
