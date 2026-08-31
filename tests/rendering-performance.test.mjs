// @ts-nocheck -- Legacy browser functions are evaluated in a focused VM sandbox.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function read(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function getPerformanceSamplerSource() {
    const source = read('js/legacy/theme-and-shortcuts.js');
    const start = source.indexOf('const PERFORMANCE_TIER_ORDER');
    const end = source.indexOf('// Map visualizer style id', start);
    assert.ok(start >= 0 && end > start, 'performance sampler source should be extractable');
    return source.slice(start, end);
}

function createPerformanceSamplerSubject({
    isPlaying = true,
    updatedAt = 1,
    hardwareConcurrency = 8,
    deviceMemory = 8,
    performancePreset = ''
} = {}) {
    let now = 0;
    let wallClock = Math.max(1, updatedAt);
    let nextFrame = null;
    let nextTimeout = null;
    let frameId = 0;
    const classes = new Set();
    const attributes = new Map();
    const state = {
        isPlaying,
        windowedModeActive: false,
        fsModeActive: false,
        videoFsModeActive: false,
        activeTab: 'all',
        desktopPerformancePreset: performancePreset,
        perfPolicy: { fps: 60, tier: 'normal', updatedAt }
    };
    const context = vm.createContext({
        state,
        perfSamplerRafId: null,
        perfSamplerTimeoutId: null,
        navigator: { hardwareConcurrency, deviceMemory },
        performance: { now: () => now },
        Date: { now: () => ++wallClock },
        document: {
            hidden: false,
            body: {
                classList: {
                    toggle(name, enabled) {
                        if (enabled) classes.add(name);
                        else classes.delete(name);
                    }
                },
                setAttribute(name, value) { attributes.set(name, String(value)); },
                removeAttribute(name) { attributes.delete(name); }
            }
        },
        requestAnimationFrame(callback) {
            nextFrame = callback;
            frameId += 1;
            return frameId;
        },
        cancelAnimationFrame() { nextFrame = null; },
        setTimeout(callback, delay) {
            nextTimeout = { callback, delay };
            return 1;
        },
        clearTimeout() { nextTimeout = null; },
        globalThis: null
    });
    context.globalThis = context;
    new vm.Script(`${getPerformanceSamplerSource()}\n` +
        'globalThis.__subject = { startPerfSampler, proposeMeasuredPerformanceTier, getEffectivePerformanceTier, getDesktopPerformancePresetRecommendation, applyDesktopPerformancePresetRuntime };').runInContext(context);

    function runSample(fps) {
        const previousUpdatedAt = state.perfPolicy.updatedAt;
        const frameDuration = 1000 / fps;
        for (let safety = 0; state.perfPolicy.updatedAt === previousUpdatedAt && safety < 1000; safety += 1) {
            assert.equal(typeof nextFrame, 'function', 'sampler should have a pending animation frame');
            const callback = nextFrame;
            nextFrame = null;
            now += frameDuration;
            callback(now);
        }
        assert.notEqual(state.perfPolicy.updatedAt, previousUpdatedAt, 'sample window should finish');
        return state.perfPolicy.tier;
    }

    return {
        ...context.__subject,
        state,
        classes,
        attributes,
        runSample,
        start() { context.__subject.startPerfSampler(); },
        get pendingTimeout() { return nextTimeout; }
    };
}

test('rendering transitions name only the properties that visually change', () => {
    const components = read('css/components.css');
    assert.doesNotMatch(components, /transition\s*:\s*all\b/i);
    assert.doesNotMatch(components, /\.holo-card::before[\s\S]*?transition\s*:\s*[\d.]+s/);
    assert.match(components, /\.holo-card::before[\s\S]*?transition:\s*left 0\.5s/);
    assert.match(components, /\[data-view="list"\]\.library-track-item[\s\S]*?background-color[\s\S]*?border-color[\s\S]*?box-shadow[\s\S]*?transform/);
});

test('fullscreen lyric animation restarts without a synchronous layout read', () => {
    const source = read('js/legacy/theme-and-shortcuts.js');
    const start = source.indexOf('function updateFsModeLyricOverlay');
    const end = source.indexOf('// Crossfade configuration', start);
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end);
    assert.doesNotMatch(body, /offsetWidth|offsetHeight|getBoundingClientRect/);
    assert.match(body, /cancelAnimationFrame\(fsModeLyricAnimationRafId\)/);
    assert.match(body, /requestAnimationFrame\(\(\) =>/);
    assert.match(body, /wrap\.dataset\.currentText !== currentText/);
});

test('video hover and scrub paths share invalidatable geometry measurements', () => {
    const source = read('js/legacy/settings-and-video.js');
    const start = source.indexOf('function setupVideoFsInteractions');
    const end = source.indexOf('function surpriseMe', start);
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end);
    assert.equal((body.match(/progressWrap\.getBoundingClientRect\(\)/g) || []).length, 1);
    assert.equal((body.match(/hoverPreview\.offsetWidth/g) || []).length, 1);
    assert.match(body, /const getProgressGeometry/);
    assert.match(body, /new ResizeObserver\(invalidateProgressGeometry\)/);
    assert.match(body, /lastHoverEvent = \{ clientX: evt\.clientX \}/);
    assert.doesNotMatch(body, /hoverPreview\.style\.opacity/);
});

test('library rendering preserves normal entrances and caps low-tier animation work', () => {
    const source = read('js/legacy/rendering.js');
    const start = source.indexOf('function renderTracks');
    const end = source.indexOf('function shouldCropWindowedCoverArt', start);
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end);
    assert.match(body, /performanceTier === 'low'\s*\? 20/);
    assert.match(body, /performanceTier === 'degraded'[\s\S]*?\? 48[\s\S]*?: 160/);
    assert.match(body, /animateTrackRows && i < libraryEntranceAnimationLimit/);
    assert.match(body, /performanceTier === 'low'[\s\S]*?'0\.32s'[\s\S]*?'0\.36s'/);
    assert.match(body, /'0\.55s'[\s\S]*?'0\.65s'/);
    assert.match(body, /entranceDelayLimit = performanceTier === 'low' \? 8 : 16/);
    assert.match(body, /entranceDelayStep = performanceTier === 'low' \? 0\.012 : 0\.018/);
    assert.match(body, /state\.viewMode === 'list' \? 6 : 8/);
    assert.match(body, /loading="\$\{artworkLoading\}" decoding="async"/);
    assert.doesNotMatch(body, /class="[^"]*transition-all/);
});

test('performance tier thresholds have directional hysteresis', () => {
    const subject = createPerformanceSamplerSubject();
    assert.equal(subject.proposeMeasuredPerformanceTier('normal', 43), 'degraded');
    assert.equal(subject.proposeMeasuredPerformanceTier('normal', 44), 'normal');
    assert.equal(subject.proposeMeasuredPerformanceTier('degraded', 28), 'low');
    assert.equal(subject.proposeMeasuredPerformanceTier('degraded', 51), 'degraded');
    assert.equal(subject.proposeMeasuredPerformanceTier('degraded', 52), 'normal');
    assert.equal(subject.proposeMeasuredPerformanceTier('low', 38), 'low');
    assert.equal(subject.proposeMeasuredPerformanceTier('low', 39), 'degraded');

    subject.start();
    assert.equal(subject.runSample(20), 'normal', 'one slow sample must not degrade the tier');
    assert.equal(subject.runSample(20), 'low', 'two slow samples may enter the low tier');
    assert.equal(subject.attributes.get('data-perf-tier'), 'low');
    assert.equal(subject.runSample(60), 'low');
    assert.equal(subject.runSample(60), 'low');
    assert.equal(subject.runSample(60), 'degraded', 'recovery requires three stable samples');
    assert.equal(subject.runSample(60), 'degraded');
    assert.equal(subject.runSample(60), 'degraded');
    assert.equal(subject.runSample(60), 'normal');
    assert.equal(subject.attributes.has('data-perf-tier'), false);
});

test('low-end tier hint works without any optional creative feature', () => {
    const subject = createPerformanceSamplerSubject({
        isPlaying: false,
        updatedAt: 0,
        hardwareConcurrency: 2,
        deviceMemory: 2
    });
    subject.start();
    assert.equal(subject.state.perfPolicy.tier, 'degraded');
    assert.equal(subject.getDesktopPerformancePresetRecommendation(), 'low-end');
    assert.equal(subject.attributes.get('data-perf-tier'), 'degraded');
    assert.equal(subject.classes.has('creative-throttle-degraded'), true);

    const samplerSource = getPerformanceSamplerSource();
    assert.doesNotMatch(samplerSource, /FEATURE_REGISTRY|isFeatureEnabled|hasCreativeLoad/);
});

test('desktop presets separate the saved visual policy from measured performance', () => {
    const low = createPerformanceSamplerSubject({ performancePreset: 'low-end' });
    const protectedState = {
        isPlaying: low.state.isPlaying,
        activeTab: low.state.activeTab,
        queue: [{ id: 'q1' }],
        featureToggles: { visualizer: true },
        currentTrackId: 'track-1'
    };
    Object.assign(low.state, structuredClone(protectedState));
    low.applyDesktopPerformancePresetRuntime();
    assert.equal(low.getEffectivePerformanceTier(), 'low');
    assert.equal(low.state.perfPolicy.tier, 'normal', 'the measured tier remains independent');
    assert.equal(low.classes.has('performance-preset-low-end'), true);
    assert.equal(low.attributes.get('data-performance-preset'), 'low-end');
    assert.deepEqual(
        {
            isPlaying: low.state.isPlaying,
            activeTab: low.state.activeTab,
            queue: low.state.queue,
            featureToggles: low.state.featureToggles,
            currentTrackId: low.state.currentTrackId
        },
        protectedState,
        'app features and playback state must not change'
    );

    const high = createPerformanceSamplerSubject({ performancePreset: 'high-end' });
    high.applyDesktopPerformancePresetRuntime();
    assert.equal(high.getEffectivePerformanceTier(), 'normal');
    high.start();
    high.runSample(20);
    high.runSample(20);
    assert.equal(high.state.perfPolicy.tier, 'low', 'High End keeps adaptive protection');
    assert.equal(high.getEffectivePerformanceTier(), 'low');
});

test('visualizer caches logarithmic band boundaries without changing energy samples', () => {
    const source = read('js/legacy/visualizer.js');
    const start = source.indexOf('function getLogBandRanges');
    const end = source.indexOf('function smoothBand', start);
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end);
    assert.match(body, /const key = `\$\{bufferLength\}:\$\{bands\}`/);
    assert.match(body, /logBandRangeCache\.key === key/);
    assert.match(body, /Math\.pow\(startNorm, curve\)/);
    assert.match(body, /for \(let i = range\.start; i <= range\.end && i < bufferLength; i \+= 1\)/);
});

test('low-tier cards use a short response-focused transition', () => {
    const theme = read('css/theme.css');
    const lowCardStart = theme.indexOf('body.creative-throttle-low .holo-card');
    const lowMeshStart = theme.indexOf('body.creative-throttle-low .mesh-bg', lowCardStart);
    assert.ok(lowCardStart >= 0 && lowMeshStart > lowCardStart);
    const lowCardRule = theme.slice(lowCardStart, lowMeshStart);
    assert.match(lowCardRule, /transition-duration:\s*160ms/);
    assert.doesNotMatch(lowCardRule, /animation-duration/);
});
