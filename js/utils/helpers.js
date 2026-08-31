export function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
}

export function noop() {}

export function init() {
    window.NexPlayHelpers = { clamp, noop };
    return window.NexPlayHelpers;
}
