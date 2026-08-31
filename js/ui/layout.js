import { $ } from './dom-utils.js';

export function getMainSurfaces() {
    return {
        sidebar: $('#sidebar'),
        tracksContainer: $('#tracks-container'),
        miniPlayer: $('#mini-player')
    };
}

export function init() {
    window.NexPlayLayout = { getMainSurfaces };
    return window.NexPlayLayout;
}
