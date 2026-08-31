import test from 'node:test';
import assert from 'node:assert/strict';

import { PlaybackEngine } from '../nexplay-next/core/playback-engine.js';

/** @type {(...args: any[]) => any} */
function createMediaStub() {
    const listeners = new Map();
    return {
        currentTime: 0,
        paused: true,
        playbackRate: 1,
        volume: 1,
        tagName: 'AUDIO',
        src: '',
        /** @type {(...args: any[]) => any} */
        addEventListener(name, cb) {
            listeners.set(name, cb);
        },
        /** @type {(...args: any[]) => any} */
        play() {
            this.paused = false;
            return Promise.resolve();
        },
        /** @type {(...args: any[]) => any} */
        pause() {
            this.paused = true;
        },
        /** @type {(...args: any[]) => any} */
        __emit(name) {
            const cb = listeners.get(name);
            if (cb) cb();
        }
    };
}

test('playback engine AB loop and chapters work', () => {
    const media = createMediaStub();
    const engine = new PlaybackEngine(media);

    engine.setAbLoop(5, 7);
    media.currentTime = 7.2;
    media.__emit('timeupdate');
    assert.equal(media.currentTime, 5);

    engine.clearAbLoop();
    assert.equal(engine.getAbLoop().enabled, false);

    engine.setChapterMarkers([
        { title: 'A', time: 0 },
        { title: 'B', time: 30 },
        { title: 'C', time: 60 }
    ]);

    assert.equal(engine.getCurrentChapterIndex(45), 1);
    assert.equal(engine.seekToChapter(2), true);
    assert.equal(media.currentTime, 60);
});
