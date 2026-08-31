export function init() {
    window.NexPlaySidebar = { render: () => window.NexPlayLegacy?.actions?.renderNav?.() };
    return window.NexPlaySidebar;
}
