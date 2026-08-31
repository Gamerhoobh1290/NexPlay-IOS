/** @import { AppState, Track } from './types.js' */

/**
 * @typedef {Object} TrackFilter
 * @property {'all' | 'audio' | 'video' | 'favorites'=} media
 * @property {string=} query
 * @property {string=} tag
 * @property {'date' | 'name' | 'size'=} sortType
 * @property {'asc' | 'desc'=} sortDirection
 */

/** @type {Map<string, {version: number, result: Track[]}>} */
const memo = new Map();

/**
 * @param {AppState} state
 * @param {TrackFilter=} filter
 * @returns {Track[]}
 */
export function selectTracks(state, filter = {}) {
    const key = JSON.stringify({
        media: filter.media || 'all',
        query: (filter.query || '').toLowerCase(),
        tag: filter.tag || '',
        sortType: filter.sortType || state.settings.sortType,
        sortDirection: filter.sortDirection || state.settings.sortDirection
    });

    const cached = memo.get(key);
    if (cached && cached.version === state.version) {
        return cached.result;
    }

    const query = (filter.query || '').toLowerCase().trim();
    let tracks = (state.tracks || []).slice();

    if (filter.media === 'audio') tracks = tracks.filter((track) => track.type === 'audio');
    if (filter.media === 'video') tracks = tracks.filter((track) => track.type === 'video');
    if (filter.media === 'favorites') tracks = tracks.filter((track) => Boolean(track.isFavorite));
    if (filter.tag) tracks = tracks.filter((track) => Array.isArray(track.tags) && track.tags.includes(filter.tag || ''));

    if (query) {
        tracks = tracks.filter((track) => {
            const title = (track.title || '').toLowerCase();
            const artist = (track.artist || '').toLowerCase();
            return title.includes(query) || artist.includes(query);
        });
    }

    const sortType = filter.sortType || state.settings.sortType;
    const sortDirection = filter.sortDirection || state.settings.sortDirection;

    tracks.sort((left, right) => {
        let value = 0;
        if (sortType === 'name') value = (left.title || '').localeCompare(right.title || '');
        else if (sortType === 'size') value = (left.size || 0) - (right.size || 0);
        else value = (left.addedAt || 0) - (right.addedAt || 0);
        return sortDirection === 'desc' ? -value : value;
    });

    memo.set(key, { version: state.version, result: tracks });
    return tracks;
}

/**
 * @param {AppState} state
 * @returns {Track|null}
 */
export function selectCurrentTrack(state) {
    if (!state.playback.currentTrackId) return null;
    return state.tracks.find((track) => track.id === state.playback.currentTrackId) || null;
}

/**
 * @param {AppState} state
 */
export function selectQueuePreview(state) {
    const first = (state.queue.queue || [])[0] || null;
    if (!first) return null;
    return state.tracks.find((track) => track.id === first) || null;
}
