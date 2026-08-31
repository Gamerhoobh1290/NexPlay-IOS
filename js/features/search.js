import { setState } from '../core/state.js';

export function setSearchQuery(query = '') {
    setState({ searchQuery: String(query || '') }, 'search:set-query');
}

export function init() {
    window.NexPlaySearch = { setSearchQuery };
    return window.NexPlaySearch;
}
