import { getAudioContext } from '../core/audio-context.js';

export function init() {
    window.NexPlayVisualizer = { getAudioContext };
    return window.NexPlayVisualizer;
}
