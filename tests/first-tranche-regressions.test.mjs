// @ts-nocheck -- Legacy browser functions are evaluated in a small VM sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function read(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('idle performance sampler uses periodic sample windows without changing the original cover animation', () => {
    const index = read('index.html');
    const shortcuts = read('js/legacy/theme-and-shortcuts.js');
    const samplerStart = shortcuts.indexOf('function startPerfSampler');
    const samplerEnd = shortcuts.indexOf('// Map visualizer style id', samplerStart);
    assert.ok(samplerStart >= 0 && samplerEnd > samplerStart);
    const samplerBody = shortcuts.slice(samplerStart, samplerEnd);

    assert.match(index, /mini-cover[^>]+animate-\[spin_10s_linear_infinite\]/);
    assert.match(samplerBody, /const idleSampleDelayMs = 3500/);
    assert.match(samplerBody, /queueNext\(isHighMotionContext\(\) \? 0 : idleSampleDelayMs\)/);
    assert.doesNotMatch(samplerBody, /FEATURE_REGISTRY|isFeatureEnabled|hasCreativeLoad/);
});

test('listening progress is recorded for valid deltas and ignores seeks or suppressed playback', () => {
    const source = read('js/legacy/modals-and-modes.js');
    const start = source.indexOf('let lastListeningStatsPersistAt');
    const end = source.indexOf('\nfunction updateProgress', start);
    assert.ok(start >= 0 && end > start);

    const state = { lastProgressTime: 0, totalListeningTime: 10, listeningHistory: {} };
    let persistCalls = 0;
    const sandbox = {
        state,
        persistAppStateNow() { persistCalls += 1; },
        globalThis: null
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.recordListeningProgress = recordListeningProgress;`, sandbox);

    const track = { listeningTime: 4 };
    assert.equal(sandbox.recordListeningProgress(track, 2, true), 2);
    assert.equal(state.totalListeningTime, 12);
    assert.equal(track.listeningTime, 6);
    assert.equal(Object.values(state.listeningHistory).reduce((sum, value) => sum + value, 0), 2);
    assert.equal(persistCalls, 1);

    assert.equal(sandbox.recordListeningProgress(track, 40, true), 0, 'large seeks must not count');
    assert.equal(state.lastProgressTime, 40);
    assert.equal(sandbox.recordListeningProgress(track, 41, false), 0, 'paused time must not count');
    assert.equal(sandbox.recordListeningProgress(track, 42, true, { suppress: true }), 0, 'private/game time must not count');
    assert.equal(state.totalListeningTime, 12);
});

test('listening totals migrate from history and are included in persistence and backups', () => {
    const helpers = read('js/legacy/helpers.js');
    const appInit = read('js/legacy/app-init.js');
    const queue = read('js/legacy/queue.js');
    const start = helpers.indexOf('function getListeningHistoryTotalSeconds');
    const end = helpers.indexOf('\n\t        function buildPersistedAppStatePayload', start);
    assert.ok(start >= 0 && end > start);

    const sandbox = { state: { totalListeningTime: 0, listeningHistory: {} }, globalThis: null };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(`${helpers.slice(start, end)}\nglobalThis.restoreTotalListeningTime = restoreTotalListeningTime;`, sandbox);
    assert.equal(sandbox.restoreTotalListeningTime({ totalListeningTime: 5, listeningHistory: { a: 10, b: -3, c: 2 } }), 12);
    assert.equal(sandbox.restoreTotalListeningTime({ totalListeningTime: 20, listeningHistory: { a: 10, c: 2 } }), 20);
    assert.match(appInit, /restoreTotalListeningTime\(parsed\)/);
    assert.match(helpers, /totalListeningTime: Math\.max\(0, Number\(state\.totalListeningTime\) \|\| 0\)/);
    assert.doesNotMatch(helpers, /totalListeningTime: trimHistory \? 0/);
    assert.match(appInit, /readPersistedAppState\(null\)/);
    assert.match(queue, /totalListeningTime: Math\.max/);
    assert.match(queue, /restoreTotalListeningTime\(payload\)/);
});

test('desktop metadata scripts are local and provider JSON uses the approved IPC bridge', () => {
    const index = read('index.html');
    const main = read('electron-main.cjs');
    const preload = read('nexplay-next/electron-preload.cjs');
    const onlinePlaylists = read('js/legacy/online-playlists.js');
    const library = read('js/legacy/library.js');

    assert.doesNotMatch(index, /unpkg\.com\/lucide|cdn\.jsdelivr\.net\/npm\/chart\.js|fonts\.googleapis\.com/);
    assert.doesNotMatch(index, /node_modules[\\/]/);
    assert.match(index, /vendor\/lucide\/lucide\.min\.js/);
    assert.match(index, /vendor\/chart\/chart\.umd\.min\.js/);
    assert.match(main, /APPROVED_REMOTE_JSON_HOSTS = new Set\(\[/);
    assert.match(main, /'itunes\.apple\.com'/);
    assert.match(main, /'api\.deezer\.com'/);
    assert.match(main, /'suggestqueries\.google\.com'/);
    assert.match(main, /Content-Security-Policy/);
    assert.match(main, /registerTrustedIpcHandler/);
    assert.match(preload, /fetchApprovedRemoteJson/);
    assert.match(onlinePlaylists, /NexPlayDesktop\?\.fetchApprovedRemoteJson/);
    assert.doesNotMatch(library, /document\.createElement\('script'\)/);
});

test('desktop library index saves are serialized, atomic, and recoverable', () => {
    const main = read('electron-main.cjs');
    assert.match(main, /let localLibraryIndexSaveChain = Promise\.resolve\(\)/);
    assert.match(main, /writeLocalLibraryIndexAtomically/);
    assert.match(main, /fs\.promises\.rename\(tempPath, indexPath\)/);
    assert.match(main, /`\$\{indexPath\}\.bak`/);
    assert.match(main, /recovered: true/);
    assert.doesNotMatch(main, /writeFile\(indexPath, JSON\.stringify/);
});
