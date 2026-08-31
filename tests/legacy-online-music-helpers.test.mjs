import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    buildOnlineMusicTrackFromQueueEntry,
    buildSavedOnlineMusicLibraryIndex,
    classifyOnlineMusicRelease,
    classifyOnlineMusicSearchResultEligibility,
    classifyYouTubeApiError,
    getOnlineMusicProviderLabel,
    isStaleOnlineMusicPlaybackAttempt,
    isLikelyTitleOnlyOnlineMusicSearchResult,
    lookupSavedOnlineMusicLibraryEntry,
    mergeUniqueOnlineMusicTracks,
    migrateLegacyOnlineMusicData,
    normalizeOnlineMusicProvider,
    purgeSpotifyImportedData,
    isLikelyShortFormOnlineMusicResult,
    projectOnlineQueueToAudioState,
    removeSavedOnlineMusicLibraryEntries,
    resolveOnlineQueueStep,
    sanitizeProviderErrorMessage,
    scoreOnlineMusicTrackCandidate,
    scoreOnlineMusicSearchResultForQuery,
    shouldIgnoreOnlineMusicTransportEvent,
    upsertSavedOnlineMusicLibraryEntry,
    uniqueOnlineMusicTracksInDeclaredOrder
} = require('../nexplay-next/legacy-online-music-helpers.cjs');

test('provider normalization and labels include spotify', () => {
    assert.equal(normalizeOnlineMusicProvider('yt'), 'youtube');
    assert.equal(normalizeOnlineMusicProvider('Spotify'), 'spotify');
    assert.equal(getOnlineMusicProviderLabel('spotify'), 'Spotify');
    assert.equal(getOnlineMusicProviderLabel('youtube'), 'YouTube');
});

test('purgeSpotifyImportedData removes spotify online imports but keeps local tracks', () => {
    const result = purgeSpotifyImportedData({
        savedOnlineTracks: [
            { id: 'yt_keep', provider: 'youtube', catalogProvider: 'youtube' },
            { id: 'yt_spotify', provider: 'spotify', catalogProvider: 'spotify', originProvider: 'spotify' }
        ],
        appState: {
            tracks: [
                { id: 'yt_spotify', source: 'online-music', title: 'Spotify import' },
                { id: 'local_keep', source: 'local', originProvider: 'spotify', title: 'Downloaded copy' }
            ],
            playlists: [
                { id: 'spotify_pl', name: 'Spotify import', importSource: 'spotify-playlist', tracks: ['yt_spotify'] },
                { id: 'mixed', name: 'Mixed', tracks: ['yt_spotify', 'local_keep', 'yt_keep'] }
            ],
            playHistory: ['yt_spotify', 'local_keep'],
            queue: ['yt_spotify', 'yt_keep'],
            shuffleQueue: ['yt_spotify'],
            selectedTrackIds: ['yt_spotify', 'local_keep'],
            currentTrackId: 'yt_spotify',
            currentTrack: { id: 'yt_spotify', source: 'online-music' },
            videoQueueState: {
                queue: ['yt_spotify', 'yt_keep'],
                shuffleQueue: ['yt_spotify']
            }
        },
        onlineMusicState: {
            queue: ['yt_spotify', 'yt_keep'],
            currentTrackId: 'yt_spotify',
            currentTrack: { id: 'yt_spotify' },
            activePlaylistId: 'spotify_pl',
            currentPlaylistContextId: 'spotify_pl',
            playlists: [
                { id: 'spotify_pl', tracks: ['yt_spotify'] },
                { id: 'other_pl', tracks: ['yt_spotify', 'yt_keep'] }
            ],
            spotifyAuth: { accessToken: 'secret' }
        },
        metadataStore: {
            'online-music:yt_spotify': { fingerprint: 'online-music:yt_spotify', title: 'Spotify import' },
            'local_keep|100': { fingerprint: 'local_keep|100', originProvider: 'spotify' }
        },
        appSettings: {
            onlineMusic: {
                customApiKey: 'abc',
                spotifyClientId: 'spotify-client'
            }
        }
    });

    assert.equal(result.changed, true);
    assert.deepEqual(result.removedTrackIds, ['yt_spotify']);
    assert.deepEqual(result.removedPlaylistIds, ['spotify_pl']);
    assert.deepEqual(result.savedOnlineTracks.map((/** @type {any} */ track) => track.id), ['yt_keep']);
    assert.deepEqual(result.appState.playlists.map((/** @type {any} */ playlist) => playlist.id), ['mixed']);
    assert.deepEqual(result.appState.playlists[0].tracks, ['local_keep', 'yt_keep']);
    assert.deepEqual(result.appState.tracks.map((/** @type {any} */ track) => track.id), ['local_keep']);
    assert.equal(result.appState.currentTrackId, null);
    assert.equal(result.appState.currentTrack, null);
    assert.deepEqual(result.onlineMusicState.queue, ['yt_keep']);
    assert.equal(result.onlineMusicState.currentTrackId, null);
    assert.equal(result.onlineMusicState.currentTrack, null);
    assert.equal(result.onlineMusicState.activePlaylistId, null);
    assert.equal(result.onlineMusicState.currentPlaylistContextId, null);
    assert.deepEqual(result.onlineMusicState.playlists, [{ id: 'other_pl', tracks: ['yt_keep'] }]);
    assert.deepEqual(Object.keys(result.metadataStore), ['local_keep|100']);
    assert.equal(result.appSettings.onlineMusic.spotifyClientId, undefined);
    assert.equal(result.onlineMusicState.spotifyAuth, undefined);
});

test('migrateLegacyOnlineMusicData promotes legacy online tracks and clears resume state', () => {
    const result = migrateLegacyOnlineMusicData({
        onlineMusicState: {
            library: [
                {
                    id: 'yt_alpha',
                    title: 'Alpha',
                    artist: 'Artist A',
                    resumePosition: 148,
                    resumeUpdatedAt: 999
                },
                {
                    id: '',
                    title: 'Invalid'
                }
            ],
            playlists: [
                {
                    id: 'mix',
                    name: 'Legacy Mix',
                    tracks: ['yt_alpha', 'missing', 'yt_alpha']
                }
            ],
            currentTrack: {
                id: 'yt_alpha',
                title: 'Alpha',
                resumePosition: 42,
                resumeUpdatedAt: 7
            },
            queue: ['yt_alpha', 'yt_alpha', 'missing'],
            queueIndex: 9,
            activePlaylistId: 'mix',
            currentPlaylistContextId: 'mix',
            currentTime: 33,
            isPlaying: true,
            playbackContext: 'library'
        },
        existingPlaylists: [
            { id: 'mix', name: 'Existing Mix', tracks: ['local_1'] }
        ],
        generateId: () => 'playlist_generated'
    });

    assert.equal(result.migratedTracks.length, 1);
    assert.equal(result.migratedTracks[0].id, 'yt_alpha');
    assert.equal(result.migratedTracks[0].resumePosition, 0);
    assert.equal(result.migratedTracks[0].resumeUpdatedAt, 0);

    assert.equal(result.migratedPlaylists.length, 1);
    assert.equal(result.migratedPlaylists[0].id, 'playlist_generated');
    assert.deepEqual(result.migratedPlaylists[0].tracks, ['yt_alpha']);

    assert.deepEqual(result.nextOnlineState.library, []);
    assert.deepEqual(result.nextOnlineState.playlists, []);
    assert.equal(result.nextOnlineState.activePlaylistId, null);
    assert.equal(result.nextOnlineState.currentPlaylistContextId, null);
    assert.equal(result.nextOnlineState.currentTime, 0);
    assert.equal(result.nextOnlineState.isPlaying, false);
    assert.equal(result.nextOnlineState.playbackContext, 'search');
    assert.deepEqual(result.nextOnlineState.queue, ['yt_alpha', 'missing']);
    assert.equal(result.nextOnlineState.queueIndex, 1);
    assert.equal(result.nextOnlineState.currentTrack.resumePosition, 0);
    assert.equal(result.nextOnlineState.currentTrack.resumeUpdatedAt, 0);
});

test('migrateLegacyOnlineMusicData keeps playlist ids when there is no collision', () => {
    const result = migrateLegacyOnlineMusicData({
        onlineMusicState: {
            library: [
                { id: 'yt_beta', title: 'Beta', artist: 'Artist B' }
            ],
            playlists: [
                { id: 'roadtrip', name: 'Roadtrip', tracks: ['yt_beta'] }
            ]
        },
        existingPlaylists: [
            { id: 'focus', name: 'Focus', tracks: [] }
        ]
    });

    assert.equal(result.migratedPlaylists.length, 1);
    assert.equal(result.migratedPlaylists[0].id, 'roadtrip');
    assert.deepEqual(result.migratedPlaylists[0].tracks, ['yt_beta']);
});

test('shouldIgnoreOnlineMusicTransportEvent ignores stale or local handoff events', () => {
    assert.equal(shouldIgnoreOnlineMusicTransportEvent({
        currentPlaybackSource: 'local',
        currentTrackId: 'yt_alpha',
        currentSessionId: 4,
        latestSessionId: 4,
        expectedVideoId: 'alpha',
        playerVideoId: 'alpha'
    }), true);

    assert.equal(shouldIgnoreOnlineMusicTransportEvent({
        currentPlaybackSource: 'online-music',
        currentTrackId: 'yt_alpha',
        currentSessionId: 4,
        latestSessionId: 5,
        expectedVideoId: 'alpha',
        playerVideoId: 'alpha'
    }), true);

    assert.equal(shouldIgnoreOnlineMusicTransportEvent({
        currentPlaybackSource: 'online-music',
        currentTrackId: 'yt_beta',
        currentSessionId: 6,
        latestSessionId: 6,
        expectedVideoId: 'beta',
        playerVideoId: 'alpha'
    }), true);

    assert.equal(shouldIgnoreOnlineMusicTransportEvent({
        currentPlaybackSource: 'online-music',
        currentTrackId: 'yt_beta',
        currentSessionId: 7,
        latestSessionId: 7,
        expectedVideoId: 'beta',
        playerVideoId: 'beta'
    }), false);
});

test('isStaleOnlineMusicPlaybackAttempt rejects missing or superseded attempts', () => {
    assert.equal(isStaleOnlineMusicPlaybackAttempt({
        attemptId: 0,
        latestId: 1,
        attemptTrackId: 'yt_alpha',
        latestTrackId: 'yt_alpha'
    }), true);

    assert.equal(isStaleOnlineMusicPlaybackAttempt({
        attemptId: 2,
        latestId: 3,
        attemptTrackId: 'yt_alpha',
        latestTrackId: 'yt_alpha'
    }), true);

    assert.equal(isStaleOnlineMusicPlaybackAttempt({
        attemptId: 4,
        latestId: 4,
        attemptTrackId: 'yt_alpha',
        latestTrackId: 'yt_beta'
    }), true);

    assert.equal(isStaleOnlineMusicPlaybackAttempt({
        attemptId: 5,
        latestId: 5,
        attemptTrackId: 'yt_gamma',
        latestTrackId: 'yt_gamma'
    }), false);
});

test('classifyOnlineMusicRelease groups release-like playlists and filters obvious non-release collections', () => {
    assert.deepEqual(classifyOnlineMusicRelease({
        title: 'Future Nostalgia (Album)',
        itemCount: 3
    }), { include: true, kind: 'album' });

    assert.deepEqual(classifyOnlineMusicRelease({
        title: 'Fortnight (Single)',
        itemCount: 1
    }), { include: true, kind: 'single-ep' });

    assert.deepEqual(classifyOnlineMusicRelease({
        title: 'Popular uploads',
        itemCount: 50
    }), { include: false, kind: '' });
});

test('mergeUniqueOnlineMusicTracks de-duplicates by track id and keeps newest releases first', () => {
    const merged = mergeUniqueOnlineMusicTracks([
        { id: 'yt_old', publishedAt: '2021-01-01T00:00:00Z' },
        { id: 'yt_new', publishedAt: '2024-01-01T00:00:00Z' },
        { id: 'yt_old', publishedAt: '2025-01-01T00:00:00Z' }
    ]);

    assert.deepEqual(merged.map((/** @type {any} */ track) => track.id), ['yt_new', 'yt_old']);
});

test('uniqueOnlineMusicTracksInDeclaredOrder keeps first-seen album order while de-duplicating', () => {
    const ordered = uniqueOnlineMusicTracksInDeclaredOrder([
        { id: 'yt_track_3' },
        { id: 'yt_track_1' },
        { id: 'yt_track_3' },
        { id: 'yt_track_2' }
    ]);

    assert.deepEqual(ordered.map((/** @type {any} */ track) => track.id), ['yt_track_3', 'yt_track_1', 'yt_track_2']);
});

test('saved online library index only marks explicitly saved tracks', () => {
    const index = buildSavedOnlineMusicLibraryIndex([
        { id: 'yt_alpha', title: 'Alpha' }
    ]);

    assert.equal(lookupSavedOnlineMusicLibraryEntry(index, 'yt_alpha')?.title, 'Alpha');
    assert.equal(lookupSavedOnlineMusicLibraryEntry(index, 'yt_beta'), null);

    const nextIndex = upsertSavedOnlineMusicLibraryEntry(index, { id: 'yt_beta', title: 'Beta', playCount: 3 });
    assert.equal(lookupSavedOnlineMusicLibraryEntry(nextIndex, 'yt_beta')?.playCount, 3);

    const prunedIndex = removeSavedOnlineMusicLibraryEntries(nextIndex, ['yt_alpha']);
    assert.equal(lookupSavedOnlineMusicLibraryEntry(prunedIndex, 'yt_alpha'), null);
    assert.equal(lookupSavedOnlineMusicLibraryEntry(prunedIndex, 'yt_beta')?.title, 'Beta');
});

test('online queue entries can reconstruct playable track snapshots without main-library state', () => {
    const resolved = buildOnlineMusicTrackFromQueueEntry({
        sourceKind: 'online',
        trackId: 'yt_alpha',
        title: 'Alpha',
        artist: 'Artist A',
        provider: 'youtube',
        videoId: 'abc123',
        trackSnapshot: {
            id: 'yt_alpha',
            title: 'Alpha',
            artist: 'Artist A',
            provider: 'youtube',
            videoId: 'abc123',
            duration: 187
        }
    });

    assert.deepEqual(resolved, {
        id: 'yt_alpha',
        title: 'Alpha',
        artist: 'Artist A',
        provider: 'youtube',
        videoId: 'abc123',
        duration: 187,
        source: 'online-music',
        type: 'audio',
        resumePosition: 0,
        resumeUpdatedAt: 0
    });
});

test('scoreOnlineMusicTrackCandidate favors the closest title and artist match', () => {
    const exactish = scoreOnlineMusicTrackCandidate({
        targetTitle: 'The Black Dog',
        targetArtist: 'Taylor Swift',
        releaseTitle: 'The Tortured Poets Department',
        candidateTitle: 'Taylor Swift - The Black Dog (Official Audio)',
        candidateArtist: 'Taylor Swift',
        candidateChannel: 'Taylor Swift'
    });
    const mismatch = scoreOnlineMusicTrackCandidate({
        targetTitle: 'The Black Dog',
        targetArtist: 'Taylor Swift',
        releaseTitle: 'The Tortured Poets Department',
        candidateTitle: 'Black Dog',
        candidateArtist: 'Led Zeppelin',
        candidateChannel: 'Led Zeppelin - Topic'
    });

    assert.ok(exactish > mismatch);
    assert.ok(exactish >= 120);
});

test('scoreOnlineMusicSearchResultForQuery prefers exact title and artist matches over popular wrong-title matches', () => {
    const exact = scoreOnlineMusicSearchResultForQuery({
        query: 'Blue Monday New Order',
        title: 'New Order - Blue Monday (Official Music Video)',
        artist: 'New Order',
        channelTitle: 'New Order',
        viewCount: 125000000
    });
    const wrongTitle = scoreOnlineMusicSearchResultForQuery({
        query: 'Blue Monday New Order',
        title: 'Maroon 5 - Monday Morning',
        artist: 'Maroon 5',
        channelTitle: 'Maroon 5',
        viewCount: 300000000
    });

    assert.ok(exact > wrongTitle);
    assert.ok(exact >= 180);
    assert.ok(wrongTitle < 70);
});

test('scoreOnlineMusicSearchResultForQuery does not let artist-only matches win song and artist searches', () => {
    const exactSong = scoreOnlineMusicSearchResultForQuery({
        query: 'Radiohead Creep',
        title: 'Radiohead - Creep',
        artist: 'Radiohead',
        channelTitle: 'Radiohead'
    });
    const artistOnly = scoreOnlineMusicSearchResultForQuery({
        query: 'Radiohead Creep',
        title: 'Radiohead - Karma Police',
        artist: 'Radiohead',
        channelTitle: 'Radiohead'
    });

    assert.ok(exactSong > artistOnly);
    assert.ok(exactSong >= 180);
    assert.ok(artistOnly < 78);
});

test('scoreOnlineMusicSearchResultForQuery rejects near-title substitutions for title-only searches', () => {
    const exactTitle = scoreOnlineMusicSearchResultForQuery({
        query: 'Who Is It',
        title: 'Michael Jackson - Who Is It',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson'
    });
    const wrongQuestionWord = scoreOnlineMusicSearchResultForQuery({
        query: 'Who Is It',
        title: 'Doechii - What It Is (Solo Version) (Lyrics)',
        artist: 'Rap Samurai',
        channelTitle: 'Rap Samurai'
    });
    const reorderedWords = scoreOnlineMusicSearchResultForQuery({
        query: 'Who Is It',
        title: 'Who It Is (ft. Lil Wayne, Kevin Gates, Kodak Black)',
        artist: 'Crybaby Cash Lives',
        channelTitle: 'Crybaby Cash Lives'
    });

    assert.ok(exactTitle >= 180);
    assert.ok(wrongQuestionWord < 78);
    assert.ok(reorderedWords < 78);
});

test('scoreOnlineMusicSearchResultForQuery rejects exact titles when supplied artist tokens are missing', () => {
    const intended = scoreOnlineMusicSearchResultForQuery({
        query: 'Who Is It Michael Jackson',
        title: 'Michael Jackson - Who Is It',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson'
    });
    const wrongArtist = scoreOnlineMusicSearchResultForQuery({
        query: 'Who Is It Michael Jackson',
        title: 'Who Is It',
        artist: 'Jordan Adetunji',
        channelTitle: 'Jordan Adetunji'
    });

    assert.ok(intended >= 180);
    assert.ok(wrongArtist < 78);
});

test('scoreOnlineMusicSearchResultForQuery does not promote one-word collisions for two-word titles', () => {
    const intended = scoreOnlineMusicSearchResultForQuery({
        query: 'Dirty Diana',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson'
    });
    const partialTitle = scoreOnlineMusicSearchResultForQuery({
        query: 'Dirty Diana',
        title: 'Diana',
        artist: 'Unknown Artist',
        channelTitle: 'Unknown Artist',
        releaseTitle: 'Dirty Collection'
    });

    assert.ok(intended >= 180);
    assert.ok(partialTitle < 30);
});

test('scoreOnlineMusicSearchResultForQuery preserves complete artist-only searches', () => {
    const multiwordArtist = scoreOnlineMusicSearchResultForQuery({
        query: 'Daft Punk',
        title: 'Get Lucky',
        artist: 'Daft Punk',
        channelTitle: 'Daft Punk'
    });
    const oneWordArtist = scoreOnlineMusicSearchResultForQuery({
        query: 'Beyoncé',
        title: 'Halo',
        artist: 'Beyoncé',
        channelTitle: 'Beyoncé'
    });

    assert.ok(multiwordArtist >= 180);
    assert.ok(oneWordArtist >= 180);
});

test('explicit song and artist searches require one coherent identity match', () => {
    const correct = {
        query: 'Dirty Diana by Michael Jackson',
        provider: 'itunes',
        catalogProvider: 'itunes',
        title: 'Dirty Diana',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson',
        releaseTitle: 'Bad'
    };
    const wrongArtist = {
        ...correct,
        artist: 'Tribute Band',
        channelTitle: 'Tribute Band',
        releaseTitle: 'The Music of Michael Jackson'
    };

    assert.ok(scoreOnlineMusicSearchResultForQuery(correct) >= 180);
    assert.equal(scoreOnlineMusicSearchResultForQuery(wrongArtist), 0);
    assert.equal(classifyOnlineMusicSearchResultEligibility(correct).include, true);
    assert.deepEqual(classifyOnlineMusicSearchResultEligibility(wrongArtist), {
        include: false,
        kind: '',
        score: -840,
        reason: 'explicit-artist-mismatch'
    });
});

test('isLikelyShortFormOnlineMusicResult rejects shorts without blocking normal official audio', () => {
    assert.equal(isLikelyShortFormOnlineMusicResult({
        title: 'Blue Monday #shorts',
        duration: 54,
        canonicalUrl: 'https://www.youtube.com/shorts/abc123'
    }), true);

    assert.equal(isLikelyShortFormOnlineMusicResult({
        title: 'New Order - Blue Monday (Official Audio)',
        duration: 240,
        canonicalUrl: 'https://www.youtube.com/watch?v=def456'
    }), false);
});

test('classifyOnlineMusicSearchResultEligibility allows official artist channel matches', () => {
    const result = classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It Michael Jackson',
        provider: 'youtube',
        videoId: 'official123',
        title: 'Michael Jackson - Who Is It (Official Audio)',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson',
        duration: 383
    });

    assert.equal(result.include, true);
    assert.match(result.kind, /official|vevo|topic/);
});

test('classifyOnlineMusicSearchResultEligibility rejects official music videos for playback', () => {
    const result = classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It Michael Jackson',
        provider: 'youtube',
        videoId: 'musicVideo123',
        title: 'Michael Jackson - Who Is It (Official Music Video)',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson',
        duration: 383
    });

    assert.equal(result.include, false);
    assert.equal(result.reason, 'music-video');
});

test('classifyOnlineMusicSearchResultEligibility allows Topic and VEVO sources', () => {
    assert.equal(classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It Michael Jackson',
        provider: 'youtube',
        videoId: 'topic123',
        title: 'Who Is It',
        artist: 'Michael Jackson - Topic',
        channelTitle: 'Michael Jackson - Topic',
        description: 'Provided to YouTube by Epic',
        duration: 383
    }).include, true);

    assert.equal(classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It Michael Jackson',
        provider: 'youtube',
        videoId: 'vevo123',
        title: 'Michael Jackson - Who Is It',
        artist: 'MichaelJacksonVEVO',
        channelTitle: 'MichaelJacksonVEVO',
        duration: 383
    }).include, true);
});

test('classifyOnlineMusicSearchResultEligibility allows exact lyrics videos from non-official channels', () => {
    const result = classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It Michael Jackson',
        provider: 'youtube',
        videoId: 'lyrics123',
        title: 'Michael Jackson - Who Is It (Lyrics)',
        artist: 'Lyrics Channel',
        channelTitle: 'Lyrics Channel',
        duration: 383
    });

    assert.equal(result.include, true);
    assert.equal(result.kind, 'lyrics-video');
});

test('classifyOnlineMusicSearchResultEligibility rejects random uploads even with exact titles', () => {
    const result = classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It',
        provider: 'youtube',
        videoId: 'random123',
        title: 'Who Is It',
        artist: 'Random Uploads',
        channelTitle: 'Random Uploads',
        duration: 383
    });

    assert.equal(result.include, false);
    assert.equal(result.reason, 'unverified-youtube-source');
});

test('classifyOnlineMusicSearchResultEligibility trusts YouTube Music search surface matches', () => {
    const titleResult = classifyOnlineMusicSearchResultEligibility({
        query: 'Blue Monday',
        provider: 'youtube',
        sourceSurface: 'youtube-music',
        resolver: 'yt-dlp-ytmsearch',
        videoId: 'ytmTitle123',
        title: 'Blue Monday',
        artist: 'New Order',
        channelTitle: 'New Order',
        duration: 448
    });
    const artistResult = classifyOnlineMusicSearchResultEligibility({
        query: 'New Order',
        provider: 'youtube',
        sourceSurface: 'youtube-music',
        resolver: 'yt-dlp-ytmsearch',
        videoId: 'ytmArtist123',
        title: 'Age of Consent',
        artist: 'New Order',
        channelTitle: 'New Order',
        duration: 315
    });

    assert.equal(titleResult.include, true);
    assert.equal(titleResult.reason, 'youtube-music-source');
    assert.equal(artistResult.include, true);
    assert.equal(artistResult.reason, 'youtube-music-source');
});

test('classifyOnlineMusicSearchResultEligibility still rejects noisy modifiers from YouTube Music search', () => {
    const result = classifyOnlineMusicSearchResultEligibility({
        query: 'Blue Monday New Order',
        provider: 'youtube',
        sourceSurface: 'youtube-music',
        resolver: 'yt-dlp-ytmsearch',
        videoId: 'ytmCover123',
        title: 'New Order - Blue Monday (Cover)',
        artist: 'Cover Channel',
        channelTitle: 'Cover Channel',
        duration: 300
    });
    assert.equal(result.include, false);
    assert.equal(result.reason, 'non-song-modifier');
});

test('classifyOnlineMusicSearchResultEligibility filters unrequested catalog variants', () => {
    for (const title of [
        'Dirty Diana (Cover)',
        'Dirty Diana (Acoustic Cover)',
        'Dirty Diana (Instrumental Slowed)',
        'Dirty Diana (Remix)',
        'Dirty Diana (Live)'
    ]) {
        const result = classifyOnlineMusicSearchResultEligibility({
            query: 'Dirty Diana',
            provider: 'itunes',
            catalogProvider: 'itunes',
            title,
            artist: 'Unknown Artist',
            channelTitle: 'Unknown Artist',
            duration: 240
        });
        assert.equal(result.include, false, title);
        assert.equal(result.reason, 'non-song-modifier', title);
    }
});

test('classifyOnlineMusicSearchResultEligibility preserves requested remix and live catalog searches', () => {
    const remix = classifyOnlineMusicSearchResultEligibility({
        query: 'Dirty Diana remix',
        provider: 'deezer',
        catalogProvider: 'deezer',
        title: 'Dirty Diana (Remix)',
        artist: 'Remix Artist',
        channelTitle: 'Remix Artist',
        duration: 240
    });
    const live = classifyOnlineMusicSearchResultEligibility({
        query: 'Dirty Diana live',
        provider: 'itunes',
        catalogProvider: 'itunes',
        title: 'Dirty Diana (Live)',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson',
        duration: 240
    });
    const canonicalLiveTitle = classifyOnlineMusicSearchResultEligibility({
        query: 'Oasis',
        provider: 'itunes',
        catalogProvider: 'itunes',
        title: 'Live Forever',
        artist: 'Oasis',
        channelTitle: 'Oasis',
        duration: 276
    });

    assert.equal(remix.include, true);
    assert.equal(live.include, true);
    assert.equal(canonicalLiveTitle.include, true);
});

test('classifyOnlineMusicSearchResultEligibility keeps structured catalog matches trusted when playback is YouTube-backed', () => {
    const result = classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It',
        provider: 'itunes',
        catalogProvider: 'itunes',
        videoId: 'mjOfficialPlayback',
        title: 'Who Is It',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson',
        duration: 383
    });

    assert.equal(result.include, true);
    assert.equal(result.kind, 'catalog');
});

test('classifyOnlineMusicSearchResultEligibility rejects covers, karaoke, remixes, and near-title lyrics', () => {
    assert.equal(classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It Michael Jackson',
        provider: 'youtube',
        videoId: 'cover123',
        title: 'Michael Jackson - Who Is It (Cover)',
        artist: 'Cover Channel',
        channelTitle: 'Cover Channel',
        duration: 383
    }).include, false);

    assert.equal(classifyOnlineMusicSearchResultEligibility({
        query: 'Who Is It',
        provider: 'youtube',
        videoId: 'wronglyrics123',
        title: 'Doechii - What It Is (Solo Version) (Lyrics)',
        artist: 'Rap Samurai',
        channelTitle: 'Rap Samurai',
        duration: 190
    }).include, false);
});

test('isLikelyTitleOnlyOnlineMusicSearchResult identifies same-title collisions without treating artist searches as title-only', () => {
    assert.equal(isLikelyTitleOnlyOnlineMusicSearchResult({
        query: 'Who Is It',
        title: 'Michael Jackson - Who Is It (Official Video)',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson'
    }), true);

    assert.equal(isLikelyTitleOnlyOnlineMusicSearchResult({
        query: 'Who Is It',
        title: 'björk - who is it',
        artist: 'björk',
        channelTitle: 'björk'
    }), true);

    assert.equal(isLikelyTitleOnlyOnlineMusicSearchResult({
        query: 'Who Is It Michael Jackson',
        title: 'Michael Jackson - Who Is It (Official Video)',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson'
    }), false);

    assert.equal(isLikelyTitleOnlyOnlineMusicSearchResult({
        query: 'Who Is It by Michael Jackson',
        title: 'Michael Jackson - Who Is It (Official Video)',
        artist: 'Michael Jackson',
        channelTitle: 'Michael Jackson'
    }), false);
});

test('sanitizeProviderErrorMessage strips embedded html from provider responses', () => {
    const message = 'The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.';
    assert.equal(
        sanitizeProviderErrorMessage(message),
        'The request cannot be completed because you have exceeded your quota.'
    );
});

test('classifyYouTubeApiError recognizes quota exhaustion and returns a user-safe message', () => {
    const details = classifyYouTubeApiError('The request cannot be completed because you have exceeded your <a href="/youtube/v3/getting-started#quota">quota</a>.');
    assert.equal(details.isQuota, true);
    assert.equal(details.code, 'quotaExceeded');
    assert.match(details.userMessage, /temporarily unavailable/i);
    assert.equal(details.message, 'The request cannot be completed because you have exceeded your quota.');
});

test('classifyYouTubeApiError recognizes referer-restricted keys and disables discovery retries', () => {
    const details = classifyYouTubeApiError('Requests from referer http://127.0.0.1:4173/ are blocked.');
    assert.equal(details.isQuota, false);
    assert.equal(details.isMissingKey, true);
    assert.equal(details.isRefererBlocked, true);
    assert.equal(details.code, 'apiKeyRefererBlocked');
    assert.match(details.userMessage, /does not allow requests from this app origin/i);
});

test('projectOnlineQueueToAudioState maps ordered online queue to upcoming audio queue items', () => {
    const projected = projectOnlineQueueToAudioState({
        queue: ['yt_1', 'yt_2', 'yt_3', 'yt_4'],
        queueIndex: 1,
        currentTrackId: 'yt_2',
        queueMode: 'ordered'
    });

    assert.equal(projected.isShuffle, false);
    assert.equal(projected.queueSource, 'manual');
    assert.deepEqual(projected.queue, ['yt_3', 'yt_4']);
    assert.deepEqual(projected.shuffleQueue, []);
    assert.equal(projected.shuffleIndex, -1);
});

test('projectOnlineQueueToAudioState keeps upcoming ordered tracks when the first online track starts playback', () => {
    const projected = projectOnlineQueueToAudioState({
        queue: ['yt_1', 'yt_2', 'yt_3'],
        queueIndex: 0,
        currentTrackId: 'yt_1',
        queueMode: 'ordered'
    });

    assert.equal(projected.isShuffle, false);
    assert.equal(projected.queueSource, 'manual');
    assert.deepEqual(projected.queue, ['yt_2', 'yt_3']);
    assert.deepEqual(projected.shuffleQueue, []);
    assert.equal(projected.shuffleIndex, -1);
});

test('projectOnlineQueueToAudioState preserves shuffled queue order and current index', () => {
    const projected = projectOnlineQueueToAudioState({
        queue: ['yt_a', 'yt_c', 'yt_b', 'yt_d'],
        queueIndex: 2,
        currentTrackId: 'yt_b',
        queueMode: 'shuffle'
    });

    assert.equal(projected.isShuffle, true);
    assert.equal(projected.queueSource, 'manual');
    assert.deepEqual(projected.queue, []);
    assert.deepEqual(projected.shuffleQueue, ['yt_a', 'yt_c', 'yt_b', 'yt_d']);
    assert.equal(projected.shuffleIndex, 2);
});

test('resolveOnlineQueueStep follows repeat-none, repeat-all, and repeat-one semantics', () => {
    assert.deepEqual(resolveOnlineQueueStep({
        queue: ['yt_1', 'yt_2', 'yt_3'],
        queueIndex: 1,
        currentTrackId: 'yt_2',
        offset: 1,
        repeatMode: 'none'
    }), {
        action: 'play',
        nextTrackId: 'yt_3',
        nextIndex: 2
    });

    assert.deepEqual(resolveOnlineQueueStep({
        queue: ['yt_1', 'yt_2', 'yt_3'],
        queueIndex: 2,
        currentTrackId: 'yt_3',
        offset: 1,
        repeatMode: 'all'
    }), {
        action: 'play',
        nextTrackId: 'yt_1',
        nextIndex: 0
    });

    assert.deepEqual(resolveOnlineQueueStep({
        queue: ['yt_1', 'yt_2', 'yt_3'],
        queueIndex: 1,
        currentTrackId: 'yt_2',
        offset: 1,
        repeatMode: 'one'
    }), {
        action: 'restart',
        nextTrackId: 'yt_2',
        nextIndex: 1
    });
});

test('resolveOnlineQueueStep restarts current track when pressing previous at the start without repeat-all', () => {
    assert.deepEqual(resolveOnlineQueueStep({
        queue: ['yt_1', 'yt_2', 'yt_3'],
        queueIndex: 0,
        currentTrackId: 'yt_1',
        offset: -1,
        repeatMode: 'none'
    }), {
        action: 'restart',
        nextTrackId: 'yt_1',
        nextIndex: 0
    });
});
