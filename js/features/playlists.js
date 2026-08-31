export function init() {
    window.NexPlayPlaylists = { open: (...args) => window.NexPlayLegacy?.actions?.openPlaylist?.(...args) };
    return window.NexPlayPlaylists;
}
