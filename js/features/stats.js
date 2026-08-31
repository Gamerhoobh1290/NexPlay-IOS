import { getState } from '../core/state.js';

export function getStatsSnapshot() {
    const state = getState();
    return {
        totalListeningTime: state?.totalListeningTime || 0,
        trackCount: Array.isArray(state?.tracks) ? state.tracks.length : 0
    };
}

export function init() {
    window.NexPlayStats = { getStatsSnapshot };
    return window.NexPlayStats;
}
