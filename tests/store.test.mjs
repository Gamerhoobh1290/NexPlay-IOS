import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultAppState, createRootReducer, createStore } from '../nexplay-next/core/store.js';
import { selectTracks } from '../nexplay-next/core/selectors.js';

test('queue reducer keeps repeat/shuffle values', () => {
    const store = createStore(createDefaultAppState(), createRootReducer());
    store.dispatch({
        type: 'queue/set',
        payload: {
            queue: ['a', 'b'],
            isShuffle: true,
            repeatMode: 'all',
            shuffleQueue: ['a', 'b', 'c'],
            shuffleIndex: 1
        }
    });

    const state = store.getState();
    assert.equal(state.queue.isShuffle, true);
    assert.equal(state.queue.repeatMode, 'all');
    assert.deepEqual(state.queue.queue, ['a', 'b']);
    assert.equal(state.queue.shuffleIndex, 1);
});

test('selectors apply filter and sort', () => {
    const store = createStore(createDefaultAppState(), createRootReducer());
    store.dispatch({
        type: 'tracks/upsertMany',
        payload: [
            { id: '1', title: 'Beta', artist: 'Zed', type: 'audio', addedAt: 2, size: 200 },
            { id: '2', title: 'Alpha', artist: 'Able', type: 'audio', addedAt: 1, size: 100 },
            { id: '3', title: 'Video', artist: 'Cam', type: 'video', addedAt: 3, size: 300 }
        ]
    });

    const filtered = selectTracks(store.getState(), { media: 'audio', sortType: 'name', sortDirection: 'asc' });
    assert.deepEqual(filtered.map((/** @type {any} */ item) => item.id), ['2', '1']);
});
