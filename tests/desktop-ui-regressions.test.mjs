import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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
