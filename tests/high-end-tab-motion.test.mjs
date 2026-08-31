// @ts-nocheck -- Focused legacy browser helpers run in a small VM sandbox.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function read(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const modesSource = read('js/legacy/modals-and-modes.js');
const motionStart = modesSource.indexOf('const HIGH_END_TAB_MOTION_SURFACE_CLASS');
const motionEnd = modesSource.indexOf('function resetMainScrollPosition', motionStart);
assert.ok(motionStart >= 0 && motionEnd > motionStart, 'High End tab motion source should be isolated');
const motionSource = modesSource.slice(motionStart, motionEnd);

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(...names) { names.forEach((name) => values.add(name)); },
        remove(...names) { names.forEach((name) => values.delete(name)); },
        contains(name) { return values.has(name); },
        values
    };
}

function createElement(id = '', children = [], classes = []) {
    const listeners = new Map();
    const styleValues = new Map();
    return {
        id,
        children,
        classList: createClassList(classes),
        style: {
            setProperty(name, value) { styleValues.set(name, String(value)); },
            removeProperty(name) { styleValues.delete(name); },
            values: styleValues
        },
        get childElementCount() { return this.children.length; },
        get firstElementChild() { return this.children[0] || null; },
        getAttribute() { return null; },
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
        dispatch(type, event = {}) {
            const payload = { type, target: this, ...event };
            Array.from(listeners.get(type) || []).forEach((listener) => listener(payload));
        },
        listenerCount(type) { return listeners.get(type)?.size || 0; }
    };
}

function createMotionHarness(options = {}) {
    const panels = Array.from({ length: 12 }, (_, index) => createElement(`panel-${index + 1}`));
    const pageRoot = createElement('settings-page', panels);
    const tracksSurface = createElement('tracks-container', [pageRoot]);
    const hiddenSurface = createElement('hidden-hub', [createElement('hidden-panel')], ['hidden']);
    const scrollArea = createElement('main-scroll-area', [hiddenSurface, tracksSurface]);
    const navButton = createElement('active-nav');
    const bodyClasses = options.bodyClasses || ['performance-preset-high-end'];
    const body = { classList: createClassList(bodyClasses) };
    const state = { activeTab: options.activeTab || 'settings' };
    const runtime = {
        preset: options.preset ?? 'high-end',
        tier: options.tier ?? 'normal',
        osReducedMotion: !!options.osReducedMotion
    };
    const rafCallbacks = new Map();
    const cancelledRafs = new Set();
    const timers = new Map();
    let nextRafId = 0;
    let nextTimerId = 0;
    const document = {
        body,
        hidden: !!options.documentHidden,
        getElementById(id) { return id === 'main-scroll-area' ? scrollArea : null; },
        querySelector(selector) {
            return selector === '#nav-container .accent-bg' && options.navButton !== false ? navButton : null;
        }
    };
    const context = vm.createContext({
        state,
        document,
        window: {
            matchMedia() { return { matches: runtime.osReducedMotion }; }
        },
        getSelectedDesktopPerformancePreset() { return runtime.preset; },
        getEffectivePerformanceTier() { return runtime.tier; },
        requestAnimationFrame(callback) {
            const id = ++nextRafId;
            rafCallbacks.set(id, callback);
            return id;
        },
        cancelAnimationFrame(id) { cancelledRafs.add(id); },
        setTimeout(callback) {
            const id = ++nextTimerId;
            timers.set(id, callback);
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        globalThis: null
    });
    context.globalThis = context;
    new vm.Script(`${motionSource}\nglobalThis.__subject = { shouldRunHighEndTabMotion, getHighEndTabMotionCandidates, scheduleHighEndTabMotion, clearHighEndTabMotion };`).runInContext(context);

    function runNextRaf() {
        const next = Array.from(rafCallbacks.entries()).find(([id]) => !cancelledRafs.has(id));
        if (!next) return false;
        const [id, callback] = next;
        rafCallbacks.delete(id);
        callback(16);
        return true;
    }

    function runAllRafs() {
        let safety = 0;
        while (runNextRaf()) {
            safety += 1;
            assert.ok(safety < 20, 'RAF queue should settle');
        }
    }

    return {
        ...context.__subject,
        context,
        state,
        body,
        scrollArea,
        tracksSurface,
        pageRoot,
        panels,
        navButton,
        runtime,
        cancelledRafs,
        timers,
        runNextRaf,
        runAllRafs
    };
}

function createChangeTabHarness(activeTab = 'stats') {
    const panels = [createElement('header-panel'), createElement('content-panel')];
    const pageRoot = createElement('page-root', panels);
    const tracksSurface = createElement('tracks-container', [pageRoot]);
    const scrollArea = createElement('main-scroll-area', [tracksSurface]);
    const navButton = createElement('active-nav');
    const animationFrames = [];
    const cancelledFrames = new Set();
    const state = {
        activeTab,
        searchQuery: '',
        multiSelectMode: false,
        selectedTrackIds: [],
        tagFilter: null,
        smartFilter: null,
        activePlaylistId: null
    };
    let nextFrameId = 0;
    const document = {
        hidden: false,
        body: { classList: createClassList(['performance-preset-high-end']) },
        getElementById(id) {
            if (id === 'main-scroll-area') return scrollArea;
            return null;
        },
        querySelector(selector) { return selector === '#nav-container .accent-bg' ? navButton : null; }
    };
    const start = modesSource.indexOf('function clearSearch(');
    const end = modesSource.indexOf('function renderNav(', start);
    const context = vm.createContext({
        state,
        document,
        window: { matchMedia() { return { matches: false }; } },
        getSelectedDesktopPerformancePreset() { return 'high-end'; },
        getEffectivePerformanceTier() { return 'normal'; },
        isPrivateSessionRouteActive() { return false; },
        closeTransientPanels() {},
        clearPrivateSessionRoute() {},
        teardownMusicGamesSession: async () => {},
        persistNotyPadNow() {},
        updateBulkBar() {},
        renderNav() {},
        syncLibraryOnlineToggleButton() {},
        renderTracks() {},
        requestAnimationFrame(callback) {
            const id = ++nextFrameId;
            animationFrames.push({ id, callback });
            return id;
        },
        cancelAnimationFrame(id) { cancelledFrames.add(id); },
        setTimeout() { return 1; },
        clearTimeout() {},
        globalThis: null
    });
    context.globalThis = context;
    new vm.Script(`${modesSource.slice(start, end)}\nglobalThis.__subject = { changeTab, clearHighEndTabMotion };`).runInContext(context);
    function runAllFrames() {
        let safety = 0;
        while (animationFrames.length) {
            const { id, callback } = animationFrames.shift();
            if (!cancelledFrames.has(id)) callback(16);
            safety += 1;
            assert.ok(safety < 20, 'navigation RAF queue should settle');
        }
    }
    return { ...context.__subject, state, navButton, panels, runAllFrames };
}

test('High End tab motion respects every performance and accessibility gate', () => {
    const cases = [
        [{}, true, 'High End at the normal tier'],
        [{ preset: 'low-end', tier: 'low', bodyClasses: ['performance-preset-low-end'] }, false, 'Low End preset'],
        [{ preset: '', bodyClasses: [] }, false, 'unselected preset'],
        [{ tier: 'degraded', bodyClasses: ['performance-preset-high-end', 'creative-throttle-degraded'] }, false, 'adaptive degraded tier'],
        [{ tier: 'low', bodyClasses: ['performance-preset-high-end', 'creative-throttle-low'] }, false, 'adaptive low tier'],
        [{ bodyClasses: ['performance-preset-high-end', 'reduce-motion'] }, false, 'NexPlay Reduced Motion'],
        [{ osReducedMotion: true }, false, 'operating-system reduced motion'],
        [{ documentHidden: true }, false, 'hidden document'],
        [{ activeTab: 'online-videos' }, false, 'Online Videos playback surface'],
        [{ activeTab: 'online-music' }, false, 'Online Music playback surface']
    ];
    cases.forEach(([options, expected, label]) => {
        const subject = createMotionHarness(options);
        assert.equal(subject.shouldRunHighEndTabMotion(subject.state.activeTab), expected, label);
        assert.equal(subject.scheduleHighEndTabMotion(subject.state.activeTab), expected, `${label} scheduling`);
    });
});

test('High End tab motion stages the page, caps panel pops, and releases GPU hints', () => {
    const subject = createMotionHarness();
    assert.equal(subject.scheduleHighEndTabMotion('settings'), true);
    assert.equal(subject.panels[0].classList.contains('nexplay-high-end-tab-enter-prep'), true, 'the first panel is prepared before paint');
    assert.equal(subject.panels[1].classList.contains('nexplay-high-end-tab-pop-prep'), true);
    assert.equal(subject.navButton.classList.contains('nexplay-high-end-tab-nav-pop-prep'), true);
    assert.equal(subject.tracksSurface.classList.contains('nexplay-high-end-tab-enter-prep'), false, 'the unbounded container is never promoted');

    assert.equal(subject.runNextRaf(), true, 'the next frame starts the entrance without an unstyled flash');
    assert.equal(subject.tracksSurface.classList.contains('nexplay-high-end-tab-enter'), false);
    assert.equal(subject.panels[0].classList.contains('nexplay-high-end-tab-enter'), true);
    assert.equal(subject.panels.filter((panel) => panel.classList.contains('nexplay-high-end-tab-pop')).length, 8);
    assert.equal(subject.panels[1].style.values.get('--nexplay-tab-pop-index'), '0');
    assert.equal(subject.panels[8].style.values.get('--nexplay-tab-pop-index'), '7');
    assert.equal(subject.panels[9].classList.contains('nexplay-high-end-tab-pop'), false);
    assert.equal(subject.panels[8].listenerCount('animationend'), 1);
    assert.equal(subject.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), true);

    subject.panels[8].dispatch('animationend', { target: subject.panels[0], animationName: 'nexplayHighEndTabPanelPop' });
    assert.equal(subject.panels[0].classList.contains('nexplay-high-end-tab-enter'), true, 'bubbled child events do not clean up early');
    subject.panels[8].dispatch('animationend', { animationName: 'someOtherAnimation' });
    assert.equal(subject.panels[0].classList.contains('nexplay-high-end-tab-enter'), true, 'unrelated animation names do not clean up early');
    subject.panels[8].dispatch('animationend', { animationName: 'nexplayHighEndTabPanelPop' });
    assert.equal(subject.panels[0].classList.contains('nexplay-high-end-tab-enter'), false);
    assert.equal(subject.panels[1].classList.contains('nexplay-high-end-tab-pop'), false);
    assert.equal(subject.panels[1].style.values.has('--nexplay-tab-pop-index'), false);
    assert.equal(subject.panels[8].listenerCount('animationend'), 0);
    assert.equal(subject.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), false);
    assert.equal(subject.timers.size, 0);
});

test('motion target discovery skips libraries immediately and stops at the animation cap', () => {
    const subject = createMotionHarness();
    const libraryRow = createElement('library-row', [], ['library-track-item']);
    let libraryChildrenIterated = false;
    const librarySurface = createElement('tracks-container');
    librarySurface.children = {
        0: libraryRow,
        length: 5000,
        [Symbol.iterator]() {
            libraryChildrenIterated = true;
            throw new Error('library rows should never be scanned for tab motion');
        }
    };
    assert.equal(subject.getHighEndTabMotionCandidates(librarySurface).length, 0);
    assert.equal(libraryChildrenIterated, false);

    let visitedChildren = 0;
    const longSurface = createElement('long-page');
    longSurface.children = {
        length: 1000,
        *[Symbol.iterator]() {
            for (let index = 0; index < 1000; index += 1) {
                visitedChildren += 1;
                yield createElement(`long-panel-${index}`);
            }
        }
    };
    assert.equal(subject.getHighEndTabMotionCandidates(longSurface).length, 9);
    assert.equal(visitedChildren, 9, 'candidate discovery should stop after one stage plus eight pop items');
});

test('nav-only and stage-only motion clean up on their exact animation names', () => {
    const navOnly = createMotionHarness();
    navOnly.tracksSurface.children = [createElement('library-row', [], ['library-track-item'])];
    assert.equal(navOnly.scheduleHighEndTabMotion('settings'), true);
    navOnly.runAllRafs();
    assert.equal(navOnly.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), true);
    navOnly.navButton.dispatch('animationend', { animationName: 'nexplayHighEndTabStageIn' });
    assert.equal(navOnly.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), true);
    navOnly.navButton.dispatch('animationend', { animationName: 'nexplayHighEndTabNavPop' });
    assert.equal(navOnly.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), false);

    const stageOnly = createMotionHarness({ navButton: false });
    stageOnly.pageRoot.children = [stageOnly.panels[0]];
    assert.equal(stageOnly.scheduleHighEndTabMotion('settings'), true);
    stageOnly.runAllRafs();
    assert.equal(stageOnly.pageRoot.classList.contains('nexplay-high-end-tab-enter'), true);
    stageOnly.pageRoot.dispatch('animationcancel', { animationName: 'nexplayHighEndTabNavPop' });
    assert.equal(stageOnly.pageRoot.classList.contains('nexplay-high-end-tab-enter'), true);
    stageOnly.pageRoot.dispatch('animationcancel', { animationName: 'nexplayHighEndTabStageIn' });
    assert.equal(stageOnly.pageRoot.classList.contains('nexplay-high-end-tab-enter'), false);
});

test('rapid tab changes cancel stale frames and animate only the final rendered tab', () => {
    const subject = createMotionHarness({ activeTab: 'stats' });
    assert.equal(subject.scheduleHighEndTabMotion('stats'), true);

    const finalPanels = Array.from({ length: 3 }, (_, index) => createElement(`final-${index + 1}`));
    const finalRoot = createElement('settings-page', finalPanels);
    subject.tracksSurface.children = [finalRoot];
    subject.state.activeTab = 'settings';
    assert.equal(subject.scheduleHighEndTabMotion('settings'), true);
    subject.runAllRafs();

    assert.ok(subject.cancelledRafs.size >= 1, 'the stale start frame is cancelled');
    assert.equal(subject.panels.some((panel) => panel.classList.contains('nexplay-high-end-tab-pop') || panel.classList.contains('nexplay-high-end-tab-pop-prep')), false);
    assert.equal(finalPanels[0].classList.contains('nexplay-high-end-tab-enter'), true);
    assert.equal(finalPanels.slice(1).every((panel) => panel.classList.contains('nexplay-high-end-tab-pop')), true);
    subject.clearHighEndTabMotion();
});

test('fallback and cancellation paths clean prep classes, listeners, timers, and GPU hints', () => {
    const fallback = createMotionHarness();
    fallback.scheduleHighEndTabMotion('settings');
    fallback.runAllRafs();
    const fallbackTimer = Array.from(fallback.timers.values())[0];
    assert.equal(typeof fallbackTimer, 'function');
    fallbackTimer();
    assert.equal(fallback.panels[0].classList.contains('nexplay-high-end-tab-enter'), false);
    assert.equal(fallback.panels[8].listenerCount('animationcancel'), 0);
    assert.equal(fallback.timers.size, 0);

    const cancellations = [
        (subject) => {
            subject.runtime.preset = 'low-end';
            subject.body.classList.remove('performance-preset-high-end');
            subject.body.classList.add('performance-preset-low-end');
        },
        (subject) => {
            subject.runtime.tier = 'degraded';
            subject.body.classList.add('creative-throttle-degraded');
        },
        (subject) => subject.body.classList.add('reduce-motion')
    ];
    cancellations.forEach((mutateRuntime) => {
        const subject = createMotionHarness();
        subject.scheduleHighEndTabMotion('settings');
        subject.runAllRafs();
        mutateRuntime(subject);
        subject.panels[8].dispatch('animationcancel', { animationName: 'nexplayHighEndTabPanelPop' });
        assert.equal(subject.panels[0].classList.contains('nexplay-high-end-tab-enter'), false);
        assert.equal(subject.panels[1].style.values.has('--nexplay-tab-pop-index'), false);
        assert.equal(subject.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), false);
        assert.equal(subject.timers.size, 0);
    });
});

test('same-tab navigation never receives the ephemeral nav pop', async () => {
    const subject = createChangeTabHarness('stats');
    await subject.changeTab('stats');
    subject.runAllFrames();
    assert.equal(subject.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), false);
    assert.equal(subject.navButton.classList.contains('nexplay-high-end-tab-nav-pop-prep'), false);

    await subject.changeTab('settings');
    subject.runAllFrames();
    assert.equal(subject.navButton.classList.contains('nexplay-high-end-tab-nav-pop'), true);
    subject.clearHighEndTabMotion();
});

test('tab motion remains isolated from playback code and forced layout reads', () => {
    assert.doesNotMatch(motionSource, /offsetWidth|offsetHeight|clientWidth|clientHeight|getBoundingClientRect|getComputedStyle/);
    assert.doesNotMatch(motionSource, /iframe|youtube|onlineMusicPlayer|loadTrack|togglePlay|playNext|playPrev|queueEngine|currentTrackId|els\.audio/i);
    assert.match(motionSource, /HIGH_END_TAB_MOTION_MAX_ITEMS = 8/);
    assert.match(motionSource, /tabId === 'online-videos' \|\| tabId === 'online-music'/);

    const changeTabSource = modesSource.slice(
        modesSource.indexOf('async function changeTab'),
        modesSource.indexOf('function renderNav', modesSource.indexOf('async function changeTab'))
    );
    assert.ok(changeTabSource.indexOf('renderTracks();') < changeTabSource.indexOf('scheduleHighEndTabMotion(id);'));
    assert.match(changeTabSource, /if \(routeChanged\) \{[\s\S]*scheduleHighEndTabMotion\(id\);[\s\S]*\}/);
});

test('tab entrance CSS is strictly High End, adaptive-safe, and compositor-only', () => {
    const css = read('css/animations.css');
    const start = css.indexOf('/* High End-only tab entrances.');
    const end = css.indexOf('/* Respect reduced motion preferences */', start);
    assert.ok(start >= 0 && end > start);
    const tabCss = css.slice(start, end);
    assert.match(tabCss, /body\.performance-preset-high-end:not\(\.reduce-motion\):not\(\.creative-throttle-degraded\):not\(\.creative-throttle-low\)/);
    assert.match(tabCss, /nexplayHighEndTabStageIn/);
    assert.match(tabCss, /nexplayHighEndTabPanelPop/);
    assert.match(tabCss, /nexplayHighEndTabNavPop/);
    assert.doesNotMatch(tabCss, /#nav-container \.accent-bg/);
    assert.doesNotMatch(tabCss, /performance-preset-low-end/);
    assert.doesNotMatch(tabCss, /filter:|backdrop-filter:|box-shadow:|width:|height:|top:|left:/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.001ms !important/);
});

test('Windows updater release uses 2.2.1.0 without invalidating npm SemVer', () => {
    const packageJson = JSON.parse(read('package.json'));
    const packageLock = JSON.parse(read('package-lock.json'));
    const updaterProject = read('tools/NexPlayUpdaterExe/NexPlayUpdaterExe.csproj');
    const releaseScript = read('scripts/Create-NexPlayUpdatePackage.ps1');
    assert.equal(packageJson.version, '2.2.1');
    assert.equal(packageJson.build.buildVersion, '2.2.1.0');
    assert.equal(packageLock.version, '2.2.1');
    assert.equal(packageLock.packages[''].version, '2.2.1');
    for (const field of ['Version', 'InformationalVersion', 'AssemblyVersion', 'FileVersion']) {
        assert.match(updaterProject, new RegExp(`<${field}>2\\.2\\.1\\.0<\\/${field}>`));
    }
    assert.match(releaseScript, /\$BuildVersion = if \(\$PackageJson\.build -and \$PackageJson\.build\.buildVersion\)/);
    assert.match(releaseScript, /\$Version = if \(\[string\]::IsNullOrWhiteSpace\(\$BuildVersion\)\)[\s\S]*\$BuildVersion/);
});
