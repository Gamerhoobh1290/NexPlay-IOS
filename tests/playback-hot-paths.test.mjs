// @ts-nocheck -- Focused legacy browser functions are evaluated in VM sandboxes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function read(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function sourceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0, `missing source marker: ${startMarker}`);
    assert.ok(end > start, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
}

function createTrackedElement() {
    const values = {
        textContent: '',
        disabled: false,
        title: '',
        src: '',
        max: '',
        value: ''
    };
    const classes = new Set();
    const writes = [];
    const element = {
        classList: {
            contains(className) {
                return classes.has(className);
            },
            toggle(className, enabled) {
                writes.push(`class:${className}`);
                if (enabled) classes.add(className);
                else classes.delete(className);
            }
        },
        getAttribute(name) {
            return name === 'src' ? values.src : null;
        }
    };
    for (const propertyName of Object.keys(values)) {
        Object.defineProperty(element, propertyName, {
            get() {
                return values[propertyName];
            },
            set(nextValue) {
                values[propertyName] = nextValue;
                writes.push(propertyName);
            }
        });
    }
    return { element, writes };
}

test('online player progress ticks avoid static card rewrites and result-row scans', () => {
    const source = read('js/legacy/online-music.js');
    const cardSource = sourceBetween(
        source,
        'function setOnlineMusicElementPropertyIfChanged',
        'function captureOnlineMusicProgress'
    );
    const captureSource = sourceBetween(
        source,
        'function captureOnlineMusicProgress',
        'function startOnlineMusicProgressTimer'
    );

    assert.match(captureSource, /syncOnlineMusicPlayerProgressControls\(online, current\)/);
    assert.match(captureSource, /syncOnlineMusicPlayerCard\(\{ syncResultRows: false \}\)/);
    assert.doesNotMatch(captureSource, /syncOnlineMusicResultRows\(\)/);

    const elementIds = [
        'online-music-current-cover',
        'online-music-current-cover-fallback',
        'online-music-current-title',
        'online-music-current-artist',
        'online-music-current-status',
        'online-music-play-btn',
        'online-music-save-current-btn',
        'online-music-favorite-current-btn',
        'online-music-prev-btn',
        'online-music-next-btn',
        'online-music-seek-slider',
        'online-music-time-current',
        'online-music-time-duration',
        'online-music-volume-slider',
        'online-music-volume-label'
    ];
    const tracked = Object.fromEntries(elementIds.map((id) => [id, createTrackedElement()]));
    const online = {
        currentTrackId: 'track-1',
        currentTime: 12,
        duration: 180,
        volume: 70,
        isPlaying: true,
        pendingTrackId: '',
        connectingTrackId: ''
    };
    const current = {
        id: 'track-1',
        title: 'Song',
        artist: 'Artist',
        cover: 'cover.jpg',
        duration: 180,
        isFavorite: false
    };
    let resultRowSyncs = 0;
    const sandbox = {
        onlineMusicSuppressSeekSync: false,
        document: {
            getElementById(id) {
                return tracked[id]?.element || null;
            }
        },
        getOnlineMusicState() {
            return online;
        },
        getOnlineMusicCurrentTrack() {
            return current;
        },
        normalizeOnlineMusicTrackId(value) {
            return String(value || '');
        },
        getSavedOnlineTrack() {
            return null;
        },
        getAudioQueueHelper() {
            return {
                rewind() { return { entry: null }; },
                advance() { return { entry: null }; }
            };
        },
        getUnifiedAudioQueueState() {
            return { failedEntryIds: [] };
        },
        clampNumber(value, min, max, fallback) {
            const number = Number(value);
            return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
        },
        formatTime(value) {
            const seconds = Math.max(0, Math.floor(Number(value) || 0));
            return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        },
        setTextContentIfChanged(element, nextValue) {
            if (!element || element.textContent === nextValue) return false;
            element.textContent = nextValue;
            return true;
        },
        syncOnlineMusicResultRows() {
            resultRowSyncs += 1;
        },
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(
        `${cardSource}\nglobalThis.syncOnlineMusicPlayerCard = syncOnlineMusicPlayerCard;\n` +
        'globalThis.syncOnlineMusicPlayerProgressControls = syncOnlineMusicPlayerProgressControls;',
        sandbox
    );

    sandbox.syncOnlineMusicPlayerCard({ syncResultRows: false });
    const writesAfterFirstSync = Object.values(tracked).reduce((sum, item) => sum + item.writes.length, 0);
    assert.ok(writesAfterFirstSync > 0);
    assert.equal(resultRowSyncs, 0);

    sandbox.syncOnlineMusicPlayerCard({ syncResultRows: false });
    const writesAfterUnchangedSync = Object.values(tracked).reduce((sum, item) => sum + item.writes.length, 0);
    assert.equal(writesAfterUnchangedSync, writesAfterFirstSync, 'unchanged card state should not rewrite DOM properties');
    assert.equal(resultRowSyncs, 0);

    const staticWritesBeforeProgress = tracked['online-music-current-title'].writes.length;
    online.currentTime = 13;
    sandbox.syncOnlineMusicPlayerProgressControls(online, current);
    assert.equal(tracked['online-music-current-title'].writes.length, staticWritesBeforeProgress);
    assert.equal(resultRowSyncs, 0, 'progress-only updates must not scan result rows');

    sandbox.syncOnlineMusicPlayerCard();
    assert.equal(resultRowSyncs, 1, 'state-change card syncs keep result rows current');
});

test('hidden debug overlay does not schedule animation frames', () => {
    const source = read('js/legacy/runtime-config.js');
    const overlaySource = sourceBetween(
        source,
        'function scheduleDebugOverlayRefresh',
        'function resetPlaybackState'
    );
    const state = { debugOverlayVisible: false };
    const callbacks = new Map();
    const root = { style: { display: 'block' } };
    let nextFrameId = 0;
    let scheduledFrames = 0;
    let overlayUpdates = 0;
    const sandbox = {
        state,
        document: {
            getElementById() {
                return root;
            }
        },
        requestAnimationFrame(callback) {
            const id = ++nextFrameId;
            scheduledFrames += 1;
            callbacks.set(id, callback);
            return id;
        },
        cancelAnimationFrame(id) {
            callbacks.delete(id);
        },
        updateDebugOverlay() {
            overlayUpdates += 1;
        },
        logAction() {},
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(
        `let debugOverlayRafId = 0;\n${overlaySource}\n` +
        'globalThis.scheduleDebugOverlayRefresh = scheduleDebugOverlayRefresh;\n' +
        'globalThis.toggleDebugOverlay = toggleDebugOverlay;',
        sandbox
    );

    sandbox.scheduleDebugOverlayRefresh();
    assert.equal(scheduledFrames, 0);

    state.debugOverlayVisible = true;
    sandbox.scheduleDebugOverlayRefresh();
    sandbox.scheduleDebugOverlayRefresh();
    assert.equal(scheduledFrames, 1, 'visible overlay refreshes should coalesce into one frame');
    callbacks.get(1)();
    assert.equal(overlayUpdates, 1);

    sandbox.scheduleDebugOverlayRefresh();
    assert.equal(scheduledFrames, 2);
    sandbox.toggleDebugOverlay(false);
    assert.equal(root.style.display, 'none');
    assert.equal(callbacks.has(2), false, 'hiding the overlay should cancel its pending frame');
    sandbox.scheduleDebugOverlayRefresh();
    assert.equal(scheduledFrames, 2);
});

test('progress updates preserve mini-player behavior and skip inactive mode controls', () => {
    const source = read('js/legacy/modals-and-modes.js');
    const helperSource = sourceBetween(
        source,
        'function updateActivePlayerProgressControls',
        'function updateProgress'
    );
    const updateProgressSource = sourceBetween(source, 'function updateProgress', 'function clearSearch');
    const state = { windowedModeActive: false, fsModeActive: false };
    const sandbox = { state, globalThis: null };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(
        `${helperSource}\nglobalThis.updateActivePlayerProgressControls = updateActivePlayerProgressControls;`,
        sandbox
    );

    const updatedIds = () => {
        const ids = [];
        sandbox.updateActivePlayerProgressControls((currentTimeId) => ids.push(currentTimeId));
        return ids;
    };

    assert.deepEqual(updatedIds(), ['mini-time-current']);
    state.windowedModeActive = true;
    assert.deepEqual(updatedIds(), ['mini-time-current', 'windowedModeTimeCurrent']);
    state.windowedModeActive = false;
    state.fsModeActive = true;
    assert.deepEqual(updatedIds(), ['mini-time-current', 'fsModeTimeCurrent']);
    assert.equal((updateProgressSource.match(/updateActivePlayerProgressControls\(updateOne\)/g) || []).length, 2);
    assert.match(updateProgressSource, /if \(state\.videoFsModeActive\) \{[\s\S]*?updateOne\('videoFsTimeCurrent'/);
});
