import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const smartPlaylistsPath = new URL('../js/legacy/smart-playlists.js', import.meta.url);
const smartPlaylistsSource = fs.readFileSync(smartPlaylistsPath, 'utf8');
const lookupStart = smartPlaylistsSource.indexOf('function resolveLibraryTrackIds');
const lookupEnd = smartPlaylistsSource.indexOf('function refreshLiveViews', lookupStart);

assert.notEqual(lookupStart, -1, 'resolveLibraryTrackIds must remain available to the focused test');
assert.notEqual(lookupEnd, -1, 'the library filtering function boundary must remain available');

const focusedSource = smartPlaylistsSource.slice(lookupStart, lookupEnd);

function createState(overrides = {}) {
    return {
        activeTab: 'all',
        activePlaylistId: null,
        playHistory: [],
        playlists: [],
        searchQuery: '',
        sortDirection: 'asc',
        sortType: 'date',
        tracks: [],
        ...overrides
    };
}

/**
 * @param {Record<string, any>} state
 * @param {(tracks: any[]) => any[]} [filterOnlineTracksForLibraryBrowse]
 * @returns {Record<string, (...args: any[]) => any>}
 */
function loadLibraryFunctions(state, filterOnlineTracksForLibraryBrowse = tracks => tracks) {
    const context = vm.createContext({
        filterOnlineTracksForLibraryBrowse,
        state
    });

    vm.runInContext(`${focusedSource}\nthis.libraryFunctions = { getFilteredTracks, getQueueTracks, resolveLibraryTrackIds };`, context);
    return context.libraryFunctions;
}

/** @param {any[]} tracks */
function idsOf(tracks) {
    return Array.from(tracks, track => track.id);
}

test('history lookup preserves first duplicate, requested duplicates, missing filtering, strict IDs, and order', () => {
    const firstA = { id: 'a', title: 'First A' };
    const duplicateA = { id: 'a', title: 'Duplicate A' };
    const numericOne = { id: 1, title: 'Numeric one' };
    const stringOne = { id: '1', title: 'String one' };
    const nanTrack = { id: Number.NaN, title: 'NaN' };
    const state = createState({
        activeTab: 'history',
        playHistory: ['a', 'missing', 'a', 1, '1', Number.NaN],
        tracks: [firstA, duplicateA, numericOne, stringOne, nanTrack]
    });
    const { getFilteredTracks } = loadLibraryFunctions(state);

    const result = getFilteredTracks();

    assert.deepEqual(Array.from(result), [firstA, firstA, numericOne, stringOne]);
});

test('playlist queue lookup preserves the playlist sequence and first matching track objects', () => {
    const firstA = { id: 'a', title: 'First A', type: 'audio' };
    const duplicateA = { id: 'a', title: 'Duplicate A', type: 'audio' };
    const videoB = { id: 'b', title: 'Video B', type: 'video' };
    const state = createState({
        activePlaylistId: 'playlist-1',
        activeTab: 'playlists',
        playlists: [{ id: 'playlist-1', tracks: ['b', 'a', 'unknown', 'b'] }],
        tracks: [firstA, duplicateA, videoB]
    });
    const { getQueueTracks } = loadLibraryFunctions(state);

    assert.deepEqual(Array.from(getQueueTracks()), [videoB, firstA, videoB]);
});

test('empty and missing ID lists do not scan the track library', () => {
    let idReads = 0;
    const track = { title: 'Track' };
    Object.defineProperty(track, 'id', {
        get() {
            idReads += 1;
            return 'track-1';
        }
    });
    const state = createState({ tracks: [track] });
    const { resolveLibraryTrackIds } = loadLibraryFunctions(state);

    assert.deepEqual(Array.from(resolveLibraryTrackIds([])), []);
    assert.deepEqual(Array.from(resolveLibraryTrackIds(undefined)), []);
    assert.equal(idReads, 0);
});

test('one pass replaces repeated full-library scans for large history lists', () => {
    const trackCount = 2000;
    const requestedIds = Array.from({ length: 400 }, (_, index) => `track-${1600 + index}`);
    const legacyReads = { count: 0 };
    const optimizedReads = { count: 0 };

    /**
     * @param {{ count: number }} counter
     * @returns {Array<{ id: string, index: number, title: string }>}
     */
    function makeTracks(counter) {
        return Array.from({ length: trackCount }, (_, index) => {
            const track = { id: `track-${index}`, index, title: `Track ${index}` };
            Object.defineProperty(track, 'id', {
                get() {
                    counter.count += 1;
                    return `track-${index}`;
                }
            });
            return track;
        });
    }

    const legacyTracks = makeTracks(legacyReads);
    const optimizedTracks = makeTracks(optimizedReads);
    const legacyResult = requestedIds
        .map(id => legacyTracks.find(track => track.id === id))
        .filter(track => track !== undefined);
    const state = createState({ tracks: optimizedTracks });
    const { resolveLibraryTrackIds } = loadLibraryFunctions(state);
    const optimizedResult = resolveLibraryTrackIds(requestedIds);

    assert.deepEqual(Array.from(optimizedResult, track => track.index), legacyResult.map(track => track.index));
    assert.equal(optimizedReads.count, trackCount, 'optimized lookup should inspect each library ID once');
    assert.equal(legacyReads.count, 720200, 'legacy lookup characterization should remain deterministic');
});

test('search matching remains case-insensitive and preserves title-before-artist short circuiting', () => {
    let matchingTitleArtistReads = 0;
    const matchingTitle = { id: 'title', title: 'ALPHA title' };
    Object.defineProperty(matchingTitle, 'artist', {
        get() {
            matchingTitleArtistReads += 1;
            return 'Should not be needed';
        }
    });
    const matchingArtist = { id: 'artist', title: 'Different', artist: 'The Alpha Artist' };
    const noMatch = { id: 'none', title: '', artist: 'Beta' };
    const state = createState({
        searchQuery: 'alpha',
        tracks: [matchingTitle, matchingArtist, noMatch]
    });
    const { getFilteredTracks } = loadLibraryFunctions(state);

    assert.deepEqual(idsOf(getFilteredTracks()), ['title', 'artist']);
    assert.equal(matchingTitleArtistReads, 0);
});

test('queue generation still ignores search and retains media-type fallback and sorting behavior', () => {
    const audioB = { addedAt: 2, id: 'audio-b', title: 'B', type: 'audio' };
    const audioA = { addedAt: 1, id: 'audio-a', title: 'A', type: 'audio' };
    const video = { addedAt: 3, id: 'video', title: 'Video', type: 'video' };
    const state = createState({
        activeTab: 'history',
        playHistory: ['video'],
        searchQuery: 'does-not-match',
        tracks: [audioB, video, audioA]
    });
    const { getQueueTracks } = loadLibraryFunctions(state);

    assert.deepEqual(idsOf(getQueueTracks('audio')), ['audio-b', 'audio-a']);

    state.activeTab = 'all';
    state.sortType = 'name';
    assert.deepEqual(idsOf(getQueueTracks()), ['audio-a', 'audio-b', 'video']);
});

test('library contexts no longer contain repeated state.tracks.find ID scans', () => {
    assert.doesNotMatch(focusedSource, /state\.tracks\.find\s*\(\s*t\s*=>\s*t\.id\s*===\s*id\s*\)/);
    assert.match(focusedSource, /const firstTrackById = new Map\(\)/);
    assert.match(focusedSource, /if \(ids\.length === 0\) return \[\]/);
});
