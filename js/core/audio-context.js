let audioContext = null;

export function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioContext = new AudioContextCtor();
    return audioContext;
}

export async function resumeAudioContext() {
    const context = getAudioContext();
    if (context && context.state === 'suspended') await context.resume();
    return context;
}

export function init() {
    window.NexPlayAudioContext = { getAudioContext, resumeAudioContext };
    return window.NexPlayAudioContext;
}
