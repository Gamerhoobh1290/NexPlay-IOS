export function readStorageValue(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (_) {
        return fallback;
    }
}

export function writeStorageValue(key, value) {
    try {
        localStorage.setItem(key, String(value ?? ''));
        return true;
    } catch (_) {
        return false;
    }
}

export function readStorageJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

export function writeStorageJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (_) {
        return false;
    }
}

export function init() {
    window.NexPlayStorage = { readStorageValue, writeStorageValue, readStorageJson, writeStorageJson };
    return window.NexPlayStorage;
}
