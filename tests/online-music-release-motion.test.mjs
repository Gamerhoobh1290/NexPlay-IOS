// @ts-nocheck -- Source-contract assertions intentionally inspect browser templates as text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function read(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function sliceFunction(source, signature, nextSignature) {
    const start = source.lastIndexOf(signature);
    assert.notEqual(start, -1, `${signature} should exist`);
    const end = source.indexOf(nextSignature, start);
    assert.ok(end > start, `${signature} should end before ${nextSignature}`);
    return source.slice(start, end);
}

const onlineMusicSource = read('js/legacy/online-music.js');
const runtimeConfigSource = read('js/legacy/runtime-config.js');
const animationCss = read('css/animations.css');

test('release-track loading and ready content expose stable accessible hooks', () => {
    const releaseView = sliceFunction(
        onlineMusicSource,
        'function renderOnlineMusicReleaseView(',
        'function renderOnlineMusicContent('
    );

    assert.match(releaseView, /data-online-music-release-track-region/);
    assert.match(releaseView, /data-online-music-release-state=/);
    assert.match(releaseView, /aria-busy=/);
    assert.match(releaseView, /role="status"/);
    assert.match(releaseView, /aria-live="polite"/);
    assert.match(releaseView, /online-music-release-skeleton/);
    assert.match(releaseView, /online-music-release-skeleton-row/);
    assert.match(releaseView, /online-music-release-tracks-enter/);
    assert.match(releaseView, /renderOnlineMusicTrackRows\([^)]*,\s*\{\s*context:\s*'release'\s*\}\)/);
});

test('release-track entrance is an initialized one-shot flag consumed by the release renderer', () => {
    const defaultStateStart = runtimeConfigSource.indexOf('function createDefaultOnlineMusicState()');
    const defaultStateEnd = runtimeConfigSource.indexOf('function createDefaultPrivateSessionState()', defaultStateStart);
    assert.ok(defaultStateStart >= 0 && defaultStateEnd > defaultStateStart);
    const defaultState = runtimeConfigSource.slice(defaultStateStart, defaultStateEnd);
    assert.match(defaultState, /browserReleaseTrackEntrancePending:\s*false/);

    const openRelease = sliceFunction(
        onlineMusicSource,
        'async function openOnlineMusicRelease(',
        'function returnToOnlineMusicSearch('
    );
    const loadingResetIndex = openRelease.indexOf('online.browserReleaseTrackEntrancePending = false;');
    const initialRenderIndex = openRelease.indexOf('renderOnlineMusicContent();');
    const awaitedLoadIndex = openRelease.indexOf('await loadOnlineMusicReleaseTracks');
    const networkReadyIndex = openRelease.indexOf('online.browserReleaseTrackEntrancePending = true;', awaitedLoadIndex);
    const finalRenderIndex = openRelease.indexOf('renderOnlineMusicContent();', networkReadyIndex);
    assert.ok(loadingResetIndex >= 0 && loadingResetIndex < initialRenderIndex, 'loading starts with no stale entrance pending');
    assert.ok(awaitedLoadIndex >= 0 && networkReadyIndex > awaitedLoadIndex, 'a successful ready transition arms the entrance');
    assert.ok(finalRenderIndex > networkReadyIndex, 'the armed entrance is rendered immediately');

    const releaseView = sliceFunction(
        onlineMusicSource,
        'function renderOnlineMusicReleaseView(',
        'function renderOnlineMusicContent('
    );
    const pendingRead = releaseView.indexOf('online.browserReleaseTrackEntrancePending');
    const pendingReset = releaseView.indexOf('online.browserReleaseTrackEntrancePending = false;');
    const wrapperClass = releaseView.indexOf('online-music-release-tracks-enter');
    assert.ok(pendingRead >= 0, 'the renderer should read the pending flag');
    assert.ok(pendingReset > pendingRead, 'the renderer should consume the pending flag immediately');
    assert.ok(wrapperClass > pendingReset, 'the consumed value should decide the one-shot wrapper class');

    const genericRender = sliceFunction(
        onlineMusicSource,
        'function renderOnlineMusicContent(',
        'const DESKTOP_ONLINE_MUSIC_SEARCH_CACHE_TTL_MS'
    );
    assert.doesNotMatch(genericRender, /browserReleaseTrackEntrancePending\s*=\s*true/);
});

test('release motion CSS is strictly High End, adaptive-safe, and compositor-only', () => {
    const highEndGate = String.raw`body\.performance-preset-high-end:not\(\.reduce-motion\):not\(\.creative-throttle-degraded\):not\(\.creative-throttle-low\)`;
    assert.match(animationCss, new RegExp(`${highEndGate}[^\\{]*\\.online-music-release-skeleton`));
    assert.match(animationCss, new RegExp(`${highEndGate}[^\\{]*\\.online-music-release-tracks-enter`));
    assert.match(animationCss, /online-music-release-skeleton-row/);

    const motionStart = animationCss.indexOf('.online-music-release-skeleton');
    const reducedMotionStart = animationCss.indexOf('@media (prefers-reduced-motion: reduce)', motionStart);
    assert.ok(motionStart >= 0 && reducedMotionStart > motionStart, 'release motion should precede its reduced-motion guard');
    const motionCss = animationCss.slice(motionStart, reducedMotionStart);
    assert.doesNotMatch(motionCss, /performance-preset-low-end/);
    assert.doesNotMatch(motionCss, /filter:|backdrop-filter:|box-shadow:|\bwidth:|\bheight:|\btop:|\bleft:/);
    assert.match(motionCss, /transform:/);
    assert.match(motionCss, /opacity:/);

    const reducedMotionCss = animationCss.slice(reducedMotionStart);
    assert.match(reducedMotionCss, /online-music-release-skeleton/);
    assert.match(reducedMotionCss, /online-music-release-tracks-enter/);
    assert.match(reducedMotionCss, /animation:\s*none\s*!important/);
});

test('online music keeps performance-preset policy out of discovery and playback code', () => {
    assert.doesNotMatch(onlineMusicSource, /desktopPerformancePreset|performance-preset-(?:low-end|high-end)/);
});

test('artist and release navigation reset the online surface to its header', () => {
    const openRelease = sliceFunction(
        onlineMusicSource,
        'async function openOnlineMusicRelease(',
        'function returnToOnlineMusicSearch('
    );
    const renderer = sliceFunction(
        onlineMusicSource,
        'function renderOnlineMusicContent(',
        'const DESKTOP_ONLINE_MUSIC_SEARCH_CACHE_TTL_MS'
    );
    assert.match(openRelease, /renderOnlineMusicContent\(\{ resetScroll: true \}\)/);
    assert.match(renderer, /document\.getElementById\('main-scroll-area'\)/);
    assert.match(renderer, /scrollArea\.style\.scrollBehavior = 'auto'/);
    assert.match(renderer, /scrollArea\.scrollTop = 0/);
    assert.match(renderer, /requestAnimationFrame\(\(\) =>/);
});
