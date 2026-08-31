export const DEFAULT_FLAGS = Object.freeze({
    use_new_store: true,
    use_virtual_list: false,
    use_sync: true,
    use_command_palette: true,
    use_automation: true,
    use_plugins: true,
    use_observability: true,
    use_macro_recorder: true,
    use_smart_search: true,
    use_worker_enrichment: true,
    use_fs_library: true,
    use_pwa: true
});

const FLAG_STORAGE_KEY = 'nexplay_feature_flags';

/**
 * @returns {Record<string, boolean>}
 */
export function resolveFeatureFlags() {
    let stored = {};
    try {
        const raw = localStorage.getItem(FLAG_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                stored = parsed;
            }
        }
    } catch (_) {
        stored = {};
    }

    const globalFlags = (window.NEXPLAY_FLAGS && typeof window.NEXPLAY_FLAGS === 'object') ? window.NEXPLAY_FLAGS : {};
    /** @type {Record<string, any>} */
    const merged = { ...DEFAULT_FLAGS, ...stored, ...globalFlags };

    /** @type {Record<string, boolean>} */
    const normalized = {};
    Object.keys(merged).forEach((/** @type {any} */ key) => {
        normalized[key] = Boolean(merged[key]);
    });

    return normalized;
}

/**
 * @param {string} flag
 * @param {boolean} value
 */
export function setFeatureFlag(flag, value) {
    const existing = resolveFeatureFlags();
    const next = { ...existing, [flag]: Boolean(value) };
    localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify(next));
    window.NEXPLAY_FLAGS = next;
}

export function listFeatureFlags() {
    return Object.keys(DEFAULT_FLAGS);
}
