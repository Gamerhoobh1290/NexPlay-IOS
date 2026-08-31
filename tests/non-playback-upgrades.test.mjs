// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mobileHtml = readFileSync(new URL('../NexPlay.mobile.html', import.meta.url), 'utf8');

function sliceBetween(source, startNeedle, endNeedle) {
    const start = source.indexOf(startNeedle);
    assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`);
    const end = source.indexOf(endNeedle, start + startNeedle.length);
    assert.notEqual(end, -1, `Missing end marker: ${endNeedle}`);
    return source.slice(start, end);
}

test('mobile online search rejects stale commits and coalesces bounded provider work', () => {
    const coordinator = sliceBetween(
        mobileHtml,
        'function normalizeOnlineMusicSearchCacheKey',
        'async function handleOnlineMusicContentClick'
    );
    const search = sliceBetween(
        mobileHtml,
        'async function searchOnlineMusic()',
        'async function handleOnlineMusicContentClick'
    );

    assert.match(mobileHtml, /const ONLINE_MUSIC_SEARCH_CACHE_MAX_ENTRIES = 12/);
    assert.match(coordinator, /onlineMusicSearchCache\.size > ONLINE_MUSIC_SEARCH_CACHE_MAX_ENTRIES/);
    assert.match(coordinator, /Promise\.race\(/);
    assert.match(coordinator, /ONLINE_MUSIC_SEARCH_PROVIDER_TIMEOUT_MS/);
    assert.match(search, /\+\+onlineMusicSearchRequestSequence/);
    assert.match(search, /onlineMusicSearchInFlight\.get\(inFlightKey\)/);
    assert.match(search, /requestId === onlineMusicSearchRequestSequence/);
    assert.match(search, /const discoveryCacheScope = !!getConfiguredOnlineMusicApiKey\(\)/);
    assert.match(search, /youtube:\$\{discoveryCacheScope \? '1' : '0'\}/);
    assert.doesNotMatch(search, /youtube:\$\{shouldTryYouTubeDiscovery \? '1' : '0'\}/);
    assert.match(search, /online\.browserView === 'search'/);
    assert.match(search, /task\.subscribers\.add\(commitPartialResults\)/);
    assert.match(search, /if \(!isCurrentRequest\(\)\) return/);
});

test('mobile low-end policy backs off while idle and keeps degradation independent of creative toggles', () => {
    const sampler = sliceBetween(
        mobileHtml,
        'function startPerfSampler()',
        '// Map visualizer style id to a friendly label'
    );
    const runtimeGuards = sliceBetween(
        mobileHtml,
        'function applyFeatureRuntimeGuards()',
        'function refreshFeatureRuntime'
    );

    assert.match(sampler, /const idleSampleDelayMs = 1500/);
    assert.match(sampler, /if \(!isContinuousSamplingUseful\(\)\)/);
    assert.match(sampler, /queueNext\(idleSampleDelayMs\)/);
    assert.match(sampler, /const shouldDegrade = nextTier !== 'normal'/);
    assert.doesNotMatch(sampler, /const shouldDegrade = hasCreativeLoad/);
    assert.match(runtimeGuards, /const currentPerfTier = state\.perfPolicy\?\.tier \|\| 'normal'/);
    assert.match(runtimeGuards, /const shouldDegradeForPerformance = currentPerfTier !== 'normal'/);
});

test('mobile library bounds entrance animation work and lazily decodes offscreen artwork', () => {
    const desktopStyleRenderer = sliceBetween(
        mobileHtml,
        'function renderTracks(opts = {})',
        'function syncWindowedOnlineCoverCrop'
    );
    const mobileFeedRenderer = sliceBetween(
        mobileHtml,
        'function renderMobileTrackRow',
        'function openMobileLibraryFilter'
    );

    assert.match(desktopStyleRenderer, /const animatedEntryLimit = libraryPerfTier === 'low' \? 6/);
    assert.match(desktopStyleRenderer, /const animationStyle = i < animatedEntryLimit/);
    assert.match(desktopStyleRenderer, /loading="\$\{i < 8 \? 'eager' : 'lazy'\}" decoding="async"/);
    assert.match(mobileFeedRenderer, /loading="\$\{index < 6 \? 'eager' : 'lazy'\}" decoding="async"/);
    assert.match(mobileFeedRenderer, /renderMobileTrackRow\(track, index\)/);
    assert.match(mobileFeedRenderer, /renderMobileGridTrackCard\(track, index\)/);
});
