import { getState } from './state.js';
import { resumeAudioContext } from './audio-context.js';

export function getAudioElement() {
    return window.NexPlayLegacy?.getElements?.()?.audio || document.getElementById('main-audio-element');
}

export async function ensureAudioReady() {
    await resumeAudioContext();
    return getAudioElement();
}

export function getPlaybackState() {
    const state = getState();
    return {
        isPlaying: !!state?.isPlaying,
        currentTrackId: state?.currentTrackId || null,
        source: state?.currentPlaybackSource || 'local'
    };
}

export function init() {
    window.NexPlayAudio = { getAudioElement, ensureAudioReady, getPlaybackState };
    return window.NexPlayAudio;
}
