// @ts-nocheck -- Legacy browser persistence functions run in isolated VM contexts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const helpers = fs.readFileSync(new URL('../js/legacy/helpers.js', import.meta.url), 'utf8');
const library = fs.readFileSync(new URL('../js/legacy/library.js', import.meta.url), 'utf8');
const modals = fs.readFileSync(new URL('../js/legacy/modals-and-modes.js', import.meta.url), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing source marker: ${startMarker}`);
    assert.ok(end > start, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
}

const metadataFunctions = sliceBetween(
    library,
    'function persistMetadataStoreWithFallback',
    '// --- API HELPERS ---'
);

const indexedDbFunctions = sliceBetween(
    helpers,
    'function openLocalLibraryDb',
    'function buildRestoredLocalTrack'
);

const localLibraryIndexFunctions = sliceBetween(
    helpers,
    'function sanitizeStoredLocalLibrary',
    'function announceLocalLibraryPersistenceWarning'
);

const localLibraryHydrationFunction = sliceBetween(
    helpers,
    'async function hydratePersistedLocalLibraryIntoState',
    'function getCachedElement'
);

function launchMetadataHarness(metadataStore, writeImpl) {
    const sandbox = {
        state: { metadataStore: { ...metadataStore } },
        writeImpl,
        writeStorageJson(key, value) {
            return sandbox.writeImpl(key, value);
        },
        shouldBypassPrivateSessionTrackPersistence() { return false; },
        getTrackMetadataKeys(track) { return track?.fingerprint ? [track.fingerprint] : []; },
        clampNumber(value, min, max, fallback) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
        },
        sanitizeText(value) { return String(value || '').trim(); },
        isPersistableLocalTrack() { return false; },
        persistLocalLibraryIndex() {},
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`
        ${metadataFunctions}
        globalThis.persistenceApi = { persistMetadataStoreWithFallback, persistTrackMetadata };
    `, sandbox);
    return sandbox;
}

function launchIndexedDbHarness() {
    const requests = [];
    const revokedUrls = [];
    const warnings = [];
    const sandbox = {
        LOCAL_LIBRARY_DB_NAME: 'test-local-media',
        LOCAL_LIBRARY_DB_STORE: 'tracks',
        localMediaDbPromise: null,
        indexedDB: {
            open() {
                const request = { result: null, error: null };
                requests.push(request);
                return request;
            }
        },
        sanitizeText(value) { return String(value || '').trim(); },
        state: { tracks: [] },
        desktopRuntime: false,
        isDesktopRuntimeAvailable() { return sandbox.desktopRuntime; },
        Blob,
        URL: {
            revokeObjectURL(url) { revokedUrls.push(url); }
        },
        setTimeout,
        clearTimeout,
        console: {
            warn(...args) { warnings.push(args); }
        },
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`
        ${indexedDbFunctions}
        globalThis.persistenceApi = {
            openLocalLibraryDb,
            deletePersistedLocalMediaBlob,
            deletePersistedLocalMediaBlobs,
            deleteOrphanedPersistedLocalMediaBlobs,
            finalizeDeletedLocalMediaTracks,
            cleanupOrphanedBrowserLocalMediaAfterHydration
        };
    `, sandbox);
    return { sandbox, requests, revokedUrls, warnings };
}

function launchLocalLibraryIndexHarness(rawValue, options = {}) {
    const warnings = [];
    const notices = [];
    const localStorage = {
        getItem() {
            if (options.throwOnRead) throw new Error('storage unavailable');
            return rawValue;
        }
    };
    const sandbox = {
        LOCAL_LIBRARY_INDEX_KEY: 'nexplay-local-library',
        localStorage,
        nexPlayDesktopBridge: null,
        lastDesktopLocalLibrarySnapshotsJson: '',
        sanitizeText(value) { return String(value || '').trim(); },
        inferTrackIdentityFromFileName(fileName) {
            return { title: String(fileName || ''), artist: 'Unknown' };
        },
        safeParseJSON(raw, fallback) {
            try { return JSON.parse(raw); } catch (_) { return fallback; }
        },
        isDesktopRuntimeAvailable() { return false; },
        announceLocalLibraryPersistenceWarning(message) { notices.push(message); },
        console: {
            warn(...args) { warnings.push(args); }
        },
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`
        ${localLibraryIndexFunctions}
        globalThis.localLibraryIndexApi = {
            readStoredLocalLibraryIndexState,
            getStoredLocalLibraryIndex,
            loadPersistedLocalLibraryIndex
        };
    `, sandbox);
    return { sandbox, warnings, notices };
}

function launchEmptyHydrationHarness(indexState, orphanedBlobCount = 0) {
    const cleanupCalls = [];
    const sandbox = {
        localLibraryRestorePromise: null,
        async loadPersistedLocalLibraryIndex(options) {
            assert.equal(options?.includeState, true);
            return indexState;
        },
        async cleanupOrphanedBrowserLocalMediaAfterHydration(snapshots, options) {
            cleanupCalls.push({ snapshots, options });
            return orphanedBlobCount;
        },
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`
        ${localLibraryHydrationFunction}
        globalThis.hydrationApi = { hydratePersistedLocalLibraryIntoState };
    `, sandbox);
    return { sandbox, cleanupCalls };
}

function createTransactionDb(initialKeys = []) {
    const keys = new Set(initialKeys);
    const deleted = [];
    const transactions = [];
    const db = {
        closeCount: 0,
        close() { this.closeCount += 1; },
        transaction(_storeName, mode) {
            let tx = null;
            const store = {
                delete(key) {
                    deleted.push(String(key));
                    keys.delete(String(key));
                    queueMicrotask(() => tx.oncomplete?.());
                    return {};
                },
                getAllKeys() {
                    const request = { result: null };
                    queueMicrotask(() => {
                        request.result = Array.from(keys);
                        request.onsuccess?.();
                        queueMicrotask(() => tx.oncomplete?.());
                    });
                    return request;
                }
            };
            tx = {
                mode,
                objectStore() { return store; },
                oncomplete: null,
                onerror: null,
                onabort: null
            };
            transactions.push(tx);
            return tx;
        }
    };
    return { db, keys, deleted, transactions };
}

async function openWithDb(harness, db) {
    const promise = harness.sandbox.persistenceApi.openLocalLibraryDb();
    const request = harness.requests.at(-1);
    request.result = db;
    request.onsuccess();
    assert.equal(await promise, db);
    return request;
}

test('metadata quota fallback honors write booleans and removes non-current artwork first', () => {
    const attempts = [];
    const preferredCover = 'data:image/png;base64,preferred';
    const largeCover = `data:image/png;base64,${'x'.repeat(200)}`;
    const smallCover = `data:image/png;base64,${'y'.repeat(20)}`;
    const harness = launchMetadataHarness({
        preferred: { title: 'Current', cover: preferredCover },
        large: { title: 'Large', cover: largeCover },
        small: { title: 'Small', cover: smallCover }
    }, (_key, value) => {
        const snapshot = JSON.parse(JSON.stringify(value));
        attempts.push(snapshot);
        const embeddedCount = Object.values(snapshot).filter((item) => /^data:image\//i.test(item?.cover || '')).length;
        return embeddedCount <= 2;
    });

    assert.equal(harness.persistenceApi.persistMetadataStoreWithFallback('preferred'), true);
    assert.equal(attempts.length, 2, 'the failed full write should be followed by one reduced retry');
    assert.equal(harness.state.metadataStore.large.cover, '', 'the largest non-current cover should be removed first');
    assert.equal(harness.state.metadataStore.small.cover, smallCover);
    assert.equal(harness.state.metadataStore.preferred.cover, preferredCover, 'current artwork should be preserved when possible');
});

test('metadata fallback can remove current artwork as a last resort and reports total failure', () => {
    const harness = launchMetadataHarness({
        preferred: { title: 'Current', cover: 'data:image/jpeg;base64,current' }
    }, (_key, value) => !Object.values(value).some((item) => /^data:image\//i.test(item?.cover || '')));

    assert.equal(harness.persistenceApi.persistMetadataStoreWithFallback('preferred'), true);
    assert.equal(harness.state.metadataStore.preferred.cover, '');

    harness.writeImpl = () => false;
    const track = {
        fingerprint: 'track-fingerprint',
        title: 'Track',
        artist: 'Artist',
        cover: 'data:image/png;base64,new',
        tags: []
    };
    assert.equal(harness.persistenceApi.persistTrackMetadata(track), false, 'callers must receive the failed write result');
    harness.writeImpl = () => true;
    assert.equal(harness.persistenceApi.persistTrackMetadata(track), true, 'successful writes must propagate true');
});

test('blocked and failed IndexedDB opens settle, close late connections, and retry', async () => {
    const harness = launchIndexedDbHarness();

    const blockedPromise = harness.sandbox.persistenceApi.openLocalLibraryDb();
    const blockedRequest = harness.requests[0];
    blockedRequest.onblocked();
    assert.equal(await blockedPromise, null);

    const lateDb = { closeCount: 0, close() { this.closeCount += 1; } };
    blockedRequest.result = lateDb;
    blockedRequest.onsuccess();
    assert.equal(lateDb.closeCount, 1, 'a late success after blocked settlement must be closed');

    const failedPromise = harness.sandbox.persistenceApi.openLocalLibraryDb();
    assert.equal(harness.requests.length, 2, 'a blocked attempt must not remain cached');
    harness.requests[1].error = new Error('open failed');
    harness.requests[1].onerror();
    assert.equal(await failedPromise, null);

    const retryPromise = harness.sandbox.persistenceApi.openLocalLibraryDb();
    assert.equal(harness.requests.length, 3, 'an errored attempt must be retried');
    const retryDb = { closeCount: 0, close() { this.closeCount += 1; } };
    harness.requests[2].result = retryDb;
    harness.requests[2].onsuccess();
    assert.equal(await retryPromise, retryDb);

    retryDb.onversionchange();
    assert.equal(retryDb.closeCount, 1, 'versionchange must close the stale database connection');
    const postVersionChange = harness.sandbox.persistenceApi.openLocalLibraryDb();
    assert.equal(harness.requests.length, 4, 'versionchange must reset the cached connection');
    harness.requests[3].error = new Error('cleanup');
    harness.requests[3].onerror();
    await postVersionChange;
});

test('blob deletion and guarded orphan cleanup use committed readwrite transactions', async () => {
    const harness = launchIndexedDbHarness();
    const storage = createTransactionDb(['keep', 'delete-one', 'orphan']);
    await openWithDb(harness, storage.db);

    assert.equal(await harness.sandbox.persistenceApi.deletePersistedLocalMediaBlob('delete-one'), true);
    assert.equal(storage.keys.has('delete-one'), false);
    assert.equal(await harness.sandbox.persistenceApi.deleteOrphanedPersistedLocalMediaBlobs([]), 0, 'empty retention requires an explicit opt-in');
    assert.equal(storage.keys.has('orphan'), true);
    assert.equal(await harness.sandbox.persistenceApi.deleteOrphanedPersistedLocalMediaBlobs(['keep']), 1);
    assert.deepEqual(Array.from(storage.keys), ['keep']);
    assert.ok(storage.transactions.every((tx) => tx.mode === 'readwrite'));
});

test('browser library index is authoritative only when a complete stored array was read', async () => {
    const validTrack = {
        id: 'track-1',
        fingerprint: 'keep',
        fileName: 'song.mp3',
        sourcePath: ''
    };
    const validEmpty = launchLocalLibraryIndexHarness('[]');
    const emptyState = await validEmpty.sandbox.localLibraryIndexApi.loadPersistedLocalLibraryIndex({ includeState: true });
    assert.equal(emptyState.authoritative, true, 'an explicitly persisted empty array is authoritative');
    assert.deepEqual(Array.from(emptyState.snapshots), []);

    const missing = launchLocalLibraryIndexHarness(null);
    const missingState = await missing.sandbox.localLibraryIndexApi.loadPersistedLocalLibraryIndex({ includeState: true });
    assert.equal(missingState.authoritative, false, 'a missing key may be an interrupted or failed index write');
    assert.equal(missingState.reason, 'missing');

    const corrupt = launchLocalLibraryIndexHarness('{broken-json');
    const corruptState = await corrupt.sandbox.localLibraryIndexApi.loadPersistedLocalLibraryIndex({ includeState: true });
    assert.equal(corruptState.authoritative, false);
    assert.equal(corruptState.reason, 'corrupt');
    assert.equal(corrupt.notices.length, 1, 'corruption should be surfaced without treating the index as empty');

    const partial = launchLocalLibraryIndexHarness(JSON.stringify([validTrack, { fingerprint: 'unrecoverable-shape' }]));
    const partialState = await partial.sandbox.localLibraryIndexApi.loadPersistedLocalLibraryIndex({ includeState: true });
    assert.equal(partialState.authoritative, false, 'dropping any malformed entry makes the retained set unsafe for deletion');
    assert.deepEqual(Array.from(partialState.snapshots, (snapshot) => snapshot.fingerprint), ['keep']);

    const unavailable = launchLocalLibraryIndexHarness(null, { throwOnRead: true });
    const unavailableState = await unavailable.sandbox.localLibraryIndexApi.loadPersistedLocalLibraryIndex({ includeState: true });
    assert.equal(unavailableState.authoritative, false);
    assert.equal(unavailableState.reason, 'unavailable');
});

test('post-hydration orphan cleanup is guarded, protects concurrent imports, and accepts authoritative empty indexes', async () => {
    const harness = launchIndexedDbHarness();
    const storage = createTransactionDb(['keep', 'concurrent-import', 'orphan']);
    await openWithDb(harness, storage.db);
    harness.sandbox.state.tracks = [{ source: 'local', fingerprint: 'concurrent-import' }];

    const deleted = await harness.sandbox.persistenceApi.cleanupOrphanedBrowserLocalMediaAfterHydration(
        [{ fingerprint: 'keep' }],
        { authoritative: true }
    );
    assert.equal(deleted, 1);
    assert.deepEqual(Array.from(storage.keys).sort(), ['concurrent-import', 'keep']);

    storage.keys.add('unsafe-to-delete');
    assert.equal(await harness.sandbox.persistenceApi.cleanupOrphanedBrowserLocalMediaAfterHydration([], { authoritative: false }), 0);
    assert.equal(storage.keys.has('unsafe-to-delete'), true, 'failed or corrupt index loads must never trigger a sweep');

    harness.sandbox.state.tracks = [];
    assert.equal(await harness.sandbox.persistenceApi.cleanupOrphanedBrowserLocalMediaAfterHydration([], { authoritative: true }), 3);
    assert.equal(storage.keys.size, 0, 'an explicitly persisted empty library should clear blobs left by an interrupted Undo window');

    storage.keys.add('desktop-blob');
    harness.sandbox.desktopRuntime = true;
    assert.equal(await harness.sandbox.persistenceApi.cleanupOrphanedBrowserLocalMediaAfterHydration([], { authoritative: true }), 0);
    assert.equal(storage.keys.has('desktop-blob'), true, 'the browser sweep must not run in the desktop runtime');
});

test('empty authoritative hydration performs the guarded sweep before settling', async () => {
    const harness = launchEmptyHydrationHarness({ snapshots: [], authoritative: true }, 2);
    const result = await harness.sandbox.hydrationApi.hydratePersistedLocalLibraryIntoState();
    assert.equal(harness.cleanupCalls.length, 1);
    assert.equal(harness.cleanupCalls[0].options.authoritative, true);
    assert.deepEqual(Array.from(harness.cleanupCalls[0].snapshots), []);
    assert.equal(result.orphanedBlobCount, 2);
});

test('deletion finalization preserves re-added tracks and revokes only unreferenced blob URLs', async () => {
    const harness = launchIndexedDbHarness();
    const storage = createTransactionDb(['keep', 'delete-me']);
    await openWithDb(harness, storage.db);
    harness.sandbox.state.tracks = [{ fingerprint: 'keep', url: 'blob:shared' }];

    const result = await harness.sandbox.persistenceApi.finalizeDeletedLocalMediaTracks([
        { fingerprint: 'keep', url: 'blob:shared' },
        { fingerprint: 'delete-me', url: 'blob:gone' }
    ]);

    assert.equal(result.deletedBlobCount, 1);
    assert.equal(storage.keys.has('keep'), true);
    assert.equal(storage.keys.has('delete-me'), false);
    assert.deepEqual(harness.revokedUrls, ['blob:gone']);

    const deletionBody = sliceBetween(modals, 'function applyDeletion', 'function formatClock');
    assert.doesNotMatch(deletionBody.slice(0, deletionBody.indexOf('function undoDelete')), /URL\.revokeObjectURL/);
    assert.match(deletionBody, /finalizeDeletedLocalMediaTracks\(deletionPayload\.tracks\)/);
    assert.match(deletionBody, /payload\.undone = true;\s*if \(payload\.finalizationTimer\) \{\s*clearTimeout/s);
});
