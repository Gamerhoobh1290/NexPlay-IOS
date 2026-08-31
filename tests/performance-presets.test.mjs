// @ts-nocheck -- Focused legacy browser helpers run in small VM sandboxes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function read(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function sliceBetween(source, startNeedle, endNeedle) {
    const start = source.indexOf(startNeedle);
    const end = source.indexOf(endNeedle, start + startNeedle.length);
    assert.ok(start >= 0 && end > start, `Expected source slice ${startNeedle} -> ${endNeedle}`);
    return source.slice(start, end);
}

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(...names) { names.forEach((name) => values.add(name)); },
        remove(...names) { names.forEach((name) => values.delete(name)); },
        contains(name) { return values.has(name); },
        toggle(name, enabled) {
            const shouldEnable = enabled === undefined ? !values.has(name) : !!enabled;
            if (shouldEnable) values.add(name);
            else values.delete(name);
            return shouldEnable;
        },
        values
    };
}

test('desktop performance preset storage accepts only the two supported values', () => {
    const helpers = read('js/legacy/helpers.js');
    const source = sliceBetween(
        helpers,
        'function normalizeDesktopPerformancePreset',
        'function readStorageJson'
    );
    const storage = new Map([['nexplay_desktop_performance_preset_v1', 'turbo']]);
    const state = { desktopPerformancePreset: '' };
    const context = vm.createContext({
        state,
        DESKTOP_PERFORMANCE_PRESET_STORAGE_KEY: 'nexplay_desktop_performance_preset_v1',
        readStorageValue(key, fallback) { return storage.has(key) ? storage.get(key) : fallback; },
        writeStorageValue(key, value) { storage.set(key, String(value)); return true; },
        globalThis: null
    });
    context.globalThis = context;
    new vm.Script(`${source}\nglobalThis.__subject = { normalizeDesktopPerformancePreset, readDesktopPerformancePreset, loadDesktopPerformancePreset, persistDesktopPerformancePreset };`).runInContext(context);

    const subject = context.__subject;
    assert.equal(subject.loadDesktopPerformancePreset(), '', 'invalid persisted values prompt again');
    assert.equal(state.desktopPerformancePreset, '');
    assert.equal(subject.persistDesktopPerformancePreset('automatic'), false);
    assert.equal(storage.get('nexplay_desktop_performance_preset_v1'), 'turbo');
    assert.equal(subject.persistDesktopPerformancePreset('low-end'), true);
    assert.equal(subject.readDesktopPerformancePreset(), 'low-end');
    assert.equal(subject.persistDesktopPerformancePreset('high-end'), true);
    assert.equal(subject.readDesktopPerformancePreset(), 'high-end');
});

test('desktop onboarding appears only while a normal-route preset is unselected', () => {
    const performanceSource = sliceBetween(
        read('js/legacy/theme-and-shortcuts.js'),
        'const PERFORMANCE_TIER_ORDER',
        '// Map visualizer style id'
    );
    const badgeLow = { classList: createClassList(['hidden']) };
    const badgeHigh = { classList: createClassList(['hidden']) };
    const makeChoice = (preset, badge) => ({
        disabled: false,
        classList: createClassList(),
        getAttribute(name) { return name === 'data-performance-choice' ? preset : ''; },
        querySelector() { return badge; },
        focus() { document.activeElement = this; }
    });
    const lowChoice = makeChoice('low-end', badgeLow);
    const highChoice = makeChoice('high-end', badgeHigh);
    const modal = {
        classList: createClassList(['hidden']),
        attributes: new Map([['aria-hidden', 'true']]),
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        querySelectorAll() { return [lowChoice, highChoice]; },
        querySelector(selector) { return selector.includes('high-end') ? highChoice : lowChoice; },
        focus() { document.activeElement = this; }
    };
    const document = {
        activeElement: null,
        hidden: false,
        body: {
            classList: createClassList(),
            setAttribute() {},
            removeAttribute() {}
        },
        getElementById(id) { return id === 'performance-preset-modal' ? modal : null; }
    };
    const state = {
        desktopPerformancePreset: '',
        perfPolicy: { fps: 60, tier: 'normal', updatedAt: 1 },
        isPlaying: false,
        activeTab: 'all'
    };
    const context = vm.createContext({
        state,
        document,
        navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
        perfSamplerRafId: 0,
        perfSamplerTimeoutId: null,
        performance: { now: () => 0 },
        requestAnimationFrame(callback) { callback(0); return 1; },
        cancelAnimationFrame() {},
        setTimeout() { return 1; },
        clearTimeout() {},
        persistDesktopPerformancePreset() { return true; },
        globalThis: null
    });
    context.globalThis = context;
    new vm.Script(`${performanceSource}\nglobalThis.__subject = { maybeShowDesktopPerformancePresetOnboarding };`).runInContext(context);

    assert.equal(context.__subject.maybeShowDesktopPerformancePresetOnboarding({ route: 'private-session' }), false);
    assert.equal(modal.classList.contains('hidden'), true);
    assert.equal(context.__subject.maybeShowDesktopPerformancePresetOnboarding({ route: 'app' }), true);
    assert.equal(modal.classList.contains('is-open'), true);
    assert.equal(modal.attributes.get('aria-hidden'), 'false');
    assert.equal(document.activeElement, highChoice);
    assert.equal(badgeHigh.classList.contains('hidden'), false);

    state.desktopPerformancePreset = 'high-end';
    modal.classList.add('hidden');
    assert.equal(context.__subject.maybeShowDesktopPerformancePresetOnboarding({ route: 'app' }), false);
});

test('preset UI is desktop-only, persisted before rendering, and available in Settings', () => {
    const index = read('index.html');
    const mobile = read('NexPlay.mobile.html');
    const init = read('js/legacy/app-init.js');
    const settings = read('js/legacy/settings-and-video.js');

    assert.match(index, /id="performance-preset-modal"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/);
    assert.match(index, /data-performance-choice="low-end"/);
    assert.match(index, /data-performance-choice="high-end"/);
    assert.doesNotMatch(mobile, /performance-preset-modal|nexplay_desktop_performance_preset_v1/);
    assert.ok(init.indexOf('loadDesktopPerformancePreset();') < init.indexOf('renderTracks();'));
    assert.ok(init.indexOf('maybeShowDesktopPerformancePresetOnboarding') < init.indexOf("window.dispatchEvent(new CustomEvent('nexplay:app-ready'"));
    assert.match(settings, /data-settings-performance-preset="\$\{preset\}"/);
    assert.match(settings, /Saved on this PC until you change it/);
    assert.match(settings, /Reduced Motion remains a separate accessibility preference/);
});

test('performance presets do not enter player, queue, feature-toggle, or YouTube code paths', () => {
    const performanceSource = sliceBetween(
        read('js/legacy/theme-and-shortcuts.js'),
        'const PERFORMANCE_TIER_ORDER',
        '// Map visualizer style id'
    );
    assert.doesNotMatch(performanceSource, /ensureOnlineMusicPlayer|prewarmOnlineMusicPlayer|playOnlineMusic|loadTrack|els\.audio|onlineMusicPlayer|currentTrackId|queueEngine|playNext|playPrev|setFeatureEnabled|disableWindowedHeavyFeatures/);

    for (const path of ['js/legacy/online-music.js', 'js/legacy/player.js', 'online-music.js']) {
        assert.doesNotMatch(read(path), /desktopPerformancePreset|performance-preset-(?:low-end|high-end)/, `${path} must remain preset-free`);
    }
});
