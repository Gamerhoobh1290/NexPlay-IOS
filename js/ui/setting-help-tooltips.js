// Settings help tooltips open rightwards from (or centered on) their trigger. When a
// trigger sits near the right edge of the scroll area that pushes its tooltip past the
// edge, where it is cut off and (even while hidden) makes the whole area scroll
// sideways. Flip those tooltips to open leftwards from the trigger instead.

/** @param {any} [root] */
export function alignSettingHelpTooltips(root = document) {
    const scroller = document.getElementById('main-scroll-area');
    if (!root || !scroller) return;
    /** @type {any[]} */
    const tooltips = Array.from(root.querySelectorAll('.setting-help-tooltip'));
    tooltips.forEach((tooltip) => tooltip.classList.remove('align-end'));
    const left = scroller.getBoundingClientRect().left + scroller.clientLeft;
    const right = left + scroller.clientWidth;
    tooltips
        .filter((tooltip) => {
            const rect = tooltip.getBoundingClientRect();
            const overflowRight = rect.right - right;
            if (overflowRight <= 0) return false;
            const flippedLeft = tooltip.parentElement.getBoundingClientRect().right - rect.width;
            return left - flippedLeft < overflowRight;
        })
        .forEach((tooltip) => tooltip.classList.add('align-end'));
}

export function init() {
    let frame = 0;
    window.addEventListener('resize', () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => alignSettingHelpTooltips());
    }, { passive: true });
    window.NexPlaySettingHelp = { align: alignSettingHelpTooltips };
    return window.NexPlaySettingHelp;
}
