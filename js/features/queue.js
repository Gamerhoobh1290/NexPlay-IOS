export function init() {
    window.NexPlayQueue = { add: (...args) => window.NexPlayLegacy?.actions?.addToQueue?.(...args) };
    return window.NexPlayQueue;
}
