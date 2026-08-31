const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * @param {HTMLElement} container
 */
export function createFocusTrap(container) {
    /** @type {HTMLElement|null} */
    let lastFocused = null;
    let isActive = false;

    const onKeyDown = (event) => {
        if (event.key !== 'Tab') return;
        const focusable = getFocusable(container);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = /** @type {HTMLElement|null} */ (document.activeElement);

        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return {
        activate() {
            if (isActive) return;
            isActive = true;
            lastFocused = /** @type {HTMLElement|null} */ (document.activeElement);
            container.addEventListener('keydown', onKeyDown);
            const focusable = getFocusable(container);
            (focusable[0] || container).focus();
        },
        deactivate() {
            if (!isActive) return;
            isActive = false;
            container.removeEventListener('keydown', onKeyDown);
            if (lastFocused && document.contains(lastFocused) && typeof lastFocused.focus === 'function') {
                lastFocused.focus();
            }
        }
    };
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getFocusable(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
        const item = /** @type {HTMLElement} */ (element);
        if (item.hasAttribute('hidden')) return false;
        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const style = window.getComputedStyle(item);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }
        }
        return item.getClientRects().length > 0;
    });
}
