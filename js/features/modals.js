export function init() {
    window.NexPlayModals = {
        openPlaylistModal: (...args) => window.NexPlayLegacy?.actions?.openPlaylistModal?.(...args)
    };
    return window.NexPlayModals;
}
