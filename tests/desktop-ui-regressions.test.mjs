import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const css = fs.readFileSync(new URL('../css/components.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Returns the declarations of every rule whose selector list matches `selectorPattern`.
 * @param {RegExp} selectorPattern
 */
function declarationsFor(selectorPattern) {
    const blocks = [];
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = rulePattern.exec(css))) {
        if (selectorPattern.test(match[1].trim())) blocks.push(match[2]);
    }
    return blocks.join('\n');
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const legacySources = ['modals-and-modes', 'rendering', 'theme-and-shortcuts']
    .map((name) => fs.readFileSync(new URL(`../js/legacy/${name}.js`, import.meta.url), 'utf8'))
    .join('\n');

/**
 * Minimal DOM stand-in for js/ui/dialog-focus.js: focusable elements, a dialog that owns
 * them, a document that tracks focus, and window keydown listeners.
 */
function createDialogHarness() {
    /** @type {Array<(event: any) => void>} */
    const keydownListeners = [];
    /** @type {Array<() => void>} */
    const frames = [];
    const doc = { activeElement: /** @type {any} */ (null) };
    class FakeElement {
        /** @param {string} name */
        constructor(name) { this.name = name; this.isConnected = true; }
        focus() { doc.activeElement = this; }
        getClientRects() { return [{}]; }
    }
    /** @param {string[]} names */
    function createDialog(names) {
        const items = names.map((name) => new FakeElement(name));
        return {
            items,
            /** @param {any} el */
            contains(el) { return items.includes(el); },
            querySelectorAll() { return items; },
            /** @param {string} selector */
            querySelector(selector) { return items.find((item) => `#${item.name}` === selector) || null; }
        };
    }
    Object.assign(globalThis, {
        document: doc,
        HTMLElement: FakeElement,
        window: {
            /** @param {string} type @param {(event: any) => void} listener */
            addEventListener(type, listener) { if (type === 'keydown') keydownListeners.push(listener); }
        },
        /** @param {() => void} callback */
        requestAnimationFrame(callback) { frames.push(callback); return frames.length; }
    });
    /** @param {string} key @param {{ shiftKey?: boolean }} [options] */
    function press(key, { shiftKey = false } = {}) {
        const event = {
            key,
            shiftKey,
            isComposing: false,
            defaultPrevented: false,
            stopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopImmediatePropagation() { this.stopped = true; }
        };
        keydownListeners.forEach((listener) => listener(event));
        return event;
    }
    const flushFrames = () => frames.splice(0).forEach((callback) => callback());
    return { doc, FakeElement, createDialog, press, flushFrames };
}

test('legacy modals move focus in, keep Tab inside, close on Escape and restore focus', async () => {
    const harness = createDialogHarness();
    const { init, openDialog, closeDialog } = await import('../js/ui/dialog-focus.js');
    init();

    const opener = new harness.FakeElement('row-edit-button');
    opener.focus();
    const dialog = harness.createDialog(['close', 'title', 'save']);
    let escapes = 0;
    openDialog(dialog, { onEscape: () => { escapes += 1; closeDialog(dialog); } });
    harness.flushFrames();
    assert.equal(harness.doc.activeElement, dialog.items[0], 'focus should land inside the dialog');

    dialog.items[2].focus();
    assert.equal(harness.press('Tab').defaultPrevented, true);
    assert.equal(harness.doc.activeElement, dialog.items[0], 'Tab from the last control wraps to the first');
    harness.press('Tab', { shiftKey: true });
    assert.equal(harness.doc.activeElement, dialog.items[2], 'Shift+Tab from the first control wraps to the last');

    opener.focus();
    harness.press('Tab');
    assert.equal(harness.doc.activeElement, dialog.items[0], 'Tab from outside is pulled back into the dialog');

    const escape = harness.press('Escape');
    assert.equal(escapes, 1);
    assert.equal(escape.stopped, true, 'Escape must not also reach the app-level mode handlers');
    assert.equal(harness.doc.activeElement, opener, 'closing returns focus to the opener');

    harness.press('Escape');
    assert.equal(escapes, 1, 'a closed dialog no longer handles Escape');
});

test('every legacy modal is a labelled dialog wired to the shared focus helper', () => {
    for (const id of ['edit-modal', 'delete-confirm-modal', 'shortcuts-modal', 'playlist-modal']) {
        const tag = html.match(new RegExp(`<div id="${id}"[^>]*>`));
        assert.ok(tag, `${id} markup should exist`);
        assert.match(tag[0], /role="dialog"/, `${id} needs role="dialog"`);
        assert.match(tag[0], /aria-modal="true"/, `${id} needs aria-modal`);
        const labelledBy = tag[0].match(/aria-labelledby="([^"]+)"/);
        assert.ok(labelledBy, `${id} needs aria-labelledby`);
        assert.match(html, new RegExp(`id="${labelledBy[1]}"`), `${id} label element should exist`);
        assert.match(legacySources, new RegExp(`NexPlayDialogs\\?\\.openDialog\\(document\\.getElementById\\('${id}'\\)`), `${id} should open through the helper`);
        assert.match(legacySources, new RegExp(`NexPlayDialogs\\?\\.closeDialog\\(document\\.getElementById\\('${id}'\\)`), `${id} should close through the helper`);
    }
    const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
    assert.match(app, /\['ui\/dialog-focus', initDialogFocus\]/);
});

test('settings help tooltips near the right edge open leftwards instead of overflowing', async () => {
    /**
     * @param {number} triggerLeft
     * @param {number} width
     * @param {{ centered?: boolean }} [options]
     */
    function createTooltip(triggerLeft, width, { centered = false } = {}) {
        const classes = new Set(['setting-help-tooltip']);
        if (centered) classes.add('align-center');
        const triggerRect = { left: triggerLeft, right: triggerLeft + 16 };
        const startLeft = centered ? triggerLeft + 8 - width / 2 : triggerLeft;
        return {
            classList: {
                /** @param {string} name */
                add(name) { classes.add(name); },
                /** @param {string} name */
                remove(name) { classes.delete(name); },
                /** @param {string} name */
                contains(name) { return classes.has(name); }
            },
            parentElement: { getBoundingClientRect: () => triggerRect },
            getBoundingClientRect() {
                const left = classes.has('align-end') ? triggerRect.right - width : startLeft;
                return { left, right: left + width, width };
            }
        };
    }
    const scroller = { clientLeft: 0, clientWidth: 1084, getBoundingClientRect: () => ({ left: 320 }) };
    const fits = createTooltip(400, 304);
    const overflows = createTooltip(1278, 304);
    const staleFlip = createTooltip(500, 304);
    staleFlip.classList.add('align-end');
    const centeredOverflow = createTooltip(1300, 256, { centered: true });
    const root = {
        /** @param {string} selector */
        querySelectorAll(selector) {
            return [fits, overflows, staleFlip, centeredOverflow].filter((tooltip) =>
                !(selector.includes(':not(.align-center)') && tooltip.classList.contains('align-center')));
        }
    };
    Object.assign(globalThis, {
        document: { getElementById: (/** @type {string} */ id) => (id === 'main-scroll-area' ? scroller : null) }
    });

    const { alignSettingHelpTooltips } = await import('../js/ui/setting-help-tooltips.js');
    alignSettingHelpTooltips(root);

    assert.equal(fits.classList.contains('align-end'), false);
    assert.equal(overflows.classList.contains('align-end'), true, 'a tooltip past the right edge flips');
    assert.ok(overflows.getBoundingClientRect().right <= 320 + 1084);
    assert.equal(staleFlip.classList.contains('align-end'), false, 'a flip is dropped once the tooltip fits again');
    assert.equal(centeredOverflow.classList.contains('align-end'), true, 'centered tooltips flip too');

    const flat = css.replace(/\s+/g, ' ');
    assert.match(flat, /\.setting-help-tooltip\.align-end, \.setting-help-tooltip\.align-center\.align-end \{ left: auto; right: 0; transform: translateY\(8px\); \}/);
    assert.match(flat, /\.setting-help-trigger:hover \.setting-help-tooltip\.align-center\.align-end, \.setting-help-trigger:focus-visible \.setting-help-tooltip\.align-center\.align-end \{ transform: translateY\(0\); \}/);
    const settingsSource = fs.readFileSync(new URL('../js/legacy/settings-and-video.js', import.meta.url), 'utf8');
    assert.match(settingsSource, /refreshLucideIcons\(\);\s*window\.NexPlaySettingHelp\?\.align\(els\.tracksContainer\);\s*\}/);
});

test('the sidebar nav can scroll its last item clear of the floating player where they overlap', () => {
    const flat = css.replace(/\s+/g, ' ');
    // The static sidebar appears at 1024px; the 64rem player stops reaching it at 1632px.
    const block = flat.match(/@media \(min-width: 1024px\) and \(max-width: 1631px\) \{ #sidebar > \.overflow-y-auto \{ padding-bottom: (\d+(?:\.\d+)?)rem; \} \}/);
    assert.ok(block, 'sidebar nav needs extra bottom padding while the player overlaps it');
    // Default padding is 1.5rem and the player reaches ~35px (2.2rem) into the nav.
    assert.ok(Number(block[1]) >= 4, `padding ${block[1]}rem does not clear the player`);
});

test('the mini player "Next:" line stays one quiet line under the progress bar', () => {
    const peek = html.match(/<div id="mini-queue-peek" class="([^"]*)"><\/div>/);
    assert.ok(peek, 'mini-queue-peek markup should exist');
    const classes = peek[1].split(/\s+/);
    assert.ok(classes.includes('hidden'), 'stays hidden until the queue renders it');
    assert.ok(classes.includes('truncate'), 'long titles must truncate instead of wrapping the dock taller');
    // Same voice as the artist and time labels around it, not louder than the track title.
    for (const name of ['text-[10px]', 'font-mono', 'text-gray-500']) {
        assert.ok(classes.includes(name), `mini-queue-peek should use ${name}`);
    }
});

test('saving edited metadata refreshes the mini player "Next:" line', async () => {
    const modesSource = fs.readFileSync(new URL('../js/legacy/modals-and-modes.js', import.meta.url), 'utf8');
    const start = modesSource.indexOf('async function saveEdit(');
    const end = modesSource.indexOf('function optimizeCoverDataUrl(', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    /** @type {Record<string, any>} */
    const fields = {
        'edit-title': { value: 'Renamed Track' },
        'edit-artist': { value: 'Artist' },
        'edit-tags': { value: '' },
        'edit-cover': { files: [] }
    };
    const calls = { peek: 0 };
    const noop = () => {};
    const context = vm.createContext({
        state: { editingTrackId: 'next', tracks: [{ id: 'next', title: 'Old Title', artist: 'Artist', source: 'local' }], activeTab: 'all' },
        document: { getElementById: (/** @type {string} */ id) => fields[id] || null },
        sanitizeText: (/** @type {string} */ value) => String(value || '').trim(),
        isOnlineMusicTrackRecord: () => false,
        isCurrentLibraryTrack: () => false,
        persistTrackMetadata: noop,
        updateTrackUI: noop,
        applyCoverAccent: noop,
        renderTracks: noop,
        renderOnlineMusicContent: noop,
        showToast: noop,
        persistAppStateNow: noop,
        closeEditModal: noop,
        console,
        renderMiniQueuePeek: () => { calls.peek += 1; }
    });
    new vm.Script(`${modesSource.slice(start, end)}\nglobalThis.__saveEdit = saveEdit;`).runInContext(context);
    await context.__saveEdit();
    assert.equal(context.state.tracks[0].title, 'Renamed Track');
    assert.equal(calls.peek, 1, 'the queued title shown as "Next:" must not go stale');
});

test('switching tracks re-renders the "Next:" line from the newly current track', () => {
    // loadTrack commits the new queue while the previous track is still current, so the
    // line rendered during that commit describes the old position (e.g. "Queue empty"
    // when the previous track was last). It must be rendered again after the switch.
    const playerSource = fs.readFileSync(new URL('../js/legacy/player.js', import.meta.url), 'utf8');
    assert.match(playerSource, /normalizeRuntimeState\(\{ allowStopWhenQueueEmpty: false \}\);\s*renderMiniQueuePeek\(\);\s*logAction\('source-switch-finish'/);
});

test('the standby mini player starts with its empty cover hidden, not a broken image', () => {
    // The markup ships "Standby / NexPlay OS" with no cover yet; every runtime path that
    // clears the cover (resetMusicGamePlayerShell, updateTrackUI) also hides the image.
    const cover = html.match(/<img id="mini-cover"[^>]*>/);
    assert.ok(cover, 'mini-cover markup should exist');
    assert.match(cover[0], /src=""/);
    assert.match(cover[0], /class="[^"]*\bhidden\b/, 'an empty src must not render as a broken image');
});

test('grid cards are never narrower than their five hover actions', () => {
    // The hover bar holds five p-2.5 buttons with w-5 icons (40px each) and gap-2, and
    // sits 0.75rem in from the card edge. Breakpoint columns (lg:grid-cols-5) squeezed
    // cards to 105-207px beside the sidebar, pushing the bar out of the clipped card.
    const renderingSource = fs.readFileSync(new URL('../js/legacy/rendering.js', import.meta.url), 'utf8');
    assert.match(renderingSource, /state\.viewMode === 'grid' \? 'grid library-grid gap-6'/);
    assert.doesNotMatch(renderingSource, /lg:grid-cols-5 gap-6/);

    const columns = declarationsFor(/^\.library-grid$/).match(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\((\d+(?:\.\d+)?)rem,\s*1fr\)\)/);
    assert.ok(columns, 'grid view should fill columns by available width');
    const barWidthPx = 5 * 40 + 4 * 8;
    const minimumCardPx = barWidthPx + 2 * 12;
    assert.ok(Number(columns[1]) * 16 >= minimumCardPx, `cards of ${columns[1]}rem cannot hold the ${barWidthPx}px action bar`);
});

test('narrow library list rows keep a readable title column instead of collapsing it', () => {
    const row = declarationsFor(/^\.library-track-item\[data-view="list"\]$/);
    assert.match(row, /flex-wrap:\s*wrap/, 'actions should be able to drop below the title');

    const titleCluster = declarationsFor(/^\.library-track-item\[data-view="list"\]\s*>\s*:first-child$/);
    const basis = titleCluster.match(/flex:\s*1\s+1\s+(\d+(?:\.\d+)?)rem/);
    assert.ok(basis, 'title cluster needs a rem flex-basis so it cannot shrink to zero');
    // Checkbox gutter (1.25rem) + cover (3rem) + two 1rem gaps leave the title at least 6rem.
    assert.ok(Number(basis[1]) >= 12, `title cluster basis ${basis[1]}rem leaves the title too narrow`);

    const actions = declarationsFor(/^\.library-track-item\[data-view="list"\]\s*>\s*:last-child$/);
    assert.match(actions, /margin-left:\s*auto/, 'wrapped actions should stay right-aligned');
});
