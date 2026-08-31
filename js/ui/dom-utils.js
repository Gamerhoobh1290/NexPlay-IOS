export function $(selector, root = document) {
    return root.querySelector(selector);
}

export function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

export function on(target, eventName, handler, options) {
    if (!target || typeof handler !== 'function') return () => {};
    target.addEventListener(eventName, handler, options);
    return () => target.removeEventListener(eventName, handler, options);
}

export function init() {
    window.NexPlayDom = { $, $$, on };
    return window.NexPlayDom;
}
