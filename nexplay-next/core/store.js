/** @import { AppState } from './types.js' */

/**
 * @typedef {Object} StoreAction
 * @property {string} type
 * @property {any=} payload
 */

/**
 * @typedef {(state: AppState, action: StoreAction) => AppState} Reducer
 */

/**
 * @param {AppState} initialState
 * @param {Reducer} reducer
 */
export function createStore(initialState, reducer) {
    /** @type {AppState} */
    let state = freezeState({ ...initialState });
    /** @type {Set<(state: AppState, action: StoreAction) => void>} */
    const listeners = new Set();

    return {
        /** @type {(...args: any[]) => any} */
        getState() {
            return state;
        },
        /** @type {(...args: any[]) => any} */
        dispatch(action) {
            const prev = state;
            const next = reducer(prev, action);
            if (next !== prev) {
                state = freezeState(next);
                listeners.forEach((/** @type {any} */ listener) => listener(state, action));
            }
            return action;
        },
        /** @type {(...args: any[]) => any} */
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        /** @type {(...args: any[]) => any} */
        replaceState(nextState) {
            state = freezeState(nextState);
            listeners.forEach((/** @type {any} */ listener) => listener(state, { type: 'store/replace' }));
        }
    };
}

/**
 * @param {AppState} state
 * @returns {AppState}
 */
function freezeState(state) {
    return Object.freeze({ ...state, version: (state.version || 0) + 1 });
}

/**
 * @returns {Reducer}
 */
export function createRootReducer() {
    return (/** @type {any} */ state, /** @type {any} */ action) => {
        switch (action.type) {
            case 'tracks/upsertMany': {
                const incoming = Array.isArray(action.payload) ? action.payload : [];
                const map = new Map((state.tracks || []).map((/** @type {any} */ track) => [track.id, track]));
                incoming.forEach((/** @type {any} */ track) => {
                    map.set(track.id, {
                        ...map.get(track.id),
                        ...track,
                        updatedAt: Date.now()
                    });
                });
                return { ...state, tracks: Array.from(map.values()) };
            }
            case 'playlists/upsertMany': {
                const incoming = Array.isArray(action.payload) ? action.payload : [];
                const map = new Map((state.playlists || []).map((/** @type {any} */ playlist) => [playlist.id, playlist]));
                incoming.forEach((/** @type {any} */ playlist) => {
                    map.set(playlist.id, {
                        ...map.get(playlist.id),
                        ...playlist,
                        updatedAt: Date.now()
                    });
                });
                return { ...state, playlists: Array.from(map.values()) };
            }
            case 'settings/patch': {
                const patch = action.payload && typeof action.payload === 'object' ? action.payload : {};
                return { ...state, settings: { ...state.settings, ...patch } };
            }
            case 'history/append': {
                const ids = Array.isArray(action.payload) ? action.payload : [action.payload];
                const merged = [...ids.filter(Boolean), ...(state.history || [])];
                return { ...state, history: Array.from(new Set(merged)).slice(0, 250) };
            }
            case 'automation/setRules': {
                const rules = Array.isArray(action.payload) ? action.payload : [];
                return { ...state, automationRules: rules.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => (a.priority || 0) - (b.priority || 0)) };
            }
            case 'queue/set': {
                return { ...state, queue: { ...state.queue, ...(action.payload || {}) } };
            }
            case 'playback/patch': {
                return { ...state, playback: { ...state.playback, ...(action.payload || {}) } };
            }
            default:
                return state;
        }
    };
}

/**
 * @returns {AppState}
 */
export function createDefaultAppState() {
    return {
        tracks: [],
        playlists: [],
        queue: {
            queue: [],
            queueSource: 'auto',
            isShuffle: false,
            repeatMode: 'none',
            shuffleQueue: [],
            shuffleIndex: -1
        },
        playback: {
            currentTrackId: null,
            isPlaying: false,
            volume: 0.8,
            playbackSpeed: 1,
            windowedModeActive: false,
            fsModeActive: false,
            videoFsModeActive: false
        },
        settings: {
            accentColor: '#06b6d4',
            autoAccentFromArt: false,
            isDarkMode: true,
            viewMode: 'list',
            sortType: 'date',
            sortDirection: 'desc',
            visualizerStyle: 'bars'
        },
        history: [],
        lyrics: {},
        automationRules: [],
        metadata: {},
        version: 0
    };
}
