import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');
const modesSource = fs.readFileSync(new URL('../js/legacy/modals-and-modes.js', import.meta.url), 'utf8');

function createNavigationSubject({ activeTab = 'all', searchQuery = '' } = {}) {
    const start = modesSource.indexOf('function clearSearch(');
    const end = modesSource.indexOf('function renderNav(', start);
    assert.notEqual(start, -1, 'clearSearch source should exist');
    assert.notEqual(end, -1, 'renderNav boundary should exist');

    const scrollArea = { scrollTop: 240, scrollLeft: 32, style: {} };
    const searchInput = { value: searchQuery };
    const searchClear = {
        classList: {
            add() {},
            toggle() {}
        }
    };
    /** @type {Array<{ preserveScroll?: boolean } | undefined>} */
    const renderCalls = [];
    /** @type {Array<(timestamp?: number) => void>} */
    const animationFrames = [];
    const context = vm.createContext({
        state: {
            activeTab,
            searchQuery,
            multiSelectMode: false,
            selectedTrackIds: [],
            tagFilter: null,
            smartFilter: null,
            activePlaylistId: null
        },
        document: {
            /** @param {string} id */
            getElementById(id) {
                if (id === 'main-scroll-area') return scrollArea;
                if (id === 'search-input') return searchInput;
                if (id === 'search-clear') return searchClear;
                return null;
            }
        },
        closeTransientPanels() {},
        isPrivateSessionRouteActive() { return false; },
        clearPrivateSessionRoute() {},
        async teardownMusicGamesSession() {},
        persistNotyPadNow() {},
        updateBulkBar() {},
        renderNav() {},
        syncLibraryOnlineToggleButton() {},
        /** @param {(timestamp?: number) => void} callback */
        requestAnimationFrame(callback) {
            animationFrames.push(callback);
            return animationFrames.length;
        },
        /** @param {{ preserveScroll?: boolean }} [options] */
        renderTracks(options) { renderCalls.push(options); }
    });

    const subjectSource = `${modesSource.slice(start, end)}\n` +
        'globalThis.__subject = { clearSearch, changeTab };';
    new vm.Script(subjectSource).runInContext(context);
    return { ...context.__subject, context, renderCalls, scrollArea, animationFrames };
}

test('original sidebar presentation stays unchanged', () => {
    assert.match(html, /class="flex-1 overflow-y-auto py-6 px-3 space-y-8 scrollbar-hide"/);
    assert.doesNotMatch(html, /id="sidebar-scroll-region"/);
    assert.doesNotMatch(css, /#sidebar-scroll-region/);
});

test('original floating-player layout stays unchanged', () => {
    assert.match(html, /class="flex-1 overflow-y-auto px-4 md:px-8 pb-32 z-10 scroll-smooth custom-scrollbar" id="main-scroll-area"/);
    assert.match(css, /#main-scroll-area\s*\{[^}]*scroll-padding-block-end:\s*10rem/s);
    assert.match(html, /<!-- FLOATING PLAYER CAPSULE -->/);
    assert.match(html, /<div class="relative w-14 h-14 md:w-16 md:h-16 shrink-0 cursor-pointer group" onclick="openNowPlaying\(\)">\s*<img id="mini-cover"[^>]*rounded-full[^>]*border-2 border-white\/10[^>]*group-hover:border-cyan-400/);
    assert.doesNotMatch(html, /id="(?:app|workspace)-shell"/);
    assert.doesNotMatch(css, /--nexplay-player-dock-space/);
});

test('empty-state clear search rerenders even with the legacy silent argument', () => {
    const subject = createNavigationSubject({ searchQuery: 'no matches' });
    subject.clearSearch(null, true);
    assert.equal(subject.context.state.searchQuery, '');
    assert.equal(subject.renderCalls.length, 1);
    assert.equal(subject.renderCalls[0].preserveScroll, true);
});

test('changeTab resets main scroll only when the route actually changes', async () => {
    const subject = createNavigationSubject({ activeTab: 'all', searchQuery: 'query' });
    await subject.changeTab('stats');
    assert.equal(subject.scrollArea.scrollTop, 0);
    assert.equal(subject.scrollArea.scrollLeft, 0);
    assert.equal(subject.scrollArea.style.overflowAnchor, 'none');
    assert.equal(subject.renderCalls.length, 1, 'route render should not be duplicated by clearing search');

    subject.scrollArea.scrollTop = 983;
    subject.scrollArea.scrollLeft = 17;
    subject.animationFrames.shift()();
    assert.equal(subject.scrollArea.scrollTop, 0, 'first paint should defeat delayed scroll anchoring');
    subject.scrollArea.scrollTop = 501;
    subject.animationFrames.shift()();
    assert.equal(subject.scrollArea.scrollTop, 0, 'second paint should catch a later anchor adjustment');
    assert.equal(subject.scrollArea.style.overflowAnchor, '');

    subject.scrollArea.scrollTop = 120;
    subject.scrollArea.scrollLeft = 16;
    await subject.changeTab('stats');
    assert.equal(subject.scrollArea.scrollTop, 120);
    assert.equal(subject.scrollArea.scrollLeft, 16);
});
