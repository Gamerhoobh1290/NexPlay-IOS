import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    advance,
    buildShuffleOrder,
    insertPlayNext,
    insertToEnd,
    moveEntry,
    removeEntry,
    rewind,
    upcomingEntries
} = require('../nexplay-next/audio-queue-engine.cjs');

/** @type {(...args: any[]) => any} */
function entry(id, sourceKind = 'local') {
    return {
        id: `entry_${id}`,
        trackId: id,
        sourceKind,
        mediaType: 'audio',
        title: id,
        artist: sourceKind === 'online' ? 'Stream' : 'Library',
        cover: ''
    };
}

test('upcomingEntries returns mixed ordered queue items after the current entry', () => {
    const state = {
        entries: [
            entry('local_1', 'local'),
            entry('yt_alpha', 'online'),
            entry('local_2', 'local'),
            entry('yt_beta', 'online')
        ],
        currentIndex: 1,
        isShuffle: false,
        repeatMode: 'none',
        shuffleOrder: []
    };

    assert.deepEqual(
        upcomingEntries(state).map((/** @type {any} */ item) => item.trackId),
        ['local_2', 'yt_beta']
    );
});

test('a first queued item stays upcoming until playback advances to it', () => {
    const queued = insertToEnd({
        entries: [],
        currentIndex: -1,
        isShuffle: false,
        repeatMode: 'none',
        shuffleOrder: []
    }, entry('local_1', 'local'));

    assert.equal(queued.currentIndex, -1);
    assert.deepEqual(upcomingEntries(queued).map((/** @type {any} */ item) => item.trackId), ['local_1']);

    const next = advance(queued);
    assert.equal(next.action, 'play');
    assert.equal(next.entry.trackId, 'local_1');
    assert.equal(next.state.currentIndex, 0);
});

test('an unsaved online queue item keeps its playback snapshot', () => {
    const onlineEntry = {
        ...entry('itunes_123', 'online'),
        provider: 'itunes',
        trackSnapshot: {
            id: 'itunes_123',
            provider: 'itunes',
            title: 'Queued catalog track',
            canonicalUrl: 'https://music.apple.com/example'
        }
    };
    const queued = insertToEnd({
        entries: [],
        currentIndex: -1,
        isShuffle: false,
        repeatMode: 'none',
        shuffleOrder: []
    }, onlineEntry);

    assert.deepEqual(queued.entries[0].trackSnapshot, onlineEntry.trackSnapshot);
    assert.notEqual(queued.entries[0].trackSnapshot, onlineEntry.trackSnapshot);
});

test('insertPlayNext and insertToEnd keep one mixed deck with the current entry intact', () => {
    const initial = {
        entries: [
            entry('local_1', 'local'),
            entry('yt_alpha', 'online'),
            entry('local_2', 'local')
        ],
        currentIndex: 0,
        isShuffle: false,
        repeatMode: 'none',
        shuffleOrder: []
    };

    const withNext = insertPlayNext(initial, entry('yt_beta', 'online'));
    const withEnd = insertToEnd(withNext, entry('local_3', 'local'));

    assert.deepEqual(
        withEnd.entries.map((/** @type {any} */ item) => item.trackId),
        ['local_1', 'yt_beta', 'yt_alpha', 'local_2', 'local_3']
    );
    assert.equal(withEnd.currentIndex, 0);
});

test('moveEntry and removeEntry preserve the current index around mixed upcoming items', () => {
    const initial = {
        entries: [
            entry('local_1', 'local'),
            entry('yt_alpha', 'online'),
            entry('local_2', 'local'),
            entry('yt_beta', 'online')
        ],
        currentIndex: 0,
        isShuffle: false,
        repeatMode: 'none',
        shuffleOrder: []
    };

    const moved = moveEntry(initial, { fromIndex: 2, toIndex: 0, mode: 'ordered' });
    assert.deepEqual(
        moved.entries.map((/** @type {any} */ item) => item.trackId),
        ['local_1', 'yt_beta', 'yt_alpha', 'local_2']
    );
    assert.equal(moved.currentIndex, 0);

    const removed = removeEntry(moved, 'entry_yt_alpha');
    assert.deepEqual(
        removed.entries.map((/** @type {any} */ item) => item.trackId),
        ['local_1', 'yt_beta', 'local_2']
    );
    assert.equal(removed.currentIndex, 0);
});

test('buildShuffleOrder plus advance and rewind traverse shuffled entries deterministically', () => {
    const entries = [
        entry('local_1', 'local'),
        entry('yt_alpha', 'online'),
        entry('local_2', 'local'),
        entry('yt_beta', 'online')
    ];
    const randomValues = [0.9, 0.1, 0.5];
    let randomIndex = 0;
    const shuffleOrder = buildShuffleOrder(entries, 1, () => randomValues[randomIndex++] ?? 0);
    const shuffledState = {
        entries,
        currentIndex: 1,
        isShuffle: true,
        repeatMode: 'all',
        shuffleOrder
    };

    assert.deepEqual(shuffleOrder, ['entry_yt_alpha', 'entry_local_2', 'entry_local_1', 'entry_yt_beta']);

    const next = advance(shuffledState);
    assert.equal(next.entry.trackId, 'local_2');
    assert.equal(next.state.currentIndex, 2);

    const previous = rewind(next.state);
    assert.equal(previous.entry.trackId, 'yt_alpha');
    assert.equal(previous.state.currentIndex, 1);
});

test('advance skips failed online entries and continues to the next playable mixed item', () => {
    const state = {
        entries: [
            entry('local_1', 'local'),
            entry('yt_alpha', 'online'),
            entry('local_2', 'local'),
            entry('yt_beta', 'online')
        ],
        currentIndex: 0,
        isShuffle: false,
        repeatMode: 'none',
        shuffleOrder: []
    };

    const result = advance(state, { skipEntryIds: ['entry_yt_alpha'] });
    assert.equal(result.action, 'play');
    assert.equal(result.entry.trackId, 'local_2');
    assert.equal(result.state.currentIndex, 2);
});
