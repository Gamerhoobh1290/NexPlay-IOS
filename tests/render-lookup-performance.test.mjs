// @ts-nocheck -- Legacy rendering helpers run in a focused VM context.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rendering = fs.readFileSync(new URL('../js/legacy/rendering.js', import.meta.url), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing source marker: ${startMarker}`);
    assert.ok(end > start, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
}

const lookupFunctions = sliceBetween(
    rendering,
    'function buildFirstTrackByIdLookup',
    'function formatTrackPlayCountLabel'
);
const importedPlaylistFunction = sliceBetween(
    rendering,
    'function isImportedOnlinePlaylist',
    'function getImportedPlaylistSourceLabel'
);

function launchLookupHarness(tracks = []) {
    const sandbox = { state: { tracks }, globalThis: null };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`
        ${lookupFunctions}
        ${importedPlaylistFunction}
        globalThis.renderLookupApi = {
            buildFirstTrackByIdLookup,
            resolveTracksById,
            buildFirstValueIndexLookup,
            isImportedOnlinePlaylist
        };
    `, sandbox);
    return sandbox.renderLookupApi;
}

function resolveWithLegacyFind(trackIds, tracks) {
    return trackIds
        .map((trackId) => tracks.find((track) => track && track.id === trackId))
        .filter(Boolean);
}

test('track lookup preserves first-match, missing-id, duplicate-id, and requested ordering semantics', () => {
    const firstDuplicate = { id: 'duplicate', title: 'First' };
    const secondDuplicate = { id: 'duplicate', title: 'Second' };
    const tracks = [
        { id: 'one', title: 'One' },
        firstDuplicate,
        null,
        secondDuplicate,
        { id: 'two', title: 'Two' }
    ];
    const requestedIds = ['two', 'missing', 'duplicate', 'one', 'duplicate'];
    const api = launchLookupHarness(tracks);
    const lookup = api.buildFirstTrackByIdLookup(tracks);
    const resolved = Array.from(api.resolveTracksById(requestedIds, lookup));

    assert.deepEqual(resolved, resolveWithLegacyFind(requestedIds, tracks));
    assert.equal(resolved[1], firstDuplicate, 'duplicate ids must keep Array.find first-match behavior');
    assert.equal(resolved[3], firstDuplicate, 'repeated requested ids must remain repeated in output');
});

test('per-pass lookup bounds track-id property reads to one per library track', () => {
    const trackCount = 2000;
    const requestedCount = 400;
    let idReads = 0;
    const tracks = Array.from({ length: trackCount }, (_, index) => {
        const track = { title: `Track ${index}` };
        Object.defineProperty(track, 'id', {
            enumerable: true,
            get() {
                idReads += 1;
                return `track-${index}`;
            }
        });
        return track;
    });
    const requestedIds = Array.from(
        { length: requestedCount },
        (_, index) => `track-${trackCount - requestedCount + index}`
    );
    const api = launchLookupHarness(tracks);

    idReads = 0;
    const lookup = api.buildFirstTrackByIdLookup(tracks);
    const resolved = Array.from(api.resolveTracksById(requestedIds, lookup));
    const indexedReads = idReads;

    idReads = 0;
    const legacyResolved = resolveWithLegacyFind(requestedIds, tracks);
    const legacyReads = idReads;

    assert.deepEqual(resolved, legacyResolved);
    assert.equal(indexedReads, trackCount, 'lookup construction should inspect each track id exactly once');
    assert.ok(legacyReads > indexedReads * 100, `expected legacy scans (${legacyReads}) to greatly exceed indexed reads (${indexedReads})`);
});

test('first-index lookup preserves Array.indexOf behavior for duplicate playlist ids', () => {
    const values = ['alpha', 'duplicate', 'beta', 'duplicate'];
    const api = launchLookupHarness();
    const lookup = api.buildFirstValueIndexLookup(values);

    for (const value of ['alpha', 'duplicate', 'beta', 'missing']) {
        assert.equal(lookup.get(value) ?? -1, values.indexOf(value));
    }
});

test('imported-playlist classification uses first duplicate ids exactly like the former scan', () => {
    const tracks = [
        { id: 'duplicate', source: 'online-music' },
        { id: 'duplicate', source: 'local' },
        { id: 'online', source: 'online-music' }
    ];
    const api = launchLookupHarness(tracks);
    const lookup = api.buildFirstTrackByIdLookup(tracks);

    assert.equal(api.isImportedOnlinePlaylist({ tracks: ['duplicate', 'online'] }, lookup), true);
    assert.equal(api.isImportedOnlinePlaylist({ tracks: ['duplicate', 'missing'] }, lookup), false);
});

test('playlist, history, smart recommendation, and memory renders reuse one pass-local lookup', () => {
    const playlists = sliceBetween(rendering, 'function renderPlaylists', 'function openPlaylist');
    const history = sliceBetween(rendering, 'function renderHistory', 'function clearHistory');
    const smartNext = sliceBetween(rendering, 'function getSmartRecommendedNextData', 'function getMusicGamesState');
    const memory = sliceBetween(rendering, 'function renderMusicGameMemoryPlaylistRuntime', 'function syncMemoryPlaylistDom');

    assert.match(playlists, /const trackById = playlistTrackIds\.length[\s\S]*?buildFirstTrackByIdLookup/);
    assert.match(playlists, /resolveTracksById\(playlistTrackIds, trackById\)/);
    assert.match(playlists, /buildFirstValueIndexLookup\(playlistTrackIds\)/);
    assert.doesNotMatch(playlists, /state\.tracks\.find\(t => t\.id === id\)/);
    assert.doesNotMatch(playlists, /playlist\.tracks\.indexOf/);

    assert.match(history, /resolveTracksById\(historyIds, trackById\)/);
    assert.doesNotMatch(history, /state\.tracks\.find/);

    assert.match(smartNext, /resolveTracksById\(radioQueueIds, trackById\)/);
    assert.doesNotMatch(smartNext, /state\.tracks[\s\S]*?\.find/);

    assert.match(memory, /resolveTracksById\(memory\.poolTrackIds, trackById\)/);
    assert.match(memory, /trackById\.get\(enteredTrackId\)/);
    assert.doesNotMatch(memory, /tracks\.find/);
});
