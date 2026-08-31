// @ts-nocheck -- Legacy browser persistence functions run in isolated VM launches.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const helpers = fs.readFileSync(new URL('../js/legacy/helpers.js', import.meta.url), 'utf8');
const appInit = fs.readFileSync(new URL('../js/legacy/app-init.js', import.meta.url), 'utf8');
const queue = fs.readFileSync(new URL('../js/legacy/queue.js', import.meta.url), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing source marker: ${startMarker}`);
    assert.ok(end > start, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
}

const storageFunctions = sliceBetween(
    helpers,
    'function safeJsonParse',
    'function inferTrackIdentityFromFileName'
);
const appStateFunctions = sliceBetween(
    helpers,
    'function getListeningHistoryTotalSeconds',
    'function getNotyPadState'
);

class MemoryStorage {
    constructor(entries = [], onSet = null) {
        this.values = new Map(entries);
        this.onSet = onSet;
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        const serialized = String(value);
        if (this.onSet) this.onSet(String(key), serialized);
        this.values.set(String(key), serialized);
    }

    removeItem(key) {
        this.values.delete(String(key));
    }
}

function createState(overrides = {}) {
    return {
        volume: 0.8,
        isDarkMode: true,
        viewMode: 'grid',
        sortType: 'added',
        sortDirection: 'desc',
        playbackSpeed: 1,
        accentColor: '#57B9FF',
        visualizerStyle: 'bars',
        crossfadeDuration: 0,
        keyBindings: {},
        playHistory: [],
        listeningHistory: {},
        totalListeningTime: 0,
        autoAccentFromArt: false,
        autoQueueEnabled: true,
        notyPad: {},
        appSettings: { appearance: { themeMode: 'dark' } },
        ...overrides
    };
}

function launchWithStorage(localStorage, stateOverrides = {}) {
    const sandbox = {
        APP_STATE_STORAGE_KEY: 'nexplay_pro_state',
        APP_STATE_BACKUP_STORAGE_KEY: 'nexplay_pro_state_backup_v1',
        localStorage,
        state: createState(stateOverrides),
        safeCall(fn, fallback = null) {
            try { return typeof fn === 'function' ? fn() : fallback; } catch (_) { return fallback; }
        },
        safeParseJSON(raw, fallback) {
            try { return typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
        },
        shouldBypassStorageWriteForPrivateSession() { return false; },
        sanitizeNotyPadState(value) { return value && typeof value === 'object' ? value : {}; },
        createDefaultNotyPadState() { return {}; },
        sanitizeAppSettings(value) { return value && typeof value === 'object' ? value : {}; },
        createDefaultAppSettings() { return {}; },
        console,
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`
        ${storageFunctions}
        ${appStateFunctions}
        globalThis.persistenceApi = {
            readPersistedAppState,
            writePersistedAppState,
            restoreTotalListeningTime,
            buildPersistedAppStatePayload,
            persistAppStateNow
        };
    `, sandbox);
    return sandbox;
}

test('listening totals survive a true cold restart through the app-state persistence path', () => {
    const storage = new MemoryStorage();
    const firstLaunch = launchWithStorage(storage, {
        listeningHistory: { '2026-07-18': 120.25, '2026-07-19': 5 },
        totalListeningTime: 132.75
    });

    assert.equal(firstLaunch.persistenceApi.persistAppStateNow(), true);
    assert.equal(JSON.parse(storage.getItem('nexplay_pro_state')).totalListeningTime, 132.75);
    assert.equal(JSON.parse(storage.getItem('nexplay_pro_state_backup_v1')).totalListeningTime, 132.75);

    // A separate VM represents a new renderer process with no shared state.
    const secondLaunch = launchWithStorage(storage);
    const restoredPayload = secondLaunch.persistenceApi.readPersistedAppState(null);
    secondLaunch.state.listeningHistory = restoredPayload.listeningHistory;
    secondLaunch.persistenceApi.restoreTotalListeningTime(restoredPayload);

    assert.equal(secondLaunch.state.totalListeningTime, 132.75);
    assert.deepEqual(
        JSON.parse(JSON.stringify(secondLaunch.state.listeningHistory)),
        { '2026-07-18': 120.25, '2026-07-19': 5 }
    );
    assert.match(appInit, /const parsed = readPersistedAppState\(null\)/);
});

test('a corrupt primary app state is repaired from the latest valid backup', () => {
    const storage = new MemoryStorage();
    const firstLaunch = launchWithStorage(storage, {
        listeningHistory: { '2026-07-19': 44.5 },
        totalListeningTime: 48.25
    });
    assert.equal(firstLaunch.persistenceApi.persistAppStateNow(), true);
    const expected = storage.getItem('nexplay_pro_state_backup_v1');

    storage.setItem('nexplay_pro_state', '{"totalListeningTime":');
    const recoveredLaunch = launchWithStorage(storage);
    const recovered = recoveredLaunch.persistenceApi.readPersistedAppState(null);

    assert.equal(recovered.totalListeningTime, 48.25);
    assert.equal(storage.getItem('nexplay_pro_state'), expected, 'primary should be repaired byte-for-byte');
});

test('a corrupt backup is repaired from a valid primary without losing listening data', () => {
    const storage = new MemoryStorage();
    const firstLaunch = launchWithStorage(storage, {
        listeningHistory: { '2026-07-19': 18 },
        totalListeningTime: 23
    });
    assert.equal(firstLaunch.persistenceApi.persistAppStateNow(), true);
    const expected = storage.getItem('nexplay_pro_state');

    storage.setItem('nexplay_pro_state_backup_v1', 'not-json');
    const recoveredLaunch = launchWithStorage(storage);
    const recovered = recoveredLaunch.persistenceApi.readPersistedAppState(null);

    assert.equal(recovered.totalListeningTime, 23);
    assert.equal(storage.getItem('nexplay_pro_state_backup_v1'), expected);
});

test('two corrupt copies fall back safely and are cleared for a clean next save', () => {
    const storage = new MemoryStorage([
        ['nexplay_pro_state', '{broken'],
        ['nexplay_pro_state_backup_v1', '[also-broken']
    ]);
    const launch = launchWithStorage(storage);
    const fallback = { fresh: true };

    assert.equal(launch.persistenceApi.readPersistedAppState(fallback), fallback);
    assert.equal(storage.getItem('nexplay_pro_state'), null);
    assert.equal(storage.getItem('nexplay_pro_state_backup_v1'), null);
});

test('quota fallback trims detailed history but preserves the aggregate listening total', () => {
    let rejectedFullPayload = false;
    const storage = new MemoryStorage([], (key, serialized) => {
        if (key !== 'nexplay_pro_state') return;
        const payload = JSON.parse(serialized);
        if (Object.keys(payload.listeningHistory || {}).length) {
            rejectedFullPayload = true;
            throw new Error('QuotaExceededError');
        }
    });
    const launch = launchWithStorage(storage, {
        playHistory: new Array(50).fill({ id: 'track' }),
        listeningHistory: { '2026-07-19': 91.5 },
        totalListeningTime: 104.75
    });

    assert.equal(launch.persistenceApi.persistAppStateNow(), true);
    assert.equal(rejectedFullPayload, true, 'the test must exercise the compact retry');
    const persisted = JSON.parse(storage.getItem('nexplay_pro_state'));
    assert.deepEqual(persisted.listeningHistory, {});
    assert.deepEqual(persisted.playHistory, []);
    assert.equal(persisted.totalListeningTime, 104.75);
});

test('manual backup import persists restored listening totals immediately', () => {
    const persistIndex = queue.indexOf('persistAppStateNow();', queue.indexOf('function applyImportedBackup'));
    const refreshIndex = queue.indexOf('refreshFeatureRuntime', queue.indexOf('function applyImportedBackup'));
    assert.ok(persistIndex > 0 && persistIndex < refreshIndex);
    assert.match(queue, /state\.listeningHistory = [^;]+;\s*restoreTotalListeningTime\(payload\)/s);
});
