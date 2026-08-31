export function init() {
    window.NexPlayKeyboardShortcuts = {
        dispatch: (action, payload) => window.NexPlayLegacy?.dispatchAction?.(action, payload)
    };
    return window.NexPlayKeyboardShortcuts;
}
