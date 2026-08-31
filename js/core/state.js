const subscribers = new Set();
let currentState = {};

export function getState() {
    const legacyState = window.NexPlayLegacy?.getState?.();
    return legacyState || currentState;
}

export function setState(update, reason = 'state:update') {
    const previous = getState();
    const patch = typeof update === 'function' ? update(previous) : update;
    currentState = Object.freeze({
        ...(previous && typeof previous === 'object' ? previous : {}),
        ...(patch && typeof patch === 'object' ? patch : {})
    });
    for (const listener of subscribers) {
        try {
            listener(currentState, previous, reason);
        } catch (error) {
            window.dispatchEvent(new CustomEvent('nexplay:module-error', { detail: { module: 'core/state', error } }));
        }
    }
    return currentState;
}

export function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    return () => subscribers.delete(listener);
}

export function syncFromLegacy(reason = 'legacy:sync') {
    const legacyState = window.NexPlayLegacy?.getState?.();
    if (legacyState && typeof legacyState === 'object') {
        currentState = legacyState;
        for (const listener of subscribers) listener(currentState, currentState, reason);
    }
    return currentState;
}

export function init() {
    syncFromLegacy('state:init');
    window.NexPlayState = { getState, setState, subscribe, syncFromLegacy };
    return window.NexPlayState;
}
