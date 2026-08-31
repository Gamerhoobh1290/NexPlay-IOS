import { getPlaybackState } from '../core/audio.js';

export function init() {
    window.NexPlayPlayer = { getPlaybackState };
    return window.NexPlayPlayer;
}
