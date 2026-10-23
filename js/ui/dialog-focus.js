// Keyboard behavior for the legacy modal overlays: focus moves into a dialog when it
// opens, Tab and Shift+Tab stay inside it, Escape dismisses it, and focus returns to
// whatever opened it once it closes.
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

/** @type {Array<{ dialog: any, onEscape?: () => void, returnFocus: any }>} */
const openDialogs = [];

/** @param {any} dialog @returns {any[]} */
function focusableIn(dialog) {
    return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter((element) => element.getClientRects().length > 0);
}

/** @param {KeyboardEvent} event */
function handleKeydown(event) {
    const top = openDialogs[openDialogs.length - 1];
    if (!top || event.isComposing) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        top.onEscape?.();
        return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableIn(top.dialog);
    if (!items.length) {
        event.preventDefault();
        return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!top.dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

/**
 * @param {any} dialog
 * @param {{ onEscape?: () => void, initialFocus?: string }} [options]
 */
export function openDialog(dialog, { onEscape, initialFocus } = {}) {
    if (!dialog || openDialogs.some((entry) => entry.dialog === dialog)) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry = { dialog, onEscape, returnFocus };
    openDialogs.push(entry);
    requestAnimationFrame(() => {
        if (!openDialogs.includes(entry)) return;
        const target = (initialFocus && dialog.querySelector(initialFocus)) || focusableIn(dialog)[0];
        target?.focus();
    });
}

/** @param {any} dialog */
export function closeDialog(dialog) {
    const index = openDialogs.findIndex((entry) => entry.dialog === dialog);
    if (index === -1) return;
    const [{ returnFocus }] = openDialogs.splice(index, 1);
    if (returnFocus?.isConnected) returnFocus.focus();
}

export function init() {
    window.addEventListener('keydown', handleKeydown, true);
    window.NexPlayDialogs = { openDialog, closeDialog };
    return window.NexPlayDialogs;
}
